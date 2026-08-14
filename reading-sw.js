/* Margin offline shell: caches only the reader app and the libraries it needs, so papers
   already stored on this device open with no network (subway mode). Every other path on
   the site is left completely untouched. Served stale-while-revalidate: instant loads
   from cache, refreshed in the background for the next visit. */
var CACHE = 'margin-shell-v2';
var SHELL = [
  '/reading.html',
  '/margin.webmanifest',
  '/vendor/pdfjs/pdf.min.js',
  '/vendor/pdfjs/pdf.worker.compat.js',
  '/vendor/pdfjs/pdf.worker.min.js',
  '/fonts/dm-sans-var-latin.woff2',
  '/fonts/houfu-hand.woff2',
  '/favicon_io/tomato-favicon.ico',
  '/favicon_io/margin-apple-touch-icon.png',
  '/favicon_io/margin-icon-192.png',
  '/favicon_io/margin-icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k.indexOf('margin-shell-') === 0; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin || SHELL.indexOf(url.pathname) < 0) return;
  var path = url.pathname;
  e.respondWith(
    caches.match(path).then(function (cached) {
      var refresh = fetch(e.request).then(function (res) {
        if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(path, res.clone()); });
        return res;
      }).catch(function () { return cached; });
      return cached || refresh;
    })
  );
});
