'use client'

import { useEffect } from 'react'

// ── Types (formerly in BattleReportModal / UnderAttackModal) ─────────────────
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

// ── Helper sub-components ────────────────────────────────────────────────────
function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className="text-zinc-400 text-[10px] tracking-wider shrink-0">{label}</span>
      <span className="text-[11px] font-bold tabular-nums text-right" style={{ color: valueColor ?? '#e4e4e7' }}>
        {value}
      </span>
    </div>
  )
}

function Note({ children, color }: { children: React.ReactNode; color: string }) {
  return <div className="text-[10px]" style={{ color }}>{children}</div>
}

// ── Shared toast shell ────────────────────────────────────────────────────────
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
      className="fixed bottom-4 right-4 z-50 w-80 font-mono text-xs toast-slide-in"
      style={{
        background: 'rgba(4,4,6,0.96)',
        border: `1px solid ${borderColor}`,
        boxShadow: `0 0 20px ${glowColor}, inset 0 0 16px ${glowColor.replace('0.35', '0.04')}`,
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* Scanline */}
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
      <div className="relative p-4">{children}</div>
    </div>
  )
}

// ── Battle Report Toast (attacker) ────────────────────────────────────────────
interface BattleToastProps {
  report: BattleReportData
  onClose: () => void
  onRetaliate: (country: string) => void
}

export function BattleReportToast({ report, onClose, onRetaliate }: BattleToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rankDiff =
    report.oldRank != null && report.newRank != null ? report.oldRank - report.newRank : null
  const rankStr =
    report.oldRank != null && report.newRank != null
      ? `#${report.oldRank} → #${report.newRank} ${
          rankDiff != null && rankDiff > 0
            ? `▲${rankDiff}`
            : rankDiff != null && rankDiff < 0
              ? `▼${Math.abs(rankDiff)}`
              : '—'
        }`
      : '—'

  return (
    <ToastShell borderColor="#FF2233" glowColor="rgba(255,34,51,0.35)" onClose={onClose}>
      <div className="text-[#FF2233] text-[10px] font-bold tracking-[0.2em] mb-3">
        ⚔ STRIKE CONFIRMED · {report.targetCountry}
      </div>
      <div className="space-y-1.5 mb-3">
        <Row label="SUCCESS RATE" value={`${report.successRate}%`} />
        <Row label="INTERCEPTED" value={`${report.intercepted}`} />
        {report.infrastructureDamage != null && (
          <Row label="INFRA DAMAGE" value={`+${report.infrastructureDamage}%`} valueColor="#FF2233" />
        )}
        <Row label="ECONOMIC DMG" value={report.economicDamage} />
        <Row label="WORLD RANK" value={rankStr} />
      </div>
      {(report.attacker_debuffed ||
        report.targetDestroyed ||
        (report.alliance_reduction_percent ?? 0) > 0) && (
        <div className="space-y-1 mb-3 pt-2 border-t border-zinc-800">
          {report.attacker_debuffed && (
            <Note color="#FF6600">⚠ Scorched Earth: attack power -50%</Note>
          )}
          {report.targetDestroyed && (
            <Note color="#FF2233">☠ {report.targetCountry} SCORCHED — attack power -50%</Note>
          )}
          {(report.alliance_reduction_percent ?? 0) > 0 && (
            <Note color="#00FFAA">
              🤝 Alliance reduced damage by {report.alliance_reduction_percent}%
            </Note>
          )}
        </div>
      )}
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
interface UnderAttackToastProps {
  report: UnderAttackData
  onClose: () => void
  onRetaliate: (country: string) => void
}

export function UnderAttackToast({ report, onClose, onRetaliate }: UnderAttackToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { wasIntercepted } = report
  const borderColor = wasIntercepted ? '#00AAFF' : '#FF6600'
  const glowColor = wasIntercepted ? 'rgba(0,170,255,0.35)' : 'rgba(255,102,0,0.35)'

  return (
    <ToastShell borderColor={borderColor} glowColor={glowColor} onClose={onClose}>
      <div
        className="text-[10px] font-bold tracking-[0.2em] mb-3"
        style={{ color: borderColor }}
      >
        {wasIntercepted ? '🛡 DEFENSE SUCCESSFUL' : '⚠ UNDER ATTACK'}
      </div>
      <div className="space-y-1.5 mb-3">
        <Row label="ATTACKER" value={report.launcherCountry} />
        <Row label="MISSILES FIRED" value={`${report.quantity}`} />
        <Row
          label="INTERCEPTED"
          value={`${report.interceptedCount}`}
          valueColor={report.interceptedCount > 0 ? '#00AAFF' : undefined}
        />
        {!wasIntercepted && (
          <Row
            label="DAMAGE"
            value={`${report.prevDamagePercent}% → ${report.newDamagePercent}%`}
            valueColor="#FF2233"
          />
        )}
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
