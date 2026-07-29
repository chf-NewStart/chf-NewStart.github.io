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

        // These labels are state-dependent, so they are rebuilt in JS rather
        // than swapped from static data-en/data-zh pairs like the page copy.
        if (typeof updateBackdropModeLabel === 'function') updateBackdropModeLabel();
        if (typeof updateRainLabel === 'function') updateRainLabel();
    }

    languageToggle?.addEventListener('click', () => {
        applyLanguage(currentLanguage === 'en' ? 'zh' : 'en');
    });

    function setMenu(open) {
        if (!hamburger || !navMenu) return;
        navMenu.classList.toggle('nav-open', open);
        hamburger.setAttribute('aria-expanded', String(open));
        hamburger.textContent = open ? '✕' : '☰';
        hamburger.setAttribute(
            'aria-label',
            currentLanguage === 'zh'
                ? (open ? '关闭菜单' : '打开菜单')
                : (open ? 'Close menu' : 'Open menu')
        );
    }

    hamburger?.addEventListener('click', () => {
        setMenu(hamburger.getAttribute('aria-expanded') !== 'true');
    });

    navMenu?.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => setMenu(false));
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        setMenu(false);
        if (rainOn) setRain(false);
    });

    document.addEventListener('click', (event) => {
        if (!navMenu?.classList.contains('nav-open')) return;
        if (!nav?.contains(event.target)) setMenu(false);
    });

    function updateScrollUI() {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const progress = scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0;
        if (scrollProgress) scrollProgress.style.width = `${progress * 100}%`;
        nav?.classList.toggle('is-scrolled', window.scrollY > 12);
    }

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

    function switchPanel(sectionId, panelId, button) {
        const section = document.getElementById(sectionId);
        const panel = document.getElementById(panelId);
        if (!section || !panel || !button) return;

        section.querySelectorAll('.explorer-btn').forEach((item) => {
            const selected = item === button;
            item.classList.toggle('active', selected);
            item.setAttribute('aria-selected', String(selected));
            item.tabIndex = selected ? 0 : -1;
        });

        section.querySelectorAll('.explorer-content .highlight-card').forEach((card) => {
            const selected = card === panel;
            card.classList.toggle('active-card', selected);
            card.hidden = !selected;
        });

        if (window.matchMedia('(max-width: 640px)').matches) {
            button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }

    document.querySelectorAll('.about-explorer').forEach((explorer, explorerIndex) => {
        const section = explorer.closest('section[id]');
        const menu = explorer.querySelector('.explorer-menu');
        const buttons = [...explorer.querySelectorAll('.explorer-btn')];
        const panels = [...explorer.querySelectorAll('.explorer-content .highlight-card')];
        if (!section || !menu || !buttons.length) return;

        menu.setAttribute('role', 'tablist');
        menu.setAttribute('aria-label', `Content selector ${explorerIndex + 1}`);

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

            button.addEventListener('click', () => switchPanel(section.id, panelId, button));

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

    const REST = 0.10, WALL = 0.45, FRIC = 0.82, MAXV = 17, MAX_BODIES = 56;
    const VROT_DRAG = 0.94;       // spin bleeds off wherever a body rests
    const VROT_STOP = 0.02;       // below this, stop turning outright
    const SLEEP_DRIFT = 0.25;     // px moved per frame below which a body settles
    const WAKE_OVERLAP = 0.35;    // px; below this, a pair counts as resolved
    const GRAV = 0.55, VDX = 0.92, VDY = 0.99, SLEEP_V = 0.35, SLEEP_FRAMES = 30;

    const hero = document.getElementById('hero-section');
    let rainLayer = null, bodies = [], rainRaf = 0, rainW = 0, rainH = 0;
    let rainOn = false, lastSpawn = 0;
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
        rainH = hero.clientHeight;
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
            const fs = 3.8 + Math.random() * 3.6;
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
        }, 800);
    }
    function stopDrizzle() {
        if (drizzleTimer) { window.clearInterval(drizzleTimer); drizzleTimer = null; }
    }

    function updateRainLabel() {
        if (!tomatoToggle) return;
        // Tap and hold do different things, so the label has to teach both.
        const label = currentLanguage === 'zh'
            ? (rainOn ? '停止番茄雨（长按可持续倾泻）' : '来一场番茄雨（长按持续倾泻）')
            : (rainOn ? 'Stop the tomato rain (hold to pour more)' : 'Make it rain tomatoes (hold to pour)');
        tomatoToggle.setAttribute('aria-label', label);
        tomatoToggle.title = label;
    }

    function setRain(on, announce = true, opening = 34) {
        rainOn = on;
        tomatoToggle?.setAttribute('aria-pressed', String(on));
        try { localStorage.setItem('tomatoRain', on ? 'on' : 'off'); } catch { /* private mode */ }
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

    function beginRainHold() {
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

    tomatoToggle?.addEventListener('click', () => {
        setMenu(false);
        if (rainPoured) { rainPoured = false; return; }  // that was a pour, not a tap
        setRain(!rainOn);
    });

    hero?.addEventListener('pointermove', (event) => {
        if (!rainOn || rainReduced()) return;
        const now = performance.now();
        if (now - lastSpawn < 90) return;
        lastSpawn = now;
        const rect = hero.getBoundingClientRect();
        spawnAt(event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: true });

    hero?.addEventListener('pointerdown', (event) => {
        if (!rainOn || rainReduced()) return;
        const rect = hero.getBoundingClientRect();
        spawnAt(event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: true });

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

    // --- Backdrop modes ---------------------------------------------------
    // Two engines, one canvas each: 'flow' is the WebGL shader (bio-bg.js,
    // loaded eagerly), 'tissue' is the Canvas2D field (cell-bg.js, fetched
    // only if chosen, since most visitors never switch).
    const backdropModeBtn = document.getElementById('backdropMode');
    const BACKDROP_MODES = {
        flow: { api: () => window.BIO_BG, src: null },
        tissue: { api: () => window.CELL_BG, src: 'cell-bg.js' },
    };
    let backdropMode = localStorage.getItem('backdropMode') === 'tissue' ? 'tissue' : 'flow';
    const loadedEngines = {};

    function loadEngine(mode) {
        const entry = BACKDROP_MODES[mode];
        if (!entry.src || entry.api()) return Promise.resolve(entry.api());
        if (!loadedEngines[mode]) {
            loadedEngines[mode] = new Promise((resolve) => {
                const tag = document.createElement('script');
                tag.src = entry.src;
                tag.onload = () => resolve(entry.api());
                tag.onerror = () => resolve(null);
                document.head.appendChild(tag);
            });
        }
        return loadedEngines[mode];
    }

    function updateBackdropModeLabel() {
        if (!backdropModeBtn) return;
        // Name the mode you would switch TO, not the one you are in. This is
        // state-dependent, so it cannot come from a static data-en/data-zh
        // pair the way the rest of the page's copy does.
        const next = backdropMode === 'flow' ? 'tissue' : 'flow';
        const label = currentLanguage === 'zh'
            ? (next === 'tissue' ? '切换背景：静态切片' : '切换背景：流动组织')
            : (next === 'tissue' ? 'Switch backdrop to still section' : 'Switch backdrop to flowing tissue');
        backdropModeBtn.setAttribute('aria-label', label);
        backdropModeBtn.title = label;
    }

    async function applyBackdropMode(mode, persist = true) {
        const target = BACKDROP_MODES[mode] ? mode : 'flow';
        const engine = await loadEngine(target);
        if (!engine || (engine.isSupported && !engine.isSupported())) {
            // Fall back to the other engine rather than leaving a blank page.
            const other = target === 'flow' ? 'tissue' : 'flow';
            if (other !== backdropMode || !BACKDROP_MODES[other].api()) {
                const fallback = await loadEngine(other);
                if (fallback && (!fallback.isSupported || fallback.isSupported())) {
                    backdropMode = other;
                    Object.keys(BACKDROP_MODES).forEach((m) => {
                        if (m !== other) BACKDROP_MODES[m].api()?.stop?.();
                    });
                    fallback.start();
                    updateBackdropModeLabel();
                    return;
                }
            }
            backdropModeBtn?.setAttribute('hidden', '');
            return;
        }
        Object.keys(BACKDROP_MODES).forEach((m) => {
            if (m !== target) BACKDROP_MODES[m].api()?.stop?.();
        });
        engine.start();
        backdropMode = target;
        if (persist) localStorage.setItem('backdropMode', target);
        updateBackdropModeLabel();
    }

    if (backdropModeBtn) {

        backdropModeBtn.addEventListener('click', () => {
            applyBackdropMode(backdropMode === 'flow' ? 'tissue' : 'flow');
        });
    }
    applyBackdropMode(backdropMode, false);

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
    setRain(localStorage.getItem('tomatoRain') !== 'off', false, 9);
    applyLanguage(currentLanguage);
    updateScrollUI();
})();
