# Epitome — UI prototype (WP4)

The front end for the Epitome pilot, built before the real backend exists.
Plain HTML, CSS and JavaScript: no framework, no build step, no server needed.

## Run it

Open `index.html` in a browser (double-clicking works), or serve the folder:

```sh
python3 -m http.server 8000   # then open http://localhost:8000/
```

The background images load from Wikimedia Commons, so they need an internet
connection. Without one, the page falls back to a dark gradient and still works.

## What's in it

| Page | What it shows |
|---|---|
| Home `#/` | Full-screen research image (one per day, **Next image** to browse), the definition line, search, today's caption and credit, recently revised articles and the topics waiting to be written. |
| Search `#/search?q=` | Matching topics with their state, plus an explicit **Request "…" as a new topic** button. Searching never creates a topic on its own. |
| Article `#/topic/<slug>` | State badge with an explanation, AI-written note, revision number and a link to that revision, citations that jump to the sources, automatic checks, revision history, the other articles in a Mature set, and comments. |
| Cold topic | No article and no made-up answer. Request it with ORCID sign-in or by email; shows how many people asked, and no fake time estimate. |
| About `#/about` | The three states and the comment loop in plain words. |

**Comments:** select text inside one paragraph of an article, then press
**Comment**. You have to sign in first. Comments are private and show as
"waiting for review", because nothing reviews them in the demo.

## Files

- `index.html` — the page shell and the two dialogs (sign-in, comment).
- `app.js` — routing, views, the background, sign-in and comments.
- `api.js` — **the contract with WP3.** Every request for data goes through
  here. It's fake now (fixtures plus `localStorage`). To connect the real
  backend, replace the bodies of these functions and keep the shapes they
  return, which are listed at the top of the file.
- `fixtures.js` — demo topics, articles and background images.
- `markdown.js` — a small renderer that escapes everything, so AI-written text
  can never inject HTML. It has no tables or maths yet; which Markdown flavour
  WP2 will emit is still an open question.
- `epitome.css` — the one dark theme, modelled on countercurrent.ca.

The browser test is `tests/epitome-browser.test.js`. Run it from the repo
root with `node tests/epitome-browser.test.js`.

## What's fake, and what replaces it

- **Articles and sources** are hand-written samples, labelled as such on every
  article. Don't cite them. Real ones come from WP2 (writing) and WP3 (store).
- **Sign-in** uses ORCID's public example iD (0000-0002-1825-0097). The real
  flow is ORCID OpenID Connect: register a client in ORCID's free sandbox,
  redirect to `https://orcid.org/oauth/authorize?response_type=code&scope=openid&client_id=…&redirect_uri=…`,
  and have a **server** exchange the code and hold the session. The client
  secret can't live in the browser. Which service hosts that is still open.
- **Requests and comments** are saved only in this browser.
- **Checks** (citations, drift) are fixed values. Real ones come from WP5.
- **Background credits** were written from memory, because Wikimedia was
  unreachable while this was built. Check each one against its Commons page.

## Open questions this prototype makes concrete

1. What is a "topic", and how does a search map to one? Right now it's simple
   keyword matching on titles and aliases.
2. Which states does the API return? The prototype uses cold (with or without
   requests), warm, mature, plus a revision count.
3. Does requesting a topic need ORCID, or is an email enough?
4. Do comment anchors survive a revision? Blocks have ids (`b1`, `b2`, …) and
   each comment stores the revision number, but the real store needs anchors
   that stay stable across revisions.
5. Who owns the comment UI, WP4 or WP6?
