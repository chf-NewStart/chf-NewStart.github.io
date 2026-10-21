/* Google is blocked in mainland China, where its requests hang rather than fail. Drive
   sync holds the sync queue while it runs, so Google's script and the first Drive call
   must give up on their own, say why, and keep background syncs off Drive for a while.
   Runs the real functions from reading.js with a fetch and a script tag that never answer. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'reading.js'), 'utf8');
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `section exists: ${start}`);
  return source.slice(from, to);
}
function harness({ answer } = {}) {
  let clock = 1_000_000;
  const timers = [];
  const context = vm.createContext({
    AbortController, Error, Promise,
    window: {}, gdriveToken: 'token', gdriveSaveAuth() {},
    now: () => clock,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].fn = null; },
    document: { createElement: () => ({}), head: { appendChild() {} } },
    fetch: (url, options) => answer ? Promise.resolve(answer) : new Promise((resolve, reject) => {
      if (options && options.signal) options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })
  });
  vm.runInContext(section('  /* Google is blocked in mainland China', '  var gdriveTokenSettle'), context);
  vm.runInContext(section('  async function gdriveListAll(', '  /* Original PDFs'), context);
  return {
    context, timers,
    fire: () => timers.splice(0).forEach(t => t.fn && t.fn()),
    advance: ms => { clock += ms; }
  };
}

test('a Drive listing that never answers gives up after 20 s and names China', async () => {
  const h = harness();
  const listing = h.context.gdriveListAll('token');
  assert.equal(h.timers[0].ms, 20000);
  h.fire();
  await assert.rejects(listing, /blocked in mainland China/);
  assert.ok(h.context.gdriveQuietUntil >= 1_000_000 + 10 * 60 * 1000, 'background syncs leave Drive alone for ten minutes');
});

test('Google’s sign-in script that never loads gives up after 20 s', async () => {
  const h = harness();
  const loading = h.context.loadGis();
  assert.equal(h.timers[0].ms, 20000);
  h.fire();
  await assert.rejects(loading, /blocked in mainland China/);
  assert.ok(h.context.gdriveQuietUntil > 1_000_000);
});

test('a Drive that answers clears the quiet period', async () => {
  const h = harness({ answer: { status: 200, ok: true, json: async () => ({ files: [{ id: 'a', name: 'carrel-library.json' }] }) } });
  h.context.gdriveQuietUntil = 5_000_000;
  const files = await h.context.gdriveListAll('token');
  assert.equal(files.length, 1);
  assert.equal(h.context.gdriveQuietUntil, 0);
});

test('background syncs skip Drive during the quiet period; a tap still tries', () => {
  const guard = source.match(/async function gdriveSync\(interactive,retried\)\{\s*if\(!gdriveOn\(\)\)return;(if\(!interactive&&gdriveQuietUntil>now\(\)\)return;)/);
  assert.ok(guard, 'gdriveSync returns early only for non-interactive calls during the quiet period');
});
