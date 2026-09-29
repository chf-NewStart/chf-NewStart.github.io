# Phloem 1.1 AI privacy and App Store draft

Status: release-candidate draft for **version 1.1.0 (18)**. Build 12 added DeepSeek and the corrected icon; build 13 fixed consent-panel persistence; builds 14–16 added PDF handwriting, continuous ink rendering, and Zen Undo. Build 17 added hold-to-straighten, eight ink colors, and unified PDF erasers, with a verified signed archive. Build 18 fixes mutually exclusive Pen/Highlighter selection through normal, touch, and Zen controls, visible selected/pressed states, and cancellation when switching during a stroke. Dedicated switching checks pass 113/113 in Chromium and WebKit. The fresh signed build 18 archive has verified version/build metadata, strict signature, and bundled-source matches after native transforms; build 17's archive lacks this fix. Upload, real Pencil behavior, and live-provider requests remain release gates, not verified results. Version 1.0 build 7 is live. Public privacy/support updates were verified live; recheck their reachability and shipping-provider terms before submission.

Write mode, hold-to-straighten, expanded colors, unified PDF erasing, Zen Undo, and build 18's tool-switching fix do not add an AI request or new network destination. Holding a long open stroke for 600 ms straightens it locally; its endpoint can be adjusted before lifting. Both PDF erasers remove whole ink strokes and text highlights with one Undo per sweep; the text Reader's eraser is unchanged. Handwriting is stored as page-anchored vectors and erase history in the app's library/recovery storage and JSON backups. It is not transcribed or sent to an AI provider by these features. The shared browser sync format can carry the vectors; native iPad Drive/GitHub sync remains disabled. Export original PDF remains the unannotated original, not an export of handwritten notes.

## Data flow

AI is off until a user confirms they are 18 or older, chooses OpenAI, Anthropic, or DeepSeek, enters their own API key, reads the provider-specific disclosure, and checks the consent box. A native receipt records the disclosure version, provider, destination host, and consent time. The user can remove the saved key in Settings; that also removes the consent receipt. Adding a provider never enables it or transfers another provider's consent automatically.

When the user deliberately invokes an AI feature, the app sends the minimum text needed for that action directly from the iPad to the chosen provider:

- selected passage, current-page text, or guide context;
- the user's question and earlier turns in the same Phloem discussion;
- for reviewer assistance, extracted reviewer text and candidate excerpts selected locally.

The original PDF/Word file, the rest of the library, highlights unrelated to the request, and the user's other provider keys are not uploaded. Phloem has no AI proxy and does not receive the prompt or response.

The provider receives its API key and ordinary connection information. The API key can link the request to the user's provider account. Provider handling, retention, regions, and training rules apply independently of Phloem.

## Providers shipping in 1.1

- **OpenAI:** `api.openai.com`. [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data). OpenAI states that API data is not used for training unless the API customer opts in; default abuse-monitoring logs may retain customer content and related metadata for up to 30 days, subject to exceptions. OpenAI advises users to be cautious with third-party products that request an API key; Phloem never embeds a developer key, collects the user's key in a native secure prompt, stores it with this-device-only Keychain protection, and does not return it to the web layer.
- **Anthropic:** `api.anthropic.com`. [Anthropic API retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data), [training use](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training), and [processing regions](https://privacy.claude.com/en/articles/7996890-where-are-your-servers-located-do-you-host-your-models-on-eu-servers). Anthropic states that commercial API data is not used for training by default. Standard inputs and outputs are normally deleted within 30 days; policy-flagged content, safety classifications, feedback, and legal, contractual, or feature-specific records can be retained longer. Data is stored in the United States and may be routed or processed elsewhere.

- **DeepSeek:** `api.deepseek.com`, using direct HTTPS requests to `/chat/completions`. [DeepSeek privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html) and [Open Platform terms](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html), reviewed 28 September 2026. The published policy describes processing/storage in China, service-dependent retention, and model/technology improvement use. It distinguishes developer end-user processing; it is not a clear API-specific no-training or fixed-retention guarantee. Phloem makes neither promise. Users must assess their account terms before sending sensitive material.

DeepSeek's terms require API-key protection and prohibit exposure in browser or other client-side code. The integration uses the same native secure entry, this-device-only Keychain, and native requests as the other providers: no key in bundled code, JavaScript, backups, or Phloem servers. This is a technical safeguard, not a claim of provider endorsement or legal clearance. Reconfirm provider/account conditions, regional availability, and permitted factual provider identification before public release.

Gemini and arbitrary custom endpoints remain held from the public 1.1 UI and rejected by the native bridge; this change does not expand their scope.

Provider policies can change. Re-read the shipping-provider sources on the day the App Store submission is finalized.

## App Store Connect privacy draft

Use conservative answers unless counsel or Apple confirms a narrower treatment:

- **Data collected:** Yes, because the selected third-party AI provider can retain data beyond servicing the live request.
- **User Content → Other User Content:** collected only when AI is used; used for App Functionality; linked to the user because the request uses the user's provider account/API key; not used for tracking. Before submission, assess whether the provider's permitted secondary use requires additional purposes, including Other Purposes; do not assume App Functionality is the only purpose for DeepSeek.
- **Identifiers → User ID:** the provider API key/account identifier is used for App Functionality; linked to the user; not used for tracking.
- **Tracking:** No.
- **Advertising/marketing/analytics:** No by Phloem. Provider security and service-operation processing is described in the public policy; reconfirm the selected providers' current terms before publishing the answer.

The AI flow is ongoing after initial consent, so it should not rely on Apple's “optional disclosure” exception. Keep App Store Connect answers consistent with `PrivacyInfo.xcprivacy` and the public privacy policy.

## Public policy verification before 1.1 submission

The updated `phloem-ipad/privacy.html` and support page were verified live. Before 1.1 submission, recheck that the privacy page continues to:

1. Identify OpenAI, Anthropic, and DeepSeek and the exact data categories above.
2. Explain that the user chooses the provider and initiates each transfer.
3. Explain that the key is entered in a native secure prompt, stored in local Keychain, and cannot be read back through Phloem's web interface.
4. State provider-controlled retention, training, processing-region, and deletion limitations without promising more than provider terms support.
5. Explain how to revoke consent/remove a credential in the app and how to contact Phloem for privacy questions.
6. Link to each provider's current policy and terms.
7. Remain reachable from inside the app and from App Store Connect.

## Review-note draft

“AI is optional, restricted to users who confirm they are 18 or older, and disabled by default. To enable it, the user selects OpenAI, Anthropic, or DeepSeek, reviews a provider-specific disclosure identifying the text sent and destination, affirmatively consents, and enters their API key in a native iOS secure prompt. The key is stored in iOS Keychain and cannot be read back through the web interface or included in backups. AI requests go directly to the selected provider over HTTPS only when the user invokes an AI feature; the original document file is never uploaded. DeepSeek setup separately discloses processing in China and provider-controlled retention and training conditions. The AI workspace identifies itself as AI, warns that output can be inaccurate, and asks users to verify important claims. Settings includes controls to remove the key and revoke the local consent receipt. Phloem does not use AI data for tracking, advertising, or analytics.”
