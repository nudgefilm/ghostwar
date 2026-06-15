import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  let body: { nickname?: string; country_code?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 }) }

  const { nickname, country_code } = body
  if (!nickname || !country_code) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('players')
    .select('id, nickname, country_code, missiles_remaining, nukes_remaining')
    .eq('nickname', nickname)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'PLAYER_NOT_FOUND' }, { status: 404 })
  }

  const sameCountry = existing.country_code === country_code

  const { data: updated, error: updateError } = await supabase
    .from('players')
    .update({ country_code })
    .eq('id', existing.id)
    .select('id, nickname, country_code, missiles_remaining, nukes_remaining')
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: 'UPDATE_FAILED', detail: updateError?.message }, { status: 500 })
  }

  // DB trigger only fires when country_code changes — same-country re-entry needs manual increment
  if (sameCountry) {
    await supabase.rpc('adjust_online_users', { p_code: country_code, p_delta: 1 })
  }

  return NextResponse.json({ success: true, player: updated })
}
