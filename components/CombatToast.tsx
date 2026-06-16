'use client'

import { useEffect } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface BattleReportData {
  role: 'attacker' | 'victim'
  targetCountry: string
  launcherCountry: string
  quantity: number
  type: 'missile' | 'nuke'
  successRate: number
  intercepted: number
  infrastructureDamage: number | null
  economicDamage: string
  oldRank: number | null
  newRank: number | null
  attacker_debuffed?: boolean
  targetDestroyed?: boolean
  alliance_reduction_percent?: number
}

export interface UnderAttackData {
  launcherCountry: string
  quantity: number
  interceptedCount: number
  prevDamagePercent: number
  newDamagePercent: number
  wasIntercepted: boolean
}

// ── Shared shell ──────────────────────────────────────────────────────────────
function ToastShell({
  borderColor,
  glowColor,
  onClose,
  children,
}: {
  borderColor: string
  glowColor: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed bottom-10 z-50 font-mono text-xs toast-slide-in"
      style={{
        right: 'calc(270px + 8px)',
        width: '280px',
        background: 'rgba(4,4,6,0.96)',
        border: `1px solid ${borderColor}`,
        boxShadow: `0 0 18px ${glowColor}, inset 0 0 12px ${glowColor.replace('0.35', '0.04')}`,
        backdropFilter: 'blur(10px)',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 3px)',
        }}
      />
      <button
        onClick={onClose}
        className="absolute top-2 right-2 z-10 text-sm text-zinc-500 hover:text-zinc-200 transition-colors leading-none"
      >
        ✕
      </button>
      <div className="relative p-3">{children}</div>
    </div>
  )
}

// ── Battle Report Toast (attacker) ────────────────────────────────────────────
export function BattleReportToast({
  report,
  onClose,
  onRetaliate,
}: {
  report: BattleReportData
  onClose: () => void
  onRetaliate: (country: string) => void
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <ToastShell borderColor="#FF2233" glowColor="rgba(255,34,51,0.35)" onClose={onClose}>
      <div className="text-[#FF2233] text-[10px] font-bold tracking-wider mb-2.5">
        ⚔ STRIKE CONFIRMED — {report.targetCountry} | SUCCESS {report.successRate}%
      </div>
      <button
        onClick={() => onRetaliate(report.targetCountry)}
        className="w-full py-1.5 text-[10px] tracking-widest border border-[#FF2233]/50 text-[#FF2233] hover:border-[#FF2233] hover:bg-[#FF2233]/10 transition-colors"
      >
        RETALIATE NOW →
      </button>
    </ToastShell>
  )
}

// ── Under Attack Toast (victim) ───────────────────────────────────────────────
export function UnderAttackToast({
  report,
  onClose,
  onRetaliate,
}: {
  report: UnderAttackData
  onClose: () => void
  onRetaliate: (country: string) => void
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { wasIntercepted } = report
  const borderColor = wasIntercepted ? '#00AAFF' : '#FF6600'
  const glowColor = wasIntercepted ? 'rgba(0,170,255,0.35)' : 'rgba(255,102,0,0.35)'

  const summary = wasIntercepted
    ? `🛡 INTERCEPTED — ${report.launcherCountry} | ${report.quantity} BLOCKED`
    : `⚠ UNDER ATTACK — ${report.launcherCountry} | ${report.quantity} INCOMING`

  return (
    <ToastShell borderColor={borderColor} glowColor={glowColor} onClose={onClose}>
      <div
        className="text-[10px] font-bold tracking-wider mb-2.5"
        style={{ color: borderColor }}
      >
        {summary}
      </div>
      <button
        onClick={() => onRetaliate(report.launcherCountry)}
        className="w-full py-1.5 text-[10px] tracking-widest border transition-colors"
        style={{ borderColor: `${borderColor}80`, color: borderColor }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.borderColor = borderColor
          el.style.background = `${borderColor}1A`
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.borderColor = `${borderColor}80`
          el.style.background = ''
        }}
      >
        RETALIATE NOW →
      </button>
    </ToastShell>
  )
}
