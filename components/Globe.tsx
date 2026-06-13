'use client'

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

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
  ) => void
}

type AnimFn = () => boolean

interface GeoGeometry {
  type: string
  coordinates: number[][][] | number[][][][]
}

interface GeoFeature {
  geometry: GeoGeometry
}

interface GlobeProps {
  onImpact?: () => void
}

const Globe = forwardRef<GlobeHandle, GlobeProps>(({ onImpact }, ref) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const animsRef = useRef<AnimFn[]>([])
  const onImpactRef = useRef(onImpact)
  useEffect(() => { onImpactRef.current = onImpact }, [onImpact])

  const missileInstancesRef = useRef<THREE.InstancedMesh | null>(null)
  const missileCoreInstancesRef = useRef<THREE.InstancedMesh | null>(null)
  const activeMissilesRef = useRef<MissileState[]>([])
  const freeSlotsRef = useRef<number[]>([])

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
        new THREE.LineBasicMaterial({ color: 0x1a4a2a, opacity: 0.4, transparent: true }),
      ),
    )

    // Graticule — lat/lon grid every 30°
    const gratMat = new THREE.LineBasicMaterial({ color: 0x003300, opacity: 0.15, transparent: true })
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
    controlsRef.current = controls

    // GeoJSON continent lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff88, opacity: 0.6, transparent: true })
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

    // ── Explosion trigger ────────────────────────────────────────────────
    const debrisColors = [0xFF4400, 0xFF6600, 0xFF8800, 0xFFCC00, 0xFF2233]

    const triggerExplosion = (m: MissileState) => {
      const ip = m.impactPoint
      onImpactRef.current?.()

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

      // Debris: 35 particles, varied size/speed, 20% white sparks, gravity
      const debrisBase = new THREE.SphereGeometry(0.01, 4, 4)
      type DebrisP = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; vel: THREE.Vector3; life: number; maxLife: number; startSz: number; gravity: number }
      const debrisList: DebrisP[] = []
      for (let d = 0; d < 35; d++) {
        const sz = 0.004 + Math.random() * 0.014
        const isWhite = Math.random() < 0.2
        const color = isWhite ? 0xFFFFFF : debrisColors[Math.floor(Math.random() * debrisColors.length)]
        const speedMult = 0.5 + Math.random() * 1.5
        const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
          .normalize().multiplyScalar((0.002 + Math.random() * 0.005) * speedMult)
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
        const mesh = new THREE.Mesh(debrisBase, mat)
        mesh.position.copy(ip)
        mesh.scale.setScalar(sz / 0.01)
        scene.add(mesh)
        debrisList.push({ mesh, mat, vel, life: 0, maxLife: 40, startSz: sz, gravity: 0.001 })
      }
      const animDebris = () => {
        for (let d = debrisList.length - 1; d >= 0; d--) {
          const deb = debrisList[d]
          deb.life++
          deb.vel.y -= deb.gravity
          deb.mesh.position.add(deb.vel)
          const lr = deb.life / deb.maxLife
          deb.mesh.scale.setScalar((deb.startSz * (1 - lr)) / 0.01)
          deb.mat.opacity = 1 - lr
          if (deb.life >= deb.maxLife) {
            scene.remove(deb.mesh)
            deb.mat.dispose()
            debrisList.splice(d, 1)
          }
        }
        if (debrisList.length > 0) requestAnimationFrame(animDebris)
        else debrisBase.dispose()
      }
      requestAnimationFrame(animDebris)

      // Scorch mark: 8-12 dark spheres scattered on globe surface
      const impactNorm = ip.clone().normalize()
      const tUp = Math.abs(impactNorm.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
      const tan = impactNorm.clone().cross(tUp).normalize()
      const btan = impactNorm.clone().cross(tan).normalize()
      const scorchCount = 8 + Math.floor(Math.random() * 5)
      const scorchObjs: { mesh: THREE.Mesh; geo: THREE.SphereGeometry; mat: THREE.MeshBasicMaterial; baseOpacity: number }[] = []
      for (let s = 0; s < scorchCount; s++) {
        const sz = 0.008 + Math.random() * 0.012
        const baseOpacity = 0.5 + Math.random() * 0.3
        const color = Math.random() < 0.5 ? 0x331100 : 0x220000
        const geo = new THREE.SphereGeometry(sz, 4, 4)
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: baseOpacity })
        const mesh = new THREE.Mesh(geo, mat)
        const u = (Math.random() - 0.5) * 0.08
        const v = (Math.random() - 0.5) * 0.08
        const pos = impactNorm.clone().multiplyScalar(RADIUS)
          .add(tan.clone().multiplyScalar(u))
          .add(btan.clone().multiplyScalar(v))
          .normalize().multiplyScalar(RADIUS)
        mesh.position.copy(pos)
        scene.add(mesh)
        scorchObjs.push({ mesh, geo, mat, baseOpacity })
      }
      const scorchT0 = performance.now()
      const animScorch = () => {
        const sp = Math.min((performance.now() - scorchT0) / 8000, 1)
        for (const s of scorchObjs) s.mat.opacity = s.baseOpacity * (1 - sp)
        if (sp < 1) requestAnimationFrame(animScorch)
        else { for (const s of scorchObjs) { scene.remove(s.mesh); s.geo.dispose(); s.mat.dispose() } }
      }
      requestAnimationFrame(animScorch)

      // Fade trail line over 2s
      const trailT0 = performance.now()
      const animTrail = () => {
        const tp = Math.min((performance.now() - trailT0) / 2000, 1)
        m.trailMat.opacity = 0.9 * (1 - tp)
        if (tp < 1) requestAnimationFrame(animTrail)
        else { scene.remove(m.trailLine); m.trailGeo.dispose(); m.trailMat.dispose() }
      }
      requestAnimationFrame(animTrail)

      // Camera shake 0.3s
      const cam = cameraRef.current
      if (cam) {
        const origPos = cam.position.clone()
        const shakeEnd = Date.now() + 300
        const shake = () => {
          if (Date.now() > shakeEnd) { cam.position.copy(origPos); return }
          cam.position.x = origPos.x + (Math.random() - 0.5) * 0.08
          cam.position.y = origPos.y + (Math.random() - 0.5) * 0.08
          requestAnimationFrame(shake)
        }
        shake()
      }
    }

    // EffectComposer with bloom
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      1.8,   // strength
      0.4,   // radius
      0.1,   // threshold — low value = more things bloom
    )
    composer.addPass(bloomPass)
    composer.addPass(new OutputPass())

    // Render loop
    let animId: number
    const loop = () => {
      animId = requestAnimationFrame(loop)
      controls.update()
      animsRef.current = animsRef.current.filter(fn => fn())
      composer.render()
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
      composer.setSize(nw, nh)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(animId)
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

    launchMissile(fromLat, fromLng, toLat, toLng, quantity, type, duration = 5000) {
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
          })
        }, i * 200)
      }
    },
  }))

  return <div ref={mountRef} className="w-full h-full" />
})
Globe.displayName = 'Globe'
export default Globe
