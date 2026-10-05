// Regression test for scripts/add-daily-fact.js, the script the daily
// GitHub Action runs. It copies the real queue and fact library into a temp
// folder, runs the script there, and checks that today's fact lands at the
// top of the library. Run with: node --test tests/daily-fun-fact.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');

function sandbox(queue) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-fact-'));
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.copyFileSync(path.join(root, 'scripts', 'add-daily-fact.js'), path.join(dir, 'scripts', 'add-daily-fact.js'));
    fs.copyFileSync(path.join(root, 'tomato-facts.js'), path.join(dir, 'tomato-facts.js'));
    fs.writeFileSync(path.join(dir, 'fun-facts-queue.json'), JSON.stringify(queue));
    return dir;
}

function run(dir) {
    const output = path.join(dir, 'github-output');
    fs.writeFileSync(output, '');
    execFileSync(process.execPath, [path.join(dir, 'scripts', 'add-daily-fact.js')], {
        env: { ...process.env, GITHUB_OUTPUT: output },
        stdio: 'pipe'
    });
    return fs.readFileSync(output, 'utf8');
}

function firstFact(dir) {
    const source = fs.readFileSync(path.join(dir, 'tomato-facts.js'), 'utf8');
    const at = source.indexOf('const facts = [');
    const end = source.indexOf('\n        },', at);
    return vm.runInNewContext(`(${source.slice(at + 'const facts = ['.length, end + '\n        }'.length)})`);
}

const sample = {
    tag: 'TEST',
    title: 'Daily fact regression sample',
    fact: 'A fact body.',
    detail: 'A detail body.'
};

test('every entry in the real queue has the shape the script needs', () => {
    const queue = JSON.parse(fs.readFileSync(path.join(root, 'fun-facts-queue.json'), 'utf8'));
    assert.ok(Array.isArray(queue));
    for (const entry of queue) {
        const fact = typeof entry.fact === 'object' ? entry.fact : entry;
        assert.equal(typeof fact.title, 'string', JSON.stringify(entry).slice(0, 120));
        assert.equal(typeof fact.fact, 'string', fact.title);
    }
});

test('adds a flat queue entry, as refill-fact-queue.py writes it', () => {
    const dir = sandbox([sample, { ...sample, title: 'Second' }]);
    const output = run(dir);
    assert.match(output, /title=Daily fact regression sample/);
    assert.deepEqual(firstFact(dir), sample);
    const left = JSON.parse(fs.readFileSync(path.join(dir, 'fun-facts-queue.json'), 'utf8'));
    assert.deepEqual(left.map(f => f.title), ['Second']);
});

test('still adds the older wrapped entry with a glossary term', () => {
    const dir = sandbox([{ fact: sample, glossary: { zzregressionterm: 'A test term.' } }]);
    run(dir);
    assert.deepEqual(firstFact(dir), sample);
    assert.match(fs.readFileSync(path.join(dir, 'tomato-facts.js'), 'utf8'), /"zzregressionterm": "A test term\."/);
});

test('an empty queue changes nothing', () => {
    const dir = sandbox([]);
    const before = fs.readFileSync(path.join(dir, 'tomato-facts.js'), 'utf8');
    run(dir);
    assert.equal(fs.readFileSync(path.join(dir, 'tomato-facts.js'), 'utf8'), before);
});
