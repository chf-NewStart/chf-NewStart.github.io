/* Drive the real asynchronous PDF restoration through its two layout-frame waits.
   In particular, a keyboard can close after placement but before the final sample. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(process.env.PHLOEM_POSITION_READER_SOURCE || path.join(__dirname, '..', 'reading.js'), 'utf8');
const start = source.indexOf('  var restoringPdfPosition=false');
const end = source.indexOf('  function savePdfReadingPosition(', start);
assert.ok(start >= 0 && end > start);

function harness() {
  const frames = [];
  const pane = { clientWidth: 500, clientHeight: 438, scrollLeft: 0, scrollTop: 1692.8,
    getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const holder = { getBoundingClientRect: () => ({ left: -pane.scrollLeft, top: -pane.scrollTop, width: 500, height: 4000 }) };
  const context = vm.createContext({
    readerMode: 'pdf', pdfDoc: { numPages: 1 }, currentId: 'paper', currentPage: 1, pdfOpenEpoch: 1,
    pdfViews: [{ holder, pageWidth: 500, pageHeight: 4000, rendered: true }],
    pdfBuildKey: '438', currentBuildKey: () => String(pane.clientHeight),
    normalizedPdfPosition: value => value && { ...value }, byId: () => pane,
    pagedPdfFlow: () => false, pdfPageIndexAtY: () => 0,
    find: () => ({ zoom: 0 }), pdfFit: true, pdfZoom: 1, pdfFoldView: null,
    workspaceOpen: false, workspacePdfZoomBeforeOpen: null, columnZoomState: 'full',
    comfort: { pdfLayout: 'scroll' }, now: () => 1000,
    syncPagedPages() {}, updatePageChrome() {}, updateProgress() {}, showReaderToast() {},
    renderPdfPageAt: async () => {}, requestAnimationFrame() {}
  });
  context.renderPdfPage = async () => { context.pdfBuildKey = String(pane.clientHeight); };
  vm.runInContext(source.slice(start, end), context);
  context.pdfLayoutFrames = () => new Promise(resolve => frames.push(resolve));
  return { context, pane, async frame() {
    for (let attempt = 0; attempt < 20 && !frames.length; attempt++) await Promise.resolve();
    assert.ok(frames.length, 'the restore reached its next frame wait');
    frames.shift()(); await new Promise(setImmediate);
  } };
}
const position = { v: 1, page: 1, x: .5, y: .5, screenX: .5, screenY: .4, layout: 'scroll', zoom: 0, updatedAt: 100 };

test('a keyboard closing during the restore settle cannot replace the intended passage', async () => {
  const h = harness();
  h.context.rememberStablePdfPosition(position);
  const shrinking = h.context.placePdfReadingPosition(position, false, true);
  await h.frame();
  assert.ok(Math.abs(h.pane.scrollTop - 1824.8) < .01, 'the same passage moves above the open keyboard');
  h.pane.clientHeight = 768; // old PDF build is still 438px high until the resize callback runs
  await h.frame(); await shrinking;
  assert.equal(h.context.lastStablePdfPosition.y, .5, 'the old restore must not sample mixed geometry');
  const restore = h.context.stablePdfPositionForRebuild();
  const expanding = h.context.placePdfReadingPosition(restore, false, true);
  await h.frame(); await h.frame(); await expanding;
  assert.ok(Math.abs(h.pane.scrollTop - 1692.8) < .01, 'dismissing the keyboard returns to the original passage');
});

test('a completed restore still records its visible point when the pane is unchanged', async () => {
  const h = harness(), pending = h.context.placePdfReadingPosition(position, false, true);
  await h.frame(); await h.frame();
  assert.equal(await pending, true);
  assert.equal(h.context.lastStablePdfPosition.y, .5);
  assert.equal(h.context.restoringPdfPosition, false);
});

test('reader interaction cancels an outstanding restoration before it can move the paper', async () => {
  const h = harness(), pending = h.context.placePdfReadingPosition(position, false, true);
  h.context.cancelPdfPositionRestore();
  assert.equal(await pending, false);
  assert.equal(h.pane.scrollTop, 1692.8);
  assert.equal(h.context.restoringPdfPosition, false);
});
