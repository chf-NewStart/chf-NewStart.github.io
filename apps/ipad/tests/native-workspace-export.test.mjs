import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultRepoRoot, readerFiles } from '../scripts/build-web.mjs';

test('whole-Workspace PDF export is local, compiled, registered, and bundled', async () => {
  const app = path.join(defaultRepoRoot, 'apps/ipad/ios/App');
  const [plugin, bridge, project, renderer, html, reader] = await Promise.all([
    readFile(path.join(app, 'App/PhloemWorkspaceExportPlugin.swift'), 'utf8'),
    readFile(path.join(app, 'App/PhloemBridgeViewController.swift'), 'utf8'),
    readFile(path.join(app, 'App.xcodeproj/project.pbxproj'), 'utf8'),
    readFile(path.join(app, 'App/PhloemWorkspacePDF.swift'), 'utf8'),
    readFile(path.join(defaultRepoRoot, 'reading.html'), 'utf8'),
    readFile(path.join(defaultRepoRoot, 'reading.js'), 'utf8'),
  ]);
  assert.match(plugin, /CAPBridgedPlugin/);
  assert.match(plugin, /jsName = "PhloemWorkspaceExport"/);
  assert.match(plugin, /name: "exportPDF"/);
  assert.match(plugin, /UIActivityViewController\(activityItems: \[url\]/);
  assert.match(plugin, /world: \.page/);
  assert.match(bridge, /registerPluginInstance\(PhloemWorkspaceExportPlugin\(\)\)/);
  for (const file of ['PhloemWorkspaceExportPlugin.swift', 'PhloemWorkspacePDF.swift']) {
    assert.match(project, new RegExp(file.replaceAll('.', '\\.') + ' in Sources'));
  }
  assert.match(renderer, /prepareNotebookWhiteboardExport/);
  assert.match(renderer, /createPDF/);
  assert.match(renderer, /PDFDocument/);
  assert.doesNotMatch(renderer, /URLSession|https:\/\//);
  assert(readerFiles.includes('reading-workspace-pdf.js'));
  assert.match(html, /id="workspaceExportPDF"/);
  assert.match(reader, /PhloemWorkspaceExport/);
  assert.match(reader, /printWorkspacePdf/);
});
