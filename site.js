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

            if (element.childElementCount && currentLanguage === 'en' && element.dataset.originalHtml) {
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
        if (event.key === 'Escape') setMenu(false);
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

    window.switchAboutCard = (panelId, button) => switchPanel('about-section', panelId, button);
    window.switchExpCard = (panelId, button) => switchPanel('experience-section', panelId, button);
    window.switchProjCard = (panelId, button) => switchPanel('projects-section', panelId, button);
    window.switchPersonalCard = (panelId, button) => switchPanel('personal-section', panelId, button);

    document.querySelectorAll('.about-explorer').forEach((explorer, explorerIndex) => {
        const menu = explorer.querySelector('.explorer-menu');
        const buttons = [...explorer.querySelectorAll('.explorer-btn')];
        const panels = [...explorer.querySelectorAll('.explorer-content .highlight-card')];
        if (!menu || !buttons.length) return;

        menu.setAttribute('role', 'tablist');
        menu.setAttribute('aria-label', `Content selector ${explorerIndex + 1}`);

        buttons.forEach((button, index) => {
            const match = button.getAttribute('onclick')?.match(/'([^']+)'/);
            const panelId = match?.[1] || panels[index]?.id;
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

    function setTomatoMode(enabled, announce = true) {
        body.classList.toggle('sudo-mode', enabled);
        tomatoToggle?.setAttribute('aria-pressed', String(enabled));
        localStorage.setItem('tomatoMode', enabled ? 'on' : 'off');
        if (announce) {
            showNotice(enabled
                ? '> TOMATO MODE ENABLED · visual spectrum shifted'
                : '> TOMATO MODE DISABLED · default spectrum restored');
        }
    }

    tomatoToggle?.addEventListener('click', () => {
        setTomatoMode(!body.classList.contains('sudo-mode'));
    });

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

    const weatherOutput = document.getElementById('nfWeather');

    function weatherGlyph(code, smoky = false) {
        if (smoky) return '≋';
        if (code === 0) return '☼';
        if (code <= 2) return '◒';
        if (code === 3) return '☁';
        if (code === 45 || code === 48) return '≋';
        if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '☂';
        if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '✳';
        if (code >= 95) return 'ϟ';
        return '◒';
    }

    async function fetchJson(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        return response.json();
    }

    async function fetchCanadianAqhi(latitude, longitude) {
        const bounds = [longitude - 0.7, latitude - 0.5, longitude + 0.7, latitude + 0.5].join(',');
        try {
            const data = await fetchJson(`https://api.weather.gc.ca/collections/aqhi-observations-realtime/items?f=json&limit=20&latest=true&bbox=${bounds}`);
            let closest = null;
            let closestDistance = Infinity;

            (data.features || []).forEach((feature) => {
                const coordinates = feature.geometry?.coordinates;
                const aqhi = feature.properties?.aqhi;
                if (!coordinates || aqhi == null) return;

                const distance = ((coordinates[0] - longitude) ** 2) + ((coordinates[1] - latitude) ** 2);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closest = Math.round(aqhi);
                }
            });

            return closest;
        } catch {
            return null;
        }
    }

    function renderWeather({ code, temperature, city, aqhi, aqi }) {
        if (!weatherOutput) return;
        const smoky = (aqhi != null && aqhi >= 7) || (aqi != null && aqi >= 150);
        const glyph = document.createElement('span');
        glyph.className = 'weather-glyph';
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = weatherGlyph(code, smoky);

        const details = [`${Math.round(temperature)}°C`];
        if (aqhi != null && aqhi >= 4) details.push(`AQHI ${aqhi}`);
        else if (aqi != null && aqi >= 100) details.push(`AQI ${aqi}`);
        if (city) details.push(city);

        weatherOutput.replaceChildren(glyph, document.createTextNode(details.join(' · ')));
    }

    async function loadLocalWeather() {
        if (!weatherOutput) return;

        try {
            const location = await fetchJson('https://get.geojs.io/v1/ip/geo.json');
            const latitude = Number.parseFloat(location.latitude);
            const longitude = Number.parseFloat(location.longitude);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('Location unavailable');

            const coordinates = `latitude=${latitude}&longitude=${longitude}`;
            const [forecast, air, aqhi] = await Promise.all([
                fetchJson(`https://api.open-meteo.com/v1/forecast?${coordinates}&current=temperature_2m,weather_code`),
                fetchJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${coordinates}&current=us_aqi`).catch(() => null),
                location.country_code === 'CA' ? fetchCanadianAqhi(latitude, longitude) : Promise.resolve(null)
            ]);

            const current = forecast.current;
            if (!current || current.temperature_2m == null || current.weather_code == null) throw new Error('Weather unavailable');
            const aqi = air?.current?.us_aqi == null ? null : Math.round(air.current.us_aqi);
            renderWeather({
                code: current.weather_code,
                temperature: current.temperature_2m,
                city: location.city,
                aqhi,
                aqi
            });
        } catch {
            weatherOutput.textContent = currentLanguage === 'zh' ? '暂时无法获取' : 'Conditions unavailable';
        }
    }

    setTomatoMode(localStorage.getItem('tomatoMode') === 'on', false);
    applyLanguage(currentLanguage);
    updateScrollUI();
    loadLocalWeather();
})();
