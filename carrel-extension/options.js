'use strict';

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

document.getElementById('checkAgain').addEventListener('click', refreshFileAccess);
window.addEventListener('focus', refreshFileAccess);
document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshFileAccess(); });
refreshFileAccess();
