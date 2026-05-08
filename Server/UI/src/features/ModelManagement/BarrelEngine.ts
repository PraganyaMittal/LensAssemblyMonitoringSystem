import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'


export interface BarrelSlot { id: string | null; type: 'empty' | 'lens' | 'spacer' }
export interface StepParam { stepHeight: number; innerDiameter: number }

// ════════════════════════════════════════════════════════════
// BarrelEngine — Photorealistic brushed-steel barrel cutaway
// Adapted from reference: custom shell geometry + canvas tex
// ════════════════════════════════════════════════════════════

const OPEN_ANGLE = Math.PI * 1.12
const START_ANGLE = -OPEN_ANGLE / 2 + Math.PI * 1.5  // Gap faces +Z (toward camera)
const SEG = 128
const Z_SQUISH = 0.58

// ── Configurable barrel dimensions ──
const WALL_THK = 0.20        // barrel wall thickness (outer - inner)
const LEDGE_H = 0.04         // ledge ring height at step boundaries
const LEDGE_EXTEND = 0.04    // how far ledge protrudes beyond outer wall
const TOP_RING_H = 0.16      // top/bottom rim ring height
const TOP_RING_EXT = 0.06    // top/bottom rim protrusion

// ── Shape tuning ──
const TAPER = 0.0             // 0=straight cylinder, 0.2=noticeable taper (top wider, bottom narrower)
const STEP_CURVE = 0.06       // 0=perfectly straight step walls, 0.1=gentle concave bend per step
const BARREL_TILT = 0.2       // X-axis rotation in radians. Negative = top tilts toward viewer (try -0.1 to -0.3)
const DEFAULT_ZOOM = 17.2     // initial camera Z distance (lower = closer, try 9-14)
const STEP_H_SCALE = 1.3      // multiplier for step heights (1.0=default, 1.5=50% taller, try 0.8-2.0)

export class BarrelEngine {
    private renderer: THREE.WebGLRenderer
    private scene: THREE.Scene
    private camera: THREE.PerspectiveCamera
    private controls: OrbitControls
    private container: HTMLElement
    private rafId = 0
    private barrel: THREE.Group
    private raycaster = new THREE.Raycaster()
    private rayMouse = new THREE.Vector2()             // reused for raycasting (avoid GC)
    private dropZones = new Map<number, THREE.Mesh>()  // stepIndex → plate mesh
    private dropZoneGroup = new THREE.Group()          // contains only drop zones
    private highlightedStep: number | null = null

    // State tracking for animations
    private previousSlots: BarrelSlot[] = []
    private placedMeshes = new Map<number, THREE.Mesh>()
    private labelSprites = new Map<number, THREE.Sprite>()
    private prevParamsHash = ''
    private barrelHalfH = 4.0  // track barrel half-height for screen projection
    private stepMidYs: number[] = [] // track step Y positions for projection
    private disposed = false          // guard against post-dispose render calls

    // Materials
    private shellMat!: THREE.MeshStandardMaterial
    private openFaceMat!: THREE.MeshStandardMaterial
    private rimMat!: THREE.MeshStandardMaterial
    private accentMat!: THREE.MeshStandardMaterial
    private softPlateMat!: THREE.MeshStandardMaterial
    private dashMat!: THREE.LineDashedMaterial
    private lensMat!: THREE.MeshPhysicalMaterial
    private spacerMat!: THREE.MeshStandardMaterial
    private resizeObserver: ResizeObserver
    private envTexture: THREE.Texture | null = null    // stored for disposal
    private brushedTextures: THREE.CanvasTexture[] = [] // stored for disposal

    constructor(container: HTMLElement) {
        this.container = container

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping
        this.renderer.toneMappingExposure = 1.1
        this.renderer.outputColorSpace = THREE.SRGBColorSpace
        container.appendChild(this.renderer.domElement)

        // Suppress 'Context Lost' warnings from our intentional forceContextLoss() call
        this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault()
        })

        this.scene = new THREE.Scene()
        this.scene.fog = new THREE.FogExp2(0x07101d, 0.03)

        // Perspective camera (matches reference)
        const aspect = container.clientWidth / (container.clientHeight || 1)
        this.camera = new THREE.PerspectiveCamera(34, aspect, 0.1, 100)
        this.camera.position.set(0, 0.2, DEFAULT_ZOOM)

        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.enableDamping = true
        this.controls.dampingFactor = 0.08
        this.controls.enableRotate = false   // LOCKED: no rotation, cutaway always faces front
        this.controls.enablePan = true       // allow panning
        this.controls.enableZoom = true
        this.controls.minDistance = 7.5
        this.controls.maxDistance = DEFAULT_ZOOM
        this.controls.target.set(0, 0, 0)

        this.barrel = new THREE.Group()
        this.scene.add(this.barrel)
        this.barrel.add(this.dropZoneGroup)

        this.buildEnv()
        this.buildLights()
        this.buildMaterials()

        this.resizeObserver = new ResizeObserver(() => this.onResize())
        this.resizeObserver.observe(this.container)

        this.onResize()
        this.animate()
    }

    // ═══ Environment: RoomEnvironment (studio HDRI) ═══

    private buildEnv(): void {
        const pmrem = new THREE.PMREMGenerator(this.renderer)
        const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
        this.envTexture = envRT.texture
        this.scene.environment = this.envTexture
        pmrem.dispose()
    }

    // ═══ Lights ═══

    private buildLights(): void {
        // Even ambient — higher intensity for consistent base illumination
        this.scene.add(new THREE.AmbientLight(0xd0d4d8, 0.7))

        // Key: top-right, moderate intensity
        const key = new THREE.DirectionalLight(0xffffff, 1.4)
        key.position.set(0.6, 3.8, 5.8)
        this.scene.add(key)

        // Front fill: softer, illuminates inner bore evenly
        const front = new THREE.PointLight(0xffffff, 15, 22, 2)
        front.position.set(0, 0.4, 7.6)
        this.scene.add(front)

        // Left fill: soft
        const leftFill = new THREE.PointLight(0xffffff, 5, 20, 2)
        leftFill.position.set(-4, 1, 4.5)
        this.scene.add(leftFill)

        // Bottom fill: subtle
        const botFill = new THREE.PointLight(0xffffff, 3, 16, 2)
        botFill.position.set(0, -4, 4.5)
        this.scene.add(botFill)
    }

    // ═══ Brushed metal texture (canvas-generated) ═══

    private makeBrushedTex(brightness = 158): THREE.CanvasTexture {
        const W = 1024, H = 1024
        const c = document.createElement('canvas')
        c.width = W; c.height = H
        const ctx = c.getContext('2d')!

        // Horizontal gradient base
        const g = ctx.createLinearGradient(0, 0, W, 0)
        const b = brightness
        g.addColorStop(0.00, `rgb(${b - 60},${b - 60},${b - 58})`)
        g.addColorStop(0.18, `rgb(${b + 25},${b + 25},${b + 22})`)
        g.addColorStop(0.36, `rgb(${b - 25},${b - 25},${b - 22})`)
        g.addColorStop(0.54, `rgb(${b + 55},${b + 55},${b + 52})`)
        g.addColorStop(0.72, `rgb(${b - 16},${b - 16},${b - 14})`)
        g.addColorStop(1.00, `rgb(${b - 50},${b - 50},${b - 48})`)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)

        // Horizontal brush strokes
        ctx.globalAlpha = 0.55
        for (let y = 0; y < H; y++) {
            const a = 0.02 + Math.random() * 0.14
            const l = Math.random() > 0.5 ? 255 : 0
            ctx.strokeStyle = `rgba(${l},${l},${l},${a})`
            ctx.lineWidth = 0.3 + Math.random() * 1.2
            ctx.beginPath()
            ctx.moveTo(0, y + Math.random() * 1.5)
            ctx.lineTo(W, y + Math.random() * 1.5)
            ctx.stroke()
        }

        // Scratch lines
        ctx.globalAlpha = 0.2
        for (let i = 0; i < 800; i++) {
            const x = Math.random() * W, y = Math.random() * H
            const len = 25 + Math.random() * 120
            ctx.strokeStyle = Math.random() > 0.5
                ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.12)'
            ctx.beginPath()
            ctx.moveTo(x, y)
            ctx.lineTo(x + len, y + Math.random() * 1.2 - 0.6)
            ctx.stroke()
        }

        const tex = new THREE.CanvasTexture(c)
        tex.wrapS = THREE.RepeatWrapping
        tex.wrapT = THREE.RepeatWrapping
        tex.repeat.set(1.4, 6.0)
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
        tex.colorSpace = THREE.SRGBColorSpace
        this.brushedTextures.push(tex)
        return tex
    }

    // ═══ Materials ═══

    private buildMaterials(): void {
        const silver = this.makeBrushedTex(160)
        const bright = this.makeBrushedTex(180)

        this.shellMat = new THREE.MeshStandardMaterial({
            color: 0xc8c8c2, metalness: 1, roughness: 0.28,
            map: silver, envMapIntensity: 1.35, side: THREE.DoubleSide
        })
        this.openFaceMat = new THREE.MeshStandardMaterial({
            color: 0xd9d8d3, metalness: 1, roughness: 0.22,
            map: bright, envMapIntensity: 1.55, side: THREE.DoubleSide
        })
        this.rimMat = new THREE.MeshStandardMaterial({
            color: 0xe3e1dc, metalness: 1, roughness: 0.18,
            map: bright, envMapIntensity: 1.7, side: THREE.DoubleSide
        })
        this.accentMat = new THREE.MeshStandardMaterial({
            color: 0x16191b, metalness: 0.95, roughness: 0.45,
            envMapIntensity: 0.7, side: THREE.DoubleSide
        })
        this.softPlateMat = new THREE.MeshStandardMaterial({
            color: 0xd4d4cf, metalness: 1, roughness: 0.22,
            transparent: true, opacity: 0.55, envMapIntensity: 1.2,
            side: THREE.DoubleSide
        })
        this.dashMat = new THREE.LineDashedMaterial({
            color: 0x14191f, dashSize: 0.12, gapSize: 0.065,
            transparent: true, opacity: 0.95
        })

        // ── Glass lens material (MeshPhysicalMaterial for volumetric refraction) ──
        this.lensMat = new THREE.MeshPhysicalMaterial({
            color: 0x2dd4bf,               // Base cyan tone
            metalness: 0.1,
            roughness: 0.05,
            transmission: 0.60,            // Less transparent glass
            thickness: 1.5,                // Refraction volume thickness
            ior: 1.55,                     // Crown glass index of refraction
            attenuationColor: new THREE.Color(0x11aaaa), // Deep cyan tint inside the glass
            attenuationDistance: 1.5,      // Slightly faster absorption for richer color
            envMapIntensity: 2.5,          // High reflection
            clearcoat: 1.0,
            clearcoatRoughness: 0.02,
            side: THREE.DoubleSide
        })

        // ── Brushed-steel spacer material (Dark Grey/Blackish) ──
        const spacerTex = this.makeBrushedTex(100)  // Darker base for texture
        this.spacerMat = new THREE.MeshStandardMaterial({
            color: 0x222426,               // Deep blackish-grey
            metalness: 0.95,
            roughness: 0.45,
            map: spacerTex,
            envMapIntensity: 1.2,
            side: THREE.DoubleSide
        })
    }

    // ═══ Radius functions — STEPPED with taper + gentle curve ═══
    // TAPER: top steps are wider, bottom steps are narrower
    // STEP_CURVE: adds a slight concave bend within each step

    private makeSteppedRadiusFns(
        halfH: number, stepH: number[], innerR: number[]
    ) {
        const N = stepH.length
        const totalH = halfH * 2

        // Precompute Y boundaries
        const yBounds: number[] = []
        let yAcc = -halfH
        for (let i = 0; i < N; i++) {
            yBounds.push(yAcc)
            yAcc += stepH[i]
        }
        yBounds.push(yAcc)

        const getStep = (y: number): number => {
            for (let i = N - 1; i >= 0; i--) {
                if (y >= yBounds[i]) return i
            }
            return 0
        }

        // Taper factor: 1.0 at center, wider at top, narrower at bottom
        const taperAt = (y: number) => {
            const t = (y + halfH) / totalH   // 0 at bottom, 1 at top
            return 1.0 + TAPER * (t - 0.5)   // bottom: 1-taper/2, top: 1+taper/2
        }

        // Curve factor: slight concave bend within each step
        const curveAt = (y: number): number => {
            const i = getStep(y)
            const stepBot = yBounds[i]
            const stepTop = yBounds[i + 1]
            const localT = (y - stepBot) / (stepTop - stepBot)  // 0..1 within step
            // Parabolic curve: deepest at center of step, flush at edges
            return -STEP_CURVE * 4 * localT * (1 - localT)
        }

        // C² smooth Hermite interpolation at step boundaries
        const BLEND_ZONE = 0.15
        const smoothR = (y: number): number => {
            for (let b = 1; b < N; b++) {
                const dist = y - yBounds[b]
                if (Math.abs(dist) < BLEND_ZONE) {
                    const below = Math.max(0, b - 1)
                    const above = Math.min(N - 1, b)
                    const t = (dist + BLEND_ZONE) / (2 * BLEND_ZONE)
                    const s = t * t * (3 - 2 * t) // smoothstep
                    return innerR[below] + (innerR[above] - innerR[below]) * s
                }
            }
            return innerR[getStep(y)]
        }

        const rInner = (y: number) => {
            return (smoothR(y) + curveAt(y)) * taperAt(y)
        }
        const rOuter = (y: number) => {
            return (smoothR(y) + WALL_THK + curveAt(y)) * taperAt(y)
        }

        return { rOuter, rInner, yBounds }
    }

    // ═══ Shell geometry builder ═══

    private makeShell(
        radiusFn: (y: number) => number,
        material: THREE.Material,
        yMin: number, yMax: number
    ): THREE.Mesh {
        const verts: number[] = [], uvs: number[] = [], indices: number[] = []
        const ySteps = 96

        for (let iy = 0; iy <= ySteps; iy++) {
            const y = yMin + (iy / ySteps) * (yMax - yMin)
            const r = radiusFn(y)
            for (let ia = 0; ia <= SEG; ia++) {
                const a = START_ANGLE + (ia / SEG) * OPEN_ANGLE
                verts.push(Math.cos(a) * r, y, Math.sin(a) * r * Z_SQUISH)
                uvs.push(ia / SEG, iy / 18)
            }
        }
        for (let iy = 0; iy < ySteps; iy++) {
            for (let ia = 0; ia < SEG; ia++) {
                const b = iy * (SEG + 1) + ia
                indices.push(b, b + 1, b + SEG + 1, b + 1, b + SEG + 2, b + SEG + 1)
            }
        }

        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
        geo.setIndex(indices)
        geo.computeVertexNormals()
        return new THREE.Mesh(geo, material)
    }

    // ═══ Ring/ledge builder ═══

    private addRing(
        rOuterFn: (y: number) => number, rInnerFn: (y: number) => number,
        y: number, h: number, outerExtra: number, innerInset: number,
        material: THREE.Material
    ): void {
        const shape = new THREE.Shape()
        const rOut = rOuterFn(y) + outerExtra
        const rIn = rInnerFn(y) - innerInset
        const endAngle = START_ANGLE + OPEN_ANGLE

        // Extend arc slightly beyond the cut edges for clean bevel termination
        const EPS = 0.015
        shape.absarc(0, 0, rOut, START_ANGLE - EPS, endAngle + EPS, false)
        shape.lineTo(Math.cos(endAngle + EPS) * rIn, Math.sin(endAngle + EPS) * rIn) // removed Z_SQUISH to fix right edge
        shape.absarc(0, 0, rIn, endAngle + EPS, START_ANGLE - EPS, true)
        shape.closePath()

        const geo = new THREE.ExtrudeGeometry(shape, {
            depth: h, bevelEnabled: true, bevelThickness: 0.035,
            bevelSize: 0.035, bevelSegments: 3, curveSegments: 96
        })
        geo.rotateX(Math.PI / 2)
        geo.translate(0, y + h / 2, 0)
        geo.scale(1, 1, Z_SQUISH)
        geo.computeVertexNormals()
        this.barrel.add(new THREE.Mesh(geo, material))

        // Add end-cap plugs at both cut edges for symmetric termination
        for (const angle of [START_ANGLE, endAngle]) {
            const capShape = new THREE.Shape()
            const coA = Math.cos(angle), siA = Math.sin(angle)
            // Small rectangular cross-section at the cut edge (no Z_SQUISH here, it's applied to the geo later)
            capShape.moveTo(coA * rIn, siA * rIn)
            capShape.lineTo(coA * rOut, siA * rOut)
            // Tiny arc step for thickness
            const da = angle === START_ANGLE ? -0.02 : 0.02
            capShape.lineTo(Math.cos(angle + da) * rOut, Math.sin(angle + da) * rOut)
            capShape.lineTo(Math.cos(angle + da) * rIn, Math.sin(angle + da) * rIn)
            capShape.closePath()

            const capGeo = new THREE.ExtrudeGeometry(capShape, {
                depth: h, bevelEnabled: false, curveSegments: 4
            })
            capGeo.rotateX(Math.PI / 2)
            capGeo.translate(0, y + h / 2, 0)
            capGeo.scale(1, 1, Z_SQUISH)
            capGeo.computeVertexNormals()
            this.barrel.add(new THREE.Mesh(capGeo, material))
        }
    }

    // ═══ Side wall builder ═══

    private addSideWall(
        angle: number, rOuterFn: (y: number) => number,
        rInnerFn: (y: number) => number,
        halfH: number, totalH: number
    ): void {
        const verts: number[] = [], indices: number[] = []
        const steps = 140
        for (let i = 0; i <= steps; i++) {
            const y = -halfH + (i / steps) * totalH
            const ro = rOuterFn(y) + 0.02
            const ri = rInnerFn(y) - 0.08   // reduced inner inset (thinner wall visible)
            verts.push(Math.cos(angle) * ri, y, Math.sin(angle) * ri * Z_SQUISH)
            verts.push(Math.cos(angle) * ro, y, Math.sin(angle) * ro * Z_SQUISH)
        }
        for (let i = 0; i < steps; i++) {
            const b = i * 2
            indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
        geo.setIndex(indices)
        geo.computeVertexNormals()
        const mesh = new THREE.Mesh(geo, this.shellMat)
        // Disable shadows on side walls to fix black pixel artifacts
        mesh.castShadow = false
        mesh.receiveShadow = false
        this.barrel.add(mesh)
    }

    // ═══ Drop zone (3D mesh + dashed outline) ═══

    private addDropZone(y: number, stepR: number, stepH: number, stepIndex: number, isFilled: boolean): void {
        // Advanced 3D alignment:
        // 1. We tilt WITH the barrel to ensure perspective projection scales match exactly.
        // 2. Parallax Fix: If the drop zone floats in the middle (z=0), the camera's perspective 
        //    makes it visually drift away from the back wall. We push it deeply into the cavity 
        //    so it visually hugs the back wall, eliminating all vertical drift across steps.

        const maxW = stepR * 2 * 0.55
        const maxH = (stepH - LEDGE_H) * 0.65

        // Limit the white background (plate) to match exactly the dashed boundary size
        const pw = maxW * 0.88
        const ph = maxH * 0.82

        const group = new THREE.Group()
        // Push deep into the cavity (85% of the way to the back wall)
        const zDepth = -stepR * Z_SQUISH * 0.85
        group.position.set(0, y, zDepth)

        // Translucent plate — this is the raycast target for drag-and-drop
        const plateMat = this.softPlateMat.clone()
        if (isFilled) {
            plateMat.opacity = 0 // completely invisible until hovered
            plateMat.transparent = true
        }
        // If empty, we want the plate to have rounded corners to perfectly match the dashed line,
        // but since it's a very faint background, a PlaneGeometry (rectangle) is usually fine.
        // However, to perfectly not overflow the dashed rounded corners, we use a custom rounded shape.
        const cornerR = Math.min(pw, ph) * 0.12
        const plateGeo = this.makeRoundedPlaneGeo(pw, ph, cornerR)
        const plate = new THREE.Mesh(plateGeo, plateMat)
        plate.userData = { stepIndex, isFilled, stepR }
        group.add(plate)
        this.dropZones.set(stepIndex, plate)

        // Dashed rectangle outline (only visible if empty)
        if (!isFilled) {
            const outline = this.makeRoundedRect(pw, ph, cornerR)
            outline.position.set(0, 0, 0.08)
            group.add(outline)

            // "Drop here" text
            const tex = this.makeTextTex('Drop here')
            const labelMat = new THREE.MeshBasicMaterial({
                map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide
            })
            const labelW = Math.min(pw * 0.70, 1.3)
            const labelH = labelW * 0.32
            const label = new THREE.Mesh(new THREE.PlaneGeometry(labelW, labelH), labelMat)
            label.position.set(0, -0.01, 0.10)
            group.add(label)
        }

        this.dropZoneGroup.add(group)
    }

    private makeRoundedRect(w: number, h: number, r: number): THREE.Line {
        const pts: THREE.Vector3[] = []
        const s = 10
        const arc = (cx: number, cy: number, a0: number, a1: number) => {
            for (let i = 0; i <= s; i++) {
                const a = a0 + (a1 - a0) * (i / s)
                pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0))
            }
        }
        arc(w / 2 - r, h / 2 - r, 0, Math.PI / 2)
        arc(-w / 2 + r, h / 2 - r, Math.PI / 2, Math.PI)
        arc(-w / 2 + r, -h / 2 + r, Math.PI, Math.PI * 1.5)
        arc(w / 2 - r, -h / 2 + r, Math.PI * 1.5, Math.PI * 2)
        pts.push(pts[0].clone())

        const geo = new THREE.BufferGeometry().setFromPoints(pts)
        const line = new THREE.Line(geo, this.dashMat)
        line.computeLineDistances()
        return line
    }

    private makeRoundedPlaneGeo(w: number, h: number, r: number): THREE.ShapeGeometry {
        const shape = new THREE.Shape()
        shape.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false)
        shape.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false)
        shape.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false)
        shape.absarc(w / 2 - r, -h / 2 + r, r, Math.PI * 1.5, Math.PI * 2, false)
        shape.closePath()
        return new THREE.ShapeGeometry(shape)
    }

    private makeTextTex(text: string): THREE.CanvasTexture {
        const c = document.createElement('canvas')
        c.width = 512; c.height = 160
        const ctx = c.getContext('2d')!
        ctx.clearRect(0, 0, c.width, c.height)
        ctx.font = '500 48px Inter, Arial, sans-serif'
        ctx.fillStyle = 'rgba(8,10,14,.88)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, c.width / 2, c.height / 2 + 4)
        const tex = new THREE.CanvasTexture(c)
        tex.colorSpace = THREE.SRGBColorSpace
        return tex
    }

    // ═══ Biconvex glass lens (LatheGeometry with parabolic profile) ═══

    private addLens(stepR: number, _stepH: number): THREE.Mesh {
        // Biconvex lens: two convex parabolic surfaces meeting at the equator.
        // Profile is rotated around Y axis via LatheGeometry.
        //
        //  Lens geometry (cross-section, half profile for lathe):
        //
        //       ╭─── top surface (convex parabola) ───╮
        //       │                                      │
        //  r=0  ●──────────── equator ─────────────────● r=lensR
        //       │                                      │
        //       ╰─── bottom surface (convex parabola) ─╯
        //
        //  The sag (depth of curvature) determines how "fat" the lens looks.

        const lensR = stepR * 0.88                   // lens radius fits inside inner bore
        const edgeThk = 0.02                          // very thin edge
        const sagFactor = 0.22                        // curvature factor (0.1=flat, 0.3=very curved)
        const sag = lensR * sagFactor                 // maximum sag at center
        const centerThk = edgeThk + sag * 2           // total center thickness
        const pts: THREE.Vector2[] = []
        const segs = 48

        // Build profile from bottom pole → equator → top pole
        // Bottom convex surface (curving inward from bottom)
        for (let i = 0; i <= segs; i++) {
            const t = i / segs                        // 0 = center (r=0), 1 = edge (r=lensR)
            const r = lensR * t
            // Parabolic sag: y = -centerThk/2 + sag*(1 - t²)
            const yp = -centerThk / 2 + sag * (1 - t * t)
            pts.push(new THREE.Vector2(r, yp))
        }

        // Top convex surface (curving outward from equator to top)
        for (let i = segs; i >= 0; i--) {
            const t = i / segs
            const r = lensR * t
            const yp = centerThk / 2 - sag * (1 - t * t)
            pts.push(new THREE.Vector2(r, yp))
        }

        const geo = new THREE.LatheGeometry(pts, 80)
        const mat = this.lensMat.clone()
        const mesh = new THREE.Mesh(geo, mat)
        return mesh
    }

    // ═══ Brushed-steel spacer ring (TorusGeometry) ═══

    private addSpacer(stepR: number, stepH: number): THREE.Mesh {
        // Spacer is a flat washer/ring that sits horizontally inside the step.
        // Full 360 degree ring, creating an oval shape when squished.

        const rOut = stepR * 0.98                    // Fits snugly in the step
        const rIn = stepR * 0.70                     // Inner hole radius
        const h = Math.min(stepH * 0.6, 0.4)         // Height of the spacer ring

        const shape = new THREE.Shape()
        shape.absarc(0, 0, rOut, 0, Math.PI * 2, false)
        shape.lineTo(rIn, 0)
        shape.absarc(0, 0, rIn, Math.PI * 2, 0, true)
        shape.closePath()

        const geo = new THREE.ExtrudeGeometry(shape, {
            depth: h, bevelEnabled: true, bevelThickness: 0.02,
            bevelSize: 0.02, bevelSegments: 3, curveSegments: 96
        })

        // Extrusion is along Z. Rotate X by PI/2 to make the washer horizontal
        geo.rotateX(Math.PI / 2)
        // Translate to center the extrusion on the local origin
        geo.translate(0, h / 2, 0)
        // Squish the geometry to match the elliptical barrel bore
        geo.scale(1, 1, Z_SQUISH)
        geo.computeVertexNormals()

        const mat = this.spacerMat.clone()
        const mesh = new THREE.Mesh(geo, mat)
        // Position is handled by the geometry translation, so mesh stays at origin
        return mesh
    }

    // ═══ Component Label Sprite (auto-faces camera) ═══

    private makeLabel(text: string, isLens: boolean): THREE.Sprite {
        const W = 1024, H = 256
        const canvas = document.createElement('canvas')
        canvas.width = W; canvas.height = H
        const ctx = canvas.getContext('2d')!

        // Transparent background — no box/pill
        ctx.clearRect(0, 0, W, H)

        // Heavy font for maximum visibility
        ctx.font = '900 128px Arial, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        // Stroke outline for contrast against any background
        ctx.lineWidth = 8
        ctx.strokeStyle = isLens ? '#ffffff' : '#000000'
        ctx.strokeText(text, W / 2, H / 2)

        // Fill — pure black for lens, bright white for spacer
        ctx.fillStyle = isLens ? '#000000' : '#ffffff'
        ctx.fillText(text, W / 2, H / 2)

        const tex = new THREE.CanvasTexture(canvas)
        tex.colorSpace = THREE.SRGBColorSpace
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
        const sprite = new THREE.Sprite(mat)
        sprite.scale.set(1.6, 0.4, 1)
        return sprite
    }

    // ═══ UPDATE BARREL ═══

    updateBarrel(slots: BarrelSlot[], stepParams: StepParam[], ttl: number): void {
        const N = slots.length
        if (N === 0) return

        const paramsHash = JSON.stringify(stepParams) + ttl
        const paramsChanged = this.prevParamsHash !== paramsHash

        // ── Scale to visual units ──
        const totalReal = stepParams.reduce((a, b) => a + b.stepHeight, 0) || N
        const totalH = 7.95

        const sc = totalH / totalReal

        const stepH = stepParams.map(sp => Math.max(sp.stepHeight * sc * STEP_H_SCALE, 0.4))
        const maxDia = Math.max(...stepParams.map(sp => sp.innerDiameter)) || 10
        const innerR = stepParams.map(sp => 1.3 + (sp.innerDiameter / maxDia) * 0.9)

        const actualTotalH = stepH.reduce((a, b) => a + b, 0)
        const actualHalfH = actualTotalH / 2
        const { rOuter, rInner, yBounds } = this.makeSteppedRadiusFns(actualHalfH, stepH, innerR)

        this.stepMidYs = []
        for (let i = 0; i < N; i++) {
            this.stepMidYs.push(yBounds[i] + stepH[i] / 2)
        }

        // ── Rebuild static shell ONLY if params changed ──
        if (paramsChanged) {
            this.placedMeshes.clear()
            this.clearBarrel()
            this.prevParamsHash = paramsHash
            this.previousSlots = []

            this.barrel.add(this.makeShell(rOuter, this.shellMat, -actualHalfH, actualHalfH))
            const inner = this.makeShell(y => rInner(y), this.openFaceMat, -actualHalfH + 0.10, actualHalfH - 0.10)
            inner.scale.set(0.998, 1, 1.005)
            this.barrel.add(inner)

            this.addRing(rOuter, rInner, actualHalfH - 0.03, TOP_RING_H, TOP_RING_EXT, 0.20, this.rimMat)
            this.addRing(rOuter, rInner, -actualHalfH + 0.03, TOP_RING_H, TOP_RING_EXT, 0.18, this.rimMat)

            for (let i = 1; i < N; i++) {
                const ly = yBounds[i]
                this.addRing(rOuter, rInner, ly, LEDGE_H, LEDGE_EXTEND, 0.12, this.rimMat)
                this.addRing(rOuter, rInner, ly + 0.005, 0.03, -0.02, 0.04, this.accentMat)
            }

            this.addSideWall(START_ANGLE, rOuter, rInner, actualHalfH, actualTotalH)
            this.addSideWall(START_ANGLE + OPEN_ANGLE, rOuter, rInner, actualHalfH, actualTotalH)
        }

        // ── Clear only drop zones on every render ──
        this.clearDropZones()

        // ── Drop zones & GSAP Animated Components ──
        for (let i = 0; i < N; i++) {
            const stepMidY = yBounds[i] + stepH[i] / 2
            const exactR = rInner(stepMidY)
            const isFilled = !!(slots[i] && slots[i].id)
            const prevFilled = !!(this.previousSlots[i] && this.previousSlots[i].id)
            const typeChanged = this.previousSlots[i]?.type !== slots[i]?.type

            // Always add the drop zone for raycasting
            this.addDropZone(stepMidY, exactR, stepH[i], i, isFilled)

            if (isFilled && (!prevFilled || typeChanged)) {
                // ── INSTANT INSERTION ──
                if (typeChanged && prevFilled) {
                    // Remove old mesh if swapped — dispose geometry AND cloned material
                    const oldMesh = this.placedMeshes.get(i)
                    if (oldMesh) {
                        this.barrel.remove(oldMesh)
                        oldMesh.geometry.dispose()
                        if (oldMesh.material instanceof THREE.Material) oldMesh.material.dispose()
                    }
                    // Also remove old label
                    const oldLabel = this.labelSprites.get(i)
                    if (oldLabel) {
                        this.barrel.remove(oldLabel)
                        if (oldLabel.material instanceof THREE.SpriteMaterial && oldLabel.material.map) {
                            oldLabel.material.map.dispose()
                        }
                        oldLabel.material.dispose()
                        this.labelSprites.delete(i)
                    }
                }
                const mesh = slots[i].type === 'lens'
                    ? this.addLens(exactR, stepH[i])
                    : this.addSpacer(exactR, stepH[i])

                // Immediately snap to final position
                mesh.position.y = stepMidY
                mesh.scale.set(1, 1, Z_SQUISH)

                this.barrel.add(mesh)
                this.placedMeshes.set(i, mesh)

                // ── Add label sprite (L1, L2, SP0 etc) ──
                if (slots[i].id) {
                    const label = this.makeLabel(slots[i].id!, slots[i].type === 'lens')
                    // Position label in front of component (toward camera through cutaway)
                    label.position.set(0, stepMidY, exactR * Z_SQUISH * 0.6)
                    this.barrel.add(label)
                    this.labelSprites.set(i, label)
                }
            }
            else if (!isFilled && prevFilled) {
                // ── INSTANT REMOVAL ──
                const oldMesh = this.placedMeshes.get(i)
                if (oldMesh) {
                    this.placedMeshes.delete(i)
                    this.barrel.remove(oldMesh)
                    oldMesh.geometry.dispose()
                    if (oldMesh.material instanceof THREE.Material) oldMesh.material.dispose()
                }
                // Remove label
                const oldLabel = this.labelSprites.get(i)
                if (oldLabel) {
                    this.labelSprites.delete(i)
                    this.barrel.remove(oldLabel)
                    if (oldLabel.material instanceof THREE.SpriteMaterial && oldLabel.material.map) {
                        oldLabel.material.map.dispose()
                    }
                    oldLabel.material.dispose()
                }
            }
            else if (isFilled && prevFilled && !typeChanged) {
                // Component already exists, keep it in sync
                const mesh = this.placedMeshes.get(i)
                if (mesh) {
                    mesh.position.set(0, stepMidY, 0)
                }
            }
        }

        this.previousSlots = [...slots]
        this.barrelHalfH = actualHalfH
        this.barrel.rotation.x = BARREL_TILT
        this.barrel.position.y = -0.3 // Shift down slightly to center vertically in view
        this.barrel.updateMatrixWorld(true)
    }

    /** Project barrel top/bottom rings to screen-space percentages (0=top, 1=bottom) */
    getBarrelScreenBounds(): { topPct: number; bottomPct: number } {
        const topWorld = new THREE.Vector3(0, this.barrelHalfH, 0)
        const bottomWorld = new THREE.Vector3(0, -this.barrelHalfH, 0)
        // Apply barrel transform (including tilt and position)
        topWorld.applyMatrix4(this.barrel.matrixWorld)
        bottomWorld.applyMatrix4(this.barrel.matrixWorld)
        // Project to NDC
        topWorld.project(this.camera)
        bottomWorld.project(this.camera)
        // NDC y: -1=bottom, +1=top → convert to percentage (0%=top, 100%=bottom)
        const topPct = (1 - topWorld.y) / 2 * 100
        const bottomPct = (1 - bottomWorld.y) / 2 * 100
        return {
            topPct: Math.max(0, topPct - 1),      // slight padding above top ring
            bottomPct: Math.min(100, bottomPct + 1) // slight padding below bottom ring
        }
    }

    /** Project step mid Y positions to screen-space percentages (0=top, 1=bottom) */
    getStepScreenBounds(): number[] {
        return this.stepMidYs.map(y => {
            const worldPos = new THREE.Vector3(0, y, 0)
            worldPos.applyMatrix4(this.barrel.matrixWorld)
            worldPos.project(this.camera)
            return (1 - worldPos.y) / 2 * 100
        })
    }

    // ═══ CLEANUP ═══

    private clearDropZones(): void {
        this.dropZones.clear()
        this.highlightedStep = null
        for (let i = this.dropZoneGroup.children.length - 1; i >= 0; i--) {
            const group = this.dropZoneGroup.children[i]
            group.traverse((child) => {
                if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
                    if (child.geometry) child.geometry.dispose()
                    const m = child.material
                    if (Array.isArray(m)) {
                        m.forEach(x => {
                            if ((x as any).map) (x as any).map.dispose()
                            x.dispose()
                        })
                    } else if (m instanceof THREE.Material) {
                        if ((m as any).map) (m as any).map.dispose()
                        m.dispose()
                    }
                }
            })
            this.dropZoneGroup.remove(group)
        }
    }

    private clearBarrel(): void {
        this.clearDropZones()
        // Clear label sprites
        this.labelSprites.forEach((sprite) => {
            this.barrel.remove(sprite)
            if (sprite.material instanceof THREE.SpriteMaterial && sprite.material.map) {
                sprite.material.map.dispose()
            }
            sprite.material.dispose()
        })
        this.labelSprites.clear()
        // Dispose placed component meshes (lenses/spacers) — they hold cloned materials
        this.placedMeshes.forEach((mesh) => {
            this.barrel.remove(mesh)
            mesh.geometry.dispose()
            if (mesh.material instanceof THREE.Material) mesh.material.dispose()
        })
        this.placedMeshes.clear()
        // Dispose remaining static barrel geometry (shells, rings, side walls)
        for (const child of [...this.barrel.children]) {
            if (child === this.dropZoneGroup) continue
            this.barrel.remove(child)
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose()
                // Don't dispose shared materials here — they are reused across rebuilds
            }
            if (child instanceof THREE.Line) {
                child.geometry.dispose()
            }
        }
    }

    private onResize = (): void => {
        const w = this.container.clientWidth, h = this.container.clientHeight
        if (!w || !h) return
        this.camera.aspect = w / h
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(w, h)
    }

    private animate = (): void => {
        if (this.disposed) return
        this.rafId = requestAnimationFrame(this.animate)
        this.controls.update()
        this.renderer.render(this.scene, this.camera)
    }

    dispose(): void {
        this.disposed = true
        cancelAnimationFrame(this.rafId)
        this.resizeObserver.disconnect()
        this.clearBarrel()
        // Dispose shared materials
        this.shellMat?.dispose()
        this.openFaceMat?.dispose()
        this.rimMat?.dispose()
        this.accentMat?.dispose()
        this.softPlateMat?.dispose()
        this.dashMat?.dispose()
        this.lensMat?.dispose()
        this.spacerMat?.dispose()
        // Dispose brushed metal textures
        this.brushedTextures.forEach(t => t.dispose())
        this.brushedTextures = []
        // Dispose environment texture
        if (this.envTexture) {
            this.envTexture.dispose()
            this.envTexture = null
        }
        this.controls.dispose()
        this.renderer.dispose()
        this.renderer.forceContextLoss()
        if (this.renderer.domElement.parentElement)
            this.container.removeChild(this.renderer.domElement)
    }

    updateComponentStyles(slots: BarrelSlot[], componentParams: Record<string, any>): void {
        this.placedMeshes.forEach((mesh, idx) => {
            const slot = slots[idx]
            if (slot && slot.type === 'lens' && slot.id) {
                const params = componentParams[slot.id] || {}
                const mat = mesh.material as THREE.Material

                if (mat instanceof THREE.MeshPhysicalMaterial) {
                    // Update Color
                    if (params.lensColor) {
                        mat.color.set(params.lensColor)
                    } else {
                        mat.color.setHex(0x2dd4bf) // Default cyan
                    }

                    // Store the user's opacity as the base transmission.
                    // If opacity is 0, transmission is 1. If opacity is 1, transmission is 0.
                    let baseTransmission = 0.60
                    if (params.lensOpacity !== undefined) {
                        baseTransmission = 1 - params.lensOpacity
                    }
                    mat.userData.baseTransmission = baseTransmission
                }
            }
        })
    }

    updateSelection(selectedStep: number | null): void {
        this.placedMeshes.forEach((mesh, idx) => {
            const isSelected = selectedStep === idx
            const mat = mesh.material as THREE.Material
            if (mat instanceof THREE.MeshPhysicalMaterial) {
                // Lens — make significantly darker when selected
                const baseTransmission = mat.userData.baseTransmission !== undefined ? mat.userData.baseTransmission : 0.60
                if (isSelected) {
                    mat.color.setHex(0x0d8070)        // Dark teal
                    mat.emissive.setHex(0x006655)
                    mat.emissiveIntensity = 0.6
                    mat.transmission = Math.max(0, baseTransmission - 0.5)
                    mat.opacity = 0.95
                } else {
                    mat.color.setHex(0x2dd4bf)        // Original cyan
                    mat.emissive.setHex(0x000000)
                    mat.emissiveIntensity = 0.0
                    mat.transmission = baseTransmission
                    mat.opacity = 0.8
                }
            } else if (mat instanceof THREE.MeshStandardMaterial) {
                // Spacer — make significantly darker when selected
                if (isSelected) {
                    mat.color.setHex(0x222830)        // Very dark steel
                    mat.emissive.setHex(0x334455)
                    mat.emissiveIntensity = 0.5
                    mat.roughness = 0.15
                } else {
                    mat.color.setHex(0x555a60)        // Original brushed steel
                    mat.emissive.setHex(0x000000)
                    mat.emissiveIntensity = 0.0
                    mat.roughness = 0.28
                }
            }
        })

        // Highlight selected label
        this.labelSprites.forEach((sprite, idx) => {
            const isSelected = selectedStep === idx
            sprite.material.opacity = isSelected ? 1.0 : 0.65
            const scale = isSelected ? 1.8 : 1.6
            sprite.scale.set(scale, scale * 0.25, 1)
        })
    }

    // ═══ DRAG-AND-DROP: Raycasting + Highlight ═══

    /** Shoot a ray from (clientX, clientY) and return the step index of the hovered drop zone, or null */
    hitTestStep(clientX: number, clientY: number): number | null {
        const rect = this.container.getBoundingClientRect()
        this.rayMouse.set(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        )
        this.raycaster.setFromCamera(this.rayMouse, this.camera)

        const targets = Array.from(this.dropZones.values())
        const hits = this.raycaster.intersectObjects(targets, true)
        if (hits.length > 0) {
            // Walk up to find the mesh with stepIndex
            let obj: THREE.Object3D | null = hits[0].object
            while (obj) {
                if (obj.userData.stepIndex !== undefined) return obj.userData.stepIndex as number
                obj = obj.parent
            }
        }
        return null
    }

    /** Highlight a specific drop zone (green tint + higher opacity) */
    highlightStep(idx: number): void {
        if (this.highlightedStep === idx) return
        this.clearHighlight()
        this.highlightedStep = idx
        const plate = this.dropZones.get(idx)
        if (plate) {
            const mat = plate.material as THREE.MeshStandardMaterial
            mat.color.set(0x4ade80)   // green
            mat.opacity = 0.75
        }
    }

    /** Highlight a drop zone as blocked (red tint — can't drop here) */
    highlightStepBlocked(idx: number): void {
        if (this.highlightedStep === idx) return
        this.clearHighlight()
        this.highlightedStep = idx
        const plate = this.dropZones.get(idx)
        if (plate) {
            const mat = plate.material as THREE.MeshStandardMaterial
            mat.color.set(0xef4444)   // red = blocked
            mat.opacity = 0.55
        }
    }

    /** Clear any active highlight */
    clearHighlight(): void {
        if (this.highlightedStep !== null) {
            const plate = this.dropZones.get(this.highlightedStep)
            if (plate) {
                const mat = plate.material as THREE.MeshStandardMaterial
                mat.color.set(0xd4d4cf)  // original
                if (plate.userData.isFilled) {
                    mat.opacity = 0
                } else {
                    mat.opacity = 0.55
                }
            }
            this.highlightedStep = null
        }
    }
}
