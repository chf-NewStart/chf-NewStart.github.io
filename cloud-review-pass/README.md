# Phloem cloud review passes

This Cloudflare Worker keeps the owner's DeepSeek key off the public Phloem site. It issues opaque links that can run one review workflow for ten minutes after first use.

Each grant is restricted to Phloem's existing reviewer-classification and passage-location prompts. It is bound to the first review job, capped at 96 model calls and 500,000 reserved tokens (enough for a long report with retry checks), and revoked as soon as the browser completes the workflow. Prompts and manuscript excerpts are proxied to DeepSeek but are not stored by this service.

## Deploy once

1. Create a D1 database named `phloem-review-passes` and put its ID in `wrangler.jsonc`.
2. Apply `schema.sql` to the remote D1 database.
3. Add Worker secrets named `DEEPSEEK_API_KEY` and `PASS_ADMIN_TOKEN`. Make the approval token long and unique.
4. Confirm `ALLOWED_ORIGINS` contains every published Phloem origin, then deploy the Worker.
5. In Phloem's Desk settings, paste the Worker URL under **Share a cloud review pass**. Enter the approval token only when making a link; Phloem never saves it.

Typical Wrangler commands, run from this folder:

```sh
npx wrangler d1 create phloem-review-passes
npx wrangler d1 execute phloem-review-passes --remote --file=schema.sql
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put PASS_ADMIN_TOKEN
npx wrangler deploy
```

For local `file://` testing only, temporarily add `null` to `ALLOWED_ORIGINS`. Do not keep it in production.
