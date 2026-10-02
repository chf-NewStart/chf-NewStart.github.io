/* The Clips panel owns presentation only. The reader supplies document-scoped data and actions. */
(function () {
  'use strict';

  function sourceLabel(anchor) {
    if (!anchor || typeof anchor !== 'object') return 'Note';
    const page = anchor.page ?? anchor.pageNumber;
    if (Number.isFinite(Number(page)) && Number(page) > 0) return `Page ${Number(page)}`;
    const para = anchor.para ?? anchor.paragraphIndex ?? anchor.paragraph;
    if (Number.isFinite(Number(para)) && Number(para) >= 0) return `Paragraph ${Number(para) + (anchor.para != null || anchor.paragraphIndex != null ? 1 : 0)}`;
    return 'Reading note';
  }

  function create(adapter) {
    const list = document.getElementById('excerptList');
    const count = document.getElementById('excerptCount');
    const status = document.getElementById('excerptStatus');
    const newButton = document.getElementById('newExcerptNote');
    const returnButton = document.getElementById('excerptReturn');
    if (!list || !count || !status || !newButton || !returnButton) throw new Error('Clips panel is missing');
    let scope = null;
    let cards = new Map();
    const orphans = new Set();
    const drafts = new Map();
    let draftSequence = 0;
    let adding = false;
    let reordering = false;

    function context() { return adapter.context() || {}; }
    function sameScope(current) { return scope && current.id === scope.id && current.epoch === scope.epoch; }
    function stillInScope(start) { const current = context(); return sameScope(start) && current.id === start.id && current.epoch === start.epoch; }
    function liveItem(state) {
      const current = context();
      if (state.orphan || current.unavailable || !sameScope(current) || cards.get(state.id) !== state) return null;
      return (Array.isArray(current.items) ? current.items : []).find(item => item && String(item.id) === state.id) || null;
    }
    function setStatus(message) { status.textContent = message || ''; }
    function cardStatus(state, message) { state.status.textContent = message || ''; }
    function draftKey(state) { if (!state.draftKey) state.draftKey = `${state.ownerId}\u0000${state.id}\u0000${++draftSequence}`; return state.draftKey; }
    function markOrphan(state, message) {
      state.orphan = true;
      state.input.readOnly = true;
      state.card.classList.add('excerpt-orphan');
      state.source.disabled = true;
      state.source.hidden = true;
      state.remove.textContent = 'Dismiss draft';
      cardStatus(state, message || 'This clip changed elsewhere. Copy your draft before dismissing it.');
      orphans.add(state);
      drafts.set(draftKey(state), state);
      if (cards.get(state.id) === state) cards.delete(state.id);
    }
    function timestamp(value) {
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
      const text = String(value || '');
      if (/^\d+$/.test(text)) return Number(text);
      return Date.parse(text) || 0;
    }

    function makeCard(item) {
      const id = String(item.id);
      const card = document.createElement('article');
      card.className = 'excerpt-card';
      card.dataset.excerptId = id;
      const meta = document.createElement('div');
      meta.className = 'excerpt-card-meta';
      const quote = document.createElement('blockquote');
      quote.className = 'excerpt-quote';
      const label = document.createElement('label');
      label.className = 'excerpt-note-label';
      label.textContent = 'Your note';
      const input = document.createElement('textarea');
      input.className = 'excerpt-note';
      input.maxLength = 20000;
      input.placeholder = 'Write what this means to you…';
      input.setAttribute('aria-label', 'Your note for this clip');
      label.appendChild(input);
      const saveStatus = document.createElement('p');
      saveStatus.className = 'excerpt-card-status';
      saveStatus.setAttribute('role', 'status');
      saveStatus.setAttribute('aria-live', 'polite');
      const actions = document.createElement('div');
      actions.className = 'excerpt-card-actions';
      const source = document.createElement('button');
      source.className = 'soft-button excerpt-source';
      source.type = 'button';
      source.textContent = 'Go to source';
      const remove = document.createElement('button');
      remove.className = 'text-button excerpt-remove';
      remove.type = 'button';
      remove.textContent = 'Remove';
      actions.append(source, remove);
      card.append(meta, quote, label, saveStatus, actions);
      const state = { id, ownerId: String(scope.id), card, meta, quote, input, status: saveStatus, source, remove, note: String(item.note || ''), version: item.updatedAt, dirty: false, saveFailed: false, pending: false, orphan: false };
      input.value = state.note;

      input.addEventListener('input', () => {
        const currentItem = liveItem(state);
        if (!currentItem) { markOrphan(state, 'This clip is no longer available. Copy your draft before dismissing it.'); return; }
        state.dirty = true;
        if (state.pending || currentItem.updatedAt !== state.version) {
          markOrphan(state, 'This note changed elsewhere. Copy your draft before dismissing it.');
          return;
        }
        try {
          if (adapter.updateNote(state.id, input.value, state.version) !== true) {
            state.saveFailed = true;
            // Persistence can fail after the reader kept the edit in memory.
            // Retain the draft, but use that version for a later save retry.
            const memory = liveItem(state);
            if (memory && memory.note === input.value) { state.note = input.value; state.version = memory.updatedAt; }
            cardStatus(state, 'Could not save. Your draft is still here.');
            return;
          }
          const saved = liveItem(state);
          state.note = input.value;
          state.version = saved ? saved.updatedAt : currentItem.updatedAt;
          state.dirty = false;
          state.saveFailed = false;
          state.pending = false;
          cardStatus(state, 'Saved');
        } catch (error) {
          state.saveFailed = true;
          cardStatus(state, 'Could not save. Your draft is still here.');
        }
      });
      input.addEventListener('blur', () => {
        if (reordering || state.orphan) return;
        const currentItem = liveItem(state);
        if (!currentItem) return;
        if (state.pending && state.dirty) {
          markOrphan(state, 'This note changed elsewhere. Copy your draft before dismissing it.');
          return;
        }
        if (state.pending) {
          state.note = String(currentItem.note || '');
          state.version = currentItem.updatedAt;
          input.value = state.note;
          state.pending = false;
        }
      });
      source.addEventListener('click', async () => {
        if (!liveItem(state)) return;
        const startScope = { ...scope };
        const before = status.textContent;
        source.disabled = true;
        try {
          if (await adapter.goToSource(state.id) === false && stillInScope(startScope) && liveItem(state) && status.textContent === before && !before) setStatus('Could not open this source.');
        } catch (error) {
          if (stillInScope(startScope) && liveItem(state) && status.textContent === before && !before) setStatus('Could not open this source.');
        } finally { source.disabled = !liveItem(state) || !!context().busy; }
      });
      remove.addEventListener('click', () => {
        if (state.orphan) { if (!window.confirm('Discard this unsaved draft? Copy any text you want to keep first.')) return; orphans.delete(state); drafts.delete(draftKey(state)); state.card.remove(); render(); return; }
        if (!liveItem(state) || !window.confirm('Remove this clip and its note?')) return;
        if (!liveItem(state)) return;
        try {
          if (adapter.remove(state.id) !== true) { cardStatus(state, 'Could not remove this clip.'); return; }
          render();
          setStatus('Clip removed.');
        } catch (error) { cardStatus(state, 'Could not remove this clip.'); }
      });
      return state;
    }

    function render() {
      const current = context();
      if (!sameScope(current)) {
        for (const state of cards.values()) {
          if (state.dirty || state.saveFailed) markOrphan(state, 'Unsaved draft · copy before reloading.');
          else state.card.remove();
        }
        scope = { id: current.id, epoch: current.epoch };
        cards = new Map();
        orphans.clear();
        for (const state of drafts.values()) {
          if (state.ownerId === String(current.id)) orphans.add(state);
          else state.card.remove();
        }
        setStatus('');
      }
      const unavailable = !!current.unavailable || !current.id;
      const items = unavailable || !Array.isArray(current.items) ? [] : current.items.filter(item => item && item.id != null);
      const ordered = items.map((item, index) => ({ item, index })).sort((a, b) => {
        const aTime = timestamp(a.item.createdAt);
        const bTime = timestamp(b.item.createdAt);
        return bTime - aTime || a.index - b.index;
      });
      count.textContent = unavailable ? '' : `${items.length} ${items.length === 1 ? 'clip' : 'clips'}`;
      newButton.disabled = unavailable || adding;
      returnButton.classList.toggle('hidden', !current.canReturn);
      returnButton.disabled = !!current.busy;
      const seen = new Set();
      const liveCards = [];
      for (const { item } of ordered) {
        const id = String(item.id);
        if (seen.has(id)) continue;
        seen.add(id);
        let state = cards.get(id);
        if (state) {
          const freshNote = String(item.note || '');
          const changed = freshNote !== state.note || item.updatedAt !== state.version;
          if (changed && freshNote !== state.input.value && (state.dirty || document.activeElement === state.input)) {
            markOrphan(state, 'This note changed elsewhere. Copy your draft before dismissing it.');
            state = null;
          }
        }
        if (!state) { state = makeCard(item); cards.set(id, state); }
        state.meta.textContent = sourceLabel(item.anchor);
        const quoteText = String(item.quote || '');
        state.quote.textContent = quoteText;
        state.quote.hidden = !quoteText;
        state.source.hidden = !item.anchor;
        state.source.disabled = !!current.busy;
        const freshNote = String(item.note || '');
        const changed = freshNote !== state.note || item.updatedAt !== state.version;
        if (changed) {
          if (freshNote === state.input.value && !state.saveFailed) {
            state.note = freshNote;
            state.version = item.updatedAt;
            state.dirty = false;
            state.pending = false;
          } else if (!state.dirty) {
            state.input.value = freshNote;
            state.note = freshNote;
            state.version = item.updatedAt;
            state.pending = false;
          } else {
            markOrphan(state, 'This note changed elsewhere. Copy your draft before dismissing it.');
            state = makeCard(item);
            cards.set(id, state);
          }
        }
        liveCards.push(state.card);
      }
      for (const [id, state] of cards) {
        if (!seen.has(id)) {
          if (state.dirty || document.activeElement === state.input) markOrphan(state, 'This clip was removed elsewhere. Copy your draft before dismissing it.');
          else { state.card.remove(); cards.delete(id); }
        }
      }
      const desired = [...orphans].map(state => state.card).concat(liveCards);
      if (!desired.length) {
        const empty = document.createElement('div');
        empty.className = 'excerpt-empty';
        empty.textContent = !current.id ? 'Open a paper to keep clips and notes here.' : unavailable ? 'Saved clips are preserved, but their format or the Clips module is unavailable in this version. Editing is paused.' : 'No clips yet. Select a passage and choose Save excerpt, or start a note here.';
        desired.push(empty);
      }
      const active = document.activeElement;
      const focusedInput = active && active.matches && active.matches('textarea.excerpt-note') && desired.some(card => card.contains(active)) ? active : null;
      const selection = focusedInput ? [focusedInput.selectionStart, focusedInput.selectionEnd, focusedInput.selectionDirection] : null;
      reordering = true;
      try {
        desired.forEach((node, index) => {
          if (list.children[index] !== node) list.insertBefore(node, list.children[index] || null);
        });
        while (list.children.length > desired.length) list.lastElementChild.remove();
        if (focusedInput && document.activeElement !== focusedInput) {
          focusedInput.focus();
          focusedInput.setSelectionRange(...selection);
        }
      } finally {
        reordering = false;
      }
    }

    function reset() {
      for (const state of cards.values()) {
        if (state.dirty || state.saveFailed) markOrphan(state, 'Unsaved draft · copy before reloading.');
      }
      scope = null;
      cards = new Map();
      orphans.clear();
      list.replaceChildren();
      count.textContent = '0 clips';
      setStatus('');
    }
    function hasDrafts() { return drafts.size > 0 || [...cards.values()].some(state => state.dirty || state.saveFailed); }
    function focus(id) {
      render();
      const state = cards.get(String(id));
      if (!state) return false;
      state.card.scrollIntoView({ block: 'nearest' });
      state.input.focus();
      return true;
    }
    newButton.addEventListener('click', async () => {
      if (adding || context().unavailable || !context().id) return;
      const startScope = { ...scope };
      const before = status.textContent;
      adding = true;
      newButton.disabled = true;
      try {
        const created = await adapter.addNote();
        render();
        const id = typeof created === 'string' ? created : created && created.id;
        if (stillInScope(startScope)) {
          // The reader reports persistence status; do not overwrite a storage warning.
          if (!(id != null && focus(id)) && status.textContent === before && !before) setStatus('Could not add a note.');
        }
      } catch (error) { if (stillInScope(startScope) && status.textContent === before && !before) setStatus('Could not add a note.'); }
      finally { adding = false; render(); }
    });
    returnButton.addEventListener('click', async () => {
      if (!context().canReturn || context().busy) return;
      const startScope = { ...scope };
      const before = status.textContent;
      returnButton.disabled = true;
      try { if (await adapter.returnToReading() === false && stillInScope(startScope) && status.textContent === before && !before) setStatus('Could not return to your reading place.'); }
      catch (error) { if (stillInScope(startScope) && status.textContent === before && !before) setStatus('Could not return to your reading place.'); }
      finally { render(); }
    });
    return { render, reset, focus, setStatus, hasDrafts };
  }

  window.PhloemExcerptView = { create };
})();
