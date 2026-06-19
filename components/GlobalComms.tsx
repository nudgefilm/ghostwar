'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import TwemojiFlag from './TwemojiFlag'
import type { Player } from './EntryModal'

interface ChatMessage {
  id: string
  nickname: string
  country_code: string
  message: string
  created_at: string
  alliance_id?: string | null
}

type TabName = 'GHOST LEGION' | 'PHANTOM ORDER'

const ALLIANCE_TABS: { name: TabName; color: string }[] = [
  { name: 'GHOST LEGION', color: '#FF2233' },
  { name: 'PHANTOM ORDER', color: '#00AAFF' },
]

const MAX_MESSAGES = 50
const MAX_CHARS = 100
const COLLAPSED_ROWS = 1
const EXPANDED_ROWS = 10

interface Props {
  player: Player | null
  playerAllianceId?: string | null
}

export default function GlobalComms({ player, playerAllianceId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<TabName>('GHOST LEGION')
  const [allianceIds, setAllianceIds] = useState<Record<string, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Tracks outgoing messages to dedup when Realtime echoes them back
  const pendingRef = useRef<Set<string>>(new Set())

  // Fetch alliance IDs for tab filtering
  useEffect(() => {
    const supabase = createClient()
    supabase.from('alliances_meta').select('id, name').then(({ data }) => {
      if (!data) return
      const map: Record<string, string> = {}
      data.forEach((a: { id: string; name: string }) => { map[a.name] = a.id })
      setAllianceIds(map)
    })
  }, [])

  // Set initial tab to player's alliance once IDs are loaded
  useEffect(() => {
    if (!playerAllianceId || Object.keys(allianceIds).length === 0) return
    const entry = Object.entries(allianceIds).find(([, id]) => id === playerAllianceId)
    if (entry && (entry[0] === 'GHOST LEGION' || entry[0] === 'PHANTOM ORDER')) {
      setActiveTab(entry[0] as TabName)
    }
  }, [playerAllianceId, allianceIds])

  const selectedAllianceId = allianceIds[activeTab]

  // Load 50 most recent messages for the active alliance tab
  useEffect(() => {
    if (!selectedAllianceId) return
    const supabase = createClient()
    setMessages([])
    supabase
      .from('chat_messages')
      .select('id, nickname, country_code, message, created_at, alliance_id')
      .eq('alliance_id', selectedAllianceId)
      .order('created_at', { ascending: true })
      .limit(MAX_MESSAGES)
      .then(({ data }) => {
        if (data) setMessages(data as ChatMessage[])
      })
  }, [selectedAllianceId])

  // Realtime subscription — scoped to active alliance tab
  useEffect(() => {
    if (!selectedAllianceId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`global-comms-${selectedAllianceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `alliance_id=eq.${selectedAllianceId}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessage
          const key = `${incoming.nickname}:${incoming.message}`
          if (pendingRef.current.has(key)) {
            // Own message echoed back — replace optimistic entry with real one
            pendingRef.current.delete(key)
            setMessages(prev =>
              prev.map(m =>
                m.id.startsWith('opt-') &&
                m.nickname === incoming.nickname &&
                m.message === incoming.message
                  ? incoming
                  : m,
              ).slice(-MAX_MESSAGES),
            )
          } else {
            setMessages(prev => [...prev, incoming].slice(-MAX_MESSAGES))
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedAllianceId])

  // Scroll to bottom when expanded or new message arrives
  useEffect(() => {
    if (expanded && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, expanded])

  const send = async () => {
    if (!player || !input.trim() || sending || !selectedAllianceId) return
    const msg = input.trim()
    const key = `${player.nickname}:${msg}`

    // Optimistic update — visible immediately
    pendingRef.current.add(key)
    setMessages(prev => [...prev, {
      id: `opt-${Date.now()}`,
      nickname: player.nickname,
      country_code: player.country_code,
      message: msg,
      created_at: new Date().toISOString(),
      alliance_id: selectedAllianceId,
    }].slice(-MAX_MESSAGES))

    setInput('')
    inputRef.current?.focus()
    setSending(true)

    try {
      await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: player.id,
          nickname: player.nickname,
          country_code: player.country_code,
          message: msg,
          alliance_id: selectedAllianceId,
        }),
      })
    } finally {
      setSending(false)
    }
  }

  // Visible messages: last N rows depending on expanded state
  const visibleMessages = messages.slice(expanded ? -EXPANDED_ROWS : -COLLAPSED_ROWS)

  // Per-row budget for max-height cap: text-[11px] leading-snug ≈ 14px + space-y-1.5 gap 6px
  const ROW_H = 22
  const maxH = (expanded ? EXPANDED_ROWS : COLLAPSED_ROWS) * ROW_H + 16

  return (
    <div
      className="fixed bottom-10 z-10 flex flex-col pointer-events-auto font-mono"
      style={{
        left: 'calc(16rem + 12px)',
        width: '280px',
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(0,255,170,0.35)',
      }}
    >
      {/* Alliance tabs */}
      <div className="flex shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {ALLIANCE_TABS.map(tab => {
          const isActive = activeTab === tab.name
          return (
            <button
              key={tab.name}
              onClick={() => setActiveTab(tab.name)}
              className="flex-1 py-1 text-[10px] font-bold tracking-widest transition-colors cursor-pointer"
              style={{
                color: isActive ? tab.color : '#71717a',
                borderBottom: isActive ? `2px solid ${tab.color}` : '2px solid transparent',
              }}
            >
              {tab.name}
            </button>
          )
        })}
      </div>

      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 shrink-0"
        style={{ borderBottom: '1px solid rgba(0,255,170,0.18)' }}
      >
        <span className="text-[11px] tracking-widest font-bold" style={{ color: '#00FFAA' }}>
          GLOBAL COMMS
        </span>
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-[11px] leading-none transition-colors cursor-pointer"
          style={{ color: 'rgba(0,255,170,0.6)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#00FFAA' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(0,255,170,0.6)' }}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▼' : '▲'}
        </button>
      </div>

      {/* Messages — max-height caps the box; content determines actual height (no empty gap) */}
      <div
        ref={listRef}
        className="px-2.5 py-2 space-y-1.5"
        style={{
          maxHeight: `${maxH}px`,
          overflow: 'hidden',
          overflowY: expanded ? 'auto' : 'hidden',
          transition: 'max-height 0.22s ease',
          scrollbarWidth: 'none',
        }}
      >
        {messages.length === 0 && (
          <div className="text-zinc-600 text-[11px]">No messages yet…</div>
        )}
        {visibleMessages.map(m => (
          <div key={m.id} className="flex items-start gap-1.5 text-[11px] leading-snug">
            <TwemojiFlag code={m.country_code} size={11} className="shrink-0 mt-px" />
            <span className="text-[#00FFAA] shrink-0 font-bold truncate max-w-[72px]">
              {m.nickname}:
            </span>
            <span
              className="break-all min-w-0"
              style={{ color: m.id.startsWith('opt-') ? 'rgba(212,212,216,0.55)' : '#d4d4d8' }}
            >
              {m.message}
            </span>
          </div>
        ))}
      </div>

      {/* Input row */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 shrink-0"
        style={{ borderTop: '1px solid rgba(0,255,170,0.13)' }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              send()
            }
          }}
          disabled={!player || (!!playerAllianceId && playerAllianceId !== selectedAllianceId)}
          placeholder={
            !player
              ? 'Select a nation to join comms'
              : playerAllianceId && playerAllianceId !== selectedAllianceId
                ? '[READ ONLY] Enemy comms...'
                : `Send to ${activeTab}...`
          }
          maxLength={MAX_CHARS}
          className="flex-1 min-w-0 bg-transparent text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none disabled:opacity-40"
        />
        <button
          onClick={send}
          disabled={!player || !input.trim() || sending || (!!playerAllianceId && playerAllianceId !== selectedAllianceId)}
          className="text-[11px] tracking-wider disabled:opacity-30 hover:text-white transition-colors cursor-pointer shrink-0"
          style={{ color: '#00FFAA' }}
        >
          {sending ? '···' : 'SEND'}
        </button>
      </div>
    </div>
  )
}
