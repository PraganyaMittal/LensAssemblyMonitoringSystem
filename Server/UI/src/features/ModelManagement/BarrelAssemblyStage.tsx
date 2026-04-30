import { useState, useRef } from 'react'
import { GripVertical, Trash2 } from 'lucide-react'
import type { StepParams } from '../../types'
import {
    BarrelSVGDefs, BarrelWalls, BarrelLens, BarrelSpacer, BarrelDropZone, BarrelDimLine,
    computeStepLayout,
    DEFAULT_BARREL_THEME, DEFAULT_LENS_THEME, DEFAULT_SPACER_THEME,
    type BarrelGeometry,
} from './PremiumBarrelSVG'

interface BarrelSlot {
    id: string | null
    type: 'empty' | 'lens' | 'spacer'
}

interface Props {
    lensCount: number
    spacerCount: number
    onLensCountChange: (n: number) => void
    onSpacerCountChange: (n: number) => void
    ttl: number
    onTtlChange: (v: number) => void
    slots: BarrelSlot[]
    onSlotsChange: (slots: BarrelSlot[]) => void
    stepParams: StepParams[]
    onStepParamsChange: (params: StepParams[]) => void
}

const SVG_ID = 'ba'

export default function BarrelAssemblyStage({
    lensCount, spacerCount, onLensCountChange, onSpacerCountChange,
    ttl, onTtlChange, slots, onSlotsChange,
    stepParams, onStepParamsChange
}: Props) {
    const [dragItem, setDragItem] = useState<string | null>(null)
    const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)
    const [selectedStep, setSelectedStep] = useState<number | null>(null)
    const barrelRef = useRef<HTMLDivElement>(null)

    const totalSlots = lensCount + spacerCount

    // Pool tracking
    const placedLenses = slots.filter(s => s.id?.startsWith('L')).map(s => s.id!)
    const placedSpacers = slots.filter(s => s.id?.startsWith('SP')).map(s => s.id!)
    const poolLenses = Array.from({ length: lensCount }, (_, i) => `L${i + 1}`).filter(id => !placedLenses.includes(id))
    const poolSpacers = Array.from({ length: spacerCount }, (_, i) => `SP${i}`).filter(id => !placedSpacers.includes(id))

    // Drag handlers
    const handleDragStart = (id: string) => setDragItem(id)
    const handleDragEnd = () => { setDragItem(null); setDragOverSlot(null) }

    const handleSlotDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverSlot(idx)
    }
    const handleSlotDragLeave = () => setDragOverSlot(null)

    const handleSlotDrop = (e: React.DragEvent, idx: number) => {
        e.preventDefault()
        if (!dragItem) return
        const newSlots = [...slots]
        const oldIdx = newSlots.findIndex(s => s.id === dragItem)
        if (oldIdx >= 0) newSlots[oldIdx] = { id: null, type: 'empty' }
        newSlots[idx] = { id: dragItem, type: dragItem.startsWith('L') ? 'lens' : 'spacer' }
        onSlotsChange(newSlots)
        setDragItem(null); setDragOverSlot(null)
    }

    const handlePoolDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
    const handlePoolDrop = (e: React.DragEvent) => {
        e.preventDefault()
        if (!dragItem) return
        onSlotsChange(slots.map(s => s.id === dragItem ? { id: null, type: 'empty' as const } : s))
        setDragItem(null)
    }

    const removeFromSlot = (idx: number) => {
        const newSlots = [...slots]; newSlots[idx] = { id: null, type: 'empty' }; onSlotsChange(newSlots)
    }

    const updateStepParam = (idx: number, field: keyof StepParams, value: number) => {
        const newParams = [...stepParams]; newParams[idx] = { ...newParams[idx], [field]: value }; onStepParamsChange(newParams)
    }

    // ── Barrel SVG Geometry ──────────────────────────────
    const stepH = totalSlots > 0 ? Math.min(48, Math.max(26, 320 / totalSlots)) : 48
    const barrelOuterTopW = 240
    const barrelOuterBotW = barrelOuterTopW * 0.6
    const barrelTopY = 24
    const barrelBotY = barrelTopY + totalSlots * stepH + 16
    const bottomThk = 6
    const svgW = barrelOuterTopW + 80
    const svgH = barrelBotY + 30
    const cx = svgW / 2

    // Build step geometry for SVG: bottom = index 0 (narrowest), top = last (widest)
    const minInnerW = barrelOuterBotW * 0.55
    const maxInnerW = barrelOuterTopW * 0.65
    const svgSteps = Array.from({ length: totalSlots }, (_, i) => {
        const progress = totalSlots > 1 ? i / (totalSlots - 1) : 0.5
        return { height: stepH, innerWidth: minInnerW + (maxInnerW - minInnerW) * progress }
    })

    const geo: BarrelGeometry = {
        cx, topY: barrelTopY, bottomY: barrelBotY,
        outerTopWidth: barrelOuterTopW, outerBottomWidth: barrelOuterBotW,
        bottomThickness: bottomThk, steps: svgSteps,
    }

    const layout = totalSlots > 0 ? computeStepLayout(geo) : []

    return (
        <div className="ba-stage">
            {/* ── Left: Lens Pool ── */}
            <div className="ba-pool ba-pool-left" onDragOver={handlePoolDragOver} onDrop={handlePoolDrop}>
                <div className="ba-pool-header">
                    <span className="ba-pool-label">Lenses</span>
                    <div className="ba-count-input">
                        <button onClick={() => onLensCountChange(Math.max(1, lensCount - 1))}>−</button>
                        <input type="number" value={lensCount} min={1} max={20}
                            onChange={e => onLensCountChange(Math.max(1, parseInt(e.target.value) || 1))} />
                        <button onClick={() => onLensCountChange(Math.min(20, lensCount + 1))}>+</button>
                    </div>
                </div>
                <div className="ba-pool-items">
                    {poolLenses.map(id => (
                        <div key={id} className="ba-pool-item ba-lens-item" draggable
                            onDragStart={() => handleDragStart(id)} onDragEnd={handleDragEnd}>
                            <GripVertical size={12} className="ba-grip" />
                            <div className="ba-lens-shape">
                                <svg viewBox="0 0 60 20" width="60" height="20">
                                    <path d="M2,16 Q30,2 58,16 Q30,18 2,16 Z"
                                        fill="rgba(45,212,191,0.3)" stroke="#2dd4bf" strokeWidth="1.2" />
                                    <path d="M6,15 Q30,5 54,15" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.6" />
                                </svg>
                            </div>
                            <span className="ba-pool-id">{id}</span>
                        </div>
                    ))}
                    {poolLenses.length === 0 && <div className="ba-pool-empty">All lenses placed ✓</div>}
                </div>
            </div>

            {/* ── Center: Premium Barrel SVG ── */}
            <div className="ba-barrel-wrap" ref={barrelRef}>
                <svg width="100%" height="100%" viewBox={`0 0 ${svgW} ${svgH}`}
                    preserveAspectRatio="xMidYMid meet" style={{ maxHeight: '100%', display: 'block' }}>

                    <BarrelSVGDefs id={SVG_ID}
                        barrelTheme={DEFAULT_BARREL_THEME}
                        lensTheme={DEFAULT_LENS_THEME}
                        spacerTheme={DEFAULT_SPACER_THEME} />

                    {/* OPEN label */}
                    <text x={cx} y={12} textAnchor="middle" fill="#64748b" fontSize="9"
                        fontWeight="600" fontFamily="Inter,system-ui">▼ OPEN SIDE</text>

                    {/* Barrel wall staircase */}
                    {totalSlots > 0 && <BarrelWalls id={SVG_ID} geo={geo} />}

                    {/* Slots: components / drop zones */}
                    {layout.map((step, i) => {
                        const slot = slots[i]
                        const isFilled = slot?.id !== null
                        const isOver = dragOverSlot === i
                        const isSel = selectedStep === i

                        const compW = step.innerWidth * 0.88
                        const compCy = step.centerY

                        return (
                            <g key={i}>
                                {isFilled ? (
                                    /* Rendered component */
                                    <g onClick={() => setSelectedStep(isSel ? null : i)} style={{ cursor: 'pointer' }}>
                                        {slot!.type === 'lens' ? (
                                            <BarrelLens id={SVG_ID} cx={cx} cy={compCy}
                                                width={compW} thickness={stepH * 0.7}
                                                curvature={DEFAULT_LENS_THEME.curvature}
                                                theme={DEFAULT_LENS_THEME}
                                                label={slot!.id!} selected={isSel} breathing={true} />
                                        ) : (
                                            <BarrelSpacer id={SVG_ID} cx={cx} cy={compCy}
                                                width={compW} height={Math.max(5, stepH * 0.22)}
                                                theme={DEFAULT_SPACER_THEME}
                                                label={slot!.id!} selected={isSel} />
                                        )}
                                    </g>
                                ) : (
                                    /* Drop zone */
                                    <BarrelDropZone id={SVG_ID} cx={cx} cy={compCy}
                                        width={compW} height={stepH * 0.75}
                                        strokeColor="rgba(148,163,184,0.12)"
                                        strokeDash="5,4" text="Drop here"
                                        textColor="rgba(148,163,184,0.25)"
                                        isActive={isOver} />
                                )}

                                {/* foreignObject for drag-drop events */}
                                <foreignObject x={cx - step.innerWidth / 2} y={step.topY}
                                    width={step.innerWidth} height={step.height}>
                                    <div style={{ width: '100%', height: '100%' }}
                                        onDragOver={e => handleSlotDragOver(e, i)}
                                        onDragLeave={handleSlotDragLeave}
                                        onDrop={e => handleSlotDrop(e, i)}>
                                        {isFilled && (
                                            <div style={{ width: '100%', height: '100%', cursor: 'grab' }}
                                                draggable onDragStart={() => handleDragStart(slot!.id!)}
                                                onDragEnd={handleDragEnd} />
                                        )}
                                    </div>
                                </foreignObject>

                                {/* Step index */}
                                <text x={cx - step.innerWidth / 2 - 12} y={compCy}
                                    textAnchor="middle" dominantBaseline="central"
                                    fill="rgba(148,163,184,0.2)" fontSize="8" fontFamily="Inter,system-ui">
                                    {i + 1}
                                </text>

                                {/* Remove button (when selected + filled) */}
                                {isFilled && isSel && (
                                    <foreignObject x={cx + step.innerWidth / 2 + 6} y={compCy - 9} width={18} height={18}>
                                        <button className="ba-remove-btn" onClick={() => removeFromSlot(i)}>
                                            <Trash2 size={10} />
                                        </button>
                                    </foreignObject>
                                )}
                            </g>
                        )
                    })}

                    {/* TTL dimension line */}
                    {totalSlots > 0 && (
                        <BarrelDimLine
                            x1={cx - barrelOuterTopW / 2 - 16} y1={barrelTopY + 4}
                            x2={cx - barrelOuterTopW / 2 - 16} y2={barrelBotY - 4}
                            color="#ef4444" strokeWidth={1} arrowSize={4}
                            label="TTL" vertical={true} />
                    )}

                    {/* CLOSED label */}
                    <text x={cx} y={svgH - 6} textAnchor="middle" fill="#64748b" fontSize="9"
                        fontWeight="600" fontFamily="Inter,system-ui">▲ CLOSED</text>
                </svg>

                {/* TTL input */}
                <div className="ba-ttl-row">
                    <span className="ba-ttl-label" style={{ color: '#ef4444' }}>TTL</span>
                    <input type="number" step="0.001" className="ba-ttl-input" value={ttl}
                        onChange={e => onTtlChange(parseFloat(e.target.value) || 0)} />
                    <span className="ba-ttl-unit">mm</span>
                </div>
            </div>

            {/* ── Right: Spacer Pool ── */}
            <div className="ba-pool ba-pool-right" onDragOver={handlePoolDragOver} onDrop={handlePoolDrop}>
                <div className="ba-pool-header">
                    <span className="ba-pool-label">Spacers</span>
                    <div className="ba-count-input">
                        <button onClick={() => onSpacerCountChange(Math.max(0, spacerCount - 1))}>−</button>
                        <input type="number" value={spacerCount} min={0} max={20}
                            onChange={e => onSpacerCountChange(Math.max(0, parseInt(e.target.value) || 0))} />
                        <button onClick={() => onSpacerCountChange(Math.min(20, spacerCount + 1))}>+</button>
                    </div>
                </div>
                <div className="ba-pool-items">
                    {poolSpacers.map(id => (
                        <div key={id} className="ba-pool-item ba-spacer-item" draggable
                            onDragStart={() => handleDragStart(id)} onDragEnd={handleDragEnd}>
                            <GripVertical size={12} className="ba-grip" />
                            <div className="ba-spacer-shape" />
                            <span className="ba-pool-id">{id}</span>
                        </div>
                    ))}
                    {poolSpacers.length === 0 && spacerCount > 0 && <div className="ba-pool-empty">All spacers placed ✓</div>}
                    {spacerCount === 0 && <div className="ba-pool-empty">No spacers</div>}
                </div>
            </div>

            {/* ── Step Params Panel ── */}
            {selectedStep !== null && selectedStep < stepParams.length && (
                <div className="ba-step-panel">
                    <div className="ba-step-panel-title">
                        Step {selectedStep + 1}
                        {slots[selectedStep]?.id && <span className="ba-step-panel-comp"> — {slots[selectedStep].id}</span>}
                    </div>
                    <div className="ba-step-panel-row">
                        <div className="ba-step-field">
                            <label>Step Height</label>
                            <div className="ba-step-input-wrap">
                                <span className="ba-arrow-indicator" />
                                <input type="number" step="0.001" value={stepParams[selectedStep].stepHeight}
                                    onChange={e => updateStepParam(selectedStep!, 'stepHeight', parseFloat(e.target.value) || 0)} />
                                <span>mm</span>
                            </div>
                        </div>
                        <div className="ba-step-field">
                            <label>Inner Diameter</label>
                            <div className="ba-step-input-wrap">
                                <span className="ba-arrow-indicator" />
                                <input type="number" step="0.001" value={stepParams[selectedStep].innerDiameter}
                                    onChange={e => updateStepParam(selectedStep!, 'innerDiameter', parseFloat(e.target.value) || 0)} />
                                <span>mm</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
