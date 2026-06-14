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
  const lastPollTimeRef = useRef<string>(new Date().toISOString())
  const countryTickRef = useRef(0)

  useEffect(() => {
    callbacksRef.current = { onMissile, onNews, onCountryUpdate }
  }, [onMissile, onNews, onCountryUpdate])

  useEffect(() => {
    const supabase = createClient()

    const poll = async () => {
      const since = lastPollTimeRef.current
      const now = new Date().toISOString()

      const [{ data: newMissiles }, { data: newNews }] = await Promise.all([
        supabase
          .from('missiles')
          .select('*')
          .gt('launched_at', since)
          .order('launched_at', { ascending: true }),
        supabase
          .from('news_feed')
          .select('*')
          .gt('created_at', since)
          .order('created_at', { ascending: true }),
      ])

      lastPollTimeRef.current = now

      newMissiles?.forEach(m => callbacksRef.current.onMissile(m as MissileRow))
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

    return () => clearInterval(interval)
  }, [])
}
