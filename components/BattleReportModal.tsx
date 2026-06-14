'use client'

import { useEffect } from 'react'

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
}

interface Props {
  report: BattleReportData
  onClose: () => void
  onRetaliate: (country: string) => void
}

export default function BattleReportModal({ report, onClose, onRetaliate }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [onClose])

  const rankDiff = report.oldRank != null && report.newRank != null
    ? report.oldRank - report.newRank
    : null

  const rankStr = report.oldRank != null && report.newRank != null
    ? `#${report.oldRank} → #${report.newRank} ${
        rankDiff != null && rankDiff > 0 ? `▲${rankDiff}`
        : rankDiff != null && rankDiff < 0 ? `▼${Math.abs(rankDiff)}`
        : '—'}`
    : '—'

  const rows: [string, string][] = [
    ['STRIKE SUCCESS RATE', `${report.successRate}%`],
    ['MISSILES INTERCEPTED', `${report.intercepted}`],
    ['INFRASTRUCTURE DAMAGE', report.infrastructureDamage != null ? `${report.infrastructureDamage}%` : '—'],
    ['ESTIMATED ECONOMIC DAMAGE', report.economicDamage],
    ...(report.role === 'attacker' ? [['WORLD RANK CHANGE', rankStr] as [string, string]] : []),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div
        className="battle-slam relative w-80 font-mono text-xs"
        style={{
          background: 'rgba(4,4,6,0.97)',
          border: '1px solid #FF2233',
          boxShadow: '0 0 30px rgba(255,34,51,0.35), inset 0 0 24px rgba(255,34,51,0.04)',
        }}
      >
        {/* Scanline overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 3px)',
          }}
        />

        {/* ✕ close icon */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 text-sm text-zinc-500 hover:text-[#FF2233] transition-colors leading-none"
        >
          ✕
        </button>

        <div className="relative p-5">
          {/* Header */}
          <div className="text-center mb-4">
            <div className="text-zinc-700 text-[9px] tracking-widest">━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
            <div className="text-[#FF2233] text-sm font-bold tracking-[0.25em] my-1.5 neon-glow">
              BATTLE REPORT
            </div>
            <div className="text-zinc-500 text-[10px] tracking-wider">
              {report.role === 'attacker'
                ? `STRIKE CONFIRMED · TARGET: ${report.targetCountry}`
                : `INCOMING STRIKE · FROM: ${report.launcherCountry}`}
            </div>
            <div className="text-zinc-700 text-[9px] tracking-widest mt-1.5">━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
          </div>

          {/* Stats */}
          <div className="space-y-2 mb-4">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between items-baseline gap-4">
                <span className="text-zinc-500 text-[10px] tracking-wider shrink-0">{label}</span>
                <span className="text-zinc-100 text-[11px] font-bold tabular-nums text-right">{value}</span>
              </div>
            ))}
          </div>

          {report.role === 'victim' && (
            <>
              <div className="text-zinc-700 text-[9px] tracking-widest mb-4">━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
              <button
                onClick={() => onRetaliate(report.launcherCountry)}
                className="w-full py-2 text-[10px] tracking-widest border border-[#FF2233]/60 hover:border-[#FF2233] hover:bg-[#FF2233]/10 transition-colors neon-glow"
              >
                RETALIATE NOW →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
