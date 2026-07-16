'use client'

/**
 * Prémium WebGL „családi galaxis" (2026-07-14).
 *
 * A korábbi Cytoscape 2D-canvas helyett three.js + additív csillag-shaderek +
 * UnrealBloom: mély obszidián tér, a háztartások ragyogó arany „napok", a
 * személyek türkiz/rózsa csillagok, a kapcsolatok halvány fénylő fonalak.
 * A determinisztikus elrendezést a meglévő createFamilyGalaxyPositions adja,
 * így a vizuál csere adat- és szerver-oldali változtatás nélkül történik.
 *
 * A jelenetet egy keret-független GalaxyScene osztály kezeli; a React-komponens
 * csak példányosítja, a propokat metódusokra képezi, és imperatív ref-API-t
 * ad (focus/fit/zoomBy/reset) a körülvevő vezérlőknek.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

import {
  createFamilyGalaxyPositions,
  type FamilyGalaxyDensity,
} from '@/lib/members/family-galaxy-layout'
import type { FamilyGraphData, FamilyGraphNode } from '@/lib/members/family-graph-types'

export interface GalaxyFilters {
  families: boolean
  people: boolean
  deceased: boolean
  membershipEdges: boolean
  relationshipEdges: boolean
}

export interface FamilyGalaxyHandle {
  focus: (nodeId: string) => void
  fit: () => void
  zoomBy: (factor: number) => void
  reset: () => void
}

interface FamilyGalaxyCanvasProps {
  data: FamilyGraphData
  density: FamilyGalaxyDensity
  filters: GalaxyFilters
  /** Ha nem null: csak ezek a csomópontok „élők", a többi elhalványul (lokális nézet). */
  highlightIds: Set<string> | null
  interactive: boolean
  reducedMotion: boolean
  onSelectNode: (nodeId: string | null) => void
  onHoverNode?: (node: FamilyGraphNode | null, clientX: number, clientY: number) => void
}

// ── Paletta ────────────────────────────────────────────────────────────────
const COL = {
  family: new THREE.Color('#ffcf7a'),
  male: new THREE.Color('#6fe4d6'),
  female: new THREE.Color('#ff9fc0'),
  unknown: new THREE.Color('#b9c2ff'),
  deceased: new THREE.Color('#7f93a6'),
  edgeMembership: new THREE.Color('#3a7d76'),
  edgeRelationship: new THREE.Color('#8fe9d6'),
  edgeSpouse: new THREE.Color('#ffd9a8'),
}

function colorFor(node: FamilyGraphNode): THREE.Color {
  if (node.kind === 'family') return COL.family
  if (node.deceased) return COL.deceased
  if (node.gender === 'male') return COL.male
  if (node.gender === 'female') return COL.female
  return COL.unknown
}

function stableHash(value: string) {
  let hash = 2_166_136_261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}
function stableUnit(value: string) {
  return stableHash(value) / 4_294_967_295
}

// ── Shaderek ────────────────────────────────────────────────────────────────
const NEBULA_FRAG = `
  varying vec2 vUv; uniform float uTime; uniform float uAspect;
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
  float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){v+=a*noise(p);p*=2.03;a*=0.5;} return v; }
  void main(){
    vec2 uv=(vUv-0.5); uv.x*=uAspect;
    float r=length(uv);
    vec2 q=uv*2.2; float t=uTime*0.012;
    float n=fbm(q+vec2(t,-t*0.6)); float n2=fbm(q*1.7-vec2(t*0.4,t));
    vec3 c1=vec3(0.006,0.020,0.027); vec3 c2=vec3(0.017,0.011,0.030);
    vec3 col=mix(c1,c2,n2);
    col+=vec3(0.014,0.052,0.058)*pow(n,2.5)*0.65;
    col+=vec3(0.055,0.026,0.072)*pow(n2,3.0)*0.40;
    col+=vec3(0.022,0.052,0.054)*smoothstep(0.5,0.0,r)*0.5;
    col*=smoothstep(1.1,0.06,r);
    gl_FragColor=vec4(col,1.0);
  }`

const STAR_VERT = `
  attribute float aRnd; varying float vT; uniform float uSize;
  void main(){ vT=aRnd; vec4 mv=modelViewMatrix*vec4(position,1.0);
    gl_PointSize=uSize*(300.0/-mv.z)*(0.6+0.4*aRnd); gl_Position=projectionMatrix*mv; }`
const STAR_FRAG = `
  varying float vT; uniform float uTime; uniform float uBoost;
  void main(){ float d=length(gl_PointCoord-0.5)*2.0; if(d>1.0)discard;
    float tw=0.65+0.35*sin(uTime*1.5+vT*30.0);
    float al=pow(1.0-d,1.8)*vT*tw; vec3 c=mix(vec3(0.6,0.8,1.0),vec3(1.0,0.95,0.85),vT)*uBoost;
    gl_FragColor=vec4(c,al); }`

const NODE_VERT = `
  attribute vec3 aColor; attribute float aSize; attribute float aSeed; attribute float aCore; attribute float aDim;
  varying vec3 vColor; varying float vCore; varying float vFade;
  uniform float uTime; uniform float uScale;
  void main(){
    vColor=aColor; vCore=aCore;
    vec4 mv=modelViewMatrix*vec4(position,1.0);
    float tw=0.85+0.15*sin(uTime*1.6+aSeed*40.0);
    float sz=aSize*uScale*tw*(1300.0/-mv.z);
    vFade=aDim;
    gl_PointSize=clamp(sz,1.0,1400.0);
    gl_Position=projectionMatrix*mv;
  }`
const NODE_FRAG = `
  varying vec3 vColor; varying float vCore; varying float vFade;
  void main(){
    float d=length(gl_PointCoord-0.5)*2.0; if(d>1.0)discard;
    float g=exp(-d*d*3.1);
    float core=exp(-d*d*17.0);
    vec3 col=vColor*g*0.80 + vColor*core*1.75 + vec3(core)*0.85*vCore;
    float al=clamp(g*0.62+core,0.0,1.0)*vFade;
    gl_FragColor=vec4(col,al);
  }`

const HALO_VERT = `
  attribute vec3 aColor; attribute float aSize; attribute float aSeed; attribute float aDim;
  varying vec3 vColor; varying float vFade; uniform float uTime; uniform float uScale;
  void main(){ vColor=aColor; vFade=aDim; vec4 mv=modelViewMatrix*vec4(position,1.0);
    float pulse=0.9+0.1*sin(uTime*0.9+aSeed*20.0);
    gl_PointSize=clamp(aSize*uScale*2.5*pulse*(1300.0/-mv.z),1.0,1600.0); gl_Position=projectionMatrix*mv; }`
const HALO_FRAG = `
  varying vec3 vColor; varying float vFade; void main(){ float d=length(gl_PointCoord-0.5)*2.0; if(d>1.0)discard;
    float g=pow(1.0-d,3.6); gl_FragColor=vec4(vColor*g,g*0.20*vFade); }`

const OUT_SHADER = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uAberration: { value: 0.0015 }, uVignette: { value: 0.85 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uAberration; uniform float uVignette;
    void main(){ vec2 d=vUv-0.5; float r=dot(d,d); vec2 off=d*uAberration;
      vec3 col; col.r=texture2D(tDiffuse,vUv+off).r; col.g=texture2D(tDiffuse,vUv).g; col.b=texture2D(tDiffuse,vUv-off).b;
      col*=mix(1.0,1.0-r*1.15,uVignette); gl_FragColor=vec4(col,1.0); }`,
}

interface NodeEntry {
  node: FamilyGraphNode
  x: number
  y: number
  z: number
}

// ── Jelenet-kezelő (keret-független) ────────────────────────────────────────
class GalaxyScene {
  private container: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private composer: EffectComposer
  private bloom: UnrealBloomPass
  private nebula: THREE.Mesh
  private starsFar: THREE.Points
  private starsNear: THREE.Points
  private nodeGroup: THREE.Group | null = null
  private nodePoints: THREE.Points | null = null

  private nodeEntries: NodeEntry[] = []
  private indexById = new Map<string, number>()
  private target = new THREE.Vector2(0, 0)
  private camDist = 660
  private entrance = 0
  private motion = true
  private interactive = true
  private raf = 0
  private lastNow = 0
  private disposed = false

  private ray = new THREE.Raycaster()
  private mouse = new THREE.Vector2(-2, -2)
  private hoverIndex = -1
  private panning = false
  private lastX = 0
  private lastY = 0
  private moved = 0
  private pinchDist = 0

  private data: FamilyGraphData
  private density: FamilyGalaxyDensity
  private filters: GalaxyFilters
  private highlightIds: Set<string> | null = null

  onSelect: (id: string | null) => void = () => {}
  onHover: (node: FamilyGraphNode | null, x: number, y: number) => void = () => {}

  constructor(
    container: HTMLElement,
    opts: {
      data: FamilyGraphData
      density: FamilyGalaxyDensity
      filters: GalaxyFilters
      reducedMotion: boolean
      interactive: boolean
    },
  ) {
    this.container = container
    this.data = opts.data
    this.density = opts.density
    this.filters = opts.filters
    this.motion = !opts.reducedMotion
    this.interactive = opts.interactive

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setClearColor(0x03080c, 1)
    this.renderer.setPixelRatio(dpr)
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.touchAction = 'none'

    this.scene.fog = new THREE.FogExp2(0x03080c, 0.00035)
    this.camera = new THREE.PerspectiveCamera(55, 1, 1, 6000)
    this.camera.position.set(0, 0, this.camDist)

    this.nebula = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false, depthWrite: false,
        uniforms: { uTime: { value: 0 }, uAspect: { value: 1 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.999,1.0); }`,
        fragmentShader: NEBULA_FRAG,
      }),
    )
    this.nebula.frustumCulled = false
    this.nebula.renderOrder = -10
    this.scene.add(this.nebula)

    this.starsFar = this.makeStarfield(1200, 2600, 1.4, 0.5, -1400)
    this.starsNear = this.makeStarfield(520, 1800, 2.2, 0.8, -700)
    this.scene.add(this.starsFar)
    this.scene.add(this.starsNear)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.95, 0.72, 0.18)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new ShaderPass(OUT_SHADER))

    this.resize()
    this.buildGraph()

    this.attachEvents()
    this.lastNow = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  private makeStarfield(count: number, spread: number, size: number, boost: number, z: number) {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(count * 3)
    const a = new Float32Array(count)
    for (let i = 0; i < count; i += 1) {
      pos[i * 3] = (stableUnit(`sf${z}${i}x`) * 2 - 1) * spread
      pos[i * 3 + 1] = (stableUnit(`sf${z}${i}y`) * 2 - 1) * spread
      pos[i * 3 + 2] = z - stableUnit(`sf${z}${i}z`) * spread * 0.4
      a[i] = 0.25 + stableUnit(`sf${z}${i}a`) * 0.75
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aRnd', new THREE.BufferAttribute(a, 1))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSize: { value: size * dpr }, uBoost: { value: boost } },
      vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
    })
    const p = new THREE.Points(g, m)
    p.frustumCulled = false
    return p
  }

  private disposeGroup() {
    if (!this.nodeGroup) return
    this.scene.remove(this.nodeGroup)
    this.nodeGroup.traverse((o) => {
      const mesh = o as THREE.Points | THREE.LineSegments
      if (mesh.geometry) mesh.geometry.dispose()
    })
    this.nodeGroup = null
    this.nodePoints = null
  }

  buildGraph() {
    this.disposeGroup()
    this.nodeGroup = new THREE.Group()
    this.scene.add(this.nodeGroup)

    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight
    const positions = createFamilyGalaxyPositions(this.data, {
      density: this.density,
      width: w * 1.4,
      height: h * 1.4,
    })

    // relationship-degree for brightness
    const degree = new Map<string, number>()
    for (const e of this.data.edges) {
      if (e.kind === 'membership') continue
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
    }

    const visibleNode = (n: FamilyGraphNode) => {
      if (n.kind === 'family') return this.filters.families
      if (n.deceased && !this.filters.deceased) return false
      return this.filters.people
    }

    const entries: NodeEntry[] = []
    for (const n of this.data.nodes) {
      if (!visibleNode(n)) continue
      const p = positions[n.id]
      if (!p) continue
      const z = (stableUnit(`${n.id}:z`) - 0.5) * 140
      entries.push({ node: n, x: p.x, y: p.y, z })
    }
    this.nodeEntries = entries
    this.indexById = new Map(entries.map((e, i) => [e.node.id, i]))

    const N = entries.length
    const posArr = new Float32Array(N * 3)
    const colArr = new Float32Array(N * 3)
    const sizeArr = new Float32Array(N)
    const seedArr = new Float32Array(N)
    const coreArr = new Float32Array(N)
    const dimArr = new Float32Array(N)

    const famPos: number[] = []
    const famCol: number[] = []
    const famSize: number[] = []
    const famSeed: number[] = []
    const famDim: number[] = []

    entries.forEach((e, i) => {
      const n = e.node
      posArr[i * 3] = e.x; posArr[i * 3 + 1] = e.y; posArr[i * 3 + 2] = e.z
      const c = colorFor(n)
      colArr[i * 3] = c.r; colArr[i * 3 + 1] = c.g; colArr[i * 3 + 2] = c.b
      if (n.kind === 'family') {
        sizeArr[i] = 7.0 + Math.min(n.memberCount, 14) * 0.5
        coreArr[i] = 1.0
      } else {
        const deg = degree.get(n.id) ?? 0
        sizeArr[i] = (n.deceased ? 3.0 : 4.2) + Math.min(deg, 6) * 0.7
        coreArr[i] = n.deceased ? 0.2 : 0.8
      }
      seedArr[i] = stableUnit(n.id)
      dimArr[i] = this.nodeDim(n)

      if (n.kind === 'family') {
        famPos.push(e.x, e.y, e.z)
        famCol.push(c.r, c.g, c.b)
        famSize.push(7.5 + Math.min(n.memberCount, 14) * 0.6)
        famSeed.push(stableUnit(n.id))
        famDim.push(dimArr[i])
      }
    })

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(colArr, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(sizeArr, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seedArr, 1))
    g.setAttribute('aCore', new THREE.BufferAttribute(coreArr, 1))
    g.setAttribute('aDim', new THREE.BufferAttribute(dimArr, 1))
    const nodeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: this.entrance } },
      vertexShader: NODE_VERT, fragmentShader: NODE_FRAG,
    })
    this.nodePoints = new THREE.Points(g, nodeMat)
    this.nodePoints.frustumCulled = false
    this.nodeGroup.add(this.nodePoints)

    // family halo layer
    const hg = new THREE.BufferGeometry()
    hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(famPos), 3))
    hg.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(famCol), 3))
    hg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(famSize), 1))
    hg.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(famSeed), 1))
    hg.setAttribute('aDim', new THREE.BufferAttribute(new Float32Array(famDim), 1))
    const haloMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: this.entrance } },
      vertexShader: HALO_VERT, fragmentShader: HALO_FRAG,
    })
    const halo = new THREE.Points(hg, haloMat)
    halo.frustumCulled = false
    halo.renderOrder = -1
    this.nodeGroup.add(halo)

    // edges
    this.buildEdges(positions, visibleNode)
  }

  private buildEdges(
    positions: Record<string, { x: number; y: number }>,
    visibleNode: (n: FamilyGraphNode) => boolean,
  ) {
    if (!this.nodeGroup) return
    const nodeById = new Map(this.data.nodes.map((n) => [n.id, n]))
    const segs: number[] = []
    const cols: number[] = []
    for (const e of this.data.edges) {
      if (e.kind === 'sibling') continue
      const isMembership = e.kind === 'membership'
      if (isMembership && !this.filters.membershipEdges) continue
      if (!isMembership && !this.filters.relationshipEdges) continue
      const a = positions[e.source]
      const b = positions[e.target]
      if (!a || !b) continue
      const sn = nodeById.get(e.source)
      const tn = nodeById.get(e.target)
      if (sn && !visibleNode(sn)) continue
      if (tn && !visibleNode(tn)) continue
      const za = (stableUnit(`${e.source}:z`) - 0.5) * 140
      const zb = (stableUnit(`${e.target}:z`) - 0.5) * 140
      let c = COL.edgeRelationship
      let w = 0.22
      if (isMembership) { c = COL.edgeMembership; w = 0.12 } else if (e.kind === 'spouse') { c = COL.edgeSpouse; w = 0.5 } else if (e.kind === 'parent-child') { c = COL.edgeRelationship; w = 0.17 }
      const dim = (this.edgeDim(e.source) + this.edgeDim(e.target)) * 0.5
      const ww = w * dim
      segs.push(a.x, a.y, za, b.x, b.y, zb)
      cols.push(c.r * ww, c.g * ww, c.b * ww, c.r * ww, c.g * ww, c.b * ww)
    }
    const eg = new THREE.BufferGeometry()
    eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs), 3))
    eg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3))
    const edges = new THREE.LineSegments(
      eg,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    edges.frustumCulled = false
    edges.renderOrder = -2
    this.nodeGroup.add(edges)
  }

  private nodeDim(n: FamilyGraphNode) {
    if (!this.highlightIds) return 1
    return this.highlightIds.has(n.id) ? 1.25 : 0.16
  }
  private edgeDim(id: string) {
    if (!this.highlightIds) return 1
    return this.highlightIds.has(id) ? 1.1 : 0.14
  }

  setData(data: FamilyGraphData, density: FamilyGalaxyDensity, filters: GalaxyFilters) {
    const densityChanged = density !== this.density
    this.data = data
    this.density = density
    this.filters = filters
    if (densityChanged) this.entrance = Math.min(this.entrance, 0.6)
    this.buildGraph()
  }

  setHighlight(ids: Set<string> | null) {
    this.highlightIds = ids
    // csak a dim-attribútumokat frissítjük — nem építünk újra
    if (this.nodePoints) {
      const attr = this.nodePoints.geometry.getAttribute('aDim') as THREE.BufferAttribute
      this.nodeEntries.forEach((e, i) => attr.setX(i, this.nodeDim(e.node)))
      attr.needsUpdate = true
    }
    // az élek dimje újraépítést igényel (vertex-szín) — olcsóbb teljes rebuild
    this.buildGraph()
  }

  setMotion(on: boolean) { this.motion = on }
  setInteractive(on: boolean) { this.interactive = on }

  focus(nodeId: string) {
    const idx = this.indexById.get(nodeId)
    if (idx == null) return
    const e = this.nodeEntries[idx]
    this.target.set(e.x, e.y)
    this.camDist = Math.min(this.camDist, 360)
    this.onSelect(nodeId)
  }
  fit() { this.target.set(0, 0); this.camDist = 660 }
  reset() { this.target.set(0, 0); this.camDist = 660 }
  zoomBy(factor: number) { this.camDist = THREE.MathUtils.clamp(this.camDist / factor, 220, 2600) }

  resize() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
    this.bloom.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    ;(this.nebula.material as THREE.ShaderMaterial).uniforms.uAspect.value = w / h
  }

  private attachEvents() {
    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.onDown)
    el.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
    el.addEventListener('wheel', this.onWheel, { passive: false })
    el.addEventListener('touchmove', this.onTouchMove, { passive: false })
    el.addEventListener('touchend', this.onTouchEnd)
  }
  private detachEvents() {
    const el = this.renderer.domElement
    el.removeEventListener('pointerdown', this.onDown)
    el.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    el.removeEventListener('wheel', this.onWheel)
    el.removeEventListener('touchmove', this.onTouchMove)
    el.removeEventListener('touchend', this.onTouchEnd)
  }

  private onDown = (e: PointerEvent) => {
    if (!this.interactive) return
    this.panning = true; this.moved = 0; this.lastX = e.clientX; this.lastY = e.clientY
    try { this.renderer.domElement.setPointerCapture(e.pointerId) } catch { /* noop */ }
  }
  private onMove = (e: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    if (this.panning && this.interactive) {
      const dx = e.clientX - this.lastX
      const dy = e.clientY - this.lastY
      this.moved += Math.abs(dx) + Math.abs(dy)
      this.lastX = e.clientX; this.lastY = e.clientY
      const k = this.camDist / 700
      this.target.x -= dx * k; this.target.y += dy * k
    }
  }
  private onUp = () => {
    if (this.panning && this.moved < 6 && this.interactive) this.pick()
    this.panning = false
  }
  private onWheel = (e: WheelEvent) => {
    if (!this.interactive) return
    e.preventDefault()
    this.camDist = THREE.MathUtils.clamp(this.camDist * (1 + Math.sign(e.deltaY) * 0.12), 220, 2600)
  }
  private onTouchMove = (e: TouchEvent) => {
    if (!this.interactive || e.touches.length !== 2) return
    const a = e.touches[0]; const b = e.touches[1]
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    if (this.pinchDist) this.camDist = THREE.MathUtils.clamp(this.camDist * (this.pinchDist / d), 220, 2600)
    this.pinchDist = d
  }
  private onTouchEnd = () => { this.pinchDist = 0 }

  private pick() {
    if (!this.nodePoints) return
    this.ray.setFromCamera(this.mouse, this.camera)
    this.ray.params.Points!.threshold = Math.max(8, this.camDist / 44)
    const hits = this.ray.intersectObject(this.nodePoints, false)
    if (hits.length && hits[0].index != null) {
      const entry = this.nodeEntries[hits[0].index]
      if (entry) this.onSelect(entry.node.id)
    } else {
      this.onSelect(null)
    }
  }

  private updateHover() {
    if (!this.nodePoints || !this.interactive) return
    this.ray.setFromCamera(this.mouse, this.camera)
    this.ray.params.Points!.threshold = Math.max(8, this.camDist / 44)
    const hits = this.ray.intersectObject(this.nodePoints, false)
    const idx = hits.length && hits[0].index != null ? hits[0].index : -1
    if (idx !== this.hoverIndex) {
      this.hoverIndex = idx
      const entry = idx >= 0 ? this.nodeEntries[idx] : null
      this.renderer.domElement.style.cursor = entry ? 'pointer' : 'grab'
      if (entry) {
        const v = new THREE.Vector3(entry.x, entry.y, entry.z).project(this.camera)
        const rect = this.renderer.domElement.getBoundingClientRect()
        const cx = (v.x * 0.5 + 0.5) * rect.width
        const cy = (-v.y * 0.5 + 0.5) * rect.height
        this.onHover(entry.node, cx, cy)
      } else {
        this.onHover(null, 0, 0)
      }
    }
  }

  private loop = (now: number) => {
    if (this.disposed) return
    const dt = Math.min(0.05, (now - this.lastNow) / 1000)
    this.lastNow = now
    const t = now / 1000

    this.entrance = Math.min(1, this.entrance + dt * 0.6)
    const ease = 1 - Math.pow(1 - this.entrance, 3)
    const dolly = this.camDist * (1 + (1 - ease) * 1.4)
    this.camera.position.x += (this.target.x - this.camera.position.x) * 0.12
    this.camera.position.y += (this.target.y - this.camera.position.y) * 0.12
    this.camera.position.z += (dolly - this.camera.position.z) * 0.12
    this.camera.lookAt(this.target.x, this.target.y, 0)

    if (this.motion && this.nodeGroup) this.nodeGroup.rotation.z = t * 0.018
    this.starsFar.position.set(this.camera.position.x * 0.6, this.camera.position.y * 0.6, 0)
    this.starsNear.position.set(this.camera.position.x * 0.35, this.camera.position.y * 0.35, 0)

    const gt = this.motion ? t : 0
    ;(this.nebula.material as THREE.ShaderMaterial).uniforms.uTime.value = gt
    ;(this.starsFar.material as THREE.ShaderMaterial).uniforms.uTime.value = gt
    ;(this.starsNear.material as THREE.ShaderMaterial).uniforms.uTime.value = gt
    if (this.nodeGroup) {
      this.nodeGroup.children.forEach((child) => {
        const mat = (child as THREE.Points).material as THREE.ShaderMaterial | undefined
        if (mat?.uniforms?.uTime) mat.uniforms.uTime.value = gt
        if (mat?.uniforms?.uScale) mat.uniforms.uScale.value = ease
      })
    }

    this.updateHover()
    this.composer.render()
    this.raf = requestAnimationFrame(this.loop)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.detachEvents()
    this.disposeGroup()
    this.starsFar.geometry.dispose()
    this.starsNear.geometry.dispose()
    ;(this.nebula.geometry as THREE.BufferGeometry).dispose()
    this.composer.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}

// ── React-komponens ─────────────────────────────────────────────────────────
export const FamilyGalaxyCanvas = forwardRef<FamilyGalaxyHandle, FamilyGalaxyCanvasProps>(
  function FamilyGalaxyCanvas(props, ref) {
    const {
      data, density, filters, highlightIds, interactive, reducedMotion, onSelectNode, onHoverNode,
    } = props
    const containerRef = useRef<HTMLDivElement | null>(null)
    const sceneRef = useRef<GalaxyScene | null>(null)

    // Kézikönyves ref-API (a körülvevő vezérlőknek)
    useImperativeHandle(ref, () => ({
      focus: (id: string) => sceneRef.current?.focus(id),
      fit: () => sceneRef.current?.fit(),
      zoomBy: (f: number) => sceneRef.current?.zoomBy(f),
      reset: () => sceneRef.current?.reset(),
    }), [])

    // Init (egyszer) — az adat-/szűrő-frissítéseket külön effektek kezelik
    useEffect(() => {
      const container = containerRef.current
      if (!container) return
      let scene: GalaxyScene | null = null
      try {
        scene = new GalaxyScene(container, {
          data, density, filters, reducedMotion, interactive,
        })
        scene.onSelect = (id) => onSelectNode(id)
        scene.onHover = (node, x, y) => onHoverNode?.(node, x, y)
        sceneRef.current = scene
      } catch (err) {
        // WebGL nem elérhető / kontextus-hiba — csendes fallback (a szülő üres teret mutat)
        console.error('[family-galaxy] WebGL init failed', err)
      }

      const ro = new ResizeObserver(() => sceneRef.current?.resize())
      ro.observe(container)
      return () => {
        ro.disconnect()
        scene?.dispose()
        sceneRef.current = null
      }
      // szándékosan csak mount-kor fut; a props-változásokat a lenti effektek viszik be
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => { sceneRef.current?.setData(data, density, filters) }, [data, density, filters])
    useEffect(() => { sceneRef.current?.setHighlight(highlightIds) }, [highlightIds])
    useEffect(() => { sceneRef.current?.setMotion(!reducedMotion) }, [reducedMotion])
    useEffect(() => { sceneRef.current?.setInteractive(interactive) }, [interactive])

    return <div ref={containerRef} className="absolute inset-0 size-full" />
  },
)
