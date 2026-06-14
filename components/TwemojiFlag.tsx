'use client'

import twemoji from 'twemoji'

// ISO 3166-1 alpha-2 → regional indicator emoji (e.g. "KR" → "🇰🇷")
const toFlag = (code: string) =>
  code.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0))
  )

// Renders via Twemoji CDN SVG — works on Windows where flag emojis are unsupported
export default function TwemojiFlag({
  code,
  size = 20,
  className = '',
}: {
  code: string
  size?: number
  className?: string
}) {
  const emoji = toFlag(code)
  const html = (twemoji as unknown as { parse: (text: string, opts: Record<string, string>) => string })
    .parse(emoji, { folder: 'svg', ext: '.svg' })
  const src = html.match(/src="([^"]+)"/)?.[1] ?? ''
  if (!src) return <span>{emoji}</span>
  return (
    <img
      src={src}
      alt={code}
      title={code}
      width={size}
      height={size}
      className={`inline-block align-middle ${className}`}
      draggable={false}
    />
  )
}
