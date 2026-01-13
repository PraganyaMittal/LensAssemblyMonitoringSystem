import { useEffect, useRef, useCallback, useMemo } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { OperationData } from '../../types/logTypes';

interface Props {
    operations: OperationData[];
    barrelId: string;
    onReady?: () => void;
}

export default function OperationGanttChart({ operations, barrelId, onReady }: Props) {
    const chartRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<ResizeObserver | null>(null);
    const resizeInProgress = useRef(false);
    const isFirstRender = useRef(true);

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

        return { sortedOps, waitTimeMap };
    }, [operations]);

    const updateChart = useCallback(() => {
        if (!chartRef.current || operations.length === 0) return;

        const { sortedOps, waitTimeMap } = chartData;

        // Helper to retrieve wait time
        const getWait = (name: string) => waitTimeMap.get(name) ?? 0;

        // Common font settings for better readability
        const barTextFont = {
            size: 11,
            color: '#78350f',
            family: 'JetBrains Mono, monospace',
            weight: 900
        };

        const idealTrace = {
            type: 'bar' as const,
            y: sortedOps.map(op => op.operationName),
            x: sortedOps.map(op => op.idealDuration),
            base: sortedOps.map(op => op.startTime),
            name: 'Ideal Time',
            orientation: 'h' as const,
            offsetgroup: '1',
            marker: { color: '#fbbf24', line: { color: '#b45309', width: 1 }},
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
            y: sortedOps.map(op => op.operationName),
            x: sortedOps.map(op => op.actualDuration <= op.idealDuration ? op.actualDuration : null),
            base: sortedOps.map(op => op.startTime),
            name: 'Actual (On Time)',
            orientation: 'h' as const,
            offsetgroup: '2',

            marker: { color: '#38bdf8', line: { color: '#0369a1', width: 1 }},
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
                getWait(op.operationName)
            ]),
            hovertemplate:
                '<b>%{y}</b><br>' +
                'Start: <b>%{customdata[0]} ms</b><br>' +
                'End: <b>%{customdata[1]} ms</b><br>' +
                'Duration: <b>%{customdata[2]} ms</b><br>' +
                'Wait: <b>%{customdata[3]} ms</b>' +
                '<extra></extra>'
        };

        const delayedTrace = {
            type: 'bar' as const,
            y: sortedOps.map(op => op.operationName),
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
                getWait(op.operationName)
            ]),
            hovertemplate:
                '<b>%{y}</b><br>' +
                'Start: <b>%{customdata[0]} ms</b><br>' +
                'End: <b>%{customdata[1]} ms</b><br>' +
                'Duration: <b>%{customdata[2]} ms</b><br>' +
                'Wait: <b>%{customdata[3]} ms</b><br>' +
                '⚠ Delayed<extra></extra>'
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
            margin: { l: 10, r: 10, t: 0, b: 40 },
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
            modeBarButtonsToRemove: ['toImage', 'sendDataToCloud', 'select2d', 'lasso2d']
        };

        requestAnimationFrame(() => {
            if (!chartRef.current) return;
            Plotly.newPlot(chartRef.current, [idealTrace, onTimeTrace, delayedTrace], layout, config).then(() => {
                Plotly.Plots.resize(chartRef.current!).then(() => {
                    if (onReady) onReady();
                });
            });
        });
    }, [operations, barrelId, chartData, onReady]);

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

    return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />;
}