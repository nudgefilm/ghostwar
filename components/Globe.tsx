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

const Globe = forwardRef<GlobeHandle>((_, ref) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const animsRef = useRef<AnimFn[]>([])

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

    // Transparent base sphere
    scene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(RADIUS, 64, 64),
        new THREE.MeshPhongMaterial({
          color: 0x0a1a0e,
          opacity: 0.15,
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

    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.json')
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
      const color = type === 'nuke' ? 0xff8800 : 0xff2233

      for (let i = 0; i < quantity; i++) {
        setTimeout(() => {
          const from = latLngToVec3(fromLat, fromLng, RADIUS + 0.01)
          const to = latLngToVec3(toLat, toLng, RADIUS + 0.01)
          const mid = new THREE.Vector3()
            .addVectors(from, to)
            .multiplyScalar(0.5)
            .normalize()
            .multiplyScalar(RADIUS * 1.4)

          const curve = new THREE.QuadraticBezierCurve3(from, mid, to)
          const dotGeo = new THREE.SphereGeometry(0.015, 6, 6)
          const dotMat = new THREE.MeshBasicMaterial({ color })
          const dot = new THREE.Mesh(dotGeo, dotMat)
          scene.add(dot)

          const t0 = performance.now()

          const anim: AnimFn = () => {
            const t = Math.min((performance.now() - t0) / duration, 1)
            dot.position.copy(curve.getPoint(t))

            if (t >= 1) {
              scene.remove(dot)
              dotGeo.dispose()
              dotMat.dispose()

              // Impact ring
              const impactPos = to.clone()
              const rGeo = new THREE.RingGeometry(0.01, 0.025, 32)
              const rMat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide,
              })
              const ring = new THREE.Mesh(rGeo, rMat)
              ring.position.copy(impactPos)
              ring.lookAt(impactPos.clone().multiplyScalar(2))
              scene.add(ring)

              const ri0 = performance.now()
              animsRef.current.push((): boolean => {
                const it = (performance.now() - ri0) / 600
                if (it >= 1) {
                  scene.remove(ring)
                  rGeo.dispose()
                  rMat.dispose()
                  return false
                }
                ring.scale.setScalar(1 + it * 5)
                rMat.opacity = 0.9 * (1 - it)
                return true
              })

              // Camera shake
              const cam = cameraRef.current
              if (cam) {
                const base = cam.position.clone()
                const s0 = performance.now()
                animsRef.current.push((): boolean => {
                  const st = (performance.now() - s0) / 300
                  if (st >= 1) {
                    cam.position.copy(base)
                    return false
                  }
                  const d = 0.02 * (1 - st)
                  cam.position.x = base.x + (Math.random() - 0.5) * d
                  cam.position.y = base.y + (Math.random() - 0.5) * d
                  cam.position.z = base.z + (Math.random() - 0.5) * d
                  return true
                })
              }
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
