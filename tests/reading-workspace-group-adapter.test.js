const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'reading.js'), 'utf8');
const workspace = fs.readFileSync(path.join(__dirname, '..', 'reading-workspace.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `reader section exists: ${start}`);
  return source.slice(from, to);
}
function harness() {
  const ch = { id: 'paper', updatedAt: 50, readingExcerpts: { items: [{ id: 'clip' }, { id: 'other' }] } };
  const state = { chapters: [ch], savedAt: 50 };
  const calls = { writes: [], recovery: [], sync: 0, warnings: 0, status: '' };
  let fail = false;
  const context = vm.createContext({
    window: {}, state, currentId: 'paper', KEY: 'reader', stateLoadFailed: false,
    storageWarned: false, workspaceSaveFailed: false, now: () => 1000,
    stateSnapshotOk: false, stateRecoveryDone: true, stateLocalFull: false,
    find: () => ch, localState: () => state, workspaceView: null, byId: () => null,
    readingExcerptsUnavailable: chapter => !chapter || !chapter.readingExcerpts,
    workspaceStatus: message => { calls.status = message; },
    localStorage: { setItem(key, value) { calls.writes.push(value); if (fail) throw new Error('Storage full'); } },
    queueStateSnapshot(serialized) { calls.recovery.push(serialized); return Promise.resolve(false); },
    scheduleSync() { calls.sync++; }, showError() { calls.warnings++; },
    // Deferred handwriting saves run at once here: no Pencil is resting.
    setTimeout: fn => { fn(); return 0; }, clearTimeout() {}, workspacePenDown: 0, workspacePenAt: 0, penOnGlass: () => context.workspacePenDown
  });
  vm.runInContext(workspace, context);
  vm.runInContext([
    section('  function readingWorkspaceUnavailable(ch){', '  function mergeReadingWorkspace('),
    section('  function persist(schedule,atomic){', '  function find(id){'),
    section('  function saveWorkspace(', '  function workspaceWide()'),
    section('  function workspaceDropPoint(', '  function showWorkspaceClip('),
    section('  function workspaceGroupEqual(', '  function workspaceEnsureSpace('),
    section('  function workspaceEnsureSpace(', '  function workspaceGrow(')
  ].join('\n'), context);
  const api = context.window.PhloemWorkspaceState;
  let board = api.place(api.normalize(), 'clip', { x: 40, y: 40, width: 420 }, 100);
  board = api.place(board, 'other', { x: 550, y: 600, width: 420 }, 100);
  board = api.addStroke(board, stroke('attached', { clipId: 'clip', x: 40, y: 40, width: 420 }), 100);
  board = api.addStroke(board, stroke('free'), 100);
  board = api.addStroke(board, stroke('other-ink'), 100);
  board.deleted.removed = 70;
  ch.readingWorkspace = board;
  return { context, ch, state, api, calls, fail(value) { fail = value; } };
}
function stroke(id, anchor) {
  return { id, color: 'blue', width: 2, points: [[70, 80, .5], [100, 110, .6]],
    style: 'natural', ...(anchor ? { anchor } : {}) };
}
const selected = { clipIds: ['clip'], strokeIds: ['attached', 'free'] };
const cards = [{ id: 'clip', x: 40, y: 40, width: 420, height: 200 },
  { id: 'other', x: 550, y: 600, width: 420, height: 200 }];
function snapshot(ch, selection = selected) {
  const board = ch.readingWorkspace;
  return { positions: Object.fromEntries(selection.clipIds.map(id => [id, plain(board.positions[id])])),
    strokes: board.strokes.filter(item => selection.strokeIds.includes(item.id)).map(plain) };
}

test('group movement saves once, retains external changes to neighbors, and moves anchored ink once', () => {
  const { context, ch, api, calls } = harness(), before = snapshot(ch);
  ch.readingWorkspace = api.place(ch.readingWorkspace, 'other', { x: 530, y: 650, width: 420 }, 300);
  ch.readingWorkspace = api.addStroke(ch.readingWorkspace, { ...stroke('other-ink'), color: 'red' }, 300);
  ch.reviewNote = 'An unrelated external edit';
  const other = plain(ch.readingWorkspace.positions.other), otherInk = plain(ch.readingWorkspace.strokes.find(item => item.id === 'other-ink'));
  assert.equal(context.workspaceMoveGroup(selected, { x: 100, y: 2100 }, cards, before), true);
  const after = snapshot(ch);
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.recovery.length, 1);
  assert.equal(calls.sync, 1);
  assert.equal(after.positions.clip.x, 140);
  assert.equal(after.positions.clip.y, 2140);
  assert.equal(ch.readingWorkspace.height, 3000);
  assert.deepEqual(after.strokes.find(item => item.id === 'attached'), before.strokes.find(item => item.id === 'attached'));
  assert.deepEqual(after.strokes.find(item => item.id === 'free').points, [[170, 2180, .5], [200, 2210, .6]]);
  assert.deepEqual(plain(ch.readingWorkspace.positions.other), other);
  assert.deepEqual(plain(ch.readingWorkspace.strokes.find(item => item.id === 'other-ink')), otherInk);
  assert.equal(ch.reviewNote, 'An unrelated external edit');
});

test('undo and redo replay geometry with newer clocks while retaining height and tombstones', () => {
  const { context, ch, calls } = harness(), before = snapshot(ch);
  assert.equal(context.workspaceMoveGroup(selected, { x: 100, y: 2100 }, cards, before), true);
  const after = snapshot(ch);
  assert.equal(context.workspaceRestoreGroup(before, after), true);
  const undone = snapshot(ch);
  assert.equal(undone.positions.clip.x, 40);
  assert.equal(undone.positions.clip.y, 40);
  assert.ok(undone.positions.clip.updatedAt > after.positions.clip.updatedAt);
  assert.ok(undone.strokes.every(item => item.updatedAt > after.strokes.find(previous => previous.id === item.id).updatedAt));
  assert.equal(ch.readingWorkspace.height, 3000);
  assert.equal(ch.readingWorkspace.deleted.removed, 70);
  assert.equal(context.workspaceRestoreGroup(after, undone), true);
  assert.equal(ch.readingWorkspace.positions.clip.x, 140);
  assert.equal(ch.readingWorkspace.positions.clip.y, 2140);
  assert.equal(calls.writes.length, 3);
});

test('missing or stale snapshots, deleted members, and newly anchored children fail without writes', () => {
  for (const mutate of [
    fixture => { fixture.expected = undefined; },
    fixture => { fixture.ch.readingExcerpts.items = [{ id: 'other' }]; },
    fixture => { fixture.ch.readingWorkspace = fixture.api.removeStrokes(fixture.ch.readingWorkspace, ['free'], 300); },
    fixture => { fixture.ch.readingWorkspace = fixture.api.addStroke(fixture.ch.readingWorkspace, { ...stroke('free'), color: 'red' }, 300); },
    fixture => { fixture.ch.readingWorkspace = fixture.api.addStroke(fixture.ch.readingWorkspace, stroke('new-child', { clipId: 'clip', x: 40, y: 40, width: 420 }), 300); },
    fixture => { fixture.ch.readingWorkspacePending = [{ version: 4 }]; },
    fixture => { fixture.ch.readingWorkspace = { version: 4, preserved: true }; }
  ]) {
    const fixture = harness(); fixture.expected = snapshot(fixture.ch); mutate(fixture);
    const current = fixture.ch.readingWorkspace;
    assert.equal(fixture.context.workspaceMoveGroup(selected, { x: 100, y: 100 }, cards, fixture.expected), false);
    assert.equal(fixture.ch.readingWorkspace, current);
    assert.equal(fixture.calls.writes.length, 0);
  }
});

test('snapshot property ordering and stroke ordering do not invalidate unchanged records', () => {
  const { context, ch } = harness(), before = snapshot(ch);
  const expected = plain(before);
  expected.positions.clip = Object.fromEntries(Object.entries(expected.positions.clip).reverse());
  expected.strokes.reverse();
  expected.strokes = expected.strokes.map(item => Object.fromEntries(Object.entries(item).reverse()));
  assert.equal(context.workspaceRestoreGroup(before, expected), true);
});

test('failed atomic saves roll back memory and never queue the failed change for recovery or sync', () => {
  for (const operation of ['move', 'restore']) {
    const fixture = harness(), { context, ch, state, calls } = fixture, before = snapshot(ch);
    const previous = ch.readingWorkspace, previousUpdatedAt = ch.updatedAt, previousSavedAt = state.savedAt;
    fixture.fail(true);
    const saved = operation === 'move'
      ? context.workspaceMoveGroup(selected, { x: 100, y: 100 }, cards, before)
      : context.workspaceRestoreGroup(before, before);
    assert.equal(saved, false);
    assert.equal(calls.writes.length, 1);
    assert.equal(calls.recovery.length, 0);
    assert.equal(calls.sync, 0);
    assert.equal(ch.readingWorkspace, previous);
    assert.equal(ch.updatedAt, previousUpdatedAt);
    assert.equal(state.savedAt, previousSavedAt);
    assert.match(calls.status, /previous position has been kept/);
  }
});

test('ordinary persistence retains recovery and sync fallback when localStorage fails', () => {
  const fixture = harness(); fixture.fail(true);
  assert.equal(fixture.context.persist(), false);
  assert.equal(fixture.calls.writes.length, 1);
  assert.equal(fixture.calls.recovery.length, 1);
  assert.equal(fixture.calls.sync, 1);
});

test('a full localStorage still counts as saved when the device snapshot is working', () => {
  const fixture = harness(); fixture.fail(true);
  fixture.context.stateSnapshotOk = true;
  assert.equal(fixture.context.persist(), true);
  assert.equal(fixture.calls.recovery.length, 1);
  assert.equal(fixture.context.stateLocalFull, true);
});

test('before startup recovery, a full localStorage does not overwrite the newer snapshot', () => {
  const fixture = harness(); fixture.fail(true);
  fixture.context.stateSnapshotOk = true; fixture.context.stateRecoveryDone = false;
  assert.equal(fixture.context.persist(), false);
  assert.equal(fixture.calls.recovery.length, 0);
});

test('orphan ink undo restores its anchor and redo removes it again', () => {
  const { context, ch, api } = harness();
  ch.readingWorkspace = api.addStroke(api.normalize(), stroke('orphan', { clipId: 'missing', x: 40, y: 40, width: 420 }), 100);
  const selection = { clipIds: [], strokeIds: ['orphan'] }, before = snapshot(ch, selection);
  assert.equal(context.workspaceMoveGroup(selection, { x: 100, y: 100 }, [], before), true);
  const moved = snapshot(ch, selection);
  assert.equal(moved.strokes[0].anchor, undefined);
  assert.equal(context.workspaceRestoreGroup(before, moved), true);
  const restored = snapshot(ch, selection);
  assert.deepEqual(restored.strokes[0].anchor, before.strokes[0].anchor);
  assert.equal(context.workspaceRestoreGroup(moved, restored), true);
  assert.equal(snapshot(ch, selection).strokes[0].anchor, undefined);
});

test('horizontal group movement grows the paper and undo never contracts it', () => {
  const { context, ch } = harness(), before = snapshot(ch);
  assert.equal(context.workspaceMoveGroup(selected, { x: 2200, y: 100 }, cards, before), true);
  const moved = snapshot(ch);
  assert.equal(ch.readingWorkspace.width, 3000);
  assert.equal(moved.positions.clip.x, 2240);
  assert.deepEqual(moved.strokes.find(item => item.id === 'free').points, [[2270, 180, .5], [2300, 210, .6]]);
  assert.equal(context.workspaceRestoreGroup(before, moved), true);
  assert.equal(ch.readingWorkspace.width, 3000);
  assert.equal(ch.readingWorkspace.positions.clip.x, 40);
  assert.equal(context.workspaceRestoreGroup(moved, snapshot(ch)), true);
  assert.equal(ch.readingWorkspace.positions.clip.x, 2240);
});

test('restoring wide target geometry grows enough for card edges and raw anchored ink', () => {
  const { context, ch } = harness(), expected = snapshot(ch), target = plain(expected);
  target.positions.clip.x = 2100;
  const attached = target.strokes.find(item => item.id === 'attached');
  attached.anchor.x = 3100;
  attached.points = [[3130, 80, .5], [3160, 110, .6]];
  assert.equal(context.workspaceRestoreGroup(target, expected), true);
  assert.equal(ch.readingWorkspace.width, 4000, 'raw fallback points remain inside saved paper width');
  assert.equal(ch.readingWorkspace.positions.clip.x, 2100);
  assert.deepEqual(plain(ch.readingWorkspace.strokes.find(item => item.id === 'attached').points), attached.points);
});

test('space requests expand both dimensions in one save and keep all existing coordinates', () => {
  const { context, ch, calls } = harness(), previous = plain(ch.readingWorkspace);
  assert.equal(context.workspaceEnsureSpace(2300, 2500), true);
  assert.equal(ch.readingWorkspace.width, 3000);
  assert.equal(ch.readingWorkspace.height, 3000);
  assert.deepEqual(plain(ch.readingWorkspace.positions), previous.positions);
  assert.deepEqual(plain(ch.readingWorkspace.strokes), previous.strokes);
  assert.deepEqual(plain(ch.readingWorkspace.deleted), previous.deleted);
  assert.equal(calls.writes.length, 1);
  assert.equal(context.workspaceEnsureSpace(2999), true, 'legacy height-only callers preserve width');
  assert.equal(calls.writes.length, 1);
  assert.equal(context.workspaceEnsureSpace(3000), true);
  assert.equal(ch.readingWorkspace.width, 3000);
  assert.equal(ch.readingWorkspace.height, 4000);
});

test('invalid or exhausted width requests leave the workspace untouched', () => {
  const { context, ch, api, calls } = harness(), previous = ch.readingWorkspace;
  for (const x of [-1, NaN, Infinity, api.MAX_WIDTH]) assert.equal(context.workspaceEnsureSpace(500, x), false);
  assert.equal(ch.readingWorkspace, previous);
  assert.equal(calls.writes.length, 0);
});

test('placing a note beyond the original right edge expands paper before saving its position', () => {
  const { context, ch, calls } = harness(), other = plain(ch.readingWorkspace.positions.other);
  assert.equal(context.placeWorkspaceClip('clip', { x: 2450, y: 2700, width: 650 }), true);
  assert.equal(ch.readingWorkspace.width, 4000);
  assert.equal(ch.readingWorkspace.height, 4000);
  assert.equal(ch.readingWorkspace.positions.clip.x, 2450);
  assert.equal(ch.readingWorkspace.positions.clip.y, 2700);
  assert.deepEqual(plain(ch.readingWorkspace.positions.other), other);
  assert.equal(calls.writes.length, 1);
});

test('new-note drop points use logical width and horizontal scroll', () => {
  const { context, ch, api } = harness();
  ch.readingWorkspace = api.setWidth(api.setWidth(ch.readingWorkspace, 2000), 3000);
  const elements = {
    workspaceBoard: { clientWidth: 1500 },
    workspaceScroll: { scrollLeft: 750, scrollTop: 300, getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    workspaceCards: { children: [] }
  };
  context.byId = id => elements[id];
  const point = context.workspaceDropPoint();
  assert.equal(point.x, 1545);
  assert.equal(point.y, 645);
  assert.equal(point.width, 400, 'new notes start square-sized');
});
