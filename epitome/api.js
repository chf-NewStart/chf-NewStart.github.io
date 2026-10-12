/* Epitome.api — everything the front end asks of the backend, in one place.

   This version is fake: it answers from fixtures.js and keeps requests,
   comments and the demo sign-in in this browser's localStorage. When WP3's
   real API exists, replace the bodies of these functions with network calls
   and keep the shapes they return; the views only ever see these shapes.

   Topic:   { slug, title, state: 'cold' | 'warm' | 'mature', summary,
              requests?, revision?: { number, date }, body?, sources?,
              checks?, history?, cluster?, mine? }
   Search:  { query, matches: Topic[] }   (best match first)
   Request: { slug, title, state: 'cold', requests, mine: true, contact }
   Comment: { id, slug, revision, block, quote, kind, text, public,
              status: 'waiting', created } */
(function () {
  'use strict';

  const F = window.EpitomeFixtures;
  const LATENCY = 220;
  const KEYS = { requests: 'epitome.requests', comments: 'epitome.comments', session: 'epitome.session' };

  // Storage can be missing or throw (private windows, blocked site data);
  // fall back to memory so the demo still works for the visit.
  const memory = {};
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
      catch (e) { return key in memory ? memory[key] : fallback; }
    },
    set(key, value) {
      memory[key] = value;
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* memory only */ }
    }
  };

  const wait = (value) => new Promise((resolve) => setTimeout(() => resolve(value), LATENCY));
  const clone = (v) => JSON.parse(JSON.stringify(v));

  const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'topic';

  const STOP = new Set('the of in on and an to for how what why is are with by from does do at as its it'.split(' '));
  const words = (s) => String(s).toLowerCase().split(/[^a-z0-9+]+/).filter((w) => w.length > 1 && !STOP.has(w));

  function allTopics() {
    const requests = store.get(KEYS.requests, {});
    const topics = F.topics.map((t) => {
      const r = requests[t.slug];
      return r ? { ...clone(t), requests: (t.requests || 0) + 1, mine: true, contact: r.contact } : clone(t);
    });
    for (const slug of Object.keys(requests)) {
      if (!topics.some((t) => t.slug === slug)) {
        const r = requests[slug];
        topics.push({ slug, title: r.title, state: 'cold', requests: 1, mine: true, contact: r.contact, summary: '' });
      }
    }
    return topics;
  }

  function score(topic, queryWords) {
    const hay = [topic.title, ...(topic.aliases || [])].join(' ').toLowerCase();
    const hayWords = words(hay);
    let s = 0;
    for (const q of queryWords) {
      if (hay.includes(q) && q.length > 3) s += 2;
      else if (hayWords.some((w) => w === q || (q.length > 3 && w.startsWith(q)))) s += 2;
      else if (topic.summary && words(topic.summary).includes(q) && q.length > 4) s += 1;
    }
    return s;
  }

  const api = {
    slugify,

    async searchTopics(query) {
      const q = words(query);
      const matches = q.length ? allTopics()
        .map((t) => ({ t, s: score(t, q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || (b.t.state !== 'cold') - (a.t.state !== 'cold'))
        .map((x) => x.t) : [];
      return wait({ query: String(query), matches });
    },

    async getTopic(slug) {
      return wait(allTopics().find((t) => t.slug === slug) || null);
    },

    async listRecent() {
      const live = allTopics().filter((t) => t.state !== 'cold').sort((a, b) => b.revision.date.localeCompare(a.revision.date));
      const queued = allTopics().filter((t) => t.state === 'cold' && t.requests);
      return wait({ live, queued });
    },

    async getBackgrounds() {
      return clone(F.backgrounds);
    },

    // contact is { orcid } after sign-in or { email } without an account.
    async requestTopic(title, contact) {
      const known = allTopics().find((t) => t.title.toLowerCase() === String(title).toLowerCase());
      const slug = known ? known.slug : slugify(title);
      const requests = store.get(KEYS.requests, {});
      requests[slug] = { title: known ? known.title : String(title).trim(), contact, at: new Date().toISOString() };
      store.set(KEYS.requests, requests);
      return wait(allTopics().find((t) => t.slug === slug));
    },

    async submitComment(comment) {
      const all = store.get(KEYS.comments, []);
      const saved = { ...comment, id: 'c' + Date.now().toString(36), status: 'waiting', created: new Date().toISOString() };
      all.push(saved);
      store.set(KEYS.comments, all);
      return wait(saved);
    },

    async myComments(slug) {
      return store.get(KEYS.comments, []).filter((c) => c.slug === slug);
    },

    // Demo sign-in. The real flow is ORCID OpenID Connect: redirect to
    // https://orcid.org/oauth/authorize (scope=openid), then a server
    // exchanges the code and holds the session — see README.md.
    session() { return store.get(KEYS.session, null); },
    signInDemo() {
      const s = { orcid: '0000-0002-1825-0097', name: 'Josiah Carberry', demo: true };
      store.set(KEYS.session, s);
      return s;
    },
    signOut() { store.set(KEYS.session, null); }
  };

  window.EpitomeApi = api;
})();
