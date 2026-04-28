
import { memo } from 'react';
import { Speedometer } from '../Speedometer';
import { useLogAnalyzerSettingsSafe } from '../../context';

export interface MachineYieldData {
    mcId: number;
    mcNumber: number;
    yield: number;
}

export interface SpeedometerComparisonProps {
    machines: MachineYieldData[];
    bestMcId?: number;
    worstMcId?: number;
}

export const SpeedometerComparison = memo(function SpeedometerComparison({
    machines,
    bestMcId,
    worstMcId,
}: SpeedometerComparisonProps) {
    const { getSegments } = useLogAnalyzerSettingsSafe();
    const segments = getSegments();

    return (
        <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 16,
            padding: '12px 0',
        }}>
            {machines.map((machine) => {
                const isBest = machine.mcId === bestMcId;
                const isWorst = machine.mcId === worstMcId;

                return (
                    <div
                        key={machine.mcId}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 6,
                            padding: 8,
                            borderRadius: 8,
                            background: isBest
                                ? 'rgba(34, 197, 94, 0.1)'
                                : isWorst
                                    ? 'rgba(239, 68, 68, 0.1)'
                                    : 'transparent',
                            border: isBest
                                ? '1px solid rgba(34, 197, 94, 0.3)'
                                : isWorst
                                    ? '1px solid rgba(239, 68, 68, 0.3)'
                                    : '1px solid transparent',
                        }}
                    >
                        <Speedometer
                            value={machine.yield}
                            size={80}
                            strokeWidth={6}
                            segments={segments}
                            showTicks
                        />
                        <div style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: isBest ? '#22c55e' : isWorst ? '#ef4444' : 'var(--text-main)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                        }}>
                            MC-{machine.mcNumber}
                            {isBest && <span>★</span>}
                            {isWorst && <span>⚠️</span>}
                        </div>
                        <div style={{
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            color: machine.yield >= 95 ? '#22c55e' : machine.yield >= 85 ? '#f59e0b' : '#ef4444',
                        }}>
                            {machine.yield.toFixed(1)}%
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

export default SpeedometerComparison;
