/* Handwriting saves wait for the Pencil to rest (v194), but never longer than 15 seconds
   while strokes keep coming: v194 as reviewed restarted the wait at every stroke, so 30
   seconds of steady writing saved nothing. Timing harness over the real reading.js code. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'reading.js'), 'utf8');
function harness() {
  const start = source.indexOf('  var PERSIST_SOON_IDLE='), end = source.indexOf('  function find(id)', start);
  assert.ok(start >= 0 && end > start, 'persistSoon section exists');
  let clock = 1000000, serial = 0;
  const timers = new Map(), writes = [];
  const context = vm.createContext({
    Date: { now: () => clock }, workspacePenDown: 0, workspacePenAt: 0, penOnGlass: () => context.workspacePenDown,
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, at: clock + Math.max(0, ms || 0) }); return id; },
    clearTimeout(id) { timers.delete(id); },
    persist() { writes.push(clock); if (context.persistSoonTimer) { timers.delete(context.persistSoonTimer); context.persistSoonTimer = 0; } context.persistSoonSince = 0; return true; }
  });
  vm.runInContext(source.slice(start, end), context);
  function advance(ms) {
    const until = clock + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); clock = due[1].at; due[1].fn();
    }
    clock = until;
  }
  return { context, advance, writes, now: () => clock };
}

test('steady writing still saves at least every 15 seconds', () => {
  const h = harness(), began = h.now();
  for (let i = 0; i < 120; i++) { h.context.workspacePenAt = h.now(); h.context.persistSoon(); h.advance(250); }
  assert.ok(h.writes.length >= 2, `saves during 30 s of writing: ${h.writes.length}`);
  assert.ok(h.writes[0] - began <= 15300, `first save after ${h.writes[0] - began} ms`);
  for (let i = 1; i < h.writes.length; i++) assert.ok(h.writes[i] - h.writes[i - 1] <= 15300);
});

test('at the deadline a Pencil still down waits for its lift', () => {
  const h = harness(), began = h.now();
  h.context.workspacePenAt = h.now(); h.context.persistSoon();
  h.context.workspacePenDown = 1;
  h.advance(20000);
  assert.equal(h.writes.length, 0, 'never mid-stroke');
  h.context.workspacePenDown = 0; h.context.workspacePenAt = h.now();
  h.advance(300);
  assert.equal(h.writes.length, 1, 'saved right after the lift');
  assert.ok(h.writes[0] - began >= 20000);
});

test('a single stroke saves 1.2 seconds after the Pencil rests', () => {
  const h = harness(), began = h.now();
  h.context.workspacePenAt = h.now(); h.context.persistSoon();
  h.advance(1199); assert.equal(h.writes.length, 0);
  h.advance(1); assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0] - began, 1200);
});
