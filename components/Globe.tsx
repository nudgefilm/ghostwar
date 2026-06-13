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

interface GlobeParticle {
  mesh: THREE.Mesh
  mat: THREE.MeshBasicMaterial
  life: number
  maxLife: number
  velocity: THREE.Vector3
  startSize: number
  endSize: number
  startOpacity: number
  endOpacity: number
  gravity: number
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
    flyTo(lat, lng, duration = 1200) {
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!camera) return

      const dist = camera.position.length()
      const startDir = camera.position.clone().normalize()
      const endDir = latLngToVec3(lat, lng).normalize()

      // Quaternion SLERP: rotate around globe surface, not through it
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

      const isNuke = type === 'nuke'
      const arcH = isNuke ? 0.25 : 0.15
      const headColor = isNuke ? 0xFF6600 : 0xFF2233
      const fireColors = [0xFF4400, 0xFF6600, 0xFF8800, 0xFFAA00]
      const debrisColors = [0xFF4400, 0xFF6600, 0xFF8800, 0xFFCC00, 0xFF2233]

      // Pre-compute 101 SLERP path points (shared across all staggered missiles)
      const PATH_COUNT = 100
      const pathPoints: THREE.Vector3[] = []
      for (let pi = 0; pi <= PATH_COUNT; pi++) {
        pathPoints.push(getMissilePoint(fromLat, fromLng, toLat, toLng, pi / PATH_COUNT, arcH))
      }
      const impactPoint = pathPoints[PATH_COUNT]

      for (let i = 0; i < quantity; i++) {
        setTimeout(() => {
          // ── Glowing head: small sphere + point light ───────────────────
          const headGeo = new THREE.SphereGeometry(0.006, 8, 8)
          const headMat = new THREE.MeshBasicMaterial({ color: headColor })
          const head = new THREE.Mesh(headGeo, headMat)
          const headLight = new THREE.PointLight(headColor, 1.5, 0.2)
          scene.add(head)
          scene.add(headLight)

          // ── Persistent trail line ──────────────────────────────────────
          const trailGeo = new THREE.BufferGeometry()
          const trailMat = new THREE.LineBasicMaterial({ color: 0xFF2233, transparent: true, opacity: 0.4 })
          const trailLine = new THREE.Line(trailGeo, trailMat)
          scene.add(trailLine)
          const visitedPts: THREE.Vector3[] = []

          // ── Particle pool — shared base geometry ───────────────────────
          const pBaseGeo = new THREE.SphereGeometry(0.01, 4, 4)
          const particles: GlobeParticle[] = []

          const addParticle = (
            pos: THREE.Vector3,
            vel: THREE.Vector3,
            color: number,
            maxLife: number,
            startSize: number,
            endSize: number,
            startOpacity: number,
            gravity = 0,
          ) => {
            const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: startOpacity })
            const mesh = new THREE.Mesh(pBaseGeo, mat)
            mesh.position.copy(pos)
            mesh.scale.setScalar(startSize / 0.01)
            scene.add(mesh)
            particles.push({ mesh, mat, life: 0, maxLife, velocity: vel, startSize, endSize, startOpacity, endOpacity: 0, gravity })
          }

          const spawnFlight = (pos: THREE.Vector3, travelDir: THREE.Vector3) => {
            // 5 fire particles: velocity = -dir*0.02 ±0.005 spread
            for (let p = 0; p < 5; p++) {
              const sz = 0.008 + Math.random() * 0.007
              const vel = new THREE.Vector3(
                -travelDir.x * 0.02 + (Math.random() - 0.5) * 0.005,
                -travelDir.y * 0.02 + (Math.random() - 0.5) * 0.005,
                -travelDir.z * 0.02 + (Math.random() - 0.5) * 0.005,
              )
              addParticle(pos, vel, fireColors[Math.floor(Math.random() * 4)], 15, sz, 0, 1)
            }
            // 3 smoke particles, offset behind head
            for (let p = 0; p < 3; p++) {
              const smokePos = pos.clone().sub(travelDir.clone().multiplyScalar(0.015 + Math.random() * 0.01))
              const vel = new THREE.Vector3(
                -travelDir.x * 0.02 + (Math.random() - 0.5) * 0.005,
                -travelDir.y * 0.02 + (Math.random() - 0.5) * 0.005,
                -travelDir.z * 0.02 + (Math.random() - 0.5) * 0.005,
              )
              addParticle(smokePos, vel, 0x666666, 30, 0.01, 0.03, 0.5)
            }
          }

          let impacted = false
          const t0 = performance.now()

          const anim: AnimFn = () => {
            const t = Math.min((performance.now() - t0) / duration, 1)
            // Allow idx to reach PATH_COUNT so missile arrives at final point
            const idx = Math.min(Math.floor(t * PATH_COUNT), PATH_COUNT)
            const currentPos = pathPoints[Math.min(idx, PATH_COUNT - 1)]
            const nextPos = pathPoints[Math.min(idx + 1, PATH_COUNT)]
            const dirVec = nextPos.clone().sub(currentPos)
            const travelDir = dirVec.lengthSq() > 1e-8 ? dirVec.normalize() : currentPos.clone().normalize()

            if (!impacted) {
              if (t < 1) {
                head.position.copy(currentPos)
                headLight.position.copy(currentPos)
                visitedPts.push(currentPos.clone())
                if (visitedPts.length >= 2) trailGeo.setFromPoints(visitedPts)
                spawnFlight(currentPos, travelDir)
              } else {
                // ── IMPACT ─────────────────────────────────────────────────
                impacted = true
                scene.remove(head); headGeo.dispose(); headMat.dispose()
                scene.remove(headLight)
                onImpactRef.current?.()

                // 1. Flash: intensity 5, 0.25s
                const flashLight = new THREE.PointLight(0xFF4400, 5, 1.5)
                flashLight.position.copy(impactPoint)
                scene.add(flashLight)
                const flashT0 = performance.now()
                const animFlash = () => {
                  const fp = Math.min((performance.now() - flashT0) / 250, 1)
                  flashLight.intensity = 5 * (1 - fp)
                  if (fp < 1) requestAnimationFrame(animFlash)
                  else scene.remove(flashLight)
                }
                requestAnimationFrame(animFlash)

                // 1b. Secondary warm glow: #FF8800, intensity 2, 0.5s
                const warmLight = new THREE.PointLight(0xFF8800, 2, 2)
                warmLight.position.copy(impactPoint)
                scene.add(warmLight)
                const warmT0 = performance.now()
                const animWarm = () => {
                  const wp = Math.min((performance.now() - warmT0) / 500, 1)
                  warmLight.intensity = 2 * (1 - wp)
                  if (wp < 1) requestAnimationFrame(animWarm)
                  else scene.remove(warmLight)
                }
                requestAnimationFrame(animWarm)

                // 2. Three staggered thin rings: soft opacity curve + color shift
                const ringDefs: [number, number, number][] = [[0, 2, 400], [100, 3, 500], [200, 4, 600]]
                ringDefs.forEach(([delay, maxScale, dur]) => {
                  setTimeout(() => {
                    const rGeo = new THREE.RingGeometry(0.025, 0.033, 32)
                    const rMat = new THREE.MeshBasicMaterial({ color: 0xFF6600, transparent: true, opacity: 0, side: THREE.DoubleSide })
                    const ring = new THREE.Mesh(rGeo, rMat)
                    ring.position.copy(impactPoint)
                    ring.lookAt(new THREE.Vector3(0, 0, 0))
                    scene.add(ring)
                    const rT0 = performance.now()
                    const animRing = () => {
                      const rp = Math.min((performance.now() - rT0) / dur, 1)
                      ring.scale.setScalar(1 + rp * (maxScale - 1))
                      // Opacity: 0→0.6 at 30%→0 at 100%
                      rMat.opacity = rp < 0.3 ? 0.6 * (rp / 0.3) : 0.6 * (1 - (rp - 0.3) / 0.7)
                      // Color: #FF6600→#FF2233→#550000
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

                // 3. 35 debris — varied size, speed, colors; 20% white sparks; gravity
                for (let d = 0; d < 35; d++) {
                  const sz = 0.004 + Math.random() * 0.014
                  const isWhite = Math.random() < 0.2
                  const color = isWhite ? 0xFFFFFF : debrisColors[Math.floor(Math.random() * debrisColors.length)]
                  const speedMult = 0.5 + Math.random() * 1.5
                  const vel = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5)
                    .normalize().multiplyScalar((0.002 + Math.random() * 0.005) * speedMult)
                  addParticle(impactPoint.clone(), vel, color, 40, sz, 0, 1, 0.001)
                }

                // 4. Scorch mark: 8-12 dark spheres scattered on globe surface
                const impactNorm = impactPoint.clone().normalize()
                const tUp = Math.abs(impactNorm.y) < 0.9
                  ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
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

                // 5. Fade trail line over 3s then remove
                const trailT0 = performance.now()
                const animTrail = () => {
                  const tp = Math.min((performance.now() - trailT0) / 3000, 1)
                  trailMat.opacity = 0.4 * (1 - tp)
                  if (tp < 1) requestAnimationFrame(animTrail)
                  else { scene.remove(trailLine); trailGeo.dispose(); trailMat.dispose() }
                }
                requestAnimationFrame(animTrail)

                // 6. Camera shake 0.3s, intensity 0.08
                const camRef = cameraRef.current
                if (camRef) {
                  const origPos = camRef.position.clone()
                  const shakeEnd = Date.now() + 300
                  const shake = () => {
                    if (Date.now() > shakeEnd) { camRef.position.copy(origPos); return }
                    camRef.position.x = origPos.x + (Math.random() - 0.5) * 0.08
                    camRef.position.y = origPos.y + (Math.random() - 0.5) * 0.08
                    requestAnimationFrame(shake)
                  }
                  shake()
                }
              }
            }

            // ── Update all particles (flight exhaust + impact debris) ─────
            for (let p = particles.length - 1; p >= 0; p--) {
              const particle = particles[p]
              particle.life++
              if (particle.gravity) particle.velocity.y -= particle.gravity
              particle.mesh.position.add(particle.velocity)
              const lr = particle.life / particle.maxLife
              const sz = particle.startSize + (particle.endSize - particle.startSize) * lr
              particle.mesh.scale.setScalar(sz / 0.01)
              particle.mat.opacity = particle.startOpacity + (particle.endOpacity - particle.startOpacity) * lr
              if (particle.life >= particle.maxLife) {
                scene.remove(particle.mesh)
                particle.mat.dispose()
                particles.splice(p, 1)
              }
            }

            // Keep running until all particles drain after impact
            if (impacted && particles.length === 0) {
              pBaseGeo.dispose()
              return false
            }
            return true
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
