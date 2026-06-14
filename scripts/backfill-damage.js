// Backfill damage_stack and damage_percent for all countries
// from existing hit missiles. Run once after migration 0003.
// Usage: node scripts/backfill-damage.js

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local')
const env = fs.readFileSync(envPath, 'utf8')
const get = (key) => {
  const m = env.match(new RegExp(`^${key}=(.+)$`, 'm'))
  return m ? m[1].trim() : null
}

const SUPABASE_URL = get('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_KEY  = get('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // 1. Fetch all hit missiles
  const { data: missiles, error: mErr } = await supabase
    .from('missiles')
    .select('target_country, quantity, type')
    .eq('status', 'hit')

  if (mErr) { console.error('Failed to fetch missiles:', mErr); process.exit(1) }
  console.log(`Fetched ${missiles.length} hit missile rows`)

  // 2. Aggregate damage_stack per country
  const stack = {}
  for (const m of missiles) {
    const w = m.type === 'nuke' ? 50 : 1
    stack[m.target_country] = (stack[m.target_country] ?? 0) + m.quantity * w
  }

  const entries = Object.entries(stack).sort((a, b) => b[1] - a[1])
  console.log(`\nCountries with damage:`)
  for (const [code, s] of entries) {
    const pct = Math.min(100, Math.floor(s / 10))
    console.log(`  ${code}: damage_stack=${s}  damage_percent=${pct}%`)
  }

  // 3. Update each country
  console.log(`\nPatching ${entries.length} countries...`)
  let ok = 0, fail = 0
  for (const [code, s] of entries) {
    const damage_percent = Math.min(100, Math.floor(s / 10))
    const { error } = await supabase
      .from('countries')
      .update({ damage_stack: s, damage_percent })
      .eq('code', code)
    if (error) {
      console.error(`  FAIL ${code}:`, error.message)
      fail++
    } else {
      console.log(`  OK   ${code}: stack=${s} pct=${damage_percent}%`)
      ok++
    }
  }

  console.log(`\nDone. ${ok} updated, ${fail} failed.`)
}

main()
