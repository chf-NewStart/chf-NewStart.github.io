# Phloem 1.1 App Store package

Target: **version 1.1.0, build 8**. If build 8 has ever been uploaded to App Store Connect, increment the build number first. Use internal TestFlight before App Review and choose manual or phased release.

## Promotional text

Read papers deeply with a calm iPad desk, professional notes, highlights, reviewer tools, and optional bring-your-own-key AI from OpenAI or Anthropic.

## What's New in This Version

Phloem 1.1 adds an optional AI reading partner for users 18 and older. With your own OpenAI or Anthropic API key, you can discuss a selected passage, the current page, or the reading guide, and get help matching reviewer comments to likely passages.

Also new:

- Clean, professional note lettering is now the default, with a Handwritten switch when you want the original style.
- AI is off by default and sends text only after a provider-specific disclosure and your explicit consent.
- API keys are entered in a secure iOS prompt, stored in Keychain, and excluded from Phloem backups.
- Reliability and iPad interface refinements throughout the reader.

AI output can be inaccurate. Verify important claims. Provider API charges and terms may apply.

## Description

Phloem is a calm, local-first reading desk for research papers on iPad.

Import PDF and Word documents, read without distractions, and keep your thinking beside the source. Search a paper, highlight passages, write notes, track your place, use the movable reading guide, and switch between focused reading layouts. Clean note lettering is the default, and the Handwritten switch brings back a more personal notebook feel whenever you want it.

For review work, Phloem keeps imported comments, linked passages, replies, and revision notes together. You stay in control of every link and every edit.

Optional AI for users 18 and older

Bring your own OpenAI or Anthropic API key to discuss a selected passage, the current page, or guide context, or to help locate passages related to reviewer comments. AI is disabled by default. Before setup, Phloem names the provider, explains what text will be sent, links to its policy, and asks for your explicit consent.

Your key is entered in a native secure prompt, stored in iOS Keychain, and never included in a Phloem backup. Requests go directly to the provider you choose. Phloem does not operate an AI proxy, and the original PDF or Word file is not uploaded as part of an AI request.

Private by design

- No Phloem account
- No advertising or Phloem analytics
- Local reading works offline after a document is imported
- Portable JSON backups exclude original documents and AI keys
- Online features run only when you choose them

AI, online definitions, PDF URL imports, external links, and cloud file providers require an internet connection. Keep original document files separately. AI provider terms, availability, and charges may apply, and AI output can be inaccurate.

## Keywords

`paper reader,pdf,academic,research,notes,highlight,annotation,review,AI,iPad`

## URLs

- Support URL: `https://houfu72.com/phloem-ipad/support.html`
- Privacy Policy URL: `https://houfu72.com/phloem-ipad/privacy.html`

Publish the prepared support and privacy pages before external TestFlight or App Review.

## App Review Information

- Sign-in required: **No**
- Contact information: use the current App Store Connect contact details.
- Before submission, create a dedicated, spend-limited OpenAI or Anthropic reviewer key. Put it only in App Review Notes, never in this file or source control, and revoke it after review.

### Review Notes draft

Version 1.1 adds an optional AI reading assistant for users who confirm they are 18 or older. No Phloem sign-in or purchase is required, and declining AI consent leaves the complete non-AI reader available.

Test path:

1. Launch Phloem and open the bundled Phloem field guide or import a non-sensitive sample PDF.
2. Open Settings → AI assistant.
3. Select [OpenAI or Anthropic], leave the supplied model name, read the provider-specific disclosure, confirm the 18+ consent checkbox, and tap Save AI settings.
4. Enter this dedicated review API key in the native secure prompt: **[PASTE REVIEW-ONLY KEY IN APP STORE CONNECT, NOT SOURCE CONTROL]**.
5. Return to the paper, open Discuss, choose Page, Selection, or Guide, and ask a question. The workspace identifies itself as AI and warns that important claims must be verified.
6. To revoke access, open Settings → AI assistant, select the configured provider, and tap Remove saved key.

Before any request, the app names the provider, destination, categories of text sent, and purpose, links to both privacy policies, and requires explicit consent. The key is stored using iOS Keychain with this-device-only protection and is not returned to the web layer, logged, or included in backups. Requests go directly over HTTPS to `api.openai.com` or `api.anthropic.com`; Phloem has no AI proxy. Depending on the action, the app sends the selected passage, current-page or guide text, the user's question and same-thread history, or extracted reviewer text and locally selected candidate excerpts. It never uploads the original PDF or Word file as part of an AI request.

The provider backend and reviewer key will remain active throughout review. No external purchase is required for Apple to test the feature.

## App Privacy answers to confirm in App Store Connect

- Data collected: **Yes**
- User Content → Other User Content: **App Functionality**, linked to the user, not used for tracking
- Identifiers → User ID: **App Functionality**, linked to the user, not used for tracking
- Tracking: **No**
- Phloem advertising, developer marketing, and Phloem analytics: **No**

These answers reflect that prompts use the user's provider account/API key and a provider may retain readable content beyond the live request. Reconcile them with Xcode's generated archive privacy report before submission.

## Internal TestFlight: What to Test

Please test both an update from App Store version 1.0 and a clean install of 1.1:

- Existing papers, last page, highlights, notes, and reviewer work survive the update.
- Clean note lettering is the default; Clean and Handwritten switches visibly change saved wall notes and persist after relaunch.
- AI remains off until disclosure, 18+ confirmation, consent, and secure key entry are complete.
- OpenAI and Anthropic each handle Passage/Page/Guide discussion and reviewer assistance.
- Declined consent, cancelled key entry, invalid/revoked keys, rate limits, timeouts, airplane mode, background/foreground, and key removal fail safely.
- The original document and unrelated library content are never transmitted.
- Local reading, search, notes, highlights, reviewer tools, backup/restore, rotation, Split View, keyboard use, force quit, relaunch, and offline reading still work.

Send feedback with the iPad model, iPadOS version, build number, provider, and steps to reproduce. Do not attach confidential papers or API keys.

## Submission sequence

1. Publish the privacy and support pages.
2. Create version 1.1.0 in the existing App Store Connect record.
3. Re-answer App Privacy and the current age-rating questionnaire.
4. Archive with Xcode 26 or later and the current iPadOS SDK; generate and inspect the archive privacy report.
5. Upload build 8 (or the next unused build number) to internal TestFlight.
6. Complete the physical-iPad and live-provider checklist against the exact TestFlight binary.
7. Capture screenshots from that binary and paste the final metadata and reviewer-only key.
8. Add for Review and submit. Prefer manual release or a phased release for the first AI-enabled update.
