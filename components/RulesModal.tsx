'use client'

const GAME_RULES: { icon: string; title: string; text: string }[] = [
  { icon: '🚀', title: 'MISSILES',      text: '20 free daily (reset 00:00 UTC / 09:00 KST)' },
  { icon: '☢️', title: 'NUKES',         text: 'Earn 1 nuke per 1,000 missiles fired, or purchase via ARSENAL SUPPLY.' },
  { icon: '💥', title: 'DAMAGE',        text: 'Every 10 missile hits = +1% damage. 1 nuke hit = +10% damage instantly.' },
  { icon: '🛡️', title: 'DEFENSE',       text: 'Nations auto-recover +5% defense per hour. Below 10% defense, the nation cannot be targeted or launch attacks.' },
  { icon: '☠️', title: 'SCORCHED EARTH', text: "At 100% damage, that nation's attack power is reduced by 50%." },
  { icon: '🔄', title: 'RECOVERY',      text: 'Nations recover -5% damage per hour automatically.' },
  { icon: '🏆', title: 'RANKINGS',      text: 'Climb the leaderboard by landing successful strikes.' },
  { icon: '⚔️', title: 'ALLIANCES',     text: 'Join GHOST LEGION or PHANTOM ORDER. Declare war, vote, and coordinate mass strikes against target nations.' },
  { icon: '🏛️', title: 'HALL OF FAME', text: 'Nuclear strikes are recorded for 30 days.' },
]

interface Props {
  onClose: () => void
}

export default function RulesModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" />

      <div
        className="relative w-full max-w-lg font-mono text-xs"
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

        <div className="relative p-5">
          {/* Header */}
          <div className="text-center mb-4">
            <div className="text-zinc-500 text-[10px] tracking-widest">━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
            <div className="text-[#FF2233] text-sm font-bold tracking-[0.2em] my-1.5 neon-glow">
              RULES OF ENGAGEMENT
            </div>
            <div className="text-zinc-500 text-[10px] tracking-widest">━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
          </div>

          {/* Rules list — scrollable once it exceeds ~8 items */}
          <div className="space-y-3 mb-5 overflow-y-auto" style={{ maxHeight: '55vh' }}>
            {GAME_RULES.map(({ icon, title, text }) => (
              <div key={title} className="flex gap-2">
                <span className="shrink-0 w-4">{icon}</span>
                <span className="text-xs leading-relaxed">
                  <span className="text-zinc-100 font-bold">{title}: </span>
                  <span className="text-zinc-200">{text}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="text-zinc-500 text-[10px] tracking-widest mb-4">━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

          <button
            onClick={onClose}
            className="w-full py-2.5 text-xs tracking-widest border border-[#FF2233]/60 hover:border-[#FF2233] hover:bg-[#FF2233]/10 text-zinc-200 hover:text-white transition-colors neon-glow cursor-pointer"
          >
            [ UNDERSTOOD ]
          </button>
        </div>
      </div>
    </div>
  )
}
