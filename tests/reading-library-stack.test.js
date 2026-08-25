let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0] === '/' ? '/reading.html' : req.url.split('?')[0];
  const file = path.join(ROOT, pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}

(async () => {
  await new Promise(resolve => server.listen(8130, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.addInitScript(() => {
    if (sessionStorage.getItem('readingStackKeepState')) return;
    const stamp = Date.now();
    const paper = (id, title, authors, tags, age) => ({ id, kind: 'text', title, authors, tags, fr: 'A short test paper.', notes: {}, pageNotes: {}, questions: [], addedAt: stamp - age, updatedAt: stamp - age, readPage: 1 });
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [
      paper('paper_roots', 'Root architecture under drought', 'Lina Mora', ['Plant physiology'], 0),
      paper('paper_models', 'Constraint models for carbon allocation', 'Dev Rao', ['Modelling'], 1000),
      paper('paper_field', 'Field observations across seasons', 'Maya Chen', [], 2000),
      paper('paper_microbes', 'Rhizosphere communities and nutrient exchange', 'Owen Bell', ['Microbiome'], 3000)
    ] }));
    localStorage.setItem('readingRoom.theme', 'light');
  });

  await page.goto('http://localhost:8130/reading.html', { waitUntil: 'load' });
  await page.waitForSelector('.paper-category-tab.is-selected');

  check('left pane is labelled as a reading wall', await page.locator('.pile-head strong').textContent() === 'Reading wall');
  check('right field notebook remains present', await page.locator('.open-book-wrap .closed-book').count() === 1);
  check('all papers share one category highlighter for now', await page.locator('.paper-category-tab').count() === 1);
  check('shared category is explicitly Unsorted', await page.locator('.paper-category-mark').textContent() === 'Unsorted');
  check('shared category reports its paper count', await page.locator('.paper-category-count').textContent() === '4');
  check('one sticky note remains for every paper', await page.locator('.category-note-grid .paper-sticky-note').count() === 4);
  const firstTwoNotes = await page.locator('.category-note-grid .paper-sticky-note').evaluateAll(elements => elements.slice(0, 2).map(element => ({ x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y, width: element.getBoundingClientRect().width })));
  check('sticky notes return to two per row', firstTwoNotes.length === 2 && Math.abs(firstTwoNotes[0].y - firstTwoNotes[1].y) < 2 && firstTwoNotes[1].x > firstTwoNotes[0].x, JSON.stringify(firstTwoNotes));
  check('sticky notes are compact instead of full-sheet width', firstTwoNotes.every(note => note.width < 230), JSON.stringify(firstTwoNotes));
  check('sticky keeps the handwritten title and author', await page.locator('[data-shelf-paper="paper_models"]').textContent().then(text => text.includes('Constraint models') && text.includes('Dev Rao')));
  check('sticky title uses the Houfu handwriting face', await page.locator('[data-shelf-paper="paper_models"] .book-title').evaluate(element => getComputedStyle(element).fontFamily.includes('Houfu Hand')));
  check('category is a large handwritten highlighter', await page.locator('.paper-category-mark').evaluate(element => parseFloat(getComputedStyle(element).fontSize) >= 17 && getComputedStyle(element, '::before').backgroundImage !== 'none'));
  check('category rail is fixed outside the scrolling note surface', await page.evaluate(() => {
    const rail = document.querySelector('.paper-category-rail');
    const surface = document.querySelector('.paper-note-surface');
    return rail && surface && rail.parentElement === surface.parentElement && !surface.contains(rail);
  }));
  check('category highlighters expose horizontal scrolling', await page.locator('.paper-category-rail').evaluate(element => {
    const style = getComputedStyle(element);
    return style.overflowX === 'auto' && style.scrollbarWidth === 'thin';
  }));
  check('large ruled category sheet is gone', await page.locator('.paper-stack-entry').count() === 0 && await page.locator('.paper-note-surface').evaluate(element => !getComputedStyle(element).backgroundImage.includes('repeating-linear-gradient')));

  const dayWall = await page.evaluate(() => ({
    bookcase: getComputedStyle(document.querySelector('.bookcase')).backgroundColor,
    noteSurface: getComputedStyle(document.querySelector('.paper-note-surface')).backgroundColor,
    stickyPaper: getComputedStyle(document.querySelector('.paper-sticky-note')).backgroundImage,
    handwriting: getComputedStyle(document.querySelector('.paper-sticky-note .book-title')).color
  }));
  await page.click('#themeBtn');
  const nightWall = await page.evaluate(() => {
    const pixel = value => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d'); context.fillStyle = value; context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };
    return {
      bookcase: pixel(getComputedStyle(document.querySelector('.bookcase')).backgroundColor),
      noteSurface: pixel(getComputedStyle(document.querySelector('.paper-note-surface')).backgroundColor),
      stickyPaper: getComputedStyle(document.querySelector('.paper-sticky-note')).backgroundImage,
      handwriting: getComputedStyle(document.querySelector('.paper-sticky-note .book-title')).color
    };
  });
  check('night reading wall uses a deep green canvas instead of the gray daylight mix', nightWall.bookcase.every(channel => channel < 45), JSON.stringify(nightWall.bookcase));
  check('night sticky well is dark enough to recede behind the notes', nightWall.noteSurface.every(channel => channel < 50), JSON.stringify(nightWall.noteSurface));
  check('night mode preserves the sticky-note paper colors', nightWall.stickyPaper === dayWall.stickyPaper);
  check('night mode preserves the blue handwritten ink', nightWall.handwriting === dayWall.handwriting);
  await page.click('#themeBtn');
  check('daylight wall materials stay unchanged after a night-mode round trip', await page.evaluate(expected => {
    return getComputedStyle(document.querySelector('.bookcase')).backgroundColor === expected.bookcase
      && getComputedStyle(document.querySelector('.paper-note-surface')).backgroundColor === expected.noteSurface
      && getComputedStyle(document.querySelector('.paper-sticky-note .book-title')).color === expected.handwriting;
  }, dayWall));

  await page.locator('[data-shelf-paper="paper_models"]').click({ position: { x: 120, y: 20 } });
  check('clicking a sticky selects it without opening the reader', await page.locator('#libraryPage').evaluate(element => !element.classList.contains('hidden')));
  check('the unchanged right notebook follows the selected paper', await page.locator('.closed-book-title').textContent() === 'Constraint models for carbon allocation');

  check('new-category control is available', await page.locator('#newCategoryBtn').count() === 1);
  page.once('dialog', dialog => dialog.accept('Models'));
  await page.click('#newCategoryBtn');
  check('new category is created from the selected sticky', await page.locator('.paper-category-tab').count() === 2 && await page.locator('.paper-category-tab.is-selected .paper-category-mark').textContent() === 'Models');

  page.once('dialog', dialog => dialog.accept('Metabolic models'));
  await page.locator('.paper-category-tab.is-selected .paper-category-edit').click();
  check('category name can be changed from its highlighter', await page.locator('.paper-category-tab.is-selected .paper-category-mark').textContent() === 'Metabolic models');

  await page.locator('.paper-category-tab').filter({ hasText: 'Unsorted' }).locator('.paper-category-open').click();
  const fieldSticky = page.locator('[data-shelf-paper="paper_field"]').locator('xpath=..');
  await fieldSticky.locator('.paper-category-move').click();
  check('move opens a clickable category picker', await fieldSticky.locator('.paper-category-menu').isVisible());
  check('picker lists the existing destination without typing', await fieldSticky.locator('.paper-category-choice').filter({ hasText: 'Metabolic models' }).count() === 1);
  check('picker has a category search field', await fieldSticky.locator('.paper-category-search').isVisible());
  check('picker results are vertically scrollable', await fieldSticky.locator('.paper-category-options').evaluate(element => getComputedStyle(element).overflowY === 'auto'));
  await fieldSticky.locator('.paper-category-search').fill('metabolic');
  check('category search filters the destination list', await fieldSticky.locator('.paper-category-options .paper-category-choice').evaluateAll(elements => elements.filter(element => !element.hidden).map(element => element.textContent)).then(names => names.length === 1 && names[0] === 'Metabolic models'));
  await fieldSticky.locator('.paper-category-choice').filter({ hasText: 'Metabolic models' }).click();
  await page.locator('.paper-category-tab').filter({ hasText: 'Metabolic models' }).locator('.paper-category-open').click();
  check('sticky can move into another category', await page.locator('.category-note-grid .paper-sticky-note').count() === 2 && await page.locator('.paper-category-tab.is-selected .paper-category-count').textContent() === '2');
  check('category changes persist with papers', await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.filter(ch => ch.category === 'Metabolic models').length === 2));

  await page.locator('.paper-category-tab').filter({ hasText: 'Unsorted' }).locator('.paper-category-open').click();
  const rootSticky = page.locator('[data-shelf-paper="paper_roots"]').locator('xpath=..');
  await rootSticky.locator('.paper-sticky-grip').dragTo(page.locator('.paper-category-tab').filter({ hasText: 'Metabolic models' }));
  check('a sticky can be dragged directly onto a category', await page.locator('.paper-category-tab.is-selected .paper-category-mark').textContent() === 'Metabolic models' && await page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.find(ch => ch.id === 'paper_roots').category === 'Metabolic models'));
  check('sticky drag target receives the moved paper', await page.locator('.category-note-grid .paper-sticky-note').count() === 3);

  await page.fill('#librarySearch', 'Metabolic models');
  check('search finds papers by category name', await page.locator('.category-note-grid .paper-sticky-note').count() === 3);
  await page.fill('#librarySearch', '');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const mobile = await page.locator('.bookcase').boundingBox();
  const mobileFirstTwo = await page.locator('.category-note-grid .paper-sticky-note').evaluateAll(elements => elements.slice(0, 2).map(element => ({ x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y, width: element.getBoundingClientRect().width })));
  check('mobile stack stays compact above the notebook', mobile && mobile.height <= 285, mobile && mobile.height);
  check('mobile keeps the requested two-note row', mobileFirstTwo.length === 2 && Math.abs(mobileFirstTwo[0].y - mobileFirstTwo[1].y) < 2 && mobileFirstTwo[1].x > mobileFirstTwo[0].x, JSON.stringify(mobileFirstTwo));
  check('move-category control stays visible without hover on mobile', await page.locator('.category-note-grid .paper-category-move').first().evaluate(element => Number(getComputedStyle(element).opacity) > 0.6));

  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('readingRoom.v1'));
    const stamp = Date.now() - 100000;
    for (let i = 1; i <= 12; i++) data.chapters.push({ id: 'paper_topic_' + i, kind: 'text', title: 'Paper in topic ' + i, authors: 'Field Reader', category: 'Topic ' + i, tags: [], fr: 'Test paper.', notes: {}, pageNotes: {}, questions: [], addedAt: stamp - i, updatedAt: stamp - i, readPage: 1 });
    localStorage.setItem('readingRoom.v1', JSON.stringify(data));
    sessionStorage.setItem('readingStackKeepState', '1');
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.paper-category-tab.is-selected');
  check('many category highlighters actually overflow into a scrollable row', await page.locator('.paper-category-rail').evaluate(element => element.scrollWidth > element.clientWidth));
  const crowdedSticky = page.locator('.paper-sticky-wrap').first();
  await crowdedSticky.locator('.paper-category-move').click();
  check('many move destinations actually overflow into a scrollable list', await crowdedSticky.locator('.paper-category-options').evaluate(element => element.scrollHeight > element.clientHeight));
  await crowdedSticky.locator('.paper-category-search').fill('Topic 11');
  check('search finds one category in a long list', await crowdedSticky.locator('.paper-category-options .paper-category-choice').evaluateAll(elements => elements.filter(element => !element.hidden).map(element => element.textContent)).then(names => names.length === 1 && names[0] === 'Topic 11'));
  await crowdedSticky.locator('.paper-category-search').press('Escape');

  const draggedCategory = page.locator('.paper-category-tab[data-category-name="Metabolic models"]');
  await draggedCategory.locator('.paper-category-grip').dragTo(page.locator('.paper-category-tab').first(), { targetPosition: { x: 2, y: 20 } });
  const orderAfterDrag = await page.locator('.paper-category-mark').evaluateAll(elements => elements.map(element => element.textContent));
  check('dragging a category changes its position', orderAfterDrag[0] === 'Metabolic models', JSON.stringify(orderAfterDrag.slice(0, 5)));
  check('dragged category order is saved with a timestamp', await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('readingRoom.v1'));
    return data.categoryOrder[0] === 'Metabolic models' && data.categoryOrderUpdatedAt > 0;
  }));
  await page.locator('.paper-category-tab').first().locator('.paper-category-step.next').click();
  check('move arrows provide a touch-friendly reorder fallback', await page.locator('.paper-category-mark').nth(1).textContent() === 'Metabolic models');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.paper-category-tab.is-selected');
  check('custom category order survives a reload', await page.locator('.paper-category-mark').nth(1).textContent() === 'Metabolic models');
  check('reading wall has no page errors', errors.length === 0, errors.join('; '));

  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
