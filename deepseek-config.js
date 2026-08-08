// Configuration for in-page "ask DeepSeek" answers in the fun-fact popup.
// While both fields below are empty, the DeepSeek button stays hidden and
// the link-out buttons (Claude / ChatGPT / Perplexity) still work.
//
// RECOMMENDED SETUP — key stays private:
//   1. Deploy cloudflare-worker/deepseek-proxy.js as a Cloudflare Worker
//      (free tier is plenty; see the comments in that file).
//   2. Store your DeepSeek key as the Worker secret DEEPSEEK_API_KEY.
//   3. Put the worker URL in `endpoint` below. Done — the key never
//      appears anywhere public.
//
// DIRECT MODE — NOT recommended: putting `apiKey` here makes it public.
// This repo and site are world-readable, so anyone can copy the key and
// spend your DeepSeek balance on anything they like. If you accept that
// (gomoku-style), use a dedicated key with a small prepaid balance and
// no auto-top-up, and expect to rotate it.
window.DEEPSEEK_CONFIG = {
    endpoint: '',            // e.g. 'https://deepseek-proxy.yourname.workers.dev'
    apiKey: '',              // direct mode only — read the warning above
    model: 'deepseek-chat'
};
