import { useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import Plotly from 'plotly.js-dist-min';
import type { TrayLoadData } from '../../types/logTypes';

interface Props {
    isOpen: boolean;
    operationName: string;
    trayLoads: TrayLoadData[];
    onClose: () => void;
}

export default function SubOperationComparisonModal({ isOpen, operationName, trayLoads, onClose }: Props) {
    const chartRef = useRef<HTMLDivElement>(null);

    const cleanOpName = (name: string) => {
        return name.replace(/^Sequence_/i, '').replace(/_/g, ' ');
    };

    const { chartData, avgDuration } = useMemo(() => {
        const data: { lensTrayId: string; barrelId: string; duration: number }[] = [];
        for (const trayLoad of trayLoads) {
            const subOp = trayLoad.subOperations.find(s => s.operationName === operationName);
            if (subOp) {
                data.push({
                    lensTrayId: trayLoad.lensTrayId,
                    barrelId: trayLoad.barrelId,
                    duration: subOp.actualDuration
                });
            }
        }
        const total = data.reduce((sum, d) => sum + d.duration, 0);
        const avg = data.length > 0 ? total / data.length : 0;
        return { chartData: data, avgDuration: avg };
    }, [operationName, trayLoads]);

    const updateChart = useCallback(() => {
        if (!chartRef.current || chartData.length === 0) return;

        const colors = chartData.map(d => {
            return d.duration > avgDuration * 1.2 ? '#fca5a5' : '#86efac';
        });

        const borderColors = chartData.map(d => {
            return d.duration > avgDuration * 1.2 ? '#f87171' : '#4ade80';
        });

        const formatBarText = (time: number) => {
            const SEPARATOR_GAP = '\u2009\u200A';
            return `${time.toFixed(0)}${SEPARATOR_GAP}ms`;
        };

        const trace = {
            x: chartData.map((_, i) => i), 
            y: chartData.map(d => d.duration),
            type: 'bar' as const,
            orientation: 'v' as const,
            marker: {
                color: colors,
                line: { color: borderColors, width: 2 }
            },
            text: chartData.map(d => formatBarText(d.duration)),
            textposition: 'auto' as const,
            textangle: -90,
            textfont: { size: 12, color: '#0f172a', family: 'JetBrains Mono, monospace', weight: 600 },
            customdata: chartData.map(d => [d.barrelId, d.lensTrayId]),
            hovertemplate: '<b>Lens Tray %{customdata[1]}</b><br>Barrel: <b>%{customdata[0]}</b><br>Duration: <b>%{y:.0f}ms</b><extra></extra>',
            hoverlabel: { bgcolor: '#1e293b', bordercolor: '#38bdf8', font: { color: '#f8fafc', size: 13 } },
            cliponaxis: false
        };

        const layout: Partial<Plotly.Layout> = {
            xaxis: {
                title: { text: 'Lens Tray ID', font: { color: '#f8fafc', size: 12, family: 'Inter, sans-serif' }, standoff: 10 },
                tickfont: { color: '#94a3b8', size: 10, family: 'JetBrains Mono, monospace' },
                tickvals: chartData.map((_, i) => i),
                ticktext: chartData.map(d => d.lensTrayId),
                automargin: true,
                gridcolor: '#334155',
                zeroline: false,
            },
            yaxis: {
                title: { text: 'Execution Time (ms)', font: { color: '#f8fafc', size: 12, family: 'Inter, sans-serif' }, standoff: 10 },
                tickfont: { color: '#94a3b8', size: 10, family: 'JetBrains Mono, monospace' },
                gridcolor: '#334155',
                automargin: true,
                zeroline: false,
            },
            plot_bgcolor: '#0b1121',
            paper_bgcolor: '#0b1121',
            margin: { l: 60, r: 20, t: 10, b: 50 },
            autosize: true,
            showlegend: false,
            hovermode: 'closest' as const,
        };

        const config: Partial<Plotly.Config> = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['toImage', 'sendDataToCloud', 'lasso2d', 'select2d']
        };

        Plotly.react(chartRef.current, [trace], layout, config).then(() => {
            Plotly.Plots.resize(chartRef.current!);
        });
    }, [chartData, avgDuration]);

    useEffect(() => {
        if (isOpen) {
            
            const timer = setTimeout(() => updateChart(), 100);
            return () => clearTimeout(timer);
        }
    }, [isOpen, updateChart]);

    
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        backdropFilter: 'blur(4px)',
                    }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) onClose();
                    }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.2 + 0.1 }}
                        style={{
                            backgroundColor: '#0f172a',
                            borderRadius: '12px',
                            border: '1px solid #334155',
                            width: '80%',
                            maxWidth: '900px',
                            height: '60%',
                            maxHeight: '500px',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        }}
                    >
                        {}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 16px',
                            borderBottom: '1px solid #334155',
                            backgroundColor: '#1e293b',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    color: '#f8fafc',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    fontFamily: 'Inter, sans-serif'
                                }}>
                                    {cleanOpName(operationName)} — Comparison across Lens Trays
                                </span>
                                <span style={{
                                    color: '#94a3b8',
                                    fontSize: '12px',
                                    fontFamily: 'JetBrains Mono, monospace',
                                    backgroundColor: '#0f172a',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid #334155'
                                }}>
                                    {trayLoads.filter(t => t.subOperations.some(s => s.operationName === operationName)).length} trays
                                </span>
                                {avgDuration > 0 && (
                                    <span style={{
                                        color: '#fbbf24',
                                        fontSize: '12px',
                                        fontFamily: 'JetBrains Mono, monospace',
                                        backgroundColor: 'rgba(251, 191, 36, 0.1)',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(251, 191, 36, 0.2)'
                                    }}>
                                        Avg: {avgDuration.toFixed(0)}ms
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={onClose}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#94a3b8',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = '#f8fafc')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {}
                        <div style={{ flex: 1, padding: '8px' }}>
                            <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
