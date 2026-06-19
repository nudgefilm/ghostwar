'use client'

const STEPS: { icon: string; label: string; text: string }[] = [
  {
    icon: '🎯',
    label: 'SELECT TARGET',
    text: 'Choose a nation from the TARGET dropdown on the left. ETA shows missile flight time.',
  },
  {
    icon: '⚔️',
    label: 'SELECT WEAPON',
    text: 'MISSILE is always available (20/day). NUKE activates only when you own one — automatically earned every 1,000 missiles fired, or purchase via ARSENAL SUPPLY.',
  },
  {
    icon: '🔴',
    label: 'LAUNCH',
    text: 'Hit LAUNCH and watch your strike arc across the globe in real time.',
  },
  {
    icon: '🔄',
    label: 'DAILY RESUPPLY',
    text: '20 missiles reload every day at 00:00 UTC (09:00 KST). Defense and damage recover automatically every hour.',
  },
  {
    icon: '📦',
    label: 'ARSENAL SUPPLY',
    text: 'Purchase missiles or the Strategic Pack (2 nukes + 500 missiles) via ARSENAL SUPPLY, then enter your code to redeem.',
  },
  {
    icon: '🌐',
    label: 'SWITCHING NATIONS',
    text: '[EXIT] returns you to nation select. Same callsign + new nation → your arsenal carries over. Different callsign → starts fresh.',
  },
]

export default function TutorialModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/75" />

      <div
        className="battle-slam relative w-full max-w-sm font-mono"
        style={{
          background: 'rgba(2,6,12,0.97)',
          border: '1px solid #00AAFF',
          boxShadow: '0 0 32px rgba(0,170,255,0.3), inset 0 0 28px rgba(0,170,255,0.04)',
        }}
      >
        {/* Scanline overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.15) 2px,rgba(0,0,0,0.15) 3px)',
          }}
        />

        <div className="relative p-5">
          {/* Header */}
          <div className="text-center mb-4">
            <div className="text-zinc-500 text-[10px] tracking-widest">
              ━━━━━━━━━━━━━━━━━━━━━━━━━━
            </div>
            <div
              className="text-sm font-bold tracking-[0.25em] my-1.5"
              style={{ color: '#00AAFF', textShadow: '0 0 14px rgba(0,170,255,0.7)' }}
            >
              OPERATOR BRIEFING
            </div>
            <div className="text-zinc-300 text-[10px] tracking-wider">
              CLASSIFIED // WAR ROOM ORIENTATION
            </div>
            <div className="text-zinc-500 text-[10px] tracking-widest mt-1.5">
              ━━━━━━━━━━━━━━━━━━━━━━━━━━
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-2.5 mb-4">
            {STEPS.map(({ icon, label, text }) => (
              <div key={label} className="flex gap-2.5 items-start">
                <span className="shrink-0 w-4 text-center mt-px">{icon}</span>
                <div className="text-[10px] leading-relaxed">
                  <span className="font-bold" style={{ color: '#00AAFF' }}>
                    {label}
                  </span>
                  <span className="text-zinc-300"> — {text}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="text-zinc-500 text-[10px] tracking-widest mb-4">
            ━━━━━━━━━━━━━━━━━━━━━━━━━━
          </div>

          <button
            onClick={onClose}
            className="w-full py-2.5 text-xs tracking-widest border text-zinc-200 hover:text-white transition-colors cursor-pointer"
            style={{
              borderColor: 'rgba(0,170,255,0.55)',
              background: 'transparent',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget
              el.style.borderColor = '#00AAFF'
              el.style.background = 'rgba(0,170,255,0.08)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget
              el.style.borderColor = 'rgba(0,170,255,0.55)'
              el.style.background = 'transparent'
            }}
          >
            [ GOT IT ]
          </button>
        </div>
      </div>
    </div>
  )
}
