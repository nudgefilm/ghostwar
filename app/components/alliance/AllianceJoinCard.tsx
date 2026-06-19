'use client'

import { useState } from 'react'
import { AllianceMeta } from '@/types/alliance'

const ALLIANCE_IMAGE: Record<string, string> = {
  'GHOST LEGION': '/images/alliances/ghost-legion.jpeg',
  'PHANTOM ORDER': '/images/alliances/phantom-order.jpeg',
}

interface Props {
  playerId: string
  currentAllianceId: string | null
  alliances: AllianceMeta[]
  onJoined: (allianceId: string) => void
}

export default function AllianceJoinCard({ playerId, currentAllianceId, alliances, onJoined }: Props) {
  const [loading, setLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [selected, setSelected] = useState<AllianceMeta | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSelect = (alliance: AllianceMeta) => {
    if (currentAllianceId === alliance.id) return
    setSelected(alliance)
    setShowConfirm(true)
    setError(null)
  }

  const handleConfirm = async () => {
    if (!selected) return
    setLoading(true)
    try {
      const res = await fetch('/api/alliance/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: playerId, alliance_name: selected.name }),
      })
      const data = await res.json() as { alliance_id?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'JOIN FAILED')
      setShowConfirm(false)
      onJoined(data.alliance_id!)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'JOIN FAILED')
    } finally {
      setLoading(false)
    }
  }

  if (showConfirm && selected) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 font-mono">
        <div className="flex flex-col items-center gap-6">
          <img
            src={ALLIANCE_IMAGE[selected.name] ?? ''}
            alt={selected.name}
            className="w-40 h-40 rounded-full object-cover"
            style={{
              border: `4px solid ${selected.color}`,
              boxShadow: `0 0 40px ${selected.color}, 0 0 80px ${selected.color}40`,
            }}
          />

          <p className="text-2xl font-black tracking-widest text-white">
            YOU HAVE JOINED
          </p>
          <p className="text-3xl font-black tracking-widest" style={{ color: selected.color }}>
            {selected.name}
          </p>

          {error && (
            <p className="text-[#FF2233] text-xs tracking-widest">{error}</p>
          )}

          <button
            onClick={handleConfirm}
            disabled={loading}
            className="mt-4 px-12 py-3 font-black tracking-widest text-black text-lg transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: selected.color }}
          >
            {loading ? 'JOINING...' : 'CONFIRM'}
          </button>

          <button
            onClick={() => setShowConfirm(false)}
            className="text-zinc-500 text-xs tracking-widest hover:text-zinc-300 transition-colors cursor-pointer"
          >
            CANCEL
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-zinc-500 text-[10px] tracking-[0.3em] uppercase">Choose Your Alliance</p>
      <div className="flex gap-3">
        {alliances.map((alliance) => {
          const isJoined = currentAllianceId === alliance.id
          return (
            <button
              key={alliance.id}
              onClick={() => handleSelect(alliance)}
              disabled={isJoined}
              className="flex-1 flex flex-col items-center gap-3 py-5 border transition-all cursor-pointer disabled:cursor-default"
              style={{
                borderColor: isJoined ? alliance.color : `${alliance.color}40`,
                backgroundColor: isJoined ? `${alliance.color}15` : 'transparent',
                boxShadow: isJoined ? `0 0 20px ${alliance.color}30` : 'none',
              }}
            >
              <img
                src={ALLIANCE_IMAGE[alliance.name] ?? ''}
                alt={alliance.name}
                className="w-16 h-16 rounded-full object-cover"
                style={{
                  border: `2px solid ${alliance.color}`,
                  boxShadow: `0 0 8px ${alliance.color}60`,
                }}
              />
              <span className="text-[10px] font-black tracking-[0.25em] text-center leading-tight" style={{ color: alliance.color }}>
                {alliance.name.split(' ').map((word, i) => (
                  <span key={i} className="block">{word}</span>
                ))}
              </span>
              <span className="text-zinc-500 text-[10px] tracking-wider">
                {alliance.member_count.toLocaleString()} members
              </span>
              {isJoined ? (
                <span className="text-[10px] font-bold tracking-widest" style={{ color: alliance.color }}>
                  ● ENLISTED
                </span>
              ) : (
                <span className="text-zinc-400 text-[10px] tracking-wider">JOIN →</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
