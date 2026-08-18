/* Read in Carrel — background worker.
   Fetches the PDF the user asked for (with their cookies, so campus/institution
   access carries over), parks the bytes in extension storage, and opens Carrel;
   the content script on the Carrel tab hands the bytes to the page. Nothing is
   ever sent anywhere except from the PDF's own server to the user's browser. */
'use strict';

var CARREL = 'https://houfu72.com/reading.html';
var MAX_BYTES = 80 * 1024 * 1024;

chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({ id: 'carrel-link', title: 'Read link in Carrel', contexts: ['link'] });
  chrome.contextMenus.create({ id: 'carrel-page', title: 'Read this page’s PDF in Carrel', contexts: ['page'] });
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  var url = info.menuItemId === 'carrel-link' ? info.linkUrl : (info.pageUrl || (tab && tab.url));
  if (url) importFromUrl(url);
});

chrome.action.onClicked.addListener(function (tab) {
  if (tab && tab.url) importFromUrl(tab.url);
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

async function importFromUrl(url) {
  /* The chrome built-in viewer wraps the real URL; unwrap common shapes. */
  var real = url.replace(/^chrome-extension:\/\/[a-p]+\/(https?)/, '$1');
  try {
    chrome.action.setBadgeText({ text: '…' });
    var res = await fetch(real, { credentials: 'include' });
    if (!res.ok) throw new Error('The server answered ' + res.status + '.');
    var bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) throw new Error('That file is over 80 MB.');
    var head = new Uint8Array(bytes.slice(0, 5)), magic = '';
    for (var i = 0; i < head.length; i++) magic += String.fromCharCode(head[i]);
    if (magic !== '%PDF-') {
      notify('Not a PDF', 'That link is a web page, not a PDF file. Open the paper’s PDF and try again.');
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    /* base64 in slices — one giant btoa call would blow the argument limit */
    var u8 = new Uint8Array(bytes), chunks = [], SLICE = 1 << 18;
    for (var o = 0; o < u8.length; o += SLICE) {
      var part = u8.subarray(o, Math.min(u8.length, o + SLICE)), bin = '';
      for (var j = 0; j < part.length; j++) bin += String.fromCharCode(part[j]);
      chunks.push(btoa(bin));
    }
    await chrome.storage.local.set({
      carrelPending: { name: pdfName(real, res.headers.get('content-disposition')), sourceUrl: real, at: Date.now(), b64: chunks }
    });
    var tabs = await chrome.tabs.query({ url: CARREL + '*' });
    if (tabs.length) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: CARREL });
    }
    chrome.action.setBadgeText({ text: '' });
  } catch (e) {
    chrome.action.setBadgeText({ text: '' });
    notify('Could not fetch that PDF', (e && e.message) || 'The download failed.');
  }
}
