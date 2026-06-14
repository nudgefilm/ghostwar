import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { COUNTRY_NAMES } from '@/lib/countries'

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

  // Always fetch missile metadata so we can return it to all callers
  const { data: missile, error: missileError } = await supabase
    .from('missiles')
    .select('launcher_id, launcher_country, quantity, type, attacker_debuffed')
    .eq('id', missile_id as string)
    .single()

  if (missileError || !missile) {
    return NextResponse.json({ error: 'MISSILE_NOT_FOUND' }, { status: 404 })
  }

  // Capture prev damage BEFORE any update (accurate only for the first caller)
  const { data: prevCountry } = await supabase
    .from('countries')
    .select('damage_percent')
    .eq('code', target_country as string)
    .single()
  const prev_damage_percent: number = prevCountry?.damage_percent ?? 0

  // Idempotency: mark as hit only if still flying
  const { data: updated, error: updateError } = await supabase
    .from('missiles')
    .update({ status: 'hit' })
    .eq('id', missile_id as string)
    .eq('status', 'flying')
    .select('id')

  if (updateError) {
    return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 })
  }

  // Already processed by another client — return metadata for victim battle report
  if (!updated || updated.length === 0) {
    return NextResponse.json({
      success: true,
      already_processed: true,
      launcher_id: missile.launcher_id,
      launcher_country: missile.launcher_country,
      quantity: missile.quantity,
      type: missile.type,
      attacker_debuffed: (missile as Record<string, unknown>).attacker_debuffed ?? false,
      prev_damage_percent,
      new_damage_percent: prev_damage_percent,
      old_rank: null,
      new_rank: null,
    })
  }

  // Atomic damage increment — avoids read-then-write race when multiple missiles
  // land on the same country simultaneously.
  const weight = (missile.type as string) === 'nuke' ? 50 : 1
  const debuffed = (missile as Record<string, unknown>).attacker_debuffed === true
  const delta = debuffed
    ? Math.max(1, Math.floor((missile.quantity as number) * weight * 0.5))
    : (missile.quantity as number) * weight

  const { data: dmgRows, error: countryUpdateError } = await supabase
    .rpc('increment_country_damage', {
      p_code:  target_country as string,
      p_delta: delta,
    })

  if (countryUpdateError) {
    console.error('[impact] damage increment failed:', countryUpdateError)
  }

  const dmgRow = Array.isArray(dmgRows) && dmgRows.length > 0
    ? (dmgRows[0] as { new_stack: number; new_percent: number })
    : null
  const new_damage_percent: number = dmgRow ? Number(dmgRow.new_percent) : prev_damage_percent

  // First time reaching 100% — broadcast DESTROYED news
  if (prev_damage_percent < 100 && new_damage_percent >= 100) {
    const countryName = COUNTRY_NAMES[target_country as string] ?? target_country
    await supabase.from('news_feed').insert({
      content: `💀 BREAKING: ${countryName} has been DESTROYED`,
      launcher_country: missile.launcher_country,
      target_country: target_country as string,
      type: 'destroyed',
      is_template: false,
    })
  }

  // Update total_kills and calculate rank (gracefully skip if column missing)
  let old_rank: number | null = null
  let new_rank: number | null = null

  if (missile.launcher_id) {
    const { data: launcher, error: launcherError } = await supabase
      .from('players')
      .select('total_kills')
      .eq('id', missile.launcher_id)
      .single()

    if (!launcherError && launcher != null) {
      const oldKills = (launcher as Record<string, unknown>).total_kills as number ?? 0
      const newKills = oldKills + (missile.quantity as number)

      const [{ count: aboveBefore }, , { count: aboveAfter }] = await Promise.all([
        supabase.from('players').select('*', { count: 'exact', head: true }).gt('total_kills', oldKills),
        supabase.from('players').update({ total_kills: newKills }).eq('id', missile.launcher_id),
        supabase.from('players').select('*', { count: 'exact', head: true }).gt('total_kills', newKills),
      ])

      old_rank = (aboveBefore ?? 0) + 1
      new_rank = (aboveAfter ?? 0) + 1
    }
  }

  return NextResponse.json({
    success: true,
    already_processed: false,
    launcher_id: missile.launcher_id,
    launcher_country: missile.launcher_country,
    quantity: missile.quantity,
    type: missile.type,
    attacker_debuffed: (missile as Record<string, unknown>).attacker_debuffed ?? false,
    prev_damage_percent,
    new_damage_percent,
    old_rank,
    new_rank,
  })
}
