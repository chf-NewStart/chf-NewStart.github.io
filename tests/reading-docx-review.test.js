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
  const asyncMarker = 'async function ' + name + '(';
  const syncMarker = 'function ' + name + '(';
  const start = source.indexOf(asyncMarker) >= 0 ? source.indexOf(asyncMarker) : source.indexOf(syncMarker);
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
  check('unlinked feedback is located only through an explicit AI action', html.includes('id="locateReviewsBtn"') && source.includes('locateOneReviewWithAi') && source.includes('runAi(system,user,650,onProgress)'));
  check('the review flow clearly supports one combined Word file', html.includes('id="reviewCombinedFile"') && html.includes('Commented Word manuscript') && source.includes("if(!parsed.comments.length)"));
  check('the review flow clearly supports a manuscript plus separate comments', html.includes('id="reviewPaperFile"') && html.includes('id="reviewCommentsFile"') && source.includes('importSourceFile(paper,null,null,button,true)') && source.includes('importReviewerFile(target,comments,button)'));
  check('a comment-only reviewer Word file can still be attached from the reader sidebar', html.includes('id="importReviewFileBtn"') && source.includes('extractReviewerReportWithAi') && source.includes('importReviewerFile'));
  check('review concerns are classified by scope and topic', html.includes('id="reviewerFilters"') && source.includes('REVIEW_LEVEL_LABELS') && source.includes('REVIEW_TOPIC_LABELS') && css.includes('.reviewer-classification'));
  check('long response-to-reviewers files are chunked instead of truncated', source.includes('function reviewReportChunks') && !source.includes("String(text||'').slice(0,30000)"));
  check('Word formatting distinguishes reviewer text from author replies', source.includes('paragraphRoles:reviewRoles') && source.includes("'REVIEWER TEXT'") && source.includes("'AUTHOR RESPONSE'"));
  check('PDF review navigation stays in the original PDF', extractFunction('focusReviewerPassage').includes('gotoPdfPage(page)') && !extractFunction('focusReviewerPassage').includes("readerMode='text'"));
  check('review packages are filed in a dedicated Under review category', source.includes("REVIEW_WORKSPACE_CATEGORY='Under review'") && source.includes('placeInReviewWorkspace(target)') && source.includes('placeInReviewWorkspace(ch)'));
  check('PDF review matches remain visible and clickable on the paper', source.includes('renderPdfReviewMarkers') && source.includes('pdfReviewAtPoint') && source.includes('showReviewerComment(find(currentId),review.comment.id,review.page)') && css.includes('.review-comment-highlight'));
  check('one reviewer concern can link every distinct PDF passage it cites', source.includes('comment.pdfAnchors=valid') && source.includes('"matches"') && source.includes('up to four') && source.includes('reviewer-passage-links'));
  check('explicit manuscript page references survive even if AI omits them', source.includes("method:'review-page-reference'") && source.includes('explicit.forEach(function(page)'));
  check('older nine-comment imports visibly ask for a replacement re-import', source.includes('extractorVersion:2') && source.includes('This review used the older summary importer'));
  check('legacy summary matches are suppressed until the source report is re-imported', source.includes('comment.legacyImport=!!legacyReviewReports') && source.includes("if(comment.legacyImport){comment.anchored=false"));
  check('broad restructuring feedback is not forced onto a coincidental passage', source.includes('function stabilizedReviewLevel') && source.includes("level='section'") && source.includes('Section-wide · no single passage named'));
  check('PDF matches must use candidate pages and a confidence threshold', source.includes('reviewCandidatePdfPages') && source.includes('confidence<.55') && source.includes('allowed=pageCandidates.some'));
  check('an invented quote no longer falls back to the whole paragraph', !source.includes("if(start<0){quote=text;start=0;}"));
  check('original Word drafts use the same resumable Drive roaming path', source.includes("name:'docx-'+ch.id+'.docx'") && source.includes('binarySourceSpec(ch)'));

  const reviewContext = {};
  vm.runInNewContext([
    extractFunction('paras'),
    extractFunction('reviewNormalizedText'),
    extractFunction('reviewQuoteRange'),
    extractFunction('reviewExplicitPages'),
    extractFunction('reviewReportChunks'),
    extractFunction('reviewReportUnits')
  ].join('\n'), reviewContext);
  const pageRefs = reviewContext.reviewExplicitPages({ text: 'See pp. 18–20 and page 31.' }, 34);
  check('explicit page ranges seed the PDF candidate set', JSON.stringify(pageRefs) === JSON.stringify([18, 19, 20, 31]), pageRefs.join(','));
  const mainOnlyRefs = reviewContext.reviewExplicitPages({ text: 'Supplementary p. 13 differs; main manuscript p. 7 needs the correction.' }, 34);
  check('supplement page numbers are not mistaken for main-PDF pages', JSON.stringify(mainOnlyRefs) === JSON.stringify([7]), mainOnlyRefs.join(','));
  const dualRefs = reviewContext.reviewExplicitPages({ text: 'The control description on p. 6 conflicts with the model description on p. 15.' }, 34);
  check('one comment can seed both manuscript locations it explicitly compares', JSON.stringify(dualRefs) === JSON.stringify([6, 15]), dualRefs.join(','));
  const fuzzyQuote = reviewContext.reviewQuoteRange('The model reconstructs the oxygen distribution from a local constraint.', 'model “reconstructs” the oxygen distribution');
  check('quote validation tolerates punctuation but still returns source text', fuzzyQuote && fuzzyQuote.quote.includes('model reconstructs'));
  const longReport = 'Reviewer 1\n\n' + Array.from({ length: 180 }, (_, i) => 'Comment ' + i + ' asks for a specific clarification about methods and evidence.').join('\n\n');
  const chunks = reviewContext.reviewReportChunks(longReport);
  check('long reports keep every section in bounded chunks', chunks.length > 1 && chunks.join('\n').includes('Comment 179') && Math.max(...chunks.map(chunk => chunk.length)) < 9200, chunks.length + ' chunks');
  const numberedReport = '[REVIEWER TEXT] Reviewer 1\n\n[REVIEWER TEXT] Major concerns\n\n' + Array.from({ length: 25 }, (_, i) => '[REVIEWER TEXT] ' + (i + 1) + '. Concern ' + (i + 1) + ' must remain a separate reviewer issue.\n\n[AUTHOR RESPONSE] Response ' + (i + 1) + '.').join('\n\n');
  const numberedUnits = reviewContext.reviewReportUnits(numberedReport);
  check('all 25 numbered reviewer concerns survive deterministic segmentation', numberedUnits.filter(unit => unit.number).length === 25 && numberedUnits.every(unit => unit.response), numberedUnits.length + ' units');
  check('AI classification is keyed to stable input ids rather than freeform summaries', source.includes('Return exactly one result for every inputId') && source.includes('unit.number||!classification'));
  check('re-importing the same reviewer report replaces an incomplete extraction', source.includes("comment.sourceId!==reportId") && source.includes("report.id!==reportId") && source.includes('priorByText[reviewNormalizedText(item.text)]'));

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
