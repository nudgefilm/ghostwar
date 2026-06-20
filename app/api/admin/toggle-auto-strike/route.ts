import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('game_settings')
    .select('value')
    .eq('key', 'auto_strike_enabled')
    .single()

  const enabled = (data as { value: boolean } | null)?.value ?? false
  return NextResponse.json({ enabled })
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const { playerId, enabled } = body

  if (typeof enabled !== 'boolean' || !playerId) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify caller is GHOSTWAR
  const { data: player } = await supabase
    .from('players')
    .select('nickname')
    .eq('id', playerId as string)
    .maybeSingle()

  if (!player || (player as { nickname: string }).nickname !== 'GHOSTWAR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase
    .from('game_settings')
    .update({ value: enabled, updated_at: new Date().toISOString() })
    .eq('key', 'auto_strike_enabled')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, enabled })
}
