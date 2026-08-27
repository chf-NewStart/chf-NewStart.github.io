const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'reading.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'reading.html'), 'utf8');

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}

const limit = source.match(/GDRIVE_PDF_LIMIT=(\d+)\*1024\*1024/);
const chunk = source.match(/GDRIVE_CHUNK_BYTES=(\d+)\*1024\*1024/);
const rangeHelper = source.match(/function gdriveRangeNext\([^\n]+/);
const rangeContext = {};
if (rangeHelper) vm.runInNewContext(rangeHelper[0], rangeContext);
const resumedAt = rangeContext.gdriveRangeNext
  ? rangeContext.gdriveRangeNext({ headers: { get: name => name === 'Range' ? 'bytes=0-8388607' : '' } }, 0, 126385421)
  : -1;

check('Drive roaming accepts the full 200 MB Phloem book size', limit && +limit[1] === 200, limit && limit[1]);
check('large PDFs start a resumable Drive upload', source.includes('uploadType=resumable&fields=id,name,size'));
check('large uploads are split into Drive-compatible chunks', chunk && (+chunk[1] * 1024 * 1024) % (256 * 1024) === 0, chunk && chunk[1] + ' MB');
check('upload progress is checkpointed locally', source.includes("GDRIVE_UPLOADS_KEY='readingRoom.gdriveUploads.v1'") && source.includes('gdriveRememberUpload(ch.id,item)'));
check('an interrupted session asks Drive for its confirmed offset', source.includes("'Content-Range':'bytes */'+total") && resumedAt === 8388608, resumedAt);
check('paper cards expose queued, transferring, synced, and paused states', ['Waiting to upload', 'Uploading to Drive', 'Available on your devices', 'Drive transfer paused'].every(text => source.includes(text)));
check('settings explain large-book sync and recovery', html.includes('large books up to 200 MB') && html.includes('resumes instead of starting over'));

process.exit(failures ? 1 : 0);
