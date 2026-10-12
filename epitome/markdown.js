/* A deliberately small Markdown renderer for Epitome articles.

   Articles are written by AI, so the renderer treats every article as
   untrusted: it escapes all text first and only ever emits the handful of
   tags below. Raw HTML in an article is shown as text, never run.

   Supported: ## / ### headings, paragraphs, - and 1. lists, > quotes,
   **bold**, *italic*, `code`, [text](https://link), and citations written
   [@1] or [@1,3]. Every block gets a stable id (b1, b2, ...) so comments can
   point at the passage they are about. Not yet: tables and maths — which
   flavour WP2 emits is still an open question. */
(function () {
  'use strict';

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function inline(text, opts) {
    let out = escapeHtml(text);
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>');
    out = out.replace(/\s*\[@(\d+(?:\s*,\s*\d+)*)\]/g, (_, list) => {
      const refs = list.split(',').map((n) => n.trim()).filter((n) => !opts.sourceCount || +n <= opts.sourceCount);
      if (!refs.length) return '';
      const links = refs.map((n) => '<a href="#src-' + n + '" class="cite-link" data-cite="' + n + '" aria-label="Source ' + n + '">' + n + '</a>');
      return '<sup class="cite">[' + links.join(', ') + ']</sup>';
    });
    return out;
  }

  function render(markdown, opts) {
    opts = opts || {};
    const blocks = String(markdown || '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
    let id = 0;
    const next = () => 'b' + (++id);
    const html = [];
    for (const raw of blocks) {
      const block = raw.trim();
      if (!block) continue;
      const lines = block.split('\n');
      let m;
      if ((m = /^(#{2,3})\s+(.*)$/.exec(block)) && lines.length === 1) {
        const tag = m[1].length === 2 ? 'h2' : 'h3';
        html.push('<' + tag + '>' + inline(m[2], opts) + '</' + tag + '>');
      } else if (lines.every((l) => /^[-*]\s+/.test(l))) {
        html.push('<ul>' + lines.map((l) => { const b = next(); return '<li id="' + b + '" data-block="' + b + '">' + inline(l.replace(/^[-*]\s+/, ''), opts) + '</li>'; }).join('') + '</ul>');
      } else if (lines.every((l) => /^\d+\.\s+/.test(l))) {
        html.push('<ol>' + lines.map((l) => { const b = next(); return '<li id="' + b + '" data-block="' + b + '">' + inline(l.replace(/^\d+\.\s+/, ''), opts) + '</li>'; }).join('') + '</ol>');
      } else if (lines.every((l) => /^>\s?/.test(l))) {
        const b = next();
        html.push('<blockquote id="' + b + '" data-block="' + b + '">' + inline(lines.map((l) => l.replace(/^>\s?/, '')).join(' '), opts) + '</blockquote>');
      } else {
        const b = next();
        html.push('<p id="' + b + '" data-block="' + b + '">' + inline(lines.join(' '), opts) + '</p>');
      }
    }
    return html.join('\n');
  }

  window.EpitomeMarkdown = { render, escapeHtml };
})();
