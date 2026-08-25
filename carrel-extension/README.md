# Read in Phloem — browser extension

Current store package: **1.1.13**

Send any PDF on the web or your computer straight to [Phloem](https://houfu72.com/reading.html),
the free local-first paper reading desk. Right-click a PDF link → **Read link in
Phloem**, or click the toolbar button while viewing a PDF. The extension fetches
the file with your own cookies (so campus/institution access carries over),
hands the bytes to the Phloem tab, and the paper opens ready to read — nothing
is ever uploaded anywhere.

On a fresh install, the extension opens Phloem once. A new empty library receives
the bundled field guide; extension updates and existing libraries stay untouched.

## How it works

- `background.js` — fetches the PDF the user asked for, checks it really is a
  PDF, parks the bytes in extension storage, and focuses/opens the Phloem tab.
- `content.js` — runs only on `houfu72.com/reading.html`; picks the parked
  bytes up and hands them to the page with `window.postMessage`.
- Phloem itself verifies the `%PDF` magic and imports through its normal
pipeline (deduped by source URL, real title extracted from the PDF).

## Local PDFs

Chrome keeps local files behind a separate user-controlled switch. The first time
someone clicks the extension on a `file://` PDF, Phloem checks that switch. If it is
off, a short instruction page explains how to right-click the extension icon, choose
**Manage extension**, and enable **Allow access to file URLs**. After that, clicking
the extension on a local PDF imports it normally. The same page also has a **Choose
PDF** fallback that works without file-URL access. The local filesystem path is not
passed into Phloem metadata or optional sync.

## Permissions, honestly

- `<all_urls>` — to download the PDF you clicked from whatever site hosts it, or read
  a local PDF after you explicitly enable Chrome's file-URL switch.
- `activeTab` — to identify the current PDF only when you click the extension. It
  grants no passive browsing access and shows no install warning.
- `storage` + `unlimitedStorage` — the fetched PDF is handed over through
  extension storage (papers are routinely 10–30 MB).
- `contextMenus` — the right-click entries.
- `notifications` — "that link isn't a PDF" and download failures.

Nothing is collected, logged, or sent anywhere. The only network request the
extension ever makes is the download of the PDF you explicitly asked for.

## Developing / installing unpacked

1. Open `chrome://extensions`, switch on **Developer mode**.
2. **Load unpacked** → pick this folder.
3. Right-click any PDF link → *Read link in Phloem*.

## Artwork credit

Phloem icon artwork by [Promma](https://www.linkedin.com/in/itpromma/).
