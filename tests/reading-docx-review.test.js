const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'reading.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'reading.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'reading.css'), 'utf8');

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}

function extractFunction(name) {
  const marker = 'async function ' + name + '(';
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return '';
}

function u16(value) { return [value & 255, (value >>> 8) & 255]; }
function u32(value) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]; }
function makeStoredZip(records) {
  const encoder = new TextEncoder();
  const locals = [];
  const central = [];
  let offset = 0;
  records.forEach(record => {
    const name = encoder.encode(record.name);
    const data = encoder.encode(record.text);
    const method = record.deflate ? 8 : 0;
    const packed = record.deflate ? zlib.deflateRawSync(data) : data;
    const local = Uint8Array.from([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(method), ...u16(0), ...u16(0),
      ...u32(0), ...u32(packed.length), ...u32(data.length), ...u16(name.length), ...u16(0),
      ...name, ...packed
    ]);
    locals.push(local);
    central.push(Uint8Array.from([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(method), ...u16(0), ...u16(0),
      ...u32(0), ...u32(packed.length), ...u32(data.length), ...u16(name.length), ...u16(0),
      ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name
    ]));
    offset += local.length;
  });
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = Uint8Array.from([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(records.length), ...u16(records.length),
    ...u32(centralSize), ...u32(offset), ...u16(0)
  ]);
  const total = offset + centralSize + end.length;
  const zip = new Uint8Array(total);
  let at = 0;
  [...locals, ...central, end].forEach(item => { zip.set(item, at); at += item.length; });
  return zip.buffer;
}

async function run() {
  check('the Add menu accepts PDFs and Word drafts', html.includes('id="addDialog"') && html.includes('.docx,application/pdf'));
  check('the reader sidebar has a dedicated Reviews tab', html.includes('data-tab="reviewsPanel"') && html.includes('id="readerReviewList"'));
  check('Word comment ranges become manuscript highlights', source.includes("name==='commentRangeStart'") && source.includes("name==='commentRangeEnd'") && css.includes('.review-comment-anchor'));
  check('review responses and resolved state persist on the chapter', source.includes('comment.response=area.value') && source.includes('comment.resolved=!comment.resolved'));
  check('unlinked feedback is located only through an explicit AI action', html.includes('id="locateReviewsBtn"') && source.includes('locateOneReviewWithAi') && source.includes('runAi(system,user,450,onProgress)'));
  check('the review flow clearly supports one combined Word file', html.includes('id="reviewCombinedFile"') && html.includes('Commented Word manuscript') && source.includes("if(!parsed.comments.length)"));
  check('the review flow clearly supports a manuscript plus separate comments', html.includes('id="reviewPaperFile"') && html.includes('id="reviewCommentsFile"') && source.includes('importSourceFile(paper,null,null,button,true)') && source.includes('importReviewerFile(target,comments,button)'));
  check('a comment-only reviewer Word file can still be attached from the reader sidebar', html.includes('id="importReviewFileBtn"') && source.includes('extractReviewerReportWithAi') && source.includes('importReviewerFile'));
  check('original Word drafts use the same resumable Drive roaming path', source.includes("name:'docx-'+ch.id+'.docx'") && source.includes('binarySourceSpec(ch)'));

  const functionSource = extractFunction('docxZipEntries');
  const context = { ArrayBuffer, Uint8Array, DataView, TextDecoder, Blob, Response, DecompressionStream };
  vm.runInNewContext(functionSource, context);
  const zip = makeStoredZip([
    { name: 'word/document.xml', text: '<w:document><w:p><w:t>Draft body</w:t></w:p></w:document>', deflate: true },
    { name: 'word/comments.xml', text: '<w:comments><w:comment w:id="0"><w:p><w:t>Clarify this.</w:t></w:p></w:comment></w:comments>' },
    { name: 'ignored.bin', text: 'not loaded' }
  ]);
  const entries = await context.docxZipEntries(zip);
  check('the DOCX ZIP reader extracts the manuscript XML', new TextDecoder().decode(entries['word/document.xml']).includes('Draft body'));
  check('the DOCX ZIP reader extracts reviewer comments but skips unrelated assets', new TextDecoder().decode(entries['word/comments.xml']).includes('Clarify this.') && !entries['ignored.bin']);

  process.exit(failures ? 1 : 0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
