import { useState, useRef, useCallback } from 'react'
import { GripVertical, Trash2, Info } from 'lucide-react'
import type { StepParams } from '../../types'
import Barrel3DView from './Barrel3DView'

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
    componentParams?: Record<string, any>
    machineCount?: number
}

export default function BarrelAssemblyStage({
    lensCount, spacerCount, onLensCountChange, onSpacerCountChange,
    ttl, onTtlChange, slots, onSlotsChange,
    stepParams, onStepParamsChange, componentParams, machineCount = 7
}: Props) {
    const [dragItem, setDragItem] = useState<string | null>(null)
    const [dragSourceIdx, setDragSourceIdx] = useState<number | null>(null)
    const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)
    const [selectedStep, setSelectedStep] = useState<number | null>(null)
    const [barrelBounds, setBarrelBounds] = useState<{ topPct: number; bottomPct: number }>({ topPct: 5, bottomPct: 95 })
    const [stepBounds, setStepBounds] = useState<number[]>([])
    const barrelRef = useRef<HTMLDivElement>(null)

    // Derive totalSlots from actual array length
    const totalSlots = slots.length

    // Validation: max components = 2 × machines (each MC has 2 pickers)
    const maxComponents = machineCount * 2

    // Pool tracking
    const placedLenses = slots.filter(s => s.id?.startsWith('L')).map(s => s.id!)
    const placedSpacers = slots.filter(s => s.id?.startsWith('SP')).map(s => s.id!)
    const poolLenses = Array.from({ length: lensCount }, (_, i) => `L${i + 1}`).filter(id => !placedLenses.includes(id))
    const poolSpacers = Array.from({ length: spacerCount }, (_, i) => `SP${i + 1}`).filter(id => !placedSpacers.includes(id))

    // Drag handlers (HTML side — lens/spacer pool cards)
    const handleDragStart = (id: string) => { setDragItem(id); setDragSourceIdx(null) }
    const handleDragEnd = () => { setDragItem(null); setDragSourceIdx(null); setDragOverSlot(null) }

    // Drag handler (3D side — dragging out of the barrel)
    const handleStepDragStart = useCallback((id: string, idx: number) => {
        setDragItem(id)
        setDragSourceIdx(idx)
    }, [])

    // Handle drop on a barrel slot (called from 3D scene)
    // Only allow drops from pool onto EMPTY slots. No swapping or replacing.
    const handleSlotDrop = useCallback((idx: number) => {
        if (!dragItem) return
        // Block: dragging from one barrel slot to another (no swap)
        if (dragSourceIdx !== null) return
        // Block: dropping onto a filled slot (no replace)
        if (slots[idx]?.id) return

        const newSlots = [...slots]
        // Dragged from pool → place into empty slot
        const oldIdx = newSlots.findIndex(s => s.id === dragItem)
        if (oldIdx >= 0) newSlots[oldIdx] = { id: null, type: 'empty' }
        newSlots[idx] = { id: dragItem, type: dragItem.startsWith('L') ? 'lens' : 'spacer' }

        onSlotsChange(newSlots)
        setDragItem(null)
        setDragSourceIdx(null)
        setDragOverSlot(null)
    }, [dragItem, dragSourceIdx, slots, onSlotsChange])

    const handlePoolDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
    const handlePoolDrop = (e: React.DragEvent) => {
        e.preventDefault()
        if (dragItem && dragSourceIdx !== null) {
            // Dragged from barrel to pool -> REMOVE component
            const newSlots = [...slots]
            newSlots[dragSourceIdx] = { id: null, type: 'empty' }
            onSlotsChange(newSlots)
        }
        setDragItem(null)
        setDragSourceIdx(null)
        setDragOverSlot(null)
    }

    const removeFromSlot = (idx: number) => {
        const newSlots = [...slots]; newSlots[idx] = { id: null, type: 'empty' }; onSlotsChange(newSlots)
    }

    const updateStepParam = (idx: number, field: keyof StepParams, value: number) => {
        const newParams = [...stepParams]; newParams[idx] = { ...newParams[idx], [field]: value }; onStepParamsChange(newParams)
    }

    // Can lens count be increased?
    const canIncreaseLens = (lensCount + spacerCount) < maxComponents
    const canIncreaseSpacer = (lensCount + spacerCount) < maxComponents

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
                        <button onClick={() => onLensCountChange(Math.min(20, lensCount + 1))}
                            disabled={!canIncreaseLens}
                            title={!canIncreaseLens ? `Max ${maxComponents} components (${machineCount} machines × 2 pickers)` : ''}>+</button>
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

            {/* ── Center: 3D Barrel (Three.js Canvas) ── */}
            <div
                className="ba-barrel-wrap"
                ref={barrelRef}
            >
                {totalSlots > 0 ? (
                    <>
                        <Barrel3DView
                            slots={slots}
                            stepParams={stepParams}
                            ttl={ttl}
                            componentParams={componentParams}
                            isDragging={!!dragItem}
                            onStepHover={setDragOverSlot}
                            onStepDrop={handleSlotDrop}
                            onStepClick={setSelectedStep}
                            selectedStep={selectedStep}
                            onStepDragStart={handleStepDragStart}
                            onBarrelBoundsChange={setBarrelBounds}
                            onStepBoundsChange={setStepBounds}
                        />
                        {/* Step badges overlaid on left edge of barrel */}
                        <div className="ba-step-badges">
                            {slots.map((slot, i) => {
                                const topPct = stepBounds[i] ?? 50
                                return (
                                    <div key={i} className="ba-step-badge-wrap" style={{ top: `${topPct}%` }}>
                                        <button
                                            className={`ba-step-badge ${selectedStep === i ? 'active' : ''} ${slot.type !== 'empty' ? slot.type : 'empty'}`}
                                            onClick={() => setSelectedStep(selectedStep === i ? null : i)}
                                            title={`Step ${i + 1}${slot.id ? ` — ${slot.id}` : ' (empty)'}`}
                                        >
                                            {i + 1}
                                        </button>
                                        
                                        {/* Pop-up params panel for selected step */}
                                        {selectedStep === i && (() => {
                                            const isTop = topPct < 15;
                                            const isBottom = topPct > 85;
                                            const popupStyle: React.CSSProperties = {
                                                top: isTop ? '0' : isBottom ? 'auto' : '50%',
                                                bottom: isBottom ? '0' : 'auto',
                                                transform: isTop || isBottom ? 'none' : 'translateY(-50%)'
                                            };
                                            return (
                                                <div className="ba-step-popup" style={popupStyle}>
                                                    <div className="ba-params-header">
                                                        <div className="ba-params-title">
                                                            <span className="ba-params-step-num">{selectedStep + 1}</span>
                                                            <span>Step {selectedStep + 1}</span>
                                                        </div>
                                                        {slot.id && (
                                                            <span className={`ba-params-comp-badge ${slot.type}`}>
                                                                {slot.id}
                                                            </span>
                                                        )}
                                                        <button className="ba-params-close" onClick={() => setSelectedStep(null)}>×</button>
                                                    </div>

                                                    <div className="ba-params-fields">
                                                        <div className="ba-param-field">
                                                            <label>Step Height</label>
                                                            <div className="ba-param-input-row">
                                                                <input type="number" step="0.001" value={stepParams[selectedStep].stepHeight}
                                                                    onChange={e => updateStepParam(selectedStep!, 'stepHeight', parseFloat(e.target.value) || 0)} />
                                                                <span className="ba-param-unit">mm</span>
                                                            </div>
                                                        </div>
                                                        <div className="ba-param-field">
                                                            <label>Inner Diameter</label>
                                                            <div className="ba-param-input-row">
                                                                <input type="number" step="0.001" value={stepParams[selectedStep].innerDiameter}
                                                                    onChange={e => updateStepParam(selectedStep!, 'innerDiameter', parseFloat(e.target.value) || 0)} />
                                                                <span className="ba-param-unit">mm</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {slot.id && (
                                                        <button className="ba-params-remove" onClick={() => removeFromSlot(selectedStep!)}>
                                                            <Trash2 size={12} /> Remove
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )
                            })}
                        </div>
                        {/* TTL Line and Input — positioned to barrel bounds */}
                        <div className="ba-ttl-overlay" style={{
                            top: `${barrelBounds.topPct}%`,
                            bottom: `${100 - barrelBounds.bottomPct}%`
                        }}>
                            <div className="ba-ttl-line-top" />
                            <div className="ba-ttl-input-wrap">
                                <span className="ba-ttl-tag">TTL</span>
                                <input type="number" step="0.001" className="ba-ttl-input" value={ttl}
                                    onChange={e => onTtlChange(parseFloat(e.target.value) || 0)} />
                                <span className="ba-ttl-unit">mm</span>
                            </div>
                            <div className="ba-ttl-line-bottom" />
                        </div>
                    </>
                ) : (
                    <div className="ba-empty-barrel">
                        <p>Add lenses and spacers to begin assembly</p>
                    </div>
                )}
            </div>

            {/* ── Right: Spacer Pool ── */}
            <div className="ba-pool ba-pool-right" onDragOver={handlePoolDragOver} onDrop={handlePoolDrop}>
                <div className="ba-pool-header">
                    <span className="ba-pool-label">Spacers</span>
                    <div className="ba-count-input">
                        <button onClick={() => onSpacerCountChange(Math.max(0, spacerCount - 1))}>−</button>
                        <input type="number" value={spacerCount} min={0} max={20}
                            onChange={e => onSpacerCountChange(Math.max(0, parseInt(e.target.value) || 0))} />
                        <button onClick={() => onSpacerCountChange(Math.min(20, spacerCount + 1))}
                            disabled={!canIncreaseSpacer}
                            title={!canIncreaseSpacer ? `Max ${maxComponents} components (${machineCount} machines × 2 pickers)` : ''}>+</button>
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
        </div>
    )
}
