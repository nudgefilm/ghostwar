import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  let body: { player_id?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 }) }

  const { player_id } = body
  if (!player_id) return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })

  const supabase = createAdminClient()

  const { data: player } = await supabase
    .from('players')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', player_id)
    .select('country_code')
    .single()

  if (!player) return NextResponse.json({ error: 'PLAYER_NOT_FOUND' }, { status: 404 })

  // Recount active players for this country and update online_users
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('country_code', player.country_code)
    .gt('last_seen_at', twoMinAgo)

  await supabase
    .from('countries')
    .update({ online_users: count ?? 0 })
    .eq('code', player.country_code)

  return NextResponse.json({ ok: true })
}
