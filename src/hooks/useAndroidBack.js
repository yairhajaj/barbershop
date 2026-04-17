import { useEffect } from 'react'
import { onAndroidBack } from '../lib/native'

/**
 * Register an Android hardware back-button handler.
 *
 * The handler fires when the user presses the Android back button.
 * Pass `enabled=false` to temporarily disable (e.g. when a modal is closed).
 *
 * Usage:
 *   useAndroidBack(() => setModalOpen(false), modalOpen)
 *
 * @param {() => void} handler  — what to do on back press
 * @param {boolean} [enabled=true]  — only registers when true
 */
export function useAndroidBack(handler, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    let cleanup = () => {}
    onAndroidBack(handler).then((remove) => { cleanup = remove })
    return () => cleanup()
  }, [handler, enabled])
}
