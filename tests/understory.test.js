const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const factSource = fs.readFileSync(path.join(root, 'tomato-facts.js'), 'utf8');
const understorySource = fs.readFileSync(path.join(root, 'understory/understory.js'), 'utf8');
const understoryHtml = fs.readFileSync(path.join(root, 'understory/index.html'), 'utf8');
const homeHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function loadFacts() {
    const window = {};
    const context = {
        window,
        document: { addEventListener() {} },
        localStorage: { getItem() { return null; }, setItem() {} },
        location: { hostname: 'localhost' }
    };
    vm.runInNewContext(factSource, context);
    return window.UNDERSTORY_FACTS;
}

function loadReflections() {
    const match = understorySource.match(
        /const reflections = (\{[\s\S]*?\n    \});\n\n    const researchThreads/
    );
    assert.ok(match, 'the reflection map remains readable');
    return vm.runInNewContext(`(${match[1]})`);
}

function loadResearchThreads() {
    const match = understorySource.match(
        /const researchThreads = (\[[\s\S]*?\n    \]);\n\n    let activeFilter/
    );
    assert.ok(match, 'the tomato dFBA research trail remains readable');
    return vm.runInNewContext(`(${match[1]})`);
}

function slugify(text) {
    return text.toLowerCase()
        .normalize('NFKD')
        .replace(/[’']/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

test('the popup and Understory share one complete fact collection', () => {
    const facts = loadFacts();
    // The daily fact job keeps growing this list; guard the substantial shared
    // collection without making tomorrow's new entry break today's test.
    assert.ok(facts.length >= 80);
    assert.equal(new Set(facts.map((fact) => fact.title)).size, facts.length);
    facts.forEach((fact) => {
        assert.ok(fact.tag);
        assert.ok(fact.title);
        assert.ok(fact.fact);
    });
});

test('every philosophical reflection points to a real, linkable fact', () => {
    const facts = loadFacts();
    const titles = new Set(facts.map((fact) => fact.title));
    const reflections = loadReflections();
    Object.keys(reflections).forEach((title) => assert.ok(titles.has(title), title));
    const slugs = facts.map((fact) => slugify(fact.title));
    assert.equal(new Set(slugs).size, slugs.length);
});

test('the permanent collection is reachable from both homepage entrances', () => {
    assert.match(homeHtml, /href="\/understory\/"/);
    assert.match(factSource, /href="\/understory\/"/);
    assert.match(understoryHtml, /src="\/tomato-facts\.js"/);
    assert.match(understoryHtml, /src="understory\.js"/);
});

test('the collection is a hook-first semantic field ledger', () => {
    assert.match(understoryHtml, /<table class="fact-ledger">/);
    const hookColumn = understoryHtml.indexOf('Philosophical hook');
    const mechanismColumn = understoryHtml.indexOf('Natural mechanism');
    assert.ok(hookColumn > -1 && hookColumn < mechanismColumn);
    assert.match(understorySource, /element\('td', `hook-cell/);
    assert.match(understorySource, /detailCell\.colSpan = 3/);
});

test('the tomato dFBA notebook has a persistent, checkable paper trail', () => {
    const threads = loadResearchThreads();
    assert.equal(threads.length, 9);
    assert.equal(new Set(threads.map((thread) => thread.id)).size, threads.length);
    threads.forEach((thread) => {
        assert.ok(thread.question);
        assert.ok(thread.observation);
        assert.ok(thread.check);
        assert.ok(thread.notebookPage);
    });
    assert.match(understoryHtml, /id="tomato-dfba"/);
    assert.match(understoryHtml, /<table class="research-ledger">/);
    assert.match(understoryHtml, /href="\/game\/jun22greenhouse\.pdf"/);
    assert.match(understorySource, /understory\.tomatoDfba\.review\.v1/);
    assert.match(understorySource, /function cycleResearchState/);
});
