'use client'

interface Props {
  title: string
  children: React.ReactNode
  onClose: () => void
}

export default function InfoModal({ title, children, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div
        className="relative w-full max-w-lg font-mono text-xs flex flex-col"
        style={{
          background: 'rgba(4,4,6,0.97)',
          border: '1px solid #FF2233',
          boxShadow: '0 0 30px rgba(255,34,51,0.35), inset 0 0 24px rgba(255,34,51,0.04)',
          maxHeight: '85vh',
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
          className="absolute top-2 right-2 z-10 text-sm text-zinc-500 hover:text-[#FF2233] transition-colors leading-none cursor-pointer"
        >
          ✕
        </button>

        {/* Header */}
        <div className="relative px-5 pt-5 shrink-0 text-center">
          <div className="text-zinc-700 text-[9px] tracking-widest">━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
          <div className="text-[#FF2233] text-sm font-bold tracking-[0.2em] my-1.5 neon-glow">
            {title}
          </div>
          <div className="text-zinc-700 text-[9px] tracking-widest mb-1">━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
        </div>

        {/* Scrollable content */}
        <div className="relative px-5 py-3 overflow-y-auto flex-1">
          {children}
        </div>

        {/* Footer */}
        <div className="relative px-5 pb-5 shrink-0">
          <div className="text-zinc-700 text-[9px] tracking-widest mb-4">━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
          <button
            onClick={onClose}
            className="w-full py-2.5 text-[10px] tracking-widest border border-[#FF2233]/60 hover:border-[#FF2233] hover:bg-[#FF2233]/10 text-zinc-200 hover:text-white transition-colors neon-glow cursor-pointer"
          >
            [ CLOSE ]
          </button>
        </div>
      </div>
    </div>
  )
}
