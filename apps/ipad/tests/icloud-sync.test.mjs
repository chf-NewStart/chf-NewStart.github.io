import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { defaultRepoRoot } from '../scripts/build-web.mjs';

const appRoot = path.join(defaultRepoRoot, 'apps/ipad/ios/App');

test('iCloud uses the private CloudKit database with bounded asset transfers', async () => {
  const [plugin, bridge, entitlements, project] = await Promise.all([
    readFile(path.join(appRoot, 'App/PhloemCloudPlugin.swift'), 'utf8'),
    readFile(path.join(appRoot, 'App/PhloemBridgeViewController.swift'), 'utf8'),
    readFile(path.join(appRoot, 'App/App.entitlements'), 'utf8'),
    readFile(path.join(appRoot, 'App.xcodeproj/project.pbxproj'), 'utf8')
  ]);
  assert.match(plugin, /CKContainer\(identifier: Self\.containerIdentifier\)/);
  assert.match(plugin, /container\.privateCloudDatabase/);
  assert.match(plugin, /iCloud\.com\.houfu72\.phloem/);
  assert.doesNotMatch(plugin, /publicCloudDatabase/);
  assert.match(plugin, /maximumDocumentBytes: Int64 = 200 \* 1_024 \* 1_024/);
  for (const method of ['fetchLibrary', 'saveLibrary', 'fetchDocuments', 'beginUpload', 'appendUpload', 'finishUpload', 'beginDownload', 'readDownload', 'endDownload', 'deleteDocuments', 'deleteCloudData']) {
    assert.match(plugin, new RegExp(`CAPPluginMethod\\(name: "${method}"`));
  }
  assert.match(plugin, /operation\.savePolicy = \.ifServerRecordUnchanged/);
  assert.match(plugin, /ICLOUD_CONFLICT/);
  assert.match(plugin, /CKAsset\(fileURL:/);
  assert.match(plugin, /Data\(base64Encoded: encoded\)/);
  assert.match(plugin, /fetchAllDocumentRecordIDs/);
  // Settings must show the CloudKit reason, not only a generic failure sentence.
  assert.match(plugin, /private func explain\(_ message: String, _ error: Error\?\) -> String/);
  assert.doesNotMatch(plugin, /call\.reject\("[^"]+", "[A-Z_]+", (error|fetchError|queryError|deleteError)\)/);
  assert.match(plugin, /CKQuery\([\s\S]*recordType: Self\.documentRecordType/);
  assert.match(bridge, /registerPluginInstance\(PhloemCloudPlugin\(\)\)/);
  // The storyboard's initial controller must also register the plugins, not the plain Capacitor one.
  const storyboard = await readFile(path.join(appRoot, 'App/Base.lproj/Main.storyboard'), 'utf8');
  assert.match(storyboard, /customClass="PhloemBridgeViewController" customModule="App"/);
  assert.match(entitlements, /com\.apple\.developer\.icloud-container-identifiers/);
  assert.match(entitlements, /iCloud\.com\.houfu72\.phloem/);
  assert.match(entitlements, /<string>CloudKit<\/string>/);
  assert.match(project, /CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements/);
  assert.match(project, /com\.apple\.iCloud/);
});

test('reader keeps local data first, merges conflicts, and lazily restores originals', async () => {
  const [reader, html, adapter] = await Promise.all([
    readFile(path.join(defaultRepoRoot, 'reading.js'), 'utf8'),
    readFile(path.join(defaultRepoRoot, 'reading.html'), 'utf8'),
    readFile(path.join(defaultRepoRoot, 'apps/ipad/native/ipad.js'), 'utf8')
  ]);
  assert.match(html, /id="icloudSettings"/);
  assert.match(html, /id="icloudDeleteBtn"/);
  assert.match(reader, /function iCloudOn\(\)/);
  assert.match(reader, /var local=await getLocalPdf\(id\);if\(local\)return local;/);
  assert.match(reader, /if\(iCloudOn\(\)\)return iCloudDownloadSource\(id\)/);
  assert.match(reader, /if\(remote&&remote\.found\).*mergeState\(incoming\)/s);
  assert.match(reader, /error&&error\.code==='ICLOUD_CONFLICT'&&attempt<2/);
  assert.match(reader, /await iCloudPlugin\(\)\.deleteCloudData\(\)/);
  assert.match(reader, /paused\?'☁ iCloud · attention'/);
  assert.match(reader, /iCloud sync supports original files up to 200 MB|ICLOUD_DOCUMENT_LIMIT=200\*1024\*1024/);
  assert.match(adapter, /window\.PHLOEM_ICLOUD\.sync\(true\)/);
  assert.doesNotMatch(adapter, /Cloud sync is unavailable in this release/);
});

test('bounded bridge base64 helpers preserve arbitrary document bytes', async () => {
  const source = await readFile(path.join(defaultRepoRoot, 'reading.js'), 'utf8');
  const encoder = source.match(/  function bytesToBase64\(bytes\)\{[\s\S]*?\n  \}/)?.[0];
  const decoder = source.match(/  function base64Bytes\(encoded\)\{[^\n]+\}/)?.[0];
  assert.ok(encoder && decoder, 'actual bridge conversion helpers must be exercised');
  const context = vm.createContext({ Uint8Array, btoa, atob, Math });
  vm.runInContext(`${encoder}\n${decoder}`, context);
  const input = Uint8Array.from({ length: 1_048_576 }, (_, index) => (index * 131 + 17) & 255);
  const encoded = context.bytesToBase64(input);
  const output = context.base64Bytes(encoded);
  assert.deepEqual(Buffer.from(output), Buffer.from(input));
});
