import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { OperationData } from '../../types/logTypes';
import { ThumbnailTooltip } from './ThumbnailTooltip';
import { thumbnailApi, ThumbnailData } from '../../services/thumbnailApi';

interface Props {
    operations: OperationData[];
    barrelId: string;
    logFilePath?: string; // For thumbnail cache lookup
    onReady?: () => void;
    onNGClick?: (operation: OperationData) => void; // Callback for NG operation click
}

export default function OperationGanttChart({ operations, barrelId, logFilePath, onReady, onNGClick }: Props) {
    const chartRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<ResizeObserver | null>(null);
    const resizeInProgress = useRef(false);
    const isFirstRender = useRef(true);
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Thumbnail tooltip state
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const [tooltipThumbnails, setTooltipThumbnails] = useState<ThumbnailData[]>([]);
    const [tooltipOperation, setTooltipOperation] = useState<OperationData | null>(null);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        // Sort by sequence for the Y-axis order
        const sortedOps = [...operations].sort((a, b) => a.sequence - b.sequence);

        // CALCULATE WAITING TIME
        // 1. Sort a copy strictly by start time to determine chronological order
        const timeSorted = [...operations].sort((a, b) => a.startTime - b.startTime);

        // 2. Map waiting times by operation name
        // Wait Time = time from current op end until next work begins
        // BUT: if ANY other operation is still running when current ends, wait = 0
        const waitTimeMap = new Map<string, number>();

        timeSorted.forEach((op) => {
            const currentEndTime = op.endTime;

            // Check if ANY other operation is still running when this operation ends
            const anyOtherStillRunning = timeSorted.some(other =>
                other.operationName !== op.operationName &&
                other.startTime < currentEndTime &&  // Started before current ends
                other.endTime > currentEndTime       // Ends after current ends
            );

            if (anyOtherStillRunning) {
                // No waiting - parallel work is happening
                waitTimeMap.set(op.operationName, 0);
            } else {
                // Find the next operation that starts after this one ends
                const nextOp = timeSorted.find(other =>
                    other.startTime >= currentEndTime &&
                    other.operationName !== op.operationName
                );

                if (nextOp) {
                    const wait = nextOp.startTime - currentEndTime;
                    waitTimeMap.set(op.operationName, wait);
                } else {
                    // Last operation has 0 wait time
                    waitTimeMap.set(op.operationName, 0);
                }
            }
        });

        // Create NG operations map for quick lookup
        const ngOpsMap = new Map<string, OperationData>();
        sortedOps.forEach(op => {
            if (op.isNG) {
                ngOpsMap.set(op.operationName, op);
            }
        });

        return { sortedOps, waitTimeMap, ngOpsMap };
    }, [operations]);

    const updateChart = useCallback(() => {
        if (!chartRef.current || operations.length === 0) return;

        const { sortedOps, waitTimeMap, ngOpsMap } = chartData;

        // Helper to retrieve wait time
        const getWait = (name: string) => waitTimeMap.get(name) ?? 0;

        // Helper to clean operation names (remove Sequence_ prefix and underscores)
        const cleanOpName = (name: string) => {
            return name
                .replace(/^Sequence_/i, '')  // Remove Sequence_ prefix
                .replace(/_/g, ' ');          // Replace underscores with spaces
        };

        // Common font settings for better readability
        const barTextFont = {
            size: 11,
            color: '#78350f',
            family: 'JetBrains Mono, monospace',
            weight: 900
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
            textfont: {
                ...barTextFont,
                color: '#0f172a'
            },
            hoverinfo: 'text',
            hovertext: sortedOps.map(op => `<b>${op.operationName}</b><br>Ideal Time: <b>${op.idealDuration} ms</b>`)
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
            textfont: {
                ...barTextFont,
                color: '#0f172a'
            },
            customdata: sortedOps.map(op => [
                op.startTime,
                op.endTime,
                op.actualDuration,
                getWait(op.operationName),
                op.isNG ? '📷 NG' : '',
                op.ngReason || '',
                op.operationName // Store original name for click handling
            ]),
            hovertemplate:
                '<b>%{y}</b><br>' +
                'Start: <b>%{customdata[0]} ms</b><br>' +
                'End: <b>%{customdata[1]} ms</b><br>' +
                'Duration: <b>%{customdata[2]} ms</b><br>' +
                'Wait: <b>%{customdata[3]} ms</b>' +
                '%{customdata[4]}' +
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
            textfont: {
                ...barTextFont,
                color: '#0f172a'
            },
            customdata: sortedOps.map(op => [
                op.startTime,
                op.endTime,
                op.actualDuration,
                getWait(op.operationName),
                op.isNG ? '<br>📷 <b>NG Case</b>' : '',
                op.ngReason || '',
                op.operationName
            ]),
            hovertemplate:
                '<b>%{y}</b><br>' +
                'Start: <b>%{customdata[0]} ms</b><br>' +
                'End: <b>%{customdata[1]} ms</b><br>' +
                'Duration: <b>%{customdata[2]} ms</b><br>' +
                'Wait: <b>%{customdata[3]} ms</b><br>' +
                '⚠ Delayed%{customdata[4]}<extra></extra>'
        };

        // Create trace for NG operations (camera icon) - Transparent Bar for perfect alignment
        const ngOps = sortedOps.filter(op => op.isNG);
        const ngIconsTrace = {
            type: 'bar' as const,
            y: ngOps.map(op => cleanOpName(op.operationName)),
            base: ngOps.map(op => op.startTime),
            x: ngOps.map(op => op.actualDuration), // Same width as actual bar
            name: 'NG Images',
            orientation: 'h' as const,
            offsetgroup: '2', // Align with 'Actual' bars
            text: ngOps.map(() => '📷'),
            textposition: 'inside' as const,
            insidetextanchor: 'start' as const, // Align text to left
            textfont: { size: 16 },
            marker: { color: 'rgba(0,0,0,0)' }, // Transparent
            hoverinfo: 'skip' as const, // Let hover pass through to the colored bar
            showlegend: false,
            customdata: ngOps.map(op => op.operationName)
        };

        const layout: Partial<Plotly.Layout> = {
            xaxis: {
                title: { text: 'Execution Time (ms)', font: { size: 12, color: '#f8fafc', family: 'Inter, sans-serif', weight: 600 }, standoff: 10 },
                tickfont: { size: 10, color: '#94a3b8', family: 'JetBrains Mono, monospace' },
                gridcolor: '#334155',
                zeroline: false,
                automargin: true,
                autorange: true,
            },
            yaxis: {
                title: { text: 'Operation', font: { size: 12, color: '#f8fafc', family: 'Inter, sans-serif', weight: 600 }, standoff: 10 },
                tickfont: { size: 10, color: '#f8fafc', family: 'Inter, sans-serif' },
                automargin: true,
                showgrid: false,
                zeroline: false
            },
            barmode: 'group' as const,
            bargap: 0.06,
            bargroupgap: 0,
            plot_bgcolor: '#0b1121',
            paper_bgcolor: '#0b1121',
            margin: { l: 20, r: 10, t: 0, b: 40 },
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
            // annotations: ngAnnotations // Removed in favor of scatter trace
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
            // Add ngIconsTrace to the plot
            Plotly.newPlot(chartRef.current, [idealTrace, onTimeTrace, delayedTrace, ngIconsTrace], layout, config).then(() => {
                const gd = chartRef.current as any;

                // Add click handler for NG operations
                if (onNGClick) {
                    gd.on('plotly_click', (data: any) => {
                        const point = data.points[0];
                        if (point && point.customdata) {
                            // Check if clicked on NG Icon trace
                            let opName;
                            if (point.data.name === 'NG Images') {
                                opName = point.customdata;
                            } else {
                                opName = point.customdata[6]; // Original operation name from bar trace
                            }

                            const ngOp = ngOpsMap.get(opName);
                            if (ngOp) {
                                onNGClick(ngOp);
                            }
                        }
                    });
                }

                // Hover handler for thumbnail tooltip
                gd.on('plotly_hover', async (data: any) => {
                    if (!data || !data.points || data.points.length === 0) return;

                    const point = data.points[0];
                    const curveName = point.data.name;

                    // Trigger on Actual bars (since NG Images trace is 'skip')
                    if (curveName === 'Actual (On Time)' || curveName === 'Actual (Delayed)') {
                        const opName = point.customdata[6]; // opName is at index 6 in bar trace customdata
                        const ngOp = ngOpsMap.get(opName);

                        if (ngOp && logFilePath) {
                            // Clear any pending timeout
                            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);

                            // Get mouse position
                            const event = data.event;
                            // Ensure tooltip is close to mouse for easy bridging
                            const x = event?.clientX || 100;
                            const y = event?.clientY || 100;

                            // Smart Positioning: Avoid overlap with Plotly tooltip and screen edges
                            const windowHeight = window.innerHeight;
                            // If mouse is in top half, show tooltip BELOW. If bottom half, show ABOVE.
                            // We assume tooltip height is approx 300px.
                            const showBelow = y < (windowHeight / 2);
                            const finalY = showBelow ? y + 20 : y - 300;
                            
                            // Move to Left of cursor (x - 300) to avoid Plotly tooltip on Right
                            setTooltipPosition({ x: x - 300, y: finalY });
                            setTooltipOperation(ngOp);

                            // Fetch thumbnails with debounce
                            hoverTimeoutRef.current = setTimeout(async () => {
                                const fileName = thumbnailApi.getLogFileName(logFilePath);
                                const thumbs = await thumbnailApi.getThumbnailsForOperation(fileName, opName);
                                if (thumbs.length > 0) {
                                    setTooltipThumbnails(thumbs);
                                    setTooltipVisible(true);
                                }
                            }, 50); // Fast response
                        }
                    }
                });

                gd.on('plotly_unhover', () => {
                    if (hoverTimeoutRef.current) {
                        clearTimeout(hoverTimeoutRef.current);
                    }
                    // Delay closing to allow moving mouse into tooltip
                    closeTimeoutRef.current = setTimeout(() => {
                        setTooltipVisible(false);
                        setTooltipThumbnails([]);
                        setTooltipOperation(null);
                    }, 300);
                });

                Plotly.Plots.resize(chartRef.current!).then(() => {
                    if (onReady) onReady();
                });
            });
        });
    }, [operations, barrelId, logFilePath, chartData, onReady, onNGClick]);

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
        };
    }, [updateChart, safeResize]);

    return (
        <>
            <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
            <ThumbnailTooltip
                isVisible={tooltipVisible}
                thumbnails={tooltipThumbnails}
                position={tooltipPosition}
                onMaximize={() => {
                    if (tooltipOperation && onNGClick) {
                        onNGClick(tooltipOperation);
                        setTooltipVisible(false); // Close tooltip after clicking
                    }
                }}
                onMouseEnter={() => {
                    if (closeTimeoutRef.current) {
                        clearTimeout(closeTimeoutRef.current);
                    }
                }}
                onMouseLeave={() => {
                    setTooltipVisible(false);
                    setTooltipThumbnails([]);
                    setTooltipOperation(null);
                }}
            />
        </>
    );
}