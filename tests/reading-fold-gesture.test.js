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
  let owns = 0;
  const recognizer = createRecognizer({ open: (page, band) => opens.push({ page, band }), onOwn: () => owns++ });
  function touch(identifier, x, y, target = holder, kind = 'direct') {
    return {
      identifier, clientX: x, clientY: y, touchType: kind,
      target: { closest: selector => selector === '.pdf-page' ? target : null }
    };
  }
  function event(touches, timeStamp) { return { touches, timeStamp, cancelable: true, preventDefault() {} }; }
  return { holder, opens, recognizer, touch, event, get owns() { return owns; } };
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

test('candidate rejects slow arrival, stylus, cross-page arrivals, and identity replacement', () => {
  const slow = fixture();
  beginFour(slow, { spacing: 70 });
  assert.equal(slow.owns, 0);

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
