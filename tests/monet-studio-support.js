/* Shared fakes for the Monet studio tests: the Worker's PaintQuota Durable
   Object over an in-memory copy of Durable Object storage, and OpenAI's
   Responses event stream. tests/monet-studio-workerd.test.mjs runs the same
   Worker in Cloudflare's real runtime instead. */
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WORKER = path.join(ROOT, 'monet-studio', 'src', 'worker.js');

// The subset of DurableObjectStorage the Worker uses: get/put/delete with
// one key or many (put(key, value) or put({ entries })), and list({ end })
// in key order.
function memoryStorage() {
  const data = new Map();
  return {
    data,
    async get(keys) {
      if (!Array.isArray(keys)) return data.get(keys);
      return new Map(keys.filter((key) => data.has(key)).map((key) => [key, data.get(key)]));
    },
    async put(keyOrEntries, value) {
      const entries = typeof keyOrEntries === 'string' ? [[keyOrEntries, value]] : Object.entries(keyOrEntries);
      for (const [key, item] of entries) data.set(key, item);
    },
    async delete(keys) {
      if (Array.isArray(keys) && keys.length > 128) throw new Error('delete takes at most 128 keys');
      for (const key of [].concat(keys)) data.delete(key);
    },
    async list({ end } = {}) {
      return new Map([...data.keys()].sort().filter((key) => end === undefined || key < end).map((key) => [key, data.get(key)]));
    }
  };
}

// env.QUOTA: a namespace whose one object is the Worker's own PaintQuota.
function createQuota(PaintQuota) {
  const storage = memoryStorage();
  const object = new PaintQuota({ storage });
  return {
    storage,
    idFromName: (name) => `id:${name}`,
    get: () => ({ fetch: (url, init) => object.fetch(new Request(url, init)) })
  };
}

// Each step is [event, delayMs before it]; { drop: true } kills the connection.
// The body arrives as real SSE text.
function sseResponse(steps) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      for (const [event, delay = 0] of steps) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        if (event.drop) {      // the connection dies here
          controller.error(new Error('connection dropped'));
          return;
        }
        const text = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
        // Split large events across chunks like a real network would.
        for (let offset = 0; offset < text.length; offset += 65536) {
          controller.enqueue(encoder.encode(text.slice(offset, offset + 65536)));
        }
      }
      controller.close();
    }
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function paintingEvents(partials, finalBase64, delay = 0) {
  return [
    [{ type: 'response.created', response: { id: 'resp_test', status: 'in_progress' } }],
    [{ type: 'response.output_item.added', output_index: 0, item: { type: 'image_generation_call', id: 'ig_test', status: 'in_progress' } }, delay],
    [{ type: 'response.image_generation_call.generating', item_id: 'ig_test' }, delay],
    ...partials.map((b64, index) => [{ type: 'response.image_generation_call.partial_image', item_id: 'ig_test', partial_image_index: index, partial_image_b64: b64 }, delay]),
    [{ type: 'response.output_item.done', output_index: 0, item: { type: 'image_generation_call', id: 'ig_test', status: 'completed', result: finalBase64, revised_prompt: 'Preserve the duck…' } }, delay],
    [{ type: 'response.completed', response: { id: 'resp_test', status: 'completed', output: [] } }]
  ];
}

module.exports = { ROOT, WORKER, createQuota, sseResponse, paintingEvents };
