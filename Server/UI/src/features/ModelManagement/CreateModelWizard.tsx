import { useState, useEffect } from 'react'

import { ArrowLeft, ArrowRight, Save, X, Check, Box, Grid3X3, Users, ClipboardList, Layers, Monitor } from 'lucide-react'
import { factoryApi } from '../../services/api'
import type { LineModel, BarrelConfig, PickerConfig, SaveModelRequest, StepParams, LensComponentParams, SpacerComponentParams } from '../../types'
import { Toast } from '../../components/Toast'
import { eventBus, EVENTS } from '../../utils/eventBus'
import BarrelTrayDiagram from './BarrelTrayDiagram'
import BarrelAssemblyStage from './BarrelAssemblyStage'
import ComponentDetailStage from './ComponentDetailStage'

interface Props {
    lineNumber: number
    version: string
    baseModel: LineModel | null
    onComplete: () => void
    onCancel: () => void
    initialStage?: number
}

interface BarrelSlot {
    id: string | null
    type: 'empty' | 'lens' | 'spacer'
}

const STAGES = ['Model Info', 'Barrel Tray', 'Barrel Assembly', 'Component Detail', 'Picker Assign', 'Summary']

export default function CreateModelWizard({ lineNumber, version, baseModel, onComplete, onCancel, initialStage }: Props) {
    const [stage, setStage] = useState(initialStage ?? 0)
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)

    // Auto-collapse sidebar on wizard open, expand on close
    useEffect(() => {
        eventBus.emit(EVENTS.SIDEBAR_COLLAPSE)
        return () => { eventBus.emit(EVENTS.SIDEBAR_EXPAND) }
    }, [])

    // Stage 0: Model Info
    const [modelName, setModelName] = useState(baseModel?.modelName ?? '')
    const [description, setDescription] = useState('')
    const [machineCount, setMachineCount] = useState(baseModel?.machineCount ?? 3)

    // Stage 1: Barrel Tray + basic barrel config
    const [barrel, setBarrel] = useState<BarrelConfig>({
        lensCount: baseModel?.lensCount ?? 3,
        spacerCount: baseModel?.spacerCount ?? 3,
        assemblySequence: [],
        ttl: baseModel?.ttl ?? 8.430,
        trayDimX: baseModel?.trayDimX ?? 4,
        trayDimY: baseModel?.trayDimY ?? 3,
    })

    // Stage 2: Barrel Assembly (drag-drop)
    const [barrelSlots, setBarrelSlots] = useState<BarrelSlot[]>([])
    const [stepParams, setStepParams] = useState<StepParams[]>([])
    const [ttl, setTtl] = useState(8.430)

    // Stage 3: Component Detail
    const [componentParams, setComponentParams] = useState<Record<string, LensComponentParams | SpacerComponentParams>>({})

    // Stage 4: Picker Assignment
    const [currentMc, setCurrentMc] = useState(1)
    const [pickers, setPickers] = useState<PickerConfig[]>([])

    // Pre-fill from base model
    useEffect(() => {
        if (!baseModel) return
        try {
            if (baseModel.assemblySequence) {
                const seq = JSON.parse(baseModel.assemblySequence)
                setBarrel(b => ({ ...b, assemblySequence: seq }))
            }
            if (baseModel.stepParamsJson) {
                setStepParams(JSON.parse(baseModel.stepParamsJson))
            }
            if (baseModel.componentParamsJson) {
                setComponentParams(JSON.parse(baseModel.componentParamsJson))
            }
            if (baseModel.barrelSlotsJson) {
                setBarrelSlots(JSON.parse(baseModel.barrelSlotsJson))
            }
        } catch { }

        const loadBase = async () => {
            try {
                const configs = await factoryApi.getPickerConfig(lineNumber, baseModel.modelName, version)
                if (configs.length > 0) {
                    setPickers(configs.map((c: any) => ({
                        mcNumber: c.mcNumber,
                        picker1Enabled: c.picker1Enabled,
                        picker1Type: c.picker1Type,
                        picker1Position: c.picker1Position,
                        picker1Params: c.picker1Params ? JSON.parse(c.picker1Params) : null,
                        picker2Enabled: c.picker2Enabled,
                        picker2Type: c.picker2Type,
                        picker2Position: c.picker2Position,
                        picker2Params: c.picker2Params ? JSON.parse(c.picker2Params) : null,
                    })))
                    setMachineCount(configs.length)
                }
            } catch { }
        }
        loadBase()
    }, [baseModel])

    // Atomically update counts + slots + stepParams to prevent crash
    // (avoids the one-render-late race condition between counts and slot arrays)
    const handleCountChange = (newLensCount: number, newSpacerCount: number) => {
        const total = newLensCount + newSpacerCount
        setBarrel(b => ({ ...b, lensCount: newLensCount, spacerCount: newSpacerCount }))
        setBarrelSlots(Array.from({ length: total }, () => ({ id: null, type: 'empty' as const })))
        const minDia = 5.0, maxDia = 11.0
        setStepParams(Array.from({ length: total }, (_, i) => ({
            stepHeight: 1.0,
            innerDiameter: parseFloat((minDia + (maxDia - minDia) * (i / Math.max(1, total - 1))).toFixed(3))
        })))
    }

    // Initialize on first mount (from base model defaults)
    useEffect(() => {
        if (baseModel?.barrelSlotsJson) return // Don't overwrite if we are hydrating detailed state
        handleCountChange(barrel.lensCount, barrel.spacerCount)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Sync counts when machine count changes (if no base model)
    useEffect(() => {
        if (!baseModel) {
            handleCountChange(machineCount, machineCount)
        }
    }, [machineCount]) // eslint-disable-line react-hooks/exhaustive-deps

    // Sync assembly sequence from barrel slots (for picker assignment & save)
    useEffect(() => {
        const seq = barrelSlots.filter(s => s.id !== null).map(s => s.id!)
        setBarrel(b => ({ ...b, assemblySequence: seq }))
    }, [barrelSlots])

    // Initialize pickers when machine count changes
    useEffect(() => {
        setPickers(prev => {
            const result: PickerConfig[] = []
            for (let i = 1; i <= machineCount; i++) {
                const existing = prev.find(p => p.mcNumber === i)
                result.push(existing ?? {
                    mcNumber: i,
                    picker1Enabled: true, picker1Type: null, picker1Position: null, picker1Params: null,
                    picker2Enabled: true, picker2Type: null, picker2Position: null, picker2Params: null,
                })
            }
            return result
        })
        if (currentMc > machineCount) setCurrentMc(Math.max(1, machineCount))
    }, [machineCount])

    const updatePicker = (mcNum: number, field: string, value: any) => {
        setPickers(prev => prev.map(p =>
            p.mcNumber === mcNum ? { ...p, [field]: value } : p
        ))
    }

    const assignedPositions = pickers.flatMap(p => [
        p.picker1Position, p.picker2Enabled ? p.picker2Position : null
    ].filter(Boolean))

    const allPositions = barrel.assemblySequence

    const getAvailablePositions = (currentPos: string | null, type: string | null) => {
        return allPositions.filter(p => {
            // Filter by type: Lens picker only sees L* positions, Spacer only sees SP*
            if (type === 'Lens' && !p.startsWith('L')) return false
            if (type === 'Spacer' && !p.startsWith('SP')) return false
            return !assignedPositions.includes(p) || p === currentPos
        })
    }

    const handleSave = async () => {
        if (!modelName.trim()) {
            setToast({ msg: 'Model name is required', type: 'error' }); setStage(0); return
        }
        if (machineCount < 1) {
            setToast({ msg: 'At least 1 machine required', type: 'error' }); setStage(0); return
        }
        setSaving(true)
        try {
            const finalComponentParams = { ...componentParams }
            barrelSlots.filter(s => s.id !== null).forEach(s => {
                if (!finalComponentParams[s.id!]) {
                    finalComponentParams[s.id!] = s.id!.startsWith('L') ? {
                        angle: 0, pressure: 0, lensDiameter: 5.0, lensHeight: 2.0, lensThickness: 1.5
                    } : {
                        angle: 0, pressure: 0, spacerOuterDia: 5.0, spacerInnerDia: 3.0, spacerThickness: 0.3
                    }
                }
            })

            const request: SaveModelRequest = {
                modelName: modelName.trim(),
                description,
                baseModelFileId: undefined,
                barrelConfig: { 
                    ...barrel, 
                    ttl, 
                    machineCount,
                    stepParamsJson: JSON.stringify(stepParams),
                    componentParamsJson: JSON.stringify(finalComponentParams),
                    barrelSlotsJson: JSON.stringify(barrelSlots),
                },
                pickerConfigs: pickers,
            }
            await factoryApi.saveLineModel(lineNumber, version, request)
            onComplete()
        } catch (e: any) {
            setToast({ msg: e?.response?.data?.error || e.message || 'Save failed', type: 'error' })
        } finally {
            setSaving(false)
        }
    }

    const currentPicker = pickers.find(p => p.mcNumber === currentMc)
    const filledSlotCount = barrelSlots.filter(s => s.id !== null).length
    const totalSlots = barrel.lensCount + barrel.spacerCount

    // ── Picker validation ──
    const getPickerValidation = (): { errors: string[], warnings: string[] } => {
        const errors: string[] = []
        const warnings: string[] = []

        // Check complete coverage
        const unassigned = allPositions.filter(p => !assignedPositions.includes(p))
        if (unassigned.length > 0) {
            errors.push(`Unassigned positions: ${unassigned.join(', ')}`)
        }

        // Check for enabled-but-incomplete pickers
        for (const p of pickers) {
            if (p.picker1Enabled && (!p.picker1Type || !p.picker1Position)) {
                warnings.push(`MC-${p.mcNumber} Picker 1: enabled but type/position not set`)
            }
            if (p.picker2Enabled && (!p.picker2Type || !p.picker2Position)) {
                warnings.push(`MC-${p.mcNumber} Picker 2: enabled but type/position not set`)
            }
        }

        return { errors, warnings }
    }

    const pickerValidation = getPickerValidation()

    const canProceed = (s: number): boolean => {
        switch (s) {
            case 0: return modelName.trim().length > 0 && machineCount >= 1
            case 1: return (barrel.trayDimX ?? 0) >= 1 && (barrel.trayDimY ?? 0) >= 1
            case 2: return filledSlotCount === totalSlots && totalSlots > 0  // ALL components must be placed
            case 3: return true
            case 4: return pickerValidation.errors.length === 0  // block on errors, allow warnings
            default: return true
        }
    }

    return (
        <div className="mm-wizard">
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* Header */}
            <div className="mm-wizard-header" style={{ padding: '8px 16px', gap: '8px', borderBottom: '1px solid var(--border-color, #334155)', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)', flex: 1 }}>
                    Create New Model — Line {lineNumber}
                </span>

                <div className="mm-stepper-compact" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {STAGES.map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{
                                width: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '10px', fontWeight: 600, cursor: i < stage ? 'pointer' : 'default',
                                background: i === stage ? '#38bdf8' : i < stage ? '#22c55e' : 'transparent',
                                border: `1px solid ${i === stage ? '#38bdf8' : i < stage ? '#22c55e' : '#334155'}`,
                                color: i <= stage ? '#fff' : '#64748b', transition: 'all 0.2s'
                            }} onClick={() => i < stage && setStage(i)} title={s}>
                                {i < stage ? <Check size={10} /> : i + 1}
                            </div>
                            {i < STAGES.length - 1 && <div style={{ width: '12px', height: '1px', background: i < stage ? '#22c55e' : '#334155' }} />}
                        </div>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '16px' }}>
                    <button className="mm-btn mm-btn-outline mm-btn-sm" disabled={stage === 0}
                        onClick={() => setStage(stage - 1)}>
                        <ArrowLeft size={14} /> Prev
                    </button>
                    {stage < STAGES.length - 1 ? (
                        <button className="mm-btn mm-btn-primary mm-btn-sm"
                            disabled={!canProceed(stage)}
                            onClick={() => setStage(stage + 1)}>
                            Next <ArrowRight size={14} />
                        </button>
                    ) : (
                        !baseModel && (
                            <button className="mm-btn mm-btn-accent mm-btn-sm" onClick={handleSave} disabled={saving}>
                                <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                            </button>
                        )
                    )}
                    <div style={{ width: '1px', height: '16px', background: 'var(--border-color, #334155)', margin: '0 4px' }} />
                    <button className="mm-btn mm-btn-ghost mm-btn-sm" onClick={onCancel} style={{ padding: '4px', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}><X size={16} /></button>
                </div>
            </div>

            {/* Stage Content */}
            <div className={`mm-wizard-content${stage === 2 || stage === 3 ? ' mm-wizard-content-fullbleed' : ''}`}>

                {/* ═══ Stage 0: Model Info ═══ */}
                {stage === 0 && (
                    <div className="mm-stage">
                        <h3>Model Information</h3>
                        <div className="mm-form-group">
                            <label>Model Name *</label>
                            <input className="mm-input" value={modelName}
                                onChange={e => setModelName(e.target.value)} placeholder="e.g. S27" autoFocus />
                        </div>
                        <div className="mm-form-group">
                            <label>Description</label>
                            <input className="mm-input" value={description}
                                onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
                        </div>
                        <div className="mm-form-group">
                            <label>Number of Machines in Line *</label>
                            <div className="mm-mc-input-wrap" style={{ gap: '4px' }}>
                                <button className="mm-mc-btn" style={{ width: '24px', height: '24px', fontSize: '0.85rem', padding: 0 }} onClick={() => setMachineCount(Math.max(1, machineCount - 1))}>−</button>
                                <input type="number" className="mm-input mm-mc-input" value={machineCount} min={1} max={50}
                                    onChange={e => setMachineCount(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: '40px', height: '24px' }} />
                                <button className="mm-mc-btn" style={{ width: '24px', height: '24px', fontSize: '0.85rem', padding: 0 }} onClick={() => setMachineCount(Math.min(50, machineCount + 1))}>+</button>
                            </div>
                            <span className="mm-form-hint">Picker assignment will be asked for each machine</span>
                        </div>
                        <div className="mm-info-box">
                            <strong>Base Model:</strong> {baseModel ? baseModel.modelName : 'DEFAULT_MODEL'}
                            <br />
                            <strong>Line:</strong> Line {lineNumber} (Gen {version})
                        </div>
                    </div>
                )}

                {/* ═══ Stage 1: Barrel Tray ═══ */}
                {stage === 1 && (
                    <div className="mm-stage mm-stage-wide" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', textAlign: 'center', padding: '8px 0 0 0' }}>
                            Barrel tray
                        </div>
                        <BarrelTrayDiagram
                            x={barrel.trayDimX ?? 4}
                            y={barrel.trayDimY ?? 3}
                            onXChange={v => setBarrel({ ...barrel, trayDimX: v })}
                            onYChange={v => setBarrel({ ...barrel, trayDimY: v })}
                        />
                    </div>
                )}

                {/* ═══ Stage 2: Barrel Assembly (Drag & Drop) ═══ */}
                {stage === 2 && (
                    <BarrelAssemblyStage
                        lensCount={barrel.lensCount}
                        spacerCount={barrel.spacerCount}
                        onLensCountChange={n => handleCountChange(n, barrel.spacerCount)}
                        onSpacerCountChange={n => handleCountChange(barrel.lensCount, n)}
                        ttl={ttl}
                        onTtlChange={setTtl}
                        slots={barrelSlots}
                        onSlotsChange={setBarrelSlots}
                        stepParams={stepParams}
                        onStepParamsChange={setStepParams}
                        componentParams={componentParams}
                        machineCount={machineCount}
                    />
                )}

                {/* ═══ Stage 3: Component Detail ═══ */}
                {stage === 3 && (
                    <ComponentDetailStage
                        slots={barrelSlots}
                        stepParams={stepParams}
                        ttl={ttl}
                        componentParams={componentParams}
                        onComponentParamsChange={setComponentParams}
                    />
                )}

                {/* ═══ Stage 4: Picker Assignment ═══ */}
                {stage === 4 && currentPicker && (
                    <div className="mm-stage" style={{ padding: '8px 0' }}>
                        <div className="mm-picker-header" style={{ marginBottom: '8px' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>Picker Assignment — MC-{currentMc}</div>
                            <div className="mm-picker-progress">
                                {assignedPositions.length} / {allPositions.length} positions assigned
                            </div>
                        </div>

                        {/* Column-wise picker layout: Picker 1 | Picker 2 side by side */}
                        <div className="mm-picker-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            {/* Picker 1 Column */}
                            <div className="mm-picker-section">
                                <label><input type="checkbox" checked={currentPicker.picker1Enabled}
                                    onChange={e => updatePicker(currentMc, 'picker1Enabled', e.target.checked)} /> Picker 1</label>
                                {currentPicker.picker1Enabled && (
                                    <>
                                        <div className="mm-form-group" style={{ marginTop: '6px' }}>
                                            <label style={{ fontSize: '0.7rem' }}>Type</label>
                                            <select className="mm-input" value={currentPicker.picker1Type || ''}
                                                onChange={e => { updatePicker(currentMc, 'picker1Type', e.target.value || null); updatePicker(currentMc, 'picker1Position', null) }}>
                                                <option value="">Select...</option>
                                                <option value="Lens">Lens</option>
                                                <option value="Spacer">Spacer</option>
                                            </select>
                                        </div>
                                        <div className="mm-form-group" style={{ marginTop: '4px' }}>
                                            <label style={{ fontSize: '0.7rem' }}>Position</label>
                                            <select className="mm-input" value={currentPicker.picker1Position || ''}
                                                onChange={e => updatePicker(currentMc, 'picker1Position', e.target.value || null)}>
                                                <option value="">Select...</option>
                                                {getAvailablePositions(currentPicker.picker1Position, currentPicker.picker1Type).map(p => (
                                                    <option key={p} value={p}>{p}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Picker 2 Column */}
                            <div className="mm-picker-section">
                                <label><input type="checkbox" checked={currentPicker.picker2Enabled}
                                    onChange={e => updatePicker(currentMc, 'picker2Enabled', e.target.checked)} /> Picker 2</label>
                                {currentPicker.picker2Enabled && (
                                    <>
                                        <div className="mm-form-group" style={{ marginTop: '6px' }}>
                                            <label style={{ fontSize: '0.7rem' }}>Type</label>
                                            <select className="mm-input" value={currentPicker.picker2Type || ''}
                                                onChange={e => { updatePicker(currentMc, 'picker2Type', e.target.value || null); updatePicker(currentMc, 'picker2Position', null) }}>
                                                <option value="">Select...</option>
                                                <option value="Lens">Lens</option>
                                                <option value="Spacer">Spacer</option>
                                            </select>
                                        </div>
                                        <div className="mm-form-group" style={{ marginTop: '4px' }}>
                                            <label style={{ fontSize: '0.7rem' }}>Position</label>
                                            <select className="mm-input" value={currentPicker.picker2Position || ''}
                                                onChange={e => updatePicker(currentMc, 'picker2Position', e.target.value || null)}>
                                                <option value="">Select...</option>
                                                {getAvailablePositions(currentPicker.picker2Position, currentPicker.picker2Type).map(p => (
                                                    <option key={p} value={p}>{p}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Coverage Summary */}
                        <div className="mm-coverage">
                            <div className="mm-detail-title">Assignment Coverage</div>
                            <div className="mm-coverage-grid">
                                {allPositions.map(pos => {
                                    const assigned = pickers.find(p =>
                                        p.picker1Position === pos || (p.picker2Enabled && p.picker2Position === pos)
                                    )
                                    return (
                                        <span key={pos} className={`mm-coverage-chip ${assigned ? 'assigned' : 'unassigned'}`}>
                                            {pos} {assigned ? `→MC-${assigned.mcNumber}` : '→?'}
                                        </span>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Validation Messages */}
                        {(pickerValidation.errors.length > 0 || pickerValidation.warnings.length > 0) && (
                            <div style={{ padding: '0 4px 8px' }}>
                                {pickerValidation.errors.map((err, i) => (
                                    <div key={`e${i}`} style={{ color: '#ef4444', fontSize: '0.68rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                        ❌ {err}
                                    </div>
                                ))}
                                {pickerValidation.warnings.map((warn, i) => (
                                    <div key={`w${i}`} style={{ color: '#eab308', fontSize: '0.68rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                        ⚠ {warn}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* MC Navigation — hide buttons at boundaries */}
                        <div className="mm-mc-nav">
                            {currentMc > 1 && (
                                <button className="mm-btn mm-btn-outline"
                                    onClick={() => setCurrentMc(currentMc - 1)}>← MC-{currentMc - 1}</button>
                            )}
                            <span>MC-{currentMc}</span>
                            {currentMc < machineCount && (
                                <button className="mm-btn mm-btn-outline"
                                    onClick={() => setCurrentMc(currentMc + 1)}>MC-{currentMc + 1} →</button>
                            )}
                        </div>
                    </div>
                )}

                {/* ═══ Stage 5: Summary ═══ */}
                {stage === 5 && (
                    <div className="mm-stage mm-stage-wide" style={{ padding: '8px 0' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', textAlign: 'center', marginBottom: '8px' }}>Review Model</div>

                        <div className="mm-summary-grid">
                            {/* Model Info */}
                            <div className="mm-summary-card" onClick={() => setStage(0)}>
                                <div className="mm-summary-icon"><ClipboardList size={22} /></div>
                                <div className="mm-summary-title">Model Info</div>
                                <div className="mm-summary-detail">
                                    <div><strong>{modelName || '(unnamed)'}</strong></div>
                                    <div>{machineCount} machines</div>
                                    {description && <div className="mm-summary-sub">{description}</div>}
                                </div>
                                <div className="mm-summary-edit">Edit →</div>
                            </div>

                            {/* Barrel Tray */}
                            <div className="mm-summary-card" onClick={() => setStage(1)}>
                                <div className="mm-summary-icon"><Grid3X3 size={22} /></div>
                                <div className="mm-summary-title">Barrel Tray</div>
                                <div className="mm-summary-detail">
                                    <div><strong>{barrel.trayDimX} × {barrel.trayDimY}</strong></div>
                                    <div>{(barrel.trayDimX ?? 0) * (barrel.trayDimY ?? 0)} positions</div>
                                </div>
                                <div className="mm-summary-edit">Edit →</div>
                            </div>

                            {/* Barrel Assembly */}
                            <div className="mm-summary-card" onClick={() => setStage(2)}>
                                <div className="mm-summary-icon"><Layers size={22} /></div>
                                <div className="mm-summary-title">Barrel Assembly</div>
                                <div className="mm-summary-detail">
                                    <div><strong>{barrel.lensCount}L + {barrel.spacerCount}SP</strong></div>
                                    <div>{filledSlotCount}/{totalSlots} placed • TTL: {ttl}mm</div>
                                </div>
                                <div className="mm-summary-edit">Edit →</div>
                            </div>

                            {/* Component Detail */}
                            <div className="mm-summary-card" onClick={() => setStage(3)}>
                                <div className="mm-summary-icon"><Box size={22} /></div>
                                <div className="mm-summary-title">Component Params</div>
                                <div className="mm-summary-detail">
                                    <div>{Object.keys(componentParams).length} configured</div>
                                    <div>{filledSlotCount - Object.keys(componentParams).length} remaining</div>
                                </div>
                                <div className="mm-summary-edit">Edit →</div>
                            </div>

                            {/* Picker Assignment */}
                            <div className="mm-summary-card" onClick={() => setStage(4)}>
                                <div className="mm-summary-icon"><Users size={22} /></div>
                                <div className="mm-summary-title">Picker Assignment</div>
                                <div className="mm-summary-detail">
                                    <div><strong>MC-1 to MC-{machineCount}</strong></div>
                                    <div>{assignedPositions.length} / {allPositions.length} assigned</div>
                                </div>
                                <div className="mm-summary-edit">Edit →</div>
                            </div>
                        </div>

                        {/* Assembly sequence preview */}
                        {barrel.assemblySequence.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                                <div className="mm-detail-title">Assembly Sequence</div>
                                <div className="mm-sequence" style={{ justifyContent: 'center' }}>
                                    {barrel.assemblySequence.map((item, i) => (
                                        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                                            <span className={`mm-seq-chip ${item.startsWith('L') ? 'lens' : 'spacer'}`}>
                                                {item}
                                            </span>
                                            {i < barrel.assemblySequence.length - 1 && (
                                                <span className="mm-seq-arrow">→</span>
                                            )}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Per-Machine Models Links */}
                        <div style={{ marginTop: 24 }}>
                            <div className="mm-detail-title">Per-Machine Models</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', marginTop: '8px' }}>
                                {Array.from({ length: machineCount }).map((_, i) => (
                                    <button
                                        key={i}
                                        className="mm-btn mm-btn-outline mm-mc-model-btn"
                                        style={{ justifyContent: 'flex-start', padding: '8px 12px', height: 'auto', background: 'var(--card-bg, #1e293b)' }}
                                        onClick={() => window.open(`/models/edit/${i + 1}`, '_blank')}
                                    >
                                        <Monitor size={16} style={{ color: 'var(--accent-primary, #38bdf8)' }} />
                                        <span>MC-{i + 1}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
