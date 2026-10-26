const CACHE = 'tend-shell-v3';
const SHELL = ['./', './index.html', './style.css', './theme.css', './pixel.css', './theme.js', './core.js', './app.js', './pixel.js', './icon.svg', './icon-192.png', './icon-512.png', './tomato-button.png', './manifest.webmanifest', './fonts/plank-pixel.woff', './fonts/dm-sans-var-latin.woff2', './fonts/ibm-plex-mono-400-latin.woff2', './fonts/ibm-plex-mono-500-latin.woff2'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('tend-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && SHELL.some(path => new URL(path, self.registration.scope).href === url.href)) {
      const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? await caches.match('./index.html') : Response.error())));
});
