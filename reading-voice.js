/* Read aloud. Prepares a paper's text for listening (no equations, tables, captions,
   citations or reference list) and plays it sentence by sentence with a voice already on
   the device. No network and no AI: speech comes from the system's own voices. */
(function (global) {
  'use strict';

  var REFERENCES = /^(?:[\dIVX]+\.?\s*)?(?:references?(?:\s+and\s+notes)?|bibliography|literature\s+cited|works\s+cited|reference\s+list|cited\s+literature)\s*:?$/i;
  // Back matter that is not the paper's argument; skipped until the next heading.
  var BACK_MATTER = /^(?:[\dIVX]+\.?\s*)?(?:acknowledge?ments?|supporting\s+information|funding(?:\s+information)?|author\s+contributions?|conflicts?\s+of\s+interest|competing\s+interests?|data\s+availability(?:\s+statement)?|declaration\s+of\s+competing\s+interest|ethics\s+statement|publisher'?s\s+note|supplementary\s+(?:material|information|data)|abbreviations)\b/i;
  // A real appendix resumes reading; "Appendix S7. …" is a list of supplementary files.
  var RESUME_AFTER_REFERENCES = /^(?:[A-Z]\.?\s+|[\dIVX]+\.?\s*)?(?:appendix|appendices)\b(?!\s+S\d)/i;
  var OPENING = /^(?:[\dIVX]+\.?\s*)?(?:abstract|summary)\b/i;
  var ARTICLE_TYPE = /^(?:original\s+research|(?:review|research|mini[\s-]?review|perspective|opinion|methods?|brief\s+report|commentary|hypothesis\s+and\s+theory)\s+(?:article|paper))$/i;
  var FRONT_NOISE = /^(?:received|accepted|published|edited\s+by|reviewed\s+by|citation|keywords?|key\s*words|correspondence|\*\s*correspondence|open\s+access|copyright|©|specialty\s+section|this\s+article\s+is)\b/i;
  var ABBREVIATIONS = /(?:\bet al|\be\.g|\bi\.e|\bcf|\bvs|\bFigs?|\bEqs?|\bRefs?|\bNo|\bca|\bapprox|\bresp|\bDr|\bProf|\bSt|\bsp|\bspp|\bvar|\bcv|\bJan|\bFeb|\bMar|\bApr|\bAug|\bSept?|\bOct|\bNov|\bDec|\b[A-Z])\.$/;
  var MAX_CHUNK = 240;

  function clean(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }

  /* "[12]", "[3, 7–9]", "(Smith et al., 2020; Brown 2019)", "(Fig. 2B)" are skipped;
     "Smith et al. (2020) showed" keeps the names and drops the year. */
  function stripCitations(text) {
    return clean(text)
      .replace(/\s*\[(?:\s*\d{1,3}(?:\s*[–—-]\s*\d{1,3})?\s*[,;]?)+\s*\]/g, '')
      .replace(/\s*\((?:see\s+|cf\.\s+|e\.g\.,?\s+)?(?:Supplementary\s+)?(?:Figs?\.?|Figures?|Tables?|Eqs?\.?|Equations?|Appendix)\s*[A-Z]?\d[^()]{0,40}\)/gi, '')
      .replace(/\s*\(([^()]{2,220})\)/g, function (match, inner) {
        var year = /\b(?:1[89]|20)\d{2}[a-z]?\b/.test(inner), name = /\b(?:et al\.?|[A-Z][a-zà-ÿ'’-]+)/.test(inner);
        return year && name && !/\b(?:n|p|r|df)\s*[=<>]/.test(inner) ? '' : match;
      })
      .replace(/(\bet al\.?|\b[A-Z][a-zà-ÿ'’-]+)\s*\((?:1[89]|20)\d{2}[a-z]?(?:\s*[,;]\s*(?:1[89]|20)\d{2}[a-z]?)*\)/g, '$1')
      .replace(/\bhttps?:\/\/\S+|\bdoi:\s*\S+|\b10\.\d{4,9}\/\S+|\S+@\S+\.\w+/gi, '')
      .replace(/\s+([,.;:!?])/g, '$1').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
  }
  function tokens(text) { return clean(text).split(' ').filter(Boolean); }
  // Mostly numbers: a table row, an axis, a list of values.
  function tableLike(text) {
    var list = tokens(text);
    if (list.length < 5) return list.length > 1 && list.every(function (t) { return /^[-−–+±]?[\d.,%]+\S{0,3}$/.test(t); });
    var numeric = list.filter(function (t) { return /^[-−–+±(]?[\d.,%±×]+[)a-zμµ%]{0,4}$/i.test(t); }).length;
    var sentence = /[.!?]$/.test(clean(text)), distinct = {};
    list.forEach(function (t) { distinct[t.toLowerCase()] = true; });
    // A header row repeats its column names ("MAE PDE MAE PDE") or counts ("Task 3 Task 4").
    return numeric / list.length >= (sentence ? 0.45 : 0.3) || !sentence && list.length <= 12 && Object.keys(distinct).length / list.length < 0.6;
  }
  // Mostly symbols: a formula the layout pass did not box as an equation.
  function formulaLike(text) {
    var t = clean(text);
    if (!t) return false;
    if (/^\(\d{1,3}[a-z]?\)$/.test(t)) return true;
    // Wiley and Elsevier math fonts come out as ¼ ð þ when their glyphs are read as text.
    if (/[¼ðþ]/.test(t) && /[;=\d]|\b[a-z]\b/.test(t)) return true;
    var list = tokens(t), words = list.filter(function (w) { return /^[A-Za-zà-ÿ]{3,}[,.;:]?$/.test(w); }).length;
    var symbols = (t.match(/[=+−×÷∑∏∫∂√≤≥≈≠∈∇^_→←·∙⋅∼~α-ωΑ-Ω]/g) || []).length, ratio = words / Math.max(1, list.length);
    return symbols >= 2 && ratio < 0.5 && t.length < 260 || symbols >= 1 && ratio < 0.34 && t.length < 80 && !/[.!?]$/.test(t);
  }
  /* Page furniture and front matter: page numbers, links, journal and copyright lines,
     arXiv stamps, footnote markers, e-mail and funding footnotes, article-type labels. */
  function noise(text) {
    var t = clean(text);
    return !t || t.length < 3 || /^(?:page\s*)?\d+(?:\s*(?:of|\/)\s*\d+)?$/i.test(t) || /^https?:\/\//i.test(t) || FRONT_NOISE.test(t) || ARTICLE_TYPE.test(t) ||
      /^[†‡§¶*]/.test(t) || /contributed equally/i.test(t) || /^arXiv:\d{4}\.\d{4,5}/i.test(t) || /^(?:e-?mail|this work was (?:supported|funded)|we (?:thank|acknowledge))\b/i.test(t) ||
      t.length < 220 && (/\bdoi\s*:|doi\.org\/|©|\(c\)\s*\d{4}|\$\d+\.\d{2}\b/i.test(t));
  }
  // First-page author lists ("Sonia Osorio 1,2 *, Yong-Ling Ruan 3,4") and affiliations.
  function byline(text, page) {
    var t = clean(text);
    if (page > 1 || /[.!?]$/.test(t) && !/\b\d(?:,\d)*\s*\*/.test(t)) return false;
    return /\b(?:Universi|Institut|Department|Dept\.|Centre|Center|Laborator|Faculty|School of|College)/i.test(t) ||
      (t.match(/[A-Z][a-zà-ÿ'’-]+(?:[ -][A-Z][a-zà-ÿ'’-]+)*\s*\d(?:\s*,\s*\d)*\s*\*?/g) || []).length >= 2;
  }
  // Labels inside a figure ("u Height", "Velocity", "?") are short and never a sentence.
  function figureText(text) {
    var t = clean(text), list = tokens(t);
    if (/[.!?:;]$/.test(t)) return false;
    // Axis and panel labels: few words, or several one-letter variables ("u each h").
    return list.length < 5 || list.filter(function (w) { return /^[b-zB-HJ-Z]$/.test(w); }).length >= 2;
  }
  function heading(kind) { return /^h[1-6]$/.test(kind || ''); }

  /* Sentences, never broken after "et al.", "e.g.", "Fig." or an initial; long ones are
     cut at a semicolon or comma so no utterance runs past what browsers will speak. */
  function sentences(text) {
    // No look-behind: older iPadOS Safari cannot parse it.
    var out = [], parts = clean(text).replace(/([.!?…][”"')\]]?)\s+(?=[“"(\[]?[A-Z0-9])/g, '$1\u0001').split('\u0001');
    parts.forEach(function (part) {
      if (out.length && ABBREVIATIONS.test(out[out.length - 1])) out[out.length - 1] += ' ' + part;
      else out.push(part);
    });
    var chunks = [];
    out.forEach(function (sentence) {
      while (sentence.length > MAX_CHUNK) {
        var slice = sentence.slice(0, MAX_CHUNK), cut = Math.max(slice.lastIndexOf('; '), slice.lastIndexOf(', '));
        if (cut < 60) cut = slice.lastIndexOf(' ');
        if (cut < 1) cut = MAX_CHUNK;
        chunks.push(sentence.slice(0, cut + 1).trim());
        sentence = sentence.slice(cut + 1).trim();
      }
      if (sentence) chunks.push(sentence);
    });
    return chunks;
  }

  /* blocks: [{text, kind: ''|h1|h2|h3|cap|eq, page, para}] in reading order.
     Returns the spoken chunks and what was left out. */
  function prepare(blocks) {
    var chunks = [], skipped = { equations: 0, tables: 0, captions: 0, references: false, backMatter: 0, figureText: 0 };
    var mode = 'read', list = blocks || [];
    // Running headers and footers repeat on several pages ("Phloem FIELD GUIDE").
    var seenOn = {}, pages = {};
    list.forEach(function (block) {
      if (!block || !block.page) return;
      pages[block.page] = true;
      var key = clean(block.text).toLowerCase().replace(/\d+/g, '#');
      if (key.length < 90) (seenOn[key] = seenOn[key] || {})[block.page] = true;
    });
    var pageCount = Object.keys(pages).length;
    // A running head can also change per section ("Phloem THE LIBRARY", "Phloem THE READING
    // DESK"): short, mostly capitals, and starting with the same word on three or more pages.
    var heads = {};
    function headKey(text) {
      var t = clean(text), letters = t.replace(/[^A-Za-z]/g, ''), caps = t.replace(/[^A-Z]/g, '').length;
      return t.length < 40 && letters.length >= 4 && caps / letters.length >= 0.6 ? t.split(' ')[0].toLowerCase() : '';
    }
    list.forEach(function (block) { var key = block && block.page && headKey(block.text); if (key) (heads[key] = heads[key] || {})[block.page] = true; });
    function repeated(text) {
      var on = seenOn[clean(text).toLowerCase().replace(/\d+/g, '#')], head = headKey(text);
      return pageCount >= 3 && (on && Object.keys(on).length >= 2 || head && Object.keys(heads[head] || {}).length >= 3);
    }
    // Authors, affiliations and editors sit between the title and the abstract.
    var opening = list.slice(0, 80).findIndex(function (block) { return OPENING.test(clean(block && block.text)) && clean(block.text).length < 60; });
    list.forEach(function (block, at) {
      var text = clean(block && block.text), kind = block && block.kind || '';
      if (!text) return;
      if (opening > 0 && at < opening && at > 0) return;
      if (noise(text) || byline(text, block.page || 0) || repeated(text)) return;
      // A page counter inside a running head ("BREATHE / FOCUS / READ 1 / 6 …").
      if (text.length < 90 && /\b\d{1,3}\s*\/\s*\d{1,3}\b/.test(text) && text === text.toUpperCase()) return;
      // Numbered ("3.1. Background…") and all-capitals headings are headings even when the
      // layout pass saw body-sized type.
      var shaped = text.length < 90 && !/[.!?]$/.test(text) && !tableLike(text) && (/^\d+(?:\.\d+)*\.?\s+[A-Z]/.test(text) || /^[A-Z][A-Z\s\d:,&()\/-]{4,}$/.test(text));
      var isHeading = heading(kind) || shaped || (text.length < 90 && (REFERENCES.test(text) || BACK_MATTER.test(text) || RESUME_AFTER_REFERENCES.test(text)) && !/[.!?]$/.test(text));
      if (isHeading) {
        if (REFERENCES.test(text)) { mode = 'references'; skipped.references = true; return; }
        if (mode === 'references' && !RESUME_AFTER_REFERENCES.test(text)) return;
        if (BACK_MATTER.test(text)) { mode = 'back'; skipped.backMatter++; return; }
        mode = 'read';
        chunks.push({ text: text.replace(/^(?:[\dIVX]+(?:\.\d+)*\.?)\s+/, '').replace(/^[-–—•·]+\s*/, ''), kind: 'heading', page: block.page || 0, para: block.para });
        return;
      }
      if (mode !== 'read') return;
      if (kind === 'eq') { skipped.equations++; return; }
      if (kind === 'cap' || /^(?:Supplementary\s+)?(?:Figure|Fig\.|Table|Scheme)\s*[A-Z]?\d+/i.test(text)) { skipped.captions++; return; }
      if (tableLike(text)) { skipped.tables++; return; }
      if (figureText(text)) { skipped.figureText++; return; }
      if (formulaLike(text)) { skipped.equations++; return; }
      var spoken = stripCitations(text);
      if (!spoken || spoken.length < 2) return;
      sentences(spoken).forEach(function (sentence) {
        if (/[A-Za-zà-ÿ]{2,}/.test(sentence)) chunks.push({ text: sentence, kind: '', page: block.page || 0, para: block.para });
      });
    });
    return { chunks: chunks, skipped: skipped };
  }

  /* English voices, best first: Jamie, then Premium and Enhanced voices, then the rest. */
  function rankVoices(voices) {
    function score(voice) {
      var name = String(voice.name || '') + ' ' + String(voice.voiceURI || '');
      return (/jamie/i.test(name) ? 100 : 0) + (/premium/i.test(name) ? 40 : 0) + (/enhanced|neural|natural/i.test(name) ? 30 : 0) +
        (voice.localService ? 4 : 0) + (voice.default ? 3 : 0) + (/^en[-_]GB/i.test(voice.lang) ? 2 : 0) + (/^en[-_]US/i.test(voice.lang) ? 1 : 0) -
        (/compact|eloquence|novelty|bells|bubbles|cellos|whisper|zarvox|trinoids|organ|bad news|good news|jester|superstar|wobble|boing|albert|fred|junior|ralph|kathy/i.test(name) ? 60 : 0);
    }
    return (voices || []).filter(function (voice) { return /^en(?:[-_]|$)/i.test(voice.lang || ''); })
      .map(function (voice, index) { return { voice: voice, score: score(voice), index: index }; })
      .sort(function (a, b) { return b.score - a.score || a.index - b.index; })
      .map(function (entry) { return entry.voice; });
  }

  /* Whether a voice sounds natural: Apple's Premium and Enhanced voices, Microsoft's
     Natural/Online voices, Google's voices. Apple's compact voices (Samantha, Daniel…) and
     the old Windows ones are what a device has before anything is downloaded. */
  function naturalVoice(voice) {
    var name = String(voice && voice.name || '') + ' ' + String(voice && voice.voiceURI || '');
    return /premium|enhanced|neural|natural|online|google/i.test(name);
  }
  /* Where to get a natural voice on this device: steps for the Settings app, since no app can
     download system voices itself. */
  function voiceHelp(platform) {
    if (platform === 'ios') return { title: 'Get a natural voice on iPad or iPhone', steps: [
      'Open the Settings app.', 'Go to Accessibility, then Spoken Content (on newer iPadOS it can be called Read & Speak).',
      'Tap Voices, then English.', 'Tap Jamie (or Ava, Zoe or Serena), then tap Premium to download it. It is a few hundred MB, so use Wi-Fi.',
      'Come back to Phloem. Listen switches to the new voice by itself.'] };
    if (platform === 'mac') return { title: 'Get a natural voice on a Mac', steps: [
      'Open System Settings, then Accessibility, then Spoken Content.', 'Next to System voice, open the menu and choose Manage Voices.',
      'Under English, download Jamie (Premium) or another Premium voice.', 'Quit and reopen your browser, then come back to Phloem.'] };
    if (platform === 'android') return { title: 'Get a better voice on Android', steps: [
      'Open Settings, then Accessibility, then Text-to-speech output. On a Samsung Galaxy it is under General management, then Text-to-speech.',
      'Set the preferred engine to Speech Services by Google (Samsung\'s own engine also works).',
      'Tap the gear next to the engine, then Install voice data, then English (United States or United Kingdom).',
      'Pick a voice, download it, and try it with Play. Then come back to Phloem.'] };
    if (platform === 'windows') return { title: 'Get a natural voice on Windows', steps: [
      'Open Phloem in Microsoft Edge: its natural voices appear in Listen\'s voice menu.',
      'Or, in Windows 11, go to Settings, then Accessibility, then Narrator, then Add natural voices.'] };
    return { title: 'Get a natural voice', steps: ['Install a higher-quality English text-to-speech voice in your device\'s settings, then come back to Phloem.'] };
  }

  /* Plays chunks one utterance at a time. Pausing cancels and resumes from the start of
     the sentence, which every engine handles the same way. env: { synth, Utterance,
     onChunk(chunk, index), onState(state), setTimeout, clearTimeout }. */
  function createPlayer(env) {
    var chunks = [], index = 0, state = 'stopped', rate = 1, voice = null, serial = 0, timer = 0;
    var wait = env.setTimeout || setTimeout, stopWait = env.clearTimeout || clearTimeout;
    function setState(next) { state = next; if (env.onState) env.onState(next, index, chunks.length); }
    function speakCurrent() {
      var mine = ++serial, chunk = chunks[index];
      stopWait(timer);
      if (!chunk) { setState('finished'); return; }
      if (env.onChunk) env.onChunk(chunk, index, chunks.length);
      var utterance = new env.Utterance(chunk.text);
      utterance.rate = rate;
      if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
      utterance.onend = function () {
        if (mine !== serial || state !== 'playing') return;
        index++;
        if (chunk.kind === 'heading' || chunks[index] && chunks[index].kind === 'heading') timer = wait(speakCurrent, 380);
        else speakCurrent();
      };
      utterance.onerror = function (event) {
        if (mine !== serial || state !== 'playing') return;
        if (event && (event.error === 'interrupted' || event.error === 'canceled')) return;
        index++;
        timer = wait(speakCurrent, 120);
      };
      env.synth.speak(utterance);
    }
    function restart() {
      serial++;
      stopWait(timer);
      // Speaking straight after cancel() can be dropped by WebKit; a short wait is not.
      if (env.synth.speaking || env.synth.pending) { env.synth.cancel(); timer = wait(speakCurrent, 80); }
      else speakCurrent();
    }
    return {
      load: function (list, start) { serial++; stopWait(timer); env.synth.cancel(); chunks = list || []; index = Math.max(0, Math.min(start || 0, Math.max(0, chunks.length - 1))); setState('stopped'); },
      play: function () { if (!chunks.length) return; if (state === 'finished') index = 0; setState('playing'); restart(); },
      pause: function () { serial++; stopWait(timer); env.synth.cancel(); setState('paused'); if (env.onChunk && chunks[index]) env.onChunk(chunks[index], index, chunks.length); },
      toggle: function () { if (state === 'playing') this.pause(); else this.play(); },
      next: function () { if (index < chunks.length - 1) index++; if (state === 'playing') restart(); else if (env.onChunk) env.onChunk(chunks[index], index, chunks.length); },
      back: function () { if (index > 0) index--; if (state === 'playing') restart(); else if (env.onChunk) env.onChunk(chunks[index], index, chunks.length); },
      seek: function (to) { index = Math.max(0, Math.min(to, chunks.length - 1)); if (state === 'playing') restart(); else if (env.onChunk && chunks[index]) env.onChunk(chunks[index], index, chunks.length); },
      stop: function () { serial++; stopWait(timer); env.synth.cancel(); setState('stopped'); },
      setRate: function (value) { rate = value; if (state === 'playing') restart(); },
      setVoice: function (value) { voice = value || null; if (state === 'playing') restart(); },
      state: function () { return state; },
      index: function () { return index; },
      length: function () { return chunks.length; }
    };
  }

  /* Section titles for "Read from…": headings that read like titles, once each. */
  function sections(chunks) {
    var seen = {}, out = [];
    (chunks || []).forEach(function (chunk, index) {
      var t = clean(chunk.text);
      if (chunk.kind !== 'heading' || t.length < 3 || t.length > 60 || /[.,;:]$/.test(t) || !/^[A-Za-z0-9]/.test(t) || seen[t.toLowerCase()]) return;
      seen[t.toLowerCase()] = true;
      out.push({ index: index, text: t });
    });
    return out;
  }

  global.PhloemVoice = Object.freeze({
    prepare: prepare, sections: sections, naturalVoice: naturalVoice, voiceHelp: voiceHelp, sentences: sentences, stripCitations: stripCitations,
    tableLike: tableLike, formulaLike: formulaLike, rankVoices: rankVoices, createPlayer: createPlayer
  });
})(typeof window !== 'undefined' ? window : globalThis);
