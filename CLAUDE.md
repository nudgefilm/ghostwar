@AGENTS.md

## 🔒 LOCKED FEATURES — DO NOT MODIFY

These are intentional behaviors that have been broken by accidental overwrites
before. Before committing ANY change to the files below, read this section and
verify none of these are broken. Ask the user before changing them.

### LIVE STRIKES panel (`app/page.tsx`)
- MUST show exactly 5 most recent **unique target countries** (not raw news items)
- When a country is attacked again, its entry moves to the top (no duplicates)
- State: `recentStrikes: NewsFeedRow[]` — maintained in `onNews` via dedup filter
- MUST fade opacity per position: `[1, 0.75, 0.5, 0.3, 0.15]`
- Do NOT change to `slice(0, N)` on a raw news array — that allows duplicate countries

### BattleReportModal auto-dismiss (`components/BattleReportModal.tsx`)
- MUST auto-close after 3 000 ms via `useEffect`
- `useEffect` dependency array MUST be `[]` (empty)
- Do NOT add `onClose` or any other prop to the deps — `onClose` is an inline arrow
  in the parent; adding it causes the timer to reset on every Supabase realtime
  re-render, so it never fires
- X close icon and RETALIATE button must coexist with the auto-dismiss

### DAMAGE RANKINGS (`app/page.tsx` + `app/api/recover/route.ts`)
- Filter MUST be: `(c.damage_percent ?? 0) > 0`
- Recovery callback fields MUST use `row.damage_stack` / `row.damage_percent`
  (NOT `row.new_stack` / `row.new_percent` — those are the wrong field names)

---

## 절대 변경 금지 사항

### 구현 완료된 기능 보호 — 핵심 규칙
이미 커밋된(구현 완료된) 기능은 **사용자의 명시적 승인 없이 절대 수정·삭제·덮어쓰기 금지**.

적용 범위:
- 새 기능 추가 작업 중 기존 구현된 코드를 임의로 변경하는 행위 금지
- 버그 수정 작업 중 관련 없는 기존 기능을 건드리는 행위 금지
- 파일 전체 재작성(full rewrite) 방식으로 기존 변경사항을 덮어쓰는 행위 금지

변경이 불가피할 경우:
1. 먼저 **사용자에게 어떤 기존 코드를 왜 변경해야 하는지 설명**할 것
2. 사용자의 명시적 확인(승인)을 받은 후에만 수정할 것
3. 확인 없이 임의로 진행하지 말 것

### 지구본 위치 (Globe position) — 절대 고정
`components/Globe.tsx`의 OrbitControls target은 반드시 아래 값을 유지할 것:
```
controls.target.set(0, 0.05, 0)
```
사용자가 명시적으로 변경을 요청하지 않는 한 이 값을 절대 수정하지 말 것.
