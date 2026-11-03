/* For my research (Houfu, Nov 2026: "how the passage relates to, differs from or helps my
   research"). A research profile of about 400 words (question, system, methods, what is new,
   open problems), filled by hand, drafted from a library paper, or pasted from the reader's
   own AI. Under a selected passage, For my research answers in up to three lines that name
   the profile field they bear on, or "No clear link to your work.", which the prompt
   prefers to an invented link. One tap keeps the answer with the passage in Clips. The
   profile syncs with the library and goes to no other AI action; on-device Gemini runs it
   where the browser has it, and a cloud provider is named before it first receives it.
   Run with PHLOEM_BROWSER=chromium (default) or webkit. */
const fs = require('fs');
const http = require('http');
const path = require('path');
let playwright; try { playwright = require('playwright'); } catch (e) { playwright = require('playwright-core'); }

const ROOT = process.env.PHLOEM_ROOT || path.resolve(__dirname, '..');
const ENGINE = process.env.PHLOEM_BROWSER || 'chromium';
let transform = null; // the iPad bundle's HTML and reader transforms, loaded for the last part
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost'), pathname = url.pathname === '/' ? '/reading.html' : decodeURIComponent(url.pathname);
  const native = url.searchParams.has('native') || (req.headers.referer || '').includes('native=1');
  const file = path.join(ROOT, pathname.startsWith('/native/') ? '/apps/ipad' + pathname : pathname);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    if (native && transform && pathname === '/reading.html') data = transform.nativeHtml(data.toString());
    if (native && transform && pathname === '/reading.js') data = transform.nativeReaderJs(data.toString());
    const type = file.endsWith('.html') ? 'text/html' : /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
});
let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) + ']' : ''));
  if (!ok) failures++;
}

/* 1. Without a browser: the prompts, the parsers and the sync rule, lifted out of reading.js. */
{
  const src = fs.readFileSync(path.join(ROOT, 'reading.js'), 'utf8');
  const from = src.indexOf('  var RESEARCH_ROUTE_KEY='), to = src.indexOf('  function researchProfile(){');
  const api = new Function(src.slice(from, to) + '\nreturn {normalizeResearchProfile, researchProfileReady, researchWordCount, newerResearchProfile, researchRelevancePrompt, parseResearchRelevance, parseResearchDraft, researchPastePrompt, researchOpening, researchFieldKey};')();
  const profile = api.normalizeResearchProfile({ question: 'How does night-time starch turnover set sugar supply to tomato fruit?', system: 'Tomato (Solanum lycopersicum) source leaves and fruit', methods: 'Dynamic flux balance analysis (dFBA) fitted to diurnal export', novelty: '', open: 'Phloem unloading rates in fruit are unmeasured', updatedAt: 5 });
  const prompt = api.researchRelevancePrompt(profile, { title: 'Sucrose export', excerpt: 'EXCERPT-AROUND', passage: 'PASSAGE-ITSELF', question: '' });
  check('the prompt allows and prefers no clear link over an invented one', /reply with exactly: NONE/.test(prompt.system) && /prefer it to a link that is generic/.test(prompt.system) && /Judge only what the selected passage and the excerpt around it actually say/.test(prompt.system));
  check('the prompt asks each line to name the profile field it bears on', /SUPPORTS \| <field>/.test(prompt.system) && /one of: Research question, System, Methods, What is new, Open problems\./.test(prompt.system));
  check('the prompt carries the profile, the excerpt and the passage, and skips empty fields',
    prompt.user.includes('Research question: How does night-time') && prompt.user.includes('EXCERPT-AROUND') && prompt.user.includes('PASSAGE-ITSELF') && !prompt.user.includes('What I claim is new:') && !/reading list/.test(prompt.user));
  const listed = api.researchRelevancePrompt(profile, { title: 'Sucrose export', excerpt: 'E', passage: 'P', question: 'Does starch limit fruit sugar?' });
  check('a reading-list "My question" joins the prompt and the allowed fields', listed.user.includes('My question for this paper (from my reading list): Does starch limit fruit sugar?') && /Open problems, My question\./.test(listed.system));

  const parsed = api.parseResearchRelevance('SUPPORTS | Methods | They fit dFBA to diurnal export too.\nDIFFERS | System | Arabidopsis leaves, not tomato fruit.\nUSE | Open problems | cite as a precedent for unloading.', false).lines;
  check('three lines are read with their kinds and fields', JSON.stringify(parsed.map(l => [l.kind, l.field])) === JSON.stringify([['supports', 'methods'], ['differs', 'system'], ['use', 'open']]) && parsed[0].text === 'They fit dFBA to diurnal export too.');
  check('NONE, an empty reply and a rambling one all read as no clear link',
    api.parseResearchRelevance('NONE', false).lines.length === 0 && api.parseResearchRelevance('', false).lines.length === 0 &&
    api.parseResearchRelevance('This passage is broadly relevant to many projects in plant science and could inform your work.', false).lines.length === 0);
  check('a line naming no profile field is dropped, so a vague link is not shown', api.parseResearchRelevance('SUPPORTS | Everything | it is all related', false).lines.length === 0);
  check('NONE first wins over lines after it', api.parseResearchRelevance('NONE\nSUPPORTS | Methods | maybe', false).lines.length === 0);
  check('at most one line of each kind, three in all', api.parseResearchRelevance('SUPPORTS | Methods | a\nSUPPORTS | System | b\nDIFFERS | Methods | c\nUSE | Research question | d\nUSE | System | e', false).lines.map(l => l.kind).join() === 'supports,differs,use');
  check('light Markdown and "Kind (Field): text" still parse', api.parseResearchRelevance('- **Supports** (Methods): same model\n2. Differs · System / organism: other species', false).lines.map(l => l.kind + ':' + l.field).join() === 'supports:methods,differs:system');
  check('"My question" lines count only when a reading-list question was sent', api.parseResearchRelevance('USE | My question | answers it', false).lines.length === 0 && api.parseResearchRelevance('USE | My question | answers it', true).lines[0].field === 'list');

  const pasted = api.parseResearchDraft('Sure! Here is your profile.\n\n**Research question:** How does starch turnover\nset fruit sugar supply?\n## System / organism\nTomato leaves and fruit\n- Methods: dFBA\n**What I claim is new:** A diurnal model\nOpen problems: Unloading is unmeasured');
  check('a pasted answer with headings fills all five fields, Markdown and preamble ignored', pasted && pasted.question === 'How does starch turnover\nset fruit sugar supply?' && pasted.system === 'Tomato leaves and fruit' && pasted.methods === 'dFBA' && pasted.novelty === 'A diurnal model' && pasted.open === 'Unloading is unmeasured', pasted);
  const fromJson = api.parseResearchDraft('```json\n{"question":"Q","system":"S","methods":"M","novelty":"N","open":""}\n```');
  check('a JSON draft fills its fields', fromJson && fromJson.question === 'Q' && fromJson.novelty === 'N' && fromJson.open === '');
  check('text with none of the headings is not a draft', api.parseResearchDraft('I could not read the attachment.') === null);
  const copy = api.researchPastePrompt();
  check('the prompt to copy asks for the five headings, grounded in the reader\'s own documents', ['Research question:', 'System / organism:', 'Methods:', 'What I claim is new:', 'Open problems:'].every(h => copy.includes(h)) && /leave a heading empty rather than guess/.test(copy));

  const filler = 'Carbon moves from leaves to fruit through the phloem in every tomato plant we grew. '.repeat(24);
  const opening = api.researchOpening('Abstract\nWe model sugar flow. ' + filler + '\n2. Materials and Methods\nSECRET-METHODS-DETAIL plants were grown.');
  check('a draft reads the abstract and introduction, stopping at the methods heading', opening.startsWith('Abstract') && opening.includes('Carbon moves') && !opening.includes('SECRET-METHODS-DETAIL'));
  check('the words of the profile are counted for the 400-word limit', api.researchWordCount({ question: 'one two three', system: '', methods: 'four', novelty: '', open: 'five six' }) === 6);
  check('a newer synced profile wins whole and an older one does not',
    api.newerResearchProfile({ question: 'here', updatedAt: 10 }, { question: 'there', updatedAt: 20 }).question === 'there' &&
    api.newerResearchProfile({ question: 'here', updatedAt: 30 }, { question: 'there', updatedAt: 20 }) === null &&
    api.newerResearchProfile(undefined, { question: 'first', updatedAt: 1 }).question === 'first' && api.newerResearchProfile({ question: 'here', updatedAt: 1 }, undefined) === null);
  check('an emptied profile with a newer clock is a deletion that syncs', (() => { const gone = api.newerResearchProfile({ question: 'here', updatedAt: 1 }, { question: '', updatedAt: 9 }); return gone && gone.updatedAt === 9 && !api.researchProfileReady(gone); })());
  check('a malformed synced value is ignored', api.normalizeResearchProfile('text') === null && api.normalizeResearchProfile([1]) === null && api.newerResearchProfile({ question: 'here', updatedAt: 3 }, { question: 7, updatedAt: 'soon' }) === null);
  const payloads = src.match(/readingLists:(?:state|snapshot)\.readingLists,researchProfile:(?:state|snapshot)\.researchProfile/g) || [];
  check('the profile rides in all three sync payloads (GitHub encrypted file, Drive, iCloud)', payloads.length === 3, payloads.length);
  const others = ['  async function explainSelection(', '  async function aiGlossaryEntry(', '  function askSelectionNote(', '  async function askAi(', '  function useSelectionForAi('].map(name => { const at = src.indexOf(name); return at < 0 ? '' : src.slice(at, src.indexOf('\n  }\n', at)); });
  check('no other AI action reads the profile', others.every(body => body && !/researchProfile|RESEARCH/.test(body)), others.map(body => body.length));
}

const now = Date.now();
const PAPER_A = ['Phloem loading in tomato source leaves sets how much sucrose reaches the fruit.',
  'We fitted a dynamic flux balance model to diurnal leaf export measured by carbon labelling.',
  'The model predicted that starch turnover at night buffers export to the sinks.',
  'Leaf area index varied little between the cultivars we compared.'];
const FILLER = 'Carbon moves from leaves to fruit through the phloem in every tomato plant we grew. '.repeat(24);
const MANUSCRIPT = ['Abstract', 'I model carbon partitioning in tomato with dynamic flux balance analysis.', 'Introduction', FILLER, 'Materials and Methods', 'SECRET-METHODS-DETAIL the plants were grown in a chamber.'];
function seed(withProfile) {
  return (args) => {
    if (localStorage.getItem('readingRoom.v1')) return;
    const { paperA, manuscript, stamp, withProfile } = args;
    const base = { notes: {}, pageNotes: {}, tags: [], questions: [], textHighlights: [], aiThreads: [], termLookups: {}, reviews: {} };
    const state = { chapters: [
      Object.assign({ id: 'paper-a', kind: 'text', title: 'Sucrose export in tomato leaves', authors: 'Tester', fr: paperA.join('\n\n'), addedAt: stamp, updatedAt: stamp, lastOpenedAt: stamp }, base),
      Object.assign({ id: 'my-manuscript', kind: 'text', title: 'My manuscript draft', authors: 'Me', fr: manuscript.join('\n\n'), addedAt: stamp - 9000, updatedAt: stamp - 9000, lastOpenedAt: stamp - 9000 }, base)
    ], deleted: {}, merged: {}, categoryOrder: [], categoryOrderUpdatedAt: 0, savedAt: stamp,
      readingLists: { version: 1, lists: [{ id: 'thesis', name: 'Thesis reading', rank: 0, createdAt: stamp, updatedAt: stamp }],
        items: [{ id: 'item-a', listId: 'thesis', kind: 'paper', title: 'Sucrose export in tomato leaves', paperId: 'paper-a', note: 'Does night-time starch turnover limit fruit sugar?', takeaway: '', done: false, rank: 0, createdAt: stamp, updatedAt: stamp }], deleted: {} } };
    if (withProfile) state.researchProfile = { v: 1, question: 'How does night-time starch turnover set sugar supply to tomato fruit?', system: 'Tomato leaves and fruit', methods: 'dFBA fitted to diurnal export', novelty: 'A diurnal source-sink model', open: 'Unloading in fruit is unmeasured', updatedAt: stamp - 1000 };
    localStorage.setItem('readingRoom.v1', JSON.stringify(state));
    localStorage.setItem('readingRoom.lastOpen.v1', 'paper-a');
    localStorage.setItem('readingRoom.activeList.v1', 'thesis');
  };
}
// On-device Gemini, scripted: each prompt is recorded and answered from a queue.
function fakeDeviceAi() {
  window.__prompts = []; window.__replies = [];
  window.__deviceAi = {
    availability: async () => 'available',
    // The system prompt arrives when the session is created, the reader's turn with prompt().
    create: async options => {
      const system = options && (options.initialPrompts ? options.initialPrompts[0].content : options.systemPrompt) || '';
      return { prompt: async text => { window.__prompts.push(system + '\n---\n' + text); return window.__replies.length ? window.__replies.shift() : 'NONE'; }, destroy() {} };
    }
  };
  window.LanguageModel = window.__deviceAi;
  window.confirm = () => true;
  const clip = { writeText: async text => { window.__copied = text; } };
  try { Object.defineProperty(navigator, 'clipboard', { value: clip, configurable: true }); } catch (e) {}
}
async function selectIn(page, index, from, to, touch) {
  await page.evaluate(({ index, from, to, touch }) => {
    const node = document.querySelectorAll('#textDocument .original')[index], box = node.getBoundingClientRect(), type = touch ? 'touch' : 'mouse';
    node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: type, clientX: box.left + 3, clientY: box.top + 8 }));
    const range = document.createRange(); range.setStart(node.firstChild, from); range.setEnd(node.firstChild, Math.min(to, node.firstChild.textContent.length));
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
    node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: type, clientX: box.left + 30, clientY: box.top + 8 }));
  }, { index, from, to, touch });
  await page.waitForFunction(() => !document.getElementById('selectionCard').classList.contains('hidden'));
}
const state = page => page.evaluate(() => JSON.parse(localStorage.getItem('readingRoom.v1')));
const answerShown = page => page.waitForFunction(() => !document.getElementById('lookupCard').classList.contains('hidden') && document.getElementById('lookupTitle').textContent === 'For your research' &&
  !document.getElementById('lookupResearchKeep').classList.contains('hidden'), null, { timeout: 8000 });
const lines = page => page.evaluate(() => [...document.querySelectorAll('#lookupResearchLines li')].filter(li => li.offsetParent).map(li => li.querySelector('b').textContent + '|' + li.querySelector('.lookup-research-field').textContent));

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await playwright[ENGINE].launch({ headless: true });
  const args = { paperA: PAPER_A, manuscript: MANUSCRIPT, stamp: now };
  try {
    /* 2. A laptop: set the profile up from the card, then read passages against it. */
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
      const page = await context.newPage(), errors = [], openai = [];
      page.on('pageerror', error => errors.push(error.message));
      await context.route('https://api.openai.com/**', async route => { openai.push(route.request().postData() || ''); await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ output_text: 'SUPPORTS | Research question | Night export falls when starch runs low, as you propose.' }) }); });
      await page.addInitScript(seed(false), Object.assign({ withProfile: false }, args));
      await page.addInitScript(fakeDeviceAi);
      await page.goto(origin + '/reading.html', { waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelectorAll('#textDocument .original').length === 4 && !document.getElementById('readerPage').classList.contains('hidden'));

      await selectIn(page, 1, 0, 60);
      const tiles = await page.evaluate(() => {
        const box = id => document.getElementById(id).getBoundingClientRect(), grid = box('selectionSecondary');
        return { research: box('selectionResearch'), define: box('selectionExplain'), park: box('selectionParkQuestion'), clips: box('selectionSaveExcerpt'), grid, label: document.querySelector('#selectionResearch span').textContent };
      });
      check('the selection card offers For my research as a seventh action', tiles.label === 'For my research' && tiles.research.width > 0, tiles.label);
      check('it spans a slim row of its own, so the six tiles keep their size', tiles.research.width > tiles.define.width * 2.5 && tiles.research.top >= tiles.park.bottom && tiles.research.height <= tiles.define.height && Math.abs(tiles.clips.width - tiles.define.width) < 1,
        { research: Math.round(tiles.research.width), define: Math.round(tiles.define.width), height: Math.round(tiles.research.height) });
      check('the selection card still fits the screen', await page.evaluate(() => { const r = document.getElementById('selectionCard').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));

      await page.click('#selectionResearch');
      await page.waitForFunction(() => document.getElementById('researchDialog').open);
      check('without a profile the button leads to profile setup', await page.locator('#researchStatus').textContent().then(text => /Set up your profile first/.test(text)) && !(await page.locator('#researchDelete').isVisible()));
      check('setup states where the profile goes: on this device when on-device Gemini is there', /stays on this device/.test(await page.locator('#researchWhere').textContent()) && !(await page.locator('#researchRoute').isVisible()));
      check('the dialog names its five fields', JSON.stringify(await page.locator('.research-fields .field-label').allTextContents()) === JSON.stringify(['Research question', 'System / organism', 'Methods', 'What I claim is new', 'Open problems']));

      // (c) Paste from your AI: copy the prompt, paste the answer back, edit, save.
      await page.click('[data-research-fill="paste"]');
      await page.click('#researchPromptCopy');
      await page.waitForFunction(() => /Prompt copied/.test(document.getElementById('researchStatus').textContent));
      check('Copy prompt copies the ready-made prompt, which can also be read in place', await page.evaluate(() => (window.__copied || '').includes('What I claim is new:') && window.__copied === document.getElementById('researchPromptText').value));
      await page.fill('#researchPaste', '**Research question:** How does night-time starch turnover set sugar supply to tomato fruit?\n**System / organism:** Tomato leaves and fruit\n**Methods:** dFBA fitted to diurnal export\n**What I claim is new:** A diurnal source-sink model\n**Open problems:** Unloading in fruit is unmeasured');
      await page.click('#researchPasteFill');
      check('the pasted answer fills the five fields as a draft', await page.inputValue('#researchQuestion') === 'How does night-time starch turnover set sugar supply to tomato fruit?' && await page.inputValue('#researchOpen') === 'Unloading in fruit is unmeasured');
      check('nothing is saved until Save', !(await state(page)).researchProfile);
      await page.fill('#researchNovelty', 'word '.repeat(420).trim());
      check('over 400 words the count warns and Save waits', /420|4\d\d of 400 words: shorten/.test(await page.locator('#researchCount').textContent()) && await page.locator('#researchSave').isDisabled());
      await page.fill('#researchNovelty', 'A diurnal source-sink model');
      check('back under the limit Save is ready', !(await page.locator('#researchSave').isDisabled()) && /^\d+ of 400 words$/.test(await page.locator('#researchCount').textContent()));

      // Saving runs For my research on the passage that was selected.
      await page.evaluate(() => { window.__replies.push('SUPPORTS | Methods | They fit a dynamic flux balance model to diurnal export, as you do.\nDIFFERS | System | Measured in leaves only, not in fruit.\nUSE | Open problems | cite as a precedent for night-time export limits.'); });
      await page.click('#researchSave');
      await answerShown(page);
      const saved = (await state(page)).researchProfile;
      check('Save stores the profile with the library, stamped for sync', saved && saved.question.startsWith('How does night-time') && saved.methods === 'dFBA fitted to diurnal export' && saved.updatedAt >= now);
      check('the answer card is titled For your research', await page.locator('#lookupTitle').textContent() === 'For your research' && /against your profile/i.test(await page.locator('#lookupCard .lookup-eyebrow').textContent()));
      check('it gives up to three short lines that name the profile field', JSON.stringify(await lines(page)) === JSON.stringify(['Supports|Methods', 'Differs|System / organism', 'Use it for|Open problems']));
      check('the source says who answered: on this device', /Gemini Nano \(on device\) · verify/.test(await page.locator('#lookupSource').textContent()));
      const prompt = await page.evaluate(() => window.__prompts[window.__prompts.length - 1]);
      check('the prompt carried the profile, the passage and its surrounding excerpt', prompt.includes('Research question: How does night-time starch') && prompt.includes('Selected passage:\nWe fitted a dynamic flux balance model') && prompt.includes('Excerpt around the passage:') && /reply with exactly: NONE/.test(prompt));
      check('the reading list\'s "My question" for this paper is included', prompt.includes('My question for this paper (from my reading list): Does night-time starch turnover limit fruit sugar?'));

      // One tap keeps the answer with the passage in Clips.
      await page.click('#lookupResearchKeep');
      await page.waitForFunction(() => (JSON.parse(localStorage.getItem('readingRoom.v1')).chapters[0].readingExcerpts || { items: [] }).items.length === 1);
      const clip = (await state(page)).chapters[0].readingExcerpts.items[0];
      check('Keep saves the passage to Clips with the answer as its note', clip.quote.startsWith('We fitted a dynamic flux balance model') && /^For my research \(Gemini Nano \(on device\), /.test(clip.note) && clip.note.includes('Supports · Methods: They fit a dynamic flux') && clip.note.includes('Use it for · Open problems:'), clip.note);
      check('and says so, opening Clips at that clip', /kept in Clips/i.test(await page.locator('#readerToast').textContent()) && await page.locator('#excerptsPanel').isVisible());
      if (await page.locator('#sheetClose').isVisible()) await page.click('#sheetClose');
      await page.waitForFunction(() => !document.getElementById('sheetScrim') || getComputedStyle(document.getElementById('sheetScrim')).pointerEvents === 'none' || !document.getElementById('sheetScrim').offsetParent);

      // No clear link is a first-class answer.
      await selectIn(page, 3, 0, 50);
      await page.evaluate(() => window.__replies.push('NONE'));
      await page.click('#selectionResearch');
      await answerShown(page);
      check('"NONE" shows the single line "No clear link to your work."', await page.locator('#lookupDefinition').textContent() === 'No clear link to your work.' && (await lines(page)).length === 0);
      await selectIn(page, 3, 0, 40);
      await page.evaluate(() => window.__replies.push('This passage is broadly relevant to your work on plants and could help in many ways.'));
      await page.click('#selectionResearch');
      await answerShown(page);
      check('a reply that names no field is no clear link, not invented relevance', await page.locator('#lookupDefinition').textContent() === 'No clear link to your work.' && (await lines(page)).length === 0);

      // The profile goes to no other AI action.
      const before = await page.evaluate(() => window.__prompts.length);
      await page.evaluate(() => window.__replies.push('It says leaf area barely differed between the cultivars.'));
      await page.click('#selectionMeaning');
      await page.waitForFunction(n => window.__prompts.length > n && /leaf area/.test(document.getElementById('lookupDefinition').textContent), before, { timeout: 8000 })
        .catch(async error => { console.log('DEBUG', JSON.stringify(await page.evaluate(() => ({ prompts: window.__prompts.length, replies: window.__replies, def: document.getElementById('lookupDefinition').textContent, title: document.getElementById('lookupTitle').textContent, card: !document.getElementById('selectionCard').classList.contains('hidden'), lookup: !document.getElementById('lookupCard').classList.contains('hidden') })))); throw error; });
      const meaning = await page.evaluate(() => window.__prompts[window.__prompts.length - 1]);
      check('"What does it mean?" never carries the profile', !/starch turnover set sugar supply|Research profile|reading list/.test(meaning) && meaning.includes('Leaf area index'));
      check('the Define card is back to itself afterwards', await page.locator('#lookupCard .lookup-eyebrow').textContent() === 'Definition for selection' && !(await page.locator('#lookupResearchKeep').isVisible()) && !(await page.locator('#lookupResearchLines').isVisible()));

      // (b) Draft from a paper in my library: its abstract and introduction only; Save still decides.
      // Desk settings live on the library masthead, reached with the reader's X.
      await page.click('#selectionClose');
      await page.click('#zenExit');
      await page.locator('#libraryPage').waitFor({ state: 'visible' });
      await page.click('#settingsBtn');
      await page.waitForFunction(() => document.getElementById('settingsDialog').open);
      check('settings show the saved profile and how it is read', await page.locator('#researchSettingsSection').isVisible() && /Saved · \d+ words · read on this device/.test(await page.locator('#researchSettingsStatus').textContent()) && await page.locator('#researchSettingsOpen').textContent() === 'Edit research profile');
      await page.evaluate(() => window.__replies.push('{"question":"How is carbon partitioned in tomato?","system":"Tomato","methods":"dFBA","novelty":"","open":"Fruit unloading"}'));
      await page.click('#researchSettingsOpen');
      await page.waitForFunction(() => document.getElementById('researchDialog').open);
      await page.click('[data-research-fill="paper"]');
      check('the library papers are offered, with the route named', (await page.locator('#researchPaper option').allTextContents()).includes('My manuscript draft') && /reads the first pages \(abstract and introduction\)/.test(await page.locator('#researchPaperNote').textContent()));
      await page.selectOption('#researchPaper', 'my-manuscript');
      const drafts = await page.evaluate(() => window.__prompts.length);
      await page.click('#researchPaperDraft');
      await page.waitForFunction(() => /Drafted from “My manuscript draft”/.test(document.getElementById('researchStatus').textContent), null, { timeout: 8000 });
      const draftPrompt = await page.evaluate(n => window.__prompts[n], drafts);
      check('drafting sends the abstract and introduction, not the methods after them', draftPrompt.includes('I model carbon partitioning in tomato') && draftPrompt.includes('Carbon moves from leaves') && !draftPrompt.includes('SECRET-METHODS-DETAIL'));
      check('the draft fills the fields it has, keeps the rest, and is not saved yet', await page.inputValue('#researchQuestion') === 'How is carbon partitioned in tomato?' && await page.inputValue('#researchNovelty') === 'A diurnal source-sink model' &&
        (await state(page)).researchProfile.question.startsWith('How does night-time'));
      await page.click('[data-close="researchDialog"]');
      await page.click('[data-close="settingsDialog"]');
      await page.click('[data-continue-paper="paper-a"]');
      await page.waitForFunction(() => !document.getElementById('readerPage').classList.contains('hidden') && document.querySelectorAll('#textDocument .original').length === 4);

      // A cloud provider is named before it first receives the profile, and on-device is preferred.
      await page.evaluate(() => { localStorage.setItem('readingRoom.ai.providers.v1', JSON.stringify({ provider: 'openai', providers: { openai: { key: 'test-key', model: 'gpt-5-mini', endpoint: '' } } })); });
      await page.evaluate(() => { window.__replies.push('NONE'); });
      await selectIn(page, 2, 0, 50);
      await page.click('#selectionResearch');
      await answerShown(page);
      check('with both on-device Gemini and a provider set up, on-device is used', openai.length === 0 && /on device/.test(await page.locator('#lookupSource').textContent()));
      await page.evaluate(() => { delete window.LanguageModel; });
      await selectIn(page, 2, 0, 50);
      await page.click('#selectionResearch');
      await page.waitForFunction(() => !document.getElementById('lookupResearchSend').classList.contains('hidden'));
      check('the first press with a provider names it and where the profile goes, and sends nothing yet',
        openai.length === 0 && /OpenAI \(api\.openai\.com\)/.test(await page.locator('#lookupDefinition').textContent()) && /unpublished work/.test(await page.locator('#lookupDefinition').textContent()) && await page.locator('#lookupResearchSend').textContent() === 'Send to OpenAI');
      await page.click('#lookupResearchSend');
      await answerShown(page);
      check('after the yes, the provider receives the profile and answers', openai.length === 1 && openai[0].includes('night-time starch turnover set sugar supply') && JSON.stringify(await lines(page)) === JSON.stringify(['Supports|Research question']) && /^OpenAI · verify/.test(await page.locator('#lookupSource').textContent()));
      await selectIn(page, 0, 0, 40);
      await page.click('#selectionResearch');
      await answerShown(page);
      check('later presses with the same provider go straight through', openai.length === 2);
      await page.evaluate(() => { window.LanguageModel = window.__deviceAi; });
      await page.click('#lookupResearchProfile');
      await page.waitForFunction(() => document.getElementById('researchDialog').open);
      check('setup offers the choice when both exist, on-device first', await page.locator('#researchRoute').isVisible() && await page.locator('#researchRoute input[value="device"]').isChecked() && /OpenAI/.test(await page.locator('#researchRouteProvider').textContent()));
      await page.check('#researchRoute input[value="provider"]');
      check('choosing the provider says plainly that the profile is sent to it', /go to OpenAI \(api\.openai\.com\)/.test(await page.locator('#researchWhere').textContent()));
      await page.check('#researchRoute input[value="device"]');

      // Delete: an emptied, newer profile (so the deletion syncs); the button leads to setup again.
      await page.click('#researchDelete');
      const gone = (await state(page)).researchProfile;
      check('Delete empties the profile with a newer clock', gone && !gone.question && !gone.methods && gone.updatedAt > saved.updatedAt);
      await page.click('[data-close="researchDialog"]');
      await selectIn(page, 1, 0, 30);
      await page.click('#selectionResearch');
      await page.waitForFunction(() => document.getElementById('researchDialog').open);
      check('after Delete the button leads to setup again', await page.locator('#researchDialog').isVisible());
      check('no page errors on a laptop', errors.length === 0, errors.join('; '));
      await context.close();
    }

    /* 3. A phone: the seventh action waits under More without crowding it. */
    {
      const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: ENGINE !== 'webkit' ? true : undefined, userAgent: IPHONE, serviceWorkers: 'block' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(seed(true), Object.assign({ withProfile: true }, args));
      await page.addInitScript(fakeDeviceAi);
      await page.goto(origin + '/reading.html', { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.classList.contains('phone-ui') && document.querySelectorAll('#textDocument .original').length === 4);
      await selectIn(page, 1, 0, 40, true);
      check('the phone row stays Define, Highlight, Copy, More', JSON.stringify(await page.locator('#selectionPhoneRow button span').allTextContents()) === JSON.stringify(['Define', 'Highlight', 'Copy', 'More']) && !(await page.locator('#selectionResearch').isVisible()));
      await page.click('#selectionPhoneMore');
      const phone = await page.evaluate(() => {
        const box = id => document.getElementById(id).getBoundingClientRect(), shown = [...document.querySelectorAll('#selectionSecondary > button')].filter(b => b.offsetParent).map(b => b.id);
        return { shown, research: box('selectionResearch'), meaning: box('selectionMeaning'), park: box('selectionParkQuestion'), card: box('selectionCard'), height: innerHeight };
      });
      check('More shows it as a full-width row below the three tiles, which keep one row', JSON.stringify(phone.shown) === JSON.stringify(['selectionMeaning', 'selectionSaveExcerpt', 'selectionParkQuestion', 'selectionResearch']) &&
        Math.abs(phone.meaning.top - phone.park.top) < 1 && phone.research.top >= phone.park.bottom && phone.research.width > phone.meaning.width * 2.5, phone);
      check('it is a full touch target and the card stays on screen', phone.research.height >= 44 && phone.card.top >= 0 && phone.card.bottom <= phone.height, phone);
      await page.evaluate(() => window.__replies.push('USE | Methods | cite in related work as a precedent for diurnal dFBA.'));
      await page.click('#selectionResearch');
      await answerShown(page);
      const card = await page.evaluate(() => document.getElementById('selectionCard').getBoundingClientRect());
      check('the answer opens in the card on a phone, on screen', JSON.stringify(await lines(page)) === JSON.stringify(['Use it for|Methods']) && card.top >= 0 && card.bottom <= 844);
      check('no page errors on a phone', errors.length === 0, errors.join('; '));
      await context.close();
    }

    /* 4. A PDF: the passage and the text of its page reach the prompt, and Keep anchors the clip to the page. */
    {
      const { PDFDocument, StandardFonts } = require('pdf-lib');
      const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica), sheet = doc.addPage([612, 792]);
      ['Sieve tube loading in tomato minor veins', 'Night export fell by a third when leaf starch ran out early.', 'Fruit sugar tracked the export measured at dawn.']
        .forEach((line, i) => sheet.drawText(line, { x: 60, y: 700 - i * 30, size: 14, font }));
      const pdf = Buffer.from(await doc.save());
      const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(seed(true), Object.assign({ withProfile: true }, args));
      await page.addInitScript(fakeDeviceAi);
      await page.goto(origin + '/reading.html', { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.classList.contains('library-ready'));
      await page.locator('#pdfFile').setInputFiles({ name: 'night-export.pdf', mimeType: 'application/pdf', buffer: pdf });
      await page.waitForFunction(() => [...document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')].some(span => span.textContent.includes('Night export')), null, { timeout: 15000 });
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const span = [...document.querySelectorAll('.pdf-page[data-page="1"] .text-layer span')].find(element => element.textContent.includes('Night export')), node = span.firstChild;
        const range = document.createRange(); range.setStart(node, node.textContent.indexOf('Night export')); range.setEnd(node, node.textContent.indexOf('Night export') + 'Night export fell by a third'.length);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
        document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', pointerId: 41 }));
      });
      await page.waitForFunction(() => !document.getElementById('selectionCard').classList.contains('hidden'));
      await page.evaluate(() => window.__replies.push('SUPPORTS | Research question | Night export fell when leaf starch ran out early.'));
      await page.click('#selectionResearch');
      await answerShown(page);
      const prompt = await page.evaluate(() => window.__prompts[window.__prompts.length - 1]);
      check('on a PDF the passage and the text of its page reach the prompt', prompt.includes('Selected passage:\nNight export fell by a third') && prompt.includes('Fruit sugar tracked the export') && JSON.stringify(await lines(page)) === JSON.stringify(['Supports|Research question']));
      await page.click('#lookupResearchKeep');
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('readingRoom.v1')).chapters.some(ch => ch.kind === 'pdf' && ch.readingExcerpts && ch.readingExcerpts.items.length === 1), null, { timeout: 8000 });
      const kept = (await state(page)).chapters.find(ch => ch.kind === 'pdf').readingExcerpts.items[0];
      check('Keep anchors the clip to its PDF page, with the answer', kept.anchor.kind === 'pdf' && kept.anchor.page === 1 && kept.quote === 'Night export fell by a third' && kept.note.includes('Supports · Research question: Night export fell'), kept.anchor);
      check('no page errors on a PDF', errors.length === 0, errors.join('; '));
      await context.close();
    }

    /* 5. Sync: the profile goes up with the library and a newer copy from another device comes down. */
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(seed(true), Object.assign({ withProfile: true }, args));
      await page.addInitScript(() => localStorage.setItem('readingRoom.gdrive.v1', JSON.stringify({ on: true, tok: 'test-token', tokAt: Date.now(), email: 'reader@example.com' })));
      const drive = { body: null, version: 0 };
      await context.route('https://accounts.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
      await context.route('https://www.googleapis.com/**', async route => {
        const request = route.request(), url = request.url(), method = request.method();
        if (url.includes('/drive/v3/files?') && method === 'GET') return route.fulfill({ json: { files: drive.body ? [{ id: 'lib', name: 'carrel-library.json', size: String(drive.body.length), version: String(drive.version) }] : [] } });
        if (url.includes('/drive/v3/files/lib?alt=media')) return route.fulfill({ contentType: 'application/json', body: drive.body });
        if (url.includes('/upload/drive/v3/files/lib?uploadType=media') && method === 'PATCH') { drive.body = request.postData(); drive.version++; return route.fulfill({ json: { id: 'lib', version: String(drive.version) } }); }
        if (url.includes('uploadType=multipart') && method === 'POST') { const parts = request.postData().split(/\r\n--phloem\d+/); drive.body = parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n'); drive.version++; return route.fulfill({ json: { id: 'lib', version: String(drive.version) } }); }
        return route.fulfill({ status: 503, body: '' });
      });
      // Settings › Google Drive › Sync now, as a reader would after editing on another device.
      const syncNow = async () => {
        const version = drive.version;
        await page.click('#gdriveSyncBtn');
        for (let i = 0; i < 100 && drive.version === version; i++) await page.waitForTimeout(100);
      };
      await page.goto(origin + '/reading.html', { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.classList.contains('library-ready') && !document.getElementById('readerPage').classList.contains('hidden'));
      await page.click('#zenExit');
      await page.locator('#libraryPage').waitFor({ state: 'visible' });
      await page.click('#settingsBtn');
      await page.waitForFunction(() => document.getElementById('settingsDialog').open);
      await syncNow();
      check('the profile is uploaded with the library', drive.body && JSON.parse(drive.body).researchProfile && JSON.parse(drive.body).researchProfile.question.startsWith('How does night-time'));
      const newer = JSON.parse(drive.body);
      newer.researchProfile = Object.assign({}, newer.researchProfile, { question: 'Edited on the iPad', updatedAt: Date.now() + 5000 });
      drive.body = JSON.stringify(newer); drive.version++;
      await syncNow();
      await page.waitForFunction(() => (JSON.parse(localStorage.getItem('readingRoom.v1')).researchProfile || {}).question === 'Edited on the iPad', null, { timeout: 8000 }).catch(() => {});
      check('a newer profile from another device replaces this one', (await state(page)).researchProfile.question === 'Edited on the iPad', { local: (await state(page)).researchProfile, version: drive.version, status: await page.locator('#gdriveStatus').textContent(), signal: await page.locator('#syncSignal').textContent() });
      const older = JSON.parse(drive.body);
      older.researchProfile = Object.assign({}, older.researchProfile, { question: 'Stale copy', updatedAt: 1 });
      drive.body = JSON.stringify(older); drive.version++;
      await syncNow();
      await page.waitForTimeout(400);
      check('an older copy does not', (await state(page)).researchProfile.question === 'Edited on the iPad');
      check('no page errors while syncing', errors.length === 0, errors.join('; '));
      await context.close();
    }

    /* 6. The iPad app: For my research is hidden wherever cloud AI is (China mainland storefront). */
    {
      transform = await import(require('url').pathToFileURL(path.join(ROOT, 'apps/ipad/scripts/build-web.mjs')).href);
      const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(seed(true), Object.assign({ withProfile: true }, args));
      await page.addInitScript(() => {
        window.Capacitor = { isNativePlatform: () => true, Plugins: { PhloemAI: {
          status: async () => ({ providers: [], consentedProviders: [], consentVersion: 2, countryCode: 'CHN', storefrontKnown: true, cloudAIAllowed: false }),
          addListener: (event, listener) => { if (event === 'storefrontChanged') window.__storefront = listener; return Promise.resolve({ remove() {} }); }
        } } };
      });
      await page.goto(origin + '/reading.html?native=1', { waitUntil: 'load' });
      await page.waitForFunction(() => document.documentElement.classList.contains('phloem-ai-region-restricted') && document.querySelectorAll('#textDocument .original').length === 4);
      await selectIn(page, 1, 0, 40);
      const hidden = await page.evaluate(() => ({ button: getComputedStyle(document.getElementById('selectionResearch')).display, settings: getComputedStyle(document.getElementById('researchSettingsSection')).display, meaning: getComputedStyle(document.getElementById('selectionMeaning')).display }));
      check('in the China mainland storefront the button and its settings are hidden, like What does it mean?', hidden.button === 'none' && hidden.settings === 'none' && hidden.meaning === 'none', hidden);
      await page.evaluate(() => window.__storefront({ countryCode: 'CAN', storefrontKnown: true, cloudAIAllowed: true }));
      await page.waitForFunction(() => !document.documentElement.classList.contains('phloem-ai-region-restricted'));
      check('where cloud AI is allowed it shows', await page.locator('#selectionResearch').isVisible());
      await page.click('#zenExit');
      await page.locator('#libraryPage').waitFor({ state: 'visible' });
      await page.click('#settingsBtn');
      await page.waitForFunction(() => document.getElementById('settingsDialog').open);
      check('the iPad disclosure names the research profile among what a provider receives', /For my research also sends the research profile you wrote/.test(await page.locator('#aiProviderNote').textContent()) && await page.locator('#researchSettingsSection').isVisible());
      check('no page errors in the iPad bundle', errors.length === 0, errors.join('; '));
      await context.close();
    }
  } catch (error) {
    console.error('FATAL', error);
    failures++;
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures ? failures + ' FAILED (' + ENGINE + ')' : 'All passed (' + ENGINE + ')');
  process.exit(failures ? 1 : 0);
})();
