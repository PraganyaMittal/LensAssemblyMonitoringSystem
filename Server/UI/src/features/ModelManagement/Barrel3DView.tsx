import { useRef, useEffect, useCallback, useMemo } from 'react'
import { BarrelEngine } from './BarrelEngine'
import type { StepParams } from '../../types'

interface BarrelSlot {
    id: string | null
    type: 'empty' | 'lens' | 'spacer'
}

interface Props {
    slots: BarrelSlot[]
    stepParams: StepParams[]
    ttl: number
    /** Custom component parameters like color and opacity */
    componentParams?: Record<string, any>
    /** Called when mouse hovers over a drop zone during drag */
    onStepHover?: (stepIndex: number | null) => void
    /** Called when a drop occurs on a specific step */
    onStepDrop?: (stepIndex: number) => void
    /** Called when a step is clicked (for selection) */
    onStepClick?: (stepIndex: number) => void
    /** Currently selected step */
    selectedStep?: number | null
    /** Called when a user starts dragging a filled component OUT of the barrel */
    onStepDragStart?: (itemId: string, stepIndex: number) => void
    /** Whether a drag is currently in progress (from pool) */
    isDragging?: boolean
    /** Called with barrel screen bounds for TTL line positioning */
    onBarrelBoundsChange?: (bounds: { topPct: number; bottomPct: number }) => void
    /** Called with step mid Y positions for step badge positioning */
    onStepBoundsChange?: (bounds: number[]) => void
}

export default function Barrel3DView({
    slots, stepParams, ttl, componentParams,
    onStepHover, onStepDrop, onStepClick, selectedStep, onStepDragStart, isDragging,
    onBarrelBoundsChange, onStepBoundsChange
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null)
    const engineRef = useRef<BarrelEngine | null>(null)

    // Stabilize callback refs to avoid infinite update loops when parent passes
    // unstable (inline) callbacks for onBarrelBoundsChange / onStepBoundsChange
    const barrelBoundsRef = useRef(onBarrelBoundsChange)
    barrelBoundsRef.current = onBarrelBoundsChange
    const stepBoundsRef = useRef(onStepBoundsChange)
    stepBoundsRef.current = onStepBoundsChange

    // Mount engine once
    useEffect(() => {
        if (!containerRef.current) return
        engineRef.current = new BarrelEngine(containerRef.current)
        return () => {
            engineRef.current?.dispose()
            engineRef.current = null
        }
    }, [])

    // Memoize the mapped step params to avoid creating a new array every render
    const mappedStepParams = useMemo(
        () => stepParams.map(sp => ({
            stepHeight: sp.stepHeight,
            innerDiameter: sp.innerDiameter,
        })),
        [stepParams]
    )

    // Update barrel when data changes
    useEffect(() => {
        if (!engineRef.current) return
        engineRef.current.updateBarrel(slots, mappedStepParams, ttl)
        engineRef.current.updateComponentStyles(slots, componentParams || {})
        engineRef.current.updateSelection(selectedStep ?? null)
        // Report bounds to parent via stable refs
        barrelBoundsRef.current?.(engineRef.current.getBarrelScreenBounds())
        stepBoundsRef.current?.(engineRef.current.getStepScreenBounds())
    }, [slots, mappedStepParams, ttl, selectedStep, componentParams])

    // Clear highlight when drag ends
    useEffect(() => {
        if (!isDragging) {
            engineRef.current?.clearHighlight()
        }
    }, [isDragging])

    // Drag over: raycast to find hovered step, highlight it
    // If slot is already filled, show blocked (red) highlight
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        if (!engineRef.current || !isDragging) return

        const stepIdx = engineRef.current.hitTestStep(e.clientX, e.clientY)
        if (stepIdx !== null) {
            const isFilled = !!(slots[stepIdx] && slots[stepIdx].id)
            if (isFilled) {
                e.dataTransfer.dropEffect = 'none'
                engineRef.current.highlightStepBlocked(stepIdx)
            } else {
                e.dataTransfer.dropEffect = 'move'
                engineRef.current.highlightStep(stepIdx)
            }
            onStepHover?.(stepIdx)
        } else {
            e.dataTransfer.dropEffect = 'move'
            engineRef.current.clearHighlight()
            onStepHover?.(null)
        }
    }, [isDragging, onStepHover, slots])

    // Drop: commit the drop on the highlighted step
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        if (!engineRef.current) return

        const stepIdx = engineRef.current.hitTestStep(e.clientX, e.clientY)
        engineRef.current.clearHighlight()
        if (stepIdx !== null) {
            onStepDrop?.(stepIdx)
        }
    }, [onStepDrop])

    const handleDragLeave = useCallback(() => {
        engineRef.current?.clearHighlight()
        onStepHover?.(null)
    }, [onStepHover])

    // Click: select the step
    const handleClick = useCallback((e: React.MouseEvent) => {
        if (!engineRef.current) return
        const stepIdx = engineRef.current.hitTestStep(e.clientX, e.clientY)
        if (stepIdx !== null) {
            onStepClick?.(stepIdx)
        }
    }, [onStepClick])

    // --- 3D Drag OUT logic ---
    const dragInfo = useRef<{ id: string, idx: number } | null>(null)

    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!engineRef.current) return
        const stepIdx = engineRef.current.hitTestStep(e.clientX, e.clientY)
        if (stepIdx !== null && slots[stepIdx]?.id) {
            // We hit a filled slot! Make canvas draggable to initiate native HTML drag
            dragInfo.current = { id: slots[stepIdx].id!, idx: stepIdx }
            e.currentTarget.draggable = true
        } else {
            dragInfo.current = null
            e.currentTarget.draggable = false
        }
    }, [slots])

    const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        if (!dragInfo.current) {
            e.preventDefault()
            return
        }
        e.dataTransfer.setData('text/plain', dragInfo.current.id)
        e.dataTransfer.effectAllowed = 'move'
        
        // Use a tiny transparent image so we don't drag a massive screenshot of the canvas
        const img = new Image()
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
        e.dataTransfer.setDragImage(img, 0, 0)

        onStepDragStart?.(dragInfo.current.id, dragInfo.current.idx)
    }, [onStepDragStart])

    const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.draggable = false
        dragInfo.current = null
    }, [])

    return (
        <div
            ref={containerRef}
            className="ba-barrel-canvas"
            style={{ width: '100%', height: '100%', position: 'relative' }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragLeave={handleDragLeave}
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onDragStart={handleDragStart}
        />
    )
}

