import { useEffect, useRef, useCallback, useMemo } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { TrayLoadSubOperation } from '../../types/logTypes';

interface Props {
    subOperations: TrayLoadSubOperation[];
    lensTrayId: string;
    barrelId: string;
    onReady?: () => void;
    onSubOperationClick?: (operationName: string) => void;
}

export default function SubOperationGanttChart({ subOperations, lensTrayId, barrelId, onReady, onSubOperationClick }: Props) {
    const chartRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<ResizeObserver | null>(null);
    const resizeInProgress = useRef(false);
    const isFirstRender = useRef(true);

    
    const savedXRange = useRef<[number, number] | null>(null);
    const savedYRange = useRef<[number, number] | null>(null);

    const safeResize = useCallback(() => {
        if (!chartRef.current || resizeInProgress.current) return;
        resizeInProgress.current = true;
        Plotly.Plots.resize(chartRef.current)
            .then(() => { resizeInProgress.current = false; })
            .catch(() => { resizeInProgress.current = false; });
    }, []);

    const chartData = useMemo(() => {
        const sorted = [...subOperations].sort((a, b) => a.startTime - b.startTime);

        
        const minStart = sorted.length > 0 ? sorted[0].startTime : 0;
        return sorted.map((op, i) => ({
            ...op,
            normalizedStart: op.startTime - minStart,
            normalizedEnd: op.endTime - minStart,
            sequence: i + 1
        }));
    }, [subOperations]);

    const updateChart = useCallback(() => {
        if (!chartRef.current || chartData.length === 0) return;

        const cleanOpName = (name: string) => {
            return name.replace(/^Sequence_/i, '').replace(/_/g, ' ');
        };

        const barTextFont = {
            size: 11,
            color: '#78350f',
            family: 'JetBrains Mono, monospace',
            weight: 900
        };

        
        const idealTrace = {
            type: 'bar' as const,
            y: chartData.map(op => cleanOpName(op.operationName)),
            x: chartData.map(op => op.idealDuration),
            base: chartData.map(op => op.normalizedStart),
            name: 'Ideal Time',
            orientation: 'h' as const,
            offsetgroup: '1',
            marker: { color: '#fbbf24', line: { color: '#b45309', width: 1 } },
            text: chartData.map(op => `${op.idealDuration}ms`),
            textposition: 'inside' as const,
            constraintext: 'none',
            textfont: { ...barTextFont, color: '#0f172a' },
            hoverinfo: 'text' as const,
            hovertext: chartData.map(op =>
                `<b>${cleanOpName(op.operationName)}</b><br>Ideal Time: <b>${op.idealDuration} ms</b>`
            )
        };

        
        const onTimeTrace = {
            type: 'bar' as const,
            y: chartData.map(op => cleanOpName(op.operationName)),
            x: chartData.map(op => op.actualDuration <= op.idealDuration ? op.actualDuration : null),
            base: chartData.map(op => op.normalizedStart),
            name: 'Actual (On Time)',
            orientation: 'h' as const,
            offsetgroup: '2',
            marker: { color: '#38bdf8', line: { color: '#0369a1', width: 1 } },
            text: chartData.map(op => op.actualDuration <= op.idealDuration ? `${op.actualDuration}ms` : ''),
            textposition: 'inside' as const,
            constraintext: 'none',
            textfont: { ...barTextFont, color: '#0f172a' },
            customdata: chartData.map(op => [
                op.normalizedStart,
                op.normalizedEnd,
                op.actualDuration,
                op.lensTrayId,
                op.barrelId,
                op.operationName
            ]),
            hovertemplate:
                '<b>%{y}</b><br>' +
                'Start: <b>%{customdata[0]} ms</b><br>' +
                'End: <b>%{customdata[1]} ms</b><br>' +
                'Duration: <b>%{customdata[2]} ms</b><br>' +
                'Lens Tray: <b>%{customdata[3]}</b><br>' +
                'Barrel: <b>%{customdata[4]}</b>' +
                '<extra></extra>'
        };

        
        const delayedTrace = {
            type: 'bar' as const,
            y: chartData.map(op => cleanOpName(op.operationName)),
            x: chartData.map(op => op.actualDuration > op.idealDuration ? op.actualDuration : null),
            base: chartData.map(op => op.normalizedStart),
            name: 'Actual (Delayed)',
            orientation: 'h' as const,
            offsetgroup: '2',
            marker: { color: '#ef4444', line: { color: '#dc2626', width: 1 } },
            text: chartData.map(op => op.actualDuration > op.idealDuration ? `${op.actualDuration}ms` : ''),
            textposition: 'inside' as const,
            constraintext: 'none',
            textfont: { ...barTextFont, color: '#0f172a' },
            customdata: chartData.map(op => [
                op.normalizedStart,
                op.normalizedEnd,
                op.actualDuration,
                op.lensTrayId,
                op.barrelId,
                op.operationName
            ]),
            hovertemplate:
                '<b>%{y}</b><br>' +
                'Start: <b>%{customdata[0]} ms</b><br>' +
                'End: <b>%{customdata[1]} ms</b><br>' +
                'Duration: <b>%{customdata[2]} ms</b><br>' +
                'Lens Tray: <b>%{customdata[3]}</b><br>' +
                'Barrel: <b>%{customdata[4]}</b><br>' +
                '⚠ Delayed' +
                '<extra></extra>'
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
                    text: 'Sub-Operation',
                    font: { size: 12, color: '#f8fafc', family: 'Inter, sans-serif', weight: 600 },
                    standoff: 10
                },
                tickfont: { size: 10, color: '#f8fafc', family: 'Inter, sans-serif' },
                automargin: true,
                showgrid: false,
                zeroline: false,
                range: savedYRange.current || undefined,
                autorange: savedYRange.current ? false : true,
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
            uirevision: 'true'
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

            Plotly.react(
                chartRef.current,
                [idealTrace, onTimeTrace, delayedTrace],
                layout,
                config
            ).then(() => {
                const gd = chartRef.current as any;

                gd.removeAllListeners('plotly_click');
                gd.removeAllListeners('plotly_relayout');

                
                gd.on('plotly_relayout', () => {
                    if (gd.layout.xaxis?.range) savedXRange.current = gd.layout.xaxis.range;
                    if (gd.layout.yaxis?.range) savedYRange.current = gd.layout.yaxis.range;
                });

                
                if (onSubOperationClick) {
                    gd.on('plotly_click', (data: any) => {
                        const point = data.points[0];
                        if (point?.customdata) {
                            const opName = point.customdata[5]; 
                            if (opName) onSubOperationClick(opName);
                        }
                    });
                }

                Plotly.Plots.resize(chartRef.current!).then(() => {
                    if (onReady) onReady();
                });
            });
        });
    }, [chartData, lensTrayId, barrelId, onReady, onSubOperationClick]);

    useEffect(() => {
        
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
        };
    }, [updateChart, safeResize]);

    return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />;
}
