import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../native/environment.js', import.meta.url), 'utf8');

function boot(hash) {
  const events = new Map();
  const classes = new Set();
  const replacements = [];
  const state = { phloem: 'reader', page: 3 };
  const location = { hash, pathname: '/index.html', search: '?preview=1' };
  const window = {
    location,
    history: {
      state,
      replaceState(nextState, title, url) {
        replacements.push({ state: nextState, title, url });
        location.hash = '';
      }
    },
    addEventListener(name, handler, capture) { events.set(name, { handler, capture }); }
  };
  const noStorage = () => { throw new Error('The native environment must not touch saved data'); };
  Object.defineProperty(window, 'localStorage', { get: noStorage });
  Object.defineProperty(window, 'sessionStorage', { get: noStorage });
  const document = { documentElement: { classList: { add: value => classes.add(value) } } };
  vm.runInNewContext(source, { window, document });
  return { window, events, classes, replacements, state };
}

test('credential links are rejected before reader startup without changing the library', () => {
  for (const prefix of ['phloem-setup', 'carrel-setup', 'margin-setup', 'phloem-ai-pass']) {
    const app = boot('#' + prefix + '=private-payload');
    assert.equal(app.window.PHLOEM_NATIVE, true);
    assert.equal(app.window.PHLOEM_NATIVE_BLOCKED_SETUP, true);
    assert.equal(app.window.location.hash, '');
    assert.deepEqual(app.replacements, [{ state: app.state, title: '', url: '/index.html?preview=1' }]);
    assert.equal(app.classes.has('phloem-native'), true);
  }
});

test('review sharing and ordinary navigation hashes remain available', () => {
  for (const hash of ['', '#page=5', '#phloem-review=review-payload']) {
    const app = boot(hash);
    assert.equal(app.window.location.hash, hash);
    assert.equal(app.replacements.length, 0);
    assert.equal(app.window.PHLOEM_NATIVE_BLOCKED_SETUP, undefined);
  }
});

test('later credential hashes are blocked before the shared reader handles them', () => {
  const app = boot('');
  const listener = app.events.get('hashchange');
  assert.equal(listener.capture, true);
  for (const prefix of ['phloem-setup', 'carrel-setup', 'margin-setup', 'phloem-ai-pass']) {
    app.window.location.hash = '#' + prefix + '=private-payload';
    let stopped = false;
    listener.handler({ stopImmediatePropagation() { stopped = true; } });
    assert.equal(stopped, true);
    assert.equal(app.window.location.hash, '');
  }
  assert.equal(app.replacements.length, 4);

  app.window.location.hash = '#phloem-review=review-payload';
  listener.handler({ stopImmediatePropagation() { assert.fail('Review hashes must remain available'); } });
  assert.equal(app.window.location.hash, '#phloem-review=review-payload');
});
