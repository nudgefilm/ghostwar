import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 }) }

  const player_id = body.player_id as string
  const target_country = body.target_country as string
  const reason = body.reason as string
  const scheduled_minutes = body.scheduled_minutes as number

  if (!player_id || !target_country || !reason || !scheduled_minutes) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: player } = await supabase
    .from('players')
    .select('alliance_id, alliance_pack_expires_at')
    .eq('id', player_id)
    .maybeSingle()

  if (!player?.alliance_id) {
    return NextResponse.json({ error: 'Not in an alliance' }, { status: 403 })
  }

  const packValid =
    player.alliance_pack_expires_at &&
    new Date(player.alliance_pack_expires_at as string) > new Date()

  if (!packValid) {
    return NextResponse.json({ error: 'Alliance Pack required' }, { status: 403 })
  }

  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const { data: existingWar } = await supabase
    .from('war_declarations')
    .select('id')
    .eq('alliance_id', player.alliance_id)
    .gte('created_at', todayStart.toISOString())
    .not('status', 'eq', 'cancelled')
    .maybeSingle()

  if (existingWar) {
    return NextResponse.json({ error: 'Alliance already declared war today' }, { status: 429 })
  }

  const scheduled_at = new Date(Date.now() + scheduled_minutes * 60 * 1000)

  const { data, error } = await supabase
    .from('war_declarations')
    .insert({
      alliance_id: player.alliance_id,
      target_country,
      reason,
      scheduled_at: scheduled_at.toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, war: data })
}
