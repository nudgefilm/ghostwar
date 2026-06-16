'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GlobeHandle, ImpactData } from '@/components/Globe'
import EntryModal, { type Player } from '@/components/EntryModal'
import TwemojiFlag from '@/components/TwemojiFlag'
import { BattleReportToast, UnderAttackToast, type BattleReportData, type UnderAttackData } from '@/components/CombatToast'
import RulesModal from '@/components/RulesModal'
import TutorialModal from '@/components/TutorialModal'
import InfoModal from '@/components/InfoModal'
import { useRealtimeMissiles, type NewsFeedRow, type CountryRow } from '@/hooks/useRealtimeMissiles'
import { createClient } from '@/lib/supabase/client'
import { COUNTRIES, COUNTRY_COORDS, COUNTRY_FLAGS, COUNTRY_NAMES } from '@/lib/countries'
import { SoundEngine } from '@/lib/sounds'
import EventTicker, { useEventTicker } from '@/components/EventTicker'
import GlobalComms from '@/components/GlobalComms'

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
    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden mx-2">
      <div className={`h-full ${color} transition-all duration-700`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

// ── Hall of Fame row: static when 1 entry, cycling fade when multiple ─────────
function HofRow({
  entries,
  color,
  empty,
  formatEntry,
}: {
  entries: { nickname: string; country_code: string }[]
  color: string
  empty: string
  formatEntry: (e: { nickname: string; country_code: string }) => string
}) {
  const [idx, setIdx] = useState(0)
  const [opacity, setOpacity] = useState(1)

  useEffect(() => {
    setIdx(0)
    setOpacity(1)
    if (entries.length <= 1) return
    let fadeTimer: ReturnType<typeof setTimeout> | null = null
    const id = setInterval(() => {
      setOpacity(0)
      fadeTimer = setTimeout(() => {
        setIdx(prev => (prev + 1) % entries.length)
        setOpacity(1)
      }, 300)
    }, 3000)
    return () => {
      clearInterval(id)
      if (fadeTimer) clearTimeout(fadeTimer)
    }
  }, [entries.length])

  if (entries.length === 0) {
    return <div className="text-[10px] text-center" style={{ color: '#71717a' }}>{empty}</div>
  }
  const e = entries[Math.min(idx, entries.length - 1)]
  return (
    <div
      className="text-[10px] text-center truncate font-mono tracking-wider"
      style={{ color, opacity, transition: 'opacity 0.3s ease' }}
    >
      {formatEntry(e)}
    </div>
  )
}

// ── Card wrapper style ────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,34,51,0.18)',
}

// ── Incoming threat ───────────────────────────────────────────────────────────
interface IncomingThreat {
  id: string
  launcher_country: string
  quantity: number
  type: 'missile' | 'nuke'
  arrives_at: string
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const globeRef = useRef<GlobeHandle>(null)
  const launchingRef = useRef(false)
  const processedMissileIdsRef = useRef<Set<string>>(new Set())
  const launchedMissileIdsRef = useRef<Set<string>>(new Set())
  const impactSoundCountRef = useRef(0)
  const impactSoundResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [player, setPlayer] = useState<Player | null>(null)
  const [targetCountry, setTargetCountry] = useState<string | null>(null)
  const [weaponType, setWeaponType] = useState<'missile' | 'nuke'>('missile')
  const [quantity, setQuantity] = useState(1)
  const [missiles, setMissiles] = useState(20)
  const [nukes, setNukes] = useState(0)
  const [recentStrikes, setRecentStrikes] = useState<NewsFeedRow[]>([])
  const [countries, setCountries] = useState<Record<string, CountryRow>>({})
  const [damagedRankings, setDamagedRankings] = useState<{ code: string; name: string; flag: string; damage_percent: number }[]>([])
  // onlineNations는 countries state에서 파생 — Realtime 갱신 자동 반영
  const [isLaunching, setIsLaunching] = useState(false)
  const [interceptAlert, setInterceptAlert] = useState<string | null>(null)
  const [nukeReward, setNukeReward] = useState<number | null>(null)
  const [strikeCount, setStrikeCount] = useState(0)
  const [nukeCount, setNukeCount] = useState(0)
  const [activeCount, setActiveCount] = useState(0)
  const [battleReport, setBattleReport] = useState<BattleReportData | null>(null)
  const [underAttackReport, setUnderAttackReport] = useState<UnderAttackData | null>(null)
  const [dailyBrief, setDailyBrief] = useState<string | null>(null)
  const [showRules, setShowRules] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [tutorialStep, setTutorialStep] = useState(0)
  const tutorialTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const [redeemCode, setRedeemCode] = useState('')
  const [redeemStatus, setRedeemStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isRedeeming, setIsRedeeming] = useState(false)
  const [infoModal, setInfoModal] = useState<'operator' | 'privacy' | 'terms' | null>(null)
  const [hofEntries, setHofEntries] = useState<{ nickname: string; country_code: string; action: string }[]>([])
  const [topTarget, setTopTarget] = useState<{ code: string; hits: number } | null>(null)
  const [alliances, setAlliances] = useState<{ country_a: string; country_b: string; request_count: number; status: string }[]>([])
  const [showAllianceDropdown, setShowAllianceDropdown] = useState(false)
  const [allianceTarget, setAllianceTarget] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { queue: tickerQueue, pushEvent, shift: shiftTicker } = useEventTicker()
  const pushEventRef = useRef(pushEvent)
  pushEventRef.current = pushEvent

  // ── Defense system state ──────────────────────────────────────────────────
  const [incomingThreats, setIncomingThreats] = useState<IncomingThreat[]>([])
  const [tick, setTick] = useState(0)
  const [resetCountdown, setResetCountdown] = useState('--:--:--')
  const [todayStr, setTodayStr] = useState('')

  // Stable ref for player (used in pagehide/beforeunload closure)
  const defenseStateRef = useRef({ player: null as Player | null })
  defenseStateRef.current = { player }

  // ── Initial data load ─────────────────────────────────────────────────────
  useEffect(() => {
    const loadCountries = async () => {
      const supabase = createClient()
      const todayUTC = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'
      const [{ data: countryData }, { count: todayStrikes }, { data: briefRow }] = await Promise.all([
        supabase.from('countries').select('code, name, flag, damage_stack, damage_percent, online_users'),
        supabase.from('missiles').select('*', { count: 'exact', head: true }).gte('launched_at', todayUTC),
        supabase.from('news_feed').select('content').eq('type', 'daily_brief').gte('created_at', todayUTC).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (countryData) {
        const map: Record<string, CountryRow> = {}
        countryData.forEach(c => { map[c.code] = c as CountryRow })
        setCountries(map)
      }
      if (todayStrikes != null) setStrikeCount(todayStrikes)
      if (briefRow?.content) setDailyBrief(briefRow.content)
    }
    loadCountries()
  }, [])

  // ── DAMAGE RANKINGS: load from localStorage on mount (daily reset at 00:00 UTC) ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ghostwar_recent_strikes')
      if (saved) {
        const { strikes, date } = JSON.parse(saved)
        const today = new Date().toISOString().slice(0, 10)
        if (date === today) {
          setDamagedRankings(strikes)
        } else {
          localStorage.removeItem('ghostwar_recent_strikes')
        }
      }
    } catch {}
  }, [])

  // ── DAMAGE RANKINGS: persist to localStorage on every update ─────────────
  useEffect(() => {
    if (damagedRankings.length === 0) return
    try {
      const today = new Date().toISOString().slice(0, 10)
      localStorage.setItem('ghostwar_recent_strikes', JSON.stringify({ strikes: damagedRankings, date: today }))
    } catch {}
  }, [damagedRankings])

  // ── Restore session from localStorage ────────────────────────────────────
  useEffect(() => {
    const restore = async () => {
      try {
        const stored = localStorage.getItem('ghostwar_player')
        if (!stored) return
        const p = JSON.parse(stored) as Player
        if (!p.id || !p.nickname || !p.country_code) return

        // Call enter to increment online_users — same path as normal login
        const res = await fetch('/api/player/enter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nickname: p.nickname, country_code: p.country_code }),
        })
        const json = await res.json() as { success?: boolean; player?: Player; error?: string }
        if (!json.player) {
          localStorage.removeItem('ghostwar_player')
          return
        }
        const restored = json.player
        setPlayer(restored)
        try { localStorage.setItem('ghostwar_player', JSON.stringify(restored)) } catch { /* ignore */ }

        const { data } = await createClient()
          .from('players')
          .select('missiles_remaining, nukes_remaining')
          .eq('id', restored.id)
          .single()
        if (data) {
          setMissiles(data.missiles_remaining)
          setNukes(data.nukes_remaining)
        }
      } catch {
        localStorage.removeItem('ghostwar_player')
      }
    }
    restore()
  }, [])

  // ── Realtime callbacks ────────────────────────────────────────────────────
  const onMissile = useCallback(
    (missile: import('@/hooks/useRealtimeMissiles').MissileRow) => {
      if (missile.target_country === player?.country_code && missile.launcher_country !== player?.country_code) {
        SoundEngine.init()
        SoundEngine.playAlert()
        setInterceptAlert(`⚠ INCOMING: ${missile.launcher_country} → ${missile.target_country}`)
        const homeCoords = COUNTRY_COORDS[player.country_code]
        if (homeCoords) globeRef.current?.flyTo(homeCoords[0], homeCoords[1], 1200)
      }

      // Track incoming threats for WARNING display
      if (
        missile.target_country === player?.country_code &&
        missile.launcher_id !== player?.id
      ) {
        setIncomingThreats(prev => {
          if (prev.some(t => t.id === missile.id)) return prev
          return [...prev, {
            id: missile.id,
            launcher_country: missile.launcher_country,
            quantity: missile.quantity,
            type: missile.type as 'missile' | 'nuke',
            arrives_at: missile.arrives_at,
          }]
        })
      }

      if (missile.launcher_country !== player?.country_code) {
        if (!launchedMissileIdsRef.current.has(missile.id)) {
          launchedMissileIdsRef.current.add(missile.id)
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
              missile.id,
              missile.target_country,
              missile.launcher_country,
            )
            setActiveCount(prev => prev + missile.quantity)
          }
        }
      }
    },
    [player?.country_code, player?.id],
  )

  const onNews = useCallback((item: NewsFeedRow) => {
    if (item.type === 'daily_brief') {
      setDailyBrief(item.content)
      return
    }
    // Dedup by target_country: remove existing entry for this country, prepend new one, cap at 5
    setRecentStrikes(prev => [item, ...prev.filter(n => n.target_country !== item.target_country)].slice(0, 3))
    setStrikeCount(prev => prev + 1)
    if (item.content?.includes('nuclear')) setNukeCount(prev => prev + 1)
  }, [])

  const onCountryUpdate = useCallback((country: CountryRow) => {
    setCountries(prev => ({ ...prev, [country.code]: country }))
  }, [])

  useRealtimeMissiles({ onMissile, onNews, onCountryUpdate })

  // ── Recovery: 1% per minute for all damaged countries ─────────────────────
  useEffect(() => {
    const tick = () => {
      fetch('/api/recover', { method: 'POST' })
        .then(r => r.json())
        .then((res: { updated?: { code: string; damage_stack: number; damage_percent: number }[] }) => {
          res.updated?.forEach(row => {
            setCountries(prev => {
              const existing = prev[row.code]
              if (!existing) return prev
              return { ...prev, [row.code]: { ...existing, damage_stack: row.damage_stack, damage_percent: row.damage_percent } }
            })
          })
        })
        .catch(() => {})
    }
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  // ── Hall of Fame: poll every 30s ──────────────────────────────────────────
  useEffect(() => {
    const fetchHof = () => {
      createClient()
        .from('hall_of_fame')
        .select('nickname, country_code, action')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(10)
        .then(({ data }) => {
          if (data) setHofEntries(data as { nickname: string; country_code: string; action: string }[])
        })
    }
    fetchHof()
    const id = setInterval(fetchHof, 30_000)
    return () => clearInterval(id)
  }, [])

  // ── Alliance data: fetch on login + poll every 30s ────────────────────────
  const fetchAlliances = useCallback(() => {
    if (!player?.country_code) return
    createClient()
      .from('alliances')
      .select('country_a, country_b, request_count, status')
      .or(`country_a.eq.${player.country_code},country_b.eq.${player.country_code}`)
      .neq('status', 'broken')
      .then(({ data }) => {
        if (data) setAlliances(data as { country_a: string; country_b: string; request_count: number; status: string }[])
      })
  }, [player?.country_code])

  useEffect(() => {
    if (!player?.country_code) return
    fetchAlliances()
    const id = setInterval(fetchAlliances, 30_000)
    return () => clearInterval(id)
  }, [fetchAlliances])

  // ── Most-attacked nation today: poll every 30s ────────────────────────────
  useEffect(() => {
    const fetchTopTarget = () => {
      const todayStart = new Date()
      todayStart.setUTCHours(0, 0, 0, 0)
      createClient()
        .from('missiles')
        .select('target_country')
        .neq('status', 'flying')
        .gte('launched_at', todayStart.toISOString())
        .then(({ data }) => {
          if (!data || data.length === 0) { setTopTarget(null); return }
          const counts: Record<string, number> = {}
          for (const row of data) {
            const c = (row as Record<string, unknown>).target_country as string
            counts[c] = (counts[c] ?? 0) + 1
          }
          const [code, hits] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
          setTopTarget({ code, hits })
        })
    }
    fetchTopTarget()
    const id = setInterval(fetchTopTarget, 30_000)
    return () => clearInterval(id)
  }, [])

  // ── Client-only clock: resetCountdown + todayStr (avoids SSR/hydration mismatch) ──
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
      const ms = tomorrow.getTime() - now.getTime()
      const hh = Math.floor(ms / 3_600_000)
      const mm = Math.floor((ms % 3_600_000) / 60_000)
      const ss = Math.floor((ms % 60_000) / 1_000)
      setResetCountdown([hh, mm, ss].map(n => String(n).padStart(2, '0')).join(':'))
      setTodayStr(now.toISOString().slice(0, 10))
    }
    tick()
    const id = setInterval(tick, 1_000)
    return () => clearInterval(id)
  }, [])

  // ── Decrement online_users on tab close / navigation ─────────────────────
  useEffect(() => {
    let fired = false
    const handleUnload = () => {
      if (fired) return
      fired = true
      const p = defenseStateRef.current.player
      if (!p) return
      navigator.sendBeacon(
        '/api/player/exit',
        new Blob([JSON.stringify({ player_id: p.id })], { type: 'application/json' }),
      )
    }
    window.addEventListener('pagehide', handleUnload)
    window.addEventListener('beforeunload', handleUnload)
    return () => {
      window.removeEventListener('pagehide', handleUnload)
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [])

  const cancelTutorialHighlight = () => {
    tutorialTimersRef.current.forEach(clearTimeout)
    tutorialTimersRef.current = []
    setTutorialStep(0)
  }

  const startTutorialHighlight = () => {
    tutorialTimersRef.current.forEach(clearTimeout)
    tutorialTimersRef.current = []
    for (let i = 1; i <= 5; i++) {
      tutorialTimersRef.current.push(setTimeout(() => setTutorialStep(i), (i - 1) * 2000))
    }
    tutorialTimersRef.current.push(setTimeout(() => setTutorialStep(0), 5 * 2000))
  }

  const handleEnter = (p: Player) => {
    setPlayer(p)
    createClient()
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
    if (!localStorage.getItem('ghostwar_rules_seen')) {
      setShowRules(true)
    } else if (!localStorage.getItem('hasSeenTutorial')) {
      setShowTutorial(true)
    }
  }

  const handleRulesClose = () => {
    localStorage.setItem('ghostwar_rules_seen', 'true')
    setShowRules(false)
    if (!localStorage.getItem('hasSeenTutorial')) {
      setShowTutorial(true)
    }
  }

  const handleTutorialClose = () => {
    localStorage.setItem('hasSeenTutorial', 'true')
    setShowTutorial(false)
    startTutorialHighlight()
  }

  const handleLogout = () => {
    if (player) {
      fetch('/api/player/exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: player.id }),
      }).catch(() => { /* ignore */ })
    }
    try { localStorage.removeItem('ghostwar_player') } catch { /* ignore */ }
    setPlayer(null)
    setMissiles(0)
    setNukes(0)
    setDropdownOpen(false)
  }

  const handleAllianceRequest = useCallback(async (targetCode: string) => {
    if (!player) return
    const [a, b] = [player.country_code, targetCode].sort()
    await fetch('/api/alliance/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country_a: a, country_b: b }),
    })
    fetchAlliances()
  }, [player, fetchAlliances])

  const handleAllianceAccept = useCallback(async (a: string, b: string) => {
    await fetch('/api/alliance/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country_a: a, country_b: b }),
    })
    fetchAlliances()
    SoundEngine.playAlliance()
  }, [fetchAlliances])

  const handleAllianceBreak = useCallback(async (a: string, b: string) => {
    await fetch('/api/alliance/break', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country_a: a, country_b: b }),
    })
    fetchAlliances()
  }, [fetchAlliances])

  const handleRedeem = async () => {
    if (!player || !redeemCode.trim() || isRedeeming) return
    SoundEngine.init()
    setIsRedeeming(true)
    setRedeemStatus(null)
    try {
      const data = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: player.id, code: redeemCode.trim() }),
      }).then(r => r.json() as Promise<{ success: boolean; reward?: string; amount?: number; nukes?: number; missiles?: number; error?: string }>)

      if (data.success) {
        if (data.reward === 'bundle') {
          setNukes(prev => prev + (data.nukes ?? 0))
          setMissiles(prev => prev + (data.missiles ?? 0))
          setRedeemStatus({ type: 'success', message: `+${data.nukes} NUKES & +${data.missiles} MISSILES UNLOCKED` })
        } else if (data.reward === 'missiles') {
          setMissiles(prev => prev + (data.amount ?? 0))
          setRedeemStatus({ type: 'success', message: `+${data.amount} MISSILES UNLOCKED` })
        } else {
          setNukes(prev => prev + (data.amount ?? 0))
          setRedeemStatus({ type: 'success', message: `+${data.amount} NUKES UNLOCKED` })
        }
        SoundEngine.playRewardEarned()
        setRedeemCode('')
      } else {
        const msg = data.error === 'CODE_ALREADY_USED' ? 'CODE ALREADY REDEEMED'
          : data.error === 'INVALID_CODE' ? 'INVALID CODE'
          : 'REDEMPTION FAILED'
        setRedeemStatus({ type: 'error', message: msg })
      }
    } catch {
      setRedeemStatus({ type: 'error', message: 'CONNECTION ERROR' })
    } finally {
      setIsRedeeming(false)
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  // ── Handle launch ─────────────────────────────────────────────────────────
  const handleLaunch = async () => {
    if (!player || !targetCountry || launchingRef.current) return
    const ammo = weaponType === 'nuke' ? nukes : missiles
    if (ammo - quantity < 0) return

    SoundEngine.init()
    launchingRef.current = true
    setIsLaunching(true)

    const fromCoords = COUNTRY_COORDS[player.country_code]
    if (fromCoords) globeRef.current?.flyTo(fromCoords[0], fromCoords[1], 1200)

    const apiPromise = fetch('/api/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        launcher_id: player.id,
        launcher_country: player.country_code,
        target_country: targetCountry,
        type: weaponType,
        quantity,
      }),
    }).then(r => r.json() as Promise<{
      success?: boolean
      missile_id?: string
      arrives_at?: string
      flight_seconds?: number
      nukes_earned?: number
      attacker_debuffed?: boolean
      betrayal?: boolean
      alliance_reduction?: number
      error?: string
    }>).catch(() => null)

    await new Promise<void>(resolve => setTimeout(resolve, 800))

    try {
      const data = await apiPromise
      if (data?.success && data.flight_seconds) {
        const toCoords = COUNTRY_COORDS[targetCountry]
        if (fromCoords && toCoords) {
          if (weaponType === 'nuke') {
            SoundEngine.playNukeLaunch()
          } else {
            const plays = Math.min(quantity, 5)
            for (let i = 0; i < plays; i++) {
              setTimeout(() => SoundEngine.playLaunch(), i * 130)
            }
          }
          console.log(`[LAUNCH-SELF] id=${data.missile_id?.slice(0,8)} qty=${quantity} type=${weaponType}`)
          globeRef.current?.launchMissile(
            fromCoords[0], fromCoords[1],
            toCoords[0], toCoords[1],
            quantity,
            weaponType,
            data.flight_seconds * 1000,
            data.missile_id,
            targetCountry ?? undefined,
            player.country_code,
          )
          setActiveCount(prev => prev + quantity)
        }
        if (weaponType === 'missile') setMissiles(prev => prev - quantity)
        else setNukes(prev => prev - quantity)
        if (data.nukes_earned && data.nukes_earned > 0) {
          setNukes(prev => prev + data.nukes_earned!)
          setNukeReward(data.nukes_earned!)
          setTimeout(() => setNukeReward(null), 4000)
          pushEvent(`☢ NUKE EARNED — +${data.nukes_earned}`, 'reward')
        }
        if (data.betrayal) {
          pushEvent(`🚨 ALLIANCE BROKEN — betrayal strike on ${COUNTRY_NAMES[targetCountry] ?? targetCountry}`, 'alliance')
          fetchAlliances()
        }
      }
    } finally {
      launchingRef.current = false
      setIsLaunching(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const myAlliances = player
    ? alliances.filter(a => a.country_a === player.country_code || a.country_b === player.country_code)
    : []
  const pendingIncoming = myAlliances.filter(a => a.status === 'pending')
  const activeAlliances = myAlliances.filter(a => a.status === 'active')

  const primaryThreat = incomingThreats.length > 0
    ? [...incomingThreats].sort(
        (a, b) => new Date(a.arrives_at).getTime() - new Date(b.arrives_at).getTime(),
      )[0]
    : null
  // tick forces re-computation of timeRemaining every 500ms
  void tick
  const primaryTimeRemaining = primaryThreat
    ? Math.max(0, Math.round((new Date(primaryThreat.arrives_at).getTime() - Date.now()) / 1000))
    : 0

  // DEFCON level derived from active missile count (no extra query)
  const defconLevel = activeCount === 0 ? 5 : activeCount <= 3 ? 4 : activeCount <= 7 ? 3 : activeCount <= 15 ? 2 : 1
  const defconColor = ({ 5: '#00FFAA', 4: '#FFCC00', 3: '#FF8800', 2: '#FF4400', 1: '#FF2233' } as Record<number, string>)[defconLevel]
  const defconFilled = 6 - defconLevel  // DEFCON 1 → 5 bars lit, DEFCON 5 → 1 bar lit

  const onlineCountries = Object.values(countries)
    .filter(c => (c.online_users ?? 0) > 0)
    .map(c => ({ code: c.code, flag: COUNTRY_FLAGS[c.code] ?? c.flag, name: COUNTRY_NAMES[c.code] ?? c.name }))
    .filter(c => c.flag)

  const launchDisabled =
    isLaunching ||
    !targetCountry ||
    (weaponType === 'missile' ? missiles : nukes) < quantity

  // ─────────────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center font-mono px-6 text-center"
        style={{ background: '#0B0B0C' }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.18) 2px,rgba(0,0,0,0.18) 3px)',
          }}
        />
        <div className="relative flex flex-col items-center gap-4 max-w-xs">
          <div
            className="text-4xl font-black tracking-[0.2em]"
            style={{ color: '#FF2233', textShadow: '0 0 24px rgba(255,34,51,0.7)' }}
          >
            GHOST WAR
          </div>
          <div
            className="text-xs tracking-[0.35em] font-bold"
            style={{ color: '#00FFAA', textShadow: '0 0 10px rgba(0,255,170,0.5)' }}
          >
            GLOBAL WARFARE SIM
          </div>
          <div className="w-24 border-t" style={{ borderColor: 'rgba(255,34,51,0.3)' }} />
          <p className="text-zinc-400 text-xs leading-relaxed tracking-wide">
            GHOST WAR is optimized for desktop. Please access from a PC or laptop for the best experience.
          </p>
          <div
            className="text-sm tracking-widest font-bold mt-2"
            style={{ color: '#00AAFF', textShadow: '0 0 12px rgba(0,170,255,0.5)' }}
          >
            ghostwar.xyz
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="font-mono bg-[#0B0B0C]">

      {/* Entry Modal */}
      {!player && <EntryModal onEnter={handleEnter} />}

      {/* Intercept alert */}
      {interceptAlert && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-40 px-4 py-2 border border-[#FF2233] bg-[#FF2233]/10 neon-glow text-xs tracking-widest">
          {interceptAlert}
        </div>
      )}

      {/* Tutorial sequence dismiss button */}
      {tutorialStep > 0 && (
        <button
          onClick={cancelTutorialHighlight}
          className="fixed top-12 right-2 z-50 w-7 h-7 flex items-center justify-center text-[11px] font-bold cursor-pointer pointer-events-auto"
          style={{
            color: '#00AAFF',
            border: '1px solid rgba(0,170,255,0.45)',
            background: 'rgba(0,0,0,0.82)',
            boxShadow: '0 0 8px rgba(0,170,255,0.25)',
          }}
        >
          ✕
        </button>
      )}

      {/* Nuke reward alert */}
      {nukeReward && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-40 px-4 py-2 border border-orange-500 bg-orange-500/10 text-orange-400 text-xs tracking-widest">
          ☢️ NUKE ACQUIRED +{nukeReward}
        </div>
      )}

      {/* Event ticker — centered below top bar, above globe */}
      <EventTicker queue={tickerQueue} onShift={shiftTicker} />

      {/* Globe — full screen */}
      <div className="fixed inset-0 z-0" style={{ width: '100vw', height: '100vh' }}>
        <Globe ref={globeRef} playerCountry={player?.country_code} onImpact={(data: ImpactData) => {
          SoundEngine.init()
          setActiveCount(prev => Math.max(0, prev - 1))

          if (!data.missileId || !data.targetCountry) return

          const soundVolume = (data.type === 'nuke' ||
            data.launcherCountry === player?.country_code ||
            data.targetCountry === player?.country_code) ? 1.0 : 0.5

          // Judgment + API run once; sound fires on every staggered arrival
          if (processedMissileIdsRef.current.has(data.missileId)) {
            impactSoundCountRef.current++
            if (impactSoundResetRef.current) clearTimeout(impactSoundResetRef.current)
            impactSoundResetRef.current = setTimeout(() => { impactSoundCountRef.current = 0 }, 800)
            if (impactSoundCountRef.current <= 10) SoundEngine.playImpact(soundVolume)
            return
          }
          processedMissileIdsRef.current.add(data.missileId)

          // Clean up threat on arrival
          setIncomingThreats(prev => {
            const remaining = prev.filter(t => t.id !== data.missileId)
            if (remaining.length === 0) setInterceptAlert(null)
            return remaining
          })

          // ── Hit: play sound immediately + call /api/impact ──────────────
          impactSoundCountRef.current++
          if (impactSoundResetRef.current) clearTimeout(impactSoundResetRef.current)
          impactSoundResetRef.current = setTimeout(() => { impactSoundCountRef.current = 0 }, 800)
          if (impactSoundCountRef.current <= 10) SoundEngine.playImpact(soundVolume)

          fetch('/api/impact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ missile_id: data.missileId, target_country: data.targetCountry }),
          })
            .then(r => r.json())
            .then((result: {
              success: boolean; already_processed: boolean; was_intercepted: boolean
              launcher_id: string; launcher_country: string
              quantity: number; type: string
              attacker_debuffed: boolean
              alliance_reduction: number
              prev_damage_percent: number; new_damage_percent: number
              old_rank: number | null; new_rank: number | null
            }) => {
              if (!result.success) return

              // Update DAMAGE RANKINGS from API response — no DB re-fetch, mirrors LIVE STRIKES pattern
              const targetCode = data.targetCountry as string
              const rankEntry = {
                code: targetCode,
                name: COUNTRY_NAMES[targetCode] ?? targetCode,
                flag: COUNTRY_FLAGS[targetCode] ?? '',
                damage_percent: result.new_damage_percent,
              }
              setDamagedRankings(prev => [rankEntry, ...prev.filter(e => e.code !== targetCode)].slice(0, 3))

              // Scorched Earth ticker — fires for any country reaching 100% (player involvement not required)
              if (!result.already_processed && result.prev_damage_percent < 100 && result.new_damage_percent >= 100) {
                const scorchedName = COUNTRY_NAMES[data.targetCountry as string] ?? data.targetCountry
                pushEvent(`☠ ${scorchedName} SCORCHED — attacks reduced 50%`, 'combat')
              }

              const isAttacker = player && result.launcher_id === player.id
              const isVictim = data.targetCountry === player?.country_code && result.launcher_id !== player?.id
              if (!isAttacker && !isVictim) return

              const qty = result.quantity ?? 1
              const type = result.type as 'missile' | 'nuke'

              // Victim: show UnderAttackModal
              if (isVictim) {
                setUnderAttackReport({
                  launcherCountry: result.launcher_country || data.launcherCountry || '',
                  quantity: qty,
                  interceptedCount: 0,
                  prevDamagePercent: Math.round(result.prev_damage_percent),
                  newDamagePercent: Math.round(result.new_damage_percent),
                  wasIntercepted: false,
                })
                return
              }

              // Attacker: show BattleReportModal
              const infraDelta = !result.already_processed
                ? result.new_damage_percent - result.prev_damage_percent
                : null
              const ecoRaw = qty * (type === 'nuke' ? 500 : 50)
              const economicDamage = ecoRaw >= 1000
                ? `$${(ecoRaw / 1000).toFixed(1)}B`
                : `$${ecoRaw}M`

              const reportPayload: BattleReportData = {
                role: 'attacker',
                targetCountry: data.targetCountry!,
                launcherCountry: result.launcher_country || data.launcherCountry || '',
                quantity: qty,
                type,
                successRate: 100,
                intercepted: 0,
                infrastructureDamage: infraDelta,
                economicDamage,
                oldRank: result.old_rank,
                newRank: result.new_rank,
                attacker_debuffed: result.attacker_debuffed ?? false,
                targetDestroyed: !result.already_processed && result.prev_damage_percent < 100 && result.new_damage_percent >= 100,
                alliance_reduction_percent: result.alliance_reduction > 0 ? result.alliance_reduction : undefined,
              }
              const modalDelay = type === 'nuke' ? 5500 : 0
              if (modalDelay > 0) setTimeout(() => setBattleReport(reportPayload), modalDelay)
              else setBattleReport(reportPayload)
            })
            .catch(() => {})
        }} />
      </div>

      {/* Global Comms — bottom-left overlay on globe */}
      <GlobalComms player={player} />

      {/* Rules Modal */}
      {showRules && <RulesModal onClose={handleRulesClose} />}

      {/* Tutorial Modal — first-time only */}
      {showTutorial && <TutorialModal onClose={handleTutorialClose} />}

      {/* Operator Info Modal */}
      {infoModal === 'operator' && (
        <InfoModal title="OPERATOR INFORMATION" onClose={() => setInfoModal(null)}>
          <div className="space-y-3">
            {([
              ['Service', 'Global Ghost War'],
              ['Operator', 'UNFOLD LAB'],
              ['Representative', 'JAEWOO JUNG'],
              ['Business Registration No.', '136-11-23540'],
              ['Address', '214-S46, 46, Apgujeong-ro 2-gil, Gangnam-gu, Seoul, 06034, Republic of Korea'],
              ['Contact', 'nudgefilm@gmail.com'],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label}>
                <div className="text-zinc-300 text-[10px] tracking-wider uppercase mb-0.5">{label}</div>
                <div className="text-zinc-200 text-xs">{value}</div>
              </div>
            ))}
          </div>
        </InfoModal>
      )}

      {/* Privacy Policy Modal */}
      {infoModal === 'privacy' && (
        <InfoModal title="PRIVACY POLICY" onClose={() => setInfoModal(null)}>
          <div className="space-y-3 text-xs text-zinc-200 leading-relaxed">
            <p>Global Ghost War collects minimal information necessary for gameplay:</p>
            <ul className="space-y-1 ml-2">
              <li>— Nickname (chosen by you, stored to identify your account)</li>
              <li>— Country selection (your chosen nation for gameplay)</li>
              <li>— Gameplay statistics (missiles fired, damage dealt, rankings)</li>
            </ul>
            <div>
              <div className="text-zinc-200 font-bold mb-1">We do NOT collect:</div>
              <ul className="space-y-1 ml-2">
                <li>— Real names, email addresses, or contact information</li>
                <li>— IP addresses for tracking purposes</li>
                <li>— Payment information (handled by third-party processors if/when purchases are available)</li>
              </ul>
            </div>
            <p>Data is stored securely via Supabase and is used solely to provide game functionality (session persistence, leaderboards, real-time multiplayer features).</p>
            <p>You may request account data deletion by contacting: <span className="text-zinc-100">nudgefilm@gmail.com</span></p>
            <p className="text-zinc-400">Last updated: 2026-06-14</p>
          </div>
        </InfoModal>
      )}

      {/* Terms of Service Modal */}
      {infoModal === 'terms' && (
        <InfoModal title="TERMS OF SERVICE" onClose={() => setInfoModal(null)}>
          <div className="space-y-3 text-xs text-zinc-200 leading-relaxed">
            <p>Global Ghost War is a fictional, satirical strategy simulation game created for entertainment purposes only.</p>
            <ul className="space-y-1.5 ml-2">
              <li>— All nation representations, conflicts, and &quot;attacks&quot; depicted are part of a game mechanic and do not reflect real-world events, political positions, or endorsements.</li>
              <li>— By using this service, you agree to engage respectfully with other players. Harassment, hate speech, or abuse directed at other users (regardless of in-game &quot;nationality&quot;) is prohibited.</li>
              <li>— The operator (UNFOLD LAB) reserves the right to suspend or terminate accounts that violate these terms.</li>
              <li>— This service is provided &quot;as is&quot; without warranties. The operator is not liable for service interruptions, data loss, or any damages arising from use of this game.</li>
              <li>— Game rules, mechanics, and features (see RULES OF ENGAGEMENT) may change at any time without prior notice.</li>
            </ul>
            <p>For questions, contact: <span className="text-zinc-100">nudgefilm@gmail.com</span></p>
            <p className="text-zinc-400">Last updated: 2026-06-14</p>
          </div>
        </InfoModal>
      )}

      {/* Battle Report Toast (attacker) */}
      {battleReport && (
        <BattleReportToast
          report={battleReport}
          onClose={() => setBattleReport(null)}
          onRetaliate={(country) => {
            setTargetCountry(country)
            setBattleReport(null)
          }}
        />
      )}

      {/* Under Attack Toast (victim — hit or successful defense) */}
      {underAttackReport && (
        <UnderAttackToast
          report={underAttackReport}
          onClose={() => setUnderAttackReport(null)}
          onRetaliate={(country) => {
            setTargetCountry(country)
            setUnderAttackReport(null)
          }}
        />
      )}

      {/* Top bar */}
      {/* Admin: 좌상단 모서리 클릭 → 별똥별 즉시 발동 */}
      <div
        className="fixed top-0 left-0 z-50 w-6 h-6 cursor-default"
        onClick={() => window.dispatchEvent(new Event('ghostwar:shooting-star'))}
      />
      <header
        className="fixed top-0 left-0 right-0 z-20 h-10 flex items-center px-3 gap-4"
        style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,34,51,0.15)' }}
      >
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[#FF2233] text-xs font-bold tracking-widest">GHOST WAR</span>
          <span className="text-zinc-300 text-[10px]">// GLOBAL WARFARE SIM</span>
        </div>
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          <span className="text-zinc-200 text-[10px] tracking-wider whitespace-nowrap">
            {todayStr} │ {onlineCountries.length} USERS │ ⚔ {strikeCount} STRIKES TODAY │ ☢ {nukeCount} NUKES │ 💥 {activeCount} ACTIVE
          </span>
        </div>
        <div className="shrink-0 text-[10px] tracking-wider">
          {player ? (
            <div ref={dropdownRef} className="relative">
              <div
                className="flex items-center gap-1.5 cursor-pointer text-zinc-200 hover:text-white transition-colors select-none"
                onClick={() => setDropdownOpen(p => !p)}
                onMouseEnter={() => setDropdownOpen(true)}
              >
                <TwemojiFlag code={player.country_code} size={14} />
                <span>{player.nickname}</span>
                <span className="text-zinc-300 text-[9px]">▾</span>
              </div>
              {dropdownOpen && (
                <div
                  className="absolute top-full right-0 mt-1 min-w-[130px] z-50"
                  style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,34,51,0.2)' }}
                  onMouseLeave={() => setDropdownOpen(false)}
                >
                  <button
                    onClick={() => { setShowRules(true); setDropdownOpen(false) }}
                    className="w-full text-left px-3 py-2 text-[10px] tracking-widest text-zinc-200 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    ❓ RULES
                  </button>
                  <div className="border-t mx-2" style={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 text-[10px] tracking-widest text-zinc-200 hover:text-[#FF2233] hover:bg-[#FF2233]/5 transition-colors cursor-pointer"
                  >
                    🚪 LOGOUT
                  </button>
                </div>
              )}
            </div>
          ) : (
            <span className="text-zinc-300">UNIDENTIFIED</span>
          )}
        </div>
      </header>

      {/* ══ LEFT PANEL — pointer-events-none lets wheel events reach the globe ══ */}
      <aside
        className="fixed left-0 top-10 bottom-0 z-10 w-64 flex flex-col gap-2 p-2 overflow-y-auto pointer-events-none"
        style={{ scrollbarWidth: 'none' }}
      >

        {/* OPERATOR */}
        <div className="pointer-events-auto p-3" style={CARD}>
          <div className="text-zinc-300 text-[10px] tracking-widest mb-2">OPERATOR</div>
          {player ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <TwemojiFlag code={player.country_code} size={32} />
                <div>
                  <div className="text-zinc-200 text-sm font-bold tracking-wide">{player.nickname}</div>
                  <div className="text-zinc-200 text-sm">{COUNTRY_NAMES[player.country_code]}</div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[10px]">
                <span className="text-zinc-200">🚀 <span className="text-green-400 font-bold">{missiles}</span></span>
                <span className="text-zinc-200">☢️ <span className="text-orange-400 font-bold">{nukes}</span></span>
                <button
                  onClick={handleLogout}
                  className="ml-auto text-zinc-400 text-[10px] hover:text-zinc-300 transition-colors cursor-pointer"
                >
                  [EXIT]
                </button>
              </div>
              {(countries[player.country_code]?.damage_percent ?? 0) >= 100 && (
                <div
                  className="mt-2 px-2 py-1 text-[10px] tracking-widest text-[#FF2233] text-center animate-pulse"
                  style={{ background: 'rgba(255,34,51,0.15)' }}
                >
                  🔥 SCORCHED EARTH — ATTACK POWER -50%
                </div>
              )}
            </>
          ) : (
            <div className="text-zinc-400 text-[10px]">NOT AUTHENTICATED</div>
          )}
        </div>

        {/* WEAPONS */}
        <div className={`pointer-events-auto p-3${tutorialStep === 2 ? ' tutorial-highlight' : ''}`} style={CARD}>
          {tutorialStep === 2 && (
            <div className="text-[10px] tracking-wider mb-2 pb-1.5 border-b" style={{ color: '#00AAFF', borderColor: 'rgba(0,170,255,0.25)' }}>
              ▶ Choose missile or nuke (nuke requires stock)
            </div>
          )}
          <div className="text-zinc-300 text-[10px] tracking-widest mb-2">WEAPONS</div>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setWeaponType('missile')}
              className={`flex-1 py-1.5 text-[10px] tracking-widest border transition-colors cursor-pointer ${
                weaponType === 'missile'
                  ? 'bg-red-950 border-red-800 text-red-300'
                  : 'bg-zinc-800/60 border-zinc-700 text-zinc-200 hover:border-zinc-600'
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
                  : 'bg-zinc-800/60 border-zinc-700 text-zinc-300 hover:border-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer'
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
          <div className="text-zinc-200 text-[10px] text-center tracking-widest">
            <span className="text-white font-bold">{quantity}</span>
            {' × '}
            <span className={weaponType === 'nuke' ? 'text-orange-400' : 'text-red-400'}>
              {weaponType.toUpperCase()}
            </span>
          </div>
        </div>

        {/* TARGET */}
        <div className={`pointer-events-auto p-3${tutorialStep === 1 ? ' tutorial-highlight' : ''}`} style={CARD}>
          {tutorialStep === 1 && (
            <div className="text-[10px] tracking-wider mb-2 pb-1.5 border-b" style={{ color: '#00AAFF', borderColor: 'rgba(0,170,255,0.25)' }}>
              ▶ Select your target nation
            </div>
          )}
          <div className="text-zinc-300 text-[10px] tracking-widest mb-2">TARGET</div>
          <select
            value={targetCountry ?? ''}
            onChange={e => setTargetCountry(e.target.value || null)}
            className="w-full border border-zinc-700 text-zinc-200 text-[10px] px-2 py-1.5 mb-2 focus:outline-none focus:border-zinc-500 cursor-pointer"
            style={{ background: '#0d0d0f' }}
          >
            <option value="" style={{ background: '#0d0d0f' }}>── SELECT TARGET ──</option>
            {COUNTRIES.filter(c => c.code !== player?.country_code).map(c => {
              const destroyed = (countries[c.code]?.damage_percent ?? 0) >= 100
              return (
                <option key={c.code} value={c.code} disabled={destroyed} style={{ background: '#0d0d0f' }}>
                  {destroyed ? '💀' : c.flag} {c.name}{destroyed ? ' [DESTROYED]' : ''}
                </option>
              )
            })}
          </select>
          {targetCountry && (
            <div className="flex items-center gap-2 mb-1">
              <TwemojiFlag code={targetCountry} size={20} />
              <span className="text-zinc-200 text-sm">{COUNTRY_NAMES[targetCountry]}</span>
            </div>
          )}
          {targetCountry && player && (
            <div className="text-zinc-200 text-xs">
              ETA{' '}
              <span className="text-zinc-200 text-sm">
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

        {/* LAUNCH */}
        <div className={`pointer-events-auto p-3${tutorialStep === 3 ? ' tutorial-highlight' : ''}`} style={CARD}>
          {tutorialStep === 3 && (
            <div className="text-[10px] tracking-wider mb-2 pb-1.5 border-b" style={{ color: '#00AAFF', borderColor: 'rgba(0,170,255,0.25)' }}>
              ▶ Launch your attack
            </div>
          )}
          <button
            onClick={handleLaunch}
            disabled={launchDisabled}
            className="w-full py-3 bg-red-900 hover:bg-red-700 active:bg-red-600 disabled:opacity-25 disabled:cursor-not-allowed text-red-100 text-xs tracking-[0.3em] border border-red-800 hover:border-red-600 transition-all cursor-pointer"
          >
            {isLaunching ? '[ LAUNCHING... ]' : '🔴 LAUNCH'}
          </button>
        </div>

        {/* DEFENSE */}
        {primaryThreat ? (
          <div
            className="pointer-events-auto p-3 animate-pulse"
            style={{ ...CARD, background: 'rgba(255,34,51,0.15)', borderColor: 'rgba(255,34,51,0.5)' }}
          >
            <div className="text-[#FF2233] text-[10px] tracking-widest mb-2 font-bold truncate">
              ⚠️ WARNING: {primaryThreat.quantity} INBOUND FROM {primaryThreat.launcher_country}
            </div>
            <div className="text-zinc-400 text-[10px] tracking-widest mb-2">DEFENSE SYSTEMS</div>
            {(() => {
              const dmg = player?.country_code ? (countries[player.country_code]?.damage_percent ?? 0) : 0
              const rating = Math.round((100 - dmg) * 0.3)
              const filled = Math.round(rating / 6)
              return (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-[#FF2233] transition-all duration-700" style={{ width: `${rating}%` }} />
                  </div>
                  <span className="text-[#FF2233] text-[10px]">{rating}%</span>
                  <span className="text-[#FF2233] text-[9px] font-mono">{'█'.repeat(filled)}{'░'.repeat(5 - filled)}</span>
                </div>
              )
            })()}
          </div>
        ) : (
          <div className="pointer-events-auto p-3" style={CARD}>
            <div className="text-zinc-300 text-[10px] tracking-widest mb-2">DEFENSE SYSTEMS</div>
            {(() => {
              const dmg = player?.country_code ? (countries[player.country_code]?.damage_percent ?? 0) : 0
              const rating = Math.round((100 - dmg) * 0.3)
              const filled = Math.round(rating / 6)
              return (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-[#00FFAA] transition-all duration-700" style={{ width: `${rating}%` }} />
                  </div>
                  <span className="text-zinc-300 text-[10px]">{rating}%</span>
                  <span className="text-zinc-400 text-[9px] font-mono">{'█'.repeat(filled)}{'░'.repeat(5 - filled)}</span>
                </div>
              )
            })()}
          </div>
        )}

        {/* ALLIANCES — only shown when logged in */}
        {player && (
          <div className="pointer-events-auto p-3" style={{ ...CARD, borderColor: 'rgba(0,255,170,0.22)' }}>
            <div className="text-zinc-300 text-[10px] tracking-widest mb-2">ALLIANCES</div>

            {/* Pending incoming requests */}
            {pendingIncoming.map(a => {
              const other = a.country_a === player.country_code ? a.country_b : a.country_a
              return (
                <div key={`${a.country_a}-${a.country_b}`} className="mb-2 p-1.5 border border-[#00FFAA]/25 bg-[#00FFAA]/5">
                  <div className="text-[#00FFAA] text-[10px] mb-1">
                    🤝 {COUNTRY_FLAGS[other] ?? ''} {COUNTRY_NAMES[other] ?? other} requests alliance
                  </div>
                  <button
                    onClick={() => handleAllianceAccept(a.country_a, a.country_b)}
                    className="text-[10px] tracking-widest border border-[#00FFAA]/50 hover:border-[#00FFAA] px-2 py-0.5 text-[#00FFAA] hover:bg-[#00FFAA]/10 transition-colors cursor-pointer"
                  >
                    [ ACCEPT ]
                  </button>
                </div>
              )
            })}

            {/* Active alliances with strength bar */}
            {activeAlliances.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {activeAlliances.map(a => {
                  const other = a.country_a === player.country_code ? a.country_b : a.country_a
                  const strength = Math.min(50, a.request_count * 5)
                  const filled = Math.round(strength / 10)
                  return (
                    <div key={`${a.country_a}-${a.country_b}`} className="flex items-center gap-1.5">
                      <TwemojiFlag code={other} size={12} className="shrink-0" />
                      <span className="text-zinc-200 text-[10px] w-14 truncate shrink-0">{COUNTRY_NAMES[other] ?? other}</span>
                      <span className="text-[#00FFAA] text-[10px] font-mono">
                        {'█'.repeat(filled)}{'░'.repeat(5 - filled)}
                      </span>
                      <span className="text-[#00FFAA] text-[9px] ml-0.5">{strength}%</span>
                      <button
                        onClick={() => handleAllianceBreak(a.country_a, a.country_b)}
                        className="ml-auto text-zinc-500 text-[9px] hover:text-[#FF2233] transition-colors cursor-pointer shrink-0"
                      >
                        [BREAK]
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {activeAlliances.length === 0 && pendingIncoming.length === 0 && (
              <div className="text-zinc-300 text-[10px] mb-2">No active alliances</div>
            )}

            {/* Request a new alliance */}
            {!showAllianceDropdown ? (
              <button
                onClick={() => setShowAllianceDropdown(true)}
                className="w-full py-1.5 text-[10px] tracking-widest border border-[#00FFAA]/25 hover:border-[#00FFAA]/50 text-[#00FFAA] hover:bg-[#00FFAA]/5 transition-colors cursor-pointer"
              >
                [ REQUEST ALLIANCE ]
              </button>
            ) : (
              <div>
                <select
                  value={allianceTarget}
                  onChange={e => setAllianceTarget(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-[10px] px-2 py-1 mb-1"
                >
                  <option value="">— SELECT NATION —</option>
                  {COUNTRIES.filter(c => c.code !== player.country_code).map(c => (
                    <option key={c.code} value={c.code}>{COUNTRY_FLAGS[c.code] ?? ''} {c.name}</option>
                  ))}
                </select>
                <div className="flex gap-1">
                  <button
                    onClick={async () => {
                      if (!allianceTarget) return
                      await handleAllianceRequest(allianceTarget)
                      setAllianceTarget('')
                      setShowAllianceDropdown(false)
                    }}
                    className="flex-1 py-1 text-[10px] tracking-widest border border-[#00FFAA]/50 text-[#00FFAA] hover:bg-[#00FFAA]/10 transition-colors cursor-pointer"
                  >
                    SEND
                  </button>
                  <button
                    onClick={() => { setShowAllianceDropdown(false); setAllianceTarget('') }}
                    className="px-2 py-1 text-[10px] border border-zinc-700 text-zinc-300 hover:text-zinc-200 transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </aside>

      {/* ══ RIGHT PANEL ══ */}
      <aside className="fixed right-0 top-10 bottom-0 z-10 w-64 flex flex-col gap-2 p-2 pointer-events-none">

        {/* DAILY BRIEF — pinned above LIVE STRIKES when available */}
        {dailyBrief && (
          <div
            className="pointer-events-auto p-3"
            style={{ ...CARD, borderColor: 'rgba(0,170,255,0.25)' }}
          >
            <div className="text-[#00AAFF] text-[10px] tracking-widest mb-1.5 font-bold">
              📡 DAILY BRIEF
            </div>
            <p className="text-zinc-300 text-[10px] leading-[1.5]">{dailyBrief}</p>
          </div>
        )}

        {/* LIVE STRIKES — 3-item real-time ticker, older items fade */}
        <div className="pointer-events-auto p-3" style={CARD}>
          <div className="text-zinc-300 text-[10px] tracking-widest mb-2">LIVE STRIKES</div>
          {recentStrikes.length === 0 ? (
            <div className="text-zinc-300 text-[10px]">Awaiting first strike...</div>
          ) : (
            <div className="flex flex-col gap-1">
              {recentStrikes.map((item, i) => {
                const opacity = [1, 0.6, 0.3][i]
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      const code = item.target_country
                      if (!code) return
                      const coords = COUNTRY_COORDS[code]
                      if (coords) globeRef.current?.flyTo(coords[0], coords[1])
                    }}
                    className="w-full text-left cursor-pointer hover:opacity-100 transition-opacity border-l-2 pl-2 py-0.5 border-[#FF2233]"
                    style={{ opacity }}
                  >
                    <p className="text-[10px] leading-[1.35] text-zinc-200">
                      <TypewriterText text={item.content} instant={i !== 0} speed={18} />
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ONLINE NATIONS — scrolling flag strip */}
        <div className="pointer-events-auto p-3" style={CARD}>
          <div className="text-zinc-300 text-[10px] tracking-widest mb-2">ONLINE NATIONS</div>
          {onlineCountries.length === 0 ? (
            <div className="text-zinc-300 text-[10px]">No active operators</div>
          ) : onlineCountries.length > 5 ? (
            <div className="overflow-hidden h-7">
              <div className="flags-scroll flex gap-2 w-max">
                {[...onlineCountries, ...onlineCountries].map((c, i) => (
                  <TwemojiFlag key={i} code={c.code} size={22} />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex gap-2 h-7 items-center">
              {onlineCountries.map(c => (
                <TwemojiFlag key={c.code} code={c.code} size={22} />
              ))}
            </div>
          )}
        </div>

        {/* HALL OF FAME — hidden when empty */}
        {hofEntries.some(e => e.action === 'nuke_launched') && (
          <div className="pointer-events-auto p-3" style={CARD}>
            <div className="text-zinc-300 text-[10px] tracking-widest mb-2">HALL OF FAME</div>
            <HofRow
              entries={hofEntries.filter(e => e.action === 'nuke_launched')}
              color="#FF6600"
              empty="No nuclear strikes yet"
              formatEntry={e => `☢ ${e.nickname} ${COUNTRY_FLAGS[e.country_code] ?? ''} NUCLEAR STRIKE`}
            />
          </div>
        )}

        {/* DAMAGE RANKINGS */}
        <div
          className="pointer-events-auto p-3"
          style={CARD}
        >
          <div className="text-zinc-300 text-[10px] tracking-widest mb-2">DAMAGE RANKINGS</div>
          {damagedRankings.length === 0 ? (
            <div className="text-zinc-300 text-[10px]">No damage recorded</div>
          ) : (
            <div className="space-y-2">
              {damagedRankings.map((c, i) => (
                <button
                  key={c.code}
                  onClick={() => {
                    const coords = COUNTRY_COORDS[c.code]
                    if (coords) globeRef.current?.flyTo(coords[0], coords[1])
                  }}
                  className="w-full flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <span className="text-zinc-300 text-xs w-4 shrink-0">#{i + 1}</span>
                  <TwemojiFlag code={c.code} size={16} className="shrink-0" />
                  <span className="text-zinc-200 text-xs w-16 truncate shrink-0">{c.name}</span>
                  {c.damage_percent >= 100 ? (
                    <span className="flex-1 text-[9px] tracking-widest text-[#FF2233] text-center font-bold mx-2">
                      ◼ DESTROYED
                    </span>
                  ) : (
                    <DamageBar pct={c.damage_percent} />
                  )}
                  <span className="text-zinc-200 text-[10px] w-9 text-right shrink-0">
                    {c.damage_percent >= 100 ? '100%' : c.damage_percent > 0 ? `${Math.round(c.damage_percent)}%` : '< 1%'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* GLOBAL THREAT STATUS */}
        <div className="pointer-events-auto p-3" style={CARD}>
          <div className="text-zinc-300 text-[10px] tracking-widest mb-2">GLOBAL THREAT STATUS</div>
          <div className="space-y-1.5">
            {/* DEFCON gauge */}
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-bold font-mono w-16 shrink-0${defconLevel === 1 ? ' animate-pulse' : ''}`}
                style={{ color: defconColor }}
              >
                DEFCON {defconLevel}
              </span>
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }, (_, i) => (
                  <div
                    key={i}
                    className="w-4 h-2 rounded-sm transition-colors duration-300"
                    style={{ background: i < defconFilled ? defconColor : 'rgba(255,255,255,0.07)' }}
                  />
                ))}
              </div>
            </div>
            {/* Most attacked nation today */}
            <div className="text-[10px] font-mono truncate" style={{ color: '#FF6600' }}>
              {topTarget
                ? `🔥 ${COUNTRY_FLAGS[topTarget.code] ?? ''} ${COUNTRY_NAMES[topTarget.code] ?? topTarget.code} UNDER FIRE (${topTarget.hits} STRIKES)`
                : '🕊 NO ACTIVE WARZONES'}
            </div>
            {/* Daily reset countdown */}
            <div className="text-[10px] font-mono text-zinc-200">
              ⏱ RESET IN {resetCountdown}
            </div>
          </div>
        </div>

        {/* ARSENAL SUPPLY — redeem Gumroad codes */}
        <div className={`pointer-events-auto p-3${tutorialStep === 5 ? ' tutorial-highlight' : ''}`} style={CARD}>
          {tutorialStep === 5 && (
            <div className="text-[10px] tracking-wider mb-2 pb-1.5 border-b" style={{ color: '#00AAFF', borderColor: 'rgba(0,170,255,0.25)' }}>
              ▶ Restock here when out of ammo
            </div>
          )}
          <div className="text-zinc-300 text-[10px] tracking-widest mb-2">ARSENAL SUPPLY</div>
          <div className="flex gap-1 mb-1.5">
            <input
              type="text"
              value={redeemCode}
              onChange={e => { setRedeemCode(e.target.value.toUpperCase()); setRedeemStatus(null) }}
              onKeyDown={e => e.key === 'Enter' && handleRedeem()}
              placeholder="ENTER CODE..."
              disabled={!player || isRedeeming}
              className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 text-zinc-200 text-[10px] px-2 py-1 font-mono tracking-wider placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 disabled:opacity-40"
            />
            <button
              onClick={handleRedeem}
              disabled={!player || !redeemCode.trim() || isRedeeming}
              className="px-2 py-1 text-[10px] tracking-widest border border-zinc-700 text-zinc-200 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
            >
              {isRedeeming ? '···' : 'REDEEM'}
            </button>
          </div>
          {redeemStatus && (
            <div
              className="text-[9px] tracking-wider mb-1.5 font-mono"
              style={{ color: redeemStatus.type === 'success' ? '#00FFAA' : '#FF2233' }}
            >
              {redeemStatus.type === 'success' ? '✓' : '✗'} {redeemStatus.message}
            </div>
          )}
          <div className="flex gap-2 text-[9px]">
            <a href="https://nudgefilm.gumroad.com/l/tbyskm" target="_blank" rel="noopener noreferrer"
              className="text-zinc-300 hover:text-zinc-200 transition-colors">
              Get Missiles ($5) ▸
            </a>
            <span className="text-zinc-400">│</span>
            <a href="https://nudgefilm.gumroad.com/l/nneaar" target="_blank" rel="noopener noreferrer"
              className="text-zinc-300 hover:text-zinc-200 transition-colors">
              Get Bundle ($20) ▸
            </a>
          </div>
        </div>

      </aside>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-2 py-1.5 pointer-events-none"
        style={{ background: 'rgba(0,0,0,0.4)' }}
      >
        <span className="relative group pointer-events-auto">
          <span className="text-[9px] text-zinc-500 cursor-pointer" onClick={() => window.dispatchEvent(new Event('ghostwar:shooting-star'))}>© 2026 Ghost War</span>
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none select-none">
            <svg width="80" height="24" viewBox="0 0 80 24" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <radialGradient id="sstar-hg" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(220,255,235,1)"/>
                  <stop offset="15%" stopColor="rgba(0,255,136,1)"/>
                  <stop offset="50%" stopColor="rgba(0,255,136,0.4)"/>
                  <stop offset="100%" stopColor="rgba(0,255,136,0)"/>
                </radialGradient>
                <linearGradient id="sstar-tg" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(0,255,136,0)"/>
                  <stop offset="100%" stopColor="rgba(0,255,136,0.5)"/>
                </linearGradient>
              </defs>
              <line x1="12" y1="12" x2="76" y2="12" stroke="url(#sstar-tg)" strokeWidth="1.5"/>
              <circle cx="12" cy="12" r="8" fill="url(#sstar-hg)"/>
              <line x1="12" y1="4" x2="12" y2="20" stroke="rgba(0,255,136,0.85)" strokeWidth="0.8"/>
              <line x1="4" y1="12" x2="20" y2="12" stroke="rgba(0,255,136,0.85)" strokeWidth="0.8"/>
              <line x1="6" y1="6" x2="18" y2="18" stroke="rgba(0,255,136,0.85)" strokeWidth="0.6"/>
              <line x1="18" y1="6" x2="6" y2="18" stroke="rgba(0,255,136,0.85)" strokeWidth="0.6"/>
            </svg>
          </span>
        </span>
        <span className="text-[9px] text-zinc-500">│</span>
        <button onClick={() => setInfoModal('operator')} className="text-[9px] text-zinc-500 hover:text-[#FF2233] transition-colors pointer-events-auto cursor-pointer">Operator Info</button>
        <span className="text-[9px] text-zinc-500">│</span>
        <button onClick={() => setInfoModal('privacy')} className="text-[9px] text-zinc-500 hover:text-[#FF2233] transition-colors pointer-events-auto cursor-pointer">Privacy</button>
        <span className="text-[9px] text-zinc-500">│</span>
        <button onClick={() => setInfoModal('terms')} className="text-[9px] text-zinc-500 hover:text-[#FF2233] transition-colors pointer-events-auto cursor-pointer">Terms</button>
        <span className="text-[9px] text-zinc-500">│</span>
        <a href="https://discord.gg/5QhFyQSPn4" target="_blank" rel="noopener noreferrer" className="text-[9px] text-zinc-500 hover:text-[#FF2233] transition-colors pointer-events-auto">Discord</a>
      </footer>
    </div>
  )
}
