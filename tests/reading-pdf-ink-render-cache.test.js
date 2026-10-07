/* PDF ink reconciliation: bounded outline work, content-aware invalidation, and stable
   stacking through merge/erase/Undo. Synthetic DOM tests do not measure Pencil latency. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('playwright-core'); }
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';

test('PDF ink reuses outlines without stale geometry or changed stacking', async t => {
  const executablePath = ENGINE === 'webkit' ? process.env.PHLOEM_WEBKIT_EXECUTABLE_PATH : process.env.CHROME_PATH;
  const browser = await playwright[ENGINE].launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  async function fixture() {
    const page = await browser.newPage();
    await page.setContent('<style>.pdf-sheet{width:1000px;height:1000px;position:relative}</style><div class="pdf-sheet"></div>');
    await page.addScriptTag({ path: path.join(__dirname, '..', 'reading-ink.js') });
    await page.evaluate(() => {
      window.sheet = document.querySelector('.pdf-sheet');
      window.stroke = (id, extra = {}) => ({ id, color: 'black', width: 2.4, style: 'natural', at: 1, updatedAt: 1,
        points: [[.1, .2, .3], [.2, .3, .8], [.3, .2, .5], [.4, .4, .6]], ...extra });
      const set = SVGElement.prototype.setAttribute;
      window.outlineWrites = 0;
      SVGElement.prototype.setAttribute = function (name, value) {
        if (this.tagName === 'path' && name === 'd') window.outlineWrites++;
        return set.call(this, name, value);
      };
    });
    return page;
  }
  try {
    await t.test('one new stroke computes one outline on pages with 100, 500, or 1000 strokes', async () => {
      const page = await fixture();
      try {
        const results = await page.evaluate(() => [100, 500, 1000].map(count => {
          const strokes = Array.from({ length: count }, (_, i) => stroke('seed-' + i));
          const layer = PhloemInk.render(sheet, strokes), nodes = [...layer.children];
          const observer = new MutationObserver(() => {}); observer.observe(layer, { childList: true, subtree: true, attributes: true });
          outlineWrites = 0;
          PhloemInk.render(sheet, [...strokes, stroke('new')]);
          const result = { count, writes: outlineWrites, kept: nodes.filter((node, i) => layer.children[i] === node).length,
            additions: observer.takeRecords().reduce((n, record) => n + record.addedNodes.length, 0) };
          outlineWrites = 0;
          // Loaded/merged records may be fresh objects with identical content.
          PhloemInk.render(sheet, JSON.parse(JSON.stringify([...strokes, stroke('new')])));
          result.unchangedWrites = outlineWrites; result.unchangedMutations = observer.takeRecords().length;
          observer.disconnect(); return result;
        }));
        for (const result of results) {
          assert.equal(result.writes, 1, JSON.stringify(result));
          assert.equal(result.kept, result.count);
          assert.equal(result.additions, 1);
          assert.equal(result.unchangedWrites, 0);
          assert.equal(result.unchangedMutations, 0);
        }
      } finally { await page.close(); }
    });

    await t.test('equal-clock merge winners and in-place edits refresh geometry and color', async () => {
      const page = await fixture();
      try {
        const result = await page.evaluate(() => {
          const original = stroke('same'), layer = PhloemInk.render(sheet, [original]), node = layer.firstChild;
          const remote = stroke('same', { color: 'red', points: [[.5, .5, .8], [.6, .7, .3]] });
          const merged = PhloemInk.merge({ 1: [original] }, {}, { 1: [remote] }, {}).pages[1][0];
          PhloemInk.render(sheet, [merged]);
          const result = { mergedColor: merged.color, fill: node.getAttribute('fill'),
            mergeMatches: node.getAttribute('d') === PhloemInk.pathData(merged, 1), sameNode: layer.firstChild === node };
          merged.points[0][0] = .75; merged.points[1][2] = .9;
          PhloemInk.render(sheet, [merged]);
          result.inPlaceMatches = node.getAttribute('d') === PhloemInk.pathData(merged, 1);
          outlineWrites = 0; merged.color = 'blue'; merged.updatedAt++;
          PhloemInk.render(sheet, [merged]);
          result.colorOnlyWrites = outlineWrites; result.recolored = node.getAttribute('fill');
          return result;
        });
        assert.equal(result.mergedColor, 'red');
        assert.equal(result.fill, '#ba3f35');
        assert(result.mergeMatches && result.sameNode && result.inPlaceMatches);
        assert.equal(result.colorOnlyWrites, 0);
        assert.equal(result.recolored, '#245bc1');
      } finally { await page.close(); }
    });

    await t.test('display options and page aspect invalidate only when their geometry changes', async () => {
      const page = await fixture();
      try {
        const result = await page.evaluate(() => {
          const item = stroke('geometry'), layer = PhloemInk.render(sheet, [item]), node = layer.firstChild;
          const checks = [];
          for (const change of [{ width: 5 }, { style: 'clean' }, { style: 'natural', shape: 'line' },
            { shape: undefined, stabilize: 2 }, { response: [.55, 1] }]) {
            Object.assign(item, change); const before = JSON.stringify(item);
            PhloemInk.render(sheet, [item]);
            checks.push(node.getAttribute('d') === PhloemInk.pathData(item, 1) && before === JSON.stringify(item));
          }
          item.response[1] = .4;
          PhloemInk.render(sheet, [item]); checks.push(node.getAttribute('d') === PhloemInk.pathData(item, 1));
          outlineWrites = 0; sheet.style.width = '500px'; sheet.style.height = '500px';
          PhloemInk.render(sheet, [item]); const uniformResizeWrites = outlineWrites;
          sheet.style.height = '750px'; PhloemInk.render(sheet, [item]);
          return { checks, uniformResizeWrites, sameNode: layer.firstChild === node,
            aspectMatches: node.getAttribute('d') === PhloemInk.pathData(item, 1.5), viewBox: layer.getAttribute('viewBox') };
        });
        assert(result.checks.every(Boolean));
        assert.equal(result.uniformResizeWrites, 0);
        assert(result.sameNode && result.aspectMatches);
        assert.equal(result.viewBox, '0 0 1000 1500');
      } finally { await page.close(); }
    });

    await t.test('merge, erase, restore and reordering preserve input stacking and other nodes', async () => {
      const page = await fixture();
      try {
        const result = await page.evaluate(() => {
          const a = stroke('a', { color: 'red' }), b = stroke('b', { color: 'blue' }), c = stroke('c');
          const layer = PhloemInk.render(sheet, [b, c]), bNode = layer.firstChild, cNode = layer.lastChild;
          const merged = PhloemInk.merge({ 1: [b, c] }, {}, { 1: [a] }, {});
          PhloemInk.render(sheet, merged.pages[1]); const aNode = layer.firstChild;
          const order = () => [...layer.children].map(node => node.dataset.inkId);
          const result = { merged: order(), mergedKept: layer.children[1] === bNode && layer.children[2] === cNode };
          const erased = PhloemInk.merge(merged.pages, {}, {}, { b: 2 });
          PhloemInk.render(sheet, erased.pages[1]);
          result.erased = order(); result.removed = !bNode.isConnected;
          const restored = PhloemInk.merge(erased.pages, erased.deleted, { 1: [{ ...b, updatedAt: 3 }] }, {});
          PhloemInk.render(sheet, restored.pages[1]);
          result.restored = order(); result.restoreKept = layer.firstChild === aNode && layer.lastChild === cNode;
          PhloemInk.render(sheet, [...restored.pages[1]].reverse()); result.reversed = order();
          result.reorderKept = layer.firstChild === cNode && layer.lastChild === aNode;
          layer.firstChild.classList.add('pdf-ink-erasing');
          PhloemInk.render(sheet, [...restored.pages[1]].reverse()); result.clearedErase = !layer.querySelector('.pdf-ink-erasing');
          layer.remove(); const rebuilt = PhloemInk.render(sheet, restored.pages[1]);
          result.newLayer = rebuilt !== layer && rebuilt.children.length === 3;
          return result;
        });
        assert.deepEqual(result.merged, ['a', 'b', 'c']);
        assert.deepEqual(result.erased, ['a', 'c']);
        assert.deepEqual(result.restored, ['a', 'b', 'c']);
        assert.deepEqual(result.reversed, ['c', 'b', 'a']);
        assert(result.mergedKept && result.removed && result.restoreKept && result.reorderKept && result.clearedErase && result.newLayer);
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
});
