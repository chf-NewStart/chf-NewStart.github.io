let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('playwright-core').chromium; }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PHLOEM_LIBRARY_LIST_TEST_PORT || 8144);
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
  await new Promise(resolve => server.listen(PORT, resolve));
  const launch = { headless: true };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.addInitScript(() => {
    if (localStorage.getItem('readingListFixture')) return;
    const stamp = Date.now();
    const paper = (id, title, authors, category, age, readPage, pageCount, tags) => ({
      id, kind: 'text', title, authors, category, tags,
      fr: 'Opening paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\nFourth paragraph.',
      notes: {}, readerNotes: {}, pageNotes: {}, highlights: {}, textHighlights: [], readerHighlights: [], questions: [],
      addedAt: stamp - age - 5000, updatedAt: stamp - age, readPage, pageCount
    });
    localStorage.setItem('readingRoom.v1', JSON.stringify({ chapters: [
      paper('paper_roots', 'Root architecture under drought', 'Lina Mora', 'Plant physiology', 86400000, 1, 4, ['roots', 'water']),
      paper('paper_models', 'Constraint models for carbon allocation', 'Dev Rao', 'Modelling', 1000, 2, 4, ['metabolism']),
      paper('paper_field', '次第花開', '希阿榮博堪布', 'Books', 172800000, 3, 4, ['attention']),
      paper('paper_microbes', 'Rhizosphere communities and nutrient exchange', 'Owen Bell', 'Microbiome', 3600000, 4, 4, ['roots', 'microbes']),
      paper('paper_zinc', 'Zinc signaling in roots', 'Mira Chen', 'Plant physiology', 7200000, 1, 4, ['signaling'])
    ] }));
    localStorage.setItem('readingRoom.theme', 'light');
    localStorage.setItem('readingListFixture', '1');
    localStorage.removeItem('readingRoom.libraryView');
  });

  await page.goto('http://localhost:' + PORT + '/reading.html', { waitUntil: 'load' });
  await page.waitForSelector('#libraryViewToggle');

  const wallButton = page.locator('#libraryViewToggle [data-library-view="wall"]');
  const listButton = page.locator('#libraryViewToggle [data-library-view="list"]');
  check('library offers an explicit Wall / List switch', await wallButton.count() === 1 && await listButton.count() === 1);
  check('the expressive wall remains the default view', await wallButton.getAttribute('aria-pressed') === 'true' && await page.locator('.bookcase').count() === 1);

  await listButton.click();
  await page.waitForSelector('.library-list-row');
  check('switching to List persists the preference', await page.evaluate(() => localStorage.getItem('readingRoom.libraryView')) === 'list');
  check('List exposes its selected state accessibly', await listButton.getAttribute('aria-pressed') === 'true' && await wallButton.getAttribute('aria-pressed') === 'false');
  check('List shows every paper in one flat result set', await page.locator('.library-list-row').count() === 5 && await page.locator('.library-list .paper-category-tab').count() === 0);

  const categoryRail = page.locator('nav.library-list-categories');
  const allCategoriesButton = categoryRail.locator('[data-library-category="all"]');
  check('List provides an explicit category filter rail with All selected',
    await categoryRail.count() === 1
      && await allCategoriesButton.count() === 1
      && await allCategoriesButton.getAttribute('aria-pressed') === 'true');

  const categoryFilters = await categoryRail.locator('[data-library-category]').evaluateAll(buttons => buttons.map(button => ({
    category: button.dataset.libraryCategory,
    label: button.textContent.replace(/\s+/g, ' ').trim(),
    pressed: button.getAttribute('aria-pressed')
  })));
  const categoryCounts = {
    all: 5,
    'Plant physiology': 2,
    Modelling: 1,
    Books: 1,
    Microbiome: 1
  };
  check('category filters include All and every category with paper counts',
    categoryFilters.length === Object.keys(categoryCounts).length
      && categoryFilters.every(filter => /^(?:true|false)$/.test(filter.pressed))
      && Object.entries(categoryCounts).every(([category, count]) => {
        const filter = categoryFilters.find(item => item.category === category);
        return filter && new RegExp('(?:^|\\s)' + count + '$').test(filter.label);
      }),
    JSON.stringify(categoryFilters));

  const plantCategoryButton = categoryRail.locator('[data-library-category="Plant physiology"]');
  await plantCategoryButton.click();
  check('choosing a category filters List to that category',
    await page.locator('.library-list-row').count() === 2
      && await page.locator('.library-list-title').evaluateAll(elements => elements.map(element => element.textContent.trim()).sort().join('|'))
        === 'Root architecture under drought|Zinc signaling in roots');
  check('the active category is exposed with aria-pressed',
    await plantCategoryButton.getAttribute('aria-pressed') === 'true'
      && await allCategoriesButton.getAttribute('aria-pressed') === 'false');
  await allCategoriesButton.click();
  check('All restores the complete flat result set',
    await page.locator('.library-list-row').count() === 5
      && await allCategoriesButton.getAttribute('aria-pressed') === 'true'
      && await plantCategoryButton.getAttribute('aria-pressed') === 'false');

  const visibleCategories = await page.locator('.library-list-category').evaluateAll(elements => Array.from(new Set(elements.map(element => element.textContent.trim()))).sort());
  check('flat rows retain categories from across the library', ['Books', 'Microbiome', 'Modelling', 'Plant physiology'].every(category => visibleCategories.includes(category)), JSON.stringify(visibleCategories));

  const modelRow = page.locator('.library-list-row[data-library-paper="paper_models"]');
  const modelMetadata = await modelRow.evaluate(element => ({
    title: element.querySelector('.library-list-title')?.textContent.trim(),
    author: element.querySelector('.library-list-author')?.textContent.trim(),
    category: element.querySelector('.library-list-category')?.textContent.trim(),
    progress: element.querySelector('.library-list-progress')?.textContent.trim(),
    touched: element.querySelector('.library-list-touched')?.textContent.trim()
  }));
  check('a row presents title, author, category, progress and last touched',
    modelMetadata.title === 'Constraint models for carbon allocation'
      && modelMetadata.author.includes('Dev Rao')
      && modelMetadata.category === 'Modelling'
      && /50%|2\s*(?:of|\/)\s*4/i.test(modelMetadata.progress)
      && /today|<1\s*(?:min|sec)|touched/i.test(modelMetadata.touched),
    JSON.stringify(modelMetadata));

  const modelSelect = page.locator('.library-list-row[data-library-paper="paper_models"] .library-list-select');
  const microbesSelect = page.locator('.library-list-row[data-library-paper="paper_microbes"] .library-list-select');
  check('each List row offers a dedicated selection checkbox',
    await page.locator('.library-list-row .library-list-select').count() === 5
      && await modelSelect.getAttribute('type') === 'checkbox');

  await modelSelect.check();
  await page.waitForFunction(() => document.activeElement?.closest('.library-list-row')?.dataset.libraryPaper === 'paper_models');
  check('selection keeps keyboard focus on the same paper after the bulk bar appears',
    await modelSelect.evaluate(element => document.activeElement === element));
  await plantCategoryButton.click();
  check('changing category filters clears hidden selections before any bulk action',
    await page.locator('.library-list-select:checked').count() === 0
      && !await page.locator('.library-list-bulkbar').isVisible());
  await allCategoriesButton.click();

  await modelSelect.check();
  await microbesSelect.check();
  const bulkbar = page.locator('.library-list-bulkbar');
  await bulkbar.waitFor({ state: 'visible' });
  check('selecting papers reveals a bulk bar with the selection count',
    /2\s+(?:papers?\s+)?selected/i.test((await bulkbar.textContent()).replace(/\s+/g, ' ')),
    (await bulkbar.textContent()).replace(/\s+/g, ' ').trim());

  await bulkbar.locator('.library-list-bulk-move summary').click();
  check('the bulk Move control exposes existing categories',
    await bulkbar.locator('.library-list-bulk-move').getAttribute('open') !== null
      && await bulkbar.locator('[data-bulk-category="Books"]').isVisible());
  await bulkbar.locator('[data-bulk-category="Books"]').click();
  await page.waitForFunction(() => {
    const ids = ['paper_models', 'paper_microbes'];
    return ids.every(id => document.querySelector(`.library-list-row[data-library-paper="${id}"] .library-list-category`)?.textContent.trim() === 'Books');
  });
  check('one existing-category choice moves every selected paper',
    await page.locator('.library-list-row[data-library-paper="paper_models"] .library-list-category').textContent() === 'Books'
      && await page.locator('.library-list-row[data-library-paper="paper_microbes"] .library-list-category').textContent() === 'Books');
  check('a completed bulk move clears the selection',
    await page.locator('.library-list-select:checked').count() === 0
      && !await page.locator('.library-list-bulkbar').isVisible());

  await page.locator('.library-list-row[data-library-paper="paper_models"] .library-list-select').check();
  await page.locator('.library-list-row[data-library-paper="paper_microbes"] .library-list-select').check();
  page.once('dialog', async dialog => {
    check('New category asks for a category name', dialog.type() === 'prompt' && /category/i.test(dialog.message()), dialog.message());
    await dialog.accept('Research queue');
  });
  await page.locator('.library-list-bulk-new').click();
  await page.waitForFunction(() => {
    const ids = ['paper_models', 'paper_microbes'];
    return ids.every(id => document.querySelector(`.library-list-row[data-library-paper="${id}"] .library-list-category`)?.textContent.trim() === 'Research queue');
  });
  check('New category moves every selected paper into the prompted category',
    await page.locator('.library-list-row[data-library-paper="paper_models"] .library-list-category').textContent() === 'Research queue'
      && await page.locator('.library-list-row[data-library-paper="paper_microbes"] .library-list-category').textContent() === 'Research queue'
      && await page.locator('.library-list-select:checked').count() === 0);

  const selectAll = page.locator('.library-list-select-all');
  check('List provides a desktop select-all checkbox',
    await selectAll.count() === 1
      && await selectAll.getAttribute('type') === 'checkbox'
      && await selectAll.isVisible());
  await selectAll.check();
  check('select-all selects every visible result',
    await page.locator('.library-list-select:checked').count() === await page.locator('.library-list-row').count()
      && /5\s+(?:papers?\s+)?selected/i.test((await page.locator('.library-list-bulkbar').textContent()).replace(/\s+/g, ' ')));
  await selectAll.uncheck();
  check('clearing select-all clears the bulk selection',
    await page.locator('.library-list-select:checked').count() === 0
      && !await page.locator('.library-list-bulkbar').isVisible());

  await modelRow.locator('.library-list-more').click();
  check('the compact row menu opens without making the row itself ambiguous', await modelRow.locator('.library-list-actions').getAttribute('open') !== null);
  await modelRow.getByRole('button', { name: 'Move to category…' }).click();
  check('Move to category stays open while its lazy chooser replaces the action panel',
    await modelRow.locator('.library-list-actions').getAttribute('open') !== null
      && await modelRow.locator('.library-list-action-search').isVisible());
  await modelRow.locator('.library-list-action-back').click();
  check('returning from the category chooser keeps the row menu open',
    await modelRow.locator('.library-list-actions').getAttribute('open') !== null
      && await modelRow.getByRole('button', { name: 'Move to category…' }).isVisible());
  await page.keyboard.press('Escape');
  check('Escape closes the row menu and returns focus to its disclosure',
    await modelRow.locator('.library-list-actions').getAttribute('open') === null
      && await modelRow.locator('.library-list-more').evaluate(element => document.activeElement === element));

  await page.selectOption('#librarySort', 'title');
  const titleOrder = await page.locator('.library-list-title').evaluateAll(elements => elements.map(element => element.textContent.trim()));
  check('the existing sort selector orders the flat list', titleOrder.join('|') === [
    'Constraint models for carbon allocation',
    'Rhizosphere communities and nutrient exchange',
    'Root architecture under drought',
    'Zinc signaling in roots',
    '次第花開'
  ].join('|'), JSON.stringify(titleOrder));

  await page.fill('#librarySearch', 'plant physiology');
  check('the existing search finds matching rows by category', await page.locator('.library-list-row').count() === 2);
  check('search keeps the selected sort order', await page.locator('.library-list-title').evaluateAll(elements => elements.map(element => element.textContent.trim()).join('|')) === 'Root architecture under drought|Zinc signaling in roots');
  await page.fill('#librarySearch', '');

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.library-list-row');
  check('List view survives a reload', await page.locator('#libraryViewToggle [data-library-view="list"]').getAttribute('aria-pressed') === 'true' && await page.locator('.library-list-row').count() === 5);
  check('the chosen sort mode also survives the view reload', await page.locator('#librarySort').inputValue() === 'title');

  await page.locator('#libraryViewToggle [data-library-view="wall"]').click();
  await page.waitForSelector('.bookcase');
  check('Wall can be restored without losing papers', await page.evaluate(() => localStorage.getItem('readingRoom.libraryView')) === 'wall' && await page.locator('.paper-sticky-note').count() > 0);
  await page.locator('#libraryViewToggle [data-library-view="list"]').click();
  await page.waitForSelector('.library-list-row');

  await page.locator('.library-list-row[data-library-paper="paper_models"] .library-list-open').click();
  await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden'));
  check('one click on a list row opens its paper', await page.locator('#readerTitle').textContent() === 'Constraint models for carbon allocation');
  await page.click('#readerBack');
  await page.waitForFunction(() => !document.getElementById('libraryPage').classList.contains('hidden'));
  check('returning from a paper keeps List selected', await page.locator('#libraryViewToggle [data-library-view="list"]').getAttribute('aria-pressed') === 'true');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const mobileLayout = await page.evaluate(() => {
    const list = document.querySelector('.library-list');
    const row = document.querySelector('.library-list-row');
    const toggle = document.getElementById('libraryViewToggle');
    const rowBox = row && row.getBoundingClientRect();
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      listOverflow: list ? list.scrollWidth - list.clientWidth : 999,
      rowLeft: rowBox && rowBox.left,
      rowRight: rowBox && rowBox.right,
      rowHeight: rowBox && rowBox.height,
      toggleVisible: !!toggle && getComputedStyle(toggle).display !== 'none'
    };
  });
  check('mobile List fits without horizontal clipping', mobileLayout.documentOverflow <= 1 && mobileLayout.listOverflow <= 1 && mobileLayout.rowLeft >= 0 && mobileLayout.rowRight <= 391, JSON.stringify(mobileLayout));
  check('mobile keeps the view switch available', mobileLayout.toggleVisible && await page.locator('#libraryViewToggle [data-library-view="list"]').isVisible());
  check('mobile rows stay compact enough to scan', mobileLayout.rowHeight > 0 && mobileLayout.rowHeight <= 150, mobileLayout.rowHeight);
  const mobileCategoryRail = await page.locator('nav.library-list-categories').evaluate(element => {
    const box = element.getBoundingClientRect();
    const overflowX = getComputedStyle(element).overflowX;
    element.scrollLeft = element.scrollWidth;
    const scrollable = element.scrollWidth <= element.clientWidth + 1 || element.scrollLeft > 0;
    return {
      visible: box.width > 0 && box.height > 0,
      left: box.left,
      right: box.right,
      overflowX,
      scrollable,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth
    };
  });
  check('mobile keeps the category rail visible and horizontally usable',
    mobileCategoryRail.visible
      && mobileCategoryRail.left >= 0
      && mobileCategoryRail.right <= 391
      && /auto|scroll/.test(mobileCategoryRail.overflowX)
      && mobileCategoryRail.scrollable,
    JSON.stringify(mobileCategoryRail));
  check('list mode has no page errors', errors.length === 0, errors.join('; '));

  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error('FATAL', error);
  server.close();
  process.exit(1);
});
