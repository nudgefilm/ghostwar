'use client'

import dynamic from 'next/dynamic'
import { useRef, useState } from 'react'
import type { GlobeHandle } from '@/components/Globe'
import { COUNTRIES, COUNTRY_FLAGS, COUNTRY_NAMES } from '@/lib/countries'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Globe = dynamic(() => import('@/components/Globe'), { ssr: false }) as any

const PLAYER = {
  country: 'KR',
  nickname: 'GHOST_001',
  rank: 999,
  missiles: 100,
  nukes: 0,
}

export default function Home() {
  const globeRef = useRef<GlobeHandle>(null)
  const [weapon, setWeapon] = useState<'missile' | 'nuke'>('missile')
  const [quantity, setQuantity] = useState(10)
  const [target, setTarget] = useState('')

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0B0B0C] font-mono">

      {/* ── 상단 띠 ── */}
      <header className="h-10 bg-zinc-950 border-b border-zinc-800 flex items-center px-3 shrink-0 gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-red-500 text-xs font-bold tracking-widest">GHOST WAR</span>
          <span className="text-zinc-700 text-[10px]">// GLOBAL WARFARE SIM</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-zinc-700 text-[10px] tracking-wider">
            ─── IN-FLIGHT TRACKER : PHASE 3 ───
          </span>
        </div>
        <div className="shrink-0">
          <span className="text-zinc-700 text-[10px] tracking-wider">HOF TICKER : PHASE 3</span>
        </div>
      </header>

      {/* ── 3열 레이아웃 ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ════════ 좌측 패널 ════════ */}
        <aside className="w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col overflow-y-auto shrink-0">

          {/* § 1 — OPERATOR */}
          <div className="p-3 border-b border-zinc-800">
            <div className="text-zinc-600 text-[10px] tracking-widest mb-2">OPERATOR</div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl leading-none">{COUNTRY_FLAGS[PLAYER.country]}</span>
              <div>
                <div className="text-zinc-200 text-xs font-bold tracking-wide">{PLAYER.nickname}</div>
                <div className="text-zinc-600 text-[10px]">RANK #{PLAYER.rank}</div>
              </div>
            </div>
            <div className="flex items-center gap-4 text-[10px]">
              <span className="text-zinc-500">
                🚀 <span className="text-green-400 font-bold">{PLAYER.missiles}</span>
              </span>
              <span className="text-zinc-500">
                ☢️ <span className="text-orange-400 font-bold">{PLAYER.nukes}</span>
              </span>
              <span className="text-zinc-700 ml-auto">RESET 23:41:00</span>
            </div>
          </div>

          {/* § 2 — WEAPONS */}
          <div className="p-3 border-b border-zinc-800">
            <div className="text-zinc-600 text-[10px] tracking-widest mb-2">WEAPONS</div>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setWeapon('missile')}
                className={`flex-1 py-1.5 text-[10px] tracking-widest border transition-colors cursor-pointer ${
                  weapon === 'missile'
                    ? 'bg-red-950 border-red-800 text-red-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400'
                }`}
              >
                🚀 MISSILE
              </button>
              <button
                onClick={() => setWeapon('nuke')}
                disabled={PLAYER.nukes === 0}
                className={`flex-1 py-1.5 text-[10px] tracking-widest border transition-colors ${
                  weapon === 'nuke'
                    ? 'bg-orange-950 border-orange-700 text-orange-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-600 hover:border-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer'
                }`}
              >
                ☢️ NUKE
              </button>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={quantity}
              onChange={e => setQuantity(Number(e.target.value))}
              className="w-full mb-2 accent-red-600"
            />
            <div className="text-zinc-500 text-[10px] text-center tracking-widest">
              <span className="text-white font-bold">{quantity}</span>
              {' × '}
              <span className={weapon === 'nuke' ? 'text-orange-400' : 'text-red-400'}>
                {weapon.toUpperCase()}
              </span>
            </div>
          </div>

          {/* § 3 — TARGET */}
          <div className="p-3 border-b border-zinc-800">
            <div className="text-zinc-600 text-[10px] tracking-widest mb-2">TARGET</div>
            <select
              value={target}
              onChange={e => setTarget(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] px-2 py-1.5 mb-2 focus:outline-none focus:border-zinc-500 cursor-pointer"
            >
              <option value="">── SELECT TARGET ──</option>
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
            {target ? (
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base leading-none">{COUNTRY_FLAGS[target]}</span>
                <span className="text-zinc-300 text-[10px]">{COUNTRY_NAMES[target]}</span>
              </div>
            ) : null}
            <div className="text-zinc-700 text-[10px]">
              ETA <span className="text-zinc-500">── sec</span>
            </div>
          </div>

          {/* § 4 — LAUNCH */}
          <div className="p-3 border-b border-zinc-800">
            <button
              disabled={!target}
              className="w-full py-3 bg-red-900 hover:bg-red-700 disabled:opacity-25 disabled:cursor-not-allowed text-red-100 text-xs tracking-[0.3em] border border-red-800 hover:border-red-600 transition-all cursor-pointer"
            >
              🔴 LAUNCH
            </button>
          </div>

          {/* § 5 — DEFENSE */}
          <div className="p-3 border-b border-zinc-800">
            <div className="text-zinc-600 text-[10px] tracking-widest mb-2">DEFENSE SYSTEMS</div>
            <button
              disabled
              className="w-full py-1.5 mb-2 bg-zinc-800 border border-zinc-700 text-zinc-600 text-[10px] tracking-widest opacity-30 cursor-not-allowed"
            >
              🛡️ INTERCEPT
            </button>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-zinc-600" style={{ width: '0%' }} />
              </div>
              <span className="text-zinc-700 text-[10px]">0%</span>
            </div>
          </div>

          {/* § 6 — ALLIANCES */}
          <div className="p-3">
            <div className="text-zinc-600 text-[10px] tracking-widest mb-2">ALLIANCES</div>
            <div className="text-zinc-700 text-[10px]">No active alliances</div>
          </div>
        </aside>

        {/* ════════ 중앙: Globe ════════ */}
        <main className="flex-1 relative">
          <Globe ref={globeRef} />
        </main>

        {/* ════════ 우측 패널 ════════ */}
        <aside className="w-72 bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-y-auto shrink-0">

          {/* 속보 */}
          <div className="p-3 border-b border-zinc-800">
            <div className="text-zinc-600 text-[10px] tracking-widest mb-2">BREAKING NEWS</div>
            <div className="space-y-2">
              {['RU → UA', 'CN → JP', 'US → KR'].map((label, i) => (
                <div key={i} className="text-zinc-700 text-[10px] flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-zinc-700 shrink-0" />
                  {label} — placeholder
                </div>
              ))}
            </div>
            <div className="text-zinc-800 text-[10px] mt-2">// REALTIME: PHASE 3</div>
          </div>

          {/* 명예의 전당 */}
          <div className="p-3 border-b border-zinc-800">
            <div className="text-zinc-600 text-[10px] tracking-widest mb-2">HALL OF FAME</div>
            {[1, 2, 3].map(n => (
              <div key={n} className="flex items-center gap-2 mb-1.5">
                <span className="text-zinc-700 text-[10px] w-4">#{n}</span>
                <span className="text-zinc-800 text-[10px]">OPERATOR_{n}000 ──</span>
              </div>
            ))}
            <div className="text-zinc-800 text-[10px] mt-1">// LIVE: PHASE 3</div>
          </div>

          {/* 피해 순위 */}
          <div className="p-3">
            <div className="text-zinc-600 text-[10px] tracking-widest mb-2">DAMAGE RANKINGS</div>
            {['🇺🇦 Ukraine', '🇯🇵 Japan', '🇰🇷 South Korea'].map((label, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                <span className="text-zinc-700 text-[10px] w-4">#{i + 1}</span>
                <span className="text-zinc-800 text-[10px]">{label}</span>
                <div className="flex-1 h-0.5 bg-zinc-800 ml-auto" />
                <span className="text-zinc-800 text-[10px]">0%</span>
              </div>
            ))}
            <div className="text-zinc-800 text-[10px] mt-1">// LIVE: PHASE 3</div>
          </div>
        </aside>
      </div>
    </div>
  )
}
