/* Journal offline shell. The pages themselves live in the browser (localStorage), so
   only the page and its fonts need to be here for the journal to open with no network,
   or on a network that reaches houfu72.com slowly (GitHub Pages from mainland China).
   Registered with scope /journal.html, so it never touches any other page; Phloem's
   reading-sw.js keeps the rest of the site. */
var CACHE = 'journal-shell-v1';
var PAGE = '/journal.html';
var SHELL = [PAGE, '/fonts/journal/journal-fonts.css', '/fonts/houfu-hand.woff2'];
/* the Chinese hand comes in 92 slices; each is kept the first time a page uses it */
var LAZY = /^\/fonts\/journal\/[a-z0-9-]+\.woff2$/;
var SLOW_MS = 4000;

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k.indexOf('journal-shell-') === 0; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function keep(path, res) {
  if (!res || !res.ok) return Promise.resolve();
  var copy = res.clone();
  return caches.open(CACHE).then(function (c) { return c.put(path, copy); });
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  var path = url.pathname;
  if (path === PAGE) {
    /* The newest page when the network answers; the cached one when it is down, or
       silent for SLOW_MS. The network answer still refreshes the cache. */
    var network = fetch(PAGE, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
      try { e.waitUntil(keep(PAGE, res)); } catch (err) {}
      return res;
    });
    e.waitUntil(network.catch(function () {}));
    e.respondWith(new Promise(function (resolve) {
      var settled = false;
      var finish = function (res) { if (!settled && res) { settled = true; resolve(res); } };
      var timer = setTimeout(function () { caches.match(PAGE).then(finish); }, SLOW_MS);
      network.then(function (res) { clearTimeout(timer); finish(res); }, function () {
        clearTimeout(timer);
        caches.match(PAGE).then(function (cached) { finish(cached || Response.error()); });
      });
    }));
    return;
  }
  if (SHELL.indexOf(path) < 0 && !LAZY.test(path)) return;
  /* fonts and their stylesheet: cache first, refreshed in the background */
  e.respondWith(
    caches.match(path).then(function (cached) {
      var refresh = fetch(e.request).then(function (res) {
        try { e.waitUntil(keep(path, res)); } catch (err) {}
        return res;
      });
      if (cached) { try { e.waitUntil(refresh.catch(function () {})); } catch (err) {} return cached; }
      return refresh;
    })
  );
});
