/* Loaded before the shared reader, only by the bundled iPad entry point. */
(function () {
  'use strict';

  window.PHLOEM_NATIVE = true;
  document.documentElement.classList.add('phloem-native');

  /* Device setup links contain credentials. This local-reading prototype has no
     native credential store or OAuth flow, so do not import those links. The
     library and legitimate review-layer imports are deliberately untouched. */
  function rejectUnsupportedSetup(event) {
    if (!/^#(?:(?:phloem|carrel|margin)-setup|phloem-ai-pass)=/.test(window.location.hash)) return;
    window.PHLOEM_NATIVE_BLOCKED_SETUP = true;
    window.history.replaceState(window.history.state, '',
      window.location.pathname + window.location.search);
    if (event) event.stopImmediatePropagation();
  }

  rejectUnsupportedSetup();
  window.addEventListener('hashchange', rejectUnsupportedSetup, true);
})();
