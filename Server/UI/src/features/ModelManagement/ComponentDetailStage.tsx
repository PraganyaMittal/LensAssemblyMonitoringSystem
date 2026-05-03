import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import type { StepParams, LensComponentParams, SpacerComponentParams } from '../../types'
import BarrelScene from './Barrel3D'
import { LensDiagram3DCanvas, SpacerDiagram3DCanvas } from './ComponentDiagram3D'

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

    // Barrel geometry
    const totalSlots = slots.length

    return (
        <div className="cd-stage">
            {/* Left: Completed Barrel (3D) */}
            <div className="cd-barrel">
                {totalSlots > 0 ? (
                    <Canvas
                        camera={{ position: [0, 2.5, 8], fov: 35 }}
                        gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
                        style={{ background: 'transparent', width: '100%', height: '100%' }}
                        dpr={[1, 1.5]}
                    >
                        <BarrelScene
                            slots={slots}
                            stepParams={stepParams}
                            ttl={ttl}
                            dragItem={null}
                            dragOverStep={null}
                            onDragOverStep={() => {}}
                            onSlotDrop={() => {}}
                            onStepSelect={(idx) => {
                                if (idx !== null && slots[idx]?.id) {
                                    setSelected(slots[idx].id)
                                }
                            }}
                            selectedStep={selectedIdx >= 0 ? selectedIdx : null}
                        />
                    </Canvas>
                ) : (
                    <div className="cd-empty">
                        <p>No components placed in barrel</p>
                    </div>
                )}
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

                        {/* 3D Diagram — live Three.js render */}
                        <div className="cd-diagram">
                            {isLens(selected) ? (
                                <LensDiagram3DCanvas params={params as LensComponentParams} />
                            ) : (
                                <SpacerDiagram3DCanvas params={params as SpacerComponentParams} />
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
