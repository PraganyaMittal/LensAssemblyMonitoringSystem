import React from 'react'

// ── Types ──
export interface GradientStop { offset: string; color: string; opacity?: number }

export interface BarrelGeometry {
    cx: number; topY: number; bottomY: number
    outerTopWidth: number; outerBottomWidth: number; bottomThickness: number
    steps: Array<{ height: number; innerWidth: number }>
}

export interface BarrelTheme {
    wallGradient: GradientStop[]; wallShadowColor: string; wallShadowBlur: number
    specularIntensity: number; ledgeHighlightColor: string; ledgeShadowColor: string; innerWallColor: string
}

export interface LensTheme { baseColor: string; glowColor: string; glowIntensity: number; curvature: number }
export interface SpacerTheme { gradient: GradientStop[]; edgeHighlight: string; edgeShadow: string }

export const DEFAULT_BARREL_THEME: BarrelTheme = {
    wallGradient: [
        { offset: '0%', color: '#3a4556' }, { offset: '15%', color: '#5a6a7d' },
        { offset: '40%', color: '#8a9aad' }, { offset: '60%', color: '#8a9aad' },
        { offset: '85%', color: '#5a6a7d' }, { offset: '100%', color: '#3a4556' },
    ],
    wallShadowColor: '#000', wallShadowBlur: 4, specularIntensity: 0.35,
    ledgeHighlightColor: 'rgba(200,215,230,0.3)', ledgeShadowColor: 'rgba(0,0,0,0.5)',
    innerWallColor: '#1a2332',
}

export const DEFAULT_LENS_THEME: LensTheme = { baseColor: '#2dd4bf', glowColor: '#2dd4bf', glowIntensity: 0.4, curvature: 0.45 }
export const DEFAULT_SPACER_THEME: SpacerTheme = {
    gradient: [{ offset: '0%', color: '#3a4050' }, { offset: '50%', color: '#5a6070' }, { offset: '100%', color: '#3a4050' }],
    edgeHighlight: 'rgba(200,210,220,0.2)', edgeShadow: 'rgba(0,0,0,0.4)',
}

// ── Step Layout Computation ──
export function computeStepLayout(geo: BarrelGeometry) {
    const innerBottomY = geo.bottomY - geo.bottomThickness
    const cumH: number[] = [0]
    for (let i = 0; i < geo.steps.length; i++) cumH.push(cumH[i] + geo.steps[i].height)
    return geo.steps.map((step, i) => ({
        ...step,
        topY: innerBottomY - cumH[i + 1],
        bottomY: innerBottomY - cumH[i],
        centerY: innerBottomY - cumH[i] - step.height / 2,
    }))
}

// ── SVG Defs ──
interface DefsProps { id: string; barrelTheme: BarrelTheme; lensTheme: LensTheme; spacerTheme: SpacerTheme }

export function BarrelSVGDefs({ id, lensTheme }: DefsProps) {
    return (
        <defs>
            {/* Metallic band gradient (vertical — simulates 3D curved shelf) */}
            <linearGradient id={`${id}-bandGrad`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6a7a8d" />
                <stop offset="8%" stopColor="#9aabbf" />
                <stop offset="25%" stopColor="#c0cfdd" />
                <stop offset="50%" stopColor="#dde6ee" />
                <stop offset="75%" stopColor="#c0cfdd" />
                <stop offset="92%" stopColor="#9aabbf" />
                <stop offset="100%" stopColor="#6a7a8d" />
            </linearGradient>

            {/* Inner wall recessed area */}
            <linearGradient id={`${id}-recessGrad`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#2a3444" />
                <stop offset="20%" stopColor="#1e2a38" />
                <stop offset="80%" stopColor="#1e2a38" />
                <stop offset="100%" stopColor="#2a3444" />
            </linearGradient>

            {/* Lens glass radial gradient */}
            <radialGradient id={`${id}-lensGlass`} cx="50%" cy="40%" r="60%">
                <stop offset="0%" stopColor={lensTheme.baseColor} stopOpacity={0.9} />
                <stop offset="45%" stopColor={lensTheme.baseColor} stopOpacity={0.6} />
                <stop offset="100%" stopColor={darken(lensTheme.baseColor, 40)} stopOpacity={0.35} />
            </radialGradient>

            {/* Spacer gradient */}
            <linearGradient id={`${id}-spacerGrad`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4a5565" />
                <stop offset="50%" stopColor="#6a7580" />
                <stop offset="100%" stopColor="#4a5565" />
            </linearGradient>

            {/* Shadow filter */}
            <filter id={`${id}-shadow`} x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.5" />
            </filter>

            {/* Lens glow */}
            <filter id={`${id}-lensGlow`} x="-20%" y="-30%" width="140%" height="160%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                <feFlood floodColor={lensTheme.glowColor} floodOpacity={lensTheme.glowIntensity} result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>

            {/* Selection glow */}
            <filter id={`${id}-selectGlow`} x="-25%" y="-35%" width="150%" height="170%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
                <feFlood floodColor="#818cf8" floodOpacity="0.6" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>

            {/* Drop zone glow */}
            <filter id={`${id}-dropGlow`} x="-10%" y="-20%" width="120%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feFlood floodColor="#2dd4bf" floodOpacity="0.3" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>

            <style>{`
                @keyframes ${id}-breathe { 0%,100%{opacity:0.55} 50%{opacity:0.9} }
                @keyframes ${id}-pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
                .${id}-breathe { animation: ${id}-breathe 3s ease-in-out infinite; }
                .${id}-pulse { animation: ${id}-pulse 1s ease-in-out infinite; }
            `}</style>
        </defs>
    )
}

// ── Barrel Walls (Stepped Shelves) ──
// Each step is a thick metallic band that protrudes outward, creating visible staircase
interface WallsProps { id: string; geo: BarrelGeometry }

export function BarrelWalls({ id, geo }: WallsProps) {
    const layout = computeStepLayout(geo)
    const N = geo.steps.length
    if (N === 0) return null

    const shelfThickness = 8  // visual thickness of each metallic shelf
    const curvature = 4       // edge curvature for 3D effect

    return (
        <g className="barrel-walls" filter={`url(#${id}-shadow)`}>
            {/* Bottom plate */}
            <rect x={geo.cx - layout[0].innerWidth / 2 - 12} y={geo.bottomY - geo.bottomThickness}
                width={layout[0].innerWidth + 24} height={geo.bottomThickness}
                rx={2} fill={`url(#${id}-bandGrad)`} />

            {layout.map((step, i) => {
                const shelfW = step.innerWidth + 24
                const recessW = step.innerWidth
                const recessTop = step.topY
                const recessBot = step.bottomY

                // Metallic shelf band at the BOTTOM of this step (the ledge)
                const shelfY = recessBot - shelfThickness / 2

                return (
                    <React.Fragment key={i}>
                        {/* Recessed inner wall between shelves */}
                        <rect x={geo.cx - recessW / 2} y={recessTop} width={recessW} height={recessBot - recessTop}
                            fill={`url(#${id}-recessGrad)`} />

                        {/* Left wall segment */}
                        <rect x={geo.cx - shelfW / 2 - 6} y={recessTop} width={8} height={recessBot - recessTop}
                            fill={`url(#${id}-recessGrad)`} opacity={0.7} />
                        {/* Right wall segment */}
                        <rect x={geo.cx + shelfW / 2 - 2} y={recessTop} width={8} height={recessBot - recessTop}
                            fill={`url(#${id}-recessGrad)`} opacity={0.7} />

                        {/* Metallic shelf/ledge at bottom of step */}
                        {i > 0 && (
                            <g>
                                {/* Shelf body — 3D curved metallic band */}
                                <path d={[
                                    `M ${geo.cx - shelfW / 2} ${shelfY + shelfThickness}`,
                                    `Q ${geo.cx - shelfW / 2} ${shelfY} ${geo.cx - shelfW / 2 + curvature} ${shelfY}`,
                                    `L ${geo.cx + shelfW / 2 - curvature} ${shelfY}`,
                                    `Q ${geo.cx + shelfW / 2} ${shelfY} ${geo.cx + shelfW / 2} ${shelfY + shelfThickness}`,
                                    `Z`
                                ].join(' ')} fill={`url(#${id}-bandGrad)`} />

                                {/* Top edge highlight */}
                                <line x1={geo.cx - shelfW / 2 + curvature} y1={shelfY + 0.5}
                                    x2={geo.cx + shelfW / 2 - curvature} y2={shelfY + 0.5}
                                    stroke="rgba(255,255,255,0.25)" strokeWidth={1} />

                                {/* Bottom edge shadow */}
                                <line x1={geo.cx - shelfW / 2 + 1} y1={shelfY + shelfThickness}
                                    x2={geo.cx + shelfW / 2 - 1} y2={shelfY + shelfThickness}
                                    stroke="rgba(0,0,0,0.4)" strokeWidth={1} />

                                {/* Side bevels */}
                                <rect x={geo.cx - shelfW / 2 - 1} y={shelfY} width={3} height={shelfThickness}
                                    fill="rgba(0,0,0,0.2)" rx={1} />
                                <rect x={geo.cx + shelfW / 2 - 2} y={shelfY} width={3} height={shelfThickness}
                                    fill="rgba(0,0,0,0.2)" rx={1} />
                            </g>
                        )}

                        {/* Top shelf (at the very top of the barrel — open side) */}
                        {i === N - 1 && (
                            <g>
                                <path d={[
                                    `M ${geo.cx - shelfW / 2 - 4} ${recessTop + shelfThickness}`,
                                    `Q ${geo.cx - shelfW / 2 - 4} ${recessTop - 2} ${geo.cx - shelfW / 2 + curvature} ${recessTop - 2}`,
                                    `L ${geo.cx + shelfW / 2 - curvature} ${recessTop - 2}`,
                                    `Q ${geo.cx + shelfW / 2 + 4} ${recessTop - 2} ${geo.cx + shelfW / 2 + 4} ${recessTop + shelfThickness}`,
                                    `Z`
                                ].join(' ')} fill={`url(#${id}-bandGrad)`} />
                                <line x1={geo.cx - shelfW / 2 + curvature} y1={recessTop - 1.5}
                                    x2={geo.cx + shelfW / 2 - curvature} y2={recessTop - 1.5}
                                    stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
                            </g>
                        )}

                        {/* Grip dots */}
                        <circle cx={geo.cx - shelfW / 2 - 10} cy={step.centerY} r={2.5}
                            fill="rgba(100,120,140,0.5)" stroke="rgba(180,200,220,0.15)" strokeWidth={0.5} />
                        <circle cx={geo.cx + shelfW / 2 + 10} cy={step.centerY} r={2.5}
                            fill="rgba(100,120,140,0.5)" stroke="rgba(180,200,220,0.15)" strokeWidth={0.5} />
                    </React.Fragment>
                )
            })}
        </g>
    )
}

// ── Convex Lens ──
interface LensProps {
    id: string; cx: number; cy: number; width: number; thickness: number
    curvature: number; theme: LensTheme; label?: string; selected?: boolean; breathing?: boolean
}

export function BarrelLens({ id, cx, cy, width, thickness, curvature, theme, label, selected, breathing }: LensProps) {
    const hw = width / 2
    const curveH = thickness * curvature

    const d = `M ${cx - hw} ${cy} Q ${cx} ${cy - curveH} ${cx + hw} ${cy} Q ${cx} ${cy + curveH} ${cx - hw} ${cy} Z`

    return (
        <g className={breathing && !selected ? `${id}-breathe` : ''}
            filter={selected ? `url(#${id}-selectGlow)` : `url(#${id}-lensGlow)`}>
            <path d={d} fill={`url(#${id}-lensGlass)`} />
            {/* Top surface highlight */}
            <path d={`M ${cx - hw * 0.8} ${cy} Q ${cx} ${cy - curveH * 0.65} ${cx + hw * 0.8} ${cy}`}
                fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={0.8} />
            {/* Bottom edge */}
            <path d={`M ${cx - hw * 0.85} ${cy} Q ${cx} ${cy + curveH * 0.8} ${cx + hw * 0.85} ${cy}`}
                fill="none" stroke={darken(theme.baseColor, 30)} strokeWidth={0.6} />
            {selected && <path d={d} fill="none" stroke="#818cf8" strokeWidth={2} opacity={0.8} />}
            {label && (
                <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central"
                    fill="#fff" fontSize={thickness > 14 ? 10 : 8} fontWeight={700}
                    fontFamily="Inter,system-ui" opacity={0.9}
                    style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{label}</text>
            )}
        </g>
    )
}

// ── Spacer ──
interface SpacerCompProps {
    id: string; cx: number; cy: number; width: number; height: number
    theme: SpacerTheme; label?: string; selected?: boolean
}

export function BarrelSpacer({ id, cx, cy, width, height, label, selected }: SpacerCompProps) {
    const hw = width / 2, hh = height / 2
    return (
        <g filter={selected ? `url(#${id}-selectGlow)` : undefined}>
            <rect x={cx - hw} y={cy - hh} width={width} height={height} rx={1.5} fill={`url(#${id}-spacerGrad)`} />
            <line x1={cx - hw + 1} y1={cy - hh} x2={cx + hw - 1} y2={cy - hh} stroke="rgba(200,210,220,0.25)" strokeWidth={0.8} />
            <line x1={cx - hw + 1} y1={cy + hh} x2={cx + hw - 1} y2={cy + hh} stroke="rgba(0,0,0,0.4)" strokeWidth={0.8} />
            {selected && <rect x={cx - hw - 1} y={cy - hh - 1} width={width + 2} height={height + 2} rx={2} fill="none" stroke="#818cf8" strokeWidth={1.5} />}
            {label && <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fill="rgba(200,215,230,0.75)" fontSize={8} fontWeight={700} fontFamily="Inter,system-ui">{label}</text>}
        </g>
    )
}

// ── Drop Zone ──
interface DropZoneProps {
    cx: number; cy: number; width: number; height: number
    strokeColor: string; strokeDash: string; text: string; textColor: string; isActive: boolean; id: string
}

export function BarrelDropZone({ cx, cy, width, height, strokeColor, strokeDash, text, textColor, isActive, id }: DropZoneProps) {
    return (
        <g className={isActive ? `${id}-pulse` : ''}>
            <rect x={cx - width / 2} y={cy - height / 2} width={width} height={height} rx={4}
                fill={isActive ? 'rgba(45,212,191,0.08)' : 'transparent'}
                stroke={isActive ? '#2dd4bf' : strokeColor} strokeWidth={isActive ? 1.5 : 1}
                strokeDasharray={strokeDash} filter={isActive ? `url(#${id}-dropGlow)` : undefined} />
            <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central"
                fill={isActive ? '#2dd4bf' : textColor} fontSize={9} fontFamily="Inter,system-ui"
                opacity={isActive ? 0.8 : 0.35}>{text}</text>
        </g>
    )
}

// ── Dimension Line ──
interface DimLineProps {
    x1: number; y1: number; x2: number; y2: number
    color: string; strokeWidth: number; arrowSize: number; label?: string; vertical?: boolean
}

export function BarrelDimLine({ x1, y1, x2, y2, color, strokeWidth, arrowSize, label, vertical }: DimLineProps) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, a = arrowSize
    return (
        <g>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={strokeWidth} strokeDasharray="3,2" />
            {vertical ? (
                <>
                    <line x1={x1 - a} y1={y1} x2={x1 + a} y2={y1} stroke={color} strokeWidth={strokeWidth} />
                    <line x1={x2 - a} y1={y2} x2={x2 + a} y2={y2} stroke={color} strokeWidth={strokeWidth} />
                </>
            ) : (
                <>
                    <line x1={x1} y1={y1 - a} x2={x1} y2={y1 + a} stroke={color} strokeWidth={strokeWidth} />
                    <line x1={x2} y1={y2 - a} x2={x2} y2={y2 + a} stroke={color} strokeWidth={strokeWidth} />
                </>
            )}
            {label && (
                <text x={mx} y={my} textAnchor="middle" dominantBaseline="central"
                    fill={color} fontSize={9} fontWeight={700} fontFamily="Inter,system-ui"
                    transform={vertical ? `rotate(-90, ${mx}, ${my})` : undefined}>{label}</text>
            )}
        </g>
    )
}

function darken(hex: string, amount: number): string {
    const c = hex.replace('#', '')
    const r = Math.max(0, parseInt(c.substring(0, 2), 16) - amount)
    const g = Math.max(0, parseInt(c.substring(2, 4), 16) - amount)
    const b = Math.max(0, parseInt(c.substring(4, 6), 16) - amount)
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
