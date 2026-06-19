'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WarDeclaration } from '@/types/alliance'

interface Props {
  war: WarDeclaration
  playerId: string
  allianceColor: string
  hasVoted: boolean
}

export default function WarVoteBar({ war, playerId, allianceColor, hasVoted: initialHasVoted }: Props) {
  const [voteYes, setVoteYes] = useState(war.vote_yes)
  const [voteNo, setVoteNo] = useState(war.vote_no)
  const [hasVoted, setHasVoted] = useState(initialHasVoted)
  const [loading, setLoading] = useState(false)
  const [timeLeft, setTimeLeft] = useState('')

  // Countdown
  useEffect(() => {
    const tick = () => {
      const diff = new Date(war.scheduled_at).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft('DECIDING...'); return }
      const h = Math.floor(diff / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      const s = Math.floor((diff % 60_000) / 1_000)
      setTimeLeft(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [war.scheduled_at])

  // Realtime vote count subscription
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`war_vote_${war.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'war_declarations',
          filter: `id=eq.${war.id}`,
        },
        (payload) => {
          const row = payload.new as { vote_yes: number; vote_no: number }
          setVoteYes(row.vote_yes)
          setVoteNo(row.vote_no)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [war.id])

  const handleVote = async (vote: boolean) => {
    if (hasVoted || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/alliance/war/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: playerId, war_id: war.id, vote }),
      })
      if (res.ok) setHasVoted(true)
    } finally {
      setLoading(false)
    }
  }

  const total = voteYes + voteNo
  const yesPercent = total > 0 ? Math.round((voteYes / total) * 100) : 50

  return (
    <div
      className="border p-3 flex flex-col gap-2 font-mono"
      style={{ borderColor: allianceColor, backgroundColor: `${allianceColor}10` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black tracking-[0.25em]" style={{ color: allianceColor }}>
          ⚔ WAR VOTE
        </span>
        <span className="text-[10px] text-zinc-400 tabular-nums">{timeLeft}</span>
      </div>

      {/* Target + reason */}
      <p className="text-zinc-200 text-[10px] font-bold tracking-wider">
        TARGET: <span style={{ color: allianceColor }}>{war.target_country}</span>
      </p>
      <p className="text-zinc-500 text-[10px] leading-relaxed">{war.reason}</p>

      {/* Vote bar */}
      <div className="w-full h-1.5 bg-zinc-800 overflow-hidden">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${yesPercent}%`, backgroundColor: allianceColor }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-zinc-500">
        <span>✓ {voteYes} YES</span>
        <span>✕ {voteNo} NO</span>
      </div>

      {/* Vote buttons */}
      {!hasVoted ? (
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => handleVote(true)}
            disabled={loading}
            className="flex-1 py-2 font-black text-[10px] tracking-widest text-black transition-opacity disabled:opacity-40"
            style={{ backgroundColor: allianceColor }}
          >
            VOTE YES
          </button>
          <button
            onClick={() => handleVote(false)}
            disabled={loading}
            className="flex-1 py-2 font-black text-[10px] tracking-widest border border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40"
          >
            VOTE NO
          </button>
        </div>
      ) : (
        <p className="text-center text-[10px] text-zinc-500 tracking-[0.3em]">VOTE SUBMITTED</p>
      )}
    </div>
  )
}
