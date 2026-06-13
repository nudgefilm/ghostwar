'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GlobeHandle } from '@/components/Globe'
import EntryModal, { type Player } from '@/components/EntryModal'
import { useRealtimeMissiles, type NewsFeedRow, type CountryRow } from '@/hooks/useRealtimeMissiles'
import { createClient } from '@/lib/supabase/client'
import { COUNTRIES, COUNTRY_COORDS, COUNTRY_FLAGS, COUNTRY_NAMES } from '@/lib/countries'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Globe = dynamic(() => import('@/components/Globe'), { ssr: false }) as any

// ── Typewriter component ──────────────────────────────────────────────────────
function TypewriterText({
  text,
  speed = 22,
  instant = false,
}: {
  text: string
  speed?: number
  instant?: boolean
}) {
  const [displayed, setDisplayed] = useState(instant ? text : '')

  useEffect(() => {
    if (instant) {
      setDisplayed(text)
      return
    }
    setDisplayed('')
    let i = 0
    const timer = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) clearInterval(timer)
    }, speed)
    return () => clearInterval(timer)
  }, [text, speed, instant])

  return <span>{displayed}</span>
}

// ── Damage bar ────────────────────────────────────────────────────────────────
function DamageBar({ pct }: { pct: number }) {
  const color =
    pct < 30
      ? 'bg-[#00FFAA]'
      : pct < 70
        ? 'bg-yellow-400'
        : 'bg-[#FF2233]'
  return (
    <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden mx-2">
      <div className={`h-full ${color} transition-all duration-700`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const globeRef = useRef<GlobeHandle>(null)
  const launchingRef = useRef(false) // ref guard against double-tap race

  const [player, setPlayer] = useState<Player | null>(null)
  const [targetCountry, setTargetCountry] = useState<string | null>(null)
  const [weaponType, setWeaponType] = useState<'missile' | 'nuke'>('missile')
  const [quantity, setQuantity] = useState(1)
  const [missiles, setMissiles] = useState(100)
  const [nukes, setNukes] = useState(0)
  const [news, setNews] = useState<NewsFeedRow[]>([])
  const [countries, setCountries] = useState<Record<string, CountryRow>>({})
  const [isLaunching, setIsLaunching] = useState(false)
  const [interceptAlert, setInterceptAlert] = useState<string | null>(null)

  // ── Initial data load ─────────────────────────────────────────────────────
  useEffect(() => {
    const loadCountries = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('countries')
        .select('code, name, flag, damage_percent, online_users')
      if (data) {
        const map: Record<string, CountryRow> = {}
        data.forEach(c => { map[c.code] = c as CountryRow })
        setCountries(map)
      }
    }
    loadCountries()
  }, [])

  // ── Restore session from localStorage ────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ghostwar_player')
      if (!stored) return
      const p = JSON.parse(stored) as Player
      if (!p.id || !p.nickname || !p.country_code) return
      setPlayer(p)

      // Refresh ammo from DB
      const supabase = createClient()
      supabase
        .from('players')
        .select('missiles_remaining, nukes_remaining')
        .eq('id', p.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setMissiles(data.missiles_remaining)
            setNukes(data.nukes_remaining)
          }
        })
    } catch {
      localStorage.removeItem('ghostwar_player')
    }
  }, [])

  // ── Realtime callbacks ────────────────────────────────────────────────────
  const onMissile = useCallback(
    (missile: import('@/hooks/useRealtimeMissiles').MissileRow) => {
      // Incoming attack on our country
      if (missile.target_country === player?.country_code) {
        setInterceptAlert(`⚠ INCOMING: ${missile.launcher_country} → ${missile.target_country}`)
        setTimeout(() => setInterceptAlert(null), 4000)
      }
      // Animate other nations' missiles on globe (skip our own country's launches)
      if (missile.launcher_country !== player?.country_code) {
        const fromCoords = COUNTRY_COORDS[missile.launcher_country]
        const toCoords = COUNTRY_COORDS[missile.target_country]
        if (fromCoords && toCoords) {
          const remainingMs = Math.max(
            1000,
            new Date(missile.arrives_at).getTime() - Date.now(),
          )
          globeRef.current?.launchMissile(
            fromCoords[0], fromCoords[1],
            toCoords[0], toCoords[1],
            missile.quantity,
            missile.type as 'missile' | 'nuke',
            remainingMs,
          )
        }
      }
    },
    [player?.country_code],
  )

  const onNews = useCallback((item: NewsFeedRow) => {
    setNews(prev => [item, ...prev].slice(0, 20))
  }, [])

  const onCountryUpdate = useCallback((country: CountryRow) => {
    setCountries(prev => ({ ...prev, [country.code]: country }))
  }, [])

  useRealtimeMissiles({ onMissile, onNews, onCountryUpdate })

  // ── Handle enter ──────────────────────────────────────────────────────────
  const handleEnter = (p: Player) => {
    setPlayer(p)
  }

  // ── Handle launch ─────────────────────────────────────────────────────────
  const handleLaunch = async () => {
    if (!player || !targetCountry || launchingRef.current) return
    const ammo = weaponType === 'nuke' ? nukes : missiles
    if (ammo - quantity < 0) return

    // Synchronously lock via ref to block any concurrent tap before state re-render
    launchingRef.current = true
    setIsLaunching(true)

    try {
      const res = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          launcher_id: player.id,
          launcher_country: player.country_code,
          target_country: targetCountry,
          type: weaponType,
          quantity,
        }),
      })

      const data = (await res.json()) as {
        success?: boolean
        missile_id?: string
        arrives_at?: string
        flight_seconds?: number
        error?: string
      }

      if (data.success && data.flight_seconds) {
        const fromCoords = COUNTRY_COORDS[player.country_code]
        const toCoords = COUNTRY_COORDS[targetCountry]
        if (fromCoords && toCoords) {
          globeRef.current?.launchMissile(
            fromCoords[0], fromCoords[1],
            toCoords[0], toCoords[1],
            quantity,
            weaponType,
            data.flight_seconds * 1000,
          )
        }
        if (weaponType === 'missile') setMissiles(prev => prev - quantity)
        else setNukes(prev => prev - quantity)
      }
    } finally {
      launchingRef.current = false
      setIsLaunching(false)
    }
  }

  // ── Sorted damage rankings ────────────────────────────────────────────────
  const sortedCountries = Object.values(countries)
    .filter(c => c.damage_percent > 0)
    .sort((a, b) => b.damage_percent - a.damage_percent)
    .slice(0, 10)

  const launchDisabled =
    isLaunching ||
    !targetCountry ||
    (weaponType === 'missile' ? missiles : nukes) < quantity

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0B0B0C] font-mono">

      {/* ── Entry Modal ── */}
      {!player && <EntryModal onEnter={handleEnter} />}

      {/* ── Intercept alert ── */}
      {interceptAlert && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-40 px-4 py-2 border border-[#FF2233] bg-[#FF2233]/10 neon-glow text-xs tracking-widest">
          {interceptAlert}
        </div>
      )}

      {/* ══════════ Top bar ══════════ */}
      <header className="h-10 bg-zinc-950 border-b border-zinc-800 flex items-center px-3 shrink-0 gap-4 z-10">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[#FF2233] text-xs font-bold tracking-widest">GHOST WAR</span>
          <span className="text-zinc-700 text-[10px]">// GLOBAL WARFARE SIM</span>
        </div>
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          {news[0] ? (
            <span className="text-zinc-600 text-[10px] tracking-wider truncate">
              ─ {news[0].content} ─
            </span>
          ) : (
            <span className="text-zinc-800 text-[10px] tracking-wider">
              ─── AWAITING FIRST STRIKE ───
            </span>
          )}
        </div>
        <div className="shrink-0 text-zinc-700 text-[10px] tracking-wider">
          {player ? (
            <span>
              {COUNTRY_FLAGS[player.country_code]} {player.nickname}
            </span>
          ) : (
            'UNIDENTIFIED'
          )}
        </div>
      </header>

      {/* ══════════ 3-col layout ══════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ════ LEFT PANEL ════ */}
        <aside className="w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col overflow-y-auto shrink-0">

          {/* § 1 — OPERATOR */}
          <div className="p-3 border-b border-zinc-800">
            <div className="text-zinc-600 text-[10px] tracking-widest mb-2">OPERATOR</div>
            {player ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl leading-none">{COUNTRY_FLAGS[player.country_code]}</span>
                  <div>
                    <div className="text-zinc-200 text-xs font-bold tracking-wide">{player.nickname}</div>
                    <div className="text-zinc-600 text-[10px]">{COUNTRY_NAMES[player.country_code]}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[10px]">
                  <span className="text-zinc-500">
                    🚀 <span className="text-green-400 font-bold">{missiles}</span>
                  </span>
                  <span className="text-zinc-500">
                    ☢️ <span className="text-orange-400 font-bold">{nukes}</span>
                  </span>
                  <button
                    onClick={() => {
                      localStorage.removeItem('ghostwar_player')
                      setPlayer(null)
                    }}
                    className="ml-auto text-zinc-700 text-[10px] hover:text-zinc-500 transition-colors cursor-pointer"
                  >
                    [EXIT]
                  </button>
                </div>
              </>
            ) : (
              <div className="text-zinc-700 text-[10px]">NOT AUTHENTICATED</div>
            )}
          </div>

          {/* § 2 — WEAPONS */}
          <div className="p-3 border-b border-zinc-800">
            <div className="text-zinc-600 text-[10px] tracking-widest mb-2">WEAPONS</div>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setWeaponType('missile')}
                className={`flex-1 py-1.5 text-[10px] tracking-widest border transition-colors cursor-pointer ${
                  weaponType === 'missile'
                    ? 'bg-red-950 border-red-800 text-red-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600'
                }`}
              >
                🚀 MISSILE
              </button>
              <button
                onClick={() => setWeaponType('nuke')}
                disabled={nukes === 0}
                className={`flex-1 py-1.5 text-[10px] tracking-widest border transition-colors ${
                  weaponType === 'nuke'
                    ? 'bg-orange-950 border-orange-700 text-orange-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-600 hover:border-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer'
                }`}
              >
                ☢️ NUKE
              </button>
            </div>
            <input
              type="range"
              min={1}
              max={Math.min(10, weaponType === 'nuke' ? nukes : missiles)}
              value={quantity}
              onChange={e => setQuantity(Number(e.target.value))}
              className="w-full mb-2 accent-red-600"
            />
            <div className="text-zinc-500 text-[10px] text-center tracking-widest">
              <span className="text-white font-bold">{quantity}</span>
              {' × '}
              <span className={weaponType === 'nuke' ? 'text-orange-400' : 'text-red-400'}>
                {weaponType.toUpperCase()}
              </span>
            </div>
          </div>

          {/* § 3 — TARGET */}
          <div className="p-3 border-b border-zinc-800">
            <div className="text-zinc-600 text-[10px] tracking-widest mb-2">TARGET</div>
            <select
              value={targetCountry ?? ''}
              onChange={e => setTargetCountry(e.target.value || null)}
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] px-2 py-1.5 mb-2 focus:outline-none focus:border-zinc-500 cursor-pointer"
            >
              <option value="">── SELECT TARGET ──</option>
              {COUNTRIES.filter(c => c.code !== player?.country_code).map(c => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
            {targetCountry && (
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base leading-none">{COUNTRY_FLAGS[targetCountry]}</span>
                <span className="text-zinc-300 text-[10px]">{COUNTRY_NAMES[targetCountry]}</span>
              </div>
            )}
            {targetCountry && player && (
              <div className="text-zinc-700 text-[10px]">
                ETA{' '}
                <span className="text-zinc-400">
                  {Math.round(
                    (() => {
                      const f = COUNTRY_COORDS[player.country_code]
                      const t = COUNTRY_COORDS[targetCountry]
                      if (!f || !t) return 0
                      const R = 6371
                      const lat1 = f[0] * (Math.PI / 180)
                      const lon1 = f[1] * (Math.PI / 180)
                      const lat2 = t[0] * (Math.PI / 180)
                      const lon2 = t[1] * (Math.PI / 180)
                      const a =
                        Math.sin((lat2 - lat1) / 2) ** 2 +
                        Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
                      const dist = R * 2 * Math.asin(Math.sqrt(a))
                      return Math.max(10, Math.min(30, (dist / 20000) * 30))
                    })(),
                  )}{' '}
                  sec
                </span>
              </div>
            )}
          </div>

          {/* § 4 — LAUNCH */}
          <div className="p-3 border-b border-zinc-800">
            <button
              onClick={handleLaunch}
              disabled={launchDisabled}
              className="w-full py-3 bg-red-900 hover:bg-red-700 active:bg-red-600 disabled:opacity-25 disabled:cursor-not-allowed text-red-100 text-xs tracking-[0.3em] border border-red-800 hover:border-red-600 transition-all cursor-pointer"
            >
              {isLaunching ? '[ LAUNCHING... ]' : '🔴 LAUNCH'}
            </button>
          </div>

          {/* § 5 — DEFENSE */}
          <div className="p-3 border-b border-zinc-800">
            <div className="text-zinc-600 text-[10px] tracking-widest mb-2">DEFENSE SYSTEMS</div>
            <button
              disabled
              className="w-full py-1.5 mb-2 bg-zinc-800 border border-zinc-700 text-zinc-600 text-[10px] tracking-widest opacity-30 cursor-not-allowed"
            >
              🛡️ INTERCEPT
            </button>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-zinc-600" style={{ width: '0%' }} />
              </div>
              <span className="text-zinc-700 text-[10px]">0%</span>
            </div>
          </div>

          {/* § 6 — ALLIANCES */}
          <div className="p-3">
            <div className="text-zinc-600 text-[10px] tracking-widest mb-2">ALLIANCES</div>
            <div className="text-zinc-700 text-[10px]">No active alliances</div>
          </div>
        </aside>

        {/* ════ CENTER: Globe ════ */}
        <main className="flex-1 relative">
          <Globe ref={globeRef} />
        </main>

        {/* ════ RIGHT PANEL ════ */}
        <aside className="w-72 bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-y-auto shrink-0">

          {/* Breaking news */}
          <div className="p-3 border-b border-zinc-800 flex-1 min-h-0">
            <div className="text-zinc-600 text-[10px] tracking-widest mb-2">BREAKING NEWS</div>
            {news.length === 0 ? (
              <div className="text-zinc-800 text-[10px]">Awaiting first strike...</div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {news.map((item, i) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      const code = item.target_country
                      if (!code) return
                      const coords = COUNTRY_COORDS[code]
                      if (coords) globeRef.current?.flyTo(coords[0], coords[1])
                    }}
                    className={`w-full text-left text-[10px] leading-relaxed block cursor-pointer hover:opacity-80 transition-opacity ${
                      i === 0 ? 'neon-glow' : 'text-zinc-600'
                    }`}
                  >
                    <TypewriterText text={item.content} instant={i !== 0} speed={18} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Damage rankings */}
          <div className="p-3">
            <div className="text-zinc-600 text-[10px] tracking-widest mb-2">DAMAGE RANKINGS</div>
            {sortedCountries.length === 0 ? (
              <div className="text-zinc-800 text-[10px]">No damage recorded</div>
            ) : (
              <div className="space-y-2">
                {sortedCountries.map((c, i) => (
                  <button
                    key={c.code}
                    onClick={() => {
                      const coords = COUNTRY_COORDS[c.code]
                      if (coords) globeRef.current?.flyTo(coords[0], coords[1])
                    }}
                    className="w-full flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    <span className="text-zinc-600 text-[10px] w-4 shrink-0">#{i + 1}</span>
                    <span className="text-[12px] shrink-0">{c.flag}</span>
                    <DamageBar pct={c.damage_percent} />
                    <span
                      className={`text-[10px] w-8 text-right shrink-0 ${
                        c.damage_percent >= 70
                          ? 'text-[#FF2233]'
                          : c.damage_percent >= 30
                            ? 'text-yellow-400'
                            : 'text-[#00FFAA]'
                      }`}
                    >
                      {Math.round(c.damage_percent)}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
