/* Read in Phloem — background worker.
   Fetches the PDF the user asked for (with their cookies, so campus/institution
   access carries over), parks the bytes in extension storage, and opens Phloem;
   the content script on the Phloem tab hands the bytes to the page. Nothing is
   ever sent to Phloem's developer: web PDFs travel only from their own server
   to the browser, and local PDFs never leave the device. */
'use strict';

var PHLOEM = 'https://houfu72.com/reading.html';
/* chrome.storage.local has no quota while unlimitedStorage is granted. Keep a
   practical memory guard because the PDF still has to cross extension contexts. */
var MAX_BYTES = 200 * 1024 * 1024;
var MAX_MB = Math.round(MAX_BYTES / (1024 * 1024));
/* A live Phloem tab can still have an older content script after the extension
   updates. Require an explicit protocol reply so a stale receiver is reloaded
   instead of accepting the message and silently dropping the new PDF. */
var HANDOFF_PROTOCOL = 2;
/* Some journal CDNs challenge extension-origin fetches even after the same URL
   has opened normally in Chrome. For explicitly supported journals, retry from
   a normal same-origin article page and collect the PDF in small messages. */
var PAGE_FETCH_CHUNK_BYTES = 1024 * 1024;
var PAGE_FETCH_TIMEOUT = 25 * 1000;

chrome.runtime.onInstalled.addListener(function (details) {
  chrome.contextMenus.create({ id: 'phloem-link', title: 'Read link in Phloem', contexts: ['link'] });
  chrome.contextMenus.create({ id: 'phloem-page', title: 'Read this page’s PDF in Phloem', contexts: ['page'] });
  /* Installation is the real first-run path for most readers. Open the desk once so
     a pristine library can place its bundled field guide on the wall. Updates stay
     silent, and an existing Phloem library never receives another starter guide. */
  if (details && details.reason === 'install') chrome.tabs.create({ url: PHLOEM + '?welcome=extension' });
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  var url = info.menuItemId === 'phloem-link' ? info.linkUrl : (info.pageUrl || (tab && tab.url));
  if (url) importFromUrl(url, tab);
});

chrome.action.onClicked.addListener(handleActionClick);

async function handleActionClick(tab) {
  var url = tab && (tab.url || tab.pendingUrl);
  if (url) return importFromUrl(url, tab);
  /* When file-URL access is off Chrome deliberately omits the local address from
     tabs.Tab. Do not strand the reader: open the direct picker, which works
     without that permission. */
  notify('Choose the local PDF', 'Chrome hid this file address. Choose the PDF directly on the page that just opened.');
  await openLocalPdfHelp();
  return false;
}

function notify(title, message) {
  try {
    chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title: title, message: message });
  } catch (e) {}
}

function pdfName(url, disposition) {
  var m = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition || '');
  var name = m ? decodeURIComponent(m[1]).trim() : '';
  if (!name) {
    try { name = decodeURIComponent(new URL(url).pathname.split('/').pop() || ''); } catch (e) {}
  }
  name = name.replace(/\.pdf$/i, '').trim() || 'paper';
  return name + '.pdf';
}

function bytesToBinary(bytes) {
  var blocks = [], BLOCK = 1 << 15;
  for (var i = 0; i < bytes.length; i += BLOCK) {
    blocks.push(String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + BLOCK))));
  }
  return blocks.join('');
}

function base64Chunks(bytes) {
  var u8 = new Uint8Array(bytes), chunks = [], SLICE = 1 << 18;
  for (var o = 0; o < u8.length; o += SLICE) {
    chunks.push(btoa(bytesToBinary(u8.subarray(o, Math.min(u8.length, o + SLICE)))));
  }
  return chunks;
}

function responseHeader(response, name) {
  try { return String(response.headers.get(name) || ''); }
  catch (e) { return ''; }
}

function isChallengeResponse(response) {
  var type = responseHeader(response, 'content-type').toLowerCase();
  return responseHeader(response, 'cf-mitigated').toLowerCase() === 'challenge' ||
    (response.status === 403 && type.indexOf('text/html') === 0);
}

/* Return a normal HTML page on the same journal origin. Navigating this page lets
   Chrome complete the publisher's browser check; the PDF is then requested from
   that first-party page instead of from the extension service worker. Keep this
   allowlist explicit rather than injecting a fetch bridge into arbitrary sites. */
function pageFetchBridgeUrl(url) {
  try {
    var parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'journals.aps.org') return '';
    if (!/^\/[a-z0-9-]+\/pdf\//i.test(parsed.pathname)) return '';
    parsed.pathname = parsed.pathname.replace(/\/pdf\//i, '/abstract/');
    parsed.search = '';
    parsed.hash = '';
    return parsed.href;
  } catch (e) { return ''; }
}

function sameOriginHtmlTab(tab, bridgeUrl) {
  if (!tab || !tab.id || !tab.url) return false;
  try {
    var current = new URL(tab.url), bridge = new URL(bridgeUrl);
    return current.origin === bridge.origin && !/\/pdf\//i.test(current.pathname);
  } catch (e) { return false; }
}

function pause(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/* These functions execute in the publisher page's MAIN world. They are fully
   self-contained because chrome.scripting serializes injected functions. */
function pageFetchReadiness(expectedOrigin) {
  var title = String(document.title || '').toLowerCase();
  return {
    ready: location.origin === expectedOrigin && document.readyState === 'complete' &&
      String(document.contentType || '').toLowerCase().indexOf('text/html') === 0 &&
      title.indexOf('just a moment') === -1 && typeof window._cf_chl_opt === 'undefined',
    href: location.href
  };
}

async function pageFetchStart(url, transferKey, maxBytes, chunkBytes) {
  try {
    var target = new URL(url, location.href);
    if (target.origin !== location.origin) throw new Error('The PDF is not on this article site.');
    var response = await fetch(target.href, { credentials: 'include' });
    var type = String(response.headers.get('content-type') || '').toLowerCase();
    var challenged = String(response.headers.get('cf-mitigated') || '').toLowerCase() === 'challenge' ||
      (response.status === 403 && type.indexOf('text/html') === 0);
    if (challenged) return { ok: false, challenge: true, status: response.status };
    if (!response.ok) return { ok: false, status: response.status, error: 'The server answered ' + response.status + '.' };
    var bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) return { ok: false, error: 'That file is over ' + Math.round(maxBytes / (1024 * 1024)) + ' MB.' };
    var magic = '';
    for (var i = 0; i < Math.min(5, bytes.length); i++) magic += String.fromCharCode(bytes[i]);
    if (magic !== '%PDF-') return { ok: false, error: 'The publisher returned a web page instead of the PDF.' };
    var store = window.__readInPhloemTransfers;
    if (!store || typeof store !== 'object') {
      store = Object.create(null);
      Object.defineProperty(window, '__readInPhloemTransfers', { value: store, configurable: true });
    }
    store[transferKey] = { bytes: bytes, chunkBytes: chunkBytes };
    return {
      ok: true,
      size: bytes.byteLength,
      chunkCount: Math.ceil(bytes.byteLength / chunkBytes),
      disposition: String(response.headers.get('content-disposition') || '')
    };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'The publisher page could not fetch the PDF.' };
  }
}

function pageFetchChunk(transferKey, index) {
  var store = window.__readInPhloemTransfers;
  var transfer = store && store[transferKey];
  if (!transfer || index < 0) return '';
  var start = index * transfer.chunkBytes;
  if (start >= transfer.bytes.length) return '';
  var slice = transfer.bytes.subarray(start, Math.min(transfer.bytes.length, start + transfer.chunkBytes));
  var blocks = [], blockSize = 1 << 15;
  for (var i = 0; i < slice.length; i += blockSize) {
    blocks.push(String.fromCharCode.apply(null, slice.subarray(i, Math.min(slice.length, i + blockSize))));
  }
  return btoa(blocks.join(''));
}

function pageFetchCleanup(transferKey) {
  var store = window.__readInPhloemTransfers;
  if (!store || !store[transferKey]) return false;
  try { store[transferKey].bytes.fill(0); } catch (e) {}
  delete store[transferKey];
  if (!Object.keys(store).length) {
    try { delete window.__readInPhloemTransfers; } catch (e) {}
  }
  return true;
}

async function executeOnPage(tabId, func, args) {
  var results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    func: func,
    args: args || []
  });
  return results && results[0] && results[0].result;
}

async function waitForPageFetchTab(tabId, bridgeUrl) {
  var origin = new URL(bridgeUrl).origin, started = Date.now(), lastError = null;
  while (Date.now() - started < PAGE_FETCH_TIMEOUT) {
    try {
      var tab = await chrome.tabs.get(tabId);
      if (tab && tab.status === 'complete') {
        var state = await executeOnPage(tabId, pageFetchReadiness, [origin]);
        if (state && state.ready) return true;
      }
    } catch (e) { lastError = e; }
    await pause(400);
  }
  throw new Error((lastError && lastError.message) || 'The publisher’s browser check did not finish.');
}

async function collectPageFetchedPdf(tabId, real) {
  var key = 'phloem-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  try {
    var meta = await executeOnPage(tabId, pageFetchStart, [real, key, MAX_BYTES, PAGE_FETCH_CHUNK_BYTES]);
    if (!meta || !meta.ok) {
      if (meta && meta.challenge) throw new Error('The publisher’s browser check did not clear the PDF request.');
      throw new Error((meta && meta.error) || 'The publisher page could not fetch the PDF.');
    }
    var chunks = [];
    for (var i = 0; i < meta.chunkCount; i++) {
      var chunk = await executeOnPage(tabId, pageFetchChunk, [key, i]);
      if (!chunk) throw new Error('The publisher page returned an incomplete PDF.');
      chunks.push(chunk);
    }
    if (!chunks.length || atob(chunks[0].slice(0, 8)).slice(0, 5) !== '%PDF-') {
      throw new Error('The publisher page returned invalid PDF data.');
    }
    return { b64: chunks, disposition: meta.disposition || '' };
  } finally {
    try { await executeOnPage(tabId, pageFetchCleanup, [key]); } catch (e) {}
  }
}

async function fetchPdfThroughArticlePage(real, sourceTab) {
  var bridgeUrl = pageFetchBridgeUrl(real);
  if (!bridgeUrl) throw new Error('This publisher blocked the extension download.');
  var helper = null, tabId = null;
  try {
    if (sameOriginHtmlTab(sourceTab, bridgeUrl)) tabId = sourceTab.id;
    else {
      helper = await chrome.tabs.create({ url: bridgeUrl, active: false });
      tabId = helper && helper.id;
      if (!tabId) throw new Error('Chrome could not open the publisher check.');
    }
    await waitForPageFetchTab(tabId, bridgeUrl);
    return await collectPageFetchedPdf(tabId, real);
  } finally {
    if (helper && helper.id) {
      try { await chrome.tabs.remove(helper.id); } catch (e) {}
    }
  }
}

async function recoverAndImportPdf(real, sourceTab) {
  var recovered = await fetchPdfThroughArticlePage(real, sourceTab);
  await chrome.storage.local.set({
    phloemPending: { name: pdfName(real, recovered.disposition), sourceUrl: real, at: Date.now(), b64: recovered.b64 }
  });
  await activatePhloemWithPendingPdf();
}

function unwrapPdfUrl(url) {
  var value = String(url || '').trim();
  if (!value) return '';
  try {
    var parsed = new URL(value);
    if (parsed.protocol === 'chrome-extension:') {
      var nested = parsed.searchParams.get('file') || parsed.searchParams.get('src');
      if (nested && /^(?:file|https?):/i.test(nested)) return nested;
      var path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
      if (/^(?:file|https?):/i.test(path)) return path;
    }
  } catch (e) {}
  /* Older Chrome PDF viewer builds exposed the source directly after their own
     extension URL instead of using ?file=. Keep that shape working too. */
  return value.replace(/^chrome-extension:\/\/[a-p]+\/((?:file|https?):)/i, '$1');
}

async function localFileAccessAllowed() {
  try { return await chrome.extension.isAllowedFileSchemeAccess(); }
  catch (e) { return false; }
}

async function openLocalPdfHelp() {
  try { await chrome.runtime.openOptionsPage(); }
  catch (e) { chrome.tabs.create({ url: chrome.runtime.getURL('options.html') }); }
}

async function explainLocalFileAccess() {
  chrome.action.setBadgeText({ text: '!' });
  notify('Choose or allow the local PDF', 'Enable “Allow access to file URLs,” or choose the PDF directly on the page that just opened.');
  await openLocalPdfHelp();
}

async function activatePhloemWithPendingPdf() {
  var tabs = await chrome.tabs.query({ url: PHLOEM + '*' });
  if (!tabs.length) {
    await chrome.tabs.create({ url: PHLOEM });
    return;
  }
  var target = tabs[0];
  try {
    /* A tab opened before this extension was installed/reloaded has no current
       content script. An extension update can also leave the old script alive,
       so require the current protocol reply before trusting the receiver. */
    var receiver = await chrome.tabs.sendMessage(target.id, { type: 'phloem-deliver-pending', protocol: HANDOFF_PROTOCOL });
    if (!receiver || receiver.protocol !== HANDOFF_PROTOCOL) await chrome.tabs.reload(target.id);
  } catch (e) {
    await chrome.tabs.reload(target.id);
  }
  await chrome.tabs.update(target.id, { active: true });
  await chrome.windows.update(target.windowId, { focused: true });
}

async function importFromUrl(url, sourceTab) {
  /* The Chrome PDF viewer sometimes wraps the real URL; unwrap web and local shapes. */
  var real = unwrapPdfUrl(url), local = /^file:/i.test(real);
  if (!real) {
    notify('Open a PDF first', 'Open a web or local PDF in Chrome, then click Read in Phloem again.');
    return false;
  }
  if (local && !(await localFileAccessAllowed())) {
    await explainLocalFileAccess();
    return false;
  }
  var pageRecoveryTried = false;
  try {
    chrome.action.setBadgeText({ text: '…' });
    var res = await fetch(real, local ? {} : { credentials: 'include' });
    if (!local && pageFetchBridgeUrl(real) &&
        (isChallengeResponse(res) || responseHeader(res, 'content-type').toLowerCase().indexOf('text/html') === 0)) {
      pageRecoveryTried = true;
      await recoverAndImportPdf(real, sourceTab);
      chrome.action.setBadgeText({ text: '' });
      return true;
    }
    /* A file:// fetch can expose valid bytes with the opaque status 0, for which
       Response.ok is false. HTTP status is meaningful only for network PDFs; the
       PDF signature below is the reliable check for a local file. */
    if (!local && !res.ok) throw new Error('The server answered ' + res.status + '.');
    var bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) throw new Error('That file is over ' + MAX_MB + ' MB.');
    var head = new Uint8Array(bytes.slice(0, 5)), magic = '';
    for (var i = 0; i < head.length; i++) magic += String.fromCharCode(head[i]);
    if (magic !== '%PDF-') {
      notify('Not a PDF', 'That link is a web page, not a PDF file. Open the paper’s PDF and try again.');
      chrome.action.setBadgeText({ text: '' });
      return false;
    }
    /* Base64 stays sliced so large books never hit btoa's argument limit. */
    var chunks = base64Chunks(bytes);
    await chrome.storage.local.set({
      /* Never pass a local filesystem path into Phloem metadata or optional sync. */
      phloemPending: { name: pdfName(real, res.headers.get('content-disposition')), sourceUrl: local ? '' : real, at: Date.now(), b64: chunks }
    });
    await activatePhloemWithPendingPdf();
    chrome.action.setBadgeText({ text: '' });
    return true;
  } catch (e) {
    /* CORP and similar publisher policies can hide the challenge response from
       extension fetch entirely. A supported same-origin retry should still run. */
    if (!local && !pageRecoveryTried && pageFetchBridgeUrl(real)) {
      try {
        pageRecoveryTried = true;
        await recoverAndImportPdf(real, sourceTab);
        chrome.action.setBadgeText({ text: '' });
        return true;
      } catch (recoveryError) { e = recoveryError; }
    }
    chrome.action.setBadgeText({ text: '' });
    notify(local ? 'Could not read that local PDF' : 'Could not fetch that PDF', local ? 'Choose the PDF directly on the page that just opened. Chrome said: ' + ((e && e.message) || 'the file could not be read.') : ((e && e.message) || 'The download failed.'));
    if (local) await openLocalPdfHelp();
    return false;
  }
}
