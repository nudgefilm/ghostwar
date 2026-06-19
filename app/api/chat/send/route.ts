import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 }) }

  const { player_id, nickname, country_code, message, alliance_id } = body

  if (!player_id || !nickname || !country_code || !message) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
  }

  const msg = String(message).trim().slice(0, 100)
  if (!msg) return NextResponse.json({ error: 'EMPTY_MESSAGE' }, { status: 400 })

  const supabase = createAdminClient()

  // Verify player exists (session guard)
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id, nickname, country_code')
    .eq('id', player_id as string)
    .eq('nickname', nickname as string)
    .single()

  if (playerError || !player) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 403 })
  }

  // Insert message (cleanup of messages >24h is piggy-backed here)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  await Promise.all([
    supabase.from('chat_messages').insert({
      nickname: player.nickname,
      country_code: player.country_code,
      message: msg,
      ...(alliance_id ? { alliance_id: String(alliance_id) } : {}),
    }),
    supabase.from('chat_messages').delete().lt('created_at', cutoff),
  ])

  return NextResponse.json({ success: true })
}
