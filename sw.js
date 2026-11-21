/* Service worker của Kem: cho phép cài thành app và mở được khi mất mạng.
   Chiến lược "mạng trước": có mạng thì luôn lấy bản mới nhất (để cập nhật tự động),
   mất mạng thì dùng bản đã lưu. */
const CACHE = 'kem-v4';
const SHELL = ['./', 'index.html', 'app.js', 'style.css', 'y2k.css', 'night.css',
  'manifest.webmanifest', 'assets/logo.png', 'assets/icon-192.png', 'assets/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // File của Kem: luôn hỏi lại máy chủ (bỏ qua bộ nhớ tạm 10 phút của GitHub) để thấy bản sửa ngay
  const same = new URL(e.request.url).origin === self.location.origin;
  e.respondWith(
    (same ? fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(e.request))
      .then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then(hit => hit || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
