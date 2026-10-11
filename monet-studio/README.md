# Monet Light Strokes studio

This Cloudflare Worker lets visitors to [/monet/](https://houfu72.com/monet/) paint their own photo instead of sending it to Houfu. The page shrinks the photo to 1536px and sends it here. The Worker runs the open-source [Monet Light & Strokes skill](https://github.com/chf-NewStart/Monet-light-stroke) through OpenAI's Responses API: a reasoning model reads `SKILL.md`, the style system, and the people reference together with the photo, writes an edit prompt for that photo, and makes one `image_generation` call. The painting streams back to the page, rough previews first.

The skill is fetched from GitHub's `main` branch and cached for an hour, so improving the skill improves the studio with no redeploy. Studio rules on top of the skill: one clean painting only (no companion collage, no retries), and the canvas matches the photo's aspect ratio. If GitHub is unreachable, a condensed copy of the skill is used.

## Cost and limits

Billing uses an OpenAI **API** account, which is separate from ChatGPT and needs no subscription. API billing is prepaid: buy credits (minimum $5) at platform.openai.com → Settings → Billing, and keep auto-recharge off. When the credit is spent, the studio shows "couldn't finish" and nothing more is charged.

At the defaults, expect very roughly $0.05–0.15 per painting: a medium-quality image of about 1.5 MP, plus a few thousand reasoning tokens. The ~25k-token skill is the same in every request, so OpenAI's prompt caching bills most of it at the cached rate. Check real numbers on the OpenAI usage page after the first few paintings.

Spending has two daily caps, both counted in UTC days in D1:

- `DAILY_LIMIT_PER_VISITOR` (default 2). Visitors are a salted hash of their IP address. An IPv6 /64 counts as one visitor.
- `DAILY_LIMIT_TOTAL` (default 25) for the whole studio.

A turn is refunded if OpenAI refuses the photo (for example its safety check), is unreachable, or fails partway through the stream.

The photo is sent to OpenAI with `store: false` and never written anywhere by the Worker. D1 holds only the counters.

## Deploy once

From this folder, with Node installed:

```sh
npx wrangler login
npx wrangler d1 create monet-studio          # copy the database_id into wrangler.jsonc
npx wrangler d1 execute monet-studio --remote --file=schema.sql
npx wrangler secret put OPENAI_API_KEY       # an API key from platform.openai.com/api-keys
npx wrangler secret put VISITOR_SALT         # optional: any long random string
npx wrangler deploy
```

`wrangler deploy` prints the Worker URL, for example `https://monet-studio.<account>.workers.dev`. Put it in `data-endpoint` on the `<dialog id="monetStudio">` in `monet/index.html` and push. Until that attribute is set, the page keeps the Dropbox request flow and never shows the studio. A custom domain instead of `*.workers.dev` also has to be added to `connect-src` in that page's Content-Security-Policy.

## Settings

All settings are `vars` in `wrangler.jsonc`. Change one and run `npx wrangler deploy`.

| Setting | Default | What it does |
| --- | --- | --- |
| `OPENAI_MODEL` | `gpt-5.5` | Reads the skill and photo, writes the prompt |
| `REASONING_EFFORT` | `low` | Remove for models without reasoning |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` | Paints. `gpt-image-1*` falls back to its three fixed sizes |
| `IMAGE_QUALITY` | `medium` | `low`, `medium`, or `high`. High costs several times more |
| `IMAGE_ACTION` | `edit` | Makes the tool edit the photo rather than invent a scene. Empty lets the model choose |
| `IMAGE_SIZE` | `match` | `match` follows the photo; or `auto`, or a fixed size like `1024x1536` |
| `PARTIAL_IMAGES` | `2` | Rough previews streamed while painting (0–3) |
| `ALLOWED_ORIGINS` | the site's origins | Only these pages may call the Worker |

If OpenAI renames or retires a model, the Worker logs its error. See Workers → monet-studio → Logs. Change the model name and redeploy.

## Endpoints

- `GET /`: `{ open, left, limit }`, how many paintings this visitor has left today.
- `POST /paint` with `{ image: "data:image/jpeg;base64,…", width, height }`: OpenAI's Responses event stream, plus an `X-Paintings-Left` header. Errors are JSON `{ error }`: `limit` (429, with `scope` `visitor` or `total`), `blocked` (422), `bad_request` (400), `too_large` (413), `upstream` (502), `not_configured` (503).

## Tests

```sh
node --test tests/monet-studio-worker.test.mjs   # Worker, against SQLite and a fake OpenAI
node tests/monet-studio-browser.test.js          # the /monet/ page end to end in Chromium
```

For local testing against a deployed Worker, temporarily add `http://localhost:<port>` to `ALLOWED_ORIGINS`. Do not keep it in production.
