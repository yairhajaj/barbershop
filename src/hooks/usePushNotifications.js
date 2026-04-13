import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export function usePushNotifications() {
  const { user } = useAuth()

  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window

  async function requestPermission() {
    if (!isSupported) return { ok: false, reason: 'not_supported' }

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

      if (user) {
        await supabase
          .from('profiles')
          .update({ push_token: JSON.stringify(sub) })
          .eq('id', user.id)
      }

      return { ok: true, subscription: sub }
    } catch (err) {
      console.error('Push registration error:', err)
      return { ok: false, reason: 'error', error: err }
    }
  }

  async function unregister() {
    if (!isSupported) return
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    const sub = await reg?.pushManager?.getSubscription()
    if (sub) await sub.unsubscribe()
    if (user) {
      await supabase.from('profiles').update({ push_token: null }).eq('id', user.id)
    }
  }

  return { isSupported, requestPermission, unregister }
}
