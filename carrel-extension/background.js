/* Read in Phloem — background worker.
   Fetches the PDF the user asked for (with their cookies, so campus/institution
   access carries over), parks the bytes in extension storage, and opens Phloem;
   the content script on the Phloem tab hands the bytes to the page. Nothing is
   ever sent to Phloem's developer: web PDFs travel only from their own server
   to the browser, and local PDFs never leave the device. */
'use strict';

var PHLOEM = 'https://houfu72.com/reading.html';
var MAX_BYTES = 80 * 1024 * 1024;

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
  if (url) importFromUrl(url);
});

chrome.action.onClicked.addListener(function (tab) {
  if (tab && tab.url) importFromUrl(tab.url);
  else notify('Open a PDF first', 'Open a web or local PDF in Chrome, then click Read in Phloem again.');
});

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

async function explainLocalFileAccess() {
  chrome.action.setBadgeText({ text: '!' });
  notify('Allow local PDF access', 'Open the instructions, enable “Allow access to file URLs,” then click Phloem on the PDF again.');
  try { await chrome.runtime.openOptionsPage(); }
  catch (e) { chrome.tabs.create({ url: chrome.runtime.getURL('options.html') }); }
}

async function importFromUrl(url) {
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
  try {
    chrome.action.setBadgeText({ text: '…' });
    var res = await fetch(real, local ? {} : { credentials: 'include' });
    if (!res.ok) throw new Error('The server answered ' + res.status + '.');
    var bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) throw new Error('That file is over 80 MB.');
    var head = new Uint8Array(bytes.slice(0, 5)), magic = '';
    for (var i = 0; i < head.length; i++) magic += String.fromCharCode(head[i]);
    if (magic !== '%PDF-') {
      notify('Not a PDF', 'That link is a web page, not a PDF file. Open the paper’s PDF and try again.');
      chrome.action.setBadgeText({ text: '' });
      return false;
    }
    /* base64 in slices — one giant btoa call would blow the argument limit */
    var u8 = new Uint8Array(bytes), chunks = [], SLICE = 1 << 18;
    for (var o = 0; o < u8.length; o += SLICE) {
      var part = u8.subarray(o, Math.min(u8.length, o + SLICE)), bin = '';
      for (var j = 0; j < part.length; j++) bin += String.fromCharCode(part[j]);
      chunks.push(btoa(bin));
    }
    await chrome.storage.local.set({
      /* Never pass a local filesystem path into Phloem metadata or optional sync. */
      phloemPending: { name: pdfName(real, res.headers.get('content-disposition')), sourceUrl: local ? '' : real, at: Date.now(), b64: chunks }
    });
    var tabs = await chrome.tabs.query({ url: PHLOEM + '*' });
    if (tabs.length) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: PHLOEM });
    }
    chrome.action.setBadgeText({ text: '' });
    return true;
  } catch (e) {
    chrome.action.setBadgeText({ text: '' });
    notify(local ? 'Could not read that local PDF' : 'Could not fetch that PDF', local ? 'Chrome allowed file access, but could not read this file. Reopen the PDF in Chrome and try once more.' : ((e && e.message) || 'The download failed.'));
    return false;
  }
}
