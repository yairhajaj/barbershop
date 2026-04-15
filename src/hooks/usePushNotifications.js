import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

/**
 * Detects whether we are running inside a Capacitor native shell.
 * Works without importing Capacitor at the top level so the web build
 * doesn't fail when the native package is absent.
 */
function isNative() {
  return typeof window !== 'undefined' && !!window?.Capacitor?.isNativePlatform?.()
}

// ── Native push (Capacitor) ───────────────────────────────────────────────────
async function requestNativePush(userId) {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    // Ask OS for permission
    const result = await PushNotifications.requestPermissions()
    if (result.receive !== 'granted') return { ok: false, reason: 'denied' }

    // Register with APNs / FCM
    await PushNotifications.register()

    // The token arrives via the 'registration' event
    return new Promise(resolve => {
      PushNotifications.addListener('registration', async token => {
        if (userId) {
          await supabase
            .from('profiles')
            .update({ push_token: JSON.stringify({ type: 'native', token: token.value }) })
            .eq('id', userId)
        }
        resolve({ ok: true, token: token.value })
      })

      PushNotifications.addListener('registrationError', err => {
        resolve({ ok: false, reason: 'error', error: err })
      })
    })
  } catch (err) {
    console.error('Native push error:', err)
    return { ok: false, reason: 'error', error: err }
  }
}

async function unregisterNativePush(userId) {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    await PushNotifications.removeAllListeners()
    if (userId) {
      await supabase.from('profiles').update({ push_token: null }).eq('id', userId)
    }
  } catch { /* ignore */ }
}

// ── Web push (browser service worker) ────────────────────────────────────────
async function requestWebPush(userId) {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return { ok: false, reason: 'not_supported' }
  }

  if (typeof Notification === 'undefined') return { ok: false, reason: 'not_supported' }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'denied' }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
    if (!vapidKey) return { ok: false, reason: 'no_vapid_key' }

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
    }

    if (userId) {
      await supabase
        .from('profiles')
        .update({ push_token: JSON.stringify(sub) })
        .eq('id', userId)
    }

    return { ok: true, subscription: sub }
  } catch (err) {
    console.error('Web push error:', err)
    return { ok: false, reason: 'error', error: err }
  }
}

async function unregisterWebPush(userId) {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = await reg?.pushManager?.getSubscription()
  if (sub) await sub.unsubscribe()
  if (userId) {
    await supabase.from('profiles').update({ push_token: null }).eq('id', userId)
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function usePushNotifications() {
  const { user } = useAuth()

  const isSupported =
    isNative() ||
    (typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window)

  async function requestPermission() {
    if (isNative()) return requestNativePush(user?.id)
    return requestWebPush(user?.id)
  }

  async function unregister() {
    if (isNative()) return unregisterNativePush(user?.id)
    return unregisterWebPush(user?.id)
  }

  return { isSupported, requestPermission, unregister }
}
