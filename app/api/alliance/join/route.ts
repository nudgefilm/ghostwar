import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 }) }

  const player_id = body.player_id as string
  const alliance_name = body.alliance_name as string

  if (!player_id || !alliance_name) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: alliance, error: allianceErr } = await supabase
    .from('alliances_meta')
    .select('id')
    .eq('name', alliance_name)
    .single()

  if (allianceErr || !alliance) {
    return NextResponse.json({ error: 'Alliance not found' }, { status: 404 })
  }

  const { data: existing } = await supabase
    .from('alliance_members')
    .select('alliance_id, last_changed_at')
    .eq('player_id', player_id)
    .maybeSingle()

  if (existing) {
    if (existing.alliance_id === alliance.id) {
      return NextResponse.json({ error: 'Already in this alliance' }, { status: 409 })
    }
    const hoursSince = (Date.now() - new Date(existing.last_changed_at as string).getTime()) / 1000 / 3600
    if (hoursSince < 24) {
      return NextResponse.json({ error: 'Cannot change alliance within 24 hours' }, { status: 429 })
    }
    const { error } = await supabase
      .from('alliance_members')
      .update({ alliance_id: alliance.id, last_changed_at: new Date().toISOString() })
      .eq('player_id', player_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('alliance_members')
      .insert({ player_id, alliance_id: alliance.id })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase
    .from('players')
    .update({ alliance_id: alliance.id })
    .eq('id', player_id)

  return NextResponse.json({ success: true, alliance_id: alliance.id })
}
