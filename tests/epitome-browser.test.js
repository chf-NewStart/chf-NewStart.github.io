/* Epitome UI prototype, end to end in a real Chromium: the home page over a
   research image, search, a Mature article with its sources and set, a
   comment on a selected passage (behind the demo ORCID sign-in), requesting a
   cold topic by ORCID and by email, the renderer refusing raw HTML, a
   background that fails to load, opening the page as a plain file, and no
   sideways scrolling on a phone. Wikimedia is never contacted: image requests
   are answered with a photo from this repo.
   Run with: node tests/epitome-browser.test.js  (EPITOME_SHOTS=dir saves screenshots) */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = +(process.env.EPITOME_PORT || 8431);
const ORIGIN = `http://localhost:${PORT}`;
const SHOTS = process.env.EPITOME_SHOTS || '';
const PHOTO = fs.readFileSync(path.join(ROOT, 'assets/monet-light-strokes/flooded-trees-approved.jpg'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg' };

const server = http.createServer((req, res) => {
  let file = path.join(ROOT, decodeURIComponent(new URL(req.url, ORIGIN).pathname));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

async function newPage(browser, { images = true, viewport = { width: 1280, height: 860 } } = {}) {
  const context = await browser.newContext({ viewport });
  await context.route(/wikimedia\.org/, (route) => images
    ? route.fulfill({ status: 200, contentType: 'image/jpeg', body: PHOTO })
    : route.abort());
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  return { context, page, problems };
}

const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }); };
const noSidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function selectInBlock(page, blockId, from, to) {
  await page.evaluate(([id, a, b]) => {
    const block = document.getElementById(id);
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
    const range = document.createRange();
    range.setStart(node, a);
    range.setEnd(node, b);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }, [blockId, from, to]);
}

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  try {
    // ---- Home
    const { context, page, problems } = await newPage(browser);
    await page.goto(`${ORIGIN}/epitome/`);
    await page.waitForSelector('.backdrop-img.loaded');
    assert.equal(await page.textContent('h1.title'), 'Epitome');
    assert.equal(await page.getAttribute('label[for="q"]', 'class'), 'vh', 'the search box has a (visually hidden) label');
    await page.waitForSelector('[data-today]:not([hidden])');
    const firstCaption = await page.textContent('[data-today-caption]');
    assert.ok(firstCaption.length > 20);
    assert.match(await page.textContent('.credit'), /Public domain/);
    await page.waitForSelector('[data-recent] .card');
    assert.ok(await page.locator('[data-recent] .cards').first().locator('.card').count() >= 4, 'recently revised articles are listed');
    assert.match(await page.textContent('[data-recent]'), /Sugar metabolism in tomato fruit/);
    await shot(page, 'home');
    await page.click('[data-next-bg]');
    await page.waitForFunction((c) => document.querySelector('[data-today-caption]').textContent !== c, firstCaption);

    // ---- Search → a Mature article
    await page.fill('#q', 'crab');
    await page.press('#q', 'Enter');
    await page.waitForSelector('.page-title');
    assert.match(page.url(), /#\/search\?q=crab$/);
    const results = await page.textContent('#main');
    for (const t of ['The Crab Nebula', 'The Crab Pulsar', 'Records of the supernova of 1054']) assert.ok(results.includes(t), t);
    assert.ok(await page.locator('a.btn', { hasText: 'Request “crab” as a new topic' }).count());
    await page.click('a.card:has-text("The Crab Nebula")');
    await page.waitForSelector('#article-body');
    assert.equal(await page.textContent('.page-title'), 'The Crab Nebula');
    assert.equal(await page.textContent('.article-head .badge'), 'Mature');
    assert.ok(await page.isVisible('.demo-note'), 'demo content is labelled');
    assert.equal(await page.isVisible('#state-explain'), false);
    await page.click('[data-explain]');
    assert.ok(await page.isVisible('#state-explain'));
    await page.waitForSelector('.cluster li');
    assert.equal(await page.locator('.cluster li').count(), 3);
    await page.click('#b1 .cite-link[data-cite="1"]');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'src-1', 'a citation jumps to its source');
    assert.match(page.url(), /#\/topic\/crab-nebula$/, 'following a citation does not change the route');
    await shot(page, 'article');

    // ---- Comment on a selected passage (sign-in first)
    await selectInBlock(page, 'b1', 4, 40);
    await page.waitForSelector('.comment-float:not([hidden])');
    await page.click('.comment-float');
    await page.waitForSelector('#signin-dialog[open]');
    await page.click('#signin-dialog button[value="ok"]');
    await page.waitForSelector('#comment-dialog[open]');
    assert.equal(await page.textContent('[data-cd-quote]'), 'Crab Nebula (Messier 1) is the remna');
    assert.equal(await page.textContent('[data-cd-who]'), '0000-0002-1825-0097');
    await page.check('input[name="kind"][value="unclear"]');
    await page.fill('#cd-text', 'Say which catalogue the M stands for.');
    await page.click('#comment-dialog button[value="send"]');
    await page.waitForSelector('.my-comments li');
    assert.match(await page.textContent('.my-comments'), /Unclear:.*Waiting for review/s);
    assert.ok(await page.isVisible('.bar .account'), 'header shows the signed-in iD');
    await page.reload();
    await page.waitForSelector('.my-comments li');
    assert.equal(await page.locator('.my-comments li').count(), 1, 'the comment survives a reload');

    // ---- A topic nobody has asked for, requested while signed in
    await page.goto(`${ORIGIN}/epitome/#/search?q=${encodeURIComponent('bedbug feeding')}`);
    await page.waitForSelector('.page-title');
    assert.match(await page.textContent('#main'), /No topic matches/);
    await page.click('a.btn');
    await page.waitForSelector('[data-request]');
    assert.match(await page.textContent('.state-line'), /Not requested yet/);
    await page.click('[data-request]');
    await page.waitForSelector('.request-box.done');
    assert.match(page.url(), /#\/topic\/bedbug-feeding$/);
    assert.match(await page.textContent('.request-box.done'), /ORCID account \(0000-0002-1825-0097\)/);
    await page.goto(`${ORIGIN}/epitome/#/search?q=bedbug`);
    await page.waitForSelector('.cards .card');
    assert.match(await page.textContent('.cards'), /bedbug feeding.*Requested by 1 person · including you/s, 'a request becomes a topic others can find');
    await shot(page, 'search');

    // ---- Requesting by email, signed out
    await page.click('[data-signout]');
    await page.goto(`${ORIGIN}/epitome/#/topic/tomato-fruit-sugar-metabolism`);
    await page.waitForSelector('[data-email-request]');
    assert.match(await page.textContent('.state-line'), /Requested by 3 people/);
    assert.equal(await page.textContent('[data-request]'), 'Sign in with ORCID to request it');
    await page.fill('#email', 'reader@example.org');
    await page.click('[data-email-request] button');
    await page.waitForSelector('.request-box.done');
    assert.match(await page.textContent('.state-line'), /Requested by 4 people/);
    assert.match(await page.textContent('.request-box.done'), /by email at reader@example\.org/);
    await shot(page, 'cold');

    // ---- The renderer never emits raw HTML or script links
    const rendered = await page.evaluate(() => window.EpitomeMarkdown.render('<img src=x onerror=alert(1)> [x](javascript:alert(1)) **b** [@1] [@9]', { sourceCount: 1 }));
    assert.ok(!rendered.includes('<img'), rendered);
    assert.ok(!/href="javascript/i.test(rendered), rendered);
    assert.ok(rendered.includes('<strong>b</strong>') && rendered.includes('data-cite="1"') && !rendered.includes('data-cite="9"'), rendered);

    assert.deepEqual(problems, [], 'no script errors or blocked resources');
    await context.close();

    // ---- Every background fails: the page still works, without a stray caption
    const offline = await newPage(browser, { images: false });
    await offline.page.goto(`${ORIGIN}/epitome/`);
    await offline.page.waitForSelector('.backdrop.no-image');
    assert.ok(await offline.page.isVisible('h1.title'));
    assert.equal(await offline.page.isVisible('[data-today]'), false);
    assert.deepEqual(offline.problems.filter((p) => !/ERR_FAILED|Failed to load resource/.test(p)), []);
    await offline.context.close();

    // ---- Opened straight from disk (double-clicking index.html)
    const disk = await newPage(browser);
    await disk.page.goto(pathToFileURL(path.join(ROOT, 'epitome/index.html')).href);
    await disk.page.waitForSelector('[data-recent] .card');
    assert.equal(await disk.page.textContent('h1.title'), 'Epitome');
    await disk.context.close();

    // ---- Phone
    const phone = await newPage(browser, { viewport: { width: 375, height: 760 } });
    await phone.page.goto(`${ORIGIN}/epitome/`);
    await phone.page.waitForSelector('[data-recent] .card');
    assert.ok(await noSidewaysScroll(phone.page), 'home fits a phone');
    await shot(phone.page, 'phone-home');
    await phone.page.goto(`${ORIGIN}/epitome/#/topic/ngc-1300`);
    await phone.page.waitForSelector('#article-body');
    assert.ok(await noSidewaysScroll(phone.page), 'article fits a phone');
    await shot(phone.page, 'phone-article');
    await phone.context.close();

    console.log('epitome-browser: all checks passed');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
