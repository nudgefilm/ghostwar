import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  let body: { player_id?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 }) }

  const { player_id } = body
  if (!player_id) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: player } = await supabase
    .from('players')
    .select('country_code')
    .eq('id', player_id)
    .single()

  if (!player) {
    return NextResponse.json({ error: 'PLAYER_NOT_FOUND' }, { status: 404 })
  }

  await supabase.rpc('adjust_online_users', { p_code: player.country_code, p_delta: -1 })

  return NextResponse.json({ success: true })
}
