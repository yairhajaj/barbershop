/**
 * useOnline — tracks browser/device connectivity.
 *
 * Returns true while online, false while offline.
 * Works in both browser and Capacitor native shells.
 *
 * Usage:
 *   const online = useOnline()
 *   {!online && <OfflineBanner />}
 */
import { useState, useEffect } from 'react'

export function useOnline() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    const up   = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online',  up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online',  up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return online
}
