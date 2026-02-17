import { useEffect, useRef, useCallback } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { TrayLoadData } from '../../types/logTypes';

interface Props {
    trayLoads: TrayLoadData[];
    selectedLensTray: string | null;
    onLensTrayClick: (lensTrayId: string) => void;
    onReady?: () => void;
}

export default function LensTrayBarChart({ trayLoads, selectedLensTray, onLensTrayClick, onReady }: Props) {
    const chartRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<ResizeObserver | null>(null);
    const resizeInProgress = useRef(false);
    const isFirstRender = useRef(true);

    // ZOOM STATE PRESERVATION
    const savedXRange = useRef<[number, number] | null>(null);
    const savedYRange = useRef<[number, number] | null>(null);

    const safeResize = useCallback(() => {
        if (!chartRef.current || resizeInProgress.current) return;
        resizeInProgress.current = true;
        Plotly.Plots.resize(chartRef.current)
            .then(() => { resizeInProgress.current = false; })
            .catch(() => { resizeInProgress.current = false; });
    }, []);

    const updateChart = useCallback(() => {
        if (!chartRef.current || trayLoads.length === 0) return;

        const xData = trayLoads.map(t => t.lensTrayId);
        const yData = trayLoads.map(t => t.totalDuration);

        const THRESHOLD_MS = 2000; // Threshold for tray load times

        const colors = trayLoads.map(t => {
            const isSelected = t.lensTrayId === selectedLensTray;
            const isAboveThreshold = t.totalDuration > THRESHOLD_MS;

            if (isSelected) {
                return isAboveThreshold ? '#dc2626' : '#16a34a';
            } else {
                return isAboveThreshold ? '#fca5a5' : '#86efac';
            }
        });

        const borderColors = trayLoads.map(t => {
            const isSelected = t.lensTrayId === selectedLensTray;
            const isAboveThreshold = t.totalDuration > THRESHOLD_MS;

            if (isSelected) {
                return isAboveThreshold ? '#991b1b' : '#15803d';
            } else {
                return isAboveThreshold ? '#f87171' : '#4ade80';
            }
        });

        const formatBarText = (time: number) => {
            const SEPARATOR_GAP = '\u2009\u200A';
            const spacedNumber = time.toFixed(0);
            return `${spacedNumber}${SEPARATOR_GAP}ms`;
        };

        const trace = {
            x: xData,
            y: yData,
            type: 'bar' as const,
            orientation: 'v' as const,
            marker: {
                color: colors,
                line: { color: borderColors, width: 2 }
            },
            text: yData.map(y => formatBarText(y)),
            textposition: 'auto' as const,
            textangle: -90,
            textfont: { size: 12, color: '#0f172a', family: 'JetBrains Mono, monospace', weight: 600 },
            customdata: trayLoads.map(t => [t.barrelId, t.lensTrayId]),
            hovertemplate: '<b>Lens Tray %{x}</b><br>Barrel: <b>%{customdata[0]}</b><br>Time: <b>%{y:.0f}ms</b><extra></extra>',
            hoverlabel: { bgcolor: '#1e293b', bordercolor: '#38bdf8', font: { color: '#f8fafc', size: 13 } },
            cliponaxis: false
        };

        const layout: Partial<Plotly.Layout> = {
            xaxis: {
                title: { text: 'Lens Tray ID', font: { color: '#f8fafc', size: 12, family: 'Inter, sans-serif' }, standoff: 10 },
                tickfont: { color: '#94a3b8', size: 10, family: 'JetBrains Mono, monospace' },
                automargin: true,
                gridcolor: '#334155',
                zeroline: false,
                range: savedXRange.current || undefined,
            },
            yaxis: {
                title: { text: 'Time (ms)', font: { color: '#f8fafc', size: 12, family: 'Inter, sans-serif' }, standoff: 10 },
                tickfont: { color: '#94a3b8', size: 10, family: 'JetBrains Mono, monospace' },
                gridcolor: '#334155',
                automargin: true,
                zeroline: false,
                range: savedYRange.current || undefined,
                autorange: savedYRange.current ? false : true,
            },
            plot_bgcolor: '#0b1121',
            paper_bgcolor: '#0b1121',
            margin: { l: 50, r: 20, t: 20, b: 40 },
            autosize: true,
            showlegend: false,
            hovermode: 'closest' as const,
            uirevision: 'persistent'
        };

        const config: Partial<Plotly.Config> = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['toImage', 'sendDataToCloud', 'lasso2d', 'select2d']
        };

        requestAnimationFrame(() => {
            if (!chartRef.current) return;

            Plotly.react(chartRef.current, [trace], layout, config).then(() => {
                Plotly.Plots.resize(chartRef.current!).then(() => {
                    if (onReady) onReady();
                });

                const chartElement = chartRef.current as any;
                if (chartElement) {
                    chartElement.removeAllListeners('plotly_click');
                    chartElement.removeAllListeners('plotly_relayout');

                    chartElement.on('plotly_click', (data: any) => {
                        if (data?.points?.length) {
                            const point = data.points[0];
                            // Robust retrieval: try customdata first, fallback to array index
                            const clickedId = point.customdata ? point.customdata[1] : trayLoads[point.pointIndex].lensTrayId;
                            onLensTrayClick(clickedId);
                        }
                    });

                    chartElement.on('plotly_relayout', () => {
                        if (chartElement.layout.xaxis?.range) {
                            savedXRange.current = chartElement.layout.xaxis.range;
                        }
                        if (chartElement.layout.yaxis?.range) {
                            savedYRange.current = chartElement.layout.yaxis.range;
                        }
                    });
                }
            });
        });
    }, [trayLoads, selectedLensTray, onLensTrayClick, onReady]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (!selectedLensTray || trayLoads.length === 0) return;
            const currentIndex = trayLoads.findIndex(t => t.lensTrayId === selectedLensTray);
            if (currentIndex === -1) return;

            let newIndex = currentIndex;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                newIndex = currentIndex > 0 ? currentIndex - 1 : trayLoads.length - 1;
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                newIndex = currentIndex < trayLoads.length - 1 ? currentIndex + 1 : 0;
            }

            if (newIndex !== currentIndex) onLensTrayClick(trayLoads[newIndex].lensTrayId);
        };
        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [selectedLensTray, trayLoads, onLensTrayClick]);

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
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
            <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
        </div>
    );
}
