# Phloem 1.1 App Store package

Target: **version 1.1.0, build 25**, reader cache **v143**. Build 25 retains the verified left-side reading-guide grip from build 24 and adds a native App Store storefront gate for optional cloud features. In the China mainland storefront, or while the storefront is unknown, those features and settings are hidden and native requests are blocked. Local reading, Pencil writing, highlighting, notes, guide, search, and reviewer tools remain available. Device testing, distribution validation, and upload remain pending. This is draft metadata, not submitted App Store Connect content.

## Promotional text

Read papers deeply with a calm iPad desk, Apple Pencil handwriting and highlights, professional notes, focused layouts, and reviewer tools.

## What's New in This Version

Phloem 1.1 turns your iPad into a focused reading and annotation desk for academic and technical documents.

Also new:

- More natural handwriting with gentle pressure changes and tapered ends. Choose Natural or Clean for new ink in reading settings; existing notes keep their appearance. Holding at the end of a line is more tolerant of tiny Pencil movements and confirms when the line straightens.
- Rename papers directly from the open title or from the library, and scroll through up to six recent papers in Continue reading.
- Write directly on PDF pages with Apple Pencil, including margins, figures, and scanned or blank pages. Choose eight pen colors and three widths. Hold at the end of a long open stroke to straighten it, adjust the endpoint, then lift. Turn on Write when you want to handwrite; it is off by default.
- Erase handwriting and text highlights with either PDF eraser; one Undo restores the whole sweep.
- Switch between Pen and Highlighter with one tool active at a time, including touch and Zen controls.
- Smoother continuous handwriting, including previously saved strokes, without changing your original ink points or notes.
- Undo the latest handwriting or highlight edit directly from the Zen dock, without leaving focused reading.
- Highlight selectable text with Apple Pencil: drag across a passage and lift to save, including complete words at each endpoint. Mark opens its colors immediately and keeps them available between marks and color changes.
- Use Define directly from the bottom Highlight toolbar for your selected passage or latest selected highlight on the current page.
- Clean, professional note lettering is now the default, with a Handwritten switch when you want the original style.
- The reading-guide handle now stays on the left side of the guide band, clear of the Zen dock.
- Reliability and iPad interface refinements throughout the reader.

Handwriting stays editable in Phloem and is included in JSON backups. Export original PDF exports the original document without Phloem handwriting or highlights.

## Description

Phloem is a calm, local-first reading desk for research papers on iPad.

Import PDF and Word documents, read without distractions, and keep your thinking beside the source. Search a paper, highlight passages, write notes, track your place, use the movable reading guide, and switch between focused reading layouts. Clean note lettering is the default, and the Handwritten switch brings back a more personal notebook feel whenever you want it.

For handwritten PDF notes, turn on Write and use Apple Pencil directly on the page. Add ideas in the margins, circle figures, or sketch on scanned and blank pages without OCR. Choose from eight ink colors and three pen widths. Hold Pencil still for about 0.6 seconds after a long open stroke to straighten it, adjust the endpoint before lifting, or keep writing naturally with pressure-sensitive strokes. Your handwriting stays anchored to its PDF page as you zoom and change layouts; fingers remain available for navigation.

For text highlighting, Mark opens its bottom toolbar and keeps colors available as you highlight and change colors. Pencil strokes include complete endpoint words. The toolbar offers Define for the selected passage or the latest selected highlight still on the current page.

On PDFs, Write's Eraser and Mark's Erase both remove touched handwriting strokes and text highlights. One Undo restores the whole sweep; the Zen dock also includes Undo without leaving focused reading. The text Reader's highlight eraser is unchanged. Handwriting is saved with the library and in JSON backups. Export original PDF and the PDF in a NotebookLM package remain the unannotated original file; they do not embed Phloem handwriting or highlights.

For review work, Phloem keeps imported comments, linked passages, replies, and revision notes together. You stay in control of every link and every edit.

Private by design

- No Phloem account
- No advertising or Phloem analytics
- Local reading works offline after a document is imported
- Portable JSON backups include editable handwriting, typed notes, and highlights, but exclude original documents and private credentials
- Online features run only when you choose them

Online definitions, PDF URL imports, external links, and cloud file providers require an internet connection. Keep original document files separately.

## Keywords

`paper reader,pdf,academic,research,notes,highlight,annotation,review,iPad,Pencil`

## URLs

- Support URL: `https://houfu72.com/phloem-ipad/support.html`
- Privacy Policy URL: `https://houfu72.com/phloem-ipad/privacy.html`

Recheck both URLs before external TestFlight or App Review.

## App Review Information

- Sign-in required: **No**
- Contact information: use the current App Store Connect contact details.
- Before submission, prepare dedicated, spend-limited reviewer credentials for the AI providers Apple needs to test, including DeepSeek. Put them only in App Review Notes, never in this file or source control, and revoke them after review. Do not submit placeholder credentials.

### Review Notes draft

Version 1.1 adds Apple Pencil writing, improved highlighting, paper renaming, compact annotation tools, professional note lettering, and optional cloud assistance outside the China mainland storefront. No Phloem sign-in or purchase is required.

China mainland compliance in build 25: the app reads the signed App Store storefront with StoreKit. When the storefront country code is `CHN`, all cloud-assistance settings and entry points are hidden, native configuration and request calls are rejected, and any active provider request is cancelled if the storefront changes to `CHN`. The same fail-closed behavior applies while StoreKit has not returned a storefront or returns an unknown storefront. This restriction is enforced in native Swift, not only in the web interface. Local document reading, Apple Pencil writing, highlighting, notes, search, reading guide, Zen mode, and reviewer tools remain available in China.

Test path:

1. Launch Phloem and open the bundled Phloem field guide or import a non-sensitive sample PDF.
2. With Apple Pencil, turn on Write and add a note directly on the PDF. Try eight colors and three widths. Draw a long open stroke, hold still for 600 ms to straighten it, adjust the endpoint, and lift. Try both Write → Eraser and Mark → Erase on handwriting and text highlights; one Undo restores the whole sweep. Enter Zen and use its Undo button to reverse the latest edit; the button is disabled when no edits remain. Blank/scanned pages support Write without OCR; Mark highlighting still requires selectable text. The text Reader's eraser is unchanged. These non-AI actions do not require an API key or AI consent.
3. Open Settings → AI assistant.
4. Select the provider matching the supplied credential [OpenAI, Anthropic, or DeepSeek], leave the supplied model name, read the provider-specific disclosure, confirm the 18+ consent checkbox, and tap Save AI settings.
5. Enter the matching dedicated review API key in the native secure prompt: **[PASTE PROVIDER NAME AND REVIEW-ONLY KEY IN APP STORE CONNECT, NOT SOURCE CONTROL]**.
6. Return to the paper, open Discuss, choose Page, Selection, or Guide, and ask a question. Select a passage or tap a highlight on the current page, open Mark, and choose Define to use the existing lookup and configured-provider fallback. The Highlight toolbar has no Ask AI shortcut. The separate Discuss workspace identifies itself as AI and warns that important claims must be verified.
7. To revoke access, open Settings → AI assistant, select the configured provider, and tap Remove saved key.

To test the regional restriction, use a China mainland App Store sandbox/storefront. Settings → AI assistant, Discuss, selection actions, reviewer assistance, and the Highlight toolbar's cloud entry points are absent. Native configure/request calls fail with a regional-unavailability error. Switch to a supported non-China storefront and relaunch to test the provider flow below.

Before any request, the app names the provider, destination, categories of text sent, and purpose, links to the Phloem and provider privacy policies, and requires explicit consent. The key is stored using iOS Keychain with this-device-only protection and is not returned to the web layer, logged, or included in backups. Requests go directly over HTTPS to `api.openai.com`, `api.anthropic.com`, or `api.deepseek.com`; Phloem has no AI proxy. Depending on the action, the app sends the selected passage, current-page or guide text, the user's question and same-thread history, or extracted reviewer text and locally selected candidate excerpts. It never uploads the original PDF or Word file as part of an AI request. DeepSeek has its own disclosure and consent; adding it does not enable it automatically or reuse another provider's key or consent.

The provider backend and reviewer key will remain active throughout review. No external purchase is required for Apple to test the feature.

## App Privacy answers to confirm in App Store Connect

- Data collected: **Yes**
- User Content → Other User Content: **App Functionality**, linked to the user, not used for tracking
- Identifiers → User ID: **App Functionality**, linked to the user, not used for tracking
- Tracking: **No**
- Phloem advertising, developer marketing, and Phloem analytics: **No**

These are draft answers, not completed App Store Connect settings. Prompts use the user's provider account/API key and a provider may retain readable content beyond the live request. Evaluate any additional data-use purposes (including Other Purposes) for provider-controlled secondary use before submission; do not treat App Functionality as the sole purpose without reviewing DeepSeek's current account terms. Reconcile the answers with Xcode's generated archive privacy report and the public policy.

## Internal TestFlight: What to Test

Please test both an update from App Store version 1.0 and a clean install of 1.1:

- Existing papers, last page, highlights, notes, and reviewer work survive the update.
- Turn on Write and test real Pencil handwriting, pressure, dots, fast strokes, all eight colors and three widths. Hold still for 600 ms after a long open stroke, adjust its straightened endpoint before lifting, and confirm short strokes/closed loops do not unexpectedly snap. Confirm Write starts off and switches cleanly back to highlighting.
- On build 19, switch between Pen and Highlighter through every normal, touch, and Zen control. Confirm only the active tool shows selected/pressed states and switching during a stroke cancels it without saving stray ink. Check default Pencil highlighting and native finger text selection.
- Check complete Pencil endpoint words in forward/reverse and multiline highlights. Select Mark, then highlight and change colors without reopening the bottom toolbar. Verify Define uses only the selected passage or latest selected highlight still on the current page; deleted/off-page context must not be reused. Confirm Ask AI is absent from this toolbar and the separate Discuss workspace remains available.
- Sweep each PDF eraser over handwriting and text highlights together. Verify one Undo restores the complete sweep with highlight notes intact, Redo reapplies it, and cancellation restores content. Confirm the text Reader's eraser remains unchanged.
- In build 19, confirm the retained build 15 continuity repair with slow/fast writing, tight curves, and changing Pencil pressure at several zoom levels. Verify strokes no longer look beaded and that previously saved handwriting, dots, erase/Undo behavior, and JSON backups remain intact.
- In Zen, alternate handwriting and text highlight edits, then tap the dock's Undo button repeatedly, including with Write off. Confirm edits reverse in order, erased strokes/highlights can be restored, and the button disables when history is empty. Check reachability and normal navigation in Scroll/Page/Book, portrait/landscape, and Split View on a physical iPad.
- Write on blank/scanned PDFs without OCR and on mixed-size pages. Test Scroll/Page/Book, both leaves of a spread, zoom, dark paper, finger scrolling/pinch, palm contact, rotation, Split View, cancelled strokes, relaunch, and JSON backup/restore.
- Confirm handwritten notes stay editable in the library and JSON backup, while Export original PDF still downloads the unannotated original. Test erased strokes stay erased after restoring an older backup.
- With Apple Pencil, drag forward/backward across one or more text lines in PDF and Reader layouts, then lift. Verify color, Undo, notes, and relaunch persistence. Check finger selection, scrolling, pinch zoom, page turns, palm contact, cancelled strokes, and scanned PDFs separately on a physical iPad.
- Clean note lettering is the default; Clean and Handwritten switches visibly change saved wall notes and persist after relaunch.
- AI remains off until disclosure, 18+ confirmation, consent, and secure key entry are complete.
- OpenAI, Anthropic, and DeepSeek each handle Passage/Page/Guide discussion and reviewer assistance with a real disposable provider key and non-sensitive document. Automated mock checks do not establish live-provider success.
- Updating from build 10 or 11 preserves existing OpenAI/Anthropic setup; DeepSeek remains disabled until its own disclosure, consent, and key entry are complete.
- Declined consent, cancelled key entry, invalid/revoked keys, rate limits, timeouts, airplane mode, background/foreground, and key removal fail safely.
- The original document and unrelated library content are never transmitted.
- Local reading, search, notes, highlights, reviewer tools, backup/restore, rotation, Split View, keyboard use, force quit, relaunch, and offline reading still work.

Send feedback with the iPad model, iPadOS version, build number, provider, and steps to reproduce. Do not attach confidential papers or API keys.

## Submission sequence

1. Recheck the already-published privacy and support pages.
2. Create version 1.1.0 in the existing App Store Connect record.
3. Re-answer App Privacy and the current age-rating questionnaire.
4. Run `npm run ios:sync`, then create a fresh Release archive with Xcode 26 or later and the current iPadOS SDK; generate and inspect the archive privacy report.
5. Validate and upload the new **1.1.0 (25)** archive to internal TestFlight. Build 25 is the first focused 1.1 binary with both the left-side guide handle and the native China storefront gate.
6. Complete the physical-iPad and live-provider checklist against the exact TestFlight binary.
7. Capture screenshots from that binary and paste the final metadata and reviewer-only key.
8. Add for Review and submit. Prefer manual release or a phased release for the first AI-enabled update.
