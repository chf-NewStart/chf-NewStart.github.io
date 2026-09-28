# Phloem 1.1 AI privacy and App Store draft

Status: release-candidate draft for version 1.1. Version 1.0 build 7 is live; publish the prepared public policy before external TestFlight or App Review.

## Data flow

AI is off until a user confirms they are 18 or older, chooses OpenAI or Anthropic, enters their own API key, reads the provider-specific disclosure, and checks the consent box. A native receipt records the disclosure version, provider, destination host, and consent time. The user can remove the saved key in Settings; that also removes the consent receipt.

When the user deliberately invokes an AI feature, the app sends the minimum text needed for that action directly from the iPad to the chosen provider:

- selected passage, current-page text, or guide context;
- the user's question and earlier turns in the same Phloem discussion;
- for reviewer assistance, extracted reviewer text and candidate excerpts selected locally.

The original PDF/Word file, the rest of the library, highlights unrelated to the request, and the user's other provider keys are not uploaded. Phloem has no AI proxy and does not receive the prompt or response.

The provider receives its API key and ordinary connection information. The API key can link the request to the user's provider account. Provider handling, retention, regions, and training rules apply independently of Phloem.

## Providers shipping in 1.1

- **OpenAI:** `api.openai.com`. [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data). OpenAI states that API data is not used for training unless the API customer opts in; default abuse-monitoring logs may retain customer content and related metadata for up to 30 days, subject to exceptions. OpenAI advises users to be cautious with third-party products that request an API key; Phloem never embeds a developer key, collects the user's key in a native secure prompt, stores it with this-device-only Keychain protection, and does not return it to the web layer.
- **Anthropic:** `api.anthropic.com`. [Anthropic API retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data), [training use](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training), and [processing regions](https://privacy.claude.com/en/articles/7996890-where-are-your-servers-located-do-you-host-your-models-on-eu-servers). Anthropic states that commercial API data is not used for training by default. Standard inputs and outputs are normally deleted within 30 days; policy-flagged content, safety classifications, feedback, and legal, contractual, or feature-specific records can be retained longer. Data is stored in the United States and may be routed or processed elsewhere.

Gemini and DeepSeek are held from the public 1.1 UI and rejected by the native bridge. Current Gemini terms are not a clean fit for a general consumer app, and DeepSeek's API terms prohibit exposing keys in client-side code. Revisit them only with a compatible architecture and a fresh terms review.

Provider policies can change. Re-read the shipping-provider sources on the day the App Store submission is finalized.

## App Store Connect privacy draft

Use conservative answers unless counsel or Apple confirms a narrower treatment:

- **Data collected:** Yes, because the selected third-party AI provider can retain data beyond servicing the live request.
- **User Content → Other User Content:** collected only when AI is used; used for App Functionality; linked to the user because the request uses the user's provider account/API key; not used for tracking.
- **Identifiers → User ID:** the provider API key/account identifier is used for App Functionality; linked to the user; not used for tracking.
- **Tracking:** No.
- **Advertising/marketing/analytics:** No by Phloem. Provider security and service-operation processing is described in the public policy; reconfirm the selected providers' current terms before publishing the answer.

The AI flow is ongoing after initial consent, so it should not rely on Apple's “optional disclosure” exception. Keep App Store Connect answers consistent with `PrivacyInfo.xcprivacy` and the public privacy policy.

## Public policy update required before 1.1 submission

Update `phloem-ipad/privacy.html` after 1.0 is accepted/released and before 1.1 is submitted. The revised page must:

1. Identify OpenAI and Anthropic and the exact data categories above.
2. Explain that the user chooses the provider and initiates each transfer.
3. Explain that the key is entered in a native secure prompt, stored in local Keychain, and cannot be read back through Phloem's web interface.
4. State provider-controlled retention, training, processing-region, and deletion limitations without promising more than provider terms support.
5. Explain how to revoke consent/remove a credential in the app and how to contact Phloem for privacy questions.
6. Link to each provider's current policy and terms.
7. Remain reachable from inside the app and from App Store Connect.

## Review-note draft

“AI is optional, restricted to users who confirm they are 18 or older, and disabled by default. To enable it, the user selects OpenAI or Anthropic, reviews a provider-specific disclosure identifying the text sent and destination, affirmatively consents, and enters their API key in a native iOS secure prompt. The key is stored in iOS Keychain and cannot be read back through the web interface or included in backups. AI requests go directly to the selected provider over HTTPS only when the user invokes an AI feature; the original document file is never uploaded. The AI workspace identifies itself as AI, warns that output can be inaccurate, and asks users to verify important claims. Settings includes controls to remove the key and revoke the local consent receipt. No AI data is used for tracking, advertising, or Phloem analytics.”
