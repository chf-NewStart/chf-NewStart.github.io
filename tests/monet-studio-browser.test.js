/* Monet studio, end to end: the real /monet/ page and the real Worker (fake
   D1 and fake OpenAI behind it). A visitor picks a photo, watches partial
   images arrive, downloads the painting, compares it with the photo, switches
   language, meets the daily limit, and on a phone nothing overflows. Without
   a Worker URL the page keeps the personal request flow. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { ROOT, WORKER, createD1, sseResponse, paintingEvents } = require('./monet-studio-support.js');

const PORT = +(process.env.MONET_STUDIO_PORT || 8417);
const SHOTS = process.env.MONET_STUDIO_SHOTS || '';
const ORIGIN = `http://localhost:${PORT}`;
const SKILL = 'https://skill.test/';
const PHOTO = path.join(ROOT, 'assets/monet-light-strokes/original-water-duck.jpg');
const base64 = (file) => fs.readFileSync(path.join(ROOT, 'assets/monet-light-strokes', file)).toString('base64');
const PARTIALS = [base64('original-water-duck.jpg'), base64('water-duck-approved.jpg')];
const FINAL = base64('water-duck-approved.jpg');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const openaiRequests = [];
let openai = () => sseResponse(paintingEvents(PARTIALS, FINAL, 250));
let withEndpoint = true;
let worker;
const env = {
  ALLOWED_ORIGINS: ORIGIN,
  OPENAI_API_KEY: 'sk-test',
  OPENAI_IMAGE_MODEL: 'gpt-image-2',
  DAILY_LIMIT_PER_VISITOR: '2',
  DAILY_LIMIT_TOTAL: '25',
  SKILL_BASE_URL: SKILL,
  DB: createD1()
};

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  if (String(url).startsWith(SKILL)) return new Response('# skill');
  if (String(url) === 'https://api.openai.com/v1/responses') {
    const body = JSON.parse(init.body);
    openaiRequests.push(body);
    return openai(body);
  }
  return realFetch(url, init);
};

// /__studio stands in for the deployed Worker, on the page's own origin so the
// page's real Content-Security-Policy still applies.
async function bridge(request, response, subpath) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const headers = new Headers({ Origin: request.headers.origin || ORIGIN, 'CF-Connecting-IP': '198.51.100.4' });
  if (request.headers['content-type']) headers.set('Content-Type', request.headers['content-type']);
  const result = await worker.default.fetch(new Request(`https://monet-studio.test${subpath}`, {
    method: request.method,
    headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined
  }), env);
  response.writeHead(result.status, Object.fromEntries(result.headers));
  if (!result.body) return response.end();
  for await (const chunk of result.body) response.write(chunk);
  response.end();
}

const server = http.createServer((request, response) => {
  const url = decodeURIComponent(request.url.split('?')[0]);
  if (url.startsWith('/__studio')) {
    bridge(request, response, url.slice('/__studio'.length) || '/').catch((error) => {
      console.error(error);
      response.destroy();
    });
    return;
  }
  const file = path.join(ROOT, url.endsWith('/') ? `${url}index.html` : url);
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    if (url === '/monet/' && withEndpoint) data = Buffer.from(String(data).replace('data-endpoint=""', 'data-endpoint="/__studio"'));
    response.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
    response.end(data);
  });
});

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

const visible = (page, selector) => page.locator(selector).isVisible();

async function choosePhoto(page) {
  await page.locator('[data-studio-file]').setInputFiles(PHOTO);
  await page.locator('[data-studio-start]').waitFor({ state: 'visible' });
}

async function run() {
  worker = await import(pathToFileURL(WORKER).href);
  await new Promise((resolve) => server.listen(PORT, resolve));
  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      // The refusal and the daily limit below are expected 422/429 responses.
      if (message.type() === 'error' && !/status of (422|429)/.test(message.text())) errors.push(message.text());
    });
    await page.goto(`${ORIGIN}/monet/`, { waitUntil: 'networkidle' });

    // The studio replaces the Dropbox CTA; the personal route stays one link away.
    assert.ok(await visible(page, '[data-studio-open]'), 'Paint my photo is offered');
    assert.ok(!(await visible(page, '[data-personal-entry]')), 'the Dropbox CTA steps back');
    assert.ok(await visible(page, '[data-personal-link]'), 'personal request link remains');

    await page.click('[data-studio-open]');
    assert.ok(await page.locator('#monetStudio').evaluate((dialog) => dialog.open), 'dialog opens');
    await page.waitForFunction(() => document.querySelector('[data-studio-left]').textContent.includes('2 paintings left'));
    await shot(page, 'studio-1-pick');

    await choosePhoto(page);
    const photo = await page.locator('[data-studio-photo]').evaluate((image) => ({ src: image.src, width: image.naturalWidth, height: image.naturalHeight }));
    assert.match(photo.src, /^blob:/);
    assert.ok(photo.width <= 1536 && photo.height <= 1536 && photo.width > 0, `photo is downscaled: ${photo.width}x${photo.height}`);
    assert.ok(!(await visible(page, '[data-studio-drop]')), 'drop zone gives way to the photo');
    await shot(page, 'studio-2-ready');

    await page.click('[data-studio-start]');
    await page.waitForFunction(() => document.querySelector('[data-studio-painting]').classList.contains('is-visible'));
    assert.match(await page.locator('[data-studio-stage]').textContent(), /(Underpainting|Broken color) · 0:\d\d/);
    assert.ok(await page.locator('#monetStudio').evaluate((dialog) => dialog.classList.contains('is-painting')));
    await shot(page, 'studio-3-painting');

    await page.locator('[data-studio-download]').waitFor({ state: 'visible', timeout: 15000 });
    const done = await page.evaluate(() => {
      const painting = document.querySelector('[data-studio-painting]');
      const download = document.querySelector('[data-studio-download]');
      return { src: painting.src, width: painting.naturalWidth, alt: painting.alt, href: download.href, name: download.download, status: document.querySelector('[data-studio-status]').textContent, left: document.querySelector('[data-studio-left]').textContent };
    });
    assert.match(done.src, /^blob:/);
    assert.ok(done.width > 0, 'final painting decodes');
    assert.equal(done.href, done.src);
    assert.equal(done.name, 'original-water-duck-monet-light-strokes.jpg');
    assert.match(done.alt, /Monet Light Strokes/);
    assert.match(done.status, /Finished/);
    assert.match(done.left, /1 painting left/);
    await shot(page, 'studio-4-done');

    // What the Worker sent to OpenAI: the downscaled JPEG and a matching canvas.
    assert.equal(openaiRequests.length, 1);
    const [sent] = openaiRequests;
    const image = sent.input[0].content[1].image_url;
    assert.match(image, /^data:image\/jpeg;base64,/);
    const [canvasWidth, canvasHeight] = sent.tools[0].size.split('x').map(Number);
    assert.ok(Math.abs(canvasWidth / canvasHeight - photo.width / photo.height) < 0.03, `${sent.tools[0].size} matches ${photo.width}x${photo.height}`);

    // Compare with the original photo.
    await page.click('[data-studio-compare]');
    assert.equal(await page.locator('[data-studio-compare]').getAttribute('aria-pressed'), 'true');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-studio-photo]')).opacity === '1');
    assert.equal(await page.locator('[data-studio-compare]').textContent(), 'Show the painting');
    await page.click('[data-studio-compare]');

    // Language follows the site toggle, including the dynamic controls.
    await page.evaluate(() => document.getElementById('languageToggle').click());
    assert.equal(await page.locator('[data-studio-download]').textContent(), '下载画作');
    assert.match(await page.locator('[data-studio-status]').textContent(), /完成/);
    await page.evaluate(() => document.getElementById('languageToggle').click());
    assert.equal(await page.locator('[data-studio-download]').textContent(), 'Download painting');

    // A refusal from OpenAI's safety system is explained and costs no turn.
    openai = () => new Response(JSON.stringify({ error: { code: 'moderation_blocked', message: 'rejected by the safety system' } }), { status: 400 });
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-studio-again]')]);
    await chooser.setFiles(PHOTO);
    await page.locator('[data-studio-start]').waitFor({ state: 'visible' });
    assert.ok(!(await visible(page, '[data-studio-download]')), 'a new photo clears the old painting');
    await page.click('[data-studio-start]');
    await page.waitForFunction(() => document.querySelector('[data-studio-status]').classList.contains('is-error'));
    assert.match(await page.locator('[data-studio-status]').textContent(), /safety check/);
    assert.ok(await visible(page, '[data-studio-personal]'), 'personal route offered after an error');
    assert.ok(!(await visible(page, '[data-studio-retry]')), 'a blocked photo is not retried as is');

    // A failure mid-stream can be retried.
    openai = () => sseResponse([[{ type: 'response.created', response: {} }], [{ type: 'response.failed', response: { error: { code: 'server_error', message: 'boom' } } }, 100]]);
    await choosePhoto(page);
    await page.click('[data-studio-start]');
    await page.waitForFunction(() => document.querySelector('[data-studio-status]').classList.contains('is-error'));
    assert.match(await page.locator('[data-studio-status]').textContent(), /couldn’t finish/);
    assert.ok(await visible(page, '[data-studio-retry]'), 'retry offered');

    // Second real painting uses the last turn; the next is turned away kindly.
    openai = () => sseResponse(paintingEvents(PARTIALS, FINAL));
    await page.click('[data-studio-retry]');
    await page.locator('[data-studio-download]').waitFor({ state: 'visible', timeout: 15000 });
    await choosePhoto(page);
    await page.click('[data-studio-start]');
    await page.waitForFunction(() => document.querySelector('[data-studio-status]').classList.contains('is-error'));
    assert.match(await page.locator('[data-studio-status]').textContent(), /used up/);
    assert.ok(await visible(page, '[data-studio-personal]'));
    assert.ok(!(await visible(page, '[data-studio-retry]')), 'no retry once the limit is reached');
    await shot(page, 'studio-5-limit');

    // Escape closes the dialog and returns to the salon.
    await page.keyboard.press('Escape');
    assert.ok(!(await page.locator('#monetStudio').evaluate((dialog) => dialog.open)));
    await page.close();

    // Phone: the dialog fits the screen with no sideways scroll.
    env.DB = createD1();
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    phone.on('pageerror', (error) => errors.push(error.message));
    await phone.goto(`${ORIGIN}/monet/#studio`, { waitUntil: 'networkidle' });
    assert.ok(await phone.locator('#monetStudio').evaluate((dialog) => dialog.open), '#studio opens the studio');
    await shot(phone, 'studio-6-phone-pick');
    await choosePhoto(phone);
    const fit = await phone.evaluate(() => {
      const dialog = document.getElementById('monetStudio');
      const box = dialog.getBoundingClientRect();
      const frame = document.querySelector('.monet-studio-frame').getBoundingClientRect();
      return { left: box.left, right: box.right, scroll: dialog.scrollWidth - dialog.clientWidth, frameRight: frame.right, page: document.documentElement.scrollWidth - innerWidth };
    });
    assert.ok(fit.left >= 8 && fit.right <= 390 - 8, `dialog inside the screen: ${fit.left}-${fit.right}`);
    assert.ok(fit.scroll <= 0 && fit.page <= 0, `no horizontal scroll: ${JSON.stringify(fit)}`);
    assert.ok(fit.frameRight <= fit.right, 'frame stays inside the dialog');
    await shot(phone, 'studio-7-phone-ready');
    await phone.close();

    // No Worker configured: the page is exactly the personal request flow.
    withEndpoint = false;
    const plain = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    plain.on('pageerror', (error) => errors.push(error.message));
    await plain.goto(`${ORIGIN}/monet/`, { waitUntil: 'networkidle' });
    assert.ok(await visible(plain, '[data-personal-entry]'), 'Dropbox CTA shown');
    assert.ok(!(await visible(plain, '[data-studio-entry]')), 'studio hidden without a Worker');
    assert.ok(!(await visible(plain, '[data-personal-link]')));
    await plain.close();

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
    globalThis.fetch = realFetch;
  }
}

run().then(() => console.log('monet studio browser: all checks passed'), (error) => {
  console.error(error);
  process.exit(1);
});
