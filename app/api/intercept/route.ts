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

  const { missile_id, intercepted, player_id, player_nickname, player_country_code } = body
  if (!missile_id || typeof intercepted !== 'boolean') {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: missile, error: missileError } = await supabase
    .from('missiles')
    .select('launcher_id, launcher_country, target_country, quantity, type, attacker_debuffed')
    .eq('id', missile_id as string)
    .single()

  if (missileError || !missile) {
    return NextResponse.json({ error: 'MISSILE_NOT_FOUND' }, { status: 404 })
  }

  if (intercepted) {
    const { data: updated } = await supabase
      .from('missiles')
      .update({ status: 'intercepted', intercepted_count: missile.quantity })
      .eq('id', missile_id as string)
      .eq('status', 'flying')
      .select('id')

    if (!updated || updated.length === 0) {
      return NextResponse.json({ success: true, already_processed: true })
    }

    if (missile.type === 'nuke' && player_id && player_nickname && player_country_code) {
      await supabase.from('hall_of_fame').insert({
        player_id: player_id as string,
        nickname: player_nickname as string,
        country_code: player_country_code as string,
        action: 'nuke_intercepted',
      })
    }

    return NextResponse.json({ success: true, intercepted: true })
  }

  // Not intercepted — full damage logic (same as /api/impact)
  const target_country = missile.target_country as string

  const { data: prevCountry } = await supabase
    .from('countries')
    .select('damage_percent')
    .eq('code', target_country)
    .single()
  const prev_damage_percent: number = prevCountry?.damage_percent ?? 0

  const { data: updated } = await supabase
    .from('missiles')
    .update({ status: 'hit' })
    .eq('id', missile_id as string)
    .eq('status', 'flying')
    .select('id')

  if (!updated || updated.length === 0) {
    return NextResponse.json({
      success: true, already_processed: true,
      prev_damage_percent, new_damage_percent: prev_damage_percent,
    })
  }

  const weight = (missile.type as string) === 'nuke' ? 50 : 1
  const debuffed = (missile as Record<string, unknown>).attacker_debuffed === true
  const delta = debuffed
    ? Math.max(1, Math.floor((missile.quantity as number) * weight * 0.5))
    : (missile.quantity as number) * weight

  const { data: dmgRows } = await supabase.rpc('increment_country_damage', {
    p_code: target_country,
    p_delta: delta,
  })

  const dmgRow = Array.isArray(dmgRows) && dmgRows.length > 0
    ? (dmgRows[0] as { new_stack: number; new_percent: number })
    : null
  const new_damage_percent: number = dmgRow ? Number(dmgRow.new_percent) : prev_damage_percent

  if (prev_damage_percent < 100 && new_damage_percent >= 100) {
    const countryName = COUNTRY_NAMES[target_country] ?? target_country
    await supabase.from('news_feed').insert({
      content: `💀 BREAKING: ${countryName} has been DESTROYED`,
      launcher_country: missile.launcher_country,
      target_country,
      type: 'destroyed',
      is_template: false,
    })
  }

  let old_rank: number | null = null
  let new_rank: number | null = null

  if (missile.launcher_id) {
    const { data: launcher } = await supabase
      .from('players')
      .select('total_kills')
      .eq('id', missile.launcher_id as string)
      .single()

    if (launcher) {
      const oldKills = (launcher as Record<string, unknown>).total_kills as number ?? 0
      const newKills = oldKills + (missile.quantity as number)

      const [{ count: aboveBefore }, , { count: aboveAfter }] = await Promise.all([
        supabase.from('players').select('*', { count: 'exact', head: true }).gt('total_kills', oldKills),
        supabase.from('players').update({ total_kills: newKills }).eq('id', missile.launcher_id as string),
        supabase.from('players').select('*', { count: 'exact', head: true }).gt('total_kills', newKills),
      ])

      old_rank = (aboveBefore ?? 0) + 1
      new_rank = (aboveAfter ?? 0) + 1
    }
  }

  return NextResponse.json({
    success: true, intercepted: false, already_processed: false,
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
