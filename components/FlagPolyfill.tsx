'use client'

import { useEffect } from 'react'

export default function FlagPolyfill() {
  useEffect(() => {
    import('country-flag-emoji-polyfill').then(({ polyfillCountryFlagEmojis }) => {
      polyfillCountryFlagEmojis()
    })
  }, [])
  return null
}
