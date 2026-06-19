'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { COUNTRIES } from '@/lib/countries'

export interface Player {
  id: string
  nickname: string
  country_code: string
}

interface EntryModalProps {
  onEnter: (player: Player) => void
}

// ── Typewriter ticker ─────────────────────────────────────────────────────────
function LiveTicker({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setDisplayed('')
    let i = 0
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) {
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }, 28)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [text])

  return (
    <span>
      {displayed}
      <span className="animate-pulse">▌</span>
    </span>
  )
}

export default function EntryModal({ onEnter }: EntryModalProps) {
  const [nickname, setNickname] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Real-time stats ───────────────────────────────────────────────────────
  const [operatorsOnline, setOperatorsOnline] = useState<number | null>(null)
  const [strikesToday, setStrikesToday] = useState<number | null>(null)
  const [nukesDeployed, setNukesDeployed] = useState<number | null>(null)
  const [latestStrike, setLatestStrike] = useState<string>('LOADING INTELLIGENCE FEED...')

  useEffect(() => {
    const supabase = createClient()
    const todayUTC = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'

    const load = async () => {
      const [
        { data: countryData },
        { count: strikes },
        { count: nukes },
        { data: newsRow },
      ] = await Promise.all([
        supabase.from('countries').select('online_users'),
        supabase.from('missiles').select('*', { count: 'exact', head: true }).gte('launched_at', todayUTC),
        supabase.from('missiles').select('*', { count: 'exact', head: true }).eq('type', 'nuke').gte('launched_at', todayUTC),
        supabase.from('news_feed').select('content').not('type', 'eq', 'daily_brief').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])

      if (countryData) {
        const total = countryData.reduce((s, c) => s + (c.online_users ?? 0), 0)
        setOperatorsOnline(total)
      }
      if (strikes != null) setStrikesToday(strikes)
      if (nukes != null) setNukesDeployed(nukes)
      if (newsRow?.content) {
        const raw = newsRow.content.replace(/^🔴\s*BREAKING:\s*/i, '')
        setLatestStrike('🔴 BREAKING: ' + raw)
      }
    }

    load()

    // Subscribe to new news_feed rows for live ticker
    const channel = supabase
      .channel('entry-news')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'news_feed' }, payload => {
        const row = payload.new as { content: string; type: string | null }
        if (row.type !== 'daily_brief') {
          const raw = row.content.replace(/^🔴\s*BREAKING:\s*/i, '')
          setLatestStrike('🔴 BREAKING: ' + raw)
          setStrikesToday(prev => (prev ?? 0) + 1)
        }
        if (row.type === 'nuke') {
          setNukesDeployed(prev => (prev ?? 0) + 1)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const callsign = nickname.trim().toUpperCase()

    if (callsign.length < 2) {
      setError('CALLSIGN MIN 2 CHARS')
      inputRef.current?.focus()
      return
    }
    if (!countryCode) {
      setError('NATION NOT SELECTED')
      return
    }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data, error: dbError } = await supabase
      .from('players')
      .insert({ nickname: callsign, country_code: countryCode })
      .select('id, nickname, country_code')
      .single()

    if (dbError) {
      if (dbError.code === '23505') {
        const res = await fetch('/api/player/enter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nickname: callsign, country_code: countryCode }),
        })
        setLoading(false)
        const json = await res.json() as { success?: boolean; player?: { id: string; nickname: string; country_code: string }; error?: string }
        if (!res.ok || !json.player) {
          setError(json.error ?? 'UPDATE FAILED')
          return
        }
        const player: Player = { id: json.player.id, nickname: json.player.nickname, country_code: json.player.country_code }
        try { localStorage.setItem('ghostwar_player', JSON.stringify(player)) } catch { /* ignore */ }
        onEnter(player)
      } else {
        setLoading(false)
        setError(`CONNECTION FAILED: ${dbError.code}`)
      }
      return
    }

    const player: Player = {
      id: data.id,
      nickname: data.nickname,
      country_code: data.country_code,
    }

    try {
      localStorage.setItem('ghostwar_player', JSON.stringify(player))
    } catch {
      // localStorage unavailable — continue anyway
    }

    onEnter(player)
  }

  const handleRestoreSession = async () => {
    const callsign = nickname.trim().toUpperCase()
    if (!callsign) return
    setRestoring(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('players')
      .select('id, nickname, country_code')
      .eq('nickname', callsign)
      .single()
    setRestoring(false)
    if (!data) {
      setError('SESSION NOT FOUND')
      return
    }
    const player: Player = { id: data.id, nickname: data.nickname, country_code: data.country_code }
    try { localStorage.setItem('ghostwar_player', JSON.stringify(player)) } catch { /* ignore */ }
    onEnter(player)
  }

  const fmt = (n: number | null) => n === null ? '—' : n.toLocaleString()

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col font-mono overflow-hidden"
      style={{ background: '#0B0B0C' }}
    >
      {/* Neon red scan line */}
      <div style={{
        position: 'fixed',
        left: 0,
        right: 0,
        height: '2px',
        background: 'rgba(255, 34, 51, 0.4)',
        boxShadow: '0 0 6px 2px rgba(255, 34, 51, 0.25), 0 0 16px 4px rgba(255, 34, 51, 0.1)',
        pointerEvents: 'none',
        zIndex: 50,
        animation: 'neonScan 6s linear infinite',
      }} />
      <style>{`
        @keyframes neonScan {
          0%   { top: -2px; }
          100% { top: 100vh; }
        }
      `}</style>
      {/* Subtle noise vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.65) 100%)',
        zIndex: 2,
      }} />

      {/* ── Top stats bar ───────────────────────────────────────────────────── */}
      <div className="relative z-10 flex items-center justify-center gap-6 px-4 py-2 border-b border-zinc-800/60 text-[10px] tracking-[0.25em] text-zinc-400 flex-wrap">
        <span>
          🌐 <span className="text-[#00FFAA] font-bold">{fmt(operatorsOnline)}</span> OPERATORS ONLINE
        </span>
        <span className="text-zinc-700">|</span>
        <span>
          ✕ <span className="text-[#FF2233] font-bold">{fmt(strikesToday)}</span> STRIKES TODAY
        </span>
        <span className="text-zinc-700">|</span>
        <span>
          ☢️ <span className="text-yellow-400 font-bold">{fmt(nukesDeployed)}</span> NUKES DEPLOYED
        </span>
      </div>

      {/* ── Main content (vertically centered) ─────────────────────────────── */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-0">
        <div className="w-full max-w-sm py-10">

          {/* ── Title ──────────────────────────────────────────────────────── */}
          <div className="text-center mb-1">
            <h1
              className="text-3xl font-bold tracking-[0.18em] mb-1"
              style={{
                color: '#FF2233',
                textShadow: '0 0 8px #FF2233, 0 0 20px #FF223399, 0 0 40px #FF223355',
              }}
            >
              GLOBAL GHOST WAR
            </h1>
            <div className="space-y-1 text-[11px] tracking-[0.2em]">
              <p style={{ color: '#FF2233', textShadow: '0 0 6px #FF223388' }}>
                THE WORLD IS AT WAR.
              </p>
              <p className="text-zinc-300">
                89 NATIONS. REAL-TIME MISSILES. NO MERCY.
              </p>
              <p style={{ color: '#00FFAA' }}>
                CHOOSE YOUR NATION. LAUNCH. SURVIVE.
              </p>
            </div>
          </div>

          {/* ── Alliance badges ─────────────────────────────────────────────── */}
          <div className="flex items-center justify-center gap-5 mb-2">
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-[170px] h-[170px] border border-[#FF2233]/40 overflow-hidden"
                style={{ boxShadow: '0 0 10px #FF223344' }}>
                <Image
                  src="/GHOST_LEGION.jpeg"
                  alt="GHOST LEGION"
                  width={170}
                  height={170}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              </div>
              <span
                className="text-[9px] tracking-[0.25em] font-bold"
                style={{ color: '#FF2233', textShadow: '0 0 6px #FF2233' }}
              >
                GHOST LEGION
              </span>
            </div>

            <div
              className="text-xl font-black tracking-widest"
              style={{ color: '#FF2233', textShadow: '0 0 10px #FF2233' }}
            >
              VS
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <div className="w-[170px] h-[170px] border border-[#0088FF]/40 overflow-hidden"
                style={{ boxShadow: '0 0 10px #0088FF44' }}>
                <Image
                  src="/PHANTOM_ORDER.jpeg"
                  alt="PHANTOM ORDER"
                  width={170}
                  height={170}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              </div>
              <span
                className="text-[9px] tracking-[0.25em] font-bold"
                style={{ color: '#0088FF', textShadow: '0 0 6px #0088FF' }}
              >
                PHANTOM ORDER
              </span>
            </div>
          </div>

          {/* ── Form card ───────────────────────────────────────────────────── */}
          <div className="relative">
            {/* Corner accents */}
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#FF2233]" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#FF2233]" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#FF2233]" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#FF2233]" />

            <div className="bg-zinc-950/90 border border-zinc-800 p-4">
              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Callsign input */}
                <div>
                  <label className="text-zinc-400 text-[11px] tracking-[0.3em] block mb-1.5">
                    OPERATOR CALLSIGN
                  </label>
                  <input
                    ref={inputRef}
                    type="text"
                    value={nickname}
                    onChange={e => setNickname(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                    maxLength={16}
                    placeholder="ENTER CALLSIGN..."
                    autoFocus
                    className="w-full bg-black border border-zinc-700 focus:border-[#FF2233] text-zinc-200 text-sm px-3 py-2 outline-none transition-colors placeholder:text-zinc-600 tracking-widest"
                  />
                  <div className="text-zinc-600 text-[10px] mt-1">
                    {nickname.length}/16 — A-Z, 0-9, _ only
                  </div>
                </div>

                {/* Nation selector */}
                <div>
                  <label className="text-zinc-400 text-[11px] tracking-[0.3em] block mb-1.5">
                    NATION
                  </label>
                  <select
                    value={countryCode}
                    onChange={e => setCountryCode(e.target.value)}
                    className="w-full bg-black border border-zinc-700 focus:border-[#FF2233] text-zinc-200 text-sm px-3 py-2 outline-none transition-colors cursor-pointer appearance-none"
                  >
                    <option value="">─── SELECT NATION ───</option>
                    {COUNTRIES.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.flag}  {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Error */}
                {error && (
                  <div className={`text-xs tracking-widest text-center py-1.5 border bg-[#FF2233]/5 ${
                    error === 'CALLSIGN TAKEN'
                      ? 'neon-glow border-[#FF2233] font-bold'
                      : 'text-[#FF2233] border-[#FF2233]/30'
                  }`}>
                    ⚠ {error}
                  </div>
                )}
                {error === 'CALLSIGN TAKEN' && (
                  <div className="text-center text-zinc-400 text-xs tracking-wider leading-relaxed">
                    Already registered? This is your callsign if you&apos;ve played before.{' '}
                    <button
                      type="button"
                      onClick={handleRestoreSession}
                      disabled={restoring}
                      className="text-[#FF2233] hover:text-[#FF4444] tracking-widest transition-colors disabled:opacity-50"
                    >
                      {restoring ? '[ RESTORING... ]' : '[ RESTORE SESSION ]'}
                    </button>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-[#FF2233]/10 border border-[#FF2233] text-[#FF2233] text-sm tracking-[0.3em] hover:bg-[#FF2233]/20 active:bg-[#FF2233]/30 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed neon-border-pulse"
                >
                  {loading ? '[ CONNECTING... ]' : '[ ENTER WAR ROOM ]'}
                </button>
              </form>

              <div className="text-center mt-3 text-zinc-600 text-[10px] tracking-widest">
                BY ENTERING YOU ACCEPT THE TERMS OF TOTAL WAR
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Live ticker ─────────────────────────────────────────────────────── */}
      <div className="relative z-10 border-t border-zinc-800/60 px-4 py-2">
        <div className="text-[10px] tracking-wider text-zinc-500 text-center">
          <LiveTicker text={latestStrike} />
        </div>
      </div>
    </div>
  )
}
