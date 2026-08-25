const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'reading.html'), 'utf8');
const worker = fs.readFileSync(path.join(ROOT, 'reading-sw.js'), 'utf8');

let failures = 0;
function check(name, condition, extra) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!condition) failures++;
}

const cacheVersion = (worker.match(/phloem-shell-v(\d+)/) || [])[1];
const cssVersion = (html.match(/reading\.css\?v=(\d+)/) || [])[1];
const jsVersion = (html.match(/reading\.js\?v=(\d+)/) || [])[1];
const workerVersion = (html.match(/reading-sw\.js\?v=(\d+)/) || [])[1];

check('reader CSS and JavaScript share the offline cache version', cacheVersion && cssVersion === cacheVersion && jsVersion === cacheVersion, [cacheVersion, cssVersion, jsVersion].join('/'));
check('service worker URL carries the same cache version', workerVersion === cacheVersion, workerVersion + '/' + cacheVersion);
check('worker script bypasses the browser update cache', html.includes("updateViaCache:'none'"));
check('older controlled tabs reload when the new worker takes over', html.includes("addEventListener('controllerchange'"));
check('first-time visitors are not needlessly reloaded', html.includes('if(!hadController||reloading)return'));

process.exit(failures ? 1 : 0);
