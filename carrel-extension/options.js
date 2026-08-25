'use strict';

var PHLOEM = 'https://houfu72.com/reading.html';
var MAX_BYTES = 80 * 1024 * 1024;

async function refreshFileAccess() {
  var status = document.getElementById('fileStatus');
  try {
    var allowed = await chrome.extension.isAllowedFileSchemeAccess();
    status.classList.toggle('ready', allowed);
    status.textContent = allowed
      ? 'Local PDF access is on. Return to the PDF and click the Phloem icon again.'
      : 'Local PDF access is still off.';
  } catch (e) {
    status.classList.remove('ready');
    status.textContent = 'Chrome could not check file access. Return to Manage extension and confirm the switch is on.';
  }
}

function showImportStatus(message, kind) {
  var status = document.getElementById('importStatus');
  status.hidden = false;
  status.className = 'import-status' + (kind ? ' ' + kind : '');
  status.textContent = message;
}

function pdfMagic(bytes) {
  var head = new Uint8Array(bytes.slice(0, 5)), magic = '';
  for (var i = 0; i < head.length; i++) magic += String.fromCharCode(head[i]);
  return magic;
}

function base64Chunks(bytes) {
  var u8 = new Uint8Array(bytes), chunks = [], SLICE = 1 << 18;
  for (var o = 0; o < u8.length; o += SLICE) {
    var part = u8.subarray(o, Math.min(u8.length, o + SLICE)), bin = '';
    for (var j = 0; j < part.length; j++) bin += String.fromCharCode(part[j]);
    chunks.push(btoa(bin));
  }
  return chunks;
}

async function revealPhloem() {
  try {
    var tabs = await chrome.tabs.query({ url: PHLOEM + '*' });
    if (tabs.length) {
      try {
        await chrome.tabs.sendMessage(tabs[0].id, { type: 'phloem-deliver-pending' });
      } catch (e) {
        await chrome.tabs.reload(tabs[0].id);
      }
      await chrome.tabs.update(tabs[0].id, { active: true });
      await chrome.windows.update(tabs[0].windowId, { focused: true });
      return;
    }
  } catch (e) {}
  await chrome.tabs.create({ url: PHLOEM });
}

async function importLocalPdf(file) {
  if (!file) return false;
  try {
    showImportStatus('Reading “' + file.name + '”…');
    if (file.size > MAX_BYTES) throw new Error('That file is over 80 MB.');
    var bytes = await file.arrayBuffer();
    if (pdfMagic(bytes) !== '%PDF-') throw new Error('That file is not a PDF.');
    var name = String(file.name || 'paper.pdf').trim() || 'paper.pdf';
    if (!/\.pdf$/i.test(name)) name += '.pdf';
    await chrome.storage.local.set({
      phloemPending: { name: name, sourceUrl: '', at: Date.now(), b64: base64Chunks(bytes) }
    });
    showImportStatus('Opening “' + name + '” in Phloem…', 'ready');
    await revealPhloem();
    return true;
  } catch (e) {
    showImportStatus((e && e.message) || 'That PDF could not be opened.', 'error');
    return false;
  }
}

document.getElementById('checkAgain').addEventListener('click', refreshFileAccess);
document.getElementById('localPdf').addEventListener('change', function (event) {
  importLocalPdf(event.target.files && event.target.files[0]);
  event.target.value = '';
});
window.addEventListener('focus', refreshFileAccess);
document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshFileAccess(); });
refreshFileAccess();
