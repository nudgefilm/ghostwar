import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'FEATURE_REMOVED' }, { status: 410 })
}
