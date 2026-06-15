'use client'

import { useEffect } from 'react'

export interface UnderAttackData {
  launcherCountry: string
  quantity: number
  interceptedCount: number
  prevDamagePercent: number
  newDamagePercent: number
  wasIntercepted: boolean
}

interface Props {
  report: UnderAttackData
  onClose: () => void
  onRetaliate: (country: string) => void
}

export default function UnderAttackModal({ report, onClose, onRetaliate }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { wasIntercepted } = report
  const accent = wasIntercepted ? '#00AAFF' : '#FF2233'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div
        className="battle-slam relative w-80 font-mono text-xs"
        style={{
          background: 'rgba(4,4,6,0.97)',
          border: `1px solid ${accent}`,
          boxShadow: `0 0 30px ${wasIntercepted ? 'rgba(0,170,255,0.35)' : 'rgba(255,34,51,0.35)'}, inset 0 0 24px ${wasIntercepted ? 'rgba(0,170,255,0.04)' : 'rgba(255,34,51,0.04)'}`,
        }}
      >
        {/* Scanline overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 3px)' }}
        />

        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 text-base text-zinc-300 hover:text-[#FF2233] transition-colors leading-none"
        >✕</button>

        <div className="relative p-5">
          {/* Header */}
          <div className="text-center mb-4">
            <div className="text-zinc-500 text-[10px] tracking-widest">━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
            <div
              className="text-sm font-bold tracking-[0.25em] my-1.5 neon-glow"
              style={{ color: accent }}
            >
              {wasIntercepted ? 'DEFENSE SUCCESSFUL' : 'UNDER ATTACK'}
            </div>
            <div className="text-zinc-300 text-xs tracking-wider">
              {wasIntercepted
                ? `Your shield intercepted all ${report.quantity} incoming missiles`
                : `INCOMING STRIKE · FROM: ${report.launcherCountry}`}
            </div>
            <div className="text-zinc-500 text-[10px] tracking-widest mt-1.5">━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
          </div>

          {/* Stats */}
          <div className="space-y-2 mb-4">
            <div className="flex justify-between items-baseline gap-4">
              <span className="text-zinc-300 text-xs tracking-wider shrink-0">ATTACKER</span>
              <span className="text-zinc-100 text-[11px] font-bold">{report.launcherCountry}</span>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <span className="text-zinc-300 text-xs tracking-wider shrink-0">MISSILES FIRED</span>
              <span className="text-zinc-100 text-[11px] font-bold tabular-nums">{report.quantity}</span>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <span className="text-zinc-300 text-xs tracking-wider shrink-0">INTERCEPTED</span>
              <span className="text-[11px] font-bold tabular-nums" style={{ color: report.interceptedCount > 0 ? '#00AAFF' : '#666' }}>
                {report.interceptedCount}
              </span>
            </div>
            {!wasIntercepted && (
              <div className="flex justify-between items-baseline gap-4">
                <span className="text-zinc-300 text-xs tracking-wider shrink-0">CUMULATIVE DAMAGE</span>
                <span className="text-[11px] font-bold tabular-nums" style={{ color: '#FF2233' }}>
                  {report.prevDamagePercent}% → {report.newDamagePercent}%
                </span>
              </div>
            )}
          </div>

          <div className="text-zinc-500 text-[10px] tracking-widest mb-4">━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 text-[10px] tracking-widest border border-zinc-600 text-zinc-300 hover:border-zinc-400 hover:bg-zinc-800/40 transition-colors"
            >
              CLOSE
            </button>
            <button
              onClick={() => onRetaliate(report.launcherCountry)}
              className={`flex-1 py-2 text-[10px] tracking-widest border transition-colors neon-glow ${
                wasIntercepted
                  ? 'border-[#00AAFF]/60 text-[#00AAFF] hover:border-[#00AAFF] hover:bg-[#00AAFF]/10'
                  : 'border-[#FF2233]/60 text-[#FF2233] hover:border-[#FF2233] hover:bg-[#FF2233]/10'
              }`}
            >
              RETALIATE NOW →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
