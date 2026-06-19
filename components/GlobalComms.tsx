'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import TwemojiFlag from './TwemojiFlag'
import type { Player } from './EntryModal'
import WarDeclareModal from '@/app/components/alliance/WarDeclareModal'
import WarVoteBar from '@/app/components/alliance/WarVoteBar'
import { WarDeclaration } from '@/types/alliance'

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
  const [showWarModal, setShowWarModal] = useState(false)
  const [activeWar, setActiveWar] = useState<WarDeclaration | null>(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [hasAlliancePack, setHasAlliancePack] = useState(false)
  const [warRefreshKey, setWarRefreshKey] = useState(0)
  const [mounted, setMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  // Fetch alliance IDs for tab UI
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

  // Check alliance pack validity
  useEffect(() => {
    if (!player) { setHasAlliancePack(false); return }
    const supabase = createClient()
    supabase
      .from('players')
      .select('alliance_pack_expires_at')
      .eq('id', player.id)
      .maybeSingle()
      .then(({ data }) => {
        const exp = (data as { alliance_pack_expires_at?: string | null } | null)?.alliance_pack_expires_at
        setHasAlliancePack(!!exp && new Date(exp) > new Date())
      })
  }, [player?.id])

  // Fetch active war for own alliance + hasVoted
  useEffect(() => {
    if (!playerAllianceId || !player) { setActiveWar(null); setHasVoted(false); return }
    const supabase = createClient()
    supabase
      .from('war_declarations')
      .select('*')
      .eq('alliance_id', playerAllianceId)
      .eq('status', 'voting')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(async ({ data: war }) => {
        if (!war) { setActiveWar(null); setHasVoted(false); return }
        const w = war as WarDeclaration
        setActiveWar(w)
        const { data: vote } = await supabase
          .from('war_votes')
          .select('war_id')
          .eq('war_id', w.id)
          .eq('player_id', player.id)
          .maybeSingle()
        setHasVoted(!!vote)
      })
  }, [playerAllianceId, player?.id, warRefreshKey])

  // Realtime: war_declarations for own alliance
  useEffect(() => {
    if (!playerAllianceId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`war-decl-${playerAllianceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'war_declarations', filter: `alliance_id=eq.${playerAllianceId}` },
        (payload) => {
          const row = payload.new as { status?: string; id?: string }
          if (payload.eventType === 'INSERT' && row.status === 'voting') {
            setWarRefreshKey(k => k + 1)
          } else if (payload.eventType === 'UPDATE') {
            if (row.status === 'declared' || row.status === 'cancelled' || row.status === 'expired') {
              setActiveWar(prev => prev?.id === row.id ? null : prev)
            }
          }
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [playerAllianceId])

  const selectedAllianceId = allianceIds[activeTab]
  const isOwnAllianceTab = !!playerAllianceId && playerAllianceId === selectedAllianceId
  const ownTab = ALLIANCE_TABS.find(t => allianceIds[t.name] === playerAllianceId)
  const allianceColor = ownTab?.color ?? '#FF2233'
  const allianceName = ownTab?.name ?? ''

  // Scroll to bottom when expanded or new message arrives
  useEffect(() => {
    if (expanded && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, expanded])

  const send = () => {
    if (!player || !input.trim() || sending) return
    const msg = input.trim()

    setMessages(prev => [...prev, {
      id: `local-${Date.now()}`,
      nickname: player.nickname,
      country_code: player.country_code,
      message: msg,
      created_at: new Date().toISOString(),
      alliance_id: selectedAllianceId ?? null,
    }].slice(-MAX_MESSAGES))

    setInput('')
    inputRef.current?.focus()
  }

  // Messages visible in current tab
  const visibleAll = messages.filter(m => !m.alliance_id || m.alliance_id === selectedAllianceId)
  const visibleMessages = visibleAll.slice(expanded ? -EXPANDED_ROWS : -COLLAPSED_ROWS)

  const ROW_H = 22
  const maxH = (expanded ? EXPANDED_ROWS : COLLAPSED_ROWS) * ROW_H + 16

  return (
    <>
      {/* WarDeclareModal — portaled to body to escape stacking context */}
      {mounted && showWarModal && player && createPortal(
        <WarDeclareModal
          playerId={player.id}
          allianceColor={allianceColor}
          allianceName={allianceName}
          onClose={() => setShowWarModal(false)}
          onDeclared={() => { setWarRefreshKey(k => k + 1); setShowWarModal(false) }}
        />,
        document.body,
      )}

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

        {/* WAR DECLARATION button — own alliance tab only */}
        {isOwnAllianceTab && (
          <div className="px-2.5 py-1.5 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => hasAlliancePack && setShowWarModal(true)}
              disabled={!hasAlliancePack}
              title={!hasAlliancePack ? 'Alliance Pack required' : undefined}
              className="w-full py-1 text-[10px] font-black tracking-[0.2em] border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                borderColor: `${allianceColor}60`,
                color: allianceColor,
                backgroundColor: `${allianceColor}10`,
              }}
            >
              ⚔ WAR DECLARATION
            </button>
          </div>
        )}

        {/* WarVoteBar — own alliance tab only, when voting war exists */}
        {isOwnAllianceTab && activeWar && player && (
          <div className="px-2.5 pt-2 shrink-0">
            <WarVoteBar
              war={activeWar}
              playerId={player.id}
              allianceColor={allianceColor}
              hasVoted={hasVoted}
            />
          </div>
        )}

        {/* Messages */}
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
          {visibleAll.length === 0 && (
            <div className="text-zinc-600 text-[11px]">No messages yet…</div>
          )}
          {visibleMessages.map(m => (
            <div key={m.id} className="flex items-start gap-1.5 text-[11px] leading-snug">
              <TwemojiFlag code={m.country_code} size={11} className="shrink-0 mt-px" />
              <span className="text-[#00FFAA] shrink-0 font-bold truncate max-w-[72px]">
                {m.nickname}:
              </span>
              <span className="break-all min-w-0 text-zinc-300">
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
            SEND
          </button>
        </div>
      </div>
    </>
  )
}
