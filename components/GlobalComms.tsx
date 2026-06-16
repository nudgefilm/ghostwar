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

interface Props {
  player: Player | null
}

export default function GlobalComms({ player }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

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

  // Realtime subscription — INSERT only, no polling overhead
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('global-comms')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          setMessages(prev => [...prev, payload.new as ChatMessage].slice(-MAX_MESSAGES))
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!player || !input.trim() || sending) return
    const msg = input.trim()
    setSending(true)
    setInput('')
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

  return (
    <div
      className="fixed bottom-10 left-4 z-10 flex flex-col pointer-events-auto font-mono"
      style={{
        width: '280px',
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(0,255,170,0.35)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-1.5 text-[10px] tracking-widest font-bold shrink-0"
        style={{
          color: '#00FFAA',
          borderBottom: '1px solid rgba(0,255,170,0.18)',
        }}
      >
        GLOBAL COMMS
      </div>

      {/* Messages */}
      <div
        className="overflow-y-auto px-2.5 py-2 space-y-1.5 shrink-0"
        style={{ maxHeight: '140px', scrollbarWidth: 'none' }}
      >
        {messages.length === 0 && (
          <div className="text-zinc-600 text-[10px]">No messages yet…</div>
        )}
        {messages.map(m => (
          <div key={m.id} className="flex items-start gap-1.5 text-[10px] leading-snug">
            <TwemojiFlag code={m.country_code} size={11} className="shrink-0 mt-px" />
            <span className="text-[#00FFAA] shrink-0 font-bold truncate max-w-[72px]">
              {m.nickname}:
            </span>
            <span className="text-zinc-300 break-words min-w-0">{m.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 shrink-0"
        style={{ borderTop: '1px solid rgba(0,255,170,0.13)' }}
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          disabled={!player || sending}
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
