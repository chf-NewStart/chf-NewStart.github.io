const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const readerSource = fs.readFileSync(path.join(__dirname, '..', 'reading.js'), 'utf8');
const workspaceSource = fs.readFileSync(path.join(__dirname, '..', 'reading-workspace.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function section(start, end) {
  const from = readerSource.indexOf(start);
  const to = readerSource.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `reader section exists: ${start}`);
  return readerSource.slice(from, to);
}
function harness(chapters) {
  const state = { chapters: plain(chapters), deleted: {}, merged: {} };
  const context = vm.createContext({
    window: {}, state, currentId: null, now: () => 1000,
    find: id => state.chapters.find(ch => ch.id === id),
    mergePdfInk: () => false, reviewStateStamp: () => 0,
    newerPdfPosition: () => null, saveDerivedSoon() {}, derivedData: () => null,
    mergeDerivedInto: () => false, migrateReviewWorkspaceLabels: () => false,
    duplicateGroups: () => [], titleQuality: () => 0,
    mergeTags: (a, b) => [...(a || []), ...(b || [])],
    mergeItemArrays: (a, b) => [...(a || []), ...(b || [])],
    mergeNoteMap: (a, b) => ({ ...a, ...b }),
    mergeHighlightMap: (a, b) => ({ ...a, ...b }),
    mergeReviews: (a, b) => ({ ...a, ...b }),
    mergeLookups: (a, b) => ({ ...a, ...b }),
    normalize(ch) { context.normalizeReadingWorkspace(ch); return ch; }
  });
  vm.runInContext(workspaceSource, context, { filename: 'reading-workspace.js' });
  vm.runInContext([
    section('  function normalizeReadingWorkspace(ch){', '  function normalizeReadingExcerpts(ch){'),
    section('  function mergeDuplicateRecord(', '  function canonicalPaper('),
    section('  function mergeState(inc){', '  var syncDecryptBlocked')
  ].join('\n'), context, { filename: 'reading.js workspace integration' });
  return context;
}
const stroke = (id, updatedAt = 100) => ({ id, color: 'blue', width: 2,
  points: [[10, 100, .5], [20, 200, .7]], style: 'natural', createdAt: 50, updatedAt });
const board = (positions, strokes, height = 2000) => ({
  version: 2, height, positions, strokes, deleted: {}
});
const position = (x, y, updatedAt = 100) => ({ x, y, width: 420, updatedAt });
const chapter = (updatedAt, workspace, id = 'paper') => ({
  id, kind: 'text', title: 'Paper', addedAt: 1, updatedAt,
  readingWorkspace: workspace
});
const strokeIds = ch => Array.from(ch.readingWorkspace.strokes, item => item.id);

test('legacy workspace data upgrades to version 2 without moving cards or ink', () => {
  const legacy = { ...board({ clip: position(40, 19000) }, [stroke('ink')], 20000), version: 1 };
  const ch = chapter(100, legacy);
  const context = harness([]);
  context.normalizeReadingWorkspace(ch);
  assert.equal(ch.readingWorkspace.version, 2);
  assert.deepEqual(plain(ch.readingWorkspace.positions), legacy.positions);
  assert.deepEqual(plain(ch.readingWorkspace.strokes), legacy.strokes);
});

test('normalization leaves an unsupported workspace envelope opaque', () => {
  const future = { version: 3, pixels: 'new format' };
  const ch = chapter(100, future);
  const context = harness([]);
  context.normalizeReadingWorkspace(ch);
  assert.deepEqual(ch.readingWorkspace, future);
  assert.equal(context.readingWorkspaceUnavailable(ch), true);
});

test('merge helper preserves two distinct unsupported versions as active and pending', () => {
  const left = chapter(200, { version: 3, drawing: 'first' });
  const right = chapter(300, { version: 4, drawing: 'second' });
  const context = harness([]);
  assert.equal(context.mergeReadingWorkspace(left, left, right), true);
  assert.deepEqual(plain(left.readingWorkspace), { version: 3, drawing: 'first' });
  assert.deepEqual(plain(left.readingWorkspacePending), [{ version: 4, drawing: 'second' }]);
  assert.equal(context.readingWorkspaceUnavailable(left), true);
});

for (const [label, localStamp, remoteStamp] of [
  ['older incoming chapter', 300, 200],
  ['newer incoming chapter', 200, 300]
]) test(`mergeState retains independent workspace cards and ink with ${label}`, () => {
  const local = board({ local: position(10, 20) }, [stroke('local')]);
  const remote = board({ remote: position(20, 2600) }, [stroke('remote')], 3000);
  const context = harness([chapter(localStamp, local)]);
  assert.equal(context.mergeState({ chapters: [chapter(remoteStamp, remote)] }), true);
  const merged = context.state.chapters[0].readingWorkspace;
  assert.equal(merged.version, 2);
  assert.equal(merged.height, 3000);
  assert.deepEqual(Object.keys(plain(merged.positions)), ['local', 'remote']);
  assert.deepEqual(plain(merged.positions.remote), position(20, 2600));
  assert.deepEqual(strokeIds(context.state.chapters[0]), ['local', 'remote']);
});

test('future active envelope and supported pending copy survive mergeState', () => {
  const future = { version: 3, drawing: { novel: true } };
  const local = board({ local: position(10, 20) }, [stroke('local')]);
  const context = harness([chapter(200, local)]);
  context.mergeState({ chapters: [chapter(300, future)] });
  const merged = context.state.chapters[0];
  assert.deepEqual(plain(merged.readingWorkspace), future);
  assert.ok(merged.readingWorkspacePending.some(copy =>
    copy.version === 2 && copy.strokes.some(item => item.id === 'local')));
  assert.equal(context.readingWorkspaceUnavailable(merged), true);
});

test('older future envelope stays active while newer supported copy is pending', () => {
  const future = { version: 3, drawing: { novel: true } };
  const remote = board({ remote: position(30, 40) }, [stroke('remote')]);
  const context = harness([chapter(300, future)]);
  context.mergeState({ chapters: [chapter(200, remote)] });
  const merged = context.state.chapters[0];
  assert.deepEqual(plain(merged.readingWorkspace), future);
  assert.ok(merged.readingWorkspacePending.some(copy =>
    copy.version === 2 && copy.strokes.some(item => item.id === 'remote')));
});

test('duplicate-paper merge retains both workspace sources and greater height', () => {
  const context = harness([]);
  const keep = chapter(200, board({ a: position(10, 20) }, [stroke('a')]), 'canonical');
  const extra = chapter(300, board({ b: position(20, 2600) }, [stroke('b')], 3000), 'duplicate');
  context.mergeDuplicateRecord(keep, extra);
  assert.equal(keep.readingWorkspace.height, 3000);
  assert.deepEqual(Object.keys(plain(keep.readingWorkspace.positions)), ['a', 'b']);
  assert.deepEqual(strokeIds(keep), ['a', 'b']);
  assert.equal(keep.updatedAt, 300);
});
