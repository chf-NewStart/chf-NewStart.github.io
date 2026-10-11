# Monet Light Strokes studio

This Cloudflare Worker lets visitors to [/monet/](https://houfu72.com/monet/) paint their own photo instead of sending it to Houfu. The page shrinks the photo to 1536px and sends it here. The Worker runs the open-source [Monet Light & Strokes skill](https://github.com/chf-NewStart/Monet-light-stroke) through OpenAI's Responses API: a reasoning model reads `SKILL.md`, the style system, and the people reference together with the photo, writes an edit prompt for that photo, and makes one `image_generation` call. The painting streams back to the page, rough previews first.

The skill is fetched from GitHub's `main` branch and cached for an hour, so improving the skill improves the studio with no redeploy. Studio rules on top of the skill: one clean painting only (no companion collage, no retries), and the canvas matches the photo's aspect ratio. If GitHub is unreachable, a condensed copy of the skill is used.

## Cost and limits

Billing uses an OpenAI **API** account, which is separate from ChatGPT and needs no subscription. API billing is prepaid: buy credits (minimum $5) at platform.openai.com → Settings → Billing, and keep auto-recharge off. When the credit is spent, visitors see "The studio is closed for now" with the personal-request link, and nothing more is charged.

At the defaults, expect very roughly $0.05–0.15 per painting: a medium-quality image of about 1.5 MP, plus a few thousand reasoning tokens. The ~25k-token skill is the same in every request, so OpenAI's prompt caching bills most of it at the cached rate. Check real numbers on the OpenAI usage page after the first few paintings.

Spending has two daily caps, both counted in UTC days:

- `DAILY_LIMIT_PER_VISITOR` (default 2). A visitor is a salted hash of their IP address. An IPv6 /64 counts as one visitor.
- `DAILY_LIMIT_TOTAL` (default 25) for the whole studio.

Whether a turn is given back depends on how far the painting got:

- **OpenAI rejects the request before doing any work** (an outage, or a bad request): always given back. OpenAI bills nothing for these.
- **The painting fails partway** (or the response finishes without an image): given back at most once per visitor and five times a day across the studio. By then OpenAI has already billed the reading and prompt-writing, so these refunds are capped.
- **A painting was delivered:** never given back, however the response ends.
- **OpenAI's safety check refuses the photo:** the turn is spent. Otherwise one person could keep resubmitting a refused photo under your organization. Each request also carries a hashed visitor ID (`safety_identifier`), so OpenAI can act on one abusive visitor rather than the whole studio.

Each request is also hard-capped: one image call (`max_tool_calls`), and at most `MAX_OUTPUT_TOKENS` of reasoning and text.

When OpenAI reports a problem only you can fix, visitors see "The studio is closed for now" with the personal-request link instead of an endless "try again", and the details are in Workers & Pages → monet-studio → Logs. That covers a revoked key, an unverified organization, used-up credit, and a retired model or parameter.

The counters live in one SQLite-backed Durable Object (`PaintQuota`). The first deploy creates it, so there is no database to set up. It stores only hashed visitor keys and counts, and it forgets earlier days at the first painting of each new day. The photo is sent to OpenAI with `store: false` and never written anywhere by the Worker.

On CPU: each painting needs a few milliseconds of Worker CPU to read the upload, build the request, and relay the stream. That was measured at roughly 5–8 ms in Node, which is close to the free plan's 10 ms per request. After the first paintings, check Workers & Pages → monet-studio → Observability. If requests show "Exceeded CPU limit", move the account to the Workers Paid plan. No code change is needed.

## Go live

### 1. OpenAI (once)

1. Make sure the API account has credit: platform.openai.com → Settings → Billing.
2. **Verify the organization:** Settings → Organization → General → Verify Organization. OpenAI requires this ID check before any account can use its image models, `gpt-image-2` included. Without it, every painting fails with a 403. After verifying, access can take about 15 minutes.
3. Create an API key for the studio: platform.openai.com/api-keys. Give the studio its own key so you can revoke it without touching anything else. Never commit a key to this public repository.

### 2. Cloudflare (once; start on the free plan)

1. Sign up at dash.cloudflare.com and open **Workers & Pages** once, so the account gets its `<name>.workers.dev` subdomain.
2. My Profile → API Tokens → Create Token → use the **Edit Cloudflare Workers** template → choose your account → Create, and copy the token.

### 3. GitHub (once)

In this repository: Settings → Secrets and variables → Actions → New repository secret. Add:

- `CLOUDFLARE_API_TOKEN`: the token from step 2.
- `OPENAI_API_KEY`: the key from step 1.
- `CLOUDFLARE_ACCOUNT_ID`: only needed if the deploy says the token can see more than one account. It's on the right of the Workers & Pages page.

### 4. Deploy

Actions → **Deploy Monet studio** → Run workflow, on `main`. The workflow:

1. tests the Worker in Node and in Cloudflare's runtime;
2. deploys it and stores the OpenAI key as a Worker secret;
3. writes the Worker's URL into `data-endpoint` in `monet/index.html`, commits that to `main`, and asks Pages to rebuild.

A minute later "Paint my photo" appears on /monet/. Later pushes to `main` that change `monet-studio/` redeploy by themselves. To change the OpenAI key, update the secret and run the workflow again.

Until `data-endpoint` has a URL, the page keeps the Dropbox request flow and never shows the studio. **To pause the studio**, clear `data-endpoint` in `monet/index.html` (or set `DAILY_LIMIT_TOTAL` to `0`). Automatic deploys leave a blank endpoint alone; running the workflow by hand fills it in again. The workflow also never replaces an endpoint on another domain. A custom domain instead of `*.workers.dev` also has to be added to `connect-src` in that page's Content-Security-Policy.

### Deploying from a terminal instead

```sh
cd monet-studio
npx wrangler login
npx wrangler deploy                      # prints https://monet-studio.<name>.workers.dev
npx wrangler secret put OPENAI_API_KEY   # paste the key when asked
```

Then put the printed URL in `data-endpoint` on the `<dialog id="monetStudio">` in `monet/index.html` and push.

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
| `PARTIAL_IMAGES` | `1` | Rough previews streamed while painting (0–3). Each is a full-size image the Worker relays |
| `MAX_OUTPUT_TOKENS` | `16000` | Hard cap on the reasoning model's reasoning and text per painting |
| `ALLOWED_ORIGINS` | the site's origins | Only these pages may call the Worker |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | A Cloudflare AI Gateway's OpenAI URL also works, for usage analytics. The Worker sends `cf-aig-collect-log: false` so the gateway doesn't keep visitors' photos; leave the gateway's payload logging off too |
| `VISITOR_SALT` (secret, optional) | the OpenAI key | Salt for the visitor hash |

If OpenAI renames or retires a model, the studio shows "closed" and the Worker logs OpenAI's error in Workers & Pages → monet-studio → Logs. Change the model name and redeploy.

## Endpoints

- `GET /`: `{ open, left, limit }`, how many paintings this visitor has left today.
- `POST /paint` with `{ image: "data:image/jpeg;base64,…", width, height }`: OpenAI's Responses event stream, plus an `X-Paintings-Left` header. Errors are JSON `{ error }`:
  - `limit` (429, with `scope` `visitor` or `total`)
  - `blocked` (422, with `left`)
  - `bad_request` (400)
  - `too_large` (413, also enforced while reading a chunked upload)
  - `upstream` (502)
  - `closed` (503)
  - `not_configured` (503)

## Tests

```sh
node --test tests/monet-studio-worker.test.mjs    # Worker + Durable Object, fake OpenAI
node --test tests/monet-studio-workerd.test.mjs   # the same in Cloudflare's runtime (wrangler dev)
node tests/monet-studio-browser.test.js           # the /monet/ page end to end in Chromium
```

The workerd test runs `npx wrangler@4`, or the binary in `MONET_WRANGLER`. For local testing against a deployed Worker, temporarily add `http://localhost:<port>` to `ALLOWED_ORIGINS`. Do not keep it in production.
