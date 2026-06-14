'use client'

import { useState, useRef } from 'react'
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

export default function EntryModal({ onEnter }: EntryModalProps) {
  const [nickname, setNickname] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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
      setLoading(false)
      if (dbError.code === '23505') {
        setError('CALLSIGN TAKEN')
      } else {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 font-mono">
      {/* Scanline overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-5">
        <div className="w-full h-1 bg-white absolute top-0" style={{
          animation: 'scan-line 4s linear infinite',
        }} />
      </div>

      <div className="relative w-full max-w-sm mx-4">
        {/* Corner accents */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#FF2233]" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#FF2233]" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#FF2233]" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#FF2233]" />

        <div className="bg-zinc-950 border border-zinc-800 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-[10px] text-zinc-400 tracking-[0.4em] mb-3">
              ── SECURE CHANNEL ESTABLISHED ──
            </div>
            <h1 className="text-2xl font-bold tracking-[0.2em] mb-2 neon-glow">
              GLOBAL GHOST WAR
            </h1>
            <p className="text-zinc-400 text-[10px] tracking-widest">
              SELECT YOUR NATION. CHOOSE YOUR FATE.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Callsign input */}
            <div>
              <label className="text-zinc-400 text-xs tracking-[0.3em] block mb-1.5">
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
                className="w-full bg-black border border-zinc-700 focus:border-[#FF2233] text-zinc-200 text-sm px-3 py-2.5 outline-none transition-colors placeholder:text-zinc-400 tracking-widest"
              />
              <div className="text-zinc-400 text-xs mt-1">
                {nickname.length}/16 — A-Z, 0-9, _ only
              </div>
            </div>

            {/* Nation selector */}
            <div>
              <label className="text-zinc-400 text-xs tracking-[0.3em] block mb-1.5">
                NATION
              </label>
              <select
                value={countryCode}
                onChange={e => setCountryCode(e.target.value)}
                className="w-full bg-black border border-zinc-700 focus:border-[#FF2233] text-zinc-200 text-sm px-3 py-2.5 outline-none transition-colors cursor-pointer appearance-none"
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
              <div className="text-center text-zinc-500 text-[10px] tracking-wider leading-relaxed">
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
              className="w-full py-3 bg-[#FF2233]/10 border border-[#FF2233] text-[#FF2233] text-sm tracking-[0.3em] hover:bg-[#FF2233]/20 active:bg-[#FF2233]/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed neon-border-pulse"
            >
              {loading ? '[ CONNECTING... ]' : '[ ENTER WAR ROOM ]'}
            </button>
          </form>

          <div className="text-center mt-6 text-zinc-400 text-[10px] tracking-widest">
            BY ENTERING YOU ACCEPT THE TERMS OF TOTAL WAR
          </div>
        </div>
      </div>
    </div>
  )
}
