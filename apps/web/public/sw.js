// Service worker do app instalado: só notificações (Web Push). Não guarda páginas em cache: o app continua sempre
// online, como antes. O conteúdo chega cifrado do serviço de push e é montado pela API (contrato PushPayload).

/** Caminho interno do app; qualquer outra coisa (endereço externo, //host, javascript:) abre o início. */
function safePath(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\') ? url : '/';
}

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = text(data.title, 80) || 'Nova notificação';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: text(data.body, 240),
      tag: text(data.tag, 120) || undefined,
      icon: '/pwa-icon/192',
      badge: '/pwa-icon/192',
      data: { url: safePath(data.url) },
    }),
  );
});

// Toque: volta para o app já aberto (navegando para o destino) ou abre um novo.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === target.origin);
      if (open) {
        await open.focus();
        if ('navigate' in open) await open.navigate(target.href).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
