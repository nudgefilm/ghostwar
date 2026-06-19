import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLIANCE_PACK_PRODUCT_ID = process.env.GUMROAD_ALLIANCE_PACK_PRODUCT_ID!

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 }) }

  const player_id = body.player_id as string
  const license_key = body.license_key as string

  if (!player_id || !license_key) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const gumRes = await fetch('https://api.gumroad.com/v2/licenses/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      product_id: ALLIANCE_PACK_PRODUCT_ID,
      license_key,
    }),
  })

  const gumData = await gumRes.json() as { success: boolean }

  if (!gumData.success) {
    return NextResponse.json({ error: 'Invalid license key' }, { status: 400 })
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
