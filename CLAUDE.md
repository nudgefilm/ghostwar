@AGENTS.md

## 절대 변경 금지 사항

### 지구본 위치 (Globe position) — 절대 고정
`components/Globe.tsx`의 OrbitControls target은 반드시 아래 값을 유지할 것:
```
controls.target.set(0, 0.05, 0)
```
사용자가 명시적으로 변경을 요청하지 않는 한 이 값을 절대 수정하지 말 것.
