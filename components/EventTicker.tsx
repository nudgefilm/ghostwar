'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type EventType = 'combat' | 'defense' | 'alliance' | 'reward' | 'system'

interface TickerEvent {
  id: number
  message: string
  type: EventType
}

const TYPE_COLORS: Record<EventType, string> = {
  combat:   '#FF2233',
  defense:  '#00AAFF',
  alliance: '#00FFAA',
  reward:   '#FF6600',
  system:   '#888888',
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useEventTicker() {
  const [queue, setQueue] = useState<TickerEvent[]>([])
  const counterRef = useRef(0)

  const pushEvent = useCallback((message: string, type: EventType) => {
    setQueue(prev => [...prev, { id: ++counterRef.current, message, type }])
  }, [])

  const shift = useCallback(() => {
    setQueue(prev => prev.slice(1))
  }, [])

  return { queue, pushEvent, shift }
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  queue: TickerEvent[]
  onShift: () => void
}

export default function EventTicker({ queue, onShift }: Props) {
  const current = queue[0]
  const [phase, setPhase] = useState<'idle' | 'visible' | 'exiting'>('idle')

  useEffect(() => {
    if (!current) return
    setPhase('idle')

    // One frame delay so CSS transition has an initial state to transition FROM
    const tEnter  = setTimeout(() => setPhase('visible'), 16)
    const tExit   = setTimeout(() => setPhase('exiting'), 3316)  // 16 + 3000 + 300
    const tDone   = setTimeout(onShift,                   3616)  // + 300ms exit

    return () => { clearTimeout(tEnter); clearTimeout(tExit); clearTimeout(tDone) }
  }, [current?.id, onShift])

  if (!current) return null

  const color = TYPE_COLORS[current.type]

  return (
    <div
      className="fixed left-1/2 z-30 px-4 py-1.5 text-xs font-mono tracking-widest whitespace-nowrap pointer-events-none"
      style={{
        top: '48px',
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: `1px solid ${color}50`,
        color,
        opacity: phase === 'visible' ? 1 : 0,
        transform: `translateX(-50%) translateY(${phase === 'idle' ? '-8px' : '0'})`,
        transition: 'opacity 0.3s ease, transform 0.3s ease',
      }}
    >
      {current.message}
    </div>
  )
}
