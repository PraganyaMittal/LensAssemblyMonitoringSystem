import { useEffect, useRef, useCallback } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { BarrelExecutionData } from '../../types/logTypes';

interface Props {
    barrels: BarrelExecutionData[];
    selectedBarrel: string | null;
    onBarrelClick: (barrelId: string) => void;
    onReady?: () => void;
}

export default function BarrelExecutionChart({ barrels, selectedBarrel, onBarrelClick, onReady }: Props) {
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

    const updateChart = useCallback(() => {
        if (!chartRef.current || barrels.length === 0) return;

        const barrelCount = barrels.length;
        const xData = barrels.map(b => b.barrelId);
        const yData = barrels.map(b => b.totalExecutionTime);

        // Color coding: green for ≤8500ms, red for >8500ms
        // Selected barrel gets darker shade
        const THRESHOLD_MS = 8500;
        const colors = barrels.map(b => {
            const isSelected = b.barrelId === selectedBarrel;
            const isAboveThreshold = b.totalExecutionTime > THRESHOLD_MS;

            if (isSelected) {
                // Darker colors for selected
                return isAboveThreshold ? '#dc2626' : '#16a34a';  // dark red / dark green
            } else {
                // Light colors for unselected
                return isAboveThreshold ? '#fca5a5' : '#86efac';  // light red / light green
            }
        });

        const borderColors = barrels.map(b => {
            const isSelected = b.barrelId === selectedBarrel;
            const isAboveThreshold = b.totalExecutionTime > THRESHOLD_MS;

            if (isSelected) {
                return isAboveThreshold ? '#991b1b' : '#15803d';  // darker border
            } else {
                return isAboveThreshold ? '#f87171' : '#4ade80';  // subtle border
            }
        });

        const calculateTickGap = (visibleStart: number, visibleEnd: number) => {
            const visibleBarrels = visibleEnd - visibleStart;
            const chartWidth = chartRef.current?.clientWidth || 1000;
            const pixelsPerTick = 70;
            const targetTickCount = Math.floor(chartWidth / pixelsPerTick);
            return Math.max(1, Math.ceil(visibleBarrels / targetTickCount));
        };

        const formatBarText = (time: number) => {
            const SEPARATOR_GAP = '\u2009\u200A';
            const spacedNumber = time.toFixed(0);
            const unit = 'ms';
            return `${spacedNumber}${SEPARATOR_GAP}${unit}`;
        };

        const trace = {
            x: xData,
            y: yData,
            type: 'bar' as const,
            marker: {
                color: colors,
                line: {
                    color: borderColors,
                    width: 2
                }
            },
            text: yData.map(y => formatBarText(y)),
            textposition: 'auto' as const,
            textangle: -90,
            textfont: { size: 12, color: '#0f172a', family: 'JetBrains Mono, monospace', weight: 600 },
            hovertemplate: '<b>Barrel %{x}</b><br>Time: <b>%{y:.0f}ms</b><extra></extra>',
            hoverlabel: { bgcolor: '#1e293b', bordercolor: '#38bdf8', font: { color: '#f8fafc', size: 13 } },
            cliponaxis: false
        };

        const initialTickGap = calculateTickGap(0, barrelCount);
        const showRangeSlider = barrelCount > 50;

        const layout: Partial<Plotly.Layout> = {
            xaxis: {
                title: { text: 'Barrel ID', font: { color: '#f8fafc', size: 12, family: 'Inter, sans-serif' }, standoff: 10 },
                tickfont: { color: '#94a3b8', size: 10, family: 'JetBrains Mono, monospace' },
                dtick: initialTickGap,
                rangeslider: showRangeSlider ? { visible: true, bgcolor: '#1e293b', thickness: 0.1 } : { visible: false },
                automargin: true,
                gridcolor: '#334155',
                zeroline: false
            },
            yaxis: {
                title: { text: 'Time (ms)', font: { color: '#f8fafc', size: 12, family: 'Inter, sans-serif' }, standoff: 10 },
                tickfont: { color: '#94a3b8', size: 10, family: 'JetBrains Mono, monospace' },
                gridcolor: '#334155',
                automargin: true,
                zeroline: false,
                autorange: true
            },
            plot_bgcolor: '#0b1121',
            paper_bgcolor: '#0b1121',
            margin: { l: 50, r: 20, t: 20, b: showRangeSlider ? 60 : 40 },
            autosize: true,
            showlegend: false,
            hovermode: 'closest' as const
        };

        const config: Partial<Plotly.Config> = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['toImage', 'sendDataToCloud', 'lasso2d', 'select2d']
        };

        requestAnimationFrame(() => {
            if (!chartRef.current) return;

            Plotly.newPlot(chartRef.current, [trace], layout, config).then(() => {
                Plotly.Plots.resize(chartRef.current!).then(() => {
                    if (onReady) onReady();
                });

                const chartElement = chartRef.current as any;
                if (chartElement) {
                    chartElement.removeAllListeners('plotly_click');
                    chartElement.removeAllListeners('plotly_relayout');

                    chartElement.on('plotly_click', (data: any) => {
                        if (data?.points?.length) {
                            onBarrelClick(barrels[data.points[0].pointIndex].barrelId);
                        }
                    });

                    chartElement.on('plotly_relayout', (eventData: any) => {
                        if (eventData['xaxis.range[0]'] !== undefined) {
                            const start = Math.max(0, Math.floor(eventData['xaxis.range[0]']));
                            const end = Math.min(barrelCount, Math.ceil(eventData['xaxis.range[1]']));
                            Plotly.relayout(chartElement, { 'xaxis.dtick': calculateTickGap(start, end) });
                        }
                    });
                }
            });
        });
    }, [barrels, selectedBarrel, onBarrelClick, onReady]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (!selectedBarrel || barrels.length === 0) return;
            const currentIndex = barrels.findIndex(b => b.barrelId === selectedBarrel);
            if (currentIndex === -1) return;

            let newIndex = currentIndex;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                newIndex = currentIndex > 0 ? currentIndex - 1 : barrels.length - 1;
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                newIndex = currentIndex < barrels.length - 1 ? currentIndex + 1 : 0;
            }

            if (newIndex !== currentIndex) onBarrelClick(barrels[newIndex].barrelId);
        };
        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [selectedBarrel, barrels, onBarrelClick]);

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