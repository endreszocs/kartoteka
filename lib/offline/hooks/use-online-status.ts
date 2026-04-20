'use client'

import { useEffect, useState } from 'react'

/**
 * Egyszerű hook az online/offline állapot követésére.
 *
 * Használja a `navigator.onLine` API-t + az `online`/`offline` event-eket.
 *
 * **SSR-biztos**: az initial state MINDIG `true` (szerver + kliens első render
 * egyezik → nincs hydration mismatch). A valós érték csak a useEffect után
 * kerül be (kliens-oldalon). Ez azt jelenti, hogy ha a user tényleg offline
 * kezd, egy rövid "flicker" lehet online → offline, de ez elfogadható
 * költsége a hydration biztonságnak.
 *
 * Használat:
 *   const isOnline = useOnlineStatus()
 *   if (!isOnline) return <OfflineBanner />
 */
export function useOnlineStatus(): boolean {
  // SSR-safe: mindig true az initial state. A useEffect után frissül a valós
  // navigator.onLine érték kliens-oldalon.
  const [isOnline, setIsOnline] = useState<boolean>(true)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Kezdeti érték a mount után (nincs hydration mismatch kockázat)
    // queueMicrotask → a setState nem szinkron az effect body-ban (React 19 strict)
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setIsOnline(navigator.onLine)
    })

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      cancelled = true
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
