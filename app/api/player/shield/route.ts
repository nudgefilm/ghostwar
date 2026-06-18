import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  let body: { player_id?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 }) }

  const { player_id } = body
  if (!player_id) return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('players')
    .update({ shield_active: true })
    .eq('id', player_id)

  if (error) return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 })
  return NextResponse.json({ success: true })
}
