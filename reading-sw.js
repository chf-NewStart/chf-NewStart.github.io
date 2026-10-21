/* Phloem offline shell: caches only the reader app and the libraries it needs, so papers
   already stored on this device open with no network (subway mode). Every other path on
   the site is left completely untouched. Served stale-while-revalidate: instant loads
   from cache, refreshed in the background for the next visit. */
var CACHE = 'phloem-shell-v235';
/* The app itself is network-first: online opens always get the newest deploy, the cache
   only answers when the network can't. Libraries and fonts stay stale-while-revalidate. */
var NETWORK_FIRST = ['/reading.html', '/reading.css', '/reading.js', '/reading-ink.js', '/reading-stickies.js', '/reading-keeps.js', '/reading-excerpts.js', '/reading-excerpts-view.js', '/reading-lists.js', '/reading-lists-view.js', '/reading-voice.js', '/reading-workspace.js', '/reading-workspace-viewport.js', '/reading-workspace-view.js', '/reading-workspace.css', '/reading-folds.js', '/reading-pdf-projection.js', '/reading-fold-view.js', '/reading-fold.css', '/carrel.webmanifest'];
var SHELL = [
  '/reading.html',
  '/reading.css',
  '/reading.js',
  '/reading-ink.js',
  '/reading-stickies.js',
  '/reading-keeps.js',
  '/reading-excerpts.js',
  '/reading-excerpts-view.js',
  '/reading-lists.js',
  '/reading-lists-view.js',
  '/reading-voice.js',
  '/reading-workspace.js',
  '/reading-workspace-viewport.js',
  '/reading-workspace-view.js',
  '/reading-workspace.css',
  '/reading-folds.js',
  '/reading-pdf-projection.js',
  '/reading-fold-view.js',
  '/reading-fold.css',
  '/carrel.webmanifest',
  '/vendor/pdfjs/pdf.min.js',
  '/vendor/pdfjs/pdf.worker.compat.js',
  '/vendor/pdfjs/pdf.worker.min.js',
  '/vendor/pdf-lib/pdf-lib.min.js',
  '/fonts/dm-sans-var-latin.woff2',
  '/fonts/houfu-hand.woff2',
  '/assets/phloem-guide/phloem-field-guide.pdf',
  '/favicon_io/phloem-favicon.ico',
  '/favicon_io/phloem-book-vine-clean-180.png',
  '/favicon_io/phloem-book-vine-clean-192.png',
  '/favicon_io/phloem-book-vine-clean-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE && (k.indexOf('margin-shell-') === 0 || k.indexOf('carrel-shell-') === 0 || k.indexOf('phloem-shell-') === 0); }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* A throttled connection (GitHub Pages from mainland China) can take a minute to answer,
   or never does. When the network has said nothing for SLOW_MS, the cached app opens
   instead and the network answer still refreshes the cache for next time. For a short
   while after that, the rest of the app also comes from the cache first, so a cached
   reading.html never runs beside a newer reading.js. */
var SLOW_MS = 4000, CACHE_FIRST_FOR_MS = 30000, cacheFirstUntil = 0;
function networkOrSlowCache(path, network) {
  var fromCache = function () { return caches.match(path); };
  if (Date.now() < cacheFirstUntil) {
    return fromCache().then(function (cached) { return cached || network; });
  }
  return new Promise(function (resolve) {
    var settled = false;
    var finish = function (response) { if (!settled && response) { settled = true; resolve(response); } };
    var timer = setTimeout(function () {
      fromCache().then(function (cached) {
        if (cached && !settled) cacheFirstUntil = Date.now() + CACHE_FIRST_FOR_MS;
        finish(cached);
      });
    }, SLOW_MS);
    network.then(function (res) { clearTimeout(timer); finish(res); }, function () {
      clearTimeout(timer);
      fromCache().then(function (cached) { finish(cached || Response.error()); });
    });
  });
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin || SHELL.indexOf(url.pathname) < 0) return;
  var path = url.pathname;
  if (NETWORK_FIRST.indexOf(path) >= 0) {
    /* no-cache: revalidate with the server every open — GitHub Pages' max-age=600
       otherwise lets the browser serve a stale app for up to ten minutes. */
    var network = fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone(), store = caches.open(CACHE).then(function (c) { return c.put(path, copy); });
        try { e.waitUntil(store); } catch (err) {}
      }
      return res;
    });
    e.waitUntil(network.catch(function () {}));
    e.respondWith(networkOrSlowCache(path, network));
    return;
  }
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
