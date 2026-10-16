import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { appVersion, defaultRepoRoot } from '../scripts/build-web.mjs';

const read = relative => readFile(path.join(defaultRepoRoot, relative), 'utf8');

test('the bundle records the app version from the Xcode project', async () => {
  const project = await read('apps/ipad/ios/App/App.xcodeproj/project.pbxproj');
  const version = await appVersion();
  assert.equal(version.version, project.match(/MARKETING_VERSION = ([^;]+);/)[1]);
  assert.equal(version.build, project.match(/CURRENT_PROJECT_VERSION = ([^;]+);/)[1]);
  const pkg = JSON.parse(await read('apps/ipad/package.json'));
  assert.equal(pkg.version, version.version, 'package.json follows the app version');
  const builder = await read('apps/ipad/scripts/build-web.mjs');
  assert.match(builder, /app: await appVersion\(repoRoot\)/, 'bundle-manifest.json carries it');
});

test('the App Store lookup decides whether an update notice appears', async () => {
  const ipad = await read('apps/ipad/native/ipad.js');
  const source = ipad.slice(ipad.indexOf('  function compareVersions('), ipad.indexOf('  var versionLine = null;'));
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const compare = context.compareVersions;
  assert.equal(compare('1.2.3', '1.2.2'), 1);
  assert.equal(compare('1.10', '1.9.9'), 1, 'numeric, not alphabetical');
  assert.equal(compare('1.2', '1.2.0'), 0);
  assert.equal(compare('1.2.1', '1.2.2'), -1, 'TestFlight builds ahead of the store say "newest"');
  assert.match(ipad, /https:\/\/itunes\.apple\.com\/lookup\?id=6813510395/);
  assert.match(ipad, /UPDATE_DISMISSED_KEY, store\.version/, 'a dismissed notice stays dismissed for that version');
  assert.match(ipad, /settings\.append\(aboutSection\)/, 'Desk settings shows the version');
});
