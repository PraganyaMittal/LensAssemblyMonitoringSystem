import { useMemo, useCallback } from 'react'
import * as THREE from 'three'
import { Canvas, ThreeEvent } from '@react-three/fiber'
import { Text, Environment, OrbitControls, Line } from '@react-three/drei'
import type { LensComponentParams, SpacerComponentParams } from '../../types'

// ═══════════════════════════════════════════════════════
// Shared: 3D Dimension Arrow
// ═══════════════════════════════════════════════════════

interface DimensionArrowProps {
    from: [number, number, number]
    to: [number, number, number]
    label: string
    color: string
}

function DimensionArrow({ from, to, label, color }: DimensionArrowProps) {
    const points = useMemo(() => [
        new THREE.Vector3(...from),
        new THREE.Vector3(...to),
    ], [from, to])

    const mid: [number, number, number] = [
        (from[0] + to[0]) / 2,
        (from[1] + to[1]) / 2,
        (from[2] + to[2]) / 2 + 0.25,
    ]

    return (
        <group>
            <Line points={[points[0], points[1]]} color={color} lineWidth={2} />
            <mesh position={from}>
                <sphereGeometry args={[0.04, 8, 8]} />
                <meshBasicMaterial color={color} />
            </mesh>
            <mesh position={to}>
                <sphereGeometry args={[0.04, 8, 8]} />
                <meshBasicMaterial color={color} />
            </mesh>
            <Text position={mid} fontSize={0.15} color={color} fontWeight={700}
                anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#0f172a">
                {label}
            </Text>
        </group>
    )
}

// ═══════════════════════════════════════════════════════
// Canvas texture generators (same approach as BarrelEngine)
// ═══════════════════════════════════════════════════════

/** Circular brushed metal texture for spacer faces — concentric lathe marks */
function makeCircularBrushedTex(): THREE.CanvasTexture {
    const S = 1024
    const c = document.createElement('canvas')
    c.width = S; c.height = S
    const ctx = c.getContext('2d')!
    const cx = S / 2, cy = S / 2, maxR = cx

    // Dark steel base
    ctx.fillStyle = '#363a3e'
    ctx.fillRect(0, 0, S, S)

    // Subtle radial gradient for depth
    const grad = ctx.createRadialGradient(cx * 0.6, cy * 0.6, 0, cx, cy, maxR)
    grad.addColorStop(0, 'rgba(170, 170, 165, 0.12)')
    grad.addColorStop(0.4, 'rgba(90, 90, 88, 0.08)')
    grad.addColorStop(1, 'rgba(25, 27, 30, 0.04)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, S, S)

    // Concentric circular brush strokes (lathe turning marks)
    ctx.globalAlpha = 1.0
    for (let r = 4; r < maxR; r += 0.35) {
        const alpha = 0.012 + Math.random() * 0.055
        const lum = 55 + Math.random() * 110
        ctx.strokeStyle = `rgba(${lum},${lum},${lum - 2},${alpha})`
        ctx.lineWidth = 0.25 + Math.random() * 0.65
        ctx.beginPath()
        ctx.arc(cx, cy, r + Math.random() * 0.4, 0, Math.PI * 2)
        ctx.stroke()
    }

    // Bright arc highlights (reflective streaks)
    ctx.globalAlpha = 1.0
    for (let i = 0; i < 50; i++) {
        const r = 40 + Math.random() * (maxR - 60)
        const a0 = Math.random() * Math.PI * 2
        const aLen = 0.2 + Math.random() * 1.8
        ctx.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.06})`
        ctx.lineWidth = 0.4 + Math.random() * 1.2
        ctx.beginPath()
        ctx.arc(cx, cy, r, a0, a0 + aLen)
        ctx.stroke()
    }

    // Dark arc shadows
    for (let i = 0; i < 30; i++) {
        const r = 40 + Math.random() * (maxR - 60)
        const a0 = Math.random() * Math.PI * 2
        const aLen = 0.3 + Math.random() * 1.5
        ctx.strokeStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.04})`
        ctx.lineWidth = 0.5 + Math.random() * 1.0
        ctx.beginPath()
        ctx.arc(cx, cy, r, a0, a0 + aLen)
        ctx.stroke()
    }

    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
}

/** Horizontal brushed metal texture for spacer edge walls */
function makeEdgeBrushedTex(): THREE.CanvasTexture {
    const W = 512, H = 256
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const ctx = c.getContext('2d')!

    ctx.fillStyle = '#323538'
    ctx.fillRect(0, 0, W, H)

    ctx.globalAlpha = 1.0
    for (let y = 0; y < H; y++) {
        const alpha = 0.015 + Math.random() * 0.09
        const lum = 50 + Math.random() * 90
        ctx.strokeStyle = `rgba(${lum},${lum},${lum},${alpha})`
        ctx.lineWidth = 0.3 + Math.random() * 1.0
        ctx.beginPath()
        ctx.moveTo(0, y + Math.random() * 1.2)
        ctx.lineTo(W, y + Math.random() * 1.2)
        ctx.stroke()
    }

    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(4, 1)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
}

// ═══════════════════════════════════════════════════════
// Single Lens Model (existing geometry, no auto-rotation)
// ═══════════════════════════════════════════════════════

interface LensModelProps {
    params: LensComponentParams
    isSelected?: boolean
    onClick?: () => void
}

function LensModel({ params, isSelected, onClick }: LensModelProps) {
    const diameter = params.lensDiameter || 5.0
    const height = params.lensHeight || 2.0
    const thickness = params.lensThickness || 1.5
    const radius = diameter / 2
    const scale = 1.5 / Math.max(radius, 1)

    const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onClick?.()
    }, [onClick])

    const emColor = isSelected ? '#006666' : '#000000'
    const emInt = isSelected ? 0.3 : 0

    return (
        <group scale={[scale, scale, scale]} onClick={handleClick}>
            <mesh>
                <sphereGeometry args={[radius * 1.2, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.3]} />
                <meshPhysicalMaterial color={isSelected ? '#5eead4' : '#2dd4bf'}
                    transmission={0.88} thickness={thickness * 0.5} roughness={0.03}
                    ior={1.52} transparent opacity={0.8} side={THREE.DoubleSide}
                    envMapIntensity={1.5} clearcoat={1.0} clearcoatRoughness={0.05}
                    emissive={emColor} emissiveIntensity={emInt} />
            </mesh>
            <mesh rotation={[Math.PI, 0, 0]}>
                <sphereGeometry args={[radius * 1.2, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.3]} />
                <meshPhysicalMaterial color={isSelected ? '#5eead4' : '#2dd4bf'}
                    transmission={0.88} thickness={thickness * 0.5} roughness={0.03}
                    ior={1.52} transparent opacity={0.8} side={THREE.DoubleSide}
                    envMapIntensity={1.5} clearcoat={1.0} clearcoatRoughness={0.05}
                    emissive={emColor} emissiveIntensity={emInt} />
            </mesh>
            <mesh>
                <cylinderGeometry args={[radius * 0.95, radius * 0.95, thickness * 0.15, 48, 1, true]} />
                <meshPhysicalMaterial color={isSelected ? '#34d9c3' : '#1fb8a5'}
                    transmission={0.7} thickness={0.3} roughness={0.1} transparent opacity={0.6}
                    side={THREE.DoubleSide} emissive={emColor} emissiveIntensity={emInt} />
            </mesh>
            <DimensionArrow from={[-radius, 0, radius + 0.35]} to={[radius, 0, radius + 0.35]}
                label={`Dia ${diameter.toFixed(1)}`} color="#ef4444" />
            <DimensionArrow from={[radius + 0.35, -height / 2, 0]} to={[radius + 0.35, height / 2, 0]}
                label={`Height ${height.toFixed(1)}`} color="#ef4444" />
            <DimensionArrow from={[0, -thickness / 2, -(radius + 0.35)]} to={[0, thickness / 2, -(radius + 0.35)]}
                label={`Thick ${thickness.toFixed(1)}`} color="#ef4444" />
        </group>
    )
}

// ═══════════════════════════════════════════════════════
// Single Spacer Model — Photorealistic brushed metal
// Uses canvas-generated circular brush texture (same approach as BarrelEngine)
// ═══════════════════════════════════════════════════════

interface SpacerModelProps {
    params: SpacerComponentParams
    isSelected?: boolean
    onClick?: () => void
}

function SpacerModel({ params, isSelected, onClick }: SpacerModelProps) {
    const outerDia = params.spacerOuterDia || 5.0
    const innerDia = params.spacerInnerDia || 3.0
    const thickness = params.spacerThickness || 0.3
    const outerR = outerDia / 2
    const innerR = innerDia / 2
    const scale = 1.5 / Math.max(outerR, 1)

    // Canvas-generated textures (created once, reused)
    const faceTex = useMemo(() => makeCircularBrushedTex(), [])
    const edgeTex = useMemo(() => makeEdgeBrushedTex(), [])

    const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onClick?.()
    }, [onClick])

    const emColor = isSelected ? '#445566' : '#000000'
    const emInt = isSelected ? 0.4 : 0

    return (
        <group scale={[scale, scale, scale]} onClick={handleClick}>
            {/* Outer cylinder wall — horizontal brushed texture */}
            <mesh>
                <cylinderGeometry args={[outerR, outerR, thickness, 128, 1, true]} />
                <meshStandardMaterial color="#484c52" metalness={0.95} roughness={0.25}
                    map={edgeTex} envMapIntensity={1.5} side={THREE.DoubleSide}
                    emissive={emColor} emissiveIntensity={emInt} />
            </mesh>

            {/* Inner cylinder wall — horizontal brushed texture */}
            <mesh>
                <cylinderGeometry args={[innerR, innerR, thickness, 128, 1, true]} />
                <meshStandardMaterial color="#3e4248" metalness={0.95} roughness={0.30}
                    map={edgeTex} envMapIntensity={1.3} side={THREE.DoubleSide}
                    emissive={emColor} emissiveIntensity={emInt * 0.8} />
            </mesh>

            {/* Top face — circular brushed texture (concentric lathe marks) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, thickness / 2, 0]}>
                <ringGeometry args={[innerR, outerR, 128, 1]} />
                <meshStandardMaterial color="#505560" metalness={0.95} roughness={0.22}
                    map={faceTex} envMapIntensity={1.6}
                    emissive={emColor} emissiveIntensity={emInt * 0.8} />
            </mesh>

            {/* Bottom face — circular brushed texture */}
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -thickness / 2, 0]}>
                <ringGeometry args={[innerR, outerR, 128, 1]} />
                <meshStandardMaterial color="#444850" metalness={0.95} roughness={0.28}
                    map={faceTex} envMapIntensity={1.3}
                    emissive={emColor} emissiveIntensity={emInt * 0.8} />
            </mesh>

            {/* Dimension — Outer Diameter (further outside the ring for clarity) */}
            <DimensionArrow from={[-outerR, 0, outerR + 0.35]} to={[outerR, 0, outerR + 0.35]}
                label={`Out Dia ${outerDia.toFixed(1)}`} color="#ef4444" />
            {/* Dimension — Inner Diameter (inside the hollow center, visible from top) */}
            <DimensionArrow from={[-innerR, thickness * 0.6, 0]} to={[innerR, thickness * 0.6, 0]}
                label={`In Dia ${innerDia.toFixed(1)}`} color="#ef4444" />
            {/* Dimension — Thickness (side, pushed further out so text is outside body) */}
            <DimensionArrow from={[outerR + 0.45, -thickness / 2, 0]} to={[outerR + 0.45, thickness / 2, 0]}
                label={`Thick ${thickness.toFixed(2)}`} color="#ef4444" />
        </group>
    )
}

// ═══════════════════════════════════════════════════════
// Single-component Canvas exports
// ═══════════════════════════════════════════════════════

export function LensDiagram3DCanvas({ params }: { params: LensComponentParams }) {
    return (
        <Canvas camera={{ position: [4, 3, 5], fov: 38 }}
            gl={{ antialias: true, alpha: true }}
            style={{ background: 'transparent', width: '100%', height: '100%' }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1.2} />
            <directionalLight position={[-3, 2, -1]} intensity={0.4} color="#b0c4de" />
            <pointLight position={[0, 0.4, 7.6]} intensity={10} distance={22} decay={2} />
            <Environment preset="studio" />
            <LensModel params={params} />
            <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} autoRotate={false}
                zoomSpeed={0.5} minDistance={3} maxDistance={20} />
        </Canvas>
    )
}

export function SpacerDiagram3DCanvas({ params }: { params: SpacerComponentParams }) {
    return (
        <Canvas camera={{ position: [3, 3.5, 4], fov: 32 }}
            gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
            style={{ background: 'transparent', width: '100%', height: '100%' }}>
            {/* ── BarrelEngine-quality lighting ── */}
            <ambientLight intensity={0.8} color="#d0d4d8" />
            <directionalLight position={[0.6, 3.8, 5.8]} intensity={1.6} />
            <pointLight position={[0, 0.4, 7.6]} intensity={18} distance={22} decay={2} />
            <pointLight position={[-4, 1, 4.5]} intensity={6} distance={20} decay={2} />
            <pointLight position={[4, 1, 4.5]} intensity={6} distance={20} decay={2} />
            <pointLight position={[0, -4, 4.5]} intensity={4} distance={16} decay={2} />
            <pointLight position={[0, 3, -4]} intensity={5} distance={18} decay={2} />
            <Environment preset="studio" />
            <SpacerModel params={params} />
            <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} autoRotate={false}
                zoomSpeed={0.5} minDistance={2} maxDistance={20} />
        </Canvas>
    )
}

// ═══════════════════════════════════════════════════════
// Multi-component exports (kept for potential future use)
// ═══════════════════════════════════════════════════════

export interface ComponentEntry<T> {
    id: string
    params: T
}

interface MultiLensProps {
    lenses: ComponentEntry<LensComponentParams>[]
    selected: string | null
    onSelect: (id: string) => void
}

export function MultiLensDiagram3DCanvas({ lenses, selected, onSelect }: MultiLensProps) {
    const spacing = 4.0
    const startX = -(lenses.length - 1) * spacing / 2
    return (
        <Canvas camera={{ position: [3, 2, 4], fov: 35 }}
            gl={{ antialias: true, alpha: true }}
            style={{ background: 'transparent', width: '100%', height: '100%' }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1.2} />
            <directionalLight position={[-3, 2, -1]} intensity={0.4} color="#b0c4de" />
            <pointLight position={[0, 0.4, 7.6]} intensity={10} distance={22} decay={2} />
            <Environment preset="studio" />
            <group>
                {lenses.map((lens, i) => (
                    <group key={lens.id} position={[startX + i * spacing, 0, 0]}>
                        <LensModel params={lens.params} isSelected={lens.id === selected}
                            onClick={() => onSelect(lens.id)} />
                        <Text position={[0, 1.8, 0]} fontSize={0.22}
                            color={lens.id === selected ? '#38bdf8' : '#94a3b8'}
                            fontWeight={700} anchorX="center" anchorY="middle"
                            outlineWidth={0.008} outlineColor="#0f172a">
                            {lens.id}
                        </Text>
                    </group>
                ))}
            </group>
            <OrbitControls enablePan={false} enableZoom={true} enableRotate={false} autoRotate={false} />
        </Canvas>
    )
}

interface MultiSpacerProps {
    spacers: ComponentEntry<SpacerComponentParams>[]
    selected: string | null
    onSelect: (id: string) => void
}

export function MultiSpacerDiagram3DCanvas({ spacers, selected, onSelect }: MultiSpacerProps) {
    const spacing = 4.0
    const startX = -(spacers.length - 1) * spacing / 2
    return (
        <Canvas camera={{ position: [2, 3, 5], fov: 32 }}
            gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
            style={{ background: 'transparent', width: '100%', height: '100%' }}>
            <ambientLight intensity={0.8} color="#d0d4d8" />
            <directionalLight position={[0.6, 3.8, 5.8]} intensity={1.6} />
            <pointLight position={[0, 0.4, 7.6]} intensity={18} distance={22} decay={2} />
            <pointLight position={[-4, 1, 4.5]} intensity={6} distance={20} decay={2} />
            <pointLight position={[4, 1, 4.5]} intensity={6} distance={20} decay={2} />
            <pointLight position={[0, -4, 4.5]} intensity={4} distance={16} decay={2} />
            <pointLight position={[0, 3, -4]} intensity={5} distance={18} decay={2} />
            <Environment preset="studio" />
            <group>
                {spacers.map((spacer, i) => (
                    <group key={spacer.id} position={[startX + i * spacing, 0, 0]}>
                        <SpacerModel params={spacer.params} isSelected={spacer.id === selected}
                            onClick={() => onSelect(spacer.id)} />
                        <Text position={[0, 1.2, 0]} fontSize={0.22}
                            color={spacer.id === selected ? '#38bdf8' : '#94a3b8'}
                            fontWeight={700} anchorX="center" anchorY="middle"
                            outlineWidth={0.008} outlineColor="#0f172a">
                            {spacer.id}
                        </Text>
                    </group>
                ))}
            </group>
            <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} autoRotate={false} />
        </Canvas>
    )
}

