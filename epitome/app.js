/* Epitome UI prototype: routing, views, the background, sign-in and comments.
   Plain script, no build step, so the folder also works opened as a file.
   Routes: #/  #/search?q=  #/topic/<slug>[?rev=N]  #/request?q=  #/about */
(function () {
  'use strict';

  const api = window.EpitomeApi;
  const md = window.EpitomeMarkdown;
  const app = document.getElementById('app');

  // ---- Safe templating: every interpolated value is escaped unless raw().
  class Raw { constructor(s) { this.s = s; } }
  const raw = (s) => new Raw(s);
  const show = (v) => v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(show).join('') : md.escapeHtml(v);
  const html = (strings, ...vals) => raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? show(vals[i]) : ''), ''));
  const mount = (node, view) => { node.innerHTML = show(view); };

  const STATES = {
    cold: {
      label: 'Cold',
      long: 'No article yet. Nobody has asked for this topic, or not recently. Epitome doesn’t write articles on the spot: a request puts the topic in the writing queue.'
    },
    warm: {
      label: 'Warm',
      long: 'An article exists and is still improving. New papers, re-checked claims and reader comments all lead to revisions, so expect it to change.'
    },
    mature: {
      label: 'Mature',
      long: 'A settled, well-worked set of articles: the current literature is integrated, every claim traces to its sources, and the structure is stable enough to teach from.'
    }
  };

  const badge = (state) => html`<span class="badge badge-${state}">${STATES[state].label}</span>`;
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const formatDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const readTime = (text) => Math.max(1, Math.round(String(text).split(/\s+/).length / 220)) + ' min read';
  const topicHref = (slug) => '#/topic/' + encodeURIComponent(slug);
  const searchHref = (q) => '#/search?q=' + encodeURIComponent(q);
  const requestHref = (q) => '#/request?q=' + encodeURIComponent(q);

  // ---- The background: one research image behind every page.
  const backdrop = (() => {
    const root = document.createElement('div');
    root.className = 'backdrop';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '<img class="backdrop-img" alt="" decoding="async"><div class="scrim"></div>';
    document.body.prepend(root);
    const img = root.querySelector('img');
    let list = [];
    let index = -1;
    let ticket = 0;

    const sized = (src) => {
      const px = window.innerWidth * (window.devicePixelRatio || 1);
      return src + (src.includes('?') ? '&' : '?') + 'width=' + (px > 1920 ? 2560 : px > 1280 ? 1920 : 1280);
    };
    const todayIndex = () => {
      const d = new Date();
      return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) % list.length;
    };

    // Shows image i, skipping any that fail to load; resolves with the image
    // shown, or null (deep-space gradient) when none can be reached.
    function showAt(i) {
      const mine = ++ticket;
      return new Promise((resolve) => {
        let tries = 0;
        const attempt = (j) => {
          if (tries++ >= list.length) { root.classList.add('no-image'); img.classList.remove('loaded'); index = i; return resolve(null); }
          const bg = list[j];
          const probe = new Image();
          probe.onload = () => {
            if (mine !== ticket) return resolve(undefined);
            index = j;
            img.src = probe.src;
            img.style.objectPosition = bg.position || '50% 50%';
            img.classList.add('loaded');
            root.classList.remove('no-image');
            resolve(bg);
          };
          probe.onerror = () => { if (mine === ticket) attempt((j + 1) % list.length); else resolve(undefined); };
          probe.src = sized(bg.src);
        };
        attempt(i);
      });
    }

    return {
      async load() { list = await api.getBackgrounds(); },
      list: () => list,
      current: () => (index >= 0 && root.classList.contains('no-image') === false ? list[index] : null),
      today() { return showAt(todayIndex()); },
      next() { return showAt((Math.max(index, 0) + 1) % list.length); },
      forTopic(slug) {
        const i = list.findIndex((b) => b.topic === slug);
        if (i === -1) return index >= 0 ? Promise.resolve(this.current()) : this.today();
        return i === index && img.classList.contains('loaded') ? Promise.resolve(list[i]) : showAt(i);
      }
    };
  })();

  // ---- Shared chrome
  function account() {
    const s = api.session();
    if (s) {
      return html`<span class="account"><span class="orcid-id" aria-hidden="true">iD</span><span class="account-id" title="Signed in with ORCID (demo)">${s.orcid}</span><button type="button" class="linklike" data-signout>Sign out</button></span>`;
    }
    return html`<button type="button" class="signin-btn" data-signin><span class="orcid-id" aria-hidden="true">iD</span>Sign in with ORCID</button>`;
  }

  const topnav = () => html`<header class="topnav"><nav aria-label="Site"><a href="#/about">About</a>${account()}</nav></header>`;

  const bar = (query) => html`
    <header class="bar">
      <a class="wordmark" href="#/">Epitome</a>
      <form class="bar-search" role="search" data-search>
        <label class="vh" for="bar-q">Search the research literature</label>
        <input id="bar-q" name="q" type="search" value="${query || ''}" placeholder="Search the research literature…" autocomplete="off">
        <button type="submit">Search</button>
      </form>
      <nav class="bar-links" aria-label="Site"><a href="#/about">About</a>${account()}</nav>
    </header>`;

  const footer = () => html`
    <footer class="foot">
      <p>Epitome UI prototype · demo data only · articles CC BY 4.0 · code AGPL-3.0 · <a href="#/about">How it works</a></p>
    </footer>`;

  const page = (query, inner) => html`${bar(query)}<main id="main" class="page" tabindex="-1">${inner}</main>${footer()}`;

  // ---- Views
  let renderId = 0;

  async function home(id) {
    document.body.classList.add('is-home');
    mount(app, html`
      ${topnav()}
      <main id="main" class="home" tabindex="-1">
        <section class="hero">
          <h1 class="title">Epitome</h1>
          <p class="subtitle">A living knowledge platform for the research literature</p>
          <p class="definition">epitome /ɪˈpɪtəmi/ · noun · A condensed work that preserves the substance of a larger whole.</p>
          <form class="hero-search" role="search" data-search>
            <label class="vh" for="q">Search the research literature</label>
            <input id="q" name="q" type="search" placeholder="Search the research literature…" autocomplete="off">
            <button type="submit">Search</button>
          </form>
          <p class="try">Try <a href="${searchHref('crab nebula')}">crab nebula</a>, <a href="${searchHref('diatoms')}">diatoms</a>, <a href="${searchHref('pollen')}">pollen</a> or <a href="${searchHref('tomato')}">tomato</a></p>
        </section>
        <section class="today" data-today hidden aria-label="Today’s image">
          <p class="today-caption"><span class="today-label">Today:</span> <span data-today-caption></span> <a data-today-link href="#/">Read the epitome</a></p>
          <p class="credit">Image: <span data-today-credit></span> · <span data-today-license></span> · <a data-today-page href="#/" target="_blank" rel="noopener noreferrer">Source</a> · <button type="button" class="linklike" data-next-bg>Next image</button></p>
        </section>
        <section class="panel recent" aria-labelledby="recent-h">
          <h2 id="recent-h">Recently revised</h2>
          <div data-recent><p class="loading">Loading…</p></div>
        </section>
      </main>
      ${footer()}`);

    backdrop.today().then(showToday);
    const recent = await api.listRecent();
    if (id !== renderId) return;
    mount(app.querySelector('[data-recent]'), html`
      <ul class="cards">${recent.live.map(card)}</ul>
      ${recent.queued.length ? html`
        <h2 class="queue-h">Waiting to be written</h2>
        <ul class="cards compact">${recent.queued.map(card)}</ul>` : ''}`);
  }

  function showToday(bg) {
    const box = app.querySelector('[data-today]');
    if (!box || bg === undefined) return;
    if (!bg) { box.hidden = true; return; }
    box.querySelector('[data-today-caption]').textContent = bg.caption;
    box.querySelector('[data-today-link]').href = topicHref(bg.topic);
    box.querySelector('[data-today-credit]').textContent = bg.credit;
    box.querySelector('[data-today-license]').textContent = bg.license;
    box.querySelector('[data-today-page]').href = bg.page;
    box.hidden = false;
  }

  function card(t) {
    const meta = t.state === 'cold'
      ? html`${badge('cold')} · ${t.requests ? 'Requested by ' + plural(t.requests, 'person', 'people') : 'Not requested yet'}${t.mine ? ' · including you' : ''}`
      : html`${badge(t.state)} · Revised ${formatDate(t.revision.date)} · ${readTime(t.body)}`;
    return html`
      <li><a class="card" href="${topicHref(t.slug)}">
        <h3>${t.title}</h3>
        <p class="card-meta">${meta}</p>
        ${t.summary ? html`<p class="card-summary">${t.summary}</p>` : ''}
      </a></li>`;
  }

  async function search(id, query) {
    const q = query.trim();
    if (!q) { location.hash = '#/'; return; }
    mount(app, page(q, html`<div class="panel"><p class="loading">Searching…</p></div>`));
    backdrop.forTopic(null);
    const res = await api.searchTopics(q);
    if (id !== renderId) return;
    mount(app.querySelector('#main'), html`
      <div class="panel">
        <h1 class="page-title" tabindex="-1">Results for “${q}”</h1>
        ${res.matches.length
          ? html`<ul class="cards">${res.matches.map(card)}</ul>`
          : html`<p class="lead">No topic matches “${q}” yet.</p>`}
        <div class="request-box">
          <h2>${res.matches.length ? 'Not what you were looking for?' : 'Ask for it'}</h2>
          <p>Epitome doesn’t write articles on the spot. Requesting “${q}” adds it to the writing queue, and you’ll be told when its first article is ready.</p>
          <a class="btn" href="${requestHref(q)}">Request “${q}” as a new topic</a>
        </div>
      </div>`);
    focusTitle();
  }

  async function topic(id, slug, params) {
    mount(app, page('', html`<div class="panel"><p class="loading">Loading…</p></div>`));
    const t = await api.getTopic(slug);
    if (id !== renderId) return;
    if (!t) return notFound(slug);
    if (t.state === 'cold') return cold(id, t);
    return article(id, t, params);
  }

  async function requestView(id, query) {
    const q = query.trim();
    if (!q) { location.hash = '#/'; return; }
    const existing = await api.getTopic(api.slugify(q));
    if (id !== renderId) return;
    if (existing) { location.replace(topicHref(existing.slug)); return; }
    cold(id, { slug: api.slugify(q), title: q, state: 'cold', requests: 0, summary: '' });
  }

  async function cold(id, t) {
    backdrop.forTopic(null);
    const s = api.session();
    const contact = t.contact && (t.contact.email ? html`by email at <strong>${t.contact.email}</strong>` : html`through your ORCID account (<strong>${t.contact.orcid}</strong>)`);
    mount(app, page('', html`
      <div class="panel cold">
        <p class="state-line">${badge('cold')} <span class="muted">${t.requests ? 'Requested by ' + plural(t.requests, 'person', 'people') : 'Not requested yet'}</span></p>
        <h1 class="page-title" tabindex="-1">${t.title}</h1>
        ${t.summary ? html`<p class="lead">${t.summary}</p>` : ''}
        <p>There’s no article on this topic yet. Epitome doesn’t write one on the spot, because that would mean showing you an answer nobody has checked. A request adds the topic to the writing queue; topics more people ask for are written first.</p>
        ${t.mine
          ? html`<div class="request-box done" role="status">
              <h2>You’ve requested this topic</h2>
              <p>We’ll let you know ${contact} when its first article is ready. There’s no time estimate yet: articles are written as computing time frees up.</p>
            </div>`
          : html`<div class="request-box">
              <h2>Request this topic</h2>
              <button type="button" class="btn primary" data-request data-title="${t.title}">${s ? 'Request this topic' : 'Sign in with ORCID to request it'}</button>
              <form class="email-request" data-email-request data-title="${t.title}">
                <label for="email">Or get an email when it’s ready, no account needed</label>
                <div class="row">
                  <input id="email" name="email" type="email" autocomplete="email" placeholder="you@university.edu" required>
                  <button type="submit">Notify me</button>
                </div>
              </form>
            </div>`}
        <div data-related></div>
      </div>`));
    focusTitle();
    const res = await api.searchTopics(t.title);
    if (id !== renderId) return;
    const related = res.matches.filter((m) => m.slug !== t.slug && m.state !== 'cold').slice(0, 3);
    if (related.length) {
      mount(app.querySelector('[data-related]'), html`<h2 class="related-h">Related topics you can read now</h2><ul class="cards compact">${related.map(card)}</ul>`);
    }
  }

  async function article(id, t, params) {
    backdrop.forTopic(t.slug);
    const rev = params.get('rev');
    const body = md.render(t.body, { sourceCount: t.sources.length });
    const check = (status, text) => html`<li class="check check-${status}"><span class="check-mark" aria-hidden="true">${status === 'pass' ? '✓' : '…'}</span> ${text}${status === 'pass' ? '' : html` <span class="muted">(still running)</span>`}</li>`;
    mount(app, page('', html`
      <article class="panel article" data-slug="${t.slug}">
        <p class="demo-note" role="note"><strong>Demo content.</strong> This article was written by hand for the UI prototype, not by Epitome’s AI, and its sources are a sample. Please don’t cite it.</p>
        ${rev && +rev !== t.revision.number ? html`<p class="notice" role="note">You followed a link to revision ${rev}. The demo only has the current revision (${t.revision.number}), so that’s what’s shown. On the real site this link always shows exactly the text it pointed to.</p>` : ''}
        <header class="article-head">
          <p class="state-line">${badge(t.state)} <button type="button" class="linklike" data-explain aria-expanded="false" aria-controls="state-explain">What does “${STATES[t.state].label}” mean?</button></p>
          <div id="state-explain" class="explain" hidden><p>${STATES[t.state].long}</p><p><a href="#/about">How Epitome works</a></p></div>
          <h1 class="page-title" tabindex="-1">${t.title}</h1>
          <p class="lead">${t.summary}</p>
          <p class="meta">Written by AI from ${plural(t.sources.length, 'source', 'sources')} · revision ${t.revision.number}, ${formatDate(t.revision.date)} · ${readTime(t.body)} · <a href="${topicHref(t.slug)}?rev=${t.revision.number}">Link to this revision</a></p>
        </header>
        <div class="prose" id="article-body" data-revision="${t.revision.number}">${raw(body)}</div>
        <div data-cluster></div>
        <section class="sources" aria-labelledby="src-h">
          <h2 id="src-h">Sources</h2>
          <ol>${t.sources.map((s, i) => html`<li id="src-${i + 1}" tabindex="-1">${s.authors} (${s.year}). <span class="src-title">${s.title}</span>. ${s.venue}.${s.oa ? html` <span class="oa">Open access</span>` : ''}</li>`)}</ol>
        </section>
        <section class="checks" aria-labelledby="chk-h">
          <h2 id="chk-h">Checks</h2>
          <ul>
            ${check(t.checks.citations, 'Every citation points to a real source that supports the claim')}
            ${check(t.checks.drift, 'Nothing has drifted from the sources since the last revision')}
          </ul>
          <p class="muted small">Run automatically on every revision; last run ${formatDate(t.checks.lastRun)}.</p>
        </section>
        <details class="history">
          <summary>Revision history (${t.revision.number} revisions)</summary>
          <ol>${t.history.map((h) => html`<li><a href="${topicHref(t.slug)}?rev=${h.number}">Revision ${h.number}</a> · ${formatDate(h.date)} · ${h.note}</li>`)}</ol>
        </details>
        <section class="feedback" aria-labelledby="fb-h">
          <h2 id="fb-h">Spotted a problem?</h2>
          <p>Select the passage and choose <strong>Comment</strong>. Comments are private. An AI reviewer checks each one against the literature before anything changes, and anything it can’t judge goes to a person.</p>
          <div data-my-comments></div>
        </section>
      </article>`));
    focusTitle();
    renderMyComments(t.slug);
    if (t.cluster) {
      const members = (await Promise.all(t.cluster.map(api.getTopic))).filter(Boolean);
      if (id !== renderId) return;
      mount(app.querySelector('[data-cluster]'), html`
        <section class="cluster" aria-labelledby="cl-h">
          <h2 id="cl-h">In this set</h2>
          <ul>${members.map((m) => html`<li>${m.slug === t.slug ? html`<span aria-current="page">${m.title}</span> <span class="muted">(this article)</span>` : html`<a href="${topicHref(m.slug)}">${m.title}</a>`} ${badge(m.state)}</li>`)}</ul>
        </section>`);
    }
  }

  async function renderMyComments(slug) {
    const box = app.querySelector('[data-my-comments]');
    if (!box) return;
    const mine = await api.myComments(slug);
    if (!mine.length) { box.innerHTML = ''; return; }
    const kinds = { citation: 'Citation problem', unclear: 'Unclear', missing: 'Something missing', other: 'Other' };
    mount(box, html`
      <h3>Your comments</h3>
      <ul class="my-comments">${mine.map((c) => html`
        <li>
          <blockquote>${c.quote}</blockquote>
          <p><strong>${kinds[c.kind] || 'Comment'}:</strong> ${c.text}</p>
          <p class="status"><span class="pill">Private</span> <span class="pill pill-wait">Waiting for review</span>${c.public ? html` <span class="muted small">You chose to make it public after review.</span>` : ''}</p>
        </li>`)}</ul>
      <p class="muted small">What happens next: the AI reviewer checks the comment. If it holds up, it’s used in the next revision; if it doesn’t, it isn’t; if the reviewer can’t tell, a person decides. (In this demo nothing reviews it yet.)</p>`);
  }

  function about() {
    backdrop.forTopic(null);
    mount(app, page('', html`
      <div class="panel prose-page">
        <h1 class="page-title" tabindex="-1">How Epitome works</h1>
        <p class="lead">Epitome is a research wiki written and kept up to date by AI, using only peer-reviewed, open-access literature, so every claim can be checked against a source anyone can read.</p>
        <h2>Every topic is in one of three states</h2>
        <dl class="states">
          ${['cold', 'warm', 'mature'].map((s) => html`<div><dt>${badge(s)}</dt><dd>${STATES[s].long}</dd></div>`)}
        </dl>
        <p>The more people ask about a topic, the more work goes into it, so the hundredth reader finds a better article than the first.</p>
        <h2>Readers keep it honest</h2>
        <p>Anyone signed in can comment on a specific passage: a wrong citation, an unclear sentence, something missing. Comments are private. An AI reviewer treats each one as a claim to check against the literature, not an instruction to follow. Anything it can’t judge goes to a person.</p>
        <h2>About this prototype</h2>
        <p>This is the front end only. The articles are hand-written samples, sign-in uses ORCID’s public example iD instead of a real ORCID account, and requests and comments are saved only in this browser.</p>
        <p class="muted small">Background images are public-domain research imagery, each credited on the home page with a link to its source.</p>
      </div>`));
    focusTitle();
  }

  function notFound(slug) {
    mount(app, page('', html`
      <div class="panel">
        <h1 class="page-title" tabindex="-1">No topic called “${slug}”</h1>
        <p><a href="#/">Back to search</a></p>
      </div>`));
    focusTitle();
  }

  function focusTitle() {
    const h = app.querySelector('.page-title');
    if (h) h.focus({ preventScroll: true });
  }

  // ---- Router
  function route() {
    const id = ++renderId;
    hideCommentButton();
    const hash = location.hash.replace(/^#\/?/, '');
    const [path, qs] = hash.split('?');
    const params = new URLSearchParams(qs || '');
    const [name, arg] = path.split('/').filter(Boolean);
    document.body.classList.remove('is-home');
    window.scrollTo(0, 0);
    if (!name) return home(id);
    if (name === 'search') return search(id, params.get('q') || '');
    if (name === 'topic' && arg) return topic(id, decodeURIComponent(arg), params);
    if (name === 'request') return requestView(id, params.get('q') || '');
    if (name === 'about') return about();
    return notFound(decodeURIComponent(path));
  }

  // ---- Sign-in (demo). Resolves true when the visitor is signed in.
  const signinDialog = document.getElementById('signin-dialog');
  function signIn() {
    if (api.session()) return Promise.resolve(true);
    return new Promise((resolve) => {
      signinDialog.returnValue = '';
      signinDialog.addEventListener('close', () => {
        if (signinDialog.returnValue === 'ok') { api.signInDemo(); refreshAccount(); resolve(true); }
        else resolve(false);
      }, { once: true });
      signinDialog.showModal();
    });
  }
  function refreshAccount() {
    for (const nav of app.querySelectorAll('.topnav nav, .bar-links')) {
      const old = nav.querySelector('.account, .signin-btn');
      if (old) old.outerHTML = show(account());
    }
    const req = app.querySelector('[data-request]');
    if (req) req.textContent = api.session() ? 'Request this topic' : 'Sign in with ORCID to request it';
  }

  // ---- Comments on a passage
  const floatBtn = document.createElement('button');
  floatBtn.type = 'button';
  floatBtn.className = 'comment-float';
  floatBtn.textContent = 'Comment';
  floatBtn.hidden = true;
  document.body.append(floatBtn);
  let pending = null;

  function hideCommentButton() { floatBtn.hidden = true; pending = null; }

  function blockOf(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    const block = el && el.closest('[data-block]');
    return block && block.closest('#article-body') ? block : null;
  }

  function updateCommentButton() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return hideCommentButton();
    const range = sel.getRangeAt(0);
    const block = blockOf(range.startContainer);
    const text = sel.toString().replace(/\s+/g, ' ').trim();
    if (!block || block !== blockOf(range.endContainer) || text.length < 3) return hideCommentButton();
    const rect = range.getBoundingClientRect();
    pending = { block: block.dataset.block, quote: text.slice(0, 600) };
    floatBtn.hidden = false;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - floatBtn.offsetWidth / 2), document.documentElement.clientWidth - floatBtn.offsetWidth - 8);
    floatBtn.style.left = (left + window.scrollX) + 'px';
    floatBtn.style.top = (rect.bottom + window.scrollY + 10) + 'px';
  }

  let selTimer = 0;
  document.addEventListener('selectionchange', () => { clearTimeout(selTimer); selTimer = setTimeout(updateCommentButton, 120); });
  // Tapping the button can clear the selection before the click lands, so
  // remember the passage as soon as the press starts.
  let armed = null;
  floatBtn.addEventListener('pointerdown', () => { armed = pending; });
  floatBtn.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection
  floatBtn.addEventListener('click', async () => {
    const target = armed || pending;
    armed = null;
    const articleEl = app.querySelector('.article');
    if (!target || !articleEl) return;
    hideCommentButton();
    if (!(await signIn())) return;
    openCommentDialog(articleEl.dataset.slug, +app.querySelector('#article-body').dataset.revision, target);
  });

  const commentDialog = document.getElementById('comment-dialog');
  function openCommentDialog(slug, revision, target) {
    const form = commentDialog.querySelector('form');
    form.reset();
    commentDialog.querySelector('[data-cd-quote]').textContent = target.quote;
    commentDialog.querySelector('[data-cd-who]').textContent = api.session().orcid;
    commentDialog.returnValue = '';
    commentDialog.addEventListener('close', async () => {
      if (commentDialog.returnValue !== 'send') return;
      const data = new FormData(form);
      await api.submitComment({ slug, revision, block: target.block, quote: target.quote, kind: data.get('kind'), text: String(data.get('text')).trim(), public: data.get('public') === 'on' });
      window.getSelection().removeAllRanges();
      renderMyComments(slug);
      toast('Comment sent privately for review.');
    }, { once: true });
    commentDialog.showModal();
  }

  // ---- Small things
  const toastEl = document.getElementById('toast');
  let toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.classList.remove('show'); }, 4000);
  }

  document.addEventListener('submit', async (e) => {
    const form = e.target;
    if (form.matches('[data-search]')) {
      e.preventDefault();
      const q = form.elements.q.value.trim();
      if (q) location.hash = searchHref(q); else form.elements.q.focus();
    } else if (form.matches('[data-email-request]')) {
      e.preventDefault();
      const email = form.elements.email.value.trim();
      const t = await api.requestTopic(form.dataset.title, { email });
      if (location.hash.startsWith('#/request')) location.replace(topicHref(t.slug)); else route();
      toast('Requested. We’ll email you when it’s ready.');
    }
  });

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('button, a');
    if (!el) return;
    if (el.matches('[data-signin]')) { signIn(); }
    else if (el.matches('[data-signout]')) { api.signOut(); refreshAccount(); toast('Signed out.'); }
    else if (el.matches('[data-next-bg]')) { backdrop.next().then(showToday); }
    else if (el.matches('[data-explain]')) {
      const box = document.getElementById(el.getAttribute('aria-controls'));
      box.hidden = !box.hidden;
      el.setAttribute('aria-expanded', String(!box.hidden));
    } else if (el.matches('[data-request]')) {
      if (!(await signIn())) return;
      const t = await api.requestTopic(el.dataset.title, { orcid: api.session().orcid });
      if (location.hash.startsWith('#/request')) location.replace(topicHref(t.slug)); else route();
      toast('Requested. We’ll let you know when it’s ready.');
    } else if (el.matches('.cite-link')) {
      const target = document.getElementById('src-' + el.dataset.cite);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        target.focus({ preventScroll: true });
        target.classList.remove('flash');
        void target.offsetWidth;
        target.classList.add('flash');
      }
    }
  });

  window.addEventListener('hashchange', route);
  backdrop.load().then(route);
})();
