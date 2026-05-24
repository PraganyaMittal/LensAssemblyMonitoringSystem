import { useEffect, useRef, useCallback } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { Barrel } from '../../types/logTypes';
import { useArrowKeyNav, useClickDrillPattern } from './UnifiedDrillLayout';
import { useLogAnalyzerLocalSettingsSafe } from '../../features/LogAnalyzer/context/LogAnalyzerLocalSettingsContext';

interface Props {
    barrels: Barrel[];
    trayId: string;
    selectedBarrelId: number | null;
    onBarrelSelect: (barrelId: number) => void;
    onBarrelDrill: (barrelId: number) => void;
    onReady?: () => void;
}



/**
 * Bar chart for barrels within a single tray.
 *
 * Exact visual parity with BarrelExecutionChart:
 * - Green/Red threshold-based colors
 * - Selected barrel highlighted (saturated)
 * - Click = select, Double-click = drill
 * - ← → keyboard navigation with hint toast
 * - Zoom/pan state preserved
 * - Original tooltip format: Barrel {x}, Tray: {trayId}, Time: {y}ms
 */
export default function BarrelBarChart({ barrels, trayId, selectedBarrelId, onBarrelSelect, onBarrelDrill, onReady }: Props) {
    const chartRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<ResizeObserver | null>(null);
    const resizeInProgress = useRef(false);
    const isFirstRender = useRef(true);

    const { settings: localSettings } = useLogAnalyzerLocalSettingsSafe();
    const thresholdMs = localSettings.idealBarrelTimeMs;

    const savedXRange = useRef<[number, number] | null>(null);
    const savedYRange = useRef<[number, number] | null>(null);

    // Click/double-click pattern
    const handleClick = useClickDrillPattern(
        (id) => onBarrelSelect(id as number),
        (id) => onBarrelDrill(id as number),
    );

    // Keyboard ← → navigation
    const selectedBarrel = barrels.find(b => b.barrelId === selectedBarrelId) ?? null;
    const { containerRef, showHint } = useArrowKeyNav(
        barrels,
        selectedBarrel,
        (b) => b.barrelId,
        (b) => onBarrelSelect(b.barrelId),
    );

    // Show hint when first barrel is selected
    useEffect(() => {
        if (selectedBarrelId !== null) {
            showHint('barrels');
        }
    }, [selectedBarrelId, showHint]);

    const safeResize = useCallback(() => {
        if (!chartRef.current || resizeInProgress.current) return;
        resizeInProgress.current = true;
        Plotly.Plots.resize(chartRef.current)
            .then(() => { resizeInProgress.current = false; })
            .catch(() => { resizeInProgress.current = false; });
    }, []);

    const updateChart = useCallback(() => {
        if (!chartRef.current || barrels.length === 0) return;

        const barrelCount = barrels.length;
        const xData = barrels.map(b => b.barrelId);
        const yData = barrels.map(b => b.totalDuration);

        const colors = barrels.map(b => {
            const isSelected = selectedBarrelId !== null && b.barrelId === selectedBarrelId;
            const isAboveThreshold = b.totalDuration > thresholdMs;

            if (isSelected) {
                return isAboveThreshold ? '#dc2626' : '#16a34a';
            } else {
                return isAboveThreshold ? '#fca5a5' : '#86efac';
            }
        });

        const borderColors = barrels.map(b => {
            const isSelected = selectedBarrelId !== null && b.barrelId === selectedBarrelId;
            const isAboveThreshold = b.totalDuration > thresholdMs;

            if (isSelected) {
                return isAboveThreshold ? '#991b1b' : '#15803d';
            } else {
                return isAboveThreshold ? '#f87171' : '#4ade80';
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

        const initialTickGap = calculateTickGap(0, barrelCount);
        const showRangeSlider = barrelCount > 50;

        const trace = {
            x: xData,
            y: yData,
            type: 'bar' as const,
            marker: { color: colors, line: { color: borderColors, width: 2 } },
            text: yData.map(y => formatBarText(y)),
            textposition: 'auto' as const,
            textangle: -90,
            textfont: { size: 12, color: '#0f172a', family: 'JetBrains Mono, monospace', weight: 600 },
            customdata: barrels.map(b => [b.barrelTrayId || trayId]),
            hovertemplate: '<b>Barrel %{x}</b><br>Tray: <b>%{customdata[0]}</b><br>Time: <b>%{y:.0f}ms</b><extra></extra>',
            hoverlabel: { bgcolor: '#1e293b', bordercolor: '#38bdf8', font: { color: '#f8fafc', size: 13 } },
            cliponaxis: false
        };

        const layout: Partial<Plotly.Layout> = {
            xaxis: {
                title: { text: `Barrel ID (Tray ${trayId})`, font: { color: '#f8fafc', size: 12, family: 'Inter, sans-serif' }, standoff: 10 },
                tickfont: { color: '#94a3b8', size: 10, family: 'JetBrains Mono, monospace' },
                dtick: initialTickGap,
                rangeslider: showRangeSlider ? { visible: true, bgcolor: '#1e293b', thickness: 0.1 } : { visible: false },
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
            margin: { l: 50, r: 20, t: 20, b: showRangeSlider ? 60 : 40 },
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
                            const barrelId = barrels[data.points[0].pointIndex].barrelId as number;
                            handleClick(barrelId);
                        }
                    });

                    chartElement.on('plotly_relayout', (eventData: any) => {
                        if (chartElement.layout.xaxis && chartElement.layout.xaxis.range) {
                            savedXRange.current = chartElement.layout.xaxis.range;
                        }
                        if (chartElement.layout.yaxis && chartElement.layout.yaxis.range) {
                            savedYRange.current = chartElement.layout.yaxis.range;
                        }

                        if (eventData['xaxis.range[0]'] !== undefined) {
                            const start = Math.max(0, Math.floor(eventData['xaxis.range[0]']));
                            const end = Math.min(barrelCount, Math.ceil(eventData['xaxis.range[1]']));
                            Plotly.relayout(chartElement, { 'xaxis.dtick': calculateTickGap(start, end) });
                        }
                    });
                }
            });
        });
    }, [barrels, trayId, selectedBarrelId, handleClick, onReady, thresholdMs]);

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
