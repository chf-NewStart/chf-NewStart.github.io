// Run with: node --test tests/homepage.test.js
// Optional: HOMEPAGE_SCREENSHOTS=/absolute/path to save the responsive previews.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('playwright-core')); }

const root = path.resolve(__dirname, '..');
const renderer = `(() => {
    let frame;
    window.backgroundDraws = 0;
    window.backgroundStarts = 0;
    window.BIO_BG = {
        isSupported: () => true,
        start() {
            window.backgroundStarts++;
            document.getElementById('bioBg').hidden = false;
            const draw = () => { window.backgroundDraws++; frame = requestAnimationFrame(draw); };
            draw();
        },
        stop() { cancelAnimationFrame(frame); document.getElementById('bioBg').hidden = true; }
    };
})();`;

test('calm homepage, optional rendering, and responsive navigation', async (t) => {
    const server = http.createServer(async (req, res) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        try {
            const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png' };
            const content = await fs.readFile(file);
            res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
            res.end(content);
        } catch { res.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const base = `http://127.0.0.1:${server.address().port}`;
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let backgroundRequests = 0;
    await page.route('**/bio-bg.js', route => { backgroundRequests++; return route.fulfill({ contentType: 'text/javascript', body: renderer }); });

    await t.test('first visit is quiet and all featured work is visible without tabs', async () => {
        await page.goto(base, { waitUntil: 'networkidle' });
        assert.equal(backgroundRequests, 0, 'no background script is downloaded by default');
        assert.equal(await page.evaluate(() => window.BIO_BG), undefined);
        assert.equal(await page.locator('#bioBg').isVisible(), false);
        assert.equal(await page.locator('#backgroundToggle').getAttribute('aria-pressed'), 'false');
        assert.equal(await page.locator('.home-project').count(), 3);
        assert.equal(await page.locator('[role="tab"]').count(), 0);
        assert.equal(await page.locator('h1').textContent(), 'Houfu Chen');
        for (const img of await page.locator('.home-project img').all()) {
            await img.scrollIntoViewIfNeeded();
            await img.evaluate(el => el.decode());
            assert.ok(await img.evaluate(el => el.naturalWidth > 0));
        }
        assert.deepEqual(errors, []);
        const english = await page.locator('body').textContent();
        await page.locator('#languageToggle').click();
        await page.locator('#languageToggle').click();
        assert.equal(await page.locator('body').textContent(), english, 'English copy round-trips exactly');
    });

    await t.test('background preference survives reload and switching off stops frames', async () => {
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.locator('#backgroundToggle').click();
        await page.waitForFunction(() => window.backgroundDraws > 1);
        assert.equal(await page.locator('#backgroundState').textContent(), 'On');
        assert.equal(backgroundRequests, 1);
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal(await page.locator('#backgroundToggle').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.evaluate(() => window.backgroundStarts), 1);
        await page.locator('#backgroundToggle').click();
        const frames = await page.evaluate(() => window.backgroundDraws);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.evaluate(() => window.backgroundDraws), frames, 'no renderer loop survives the off switch');
        assert.equal(await page.locator('#bioBg').isVisible(), false);
        const requestCount = backgroundRequests;
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal(backgroundRequests, requestCount, 'a saved quiet preference skips the engine on future visits');
    });

    await t.test('language, reduced motion, and disclosure deep links stay usable', async () => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.locator('#backgroundToggle').click();
        await page.waitForFunction(() => document.getElementById('backgroundState').textContent === 'Still');
        await page.locator('#languageToggle').click();
        assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
        assert.equal(await page.locator('#backgroundState').textContent(), '静止');
        assert.equal(await page.locator('h1').textContent(), '陈厚孚');
        await page.locator('#backgroundToggle').click();
        assert.equal(await page.locator('#backgroundState').textContent(), '关');
        await page.locator('#languageToggle').click();
        await page.locator('.home-project-link[href="#research-overview"]').click();
        assert.equal(await page.locator('#research-overview').evaluate(el => el.open), true);
        assert.ok(await page.locator('#proj-twin').isVisible());
        await page.goto(base + '/#exp-tech');
        assert.ok(await page.locator('#exp-tech').isVisible(), 'legacy experience link opens its parent disclosure');
        assert.deepEqual(errors, []);
    });

    await t.test('cancelling a pending load never starts rendering', async () => {
        const p = await context.newPage();
        let release;
        const requested = new Promise(resolve => {
            p.route('**/bio-bg.js', route => { release = () => route.fulfill({ contentType: 'text/javascript', body: renderer }); resolve(); });
        });
        await p.goto(base);
        await p.locator('#backgroundToggle').click();
        await requested;
        await p.locator('#backgroundToggle').click();
        await release();
        await p.waitForFunction(() => !!window.BIO_BG);
        assert.equal(await p.evaluate(() => window.backgroundStarts), 0);
        assert.equal(await p.locator('#backgroundState').textContent(), 'Off');
        await p.close();
    });

    await t.test('unavailable rendering falls back to the usable quiet page', async () => {
        const p = await context.newPage();
        await p.route('**/bio-bg.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.BIO_BG = {isSupported: () => false, stop() {}};' }));
        await p.goto(base);
        await p.locator('#backgroundToggle').click();
        await p.locator('#backgroundNotice').waitFor({ state: 'visible' });
        assert.equal(await p.locator('#backgroundToggle').getAttribute('aria-pressed'), 'false');
        assert.equal(await p.locator('#bioBg').isVisible(), false);
        assert.ok(await p.locator('.home-project').first().isVisible());
        await p.close();
    });

    await t.test('blocked storage does not break language or background controls', async () => {
        const privateContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const p = await privateContext.newPage();
        const privateErrors = [];
        p.on('pageerror', error => privateErrors.push(error.message));
        await p.addInitScript(() => {
            Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
        });
        await p.route('**/bio-bg.js', route => route.fulfill({ contentType: 'text/javascript', body: renderer }));
        await p.goto(base);
        await p.locator('#languageToggle').click();
        assert.equal(await p.locator('h1').textContent(), '陈厚孚');
        await p.locator('#backgroundToggle').click();
        await p.waitForFunction(() => window.backgroundStarts === 1);
        await p.locator('#backgroundToggle').click();
        assert.equal(await p.locator('#bioBg').isVisible(), false);
        assert.deepEqual(privateErrors, []);
        await privateContext.close();
    });

    await t.test('the real leaf engine renders a reduced-motion frame or reports unavailable', async (t) => {
        const p = await context.newPage();
        await p.goto(base);
        await p.locator('#backgroundToggle').click();
        await p.waitForFunction(() => document.querySelector('#bioBg.is-live') || !document.getElementById('backgroundNotice').hidden, { timeout: 30000 });
        if (await p.locator('#backgroundNotice').isVisible()) {
            t.diagnostic('WebGL2 unavailable in this browser; quiet fallback confirmed. Lifecycle covered separately.');
        } else {
            assert.equal(await p.locator('#backgroundState').textContent(), 'Still');
            assert.ok(await p.locator('#bioBg').isVisible());
            t.diagnostic('Real WebGL2 leaf engine produced its static reduced-motion frame.');
            await p.locator('#backgroundToggle').click();
            assert.equal(await p.locator('#bioBg').isVisible(), false);
        }
        await p.close();
    });

    await t.test('phone, tablet, and desktop fit in both languages; mobile menu handles focus', async () => {
        const shots = process.env.HOMEPAGE_SCREENSHOTS;
        if (shots) await fs.mkdir(shots, { recursive: true });
        for (const [name, width, height] of [['desktop', 1440, 1100], ['tablet', 820, 1180], ['mobile', 390, 844], ['narrow', 280, 800]]) {
            await page.setViewportSize({ width, height });
            await page.goto(base, { waitUntil: 'networkidle' });
            for (const language of ['en', 'zh']) {
                if (language === 'zh') {
                    if (width <= 1120) await page.locator('#hamburgerBtn').click();
                    await page.locator('#languageToggle').click();
                    if (width <= 1120) await page.keyboard.press('Escape');
                }
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} ${language} has no horizontal overflow`);
                for (const el of await page.locator('details').all()) await el.evaluate(e => e.open = true);
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} ${language} expanded content fits`);
                for (const el of await page.locator('details').all()) await el.evaluate(e => e.open = false);
                if (shots && language === 'en' && name !== 'narrow') {
                    // Full-page captures do not trigger below-fold lazy images.
                    for (const img of await page.locator('.home-project img').all()) {
                        await img.scrollIntoViewIfNeeded();
                        await img.evaluate(el => el.decode());
                    }
                    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
                    await page.screenshot({ path: path.join(shots, `homepage-${name}.png`), fullPage: true });
                    if (name === 'desktop') await page.screenshot({ path: path.join(shots, 'homepage-desktop-top.png') });
                }
            }
            if (width <= 1120) {
                await page.locator('#hamburgerBtn').click();
                assert.equal(await page.locator('#hamburgerBtn').getAttribute('aria-expanded'), 'true');
                for (let i = 0; i < 12; i++) {
                    await page.keyboard.press('Tab');
                    assert.ok(await page.evaluate(() => document.querySelector('.sticky-nav').contains(document.activeElement)));
                }
                await page.keyboard.press('Escape');
                assert.equal(await page.locator('#hamburgerBtn').getAttribute('aria-expanded'), 'false');
                await page.locator('#hamburgerBtn').click();
            }
            await page.locator('#languageToggle').click(); // English for the next viewport.
            if (width <= 1120) await page.keyboard.press('Escape');
        }
        assert.deepEqual(errors, []);
    });

    await t.test('content and native disclosures remain readable without JavaScript', async () => {
        const noJs = await browser.newContext({ javaScriptEnabled: false });
        const p = await noJs.newPage();
        await p.goto(base);
        assert.ok(await p.locator('h1').isVisible());
        assert.equal(await p.locator('#backgroundToggle').isVisible(), false);
        await p.locator('#research-overview > summary').click();
        assert.ok(await p.locator('#proj-twin').isVisible());
        await noJs.close();
    });
});
