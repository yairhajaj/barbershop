// Service Worker — Push Notifications
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  const title = data.title || 'הודעה חדשה'
  const body  = data.body  || ''

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  '/favicon.svg',
      badge: '/favicon.svg',
      dir:   'rtl',
      lang:  'he',
      tag:   'barbershop-msg',
      renotify: true,
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.startsWith(self.location.origin))
      if (existing) {
        existing.focus()
        return existing.navigate(url)
      }
      return clients.openWindow(url)
    })
  )
})
