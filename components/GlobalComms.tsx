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
}

const MAX_MESSAGES = 20
const MAX_CHARS = 100
const COLLAPSED_ROWS = 1
const EXPANDED_ROWS = 10

interface Props {
  player: Player | null
}

export default function GlobalComms({ player }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Tracks outgoing messages to dedup when Realtime echoes them back
  const pendingRef = useRef<Set<string>>(new Set())

  // Initial fetch — last 24h messages, capped at MAX_MESSAGES
  useEffect(() => {
    const supabase = createClient()
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    supabase
      .from('chat_messages')
      .select('id, nickname, country_code, message, created_at')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(MAX_MESSAGES)
      .then(({ data }) => {
        if (data) setMessages(data as ChatMessage[])
      })
  }, [])

  // Realtime subscription — dedup own optimistic messages
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('global-comms')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
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
  }, [])

  // Scroll to bottom when expanded or new message arrives
  useEffect(() => {
    if (expanded && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, expanded])

  const send = async () => {
    if (!player || !input.trim() || sending) return
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
    }].slice(-MAX_MESSAGES))

    setInput('')
    inputRef.current?.focus()  // synchronous — input not disabled during send
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
        }),
      })
    } finally {
      setSending(false)
    }
  }

  // Visible messages: last N rows depending on expanded state
  const visibleMessages = messages.slice(expanded ? -EXPANDED_ROWS : -COLLAPSED_ROWS)

  // Row height ≈ 18px (text-[10px] leading-snug) + 6px gap, plus 16px padding
  const ROW_H = 18 + 6
  const listHeight = visibleMessages.length === 0
    ? 18
    : visibleMessages.length * ROW_H - 6  // last row has no trailing gap

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
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 shrink-0"
        style={{ borderBottom: '1px solid rgba(0,255,170,0.18)' }}
      >
        <span className="text-[10px] tracking-widest font-bold" style={{ color: '#00FFAA' }}>
          GLOBAL COMMS
        </span>
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-[10px] leading-none transition-colors cursor-pointer"
          style={{ color: 'rgba(0,255,170,0.6)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#00FFAA' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(0,255,170,0.6)' }}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▼' : '▲'}
        </button>
      </div>

      {/* Messages — height transitions smoothly */}
      <div
        ref={listRef}
        className="px-2.5 py-2 space-y-1.5"
        style={{
          height: `${listHeight + 16}px`,
          transition: 'height 0.22s ease',
          overflowY: expanded ? 'auto' : 'hidden',
          scrollbarWidth: 'none',
        }}
      >
        {messages.length === 0 && (
          <div className="text-zinc-600 text-[10px]">No messages yet…</div>
        )}
        {visibleMessages.map(m => (
          <div key={m.id} className="flex items-start gap-1.5 text-[10px] leading-snug">
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
          disabled={!player}
          placeholder={player ? 'Send a message…' : 'Select a nation to join comms'}
          maxLength={MAX_CHARS}
          className="flex-1 min-w-0 bg-transparent text-[10px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none disabled:opacity-40"
        />
        <button
          onClick={send}
          disabled={!player || !input.trim() || sending}
          className="text-[10px] tracking-wider disabled:opacity-30 hover:text-white transition-colors cursor-pointer shrink-0"
          style={{ color: '#00FFAA' }}
        >
          {sending ? '···' : 'SEND'}
        </button>
      </div>
    </div>
  )
}
