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
  check('the library does not duplicate the global Review destination', !html.includes('id="reviewShortcut"') && !source.includes("byId('reviewShortcut')") && html.includes('data-view="reviewPage"'));
  check('Word comment ranges become manuscript highlights', source.includes("name==='commentRangeStart'") && source.includes("name==='commentRangeEnd'") && css.includes('.review-comment-anchor'));
  check('review responses and resolved state persist on the chapter', source.includes('comment.response=area.value') && source.includes('comment.resolved=!comment.resolved'));
  check('AI classifies reviewer concerns without seeing or drafting author responses', source.includes('This task is classification only. Do not draft, rewrite, evaluate, summarize, or complete an author response') && !source.includes('Existing author response:'));
  check('the response field is explicitly author-written', source.includes('Your response · written by you') && source.includes('Write your response here…'));
  check('the current review can be visibly cleared without removing the paper', html.includes('class="soft-button review-clear-button hidden"') && source.includes('ch.reviewComments=[];ch.reviewReports=[]') && source.includes('ch.reviewClearedAt=stamp;ch.reviewUpdatedAt=stamp') && source.includes('Your paper, reading notes, and personal highlights will stay'));
  check('choosing another reviewer file safely replaces the old review automatically', html.includes('id="reviewReplaceNote"') && source.includes('pendingReviewReplace=(ch.reviewComments||[]).length>0') && source.includes('ch.reviewComments=replaceCurrent?comments') && source.indexOf('await locateReviewsWithAi(ch,matchable') < source.indexOf('ch.reviewComments=replaceCurrent?comments'));
  check('review deletion timestamps stop synced comments from reappearing', source.includes('function reviewStateStamp') && source.includes('if(localReviewAt>remoteReviewAt)copyReviewState(remote,local)') && source.includes('if(remoteReviewAt>localReviewAt){copyReviewState(local,remote)'));
  check('unlinked feedback is located only through an explicit AI action', html.includes('id="locateReviewsBtn"') && source.includes('locateReviewsWithAi') && source.includes('locateReviewBatchWithAi'));
  check('the review flow clearly supports one combined Word file', html.includes('id="reviewCombinedFile"') && html.includes('Commented Word manuscript') && source.includes("if(!parsed.comments.length)"));
  check('the review flow clearly supports a manuscript plus separate comments', html.includes('id="reviewPaperFile"') && html.includes('id="reviewCommentsFile"') && source.includes('importSourceFile(paper,null,null,button,true)') && source.includes('importReviewerFile(target,comments,button)'));
  check('a comment-only reviewer Word file can still be attached from the reader sidebar', html.includes('id="importReviewFileBtn"') && source.includes('extractReviewerReportWithAi') && source.includes('importReviewerFile'));
  check('review concerns are classified by scope and topic', html.includes('id="reviewerFilters"') && source.includes('REVIEW_LEVEL_LABELS') && source.includes('REVIEW_TOPIC_LABELS') && css.includes('.reviewer-classification'));
  check('long response-to-reviewers files are chunked instead of truncated', source.includes('function reviewReportChunks') && !source.includes("String(text||'').slice(0,30000)"));
  check('Word formatting distinguishes reviewer text from author replies', source.includes('paragraphRoles:reviewRoles') && source.includes("'REVIEWER TEXT'") && source.includes("'AUTHOR RESPONSE'"));
  check('PDF review navigation stays in the original PDF', extractFunction('focusReviewerPassage').includes("await gotoPdfPage(page,'auto')") && !extractFunction('focusReviewerPassage').includes("readerMode='text'"));
  check('review navigation waits for PDF layout before centering the exact passage', extractFunction('gotoPdfPage').includes('await renderPdfPage()') && extractFunction('focusReviewerPassage').includes('await scrollPdfReviewPassage') && extractFunction('scrollPdfReviewPassage').includes("pane.scrollTo({top:Math.max(0,top),left:Math.max(0,left),behavior:'smooth'})"));
  check('each linked passage keeps its own navigation target', source.includes('data-review-anchor-index') && extractFunction('focusReviewerPassage').includes('reviewFocusAnchorIndex=anchorIndex'));
  check('review packages are filed in a compact In review category', source.includes("REVIEW_WORKSPACE_CATEGORY = 'In review'") && source.includes('placeInReviewWorkspace(target)') && source.includes('placeInReviewWorkspace(ch)'));
  check('In review opens as a pinned focused workspace instead of a separate page', source.includes("reviewWorkspaceOpen=selectedCategory===REVIEW_WORKSPACE_CATEGORY.toLowerCase()") && source.includes("is-review-workspace") && source.includes("review-workspace-open") && !html.includes('id="inReviewPage"'));
  check('the revision workspace pairs files, progress, recency, and one continuation action', source.includes('function renderReviewWorkspaceCard') && source.includes('review-workspace-pair') && source.includes('review-workspace-scopes') && source.includes('Continue review&nbsp; →') && source.includes('shelfDate(ch)'));
  check('revision maintenance stays in a secondary Manage menu', source.includes('review-workspace-manage-toggle') && source.includes('data-review-workspace-replace') && source.includes('data-review-workspace-clear') && source.includes('data-review-workspace-delete') && css.includes('.review-workspace-menu button.danger'));
  check('workspace maintenance reuses the safe review and paper deletion flows', extractFunction('renderReviewWorkspaceCard').includes('startReviewerFileReplacement(ch)') && extractFunction('renderReviewWorkspaceCard').includes('clearReviewComments(ch)') && extractFunction('renderReviewWorkspaceCard').includes('removePaper(ch,false)'));
  check('PDF review matches remain visible and clickable on the paper', source.includes('renderPdfReviewMarkers') && source.includes('pdfReviewAtPoint') && source.includes('showReviewerComment(find(currentId),review.comment.id,review.page)') && source.indexOf('var review=pdfReviewAtPoint') < source.indexOf("if(s&&!s.isCollapsed)return") && css.includes('.review-comment-highlight'));
  check('review comments navigate back to their highlighted passages', source.includes(".reviewer-comment-card.has-passage") && source.includes('focusReviewerPassage(ch,card.dataset.reviewCard)'));
  check('one reviewer concern can link every distinct PDF passage it cites', source.includes('comment.pdfAnchors=valid') && source.includes('"matches"') && source.includes('up to four') && source.includes('reviewer-passage-links'));
  check('readers can reject a wrong AI passage and select the correction on the paper', html.includes('id="selectionLinkReview"') && source.includes('function removeReviewerPassage') && source.includes('function linkSelectionToReview') && source.includes("method:'manual-pdf-selection'") && source.includes('Wrong passage'));
  check('review comments support multiple user-selected passages', source.includes('data-review-add-passage') && source.includes('Add another passage') && source.includes('pdfAnchors.push') && source.includes('textAnchors.push'));
  check('PDF reviews expose a fingerprint-locked share action', html.includes('id="shareReviewBtn"') && html.includes('id="reviewShareDialog"') && source.includes("'#phloem-review='") && source.includes("String(ch.contentHash||'')===hash"));
  check('shared review links require confirmation and can request the exact missing PDF', source.includes("primary.textContent=target?'Add shared review':'Choose matching PDF'") && source.includes("if(hash!==payload.paper.contentHash)") && source.includes('applySharedReview(pendingSharedReview,exact)'));
  check('manual passage corrections are labelled and reversible', source.includes('Linked by you') && html.includes('id="reviewLinkUndoBtn"') && source.includes('function restoreReviewLinkUndo') && css.includes('.reviewer-chip.review-linked-by-user'));
  check('manual passage corrections override AI and survive a same-comment re-import', source.includes('comment.manualReviewLink') && source.includes('function preserveManualReviewLocation') && source.includes('preserveManualReviewLocation(record,prior)') && extractFunction('reviewCanAutoLocate').includes('comment.manualReviewLink'));
  const manualContext = {
    REVIEW_LOCATION_FIELDS: ['para','page','start','end','quote','anchors','pdfAnchors','anchored','anchorMethod','matchConfidence','locatedProvider','locationStatus','manualReviewLink','manualLocationRejected'],
    now: () => 500
  };
  vm.runInNewContext([
    extractFunction('cloneReviewLocationValue'),
    extractFunction('reviewLocationSnapshot'),
    extractFunction('applyReviewLocationSnapshot'),
    extractFunction('preserveManualReviewLocation')
  ].join('\n'), manualContext);
  const savedManual = { page: 7, quote: 'Exact selected sentence.', pdfAnchors: [{ page: 7, quote: 'Exact selected sentence.', method: 'manual-pdf-selection', manual: true }], anchored: true, matchConfidence: 1, manualReviewLink: true };
  const refreshedComment = { page: null, quote: '', pdfAnchors: [], anchored: false };
  const preserved = manualContext.preserveManualReviewLocation(refreshedComment, savedManual);
  savedManual.pdfAnchors[0].quote = 'Mutated after copy';
  check('manual reviewer locations are copied by value during re-import', preserved && refreshedComment.page === 7 && refreshedComment.pdfAnchors[0].quote === 'Exact selected sentence.' && refreshedComment.manualReviewLink === true);
  check('explicit manuscript pages guide candidate search without becoming unverified anchors', source.includes('explicit.concat(ranked.slice(0,8)') && !extractFunction('applyPdfReviewMatches').includes('explicit.forEach(function(page)') && extractFunction('applyPdfReviewMatches').includes('if(!range)return'));
  check('older merged-comment imports visibly ask for a replacement re-import', source.includes('extractorVersion:3') && source.includes('Word line-breaks merged into one comment'));
  check('legacy summary matches are suppressed until the source report is re-imported', source.includes('comment.legacyImport=!!legacyReviewReports') && source.includes("if(comment.legacyImport&&!comment.manualReviewLink){comment.anchored=false"));
  check('broad restructuring feedback is not forced onto a coincidental passage', source.includes('function stabilizedReviewLevel') && source.includes("level='section'") && source.includes('Section-wide · no single passage named'));
  check('PDF matches must use candidate pages and a confidence threshold', source.includes('reviewCandidatePdfPages') && source.includes('confidence<.55') && source.includes('allowed=pageCandidates.some'));
  check('an invented quote no longer falls back to the whole paragraph', !source.includes("if(start<0){quote=text;start=0;}"));
  check('AI-selected PDF pages always require a drawable verified passage', extractFunction('applyPdfReviewMatches').includes('if(!range)return') && source.includes('never return a page with an empty quote'));
  check('older page-only links are repaired only when relevant text exists, otherwise removed', source.includes('function repairPdfReviewQuotes') && source.includes("anchor.method==='review-page-reference'") && source.includes("comment.locationStatus='needs-checking'") && source.includes('repairPdfReviewQuotes(ch)'));
  check('PDF quote mapping respects words split across text-layer spans', source.includes('function pdfReviewSpanNeedsSpace') && source.includes('pdfReviewSpanNeedsSpace(previous,span)'));
  check('review scope colors cover PDF passages, page markers, text passages, and cards', html.includes('class="review-scope-key"') && css.includes('.review-level-section.review-marker-first::after') && css.includes('.review-page-marker.review-level-general') && css.includes('.review-comment-anchor.review-level-editorial') && css.includes('.reviewer-comment-card.review-level-section'));
  check('original Word drafts use the same resumable Drive roaming path', source.includes("name:'docx-'+ch.id+'.docx'") && source.includes('binarySourceSpec(ch)'));

  const reviewContext = {
    reviewCanAutoLocate: () => true,
    resetReviewLocation: comment => { comment.page = null; comment.quote = ''; comment.pdfAnchors = []; comment.anchored = false; comment.matchConfidence = 0; },
    now: () => 500
  };
  vm.runInNewContext([
    extractFunction('paras'),
    extractFunction('reviewNormalizedText'),
    extractFunction('reviewQuoteRange'),
    extractFunction('reviewSentenceRanges'),
    extractFunction('reviewTrimStructuralPrefix'),
    extractFunction('reviewSentenceRange'),
    extractFunction('reviewSearchTerms'),
    extractFunction('reviewQuotedPassages'),
    extractFunction('reviewLocalPdfQuote'),
    extractFunction('repairPdfReviewQuotes'),
    extractFunction('reviewExplicitPages'),
    extractFunction('reviewReportChunks'),
    extractFunction('reviewReportParagraphs'),
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
  const sentenceText = 'Repeated simulations were required to fit predictions to experimental data. Although compartmental models describe heterogeneity, current approaches still struggle to capture these systems accurately. For example, the next model adds population balances.';
  const clippedRange = { start: sentenceText.indexOf('predictions'), end: sentenceText.indexOf('the next model') + 8, quote: '' };
  const completeSentence = reviewContext.reviewSentenceRange(sentenceText, clippedRange, { text: 'Current compartmental approaches struggle to capture system complexity accurately.' });
  check('PDF review highlights snap to one complete relevant sentence', completeSentence.quote.startsWith('Although') && completeSentence.quote.endsWith('accurately.') && !completeSentence.quote.includes('For example'));
  const flattenedTitlePage = 'Probe Location Matters: Oxygen Gradient Measurements and CFD-Informed Modeling. Marc G. Aucoin1, Hector Budman1,** 1Department of Chemical Engineering, University of Waterloo, Waterloo, ON, Canada **Corresponding author: hbudman@uwaterloo.ca * equal contributions 1 Abstract In the modeling of smaller scale bioreactors such as the 15-20 L system studied here, the process is generally assumed to be well mixed. Oxygen gradients were then measured throughout the vessel.';
  const oversizedTitleRange = { start: flattenedTitlePage.indexOf('Marc G. Aucoin'), end: flattenedTitlePage.indexOf('well mixed.') + 'well mixed.'.length, quote: '' };
  const trimmedTitlePassage = reviewContext.reviewSentenceRange(flattenedTitlePage, oversizedTitleRange, { text: 'The scale is described variously as a 15–20 L system and a 20 L bioreactor. Distinguish vessel and working volume consistently.' });
  check('flattened title-page metadata is trimmed before reviewer highlighting', trimmedTitlePassage.quote.startsWith('In the modeling') && trimmedTitlePassage.quote.endsWith('well mixed.') && !/Department|University|Aucoin|Budman/.test(trimmedTitlePassage.quote), trimmedTitlePassage.quote);
  const localPassage = reviewContext.reviewLocalPdfQuote('Background material is summarized first. Probe position changed the measured oxygen concentration gradient across the vessel. The conclusion follows.', { text: 'Please clarify how probe position affects the oxygen concentration gradient.' });
  check('page-only references gain a conservative local passage highlight', localPassage.includes('Probe position changed'));
  const falseTitlePassage = reviewContext.reviewLocalPdfQuote('Probe Location Matters: Oxygen Gradient Measurements and CFD-Informed Modeling Challenge the Well-Mixed Assumption in Bench-Scale Bioreactors Ittisak Promma, Danny Kang, Zahra Negahban, Valerie Ward, Nasser Mohieddin Abukhdeir, Marc G. Aucoin, Hector Budman Department of Chemical Engineering, University of Waterloo, Waterloo, ON, Canada.', { text: 'The scale is described variously as a 15–20 L system, a 20 L bioreactor and a 19.5 L vessel operated at 13.5–14 L. Nominal vessel volume and actual working volume should be distinguished consistently (pp. 1, 3–4).' });
  check('generic title-page overlap cannot become a reviewer passage', falseTitlePassage === '');
  const staleR59 = { kind: 'pdf', pageTexts: ['Probe Location Matters: Oxygen Gradient Measurements and CFD-Informed Modeling Challenge the Well-Mixed Assumption in Bench-Scale Bioreactors. Department of Chemical Engineering, University of Waterloo.', '', 'Twenty-liter bioreactors are widely used in industrial practice. The nominal vessel volume differs from the actual working volume.'], reviewComments: [{ text: 'The scale is described variously as a 15–20 L system, a 20 L bioreactor and a 19.5 L vessel. Nominal vessel volume and actual working volume should be distinguished consistently (pp. 1, 3–4).', page: 3, quote: 'The nominal vessel volume differs from the actual working volume.', pdfAnchors: [{ page: 3, quote: 'The nominal vessel volume differs from the actual working volume.', confidence: .94, method: 'ai-pdf-quote' }, { page: 1, quote: 'Probe Location Matters: Oxygen Gradient Measurements and CFD-Informed Modeling Challenge the Well-Mixed Assumption in Bench-Scale Bioreactors.', confidence: .68, method: 'local-pdf-quote' }], anchored: true, anchorMethod: 'ai-pdf-quote', matchConfidence: .68 }] };
  const cleanedStaleR59 = reviewContext.repairPdfReviewQuotes(staleR59);
  check('saved R59-style title-page false positives are removed on reopen', cleanedStaleR59 && staleR59.reviewComments[0].pdfAnchors.length === 1 && staleR59.reviewComments[0].pdfAnchors[0].page === 3 && staleR59.reviewComments[0].matchConfidence === .94 && staleR59.reviewUpdatedAt === 500);
  const quotedPassages = reviewContext.reviewQuotedPassages({ text: 'Please revise “Probe position changed the measured oxygen concentration gradient across the vessel.” and do not match “too short”.' });
  check('complete quoted manuscript text is isolated for the no-AI fast path', quotedPassages.length === 1 && quotedPassages[0].startsWith('Probe position'));
  const unrelatedPassage = reviewContext.reviewLocalPdfQuote('The statistical analysis used a standard confidence interval.', { text: 'Please clarify the oxygen sensor placement and spatial concentration gradient.' });
  check('local passage repair refuses unrelated page text', unrelatedPassage === '');
  const longReport = 'Reviewer 1\n\n' + Array.from({ length: 180 }, (_, i) => 'Comment ' + i + ' asks for a specific clarification about methods and evidence.').join('\n\n');
  const chunks = reviewContext.reviewReportChunks(longReport);
  check('long reports keep every section in bounded chunks', chunks.length > 1 && chunks.join('\n').includes('Comment 179') && Math.max(...chunks.map(chunk => chunk.length)) < 9200, chunks.length + ' chunks');
  const numberedReport = '[REVIEWER TEXT] Reviewer 1\n\n[REVIEWER TEXT] Major concerns\n\n' + Array.from({ length: 25 }, (_, i) => '[REVIEWER TEXT] ' + (i + 1) + '. Concern ' + (i + 1) + ' must remain a separate reviewer issue.\n\n[AUTHOR RESPONSE] Response ' + (i + 1) + '.').join('\n\n');
  const numberedUnits = reviewContext.reviewReportUnits(numberedReport);
  check('all 25 numbered reviewer concerns survive deterministic segmentation', numberedUnits.filter(unit => unit.number).length === 25 && numberedUnits.every(unit => unit.response), numberedUnits.length + ' units');
  const softBreakReport = '[REVIEWER TEXT] 4. Exchange-rate scaling needs justification\nExplain the physical basis.\n5. CFD geometry is inconsistent\nCorrect the impeller diameter.\nMinor comments\nCorrect batch to fed-batch in the abstract.\nUse nominal and working volume consistently.\nOverall recommendation\nMajor revision is recommended.';
  const softBreakUnits = reviewContext.reviewReportUnits(softBreakReport);
  check('Word soft line-breaks cannot merge several numbered and minor concerns', softBreakUnits.some(unit => unit.number === '4' && !unit.text.includes('5. CFD')) && softBreakUnits.some(unit => unit.number === '5' && !unit.text.includes('Minor comments')) && softBreakUnits.filter(unit => unit.group.toLowerCase() === 'minor comments').length === 2 && Math.max(...softBreakUnits.map(unit => unit.text.length)) < 180, softBreakUnits.map(unit => unit.text).join(' | '));
  const shareContext = { now: () => 900, normalizeReviewLevel: value => value, normalizeReviewTopic: value => value, TextEncoder, TextDecoder, Blob, Response, CompressionStream, DecompressionStream, btoa, atob };
  vm.runInNewContext([
    extractFunction('reviewNormalizedText'),
    extractFunction('reviewPdfAnchors'),
    extractFunction('reviewSharePayload'),
    extractFunction('sharedReviewRecords'),
    extractFunction('reviewShareBase64'),
    extractFunction('reviewShareBytes'),
    extractFunction('encodeSharedReview'),
    extractFunction('decodeSharedReview')
  ].join('\n'), shareContext);
  const sharePaper = { kind: 'pdf', title: 'Private manuscript', sourceName: 'paper.pdf', pageCount: 12, contentHash: 'a'.repeat(64), reviewShareId: 'review-layer-1', notes: { 1: 'private note' }, questions: [{ answer: 'private AI answer' }], reviewComments: [{ author: 'Reviewer 2', text: 'Correct this terminology.', level: 'editorial', topic: 'writing', response: 'Corrected.', resolved: true, pdfAnchors: [{ page: 4, quote: 'batch fermentation experiments', confidence: .94, method: 'ai-pdf-quote' }] }] };
  const sharedPayload = shareContext.reviewSharePayload(sharePaper), sharedJson = JSON.stringify(sharedPayload), sharedRecords = shareContext.sharedReviewRecords(sharedPayload);
  check('the share payload carries review state and locations but no manuscript, notes, or AI data', sharedPayload.paper.contentHash === 'a'.repeat(64) && sharedPayload.comments[0].pdfAnchors[0].page === 4 && sharedPayload.comments[0].response === 'Corrected.' && !sharedJson.includes('private note') && !sharedJson.includes('private AI answer') && !sharedJson.includes('pdfBytes'));
  check('a received review reconstructs clickable PDF anchors and response state', sharedRecords[0].pdfAnchors[0].method === 'shared-pdf-quote' && sharedRecords[0].quote === 'batch fermentation experiments' && sharedRecords[0].response === 'Corrected.' && sharedRecords[0].resolved === true);
  const encodedShare = await shareContext.encodeSharedReview(sharedPayload), decodedShare = await shareContext.decodeSharedReview(encodedShare);
  check('compressed review links round-trip without losing their PDF fingerprint or anchors', decodedShare.paper.contentHash === sharedPayload.paper.contentHash && decodedShare.comments[0].pdfAnchors[0].quote === 'batch fermentation experiments' && encodedShare.length < sharedJson.length);
  check('AI classification is keyed to stable input ids rather than freeform summaries', source.includes('Return exactly one result for every inputId') && source.includes('unit.number||!classification'));
  check('AI classification is checked against local review rules', source.includes('function reviewClassificationAudit') && source.includes('classificationAudit:checked.audit') && source.includes('confidence from 0 to 1'));
  check('passage matching batches comments by stable ids', source.includes('Return exactly one item for every commentId') && source.includes('reviewLocationBatches(comments,config.size)'));
  check('cloud matching uses four bounded parallel workers', source.includes("size:local?1:3,concurrency:local?1:4") && source.includes('await Promise.all(workers)'));
  check('classification uses parallel cloud specialists but one local worker', source.includes('workerCount=Math.min(local?1:4,batches.length)') && source.includes('reviewClassificationBatches(units,6)'));
  check('missing classification items receive one targeted retry', source.includes('var missing=batch.filter') && source.includes('if(missing.length)try{await ask(missing);'));
  check('invalid passage matches receive one targeted retry', source.includes('if(!passed[prepared[p].id])') && source.includes('if(!textPassed[prepared[t].id])'));
  check('one selected AI mode handles the complete review consistently', source.includes('function reviewAiPlan') && source.includes("route=selected==='auto'") && source.includes('classification:route,location:route'));
  check('DeepSeek review calls request strict JSON output', source.includes("if(/return only json/i.test(system))deepseekBody.response_format={type:'json_object'}"));
  check('exact quoted passages bypass AI without weakening validation', source.includes('function locateReviewFromExactQuote') && source.includes("'Exact manuscript text'") && source.includes('var remaining=comments.filter'));
  check('review imports record classification, location, and total timing', source.includes('classificationMs:classificationMs,locationMs:locationMs,totalMs:totalMs') && source.includes('elapsedLabel(totalMs)'));
  check('weak passage matches stay unresolved instead of becoming highlights', source.includes("+comment.matchConfidence>=.72") && source.includes("comment.locationStatus=confident?'confident':'needs-checking'") && source.includes('No passage linked yet'));
  check('multi-location comments require every quoted passage to validate', source.includes('anchors.every(function(anchor)') && source.includes('comment.matchConfidence=Math.min.apply'));
  check('reviewers see actionable passage state instead of model confidence', html.includes('id="reviewQualitySummary"') && source.includes("+' passage'") && source.includes('without a passage') && !extractFunction('renderReviewerPanel').includes('confidently') && !extractFunction('renderReviewerPanel').includes('classificationAudit'));
  check('re-importing the same reviewer report replaces an incomplete extraction', source.includes("comment.sourceId!==reportId") && source.includes("report.id!==reportId") && source.includes('priorByText[reviewNormalizedText(item.text)]'));

  const classificationContext = {
    REVIEW_LEVEL_LABELS: { general: 'General', section: 'Section', specific: 'Specific', editorial: 'Editorial / typo' },
    REVIEW_TOPIC_LABELS: { writing: 'Writing', structure: 'Structure', methods: 'Methods', statistics: 'Statistics', modeling: 'Modeling', evidence: 'Evidence', figures: 'Figure / table', consistency: 'Consistency', claims: 'Claims', references: 'References', other: 'Other' },
    REVIEW_WORKSPACE_CATEGORY: 'In review',
    LEGACY_REVIEW_WORKSPACE_CATEGORY: 'Under review',
    now: () => 123456
  };
  vm.runInNewContext([
    extractFunction('normalizeReviewLevel'),
    extractFunction('normalizeReviewTopic'),
    extractFunction('fallbackReviewLevel'),
    extractFunction('fallbackReviewTopic'),
    extractFunction('fallbackReviewLocation'),
    extractFunction('stabilizedReviewLevel'),
    extractFunction('reviewClassificationSignals'),
    extractFunction('reviewClassificationAudit'),
    extractFunction('reviewLocationBatches'),
    extractFunction('migrateReviewWorkspaceLabels')
  ].join('\n'), classificationContext);
  const restructureAudit = classificationContext.reviewClassificationAudit(
    { group: 'Major comments', text: 'Restructure the manuscript to separate the experimental validation from the hydrodynamic modeling.' },
    { level: 'specific', topic: 'modeling', confidence: 0.94, locationHint: '' }
  );
  check('a broad restructuring request cannot be mislabeled as passage-specific', restructureAudit.level === 'section' && restructureAudit.topic === 'structure' && restructureAudit.audit.adjusted);
  const consistencyAudit = classificationContext.reviewClassificationAudit(
    { group: 'Major comments', text: 'There is a discrepancy regarding the impeller diameter. Please correct this inconsistency in the text.' },
    { level: 'specific', topic: 'methods', confidence: 0.91, locationHint: 'Section 3.1 · Figure 1' }
  );
  check('a direct numeric consistency correction is treated as editorial', consistencyAudit.level === 'editorial' && consistencyAudit.topic === 'consistency');
  const figureAudit = classificationContext.reviewClassificationAudit(
    { group: 'Major comments', text: 'Figure 6 is difficult to interpret. It is highly recommended to redesign it.' },
    { level: 'general', topic: 'other', confidence: 0.83, locationHint: 'Figure 6' }
  );
  check('a named figure redesign stays specific and visual', figureAudit.level === 'specific' && figureAudit.topic === 'figures');
  const modelingAudit = classificationContext.reviewClassificationAudit(
    { group: 'Major comments', text: 'The authors should reorganize the model evaluation to distinguish calibration, reconstruction, and prediction.' },
    { level: 'section', topic: 'modeling', confidence: 0.9, locationHint: '' }
  );
  check('conceptual model reorganization is not flattened into a generic structure topic', modelingAudit.level === 'section' && modelingAudit.topic === 'modeling');
  const locationBatches = classificationContext.reviewLocationBatches(Array.from({ length: 25 }, (_, index) => index), 3);
  check('25 cloud locations collapse to nine AI batches', locationBatches.length === 9 && locationBatches[8].length === 1, locationBatches.length + ' batches');
  const oldWorkspace = { chapters: [{ category: 'Under review', reviewPreviousCategory: 'Under review', updatedAt: 1 }], categoryOrder: ['Under review', 'Academic', 'In review'], categoryOrderUpdatedAt: 1 };
  const migratedWorkspace = classificationContext.migrateReviewWorkspaceLabels(oldWorkspace, true);
  check('existing Under review folders migrate without duplication', migratedWorkspace && oldWorkspace.chapters[0].category === 'In review' && oldWorkspace.categoryOrder.join('|') === 'In review|Academic');

  const workspaceContext = {
    REVIEW_WORKSPACE_CATEGORY: 'In review',
    REVIEW_LEVEL_LABELS: { general: 'General', section: 'Section', specific: 'Specific', editorial: 'Editorial / typo' },
    state: {
      chapters: [{ category: 'Academic' }, { category: 'In review' }, { category: 'Notes' }],
      categoryOrder: ['Notes', 'Academic', 'In review']
    }
  };
  vm.runInNewContext([
    extractFunction('normalizeReviewLevel'),
    extractFunction('shelfPaperCategory'),
    extractFunction('shelfCategoryNames'),
    extractFunction('reviewWorkspaceStats'),
    extractFunction('reviewWorkspaceFiles'),
    extractFunction('reviewStateStamp'),
    extractFunction('copyReviewState')
  ].join('\n'), workspaceContext);
  check('In review stays pinned ahead of user-ordered categories', workspaceContext.shelfCategoryNames().join('|') === 'In review|Notes|Academic');
  const workspacePaper = {
    reviewReports: [{ name: 'Reviewer 1.docx' }, { name: 'Reviewer 1.docx' }, { name: 'Reviewer 2.docx' }],
    reviewComments: [
      { level: 'general', resolved: false },
      { level: 'section', resolved: true },
      { level: 'specific', resolved: false },
      { level: 'editorial', resolved: true }
    ]
  };
  const workspaceStats = workspaceContext.reviewWorkspaceStats(workspacePaper);
  check('revision progress counts open and completed work by scope', workspaceStats.total === 4 && workspaceStats.open === 2 && workspaceStats.levels.section.open === 0 && workspaceStats.levels.specific.open === 1);
  check('reviewer file pairing deduplicates source document names', workspaceContext.reviewWorkspaceFiles(workspacePaper).join('|') === 'Reviewer 1.docx|Reviewer 2.docx');
  const clearedReview = { reviewComments: [], reviewReports: [], reviewClearedAt: 300, reviewUpdatedAt: 300 };
  const staleReview = { reviewComments: [{ id: 'old', addedAt: 100 }], reviewReports: [{ id: 'report', addedAt: 100 }], updatedAt: 500 };
  check('a clear tombstone is newer than stale comments even when the stale paper was touched later', workspaceContext.reviewStateStamp(clearedReview) > workspaceContext.reviewStateStamp(staleReview));
  workspaceContext.copyReviewState(staleReview, clearedReview);
  check('copying the newer cleared review state removes stale synced comments', staleReview.reviewComments.length === 0 && staleReview.reviewClearedAt === 300);

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
