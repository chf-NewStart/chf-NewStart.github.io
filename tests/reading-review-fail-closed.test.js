const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'reading.js'), 'utf8');
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

const context = {
  Number,
  reviewHasVerifiedPassage: (_chapter, comment) => !!comment.verified,
  reviewHasManualAnchor: (_chapter, comment) => !!comment.manualAnchor,
  reviewCanAutoLocate: comment => !!comment.auto
};
vm.runInNewContext([
  extractFunction('reviewHasDisplayablePassage'),
  extractFunction('reviewNeedsPassage')
].join('\n'), context);

const weakAi = { verified: true, auto: true, matchConfidence: .69, locationStatus: 'confident' };
const strongAi = { verified: true, auto: true, matchConfidence: .82, locationStatus: 'confident' };
const manual = { verified: true, manualAnchor: true, manualReviewLink: true, matchConfidence: 1, locationStatus: 'confident' };
const nativeWord = { verified: true, anchorMethod: 'word' };
const rejected = { verified: false, auto: false, manualReviewLink: true, manualLocationRejected: true };
const broad = { verified: false, auto: false, manualReviewLink: false };

check('weak AI matches fail closed', !context.reviewHasDisplayablePassage({}, weakAi) && context.reviewNeedsPassage({}, weakAi));
check('verified AI matches remain displayable', context.reviewHasDisplayablePassage({}, strongAi) && !context.reviewNeedsPassage({}, strongAi));
check('user-selected passages override AI confidence', context.reviewHasDisplayablePassage({}, manual) && !context.reviewNeedsPassage({}, manual));
check('native Word comment ranges remain trusted', context.reviewHasDisplayablePassage({}, nativeWord));
check('rejected matches remain visible in Needs passage without returning to AI', context.reviewNeedsPassage({}, rejected));
check('broad comments are not incorrectly treated as missing passages', !context.reviewNeedsPassage({}, broad));

check('PDF markers only render displayable passages', extractFunction('renderPdfReviewMarkers').includes('reviewHasDisplayablePassage(ch,comment)'));
check('reflow highlights only render displayable passages', extractFunction('styledTextHtml').includes('reviewHasDisplayablePassage(null,comment)'));
check('wrong-passage rejection locks the comment to manual placement', extractFunction('removeReviewerPassage').includes('comment.manualReviewLink=true') && extractFunction('removeReviewerPassage').includes('comment.manualLocationRejected=true'));
check('manual-only missing passages stay filterable but are excluded from AI retries', source.includes('aiPending=missing.filter') && source.includes("reviewFilter==='needs'?reviewNeedsPassage"));
check('the review card explains the manual correction state', source.includes('AI location rejected · automatic matching is off for this comment') && source.includes('Select the correct passage') && css.includes('.reviewer-chip.review-manual-only'));
check('shared review layers omit weak or rejected locations', extractFunction('reviewSharePayload').includes('reviewHasDisplayablePassage(ch,comment)?reviewPdfAnchors(ch,comment):[]'));

process.exit(failures ? 1 : 0);
