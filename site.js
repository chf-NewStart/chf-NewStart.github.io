(() => {
    'use strict';

    const root = document.documentElement;
    const body = document.body;
    const languageToggle = document.getElementById('languageToggle');
    const hamburger = document.getElementById('hamburgerBtn');
    const navMenu = document.getElementById('navLinks');
    const tomatoToggle = document.getElementById('tomatoToggle');
    const scrollProgress = document.getElementById('scrollProgress');
    const nav = document.querySelector('.sticky-nav');
    const year = document.getElementById('currentYear');
    let currentLanguage = localStorage.getItem('language') === 'zh' ? 'zh' : 'en';
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');


    document.querySelectorAll('[target="_blank"]').forEach((link) => {
        link.rel = 'noopener noreferrer';
    });

    if (year) year.textContent = new Date().getFullYear();

    function applyLanguage(language) {
        currentLanguage = language === 'zh' ? 'zh' : 'en';
        localStorage.setItem('language', currentLanguage);
        root.lang = currentLanguage === 'zh' ? 'zh-CN' : 'en';

        document.querySelectorAll('[data-en][data-zh]').forEach((element) => {
            if (element.childElementCount && !element.dataset.originalHtml) {
                element.dataset.originalHtml = element.innerHTML;
            }

            if (currentLanguage === 'en' && element.dataset.originalHtml) {
                element.innerHTML = element.dataset.originalHtml;
            } else {
                const translation = element.dataset[currentLanguage];
                if (translation) element.textContent = translation;
            }
        });

        document.querySelectorAll(`[data-${currentLanguage}-href]`).forEach((link) => {
            const href = link.dataset[`${currentLanguage}Href`];
            if (href) link.href = href;
        });

        if (languageToggle) {
            languageToggle.textContent = currentLanguage === 'en' ? 'EN / 中文' : '中文 / EN';
            languageToggle.setAttribute(
                'aria-label',
                currentLanguage === 'en' ? 'Switch to Chinese' : 'Switch to English'
            );
        }

        if (hamburger) {
            const expanded = hamburger.getAttribute('aria-expanded') === 'true';
            hamburger.setAttribute(
                'aria-label',
                currentLanguage === 'zh'
                    ? (expanded ? '关闭菜单' : '打开菜单')
                    : (expanded ? 'Close menu' : 'Open menu')
            );
        }

        // State-dependent label, rebuilt in JS rather than swapped from a static
        // data-en/data-zh pair like the rest of the page copy.
        if (typeof updateRainLabel === 'function') updateRainLabel();
        // Same reason, different cause: an aria-label is an attribute, so the
        // textContent swap above cannot reach it.
        if (typeof updateExplorerLabels === 'function') updateExplorerLabels();
    }

    languageToggle?.addEventListener('click', () => {
        applyLanguage(currentLanguage === 'en' ? 'zh' : 'en');
    });

    // --- Mobile menu ------------------------------------------------------
    // Below 1120px the nav-links panel is a full-width fixed overlay, i.e. a
    // dialog in all but name: Tab has to stay inside it, assistive tech must
    // not see the page underneath, and the page must not scroll behind it.
    // aria-hidden rather than inert for the backdrop, because inert also
    // swallows the click that tap-outside-to-close depends on.
    const MENU_FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const menuHidden = [];

    function menuIsOpen() {
        return navMenu?.classList.contains('nav-open') === true;
    }

    // The hamburger turns into the overlay's ✕, so it is part of the cycle even
    // though it sits outside the panel in the DOM. getClientRects() is the
    // check that survives display:none on a fixed-position element.
    function menuFocusables() {
        return [hamburger, ...navMenu.querySelectorAll(MENU_FOCUSABLE)]
            .filter((element) => element?.getClientRects().length);
    }

    function setPageHidden(hidden) {
        if (!hidden) {
            menuHidden.forEach((element) => element.removeAttribute('aria-hidden'));
            menuHidden.length = 0;
            return;
        }

        [...body.children].forEach((element) => {
            if (element.contains(hamburger)) return;
            // Already-hidden nodes (the canvases, the progress bar) and the
            // unrendered ones are left alone so the restore stays exact.
            if (element.hasAttribute('aria-hidden') || !element.getClientRects().length) return;
            element.setAttribute('aria-hidden', 'true');
            menuHidden.push(element);
        });
    }

    // Killing the scrollbar widens the viewport, which would slide the centred
    // container and the fixed nav sideways. Handing both the reclaimed width
    // back as padding keeps the frame still. On a touch device the gutter is
    // zero and none of this applies.
    function setScrollLock(locked) {
        if (!locked) {
            body.style.overflowY = '';
            body.style.paddingRight = '';
            if (nav) nav.style.paddingRight = '';
            return;
        }

        const gutter = window.innerWidth - root.clientWidth;
        if (gutter > 0) {
            body.style.paddingRight = `${gutter}px`;
            if (nav) nav.style.paddingRight = `${gutter}px`;
        }
        body.style.overflowY = 'hidden';
    }

    function setMenu(open) {
        if (!hamburger || !navMenu) return;
        const changed = open !== menuIsOpen();
        navMenu.classList.toggle('nav-open', open);
        hamburger.setAttribute('aria-expanded', String(open));
        hamburger.textContent = open ? '✕' : '☰';
        hamburger.setAttribute(
            'aria-label',
            currentLanguage === 'zh'
                ? (open ? '关闭菜单' : '打开菜单')
                : (open ? 'Close menu' : 'Open menu')
        );
        // setMenu(false) is fired from half a dozen places that do not know
        // whether it was ever open; only a real transition may move focus.
        if (!changed) return;

        setPageHidden(open);
        setScrollLock(open);

        if (open) {
            navMenu.querySelector(MENU_FOCUSABLE)?.focus({ preventScroll: true });
        } else if (nav?.contains(document.activeElement) || document.activeElement === body) {
            // Whichever route closed it, focus goes back to the control that
            // opened it instead of being orphaned onto <body> by display:none.
            // Above the breakpoint the hamburger is gone and there is nothing
            // to return to.
            if (hamburger.getClientRects().length) hamburger.focus({ preventScroll: true });
        }
    }

    hamburger?.addEventListener('click', () => {
        setMenu(hamburger.getAttribute('aria-expanded') !== 'true');
    });

    navMenu?.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => setMenu(false));
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab' || !menuIsOpen()) return;
        const items = menuFocusables();
        if (!items.length) return;

        const active = document.activeElement;
        const inside = active === hamburger || navMenu.contains(active);
        const edge = event.shiftKey ? items[0] : items[items.length - 1];
        if (inside && active !== edge) return;

        event.preventDefault();
        (event.shiftKey ? items[items.length - 1] : items[0]).focus({ preventScroll: true });
    });

    // One press dismisses one thing. Both branches used to run, so dismissing
    // the menu killed the rain along with it.
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (menuIsOpen()) { setMenu(false); return; }
        if (rainOn) setRain(false);
    });

    document.addEventListener('click', (event) => {
        if (!menuIsOpen()) return;
        if (!nav?.contains(event.target)) setMenu(false);
    });

    // Crossing back above the breakpoint turns the overlay into a plain inline
    // list, so the trap and the lock have to come off with it.
    window.addEventListener('resize', () => {
        if (menuIsOpen() && !hamburger?.getClientRects().length) setMenu(false);
    }, { passive: true });
    // ---------------------------------------------------------------------

    // scrollHeight is a layout-forcing read, and doing it inside the scroll rAF
    // flushed layout in the same frame the WebGL backdrop draws in. It moves out
    // to the moments the page actually changes height instead.
    let scrollRange = 0;

    function updateScrollUI() {
        const progress = scrollRange > 0 ? Math.min(window.scrollY / scrollRange, 1) : 0;
        if (scrollProgress) scrollProgress.style.width = `${progress * 100}%`;
        nav?.classList.toggle('is-scrolled', window.scrollY > 12);
    }

    function refreshScrollRange() {
        scrollRange = root.scrollHeight - window.innerHeight;
        updateScrollUI();
    }

    // innerHeight is not part of any observed box, so resize needs its own
    // listener. Everything that reflows the document comes through the observer:
    // late images, the web fonts swapping in after load, the alumni disclosure
    // expanding on hover — none of which fire an event we could hang this on.
    // Guarded like bio-bg.js's: this runs at module scope, so a throw here
    // would take the rain, the tabs and the backdrop start down with it.
    window.addEventListener('resize', refreshScrollRange, { passive: true });
    if (typeof ResizeObserver === 'function') new ResizeObserver(refreshScrollRange).observe(body);

    let scrollFrame = null;
    window.addEventListener('scroll', () => {
        if (scrollFrame) return;
        scrollFrame = requestAnimationFrame(() => {
            updateScrollUI();
            scrollFrame = null;
        });
    }, { passive: true });

    const navLinks = [...document.querySelectorAll('.nav-links a[href^="#"]')];
    const sectionObserver = new IntersectionObserver((entries) => {
        const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;

        navLinks.forEach((link) => {
            const isActive = link.getAttribute('href') === `#${visible.target.id}`;
            link.classList.toggle('active-nav', isActive);
            if (isActive) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
        });
    }, { rootMargin: '-24% 0px -58% 0px', threshold: [0, 0.15, 0.4] });

    document.querySelectorAll('main section[id]').forEach((section) => sectionObserver.observe(section));

    // Scoped to the explorer, not to the enclosing section: a second explorer
    // dropped into the same section would otherwise cross-wire the two.
    function switchPanel(explorer, panelId, button) {
        const panel = document.getElementById(panelId);
        if (!explorer || !panel || !button) return;

        explorer.querySelectorAll('.explorer-btn').forEach((item) => {
            const selected = item === button;
            item.classList.toggle('active', selected);
            item.setAttribute('aria-selected', String(selected));
            item.tabIndex = selected ? 0 : -1;
        });

        explorer.querySelectorAll('.explorer-content .highlight-card').forEach((card) => {
            const selected = card === panel;
            card.classList.toggle('active-card', selected);
            card.hidden = !selected;
        });

        if (window.matchMedia('(max-width: 640px)').matches) {
            // A scripted behavior:'smooth' is not overridden by the reduced-
            // motion scroll-behavior rule in the stylesheet; it has to be
            // opted out of here.
            button.scrollIntoView({
                behavior: reducedMotionQuery.matches ? 'auto' : 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }
    }

    // The tablist's name is an aria-label, which the data-en/data-zh text swap
    // cannot reach, so it is rebuilt in JS from the section the explorer sits
    // in — informative, and translated, unlike the old "Content selector N".
    const explorerTablists = [];

    function updateExplorerLabels() {
        explorerTablists.forEach(({ menu, heading, index }) => {
            const name = heading ? (heading.dataset[currentLanguage] || heading.textContent.trim()) : '';
            menu.setAttribute(
                'aria-label',
                currentLanguage === 'zh'
                    ? (name ? `内容选择器：${name}` : `内容选择器 ${index + 1}`)
                    : (name ? `Content selector: ${name}` : `Content selector ${index + 1}`)
            );
        });
    }

    document.querySelectorAll('.about-explorer').forEach((explorer, explorerIndex) => {
        const section = explorer.closest('section[id]');
        const menu = explorer.querySelector('.explorer-menu');
        const buttons = [...explorer.querySelectorAll('.explorer-btn')];
        const panels = [...explorer.querySelectorAll('.explorer-content .highlight-card')];
        if (!section || !menu || !buttons.length) return;

        menu.setAttribute('role', 'tablist');
        explorerTablists.push({
            menu,
            heading: section.querySelector('.section-heading .section-title'),
            index: explorerIndex
        });

        buttons.forEach((button, index) => {
            const panelId = button.dataset.panel || panels[index]?.id;
            if (!panelId) return;

            const panel = document.getElementById(panelId);
            const tabId = `${panelId}-tab`;
            const active = button.classList.contains('active');
            button.id = tabId;
            button.type = 'button';
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-controls', panelId);
            button.setAttribute('aria-selected', String(active));
            button.tabIndex = active ? 0 : -1;

            if (panel) {
                panel.setAttribute('role', 'tabpanel');
                panel.setAttribute('aria-labelledby', tabId);
                panel.tabIndex = 0;
                panel.hidden = !active;
            }

            button.addEventListener('click', () => switchPanel(explorer, panelId, button));

            button.addEventListener('keydown', (event) => {
                const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
                if (!keys.includes(event.key)) return;
                event.preventDefault();

                let nextIndex = index;
                if (event.key === 'Home') nextIndex = 0;
                else if (event.key === 'End') nextIndex = buttons.length - 1;
                else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % buttons.length;
                else nextIndex = (index - 1 + buttons.length) % buttons.length;

                buttons[nextIndex].focus();
                buttons[nextIndex].click();
            });
        });
    });

    updateExplorerLabels();

    function showNotice(message) {
        document.querySelector('.terminal-alert')?.remove();
        const notice = document.createElement('div');
        notice.className = 'terminal-alert';
        notice.setAttribute('role', 'status');
        notice.textContent = message;
        body.appendChild(notice);
        window.setTimeout(() => {
            notice.style.opacity = '0';
            notice.style.transform = 'translateY(8px)';
            window.setTimeout(() => notice.remove(), 320);
        }, 2400);
    }

    // --- Tomato rain ------------------------------------------------------
    // A physics toy ported from the owner's own lifegameproject.com hero card:
    // bodies spawn at the cursor, fall, collide, rotate and pile up. Scoped to
    // the hero rather than the whole page — the containment is what keeps it
    // playful instead of noisy, and it shares the frame budget with a live
    // WebGL backdrop, hence the lower body cap and the sleeping.
    const TOMATO_ART = [
        '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
        '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
        '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠛⠻⣶⡆⠀⠿⠀⣶⠒⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
        '⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⣴⠾⠛⢹⣶⡤⢶⣿⡟⠶⠦⠄⠀⠀⠀⠀⠀⠀⠀⠀',
        '⠀⠀⠀⠀⠀⣠⣶⣤⣤⣤⣤⣴⠂⠸⠋⢀⣄⡉⠓⠀⠲⣶⣾⣿⣷⣄⠀⠀⠀⠀',
        '⠀⠀⠀⢀⣾⡿⠋⠁⣠⣤⣿⡟⢀⣠⣾⣿⣿⣿⣷⣶⣤⣼⣿⣿⣿⣿⣆⠀⠀⠀',
        '⠀⠀⠀⣾⡟⠀⣰⣿⣿⣿⣿⣷⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡄⠀⠀',
        '⠀⠀⢸⡿⠀⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀',
        '⠀⠀⢸⡇⢰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀',
        '⠀⠀⢸⣿⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀',
        '⠀⠀⠸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠁⠀⠀',
        '⠀⠀⠀⢻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠃⠀⠀⠀',
        '⠀⠀⠀⠀⠙⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠟⠁⠀⠀⠀⠀',
        '⠀⠀⠀⠀⠀⠀⠉⠛⠿⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠟⠋⠀⠀⠀⠀⠀⠀⠀',
        '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠉⠉⠉⠉⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    ].join('\n');
    // Ripening green through orange to red — the carotenoid run.
    const TOMATO_COLORS = ['#6cc24a', '#86d15a', '#4fb33a', '#f0973a', '#e8a13a', '#e23b2e', '#cf3027'];
    // The rest of the cast: Waterloo's geese, Toronto's raccoons, and Life
    // patterns from the arcade. Universities' actual marks are trademarks and
    // deliberately not used — the campus fauna is the better joke anyway.
    const RAIN_SPRITES = ['goose', 'raccoon', 'glider', 'block', 'blinker'];

    const REST = 0.10, WALL = 0.45, FRIC = 0.82, MAXV = 17;
    // Cap by width. 56 bodies heaped into a 400px-wide hero build a pile deep
    // enough to bury the launcher panel underneath, and it is the most bodies
    // on the weakest hardware. Wide screens keep the full crowd.
    const MAX_BODIES = window.innerWidth < 560 ? 22 : (window.innerWidth < 900 ? 36 : 56);
    const VROT_DRAG = 0.94;       // spin bleeds off wherever a body rests
    const VROT_STOP = 0.02;       // below this, stop turning outright
    const SLEEP_DRIFT = 0.25;     // px moved per frame below which a body settles
    const WAKE_OVERLAP = 0.35;    // px; below this, a pair counts as resolved
    const GRAV = 0.55, VDX = 0.92, VDY = 0.99, SLEEP_V = 0.35, SLEEP_FRAMES = 30;

    const hero = document.getElementById('hero-section');
    let rainLayer = null, bodies = [], rainRaf = 0, rainW = 0, rainH = 0;
    let rainOn = false;
    // The tomato art is monospace, so its rendered width scales linearly with
    // font-size. Measure that ratio once — reading offsetWidth forces a
    // synchronous layout, and doing it on every spawn (drizzle + pointer)
    // jittered the frame interval the WebGL backdrop shares.
    let tomatoWidthPerFs = 0;

    function rainReduced() { return reducedMotionQuery.matches; }

    function ensureLayer() {
        if (!hero) return null;
        if (!rainLayer) {
            rainLayer = document.createElement('div');
            rainLayer.className = 'tomato-rain';
            rainLayer.setAttribute('aria-hidden', 'true');
            hero.appendChild(rainLayer);
        }
        rainW = hero.clientWidth;
        // The floor is the bottom of the hero, full stop. Clamping it to the
        // visible window instead put the floor partway DOWN the section on a
        // phone — 773px into a 1027px hero — so the pile settled in mid-air
        // over the launcher panel and stayed at that document position while
        // the page scrolled past it. Landing at the section's own bottom edge
        // is both what it should look like and the only floor that stays put
        // relative to the content around it.
        const prevH = rainH;
        rainH = hero.clientHeight;
        // The hero's height is not settled at first paint: web fonts arrive
        // late and reflow the copy, images size, panels lay out. A body that
        // already fell asleep against the older, shorter floor would hang
        // exactly there while the real floor moved down past it — stopping in
        // mid-air. Whenever the floor moves, put everything back in motion so
        // it finishes the fall.
        if (prevH && Math.abs(rainH - prevH) > 4 && bodies.length) wakeAll();
        return rainLayer;
    }

    function place(b) {
        b.el.style.transform = `translate(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px) translate(-50%,-50%) rotate(${b.rot.toFixed(1)}deg)`;
    }

    function wakeAll() {
        bodies.forEach((b) => { b.asleep = false; b.sleep = 0; });
        ensureRainRaf();
    }

    function removeOldest() {
        const b = bodies.shift();
        if (!b) return;
        b.el.style.opacity = '0';
        window.setTimeout(() => b.el.remove(), 350);
        wakeAll();
    }

    function spawnAt(x, y) {
        const layer = ensureLayer();
        if (!layer) return;
        if (bodies.length >= MAX_BODIES) removeOldest();

        let el, r;
        // Roughly one in three is a tomato; the rest of the cast shares the remainder.
        if (Math.random() < 0.34) {
            // Size the art to a TARGET WIDTH rather than a font-size, so a
            // tomato is the same size as a goose. Picking font-size directly
            // rendered them 86-171px against the sprites' 32-54px, and on a
            // 400px phone the biggest was nearly half the screen.
            const targetW = 30 + Math.random() * 22;
            const fs = tomatoWidthPerFs ? targetW / tomatoWidthPerFs : 1.9;
            const col = TOMATO_COLORS[(Math.random() * TOMATO_COLORS.length) | 0];
            el = document.createElement('pre');
            el.className = 'tdrop';
            el.textContent = TOMATO_ART;
            el.style.fontSize = `${fs.toFixed(2)}px`;
            el.style.color = col;
            el.style.textShadow = `0 0 7px ${col}dd, 0 2px 6px rgba(0,0,0,0.75)`;
            layer.appendChild(el);
            if (!tomatoWidthPerFs) {
                const w = el.offsetWidth;
                if (w) tomatoWidthPerFs = w / fs;
            }
            r = tomatoWidthPerFs ? tomatoWidthPerFs * fs * 0.32 : fs * 5.4;
        } else {
            const name = RAIN_SPRITES[(Math.random() * RAIN_SPRITES.length) | 0];
            const size = 30 + Math.random() * 22;
            el = document.createElement('img');
            el.className = 'tdrop tdrop-sprite';
            el.src = `sprites/${name}.png`;
            el.alt = '';
            el.width = size;
            el.height = size;
            layer.appendChild(el);
            r = size * 0.42;
        }

        const b = {
            x, y, vx: (Math.random() * 2 - 1) * 1.3, vy: Math.random() * 1.2, r, el,
            rot: Math.random() * 30 - 15, vrot: Math.random() * 3 - 1.5, sleep: 0, asleep: false,
        };
        place(b);
        window.requestAnimationFrame(() => { el.style.opacity = '0.96'; });
        bodies.push(b);
        ensureRainRaf();
    }

    function stepRain() {
        rainRaf = 0;
        let awake = 0;
        for (const b of bodies) {
            if (b.asleep) continue;
            b.px = b.x; b.py = b.y; b.prot = b.rot;
            b.vy += GRAV;
            b.vx *= VDX;
            b.vy *= VDY;
            // Angular drag applies every frame, not only on floor contact.
            // Damping spin only in the floor branch meant anything that came
            // to rest on top of the pile — most of it — never stopped turning,
            // which also kept its drift above the sleep threshold forever.
            b.vrot *= VROT_DRAG;
            if (Math.abs(b.vrot) < VROT_STOP) b.vrot = 0;
            b.vx = Math.max(-MAXV, Math.min(MAXV, b.vx));
            b.vy = Math.max(-MAXV, Math.min(MAXV, b.vy));
            b.x += b.vx;
            b.y += b.vy;
            b.rot += b.vrot;

            if (b.x < b.r) { b.x = b.r; b.vx = -b.vx * WALL; }
            if (b.x > rainW - b.r) { b.x = rainW - b.r; b.vx = -b.vx * WALL; }
            if (b.y > rainH - b.r) {
                b.y = rainH - b.r;
                b.vy = -b.vy * REST;
                b.vx *= FRIC;
                b.vrot *= FRIC;
            }
            awake += 1;
        }

        // Separate overlapping bodies so they stack instead of interpenetrating.
        // Two sleeping bodies are already resolved against each other, so skip
        // the pair entirely: settled neighbours rest in permanent sub-pixel
        // overlap, and re-solving them woke the whole pile every frame, which
        // meant the loop never stopped and every scroll fought 56 live bodies.
        for (let i = 0; i < bodies.length; i++) {
            for (let j = i + 1; j < bodies.length; j++) {
                const a = bodies[i], c = bodies[j];
                if (a.asleep && c.asleep) continue;
                const dx = c.x - a.x, dy = c.y - a.y;
                const d2 = dx * dx + dy * dy;
                const min = a.r + c.r;
                if (d2 <= 0.0001 || d2 >= min * min) continue;
                const d = Math.sqrt(d2);
                const push = (min - d) / 2;
                const nx = dx / d, ny = dy / d;
                a.x -= nx * push; a.y -= ny * push;
                c.x += nx * push; c.y += ny * push;
                const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
                if (rel < 0) {
                    const imp = -rel * (1 + REST) / 2;
                    a.vx -= imp * nx; a.vy -= imp * ny;
                    c.vx += imp * nx; c.vy += imp * ny;
                }
                a.vrot *= FRIC; c.vrot *= FRIC;
                if (push > WAKE_OVERLAP) {
                    a.asleep = c.asleep = false;
                    a.sleep = c.sleep = 0;
                }
            }
        }

        for (const b of bodies) {
            if (!b.asleep) place(b);
            if (b.asleep) continue;
            // A body resting quietly stops being simulated; when every body is
            // asleep the loop stops entirely rather than idling at 60fps.
            // Test how far the body actually MOVED, not its velocity. A body
            // resting on the floor still carries |vy| ~= GRAV every frame:
            // gravity accelerates it, the floor bounces it back, and it never
            // drops below a velocity threshold. Displacement does settle.
            const drift = Math.abs(b.x - b.px) + Math.abs(b.y - b.py) + Math.abs(b.rot - b.prot) * 0.5;
            if (drift < SLEEP_DRIFT) {
                b.sleep += 1;
                if (b.sleep > SLEEP_FRAMES) {
                    b.asleep = true;
                    b.vx = b.vy = b.vrot = 0;
                    place(b);
                }
            } else {
                b.sleep = 0;
            }
        }

        if (awake > 0 && rainOn && !document.hidden) ensureRainRaf();
    }

    function ensureRainRaf() {
        if (rainRaf || !rainOn || document.hidden || rainReduced()) return;
        rainRaf = window.requestAnimationFrame(stepRain);
    }

    function clearRain() {
        if (rainRaf) { window.cancelAnimationFrame(rainRaf); rainRaf = 0; }
        bodies.forEach((b) => {
            b.el.style.opacity = '0';
            window.setTimeout(() => b.el.remove(), 350);
        });
        bodies = [];
    }

    function burst(count) {
        ensureLayer();
        if (!rainW) return;
        // Shuffled column order: the line fills in everywhere at once instead
        // of sweeping left to right.
        const cols = Array.from({ length: count }, (_, i) => i);
        for (let i = cols.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            [cols[i], cols[j]] = [cols[j], cols[i]];
        }
        cols.forEach((col, i) => {
            window.setTimeout(() => {
                if (!rainOn) return;
                const jitter = (Math.random() - 0.5) * (0.9 / count);
                spawnAt(rainW * (0.05 + 0.9 * ((col + 0.5) / count) + jitter), -20 - Math.random() * 120);
            }, i * 45);
        });
    }

    function restingPile(count) {
        // Reduced-motion: the same cast, already landed, nothing animating.
        ensureLayer();
        if (!rainW) return;
        for (let i = 0; i < count; i++) {
            spawnAt(rainW * (0.12 + 0.76 * ((i + 0.5) / count)), rainH - 26);
        }
        bodies.forEach((b) => { b.asleep = true; b.vx = b.vy = b.vrot = 0; b.y = rainH - b.r; place(b); });
    }

    // Ambient drizzle: while the rain is on, bodies also fall from the top
    // of the hero on their own, so it reads as weather rather than a cursor
    // trick. The body cap turns sustained drizzle into gentle churn — the
    // oldest fade out as new ones arrive.
    let drizzleTimer = null;
    function startDrizzle() {
        if (drizzleTimer || rainReduced()) return;
        drizzleTimer = window.setInterval(() => {
            if (!rainOn || document.hidden) return;
            ensureLayer();
            if (rainW) spawnAt(rainW * (0.05 + 0.9 * Math.random()), -30 - Math.random() * 40);
        }, 480);
    }
    function stopDrizzle() {
        if (drizzleTimer) { window.clearInterval(drizzleTimer); drizzleTimer = null; }
    }

    function updateRainLabel() {
        if (!tomatoToggle) return;
        // A normal click opens a random fun fact; Shift-click controls
        // the existing tomato-rain easter egg.
        const label = currentLanguage === 'zh'
            ? (rainOn ? '随机冷知识（Shift 点击停止番茄雨）' : '随机冷知识（Shift 点击开启番茄雨）')
            : (rainOn ? 'Random fun fact (Shift-click: stop tomato rain)' : 'Random fun fact (Shift-click: tomato rain)');
        tomatoToggle.setAttribute('aria-label', label);
        tomatoToggle.title = label;
    }

    // v2 because the key's meaning changed. The previous build persisted on
    // every boot, so it wrote "off" for everyone who merely loaded the page,
    // not just those who opted out — reading that back would keep the new
    // default suppressed forever. A fresh key discards those poisoned values.
    const RAIN_KEY = 'tomatoRain.v2';

    function setRain(on, announce = true, opening = 34, persist = true) {
        rainOn = on;
        tomatoToggle?.setAttribute('aria-pressed', String(on));
        // Only an explicit choice is stored. Persisting the boot state is what
        // caused the problem above.
        if (persist) {
            try { localStorage.setItem(RAIN_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
        }
        updateRainLabel();
        if (!on) { stopDrizzle(); clearRain(); return; }
        ensureLayer();
        if (rainReduced()) restingPile(7);
        else { burst(opening); ensureRainRaf(); startDrizzle(); }
        if (announce) {
            showNotice(currentLanguage === 'zh' ? '> 番茄雨开始了' : '> TOMATO RAIN ENGAGED');
        }
    }

    // Tap toggles; press and hold pours. The plain tap does the safe, obvious
    // thing (start, then stop) because that is the gesture everyone tries
    // first and nobody should be stuck unable to turn it off. Holding is the
    // hidden extra, and it pours continuously rather than firing one burst.
    const RAIN_HOLD_MS = 260;      // past this, it is a pour, not a tap
    const RAIN_POUR_MS = 70;       // spawn interval while held
    let rainHoldTimer = null;
    let rainPourTimer = null;
    let rainPoured = false;

    function pourTick() {
        if (!rainOn || rainReduced()) return;
        ensureLayer();
        if (rainW) spawnAt(rainW * (0.06 + 0.88 * Math.random()), -25 - Math.random() * 60);
    }

    function beginRainHold(event) {
        if (!event.shiftKey) return;
        rainPoured = false;
        window.clearTimeout(rainHoldTimer);
        rainHoldTimer = window.setTimeout(() => {
            rainPoured = true;
            if (!rainOn) setRain(true, false);       // holding from cold starts it
            if (rainReduced()) return;
            pourTick();
            rainPourTimer = window.setInterval(pourTick, RAIN_POUR_MS);
        }, RAIN_HOLD_MS);
    }

    function endRainHold() {
        window.clearTimeout(rainHoldTimer);
        rainHoldTimer = null;
        if (rainPourTimer) { window.clearInterval(rainPourTimer); rainPourTimer = null; }
    }

    tomatoToggle?.addEventListener('pointerdown', beginRainHold);
    tomatoToggle?.addEventListener('pointerup', endRainHold);
    tomatoToggle?.addEventListener('pointerleave', endRainHold);
    tomatoToggle?.addEventListener('pointercancel', endRainHold);
    // A long press must not raise the iOS callout or start a selection.
    tomatoToggle?.addEventListener('contextmenu', (e) => { if (rainPoured) e.preventDefault(); });

    tomatoToggle?.addEventListener('click', (event) => {
        if (!event.shiftKey) return;
        setMenu(false);
        if (rainPoured) { rainPoured = false; return; }  // that was a pour, not a tap
        setRain(!rainOn);
    });

    // Nothing spawns from the pointer any more. Trailing tomatoes off the mouse
    // read as jitter rather than play: every throttled move called
    // getBoundingClientRect() — a forced synchronous layout — and then added a
    // body, so moving the cursor across the hero meant a steady stream of
    // layout flushes and new compositor work landing on top of the WebGL
    // backdrop. The rain arrives on its own and the nav tomato is the control.

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { if (rainRaf) { window.cancelAnimationFrame(rainRaf); rainRaf = 0; } }
        else if (rainOn) wakeAll();
    });

    reducedMotionQuery.addEventListener?.('change', () => {
        if (!rainOn) return;
        stopDrizzle();
        clearRain();
        if (rainReduced()) restingPile(7);
        else { burst(34); ensureRainRaf(); startDrizzle(); }
    });

    let rainResizeTimer = null;
    window.addEventListener('resize', () => {
        window.clearTimeout(rainResizeTimer);
        rainResizeTimer = window.setTimeout(() => {
            if (!rainLayer) return;
            ensureLayer();
            bodies.forEach((b) => {
                b.x = Math.max(b.r, Math.min(rainW - b.r, b.x));
                b.y = Math.min(b.y, rainH - b.r);
                place(b);
            });
            wakeAll();
        }, 180);
    }, { passive: true });

    // --- Backdrop ---------------------------------------------------------
    // bio-bg.js deliberately does not start itself, so it has to be told to.
    // Forgetting this once already shipped a page with a dead backdrop.
    if (window.BIO_BG && (!window.BIO_BG.isSupported || window.BIO_BG.isSupported())) {
        window.BIO_BG.start();
    }

    const copyEmail = document.getElementById('copyEmail');
    copyEmail?.addEventListener('click', async () => {
        const value = copyEmail.dataset.copy;
        if (!value) return;

        try {
            await navigator.clipboard.writeText(value);
            showNotice(currentLanguage === 'zh' ? '> 邮箱地址已复制' : '> EMAIL COPIED TO CLIPBOARD');
        } catch {
            window.location.href = `mailto:${value}`;
        }
    });

    const labCarousel = document.querySelector('.arcade-grid');
    labCarousel?.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        labCarousel.scrollBy({
            left: direction * labCarousel.clientWidth * 0.95,
            behavior: prefersReducedMotion ? 'auto' : 'smooth'
        });
    });

    // --- Featured-alumni inline disclosure --------------------------------
    // Hover and keyboard-focus reveal are pure CSS and work with JS disabled.
    // This handles tap-to-toggle, aria-expanded, inert, outside-tap close and
    // Escape-to-dismiss (WCAG 1.4.13).
    document.querySelectorAll('.alumni-evidence').forEach((wrap, index) => {
        const toggle = wrap.querySelector('.alumni-toggle');
        const panel = wrap.querySelector('.alumni-panel');
        if (!toggle || !panel) return;

        const eyebrow = panel.querySelector('.alumni-pull__eyebrow');
        const uid = `alumni-${index + 1}`;
        toggle.id = `${uid}-toggle`;
        panel.id = `${uid}-panel`;
        toggle.setAttribute('aria-controls', panel.id);
        if (eyebrow) {
            eyebrow.id = `${uid}-eyebrow`;
            panel.setAttribute('aria-labelledby', eyebrow.id);
        }
        panel.inert = true;

        const hasFocusPreview = () => {
            const active = document.activeElement;
            if (!active || !wrap.contains(active)) return false;
            try {
                return active.matches(':focus-visible');
            } catch {
                return true;
            }
        };

        // aria-expanded tracks the pinned and keyboard-focus paths only. A
        // bare hover preview is an event the AT user never made, so mirroring
        // it into the a11y tree would be noise.
        const isOpen = () => wrap.classList.contains('is-pinned')
            || (!wrap.classList.contains('is-dismissed') && hasFocusPreview());

        // --ae-vis is the component's single render signal, and custom
        // properties are never mid-transition, so it reads 'hidden' the
        // instant a collapse begins — before the 380ms visibility delay
        // expires. Driving inert off it closes the window in which the
        // citation link is still tabbable inside a panel on its way out.
        const isVisible = () => getComputedStyle(wrap).getPropertyValue('--ae-vis').trim() === 'visible';

        // Turning inert ON is deferred by one frame. Focus moving from the
        // trigger INTO the panel fires focusout while activeElement is still
        // <body>, so a synchronous inert would land mid-handoff and swallow
        // the Tab. One frame is ~16ms against the 380ms it replaces, and the
        // following focusin cancels it before it can apply.
        let inertFrame = null;
        const setInert = (on) => {
            if (!on) {
                if (inertFrame !== null) cancelAnimationFrame(inertFrame);
                inertFrame = null;
                panel.inert = false;
                return;
            }
            if (panel.inert || inertFrame !== null) return;
            inertFrame = requestAnimationFrame(() => {
                inertFrame = null;
                if (!isVisible()) panel.inert = true;
            });
        };

        const sync = () => {
            toggle.setAttribute('aria-expanded', isOpen() ? 'true' : 'false');
            setInert(!isVisible());
        };

        // Synchronously first: getComputedStyle forces a style recalc and the
        // :hover / :focus-visible flags are already set when the event is
        // dispatched. The rAF pass is only a safety net for the rare ordering
        // where they are not.
        let queued = false;
        const syncSoon = () => {
            sync();
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => {
                queued = false;
                sync();
            });
        };

        const setPinned = (on) => {
            wrap.classList.toggle('is-pinned', on);
            sync();
            if (!on) return;
            // block:'nearest' is a no-op when the panel is already in view.
            panel.scrollIntoView({
                block: 'nearest',
                behavior: reducedMotionQuery.matches ? 'auto' : 'smooth'
            });
        };

        toggle.addEventListener('click', () => {
            const open = isOpen();
            // is-dismissed suppresses the hover/focus preview that would
            // otherwise outlive the unpin and leave the panel on screen; the
            // pointerleave/pointerenter/focusout handlers re-arm it.
            wrap.classList.toggle('is-dismissed', open);
            setPinned(!open);
        });

        // pointerover/out rather than enter/leave: they fire per descendant,
        // so sliding from the wrapper's dead space onto the trigger is caught.
        ['pointerover', 'pointerout', 'focusin', 'focusout'].forEach((type) => {
            wrap.addEventListener(type, syncSoon);
        });

        // Re-arm the preview once the pointer or focus leaves.
        wrap.addEventListener('pointerleave', () => {
            wrap.classList.remove('is-dismissed');
            syncSoon();
        });

        wrap.addEventListener('pointerenter', () => {
            if (!wrap.contains(document.activeElement)) wrap.classList.remove('is-dismissed');
            syncSoon();
        });

        wrap.addEventListener('focusout', (event) => {
            if (!wrap.contains(event.relatedTarget)) wrap.classList.remove('is-dismissed');
            syncSoon();
        });

        // A tap anywhere outside the component releases the pin.
        document.addEventListener('pointerdown', (event) => {
            if (!wrap.classList.contains('is-pinned')) return;
            if (wrap.contains(event.target)) return;
            setPinned(false);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' && event.key !== 'Esc') return;
            const hovering = wrap.matches(':hover');
            const focusInside = wrap.contains(document.activeElement);
            if (!wrap.classList.contains('is-pinned') && !hovering && !focusInside) return;
            // If focus sits inside the panel we are about to hide, park it on
            // the trigger first so it is never lost to <body>.
            if (panel.contains(document.activeElement)) toggle.focus();
            if (hovering || focusInside) wrap.classList.add('is-dismissed');
            setPinned(false);
        });

        sync();
    });
    // ---------------------------------------------------------------------

    // Rain is on unless the visitor has turned it off. Arriving is a gentler
    // opening than tapping: a handful of bodies drifting in, then the drizzle,
    // rather than dumping 34 over the headline the instant the page paints.
    // Tapping still gets the full burst.
    let rainStored = null;
    try { rainStored = localStorage.getItem(RAIN_KEY); } catch { /* private mode */ }
    setRain(rainStored !== 'off', false, 9, false);

    // Nothing spawns between bursts except the drizzle, so a floor that moves
    // for a reason other than a spawn would go unnoticed until the next drop.
    // Re-measure on the two events that actually move it.
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => { if (rainOn) { ensureLayer(); } });
    }
    applyLanguage(currentLanguage);
    refreshScrollRange();
})();
