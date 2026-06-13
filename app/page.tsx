import dynamic from 'next/dynamic'

const Globe = dynamic(() => import('@/components/Globe'), { ssr: false })

export default function Home() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0B0B0C]">
      {/* 상단 띠 */}
      <header className="h-10 bg-zinc-950 border-b border-zinc-800 flex items-center px-4 shrink-0">
        <span className="text-zinc-400 text-xs tracking-widest uppercase">Ghost War</span>
      </header>

      {/* 3열 메인 레이아웃 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 좌측 패널 */}
        <aside className="w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col p-4 shrink-0">
          <p className="text-zinc-600 text-xs">[ LEFT PANEL ]</p>
          <p className="text-zinc-700 text-xs mt-2">국가 현황 / 동맹 — Phase 2</p>
        </aside>

        {/* 중앙: Globe 캔버스 */}
        <main className="flex-1 relative">
          <Globe />
        </main>

        {/* 우측 패널 */}
        <aside className="w-72 bg-zinc-900 border-l border-zinc-800 flex flex-col p-4 shrink-0">
          <p className="text-zinc-600 text-xs">[ RIGHT PANEL ]</p>
          <p className="text-zinc-700 text-xs mt-2">속보 / 명예의 전당 — Phase 2</p>
        </aside>
      </div>
    </div>
  )
}
