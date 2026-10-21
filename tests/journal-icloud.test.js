/* iCloud sync in the journal (journal.html), and its China readiness. A fake CloudKit JS
   stands in for Apple's script; its records live in localStorage so they survive the
   trip to "Apple" and back. The sign-in goes the real way round: the journal leaves a
   note, Apple's callback lands on reading.html, and reading.html hands the session on to
   the journal. Checks that iCloud only ever holds ciphertext, that pages from another
   device merge in, that a wrong passphrase changes nothing, that a conflict retries,
   and that the page asks nothing of Google. Run with PHLOEM_BROWSER=chromium or webkit. */
const fs = require('fs'), http = require('http'), path = require('path');
let playwright; try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const ROOT = path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
const PORT = +(process.env.JOURNAL_ICLOUD_TEST_PORT || 8193);

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  if (pathname.startsWith('/__ck/')) { res.writeHead(404); res.end(); return; }
  const file = path.join(ROOT, pathname === '/' ? 'journal.html' : pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript'
      : file.endsWith('.css') ? 'text/css' : file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}

/* Runs in every page before its scripts. */
function fakeCloudKit() {
  window.JOURNAL_CLOUDKIT_CONFIG = { apiToken: 'test-token' };
  window.PHLOEM_CLOUDKIT_CONFIG = { apiToken: 'test-token' };
  const KEY = '__ckFake';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { records: {}, tag: 0 }; } catch (e) { return { records: {}, tag: 0 }; } };
  const save = s => localStorage.setItem(KEY, JSON.stringify(s));
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    const m = url && url.match(/\/__ck\/([^/?]+)$/);
    if (m) {
      const record = load().records[m[1]];
      return Promise.resolve(record ? new Response(record.fields.payload.text) : new Response('', { status: 404 }));
    }
    return realFetch(input, init);
  };
  const out = record => ({
    recordType: record.recordType, recordName: record.recordName, recordChangeTag: record.recordChangeTag,
    fields: Object.assign({}, record.fields, { payload: { value: { downloadURL: location.origin + '/__ck/' + record.recordName, size: record.fields.payload.text.length }, type: 'ASSETID' } })
  });
  let configured = null;
  const container = {
    privateCloudDatabase: {
      async fetchRecords(names) {
        const s = load(), records = [], errors = [];
        names.forEach(n => s.records[n] ? records.push(out(s.records[n])) : errors.push({ ckErrorCode: 'NOT_FOUND', recordName: n }));
        return { hasErrors: errors.length > 0, errors, records };
      },
      async saveRecords(records) {
        const s = load(), saved = [], errors = [];
        for (const record of records) {
          const existing = s.records[record.recordName];
          if (s.conflictOnce) { delete s.conflictOnce; s.conflicts = (s.conflicts || 0) + 1; errors.push({ ckErrorCode: 'CONFLICT', recordName: record.recordName }); continue; }
          if ((existing && record.recordChangeTag !== existing.recordChangeTag) || (!existing && record.recordChangeTag)) { errors.push({ ckErrorCode: 'CONFLICT', recordName: record.recordName }); continue; }
          const fields = {};
          for (const key of Object.keys(record.fields)) {
            const f = record.fields[key];
            fields[key] = f.value instanceof Blob ? { text: await f.value.text(), type: 'ASSET' } : { value: f.value, type: f.type };
          }
          const kept = { recordType: record.recordType, recordName: record.recordName, recordChangeTag: 'tag-' + (++s.tag), fields };
          s.records[record.recordName] = kept;
          s.saves = (s.saves || 0) + 1;
          saved.push(out(kept));
        }
        save(s);
        return { hasErrors: errors.length > 0, errors, records: saved };
      }
    },
    _auth: { _signInURL: location.origin + '/reading.html?ckWebAuthToken=apple%2Bsession&ckSession=apple%2Bsession' },
    async setUpAuth() {
      const store = configured && configured.services && configured.services.authTokenStore;
      const token = store && store.getToken(configured.containers[0].containerIdentifier);
      return token && !load().refuse ? { userRecordName: '_tester' } : null;
    },
    fetchCurrentUserIdentity() { return Promise.reject({ ckErrorCode: 'AUTHENTICATION_REQUIRED' }); }
  };
  window.CloudKit = {
    configure(config) {
      configured = config;
      const s = load(); s.configured = { id: config.containers[0].containerIdentifier, env: config.containers[0].environment, token: config.containers[0].apiTokenAuth.apiToken, hasStore: !!(config.services && config.services.authTokenStore) }; save(s);
      /* like CloudKit JS: a returned session goes into the token store */
      const back = config.containers[0].apiTokenAuth.ckWebAuthToken;
      if (back && config.services && config.services.authTokenStore) config.services.authTokenStore.putToken(config.containers[0].containerIdentifier, back);
    },
    getDefaultContainer() { return container; }
  };
}

/* the journal's own format: PBKDF2 → AES-GCM, as journal.html writes it */
async function encryptLike(page, pass, obj) {
  return page.evaluate(async ({ pass, obj }) => {
    const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return JSON.stringify({ v: 1, salt: b64(salt), iv: b64(iv), data: b64(ct) });
  }, { pass, obj });
}
async function decryptLike(page, pass, text) {
  return page.evaluate(async ({ pass, text }) => {
    const un = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)), p = JSON.parse(text);
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: un(p.salt), iterations: 310000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: un(p.iv) }, key, un(p.data))));
  }, { pass, text });
}
const fake = page => page.evaluate(() => JSON.parse(localStorage.getItem('__ckFake') || '{}'));
const status = page => page.textContent('#icloudState');
async function waitStatus(page, pattern) {
  await page.waitForFunction(p => new RegExp(p).test(document.getElementById('icloudState').textContent), pattern.source, { timeout: 20000 })
    .catch(async error => { console.log('icloud status:', await status(page)); throw error; });
}

(async () => {
  await new Promise(resolve => server.listen(PORT, resolve));
  const browser = await playwright[ENGINE].launch({ headless: true });
  const base = 'http://localhost:' + PORT;
  const today = new Date(), pad = n => String(n).padStart(2, '0');
  const todayKey = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
  const outside = [];

  async function newPage(withFake) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: 'block' });
    if (withFake) await context.addInitScript(fakeCloudKit);
    /* nothing leaves localhost: Google, Apple and the weather are all out of reach */
    await context.route(/^https?:\/\/(?!localhost)/, route => { outside.push(route.request().url()); route.abort(); });
    const page = await context.newPage();
    page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    page.setDefaultTimeout(15000);
    return { context, page };
  }

  /* 1. Without a token: no iCloud button, and nothing asked of Google. */
  {
    const { context, page } = await newPage(false);
    await page.goto(base + '/journal.html', { waitUntil: 'load' });
    check('without an API token the journal offers no iCloud button', await page.evaluate(() => document.getElementById('icloudSetupBtn').classList.contains('hidden')));
    const google = outside.filter(u => /google|gstatic/.test(u));
    check('the journal asks nothing of Google (fonts are served from houfu72.com)', google.length === 0, google.join(' '));
    const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/"/g, '')); });
    check('Caveat and the journal’s own hand load locally', fonts.includes('Caveat') && fonts.includes('Houfu Hand'), fonts.join(','));
    await page.fill('#page', '你好，今天在上海。');
    await page.waitForTimeout(200);
    const cang = await page.evaluate(async () => { await document.fonts.load('16px "Long Cang"', '你好'); return [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Long Cang' && f.status === 'loaded'); });
    check('Chinese writing gets Long Cang from houfu72.com', cang);
    check('no page errors without a token', page.errors.length === 0, page.errors.join(' | '));
    await context.close();
  }

  /* 2. Turning iCloud on: Apple's sign-in, back through reading.html, first sync. */
  const { context, page } = await newPage(true);
  await page.goto(base + '/journal.html', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'load' });
  await page.fill('#page', 'A quiet morning. The tea was too hot.');
  await page.waitForTimeout(600);
  check('with a token the journal offers iCloud', await page.isVisible('#icloudSetupBtn'));
  await page.click('#icloudSetupBtn');
  await page.fill('#icloudPass', 'correct horse battery');
  await Promise.all([page.waitForURL(/reading\.html/, { waitUntil: 'commit' }), page.click('#icloudSaveBtn')]);
  await page.waitForURL(/journal\.html/, { waitUntil: 'load' });
  await waitStatus(page, /✓ synced/);
  const back = await page.evaluate(() => ({ url: location.href, session: JSON.parse(localStorage.getItem('phloem.icloudWebSession.v1') || '{}'), note: localStorage.getItem('houfu.icloudReturn.v1') }));
  check('Apple’s answer comes back to the journal by way of reading.html', /\/journal\.html$/.test(back.url), back.url);
  check('the session is wiped from the address bar', !/ck(WebAuthToken|Session)/.test(back.url), back.url);
  check('the session keeps its "+" and is shared with Phloem', back.session['iCloud.com.houfu72.phloem'] === 'apple+session', JSON.stringify(back.session));
  check('the hand-off note is used once and removed', back.note === null);
  let cloud = await fake(page);
  check('CloudKit is set up for Phloem’s container in production with a localStorage session',
    cloud.configured && cloud.configured.id === 'iCloud.com.houfu72.phloem' && cloud.configured.env === 'production' && cloud.configured.hasStore, JSON.stringify(cloud.configured));
  const rec = cloud.records && cloud.records['journal-v1'];
  check('the journal is saved as journal-v1 of the PhloemLibrary type, beside Phloem’s library-v1',
    rec && rec.recordType === 'PhloemLibrary' && rec.fields.formatVersion.type === 'INT64' && rec.fields.updatedAt.type === 'TIMESTAMP', rec && rec.recordType);
  check('iCloud holds only ciphertext', rec && !/tea|morning/.test(rec.fields.payload.text) && /"iv"/.test(rec.fields.payload.text));
  const opened = rec && await decryptLike(page, 'correct horse battery', rec.fields.payload.text);
  check('the ciphertext opens with the passphrase and holds today’s page', opened && opened.entries[todayKey] && /tea was too hot/.test(opened.entries[todayKey].text), opened && Object.keys(opened.entries).join(','));
  check('the sync line names iCloud and the cloud by the date shows ✓', /iCloud ✓ synced/.test(await status(page)) && (await page.textContent('#syncSig')) === '☁ ✓', await page.textContent('#syncSig'));

  /* 3. Another device wrote a page for another day: it merges in, and both go up. */
  const other = await encryptLike(page, 'correct horse battery', { entries: { '2026-09-30': { text: 'Written on the iPhone in Shanghai.', updated: 1 } }, held: [], wx: {}, memory: {} });
  await page.evaluate(text => { const s = JSON.parse(localStorage.getItem('__ckFake')); const r = s.records['journal-v1']; r.fields.payload.text = text; r.recordChangeTag = 'tag-other'; localStorage.setItem('__ckFake', JSON.stringify(s)); }, other);
  await page.click('#syncSig');
  await waitStatus(page, /✓ synced/);
  await page.waitForFunction(() => /Shanghai/.test(localStorage.getItem('journalIntime.v1')));
  cloud = await fake(page);
  const merged = await decryptLike(page, 'correct horse battery', cloud.records['journal-v1'].fields.payload.text);
  check('a page from another device merges into this browser', await page.evaluate(() => !!JSON.parse(localStorage.getItem('journalIntime.v1')).entries['2026-09-30']));
  check('the iCloud copy then holds both devices’ pages', merged.entries['2026-09-30'] && merged.entries[todayKey], Object.keys(merged.entries).join(','));

  /* 4. Nothing new: a sync reads its own upload and sends nothing. */
  const savesBefore = cloud.saves;
  await page.click('#syncSig');
  await waitStatus(page, /✓ synced/);
  check('a sync with nothing new uploads nothing', (await fake(page)).saves === savesBefore, (await fake(page)).saves + ' vs ' + savesBefore);

  /* 5. Another device saved first: CloudKit answers CONFLICT, the journal merges and retries. */
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('__ckFake')); s.conflictOnce = true; localStorage.setItem('__ckFake', JSON.stringify(s)); });
  await page.fill('#page', 'A quiet morning. The tea was too hot. Then rain.');
  await page.click('#syncSig');
  await waitStatus(page, /✓ synced/);
  cloud = await fake(page);
  const afterConflict = await decryptLike(page, 'correct horse battery', cloud.records['journal-v1'].fields.payload.text);
  check('a conflict is retried and the newest words reach iCloud', cloud.conflicts === 1 && /Then rain/.test(afterConflict.entries[todayKey].text), cloud.conflicts);

  /* 6. A copy made with another passphrase is left alone. */
  const foreign = await encryptLike(page, 'some other passphrase', { entries: { '2026-01-01': { text: 'not yours', updated: 1 } }, held: [], wx: {}, memory: {} });
  await page.evaluate(text => { const s = JSON.parse(localStorage.getItem('__ckFake')); s.records['journal-v1'].fields.payload.text = text; s.records['journal-v1'].recordChangeTag = 'tag-foreign'; localStorage.setItem('__ckFake', JSON.stringify(s)); }, foreign);
  await page.click('#syncSig');
  await waitStatus(page, /could not decrypt/);
  cloud = await fake(page);
  check('a wrong passphrase changes nothing in iCloud and says so', cloud.records['journal-v1'].fields.payload.text === foreign && (await page.textContent('#syncSig')) === '☁ !');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('__ckFake')); delete s.records['journal-v1']; localStorage.setItem('__ckFake', JSON.stringify(s)); });

  /* 7. Signed out (Apple let the session lapse): a sign-in button, not a silent failure. */
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('__ckFake')); s.refuse = true; localStorage.setItem('__ckFake', JSON.stringify(s)); });
  await page.click('#syncSig');
  await waitStatus(page, /signed out/);
  check('a lapsed session shows “sign in to iCloud”', await page.isVisible('#icloudSignInBtn'));
  check('no page errors in the journal', page.errors.length === 0, page.errors.join(' | '));
  await context.close();

  /* 8. reading.html passes a sign-in on only when the journal asked for it, recently. */
  for (const [label, note, expectJournal] of [
    ['a fresh note sends Apple’s answer on to the journal', { path: '/journal.html', at: 'now' }, true],
    ['without a note Phloem keeps its own sign-in', null, false],
    ['a note older than 15 minutes is ignored', { path: '/journal.html', at: 'old' }, false],
    ['a note naming any other page is ignored', { path: '//evil.example/', at: 'now' }, false]
  ]) {
    const { context: ctx, page: p } = await newPage(false);
    await p.goto(base + '/journal.html', { waitUntil: 'load' });
    await p.evaluate(n => { localStorage.clear(); if (n) localStorage.setItem('houfu.icloudReturn.v1', JSON.stringify({ path: n.path, at: n.at === 'now' ? Date.now() : Date.now() - 16 * 60 * 1000 })); }, note);
    await p.goto(base + '/reading.html?ckWebAuthToken=abc&ckSession=abc', { waitUntil: 'commit' }).catch(() => {});
    if (expectJournal) await p.waitForURL(/journal\.html/, { waitUntil: 'load' }).catch(() => {});
    else await p.waitForLoadState('load');
    await p.waitForTimeout(300);
    const url = p.url();
    check('reading.html: ' + label, expectJournal ? /\/journal\.html/.test(url) : /\/reading\.html/.test(url), url);
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(failures ? failures + ' FAILED' : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); server.close(); process.exit(1); });
