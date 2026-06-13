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

      const trailColor = type === 'nuke' ? 0xff6600 : 0xff2233
      const spriteSize  = type === 'nuke' ? 0.12 : 0.08
      const CURVE_SEGS  = 60

      for (let i = 0; i < quantity; i++) {
        setTimeout(() => {
          const from = latLngToVec3(fromLat, fromLng, RADIUS + 0.01)
          const to   = latLngToVec3(toLat,   toLng,   RADIUS + 0.01)

          const mid = new THREE.Vector3()
            .addVectors(from, to)
            .multiplyScalar(0.5)
            .normalize()
            .multiplyScalar(RADIUS * 1.4)

          const curve = new THREE.QuadraticBezierCurve3(from, mid, to)

          // ── Trail (BufferGeometry, setDrawRange grows each frame) ─
          const allPts = curve.getPoints(CURVE_SEGS)
          const posBuf = new Float32Array((CURVE_SEGS + 1) * 3)
          allPts.forEach((p, idx) => {
            posBuf[idx * 3]     = p.x
            posBuf[idx * 3 + 1] = p.y
            posBuf[idx * 3 + 2] = p.z
          })
          const trailGeo = new THREE.BufferGeometry()
          trailGeo.setAttribute('position', new THREE.BufferAttribute(posBuf, 3))
          trailGeo.setDrawRange(0, 2)
          const trailMat = new THREE.LineBasicMaterial({ color: trailColor, transparent: true, opacity: 0.8 })
          const trail = new THREE.Line(trailGeo, trailMat)
          scene.add(trail)

          // ── Sprite head (canvas triangle pointing tip-up) ─────────
          const cvs = document.createElement('canvas')
          cvs.width = 32; cvs.height = 32
          const ctx2d = cvs.getContext('2d')
          if (ctx2d) {
            ctx2d.fillStyle = type === 'nuke' ? '#FF6600' : '#FF2233'
            ctx2d.beginPath()
            ctx2d.moveTo(16, 0)
            ctx2d.lineTo(24, 32)
            ctx2d.lineTo(8, 32)
            ctx2d.closePath()
            ctx2d.fill()
          }
          const tex = new THREE.CanvasTexture(cvs)
          tex.flipY = false // preserve canvas orientation so tip=top
          const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 1 })
          const sprite = new THREE.Sprite(spriteMat)
          sprite.scale.set(spriteSize, spriteSize, 1)
          scene.add(sprite)

          const t0 = performance.now()

          const anim: AnimFn = () => {
            const t = Math.min((performance.now() - t0) / duration, 1)

            const currentPos = curve.getPoint(t)
            sprite.position.copy(currentPos)

            // Rotate sprite to face direction of travel
            const cam = cameraRef.current
            if (cam && t < 0.99) {
              const nextPos = curve.getPoint(Math.min(t + 0.02, 1))
              const worldDir = nextPos.clone().sub(currentPos).normalize()
              const camDir = worldDir.clone().transformDirection(cam.matrixWorldInverse)
              spriteMat.rotation = Math.atan2(camDir.x, camDir.y)
            }

            // Grow trail
            const visiblePts = Math.max(2, Math.ceil(t * CURVE_SEGS) + 1)
            trailGeo.setDrawRange(0, Math.min(visiblePts, CURVE_SEGS + 1))
            if (t > 0.8) trailMat.opacity = 0.8 * (1 - (t - 0.8) / 0.2)

            if (t < 1) return true

            // ── Clean up missile ──────────────────────────────────
            scene.remove(sprite); tex.dispose(); spriteMat.dispose()
            scene.remove(trail);  trailGeo.dispose(); trailMat.dispose()

            // ── Notify impact (for sound) ─────────────────────────
            onImpactRef.current?.()

            // ── Flash PointLight ──────────────────────────────────
            const flash = new THREE.PointLight(0xff2233, 3, 2)
            flash.position.copy(to)
            scene.add(flash)
            setTimeout(() => scene.remove(flash), 300)

            // ── Impact ring (direct RAF — animsRef push gets overwritten) ──
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
              if (progress >= 1) {
                scene.remove(ring); rGeo.dispose(); rMat.dispose()
                return
              }
              ring.scale.set(progress * 3, progress * 3, 1)
              rMat.opacity = 1 - progress
              requestAnimationFrame(animateRing)
            }
            animateRing()

            // ── Camera shake (direct RAF) ─────────────────────────
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
