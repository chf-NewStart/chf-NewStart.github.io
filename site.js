(() => {
    'use strict';

    const root = document.documentElement;
    const body = document.body;
    const languageToggle = document.getElementById('languageToggle');
    const hamburger = document.getElementById('hamburgerBtn');
    const navMenu = document.getElementById('navLinks');
    const tomatoToggle = document.getElementById('tomatoToggle');
    const tomatoPet = document.getElementById('tomatoPet');
    const tomatoPetButton = document.getElementById('tomatoPetButton');
    const tomatoPetClose = document.getElementById('tomatoPetClose');
    const tomatoPetStatus = document.getElementById('tomatoPetStatus');
    const tomatoPetFriendship = document.getElementById('tomatoPetFriendship');
    const scrollProgress = document.getElementById('scrollProgress');
    const nav = document.querySelector('.sticky-nav');
    const year = document.getElementById('currentYear');
    let currentLanguage = localStorage.getItem('language') === 'zh' ? 'zh' : 'en';
    let tomatoPetCount = Math.min(Math.max(Number.parseInt(localStorage.getItem('tomatoPetPats') || '0', 10) || 0, 0), 99);
    let tomatoPetTimer = null;

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

        updateTomatoPetCopy();
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
        if (body.classList.contains('sudo-mode')) setTomatoMode(false, false);
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

    function setTomatoMode(enabled, announce = true) {
        body.classList.toggle('sudo-mode', enabled);
        tomatoPet?.classList.toggle('is-awake', enabled);
        tomatoPet?.setAttribute('aria-hidden', String(!enabled));
        tomatoToggle?.setAttribute('aria-pressed', String(enabled));
        localStorage.setItem('tomatoMode', enabled ? 'on' : 'off');
        if (enabled && tomatoPetStatus) {
            tomatoPetStatus.textContent = currentLanguage === 'zh' ? '你好，小小世界。' : 'hello, tiny world.';
        }
        updateTomatoPetCopy();
        if (announce) {
            showNotice(enabled
                ? (currentLanguage === 'zh' ? '> 番茄宠物已上线 · 点击和它互动' : '> TOMATO PET ONLINE · click to pet')
                : (currentLanguage === 'zh' ? '> 番茄宠物已休息' : '> TOMATO PET IS RESTING'));
        }
    }

    function updateTomatoPetCopy() {
        const enabled = body.classList.contains('sudo-mode');
        if (tomatoToggle) {
            tomatoToggle.setAttribute(
                'aria-label',
                currentLanguage === 'zh'
                    ? (enabled ? '让番茄宠物休息' : '唤醒番茄宠物')
                    : (enabled ? 'Put tomato pet away' : 'Wake tomato pet')
            );
            tomatoToggle.title = currentLanguage === 'zh'
                ? (enabled ? '让番茄休息' : '唤醒番茄')
                : (enabled ? 'Put tomato to sleep' : 'Wake tomato pet');
        }

        tomatoPet?.setAttribute('aria-label', currentLanguage === 'zh' ? '番茄宠物' : 'Tomato pet');
        tomatoPetButton?.setAttribute('aria-label', currentLanguage === 'zh' ? '摸摸番茄' : 'Pet the tomato');
        if (tomatoPetClose) {
            const closeLabel = currentLanguage === 'zh' ? '让番茄宠物休息' : 'Put tomato pet away';
            tomatoPetClose.setAttribute('aria-label', closeLabel);
            tomatoPetClose.title = closeLabel;
        }
        if (tomatoPetFriendship) {
            tomatoPetFriendship.textContent = `${currentLanguage === 'zh' ? '亲密度' : 'FRIENDSHIP'} ${String(tomatoPetCount).padStart(2, '0')}`;
        }
    }

    function petTomato() {
        if (!tomatoPetButton || !tomatoPetStatus) return;

        tomatoPetCount = Math.min(tomatoPetCount + 1, 99);
        localStorage.setItem('tomatoPetPats', String(tomatoPetCount));
        updateTomatoPetCopy();

        const messages = currentLanguage === 'zh'
            ? ['光合作用 +1', '传感器显示：开心', '模型置信度：熟透了', '小世界，大番茄', '谢谢你，人类。']
            : ['photosynthesis +1', 'sensor says: happy', 'model confidence: ripe', 'tiny world, big tomato', 'thank you, human.'];
        tomatoPetStatus.textContent = messages[(tomatoPetCount - 1) % messages.length];

        window.clearTimeout(tomatoPetTimer);
        tomatoPetButton.classList.remove('is-petted');
        void tomatoPetButton.offsetWidth;
        tomatoPetButton.classList.add('is-petted');
        tomatoPetTimer = window.setTimeout(() => tomatoPetButton.classList.remove('is-petted'), 380);
    }

    tomatoToggle?.addEventListener('click', () => {
        setTomatoMode(!body.classList.contains('sudo-mode'));
    });

    tomatoPetButton?.addEventListener('click', petTomato);
    tomatoPetClose?.addEventListener('click', () => setTomatoMode(false));

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

    setTomatoMode(localStorage.getItem('tomatoMode') === 'on', false);
    applyLanguage(currentLanguage);
    updateScrollUI();
})();
