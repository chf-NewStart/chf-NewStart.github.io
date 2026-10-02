const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'reading-fold-view.js'), 'utf8');
const sandbox = { window: {}, Date, Math, Array, Object, Number, String, Promise, Set, Map };
vm.runInNewContext(source, sandbox, { filename: 'reading-fold-view.js' });
const createRecognizer = sandbox.window.PhloemFoldView.createGestureRecognizer;
const plain = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const holder = {
    dataset: { page: '7' },
    getBoundingClientRect() { return { left: 20, top: 50, right: 820, bottom: 1050, width: 800, height: 1000 }; }
  };
  const opens = [];
  const statuses = [];
  let owns = 0;
  const recognizer = createRecognizer({ open: (page, band) => opens.push({ page, band }), onOwn: () => owns++, onStatus: status => statuses.push(status) });
  function touch(identifier, x, y, target = holder, kind = 'direct') {
    return {
      identifier, clientX: x, clientY: y, touchType: kind,
      target: { closest: selector => selector === '.pdf-page' ? target : null }
    };
  }
  function event(touches, timeStamp) { return { touches, timeStamp, cancelable: true, preventDefault() {} }; }
  return { holder, opens, statuses, recognizer, touch, event, get owns() { return owns; } };
}

function beginFour(f, options = {}) {
  const points = options.points || [[120, 150], [120, 450], [680, 150], [680, 450]];
  let active = [];
  points.forEach(([x, y], index) => {
    active = active.concat(f.touch(index + 1, x, y, options.holders && options.holders[index] || f.holder, index === 0 ? options.firstKind : 'direct'));
    f.recognizer.handleTouch(options.nativeNames ? 'touchstart' : 'start', f.event(active, (options.startAt || 1000) + index * (options.spacing || 25)));
  });
  return active;
}

function converge(f, active, timeStamp = 1120) {
  const positions = [[120, 195], [120, 405], [680, 195], [680, 405]];
  return active.map((item, index) => f.touch(item.identifier, positions[index][0], positions[index][1]));
}

test('app event aliases and native TouchEvent names both recognize the gesture band', () => {
  for (const nativeNames of [false, true]) {
    const f = fixture();
    let active = beginFour(f, { nativeNames });
    assert.equal(f.owns, 1);
    active = converge(f, active);
    f.recognizer.handleTouch(nativeNames ? 'touchmove' : 'move', f.event(active, 1120));
    assert.equal(f.recognizer.handleTouch(nativeNames ? 'touchend' : 'end', f.event([], 1140)), true);
    assert.deepEqual(plain(f.opens), [{ page: 7, band: { y0: .1, y1: .4 } }]);
  }
});

test('a converged fold accepts natural staggered finger release and opens only after the last finger', () => {
  for (const order of [[0, 1, 2, 3], [3, 1, 0, 2], [1, 2, 3, 0]]) {
    const f = fixture();
    const active = converge(f, beginFour(f));
    f.recognizer.handleTouch('move', f.event(active, 1120));
    let remaining = active.slice();
    order.forEach((index, step) => {
      remaining = remaining.filter(touch => touch.identifier !== active[index].identifier);
      assert.equal(f.recognizer.handleTouch('end', f.event(remaining, 1140 + step * 30)), true);
      assert.equal(f.opens.length, step === 3 ? 1 : 0);
    });
    assert.deepEqual(plain(f.opens), [{ page: 7, band: { y0: .1, y1: .4 } }]);
  }
});

test('release permits a small resting-finger adjustment but rejects a continuing drag', () => {
  for (const movement of [3, 35]) {
    const f = fixture(), active = converge(f, beginFour(f));
    f.recognizer.handleTouch('move', f.event(active, 1120));
    f.recognizer.handleTouch('end', f.event(active.slice(1), 1140));
    const moved = active.slice(1).map(touch => f.touch(touch.identifier, touch.clientX + movement, touch.clientY));
    f.recognizer.handleTouch('move', f.event(moved, 1150));
    f.recognizer.handleTouch('end', f.event([], 1170));
    assert.equal(f.opens.length, movement === 3 ? 1 : 0);
  }
});

test('separating a remaining pair during staggered release disarms even within the movement allowance', () => {
  const f = fixture();
  beginFour(f);
  const active = [[120, 180], [120, 420], [680, 180], [680, 420]].map((p, i) => f.touch(i + 1, p[0], p[1]));
  f.recognizer.handleTouch('move', f.event(active, 1120));
  f.recognizer.handleTouch('end', f.event(active.slice(1), 1140));
  const separated = active.slice(1).map(touch => f.touch(touch.identifier, touch.clientX, touch.clientY + (touch.identifier === 3 ? -11 : 11)));
  f.recognizer.handleTouch('move', f.event(separated, 1150));
  f.recognizer.handleTouch('end', f.event([], 1170));
  assert.deepEqual(f.opens, []);
});

test('cancellation and a replacement touch during staggered release never open the preview', () => {
  for (const action of ['cancel', 'replacement']) {
    const f = fixture(), active = converge(f, beginFour(f));
    f.recognizer.handleTouch('move', f.event(active, 1120));
    f.recognizer.handleTouch('end', f.event(active.slice(1), 1140));
    if (action === 'cancel') f.recognizer.handleTouch('cancel', f.event(active.slice(1), 1150));
    else f.recognizer.handleTouch('start', f.event(active.slice(1).concat(f.touch(99, 120, 195)), 1150));
    f.recognizer.handleTouch('end', f.event([], 1170));
    assert.deepEqual(f.opens, []);
  }
});

test('a five-contact gesture and a cancelled owned gesture never open', () => {
  const f = fixture();
  let active = beginFour(f);
  active.push(f.touch(5, 420, 550));
  assert.equal(f.recognizer.handleTouch('start', f.event(active, 1110)), true);
  assert.equal(f.recognizer.handleTouch('end', f.event([], 1120)), true);
  assert.deepEqual(f.opens, []);

  const cancelled = fixture();
  active = beginFour(cancelled);
  active = converge(cancelled, active);
  cancelled.recognizer.handleTouch('move', cancelled.event(active, 1120));
  assert.equal(cancelled.recognizer.handleTouch('cancel', cancelled.event(active, 1130)), true);
  assert.deepEqual(cancelled.opens, []);
  assert.equal(cancelled.recognizer.handleTouch('end', cancelled.event([], 1140)), false);
});

test('reversing or separating after convergence disarms release; crossing a pair aborts', () => {
  const reversed = fixture();
  let active = beginFour(reversed);
  active = converge(reversed, active);
  reversed.recognizer.handleTouch('move', reversed.event(active, 1120));
  const separated = [[120, 150], [120, 450], [680, 150], [680, 450]].map((p, i) => reversed.touch(i + 1, p[0], p[1]));
  reversed.recognizer.handleTouch('move', reversed.event(separated, 1130));
  reversed.recognizer.handleTouch('end', reversed.event([], 1140));
  assert.deepEqual(reversed.opens, []);

  const crossed = fixture();
  active = beginFour(crossed);
  const swap = [[120, 470], [120, 130], [680, 470], [680, 130]].map((p, i) => crossed.touch(i + 1, p[0], p[1]));
  crossed.recognizer.handleTouch('move', crossed.event(swap, 1120));
  crossed.recognizer.handleTouch('end', crossed.event([], 1140));
  assert.deepEqual(crossed.opens, []);
});

test('steady contact arrival within 800ms is accepted, including formerly rejected 70ms spacing', () => {
  for (const spacing of [70, 150, 250]) { // First-to-fourth contact: 210, 450, 750ms.
    const f = fixture();
    const active = beginFour(f, { spacing });
    assert.equal(f.owns, 1, `${spacing}ms spacing owns four steady fingers`);
    const converged = active.map((item, index) => f.touch(item.identifier, item.clientX, item.clientY + (index % 2 ? -45 : 45)));
    f.recognizer.handleTouch('move', f.event(converged, 1000 + 3 * spacing + 50));
    f.recognizer.handleTouch('end', f.event([], 1000 + 3 * spacing + 70));
    assert.deepEqual(plain(f.opens), [{ page: 7, band: { y0: .1, y1: .4 } }]);
  }
});

test('candidate rejects arrival beyond 800ms, stylus, cross-page arrivals, and identity replacement', () => {
  const slow = fixture();
  beginFour(slow, { spacing: 300 }); // First-to-fourth contact takes 900ms.
  assert.equal(slow.owns, 0, 'a 900ms arrival is too slow');

  const stylus = fixture();
  beginFour(stylus, { firstKind: 'stylus' });
  assert.equal(stylus.owns, 0);

  const crossPage = fixture();
  const other = { dataset: { page: '8' }, getBoundingClientRect: crossPage.holder.getBoundingClientRect };
  beginFour(crossPage, { holders: [crossPage.holder, other, crossPage.holder, crossPage.holder] });
  assert.equal(crossPage.owns, 0);

  const replacement = fixture();
  let active = [replacement.touch(1, 120, 150), replacement.touch(2, 120, 450)];
  replacement.recognizer.handleTouch('start', replacement.event(active, 1000));
  active = [replacement.touch(1, 120, 150), replacement.touch(99, 120, 450)];
  replacement.recognizer.handleTouch('start', replacement.event(active, 1020));
  active.push(replacement.touch(3, 680, 150));
  replacement.recognizer.handleTouch('start', replacement.event(active, 1040));
  active.push(replacement.touch(4, 680, 450));
  replacement.recognizer.handleTouch('start', replacement.event(active, 1060));
  assert.equal(replacement.owns, 0, 'a replacement cannot reseed midway through the same contact group');
});

test('more than 12px movement before the fourth contact leaves the gesture unclaimed', () => {
  const f = fixture();
  let active = [f.touch(1, 120, 150)];
  assert.equal(f.recognizer.handleTouch('start', f.event(active, 1000)), false);
  active.push(f.touch(2, 120, 450));
  assert.equal(f.recognizer.handleTouch('start', f.event(active, 1050)), false);
  active = [f.touch(1, 120, 163), active[1]];
  assert.equal(f.recognizer.handleTouch('move', f.event(active, 1070)), false, 'ordinary pre-recognition movement is not stolen from native zoom');
  active.push(f.touch(3, 680, 150));
  assert.equal(f.recognizer.handleTouch('start', f.event(active, 1100)), false);
  active.push(f.touch(4, 680, 450));
  assert.equal(f.recognizer.handleTouch('start', f.event(active, 1150)), false);
  assert.equal(f.owns, 0);
  f.recognizer.handleTouch('end', f.event([], 1170));
  assert.deepEqual(f.opens, []);
});

test('paired pinch can be entirely left of a zoomed PDF page centre', () => {
  const f = fixture();
  f.holder.getBoundingClientRect = () => ({ left: -400, top: 50, right: 1000, bottom: 1050, width: 1400, height: 1000 });
  const active = beginFour(f, { points: [[40, 150], [40, 450], [200, 150], [200, 450]] });
  assert.equal(f.owns, 1, 'the two groups are split by their own X positions, not the offscreen page centre');
  const converged = active.map((item, index) => f.touch(item.identifier, item.clientX, item.clientY + (index % 2 ? -45 : 45)));
  f.recognizer.handleTouch('move', f.event(converged, 1120));
  f.recognizer.handleTouch('end', f.event([], 1140));
  assert.deepEqual(plain(f.opens), [{ page: 7, band: { y0: .1, y1: .4 } }]);
});

test('paired pinch rejects groups with less than 40px horizontal separation', () => {
  const f = fixture();
  const active = beginFour(f, { points: [[180, 150], [180, 450], [205, 150], [205, 450]] });
  assert.equal(f.owns, 0, '25px-separated groups are too narrow to be a deliberate fold');
  f.recognizer.handleTouch('move', f.event(active, 1120));
  f.recognizer.handleTouch('end', f.event([], 1140));
  assert.deepEqual(f.opens, []);
});

test('gesture feedback stays quiet for native zoom and reports ready, armed, cancellation without document data', () => {
  const f = fixture();
  let active = [f.touch(1, 120, 150)];
  f.recognizer.handleTouch('start', f.event(active, 1000));
  active.push(f.touch(2, 120, 450));
  f.recognizer.handleTouch('start', f.event(active, 1030));
  assert.deepEqual(f.statuses, [], 'one and two fingers remain native gestures without fold feedback');
  active.push(f.touch(3, 680, 150));
  f.recognizer.handleTouch('start', f.event(active, 1060));
  active.push(f.touch(4, 680, 450));
  f.recognizer.handleTouch('start', f.event(active, 1090));
  assert.ok(f.statuses.some(item => item.state === 'ready' && item.fingers === 4));
  const converged = active.map((item, index) => f.touch(item.identifier, item.clientX, item.clientY + (index % 2 ? -45 : 45)));
  f.recognizer.handleTouch('move', f.event(converged, 1120));
  assert.ok(f.statuses.some(item => item.state === 'armed' && item.fingers === 4));
  f.recognizer.handleTouch('cancel', f.event(converged, 1130));
  assert.ok(f.statuses.some(item => item.state === 'cancelled' && item.fingers === 4));
  for (const status of f.statuses) {
    assert.deepEqual(Object.keys(status).sort(), ['fingers', 'reason', 'state'], 'feedback is a small state-only envelope');
    assert.equal(typeof status.reason, 'string');
    assert.equal(typeof status.fingers, 'number');
  }
  assert.deepEqual(f.opens, []);
});

test('owned contacts cannot be replaced, lifted mid-gesture, or moved to another page', () => {
  const replaced = fixture();
  let active = beginFour(replaced);
  active = active.map(item => replaced.touch(item.identifier, item.clientX, item.clientY));
  active[3] = replaced.touch(99, active[3].clientX, active[3].clientY);
  replaced.recognizer.handleTouch('move', replaced.event(active, 1120));
  replaced.recognizer.handleTouch('end', replaced.event([], 1140));
  assert.deepEqual(replaced.opens, []);

  const lifted = fixture();
  active = beginFour(lifted);
  lifted.recognizer.handleTouch('end', lifted.event(active.slice(1), 1110));
  lifted.recognizer.handleTouch('end', lifted.event([], 1120));
  assert.deepEqual(lifted.opens, []);

  const crossedPage = fixture();
  active = beginFour(crossedPage);
  const other = { dataset: { page: '8' }, getBoundingClientRect: crossedPage.holder.getBoundingClientRect };
  active = active.map((item, index) => crossedPage.touch(item.identifier, item.clientX, item.clientY, index === 0 ? other : crossedPage.holder));
  crossedPage.recognizer.handleTouch('move', crossedPage.event(active, 1120));
  crossedPage.recognizer.handleTouch('end', crossedPage.event([], 1140));
  assert.deepEqual(crossedPage.opens, []);
});

test('ordinary one- and two-finger gestures remain unclaimed', () => {
  const f = fixture();
  const one = [f.touch(1, 200, 300)];
  assert.equal(f.recognizer.handleTouch('start', f.event(one, 1000)), false);
  assert.equal(f.recognizer.handleTouch('move', f.event(one, 1030)), false);
  const two = [one[0], f.touch(2, 600, 300)];
  assert.equal(f.recognizer.handleTouch('start', f.event(two, 1040)), false);
  assert.equal(f.recognizer.handleTouch('move', f.event(two, 1060)), false);
  assert.equal(f.owns, 0);
  assert.deepEqual(f.opens, []);
});

test('ordinary taps do not leave the next fold gesture blocked', () => {
  for (const fingerCount of [1, 2]) {
    const f = fixture();
    const touches = [f.touch(11, 200, 300), f.touch(12, 600, 300)].slice(0, fingerCount);
    f.recognizer.handleTouch('start', f.event(touches, 100));
    assert.equal(f.recognizer.handleTouch('end', f.event([], 150)), false);
    const active = converge(f, beginFour(f));
    assert.equal(f.owns, 1, 'a completed ordinary tap cannot block the next gesture');
    f.recognizer.handleTouch('move', f.event(active, 1120));
    f.recognizer.handleTouch('end', f.event([], 1140));
    assert.equal(f.opens.length, 1);
  }
});
