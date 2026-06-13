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
  const missileQueue = useRef<MissileRow[]>([])
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const callbacksRef = useRef({ onMissile, onNews, onCountryUpdate })

  useEffect(() => {
    callbacksRef.current = { onMissile, onNews, onCountryUpdate }
  }, [onMissile, onNews, onCountryUpdate])

  useEffect(() => {
    const supabase = createClient()

    const startFlush = () => {
      if (flushTimerRef.current) return
      flushTimerRef.current = setInterval(() => {
        const batch = missileQueue.current.splice(0)
        batch.forEach(m => callbacksRef.current.onMissile(m))
        if (missileQueue.current.length === 0 && flushTimerRef.current) {
          clearInterval(flushTimerRef.current)
          flushTimerRef.current = null
        }
      }, 500)
    }

    const channel = supabase
      .channel('ghostwar-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'missiles', filter: 'status=eq.flying' },
        payload => {
          missileQueue.current.push(payload.new as MissileRow)
          startFlush()
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'news_feed' },
        payload => {
          callbacksRef.current.onNews(payload.new as NewsFeedRow)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'countries' },
        payload => {
          callbacksRef.current.onCountryUpdate(payload.new as CountryRow)
        },
      )
      .subscribe()

    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current)
      supabase.removeChannel(channel)
    }
  }, [])
}
