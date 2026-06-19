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
    .select('launcher_id, launcher_country, quantity, type, attacker_debuffed, alliance_reduction')
    .eq('id', missile_id as string)
    .single()

  if (missileError || !missile) {
    return NextResponse.json({ error: 'MISSILE_NOT_FOUND' }, { status: 404 })
  }

  // Capture prev damage BEFORE any update (accurate only for the first caller)
  const { data: prevCountry } = await supabase
    .from('countries')
    .select('damage_percent, defense_rating')
    .eq('code', target_country as string)
    .single()
  const prev_damage_percent: number = (prevCountry as Record<string, unknown>)?.damage_percent as number ?? 0
  const prev_defense_rating: number = (prevCountry as Record<string, unknown>)?.defense_rating as number ?? 100

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

  // Already processed by another client — check actual status to tell attacker if intercepted
  if (!updated || updated.length === 0) {
    const { data: statusRow } = await supabase
      .from('missiles')
      .select('status')
      .eq('id', missile_id as string)
      .single()
    return NextResponse.json({
      success: true,
      already_processed: true,
      was_intercepted: statusRow?.status === 'intercepted',
      launcher_id: missile.launcher_id,
      launcher_country: missile.launcher_country,
      quantity: missile.quantity,
      type: missile.type,
      attacker_debuffed: (missile as Record<string, unknown>).attacker_debuffed ?? false,
      alliance_reduction: ((missile as Record<string, unknown>).alliance_reduction as number) ?? 0,
      prev_damage_percent,
      new_damage_percent: prev_damage_percent,
      old_rank: null,
      new_rank: null,
    })
  }

  // Shield check: if any player in target country has shield_active, block damage
  const { data: shieldRows } = await supabase
    .from('players')
    .select('id')
    .eq('country_code', target_country as string)
    .eq('shield_active', true)
    .limit(1)

  if (shieldRows && shieldRows.length > 0 && (missile.type as string) !== 'nuke') {
    await supabase
      .from('players')
      .update({ shield_active: false })
      .eq('country_code', target_country as string)
      .eq('shield_active', true)
    return NextResponse.json({
      success: true,
      already_processed: false,
      was_intercepted: true,
      shield_blocked: true,
      launcher_id: missile.launcher_id,
      launcher_country: missile.launcher_country,
      quantity: missile.quantity,
      type: missile.type,
      attacker_debuffed: (missile as Record<string, unknown>).attacker_debuffed ?? false,
      alliance_reduction: ((missile as Record<string, unknown>).alliance_reduction as number) ?? 0,
      prev_damage_percent,
      new_damage_percent: prev_damage_percent,
      old_rank: null,
      new_rank: null,
    })
  }

  // Atomic defense/damage update — missile: ±0.1 per shot, nuke: ±10 per shot
  const weight = (missile.type as string) === 'nuke' ? 10 : 0.1
  const debuffed = (missile as Record<string, unknown>).attacker_debuffed === true
  const alliance_reduction = ((missile as Record<string, unknown>).alliance_reduction as number) ?? 0
  const baseDelta = debuffed
    ? (missile.quantity as number) * weight * 0.5
    : (missile.quantity as number) * weight
  const delta = alliance_reduction > 0
    ? baseDelta * (1 - alliance_reduction / 100)
    : baseDelta

  const new_damage_percent = Math.min(100, Math.max(0, prev_damage_percent + delta))
  const new_defense_rating = Math.min(100, Math.max(0, prev_defense_rating - delta))

  const { error: countryUpdateError } = await supabase
    .from('countries')
    .update({ damage_percent: new_damage_percent, defense_rating: new_defense_rating })
    .eq('code', target_country)

  if (countryUpdateError) {
    console.error('[impact] damage update failed:', countryUpdateError)
  }

  // Nuke BLACKOUT: defense hit 0 → lock all players in target country for 2 hours
  if ((missile.type as string) === 'nuke' && new_defense_rating <= 0) {
    const attackedUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('players')
      .update({ attacked_until: attackedUntil })
      .eq('country_code', target_country)
  }

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
      .select('total_kills, nickname')
      .eq('id', missile.launcher_id)
      .single()

    if (!launcherError && launcher != null) {
      const l = launcher as Record<string, unknown>
      const oldKills = (l.total_kills as number) ?? 0
      const newKills = oldKills + (missile.quantity as number)

      const [{ count: aboveBefore }, , { count: aboveAfter }] = await Promise.all([
        supabase.from('players').select('*', { count: 'exact', head: true }).gt('total_kills', oldKills),
        supabase.from('players').update({ total_kills: newKills }).eq('id', missile.launcher_id),
        supabase.from('players').select('*', { count: 'exact', head: true }).gt('total_kills', newKills),
      ])

      old_rank = (aboveBefore ?? 0) + 1
      new_rank = (aboveAfter ?? 0) + 1

      if ((missile.type as string) === 'nuke') {
        await supabase.from('hall_of_fame').insert({
          player_id: missile.launcher_id,
          nickname: String(l.nickname ?? 'UNKNOWN'),
          country_code: missile.launcher_country,
          action: 'nuke_launched',
        })
      }
    }
  }

  return NextResponse.json({
    success: true,
    already_processed: false,
    was_intercepted: false,
    launcher_id: missile.launcher_id,
    launcher_country: missile.launcher_country,
    quantity: missile.quantity,
    type: missile.type,
    attacker_debuffed: (missile as Record<string, unknown>).attacker_debuffed ?? false,
    alliance_reduction,
    prev_damage_percent,
    new_damage_percent,
    new_defense_rating,
    old_rank,
    new_rank,
  })
}
