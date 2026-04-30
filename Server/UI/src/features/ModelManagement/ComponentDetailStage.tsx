import { useState } from 'react'
import type { StepParams, LensComponentParams, SpacerComponentParams } from '../../types'
import {
    BarrelSVGDefs, BarrelWalls, BarrelLens, BarrelSpacer,
    computeStepLayout,
    DEFAULT_BARREL_THEME, DEFAULT_LENS_THEME, DEFAULT_SPACER_THEME,
    type BarrelGeometry,
} from './PremiumBarrelSVG'

interface BarrelSlot {
    id: string | null
    type: 'empty' | 'lens' | 'spacer'
}

interface Props {
    slots: BarrelSlot[]
    stepParams: StepParams[]
    ttl: number
    componentParams: Record<string, LensComponentParams | SpacerComponentParams>
    onComponentParamsChange: (params: Record<string, LensComponentParams | SpacerComponentParams>) => void
}

const SVG_ID = 'cd'

export default function ComponentDetailStage({ slots, stepParams, ttl, componentParams, onComponentParamsChange }: Props) {
    const [selected, setSelected] = useState<string | null>(null)

    const filledSlots = slots.filter(s => s.id !== null)
    const selectedIdx = slots.findIndex(s => s.id === selected)
    const params = selected ? (componentParams[selected] || {}) : {}

    const updateParam = (key: string, value: number | undefined) => {
        if (!selected) return
        onComponentParamsChange({ ...componentParams, [selected]: { ...params, [key]: value } })
    }

    const isLens = (id: string | null) => id?.startsWith('L')

    // Barrel geometry (read-only rendering)
    const totalSlots = slots.length
    const stepH = totalSlots > 0 ? Math.min(44, Math.max(22, 260 / totalSlots)) : 44
    const barrelW = 190
    const barrelBotW = barrelW * 0.6
    const barrelTopY = 20
    const barrelBotY = barrelTopY + totalSlots * stepH + 14
    const svgW = barrelW + 50
    const svgH = barrelBotY + 24
    const cx = svgW / 2
    const minIW = barrelBotW * 0.55
    const maxIW = barrelW * 0.65

    const svgSteps = Array.from({ length: totalSlots }, (_, i) => {
        const p = totalSlots > 1 ? i / (totalSlots - 1) : 0.5
        return { height: stepH, innerWidth: minIW + (maxIW - minIW) * p }
    })

    const geo: BarrelGeometry = {
        cx, topY: barrelTopY, bottomY: barrelBotY,
        outerTopWidth: barrelW, outerBottomWidth: barrelBotW,
        bottomThickness: 5, steps: svgSteps,
    }
    const layout = totalSlots > 0 ? computeStepLayout(geo) : []

    return (
        <div className="cd-stage">
            {/* Left: Completed Barrel */}
            <div className="cd-barrel">
                <svg width="100%" height="100%" viewBox={`0 0 ${svgW} ${svgH}`}
                    preserveAspectRatio="xMidYMid meet" style={{ maxHeight: '100%' }}>
                    <BarrelSVGDefs id={SVG_ID} barrelTheme={DEFAULT_BARREL_THEME}
                        lensTheme={DEFAULT_LENS_THEME} spacerTheme={DEFAULT_SPACER_THEME} />
                    <text x={cx} y={10} textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600" fontFamily="Inter,system-ui">▼ OPEN</text>
                    {totalSlots > 0 && <BarrelWalls id={SVG_ID} geo={geo} />}
                    {layout.map((step, i) => {
                        const slot = slots[i]
                        if (!slot?.id) return null
                        const w = step.innerWidth * 0.88
                        const isSel = slot.id === selected
                        return (
                            <g key={i} style={{ cursor: 'pointer' }} onClick={() => setSelected(slot.id)}>
                                {isLens(slot.id) ? (
                                    <BarrelLens id={SVG_ID} cx={cx} cy={step.centerY}
                                        width={w} thickness={stepH * 0.65} curvature={0.45}
                                        theme={DEFAULT_LENS_THEME} label={slot.id} selected={isSel} breathing={false} />
                                ) : (
                                    <BarrelSpacer id={SVG_ID} cx={cx} cy={step.centerY}
                                        width={w} height={Math.max(5, stepH * 0.2)}
                                        theme={DEFAULT_SPACER_THEME} label={slot.id} selected={isSel} />
                                )}
                            </g>
                        )
                    })}
                    <text x={cx} y={svgH - 6} textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600" fontFamily="Inter,system-ui">▲ CLOSED</text>
                </svg>
            </div>

            {/* Right: Params Panel */}
            <div className="cd-params">
                {!selected ? (
                    <div className="cd-empty">
                        <p>Click a lens or spacer in the barrel to edit its parameters</p>
                        <div className="cd-component-list">
                            {filledSlots.map(s => (
                                <button key={s.id} className={`cd-comp-chip ${isLens(s.id) ? 'lens' : 'spacer'}`}
                                    onClick={() => setSelected(s.id)}>{s.id}</button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="cd-selected-header">
                            <span className={`cd-type-badge ${isLens(selected) ? 'lens' : 'spacer'}`}>
                                {isLens(selected) ? 'Lens' : 'Spacer'}
                            </span>
                            <span className="cd-selected-id">{selected}</span>
                        </div>

                        {/* 3D Diagram — photorealistic images */}
                        <div className="cd-diagram">
                            {isLens(selected) ? (
                                <img src="/images/lens_3d.png" alt="Lens 3D diagram"
                                    style={{ width: '100%', height: 'auto', maxHeight: '220px', objectFit: 'contain', borderRadius: '6px' }} />
                            ) : (
                                <img src="/images/spacer_3d.png" alt="Spacer 3D diagram"
                                    style={{ width: '100%', height: 'auto', maxHeight: '220px', objectFit: 'contain', borderRadius: '6px' }} />
                            )}
                        </div>

                        {/* Input fields */}
                        <div className="cd-fields">
                            {isLens(selected) ? (
                                <>
                                    {([['angle', 'Angle', '°'], ['pressure', 'Pressure', 'bar'],
                                    ['lensDiameter', 'Lens Diameter', 'mm'], ['lensHeight', 'Lens Height', 'mm'],
                                    ['lensThickness', 'Lens Thickness', 'mm']] as const).map(([key, label, unit]) => (
                                        <div key={key} className="cd-field">
                                            <label>{label}</label>
                                            <div className="cd-field-input">
                                                <span className="cd-arrow-dot" />
                                                <input type="number" step="0.001" value={(params as any)[key] ?? ''}
                                                    onChange={e => updateParam(key, e.target.value ? parseFloat(e.target.value) : undefined)} />
                                                <span className="cd-unit">{unit}</span>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <>
                                    {([['angle', 'Angle', '°'], ['pressure', 'Pressure', 'bar'],
                                    ['spacerOuterDia', 'Outer Diameter', 'mm'], ['spacerInnerDia', 'Inner Diameter', 'mm'],
                                    ['spacerHeight', 'Spacer Height', 'mm'], ['spacerThickness', 'Thickness', 'mm']] as const).map(([key, label, unit]) => (
                                        <div key={key} className="cd-field">
                                            <label>{label}</label>
                                            <div className="cd-field-input">
                                                <span className="cd-arrow-dot" />
                                                <input type="number" step="0.001" value={(params as any)[key] ?? ''}
                                                    onChange={e => updateParam(key, e.target.value ? parseFloat(e.target.value) : undefined)} />
                                                <span className="cd-unit">{unit}</span>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>

                        {/* Locked barrel params */}
                        <div className="cd-locked-params">
                            <div className="cd-locked-title">Barrel (read-only)</div>
                            <div className="cd-locked-row"><span>TTL</span><span>{ttl} mm</span></div>
                            {selectedIdx >= 0 && selectedIdx < stepParams.length && (
                                <>
                                    <div className="cd-locked-row"><span>Step Height</span><span>{stepParams[selectedIdx].stepHeight} mm</span></div>
                                    <div className="cd-locked-row"><span>Inner Dia</span><span>{stepParams[selectedIdx].innerDiameter} mm</span></div>
                                </>
                            )}
                        </div>

                        {/* Navigation chips */}
                        <div className="cd-nav-chips">
                            {filledSlots.map(s => (
                                <button key={s.id}
                                    className={`cd-comp-chip ${isLens(s.id) ? 'lens' : 'spacer'} ${s.id === selected ? 'active' : ''}`}
                                    onClick={() => setSelected(s.id)}>{s.id}</button>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
