import { useEffect, useRef, useCallback } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { BarrelTray } from '../../types/logTypes';
import { useArrowKeyNav, useClickDrillPattern } from './UnifiedDrillLayout';
import { useLogAnalyzerLocalSettingsSafe } from '../../features/LogAnalyzer/context/LogAnalyzerLocalSettingsContext';

interface Props {
    trays: BarrelTray[];
    selectedTrayId: string | null;
    onTraySelect: (trayId: string) => void;
    onTrayDrill: (trayId: string) => void;
    onReady?: () => void;
}



/**
 * Level 1 — One candle per barrel tray.
 *
 * Same visual style as BarrelExecutionChart:
 * - Green/Red threshold-based colors (saturated when selected)
 * - Click = select, Double-click = drill
 * - ← → keyboard navigation with hint toast
 * - Zoom/pan state preserved
 */
export default function TrayBarChart({ trays, selectedTrayId, onTraySelect, onTrayDrill, onReady }: Props) {
    const chartRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<ResizeObserver | null>(null);
    const resizeInProgress = useRef(false);
    const isFirstRender = useRef(true);

    const { settings: localSettings } = useLogAnalyzerLocalSettingsSafe();
    const thresholdMs = localSettings.idealTrayTimeMs;

    const savedXRange = useRef<[number, number] | null>(null);
    const savedYRange = useRef<[number, number] | null>(null);

    // Click/double-click pattern
    const handleClick = useClickDrillPattern(
        (id) => onTraySelect(id as string),
        (id) => onTrayDrill(id as string),
    );

    // Keyboard ← → navigation
    const selectedTray = trays.find(t => t.barrelTrayId === selectedTrayId) ?? null;
    const { containerRef, showHint } = useArrowKeyNav(
        trays,
        selectedTray,
        (t) => t.barrelTrayId,
        (t) => onTraySelect(t.barrelTrayId),
    );

    useEffect(() => {
        if (selectedTrayId !== null) {
            showHint('trays');
        }
    }, [selectedTrayId, showHint]);

    const safeResize = useCallback(() => {
        if (!chartRef.current || resizeInProgress.current) return;
        resizeInProgress.current = true;
        Plotly.Plots.resize(chartRef.current)
            .then(() => { resizeInProgress.current = false; })
            .catch(() => { resizeInProgress.current = false; });
    }, []);

    const updateChart = useCallback(() => {
        if (!chartRef.current || trays.length === 0) return;

        const xData = trays.map((_, i) => i);
        const yData = trays.map(t => t.totalDuration);
        const labels = trays.map(t => t.barrelTrayId);

        const colors = trays.map(t => {
            const isSelected = selectedTrayId !== null && t.barrelTrayId === selectedTrayId;
            const isAboveThreshold = t.totalDuration > thresholdMs;

            if (isSelected) {
                return isAboveThreshold ? '#dc2626' : '#16a34a';
            } else {
                return isAboveThreshold ? '#fca5a5' : '#86efac';
            }
        });

        const borderColors = trays.map(t => {
            const isSelected = selectedTrayId !== null && t.barrelTrayId === selectedTrayId;
            const isAboveThreshold = t.totalDuration > thresholdMs;

            if (isSelected) {
                return isAboveThreshold ? '#991b1b' : '#15803d';
            } else {
                return isAboveThreshold ? '#f87171' : '#4ade80';
            }
        });

        const formatBarText = (time: number) => {
            const SEPARATOR_GAP = '\u2009\u200A';
            if (time >= 60000) return `${(time / 60000).toFixed(1)}${SEPARATOR_GAP}min`;
            if (time >= 1000) return `${(time / 1000).toFixed(1)}${SEPARATOR_GAP}s`;
            return `${time.toFixed(0)}${SEPARATOR_GAP}ms`;
        };

        const trace = {
            x: xData,
            y: yData,
            type: 'bar' as const,
            marker: { color: colors, line: { color: borderColors, width: 2 } },
            text: yData.map(y => formatBarText(y)),
            textposition: 'auto' as const,
            textangle: -90,
            textfont: { size: 12, color: '#0f172a', family: 'JetBrains Mono, monospace', weight: 600 },
            customdata: trays.map(t => [t.barrelTrayId, t.barrels.length, t.isIncomplete ? 'Incomplete' : 'Complete']),
            hovertemplate: '<b>Tray %{customdata[0]}</b><br>Barrels: <b>%{customdata[1]}</b><br>Status: %{customdata[2]}<br>Duration: <b>%{y:.0f}ms</b><extra></extra>',
            hoverlabel: { bgcolor: '#1e293b', bordercolor: '#38bdf8', font: { color: '#f8fafc', size: 13 } },
            cliponaxis: false
        };

        const layout: Partial<Plotly.Layout> = {
            xaxis: {
                title: { text: 'Barrel Tray', font: { color: '#f8fafc', size: 12, family: 'Inter, sans-serif' }, standoff: 10 },
                tickfont: { color: '#94a3b8', size: 9, family: 'JetBrains Mono, monospace' },
                tickvals: xData,
                ticktext: labels,
                automargin: true,
                gridcolor: '#334155',
                zeroline: false,
                range: savedXRange.current || undefined,
            },
            yaxis: {
                title: { text: 'Duration (ms)', font: { color: '#f8fafc', size: 12, family: 'Inter, sans-serif' }, standoff: 10 },
                tickfont: { color: '#94a3b8', size: 10, family: 'JetBrains Mono, monospace' },
                gridcolor: '#334155',
                automargin: true,
                zeroline: false,
                range: savedYRange.current || undefined,
                autorange: savedYRange.current ? false : true,
            },
            plot_bgcolor: '#0b1121',
            paper_bgcolor: '#0b1121',
            margin: { l: 60, r: 20, t: 20, b: 50 },
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

                const el = chartRef.current as any;
                if (el) {
                    el.removeAllListeners('plotly_click');
                    el.removeAllListeners('plotly_relayout');

                    el.on('plotly_click', (data: any) => {
                        if (data?.points?.length) {
                            const idx = data.points[0].pointIndex;
                            handleClick(trays[idx].barrelTrayId);
                        }
                    });

                    el.on('plotly_relayout', () => {
                        if (el.layout.xaxis && el.layout.xaxis.range) {
                            savedXRange.current = el.layout.xaxis.range;
                        }
                        if (el.layout.yaxis && el.layout.yaxis.range) {
                            savedYRange.current = el.layout.yaxis.range;
                        }
                    });
                }
            });
        });
    }, [trays, selectedTrayId, handleClick, onReady, thresholdMs]);

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
