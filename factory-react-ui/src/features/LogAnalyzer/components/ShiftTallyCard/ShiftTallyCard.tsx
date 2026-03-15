import React, { useEffect, useState } from 'react';
import { Sun, Moon, TrendingUp, Layers, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { ShiftService, ShiftSummary } from '../../../../services/ShiftService';

import { useLogAnalyzerSettings } from '../../context';

export const ShiftTallyCard: React.FC = () => {
    const { settings } = useLogAnalyzerSettings();
    const [summary, setSummary] = useState<ShiftSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [timeElapsed, setTimeElapsed] = useState(0); 

    
    const isHistory = settings.dateRange.mode === 'custom' && !!settings.dateRange.customFrom;

    const fetchSummary = async () => {
        try {
            setLoading(true);

            if (isHistory && settings.dateRange.customFrom) {
                
                const targetDate = new Date(settings.dateRange.customFrom);
                const dailyData = await ShiftService.getShiftSummary(targetDate);

                
                
                
                setSummary(dailyData.dayShift);
                setTimeElapsed(100); 
            } else {
                
                const data = await ShiftService.getCurrentShift();
                setSummary(data);

                
                if (data.startTime && data.endTime) {
                    const start = new Date(data.startTime).getTime();
                    const end = new Date(data.endTime).getTime();
                    const now = new Date().getTime();

                    const total = end - start;
                    const current = now - start;
                    const pct = Math.min(100, Math.max(0, (current / total) * 100));
                    setTimeElapsed(pct);
                }
            }
        } catch (err) {
            console.error("Failed to fetch shift summary", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSummary();
        const interval = setInterval(fetchSummary, 60000); 
        return () => clearInterval(interval);
    }, [settings.dateRange]); 

    if (loading && !summary) return <div className="animate-pulse h-24 bg-gray-100 rounded-lg"></div>;
    if (!summary) return null;

    const isDay = summary.shiftName?.toLowerCase().includes('day');
    const Icon = isDay ? Sun : Moon;
    const colorClass = isDay ? 'text-orange-500' : 'text-indigo-400';
    const bgClass = isDay ? 'bg-orange-50' : 'bg-indigo-50';
    const borderClass = isDay ? 'border-orange-100' : 'border-indigo-100';

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-xl border ${borderClass} ${bgClass} shadow-sm mb-6 relative`}
        >
            {isHistory && (
                <div className="absolute top-2 right-2 text-[10px] uppercase font-bold tracking-wider text-gray-400 border border-gray-200 px-2 py-0.5 rounded bg-white/50">
                    Res: {settings.dateRange.customFrom}
                </div>
            )}

            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                {}

                {}
                <div className="flex items-center gap-3 min-w-[200px]">
                    <div className={`p-3 rounded-full bg-white shadow-sm ${colorClass}`}>
                        <Icon size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 text-lg">
                            {summary.shiftName} Shift
                        </h3>
                        <p className="text-sm text-gray-500 font-medium">
                            {new Date(summary.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                            {new Date(summary.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                </div>

                {}
                <div className="hidden md:block w-px h-12 bg-gray-200 mx-4"></div>

                {}
                <div className="flex-1 grid grid-cols-3 gap-6 w-full">

                    {}
                    <div className="flex flex-col items-center md:items-start">
                        <div className="flex items-center gap-1.5 text-gray-500 text-xs uppercase font-bold tracking-wider mb-1">
                            <Layers size={14} /> Trays
                        </div>
                        <span className="text-2xl font-bold text-gray-800">
                            {summary.trayCount.toLocaleString()}
                        </span>
                    </div>

                    {}
                    <div className="flex flex-col items-center md:items-start">
                        <div className="flex items-center gap-1.5 text-gray-500 text-xs uppercase font-bold tracking-wider mb-1">
                            <TrendingUp size={14} /> Yield
                        </div>
                        <span className={`text-2xl font-bold ${summary.averageYield >= 95 ? 'text-green-600' : summary.averageYield >= 85 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {summary.averageYield.toFixed(1)}%
                        </span>
                    </div>

                    {}
                    <div className="flex flex-col items-center md:items-start">
                        <div className="flex items-center gap-1.5 text-gray-500 text-xs uppercase font-bold tracking-wider mb-1">
                            <CheckCircle size={14} /> Good
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-bold text-gray-800">
                                {summary.totalGood.toLocaleString()}
                            </span>
                            <span className="text-sm text-gray-400">
                                / {summary.totalProcessed.toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>

                {}
                <div className="hidden md:flex flex-col w-32 gap-1">
                    <div className="flex justify-between text-xs text-gray-500 font-medium">
                        <span>Time Elapsed</span>
                        <span>{Math.round(timeElapsed)}%</span>
                    </div>
                    <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                        <motion.div
                            className={`h-full ${isDay ? 'bg-orange-400' : 'bg-indigo-400'}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${timeElapsed}%` }}
                            transition={{ duration: 1 }}
                        />
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
