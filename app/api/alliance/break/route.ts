import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 }) }

  const { country_a, country_b } = body
  if (!country_a || !country_b) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from('alliances')
    .select('request_count')
    .eq('country_a', country_a as string)
    .eq('country_b', country_b as string)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }

  const currentCount = (existing as Record<string, unknown>).request_count as number
  const newCount = Math.max(0, currentCount - 1)
  const newStatus = newCount === 0 ? 'broken' : 'active'

  const { data } = await supabase
    .from('alliances')
    .update({ request_count: newCount, status: newStatus })
    .eq('country_a', country_a as string)
    .eq('country_b', country_b as string)
    .select()
    .single()

  return NextResponse.json({ success: true, alliance: data })
}
