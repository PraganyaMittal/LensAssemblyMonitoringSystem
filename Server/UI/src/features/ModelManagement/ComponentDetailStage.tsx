import { useState } from 'react'
import { Info } from 'lucide-react'
import type { StepParams, LensComponentParams, SpacerComponentParams } from '../../types'
import Barrel3DView from './Barrel3DView'
import { ComponentDiagramCanvas } from './ComponentDiagram3D'

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

// ── Default params so inputs are never empty ──
const DEFAULT_LENS_PARAMS: LensComponentParams = {
    angle: 0,
    pressure: 0,
    lensDiameter: 5.0,
    lensHeight: 2.0,
    lensThickness: 1.5,
}

const DEFAULT_SPACER_PARAMS: SpacerComponentParams = {
    angle: 0,
    pressure: 0,
    spacerOuterDia: 5.0,
    spacerInnerDia: 3.0,
    spacerThickness: 0.3,
}

export default function ComponentDetailStage({ slots, stepParams, ttl, componentParams, onComponentParamsChange }: Props) {
    const [selected, setSelected] = useState<string | null>(null)
    const [focusedParam, setFocusedParam] = useState<string | null>(null)
    const [showLegend, setShowLegend] = useState(false)

    const filledSlots = slots.filter(s => s.id !== null)
    const selectedIdx = slots.findIndex(s => s.id === selected)
    const isLens = (id: string | null) => id?.startsWith('L')

    const getParamsWithDefaults = (id: string | null): LensComponentParams | SpacerComponentParams => {
        if (!id) return {}
        const existing = componentParams[id] || {}
        return isLens(id) ? { ...DEFAULT_LENS_PARAMS, ...existing } : { ...DEFAULT_SPACER_PARAMS, ...existing }
    }

    // Eagerly persist defaults when selecting a component for the first time
    const handleSelect = (id: string | null) => {
        setSelected(id)
        setFocusedParam(null) // reset camera on selection change
        if (id && !componentParams[id]) {
            const defaults = isLens(id) ? DEFAULT_LENS_PARAMS : DEFAULT_SPACER_PARAMS
            onComponentParamsChange({ ...componentParams, [id]: defaults })
        }
    }

    const params = selected ? getParamsWithDefaults(selected) : {}

    const updateParam = (key: string, value: number | string | undefined) => {
        if (!selected) return
        const current = getParamsWithDefaults(selected)
        onComponentParamsChange({ ...componentParams, [selected]: { ...current, [key]: value } })
    }

    // Check if a param is modified from default
    const isModified = (key: string): boolean => {
        if (!selected) return false
        const userParams = componentParams[selected]
        if (!userParams) return false
        const defaults = isLens(selected) ? DEFAULT_LENS_PARAMS : DEFAULT_SPACER_PARAMS
        const defaultVal = (defaults as any)[key]
        const currentVal = (userParams as any)[key]
        return currentVal !== undefined && currentVal !== defaultVal
    }

    // Validation
    const getValidationErrors = (): Record<string, string> => {
        if (!selected) return {}
        const errors: Record<string, string> = {}
        const p = params as any
        if (!isLens(selected)) {
            if (p.spacerOuterDia !== undefined && p.spacerInnerDia !== undefined && p.spacerOuterDia <= p.spacerInnerDia)
                errors['spacerOuterDia'] = 'Must be > Inner Dia'
            if (p.spacerThickness !== undefined && p.spacerThickness <= 0)
                errors['spacerThickness'] = 'Must be > 0'
            if (p.spacerInnerDia !== undefined && p.spacerInnerDia <= 0)
                errors['spacerInnerDia'] = 'Must be > 0'
        } else {
            if (p.lensDiameter !== undefined && p.lensDiameter <= 0)
                errors['lensDiameter'] = 'Must be > 0'
            if (p.lensHeight !== undefined && p.lensHeight <= 0)
                errors['lensHeight'] = 'Must be > 0'
            if (p.lensThickness !== undefined && p.lensThickness <= 0)
                errors['lensThickness'] = 'Must be > 0'
        }
        if (p.angle !== undefined && (p.angle < 0 || p.angle > 360))
            errors['angle'] = 'Must be 0–360'
        if (p.pressure !== undefined && p.pressure < 0)
            errors['pressure'] = 'Must be ≥ 0'
        return errors
    }

    const validationErrors = getValidationErrors()

    // Dot state for a param: 'error' | 'modified' | 'default'
    const getDotState = (key: string): 'error' | 'modified' | 'default' => {
        if (validationErrors[key]) return 'error'
        if (isModified(key)) return 'modified'
        return 'default'
    }

    const getDotTitle = (key: string): string => {
        const state = getDotState(key)
        if (state === 'error') return `⚠ ${validationErrors[key]}`
        if (state === 'modified') return 'Modified from default'
        return 'Default value'
    }

    const totalSlots = slots.length
    const selectedIsLens = selected ? isLens(selected) : null

    return (
        <div className="cd-stage">
            {/* ═══ Left column: Barrel 3D (90%) + read-only params footer (10%) ═══ */}
            <div className="cd-barrel">
                <div className="cd-barrel-view">
                    {totalSlots > 0 ? (
                        <Barrel3DView
                            slots={slots}
                            stepParams={stepParams}
                            ttl={ttl}
                            componentParams={componentParams}
                            onStepClick={(idx) => {
                                if (idx !== null && slots[idx]?.id) {
                                    handleSelect(slots[idx].id)
                                } else {
                                    handleSelect(null)
                                }
                            }}
                            selectedStep={selectedIdx >= 0 ? selectedIdx : null}
                        />
                    ) : (
                        <div className="cd-empty">
                            <p>No components placed in barrel</p>
                        </div>
                    )}
                </div>
                <div className="cd-barrel-footer">
                    <span className="cd-barrel-footer-title">Barrel</span>
                    <div className="cd-barrel-footer-item">
                        <span>TTL</span>
                        <span>{ttl} mm</span>
                    </div>
                    {selectedIdx >= 0 && selectedIdx < stepParams.length && (
                        <>
                            <div className="cd-barrel-footer-item">
                                <span>Step H</span>
                                <span>{stepParams[selectedIdx].stepHeight} mm</span>
                            </div>
                            <div className="cd-barrel-footer-item">
                                <span>Inner ⌀</span>
                                <span>{stepParams[selectedIdx].innerDiameter} mm</span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ═══ Right column: Diagram (70%) + Params (30%) ═══ */}
            <div className="cd-right">
                {/* ── Diagram area: ONE diagram based on selected component type ── */}
                <div className="cd-diagram-area">
                    {!selected && (
                        <div className="cd-empty">
                            <p>Click a component in the barrel to view its diagram</p>
                            <div className="cd-component-list">
                                {filledSlots.map(s => (
                                    <button key={s.id}
                                        className={`cd-comp-chip ${isLens(s.id) ? 'lens' : 'spacer'}`}
                                        onClick={() => handleSelect(s.id)}>{s.id}</button>
                                ))}
                            </div>
                        </div>
                    )}
                    {/* Canvas is ALWAYS mounted — hidden via CSS when nothing selected.
                        This prevents WebGL context destruction on every component click. */}
                    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, visibility: selected ? 'visible' : 'hidden' }}>
                        {selected && <span className="cd-diagram-area-label" style={{ position: 'relative', zIndex: 1 }}>{selected}</span>}
                        <ComponentDiagramCanvas
                            type={selectedIsLens ? 'lens' : 'spacer'}
                            lensParams={selectedIsLens ? params as LensComponentParams : undefined}
                            spacerParams={!selectedIsLens && selected ? params as SpacerComponentParams : undefined}
                            focusedParam={focusedParam}
                        />
                    </div>
                </div>

                {/* ── Params panel: two-column compact layout ── */}
                <div className="cd-params">
                    {!selected ? (
                        <div className="cd-empty" style={{ height: 'auto', padding: '12px 0' }}>
                            <p style={{ fontSize: '0.75rem' }}>Select a component to edit parameters</p>
                        </div>
                    ) : (
                        <>
                            <div className="cd-selected-header">
                                <span className={`cd-type-badge ${isLens(selected) ? 'lens' : 'spacer'}`}>
                                    {isLens(selected) ? 'Lens' : 'Spacer'}
                                </span>
                                <span className="cd-selected-id">{selected}</span>
                                {/* Legend info button */}
                                <button className="cd-legend-btn"
                                    onMouseEnter={() => setShowLegend(true)}
                                    onMouseLeave={() => setShowLegend(false)}
                                    title="Indicator legend">
                                    <Info size={12} />
                                </button>
                                {showLegend && (
                                    <div className="cd-legend-popup">
                                        <div className="cd-legend-row"><span className="cd-arrow-dot default" /> Default value</div>
                                        <div className="cd-legend-row"><span className="cd-arrow-dot modified" /> Modified</div>
                                        <div className="cd-legend-row"><span className="cd-arrow-dot error" /> Validation error</div>
                                    </div>
                                )}
                            </div>

                            <div className="cd-fields-grid">
                                {isLens(selected) ? (
                                    <>
                                        {([['angle', 'Angle', 'deg'], ['pressure', 'Pressure', 'bar'],
                                        ['lensDiameter', 'Diameter', 'mm'], ['lensHeight', 'Height', 'mm'],
                                        ['lensThickness', 'Thickness', 'mm']] as const).map(([key, label, unit]) => (
                                            <div key={key} className="cd-field-compact">
                                                <label htmlFor={`cd-lens-${key}`}>{label}</label>
                                                <div className="cd-field-input-compact">
                                                    <span className={`cd-arrow-dot ${getDotState(key)}`}
                                                        title={getDotTitle(key)} />
                                                    <input id={`cd-lens-${key}`} name={`lens_${key}`} type="number" step="0.001" value={(params as any)[key] ?? ''}
                                                        onFocus={() => setFocusedParam(key)}
                                                        onChange={e => updateParam(key, e.target.value ? parseFloat(e.target.value) : undefined)} />
                                                    <span className="cd-unit">{unit}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                ) : (
                                    <>
                                        {([['angle', 'Angle', 'deg'], ['pressure', 'Pressure', 'bar'],
                                        ['spacerOuterDia', 'Outer Dia', 'mm'], ['spacerInnerDia', 'Inner Dia', 'mm'],
                                        ['spacerThickness', 'Thickness', 'mm']] as const).map(([key, label, unit]) => (
                                            <div key={key} className="cd-field-compact">
                                                <label htmlFor={`cd-spacer-${key}`}>{label}</label>
                                                <div className="cd-field-input-compact">
                                                    <span className={`cd-arrow-dot ${getDotState(key)}`}
                                                        title={getDotTitle(key)} />
                                                    <input id={`cd-spacer-${key}`} name={`spacer_${key}`} type="number" step="0.001" value={(params as any)[key] ?? ''}
                                                        onFocus={() => setFocusedParam(key)}
                                                        onChange={e => updateParam(key, e.target.value ? parseFloat(e.target.value) : undefined)} />
                                                    <span className="cd-unit">{unit}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
