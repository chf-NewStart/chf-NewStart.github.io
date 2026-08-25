/* Read in Phloem — runs only on the Phloem tab. Picks up the PDF the background
   worker parked in extension storage and hands the bytes to the page. */
'use strict';

var delivered = 0;
var queuedPending = null;
var pageReady = document.readyState !== 'loading';
var importOverlay = null;
var importOverlayTimer = 0;
var activeTransfer = 0;

function validPending(p) {
  return !!(p && p.b64 && p.at && p.at !== delivered && Date.now() - p.at <= 5 * 60 * 1000);
}

function showImporting(p) {
  if (!validPending(p)) return;
  activeTransfer = p.at;
  if (!importOverlay) {
    var style = document.createElement('style');
    style.textContent = '#phloemExtensionImport{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:#f6f0df;color:#24282b;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}#phloemExtensionImport>div{width:min(430px,100%);padding:30px;border:1px solid #ddd4bd;border-radius:20px;background:#fffdf7;box-shadow:0 22px 70px rgba(50,43,25,.15);text-align:center}#phloemExtensionImport b{display:block;margin-bottom:7px;color:#e85d3f;font-size:.72rem;letter-spacing:.15em;text-transform:uppercase}#phloemExtensionImport strong{display:block;font:500 1.45rem/1.2 Georgia,serif}#phloemExtensionImport span{display:block;margin-top:8px;color:#6e7679;font-size:.88rem}';
    document.documentElement.appendChild(style);
    importOverlay = document.createElement('div');
    importOverlay.id = 'phloemExtensionImport';
    importOverlay.setAttribute('role', 'status');
    importOverlay.setAttribute('aria-live', 'polite');
    var card = document.createElement('div'), eyebrow = document.createElement('b'), title = document.createElement('strong'), detail = document.createElement('span');
    eyebrow.textContent = 'Read in Phloem';
    title.textContent = 'Importing PDF…';
    detail.className = 'phloem-import-name';
    card.appendChild(eyebrow); card.appendChild(title); card.appendChild(detail); importOverlay.appendChild(card);
    document.documentElement.appendChild(importOverlay);
  }
  var name = importOverlay.querySelector('.phloem-import-name');
  if (name) name.textContent = String(p.name || 'Your paper');
  clearTimeout(importOverlayTimer);
  importOverlayTimer = setTimeout(hideImporting, 90000);
}

function hideImporting() {
  clearTimeout(importOverlayTimer);
  importOverlayTimer = 0;
  activeTransfer = 0;
  if (importOverlay) importOverlay.remove();
  importOverlay = null;
}

function deliver(p) {
  if (!p || !p.b64 || !p.at || p.at === delivered) return;
  if (Date.now() - p.at > 5 * 60 * 1000) { chrome.storage.local.remove('phloemPending'); hideImporting(); return; }
  showImporting(p);
  delivered = p.at;
  chrome.storage.local.remove('phloemPending');
  var total = 0, parts = p.b64.map(function (c) {
    var bin = atob(c), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    total += u8.length;
    return u8;
  });
  var bytes = new Uint8Array(total), off = 0;
  parts.forEach(function (u8) { bytes.set(u8, off); off += u8.length; });
  /* The wire name predates the Phloem rename; the page accepts it forever, and
     keeping it means an old page and a new extension still understand each other. */
  window.postMessage({ type: 'carrel-ext-import', name: p.name, sourceUrl: p.sourceUrl, transferId: p.at, bytes: bytes.buffer }, location.origin);
}

function queueDelivery(p) {
  if (!validPending(p)) return;
  showImporting(p);
  if (pageReady) deliver(p);
  else queuedPending = p;
}

if (!pageReady) document.addEventListener('DOMContentLoaded', function () {
  pageReady = true;
  if (queuedPending) { var pending = queuedPending; queuedPending = null; deliver(pending); }
});

chrome.storage.local.get('phloemPending', function (r) { queueDelivery(r && r.phloemPending); });
chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === 'local' && changes.phloemPending && changes.phloemPending.newValue) queueDelivery(changes.phloemPending.newValue);
});
chrome.runtime.onMessage.addListener(function (message) {
  if (!message || message.type !== 'phloem-deliver-pending') return;
  chrome.storage.local.get('phloemPending', function (r) { queueDelivery(r && r.phloemPending); });
});
window.addEventListener('message', function (event) {
  if (event.source !== window || !event.data || event.data.type !== 'phloem-ext-import-complete') return;
  if (!event.data.transferId || event.data.transferId === activeTransfer) hideImporting();
});
