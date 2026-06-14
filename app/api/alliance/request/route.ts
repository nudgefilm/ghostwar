import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 }) }

  const rawA = body.country_a as string
  const rawB = body.country_b as string
  if (!rawA || !rawB || rawA === rawB) {
    return NextResponse.json({ error: 'INVALID_COUNTRIES' }, { status: 400 })
  }

  // Normalise: country_a < country_b matches DB CHECK constraint
  const [country_a, country_b] = [rawA, rawB].sort()
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('alliances')
    .select('request_count, status')
    .eq('country_a', country_a)
    .eq('country_b', country_b)
    .maybeSingle()

  let result
  if (!existing) {
    const { data } = await supabase
      .from('alliances')
      .insert({ country_a, country_b, request_count: 1, status: 'pending' })
      .select()
      .single()
    result = data
  } else if ((existing as Record<string, unknown>).status === 'broken') {
    const { data } = await supabase
      .from('alliances')
      .update({ request_count: 1, status: 'pending' })
      .eq('country_a', country_a)
      .eq('country_b', country_b)
      .select()
      .single()
    result = data
  } else {
    // pending or active: increment strength
    const { data } = await supabase
      .from('alliances')
      .update({ request_count: ((existing as Record<string, unknown>).request_count as number) + 1 })
      .eq('country_a', country_a)
      .eq('country_b', country_b)
      .select()
      .single()
    result = data
  }

  return NextResponse.json({ success: true, alliance: result })
}
