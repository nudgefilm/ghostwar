import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PRODUCTS = [
  { permalink: 'tbyskm', reward: 'missiles', amount: 100, field: 'missiles_remaining' },
  { permalink: 'nneaar', reward: 'nukes',    amount: 2,   field: 'nukes_remaining'   },
] as const

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 }) }

  const { player_id, code } = body
  if (!player_id || !code) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
  }

  for (const product of PRODUCTS) {
    const params = new URLSearchParams({
      product_permalink: product.permalink,
      license_key: String(code),
      increment_uses_count: 'true',
    })

    let gumroadRes: { success: boolean; uses?: number; message?: string }
    try {
      const r = await fetch('https://api.gumroad.com/v2/licenses/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
      gumroadRes = await r.json() as typeof gumroadRes
      console.error(`[redeem] ${product.permalink}: HTTP ${r.status}`, JSON.stringify(gumroadRes))
    } catch (err) {
      console.error(`[redeem] ${product.permalink}: fetch error`, err)
      continue
    }

    if (!gumroadRes.success) continue

    if ((gumroadRes.uses ?? 0) > 1) {
      return NextResponse.json({ success: false, error: 'CODE_ALREADY_USED' })
    }

    // First use — grant reward
    const supabase = createAdminClient()
    const { data: player } = await supabase
      .from('players')
      .select(product.field)
      .eq('id', player_id as string)
      .single()

    if (!player) {
      return NextResponse.json({ error: 'PLAYER_NOT_FOUND' }, { status: 404 })
    }

    const current = ((player as Record<string, unknown>)[product.field] as number) ?? 0
    await supabase
      .from('players')
      .update({ [product.field]: current + product.amount })
      .eq('id', player_id as string)

    return NextResponse.json({ success: true, reward: product.reward, amount: product.amount })
  }

  return NextResponse.json({ success: false, error: 'INVALID_CODE' })
}
