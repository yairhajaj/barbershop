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
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length > 0) return list[0].focus()
      return clients.openWindow('/')
    })
  )
})
