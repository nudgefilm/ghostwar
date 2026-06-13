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

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
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

      const missileColor = type === 'nuke' ? 0xff6600 : 0xff4444
      const yAxis = new THREE.Vector3(0, 1, 0)

      for (let i = 0; i < quantity; i++) {
        setTimeout(() => {
          const from = latLngToVec3(fromLat, fromLng, RADIUS + 0.01)
          const to   = latLngToVec3(toLat,   toLng,   RADIUS + 0.01)
          const mid  = new THREE.Vector3()
            .addVectors(from, to)
            .multiplyScalar(0.5)
            .normalize()
            .multiplyScalar(RADIUS * 1.4)
          const curve = new THREE.QuadraticBezierCurve3(from, mid, to)

          // ── Trail — rebuilt each frame from visited points ─────────────
          const visitedPoints: THREE.Vector3[] = []
          const trailGeo = new THREE.BufferGeometry()
          const trailMat = new THREE.LineBasicMaterial({ color: 0xff2233, transparent: true, opacity: 0.8 })
          const trail = new THREE.Line(trailGeo, trailMat)
          scene.add(trail)

          // ── Cone missile (ConeGeometry, tip at +Y, oriented via quaternion) ─
          const missileGeo = new THREE.ConeGeometry(0.012, 0.05, 6)
          const missileMat = new THREE.MeshBasicMaterial({ color: missileColor })
          const missileMesh = new THREE.Mesh(missileGeo, missileMat)
          scene.add(missileMesh)

          // ── Exhaust particles (shared geometry, individual materials) ───
          const pGeo = new THREE.SphereGeometry(0.008, 3, 3)
          const particles: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; age: number }> = []

          const orientQ = new THREE.Quaternion()
          const t0 = performance.now()

          const anim: AnimFn = () => {
            const t = Math.min((performance.now() - t0) / duration, 1)
            const currentPos = curve.getPoint(t)

            // Position and orient cone toward direction of travel
            missileMesh.position.copy(currentPos)
            if (t < 0.99) {
              const nextPos = curve.getPoint(Math.min(t + 0.01, 1))
              const dir = nextPos.clone().sub(currentPos).normalize()
              orientQ.setFromUnitVectors(yAxis, dir)
              missileMesh.quaternion.copy(orientQ)
            }

            // Rebuild trail from all visited positions
            visitedPoints.push(currentPos.clone())
            if (visitedPoints.length >= 2) {
              trailGeo.setFromPoints(visitedPoints)
            }

            // Spawn 3–5 exhaust particles at current position
            const spawnCount = 3 + Math.floor(Math.random() * 3)
            for (let p = 0; p < spawnCount; p++) {
              const pMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 1 })
              const pMesh = new THREE.Mesh(pGeo, pMat)
              pMesh.position.set(
                currentPos.x + (Math.random() - 0.5) * 0.015,
                currentPos.y + (Math.random() - 0.5) * 0.015,
                currentPos.z + (Math.random() - 0.5) * 0.015,
              )
              scene.add(pMesh)
              particles.push({ mesh: pMesh, mat: pMat, age: 0 })
            }

            // Age particles — shrink and fade, remove at 20 frames
            for (let p = particles.length - 1; p >= 0; p--) {
              const particle = particles[p]
              particle.age++
              const life = particle.age / 20
              particle.mat.opacity = 1 - life
              particle.mesh.scale.setScalar(1 - life * 0.8)
              if (particle.age >= 20) {
                scene.remove(particle.mesh)
                particle.mat.dispose()
                particles.splice(p, 1)
              }
            }

            if (t < 1) return true

            // ── Clean up missile + trail ────────────────────────────────
            scene.remove(missileMesh); missileGeo.dispose(); missileMat.dispose()
            scene.remove(trail);       trailGeo.dispose();   trailMat.dispose()
            // Drain remaining particles, then dispose shared geometry
            particles.forEach(({ mesh, mat }) => { scene.remove(mesh); mat.dispose() })
            particles.length = 0
            pGeo.dispose()

            // ── Notify impact ───────────────────────────────────────────
            onImpactRef.current?.()

            // ── Flash ───────────────────────────────────────────────────
            const flash = new THREE.PointLight(0xff2233, 3, 2)
            flash.position.copy(to)
            scene.add(flash)
            setTimeout(() => scene.remove(flash), 300)

            // ── Impact ring (direct RAF) ────────────────────────────────
            const rGeo = new THREE.RingGeometry(0.015, 0.04, 32)
            const rMat = new THREE.MeshBasicMaterial({
              color: 0xff2233, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
            })
            const ring = new THREE.Mesh(rGeo, rMat)
            ring.position.copy(to)
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
            const camera = cameraRef.current
            if (camera) {
              const originalPos = camera.position.clone()
              const shakeEnd = Date.now() + 300
              const shake = () => {
                if (Date.now() > shakeEnd) { camera.position.copy(originalPos); return }
                camera.position.x = originalPos.x + (Math.random() - 0.5) * 0.1
                camera.position.y = originalPos.y + (Math.random() - 0.5) * 0.1
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
