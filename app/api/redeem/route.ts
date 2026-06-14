import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Product = {
  product_id: string
  permalink: string
  updates: Record<string, number>
  response: Record<string, unknown>
}

const PRODUCTS: Product[] = [
  {
    product_id: 'MUFaBaVZasH2sje5qU-OAQ==',
    permalink: 'tbyskm',
    updates: { missiles_remaining: 100 },
    response: { reward: 'missiles', amount: 100 },
  },
  {
    product_id: 'V2kdAYosv6oKhuGfOVZgww==',
    permalink: 'nneaar',
    updates: { nukes_remaining: 2, missiles_remaining: 500 },
    response: { reward: 'bundle', nukes: 2, missiles: 500 },
  },
]

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
      product_id: product.product_id,
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

    // First use — fetch current values and apply all updates atomically
    const supabase = createAdminClient()
    const fields = Object.keys(product.updates).join(', ')
    const { data: player } = await supabase
      .from('players')
      .select(fields)
      .eq('id', player_id as string)
      .single()

    if (!player) {
      return NextResponse.json({ error: 'PLAYER_NOT_FOUND' }, { status: 404 })
    }

    const patch: Record<string, number> = {}
    for (const [field, delta] of Object.entries(product.updates)) {
      patch[field] = (((player as Record<string, unknown>)[field] as number) ?? 0) + delta
    }

    await supabase
      .from('players')
      .update(patch)
      .eq('id', player_id as string)

    return NextResponse.json({ success: true, ...product.response })
  }

  return NextResponse.json({ success: false, error: 'INVALID_CODE' })
}
