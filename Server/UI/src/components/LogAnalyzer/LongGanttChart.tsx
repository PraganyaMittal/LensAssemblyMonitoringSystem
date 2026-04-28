import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { BarrelExecutionData } from '../../types/logTypes';

interface Props {
    barrels: BarrelExecutionData[];
    onReady?: () => void;
}

export default function LongGanttChart({ barrels, onReady }: Props) {
    const chartRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<ResizeObserver | null>(null);
    const resizeInProgress = useRef(false);
    const isFirstRender = useRef(true);

    const savedXRange = useRef<[number, number] | null>(null);
    const savedYRange = useRef<[number, number] | null>(null);

    const [selectedBarrelId, setSelectedBarrelId] = useState<string | null>(null);

    const safeResize = useCallback(() => {
        if (!chartRef.current || resizeInProgress.current) return;
        resizeInProgress.current = true;
        Plotly.Plots.resize(chartRef.current)
            .then(() => { resizeInProgress.current = false; })
            .catch(() => { resizeInProgress.current = false; });
    }, []);

    const BARREL_COLORS = ['#3b82f6', '#10b981', '#8b5cf6'];

    const chartData = useMemo(() => {

        const waitTimeMap = new Map<string, number>(); 

        barrels.forEach(barrel => {
            
            const sortedOps = [...barrel.operations].sort((a, b) => a.globalStartTime - b.globalStartTime);

            sortedOps.forEach((op, index) => {
                const nextOp = sortedOps[index + 1];
                let wait = 0;
                if (nextOp) {
                    wait = Math.max(0, nextOp.globalStartTime - op.globalEndTime);
                }
                
                waitTimeMap.set(`${barrel.barrelId}_${op.operationName}`, wait);
            });
        });

        const allOps = barrels.flatMap(b => b.operations);

        const opStartMap = new Map<string, number>();
        allOps.forEach(op => {
            const current = opStartMap.get(op.operationName) ?? Infinity;
            if (op.globalStartTime < current) {
                opStartMap.set(op.operationName, op.globalStartTime);
            }
        });

        const cleanOpName = (name: string) => {
            return name
                .replace(/^Sequence_/i, '')  
                .replace(/_/g, ' ');          
        };

        const sortedOpNames = Array.from(new Set(allOps.map(op => op.operationName)))
            .sort((a, b) => (opStartMap.get(b) || 0) - (opStartMap.get(a) || 0))
            .map(cleanOpName);

        const traces: any[] = [];

        traces.push({
            type: 'bar',
            name: 'Ideal Time',
            y: allOps.map(op => cleanOpName(op.operationName)),
            x: allOps.map(op => op.idealDuration),
            base: allOps.map(op => op.globalStartTime),
            orientation: 'h',
            visible: 'legendonly',
            width: 0.4,
            marker: {
                color: '#fbbf24',
                line: { width: 0 },
                opacity: 1
            },
            text: allOps.map(op => `${op.idealDuration}ms`),
            textposition: 'inside',
            textfont: { size: 10, color: '#000000', family: 'JetBrains Mono, monospace', weight: 600 },
            customdata: allOps.map(op => ({ idealMs: op.idealDuration })),
            hovertemplate:
                '<b>%{y}</b><br>' +
                'Ideal Time: <b>%{customdata.idealMs} ms</b>' +
                '<extra></extra>',
            showlegend: true
        });

        traces.push({
            type: 'bar',
            name: 'Actual Time',
            y: allOps.map(op => cleanOpName(op.operationName)),
            x: allOps.map(op => op.actualDuration),
            base: allOps.map(op => op.globalStartTime),
            orientation: 'h',
            width: 0.4,
            marker: {
                color: allOps.map(op => BARREL_COLORS[parseInt(op.barrelId) % 3]),
                line: { width: 0 },
                opacity: allOps.map(op => {
                    if (selectedBarrelId === null) return 1;
                    return op.barrelId === selectedBarrelId ? 1 : 0.1;
                })
            },
            text: allOps.map(op => `${op.actualDuration}ms`),
            textposition: 'inside',
            textfont: { size: 10, color: '#000000', family: 'JetBrains Mono, monospace', weight: 700 },
            
            customdata: allOps.map(op => [
                op.barrelId,
                (op.globalStartTime + op.actualDuration).toFixed(0),
                op.actualDuration > op.idealDuration ? '⚠ <b>Delayed</b>' : '',
                waitTimeMap.get(`${op.barrelId}_${op.operationName}`) ?? 0
            ]),
            hovertemplate:
                '<b>%{y}</b><br>' +
                'Barrel ID: <b>%{customdata[0]}</b><br>' +
                'Start: %{base:.0f} ms<br>' +
                'End: %{customdata[1]} ms<br>' +
                'Wait: <b>%{customdata[3]} ms</b><br>' +
                '%{customdata[2]}<extra></extra>',
            showlegend: true
        });

        return { traces, categoryOrder: sortedOpNames };
    }, [barrels, selectedBarrelId]);

    const updateChart = useCallback(() => {
        if (!chartRef.current || barrels.length === 0) return;

        const { traces, categoryOrder } = chartData;

        let initialXRange: [number, number] | null = null;
        if (barrels.length >= 3 && !savedXRange.current) {
            
            const first3Barrels = barrels.slice(0, 3);
            const maxEndTime = Math.max(
                ...first3Barrels.flatMap(b => b.operations.map(op => op.globalStartTime + op.actualDuration))
            );
            initialXRange = [0, maxEndTime * 1.05]; 
        }

        const graphDiv = chartRef.current as any;
        if (graphDiv && graphDiv.layout) {
            if (graphDiv.layout.xaxis && graphDiv.layout.xaxis.range) {
                savedXRange.current = graphDiv.layout.xaxis.range;
            }
            if (graphDiv.layout.yaxis && graphDiv.layout.yaxis.range) {
                savedYRange.current = graphDiv.layout.yaxis.range;
            }
        }

        const layout: Partial<Plotly.Layout> = {
            uirevision: 'true',
            datarevision: selectedBarrelId ?? undefined,
            xaxis: {
                title: {
                    text: '<b>Timeline (ms)</b>',
                    font: { size: 14, color: '#94a3b8', family: 'Inter, sans-serif' },
                    standoff: 20
                },
                tickfont: { size: 11, color: '#94a3b8', family: 'JetBrains Mono, monospace' },
                rangemode: 'tozero',
                tickmode: 'auto',
                tick0: 0,
                range: savedXRange.current || initialXRange || undefined,
                tickformatstops: [
                    { dtickrange: [null, 1000], value: 'd' },
                    { dtickrange: [1000, null], value: '~s' }
                ],
                ticks: 'outside',
                nticks: 12,
                gridcolor: '#1e293b',
                zeroline: false,
                rangeslider: {
                    visible: true,
                    thickness: 0.04,
                    bgcolor: 'rgba(100, 116, 139, 0.2)',
                    bordercolor: 'rgba(100, 116, 139, 0.3)',
                    borderwidth: 1
                }
            },
            yaxis: {
                title: {
                    text: '<b>Operations</b>',
                    font: { size: 14, color: '#94a3b8', family: 'Inter, sans-serif' },
                    standoff: 20
                },
                tickfont: { size: 11, color: '#cbd5e1', family: 'Inter, sans-serif' },
                automargin: true,
                showgrid: false,
                zeroline: false,
                categoryorder: 'array',
                categoryarray: categoryOrder,
                range: savedYRange.current || undefined
            },
            barmode: 'group',
            bargap: 0.2,
            bargroupgap: 0,
            plot_bgcolor: '#0b1121',
            paper_bgcolor: '#0b1121',
            margin: { l: 20, r: 20, t: 50, b: 35 },
            hovermode: 'closest',
            autosize: true,
            showlegend: true,
            legend: {
                orientation: 'h',
                yanchor: 'bottom',
                y: 1.02,
                xanchor: 'left',
                x: 0,
                font: { color: '#cbd5e1', size: 12, family: 'Inter, sans-serif' },
                
                itemclick: 'toggle',
                itemdoubleclick: 'toggleothers'
            },
            annotations: [
                {
                    xref: 'paper',
                    yref: 'paper',
                    x: 0.5,
                    y: 1.02,
                    xanchor: 'center',
                    yanchor: 'bottom',
                    text: '<b>Color Cycle Repeats:</b> <span style="color:#3b82f6">●</span> Blue → <span style="color:#10b981">●</span> Green → <span style="color:#8b5cf6">●</span> Purple',
                    showarrow: false,
                    font: {
                        family: 'Inter, sans-serif',
                        size: 13,
                        color: '#94a3b8'
                    },
                    bgcolor: 'rgba(15, 23, 42, 0)',
                    borderpad: 0
                }
            ],
            dragmode: 'pan',
        };

        const config: Partial<Plotly.Config> = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['lasso2d', 'select2d']
        };

        requestAnimationFrame(() => {
            if (!chartRef.current) return;
            Plotly.react(chartRef.current, traces, layout, config).then(() => {
                const gd = chartRef.current as any;

                gd.removeAllListeners('plotly_click');
                gd.removeAllListeners('plotly_doubleclick');

                gd.on('plotly_click', (data: any) => {
                    if (gd.layout.xaxis) savedXRange.current = gd.layout.xaxis.range;
                    if (gd.layout.yaxis) savedYRange.current = gd.layout.yaxis.range;

                    if (!data || !data.points || data.points.length === 0) {
                        setSelectedBarrelId(null);
                        return;
                    }
                    const clickedPoint = data.points[0];
                    if (clickedPoint && clickedPoint.customdata) {
                        const bId = clickedPoint.customdata[0];
                        setSelectedBarrelId(prev => (prev === bId ? null : bId));
                    }
                });

                gd.on('plotly_doubleclick', () => {
                    setSelectedBarrelId(null);
                    savedXRange.current = null;
                    savedYRange.current = null;
                });

                try {
                    const rs = chartRef.current?.querySelector('.rangeslider');
                    if (rs) {
                        rs.querySelectorAll('.trace').forEach(node => {
                            (node as HTMLElement).style.display = 'none';
                        });
                        rs.querySelectorAll('.xaxislayer, .yaxislayer, .carts').forEach(node => {
                            (node as HTMLElement).style.display = 'none';
                        });
                    }
                } catch (e) { }

                if (onReady) onReady();
            });
        });
    }, [chartData, barrels, onReady, selectedBarrelId]);

    useEffect(() => {
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
    }, [safeResize]);

    useEffect(() => {
        updateChart();
    }, [updateChart]);

    return <div ref={chartRef} style={{ width: '100%', height: '100%', minHeight: '500px' }} />;
}