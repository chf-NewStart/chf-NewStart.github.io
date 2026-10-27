// Puts a new Tend version up for App Review once the previous one is approved: creates the version (if needed),
// sets What's New and the listing text from release/listing.json, attaches the build, carries the review notes over
// with what's new for the reviewer, checks the screenshots came across, adds the release's extra screenshots (best
// effort: a failed upload never holds up the submission), then submits.
//
//   node apps/tend-ios/scripts/asc-submit.mjs apps/tend-ios/release/testflight-1.1.json --dry-run   (reads only)
//   node apps/tend-ios/scripts/asc-submit.mjs apps/tend-ios/release/testflight-1.1.json             (submits)
//
// Uses the App Store Connect API key in ~/.appstoreconnect/private_keys. Submitting needs Houfu's OK each time.
import { readFileSync } from 'node:fs';
import { createHash, createSign } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const KID = '32QNHVX837', ISS = '3bbb66a7-38fe-424e-b240-e768c7604b84', APP = '6827232455';
const key = readFileSync(`${os.homedir()}/.appstoreconnect/private_keys/AuthKey_${KID}.p8`, 'utf8');
const release = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const listing = JSON.parse(readFileSync(new URL('../release/listing.json', import.meta.url), 'utf8'));
const dryRun = process.argv.includes('--dry-run');
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: KID, typ: 'JWT' }), body = b64({ iss: ISS, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' });
  return `${head}.${body}.${createSign('SHA256').update(`${head}.${body}`).sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
async function api(method, path, data) {
  if (dryRun && method !== 'GET') { console.log('would', method, path); return { data: { id: '(dry run)' } }; }
  const res = await fetch('https://api.appstoreconnect.apple.com' + path, {
    method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: data && JSON.stringify(data) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Uploads one screenshot into a set (reserve, upload the parts, commit), as tools/asc-media.mjs in the Qi repo does.
async function uploadScreenshot(setId, file) {
  const data = readFileSync(file);
  const created = await api('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots', attributes: { fileName: path.basename(file), fileSize: data.length },
    relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } } } });
  try {
    for (const op of created.data.attributes.uploadOperations) {
      const headers = Object.fromEntries((op.requestHeaders || []).map(header => [header.name, header.value]));
      const res = await fetch(op.url, { method: op.method, headers, body: data.subarray(op.offset, op.offset + op.length) });
      if (!res.ok) throw new Error(`upload part ${res.status}`);
    }
  } catch (error) {
    await api('DELETE', `/v1/appScreenshots/${created.data.id}`).catch(() => {});
    throw error;
  }
  await api('PATCH', `/v1/appScreenshots/${created.data.id}`, { data: { type: 'appScreenshots', id: created.data.id,
    attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(data).digest('hex') } } });
  return created.data.id;
}

// The release's extra screenshots (release.screenshots: [{ displayType, file, first }]), each uploaded once,
// waited on until Apple has processed it, and put first when asked.
async function addScreenshots(localizationId) {
  for (const shot of release.screenshots || []) {
    const file = shot.file.replace(/^~/, os.homedir());
    let added = null;
    try {
      const set = (await api('GET', `/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets`)).data
        .find(item => item.attributes.screenshotDisplayType === shot.displayType);
      if (!set) { console.log(`no ${shot.displayType} screenshots here; ${path.basename(file)} skipped`); continue; }
      let have = (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data;
      let id = have.find(item => item.attributes.fileName === path.basename(file))?.id;
      if (!id) {
        added = id = await uploadScreenshot(set.id, file);
        let state;
        for (let i = 0; i < 36 && state !== 'COMPLETE'; i++) {
          await sleep(10_000);
          state = (await api('GET', `/v1/appScreenshots/${id}`)).data.attributes.assetDeliveryState?.state;
          if (state === 'FAILED') throw new Error('Apple could not process it');
        }
        if (state !== 'COMPLETE') throw new Error('still processing after 6 minutes');
        added = null;
        have = (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data;
      }
      if (shot.first) {
        const order = [id, ...have.map(item => item.id).filter(other => other !== id)];
        await api('PATCH', `/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`, { data: order.map(other => ({ type: 'appScreenshots', id: other })) });
      }
      console.log(`screenshot ${path.basename(file)} added to ${shot.displayType}${shot.first ? ', first' : ''}`);
    } catch (error) {
      // A half-made screenshot would hold up the review, so it goes.
      if (added) await api('DELETE', `/v1/appScreenshots/${added}`).catch(() => {});
      console.log(`screenshot ${path.basename(file)} skipped (${error.message}); submitting with the screenshots already there`);
    }
  }
}

const versions = (await api('GET', `/v1/apps/${APP}/appStoreVersions?fields[appStoreVersions]=versionString,appStoreState,releaseType,copyright`)).data;
const live = versions.find(item => item.attributes.versionString !== release.version);
const blocking = versions.filter(item => item.attributes.versionString !== release.version && !['READY_FOR_SALE', 'REMOVED_FROM_SALE', 'DEVELOPER_REMOVED_FROM_SALE', 'REPLACED_WITH_NEW_VERSION'].includes(item.attributes.appStoreState));
console.log('versions:', versions.map(item => `${item.attributes.versionString} ${item.attributes.appStoreState}`).join(', '));
if (blocking.length && !dryRun) throw new Error('Wait: ' + blocking.map(item => `${item.attributes.versionString} is ${item.attributes.appStoreState}`).join(', '));

const build = (await api('GET', `/v1/builds?filter[app]=${APP}&filter[version]=${release.build}&filter[preReleaseVersion.version]=${release.version}&fields[builds]=version,processingState`)).data[0];
if (!build || build.attributes.processingState !== 'VALID') throw new Error(`Build ${release.build} of ${release.version} is not VALID yet`);
console.log('build', release.build, build.attributes.processingState);

let version = versions.find(item => item.attributes.versionString === release.version);
if (!version) {
  console.log('creating version', release.version);
  version = (await api('POST', '/v1/appStoreVersions', { data: { type: 'appStoreVersions',
    attributes: { platform: 'IOS', versionString: release.version, releaseType: live?.attributes.releaseType || 'AFTER_APPROVAL', copyright: live?.attributes.copyright },
    relationships: { app: { data: { type: 'apps', id: APP } } } } })).data;
}

if (!dryRun || !version.id.startsWith('(')) {
  const localizations = (await api('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?fields[appStoreVersionLocalizations]=locale,whatsNew`)).data;
  for (const localization of localizations) {
    const text = listing[localization.attributes.locale] || {};
    const fields = Object.fromEntries(['description', 'keywords', 'promotionalText'].filter(field => text[field]).map(field => [field, text[field]]));
    await api('PATCH', `/v1/appStoreVersionLocalizations/${localization.id}`, { data: { type: 'appStoreVersionLocalizations', id: localization.id,
      attributes: { whatsNew: release.whatsNew, ...fields } } });
    const sets = (await api('GET', `/v1/appStoreVersionLocalizations/${localization.id}/appScreenshotSets?include=appScreenshots&limit[appScreenshots]=10`));
    const shots = (sets.included || []).length;
    console.log(`${localization.attributes.locale}: What's New and ${Object.keys(fields).join(', ') || 'no listing text'} set, ${sets.data.length} screenshot sets, ${shots} screenshots`);
    if (!shots) throw new Error(`No screenshots came across for ${localization.attributes.locale}; add them before submitting`);
    await addScreenshots(localization.id);
  }
  await api('PATCH', `/v1/appStoreVersions/${version.id}/relationships/build`, { data: { type: 'builds', id: build.id } });
  console.log('build attached');
}

// Review notes: carry the previous version's contact and notes over, with what's new for the reviewer first.
const previous = live && (await api('GET', `/v1/appStoreVersions/${live.id}/appStoreReviewDetail`)).data;
const notes = [release.reviewNotes, previous?.attributes.notes].filter(Boolean).join('\n\n');
if (!dryRun || !version.id.startsWith('(')) {
  const current = await api('GET', `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`).catch(() => null);
  const contact = Object.fromEntries(Object.entries(previous?.attributes || {}).filter(([field]) => field.startsWith('contact') || field === 'demoAccountRequired'));
  if (current?.data) await api('PATCH', `/v1/appStoreReviewDetails/${current.data.id}`, { data: { type: 'appStoreReviewDetails', id: current.data.id, attributes: { ...contact, notes } } });
  else await api('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes: { ...contact, notes },
    relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } });
}
console.log('review notes:', notes.slice(0, 160).replace(/\n/g, ' '), '…');

const submission = (await api('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' },
  relationships: { app: { data: { type: 'apps', id: APP } } } } })).data;
await api('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems',
  relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: submission.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } });
await api('PATCH', `/v1/reviewSubmissions/${submission.id}`, { data: { type: 'reviewSubmissions', id: submission.id, attributes: { submitted: true } } });
console.log(dryRun ? 'dry run: nothing was changed' : `submitted ${release.version} (${release.build}) for review: ${submission.id}`);
