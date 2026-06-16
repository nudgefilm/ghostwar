import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import { COUNTRY_NAMES } from '@/lib/countries'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const { data: missiles } = await supabase
    .from('missiles')
    .select('launcher_country, target_country, quantity, type')
    .gte('launched_at', todayStart.toISOString())
    .neq('status', 'flying')

  if (!missiles || missiles.length === 0) {
    return NextResponse.json({ success: true, message: 'no_activity' })
  }

  const launcherCounts: Record<string, number> = {}
  const targetCounts: Record<string, number> = {}
  let nukeCount = 0
  let totalLaunches = 0

  for (const m of missiles) {
    const qty = m.quantity as number
    launcherCounts[m.launcher_country] = (launcherCounts[m.launcher_country] ?? 0) + qty
    targetCounts[m.target_country] = (targetCounts[m.target_country] ?? 0) + qty
    if (m.type === 'nuke') nukeCount += qty
    totalLaunches += qty
  }

  const [topAttackerCode, topAttackerHits] = Object.entries(launcherCounts).sort((a, b) => b[1] - a[1])[0]
  const [topTargetCode, topTargetHits] = Object.entries(targetCounts).sort((a, b) => b[1] - a[1])[0]

  const topAttackerName = COUNTRY_NAMES[topAttackerCode] ?? topAttackerCode
  const topTargetName = COUNTRY_NAMES[topTargetCode] ?? topTargetCode

  const statsText = [
    `Total missiles/nukes launched today: ${totalLaunches}`,
    `Nuclear warheads deployed: ${nukeCount}`,
    `Most aggressive nation: ${topAttackerName} (${topAttackerHits} launches)`,
    `Most targeted nation: ${topTargetName} (${topTargetHits} incoming strikes)`,
  ].join('\n')

  const anthropic = new Anthropic()
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 120,
    messages: [{
      role: 'user',
      content: `You are a Reuters war correspondent. Write a 1-2 sentence daily battlefield briefing based on today's data from a global missile warfare simulation. Use a neutral, wire-service tone. No hashtags, no emojis, no quotes, no headlines — just the sentences.

Today's data:\n${statsText}`,
    }],
  })

  const content = message.content[0]
  if (content.type !== 'text') {
    return NextResponse.json({ error: 'CLAUDE_ERROR' }, { status: 500 })
  }

  const brief = content.text.trim()

  await supabase.from('news_feed').insert({
    content: brief,
    type: 'daily_brief',
    is_template: false,
    launcher_country: null,
    target_country: null,
  })

  return NextResponse.json({ success: true, brief })
}
