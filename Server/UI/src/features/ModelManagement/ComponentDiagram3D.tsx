import { useRef, useMemo } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { Text, Environment, OrbitControls, Line } from '@react-three/drei'
import type { LensComponentParams, SpacerComponentParams } from '../../types'

// ── Lens Diagram 3D ────────────────────────────────────────
// Photorealistic biconvex glass lens with dimension arrows

interface LensDiagramProps {
    params: LensComponentParams
}

function LensModel({ params }: LensDiagramProps) {
    const groupRef = useRef<THREE.Group>(null)

    const diameter = params.lensDiameter || 5.0
    const height = params.lensHeight || 2.0
    const thickness = params.lensThickness || 1.5
    const radius = diameter / 2

    // Slow auto-rotation
    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.rotation.y = state.clock.elapsedTime * 0.3
        }
    })

    // Scale factor to keep visual size consistent
    const scale = 1.5 / Math.max(radius, 1)

    return (
        <group ref={groupRef} scale={[scale, scale, scale]}>
            {/* Top lens surface (convex) */}
            <mesh position={[0, 0, 0]}>
                <sphereGeometry args={[radius * 1.2, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.3]} />
                <meshPhysicalMaterial
                    color="#2dd4bf"
                    transmission={0.88}
                    thickness={thickness * 0.5}
                    roughness={0.03}
                    metalness={0.0}
                    ior={1.52}
                    transparent
                    opacity={0.8}
                    side={THREE.DoubleSide}
                    envMapIntensity={1.5}
                    clearcoat={1.0}
                    clearcoatRoughness={0.05}
                />
            </mesh>

            {/* Bottom lens surface (convex) */}
            <mesh position={[0, 0, 0]} rotation={[Math.PI, 0, 0]}>
                <sphereGeometry args={[radius * 1.2, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.3]} />
                <meshPhysicalMaterial
                    color="#2dd4bf"
                    transmission={0.88}
                    thickness={thickness * 0.5}
                    roughness={0.03}
                    metalness={0.0}
                    ior={1.52}
                    transparent
                    opacity={0.8}
                    side={THREE.DoubleSide}
                    envMapIntensity={1.5}
                    clearcoat={1.0}
                    clearcoatRoughness={0.05}
                />
            </mesh>

            {/* Cylindrical edge band */}
            <mesh>
                <cylinderGeometry args={[radius * 0.95, radius * 0.95, thickness * 0.15, 48, 1, true]} />
                <meshPhysicalMaterial
                    color="#1fb8a5"
                    transmission={0.7}
                    thickness={0.3}
                    roughness={0.1}
                    transparent
                    opacity={0.6}
                    side={THREE.DoubleSide}
                />
            </mesh>

            {/* Dimension arrows — Diameter (horizontal) */}
            <DimensionArrow
                from={[-radius, 0, radius + 0.3]}
                to={[radius, 0, radius + 0.3]}
                label={`⌀${diameter.toFixed(1)}`}
                color="#ef4444"
            />

            {/* Dimension arrows — Height (vertical) */}
            <DimensionArrow
                from={[radius + 0.3, -height / 2, 0]}
                to={[radius + 0.3, height / 2, 0]}
                label={`H${height.toFixed(1)}`}
                color="#ef4444"
            />

            {/* Dimension arrows — Thickness */}
            <DimensionArrow
                from={[0, -thickness / 2, -(radius + 0.3)]}
                to={[0, thickness / 2, -(radius + 0.3)]}
                label={`T${thickness.toFixed(1)}`}
                color="#ef4444"
            />
        </group>
    )
}

// ── Spacer Diagram 3D ──────────────────────────────────────
// Metallic ring/washer with dimension arrows

interface SpacerDiagramProps {
    params: SpacerComponentParams
}

function SpacerModel({ params }: SpacerDiagramProps) {
    const groupRef = useRef<THREE.Group>(null)

    const outerDia = params.spacerOuterDia || 5.0
    const innerDia = params.spacerInnerDia || 3.0
    const thickness = params.spacerThickness || 0.3
    const outerR = outerDia / 2
    const innerR = innerDia / 2

    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.rotation.y = state.clock.elapsedTime * 0.3
        }
    })

    const scale = 1.5 / Math.max(outerR, 1)

    // Ring profile for LatheGeometry
    const ringGeo = useMemo(() => {
        const points = [
            new THREE.Vector2(innerR, -thickness / 2),
            new THREE.Vector2(outerR, -thickness / 2),
            new THREE.Vector2(outerR, thickness / 2),
            new THREE.Vector2(innerR, thickness / 2),
        ]
        const geo = new THREE.LatheGeometry(points, 64)
        geo.computeVertexNormals()
        return geo
    }, [innerR, outerR, thickness])

    return (
        <group ref={groupRef} scale={[scale, scale, scale]}>
            {/* Ring body */}
            <mesh geometry={ringGeo}>
                <meshStandardMaterial
                    color="#4a5060"
                    metalness={0.92}
                    roughness={0.22}
                    envMapIntensity={0.9}
                    side={THREE.DoubleSide}
                />
            </mesh>

            {/* Top face */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, thickness / 2, 0]}>
                <ringGeometry args={[innerR, outerR, 64]} />
                <meshStandardMaterial
                    color="#5a6575"
                    metalness={0.9}
                    roughness={0.2}
                    envMapIntensity={0.8}
                />
            </mesh>

            {/* Bottom face */}
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -thickness / 2, 0]}>
                <ringGeometry args={[innerR, outerR, 64]} />
                <meshStandardMaterial
                    color="#3a4555"
                    metalness={0.9}
                    roughness={0.25}
                    envMapIntensity={0.7}
                />
            </mesh>

            {/* Dimension — Outer Diameter */}
            <DimensionArrow
                from={[-outerR, 0, outerR + 0.4]}
                to={[outerR, 0, outerR + 0.4]}
                label={`OD ${outerDia.toFixed(1)}`}
                color="#ef4444"
            />

            {/* Dimension — Inner Diameter */}
            <DimensionArrow
                from={[-innerR, 0, -(outerR + 0.4)]}
                to={[innerR, 0, -(outerR + 0.4)]}
                label={`ID ${innerDia.toFixed(1)}`}
                color="#ef4444"
            />

            {/* Dimension — Thickness */}
            <DimensionArrow
                from={[outerR + 0.4, -thickness / 2, 0]}
                to={[outerR + 0.4, thickness / 2, 0]}
                label={`T ${thickness.toFixed(2)}`}
                color="#ef4444"
            />
        </group>
    )
}

// ── Shared: 3D Dimension Arrow ─────────────────────────────

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
        (from[2] + to[2]) / 2 + 0.15,
    ]

    return (
        <group>
            <Line
                points={[points[0], points[1]]}
                color={color}
                lineWidth={2}
            />

            {/* End caps */}
            <mesh position={from}>
                <sphereGeometry args={[0.04, 8, 8]} />
                <meshBasicMaterial color={color} />
            </mesh>
            <mesh position={to}>
                <sphereGeometry args={[0.04, 8, 8]} />
                <meshBasicMaterial color={color} />
            </mesh>

            {/* Label */}
            <Text
                position={mid}
                fontSize={0.15}
                color={color}
                fontWeight={700}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.01}
                outlineColor="#0f172a"
            >
                {label}
            </Text>
        </group>
    )
}

// ── Exported Canvas Components ─────────────────────────────

export function LensDiagram3DCanvas({ params }: LensDiagramProps) {
    return (
        <Canvas
            camera={{ position: [3, 2, 4], fov: 35 }}
            gl={{ antialias: true, alpha: true }}
            style={{ background: 'transparent', width: '100%', height: '100%' }}
        >
            <ambientLight intensity={0.3} />
            <directionalLight position={[5, 5, 5]} intensity={1.2} />
            <directionalLight position={[-3, 2, -1]} intensity={0.3} color="#b0c4de" />
            <Environment preset="studio" />
            <LensModel params={params} />
            <OrbitControls
                enablePan={false}
                enableZoom={true}
                minDistance={3}
                maxDistance={10}
                autoRotate={false}
            />
        </Canvas>
    )
}

export function SpacerDiagram3DCanvas({ params }: SpacerDiagramProps) {
    return (
        <Canvas
            camera={{ position: [3, 2, 4], fov: 35 }}
            gl={{ antialias: true, alpha: true }}
            style={{ background: 'transparent', width: '100%', height: '100%' }}
        >
            <ambientLight intensity={0.3} />
            <directionalLight position={[5, 5, 5]} intensity={1.2} />
            <directionalLight position={[-3, 2, -1]} intensity={0.3} color="#b0c4de" />
            <Environment preset="studio" />
            <SpacerModel params={params} />
            <OrbitControls
                enablePan={false}
                enableZoom={true}
                minDistance={3}
                maxDistance={10}
                autoRotate={false}
            />
        </Canvas>
    )
}
