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
  const { data: setting } = await supabase
    .from('game_settings')
    .select('value')
    .eq('key', 'auto_strike_enabled')
    .single()

  if (!setting || !(setting as { value: boolean }).value) {
    return NextResponse.json({ skipped: true, reason: 'disabled' })
  }

  // Find GHOSTWAR player
  const { data: admin } = await supabase
    .from('players')
    .select('id, country_code, missiles_remaining')
    .eq('nickname', 'GHOSTWAR')
    .maybeSingle()

  if (!admin || (admin as { missiles_remaining: number }).missiles_remaining < 1) {
    return NextResponse.json({ skipped: true, reason: 'no_ammo' })
  }

  const adminRow = admin as { id: string; country_code: string; missiles_remaining: number }

  // Pick random active target (not GHOSTWAR's country)
  const { data: players } = await supabase
    .from('players')
    .select('country_code')
    .neq('country_code', adminRow.country_code)

  if (!players || players.length === 0) {
    return NextResponse.json({ skipped: true, reason: 'no_targets' })
  }

  const targets = players as { country_code: string }[]
  const target = targets[Math.floor(Math.random() * targets.length)]

  const fromCoords = COUNTRY_COORDS[adminRow.country_code]
  const toCoords = COUNTRY_COORDS[target.country_code]

  if (!fromCoords || !toCoords) {
    return NextResponse.json({ skipped: true, reason: 'invalid_coords' })
  }

  const flight_seconds = calcFlightSeconds(fromCoords, toCoords)
  const arrives_at = new Date(Date.now() + flight_seconds * 1000).toISOString()

  // Deduct missile
  await supabase
    .from('players')
    .update({ missiles_remaining: adminRow.missiles_remaining - 1 })
    .eq('id', adminRow.id)

  // Insert missile row
  await supabase.from('missiles').insert({
    launcher_id: adminRow.id,
    launcher_country: adminRow.country_code,
    target_country: target.country_code,
    type: 'missile',
    quantity: 1,
    arrives_at,
    status: 'flying',
    attacker_debuffed: false,
    alliance_reduction: 0,
  })

  // Breaking news
  await supabase.from('news_feed').insert({
    content: `🔴 BREAKING: ${adminRow.country_code} forces launched 1 missile(s) toward ${target.country_code}.`,
    launcher_country: adminRow.country_code,
    target_country: target.country_code,
    type: 'attack',
    is_template: true,
  })

  return NextResponse.json({ success: true, target: target.country_code })
}
