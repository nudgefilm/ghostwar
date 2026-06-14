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
  const { data, error } = await supabase
    .from('alliances')
    .update({ status: 'active' })
    .eq('country_a', country_a as string)
    .eq('country_b', country_b as string)
    .eq('status', 'pending')
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }

  return NextResponse.json({ success: true, alliance: data })
}
