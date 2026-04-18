/**
 * useKeyboardAware — scrolls the focused input into view when the iOS/Android
 * soft keyboard rises (fixes forms hidden behind keyboard on native).
 *
 * Wire this once in AdminLayout (covers all admin forms) and BookingLayout
 * (covers all booking forms). It is a no-op in a desktop browser.
 *
 * Usage:
 *   useKeyboardAware()   // in AdminLayout.jsx
 */
import { useEffect } from 'react'
import { listenKeyboardShow } from '../lib/native'

export function useKeyboardAware() {
  useEffect(() => {
    let cleanup = () => {}
    listenKeyboardShow(() => {
      const el = document.activeElement
      if (el && typeof el.scrollIntoView === 'function') {
        // Small delay lets the keyboard finish animating before we scroll
        setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60)
      }
    }).then((remove) => { cleanup = remove })
    return () => cleanup()
  }, [])
}
