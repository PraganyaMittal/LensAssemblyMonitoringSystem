import { useCallback, useState, useEffect } from 'react'
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
    x: number
    y: number
    onXChange: (x: number) => void
    onYChange: (y: number) => void
}

const MIN = 1, MAX = 20

export default function BarrelTrayDiagram({ x, y, onXChange, onYChange }: Props) {
    const clamp = (v: number) => Math.max(MIN, Math.min(MAX, v))

    const [localX, setLocalX] = useState<string | number>(x)
    const [localY, setLocalY] = useState<string | number>(y)

    useEffect(() => { setLocalX(x) }, [x])
    useEffect(() => { setLocalY(y) }, [y])

    const handleXChange = (val: string) => {
        setLocalX(val)
        const parsed = parseInt(val)
        if (!isNaN(parsed) && parsed >= MIN && parsed <= MAX) {
            onXChange(parsed)
        }
    }

    const handleYChange = (val: string) => {
        setLocalY(val)
        const parsed = parseInt(val)
        if (!isNaN(parsed) && parsed >= MIN && parsed <= MAX) {
            onYChange(parsed)
        }
    }

    const handleXBlur = () => {
        let finalVal = parseInt(localX as string)
        if (isNaN(finalVal)) finalVal = MIN
        else finalVal = clamp(finalVal)
        setLocalX(finalVal)
        onXChange(finalVal)
    }

    const handleYBlur = () => {
        let finalVal = parseInt(localY as string)
        if (isNaN(finalVal)) finalVal = MIN
        else finalVal = clamp(finalVal)
        setLocalY(finalVal)
        onYChange(finalVal)
    }

    const handleKey = useCallback((axis: 'x' | 'y', e: React.KeyboardEvent) => {
        const setter = axis === 'x' ? onXChange : onYChange
        const val = axis === 'x' ? x : y
        if (e.key === 'ArrowUp') { e.preventDefault(); setter(clamp(val + 1)) }
        if (e.key === 'ArrowDown') { e.preventDefault(); setter(clamp(val - 1)) }
    }, [x, y, onXChange, onYChange])

    // Layout calculations
    const holeRadius = x > 10 || y > 10 ? 16 : x > 6 || y > 6 ? 24 : 32
    const holePadding = holeRadius * 0.5
    const gridW = x * (holeRadius * 2 + holePadding) + holePadding
    const gridH = y * (holeRadius * 2 + holePadding) + holePadding
    const trayPad = 24

    // Minimal padding to maximize diagram
    const trayX = 16
    const trayY = 16
    const trayW = gridW + trayPad
    const trayH = gridH + trayPad

    const svgW = trayX + trayW + 30
    const svgH = trayY + trayH + 30
    return (
        <div className="bt-container" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <style>
                {`
                .bt-input-no-arrow::-webkit-outer-spin-button,
                .bt-input-no-arrow::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
                .bt-input-no-arrow {
                    -moz-appearance: textfield;
                }
                `}
            </style>
            <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${svgW} ${svgH}`}
                style={{ flex: 1, minHeight: 0, margin: '0 auto', display: 'block' }}
            >
                <defs>
                    {/* Tray body gradient — metallic steel */}
                    <linearGradient id="trayGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5a6577" />
                        <stop offset="30%" stopColor="#4a5568" />
                        <stop offset="100%" stopColor="#2d3748" />
                    </linearGradient>

                    {/* Tray bevel highlight */}
                    <linearGradient id="trayBevel" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
                        <stop offset="100%" stopColor="rgba(0,0,0,0.2)" />
                    </linearGradient>

                    {/* Hole radial gradient — 3D depth */}
                    <radialGradient id="holeGrad" cx="40%" cy="35%">
                        <stop offset="0%" stopColor="#1a202c" />
                        <stop offset="60%" stopColor="#0f1419" />
                        <stop offset="100%" stopColor="#0a0e13" />
                    </radialGradient>

                    {/* Hole rim highlight */}
                    <radialGradient id="holeRim" cx="50%" cy="50%">
                        <stop offset="80%" stopColor="transparent" />
                        <stop offset="90%" stopColor="rgba(255,255,255,0.08)" />
                        <stop offset="100%" stopColor="rgba(255,255,255,0.03)" />
                    </radialGradient>

                    {/* Shadow filter */}
                    <filter id="trayShadow" x="-5%" y="-5%" width="110%" height="115%">
                        <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000" floodOpacity="0.5" />
                    </filter>

                    {/* Inner shadow for holes */}
                    <filter id="holeShadow">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
                        <feOffset dx="0" dy="1" result="offsetBlur" />
                        <feFlood floodColor="#000" floodOpacity="0.6" result="color" />
                        <feComposite in="color" in2="offsetBlur" operator="in" result="shadow" />
                        <feMerge>
                            <feMergeNode in="shadow" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Tray body */}
                <rect
                    x={trayX} y={trayY} width={trayW} height={trayH} rx={8}
                    fill="url(#trayGrad)" filter="url(#trayShadow)" stroke="#6b7a8d" strokeWidth={5}
                />
                {/* Bevel overlay */}
                <rect
                    x={trayX} y={trayY} width={trayW} height={trayH} rx={8}
                    fill="url(#trayBevel)" pointerEvents="none"
                />
                {/* Top edge shine */}
                <line
                    x1={trayX + 8} y1={trayY + 1} x2={trayX + trayW - 8} y2={trayY + 1}
                    stroke="rgba(255,255,255,0.12)" strokeWidth={1}
                />

                {/* Holes grid */}
                {Array.from({ length: y }, (_, row) =>
                    Array.from({ length: x }, (_, col) => {
                        const idx = row * x + col + 1
                        const cx = trayX + trayPad / 2 + holePadding + col * (holeRadius * 2 + holePadding) + holeRadius
                        const cy = trayY + trayPad / 2 + holePadding + row * (holeRadius * 2 + holePadding) + holeRadius
                        return (
                            <g key={`${row}-${col}`}>
                                {/* Hole shadow ring */}
                                <circle cx={cx} cy={cy + 1} r={holeRadius + 1} fill="rgba(0,0,0,0.3)" />
                                {/* Hole body */}
                                <circle cx={cx} cy={cy} r={holeRadius} fill="url(#holeGrad)" filter="url(#holeShadow)" />
                                {/* Rim highlight */}
                                <circle cx={cx} cy={cy} r={holeRadius} fill="url(#holeRim)" />
                                {/* Rim ring */}
                                <circle cx={cx} cy={cy} r={holeRadius} fill="none"
                                    stroke="rgba(148,163,184,0.25)" strokeWidth={1} />
                                {/* Index text */}
                                <text
                                    x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central"
                                    fill="rgba(148,163,184,0.5)" fontSize={holeRadius > 18 ? 10 : 8}
                                    fontWeight={600} fontFamily="Inter, system-ui, sans-serif"
                                    style={{ userSelect: 'none' }}
                                >
                                    {idx}
                                </text>
                            </g>
                        )
                    })
                )}

                {/* X control — embedded on top boundary */}
                <foreignObject
                    x={trayX + trayW / 2 - 50} y={trayY - 14}
                    width={100} height={28}
                >
                    <div className="bt-control bt-control-x" style={{ background: '#0f172a', padding: '2px', borderRadius: '6px', border: '1px solid #475569', boxShadow: '0 4px 6px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', boxSizing: 'border-box' }}>
                        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', marginRight: '4px' }}>X</span>
                        <button onClick={() => onXChange(clamp(x - 1))} disabled={x <= MIN} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, display: 'flex' }}><ChevronLeft size={14} /></button>
                        <input
                            type="number" value={localX} min={MIN} max={MAX}
                            onChange={e => handleXChange(e.target.value)}
                            onBlur={handleXBlur}
                            onKeyDown={e => handleKey('x', e)}
                            className="bt-input-no-arrow"
                            style={{ width: '24px', background: 'transparent', border: 'none', color: '#fff', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', outline: 'none', margin: '0 4px', padding: 0 }}
                        />
                        <button onClick={() => onXChange(clamp(x + 1))} disabled={x >= MAX} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, display: 'flex' }}><ChevronRight size={14} /></button>
                    </div>
                </foreignObject>

                {/* Y control — embedded on right boundary */}
                <foreignObject
                    x={trayX + trayW - 14} y={trayY + trayH / 2 - 50}
                    width={28} height={100}
                >
                    <div className="bt-control bt-control-y" style={{ background: '#0f172a', padding: '2px', borderRadius: '6px', border: '1px solid #475569', boxShadow: '0 4px 6px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', boxSizing: 'border-box' }}>
                        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}>Y</span>
                        <button onClick={() => onYChange(clamp(y + 1))} disabled={y >= MAX} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, display: 'flex' }}><ChevronUp size={14} /></button>
                        <input
                            type="number" value={localY} min={MIN} max={MAX}
                            onChange={e => handleYChange(e.target.value)}
                            onBlur={handleYBlur}
                            onKeyDown={e => handleKey('y', e)}
                            className="bt-input-no-arrow"
                            style={{ height: '24px', width: '20px', background: 'transparent', border: 'none', color: '#fff', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', outline: 'none', margin: '4px 0', padding: 0 }}
                        />
                        <button onClick={() => onYChange(clamp(y - 1))} disabled={y <= MIN} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, display: 'flex' }}><ChevronDown size={14} /></button>
                    </div>
                </foreignObject>
            </svg>

            {/* Total count */}
            <div className="bt-total" style={{ marginTop: '0', padding: '4px' }}>
                <span className="bt-total-dims">{x} × {y}</span>
                <span className="bt-total-eq">=</span>
                <span className="bt-total-count">{x * y}</span>
                <span className="bt-total-label">Barrels</span>
            </div>
        </div>
    )
}
