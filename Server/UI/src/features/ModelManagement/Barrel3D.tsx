import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Text, Environment, Line } from '@react-three/drei'
import type { StepParams } from '../../types'

/* ════════════════════════════════════════════════════════════
   Barrel3D — Photorealistic Cross-Section Barrel
   
   Architecture: Each shelf band is a curved plane (bent like
   a cylinder surface) with metallic material. Recessed walls
   are flat dark planes between bands. This creates the exact
   brushed-steel gradient seen in the reference image.
   ════════════════════════════════════════════════════════════ */

interface BarrelSlot {
    id: string | null
    type: 'empty' | 'lens' | 'spacer'
}

interface BarrelSceneProps {
    slots: BarrelSlot[]
    stepParams: StepParams[]
    ttl: number
    dragItem: string | null
    dragOverStep: number | null
    onDragOverStep: (idx: number | null) => void
    onSlotDrop: (idx: number) => void
    onStepSelect: (idx: number | null) => void
    selectedStep: number | null
}

// ── Visual Constants ───────────────────────────────────────
const BAND_THICKNESS = 0.14        // vertical thickness of each shelf band
const CURVE_DEPTH = 0.35           // how much each band curves forward
const CURVE_SEGMENTS = 48          // smoothness of the curve
const BASE_PLATE_H = 0.1           // bottom plate thickness

// Barrel taper: top is widest, bottom is narrowest
const TOP_HALF_WIDTH = 2.2         // half-width at top (OPEN side)
const BOT_HALF_WIDTH = 1.3         // half-width at bottom (CLOSED side)
const SHELF_EXTEND = 0.22          // how much shelf protrudes beyond recess
const SIDE_WALL_W = 0.08           // thickness of side connecting walls

// ── Helper: Create a curved plane (simulates cylinder surface) ──

function createCurvedPlane(halfWidth: number, height: number, curveDepth: number, segments: number = CURVE_SEGMENTS): THREE.BufferGeometry {
    const geo = new THREE.PlaneGeometry(halfWidth * 2, height, segments, 1)
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const norm = x / halfWidth // -1 to 1
        const z = Math.sqrt(Math.max(0, 1 - norm * norm)) * curveDepth
        pos.setZ(i, z)
    }
    geo.computeVertexNormals()
    return geo
}

// ── MetalBand: A single curved metallic shelf band ─────────

interface BandProps {
    y: number
    halfWidth: number
    thickness?: number
}

function MetalBand({ y, halfWidth, thickness = BAND_THICKNESS }: BandProps) {
    const geo = useMemo(
        () => createCurvedPlane(halfWidth, thickness, CURVE_DEPTH),
        [halfWidth, thickness]
    )

    return (
        <group position={[0, y, 0]}>
            {/* Front curved surface */}
            <mesh geometry={geo}>
                <meshStandardMaterial
                    color="#b0bec5"
                    metalness={0.92}
                    roughness={0.18}
                    envMapIntensity={1.2}
                    side={THREE.FrontSide}
                />
            </mesh>
            {/* Top edge highlight */}
            <mesh position={[0, thickness / 2, CURVE_DEPTH * 0.5]}>
                <planeGeometry args={[halfWidth * 1.85, 0.015]} />
                <meshBasicMaterial color="#e0e6ec" transparent opacity={0.25} />
            </mesh>
            {/* Bottom edge shadow */}
            <mesh position={[0, -thickness / 2, CURVE_DEPTH * 0.5]}>
                <planeGeometry args={[halfWidth * 1.85, 0.015]} />
                <meshBasicMaterial color="#000000" transparent opacity={0.35} />
            </mesh>
        </group>
    )
}

// ── RecessWall: Dark flat wall between two bands ───────────

interface RecessProps {
    y: number
    halfWidth: number
    height: number
}

function RecessWall({ y, halfWidth, height }: RecessProps) {
    return (
        <group position={[0, y, -0.02]}>
            {/* Center dark recessed area */}
            <mesh>
                <planeGeometry args={[halfWidth * 2, height]} />
                <meshStandardMaterial
                    color="#1a2332"
                    metalness={0.2}
                    roughness={0.85}
                    envMapIntensity={0.15}
                />
            </mesh>
            {/* Left side wall */}
            <mesh position={[-halfWidth - SIDE_WALL_W / 2, 0, 0.01]}>
                <planeGeometry args={[SIDE_WALL_W, height]} />
                <meshStandardMaterial
                    color="#2a3444"
                    metalness={0.4}
                    roughness={0.7}
                    envMapIntensity={0.2}
                />
            </mesh>
            {/* Right side wall */}
            <mesh position={[halfWidth + SIDE_WALL_W / 2, 0, 0.01]}>
                <planeGeometry args={[SIDE_WALL_W, height]} />
                <meshStandardMaterial
                    color="#2a3444"
                    metalness={0.4}
                    roughness={0.7}
                    envMapIntensity={0.2}
                />
            </mesh>
        </group>
    )
}

// ── BasePlate: Thick metallic bottom plate ─────────────────

function BasePlate({ halfWidth }: { halfWidth: number }) {
    const geo = useMemo(
        () => createCurvedPlane(halfWidth + SHELF_EXTEND, BASE_PLATE_H, CURVE_DEPTH * 0.8),
        [halfWidth]
    )
    return (
        <mesh geometry={geo} position={[0, 0, 0]}>
            <meshStandardMaterial
                color="#9eaab5"
                metalness={0.9}
                roughness={0.22}
                envMapIntensity={1.0}
                side={THREE.FrontSide}
            />
        </mesh>
    )
}

// ── DropZone3D: Dashed rectangle inside a recess ───────────

interface DropZone3DProps {
    y: number
    halfWidth: number
    height: number
    isActive: boolean
    stepIndex: number
    onHover: (idx: number | null) => void
    onClick: () => void
}

function DropZone3D({ y, halfWidth, height, isActive, stepIndex, onHover, onClick }: DropZone3DProps) {
    const meshRef = useRef<THREE.Mesh>(null)
    const zoneW = halfWidth * 1.5
    const zoneH = height * 0.65

    useFrame((state) => {
        if (!meshRef.current) return
        const mat = meshRef.current.material as THREE.MeshBasicMaterial
        mat.opacity = isActive ? 0.06 + Math.sin(state.clock.elapsedTime * 4) * 0.04 : 0.01
    })

    // Dashed border points
    const hw = zoneW / 2, hh = zoneH / 2
    const borderPoints: [number, number, number][] = [
        [-hw, -hh, 0.08], [hw, -hh, 0.08], [hw, hh, 0.08], [-hw, hh, 0.08], [-hw, -hh, 0.08]
    ]

    return (
        <group position={[0, y, 0.05]}>
            <mesh
                ref={meshRef}
                onPointerEnter={() => onHover(stepIndex)}
                onPointerLeave={() => onHover(null)}
                onClick={(e) => { e.stopPropagation(); onClick() }}
            >
                <planeGeometry args={[zoneW, zoneH]} />
                <meshBasicMaterial
                    color={isActive ? '#2dd4bf' : '#94a3b8'}
                    transparent opacity={0.01}
                    side={THREE.DoubleSide}
                />
            </mesh>

            <Line
                points={borderPoints}
                color={isActive ? '#2dd4bf' : '#556677'}
                lineWidth={1}
                dashed
                dashSize={0.08}
                gapSize={0.06}
            />

            <Text
                position={[0, 0, 0.1]}
                fontSize={0.14}
                color={isActive ? '#2dd4bf' : '#667788'}
                anchorX="center"
                anchorY="middle"
                fillOpacity={isActive ? 0.8 : 0.35}
            >
                Drop here
            </Text>
        </group>
    )
}

// ── Lens3D: Teal glass lens inside barrel ──────────────────

interface Lens3DProps {
    y: number
    halfWidth: number
    stepHeight: number
    label: string
    selected: boolean
    onClick: () => void
}

function Lens3D({ y, halfWidth, stepHeight, label, selected, onClick }: Lens3DProps) {
    const [hovered, setHovered] = useState(false)
    const meshRef = useRef<THREE.Mesh>(null)

    // Breathing glow
    useFrame((state) => {
        if (!meshRef.current || selected) return
        const mat = meshRef.current.material as THREE.MeshPhysicalMaterial
        mat.opacity = 0.55 + Math.sin(state.clock.elapsedTime * 2) * 0.15
    })

    const lensW = halfWidth * 1.5
    const lensH = stepHeight * 0.55
    const curve = lensH * 0.4

    // Biconvex lens cross-section shape
    const lensShape = useMemo(() => {
        const shape = new THREE.Shape()
        shape.moveTo(-lensW / 2, 0)
        shape.quadraticCurveTo(0, -curve, lensW / 2, 0)
        shape.quadraticCurveTo(0, curve, -lensW / 2, 0)
        const geo = new THREE.ShapeGeometry(shape, 32)
        return geo
    }, [lensW, curve])

    return (
        <group position={[0, y, 0.12]}
            onClick={(e) => { e.stopPropagation(); onClick() }}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
        >
            <mesh ref={meshRef} geometry={lensShape}>
                <meshPhysicalMaterial
                    color="#2dd4bf"
                    transmission={0.6}
                    roughness={0.05}
                    metalness={0.0}
                    ior={1.5}
                    transparent
                    opacity={0.7}
                    side={THREE.DoubleSide}
                    envMapIntensity={0.8}
                />
            </mesh>

            {/* Highlight arc */}
            <mesh position={[0, curve * 0.15, 0.01]}>
                <planeGeometry args={[lensW * 0.7, 0.01]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.2} />
            </mesh>

            {(selected || hovered) && (
                <mesh geometry={lensShape} position={[0, 0, -0.01]}>
                    <meshBasicMaterial color={selected ? '#38bdf8' : '#2dd4bf'} transparent opacity={0.3} wireframe />
                </mesh>
            )}

            <Text position={[0, 0, 0.15]} fontSize={0.14} color="#ffffff" fontWeight={700}
                anchorX="center" anchorY="middle"
                outlineWidth={0.015} outlineColor="#000000"
            >{label}</Text>
        </group>
    )
}

// ── Spacer3D: Thin metallic strip ──────────────────────────

interface Spacer3DProps {
    y: number
    halfWidth: number
    label: string
    selected: boolean
    onClick: () => void
}

function Spacer3D({ y, halfWidth, label, selected, onClick }: Spacer3DProps) {
    const [hovered, setHovered] = useState(false)
    const spacerW = halfWidth * 1.5
    const spacerH = 0.06

    return (
        <group position={[0, y, 0.1]}
            onClick={(e) => { e.stopPropagation(); onClick() }}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
        >
            <mesh>
                <planeGeometry args={[spacerW, spacerH]} />
                <meshStandardMaterial
                    color="#4a5565"
                    metalness={0.85}
                    roughness={0.3}
                    envMapIntensity={0.6}
                    side={THREE.DoubleSide}
                />
            </mesh>
            {/* Top edge */}
            <mesh position={[0, spacerH / 2, 0.01]}>
                <planeGeometry args={[spacerW, 0.008]} />
                <meshBasicMaterial color="#8899aa" transparent opacity={0.2} />
            </mesh>
            {/* Bottom edge */}
            <mesh position={[0, -spacerH / 2, 0.01]}>
                <planeGeometry args={[spacerW, 0.008]} />
                <meshBasicMaterial color="#000000" transparent opacity={0.3} />
            </mesh>

            {(selected || hovered) && (
                <mesh position={[0, 0, -0.01]}>
                    <planeGeometry args={[spacerW + 0.04, spacerH + 0.04]} />
                    <meshBasicMaterial color={selected ? '#38bdf8' : '#94a3b8'} transparent opacity={0.4} wireframe />
                </mesh>
            )}

            <Text position={[0, 0, 0.12]} fontSize={0.1} color="#94a3b8" fontWeight={700}
                anchorX="center" anchorY="middle"
                outlineWidth={0.008} outlineColor="#000000"
            >{label}</Text>
        </group>
    )
}

// ── TTL Dimension Line ─────────────────────────────────────

function TTLLine({ topY, botY, x }: { topY: number; botY: number; x: number }) {
    const capW = 0.12
    return (
        <group>
            <Line
                points={[[x, topY, 0.3], [x, botY, 0.3]]}
                color="#ef4444"
                lineWidth={1.2}
                dashed dashSize={0.06} gapSize={0.04}
            />
            {/* Top cap */}
            <Line points={[[x - capW, topY, 0.3], [x + capW, topY, 0.3]]} color="#ef4444" lineWidth={1.2} />
            {/* Bot cap */}
            <Line points={[[x - capW, botY, 0.3], [x + capW, botY, 0.3]]} color="#ef4444" lineWidth={1.2} />
            <Text position={[x, (topY + botY) / 2, 0.4]} fontSize={0.13} color="#ef4444"
                fontWeight={700} anchorX="center" anchorY="middle" rotation={[0, 0, Math.PI / 2]}
            >TTL</Text>
        </group>
    )
}

// ── Main BarrelScene ───────────────────────────────────────

export default function BarrelScene(props: BarrelSceneProps) {
    const { slots, stepParams, dragOverStep, onDragOverStep, onStepSelect, selectedStep } = props
    const totalSlots = slots.length
    if (totalSlots === 0) return null

    // Normalize step heights to fit in view
    const totalReal = stepParams.reduce((a, b) => a + b.stepHeight, 0) || totalSlots
    const VISUAL_H = 4.5
    const scale = VISUAL_H / totalReal

    const stepHeights = useMemo(
        () => stepParams.map(sp => sp.stepHeight * scale),
        [stepParams, scale]
    )

    // Build layout: compute Y positions and widths per step
    const layout = useMemo(() => {
        const items: { botY: number; topY: number; centerY: number; height: number; recessHW: number; shelfHW: number }[] = []
        let y = BASE_PLATE_H

        for (let i = 0; i < totalSlots; i++) {
            const h = stepHeights[i] || (VISUAL_H / totalSlots)
            const progress = totalSlots > 1 ? i / (totalSlots - 1) : 0.5
            // Taper: bottom=narrow, top=wide
            const recessHW = BOT_HALF_WIDTH + (TOP_HALF_WIDTH - BOT_HALF_WIDTH) * progress
            const shelfHW = recessHW + SHELF_EXTEND

            items.push({
                botY: y,
                topY: y + h,
                centerY: y + h / 2,
                height: h,
                recessHW,
                shelfHW,
            })
            y += h
        }
        return items
    }, [totalSlots, stepHeights])

    const barrelTopY = layout[layout.length - 1]?.topY ?? BASE_PLATE_H
    const barrelBotY = 0
    const topShelfHW = (layout[layout.length - 1]?.shelfHW ?? TOP_HALF_WIDTH) + 0.06

    return (
        <>
            {/* Lighting for metallic reflections */}
            <ambientLight intensity={0.25} />
            <directionalLight position={[4, 6, 8]} intensity={1.6} />
            <directionalLight position={[-3, 3, 5]} intensity={0.4} color="#b0c4de" />
            <directionalLight position={[0, -1, 6]} intensity={0.2} />

            {/* Studio environment for reflections on curved surfaces */}
            <Environment preset="studio" />

            {/* ── Base plate (bottom, CLOSED side) ── */}
            <BasePlate halfWidth={layout[0]?.recessHW ?? BOT_HALF_WIDTH} />

            {/* ── Steps: recess walls + shelf bands ── */}
            {layout.map((step, i) => {
                const recessH = step.height - BAND_THICKNESS
                const recessCenterY = step.botY + recessH / 2

                return (
                    <group key={`step-${i}`}>
                        {/* Recessed dark inner wall */}
                        <RecessWall
                            y={recessCenterY}
                            halfWidth={step.recessHW}
                            height={recessH}
                        />

                        {/* Shelf band at TOP of this step (protruding metallic band) */}
                        <MetalBand
                            y={step.topY - BAND_THICKNESS / 2}
                            halfWidth={step.shelfHW}
                        />
                    </group>
                )
            })}

            {/* ── Top lip (extra band at the very top, widest) ── */}
            <MetalBand
                y={barrelTopY + BAND_THICKNESS / 2 + 0.02}
                halfWidth={topShelfHW}
                thickness={BAND_THICKNESS * 1.2}
            />

            {/* ── Outer side walls (connecting bands vertically) ── */}
            {layout.map((step, i) => {
                if (i === 0) return null
                const prev = layout[i - 1]
                const wallH = step.botY - prev.topY + BAND_THICKNESS
                const wallY = (prev.topY + step.botY) / 2
                return (
                    <group key={`side-${i}`}>
                        {/* Left outer wall */}
                        <mesh position={[-step.shelfHW + SIDE_WALL_W / 2, wallY, 0.05]}>
                            <planeGeometry args={[SIDE_WALL_W, wallH]} />
                            <meshStandardMaterial color="#2a3444" metalness={0.3} roughness={0.7} />
                        </mesh>
                        {/* Right outer wall */}
                        <mesh position={[step.shelfHW - SIDE_WALL_W / 2, wallY, 0.05]}>
                            <planeGeometry args={[SIDE_WALL_W, wallH]} />
                            <meshStandardMaterial color="#2a3444" metalness={0.3} roughness={0.7} />
                        </mesh>
                    </group>
                )
            })}

            {/* ── Components / Drop Zones ── */}
            {layout.map((step, i) => {
                const slot = slots[i]
                if (!slot || slot.id === null) {
                    return (
                        <DropZone3D
                            key={`dz-${i}`}
                            y={step.centerY - BAND_THICKNESS / 4}
                            halfWidth={step.recessHW}
                            height={step.height - BAND_THICKNESS}
                            isActive={dragOverStep === i}
                            stepIndex={i}
                            onHover={onDragOverStep}
                            onClick={() => onStepSelect(selectedStep === i ? null : i)}
                        />
                    )
                }
                if (slot.type === 'lens') {
                    return (
                        <Lens3D key={`l-${i}`}
                            y={step.centerY - BAND_THICKNESS / 4}
                            halfWidth={step.recessHW}
                            stepHeight={step.height - BAND_THICKNESS}
                            label={slot.id}
                            selected={selectedStep === i}
                            onClick={() => onStepSelect(selectedStep === i ? null : i)}
                        />
                    )
                }
                return (
                    <Spacer3D key={`s-${i}`}
                        y={step.centerY - BAND_THICKNESS / 4}
                        halfWidth={step.recessHW}
                        label={slot.id}
                        selected={selectedStep === i}
                        onClick={() => onStepSelect(selectedStep === i ? null : i)}
                    />
                )
            })}

            {/* ── TTL dimension line ── */}
            <TTLLine
                topY={barrelTopY + BAND_THICKNESS}
                botY={barrelBotY}
                x={-(topShelfHW + 0.35)}
            />

            {/* ── Labels ── */}
            <Text position={[0, barrelTopY + BAND_THICKNESS * 2 + 0.15, 0.3]}
                fontSize={0.11} color="#64748b" fontWeight={600}
                anchorX="center" anchorY="middle"
            >▼ OPEN SIDE</Text>

            <Text position={[0, -0.18, 0.3]}
                fontSize={0.11} color="#64748b" fontWeight={600}
                anchorX="center" anchorY="middle"
            >▲ CLOSED</Text>
        </>
    )
}
