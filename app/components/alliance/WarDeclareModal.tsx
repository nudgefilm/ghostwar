'use client'

import { useState } from 'react'
import { COUNTRIES } from '@/lib/countries'

interface Props {
  playerId: string
  allianceColor: string
  allianceName: string
  onClose: () => void
  onDeclared: () => void
}

const SCHEDULE_OPTIONS = [
  { label: '10 MIN', minutes: 10 },
  { label: '30 MIN', minutes: 30 },
  { label: '1 HOUR', minutes: 60 },
  { label: '3 HOURS', minutes: 180 },
  { label: 'TOMORROW', minutes: 1440 },
]

export default function WarDeclareModal({ playerId, allianceColor, allianceName, onClose, onDeclared }: Props) {
  const [targetCountry, setTargetCountry] = useState('')
  const [reason, setReason] = useState('')
  const [scheduledMinutes, setScheduledMinutes] = useState(30)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!targetCountry || !reason.trim()) {
      setError('Target country and reason are required.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/alliance/war/declare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: playerId,
          target_country: targetCountry,
          reason: reason.trim(),
          scheduled_minutes: scheduledMinutes,
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'DECLARATION FAILED')
      onDeclared()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'DECLARATION FAILED')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 font-mono">
      <div
        className="w-full max-w-md bg-zinc-950 border p-6 flex flex-col gap-4"
        style={{ borderColor: allianceColor }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black tracking-[0.25em]" style={{ color: allianceColor }}>
            ⚔ WAR DECLARATION
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors text-lg leading-none">✕</button>
        </div>

        <p className="text-zinc-500 text-[10px] tracking-[0.3em]">{allianceName}</p>

        {/* Target nation */}
        <div className="flex flex-col gap-1.5">
          <label className="text-zinc-400 text-[10px] tracking-[0.3em]">TARGET NATION</label>
          <select
            value={targetCountry}
            onChange={(e) => setTargetCountry(e.target.value)}
            className="bg-black border border-zinc-700 focus:border-zinc-500 px-3 py-2 text-zinc-200 text-sm outline-none transition-colors cursor-pointer appearance-none"
          >
            <option value="">─── SELECT ───</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* War reason */}
        <div className="flex flex-col gap-1.5">
          <label className="text-zinc-400 text-[10px] tracking-[0.3em]">WAR REASON</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="State your cause for war..."
            rows={3}
            maxLength={200}
            className="bg-black border border-zinc-700 focus:border-zinc-500 px-3 py-2 text-zinc-200 text-sm resize-none outline-none transition-colors placeholder:text-zinc-600"
          />
        </div>

        {/* Schedule */}
        <div className="flex flex-col gap-2">
          <label className="text-zinc-400 text-[10px] tracking-[0.3em]">DECLARATION IN</label>
          <div className="flex gap-2 flex-wrap">
            {SCHEDULE_OPTIONS.map((opt) => (
              <button
                key={opt.minutes}
                onClick={() => setScheduledMinutes(opt.minutes)}
                className="px-3 py-1 text-[10px] font-bold tracking-widest border transition-all"
                style={{
                  borderColor: scheduledMinutes === opt.minutes ? allianceColor : '#3f3f46',
                  color: scheduledMinutes === opt.minutes ? allianceColor : '#71717a',
                  backgroundColor: scheduledMinutes === opt.minutes ? `${allianceColor}15` : 'transparent',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-[#FF2233] text-[10px] tracking-widest">⚠ {error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3 font-black tracking-[0.25em] text-black text-sm transition-opacity disabled:opacity-40"
          style={{ backgroundColor: allianceColor }}
        >
          {loading ? 'SUBMITTING...' : '⚔ DECLARE WAR'}
        </button>
      </div>
    </div>
  )
}
