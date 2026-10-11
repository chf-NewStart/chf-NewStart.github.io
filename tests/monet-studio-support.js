/* Shared fakes for the Monet studio tests: Cloudflare D1 backed by Node's
   built-in SQLite (so the Worker's real SQL runs), and OpenAI's Responses
   event stream. */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const WORKER = path.join(ROOT, 'monet-studio', 'src', 'worker.js');

function createD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'monet-studio', 'schema.sql'), 'utf8'));
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    rows: () => db.prepare(sql).all(...args),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => { db.prepare(sql).run(...args); return { success: true, results: [] }; }
  });
  return {
    sqlite: db,
    prepare: (sql) => statement(sql),
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = statements.map((item) => ({ results: item.rows() }));
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

// Each step is [event, delayMs before it]. The body arrives as real SSE text.
function sseResponse(steps) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      for (const [event, delay = 0] of steps) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
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

module.exports = { ROOT, WORKER, createD1, sseResponse, paintingEvents };
