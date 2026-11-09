/* Authored physics only. Notes use Tend's device-local storage and native bridges; no network requests. */
(function (root) {
  'use strict';
  const C = root.TendReasoningCore, QUESTIONS = root.TendReasoningContent;
  if (!C || !QUESTIONS) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let memory = null, warning = '', unsaved = false, readBlocked = false;
  const changes = new Set();
  const signal = () => { for (const fn of changes) fn(); root.dispatchEvent(new Event('tend-reasoning-change')); };
  function load() {
    if ((unsaved || readBlocked) && memory) return memory;
    try {
      if (root.TendAndroidReasoning) return C.normalize(JSON.parse(root.TendAndroidReasoning.load() || 'null'));
      if (root.TEND_NATIVE) return memory || C.normalize(root.TEND_REASONING_STATE);
      const json = localStorage.getItem(C.KEY);
      return json ? C.normalize(JSON.parse(json)) : memory || C.emptyState();
    } catch (_) { readBlocked = true; warning = 'Saved reasoning could not be read. The original copy is untouched; new work stays in memory. Restore a Tend backup to replace it.'; return (memory = memory || C.emptyState()); }
  }
  function save(state) {
    memory = C.normalize(state);
    if (readBlocked) return memory;
    try {
      if (root.TendAndroidReasoning) {
        if (root.TendAndroidReasoning.save(JSON.stringify(memory)) === false) throw new Error('save');
      } else if (root.TEND_NATIVE) {
        root.webkit.messageHandlers.tend.postMessage({ action: 'reasoningSave', state: memory });
        root.TEND_REASONING_STATE = memory;
      } else localStorage.setItem(C.KEY, JSON.stringify(memory));
      warning = ''; unsaved = false;
    } catch (_) { unsaved = true; warning = 'Your latest reasoning is only in memory. Export a backup before leaving or clearing this page.'; }
    return memory;
  }
  root.TendReasoningStorageError = message => { unsaved = true; warning = message; signal(); };
  const mutate = fn => { const s = save(fn(load())); signal(); return s; };
  function today() { const r = C.daily(load(), new Date()); save(r.state); return r; }
  const question = id => QUESTIONS.find(q => q.id === id);
  const dateLabel = day => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
  const optionText = (q, id) => q.options.find(o => o.id === id)?.text || 'No prediction recorded';
  const list = items => `<ul class="rq-conditions">${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
  function diagram(kind, title) {
    if (!kind) return '';
    const rect = (x,y,w,h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#14291c" stroke="currentColor" stroke-width="1.5"/>`;
    const line = d => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2"/>`;
    const text = (x,y,t) => `<text x="${x}" y="${y}" text-anchor="middle">${t}</text>`;
    let art = '', caption = 'A schematic to think with · not to scale';
    if (kind === 'book') art = rect(110,65,140,24) + line('M65 90H295M90 90v40M270 90v40') + text(180,49,'book at rest');
    if (kind === 'pressure') art = rect(55,55,95,45) + rect(230,25,45,75) + line('M30 103H330') + text(104,128,'broad face') + text(253,128,'small face');
    if (kind === 'density') art = rect(45,40,100,65) + rect(210,40,43,65) + rect(268,40,43,65) + text(95,128,'one material') + text(261,128,'two pieces');
    if (kind === 'vessels') art = '<path d="M55 30v90h250V30M100 30v65h100V30" fill="none" stroke="currentColor" stroke-width="2"/><path d="M57 70h41v27h104V70h101v48H57Z" fill="#173d36"/>' + text(78,22,'open') + text(252,22,'open') + text(180,143,'connected water');
    if (['submerged','floating','ice'].includes(kind)) {
      art = '<path d="M40 30v105h280V30" fill="none" stroke="currentColor" stroke-width="2"/><path d="M42 70h276v63H42Z" fill="#173d36"/>';
      art += kind === 'submerged' ? rect(90,85,45,30)+rect(225,85,45,30)+text(112,57,'A')+text(247,57,'B') : rect(140,48,80,45)+text(180,28,kind==='ice'?'pure ice':'floating block');
      art += line('M42 70H318');
    }
    if (kind === 'gas-open' || kind === 'gas-rigid') {
      art = '<rect x="52" y="35" width="94" height="75" fill="#11221c" stroke="currentColor"/><rect x="214" y="35" width="94" height="75" fill="#281d11" stroke="#ffd65c"/>';
      if (kind === 'gas-rigid') for (const x of [70,95,123,232,257,285]) art += `<circle cx="${x}" cy="${x%2?84:58}" r="3" fill="currentColor"/>`;
      else art += text(99,78,'sample A') + text(261,78,'sample B');
      art += text(99,132,'cooler')+text(261,132,'warmer')+text(180,19,kind==='gas-open'?'same pressure':'same sealed rigid vessel');
      caption = kind==='gas-open'?'Comparing two samples · pressure is held equal':'Before and after heating · fixed mass and volume';
    }
    if (kind === 'balloons') art = '<ellipse cx="100" cy="65" rx="34" ry="40" fill="#162d20" stroke="currentColor" stroke-width="2"/><ellipse cx="254" cy="58" rx="49" ry="52" fill="#2a2411" stroke="#ffd65c" stroke-width="2"/>' + line('M100 105v18h154v-13M172 116v14M183 116v14') + text(100,65,'small')+text(254,59,'large')+text(180,149,'connecting valve');
    if (kind === 'hover' || kind === 'flight') {
      art = line('M172 20H292M230 20v14M203 38l-26 19h94l-19-19ZM197 65H264')+rect(120,110,55,28)+'<path d="M232 66Q176 75 148 106" stroke="#ffd65c" stroke-width="2" stroke-dasharray="3 6" fill="none"/>'+text(187,95,'?');
      art += text(75,35,kind==='hover'?'hovering':'steady →');
      caption = 'Rope shape is the question · dotted path is a placeholder';
    }
    if (kind === 'ramp') art = line('M50 35L135 125H170M220 35Q222 95 305 125H330M30 35H335M30 125H335')+'<circle cx="50" cy="30" r="6" fill="#ffd65c"/><circle cx="220" cy="30" r="6" fill="#ffd65c"/>'+text(180,151,'same vertical drop');
    if (kind === 'balance') art = line('M45 65H310M180 65l-18 55h36ZM65 65v28M238 65v28')+rect(48,93,34,30)+rect(216,93,44,37)+text(65,148,'1 kg · 2 m')+text(256,148,'2 kg · 1 m');
    if (kind === 'ice-bead') art = '<path d="M40 28v110h280V28" fill="none" stroke="currentColor" stroke-width="2"/><path d="M42 64h276v72H42Z" fill="#173d36"/>' + '<rect x="135" y="60" width="90" height="52" fill="#284b48" stroke="#8cddd0" stroke-width="2"/><circle cx="180" cy="85" r="4" fill="#999f9b" stroke="#e3e9e2"/>' + text(180,34,'ice with steel bead') + line('M42 64H133M227 64H318');
    if (kind === 'scales') art = line('M38 20H180M65 20V135M165 20V42')+'<rect x="155" y="42" width="20" height="25" fill="none" stroke="#ffd65c"/>'+line('M165 67V95')+rect(148,95,34,23)+'<path d="M115 68v65h160V68M117 84h156" fill="none" stroke="currentColor" stroke-width="2"/><rect x="109" y="136" width="174" height="19" fill="#17291e" stroke="currentColor"/>'+text(250,30,'spring scale')+text(195,150,'balance');
    if (kind === 'tether') art = '<path d="M50 23v114h260V23" fill="none" stroke="currentColor" stroke-width="2"/><path d="M52 43h256v92H52Z" fill="#173d36"/>'+rect(156,65,48,33)+line('M180 98V135M52 43H308')+text(180,25,'submerged block')+text(246,119,'thread');
    if (kind === 'hydraulic') art = '<path d="M55 35v100h250V35M90 35v70h130V35" fill="none" stroke="currentColor" stroke-width="2"/><path d="M57 66h31v41h134V66h81v67H57Z" fill="#173d36"/>'+line('M52 64H93M217 64H308M73 37V60M263 37V60')+text(74,25,'small')+text(266,25,'large')+text(180,154,'connected liquid · pistons at same height');
    if (kind === 'friction') art = rect(118,55,100,50)+line('M40 107H320M219 80H285M274 73l11 7-11 7')+text(267,53,'push')+text(173,137,'rough horizontal table');
    if (kind === 'vessel-shapes') art = '<path d="M40 30l15 100h75l15-100M225 30l-12 100h75L275 30" fill="none" stroke="currentColor" stroke-width="2"/><path d="M47 65h91l-10 63H57ZM221 65h59l7 63h-72Z" fill="#173d36"/>'+line('M47 65H138M212 65H304')+text(180,153,'same water depth and base area');
    return `<figure class="rq-diagram"><svg viewBox="0 0 360 166" role="img" aria-label="${esc(title)}: ${esc(caption)}">${art}</svg><figcaption>${esc(caption)}</figcaption></figure>`;
  }
  function mount(host, options = {}) {
    host.classList.add('reasoning');
    let activeId = null, view = 'home', variationOpen = false;
    const header = label => `<div class="rq-head"><p class="eyebrow">${esc(label)}</p><button type="button" class="icon-button" data-action="close" aria-label="Close reasoning">×</button></div>`;
    const storage = () => warning ? `<p class="rq-storage" role="status">${esc(warning)}</p>` : '';
    function focusTitle() { const title = host.querySelector('h2'); if(title) { title.tabIndex=-1; title.focus({preventScroll:true}); } host.closest('dialog')?.scrollTo(0,0); }
    function home(focus = false) {
      view = 'home'; activeId = null; variationOpen = false;
      const { question: q } = today(), state = load(), day = C.dayKey(new Date()), done = !!state.dailyCompleted[day];
      const due = C.dueReviews(state,new Date()), concepts = C.summary(state);
      const saved = state.attempts.find(a=>a.id===`daily:${day}`);
      host.innerHTML = `${header('A LITTLE ROOM TO WONDER')}<div class="rq-stack">${storage()}
        <div><h2>Think a little.<br>Notice what changes.</h2><p class="rq-muted">One physics idea each day. About 3–5 minutes, at your pace. A prediction is a place to begin; changing it is part of thinking.</p></div>
        <section class="rq-card"><p class="rq-date">${esc(dateLabel(day))} · ${esc(q.concept)}</p><h2>${esc(q.title)}</h2><p class="rq-muted">${done?'You’ve explored today’s explanation. Come back to it whenever you like.':'Make a prediction, check the assumptions, and follow the explanation.'}</p><button class="button primary" data-action="today">${done?'Revisit today’s idea':saved?'Continue exploring':'Explore today’s idea'}</button></section>
        ${due.length ? `<section class="rq-card"><h3>Return to an idea · optional</h3><p>${esc(question(due[due.length-1].questionId).title)}</p><p class="rq-muted">A different condition, a few days later. There’s no need to catch up.</p><button class="button secondary" data-action="review" data-id="${esc(due[due.length-1].id)}">Try a related question</button></section>`:''}
        <details><summary>A gentle introduction · optional</summary><p class="rq-muted">Try a simple example to get comfortable with the flow. You can go straight to today’s idea.</p><div class="rq-library">${QUESTIONS.filter(q=>['quiet-book','half-a-material'].includes(q.id)).map(q=>`<button class="button secondary" data-action="practice" data-id="${esc(q.id)}">${esc(q.title)}<span>${esc(q.concept)}</span></button>`).join('')}</div></details>
        <section><h3>Concepts you’ve visited</h3>${concepts.length?`<ul class="rq-concepts">${concepts.map(c=>`<li>${esc(c.concept)}<small>${c.explored?'Explored':''}${c.explored&&c.reviewed?' · ':''}${c.reviewed?'Reviewed':''}</small></li>`).join('')}</ul>`:'<p class="rq-muted">Your explored and reviewed ideas will gather here. No score, no streak to keep.</p>'}</section>
        ${done?`<details><summary>Practice another idea · optional</summary><div class="rq-library">${QUESTIONS.map(q=>`<button class="button secondary" data-action="practice" data-id="${esc(q.id)}">${esc(q.title)}<span>${esc(q.concept)}</span></button>`).join('')}</div></details>`:''}
        ${state.attempts.length?`<details><summary>Your reasoning notebook</summary><p class="rq-muted">Private on this device. Included when you export a Tend backup.</p>${state.attempts.slice().reverse().slice(0,30).map(a=>history(a)).join('')}</details>`:''}
        <p class="rq-muted">Notes and predictions stay on this device. Nothing is sent to an AI service. You can leave at any point and return.</p>
      </div>`;
      if(focus) focusTitle();
    }
    function history(a) {
      const q=question(a.questionId), task=a.mode==='review'?q.variation:q;
      return `<article class="rq-history"><h3>${esc(q.title)} · ${esc(a.mode)} · ${esc(dateLabel(a.day))}</h3><p><b>Initial:</b> ${esc(optionText(task,a.initialPrediction))}</p><p><b>Final:</b> ${esc(optionText(task,a.finalPrediction))}</p>${a.reason?`<p><b>Your reason:</b> ${esc(a.reason)}</p>`:''}${a.changedMind?`<p><b>What changed:</b> ${esc(a.changedMind)}</p>`:''}<p>${a.hintsUsed} hint${a.hintsUsed===1?'':'s'} opened · ${a.completedAt?'Explanation explored':a.revealed?'Answer revealed':'Saved for later'}</p></article>`;
    }
    function begin(questionId,mode,reviewId) {
      const r=C.start(load(),{questionId,mode,day:C.dayKey(new Date()),reviewId});save(r.state);activeId=r.attempt.id;view='attempt';variationOpen=false;render(true);signal();
    }
    const choices = (task,value,field,legend,disabled=false) => `<fieldset class="rq-options"><legend>${esc(legend)}</legend>${task.options.map(o=>`<label class="rq-option"><input type="radio" name="${field}" value="${esc(o.id)}" data-field="${field}" ${disabled?'disabled':''} ${o.id===value?'checked':''}><span>${esc(o.text)}</span></label>`).join('')}</fieldset>`;
    function hints(a, task) { const items=task.hints||[];return `<section class="rq-hints" aria-label="Progressive hints">${a.hintsUsed?`<ol>${items.slice(0,a.hintsUsed).map(h=>`<li>${esc(h)}</li>`).join('')}</ol>`:''}${a.hintsUsed<items.length?`<button class="text-button" data-action="hint">${a.hintsUsed?'Another hint':'A small hint'} (${a.hintsUsed+1} of ${items.length})</button>`:'<p class="rq-muted">All hints are open. Take whatever is useful.</p>'}</section>`; }
    function check(task) { const c=task.check;return `<section class="rq-check"><h3>Assumption check</h3><p class="rq-muted">A pause to think, with nothing to fill in.</p><dl><dt>What stays constant?</dt><dd>${esc(c.constant)}</dd><dt>What forces act?</dt><dd>${esc(c.forces)}</dd><dt>Which quantity reaches equilibrium?</dt><dd>${esc(c.equilibrium)}</dd></dl></section>`; }
    function render(focus=false) {
      const state=load(), a=state.attempts.find(a=>a.id===activeId); if(!a) return home(focus);
      const q=question(a.questionId), task=a.mode==='review'?q.variation:q, explaining=['explain','complete'].includes(a.stage);
      host.innerHTML=`${header(a.mode==='review'?'RETURN TO AN IDEA':a.mode==='practice'?'A LITTLE MORE PRACTICE':`TODAY’S IDEA · ${dateLabel(a.day)}`)}<div class="rq-stack">${storage()}
        <div><p class="rq-date">${esc(q.concept)}${a.mode==='review'?' · One condition changed':''}</p><h2>${esc(q.title)}</h2></div>
        <p>${esc(task.prompt)}</p>${a.stage==='predict'?`${a.mode==='review'?'':diagram(q.diagram,q.title)}<section><h3>The conditions</h3>${list(task.conditions||q.conditions)}</section>`:`<details><summary>Problem setup and conditions</summary>${a.mode==='review'?'':diagram(q.diagram,q.title)}${list(task.conditions||q.conditions)}</details>`}
        ${!explaining?`
          ${a.stage==='check'?`<p class="rq-muted">Your initial prediction: <b>${esc(optionText(task,a.initialPrediction))}</b>. You can keep it or try a different one.</p>${check(task)}`:''}
          ${choices(task,a.stage==='predict'?a.initialPrediction:a.finalPrediction,a.stage==='predict'?'initialPrediction':'finalPrediction',a.stage==='predict'?'What do you predict?':'Keep or revise your prediction')}
          ${a.stage==='predict'?`<details><summary>Add a reason · optional</summary><label class="rq-note">What led you here?<textarea rows="2" maxlength="500" data-field="reason">${esc(a.reason)}</textarea></label></details>`:`<details ${a.initialPrediction!==a.finalPrediction?'open':''}><summary>What changed your mind? · optional</summary><label class="rq-note">An assumption, a hint, a new way to see it…<textarea rows="2" maxlength="500" data-field="changedMind">${esc(a.changedMind)}</textarea></label></details>`}
          ${hints(a,task)}
          ${a.stage==='predict'?`<div class="rq-actions"><button class="button primary" data-action="check" ${!a.initialPrediction?'disabled':''}>Consider the assumptions →</button><button class="text-button" data-action="reveal">Reveal the explanation</button></div>`:`<div class="rq-actions"><button class="button primary" data-action="submit" ${!a.finalPrediction?'disabled':''}>See how it works →</button><button class="text-button" data-action="reveal">Reveal without submitting</button></div>`}
          <p class="rq-muted">Hints and changed predictions count just the same. You can reveal without choosing.</p>
        `:`
          <section class="rq-stack"><h3>${a.stage==='complete'?'An idea explored':'Let’s follow the reasoning'}</h3>${!a.revealed?`<p class="rq-muted">${a.finalPrediction===task.answer?'Your prediction fits these conditions.':'Here’s how the stated conditions lead to the answer.'}</p>`:''}<p class="rq-answer">${esc(optionText(task,task.answer))}</p><ol class="rq-explanation">${task.explanation.map(t=>`<li>${esc(t)}</li>`).join('')}</ol></section>
          <section class="rq-stack"><h3>Why the other ideas can feel plausible</h3>${task.options.filter(o=>o.id!==task.answer).map(o=>`<p class="rq-feedback"><strong>${esc(o.text)}</strong><br><span class="rq-muted">${esc(o.feedback)}</span></p>`).join('')}</section>
          ${a.mode!=='review'?`<section class="rq-check"><h3>When would the answer change?</h3><p class="rq-muted">${esc(q.changes)}</p></section>`:''}
          <details><summary>Your prediction and notes</summary>${history(a)}</details>
          <section class="rq-source"><h3>Grounded in</h3><p class="rq-muted">An authored question; the explanation applies the principles in these sources.</p>${q.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`).join('')}</section>
          ${a.stage!=='complete'?`<div class="rq-actions"><button class="button primary" data-action="complete">I’ve explored the explanation</button></div><p class="rq-muted">This saves the idea as explored, whichever prediction you made.</p>`:`<p class="rq-saved" role="status">✓ ${a.mode==='review'?'Concept reviewed.':a.mode==='daily'?'Today’s exploration is kept. A related question will be here in a few days.':'Practice kept.'}</p>${a.mode!=='review'?variation(a,q):''}<div class="rq-actions"><button class="button primary" data-action="home">Back to the reasoning desk</button></div>`}
        `}
        ${a.stage!=='complete'?'<button class="text-button" data-action="home">Save and come back later</button>':''}
      </div>`;
      if(focus) focusTitle();
    }
    function variation(a,q) {
      const v=q.variation;return `<details data-variation ${variationOpen?'open':''}><summary>Change one condition · optional</summary><div class="rq-stack"><p>${esc(v.prompt)}</p>${list(v.conditions)}${choices(v,a.variationPrediction,'variationPrediction','What happens now?',a.variationRevealed)}${!a.variationRevealed?'<button class="button secondary" data-action="variation">Explore this variation</button>':''}${a.variationRevealed?`<p class="rq-answer">${esc(optionText(v,v.answer))}</p>${v.explanation.map(t=>`<p>${esc(t)}</p>`).join('')}${a.variationPrediction&&a.variationPrediction!==v.answer?`<p class="rq-muted">${esc(v.options.find(o=>o.id===a.variationPrediction).feedback)}</p>`:''}`:''}</div></details>`;
    }
    host.addEventListener('input', e=>{
      const field=e.target.dataset.field;if(!field||!activeId)return;
      mutate(s=>C.update(s,activeId,{[field]:e.target.value}));
      if(e.target.type==='radio') { if(field==='variationPrediction')variationOpen=true;render();host.querySelector(`input[data-field="${field}"][value="${e.target.value}"]`)?.focus({preventScroll:true}); }
    });
    host.addEventListener('toggle',e=>{if(e.target.hasAttribute('data-variation'))variationOpen=e.target.open;},true);
    host.addEventListener('click', e=>{
      const b=e.target.closest('[data-action]');if(!b)return;
      const action=b.dataset.action, a=load().attempts.find(a=>a.id===activeId);
      if(action==='close')return options.onClose?.();
      if(action==='home')return home(true);
      if(action==='today')return begin(today().question.id,'daily');
      if(action==='practice')return begin(b.dataset.id,'practice');
      if(action==='review'){const r=C.dueReviews(load(),new Date()).find(r=>r.id===b.dataset.id);if(r)return begin(r.questionId,'review',r.id);return;}
      if(!a)return;
      if(action==='check')mutate(s=>C.update(s,a.id,{stage:'check'}));
      if(action==='hint')mutate(s=>C.update(s,a.id,{hintsUsed:a.hintsUsed+1}));
      if(action==='submit'||action==='reveal')mutate(s=>C.submit(s,a.id,{reveal:action==='reveal'}));
      if(action==='complete')mutate(s=>C.complete(s,a.id,new Date()));
      if(action==='variation'){variationOpen=true;mutate(s=>C.update(s,a.id,{variationRevealed:true}));}
      render(action!=='hint'&&action!=='variation');
      if(action==='hint'){const hint=host.querySelector('.rq-hints li:last-child');if(hint){hint.tabIndex=-1;hint.focus({preventScroll:true});}}
    });
    const refresh=()=>{if(view==='home')home();};
    changes.add(refresh);
    home();
    return { home, refresh, stop:()=>{} };
  }
  function room() {
    const page=document.getElementById('reasoning-page-root');
    if(page){const game=mount(page,{onClose:()=>{if(root.TendAndroidReasoning)return root.TendAndroidReasoning.close();location.href='./';}});let day=C.dayKey(new Date());const refreshDay=()=>{const next=C.dayKey(new Date());if(next!==day){day=next;game.refresh();}};setInterval(refreshDay,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDay();});root.addEventListener('tend-resume',refreshDay);return;}
    const dialog=document.getElementById('reasoning-dialog');if(!dialog)return;
    const game=mount(document.getElementById('reasoning-root'),{onClose:()=>dialog.close()});
    const paint=()=>{const q=today().question, done=load().dailyCompleted[C.dayKey(new Date())];document.getElementById('reasoning-strip-name').textContent=q.title;document.getElementById('reasoning-strip-meta').textContent=done?'Today’s idea explored · Return whenever you like':`3–5 minutes · ${q.concept} · At your pace`;document.getElementById('reasoning-open').textContent=done?'Revisit an idea':'Explore an idea';};
    changes.add(paint);
    document.getElementById('reasoning-open').addEventListener('click',()=>{game.home();dialog.showModal();});
    let day=C.dayKey(new Date());const checkDay=()=>{const next=C.dayKey(new Date());if(next!==day){day=next;paint();game.refresh();}};
    setInterval(checkDay,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkDay();});root.addEventListener('tend-resume',checkDay);paint();
  }
  root.addEventListener('storage',e=>{if(e.key===C.KEY)signal();});
  root.TendReasoning={mount,snapshot:load,replace:raw=>{readBlocked=false;save(C.normalize(raw));signal();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',room);else room();
})(typeof self!=='undefined'?self:this);
