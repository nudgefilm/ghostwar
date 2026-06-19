import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 }) }

  const player_id = body.player_id as string
  const war_id = body.war_id as string
  const vote = body.vote as boolean | undefined

  if (!player_id || !war_id || vote === undefined) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: war } = await supabase
    .from('war_declarations')
    .select('status, alliance_id, scheduled_at, vote_yes, vote_no')
    .eq('id', war_id)
    .maybeSingle()

  if (!war || war.status !== 'voting') {
    return NextResponse.json({ error: 'War not in voting phase' }, { status: 400 })
  }

  const { data: player } = await supabase
    .from('players')
    .select('alliance_id')
    .eq('id', player_id)
    .maybeSingle()

  if (player?.alliance_id !== war.alliance_id) {
    return NextResponse.json({ error: 'Not in this alliance' }, { status: 403 })
  }

  const { error } = await supabase
    .from('war_votes')
    .insert({ war_id, player_id, vote })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Already voted' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const updateField = vote ? 'vote_yes' : 'vote_no'
  const currentCount = (vote ? war.vote_yes : war.vote_no) as number

  await supabase
    .from('war_declarations')
    .update({ [updateField]: currentCount + 1 })
    .eq('id', war_id)

  return NextResponse.json({ success: true })
}
