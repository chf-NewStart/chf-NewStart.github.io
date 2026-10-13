/* Frozen from reading.js at b27db65e (reader v206); v207's merge code is the same. These
   versions predate PDF sticky notes. tests/reading-pdf-sticky-notes.test.js runs these
   exact functions as an older installed copy of Phloem (web or iPad app) would when it
   merges a synced library and saves it again. Do not update this file with newer code. */
  function normalize(ch,options){
    if(typeof normalizeReadingKeeps==='function')normalizeReadingKeeps(ch);
    if(typeof normalizeReadingExcerpts==='function')normalizeReadingExcerpts(ch);
    if(typeof normalizeReadingWorkspace==='function')normalizeReadingWorkspace(ch);
    if(typeof normalizePdfFolds==='function')normalizePdfFolds(ch,options&&options.foldValidationNow);
    if(window.PhloemInk&&(ch.kind==='pdf'||ch.pdfInk||ch.pdfInkDeleted)){var ink=window.PhloemInk.normalize(ch.pdfInk,ch.pdfInkDeleted);ch.pdfInk=ink.pages;ch.pdfInkDeleted=ink.deleted;}
    ch.notes = ch.notes&&typeof ch.notes==='object'&&!Array.isArray(ch.notes)?ch.notes:{}; ch.pageNotes = ch.pageNotes&&typeof ch.pageNotes==='object'&&!Array.isArray(ch.pageNotes)?ch.pageNotes:{}; ch.tags = Array.isArray(ch.tags)?ch.tags:[];
    ch.questions = Array.isArray(ch.questions)?ch.questions:[]; ch.highlights = ch.highlights&&typeof ch.highlights==='object'&&!Array.isArray(ch.highlights)?ch.highlights:{}; ch.textHighlights = Array.isArray(ch.textHighlights)?ch.textHighlights:[];
    if(!Array.isArray(ch.aiThreads))ch.aiThreads=[];
    if(!ch.aiThreads.length&&ch.questions.length)ch.aiThreads=ch.questions.slice(0,12).map(function(q){return {id:'legacy-'+(q.id||uid('q')),contextLabel:q.contextLabel||'Earlier question',contextText:q.excerpt||'',messages:[{role:'user',content:q.question||'',at:q.at||now()},{role:'assistant',content:q.answer||'',at:q.at||now()}],createdAt:q.at||now(),updatedAt:q.at||now()};});
    ch.aiThreads=ch.aiThreads.filter(function(t){return t&&t.id&&Array.isArray(t.messages);}).slice(0,12);if(ch.activeAiThreadId&&!ch.aiThreads.some(function(t){return t.id===ch.activeAiThreadId;}))ch.activeAiThreadId='';if(!ch.activeAiThreadId&&ch.aiThreads[0])ch.activeAiThreadId=ch.aiThreads[0].id;
    ch.readerHighlights = Array.isArray(ch.readerHighlights)?ch.readerHighlights:[]; ch.readerNotes = ch.readerNotes&&typeof ch.readerNotes==='object'&&!Array.isArray(ch.readerNotes)?ch.readerNotes:{}; ch.termLookups = ch.termLookups&&typeof ch.termLookups==='object'&&!Array.isArray(ch.termLookups)?ch.termLookups:{}; ch.reviews = ch.reviews&&typeof ch.reviews==='object'&&!Array.isArray(ch.reviews)?ch.reviews:{};
    ch.reviewComments=Array.isArray(ch.reviewComments)?ch.reviewComments.filter(function(comment){return comment&&typeof comment==='object';}):[];
    ch.reviewReports=Array.isArray(ch.reviewReports)?ch.reviewReports.filter(function(report){return report&&typeof report==='object';}):[];ch.reviewUpdatedAt=+ch.reviewUpdatedAt||0;ch.reviewClearedAt=+ch.reviewClearedAt||0;var legacyReviewReports={},reviewReportsById={};ch.reviewReports.forEach(function(report){reviewReportsById[String(report.id||'')]=report;if(!report.extractorVersion||report.extractorVersion<3)legacyReviewReports[report.id]=1;});
    ch.reviewComments.forEach(function(comment){comment.text=trimReviewRecommendationTail(comment.text);comment.sourceGroup=String(comment.sourceGroup||'');comment.sourceNumber=String(comment.sourceNumber||'');comment.replies=Array.isArray(comment.replies)?comment.replies:[];comment.anchors=Array.isArray(comment.anchors)?comment.anchors:(comment.anchored&&comment.para!==null&&comment.para!==undefined?[{para:comment.para,start:comment.start,end:comment.end,quote:comment.quote||'',method:comment.anchorMethod||'ai'}]:[]);comment.anchors=comment.anchors.map(function(anchor){return{para:+anchor.para,start:+anchor.start||0,end:+anchor.end||0,quote:String(anchor.quote||''),method:String(anchor.method||comment.anchorMethod||'ai'),manual:!!anchor.manual};}).filter(function(anchor){return Number.isInteger(anchor.para)&&anchor.para>=0&&anchor.end>anchor.start;});comment.response=String(comment.response||'');if(reviewResponseWasImported(comment,reviewReportsById[String(comment.sourceId||'')])){comment.response='';comment.importedResponseRemoved=true;}comment.responseWrittenByUser=!!comment.response&&(!!comment.responseWrittenByUser||!comment.importedResponseRemoved);comment.locationHint=String(comment.locationHint||'');comment.level=normalizeReviewLevel(comment.level,comment);comment.topic=normalizeReviewTopic(comment.topic);comment.page=+comment.page||null;comment.manualReviewLink=!!comment.manualReviewLink;comment.manualLocationRejected=!!comment.manualLocationRejected;comment.pdfAnchors=Array.isArray(comment.pdfAnchors)?comment.pdfAnchors.map(function(anchor){return{page:+anchor.page||null,quote:String(anchor.quote||''),confidence:Math.max(0,Math.min(1,+anchor.confidence||0)),method:String(anchor.method||'ai-pdf-page'),manual:!!anchor.manual||String(anchor.method||'').indexOf('manual-')===0};}).filter(function(anchor){return anchor.page;}):[];if(!comment.pdfAnchors.length&&comment.page)comment.pdfAnchors=[{page:comment.page,quote:String(comment.quote||''),confidence:Math.max(0,Math.min(1,+comment.matchConfidence||0)),method:String(comment.anchorMethod||'ai-pdf-page'),manual:comment.manualReviewLink}];comment.legacyImport=!!legacyReviewReports[comment.sourceId];if(comment.legacyImport&&!comment.manualReviewLink){comment.anchored=false;comment.page=null;comment.quote='';comment.pdfAnchors=[];}comment.resolved=!!comment.resolved;});
    ch.addedAt = ch.addedAt || now(); ch.updatedAt = ch.updatedAt || ch.addedAt;ch.lastOpenedAt=+ch.lastOpenedAt||0;
    ch.readPage = ch.readPage || 1; ch.kind = ch.kind || (ch.pageTexts ? 'pdf' : 'text');
    var savedPosition=normalizedPdfPosition(ch.pdfPosition);if(savedPosition)ch.pdfPosition=savedPosition;else delete ch.pdfPosition;
    return ch;
  }
  function mergePdfInk(target,first,second){
    if(!window.PhloemInk)return false;var before=JSON.stringify([target.pdfInk,target.pdfInkDeleted]),merged=window.PhloemInk.merge(first.pdfInk,first.pdfInkDeleted,second.pdfInk,second.pdfInkDeleted);target.pdfInk=merged.pages;target.pdfInkDeleted=merged.deleted;return before!==JSON.stringify([target.pdfInk,target.pdfInkDeleted]);
  }
  function mergeDuplicateRecord(keep,extra){
    var validationNow=now();normalize(keep,{foldValidationNow:validationNow});normalize(extra,{foldValidationNow:validationNow});
    // Decide explicit details before the legacy import-quality merge fills blanks.
    var details=Object.assign({},keep);mergeStampedFields(details,extra);
    if(!fieldStamp(details,'title')&&!details.titleEditedByUser&&extra.titleEditedByUser)copyPaperField(details,extra,'title');
    mergePdfInk(keep,keep,extra);
    if(typeof mergeReadingKeeps==='function')mergeReadingKeeps(keep,keep,extra);
    if(typeof mergeReadingExcerpts==='function')mergeReadingExcerpts(keep,keep,extra);
    if(typeof mergeReadingWorkspace==='function')mergeReadingWorkspace(keep,keep,extra);
    if(typeof mergePdfFolds==='function')mergePdfFolds(keep,keep,extra,validationNow);
    Object.keys(extra).forEach(function(k){if(k!=='id'&&(keep[k]===undefined||keep[k]===null||keep[k]===''))keep[k]=extra[k];});
    if(titleQuality(extra)>titleQuality(keep))keep.title=extra.title;
    if(String(extra.authors||'').length>String(keep.authors||'').length)keep.authors=extra.authors;
    keep.tags=mergeTags(keep.tags,extra.tags);keep.notes=mergeNoteMap(keep.notes,extra.notes);keep.pageNotes=mergeNoteMap(keep.pageNotes,extra.pageNotes);keep.readerNotes=mergeNoteMap(keep.readerNotes,extra.readerNotes);
    keep.questions=mergeItemArrays(keep.questions,extra.questions);keep.aiThreads=mergeItemArrays(keep.aiThreads,extra.aiThreads).sort(function(a,b){return (+b.updatedAt||0)-(+a.updatedAt||0);}).slice(0,12);keep.textHighlights=mergeItemArrays(keep.textHighlights,extra.textHighlights);keep.readerHighlights=mergeItemArrays(keep.readerHighlights,extra.readerHighlights);keep.highlights=mergeHighlightMap(keep.highlights,extra.highlights);
    keep.reviews=mergeReviews(keep.reviews,extra.reviews);keep.termLookups=mergeLookups(keep.termLookups,extra.termLookups);
    var cursor=newerPdfPosition(keep.pdfPosition,extra.pdfPosition);if(cursor){keep.pdfPosition=cursor;keep.readPage=cursor.page;if(Number.isFinite(cursor.zoom)){keep.zoom=cursor.zoom;keep.zoomPreferenceV=PDF_ZOOM_PREFERENCE_VERSION;}}else keep.readPage=Math.max(+keep.readPage||1,+extra.readPage||1);
    keep.readThroughPage=Math.max(+keep.readThroughPage||0,+extra.readThroughPage||0)||keep.readThroughPage;keep.pageCount=Math.max(+keep.pageCount||0,+extra.pageCount||0)||keep.pageCount;keep.fileSize=Math.max(+keep.fileSize||0,+extra.fileSize||0)||keep.fileSize;keep.lastOpenedAt=Math.max(+keep.lastOpenedAt||0,+extra.lastOpenedAt||0);
    keep.addedAt=Math.min(+keep.addedAt||now(),+extra.addedAt||now());keep.updatedAt=Math.max(+keep.updatedAt||0,+extra.updatedAt||0);
    STAMPED_FIELDS.forEach(function(field){if(fieldStamp(details,field)){copyPaperField(keep,details,field);var stamps=Object.assign({},keep.fieldUpdatedAt);stamps[field]=fieldStamp(details,field);keep.fieldUpdatedAt=stamps;}});
    if(!fieldStamp(details,'title')&&details.titleEditedByUser)copyPaperField(keep,details,'title');
    if(extra.kind==='pdf')mergeDerivedInto(keep,derivedData(extra));return keep;
  }
  var STAMPED_FIELDS=['title','authors','tags','category'];
  function fieldStamp(ch,field){var value=ch&&ch.fieldUpdatedAt&&ch.fieldUpdatedAt[field];return typeof value==='number'&&Number.isSafeInteger(value)&&value>0?value:0;}
  function manualPaperField(ch,field){return !!fieldStamp(ch,field)||(field==='title'&&!!ch.titleEditedByUser);}
  function copyPaperField(target,source,field){
    if(source[field]===undefined)delete target[field];else target[field]=Array.isArray(source[field])?source[field].slice():source[field];
    if(field==='title')target.titleEditedByUser=!!source.titleEditedByUser;
  }
  function stampFields(ch,fields){
    var at=now(),stamps=Object.assign({},ch.fieldUpdatedAt);
    fields.forEach(function(field){stamps[field]=Math.max(at,fieldStamp(ch,field)+1);});ch.fieldUpdatedAt=stamps;
  }
  function paperFieldTieKey(ch,field){return JSON.stringify([ch[field]===undefined?null:ch[field],field==='title'&&!!ch.titleEditedByUser]);}
  function mergeStampedFields(target,source){
    var changed=false;
    STAMPED_FIELDS.forEach(function(field){
      var at=fieldStamp(source,field),current=fieldStamp(target,field);
      // Pre-clock versions already marked manual renames. Keep that intent over an
      // automatic title, without inventing a rename time from unrelated note edits.
      if(field==='title'&&!at&&source.titleEditedByUser&&!manualPaperField(target,'title')){copyPaperField(target,source,field);changed=true;return;}
      if(!at||at<current)return;
      // Concurrent edits can share a millisecond. A stable tie-break prevents two
      // devices from exchanging different values forever at the same field clock.
      if(at===current&&paperFieldTieKey(source,field)<=paperFieldTieKey(target,field))return;
      copyPaperField(target,source,field);
      var stamps=Object.assign({},target.fieldUpdatedAt);stamps[field]=at;target.fieldUpdatedAt=stamps;changed=true;
    });
    return changed;
  }
  function mergeState(inc){
    var changed=false,foldValidationNow=now();state.deleted=state.deleted||{};state.merged=state.merged||{};
    if(Array.isArray(inc.categoryOrder)&&(+inc.categoryOrderUpdatedAt||0)>(+state.categoryOrderUpdatedAt||0)){state.categoryOrder=inc.categoryOrder.slice();state.categoryOrderUpdatedAt=+inc.categoryOrderUpdatedAt||0;changed=true;}
    Object.keys(inc.merged||{}).forEach(function(dropId){var keepId=inc.merged[dropId];if(!keepId||dropId===keepId)return;if(state.merged[dropId]!==keepId){state.merged[dropId]=keepId;changed=true;}if(find(dropId))queueDuplicateStorage(keepId,dropId);});
    Object.keys(inc.deleted||{}).forEach(function(id){if((inc.deleted[id]||0)>(state.deleted[id]||0)){state.deleted[id]=inc.deleted[id];changed=true;}});
    var kept=state.chapters.filter(function(ch){if(!state.deleted[ch.id])return true;var keepId=resolvedPaperId(ch.id);if(keepId!==ch.id)queueDuplicateStorage(keepId,ch.id);else deletePdf(ch.id);changed=true;return false;});if(kept.length!==state.chapters.length)state.chapters=kept;
    (inc.chapters||[]).forEach(function(remote){
      if(!remote||!remote.id||state.deleted[remote.id])return;normalize(remote,{foldValidationNow:foldValidationNow});var local=find(remote.id);
      if(!local){state.chapters.push(remote);if(remote.kind==='pdf')saveDerivedSoon(remote);changed=true;return;}
      if(mergePdfInk(local,local,remote))changed=true;remote.pdfInk=local.pdfInk;remote.pdfInkDeleted=local.pdfInkDeleted;
      if(typeof mergeReadingKeeps==='function'){
        if(mergeReadingKeeps(remote,local,remote))changed=true;
        if(mergeReadingKeeps(local,local,remote))changed=true;
      }
      if(typeof mergeReadingExcerpts==='function'){
        if(mergeReadingExcerpts(remote,local,remote))changed=true;
        if(mergeReadingExcerpts(local,local,remote))changed=true;
      }
      if(typeof mergeReadingWorkspace==='function'){
        if(mergeReadingWorkspace(remote,local,remote))changed=true;
        if(mergeReadingWorkspace(local,local,remote))changed=true;
      }
      if(typeof mergePdfFolds==='function'){
        if(mergePdfFolds(remote,local,remote,foldValidationNow))changed=true;
        if(mergePdfFolds(local,local,remote,foldValidationNow))changed=true;
      }
      var localReviewAt=reviewStateStamp(local),remoteReviewAt=reviewStateStamp(remote),cursor=newerPdfPosition(local.pdfPosition,remote.pdfPosition),lastOpened=Math.max(+local.lastOpenedAt||0,+remote.lastOpenedAt||0),readThrough=Math.max(+local.readThroughPage||0,+remote.readThroughPage||0);
      if((remote.updatedAt||0)>(local.updatedAt||0)){mergeStampedFields(remote,local);if(localReviewAt>remoteReviewAt)copyReviewState(remote,local);if(cursor){remote.pdfPosition=cursor;remote.readPage=cursor.page;if(Number.isFinite(cursor.zoom)){remote.zoom=cursor.zoom;remote.zoomPreferenceV=PDF_ZOOM_PREFERENCE_VERSION;}}remote.lastOpenedAt=lastOpened;remote.readThroughPage=readThrough||remote.readThroughPage;state.chapters[state.chapters.indexOf(local)]=remote;if(remote.kind==='pdf')saveDerivedSoon(remote);changed=true;return;}
      if(cursor&&(!local.pdfPosition||(cursor.updatedAt||0)>(local.pdfPosition.updatedAt||0))){local.pdfPosition=cursor;local.readPage=cursor.page;if(Number.isFinite(cursor.zoom)){local.zoom=cursor.zoom;local.zoomPreferenceV=PDF_ZOOM_PREFERENCE_VERSION;}changed=true;}
      if(lastOpened>(+local.lastOpenedAt||0)){local.lastOpenedAt=lastOpened;changed=true;}if(readThrough>(+local.readThroughPage||0)){local.readThroughPage=readThrough;changed=true;}
      if(mergeStampedFields(local,remote))changed=true;
      if(remoteReviewAt>localReviewAt){copyReviewState(local,remote);changed=true;}
      if(remote.kind==='pdf'){if(remote.contentHash&&!local.contentHash){local.contentHash=remote.contentHash;changed=true;}if(remote.fileSize&&!local.fileSize){local.fileSize=remote.fileSize;changed=true;}if(mergeDerivedInto(local,derivedData(remote)))saveDerivedSoon(local);}
    });
    if(migrateReviewWorkspaceLabels(state,true))changed=true;
    var exact=duplicateGroups(state.chapters,true);if(exact.length){collapseDuplicateGroups(exact);changed=true;}
    if(currentId&&state.deleted[currentId]){var resolved=resolvedPaperId(currentId);if(find(resolved)){currentId=resolved;try{localStorage.setItem(LAST_OPEN_KEY,resolved);}catch(e){}}else{currentId=null;pdfDoc=null;if(!byId('readerPage').classList.contains('hidden'))showPage('libraryPage');}}
    if(changed&&currentId&&typeof renderReadingKeeps==='function')renderReadingKeeps();
    if(changed&&typeof renderReadingExcerpts==='function')renderReadingExcerpts();
    return changed;
  }
