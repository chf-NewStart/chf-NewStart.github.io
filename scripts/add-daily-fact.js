#!/usr/bin/env node
// Pops the next fact off fun-facts-queue.json and prepends it to the
// `facts` array in tomato-facts.js, where facts[0] is featured as the
// first fact every visitor sees. Run by the daily-fun-fact workflow.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const queuePath = path.join(repoRoot, 'fun-facts-queue.json');
const libraryPath = path.join(repoRoot, 'tomato-facts.js');

const FACTS_MARKER = 'const facts = [';
const GLOSSARY_MARKER = 'const GLOSSARY = {';

function serializeFact(fact) {
    const outer = ' '.repeat(8);
    const inner = ' '.repeat(12);
    const lines = Object.entries(fact)
        .map(([key, value]) => `${inner}${key}: ${JSON.stringify(value)}`);
    return `\n${outer}{\n${lines.join(',\n')}\n${outer}},`;
}

const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
if (!Array.isArray(queue) || queue.length === 0) {
    console.log('Queue is empty — nothing to add today.');
    process.exit(0);
}

const { fact, glossary = {} } = queue.shift();
let library = fs.readFileSync(libraryPath, 'utf8');

if (library.includes(JSON.stringify(fact.title))) {
    throw new Error(`Fact already in library: ${fact.title}`);
}

const factsAt = library.indexOf(FACTS_MARKER);
if (factsAt === -1) throw new Error('facts array marker not found');
const insertAt = factsAt + FACTS_MARKER.length;
library = library.slice(0, insertAt) + serializeFact(fact) + library.slice(insertAt);

for (const [term, definition] of Object.entries(glossary)) {
    const key = term.toLowerCase();
    if (new RegExp(`['"]${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*:`, 'i').test(library)) {
        continue; // already defined
    }
    const glossaryAt = library.indexOf(GLOSSARY_MARKER);
    if (glossaryAt === -1) throw new Error('GLOSSARY marker not found');
    const at = glossaryAt + GLOSSARY_MARKER.length;
    library = library.slice(0, at) +
        `\n        ${JSON.stringify(key)}: ${JSON.stringify(definition)},` +
        library.slice(at);
}

fs.writeFileSync(libraryPath, library);
fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n');

// A syntax error here must fail the workflow before anything is committed.
execFileSync(process.execPath, ['--check', libraryPath], { stdio: 'inherit' });

console.log(`Added fact: ${fact.title}`);
console.log(`Remaining in queue: ${queue.length}`);
if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `title=${fact.title.replace(/[\r\n]/g, ' ')}\n`);
}
if (queue.length <= 5) {
    console.log(`::warning::Fun-fact queue is running low (${queue.length} left) — time to research more facts.`);
}
