(function(){
  'use strict';
  /* Create a page at buymeacoffee.com or ko-fi.com, paste its URL here, and the
     support line under the library shelf appears. Empty keeps it hidden. */
  var SUPPORT_URL = 'https://buymeacoffee.com/houfu72';
  var KEY = 'readingRoom.v1';
  var LAST_OPEN_KEY = 'readingRoom.lastOpen.v1';
  var SYNC_KEY = 'readingRoom.sync.v1';
  var LEGACY_AI_KEY = 'readingRoom.ai.v1';
  var AI_SETTINGS_KEY = 'readingRoom.ai.providers.v1';
  var AI_PROVIDERS = {
    gemini:{label:'Gemini API',model:'gemini-3.6-flash'},
    deepseek:{label:'DeepSeek',model:'deepseek-v4-flash'},
    openai:{label:'OpenAI',model:'gpt-5-mini'},
    anthropic:{label:'Anthropic',model:'claude-sonnet-4-20250514'},
    compatible:{label:'OpenAI-compatible',model:'',endpoint:''}
  };
  var STARTER_GUIDE_URL = '/assets/phloem-guide/phloem-field-guide.pdf';
  var STARTER_GUIDE_ID = 'phloem-field-guide-v1';
  var PDF_ZOOM_PREFERENCE_VERSION = 2;
  var SYNC_FILE = 'reading-room.enc.json';
  var LOOKUP_DELAY = 900;
  var REVIEW_WORKSPACE_CATEGORY = 'In review';
  var LEGACY_REVIEW_WORKSPACE_CATEGORY = 'Under review';
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
  /* Until async first-run seeding and Drive restoration settle, an empty local state
     is unknown—not an empty library. Keep onboarding out of that reload interval. */
  var libraryHydrating = state.chapters.length === 0;
  var currentId = null, currentPage = 1, pdfDoc = null, pdfLib = null, pdfRendering = false, pdfRenderPending = false;
  var pdfZoom = 1, pdfFit = true, darkPdf = false, readerBuildPromises = {}, pendingSelection = null, highlightMode = false, highlightColor = 'yellow', highlightCommitTimer = null, readerToastTimer = null, recallActive = false;
  var selectionAnchor = null, selectionNoteTarget = null;
  var lookupTimer = null, lookupSerial = 0, lookupAnchor = null, lookupCache = Object.create(null);
  var localAiPreparePromise = null;
  var readerMode = 'pdf', editingId = null, aiContext = null, aiThreadDraft = false, syncCfg = null, syncing = false, syncTimer = null, aiSettings = loadAiSettings(), reviewFocusId = '', reviewFocusPage = 0, reviewFocusAnchorIndex = -1, reviewFilter = 'all', reviewLinkTargetId = '', reviewLinkUndo = null, pendingReviewTargetId = '', pendingReviewReplace = false, reviewPairPaper = null, reviewPairComments = null;
  try { syncCfg = JSON.parse(localStorage.getItem(SYNC_KEY)); } catch(e){}

  function byId(id){ return document.getElementById(id); }
  function now(){ return Date.now(); }
  function elapsedLabel(ms){ms=Math.max(0,+ms||0);if(ms<1000)return'<1 sec';var seconds=Math.round(ms/1000);if(seconds<60)return seconds+' sec';var minutes=Math.floor(seconds/60),rest=seconds%60;return minutes+' min'+(rest?' '+rest+' sec':'');}
  function uid(prefix){ return prefix + now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s){ return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function paras(text){ return String(text || '').split(/\n\s*\n/).map(function(p){ return p.trim(); }).filter(Boolean); }
  function defaultAiSettings(){
    var providers={};Object.keys(AI_PROVIDERS).forEach(function(id){providers[id]={key:'',model:AI_PROVIDERS[id].model||'',endpoint:AI_PROVIDERS[id].endpoint||''};});
    return{provider:'auto',providers:providers};
  }
  function loadAiSettings(){
    var cfg=defaultAiSettings(),saved=null;
    try{saved=JSON.parse(localStorage.getItem(AI_SETTINGS_KEY)||'null');}catch(e){}
    if(saved&&saved.providers){
      cfg.provider=saved.provider==='browser'?'auto':(saved.provider||'auto');
      Object.keys(cfg.providers).forEach(function(id){if(saved.providers[id])cfg.providers[id]=Object.assign(cfg.providers[id],saved.providers[id]);});
    }
    var legacy='';try{legacy=localStorage.getItem(LEGACY_AI_KEY)||'';}catch(e){}
    if(legacy&&!cfg.providers.deepseek.key){cfg.providers.deepseek.key=legacy;if(!saved)cfg.provider='deepseek';try{localStorage.setItem(AI_SETTINGS_KEY,JSON.stringify(cfg));}catch(e){}}
    if(!AI_PROVIDERS[cfg.provider]&&cfg.provider!=='auto')cfg.provider='auto';return cfg;
  }
  function saveAiSettings(){try{localStorage.setItem(AI_SETTINGS_KEY,JSON.stringify(aiSettings));}catch(e){} }
  function browserLanguageModel(){return window.LanguageModel||(window.ai&&window.ai.languageModel)||null;}
  function cloudAiRoute(preferred){
    var ids=preferred&&preferred!=='auto'?[preferred]:['gemini','deepseek','openai','anthropic','compatible'];
    for(var i=0;i<ids.length;i++){var id=ids[i],cfg=aiSettings.providers[id]||{};if(AI_PROVIDERS[id]&&cfg.key&&cfg.model&&(id!=='compatible'||cfg.endpoint))return{id:id,label:AI_PROVIDERS[id].label,cfg:cfg};}
    return null;
  }
  function activeAiRoute(skipBrowser){var selected=aiSettings.provider||'auto';if(selected==='auto')return!skipBrowser&&browserLanguageModel()?{id:'browser',label:'Gemini Nano (on device)',cfg:{}}:null;return cloudAiRoute(selected);}
  function reviewAiPlan(){
    aiSettings=loadAiSettings();var selected=aiSettings.provider||'auto',route=selected==='auto'?(browserLanguageModel()?{id:'browser',label:'Gemini Nano (on device)',cfg:{}}:null):cloudAiRoute(selected);
    return{mode:selected==='auto'?(route?'local':'none'):(route?'cloud':'none'),classification:route,location:route};
  }
  function hasAiRoute(){aiSettings=loadAiSettings();return!!activeAiRoute(false);}
  function aiSetupError(message){var e=new Error(message);e.aiSetup=true;return e;}
  function setTaskProgress(id,value){
    var rail=byId(id);if(!rail)return;if(value===false){rail.classList.add('hidden');rail.classList.remove('indeterminate');rail.removeAttribute('aria-valuenow');rail.style.removeProperty('--task-progress');return;}
    var amount=Number(value),determinate=value!==null&&value!==undefined&&Number.isFinite(amount);rail.classList.remove('hidden');rail.classList.toggle('indeterminate',!determinate);if(!determinate){rail.removeAttribute('aria-valuenow');rail.style.removeProperty('--task-progress');return;}amount=Math.max(0,Math.min(100,Math.round(amount)));rail.setAttribute('aria-valuenow',String(amount));rail.style.setProperty('--task-progress',amount+'%');
  }
  function aiProgress(fn,message,progress){if(fn)fn(message,progress);}
  function aiSystem(messages){var found=(messages||[]).find(function(message){return message.role==='system';});return found&&found.content||'You are a helpful reading assistant.';}
  function aiTurns(messages){return(messages||[]).filter(function(message){return message.role!=='system';}).map(function(message){return{role:message.role==='assistant'?'assistant':'user',content:String(message.content||'')};});}
  function trimBrowserPrompt(text){text=String(text||'');return text.length<=12000?text:text.slice(0,9000)+'\n\n[Middle of context shortened for the on-device model.]\n\n'+text.slice(-2600);}
  function aiTranscript(messages){return aiTurns(messages).map(function(message){return(message.role==='assistant'?'Assistant':'Reader')+': '+message.content;}).join('\n\n');}
  function browserAiOptions(api,system){return api===window.LanguageModel?{initialPrompts:[{role:'system',content:system}]}:{systemPrompt:system};}
  function browserDownloadMessage(loaded){loaded=Number(loaded);if(!Number.isFinite(loaded)||loaded<=0)return'Chrome is starting the on-device Gemini download…';if(loaded>=1)return'Gemini is downloaded. Chrome is preparing it for use…';return'Downloading on-device Gemini… '+Math.max(1,Math.round(loaded*100))+'%';}
  function browserAiFriendlyError(error){if(error&&(error.name==='NotAllowedError'||error.name==='InvalidStateError'))return aiSetupError('Chrome needs a direct click to download Gemini. Open Desk settings and press Prepare on-device Gemini.');if(error&&error.name==='NotSupportedError')return aiSetupError('This device cannot run Gemini Nano. Choose DeepSeek or another cloud provider in settings.');return error;}
  function prepareBrowserAi(onProgress){
    if(localAiPreparePromise)return localAiPreparePromise;var api=browserLanguageModel();if(!api)return Promise.reject(aiSetupError('On-device Gemini is not available in this browser. Choose a cloud provider in settings.'));
    var options=browserAiOptions(api,'You are a concise research reading partner.');options.monitor=function(m){if(!m||!m.addEventListener)return;m.addEventListener('downloadprogress',function(event){var loaded=Number(event.loaded);aiProgress(onProgress,browserDownloadMessage(loaded),loaded>=1?null:Math.max(0,loaded*100));});};aiProgress(onProgress,'Asking Chrome to prepare on-device Gemini…',null);
    /* create() is intentionally invoked before any await: Chrome permits the first
       model download only while this direct button click still counts as activation. */
    var creation;try{creation=api.create(options);}catch(error){return Promise.reject(browserAiFriendlyError(error));}
    localAiPreparePromise=Promise.resolve(creation).then(function(session){if(session&&session.destroy)try{session.destroy();}catch(e){}aiProgress(onProgress,'On-device Gemini is ready. Future reviews can start immediately.',100);return true;}).catch(function(error){throw browserAiFriendlyError(error);}).finally(function(){localAiPreparePromise=null;});return localAiPreparePromise;
  }
  async function runBrowserAi(messages,onProgress){
    var api=browserLanguageModel();if(!api)throw aiSetupError('On-device Gemini is not available in this browser. Choose a cloud provider in settings.');
    if(localAiPreparePromise)await localAiPreparePromise;var system=aiSystem(messages),options=browserAiOptions(api,system),availability='available';
    try{if(api.availability)availability=await api.availability(options);else if(api.capabilities){var caps=await api.capabilities();availability=caps&&caps.available||'unavailable';}}catch(e){availability='unavailable';}
    if(availability==='unavailable'||availability==='no')throw aiSetupError('This device cannot run Gemini Nano. Choose Gemini, DeepSeek, or another cloud provider in settings.');
    if(availability==='downloadable'||availability==='after-download'||availability==='downloading')aiProgress(onProgress,'Preparing on-device Gemini…',null);
    options.monitor=function(m){if(!m||!m.addEventListener)return;m.addEventListener('downloadprogress',function(e){var loaded=Number(e.loaded);aiProgress(onProgress,browserDownloadMessage(loaded),loaded>=1?null:Math.max(0,loaded*100));});};
    var session;
    try{session=await api.create(options);aiProgress(onProgress,'Thinking on this device…',null);var answer=await session.prompt(trimBrowserPrompt(aiTranscript(messages)));if(!String(answer||'').trim())throw new Error('On-device Gemini returned no answer');return{text:String(answer).trim(),provider:'Gemini Nano (on device)'};}
    catch(e){if(e&&e.aiSetup)throw e;throw browserAiFriendlyError(e);}
    finally{if(session&&session.destroy)try{session.destroy();}catch(e){}}
  }
  async function aiResponseError(response,label){
    if(response.ok)return;var detail='';try{var body=await response.json();detail=body&&body.error&&(body.error.message||body.error)||body&&body.message||'';}catch(e){}
    throw new Error(label+' returned '+response.status+(detail?': '+String(detail).slice(0,180):''));
  }
  async function runCloudAi(route,messages,maxTokens){
    var id=route.id,cfg=route.cfg,response,data,text='',system=aiSystem(messages),turns=aiTurns(messages);
    if(id==='gemini'){
      response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(cfg.model)+':generateContent',{method:'POST',headers:{'x-goog-api-key':cfg.key,'Content-Type':'application/json'},body:JSON.stringify({system_instruction:{parts:[{text:system}]},contents:turns.map(function(message){return{role:message.role==='assistant'?'model':'user',parts:[{text:message.content}]};}),generationConfig:{maxOutputTokens:maxTokens}})});
      await aiResponseError(response,route.label);data=await response.json();text=((((data.candidates||[])[0]||{}).content||{}).parts||[]).map(function(part){return part.text||'';}).join('');
    }else if(id==='deepseek'){
      var deepseekBody={model:cfg.model,max_tokens:maxTokens,thinking:{type:'disabled'},messages:(messages||[]).map(function(message){return{role:message.role,content:message.content};})};if(/return only json/i.test(system))deepseekBody.response_format={type:'json_object'};response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+cfg.key,'Content-Type':'application/json'},body:JSON.stringify(deepseekBody)});
      await aiResponseError(response,route.label);data=await response.json();text=String(((((data.choices||[])[0]||{}).message||{}).content)||'');
    }else if(id==='openai'){
      response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':'Bearer '+cfg.key,'Content-Type':'application/json'},body:JSON.stringify({model:cfg.model,max_output_tokens:maxTokens,instructions:system,input:turns})});
      await aiResponseError(response,route.label);data=await response.json();text=String(data.output_text||'');if(!text)text=(data.output||[]).reduce(function(all,item){return all.concat((item.content||[]).filter(function(part){return part.type==='output_text';}).map(function(part){return part.text||'';}));},[]).join('');
    }else if(id==='anthropic'){
      response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':cfg.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true','Content-Type':'application/json'},body:JSON.stringify({model:cfg.model,max_tokens:maxTokens,system:system,messages:turns})});
      await aiResponseError(response,route.label);data=await response.json();text=(data.content||[]).filter(function(part){return part.type==='text';}).map(function(part){return part.text||'';}).join('');
    }else{
      response=await fetch(cfg.endpoint,{method:'POST',headers:{'Authorization':'Bearer '+cfg.key,'Content-Type':'application/json'},body:JSON.stringify({model:cfg.model,max_tokens:maxTokens,messages:(messages||[]).map(function(message){return{role:message.role,content:message.content};})})});
      await aiResponseError(response,route.label);data=await response.json();text=String(((((data.choices||[])[0]||{}).message||{}).content)||'');
    }
    if(!text.trim())throw new Error(route.label+' returned no answer');return{text:text.trim(),provider:route.label};
  }
  async function runAiMessages(messages,maxTokens,onProgress,routeOverride){
    aiSettings=loadAiSettings();var route=routeOverride||activeAiRoute(false);if(!route)throw aiSetupError('Choose an AI provider and add its API key in settings.');
    if(route.id==='browser')return runBrowserAi(messages,onProgress);
    aiProgress(onProgress,'Asking '+route.label+'…');return runCloudAi(route,messages,maxTokens);
  }
  function runAi(system,user,maxTokens,onProgress,routeOverride){return runAiMessages([{role:'system',content:system},{role:'user',content:user}],maxTokens,onProgress,routeOverride);}
  var REVIEW_LEVEL_LABELS={general:'General',section:'Section',specific:'Specific',editorial:'Editorial / typo'};
  var REVIEW_TOPIC_LABELS={writing:'Writing',structure:'Structure',methods:'Methods',statistics:'Statistics',modeling:'Modeling',evidence:'Evidence',figures:'Figure / table',consistency:'Consistency',claims:'Claims',references:'References',other:'Other'};
  function normalizeReviewLevel(value,comment){
    value=String(value||'').toLowerCase().replace(/[^a-z]+/g,'');
    if(value==='sectional'||value==='sectionwide')value='section';
    if(value==='typo'||value==='language'||value==='copyedit')value='editorial';
    if(!REVIEW_LEVEL_LABELS[value])value=comment&&comment.anchored?'specific':'general';
    return value;
  }
  function normalizeReviewTopic(value){
    value=String(value||'').toLowerCase().replace(/[^a-z]+/g,'');
    var aliases={typo:'writing',language:'writing',grammar:'writing',style:'writing',method:'methods',analysis:'statistics',data:'evidence',figure:'figures',table:'figures',visual:'figures',model:'modeling',citation:'references',reference:'references',interpretation:'claims',scope:'claims'};
    value=aliases[value]||value;return REVIEW_TOPIC_LABELS[value]?value:'other';
  }
  function reviewLevelLabel(value){return REVIEW_LEVEL_LABELS[value]||REVIEW_LEVEL_LABELS.general;}
  function reviewTopicLabel(value){return REVIEW_TOPIC_LABELS[value]||REVIEW_TOPIC_LABELS.other;}
  function normalize(ch){
    ch.notes = ch.notes || {}; ch.pageNotes = ch.pageNotes || {}; ch.tags = ch.tags || [];
    ch.questions = ch.questions || []; ch.highlights = ch.highlights || {}; ch.textHighlights = ch.textHighlights || [];
    if(!Array.isArray(ch.aiThreads))ch.aiThreads=[];
    if(!ch.aiThreads.length&&ch.questions.length)ch.aiThreads=ch.questions.slice(0,12).map(function(q){return {id:'legacy-'+(q.id||uid('q')),contextLabel:q.contextLabel||'Earlier question',contextText:q.excerpt||'',messages:[{role:'user',content:q.question||'',at:q.at||now()},{role:'assistant',content:q.answer||'',at:q.at||now()}],createdAt:q.at||now(),updatedAt:q.at||now()};});
    ch.aiThreads=ch.aiThreads.filter(function(t){return t&&t.id&&Array.isArray(t.messages);}).slice(0,12);if(ch.activeAiThreadId&&!ch.aiThreads.some(function(t){return t.id===ch.activeAiThreadId;}))ch.activeAiThreadId='';if(!ch.activeAiThreadId&&ch.aiThreads[0])ch.activeAiThreadId=ch.aiThreads[0].id;
    ch.readerHighlights = ch.readerHighlights || []; ch.readerNotes = ch.readerNotes || {}; ch.termLookups = ch.termLookups || {}; ch.reviews = ch.reviews || {};
    if(!Array.isArray(ch.reviewComments))ch.reviewComments=[];
    if(!Array.isArray(ch.reviewReports))ch.reviewReports=[];ch.reviewUpdatedAt=+ch.reviewUpdatedAt||0;ch.reviewClearedAt=+ch.reviewClearedAt||0;var legacyReviewReports={};ch.reviewReports.forEach(function(report){if(!report.extractorVersion||report.extractorVersion<2)legacyReviewReports[report.id]=1;});
    ch.reviewComments.forEach(function(comment){comment.replies=Array.isArray(comment.replies)?comment.replies:[];comment.anchors=Array.isArray(comment.anchors)?comment.anchors:(comment.anchored&&comment.para!==null&&comment.para!==undefined?[{para:comment.para,start:comment.start,end:comment.end,quote:comment.quote||'',method:comment.anchorMethod||'ai'}]:[]);comment.anchors=comment.anchors.map(function(anchor){return{para:+anchor.para,start:+anchor.start||0,end:+anchor.end||0,quote:String(anchor.quote||''),method:String(anchor.method||comment.anchorMethod||'ai'),manual:!!anchor.manual};}).filter(function(anchor){return Number.isInteger(anchor.para)&&anchor.para>=0&&anchor.end>anchor.start;});comment.response=String(comment.response||'');comment.locationHint=String(comment.locationHint||'');comment.level=normalizeReviewLevel(comment.level,comment);comment.topic=normalizeReviewTopic(comment.topic);comment.page=+comment.page||null;comment.manualReviewLink=!!comment.manualReviewLink;comment.manualLocationRejected=!!comment.manualLocationRejected;comment.pdfAnchors=Array.isArray(comment.pdfAnchors)?comment.pdfAnchors.map(function(anchor){return{page:+anchor.page||null,quote:String(anchor.quote||''),confidence:Math.max(0,Math.min(1,+anchor.confidence||0)),method:String(anchor.method||'ai-pdf-page'),manual:!!anchor.manual||String(anchor.method||'').indexOf('manual-')===0};}).filter(function(anchor){return anchor.page;}):[];if(!comment.pdfAnchors.length&&comment.page)comment.pdfAnchors=[{page:comment.page,quote:String(comment.quote||''),confidence:Math.max(0,Math.min(1,+comment.matchConfidence||0)),method:String(comment.anchorMethod||'ai-pdf-page'),manual:comment.manualReviewLink}];comment.legacyImport=!!legacyReviewReports[comment.sourceId];if(comment.legacyImport&&!comment.manualReviewLink){comment.anchored=false;comment.page=null;comment.quote='';comment.pdfAnchors=[];}comment.resolved=!!comment.resolved;});
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
  function reviewStateStamp(ch){
    if(!ch)return 0;var stamp=Math.max(+ch.reviewUpdatedAt||0,+ch.reviewClearedAt||0);(ch.reviewComments||[]).forEach(function(comment){stamp=Math.max(stamp,+comment.updatedAt||0,+comment.addedAt||0);});(ch.reviewReports||[]).forEach(function(report){stamp=Math.max(stamp,+report.updatedAt||0,+report.addedAt||0);});if(!stamp&&((ch.reviewComments||[]).length||(ch.reviewReports||[]).length))stamp=+ch.updatedAt||0;return stamp;
  }
  function copyReviewState(target,source){target.reviewComments=source.reviewComments||[];target.reviewReports=source.reviewReports||[];target.reviewUpdatedAt=+source.reviewUpdatedAt||reviewStateStamp(source);target.reviewClearedAt=+source.reviewClearedAt||0;return target;}
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
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.chapters)) { s.chapters.forEach(normalize);s.deleted=s.deleted||{};s.merged=s.merged||{};s.categoryOrder=Array.isArray(s.categoryOrder)?s.categoryOrder:[];s.categoryOrderUpdatedAt=+s.categoryOrderUpdatedAt||0;s.chapters=s.chapters.filter(function(ch){return !s.deleted[ch.id];});if(migrateReviewWorkspaceLabels(s,true))localStorage.setItem(KEY,JSON.stringify(s));return s; } } catch(e){}
    return { chapters: [], deleted: {}, merged: {}, categoryOrder: [], categoryOrderUpdatedAt: 0 };
  }
  function migrateReviewWorkspaceLabels(target,touchRecords){
    if(!target)return false;var changed=false,legacy=LEGACY_REVIEW_WORKSPACE_CATEGORY.toLowerCase(),stamp=now();
    (target.chapters||[]).forEach(function(ch){if(String(ch.category||'').trim().toLowerCase()===legacy){ch.category=REVIEW_WORKSPACE_CATEGORY;if(touchRecords)ch.updatedAt=Math.max(stamp,+ch.updatedAt||0);changed=true;}if(String(ch.reviewPreviousCategory||'').trim().toLowerCase()===legacy){ch.reviewPreviousCategory=REVIEW_WORKSPACE_CATEGORY;changed=true;}});
    var seen={},order=[];(target.categoryOrder||[]).forEach(function(label){label=String(label||'').trim();if(label.toLowerCase()===legacy){label=REVIEW_WORKSPACE_CATEGORY;changed=true;}var key=label.toLowerCase();if(label&&!seen[key]){seen[key]=1;order.push(label);}else if(label)changed=true;});if(changed){target.categoryOrder=order;if(touchRecords)target.categoryOrderUpdatedAt=Math.max(stamp,+target.categoryOrderUpdatedAt||0);}return changed;
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

  /* Selection stays a small, local decision: define, highlight, or write a note.
     AI becomes available inside that note only after the reader has written one. */
  function hideSelectionCard(){
    hideLookup();
    selectionAnchor=null;activeCardRef=null;selectionNoteTarget=null;var card=byId('selectionCard');card.classList.add('hidden');card.classList.remove('ai-open','note-open');
    byId('selectionAiBox').classList.add('hidden');byId('selectionSavedTools').classList.add('hidden');byId('selectionNoteAi').classList.add('hidden');byId('selectionContext').classList.add('hidden');
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
  function refreshSelectionNoteThread(){
    var note=String(selectionNoteTarget&&selectionNoteTarget.item&&selectionNoteTarget.item.note||'').trim(),card=byId('selectionCard');
    byId('selectionNoteAi').classList.toggle('hidden',!note);if(!card.classList.contains('ai-open'))byId('selectionContext').classList.add('hidden');
  }
  function setSelectionAction(id){document.querySelectorAll('#selectionCard .selection-action').forEach(function(button){var active=button.id===id;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});}
  function syncReviewLinkSelectionAction(selection){
    var ch=find(currentId),comment=reviewerById(ch,reviewLinkTargetId),button=byId('selectionLinkReview'),allowed=!!(comment&&selection&&((ch.kind==='pdf'&&selection.kind==='pdf')||(ch.kind!=='pdf'&&selection.kind==='text')));
    button.classList.toggle('hidden',!allowed);if(allowed)button.textContent='Link selected text to R'+reviewOrdinal(ch,comment);
  }
  function showSelectionCard(selection,rect){
    if(!selection||!selection.text)return;hideLookup();hideHighlightCard();selectionNoteTarget=null;byId('selectionEyebrow').textContent='Selected passage';
    byId('selectionCard').classList.remove('ai-open','note-open');byId('selectionAiBox').classList.add('hidden');byId('selectionSavedTools').classList.add('hidden');byId('selectionNoteAi').classList.add('hidden');byId('selectionContext').classList.add('hidden');
    byId('selectionExcerpt').textContent='“'+selection.text+'”';byId('selectionNote').value='';byId('selectionAiNoteText').textContent='';byId('selectionNoteStatus').textContent='';byId('selectionNoteBox').classList.add('hidden');
    var highlight=byId('selectionHighlight');highlight.disabled=false;highlight.textContent='Highlight';
    byId('selectionSecondary').classList.remove('hidden');
    byId('selectionAddNote').textContent='Add note';syncReviewLinkSelectionAction(selection);setSelectionAction('');byId('selectionCard').classList.remove('hidden');placeSelectionCard(rect);
  }
  function openSelectionInAi(){
    var selection=pendingSelection||lastAskSelection,ownNote=String(selectionNoteTarget&&selectionNoteTarget.item&&selectionNoteTarget.item.note||'').trim(),note=notesForSelection(selection);
    if(!selection||!selection.text||!ownNote||!useSelectionForAi(selection,note,true))return;clearPendingSelection(true);
    var ch=find(currentId),savedText=String(aiContext&&aiContext.text||'').slice(0,16000),match=ch&&(ch.aiThreads||[]).find(function(thread){return thread.contextLabel===aiContext.label&&thread.contextText===savedText;});
    if(match){ch.activeAiThreadId=match.id;aiThreadDraft=false;}else aiThreadDraft=true;renderQa();
    var card=byId('selectionCard');card.classList.remove('note-open');card.classList.add('ai-open');byId('selectionAiBox').classList.remove('hidden');byId('selectionContext').classList.add('hidden');byId('selectionAiNoteText').textContent=ownNote;byId('selectionAiQuestion').value='';growSelectionAiQuestion();byId('selectionAiStatus').textContent=match?'Thread reopened.':'Your question will start a thread from this note.';renderSelectionAiThread();placeSelectionCard();
    requestAnimationFrame(function(){byId('selectionAiQuestion').focus({preventScroll:true});});
  }

  /* A selection stays on the paper while this small, source-labelled reference card
     looks up an encyclopedic definition and a freely hosted image. */
  function hideLookup(){clearTimeout(lookupTimer);lookupSerial++;lookupAnchor=null;byId('lookupCard').classList.add('hidden');byId('selectionCard').classList.remove('lookup-open');placeSelectionCard();}
  function placeLookupCard(rect){
    if(rect)lookupAnchor={left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};
    var card=byId('lookupCard');if(!lookupAnchor||card.classList.contains('hidden'))return;
    if(card.parentElement===byId('selectionCard')){byId('selectionCard').classList.add('lookup-open');placeSelectionCard();return;}
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
    var source=byId('lookupSource'),isAi=result.source==='ai';source.textContent=isAi?(result.provider||'AI')+' explanation · verify':'Wikipedia';source.classList.toggle('ai',isAi);source.classList.remove('hidden');byId('lookupAiSetup').classList.add('hidden');
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
  async function aiGlossaryEntry(term,context){
    if(!hasAiRoute())return null;byId('lookupTitle').textContent='Asking AI…';byId('lookupDefinition').textContent='Wikipedia has no clean entry, so I’m reading this term in the paper’s context.';
    var ch=find(currentId),result=await runAi('You write careful glossary notes for scientific-paper readers. Define the selected term as used in the supplied excerpt. Be concise, concrete, and honest about ambiguity. Return only valid JSON with string fields title, definition, and image_query. The definition must be 2-3 sentences with no markdown. image_query must name one concrete scientific object, organism, process diagram, or instrument suitable for a Wikimedia Commons search; leave it empty if no honest visual exists.','Paper: '+(ch&&ch.title||'Untitled')+'\nSelected term: '+term+'\nNearby excerpt: '+String(context||'No nearby excerpt available.').slice(0,1800),360,function(message){byId('lookupTitle').textContent=message;});
    var match=result.text.match(/\{[\s\S]*\}/),parsed=match&&JSON.parse(match[0]);if(!parsed||!String(parsed.definition||'').trim())throw new Error(result.provider+' returned no definition');
    return{title:String(parsed.title||term).trim().slice(0,100),extract:String(parsed.definition).trim(),url:'',image:'',imagePage:'',imageQuery:String(parsed.image_query||'').trim().slice(0,100),source:'ai',provider:result.provider};
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
        if(!hasAiRoute()){lookupCache[key]=null;showLookupProblem(term,'Wikipedia has no clean entry for this phrase. Set up on-device Gemini or add an AI provider key to explain it from the nearby paper context.');byId('lookupAiSetup').classList.remove('hidden');return;}
        result=await aiGlossaryEntry(term,context);if(serial!==lookupSerial)return;
      }
      lookupCache[key]=result;renderLookup(term,result);
      if(!result.image&&!result.imageChecked){var image=null;try{image=await commonsImage(result.imageQuery||result.title||term);}catch(imageError){}if(serial!==lookupSerial)return;result=Object.assign({},result,{imageChecked:true});if(image){result.image=image.url;result.imagePage=image.page;}lookupCache[key]=result;renderLookup(term,result);}
      if(ch&&(!paperHit||ch.termLookups[termKey]!==result))rememberLookup(ch,termKey,result);
    }catch(e){if(serial===lookupSerial){showLookupProblem(term,e&&e.aiSetup?e.message:'The reference lookup could not finish. Your highlight is still safe—try again when you are online.');if(e&&e.aiSetup)byId('lookupAiSetup').classList.remove('hidden');}}
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
  /* Safari's "Block All Cookies" makes localStorage itself throw; an unguarded read
     this early would abort the whole script and leave a blank page. */
  var savedTheme = null; try { savedTheme = localStorage.getItem('readingRoom.theme'); } catch(e){}
  applyTheme(savedTheme ? savedTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  byId('themeBtn').onclick = function(){
    var dark = document.documentElement.dataset.theme !== 'dark';
    try { localStorage.setItem('readingRoom.theme', dark ? 'dark' : 'light'); } catch(e){}
    applyTheme(dark);
  };
  var historyEcho=0,navFromPop=false;
  function showPage(id){
    var wasReading=!byId('readerPage').classList.contains('hidden');
    ['libraryPage','reviewPage','connectionsPage','readerPage'].forEach(function(v){ byId(v).classList.toggle('hidden', v !== id); });
    document.documentElement.classList.toggle('reading-root', id === 'readerPage');
    document.querySelectorAll('.nav-btn[data-view]').forEach(function(b){ b.classList.toggle('active', b.dataset.view === id); });
    document.body.classList.toggle('library-view', id === 'libraryPage');
    /* The reader is an app screen, not a document: while it is open the page itself must
       never scroll, or the toolbar slides under the sticky masthead. */
    document.body.classList.toggle('reading', id === 'readerPage');
    if (id !== 'readerPage') { toggleSheet(false); hideLookup(); byId('linkReturn').classList.add('hidden'); try{localStorage.removeItem(LAST_OPEN_KEY);}catch(e){} }
    /* Any exit that bypasses the back button (masthead, brand, deleting the open
       paper) still consumes the reader's history layer, or the next system back
       would be silently dead. A sheet layer mid-consume reads as 'sheet' here and
       the extra back below settles both layers; the echoes are swallowed. */
    if (wasReading && id !== 'readerPage' && !navFromPop) {
      try{ if(history.state&&history.state.phloem){ history.back(); historyEcho++; } }catch(e){}
    }
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
        if (ae && ae.closest && ae.closest('.tab-panel, .find-bar, .notebook, .selection-card')) { try { ae.scrollIntoView({ block: 'nearest' }); } catch(e){} }
      }, 60);
    };
    ['resize', 'scroll'].forEach(function(name){
      window.visualViewport.addEventListener(name, function(){ if (!kbRaf) kbRaf = requestAnimationFrame(syncKeyboardInset); });
    });
  }
  document.querySelectorAll('.nav-btn[data-view]').forEach(function(b){ b.onclick = function(){ showPage(b.dataset.view); }; });
  byId('brandBtn').onclick = function(){ showPage('libraryPage'); };
  byId('readerBack').onclick = function(){
    /* Leaving through our own button consumes the reader's history layer too, so the
       next system back does not have to be pressed twice. */
    /* Not an echo: this back IS the exit — the popstate handler performs it. */
    if(history.state&&history.state.phloem==='reader'){try{history.back();return;}catch(e){}}
    pdfDoc = null; showPage('libraryPage');
  };
  /* The system back gesture peels UI layer by layer, and the machine self-heals:
     every history.back() the app issues is counted, and its popstate echo is
     swallowed instead of read as a user gesture — repairing the stack if the user
     reopened the sheet inside the async window. Entries that stop matching the
     screen are re-stamped rather than trusted, a forward-press onto a dead app
     entry bounces straight back, and leaving the reader closes any open dialog. */
  addEventListener('popstate',function(e){
    var st=e.state&&e.state.phloem;
    var sheetOpen=byId('notebook').classList.contains('sheet-open');
    var readerOpen=!byId('readerPage').classList.contains('hidden');
    if(historyEcho>0){
      historyEcho--;
      if(sheetOpen&&st!=='sheet'){try{history.pushState({phloem:'sheet'},'');}catch(err){}}
      return;
    }
    if(sheetOpen&&st!=='sheet'){
      toggleSheet(false,true);
      if(readerOpen&&!st){try{history.replaceState({phloem:'reader'},'');}catch(err){}}
      return;
    }
    if(readerOpen){
      if(!st){
        document.querySelectorAll('dialog[open]').forEach(function(d){try{d.close();}catch(err){}});
        setDrift(0);if(zenOn)setZen(false);pdfDoc=null;
        navFromPop=true;try{showPage('libraryPage');}finally{navFromPop=false;}
      }
      else if(st==='sheet'&&!sheetOpen){try{history.replaceState({phloem:'reader'},'');}catch(err){}}
      return;
    }
    if(st){try{history.back();historyEcho++;}catch(err){}}
  });

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
  async function pdfBytes(value){if(value instanceof ArrayBuffer)return value.slice(0);if(ArrayBuffer.isView(value))return value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength);if(value&&value.arrayBuffer)return value.arrayBuffer();throw new Error('The saved source file is not readable.');}
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
  function originalSourceFilename(ch){
    var fallback=String(ch.title||'document').replace(/[\u0000-\u001f\u007f/\\<>:"|?*]+/g,' ').replace(/\s+/g,' ').trim().slice(0,120)||'document';
    if(ch.sourceType==='docx'){var word=String(ch.sourceName||fallback+'.docx');return /\.docx$/i.test(word)?word:word+'.docx';}
    return notebookPdfFilename(ch);
  }
  async function downloadOriginalFile(ch,button){
    var spec=binarySourceSpec(ch);if(!ch||!spec)return;var original=button&&button.textContent;if(button){button.disabled=true;button.textContent='Getting…';}
    try{
      var stored=await getPdf(ch.id);
      if(!stored&&gdriveOn())stored=await gdriveFetchSource(ch,true,function(loaded,total){if(button&&total)button.textContent=Math.min(99,Math.round(loaded/total*100))+'%';});
      if(!stored){showError('The original '+spec.label+' is not stored on this device yet. Re-add it here or sync it from Drive first.','Original file not on this device');return;}
      var blob=stored instanceof Blob?stored:new Blob([stored],{type:spec.mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=originalSourceFilename(ch);document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},5000);showReaderToast('Original '+spec.label+' downloaded');
    }catch(e){showError('Phloem could not download this '+spec.label+'. Re-add the local file and try again.','Could not download file');}
    finally{if(button){button.disabled=false;button.textContent=original;}}
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
    if(!ch||ch.kind!=='pdf')return ch;var saved=await getDerived(ch.id);if(saved)mergeDerivedInto(ch,saved);if(repairPdfReviewQuotes(ch))persist(false);return ch;
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
  function shelfPaperCategory(ch){return String(ch.category||'').trim()||'Unsorted';}
  function categoryLabel(value){value=String(value||'').trim().replace(/\s+/g,' ').slice(0,48);return value||'Unsorted';}
  function setShelfPaperCategory(ch,value){var label=categoryLabel(value);if(label.toLowerCase()==='unsorted')delete ch.category;else ch.category=label;ch.updatedAt=now();return label;}
  function placeInReviewWorkspace(ch){
    if(!ch)return;
    var previous=shelfPaperCategory(ch);if(previous.toLowerCase()!==REVIEW_WORKSPACE_CATEGORY.toLowerCase()&&previous.toLowerCase()!=='unsorted'&&!ch.reviewPreviousCategory)ch.reviewPreviousCategory=previous;
    setShelfPaperCategory(ch,REVIEW_WORKSPACE_CATEGORY);ch.reviewWorkspace=true;
    var order=(state.categoryOrder||[]).filter(function(label){var key=String(label||'').toLowerCase();return key!==REVIEW_WORKSPACE_CATEGORY.toLowerCase()&&key!==LEGACY_REVIEW_WORKSPACE_CATEGORY.toLowerCase();});order.unshift(REVIEW_WORKSPACE_CATEGORY);state.categoryOrder=order;state.categoryOrderUpdatedAt=now();
  }
  function shelfCategoryNames(){
    var raw=[],existing={},names=[],seen={};state.chapters.forEach(function(ch){var label=shelfPaperCategory(ch),key=label.toLowerCase();if(!existing[key]){existing[key]=label;raw.push(label);}});(state.categoryOrder||[]).forEach(function(label){var key=String(label||'').toLowerCase();if(existing[key]&&!seen[key]){seen[key]=true;names.push(existing[key]);}});raw.forEach(function(label){var key=label.toLowerCase();if(!seen[key]){seen[key]=true;names.push(label);}});
    var reviewAt=names.findIndex(function(label){return label.toLowerCase()===REVIEW_WORKSPACE_CATEGORY.toLowerCase();});if(reviewAt>0)names.unshift(names.splice(reviewAt,1)[0]);return names;
  }
  function saveShelfCategoryOrder(order){var existing=shelfCategoryNames(),known={},saved=[];existing.forEach(function(label){known[label.toLowerCase()]=label;});(order||[]).forEach(function(label){var key=String(label||'').toLowerCase();if(known[key]&&saved.every(function(item){return item.toLowerCase()!==key;}))saved.push(known[key]);});existing.forEach(function(label){if(saved.every(function(item){return item.toLowerCase()!==label.toLowerCase();}))saved.push(label);});var reviewAt=saved.findIndex(function(label){return label.toLowerCase()===REVIEW_WORKSPACE_CATEGORY.toLowerCase();});if(reviewAt>0)saved.unshift(saved.splice(reviewAt,1)[0]);state.categoryOrder=saved;state.categoryOrderUpdatedAt=now();persist();}
  function placeShelfCategory(moving,target,after){var names=shelfCategoryNames(),from=names.findIndex(function(label){return label.toLowerCase()===String(moving||'').toLowerCase();});if(from<0)return false;var item=names.splice(from,1)[0],to=names.findIndex(function(label){return label.toLowerCase()===String(target||'').toLowerCase();});if(to<0){names.push(item);}else names.splice(to+(after?1:0),0,item);saveShelfCategoryOrder(names);return true;}
  function stepShelfCategory(label,delta){var names=shelfCategoryNames(),from=names.findIndex(function(name){return name.toLowerCase()===String(label||'').toLowerCase();}),to=from+delta;if(from<0||to<0||to>=names.length)return false;var swap=names[to];names[to]=names[from];names[from]=swap;saveShelfCategoryOrder(names);return true;}
  function paperHaystack(ch){ return [ch.title,ch.authors,shelfPaperCategory(ch),(ch.tags||[]).join(' '),ch.sourceName,ch.sourceUrl,(ch.reviewComments||[]).map(function(comment){return [comment.author,comment.text,comment.response].join(' ');}).join(' ')].join(' ').toLowerCase(); }
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
  var librarySelectionId=null,LIBRARY_SORT_KEY='readingRoom.librarySort',shelfPressUntil=0;
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
  function reviewWorkspaceStats(ch){
    var comments=ch&&Array.isArray(ch.reviewComments)?ch.reviewComments:[],levels={general:{total:0,open:0},section:{total:0,open:0},specific:{total:0,open:0},editorial:{total:0,open:0}},open=0;
    comments.forEach(function(comment){var level=normalizeReviewLevel(comment.level,comment);if(!levels[level])level='general';levels[level].total++;if(!comment.resolved){levels[level].open++;open++;}});return{total:comments.length,open:open,done:comments.length-open,levels:levels};
  }
  function reviewWorkspaceFiles(ch){
    var names=[],seen={};(ch&&ch.reviewReports||[]).forEach(function(report){var name=String(report&&report.name||'').trim(),key=name.toLowerCase();if(name&&!seen[key]){seen[key]=1;names.push(name);}});if(!names.length)(ch&&ch.reviewComments||[]).forEach(function(comment){var name=String(comment&&comment.sourceName||'').trim(),key=name.toLowerCase();if(name&&!seen[key]){seen[key]=1;names.push(name);}});return names;
  }
  function renderReviewWorkspaceCard(ch,isSelected){
    var stats=reviewWorkspaceStats(ch),files=reviewWorkspaceFiles(ch),levels=['general','section','specific','editorial'],card=document.createElement('article'),title=String(ch.title||'Untitled'),paperName=String(ch.sourceName||title),remaining=stats.total?(stats.open+' / '+stats.total+' remaining'):'Waiting for reviewer comments';
    card.className='review-workspace-card'+(isSelected?' is-selected':'');card.dataset.reviewWorkspacePaper=ch.id;
    card.innerHTML='<div class="review-workspace-card-head"><div><span class="review-workspace-eyebrow">Manuscript revision</span><h3>'+esc(title)+'</h3><p>'+esc(ch.authors||'')+'</p></div><strong class="review-workspace-remaining">'+esc(remaining)+'</strong></div><div class="review-workspace-pair"><span>Paper</span><b>'+esc(paperName)+'</b><span>Reviewer '+(files.length===1?'file':'files')+'</span><b>'+(files.length?files.map(esc).join('<br>'):'No reviewer file attached yet')+'</b></div><div class="review-workspace-scopes" aria-label="Review progress by scope">'+levels.map(function(level){var item=stats.levels[level],done=item.total-item.open,progress=item.total?Math.round(done/item.total*100):0;return'<div class="review-workspace-scope review-level-'+level+'"><div><span>'+esc(reviewLevelLabel(level))+'</span><b>'+item.open+' open · '+done+' done</b></div><span class="review-workspace-progress" aria-hidden="true"><i style="--review-progress:'+progress+'%"></i></span></div>';}).join('')+'</div><div class="review-workspace-footer"><span>'+esc(shelfDate(ch))+'</span><div class="review-workspace-footer-actions"><details class="review-workspace-manage"><summary class="soft-button review-workspace-manage-toggle">Manage</summary><div class="review-workspace-menu" role="menu"><button type="button" role="menuitem" data-review-workspace-replace>'+esc(stats.total?'Replace reviewer file…':'Add reviewer file…')+'</button>'+(stats.total?'<button type="button" role="menuitem" data-review-workspace-clear>Clear review comments</button>':'')+'<span class="review-workspace-menu-rule" aria-hidden="true"></span><button class="danger" type="button" role="menuitem" data-review-workspace-delete>Delete paper</button></div></details><button class="button review-workspace-continue" type="button">Continue review&nbsp; →</button></div></div>';
    card.querySelector('.review-workspace-continue').onclick=function(){openReader(ch.id).then(function(){switchTab('reviewsPanel');if(innerWidth>720)setNotebookCollapsed(false,true);});};
    card.querySelector('[data-review-workspace-replace]').onclick=function(){startReviewerFileReplacement(ch);};
    var clearButton=card.querySelector('[data-review-workspace-clear]');if(clearButton)clearButton.onclick=function(){clearReviewComments(ch);};
    card.querySelector('[data-review-workspace-delete]').onclick=function(){removePaper(ch,false);};return card;
  }
  document.addEventListener('click',function(event){document.querySelectorAll('.review-workspace-manage[open]').forEach(function(menu){if(!menu.contains(event.target))menu.removeAttribute('open');});});
  document.addEventListener('keydown',function(event){if(event.key!=='Escape')return;document.querySelectorAll('.review-workspace-manage[open]').forEach(function(menu){menu.removeAttribute('open');var toggle=menu.querySelector('summary');if(toggle)toggle.focus();});});
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
  function shelfThread(selectedIndex,total){
    var y=total<2?260:Math.round(58+(Math.min(selectedIndex,total-1)/(total-1))*404),path='M0 '+y+' C54 '+y+', 57 260, 176 260';
    return '<div class="reading-thread-bridge" aria-hidden="true"><svg class="reading-thread-svg" viewBox="0 0 180 520" preserveAspectRatio="none"><defs><linearGradient id="readingThreadGradient" x1="0" y1="0" x2="180" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:var(--muted);stop-opacity:.24"/><stop offset=".58" style="stop-color:#b89b50;stop-opacity:.62"/><stop offset="1" style="stop-color:var(--yellow)"/></linearGradient></defs><path class="thread-halo" d="'+path+'"/><path class="reading-thread" pathLength="1" d="'+path+'"/><circle class="thread-spark" cx="176" cy="260" r="5.5"/></svg></div>';
  }
  function renderOpenPaper(ch,stats,cover){
    var tags=(ch.tags||[]).slice(0,4),kind=ch.kind==='pdf'?'PDF paper':ch.sourceType==='docx'?'Word draft':'text note',source=ch.authors||ch.sourceName||'No authors yet',title=String(ch.title||'Untitled'),titleClass=title.length>118?' very-long':(title.length>72?' long':'');
    var progressLabel=ch.kind==='pdf'?(stats.total?'Page '+stats.page+' of '+stats.total:'Page '+stats.page):(stats.total+' paragraph'+(stats.total===1?'':'s'));
    var drive=binarySourceSpec(ch)?gdrivePaperStatus(ch):null,driveMarkup=drive?'<div class="cover-cloud '+drive.tone+'" id="paperDriveStatus" data-paper-id="'+esc(ch.id)+'" role="status" aria-label="'+esc(drive.label)+'"><span class="cover-cloud-dot" aria-hidden="true"></span><span class="cover-cloud-label">'+esc(drive.label)+'</span><span class="cover-cloud-track" aria-hidden="true"><i style="--cloud-progress:'+drive.progress+'%"></i></span></div>':'';
    var detail=document.createElement('div');detail.className='open-book-wrap';detail.id='selectedPaper';detail.setAttribute('aria-live','polite');
    var sourceSpec=binarySourceSpec(ch),downloadMarkup=sourceSpec?'<button class="soft-button download-paper" type="button" aria-label="Download original '+esc(sourceSpec.label)+' for '+esc(title)+'">↓ '+(ch.sourceType==='docx'?'Word':'PDF')+'</button>':'';
    detail.innerHTML='<span class="cover-focus-guide" aria-hidden="true"><span>Focus guide</span></span><article class="closed-book" aria-label="Selected paper: '+esc(title)+'">'+renderBookPunches(ch,false)+'<div class="closed-book-inner"><div class="closed-book-kicker">'+esc(kind)+' · field notebook</div><h3 class="closed-book-title'+titleClass+'">'+esc(title)+'</h3><p class="closed-book-byline">'+esc(source)+'</p><div class="tag-row paper-tags">'+(tags.length?tags.map(function(t){return '<span class="tag">'+esc(t)+'</span>';}).join(''):'<span class="tag">untagged</span>')+'</div>'+driveMarkup+'<div class="cover-record"><div class="cover-stat"><span>Marks</span><b>'+stats.notes+'</b></div><div class="cover-stat"><span>Questions</span><b>'+stats.questions+'</b></div><div class="cover-stat"><span>Last opened</span><b>'+esc(shelfDate(ch).replace(/^Touched /,''))+'</b></div></div><div class="cover-progress"><div><span>Reading trail</span><span>'+esc(progressLabel)+'</span></div><div class="cover-progress-track"><i style="--paper-progress:'+stats.progress+'%"></i></div></div><div class="cover-actions"><button class="button open-selected" type="button">Continue reading&nbsp; →</button>'+downloadMarkup+'<button class="soft-button remove-paper" type="button" aria-label="Remove '+esc(title)+' from library">Remove</button></div></div></article>';
    var closed=detail.querySelector('.closed-book'),palette=cover||BOOK_SPINES[0];closed.style.setProperty('--cover',palette.cover);closed.style.setProperty('--cover-ink',palette.ink);
    detail.querySelector('.open-selected').onclick=function(){openReader(ch.id);};
    var downloadButton=detail.querySelector('.download-paper');if(downloadButton)downloadButton.onclick=function(){downloadOriginalFile(ch,downloadButton);};
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
    document.body.classList.toggle('library-ready',!libraryHydrating);
    var q=byId('librarySearch').value.trim().toLowerCase();
    var list=state.chapters.filter(function(ch){return !q||paperHaystack(ch).includes(q);}).sort(compareShelfPapers);
    byId('libraryCount').textContent=(q?list.length+' of ':'')+state.chapters.length+(state.chapters.length===1?' paper':' papers');renderDuplicateNotice();
    var shelf=byId('shelf');shelf.innerHTML='';
    if(!list.length){
      if(libraryHydrating){shelf.innerHTML='<div class="shelf-loading" role="status" aria-live="polite"><span class="shelf-loading-mark" aria-hidden="true"></span><div><b>Opening your library</b><span>Restoring papers and review work…</span></div></div>';return;}
      shelf.innerHTML='<div class="shelf-empty"><div><b>'+(state.chapters.length?'No paper found':'Start with a paper')+'</b>'+(state.chapters.length?'Try another title, author, or tag.':'Add a PDF or Word draft, or bring a manuscript and its reviewer comments together.')+'</div></div>';return;
    }
    if(!librarySelectionId||!list.some(function(ch){return ch.id===librarySelectionId;}))librarySelectionId=list[0].id;
    var selected=list.find(function(ch){return ch.id===librarySelectionId;})||list[0],stats=shelfPaperStats(selected),selectedCategory=shelfPaperCategory(selected).toLowerCase(),reviewWorkspaceOpen=selectedCategory===REVIEW_WORKSPACE_CATEGORY.toLowerCase();
    shelf.classList.toggle('review-workspace-open',reviewWorkspaceOpen);var caseEl=document.createElement('section');caseEl.className='bookcase'+(reviewWorkspaceOpen?' review-bookcase':'');caseEl.setAttribute('aria-label',reviewWorkspaceOpen?'In review workspace':'Reading wall');caseEl.innerHTML='<div class="pile-head"><strong>'+(reviewWorkspaceOpen?'Revision workspace':'Reading wall')+'</strong><button class="paper-category-add'+(reviewWorkspaceOpen?' hidden':'')+'" id="newCategoryBtn" type="button" title="Create a category from the selected paper">＋ Category</button></div>';
    function closeCategoryMenus(){caseEl.querySelectorAll('.paper-sticky-wrap.is-menu-open').forEach(function(wrap){wrap.classList.remove('is-menu-open','menu-above');var menu=wrap.querySelector('.paper-category-menu'),button=wrap.querySelector('.paper-category-move');if(menu)menu.hidden=true;if(button)button.setAttribute('aria-expanded','false');});}
    var categoryRail=document.createElement('nav');categoryRail.className='paper-category-rail';categoryRail.setAttribute('aria-label','Paper categories');
    var noteSurface=document.createElement('div');noteSurface.className='paper-note-surface';
    var pile=document.createElement('div');pile.className='book-pile';
    var categoryMenuIndex=0,draggingCategory='',draggingPaperId='';
    /* On glass the click-to-preview step reads as a broken button — a tap means open.
       Preview becomes a long-press instead: holding a sticky selects it for the card
       below and unfolds its Move menu, the touch twin of resting a mouse on it. */
    var tapOpens=matchMedia('(hover: none) and (pointer: coarse)').matches;
    function peekShelfPaper(id){
      var oldTop=pile.scrollTop,oldLeft=pile.scrollLeft;librarySelectionId=id;renderShelf();
      var nextPile=byId('shelf').querySelector('.book-pile');if(nextPile){nextPile.scrollTop=oldTop;nextPile.scrollLeft=oldLeft;}
      var newBook=byId('shelf').querySelector('[data-shelf-paper="'+id+'"]'),wrap=newBook&&newBook.closest('.paper-sticky-wrap'),moveBtn=wrap&&wrap.querySelector('.paper-category-move');
      if(moveBtn)moveBtn.click();
    }
    var grouped=[],groupMap={};list.forEach(function(ch){var label=shelfPaperCategory(ch),key=label.toLowerCase();if(!groupMap[key]){groupMap[key]={label:label,papers:[]};grouped.push(groupMap[key]);}groupMap[key].papers.push(ch);});
    var categoryRanks={};shelfCategoryNames().forEach(function(label,index){categoryRanks[label.toLowerCase()]=index;});grouped.sort(function(a,b){var rankA=categoryRanks[a.label.toLowerCase()],rankB=categoryRanks[b.label.toLowerCase()];return(rankA===undefined?Number.MAX_SAFE_INTEGER:rankA)-(rankB===undefined?Number.MAX_SAFE_INTEGER:rankB);});
    function clearShelfDrag(){categoryRail.querySelectorAll('.paper-category-tab').forEach(function(tab){tab.classList.remove('is-dragging','drop-before','drop-after','paper-drop-target');});caseEl.querySelectorAll('.paper-sticky-wrap.is-paper-dragging').forEach(function(wrap){wrap.classList.remove('is-paper-dragging');});draggingCategory='';draggingPaperId='';}
    function focusCategoryGrip(label){setTimeout(function(){var tab=Array.prototype.find.call(categoryRail.querySelectorAll('.paper-category-tab'),function(item){return item.dataset.categoryName===label;});if(tab){var grip=tab.querySelector('.paper-category-grip');if(grip)grip.focus();}},0);}
    categoryRail.ondragover=function(e){if(!draggingCategory&&!draggingPaperId)return;var rect=categoryRail.getBoundingClientRect();if(e.clientX<rect.left+34)categoryRail.scrollLeft-=14;else if(e.clientX>rect.right-34)categoryRail.scrollLeft+=14;};
    grouped.forEach(function(group,groupIndex){
      var categoryTab=document.createElement('div'),categoryGrip=document.createElement('span'),categoryOpen=document.createElement('button'),categoryEdit=document.createElement('button'),categoryReorder=document.createElement('span'),categoryPrev=document.createElement('button'),categoryNext=document.createElement('button'),noteGrid=document.createElement('div'),isOpen=group.label.toLowerCase()===selectedCategory,isReviewCategory=group.label.toLowerCase()===REVIEW_WORKSPACE_CATEGORY.toLowerCase();
      categoryTab.className='paper-category-tab'+(isOpen?' is-selected':'')+(isReviewCategory?' is-review-workspace':'');categoryTab.dataset.categoryName=group.label;categoryTab.setAttribute('aria-label',group.label+' papers'+(isReviewCategory?', pinned workspace':''));
      categoryGrip.className='paper-category-grip';categoryGrip.textContent='⠿';categoryGrip.title='Drag to reorder '+group.label;categoryGrip.setAttribute('aria-label','Drag to reorder category '+group.label);categoryGrip.setAttribute('role','button');categoryGrip.tabIndex=0;categoryGrip.draggable=true;
      categoryGrip.ondragstart=function(e){draggingCategory=group.label;categoryTab.classList.add('is-dragging');if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',group.label);}};categoryGrip.ondragend=clearShelfDrag;
      categoryGrip.onkeydown=function(e){var delta=e.key==='ArrowLeft'?-1:(e.key==='ArrowRight'?1:0);if(!delta)return;e.preventDefault();if(stepShelfCategory(group.label,delta)){renderShelf();focusCategoryGrip(group.label);}};
      categoryTab.ondragover=function(e){if(draggingPaperId){e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';categoryTab.classList.add('paper-drop-target');categoryTab.classList.remove('drop-before','drop-after');return;}if(!draggingCategory||draggingCategory.toLowerCase()===group.label.toLowerCase())return;e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';var rect=categoryTab.getBoundingClientRect(),after=e.clientX>rect.left+rect.width/2;categoryTab.classList.toggle('drop-before',!after);categoryTab.classList.toggle('drop-after',after);};
      categoryTab.ondragleave=function(e){if(!categoryTab.contains(e.relatedTarget))categoryTab.classList.remove('drop-before','drop-after','paper-drop-target');};
      categoryTab.ondrop=function(e){e.preventDefault();if(draggingPaperId){var paper=find(draggingPaperId),needsMove=paper&&shelfPaperCategory(paper).toLowerCase()!==group.label.toLowerCase();if(paper)librarySelectionId=paper.id;if(needsMove){setShelfPaperCategory(paper,group.label);persist();}clearShelfDrag();if(paper)renderShelf();return;}var moving=draggingCategory||(e.dataTransfer&&e.dataTransfer.getData('text/plain')),rect=categoryTab.getBoundingClientRect(),after=e.clientX>rect.left+rect.width/2;clearShelfDrag();if(moving&&placeShelfCategory(moving,group.label,after))renderShelf();};
      categoryOpen.type='button';categoryOpen.className='paper-category-open';categoryOpen.setAttribute('aria-pressed',isOpen?'true':'false');categoryOpen.innerHTML='<span class="paper-category-mark">'+esc(group.label)+'</span><span class="paper-category-count">'+group.papers.length+'</span>'+(isReviewCategory?'<span class="paper-category-pin">Pinned</span>':'');categoryOpen.onclick=function(){if(!isOpen){librarySelectionId=group.papers[0].id;renderShelf();}};
      categoryEdit.type='button';categoryEdit.className='paper-category-edit';categoryEdit.textContent='✎';categoryEdit.title='Rename '+group.label;categoryEdit.setAttribute('aria-label','Rename category '+group.label);categoryEdit.onclick=function(){var answer=prompt('Rename category “'+group.label+'”',group.label);if(answer===null)return;var next=categoryLabel(answer),stamp=now(),orderBefore=shelfCategoryNames(),seenOrder={};state.chapters.forEach(function(ch){if(shelfPaperCategory(ch).toLowerCase()===group.label.toLowerCase()){setShelfPaperCategory(ch,next);ch.updatedAt=stamp;}});state.categoryOrder=orderBefore.map(function(label){return label.toLowerCase()===group.label.toLowerCase()?next:label;}).filter(function(label){var key=label.toLowerCase();if(seenOrder[key])return false;seenOrder[key]=true;return true;});state.categoryOrderUpdatedAt=stamp;persist();renderShelf();};
      categoryReorder.className='paper-category-reorder';categoryPrev.type='button';categoryPrev.className='paper-category-step prev';categoryPrev.textContent='‹';categoryPrev.disabled=groupIndex===0;categoryPrev.setAttribute('aria-label','Move category '+group.label+' left');categoryPrev.onclick=function(e){e.stopPropagation();if(stepShelfCategory(group.label,-1)){renderShelf();focusCategoryGrip(group.label);}};categoryNext.type='button';categoryNext.className='paper-category-step next';categoryNext.textContent='›';categoryNext.disabled=groupIndex===grouped.length-1;categoryNext.setAttribute('aria-label','Move category '+group.label+' right');categoryNext.onclick=function(e){e.stopPropagation();if(stepShelfCategory(group.label,1)){renderShelf();focusCategoryGrip(group.label);}};categoryReorder.appendChild(categoryPrev);categoryReorder.appendChild(categoryNext);
      if(!isReviewCategory)categoryTab.appendChild(categoryGrip);categoryTab.appendChild(categoryOpen);if(!isReviewCategory){categoryTab.appendChild(categoryEdit);categoryTab.appendChild(categoryReorder);}categoryRail.appendChild(categoryTab);
      if(!isOpen)return;
      if(isReviewCategory){noteSurface.setAttribute('aria-label','Manuscripts in review');noteSurface.classList.add('review-workspace-surface');var reviewList=document.createElement('div');reviewList.className='review-workspace-list';group.papers.forEach(function(ch){reviewList.appendChild(renderReviewWorkspaceCard(ch,ch.id===selected.id));});pile.appendChild(reviewList);return;}
      noteSurface.setAttribute('aria-label',group.label+' category');noteGrid.className='category-note-grid';
      group.papers.forEach(function(ch){
        var wrap=document.createElement('div'),book=document.createElement('button'),paperGrip=document.createElement('span'),move=document.createElement('button'),menu=document.createElement('div'),categorySearch=document.createElement('input'),categoryOptions=document.createElement('div'),isSelected=ch.id===selected.id,visualHash=paperVisualHash(ch),spine=WALL_NOTES[(visualHash>>>1)%WALL_NOTES.length],menuId='paper-category-menu-'+(++categoryMenuIndex);
        wrap.className='paper-sticky-wrap';book.type='button';book.className='book-spine paper-sticky-note'+(isSelected?' is-selected':'');book.dataset.shelfPaper=ch.id;book.setAttribute('aria-pressed',isSelected?'true':'false');book.setAttribute('aria-label',(isSelected||tapOpens?'Open paper: ':'Preview paper: ')+(ch.title||'Untitled'));
        var spineTitle=String(ch.title||'Untitled'),spineCredit=shelfSpineCredit(ch),spineLength=spineTitle.length,noteFont=spineLength>112?'.98rem':(spineLength>82?'1.02rem':(spineLength>54?'1.08rem':'1.18rem'));
        book.title=spineTitle+' — '+(ch.authors||ch.sourceName||'Phloem');book.style.setProperty('--note-font',noteFont);book.style.setProperty('--note-paper',spine.cover);book.style.setProperty('--note-ink',spine.ink);book.style.setProperty('--note-tilt',((((visualHash>>>20)%9)-4)*.18)+'deg');book.style.setProperty('--tape-tilt',((((visualHash>>>27)%11)-5)*.45)+'deg');
        book.innerHTML='<span class="book-title'+(hasHanScript(spineTitle)?' is-han':'')+'">'+esc(spineTitle)+'</span><span class="book-author'+(hasHanScript(spineCredit)?' is-han':'')+'">'+esc(spineCredit)+'</span>';
        book.onclick=function(e){if(Date.now()<shelfPressUntil)return;if(ch.id===librarySelectionId||tapOpens){librarySelectionId=ch.id;openReader(ch.id);return;}var oldTop=pile.scrollTop,oldLeft=pile.scrollLeft,fromKeyboard=e.detail===0;librarySelectionId=ch.id;renderShelf();var nextPile=byId('shelf').querySelector('.book-pile');if(nextPile){nextPile.scrollTop=oldTop;nextPile.scrollLeft=oldLeft;}if(fromKeyboard)setTimeout(function(){focusShelfBook(ch.id);},0);};
        if(tapOpens){
          var pressTimer=0,pressX=0,pressY=0;
          var clearPress=function(){if(pressTimer){clearTimeout(pressTimer);pressTimer=0;}};
          book.addEventListener('pointerdown',function(e){if(e.pointerType==='mouse')return;pressX=e.clientX;pressY=e.clientY;clearPress();pressTimer=setTimeout(function(){pressTimer=0;shelfPressUntil=Date.now()+700;peekShelfPaper(ch.id);},480);});
          book.addEventListener('pointermove',function(e){if(pressTimer&&(Math.abs(e.clientX-pressX)>9||Math.abs(e.clientY-pressY)>9))clearPress();});
          book.addEventListener('pointerup',clearPress);
          book.addEventListener('pointercancel',clearPress);
          book.addEventListener('contextmenu',function(e){e.preventDefault();});
        }
        paperGrip.className='paper-sticky-grip';paperGrip.textContent='⠿';paperGrip.title='Drag this paper to a category';paperGrip.setAttribute('aria-label','Drag '+spineTitle+' to a category');paperGrip.setAttribute('role','button');paperGrip.tabIndex=0;paperGrip.draggable=true;paperGrip.ondragstart=function(e){draggingPaperId=ch.id;wrap.classList.add('is-paper-dragging');if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',ch.id);}};paperGrip.ondragend=clearShelfDrag;
        move.type='button';move.className='paper-category-move';move.textContent='↗ Move';move.title='Move to another category';move.setAttribute('aria-label','Move '+spineTitle+' to another category');move.setAttribute('aria-controls',menuId);move.setAttribute('aria-expanded','false');
        menu.id=menuId;menu.className='paper-category-menu';menu.hidden=true;menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Move to category');menu.innerHTML='<span class="paper-category-menu-label">Move to</span>';
        categorySearch.type='search';categorySearch.className='paper-category-search';categorySearch.placeholder='Find category…';categorySearch.setAttribute('aria-label','Find category');categoryOptions.className='paper-category-options';
        var otherCategories=shelfCategoryNames().filter(function(name){return name.toLowerCase()!==shelfPaperCategory(ch).toLowerCase();});
        var empty=document.createElement('span');empty.className='paper-category-menu-empty';empty.textContent=otherCategories.length?'No matching category':'No other categories yet';empty.hidden=!!otherCategories.length;
        otherCategories.forEach(function(name){var choice=document.createElement('button');choice.type='button';choice.className='paper-category-choice';choice.textContent=name;choice.dataset.categorySearch=name.toLowerCase();choice.onclick=function(e){e.stopPropagation();setShelfPaperCategory(ch,name);persist();renderShelf();};categoryOptions.appendChild(choice);});
        categoryOptions.appendChild(empty);categorySearch.hidden=!otherCategories.length;categorySearch.oninput=function(){var query=this.value.trim().toLowerCase(),shown=0;categoryOptions.querySelectorAll('.paper-category-choice').forEach(function(choice){var matches=!query||choice.dataset.categorySearch.indexOf(query)>=0;choice.hidden=!matches;if(matches)shown++;});empty.hidden=shown>0;empty.textContent=shown?'':'No matching category';};menu.appendChild(categorySearch);menu.appendChild(categoryOptions);
        var makeCategory=document.createElement('button');makeCategory.type='button';makeCategory.className='paper-category-choice is-new';makeCategory.textContent='＋ New category…';makeCategory.onclick=function(e){e.stopPropagation();var answer=prompt('New category name','');if(answer===null||!String(answer).trim())return;setShelfPaperCategory(ch,answer);persist();renderShelf();};menu.appendChild(makeCategory);
        menu.onclick=function(e){e.stopPropagation();};menu.onkeydown=function(e){if(e.key==='Escape'){closeCategoryMenus();move.focus();}};
        move.onclick=function(e){e.stopPropagation();var shouldOpen=menu.hidden;closeCategoryMenus();if(shouldOpen){menu.hidden=false;wrap.classList.add('is-menu-open');move.setAttribute('aria-expanded','true');var surfaceBox=noteSurface.getBoundingClientRect(),wrapBox=wrap.getBoundingClientRect();if(wrapBox.top+menu.offsetHeight+42>surfaceBox.bottom&&wrapBox.top-menu.offsetHeight>surfaceBox.top)wrap.classList.add('menu-above');if(!tapOpens)setTimeout(function(){(otherCategories.length?categorySearch:makeCategory).focus();},0);}};paperGrip.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();move.click();}};
        wrap.appendChild(book);wrap.appendChild(paperGrip);wrap.appendChild(move);wrap.appendChild(menu);noteGrid.appendChild(wrap);
      });
      pile.appendChild(noteGrid);
    });
    caseEl.onclick=function(e){if(Date.now()<shelfPressUntil)return;if(!e.target.closest('.paper-category-menu')&&!e.target.closest('.paper-category-move'))closeCategoryMenus();};
    caseEl.querySelector('#newCategoryBtn').onclick=function(){var answer=prompt('Create a category from the selected paper.',shelfPaperCategory(selected)==='Unsorted'?'':shelfPaperCategory(selected));if(answer===null||!String(answer).trim())return;setShelfPaperCategory(selected,answer);persist();renderShelf();};
    noteSurface.appendChild(pile);caseEl.appendChild(categoryRail);caseEl.appendChild(noteSurface);shelf.appendChild(caseEl);if(!reviewWorkspaceOpen)shelf.appendChild(renderOpenPaper(selected,stats,BOOK_SPINES[paperVisualHash(selected)%BOOK_SPINES.length]));
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
  var REVIEW_STEPS=[1,3,7,14,30,60], reviewQueue=[], reviewIndex=0, reviewPageMode='reviewers';
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
    var open=state.chapters.reduce(function(total,ch){return total+(ch.reviewComments||[]).filter(function(comment){return !comment.resolved;}).length;},0);
    document.querySelectorAll('[data-view="reviewPage"]').forEach(function(b){b.textContent=open?'Review · '+open:'Review';});
  }
  function reviewerReviewItems(){var items=[];state.chapters.forEach(function(ch){(ch.reviewComments||[]).forEach(function(comment){items.push({ch:ch,comment:comment});});});return items.sort(function(a,b){return Number(a.comment.resolved)-Number(b.comment.resolved)||(+b.ch.updatedAt||0)-(+a.ch.updatedAt||0);});}
  function setReviewPageMode(mode){
    reviewPageMode=mode;var reviewers=mode==='reviewers';byId('reviewerModeBtn').classList.toggle('active',reviewers);byId('reviewerModeBtn').setAttribute('aria-selected',String(reviewers));byId('memoryModeBtn').classList.toggle('active',!reviewers);byId('memoryModeBtn').setAttribute('aria-selected',String(!reviewers));byId('reviewerDesk').classList.toggle('hidden',!reviewers);byId('memoryReview').classList.toggle('hidden',reviewers);if(reviewers)renderReviewerInbox();else showReviewCard();
  }
  function renderReviewerInbox(){
    var box=byId('reviewerDesk'),items=reviewerReviewItems(),open=items.filter(function(item){return !item.comment.resolved;}).length;byId('reviewCount').textContent=items.length?(open+' open · '+items.length+' total'):'';byId('reviewerCount').textContent=items.length?'· '+open:'';
    if(!items.length){box.innerHTML='<div class="empty">No reviewer comments yet. Add a commented Word draft, or attach a comment-only reviewer file to a manuscript.</div>';return;}
    box.innerHTML='<div class="reviewer-inbox">'+items.map(function(item){var comment=item.comment;return '<article class="reviewer-inbox-card'+(comment.resolved?' resolved':'')+'"><span class="review-eyebrow">'+esc(comment.author||'Reviewer')+' · '+esc(item.ch.title||'Untitled')+'</span><div class="reviewer-classification"><span class="reviewer-chip level">'+esc(reviewLevelLabel(comment.level))+'</span><span class="reviewer-chip">'+esc(reviewTopicLabel(comment.topic))+'</span></div><p>'+esc(comment.text||'')+'</p>'+(comment.quote&&comment.anchored?'<blockquote>'+esc(comment.quote)+'</blockquote>':'')+'<button class="text-button" type="button" data-open-review-paper="'+esc(item.ch.id)+'" data-open-review-comment="'+esc(comment.id)+'">Open beside draft →</button></article>';}).join('')+'</div>';
    box.querySelectorAll('[data-open-review-paper]').forEach(function(button){button.onclick=function(){var chapterId=button.dataset.openReviewPaper,commentId=button.dataset.openReviewComment;openReader(chapterId).then(function(){showReviewerComment(find(chapterId),commentId);});};});
  }
  function renderReview(){
    reviewQueue=dueReviewList().slice(0,20);reviewIndex=0;updateReviewBadge();var hasReviewers=reviewerReviewItems().length;if(!hasReviewers&&reviewPageMode==='reviewers')reviewPageMode='memory';setReviewPageMode(reviewPageMode);
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
  byId('reviewerModeBtn').onclick=function(){setReviewPageMode('reviewers');};
  byId('memoryModeBtn').onclick=function(){setReviewPageMode('memory');};
  function closeAddDialog(){if(byId('addDialog').open)byId('addDialog').close();}
  function resetReviewImport(){
    reviewPairPaper=null;reviewPairComments=null;byId('reviewPaperFile').value='';byId('reviewCommentsFile').value='';byId('reviewCombinedFile').value='';byId('reviewPaperName').textContent='PDF or Word document';byId('reviewCommentsName').textContent='Word or text document';byId('reviewPairImportBtn').disabled=true;byId('reviewPairFields').classList.add('hidden');byId('reviewPairModeBtn').setAttribute('aria-expanded','false');byId('reviewImportStatus').textContent='';setTaskProgress('reviewImportProgress',false);
  }
  byId('importPdfBtn').onclick = function(){byId('addDialog').showModal();};
  byId('addDeviceBtn').onclick = function(){ if(location.protocol==='file:'){ closeAddDialog();byId('launchDialog').showModal(); return; } closeAddDialog();byId('pdfFile').click(); };
  byId('addReviewBtn').onclick = function(){closeAddDialog();resetReviewImport();byId('reviewImportDialog').showModal();};
  byId('reviewCombinedBtn').onclick=function(){byId('reviewCombinedFile').click();};
  byId('reviewCombinedFile').onchange=async function(){
    var file=this.files&&this.files[0],button=byId('reviewCombinedBtn'),status=byId('reviewImportStatus');this.value='';if(!file)return;var old=button.innerHTML,stamp=now();button.disabled=true;status.textContent='Checking the Word comments…';setTaskProgress('reviewImportProgress',10);
    try{var bytes=await file.arrayBuffer();setTaskProgress('reviewImportProgress',35);var parsed=await parseDocx(bytes,file.name);if(!parsed.comments.length){status.textContent='No Word comments were found in that file. If the feedback is separate, use the 2-file option.';setTaskProgress('reviewImportProgress',false);return;}setTaskProgress('reviewImportProgress',65);if(await importDocx(file,button,false,bytes)){var target=state.chapters.filter(function(ch){return ch.sourceName===file.name&&ch.updatedAt>=stamp-1000;}).sort(function(a,b){return (+b.updatedAt||0)-(+a.updatedAt||0);})[0];if(target){placeInReviewWorkspace(target);touch(target);renderShelf();}}setTaskProgress('reviewImportProgress',100);byId('reviewImportDialog').close();}
    catch(e){status.textContent=e.message||'Phloem could not read that commented manuscript.';setTaskProgress('reviewImportProgress',false);}
    finally{button.disabled=false;button.innerHTML=old;}
  };
  byId('reviewPairModeBtn').onclick=function(){var fields=byId('reviewPairFields'),open=fields.classList.contains('hidden');fields.classList.toggle('hidden',!open);this.setAttribute('aria-expanded',String(open));if(open)byId('reviewPaperPick').focus();};
  byId('reviewPaperPick').onclick=function(){byId('reviewPaperFile').click();};
  byId('reviewCommentsPick').onclick=function(){byId('reviewCommentsFile').click();};
  function updateReviewPairReady(){byId('reviewPairImportBtn').disabled=!(reviewPairPaper&&reviewPairComments);}
  byId('reviewPaperFile').onchange=function(){reviewPairPaper=this.files&&this.files[0]||null;byId('reviewPaperName').textContent=reviewPairPaper?reviewPairPaper.name:'PDF or Word document';updateReviewPairReady();};
  byId('reviewCommentsFile').onchange=function(){reviewPairComments=this.files&&this.files[0]||null;byId('reviewCommentsName').textContent=reviewPairComments?reviewPairComments.name:'Word or text document';updateReviewPairReady();};
  byId('reviewPairImportBtn').onclick=async function(){
    var paper=reviewPairPaper,comments=reviewPairComments,button=this,status=byId('reviewImportStatus');if(!paper||!comments)return;if(!hasAiRoute()){status.textContent='Set up the built-in or a cloud AI in Desk settings first so Phloem can locate the separate comments.';return;}var stamp=now();button.disabled=true;status.textContent='Importing the manuscript…';setTaskProgress('reviewImportProgress',5);
    try{var added=await importSourceFile(paper,null,null,button,true);if(!added)throw new Error('The manuscript could not be imported.');setTaskProgress('reviewImportProgress',70);var target=state.chapters.filter(function(ch){return ch.sourceName===paper.name&&ch.updatedAt>=stamp-1000;}).sort(function(a,b){return (+b.updatedAt||0)-(+a.updatedAt||0);})[0];if(!target)throw new Error('Phloem could not identify the imported manuscript.');placeInReviewWorkspace(target);touch(target);renderShelf();setTaskProgress('reviewImportProgress',100);byId('reviewImportDialog').close();await openReader(target.id);switchTab('reviewsPanel');if(innerWidth>720)setNotebookCollapsed(false,true);await importReviewerFile(target,comments,button);}
    catch(e){status.textContent=e.message||'Phloem could not import that review package.';setTaskProgress('reviewImportProgress',false);}
    finally{button.disabled=false;button.textContent='Import paper & comments';}
  };
  byId('pdfFile').onchange = function(){ var files=Array.prototype.slice.call(this.files||[]); this.value=''; if(files.length)importDropped([],files); };
  byId('folderPickBtn').onclick = function(){ if(location.protocol==='file:'){ closeAddDialog();byId('launchDialog').showModal(); return; } closeAddDialog();byId('pdfFolder').click(); };
  byId('pdfFolder').onchange = function(){ var files=Array.prototype.slice.call(this.files||[]); this.value=''; if(files.length)importDropped([],files); };
  if(!('webkitdirectory' in byId('pdfFolder')))byId('folderPickBtn').classList.add('hidden');
  byId('linkImportBtn').onclick=function(){
    closeAddDialog();byId('pdfUrlStatus').textContent='';byId('linkDialog').showModal();setTimeout(function(){byId('pdfUrl').focus();},0);
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
     PDFs and Word drafts, and import them one by one with a running count. */
  var DROP_FILE_CAP=40;
  function supportedDocument(file){return !!file&&(file.type==='application/pdf'||file.type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'||/\.(?:pdf|docx)$/i.test(file.name||''));}
  function entryFile(entry){return new Promise(function(res,rej){entry.file(res,rej);});}
  function readAllEntries(reader){return new Promise(function(res,rej){var all=[];(function next(){reader.readEntries(function(batch){if(!batch.length)return res(all);all=all.concat(batch);next();},rej);})();});}
  async function collectDocumentEntries(entry,found,depth){
    if(found.length>=DROP_FILE_CAP||depth>6)return;
    if(entry.isFile){if(/\.(?:pdf|docx)$/i.test(entry.name))found.push(entry);return;}
    if(entry.isDirectory){
      try{var children=await readAllEntries(entry.createReader());}catch(e){return;}
      for(var i=0;i<children.length&&found.length<DROP_FILE_CAP;i++)await collectDocumentEntries(children[i],found,depth+1);
    }
  }
  async function importDropped(entries,files){
    var status=byId('libraryImportStatus'),documents=[];
    try{
      if(entries.length){
        var found=[];status.textContent='Looking through the drop…';
        for(var i=0;i<entries.length;i++)await collectDocumentEntries(entries[i],found,0);
        for(var j=0;j<found.length;j++){try{documents.push(await entryFile(found[j]));}catch(e){}}
      }else{
        documents=files.filter(supportedDocument);
        if(documents.length>DROP_FILE_CAP){status.textContent='Importing the first '+DROP_FILE_CAP+' of '+documents.length+' documents…';documents=documents.slice(0,DROP_FILE_CAP);}
      }
    }catch(e){}
    if(!documents.length){status.textContent='No supported documents there — add a PDF or a Word .docx draft.';return;}
    if(documents.length===1){status.textContent='';importSourceFile(documents[0]);return;}
    var ok=0;
    for(var k=0;k<documents.length;k++){
      status.textContent='Importing '+(k+1)+' / '+documents.length+' · '+documents[k].name;
      try{if(await importSourceFile(documents[k],null,null,null,true))ok++;}catch(e){}
    }
    status.textContent='Imported '+ok+' of '+documents.length+' documents.';
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
        /* Superscript affiliation numbers share a visual line with the author names.
           Compare against both runs' heights so those smaller, raised glyphs do not
           split a single author credit into several fake lines. */
        if(line&&Math.abs(y-line.y)>Math.max(2,height*.55,line.height*.55))finish();
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
  /* Two-column pages read left column first, then right — like a human. Bands are the
     unit of that ordering, and a new band starts at a full-width line (title, banner)
     OR at horizontal whitespace that crosses the whole page — the void left by a
     figure, or the rule under a two-column caption. Captions in journals are often set
     as two short columns of their own right below the figure: without the whitespace
     split they pooled into the body's columns and spliced mid-sentence into the text
     ("…while performing the / adding physical–chemical constraints…"). Lines are
     y-sorted first, so a gap between consecutive sorted lines only exists where
     NEITHER column has ink — one column's own paragraph spacing never splits a band
     because the other column's lines fill the sequence. */
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
    var medH=layoutMedian(lines.map(function(l){return l.height;}))||10;
    function isFull(l){return l.endX-l.x>=pageW*.58;}
    var sorted=lines.slice().sort(function(a,b){return b.y-a.y||a.x-b.x;});
    var bands=[],band=[];
    sorted.forEach(function(l){
      if(band.length){
        var prev=band[band.length-1];
        if(prev.y-l.y>medH*2.1||isFull(l)!==isFull(prev)){bands.push(band);band=[];}
      }
      band.push(l);
    });
    if(band.length)bands.push(band);
    var out=[];
    bands.forEach(function(b){
      var bl=[],br=[];
      b.forEach(function(l){if(l.x+(l.endX-l.x)/2<mid)bl.push(l);else br.push(l);});
      if(b.length<3||!bl.length||!br.length||b.some(isFull)){out.push.apply(out,b);return;}
      out.push.apply(out,bl);out.push.apply(out,br);
    });
    return out;
  }
  /* Display equations cannot reflow: a matrix becomes bracket shards ("⌐ ⌐", "| |")
     and rows of lone symbols. Detect clusters of math-shaped lines, lift each cluster
     out of the text flow, and hand its page region to the figure pipeline so the
     reader sees the equation exactly as typeset. */
  function mathLineKind(l){
    var t=l.text;
    if(/^[\s⎡⎢⎣⎤⎥⎦⎧⎨⎩⎫⎬⎭⎛⎜⎝⎞⎟⎠\[\]|⌐¬⌜⌝⌞⌟─━│┃┌┐└┘(){}.,·]+$/.test(t))return 'piece';
    var tokens=t.split(/\s+/).filter(Boolean);
    if(!tokens.length)return '';
    var shorty=tokens.filter(function(w){return w.length<=2||/^[\d.,()+-]+$/.test(w);}).length;
    var hard=/[=→←↦≥≤≈≠∑∏∫∂∇±×÷∈∀∃⊤⊥ωαβγδλμσθφψπΩΔΣΓΛΘΦ]/.test(t);
    if(tokens.length>=4&&shorty>=tokens.length*.6)return hard?'hardrow':'row';
    if(hard&&tokens.length<=12&&shorty>=tokens.length*.3)return 'hardrow';
    return '';
  }
  function extractMathRegions(layout,body){
    if(layout.length<3)return layout;
    var flagged=layout.map(mathLineKind);
    if(!flagged.some(function(k){return k;}))return layout;
    var order=layout.map(function(l,i){return i;}).sort(function(a,b){return layout[b].y-layout[a].y;});
    var clusters=[],cur=null,lastY=0;
    order.forEach(function(i){
      if(!flagged[i]){return;}
      if(cur&&lastY-layout[i].y<=body*4.5)cur.push(i);
      else{cur=[i];clusters.push(cur);}
      lastY=layout[i].y;
    });
    var regionAt={},squash={};
    clusters.forEach(function(cluster){
      var pieces=cluster.filter(function(i){return flagged[i]==='piece';}).length;
      var hard=cluster.some(function(i){return flagged[i]==='hardrow';});
      /* An author line or a stray numeric row must not become an image: a real
         equation shows bracket pieces, or explicit operators, or sheer bulk. */
      if(!(pieces>=2||(hard&&cluster.length>=2)||cluster.length>=4))return;
      var left=1e9,right=0,top=0,bottom=1e9,text=[];
      cluster.sort(function(a,b){return layout[b].y-layout[a].y;}).forEach(function(i){
        var l=layout[i];
        left=Math.min(left,l.x);right=Math.max(right,l.endX);
        top=Math.max(top,l.y+l.height);bottom=Math.min(bottom,l.y-l.height*.4);
        text.push(l.text);
      });
      var key=clusters.indexOf(cluster);
      cluster.forEach(function(i){regionAt[i]=key;});
      squash[key]={text:text.join(' ').replace(/\s+/g,' ').slice(0,160),x:left,y:top,endX:right,height:body,runs:[],eq:[left,bottom,right,top]};
    });
    var out=[],emitted={};
    layout.forEach(function(l,i){
      var key=regionAt[i];
      if(key===undefined){out.push(l);return;}
      if(!emitted[key]&&squash[key]){emitted[key]=true;out.push(squash[key]);}
    });
    return out;
  }
  /* Paragraph objects: {t:text, k:kind(''|h1|h2|h3|cap|eq), r:[[start,end,flags]...]}
     with run offsets valid inside t. Kind comes from font size against the body size
     when known, with the old shape-regex as the fallback. An eq paragraph carries its
     page box in eb until buildFigures swaps it for a rendered crop. */
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
      if(line.eq){flush();out.push({t:line.text||'Equation',k:'eq',r:[],eb:line.eq});return;}
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
      /* Crossing to the next column mid-sentence is not a paragraph: only break at the
         column edge when the sentence actually closed ("…performing the" flows on to
         "necessary carbon…" instead of dying at the gutter). */
      if(nextHeading||columnReset&&/[.!?:][”"')\]]?$/.test(text))flush();
      else if(!columnReset&&(extraGap||indented||shortFinish)&&!continuation)flush();
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
  var READER_V=7;
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
        lines.push(pageLines);paragraphs.push(layoutToParagraphs(extractMathRegions(layout,body),body,vocab));pages.push(pageLines.join(' '));
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
      var eqs=paragraphs[pageIdx].filter(function(p){return p.k==='eq'&&p.eb;});
      if(!caps.length&&!eqs.length)continue;
      var layout=layouts[pageIdx],dims=pageDims[pageIdx],pageW=dims[0],pageH=dims[1];
      var scale=Math.min(1.6,1300/pageW),canvas=null;
      /* Equations know their own box — crop it straight from the rendered page. */
      for(var e=0;e<eqs.length&&figIndex<FIGURE_CAP;e++){
        var eb=eqs[e].eb,eqLeft=Math.max(0,eb[0]-8),eqBottom=Math.max(0,eb[1]-6),eqRight=Math.min(pageW,eb[2]+8),eqTop=Math.min(pageH,eb[3]+6);
        if(eqRight-eqLeft<40||eqTop-eqBottom<18)continue;
        if(!canvas){
          var eqPg=await doc.getPage(pageIdx+1),eqVp=eqPg.getViewport({scale:scale});
          canvas=document.createElement('canvas');canvas.width=Math.ceil(eqVp.width);canvas.height=Math.ceil(eqVp.height);
          await eqPg.render({canvasContext:canvas.getContext('2d'),viewport:eqVp}).promise;
        }
        var eqSx=Math.max(0,eqLeft*scale),eqSw=Math.min(canvas.width-eqSx,(eqRight-eqLeft)*scale);
        var eqSy=Math.max(0,(pageH-eqTop)*scale),eqSh=Math.min(canvas.height-eqSy,(eqTop-eqBottom)*scale);
        if(eqSw<40||eqSh<20)continue;
        var eqCrop=document.createElement('canvas');eqCrop.width=Math.round(eqSw);eqCrop.height=Math.round(eqSh);
        eqCrop.getContext('2d').drawImage(canvas,eqSx,eqSy,eqSw,eqSh,0,0,eqCrop.width,eqCrop.height);
        var eqBlob=await new Promise(function(res){eqCrop.toBlob(res,'image/jpeg',.85);});
        if(!eqBlob)continue;
        var eqBuf=await eqBlob.arrayBuffer();
        if(await putFigure('fig:'+ch.id+':'+figIndex,eqBuf)){eqs[e].f=figIndex;figIndex++;}
      }
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
  function filenameTitle(name){return String(name||'').replace(/\.(?:pdf|docx?)$/i,'').replace(/[_-]+/g,' ');}
  function docxAttr(node,name){
    if(!node||!node.attributes)return '';
    for(var i=0;i<node.attributes.length;i++){var attr=node.attributes[i];if(attr.localName===name||attr.name===name||attr.name.split(':').pop()===name)return attr.value||'';}
    return '';
  }
  function docxElements(root,name){
    if(!root)return [];
    var all=root.getElementsByTagNameNS?root.getElementsByTagNameNS('*',name):root.getElementsByTagName(name),out=[];
    for(var i=0;i<all.length;i++)if((all[i].localName||all[i].nodeName.split(':').pop())===name)out.push(all[i]);
    return out;
  }
  function docxXml(entries,path){
    if(!entries[path])return null;
    var xml=new TextDecoder('utf-8').decode(entries[path]),doc=new DOMParser().parseFromString(xml,'application/xml');
    if(docxElements(doc,'parsererror').length)throw new Error('The Word file contains unreadable XML.');
    return doc;
  }
  async function docxZipEntries(value){
    var bytes=value instanceof ArrayBuffer?new Uint8Array(value):new Uint8Array(await pdfBytes(value)),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),eocd=-1;
    for(var at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(view.getUint32(at,true)===0x06054b50){eocd=at;break;}
    if(eocd<0)throw new Error('This does not look like a valid Word .docx file.');
    var count=view.getUint16(eocd+10,true),offset=view.getUint32(eocd+16,true),wanted={'word/document.xml':1,'word/comments.xml':1,'word/commentsExtended.xml':1,'docProps/core.xml':1},entries={};
    for(var i=0;i<count&&offset+46<=bytes.length;i++){
      if(view.getUint32(offset,true)!==0x02014b50)throw new Error('The Word archive directory is damaged.');
      var flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),compressedSize=view.getUint32(offset+20,true),plainSize=view.getUint32(offset+24,true),nameLength=view.getUint16(offset+28,true),extraLength=view.getUint16(offset+30,true),commentLength=view.getUint16(offset+32,true),localOffset=view.getUint32(offset+42,true),name=new TextDecoder('utf-8').decode(bytes.slice(offset+46,offset+46+nameLength));
      if(wanted[name]){
        if(flags&1)throw new Error('Password-protected Word files cannot be imported yet.');
        if(plainSize>64*1024*1024)throw new Error('This Word file expands beyond Phloem’s safe import limit.');
        if(localOffset+30>bytes.length||view.getUint32(localOffset,true)!==0x04034b50)throw new Error('The Word archive contains a damaged entry.');
        var localNameLength=view.getUint16(localOffset+26,true),localExtraLength=view.getUint16(localOffset+28,true),start=localOffset+30+localNameLength+localExtraLength,end=start+compressedSize;
        if(end>bytes.length)throw new Error('The Word archive is incomplete.');
        var packed=bytes.slice(start,end),plain;
        if(method===0)plain=packed;
        else if(method===8){
          if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot unpack Word drafts yet. Use a current Chrome, Edge, or Safari.');
          try{plain=new Uint8Array(await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());}
          catch(e){throw new Error('The Word file could not be decompressed.');}
        }else throw new Error('This Word file uses an unsupported compression method.');
        entries[name]=plain;
      }
      offset+=46+nameLength+extraLength+commentLength;
    }
    if(!entries['word/document.xml'])throw new Error('This Word file has no readable document body.');
    return entries;
  }
  function docxNodeText(root){
    var out='';
    (function walk(node){
      if(node.nodeType!==1)return;
      var name=node.localName||node.nodeName.split(':').pop();
      if(name==='t'||name==='delText'){out+=node.textContent||'';return;}
      if(name==='tab'){out+='\t';return;}if(name==='br'||name==='cr'){out+='\n';return;}
      for(var child=node.firstChild;child;child=child.nextSibling)walk(child);
    })(root);
    return out.replace(/[ \t]+\n/g,'\n').trim();
  }
  function docxParagraphKind(paragraph){
    var style=docxElements(paragraph,'pStyle')[0],value=(docxAttr(style,'val')||'').toLowerCase().replace(/[ _-]/g,'');
    if(value==='title'||value==='heading1'||value==='headingone')return 'h1';
    if(value==='subtitle'||value==='heading2'||value==='headingtwo')return 'h2';
    if(value==='heading3'||value==='headingthree')return 'h3';return '';
  }
  async function parseDocx(value,filename){
    var entries=await docxZipEntries(value),documentXml=docxXml(entries,'word/document.xml'),commentsXml=docxXml(entries,'word/comments.xml'),extendedXml=docxXml(entries,'word/commentsExtended.xml'),coreXml=docxXml(entries,'docProps/core.xml'),comments={},paraToComment={},tracked={insertions:0,deletions:0,deletedText:[]};
    if(commentsXml)docxElements(commentsXml,'comment').forEach(function(node){
      var id=docxAttr(node,'id'),firstPara=docxElements(node,'p')[0],paraId=docxAttr(firstPara,'paraId');
      comments[id]={id:'wc-'+id,sourceId:id,author:docxAttr(node,'author')||'Reviewer',date:docxAttr(node,'date')||'',text:docxNodeText(node),para:null,start:0,end:0,quote:'',replies:[],response:'',resolved:false,sourceResolved:false};if(paraId)paraToComment[paraId]=id;
    });
    if(extendedXml)docxElements(extendedXml,'commentEx').forEach(function(node){
      var id=paraToComment[docxAttr(node,'paraId')],parent=paraToComment[docxAttr(node,'paraIdParent')];if(!id||!comments[id])return;
      if(parent&&parent!==id)comments[id].parentId=parent;comments[id].sourceResolved=/^(?:1|true)$/i.test(docxAttr(node,'done'));
    });
    var active={},paragraphs=[],kinds=[],reviewRoles=[],anchors={};
    docxElements(documentXml,'p').forEach(function(paragraph){
      var raw='',localAnchors={},references={};
      function append(text){if(!text)return;var start=raw.length;raw+=text;Object.keys(active).forEach(function(id){var anchor=localAnchors[id]||(localAnchors[id]={start:start,end:start});anchor.end=raw.length;});}
      function walk(node,deleted){
        if(node.nodeType!==1)return;var name=node.localName||node.nodeName.split(':').pop(),id;
        if(name==='commentRangeStart'){id=docxAttr(node,'id');active[id]=true;if(!localAnchors[id])localAnchors[id]={start:raw.length,end:raw.length};return;}
        if(name==='commentRangeEnd'){id=docxAttr(node,'id');delete active[id];return;}
        if(name==='commentReference'){id=docxAttr(node,'id');references[id]=raw.length;return;}
        if(name==='ins'){tracked.insertions++;for(var child=node.firstChild;child;child=child.nextSibling)walk(child,false);return;}
        if(name==='del'){
          tracked.deletions++;var removed=docxNodeText(node);if(removed&&tracked.deletedText.length<200)tracked.deletedText.push(removed.slice(0,500));
          for(var deletedChild=node.firstChild;deletedChild;deletedChild=deletedChild.nextSibling)walk(deletedChild,true);return;
        }
        if(name==='t'){if(!deleted)append(node.textContent||'');return;}
        if(name==='delText')return;
        if(name==='tab'){if(!deleted)append('\t');return;}if(name==='br'||name==='cr'){if(!deleted)append('\n');return;}
        for(var child=node.firstChild;child;child=child.nextSibling)walk(child,deleted);
      }
      walk(paragraph,false);var leading=(raw.match(/^\s*/)||[''])[0].length,text=raw.trim();if(!text)return;var paraIndex=paragraphs.length;
      Object.keys(references).forEach(function(id){if(!localAnchors[id])localAnchors[id]={start:references[id],end:references[id]};});
      Object.keys(localAnchors).forEach(function(id){var anchor=localAnchors[id],start=Math.max(0,Math.min(text.length,anchor.start-leading)),end=Math.max(start,Math.min(text.length,anchor.end-leading));if(end===start){start=0;end=text.length;}(anchors[id]=anchors[id]||[]).push({para:paraIndex,start:start,end:end,quote:text.slice(start,end)});});
      var roleRuns=docxElements(paragraph,'r').filter(function(run){return docxNodeText(run).trim();}),italicRuns=roleRuns.filter(function(run){var italic=docxElements(run,'i')[0]||docxElements(run,'iCs')[0],value=italic&&docxAttr(italic,'val');return!!italic&&!/^(?:0|false|off)$/i.test(value||'1');});
      paragraphs.push(text);kinds.push(docxParagraphKind(paragraph));reviewRoles.push(roleRuns.length&&italicRuns.length/roleRuns.length>=.8?'reviewer':'response');
    });
    var roots=[];Object.keys(comments).forEach(function(id){var comment=comments[id],ranges=anchors[id]||[];comment.anchored=!!ranges.length;comment.resolved=!!comment.sourceResolved;if(ranges.length){comment.anchors=ranges;Object.assign(comment,ranges[0]);comment.quote=ranges.map(function(anchor){return anchor.quote;}).join(' … ');comment.anchorMethod='word';}if(comment.parentId&&comments[comment.parentId])comments[comment.parentId].replies.push({author:comment.author,date:comment.date,text:comment.text,sourceId:comment.sourceId});else if(comment.text)roots.push(comment);});
    var title='',creator='';if(coreXml){var titleNode=docxElements(coreXml,'title')[0],creatorNode=docxElements(coreXml,'creator')[0];title=titleNode&&titleNode.textContent.trim()||'';creator=creatorNode&&creatorNode.textContent.trim()||'';}
    if(!title){for(var i=0;i<paragraphs.length;i++)if(kinds[i]==='h1'){title=paragraphs[i];break;}}
    return {title:title||filenameTitle(filename),authors:creator,paragraphs:paragraphs,kinds:kinds,paragraphRoles:reviewRoles,comments:roots,trackedChanges:tracked};
  }
  function hasHanScript(text){return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(String(text||''));}
  function hasCompactScript(text){return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(String(text||''));}
  function plausibleTitleLength(text){var length=String(text||'').length;return length>=(hasCompactScript(text)?2:8)&&length<=220;}
  function guessTitleFromLayout(layout){
    if(!layout||!layout.length)return '';
    var pageTop=0;layout.forEach(function(line){if(line.y>pageTop)pageTop=line.y;});
    var candidates=layout.filter(function(line){
      var text=line.text.trim();
      return plausibleTitleLength(text)&&line.y>=pageTop*.25&&
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
    if(!plausibleTitleLength(title)||/^\d+$/.test(title))return '';
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
  function cleanAuthorCredit(text){
    var credit=cleanMetaTitle(text);
    if(!credit||/^(?:unknown|anonymous|none|n\/?a|author|the authors?)$/i.test(credit))return '';
    return credit
      .replace(/([A-Za-zÀ-ž.'’\-])\s*(?:[0-9¹²³⁴⁵⁶⁷⁸⁹⁰]+(?:\s*,\s*[0-9¹²³⁴⁵⁶⁷⁸⁹⁰]+)*(?:\s*[*†‡§¶]+)?|[*†‡§¶]+)(?=\s*(?:,|;|\band\b|&|$))/gi,'$1')
      .replace(/\s*\((?:\d+[\s,]*)+\)\s*(?=,|;|\band\b|&|$)/gi,'')
      .replace(/\s+,/g,',').replace(/,\s*(?:and|&)\s+/gi,' and ').replace(/\s+/g,' ').trim();
  }
  function authorParts(credit){
    return cleanAuthorCredit(credit).split(/\s*(?:,|，|;|；|、|\band\b|&)\s*/i).map(function(part){return part.trim();}).filter(function(part){
      if(!part||/\b(?:abstract|open access|correspondence|university|department|institute|journal|received|accepted|copyright)\b/i.test(part))return false;
      /* A Chinese, Japanese or Korean name may be one unspaced word. Keep the
         stricter Western-name heuristic below for Latin metadata and page text. */
      if(hasCompactScript(part)&&/^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af·・\s]+$/.test(part))return part.replace(/\s+/g,'').length>=2&&part.length<=40;
      var words=part.replace(/\bet\s+al\.?$/i,'').split(/\s+/).filter(Boolean);
      if(words.length<2||words.length>9||!words.every(function(word){return /^[A-Za-zÀ-ž.'’\-]+$/.test(word);}))return false;
      var capitals=0,particles=/^(?:al|bin|da|de|del|der|di|du|la|le|van|von|y)$/;
      var styled=words.every(function(word){var core=word.replace(/^[.'’\-]+/,'');if(particles.test(core.toLowerCase()))return true;var first=core.charAt(0);if(first&&first===first.toLocaleUpperCase()&&first!==first.toLocaleLowerCase()){capitals++;return true;}return false;});
      return styled&&capitals>=2;
    });
  }
  function metadataAuthorCredit(meta){
    var info=meta&&meta.info||{},raw=info.Author||info.Authors||'';
    if(!raw&&meta&&meta.metadata&&typeof meta.metadata.get==='function'){
      try{raw=meta.metadata.get('dc:creator')||meta.metadata.get('pdf:Author')||'';}catch(e){}
    }
    if(Array.isArray(raw))raw=raw.join(', ');
    var credit=cleanAuthorCredit(raw);return authorParts(credit).length?credit:'';
  }
  function guessAuthorsFromLayout(layout){
    if(!layout||!layout.length)return '';
    var pageTop=0,best='',bestScore=0;layout.forEach(function(line){if(line.y>pageTop)pageTop=line.y;});
    layout.forEach(function(line,index){
      var joined='',maxHeight=line.height;
      for(var span=0;span<3&&index+span<layout.length;span++){
        var next=layout[index+span];maxHeight=Math.max(maxHeight,next.height);
        if(next.y<pageTop*.45||next.height>19||Math.abs(next.y-line.y)>Math.max(4,maxHeight*1.25))break;
        joined+=(joined?' ':'')+String(next.text||'').trim();
        var raw=joined.trim();
        if(!raw||raw.length>360||/\b(?:abstract|open access|doi|correspondence|university|department|institute|received|accepted|copyright)\b/i.test(raw))continue;
        var credit=cleanAuthorCredit(raw),parts=authorParts(credit);
        if(parts.length<2)continue;
        var score=parts.length*100-credit.length*.05+(line.y/pageTop)*10-span;
        if(score>bestScore){best=credit;bestScore=score;}
      }
    });
    return best;
  }
  async function derivePdfDetails(doc){
    var details={title:'',authors:''},meta=null,layout=[];
    try{meta=await doc.getMetadata().catch(function(){return null;});}catch(e){}
    var infoTitle=meta&&meta.info&&cleanMetaTitle(meta.info.Title);
    if(infoTitle&&plausibleTitleLength(infoTitle)&&!/untitled|microsoft word|powerpoint|\.pdf$|\.docx?$|\.tex$|^\d+$/i.test(infoTitle))details.title=infoTitle;
    details.authors=metadataAuthorCredit(meta);
    try{layout=contentLayout(await (await doc.getPage(1)).getTextContent());}catch(e){}
    if(!details.title)details.title=guessTitleFromLayout(layout);
    var pageAuthors=guessAuthorsFromLayout(layout);
    if(authorParts(pageAuthors).length>authorParts(details.authors).length)details.authors=pageAuthors;
    return details;
  }
  function findImportedPaper(probe){
    var papers=state.chapters.filter(function(ch){return ch.kind==='pdf';});
    if(probe.contentHash){var hashed=papers.find(function(ch){return ch.contentHash===probe.contentHash;});if(hashed)return hashed;}
    return papers.find(function(ch){if(ch.contentHash&&probe.contentHash&&ch.contentHash!==probe.contentHash)return false;if(samePdfSource(ch,probe,'sourceUrl')||samePdfSource(ch,probe,'sourcePath'))return true;return +ch.pageCount===+probe.pageCount&&identityText(ch.sourceName)===identityText(probe.sourceName)&&identityText(probe.sourceName).length>=5;});
  }
  async function importPdf(file, sourcePath, sourceUrl, progressBtn, stayPut, preparedBytes){
    var btn=progressBtn||byId('importPdfBtn'), old=btn.textContent, imported=false; btn.disabled=true; btn.textContent='Reading PDF…';
    try {
      var bytes=preparedBytes instanceof ArrayBuffer?preparedBytes:await file.arrayBuffer(),hashPromise=pdfFingerprint(bytes).catch(function(){return '';}),lib=await loadPdfLib();btn.textContent='Opening PDF…';
      var doc=await lib.getDocument({data:bytes.slice(0)}).promise;
      var details=await derivePdfDetails(doc),title=details.title||filenameTitle(file.name),contentHash=await hashPromise;
      var probe={kind:'pdf',title:title,sourceName:file.name,sourcePath:sourcePath||'',sourceUrl:sourceUrl||'',pageCount:doc.numPages,fileSize:bytes.byteLength,contentHash:contentHash};
      var existing=findImportedPaper(probe),id=existing?existing.id:uid('p'),keepPromise=putPdf(id,bytes);
      var ch=existing||normalize({id:id,title:title,authors:details.authors||'',kind:'pdf',notes:{},pageNotes:{},tags:[],questions:[],addedAt:now(),readPage:1});
      if(existing&&titleQuality(probe)>titleQuality(existing))existing.title=title;
      if(existing&&!String(existing.authors||'').trim()&&details.authors)existing.authors=details.authors;
      ch.sourceName=file.name;ch.sourcePath=sourcePath||ch.sourcePath||'';ch.sourceUrl=sourceUrl||ch.sourceUrl||'';ch.pageCount=doc.numPages;ch.fileSize=bytes.byteLength;if(contentHash)ch.contentHash=contentHash;ch.updatedAt=now();
      if(!existing)state.chapters.push(ch);persist();renderShelf();if(!stayPut)await openReader(id,doc);if(existing&&!stayPut)showReaderToast('Already in your library — notes kept, local PDF refreshed.');var kept=await keepPromise;if(!kept)showReaderToast('PDF opened, but this browser may not keep it after closing the tab.');else if(gdriveOn())gdriveSetPdfState(id,{state:'queued',size:bytes.byteLength});imported=true;
    } catch(e){ showError(e.message||'The PDF reader could not open this file.'); }
    finally { btn.disabled=false; btn.textContent=old; }
    return imported;
  }

  function mergeImportedReviewState(incoming,existing){
    var old={},byText={};(existing||[]).forEach(function(comment){old[String(comment.sourceId||comment.id)]=comment;byText[String(comment.author||'')+'|'+reviewNormalizedText(comment.text)]=comment;});
    return (incoming||[]).map(function(comment){var prior=old[String(comment.sourceId||comment.id)]||byText[String(comment.author||'')+'|'+reviewNormalizedText(comment.text)];if(prior){comment.response=prior.response||'';comment.resolved=!!prior.resolved;comment.updatedAt=prior.updatedAt||0;if(!preserveManualReviewLocation(comment,prior)&&prior.anchored&&prior.anchorMethod==='ai'&&!comment.anchored){comment.para=prior.para;comment.start=prior.start;comment.end=prior.end;comment.quote=prior.quote;comment.anchors=prior.anchors||[{para:prior.para,start:prior.start,end:prior.end,quote:prior.quote||''}];comment.anchored=true;comment.anchorMethod='ai';comment.locatedProvider=prior.locatedProvider||'';}}comment.level=normalizeReviewLevel(comment.level,comment);comment.topic=normalizeReviewTopic(comment.topic);comment.locationHint=String(comment.locationHint||'');return comment;});
  }
  async function importDocx(file,progressBtn,stayPut,preparedBytes){
    var btn=progressBtn||byId('importPdfBtn'),old=btn.textContent,imported=false;btn.disabled=true;btn.textContent='Reading Word…';
    try{
      var bytes=preparedBytes instanceof ArrayBuffer?preparedBytes:await file.arrayBuffer(),head=new Uint8Array(bytes,0,Math.min(4,bytes.byteLength));
      if(head[0]!==0x50||head[1]!==0x4b)throw new Error('This does not look like a Word .docx file. Save it as .docx and try again.');
      var hashPromise=pdfFingerprint(bytes).catch(function(){return '';}),parsed=await parseDocx(bytes,file.name),contentHash=await hashPromise;
      if(!parsed.paragraphs.length)throw new Error('The Word draft does not contain readable manuscript text.');
      var wordDrafts=state.chapters.filter(function(ch){return ch.sourceType==='docx';}),existing=contentHash&&wordDrafts.find(function(ch){return ch.contentHash===contentHash;});if(!existing)existing=wordDrafts.find(function(ch){return identityText(ch.sourceName)===identityText(file.name);});var id=existing?existing.id:uid('w'),keepPromise=putPdf(id,bytes),ch=existing||normalize({id:id,kind:'text',sourceType:'docx',notes:{},pageNotes:{},tags:[],questions:[],addedAt:now(),readPage:1});
      ch.title=parsed.title||ch.title||filenameTitle(file.name);ch.authors=parsed.authors||ch.authors||'';ch.sourceName=file.name;ch.sourceType='docx';ch.fileSize=bytes.byteLength;if(contentHash)ch.contentHash=contentHash;ch.fr=parsed.paragraphs.join('\n\n');ch.docxParagraphKinds=parsed.kinds;ch.reviewComments=mergeImportedReviewState(parsed.comments,existing&&existing.reviewComments);ch.trackedChanges=parsed.trackedChanges;ch.updatedAt=now();if(ch.reviewComments.length){ch.reviewUpdatedAt=ch.updatedAt;ch.reviewClearedAt=0;}
      if(!existing)state.chapters.push(ch);persist();renderShelf();updateReviewBadge();var kept=await keepPromise;if(gdriveOn())gdriveSetPdfState(id,{state:'queued',size:bytes.byteLength});if(!stayPut)await openReader(id);
      var openCount=ch.reviewComments.filter(function(comment){return !comment.resolved;}).length,changeCount=(ch.trackedChanges.insertions||0)+(ch.trackedChanges.deletions||0);showReaderToast((existing?'Word draft refreshed':'Word draft added')+(openCount?' · '+openCount+' reviewer comment'+(openCount===1?'':'s'):'')+(changeCount?' · '+changeCount+' tracked change'+(changeCount===1?'':'s'):''));if(!kept)showReaderToast('Draft opened, but this browser may not keep the original file after closing the tab.');imported=true;
    }catch(e){showError(e.message||'Phloem could not read this Word draft.','Could not import Word draft');}
    finally{btn.disabled=false;btn.textContent=old;}
    return imported;
  }
  function importSourceFile(file,sourcePath,sourceUrl,progressBtn,stayPut,preparedBytes){return /\.docx$/i.test(file&&file.name||'')||file&&file.type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'?importDocx(file,progressBtn,stayPut,preparedBytes):importPdf(file,sourcePath,sourceUrl,progressBtn,stayPut,preparedBytes);}

  /* PDFs pushed by the "Read in Phloem" browser extension: its content script relays
     the fetched bytes with a window.postMessage. Only same-window senders qualify
     (a page that merely opened this tab can never fake that), and the payload must
     actually be a PDF. */
  window.addEventListener('message',async function(e){
    /* 'carrel-ext-import' is the wire name from before the Phloem rename: extensions
       already installed keep sending it, so both spellings stay welcome forever. */
    if(e.source!==window||!e.data||(e.data.type!=='carrel-ext-import'&&e.data.type!=='phloem-ext-import'))return;
    var transferId=e.data.transferId;
    function finishExtensionImport(ok){window.postMessage({type:'phloem-ext-import-complete',transferId:transferId,ok:!!ok},location.origin);}
    var bytes=e.data.bytes;
    if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<1200){finishExtensionImport(false);return;}
    var head=new Uint8Array(bytes.slice(0,5)),magic='';for(var i=0;i<head.length;i++)magic+=String.fromCharCode(head[i]);
    if(magic!=='%PDF-'){finishExtensionImport(false);return;}
    /* Keep international filenames; remove only control characters and characters
       that cannot safely form a filename on common desktop filesystems. */
    var name=String(e.data.name||'').replace(/[\u0000-\u001f\u007f/\\<>:"|?*]+/g,' ').trim().slice(0,140)||'paper.pdf';
    if(!/\.pdf$/i.test(name))name+='.pdf';
    window.postMessage({type:'phloem-ext-import-accepted',transferId:transferId},location.origin);
    showReaderToast('Adding from your browser…');
    /* The extension already supplied an ArrayBuffer. Reuse it instead of wrapping
       it in a File and immediately allocating another 100+ MB copy. */
    var imported=await importPdf({name:name},'',String(e.data.sourceUrl||'').slice(0,600),null,false,bytes);
    finishExtensionImport(imported);
  });

  /* text import and edit */
  byId('newTextBtn').onclick=function(){ closeAddDialog();editingId=null; byId('textDialogTitle').textContent='Paste text'; byId('textTitle').value=''; byId('textAuthors').value=''; byId('textBody').value=''; byId('textDialog').showModal(); };
  byId('saveTextBtn').onclick=function(){
    var body=byId('textBody').value.trim(); if(!body){ byId('textBody').focus(); return; }
    var ch=editingId ? find(editingId) : normalize({id:uid('t'),kind:'text',notes:{},pageNotes:{},tags:[],questions:[],addedAt:now()});
    ch.title=byId('textTitle').value.trim()||'Untitled'; ch.authors=byId('textAuthors').value.trim(); ch.fr=body; ch.updatedAt=now();
    if(!editingId) state.chapters.push(ch); persist(); byId('textDialog').close(); openReader(ch.id);
  };

  /* Reader typography plus a PDF-native reading guide. */
  var COMFORT_KEY='readingRoom.comfort.v1';
  var GUIDE_DISCOVERY_KEY='readingRoom.guideDiscoverySeen.v1';
  var DEFAULT_COMFORT={size:100,measure:780,leading:1.7,typeface:'book',airy:false,focus:false,guide:'yellow',guideOrientation:'row',pdfDirection:'horizontal',verticalPages:'one',guideScope:'page',guideSize:'m',guideDim:55,guideX:.72,guideY:.38,guideLock:false,tone:'cream',driftSpeed:4};
  var comfort=Object.assign({},DEFAULT_COMFORT);
  try{var savedComfort=JSON.parse(localStorage.getItem(COMFORT_KEY));if(savedComfort)Object.keys(comfort).forEach(function(k){if(typeof savedComfort[k]===typeof comfort[k])comfort[k]=savedComfort[k];});}catch(e){}
  comfort.size=Math.max(70,Math.min(190,+comfort.size||100));
  comfort.measure=Math.max(440,Math.min(1100,+comfort.measure||780));
  comfort.leading=Math.max(1.2,Math.min(2.6,+comfort.leading||1.7));
  if(['book','clean'].indexOf(comfort.typeface)<0)comfort.typeface=DEFAULT_COMFORT.typeface;
  if(['yellow','green','blue'].indexOf(comfort.guide)<0)comfort.guide='yellow';
  if(['row','column'].indexOf(comfort.guideOrientation)<0)comfort.guideOrientation='row';
  if(!savedComfort||!Object.prototype.hasOwnProperty.call(savedComfort,'pdfDirection'))comfort.pdfDirection=savedComfort&&savedComfort.guideOrientation==='column'?'vertical':'horizontal';
  if(['horizontal','vertical'].indexOf(comfort.pdfDirection)<0)comfort.pdfDirection='horizontal';
  if(['one','two'].indexOf(comfort.verticalPages)<0)comfort.verticalPages='one';
  if(['column','page'].indexOf(comfort.guideScope)<0)comfort.guideScope='page';
  if(['s','m','l'].indexOf(comfort.guideSize)<0)comfort.guideSize='m';
  comfort.guideDim=Math.max(20,Math.min(85,+comfort.guideDim||55));
  comfort.guideX=Math.max(.05,Math.min(.95,+comfort.guideX||.72));
  comfort.guideY=Math.max(.05,Math.min(.95,+comfort.guideY||.38));
  if(['white','cream'].indexOf(comfort.tone)<0)comfort.tone=DEFAULT_COMFORT.tone;
  comfort.driftSpeed=Math.max(.5,Math.min(60,+comfort.driftSpeed||4));
  var comfortSaveTimer=null;
  function saveComfortSoon(){clearTimeout(comfortSaveTimer);comfortSaveTimer=setTimeout(function(){try{localStorage.setItem(COMFORT_KEY,JSON.stringify(comfort));}catch(e){}},600);}
  var guideDiscoveryTimer=null,guideDiscoveryLaunchTimer=null;
  function dismissGuideDiscovery(){
    clearTimeout(guideDiscoveryTimer);clearTimeout(guideDiscoveryLaunchTimer);
    byId('guideTool').classList.remove('guide-discovery');byId('mMore').classList.remove('guide-discovery');
    byId('guideDiscoveryNote').setAttribute('aria-hidden','true');
  }
  function guideDiscoverySeen(){
    try{return localStorage.getItem(GUIDE_DISCOVERY_KEY)==='1'||localStorage.getItem('readingRoom.guideAdjustSeen.v1')==='1';}catch(e){return true;}
  }
  function showGuideDiscovery(chapterId){
    if(currentId!==chapterId||readerMode!=='pdf'||!pdfDoc||byId('readerPage').classList.contains('hidden'))return;
    if(comfort.focus||guideDiscoverySeen()){
      try{localStorage.setItem(GUIDE_DISCOVERY_KEY,'1');}catch(e){}
      return;
    }
    var note=byId('guideDiscoveryNote');
    note.textContent=comfort.pdfDirection==='vertical'?'Vertical book? Focus one column with Guide.':'Focus one line—or a vertical column—with Guide.';
    note.setAttribute('aria-hidden','false');byId('guideTool').classList.add('guide-discovery');
    if(innerWidth<=720){byId('mMore').classList.add('guide-discovery');showReaderToast('Need focus? Guide is under •••');}
    try{localStorage.setItem(GUIDE_DISCOVERY_KEY,'1');}catch(e){}
    guideDiscoveryTimer=setTimeout(dismissGuideDiscovery,5400);
  }
  function scheduleGuideDiscovery(chapterId){
    clearTimeout(guideDiscoveryLaunchTimer);
    guideDiscoveryLaunchTimer=setTimeout(function(){showGuideDiscovery(chapterId);},520);
  }
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
    doc.style.setProperty('--read-font',comfort.typeface==='clean'?'var(--sans)':'var(--serif)');
    byId('textSizeValue').textContent=comfort.size+'%';
    byId('widthValue').textContent=String(comfort.measure);
    byId('leadValue').textContent=comfort.leading.toFixed(1);
    byId('airyBtn').setAttribute('aria-pressed',String(!!comfort.airy));
    document.querySelectorAll('[data-reading-typeface]').forEach(function(btn){btn.setAttribute('aria-pressed',String(btn.dataset.readingTypeface===comfort.typeface));});
    byId('driftRange').value=String(comfort.driftSpeed);byId('driftValue').textContent=driftLabel();
    byId('guideDimRange').value=String(comfort.guideDim);byId('guideDimValue').textContent=comfort.guideDim+'%';
    byId('pdfFrame').classList.toggle('cream',comfort.tone==='cream');document.body.classList.toggle('cream-tone',comfort.tone==='cream');
    byId('creamBtn').setAttribute('aria-pressed',String(comfort.tone==='cream'));
    var guideOverlay=byId('paneSpotlight');
    guideOverlay.dataset.guideColor=comfort.guide;
    guideOverlay.dataset.guideOrientation=comfort.guideOrientation;
    guideOverlay.style.setProperty('--guide-dim-opacity',(comfort.guideDim/100).toFixed(2));
    document.querySelectorAll('.guide-color[data-guide-color]').forEach(function(btn){btn.setAttribute('aria-pressed',String(btn.dataset.guideColor===comfort.guide));});
    document.querySelectorAll('[data-guide-orientation]').forEach(function(btn){btn.setAttribute('aria-pressed',String(btn.dataset.guideOrientation===comfort.guideOrientation));});
    document.querySelectorAll('[data-pdf-direction]').forEach(function(btn){btn.setAttribute('aria-pressed',String(btn.dataset.pdfDirection===comfort.pdfDirection));});
    document.querySelectorAll('[data-vertical-pages]').forEach(function(btn){btn.setAttribute('aria-pressed',String(btn.dataset.verticalPages===comfort.verticalPages));});
    byId('verticalPagesGroup').hidden=comfort.pdfDirection!=='vertical';
    document.querySelectorAll('[data-guide-scope]').forEach(function(btn){btn.setAttribute('aria-pressed',String(btn.dataset.guideScope===comfort.guideScope));});
    document.querySelectorAll('[data-guide-size]').forEach(function(btn){btn.setAttribute('aria-pressed',String(btn.dataset.guideSize===comfort.guideSize));});
    byId('guideSpanGroup').hidden=comfort.guideOrientation==='column';
    byId('guideSizeLabel').textContent=comfort.guideOrientation==='column'?'Width':'Height';
    byId('guideSizeGroup').setAttribute('aria-label','Reading guide '+(comfort.guideOrientation==='column'?'width':'height'));
    applyPdfFlowMode();
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
  document.querySelectorAll('[data-reading-typeface]').forEach(function(btn){btn.onclick=function(){comfort.typeface=btn.dataset.readingTypeface;applyComfort();showReaderToast(btn.textContent+' reading typeface');};});
  byId('airyBtn').onclick=function(){comfort.airy=!comfort.airy;applyComfort();};
  byId('creamBtn').onclick=function(){comfort.tone=comfort.tone==='cream'?'white':'cream';applyComfort();showReaderToast(comfort.tone==='cream'?'Cream paper · easier on the eyes':'White paper');};
  document.querySelectorAll('[data-pdf-direction]').forEach(function(btn){btn.onclick=function(){comfort.pdfDirection=btn.dataset.pdfDirection;columnBookFitToken='';columnBookManualZoom=false;guideOffset=null;applyComfort();showReaderToast(comfort.pdfDirection==='vertical'?'Vertical book · cropped right-to-left pages':'Normal PDF · continuous downward pages');};});
  document.querySelectorAll('[data-vertical-pages]').forEach(function(btn){btn.onclick=function(){comfort.verticalPages=btn.dataset.verticalPages;columnBookFitToken='';columnBookManualZoom=false;guideOffset=null;applyComfort();showReaderToast(comfort.verticalPages==='two'?'Two-page spread · right to left':'One-page comfort view');};});
  document.querySelectorAll('.guide-color[data-guide-color]').forEach(function(btn){btn.onclick=function(){comfort.guide=btn.dataset.guideColor;comfort.focus=true;applyComfort();showReaderToast(btn.dataset.guideColor.charAt(0).toUpperCase()+btn.dataset.guideColor.slice(1)+' reading guide');};});
  document.querySelectorAll('[data-guide-orientation]').forEach(function(btn){btn.onclick=function(){comfort.guideOrientation=btn.dataset.guideOrientation;comfort.focus=true;guideOffset=null;applyComfort();placeGuide();showReaderToast(comfort.guideOrientation==='column'?'Vertical guide · follows one top-to-bottom column':'Row guide · follows one horizontal passage');};});
  document.querySelectorAll('[data-guide-scope]').forEach(function(btn){btn.onclick=function(){comfort.guideScope=btn.dataset.guideScope;comfort.focus=true;applyComfort();placeGuide();showReaderToast(btn.textContent+' guide');};});
  document.querySelectorAll('[data-guide-size]').forEach(function(btn){btn.onclick=function(){comfort.guideSize=btn.dataset.guideSize;comfort.focus=true;applyComfort();placeGuide();showReaderToast('Guide '+(comfort.guideOrientation==='column'?'width':'height')+' · '+btn.dataset.guideSize.toUpperCase());};});
  byId('guideDimRange').oninput=function(){comfort.guideDim=Math.max(20,Math.min(85,+this.value||55));byId('guideDimValue').textContent=comfort.guideDim+'%';byId('paneSpotlight').style.setProperty('--guide-dim-opacity',(comfort.guideDim/100).toFixed(2));saveComfortSoon();};
  byId('comfortReset').onclick=function(){Object.assign(comfort,DEFAULT_COMFORT);if(driftSpeed)driftSpeed=DEFAULT_COMFORT.driftSpeed;applyComfort();showReaderToast('Reading settings reset · cream paper · guide off');};
  function setComfortBarOpen(open){var bar=byId('comfortBar'),btn=byId('comfortBtn');bar.classList.toggle('hidden',!open);byId('guideTool').classList.toggle('settings-open',open);btn.setAttribute('aria-expanded',String(open));}
  byId('comfortBtn').onclick=function(){dismissGuideDiscovery();setComfortBarOpen(byId('comfortBar').classList.contains('hidden'));};
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
    var sizeFactor=comfort.guideSize==='s'?.62:comfort.guideSize==='l'?1.6:1;
    if(comfort.guideOrientation==='column'){
      var visibleLeft=Math.max(rect.left,surfaceRect.left),visibleRight=Math.min(rect.right,surfaceRect.right);
      var visibleTop=Math.max(rect.top,surfaceRect.top),visibleBottom=Math.min(rect.bottom,surfaceRect.bottom);
      if(visibleRight<=visibleLeft||visibleBottom<=visibleTop)return false;
      var guideWidth=Math.round(Math.max(44,Math.min(76,surfaceRect.width*.065))*sizeFactor);
      guideWidth=Math.min(guideWidth,Math.max(24,visibleRight-visibleLeft-8));
      var guideLeft=Math.max(visibleLeft-rect.left+4,Math.min(visibleRight-rect.left-guideWidth-4,clientX-rect.left-guideWidth/2));
      overlay.classList.remove('guide-left');
      overlay.style.setProperty('--guide-x',Math.round(guideLeft)+'px');
      overlay.style.setProperty('--guide-y',Math.round(visibleTop-rect.top)+'px');
      overlay.style.setProperty('--guide-w',guideWidth+'px');
      overlay.style.setProperty('--guide-h',Math.max(0,Math.round(visibleBottom-visibleTop))+'px');
      comfort.guideX=Math.max(.05,Math.min(.95,(clientX-rect.left)/Math.max(1,rect.width)));
    }else{
      var left=surfaceRect.left,right=surfaceRect.right,leftHalf=false;
      if(readerMode==='pdf'&&comfort.guideScope==='column'){
        var middle=surfaceRect.left+surfaceRect.width/2;
        if(clientX<middle){right=middle;leftHalf=true;}else left=middle;
      }
      overlay.classList.toggle('guide-left',leftHalf);
      left=Math.max(rect.left,left);right=Math.min(rect.right,right);
      var guideHeight=Math.round((innerWidth<=720?Math.max(76,Math.min(108,rect.height*.13)):Math.max(96,Math.min(142,rect.height*.15)))*sizeFactor);
      var guideTop=Math.max(8,Math.min(rect.height-guideHeight-8,clientY-rect.top-guideHeight/2));
      overlay.style.setProperty('--guide-x',Math.round(left-rect.left)+'px');
      overlay.style.setProperty('--guide-y',Math.round(guideTop)+'px');
      overlay.style.setProperty('--guide-w',Math.max(0,Math.round(right-left))+'px');
      overlay.style.setProperty('--guide-h',guideHeight+'px');
      comfort.guideY=Math.max(.05,Math.min(.95,(clientY-rect.top)/Math.max(1,rect.height)));
    }
    overlay.classList.add('placed');
    saveComfortSoon();
    return true;
  }
  /* Re-anchor the band from its last screen point. Runs after the pages actually exist
     (PDF layout is async), after zoom/mode changes, and as the paper scrolls beneath it. */
  function placeGuide(){
    if(!comfort.focus||byId('readerPage').classList.contains('hidden'))return;
    var rect=byId('documentPane').getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    var x=guideOffset?rect.left+guideOffset.x:rect.left+rect.width*(comfort.guideOrientation==='column'?(comfort.guideX||.72):.5),y=guideOffset?rect.top+guideOffset.y:rect.top+rect.height*(comfort.guideY||.38);
    x=Math.max(rect.left+6,Math.min(rect.right-6,x));y=Math.max(rect.top+16,Math.min(rect.bottom-30,y));
    setReadingGuide(x,y,document.elementFromPoint(x,y));
  }
  function applyFocus(){
    var overlay=byId('paneSpotlight'),btn=byId('focusBtn'),on=!!comfort.focus;
    overlay.classList.toggle('on',on);overlay.classList.toggle('locked',!!comfort.guideLock);btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',String(on));byId('guideTool').classList.toggle('active',on);
    var zg=byId('zenGuide');zg.classList.toggle('active',on);zg.setAttribute('aria-pressed',String(on));
    if(on)requestAnimationFrame(placeGuide);
  }
  /* Zen strips the toolbars, but the guide is a reading aid, not chrome — it keeps
     this one faint seat beside the exit so dense passages don't cost a round trip. */
  byId('zenGuide').onclick=function(){byId('focusBtn').onclick();};
  byId('zenTheme').onclick=function(){byId('themeBtn').onclick();};
  byId('focusBtn').onclick=function(){
    dismissGuideDiscovery();
    var turningOn=!comfort.focus,seen=false;
    if(turningOn){try{seen=localStorage.getItem('readingRoom.guideAdjustSeen.v1')==='1';}catch(e){}if(!seen){comfort.guide='yellow';comfort.guideScope='page';}}
    comfort.focus=turningOn;applyComfort();
    if(comfort.focus&&!zenOn&&!seen){setComfortBarOpen(true);requestAnimationFrame(function(){var bar=byId('comfortBar'),group=byId('guideDimGroup'),barRect=bar.getBoundingClientRect(),groupRect=group.getBoundingClientRect();if(bar.scrollWidth>bar.clientWidth)bar.scrollTo({left:Math.max(0,bar.scrollLeft+groupRect.left-barRect.left-12),behavior:'smooth'});});try{localStorage.setItem('readingRoom.guideAdjustSeen.v1','1');}catch(e){}}
    showReaderToast(comfort.focus?(matchMedia('(hover: hover)').matches?(comfort.guideLock?'Reading guide on · pinned — click the paper to release':'Reading guide follows your pointer · click the paper to pin it'):'Reading guide on · drag its ⠿ handle or tap the page'):'Reading guide off');
  };
  byId('documentPane').addEventListener('pointermove',function(e){
    if(!comfort.focus||comfort.guideLock||e.pointerType==='touch')return;setReadingGuide(e.clientX,e.clientY,e.target);
  });
  byId('documentPane').addEventListener('click',function(e){
    if(Date.now()<columnBookSuppressClickUntil){e.preventDefault();e.stopImmediatePropagation();return;}
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
      showReaderToast(comfort.guideLock?'Guide pinned to this '+(comfort.guideOrientation==='column'?'column':'line')+' · click the paper to release':'Guide follows your pointer');
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
    if(comfort.focus&&!e.shiftKey&&comfort.guideOrientation==='row'){
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
    setUserZoom(z,anchorX,anchorY,0,0,function(){
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
    if(currentZoom()>1.25){setUserZoom(1);colZoomSide=0;showReaderToast('Back to full width');return;}
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
    if(columnBookFlow()){columnBookManualZoom=false;columnBookFitToken='';fitColumnBookPage(currentPage,true);showReaderToast('Fitting the full vertical text column');return;}
    if(currentZoom()<=1.05)colZoomSide=0;
    try{
      var pageNo=currentPage,bands=await columnBands(pageNo);
      if(bands.twoCol){
        if(colZoomSide===0){colZoomSide=1;zoomToBand(bands.left,pageNo,undefined,undefined,'Left column · Col again for the right');}
        else if(colZoomSide===1){colZoomSide=2;zoomToBand(bands.right,pageNo,undefined,undefined,'Right column · Col again for full width');}
        else{colZoomSide=0;setUserZoom(1);showReaderToast('Back to full width');}
      }else if(colZoomSide===0){colZoomSide=2;zoomToBand(bands.text,pageNo,undefined,undefined,'Text width · Col again for full width');}
      else{colZoomSide=0;setUserZoom(1);showReaderToast('Back to full width');}
    }catch(err){}
  }
  /* Keyboard scope control: place the guide as full-page or hugging one column,
     keeping its current line. */
  function placeGuideScoped(scope,half){
    if(comfort.guideOrientation==='column'){
      comfort.focus=true;comfort.guideX=half==='left'?.28:.72;guideOffset=null;applyComfort();placeGuide();
      return;
    }
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
  var zenOn=false,zenViaFullscreen=false,zenIdleTimer=0,zenWakeLock=null;
  function zenWake(){
    if(!zenOn)return;
    document.body.classList.remove('zen-idle');clearTimeout(zenIdleTimer);
    zenIdleTimer=setTimeout(function(){if(zenOn)document.body.classList.add('zen-idle');},3200);
  }
  ['pointermove','pointerdown','wheel','touchstart','keydown'].forEach(function(type){document.addEventListener(type,zenWake,{passive:true});});
  /* Long stretches of hands-off reading are exactly when a tablet decides to lock
     its screen; zen holds a wake lock for as long as it owns the room. */
  function holdZenWake(){
    if(!zenOn||!navigator.wakeLock||document.visibilityState!=='visible')return;
    navigator.wakeLock.request('screen').then(function(lock){zenWakeLock=lock;lock.addEventListener('release',function(){zenWakeLock=null;});},function(){});
  }
  function dropZenWake(){if(zenWakeLock){zenWakeLock.release().catch(function(){});zenWakeLock=null;}}
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')holdZenWake();});
  function setZen(on){
    zenOn=!!on;document.body.classList.toggle('zen',zenOn);
    if(zenOn){zenWake();holdZenWake();}
    else{clearTimeout(zenIdleTimer);document.body.classList.remove('zen-idle');dropZenWake();}
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
  function toggleSheet(open,fromHistory){
    var notebook=byId('notebook'),scrim=byId('sheetScrim'),willOpen=open!==undefined?open:!notebook.classList.contains('sheet-open');
    var wasOpen=notebook.classList.contains('sheet-open');
    if(!willOpen&&recallActive)setRecall(false);
    notebook.classList.toggle('sheet-open',willOpen);scrim.classList.toggle('hidden',!willOpen);
    syncMobileSheetButtons();
    var hideSheet=innerWidth<=720&&!willOpen;
    try{byId('notebook').inert=hideSheet;}catch(e){}
    byId('notebook').setAttribute('aria-hidden',String(hideSheet));
    if(hideSheet&&byId('notebook').contains(document.activeElement)){try{document.activeElement.blur();}catch(e){}}
    /* The system back gesture peels the sheet before it may leave the reader: opening
       adds one history layer, and any in-page close consumes that layer again so the
       stack never drifts from what is on screen. */
    try{
      if(willOpen&&!wasOpen&&innerWidth<=720&&!(history.state&&history.state.phloem==='sheet'))history.pushState({phloem:'sheet'},'');
      else if(!willOpen&&wasOpen&&!fromHistory&&history.state&&history.state.phloem==='sheet'){history.back();historyEcho++;}
    }catch(e){}
  }
  function toggleMobileTab(id){var same=id==='aiPanel'?!byId('aiPanel').classList.contains('hidden'):!byId('notesPanel').classList.contains('hidden');if(same&&byId('notebook').classList.contains('sheet-open'))toggleSheet(false);else{switchTab(id);toggleSheet(true);
    /* On an annotated paper the write-a-note box sits screens below the sheet's fold;
       opening Notes brings the pen to hand instead of the archive. */
    if(id==='notesPanel'&&innerWidth<=720)requestAnimationFrame(function(){try{byId('pageNote').scrollIntoView({block:'center'});}catch(e){}});
  }}
  byId('mAsk').onclick=function(){toggleMobileTab('aiPanel');};
  byId('mNotes').onclick=function(){toggleMobileTab('notesPanel');};
  byId('sheetScrim').onclick=function(){toggleSheet(false);};
  byId('sheetClose').onclick=function(){toggleSheet(false);};
  byId('mMore').onclick=function(){
    var on=!byId('readerPage').classList.contains('show-tools');
    byId('readerPage').classList.toggle('show-tools',on);this.setAttribute('aria-expanded',String(on));
    if(on)this.classList.remove('guide-discovery');
  };
  byId('mPrev').onclick=function(){byId('prevPage').click();};
  byId('mNext').onclick=function(){byId('nextPage').click();};
  function updateProgress(){
    var ch=find(currentId),pct=0;
    if(ch){
      if(readerMode==='pdf'&&pdfDoc&&pdfDoc.numPages){var pdfPane=byId('documentPane'),pdfSpan=pdfPane.scrollHeight-pdfPane.clientHeight;pct=columnBookFlow()?currentPage/pdfDoc.numPages*100:(pdfSpan>4?pdfPane.scrollTop/pdfSpan*100:currentPage/pdfDoc.numPages*100);}
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
      /* A phone has no Backspace: the way back is a button that waits above the bar. */
      if(matchMedia('(hover: none)').matches){byId('linkReturn').classList.remove('hidden');showReaderToast('Jumped to p. '+(idx+1));}
      else showReaderToast('Jumped to p. '+(idx+1)+' · Backspace comes back');
    }catch(destError){}
  }
  function returnFromLink(){
    if(!linkReturnSpot)return;
    var pane=byId('documentPane');pane.scrollTop=linkReturnSpot.top;pane.scrollLeft=linkReturnSpot.left;
    linkReturnSpot=null;byId('linkReturn').classList.add('hidden');showReaderToast('Back where you were');
  }
  byId('linkReturn').onclick=returnFromLink;
  async function gotoPdfPage(page,behavior){
    var ch=find(currentId);if(!ch||ch.kind!=='pdf')return;
    if(innerWidth<=720)toggleSheet(false);
    if(readerMode!=='pdf'){readerMode='pdf';updateReaderMode();}
    var target=Math.max(1,+page||1);if(!pdfDoc){currentPage=target;return;}
    target=Math.min(target,pdfDoc.numPages);
    if(!pdfViews.length||pdfBuildKey!==currentBuildKey())await renderPdfPage();
    if(columnBookFlow()){await turnColumnBookPage(target);return;}
    currentPage=target;updatePageChrome();scrollToPdfPage(target,behavior||'smooth');
    await renderPdfPageAt(target);
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
  function restorePdfZoom(ch){
    var saved=ch&&ch.kind==='pdf'?+ch.zoom:0;
    /* An older build could leave a paper at the 50% floor even when the reader had not
       made a deliberate per-paper choice. That is half of Phloem's fit-to-pane size,
       not Acrobat-style "actual size", so migrate it once back to the readable default.
       Choices made after this migration carry a version and remain fully respected. */
    if(ch&&ch.kind==='pdf'&&saved>0&&saved<=.5&&(+ch.zoomPreferenceV||0)<PDF_ZOOM_PREFERENCE_VERSION){
      saved=0;ch.zoom=0;ch.zoomPreferenceV=PDF_ZOOM_PREFERENCE_VERSION;persist(false);
    }
    pdfZoom=saved>0?Math.max(.5,Math.min(4,saved)):1;pdfFit=pdfZoom===1;
  }
  async function openReader(id,preparedDoc){
    /* pdfViews must go too: renderPdfPage's spot-preserving rebuild otherwise measures
       the PREVIOUS paper's pages — an extension import into an open reader landed the
       new paper mid-page, at wherever the old one had been scrolled. */
    var ch=find(id); if(!ch) return; hideLookup();setRecall(false);if(ch.kind==='pdf')await hydrateDerived(ch); currentId=id;reviewFocusId='';reviewFocusPage=0;reviewFocusAnchorIndex=-1;reviewLinkTargetId='';reviewLinkUndo=null; currentPage=ch.readPage||1; pdfDoc=null; pdfOutline=null; pdfViews=[]; pdfBuildKey=''; columnBookTurning=false;columnBookQueuedTarget=0;columnBookFits=true;columnBookMinLeft=0;columnBookMaxLeft=0;columnBookAutoZoomed=false;columnBookManualZoom=false;columnBookFitToken=''; try{localStorage.setItem(LAST_OPEN_KEY,id);}catch(e){} restorePdfZoom(ch); setHighlightMode(false); clearPendingSelection(); hideHighlightCard(); highlightHistory=[]; highlightFuture=[]; lastAskSelection=null; toggleFindBar(false); linkReturnSpot=null; byId('linkReturn').classList.add('hidden');
    refreshReaderSegmentation(ch);
    pageStartCache={}; focusPara=Number.isInteger(ch.focusPara)?ch.focusPara:null;
    byId('readerTitle').textContent=ch.title||'Untitled'; byId('readerMeta').textContent=ch.authors||ch.sourceName||'';
    byId('paperTags').value=(ch.tags||[]).join(', ');byId('reviewerLocateStatus').textContent='';renderNoteIndex();renderReviewerPanel(ch);
    byId('evidenceList').classList.add('hidden');byId('evidenceList').innerHTML='';
    aiContext=null;aiThreadDraft=false;byId('contextCard').classList.add('hidden');byId('aiStatus').textContent='';restoreActiveAiThread(ch);renderQa();
    /* One history layer per open paper: the system back gesture then returns to the
       library instead of leaving the app mid-read. A leftover layer (a reload that
       restored a 'sheet' entry, an exit that raced its consume) is re-stamped and
       reused, never stacked. */
    if(byId('readerPage').classList.contains('hidden')){try{
      if(!(history.state&&history.state.phloem))history.pushState({phloem:'reader'},'');
      else if(history.state.phloem==='sheet')history.replaceState({phloem:'reader'},'');
    }catch(e){}}
    readerMode=ch.kind==='pdf'?'pdf':'text'; applyComfort(); updateReaderMode(); showPage('readerPage');
    if((ch.reviewComments||[]).length){if(innerWidth>720)setNotebookCollapsed(false,false);switchTab('reviewsPanel');}else switchTab('notesPanel');
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
        /* Older imports may still wear a filename or have no author credit. Repair both
           from the local PDF, while never replacing hand-edited library details. */
        if(ch.title===filenameTitle(ch.sourceName)||!String(ch.authors||'').trim()){
          var titleDoc=pdfDoc,titleId=ch.id;
          derivePdfDetails(titleDoc).then(function(details){
            var target=find(titleId);
            if(!target)return;var changed=false,titleChanged=false,authorsChanged=false;
            if(details.title&&target.title===filenameTitle(target.sourceName)&&details.title!==target.title){target.title=details.title;changed=titleChanged=true;}
            if(details.authors&&!String(target.authors||'').trim()){target.authors=details.authors;changed=authorsChanged=true;}
            if(!changed)return;touch(target);
            if(currentId===titleId){byId('readerTitle').textContent=target.title;byId('readerMeta').textContent=target.authors||target.sourceName||'';}
            showReaderToast(titleChanged&&authorsChanged?'Title and authors read from the paper':(authorsChanged?'Authors read from the paper':'Title read from the paper'));
          });
        }
        if(readerMode==='text'&&(!ch.readerText||ch.readerV!==READER_V)){await ensureReaderData(pdfDoc,ch);updateReaderMode();}
        else if(readerMode==='pdf'){
          Promise.resolve(renderPdfPage()).then(function(){scheduleGuideDiscovery(ch.id);});
          if(currentPage>1)showReaderToast('Back on page '+currentPage);
        }
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
    if(!pdf)byId('linkReturn').classList.add('hidden');
    var reflow=byId('reflowBtn');reflow.classList.toggle('hidden',!isPdf);reflow.classList.toggle('to-text',pdf);reflow.setAttribute('aria-pressed',String(isPdf&&!pdf));
    reflow.innerHTML=pdf?'Aa <span class="wide">Reader view</span>':'⧉ <span class="wide">PDF</span>';
    reflow.setAttribute('aria-label',pdf?'Switch to Reader view':'Back to the PDF view');
    reflow.setAttribute('title',pdf?'Reader view · the paper rebuilt as clean, phone-friendly text':'Back to the original PDF layout');
    if(!pdf&&ch) renderText(ch);applyPdfFlowMode();applyFocus();loadPageNote();updateProgress();
  }
  byId('reflowBtn').onclick=async function(){
    var ch=find(currentId);if(!ch||ch.kind!=='pdf')return;clearPendingSelection();
    readerMode=readerMode==='pdf'?'text':'pdf';updateReaderMode();
    if(readerMode==='pdf'&&pdfDoc){Promise.resolve(renderPdfPage()).then(function(){scrollToPdfPage(currentPage,'auto');});return;}
    if(readerMode==='text'&&(!ch.readerText||!ch.pageParagraphs||ch.readerV!==READER_V)&&pdfDoc){
      this.disabled=true;
      try{await ensureReaderData(pdfDoc,ch);pageStartCache={};renderText(ch);showReaderToast('Reader view · rebuilt from the PDF');}
      catch(e){showReaderToast('Could not build Reader view for this paper');}
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
  var columnBookTurning=false,columnBookQueuedTarget=0,columnBookFits=true,columnBookMinLeft=0,columnBookMaxLeft=0,columnBookAutoZoomed=false,columnBookManualZoom=false,columnBookFitToken='',columnBookSuppressClickUntil=0;
  function columnBookFlow(){return readerMode==='pdf'&&comfort.pdfDirection==='vertical';}
  function columnBookSpread(){var pane=byId('documentPane');return columnBookFlow()&&comfort.verticalPages==='two'&&pane&&pane.clientWidth>=640&&pane.clientHeight>=480;}
  function columnBookComfortPage(){var pane=byId('documentPane');return columnBookFlow()&&!columnBookSpread()&&pane&&pane.clientWidth>=760&&pane.clientHeight>=520;}
  function columnBookCropped(){return columnBookSpread()||columnBookComfortPage();}
  function columnBookStep(){return columnBookSpread()?2:1;}
  function resetBookCrop(view){
    if(!view||!view.crop)return;
    view.crop=null;view.holder.classList.remove('book-cropped');
    if(view.pageWidth)view.holder.style.width=view.pageWidth+'px';if(view.pageHeight)view.holder.style.height=view.pageHeight+'px';
    if(view.sheet)view.sheet.style.transform='';
  }
  function cropBookView(view,bounds){
    if(!view||!bounds||!view.pageWidth||!view.pageHeight)return;
    var padX=Math.max(10,view.pageWidth*.018),padY=Math.max(10,view.pageHeight*.016);
    var x=Math.max(0,bounds.x0*view.pageWidth-padX),y=Math.max(0,bounds.y0*view.pageHeight-padY);
    var right=Math.min(view.pageWidth,bounds.x1*view.pageWidth+padX),bottom=Math.min(view.pageHeight,bounds.y1*view.pageHeight+padY);
    var w=Math.max(40,right-x),h=Math.max(60,bottom-y);
    view.crop={x:x,y:y,width:w,height:h};view.holder.classList.add('book-cropped');
    view.holder.style.width=Math.ceil(w)+'px';view.holder.style.height=Math.ceil(h)+'px';
    view.sheet.style.transform='translate('+Math.round(-x)+'px,'+Math.round(-y)+'px)';
  }
  function syncColumnBookPages(){
    if(!pdfViews)return;
    var on=columnBookFlow(),spread=columnBookSpread(),cropped=columnBookCropped(),frame=byId('pdfFrame'),pane=byId('documentPane');
    frame.classList.toggle('column-book-spread',spread);pane.classList.toggle('column-book-spread',spread);
    frame.classList.toggle('column-book-comfort',cropped&&!spread);pane.classList.toggle('column-book-comfort',cropped&&!spread);
    pdfViews.forEach(function(view,index){
      var right=on&&index===currentPage-1,left=spread&&index===currentPage;
      view.holder.classList.toggle('book-active',right||left);
      view.holder.classList.toggle('book-spread-right',right&&spread);
      view.holder.classList.toggle('book-spread-left',left);
      if(!cropped||!(right||left))resetBookCrop(view);
      if(!on)view.holder.classList.remove('book-turning','book-out-next','book-in-next','book-out-prev','book-in-prev','book-spread-right','book-spread-left');
    });
  }
  /* Scanned vertical books often devote most of each page to blank paper. Find the dark
     ink in the rendered canvas, then fit that writing block rather than the page box. */
  function verticalInkBounds(view){
    var canvas=view&&view.canvas;if(!canvas||!canvas.width||!canvas.height)return null;
    var cacheKey=canvas.width+'x'+canvas.height;
    if(view.inkBounds&&view.inkBounds.key===cacheKey)return view.inkBounds;
    try{
      /* Sampling the full-resolution PDF canvas briefly doubles its memory. Downsample
         first: 300px is plenty to locate margins and stays safe on a large phone scan. */
      var maxSide=300,sampleScale=Math.min(1,maxSide/Math.max(canvas.width,canvas.height));
      var sw=Math.max(32,Math.round(canvas.width*sampleScale)),sh=Math.max(32,Math.round(canvas.height*sampleScale));
      var sample=document.createElement('canvas');sample.width=sw;sample.height=sh;
      var ctx=sample.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,sw,sh);
      var data=ctx.getImageData(0,0,sw,sh).data,coarse=Math.max(3,Math.round(Math.min(sw,sh)/70)),tones=[];
      for(var sy=coarse/2;sy<sh;sy+=coarse)for(var sx=coarse/2;sx<sw;sx+=coarse){var si=(Math.floor(sy)*sw+Math.floor(sx))*4;tones.push(data[si]*.299+data[si+1]*.587+data[si+2]*.114);}
      tones.sort(function(a,b){return a-b;});var paper=tones[Math.floor(tones.length*.62)]||235,threshold=Math.max(72,Math.min(150,paper-68));
      var step=1,xs=[],ys=[];
      for(var y=step/2;y<sh;y+=step)for(var x=step/2;x<sw;x+=step){var i=(Math.floor(y)*sw+Math.floor(x))*4,lum=data[i]*.299+data[i+1]*.587+data[i+2]*.114;if(data[i+3]>200&&lum<threshold){xs.push(x/sw);ys.push(y/sh);}}
      if(xs.length<50)return null;
      xs.sort(function(a,b){return a-b;});ys.sort(function(a,b){return a-b;});
      function q(values,f){return values[Math.max(0,Math.min(values.length-1,Math.floor(values.length*f)))];}
      var x0=q(xs,.015),x1=q(xs,.985),y0=q(ys,.015),y1=q(ys,.985);
      if(x1-x0<.035||y1-y0<.08)return null;
      view.inkBounds={key:cacheKey,x0:Math.max(0,x0-.018),x1:Math.min(1,x1+.018),y0:Math.max(0,y0-.022),y1:Math.min(1,y1+.022)};
      return view.inkBounds;
    }catch(e){return null;}
  }
  function alignColumnBookPage(pageNo,bounds,behavior){
    var view=pdfViews[pageNo-1],pane=byId('documentPane');if(!view||!bounds||!columnBookFlow()||columnBookCropped())return;
    syncColumnBookPages();
    var w=view.holder.offsetWidth,h=view.holder.offsetHeight,contentW=(bounds.x1-bounds.x0)*w,contentH=(bounds.y1-bounds.y0)*h;
    var top=view.holder.offsetTop+bounds.y0*h-Math.max(12,(pane.clientHeight-contentH)/2);
    var left=view.holder.offsetLeft+bounds.x0*w-Math.max(12,(pane.clientWidth-contentW)/2);
    columnBookFits=contentW<=pane.clientWidth*.94;
    if(!columnBookFits){
      var maxScroll=Math.max(0,pane.scrollWidth-pane.clientWidth);
      columnBookMinLeft=Math.max(0,Math.min(maxScroll,view.holder.offsetLeft+bounds.x0*w-pane.clientWidth*.18));
      columnBookMaxLeft=Math.max(columnBookMinLeft,Math.min(maxScroll,view.holder.offsetLeft+bounds.x1*w-pane.clientWidth*.82));
      left=columnBookMaxLeft;
    }else columnBookMinLeft=columnBookMaxLeft=Math.max(0,left);
    pane.scrollTo({top:Math.max(0,top),left:Math.max(0,left),behavior:behavior||'auto'});
    if(comfort.focus)requestAnimationFrame(function(){
      if(!columnBookFlow()||comfort.guideLock){placeGuide();return;}
      /* A vertical page begins at its rightmost column. Land the guide on actual ink,
         not at 72% of a scan whose generous outer margin may contain nothing at all. */
      var paper=view.holder.getBoundingClientRect(),paneRect=pane.getBoundingClientRect();
      var inkRight=paper.left+bounds.x1*paper.width,inkTop=paper.top+bounds.y0*paper.height,inkHeight=(bounds.y1-bounds.y0)*paper.height;
      var gx=Math.max(paneRect.left+12,Math.min(paneRect.right-12,inkRight-Math.min(28,paper.width*.025)));
      var gy=Math.max(paneRect.top+24,Math.min(paneRect.bottom-30,inkTop+Math.min(inkHeight*.35,paneRect.height*.38)));
      guideOffset={x:gx-paneRect.left,y:gy-paneRect.top};setReadingGuide(gx,gy,view.holder);
    });
  }
  function layoutCroppedColumnBook(pageNos,boundsList,spread){
    if(!columnBookCropped()||columnBookSpread()!==spread||pageNos[0]!==currentPage)return;
    pageNos.forEach(function(pageNo,index){cropBookView(pdfViews[pageNo-1],boundsList[index]);});
    syncColumnBookPages();
    var pane=byId('documentPane');requestAnimationFrame(function(){
      columnBookMinLeft=0;columnBookMaxLeft=Math.max(0,pane.scrollWidth-pane.clientWidth);columnBookFits=columnBookMaxLeft<=2;
      pane.scrollTo({top:0,left:columnBookMaxLeft,behavior:'auto'});
    });
    if(comfort.focus)requestAnimationFrame(function(){
      if(!columnBookCropped()||columnBookSpread()!==spread||comfort.guideLock){placeGuide();return;}
      var rightView=pdfViews[currentPage-1],paper=rightView&&rightView.holder.getBoundingClientRect(),paneRect=pane.getBoundingClientRect();
      if(!paper)return;
      var gx=Math.max(paneRect.left+14,Math.min(paneRect.right-14,paper.right-Math.min(28,paper.width*.05)));
      var gy=Math.max(paneRect.top+24,Math.min(paneRect.bottom-30,paper.top+paper.height*.36));
      guideOffset={x:gx-paneRect.left,y:gy-paneRect.top};setReadingGuide(gx,gy,rightView.holder);
    });
  }
  async function fitCroppedColumnBook(pageNo,force){
    if(!pdfDoc||!columnBookCropped()||pageNo!==currentPage)return;
    var spread=columnBookSpread(),pageNos=[pageNo];if(spread&&pageNo<pdfDoc.numPages)pageNos.push(pageNo+1);
    await Promise.all(pageNos.map(renderPdfPageAt));
    if(!columnBookCropped()||columnBookSpread()!==spread||pageNo!==currentPage)return;
    var views=pageNos.map(function(n){return pdfViews[n-1];});
    if(views.some(function(view){return !view||!view.rendered;})){setTimeout(function(){fitCroppedColumnBook(pageNo,force);},90);return;}
    views.forEach(resetBookCrop);
    var boundsList=views.map(function(view){return verticalInkBounds(view)||{x0:.03,x1:.97,y0:.03,y1:.97};});
    var pane=byId('documentPane'),nowZoom=currentZoom(),baseWidth=0,baseHeight=0;
    views.forEach(function(view,index){var bounds=boundsList[index];baseWidth+=(bounds.x1-bounds.x0)*view.pageWidth/nowZoom;baseHeight=Math.max(baseHeight,(bounds.y1-bounds.y0)*view.pageHeight/nowZoom);});
    var widthShare=spread?.86:.64,heightShare=spread?.84:.88,gutter=spread?Math.max(24,Math.min(40,pane.clientWidth*.024)):0;
    var desired=Math.max(spread?.35:.5,Math.min(3.4,Math.min((pane.clientWidth*widthShare-gutter)/Math.max(1,baseWidth),(pane.clientHeight*heightShare)/Math.max(1,baseHeight))));
    var token=currentId+'|'+(spread?'spread':'comfort')+'|'+pageNos.join('-')+'|'+pane.clientWidth+'x'+pane.clientHeight;
    var shouldZoom=force||(!columnBookManualZoom&&(columnBookFitToken!==token||nowZoom<desired*.94||nowZoom>desired*1.06));
    columnBookFitToken=token;
    if(shouldZoom&&Math.abs(desired-nowZoom)>.035){
      columnBookAutoZoomed=Math.abs(desired-1)>.05;
      setZoom(desired,undefined,undefined,0,0,function(){Promise.all(pageNos.map(renderPdfPageAt)).then(function(){var fresh=pageNos.map(function(n){return pdfViews[n-1];}),freshBounds=fresh.map(function(view){return verticalInkBounds(view)||{x0:.03,x1:.97,y0:.03,y1:.97};});layoutCroppedColumnBook(pageNos,freshBounds,spread);});});
    }else layoutCroppedColumnBook(pageNos,boundsList,spread);
  }
  async function fitColumnBookPage(pageNo,force){
    if(!pdfDoc||!columnBookFlow()||!pdfViews[pageNo-1])return;
    if(columnBookCropped())return fitCroppedColumnBook(pageNo,force);
    syncColumnBookPages();await renderPdfPageAt(pageNo);
    if(columnBookCropped())return fitCroppedColumnBook(pageNo,force);
    if(!columnBookFlow()||pageNo!==currentPage)return;
    var view=pdfViews[pageNo-1],bounds=verticalInkBounds(view);
    if(!view.rendered){setTimeout(function(){fitColumnBookPage(pageNo,force);},90);return;}
    if(!bounds){columnBookFits=false;return;}
    var pane=byId('documentPane'),fitPageHeight=view.holder.offsetHeight/Math.max(.5,currentZoom());
    var desired=Math.max(1,Math.min(3.4,(pane.clientHeight*.84)/Math.max(1,(bounds.y1-bounds.y0)*fitPageHeight)));
    var token=currentId+'|'+pageNo+'|'+pane.clientWidth+'x'+pane.clientHeight,nowZoom=currentZoom();
    var shouldZoom=force||columnBookFitToken!==token||nowZoom<desired*.9||nowZoom>desired*1.3;
    columnBookFitToken=token;
    if(shouldZoom&&Math.abs(desired-nowZoom)>.06){
      columnBookAutoZoomed=desired>1.05;
      setZoom(desired,undefined,undefined,0,0,function(){if(columnBookCropped()){fitCroppedColumnBook(currentPage,false);return;}renderPdfPageAt(pageNo).then(function(){var fresh=pdfViews[pageNo-1],freshBounds=verticalInkBounds(fresh);if(freshBounds)alignColumnBookPage(pageNo,freshBounds,'auto');});});
    }else alignColumnBookPage(pageNo,bounds,force?'smooth':'auto');
  }
  function applyPdfFlowMode(forceFit){
    var pane=byId('documentPane'),frame=byId('pdfFrame'),on=columnBookFlow(),was=frame.classList.contains('column-book-flow');
    pane.classList.toggle('column-book-flow',on);frame.classList.toggle('column-book-flow',on);syncColumnBookPages();
    if(on&&driftSpeed)setDrift(0);
    if(pdfDoc&&pdfViews&&pdfViews.length){
      if(on)requestAnimationFrame(function(){fitColumnBookPage(currentPage,!!forceFit||!was);});
      else if(was){columnBookManualZoom=false;columnBookFitToken='';columnBookFits=true;if(columnBookAutoZoomed){columnBookAutoZoomed=false;setZoom(1,undefined,undefined,0,0,function(){scrollToPdfPage(currentPage,'auto');});}else requestAnimationFrame(function(){scrollToPdfPage(currentPage,'auto');});}
    }
    if(pdfDoc)updatePageChrome();
  }
  async function turnColumnBookPage(target){
    if(!pdfDoc||!columnBookFlow())return;
    target=Math.max(1,Math.min(pdfDoc.numPages,target));
    if(columnBookTurning){columnBookQueuedTarget=target;return;}
    if(target===currentPage){syncColumnBookPages();return fitColumnBookPage(target,false);}
    if(columnBookSpread()){
      columnBookTurning=true;
      var spreadPages=[target];if(target<pdfDoc.numPages)spreadPages.push(target+1);
      await Promise.all(spreadPages.map(renderPdfPageAt));
      if(!columnBookSpread()){columnBookTurning=false;return;}
      currentPage=target;syncColumnBookPages();updatePageChrome();updateProgress();byId('pdfFrame').classList.add('spread-turning');
      var spreadCh=find(currentId);if(spreadCh&&spreadCh.kind==='pdf'){spreadCh.readPage=currentPage;spreadCh.updatedAt=now();persist(false);}
      setTimeout(function(){
        byId('pdfFrame').classList.remove('spread-turning');var spreadQueued=columnBookQueuedTarget;columnBookQueuedTarget=0;columnBookTurning=false;
        if(spreadQueued&&spreadQueued!==currentPage)requestAnimationFrame(function(){turnColumnBookPage(spreadQueued);});
        else fitCroppedColumnBook(currentPage,false);
      },220);
      return;
    }
    columnBookTurning=true;var from=currentPage,forward=target>from,oldView=pdfViews[from-1],nextView=pdfViews[target-1];
    await renderPdfPageAt(target);
    if(!columnBookFlow()){columnBookTurning=false;return;}
    nextView.holder.classList.add('book-active','book-turning',forward?'book-in-next':'book-in-prev');
    oldView.holder.classList.add('book-turning',forward?'book-out-next':'book-out-prev');
    currentPage=target;updatePageChrome();updateProgress();
    var ch=find(currentId);if(ch&&ch.kind==='pdf'){ch.readPage=currentPage;ch.updatedAt=now();persist(false);}
    setTimeout(function(){
      [oldView,nextView].forEach(function(view){view.holder.classList.remove('book-turning','book-out-next','book-in-next','book-out-prev','book-in-prev');});
      var queued=columnBookQueuedTarget;columnBookQueuedTarget=0;
      syncColumnBookPages();columnBookTurning=false;
      if(queued&&queued!==currentPage)requestAnimationFrame(function(){turnColumnBookPage(queued);});
      else fitColumnBookPage(currentPage,false);
    },270);
  }
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
      holder.innerHTML='<div class="pdf-sheet"><canvas></canvas><div class="highlight-layer"></div><div class="text-layer"></div></div>';
      frame.appendChild(holder);
      var sheet=holder.children[0];sheet.style.width=holder.style.width;sheet.style.height=holder.style.height;
      pdfViews.push({holder:holder,sheet:sheet,canvas:sheet.children[0],highlights:sheet.children[1],text:sheet.children[2],pageWidth:Math.ceil(natural.width*scale),pageHeight:Math.ceil(natural.height*scale),crop:null,rendered:false,rendering:false,buildId:buildId});
      if(carry[i]){
        var cw=Math.ceil(natural.width*scale),chh=Math.ceil(natural.height*scale);
        var nc=pdfViews[i-1].canvas;nc.width=cw;nc.height=chh;
        try{nc.getContext('2d').drawImage(carry[i],0,0,cw,chh);}catch(e){}
      }
    }
    syncColumnBookPages();
    applyDarkPdf();pdfBuildKey=currentBuildKey();layoutZoom=builtZoom;
    if(pageObserver)pageObserver.disconnect();
    pageObserver=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){if(entry.isIntersecting)renderPdfPageAt(+entry.target.dataset.page);});
    },{root:byId('documentPane'),rootMargin:'160% 0px'});
    pdfViews.forEach(function(view){pageObserver.observe(view.holder);});
    updatePageChrome();
    if(columnBookFlow())requestAnimationFrame(function(){fitColumnBookPage(currentPage,!columnBookFitToken);});
    if(comfort.focus)requestAnimationFrame(placeGuide);
  }
  async function renderPdfPageAt(n){
    var view=pdfViews[n-1];if(!view||view.rendered||view.rendering||!pdfDoc||view.buildId!==pdfBuildId)return;
    view.rendering=true;
    try{
      var page=await pdfDoc.getPage(n),natural=page.getViewport({scale:1}),scale=pageScale(natural);
      if(view.buildId!==pdfBuildId)return;
      /* dpr-3 phones read at ratio 2: at fit that is under 1MP per page, and the area
         cap below plus the far-page canvas freeing remain the real memory guards. */
      var viewport=page.getViewport({scale:scale}),ratio=Math.min(devicePixelRatio||1,2);
      /* Zoomed-in pages are already huge in CSS pixels; cap the backing-store area so a
         675-page textbook at 250% cannot blow Safari's canvas memory budget. Tablets get
         a middle tier: desktop-sized pixel counts were what made iPad zooming flicker. */
      var areaCap=innerWidth<=720?65e5:coarsePointer.matches?9e6:14e6;
      ratio=Math.max(.5,Math.min(ratio,Math.sqrt(areaCap/Math.max(1,viewport.width*viewport.height))));
      view.pageWidth=Math.ceil(viewport.width);view.pageHeight=Math.ceil(viewport.height);view.crop=null;
      view.holder.classList.remove('book-cropped');view.holder.style.width=view.pageWidth+'px';view.holder.style.height=view.pageHeight+'px';view.holder.style.setProperty('--scale-factor',scale);
      view.sheet.style.width=view.pageWidth+'px';view.sheet.style.height=view.pageHeight+'px';view.sheet.style.transform='';
      view.canvas.width=Math.floor(viewport.width*ratio);view.canvas.height=Math.floor(viewport.height*ratio);view.canvas.style.width=Math.ceil(viewport.width)+'px';view.canvas.style.height=Math.ceil(viewport.height)+'px';
      await page.render({canvasContext:view.canvas.getContext('2d'),viewport:viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]}).promise;
      if(view.buildId!==pdfBuildId)return;
      view.text.innerHTML='';view.text.style.width=Math.ceil(viewport.width)+'px';view.text.style.height=Math.ceil(viewport.height)+'px';
      try{var textContent=await page.getTextContent({includeMarkedContent:true});await new pdfLib.TextLayer({textContentSource:textContent,container:view.text,viewport:viewport}).render();var textCh=find(currentId),pageText=contentToLines(textContent).join(' ');if(textCh&&pageText){textCh.pageTexts=textCh.pageTexts||[];if(textCh.pageTexts[n-1]!==pageText){textCh.pageTexts[n-1]=pageText;saveDerivedSoon(textCh);persist(false);}if(repairPdfReviewQuotes(textCh,n)){persist(false);renderReviewerPanel(textCh);}}}catch(textError){view.text.innerHTML='';}
      /* The PDF's own link annotations: citations jump to their reference, outline
         links jump between sections, URLs open in a new tab. */
      try{
        if(!view.links){view.links=document.createElement('div');view.links.className='pdf-links';view.sheet.appendChild(view.links);}
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
      view.rendered=true;renderedPages.push(n);renderPdfHighlights(n);renderPdfReviewFocus(n);freeFarPages();
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
    var view=pdfViews[n-1];if(!view)return;if(columnBookFlow()){turnColumnBookPage(n);return;}var pane=byId('documentPane');
    pane.scrollTo({top:pane.scrollTop+view.holder.getBoundingClientRect().top-pane.getBoundingClientRect().top-10,behavior:behavior||'smooth'});
  }
  function updatePageChrome(){
    if(!pdfDoc)return;
    var book=columnBookFlow(),spread=columnBookSpread(),spreadEnd=spread?Math.min(pdfDoc.numPages,currentPage+1):currentPage;
    var pageLabel=(spreadEnd>currentPage?currentPage+'–'+spreadEnd:currentPage)+' / '+pdfDoc.numPages;
    byId('pageNumber').textContent=pageLabel;byId('mPageLabel').textContent=pageLabel;
    byId('prevPage').disabled=currentPage<=1;byId('nextPage').disabled=spreadEnd>=pdfDoc.numPages;
    byId('mPrev').disabled=currentPage<=1;byId('mNext').disabled=spreadEnd>=pdfDoc.numPages;
    byId('prevPage').textContent=book?'→':'←';byId('nextPage').textContent=book?'←':'→';
    byId('mPrev').textContent=book?'→':'←';byId('mNext').textContent=book?'←':'→';
    byId('prevPage').setAttribute('aria-label',book?'Previous page · turn right':'Previous page');byId('nextPage').setAttribute('aria-label',book?'Next page · turn left':'Next page');
    byId('mPrev').setAttribute('aria-label',book?'Previous page · turn right':'Previous page');byId('mNext').setAttribute('aria-label',book?'Next page · turn left':'Next page');
    byId('zoomLabel').textContent=pdfFit?'Fit':Math.round(pdfZoom*100)+'%';
    byId('colZoomBtn').textContent=book?'Text':'Col';byId('colZoomBtn').setAttribute('aria-label',book?'Fit vertical text to the page':'Zoom to one column');
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
    if(readerMode!=='pdf'||!pdfViews.length||columnBookFlow())return;
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
  byId('prevPage').onclick=function(){ var step=columnBookFlow()?columnBookStep():1;if(currentPage>1){ clearPendingSelection();scrollToPdfPage(Math.max(1,currentPage-step)); } };
  byId('nextPage').onclick=function(){ var step=columnBookFlow()?columnBookStep():1;if(pdfDoc&&currentPage+step<=pdfDoc.numPages){ clearPendingSelection();scrollToPdfPage(currentPage+step); } };
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
    var newZoom=Math.max(columnBookSpread()?.35:.5,Math.min(4,+value||1));
    if(Math.abs(newZoom-1)<=.05)newZoom=1;
    pdfFit=newZoom===1;pdfZoom=pdfFit?1:newZoom;
    byId('zoomLabel').textContent=pdfFit?'Fit':Math.round(pdfZoom*100)+'%';
    var ch=find(currentId);
    var storedZoom=pdfFit?0:pdfZoom;
    if(ch&&ch.kind==='pdf'&&(ch.zoom!==storedZoom||ch.zoomPreferenceV!==PDF_ZOOM_PREFERENCE_VERSION)){ch.zoom=storedZoom;ch.zoomPreferenceV=PDF_ZOOM_PREFERENCE_VERSION;persist(false);}
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
  function setUserZoom(value,anchorX,anchorY,shiftX,shiftY,onSettled){
    if(columnBookFlow())columnBookManualZoom=true;
    setZoom(value,anchorX,anchorY,shiftX,shiftY,onSettled);
  }
  byId('zoomOut').onclick=function(){setUserZoom(currentZoom()/1.2);};
  byId('zoomIn').onclick=function(){setUserZoom(currentZoom()*1.2);};
  byId('colZoomBtn').onclick=function(){cycleColumnZoom();};
  byId('zoomLabel').onclick=function(){setUserZoom(1);};
  /* A trackpad's horizontal gesture is the desktop equivalent of sliding a book leaf.
     On enlarged scans it first travels across the columns, then turns only after the
     reader reaches an edge. One quiet pause arms the next leaf so inertial wheel events
     cannot accidentally skip several pages. */
  var columnBookWheelSum=0,columnBookWheelTimer=null,columnBookWheelConsumed=false;
  byId('documentPane').addEventListener('wheel',function(e){
    if(readerMode!=='pdf')return;
    if(e.ctrlKey||e.metaKey){e.preventDefault();setUserZoom(currentZoom()*(e.deltaY<0?1.12:1/1.12),e.clientX,e.clientY);return;}
    if(!columnBookFlow()||Math.abs(e.deltaX)<12||Math.abs(e.deltaX)<=Math.abs(e.deltaY)*1.12)return;
    var pane=byId('documentPane'),forward=e.deltaX<0;
    var atTurnEdge=columnBookFits||(forward?pane.scrollLeft<=columnBookMinLeft+3:pane.scrollLeft>=columnBookMaxLeft-3);
    clearTimeout(columnBookWheelTimer);
    columnBookWheelTimer=setTimeout(function(){columnBookWheelSum=0;columnBookWheelConsumed=false;},210);
    if(!atTurnEdge||columnBookWheelConsumed)return;
    e.preventDefault();
    if(columnBookWheelSum&&Math.sign(columnBookWheelSum)!==Math.sign(e.deltaX))columnBookWheelSum=0;
    columnBookWheelSum+=e.deltaX;
    if(Math.abs(columnBookWheelSum)<72)return;
    columnBookWheelConsumed=true;columnBookWheelSum=0;
    turnColumnBookPage(currentPage+(forward?columnBookStep():-columnBookStep()));
  },{passive:false});
  /* Touch: pinch anywhere on the paper for a live preview that follows both fingers —
     spread and travel — then a crisp re-render lands under them without a snap-back;
     double-tap hops between Fit and 160%. */
  (function(){
    var pane=byId('documentPane'),frame=byId('pdfFrame');
    var pinch=null,tapStart=null,lastTapAt=0,lastTapX=0,lastTapY=0,bookSwipe=null,pointerBookSwipe=null;
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
    function startPan(t,ts){return {lastX:t.clientX,lastY:t.clientY,lastT:ts,startX:t.clientX,startY:t.clientY,vx:0,vy:0,edgePull:0};}
    function activeBookHolder(){return pdfViews[currentPage-1]&&pdfViews[currentPage-1].holder;}
    function clearBookSwipePreview(){var active=activeBookHolder();if(active)active.style.transform='';}
    /* Mouse and pen readers get the same physical leaf gesture as touch readers. Keep
       this on the paper surface so selecting text, following links, and using controls
       remain ordinary browser interactions. */
    pane.addEventListener('pointerdown',function(e){
      if(!columnBookFlow()||!pdfDoc||(e.pointerType!=='mouse'&&e.pointerType!=='pen')||e.button!==0)return;
      if(!e.target.closest||!e.target.closest('.pdf-page')||e.target.closest('a,button,.pdf-link,.text-layer span,mark'))return;
      pointerBookSwipe={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};
      try{pane.setPointerCapture(e.pointerId);}catch(err){}pane.classList.add('turning-book-leaf');
    });
    pane.addEventListener('pointermove',function(e){
      var g=pointerBookSwipe;if(!g||g.id!==e.pointerId)return;
      var dx=e.clientX-g.x,dy=e.clientY-g.y;g.lastX=e.clientX;g.lastY=e.clientY;
      if(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.08){
        e.preventDefault();g.moved=true;
        var active=activeBookHolder();if(active)active.style.transform='translateX('+Math.max(-90,Math.min(90,dx*.35))+'px)';
      }
    });
    function endPointerBookSwipe(e){
      var g=pointerBookSwipe;if(!g||g.id!==e.pointerId)return;
      pointerBookSwipe=null;pane.classList.remove('turning-book-leaf');clearBookSwipePreview();
      var dx=e.clientX-g.x,dy=e.clientY-g.y;
      if(!g.moved||Math.abs(dx)<64||Math.abs(dx)<=Math.abs(dy)*1.05)return;
      e.preventDefault();columnBookSuppressClickUntil=Date.now()+420;
      turnColumnBookPage(currentPage+(dx>0?columnBookStep():-columnBookStep()));
    }
    pane.addEventListener('pointerup',endPointerBookSwipe);
    pane.addEventListener('pointercancel',function(e){if(pointerBookSwipe&&pointerBookSwipe.id===e.pointerId){pointerBookSwipe=null;pane.classList.remove('turning-book-leaf');clearBookSwipePreview();}});
    function handlePanMove(e){
      var t=e.touches[0],g=panGesture;
      var sel=window.getSelection&&window.getSelection();
      if(sel&&!sel.isCollapsed){panGesture=null;return;}
      e.preventDefault();
      var dx=t.clientX-g.lastX,dy=t.clientY-g.lastY,dt=Math.max(1,e.timeStamp-g.lastT);
      if(columnBookFlow()){
        var atNextEdge=pane.scrollLeft<=columnBookMinLeft+2&&dx>0,atPrevEdge=pane.scrollLeft>=columnBookMaxLeft-2&&dx<0;
        if(atNextEdge||atPrevEdge){
          g.edgePull+=dx;
          var active=activeBookHolder();if(active)active.style.transform='translateX('+Math.max(-90,Math.min(90,g.edgePull*.35))+'px)';
        }else{g.edgePull=0;clearBookSwipePreview();}
        pane.scrollLeft=Math.max(columnBookMinLeft,Math.min(columnBookMaxLeft,pane.scrollLeft-dx));
      }else pane.scrollLeft-=dx;
      pane.scrollTop-=dy;
      var blend=Math.min(1,dt/50);
      g.vx=g.vx*(1-blend)+(dx/dt)*blend;g.vy=g.vy*(1-blend)+(dy/dt)*blend;
      g.lastX=t.clientX;g.lastY=t.clientY;g.lastT=e.timeStamp;
    }
    function endPanGesture(e){
      if(!panGesture||(e.touches&&e.touches.length))return;
      var g=panGesture;panGesture=null;
      if(columnBookFlow()&&Math.abs(g.edgePull)>64&&Math.abs(g.lastX-g.startX)>Math.abs(g.lastY-g.startY)*1.05){
        clearBookSwipePreview();tapStart=null;lastTapAt=0;turnColumnBookPage(currentPage+(g.edgePull>0?columnBookStep():-columnBookStep()));return;
      }
      clearBookSwipePreview();
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
        if(columnBookFlow()&&columnBookFits){bookSwipe={x:t.clientX,y:t.clientY,lastX:t.clientX,lastY:t.clientY,moved:false};panGesture=null;return;}
        bookSwipe=null;
        panGesture=pane.scrollWidth>pane.clientWidth+1?startPan(t,e.timeStamp):null;
        return;
      }
      if(e.touches.length!==2)return;
      e.preventDefault();tapStart=null;lastTapAt=0;panGesture=null;bookSwipe=null;clearBookSwipePreview();
      var rect=pane.getBoundingClientRect(),m=touchMid(e.touches);
      pinch={d:Math.max(20,touchDist(e.touches)),zoom:currentZoom(),k:1,x:m.x,y:m.y,curX:m.x,curY:m.y};
      frame.style.transformOrigin=(pane.scrollLeft+m.x-rect.left)+'px '+(pane.scrollTop+m.y-rect.top)+'px';
      frame.style.willChange='transform';
    },{passive:false});
    pane.addEventListener('touchmove',function(e){
      if(bookSwipe&&!pinch&&e.touches.length===1){
        var bt=e.touches[0],bdx=bt.clientX-bookSwipe.x,bdy=bt.clientY-bookSwipe.y;
        bookSwipe.lastX=bt.clientX;bookSwipe.lastY=bt.clientY;
        if(Math.abs(bdx)>10&&Math.abs(bdx)>Math.abs(bdy)*1.08){
          e.preventDefault();bookSwipe.moved=true;
          var active=activeBookHolder();if(active)active.style.transform='translateX('+Math.max(-90,Math.min(90,bdx*.35))+'px)';
        }
        if(bookSwipe.moved)return;
      }
      if(panGesture&&!pinch&&e.touches.length===1){handlePanMove(e);return;}
      if(!pinch||e.touches.length!==2)return;
      e.preventDefault();
      var m=touchMid(e.touches),target=Math.max(.5,Math.min(4,pinch.zoom*(touchDist(e.touches)/pinch.d)));
      pinch.k=target/pinch.zoom;pinch.curX=m.x;pinch.curY=m.y;
      frame.style.transform='translate('+(m.x-pinch.x)+'px,'+(m.y-pinch.y)+'px) scale('+pinch.k+')';
    },{passive:false});
    function endBookSwipe(e){
      if(!bookSwipe||(e.touches&&e.touches.length))return;
      var g=bookSwipe,t=e.changedTouches&&e.changedTouches[0],dx=t?t.clientX-g.x:g.lastX-g.x,dy=t?t.clientY-g.y:g.lastY-g.y;
      bookSwipe=null;clearBookSwipePreview();
      if(!g.moved||Math.abs(dx)<64||Math.abs(dx)<=Math.abs(dy)*1.05)return;
      tapStart=null;lastTapAt=0;e.preventDefault();
      /* In a right-bound vertical book the next leaf is exposed by swiping the current
         leaf to the right; the reverse swipe returns to the previous leaf. */
      turnColumnBookPage(currentPage+(dx>0?columnBookStep():-columnBookStep()));
    }
    pane.addEventListener('touchend',endBookSwipe,{passive:false});
    pane.addEventListener('touchend',endPanGesture,{passive:true});
    pane.addEventListener('touchcancel',function(){panGesture=null;bookSwipe=null;clearBookSwipePreview();},{passive:true});
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
      setUserZoom(commit.zoom*commit.k,commit.x,commit.y,shiftX,shiftY,clearPinchPreview);
      /* A finger still resting on the glass keeps panning from right here. */
      if(e.touches&&e.touches.length===1){
        if(columnBookFlow()&&columnBookFits){var t=e.touches[0];bookSwipe={x:t.clientX,y:t.clientY,lastX:t.clientX,lastY:t.clientY,moved:false};panGesture=null;}
        else panGesture=startPan(e.touches[0],e.timeStamp);
      }
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
        setUserZoom(currentZoom()<=1.01?1.6:1,t.clientX,t.clientY);
      }else{lastTapAt=at;lastTapX=t.clientX;lastTapY=t.clientY;}
    },{passive:false});
  })();
  document.addEventListener('keydown',function(e){
    if(byId('readerPage').classList.contains('hidden'))return;
    if(e.key==='Escape'&&recallActive){e.preventDefault();setRecall(false);return;}
    if(e.key==='Escape'&&!byId('lookupCard').classList.contains('hidden')){e.preventDefault();hideLookup();return;}
    if(e.key==='Escape'&&!byId('selectionCard').classList.contains('hidden')){e.preventDefault();clearPendingSelection();return;}
    if(e.key==='Escape'&&highlightMode){e.preventDefault();hideLookup();clearPendingSelection();setHighlightMode(false);showReaderToast('Marker off');return;}
    if(e.key==='Escape'&&zenOn){e.preventDefault();setZen(false);return;}
    if(/INPUT|TEXTAREA/.test(e.target.tagName)||e.target.isContentEditable)return;
    if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'){e.preventDefault();undoHighlight();return;}
    if((e.metaKey||e.ctrlKey)&&((e.shiftKey&&e.key.toLowerCase()==='z')||(!e.shiftKey&&e.key.toLowerCase()==='y'))){e.preventDefault();redoHighlight();return;}
    if(e.key==='/'&&!e.metaKey&&!e.ctrlKey){e.preventDefault();toggleFindBar(true);return;}
    if(e.key.toLowerCase()==='f'&&!e.metaKey&&!e.ctrlKey&&!e.altKey){e.preventDefault();setZen(!zenOn);return;}
    if(e.key.toLowerCase()==='g'&&!e.metaKey&&!e.ctrlKey&&!e.altKey){e.preventDefault();byId('focusBtn').onclick();return;}
    if(e.key.toLowerCase()==='c'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&readerMode==='pdf'&&pdfDoc){e.preventDefault();cycleColumnZoom();return;}
    if(e.key==='Backspace'&&readerMode==='pdf'&&linkReturnSpot){e.preventDefault();returnFromLink();return;}
    if(e.key===' '&&!e.shiftKey&&columnBookFlow()){
      e.preventDefault();byId('nextPage').click();return;
    }
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
    if(e.key==='+'||e.key==='='){e.preventDefault();setUserZoom(currentZoom()*1.2);}
    else if(e.key==='-'||e.key==='_'){e.preventDefault();setUserZoom(currentZoom()/1.2);}
    else if(e.key==='0'){e.preventDefault();setUserZoom(1);}
    else if(e.key==='ArrowDown'){e.preventDefault();pane.scrollBy({top:74});}
    else if(e.key==='ArrowUp'){e.preventDefault();pane.scrollBy({top:-74});}
    else if(e.key==='PageDown'||(e.key===' '&&e.shiftKey)){e.preventDefault();if(columnBookFlow())byId('nextPage').click();else pane.scrollBy({top:pane.clientHeight*.85,behavior:'smooth'});}
    else if(e.key==='PageUp'){e.preventDefault();if(columnBookFlow())byId('prevPage').click();else pane.scrollBy({top:-pane.clientHeight*.85,behavior:'smooth'});}
    else if(e.shiftKey&&e.key==='ArrowLeft'){e.preventDefault();placeGuideScoped('column','left');showReaderToast(comfort.guideOrientation==='column'?'Column guide moved left':'Guide hugs the left half · Shift+Enter for full page');}
    else if(e.shiftKey&&e.key==='ArrowRight'){e.preventDefault();placeGuideScoped('column','right');showReaderToast(comfort.guideOrientation==='column'?'Column guide moved right':'Guide hugs the right half · Shift+Enter for full page');}
    else if(e.shiftKey&&e.key==='Enter'){e.preventDefault();placeGuideScoped('page');showReaderToast(comfort.guideOrientation==='column'?'Column guide returned to the right':'Guide spans the full page');}
    else if(e.key==='ArrowRight'){e.preventDefault();byId(columnBookFlow()?'prevPage':'nextPage').click();}
    else if(e.key==='ArrowLeft'){e.preventDefault();byId(columnBookFlow()?'nextPage':'prevPage').click();}
  });
  var refitTimer=null;
  addEventListener('resize',function(){
    /* toggleSheet keys inert/aria-hidden to the width at the moment it ran; rotating a
       phone to landscape crosses the breakpoint and would otherwise leave the visible
       desktop sidebar swallowing every tap. Recompute on every viewport change. */
    var rotatedNotebook=byId('notebook'),sheetTucked=innerWidth<=720&&!rotatedNotebook.classList.contains('sheet-open');
    try{rotatedNotebook.inert=sheetTucked;}catch(e){}
    rotatedNotebook.setAttribute('aria-hidden',String(sheetTucked));
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
    var reviewComments=ch.reviewComments||[],docxKinds=!isPdfReader&&ch.sourceType==='docx'?(ch.docxParagraphKinds||[]):[];
    var starts=isPdfReader?paraPageStarts(ch):null,startAt={};(starts||[]).forEach(function(s){startAt[s.para]=s.page;});
    var openReviews=reviewComments.filter(function(comment){return !comment.resolved;}).length,tracked=ch.trackedChanges||{},reviewBanner=reviewComments.length?'<button class="docx-review-banner" id="openReaderReviews" type="button"><span>Revision desk</span><strong>'+openReviews+' open of '+reviewComments.length+' reviewer comment'+(reviewComments.length===1?'':'s')+'</strong>'+(tracked.insertions||tracked.deletions?'<small>'+((tracked.insertions||0)+(tracked.deletions||0))+' tracked changes recorded in the original</small>':'')+'</button>':'';
    var out=(isPdfReader?'<div class="reader-kicker">Reader view · headers and footers removed</div>':'')+'<h1>'+esc(ch.title||'Untitled')+'</h1><div class="byline">'+esc(ch.authors||ch.sourceName||'')+'</div>'+reviewBanner;
    var meta=null;
    if(isPdfReader&&ch.pageParagraphs){
      if(readerMetaCache.id!==ch.id||readerMetaCache.v!==ch.readerV)readerMetaCache={id:ch.id,v:ch.readerV,meta:readerStructure(ch.pageLines||[],ch.pageParagraphs).meta};
      if(readerMetaCache.meta.length===fr.length)meta=readerMetaCache.meta;
    }
    fr.forEach(function(p,i){
      var n=noteMap[i]||'',m=meta&&meta[i]||null;
      var kind=m?m.k:(docxKinds[i]||(p.length<90&&(/^[A-Z][A-Z\s\d:.,&()/-]{4,}$/.test(p)||/^\d+(?:\.\d+)*\s+[A-Z]/.test(p))?'h3':''));
      var cls=kind==='h1'?' reader-heading reader-h1':kind==='h2'?' reader-heading reader-h2':kind==='h3'?' reader-heading reader-h3':kind==='cap'?' reader-cap':kind==='eq'?' reader-eq':'';
      if(startAt[i])out+='<div class="page-marker">Page '+startAt[i]+'<button type="button" data-goto-page="'+startAt[i]+'">view page</button></div>';
      var fig=m&&m.f!==undefined?'<figure class="reader-fig"><img data-fig="'+esc(ch.id)+':'+m.f+'" alt="'+(kind==='eq'?'Equation from the paper':'Figure from the paper')+'" loading="lazy"></figure>':'';
      /* With the typeset crop on screen, the extracted symbol soup would only echo it. */
      if(kind==='eq'&&fig)cls+=' eq-figured';
      out+='<section class="para'+cls+'">'+fig+'<div class="original" data-para-index="'+i+'">'+styledTextHtml(p,marks,m&&m.r,i,reviewComments)+'</div>'+(en[i]?'<div class="translation">'+esc(en[i])+'</div>':'')+'<button class="para-action" data-note="'+i+'">'+(n?'Edit margin note •':'Add margin note')+'</button><textarea class="inline-note '+(n?'':'hidden')+'" data-note-area="'+i+'" data-note-scope="'+scope+'" placeholder="Note on this paragraph…">'+esc(n)+'</textarea></section>';
    });
    byId('textDocument').classList.toggle('reader-document',isPdfReader);byId('textDocument').innerHTML=out;
    if(meta)loadFigureImages();
    var reviewsButton=byId('openReaderReviews');if(reviewsButton)reviewsButton.onclick=function(){switchTab('reviewsPanel');if(innerWidth<=720)toggleSheet(true);else setNotebookCollapsed(false,true);};
    byId('textDocument').querySelectorAll('[data-note]').forEach(function(b){ b.onclick=function(){ var ta=byId('textDocument').querySelector('[data-note-area="'+b.dataset.note+'"]'); ta.classList.toggle('hidden'); if(!ta.classList.contains('hidden')) ta.focus(); }; });
    byId('textDocument').querySelectorAll('[data-goto-page]').forEach(function(b){b.onclick=function(){gotoPdfPage(+b.dataset.gotoPage);};});
    byId('textDocument').onclick=function(e){
      var reviewEl=e.target.closest('[data-review-comment-id]');
      if(reviewEl&&!String(getSelection&&getSelection()||'')){showReviewerComment(ch,reviewEl.dataset.reviewCommentId);return;}
      var markEl=e.target.closest('mark[data-hl-id]');
      if(markEl&&!String(getSelection&&getSelection()||'')){
        if(highlightMode)removeHighlight(scope,null,markEl.dataset.hlId);
        else openHighlightCard({kind:scope,page:null,id:markEl.dataset.hlId},markEl.getBoundingClientRect());
        return;
      }
      if(e.target.closest('button, textarea, a, mark, img, [data-review-comment-id]'))return;
      if(String(getSelection&&getSelection()||''))return;
      var section=e.target.closest('.para');if(!section)return;
      var idx=[].indexOf.call(paraSections(),section);
      if(idx>=0)setFocusPara(idx,false);
    };
    byId('textDocument').querySelectorAll('[data-note-area]').forEach(function(ta){ ta.oninput=function(){ var c=find(currentId),i=ta.dataset.noteArea,map=ta.dataset.noteScope==='reader'?c.readerNotes:c.notes;if(ta.value.trim())map[i]=ta.value;else delete map[i];touch(c);renderNoteIndex(); }; });
  }
  function reviewerDate(value){if(!value)return '';try{return new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric'}).format(new Date(value));}catch(e){return '';}}
  function reviewerById(ch,id){return (ch&&ch.reviewComments||[]).find(function(comment){return comment.id===id;});}
  function reviewOrdinal(ch,comment){var at=(ch&&ch.reviewComments||[]).indexOf(comment);return at>=0?at+1:'?';}
  var REVIEW_LOCATION_FIELDS=['para','page','start','end','quote','anchors','pdfAnchors','anchored','anchorMethod','matchConfidence','locatedProvider','locationStatus','manualReviewLink','manualLocationRejected'];
  function cloneReviewLocationValue(value){return value&&typeof value==='object'?JSON.parse(JSON.stringify(value)):value;}
  function reviewLocationSnapshot(comment){var snapshot={};REVIEW_LOCATION_FIELDS.forEach(function(field){snapshot[field]=cloneReviewLocationValue(comment[field]);});return snapshot;}
  function applyReviewLocationSnapshot(comment,snapshot){REVIEW_LOCATION_FIELDS.forEach(function(field){if(snapshot[field]===undefined)delete comment[field];else comment[field]=cloneReviewLocationValue(snapshot[field]);});comment.updatedAt=now();}
  function preserveManualReviewLocation(comment,prior){if(!prior||!prior.manualReviewLink)return false;applyReviewLocationSnapshot(comment,reviewLocationSnapshot(prior));return true;}
  function reviewNormalizedText(value){
    value=String(value||'');try{value=value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'');}catch(e){}
    return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
  }
  function reviewQuoteRange(text,quote){
    text=String(text||'');quote=String(quote||'').trim();if(!text||!quote)return null;
    var at=text.toLowerCase().indexOf(quote.toLowerCase());if(at>=0)return{start:at,end:at+quote.length,quote:text.slice(at,at+quote.length)};
    var words=reviewNormalizedText(quote).split(' ').filter(function(word){return word.length>1;});
    for(var width=Math.min(14,words.length);width>=Math.min(4,words.length);width--){
      for(var i=0;i+width<=words.length;i++){
        var pattern=words.slice(i,i+width).map(function(word){return word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('[^\\p{L}\\p{N}]+'),match;
        try{match=text.match(new RegExp(pattern,'iu'));}catch(e){match=null;}
        if(match&&match.index!==undefined)return{start:match.index,end:match.index+match[0].length,quote:match[0]};
      }
    }
    return null;
  }
  function reviewSentenceRanges(text){
    text=String(text||'');var ranges=[];function keep(start,end){while(start<end&&/\s/.test(text[start]))start++;while(end>start&&/\s/.test(text[end-1]))end--;if(end>start)ranges.push({start:start,end:end,quote:text.slice(start,end)});}
    try{if(typeof Intl!=='undefined'&&Intl.Segmenter){var segments=new Intl.Segmenter(undefined,{granularity:'sentence'}).segment(text);for(var segment of segments)keep(segment.index,segment.index+segment.segment.length);if(ranges.length)return ranges;}}catch(e){}
    var re=/[^.!?。！？]+(?:[.!?。！？]+(?=\s|$)|$)/g,match;while((match=re.exec(text)))keep(match.index,match.index+match[0].length);return ranges;
  }
  function reviewSentenceRange(text,range,comment){
    text=String(text||'');if(!range||!text)return range;var terms=reviewSearchTerms(comment),best=null,bestScore=-1;
    reviewSentenceRanges(text).forEach(function(sentence){var overlap=Math.max(0,Math.min(range.end,sentence.end)-Math.max(range.start,sentence.start));if(!overlap)return;var normalized=reviewNormalizedText(sentence.quote),score=overlap;terms.forEach(function(term){if(normalized.indexOf(term)>=0)score+=24+Math.min(18,term.length*1.5);});if(score>bestScore){best=sentence;bestScore=score;}});return best||range;
  }
  function reviewParagraphPage(ch,para){
    var starts=paraPageStarts(ch),page=null;if(!starts)return null;
    starts.forEach(function(item){if(item.para<=para)page=item.page;});return page;
  }
  function reviewCommentPage(ch,comment){
    var pdfAnchors=reviewPdfAnchors(ch,comment);if(pdfAnchors.length)return pdfAnchors[0].page;
    if(comment&&comment.page)return +comment.page;
    if(comment&&comment.para!==null&&comment.para!==undefined)return reviewParagraphPage(ch,+comment.para);
    return null;
  }
  function reviewPdfAnchors(ch,comment){
    if(!ch||ch.kind!=='pdf'||!comment)return[];var raw=Array.isArray(comment.pdfAnchors)&&comment.pdfAnchors.length?comment.pdfAnchors:(comment.page?[{page:comment.page,quote:comment.quote||'',confidence:comment.matchConfidence||0,method:comment.anchorMethod||'ai-pdf-page',manual:comment.manualReviewLink}]:[]),seen={};return raw.map(function(anchor){var method=String(anchor.method||'ai-pdf-page');return{page:+anchor.page||null,quote:String(anchor.quote||''),confidence:Math.max(0,Math.min(1,+anchor.confidence||0)),method:method,manual:!!anchor.manual||method.indexOf('manual-')===0};}).filter(function(anchor){var key=anchor.page+'|'+reviewNormalizedText(anchor.quote);if(!anchor.page||seen[key])return false;seen[key]=1;return true;});
  }
  function reviewPdfAnchorOnPage(ch,comment,page){return reviewPdfAnchors(ch,comment).find(function(anchor){return anchor.page===+page;})||null;}
  function pdfReviewSpanNeedsSpace(left,right){
    if(!left||!right)return true;var a=left.getBoundingClientRect(),b=right.getBoundingClientRect(),height=Math.min(a.height,b.height);if(!a.width||!b.width||!height)return true;var sameLine=Math.abs((a.top+a.bottom)/2-(b.top+b.bottom)/2)<=Math.max(a.height,b.height)*.42,gap=b.left-a.right;return!sameLine||gap>Math.max(2,height*.14)||gap< -Math.max(2,height*.1);
  }
  function pdfReviewSpanMatch(view,quote){
    if(!view||!view.text||!quote)return[];var entries=[],joined='',cursor=0,previous=null;
    view.text.querySelectorAll('span').forEach(function(span){if(span.querySelector&&span.querySelector('span'))return;var value=reviewNormalizedText(span.textContent);if(!value)return;if(joined&&pdfReviewSpanNeedsSpace(previous,span)){joined+=' ';cursor++;}var start=cursor;joined+=value;cursor=joined.length;entries.push({span:span,start:start,end:cursor});previous=span;});
    var wanted=reviewNormalizedText(quote),at=wanted?joined.indexOf(wanted):-1;if(at<0){var words=wanted.split(' ');for(var width=Math.min(12,words.length);width>=Math.min(4,words.length)&&at<0;width--)for(var i=0;i+width<=words.length;i++){var phrase=words.slice(i,i+width).join(' '),found=joined.indexOf(phrase);if(found>=0){wanted=phrase;at=found;break;}}}
    if(at<0)return[];var end=at+wanted.length;return entries.filter(function(entry){return entry.end>at&&entry.start<end;}).map(function(entry){return entry.span;});
  }
  function pdfReviewRects(view,spans){
    var base=view&&view.holder&&view.holder.getBoundingClientRect();if(!base||!base.width||!base.height)return[];
    return mergeHighlightRects((spans||[]).map(function(span){var rect=span.getBoundingClientRect(),x=Math.max(0,(rect.left-base.left-1.5)/base.width),y=Math.max(0,(rect.top-base.top+rect.height*.12)/base.height);return{x:x,y:y,w:Math.min(1-x,(rect.width+3)/base.width),h:Math.min(1-y,(rect.height*.76)/base.height)};}).filter(function(rect){return rect.w>0&&rect.h>0&&rect.x<1&&rect.y<1;}));
  }
  function renderPdfReviewMarkers(ch,pageNum,view){
    view.reviewHits=[];var pageOnly=0,comments=(ch.reviewComments||[]).filter(function(comment){return !comment.resolved&&comment.anchored&&reviewPdfAnchorOnPage(ch,comment,pageNum);});
    comments.forEach(function(comment){reviewPdfAnchors(ch,comment).filter(function(anchor){return anchor.page===+pageNum;}).forEach(function(anchor){var spans=anchor.quote?pdfReviewSpanMatch(view,anchor.quote):[],rects=pdfReviewRects(view,spans),pageMarker=!rects.length;if(pageMarker){rects=[{x:.935,y:.026+pageOnly*.044,w:.052,h:.032}];pageOnly++;}var number=(ch.reviewComments||[]).indexOf(comment)+1;view.reviewHits.push({comment:comment,anchor:anchor,page:+pageNum,rects:rects});rects.forEach(function(rect,index){var marker=document.createElement('div');marker.className=(pageMarker?'review-page-marker':'review-comment-highlight')+' review-level-'+normalizeReviewLevel(comment.level,comment)+(index===0?' review-marker-first':'');marker.dataset.reviewLabel='R'+number;marker.dataset.reviewCommentId=comment.id;marker.dataset.reviewPage=pageNum;marker.title='Open reviewer comment R'+number;marker.style.left=(rect.x*100)+'%';marker.style.top=(rect.y*100)+'%';marker.style.width=(rect.w*100)+'%';marker.style.height=(rect.h*100)+'%';view.highlights.appendChild(marker);});});});
  }
  function refreshPdfReviewMarkers(){if(readerMode!=='pdf')return;renderedPages.slice().forEach(function(page){renderPdfHighlights(page);});}
  function clearPdfReviewFocus(){document.querySelectorAll('.review-focus-span').forEach(function(span){span.classList.remove('review-focus-span','review-focus-general','review-focus-section','review-focus-specific','review-focus-editorial');});}
  function focusedPdfReviewAnchor(ch,comment,page){
    var anchors=reviewPdfAnchors(ch,comment),chosen=reviewFocusAnchorIndex>=0?anchors[reviewFocusAnchorIndex]:null;return chosen&&chosen.page===+page?chosen:(anchors.find(function(anchor){return anchor.page===+page;})||null);
  }
  function renderPdfReviewFocus(pageNum){
    var ch=find(currentId),comment=reviewerById(ch,reviewFocusId),anchor=focusedPdfReviewAnchor(ch,comment,pageNum);if(!ch||!comment||readerMode!=='pdf'||!anchor||(reviewFocusPage&&reviewFocusPage!==+pageNum))return;clearPdfReviewFocus();if(!anchor.quote)return;
    var tries=0;(function attempt(){
      var view=pdfViews[pageNum-1];if(!view||!view.rendered){if(view)renderPdfPageAt(pageNum);if(tries++<24)setTimeout(attempt,180);return;}
      var focusClass='review-focus-'+normalizeReviewLevel(comment.level,comment);pdfReviewSpanMatch(view,anchor.quote).forEach(function(span){span.classList.add('review-focus-span',focusClass);});
    })();
  }
  function scrollPdfReviewPassage(ch,comment,page,anchor){
    return new Promise(function(resolve){var tries=0;
      function attempt(){
        if(currentId!==ch.id||readerMode!=='pdf'||reviewFocusId!==comment.id){resolve(false);return;}
        var view=pdfViews[page-1];
        if(!view||!view.rendered){if(view)renderPdfPageAt(page);else renderPdfPage();if(tries++<36){setTimeout(attempt,160);return;}resolve(false);return;}
        var spans=anchor&&anchor.quote?pdfReviewSpanMatch(view,anchor.quote):[];if(!spans.length){resolve(false);return;}
        clearPdfReviewFocus();var focusClass='review-focus-'+normalizeReviewLevel(comment.level,comment);spans.forEach(function(span){span.classList.add('review-focus-span',focusClass);});
        var bounds=spans.map(function(span){return span.getBoundingClientRect();}).reduce(function(box,rect){return{left:Math.min(box.left,rect.left),top:Math.min(box.top,rect.top),right:Math.max(box.right,rect.right),bottom:Math.max(box.bottom,rect.bottom)};},{left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity}),pane=byId('documentPane'),paneRect=pane.getBoundingClientRect(),height=Math.max(1,bounds.bottom-bounds.top),width=Math.max(1,bounds.right-bounds.left),top=pane.scrollTop+bounds.top-paneRect.top-(pane.clientHeight-height)/2,left=pane.scrollLeft;
        if(bounds.left<paneRect.left+18||bounds.right>paneRect.right-18)left=pane.scrollLeft+bounds.left-paneRect.left-(pane.clientWidth-width)/2;
        pane.scrollTo({top:Math.max(0,top),left:Math.max(0,left),behavior:'smooth'});resolve(true);
      }
      setTimeout(attempt,columnBookFlow()?420:0);
    });
  }
  async function focusReviewerPassage(ch,id,pageOverride,anchorOverride){
    var comment=reviewerById(ch,id);if(!comment||!comment.anchored)return;clearPdfReviewFocus();reviewFocusId=id;
    if(ch.kind==='pdf'){
      var anchors=reviewPdfAnchors(ch,comment),anchorIndex=Number.isInteger(anchorOverride)&&anchorOverride>=0?anchorOverride:-1,chosen=anchorIndex>=0?anchors[anchorIndex]:null,page=chosen&&chosen.page||+pageOverride||reviewCommentPage(ch,comment);if(!page)return;if(!chosen){anchorIndex=anchors.findIndex(function(anchor){return anchor.page===page;});chosen=anchors[anchorIndex];}if(!chosen)return;reviewFocusPage=page;reviewFocusAnchorIndex=anchorIndex;if(innerWidth<=720)toggleSheet(false);await gotoPdfPage(page,'auto');renderPdfReviewFocus(page);await scrollPdfReviewPassage(ch,comment,page,chosen);return;
    }
    var textAnchors=Array.isArray(comment.anchors)&&comment.anchors.length?comment.anchors:[comment],textIndex=Number.isInteger(anchorOverride)&&anchorOverride>=0?Math.min(anchorOverride,textAnchors.length-1):0,textAnchor=textAnchors[textIndex]||comment;reviewFocusPage=0;reviewFocusAnchorIndex=textIndex;
    renderText(ch);
    jumpToParagraph(+textAnchor.para);requestAnimationFrame(function(){var anchors=byId('textDocument').querySelectorAll('[data-review-comment-id="'+CSS.escape(id)+'"]'),anchor=anchors[textIndex]||anchors[0];if(anchor)anchor.scrollIntoView({block:'center',behavior:'smooth'});});if(innerWidth<=720)toggleSheet(false);
  }
  function showReviewerComment(ch,id,pageOverride){
    var comment=reviewerById(ch,id);if(!comment)return;if(reviewFilter!=='all'&&reviewFilter!==normalizeReviewLevel(comment.level,comment))reviewFilter='all';reviewFocusId=id;reviewFocusPage=+pageOverride||reviewCommentPage(ch,comment)||0;reviewFocusAnchorIndex=reviewPdfAnchors(ch,comment).findIndex(function(anchor){return anchor.page===reviewFocusPage;});renderReviewerPanel(ch);switchTab('reviewsPanel');if(innerWidth<=720)toggleSheet(true);else setNotebookCollapsed(false,true);
    requestAnimationFrame(function(){var card=byId('readerReviewList').querySelector('[data-review-card="'+CSS.escape(id)+'"]');if(card)card.scrollIntoView({block:'nearest',behavior:'smooth'});byId('textDocument').querySelectorAll('.review-comment-anchor').forEach(function(anchor){anchor.classList.toggle('is-focused',anchor.dataset.reviewCommentId===id);});if(ch.kind==='pdf'&&readerMode==='pdf'&&reviewFocusPage)renderPdfReviewFocus(reviewFocusPage);});
  }
  function reviewManuscriptText(ch){return ch&&ch.kind==='pdf'?(ch.readerText||ch.fr||''):(ch&&ch.fr||'');}
  function reviewSearchTerms(comment){
    var stop={about:1,after:1,again:1,also:1,author:1,because:1,before:1,being:1,between:1,could:1,figure:1,from:1,have:1,into:1,manuscript:1,more:1,other:1,paper:1,please:1,reviewer:1,should:1,study:1,table:1,than:1,that:1,their:1,there:1,these:1,they:1,this:1,those:1,through:1,using:1,what:1,when:1,where:1,which:1,while:1,would:1};
    var raw=[comment&&comment.text,comment&&comment.locationHint].filter(Boolean).join(' '),seen={},terms=[];(reviewNormalizedText(raw).match(/[\p{L}\p{N}]{4,}/gu)||[]).forEach(function(word){if(!stop[word]&&!seen[word]){seen[word]=1;terms.push(word);}});return terms.slice(0,42);
  }
  function reviewLocalPdfQuote(text,comment){
    text=String(text||'').replace(/\s+/g,' ').trim();if(!text)return'';
    var raw=String([comment&&comment.text,comment&&comment.locationHint].filter(Boolean).join(' ')),quoted=[],match,quoteRe=/[“"]([^”"]{16,360})[”"]/g;
    while((match=quoteRe.exec(raw)))quoted.push(match[1]);
    for(var q=0;q<quoted.length;q++){var direct=reviewQuoteRange(text,quoted[q]);if(direct)return direct.quote;}
    var terms=reviewSearchTerms(comment),targets=(raw.match(/(?:fig(?:ure)?|table|eq(?:uation)?|section)\s*[sS]?\d+(?:\.\d+)*/gi)||[]).map(reviewNormalizedText);if(!terms.length&&!targets.length)return'';
    var candidates=[],sentences=text.match(/[^.!?。！？]+[.!?。！？]?/g)||[text];
    sentences.forEach(function(sentence){
      sentence=sentence.trim();if(sentence.length<22)return;if(sentence.length<=460){candidates.push(sentence);return;}
      var words=[],wordRe=/\S+/g,w;while((w=wordRe.exec(sentence)))words.push({start:w.index,end:w.index+w[0].length});
      for(var start=0;start<words.length;start+=20){var end=Math.min(words.length,start+42);if(end-start<6)break;candidates.push(sentence.slice(words[start].start,words[end-1].end));if(end===words.length)break;}
    });
    var best='',bestScore=0,bestHits=0,bestTarget=false;
    candidates.forEach(function(candidate){var normalized=reviewNormalizedText(candidate),hits=0,score=0,targetHit=false;terms.forEach(function(term){if(normalized.indexOf(term)>=0){hits++;score+=1+Math.min(2.5,term.length/7);}});targets.forEach(function(target){if(target&&normalized.indexOf(target)>=0){targetHit=true;score+=9;}});if(candidate.length>360)score-=1;if(score>bestScore){best=candidate;bestScore=score;bestHits=hits;bestTarget=targetHit;}});
    if(!bestTarget&&(bestHits<2||bestScore<4.2))return'';return best.slice(0,460).trim();
  }
  function repairPdfReviewQuotes(ch,pageOnly){
    if(!ch||ch.kind!=='pdf'||!Array.isArray(ch.reviewComments)||!Array.isArray(ch.pageTexts))return false;var changed=false;
    ch.reviewComments.forEach(function(comment){if(!reviewCanAutoLocate(comment))return;var anchors=Array.isArray(comment.pdfAnchors)?comment.pdfAnchors:[];anchors.forEach(function(anchor,index){var page=+anchor.page||0;if(!page||pageOnly&&page!==+pageOnly)return;var full=String(ch.pageTexts[page-1]||''),range=anchor.quote?reviewQuoteRange(full,anchor.quote):null;if(!range){var local=reviewLocalPdfQuote(full,comment);if(local){range=reviewQuoteRange(full,local);anchor.method='local-pdf-quote';}}if(!range)return;range=reviewSentenceRange(full,range,comment);if(anchor.quote!==range.quote){anchor.quote=range.quote;changed=true;}if(index===0&&comment.quote!==range.quote){comment.quote=range.quote;comment.anchorMethod=anchor.method;changed=true;}});});return changed;
  }
  function reviewExplicitPages(comment,pageCount){
    var raw=[comment&&comment.locationHint,comment&&comment.text].filter(Boolean).join(' '),pages=[],seen={},match,re=/(?:\bp{1,2}\.?|\bpages?)\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?/gi;
    while((match=re.exec(raw))){var context=raw.slice(Math.max(0,match.index-90),match.index).toLowerCase(),supplementAt=Math.max(context.lastIndexOf('supplement'),context.lastIndexOf('appendix'),context.lastIndexOf('supporting information')),mainAt=Math.max(context.lastIndexOf('main manuscript'),context.lastIndexOf('main text'));if(supplementAt>mainAt)continue;var first=+match[1],last=+match[2]||first;if(last-first>6)last=first;for(var n=first;n<=last;n++)if(n>=1&&n<=pageCount&&!seen[n]){seen[n]=1;pages.push(n);}}
    return pages;
  }
  function reviewPageExcerpt(text,terms){
    text=String(text||'');if(text.length<=1500)return text;var best=0,bestScore=-1;
    for(var start=0;start<text.length;start+=650){var sample=reviewNormalizedText(text.slice(start,start+1500)),score=0;terms.forEach(function(term){if(sample.indexOf(term)>=0)score+=1+Math.min(2,term.length/8);});if(score>bestScore){bestScore=score;best=start;}}
    return text.slice(Math.max(0,best-100),Math.min(text.length,best+1500));
  }
  function reviewCandidatePdfPages(ch,comment){
    var pages=ch.pageTexts||[],terms=reviewSearchTerms(comment),explicit=reviewExplicitPages(comment,pages.length),explicitMap={};explicit.forEach(function(page){explicitMap[page]=1;});
    var targets=String([comment.text,comment.locationHint].filter(Boolean).join(' ')).match(/(?:fig(?:ure)?|table|eq(?:uation)?|section)\s*[sS]?\d+(?:\.\d+)*/gi)||[];
    var ranked=pages.map(function(text,index){var normalized=reviewNormalizedText(text),score=explicitMap[index+1]?120:0;terms.forEach(function(term){if(normalized.indexOf(term)>=0)score+=1+Math.min(2,term.length/8);});targets.forEach(function(target){if(normalized.indexOf(reviewNormalizedText(target))>=0)score+=22;});return{page:index+1,text:String(text||''),score:score};});
    ranked.sort(function(a,b){return b.score-a.score||a.page-b.page;});var picked=[],seen={};explicit.concat(ranked.slice(0,8).map(function(item){return item.page;})).forEach(function(page){if(!seen[page]&&pages[page-1]){seen[page]=1;picked.push(ranked.find(function(item){return item.page===page;}));}});
    return picked.slice(0,10).map(function(item){return{page:item.page,text:reviewPageExcerpt(item.text,terms),score:item.score};});
  }
  function reviewCandidateParagraphs(ch,comment){
    var words=reviewSearchTerms(comment),wanted={};words.forEach(function(word){wanted[word]=1;});
    var all=paras(reviewManuscriptText(ch)).map(function(text,index){var score=0;(text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)||[]).forEach(function(word){if(wanted[word])score++;});return{index:index,text:text,score:score};}),picked=all.slice().sort(function(a,b){return b.score-a.score||a.index-b.index;}).slice(0,16),seen={};picked.forEach(function(item){seen[item.index]=1;});
    for(var i=0;i<8&&all.length;i++){var sample=all[Math.min(all.length-1,Math.round(i*(all.length-1)/7))];if(!seen[sample.index]){picked.push(sample);seen[sample.index]=1;}}
    return picked.slice(0,24).sort(function(a,b){return a.index-b.index;});
  }
  function reviewAiJson(value){var text=String(value||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');try{return JSON.parse(text);}catch(e){}var start=text.indexOf('{'),end=text.lastIndexOf('}');if(start>=0&&end>start)return JSON.parse(text.slice(start,end+1));return null;}
  function applyPdfReviewMatches(ch,prepared,rawMatches,provider){
    var comment=prepared.comment,pageCandidates=prepared.candidates,explicit=prepared.explicit,valid=[],seen={};
    (rawMatches||[]).slice(0,4).forEach(function(match){var page=match&&Number.isInteger(+match.page)?+match.page:null,allowed=pageCandidates.some(function(item){return item.page===page;}),confidence=match&&match.confidence!==undefined?+match.confidence:.65;if(!page||!allowed||confidence<.55)return;var full=String((ch.pageTexts||[])[page-1]||''),range=reviewQuoteRange(full,match.quote||''),fallback=range?null:reviewLocalPdfQuote(full,comment);if(!range&&fallback)range=reviewQuoteRange(full,fallback);if(range)range=reviewSentenceRange(full,range,comment);if(!range&&explicit.indexOf(page)<0)return;var key=page+'|'+reviewNormalizedText(range&&range.quote||'');if(seen[key])return;seen[key]=1;valid.push({page:page,quote:range?range.quote:'',confidence:Math.max(0,Math.min(1,fallback?Math.min(confidence,.68):confidence)),method:range?(fallback?'local-pdf-quote':'ai-pdf-quote'):'review-page-reference'});});
    explicit.forEach(function(page){if(!valid.some(function(anchor){return anchor.page===page;})){var full=String((ch.pageTexts||[])[page-1]||''),quote=reviewLocalPdfQuote(full,comment),range=quote?reviewSentenceRange(full,reviewQuoteRange(full,quote),comment):null;valid.push({page:page,quote:range?range.quote:'',confidence:range ? .68 : 1,method:range?'local-pdf-quote':'review-page-reference'});}});valid.sort(function(a,b){var refA=a.method==='review-page-reference'?1:0,refB=b.method==='review-page-reference'?1:0;return refA-refB||explicit.indexOf(a.page)-explicit.indexOf(b.page)||a.page-b.page;});if(!valid.length)return false;
    var primary=valid[0];comment.pdfAnchors=valid;comment.page=primary.page;comment.para=null;comment.start=0;comment.end=0;comment.quote=primary.quote;comment.anchors=[];comment.anchored=true;comment.anchorMethod=primary.method;comment.matchConfidence=Math.min.apply(null,valid.map(function(anchor){return anchor.confidence;}));comment.locatedProvider=provider||'Reviewer reference';comment.updatedAt=now();return true;
  }
  function applyTextReviewMatch(ch,prepared,match,provider){
    var comment=prepared.comment,candidates=prepared.candidates,index=match&&match.paragraph!==null&&match.paragraph!==undefined&&Number.isInteger(+match.paragraph)?+match.paragraph:null,allowedIndex=candidates.some(function(item){return item.index===index;}),text=index===null?'':paras(reviewManuscriptText(ch))[index]||'',confidence=match&&match.confidence!==undefined?+match.confidence:.65,range=reviewQuoteRange(text,match&&match.quote||'');
    if(index===null||!allowedIndex||!text||!range||confidence<.55)return false;comment.para=index;comment.start=range.start;comment.end=range.end;comment.quote=range.quote;comment.anchors=[{para:index,start:range.start,end:range.end,quote:range.quote}];comment.anchored=true;comment.anchorMethod='ai';comment.matchConfidence=Math.max(0,Math.min(1,confidence));comment.locatedProvider=provider||'AI';comment.updatedAt=now();return true;
  }
  function reviewLocationBatches(comments,size){var batches=[];size=Math.max(1,+size||1);for(var start=0;start<comments.length;start+=size)batches.push(comments.slice(start,start+size));return batches;}
  function reviewLocationConfig(routeOverride){var route=routeOverride||activeAiRoute(false),local=route&&route.id==='browser';return{route:route,size:local?1:3,concurrency:local?1:4,label:route&&route.label||'AI'};}
  async function locateReviewBatchWithAi(ch,comments,onProgress,routeOverride){
    if(!comments.length)return 0;var prepared,system,user,result=null,data=null,items=[],byComment={},found=0;
    if(ch.kind==='pdf'){
      prepared=comments.map(function(comment,index){var id=String(comment.id||'review-'+(index+1)),candidates=reviewCandidatePdfPages(ch,comment),explicit=reviewExplicitPages(comment,(ch.pageTexts||[]).length);return{id:id,comment:comment,candidates:candidates,explicit:explicit};});
      system='You locate manuscript passages for several independent reviewer comments. Return exactly one item for every commentId. For each comment, choose only PDF pages listed inside that comment block; never borrow a candidate from another comment. A comment may cite multiple distinct locations, so return every necessary location up to four. Prefer explicit page, figure, table, section, and equation references. Anchor the claim or method being criticized, not merely nearby words. Every match must include one complete exact sentence copied verbatim from its page; use two complete adjacent sentences only when both are necessary. Never begin or end mid-sentence, and never return a page with an empty quote. If you cannot identify an exact passage, or the concern is manuscript-wide or only targets supplementary material not shown, return an empty matches array. Never invent, paraphrase, or choose a merely related passage. Return only JSON: {"items":[{"commentId":"exact supplied id","matches":[{"page":1,"quote":"required complete verbatim sentence","confidence":0.0}]}]}.';
      user=prepared.map(function(item){return '[COMMENT '+item.id+']\nReviewer comment:\n'+item.comment.text+'\n\nLocation hint:\n'+(item.comment.locationHint||'none')+'\n\nAllowed candidate pages for '+item.id+':\n'+item.candidates.map(function(candidate){return '[COMMENT '+item.id+' · PDF page '+candidate.page+']\n'+candidate.text;}).join('\n\n');}).join('\n\n===== NEXT COMMENT =====\n\n');
      try{result=await runAi(system,user,Math.max(1050,comments.length*700),onProgress,routeOverride);data=reviewAiJson(result.text);items=Array.isArray(data&&data.items)?data.items:(comments.length===1&&Array.isArray(data&&data.matches)?[{commentId:prepared[0].id,matches:data.matches}]:[]);}catch(e){}
      var passed={};items.forEach(function(item){if(item&&item.commentId)byComment[String(item.commentId)]=item;});prepared.forEach(function(item){var answer=byComment[item.id],matches=answer&&Array.isArray(answer.matches)?answer.matches:[],accepted=applyPdfReviewMatches(ch,item,matches,result&&result.provider),hasPassage=accepted&&reviewPdfAnchors(ch,item.comment).some(function(anchor){return!!anchor.quote;});if(hasPassage){passed[item.id]=1;found++;}});
      if(comments.length>1)for(var p=0;p<prepared.length;p++)if(!passed[prepared[p].id])found+=await locateReviewBatchWithAi(ch,[prepared[p].comment],onProgress,routeOverride);return found;
    }
    prepared=comments.map(function(comment,index){return{id:String(comment.id||'review-'+(index+1)),comment:comment,candidates:reviewCandidateParagraphs(ch,comment)};});
    system='You locate manuscript passages for several independent reviewer comments. Return exactly one item for every commentId. For each comment, choose only paragraph numbers listed inside that comment block; never borrow a candidate from another comment. Copy a short quote exactly from the chosen paragraph. A manuscript-wide comment may use null. Never invent a quote. Return only JSON: {"items":[{"commentId":"exact supplied id","paragraph":number or null,"quote":"short exact verbatim quote","confidence":0.0}]}.';
    user=prepared.map(function(item){return '[COMMENT '+item.id+']\nReviewer comment:\n'+item.comment.text+'\n\nLocation hint:\n'+(item.comment.locationHint||'none')+'\n\nAllowed candidate paragraphs for '+item.id+':\n'+item.candidates.map(function(candidate){return '['+candidate.index+'] '+candidate.text.slice(0,520);}).join('\n\n');}).join('\n\n===== NEXT COMMENT =====\n\n');
    try{result=await runAi(system,user,Math.max(650,comments.length*430),onProgress,routeOverride);data=reviewAiJson(result.text);items=Array.isArray(data&&data.items)?data.items:(comments.length===1&&data?[Object.assign({commentId:prepared[0].id},data)]:[]);}catch(e){}
    var textPassed={};items.forEach(function(item){if(item&&item.commentId)byComment[String(item.commentId)]=item;});prepared.forEach(function(item){if(applyTextReviewMatch(ch,item,byComment[item.id],result&&result.provider)){textPassed[item.id]=1;found++;}});
    if(comments.length>1)for(var t=0;t<prepared.length;t++)if(!textPassed[prepared[t].id])found+=await locateReviewBatchWithAi(ch,[prepared[t].comment],onProgress,routeOverride);return found;
  }
  async function locateReviewsWithAi(ch,comments,onProgress,routeOverride){
    var config=reviewLocationConfig(routeOverride),batches=reviewLocationBatches(comments,config.size),next=0,done=0,found=0;
    if(!batches.length)return 0;if(onProgress)onProgress('Matching '+comments.length+' comments in '+batches.length+' '+config.label+' batch'+(batches.length===1?'':'es')+'…',0);
    async function worker(){for(;;){var batchIndex=next++;if(batchIndex>=batches.length)return;var batch=batches[batchIndex],batchFound=await locateReviewBatchWithAi(ch,batch,function(message){if(onProgress)onProgress('Match batch '+(batchIndex+1)+' of '+batches.length+' · '+message,done/comments.length);},config.route);found+=batchFound;done+=batch.length;if(onProgress)onProgress('Checked '+Math.min(done,comments.length)+' of '+comments.length+' comments · '+found+' linked…',done/comments.length);}}
    var workers=[],count=Math.min(config.concurrency,batches.length);for(var i=0;i<count;i++)workers.push(worker());await Promise.all(workers);return found;
  }
  function reviewHasVerifiedPassage(ch,comment){if(!comment||!comment.anchored)return false;if(ch&&ch.kind==='pdf'){var anchors=reviewPdfAnchors(ch,comment);return!!anchors.length&&anchors.every(function(anchor){return!!String(anchor.quote||'').trim();});}return!!String(comment.quote||'').trim()&&comment.para!==null&&comment.para!==undefined&&Number.isInteger(+comment.para);}
  function reviewHasManualAnchor(ch,comment){var anchors=ch&&ch.kind==='pdf'?reviewPdfAnchors(ch,comment):(comment&&comment.anchors||[]);return anchors.some(function(anchor){return!!anchor.manual||String(anchor.method||'').indexOf('manual-')===0;});}
  function resetReviewLocation(comment){comment.para=null;comment.page=null;comment.start=0;comment.end=0;comment.quote='';comment.anchors=[];comment.pdfAnchors=[];comment.anchored=false;comment.anchorMethod='';comment.matchConfidence=0;comment.locatedProvider='';comment.updatedAt=now();}
  function setManualReviewPrimary(ch,comment){
    var anchors=ch.kind==='pdf'?reviewPdfAnchors(ch,comment):(Array.isArray(comment.anchors)?comment.anchors:[]);
    if(!anchors.length){resetReviewLocation(comment);comment.manualReviewLink=true;comment.manualLocationRejected=true;comment.locationStatus='needs-checking';return;}
    var primary=anchors[0];comment.anchored=true;comment.manualReviewLink=true;comment.manualLocationRejected=false;comment.para=ch.kind==='pdf'?null:+primary.para;comment.page=ch.kind==='pdf'?+primary.page:null;comment.start=ch.kind==='pdf'?0:+primary.start||0;comment.end=ch.kind==='pdf'?0:+primary.end||0;comment.quote=String(primary.quote||'');comment.anchorMethod=String(primary.method||(ch.kind==='pdf'?'manual-pdf-selection':'manual-text-selection'));comment.matchConfidence=Math.min.apply(null,anchors.map(function(anchor){return Number.isFinite(+anchor.confidence)?+anchor.confidence:1;}));comment.locatedProvider=reviewHasManualAnchor(ch,comment)?'Linked by you':'Adjusted by you';comment.locationStatus='confident';comment.updatedAt=now();
  }
  function syncReviewLinkControls(ch){
    var comment=reviewerById(ch,reviewLinkTargetId),mode=byId('reviewLinkMode'),undo=byId('reviewLinkUndoBtn');
    mode.classList.toggle('hidden',!comment);if(comment)byId('reviewLinkModeText').textContent='Linking R'+reviewOrdinal(ch,comment)+' · select the correct text on '+(ch.kind==='pdf'?'the original PDF':'the manuscript')+', then choose Link.';
    undo.classList.toggle('hidden',!(reviewLinkUndo&&ch&&reviewLinkUndo.chapterId===ch.id));
  }
  function beginReviewerPassageLink(ch,id){
    var comment=reviewerById(ch,id);if(!comment)return;reviewLinkTargetId=id;setHighlightMode(false);clearPendingSelection();if(ch.kind==='pdf'&&readerMode!=='pdf')gotoPdfPage(reviewCommentPage(ch,comment)||currentPage,'auto');renderReviewerPanel(ch);if(innerWidth<=720)toggleSheet(false);showReaderToast('Select the correct passage for R'+reviewOrdinal(ch,comment));
  }
  function removeReviewerPassage(ch,id,index){
    var comment=reviewerById(ch,id);if(!comment)return;reviewLinkUndo={chapterId:ch.id,commentId:id,before:reviewLocationSnapshot(comment),awaitingLink:true};
    if(ch.kind==='pdf'){var pdfAnchors=reviewPdfAnchors(ch,comment);if(index<0||index>=pdfAnchors.length)return;pdfAnchors.splice(index,1);comment.pdfAnchors=pdfAnchors;}
    else{var anchors=Array.isArray(comment.anchors)?comment.anchors.slice():[];if(index<0||index>=anchors.length)return;anchors.splice(index,1);comment.anchors=anchors;}
    setManualReviewPrimary(ch,comment);reviewFocusId='';reviewFocusPage=0;reviewFocusAnchorIndex=-1;reviewLinkTargetId=id;ch.reviewUpdatedAt=now();touch(ch);if(readerMode==='text')renderText(ch);refreshPdfReviewMarkers();clearPdfReviewFocus();renderReviewerPanel(ch);updateReviewBadge();if(innerWidth<=720)toggleSheet(false);showReaderToast('Wrong passage removed · select the correct text');
  }
  function cancelReviewerPassageLink(){var ch=find(currentId);reviewLinkTargetId='';clearPendingSelection();if(ch)renderReviewerPanel(ch);showReaderToast('Passage linking cancelled');}
  function restoreReviewLinkUndo(){
    var undo=reviewLinkUndo,ch=undo&&find(undo.chapterId),comment=undo&&reviewerById(ch,undo.commentId);if(!ch||!comment)return;applyReviewLocationSnapshot(comment,undo.before);reviewLinkUndo=null;reviewLinkTargetId='';ch.reviewUpdatedAt=now();touch(ch);if(currentId===ch.id){if(readerMode==='text')renderText(ch);renderReviewerPanel(ch);refreshPdfReviewMarkers();renderPdfReviewFocus(currentPage);}renderShelf();updateReviewBadge();showReaderToast('Passage change undone');
  }
  function linkSelectionToReview(selection){
    var ch=find(currentId),comment=reviewerById(ch,reviewLinkTargetId);if(!ch||!comment||!selection)return;
    if((ch.kind==='pdf'&&selection.kind!=='pdf')||(ch.kind!=='pdf'&&selection.kind!=='text')){showReaderToast(ch.kind==='pdf'?'Select text on the original PDF':'Select manuscript text');return;}
    function prepareUndo(){if(!(reviewLinkUndo&&reviewLinkUndo.chapterId===ch.id&&reviewLinkUndo.commentId===comment.id&&reviewLinkUndo.awaitingLink))reviewLinkUndo={chapterId:ch.id,commentId:comment.id,before:reviewLocationSnapshot(comment),awaitingLink:false};else reviewLinkUndo.awaitingLink=false;}
    if(ch.kind==='pdf'){
      var page=Math.max(1,+selection.page||currentPage),pageText=String((ch.pageTexts||[])[page-1]||''),range=pageText?reviewQuoteRange(pageText,selection.text):null,quote=String(range&&range.quote||selection.text||'').replace(/\s+/g,' ').trim(),pdfAnchors=reviewPdfAnchors(ch,comment),duplicate=pdfAnchors.some(function(anchor){return anchor.page===page&&reviewNormalizedText(anchor.quote)===reviewNormalizedText(quote);});
      if(!quote||duplicate){showReaderToast(duplicate?'That passage is already linked':'Select readable text on the PDF');return;}prepareUndo();pdfAnchors.push({page:page,quote:quote,confidence:1,method:'manual-pdf-selection',manual:true});comment.pdfAnchors=pdfAnchors;
    }else{
      var textAnchors=Array.isArray(comment.anchors)?comment.anchors.slice():[],textKey=reviewNormalizedText(selection.text),textDuplicate=textAnchors.some(function(anchor){return +anchor.para===+selection.para&&+anchor.start===+selection.start&&+anchor.end===+selection.end;});
      if(!textKey||textDuplicate){showReaderToast(textDuplicate?'That passage is already linked':'Select readable manuscript text');return;}prepareUndo();textAnchors.push({para:+selection.para,start:+selection.start,end:+selection.end,quote:String(selection.text||''),confidence:1,method:'manual-text-selection',manual:true});comment.anchors=textAnchors;
    }
    setManualReviewPrimary(ch,comment);reviewFocusId=comment.id;reviewFocusPage=ch.kind==='pdf'?+selection.page||currentPage:0;reviewFocusAnchorIndex=ch.kind==='pdf'?reviewPdfAnchors(ch,comment).length-1:(comment.anchors||[]).length-1;reviewLinkTargetId='';ch.reviewUpdatedAt=now();touch(ch);clearPendingSelection();if(readerMode==='text')renderText(ch);renderReviewerPanel(ch);refreshPdfReviewMarkers();if(ch.kind==='pdf')renderPdfReviewFocus(reviewFocusPage);renderShelf();updateReviewBadge();showReaderToast('Linked selected text to R'+reviewOrdinal(ch,comment));
  }
  function reviewQuotedPassages(comment){
    var raw=String([comment&&comment.text,comment&&comment.locationHint].filter(Boolean).join(' ')),found=[],seen={},match,re=/[“"]([^”"]{18,600})[”"]/g;while((match=re.exec(raw))){var quote=String(match[1]||'').replace(/\s+/g,' ').trim(),key=reviewNormalizedText(quote);if(key&&!seen[key]){seen[key]=1;found.push(quote);}}return found.slice(0,4);
  }
  function locateReviewFromExactQuote(ch,comment){
    var quotes=reviewQuotedPassages(comment);if(!quotes.length||!reviewCanAutoLocate(comment))return false;
    if(ch.kind==='pdf'){
      var pageTexts=ch.pageTexts||[],explicit=reviewExplicitPages(comment,pageTexts.length),pages=explicit.length?explicit:pageTexts.map(function(_,index){return index+1;}),matches=[];
      quotes.forEach(function(quote){var wanted=reviewNormalizedText(quote),hits=[];pages.forEach(function(page){var full=String(pageTexts[page-1]||'');if(wanted&&reviewNormalizedText(full).indexOf(wanted)>=0)hits.push({page:page,quote:quote,confidence:.99});});if(hits.length===1)matches.push(hits[0]);});
      if(!matches.length)return false;var candidates=matches.map(function(match){return{page:match.page,text:String(pageTexts[match.page-1]||'')};});return applyPdfReviewMatches(ch,{comment:comment,candidates:candidates,explicit:explicit},matches,'Exact manuscript text');
    }
    var paragraphs=paras(reviewManuscriptText(ch)),textMatches=[];quotes.forEach(function(quote){var wanted=reviewNormalizedText(quote),hits=[];paragraphs.forEach(function(text,index){if(wanted&&reviewNormalizedText(text).indexOf(wanted)>=0)hits.push({paragraph:index,quote:quote,confidence:.99});});if(hits.length===1)textMatches.push(hits[0]);});if(!textMatches.length)return false;var chosen=textMatches[0],prepared={comment:comment,candidates:[{index:chosen.paragraph,text:paragraphs[chosen.paragraph]}]};return applyTextReviewMatch(ch,prepared,chosen,'Exact manuscript text');
  }
  function finalizeReviewLocationConfidence(ch,comments){
    (comments||[]).forEach(function(comment){if(!reviewCanAutoLocate(comment))return;var confident=reviewHasVerifiedPassage(ch,comment)&&Number.isFinite(+comment.matchConfidence)&&+comment.matchConfidence>=.72;if(!confident)resetReviewLocation(comment);comment.locationStatus=confident?'confident':'needs-checking';});
  }
  function reviewLocationSummary(ch,comments){
    var matchable=(comments||[]).filter(function(comment){return reviewCanAutoLocate(comment)||comment.manualReviewLink;}),confident=matchable.filter(function(comment){return reviewHasVerifiedPassage(ch,comment)&&comment.locationStatus!=='needs-checking'&&+comment.matchConfidence>=.72;}).length,exact=matchable.filter(function(comment){return comment.locatedProvider==='Exact manuscript text'&&reviewHasVerifiedPassage(ch,comment);}).length;
    return{matchable:matchable.length,confident:confident,needsChecking:Math.max(0,matchable.length-confident),exactMatched:exact};
  }
  async function locateReviewsBalanced(ch,comments,onProgress,plan){
    plan=plan||await reviewAiPlan();if(!plan.location)throw aiSetupError('Set up on-device Gemini or a cloud AI in Desk settings first.');comments=comments||[];
    var exact=0;comments.forEach(function(comment){if(locateReviewFromExactQuote(ch,comment))exact++;});var remaining=comments.filter(function(comment){return!reviewHasVerifiedPassage(ch,comment);}),base=exact?Math.min(.18,exact/Math.max(1,comments.length)*.35):0;if(onProgress&&exact)onProgress('Matched '+exact+' quoted passage'+(exact===1?'':'s')+' directly from the manuscript…',base);
    if(remaining.length)await locateReviewsWithAi(ch,remaining,function(message,progress){if(onProgress)onProgress(message,base+(Number.isFinite(progress)?progress:0)*(1-base));},plan.location);
    finalizeReviewLocationConfidence(ch,comments);var summary=reviewLocationSummary(ch,comments);summary.primaryLabel=plan.location.label;return summary;
  }
  async function locateOneReviewWithAi(ch,comment,onProgress,routeOverride){return(await locateReviewBatchWithAi(ch,[comment],onProgress,routeOverride))>0;}
  async function reviewReportText(file){
    if(/\.docx$/i.test(file.name||'')){var parsed=await parseDocx(await file.arrayBuffer(),file.name),roles=parsed.paragraphRoles||[],reviewerRuns=roles.filter(function(role){return role==='reviewer';}).length,responseRuns=roles.filter(function(role){return role==='response';}).length,structured=reviewerRuns>=2&&responseRuns>=1&&reviewerRuns>=roles.length*.2,body=parsed.paragraphs.map(function(paragraph,index){return structured?'['+(roles[index]==='reviewer'?'REVIEWER TEXT':'AUTHOR RESPONSE')+'] '+paragraph:paragraph;}).join('\n\n'),bubbles=(parsed.comments||[]).map(function(comment){return (comment.author||'Reviewer')+': '+comment.text;}).join('\n\n');return [body,bubbles].filter(Boolean).join('\n\nReviewer comments:\n\n');}
    return file.text();
  }
  function reviewReportChunks(text){
    var paragraphs=paras(text),limit=8800,chunks=[],current='',reviewer='';
    function flush(){if(current.trim())chunks.push(current.trim());current='';}
    paragraphs.forEach(function(paragraph){
      var heading=paragraph.replace(/^\[(?:REVIEWER TEXT|AUTHOR RESPONSE)\]\s*/i,'');if(/^reviewer\s+\d+/i.test(heading))reviewer=heading.split('\n')[0].slice(0,160);
      var pieces=[];while(paragraph.length>limit){var at=paragraph.lastIndexOf('\n',limit);if(at<limit*.45)at=paragraph.lastIndexOf('. ',limit);if(at<limit*.45)at=limit;pieces.push(paragraph.slice(0,at+1));paragraph=paragraph.slice(at+1).trim();}if(paragraph)pieces.push(paragraph);
      pieces.forEach(function(piece){var prefix=reviewer?'Reviewer context: '+reviewer+'\n\n':'';if(current&&current.length+piece.length+2>limit)flush();if(!current&&prefix)current=prefix;current+=(current?'\n\n':'')+piece;});
    });flush();return chunks;
  }
  function reviewReportUnits(text){
    var paragraphs=paras(text),units=[],current=null,reviewer='Reviewer',group='',serial=0,hasRoles=/\[(?:REVIEWER TEXT|AUTHOR RESPONSE)\]/i.test(text),numbered=0;
    function finish(){if(!current)return;current.text=String(current.text||'').trim();current.response=String(current.response||'').trim();if(current.text)units.push(current);current=null;}
    function begin(content,number){current={inputId:'review-'+(++serial),reviewer:reviewer,group:group,number:number||'',text:content,response:''};if(number)numbered++;}
    paragraphs.forEach(function(paragraph){
      var roleMatch=paragraph.match(/^\[(REVIEWER TEXT|AUTHOR RESPONSE)\]\s*/i),role=roleMatch&&/AUTHOR/i.test(roleMatch[1])?'response':'reviewer',content=paragraph.replace(/^\[(?:REVIEWER TEXT|AUTHOR RESPONSE)\]\s*/i,'').trim(),heading,section,rest,number;
      if(!content)return;
      heading=content.match(/^reviewer\s+(\d+)\b/i);if(heading){finish();reviewer='Reviewer '+heading[1];group='';return;}
      if(/^(?:comments?\s+(?:for|to)\s+(?:the\s+)?authors?|manuscript\s*:)/i.test(content)||/^please see the attached pdf/i.test(content))return;
      if(/^page\s+\d+\s*$/i.test(content))return;
      if(/^reply to comment\s*$/i.test(content)){finish();return;}
      section=content.match(/^(major concerns|minor comments|recommendations for strengthening the analysis|internal inconsistencies and corrections|closing comment)\b\s*[:.-]?\s*(.*)$/i);
      if(section){finish();group=section[1];rest=String(section[2]||'').trim();if(!rest)return;content=rest;}
      if(role==='response'&&hasRoles){if(current)current.response+=(current.response?'\n\n':'')+content;return;}
      number=content.match(/^(\d{1,3})\.\s*(.*)$/s);if(number){finish();begin((number[1]+'. '+number[2]).trim(),number[1]);return;}
      if(current&&current.response)finish();
      if(current&&current.number)current.text+='\n\n'+content;
      else{finish();begin(content,'');}
    });finish();units.numberedCount=numbered;units.hasRoles=hasRoles;return units;
  }
  function fallbackReviewLevel(unit){var text=[unit&&unit.group,unit&&unit.text].join(' ');if(/minor comments|internal inconsistencies|typo|grammar|spelling|terminology|caption|notation|correct(?:ed|ion)?\b/i.test(text))return'editorial';if(/\b(?:section|subsection)\s+[\dA-Z]/i.test(text)&&!/(?:p{1,2}\.?|pages?|figure|table|equation|eq\.)\s*\d/i.test(text))return'section';if(/(?:p{1,2}\.?|pages?|figure|table|equation|eq\.)\s*\d/i.test(text))return'specific';return'general';}
  function fallbackReviewTopic(unit){var text=String(unit&&unit.text||'');if(/figure|table|caption|plot|diagram/i.test(text))return'figures';if(/statistic|uncertaint|confidence interval|standard deviation|rmse|sample count|replicat|autocorrel/i.test(text))return'statistics';if(/model|parameter|equation|simulation|cfd|kinetic|compartment/i.test(text))return'modeling';if(/method|experiment|protocol|calibrat|probe|measurement/i.test(text))return'methods';if(/reference|citation|literature/i.test(text))return'references';if(/claim|interpret|conclu|predict|validat/i.test(text))return'claims';if(/typo|grammar|spelling|wording|terminology|notation/i.test(text))return'writing';return'other';}
  function fallbackReviewLocation(unit){var text=String(unit&&unit.text||''),found=[],seen={},matches=text.match(/(?:\b(?:p{1,2}\.?|pages?)\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?|\b(?:section|figure|table|equation|eq\.)\s*[A-Z]?\d+(?:\.\d+)?)/gi)||[];matches.forEach(function(value){var key=value.toLowerCase();if(!seen[key]&&found.length<4){seen[key]=1;found.push(value);}});return found.join(' · ');}
  function reviewHasLocationEvidence(comment){var hint=String(comment&&comment.locationHint||'').trim(),text=[comment&&comment.text,hint].filter(Boolean).join(' ');return!!hint||/(?:\b(?:p{1,2}\.?|pages?)\s*\d{1,3}|\b(?:section|figure|table|equation|eq\.)\s*[A-Z]?\d+(?:\.\d+)?)/i.test(text);}
  function reviewCanAutoLocate(comment){if(comment&&(comment.legacyImport||comment.manualReviewLink))return false;var level=normalizeReviewLevel(comment&&comment.level,comment);return level==='specific'||level==='editorial'||(level==='section'&&reviewHasLocationEvidence(comment));}
  function stabilizedReviewLevel(value,text,locationHint){var level=normalizeReviewLevel(value),raw=String(text||'');if(level==='specific'&&!String(locationHint||'').trim()&&/(?:restructur|reorgan(?:ize|ise)|overall structure|separat\w*\s+(?:the\s+)?(?:experimental|validation|model|presentation|section))/i.test(raw))level='section';return level;}
  /* The model proposes a label; these local signals act as a second reader. They only
     override clear contradictions (a typo called general, a restructure request called
     passage-specific, and so on) or a low-confidence answer. Ambiguous scientific
     concerns remain with the model instead of being flattened by keyword rules. */
  function reviewClassificationSignals(unit){
    var group=String(unit&&unit.group||''),text=String(unit&&unit.text||''),raw=(group+' '+text).toLowerCase(),level='',topic='',reason='';
    var restructure=/(?:restructur|reorgan(?:ize|ise)|separat\w*\s+(?:the\s+)?(?:experimental|validation|model|presentation|section)|overall structure)/i.test(raw);
    var typo=/(?:\btypo(?:graphical)?\b|\bgrammar|\bspelling|\bproofread|language revision|grammatical errors?)/i.test(raw);
    var simpleConsistency=text.length<900&&/(?:discrepanc|inconsisten|incorrectly (?:described|labelled|labeled|stated)|should be corrected|correct this inconsistency)/i.test(raw)&&/(?:correct|revise|replace|consistent|check|fix)/i.test(raw);
    var correctionGroup=/internal inconsistencies and corrections/i.test(group);
    var visualFix=/(?:figure|table)\s*[A-Z]?\d*[^.]{0,220}(?:redesign|re-?draw|caption|label|difficult to interpret|replace)/i.test(text);
    if(correctionGroup||typo||simpleConsistency){level='editorial';reason=correctionGroup?'corrections section':(typo?'explicit language issue':'direct consistency correction');}
    else if(restructure){level='section';reason='broad restructuring request';}
    else if(visualFix){level='specific';reason='named visual correction';}
    if(restructure&&/(?:manuscript|current|overall) structure|separat\w*\s+(?:the\s+)?(?:experimental|validation|model|presentation|section)|readability/i.test(raw))topic='structure';
    else if(typo)topic='writing';
    else if(correctionGroup||simpleConsistency)topic='consistency';
    else if(visualFix)topic='figures';
    else if(/\b(?:citation|reference list|bibliograph|literature reference)\b/i.test(raw))topic='references';
    return{level:level,topic:topic,reason:reason};
  }
  function reviewClassificationAudit(unit,classification){
    classification=classification||{};var text=String(unit&&unit.text||'').trim(),locationHint=String(classification.locationHint||classification.location||fallbackReviewLocation(unit)).trim(),hasModel=!!(classification.level||classification.scope),modelLevel=hasModel?normalizeReviewLevel(classification.level||classification.scope):'',modelTopic=(classification.topic||classification.category)?normalizeReviewTopic(classification.topic||classification.category):'',localLevel=fallbackReviewLevel(unit),localTopic=fallbackReviewTopic(unit),confidence=Number(classification.confidence),signals=reviewClassificationSignals(unit);
    if(!Number.isFinite(confidence))confidence=hasModel ? .65 : 0;confidence=Math.max(0,Math.min(1,confidence));
    var level=modelLevel||localLevel,topic=modelTopic||localTopic,reasons=[];
    if(signals.level&&level!==signals.level){level=signals.level;reasons.push(signals.reason);}
    else if(confidence<.5&&level!==localLevel){level=localLevel;reasons.push('low-confidence scope');}
    level=stabilizedReviewLevel(level,text,locationHint);if(level!==modelLevel&&reasons.indexOf('broad restructuring request')<0&&/(?:restructur|reorgan(?:ize|ise)|overall structure)/i.test(text))reasons.push('broad restructuring request');
    if(signals.topic&&topic!==signals.topic){topic=signals.topic;reasons.push('explicit topic signal');}
    else if(confidence<.5&&topic!==localTopic){topic=localTopic;reasons.push('low-confidence topic');}
    return{level:level,topic:topic,locationHint:locationHint,audit:{modelLevel:modelLevel||'none',modelTopic:modelTopic||'none',localLevel:localLevel,localTopic:localTopic,confidence:confidence,agrees:modelLevel===level&&modelTopic===topic,adjusted:reasons.length>0,reasons:reasons}};
  }
  function reviewUnitRecord(unit,classification,provider){var text=String(unit.text||'').trim(),checked=reviewClassificationAudit(unit,classification);return{author:String(unit.reviewer||'Reviewer'),text:text,response:String(unit.response||'').trim(),level:checked.level,topic:checked.topic,locationHint:checked.locationHint,classificationAudit:checked.audit,classifiedProvider:provider||'Local review rules'};}
  function reviewClassificationBatches(units,size){var batches=[];size=Math.max(1,+size||1);for(var start=0;start<units.length;start+=size)batches.push(units.slice(start,start+size));return batches;}
  async function classifyReviewBatchWithAi(batch,system,onProgress,routeOverride){
    var byId={},provider='',attempts=0;
    async function ask(items){
      attempts++;var payload=items.map(function(unit){return '[INPUT '+unit.inputId+']\nReviewer: '+unit.reviewer+'\nGroup: '+(unit.group||'none')+'\nNumber: '+(unit.number||'none')+'\nReviewer text:\n'+unit.text;}).join('\n\n'),result=await runAi(system,payload,Math.max(750,items.length*315),onProgress,routeOverride),data=reviewAiJson(result.text),answers=Array.isArray(data&&data.items)?data.items:[];provider=result.provider||provider;answers.forEach(function(item){if(item&&item.inputId)byId[String(item.inputId)]=item;});
    }
    try{await ask(batch);}catch(e){}
    var missing=batch.filter(function(unit){return!byId[unit.inputId];});if(missing.length)try{await ask(missing);}catch(e){}
    return{byId:byId,provider:provider,failed:Object.keys(byId).length===0,attempts:attempts};
  }
  function reviewClassificationPrompt(){return'Classify pre-separated reviewer concerns. This task is classification only. Do not draft, rewrite, evaluate, summarize, or complete an author response, and do not include response text in the output. Return exactly one result for every inputId, in the same order; never merge, summarize away, or omit numbered concerns. Mark generic praise, section labels, private task notes, recommendations to the editor, and other non-concerns as actionable false. Classify level as exactly one of: general (manuscript-wide), section (a whole section or subsection), specific (a passage, claim, method, equation, figure, table, or result), editorial (typo, grammar, formatting, citation, or simple consistency correction). Requests to restructure, reorganize, separate broad parts, improve overall clarity, narrow novelty, or reframe validation are general or section-level, not specific merely because they mention technical terms. Classify topic as exactly one of: writing, structure, methods, statistics, modeling, evidence, figures, consistency, claims, references, other. Give confidence from 0 to 1 for the scope-and-topic classification; use lower confidence when more than one label is plausible. Preserve explicit manuscript page, section, figure, table, and equation references in locationHint. Return only JSON: {"items":[{"inputId":"exact supplied id","actionable":true,"level":"general|section|specific|editorial","topic":"writing|structure|methods|statistics|modeling|evidence|figures|consistency|claims|references|other","confidence":0.0,"locationHint":"explicit manuscript location or empty"}]}. ';}
  async function extractReviewerReportWithAi(text,onProgress,routeOverride){
    var units=reviewReportUnits(text),all=[],seen={},system=reviewClassificationPrompt(),failed=0,batches=reviewClassificationBatches(units,6),results=new Array(batches.length),next=0,done=0,local=routeOverride&&routeOverride.id==='browser';
    if(!units.length)return[];if(onProgress)onProgress('Classifying '+units.length+' review items in '+batches.length+' specialist batch'+(batches.length===1?'':'es')+'…',0);
    async function worker(){for(;;){var batchIndex=next++;if(batchIndex>=batches.length)return;var batch=batches[batchIndex],progress=done/units.length;results[batchIndex]=await classifyReviewBatchWithAi(batch,system,function(message){if(onProgress)onProgress('Classification batch '+(batchIndex+1)+' of '+batches.length+' · '+message,progress);},routeOverride);done+=batch.length;if(onProgress)onProgress('Classified '+Math.min(done,units.length)+' of '+units.length+' review items…',done/units.length);}}
    var workers=[],workerCount=Math.min(local?1:4,batches.length);for(var w=0;w<workerCount;w++)workers.push(worker());await Promise.all(workers);
    results.forEach(function(result,index){result=result||{byId:{},provider:'',failed:true};if(result.failed)failed++;batches[index].forEach(function(unit){var classification=result.byId[unit.inputId],keep=unit.number||!classification||classification.actionable!==false;if(!keep)return;var record=reviewUnitRecord(unit,classification,result.provider),key=reviewNormalizedText(record.text);if(!key||seen[key])return;seen[key]=1;all.push(record);});});
    if(!all.length&&failed)throw new Error('AI could not classify this reviewer report. Try a cloud model for this long document.');return all.slice(0,160);
  }
  async function importReviewerFile(ch,file,button,replaceCurrent){
    var status=byId('reviewerLocateStatus'),old=button.textContent,started=now(),plan=await reviewAiPlan();if(!plan.classification||!plan.location){status.textContent='Set up the built-in or a cloud AI in Desk settings first.';return;}button.disabled=true;button.textContent='Reading review…';
    try{
      setTaskProgress('reviewerProgress',3);if(ch.kind==='pdf'&&!reviewManuscriptText(ch)&&pdfDoc){status.textContent='Preparing the manuscript text…';setTaskProgress('reviewerProgress',6);await ensureReaderData(pdfDoc,ch);}
      if(!paras(reviewManuscriptText(ch)).length)throw new Error('This paper has no readable manuscript text to match against.');
      var report=await reviewReportText(file);if(!report.trim())throw new Error('That reviewer file contains no readable text.');status.textContent='Separating the reviewer comments with '+plan.classification.label+'…';setTaskProgress('reviewerProgress',10);var classificationStarted=now(),extracted=await extractReviewerReportWithAi(report,function(message,progress){status.textContent=message;setTaskProgress('reviewerProgress',10+(Number.isFinite(progress)?progress:0)*45);},plan.classification),classificationMs=now()-classificationStarted;if(!extracted.length)throw new Error('AI could not find actionable reviewer comments in that file.');setTaskProgress('reviewerProgress',55);
      ch.reviewReports=Array.isArray(ch.reviewReports)?ch.reviewReports:[];var existingComments=ch.reviewComments||[],existingReports=ch.reviewReports,replaceCount=replaceCurrent?existingComments.length:0,priorReport=existingReports.find(function(report){return String(report.name||'').toLowerCase()===String(file.name||'').toLowerCase();}),reportId=priorReport?priorReport.id:uid('report'),priorComments=replaceCurrent?existingComments:existingComments.filter(function(comment){return comment.sourceId===reportId;}),priorByText={};priorComments.forEach(function(comment){priorByText[reviewNormalizedText(comment.text)]=comment;});
      var comments=extracted.map(function(item){var record={id:uid('rr'),sourceId:reportId,author:item.author,date:'',text:item.text,level:normalizeReviewLevel(item.level),topic:normalizeReviewTopic(item.topic),locationHint:item.locationHint||'',classificationAudit:item.classificationAudit||null,classifiedProvider:item.classifiedProvider||plan.classification.label,para:null,page:null,start:0,end:0,quote:'',anchors:[],pdfAnchors:[],anchored:false,replies:[],response:item.response||'',resolved:false,sourceName:file.name,addedAt:now()},prior=priorByText[reviewNormalizedText(item.text)];if(prior){record.id=prior.id;record.response=prior.response||record.response;record.resolved=!!prior.resolved;record.replies=prior.replies||[];preserveManualReviewLocation(record,prior);}return record;});var matchable=comments.filter(reviewCanAutoLocate),locationStarted=now(),location=await locateReviewsBalanced(ch,matchable,function(message,progress){status.textContent=message;setTaskProgress('reviewerProgress',55+(Number.isFinite(progress)?progress:0)*45);},plan),locationMs=now()-locationStarted;
      ch.reviewComments=replaceCurrent?comments:existingComments.filter(function(comment){return comment.sourceId!==reportId;}).concat(comments);ch.reviewReports=replaceCurrent?[]:existingReports.filter(function(report){return report.id!==reportId;});var levels={},adjusted=0,stamp=now(),totalMs=stamp-started;comments.forEach(function(comment){levels[comment.level]=(levels[comment.level]||0)+1;if(comment.classificationAudit&&comment.classificationAudit.adjusted)adjusted++;});ch.reviewReports.push({id:reportId,name:file.name,addedAt:stamp,comments:comments.length,levels:levels,extractorVersion:2,classifierVersion:3,locatorVersion:4,provider:plan.classification.label,classificationProvider:plan.classification.label,locationProvider:plan.location.label,exactMatches:location.exactMatched,needsChecking:location.needsChecking,adjustedClassifications:adjusted,timing:{classificationMs:classificationMs,locationMs:locationMs,totalMs:totalMs}});ch.reviewUpdatedAt=stamp;ch.reviewClearedAt=0;placeInReviewWorkspace(ch);touch(ch);if(readerMode==='text')renderText(ch);renderReviewerPanel(ch);refreshPdfReviewMarkers();renderPdfReviewFocus(currentPage);updateReviewBadge();setTaskProgress('reviewerProgress',100);status.textContent=(replaceCurrent?'Replaced '+replaceCount+' old comment'+(replaceCount===1?'':'s')+' with ':'Imported ')+comments.length+' reviewer concern'+(comments.length===1?'':'s')+' · '+location.confident+' confidently located · '+location.needsChecking+' need checking'+(location.exactMatched?' · '+location.exactMatched+' exact-text shortcut'+(location.exactMatched===1?'':'s'):'')+' · '+elapsedLabel(totalMs)+'.';
    }catch(e){status.textContent=e.message||'Phloem could not import that reviewer file.';setTaskProgress('reviewerProgress',false);}
    finally{button.disabled=false;if(currentId===ch.id)renderReviewerPanel(ch);else button.textContent=old;}
  }
  async function locateUnlinkedReviews(ch,button){
    var pending=(ch.reviewComments||[]).filter(function(comment){return comment.text&&reviewCanAutoLocate(comment)&&reviewNeedsPassage(ch,comment);}),status=byId('reviewerLocateStatus');if(!pending.length)return;
    if(!hasAiRoute()){status.textContent='Set up the built-in or a cloud AI in Desk settings first.';return;}
    var plan=await reviewAiPlan(),started=now();button.disabled=true;setTaskProgress('reviewerProgress',0);
    try{var result=await locateReviewsBalanced(ch,pending,function(message,progress){status.textContent=message;setTaskProgress('reviewerProgress',(Number.isFinite(progress)?progress:0)*100);},plan),elapsed=now()-started;ch.reviewUpdatedAt=now();touch(ch);renderText(ch);renderReviewerPanel(ch);refreshPdfReviewMarkers();setTaskProgress('reviewerProgress',100);status.textContent=result.confident+' confidently located · '+result.needsChecking+' still need checking'+(result.exactMatched?' · '+result.exactMatched+' exact-text shortcut'+(result.exactMatched===1?'':'s'):'')+' · '+elapsedLabel(elapsed)+'.';}
    catch(e){status.textContent=e.message||'Phloem could not locate those comments.';setTaskProgress('reviewerProgress',false);}
    finally{button.disabled=false;}
  }
  function reviewerPassageMarkup(ch,comment){
    var add='<button class="reviewer-add-passage" type="button" data-review-add-passage="'+esc(comment.id)+'">＋ '+(comment.anchored?'Add another passage':'Link a passage yourself')+'</button>';
    if(!comment.anchored){var empty=comment.level==='general'?'Manuscript-wide · no single passage':comment.level==='section'&&!reviewHasLocationEvidence(comment)?'Section-wide · no single passage named':'Needs checking · no confident passage yet';return'<span class="reviewer-unlinked">'+empty+'</span>'+add;}
    var anchors=ch.kind==='pdf'?reviewPdfAnchors(ch,comment):(Array.isArray(comment.anchors)&&comment.anchors.length?comment.anchors:[comment]);return'<div class="reviewer-passage-links">'+anchors.map(function(anchor,index){var manual=!!anchor.manual||String(anchor.method||'').indexOf('manual-')===0,label=manual?'Linked by you':(anchor.quote?'Highlighted passage':'Referenced page'),where=ch.kind==='pdf'?'p. '+anchor.page:'paragraph '+((+anchor.para||0)+1);return'<div class="reviewer-passage-item"><button class="reviewer-show-passage" type="button" data-show-review="'+esc(comment.id)+'"'+(ch.kind==='pdf'?' data-review-page="'+anchor.page+'"':'')+' data-review-anchor-index="'+index+'">'+label+' · '+where+' →</button><button class="reviewer-wrong-passage" type="button" data-review-wrong="'+esc(comment.id)+'" data-review-anchor-index="'+index+'">Wrong passage</button></div>';}).join('')+'</div>'+add;
  }
  function reviewNeedsPassage(ch,comment){if(!reviewCanAutoLocate(comment)&&!comment.manualReviewLink)return false;return!reviewHasVerifiedPassage(ch,comment)||!Number.isFinite(+comment.matchConfidence)||+comment.matchConfidence<.72||comment.locationStatus==='needs-checking';}
  function renderReviewerPanel(ch){
    ch=ch||find(currentId);var comments=ch&&ch.reviewComments||[],list=byId('readerReviewList'),count=byId('readerReviewerCount'),locate=byId('locateReviewsBtn'),filters=byId('reviewerFilters'),qualityBox=byId('reviewQualitySummary'),importButton=byId('importReviewFileBtn'),clearButton=byId('clearReviewCommentsBtn'),replaceNote=byId('reviewReplaceNote'),status=byId('reviewerLocateStatus'),legacyReport=(ch&&ch.reviewReports||[]).some(function(report){return !report.extractorVersion||report.extractorVersion<2;});count.textContent=comments.length?'· '+comments.filter(function(comment){return !comment.resolved;}).length:'';importButton.textContent=comments.length?(legacyReport?'↻ Replace incomplete review file':'↻ Replace reviewer Word file'):'＋ Import reviewer Word file';clearButton.textContent='Clear all '+comments.length+' comment'+(comments.length===1?'':'s');clearButton.classList.toggle('hidden',!comments.length);replaceNote.classList.toggle('hidden',!comments.length);syncReviewLinkControls(ch);if(legacyReport&&!status.textContent)status.textContent='This review used the older summary importer. Re-import the same Word file to replace the incomplete list.';
    if(!comments.length){list.innerHTML='<div class="notebook-empty">This document has no reviewer comments.</div>';filters.innerHTML='';locate.classList.add('hidden');qualityBox.classList.add('hidden');return;}
    var quality=reviewLocationSummary(ch,comments),broad=comments.length-quality.matchable;qualityBox.textContent=quality.matchable?quality.confident+' confidently located · '+quality.needsChecking+' need checking'+(broad?' · '+broad+' broad-scope':''):(broad+' broad-scope comment'+(broad===1?'':'s')+' · no single passage expected');qualityBox.classList.remove('hidden');qualityBox.classList.toggle('needs-checking',quality.needsChecking>0);
    var levelOrder=['all','general','section','specific','editorial'],levelCounts={all:comments.length};comments.forEach(function(comment){comment.level=normalizeReviewLevel(comment.level,comment);comment.topic=normalizeReviewTopic(comment.topic);levelCounts[comment.level]=(levelCounts[comment.level]||0)+1;});if(reviewFilter!=='all'&&!levelCounts[reviewFilter])reviewFilter='all';
    filters.innerHTML=levelOrder.filter(function(level){return level==='all'||levelCounts[level];}).map(function(level){return '<button class="reviewer-filter" type="button" data-review-filter="'+level+'" aria-pressed="'+String(reviewFilter===level)+'">'+(level==='all'?'All':reviewLevelLabel(level))+' · '+(levelCounts[level]||0)+'</button>';}).join('');filters.querySelectorAll('[data-review-filter]').forEach(function(button){button.onclick=function(){reviewFilter=button.dataset.reviewFilter;renderReviewerPanel(ch);};});
    var unlinked=comments.filter(function(comment){return reviewCanAutoLocate(comment)&&reviewNeedsPassage(ch,comment);}).length;locate.classList.toggle('hidden',!unlinked);locate.textContent='✦ Locate '+unlinked+' passage'+(unlinked===1?'':'s')+' with AI';var visible=comments.map(function(comment,index){return{comment:comment,index:index};}).filter(function(item){return reviewFilter==='all'||item.comment.level===reviewFilter;});
    list.innerHTML=visible.map(function(item){var comment=item.comment,index=item.index,replies=(comment.replies||[]).map(function(reply){return '<div class="reviewer-reply"><b>'+esc(reply.author||'Reply')+'</b><p>'+esc(reply.text||'')+'</p></div>';}).join(''),where=reviewerPassageMarkup(ch,comment),location=comment.locationHint?'<p class="reviewer-location">⌖ '+esc(comment.locationHint)+'</p>':'',needs=reviewNeedsPassage(ch,comment);
      return '<article class="reviewer-comment-card review-level-'+esc(comment.level)+(comment.anchored?' has-passage':'')+(comment.resolved?' resolved':'')+(comment.id===reviewFocusId?' focused':'')+(comment.id===reviewLinkTargetId?' linking':'')+'" data-review-card="'+esc(comment.id)+'"><div class="reviewer-card-head"><span>R'+(index+1)+' · '+esc(comment.author||'Reviewer')+'</span><span>'+esc(reviewerDate(comment.date))+'</span></div><div class="reviewer-classification"><span class="reviewer-chip level review-level-'+esc(comment.level)+'">'+esc(reviewLevelLabel(comment.level))+'</span><span class="reviewer-chip">'+esc(reviewTopicLabel(comment.topic))+'</span>'+(reviewHasManualAnchor(ch,comment)?'<span class="reviewer-chip review-linked-by-user">Linked by you</span>':'')+(needs?'<span class="reviewer-chip review-needs-checking">Needs checking</span>':'')+'</div>'+location+(comment.quote&&comment.anchored?'<blockquote>'+esc(comment.quote)+'</blockquote>':'')+'<p class="reviewer-comment-text">'+esc(comment.text||'')+'</p>'+replies+where+'<label class="field-label" for="review-response-'+esc(comment.id)+'">Your response · written by you</label><textarea class="reviewer-response" id="review-response-'+esc(comment.id)+'" data-review-response="'+esc(comment.id)+'" placeholder="Write your response here…">'+esc(comment.response||'')+'</textarea><button class="reviewer-resolve" type="button" data-resolve-review="'+esc(comment.id)+'">'+(comment.resolved?'Reopen comment':'Mark resolved')+'</button></article>';
    }).join('');
    list.querySelectorAll('[data-show-review]').forEach(function(button){button.onclick=function(){var anchorIndex=button.hasAttribute('data-review-anchor-index')?+button.dataset.reviewAnchorIndex:-1;focusReviewerPassage(ch,button.dataset.showReview,+button.dataset.reviewPage||0,anchorIndex);};});
    list.querySelectorAll('[data-review-wrong]').forEach(function(button){button.onclick=function(){removeReviewerPassage(ch,button.dataset.reviewWrong,+button.dataset.reviewAnchorIndex);};});
    list.querySelectorAll('[data-review-add-passage]').forEach(function(button){button.onclick=function(){beginReviewerPassageLink(ch,button.dataset.reviewAddPassage);};});
    list.querySelectorAll('.reviewer-comment-card.has-passage').forEach(function(card){card.onclick=function(event){if(event.target.closest('button, textarea, input, select, a, label')||String(getSelection&&getSelection()||''))return;focusReviewerPassage(ch,card.dataset.reviewCard);};});
    list.querySelectorAll('[data-review-response]').forEach(function(area){area.oninput=function(){var comment=reviewerById(ch,area.dataset.reviewResponse);if(!comment)return;comment.response=area.value;comment.updatedAt=now();ch.reviewUpdatedAt=comment.updatedAt;touch(ch);};});
    list.querySelectorAll('[data-resolve-review]').forEach(function(button){button.onclick=function(){var comment=reviewerById(ch,button.dataset.resolveReview);if(!comment)return;comment.resolved=!comment.resolved;comment.updatedAt=now();ch.reviewUpdatedAt=comment.updatedAt;touch(ch);renderText(ch);renderReviewerPanel(ch);refreshPdfReviewMarkers();updateReviewBadge();};});
    locate.onclick=function(){locateUnlinkedReviews(ch,locate);};
  }
  function clearReviewComments(ch){
    var total=ch&&(ch.reviewComments||[]).length;if(!ch||!total)return false;if(!confirm('Clear all '+total+' reviewer comments, your saved responses, and linked PDF passages for this paper?\n\nYour paper, reading notes, and personal highlights will stay.'))return false;var stamp=now();ch.reviewComments=[];ch.reviewReports=[];ch.reviewClearedAt=stamp;ch.reviewUpdatedAt=stamp;reviewFocusId='';reviewFocusPage=0;reviewFocusAnchorIndex=-1;reviewLinkTargetId='';reviewLinkUndo=null;touch(ch);if(currentId===ch.id){if(readerMode==='text')renderText(ch);renderReviewerPanel(ch);refreshPdfReviewMarkers();clearPdfReviewFocus();byId('reviewerLocateStatus').textContent='All '+total+' reviewer comments cleared. This deletion will stay cleared across sync.';}renderShelf();updateReviewBadge();return true;
  }
  function startReviewerFileReplacement(ch){if(!ch)return;reviewLinkTargetId='';reviewLinkUndo=null;clearPendingSelection();pendingReviewTargetId=ch.id;pendingReviewReplace=(ch.reviewComments||[]).length>0;if(currentId===ch.id)byId('reviewerLocateStatus').textContent='';byId('reviewFile').click();}
  byId('clearReviewCommentsBtn').onclick=function(){clearReviewComments(find(currentId));};
  byId('importReviewFileBtn').onclick=function(){startReviewerFileReplacement(find(currentId));};
  byId('reviewLinkCancelBtn').onclick=cancelReviewerPassageLink;
  byId('reviewLinkUndoBtn').onclick=restoreReviewLinkUndo;
  byId('reviewFile').onchange=function(){var file=this.files&&this.files[0],targetId=pendingReviewTargetId||currentId,replaceCurrent=pendingReviewReplace;this.value='';pendingReviewTargetId='';pendingReviewReplace=false;if(!file||!targetId)return;var start=function(){var ch=find(targetId);if(!ch)return;switchTab('reviewsPanel');if(innerWidth>720)setNotebookCollapsed(false,true);importReviewerFile(ch,file,byId('importReviewFileBtn'),replaceCurrent);};if(currentId===targetId&&!byId('readerPage').classList.contains('hidden'))start();else openReader(targetId).then(start);};
  function styledTextHtml(text,marks,runs,paraIndex,reviewComments){
    var sel=(marks||[]).filter(function(h){return h.para===paraIndex;});
    var reviews=[];(reviewComments||[]).forEach(function(comment){var ranges=Array.isArray(comment.anchors)&&comment.anchors.length?comment.anchors:[comment];ranges.forEach(function(range){if(comment.anchored&&range.para===paraIndex&&range.end>range.start)reviews.push({comment:comment,start:range.start,end:range.end});});});
    if(!sel.length&&!(runs&&runs.length)&&!reviews.length)return esc(text);
    var cuts={0:1};cuts[text.length]=1;
    sel.forEach(function(h){cuts[Math.max(0,Math.min(text.length,h.start))]=1;cuts[Math.max(0,Math.min(text.length,h.end))]=1;});
    reviews.forEach(function(review){cuts[Math.max(0,Math.min(text.length,review.start))]=1;cuts[Math.max(0,Math.min(text.length,review.end))]=1;});
    (runs||[]).forEach(function(r){cuts[Math.max(0,Math.min(text.length,r[0]))]=1;cuts[Math.max(0,Math.min(text.length,r[1]))]=1;});
    var points=Object.keys(cuts).map(Number).sort(function(a,b){return a-b;}),out='';
    for(var i=0;i<points.length-1;i++){
      var a=points[i],b=points[i+1];if(b<=a)continue;
      var seg=esc(text.slice(a,b)),flags=0,mark=null,review=null;
      (runs||[]).forEach(function(r){if(r[0]<=a&&r[1]>=b)flags|=r[2];});
      sel.forEach(function(h){if(!mark&&h.start<=a&&h.end>=b)mark=h;});
      reviews.forEach(function(item){if(!review&&item.start<=a&&item.end>=b)review=item.comment;});
      if(flags&2)seg='<i>'+seg+'</i>';
      if(flags&1)seg='<b>'+seg+'</b>';
      if(mark)seg='<mark class="hl-'+esc(mark.color||'yellow')+(mark.note?' hl-noted':'')+'" data-hl-id="'+esc(mark.id||'')+'"'+(mark.note?' title="✎ '+esc(mark.note)+'"':'')+'>'+seg+'</mark>';
      if(review)seg='<span class="review-comment-anchor review-level-'+esc(normalizeReviewLevel(review.level,review))+(review.resolved?' resolved':'')+(review.id===reviewFocusId?' is-focused':'')+'" data-review-comment-id="'+esc(review.id)+'" title="'+esc((review.author||'Reviewer')+': '+String(review.text||'').slice(0,160))+'">'+seg+'</span>';
      out+=seg;
    }
    return out;
  }
  function highlightedTextHtml(text,marks,paraIndex){return styledTextHtml(text,marks,null,paraIndex);}
  function notebookPackageStem(ch){return String(ch.title||ch.sourceName||'paper').replace(/\.pdf$/i,'').replace(/[\u0000-\u001f\u007f/\\<>:"|?*]+/g,' ').replace(/\s+/g,' ').trim().slice(0,100)||'paper';}
  function notebookGuideFilename(ch){return notebookPackageStem(ch)+' — Phloem guide.md';}
  function notebookPdfFilename(ch){var name=String(ch.sourceName||notebookPackageStem(ch)+'.pdf').replace(/[\u0000-\u001f\u007f/\\<>:"|?*]+/g,' ').replace(/\s+/g,' ').trim().slice(0,140)||'paper.pdf';return /\.pdf$/i.test(name)?name:name+'.pdf';}
  function listeningQuote(value){
    var text=String(value||'').trim();
    return text?text.split(/\r?\n/).map(function(line){return '> '+(line||' ');}).join('\n'):'> —';
  }
  function listeningPackMarkdown(ch){
    var title=String(ch.title||'Untitled').trim(),lines=['# '+title,'','> Phloem NotebookLM guide · prepared locally on '+new Date().toLocaleDateString(),''];
    lines.push('## How to use this in NotebookLM','');
    if(ch.kind==='pdf')lines.push('Upload the original PDF and this guide as two sources in the same notebook. The PDF is the authority for the paper; this file adds your reading trail.');
    else lines.push('Upload this guide as a source. It includes the text and your reading trail.');
    lines.push('','### Mind Map framing','','Center the map on the paper’s main question. Branch into major concepts, methods, evidence, findings, limitations, and open questions. Give highlighted passages extra weight. Put personal reactions beneath a clearly named **Reader notes** branch so they are never mistaken for the author’s claims.','','### Audio Overview framing','','Explain the central ideas, evidence, and open questions. Give extra attention to the highlighted passages and reader notes below. Treat reader notes as questions or reactions—not as claims made by the author.','','## Paper','');
    lines.push('- **Author(s):** '+(String(ch.authors||'').trim()||'Not recorded'));
    if(ch.sourceName)lines.push('- **Source file:** '+String(ch.sourceName).trim());
    if((ch.tags||[]).length)lines.push('- **Tags:** '+ch.tags.join(', '));
    lines.push('','## Reader notes and highlights','');
    var annotations=0,sourceParas=paras(ch.fr||''),readerParas=paras(readerSourceText(ch));
    Object.keys(ch.pageNotes||{}).sort(function(a,b){if(a==='document')return-1;if(b==='document')return 1;return(+a||0)-(+b||0);}).forEach(function(key){
      var note=String(ch.pageNotes[key]||'').trim();if(!note)return;annotations++;
      lines.push('### '+(key==='document'?'Paper note':'Page '+key+' note'),'','**Reader note**','',listeningQuote(note),'');
    });
    Object.keys(ch.notes||{}).sort(function(a,b){return+a-+b;}).forEach(function(key){
      var note=String(ch.notes[key]||'').trim();if(!note)return;annotations++;var excerpt=sourceParas[+key]||'';
      lines.push('### Paragraph '+(+key+1)+' note','');if(excerpt)lines.push('**Paper passage**','',listeningQuote(excerpt),'');lines.push('**Reader note**','',listeningQuote(note),'');
    });
    Object.keys(ch.readerNotes||{}).sort(function(a,b){return+a-+b;}).forEach(function(key){
      var note=String(ch.readerNotes[key]||'').trim();if(!note)return;annotations++;var excerpt=readerParas[+key]||'';
      lines.push('### Reader paragraph '+(+key+1)+' note','');if(excerpt)lines.push('**Paper passage**','',listeningQuote(excerpt),'');lines.push('**Reader note**','',listeningQuote(note),'');
    });
    Object.keys(ch.highlights||{}).sort(function(a,b){return+a-+b;}).forEach(function(page){(ch.highlights[page]||[]).forEach(function(mark){
      if(!String(mark.text||'').trim()&&!String(mark.note||'').trim())return;annotations++;lines.push('### Highlight · page '+page,'');if(mark.text)lines.push('**Highlighted passage**','',listeningQuote(mark.text),'');if(mark.note)lines.push('**Reader note**','',listeningQuote(mark.note),'');
    });});
    (ch.textHighlights||[]).forEach(function(mark){
      if(!String(mark.text||'').trim()&&!String(mark.note||'').trim())return;annotations++;lines.push('### Highlight · paragraph '+(+mark.para+1),'');if(mark.text)lines.push('**Highlighted passage**','',listeningQuote(mark.text),'');if(mark.note)lines.push('**Reader note**','',listeningQuote(mark.note),'');
    });
    (ch.readerHighlights||[]).forEach(function(mark){
      if(!String(mark.text||'').trim()&&!String(mark.note||'').trim())return;annotations++;lines.push('### Highlight · Reader paragraph '+(+mark.para+1),'');if(mark.text)lines.push('**Highlighted passage**','',listeningQuote(mark.text),'');if(mark.note)lines.push('**Reader note**','',listeningQuote(mark.note),'');
    });
    if(!annotations)lines.push('No reading notes or highlights have been added yet.','');
    var source=readerSourceText(ch).trim(),maxSource=3000000;
    if(source){
      var clipped=source.length>maxSource;source=source.slice(0,maxSource);
      lines.push('## Extracted paper text','',ch.kind==='pdf'?'This extracted text helps with searching and narration. Use the original PDF for figures, tables, equations, and page layout.':'The imported text follows.','',source);
      if(clipped)lines.push('','_[Extracted text shortened here because the source exceeds the package size limit. Use the original paper for the remainder.]_');
    }else if(ch.kind==='pdf')lines.push('## Paper text','', 'No full text was available to extract in Phloem. Upload the original PDF with this pack so NotebookLM can read the paper.');
    lines.push('','---','Prepared by Phloem. Nothing was sent anywhere when this file was created.');
    return lines.join('\n');
  }
  function notebookPackageReadme(ch){
    var hasPdf=ch.kind==='pdf';
    return [
      'PHLOEM → NOTEBOOKLM PACKAGE','',
      'NotebookLM cannot read this ZIP directly. Unzip it first.','',
      '1. Unzip this package.',
      '2. Open https://notebook.google.com/ and create or open a notebook.',
      hasPdf?'3. Upload BOTH the PDF and the Phloem guide Markdown file.':'3. Upload the Phloem guide Markdown file.',
      '4. Choose Mind Map, Audio Overview, or another Studio tool.','',
      'MIND MAP','The guide asks NotebookLM to separate concepts, methods, evidence, findings, limitations, and your own questions. Expand a node or click it to investigate that branch.','',
      'AUDIO OVERVIEW','The guide asks the hosts to prioritize your highlights and questions while keeping your notes separate from the author’s claims.','',
      'PRIVACY','Phloem assembled this package on your device. Nothing is sent to Google until you choose the files and upload them.','',
      'Paper: '+String(ch.title||'Untitled'),
      'Author(s): '+(String(ch.authors||'').trim()||'Not recorded')
    ].join('\n');
  }
  function notebookAnnotationCount(ch){
    var count=0;
    [ch.pageNotes,ch.notes,ch.readerNotes].forEach(function(map){Object.keys(map||{}).forEach(function(key){if(String(map[key]||'').trim())count++;});});
    Object.keys(ch.highlights||{}).forEach(function(page){(ch.highlights[page]||[]).forEach(function(mark){if(String(mark.text||'').trim()||String(mark.note||'').trim())count++;});});
    [ch.textHighlights,ch.readerHighlights].forEach(function(marks){(marks||[]).forEach(function(mark){if(String(mark.text||'').trim()||String(mark.note||'').trim())count++;});});
    return count;
  }
  var notebookPackageChapterId='';
  function openNotebookPackageReview(ch){
    notebookPackageChapterId=ch.id;
    byId('notebookPdfPackageRow').classList.toggle('hidden',ch.kind!=='pdf');
    byId('notebookPdfFileName').textContent=notebookPdfFilename(ch);
    byId('notebookGuideFileName').textContent=notebookGuideFilename(ch);
    byId('notebookGuideEditor').value=listeningPackMarkdown(ch);
    byId('notebookReadmeEditor').value=notebookPackageReadme(ch);
    var annotations=notebookAnnotationCount(ch),sourceLength=Math.min(readerSourceText(ch).trim().length,3000000),files=ch.kind==='pdf'?3:2;
    byId('notebookPackageSummary').textContent=files+' files · '+annotations+' '+(annotations===1?'note or highlight':'notes and highlights')+' · '+sourceLength.toLocaleString()+' extracted text characters';
    byId('notebookPackageStatus').textContent='';
    byId('notebookPackageDialog').showModal();
    setTimeout(function(){byId('notebookGuideEditor').scrollTop=0;},0);
  }
  var notebookZipCrcTable=null;
  function notebookCrcTable(){
    if(notebookZipCrcTable)return notebookZipCrcTable;notebookZipCrcTable=new Uint32Array(256);
    for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;notebookZipCrcTable[n]=c>>>0;}return notebookZipCrcTable;
  }
  async function notebookCrc32(bytes,done,total,onProgress){
    var table=notebookCrcTable(),crc=0xffffffff,chunk=4194304;
    for(var start=0;start<bytes.length;start+=chunk){var end=Math.min(bytes.length,start+chunk);for(var i=start;i<end;i++)crc=table[(crc^bytes[i])&255]^(crc>>>8);if(onProgress)onProgress(done+end,total);if(end<bytes.length)await new Promise(function(resolve){setTimeout(resolve,0);});}
    return(crc^0xffffffff)>>>0;
  }
  function notebookZipDate(date){var year=Math.max(1980,date.getFullYear());return{time:(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1),date:((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate()};}
  async function notebookZip(files,onProgress){
    var encoder=new TextEncoder(),stamp=notebookZipDate(new Date()),prepared=files.map(function(file){var data=typeof file.data==='string'?encoder.encode(file.data):(file.data instanceof Uint8Array?file.data:new Uint8Array(file.data));return{name:encoder.encode(file.name),data:data};}),total=prepared.reduce(function(sum,file){return sum+file.data.length;},0)||1,done=0,parts=[],central=[],offset=0;
    for(var f=0;f<prepared.length;f++){
      var file=prepared[f],crc=await notebookCrc32(file.data,done,total,onProgress),size=file.data.length,local=new Uint8Array(30),lv=new DataView(local.buffer);
      lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(8,0,true);lv.setUint16(10,stamp.time,true);lv.setUint16(12,stamp.date,true);lv.setUint32(14,crc,true);lv.setUint32(18,size,true);lv.setUint32(22,size,true);lv.setUint16(26,file.name.length,true);lv.setUint16(28,0,true);
      parts.push(local,file.name,file.data);
      var directory=new Uint8Array(46),dv=new DataView(directory.buffer);dv.setUint32(0,0x02014b50,true);dv.setUint16(4,20,true);dv.setUint16(6,20,true);dv.setUint16(8,0x0800,true);dv.setUint16(10,0,true);dv.setUint16(12,stamp.time,true);dv.setUint16(14,stamp.date,true);dv.setUint32(16,crc,true);dv.setUint32(20,size,true);dv.setUint32(24,size,true);dv.setUint16(28,file.name.length,true);dv.setUint16(30,0,true);dv.setUint16(32,0,true);dv.setUint16(34,0,true);dv.setUint16(36,0,true);dv.setUint32(38,0,true);dv.setUint32(42,offset,true);central.push(directory,file.name);
      offset+=local.length+file.name.length+size;done+=size;
    }
    var centralSize=central.reduce(function(sum,part){return sum+part.length;},0),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(4,0,true);ev.setUint16(6,0,true);ev.setUint16(8,prepared.length,true);ev.setUint16(10,prepared.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);ev.setUint16(20,0,true);
    return new Blob(parts.concat(central,[end]),{type:'application/zip'});
  }
  async function buildNotebookPackage(ch,onProgress,reviewed){
    var readme=reviewed&&typeof reviewed.readme==='string'?reviewed.readme:notebookPackageReadme(ch),guide=reviewed&&typeof reviewed.guide==='string'?reviewed.guide:listeningPackMarkdown(ch);
    var files=[{name:'README — OPEN FIRST.txt',data:readme}];
    if(ch.kind==='pdf'){
      var stored=await getPdf(ch.id);if(!stored){var missing=new Error('missing PDF');missing.missingPdf=true;throw missing;}
      var pdf=stored instanceof ArrayBuffer?new Uint8Array(stored):(ArrayBuffer.isView(stored)?new Uint8Array(stored.buffer,stored.byteOffset,stored.byteLength):new Uint8Array(await stored.arrayBuffer()));
      if(pdf.length<5||String.fromCharCode(pdf[0],pdf[1],pdf[2],pdf[3],pdf[4])!=='%PDF-')throw new Error('saved file is not a PDF');
      files.push({name:notebookPdfFilename(ch),data:pdf});
    }
    files.push({name:notebookGuideFilename(ch),data:guide});return notebookZip(files,onProgress);
  }
  function downloadNotebookPackage(ch,blob){var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=notebookPackageStem(ch)+' — Phloem NotebookLM package.zip';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},5000);}
  byId('notebookLmBtn').onclick=function(){var ch=find(currentId);if(ch)openNotebookPackageReview(ch);};
  byId('notebookPackageCreate').onclick=async function(){
    var ch=find(notebookPackageChapterId),btn=this,status=byId('notebookPackageStatus'),notebookStatus=byId('notebookLmStatus');if(!ch){status.textContent='This paper is no longer available. Close the review and try again.';return;}
    var guide=byId('notebookGuideEditor').value,readme=byId('notebookReadmeEditor').value;
    if(!guide.trim()){status.textContent='The Markdown guide is empty. Add some content before creating the ZIP.';byId('notebookGuideEditor').focus();return;}
    if(!readme.trim()){status.textContent='The README is empty. Add instructions before creating the ZIP.';byId('notebookReadmeEditor').focus();return;}
    var notebookTab=window.open('about:blank','_blank');btn.disabled=true;btn.textContent='Creating ZIP…';status.textContent='Collecting the reviewed files on this device…';
    try{
      var blob=await buildNotebookPackage(ch,function(done,total){status.textContent='Packaging locally… '+Math.min(100,Math.round(done/total*100))+'%';},{guide:guide,readme:readme});downloadNotebookPackage(ch,blob);
      if(notebookTab&&!notebookTab.closed){try{notebookTab.opener=null;notebookTab.location.replace('https://notebook.google.com/');}catch(e){}}
      byId('notebookPackageDialog').close();
      notebookStatus.textContent=ch.kind==='pdf'?'ZIP downloaded. Unzip it, then upload the PDF and Phloem guide together.':'ZIP downloaded. Unzip it, then upload the Phloem guide.';
      showReaderToast('NotebookLM package ready · unzip before uploading');
    }catch(e){if(notebookTab&&!notebookTab.closed)try{notebookTab.close();}catch(closeError){}status.textContent=e.missingPdf?'The original PDF is not stored on this device. Re-add the PDF here, then package it again.':'The NotebookLM package could not be created. Please try again.';showReaderToast(e.missingPdf?'Re-add the PDF on this device first':'Could not create the NotebookLM package');}
    finally{btn.disabled=false;btn.textContent='Create ZIP & open NotebookLM ↗';}
  };
  function noteKey(){ return readerMode==='pdf' ? String(currentPage) : 'document'; }
  function loadPageNote(){ var ch=find(currentId); if(!ch) return; var key=noteKey(); byId('noteHeading').textContent=readerMode==='pdf'?'Page '+currentPage+' note':'Paper note'; byId('pageNote').value=(ch.pageNotes||{})[key]||''; }
  byId('pageNote').oninput=function(){ var ch=find(currentId), key=noteKey(); if(this.value.trim()) ch.pageNotes[key]=this.value; else delete ch.pageNotes[key]; touch(ch); renderNoteIndex(); };
  byId('paperTags').onchange=function(){ var ch=find(currentId); ch.tags=this.value.split(',').map(function(t){return t.trim();}).filter(Boolean).filter(function(t,i,a){return a.indexOf(t)===i;}); touch(ch); };
  byId('editPaperBtn').onclick=function(){var ch=find(currentId);if(!ch)return;byId('paperTitleEdit').value=ch.title||'';byId('paperAuthorsEdit').value=ch.authors||'';byId('paperTagsEdit').value=(ch.tags||[]).join(', ');byId('paperDialog').showModal();};
  byId('savePaperDetails').onclick=function(){var ch=find(currentId);if(!ch)return;ch.title=byId('paperTitleEdit').value.trim()||'Untitled';ch.authors=byId('paperAuthorsEdit').value.trim();ch.tags=byId('paperTagsEdit').value.split(',').map(function(t){return t.trim();}).filter(Boolean).filter(function(t,i,a){return a.indexOf(t)===i;});touch(ch);byId('readerTitle').textContent=ch.title;byId('readerMeta').textContent=ch.authors||ch.sourceName||'';byId('paperTags').value=ch.tags.join(', ');byId('paperDialog').close();if(readerMode==='text')renderText(ch);};
  async function removePaper(ch,leaveReader){
    if(!ch)return false;var githubCopy=ch.sourcePath?' The PDF in your GitHub papers/ folder will stay there.':'';
    if(!confirm('Remove “'+(ch.title||'Untitled')+'” from Phloem? Its notes, highlights, reviewer work, and local original file will be removed.'+githubCopy))return false;
    state.deleted=state.deleted||{};state.deleted[ch.id]=now();state.chapters=state.chapters.filter(function(c){return c.id!==ch.id;});await deletePdf(ch.id);deleteFigures(ch.id);gdriveDeleteSource(ch);persist();
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
    byId('noteIndex').innerHTML=all.length?all.join(''):'<div class="notebook-empty">No saved notes or highlights yet. Select a passage to mark it, or write beside this page below.</div>';
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
  /* Dragging native selection handles never sets markerPointerDown, so on touch the
     commit fuse must outlast a thumb's pauses or it captures one word of a sentence. */
  function setPendingSelection(selection){pendingSelection=selection;lastAskSelection=selection;byId('highlightBtn').classList.add('ready');if(highlightMode&&!markerPointerDown)scheduleHighlightCommit(coarsePointer.matches?2000:550);}
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
      if(rects.length){var pdfSelection={kind:'pdf',page:+page.dataset.page||currentPage,text:text,rects:rects};if(!reviewLinkTargetId&&reopenExistingHighlight(pdfSelection,selectionRect))return;setPendingSelection(pdfSelection);if(!selectionPointerDown&&!highlightMode)showSelectionCard(pdfSelection,selectionRect);}
    }else{
      var original=range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;original=original&&original.closest('.original');if(!original||!byId('textDocument').contains(original))return;
      var startOwner=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement,endOwner=range.endContainer.nodeType===1?range.endContainer:range.endContainer.parentElement;if(!original.contains(startOwner)||!original.contains(endOwner))return;
      var before=document.createRange();before.selectNodeContents(original);before.setEnd(range.startContainer,range.startOffset);var through=document.createRange();through.selectNodeContents(original);through.setEnd(range.endContainer,range.endOffset);
      var ch=find(currentId),textSelection={kind:ch&&ch.kind==='pdf'?'reader':'text',para:+original.dataset.paraIndex,start:before.toString().length,end:through.toString().length,text:text};if(!reviewLinkTargetId&&reopenExistingHighlight(textSelection,selectionRect))return;setPendingSelection(textSelection);if(!selectionPointerDown&&!highlightMode)showSelectionCard(textSelection,selectionRect);
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
    var selection=pendingSelection||lastAskSelection,rect=selectionAnchor;if(!selection)return;queueLookup(selection.text,rect,selection,0);
  };
  byId('selectionHighlight').onclick=function(){setSelectionAction('selectionHighlight');commitPendingHighlight();};
  byId('selectionLinkReview').onclick=function(){linkSelectionToReview(pendingSelection);};
  byId('selectionAddNote').onclick=function(){
    var target=ensureSelectionNoteTarget();if(!target)return;setSelectionAction('selectionAddNote');byId('selectionEyebrow').textContent='Note on highlight';byId('selectionCard').classList.add('note-open');byId('selectionNoteBox').classList.remove('hidden');
    byId('selectionHighlight').textContent='Highlighted ✓';byId('selectionHighlight').disabled=true;byId('selectionAddNote').textContent='Editing note';
    refreshSelectionNoteThread();placeSelectionCard();requestAnimationFrame(function(){byId('selectionNote').focus({preventScroll:true});});
  };
  byId('selectionNote').oninput=function(){
    var target=ensureSelectionNoteTarget(),ch=find(currentId);if(!target||!ch)return;if(this.value.trim())target.item.note=this.value;else delete target.item.note;
    touch(ch);renderNoteIndex();byId('selectionNoteStatus').textContent=this.value.trim()?'Saved locally':'Highlight saved · note is empty';refreshSelectionNoteThread();placeSelectionCard();
  };
  byId('selectionNote').onfocus=function(){if(selectionNoteTarget)setSelectionAction('selectionAddNote');};
  byId('selectionNoteAi').onclick=openSelectionInAi;
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
  function pdfReviewAtPoint(pageEl,clientX,clientY){
    var page=+pageEl.dataset.page||currentPage,view=pdfViews[page-1],base=pageEl.getBoundingClientRect();if(!view||!base.width||!base.height)return null;var x=(clientX-base.left)/base.width,y=(clientY-base.top)/base.height,hit=null,hitArea=Infinity;
    (view.reviewHits||[]).forEach(function(entry){(entry.rects||[]).some(function(rect){var padY=Math.max(.004,rect.h*.28),padX=.004;if(x>=rect.x-padX&&x<=rect.x+rect.w+padX&&y>=rect.y-padY&&y<=rect.y+rect.h+padY){var area=rect.w*rect.h;if(area<hitArea){hit={comment:entry.comment,page:entry.page||page,anchor:entry.anchor};hitArea=area;}return true;}return false;});});return hit;
  }
  byId('pdfFrame').addEventListener('click',function(e){
    if(pendingSelection)return;
    var pageEl=e.target.closest('.pdf-page');if(!pageEl)return;
    var review=pdfReviewAtPoint(pageEl,e.clientX,e.clientY);if(review){showReviewerComment(find(currentId),review.comment.id,review.page);return;}
    var s=window.getSelection&&window.getSelection();if(s&&!s.isCollapsed)return;
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
    var card=byId('selectionCard');card.classList.remove('ai-open');card.classList.add('note-open');byId('selectionAiBox').classList.add('hidden');byId('selectionContext').classList.add('hidden');byId('selectionEyebrow').textContent=rec.note?'Note on highlight':'Saved highlight';byId('selectionExcerpt').textContent='“'+selection.text+'”';
    byId('selectionSecondary').classList.remove('hidden');byId('selectionSavedTools').classList.remove('hidden');byId('selectionNoteBox').classList.remove('hidden');byId('selectionNote').value=rec.note||'';byId('selectionNoteStatus').textContent=rec.note?'Saved with this highlight':'Add a note if you want to remember why it matters';
    byId('selectionHighlight').disabled=true;byId('selectionHighlight').textContent='Highlighted ✓';byId('selectionAddNote').textContent='Note';setSelectionAction('selectionHighlight');refreshSelectionNoteThread();
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
      renderPdfReviewMarkers(ch,n,view);
    });
  }

  /* notebook tabs */
  function setRecall(on){
    recallActive=!!on;byId('recallShield').classList.toggle('hidden',!recallActive);byId('recallShield').setAttribute('aria-hidden',String(!recallActive));byId('recallPrompt').classList.toggle('hidden',!recallActive);byId('recallBtn').setAttribute('aria-pressed',String(recallActive));byId('recallBtn').textContent=recallActive?'Show paper':'↻ Recall';
    if(recallActive){if(innerWidth<=720)toggleSheet(true);requestAnimationFrame(function(){var note=byId('pageNote');note.focus({preventScroll:true});note.setSelectionRange(note.value.length,note.value.length);});}
  }
  byId('recallBtn').onclick=function(){setRecall(!recallActive);};
  byId('recallDone').onclick=function(){setRecall(false);};
  function switchTab(id){ if(id!=='notesPanel'&&recallActive)setRecall(false);document.querySelectorAll('.tab').forEach(function(t){var on=t.dataset.tab===id;t.classList.toggle('active',on);t.setAttribute('aria-selected',String(on));}); ['notesPanel','reviewsPanel','aiPanel'].forEach(function(p){byId(p).classList.toggle('hidden',p!==id);});syncMobileSheetButtons(); }
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
  /* keyCode 229 is Safari's IME-composition marker: its Enter-commit arrives with
     isComposing already false, so both guards are needed for CJK typing. */
  byId('aiQuestion').onkeydown=function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();askAi();}}; byId('aiAskBtn').onclick=askAi;
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
    if(!html)html='<div class="ai-thread-empty">Ask a question, test your note, or keep thinking with the passage beside you.</div>';box.innerHTML=html;byId('selectionAiSend').textContent=thread&&thread.messages.length?'Reply':'Ask';
    requestAnimationFrame(function(){box.scrollTop=box.scrollHeight;placeSelectionCard();});
  }
  function showAiSetupStatus(targetId,message){
    var status=byId(targetId),button=document.createElement('button');status.textContent=(message||'Choose an AI provider in settings.')+' ';button.className='text-button';button.type='button';button.textContent='Open settings';button.onclick=function(){fillSettings();byId('settingsDialog').showModal();};status.appendChild(button);
  }
  async function askSelectionAi(){
    var ch=find(currentId),input=byId('selectionAiQuestion'),q=input.value.trim();if(!q||!ch||!aiContext||!aiContext.text)return;
    if(!hasAiRoute()){showAiSetupStatus('selectionAiStatus','On-device Gemini is not available here. Choose a cloud provider and add its key.');return;}
    var thread=aiThreadDraft?null:activeAiThread(ch),created=false;if(!thread){thread=newAiThread(ch);created=true;}
    var sentAt=now();thread.messages.push({role:'user',content:q,at:sentAt});thread.updatedAt=sentAt;input.value='';growSelectionAiQuestion();renderSelectionAiThread('Thinking…');renderQa('Thinking…');
    var button=byId('selectionAiSend');button.disabled=true;byId('selectionAiStatus').textContent='Thinking…';setTaskProgress('selectionAiProgress',null);
    try{
      var result=await runAiMessages(aiThreadMessages(ch,thread),1200,function(message,progress){byId('selectionAiStatus').textContent=message;setTaskProgress('selectionAiProgress',progress);});
      thread.messages.push({role:'assistant',content:result.text,provider:result.provider,at:now()});if(thread.messages.length>24){thread.messages=thread.messages.slice(-24);if(thread.messages[0]&&thread.messages[0].role==='assistant')thread.messages.shift();}thread.updatedAt=now();ch.aiThreads=ch.aiThreads.filter(function(item){return item.id!==thread.id;});ch.aiThreads.unshift(thread);ch.activeAiThreadId=thread.id;
      ch.questions.unshift({id:uid('q'),threadId:thread.id,question:q,answer:result.text,provider:result.provider,contextLabel:thread.contextLabel,excerpt:thread.contextText.slice(0,1200),at:now()});ch.questions=ch.questions.slice(0,40);touch(ch);byId('selectionAiStatus').textContent='Saved in this note thread · '+result.provider+'.';setTaskProgress('selectionAiProgress',100);renderSelectionAiThread();renderQa();
    }catch(error){
      if(thread.messages[thread.messages.length-1]&&thread.messages[thread.messages.length-1].role==='user'&&thread.messages[thread.messages.length-1].content===q)thread.messages.pop();if(created&&!thread.messages.length){ch.aiThreads=ch.aiThreads.filter(function(item){return item.id!==thread.id;});ch.activeAiThreadId=ch.aiThreads[0]?ch.aiThreads[0].id:'';aiThreadDraft=true;}
      input.value=q;growSelectionAiQuestion();setTaskProgress('selectionAiProgress',false);if(error&&error.aiSetup)showAiSetupStatus('selectionAiStatus',error.message);else byId('selectionAiStatus').textContent=error.message||'AI request failed';renderSelectionAiThread();renderQa();
    }button.disabled=false;
  }
  byId('selectionAiQuestion').addEventListener('input',growSelectionAiQuestion);
  byId('selectionAiQuestion').onkeydown=function(event){if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();askSelectionAi();}};
  byId('selectionAiSend').onclick=askSelectionAi;
  byId('selectionAiNew').onclick=function(){aiThreadDraft=true;byId('selectionAiStatus').textContent='New thread from this note.';renderSelectionAiThread();byId('selectionAiQuestion').focus({preventScroll:true});};
  byId('selectionAiBack').onclick=function(){byId('selectionCard').classList.remove('ai-open');byId('selectionCard').classList.add('note-open');byId('selectionAiBox').classList.add('hidden');byId('selectionContext').classList.add('hidden');byId('selectionEyebrow').textContent='Note on highlight';setSelectionAction('selectionAddNote');refreshSelectionNoteThread();placeSelectionCard();};
  async function askAi(){
    var ch=find(currentId),q=byId('aiQuestion').value.trim();if(!q)return;
    if(!aiContext||!aiContext.text){if(!setCurrentPageContext()){byId('aiStatus').textContent='Pick a context first: current page, your selection, the guide area, or a screenshot.';return;}}
    if(!hasAiRoute()){showAiSetupStatus('aiStatus','On-device Gemini is not available here. Choose a cloud provider and add its key.');return;}
    var thread=aiThreadDraft?null:activeAiThread(ch),created=false;if(!thread){thread=newAiThread(ch);created=true;}
    var sentAt=now();thread.messages.push({role:'user',content:q,at:sentAt});thread.updatedAt=sentAt;byId('aiQuestion').value='';growQuestionBox();renderQa('Thinking…');
    var btn=byId('aiAskBtn');btn.disabled=true;byId('aiStatus').textContent='Thinking…';setTaskProgress('aiTaskProgress',null);
    try{
      var result=await runAiMessages(aiThreadMessages(ch,thread),1200,function(message,progress){byId('aiStatus').textContent=message;setTaskProgress('aiTaskProgress',progress);});
      thread.messages.push({role:'assistant',content:result.text,provider:result.provider,at:now()});if(thread.messages.length>24){thread.messages=thread.messages.slice(-24);if(thread.messages[0]&&thread.messages[0].role==='assistant')thread.messages.shift();}thread.updatedAt=now();
      ch.aiThreads=ch.aiThreads.filter(function(t){return t.id!==thread.id;});ch.aiThreads.unshift(thread);ch.activeAiThreadId=thread.id;
      ch.questions.unshift({id:uid('q'),threadId:thread.id,question:q,answer:result.text,provider:result.provider,contextLabel:thread.contextLabel,excerpt:thread.contextText.slice(0,1200),at:now()});ch.questions=ch.questions.slice(0,40);touch(ch);byId('aiStatus').textContent='Saved in this thread · '+result.provider+'.';setTaskProgress('aiTaskProgress',100);renderQa();var box=byId('qaList');if(box.lastElementChild)box.lastElementChild.scrollIntoView({block:'nearest',behavior:'smooth'});
    }catch(e){
      if(thread.messages[thread.messages.length-1]&&thread.messages[thread.messages.length-1].role==='user'&&thread.messages[thread.messages.length-1].content===q)thread.messages.pop();
      if(created&&!thread.messages.length){ch.aiThreads=ch.aiThreads.filter(function(t){return t.id!==thread.id;});ch.activeAiThreadId=ch.aiThreads[0]?ch.aiThreads[0].id:'';aiThreadDraft=true;}
      byId('aiQuestion').value=q;growQuestionBox();setTaskProgress('aiTaskProgress',false);if(e&&e.aiSetup)showAiSetupStatus('aiStatus',e.message);else byId('aiStatus').textContent=e.message||'AI request failed';renderQa();
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
      if(hasAiRoute()){
        st.textContent='Distilling the claim…';
        try{
          var result=await runAi('Extract the single central scientific claim of the excerpt, then output ONLY a literature search query of 3 to 8 keywords for finding papers that test that claim. Output the query text alone: no quotes, no punctuation, no explanation.',aiContext.text.slice(0,6000),60,function(message){st.textContent=message;});
          query=String(result.text||'').replace(/[\n"“”.,;:]/g,' ').replace(/\s+/g,' ').trim();
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
    var r=await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=1000&fields=files(id,name,size,appProperties)',{headers:{Authorization:'Bearer '+token}});
    if(r.status===401){gdriveToken=null;gdriveSaveAuth();var stale=new Error('Google signed this device out — Phloem reconnects on your next tap.');stale.auth=true;throw stale;}
    if(!r.ok)throw new Error('Drive list failed ('+r.status+')');
    return ((await r.json()).files)||[];
  }
  /* Original PDFs and Word drafts ride along in the same hidden folder. Large files use Drive's resumable
     protocol: an 8 MB chunk completes at a time, and the private session URL plus the
     confirmed byte offset stay on this device so a refresh or network break continues
     instead of restarting a 100+ MB upload. */
  var GDRIVE_PDF_LIMIT=200*1024*1024,GDRIVE_CHUNK_BYTES=8*1024*1024,GDRIVE_UPLOADS_KEY='readingRoom.gdriveUploads.v1';
  var gdriveRoaming=false,gdrivePdfStates={},gdriveUploads={};
  try{gdriveUploads=JSON.parse(localStorage.getItem(GDRIVE_UPLOADS_KEY)||'{}')||{};}catch(e){gdriveUploads={};}
  function binarySourceSpec(ch){
    if(!ch)return null;if(ch.kind==='pdf')return{name:'pdf-'+ch.id+'.pdf',mime:'application/pdf',label:'PDF'};
    if(ch.sourceType==='docx')return{name:'docx-'+ch.id+'.docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',label:'Word draft'};return null;
  }
  function gdriveFormatBytes(value){var n=+value||0;if(!n)return 'size unknown';if(n<1048576)return Math.max(1,Math.round(n/1024))+' KB';return(n/1048576).toFixed(n<10485760?1:0)+' MB';}
  function gdrivePaperStatus(ch){
    var stateInfo=gdrivePdfStates[ch.id],size=gdriveFormatBytes((stateInfo&&stateInfo.size)||ch.fileSize),label='',tone='local',progress=Math.max(0,Math.min(100,stateInfo?(+stateInfo.progress||0):0));
    if(!gdriveOn())label='This device only · '+size;
    else if(!stateInfo){label='Drive · checking this file';tone='checking';}
    else if(stateInfo.state==='synced'){label='Available on your devices · '+size;tone='synced';progress=100;}
    else if(stateInfo.state==='uploading'){label='Uploading to Drive · '+progress+'%';tone='uploading';}
    else if(stateInfo.state==='fetching'){label='Downloading from Drive · '+progress+'%';tone='fetching';}
    else if(stateInfo.state==='queued'){label='Waiting to upload · '+size;tone='queued';}
    else if(stateInfo.state==='too-large'){label='Over Phloem’s 200 MB sync limit · this device only';tone='paused';}
    else if(stateInfo.state==='missing'){label='Original file is not in Drive yet';tone='paused';}
    else{label='Drive transfer paused · tap the cloud to retry';tone='paused';}
    return {label:label,tone:tone,progress:progress};
  }
  function gdriveSetPdfState(id,next){
    gdrivePdfStates[id]=next||{};var box=byId('paperDriveStatus');if(!box||box.dataset.paperId!==id)return;
    var ch=find(id);if(!ch)return;var view=gdrivePaperStatus(ch),label=box.querySelector('.cover-cloud-label'),fill=box.querySelector('.cover-cloud-track i');
    box.className='cover-cloud '+view.tone;box.setAttribute('aria-label',view.label);if(label)label.textContent=view.label;if(fill)fill.style.setProperty('--cloud-progress',view.progress+'%');
  }
  function gdriveSaveUploads(){
    var fresh={},cutoff=now()-6*86400000;Object.keys(gdriveUploads||{}).forEach(function(id){var item=gdriveUploads[id];if(item&&item.session&&(+item.at||0)>cutoff)fresh[id]=item;});gdriveUploads=fresh;
    try{if(Object.keys(fresh).length)localStorage.setItem(GDRIVE_UPLOADS_KEY,JSON.stringify(fresh));else localStorage.removeItem(GDRIVE_UPLOADS_KEY);}catch(e){}
  }
  function gdriveForgetUpload(id){if(gdriveUploads[id]){delete gdriveUploads[id];gdriveSaveUploads();}}
  function gdriveRememberUpload(id,item){gdriveUploads[id]=item;gdriveSaveUploads();return item;}
  function gdriveUploadError(response,label){var error=new Error(label+' ('+response.status+')');if(response.status===401)error.auth=true;if(response.status===404||response.status===410)error.expired=true;return error;}
  function gdriveRangeNext(response,fallback,limit){var range=response.headers.get('Range')||response.headers.get('range')||'',match=range.match(/bytes=\d+-(\d+)/i),next=match?+match[1]+1:fallback;return Math.max(0,Math.min(limit,next));}
  async function gdriveStartPdfUpload(token,ch,total,remote){
    var spec=binarySourceSpec(ch);if(!spec)throw new Error('This document has no original file to upload.');
    var metadata={name:spec.name,appProperties:{phloemHash:ch.contentHash||''}};if(!remote)metadata.parents=['appDataFolder'];
    var uploadUrl='https://www.googleapis.com/upload/drive/v3/files'+(remote?'/'+remote.id:'')+'?uploadType=resumable&fields=id,name,size',response=await fetch(uploadUrl,{method:remote?'PATCH':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':spec.mime,'X-Upload-Content-Length':String(total)},body:JSON.stringify(metadata)});
    if(!response.ok)throw gdriveUploadError(response,'Drive could not start the file upload');var session=response.headers.get('Location')||response.headers.get('location');if(!session)throw new Error('Drive did not return a resumable upload address');
    return gdriveRememberUpload(ch.id,{session:session,next:0,size:total,hash:ch.contentHash||'',at:now()});
  }
  async function gdriveResumePdfUpload(token,item,total){
    var response=await fetch(item.session,{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Range':'bytes */'+total}});
    if(response.status===308)return {complete:false,next:gdriveRangeNext(response,0,total)};
    if(response.ok)return {complete:true,next:total};
    throw gdriveUploadError(response,'Drive could not resume the file upload');
  }
  async function gdriveUploadPdf(token,ch,bytes,onProgress,remote){
    var total=bytes.byteLength,spec=binarySourceSpec(ch);if(!spec)throw new Error('This document has no original file to upload.');
    for(var restart=0;restart<2;restart++){
      var item=gdriveUploads[ch.id];
      if(item&&(+item.size!==total||(item.hash||'')!==(ch.contentHash||'')||now()-(+item.at||0)>6*86400000)){gdriveForgetUpload(ch.id);item=null;}
      if(!item)item=await gdriveStartPdfUpload(token,ch,total,remote);
      else{
        try{var resumed=await gdriveResumePdfUpload(token,item,total);if(resumed.complete){gdriveForgetUpload(ch.id);if(onProgress)onProgress(total,total);return true;}item.next=resumed.next;item.at=now();gdriveRememberUpload(ch.id,item);}
        catch(resumeError){if(resumeError.expired){gdriveForgetUpload(ch.id);continue;}throw resumeError;}
      }
      if(onProgress)onProgress(item.next,total);var expired=false;
      while(item.next<total){
        var start=item.next,end=Math.min(total,start+GDRIVE_CHUNK_BYTES),response=await fetch(item.session,{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':spec.mime,'Content-Range':'bytes '+start+'-'+(end-1)+'/'+total},body:bytes.slice(start,end)});
        if(response.status===308)item.next=gdriveRangeNext(response,end,total);
        else if(response.ok)item.next=total;
        else{var chunkError=gdriveUploadError(response,'Drive paused the file upload');if(chunkError.expired){gdriveForgetUpload(ch.id);expired=true;break;}throw chunkError;}
        item.at=now();if(item.next<total)gdriveRememberUpload(ch.id,item);if(onProgress)onProgress(item.next,total);
      }
      if(expired)continue;
      if(item.next>=total){gdriveForgetUpload(ch.id);return true;}
    }
    throw new Error('Drive upload session expired twice — tap the cloud to try again.');
  }
  async function gdriveRoamPdfs(token,files){
    if(gdriveRoaming)return {sent:0,failed:0,skipped:0};gdriveRoaming=true;
    var sent=0,failed=0,skipped=0,have={};files.forEach(function(file){have[file.name]=file;});
    try{
      for(var i=0;i<state.chapters.length;i++){
        var ch=state.chapters[i],spec=binarySourceSpec(ch);if(!spec)continue;var name=spec.name,remote=have[name],remoteHash=remote&&remote.appProperties&&remote.appProperties.phloemHash,localState=gdrivePdfStates[ch.id],needsRefresh=!!remote&&((localState&&localState.state==='queued')||(+remote.size||0)!==+ch.fileSize||(remoteHash&&ch.contentHash&&remoteHash!==ch.contentHash));
        if(remote&&!needsRefresh){gdriveForgetUpload(ch.id);gdriveSetPdfState(ch.id,{state:'synced',size:+remote.size||ch.fileSize});continue;}
        var stored=await getPdf(ch.id);if(!stored){gdriveSetPdfState(ch.id,{state:'missing',size:ch.fileSize});continue;}
        var bytes=stored instanceof ArrayBuffer?stored:await pdfBytes(stored);
        if(bytes.byteLength>GDRIVE_PDF_LIMIT){skipped++;gdriveSetPdfState(ch.id,{state:'too-large',size:bytes.byteLength});continue;}
        gdriveSetPdfState(ch.id,{state:'queued',size:bytes.byteLength});
        try{
          await gdriveUploadPdf(token,ch,bytes,function(done,total){var percent=Math.min(100,Math.round(done/total*100));gdriveSetPdfState(ch.id,{state:'uploading',size:total,progress:percent});byId('gdriveStatus').textContent='Uploading '+(ch.title||ch.sourceName||'paper')+'… '+percent+'%';syncUi('☁ Drive · '+percent+'%');},remote);
          sent++;have[name]={name:name,size:String(bytes.byteLength),appProperties:{phloemHash:ch.contentHash||''}};gdriveSetPdfState(ch.id,{state:'synced',size:bytes.byteLength,progress:100});
        }catch(uploadError){if(uploadError&&uploadError.auth)throw uploadError;failed++;gdriveSetPdfState(ch.id,{state:'paused',size:bytes.byteLength});}
      }
      return {sent:sent,failed:failed,skipped:skipped};
    }finally{gdriveRoaming=false;}
  }
  async function gdriveFetchSource(chOrId,interactive,onProgress){
    if(!gdriveOn())return null;
    var ch=typeof chOrId==='string'?find(resolvedPaperId(chOrId)):chOrId,id=ch&&ch.id,spec=binarySourceSpec(ch);if(!id||!spec)return null;
    try{
      var token=await gdriveGetToken(interactive===true),files=await gdriveListAll(token),hit=null,names=[spec.name];
      if(ch.kind==='pdf')Object.keys(state.merged||{}).forEach(function(dropId){if(resolvedPaperId(dropId)===id)names.push('pdf-'+dropId+'.pdf');});
      files.some(function(f){if(names.indexOf(f.name)>=0){hit=f;return true;}return false;});
      if(!hit){var absent=find(id);gdriveSetPdfState(id,{state:'missing',size:absent&&absent.fileSize});return null;}
      var r=await fetch('https://www.googleapis.com/drive/v3/files/'+hit.id+'?alt=media',{headers:{Authorization:'Bearer '+token}});
      if(!r.ok){gdriveSetPdfState(id,{state:'paused',size:+hit.size||0});return null;}
      var bytes;
      /* Stream the body when someone is watching: Drive reports the size up front, so
         the download card can show honest percentages instead of a silent wait. */
      if(onProgress&&r.body&&r.body.getReader){
        var total=+hit.size||0,reader=r.body.getReader(),chunks=[],loaded=0;
        onProgress(0,total);gdriveSetPdfState(id,{state:'fetching',size:total,progress:0});
        for(;;){var step=await reader.read();if(step.done)break;chunks.push(step.value);loaded+=step.value.byteLength;onProgress(loaded,total);gdriveSetPdfState(id,{state:'fetching',size:total,progress:total?Math.min(100,Math.round(loaded/total*100)):0});}
        var all=new Uint8Array(loaded),off=0;
        chunks.forEach(function(c){all.set(c,off);off+=c.byteLength;});
        bytes=all.buffer;
      }else bytes=await r.arrayBuffer();
      if(!bytes||bytes.byteLength<100)return null;
      await putPdf(id,bytes);if(ch.kind==='pdf'&&!ch.contentHash)rememberPdfFingerprint(ch,bytes);gdriveSetPdfState(id,{state:'synced',size:bytes.byteLength,progress:100});return bytes;
    }catch(e){var failed=find(id);gdriveSetPdfState(id,{state:'paused',size:failed&&failed.fileSize});return null;}
  }
  function gdriveFetchPdf(id,interactive,onProgress){return gdriveFetchSource(id,interactive,onProgress);}
  async function gdriveDeleteSource(ch){
    if(!ch)return;var id=ch.id,spec=binarySourceSpec(ch);gdriveForgetUpload(id);delete gdrivePdfStates[id];if(!gdriveOn()||!spec)return;
    try{
      var token=await gdriveGetToken(false),files=await gdriveListAll(token);
      for(var i=0;i<files.length;i++)if(files[i].name===spec.name)await fetch('https://www.googleapis.com/drive/v3/files/'+files[i].id,{method:'DELETE',headers:{Authorization:'Bearer '+token}});
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
        if(got.ok){try{var remote=await got.json();if(remote&&Array.isArray(remote.chapters)&&mergeState(remote)){persist(false);renderShelf();updateReviewBadge();}}catch(parseError){}}
      }
      await repairDuplicateStorage();
      var payload=JSON.stringify({chapters:await chaptersForSync(),deleted:state.deleted||{},merged:state.merged||{},categoryOrder:state.categoryOrder||[],categoryOrderUpdatedAt:state.categoryOrderUpdatedAt||0}),up;
      if(fileId){
        up=await fetch('https://www.googleapis.com/upload/drive/v3/files/'+fileId+'?uploadType=media',{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:payload});
      }else{
        var boundary='phloem'+now();
        var body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify({name:GDRIVE_FILE,parents:['appDataFolder']})+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+payload+'\r\n--'+boundary+'--';
        up=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'multipart/related; boundary='+boundary},body:body});
      }
      if(!up.ok){var upErr=new Error('Drive upload failed ('+up.status+')');if(up.status===401)upErr.auth=true;throw upErr;}
      byId('gdriveStatus').textContent='Library synced — checking original files…';
      var roam=await gdriveRoamPdfs(token,files);
      await gdrivePruneMergedPdfs(token);
      byId('gdriveStatus').textContent='Synced with your Google Drive.'+(roam.sent?' '+roam.sent+' original file'+(roam.sent===1?'':'s')+' uploaded.':'')+(roam.failed?' '+roam.failed+' upload'+(roam.failed===1?'':'s')+' paused — Phloem resumes on the next sync.':'')+(roam.skipped?' '+roam.skipped+' file'+(roam.skipped===1?' is':'s are')+' over the 200 MB sync limit.':'');
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
    localStorage.removeItem(GDRIVE_KEY);gdriveCfg=null;gdriveToken=null;gdriveTokenAt=0;gdriveEmail='';gdrivePdfStates={};fillSettings();syncUi();renderShelf();
  };

  /* encrypted GitHub state sync + PDF picker */
  function aiProviderNote(id){
    if(id==='auto')return 'Private mode keeps review text on this device and never falls back to a cloud provider. Choose one of the providers below when you want high-accuracy review rechecks.';
    if(id==='compatible')return 'For OpenRouter, a local model gateway, or another service that accepts OpenAI-style chat completions. The endpoint must allow browser requests (CORS).';
    return 'For reviewer files, exact quoted passages are linked locally first; '+AI_PROVIDERS[id].label+' handles classification and the remaining passage matches in parallel. Other AI questions also use '+AI_PROVIDERS[id].label+'. The key is excluded from library sync and backups.';
  }
  function renderAiProviderFields(){
    var id=byId('aiProvider').value,cfg=aiSettings.providers[id]||{},cloud=id!=='auto',prepare=byId('aiPrepareLocal');byId('aiCloudFields').classList.toggle('hidden',!cloud);byId('aiEndpointFields').classList.toggle('hidden',id!=='compatible');byId('aiProviderNote').textContent=aiProviderNote(id);prepare.classList.toggle('hidden',id!=='auto'||!browserLanguageModel());prepare.disabled=false;prepare.textContent='Prepare on-device Gemini';setTaskProgress('aiKeyProgress',false);
    if(cloud){byId('aiKey').value=cfg.key||'';byId('aiKey').placeholder=AI_PROVIDERS[id].label+' API key';byId('aiModel').value=cfg.model||AI_PROVIDERS[id].model||'';byId('aiEndpoint').value=cfg.endpoint||'';}refreshAiSettingsStatus(id);
  }
  async function refreshAiSettingsStatus(id){
    var status=byId('aiKeyStatus');if(id!=='auto'){var cfg=aiSettings.providers[id]||{};status.textContent=cfg.key?'Ready to use '+AI_PROVIDERS[id].label+'.':'Add a key and save to use '+AI_PROVIDERS[id].label+'.';return;}
    var api=browserLanguageModel();if(!api){status.textContent='Gemini Nano is unavailable in this browser. Choose a cloud provider below to use AI.';return;}status.textContent='Checking on-device Gemini…';
    try{var availability=api.availability?await api.availability():api.capabilities?(await api.capabilities()).available:'available',prepare=byId('aiPrepareLocal');if(byId('aiProvider').value!=='auto')return;if(availability==='available'||availability==='readily'){status.textContent='On-device Gemini is ready. Your reading context stays on this device.';prepare.textContent='Gemini ready';prepare.disabled=true;setTaskProgress('aiKeyProgress',false);}else if(availability==='downloadable'||availability==='after-download'||availability==='downloading'){status.textContent=availability==='downloading'?'Chrome is downloading Gemini in the background. Press Prepare to show its progress here.':'Press Prepare on-device Gemini now so a long review does not have to wait for Chrome’s first download.';}else status.textContent='Gemini Nano cannot run on this device. Choose a cloud provider to use AI.';}
    catch(e){if(byId('aiProvider').value==='auto')status.textContent='Could not start on-device Gemini. Choose a cloud provider to use AI.';}
  }
  function fillAiSettings(){aiSettings=loadAiSettings();byId('aiProvider').value=aiSettings.provider||'auto';renderAiProviderFields();}
  function fillSettings(){
    byId('syncRepo').value=syncCfg?syncCfg.repo||'':'';byId('syncToken').value=syncCfg?syncCfg.token||'':'';byId('syncPass').value=syncCfg?syncCfg.pass||'':'';byId('syncNowBtn').classList.toggle('hidden',!syncCfg);byId('syncOffBtn').classList.toggle('hidden',!syncCfg);fillAiSettings();
    byId('gdriveConnectBtn').textContent=gdriveOn()?'Sign in again':'Connect Google Drive';
    byId('gdriveConnectBtn').classList.toggle('button',!gdriveOn());byId('gdriveConnectBtn').classList.toggle('soft-button',gdriveOn());
    byId('gdriveSyncBtn').classList.toggle('hidden',!gdriveOn());byId('gdriveOffBtn').classList.toggle('hidden',!gdriveOn());
    byId('gdriveStatus').textContent=gdriveOn()?'Connected'+(gdriveEmail?' as '+gdriveEmail:'')+' — your library syncs automatically. PDFs and Word drafts follow you between devices.':'Not connected.';
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
    if(Array.isArray(inc.categoryOrder)&&(+inc.categoryOrderUpdatedAt||0)>(+state.categoryOrderUpdatedAt||0)){state.categoryOrder=inc.categoryOrder.slice();state.categoryOrderUpdatedAt=+inc.categoryOrderUpdatedAt||0;changed=true;}
    Object.keys(inc.merged||{}).forEach(function(dropId){var keepId=inc.merged[dropId];if(!keepId||dropId===keepId)return;if(state.merged[dropId]!==keepId){state.merged[dropId]=keepId;changed=true;}if(find(dropId))queueDuplicateStorage(keepId,dropId);});
    Object.keys(inc.deleted||{}).forEach(function(id){if((inc.deleted[id]||0)>(state.deleted[id]||0)){state.deleted[id]=inc.deleted[id];changed=true;}});
    var kept=state.chapters.filter(function(ch){if(!state.deleted[ch.id])return true;var keepId=resolvedPaperId(ch.id);if(keepId!==ch.id)queueDuplicateStorage(keepId,ch.id);else deletePdf(ch.id);changed=true;return false;});if(kept.length!==state.chapters.length)state.chapters=kept;
    (inc.chapters||[]).forEach(function(remote){
      if(!remote||!remote.id||state.deleted[remote.id])return;normalize(remote);var local=find(remote.id);
      if(!local){state.chapters.push(remote);if(remote.kind==='pdf')saveDerivedSoon(remote);changed=true;return;}
      var localReviewAt=reviewStateStamp(local),remoteReviewAt=reviewStateStamp(remote);
      if((remote.updatedAt||0)>(local.updatedAt||0)){if(localReviewAt>remoteReviewAt)copyReviewState(remote,local);state.chapters[state.chapters.indexOf(local)]=remote;if(remote.kind==='pdf')saveDerivedSoon(remote);changed=true;return;}
      if(remoteReviewAt>localReviewAt){copyReviewState(local,remote);changed=true;}
      if(remote.kind==='pdf'){if(remote.contentHash&&!local.contentHash){local.contentHash=remote.contentHash;changed=true;}if(remote.fileSize&&!local.fileSize){local.fileSize=remote.fileSize;changed=true;}if(mergeDerivedInto(local,derivedData(remote)))saveDerivedSoon(local);}
    });
    if(migrateReviewWorkspaceLabels(state,true))changed=true;
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
        var syncChapters=await chaptersForSync(),payload=await encryptState(syncCfg.pass,{chapters:syncChapters,deleted:state.deleted||{},merged:state.merged||{},categoryOrder:state.categoryOrder||[],categoryOrderUpdatedAt:state.categoryOrderUpdatedAt||0}),body={message:'Phloem reading notes sync',content:btoa(payload)};if(sha)body.sha=sha;
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
  /* A device link is a direct hand-off, independent of library sync. It always carries
     the AI provider configuration (including every saved key) and includes GitHub
     credentials only when present. Google OAuth sessions are deliberately never copied. */
  function aiKeyCount(settings){var count=0;Object.keys(settings&&settings.providers||{}).forEach(function(id){if(settings.providers[id]&&settings.providers[id].key)count++;});return count;}
  function encodeSetup(payload){return btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  function decodeSetup(encoded){encoded=String(encoded||'').replace(/-/g,'+').replace(/_/g,'/');while(encoded.length%4)encoded+='=';return JSON.parse(decodeURIComponent(escape(atob(encoded))));}
  byId('syncLinkBtn').onclick=function(){
    var settings=loadAiSettings(),payload={v:2,aiSettings:settings};if(syncCfg)payload.github={repo:syncCfg.repo,token:syncCfg.token,pass:syncCfg.pass};if(gdriveOn())payload.googleDrive=true;
    var link=location.href.split('#')[0]+'#phloem-setup='+encodeSetup(payload),keys=aiKeyCount(settings),status=byId('deviceLinkStatus');
    if(!(navigator.clipboard&&navigator.clipboard.writeText)){status.textContent='This browser cannot copy the setup link. Try opening Phloem in Safari, Chrome, or Edge.';return;}
    navigator.clipboard.writeText(link).then(function(){status.textContent='Private setup link copied with '+keys+' AI '+(keys===1?'key':'keys')+(syncCfg?' and GitHub sync credentials':'')+'. Send it only to yourself.';},function(){status.textContent='The browser blocked copying. Allow clipboard access, then try again.';});
  };
  function importSetup(){
    var m=location.hash.match(/^#(?:phloem|carrel|margin)-setup=(.+)$/);if(!m)return;
    /* Strip only the hash: wiping the phloem history state mid-read would break the
       back gesture's layer accounting. */
    history.replaceState(history.state&&history.state.phloem?{phloem:history.state.phloem}:null,'',location.pathname+location.search);
    try{
      var cfg=decodeSetup(m[1]),linkedSync=cfg.github&&cfg.github.repo&&cfg.github.token&&cfg.github.pass?cfg.github:(cfg.repo&&cfg.token&&cfg.pass?{repo:cfg.repo,token:cfg.token,pass:cfg.pass}:null),linkedAi=cfg.aiSettings&&cfg.aiSettings.providers?cfg.aiSettings:null,parts=[];
      if(linkedAi)parts.push(aiKeyCount(linkedAi)+' saved AI '+(aiKeyCount(linkedAi)===1?'key':'keys')+' and provider settings');
      else if(cfg.ai)parts.push('a saved DeepSeek key');
      if(linkedSync)parts.push('GitHub sync for '+linkedSync.repo);
      if(cfg.googleDrive)parts.push('a reminder to sign in to Google Drive');
      if(parts.length&&confirm('Configure this device with '+parts.join(', ')+'? Only continue if you made this private link yourself.')){
        if(linkedAi){try{localStorage.setItem(AI_SETTINGS_KEY,JSON.stringify(linkedAi));var linkedDeepSeek=linkedAi.providers.deepseek&&linkedAi.providers.deepseek.key;if(linkedDeepSeek)localStorage.setItem(LEGACY_AI_KEY,linkedDeepSeek);else localStorage.removeItem(LEGACY_AI_KEY);}catch(e){}}
        else if(cfg.ai){try{localStorage.setItem(LEGACY_AI_KEY,cfg.ai);localStorage.removeItem(AI_SETTINGS_KEY);}catch(e){}}
        aiSettings=loadAiSettings();if(linkedSync){syncCfg={repo:linkedSync.repo,token:linkedSync.token,pass:linkedSync.pass};localStorage.setItem(SYNC_KEY,JSON.stringify(syncCfg));}
        byId('syncSignal').title='';fillSettings();byId('deviceLinkStatus').textContent='This device is configured'+(cfg.googleDrive&&!gdriveOn()?'. Sign in to Google Drive above to reconnect library sync.':'.');if(linkedSync)doSync();
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
  byId('githubPickBtn').onclick=function(){closeAddDialog();openGithubPicker();};byId('githubRefresh').onclick=function(){listGithubPapers(githubPath);};
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
  byId('aiProvider').onchange=function(){aiSettings.provider=this.value;renderAiProviderFields();};
  function startLocalAiPreparation(){var button=byId('aiPrepareLocal'),status=byId('aiKeyStatus');button.disabled=true;button.textContent='Preparing…';setTaskProgress('aiKeyProgress',null);prepareBrowserAi(function(message,progress){status.textContent=message;setTaskProgress('aiKeyProgress',progress);}).then(function(){button.textContent='Gemini ready';button.disabled=true;setTaskProgress('aiKeyProgress',100);},function(error){status.textContent=error.message||'Chrome could not prepare on-device Gemini.';button.textContent='Try preparing again';button.disabled=false;setTaskProgress('aiKeyProgress',false);});}
  byId('aiPrepareLocal').onclick=startLocalAiPreparation;
  byId('aiKeySave').onclick=function(){
    var id=byId('aiProvider').value;aiSettings.provider=id;
    if(id!=='auto'){
      var key=byId('aiKey').value.trim(),model=byId('aiModel').value.trim(),endpoint=byId('aiEndpoint').value.trim();if(!model){byId('aiKeyStatus').textContent='Add a model name first.';return;}
      if(id==='compatible'){if(!endpoint){byId('aiKeyStatus').textContent='Add the full chat-completions endpoint first.';return;}try{var parsed=new URL(endpoint);if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&(parsed.hostname==='localhost'||parsed.hostname==='127.0.0.1')))throw new Error();}catch(e){byId('aiKeyStatus').textContent='Use an HTTPS endpoint, or HTTP only for localhost.';return;}}
      aiSettings.providers[id]={key:key,model:model,endpoint:id==='compatible'?endpoint:''};if(id==='deepseek'){if(key)localStorage.setItem(LEGACY_AI_KEY,key);else localStorage.removeItem(LEGACY_AI_KEY);}
    }
    saveAiSettings();byId('aiKeyStatus').textContent=id==='auto'?'Automatic AI saved. Asking Chrome to prepare Gemini now…':(aiSettings.providers[id].key?'Saved '+AI_PROVIDERS[id].label+' on this device.':'Key removed; '+AI_PROVIDERS[id].label+' is not active until you add one.');if(id==='auto'&&browserLanguageModel())startLocalAiPreparation();else setTaskProgress('aiKeyProgress',false);
  };
  byId('backupBtn').onclick=function(){var blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='phloem-reading-backup.json';a.click();URL.revokeObjectURL(a.href);};
  byId('restoreBtn').onclick=function(){byId('restoreFile').click();};byId('restoreFile').onchange=function(){var f=this.files[0];this.value='';if(!f)return;f.text().then(function(t){var inc=JSON.parse(t);if(!inc||!Array.isArray(inc.chapters))throw new Error();mergeState(inc);persist();renderShelf();updateReviewBadge();byId('syncStatus').textContent='Backup merged into this library.';}).catch(function(){byId('syncStatus').textContent='That backup file is not valid.';});};

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

  /* Registration begins in reading.html before this deferred bundle. Keeping it out
     of here avoids racing the versioned worker with an older unversioned URL. */
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
  var startupLibraryWork=[startupStarterGuide];
  syncUi();renderShelf();updateReviewBadge();if(gdriveOn()){loadGis().catch(function(){});startupLibraryWork.push(startupDuplicateRepair.then(function(){return gdriveSync();}));}
  Promise.allSettled(startupLibraryWork).then(function(){libraryHydrating=false;renderShelf();updateReviewBadge();});
  /* A refresh drops you back into the paper you were reading, not the library. */
  try{var lastOpen=resolvedPaperId(localStorage.getItem(LAST_OPEN_KEY));if(lastOpen&&find(lastOpen))openReader(lastOpen);}catch(e){}Promise.all(state.chapters.filter(function(ch){return ch.kind==='pdf'&&derivedData(ch);}).map(putDerived)).then(function(){return startupDuplicateRepair;}).then(function(){persist(false);if(syncCfg)doSync();},function(){persist(false);if(syncCfg)doSync();});
  if(location.protocol==='file:') byId('launchDialog').showModal();
})();
