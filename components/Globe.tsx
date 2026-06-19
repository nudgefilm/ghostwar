'use client'

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const RADIUS = 1
const MAX_MISSILES = 20
const PATH_COUNT = 100
const TRAIL_SIZE = 25

function latLngToVec3(lat: number, lng: number, r = RADIUS): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -(r * Math.sin(phi) * Math.cos(theta)),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  )
}

function getMissilePoint(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  t: number,
  arcHeight = 0.18,
): THREE.Vector3 {
  const startNorm = latLngToVec3(fromLat, fromLng).normalize()
  const endNorm   = latLngToVec3(toLat, toLng).normalize()
  const slerped = startNorm.clone().lerp(endNorm, t)
  if (slerped.lengthSq() < 1e-8) {
    return startNorm.clone().cross(new THREE.Vector3(0, 1, 0)).normalize()
      .multiplyScalar(RADIUS + arcHeight)
  }
  slerped.normalize()
  const arc = Math.sin(Math.PI * t) * arcHeight
  return slerped.multiplyScalar(RADIUS + arc)
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

interface MissileState {
  pathPoints: THREE.Vector3[]
  flightMs: number
  startTime: number
  instanceId: number
  type: 'missile' | 'nuke'
  active: boolean
  trailHistory: THREE.Vector3[]
  trailLine: THREE.Line
  trailGeo: THREE.BufferGeometry
  trailMat: THREE.LineBasicMaterial
  trailPositions: Float32Array
  trailColors: Float32Array
  impactPoint: THREE.Vector3
  missileId?: string
  targetCountry?: string
  launcherCountry?: string
  shieldTriggered: boolean
}

export interface GlobeHandle {
  flyTo: (lat: number, lng: number, duration?: number) => void
  launchMissile: (
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    quantity: number,
    type: 'missile' | 'nuke',
    duration?: number,
    missileId?: string,
    targetCountry?: string,
    launcherCountry?: string,
  ) => void
  triggerRedExplosionAt: (lat: number, lng: number, type?: 'missile' | 'nuke') => void
}

type AnimFn = () => boolean

interface GeoGeometry {
  type: string
  coordinates: number[][][] | number[][][][]
}

interface GeoFeature {
  geometry: GeoGeometry
}

export interface ImpactData {
  missileId?: string
  targetCountry?: string
  launcherCountry?: string
  type: 'missile' | 'nuke'
}

interface GlobeProps {
  onImpact?: (data: ImpactData) => void
  playerCountry?: string
  shieldActive?: boolean
  warGlow?: { lat: number; lng: number; color: string } | null
}

const Globe = forwardRef<GlobeHandle, GlobeProps>(({ onImpact, playerCountry, shieldActive, warGlow }, ref) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const animsRef = useRef<AnimFn[]>([])
  const onImpactRef = useRef(onImpact)
  useEffect(() => { onImpactRef.current = onImpact }, [onImpact])
  const playerCountryRef = useRef(playerCountry)
  useEffect(() => { playerCountryRef.current = playerCountry }, [playerCountry])
  const shieldActiveRef = useRef(shieldActive ?? false)
  useEffect(() => { shieldActiveRef.current = shieldActive ?? false }, [shieldActive])
  const warGlowMeshRef = useRef<THREE.Mesh | null>(null)

  // War glow ring — pulsing ring over declared-war target country
  useEffect(() => {
    const scene = sceneRef.current
    // Remove previous ring
    if (warGlowMeshRef.current) {
      scene?.remove(warGlowMeshRef.current)
      warGlowMeshRef.current.geometry.dispose()
      ;(warGlowMeshRef.current.material as THREE.Material).dispose()
      warGlowMeshRef.current = null
    }
    if (!warGlow || !scene) return

    const pos = latLngToVec3(warGlow.lat, warGlow.lng, RADIUS * 1.005)
    const geo = new THREE.RingGeometry(0.04, 0.07, 32)
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(warGlow.color),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const ring = new THREE.Mesh(geo, mat)
    ring.position.copy(pos)
    ring.lookAt(new THREE.Vector3(0, 0, 0))
    scene.add(ring)
    warGlowMeshRef.current = ring

    let running = true
    const startTime = performance.now()
    animsRef.current.push(() => {
      if (!running) return false
      const t = ((performance.now() - startTime) % 1500) / 1500
      mat.opacity = Math.sin(t * Math.PI) * 0.85
      return true
    })

    return () => {
      running = false
      if (warGlowMeshRef.current) {
        scene.remove(warGlowMeshRef.current)
        warGlowMeshRef.current.geometry.dispose()
        ;(warGlowMeshRef.current.material as THREE.Material).dispose()
        warGlowMeshRef.current = null
      }
    }
  }, [warGlow])

  const missileInstancesRef = useRef<THREE.InstancedMesh | null>(null)
  const missileCoreInstancesRef = useRef<THREE.InstancedMesh | null>(null)
  const activeMissilesRef = useRef<MissileState[]>([])
  const freeSlotsRef = useRef<number[]>([])
  const redExplosionRef = useRef<((pos: THREE.Vector3, type: 'missile' | 'nuke') => void) | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const w = mount.clientWidth
    const h = mount.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100)
    camera.position.z = 2.8
    cameraRef.current = camera

    // Lighting
    scene.add(new THREE.AmbientLight(0x111111))
    const pl1 = new THREE.PointLight(0x00ff88, 0.5)
    pl1.position.set(-2, 2, 1)
    scene.add(pl1)
    const pl2 = new THREE.PointLight(0xff2233, 0.3)
    pl2.position.set(2, -2, -1)
    scene.add(pl2)

    // Atmosphere glow
    scene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(RADIUS * 1.02, 32, 32),
        new THREE.MeshBasicMaterial({
          color: 0x00ff88,
          transparent: true,
          opacity: 0.06,
          side: THREE.BackSide,
        }),
      ),
    )

    // Base sphere
    scene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(RADIUS, 64, 64),
        new THREE.MeshPhongMaterial({
          color: 0x002b15,
          opacity: 0.65,
          transparent: true,
          shininess: 30,
        }),
      ),
    )

    // Wireframe overlay
    scene.add(
      new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.SphereGeometry(RADIUS, 32, 32)),
        new THREE.LineBasicMaterial({ color: 0x1a4a2a, opacity: 0.44, transparent: true }),
      ),
    )

    // Graticule — lat/lon grid every 30°
    const gratMat = new THREE.LineBasicMaterial({ color: 0x003300, opacity: 0, transparent: true })
    ;[-60, -30, 0, 30, 60].forEach(lat => {
      const pts = Array.from({ length: 65 }, (_, i) =>
        latLngToVec3(lat, (i / 64) * 360 - 180, RADIUS + 0.002),
      )
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat))
    })
    ;[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180].forEach(lng => {
      const pts = Array.from({ length: 33 }, (_, i) =>
        latLngToVec3((i / 32) * 180 - 90, lng, RADIUS + 0.002),
      )
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat))
    })

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.3
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.minDistance = 1.5
    controls.maxDistance = 5
    controls.target.set(0, 0.05, 0)
    controlsRef.current = controls

    // GeoJSON continent lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff88, opacity: 0.73, transparent: true })
    fetch('/ne_110m_land.json')
      .then(r => r.json())
      .then((data: { features: GeoFeature[] }) => {
        const addRing = (ring: number[][]) => {
          if (ring.length < 2) return
          const pts = ring.map(([lng, lat]) => latLngToVec3(lat, lng, RADIUS + 0.001))
          scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat))
        }
        for (const { geometry } of data.features) {
          if (geometry.type === 'Polygon') {
            ;(geometry.coordinates as number[][][]).forEach(addRing)
          } else if (geometry.type === 'MultiPolygon') {
            ;(geometry.coordinates as number[][][][]).forEach(poly => poly.forEach(addRing))
          }
        }
      })
      .catch(() => {})

    // ── InstancedMesh for all missiles ──────────────────────────────────
    // Outer body: thin sleek bar
    const missileGeo = new THREE.PlaneGeometry(0.003, 0.015)
    const missileMat = new THREE.MeshBasicMaterial({
      color: 0xFF6600,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const missileInstances = new THREE.InstancedMesh(missileGeo, missileMat, MAX_MISSILES)
    missileInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    const zeroScaleM = new THREE.Matrix4().makeScale(0, 0, 0)
    freeSlotsRef.current = []
    for (let si = 0; si < MAX_MISSILES; si++) {
      missileInstances.setMatrixAt(si, zeroScaleM)
      freeSlotsRef.current.push(si)
    }
    missileInstances.instanceMatrix.needsUpdate = true
    scene.add(missileInstances)
    missileInstancesRef.current = missileInstances

    // White-hot core: narrower, shorter bar layered on top
    const coreGeo = new THREE.PlaneGeometry(0.001, 0.007)
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const coreInstances = new THREE.InstancedMesh(coreGeo, coreMat, MAX_MISSILES)
    coreInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    for (let si = 0; si < MAX_MISSILES; si++) {
      coreInstances.setMatrixAt(si, zeroScaleM)
    }
    coreInstances.instanceMatrix.needsUpdate = true
    scene.add(coreInstances)
    missileCoreInstancesRef.current = coreInstances

    // ── Green shield pre-arrival effect ─────────────────────────────────
    const doGreenShieldAt = (ip: THREE.Vector3) => {
      const impactNorm = ip.clone().normalize()
      const T = 1200  // total 1.2s
      const BLINKS = 3
      const BLINK_MS = T / BLINKS  // 400ms per blink

      const rGeo = new THREE.RingGeometry(0.03, 0.045, 32)
      const rMat = new THREE.MeshBasicMaterial({
        color: 0x00FF88, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false,
      })
      const ring = new THREE.Mesh(rGeo, rMat)
      ring.position.copy(ip)
      ring.lookAt(new THREE.Vector3(0, 0, 0))
      scene.add(ring)

      const pGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 8, 1, true)
      pGeo.translate(0, 0.5, 0)
      const pMat = new THREE.MeshBasicMaterial({
        color: 0x00FF88, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false,
      })
      const pillar = new THREE.Mesh(pGeo, pMat)
      pillar.position.copy(ip)
      const upY = new THREE.Vector3(0, 1, 0)
      if (impactNorm.dot(upY) < -0.9999) {
        pillar.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
      } else {
        pillar.quaternion.setFromUnitVectors(upY, impactNorm)
      }
      pillar.scale.set(1, 0.001, 1)
      scene.add(pillar)

      const t0 = performance.now()
      const animShield = () => {
        const elapsed = performance.now() - t0
        const p = Math.min(elapsed / T, 1)

        // Ring: 3x blink — each 400ms cycle is fade-in (0→0.2s) then fade-out (0.2→0.4s)
        const phase = (elapsed % BLINK_MS) / BLINK_MS  // 0→1 within each blink cycle
        rMat.opacity = phase < 0.5 ? phase * 2 : (1 - phase) * 2

        // Pillar: grows to full height in first half, fades out over full duration
        pillar.scale.y = Math.max(0.001, Math.min(p * 2, 1) * 0.3)
        pMat.opacity = 0.6 * (1 - p)

        if (p < 1) {
          requestAnimationFrame(animShield)
        } else {
          scene.remove(ring); rGeo.dispose(); rMat.dispose()
          scene.remove(pillar); pGeo.dispose(); pMat.dispose()
        }
      }
      requestAnimationFrame(animShield)
    }

    // ── Explosion trigger ────────────────────────────────────────────────
    const debrisColors = [0xFF4400, 0xFF6600, 0xFF8800, 0xFFCC00, 0xFF2233]

    const doRedExplosionVisualAt = (ip: THREE.Vector3, type: 'missile' | 'nuke') => {
      // Shared radial-gradient sprite texture — reused by all soft-particle effects this explosion
      const smokeCanvas = document.createElement('canvas')
      smokeCanvas.width = 64; smokeCanvas.height = 64
      const smokeCtx = smokeCanvas.getContext('2d')!
      const grad = smokeCtx.createRadialGradient(32, 32, 0, 32, 32, 32)
      grad.addColorStop(0,   'rgba(255,255,255,1)')
      grad.addColorStop(0.4, 'rgba(255,255,255,0.6)')
      grad.addColorStop(1,   'rgba(255,255,255,0)')
      smokeCtx.fillStyle = grad
      smokeCtx.fillRect(0, 0, 64, 64)
      const smokeTexture = new THREE.CanvasTexture(smokeCanvas)
      setTimeout(() => smokeTexture.dispose(), 9000)

      // Flash: intensity 5, 0.25s
      const flashLight = new THREE.PointLight(0xFF4400, 5, 1.5)
      flashLight.position.copy(ip)
      scene.add(flashLight)
      const flashT0 = performance.now()
      const animFlash = () => {
        const fp = Math.min((performance.now() - flashT0) / 250, 1)
        flashLight.intensity = 5 * (1 - fp)
        if (fp < 1) requestAnimationFrame(animFlash)
        else scene.remove(flashLight)
      }
      requestAnimationFrame(animFlash)

      // Warm glow: #FF8800, intensity 2, 0.5s
      const warmLight = new THREE.PointLight(0xFF8800, 2, 2)
      warmLight.position.copy(ip)
      scene.add(warmLight)
      const warmT0 = performance.now()
      const animWarm = () => {
        const wp = Math.min((performance.now() - warmT0) / 500, 1)
        warmLight.intensity = 2 * (1 - wp)
        if (wp < 1) requestAnimationFrame(animWarm)
        else scene.remove(warmLight)
      }
      requestAnimationFrame(animWarm)

      // Shockwave rings: thin, soft opacity curve, color shift
      const ringDefs: [number, number, number][] = [[0, 2, 400], [100, 3, 500], [200, 4, 600]]
      ringDefs.forEach(([delay, maxScale, dur]) => {
        setTimeout(() => {
          const rGeo = new THREE.RingGeometry(0.025, 0.033, 32)
          const rMat = new THREE.MeshBasicMaterial({ color: 0xFF6600, transparent: true, opacity: 0, side: THREE.DoubleSide })
          const ring = new THREE.Mesh(rGeo, rMat)
          ring.position.copy(ip)
          ring.lookAt(new THREE.Vector3(0, 0, 0))
          scene.add(ring)
          const rT0 = performance.now()
          const animRing = () => {
            const rp = Math.min((performance.now() - rT0) / dur, 1)
            ring.scale.setScalar(1 + rp * (maxScale - 1))
            rMat.opacity = rp < 0.3 ? 0.6 * (rp / 0.3) : 0.6 * (1 - (rp - 0.3) / 0.7)
            if (rp < 0.5) {
              rMat.color.lerpColors(new THREE.Color(0xFF6600), new THREE.Color(0xFF2233), rp * 2)
            } else {
              rMat.color.lerpColors(new THREE.Color(0xFF2233), new THREE.Color(0x550000), (rp - 0.5) * 2)
            }
            if (rp < 1) requestAnimationFrame(animRing)
            else { scene.remove(ring); rGeo.dispose(); rMat.dispose() }
          }
          requestAnimationFrame(animRing)
        }, delay)
      })

      // Debris: 35 sprite particles, varied size/speed, 20% white sparks, gravity
      type DebrisP = { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; vel: THREE.Vector3; life: number; maxLife: number; startSz: number; gravity: number }
      const debrisList: DebrisP[] = []
      for (let d = 0; d < 35; d++) {
        const sz = 0.004 + Math.random() * 0.014
        const isWhite = Math.random() < 0.2
        const color = isWhite ? 0xFFFFFF : debrisColors[Math.floor(Math.random() * debrisColors.length)]
        const isBright = isWhite || color === 0xFFCC00 || color === 0xFF8800
        const speedMult = 0.5 + Math.random() * 1.5
        const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
          .normalize().multiplyScalar((0.002 + Math.random() * 0.005) * speedMult)
        const mat = new THREE.SpriteMaterial({
          map: smokeTexture, color, transparent: true, opacity: 1,
          depthWrite: false, blending: isBright ? THREE.AdditiveBlending : THREE.NormalBlending,
        })
        const sprite = new THREE.Sprite(mat)
        const s0 = sz * 8
        sprite.scale.set(s0, s0, 1)
        sprite.position.copy(ip)
        scene.add(sprite)
        debrisList.push({ sprite, mat, vel, life: 0, maxLife: 40, startSz: sz, gravity: 0.001 })
      }
      const animDebris = () => {
        for (let d = debrisList.length - 1; d >= 0; d--) {
          const deb = debrisList[d]
          deb.life++
          deb.vel.y -= deb.gravity
          deb.sprite.position.add(deb.vel)
          const lr = deb.life / deb.maxLife
          const s = deb.startSz * (1 - lr) * 8
          deb.sprite.scale.set(s, s, 1)
          deb.mat.opacity = 1 - lr
          if (deb.life >= deb.maxLife) {
            scene.remove(deb.sprite)
            deb.mat.dispose()
            debrisList.splice(d, 1)
          }
        }
        if (debrisList.length > 0) requestAnimationFrame(animDebris)
      }
      requestAnimationFrame(animDebris)

      // Scorch mark: 8-12 dark spheres scattered on globe surface
      const impactNorm = ip.clone().normalize()
      const tUp = Math.abs(impactNorm.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
      const tan = impactNorm.clone().cross(tUp).normalize()
      const btan = impactNorm.clone().cross(tan).normalize()
      const scorchCount = 8 + Math.floor(Math.random() * 5)
      const scorchObjs: { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; baseOpacity: number }[] = []
      for (let s = 0; s < scorchCount; s++) {
        const sz = 0.008 + Math.random() * 0.012
        const baseOpacity = 0.5 + Math.random() * 0.3
        const color = Math.random() < 0.5 ? 0x331100 : 0x220000
        const mat = new THREE.SpriteMaterial({
          map: smokeTexture, color, transparent: true, opacity: baseOpacity,
          depthWrite: false, blending: THREE.NormalBlending,
        })
        const sprite = new THREE.Sprite(mat)
        const s0 = sz * 8
        sprite.scale.set(s0, s0, 1)
        const u = (Math.random() - 0.5) * 0.08
        const v = (Math.random() - 0.5) * 0.08
        const pos = impactNorm.clone().multiplyScalar(RADIUS)
          .add(tan.clone().multiplyScalar(u))
          .add(btan.clone().multiplyScalar(v))
          .normalize().multiplyScalar(RADIUS)
        sprite.position.copy(pos)
        scene.add(sprite)
        scorchObjs.push({ sprite, mat, baseOpacity })
      }
      const scorchT0 = performance.now()
      const animScorch = () => {
        const sp = Math.min((performance.now() - scorchT0) / 8000, 1)
        for (const s of scorchObjs) s.mat.opacity = s.baseOpacity * (1 - sp)
        if (sp < 1) requestAnimationFrame(animScorch)
        else { for (const s of scorchObjs) { scene.remove(s.sprite); s.mat.dispose() } }
      }
      requestAnimationFrame(animScorch)

      // ── Mushroom cloud (nuke only) ──────────────────────────────────────
      if (type === 'nuke') {
        // impactNorm / tan / btan computed above in the scorch section

        // Extra bright white flash: intensity 10, 0.15s
        const nukeFlash = new THREE.PointLight(0xFFFFFF, 10, 2)
        nukeFlash.position.copy(ip)
        scene.add(nukeFlash)
        const nukeFlashT0 = performance.now()
        const animNukeFlash = () => {
          const fp = Math.min((performance.now() - nukeFlashT0) / 150, 1)
          nukeFlash.intensity = 10 * (1 - fp)
          if (fp < 1) requestAnimationFrame(animNukeFlash)
          else scene.remove(nukeFlash)
        }
        requestAnimationFrame(animNukeFlash)

        // Stem: 35 Sprite particles rising along surface normal over 2s, staggered 35ms each
        type StemP = { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; delay: number; angle: number; spread: number; size: number; alive: boolean }
        const stemList: StemP[] = []
        const stemT0 = performance.now()
        for (let s = 0; s < 35; s++) {
          const size = 0.018 + Math.random() * 0.014
          const mat = new THREE.SpriteMaterial({
            map: smokeTexture,
            color: 0xFFAA00,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
          const sprite = new THREE.Sprite(mat)
          sprite.scale.set(size * 5, size * 5, 1)
          sprite.position.copy(ip)
          scene.add(sprite)
          stemList.push({ sprite, mat, delay: s * 35, angle: Math.random() * Math.PI * 2, spread: Math.random() * 0.04, size, alive: true })
        }
        const animStem = () => {
          const now = performance.now()
          let anyAlive = false
          for (const p of stemList) {
            if (!p.alive) continue
            const elapsed = now - stemT0 - p.delay
            if (elapsed < 0) { anyAlive = true; continue }
            if (elapsed >= 6000) {
              scene.remove(p.sprite); p.mat.dispose(); p.alive = false; continue
            }
            anyAlive = true
            const riseP = Math.min(elapsed / 2000, 1)
            const sz = (p.size + riseP * 0.008) * 5
            p.sprite.position.copy(
              ip.clone()
                .add(impactNorm.clone().multiplyScalar(riseP * 0.15))
                .add(tan.clone().multiplyScalar(Math.cos(p.angle) * p.spread * riseP))
                .add(btan.clone().multiplyScalar(Math.sin(p.angle) * p.spread * riseP)),
            )
            p.sprite.scale.set(sz, sz, 1)
            if (elapsed < 500) {
              if (p.mat.blending !== THREE.AdditiveBlending) { p.mat.blending = THREE.AdditiveBlending; p.mat.needsUpdate = true }
              p.mat.color.lerpColors(new THREE.Color(0xFFAA00), new THREE.Color(0xFF6600), elapsed / 500)
              p.mat.opacity = elapsed / 500
            } else if (elapsed < 3500) {
              if (p.mat.blending !== THREE.NormalBlending) { p.mat.blending = THREE.NormalBlending; p.mat.needsUpdate = true }
              p.mat.color.lerpColors(new THREE.Color(0xFF6600), new THREE.Color(0x888888), (elapsed - 500) / 3000)
              p.mat.opacity = 1
            } else {
              const fp = (elapsed - 3500) / 2500
              p.mat.color.lerpColors(new THREE.Color(0x888888), new THREE.Color(0x444444), fp)
              p.mat.opacity = 1 - fp
            }
          }
          if (anyAlive) requestAnimationFrame(animStem)
        }
        requestAnimationFrame(animStem)

        // Cap: 2 rings × 16 Sprite particles, spawned after 1600ms
        setTimeout(() => {
          type CapP = { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; angle: number; maxRadius: number; heightOff: number }
          const capList: CapP[] = []
          const capT0 = performance.now()
          const stemTop = ip.clone().add(impactNorm.clone().multiplyScalar(0.15))
          for (let c = 0; c < 32; c++) {
            const isInner = c >= 16
            const angle = ((c % 16) / 16) * Math.PI * 2
            const maxRadius = isInner ? 0.07 : 0.12
            const heightOff = isInner ? 0.04 : 0
            const size = isInner ? (0.035 + Math.random() * 0.025) : (0.04 + Math.random() * 0.03)
            const mat = new THREE.SpriteMaterial({
              map: smokeTexture,
              color: 0xDDDDDD,
              transparent: true,
              opacity: 0,
              depthWrite: false,
              blending: THREE.NormalBlending,
            })
            const sprite = new THREE.Sprite(mat)
            const sz = size * 4
            sprite.scale.set(sz, sz, 1)
            sprite.position.copy(stemTop.clone().add(impactNorm.clone().multiplyScalar(heightOff)))
            scene.add(sprite)
            capList.push({ sprite, mat, angle, maxRadius, heightOff })
          }
          const animCap = () => {
            const elapsed = performance.now() - capT0
            if (elapsed >= 4000) {
              for (const p of capList) { scene.remove(p.sprite); p.mat.dispose() }
              return
            }
            for (const p of capList) {
              const base = stemTop.clone().add(impactNorm.clone().multiplyScalar(p.heightOff))
              const radius = Math.min(elapsed / 1200, 1) * p.maxRadius
              p.sprite.position.copy(
                base
                  .add(tan.clone().multiplyScalar(Math.cos(p.angle) * radius))
                  .add(btan.clone().multiplyScalar(Math.sin(p.angle) * radius)),
              )
              if (elapsed < 1800) {
                p.mat.color.lerpColors(new THREE.Color(0xDDDDDD), new THREE.Color(0x888888), elapsed / 1800)
                p.mat.opacity = Math.min(elapsed / 300, 1)
              } else {
                const fp = (elapsed - 1800) / 2200
                p.mat.color.set(0x666666)
                p.mat.opacity = 1 - fp
              }
            }
            requestAnimationFrame(animCap)
          }
          requestAnimationFrame(animCap)
        }, 1600)
      }
    }  // end doRedExplosionVisualAt

    const triggerExplosion = (m: MissileState) => {
      onImpactRef.current?.({ missileId: m.missileId, targetCountry: m.targetCountry, launcherCountry: m.launcherCountry, type: m.type })

      // Trail fade-out
      const trailT0 = performance.now()
      const animTrail = () => {
        const tp = Math.min((performance.now() - trailT0) / 2000, 1)
        m.trailMat.opacity = 0.9 * (1 - tp)
        if (tp < 1) requestAnimationFrame(animTrail)
        else { scene.remove(m.trailLine); m.trailGeo.dispose(); m.trailMat.dispose() }
      }
      requestAnimationFrame(animTrail)

      doRedExplosionVisualAt(m.impactPoint, m.type)

      // Camera shake: nuke always; missile only when player's country involved
      const pc = playerCountryRef.current
      const playerInvolved = m.type === 'nuke' || m.launcherCountry === pc || m.targetCountry === pc
      const cam = cameraRef.current
      if (cam && playerInvolved) {
        const origPos = cam.position.clone()
        const shakeDur = m.type === 'nuke' ? 500 : 300
        const shakeAmt = m.type === 'nuke' ? 0.15 : 0.08
        const shakeEnd = Date.now() + shakeDur
        const shake = () => {
          if (Date.now() > shakeEnd) { cam.position.copy(origPos); return }
          cam.position.x = origPos.x + (Math.random() - 0.5) * shakeAmt
          cam.position.y = origPos.y + (Math.random() - 0.5) * shakeAmt
          requestAnimationFrame(shake)
        }
        shake()
      }
    }

    redExplosionRef.current = doRedExplosionVisualAt

    // Render loop
    let animId: number
    const loop = () => {
      animId = requestAnimationFrame(loop)
      controls.update()
      animsRef.current = animsRef.current.filter(fn => fn())
      renderer.render(scene, camera)
    }
    loop()

    // ── Persistent missile updater ────────────────────────────────────────
    const tmpMatrix = new THREE.Matrix4()
    const tmpQ = new THREE.Quaternion()
    const tmpScale = new THREE.Vector3(1, 1, 1)
    const upVec = new THREE.Vector3(0, 1, 0)
    const axisX = new THREE.Vector3(1, 0, 0)

    animsRef.current.push((): boolean => {
      const instances = missileInstancesRef.current
      const coreInstances = missileCoreInstancesRef.current
      if (!instances) return true

      const now = Date.now()
      let dirty = false

      for (let mi = activeMissilesRef.current.length - 1; mi >= 0; mi--) {
        const m = activeMissilesRef.current[mi]
        const progress = Math.min((now - m.startTime) / m.flightMs, 1)
        const idx = Math.min(Math.floor(progress * PATH_COUNT), PATH_COUNT - 1)
        const currentPos = m.pathPoints[idx]
        const nextPos = m.pathPoints[Math.min(idx + 1, PATH_COUNT)]
        const dirVec = nextPos.clone().sub(currentPos)
        const dir = dirVec.lengthSq() > 1e-8 ? dirVec.normalize() : currentPos.clone().normalize()

        if (progress < 1) {
          // Orient both planes to face direction of travel
          const cosA = upVec.dot(dir)
          if (cosA < -0.9999) {
            tmpQ.setFromAxisAngle(axisX, Math.PI)
          } else {
            tmpQ.setFromUnitVectors(upVec, dir)
          }
          tmpMatrix.compose(currentPos, tmpQ, tmpScale)
          instances.setMatrixAt(m.instanceId, tmpMatrix)
          if (coreInstances) coreInstances.setMatrixAt(m.instanceId, tmpMatrix)
          dirty = true

          // Sliding trail: newest at 0, oldest at tail
          // Color gradient: white (head) → orange → red → black (tail)
          m.trailHistory.unshift(currentPos.clone())
          if (m.trailHistory.length > TRAIL_SIZE) m.trailHistory.pop()
          const hn = m.trailHistory.length
          for (let h = 0; h < hn; h++) {
            const t = hn > 1 ? h / (hn - 1) : 0  // 0=head, 1=tail
            m.trailPositions[h * 3]     = m.trailHistory[h].x
            m.trailPositions[h * 3 + 1] = m.trailHistory[h].y
            m.trailPositions[h * 3 + 2] = m.trailHistory[h].z
            // white→orange (t 0→0.3), orange→red (t 0.3→0.7), red→black (t 0.7→1)
            if (t < 0.3) {
              const s = t / 0.3
              m.trailColors[h * 3]     = 1
              m.trailColors[h * 3 + 1] = 1 - s * 0.6
              m.trailColors[h * 3 + 2] = 1 - s
            } else if (t < 0.7) {
              const s = (t - 0.3) / 0.4
              m.trailColors[h * 3]     = 1
              m.trailColors[h * 3 + 1] = 0.4 - s * 0.27
              m.trailColors[h * 3 + 2] = 0
            } else {
              const s = (t - 0.7) / 0.3
              m.trailColors[h * 3]     = 1 - s
              m.trailColors[h * 3 + 1] = (0.13 - s * 0.13)
              m.trailColors[h * 3 + 2] = 0
            }
          }
          m.trailGeo.setDrawRange(0, hn)
          m.trailGeo.attributes.position.needsUpdate = true
          m.trailGeo.attributes.color.needsUpdate = true

          // Green shield pre-arrival effect — only when player's country has shield active (nukes bypass)
          if (progress >= 0.9 && !m.shieldTriggered
              && shieldActiveRef.current && m.targetCountry === playerCountryRef.current
              && m.type !== 'nuke') {
            m.shieldTriggered = true
            doGreenShieldAt(m.impactPoint)
          }
          // Hide missile mesh at progress >= 0.95 only when shield effect is running
          if (progress >= 0.95 && m.shieldTriggered) {
            instances.setMatrixAt(m.instanceId, zeroScaleM)
            if (coreInstances) coreInstances.setMatrixAt(m.instanceId, zeroScaleM)
          }
        } else {
          // Impact: hide both instances, return slot, trigger explosion
          instances.setMatrixAt(m.instanceId, zeroScaleM)
          if (coreInstances) coreInstances.setMatrixAt(m.instanceId, zeroScaleM)
          dirty = true
          freeSlotsRef.current.push(m.instanceId)
          activeMissilesRef.current.splice(mi, 1)
          triggerExplosion(m)
        }
      }

      if (dirty) {
        instances.instanceMatrix.needsUpdate = true
        if (coreInstances) coreInstances.instanceMatrix.needsUpdate = true
      }
      return true
    })

    const onResize = () => {
      const nw = mount.clientWidth
      const nh = mount.clientHeight
      camera.aspect = nw / nh
      camera.updateProjectionMatrix()
      renderer.setSize(nw, nh)
    }
    window.addEventListener('resize', onResize)

    // ── Shooting star — continent-line color, travels behind upper globe ──────
    const triggerShootingStar = () => {
      const yBase = 1.0 + Math.random() * 0.25            // upper globe: 1.0–1.25
      const starStart = new THREE.Vector3(2.6, yBase, -1.4)          // 우측 상단
      const starEnd   = new THREE.Vector3(-2.0, yBase - 0.55, -1.4) // 좌측 하단으로

      // Head sprite — bright 💥 cross texture in continent-line green
      const hc = document.createElement('canvas')
      hc.width = 32; hc.height = 32
      const hx = hc.getContext('2d')!
      const hg = hx.createRadialGradient(16, 16, 0, 16, 16, 14)
      hg.addColorStop(0,    'rgba(220,255,235,1)')
      hg.addColorStop(0.15, 'rgba(0,255,136,1)')
      hg.addColorStop(0.5,  'rgba(0,255,136,0.4)')
      hg.addColorStop(1,    'rgba(0,255,136,0)')
      hx.fillStyle = hg
      hx.fillRect(0, 0, 32, 32)
      hx.globalCompositeOperation = 'lighter'
      hx.strokeStyle = 'rgba(0,255,136,0.85)'
      hx.lineWidth = 1
      ;[[16,2,16,30],[2,16,30,16],[5,5,27,27],[27,5,5,27]].forEach(([x1,y1,x2,y2]) => {
        hx.beginPath(); hx.moveTo(x1,y1); hx.lineTo(x2,y2); hx.stroke()
      })
      const headTex = new THREE.CanvasTexture(hc)
      const headMat = new THREE.SpriteMaterial({
        map: headTex, transparent: true, opacity: 1,
        depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
      })
      const headSprite = new THREE.Sprite(headMat)
      headSprite.scale.set(0.038, 0.038, 1)
      scene.add(headSprite)

      // Trail line — vertex color, green fading to black (0x00ff88 = 0,1.0,0.533)
      const TLEN = 150
      const tPos = new Float32Array(TLEN * 3)
      const tCol = new Float32Array(TLEN * 3)
      const tGeo = new THREE.BufferGeometry()
      tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3))
      tGeo.setAttribute('color',    new THREE.BufferAttribute(tCol, 3))
      tGeo.setDrawRange(0, 0)
      const tMat = new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 1,
        depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
      })
      const trailLine = new THREE.Line(tGeo, tMat)
      scene.add(trailLine)

      const history: THREE.Vector3[] = []
      const starT0 = performance.now()
      const STAR_DUR = 18000

      const animStar = () => {
        const elapsed = performance.now() - starT0
        const t = Math.min(elapsed / STAR_DUR, 1)
        const pulse      = 0.4 + 0.6 * (1 - Math.cos(2 * Math.PI * elapsed / 2000)) / 2  // 헤드만: 40%→100%→40% (2초 주기)
        const fadeOut    = Math.max(0, Math.min(1, (STAR_DUR - elapsed) / 3000))
        const trailBright = 0.50 * fadeOut  // 꼬리: 50%

        const cur = new THREE.Vector3().lerpVectors(starStart, starEnd, t)
        headSprite.position.copy(cur)
        headMat.opacity = pulse * fadeOut  // 헤드만 펄스

        history.unshift(cur.clone())
        if (history.length > TLEN) history.pop()
        const hn = history.length
        for (let i = 0; i < hn; i++) {
          tPos[i*3]=history[i].x; tPos[i*3+1]=history[i].y; tPos[i*3+2]=history[i].z
          const s = i / Math.max(hn - 1, 1)
          const dimNearHead = Math.min(1, s / 0.18)
          const tailDecay   = Math.pow(Math.max(0, 1 - s), 1.1)
          const g = dimNearHead * tailDecay * trailBright
          tCol[i*3]=0; tCol[i*3+1]=g; tCol[i*3+2]=g*0.53
        }
        tGeo.setDrawRange(0, hn)
        tGeo.attributes.position.needsUpdate = true
        tGeo.attributes.color.needsUpdate = true
        tMat.opacity = trailBright

        if (t < 1) {
          requestAnimationFrame(animStar)
        } else {
          scene.remove(headSprite); headMat.dispose(); headTex.dispose()
          scene.remove(trailLine); tGeo.dispose(); tMat.dispose()
        }
      }
      requestAnimationFrame(animStar)
    }
    const starInterval = setInterval(triggerShootingStar, 3600000)

    const onManualStar = () => triggerShootingStar()
    window.addEventListener('ghostwar:shooting-star', onManualStar)

    return () => {
      cancelAnimationFrame(animId)
      clearInterval(starInterval)
      window.removeEventListener('ghostwar:shooting-star', onManualStar)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
      activeMissilesRef.current = []
      freeSlotsRef.current = []
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    flyTo(lat, lng, duration = 1200) {
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!camera) return

      const dist = camera.position.length()
      const startDir = camera.position.clone().normalize()
      const endDir = latLngToVec3(lat, lng).normalize()

      const rotQ = new THREE.Quaternion().setFromUnitVectors(startDir, endDir)
      const idQ = new THREE.Quaternion()
      const t0 = performance.now()

      if (controls) controls.autoRotate = false

      const tick = (now: number) => {
        const t = Math.min((now - t0) / duration, 1)
        const q = idQ.clone().slerp(rotQ, easeInOutCubic(t))
        camera.position.copy(startDir.clone().applyQuaternion(q).multiplyScalar(dist))
        if (t < 1) {
          requestAnimationFrame(tick)
        } else {
          if (controls) controls.autoRotate = true
        }
      }
      requestAnimationFrame(tick)
    },

    triggerRedExplosionAt(lat: number, lng: number, type: 'missile' | 'nuke' = 'missile') {
      redExplosionRef.current?.(latLngToVec3(lat, lng), type)
    },

    launchMissile(fromLat, fromLng, toLat, toLng, quantity, type, duration = 5000, missileId?: string, targetCountry?: string, launcherCountry?: string) {
      const scene = sceneRef.current
      if (!scene) return

      const arcH = type === 'nuke' ? 0.28 : 0.18

      // Pre-compute shared base path (PATH_COUNT + 1 points, index 0=launch, PATH_COUNT=impact)
      const basePath: THREE.Vector3[] = []
      for (let pi = 0; pi <= PATH_COUNT; pi++) {
        basePath.push(getMissilePoint(fromLat, fromLng, toLat, toLng, pi / PATH_COUNT, arcH))
      }

      for (let i = 0; i < quantity; i++) {
        setTimeout(() => {
          const slot = freeSlotsRef.current.pop()
          if (slot === undefined) return // all 20 slots occupied

          // Small random offset per missile for quantity > 1
          const offset = i === 0
            ? new THREE.Vector3()
            : new THREE.Vector3(
                (Math.random() - 0.5) * 0.02,
                (Math.random() - 0.5) * 0.02,
                (Math.random() - 0.5) * 0.02,
              )
          const pathPoints = basePath.map(p => p.clone().add(offset))
          const impactPoint = pathPoints[PATH_COUNT]

          // Per-missile trail line with vertex colors
          const trailPositions = new Float32Array(TRAIL_SIZE * 3)
          const trailColors = new Float32Array(TRAIL_SIZE * 3)
          const trailGeo = new THREE.BufferGeometry()
          trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3))
          trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3))
          trailGeo.setDrawRange(0, 0)
          const trailMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 })
          const trailLine = new THREE.Line(trailGeo, trailMat)
          scene.add(trailLine)

          activeMissilesRef.current.push({
            pathPoints,
            flightMs: duration,
            startTime: Date.now(),
            instanceId: slot,
            type,
            active: true,
            trailHistory: [],
            trailLine,
            trailGeo,
            trailMat,
            trailPositions,
            trailColors,
            impactPoint,
            missileId,
            targetCountry,
            launcherCountry,
            shieldTriggered: false,
          })
        }, i * 200)
      }
    },
  }))

  return <div ref={mountRef} className="w-full h-full" />
})
Globe.displayName = 'Globe'
export default Globe
