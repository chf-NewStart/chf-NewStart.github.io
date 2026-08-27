const CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACTIVE_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_CALLS = 96;
const DEFAULT_TOKEN_BUDGET = 500000;
const MAX_BODY_CHARS = 360000;
const MAX_OUTPUT_TOKENS = 2400;

const ALLOWED_SYSTEM_PREFIXES = [
  'Classify pre-separated reviewer concerns.',
  'You locate manuscript passages for several independent reviewer comments.'
];

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}

function base64url(bytes) {
  let value = '';
  bytes.forEach((byte) => { value += String.fromCharCode(byte); });
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sameSecret(left, right) {
  if (!left || !right) return false;
  return (await sha256(left)) === (await sha256(right));
}

function bearer(request) {
  const value = request.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : '';
}

function corsHeaders(request, env) {
  const origin = allowedOrigin(request, env);
  return origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'X-Phloem-Pass-Expires, X-Phloem-Pass-Calls-Remaining, X-Phloem-Pass-Tokens-Remaining',
    'Vary': 'Origin'
  } : {};
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(request, env)).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function validJobId(value) {
  return /^[A-Za-z0-9_-]{12,120}$/.test(String(value || ''));
}

function validateReviewMessages(messages) {
  if (!Array.isArray(messages) || messages.length !== 2) return null;
  const normalized = messages.map((message) => ({
    role: message && message.role === 'system' ? 'system' : message && message.role === 'user' ? 'user' : '',
    content: String(message && message.content || '')
  }));
  if (normalized[0].role !== 'system' || normalized[1].role !== 'user') return null;
  const chars = normalized[0].content.length + normalized[1].content.length;
  if (!chars || chars > MAX_BODY_CHARS) return null;
  if (!ALLOWED_SYSTEM_PREFIXES.some((prefix) => normalized[0].content.startsWith(prefix))) return null;
  return { messages: normalized, chars };
}

async function createPass(request, env) {
  if (!env.PASS_ADMIN_TOKEN || !await sameSecret(bearer(request), env.PASS_ADMIN_TOKEN)) {
    return json({ error: 'Approval code is not valid.' }, 401);
  }
  const now = Date.now();
  await env.DB.prepare('DELETE FROM review_passes WHERE revoked = 1 OR COALESCE(active_until, claim_before) < ?').bind(now - CLAIM_WINDOW_MS).run();
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = base64url(bytes);
  const hash = await sha256(token);
  const claimBefore = now + CLAIM_WINDOW_MS;
  await env.DB.prepare(`
    INSERT INTO review_passes
      (token_hash, created_at, claim_before, max_calls, token_budget)
    VALUES (?, ?, ?, ?, ?)
  `).bind(hash, now, claimBefore, DEFAULT_MAX_CALLS, DEFAULT_TOKEN_BUDGET).run();
  return json({ token, claimBefore, activeMinutes: 10, maxCalls: DEFAULT_MAX_CALLS, tokenBudget: DEFAULT_TOKEN_BUDGET }, 201);
}

async function readGrant(env, hash) {
  return env.DB.prepare('SELECT * FROM review_passes WHERE token_hash = ?').bind(hash).first();
}

async function claimGrant(env, hash, jobId, now) {
  await env.DB.prepare(`
    UPDATE review_passes
       SET job_id = ?, active_until = ?
     WHERE token_hash = ?
       AND job_id IS NULL
       AND revoked = 0
       AND claim_before >= ?
  `).bind(jobId, now + ACTIVE_WINDOW_MS, hash, now).run();
  return readGrant(env, hash);
}

async function reserveGrant(env, hash, jobId, reserve, now) {
  return env.DB.prepare(`
    UPDATE review_passes
       SET calls_used = calls_used + 1,
           reserved_tokens = reserved_tokens + ?
     WHERE token_hash = ?
       AND job_id = ?
       AND revoked = 0
       AND completed_at IS NULL
       AND active_until >= ?
       AND calls_used < max_calls
       AND reserved_tokens + ? <= token_budget
  `).bind(reserve, hash, jobId, now, reserve).run();
}

async function refundReservation(env, hash, reserve, actual, refundCall) {
  const tokenRefund = Math.max(0, reserve - Math.max(0, Number(actual) || 0));
  await env.DB.prepare(`
    UPDATE review_passes
       SET reserved_tokens = MAX(0, reserved_tokens - ?),
           calls_used = MAX(0, calls_used - ?)
     WHERE token_hash = ?
  `).bind(tokenRefund, refundCall ? 1 : 0, hash).run();
}

async function runReview(request, env) {
  const token = bearer(request);
  if (!token) return json({ error: 'Review pass required.' }, 401);
  const hash = await sha256(token);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const jobId = String(body.job_id || '');
  const valid = validateReviewMessages(body.messages);
  if (!validJobId(jobId) || !valid) return json({ error: 'This pass only permits Phloem review classification and passage matching.' }, 403);

  const now = Date.now();
  let grant = await readGrant(env, hash);
  if (!grant) return json({ error: 'Review pass not found.' }, 401);
  if (!grant.job_id) grant = await claimGrant(env, hash, jobId, now);
  if (!grant || grant.revoked || grant.completed_at || grant.job_id !== jobId) return json({ error: 'This review pass was already claimed.' }, 410);
  if ((grant.active_until || 0) < now) return json({ error: 'This review pass has expired.' }, 410);

  const maxTokens = Math.max(1, Math.min(MAX_OUTPUT_TOKENS, Number(body.max_tokens) || 900));
  const reserve = Math.ceil(valid.chars / 3) + maxTokens;
  const reservation = await reserveGrant(env, hash, jobId, reserve, now);
  if (!reservation.meta || reservation.meta.changes !== 1) return json({ error: 'This review pass has reached its usage limit.' }, 429);

  const deepseekBody = {
    model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    max_tokens: maxTokens,
    thinking: { type: 'disabled' },
    messages: valid.messages,
    response_format: { type: 'json_object' },
    user_id: `phloem_${hash.slice(0, 24)}`
  };

  let upstream;
  try {
    upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(deepseekBody)
    });
  } catch {
    await refundReservation(env, hash, reserve, 0, true);
    return json({ error: 'DeepSeek could not be reached.' }, 502);
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    await refundReservation(env, hash, reserve, 0, true);
    return json({ error: 'The shared DeepSeek service is temporarily unavailable.' }, 502);
  }

  let parsed;
  try { parsed = JSON.parse(text); } catch {
    await refundReservation(env, hash, reserve, 0, true);
    return json({ error: 'DeepSeek returned an unreadable response.' }, 502);
  }
  const actual = Number(parsed && parsed.usage && parsed.usage.total_tokens) || reserve;
  await refundReservation(env, hash, reserve, actual, false);
  grant = await readGrant(env, hash);
  return json(parsed, 200, {
    'X-Phloem-Pass-Expires': String(grant.active_until),
    'X-Phloem-Pass-Calls-Remaining': String(Math.max(0, grant.max_calls - grant.calls_used)),
    'X-Phloem-Pass-Tokens-Remaining': String(Math.max(0, grant.token_budget - grant.reserved_tokens))
  });
}

async function completePass(request, env) {
  const token = bearer(request);
  if (!token) return json({ error: 'Review pass required.' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const hash = await sha256(token);
  const jobId = String(body.job_id || '');
  const result = await env.DB.prepare(`
    UPDATE review_passes
       SET completed_at = ?, revoked = 1
     WHERE token_hash = ? AND job_id = ? AND revoked = 0
  `).bind(Date.now(), hash, jobId).run();
  return result.meta && result.meta.changes === 1 ? json({ completed: true }) : json({ error: 'Review pass is no longer active.' }, 410);
}

async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  if (request.headers.get('Origin') && !allowedOrigin(request, env)) return json({ error: 'Origin is not allowed.' }, 403);
  if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true });
  if (request.method === 'POST' && url.pathname === '/passes') return createPass(request, env);
  if (request.method === 'POST' && url.pathname === '/review') return runReview(request, env);
  if (request.method === 'POST' && url.pathname === '/complete') return completePass(request, env);
  return json({ error: 'Not found.' }, 404);
}

export default {
  async fetch(request, env) {
    try { return withCors(await handle(request, env), request, env); }
    catch { return withCors(json({ error: 'Review pass service failed safely.' }, 500), request, env); }
  }
};
