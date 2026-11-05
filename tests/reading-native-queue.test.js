const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const box = vm.createContext({ Promise, Date });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../reading-voice.js'), 'utf8'), box);
const V = box.PhloemVoice;
const tick = () => new Promise(resolve => setImmediate(resolve));

function environment() {
  let listener, failNext = false, value = { sessionId: '', revision: 0, state: 'stopped', index: 0 };
  const calls = [], heard = [], states = [];
  function result() { return { ...value }; }
  const plugin = {
    addListener(name, fn) { assert.equal(name, 'speechProgress'); listener = fn; return Promise.resolve({ remove() {} }); },
    playQueue(options) { calls.push(['playQueue', options]); if(failNext){failNext=false;return Promise.reject(new Error('Queue unavailable'));} value = { ...value, sessionId: options.sessionId, index: options.index, state: 'playing', revision: value.revision + 1 }; return Promise.resolve(result()); },
    cancel() { calls.push(['cancel']); value.state = 'stopped'; value.revision++; return Promise.resolve(result()); },
    pause() { calls.push(['pause']); value.state = 'paused'; value.revision++; return Promise.resolve(result()); },
    resume() { calls.push(['resume']); value.state = 'playing'; value.revision++; return Promise.resolve(result()); },
    seek(options) { calls.push(['seek', options]); value.index = options.index; value.state = options.playing ? 'playing' : 'paused'; value.revision++; return Promise.resolve(result()); },
    setBackground(options) { calls.push(['setBackground', options]); return Promise.resolve(result()); },
    status() { return Promise.resolve(result()); }
  };
  const p = V.createNativePlayer({ plugin, onChunk(c, i) { heard.push(i); }, onState(s) { states.push(s); } });
  return { p, calls, heard, states, failNextLaunch() { failNext = true; },
    nativeAdvance(index, notify = true) { value.index = index; value.revision++; if (notify) listener(result()); },
    stale(status) { listener(status); }, snapshot: result };
}

test('the entire paper is handed to native once; native advances without JS utterance completions', async () => {
  const e = environment();e.p.load([{ text: 'First.' }, { text: 'Second.' }, { text: 'Third.' }], 0);e.p.play();
  await tick();await tick();
  assert.equal(e.calls.filter(c => c[0] === 'playQueue').length, 1);
  assert.equal(e.calls.find(c => c[0] === 'playQueue')[1].texts.length, 3);
  e.nativeAdvance(1);assert.equal(e.p.index(), 1);assert.equal(e.p.state(), 'playing');
  assert.equal(e.calls.filter(c => c[0] === 'playQueue').length, 1, 'no JS request to speak sentence two');
  e.nativeAdvance(2, false);await e.p.sync();assert.equal(e.p.index(), 2, 'foreground status catches up after suspended JS');
  e.stale({ ...e.snapshot(), index: 0, revision: 0 });assert.equal(e.p.index(), 2, 'an old queued event cannot move Find now backwards');
});

test('pause, paused seek and resume preserve the native position and background preference', async () => {
  const e = environment();e.p.load([{ text: 'One.' }, { text: 'Two.' }], 0);e.p.play();await tick();await tick();
  e.p.pause();await tick();assert.equal(e.p.state(), 'paused');
  e.p.seek(1);await tick();assert.equal(e.p.state(), 'paused');assert.equal(e.p.index(), 1);
  await e.p.setBackground(true);assert.equal(e.calls.find(c => c[0] === 'setBackground')[1].enabled, true);
  e.p.play();await tick();assert.equal(e.p.state(), 'playing');assert.equal(e.p.index(), 1);
  const old=e.snapshot();e.p.stop();await tick();e.stale({ ...old, state: 'playing', revision: old.revision + 100 });
  assert.equal(e.p.state(), 'stopped', 'late native callbacks cannot restart stopped speech');
});

test('old app plugins without the queue capability remain compatible', async () => {
  const engine = V.nativeEngine({ voices() { return Promise.resolve({ voices: [] }); }, speak() {}, cancel() {} });
  await engine.ready;assert.equal(engine.queueSupported, false);
});

test('Play recovers from a rejected initial native queue instead of resuming an empty queue', async () => {
  const e=environment();e.p.load([{text:'First.'},{text:'Second.'}],0);e.failNextLaunch();e.p.play();
  await tick();await tick();assert.equal(e.p.state(),'paused');e.p.seek(1);e.p.play();await tick();await tick();
  assert.equal(e.calls.filter(c=>c[0]==='playQueue').length,2);assert.equal(e.calls.filter(c=>c[0]==='resume').length,0);
  assert.equal(e.p.state(),'playing');assert.equal(e.p.index(),1);
});
