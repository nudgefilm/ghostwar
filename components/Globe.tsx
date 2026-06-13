'use client'

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const RADIUS = 1

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
  arcHeight = 0.35,
): THREE.Vector3 {
  const startNorm = latLngToVec3(fromLat, fromLng).normalize()
  const endNorm   = latLngToVec3(toLat, toLng).normalize()
  // Approximate SLERP: lerp then normalize keeps the path on the sphere
  const slerped = startNorm.clone().lerp(endNorm, t)
  if (slerped.lengthSq() < 1e-8) {
    // Near-antipodal fallback: use a perpendicular at the midpoint
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

interface MissileParticle {
  sprite: THREE.Sprite
  mat: THREE.SpriteMaterial
  age: number
  maxAge: number
  kind: 'fire' | 'smoke'
  velocity: THREE.Vector3
  baseSize: number
}

function createMissileTexture(isNuke = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 80
  const ctx = canvas.getContext('2d')!

  // Body — narrow light-gray cylinder with subtle metallic sheen
  const bodyGrad = ctx.createLinearGradient(0, 0, 32, 0)
  bodyGrad.addColorStop(0, '#888888')
  bodyGrad.addColorStop(0.3, '#EEEEEE')
  bodyGrad.addColorStop(0.7, '#CCCCCC')
  bodyGrad.addColorStop(1, '#666666')
  ctx.fillStyle = bodyGrad
  ctx.fillRect(10, 10, 12, 52)

  // Dark pointed nose cone
  ctx.fillStyle = '#444444'
  ctx.beginPath()
  ctx.moveTo(16, 0)
  ctx.lineTo(22, 10)
  ctx.lineTo(10, 10)
  ctx.closePath()
  ctx.fill()

  // Two thin red stripes
  ctx.fillStyle = '#FF2233'
  ctx.fillRect(10, 28, 12, 2)
  ctx.fillRect(10, 34, 12, 2)

  // Small fins at base
  ctx.fillStyle = '#999999'
  ctx.beginPath()
  ctx.moveTo(10, 52); ctx.lineTo(5, 65); ctx.lineTo(10, 63)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(22, 52); ctx.lineTo(27, 65); ctx.lineTo(22, 63)
  ctx.closePath()
  ctx.fill()

  // Exhaust nozzle
  ctx.fillStyle = '#333333'
  ctx.fillRect(12, 62, 8, 4)

  // Nuke variant: darken body, orange stripes
  if (isNuke) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(10, 10, 12, 52)
    ctx.fillStyle = '#FF8800'
    ctx.fillRect(10, 28, 12, 2)
    ctx.fillRect(10, 34, 12, 2)
  }

  return new THREE.CanvasTexture(canvas)
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

    // Atmosphere glow — BackSide renders inward, visible as outer halo
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

    // Base sphere — solid dark backdrop for continent lines
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
    // Latitude lines
    ;[-60, -30, 0, 30, 60].forEach(lat => {
      const pts = Array.from({ length: 65 }, (_, i) =>
        latLngToVec3(lat, (i / 64) * 360 - 180, RADIUS + 0.002),
      )
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat))
    })
    // Longitude lines
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

    // Render loop
    let animId: number
    const loop = () => {
      animId = requestAnimationFrame(loop)
      controls.update()
      animsRef.current = animsRef.current.filter(fn => fn())
      renderer.render(scene, camera)
    }
    loop()

    const onResize = () => {
      const nw = mount.clientWidth
      const nh = mount.clientHeight
      camera.aspect = nw / nh
      camera.updateProjectionMatrix()
      renderer.setSize(nw, nh)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    flyTo(lat, lng, duration = 1500) {
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!camera) return

      const dist = camera.position.length()
      const target = latLngToVec3(lat, lng, dist)
      const start = camera.position.clone()
      const t0 = performance.now()

      if (controls) controls.autoRotate = false

      const tick = (now: number) => {
        const t = Math.min((now - t0) / duration, 1)
        camera.position.lerpVectors(start, target, easeInOutCubic(t))
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

      const isNuke = type === 'nuke'
      const spriteW = isNuke ? 0.035 : 0.025
      const spriteH = isNuke ? 0.08 : 0.06

      // Pre-compute 101 SLERP path points (shared across all staggered missiles)
      const PATH_COUNT = 100
      const pathPoints: THREE.Vector3[] = []
      for (let pi = 0; pi <= PATH_COUNT; pi++) {
        pathPoints.push(getMissilePoint(fromLat, fromLng, toLat, toLng, pi / PATH_COUNT))
      }
      const impactPoint = pathPoints[PATH_COUNT]

      // Canvas texture shared across quantity, ref-counted for disposal
      const missileTex = createMissileTexture(isNuke)
      let texRefCount = quantity

      for (let i = 0; i < quantity; i++) {
        setTimeout(() => {
          // ── Sprite missile ────────────────────────────────────────────
          const spriteMat = new THREE.SpriteMaterial({ map: missileTex, transparent: true })
          const missileSprite = new THREE.Sprite(spriteMat)
          missileSprite.scale.set(spriteW, spriteH, 1)
          scene.add(missileSprite)

          const particles: MissileParticle[] = []

          const spawnExhaust = (tailPos: THREE.Vector3, travelDir: THREE.Vector3) => {
            // Fire: 2 per frame — orange→red, 12-frame life, tight spread
            for (let p = 0; p < 2; p++) {
              const sz = 0.004 + Math.random() * 0.004
              const pMat = new THREE.SpriteMaterial({ color: 0xff6600, transparent: true, opacity: 1 })
              const pSprite = new THREE.Sprite(pMat)
              pSprite.scale.set(sz, sz, 1)
              pSprite.position.set(
                tailPos.x + (Math.random() - 0.5) * 0.003,
                tailPos.y + (Math.random() - 0.5) * 0.003,
                tailPos.z + (Math.random() - 0.5) * 0.003,
              )
              const vel = travelDir.clone().negate().multiplyScalar(0.002).add(
                new THREE.Vector3((Math.random()-0.5)*0.001, (Math.random()-0.5)*0.001, (Math.random()-0.5)*0.001),
              )
              scene.add(pSprite)
              particles.push({ sprite: pSprite, mat: pMat, age: 0, maxAge: 12, kind: 'fire', velocity: vel, baseSize: sz })
            }
            // Smoke: 1 per frame — gray, grows, 15-frame life
            {
              const sz = 0.006 + Math.random() * 0.006
              const pMat = new THREE.SpriteMaterial({ color: 0x444444, transparent: true, opacity: 0.6 })
              const pSprite = new THREE.Sprite(pMat)
              pSprite.scale.set(sz, sz, 1)
              const smokePos = tailPos.clone().sub(travelDir.clone().multiplyScalar(spriteH * 0.15))
              pSprite.position.set(
                smokePos.x + (Math.random() - 0.5) * 0.005,
                smokePos.y + (Math.random() - 0.5) * 0.005,
                smokePos.z + (Math.random() - 0.5) * 0.005,
              )
              const vel = travelDir.clone().negate().multiplyScalar(0.001)
              scene.add(pSprite)
              particles.push({ sprite: pSprite, mat: pMat, age: 0, maxAge: 15, kind: 'smoke', velocity: vel, baseSize: sz })
            }
          }

          const t0 = performance.now()

          const anim: AnimFn = () => {
            const camera = cameraRef.current
            const t = Math.min((performance.now() - t0) / duration, 1)
            const idx = Math.min(Math.floor(t * PATH_COUNT), PATH_COUNT - 1)
            const currentPos = pathPoints[idx]
            const nextPos = pathPoints[Math.min(idx + 1, PATH_COUNT)]

            // Direction of travel
            const dirVec = nextPos.clone().sub(currentPos)
            const travelDir = dirVec.lengthSq() > 1e-8
              ? dirVec.normalize()
              : currentPos.clone().normalize()

            // Position sprite
            missileSprite.position.copy(currentPos)

            // Orient sprite: project travel direction into camera space, set 2D rotation
            if (camera) {
              const dirWorld = pathPoints[Math.min(idx + 1, PATH_COUNT)].clone()
                .sub(pathPoints[idx]).normalize()
              const dirCamera = dirWorld.clone().transformDirection(camera.matrixWorldInverse)
              const angle = Math.atan2(dirCamera.x, dirCamera.y)
              spriteMat.rotation = -angle
            }

            // Exhaust tail: offset backward from missile center
            const tailPos = currentPos.clone().sub(travelDir.clone().multiplyScalar(spriteH * 0.45))
            spawnExhaust(tailPos, travelDir)

            // Age all particles
            for (let p = particles.length - 1; p >= 0; p--) {
              const particle = particles[p]
              particle.age++
              particle.sprite.position.add(particle.velocity)
              const life = particle.age / particle.maxAge
              if (particle.kind === 'fire') {
                particle.mat.opacity = 1 - life
                particle.mat.color.setRGB(1, Math.max(0, 0.4 - life * 0.4) * 0.5, 0)
                const sz = particle.baseSize * (1 - life * 0.7)
                particle.sprite.scale.set(sz, sz, 1)
              } else {
                particle.mat.opacity = 0.6 * (1 - life)
                particle.mat.color.setHex(life > 0.5 ? 0x222222 : 0x444444)
                const sz = particle.baseSize * (1 + life * 0.5)
                particle.sprite.scale.set(sz, sz, 1)
              }
              if (particle.age >= particle.maxAge) {
                scene.remove(particle.sprite)
                particle.mat.dispose()
                particles.splice(p, 1)
              }
            }

            if (t < 1) return true

            // ── Cleanup ─────────────────────────────────────────────────
            scene.remove(missileSprite)
            spriteMat.dispose()
            texRefCount--
            if (texRefCount <= 0) missileTex.dispose()

            particles.forEach(({ sprite: ps, mat: pm }) => { scene.remove(ps); pm.dispose() })
            particles.length = 0

            // ── Notify impact ────────────────────────────────────────────
            onImpactRef.current?.()

            // ── Flash ────────────────────────────────────────────────────
            const flash = new THREE.PointLight(0xff2233, 3, 2)
            flash.position.copy(impactPoint)
            scene.add(flash)
            setTimeout(() => scene.remove(flash), 300)

            // ── Impact ring (direct RAF) ─────────────────────────────────
            const rGeo = new THREE.RingGeometry(0.015, 0.04, 32)
            const rMat = new THREE.MeshBasicMaterial({
              color: 0xff2233, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
            })
            const ring = new THREE.Mesh(rGeo, rMat)
            ring.position.copy(impactPoint)
            ring.lookAt(new THREE.Vector3(0, 0, 0))
            scene.add(ring)

            const ringStart = Date.now()
            const animateRing = () => {
              const progress = (Date.now() - ringStart) / 500
              if (progress >= 1) { scene.remove(ring); rGeo.dispose(); rMat.dispose(); return }
              ring.scale.set(progress * 3, progress * 3, 1)
              rMat.opacity = 1 - progress
              requestAnimationFrame(animateRing)
            }
            animateRing()

            // ── Camera shake (direct RAF) ────────────────────────────────
            const camForShake = cameraRef.current
            if (camForShake) {
              const originalPos = camForShake.position.clone()
              const shakeEnd = Date.now() + 300
              const shake = () => {
                if (Date.now() > shakeEnd) { camForShake.position.copy(originalPos); return }
                camForShake.position.x = originalPos.x + (Math.random() - 0.5) * 0.1
                camForShake.position.y = originalPos.y + (Math.random() - 0.5) * 0.1
                requestAnimationFrame(shake)
              }
              shake()
            }

            return false
          }

          animsRef.current.push(anim)
        }, i * 200)
      }
    },
  }))

  return <div ref={mountRef} className="w-full h-full" />
})
Globe.displayName = 'Globe'
export default Globe
