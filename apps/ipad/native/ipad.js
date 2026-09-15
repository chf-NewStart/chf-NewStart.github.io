/* Small UI adapter for the first iPad build; the web reader remains shared. */
(function () {
  'use strict';
  if (!window.PHLOEM_NATIVE) return;

  function byId(id) { return document.getElementById(id); }
  function text(element, value) { if (element) element.textContent = value; }
  function hide(element) {
    if (!element) return;
    element.classList.add('native-unavailable');
    element.setAttribute('aria-hidden', 'true');
  }
  function disable(element) {
    if (!element) return;
    element.disabled = true;
    element.setAttribute('aria-disabled', 'true');
  }
  function hideSection(id) {
    var control = byId(id), section = control && control.closest('section');
    if (!section) return;
    hide(section);
    section.querySelectorAll('button,input,select,textarea').forEach(disable);
  }

  /* Keep every shared-reader element in the DOM: its state/rendering functions
     still reference them. CSS does not allow later web renders to reveal them. */
  ['gdriveConnectBtn', 'syncSaveBtn', 'aiKeySave', 'aiPassCreate',
    'syncLinkBtn', 'installBtn2'].forEach(hideSection);
  ['installNav', 'installDialog', 'launchDialog', 'cloudPassBanner',
    'githubPickBtn', 'githubDialog', 'folderPickBtn', 'pdfFolder',
    'selectionNoteAi', 'selectionAiBox', 'touchDiscuss', 'aiPanel',
    'locateReviewsBtn', 'reviewPairModeBtn', 'reviewPairFields',
    'notebookLmBtn', 'notebookPackageDialog', 'notebookLmStatus',
    'supportLine'].forEach(function (id) { hide(byId(id)); disable(byId(id)); });
  document.querySelectorAll('[data-tab="aiPanel"],.notebook-listen').forEach(hide);
  document.querySelectorAll('#aiPanel button,#aiPanel input,#aiPanel textarea,' +
    '#selectionAiBox button,#selectionAiBox textarea').forEach(disable);

  /* A review file can still be exported/imported locally. Only the generated
     web link is unavailable: capacitor://localhost is not a public address.
     The same primary button confirms incoming review files, so hide it only
     while the outgoing file-download control is visible. */
  var shareDialog = byId('reviewShareDialog');
  if (shareDialog) shareDialog.classList.add('native-review-share');
  document.addEventListener('click', function (event) {
    if (!event.target.closest || !event.target.closest('#reviewSharePrimary')) return;
    var download = byId('reviewShareDownload');
    if (download && !download.classList.contains('hidden')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  var settings = document.querySelector('#settingsDialog .settings-body');
  text(document.querySelector('#settingsDialog .settings-lede'),
    'Your reading space on this iPad.');
  if (settings) {
    var localSection = document.createElement('section');
    localSection.className = 'native-local-settings';
    var heading = document.createElement('h3');
    heading.textContent = 'Saved on this iPad';
    var description = document.createElement('p');
    description.textContent = 'Papers, highlights, and notes are stored in this app’s web storage. ' +
      'Cloud sync and AI are not available in this preview. Keep your original files and export your notes regularly.';
    var lookupNote = document.createElement('p');
    lookupNote.textContent = 'Define uses Wikipedia and Wikimedia online when you ask for a lookup. ' +
      'Your selected term is sent to those services.';
    localSection.append(heading, description, lookupNote);
    if (window.PHLOEM_NATIVE_BLOCKED_SETUP) {
      var blockedNote = document.createElement('p');
      blockedNote.textContent = 'That device setup or AI pass link was not imported. This preview does not accept cloud credentials.';
      localSection.appendChild(blockedNote);
    }
    settings.prepend(localSection);
  }

  var signal = byId('syncSignal');
  if (signal) {
    text(signal, 'on this iPad');
    signal.title = 'Local library settings';
    signal.setAttribute('aria-label', 'Local library settings');
    signal.onclick = function () { byId('settingsBtn').click(); };
  }
  var refresh = byId('refreshBtn');
  if (refresh) {
    /* The shared handler saves and flushes pending edits before reloading. */
    refresh.title = 'Reload reader';
    refresh.setAttribute('aria-label', 'Save and reload reader');
  }
  text(byId('buildStamp'), 'Phloem for iPad · development preview');
  hide(byId('storageNote')); // Browser persistence promises do not describe native durability.
  text(document.querySelector('.hero-card .step:nth-child(2) span'),
    'Move the guide, turn the page, and keep notes beside the paper.');
  text(document.querySelector('.hero-card .step:nth-child(3) span'),
    'Your library stays on this iPad. No account needed for reading.');
  text(document.querySelector('#reviewsPanel .reviewer-panel-head > .hint'),
    'Read imported Word comments beside the paper. Link a comment to a selected passage yourself. AI matching is not available in this preview.');

  var home = byId('homeLink');
  if (home) {
    home.href = 'https://houfu72.com/';
    home.target = '_blank';
    home.rel = 'noopener noreferrer';
  }
  var define = byId('selectionExplain');
  if (define) {
    define.title = 'Look up the selected term online using Wikipedia and Wikimedia';
    define.setAttribute('aria-label', 'Define selected term online');
  }

  /* The shared lookup suggests AI when Wikipedia has no matching entry. Keep
     the lookup useful without advertising a cloud configuration we disabled. */
  var aiSetup = byId('lookupAiSetup');
  if (aiSetup) {
    hide(aiSetup);
    disable(aiSetup);
    new MutationObserver(function () {
      if (!aiSetup.classList.contains('hidden')) {
        text(byId('lookupDefinition'), 'Wikipedia has no matching entry for this phrase. ' +
          'Try a shorter term. AI explanations are not available in this iPad preview.');
      }
    }).observe(aiSetup, { attributes: true, attributeFilter: ['class'] });
  }

  /* Capacitor Browser opens a separate Safari view, leaving the local app and
     its origin intact. Do not send blob downloads or local PDF links through it. */
  var capacitor = window.Capacitor;
  /* The native bridge exposes registered plugins under Plugins; registerPlugin
     belongs to the optional JS core bundle, not every native-injected global. */
  var nativeBrowser = capacitor && capacitor.Plugins && capacitor.Plugins.Browser;
  if (!nativeBrowser && capacitor && typeof capacitor.registerPlugin === 'function') {
    nativeBrowser = capacitor.registerPlugin('Browser');
  }
  document.addEventListener('click', function (event) {
    var anchor = event.target.closest && event.target.closest('a[href]');
    if (!anchor || anchor.hasAttribute('download') || event.defaultPrevented) return;
    var url;
    try { url = new URL(anchor.href, window.location.href); } catch (error) { return; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
    if (url.origin === window.location.origin) return;
    event.preventDefault();
    if (nativeBrowser && capacitor.isNativePlatform && capacitor.isNativePlatform()) {
      nativeBrowser.open({ url: url.href }).catch(function () {
        window.alert('Could not open that link. Please try again.');
      });
    } else if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      window.open(url.href, '_blank', 'noopener,noreferrer');
    } else {
      window.alert('External links are unavailable in this preview build.');
    }
  }, true);
})();
