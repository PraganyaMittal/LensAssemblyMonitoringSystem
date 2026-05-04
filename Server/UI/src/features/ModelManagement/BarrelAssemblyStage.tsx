import { useState, useRef, useCallback } from 'react'
import { GripVertical, Trash2 } from 'lucide-react'
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
}

export default function BarrelAssemblyStage({
    lensCount, spacerCount, onLensCountChange, onSpacerCountChange,
    ttl, onTtlChange, slots, onSlotsChange,
    stepParams, onStepParamsChange, componentParams
}: Props) {
    const [dragItem, setDragItem] = useState<string | null>(null)
    const [dragSourceIdx, setDragSourceIdx] = useState<number | null>(null)
    const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)
    const [selectedStep, setSelectedStep] = useState<number | null>(null)
    const barrelRef = useRef<HTMLDivElement>(null)

    // FIX: Derive totalSlots from actual array length, not from counts
    // This prevents crashes during the render between count change and useEffect slot reset
    const totalSlots = slots.length

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
    const handleSlotDrop = useCallback((idx: number) => {
        if (!dragItem) return
        const newSlots = [...slots]
        
        if (dragSourceIdx !== null) {
            // Dragged from another slot -> SWAP components!
            const temp = newSlots[idx]
            newSlots[idx] = newSlots[dragSourceIdx]
            newSlots[dragSourceIdx] = temp
        } else {
            // Dragged from pool -> REPLACE component
            const oldIdx = newSlots.findIndex(s => s.id === dragItem)
            if (oldIdx >= 0) newSlots[oldIdx] = { id: null, type: 'empty' }
            newSlots[idx] = { id: dragItem, type: dragItem.startsWith('L') ? 'lens' : 'spacer' }
        }

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
                        />
                        {/* TTL Line and Input overlaid on barrel */}
                        <div style={{
                            position: 'absolute',
                            right: '30px',
                            top: '10%',
                            bottom: '10%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            pointerEvents: 'none'
                        }}>
                            <div style={{ flex: 1, borderLeft: '2px dashed #ef4444', opacity: 0.6 }} />
                            <div style={{
                                pointerEvents: 'auto',
                                background: 'rgba(15,23,42,0.85)',
                                padding: '4px 6px',
                                borderRadius: '4px',
                                border: '1px solid rgba(239,68,68,0.5)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                margin: '4px 0',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                            }}>
                                <span style={{ color: '#ef4444', fontSize: '0.65rem', fontWeight: 700 }}>TTL</span>
                                <input type="number" step="0.001" className="ba-ttl-input" value={ttl}
                                    onChange={e => onTtlChange(parseFloat(e.target.value) || 0)}
                                    style={{ width: '45px', height: '22px', fontSize: '0.75rem', padding: '0 2px' }} />
                                <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>mm</span>
                            </div>
                            <div style={{ flex: 1, borderLeft: '2px dashed #ef4444', opacity: 0.6 }} />
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
                        {slots[selectedStep]?.id && (
                            <button className="ba-remove-btn" style={{ marginLeft: 8 }} onClick={() => removeFromSlot(selectedStep!)}>
                                <Trash2 size={10} />
                            </button>
                        )}
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
