const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'reading.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'reading.css'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'reading.js'), 'utf8');
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
check('obsolete promo video is not part of the live reader', !html.includes('carrel-app-demo.mp4') && !html.includes('<video'));
check('first paint uses a quiet library loading state', html.includes('class="shelf-loading"') && html.includes('Opening your library'));
check('empty-library pitch waits until restoration settles', css.includes('body.library-ready:not(.has-papers) .hero') && js.includes("document.body.classList.toggle('library-ready',!libraryHydrating)"));
check('startup waits for seeding and Drive restoration', js.includes('Promise.allSettled(startupLibraryWork)'));
check('old empty-shelf message is gone', !js.includes('Your shelf is waiting'));

process.exit(failures ? 1 : 0);
