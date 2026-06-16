'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface StrikeItem {
  id: string
  content: string
  target_country: string | null
  launcher_country: string | null
  type: string
  created_at: string
}

const MAX_STRIKES = 3

function TypewriterText({ text, speed = 32 }: { text: string; speed?: number }) {
  const [shown, setShown] = useState('')
  useEffect(() => {
    setShown('')
    let i = 0
    const t = setInterval(() => {
      i++
      setShown(text.slice(0, i))
      if (i >= text.length) clearInterval(t)
    }, speed)
    return () => clearInterval(t)
  }, [text, speed])
  return <>{shown}</>
}

function GhostGlobe() {
  const R = 145
  const CX = 170
  const CY = 170
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <svg width="340" height="340" viewBox="0 0 340 340" fill="none" style={{ opacity: 0.13 }}>
        <defs>
          <clipPath id="gc">
            <circle cx={CX} cy={CY} r={R} />
          </clipPath>
          {/* eslint-disable-next-line react/no-danger */}
          <style>{`
            @keyframes g-spin { to { transform: rotate(360deg); } }
            .g-mrd { transform-origin: ${CX}px ${CY}px; animation: g-spin 22s linear infinite; }
          `}</style>
        </defs>
        {/* Outer ring */}
        <circle cx={CX} cy={CY} r={R} stroke="#00FFAA" strokeWidth="1" />
        {/* Parallels — static */}
        {[-60, -30, 0, 30, 60].map(lat => {
          const dy = (lat / 90) * R
          const rx = Math.sqrt(Math.max(0, R * R - dy * dy))
          return rx > 2 ? (
            <ellipse key={lat} cx={CX} cy={CY + dy} rx={rx} ry={rx * 0.28}
              stroke="#00FFAA" strokeWidth="0.6" clipPath="url(#gc)" />
          ) : null
        })}
        {/* Meridians — rotating */}
        <g className="g-mrd" clipPath="url(#gc)">
          {[0, 30, 60, 90, 120, 150].map(lng => (
            <ellipse key={lng} cx={CX} cy={CY} rx={R * 0.28} ry={R}
              stroke="#00FFAA" strokeWidth="0.6"
              transform={`rotate(${lng} ${CX} ${CY})`} />
          ))}
        </g>
      </svg>
    </div>
  )
}

export default function MobileView() {
  const [strikes, setStrikes] = useState<StrikeItem[]>([])
  const [alertMode, setAlertMode] = useState(false)
  const [alertText, setAlertText] = useState('')
  const [hideMain, setHideMain] = useState(false)
  const alertTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initial fetch — last 3 strikes
  useEffect(() => {
    createClient()
      .from('news_feed')
      .select('id, content, target_country, launcher_country, type, created_at')
      .neq('type', 'daily_brief')
      .order('created_at', { ascending: false })
      .limit(MAX_STRIKES)
      .then(({ data }) => {
        if (data) setStrikes(data as StrikeItem[])
      })
  }, [])

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('mobile-strikes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'news_feed' },
        (payload) => {
          const item = payload.new as StrikeItem
          if (item.type === 'daily_brief') return

          setStrikes(prev => [item, ...prev].slice(0, MAX_STRIKES))

          const text = item.launcher_country && item.target_country
            ? `⚠️ INCOMING: ${item.launcher_country} → ${item.target_country}`
            : '⚠️ STRIKE DETECTED'
          setAlertText(text)
          setHideMain(true)
          setAlertMode(true)

          if (alertTimer.current) clearTimeout(alertTimer.current)
          alertTimer.current = setTimeout(() => {
            setAlertMode(false)
            setHideMain(false)
          }, 3000)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (alertTimer.current) clearTimeout(alertTimer.current)
    }
  }, [])

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center font-mono overflow-hidden"
      style={{ background: '#0B0B0C' }}
    >
      {/* Scanlines */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.18) 2px,rgba(0,0,0,0.18) 3px)',
        }}
      />

      {/* Ghost Globe background */}
      <GhostGlobe />

      {/* Alert overlay — fades in/out */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          zIndex: 20,
          background: 'rgba(0,0,0,0.82)',
          opacity: alertMode ? 1 : 0,
          pointerEvents: alertMode ? 'auto' : 'none',
          transition: 'opacity 0.35s ease',
        }}
      >
        <div className="text-center px-8">
          <div
            className="text-xl font-black tracking-widest leading-tight"
            style={{ color: '#FF2233', textShadow: '0 0 32px rgba(255,34,51,0.85)' }}
          >
            {alertMode && <TypewriterText key={alertText} text={alertText} speed={35} />}
          </div>
          <div
            className="text-[11px] tracking-[0.22em] mt-4 animate-pulse"
            style={{ color: 'rgba(255,34,51,0.55)' }}
          >
            MISSILE DETECTED — STAND BY
          </div>
        </div>
      </div>

      {/* Main content — fades out during alert */}
      <div
        className="relative flex flex-col items-center gap-4 max-w-xs text-center px-6 z-10"
        style={{ opacity: hideMain ? 0 : 1, transition: 'opacity 0.35s ease' }}
      >
        <div
          className="text-4xl font-black tracking-[0.2em]"
          style={{ color: '#FF2233', textShadow: '0 0 24px rgba(255,34,51,0.7)' }}
        >
          GHOST WAR
        </div>
        <div
          className="text-xs tracking-[0.35em] font-bold"
          style={{ color: '#00FFAA', textShadow: '0 0 10px rgba(0,255,170,0.5)' }}
        >
          GLOBAL WARFARE SIM
        </div>
        <div className="w-20 border-t" style={{ borderColor: 'rgba(255,34,51,0.3)' }} />
        <p className="text-zinc-400 text-xs leading-relaxed tracking-wide">
          GHOST WAR is optimized for desktop. Please access from a PC or laptop for the best experience.
        </p>
      </div>

      {/* Live Strikes feed */}
      <div
        className="absolute left-0 right-0 px-5 z-10"
        style={{
          bottom: '3.5rem',
          opacity: hideMain ? 0 : 1,
          transition: 'opacity 0.35s ease',
        }}
      >
        {strikes.length > 0 && (
          <>
            <div
              className="text-[9px] tracking-[0.3em] text-center mb-2"
              style={{ color: 'rgba(255,34,51,0.45)' }}
            >
              — LIVE STRIKES —
            </div>
            <div className="space-y-1">
              {strikes.map((s, i) => (
                <div
                  key={s.id}
                  className="text-[10px] font-mono truncate text-center"
                  style={{ color: '#FF2233', opacity: [1, 0.5, 0.22][i] ?? 0.1 }}
                >
                  {s.content}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bottom fixed */}
      <div className="absolute bottom-4 left-0 right-0 text-center z-10">
        <span className="text-[10px] tracking-widest" style={{ color: 'rgba(0,170,255,0.65)' }}>
          👻 Desktop only — ghostwar.xyz
        </span>
      </div>
    </div>
  )
}
