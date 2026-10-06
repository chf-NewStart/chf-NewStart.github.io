import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { defaultRepoRoot } from '../scripts/build-web.mjs';

const app = path.join(defaultRepoRoot, 'apps/ipad/ios/App');
const read = relative => readFile(path.join(defaultRepoRoot, relative), 'utf8');

test('the Google sign-in plugin is compiled, registered and configured from Info.plist', async () => {
  const project = await readFile(path.join(app, 'App.xcodeproj/project.pbxproj'), 'utf8');
  assert.match(project, /PhloemGooglePlugin\.swift in Sources \*\/ = \{isa = PBXBuildFile/);
  assert.match(project, /PhloemGooglePlugin\.swift \*\/ = \{isa = PBXFileReference/);
  assert.equal((project.match(/PhloemGooglePlugin\.swift in Sources \*\/,/g) || []).length, 1, 'in the Sources build phase');
  const bridge = await readFile(path.join(app, 'App/PhloemBridgeViewController.swift'), 'utf8');
  assert.match(bridge, /registerPluginInstance\(PhloemGooglePlugin\(\)\)/);
  const plist = await readFile(path.join(app, 'App/Info.plist'), 'utf8');
  assert.match(plist, /<key>PhloemGoogleClientID<\/key>\s*<string>[^<]*<\/string>/);
});

test('native Google sign-in asks only for the hidden Drive app folder, with PKCE, and keeps the refresh token in Keychain', async () => {
  const swift = await readFile(path.join(app, 'App/PhloemGooglePlugin.swift'), 'utf8');
  assert.match(swift, /let jsName = "PhloemGoogle"/);
  assert.equal((swift.match(/https:\/\/www\.googleapis\.com\/auth\/[a-z.]+/g) || []).join(), 'https://www.googleapis.com/auth/drive.appdata');
  assert.match(swift, /ASWebAuthenticationSession/);
  assert.match(swift, /code_challenge_method", value: "S256"/);
  assert.match(swift, /value\("state"\) == state/);
  assert.match(swift, /kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/);
  assert.doesNotMatch(swift, /client_secret/);
  assert.match(swift, /country != Self\.mainlandChinaStorefront/);
});

test('the reader uses the native token in the app and Drive stays hidden until the plugin is ready outside mainland China', async () => {
  const reader = await read('reading.js');
  assert.match(reader, /function nativeGooglePlugin\(\)\{return window\.PHLOEM_NATIVE&&window\.PHLOEM_GOOGLE_DRIVE&&/);
  assert.match(reader, /nativeGoogle\.getToken\(\{interactive:!!interactive/);
  assert.match(reader, /window\.PHLOEM_GDRIVE=\{/);
  const ipad = await read('apps/ipad/native/ipad.js');
  assert.match(ipad, /\['gdriveConnectBtn', /, 'Drive starts hidden like the other web-only settings');
  assert.match(ipad, /if \(!result \|\| !result\.configured \|\| !result\.regionAllowed\) return;\s*window\.PHLOEM_GOOGLE_DRIVE = true;\s*showSection\('gdriveConnectBtn'\);/);
});
