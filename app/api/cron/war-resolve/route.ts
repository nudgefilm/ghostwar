import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const { data: pendingWars, error } = await supabase
    .from('war_declarations')
    .select('id, vote_yes, vote_no, alliance_id, target_country, reason')
    .eq('status', 'voting')
    .lte('scheduled_at', now)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!pendingWars || pendingWars.length === 0) {
    return NextResponse.json({ resolved: 0 })
  }

  const results = await Promise.all(
    pendingWars.map(async (war) => {
      const total = (war.vote_yes as number) + (war.vote_no as number)
      const passed = total > 0 && (war.vote_yes as number) > (war.vote_no as number)

      if (passed) {
        const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString()
        await supabase
          .from('war_declarations')
          .update({ status: 'declared', declared_at: now, expires_at })
          .eq('id', war.id)

        await supabase.from('news_feed').insert({
          content: `⚔️ WAR DECLARED — Alliance has declared war on ${war.target_country as string}. Reason: ${war.reason as string}`,
          target_country: war.target_country,
          type: 'alliance_war',
          is_template: true,
        })

        return { id: war.id, result: 'declared' }
      } else {
        await supabase
          .from('war_declarations')
          .update({ status: 'cancelled' })
          .eq('id', war.id)

        return { id: war.id, result: 'cancelled' }
      }
    })
  )

  // Expire declared wars past their expires_at
  const { data: expiredWars } = await supabase
    .from('war_declarations')
    .select('id, target_country')
    .eq('status', 'declared')
    .lt('expires_at', now)

  const expiredResults = await Promise.all(
    (expiredWars ?? []).map(async (war) => {
      await supabase
        .from('war_declarations')
        .update({ status: 'expired' })
        .eq('id', war.id)

      await supabase.from('news_feed').insert({
        content: `⚔️ CEASEFIRE — War against ${war.target_country as string} has ended.`,
        target_country: war.target_country,
        type: 'alliance_war',
        is_template: false,
      })

      return { id: war.id, result: 'expired' }
    })
  )

  return NextResponse.json({ resolved: results.length + expiredResults.length, results: [...results, ...expiredResults] })
}
