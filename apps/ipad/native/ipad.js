/* Small UI adapter for the iPad app; the web reader remains shared. */
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
  ['gdriveConnectBtn', 'syncSaveBtn', 'aiPassCreate',
    'syncLinkBtn', 'installBtn2'].forEach(hideSection);
  ['installNav', 'installDialog', 'launchDialog', 'cloudPassBanner',
    'githubPickBtn', 'githubDialog', 'folderPickBtn', 'pdfFolder',
    'notebookLmBtn', 'notebookPackageDialog', 'notebookLmStatus',
    'supportLine'].forEach(function (id) { hide(byId(id)); disable(byId(id)); });
  document.querySelectorAll('.notebook-listen').forEach(hide);

  var providerSelect = byId('aiProvider');
  if (providerSelect) {
    ['auto', 'compatible'].forEach(function (value) {
      var option = providerSelect.querySelector('option[value="' + value + '"]');
      if (option) option.remove();
    });
    if (!providerSelect.value) providerSelect.value = 'openai';
  }
  var aiHeading = document.querySelector('#aiKeySave') && byId('aiKeySave').closest('section');
  if (aiHeading) {
    var intro = aiHeading.querySelector('p');
    if (intro) intro.textContent = 'Choose a cloud provider and bring your own API key. iOS asks for the key in a native secure prompt and stores it in Keychain, never in a Phloem backup. Before saving, Phloem shows exactly what reading context leaves this iPad and where it goes.';
  }
  hide(document.querySelector('label[for="aiKey"]'));
  hide(byId('aiKey'));
  disable(byId('aiKey'));

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
      'Cloud sync is unavailable in this preview. Optional AI uses a provider you choose, only after you accept its data-sharing disclosure; provider keys stay in iOS Keychain.';
    var lookupNote = document.createElement('p');
    lookupNote.textContent = 'Define uses Wikipedia and Wikimedia online when you ask for a lookup. ' +
      'Your selected term is sent to those services.';
    localSection.append(heading, description, lookupNote);
    if (window.PHLOEM_NATIVE_BLOCKED_SETUP) {
      var blockedNote = document.createElement('p');
      blockedNote.textContent = 'That device setup or AI pass link was not imported. Add an AI key manually so it can be stored in iOS Keychain.';
      localSection.appendChild(blockedNote);
    }
    var privacySection = document.createElement('section');
    privacySection.className = 'native-privacy-settings';
    var privacyHeading = document.createElement('h3');
    privacyHeading.textContent = 'Privacy & support';
    var privacyCopy = document.createElement('p');
    privacyCopy.textContent = 'Review what stays on this iPad, what leaves it when you choose an online feature, and how to remove an AI key.';
    var privacyLink = document.createElement('a');
    privacyLink.href = 'https://houfu72.com/phloem-ipad/privacy.html';
    privacyLink.target = '_blank';
    privacyLink.rel = 'noopener noreferrer';
    privacyLink.textContent = 'Privacy policy ↗';
    var supportLink = document.createElement('a');
    supportLink.href = 'https://houfu72.com/phloem-ipad/support.html';
    supportLink.target = '_blank';
    supportLink.rel = 'noopener noreferrer';
    supportLink.textContent = 'Support ↗';
    privacySection.append(privacyHeading, privacyCopy, privacyLink, document.createTextNode(' · '), supportLink);
    settings.appendChild(privacySection);
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
  text(byId('buildStamp'), 'Phloem for iPad · 1.1 AI development preview');
  hide(byId('storageNote')); // Browser persistence promises do not describe native durability.
  text(document.querySelector('.hero-card .step:nth-child(2) span'),
    'Move the guide, turn the page, and keep notes beside the paper.');
  text(document.querySelector('.hero-card .step:nth-child(3) span'),
    'Your library stays on this iPad. No account needed for reading.');
  text(document.querySelector('#reviewsPanel .reviewer-panel-head > .hint'),
    'Read imported Word comments beside the paper. Link them yourself, or use your configured AI provider to help match passages.');

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
