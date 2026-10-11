/* The Monet studio Worker: who may call it, the daily allowance, refunds when
   OpenAI refuses, the request it builds from the skill, and canvas sizing.
   Runs the real Worker and its PaintQuota Durable Object against in-memory
   storage and a fake OpenAI. */
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import support from './monet-studio-support.js';

const { WORKER, createQuota, sseResponse, paintingEvents } = support;
const worker = await import(pathToFileURL(WORKER).href);
const ORIGIN = 'https://houfu72.com';
const SKILL = 'https://skill.test/skills/monet-light-strokes/';
const IMAGE = `data:image/jpeg;base64,${Buffer.from('fake jpeg bytes').toString('base64')}`;

const realFetch = globalThis.fetch;
let calls;
let openai;     // (request body) => Response | throws
let env;

beforeEach(() => {
  calls = [];
  openai = () => sseResponse(paintingEvents(['cGFydGlhbA=='], 'ZmluYWw='));
  env = {
    ALLOWED_ORIGINS: `${ORIGIN},https://chf-newstart.github.io`,
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL: 'gpt-5.5',
    OPENAI_IMAGE_MODEL: 'gpt-image-2',
    IMAGE_QUALITY: 'medium',
    IMAGE_ACTION: 'edit',
    REASONING_EFFORT: 'low',
    DAILY_LIMIT_PER_VISITOR: '2',
    DAILY_LIMIT_TOTAL: '3',
    SKILL_BASE_URL: SKILL,
    QUOTA: createQuota(worker.PaintQuota)
  };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith(SKILL)) return new Response(`# skill file ${String(url).slice(SKILL.length)}`);
    if (String(url) === 'https://api.openai.com/v1/responses') return openai(JSON.parse(init.body), init);
    throw new Error(`unexpected fetch ${url}`);
  };
});
after(() => { globalThis.fetch = realFetch; });

function call(method, path, { origin = ORIGIN, ip = '203.0.113.7', body, headers = {} } = {}) {
  const request = new Request(`https://monet-studio.example.workers.dev${path}`, {
    method,
    headers: { ...(origin ? { Origin: origin } : {}), 'CF-Connecting-IP': ip, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  return worker.default.fetch(request, env);
}

const paint = (options = {}) => call('POST', '/paint', { body: { image: IMAGE, width: 4000, height: 3000 }, ...options });
const left = async (options) => (await (await call('GET', '/', options)).json()).left;

test('only the site may call it, and preflight gets CORS headers', async () => {
  assert.equal((await call('GET', '/', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('GET', '/', { origin: '' })).status, 403);
  const preflight = await call('OPTIONS', '/paint');
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(preflight.headers.get('Access-Control-Allow-Methods'), /POST/);
  assert.match(preflight.headers.get('Access-Control-Expose-Headers'), /X-Paintings-Left/);
  assert.equal((await call('GET', '/nope')).status, 404);
});

test('a painting relays OpenAI\'s stream and spends one of the visitor\'s turns', async () => {
  assert.equal(await left(), 2);
  const response = await paint();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /text\/event-stream/);
  assert.equal(response.headers.get('X-Paintings-Left'), '1');
  const text = await response.text();
  assert.match(text, /response\.image_generation_call\.partial_image/);
  assert.match(text, /"result":"ZmluYWw="/);
  assert.equal(await left(), 1);
});

test('the OpenAI request carries the skill, the photo, and a canvas matching the photo', async () => {
  let sent;
  let auth;
  openai = (body, init) => { sent = body; auth = init.headers.Authorization; return sseResponse([]); };
  await (await paint()).text();
  assert.equal(auth, 'Bearer sk-test');
  assert.equal(sent.model, 'gpt-5.5');
  assert.deepEqual(sent.reasoning, { effort: 'low' });
  assert.equal(sent.store, false);
  assert.equal(sent.stream, true);
  assert.deepEqual(sent.tool_choice, { type: 'image_generation' });
  assert.match(sent.instructions, /Monet Light & Strokes studio/);
  for (const file of ['SKILL.md', 'references/style-system.md', 'references/people-in-scenes.md']) {
    assert.ok(sent.instructions.includes(`<skill-file path="${file}">\n# skill file ${file}`), file);
  }
  const [message] = sent.input;
  assert.equal(message.role, 'user');
  assert.deepEqual(message.content[1], { type: 'input_image', image_url: IMAGE, detail: 'high' });
  const [tool] = sent.tools;
  assert.equal(tool.type, 'image_generation');
  assert.equal(tool.model, 'gpt-image-2');
  assert.equal(tool.action, 'edit');
  assert.equal(tool.quality, 'medium');
  assert.equal(tool.partial_images, 2);
  assert.equal(tool.output_format, 'jpeg');
  assert.equal(tool.size, '1456x1088');   // 4:3 photo, ~1.5 MP, edges in multiples of 16
});

test('the daily allowance holds per visitor and for the whole studio', async () => {
  env.DAILY_LIMIT_TOTAL = '4';
  for (let index = 0; index < 2; index++) assert.equal((await paint()).status, 200);
  const third = await paint();
  assert.equal(third.status, 429);
  assert.deepEqual(await third.json(), { error: 'limit', scope: 'visitor' });
  assert.equal(await left(), 0);

  // Addresses in one IPv6 /64 share a visitor's allowance.
  assert.equal((await paint({ ip: '2001:db8:aa:bb::1' })).status, 200);
  assert.equal((await paint({ ip: '2001:db8:aa:bb:ffff::9' })).status, 200);
  const sameNetwork = await paint({ ip: '2001:db8:aa:bb:1234::5' });
  assert.deepEqual(await sameNetwork.json(), { error: 'limit', scope: 'visitor' });

  // Four paintings in total today: a fresh visitor is turned away too.
  const other = await paint({ ip: '198.51.100.20' });
  assert.equal(other.status, 429);
  assert.deepEqual(await other.json(), { error: 'limit', scope: 'total' });
  assert.equal(await left({ ip: '198.51.100.20' }), 0);
});

test('a refusal or outage before painting gives the turn back', async () => {
  openai = () => new Response(JSON.stringify({ error: { code: 'moderation_blocked', message: 'Your request was rejected by the safety system.' } }), { status: 400 });
  const blocked = await paint();
  assert.equal(blocked.status, 422);
  assert.deepEqual(await blocked.json(), { error: 'blocked' });
  assert.equal(await left(), 2);

  openai = () => new Response('{"error":{"message":"overloaded"}}', { status: 503 });
  assert.equal((await paint()).status, 502);
  openai = () => { throw new TypeError('network down'); };
  assert.equal((await paint()).status, 502);
  assert.equal(await left(), 2);
});

test('a painting that fails mid-stream gives the turn back; a finished one does not', async () => {
  openai = () => sseResponse([
    [{ type: 'response.created', response: { instructions: 'x'.repeat(120000) } }],
    [{ type: 'response.image_generation_call.partial_image', partial_image_index: 0, partial_image_b64: 'A'.repeat(900000) }],
    [{ type: 'response.failed', response: { instructions: 'x'.repeat(120000), error: { code: 'server_error', message: 'boom' } } }]
  ]);
  await (await paint()).text();
  assert.equal(await left(), 2);

  openai = () => sseResponse([[{ type: 'error', code: 'server_error', message: 'boom' }]]);
  await (await paint()).text();
  assert.equal(await left(), 2);

  // A finished stream ends with response.completed, which repeats the image.
  openai = () => sseResponse([
    [{ type: 'response.output_item.done', item: { type: 'image_generation_call', status: 'failed' } }],
    [{ type: 'response.completed', response: { status: 'completed', output: [{ type: 'image_generation_call', result: 'B'.repeat(1200000) }], tools: [{ type: 'error' }] } }]
  ]);
  await (await paint()).text();
  assert.equal(await left(), 1);
});

test('bad input is rejected before any turn is spent', async () => {
  const bad = [
    { image: 'https://example.com/photo.jpg', width: 800, height: 600 },
    { image: 'data:image/svg+xml;base64,PHN2Zz4=', width: 800, height: 600 },
    { image: IMAGE, width: 10, height: 600 },
    { image: IMAGE, width: 'wide', height: 600 }
  ];
  for (const body of bad) assert.equal((await call('POST', '/paint', { body })).status, 400, JSON.stringify(body).slice(0, 60));
  const huge = await call('POST', '/paint', { body: { image: IMAGE, width: 800, height: 600 }, headers: { 'Content-Length': String(20 * 1024 * 1024) } });
  assert.equal(huge.status, 413);
  assert.equal(await left(), 2);
  assert.equal(calls.filter((item) => item.url.includes('openai')).length, 0);
});

test('without an OpenAI key the studio reports closed and spends nothing', async () => {
  delete env.OPENAI_API_KEY;
  assert.equal((await (await call('GET', '/')).json()).open, false);
  assert.equal((await paint()).status, 503);
  assert.equal(await left(), 2);
});

test('the first painting of a day clears earlier days', async () => {
  const { data } = env.QUOTA.storage;
  for (let index = 0; index < 300; index++) data.set(`2020-01-01:visitor${index}`, 1);
  data.set('2020-01-01:all', 300);
  await (await paint()).text();
  assert.deepEqual([...data.keys()].filter((key) => key.startsWith('2020-')), []);
  assert.equal(data.size, 2);
  // Later paintings that day leave today's counters alone.
  await (await paint({ ip: '198.51.100.30' })).text();
  assert.equal(data.size, 3);
});

test('requests go to OPENAI_BASE_URL when set, e.g. a Cloudflare AI Gateway', async () => {
  env.OPENAI_BASE_URL = 'https://gateway.ai.cloudflare.com/v1/acct/monet/openai/';
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    return String(url).startsWith(SKILL) ? new Response('# skill') : sseResponse([]);
  };
  await (await paint()).text();
  assert.ok(seen.includes('https://gateway.ai.cloudflare.com/v1/acct/monet/openai/responses'), seen.join(' '));
});

test('a visitor\'s count is a salted hash, never the address', async () => {
  await (await paint()).text();
  const keys = [...env.QUOTA.storage.data.keys()].join(' ');
  assert.doesNotMatch(keys, /203\.0\.113\.7/);
  // Without VISITOR_SALT the secret OpenAI key salts it, so rotating either changes the hash.
  const before = keys;
  env.QUOTA = createQuota(worker.PaintQuota);
  env.OPENAI_API_KEY = 'sk-other';
  await (await paint()).text();
  assert.notEqual([...env.QUOTA.storage.data.keys()].join(' '), before);
});

test('canvas sizes follow the photo within the image model\'s rules', () => {
  for (const [width, height] of [[4000, 3000], [3000, 4000], [1000, 1000], [6000, 1000], [1000, 6000], [1179, 2556]]) {
    const [outWidth, outHeight] = worker.canvasSize(width, height, { OPENAI_IMAGE_MODEL: 'gpt-image-2' }).split('x').map(Number);
    assert.equal(outWidth % 16, 0);
    assert.equal(outHeight % 16, 0);
    assert.ok(outWidth * outHeight >= 655360 && outWidth * outHeight <= 8294400, `${outWidth}x${outHeight}`);
    assert.ok(Math.max(outWidth, outHeight) / Math.min(outWidth, outHeight) <= 3.0001);
    const ratio = Math.min(3, Math.max(1 / 3, width / height));
    assert.ok(Math.abs(outWidth / outHeight - ratio) / ratio < 0.02, `${width}x${height} -> ${outWidth}x${outHeight}`);
  }
  assert.equal(worker.canvasSize(4000, 3000, { OPENAI_IMAGE_MODEL: 'gpt-image-1.5' }), '1536x1024');
  assert.equal(worker.canvasSize(3000, 4000, { OPENAI_IMAGE_MODEL: 'gpt-image-1' }), '1024x1536');
  assert.equal(worker.canvasSize(1000, 1050, { OPENAI_IMAGE_MODEL: 'gpt-image-1-mini' }), '1024x1024');
  assert.equal(worker.canvasSize(4000, 3000, { IMAGE_SIZE: 'auto' }), 'auto');
});

test('visitors are counted by IPv4 address or IPv6 /64', () => {
  assert.equal(worker.visitorAddress('203.0.113.7'), '203.0.113.7');
  assert.equal(worker.visitorAddress('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(worker.visitorAddress('2001:db8:aa:bb::1'), '2001:db8:aa:bb::/64');
  assert.equal(worker.visitorAddress('2001:0db8:00aa:00bb:1:2:3:4'), '2001:db8:aa:bb::/64');
  assert.equal(worker.visitorAddress('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(worker.visitorAddress(''), 'unknown');
});

test('if GitHub is unreachable the condensed skill still paints', async () => {
  const fresh = await import(`${pathToFileURL(WORKER).href}?offline`);
  globalThis.fetch = async () => { throw new TypeError('GitHub down'); };
  const body = await fresh.paintRequest({ SKILL_BASE_URL: SKILL }, IMAGE, 800, 600);
  assert.match(body.instructions, /Monet Light & Strokes, condensed/);
  assert.equal(body.model, 'gpt-5.5');
  assert.equal(body.tools[0].quality, 'medium');
  assert.equal(body.reasoning, undefined);
});
