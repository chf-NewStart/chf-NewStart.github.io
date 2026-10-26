// Fills Tend's App Store Connect record from release/listing.json: version texts and URLs, name and subtitle,
// privacy policy URL, categories, content rights, review notes, and the build once it has processed.
// Never submits anything. Pricing, availability, App Privacy and the age rating stay in the browser.
// usage: ASC_KEY_ID=… ASC_ISSUER_ID=… node apps/tend-ios/scripts/asc-listing.mjs <version> [buildNumber]
// The key is read from ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8 and never printed.
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import os from 'node:os';

const BUNDLE = 'com.houfu72.tend', KID = process.env.ASC_KEY_ID, ISS = process.env.ASC_ISSUER_ID;
if (!KID || !ISS) throw new Error('Set ASC_KEY_ID and ASC_ISSUER_ID.');
const key = readFileSync(`${os.homedir()}/.appstoreconnect/private_keys/AuthKey_${KID}.p8`, 'utf8');
function token() {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'ES256', kid: KID, typ: 'JWT' }), b = b64({ iss: ISS, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' });
  return `${h}.${b}.${createSign('SHA256').update(`${h}.${b}`).sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
async function api(method, path, body) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://api.appstoreconnect.apple.com' + path, {
      method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : null;
    if (res.status >= 500 && attempt < 6) { await new Promise(r => setTimeout(r, 3000 * attempt)); continue; }
    throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 800)}`);
  }
}

const [versionString = '1.0.0', buildNumber] = process.argv.slice(2);
const listing = JSON.parse(readFileSync(new URL('../release/listing.json', import.meta.url), 'utf8'));
const app = (await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE}`)).data[0];
if (!app) throw new Error(`No App Store Connect record for ${BUNDLE} yet: create it under Apps → + → New App first.`);
console.log(`app ${app.id} "${app.attributes.name}"`);

await api('PATCH', `/v1/apps/${app.id}`, { data: { type: 'apps', id: app.id, attributes: { contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' } } });
console.log('content rights: no third-party content');

let version = (await api('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS`)).data
  .find(v => v.attributes.versionString === versionString || v.attributes.appStoreState === 'PREPARE_FOR_SUBMISSION');
if (!version) {
  version = (await api('POST', '/v1/appStoreVersions', { data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString },
    relationships: { app: { data: { type: 'apps', id: app.id } } } } })).data;
}
if (version.attributes.versionString !== versionString) {
  version = (await api('PATCH', `/v1/appStoreVersions/${version.id}`, { data: { type: 'appStoreVersions', id: version.id, attributes: { versionString } } })).data;
}
await api('PATCH', `/v1/appStoreVersions/${version.id}`, { data: { type: 'appStoreVersions', id: version.id, attributes: { copyright: '2026 Houfu Chen' } } });
console.log(`version ${versionString}: ${version.id} (${version.attributes.appStoreState})`);

const urls = { supportUrl: 'https://houfu72.com/focus/support.html', marketingUrl: 'https://houfu72.com/focus/' };
const vlocs = (await api('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data;
for (const [locale, t] of Object.entries(listing)) {
  if (locale === 'reviewNotes') continue;
  const attributes = { description: t.description, keywords: t.keywords, promotionalText: t.promotionalText, ...urls };
  const loc = vlocs.find(l => l.attributes.locale === locale);
  if (loc) await api('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, { data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes } });
  else await api('POST', '/v1/appStoreVersionLocalizations', { data: { type: 'appStoreVersionLocalizations', attributes: { locale, ...attributes },
    relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } });
  console.log(`${locale}: description, keywords, promotional text, support and marketing URLs`);
}

const info = (await api('GET', `/v1/apps/${app.id}/appInfos`)).data.find(i => !['READY_FOR_DISTRIBUTION', 'READY_FOR_SALE'].includes(i.attributes.appStoreState || i.attributes.state));
await api('PATCH', `/v1/appInfos/${info.id}`, { data: { type: 'appInfos', id: info.id, relationships: {
  primaryCategory: { data: { type: 'appCategories', id: 'PRODUCTIVITY' } }, secondaryCategory: { data: { type: 'appCategories', id: 'EDUCATION' } } } } });
console.log('categories: Productivity, Education');
const ilocs = (await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations`)).data;
for (const [locale, t] of Object.entries(listing)) {
  if (locale === 'reviewNotes') continue;
  const loc = ilocs.find(l => l.attributes.locale === locale);
  if (!loc) { console.log(`${locale}: no app info localization`); continue; }
  try {
    await api('PATCH', `/v1/appInfoLocalizations/${loc.id}`, { data: { type: 'appInfoLocalizations', id: loc.id,
      attributes: { name: t.name, subtitle: t.subtitle, privacyPolicyUrl: 'https://houfu72.com/focus/privacy.html' } } });
    console.log(`${locale}: name "${t.name}", subtitle "${t.subtitle}", privacy policy URL`);
  } catch (e) { console.log(`${locale}: name/subtitle not saved: ${e.message}`); }
}

// Review notes; the contact details are copied from Phloem's latest review detail.
let review = null;
try { review = (await api('GET', `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`)).data; } catch (e) { /* none yet */ }
if (review) {
  await api('PATCH', `/v1/appStoreReviewDetails/${review.id}`, { data: { type: 'appStoreReviewDetails', id: review.id, attributes: { notes: listing.reviewNotes, demoAccountRequired: false } } });
} else {
  const phloem = (await api('GET', '/v1/apps?filter[bundleId]=com.houfu72.phloem')).data[0];
  let contact = {};
  for (const v of phloem ? (await api('GET', `/v1/apps/${phloem.id}/appStoreVersions?filter[platform]=IOS&limit=5`)).data : []) {
    try { const d = (await api('GET', `/v1/appStoreVersions/${v.id}/appStoreReviewDetail`)).data; if (d?.attributes.contactEmail) { contact = d.attributes; break; } } catch (e) { /* try the next */ }
  }
  await api('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails',
    attributes: { contactFirstName: contact.contactFirstName, contactLastName: contact.contactLastName, contactPhone: contact.contactPhone,
      contactEmail: contact.contactEmail, demoAccountRequired: false, notes: listing.reviewNotes },
    relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } });
}
console.log('review notes and contact');

if (buildNumber) {
  const build = (await api('GET', `/v1/builds?filter[app]=${app.id}&filter[version]=${buildNumber}&fields[builds]=version,processingState`)).data[0];
  if (!build) console.log(`build ${buildNumber}: not in App Store Connect yet`);
  else if (build.attributes.processingState !== 'VALID') console.log(`build ${buildNumber}: ${build.attributes.processingState}`);
  else {
    await api('PATCH', `/v1/appStoreVersions/${version.id}/relationships/build`, { data: { type: 'builds', id: build.id } });
    console.log(`build ${buildNumber} attached`);
  }
}
console.log(`APP_ID=${app.id} VERSION_ID=${version.id}`);
