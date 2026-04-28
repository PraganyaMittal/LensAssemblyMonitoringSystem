import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { OperationData } from '../../types/logTypes';
import { ThumbnailTooltip } from './ThumbnailTooltip';
import { thumbnailApi, ThumbnailData } from '../../services/thumbnailApi';
import {
    calculateCornerSnappedPosition,
    getCandleRectFromPlotly,
    getCandleRectFromCursor,
    DEFAULT_TOOLTIP_WIDTH,
    DEFAULT_TOOLTIP_HEIGHT
} from './tooltipPositioning';

interface Props {
    operations: OperationData[];
    barrelId: string;
    logFilePath?: string; 
    onReady?: () => void;
    onNGClick?: (operation: OperationData) => void; 
    onTrayLoadClick?: (operation: OperationData) => void; 
    mcId?: number; 
}

const GRACE_PERIOD_MS = 100;

export default function OperationGanttChart({ operations, barrelId, logFilePath, onReady, onNGClick, onTrayLoadClick, mcId }: Props) {
    const chartRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<ResizeObserver | null>(null);
    const resizeInProgress = useRef(false);
    const isFirstRender = useRef(true);
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const savedXRange = useRef<[number, number] | null>(null);
    const savedYRange = useRef<[number, number] | null>(null);

    const [tooltipVisible, setTooltipVisible] = useState(false);
    const [tooltipThumbnails, setTooltipThumbnails] = useState<ThumbnailData[]>([]);
    const [tooltipOperation, setTooltipOperation] = useState<OperationData | null>(null);
    const [tooltipAnchor, setTooltipAnchor] = useState<{ x: number, y: number } | undefined>(undefined);
    const [tooltipDirection, setTooltipDirection] = useState<'up' | 'down'>('up');

    const currentOperationIdRef = useRef<string | null>(null);
    const gracePeriodRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isHoveringTooltipRef = useRef(false);

    const safeResize = useCallback(() => {
        if (!chartRef.current || resizeInProgress.current) return;

        resizeInProgress.current = true;
        Plotly.Plots.resize(chartRef.current)
            .then(() => {
                resizeInProgress.current = false;
            })
            .catch(() => {
                resizeInProgress.current = false;
            });
    }, []);

    const chartData = useMemo(() => {
        
        const sortedOps = [...operations].sort((a, b) => a.sequence - b.sequence);

        const timeSorted = [...operations].sort((a, b) => a.startTime - b.startTime);
        const waitTimeMap = new Map<string, number>();

        timeSorted.forEach((op) => {
            const currentEndTime = op.endTime;
            const anyOtherStillRunning = timeSorted.some(other =>
                other.operationName !== op.operationName &&
                other.startTime < currentEndTime &&
                other.endTime > currentEndTime
            );

            if (anyOtherStillRunning) {
                waitTimeMap.set(op.operationName, 0);
            } else {
                const nextOp = timeSorted.find(other =>
                    other.startTime >= currentEndTime &&
                    other.operationName !== op.operationName
                );
                waitTimeMap.set(op.operationName, nextOp ? nextOp.startTime - currentEndTime : 0);
            }
        });

        const ngOpsMap = new Map<string, OperationData>();
        sortedOps.forEach(op => {
            if (op.isNG) {
                ngOpsMap.set(op.operationName, op);
            }
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
        'NG Images': true
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

        const getVisibility = (name: string) => {
            return legendStateRef.current[name] ?? true;
        };

        const idealTrace = {
            type: 'bar' as const,
            y: sortedOps.map(op => cleanOpName(op.operationName)),
            x: sortedOps.map(op => op.idealDuration),
            base: sortedOps.map(op => op.startTime),
            name: 'Ideal Time',
            orientation: 'h' as const,
            offsetgroup: '1',
            marker: { color: '#fbbf24', line: { color: '#b45309', width: 1 } },
            text: sortedOps.map(op => `${op.idealDuration}ms`),
            textposition: 'inside' as const,
            constraintext: 'none',
            textfont: { ...barTextFont, color: '#0f172a' },
            hoverinfo: 'text' as const,
            visible: getVisibility('Ideal Time'),
            hovertext: sortedOps.map(op =>
                `<b>${cleanOpName(op.operationName)}</b><br>Ideal Time: <b>${op.idealDuration} ms</b>`
            )
        };

        const onTimeTrace = {
            type: 'bar' as const,
            y: sortedOps.map(op => cleanOpName(op.operationName)),
            x: sortedOps.map(op => op.actualDuration <= op.idealDuration ? op.actualDuration : null),
            base: sortedOps.map(op => op.startTime),
            name: 'Actual (On Time)',
            orientation: 'h' as const,
            offsetgroup: '2',
            marker: { color: '#38bdf8', line: { color: '#0369a1', width: 1 } },
            text: sortedOps.map(op => op.actualDuration <= op.idealDuration ? `${op.actualDuration}ms` : ''),
            textposition: 'inside' as const,
            constraintext: 'none',
            visible: getVisibility('Actual (On Time)'),
            textfont: { ...barTextFont, color: '#0f172a' },
            customdata: sortedOps.map(op => [
                op.startTime,
                op.endTime,
                op.actualDuration,
                getWait(op.operationName),
                op.operationName,  
                op.trayId || '-'   
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

        const delayedTrace = {
            type: 'bar' as const,
            y: sortedOps.map(op => cleanOpName(op.operationName)),
            x: sortedOps.map(op => op.actualDuration > op.idealDuration ? op.actualDuration : null),
            base: sortedOps.map(op => op.startTime),
            name: 'Actual (Delayed)',
            orientation: 'h' as const,
            offsetgroup: '2',
            marker: { color: '#ef4444', line: { color: '#dc2626', width: 1 } },
            text: sortedOps.map(op => op.actualDuration > op.idealDuration ? `${op.actualDuration}ms` : ''),
            textposition: 'inside' as const,
            constraintext: 'none',
            visible: getVisibility('Actual (Delayed)'),
            textfont: { ...barTextFont, color: '#0f172a' },
            customdata: sortedOps.map(op => [
                op.startTime,
                op.endTime,
                op.actualDuration,
                getWait(op.operationName),
                op.operationName,  
                op.trayId || '-'   
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

        const ngOps = sortedOps.filter(op => op.isNG);
        const ngIconsTrace = {
            type: 'bar' as const,
            y: ngOps.map(op => cleanOpName(op.operationName)),
            base: ngOps.map(op => op.startTime),
            x: ngOps.map(op => op.actualDuration),
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
            customdata: ngOps.map(op => op.operationName)
        };

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
                
                range: savedXRange.current || undefined,
                autorange: savedXRange.current ? false : true,
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
            autosize: true
        };

        const config: Partial<Plotly.Config> = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            scrollZoom: true,
            modeBarButtonsToRemove: [
                'toImage',          
                'sendDataToCloud',
                'select2d',
                'lasso2d'
            ]
        };

        requestAnimationFrame(() => {
            if (!chartRef.current) return;

            layout.uirevision = 'true';

            Plotly.react(
                chartRef.current,
                [idealTrace, onTimeTrace, delayedTrace, ngIconsTrace],
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

                gd.on('plotly_relayout', (_eventData: any) => {
                    
                    if (gd.layout.xaxis && gd.layout.xaxis.range) {
                        savedXRange.current = gd.layout.xaxis.range;
                    }
                    
                    if (gd.layout.yaxis && gd.layout.yaxis.range) {
                        savedYRange.current = gd.layout.yaxis.range;
                    }
                });

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

                if (onNGClick || onTrayLoadClick) {
                    gd.on('plotly_click', (data: any) => {
                        const point = data.points[0];
                        if (point && point.customdata) {
                            
                            let opName;
                            if (point.data.name === 'NG Images') {
                                opName = point.customdata;  
                            } else {
                                opName = point.customdata[4];  
                            }

                            if (onTrayLoadClick && opName === 'Sequence_Load_Tray') {
                                const trayLoadOp = sortedOps.find(op => op.operationName === 'Sequence_Load_Tray');
                                if (trayLoadOp) {
                                    onTrayLoadClick(trayLoadOp);
                                    return;
                                }
                            }

                            if (onNGClick) {
                                const ngOp = ngOpsMap.get(opName);
                                if (ngOp) onNGClick(ngOp);
                            }
                        }
                    });
                }

                gd.on('plotly_hover', async (data: any) => {
                    if (!data || !data.points || data.points.length === 0) return;

                    const point = data.points[0];
                    const curveName = point.data.name;

                    if (curveName === 'Actual (On Time)' || curveName === 'Actual (Delayed)' || curveName === 'NG Images') {
                        
                        let opName;
                        if (curveName === 'NG Images') {
                            opName = point.customdata;
                        } else {
                            opName = point.customdata[4];
                        }

                        const ngOp = ngOpsMap.get(opName);

                        if (ngOp && logFilePath) {
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
                            setTooltipOperation(ngOp);

                            const capturedOpName = opName;
                            const capturedBarrelId = barrelId; 
                            hoverTimeoutRef.current = setTimeout(async () => {
                                if (currentOperationIdRef.current !== capturedOpName) return;

                                const fileName = thumbnailApi.getLogFileName(logFilePath);
                                
                                const thumbs = await thumbnailApi.getThumbnailsForOperation(fileName, capturedOpName, capturedBarrelId);

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
    }, [operations, barrelId, logFilePath, chartData, onReady, onNGClick, onTrayLoadClick, closeTooltip]);

    useEffect(() => {
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
                ngReason={tooltipOperation?.ngReason}
                onMouseEnter={handleTooltipMouseEnter}
                onMouseLeave={handleTooltipMouseLeave}
                mcId={mcId}
            />
        </>
    );
}