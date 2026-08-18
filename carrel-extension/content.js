/* Read in Carrel — runs only on the Carrel tab. Picks up the PDF the background
   worker parked in extension storage and hands the bytes to the page. */
'use strict';

var delivered = 0;

function deliver(p) {
  if (!p || !p.b64 || !p.at || p.at === delivered) return;
  if (Date.now() - p.at > 5 * 60 * 1000) { chrome.storage.local.remove('carrelPending'); return; }
  delivered = p.at;
  chrome.storage.local.remove('carrelPending');
  var total = 0, parts = p.b64.map(function (c) {
    var bin = atob(c), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    total += u8.length;
    return u8;
  });
  var bytes = new Uint8Array(total), off = 0;
  parts.forEach(function (u8) { bytes.set(u8, off); off += u8.length; });
  window.postMessage({ type: 'carrel-ext-import', name: p.name, sourceUrl: p.sourceUrl, bytes: bytes.buffer }, location.origin);
}

chrome.storage.local.get('carrelPending', function (r) { deliver(r && r.carrelPending); });
chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === 'local' && changes.carrelPending && changes.carrelPending.newValue) deliver(changes.carrelPending.newValue);
});
