(function(){
  'use strict';
  /* Create a page at buymeacoffee.com or ko-fi.com, paste its URL here, and the
     support line under the library shelf appears. Empty keeps it hidden. */
  var SUPPORT_URL = 'https://buymeacoffee.com/houfu72';
  var KEY = 'readingRoom.v1';
  var LAST_OPEN_KEY = 'readingRoom.lastOpen.v1';
  var SYNC_KEY = 'readingRoom.sync.v1';
  var AI_KEY = 'readingRoom.ai.v1';
  var STARTER_GUIDE_URL = '/assets/phloem-guide/phloem-field-guide.pdf';
  var STARTER_GUIDE_ID = 'phloem-field-guide-v1';
  var SYNC_FILE = 'reading-room.enc.json';
  var LOOKUP_DELAY = 900;
  var BOOK_SPINES = [
    {cover:'#8498c9',ink:'#f6df72'}, {cover:'#d8eeea',ink:'#bd4d43'},
    {cover:'#e6e39a',ink:'#315ca3'}, {cover:'#45aaa3',ink:'#f5e58b'},
    {cover:'#e7b7ac',ink:'#315fa5'}, {cover:'#d96854',ink:'#f6e6b4'},
    {cover:'#6d9d79',ink:'#f4e5a0'}, {cover:'#c5a3c6',ink:'#f8efd1'}
  ];
  var WALL_NOTES = [
    {cover:'#e5df73',ink:'#234f91'},
    {cover:'#a7c8e7',ink:'#234f91'},
    {cover:'#df8d80',ink:'#234f91'}
  ];
  var pristineLibrary = false;
  try { pristineLibrary = localStorage.getItem(KEY) === null; } catch(e){}
  var state = loadState();
  var currentId = null, currentPage = 1, pdfDoc = null, pdfLib = null, pdfRendering = false, pdfRenderPending = false;
  var pdfZoom = 1, pdfFit = true, darkPdf = false, readerBuildPromises = {}, pendingSelection = null, highlightMode = false, highlightColor = 'yellow', highlightCommitTimer = null, readerToastTimer = null, recallActive = false;
  var selectionAnchor = null, selectionNoteTarget = null;
  var lookupTimer = null, lookupSerial = 0, lookupAnchor = null, lookupCache = Object.create(null);
  var readerMode = 'pdf', editingId = null, aiContext = null, aiThreadDraft = false, syncCfg = null, syncing = false, syncTimer = null;
  try { syncCfg = JSON.parse(localStorage.getItem(SYNC_KEY)); } catch(e){}

  function byId(id){ return document.getElementById(id); }
  function now(){ return Date.now(); }
  function uid(prefix){ return prefix + now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s){ return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function paras(text){ return String(text || '').split(/\n\s*\n/).map(function(p){ return p.trim(); }).filter(Boolean); }
  function normalize(ch){
    ch.notes = ch.notes || {}; ch.pageNotes = ch.pageNotes || {}; ch.tags = ch.tags || [];
    ch.questions = ch.questions || []; ch.highlights = ch.highlights || {}; ch.textHighlights = ch.textHighlights || [];
    if(!Array.isArray(ch.aiThreads))ch.aiThreads=[];
    if(!ch.aiThreads.length&&ch.questions.length)ch.aiThreads=ch.questions.slice(0,12).map(function(q){return {id:'legacy-'+(q.id||uid('q')),contextLabel:q.contextLabel||'Earlier question',contextText:q.excerpt||'',messages:[{role:'user',content:q.question||'',at:q.at||now()},{role:'assistant',content:q.answer||'',at:q.at||now()}],createdAt:q.at||now(),updatedAt:q.at||now()};});
    ch.aiThreads=ch.aiThreads.filter(function(t){return t&&t.id&&Array.isArray(t.messages);}).slice(0,12);if(ch.activeAiThreadId&&!ch.aiThreads.some(function(t){return t.id===ch.activeAiThreadId;}))ch.activeAiThreadId='';if(!ch.activeAiThreadId&&ch.aiThreads[0])ch.activeAiThreadId=ch.aiThreads[0].id;
    ch.readerHighlights = ch.readerHighlights || []; ch.readerNotes = ch.readerNotes || {}; ch.termLookups = ch.termLookups || {}; ch.reviews = ch.reviews || {};
    ch.addedAt = ch.addedAt || now(); ch.updatedAt = ch.updatedAt || ch.addedAt;
    ch.readPage = ch.readPage || 1; ch.kind = ch.kind || (ch.pageTexts ? 'pdf' : 'text');
    return ch;
  }
  var pendingDuplicateStorage=[],duplicateRepairInFlight=null,duplicateUnsafeCopies={},duplicateNoticeMessage='',duplicateNoticeTimer=null;
  function identityText(value){
    var text=cleanMetaTitle(String(value||'')).replace(/\.pdf$/i,'');
    try{text=text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'');}catch(e){}
    return text.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  }
  function sourceIdentity(value){return String(value||'').trim().toLowerCase();}
  function samePdfSource(a,b,field){
    var av=sourceIdentity(a[field]),bv=sourceIdentity(b[field]);
    if(!av||av!==bv)return false;
    return !a.pageCount||!b.pageCount||+a.pageCount===+b.pageCount;
  }
  function likelySamePdf(a,b,exactOnly){
    if(!a||!b||a.kind!=='pdf'||b.kind!=='pdf')return false;
    var ah=String(a.contentHash||''),bh=String(b.contentHash||'');
    if(ah&&bh)return ah===bh;
    if(exactOnly)return false;
    if(samePdfSource(a,b,'sourceUrl')||samePdfSource(a,b,'sourcePath'))return true;
    var pages=+a.pageCount&&+b.pageCount&&+a.pageCount===+b.pageCount;
    if(!pages)return false;
    var at=identityText(a.title),bt=identityText(b.title);
    if(at.length>=12&&at===bt)return true;
    var af=identityText(a.sourceName),bf=identityText(b.sourceName);
    return af.length>=5&&af===bf;
  }
  /* A known hash mismatch always wins over title similarity, including when an older
     hashless record sits between two real editions with the same title. */
  function duplicateGroups(chapters,exactOnly){
    var papers=(chapters||[]).filter(function(ch){return ch&&ch.kind==='pdf';}),parent=papers.map(function(_,i){return i;}),hashes=papers.map(function(ch){var set={};if(ch.contentHash)set[ch.contentHash]=true;return set;});
    function root(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
    function unite(a,b){
      a=root(a);b=root(b);if(a===b)return;
      var ah=Object.keys(hashes[a]),bh=Object.keys(hashes[b]);
      if(ah.length&&bh.length&&ah[0]!==bh[0])return;
      parent[b]=a;Object.keys(hashes[b]).forEach(function(h){hashes[a][h]=true;});
    }
    for(var i=0;i<papers.length;i++)for(var j=i+1;j<papers.length;j++)if(likelySamePdf(papers[i],papers[j],exactOnly))unite(i,j);
    var grouped={};papers.forEach(function(ch,i){var r=root(i);(grouped[r]=grouped[r]||[]).push(ch);});
    return Object.keys(grouped).map(function(k){return grouped[k];}).filter(function(group){return group.length>1;});
  }
  function itemIdentity(item){
    if(item&&item.id)return 'id:'+item.id;
    if(!item||typeof item!=='object')return 'value:'+String(item);
    return 'content:'+['question','answer','text','contextLabel','para','page','start','end','at'].map(function(k){return String(item[k]===undefined?'':item[k]);}).join('|');
  }
  function mergeItemArrays(first,second){
    var out=[],seen={};
    (first||[]).concat(second||[]).forEach(function(item){
      var key=itemIdentity(item);
      if(seen[key]===undefined){seen[key]=out.length;out.push(item);return;}
      var at=seen[key],old=out[at];
      try{if(JSON.stringify(item).length>JSON.stringify(old).length)out[at]=item;}catch(e){}
    });
    return out;
  }
  function mergeNoteText(first,second){
    first=String(first||'').trim();second=String(second||'').trim();
    if(!first)return second;if(!second||first===second)return first;
    if(first.indexOf(second)>=0)return first;if(second.indexOf(first)>=0)return second;
    return first+'\n\n— merged from another device —\n\n'+second;
  }
  function mergeNoteMap(first,second){var out=Object.assign({},first||{});Object.keys(second||{}).forEach(function(k){out[k]=mergeNoteText(out[k],second[k]);});return out;}
  function mergeHighlightMap(first,second){var out=Object.assign({},first||{});Object.keys(second||{}).forEach(function(k){out[k]=mergeItemArrays(out[k],second[k]);});return out;}
  function mergeTags(first,second){var out=[],seen={};(first||[]).concat(second||[]).forEach(function(tag){var key=String(tag||'').trim().toLowerCase();if(key&&!seen[key]){seen[key]=true;out.push(String(tag).trim());}});return out;}
  function mergeReviews(first,second){var out=Object.assign({},first||{});Object.keys(second||{}).forEach(function(k){var incoming=second[k],current=out[k];if(!current||(incoming.last||0)>(current.last||0)||((incoming.last||0)===(current.last||0)&&(incoming.streak||0)>(current.streak||0)))out[k]=incoming;});return out;}
  function mergeLookups(first,second){var out=Object.assign({},first||{});Object.keys(second||{}).forEach(function(k){if(!out[k]||(second[k].cachedAt||0)>(out[k].cachedAt||0))out[k]=second[k];});return out;}
  function titleQuality(ch){var title=String(ch.title||''),score=Math.min(title.length,220);if(!title||/^untitled$/i.test(title))score-=500;if(ch.sourceName&&title===filenameTitle(ch.sourceName))score-=120;return score;}
  function mergeDuplicateRecord(keep,extra){
    normalize(keep);normalize(extra);
    Object.keys(extra).forEach(function(k){if(k!=='id'&&(keep[k]===undefined||keep[k]===null||keep[k]===''))keep[k]=extra[k];});
    if(titleQuality(extra)>titleQuality(keep))keep.title=extra.title;
    if(String(extra.authors||'').length>String(keep.authors||'').length)keep.authors=extra.authors;
    keep.tags=mergeTags(keep.tags,extra.tags);keep.notes=mergeNoteMap(keep.notes,extra.notes);keep.pageNotes=mergeNoteMap(keep.pageNotes,extra.pageNotes);keep.readerNotes=mergeNoteMap(keep.readerNotes,extra.readerNotes);
    keep.questions=mergeItemArrays(keep.questions,extra.questions);keep.aiThreads=mergeItemArrays(keep.aiThreads,extra.aiThreads).sort(function(a,b){return (+b.updatedAt||0)-(+a.updatedAt||0);}).slice(0,12);keep.textHighlights=mergeItemArrays(keep.textHighlights,extra.textHighlights);keep.readerHighlights=mergeItemArrays(keep.readerHighlights,extra.readerHighlights);keep.highlights=mergeHighlightMap(keep.highlights,extra.highlights);
    keep.reviews=mergeReviews(keep.reviews,extra.reviews);keep.termLookups=mergeLookups(keep.termLookups,extra.termLookups);
    keep.readPage=Math.max(+keep.readPage||1,+extra.readPage||1);keep.pageCount=Math.max(+keep.pageCount||0,+extra.pageCount||0)||keep.pageCount;keep.fileSize=Math.max(+keep.fileSize||0,+extra.fileSize||0)||keep.fileSize;
    keep.addedAt=Math.min(+keep.addedAt||now(),+extra.addedAt||now());keep.updatedAt=Math.max(+keep.updatedAt||0,+extra.updatedAt||0);
    if(extra.kind==='pdf')mergeDerivedInto(keep,derivedData(extra));return keep;
  }
  function canonicalPaper(group){return group.slice().sort(function(a,b){var age=(+a.addedAt||0)-(+b.addedAt||0);return age||String(a.id).localeCompare(String(b.id));})[0];}
  function resolvedPaperId(id){var merged=state.merged||{},seen={},next=id;while(merged[next]&&!seen[next]){seen[next]=true;next=merged[next];}return next;}
  function queueDuplicateStorage(keepId,dropId){keepId=resolvedPaperId(keepId);if(!keepId||!dropId||keepId===dropId)return;if(!pendingDuplicateStorage.some(function(p){return p.keepId===keepId&&p.dropId===dropId;}))pendingDuplicateStorage.push({keepId:keepId,dropId:dropId});}
  function collapseDuplicateGroups(groups){
    var plans=[],stamp=now();state.deleted=state.deleted||{};state.merged=state.merged||{};
    (groups||[]).forEach(function(group){var keep=canonicalPaper(group);group.forEach(function(extra){
      if(extra.id===keep.id)return;mergeDuplicateRecord(keep,extra);state.deleted[extra.id]=Math.max(stamp,state.deleted[extra.id]||0);state.merged[extra.id]=keep.id;
      Object.keys(state.merged).forEach(function(id){if(state.merged[id]===extra.id)state.merged[id]=keep.id;});queueDuplicateStorage(keep.id,extra.id);plans.push({keepId:keep.id,dropId:extra.id});
      if(currentId===extra.id){currentId=keep.id;try{localStorage.setItem(LAST_OPEN_KEY,keep.id);}catch(e){}}
    });keep.updatedAt=Math.max(stamp,keep.updatedAt||0);if(derivedData(keep))saveDerivedSoon(keep);});
    if(plans.length)state.chapters=state.chapters.filter(function(ch){return !state.deleted[ch.id];});return plans;
  }
  function loadState(){
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.chapters)) { s.chapters.forEach(normalize);s.deleted=s.deleted||{};s.merged=s.merged||{};s.chapters=s.chapters.filter(function(ch){return !s.deleted[ch.id];});return s; } } catch(e){}
    return { chapters: [], deleted: {}, merged: {} };
  }
  /* localStorage is deliberately only for small, frequently edited state. Rebuildable PDF
     text lives beside the PDFs in IndexedDB, while encrypted sync may still carry it. */
  var storageWarned = false;
  var DERIVED_FIELDS=['pageLines','pageParagraphs','pageTexts','readerText','readerV','fr','termLookups','figCount'];
  function localState(){
    var copy=Object.assign({},state);copy.chapters=state.chapters.map(function(ch){var item=Object.assign({},ch);if(item.kind==='pdf')DERIVED_FIELDS.forEach(function(field){delete item[field];});return item;});return copy;
  }
  function persist(schedule){
    try { localStorage.setItem(KEY, JSON.stringify(localState()));storageWarned=false; }
    catch(e){
      if (!storageWarned) {
        storageWarned = true;
        showError('Phloem could not save the newest change because this browser’s small note store is full. Remove a finished paper or turn on encrypted GitHub sync, then try that edit once more.','Phloem needs a little room');
      }
    }
    if (schedule !== false) scheduleSync();
  }
  function find(id){ return state.chapters.find(function(ch){ return ch.id === id; }); }
  function touch(ch){ ch.updatedAt = now(); persist(); }
  function showError(message,title){ byId('errorTitle').textContent=title||'Could not open that paper';byId('errorMessage').textContent=message; if(!byId('errorDialog').open) byId('errorDialog').showModal(); }
  function showReaderToast(message){var toast=byId('readerToast');clearTimeout(readerToastTimer);toast.textContent=message;toast.classList.remove('hidden');readerToastTimer=setTimeout(function(){toast.classList.add('hidden');},1800);}

  /* Selection is a crossroads, not an automatic network request. Keep the exact
     passage on-device until the reader chooses explain, AI, marker, or note. */
  function hideSelectionCard(){
    selectionAnchor=null;activeCardRef=null;selectionNoteTarget=null;var card=byId('selectionCard');card.classList.add('hidden');card.classList.remove('ai-open');
    byId('selectionAiBox').classList.add('hidden');byId('selectionSavedTools').classList.add('hidden');
  }
  function placeSelectionCard(rect){
    if(rect)selectionAnchor={left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width||Math.max(0,rect.right-rect.left)};
    var card=byId('selectionCard');if(!selectionAnchor||card.classList.contains('hidden'))return;
    if(innerWidth<=720){card.style.left='';card.style.top='';return;}
    requestAnimationFrame(function(){
      if(card.classList.contains('hidden')||!selectionAnchor)return;
      var box=card.getBoundingClientRect(),gap=12,center=selectionAnchor.left+(selectionAnchor.width||0)/2;
      var left=Math.max(gap,Math.min(center-box.width/2,innerWidth-box.width-gap)),top=selectionAnchor.bottom+gap;
      if(top+box.height>innerHeight-gap)top=selectionAnchor.top-box.height-gap;
      top=Math.max(gap,Math.min(top,innerHeight-box.height-gap));
      card.style.left=Math.round(left)+'px';card.style.top=Math.round(top)+'px';
    });
  }
  function relatedNotesForSelection(selection){
    var ch=find(currentId);if(!ch||!selection)return[];var parts=[],seen=Object.create(null);
    function add(label,value){value=String(value||'').trim();if(!value||seen[value])return;seen[value]=true;parts.push({label:label,value:value});}
    if(selectionNoteTarget&&selectionNoteTarget.item)add('Highlight note',selectionNoteTarget.item.note);
    if(selection.kind==='pdf')add('Page '+selection.page+' note',(ch.pageNotes||{})[String(selection.page)]);
    else{var map=selection.kind==='reader'?(ch.readerNotes||{}):(ch.notes||{});add((selection.kind==='reader'?'Reader ':'')+'Paragraph '+((selection.para||0)+1)+' note',map[String(selection.para||0)]);}
    add('Paper note',(ch.pageNotes||{}).document);return parts;
  }
  function notesForSelection(selection){return relatedNotesForSelection(selection).map(function(note){return note.label+':\n'+note.value;}).join('\n\n');}
  function refreshSelectionAskContext(){
    var selection=pendingSelection||lastAskSelection,notes=relatedNotesForSelection(selection),button=byId('selectionAsk'),context=byId('selectionContext');
    if(!notes.length){context.classList.add('hidden');button.title='Ask AI about this passage';button.setAttribute('aria-label',button.title);return;}
    context.classList.remove('hidden');var detail=notes.length<=2?notes.map(function(note){return note.label.toLowerCase();}).join(' + '):notes.length+' related notes';
    byId('selectionContextText').textContent='Included with Ask AI: your '+detail+'.';
    button.title='Ask AI about this passage with your related notes included';
    button.setAttribute('aria-label',button.title);
  }
  function setSelectionAction(id){document.querySelectorAll('#selectionCard .selection-action').forEach(function(button){var active=button.id===id;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});}
  function showSelectionCard(selection,rect){
    if(!selection||!selection.text)return;hideLookup();hideHighlightCard();selectionNoteTarget=null;byId('selectionEyebrow').textContent='Selected passage';
    byId('selectionCard').classList.remove('ai-open');byId('selectionAiBox').classList.add('hidden');byId('selectionSavedTools').classList.add('hidden');
    byId('selectionExcerpt').textContent='“'+selection.text+'”';byId('selectionNote').value='';byId('selectionNoteStatus').textContent='';byId('selectionNoteBox').classList.add('hidden');
    var highlight=byId('selectionHighlight');highlight.disabled=false;highlight.textContent='Highlight';
    var words=selection.text.trim().split(/\s+/).length;byId('selectionSecondary').classList.toggle('hidden',selection.text.length>140||words>14);
    byId('selectionAddNote').textContent='Note';setSelectionAction('');refreshSelectionAskContext();byId('selectionCard').classList.remove('hidden');placeSelectionCard(rect);
  }
  function openSelectionInAi(){
    var selection=pendingSelection||lastAskSelection,note=notesForSelection(selection);
    if(!selection||!selection.text||!useSelectionForAi(selection,note,true))return;clearPendingSelection(true);
    var ch=find(currentId),savedText=String(aiContext&&aiContext.text||'').slice(0,16000),match=ch&&(ch.aiThreads||[]).find(function(thread){return thread.contextLabel===aiContext.label&&thread.contextText===savedText;});
    if(match){ch.activeAiThreadId=match.id;aiThreadDraft=false;}else aiThreadDraft=true;renderQa();
    var card=byId('selectionCard');card.classList.add('ai-open');byId('selectionAiBox').classList.remove('hidden');byId('selectionAiQuestion').value='';growSelectionAiQuestion();byId('selectionAiStatus').textContent=match?'Thread reopened.':'Your question will start a thread here.';renderSelectionAiThread();placeSelectionCard();
    requestAnimationFrame(function(){byId('selectionAiQuestion').focus({preventScroll:true});});
  }

  /* A selection stays on the paper while this small, source-labelled reference card
     looks up an encyclopedic definition and a freely hosted image. */
  function hideLookup(){clearTimeout(lookupTimer);lookupSerial++;lookupAnchor=null;byId('lookupCard').classList.add('hidden');}
  function placeLookupCard(rect){
    if(rect)lookupAnchor={left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};
    var card=byId('lookupCard');if(!lookupAnchor||card.classList.contains('hidden'))return;
    if(innerWidth<=720){card.style.left='';card.style.top='';return;}
    requestAnimationFrame(function(){
      if(card.classList.contains('hidden')||!lookupAnchor)return;
      var box=card.getBoundingClientRect(),gap=12,left=lookupAnchor.right+gap;
      if(left+box.width>innerWidth-gap)left=lookupAnchor.left-box.width-gap;
      left=Math.max(gap,Math.min(left,innerWidth-box.width-gap));
      var top=Math.max(gap,Math.min(lookupAnchor.top-18,innerHeight-box.height-gap));
      card.style.left=Math.round(left)+'px';card.style.top=Math.round(top)+'px';
    });
  }
  function prepareLookup(term,rect){
    var card=byId('lookupCard');byId('lookupSelection').textContent='“'+term+'”';byId('lookupTitle').textContent='Looking up…';
    var definition=byId('lookupDefinition');definition.textContent='Finding a useful explanation and image.';definition.classList.add('loading');
    byId('lookupPhotoLink').classList.add('hidden');byId('lookupArticle').classList.add('hidden');byId('lookupImageSource').classList.add('hidden');byId('lookupSource').classList.add('hidden');byId('lookupAiSetup').classList.add('hidden');
    hideHighlightCard();card.classList.remove('hidden');placeLookupCard(rect);
  }
  function showLookupProblem(term,message){
    byId('lookupTitle').textContent=term;var definition=byId('lookupDefinition');definition.textContent=message;definition.classList.remove('loading');
    byId('lookupPhotoLink').classList.add('hidden');byId('lookupArticle').classList.add('hidden');byId('lookupImageSource').classList.add('hidden');byId('lookupSource').classList.add('hidden');placeLookupCard();
  }
  function conciseExtract(text){
    text=String(text||'').replace(/\s+/g,' ').trim();if(text.length<=560)return text;
    var cut=text.slice(0,560),stop=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('? '),cut.lastIndexOf('! '));
    return (stop>260?cut.slice(0,stop+1):cut.trimEnd())+'…';
  }
  function renderLookup(term,result){
    byId('lookupTitle').textContent=result.title||term;var definition=byId('lookupDefinition');definition.textContent=conciseExtract(result.extract)||'No concise explanation was available for this entry.';definition.classList.remove('loading');
    var source=byId('lookupSource'),isAi=result.source==='ai';source.textContent=isAi?'AI explanation · verify':'Wikipedia';source.classList.toggle('ai',isAi);source.classList.remove('hidden');byId('lookupAiSetup').classList.add('hidden');
    var article=byId('lookupArticle');article.href=result.url||'#';article.classList.toggle('hidden',!result.url);
    var photoLink=byId('lookupPhotoLink'),photo=byId('lookupPhoto'),imageSource=byId('lookupImageSource');
    if(result.image){photo.src=result.image;photo.alt='Image for '+(result.title||term);photoLink.href=result.imagePage||result.url||result.image;photoLink.classList.remove('hidden');imageSource.href=result.imagePage||result.url||result.image;imageSource.classList.remove('hidden');}
    else{photo.removeAttribute('src');photo.alt='';photoLink.classList.add('hidden');imageSource.classList.add('hidden');}
    placeLookupCard();
  }
  async function lookupJson(base,params){
    var response=await fetch(base+'?'+new URLSearchParams(params).toString(),{headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('Lookup failed');return response.json();
  }
  async function wikipediaEntry(term){
    var data=await lookupJson('https://en.wikipedia.org/w/api.php',{action:'query',format:'json',formatversion:'2',origin:'*',generator:'search',gsrsearch:term,gsrnamespace:'0',gsrlimit:'6',prop:'extracts|pageimages|info',exintro:'1',explaintext:'1',exchars:'700',piprop:'thumbnail|name',pithumbsize:'720',pilicense:'free',inprop:'url'});
    var normalized=term.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim(),tokens=normalized.split(/\s+/).filter(function(t){return t.length>2;}),pages=data&&data.query&&data.query.pages||[];
    var ranked=pages.filter(function(page){return page&&!page.missing&&page.extract;}).map(function(page){
      var title=String(page.title||'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim(),body=(title+' '+String(page.extract||'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ')),covered=tokens.filter(function(t){return body.split(/\s+/).some(function(word){return word===t;});}).length,titleCovered=tokens.filter(function(t){return title.split(/\s+/).some(function(word){return word===t;});}).length;
      var allCovered=!tokens.length||covered===tokens.length,phraseMatch=body.indexOf(normalized)>=0,titleMatch=title===normalized||title.indexOf(normalized)>=0||normalized.indexOf(title)>=0;
      return{page:page,valid:allCovered&&(phraseMatch||titleMatch||titleCovered>=Math.max(1,Math.ceil(tokens.length*.66))),score:(title===normalized?20:titleMatch?10:0)+(phraseMatch?7:0)+titleCovered*3+covered-(page.index||20)*.01};
    }).filter(function(item){return item.valid;}).sort(function(a,b){return b.score-a.score;});
    var page=ranked[0]&&ranked[0].page;if(!page)return null;
    return{title:page.title,extract:page.extract,url:page.fullurl||'',image:page.thumbnail&&page.thumbnail.source||'',imagePage:page.pageimage?'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(page.pageimage.replace(/ /g,'_')):page.fullurl||'',source:'wikipedia'};
  }
  async function commonsImage(term){
    var data=await lookupJson('https://commons.wikimedia.org/w/api.php',{action:'query',format:'json',formatversion:'2',origin:'*',generator:'search',gsrsearch:term+' filetype:bitmap',gsrnamespace:'6',gsrlimit:'1',prop:'imageinfo',iiprop:'url|mime',iiurlwidth:'720'});
    var page=data&&data.query&&data.query.pages&&data.query.pages[0],info=page&&page.imageinfo&&page.imageinfo[0];
    if(!info||!info.thumburl||String(info.mime||'').indexOf('image/')!==0)return null;
    return{url:info.thumburl,page:info.descriptionurl||''};
  }
  function lookupPaperContext(selection){
    var ch=find(currentId);if(!ch||!selection)return'';var source='';
    if(selection.kind==='pdf')source=(ch.pageTexts||[])[Math.max(0,(selection.page||1)-1)]||'';
    else{var text=selection.kind==='reader'?(ch.readerText||readerSourceText(ch)):(ch.fr||''),paragraphs=paras(text);source=paragraphs[Math.max(0,selection.para||0)]||'';}
    source=String(source).replace(/\s+/g,' ').trim();var needle=String(selection.text||'').replace(/\s+/g,' ').trim(),at=source.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
    if(at<0)return source.slice(0,1400);return source.slice(Math.max(0,at-600),Math.min(source.length,at+needle.length+800));
  }
  async function deepseekEntry(term,context){
    var key=localStorage.getItem(AI_KEY)||'';if(!key)return null;
    byId('lookupTitle').textContent='Asking DeepSeek…';byId('lookupDefinition').textContent='Wikipedia has no clean entry, so I’m reading this term in the paper’s context.';
    var ch=find(currentId),res=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-chat',max_tokens:360,messages:[{role:'system',content:'You write careful glossary notes for scientific-paper readers. Define the selected term as used in the supplied excerpt. Be concise, concrete, and honest about ambiguity. Return only valid JSON with string fields title, definition, and image_query. The definition must be 2-3 sentences with no markdown. image_query must name one concrete scientific object, organism, process diagram, or instrument suitable for a Wikimedia Commons search; leave it empty if no honest visual exists.'},{role:'user',content:'Paper: '+(ch&&ch.title||'Untitled')+'\nSelected term: '+term+'\nNearby excerpt: '+String(context||'No nearby excerpt available.').slice(0,1800)}]})});
    if(!res.ok)throw new Error('DeepSeek returned '+res.status);var data=await res.json(),answer=data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content||'',match=answer.match(/\{[\s\S]*\}/),parsed=match&&JSON.parse(match[0]);
    if(!parsed||!String(parsed.definition||'').trim())throw new Error('DeepSeek returned no definition');
    return{title:String(parsed.title||term).trim().slice(0,100),extract:String(parsed.definition).trim(),url:'',image:'',imagePage:'',imageQuery:String(parsed.image_query||'').trim().slice(0,100),source:'ai'};
  }
  function rememberLookup(ch,termKey,result){
    if(!ch||!result)return;result=Object.assign({},result,{cachedAt:now()});ch.termLookups=ch.termLookups||{};ch.termLookups[termKey]=result;
    var keys=Object.keys(ch.termLookups);if(keys.length>120)keys.sort(function(a,b){return(ch.termLookups[b].cachedAt||0)-(ch.termLookups[a].cachedAt||0);}).slice(120).forEach(function(key){delete ch.termLookups[key];});
    ch.updatedAt=now();if(ch.kind==='pdf')saveDerivedSoon(ch);persist();
  }
  async function loadLookup(term,serial,context){
    var ch=find(currentId),termKey=term.toLocaleLowerCase(),key=String(currentId||'')+'|'+termKey;
    try{
      var memoryHit=Object.prototype.hasOwnProperty.call(lookupCache,key),paperHit=!!(ch&&ch.termLookups&&Object.prototype.hasOwnProperty.call(ch.termLookups,termKey)),result=memoryHit?lookupCache[key]:paperHit?ch.termLookups[termKey]:await wikipediaEntry(term);
      if(serial!==lookupSerial)return;
      if(!result){
        if(!localStorage.getItem(AI_KEY)){lookupCache[key]=null;showLookupProblem(term,'Wikipedia has no clean entry for this phrase. Add a DeepSeek key to explain technical terms from the nearby paper context.');byId('lookupAiSetup').classList.remove('hidden');return;}
        result=await deepseekEntry(term,context);if(serial!==lookupSerial)return;
      }
      lookupCache[key]=result;renderLookup(term,result);
      if(!result.image&&!result.imageChecked){var image=null;try{image=await commonsImage(result.imageQuery||result.title||term);}catch(imageError){}if(serial!==lookupSerial)return;result=Object.assign({},result,{imageChecked:true});if(image){result.image=image.url;result.imagePage=image.page;}lookupCache[key]=result;renderLookup(term,result);}
      if(ch&&(!paperHit||ch.termLookups[termKey]!==result))rememberLookup(ch,termKey,result);
    }catch(e){if(serial===lookupSerial)showLookupProblem(term,'The reference lookup could not finish. Your highlight is still safe—try again when you are online.');}
  }
  function queueLookup(text,rect,selection,delay){
    var term=String(text||'').replace(/\s+/g,' ').replace(/^[\s"'“”‘’.,;:!?]+|[\s"'“”‘’.,;:!?]+$/g,'').trim();if(term.length<2)return;
    clearTimeout(lookupTimer);var serial=++lookupSerial,context=lookupPaperContext(selection);
    lookupTimer=setTimeout(function(){
      if(serial!==lookupSerial||selectionPointerDown)return;prepareLookup(term,rect);
      if(term.length>140||term.split(/\s+/).length>14){showLookupProblem(term,'Select a word or short phrase for a clearer definition and a more relevant image.');return;}
      loadLookup(term,serial,context);
    },delay===undefined?LOOKUP_DELAY:delay);
  }
  byId('lookupClose').onclick=hideLookup;
  byId('lookupAiSetup').onclick=function(){hideLookup();fillSettings();byId('settingsDialog').showModal();};
  byId('lookupPhoto').onerror=function(){byId('lookupPhotoLink').classList.add('hidden');byId('lookupImageSource').classList.add('hidden');};
  document.addEventListener('pointerdown',function(e){
    if(!e.target.closest('#lookupCard'))hideLookup();
    if(!e.target.closest('#selectionCard')&&!e.target.closest('.text-layer,.original'))hideSelectionCard();
  },true);
  window.addEventListener('resize',function(){placeLookupCard();placeSelectionCard();});

  /* One theme for everything: the app chrome, the PDF paper, and the phone status bar
     all follow the same light/dark switch. */
  function applyTheme(dark){
    if (dark) document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme;
    /* The button shows where a tap goes, not where you are: a moon all day, a sun
       all night. U+FE0E keeps the sun a glyph — iOS would otherwise paint it as
       a full-color emoji among the monochrome icons. */
    var tb = byId('themeBtn'), zt = byId('zenTheme');
    tb.textContent = zt.textContent = dark ? '☀︎' : '☾';
    var themeLabel = dark ? 'Switch to day reading' : 'Switch to night reading';
    tb.setAttribute('aria-label', themeLabel); zt.setAttribute('aria-label', themeLabel);
    tb.title = zt.title = dark ? 'Day reading' : 'Night reading';
    darkPdf = dark;
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = dark ? '#161a1c' : '#f3f0e8';
    applyDarkPdf();
    if (!byId('connectionsPage').classList.contains('hidden')) renderConnections();
  }
  var savedTheme = localStorage.getItem('readingRoom.theme');
  applyTheme(savedTheme ? savedTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  byId('themeBtn').onclick = function(){
    var dark = document.documentElement.dataset.theme !== 'dark';
    localStorage.setItem('readingRoom.theme', dark ? 'dark' : 'light');
    applyTheme(dark);
  };
  function showPage(id){
    ['libraryPage','reviewPage','connectionsPage','readerPage'].forEach(function(v){ byId(v).classList.toggle('hidden', v !== id); });
    document.querySelectorAll('.nav-btn[data-view]').forEach(function(b){ b.classList.toggle('active', b.dataset.view === id); });
    document.body.classList.toggle('library-view', id === 'libraryPage');
    /* The reader is an app screen, not a document: while it is open the page itself must
       never scroll, or the toolbar slides under the sticky masthead. */
    document.body.classList.toggle('reading', id === 'readerPage');
    if (id !== 'readerPage') { toggleSheet(false); hideLookup(); try{localStorage.removeItem(LAST_OPEN_KEY);}catch(e){} }
    if (id === 'readerPage' && innerWidth <= 720) { toggleSheet(false);byId('readerPage').classList.remove('show-tools');byId('mMore').setAttribute('aria-expanded','false'); }
    if (id === 'libraryPage') renderShelf();
    if (id === 'reviewPage') renderReview();
    if (id === 'connectionsPage') renderConnections();
    window.scrollTo(0, 0);
  }
  addEventListener('scroll', function(){
    if (document.body.classList.contains('reading') && (scrollY || scrollX)) scrollTo(0, 0);
  }, { passive: true });
  /* iOS never tells the layout about the on-screen keyboard, so the bottom half of the
     reader — the Ask box included — vanished behind it. The visual viewport does know:
     shrink the reader by the keyboard's height and keep the focused input in view. */
  if (window.visualViewport) {
    var kbRaf = null;
    var syncKeyboardInset = function(){
      kbRaf = null;
      var vv = window.visualViewport;
      var inset = document.body.classList.contains('reading') ? Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) : 0;
      if (inset < 60) inset = 0; /* small deltas are browser chrome, not a keyboard */
      document.documentElement.style.setProperty('--kb-inset', inset + 'px');
      if (inset) setTimeout(function(){
        var ae = document.activeElement;
        if (ae && ae.closest && ae.closest('.tab-panel, .find-bar, .notebook')) { try { ae.scrollIntoView({ block: 'nearest' }); } catch(e){} }
      }, 60);
    };
    ['resize', 'scroll'].forEach(function(name){
      window.visualViewport.addEventListener(name, function(){ if (!kbRaf) kbRaf = requestAnimationFrame(syncKeyboardInset); });
    });
  }
  document.querySelectorAll('.nav-btn[data-view]').forEach(function(b){ b.onclick = function(){ showPage(b.dataset.view); }; });
  byId('brandBtn').onclick = function(){ showPage('libraryPage'); };
  byId('readerBack').onclick = function(){ pdfDoc = null; showPage('libraryPage'); };

  /* modal helpers */
  document.querySelectorAll('[data-close]').forEach(function(b){ b.onclick = function(){ byId(b.dataset.close).close(); }; });
  byId('settingsBtn').onclick = function(){ fillSettings(); byId('settingsDialog').showModal(); };
  /* The standalone app can sit open for days while deploys pass it by; the service
     worker fetches reading.html network-first, so one reload is all "update" takes.
     Flush the save first — reload mid-debounce would drop the newest edit. */
  byId('refreshBtn').onclick = function(){ persist(false); location.reload(); };

  /* IndexedDB keeps actual PDFs local without choking localStorage. ArrayBuffers are
     more reliable than Blob records in older iPhone Safari; memory is a last-resort fallback. */
  var memoryPdfs={},memoryDerived={},derivedTimers={};
  function db(){
    return new Promise(function(resolve, reject){
      var req = indexedDB.open('marginFiles', 2);
      req.onupgradeneeded = function(){ if (!req.result.objectStoreNames.contains('pdfs')) req.result.createObjectStore('pdfs');if(!req.result.objectStoreNames.contains('derived'))req.result.createObjectStore('derived'); };
      req.onsuccess = function(){ resolve(req.result); }; req.onerror = function(){ reject(req.error); };
    });
  }
  async function pdfBytes(value){if(value instanceof ArrayBuffer)return value.slice(0);if(ArrayBuffer.isView(value))return value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength);if(value&&value.arrayBuffer)return value.arrayBuffer();throw new Error('The saved PDF data is not readable.');}
  async function pdfFingerprint(value){
    if(!(window.crypto&&window.crypto.subtle&&window.crypto.subtle.digest))return '';
    var bytes=value instanceof ArrayBuffer?value:await pdfBytes(value),digest=await window.crypto.subtle.digest('SHA-256',bytes),hex='';
    new Uint8Array(digest).forEach(function(b){hex+=b.toString(16).padStart(2,'0');});return hex;
  }
  async function rememberPdfFingerprint(ch,value){
    if(!ch||ch.kind!=='pdf'||ch.contentHash)return ch&&ch.contentHash||'';
    try{var bytes=value instanceof ArrayBuffer?value:await pdfBytes(value),hash=await pdfFingerprint(bytes),target=find(ch.id);if(!hash||!target)return '';if(!target.contentHash){target.contentHash=hash;target.fileSize=bytes.byteLength;persist();renderDuplicateNotice();}return target.contentHash||hash;}catch(e){return '';}
  }
  async function putPdf(id,value){
    var bytes=value instanceof ArrayBuffer?value:await pdfBytes(value);
    try{var d=await db();await new Promise(function(res,rej){var r=d.transaction('pdfs','readwrite').objectStore('pdfs').put(bytes,id);r.onsuccess=res;r.onerror=function(){rej(r.error);};});delete memoryPdfs[id];return true;}catch(e){memoryPdfs[id]=bytes;return false;}
  }
  async function getPdf(id){
    try{var d=await db(),saved=await new Promise(function(res,rej){var r=d.transaction('pdfs').objectStore('pdfs').get(id);r.onsuccess=function(){res(r.result||null);};r.onerror=function(){rej(r.error);};});if(saved)return saved;}catch(e){}
    return memoryPdfs[id]||null;
  }
  async function seedStarterGuide(){
    if(!pristineLibrary||state.chapters.length||syncCfg||gdriveOn()||location.protocol==='file:'||/^#(?:phloem|carrel|margin)-setup=/.test(location.hash))return false;
    try{
      var response=await fetch(STARTER_GUIDE_URL,{cache:'no-cache',credentials:'same-origin'});if(!response.ok)throw new Error('starter guide unavailable');
      var bytes=await response.arrayBuffer(),head=new Uint8Array(bytes,0,Math.min(5,bytes.byteLength)),magic='';for(var i=0;i<head.length;i++)magic+=String.fromCharCode(head[i]);if(magic!=='%PDF-')throw new Error('starter guide is not a PDF');
      var stamp=now(),guide=normalize({id:STARTER_GUIDE_ID,title:'A Field Guide to Phloem',authors:'Phloem',kind:'pdf',sourceName:'phloem-field-guide.pdf',sourceUrl:new URL(STARTER_GUIDE_URL,location.href).href,pageCount:6,fileSize:bytes.byteLength,notes:{},pageNotes:{},tags:['starter','field guide'],questions:[],addedAt:stamp,updatedAt:stamp,readPage:1});
      guide.contentHash=await pdfFingerprint(bytes).catch(function(){return '';});await putPdf(guide.id,bytes);state.chapters.push(guide);librarySelectionId=guide.id;persist(false);renderShelf();updateReviewBadge();return true;
    }catch(e){return false;}
  }
  function derivedData(ch){var record={},has=false;DERIVED_FIELDS.forEach(function(field){if(Object.prototype.hasOwnProperty.call(ch,field)){record[field]=ch[field];has=true;}});return has?record:null;}
  async function putDerived(ch){
    if(!ch||ch.kind!=='pdf')return false;var record=derivedData(ch);if(!record)return false;memoryDerived[ch.id]=record;
    try{var d=await db();await new Promise(function(res,rej){var r=d.transaction('derived','readwrite').objectStore('derived').put(record,ch.id);r.onsuccess=res;r.onerror=function(){rej(r.error);};});delete memoryDerived[ch.id];return true;}catch(e){return false;}
  }
  async function putFigure(key,buf){
    try{var d=await db();await new Promise(function(res,rej){var r=d.transaction('derived','readwrite').objectStore('derived').put(buf,key);r.onsuccess=res;r.onerror=function(){rej(r.error);};});return true;}catch(e){return false;}
  }
  async function getFigure(key){
    try{var d=await db();return await new Promise(function(res,rej){var r=d.transaction('derived').objectStore('derived').get(key);r.onsuccess=function(){res(r.result||null);};r.onerror=function(){rej(r.error);};});}catch(e){return null;}
  }
  async function deleteFigures(id){
    try{var d=await db();await new Promise(function(res){var r=d.transaction('derived','readwrite').objectStore('derived').delete(IDBKeyRange.bound('fig:'+id+':','fig:'+id+':\uffff'));r.onsuccess=res;r.onerror=res;});}catch(e){}
  }
  function saveDerivedSoon(ch){if(!ch||ch.kind!=='pdf')return;clearTimeout(derivedTimers[ch.id]);derivedTimers[ch.id]=setTimeout(function(){delete derivedTimers[ch.id];putDerived(ch);},500);}
  async function getDerived(id){
    try{var d=await db(),saved=await new Promise(function(res,rej){var r=d.transaction('derived').objectStore('derived').get(id);r.onsuccess=function(){res(r.result||null);};r.onerror=function(){rej(r.error);};});if(saved)return saved;}catch(e){}
    return memoryDerived[id]||null;
  }
  function mergeDerivedInto(ch,saved){var changed=false;if(!ch||!saved)return changed;DERIVED_FIELDS.forEach(function(field){var incoming=saved[field],current=ch[field];if(incoming===undefined)return;if(field==='termLookups'&&incoming&&typeof incoming==='object'){var merged=Object.assign({},incoming,current||{});if(Object.keys(merged).length!==Object.keys(current||{}).length){ch[field]=merged;changed=true;}return;}if(current===undefined||current===null||(Array.isArray(incoming)&&(!Array.isArray(current)||incoming.length>current.length))){ch[field]=incoming;changed=true;}});return changed;}
  async function hydrateDerived(ch){
    if(!ch||ch.kind!=='pdf')return ch;var saved=await getDerived(ch.id);if(!saved)return ch;
    mergeDerivedInto(ch,saved);return ch;
  }
  async function deletePdf(id){
    delete memoryPdfs[id];delete memoryDerived[id];clearTimeout(derivedTimers[id]);delete derivedTimers[id];
    try{var d=await db();return Promise.all(['pdfs','derived'].map(function(store){return new Promise(function(res){var r=d.transaction(store,'readwrite').objectStore(store).delete(id);r.onsuccess=res;r.onerror=res;});}));}catch(e){}
  }
  async function backfillPdfFingerprints(){
    var changed=0;for(var i=0;i<state.chapters.length;i++){var ch=state.chapters[i];if(ch.kind!=='pdf'||ch.contentHash)continue;var stored=await getPdf(ch.id);if(!stored)continue;var before=ch.contentHash||'';await rememberPdfFingerprint(ch,stored);if(!before&&ch.contentHash)changed++;}return changed;
  }
  async function copyDuplicateFigures(dropId,keepId,count){var ok=true;for(var i=0;i<(+count||0);i++){var figure=await getFigure('fig:'+dropId+':'+i);if(!figure)continue;if(!await putFigure('fig:'+keepId+':'+i,figure))ok=false;}return ok;}
  function repairDuplicateStorage(){
    if(duplicateRepairInFlight)return duplicateRepairInFlight;
    duplicateRepairInFlight=(async function(){
      var plans=pendingDuplicateStorage.splice(0),retry=[];
      for(var i=0;i<plans.length;i++){
        var plan=plans[i],keep=find(resolvedPaperId(plan.keepId));if(!keep)continue;
        var keepPdf=await getPdf(keep.id),dropPdf=await getPdf(plan.dropId),pdfSafe=!!keepPdf&&!duplicateUnsafeCopies[keep.id];
        if(keepPdf&&duplicateUnsafeCopies[keep.id]){try{pdfSafe=await putPdf(keep.id,await pdfBytes(keepPdf));if(pdfSafe)delete duplicateUnsafeCopies[keep.id];}catch(e){pdfSafe=false;}}
        if(!keepPdf&&dropPdf){try{pdfSafe=await putPdf(keep.id,await pdfBytes(dropPdf));if(!pdfSafe)duplicateUnsafeCopies[keep.id]=true;}catch(e){pdfSafe=false;duplicateUnsafeCopies[keep.id]=true;}}
        if(!dropPdf)pdfSafe=true;
        var keepDerived=await getDerived(keep.id),dropDerived=await getDerived(plan.dropId),derivedSafe=true;if(keepDerived)mergeDerivedInto(keep,keepDerived);
        if(dropDerived){mergeDerivedInto(keep,dropDerived);if(dropDerived.figCount)derivedSafe=await copyDuplicateFigures(plan.dropId,keep.id,dropDerived.figCount);if(derivedSafe)derivedSafe=await putDerived(keep);}
        if(pdfSafe&&derivedSafe){await deletePdf(plan.dropId);await deleteFigures(plan.dropId);}else retry.push(plan);
      }
      retry.forEach(function(plan){queueDuplicateStorage(plan.keepId,plan.dropId);});return plans.length-retry.length;
    })();
    duplicateRepairInFlight=duplicateRepairInFlight.then(function(done){duplicateRepairInFlight=null;return done;},function(error){duplicateRepairInFlight=null;throw error;});return duplicateRepairInFlight;
  }

  /* library */
  function paperHaystack(ch){ return [ch.title,ch.authors,(ch.tags||[]).join(' '),ch.sourceName,ch.sourceUrl].join(' ').toLowerCase(); }
  function connectionsReady(){
    var seen={},linked=false;
    state.chapters.forEach(function(c){(c.tags||[]).forEach(function(t){t=String(t).toLowerCase().trim();if(!t)return;if(seen[t])linked=true;seen[t]=true;});});
    return linked;
  }
  function updateConnectionsNav(){
    var ready=connectionsReady()||!byId('connectionsPage').classList.contains('hidden');
    document.querySelectorAll('.nav-btn[data-view="connectionsPage"]').forEach(function(b){b.classList.toggle('hidden',!ready);});
  }
  function renderDuplicateNotice(){
    var panel=byId('duplicateNotice'),button=byId('cleanDuplicatesBtn'),groups=duplicateGroups(state.chapters,false);
    if(groups.length){var extras=groups.reduce(function(n,group){return n+group.length-1;},0);panel.classList.remove('hidden','done');button.classList.remove('hidden');button.disabled=false;button.textContent='Review & merge';byId('duplicateNoticeTitle').textContent=groups.length+' duplicate '+(groups.length===1?'group':'groups')+' found';byId('duplicateNoticeCopy').textContent=extras+' extra '+(extras===1?'copy looks':'copies look')+' like the same PDF. Notes, highlights and Q&A will be combined before anything is retired.';return;}
    if(duplicateNoticeMessage){panel.classList.remove('hidden');panel.classList.add('done');button.classList.add('hidden');byId('duplicateNoticeTitle').textContent='Library cleaned';byId('duplicateNoticeCopy').textContent=duplicateNoticeMessage;return;}
    panel.classList.add('hidden');panel.classList.remove('done');button.classList.remove('hidden');
  }
  var librarySelectionId=null,LIBRARY_SORT_KEY='readingRoom.librarySort';
  var librarySortMode='touched';
  try{var savedLibrarySort=localStorage.getItem(LIBRARY_SORT_KEY);if(['touched','added','title','author','progress'].indexOf(savedLibrarySort)>=0)librarySortMode=savedLibrarySort;}catch(e){}
  byId('librarySort').value=librarySortMode;
  function shelfPaperStats(ch){
    var highlights=Object.keys(ch.highlights||{}).reduce(function(n,k){return n+(ch.highlights[k]||[]).length;},0)+(ch.textHighlights||[]).length+(ch.readerHighlights||[]).length;
    var notes=Object.keys(ch.notes||{}).length+Object.keys(ch.readerNotes||{}).length+Object.keys(ch.pageNotes||{}).filter(function(k){return ch.pageNotes[k];}).length+highlights;
    var questions=(ch.questions||[]).length,page=+ch.readPage||1,total=ch.kind==='pdf'?(+ch.pageCount||0):paras(ch.fr).length;
    var progress=ch.kind==='pdf'&&total?Math.max(1,Math.min(100,Math.round(page/total*100))):(total?Math.min(100,Math.round(page/total*100)):0);
    return {highlights:highlights,notes:notes,questions:questions,page:page,total:total,progress:progress};
  }
  function shelfDate(ch){
    var stamp=+ch.updatedAt||+ch.addedAt||0;if(!stamp)return 'Waiting to be opened';
    var days=Math.floor((now()-stamp)/86400000);if(days<=0)return 'Touched today';if(days===1)return 'Touched yesterday';if(days<14)return 'Touched '+days+' days ago';
    try{return 'Touched '+new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(new Date(stamp));}catch(e){return 'Ready to return to';}
  }
  function paperVisualHash(ch){
    var seed=String(ch.id||'')+String(ch.title||''),hash=0;for(var i=0;i<seed.length;i++)hash=(hash*33+seed.charCodeAt(i))>>>0;return hash;
  }
  function renderBookPunches(ch,compact){
    var hash=paperVisualHash(ch),startTail=(compact?5:12)+hash%(compact?9:17),endTail=(compact?5:10)+((hash>>>7)%(compact?10:19)),startAngle=-18+((hash>>>13)%37),endAngle=-18+((hash>>>19)%37);
    return '<span class="book-punches" aria-hidden="true" style="--thread-start-tail:'+startTail+'px;--thread-end-tail:'+endTail+'px;--thread-start-angle:'+startAngle+'deg;--thread-end-angle:'+endAngle+'deg"><i></i><i></i><i></i><i></i><i></i></span>';
  }
  function renderTuckedKeepsake(ch,compact){
    var hash=paperVisualHash(ch);
    var specimens=[
      {name:'olive',svg:'<svg viewBox="0 0 100 112" aria-hidden="true"><path class="leaf-line" d="M48 5c7 28 8 62 5 101"/><g class="leaf-fill"><ellipse cx="34" cy="21" rx="15" ry="6" transform="rotate(31 34 21)"/><ellipse cx="63" cy="31" rx="15" ry="6" transform="rotate(-34 63 31)"/><ellipse cx="35" cy="44" rx="16" ry="6" transform="rotate(29 35 44)"/><ellipse cx="65" cy="55" rx="16" ry="6" transform="rotate(-31 65 55)"/><ellipse cx="38" cy="68" rx="15" ry="6" transform="rotate(27 38 68)"/><ellipse cx="64" cy="79" rx="14" ry="6" transform="rotate(-29 64 79)"/></g></svg>'},
      {name:'ginkgo',svg:'<svg viewBox="0 0 100 112" aria-hidden="true"><path class="leaf-fill" d="M50 61C22 65 8 49 15 27 21 9 38 4 50 31 62 4 79 9 85 27 92 49 78 65 50 61Z"/><path class="leaf-line" d="M50 43v59M50 57 24 30M50 57 76 30M50 55 33 16M50 55 67 16"/></svg>'},
      {name:'fern',svg:'<svg viewBox="0 0 84 116" aria-hidden="true"><path class="leaf-line" d="M43 6c-5 30-4 62 0 102"/><g class="leaf-fill"><ellipse cx="31" cy="22" rx="15" ry="5" transform="rotate(28 31 22)"/><ellipse cx="55" cy="31" rx="15" ry="5" transform="rotate(-31 55 31)"/><ellipse cx="28" cy="42" rx="16" ry="5" transform="rotate(27 28 42)"/><ellipse cx="57" cy="52" rx="16" ry="5" transform="rotate(-29 57 52)"/><ellipse cx="30" cy="64" rx="15" ry="5" transform="rotate(25 30 64)"/><ellipse cx="56" cy="75" rx="14" ry="5" transform="rotate(-27 56 75)"/></g></svg>'},
      {name:'willow',svg:'<svg viewBox="0 0 100 116" aria-hidden="true"><path class="leaf-line" d="M52 5c-8 30-5 70 2 104"/><g class="leaf-fill"><ellipse cx="38" cy="21" rx="18" ry="4" transform="rotate(35 38 21)"/><ellipse cx="63" cy="31" rx="19" ry="4" transform="rotate(-43 63 31)"/><ellipse cx="35" cy="43" rx="20" ry="4" transform="rotate(34 35 43)"/><ellipse cx="66" cy="55" rx="20" ry="4" transform="rotate(-40 66 55)"/><ellipse cx="38" cy="68" rx="19" ry="4" transform="rotate(31 38 68)"/><ellipse cx="67" cy="81" rx="17" ry="4" transform="rotate(-36 67 81)"/></g></svg>'},
      {name:'dogwood',svg:'<svg viewBox="0 0 100 116" aria-hidden="true"><path class="leaf-fill" d="M50 7C69 18 79 37 73 56 69 69 59 78 50 88 42 78 31 69 27 56 21 37 31 18 50 7Z"/><path class="leaf-line" d="M50 22v86M49 42 37 31M51 48l14-13M49 59 33 46M51 67l16-15M49 75 37 65"/></svg>'},
      {name:'eucalyptus',svg:'<svg viewBox="0 0 100 116" aria-hidden="true"><path class="leaf-line" d="M46 7c8 27 8 61 5 102"/><g class="leaf-fill"><ellipse cx="33" cy="22" rx="13" ry="10" transform="rotate(28 33 22)"/><ellipse cx="62" cy="35" rx="14" ry="10" transform="rotate(-28 62 35)"/><ellipse cx="34" cy="51" rx="15" ry="11" transform="rotate(25 34 51)"/><ellipse cx="66" cy="67" rx="14" ry="11" transform="rotate(-24 66 67)"/><ellipse cx="38" cy="82" rx="13" ry="10" transform="rotate(22 38 82)"/></g></svg>'},
      {name:'birch',svg:'<svg viewBox="0 0 100 116" aria-hidden="true"><path class="leaf-fill" d="M50 7C77 22 83 48 68 70 61 80 53 84 50 88 47 84 39 80 32 70 17 48 23 22 50 7Z"/><path class="leaf-line" d="M50 24v84M50 43 35 33M50 52l18-14M50 63 31 51M50 71l17-13"/></svg>'},
      {name:'clover',svg:'<svg viewBox="0 0 100 116" aria-hidden="true"><path class="leaf-fill" d="M50 48C35 36 25 25 31 14 38 2 50 13 50 24 50 13 62 2 69 14 75 25 65 36 50 48ZM50 49C35 61 22 64 16 54 9 42 26 35 40 42 30 30 33 16 45 18 57 20 59 34 50 49ZM51 49C66 61 79 64 85 54 92 42 75 35 61 42 71 30 68 16 56 18 44 20 42 34 51 49Z"/><path class="leaf-line" d="M50 45c1 25 3 42 8 64"/></svg>'}
    ];
    var pick=hash%specimens.length,specimen=specimens[pick],right=compact?22+((hash>>>6)%178):64+((hash>>>6)%220),tilt=-28+((hash>>>14)%57),flip=((hash>>>22)&1)?-1:1,variant=compact?' mini':'';
    return '<span class="tucked-keepsake '+specimen.name+variant+'" style="--keepsake-right:'+right+'px;--keepsake-tilt:'+tilt+'deg;--keepsake-flip:'+flip+'">'+specimen.svg+'</span>';
  }
  function shelfThread(selectedIndex,total){
    var y=total<2?260:Math.round(58+(Math.min(selectedIndex,total-1)/(total-1))*404),path='M0 '+y+' C54 '+y+', 57 260, 176 260';
    return '<div class="reading-thread-bridge" aria-hidden="true"><svg class="reading-thread-svg" viewBox="0 0 180 520" preserveAspectRatio="none"><defs><linearGradient id="readingThreadGradient" x1="0" y1="0" x2="180" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:var(--muted);stop-opacity:.24"/><stop offset=".58" style="stop-color:#b89b50;stop-opacity:.62"/><stop offset="1" style="stop-color:var(--yellow)"/></linearGradient></defs><path class="thread-halo" d="'+path+'"/><path class="reading-thread" pathLength="1" d="'+path+'"/><circle class="thread-spark" cx="176" cy="260" r="5.5"/></svg></div>';
  }
  function renderOpenPaper(ch,stats,cover){
    var tags=(ch.tags||[]).slice(0,4),kind=ch.kind==='pdf'?'PDF paper':'text note',source=ch.authors||ch.sourceName||'No authors yet',title=String(ch.title||'Untitled'),titleClass=title.length>118?' very-long':(title.length>72?' long':'');
    var progressLabel=ch.kind==='pdf'?(stats.total?'Page '+stats.page+' of '+stats.total:'Page '+stats.page):(stats.total+' paragraph'+(stats.total===1?'':'s'));
    var detail=document.createElement('div');detail.className='open-book-wrap';detail.id='selectedPaper';detail.setAttribute('aria-live','polite');
    detail.innerHTML='<span class="cover-focus-guide" aria-hidden="true"><span>Focus guide</span></span>'+renderTuckedKeepsake(ch)+'<article class="closed-book" aria-label="Selected paper: '+esc(title)+'">'+renderBookPunches(ch,false)+'<div class="closed-book-inner"><div class="closed-book-kicker">'+esc(kind)+' · personal reading copy</div><h3 class="closed-book-title'+titleClass+'">'+esc(title)+'</h3><p class="closed-book-byline">'+esc(source)+'</p><div class="tag-row paper-tags">'+(tags.length?tags.map(function(t){return '<span class="tag">'+esc(t)+'</span>';}).join(''):'<span class="tag">untagged</span>')+'</div><div class="cover-record"><div class="cover-stat"><span>Marks</span><b>'+stats.notes+'</b></div><div class="cover-stat"><span>Questions</span><b>'+stats.questions+'</b></div><div class="cover-stat"><span>Last opened</span><b>'+esc(shelfDate(ch).replace(/^Touched /,''))+'</b></div></div><div class="cover-progress"><div><span>Reading trail</span><span>'+esc(progressLabel)+'</span></div><div class="cover-progress-track"><i style="--paper-progress:'+stats.progress+'%"></i></div></div><div class="cover-actions"><button class="button open-selected" type="button">Continue reading&nbsp; →</button><button class="soft-button remove-paper" type="button" aria-label="Remove '+esc(title)+' from library">Remove</button></div></div></article>';
    var closed=detail.querySelector('.closed-book'),palette=cover||BOOK_SPINES[0];closed.style.setProperty('--cover',palette.cover);closed.style.setProperty('--cover-ink',palette.ink);
    detail.querySelector('.open-selected').onclick=function(){openReader(ch.id);};
    detail.querySelector('.remove-paper').onclick=function(){removePaper(ch,false);};
    return detail;
  }
  function focusShelfBook(id){
    var books=byId('shelf').querySelectorAll('[data-shelf-paper]');for(var i=0;i<books.length;i++)if(books[i].dataset.shelfPaper===id){try{books[i].focus({preventScroll:true});}catch(e){books[i].focus();}break;}
  }
  function inferredSourceCredit(ch){
    var source=filenameTitle(ch.sourceName||''),yearAt=source.search(/(?:19|20)\d{2}/);
    if(yearAt<2)return '';
    var words=source.slice(0,yearAt).trim().split(/\s+/).filter(function(word){return /^[a-zÀ-ž'’]{2,}$/i.test(word);});
    if(!words.length||words.length>4)return '';
    words=words.map(function(word){return word.charAt(0).toUpperCase()+word.slice(1).toLowerCase();});
    return words.length===2?words.join(' & '):words.join(' ');
  }
  function shelfSpineCredit(ch){
    var credit=String(ch.authors||'').trim();
    if(credit)credit=credit.split(/\s*(?:,|;|·|\band\b)\s*/i)[0];
    else credit=String(ch.journal||ch.venue||ch.publication||'').trim()||inferredSourceCredit(ch)||(ch.kind==='pdf'?'Unknown author':'Personal note');
    return credit.length>18?credit.slice(0,17)+'…':credit;
  }
  function compareShelfPapers(a,b){
    var mode=librarySortMode,cmp=0;
    if(mode==='added')cmp=(+b.addedAt||+b.updatedAt||0)-(+a.addedAt||+a.updatedAt||0);
    else if(mode==='title')cmp=String(a.title||a.sourceName||'Untitled').localeCompare(String(b.title||b.sourceName||'Untitled'),undefined,{sensitivity:'base'});
    else if(mode==='author')cmp=String(a.authors||a.sourceName||'').localeCompare(String(b.authors||b.sourceName||''),undefined,{sensitivity:'base'});
    else if(mode==='progress')cmp=shelfPaperStats(b).progress-shelfPaperStats(a).progress;
    else cmp=(+b.updatedAt||+b.addedAt||0)-(+a.updatedAt||+a.addedAt||0);
    return cmp||String(a.title||'').localeCompare(String(b.title||''),undefined,{sensitivity:'base'});
  }
  function renderShelf(){
    updateConnectionsNav();
    document.body.classList.toggle('has-papers',state.chapters.length>0);
    document.body.classList.add('library-ready');
    var q=byId('librarySearch').value.trim().toLowerCase();
    var list=state.chapters.filter(function(ch){return !q||paperHaystack(ch).includes(q);}).sort(compareShelfPapers);
    byId('libraryCount').textContent=(q?list.length+' of ':'')+state.chapters.length+(state.chapters.length===1?' paper':' papers');renderDuplicateNotice();
    var shelf=byId('shelf');shelf.innerHTML='';
    if(!list.length){shelf.innerHTML='<div class="shelf-empty"><div><b>'+(state.chapters.length?'No paper found':'Your shelf is waiting')+'</b>'+(state.chapters.length?'Try another title, author, or tag.':'Paste a PDF link, drop in a file, or connect a private GitHub folder to place the first book.')+'</div></div>';return;}
    if(!librarySelectionId||!list.some(function(ch){return ch.id===librarySelectionId;}))librarySelectionId=list[0].id;
    var selected=list.find(function(ch){return ch.id===librarySelectionId;})||list[0],stats=shelfPaperStats(selected);
    var caseEl=document.createElement('section');caseEl.className='bookcase';caseEl.setAttribute('aria-label','Paper wall');caseEl.innerHTML='<div class="pile-head"><strong>Reading wall</strong></div>';
    var pile=document.createElement('div');pile.className='book-pile';pile.setAttribute('role','list');
    list.forEach(function(ch,idx){
      var book=document.createElement('button'),isSelected=ch.id===selected.id,visualHash=paperVisualHash(ch),spine=WALL_NOTES[(visualHash>>>1)%WALL_NOTES.length];
      book.type='button';book.className='book-spine'+(isSelected?' is-selected':'');book.dataset.shelfPaper=ch.id;book.setAttribute('aria-pressed',isSelected?'true':'false');book.setAttribute('aria-label',(isSelected?'Open paper: ':'Preview paper: ')+(ch.title||'Untitled'));
      var spineTitle=String(ch.title||'Untitled'),spineLength=spineTitle.length,spineLines=spineLength>118?9:(spineLength>84?8:(spineLength>52?7:(spineLength>30?4:3))),openHeight=60+spineLines*24,openFont=spineLength>118?'1.26rem':(spineLength>84?'1.28rem':(spineLength>52?'1.32rem':(spineLength>30?'1.38rem':'1.48rem'))),noteFont=spineLength>112?'.97rem':(spineLength>82?'1.01rem':(spineLength>54?'1.06rem':'1.14rem'));
      book.title=spineTitle+' — '+(ch.authors||ch.sourceName||'Phloem');book.style.setProperty('--book-accent',spine.cover);book.style.setProperty('--book-ink',spine.ink);book.style.setProperty('--book-height',(47+visualHash%14)+'px');book.style.setProperty('--book-open-height',openHeight+'px');book.style.setProperty('--book-lines',spineLines);book.style.setProperty('--book-open-font',openFont);book.style.setProperty('--note-font',noteFont);book.style.setProperty('--book-width',(82+((visualHash>>>4)%18))+'%');book.style.setProperty('--book-offset',((visualHash>>>9)%23)+'px');book.style.setProperty('--book-tilt',((((visualHash>>>14)%11)-5)*.92)+'deg');book.style.setProperty('--note-height',(184+((visualHash>>>23)%25))+'px');book.style.setProperty('--note-x',((((visualHash>>>18)%29)-14))+'px');book.style.setProperty('--note-y',((((visualHash>>>22)%23)-8))+'px');book.style.setProperty('--note-width',(96+((visualHash>>>25)%13))+'%');book.style.setProperty('--note-justify',['start','center','end'][(visualHash>>>29)%3]);book.style.setProperty('--note-layer',1+((visualHash>>>12)%4));book.style.setProperty('--tape-tilt',((((visualHash>>>27)%11)-5)*.55)+'deg');
      book.innerHTML='<span class="book-title">'+esc(spineTitle)+'</span><span class="book-author">'+esc(shelfSpineCredit(ch))+'</span>';
      book.onclick=function(e){if(ch.id===librarySelectionId){openReader(ch.id);return;}var oldTop=pile.scrollTop,oldLeft=pile.scrollLeft,fromKeyboard=e.detail===0;librarySelectionId=ch.id;renderShelf();var nextPile=byId('shelf').querySelector('.book-pile');if(nextPile){nextPile.scrollTop=oldTop;nextPile.scrollLeft=oldLeft;}if(fromKeyboard)setTimeout(function(){focusShelfBook(ch.id);},0);};pile.appendChild(book);
    });
    caseEl.appendChild(pile);shelf.appendChild(caseEl);shelf.appendChild(renderOpenPaper(selected,stats,BOOK_SPINES[paperVisualHash(selected)%BOOK_SPINES.length]));
  }
  byId('librarySearch').oninput = renderShelf;
  byId('librarySort').onchange=function(){librarySortMode=this.value;try{localStorage.setItem(LIBRARY_SORT_KEY,librarySortMode);}catch(e){}renderShelf();};
  byId('cleanDuplicatesBtn').onclick=async function(){
    var button=this,old=button.textContent;button.disabled=true;button.textContent='Checking PDFs…';await backfillPdfFingerprints();
    var groups=duplicateGroups(state.chapters,false),extras=groups.reduce(function(n,group){return n+group.length-1;},0);
    if(!groups.length){duplicateNoticeMessage='No matching PDF copies remain.';renderDuplicateNotice();return;}
    var names=groups.slice(0,6).map(function(group){var paper=canonicalPaper(group);return '• '+(paper.title||paper.sourceName||'Untitled')+' ('+group.length+' copies)';}).join('\n');
    var question='Merge '+groups.length+' duplicate '+(groups.length===1?'group':'groups')+' and retire '+extras+' extra '+(extras===1?'copy':'copies')+'?\n\n'+names+(groups.length>6?'\n• and '+(groups.length-6)+' more':'')+'\n\nPhloem keeps every note, highlight, tag and saved Q&A. The oldest copy becomes the shared paper ID, and the cleanup follows your normal sync.';
    if(!confirm(question)){button.disabled=false;button.textContent=old;return;}
    button.textContent='Merging safely…';collapseDuplicateGroups(groups);await repairDuplicateStorage();persist();updateReviewBadge();duplicateNoticeMessage='Merged '+extras+' extra '+(extras===1?'copy':'copies')+' without discarding annotations. The cleanup will reach your other devices on their next sync.';clearTimeout(duplicateNoticeTimer);duplicateNoticeTimer=setTimeout(function(){duplicateNoticeMessage='';renderDuplicateNotice();},9000);renderShelf();
  };

  /* Review: everything you marked comes back for a self-test on a spacing schedule.
     Grading yourself honestly is the whole trick — recall beats rereading. */
  var REVIEW_STEPS=[1,3,7,14,30,60], reviewQueue=[], reviewIndex=0;
  function reviewItemList(){
    var items=[];
    state.chapters.forEach(function(ch){
      var rev=ch.reviews||{};
      function push(key,kind,content,extra){
        if(!content||!String(content).trim())return;
        var r=rev[key];extra=extra||{};
        items.push({ch:ch,key:key,kind:kind,content:content,page:extra.page||null,answer:extra.answer||'',due:r?r.due:0,created:extra.at||ch.addedAt||0});
      }
      Object.keys(ch.highlights||{}).forEach(function(pg){(ch.highlights[pg]||[]).forEach(function(h){push('h:'+h.id,'highlight',h.text,{page:+pg,at:h.at,answer:h.note||''});});});
      (ch.textHighlights||[]).concat(ch.readerHighlights||[]).forEach(function(h){push('h:'+h.id,'highlight',h.text,{at:h.at,answer:h.note||''});});
      Object.keys(ch.pageNotes||{}).forEach(function(k){push('pn:'+k,'note',ch.pageNotes[k],{page:+k||null});});
      Object.keys(ch.notes||{}).forEach(function(k){push('n:'+k,'note',ch.notes[k],{});});
      Object.keys(ch.readerNotes||{}).forEach(function(k){push('rn:'+k,'note',ch.readerNotes[k],{});});
      (ch.questions||[]).forEach(function(q){push('q:'+q.id,'qa',q.question,{answer:q.answer,at:q.at});});
    });
    return items;
  }
  function dueReviewList(){
    var ts=now(),day=864e5;
    return reviewItemList().filter(function(it){
      return it.due?it.due<=ts:(it.created||0)<ts-day;
    }).sort(function(a,b){return (a.due||a.created)-(b.due||b.created);});
  }
  function gradeReview(item,good){
    var ch=item.ch;ch.reviews=ch.reviews||{};
    var rec=ch.reviews[item.key]||{streak:0};
    if(good){rec.streak=(rec.streak||0)+1;rec.due=now()+REVIEW_STEPS[Math.min(rec.streak-1,REVIEW_STEPS.length-1)]*864e5;}
    else{rec.streak=0;rec.due=now()+864e5;}
    rec.last=now();ch.reviews[item.key]=rec;touch(ch);
  }
  function updateReviewBadge(){
    document.querySelectorAll('[data-view="reviewPage"]').forEach(function(b){b.textContent='Review';});
    byId('reviewShortcut').textContent='Review notes';
  }
  function renderReview(){
    reviewQueue=dueReviewList().slice(0,20);reviewIndex=0;updateReviewBadge();showReviewCard();
  }
  function showReviewCard(){
    var box=byId('reviewCard'),item=reviewQueue[reviewIndex];
    byId('reviewCount').textContent=item?((reviewIndex+1)+' / '+reviewQueue.length+' due'):'';
    if(!item){box.innerHTML='<div class="empty">Nothing to review right now. Highlights, notes and saved questions ripen into cards a day after you make them.</div>';return;}
    var where=esc(item.ch.title||'Untitled')+(item.page?' · p. '+item.page:'');
    var body=item.kind==='qa'
      ?'<div class="review-q">'+esc(item.content)+'</div><button class="soft-button" id="reviewReveal" type="button">Show the saved answer</button><div class="review-a hidden" id="reviewAnswer">'+esc(item.answer)+'</div>'
      :item.kind==='highlight'
      /* the quote IS the front of the card: recall why it mattered; a note the
         reader attached to the highlight becomes the hidden back to check against */
      ?'<blockquote class="review-quote">'+esc(item.content)+'</blockquote><p class="review-prompt">Why did you mark this? Explain it from memory first.</p>'+(item.answer?'<button class="soft-button" id="reviewReveal" type="button">Reveal my note</button><div class="review-a hidden" id="reviewAnswer">'+esc(item.answer)+'</div>':'')
      /* but a note shown up front would grade itself — hide it until recalled */
      :'<p class="review-prompt">You left yourself a note here. Say it from memory — then check.</p><button class="soft-button" id="reviewReveal" type="button">Reveal my note</button><blockquote class="review-quote hidden" id="reviewAnswer">'+esc(item.content)+'</blockquote>';
    box.innerHTML='<article class="review-card"><span class="review-eyebrow">'+(item.kind==='qa'?'Saved question':item.kind==='highlight'?'Highlight':'Note')+' · '+where+'</span>'+body+
      '<div class="review-actions"><button class="text-button" id="reviewOpen" type="button">Show in paper</button><span class="spacer"></span><button class="soft-button" id="reviewAgain" type="button">Fuzzy · tomorrow</button><button class="button" id="reviewGood" type="button">Got it</button></div></article>';
    var reveal=byId('reviewReveal');
    if(reveal)reveal.onclick=function(){byId('reviewAnswer').classList.remove('hidden');this.classList.add('hidden');};
    byId('reviewOpen').onclick=function(){openReader(item.ch.id).then(function(){if(item.page)gotoPdfPage(item.page);});};
    byId('reviewAgain').onclick=function(){gradeReview(item,false);nextReviewCard();};
    byId('reviewGood').onclick=function(){gradeReview(item,true);nextReviewCard();};
  }
  function nextReviewCard(){
    reviewIndex++;
    if(reviewIndex>=reviewQueue.length){
      byId('reviewCard').innerHTML='<div class="empty">Done — '+reviewQueue.length+' reviewed. Come back tomorrow; spacing is the point.</div>';
      byId('reviewCount').textContent='';updateReviewBadge();return;
    }
    showReviewCard();
  }
  byId('reviewShortcut').onclick=function(){showPage('reviewPage');};
  byId('importPdfBtn').onclick = function(){ if(location.protocol==='file:'){ byId('launchDialog').showModal(); return; } byId('pdfFile').click(); };
  byId('pdfFile').onchange = function(){ var files=Array.prototype.slice.call(this.files||[]); this.value=''; if(files.length)importDropped([],files); };
  byId('folderPickBtn').onclick = function(){ if(location.protocol==='file:'){ byId('launchDialog').showModal(); return; } byId('pdfFolder').click(); };
  byId('pdfFolder').onchange = function(){ var files=Array.prototype.slice.call(this.files||[]); this.value=''; if(files.length)importDropped([],files); };
  if(!('webkitdirectory' in byId('pdfFolder')))byId('folderPickBtn').classList.add('hidden');
  byId('linkImportBtn').onclick=function(){
    byId('pdfUrlStatus').textContent='';byId('linkDialog').showModal();setTimeout(function(){byId('pdfUrl').focus();},0);
  };

  function cleanPdfUrl(value){
    var match=String(value||'').trim().match(/https?:\/\/[^\s]+/i);if(!match)return '';
    try{var url=new URL(match[0]);return /^https?:$/.test(url.protocol)?url.href:'';}catch(e){return '';}
  }
  function pdfNameFromResponse(url,response){
    var disposition=response.headers.get('content-disposition')||'',match=disposition.match(/filename\*=UTF-8''([^;]+)/i)||disposition.match(/filename="?([^";]+)"?/i),name='';
    if(match)try{name=decodeURIComponent(match[1]);}catch(e){name=match[1];}
    if(!name)try{name=decodeURIComponent(new URL(response.url||url).pathname.split('/').filter(Boolean).pop()||'paper.pdf');}catch(e){name='paper.pdf';}
    name=name.replace(/[\\/:*?"<>|]+/g,'-').trim()||'paper.pdf';if(!/\.pdf$/i.test(name))name+='.pdf';return name;
  }
  function looksLikePdf(bytes){
    var head=new Uint8Array(bytes,0,Math.min(1024,bytes.byteLength)),text='';for(var i=0;i<head.length;i++)text+=String.fromCharCode(head[i]);return text.indexOf('%PDF-')>=0;
  }
  async function importPdfUrl(value){
    var url=cleanPdfUrl(value),input=byId('pdfUrl'),btn=byId('pdfUrlBtn'),status=byId('pdfUrlStatus');
    if(!url){status.textContent='Paste a complete http:// or https:// link.';input.focus();return false;}
    if(location.protocol==='file:'){byId('launchDialog').showModal();return false;}
    var old=btn.textContent;btn.disabled=true;input.disabled=true;status.textContent='Downloading the PDF once…';
    try{
      var response=await fetch(url,{redirect:'follow'});if(!response.ok)throw new Error('That link returned '+response.status+'.');
      var bytes=await response.arrayBuffer();if(!looksLikePdf(bytes))throw new Error('That link opened a web page instead of a PDF. Copy the site’s “Download PDF” link.');
      var name=pdfNameFromResponse(url,response);status.textContent='Adding '+name+' to this device…';
      var added=await importPdf(new File([bytes],name,{type:'application/pdf'}),'',url,btn);if(!added)return false;
      input.value='';status.textContent='Saved locally. You will not need that link again on this device.';return true;
    }catch(e){
      status.textContent=e instanceof TypeError?'That site blocked direct importing. Download the PDF there, then drop the file here.':(e.message||'Could not import that PDF link.');return false;
    }finally{btn.disabled=false;input.disabled=false;btn.textContent=old;}
  }
  async function submitPdfUrl(){if(await importPdfUrl(byId('pdfUrl').value)&&byId('linkDialog').open)byId('linkDialog').close();}
  byId('pdfUrlBtn').onclick=submitPdfUrl;
  byId('pdfUrl').onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();submitPdfUrl();}};
  byId('pdfUrl').onpaste=function(e){var text=e.clipboardData&&e.clipboardData.getData('text/plain'),url=cleanPdfUrl(text);if(!url)return;e.preventDefault();this.value=url;submitPdfUrl();};
  (function setupLibraryDrop(){
    var drop=byId('pdfLinkDrop');
    drop.ondragover=function(e){e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';drop.classList.add('drag');};
    drop.ondragleave=function(e){if(!drop.contains(e.relatedTarget))drop.classList.remove('drag');};
    drop.ondrop=function(e){
      e.preventDefault();drop.classList.remove('drag');var transfer=e.dataTransfer;if(!transfer)return;
      /* Entries must be grabbed synchronously during the event — they die with it. */
      var entries=[];
      if(transfer.items)for(var i=0;i<transfer.items.length;i++){var entry=transfer.items[i].webkitGetAsEntry&&transfer.items[i].webkitGetAsEntry();if(entry)entries.push(entry);}
      var files=Array.prototype.slice.call(transfer.files||[]);
      if(entries.length||files.length){importDropped(entries,files);return;}
      var value=transfer.getData('text/uri-list')||transfer.getData('text/plain');byId('pdfUrl').value=cleanPdfUrl(value)||value||'';byId('pdfUrlStatus').textContent='';byId('linkDialog').showModal();
    };
  })();
  /* A whole folder can land on the drop zone: walk it (subfolders too), pull out the
     PDFs, and import them one by one with a running count. Capped at 40 per drop. */
  var DROP_PDF_CAP=40;
  function entryFile(entry){return new Promise(function(res,rej){entry.file(res,rej);});}
  function readAllEntries(reader){return new Promise(function(res,rej){var all=[];(function next(){reader.readEntries(function(batch){if(!batch.length)return res(all);all=all.concat(batch);next();},rej);})();});}
  async function collectPdfEntries(entry,found,depth){
    if(found.length>=DROP_PDF_CAP||depth>6)return;
    if(entry.isFile){if(/\.pdf$/i.test(entry.name))found.push(entry);return;}
    if(entry.isDirectory){
      try{var children=await readAllEntries(entry.createReader());}catch(e){return;}
      for(var i=0;i<children.length&&found.length<DROP_PDF_CAP;i++)await collectPdfEntries(children[i],found,depth+1);
    }
  }
  async function importDropped(entries,files){
    var status=byId('libraryImportStatus'),pdfFiles=[];
    try{
      if(entries.length){
        var found=[];status.textContent='Looking through the drop…';
        for(var i=0;i<entries.length;i++)await collectPdfEntries(entries[i],found,0);
        for(var j=0;j<found.length;j++){try{pdfFiles.push(await entryFile(found[j]));}catch(e){}}
      }else{
        pdfFiles=files.filter(function(f){return f.type==='application/pdf'||/\.pdf$/i.test(f.name);});
        if(pdfFiles.length>DROP_PDF_CAP){status.textContent='Importing the first '+DROP_PDF_CAP+' of '+pdfFiles.length+' PDFs…';pdfFiles=pdfFiles.slice(0,DROP_PDF_CAP);}
      }
    }catch(e){}
    if(!pdfFiles.length){status.textContent='No PDFs in that drop — a PDF file, a folder of PDFs, or a direct link all work.';return;}
    if(pdfFiles.length===1){status.textContent='';importPdf(pdfFiles[0]);return;}
    var ok=0;
    for(var k=0;k<pdfFiles.length;k++){
      status.textContent='Importing '+(k+1)+' / '+pdfFiles.length+' · '+pdfFiles[k].name;
      try{if(await importPdf(pdfFiles[k],null,null,null,true))ok++;}catch(e){}
    }
    status.textContent='Imported '+ok+' of '+pdfFiles.length+' papers.';
  }
  document.addEventListener('paste',function(e){
    if(byId('libraryPage').classList.contains('hidden')||!e.clipboardData||e.target===byId('pdfUrl')||/^(INPUT|TEXTAREA)$/.test(e.target.tagName)||e.target.isContentEditable)return;
    var url=cleanPdfUrl(e.clipboardData.getData('text/plain'));if(!url)return;e.preventDefault();byId('pdfUrl').value=url;importPdfUrl(url);
  });

  function preparePdfCompatibility(){
    if(!Promise.withResolvers)Promise.withResolvers=function(){var resolve,reject,promise=new Promise(function(ok,no){resolve=ok;reject=no;});return{promise:promise,resolve:resolve,reject:reject};};
    if(typeof AbortSignal!=='undefined'&&!AbortSignal.any)AbortSignal.any=function(signals){var controller=new AbortController();function abort(signal){try{controller.abort(signal.reason);}catch(e){controller.abort();}}(signals||[]).some(function(signal){if(signal.aborted){abort(signal);return true;}signal.addEventListener('abort',function(){abort(signal);},{once:true});return false;});return controller.signal;};
  }
  async function loadPdfLib(){
    if(pdfLib)return pdfLib;preparePdfCompatibility();
    try{pdfLib=await import('/vendor/pdfjs/pdf.min.js');pdfLib.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.compat.js';return pdfLib;}
    catch(e){throw new Error('The PDF engine could not start in this browser. Update iOS or open Phloem in Safari, then try again.');}
  }
  function contentLayout(content){
    var lines=[],line=null;
    function finish(){
      if(line&&line.text.trim()){
        var lead=line.text.length-line.text.replace(/^\s+/,'').length;
        line.text=line.text.replace(/\s+/g,' ').trim();
        if(lead)line.runs.forEach(function(r){r[0]=Math.max(0,r[0]-lead);r[1]=Math.max(0,r[1]-lead);});
        line.runs=line.runs.filter(function(r){return r[1]>r[0]&&r[2];});
        lines.push(line);
      }
      line=null;
    }
    (content.items||[]).forEach(function(item){
      var part=String(item.str||''),tr=item.transform||[],x=Number.isFinite(+tr[4])?+tr[4]:0,y=Number.isFinite(+tr[5])?+tr[5]:0,height=Math.max(1,Math.abs(+item.height||+tr[3]||+tr[0]||10)),width=Math.max(0,+item.width||part.length*height*.45);
      if(part){
        if(line&&Math.abs(y-line.y)>Math.max(2,height*.55))finish();
        if(!line)line={text:'',x:x,y:y,endX:x,height:height,runs:[]};
        var gap=line?x-line.endX:0;
        if(line.text&&!/\s$/.test(line.text)&&!/^[,.;:!?%)\]]/.test(part)&&gap>height*.12)line.text+=' ';
        var font=item.fontName||'',start=line.text.length;
        line.text+=part;
        if(font){
          var last=line.runs[line.runs.length-1];
          if(last&&last[2]===font&&last[1]>=start-1)last[1]=line.text.length;
          else line.runs.push([start,line.text.length,font]);
        }
        line.x=Math.min(line.x,x);line.endX=Math.max(line.endX,x+width);line.height=Math.max(line.height,height);
      }
      if(item.hasEOL)finish();
    });
    finish();return lines;
  }
  function contentToLines(content){return contentLayout(content).map(function(line){return line.text;});}
  function layoutMedian(values){var a=values.filter(function(n){return Number.isFinite(n)&&n>0;}).sort(function(x,y){return x-y;});return a.length?a[Math.floor(a.length/2)]:0;}
  /* Two-column pages read left column first, then right — like a human. Lines that span
     the width (titles, full-width figures) act as separators between banded blocks. */
  function orderColumns(lines){
    if(lines.length<8)return lines;
    var left=Math.min.apply(null,lines.map(function(l){return l.x;}));
    var right=Math.max.apply(null,lines.map(function(l){return l.endX;}));
    var pageW=right-left;if(pageW<200)return lines;
    var mid=left+pageW/2,leftBand=0,rightBand=0;
    lines.forEach(function(l){
      var w=l.endX-l.x;
      if(w<pageW*.58){if(l.x+w/2<mid)leftBand++;else rightBand++;}
    });
    if(leftBand<lines.length*.25||rightBand<lines.length*.2)return lines;
    var out=[],bufL=[],bufR=[];
    function flushBands(){out.push.apply(out,bufL);out.push.apply(out,bufR);bufL=[];bufR=[];}
    lines.forEach(function(l){
      var w=l.endX-l.x;
      if(w>=pageW*.58){flushBands();out.push(l);}
      else if(l.x+w/2<mid)bufL.push(l);
      else bufR.push(l);
    });
    flushBands();
    return out;
  }
  /* Paragraph objects: {t:text, k:kind(''|h1|h2|h3|cap), r:[[start,end,flags]...]} with
     run offsets valid inside t. Kind comes from font size against the body size when
     known, with the old shape-regex as the fallback. */
  function layoutToParagraphs(lines,bodySize,vocab){
    if(!lines.length)return[];
    lines=orderColumns(lines);
    var height=layoutMedian(lines.map(function(l){return l.height;}))||10,width=layoutMedian(lines.map(function(l){return l.endX-l.x;}))||200;
    var gaps=[];for(var g=0;g<lines.length-1;g++){var dy=lines[g].y-lines[g+1].y;if(dy>height*.45&&dy<height*3)gaps.push(dy);}
    var normalGap=layoutMedian(gaps)||height*1.15,out=[],current='',runs=[],curSize=0,curAllBold=true,curLines=0;
    var body=bodySize||height;
    function shapeHeading(text){return text.length<90&&(/^[A-Z][A-Z\s\d:.,&()/-]{4,}$/.test(text)||/^\d+(?:\.\d+)*\s+[A-Z]/.test(text));}
    function mathy(text){return /[=∑∏∫∂≤≥≈≠∈∇⊤←→↦∥]|\|\|/.test(text);}
    function kindOf(text,size,allBold,lineCount){
      var capShape=/^[^\s(]?(?:figure|fig\.|table|scheme)\s?\d+(?:\.\d+)*(?!\.?\d)/i.test(text);
      if(capShape)return (/^.?(?:FIGURE|TABLE|SCHEME)\s?\d/.test(text)||/^[^\s(]?(?:figure|fig\.|table|scheme)\s?\d+(?:\.\d+)*(?!\.?\d)\s*[.:|]/i.test(text)||size<=body*.96)?'cap':'';
      if(lineCount<=3&&text.length<200&&!mathy(text)){
        if(size>=body*1.45)return 'h1';
        if(size>=body*1.24)return 'h2';
        if(size>=body*1.12||(allBold&&text.length<90))return 'h3';
      }
      return shapeHeading(text)?'h3':'';
    }
    function flush(){
      var t=current.replace(/\s+/g,' ').trim();
      if(t)out.push({t:t,k:kindOf(t,curSize,curAllBold&&runs.length>0,curLines),r:runs.filter(function(r){return r[1]>r[0];})});
      current='';runs=[];curSize=0;curAllBold=true;curLines=0;
    }
    function appendLine(line){
      var offset;
      if(current&&/[-‐‑­]$/.test(current)){
        /* Line-break hyphen: join solid ("veri-"+"fied") or keep the hyphen
           ("nitrogen-"+"fixing") by checking which form the paper itself uses. */
        var leftWord=(current.match(/[A-Za-z0-9à-öø-ÿ]+(?=[-‐‑­]$)/)||[''])[0];
        var rightWord=(line.text.match(/^[A-Za-z0-9à-öø-ÿ]+/)||[''])[0];
        var keep=false;
        if(leftWord&&rightWord&&vocab){
          var solid=(leftWord+rightWord).toLowerCase(),hyph=(leftWord+'-'+rightWord).toLowerCase();
          keep=vocab[solid]?false:vocab[hyph]?true:/^[A-Z0-9]/.test(line.text);
        }
        if(keep){current=current.replace(/[‐‑­]$/,'-');offset=current.length;}
        else{current=current.slice(0,-1);offset=current.length;}
      }
      else if(current){current+=' ';offset=current.length;}
      else offset=0;
      current+=line.text;
      (line.runs||[]).forEach(function(r){runs.push([offset+r[0],offset+r[1],r[2]]);});
      var covered=(line.runs||[]).reduce(function(n,r){return n+(r[2]&1?r[1]-r[0]:0);},0);
      if(covered<line.text.length*.8)curAllBold=false;
      curSize=Math.max(curSize,line.height);curLines++;
    }
    lines.forEach(function(line,i){
      var next=lines[i+1],text=line.text;
      var bigness=line.height>=body*1.12,headingish=shapeHeading(text)||bigness&&text.length<200;
      if(headingish&&!current){appendLine(line);
        var nextClose=next&&Math.abs(next.height-line.height)<line.height*.12&&(line.y-next.y)<line.height*2.2&&(shapeHeading(next.text)||next.height>=body*1.12);
        if(!nextClose)flush();
        return;}
      appendLine(line);
      if(!next){flush();return;}
      var nextHeading=shapeHeading(next.text)||next.height>=body*1.12&&next.text.length<200;
      var dy=line.y-next.y,columnReset=dy<-(height*2)&&Math.abs(next.x-line.x)>height*3;
      var extraGap=dy>normalGap*1.38,indented=next.x-line.x>Math.max(6,height*.65);
      var shortFinish=(line.endX-line.x)<width*.72&&/[.!?][”"')\]]?$/.test(text);
      /* A superscript (strain names like nifD⁻) can push the rest of its sentence onto
         an offset line starting with "-)" or a bare closer — never a real paragraph. */
      var continuation=/^[)\]},;]|^-[)\]},;]/.test(next.text);
      if(nextHeading||columnReset)flush();
      else if((extraGap||indented||shortFinish)&&!continuation)flush();
    });
    return out;
  }
  function boundaryKey(line){return String(line||'').toLowerCase().replace(/\d+/g,'#').replace(/[^a-z#]+/g,' ').trim();}
  function paraEntry(p){return typeof p==='string'?{t:p,k:'',r:[]}:(p&&p.t!==undefined?p:{t:String(p||''),k:'',r:[]});}
  function readerStructure(pageLines,pageParagraphs){
    var counts={};
    (pageLines||[]).forEach(function(lines){var seen={};lines.slice(0,3).concat(lines.slice(-3)).forEach(function(line){var key=boundaryKey(line);if(key.length>3&&!seen[key]){counts[key]=(counts[key]||0)+1;seen[key]=true;}});});
    function noise(line,index,total){if(/^(?:figure|fig\.?|table|scheme)\s?\d/i.test(line))return false;if((line.match(/\.\s?\.\s?\./g)||[]).length>=2&&/\d\s*$/.test(line))return true;var key=boundaryKey(line);return /^\s*(?:\d+|[ivxlcdm]+)\s*$/i.test(line)||/^(?:doi\s*:|https?:\/\/doi\.)/i.test(line)||/(?:copyright|all rights reserved|downloaded from|terms of use)/i.test(line)||((index<3||index>=total-3)&&(counts[key]||0)>=2);}
    var cleaned=(pageLines||[]).map(function(lines){return lines.filter(function(line,i){return line&&!noise(line,i,lines.length);});});
    var pages=[],meta=[];
    cleaned.forEach(function(lines,pageIndex){
      var layoutParagraphs=pageParagraphs&&pageParagraphs[pageIndex];
      if(layoutParagraphs&&layoutParagraphs.length){
        var kept=layoutParagraphs.map(paraEntry).filter(function(p,i){return p.t&&!noise(p.t,i,layoutParagraphs.length);});
        pages.push(kept.map(function(p){return p.t;}).join('\n\n'));
        if(pages[pages.length-1])kept.forEach(function(p){meta.push(p);});
        return;
      }
      /* A paragraph's last line is usually visibly shorter than the column, so compare each
         line against this page's median width instead of splitting at every sentence end. */
      var lengths=lines.map(function(l){return l.length;}).sort(function(a,b){return a-b;});
      var median=lengths.length?lengths[Math.floor(lengths.length/2)]:0;
      var breakBelow=Math.max(40,median*.82);
      var out=[],current='';
      lines.forEach(function(line){
        var heading=line.length<90&&(/^[A-Z][A-Z\s\d:.-]{4,}$/.test(line)||/^\d+(?:\.\d+)*\s+[A-Z]/.test(line));
        if(heading){if(current){out.push(current);current='';}out.push(line);return;}
        if(current)current=/[-­]$/.test(current)?current.replace(/[-­]$/,'')+line:current+' '+line;else current=line;
        var sentence=/[.!?][”"')\]]?$/.test(line),short=line.length<breakBelow;
        if(sentence&&(short||current.length>700)){out.push(current);current='';}
      });
      if(current)out.push(current);
      pages.push(out.join('\n\n'));
      if(pages[pages.length-1])out.forEach(function(t){meta.push({t:t,k:'',r:[]});});
    });
    return {pages:pages,meta:meta};
  }
  function readerPagesFromLines(pageLines,pageParagraphs){return readerStructure(pageLines,pageParagraphs).pages;}
  function readerTextFromPages(pageLines,pageParagraphs){return readerPagesFromLines(pageLines,pageParagraphs).filter(Boolean).join('\n\n');}
  function migrateReaderAnchors(ch,oldText,newText){
    if(!oldText||oldText===newText)return;var oldParas=paras(oldText),newParas=paras(newText);if(!newParas.length)return;
    function words(text){var set={};String(text||'').toLowerCase().match(/[a-zà-öø-ÿ]{4,}/g)?.forEach(function(w){set[w]=true;});return set;}
    function closest(oldIndex){
      var source=oldParas[oldIndex]||'',needle=source.replace(/\s+/g,' ').trim().slice(0,90).toLowerCase(),direct=-1;
      if(needle.length>24)newParas.some(function(p,i){if(p.toLowerCase().includes(needle)){direct=i;return true;}return false;});if(direct>=0)return direct;
      var sourceWords=words(source),best=Math.min(oldIndex,newParas.length-1),score=0;newParas.forEach(function(p,i){var candidate=words(p),hit=0,total=0;Object.keys(sourceWords).forEach(function(w){total++;if(candidate[w])hit++;});var next=total?hit/total:0;if(next>score){score=next;best=i;}});return best;
    }
    var migratedNotes={};Object.keys(ch.readerNotes||{}).forEach(function(key){var target=closest(+key),note=ch.readerNotes[key];migratedNotes[target]=migratedNotes[target]?migratedNotes[target]+'\n'+note:note;});ch.readerNotes=migratedNotes;
    (ch.readerHighlights||[]).forEach(function(mark){var quote=String(mark.text||''),found=-1,offset=-1;newParas.some(function(p,i){var at=p.indexOf(quote);if(at>=0){found=i;offset=at;return true;}return false;});if(found<0)found=closest(mark.para||0);mark.para=found;if(offset>=0){mark.start=offset;mark.end=offset+quote.length;}});
  }
  /* Bump when layout-aware segmentation changes; anchored notes/highlights are remapped. */
  var READER_V=5;
  function refreshReaderSegmentation(ch){
    /* Only repairs ancient pre-v3 text; the v4 structured rebuild needs the open PDF
       and happens in ensureReaderData, so this must never stamp v4 on its own. */
    if(!ch||ch.kind!=='pdf'||!ch.pageLines||(ch.readerV||0)>=3)return;
    if(!ch.pageParagraphs)return;
    var rebuilt=readerTextFromPages(ch.pageLines,ch.pageParagraphs);
    if(rebuilt){migrateReaderAnchors(ch,ch.readerText||'',rebuilt);ch.readerText=rebuilt;}
    ch.readerV=3;ch.focusPara=null;delete ch.readerScroll;saveDerivedSoon(ch);persist(false);
  }
  function readerSourceText(ch){return !ch?'':ch.kind==='pdf'?(ch.readerText||readerTextFromPages(ch.pageLines||[],ch.pageParagraphs||[])||ch.fr||''):(ch.fr||'');}
  async function ensureReaderData(doc,ch){
    if(ch.readerText&&ch.pageLines&&ch.pageParagraphs&&ch.readerV===READER_V)return ch.readerText;if(readerBuildPromises[ch.id])return readerBuildPromises[ch.id];
    readerBuildPromises[ch.id]=(async function(){
      var oldText=ch.readerText||'',layouts=[],pageDims=[];
      for(var p=1;p<=doc.numPages;p++){
        var pg=await doc.getPage(p),content=await pg.getTextContent();
        layouts.push(contentLayout(content));
        var vp=pg.getViewport({scale:1});pageDims.push([vp.width,vp.height]);
      }
      /* Body size = the font size carrying the most characters across the paper. */
      var sizeWeight={};layouts.forEach(function(ls){ls.forEach(function(l){var k=(Math.round(l.height*2)/2).toFixed(1);sizeWeight[k]=(sizeWeight[k]||0)+l.text.length;});});
      var body=10,best=0;Object.keys(sizeWeight).forEach(function(k){if(sizeWeight[k]>best){best=sizeWeight[k];body=+k;}});
      /* Real font names only exist after a render; one tiny render of pages 1-2 resolves
         the document-shared font objects, and their names reveal Bold and Italic. */
      var fontFlags={};
      try{
        var seen={};layouts.forEach(function(ls){ls.forEach(function(l){(l.runs||[]).forEach(function(r){if(typeof r[2]==='string')seen[r[2]]=1;});});});
        var samplePages=[1,2];
        if(doc.numPages>4)[.15,.35,.55,.75,.92].forEach(function(f){var p=Math.max(3,Math.round(doc.numPages*f));if(samplePages.indexOf(p)<0)samplePages.push(p);});
        for(var fp=0;fp<samplePages.length;fp++){
          if(samplePages[fp]>doc.numPages)continue;
          var fpg=await doc.getPage(samplePages[fp]),fvp=fpg.getViewport({scale:.12});
          var fc=document.createElement('canvas');fc.width=Math.ceil(fvp.width);fc.height=Math.ceil(fvp.height);
          await fpg.render({canvasContext:fc.getContext('2d'),viewport:fvp}).promise;
          var missing=0;
          Object.keys(seen).forEach(function(fontName){
            if(fontFlags[fontName]!==undefined)return;
            try{
              var fo=fpg.commonObjs.get(fontName),real=(fo&&(fo.name||fo.loadedName))||'';
              fontFlags[fontName]=(/bold|black|heavy|semibold|demi|-bd\b|\.b$|\.bi$/i.test(real)?1:0)|(/italic|oblique|-it\b|\.i$|\.bi$/i.test(real)?2:0);
            }catch(unresolved){missing++;}
          });
          if(!missing)break;
        }
      }catch(fontPass){}
      layouts.forEach(function(ls){ls.forEach(function(l){
        var flat=[];(l.runs||[]).forEach(function(r){
          var flags=typeof r[2]==='string'?(fontFlags[r[2]]||0):r[2];
          if(!flags)return;
          var last=flat[flat.length-1];
          if(last&&last[2]===flags&&last[1]>=r[0]-1)last[1]=Math.max(last[1],r[1]);
          else flat.push([r[0],r[1],flags]);
        });
        l.runs=flat;
      });});
      /* Every word the paper uses mid-line, so hyphenated line breaks can be
         resolved by example: does "gram-positive" or "grampositive" actually occur? */
      var vocab={};
      layouts.forEach(function(ls){ls.forEach(function(l){
        var m=l.text.toLowerCase().match(/[a-z0-9à-öø-ÿ]+(?:-[a-z0-9à-öø-ÿ]+)*/g);
        if(m)m.forEach(function(w){vocab[w]=1;});
      });});
      var lines=[],paragraphs=[],pages=[];
      layouts.forEach(function(layout){
        var pageLines=layout.map(function(l){return l.text;});
        lines.push(pageLines);paragraphs.push(layoutToParagraphs(layout,body,vocab));pages.push(pageLines.join(' '));
      });
      var rebuilt=readerTextFromPages(lines,paragraphs)||pages.join('\n\n');
      migrateReaderAnchors(ch,oldText,rebuilt);
      ch.pageLines=lines;ch.pageParagraphs=paragraphs;ch.pageTexts=pages;ch.readerText=rebuilt;ch.readerV=READER_V;ch.fr=pages.join('\n\n');
      try{ch.figCount=await buildFigures(doc,ch,layouts,paragraphs,pageDims,body);}catch(figError){ch.figCount=0;}
      ch.focusPara=null;delete ch.readerScroll;ch.updatedAt=now();saveDerivedSoon(ch);persist();
      return ch.readerText;
    })().finally(function(){delete readerBuildPromises[ch.id];});
    return readerBuildPromises[ch.id];
  }
  /* Figures without decoding a single embedded image: a caption line anchors a crop of
     the rendered page. The whitespace between the caption and the text above it, within
     the caption's column band, is the figure. Tables crop the region below instead. */
  var FIGURE_CAP=120;
  async function buildFigures(doc,ch,layouts,paragraphs,pageDims,body){
    var figIndex=0;
    for(var pageIdx=0;pageIdx<paragraphs.length&&figIndex<FIGURE_CAP;pageIdx++){
      var caps=paragraphs[pageIdx].filter(function(p){return p.k==='cap';});
      if(!caps.length)continue;
      var layout=layouts[pageIdx],dims=pageDims[pageIdx],pageW=dims[0],pageH=dims[1];
      var scale=Math.min(1.6,1300/pageW),canvas=null;
      for(var c=0;c<caps.length&&figIndex<FIGURE_CAP;c++){
        var cap=caps[c],capLine=null;
        for(var li=0;li<layout.length;li++){
          var lt=layout[li].text;
          if(lt.length>=6&&cap.t.indexOf(lt)===0&&/^[^\s(]?(fig|table|scheme)/i.test(lt)){capLine=layout[li];break;}
          if(lt.length>=6&&lt.toLowerCase().indexOf(cap.t.slice(0,Math.min(24,cap.t.length)).toLowerCase())===0){capLine=layout[li];break;}
        }
        if(!capLine)continue;
        var below=/^[^\s(]?table/i.test(cap.t);
        var mid=pageW/2,capCenter=(capLine.x+capLine.endX)/2,capW=capLine.endX-capLine.x;
        var band=capW<pageW*.55?(capCenter<mid?[Math.max(0,capLine.x-14),mid+6]:[mid-6,Math.min(pageW,capLine.endX+14)]):[Math.max(0,capLine.x-14),Math.min(pageW,capLine.endX+14)];
        /* nearest text line vertically on the figure side, inside the band */
        var edge=below?0:pageH,found=false;
        layout.forEach(function(l){
          if(l===capLine)return;
          if(l.height<body*.82||(l.endX-l.x)<(band[1]-band[0])*.28)return;
          var lc=(l.x+l.endX)/2;if(lc<band[0]||lc>band[1])return;
          if(below){if(l.y<capLine.y-capLine.height&&l.y>edge){edge=l.y;found=true;}}
          else{if(l.y>capLine.y+capLine.height&&(edge===pageH||l.y<edge)){edge=l.y;found=true;}}
        });
        var top,bottom; /* PDF coords: y grows upward */
        if(below){top=capLine.y-capLine.height*.9;bottom=found?edge+8:Math.max(0,top-260);}
        else{bottom=capLine.y+capLine.height*1.4;top=found?edge-10:Math.min(pageH,bottom+260);}
        var hPts=top-bottom;
        if(hPts<36||hPts>pageH*.92)continue;
        if(!canvas){
          var pg=await doc.getPage(pageIdx+1),vp=pg.getViewport({scale:scale});
          canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
          await pg.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
        }
        var regionLo=Math.min(top,bottom),regionHi=Math.max(top,bottom),blocked=false;
        layout.forEach(function(l){
          if(l===capLine)return;
          if(l.height<body*.82||(l.endX-l.x)<pageW*.15)return;
          var lc=(l.x+l.endX)/2;
          if(lc>=band[0]&&lc<=band[1])return;
          if(l.y>regionLo&&l.y<regionHi)blocked=true;
        });
        if(!blocked){
          var minX=pageW,maxX=0;layout.forEach(function(l){minX=Math.min(minX,l.x);maxX=Math.max(maxX,l.endX);});
          band=[Math.max(0,minX-10),Math.min(pageW,maxX+10)];
        }
        var sx=Math.max(0,band[0]*scale),sw=Math.min(canvas.width-sx,(band[1]-band[0])*scale);
        var sy=Math.max(0,(pageH-top)*scale),sh=Math.min(canvas.height-sy,hPts*scale);
        if(sw<60||sh<40)continue;
        var crop=document.createElement('canvas');crop.width=Math.round(sw);crop.height=Math.round(sh);
        crop.getContext('2d').drawImage(canvas,sx,sy,sw,sh,0,0,crop.width,crop.height);
        var blob=await new Promise(function(res){crop.toBlob(res,'image/jpeg',.85);});
        if(!blob)continue;
        var buf=await blob.arrayBuffer();
        if(await putFigure('fig:'+ch.id+':'+figIndex,buf)){cap.f=figIndex;figIndex++;}
      }
      canvas=null;
    }
    return figIndex;
  }
  /* The real title lives inside the PDF: document metadata when it is sane, otherwise
     the largest text near the top of page one. Filenames are the fallback, not the name. */
  function filenameTitle(name){return String(name||'').replace(/\.pdf$/i,'').replace(/[_-]+/g,' ');}
  function guessTitleFromLayout(layout){
    if(!layout||!layout.length)return '';
    var pageTop=0;layout.forEach(function(line){if(line.y>pageTop)pageTop=line.y;});
    var candidates=layout.filter(function(line){
      var text=line.text.trim();
      return text.length>=8&&text.length<=220&&line.y>=pageTop*.25&&
        !/^(doi\b|https?:|www\.|issn|isbn|vol\.?\s*\d|no\.?\s*\d|received\b|revised\b|accepted\b|abstract\b|keywords?\b|©|copyright)/i.test(text)&&
        !/\d{4}\)|\(\d{4}/.test(text.slice(0,40));
    });
    if(!candidates.length)return '';
    var maxHeight=0;candidates.forEach(function(line){if(line.height>maxHeight)maxHeight=line.height;});
    var big=candidates.filter(function(line){return line.height>=maxHeight*.86;}).sort(function(a,b){return b.y-a.y;});
    var parts=[big[0]],last=big[0];
    for(var i=1;i<big.length;i++){
      if(last.y-big[i].y<Math.max(last.height,big[i].height)*2.4){parts.push(big[i]);last=big[i];}
      else break;
    }
    var title=parts.map(function(line){return line.text;}).join(' ').replace(/\s+/g,' ').trim();
    if(title.length<8||title.length>220||/^\d+$/.test(title))return '';
    return title;
  }
  /* Publisher metadata loves shipping titles full of XML tags and character entities
     (Springer's <Emphasis Type="Italic">…</Emphasis>, &#x2018; and friends). Strip it
     all down to the words. */
  function cleanMetaTitle(text){
    return String(text||'')
      .replace(/<[^>]+>/g,' ')
      .replace(/&#x([0-9a-f]+);/gi,function(m,hex){try{return String.fromCodePoint(parseInt(hex,16));}catch(e){return ' ';}})
      .replace(/&#(\d+);/g,function(m,dec){try{return String.fromCodePoint(+dec);}catch(e){return ' ';}})
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&nbsp;/g,' ')
      .replace(/\s+/g,' ').replace(/\(\s+/g,'(').replace(/\s+\)/g,')').replace(/\s+([,.;:])/g,'$1').trim();
  }
  async function derivePdfTitle(doc){
    try{
      var meta=await doc.getMetadata().catch(function(){return null;});
      var infoTitle=meta&&meta.info&&cleanMetaTitle(meta.info.Title);
      if(infoTitle&&infoTitle.length>=8&&infoTitle.length<=220&&!/untitled|microsoft word|powerpoint|\.pdf$|\.docx?$|\.tex$|^\d+$/i.test(infoTitle))return infoTitle;
      var content=await (await doc.getPage(1)).getTextContent();
      return guessTitleFromLayout(contentLayout(content));
    }catch(e){return '';}
  }
  function findImportedPaper(probe){
    var papers=state.chapters.filter(function(ch){return ch.kind==='pdf';});
    if(probe.contentHash){var hashed=papers.find(function(ch){return ch.contentHash===probe.contentHash;});if(hashed)return hashed;}
    return papers.find(function(ch){if(ch.contentHash&&probe.contentHash&&ch.contentHash!==probe.contentHash)return false;if(samePdfSource(ch,probe,'sourceUrl')||samePdfSource(ch,probe,'sourcePath'))return true;return +ch.pageCount===+probe.pageCount&&identityText(ch.sourceName)===identityText(probe.sourceName)&&identityText(probe.sourceName).length>=5;});
  }
  async function importPdf(file, sourcePath, sourceUrl, progressBtn, stayPut){
    var btn=progressBtn||byId('importPdfBtn'), old=btn.textContent, imported=false; btn.disabled=true; btn.textContent='Reading PDF…';
    try {
      var bytes=await file.arrayBuffer(),hashPromise=pdfFingerprint(bytes).catch(function(){return '';}),lib=await loadPdfLib();btn.textContent='Opening PDF…';
      var doc=await lib.getDocument({data:bytes.slice(0)}).promise;
      var title=await derivePdfTitle(doc)||filenameTitle(file.name),contentHash=await hashPromise;
      var probe={kind:'pdf',title:title,sourceName:file.name,sourcePath:sourcePath||'',sourceUrl:sourceUrl||'',pageCount:doc.numPages,fileSize:bytes.byteLength,contentHash:contentHash};
      var existing=findImportedPaper(probe),id=existing?existing.id:uid('p'),keepPromise=putPdf(id,bytes);
      var ch=existing||normalize({id:id,title:title,authors:'',kind:'pdf',notes:{},pageNotes:{},tags:[],questions:[],addedAt:now(),readPage:1});
      if(existing&&titleQuality(probe)>titleQuality(existing))existing.title=title;
      ch.sourceName=file.name;ch.sourcePath=sourcePath||ch.sourcePath||'';ch.sourceUrl=sourceUrl||ch.sourceUrl||'';ch.pageCount=doc.numPages;ch.fileSize=bytes.byteLength;if(contentHash)ch.contentHash=contentHash;ch.updatedAt=now();
      if(!existing)state.chapters.push(ch);persist();renderShelf();if(!stayPut)await openReader(id,doc);if(existing&&!stayPut)showReaderToast('Already in your library — notes kept, local PDF refreshed.');if(!await keepPromise)showReaderToast('PDF opened, but this browser may not keep it after closing the tab.');imported=true;
    } catch(e){ showError(e.message||'The PDF reader could not open this file.'); }
    finally { btn.disabled=false; btn.textContent=old; }
    return imported;
  }

  /* PDFs pushed by the "Read in Phloem" browser extension: its content script relays
     the fetched bytes with a window.postMessage. Only same-window senders qualify
     (a page that merely opened this tab can never fake that), and the payload must
     actually be a PDF. */
  window.addEventListener('message',function(e){
    /* 'carrel-ext-import' is the wire name from before the Phloem rename: extensions
       already installed keep sending it, so both spellings stay welcome forever. */
    if(e.source!==window||!e.data||(e.data.type!=='carrel-ext-import'&&e.data.type!=='phloem-ext-import'))return;
    var bytes=e.data.bytes;
    if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<1200)return;
    var head=new Uint8Array(bytes.slice(0,5)),magic='';for(var i=0;i<head.length;i++)magic+=String.fromCharCode(head[i]);
    if(magic!=='%PDF-')return;
    var name=String(e.data.name||'').replace(/[^\w .()\[\]&,'-]+/g,' ').trim().slice(0,140)||'paper.pdf';
    if(!/\.pdf$/i.test(name))name+='.pdf';
    importPdf(new File([bytes],name,{type:'application/pdf'}),'',String(e.data.sourceUrl||'').slice(0,600));
    showReaderToast('Adding from your browser…');
  });

  /* text import and edit */
  byId('newTextBtn').onclick=function(){ editingId=null; byId('textDialogTitle').textContent='Add a text'; byId('textTitle').value=''; byId('textAuthors').value=''; byId('textBody').value=''; byId('textDialog').showModal(); };
  byId('saveTextBtn').onclick=function(){
    var body=byId('textBody').value.trim(); if(!body){ byId('textBody').focus(); return; }
    var ch=editingId ? find(editingId) : normalize({id:uid('t'),kind:'text',notes:{},pageNotes:{},tags:[],questions:[],addedAt:now()});
    ch.title=byId('textTitle').value.trim()||'Untitled'; ch.authors=byId('textAuthors').value.trim(); ch.fr=body; ch.updatedAt=now();
    if(!editingId) state.chapters.push(ch); persist(); byId('textDialog').close(); openReader(ch.id);
  };

  /* Reader typography plus a PDF-native reading guide. */
  var COMFORT_KEY='readingRoom.comfort.v1';
  var comfort={size:100,measure:780,leading:1.7,airy:false,focus:false,guide:'yellow',guideScope:'page',guideStyle:'tint',guideSize:'m',guideDim:56,guideY:.38,guideLock:false,tone:'white',driftSpeed:4};
  try{var savedComfort=JSON.parse(localStorage.getItem(COMFORT_KEY));if(savedComfort)Object.keys(comfort).forEach(function(k){if(typeof savedComfort[k]===typeof comfort[k])comfort[k]=savedComfort[k];});}catch(e){}
  comfort.size=Math.max(70,Math.min(190,+comfort.size||100));
  comfort.measure=Math.max(440,Math.min(1100,+comfort.measure||780));
  comfort.leading=Math.max(1.2,Math.min(2.6,+comfort.leading||1.7));
  if(['yellow','green','blue'].indexOf(comfort.guide)<0)comfort.guide='yellow';
  if(['column','page'].indexOf(comfort.guideScope)<0)comfort.guideScope='page';
  if(['tint','dim'].indexOf(comfort.guideStyle)<0)comfort.guideStyle='tint';
  if(['s','m','l'].indexOf(comfort.guideSize)<0)comfort.guideSize='m';
  comfort.guideDim=Math.max(20,Math.min(85,+comfort.guideDim||56));
  comfort.guideY=Math.max(.05,Math.min(.95,+comfort.guideY||.38));
  if(['white','cream'].indexOf(comfort.tone)<0)comfort.tone='white';
  comfort.driftSpeed=Math.max(.5,Math.min(60,+comfort.driftSpeed||4));
  var comfortSaveTimer=null;
  function saveComfortSoon(){clearTimeout(comfortSaveTimer);comfortSaveTimer=setTimeout(function(){try{localStorage.setItem(COMFORT_KEY,JSON.stringify(comfort));}catch(e){}},600);}
  /* The guide anchors to the pane, not the screen: zen mode and bar toggles move the
     pane, and a pane-relative anchor keeps the band over the same line of text. */
  var focusPara=null, pageStartCache={}, guideOffset=null;
  function paraSections(){ return byId('textDocument').querySelectorAll('.para'); }
  function applyComfort(){
    var doc=byId('textDocument');
    var readBase=matchMedia('(pointer: coarse)').matches?1.08:1.02;
    doc.style.setProperty('--read-size',(comfort.size/100*readBase).toFixed(3)+'rem');
    doc.style.setProperty('--read-measure',comfort.measure+'px');
    doc.style.setProperty('--read-leading',String(comfort.leading));
    doc.style.setProperty('--read-spacing',comfort.airy?'.2em':'normal');
    byId('textSizeValue').textContent=comfort.size+'%';
    byId('widthValue').textContent=String(comfort.measure);
    byId('leadValue').textContent=comfort.leading.toFixed(1);
    byId('airyBtn').setAttribute('aria-pressed',String(!!comfort.airy));
    byId('driftRange').value=String(comfort.driftSpeed);byId('driftValue').textContent=driftLabel();
    byId('guideDimRange').value=String(comfort.guideDim);byId('guideDimValue').textContent=comfort.guideDim+'%';
    byId('pdfFrame').classList.toggle('cream',comfort.tone==='cream');document.body.classList.toggle('cream-tone',comfort.tone==='cream');
    byId('creamBtn').setAttribute('aria-pressed',String(comfort.tone==='cream'));
    byId('paneSpotlight').dataset.guideColor=comfort.guide;
    byId('paneSpotlight').dataset.guideStyle=comfort.guideStyle;
    byId('paneSpotlight').style.setProperty('--guide-dim-opacity',(comfort.guideDim/100).toFixed(2));
    byId('comfortBar').classList.toggle('line-focus',comfort.guideStyle==='dim');
    document.querySelectorAll('.guide-color[data-guide-color]').forEach(function(btn){btn.setAttribute('aria-pressed',String(btn.dataset.guideColor===comfort.guide));});
    document.querySelectorAll('[data-guide-scope]').forEach(function(btn){btn.setAttribute('aria-pressed',String(btn.dataset.guideScope===comfort.guideScope));});
    document.querySelectorAll('[data-guide-style]').forEach(function(btn){btn.setAttribute('aria-pressed',String(btn.dataset.guideStyle===comfort.guideStyle));});
    document.querySelectorAll('[data-guide-size]').forEach(function(btn){btn.setAttribute('aria-pressed',String(btn.dataset.guideSize===comfort.guideSize));});
    applyFocus();
    try{localStorage.setItem(COMFORT_KEY,JSON.stringify(comfort));}catch(e){}
  }
  function stepComfort(field,delta,min,max,decimals){
    comfort[field]=Math.max(min,Math.min(max,+(comfort[field]+delta).toFixed(decimals)));applyComfort();
  }
  byId('textSmaller').onclick=function(){stepComfort('size',-10,70,190,0);};
  byId('textBigger').onclick=function(){stepComfort('size',10,70,190,0);};
  byId('widthNarrow').onclick=function(){stepComfort('measure',-60,440,1100,0);};
  byId('widthWide').onclick=function(){stepComfort('measure',60,440,1100,0);};
  byId('leadTight').onclick=function(){stepComfort('leading',-0.1,1.2,2.6,1);};
  byId('leadLoose').onclick=function(){stepComfort('leading',0.1,1.2,2.6,1);};
  byId('airyBtn').onclick=function(){comfort.airy=!comfort.airy;applyComfort();};
  byId('creamBtn').onclick=function(){comfort.tone=comfort.tone==='cream'?'white':'cream';applyComfort();showReaderToast(comfort.tone==='cream'?'Cream paper · easier on the eyes':'White paper');};
  document.querySelectorAll('.guide-color[data-guide-color]').forEach(function(btn){btn.onclick=function(){comfort.guide=btn.dataset.guideColor;comfort.focus=true;applyComfort();showReaderToast(btn.dataset.guideColor.charAt(0).toUpperCase()+btn.dataset.guideColor.slice(1)+' reading guide');};});
  document.querySelectorAll('[data-guide-scope]').forEach(function(btn){btn.onclick=function(){comfort.guideScope=btn.dataset.guideScope;comfort.focus=true;applyComfort();placeGuide();showReaderToast(btn.textContent+' guide');};});
  document.querySelectorAll('[data-guide-style]').forEach(function(btn){btn.onclick=function(){comfort.guideStyle=btn.dataset.guideStyle;comfort.focus=true;applyComfort();showReaderToast(btn.dataset.guideStyle==='dim'?'Line focus · the rest of the page steps back':'Tint guide');};});
  document.querySelectorAll('[data-guide-size]').forEach(function(btn){btn.onclick=function(){comfort.guideSize=btn.dataset.guideSize;comfort.focus=true;applyComfort();placeGuide();showReaderToast('Guide height · '+btn.dataset.guideSize.toUpperCase());};});
  byId('guideDimRange').oninput=function(){comfort.guideDim=Math.max(20,Math.min(85,+this.value||56));byId('guideDimValue').textContent=comfort.guideDim+'%';byId('paneSpotlight').style.setProperty('--guide-dim-opacity',(comfort.guideDim/100).toFixed(2));saveComfortSoon();};
  byId('comfortReset').onclick=function(){comfort.size=100;comfort.measure=780;comfort.leading=1.7;comfort.airy=false;comfort.guide='yellow';comfort.guideScope='page';comfort.guideStyle='tint';comfort.guideSize='m';comfort.guideDim=56;comfort.guideY=.38;comfort.tone='white';comfort.driftSpeed=4;if(driftSpeed)driftSpeed=4;applyComfort();showReaderToast('Reading settings reset');};
  function setComfortBarOpen(open){var bar=byId('comfortBar'),btn=byId('comfortBtn');bar.classList.toggle('hidden',!open);btn.classList.toggle('active',open);btn.setAttribute('aria-expanded',String(open));}
  byId('comfortBtn').onclick=function(){setComfortBarOpen(byId('comfortBar').classList.contains('hidden'));};
  function setFocusPara(index,scroll){
    var list=paraSections();if(!list.length){focusPara=null;return;}
    focusPara=Math.max(0,Math.min(list.length-1,index||0));
    list.forEach(function(section,i){section.classList.toggle('current',i===focusPara);});
    if(scroll!==false&&list[focusPara])list[focusPara].scrollIntoView({block:'center',behavior:'smooth'});
    var ch=find(currentId);if(ch){ch.focusPara=focusPara;persist(false);}
    updateProgress();
  }
  function focusSurfaceAt(clientX,clientY,target){
    var surface=null;
    if(readerMode==='pdf'){
      surface=target&&target.closest?target.closest('.pdf-page'):null;
      if(!surface&&pdfViews.length){
        var pane=byId('documentPane'),paneRect=pane.getBoundingClientRect();
        surface=pdfViews[pdfPageIndexAtY(pane.scrollTop+(clientY-paneRect.top))].holder;
      }
      if(!surface)surface=byId('pdfFrame').querySelector('.pdf-page[data-page="'+currentPage+'"]');
    }else surface=byId('textDocument');
    return surface;
  }
  function setReadingGuide(clientX,clientY,target){
    var overlay=byId('paneSpotlight'),rect=overlay.getBoundingClientRect();
    if(!rect.width||!rect.height)return false;
    var surface=focusSurfaceAt(clientX,clientY,target),surfaceRect=surface&&surface.getBoundingClientRect();
    if(!surfaceRect||!surfaceRect.width)return false;
    var paneRect=byId('documentPane').getBoundingClientRect();
    if(paneRect.width)guideOffset={x:clientX-paneRect.left,y:clientY-paneRect.top};
    var left=surfaceRect.left,right=surfaceRect.right;
    var leftHalf=false;
    if(readerMode==='pdf'&&comfort.guideScope==='column'){
      var middle=surfaceRect.left+surfaceRect.width/2;
      if(clientX<middle){right=middle;leftHalf=true;}else left=middle;
    }
    overlay.classList.toggle('guide-left',leftHalf);
    left=Math.max(rect.left,left);right=Math.min(rect.right,right);
    var sizeFactor=comfort.guideSize==='s'?.62:comfort.guideSize==='l'?1.6:1;
    var guideHeight=Math.round((innerWidth<=720?Math.max(76,Math.min(108,rect.height*.13)):Math.max(96,Math.min(142,rect.height*.15)))*sizeFactor);
    var guideTop=Math.max(8,Math.min(rect.height-guideHeight-8,clientY-rect.top-guideHeight/2));
    overlay.style.setProperty('--guide-x',Math.round(left-rect.left)+'px');
    overlay.style.setProperty('--guide-y',Math.round(guideTop)+'px');
    overlay.style.setProperty('--guide-w',Math.max(0,Math.round(right-left))+'px');
    overlay.style.setProperty('--guide-h',guideHeight+'px');
    overlay.classList.add('placed');
    comfort.guideY=Math.max(.05,Math.min(.95,(clientY-rect.top)/Math.max(1,rect.height)));
    saveComfortSoon();
    return true;
  }
  /* Re-anchor the band from its last screen point. Runs after the pages actually exist
     (PDF layout is async), after zoom/mode changes, and as the paper scrolls beneath it. */
  function placeGuide(){
    if(!comfort.focus||byId('readerPage').classList.contains('hidden'))return;
    var rect=byId('documentPane').getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    var x=guideOffset?rect.left+guideOffset.x:rect.left+rect.width/2,y=guideOffset?rect.top+guideOffset.y:rect.top+rect.height*(comfort.guideY||.38);
    x=Math.max(rect.left+6,Math.min(rect.right-6,x));y=Math.max(rect.top+16,Math.min(rect.bottom-30,y));
    setReadingGuide(x,y,document.elementFromPoint(x,y));
  }
  function applyFocus(){
    var overlay=byId('paneSpotlight'),btn=byId('focusBtn'),on=!!comfort.focus;
    overlay.classList.toggle('on',on);overlay.classList.toggle('locked',!!comfort.guideLock);btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',String(on));
    var zg=byId('zenGuide');zg.classList.toggle('active',on);zg.setAttribute('aria-pressed',String(on));
    if(on)requestAnimationFrame(placeGuide);
  }
  /* Zen strips the toolbars, but the guide is a reading aid, not chrome — it keeps
     this one faint seat beside the exit so dense passages don't cost a round trip. */
  byId('zenGuide').onclick=function(){byId('focusBtn').onclick();};
  byId('zenTheme').onclick=function(){byId('themeBtn').onclick();};
  byId('focusBtn').onclick=function(){
    var turningOn=!comfort.focus,seen=false;
    if(turningOn){try{seen=localStorage.getItem('readingRoom.guideAdjustSeen.v1')==='1';}catch(e){}if(!seen){comfort.guide='yellow';comfort.guideScope='page';}}
    comfort.focus=turningOn;applyComfort();
    if(comfort.focus&&!zenOn&&!seen){setComfortBarOpen(true);requestAnimationFrame(function(){var bar=byId('comfortBar'),group=byId('guideStyleGroup'),barRect=bar.getBoundingClientRect(),groupRect=group.getBoundingClientRect();if(bar.scrollWidth>bar.clientWidth)bar.scrollTo({left:Math.max(0,bar.scrollLeft+groupRect.left-barRect.left-12),behavior:'smooth'});});try{localStorage.setItem('readingRoom.guideAdjustSeen.v1','1');}catch(e){}}
    showReaderToast(comfort.focus?(matchMedia('(hover: hover)').matches?(comfort.guideLock?'Reading guide on · pinned — click the paper to release':'Reading guide follows your pointer · click the paper to pin it'):'Reading guide on · drag its ⠿ handle or tap the page'):'Reading guide off');
  };
  byId('documentPane').addEventListener('pointermove',function(e){
    if(!comfort.focus||comfort.guideLock||e.pointerType==='touch')return;setReadingGuide(e.clientX,e.clientY,e.target);
  });
  byId('documentPane').addEventListener('click',function(e){
    if(!comfort.focus)return;
    var selection=window.getSelection&&window.getSelection();if(selection&&!selection.isCollapsed)return;
    if(!matchMedia('(hover: hover)').matches){setReadingGuide(e.clientX,e.clientY,e.target);return;}
    /* Laptop: a click pins the guide to its line so trips to the notebook or toolbar
       don't drag it away; the next click releases it. The toggle waits a beat so a
       double-click can cancel it and flip the guide's width instead. */
    if(highlightMode)return;
    clearTimeout(guideLockClickTimer);
    var lockX=e.clientX,lockY=e.clientY,lockTarget=e.target;
    guideLockClickTimer=setTimeout(function(){
      comfort.guideLock=!comfort.guideLock;
      if(!comfort.guideLock)setReadingGuide(lockX,lockY,lockTarget);
      byId('paneSpotlight').classList.toggle('locked',comfort.guideLock);
      saveComfortSoon();
      showReaderToast(comfort.guideLock?'Guide pinned to this line · click the paper to release':'Guide follows your pointer');
    },260);
  });
  /* A wordless double-click anywhere on the paper flips the guide between full-page
     and one-column width, right where you clicked. Double-clicking a word still just
     selects the word. */
  byId('documentPane').addEventListener('dblclick',function(e){
    if(readerMode!=='pdf'||!matchMedia('(hover: hover)').matches)return;
    clearTimeout(guideLockClickTimer);
    var selection=window.getSelection&&window.getSelection();
    if(selection&&!selection.isCollapsed)return;
    if(comfort.focus&&!e.shiftKey){
      comfort.guideScope=comfort.guideScope==='page'?'column':'page';
      applyComfort();
      setReadingGuide(e.clientX,e.clientY,e.target);
      showReaderToast(comfort.guideScope==='column'?'Guide hugs one column · double-click to widen':'Guide spans the page · double-click for one column');
      return;
    }
    columnZoomAt(e);
  });
  /* One-column zoom: the Col button (or C) cycles Fit -> left column -> right column
     -> Fit, measured from the current page's own text layout; double-click on a blank
     spot of a page zooms the column under the cursor directly. */
  var colZoomSide=0;
  async function columnBands(pageNo){
    var pg=await pdfDoc.getPage(pageNo),content=await pg.getTextContent(),vp=pg.getViewport({scale:1});
    var lines=contentLayout(content),pageW=vp.width,mid=pageW/2;
    function band(pool){
      if(!pool.length)return null;
      var xs=pool.map(function(l){return l.x;}).sort(function(a,b){return a-b;});
      var es=pool.map(function(l){return l.endX;}).sort(function(a,b){return a-b;});
      var f0=Math.max(0,(xs[Math.floor(xs.length*.1)]-8)/pageW),f1=Math.min(1,(es[Math.floor(es.length*.9)]+8)/pageW);
      return f1-f0>0?[f0,f1]:null;
    }
    var narrow=lines.filter(function(l){var w=l.endX-l.x;return w<pageW*.58&&w>pageW*.12;});
    var left=narrow.filter(function(l){return (l.x+l.endX)/2<mid;}),right=narrow.filter(function(l){return (l.x+l.endX)/2>=mid;});
    return {twoCol:left.length>=6&&right.length>=6,left:band(left),right:band(right),
            text:band(lines.filter(function(l){return (l.endX-l.x)>pageW*.12;}))};
  }
  function zoomToBand(fracs,pageNo,anchorX,anchorY,label){
    if(!fracs)return;
    var z=Math.max(1.15,Math.min(1.73,.985/(fracs[1]-fracs[0])));
    setZoom(z,anchorX,anchorY,0,0,function(){
      var pane=byId('documentPane'),h2=byId('pdfFrame').querySelector('.pdf-page[data-page="'+pageNo+'"]');
      if(!h2)return;
      var hr=h2.getBoundingClientRect(),pr=pane.getBoundingClientRect();
      var margin=Math.max(0,(pr.width-(fracs[1]-fracs[0])*hr.width)/2);
      pane.scrollLeft=Math.max(0,pane.scrollLeft+(hr.left-pr.left)+fracs[0]*hr.width-margin);
    });
    if(label)showReaderToast(label);
  }
  async function columnZoomAt(e){
    if(!pdfDoc)return;
    var holder=e.target.closest?e.target.closest('.pdf-page'):null;
    if(!holder)return;
    if(currentZoom()>1.25){setZoom(1);colZoomSide=0;showReaderToast('Back to full width');return;}
    var pageNo=+holder.dataset.page,rect=holder.getBoundingClientRect();
    if(!rect.width)return;
    var fx=(e.clientX-rect.left)/rect.width;
    try{
      var bands=await columnBands(pageNo);
      if(bands.twoCol){colZoomSide=fx<.5?1:2;zoomToBand(fx<.5?bands.left:bands.right,pageNo,e.clientX,e.clientY,'Zoomed to this column · C or double-click goes back');}
      else{colZoomSide=2;zoomToBand(bands.text,pageNo,e.clientX,e.clientY,'Zoomed to the text width · C or double-click goes back');}
    }catch(err){}
  }
  async function cycleColumnZoom(){
    if(!pdfDoc||readerMode!=='pdf')return;
    if(currentZoom()<=1.05)colZoomSide=0;
    try{
      var pageNo=currentPage,bands=await columnBands(pageNo);
      if(bands.twoCol){
        if(colZoomSide===0){colZoomSide=1;zoomToBand(bands.left,pageNo,undefined,undefined,'Left column · Col again for the right');}
        else if(colZoomSide===1){colZoomSide=2;zoomToBand(bands.right,pageNo,undefined,undefined,'Right column · Col again for full width');}
        else{colZoomSide=0;setZoom(1);showReaderToast('Back to full width');}
      }else if(colZoomSide===0){colZoomSide=2;zoomToBand(bands.text,pageNo,undefined,undefined,'Text width · Col again for full width');}
      else{colZoomSide=0;setZoom(1);showReaderToast('Back to full width');}
    }catch(err){}
  }
  /* Keyboard scope control: place the guide as full-page or hugging one column,
     keeping its current line. */
  function placeGuideScoped(scope,half){
    comfort.focus=true;comfort.guideScope=scope;applyComfort();
    var overlay=byId('paneSpotlight'),rect=byId('documentPane').getBoundingClientRect();
    if(!rect.width)return;
    var bandY=(parseFloat(overlay.style.getPropertyValue('--guide-y'))||rect.height*.38)+((parseFloat(overlay.style.getPropertyValue('--guide-h'))||110)/2);
    var y=Math.max(rect.top+16,Math.min(rect.bottom-30,rect.top+bandY));
    var x=rect.left+rect.width*(scope==='column'?(half==='left'?.25:.75):.5);
    setReadingGuide(x,y,document.elementFromPoint(x,y));
  }
  var guideLockClickTimer=null;
  var guideDragging=false;
  byId('guideGrip').addEventListener('pointerdown',function(e){
    guideDragging=true;byId('paneSpotlight').classList.add('dragging');try{this.setPointerCapture(e.pointerId);}catch(err){}e.preventDefault();e.stopPropagation();
  });
  byId('guideGrip').addEventListener('pointermove',function(e){
    if(!guideDragging)return;setReadingGuide(e.clientX,e.clientY,null);
  });
  function endGuideDrag(e){
    if(!guideDragging)return;guideDragging=false;byId('paneSpotlight').classList.remove('dragging');
    if(this.hasPointerCapture&&this.hasPointerCapture(e.pointerId))this.releasePointerCapture(e.pointerId);
  }
  byId('guideGrip').addEventListener('pointerup',endGuideDrag);
  byId('guideGrip').addEventListener('pointercancel',endGuideDrag);
  /* iOS cancels the pointer mid-drag if it decides the touch is a scroll; blocking the
     touchmove default keeps the drag alive until the finger actually lifts. */
  byId('guideGrip').addEventListener('touchmove',function(e){e.preventDefault();},{passive:false});
  /* Zen reading: every bar, note and button leaves; the paper gets the whole screen.
     The guide, zoom, gestures and lookup keep working on top of it. */
  var zenOn=false,zenViaFullscreen=false;
  function setZen(on){
    zenOn=!!on;document.body.classList.toggle('zen',zenOn);
    byId('zenBtn').classList.toggle('active',zenOn);byId('zenBtn').setAttribute('aria-pressed',String(zenOn));
    if(zenOn){toggleSheet(false);byId('readerPage').classList.remove('show-tools');byId('mMore').setAttribute('aria-expanded','false');}
    /* Leaving zen keeps the paper at full width: the notebook stays tucked away
       instead of instantly reclaiming its panel; one tap on its edge brings it back. */
    else if(innerWidth>720)setNotebookCollapsed(true,false);
    /* Browser fullscreen only on mouse-driven devices: on iPad, system edge gestures keep
       kicking the page out of fullscreen mid-read, which yanked the whole desk back. */
    if(zenOn&&matchMedia('(hover: hover) and (pointer: fine)').matches&&document.documentElement.requestFullscreen){
      document.documentElement.requestFullscreen().then(function(){zenViaFullscreen=true;},function(){});
    }else if(!zenOn&&zenViaFullscreen){zenViaFullscreen=false;if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(function(){});}
    requestAnimationFrame(function(){
      if(readerMode==='pdf'&&pdfDoc)renderPdfPage();
      if(comfort.focus)placeGuide();
      updateProgress();
    });
    showReaderToast(zenOn?'Zen reading · Space starts a slow auto-scroll · Esc leaves':'Back at the desk');
  }
  byId('zenBtn').onclick=function(){setZen(!zenOn);};
  byId('zenExit').onclick=function(){setZen(false);};
  document.addEventListener('fullscreenchange',function(){
    if(!document.fullscreenElement&&zenOn&&zenViaFullscreen){zenViaFullscreen=false;setZen(false);}
  });
  /* Auto-scroll: the paper drifts up at a steady pace, which quietly enforces a reading
     rhythm. Touching or wheeling the page pauses the drift, then it resumes. */
  var driftSpeed=0,driftRaf=null,driftLast=0,driftHold=false,driftPos=null,driftResume=null;
  function driftLabel(){return (+comfort.driftSpeed).toFixed(1).replace(/\.0$/,'')+' px/s';}
  function driftTick(ts){
    if(!driftSpeed){driftRaf=null;return;}
    if(!driftLast)driftLast=ts;
    var dt=Math.min(80,ts-driftLast);driftLast=ts;
    if(!driftHold&&!byId('readerPage').classList.contains('hidden')&&!recallActive){
      var pane=byId('documentPane');
      /* Fractional accumulation: at crawl speeds whole-pixel steps read as ticking. */
      if(driftPos===null||Math.abs(driftPos-pane.scrollTop)>2)driftPos=pane.scrollTop;
      driftPos+=driftSpeed*dt/1000;
      var limit=pane.scrollHeight-pane.clientHeight;
      if(driftPos>=limit-1&&limit>0){pane.scrollTop=limit;setDrift(0);showReaderToast('End of the paper · auto-scroll off');}
      else pane.scrollTop=driftPos;
    }
    driftRaf=requestAnimationFrame(driftTick);
  }
  function setDrift(speed){
    driftSpeed=+speed||0;driftLast=0;driftPos=null;driftHold=false;clearTimeout(driftResume);
    byId('driftBtn').textContent=driftSpeed?'On':'Off';
    byId('driftBtn').setAttribute('aria-pressed',String(!!driftSpeed));
    if(driftSpeed&&!driftRaf)driftRaf=requestAnimationFrame(driftTick);
  }
  function holdDrift(ms){
    if(!driftSpeed)return;driftHold=true;clearTimeout(driftResume);
    driftResume=setTimeout(function(){driftHold=false;driftLast=0;driftPos=null;},ms);
  }
  byId('driftBtn').onclick=function(){
    var turningOff=driftSpeed>0;
    setDrift(turningOff?0:comfort.driftSpeed);
    showReaderToast(turningOff?'Auto-scroll off':'Auto-scroll · touching the page pauses it');
  };
  byId('driftRange').oninput=function(){
    comfort.driftSpeed=Math.max(.5,Math.min(60,+this.value||4));
    byId('driftValue').textContent=driftLabel();
    saveComfortSoon();
    if(driftSpeed)driftSpeed=comfort.driftSpeed;else setDrift(comfort.driftSpeed);
  };
  /* Drive the slider with pointer events ourselves — the same mechanism as the guide's
     ⠿ handle — so a finger drag always moves the thumb instead of panning the bar. */
  function wireTouchRange(range){
    var dragging=false;
    function setFromPointer(e){
      var r=range.getBoundingClientRect();if(!r.width)return;
      var min=+range.min,max=+range.max,step=+range.step||1;
      var val=min+Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*(max-min);
      val=Math.round(val/step)*step;
      if(String(val)!==range.value){range.value=String(val);range.dispatchEvent(new Event('input'));}
    }
    range.addEventListener('pointerdown',function(e){
      dragging=true;try{range.setPointerCapture(e.pointerId);}catch(err){}
      setFromPointer(e);e.preventDefault();
    });
    range.addEventListener('pointermove',function(e){if(dragging)setFromPointer(e);});
    function stopRangeDrag(e){if(!dragging)return;dragging=false;try{range.releasePointerCapture(e.pointerId);}catch(err){}}
    range.addEventListener('pointerup',stopRangeDrag);
    range.addEventListener('pointercancel',stopRangeDrag);
  }
  wireTouchRange(byId('driftRange'));wireTouchRange(byId('guideDimRange'));
  byId('documentPane').addEventListener('touchstart',function(){holdDrift(1200);},{passive:true});
  byId('documentPane').addEventListener('touchmove',function(){holdDrift(1200);},{passive:true});
  byId('documentPane').addEventListener('wheel',function(){holdDrift(1500);},{passive:true});
  byId('readerBack').addEventListener('click',function(){setDrift(0);if(zenOn)setZen(false);});
  var NOTEBOOK_WIDTH_KEY='readingRoom.notebookWidth.v1',notebookWidth=innerWidth<=900?320:360;
  var NOTEBOOK_COLLAPSED_KEY='readingRoom.notebookCollapsed.v1',notebookCollapsed=false;
  try{notebookWidth=+localStorage.getItem(NOTEBOOK_WIDTH_KEY)||notebookWidth;}catch(e){}
  try{var ncSaved=localStorage.getItem(NOTEBOOK_COLLAPSED_KEY);notebookCollapsed=ncSaved===null?true:ncSaved==='1';}catch(e){}
  function setNotebookWidth(value,save){
    var layout=byId('readerLayout'),resizer=byId('notebookResizer');if(innerWidth<=720){layout.style.removeProperty('--notebook-width');return;}
    var available=layout.clientWidth||innerWidth,max=Math.max(280,Math.min(620,available-340));
    notebookWidth=Math.round(Math.max(280,Math.min(max,+value||360)));
    /* While tucked away the column must stay 0 — a window resize (leaving browser
       fullscreen, exiting zen) re-clamps the width and used to bring the empty
       column back, leaving side-panel-shaped dead space next to the paper. */
    if(!notebookCollapsed)layout.style.setProperty('--notebook-width',notebookWidth+'px');
    resizer.setAttribute('aria-valuemax',String(Math.round(max)));resizer.setAttribute('aria-valuenow',String(notebookWidth));resizer.setAttribute('aria-valuetext',notebookWidth+' pixels wide');
    if(save)try{localStorage.setItem(NOTEBOOK_WIDTH_KEY,String(notebookWidth));}catch(e){}
  }
  /* Pushing the divider far enough right tucks the whole notebook away; a slim tab at
     the screen edge brings it back. */
  function setNotebookCollapsed(on,save){
    notebookCollapsed=!!on&&innerWidth>720;
    var layout=byId('readerLayout');
    layout.classList.toggle('notebook-collapsed',notebookCollapsed);
    /* The width lives as an inline CSS variable, which would silently override the
       collapsed class's 0 — clear it while tucked away, restore it on reopen. */
    if(notebookCollapsed)layout.style.setProperty('--notebook-width','0px');
    else setNotebookWidth(notebookWidth,false);
    byId('notebookReopen').setAttribute('aria-expanded',String(!notebookCollapsed));
    if(save)try{localStorage.setItem(NOTEBOOK_COLLAPSED_KEY,notebookCollapsed?'1':'0');}catch(e){}
  }
  byId('notebookReopen').onclick=function(){setNotebookCollapsed(false,true);if(readerMode==='pdf'&&pdfDoc)renderPdfPage();};
  byId('notebookTuck').onclick=function(){setNotebookCollapsed(true,true);if(readerMode==='pdf'&&pdfDoc)renderPdfPage();showReaderToast('Notes tucked away · the ❮ tab brings them back');};
  setNotebookWidth(notebookWidth,false);
  setNotebookCollapsed(notebookCollapsed,false);
  var notebookDrag=false;
  byId('notebookResizer').onpointerdown=function(e){
    if(innerWidth<=720)return;notebookDrag=true;try{this.setPointerCapture(e.pointerId);}catch(err){}document.body.classList.add('resizing-notebook');e.preventDefault();
  };
  byId('notebookResizer').onpointermove=function(e){
    if(!notebookDrag)return;var rect=byId('readerLayout').getBoundingClientRect(),want=rect.right-e.clientX;
    if(want<170){if(!notebookCollapsed)setNotebookCollapsed(true,false);}
    else{if(notebookCollapsed)setNotebookCollapsed(false,false);setNotebookWidth(want,false);}
  };
  function finishNotebookResize(e){
    if(!notebookDrag)return;notebookDrag=false;document.body.classList.remove('resizing-notebook');
    setNotebookCollapsed(notebookCollapsed,true);
    if(!notebookCollapsed)setNotebookWidth(notebookWidth,true);
    if(e&&byId('notebookResizer').hasPointerCapture(e.pointerId))byId('notebookResizer').releasePointerCapture(e.pointerId);
    if(readerMode==='pdf'&&pdfDoc)renderPdfPage();
    if(notebookCollapsed)showReaderToast('Notes tucked away · the ❮ tab brings them back');
  }
  byId('notebookResizer').onpointerup=finishNotebookResize;
  byId('notebookResizer').onpointercancel=finishNotebookResize;
  byId('notebookResizer').ondblclick=function(){setNotebookCollapsed(false,true);setNotebookWidth(360,true);if(readerMode==='pdf'&&pdfDoc)renderPdfPage();showReaderToast('Notes panel reset');};
  byId('notebookResizer').onkeydown=function(e){
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'||e.key==='Home'){e.preventDefault();e.stopPropagation();setNotebookWidth(e.key==='Home'?360:notebookWidth+(e.key==='ArrowLeft'?24:-24),true);if(readerMode==='pdf'&&pdfDoc)renderPdfPage();}
    else if(e.key==='End'){e.preventDefault();e.stopPropagation();setNotebookCollapsed(true,true);if(readerMode==='pdf'&&pdfDoc)renderPdfPage();}
  };
  /* Phone chrome: the notebook rises as a bottom sheet, the bottom bar owns paging,
     and ⋯ reveals the full toolbar only when it is wanted. */
  function syncMobileSheetButtons(){
    var open=byId('notebook').classList.contains('sheet-open'),aiOpen=!byId('aiPanel').classList.contains('hidden');
    byId('mAsk').setAttribute('aria-expanded',String(open&&aiOpen));
    byId('mNotes').setAttribute('aria-expanded',String(open&&!aiOpen));
  }
  function toggleSheet(open){
    var notebook=byId('notebook'),scrim=byId('sheetScrim'),willOpen=open!==undefined?open:!notebook.classList.contains('sheet-open');
    if(!willOpen&&recallActive)setRecall(false);
    notebook.classList.toggle('sheet-open',willOpen);scrim.classList.toggle('hidden',!willOpen);
    syncMobileSheetButtons();
    var hideSheet=innerWidth<=720&&!willOpen;
    try{byId('notebook').inert=hideSheet;}catch(e){}
    byId('notebook').setAttribute('aria-hidden',String(hideSheet));
    if(hideSheet&&byId('notebook').contains(document.activeElement)){try{document.activeElement.blur();}catch(e){}}
  }
  function toggleMobileTab(id){var same=id==='aiPanel'?!byId('aiPanel').classList.contains('hidden'):!byId('notesPanel').classList.contains('hidden');if(same&&byId('notebook').classList.contains('sheet-open'))toggleSheet(false);else{switchTab(id);toggleSheet(true);}}
  byId('mAsk').onclick=function(){toggleMobileTab('aiPanel');};
  byId('mNotes').onclick=function(){toggleMobileTab('notesPanel');};
  byId('sheetScrim').onclick=function(){toggleSheet(false);};
  byId('sheetClose').onclick=function(){toggleSheet(false);};
  byId('mMore').onclick=function(){
    var on=!byId('readerPage').classList.contains('show-tools');
    byId('readerPage').classList.toggle('show-tools',on);this.setAttribute('aria-expanded',String(on));
  };
  byId('mPrev').onclick=function(){byId('prevPage').click();};
  byId('mNext').onclick=function(){byId('nextPage').click();};
  function updateProgress(){
    var ch=find(currentId),pct=0;
    if(ch){
      if(readerMode==='pdf'&&pdfDoc&&pdfDoc.numPages){var pdfPane=byId('documentPane'),pdfSpan=pdfPane.scrollHeight-pdfPane.clientHeight;pct=pdfSpan>4?pdfPane.scrollTop/pdfSpan*100:currentPage/pdfDoc.numPages*100;}
      else{
        var list=paraSections();
        var pane=byId('documentPane'),span=pane.scrollHeight-pane.clientHeight;pct=span>4?pane.scrollTop/span*100:(list.length?100:0);
      }
    }
    pct=Math.max(0,Math.min(100,Math.round(pct)));
    byId('progressFill').style.width=pct+'%';byId('progressRail').setAttribute('aria-valuenow',String(pct));
  }
  var scrollSaveTimer=null;
  var pageTrackTick=false;
  byId('documentPane').addEventListener('scroll',function(){
    if(!pageTrackTick){pageTrackTick=true;requestAnimationFrame(function(){pageTrackTick=false;trackCurrentPage();if(comfort.focus&&!guideDragging)placeGuide();});}
    updateProgress();
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer=setTimeout(function(){
      var ch=find(currentId);if(!ch||readerMode==='pdf')return;
      var pane=byId('documentPane'),span=pane.scrollHeight-pane.clientHeight;
      ch.readerScroll=span>4?pane.scrollTop/span:0;persist(false);
    },600);
  });
  function restoreReaderPosition(ch,announce){
    if(!ch||readerMode==='pdf')return;
    var pane=byId('documentPane');
    requestAnimationFrame(function(){
      var span=pane.scrollHeight-pane.clientHeight;
      if(ch.readerScroll>0.01&&span>4){
        pane.scrollTop=ch.readerScroll*span;
        if(announce)showReaderToast('Picked up where you stopped');
      }
      updateProgress();
    });
  }
  /* Find across the whole paper — the browser's own find only sees the one rendered page. */
  var findMatches=[], findIndex=-1, findTimer=null, findFlashTimer=null;
  function toggleFindBar(open){
    var bar=byId('findBar'),willOpen=open!==undefined?open:bar.classList.contains('hidden');
    bar.classList.toggle('hidden',!willOpen);
    byId('findBtn').classList.toggle('active',willOpen);byId('findBtn').setAttribute('aria-expanded',String(willOpen));
    if(willOpen){byId('findInput').focus({preventScroll:true});byId('findInput').select();}
    else{findMatches=[];findIndex=-1;byId('findCount').textContent='';}
  }
  byId('findBtn').onclick=function(){toggleFindBar();};
  function runFind(){
    var ch=find(currentId),q=byId('findInput').value.trim().toLowerCase();findMatches=[];findIndex=-1;
    if(!ch||q.length<2){byId('findCount').textContent=q?'Type a bit more':'';return;}
    if(ch.kind==='pdf'&&readerMode==='pdf'){
      (ch.pageTexts||[]).forEach(function(text,i){var hits=String(text||'').toLowerCase().split(q).length-1;if(hits)findMatches.push({page:i+1,hits:hits});});
    }else{
      var source=readerMode==='text'&&ch.kind==='pdf'?readerSourceText(ch):ch.fr;
      paras(source).forEach(function(p,i){var hits=p.toLowerCase().split(q).length-1;if(hits)findMatches.push({para:i,hits:hits});});
    }
    var total=findMatches.reduce(function(n,m){return n+m.hits;},0);
    byId('findCount').textContent=total?total+' match'+(total===1?'':'es'):'No matches';
    if(findMatches.length)gotoFindMatch(0);
  }
  function gotoFindMatch(index){
    if(!findMatches.length)return;
    findIndex=((index%findMatches.length)+findMatches.length)%findMatches.length;
    var m=findMatches[findIndex],where=m.page?'p. '+m.page:'¶ '+(m.para+1);
    byId('findCount').textContent=where+' · '+(findIndex+1)+' / '+findMatches.length;
    if(m.page){gotoPdfPage(m.page);flashPdfFind(m.page,byId('findInput').value.trim().toLowerCase());return;}
    var list=paraSections(),section=list[m.para];if(!section)return;
    section.scrollIntoView({block:'center',behavior:'smooth'});
    clearTimeout(findFlashTimer);
    byId('textDocument').querySelectorAll('.find-flash').forEach(function(s){s.classList.remove('find-flash');});
    section.classList.add('find-flash');
    findFlashTimer=setTimeout(function(){section.classList.remove('find-flash');},1600);
  }
  /* Show the match on the page itself: tint the text-layer spans holding the term,
     clear them on every jump and fade them after a beat — never a lasting mark. */
  function flashPdfFind(page,q){
    document.querySelectorAll('.find-span').forEach(function(s){s.classList.remove('find-span');});
    if(!q)return;
    var tries=0;
    (function attempt(){
      var view=pdfViews[page-1];
      if(!view||!view.rendered){if(tries++<24)setTimeout(attempt,250);return;}
      view.text.querySelectorAll('span').forEach(function(s){
        if(s.textContent.toLowerCase().indexOf(q)>=0)s.classList.add('find-span');
      });
      clearTimeout(findFlashTimer);
      findFlashTimer=setTimeout(function(){document.querySelectorAll('.find-span').forEach(function(s){s.classList.remove('find-span');});},2600);
    })();
  }
  byId('findInput').oninput=function(){clearTimeout(findTimer);findTimer=setTimeout(runFind,260);};
  byId('findInput').onkeydown=function(e){
    if(e.key==='Enter'){e.preventDefault();findMatches.length?gotoFindMatch(findIndex+(e.shiftKey?-1:1)):runFind();}
    else if(e.key==='Escape'){e.preventDefault();toggleFindBar(false);}
  };
  byId('findPrev').onclick=function(){gotoFindMatch(findIndex-1);};
  byId('findNext').onclick=function(){gotoFindMatch(findIndex+1);};

  var linkReturnSpot=null;
  async function followPdfDest(dest){
    if(!pdfDoc)return;
    try{
      var d=typeof dest==='string'?await pdfDoc.getDestination(dest):dest;
      if(!d||!d[0])return;
      var idx=await pdfDoc.getPageIndex(d[0]);
      var pane=byId('documentPane');
      linkReturnSpot={top:pane.scrollTop,left:pane.scrollLeft};
      gotoPdfPage(idx+1);
      showReaderToast('Jumped to p. '+(idx+1)+' · Backspace comes back');
    }catch(destError){}
  }
  function gotoPdfPage(page){
    var ch=find(currentId);if(!ch||ch.kind!=='pdf')return;
    if(innerWidth<=720)toggleSheet(false);
    if(readerMode!=='pdf'){readerMode='pdf';updateReaderMode();}
    currentPage=Math.max(1,page);
    if(pdfDoc){currentPage=Math.min(currentPage,pdfDoc.numPages);updatePageChrome();scrollToPdfPage(currentPage);}
  }
  /* Table of contents from the PDF's own outline; chapters resolve to pages on tap. */
  var pdfOutline=null;
  async function loadPdfOutline(){
    pdfOutline=null;byId('tocList').innerHTML='';
    try{if(pdfDoc)pdfOutline=await pdfDoc.getOutline();}catch(e){}
    byId('tocBtn').classList.toggle('hidden',readerMode!=='pdf'||!(pdfOutline&&pdfOutline.length));
  }
  function renderToc(){
    var box=byId('tocList');
    if(box.childElementCount||!pdfOutline)return;
    var frag=document.createDocumentFragment();
    (function walk(items,depth){
      items.forEach(function(item){
        var b=document.createElement('button');
        b.type='button';b.className='toc-item';b.dataset.depth=String(Math.min(depth,2));
        b.textContent=item.title||'Untitled section';
        b.onclick=function(){tocGo(item);};
        frag.appendChild(b);
        if(item.items&&item.items.length&&depth<2)walk(item.items,depth+1);
      });
    })(pdfOutline,0);
    box.appendChild(frag);
  }
  async function tocGo(item){
    try{
      var dest=item.dest;
      if(typeof dest==='string')dest=await pdfDoc.getDestination(dest);
      if(!Array.isArray(dest)||!dest.length)throw new Error('no destination');
      var first=dest[0];
      var index=first&&typeof first==='object'?await pdfDoc.getPageIndex(first):+first;
      byId('tocDialog').close();
      gotoPdfPage(index+1);
    }catch(e){showReaderToast('Could not open that chapter');}
  }
  byId('tocBtn').onclick=function(){renderToc();byId('tocDialog').showModal();};
  function jumpToParagraph(index){
    var ch=find(currentId);if(!ch)return;
    if(innerWidth<=720)toggleSheet(false);
    /* With the Reader view retired from the toolbar, notes on a PDF jump to the page
       their paragraph came from instead of switching views. */
    if(ch.kind==='pdf'&&readerMode==='pdf'){
      var starts=paraPageStarts(ch),page=null;
      (starts||[]).forEach(function(st){if(st.para<=index)page=st.page;});
      if(page)gotoPdfPage(page);else showReaderToast('Could not find that spot in the PDF');
      return;
    }
    if(readerMode!=='text'){readerMode='text';updateReaderMode();}
    setFocusPara(index);
  }

  /* reader */
  async function openReader(id,preparedDoc){
    /* pdfViews must go too: renderPdfPage's spot-preserving rebuild otherwise measures
       the PREVIOUS paper's pages — an extension import into an open reader landed the
       new paper mid-page, at wherever the old one had been scrolled. */
    var ch=find(id); if(!ch) return; hideLookup();setRecall(false);if(ch.kind==='pdf')await hydrateDerived(ch); currentId=id; currentPage=ch.readPage||1; pdfDoc=null; pdfOutline=null; pdfViews=[]; pdfBuildKey=''; try{localStorage.setItem(LAST_OPEN_KEY,id);}catch(e){} pdfZoom=ch.kind==='pdf'&&+ch.zoom>0?Math.max(.5,Math.min(4,+ch.zoom)):1; pdfFit=pdfZoom===1; setHighlightMode(false); clearPendingSelection(); hideHighlightCard(); highlightHistory=[]; highlightFuture=[]; lastAskSelection=null; toggleFindBar(false);
    refreshReaderSegmentation(ch);
    pageStartCache={}; focusPara=Number.isInteger(ch.focusPara)?ch.focusPara:null;
    byId('readerTitle').textContent=ch.title||'Untitled'; byId('readerMeta').textContent=ch.authors||ch.sourceName||'';
    byId('paperTags').value=(ch.tags||[]).join(', '); renderNoteIndex();
    byId('evidenceList').classList.add('hidden');byId('evidenceList').innerHTML='';
    aiContext=null;aiThreadDraft=false;byId('contextCard').classList.add('hidden');byId('aiStatus').textContent='';restoreActiveAiThread(ch);renderQa();
    readerMode=ch.kind==='pdf'?'pdf':'text'; applyComfort(); updateReaderMode(); showPage('readerPage'); switchTab('aiPanel');
    if(ch.kind==='pdf'){
      try{
        if(preparedDoc)pdfDoc=preparedDoc;
        else{
          var stored=await getPdf(ch.id);
          /* Opening a paper is itself a tap, so the Drive fetch is free to renew its
             token quietly — no need to visit settings first on a fresh device. */
          if(!stored&&gdriveOn())stored=await gdriveFetchPdf(ch.id,true,showPdfDownloading(ch));
          if(!stored){showMissingPdf(ch);restoreReaderPosition(ch,true);loadPageNote();updateProgress();return;}
          var storedBytes=await pdfBytes(stored);if(!ch.contentHash)rememberPdfFingerprint(ch,storedBytes);var lib=await loadPdfLib();pdfDoc=await lib.getDocument({data:storedBytes}).promise;
        }
        currentPage=Math.min(currentPage,pdfDoc.numPages);
        loadPdfOutline();
        /* Papers still wearing their filename get their real title from the PDF itself,
           quietly in the background. Hand-edited titles are never touched. */
        if(ch.title===filenameTitle(ch.sourceName)){
          var titleDoc=pdfDoc,titleId=ch.id;
          derivePdfTitle(titleDoc).then(function(better){
            var target=find(titleId);
            if(!better||!target||target.title!==filenameTitle(target.sourceName)||better===target.title)return;
            target.title=better;touch(target);
            if(currentId===titleId)byId('readerTitle').textContent=better;
            showReaderToast('Title read from the paper');
          });
        }
        if(readerMode==='text'&&(!ch.readerText||ch.readerV!==READER_V)){await ensureReaderData(pdfDoc,ch);updateReaderMode();}
        else if(readerMode==='pdf'){renderPdfPage();if(currentPage>1)showReaderToast('Back on page '+currentPage);}
      }catch(e){showPdfProblem(ch,e);}
    } else renderText(ch);
    restoreReaderPosition(ch,true); loadPageNote(); updateProgress();
  }
  function showPdfProblem(ch,error){
    pdfViews=[];pdfBuildKey='';
    var frame=byId('pdfFrame');frame.innerHTML='<div class="missing-file"><h2>This PDF did not open on this phone.</h2><p>'+esc(error&&error.message||'The browser stopped while preparing the page.')+'</p><button class="button" data-pdf-retry>Choose the PDF again</button> '+(readerSourceText(ch)?'<button class="soft-button" data-pdf-reader>Open Reader text</button>':'')+'</div>';
    var retry=frame.querySelector('[data-pdf-retry]'),reader=frame.querySelector('[data-pdf-reader]');retry.onclick=function(){byId('importPdfBtn').click();};if(reader)reader.onclick=function(){readerMode='text';updateReaderMode();};
    byId('prevPage').classList.add('hidden');byId('nextPage').classList.add('hidden');byId('zoomTools').classList.add('hidden');byId('tocBtn').classList.add('hidden');byId('pageNumber').textContent='';
    byId('mPrev').classList.add('hidden');byId('mNext').classList.add('hidden');byId('mPageLabel').classList.add('hidden');
  }
  function updateReaderMode(){
    var ch=find(currentId), isPdf=ch&&ch.kind==='pdf', pdf=readerMode==='pdf'&&isPdf;
    byId('pdfFrame').classList.toggle('hidden',!pdf); byId('textDocument').classList.toggle('hidden',pdf);
    byId('prevPage').classList.toggle('hidden',!pdf); byId('nextPage').classList.toggle('hidden',!pdf); byId('pageNumber').classList.toggle('hidden',!pdf);
    byId('zoomTools').classList.toggle('hidden',!pdf);
    byId('tocBtn').classList.toggle('hidden',!pdf||!(pdfOutline&&pdfOutline.length));
    byId('mPrev').classList.toggle('hidden',!pdf); byId('mNext').classList.toggle('hidden',!pdf); byId('mPageLabel').classList.toggle('hidden',!pdf);
    byId('comfortBar').classList.toggle('pdf-mode',pdf);
    var reflow=byId('reflowBtn');reflow.classList.toggle('hidden',!isPdf);reflow.classList.toggle('to-text',pdf);reflow.setAttribute('aria-pressed',String(isPdf&&!pdf));
    reflow.innerHTML=pdf?'≣ <span class="wide">Reflow</span>':'⧉ <span class="wide">PDF</span>';
    reflow.setAttribute('aria-label',pdf?'Switch to reflowed text view':'Back to the PDF view');
    if(!pdf&&ch) renderText(ch);applyFocus();loadPageNote();updateProgress();
  }
  byId('reflowBtn').onclick=async function(){
    var ch=find(currentId);if(!ch||ch.kind!=='pdf')return;clearPendingSelection();
    readerMode=readerMode==='pdf'?'text':'pdf';updateReaderMode();
    if(readerMode==='pdf'&&pdfDoc){Promise.resolve(renderPdfPage()).then(function(){scrollToPdfPage(currentPage,'auto');});return;}
    if(readerMode==='text'&&(!ch.readerText||!ch.pageParagraphs||ch.readerV!==READER_V)&&pdfDoc){
      this.disabled=true;
      try{await ensureReaderData(pdfDoc,ch);pageStartCache={};renderText(ch);showReaderToast('Reflowed from the PDF layout');}
      catch(e){showReaderToast('Could not reflow this paper');}
      finally{this.disabled=false;updateReaderMode();}
    }
    if(readerMode==='text')restoreReaderPosition(ch,false);
  };
  /* First open on a new device: the paper lives in Drive but not here yet. Put the
     download where the pages will appear — with real numbers — so a large PDF reads as
     "arriving", never as a hang. Returns the progress updater for gdriveFetchPdf. */
  function showPdfDownloading(ch){
    pdfViews=[];pdfBuildKey='';
    byId('pdfFrame').innerHTML='<div class="missing-file"><h2>Fetching this paper…</h2><p>Downloading <b>'+esc(ch.title||ch.sourceName||'this PDF')+'</b> from your Google Drive. It stays on this device, so the next open is instant.</p><div class="dl-rail"><div class="dl-fill waiting" id="dlFill"></div></div><p class="dl-note" id="dlNote">Contacting your Drive…</p></div>';
    var fmt=function(n){return n<996147?Math.max(1,Math.round(n/1024))+' KB':(n/1048576).toFixed(n<10485760?1:0)+' MB';};
    return function(loaded,total){
      var fill=byId('dlFill'),note=byId('dlNote');if(!fill)return;
      if(total>0){fill.classList.remove('waiting');fill.style.width=Math.min(100,Math.round(loaded/total*100))+'%';note.textContent=fmt(loaded)+' of '+fmt(total);}
      else if(loaded>0)note.textContent=fmt(loaded)+' so far…';
    };
  }
  function showMissingPdf(ch){
    pdfViews=[];pdfBuildKey='';
    var drive=gdriveOn()?'<button class="button" id="missingDrive">Get it from your Google Drive</button> ':'';
    var action=drive+(ch.sourceUrl?'<button class="'+(drive?'soft-button':'button')+'" id="missingSource">Download original link</button>':'<button class="'+(drive?'soft-button':'button')+'" id="missingPick">Pick from GitHub</button>');
    var help=ch.sourceUrl?'Phloem can download another local copy from its original link.':'Pick <b>'+esc(ch.sourceName||'the same PDF')+'</b> from GitHub or import it again to restore the page view here.';
    byId('pdfFrame').innerHTML='<div class="missing-file"><h2>The PDF is not on this device yet.</h2><p>Your notes and extracted text synced safely. '+help+'</p>'+action+' <button class="soft-button" id="missingText">Read extracted text</button></div>';
    var fromDrive=byId('missingDrive');
    if(fromDrive)fromDrive.onclick=async function(){
      var got=await gdriveFetchPdf(ch.id,true,showPdfDownloading(ch));
      if(got){showReaderToast('Got it — opening');openReader(ch.id);}
      else{showMissingPdf(ch);showReaderToast('Not found in your Drive yet — sync the device that has the PDF first.');}
    };
    var source=byId('missingSource'),pick=byId('missingPick');if(source)source.onclick=async function(){var ok=await importPdfUrl(ch.sourceUrl);if(!ok)showError(byId('pdfUrlStatus').textContent||'The original link is no longer available.','Could not download that PDF');};if(pick)pick.onclick=openGithubPicker;byId('missingText').onclick=function(){ readerMode='text'; updateReaderMode(); };
    byId('prevPage').classList.add('hidden'); byId('nextPage').classList.add('hidden'); byId('zoomTools').classList.add('hidden'); byId('tocBtn').classList.add('hidden'); byId('pageNumber').textContent='';
    byId('mPrev').classList.add('hidden');byId('mNext').classList.add('hidden');byId('mPageLabel').classList.add('hidden');
  }
  function applyDarkPdf(){
    var frame=byId('pdfFrame');if(frame)frame.classList.toggle('dark-paper',darkPdf);
  }
  /* Continuous vertical scroll: every page has a placeholder box up front, and real
     pixels arrive lazily as pages approach the viewport. Far-away canvases are freed
     again so long papers cannot exhaust a phone's canvas memory. */
  var pdfViews=[], pdfBuildId=0, pdfBuildKey='', pageObserver=null, renderedPages=[], layoutZoom=1;
  /* iPads sit past the 720px phone cutoffs but share Safari's tight canvas memory
     ceiling; coarse-pointer is the honest signal for "this is glass, budget like it". */
  var coarsePointer=matchMedia('(pointer: coarse)');
  /* Zoom is a multiple of fit-to-width, so 100% always means "the page fills this pane"
     and one − / + step feels the same on a phone as on a desktop. */
  function pageScale(natural){
    var pane=byId('documentPane'),fitWidth=Math.max(280,(pane.clientWidth||800)-1);
    return (fitWidth/natural.width)*(pdfFit?1:pdfZoom);
  }
  function currentBuildKey(){return pdfDoc?[currentId,pdfDoc.numPages,pdfFit,pdfZoom,byId('documentPane').clientWidth].join('|'):'';}
  async function buildPdfScroll(){
    if(!pdfDoc)return;var buildId=++pdfBuildId,frame=byId('pdfFrame');
    var first=await pdfDoc.getPage(1),natural=first.getViewport({scale:1}),scale=pageScale(natural),builtZoom=currentZoom();
    if(buildId!==pdfBuildId)return;
    /* Nearby pages that were already rendered get carried over as scaled snapshots, so a
       zoom or resize shows slightly soft paper instead of a white flash while the crisp
       re-render catches up. */
    var carry={};
    frame.querySelectorAll('.pdf-page').forEach(function(holder){
      var n=+holder.dataset.page,c=holder.querySelector('canvas');
      if(c&&c.width&&Math.abs(n-currentPage)<=2)carry[n]=c;
    });
    frame.innerHTML='';pdfViews=[];renderedPages=[];
    for(var i=1;i<=pdfDoc.numPages;i++){
      var holder=document.createElement('div');holder.className='pdf-page';holder.dataset.page=i;
      holder.style.width=Math.ceil(natural.width*scale)+'px';holder.style.height=Math.ceil(natural.height*scale)+'px';
      holder.innerHTML='<canvas></canvas><div class="highlight-layer"></div><div class="text-layer"></div>';
      frame.appendChild(holder);
      pdfViews.push({holder:holder,canvas:holder.children[0],highlights:holder.children[1],text:holder.children[2],rendered:false,rendering:false,buildId:buildId});
      if(carry[i]){
        var cw=Math.ceil(natural.width*scale),chh=Math.ceil(natural.height*scale);
        var nc=pdfViews[i-1].canvas;nc.width=cw;nc.height=chh;
        try{nc.getContext('2d').drawImage(carry[i],0,0,cw,chh);}catch(e){}
      }
    }
    applyDarkPdf();pdfBuildKey=currentBuildKey();layoutZoom=builtZoom;
    if(pageObserver)pageObserver.disconnect();
    pageObserver=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){if(entry.isIntersecting)renderPdfPageAt(+entry.target.dataset.page);});
    },{root:byId('documentPane'),rootMargin:'160% 0px'});
    pdfViews.forEach(function(view){pageObserver.observe(view.holder);});
    updatePageChrome();
    if(comfort.focus)requestAnimationFrame(placeGuide);
  }
  async function renderPdfPageAt(n){
    var view=pdfViews[n-1];if(!view||view.rendered||view.rendering||!pdfDoc||view.buildId!==pdfBuildId)return;
    view.rendering=true;
    try{
      var page=await pdfDoc.getPage(n),natural=page.getViewport({scale:1}),scale=pageScale(natural);
      if(view.buildId!==pdfBuildId)return;
      /* A slightly lower pixel ratio on narrow phones prevents large journal pages from
         exhausting Safari's canvas memory while keeping type comfortably sharp. */
      var viewport=page.getViewport({scale:scale}),ratio=Math.min(devicePixelRatio||1,innerWidth<=720?1.5:2);
      /* Zoomed-in pages are already huge in CSS pixels; cap the backing-store area so a
         675-page textbook at 250% cannot blow Safari's canvas memory budget. Tablets get
         a middle tier: desktop-sized pixel counts were what made iPad zooming flicker. */
      var areaCap=innerWidth<=720?65e5:coarsePointer.matches?9e6:14e6;
      ratio=Math.max(.5,Math.min(ratio,Math.sqrt(areaCap/Math.max(1,viewport.width*viewport.height))));
      view.holder.style.width=Math.ceil(viewport.width)+'px';view.holder.style.height=Math.ceil(viewport.height)+'px';view.holder.style.setProperty('--scale-factor',scale);
      view.canvas.width=Math.floor(viewport.width*ratio);view.canvas.height=Math.floor(viewport.height*ratio);view.canvas.style.width=Math.ceil(viewport.width)+'px';view.canvas.style.height=Math.ceil(viewport.height)+'px';
      await page.render({canvasContext:view.canvas.getContext('2d'),viewport:viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]}).promise;
      if(view.buildId!==pdfBuildId)return;
      view.text.innerHTML='';view.text.style.width=Math.ceil(viewport.width)+'px';view.text.style.height=Math.ceil(viewport.height)+'px';
      try{var textContent=await page.getTextContent({includeMarkedContent:true});await new pdfLib.TextLayer({textContentSource:textContent,container:view.text,viewport:viewport}).render();var textCh=find(currentId),pageText=contentToLines(textContent).join(' ');if(textCh&&pageText){textCh.pageTexts=textCh.pageTexts||[];if(textCh.pageTexts[n-1]!==pageText){textCh.pageTexts[n-1]=pageText;saveDerivedSoon(textCh);persist(false);}}}catch(textError){view.text.innerHTML='';}
      /* The PDF's own link annotations: citations jump to their reference, outline
         links jump between sections, URLs open in a new tab. */
      try{
        if(!view.links){view.links=document.createElement('div');view.links.className='pdf-links';view.holder.appendChild(view.links);}
        view.links.innerHTML='';
        var annots=await page.getAnnotations({intent:'display'});
        annots.forEach(function(a){
          if(a.subtype!=='Link'||!a.rect||(!a.url&&!a.dest))return;
          var r=viewport.convertToViewportRectangle(a.rect);
          var left=Math.min(r[0],r[2]),top=Math.min(r[1],r[3]),wd=Math.abs(r[2]-r[0]),ht=Math.abs(r[3]-r[1]);
          if(wd<2||ht<2)return;
          var el=document.createElement('a');el.className='pdf-link';
          el.style.left=left+'px';el.style.top=top+'px';el.style.width=wd+'px';el.style.height=ht+'px';
          if(a.url){el.href=a.url;el.target='_blank';el.rel='noopener';el.title=a.url;}
          else{el.href='#';el.title='Jump there · Backspace comes back';el.onclick=function(ev){ev.preventDefault();ev.stopPropagation();followPdfDest(a.dest);};}
          view.links.appendChild(el);
        });
      }catch(annotError){}
      view.rendered=true;renderedPages.push(n);renderPdfHighlights(n);freeFarPages();
    }catch(e){}
    finally{view.rendering=false;}
  }
  function freeFarPages(){
    /* Only be stingy when zoomed in (big canvases); at fit size, freed pages re-render
       visibly while scrolling and read as flicker. Phones and iPads both count as tight:
       zoomed canvases are what exhaust Safari's shared canvas budget on glass. */
    var tight=(innerWidth<=720||coarsePointer.matches)&&!pdfFit&&pdfZoom>1.4;
    if(renderedPages.length<=(tight?8:12))return;
    renderedPages=renderedPages.filter(function(n){
      if(Math.abs(n-currentPage)<=(tight?3:5))return true;
      var view=pdfViews[n-1];if(!view)return false;
      view.canvas.width=0;view.canvas.height=0;view.text.innerHTML='';view.highlights.innerHTML='';view.rendered=false;
      if(pageObserver){pageObserver.unobserve(view.holder);pageObserver.observe(view.holder);}
      return false;
    });
  }
  function scrollToPdfPage(n,behavior){
    var view=pdfViews[n-1];if(!view)return;var pane=byId('documentPane');
    pane.scrollTo({top:pane.scrollTop+view.holder.getBoundingClientRect().top-pane.getBoundingClientRect().top-10,behavior:behavior||'smooth'});
  }
  function updatePageChrome(){
    if(!pdfDoc)return;
    byId('pageNumber').textContent=currentPage+' / '+pdfDoc.numPages;byId('mPageLabel').textContent=currentPage+' / '+pdfDoc.numPages;
    byId('prevPage').disabled=currentPage<=1;byId('nextPage').disabled=currentPage>=pdfDoc.numPages;
    byId('mPrev').disabled=currentPage<=1;byId('mNext').disabled=currentPage>=pdfDoc.numPages;
    byId('zoomLabel').textContent=pdfFit?'Fit':Math.round(pdfZoom*100)+'%';
    loadPageNote();updateProgress();
  }
  var pageSettleTimer=null;
  /* Binary search over page offsets: measuring 600+ holders per scrolled frame was a
     real jank source on phones. Offsets are layout values, cheap to compare. */
  function pdfPageIndexAtY(contentY){
    var lo=0,hi=pdfViews.length-1;
    while(lo<hi){var mid=(lo+hi)>>1,h=pdfViews[mid].holder;if(h.offsetTop+h.offsetHeight>=contentY)hi=mid;else lo=mid+1;}
    return lo;
  }
  function trackCurrentPage(){
    if(readerMode!=='pdf'||!pdfViews.length)return;
    var pane=byId('documentPane');
    var best=pdfPageIndexAtY(pane.scrollTop+pane.clientHeight*.4)+1;
    if(best!==currentPage){
      currentPage=best;updatePageChrome();
      clearTimeout(pageSettleTimer);
      pageSettleTimer=setTimeout(function(){var ch=find(currentId);if(ch&&ch.kind==='pdf'&&ch.readPage!==currentPage){ch.readPage=currentPage;ch.updatedAt=now();persist();}},1200);
    }
  }
  async function renderPdfPage(){
    if(!pdfDoc)return;
    if(pdfBuildKey!==currentBuildKey()||!pdfViews.length){
      /* A rebuild from a layout change (zen, notebook resize, rotation) must not lose the
         reading spot: remember where we are inside the current page and land back there. */
      var pane=byId('documentPane'),hadViews=pdfViews.length>0,frac=0,xfrac=.5;
      if(hadViews){
        var view=pdfViews[currentPage-1];
        if(view){var pr=view.holder.getBoundingClientRect(),pane0=pane.getBoundingClientRect();if(pr.height)frac=(pane0.top-pr.top)/pr.height;}
        if(pane.scrollWidth>0)xfrac=(pane.scrollLeft+pane.clientWidth/2)/pane.scrollWidth;
      }
      try{await buildPdfScroll();}catch(e){showError(e.message||'This PDF could not be laid out.');return;}
      if(hadViews){
        var nv=pdfViews[currentPage-1];
        if(nv)pane.scrollTop=Math.max(0,nv.holder.offsetTop+frac*nv.holder.offsetHeight);
        pane.scrollLeft=Math.max(0,xfrac*pane.scrollWidth-pane.clientWidth/2);
      }else scrollToPdfPage(currentPage,'auto');
    }
    else updatePageChrome();
  }
  byId('prevPage').onclick=function(){ if(currentPage>1){ clearPendingSelection();scrollToPdfPage(currentPage-1); } };
  byId('nextPage').onclick=function(){ if(pdfDoc&&currentPage<pdfDoc.numPages){ clearPendingSelection();scrollToPdfPage(currentPage+1); } };
  /* A 600-page textbook needs more than ← →: tapping the page counter jumps anywhere. */
  function promptForPage(){
    if(!pdfDoc||readerMode!=='pdf')return;
    var raw=prompt('Go to page (1–'+pdfDoc.numPages+')',String(currentPage));
    if(raw===null)return;
    var n=parseInt(raw,10);
    if(n>=1&&n<=pdfDoc.numPages)gotoPdfPage(n);
    else if(raw.trim())showReaderToast('Pages run 1–'+pdfDoc.numPages);
  }
  byId('pageNumber').onclick=promptForPage;
  byId('mPageLabel').onclick=promptForPage;
  function currentZoom(){return pdfFit?1:pdfZoom;}
  /* Re-render at the new zoom, keeping the content under the anchor point (finger, cursor
     or pane center) where it was, and remember the choice with the paper. shiftX/Y say how
     far the anchor itself travelled during the gesture, so a pinch that also drags lands
     the text under the fingers' final spot, not their first. Commits run through a chain:
     a quick zoom-out-then-in used to interleave two async rebuilds and let the first one
     stomp the scroll position with stale numbers — the read spot silently jumped. The
     scale factor comes from layoutZoom (what the DOM is actually laid out at), not from
     whatever zoom was last requested. onSettled fires once this commit's layout and scroll
     are truly in place, letting the pinch preview stay up until the swap is seamless. */
  var zoomChain=Promise.resolve(),zoomSerial=0;
  function setZoom(value,anchorX,anchorY,shiftX,shiftY,onSettled){
    if(!pdfDoc){if(onSettled)onSettled();return;}
    var pane=byId('documentPane'),rect=pane.getBoundingClientRect();
    var newZoom=Math.max(.5,Math.min(4,+value||1));
    if(Math.abs(newZoom-1)<=.05)newZoom=1;
    pdfFit=newZoom===1;pdfZoom=pdfFit?1:newZoom;
    byId('zoomLabel').textContent=pdfFit?'Fit':Math.round(pdfZoom*100)+'%';
    var ch=find(currentId);
    if(ch&&ch.kind==='pdf'&&ch.zoom!==(pdfFit?0:pdfZoom)){ch.zoom=pdfFit?0:pdfZoom;persist(false);}
    var ax=anchorX===undefined?rect.width/2:anchorX-rect.left,ay=anchorY===undefined?rect.height/2:anchorY-rect.top;
    var serial=++zoomSerial;
    zoomChain=zoomChain.then(async function(){
      /* A newer request superseded this one before it touched anything: let that one
         measure and place the scroll instead of landing stale numbers here. */
      if(serial!==zoomSerial||!pdfDoc){if(onSettled)onSettled();return;}
      var f=newZoom/layoutZoom;
      var targetLeft=(pane.scrollLeft+ax)*f-ax-(shiftX||0),targetTop=(pane.scrollTop+ay)*f-ay-(shiftY||0);
      if(pdfBuildKey!==currentBuildKey()||!pdfViews.length){
        try{await buildPdfScroll();}catch(e){if(onSettled)onSettled();showError(e.message||'This PDF could not be laid out.');return;}
      }
      pane.scrollLeft=Math.max(0,targetLeft);pane.scrollTop=Math.max(0,targetTop);
      if(onSettled)onSettled();
      if(comfort.focus)requestAnimationFrame(placeGuide);
    }).catch(function(){if(onSettled)onSettled();});
  }
  byId('zoomOut').onclick=function(){setZoom(currentZoom()/1.2);};
  byId('zoomIn').onclick=function(){setZoom(currentZoom()*1.2);};
  byId('colZoomBtn').onclick=function(){cycleColumnZoom();};
  byId('zoomLabel').onclick=function(){setZoom(1);};
  byId('documentPane').addEventListener('wheel',function(e){if(readerMode==='pdf'&&(e.ctrlKey||e.metaKey)){e.preventDefault();setZoom(currentZoom()*(e.deltaY<0?1.12:1/1.12),e.clientX,e.clientY);}},{passive:false});
  /* Touch: pinch anywhere on the paper for a live preview that follows both fingers —
     spread and travel — then a crisp re-render lands under them without a snap-back;
     double-tap hops between Fit and 160%. */
  (function(){
    var pane=byId('documentPane'),frame=byId('pdfFrame');
    var pinch=null,tapStart=null,lastTapAt=0,lastTapX=0,lastTapY=0;
    /* When the page is zoomed (horizontal overflow exists), one-finger panning is taken
       over completely: native iOS panning keeps applying its own sideways delta while the
       finger is down, so correcting it after the fact can never win. The custom pan moves
       freely in both axes — a zoomed page is a flat surface to roam, and the old lock to
       one axis is what made reaching the other half of a page impossible — with a momentum
       fling on release. Un-zoomed pages keep native scrolling, where sideways drift cannot
       happen anyway. Long-press text selection is left native. */
    var panGesture=null,panVel=null,panRaf=null;
    function stopPanMomentum(){panVel=null;if(panRaf){cancelAnimationFrame(panRaf);panRaf=null;}}
    function panMomentumTick(ts){
      panRaf=null;if(!panVel)return;
      var dt=Math.min(64,ts-panVel.t);panVel.t=ts;
      pane.scrollLeft-=panVel.vx*dt;pane.scrollTop-=panVel.vy*dt;
      var decay=Math.exp(-dt/320);panVel.vx*=decay;panVel.vy*=decay;
      if(Math.hypot(panVel.vx,panVel.vy)>.02)panRaf=requestAnimationFrame(panMomentumTick);
      else panVel=null;
    }
    function startPan(t,ts){return {lastX:t.clientX,lastY:t.clientY,lastT:ts,vx:0,vy:0};}
    function handlePanMove(e){
      var t=e.touches[0],g=panGesture;
      var sel=window.getSelection&&window.getSelection();
      if(sel&&!sel.isCollapsed){panGesture=null;return;}
      e.preventDefault();
      var dx=t.clientX-g.lastX,dy=t.clientY-g.lastY,dt=Math.max(1,e.timeStamp-g.lastT);
      pane.scrollLeft-=dx;pane.scrollTop-=dy;
      var blend=Math.min(1,dt/50);
      g.vx=g.vx*(1-blend)+(dx/dt)*blend;g.vy=g.vy*(1-blend)+(dy/dt)*blend;
      g.lastX=t.clientX;g.lastY=t.clientY;g.lastT=e.timeStamp;
    }
    function endPanGesture(e){
      if(!panGesture||(e.touches&&e.touches.length))return;
      var g=panGesture;panGesture=null;
      var vx=g.vx,vy=g.vy,speed=Math.hypot(vx,vy);
      if(speed<.25)return;
      if(speed>3.5){vx*=3.5/speed;vy*=3.5/speed;}
      panVel={vx:vx,vy:vy,t:performance.now()};
      if(!panRaf)panRaf=requestAnimationFrame(panMomentumTick);
    }
    function touchDist(t){return Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);}
    function touchMid(t){return{x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2};}
    pane.addEventListener('touchstart',function(e){
      if(readerMode!=='pdf'||!pdfDoc)return;
      stopPanMomentum();
      if(e.touches.length===1){
        var t=e.touches[0];tapStart={x:t.clientX,y:t.clientY,at:Date.now()};
        panGesture=pane.scrollWidth>pane.clientWidth+1?startPan(t,e.timeStamp):null;
        return;
      }
      if(e.touches.length!==2)return;
      e.preventDefault();tapStart=null;lastTapAt=0;panGesture=null;
      var rect=pane.getBoundingClientRect(),m=touchMid(e.touches);
      pinch={d:Math.max(20,touchDist(e.touches)),zoom:currentZoom(),k:1,x:m.x,y:m.y,curX:m.x,curY:m.y};
      frame.style.transformOrigin=(pane.scrollLeft+m.x-rect.left)+'px '+(pane.scrollTop+m.y-rect.top)+'px';
      frame.style.willChange='transform';
    },{passive:false});
    pane.addEventListener('touchmove',function(e){
      if(panGesture&&!pinch&&e.touches.length===1){handlePanMove(e);return;}
      if(!pinch||e.touches.length!==2)return;
      e.preventDefault();
      var m=touchMid(e.touches),target=Math.max(.5,Math.min(4,pinch.zoom*(touchDist(e.touches)/pinch.d)));
      pinch.k=target/pinch.zoom;pinch.curX=m.x;pinch.curY=m.y;
      frame.style.transform='translate('+(m.x-pinch.x)+'px,'+(m.y-pinch.y)+'px) scale('+pinch.k+')';
    },{passive:false});
    pane.addEventListener('touchend',endPanGesture,{passive:true});
    pane.addEventListener('touchcancel',function(){panGesture=null;},{passive:true});
    function clearPinchPreview(){
      /* If a newer pinch already owns the preview when this commit settles, hand it a
         transform origin matching the fresh scroll instead of wiping its live preview. */
      if(pinch){var rect=pane.getBoundingClientRect();frame.style.transformOrigin=(pane.scrollLeft+pinch.x-rect.left)+'px '+(pane.scrollTop+pinch.y-rect.top)+'px';return;}
      frame.style.transform='';frame.style.transformOrigin='';frame.style.willChange='';
    }
    function endPinch(e){
      if(!pinch||(e.touches&&e.touches.length>=2))return;
      var commit=pinch;pinch=null;
      if(Math.abs(commit.k-1)<=.02)commit.k=1;
      var shiftX=commit.curX-commit.x,shiftY=commit.curY-commit.y;
      if(commit.k===1&&Math.hypot(shiftX,shiftY)<2){clearPinchPreview();return;}
      /* The preview stays applied while the crisp layout builds; setZoom clears it in the
         same frame the new scroll position lands, so the paper never snaps back. A two-
         finger drag (k≈1) becomes a plain scroll shift with no rebuild at all. */
      setZoom(commit.zoom*commit.k,commit.x,commit.y,shiftX,shiftY,clearPinchPreview);
      /* A finger still resting on the glass keeps panning from right here. */
      if(e.touches&&e.touches.length===1)panGesture=startPan(e.touches[0],e.timeStamp);
    }
    pane.addEventListener('touchend',endPinch);
    pane.addEventListener('touchcancel',endPinch);
    ['gesturestart','gesturechange'].forEach(function(name){pane.addEventListener(name,function(e){if(readerMode==='pdf'&&pdfDoc)e.preventDefault();});});
    pane.addEventListener('touchend',function(e){
      if(readerMode!=='pdf'||!pdfDoc||pinch||e.touches.length||!e.changedTouches||e.changedTouches.length!==1)return;
      var t=e.changedTouches[0],at=Date.now();
      if(!tapStart||Math.hypot(t.clientX-tapStart.x,t.clientY-tapStart.y)>24||at-tapStart.at>320){lastTapAt=0;return;}
      if(at-lastTapAt<350&&Math.hypot(t.clientX-lastTapX,t.clientY-lastTapY)<48){
        lastTapAt=0;
        var sel=window.getSelection&&window.getSelection();
        if(sel&&!sel.isCollapsed)return;
        if(t.target&&t.target.closest&&t.target.closest('button'))return;
        e.preventDefault();
        setZoom(currentZoom()<=1.01?1.6:1,t.clientX,t.clientY);
      }else{lastTapAt=at;lastTapX=t.clientX;lastTapY=t.clientY;}
    },{passive:false});
  })();
  document.addEventListener('keydown',function(e){
    if(byId('readerPage').classList.contains('hidden'))return;
    if(e.key==='Escape'&&recallActive){e.preventDefault();setRecall(false);return;}
    if(e.key==='Escape'&&!byId('selectionCard').classList.contains('hidden')){e.preventDefault();clearPendingSelection();return;}
    if(e.key==='Escape'&&(!byId('lookupCard').classList.contains('hidden')||highlightMode)){e.preventDefault();hideLookup();if(highlightMode){clearPendingSelection();setHighlightMode(false);showReaderToast('Marker off');}return;}
    if(e.key==='Escape'&&zenOn){e.preventDefault();setZen(false);return;}
    if(/INPUT|TEXTAREA/.test(e.target.tagName)||e.target.isContentEditable)return;
    if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'){e.preventDefault();undoHighlight();return;}
    if((e.metaKey||e.ctrlKey)&&((e.shiftKey&&e.key.toLowerCase()==='z')||(!e.shiftKey&&e.key.toLowerCase()==='y'))){e.preventDefault();redoHighlight();return;}
    if(e.key==='/'&&!e.metaKey&&!e.ctrlKey){e.preventDefault();toggleFindBar(true);return;}
    if(e.key.toLowerCase()==='f'&&!e.metaKey&&!e.ctrlKey&&!e.altKey){e.preventDefault();setZen(!zenOn);return;}
    if(e.key.toLowerCase()==='g'&&!e.metaKey&&!e.ctrlKey&&!e.altKey){e.preventDefault();byId('focusBtn').onclick();return;}
    if(e.key.toLowerCase()==='c'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&readerMode==='pdf'&&pdfDoc){e.preventDefault();cycleColumnZoom();return;}
    if(e.key==='Backspace'&&readerMode==='pdf'&&linkReturnSpot){e.preventDefault();var lrPane=byId('documentPane');lrPane.scrollTop=linkReturnSpot.top;lrPane.scrollLeft=linkReturnSpot.left;linkReturnSpot=null;showReaderToast('Back where you were');return;}
    /* Space is the settle-in key: start the slow crawl, tap again to stop. */
    if(e.key===' '&&!e.shiftKey){
      e.preventDefault();
      if(driftSpeed){setDrift(0);showReaderToast('Auto-scroll off');}
      else{setDrift(comfort.driftSpeed||4);showReaderToast('Auto-scroll · '+driftLabel()+' · ← → speed, Space stops');}
      return;
    }
    /* While the crawl is running, ← → retune its speed in either view. */
    if(driftSpeed&&!e.shiftKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
      e.preventDefault();
      comfort.driftSpeed=Math.max(.5,Math.min(60,+(comfort.driftSpeed+(e.key==='ArrowRight'?.5:-.5)).toFixed(1)));
      applyComfort();setDrift(comfort.driftSpeed);
      showReaderToast('Auto-scroll · '+driftLabel());
      return;
    }
    if(readerMode!=='pdf')return;
    var pane=byId('documentPane');
    if(e.key==='+'||e.key==='='){e.preventDefault();setZoom(currentZoom()*1.2);}
    else if(e.key==='-'||e.key==='_'){e.preventDefault();setZoom(currentZoom()/1.2);}
    else if(e.key==='0'){e.preventDefault();setZoom(1);}
    else if(e.key==='ArrowDown'){e.preventDefault();pane.scrollBy({top:74});}
    else if(e.key==='ArrowUp'){e.preventDefault();pane.scrollBy({top:-74});}
    else if(e.key==='PageDown'||(e.key===' '&&e.shiftKey)){e.preventDefault();pane.scrollBy({top:pane.clientHeight*.85,behavior:'smooth'});}
    else if(e.key==='PageUp'){e.preventDefault();pane.scrollBy({top:-pane.clientHeight*.85,behavior:'smooth'});}
    else if(e.shiftKey&&e.key==='ArrowLeft'){e.preventDefault();placeGuideScoped('column','left');showReaderToast('Guide hugs the left column · Shift+Enter for full page');}
    else if(e.shiftKey&&e.key==='ArrowRight'){e.preventDefault();placeGuideScoped('column','right');showReaderToast('Guide hugs the right column · Shift+Enter for full page');}
    else if(e.shiftKey&&e.key==='Enter'){e.preventDefault();placeGuideScoped('page');showReaderToast('Guide spans the full page');}
    else if(e.key==='ArrowRight'){e.preventDefault();byId('nextPage').click();}
    else if(e.key==='ArrowLeft'){e.preventDefault();byId('prevPage').click();}
  });
  var refitTimer=null;
  addEventListener('resize',function(){
    if(byId('readerPage').classList.contains('hidden'))return;
    setNotebookWidth(notebookWidth,false);
    clearTimeout(refitTimer);refitTimer=setTimeout(function(){if(readerMode==='pdf'&&pdfDoc)renderPdfPage();},220);
  });
  /* The pane itself is the source of truth for fit width: whenever anything changes its
     size — tucking the notebook away, bringing it back, zen mode, a drag of the divider —
     the paper re-fits. No individual code path has to remember to ask. */
  if(window.ResizeObserver){
    var paneRefitTimer=null,paneLastWidth=0;
    new ResizeObserver(function(entries){
      var width=Math.round(entries[0].contentRect.width);
      if(Math.abs(width-paneLastWidth)<2)return;
      paneLastWidth=width;
      clearTimeout(paneRefitTimer);
      paneRefitTimer=setTimeout(function(){
        if(byId('readerPage').classList.contains('hidden'))return;
        if(readerMode==='pdf'&&pdfDoc)renderPdfPage();
      },140);
    }).observe(byId('documentPane'));
  }
  /* Map each Reader paragraph back to its PDF page, so "where was this?" is one click. */
  function paraPageStarts(ch){
    if(!ch||ch.kind!=='pdf'||!ch.pageLines)return null;
    if(pageStartCache.id===ch.id&&pageStartCache.starts)return pageStartCache.starts;
    var expected=ch.readerText||'',pages=readerPagesFromLines(ch.pageLines,ch.pageParagraphs||[]),starts=[],cursor=0;
    pages.forEach(function(pageText,i){var count=paras(pageText).length;if(count)starts.push({para:cursor,page:i+1});cursor+=count;});
    if(expected&&paras(pages.filter(Boolean).join('\n\n')).length!==paras(expected).length)starts=null;
    pageStartCache={id:ch.id,starts:starts};return starts;
  }
  var readerMetaCache={id:null,v:null,meta:[]},figureUrls={};
  function loadFigureImages(){
    byId('textDocument').querySelectorAll('img[data-fig]').forEach(function(img){
      var key='fig:'+img.dataset.fig;
      if(figureUrls[key]){img.src=figureUrls[key];return;}
      getFigure(key).then(function(buf){
        if(!buf)return void (img.closest('figure')&&img.closest('figure').classList.add('hidden'));
        var url=URL.createObjectURL(new Blob([buf],{type:'image/jpeg'}));
        figureUrls[key]=url;img.src=url;
      });
    });
  }
  function renderText(ch){
    var isPdfReader=ch.kind==='pdf'&&readerMode==='text',source=isPdfReader?(ch.readerText||readerTextFromPages(ch.pageLines||[],ch.pageParagraphs||[])||ch.fr):ch.fr;
    var fr=paras(source),en=isPdfReader?[]:paras(ch.en||''),noteMap=isPdfReader?ch.readerNotes:ch.notes,marks=isPdfReader?ch.readerHighlights:ch.textHighlights,scope=isPdfReader?'reader':'text';
    var starts=isPdfReader?paraPageStarts(ch):null,startAt={};(starts||[]).forEach(function(s){startAt[s.para]=s.page;});
    var out=(isPdfReader?'<div class="reader-kicker">Reader view · headers and footers removed</div>':'')+'<h1>'+esc(ch.title||'Untitled')+'</h1><div class="byline">'+esc(ch.authors||ch.sourceName||'')+'</div>';
    var meta=null;
    if(isPdfReader&&ch.pageParagraphs){
      if(readerMetaCache.id!==ch.id||readerMetaCache.v!==ch.readerV)readerMetaCache={id:ch.id,v:ch.readerV,meta:readerStructure(ch.pageLines||[],ch.pageParagraphs).meta};
      if(readerMetaCache.meta.length===fr.length)meta=readerMetaCache.meta;
    }
    fr.forEach(function(p,i){
      var n=noteMap[i]||'',m=meta&&meta[i]||null;
      var kind=m?m.k:(p.length<90&&(/^[A-Z][A-Z\s\d:.,&()/-]{4,}$/.test(p)||/^\d+(?:\.\d+)*\s+[A-Z]/.test(p))?'h3':'');
      var cls=kind==='h1'?' reader-heading reader-h1':kind==='h2'?' reader-heading reader-h2':kind==='h3'?' reader-heading reader-h3':kind==='cap'?' reader-cap':'';
      if(startAt[i])out+='<div class="page-marker">Page '+startAt[i]+'<button type="button" data-goto-page="'+startAt[i]+'">view page</button></div>';
      var fig=m&&m.f!==undefined?'<figure class="reader-fig"><img data-fig="'+esc(ch.id)+':'+m.f+'" alt="Figure from the paper" loading="lazy"></figure>':'';
      out+='<section class="para'+cls+'">'+fig+'<div class="original" data-para-index="'+i+'">'+styledTextHtml(p,marks,m&&m.r,i)+'</div>'+(en[i]?'<div class="translation">'+esc(en[i])+'</div>':'')+'<button class="para-action" data-note="'+i+'">'+(n?'Edit margin note •':'Add margin note')+'</button><textarea class="inline-note '+(n?'':'hidden')+'" data-note-area="'+i+'" data-note-scope="'+scope+'" placeholder="Note on this paragraph…">'+esc(n)+'</textarea></section>';
    });
    byId('textDocument').classList.toggle('reader-document',isPdfReader);byId('textDocument').innerHTML=out;
    if(meta)loadFigureImages();
    byId('textDocument').querySelectorAll('[data-note]').forEach(function(b){ b.onclick=function(){ var ta=byId('textDocument').querySelector('[data-note-area="'+b.dataset.note+'"]'); ta.classList.toggle('hidden'); if(!ta.classList.contains('hidden')) ta.focus(); }; });
    byId('textDocument').querySelectorAll('[data-goto-page]').forEach(function(b){b.onclick=function(){gotoPdfPage(+b.dataset.gotoPage);};});
    byId('textDocument').onclick=function(e){
      var markEl=e.target.closest('mark[data-hl-id]');
      if(markEl&&!String(getSelection&&getSelection()||'')){
        if(highlightMode)removeHighlight(scope,null,markEl.dataset.hlId);
        else openHighlightCard({kind:scope,page:null,id:markEl.dataset.hlId},markEl.getBoundingClientRect());
        return;
      }
      if(e.target.closest('button, textarea, a, mark, img'))return;
      if(String(getSelection&&getSelection()||''))return;
      var section=e.target.closest('.para');if(!section)return;
      var idx=[].indexOf.call(paraSections(),section);
      if(idx>=0)setFocusPara(idx,false);
    };
    byId('textDocument').querySelectorAll('[data-note-area]').forEach(function(ta){ ta.oninput=function(){ var c=find(currentId),i=ta.dataset.noteArea,map=ta.dataset.noteScope==='reader'?c.readerNotes:c.notes;if(ta.value.trim())map[i]=ta.value;else delete map[i];touch(c);renderNoteIndex(); }; });
  }
  function styledTextHtml(text,marks,runs,paraIndex){
    var sel=(marks||[]).filter(function(h){return h.para===paraIndex;});
    if(!sel.length&&!(runs&&runs.length))return esc(text);
    var cuts={0:1};cuts[text.length]=1;
    sel.forEach(function(h){cuts[Math.max(0,Math.min(text.length,h.start))]=1;cuts[Math.max(0,Math.min(text.length,h.end))]=1;});
    (runs||[]).forEach(function(r){cuts[Math.max(0,Math.min(text.length,r[0]))]=1;cuts[Math.max(0,Math.min(text.length,r[1]))]=1;});
    var points=Object.keys(cuts).map(Number).sort(function(a,b){return a-b;}),out='';
    for(var i=0;i<points.length-1;i++){
      var a=points[i],b=points[i+1];if(b<=a)continue;
      var seg=esc(text.slice(a,b)),flags=0,mark=null;
      (runs||[]).forEach(function(r){if(r[0]<=a&&r[1]>=b)flags|=r[2];});
      sel.forEach(function(h){if(!mark&&h.start<=a&&h.end>=b)mark=h;});
      if(flags&2)seg='<i>'+seg+'</i>';
      if(flags&1)seg='<b>'+seg+'</b>';
      if(mark)seg='<mark class="hl-'+esc(mark.color||'yellow')+(mark.note?' hl-noted':'')+'" data-hl-id="'+esc(mark.id||'')+'"'+(mark.note?' title="✎ '+esc(mark.note)+'"':'')+'>'+seg+'</mark>';
      out+=seg;
    }
    return out;
  }
  function highlightedTextHtml(text,marks,paraIndex){return styledTextHtml(text,marks,null,paraIndex);}
  function noteKey(){ return readerMode==='pdf' ? String(currentPage) : 'document'; }
  function loadPageNote(){ var ch=find(currentId); if(!ch) return; var key=noteKey(); byId('noteHeading').textContent=readerMode==='pdf'?'Page '+currentPage+' note':'Paper note'; byId('pageNote').value=(ch.pageNotes||{})[key]||''; }
  byId('pageNote').oninput=function(){ var ch=find(currentId), key=noteKey(); if(this.value.trim()) ch.pageNotes[key]=this.value; else delete ch.pageNotes[key]; touch(ch); renderNoteIndex(); };
  byId('paperTags').onchange=function(){ var ch=find(currentId); ch.tags=this.value.split(',').map(function(t){return t.trim();}).filter(Boolean).filter(function(t,i,a){return a.indexOf(t)===i;}); touch(ch); };
  byId('editPaperBtn').onclick=function(){var ch=find(currentId);if(!ch)return;byId('paperTitleEdit').value=ch.title||'';byId('paperAuthorsEdit').value=ch.authors||'';byId('paperTagsEdit').value=(ch.tags||[]).join(', ');byId('paperDialog').showModal();};
  byId('savePaperDetails').onclick=function(){var ch=find(currentId);if(!ch)return;ch.title=byId('paperTitleEdit').value.trim()||'Untitled';ch.authors=byId('paperAuthorsEdit').value.trim();ch.tags=byId('paperTagsEdit').value.split(',').map(function(t){return t.trim();}).filter(Boolean).filter(function(t,i,a){return a.indexOf(t)===i;});touch(ch);byId('readerTitle').textContent=ch.title;byId('readerMeta').textContent=ch.authors||ch.sourceName||'';byId('paperTags').value=ch.tags.join(', ');byId('paperDialog').close();if(readerMode==='text')renderText(ch);};
  async function removePaper(ch,leaveReader){
    if(!ch)return false;var githubCopy=ch.sourcePath?' The PDF in your GitHub papers/ folder will stay there.':'';
    if(!confirm('Remove “'+(ch.title||'Untitled')+'” from Phloem? Its notes, highlights, Q&A, and local PDF will be removed.'+githubCopy))return false;
    state.deleted=state.deleted||{};state.deleted[ch.id]=now();state.chapters=state.chapters.filter(function(c){return c.id!==ch.id;});await deletePdf(ch.id);deleteFigures(ch.id);gdriveDeletePdf(ch.id);persist();
    if(currentId===ch.id){currentId=null;pdfDoc=null;}renderShelf();if(leaveReader)showPage('libraryPage');return true;
  }
  byId('deletePaperBtn').onclick=function(){removePaper(find(currentId),true);};
  function renderNoteIndex(){
    var ch=find(currentId); if(!ch) return; var all=[];
    Object.keys(ch.pageNotes||{}).forEach(function(k){ if(ch.pageNotes[k]) all.push('<div class="mini-note note-written"'+(k==='document'?'':' data-jump-page="'+esc(k)+'"')+'><b>'+(k==='document'?'Paper':'Page '+esc(k))+'</b><br>'+esc(ch.pageNotes[k].slice(0,150))+'</div>'); });
    Object.keys(ch.notes||{}).forEach(function(k){ if(ch.notes[k]) all.push('<div class="mini-note note-written" data-jump-para="'+(+k)+'"><b>Paragraph '+(+k+1)+'</b><br>'+esc(ch.notes[k].slice(0,150))+'</div>'); });
    Object.keys(ch.readerNotes||{}).forEach(function(k){ if(ch.readerNotes[k]) all.push('<div class="mini-note note-written" data-jump-para="'+(+k)+'"><b>Reader paragraph '+(+k+1)+'</b><br>'+esc(ch.readerNotes[k].slice(0,150))+'</div>'); });
    Object.keys(ch.highlights||{}).forEach(function(page){(ch.highlights[page]||[]).forEach(function(h){all.push('<div class="mini-note" data-jump-page="'+esc(page)+'"><b><span class="tag hl-'+esc(h.color||'yellow')+'">Highlight</span> · page '+esc(page)+'</b><br>“'+esc((h.text||'').slice(0,145))+'”'+(h.note?'<span class="hl-note">✎ '+esc(h.note.slice(0,120))+'</span>':'')+'<button class="remove-highlight" data-remove-highlight="'+esc(h.id)+'" data-highlight-page="'+esc(page)+'" aria-label="Remove highlight">×</button></div>');});});
    (ch.textHighlights||[]).forEach(function(h){all.push('<div class="mini-note" data-jump-para="'+h.para+'"><b><span class="tag hl-'+esc(h.color||'yellow')+'">Highlight</span> · paragraph '+(h.para+1)+'</b><br>“'+esc((h.text||'').slice(0,145))+'”'+(h.note?'<span class="hl-note">✎ '+esc(h.note.slice(0,120))+'</span>':'')+'<button class="remove-highlight" data-remove-text-highlight="'+esc(h.id)+'" aria-label="Remove highlight">×</button></div>');});
    (ch.readerHighlights||[]).forEach(function(h){all.push('<div class="mini-note" data-jump-para="'+h.para+'"><b><span class="tag hl-'+esc(h.color||'yellow')+'">Highlight</span> · Reader paragraph '+(h.para+1)+'</b><br>“'+esc((h.text||'').slice(0,145))+'”'+(h.note?'<span class="hl-note">✎ '+esc(h.note.slice(0,120))+'</span>':'')+'<button class="remove-highlight" data-remove-reader-highlight="'+esc(h.id)+'" aria-label="Remove Reader highlight">×</button></div>');});
    byId('noteIndex').innerHTML=all.join('');
    byId('noteIndex').querySelectorAll('[data-jump-page],[data-jump-para]').forEach(function(d){d.onclick=function(e){
      if(e.target.closest('.remove-highlight'))return;
      if(d.dataset.jumpPage)gotoPdfPage(+d.dataset.jumpPage);
      else jumpToParagraph(+d.dataset.jumpPara);
    };});
    byId('noteIndex').querySelectorAll('[data-remove-highlight]').forEach(function(b){b.onclick=function(){removeHighlight('pdf',b.dataset.highlightPage,b.dataset.removeHighlight);};});
    byId('noteIndex').querySelectorAll('[data-remove-text-highlight]').forEach(function(b){b.onclick=function(){removeHighlight('text',null,b.dataset.removeTextHighlight);};});
    byId('noteIndex').querySelectorAll('[data-remove-reader-highlight]').forEach(function(b){b.onclick=function(){removeHighlight('reader',null,b.dataset.removeReaderHighlight);};});
  }

  /* Selectable PDF/text layers and a direct, color marker interaction. */
  var markerPointerDown=false,selectionPointerDown=false,snappingSelection=false;
  /* The last real selection survives page turns and sheet-opening taps, so "My selection"
     in Ask AI still works after the on-screen selection has collapsed. */
  var lastAskSelection=null;
  function clearPendingSelection(keepCard){clearTimeout(highlightCommitTimer);pendingSelection=null;byId('highlightBtn').classList.remove('ready');if(!keepCard)hideSelectionCard();var s=window.getSelection&&window.getSelection();if(s)s.removeAllRanges();}
  function scheduleHighlightCommit(delay){clearTimeout(highlightCommitTimer);highlightCommitTimer=setTimeout(function(){if(highlightMode)commitPendingHighlight();},delay);}
  function setPendingSelection(selection){pendingSelection=selection;lastAskSelection=selection;byId('highlightBtn').classList.add('ready');if(highlightMode&&!markerPointerDown)scheduleHighlightCommit(550);}
  function setHighlightColor(color){
    highlightColor=['yellow','mint','coral','blue'].indexOf(color)>=0?color:'yellow';
    document.querySelectorAll('[data-highlight-color]').forEach(function(x){x.classList.toggle('selected',x.dataset.highlightColor===highlightColor);});
  }
  function setHighlightMode(on){
    highlightMode=!!on;var btn=byId('highlightBtn');if(!btn)return;
    btn.classList.toggle('active',highlightMode);btn.setAttribute('aria-pressed',String(highlightMode));btn.textContent=highlightMode?'✦ Marker on':'✦ Marker';byId('highlightPalette').classList.toggle('hidden',!highlightMode);document.body.classList.toggle('marker-on',highlightMode);
  }
  function normalizedPassage(value){return String(value||'').replace(/\s+/g,' ').trim();}
  function rectSetMatch(a,b){
    a=a||[];b=b||[];if(!a.length||!b.length)return 0;
    function area(r){return Math.max(0,+r.w||0)*Math.max(0,+r.h||0);}
    var totalA=a.reduce(function(sum,r){return sum+area(r);},0),totalB=b.reduce(function(sum,r){return sum+area(r);},0),intersection=0;
    a.forEach(function(left){b.forEach(function(right){var x=Math.max(+left.x||0,+right.x||0),y=Math.max(+left.y||0,+right.y||0),rightEdge=Math.min((+left.x||0)+(+left.w||0),(+right.x||0)+(+right.w||0)),bottom=Math.min((+left.y||0)+(+left.h||0),(+right.y||0)+(+right.h||0));intersection+=Math.max(0,rightEdge-x)*Math.max(0,bottom-y);});});
    return intersection/Math.max(totalA,totalB,.000001);
  }
  function existingHighlightRef(selection){
    var ch=find(currentId);if(!ch||!selection)return null;
    var list=highlightListFor(ch,selection.kind,selection.page),wanted=normalizedPassage(selection.text),best=null,bestScore=0;
    list.forEach(function(item){
      var sameText=!!wanted&&normalizedPassage(item.text)===wanted,score=0;
      if(selection.kind==='pdf'){
        var geometry=rectSetMatch(selection.rects,item.rects);
        if(geometry>=.68)score=3+geometry;
        else if(sameText&&geometry>=.28)score=2+geometry;
        else if(sameText&&(!(selection.rects||[]).length||!(item.rects||[]).length))score=1;
      }else if(+item.para===+selection.para){
        var start=Math.max(+selection.start||0,+item.start||0),end=Math.min(+selection.end||0,+item.end||0),overlap=Math.max(0,end-start),span=Math.max((+selection.end||0)-(+selection.start||0),(+item.end||0)-(+item.start||0),1),coverage=overlap/span;
        if(+selection.start===+item.start&&+selection.end===+item.end)score=4;
        else if(coverage>=.82)score=3+coverage;
        else if(sameText&&overlap>0)score=2;
      }
      if(score>bestScore||(score===bestScore&&best&&(item.at||0)>=(best.item.at||0))){bestScore=score;best={kind:selection.kind,page:selection.kind==='pdf'?String(selection.page):null,id:item.id,item:item};}
    });
    return bestScore?best:null;
  }
  function reopenExistingHighlight(selection,anchor){
    var ref=existingHighlightRef(selection);if(!ref)return false;
    clearTimeout(highlightCommitTimer);pendingSelection=null;byId('highlightBtn').classList.remove('ready');
    if(!selectionPointerDown)openHighlightCard(ref,anchor);
    return true;
  }
  function mergeHighlightRects(rects){
    var sorted=rects.slice().sort(function(a,b){return Math.abs(a.y-b.y)>.002?a.y-b.y:a.x-b.x;}),out=[];
    sorted.forEach(function(r){var last=out[out.length-1];if(last){var sameLine=Math.abs((r.y+r.h/2)-(last.y+last.h/2))<Math.max(r.h,last.h)*.58,gap=r.x-(last.x+last.w);if(sameLine&&gap<Math.max(.008,Math.max(r.h,last.h)*.72)){var right=Math.max(last.x+last.w,r.x+r.w),bottom=Math.max(last.y+last.h,r.y+r.h);last.x=Math.min(last.x,r.x);last.y=Math.min(last.y,r.y);last.w=right-last.x;last.h=bottom-last.y;return;}}out.push({x:r.x,y:r.y,w:r.w,h:r.h});});
    return out;
  }
  function isWordPart(text,index){
    var c=text.charAt(index);if(/[\p{L}\p{N}_]/u.test(c))return true;
    return /['’\-]/.test(c)&&index>0&&index<text.length-1&&/[\p{L}\p{N}]/u.test(text.charAt(index-1))&&/[\p{L}\p{N}]/u.test(text.charAt(index+1));
  }
  function adjacentTextNode(node,root,direction){
    var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);walker.currentNode=node;var next;
    while((next=direction<0?walker.previousNode():walker.nextNode())){if((next.nodeValue||'').length)return next;}return null;
  }
  function textNodesTouch(left,right){
    var a=document.createRange(),b=document.createRange();a.selectNodeContents(left);b.selectNodeContents(right);
    var ar=a.getBoundingClientRect(),br=b.getBoundingClientRect(),height=Math.min(ar.height,br.height);
    if(!ar.width||!br.width||!height)return false;
    var sameLine=Math.abs((ar.top+ar.bottom)/2-(br.top+br.bottom)/2)<=Math.max(ar.height,br.height)*.38,gap=br.left-ar.right;
    return sameLine&&br.left>=ar.left-1&&gap>=-Math.max(2,height*.08)&&gap<=Math.max(2,height*.13);
  }
  function snapSelectionToWords(selection){
    if(snappingSelection||!selection||selection.isCollapsed||!selection.rangeCount)return;
    var range=selection.getRangeAt(0).cloneRange(),startNode=range.startContainer,endNode=range.endContainer;
    if(startNode.nodeType!==3||endNode.nodeType!==3)return;
    var startRoot=startNode.parentElement&&startNode.parentElement.closest('.text-layer,.original'),endRoot=endNode.parentElement&&endNode.parentElement.closest('.text-layer,.original');if(!startRoot||startRoot!==endRoot)return;
    var start=range.startOffset,end=range.endOffset,startText=startNode.nodeValue||'',endText=endNode.nodeValue||'',changed=false,neighbor,neighborText;
    while(start>0&&isWordPart(startText,start-1)){start--;changed=true;}
    while(end<endText.length&&isWordPart(endText,end)){end++;changed=true;}
    while(start===0&&startText.length&&isWordPart(startText,0)){
      neighbor=adjacentTextNode(startNode,startRoot,-1);neighborText=neighbor&&neighbor.nodeValue||'';
      if(!neighbor||!neighborText.length||!isWordPart(neighborText,neighborText.length-1)||!textNodesTouch(neighbor,startNode))break;
      startNode=neighbor;startText=neighborText;start=startText.length;while(start>0&&isWordPart(startText,start-1))start--;changed=true;
    }
    while(end===endText.length&&endText.length&&isWordPart(endText,endText.length-1)){
      neighbor=adjacentTextNode(endNode,endRoot,1);neighborText=neighbor&&neighbor.nodeValue||'';
      if(!neighbor||!neighborText.length||!isWordPart(neighborText,0)||!textNodesTouch(endNode,neighbor))break;
      endNode=neighbor;endText=neighborText;end=0;while(end<endText.length&&isWordPart(endText,end))end++;changed=true;
    }
    if(!changed)return;range.setStart(startNode,start);range.setEnd(endNode,end);snappingSelection=true;selection.removeAllRanges();selection.addRange(range);snappingSelection=false;
  }
  function captureSelection(){
    if(snappingSelection||byId('readerPage').classList.contains('hidden'))return;
    var selection=window.getSelection();if(!selection||selection.isCollapsed||!selection.rangeCount)return;
    var range=selection.getRangeAt(0),text=selection.toString().replace(/\s+/g,' ').trim(),selectionRect=range.getBoundingClientRect();if(!text)return;
    if(readerMode==='pdf'){
      var host=range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
      var page=host&&host.closest?host.closest('.pdf-page'):null;if(!page||!byId('pdfFrame').contains(page)||!page.querySelector('.text-layer').contains(range.commonAncestorContainer))return;
      var base=page.getBoundingClientRect(),rects=Array.from(range.getClientRects()).filter(function(r){return r.width>1&&r.height>1;}).map(function(r){var x=Math.max(0,(r.left-base.left-1.5)/base.width),y=Math.max(0,(r.top-base.top+r.height*.12)/base.height);return{x:x,y:y,w:Math.min(1-x,(r.width+3)/base.width),h:Math.min(1-y,(r.height*.76)/base.height)};}).filter(function(r){return r.x<1&&r.y<1;});rects=mergeHighlightRects(rects);
      if(rects.length){var pdfSelection={kind:'pdf',page:+page.dataset.page||currentPage,text:text,rects:rects};if(reopenExistingHighlight(pdfSelection,selectionRect))return;setPendingSelection(pdfSelection);if(!selectionPointerDown&&!highlightMode)showSelectionCard(pdfSelection,selectionRect);}
    }else{
      var original=range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;original=original&&original.closest('.original');if(!original||!byId('textDocument').contains(original))return;
      var startOwner=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement,endOwner=range.endContainer.nodeType===1?range.endContainer:range.endContainer.parentElement;if(!original.contains(startOwner)||!original.contains(endOwner))return;
      var before=document.createRange();before.selectNodeContents(original);before.setEnd(range.startContainer,range.startOffset);var through=document.createRange();through.selectNodeContents(original);through.setEnd(range.endContainer,range.endOffset);
      var ch=find(currentId),textSelection={kind:ch&&ch.kind==='pdf'?'reader':'text',para:+original.dataset.paraIndex,start:before.toString().length,end:through.toString().length,text:text};if(reopenExistingHighlight(textSelection,selectionRect))return;setPendingSelection(textSelection);if(!selectionPointerDown&&!highlightMode)showSelectionCard(textSelection,selectionRect);
    }
  }
  document.addEventListener('selectionchange',captureSelection);
  byId('documentPane').addEventListener('pointerdown',function(e){
    if(!e.target.closest('.text-layer,.original'))return;
    hideSelectionCard();
    selectionPointerDown=true;document.body.classList.add('selecting-paper');
    if(highlightMode){markerPointerDown=true;clearTimeout(highlightCommitTimer);}
  });
  function finishPaperSelection(cancelled){
    if(!selectionPointerDown&&!markerPointerDown)return;var commit=highlightMode&&markerPointerDown;
    selectionPointerDown=false;markerPointerDown=false;document.body.classList.remove('selecting-paper');
    if(cancelled)return;setTimeout(function(){var selection=window.getSelection&&window.getSelection();snapSelectionToWords(selection);captureSelection();if(commit)scheduleHighlightCommit(60);},0);
  }
  document.addEventListener('pointerup',function(){finishPaperSelection(false);});
  document.addEventListener('pointercancel',function(){finishPaperSelection(true);});
  byId('highlightBtn').onclick=function(){
    if(pendingSelection){commitPendingHighlight();return;}setHighlightMode(!highlightMode);
  };
  document.querySelectorAll('[data-highlight-color]').forEach(function(b){b.onclick=function(){setHighlightColor(b.dataset.highlightColor);if(!highlightMode)setHighlightMode(true);};});
  function savePendingHighlight(note,keepCard){
    clearTimeout(highlightCommitTimer);var ch=find(currentId),h=pendingSelection;if(!ch||!h)return;
    var existing=existingHighlightRef(h);if(existing){clearPendingSelection(true);openHighlightCard(existing,selectionAnchor);return{kind:existing.kind,page:existing.page,id:existing.id,item:existing.item,selection:h,existing:true};}
    var item={id:uid('h'),text:h.text,color:highlightColor,at:now()};if(String(note||'').trim())item.note=String(note).trim();var saved;
    if(h.kind==='pdf'){
      var page=String(h.page);if(!ch.highlights[page])ch.highlights[page]=[];item.rects=h.rects;
      /* Text-offset anchor beside the rects: offsets into the whitespace-normalized
         page text, so a future re-extraction can re-derive where this quote lives. */
      var pageText=String((ch.pageTexts||[])[h.page-1]||'').replace(/\s+/g,' '),found=pageText.indexOf(h.text);
      if(found>=0){item.start=found;item.end=found+h.text.length;}
      ch.highlights[page].push(item);recordHighlightAction({op:'add',kind:'pdf',page:page,item:item});touch(ch);renderPdfHighlights(+page);saved={kind:'pdf',page:page,id:item.id,item:item,selection:h};
    }else{
      var target=h.kind==='reader'?ch.readerHighlights:ch.textHighlights;
      item.para=h.para;item.start=h.start;item.end=h.end;target.push(item);recordHighlightAction({op:'add',kind:h.kind,item:item});touch(ch);renderText(ch);saved={kind:h.kind,page:null,id:item.id,item:item,selection:h};
    }
    clearPendingSelection(keepCard);renderNoteIndex();return saved;
  }
  function commitPendingHighlight(){
    var saved=savePendingHighlight('',false);if(saved)showReaderToast(saved.existing?'Already highlighted · reopened':'Passage highlighted');return saved;
  }
  function ensureSelectionNoteTarget(){
    if(selectionNoteTarget)return selectionNoteTarget;selectionNoteTarget=savePendingHighlight('',true);return selectionNoteTarget;
  }
  byId('selectionClose').onclick=function(){clearPendingSelection();};
  byId('selectionExplain').onclick=function(){
    var selection=pendingSelection||lastAskSelection,rect=selectionAnchor;if(!selection)return;hideSelectionCard();clearPendingSelection(true);queueLookup(selection.text,rect,selection,0);
  };
  byId('selectionAsk').onclick=function(){setSelectionAction('selectionAsk');openSelectionInAi();};
  byId('selectionHighlight').onclick=function(){setSelectionAction('selectionHighlight');commitPendingHighlight();};
  byId('selectionAddNote').onclick=function(){
    var target=ensureSelectionNoteTarget();if(!target)return;setSelectionAction('selectionAddNote');byId('selectionEyebrow').textContent='Highlight note';byId('selectionNoteBox').classList.remove('hidden');
    byId('selectionHighlight').textContent='Highlighted ✓';byId('selectionHighlight').disabled=true;byId('selectionAddNote').textContent='Editing note';
    refreshSelectionAskContext();placeSelectionCard();requestAnimationFrame(function(){byId('selectionNote').focus({preventScroll:true});});
  };
  byId('selectionNote').oninput=function(){
    var target=ensureSelectionNoteTarget(),ch=find(currentId);if(!target||!ch)return;if(this.value.trim())target.item.note=this.value;else delete target.item.note;
    touch(ch);renderNoteIndex();byId('selectionNoteStatus').textContent=this.value.trim()?'Saved locally as you type':'Highlight saved · note is empty';refreshSelectionAskContext();placeSelectionCard();
  };
  byId('selectionNote').onfocus=function(){if(selectionNoteTarget)setSelectionAction('selectionAddNote');};
  function highlightListFor(ch,kind,page){
    if(kind==='pdf'){ch.highlights=ch.highlights||{};if(!ch.highlights[String(page)])ch.highlights[String(page)]=[];return ch.highlights[String(page)];}
    if(kind==='reader'){ch.readerHighlights=ch.readerHighlights||[];return ch.readerHighlights;}
    ch.textHighlights=ch.textHighlights||[];return ch.textHighlights;
  }
  function findHighlightRecord(ref){
    var ch=find(currentId);if(!ch||!ref)return null;
    return highlightListFor(ch,ref.kind,ref.page).find(function(h){return h.id===ref.id;})||null;
  }
  function refreshHighlightViews(kind,page){
    var ch=find(currentId);if(!ch)return;
    if(kind==='pdf'){if(readerMode==='pdf')renderPdfHighlights(+page);}
    else if(readerMode==='text')renderText(ch);
    renderNoteIndex();
  }
  function removeHighlight(kind,page,id){
    var ch=find(currentId);if(!ch||!id)return false;
    var list=highlightListFor(ch,kind,page),item=list.find(function(h){return h.id===id;});
    if(!item)return false;
    var next=list.filter(function(h){return h.id!==id;});
    if(kind==='pdf')ch.highlights[String(page)]=next;
    else if(kind==='reader')ch.readerHighlights=next;
    else ch.textHighlights=next;
    recordHighlightAction({op:'remove',kind:kind,page:page,item:item});
    if(activeCardRef&&activeCardRef.id===id)hideHighlightCard();
    clearPendingSelection();touch(ch);refreshHighlightViews(kind,page);
    showReaderToast('Highlight removed');
    return true;
  }
  function pdfHighlightAtPoint(pageEl,clientX,clientY){
    var ch=find(currentId);if(!ch)return null;
    var page=+pageEl.dataset.page||currentPage,list=(ch.highlights||{})[String(page)]||[];
    var base=pageEl.getBoundingClientRect();if(!base.width||!base.height||!list.length)return null;
    var x=(clientX-base.left)/base.width,y=(clientY-base.top)/base.height,hit=null;
    list.forEach(function(h){(h.rects||[]).some(function(r){var padY=Math.max(.004,r.h*.3),padX=.004;if(x>=r.x-padX&&x<=r.x+r.w+padX&&y>=r.y-padY&&y<=r.y+r.h+padY){if(!hit||(h.at||0)>=(hit.at||0))hit=h;return true;}return false;});});
    return hit?{page:page,item:hit}:null;
  }
  byId('pdfFrame').addEventListener('click',function(e){
    if(pendingSelection)return;
    var s=window.getSelection&&window.getSelection();if(s&&!s.isCollapsed)return;
    var pageEl=e.target.closest('.pdf-page');if(!pageEl)return;
    var hit=pdfHighlightAtPoint(pageEl,e.clientX,e.clientY);if(!hit)return;
    if(highlightMode)removeHighlight('pdf',hit.page,hit.item.id);
    else openHighlightCard({kind:'pdf',page:hit.page,id:hit.item.id},{left:e.clientX,right:e.clientX,top:e.clientY,bottom:e.clientY});
  });
  /* One shared undo trail for marker work: strokes, erasures and recolors all rewind
     in order (⌘Z) and roll forward again (⇧⌘Z / ⌘Y). Cleared when another paper opens. */
  var highlightHistory=[],highlightFuture=[];
  function recordHighlightAction(action){highlightHistory.push(action);if(highlightHistory.length>100)highlightHistory.shift();highlightFuture=[];}
  function applyHighlightAction(action,undoing){
    var ch=find(currentId);if(!ch)return false;
    var list=highlightListFor(ch,action.kind,action.page);
    if(action.op==='recolor'){
      var rec=list.find(function(h){return h.id===action.item.id;});if(!rec)return false;
      rec.color=undoing?action.from:action.to;
      if(activeCardRef&&activeCardRef.id===rec.id)document.querySelectorAll('[data-card-color]').forEach(function(b){b.classList.toggle('selected',b.dataset.cardColor===rec.color);});
    }else{
      var insert=(action.op==='add')?undoing===false:undoing===true;
      if(insert){if(!list.find(function(h){return h.id===action.item.id;}))list.push(action.item);}
      else{
        var next=list.filter(function(h){return h.id!==action.item.id;});
        if(action.kind==='pdf')ch.highlights[String(action.page)]=next;
        else if(action.kind==='reader')ch.readerHighlights=next;
        else ch.textHighlights=next;
        if(activeCardRef&&activeCardRef.id===action.item.id)hideHighlightCard();
      }
    }
    clearPendingSelection();touch(ch);refreshHighlightViews(action.kind,action.page);
    return true;
  }
  function undoHighlight(){
    var action=highlightHistory.pop();
    if(!action){showReaderToast('Nothing to undo');return;}
    if(applyHighlightAction(action,true)){highlightFuture.push(action);showReaderToast(action.op==='add'?'Highlight undone':action.op==='remove'?'Highlight restored':'Color undone');}
  }
  function redoHighlight(){
    var action=highlightFuture.pop();
    if(!action){showReaderToast('Nothing to redo');return;}
    if(applyHighlightAction(action,false)){highlightHistory.push(action);showReaderToast(action.op==='add'?'Highlight restored':action.op==='remove'?'Highlight removed':'Color reapplied');}
  }
  /* A saved highlight reuses the same passage card as a fresh selection. Its small
     management row adds recolor/remove without sending the reader to another UI. */
  var activeCardRef=null;
  function hideHighlightCard(){activeCardRef=null;byId('selectionSavedTools').classList.add('hidden');}
  function openHighlightCard(ref,anchor){
    var rec=findHighlightRecord(ref);if(!rec)return;
    hideLookup();hideSelectionCard();activeCardRef=ref;
    var selection=ref.kind==='pdf'?{kind:'pdf',page:+ref.page||currentPage,text:rec.text||'',rects:rec.rects||[]}:{kind:ref.kind,para:+rec.para||0,start:+rec.start||0,end:+rec.end||0,text:rec.text||''};
    lastAskSelection=selection;selectionNoteTarget={kind:ref.kind,page:ref.page,id:ref.id,item:rec,selection:selection};pendingSelection=null;byId('highlightBtn').classList.remove('ready');
    var card=byId('selectionCard'),words=selection.text.trim().split(/\s+/).length;card.classList.remove('ai-open');byId('selectionAiBox').classList.add('hidden');byId('selectionEyebrow').textContent='Saved highlight';byId('selectionExcerpt').textContent='“'+selection.text+'”';
    byId('selectionSecondary').classList.toggle('hidden',selection.text.length>140||words>14);byId('selectionSavedTools').classList.remove('hidden');byId('selectionNoteBox').classList.remove('hidden');byId('selectionNote').value=rec.note||'';byId('selectionNoteStatus').textContent=rec.note?'Saved with this highlight':'Add a note if you want to remember why it matters';
    byId('selectionHighlight').disabled=true;byId('selectionHighlight').textContent='Highlighted ✓';byId('selectionAddNote').textContent='Note';setSelectionAction('selectionHighlight');refreshSelectionAskContext();
    document.querySelectorAll('[data-card-color]').forEach(function(b){b.classList.toggle('selected',b.dataset.cardColor===(rec.color||'yellow'));});
    card.classList.remove('hidden');placeSelectionCard(anchor||{left:innerWidth/2,right:innerWidth/2,top:innerHeight/2,bottom:innerHeight/2});
  }
  byId('selectionRemoveHighlight').onclick=function(){if(activeCardRef)removeHighlight(activeCardRef.kind,activeCardRef.page,activeCardRef.id);};
  document.querySelectorAll('[data-card-color]').forEach(function(b){b.onclick=function(){
    var rec=findHighlightRecord(activeCardRef);if(!rec)return;
    var to=b.dataset.cardColor;if(to===(rec.color||'yellow'))return;
    recordHighlightAction({op:'recolor',kind:activeCardRef.kind,page:activeCardRef.page,item:rec,from:rec.color||'yellow',to:to});
    rec.color=to;var ch=find(currentId);if(ch)touch(ch);
    document.querySelectorAll('[data-card-color]').forEach(function(x){x.classList.toggle('selected',x===b);});
    refreshHighlightViews(activeCardRef.kind,activeCardRef.page);
  };});
  function renderPdfHighlights(pageNum){
    var ch=find(currentId);if(!ch)return;
    (pageNum?[pageNum]:renderedPages.slice()).forEach(function(n){
      var view=pdfViews[n-1];if(!view)return;view.highlights.innerHTML='';
      ((ch.highlights||{})[String(n)]||[]).forEach(function(h){mergeHighlightRects(h.rects||[]).forEach(function(r){var d=document.createElement('div');d.className='saved-highlight hl-'+(h.color||'yellow');d.style.left=(r.x*100)+'%';d.style.top=(r.y*100)+'%';d.style.width=(r.w*100)+'%';d.style.height=(r.h*100)+'%';d.title=(h.text||'Highlight')+(h.note?'\n✎ '+h.note:'');view.highlights.appendChild(d);});});
    });
  }

  /* notebook tabs */
  function setRecall(on){
    recallActive=!!on;byId('recallShield').classList.toggle('hidden',!recallActive);byId('recallShield').setAttribute('aria-hidden',String(!recallActive));byId('recallPrompt').classList.toggle('hidden',!recallActive);byId('recallBtn').setAttribute('aria-pressed',String(recallActive));byId('recallBtn').textContent=recallActive?'Show paper':'↻ Recall';
    if(recallActive){if(innerWidth<=720)toggleSheet(true);requestAnimationFrame(function(){var note=byId('pageNote');note.focus({preventScroll:true});note.setSelectionRange(note.value.length,note.value.length);});}
  }
  byId('recallBtn').onclick=function(){setRecall(!recallActive);};
  byId('recallDone').onclick=function(){setRecall(false);};
  function switchTab(id){ if(id!=='notesPanel'&&recallActive)setRecall(false);document.querySelectorAll('.tab').forEach(function(t){var on=t.dataset.tab===id;t.classList.toggle('active',on);t.setAttribute('aria-selected',String(on));}); ['notesPanel','aiPanel'].forEach(function(p){byId(p).classList.toggle('hidden',p!==id);});syncMobileSheetButtons(); }
  document.querySelectorAll('.tab').forEach(function(t){ t.onclick=function(){ switchTab(t.dataset.tab); }; });

  /* Screenshot OCR -> text AI context, plus current-page questions. */
  function setCurrentPageContext(){
    var ch=find(currentId);if(!ch)return false;
    var text=readerMode==='pdf'?(ch.pageTexts||[])[currentPage-1]:(ch.kind==='pdf'?(ch.readerText||ch.fr):ch.fr), thumb='';
    var view=pdfViews[currentPage-1],c=view&&view.canvas; if(readerMode==='pdf'&&c&&c.width) try{thumb=makeThumb(c);}catch(e){}
    setAiContext(text||'',thumb,readerMode==='pdf'?'Page '+currentPage:(ch.kind==='pdf'?'Reader text':'Paper text'));
    return !!text;
  }
  byId('aiUseCurrent').onclick=function(){if(setCurrentPageContext())byId('aiQuestion').focus({preventScroll:true});};
  /* Selection as context: the passage's exact text from the PDF's own text layer (no OCR
     round-trip) plus surrounding page text for grounding, and a snapshot of the actual
     spot cropped from the rendered page as the visual record. */
  function useSelectionForAi(sel,note,inline){
    var ch=find(currentId);sel=sel||lastAskSelection;
    if(!ch||!sel||!sel.text){byId('aiStatus').textContent='Select or highlight a passage on the paper first, then come back here.';return;}
    var around='',label='Selection',thumb='';
    if(sel.kind==='pdf'){
      label='Selection · p. '+sel.page;
      var pageText=(ch.pageTexts||[])[sel.page-1]||'';
      var probe=sel.text.slice(0,80),idx=probe?pageText.indexOf(probe):-1;
      around=idx>=0?pageText.slice(Math.max(0,idx-700),idx+probe.length+700):pageText.slice(0,1400);
      var view=pdfViews[sel.page-1];
      if(view&&view.canvas&&view.canvas.width&&sel.rects&&sel.rects.length){try{thumb=makeRegionThumb(view.canvas,sel.rects);}catch(e){}}
    }else{
      label='Selection · ¶'+((sel.para||0)+1);
      var source=sel.kind==='reader'?readerSourceText(ch):ch.fr;
      around=paras(source)[sel.para]||'';
    }
    note=String(note||'').trim();setAiContext('Selected passage:\n“'+sel.text+'”'+(around?'\n\nSurrounding text:\n'+around:'')+(note?'\n\nMy related note:\n'+note:''),thumb,label+(note?' + note':''));
    if(!inline){byId('aiStatus').textContent=note?'Context includes the passage and your note. Ask away.':'Context is that passage. Ask away.';byId('aiQuestion').focus({preventScroll:true});}
    return true;
  }
  byId('aiUseSelection').onclick=function(){useSelectionForAi(lastAskSelection,'');};
  /* Guide area as context: whatever lines the reading band is sitting on right now.
     Text comes from the PDF's own text layer (spans whose line center falls inside the
     band), so it is exact; the band region is cropped from the rendered page as the
     visual record. */
  byId('aiUseGuide').onclick=function(){
    var ch=find(currentId);if(!ch)return;
    if(!comfort.focus||!byId('paneSpotlight').classList.contains('placed')){byId('aiStatus').textContent='Turn on the reading guide (▰) and rest it on a passage first.';return;}
    var band=byId('guideBand').getBoundingClientRect();
    if(!band.width||!band.height){byId('aiStatus').textContent='The guide is not on the paper right now.';return;}
    var text='',label='Guide area',thumb='';
    if(readerMode==='pdf'){
      if(!pdfViews.length)return;
      var pane=byId('documentPane'),paneRect=pane.getBoundingClientRect();
      var idx=pdfPageIndexAtY(pane.scrollTop+(band.top+band.height/2-paneRect.top));
      var view=pdfViews[idx];if(!view)return;
      var pageRect=view.holder.getBoundingClientRect(),parts=[];
      view.text.querySelectorAll('span').forEach(function(s){
        var t=s.textContent;if(!t||!t.trim())return;
        var r=s.getBoundingClientRect();if(!r.width||!r.height)return;
        var cy=r.top+r.height/2;
        if(cy<band.top||cy>band.bottom)return;
        if(r.right<band.left||r.left>band.right)return;
        parts.push(t);
      });
      text=parts.join(' ').replace(/\s+/g,' ').trim();
      label='Guide area · p. '+(idx+1);
      var x0=Math.max(0,(Math.max(band.left,pageRect.left)-pageRect.left)/pageRect.width);
      var y0=Math.max(0,(Math.max(band.top,pageRect.top)-pageRect.top)/pageRect.height);
      var x1=Math.min(1,(Math.min(band.right,pageRect.right)-pageRect.left)/pageRect.width);
      var y1=Math.min(1,(Math.min(band.bottom,pageRect.bottom)-pageRect.top)/pageRect.height);
      if(view.canvas&&view.canvas.width&&x1>x0&&y1>y0){try{thumb=makeRegionThumb(view.canvas,[{x:x0,y:y0,w:x1-x0,h:y1-y0}]);}catch(e){}}
      if(text){
        var pageText=(ch.pageTexts||[])[idx]||'';
        var probe=text.slice(0,80),pi=probe?pageText.indexOf(probe):-1;
        var around=pi>=0?pageText.slice(Math.max(0,pi-500),pi+probe.length+500):'';
        text='Text under the reading guide:\n“'+text+'”'+(around?'\n\nSurrounding text:\n'+around:'');
      }
    }else{
      var paraParts=[];
      byId('textDocument').querySelectorAll('.para .original').forEach(function(el){
        var r=el.getBoundingClientRect();
        if(r.bottom<band.top||r.top>band.bottom)return;
        paraParts.push(el.textContent.replace(/\s+/g,' ').trim());
      });
      text=paraParts.filter(Boolean).join('\n\n');
      if(text)text='Text under the reading guide:\n'+text;
    }
    if(!text){byId('aiStatus').textContent='No text sits under the guide right now — move it over a passage.';return;}
    setAiContext(text,thumb,label);
    byId('aiStatus').textContent='Context is what sits under the guide. Ask away.';
    byId('aiQuestion').focus({preventScroll:true});
  };
  function makeRegionThumb(canvas,rects){
    var x0=1,y0=1,x1=0,y1=0;
    rects.forEach(function(r){x0=Math.min(x0,r.x);y0=Math.min(y0,r.y);x1=Math.max(x1,r.x+r.w);y1=Math.max(y1,r.y+r.h);});
    x0=Math.max(0,x0-.02);y0=Math.max(0,y0-.012);x1=Math.min(1,x1+.02);y1=Math.min(1,y1+.012);
    var sx=Math.round(x0*canvas.width),sy=Math.round(y0*canvas.height),sw=Math.max(1,Math.round((x1-x0)*canvas.width)),sh=Math.max(1,Math.round((y1-y0)*canvas.height));
    var out=document.createElement('canvas'),scale=Math.min(1,460/sw);
    out.width=Math.max(1,Math.round(sw*scale));out.height=Math.max(1,Math.round(sh*scale));
    out.getContext('2d').drawImage(canvas,sx,sy,sw,sh,0,0,out.width,out.height);
    return out.toDataURL('image/jpeg',.72);
  }
  function activeAiThread(ch){ch=ch||find(currentId);if(!ch)return null;return (ch.aiThreads||[]).find(function(t){return t.id===ch.activeAiThreadId;})||null;}
  function paintAiContext(){
    var card=byId('contextCard');if(!aiContext||!aiContext.text){card.classList.add('hidden');return;}
    card.classList.remove('hidden');byId('contextThumb').src=aiContext.thumb||'data:image/gif;base64,R0lGODlhAQABAAAAACw=';byId('contextLabel').textContent=aiContext.label||'Context';byId('contextExcerpt').textContent=(aiContext.text||'No text extracted').slice(0,160);
  }
  function restoreActiveAiThread(ch){var thread=activeAiThread(ch);if(!thread)return;aiContext={text:thread.contextText||'',thumb:'',label:thread.contextLabel||'Saved context'};paintAiContext();}
  function setAiContext(text,thumb,label){aiContext={text:text,thumb:thumb,label:label};aiThreadDraft=true;paintAiContext();renderQa();}
  function makeThumb(source){ var c=document.createElement('canvas'), max=420, scale=Math.min(1,max/source.width); c.width=Math.max(1,Math.round(source.width*scale));c.height=Math.max(1,Math.round(source.height*scale));c.getContext('2d').drawImage(source,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.58); }
  byId('aiFileBtn').onclick=function(e){e.stopPropagation();byId('aiFile').click();};
  byId('aiDrop').onclick=function(){byId('aiFile').click();};
  byId('aiFile').onchange=function(){var f=this.files[0];this.value='';if(f)ocrScreenshot(f);};
  byId('aiDrop').ondragover=function(e){e.preventDefault();this.classList.add('drag');}; byId('aiDrop').ondragleave=function(){this.classList.remove('drag');};
  byId('aiDrop').ondrop=function(e){e.preventDefault();this.classList.remove('drag');var f=e.dataTransfer.files[0];if(f&&f.type.indexOf('image/')===0)ocrScreenshot(f);};
  document.addEventListener('paste',function(e){
    if(byId('readerPage').classList.contains('hidden')||byId('aiPanel').classList.contains('hidden')||!e.clipboardData)return;
    for(var i=0;i<e.clipboardData.items.length;i++){var it=e.clipboardData.items[i];if(it.type.indexOf('image/')===0){e.preventDefault();ocrScreenshot(it.getAsFile());break;}}
  });
  function loadScript(src){return new Promise(function(res,rej){var s=document.createElement('script');s.src=src;s.onload=res;s.onerror=function(){rej(new Error('failed to load OCR'));};document.head.appendChild(s);});}
  async function ocrScreenshot(file){
    var st=byId('aiStatus');st.textContent='Preparing screenshot…';
    try{
      if(!window.Tesseract)await loadScript('/vendor/tesseract/tesseract.min.js');
      var bmp=await createImageBitmap(file), scale=Math.min(1,1600/bmp.width), canvas=document.createElement('canvas');canvas.width=bmp.width*scale;canvas.height=bmp.height*scale;canvas.getContext('2d').drawImage(bmp,0,0,canvas.width,canvas.height);
      var worker=await Tesseract.createWorker('eng',1,{workerPath:'/vendor/tesseract/worker.min.js',corePath:'/vendor/tesseract/',langPath:'/vendor/tesseract',logger:function(m){if(m.status==='recognizing text')st.textContent='Reading screenshot… '+Math.round(m.progress*100)+'%';}});
      var result=await worker.recognize(canvas);await worker.terminate();var text=(result.data.text||'').trim();if(!text)throw new Error('No text found in this screenshot');
      setAiContext(text,makeThumb(canvas),'Pasted screenshot');st.textContent='Screenshot is ready. Ask something about it.';byId('aiQuestion').focus({preventScroll:true});
    }catch(e){st.textContent=e.message||'OCR failed';}
  }
  /* The question box grows with pasted or multi-line prompts (bullets survive);
     Enter sends, Shift+Enter makes a new line. */
  function growQuestionBox(){var input=byId('aiQuestion');input.style.height='auto';input.style.height=Math.min(128,input.scrollHeight)+'px';}
  byId('aiQuestion').addEventListener('input',growQuestionBox);
  byId('aiQuestion').onkeydown=function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();askAi();}}; byId('aiAskBtn').onclick=askAi;
  byId('aiNewThread').onclick=function(){aiThreadDraft=true;renderQa();byId('aiStatus').textContent=aiContext&&aiContext.text?'New thread with this context.':'New thread — pick a context, then ask.';byId('aiQuestion').focus({preventScroll:true});};
  byId('aiThreadPicker').onchange=function(){
    var ch=find(currentId);if(!ch)return;if(!this.value){aiThreadDraft=true;renderQa();byId('aiStatus').textContent='New thread — pick or keep the context, then ask.';return;}
    ch.activeAiThreadId=this.value;aiThreadDraft=false;aiContext=null;restoreActiveAiThread(ch);renderQa();persist(false);byId('aiStatus').textContent='Thread reopened.';
  };
  /* Question starters only ever fill the box — nothing sends until Ask is pressed.
     The one one-tap action in the row is Find evidence, styled apart. */
  document.querySelectorAll('.ask-chip[data-ask-stem],.ask-chip[data-ask-full]').forEach(function(chip){
    chip.onclick=function(){
      var input=byId('aiQuestion');
      input.value=chip.dataset.askFull||chip.dataset.askStem||'';
      growQuestionBox();
      input.focus({preventScroll:true});
      try{input.setSelectionRange(input.value.length,input.value.length);}catch(e){}
    };
  });
  function aiThreadTitle(thread){var first=(thread.messages||[]).find(function(m){return m.role==='user'&&m.content;});var title=String(first&&first.content||thread.contextLabel||'New thread').replace(/\s+/g,' ').trim();return title.length>54?title.slice(0,51)+'…':title;}
  function newAiThread(ch){
    var thread={id:uid('thread'),contextLabel:aiContext.label||'Context',contextText:String(aiContext.text||'').slice(0,16000),messages:[],createdAt:now(),updatedAt:now()};
    ch.aiThreads=ch.aiThreads||[];ch.aiThreads.unshift(thread);ch.aiThreads=ch.aiThreads.slice(0,12);ch.activeAiThreadId=thread.id;aiThreadDraft=false;return thread;
  }
  function aiThreadMessages(ch,thread){
    var system='You are a concise research reading partner in an ongoing conversation. Answer from the supplied excerpt and remember the earlier turns in this thread. Distinguish what the excerpt says from your inference. If context is insufficient, say so. Prefer short plain paragraphs or compact bullets; no headings or decorative markdown.';
    var context='Paper: '+(ch.title||'Untitled')+'\nReference context ('+(thread.contextLabel||'context')+'):\n'+String(thread.contextText||'').slice(0,16000),history=(thread.messages||[]).slice(-20).map(function(m){return {role:m.role,content:m.content};});
    if(history[0]&&history[0].role==='user')history[0].content=context+'\n\nQuestion: '+history[0].content;else history.unshift({role:'user',content:context});return [{role:'system',content:system}].concat(history);
  }
  function growSelectionAiQuestion(){var input=byId('selectionAiQuestion');input.style.height='auto';input.style.height=Math.min(112,input.scrollHeight)+'px';}
  function renderSelectionAiThread(pending){
    var ch=find(currentId),box=byId('selectionAiThread');if(!ch||!box)return;var thread=aiThreadDraft?null:activeAiThread(ch),html='';
    if(thread)html+='<div class="ai-thread-meta">'+esc(thread.contextLabel||'Passage thread')+' · '+new Date(thread.createdAt||thread.updatedAt||now()).toLocaleDateString()+'</div>';
    (thread&&thread.messages||[]).forEach(function(message){html+='<div class="ai-turn'+(message.role==='user'?' you':'')+'">'+esc(message.content)+'</div>';});if(pending)html+='<div class="ai-turn pending">'+esc(pending)+'</div>';
    if(!html)html='<div class="ai-thread-empty">Ask here, then keep replying in the same thread without leaving the passage.</div>';box.innerHTML=html;byId('selectionAiSend').textContent=thread&&thread.messages.length?'Reply':'Ask';
    requestAnimationFrame(function(){box.scrollTop=box.scrollHeight;placeSelectionCard();});
  }
  async function askSelectionAi(){
    var ch=find(currentId),input=byId('selectionAiQuestion'),q=input.value.trim(),key=localStorage.getItem(AI_KEY)||'';if(!q||!ch||!aiContext||!aiContext.text)return;
    if(!key){byId('selectionAiStatus').innerHTML='Add your DeepSeek key in <button class="text-button" id="selectionOpenAiSettings">settings</button> first.';byId('selectionOpenAiSettings').onclick=function(){fillSettings();byId('settingsDialog').showModal();};return;}
    var thread=aiThreadDraft?null:activeAiThread(ch),created=false;if(!thread){thread=newAiThread(ch);created=true;}
    var sentAt=now();thread.messages.push({role:'user',content:q,at:sentAt});thread.updatedAt=sentAt;input.value='';growSelectionAiQuestion();renderSelectionAiThread('Thinking…');renderQa('Thinking…');
    var button=byId('selectionAiSend');button.disabled=true;byId('selectionAiStatus').textContent='Thinking…';
    try{
      var response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-chat',max_tokens:1200,messages:aiThreadMessages(ch,thread)})});
      if(!response.ok)throw new Error('AI returned '+response.status);var data=await response.json(),answer=data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content;if(!answer)throw new Error('No answer returned');
      thread.messages.push({role:'assistant',content:answer,at:now()});if(thread.messages.length>24){thread.messages=thread.messages.slice(-24);if(thread.messages[0]&&thread.messages[0].role==='assistant')thread.messages.shift();}thread.updatedAt=now();ch.aiThreads=ch.aiThreads.filter(function(item){return item.id!==thread.id;});ch.aiThreads.unshift(thread);ch.activeAiThreadId=thread.id;
      ch.questions.unshift({id:uid('q'),threadId:thread.id,question:q,answer:answer,contextLabel:thread.contextLabel,excerpt:thread.contextText.slice(0,1200),at:now()});ch.questions=ch.questions.slice(0,40);touch(ch);byId('selectionAiStatus').textContent='Saved in this passage thread.';renderSelectionAiThread();renderQa();
    }catch(error){
      if(thread.messages[thread.messages.length-1]&&thread.messages[thread.messages.length-1].role==='user'&&thread.messages[thread.messages.length-1].content===q)thread.messages.pop();if(created&&!thread.messages.length){ch.aiThreads=ch.aiThreads.filter(function(item){return item.id!==thread.id;});ch.activeAiThreadId=ch.aiThreads[0]?ch.aiThreads[0].id:'';aiThreadDraft=true;}
      input.value=q;growSelectionAiQuestion();byId('selectionAiStatus').textContent=error.message||'AI request failed';renderSelectionAiThread();renderQa();
    }button.disabled=false;
  }
  byId('selectionAiQuestion').addEventListener('input',growSelectionAiQuestion);
  byId('selectionAiQuestion').onkeydown=function(event){if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();askSelectionAi();}};
  byId('selectionAiSend').onclick=askSelectionAi;
  byId('selectionAiNew').onclick=function(){aiThreadDraft=true;byId('selectionAiStatus').textContent='New thread with this passage.';renderSelectionAiThread();byId('selectionAiQuestion').focus({preventScroll:true});};
  byId('selectionAiBack').onclick=function(){byId('selectionCard').classList.remove('ai-open');byId('selectionAiBox').classList.add('hidden');setSelectionAction('selectionAsk');placeSelectionCard();};
  async function askAi(){
    var ch=find(currentId),q=byId('aiQuestion').value.trim(),key=localStorage.getItem(AI_KEY)||'';if(!q)return;
    if(!aiContext||!aiContext.text){if(!setCurrentPageContext()){byId('aiStatus').textContent='Pick a context first: current page, your selection, the guide area, or a screenshot.';return;}}
    if(!key){byId('aiStatus').innerHTML='Add your DeepSeek key in <button class="text-button" id="openAiSettings">settings</button> first.';byId('openAiSettings').onclick=function(){fillSettings();byId('settingsDialog').showModal();};return;}
    var thread=aiThreadDraft?null:activeAiThread(ch),created=false;if(!thread){thread=newAiThread(ch);created=true;}
    var sentAt=now();thread.messages.push({role:'user',content:q,at:sentAt});thread.updatedAt=sentAt;byId('aiQuestion').value='';growQuestionBox();renderQa('Thinking…');
    var btn=byId('aiAskBtn');btn.disabled=true;byId('aiStatus').textContent='Thinking…';
    try{
      var res=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-chat',max_tokens:1200,messages:aiThreadMessages(ch,thread)})});
      if(!res.ok)throw new Error('AI returned '+res.status);var data=await res.json(),answer=data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content;if(!answer)throw new Error('No answer returned');
      thread.messages.push({role:'assistant',content:answer,at:now()});if(thread.messages.length>24){thread.messages=thread.messages.slice(-24);if(thread.messages[0]&&thread.messages[0].role==='assistant')thread.messages.shift();}thread.updatedAt=now();
      ch.aiThreads=ch.aiThreads.filter(function(t){return t.id!==thread.id;});ch.aiThreads.unshift(thread);ch.activeAiThreadId=thread.id;
      ch.questions.unshift({id:uid('q'),threadId:thread.id,question:q,answer:answer,contextLabel:thread.contextLabel,excerpt:thread.contextText.slice(0,1200),at:now()});ch.questions=ch.questions.slice(0,40);touch(ch);byId('aiStatus').textContent='Saved in this thread.';renderQa();var box=byId('qaList');if(box.lastElementChild)box.lastElementChild.scrollIntoView({block:'nearest',behavior:'smooth'});
    }catch(e){
      if(thread.messages[thread.messages.length-1]&&thread.messages[thread.messages.length-1].role==='user'&&thread.messages[thread.messages.length-1].content===q)thread.messages.pop();
      if(created&&!thread.messages.length){ch.aiThreads=ch.aiThreads.filter(function(t){return t.id!==thread.id;});ch.activeAiThreadId=ch.aiThreads[0]?ch.aiThreads[0].id:'';aiThreadDraft=true;}
      byId('aiQuestion').value=q;growQuestionBox();byId('aiStatus').textContent=e.message||'AI request failed';renderQa();
    }btn.disabled=false;
  }
  function renderQa(pending){
    var ch=find(currentId),box=byId('qaList');if(!ch||!box)return;var threads=ch.aiThreads||[],thread=aiThreadDraft?null:activeAiThread(ch),row=byId('aiThreadPickerRow'),picker=byId('aiThreadPicker');
    row.classList.toggle('hidden',!threads.length);picker.innerHTML='';if(threads.length){var fresh=document.createElement('option');fresh.value='';fresh.textContent='New thread';picker.appendChild(fresh);threads.forEach(function(t){var option=document.createElement('option');option.value=t.id;option.textContent=aiThreadTitle(t);picker.appendChild(option);});picker.value=thread?thread.id:'';}
    var html='';if(thread)html+='<div class="ai-thread-meta">'+esc(thread.contextLabel||'Context')+' · '+new Date(thread.createdAt||thread.updatedAt||now()).toLocaleDateString()+'</div>';
    (thread&&thread.messages||[]).forEach(function(m){html+='<div class="ai-turn'+(m.role==='user'?' you':'')+'">'+esc(m.content)+'</div>';});if(pending)html+='<div class="ai-turn pending">'+esc(pending)+'</div>';
    if(!html)html='<div class="ai-thread-empty">Start a question here. Your next messages will stay in the same conversation until you choose New thread.</div>';box.innerHTML=html;
    byId('aiAskBtn').textContent=thread&&thread.messages.length?'Reply':'Ask';byId('aiQuestion').placeholder=thread&&thread.messages.length?'Ask a follow-up…':'What does this mean?';
  }

  /* Evidence: the model never gets to invent a citation. At most it distills the claim
     into a search query; the papers shown all come from Semantic Scholar's real index,
     with a Google Scholar link for the same query. No AI key needed — a keyword
     fallback builds the query locally. */
  var EVIDENCE_STOP={};'the a an and or of to in on for with without from into by is are was were be been being this that these those we our it its as at can could may might will would should must not than then which who whom what where when while how also more most other others over under between within during against per each such same very own new used using use based results result study studies paper table figure section however therefore because although'.split(' ').forEach(function(w){EVIDENCE_STOP[w]=true;});
  function keywordQuery(text){
    var counts={},order=[];
    String(text||'').toLowerCase().replace(/[^a-zà-öø-ÿ0-9\- ]/g,' ').split(/\s+/).forEach(function(w){
      if(w.length<4||EVIDENCE_STOP[w])return;
      if(!counts[w]){counts[w]=0;order.push(w);}
      counts[w]++;
    });
    return order.sort(function(a,b){return counts[b]-counts[a];}).slice(0,6).join(' ');
  }
  function evidenceHead(query,note){
    return '<div class="evidence-head">'+note+' <a href="https://scholar.google.com/scholar?q='+encodeURIComponent(query)+'" target="_blank" rel="noopener">open “'+esc(query)+'” on Google Scholar ↗</a></div>';
  }
  function evidenceCards(papers){
    return papers.map(function(p){
      var authors=(p.authors||[]).slice(0,3).map(function(a){return a.name;}).join(', ')+((p.authors||[]).length>3?' et al.':'');
      var doi=p.externalIds&&p.externalIds.DOI,link=doi?'https://doi.org/'+doi:(p.url||'');
      var tldr=p.tldr&&p.tldr.text?'<span class="ev-tldr">'+esc(p.tldr.text)+'</span>':'';
      return '<a class="evidence-card" href="'+esc(link)+'" target="_blank" rel="noopener"><b>'+esc(p.title||'Untitled')+'</b><span class="ev-meta">'+esc(authors)+(p.year?' · '+p.year:'')+(p.venue?' · '+esc(p.venue):'')+' · cited '+(p.citationCount||0)+'×</span>'+tldr+'</a>';
    }).join('');
  }
  /* Semantic Scholar's free pool rate-limits hard, and its rejections often arrive
     without CORS headers — the browser then reports a bare "Failed to fetch". Retry
     once with a pause; if it still will not answer, the distilled query is not wasted:
     the same search opens on Google Scholar. */
  async function s2Search(query){
    var url='https://api.semanticscholar.org/graph/v1/paper/search?query='+encodeURIComponent(query)+'&limit=6&fields=title,year,authors,venue,citationCount,externalIds,url,tldr';
    for(var attempt=0;;attempt++){
      try{
        var r=await fetch(url);
        if(r.status===429)throw new Error('rate-limited');
        if(!r.ok)throw new Error('Paper search failed ('+r.status+')');
        return ((await r.json()).data)||[];
      }catch(e){
        if(attempt===0){await new Promise(function(res){setTimeout(res,1800);});continue;}
        throw e;
      }
    }
  }
  async function findEvidence(){
    if(!aiContext||!aiContext.text){if(!setCurrentPageContext()){byId('aiStatus').textContent='Pick a context first: current page, your selection, the guide area, or a screenshot.';return;}}
    var btn=byId('evidenceBtn'),st=byId('aiStatus'),box=byId('evidenceList'),query='';btn.disabled=true;
    try{
      var key=localStorage.getItem(AI_KEY)||'';
      if(key){
        st.textContent='Distilling the claim…';
        try{
          var res=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-chat',max_tokens:60,messages:[{role:'system',content:'Extract the single central scientific claim of the excerpt, then output ONLY a literature search query of 3 to 8 keywords for finding papers that test that claim. Output the query text alone: no quotes, no punctuation, no explanation.'},{role:'user',content:aiContext.text.slice(0,6000)}]})});
          if(res.ok){var data=await res.json();query=String((((data.choices||[])[0]||{}).message||{}).content||'').replace(/[\n"“”.,;:]/g,' ').replace(/\s+/g,' ').trim();}
        }catch(e){}
      }
      if(!query)query=keywordQuery(aiContext.text);
      if(!query){st.textContent='Could not build a search query from this context.';btn.disabled=false;return;}
      /* The reliable part first: a real literature search, one tap away, instantly. */
      box.innerHTML=evidenceHead(query,'Search built from this claim —');
      box.classList.remove('hidden');
      var qa=byId('qaList');qa.parentNode.insertBefore(box,qa);
      box.scrollIntoView({block:'nearest',behavior:'smooth'});
      st.textContent='Fetching inline results…';
      try{
        var found=await s2Search(query);
        box.innerHTML=evidenceHead(query,found.length?'Real indexed papers — judge them by reading, not by rank. More:':'Nothing indexed matched this exact phrasing — Scholar matches more loosely:')+evidenceCards(found);
        st.textContent=found.length?'Inline results come from Semantic Scholar’s real index; links go to the source.':'Try the Google Scholar link above.';
      }catch(e){
        box.innerHTML=evidenceHead(query,'Inline previews are resting (Semantic Scholar rate-limits its free pool) — your search is ready:');
        st.textContent='The Google Scholar link always works.';
      }
    }catch(e){st.textContent=e.message||'Evidence search failed';}
    btn.disabled=false;
  }
  byId('evidenceBtn').onclick=findEvidence;

  /* connections */
  function tagMap(){var map={};state.chapters.forEach(function(ch){(ch.tags||[]).forEach(function(t){var k=t.toLowerCase();if(!map[k])map[k]={label:t,papers:[]};map[k].papers.push(ch);});});return map;}
  function renderConnections(){
    var map=tagMap(), list=byId('connectionList');list.innerHTML='';Object.keys(map).sort().forEach(function(k){var g=map[k],d=document.createElement('div');d.className='connection-cluster';d.innerHTML='<h3># '+esc(g.label)+'</h3>';g.papers.forEach(function(ch){var b=document.createElement('button');b.textContent=ch.title;b.onclick=function(){openReader(ch.id);};d.appendChild(b);});list.appendChild(d);});
    if(!Object.keys(map).length)list.innerHTML='<div class="empty">Add a few comma-separated tags beside your paper notes. Their shared map will appear here.</div>';
    drawNetwork(map);
  }
  function drawNetwork(map){
    var c=byId('networkCanvas'),rect=c.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2),w=Math.max(300,rect.width),h=Math.max(300,rect.height);c.width=w*ratio;c.height=h*ratio;var x=c.getContext('2d');x.scale(ratio,ratio);x.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--surface');x.fillRect(0,0,w,h);
    var papers=state.chapters.filter(function(p){return(p.tags||[]).length;}),tags=Object.keys(map),cx=w/2,cy=h/2,pNodes={},tNodes={};
    papers.forEach(function(p,i){var a=(i/Math.max(1,papers.length))*Math.PI*2-Math.PI/2,r=Math.min(w,h)*.34;pNodes[p.id]={x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r};});
    tags.forEach(function(t,i){var a=(i/Math.max(1,tags.length))*Math.PI*2+Math.PI/5,r=Math.min(w,h)*.17;tNodes[t]={x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r};});
    x.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--line');x.lineWidth=1;
    tags.forEach(function(t){map[t].papers.forEach(function(p){var a=tNodes[t],b=pNodes[p.id];x.beginPath();x.moveTo(a.x,a.y);x.lineTo(b.x,b.y);x.stroke();});});
    papers.forEach(function(p){var n=pNodes[p.id];x.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--ink');x.beginPath();x.arc(n.x,n.y,5,0,Math.PI*2);x.fill();x.font='11px DM Sans';x.textAlign=n.x<cx?'right':'left';x.fillText((p.title||'Untitled').slice(0,24),n.x+(n.x<cx?-10:10),n.y+4);});
    tags.forEach(function(t){var n=tNodes[t];x.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--accent');x.beginPath();x.arc(n.x,n.y,8,0,Math.PI*2);x.fill();x.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--ink');x.textAlign='center';x.font='600 11px DM Sans';x.fillText('#'+map[t].label,n.x,n.y-14);});
    if(!papers.length){x.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--muted');x.textAlign='center';x.font='14px DM Sans';x.fillText('Your connection map will grow here.',cx,cy);}
  }

  /* Google Drive sync — the no-setup path. The library file lives in the account's
     hidden per-app folder (drive.appdata): Phloem can see only its own file, and the
     user's real Drive files are invisible to it. Connecting is a one-time act per
     device: the hour-long token is kept alongside the settings and renewed quietly
     inside real taps, so later opens sync on their own instead of asking to
     reconnect. */
  var GDRIVE_CLIENT_ID='615468645410-oh18cpvsq9c14e1ohu1c8pnld47q9jm7.apps.googleusercontent.com';
  /* GDRIVE_FILE predates the Phloem rename. It must never change: it is the name of
     every user's library file already sitting in Drive appdata. */
  var GDRIVE_KEY='readingRoom.gdrive.v1',GDRIVE_FILE='carrel-library.json';
  var gdriveCfg=null,gdriveToken=null,gdriveTokenAt=0,gdriveEmail='',gdriveTokenClient=null,gdriveSyncing=false;
  try{gdriveCfg=JSON.parse(localStorage.getItem(GDRIVE_KEY));}catch(e){}
  /* The token rides in the same record as the on/off switch — like the GitHub token
     above, it never leaves this browser, and it can only see the hidden app folder
     for at most an hour. A page reopened within that hour syncs with no popup at all. */
  if(gdriveCfg){gdriveEmail=gdriveCfg.email||'';if(gdriveCfg.tok&&gdriveCfg.tokAt){gdriveToken=gdriveCfg.tok;gdriveTokenAt=+gdriveCfg.tokAt||0;}}
  function gdriveOn(){return !!(gdriveCfg&&gdriveCfg.on);}
  function gdriveTokenFresh(){return !!gdriveToken&&now()-gdriveTokenAt<50*60*1000;}
  function gdriveSaveAuth(){
    if(!gdriveCfg)return;
    gdriveCfg.tok=gdriveToken||'';gdriveCfg.tokAt=gdriveToken?gdriveTokenAt:0;if(gdriveEmail)gdriveCfg.email=gdriveEmail;
    try{localStorage.setItem(GDRIVE_KEY,JSON.stringify(gdriveCfg));}catch(e){}
  }
  /* Knowing which account was picked lets every later renewal skip the account
     chooser — the popup opens and closes itself with nothing to click. */
  function gdriveLearnEmail(token){
    if(gdriveEmail)return;
    fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',{headers:{Authorization:'Bearer '+token}})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(d){if(d&&d.user&&d.user.emailAddress){gdriveEmail=d.user.emailAddress;gdriveSaveAuth();}})
      .catch(function(){});
  }
  /* Rule of the popup road: Google will only hand out a token during a real user
     gesture. When a background sync finds the token stale, Phloem does not let a
     doomed popup end in "needs attention" — it waits for the next tap and finishes
     the sync inside it. */
  function gestureLive(){return !!(navigator.userActivation&&navigator.userActivation.isActive);}
  var gdriveArmed=false;
  function gdriveArmGestureSync(){
    if(gdriveArmed||!gdriveOn())return;gdriveArmed=true;
    syncUi('☁ tap to sync');
    /* In zen a click is a page turn, not permission: the popup would also boot
       the browser out of fullscreen. Stay armed and wait for a tap at the desk. */
    addEventListener('click',function(){gdriveArmed=false;if(zenOn){gdriveArmGestureSync();return;}if(gdriveOn())gdriveSync(true);},{capture:true,once:true});
  }
  function loadGis(){
    return new Promise(function(res,rej){
      if(window.google&&window.google.accounts&&window.google.accounts.oauth2)return res();
      var script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';
      script.onload=function(){res();};script.onerror=function(){rej(new Error('Could not load Google sign-in (offline?)'));};
      document.head.appendChild(script);
    });
  }
  var gdriveTokenSettle=null,gdriveTokenPending=null;
  function gdriveGetToken(interactive){
    if(gdriveTokenFresh())return Promise.resolve(gdriveToken);
    /* Everyone waiting shares one sign-in: a second request while the popup is up
       would orphan the first caller and strand its promise. */
    if(gdriveTokenPending)return gdriveTokenPending;
    var request=loadGis().then(function(){
      return new Promise(function(res,rej){
        if(gdriveTokenFresh())return res(gdriveToken);
        /* A first sign-in walks through passwords and 2FA — give it two minutes.
           Silent renewals come back within seconds or not at all. */
        var timer=setTimeout(function(){if(!interactive)gdriveArmGestureSync();settle(null,new Error('Google sign-in timed out — tap to try again.'));},interactive?120000:15000);
        function settle(token,error){
          if(gdriveTokenSettle!==settle)return;gdriveTokenSettle=null;clearTimeout(timer);
          if(token)res(token);else rej(error);
        }
        gdriveTokenSettle=settle;
        if(!gdriveTokenClient)gdriveTokenClient=google.accounts.oauth2.initTokenClient({client_id:GDRIVE_CLIENT_ID,scope:'https://www.googleapis.com/auth/drive.appdata',callback:function(){},error_callback:function(err){
          if(!(err&&err.type==='popup_closed'))gdriveArmGestureSync();
          var fn=gdriveTokenSettle;if(fn)fn(null,new Error(err&&err.type==='popup_closed'?'Google sign-in was closed':'The sign-in popup was blocked — tap anywhere and Phloem finishes on its own.'));
        }});
        gdriveTokenClient.callback=function(resp){
          var fn=gdriveTokenSettle;
          if(resp&&resp.access_token){
            /* Keep a token that arrives after its caller gave up (a slow 2FA outlives
               the timeout): the sign-in still counts, and the next action uses it. */
            gdriveToken=resp.access_token;gdriveTokenAt=now();gdriveSaveAuth();gdriveLearnEmail(gdriveToken);
            if(fn)fn(gdriveToken,null);
          }
          else if(fn)fn(null,new Error(resp&&resp.error?'Google sign-in: '+resp.error:'Google sign-in was cancelled'));
        };
        /* prompt:'' asks Google for the least ceremony it can offer: the full consent
           screen only the first time this device ever connects, afterwards a popup
           that opens and closes itself. Never 'consent' — that forced the whole
           permission screen on every manual sync, which read as "reconnect again". */
        var ask={prompt:''};if(gdriveEmail)ask.hint=gdriveEmail;
        try{gdriveTokenClient.requestAccessToken(ask);}catch(e){settle(null,e);}
      });
    });
    gdriveTokenPending=request.then(function(t){gdriveTokenPending=null;return t;},function(e){gdriveTokenPending=null;throw e;});
    return gdriveTokenPending;
  }
  async function gdriveListAll(token){
    var r=await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=1000&fields=files(id,name,size)',{headers:{Authorization:'Bearer '+token}});
    if(r.status===401){gdriveToken=null;gdriveSaveAuth();var stale=new Error('Google signed this device out — Phloem reconnects on your next tap.');stale.auth=true;throw stale;}
    if(!r.ok)throw new Error('Drive list failed ('+r.status+')');
    return ((await r.json()).files)||[];
  }
  /* Papers ride along in the same hidden folder: any local PDF not yet in Drive is
     uploaded quietly after each sync (up to 30 MB each), and a device that lacks the
     file pulls it down when the paper is opened. */
  var GDRIVE_PDF_LIMIT=30*1024*1024,gdriveRoaming=false;
  async function gdriveRoamPdfs(token,files){
    if(gdriveRoaming)return {sent:0,failed:0};gdriveRoaming=true;
    var sent=0,failed=0;
    try{
      var have={};files.forEach(function(f){have[f.name]=true;});
      for(var i=0;i<state.chapters.length;i++){
        var ch=state.chapters[i];if(ch.kind!=='pdf'||have['pdf-'+ch.id+'.pdf'])continue;
        var stored=await getPdf(ch.id);if(!stored)continue;
        var bytes=stored instanceof ArrayBuffer?stored:await pdfBytes(stored);
        if(bytes.byteLength>GDRIVE_PDF_LIMIT)continue;
        var boundary='phloem'+now()+i;
        var head='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify({name:'pdf-'+ch.id+'.pdf',parents:['appDataFolder']})+'\r\n--'+boundary+'\r\nContent-Type: application/pdf\r\n\r\n';
        try{
          var up=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'multipart/related; boundary='+boundary},body:new Blob([head,bytes,'\r\n--'+boundary+'--'])});
          if(up.ok)sent++;else failed++;
        }catch(uploadError){failed++;}
      }
    }catch(e){failed++;}
    gdriveRoaming=false;
    return {sent:sent,failed:failed};
  }
  async function gdriveFetchPdf(id,interactive,onProgress){
    if(!gdriveOn())return null;
    try{
      id=resolvedPaperId(id);var token=await gdriveGetToken(interactive===true),files=await gdriveListAll(token),hit=null,names=['pdf-'+id+'.pdf'];
      Object.keys(state.merged||{}).forEach(function(dropId){if(resolvedPaperId(dropId)===id)names.push('pdf-'+dropId+'.pdf');});
      files.some(function(f){if(names.indexOf(f.name)>=0){hit=f;return true;}return false;});
      if(!hit)return null;
      var r=await fetch('https://www.googleapis.com/drive/v3/files/'+hit.id+'?alt=media',{headers:{Authorization:'Bearer '+token}});
      if(!r.ok)return null;
      var bytes;
      /* Stream the body when someone is watching: Drive reports the size up front, so
         the download card can show honest percentages instead of a silent wait. */
      if(onProgress&&r.body&&r.body.getReader){
        var total=+hit.size||0,reader=r.body.getReader(),chunks=[],loaded=0;
        onProgress(0,total);
        for(;;){var step=await reader.read();if(step.done)break;chunks.push(step.value);loaded+=step.value.byteLength;onProgress(loaded,total);}
        var all=new Uint8Array(loaded),off=0;
        chunks.forEach(function(c){all.set(c,off);off+=c.byteLength;});
        bytes=all.buffer;
      }else bytes=await r.arrayBuffer();
      if(!bytes||bytes.byteLength<100)return null;
      await putPdf(id,bytes);var ch=find(id);if(ch&&!ch.contentHash)rememberPdfFingerprint(ch,bytes);return bytes;
    }catch(e){return null;}
  }
  async function gdriveDeletePdf(id){
    if(!gdriveOn())return;
    try{
      var token=await gdriveGetToken(false),files=await gdriveListAll(token),name='pdf-'+id+'.pdf';
      for(var i=0;i<files.length;i++)if(files[i].name===name)await fetch('https://www.googleapis.com/drive/v3/files/'+files[i].id,{method:'DELETE',headers:{Authorization:'Bearer '+token}});
    }catch(e){}
  }
  async function gdrivePruneMergedPdfs(token){
    var files=await gdriveListAll(token),byName={},removed=0;files.forEach(function(file){byName[file.name]=file;});var drops=Object.keys(state.merged||{});
    for(var i=0;i<drops.length;i++){var dropId=drops[i],keepId=resolvedPaperId(dropId),drop=byName['pdf-'+dropId+'.pdf'],keep=byName['pdf-'+keepId+'.pdf'];if(!drop||!keep||drop.id===keep.id)continue;try{var gone=await fetch('https://www.googleapis.com/drive/v3/files/'+drop.id,{method:'DELETE',headers:{Authorization:'Bearer '+token}});if(gone.ok)removed++;}catch(e){}}
    return removed;
  }
  async function gdriveSync(interactive,retried){
    if(!gdriveOn()||gdriveSyncing)return;
    /* No tap in flight and no living token: skip the doomed popup and let the next
       real tap carry the sync instead. */
    /* Zen taps count as gestures to the browser, but a token popup mid-read is
       exactly the interruption zen exists to prevent — park the sync instead. */
    if(!interactive&&!gdriveTokenFresh()&&(zenOn||!gestureLive())){gdriveArmGestureSync();return;}
    gdriveSyncing=true;syncUi('☁ syncing…');
    try{
      var token=await gdriveGetToken(interactive===true);
      var files=await gdriveListAll(token),fileId=null;
      files.some(function(f){if(f.name===GDRIVE_FILE){fileId=f.id;return true;}return false;});
      if(fileId){
        var got=await fetch('https://www.googleapis.com/drive/v3/files/'+fileId+'?alt=media',{headers:{Authorization:'Bearer '+token}});
        if(got.ok){try{var remote=await got.json();if(remote&&Array.isArray(remote.chapters)&&mergeState(remote)){persist(false);renderShelf();}}catch(parseError){}}
      }
      await repairDuplicateStorage();
      var payload=JSON.stringify({chapters:await chaptersForSync(),deleted:state.deleted||{},merged:state.merged||{}}),up;
      if(fileId){
        up=await fetch('https://www.googleapis.com/upload/drive/v3/files/'+fileId+'?uploadType=media',{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:payload});
      }else{
        var boundary='phloem'+now();
        var body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify({name:GDRIVE_FILE,parents:['appDataFolder']})+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+payload+'\r\n--'+boundary+'--';
        up=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'multipart/related; boundary='+boundary},body:body});
      }
      if(!up.ok){var upErr=new Error('Drive upload failed ('+up.status+')');if(up.status===401)upErr.auth=true;throw upErr;}
      byId('gdriveStatus').textContent='Library synced — checking papers…';
      var roam=await gdriveRoamPdfs(token,files);
      await gdrivePruneMergedPdfs(token);
      byId('gdriveStatus').textContent='Synced with your Google Drive.'+(roam.sent?' '+roam.sent+' paper'+(roam.sent===1?'':'s')+' uploaded.':'')+(roam.failed?' '+roam.failed+' upload'+(roam.failed===1?'':'s')+' failed — Phloem retries on the next sync.':'');
      syncUi('☁ Drive · '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));byId('syncSignal').title='';
    }catch(e){
      /* A token Google no longer honors is not the user's problem: drop it and take
         one more lap with a fresh sign-in before reporting anything. */
      if(e&&e.auth){gdriveToken=null;gdriveSaveAuth();if(!retried){gdriveSyncing=false;return gdriveSync(interactive,true);}}
      var reason=e.message||'Drive sync failed';
      byId('gdriveStatus').textContent=reason;
      if(gdriveArmed){syncUi('☁ tap to sync');byId('syncSignal').title=reason;}
      else{syncUi('☁ sync needs attention');byId('syncSignal').title=reason;}
    }
    gdriveSyncing=false;
  }
  byId('gdriveConnectBtn').onclick=async function(){
    var btn=this;btn.disabled=true;byId('gdriveStatus').textContent='Waiting for Google sign-in…';
    try{
      await gdriveGetToken(true);
      /* saveAuth folds the fresh token into the record, so even an immediate
         reload of this page syncs without another popup */
      gdriveCfg={on:true,at:now()};gdriveSaveAuth();
      fillSettings();await gdriveSync(true);
    }catch(e){byId('gdriveStatus').textContent=e.message||'Could not connect';}
    btn.disabled=false;
  };
  byId('gdriveSyncBtn').onclick=function(){gdriveSync(true);};
  byId('gdriveOffBtn').onclick=function(){
    if(!confirm('Disconnect Google Drive on this device? The file in your Drive stays there.'))return;
    localStorage.removeItem(GDRIVE_KEY);gdriveCfg=null;gdriveToken=null;gdriveTokenAt=0;gdriveEmail='';fillSettings();syncUi();
  };

  /* encrypted GitHub state sync + PDF picker */
  function fillSettings(){
    byId('syncRepo').value=syncCfg?syncCfg.repo||'':'';byId('syncToken').value=syncCfg?syncCfg.token||'':'';byId('syncPass').value=syncCfg?syncCfg.pass||'':'';byId('syncNowBtn').classList.toggle('hidden',!syncCfg);byId('syncLinkBtn').classList.toggle('hidden',!syncCfg);byId('syncOffBtn').classList.toggle('hidden',!syncCfg);byId('aiKey').value=localStorage.getItem(AI_KEY)||'';
    byId('gdriveConnectBtn').textContent=gdriveOn()?'Sign in again':'Connect Google Drive';
    byId('gdriveConnectBtn').classList.toggle('button',!gdriveOn());byId('gdriveConnectBtn').classList.toggle('soft-button',gdriveOn());
    byId('gdriveSyncBtn').classList.toggle('hidden',!gdriveOn());byId('gdriveOffBtn').classList.toggle('hidden',!gdriveOn());
    byId('gdriveStatus').textContent=gdriveOn()?'Connected'+(gdriveEmail?' as '+gdriveEmail:'')+' — your library syncs automatically. Papers follow you between devices.':'Not connected.';
    syncUi();refreshInstallUi();
  }
  function syncUi(msg){var on=!!(syncCfg&&syncCfg.repo&&syncCfg.token&&syncCfg.pass);byId('syncSignal').textContent=msg||(on?'☁ '+syncCfg.repo:gdriveOn()?'☁ Google Drive':'this device');byId('syncStatus').textContent=on?'Connected to '+syncCfg.repo+'. Notes are encrypted before upload.':'Off — everything stays on this device.';}
  byId('syncSaveBtn').onclick=function(){var repo=byId('syncRepo').value.trim(),token=byId('syncToken').value.trim(),pass=byId('syncPass').value;if(!/^[^\/\s]+\/[^\/\s]+$/.test(repo)||!token||!pass){byId('syncStatus').textContent='Add the repo as owner/name, its fine-grained token, and a passphrase.';return;}syncCfg={repo:repo,token:token,pass:pass};localStorage.setItem(SYNC_KEY,JSON.stringify(syncCfg));fillSettings();doSync();};
  byId('syncOffBtn').onclick=function(){if(!confirm('Turn off GitHub sync on this device? Local notes stay here.'))return;localStorage.removeItem(SYNC_KEY);syncCfg=null;fillSettings();};
  byId('syncNowBtn').onclick=function(){doSync();};
  byId('syncForceBtn').onclick=function(){
    if(!confirm('Replace the cloud copy with this device’s library?\n\nThe unreadable file in '+(syncCfg?syncCfg.repo:'the repo')+' will be overwritten using THIS device’s passphrase. Your other devices will then need this passphrase (easiest: copy a device link from here afterwards).'))return;
    doSync(true);
  };
  function b64(buf){var s='';new Uint8Array(buf).forEach(function(b){s+=String.fromCharCode(b);});return btoa(s);}function unb64(str){var bin=atob(str),a=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a;}
  function deriveKey(pass,salt){return crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']).then(function(k){return crypto.subtle.deriveKey({name:'PBKDF2',salt:salt,iterations:310000,hash:'SHA-256'},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);});}
  function encryptState(pass,obj){var salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));return deriveKey(pass,salt).then(function(k){return crypto.subtle.encrypt({name:'AES-GCM',iv:iv},k,new TextEncoder().encode(JSON.stringify(obj)));}).then(function(ct){return JSON.stringify({v:1,salt:b64(salt),iv:b64(iv),data:b64(ct)});});}
  function decryptState(pass,str){var p=JSON.parse(str);return deriveKey(pass,unb64(p.salt)).then(function(k){return crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(p.iv)},k,unb64(p.data));}).then(function(pt){return JSON.parse(new TextDecoder().decode(pt));});}
  async function chaptersForSync(){return Promise.all(state.chapters.map(async function(ch){var copy=Object.assign({},ch);if(ch.kind==='pdf'){var saved=derivedData(ch)||await getDerived(ch.id);if(saved)Object.assign(copy,saved);}return copy;}));}
  function ghUrl(path){return 'https://api.github.com/repos/'+syncCfg.repo+'/contents/'+path.split('/').map(encodeURIComponent).join('/');}
  function mergeState(inc){
    var changed=false;state.deleted=state.deleted||{};state.merged=state.merged||{};
    Object.keys(inc.merged||{}).forEach(function(dropId){var keepId=inc.merged[dropId];if(!keepId||dropId===keepId)return;if(state.merged[dropId]!==keepId){state.merged[dropId]=keepId;changed=true;}if(find(dropId))queueDuplicateStorage(keepId,dropId);});
    Object.keys(inc.deleted||{}).forEach(function(id){if((inc.deleted[id]||0)>(state.deleted[id]||0)){state.deleted[id]=inc.deleted[id];changed=true;}});
    var kept=state.chapters.filter(function(ch){if(!state.deleted[ch.id])return true;var keepId=resolvedPaperId(ch.id);if(keepId!==ch.id)queueDuplicateStorage(keepId,ch.id);else deletePdf(ch.id);changed=true;return false;});if(kept.length!==state.chapters.length)state.chapters=kept;
    (inc.chapters||[]).forEach(function(remote){
      if(!remote||!remote.id||state.deleted[remote.id])return;normalize(remote);var local=find(remote.id);
      if(!local){state.chapters.push(remote);if(remote.kind==='pdf')saveDerivedSoon(remote);changed=true;return;}
      if((remote.updatedAt||0)>(local.updatedAt||0)){state.chapters[state.chapters.indexOf(local)]=remote;if(remote.kind==='pdf')saveDerivedSoon(remote);changed=true;return;}
      if(remote.kind==='pdf'){if(remote.contentHash&&!local.contentHash){local.contentHash=remote.contentHash;changed=true;}if(remote.fileSize&&!local.fileSize){local.fileSize=remote.fileSize;changed=true;}if(mergeDerivedInto(local,derivedData(remote)))saveDerivedSoon(local);}
    });
    var exact=duplicateGroups(state.chapters,true);if(exact.length){collapseDuplicateGroups(exact);changed=true;}
    if(currentId&&state.deleted[currentId]){var resolved=resolvedPaperId(currentId);if(find(resolved)){currentId=resolved;try{localStorage.setItem(LAST_OPEN_KEY,resolved);}catch(e){}}else{currentId=null;pdfDoc=null;if(!byId('readerPage').classList.contains('hidden'))showPage('libraryPage');}}return changed;
  }
  var syncDecryptBlocked=false;
  async function doSync(force){
    force=force===true;
    if(!syncCfg||syncing)return;syncing=true;syncUi('☁ syncing…');
    try{
      /* Two devices reading at once constantly race each other's pushes: a stale sha
         makes GitHub answer 409 even though nothing is wrong. Take another lap — read
         the fresh file, merge, and write on top of it — before calling it a problem. */
      for(var attempt=0;;attempt++){
        var get=await fetch(ghUrl(SYNC_FILE),{headers:{'Authorization':'Bearer '+syncCfg.token,'Accept':'application/vnd.github+json'}}),sha=null;
        if(get.status!==404){
          if(!get.ok)throw new Error(get.status===401||get.status===403?'Token cannot access this repo':'GitHub returned '+get.status);
          var j=await get.json();sha=j.sha;
          var enc=atob((j.content||'').replace(/\n/g,''));
          /* GitHub's contents API sends an empty content field for files over 1MB — a full
             textbook's extracted text gets there easily. Fetch the raw bytes instead. */
          if(!enc&&j.size>0){
            var raw=await fetch(ghUrl(SYNC_FILE),{headers:{'Authorization':'Bearer '+syncCfg.token,'Accept':'application/vnd.github.raw+json'}});
            if(!raw.ok)throw new Error('Could not download the sync file ('+raw.status+')');
            enc=await raw.text();
          }
          if(enc){
            var remote=null;
            try{remote=await decryptState(syncCfg.pass,enc);}
            catch(decryptError){
              if(!force){syncDecryptBlocked=true;byId('syncForceBtn').classList.remove('hidden');throw new Error('Could not decrypt the sync file — is the passphrase exactly the same as on your other device? Use a device link from a working device, or replace the cloud copy below.');}
              /* forced: the unreadable cloud copy is being replaced with this library */
            }
            if(remote&&mergeState(remote)){persist(false);renderShelf();}
          }
        }
        await repairDuplicateStorage();
        var syncChapters=await chaptersForSync(),payload=await encryptState(syncCfg.pass,{chapters:syncChapters,deleted:state.deleted||{},merged:state.merged||{}}),body={message:'Phloem reading notes sync',content:btoa(payload)};if(sha)body.sha=sha;
        var put=await fetch(ghUrl(SYNC_FILE),{method:'PUT',headers:{'Authorization':'Bearer '+syncCfg.token,'Accept':'application/vnd.github+json','Content-Type':'application/json'},body:JSON.stringify(body)});
        if(put.ok)break;
        if((put.status===409||put.status===422)&&attempt<2)continue;
        throw new Error('GitHub upload failed ('+put.status+')');
      }
      syncDecryptBlocked=false;byId('syncForceBtn').classList.add('hidden');
      syncUi('☁ synced '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));byId('syncStatus').textContent='Synced to '+syncCfg.repo+'.';byId('syncSignal').title='';
    }catch(e){
      var reason=e.message||'Sync failed';
      syncUi('☁ sync needs attention');byId('syncSignal').title=reason;byId('syncStatus').textContent=reason;
      if(reason!==lastSyncToast&&!byId('readerPage').classList.contains('hidden')){lastSyncToast=reason;showReaderToast('Sync: '+reason.slice(0,80));}
    }syncing=false;
  }
  function scheduleSync(){if(!syncCfg&&!gdriveOn())return;clearTimeout(syncTimer);syncTimer=setTimeout(function(){doSync();gdriveSync();},4000);}
  /* The device link is a direct device-to-device hand-off (it already carries the GitHub
     token and passphrase), so the AI key rides along too — unlike the synced file, which
     deliberately never contains it. */
  byId('syncLinkBtn').onclick=function(){
    if(!syncCfg)return;
    var payload=Object.assign({},syncCfg),aiKey=localStorage.getItem(AI_KEY)||'';
    if(aiKey)payload.ai=aiKey;
    var link=location.href.split('#')[0]+'#phloem-setup='+btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    navigator.clipboard.writeText(link).then(function(){byId('syncStatus').textContent='Device link copied. AirDrop it to yourself; it contains your token, passphrase'+(aiKey?' and AI key':'')+'.';});
  };
  function importSetup(){
    var m=location.hash.match(/^#(?:phloem|carrel|margin)-setup=(.+)$/);if(!m)return;
    history.replaceState(null,'',location.pathname+location.search);
    try{
      var cfg=JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      if(cfg.repo&&cfg.token&&cfg.pass&&confirm('Connect Phloem to '+cfg.repo+'? Only continue if you made this link yourself.')){
        if(cfg.ai){try{localStorage.setItem(AI_KEY,cfg.ai);}catch(e){}}
        delete cfg.ai;syncCfg=cfg;localStorage.setItem(SYNC_KEY,JSON.stringify(cfg));
        byId('syncSignal').title='';fillSettings();doSync();
      }
    }catch(e){}
  }
  importSetup();
  addEventListener('hashchange',importSetup);
  /* Clicking the cloud syncs right now — and because it is a real user gesture,
     Google's silent token renewal is allowed to do its quick popup dance, which
     background syncs cannot. Settings only open when there is an error to look at. */
  byId('syncSignal').onclick=function(){
    var standingError=byId('syncSignal').title;
    doSync();gdriveSync(true);
    if(standingError){fillSettings();byId('settingsDialog').showModal();}
  };

  var lastSyncToast='';
  var githubPath='papers';
  byId('githubPickBtn').onclick=openGithubPicker;byId('githubRefresh').onclick=function(){listGithubPapers(githubPath);};
  function openGithubPicker(){if(!syncCfg){fillSettings();byId('settingsDialog').showModal();byId('syncStatus').textContent='Connect GitHub first, then Phloem can show PDFs from papers/.';return;}byId('githubDialog').showModal();listGithubPapers(githubPath);}
  function renderGithubCrumbs(){
    var crumbs=byId('githubCrumbs');crumbs.innerHTML='';
    githubPath.split('/').forEach(function(part,i,parts){
      if(i)crumbs.insertAdjacentHTML('beforeend','<i>›</i>');
      var b=document.createElement('button');b.type='button';b.textContent=part;
      var target=parts.slice(0,i+1).join('/');b.onclick=function(){listGithubPapers(target);};
      crumbs.appendChild(b);
    });
  }
  async function listGithubPapers(path){
    githubPath=path||'papers';renderGithubCrumbs();
    var st=byId('githubStatus'),box=byId('githubPapers');st.textContent='Looking in '+githubPath+'/…';box.innerHTML='';
    try{
      var r=await fetch(ghUrl(githubPath),{headers:{'Authorization':'Bearer '+syncCfg.token,'Accept':'application/vnd.github+json'}});
      if(r.status===404)throw new Error(githubPath==='papers'?'No papers/ folder yet. Create it in the repo and upload PDFs there.':'That folder is gone. Refresh from papers/.');
      if(!r.ok)throw new Error('GitHub returned '+r.status);
      var entries=await r.json();if(!Array.isArray(entries))throw new Error(githubPath+' is a file, not a folder.');
      var dirs=entries.filter(function(f){return f.type==='dir';}).sort(function(a,b){return a.name.localeCompare(b.name);});
      var files=entries.filter(function(f){return f.type==='file'&&/\.pdf$/i.test(f.name);}).sort(function(a,b){return a.name.localeCompare(b.name);});
      st.textContent=(files.length||dirs.length)?(files.length+' PDF'+(files.length===1?'':'s')+(dirs.length?' · '+dirs.length+' folder'+(dirs.length===1?'':'s'):'')+' here.'):'Nothing in '+githubPath+'/ yet.';
      dirs.forEach(function(f){var b=document.createElement('button');b.type='button';b.className='github-paper folder';b.innerHTML='<span>▸ '+esc(f.name)+'/</span><small>open</small>';b.onclick=function(){listGithubPapers(f.path);};box.appendChild(b);});
      files.forEach(function(f){var b=document.createElement('button');b.type='button';b.className='github-paper';b.innerHTML='<span>▱ '+esc(f.name)+'</span><small>add</small>';b.onclick=function(){importGithubPdf(f);};box.appendChild(b);});
    }catch(e){st.textContent=e.message||'Could not list papers.';}
  }
  async function importGithubPdf(file){
    var st=byId('githubStatus');st.textContent='Downloading '+file.name+'…';
    try{var r=await fetch(ghUrl(file.path),{headers:{'Authorization':'Bearer '+syncCfg.token,'Accept':'application/vnd.github.raw+json'}});if(!r.ok)throw new Error('Download failed ('+r.status+')');var blob=await r.blob();byId('githubDialog').close();await importPdf(new File([blob],file.name,{type:'application/pdf'}),file.path);}catch(e){st.textContent=e.message||'Download failed';}
  }

  /* keys, backup, restore */
  byId('aiKeySave').onclick=function(){var k=byId('aiKey').value.trim();if(k)localStorage.setItem(AI_KEY,k);else localStorage.removeItem(AI_KEY);byId('aiKeyStatus').textContent=k?'Saved on this device.':'Key removed.';};
  byId('backupBtn').onclick=function(){var blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='phloem-reading-backup.json';a.click();URL.revokeObjectURL(a.href);};
  byId('restoreBtn').onclick=function(){byId('restoreFile').click();};byId('restoreFile').onchange=function(){var f=this.files[0];this.value='';if(!f)return;f.text().then(function(t){var inc=JSON.parse(t);if(!inc||!Array.isArray(inc.chapters))throw new Error();mergeState(inc);persist();renderShelf();byId('syncStatus').textContent='Backup merged into this library.';}).catch(function(){byId('syncStatus').textContent='That backup file is not valid.';});};

  /* Installable app: capture the browser's install prompt where one exists, and explain
     the Share-sheet path on iOS, which never fires one. */
  var installPrompt=null;
  function isStandalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
  function isIos(){return /iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}
  function refreshInstallUi(){
    var canPrompt=!!installPrompt&&!isStandalone();
    byId('installBtn2').classList.toggle('hidden',!canPrompt);
    byId('installHint').textContent=isStandalone()
      ?'Installed — you are reading in the app. Papers already on this device open offline.'
      :isIos()
        ?'On iPhone or iPad: open Phloem in Safari, tap Share, then “Add to Home Screen”. It gets its own icon and works offline for papers already on this device.'
        :canPrompt
          ?'Phloem gets its own window and icon, and papers already on this device open with no network.'
          :'If your browser offers “Install app” in its menu, Phloem installs like a normal app and works offline for papers already on this device.';
  }
  function promptInstall(){
    if(!installPrompt)return;var p=installPrompt;installPrompt=null;
    p.prompt();p.userChoice.then(refreshInstallUi,refreshInstallUi);
  }
  addEventListener('beforeinstallprompt',function(e){e.preventDefault();installPrompt=e;refreshInstallUi();});
  addEventListener('appinstalled',function(){installPrompt=null;refreshInstallUi();});
  byId('installBtn2').onclick=promptInstall;
  /* The nav's Install entry is always there: one click installs where the browser
     offers a prompt, and opens the how-to (with iOS steps) everywhere else. */
  byId('installNav').onclick=function(){
    if(installPrompt&&!isStandalone()){promptInstall();return;}
    var hint=byId('installDialogHint'),btn=byId('installDialogBtn');
    btn.classList.add('hidden');
    if(isStandalone())hint.textContent='Phloem is already installed — you are reading in the app right now.';
    else if(isIos())hint.textContent='On iPhone or iPad: open this page in Safari, tap Share, then “Add to Home Screen”. Phloem gets its own icon and works offline for papers already on this device.';
    else hint.textContent='Your browser has not offered an install prompt on this visit. In Chrome or Edge, look for the small install icon at the right end of the address bar. Once installed, Phloem opens in its own window and works offline.';
    byId('installDialog').showModal();
  };
  byId('installDialogBtn').onclick=function(){byId('installDialog').close();promptInstall();};
  /* In the installed window, the portfolio link opens in a real browser tab. */
  if(isStandalone()){byId('homeLink').target='_blank';document.title='Phloem';}
  refreshInstallUi();
  if(SUPPORT_URL){byId('supportLink').href=SUPPORT_URL;byId('supportLine').classList.remove('hidden');}
  /* Nothing is lost without an account: papers and notes live in this browser's own
     storage. Asking for persistence stops the browser from quietly evicting them when
     disk runs low; the settings line reports what the browser promised. */
  if(navigator.storage&&navigator.storage.persist){
    navigator.storage.persist().catch(function(){}).then(function(){
      if(navigator.storage.persisted)navigator.storage.persisted().then(function(granted){
        byId('storageNote').textContent=granted
          ?'This browser has agreed to keep Phloem’s local data safe from automatic cleanup.'
          :'Storage here is best-effort — a browser cleanup could remove local data. Installing the app and keeping a backup (or sync) protects you.';
      },function(){});
    });
  }

  if('serviceWorker' in navigator&&location.protocol!=='file:'){try{navigator.serviceWorker.register('/reading-sw.js').catch(function(){});}catch(e){}}
  /* One-time sweep: titles that already picked up publisher markup get scrubbed. */
  (function(){
    var dirty=false;
    state.chapters.forEach(function(ch){
      if(/<[^>]+>|&#x?[0-9a-f]+;|&[a-z]+;/i.test(ch.title||'')){
        var cleaned=cleanMetaTitle(ch.title);
        if(cleaned&&cleaned!==ch.title){ch.title=cleaned;dirty=true;}
      }
    });
    if(dirty)persist(false);
  })();
  try{byId('buildStamp').textContent='This copy of Phloem was published '+document.lastModified+'.';}catch(e){}
  toggleSheet(false);
  /* Loading Google's script ahead of time keeps the first tap's token renewal inside
     the tap's own permission window. */
  Object.keys(state.merged||{}).forEach(function(dropId){queueDuplicateStorage(state.merged[dropId],dropId);});
  var startupDuplicateRepair=repairDuplicateStorage();
  var startupStarterGuide=seedStarterGuide();
  syncUi();renderShelf();updateReviewBadge();if(gdriveOn()){loadGis().catch(function(){});startupDuplicateRepair.then(function(){gdriveSync();});}
  /* A refresh drops you back into the paper you were reading, not the library. */
  try{var lastOpen=resolvedPaperId(localStorage.getItem(LAST_OPEN_KEY));if(lastOpen&&find(lastOpen))openReader(lastOpen);}catch(e){}Promise.all(state.chapters.filter(function(ch){return ch.kind==='pdf'&&derivedData(ch);}).map(putDerived)).then(function(){return startupDuplicateRepair;}).then(function(){persist(false);if(syncCfg)doSync();},function(){persist(false);if(syncCfg)doSync();});
  if(location.protocol==='file:') byId('launchDialog').showModal();
})();
