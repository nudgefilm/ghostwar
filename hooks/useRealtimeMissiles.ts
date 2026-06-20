'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface MissileRow {
  id: string
  launcher_id: string
  launcher_country: string
  target_country: string
  type: string
  quantity: number
  status: string
  launched_at: string
  arrives_at: string
}

export interface NewsFeedRow {
  id: string
  content: string
  launcher_country: string | null
  target_country: string | null
  type: string | null
  is_template: boolean
  created_at: string
}

export interface CountryRow {
  code: string
  name: string
  flag: string
  damage_stack: number
  damage_percent: number
  defense_rating: number
  online_users: number
}

interface UseRealtimeMissilesParams {
  onMissile: (missile: MissileRow) => void
  onNews: (news: NewsFeedRow) => void
  onCountryUpdate: (country: CountryRow) => void
}

export function useRealtimeMissiles({
  onMissile,
  onNews,
  onCountryUpdate,
}: UseRealtimeMissilesParams) {
  const callbacksRef = useRef({ onMissile, onNews, onCountryUpdate })
  // missiles: ID-based dedup — immune to server/client clock skew
  const seenMissileIdsRef = useRef<Set<string>>(new Set())
  // Lower bound: 10 min before mount, covers any clock skew and avoids full table scan
  const missilesWindowRef = useRef<string>(new Date(Date.now() - 10 * 60 * 1000).toISOString())
  // news_feed: keeps timestamp-based (works, DB-generated created_at is always consistent)
  const lastNewsPollRef = useRef<string>(new Date().toISOString())
  const countryTickRef = useRef(0)

  useEffect(() => {
    callbacksRef.current = { onMissile, onNews, onCountryUpdate }
  }, [onMissile, onNews, onCountryUpdate])

  useEffect(() => {
    console.log('[useRealtimeMissiles] mounted — ID-based missile dedup')
    const supabase = createClient()

    // Realtime: countries UPDATE (online_users, damage_percent 등 즉시 반영)
    const countriesChannel = supabase
      .channel('countries-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'countries' },
        (payload) => {
          callbacksRef.current.onCountryUpdate(payload.new as CountryRow)
        }
      )
      .subscribe()

    let tickCount = 0
    const poll = async () => {
      tickCount++

      // missiles: fixed lower bound (no sliding window) + ID dedup
      // — immune to clock skew between cron server and client
      const newsSince = lastNewsPollRef.current
      const newsNow = new Date().toISOString()
      lastNewsPollRef.current = newsNow

      const [{ data: newMissiles, error: missileError }, { data: newNews }] = await Promise.all([
        supabase
          .from('missiles')
          .select('*')
          .gte('launched_at', missilesWindowRef.current)   // fixed lower bound, gte not gt
          .order('launched_at', { ascending: true }),
        supabase
          .from('news_feed')
          .select('*')
          .gt('created_at', newsSince)
          .order('created_at', { ascending: true }),
      ])

      if (tickCount % 10 === 0) {
        console.log(`[poll] tick #${tickCount} | missiles query: ${newMissiles?.length ?? 'err'} rows | seen: ${seenMissileIdsRef.current.size}`)
      }
      if (missileError) console.error('[poll] missiles error:', missileError)

      // ID-based dedup: only process missiles not yet seen this session
      newMissiles?.forEach(m => {
        const id = m.id as string
        if (!seenMissileIdsRef.current.has(id)) {
          seenMissileIdsRef.current.add(id)
          console.log('[poll] new missile:', id.slice(0, 8), (m as Record<string, unknown>).launcher_country, '->', (m as Record<string, unknown>).target_country)
          callbacksRef.current.onMissile(m as MissileRow)
        }
      })

      newNews?.forEach(n => callbacksRef.current.onNews(n as NewsFeedRow))

      countryTickRef.current += 1
      if (countryTickRef.current >= 5) {
        countryTickRef.current = 0
        const { data: countries } = await supabase
          .from('countries')
          .select('*')
          .order('damage_percent', { ascending: false })
        countries?.forEach(c => callbacksRef.current.onCountryUpdate(c as CountryRow))
      }
    }

    const interval = setInterval(poll, 1000)

    return () => {
      clearInterval(interval)
      supabase.removeChannel(countriesChannel)
    }
  }, [])
}
