import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { OperationData, Barrel } from '../../types/logTypes';
import { ThumbnailTooltip } from './ThumbnailTooltip';
import { thumbnailApi, ThumbnailData } from '../../services/thumbnailApi';
import {
    calculateCornerSnappedPosition,
    getCandleRectFromPlotly,
    getCandleRectFromCursor,
    DEFAULT_TOOLTIP_WIDTH,
    DEFAULT_TOOLTIP_HEIGHT
} from './tooltipPositioning';
import { useLogAnalyzerLocalSettingsSafe } from '../../features/LogAnalyzer/context/LogAnalyzerLocalSettingsContext';

interface Props {
    barrel: Barrel;
    logFilePath?: string;
    onReady?: () => void;
    onNGClick?: (operation: OperationData) => void;
    mcId?: number;
}

const GRACE_PERIOD_MS = 100;

/**
 * Level 3 — Gantt chart for a single barrel's operations.
 *
 * Exact visual parity with OperationGanttChart:
 * - barmode: 'group' with offsetgroup 1 (ideal) + 2 (actual)
 * - Colors: amber #fbbf24 ideal, sky-blue #38bdf8 on-time, red #ef4444 delayed
 * - 4-item legend: Ideal Time, Actual (On Time), Actual (Delayed), NG Images
 * - Full tooltip: Start/End/Duration/Wait/Tray
 * - Zoom/pan state preserved via savedXRange/savedYRange
 * - Vertical marker line at barrelAlignStartTs
 * - ThumbnailTooltip with arrowDirection + grace period
 */
export default function BarrelGantt({ barrel, logFilePath, onReady, onNGClick, mcId }: Props) {
    const chartRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<ResizeObserver | null>(null);
    const resizeInProgress = useRef(false);
    const isFirstRender = useRef(true);

    const savedXRange = useRef<[number, number] | null>(null);
    const savedYRange = useRef<[number, number] | null>(null);

    // Thumbnail tooltip state (exact same pattern as OperationGanttChart)
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const [tooltipThumbnails, setTooltipThumbnails] = useState<ThumbnailData[]>([]);
    const [tooltipOperation, setTooltipOperation] = useState<OperationData | null>(null);
    const [tooltipAnchor, setTooltipAnchor] = useState<{ x: number, y: number } | undefined>(undefined);
    const [tooltipDirection, setTooltipDirection] = useState<'up' | 'down'>('up');

    const currentOperationIdRef = useRef<string | null>(null);
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const gracePeriodRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isHoveringTooltipRef = useRef(false);

    const { operations, barrelAlignStartTs, barrelId } = barrel;
    const { getIdealTime } = useLogAnalyzerLocalSettingsSafe();

    console.log(`[DEBUG] Barrel ${barrelId} operations count: ${operations.length}`);
    const missingLTA = !operations.find(o => o.operationName === 'Sequence_Lens_Tray_Align');
    if (missingLTA) {
        console.warn(`[DEBUG] Barrel ${barrelId} is missing Lens_Tray_Align!`);
    }

    const safeResize = useCallback(() => {
        if (!chartRef.current || resizeInProgress.current) return;
        resizeInProgress.current = true;
        Plotly.Plots.resize(chartRef.current)
            .then(() => { resizeInProgress.current = false; })
            .catch(() => { resizeInProgress.current = false; });
    }, []);

    const chartData = useMemo(() => {
        const sortedOps = [...operations].sort((a, b) => a.startTs - b.startTs);

        // Wait time computation (same as OperationGanttChart)
        const timeSorted = [...operations].sort((a, b) => a.startTs - b.startTs);
        const waitTimeMap = new Map<string, number>();
        timeSorted.forEach((op) => {
            const currentEndTime = op.endTs;
            const anyOtherStillRunning = timeSorted.some(other =>
                other.operationName !== op.operationName &&
                other.startTs < currentEndTime &&
                other.endTs > currentEndTime
            );
            if (anyOtherStillRunning) {
                waitTimeMap.set(op.operationName, 0);
            } else {
                const nextOp = timeSorted.find(other =>
                    other.startTs >= currentEndTime &&
                    other.operationName !== op.operationName
                );
                waitTimeMap.set(op.operationName, nextOp ? nextOp.startTs - currentEndTime : 0);
            }
        });

        const ngOpsMap = new Map<string, OperationData>();
        sortedOps.forEach(op => {
            if (op.isNg) ngOpsMap.set(op.operationName, op);
        });

        return { sortedOps, waitTimeMap, ngOpsMap };
    }, [operations]);

    const closeTooltip = useCallback(() => {
        setTooltipVisible(false);
        setTooltipThumbnails([]);
        setTooltipOperation(null);
        setTooltipAnchor(undefined);
        currentOperationIdRef.current = null;
    }, []);

    const handleTooltipMouseEnter = useCallback(() => {
        isHoveringTooltipRef.current = true;
        if (gracePeriodRef.current) {
            clearTimeout(gracePeriodRef.current);
            gracePeriodRef.current = null;
        }
    }, []);

    const handleTooltipMouseLeave = useCallback(() => {
        isHoveringTooltipRef.current = false;
        closeTooltip();
    }, [closeTooltip]);

    const legendStateRef = useRef<Record<string, boolean | 'legendonly'>>({
        'Ideal Time': true,
        'Actual (On Time)': true,
        'Actual (Delayed)': true,
        'NG Images': true,
        'Barrel Start': true
    });

    const updateChart = useCallback(() => {
        if (!chartRef.current || operations.length === 0) return;

        const { sortedOps, waitTimeMap, ngOpsMap } = chartData;
        const getWait = (name: string) => waitTimeMap.get(name) ?? 0;

        const cleanOpName = (name: string) => {
            return name.replace(/^Sequence_/i, '').replace(/_/g, ' ');
        };

        const barTextFont = {
            size: 11,
            color: '#78350f',
            family: 'JetBrains Mono, monospace',
            weight: 900
        };

        const getVisibility = (name: string) => legendStateRef.current[name] ?? true;

        // ── Ideal Time trace ──
        const idealTrace = {
            type: 'bar' as const,
            y: sortedOps.map(op => cleanOpName(op.operationName)),
            x: sortedOps.map(op => getIdealTime(op.operationName, op.idealMs)),
            base: sortedOps.map(op => op.startTs),
            name: 'Ideal Time',
            orientation: 'h' as const,
            offsetgroup: '1',
            marker: { color: '#fbbf24', line: { color: '#b45309', width: 1 } },
            text: sortedOps.map(op => `${getIdealTime(op.operationName, op.idealMs)}ms`),
            textposition: 'inside' as const,
            constraintext: 'none',
            textfont: { ...barTextFont, color: '#0f172a' },
            hoverinfo: 'text' as const,
            visible: getVisibility('Ideal Time'),
            hovertext: sortedOps.map(op =>
                `<b>${cleanOpName(op.operationName)}</b><br>Ideal Time: <b>${getIdealTime(op.operationName, op.idealMs)} ms</b>`
            )
        };

        // ── Actual (On Time) trace ──
        const onTimeTrace = {
            type: 'bar' as const,
            y: sortedOps.map(op => cleanOpName(op.operationName)),
            x: sortedOps.map(op => op.duration <= getIdealTime(op.operationName, op.idealMs) ? op.duration : null),
            base: sortedOps.map(op => op.startTs),
            name: 'Actual (On Time)',
            orientation: 'h' as const,
            offsetgroup: '2',
            marker: { color: '#38bdf8', line: { color: '#0369a1', width: 1 } },
            text: sortedOps.map(op => op.duration <= getIdealTime(op.operationName, op.idealMs) ? `${op.duration}ms` : ''),
            textposition: 'inside' as const,
            constraintext: 'none',
            visible: getVisibility('Actual (On Time)'),
            textfont: { ...barTextFont, color: '#0f172a' },
            customdata: sortedOps.map((op, idx) => [
                op.startTs,
                op.endTs,
                op.duration,
                getWait(op.operationName),
                op.operationName,
                op.barrelTrayId || '-',
                idx,  // sortedOps index for precise hover lookup
            ]),
            hovertemplate:
                '<b>%{y}</b><br>' +
                'Start: <b>%{customdata[0]} ms</b><br>' +
                'End: <b>%{customdata[1]} ms</b><br>' +
                'Duration: <b>%{customdata[2]} ms</b><br>' +
                'Wait: <b>%{customdata[3]} ms</b><br>' +
                'Tray: <b>%{customdata[5]}</b>' +
                '<extra></extra>'
        };

        // ── Actual (Delayed) trace ──
        const delayedTrace = {
            type: 'bar' as const,
            y: sortedOps.map(op => cleanOpName(op.operationName)),
            x: sortedOps.map(op => op.duration > getIdealTime(op.operationName, op.idealMs) ? op.duration : null),
            base: sortedOps.map(op => op.startTs),
            name: 'Actual (Delayed)',
            orientation: 'h' as const,
            offsetgroup: '2',
            marker: { color: '#ef4444', line: { color: '#dc2626', width: 1 } },
            text: sortedOps.map(op => op.duration > getIdealTime(op.operationName, op.idealMs) ? `${op.duration}ms` : ''),
            textposition: 'inside' as const,
            constraintext: 'none',
            visible: getVisibility('Actual (Delayed)'),
            textfont: { ...barTextFont, color: '#0f172a' },
            customdata: sortedOps.map((op, idx) => [
                op.startTs,
                op.endTs,
                op.duration,
                getWait(op.operationName),
                op.operationName,
                op.barrelTrayId || '-',
                idx,  // sortedOps index for precise hover lookup
            ]),
            hovertemplate:
                '<b>%{y}</b><br>' +
                'Start: <b>%{customdata[0]} ms</b><br>' +
                'End: <b>%{customdata[1]} ms</b><br>' +
                'Duration: <b>%{customdata[2]} ms</b><br>' +
                'Wait: <b>%{customdata[3]} ms</b><br>' +
                'Tray: <b>%{customdata[5]}</b><br>' +
                '⚠ Delayed' +
                '<extra></extra>'
        };

        // ── NG Images trace ──
        const ngOps = sortedOps.filter(op => op.isNg);
        const ngIconsTrace = {
            type: 'bar' as const,
            y: ngOps.map(op => cleanOpName(op.operationName)),
            base: ngOps.map(op => op.startTs),
            x: ngOps.map(op => op.duration),
            name: 'NG Images',
            orientation: 'h' as const,
            offsetgroup: '2',
            text: ngOps.map(() => '📷'),
            textposition: 'inside' as const,
            insidetextanchor: 'start' as const,
            textfont: { size: 24 },
            cliponaxis: true,
            marker: { color: 'rgba(0,0,0,0)' },
            visible: getVisibility('NG Images'),
            hoverinfo: 'skip' as const,
            showlegend: false,
            customdata: ngOps.map(op => {
                const sortedIdx = sortedOps.indexOf(op);
                return [op.operationName, sortedIdx];
            })
        };

        // ── Dummy marker trace for Barrel Start Legend ──
        const barrelStartTrace = {
            type: 'scatter' as const,
            mode: 'lines' as const,
            x: [null],
            y: [null],
            name: 'Barrel Start',
            line: { color: '#f59e0b', width: 2, dash: 'dash' },
            hoverinfo: 'none' as const,
            visible: barrelAlignStartTs > 0 ? getVisibility('Barrel Start') : false
        };

        const shapes: any[] = [];
        if (barrelAlignStartTs > 0 && getVisibility('Barrel Start')) {
            shapes.push({
                type: 'line',
                x0: barrelAlignStartTs,
                x1: barrelAlignStartTs,
                y0: 0,
                y1: 1,
                yref: 'paper',
                line: { color: '#f59e0b', width: 2, dash: 'dash' },
            });
        }

        const layout: Partial<Plotly.Layout> = {
            xaxis: {
                title: {
                    text: 'Execution Time (ms)',
                    font: { size: 12, color: '#f8fafc', family: 'Inter, sans-serif', weight: 600 },
                    standoff: 10
                },
                tickfont: { size: 10, color: '#94a3b8', family: 'JetBrains Mono, monospace' },
                gridcolor: '#334155',
                zeroline: false,
                automargin: true,
                // Start from first op minus 2% margin so bars touch the left edge
                range: savedXRange.current || (() => {
                    const minStart = Math.min(...sortedOps.map(op => op.startTs));
                    const maxEnd = Math.max(...sortedOps.map(op => op.endTs));
                    const margin = (maxEnd - minStart) * 0.02;
                    return [Math.max(0, minStart - margin), maxEnd + margin];
                })(),
                autorange: false,
            },
            yaxis: {
                title: {
                    text: 'Operation',
                    font: { size: 12, color: '#f8fafc', family: 'Inter, sans-serif', weight: 600 },
                    standoff: 10
                },
                tickfont: { size: 10, color: '#f8fafc', family: 'Inter, sans-serif' },
                automargin: true,
                showgrid: false,
                zeroline: false,
                range: savedYRange.current || [-0.5, sortedOps.length - 0.5],
                autorange: false,
            },
            barmode: 'group' as const,
            bargap: 0.06,
            bargroupgap: 0,
            plot_bgcolor: '#0b1121',
            paper_bgcolor: '#0b1121',
            margin: { l: 130, r: 10, t: 0, b: 40 },
            hovermode: 'closest' as const,
            showlegend: true,
            legend: {
                orientation: 'h' as const,
                x: 0,
                xanchor: 'left',
                y: 1.01,
                yanchor: 'bottom',
                font: { color: '#f8fafc', size: 10, family: 'Inter, sans-serif' },
                bgcolor: 'rgba(15, 23, 42, 0.9)',
                bordercolor: '#334155',
                borderwidth: 1
            },
            autosize: true,
            shapes,
        };

        const config: Partial<Plotly.Config> = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            scrollZoom: true,
            modeBarButtonsToRemove: ['toImage', 'sendDataToCloud', 'select2d', 'lasso2d']
        };

        requestAnimationFrame(() => {
            if (!chartRef.current) return;

            layout.uirevision = 'true';

            Plotly.react(
                chartRef.current,
                [idealTrace, onTimeTrace, delayedTrace, ngIconsTrace, barrelStartTrace],
                layout,
                config
            ).then(() => {
                const gd = chartRef.current as any;

                gd.removeAllListeners('plotly_legendclick');
                gd.removeAllListeners('plotly_legenddoubleclick');
                gd.removeAllListeners('plotly_click');
                gd.removeAllListeners('plotly_hover');
                gd.removeAllListeners('plotly_unhover');
                gd.removeAllListeners('plotly_relayout');

                // Zoom/pan state persistence
                gd.on('plotly_relayout', (_eventData: any) => {
                    if (gd.layout.xaxis && gd.layout.xaxis.range) {
                        savedXRange.current = gd.layout.xaxis.range;
                    }
                    if (gd.layout.yaxis && gd.layout.yaxis.range) {
                        savedYRange.current = gd.layout.yaxis.range;
                    }
                });

                // Legend toggle
                gd.on('plotly_legendclick', (data: any) => {
                    const traceName = data.curveNumber !== undefined ? data.data[data.curveNumber].name : null;
                    if (traceName) {
                        const currentVis = legendStateRef.current[traceName];
                        legendStateRef.current[traceName] = (currentVis === 'legendonly') ? true : 'legendonly';
                    }
                    return true;
                });

                gd.on('plotly_legenddoubleclick', (data: any) => {
                    const traceName = data.curveNumber !== undefined ? data.data[data.curveNumber].name : null;
                    if (traceName) {
                        Object.keys(legendStateRef.current).forEach(k => {
                            legendStateRef.current[k] = (k === traceName) ? true : 'legendonly';
                        });
                    }
                    return true;
                });

                // NG click handler
                if (onNGClick) {
                    gd.on('plotly_click', (data: any) => {
                        const point = data.points[0];
                        if (point && point.customdata) {
                            let opName;
                            if (point.data.name === 'NG Images') {
                                opName = point.customdata;
                            } else {
                                opName = point.customdata[4];
                            }

                            if (onNGClick) {
                                const ngOp = ngOpsMap.get(opName);
                                if (ngOp) onNGClick(ngOp);
                            }
                        }
                    });
                }

                // Thumbnail tooltip on hover
                gd.on('plotly_hover', async (data: any) => {
                    if (!data || !data.points || data.points.length === 0) return;

                    const point = data.points[0];
                    const curveName = point.data.name;

                    if (curveName === 'Actual (On Time)' || curveName === 'Actual (Delayed)' || curveName === 'NG Images') {
                        let opName;
                        let sortedOpsIndex: number | undefined;
                        if (curveName === 'NG Images') {
                            opName = point.customdata[0];
                            sortedOpsIndex = point.customdata[1];
                        } else {
                            opName = point.customdata[4];
                            sortedOpsIndex = point.customdata[6];
                        }

                        // Use sortedOps index for precise lookup (handles duplicate op names from retries)
                        const hoveredOp = sortedOpsIndex !== undefined
                            ? chartData.sortedOps[sortedOpsIndex]
                            : chartData.sortedOps.find(op => op.operationName === opName);

                        // Only show thumbnail tooltip for NG operations — non-NG ops have no images
                        if (hoveredOp && hoveredOp.isNg && logFilePath) {
                            currentOperationIdRef.current = opName;

                            if (hoverTimeoutRef.current) {
                                clearTimeout(hoverTimeoutRef.current);
                                hoverTimeoutRef.current = null;
                            }
                            if (gracePeriodRef.current) {
                                clearTimeout(gracePeriodRef.current);
                                gracePeriodRef.current = null;
                            }

                            const event = data.event;
                            if (!event) return;

                            const pointIndex = point.pointIndex;
                            const traceIndex = point.curveNumber;

                            let candleRect = getCandleRectFromPlotly(
                                chartRef.current,
                                pointIndex,
                                traceIndex
                            );

                            if (!candleRect) {
                                candleRect = getCandleRectFromCursor(event);
                            }

                            const position = calculateCornerSnappedPosition(
                                candleRect,
                                DEFAULT_TOOLTIP_WIDTH,
                                DEFAULT_TOOLTIP_HEIGHT
                            );

                            setTooltipAnchor({ x: position.x, y: position.y });
                            setTooltipDirection(position.arrowDirection);
                            setTooltipOperation(hoveredOp);

                            const capturedOpName = opName;
                            const capturedBarrelId = barrelId;
                            hoverTimeoutRef.current = setTimeout(async () => {
                                if (currentOperationIdRef.current !== capturedOpName) return;

                                const fileName = thumbnailApi.getLogFileName(logFilePath);
                                let thumbs = await thumbnailApi.getThumbnailsForOperation(fileName, capturedOpName, String(capturedBarrelId), hoveredOp.barrelTrayId);

                                if (currentOperationIdRef.current === capturedOpName && thumbs.length > 0) {
                                    setTooltipThumbnails(thumbs);
                                    setTooltipVisible(true);
                                }
                            }, 50);
                        }
                    }
                });

                gd.on('plotly_unhover', () => {
                    if (hoverTimeoutRef.current) {
                        clearTimeout(hoverTimeoutRef.current);
                        hoverTimeoutRef.current = null;
                    }

                    const unhoverOperationId = currentOperationIdRef.current;

                    gracePeriodRef.current = setTimeout(() => {
                        if (currentOperationIdRef.current === unhoverOperationId && !isHoveringTooltipRef.current) {
                            closeTooltip();
                        }
                    }, GRACE_PERIOD_MS);
                });

                Plotly.Plots.resize(chartRef.current!).then(() => {
                    if (onReady) onReady();
                });
            });
        });
    }, [operations, barrelId, barrelAlignStartTs, logFilePath, chartData, onReady, onNGClick, closeTooltip]);

    useEffect(() => {
        // Reset zoom when barrel changes
        savedXRange.current = null;
        savedYRange.current = null;
        updateChart();

        if (observerRef.current) observerRef.current.disconnect();
        observerRef.current = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.target === chartRef.current) {
                    if (isFirstRender.current) {
                        isFirstRender.current = false;
                        return;
                    }
                    window.requestAnimationFrame(() => safeResize());
                }
            }
        });

        if (chartRef.current) observerRef.current.observe(chartRef.current);

        return () => {
            if (observerRef.current) observerRef.current.disconnect();
            if (chartRef.current) Plotly.purge(chartRef.current);
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            if (gracePeriodRef.current) clearTimeout(gracePeriodRef.current);
        };
    }, [updateChart, safeResize]);

    return (
        <>
            <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
            <ThumbnailTooltip
                isVisible={tooltipVisible}
                thumbnails={tooltipThumbnails}
                anchorPosition={tooltipAnchor}
                arrowDirection={tooltipDirection}
                ngReason={tooltipOperation?.ngCode}
                onMouseEnter={handleTooltipMouseEnter}
                onMouseLeave={handleTooltipMouseLeave}
                mcId={mcId}
            />
        </>
    );
}
