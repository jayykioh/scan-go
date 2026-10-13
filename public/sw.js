// Minimal Service Worker. Android Chrome renders a notification only through a
// registration, and a tap should bring the app forward. There is no fetch
// handler, so nothing is cached (REQ-NOT-001).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) =>
        clients.length > 0 ? clients[0].focus() : self.clients.openWindow('/'),
      ),
  );
});
