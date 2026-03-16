
import React, { useMemo } from 'react';

export interface SpeedometerSegment {
    start: number;
    end: number;
    color: string;
}

export interface SpeedometerProps {
    value: number;
    size?: number;
    strokeWidth?: number;
    segments: SpeedometerSegment[];
    
    label?: string;
    
    hideValue?: boolean;
    
    showTicks?: boolean;
    
    showValuePoints?: boolean;
}

const START_ANGLE = 135;
const END_ANGLE = 405;
const ARC_DEGREES = END_ANGLE - START_ANGLE;

const COLORS = {
    red: { main: '#ef4444', light: '#f87171', dark: '#dc2626' },
    yellow: { main: '#f59e0b', light: '#fbbf24', dark: '#d97706' },
    green: { main: '#22c55e', light: '#4ade80', dark: '#16a34a' },
} as const;

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

const getGradientType = (color: string): 'red' | 'yellow' | 'green' => {
    if (color.includes('ef4444') || color.includes('dc2626')) return 'red';
    if (color.includes('f59e0b') || color.includes('d97706')) return 'yellow';
    return 'green';
};

export const Speedometer: React.FC<SpeedometerProps> = ({
    value,
    size = 100,
    strokeWidth = 8,
    segments,
    label,
    hideValue = false,
    showTicks = true,
    showValuePoints = false,
}) => {
    const cx = size / 2;
    const cy = size / 2;
    const radius = (size - strokeWidth) / 2;
    const clampedValue = Math.max(0, Math.min(100, value));

    const needleAngle = START_ANGLE + (clampedValue / 100) * ARC_DEGREES;
    const centerDotRadius = Math.max(3, size / 25);

    const currentSegment = segments.find(
        (seg) => clampedValue >= seg.start && clampedValue <= seg.end
    );
    const valueColor = currentSegment?.color ?? '#ffffff';

    const gradientId = useMemo(
        () => `speedo-${Math.random().toString(36).substr(2, 9)}`,
        []
    );

    const tickLabels = useMemo(() => {
        if (!showTicks) return [];
        return segments.slice(1).map((seg) => {
            const tickAngle = START_ANGLE + (seg.start / 100) * ARC_DEGREES;
            
            const tickRadius = radius + strokeWidth + 8;
            const pos = polarToCartesian(cx, cy, tickRadius, tickAngle);
            return { value: seg.start, x: pos.x, y: pos.y };
        });
    }, [segments, cx, cy, radius, strokeWidth, showTicks]);

    const valueMarkLines = useMemo(() => {
        if (!showValuePoints) return [];

        const roundedValue = Math.round(clampedValue);
        const marks: { value: number; pos: number; isPriority: boolean }[] = [];

        segments.forEach(seg => {
            if (seg.end > 0 && seg.end < 100) {
                marks.push({ value: seg.end, pos: seg.end, isPriority: true });
            }
        });

        const neighbors: { label: number; visualOffset: number }[] = [];

        if (roundedValue <= 0) {
            neighbors.push({ label: 0, visualOffset: 0 }); 
            neighbors.push({ label: 1, visualOffset: 3 }); 
        } else if (roundedValue >= 100) {
            neighbors.push({ label: 99, visualOffset: -3 }); 
            neighbors.push({ label: 100, visualOffset: 0 }); 
        } else {

            neighbors.push({ label: roundedValue - 1, visualOffset: -3 });
            neighbors.push({ label: roundedValue + 1, visualOffset: 3 });
        }

        neighbors.forEach(n => {
            const visualPos = Math.max(0, Math.min(100, roundedValue + n.visualOffset));

            const collision = marks.some(m => Math.abs(m.pos - visualPos) < 2.0);

            const exactMatch = marks.find(m => m.value === n.label);

            if (!exactMatch && !collision) {
                marks.push({ value: n.label, pos: visualPos, isPriority: false });
            }
        });

        const finalMarks: {
            value: number;
            isCurrent: boolean;
            innerX: number;
            innerY: number;
            outerX: number;
            outerY: number;
            labelX: number;
            labelY: number;
        }[] = [];

        marks.sort((a: any, b: any) => a.pos - b.pos).forEach((mark: any) => {
            const pointAngle = START_ANGLE + (mark.pos / 100) * ARC_DEGREES;

            const isCurrent = false;

            const lineLength = 12;
            const innerRadius = radius + strokeWidth / 2 - (lineLength / 2);
            const outerRadius = radius + strokeWidth / 2 + (lineLength / 2);

            const labelRadius = outerRadius + 8;

            const innerPos = polarToCartesian(cx, cy, innerRadius, pointAngle);
            const outerPos = polarToCartesian(cx, cy, outerRadius, pointAngle);
            const labelPos = polarToCartesian(cx, cy, labelRadius, pointAngle);

            finalMarks.push({
                value: mark.value,
                isCurrent,
                innerX: innerPos.x,
                innerY: innerPos.y,
                outerX: outerPos.x,
                outerY: outerPos.y,
                labelX: labelPos.x,
                labelY: labelPos.y,
            });
        });

        return finalMarks;
    }, [showValuePoints, clampedValue, cx, cy, radius, strokeWidth, segments]);

    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{ overflow: 'visible' }}
            aria-label={`Yield: ${clampedValue.toFixed(1)}%`}
            role="img"
        >
            {}
            <defs>
                {(['red', 'yellow', 'green'] as const).map((type) => (
                    <linearGradient
                        key={type}
                        id={`${gradientId}-${type}`}
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                    >
                        <stop offset="0%" stopColor={COLORS[type].light} />
                        <stop offset="50%" stopColor={COLORS[type].main} />
                        <stop offset="100%" stopColor={COLORS[type].dark} />
                    </linearGradient>
                ))}
            </defs>

            {}
            <path
                d={describeArc(cx, cy, radius, START_ANGLE, END_ANGLE)}
                fill="none"
                stroke="rgba(128,128,128,0.2)"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
            />

            {}
            {segments.map((segment, idx) => {
                const segStart = START_ANGLE + (segment.start / 100) * ARC_DEGREES;
                const segEnd = START_ANGLE + (segment.end / 100) * ARC_DEGREES;
                const gradientType = getGradientType(segment.color);

                return (
                    <path
                        key={idx}
                        d={describeArc(cx, cy, radius, segStart, segEnd)}
                        fill="none"
                        stroke={`url(#${gradientId}-${gradientType})`}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                    />
                );
            })}

            {}
            {tickLabels.map((tick, idx) => (
                <text
                    key={idx}
                    x={tick.x}
                    y={tick.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="rgba(255,255,255,0.8)"
                    fontSize={Math.max(8, size / 8)}
                    fontWeight="600"
                    fontFamily="system-ui, sans-serif"
                >
                    {tick.value}
                </text>
            ))}

            {}
            {valueMarkLines.map((mark, idx) => (
                <g key={idx}>
                    {}
                    <line
                        x1={mark.innerX}
                        y1={mark.innerY}
                        x2={mark.outerX}
                        y2={mark.outerY}
                        stroke={mark.isCurrent ? valueColor : 'rgba(255,255,255,0.8)'}
                        strokeWidth={2}
                        strokeLinecap="round"
                    />

                    {}
                    <text
                        x={mark.labelX}
                        y={mark.labelY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={mark.isCurrent ? valueColor : 'rgba(255,255,255,0.9)'}
                        fontSize={mark.isCurrent ? Math.max(10, size / 9) : Math.max(9, size / 11)}
                        fontWeight={mark.isCurrent ? 700 : 600}
                        fontFamily="system-ui, sans-serif"
                    >
                        {mark.value}
                    </text>
                </g>
            ))}

            {}
            {(() => {
                
                const needleLength = radius - strokeWidth - 2;

                const baseWidth = Math.max(2, size / 40);

                const perpAngle = needleAngle + 90;
                const perpRad = (perpAngle * Math.PI) / 180;

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
                        fill="#ffffff"
                        stroke="none"
                    />
                );
            })()}

            {}
            <circle
                cx={cx}
                cy={cy}
                r={centerDotRadius}
                fill="#ffffff"
            />

            {}
            {label && (
                <text
                    x={cx}
                    y={cy + radius * 0.5}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.6)"
                    fontSize={Math.max(8, size / 10)}
                    fontFamily="system-ui, sans-serif"
                >
                    {label}
                </text>
            )}

            {}
            {!hideValue && (
                <text
                    x={cx}
                    y={cy + radius * 0.95} 
                    textAnchor="middle"
                    fill={valueColor}
                    fontSize={size / 5}
                    fontWeight="bold"
                    fontFamily="system-ui, sans-serif"
                >
                    {clampedValue.toFixed(1)}%
                </text>
            )}
        </svg>
    );
};

export default Speedometer;
