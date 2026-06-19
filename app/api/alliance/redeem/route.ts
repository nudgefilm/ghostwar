import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 }) }

  const player_id = body.player_id as string
  const license_key = body.license_key as string

  if (!player_id || !license_key) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  let gumData: { success: boolean; uses?: number; message?: string }
  try {
    const r = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        product_id: 'bcqbei',
        license_key,
        increment_uses_count: 'true',
      }).toString(),
    })
    gumData = await r.json() as typeof gumData
  } catch (err) {
    console.error('[alliance/redeem] fetch error', err)
    return NextResponse.json({ error: 'GUMROAD_UNREACHABLE' }, { status: 502 })
  }

  if (!gumData.success) {
    return NextResponse.json({ error: 'Invalid license key' }, { status: 400 })
  }

  if ((gumData.uses ?? 0) > 1) {
    return NextResponse.json({ error: 'CODE_ALREADY_USED' }, { status: 409 })
  }

  const expires_at = new Date()
  expires_at.setDate(expires_at.getDate() + 30)

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('players')
    .update({ alliance_pack_expires_at: expires_at.toISOString() })
    .eq('id', player_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, expires_at: expires_at.toISOString() })
}
