// DeepSeek proxy for the fun-fact popup on houfu72.com.
//
// Why this exists: the website is static, so calling api.deepseek.com
// straight from the browser would require shipping the API key to every
// visitor. This tiny worker keeps the key server-side and only relays
// chat requests coming from the site itself.
//
// Deploy (one-time, ~5 minutes):
//   1. https://dash.cloudflare.com → Workers & Pages → Create Worker,
//      paste this file, deploy.
//   2. Worker → Settings → Variables → add secret DEEPSEEK_API_KEY
//      with your key from https://platform.deepseek.com.
//   3. Copy the worker URL (https://<name>.<account>.workers.dev) into
//      `endpoint` in deepseek-config.js and push.

const ALLOWED_ORIGINS = new Set([
    'https://houfu72.com',
    'https://www.houfu72.com',
    'https://chf-newstart.github.io'
]);

const MAX_MESSAGES = 24;          // caps runaway threads
const MAX_CHARS = 12000;          // caps request size per call

function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin'
    };
}

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';
        if (!ALLOWED_ORIGINS.has(origin)) {
            return new Response('Forbidden', { status: 403 });
        }
        const cors = corsHeaders(origin);
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cors });
        }
        if (request.method !== 'POST') {
            return new Response('POST only', { status: 405, headers: cors });
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return new Response('Bad JSON', { status: 400, headers: cors });
        }
        const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : null;
        if (!messages || !messages.length) {
            return new Response('messages required', { status: 400, headers: cors });
        }
        const totalChars = messages.reduce((n, m) => n + String(m.content || '').length, 0);
        if (totalChars > MAX_CHARS) {
            return new Response('request too large', { status: 413, headers: cors });
        }

        const upstream = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages,
                max_tokens: 600,
                temperature: 0.3
            })
        });

        return new Response(upstream.body, {
            status: upstream.status,
            headers: { ...cors, 'Content-Type': 'application/json' }
        });
    }
};
