import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { COUNTRY_COORDS } from '@/lib/countries'

function calcFlightSeconds(
  fromCoords: [number, number],
  toCoords: [number, number],
): number {
  const R = 6371
  const lat1 = fromCoords[0] * (Math.PI / 180)
  const lon1 = fromCoords[1] * (Math.PI / 180)
  const lat2 = toCoords[0] * (Math.PI / 180)
  const lon2 = toCoords[1] * (Math.PI / 180)
  const dLat = lat2 - lat1
  const dLon = lon2 - lon1
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  const dist = R * 2 * Math.asin(Math.sqrt(a))
  return Math.max(10, Math.min(30, (dist / 20000) * 30))
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const { launcher_id, launcher_country, target_country, type, quantity } = body

  if (!launcher_id || !launcher_country || !target_country || !type || !quantity) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
  }

  if (typeof launcher_country !== 'string' || typeof target_country !== 'string') {
    return NextResponse.json({ error: 'INVALID_COUNTRY_TYPE' }, { status: 400 })
  }

  if (launcher_country === target_country) {
    return NextResponse.json({ error: 'SELF_TARGETING_PROHIBITED' }, { status: 400 })
  }

  const fromCoords = COUNTRY_COORDS[launcher_country]
  const toCoords = COUNTRY_COORDS[target_country]

  if (!fromCoords || !toCoords) {
    return NextResponse.json({ error: 'INVALID_COUNTRY' }, { status: 400 })
  }

  const isNuke = type === 'nuke'
  const qty = Number(quantity)

  if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
    return NextResponse.json({ error: 'INVALID_QUANTITY' }, { status: 400 })
  }

  const flight_seconds = calcFlightSeconds(fromCoords, toCoords)
  const arrives_at = new Date(Date.now() + flight_seconds * 1000).toISOString()

  const supabase = createAdminClient()

  // Check ammo + scorched earth debuff (parallel)
  const [
    { data: playerData, error: playerError },
    { data: launcherCountryData },
  ] = await Promise.all([
    supabase.from('players').select('missiles_remaining, nukes_remaining').eq('id', launcher_id).single(),
    supabase.from('countries').select('damage_percent').eq('code', launcher_country).single(),
  ])

  if (playerError || !playerData) {
    return NextResponse.json({ error: 'PLAYER_NOT_FOUND' }, { status: 404 })
  }

  const attacker_debuffed = (launcherCountryData?.damage_percent ?? 0) >= 100

  const ammoField = isNuke ? 'nukes_remaining' : 'missiles_remaining'
  const currentAmmo = isNuke
    ? playerData.nukes_remaining
    : playerData.missiles_remaining

  if (currentAmmo - qty < 0) {
    return NextResponse.json({ error: 'INSUFFICIENT_AMMO' }, { status: 400 })
  }

  // Tally missiles fired so far to calculate nuke reward
  let nukesEarned = 0
  if (!isNuke) {
    const { data: firedRows } = await supabase
      .from('missiles')
      .select('quantity')
      .eq('launcher_id', launcher_id as string)
      .eq('type', 'missile')
    const prevTotal = firedRows?.reduce((s, r) => s + (r.quantity as number), 0) ?? 0
    nukesEarned = Math.floor((prevTotal + qty) / 1000) - Math.floor(prevTotal / 1000)
  }

  // Deduct ammo (and award nukes if earned, atomically per field)
  const ammoUpdate: Record<string, number> = { [ammoField]: currentAmmo - qty }
  if (nukesEarned > 0) ammoUpdate.nukes_remaining = playerData.nukes_remaining + nukesEarned

  const { error: updateError } = await supabase
    .from('players')
    .update(ammoUpdate)
    .eq('id', launcher_id)

  if (updateError) {
    return NextResponse.json({ error: 'AMMO_UPDATE_FAILED' }, { status: 500 })
  }

  // Check for active alliance — if one exists, this launch is a betrayal.
  // Reduction is stored on the missile so impact route applies it even after
  // the alliance is broken.
  const [allianceA, allianceB] = [launcher_country as string, target_country as string].sort()
  const { data: activeAlliance } = await supabase
    .from('alliances')
    .select('request_count')
    .eq('country_a', allianceA)
    .eq('country_b', allianceB)
    .eq('status', 'active')
    .maybeSingle()

  let alliance_reduction = 0
  let betrayal = false
  if (activeAlliance) {
    alliance_reduction = Math.min(50, (activeAlliance as Record<string, unknown>).request_count as number * 5)
    betrayal = true
    await Promise.all([
      supabase
        .from('alliances')
        .update({ status: 'broken' })
        .eq('country_a', allianceA)
        .eq('country_b', allianceB),
      supabase.from('news_feed').insert({
        content: `🔴 BETRAYAL: ${launcher_country} attacked allied nation ${target_country}!`,
        launcher_country,
        target_country,
        type: 'alliance_broken',
        is_template: false,
      }),
    ])
  }

  // Insert missile row
  const { data: missileData, error: missileError } = await supabase
    .from('missiles')
    .insert({
      launcher_id: launcher_id as string,
      launcher_country,
      target_country,
      type: type as string,
      quantity: qty,
      arrives_at,
      status: 'flying',
      attacker_debuffed,
      alliance_reduction,
    })
    .select('id')
    .single()

  if (missileError || !missileData) {
    // Attempt to refund ammo on failure
    await supabase
      .from('players')
      .update({ [ammoField]: currentAmmo })
      .eq('id', launcher_id)
    return NextResponse.json({ error: 'LAUNCH_FAILED' }, { status: 500 })
  }

  // Breaking news
  const weaponLabel = isNuke ? 'nuclear warhead(s)' : 'missile(s)'
  await supabase.from('news_feed').insert({
    content: `🔴 BREAKING: ${launcher_country} forces launched ${qty} ${weaponLabel} toward ${target_country}.`,
    launcher_country,
    target_country,
    type: 'attack',
    is_template: true,
  })

  return NextResponse.json({
    success: true,
    missile_id: missileData.id,
    arrives_at,
    flight_seconds,
    nukes_earned: nukesEarned,
    attacker_debuffed,
    betrayal,
    alliance_reduction,
  })
}
