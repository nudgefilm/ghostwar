import { createAdminClient } from '@/lib/supabase/admin'
import { COUNTRY_COORDS } from '@/lib/countries'
import { NextResponse } from 'next/server'

function calcFlightSeconds(from: [number, number], to: [number, number]): number {
  const R = 6371
  const lat1 = from[0] * (Math.PI / 180)
  const lon1 = from[1] * (Math.PI / 180)
  const lat2 = to[0] * (Math.PI / 180)
  const lon2 = to[1] * (Math.PI / 180)
  const dLat = lat2 - lat1
  const dLon = lon2 - lon1
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  const dist = R * 2 * Math.asin(Math.sqrt(a))
  return Math.max(10, Math.min(30, (dist / 20000) * 30))
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Check toggle
  const { data: setting, error: settingError } = await supabase
    .from('game_settings')
    .select('value')
    .eq('key', 'auto_strike_enabled')
    .single()

  if (settingError) {
    console.error('[auto-strike] game_settings fetch error:', settingError)
    return NextResponse.json({ error: 'settings_fetch_failed', detail: settingError.message }, { status: 500 })
  }

  if (!setting || !(setting as { value: boolean }).value) {
    return NextResponse.json({ skipped: true, reason: 'disabled' })
  }

  // Find GHOSTWAR player
  const { data: admin, error: adminError } = await supabase
    .from('players')
    .select('id, country_code, missiles_remaining')
    .eq('nickname', 'GHOSTWAR')
    .maybeSingle()

  if (adminError) {
    console.error('[auto-strike] GHOSTWAR fetch error:', adminError)
    return NextResponse.json({ error: 'admin_fetch_failed', detail: adminError.message }, { status: 500 })
  }

  if (!admin) {
    console.warn('[auto-strike] GHOSTWAR player not found')
    return NextResponse.json({ skipped: true, reason: 'ghostwar_not_found' })
  }

  const adminRow = admin as { id: string; country_code: string; missiles_remaining: number }

  if (adminRow.missiles_remaining < 1) {
    console.warn('[auto-strike] GHOSTWAR has no ammo', { id: adminRow.id, country_code: adminRow.country_code })
    return NextResponse.json({ skipped: true, reason: 'no_ammo', admin_id: adminRow.id, admin_country: adminRow.country_code })
  }

  if (!adminRow.country_code) {
    console.error('[auto-strike] GHOSTWAR has no country_code')
    return NextResponse.json({ skipped: true, reason: 'no_country_code' })
  }

  const fromCoords = COUNTRY_COORDS[adminRow.country_code]
  if (!fromCoords) {
    console.error('[auto-strike] GHOSTWAR country_code not in COUNTRY_COORDS:', adminRow.country_code)
    return NextResponse.json({ skipped: true, reason: 'invalid_launcher_coords', country: adminRow.country_code })
  }

  // Pick random target (distinct country_code, not GHOSTWAR's)
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('country_code')
    .neq('country_code', adminRow.country_code)

  if (playersError) {
    console.error('[auto-strike] players fetch error:', playersError)
    return NextResponse.json({ error: 'players_fetch_failed', detail: playersError.message }, { status: 500 })
  }

  if (!players || players.length === 0) {
    return NextResponse.json({ skipped: true, reason: 'no_targets' })
  }

  // Deduplicate country codes
  const uniqueCodes = [...new Set((players as { country_code: string }[]).map(p => p.country_code))]
  const targetCode = uniqueCodes[Math.floor(Math.random() * uniqueCodes.length)]

  const toCoords = COUNTRY_COORDS[targetCode]
  if (!toCoords) {
    console.error('[auto-strike] target country_code not in COUNTRY_COORDS:', targetCode)
    return NextResponse.json({ skipped: true, reason: 'invalid_target_coords', country: targetCode })
  }

  const flight_seconds = calcFlightSeconds(fromCoords, toCoords)
  const arrives_at = new Date(Date.now() + flight_seconds * 1000).toISOString()

  // Deduct missile
  const { error: deductError } = await supabase
    .from('players')
    .update({ missiles_remaining: adminRow.missiles_remaining - 1 })
    .eq('id', adminRow.id)

  if (deductError) {
    console.error('[auto-strike] missile deduct error:', deductError)
    return NextResponse.json({ error: 'deduct_failed', detail: deductError.message }, { status: 500 })
  }

  // Insert missile row — launched_at must be explicit: polling uses .gt('launched_at', since)
  const launched_at = new Date().toISOString()
  const { data: missileData, error: missileError } = await supabase
    .from('missiles')
    .insert({
      launcher_id: adminRow.id,
      launcher_country: adminRow.country_code,
      target_country: targetCode,
      type: 'missile',
      quantity: 1,
      launched_at,
      arrives_at,
      status: 'flying',
      attacker_debuffed: false,
      alliance_reduction: 0,
    })
    .select('id')
    .single()

  if (missileError || !missileData) {
    console.error('[auto-strike] missiles INSERT error:', missileError)
    // Refund ammo
    await supabase
      .from('players')
      .update({ missiles_remaining: adminRow.missiles_remaining })
      .eq('id', adminRow.id)
    return NextResponse.json({ error: 'missile_insert_failed', detail: missileError?.message }, { status: 500 })
  }

  // Breaking news
  const { error: newsError } = await supabase.from('news_feed').insert({
    content: `🔴 BREAKING: ${adminRow.country_code} forces launched 1 missile(s) toward ${targetCode}.`,
    launcher_country: adminRow.country_code,
    target_country: targetCode,
    type: 'attack',
    is_template: true,
  })

  if (newsError) {
    console.error('[auto-strike] news_feed INSERT error:', newsError)
  }

  return NextResponse.json({
    success: true,
    missile_id: missileData.id,
    launcher: adminRow.country_code,
    target: targetCode,
    arrives_at,
    flight_seconds,
  })
}
