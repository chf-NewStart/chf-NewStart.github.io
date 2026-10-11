/* The Monet studio Worker inside Cloudflare's own runtime (workerd, through
   `wrangler dev`), with its real PaintQuota Durable Object. A local stand-in
   for OpenAI and GitHub sits behind OPENAI_BASE_URL and SKILL_BASE_URL. This
   catches what the Node tests cannot: platform APIs, streaming a multi-MB
   painting through, and Durable Object storage.

   Needs Wrangler: MONET_WRANGLER=/path/to/wrangler, or `npx wrangler@4`. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKER_PORT = +(process.env.MONET_WORKERD_PORT || 8788);
const FAKE_PORT = WORKER_PORT + 1;
const WORKER = `http://127.0.0.1:${WORKER_PORT}`;
const ORIGIN = 'https://houfu72.com';
const FINAL = 'F'.repeat(1_600_000);      // about the size of a real painting

const requests = [];
let respond;       // (body) => [status, sseText | jsonText]
let wrangler;
let fake;
let persist;

const sse = (events) => events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
const painting = () => [200, sse([
  { type: 'response.created', response: { status: 'in_progress', instructions: 'x'.repeat(100_000) } },
  { type: 'response.image_generation_call.partial_image', partial_image_index: 0, partial_image_b64: 'P'.repeat(400_000) },
  { type: 'response.output_item.done', item: { type: 'image_generation_call', status: 'completed', result: FINAL } },
  { type: 'response.completed', response: { status: 'completed', instructions: 'x'.repeat(100_000), output: [{ type: 'image_generation_call', result: FINAL }] } }
])];

function call(method, route, { origin = ORIGIN, body } = {}) {
  return fetch(`${WORKER}${route}`, {
    method,
    headers: { ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
}
const paint = () => call('POST', '/paint', { body: { image: `data:image/jpeg;base64,${'/9j/'.padEnd(4000, 'A')}`, width: 3024, height: 4032 } });
const left = async () => (await (await call('GET', '/')).json()).left;

before(async () => {
  fake = http.createServer(async (request, response) => {
    if (request.url.startsWith('/skill/')) {
      response.end(`# fake skill ${request.url.slice(7)}`);
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push({ url: request.url, auth: request.headers.authorization, body });
    const [status, text] = respond(body);
    response.writeHead(status, { 'Content-Type': status === 200 ? 'text/event-stream' : 'application/json' });
    // Dribble it out in pieces, as a real stream would arrive.
    for (let offset = 0; offset < text.length; offset += 50_000) response.write(text.slice(offset, offset + 50_000));
    response.end();
  });
  await new Promise((resolve) => fake.listen(FAKE_PORT, '127.0.0.1', resolve));

  persist = fs.mkdtempSync(path.join(os.tmpdir(), 'monet-workerd-'));
  const vars = {
    OPENAI_API_KEY: 'sk-workerd-test',
    OPENAI_BASE_URL: `http://127.0.0.1:${FAKE_PORT}/v1`,
    SKILL_BASE_URL: `http://127.0.0.1:${FAKE_PORT}/skill/`,
    ALLOWED_ORIGINS: ORIGIN,
    DAILY_LIMIT_PER_VISITOR: '4'
  };
  const [command, ...prefix] = process.env.MONET_WRANGLER ? [process.env.MONET_WRANGLER] : ['npx', '--yes', 'wrangler@4'];
  wrangler = spawn(command, [...prefix, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(WORKER_PORT),
    '--persist-to', persist, '--show-interactive-dev-session=false',
    ...Object.entries(vars).flatMap(([name, value]) => ['--var', `${name}:${value}`])], {
    cwd: path.join(ROOT, 'monet-studio'),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  wrangler.stdout.on('data', (data) => { log += data; });
  wrangler.stderr.on('data', (data) => { log += data; });
  for (let attempt = 0; attempt < 240; attempt++) {
    try {
      if ((await call('OPTIONS', '/paint')).status === 204) return;
    } catch {
      // not listening yet
    }
    if (wrangler.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`wrangler dev did not start:\n${log.slice(-4000)}`);
});

after(async () => {
  wrangler?.kill('SIGINT');
  await new Promise((resolve) => setTimeout(resolve, 500));
  wrangler?.kill('SIGKILL');
  fake?.close();
  if (persist) fs.rmSync(persist, { recursive: true, force: true });
});

test('in workerd: origins, preflight, and the starting allowance', async () => {
  assert.equal((await call('GET', '/', { origin: 'https://evil.example' })).status, 403);
  const preflight = await call('OPTIONS', '/paint');
  assert.equal(preflight.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(await left(), 4);
});

test('in workerd: a painting streams through whole and spends a turn', async () => {
  respond = painting;
  const response = await paint();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-paintings-left'), '3');
  const text = await response.text();
  assert.ok(text.includes(`"result":"${FINAL}"`), 'the full painting arrives intact');
  assert.equal(await left(), 3);

  const [sent] = requests.slice(-1);
  assert.equal(sent.url, '/v1/responses');
  assert.equal(sent.auth, 'Bearer sk-workerd-test');
  assert.ok(sent.body.instructions.includes('# fake skill SKILL.md'), 'skill fetched from SKILL_BASE_URL');
  assert.ok(sent.body.input[0].content[1].image_url.startsWith('data:image/jpeg;base64,/9j/'), 'photo spliced in');
  assert.equal(sent.body.tools[0].size, '1088x1456');   // the photo's 3:4 portrait shape
  assert.equal(sent.body.max_tool_calls, 1);
  assert.match(sent.body.safety_identifier, /^[0-9a-f]{24}$/);
  assert.equal(sent.body.store, false);
});

test('in workerd: a refusal spends the turn; a mid-stream failure is given back once', async () => {
  respond = () => [400, JSON.stringify({ error: { code: 'moderation_blocked', message: 'safety system' } })];
  const blocked = await paint();
  assert.equal(blocked.status, 422);
  assert.equal(await left(), 2);

  const failing = () => [200, sse([
    { type: 'response.created', response: { instructions: 'x'.repeat(100_000) } },
    { type: 'response.image_generation_call.partial_image', partial_image_index: 0, partial_image_b64: 'P'.repeat(400_000) },
    { type: 'response.failed', response: { instructions: 'x'.repeat(100_000), error: { code: 'server_error' } } }
  ])];
  respond = failing;
  await (await paint()).text();
  assert.equal(await left(), 2, 'first mid-stream failure refunded');
  await (await paint()).text();
  assert.equal(await left(), 1, 'second one is not');
});

test('in workerd: a delivered painting is never refunded, and the limit holds', async () => {
  respond = () => [200, sse([
    { type: 'response.image_generation_call.completed', item_id: 'ig' },
    { type: 'response.output_item.done', item: { type: 'image_generation_call', status: 'completed', result: FINAL } },
    { type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } }
  ])];
  await (await paint()).text();
  assert.equal(await left(), 0);
  const refused = await paint();
  assert.equal(refused.status, 429);
  assert.deepEqual(await refused.json(), { error: 'limit', scope: 'visitor' });
});
