import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('recover_countries', { p_delta_stack: 10 })

  if (error) {
    console.error('[recover] failed:', error)
    return NextResponse.json({ error: 'RECOVER_FAILED' }, { status: 500 })
  }

  return NextResponse.json({ success: true, updated: data ?? [] })
}
