/**
 * Speedometer - Glossy SVG Yield Gauge Component
 *
 * A configurable arc gauge with:
 * - Glossy gradient color segments
 * - Properly anchored needle
 * - Tick labels with adequate spacing
 * - Optional internal label
 */
import React, { useMemo } from 'react';

// =============================================================================
// TYPES
// =============================================================================

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
    /** Label displayed inside the gauge (e.g., "Preview") */
    label?: string;
    /** Hide value text (for external display) */
    hideValue?: boolean;
    /** Show tick labels at segment boundaries */
    showTicks?: boolean;
    /** Show value points (±2 around current value) */
    showValuePoints?: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const START_ANGLE = 135;
const END_ANGLE = 405;
const ARC_DEGREES = END_ANGLE - START_ANGLE;

const COLORS = {
    red: { main: '#ef4444', light: '#f87171', dark: '#dc2626' },
    yellow: { main: '#f59e0b', light: '#fbbf24', dark: '#d97706' },
    green: { main: '#22c55e', light: '#4ade80', dark: '#16a34a' },
} as const;

// =============================================================================
// HELPERS
// =============================================================================

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

// =============================================================================
// COMPONENT
// =============================================================================

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

    // Needle calculation - anchored precisely to center
    const needleAngle = START_ANGLE + (clampedValue / 100) * ARC_DEGREES;
    const centerDotRadius = Math.max(3, size / 25);

    // Current segment color
    const currentSegment = segments.find(
        (seg) => clampedValue >= seg.start && clampedValue <= seg.end
    );
    const valueColor = currentSegment?.color ?? '#ffffff';

    // Unique gradient ID prefix
    const gradientId = useMemo(
        () => `speedo-${Math.random().toString(36).substr(2, 9)}`,
        []
    );

    // Tick labels positioned well outside the arc
    const tickLabels = useMemo(() => {
        if (!showTicks) return [];
        return segments.slice(1).map((seg) => {
            const tickAngle = START_ANGLE + (seg.start / 100) * ARC_DEGREES;
            // Position ticks outside the arc with extra padding
            const tickRadius = radius + strokeWidth + 8;
            const pos = polarToCartesian(cx, cy, tickRadius, tickAngle);
            return { value: seg.start, x: pos.x, y: pos.y };
        });
    }, [segments, cx, cy, radius, strokeWidth, showTicks]);

    // Value mark lines: 3 radial ticks showing ±1 around current value
    // Value mark lines: 85, 95 + Neighbors (±1)
    // Logic: Use visual offsets to make neighbors "spacious" (±3) but label them correctly (±1)
    // Do NOT show current value mark.
    const valueMarkLines = useMemo(() => {
        if (!showValuePoints) return [];

        const roundedValue = Math.round(clampedValue);
        const marks: { value: number; pos: number; isPriority: boolean }[] = [];

        // 1. Add Priority Thresholds (85, 95)
        segments.forEach(seg => {
            if (seg.end > 0 && seg.end < 100) {
                marks.push({ value: seg.end, pos: seg.end, isPriority: true });
            }
        });

        // 2. Determine Neighbors (Labels ±1)
        // Edge cases: 0 -> 0,1; 100 -> 99,100
        const neighbors: { label: number; visualOffset: number }[] = [];

        if (roundedValue <= 0) {
            neighbors.push({ label: 0, visualOffset: 0 }); // At 0
            neighbors.push({ label: 1, visualOffset: 3 }); // Visual at 3 (spacious)
        } else if (roundedValue >= 100) {
            neighbors.push({ label: 99, visualOffset: -3 }); // Visual at 97
            neighbors.push({ label: 100, visualOffset: 0 }); // At 100
        } else {
            // Normal: Label X-1 at Pos X-3; Label X+1 at Pos X+3
            // Explicitly excluding current value X
            neighbors.push({ label: roundedValue - 1, visualOffset: -3 });
            neighbors.push({ label: roundedValue + 1, visualOffset: 3 });
        }

        // 3. Add Neighbors with Collision Detection
        neighbors.forEach(n => {
            const visualPos = Math.max(0, Math.min(100, roundedValue + n.visualOffset));

            // Check collision with existing priority marks (Thresholds)
            // If the visual position is too close to a threshold...
            const collision = marks.some(m => Math.abs(m.pos - visualPos) < 2.0);

            // If it's an exact value match, we don't need to add it (priority mark takes precedence)
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

        // Generate Geometry
        marks.sort((a: any, b: any) => a.pos - b.pos).forEach((mark: any) => {
            const pointAngle = START_ANGLE + (mark.pos / 100) * ARC_DEGREES;
            // Highlight if it's strictly one of the neighbor values (mostly for edge cases)
            // or if we want to highlight thresholds. User said "85 and 95 always there".
            // Let's keep styling uniform for now as "isCurrent=false" was preferred before.
            const isCurrent = false;

            // Mark line: crossing style
            const lineLength = 12;
            const innerRadius = radius + strokeWidth / 2 - (lineLength / 2);
            const outerRadius = radius + strokeWidth / 2 + (lineLength / 2);

            // Slightly tighter label gap as requested before
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
            {/* Gradient Definitions */}
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

            {/* Background Track */}
            <path
                d={describeArc(cx, cy, radius, START_ANGLE, END_ANGLE)}
                fill="none"
                stroke="rgba(128,128,128,0.2)"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
            />

            {/* Colored Segments */}
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

            {/* Tick Labels - positioned outside arc */}
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

            {/* Value Mark Lines - radial ticks along arc */}
            {valueMarkLines.map((mark, idx) => (
                <g key={idx}>
                    {/* Mark Line (crossing the arc) */}
                    <line
                        x1={mark.innerX}
                        y1={mark.innerY}
                        x2={mark.outerX}
                        y2={mark.outerY}
                        stroke={mark.isCurrent ? valueColor : 'rgba(255,255,255,0.8)'}
                        strokeWidth={2}
                        strokeLinecap="round"
                    />

                    {/* Integer % label */}
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

            {/* Sharp Arrow Needle - thick at center, sharp at tip */}
            {(() => {
                // Calculate needle arrow points
                const needleLength = radius - strokeWidth - 2;
                // Base width slightly smaller than center dot radius (size/25 approx)
                // so the "triangle" base is hidden behind the dot
                const baseWidth = Math.max(2, size / 40);

                // Calculate perpendicular offset for needle width
                const perpAngle = needleAngle + 90;
                const perpRad = (perpAngle * Math.PI) / 180;

                // Base points (at center, thick)
                const baseLeft = {
                    x: cx + Math.cos(perpRad) * baseWidth,
                    y: cy + Math.sin(perpRad) * baseWidth,
                };
                const baseRight = {
                    x: cx - Math.cos(perpRad) * baseWidth,
                    y: cy - Math.sin(perpRad) * baseWidth,
                };

                // Tip point (sharp)
                const tip = polarToCartesian(cx, cy, needleLength, needleAngle);

                return (
                    <polygon
                        points={`${baseLeft.x},${baseLeft.y} ${tip.x},${tip.y} ${baseRight.x},${baseRight.y}`}
                        fill="#ffffff"
                        stroke="none"
                    />
                );
            })()}

            {/* Center Dot - needle anchor point */}
            <circle
                cx={cx}
                cy={cy}
                r={centerDotRadius}
                fill="#ffffff"
            />

            {/* Internal Label (e.g., "Preview") */}
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

            {/* Value Text - positioned in arc opening (outside arc, at bottom) */}
            {!hideValue && (
                <text
                    x={cx}
                    y={cy + radius * 0.95} // Lowered further to align with arc opening center
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
