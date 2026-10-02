(() => {
    'use strict';

    const button = document.getElementById('backgroundToggle');
    if (!button) return;
    const state = document.getElementById('backgroundState');
    const notice = document.getElementById('backgroundNotice');
    const body = document.body;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const preferenceKey = 'houfu-background';
    let wanted = false;
    let active = false;
    let pending = false;
    let failed = false;
    let enginePromise;
    let request = 0;

    // Storage is a convenience. Private or embedded browsers can refuse it.
    function remember(value) {
        try { localStorage.setItem(preferenceKey, value ? 'living' : 'quiet'); } catch { /* session-only choice */ }
    }

    function updateLabel() {
        const zh = document.documentElement.lang.startsWith('zh');
        state.textContent = pending ? (zh ? '加载中' : 'Loading')
            : active ? (motion.matches ? (zh ? '静止' : 'Still') : (zh ? '开' : 'On'))
                : (zh ? '关' : 'Off');
        button.setAttribute('aria-pressed', String(wanted));
        button.setAttribute('aria-busy', String(pending));
        notice.textContent = failed
            ? (zh ? '此浏览器暂时无法显示动态背景，仍可使用静态页面。' : 'The living background isn’t available in this browser. The quiet view is ready.')
            : '';
        notice.hidden = !failed;
    }

    function loadEngine() {
        if (window.BIO_BG) return Promise.resolve(window.BIO_BG);
        if (!enginePromise) {
            enginePromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'bio-bg.js';
                script.onload = () => window.BIO_BG ? resolve(window.BIO_BG) : reject(new Error('Background unavailable'));
                script.onerror = () => { script.remove(); reject(new Error('Background unavailable')); };
                document.head.appendChild(script);
            }).catch((error) => { enginePromise = undefined; throw error; });
        }
        return enginePromise;
    }

    async function setBackground(enabled, persist = true) {
        const thisRequest = ++request;
        wanted = enabled;
        failed = false;
        if (persist) remember(enabled);

        if (!enabled) {
            window.BIO_BG?.stop();
            body.classList.remove('has-bio-bg');
            active = false;
            pending = false;
            updateLabel();
            return;
        }

        pending = true;
        updateLabel();
        try {
            const engine = await loadEngine();
            // A second tap can cancel while the file is still arriving.
            if (thisRequest !== request || !wanted) return;
            if (!engine.isSupported()) throw new Error('Background unavailable');
            body.classList.add('has-bio-bg');
            engine.start();
            if (document.getElementById('bioBg').classList.contains('bio-bg--fallback')) throw new Error('Background unavailable');
            active = true;
        } catch {
            if (thisRequest !== request) return;
            window.BIO_BG?.stop();
            body.classList.remove('has-bio-bg');
            wanted = false;
            active = false;
            failed = true;
            remember(false);
        }
        pending = false;
        updateLabel();
    }

    button.hidden = false;
    button.addEventListener('click', () => setBackground(!wanted));
    document.addEventListener('site:languagechange', updateLabel);
    motion.addEventListener('change', updateLabel);
    let saved = null;
    try { saved = localStorage.getItem(preferenceKey); } catch { /* default remains quiet */ }
    setBackground(saved === 'living', false);

    // Old section URLs still work after moving content into native disclosures.
    function revealTarget(hash, scroll = false) {
        if (!hash || hash === '#') return;
        let id;
        try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
        const target = document.getElementById(id);
        if (!target) return;
        let node = target;
        while (node) {
            if (node.tagName === 'DETAILS') node.open = true;
            node = node.parentElement;
        }
        if (scroll) target.scrollIntoView({ block: 'start', behavior: 'instant' });
    }

    document.querySelectorAll('a[href^="#"]').forEach((link) => {
        link.addEventListener('click', () => revealTarget(link.getAttribute('href')));
    });
    window.addEventListener('hashchange', () => revealTarget(location.hash, true));
    revealTarget(location.hash, true);
})();
