import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const { missile_id, target_country } = body

  if (!missile_id || !target_country) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Idempotency: only process if still 'flying'
  const { data: updated, error: updateError } = await supabase
    .from('missiles')
    .update({ status: 'hit' })
    .eq('id', missile_id as string)
    .eq('status', 'flying')
    .select('id')

  if (updateError) {
    return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 })
  }

  // Another client already processed this impact
  if (!updated || updated.length === 0) {
    return NextResponse.json({ success: true, already_processed: true })
  }

  // Sum all hit missiles for this country to compute damage
  const { data: hitMissiles } = await supabase
    .from('missiles')
    .select('quantity, type')
    .eq('target_country', target_country as string)
    .eq('status', 'hit')

  const totalDamage = hitMissiles?.reduce((sum, m) => {
    const weight = m.type === 'nuke' ? 50 : 1
    return sum + (m.quantity as number) * weight
  }, 0) ?? 0

  const new_damage_percent = Math.min(100, Math.floor(totalDamage / 1000) * 10)

  await supabase
    .from('countries')
    .update({ damage_percent: new_damage_percent })
    .eq('code', target_country as string)

  return NextResponse.json({ success: true, new_damage_percent })
}
