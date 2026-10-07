/* Controller transactions against the real state and reader adapters. A small
   DOM fixture isolates pointer cancellation/history without a browser runtime. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const viewSource = read('reading-workspace-view.js');
const readerSource = read('reading.js');
const plain = value => JSON.parse(JSON.stringify(value));
function section(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `section exists: ${start}`);
  return source.slice(from, to);
}
function node() {
  return { style: {}, attributes: {}, hidden: false, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(key, value) { this.attributes[key] = value; },
    removeAttribute(key) { delete this.attributes[key]; },
    replaceChildren() {}, appendChild() {}, focus() {}, contains() { return false; },
    querySelectorAll() { return []; }, hasPointerCapture() { return false; },
    releasePointerCapture() {}, remove() {} };
}
function harness() {
  const ch = { id: 'paper', updatedAt: 50, readingExcerpts: { items: [] } };
  const state = { chapters: [ch], savedAt: 50 }, status = { textContent: '' };
  const calls = { writes: 0, recovery: 0, sync: 0, add: 0, render: 0 };
  const paths = new Map(), board = Object.assign(node(), { clientWidth: 1000 });
  let failPersist = false, failAddAt = 0, serial = 0, stamp = 1000;
  const context = vm.createContext({
    window: {}, state, currentId: 'paper', KEY: 'reader', stateLoadFailed: false,
    storageWarned: false, workspaceSaveFailed: false, now: () => ++stamp,
    find: () => ch, localState: () => state,
    readingExcerptsUnavailable: chapter => !chapter || !chapter.readingExcerpts,
    workspaceStatus: message => { status.textContent = message; },
    localStorage: { setItem() { calls.writes++; if (failPersist) throw new Error('Storage full'); } },
    queueStateSnapshot() { calls.recovery++; return Promise.resolve(false); },
    scheduleSync() { calls.sync++; }, showError() {},
    context: () => ({ id: 'paper', epoch: 1, open: true, items: ch.readingExcerpts.items, workspace: ch.readingWorkspace }),
    available: () => true, positionsOf: c => c.workspace.positions, itemsOf: c => c.items,
    copy: plain, undoStack: [], redoStack: [], selection: null, gesture: null,
    board, status, selectionBox: node(), lassoLayer: node(), cards: new Map(),
    ink: { querySelectorAll: () => [...paths.values()] }, observedHeight: 2000, observedWidth: 1000,
    viewport: null, previewFrame: 0, suppressClickUntil: 0, suppressCardClickUntil: 0,
    cardTouches: new Map(), performance: { now: () => 100 }, clearTimeout, cancelAnimationFrame() {},
    setTimeout: fn => { fn(); return 0; }, workspacePenDown: 0, workspacePenAt: 0, inkCache: new Map(),
    document: { activeElement: null, createElementNS: node }, NS: 'svg',
    closeOpenMenus() {}, measuredCards: () => [],
    pointFromClient: (x, y) => ({ x, y }), setStatus: message => { status.textContent = message; },
    uid: () => `restored-${++serial}`, clamp: (value, low, high) => Math.max(low, Math.min(high, value)),
    render() {
      calls.render++;
      if (!context.gesture || !['group', 'lasso'].includes(context.gesture.kind)) context.refreshSelection();
    }
  });
  vm.runInContext(read('reading-workspace.js'), context);
  const api = context.window.PhloemWorkspaceState;
  context.global = context.window;
  ch.readingWorkspace = api.normalize();
  context.canonicalStroke = id => ch.readingWorkspace.strokes.find(item => item.id === id) || null;
  context.displayStroke = stroke => api.displayStroke(stroke, ch.readingWorkspace.positions);
  vm.runInContext([
    section(readerSource, '  function readingWorkspaceUnavailable(ch){', '  function mergeReadingWorkspace('),
    section(readerSource, '  function persist(schedule,atomic){', '  function find(id){'),
    section(readerSource, '  function workspaceGroupEqual(', '  function workspaceEnsureSpace('),
    section(viewSource, '    function cancel() {', '    function pointFromClient('),
    section(viewSource, '    function groupSnapshot(', '    function renderInk('),
    section(viewSource, '    function recordUndo(', '    if (buttons.undo)')
  ].join('\n'), context);
  context.adapter = {
    moveGroup: context.workspaceMoveGroup, restoreGroup: context.workspaceRestoreGroup,
    addStroke(stroke) {
      calls.add++;
      if (calls.add === failAddAt) return false;
      ch.readingWorkspace = api.addStroke(ch.readingWorkspace, stroke, ++stamp);
      return true;
    },
    eraseStrokes(ids) { ch.readingWorkspace = api.removeStrokes(ch.readingWorkspace, ids, ++stamp); return true; }
  };
  function add(id, x = 100, y = 100, at = 100) {
    ch.readingWorkspace = api.addStroke(ch.readingWorkspace, { id, color: 'blue', width: 2,
      points: [[x, y, .5], [x + 100, y + 100, .7]], style: 'natural' }, at);
    const path = node(); path.dataset.strokeId = id; paths.set(id, path);
    return plain(context.canonicalStroke(id));
  }
  function select(ids) {
    context.selection = { clipIds: [], strokeIds: ids, bounds: {} };
    context.refreshSelection();
  }
  return { context, ch, state, status, calls, api, paths, add, select,
    failPersist(value) { failPersist = value; }, failAddAt(value) { failAddAt = value; } };
}
const point = (clientX, clientY) => ({ clientX, clientY });
const snapshot = stroke => ({ positions: {}, strokes: [plain(stroke)] });
function moveRecord(before, after) { return { kind: 'move', before: snapshot(before), after: snapshot(after) }; }

test('selection clears when a selected record changes before a gesture', () => {
  const fixture = harness(), { context, ch, api } = fixture;
  const original = fixture.add('a'); fixture.select(['a']);
  ch.readingWorkspace = api.addStroke(ch.readingWorkspace, { ...original, color: 'red' }, 500);
  context.render();
  assert.equal(context.selection, null);
  assert.equal(fixture.calls.writes, 0);
});

test('external selected-record changes during a group drag are preserved without adding history', () => {
  const fixture = harness(), { context, ch, api, calls } = fixture;
  const original = fixture.add('a'); fixture.select(['a']);
  context.startSelection(point(150, 150), 7); context.moveSelection(point(170, 180));
  ch.readingWorkspace = api.addStroke(ch.readingWorkspace, { ...original, color: 'red' }, 500);
  const external = ch.readingWorkspace;
  context.render(); context.finishSelection(point(180, 190));
  assert.equal(ch.readingWorkspace, external);
  assert.equal(context.selection, null);
  assert.equal(context.undoStack.length, 0);
  assert.equal(calls.writes, 0);
});

test('cancelling a group drag removes its transform and saves nothing', () => {
  const fixture = harness(), { context, ch, paths, calls } = fixture;
  fixture.add('a'); fixture.select(['a']); const original = ch.readingWorkspace;
  context.startSelection(point(150, 150), 7); context.moveSelection(point(170, 180));
  assert.equal(paths.get('a').attributes.transform, 'translate(20 30)');
  context.cancel();
  assert.equal(paths.get('a').attributes.transform, undefined);
  assert.equal(context.gesture, null);
  assert.equal(ch.readingWorkspace, original);
  assert.equal(context.undoStack.length, 0);
  assert.equal(calls.writes, 0);
});

test('a failed group save rolls back the controller preview and creates no undo entry', () => {
  const fixture = harness(), { context, ch, state, paths, calls } = fixture;
  fixture.add('a'); fixture.select(['a']); const original = ch.readingWorkspace;
  fixture.failPersist(true);
  context.startSelection(point(150, 150), 7); context.moveSelection(point(170, 180));
  context.finishSelection(point(180, 190));
  assert.equal(ch.readingWorkspace, original);
  assert.equal(ch.updatedAt, 50); assert.equal(state.savedAt, 50);
  assert.equal(paths.get('a').attributes.transform, undefined);
  assert.equal(context.selection, null);
  assert.equal(context.undoStack.length, 0);
  assert.equal(calls.writes, 1); assert.equal(calls.recovery, 0); assert.equal(calls.sync, 0);
});

test('undoing unrelated ink does not adopt an external clock into older group history', () => {
  const fixture = harness(), { context, ch, api, calls } = fixture;
  const before = fixture.add('a'), after = fixture.add('a', 120, 120, 200), other = fixture.add('b', 400, 400, 300);
  const action = moveRecord(before, after);
  context.undoStack.push(action, { kind: 'add', stroke: other });
  ch.readingWorkspace = api.addStroke(ch.readingWorkspace, after, 900);
  context.history('undo');
  assert.equal(action.after.strokes[0].updatedAt, after.updatedAt);
  const external = plain(context.canonicalStroke('a'));
  context.history('undo');
  assert.deepEqual(plain(context.canonicalStroke('a')), external);
  assert.equal(context.undoStack.length, 1);
  assert.equal(calls.writes, 0);
});

test('failed grouped undo retains its action for a successful retry', () => {
  const fixture = harness(), { context, ch, calls } = fixture;
  const before = fixture.add('a'), after = fixture.add('a', 120, 120, 200);
  context.undoStack.push(moveRecord(before, after)); const original = ch.readingWorkspace;
  fixture.failPersist(true); context.history('undo');
  assert.equal(context.undoStack.length, 1); assert.equal(context.redoStack.length, 0);
  assert.equal(ch.readingWorkspace, original);
  fixture.failPersist(false); context.history('undo');
  assert.equal(context.undoStack.length, 0); assert.equal(context.redoStack.length, 1);
  assert.deepEqual(plain(context.canonicalStroke('a').points), before.points);
  assert.equal(calls.writes, 2);
});

test('successive moves of the same stroke undo and redo through fresh local clocks', () => {
  const fixture = harness(), { context } = fixture;
  const before = fixture.add('a'), first = fixture.add('a', 120, 120, 200), second = fixture.add('a', 140, 140, 300);
  context.undoStack.push(moveRecord(before, first), moveRecord(first, second));
  context.history('undo');
  assert.deepEqual(plain(context.canonicalStroke('a').points), first.points);
  context.history('undo');
  assert.deepEqual(plain(context.canonicalStroke('a').points), before.points);
  context.history('redo');
  assert.deepEqual(plain(context.canonicalStroke('a').points), first.points);
  context.history('redo');
  assert.deepEqual(plain(context.canonicalStroke('a').points), second.points);
  assert.equal(context.undoStack.length, 2); assert.equal(context.redoStack.length, 0);
});

test('partial eraser-undo failure does not strand prior group history on a rolled-back identity', () => {
  const fixture = harness(), { context, ch, api } = fixture;
  const before = fixture.add('a'), after = fixture.add('a', 120, 120, 200), other = fixture.add('b', 400, 400, 300);
  const action = moveRecord(before, after);
  context.undoStack.push(action, { kind: 'erase', strokes: [after, other] });
  ch.readingWorkspace = api.removeStrokes(ch.readingWorkspace, ['a', 'b'], 500);
  fixture.failAddAt(2); context.history('undo');
  assert.equal(context.undoStack.length, 2); assert.equal(context.redoStack.length, 0);
  assert.equal(action.after.strokes[0].id, 'a', 'failed restore must keep original history identity');
  context.history('undo');
  const replacement = action.after.strokes[0].id;
  assert.notEqual(replacement, 'a');
  assert.ok(context.canonicalStroke(replacement), 'history now points at the successful replacement');
  assert.ok(action.before.strokes[0].updatedAt >= action.before.strokes[0].createdAt,
    'historical target clocks remain valid after the restored stroke gets a new creation time');
  context.history('undo');
  assert.equal(context.undoStack.length, 0);
  assert.deepEqual(plain(context.canonicalStroke(replacement).points), before.points);
});
