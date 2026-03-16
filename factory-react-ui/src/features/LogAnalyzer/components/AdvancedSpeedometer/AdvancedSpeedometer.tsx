
import { useRef, useEffect, useState, useCallback, useMemo } from 'react';

export interface SpeedometerSegment {
    start: number;
    end: number;
    color: string;
}

export interface AdvancedSpeedometerProps {
    
    primaryValue: number;
    
    primaryLabel?: string;

    secondaryValue?: number;
    
    secondaryLabel?: string;

    mode: 'line' | 'machine';

    size?: number;

    segments?: SpeedometerSegment[];

    isOffline?: boolean;

    isLoading?: boolean;
}

const START_ANGLE = 135; 
const END_ANGLE = 405;   
const ARC_DEGREES = END_ANGLE - START_ANGLE; 

const MODE_COLORS = {
    machine: {
        primary: { main: '#22c55e', glow: 'rgba(34, 197, 94, 0.4)' },
        secondary: { main: '#38bdf8', glow: 'rgba(56, 189, 248, 0.3)' },
        needle: '#ffffff',
        background: 'rgba(30, 41, 59, 0.6)',
    },
    line: {
        primary: { main: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.4)' },
        secondary: { main: '#f97316', glow: 'rgba(249, 115, 22, 0.3)' },
        needle: '#ffffff',
        background: 'rgba(30, 41, 59, 0.6)',
    },
} as const;

const DEFAULT_SEGMENTS: SpeedometerSegment[] = [
    { start: 0, end: 70, color: '#ef4444' },   
    { start: 70, end: 85, color: '#f59e0b' },  
    { start: 85, end: 100, color: '#22c55e' }, 
];

const MAJOR_TICKS = [0, 25, 50, 75, 100];
const MINOR_TICK_INTERVAL = 5;

const degToRad = (deg: number): number => (deg * Math.PI) / 180;

const polarToCartesian = (
    cx: number,
    cy: number,
    radius: number,
    angleDeg: number
): { x: number; y: number } => {
    const rad = degToRad(angleDeg);
    return {
        x: cx + radius * Math.cos(rad),
        y: cy + radius * Math.sin(rad),
    };
};

const valueToAngle = (value: number): number => {
    const clamped = Math.max(0, Math.min(100, value));
    return START_ANGLE + (clamped / 100) * ARC_DEGREES;
};

const describeArc = (
    cx: number,
    cy: number,
    radius: number,
    startAngle: number,
    endAngle: number
): string => {
    const start = polarToCartesian(cx, cy, radius, endAngle);
    const end = polarToCartesian(cx, cy, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
};

function useNeedleAnimation(targetValue: number) {
    const [currentAngle, setCurrentAngle] = useState(() => valueToAngle(targetValue));
    const animationRef = useRef<number | null>(null);
    const velocityRef = useRef(0);
    const currentAngleRef = useRef(currentAngle);

    useEffect(() => {
        const targetAngle = valueToAngle(targetValue);

        const animate = () => {
            const current = currentAngleRef.current;
            const target = targetAngle;
            const diff = target - current;

            velocityRef.current += diff * 0.08;
            velocityRef.current *= 0.85; 

            const newAngle = current + velocityRef.current;
            currentAngleRef.current = newAngle;
            setCurrentAngle(newAngle);

            if (Math.abs(diff) > 0.01 || Math.abs(velocityRef.current) > 0.01) {
                animationRef.current = requestAnimationFrame(animate);
            }
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [targetValue]);

    return currentAngle;
}

export const AdvancedSpeedometer: React.FC<AdvancedSpeedometerProps> = ({
    primaryValue,
    primaryLabel = 'Yield',
    secondaryValue,
    secondaryLabel = 'Target',
    mode = 'machine',
    size = 300,
    segments = DEFAULT_SEGMENTS,
    isOffline = false,
    isLoading = false,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: size, height: size });

    const clampedPrimary = Math.max(0, Math.min(100, primaryValue));
    const clampedSecondary = secondaryValue !== undefined
        ? Math.max(0, Math.min(100, secondaryValue))
        : undefined;

    useEffect(() => {
        if (primaryValue > 100) {
            console.warn(`AdvancedSpeedometer: primaryValue ${primaryValue} exceeds 100, clamped to 100`);
        }
        if (secondaryValue !== undefined && secondaryValue > 100) {
            console.warn(`AdvancedSpeedometer: secondaryValue ${secondaryValue} exceeds 100, clamped to 100`);
        }
    }, [primaryValue, secondaryValue]);

    const needleAngle = useNeedleAnimation(isOffline ? 0 : clampedPrimary);

    const colors = MODE_COLORS[mode];

    const gradientId = useMemo(
        () => `adv-speedo-${Math.random().toString(36).substr(2, 9)}`,
        []
    );

    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                const { width, height } = entry.contentRect;
                const minDim = Math.min(width, height);
                setDimensions({ width: minDim, height: minDim });
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const actualSize = Math.min(dimensions.width, dimensions.height, size);
    const cx = actualSize / 2;
    const cy = actualSize / 2;
    const outerRadius = (actualSize - 40) / 2;
    const innerRadius = outerRadius * 0.7;
    const outerStroke = actualSize * 0.06;
    const innerStroke = actualSize * 0.04;

    const getValueColor = useCallback((value: number) => {
        const seg = segments.find(s => value >= s.start && value <= s.end);
        return seg?.color ?? '#ffffff';
    }, [segments]);

    const ticks = useMemo(() => {
        const result: { value: number; isMajor: boolean; angle: number }[] = [];

        for (let v = 0; v <= 100; v += MINOR_TICK_INTERVAL) {
            result.push({
                value: v,
                isMajor: MAJOR_TICKS.includes(v),
                angle: valueToAngle(v),
            });
        }

        return result;
    }, []);

    if (isOffline || isLoading) {
        return (
            <div
                ref={containerRef}
                style={{
                    width: size,
                    height: size,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                }}
            >
                <svg
                    width={actualSize}
                    height={actualSize}
                    viewBox={`0 0 ${actualSize} ${actualSize}`}
                    style={{ overflow: 'visible' }}
                >
                    {}
                    <path
                        d={describeArc(cx, cy, outerRadius, START_ANGLE, END_ANGLE)}
                        fill="none"
                        stroke="rgba(100, 116, 139, 0.3)"
                        strokeWidth={outerStroke}
                        strokeLinecap="round"
                        style={{
                            animation: isLoading ? 'pulse 1.5s ease-in-out infinite' : undefined,
                        }}
                    />

                    {}
                    <text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="rgba(148, 163, 184, 0.8)"
                        fontSize={actualSize * 0.08}
                        fontWeight="600"
                        fontFamily="Inter, system-ui, sans-serif"
                    >
                        {isLoading ? 'LOADING...' : 'OFFLINE'}
                    </text>
                </svg>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            style={{
                width: size,
                height: size,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
            }}
        >
            <svg
                width={actualSize}
                height={actualSize}
                viewBox={`0 0 ${actualSize} ${actualSize}`}
                style={{ overflow: 'visible' }}
                aria-label={`${primaryLabel}: ${clampedPrimary.toFixed(1)}%`}
                role="img"
            >
                {}
                <defs>
                    {}
                    <filter id={`${gradientId}-glow`} x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>

                    {}
                    <filter id={`${gradientId}-needle-shadow`} x="-50%" y="-50%" width="200%" height="200%">
                        <feDropShadow dx="2" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.5)" />
                    </filter>

                    {}
                    {segments.map((seg, idx) => (
                        <linearGradient
                            key={idx}
                            id={`${gradientId}-seg-${idx}`}
                            x1="0%"
                            y1="0%"
                            x2="100%"
                            y2="100%"
                        >
                            <stop offset="0%" stopColor={seg.color} stopOpacity="1" />
                            <stop offset="100%" stopColor={seg.color} stopOpacity="0.7" />
                        </linearGradient>
                    ))}

                    {}
                    <radialGradient id={`${gradientId}-glass`} cx="30%" cy="30%">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
                        <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
                    </radialGradient>
                </defs>

                {}
                <circle
                    cx={cx}
                    cy={cy}
                    r={outerRadius + outerStroke / 2 + 10}
                    fill={`url(#${gradientId}-glass)`}
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="1"
                />

                {}
                <path
                    d={describeArc(cx, cy, outerRadius, START_ANGLE, END_ANGLE)}
                    fill="none"
                    stroke="rgba(100, 116, 139, 0.2)"
                    strokeWidth={outerStroke}
                    strokeLinecap="round"
                />

                {}
                {segments.map((segment, idx) => {
                    const segStart = START_ANGLE + (segment.start / 100) * ARC_DEGREES;
                    const segEnd = START_ANGLE + (segment.end / 100) * ARC_DEGREES;

                    return (
                        <path
                            key={idx}
                            d={describeArc(cx, cy, outerRadius, segStart, segEnd)}
                            fill="none"
                            stroke={`url(#${gradientId}-seg-${idx})`}
                            strokeWidth={outerStroke}
                            strokeLinecap="round"
                        />
                    );
                })}

                {}
                {clampedSecondary !== undefined && (
                    <>
                        {}
                        <path
                            d={describeArc(cx, cy, innerRadius, START_ANGLE, END_ANGLE)}
                            fill="none"
                            stroke="rgba(100, 116, 139, 0.15)"
                            strokeWidth={innerStroke}
                            strokeLinecap="round"
                        />

                        {}
                        <path
                            d={describeArc(
                                cx,
                                cy,
                                innerRadius,
                                START_ANGLE,
                                valueToAngle(clampedSecondary)
                            )}
                            fill="none"
                            stroke={colors.secondary.main}
                            strokeWidth={innerStroke}
                            strokeLinecap="round"
                            filter={`url(#${gradientId}-glow)`}
                            style={{
                                transition: 'stroke-dashoffset 0.3s ease-out',
                            }}
                        />
                    </>
                )}

                {}
                {ticks.map((tick, idx) => {
                    const tickLength = tick.isMajor ? 12 : 6;
                    const innerTickRadius = outerRadius + outerStroke / 2 + 4;
                    const outerTickRadius = innerTickRadius + tickLength;

                    const inner = polarToCartesian(cx, cy, innerTickRadius, tick.angle);
                    const outer = polarToCartesian(cx, cy, outerTickRadius, tick.angle);

                    return (
                        <g key={idx}>
                            <line
                                x1={inner.x}
                                y1={inner.y}
                                x2={outer.x}
                                y2={outer.y}
                                stroke={tick.isMajor ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)'}
                                strokeWidth={tick.isMajor ? 2 : 1}
                                strokeLinecap="round"
                            />

                            {}
                            {tick.isMajor && (
                                <text
                                    x={polarToCartesian(cx, cy, outerTickRadius + 14, tick.angle).x}
                                    y={polarToCartesian(cx, cy, outerTickRadius + 14, tick.angle).y}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fill="rgba(255,255,255,0.7)"
                                    fontSize={actualSize * 0.04}
                                    fontWeight="600"
                                    fontFamily="Inter, system-ui, sans-serif"
                                >
                                    {tick.value}
                                </text>
                            )}
                        </g>
                    );
                })}

                {}
                {(() => {
                    const needleLength = innerRadius - 10;
                    const baseWidth = actualSize * 0.025;

                    const perpAngle = needleAngle + 90;
                    const perpRad = degToRad(perpAngle);

                    const baseLeft = {
                        x: cx + Math.cos(perpRad) * baseWidth,
                        y: cy + Math.sin(perpRad) * baseWidth,
                    };
                    const baseRight = {
                        x: cx - Math.cos(perpRad) * baseWidth,
                        y: cy - Math.sin(perpRad) * baseWidth,
                    };

                    const tip = polarToCartesian(cx, cy, needleLength, needleAngle);

                    return (
                        <polygon
                            points={`${baseLeft.x},${baseLeft.y} ${tip.x},${tip.y} ${baseRight.x},${baseRight.y}`}
                            fill={colors.needle}
                            filter={`url(#${gradientId}-needle-shadow)`}
                        />
                    );
                })()}

                {}
                <circle
                    cx={cx}
                    cy={cy}
                    r={actualSize * 0.06}
                    fill="linear-gradient(135deg, #ffffff, #e2e8f0)"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="2"
                />
                <circle
                    cx={cx}
                    cy={cy}
                    r={actualSize * 0.04}
                    fill={getValueColor(clampedPrimary)}
                />

                {}
                <text
                    x={cx}
                    y={cy + outerRadius * 0.55}
                    textAnchor="middle"
                    fill={getValueColor(clampedPrimary)}
                    fontSize={actualSize * 0.12}
                    fontWeight="700"
                    fontFamily="Inter, system-ui, sans-serif"
                    style={{ textShadow: `0 0 10px ${getValueColor(clampedPrimary)}40` }}
                >
                    {clampedPrimary.toFixed(1)}%
                </text>

                {}
                <text
                    x={cx}
                    y={cy + outerRadius * 0.75}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.6)"
                    fontSize={actualSize * 0.045}
                    fontWeight="500"
                    fontFamily="Inter, system-ui, sans-serif"
                >
                    {primaryLabel.toUpperCase()}
                </text>

                {}
                {clampedSecondary !== undefined && (
                    <text
                        x={cx}
                        y={cy - outerRadius * 0.3}
                        textAnchor="middle"
                        fill={colors.secondary.main}
                        fontSize={actualSize * 0.06}
                        fontWeight="600"
                        fontFamily="Inter, system-ui, sans-serif"
                    >
                        {secondaryLabel}: {clampedSecondary.toFixed(1)}%
                    </text>
                )}

                {}
                <text
                    x={cx}
                    y={actualSize - 10}
                    textAnchor="middle"
                    fill="rgba(148, 163, 184, 0.5)"
                    fontSize={actualSize * 0.03}
                    fontWeight="500"
                    fontFamily="Inter, system-ui, sans-serif"
                    style={{ textTransform: 'uppercase' }}
                >
                    {mode === 'machine' ? 'MACHINE VIEW' : 'LINE VIEW'}
                </text>
            </svg>
        </div>
    );
};

export default AdvancedSpeedometer;
