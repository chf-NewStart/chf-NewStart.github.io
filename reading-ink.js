/* Local vector handwriting. No network, PDF mutation, or credential access. */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var COLORS = { black: '#20313b', blue: '#245bc1', red: '#ba3f35' };
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function stamp(stroke) { return +stroke.updatedAt || +stroke.at || 0; }
  function normalize(pages, deleted) {
    var tombstones = {}, records = new Map(), out = {};
    Object.keys(deleted || {}).forEach(function (id) {
      if (id && id !== '__proto__' && id !== 'constructor' && Number.isFinite(deleted[id]) && deleted[id] > 0) tombstones[id] = deleted[id];
    });
    Object.keys(pages || {}).forEach(function (page) {
      if (!/^[1-9]\d*$/.test(page) || !Array.isArray(pages[page])) return;
      pages[page].forEach(function (raw) {
        if (!raw || typeof raw.id !== 'string' || !raw.id || raw.id === '__proto__' || raw.id === 'constructor' || !Array.isArray(raw.points) || !raw.points.length) return;
        if (!raw.points.every(function (p) { return Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && (p[2] === undefined || Number.isFinite(p[2])); })) return;
        var at = Number.isFinite(raw.at) && raw.at > 0 ? raw.at : 0;
        var item = { id: raw.id, color: Object.hasOwn ? (Object.hasOwn(COLORS, raw.color) ? raw.color : 'black') : (['black','blue','red'].indexOf(raw.color) >= 0 ? raw.color : 'black'), width: Number.isFinite(raw.width) ? clamp(raw.width, .5, 12) : 3,
          points: raw.points.map(function (p) { return [clamp(p[0], 0, 1), clamp(p[1], 0, 1), clamp(p[2] === undefined ? .5 : p[2], 0, 1)]; }), at: at, updatedAt: Number.isFinite(raw.updatedAt) && raw.updatedAt > 0 ? raw.updatedAt : at };
        if ((tombstones[item.id] || 0) >= stamp(item) && tombstones[item.id]) return;
        var old = records.get(item.id);
        if (!old || stamp(item) > stamp(old.item) || (stamp(item) === stamp(old.item) && JSON.stringify([page,item]) > JSON.stringify([old.page,old.item]))) records.set(item.id, {page: page, item: item});
      });
    });
    records.forEach(function (record) { (out[record.page] || (out[record.page] = [])).push(record.item); });
    Object.keys(out).forEach(function (page) { out[page].sort(function (a,b) { return a.at - b.at || a.id.localeCompare(b.id); }); });
    return { pages: out, deleted: tombstones };
  }
  function merge(a, ad, b, bd) {
    var pages = {}, deleted = {};
    [ad, bd].forEach(function (source) { Object.keys(source || {}).forEach(function (id) { if (id !== '__proto__' && id !== 'constructor' && Number.isFinite(source[id])) deleted[id] = Math.max(deleted[id] || 0, source[id]); }); });
    [a, b].forEach(function (source) { Object.keys(source || {}).forEach(function (page) { if (/^[1-9]\d*$/.test(page) && Array.isArray(source[page])) pages[page] = (pages[page] || []).concat(source[page]); }); });
    return normalize(pages, deleted);
  }
  function svg(name) { return document.createElementNS(NS, name); }
  function num(n) { return Math.round(n * 1000) / 1000; }
  function pathData(stroke, aspect) {
    var unit=1000/612,points=[];
    // Work only on a display copy: backups, erasing and Undo keep the original
    // pressure samples. Arc-length filtering is independent of event frequency.
    stroke.points.forEach(function(p){
      var point={x:p[0]*1000,y:p[1]*1000*aspect,p:p[2]===undefined?.5:p[2]},last=points[points.length-1];
      if(!last||Math.hypot(point.x-last.x,point.y-last.y)>.05*unit)points.push(point);
    });
    if(!points.length)return '';
    var smoothLength=Math.max(6,stroke.width*2.5)*unit,pressure=points[0].p;
    points.forEach(function(p,i){
      var previous=points[Math.max(0,i-1)],step=Math.hypot(p.x-previous.x,p.y-previous.y);
      pressure+=(p.p-pressure)*(1-Math.exp(-step/smoothLength));p.filtered=pressure;
    });
    pressure=points[points.length-1].filtered;
    for(var i=points.length-1;i>=0;i--){
      var next=points[Math.min(points.length-1,i+1)],p=points[i],step=Math.hypot(p.x-next.x,p.y-next.y);
      pressure+=(p.filtered-pressure)*(1-Math.exp(-step/smoothLength));p.r=stroke.width*unit*(.55+.9*pressure)/2;
    }
    function dot(p){return 'M '+num(p.x-p.r)+' '+num(p.y)+' a '+num(p.r)+' '+num(p.r)+' 0 1 0 '+num(2*p.r)+' 0 a '+num(p.r)+' '+num(p.r)+' 0 1 0 '+num(-2*p.r)+' 0 Z';}
    if(points.length===1)return dot(points[0]);
    function midpoint(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2,r:(a.r+b.r)/2};}
    var centerline=[points[0]],tolerance=Math.min(.15,stroke.width*.05)*unit,radiusTolerance=.025*unit;
    function curve(a,b,c,depth){
      var ab=midpoint(a,b),bc=midpoint(b,c),m=midpoint(ab,bc),chord=midpoint(a,c);
      if(depth>=8||(Math.hypot(m.x-chord.x,m.y-chord.y)<=tolerance&&Math.abs(m.r-chord.r)<=radiusTolerance)){
        centerline.push(c);return;
      }
      curve(a,ab,m,depth+1);curve(m,bc,c,depth+1);
    }
    // Smooth the centerline before constructing widths, not the two edges
    // independently. Subdivide by curve error, not distance: a long straight
    // line needs only one segment, and cannot explode live SVG complexity.
    for(var i=1;i<points.length;i++){
      var a=centerline[centerline.length-1],b=points[i-1],c=i===points.length-1?points[i]:midpoint(points[i-1],points[i]);
      curve(a,b,c,0);
    }
    // Display-only simplification bounds geometry and pressure error together.
    // Dense/coalesced input must not mean thousands of redundant SVG capsules.
    // Bound each simplification window: noisy back-and-forth samples can make
    // a whole-stroke Douglas-Peucker pass quadratic and stall live writing.
    // Shared endpoints keep neighboring windows joined without changing data.
    var keep=new Set([0,centerline.length-1]),pending=[];
    for(var from=0;from<centerline.length-1;from+=64){
      var to=Math.min(from+64,centerline.length-1);keep.add(from);keep.add(to);pending.push([from,to]);
    }
    while(pending.length){
      var range=pending.pop(),from=range[0],to=range[1],a=centerline[from],b=centerline[to],dx=b.x-a.x,dy=b.y-a.y,span=dx*dx+dy*dy,worst=1,index=-1;
      for(var i=from+1;i<to;i++){
        var p=centerline[i],t=span?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/span,0,1):0;
        var error=Math.max(Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)/tolerance,Math.abs(p.r-a.r-t*(b.r-a.r))/radiusTolerance);
        if(error>worst){worst=error;index=i;}
      }
      if(index!==-1){keep.add(index);pending.push([from,index],[index,to]);}
    }
    centerline=centerline.filter(function(_,i){return keep.has(i);});
    var parts=[];
    for(var i=1;i<centerline.length;i++){
      var a=centerline[i-1],b=centerline[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
      if(length<.001)continue;
      var nx=-dy/length,ny=dx/length;
      // Overlapping round segments, all wound the same way, form a single
      // nonzero-filled path. Unlike a folded offset outline, this stays solid
      // at tight turns, reversals and crossings even with noisy Pencil input.
      parts.push('M '+num(a.x+nx*a.r)+' '+num(a.y+ny*a.r)+
        ' L '+num(b.x+nx*b.r)+' '+num(b.y+ny*b.r)+
        ' A '+num(b.r)+' '+num(b.r)+' 0 0 0 '+num(b.x-nx*b.r)+' '+num(b.y-ny*b.r)+
        ' L '+num(a.x-nx*a.r)+' '+num(a.y-ny*a.r)+
        ' A '+num(a.r)+' '+num(a.r)+' 0 0 0 '+num(a.x+nx*a.r)+' '+num(a.y+ny*a.r)+' Z');
    }
    return parts.length?parts.join(' '):dot(points[0]);
  }
  function strokeNode(stroke, aspect) { var path=svg('path');path.setAttribute('d',pathData(stroke,aspect));path.setAttribute('fill',COLORS[stroke.color]||COLORS.black);path.dataset.inkColor=stroke.color;path.classList.add('pdf-ink-stroke');if(stroke.id)path.dataset.inkId=stroke.id;return path; }
  function layer(sheet) {
    var found=sheet.querySelector('.pdf-ink-layer');if(found)return found;
    var el=svg('svg');el.classList.add('pdf-ink-layer');el.setAttribute('aria-hidden','true');el.setAttribute('preserveAspectRatio','none');sheet.appendChild(el);return el;
  }
  function render(sheet, strokes) {
    var el=layer(sheet),aspect=(sheet.offsetHeight||1)/(sheet.offsetWidth||1);
    el.setAttribute('viewBox','0 0 1000 '+(1000*aspect));el.replaceChildren();
    (strokes||[]).forEach(function (stroke) { el.appendChild(strokeNode(stroke,aspect)); });return el;
  }
  function distance(p,a,b) { var dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy); }
  function segmentsNear(a,b,c,d,r) {
    var cross=function(p,q,s){return(q.x-p.x)*(s.y-p.y)-(q.y-p.y)*(s.x-p.x);};
    if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return true;
    return Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b))<=r;
  }
  function create(options) {
    var gesture=null,suppressUntil=0,lastTouch=null,frame=0;
    function own(event) { if(event.cancelable)event.preventDefault();event.stopImmediatePropagation(); }
    function valid(g) { var context=options.getContext();return context&&context.id===g.context.id&&g.sheet.isConnected&&g.holder.isConnected; }
    function clearPreview(g) { if(g.preview)g.preview.remove();g.sheet.querySelectorAll('.pdf-ink-erasing').forEach(function(el){el.classList.remove('pdf-ink-erasing');}); }
    function finish(cancelled) {
      var g=gesture;if(!g)return;gesture=null;cancelAnimationFrame(frame);frame=0;clearPreview(g);suppressUntil=Date.now()+500;lastTouch=g.touchId;
      try{if(g.source==='pointer'&&g.holder.hasPointerCapture(g.id))g.holder.releasePointerCapture(g.id);}catch(e){}
      document.body.classList.remove('pdf-ink-drawing');
      if(!cancelled&&valid(g)){if(g.tool==='eraser'){if(g.erased.size)options.onErase(g.page,Array.from(g.erased));}else if(g.points.length)options.onCommit(g.page,{color:g.color,width:g.width,points:g.points});}
    }
    function paint() {
      frame=0;var g=gesture;if(!g||g.tool==='eraser')return;
      g.preview.replaceChildren(strokeNode({color:g.color,width:g.width,points:g.points},g.aspect));
    }
    function move(event, force) {
      var g=gesture;if(!g)return;if(!valid(g)){finish(true);return;}
      var rect=g.sheet.getBoundingClientRect();if(Math.abs(rect.width-g.rect.width)>1||Math.abs(rect.height-g.rect.height)>1||Math.abs(rect.left-g.rect.left)>1||Math.abs(rect.top-g.rect.top)>1){finish(true);return;}
      var x=clamp(event.clientX,rect.left,rect.right),y=clamp(event.clientY,rect.top,rect.bottom),p={x:x,y:y};
      if(g.tool==='eraser'){
        (options.getStrokes(g.page)||[]).forEach(function(stroke){
          if(g.erased.has(stroke.id))return;var pts=stroke.points.map(function(point){return{x:rect.left+point[0]*rect.width,y:rect.top+point[1]*rect.height};}),hit=false,r=10+stroke.width*rect.width/612;
          for(var i=0;i<pts.length;i++){if(segmentsNear(g.last,p,pts[Math.max(0,i-1)],pts[i],r)){hit=true;break;}}
          if(hit)g.erased.add(stroke.id);
        });
        g.sheet.querySelectorAll('[data-ink-id]').forEach(function(el){el.classList.toggle('pdf-ink-erasing',g.erased.has(el.dataset.inkId));});g.last=p;return;
      }
      if(!force&&g.last&&Math.hypot(x-g.last.x,y-g.last.y)<.65)return;
      var pressure=Number.isFinite(event.pressure)&&event.pressure>0?event.pressure:Number.isFinite(event.force)&&event.force>0?event.force:(g.points.length?g.points[g.points.length-1][2]:.5);
      var point=[Math.round((x-rect.left)/rect.width*100000)/100000,Math.round((y-rect.top)/rect.height*100000)/100000,Math.round(clamp(pressure,0,1)*100)/100];
      var previous=g.points[g.points.length-1];if(previous&&previous[0]===point[0]&&previous[1]===point[1])return;
      g.points.push(point);g.last=p;
      // Bound only the in-flight sampling density; never truncate saved handwriting.
      if(g.points.length>4096)g.points=g.points.filter(function(_,i,list){return i%2===0||i===list.length-1;});
      if(!frame)frame=requestAnimationFrame(paint);
    }
    function start(event,id,source) {
      var context=options.getContext(),target=event.target,holder=target&&target.closest&&target.closest('.pdf-page');
      if(!context||!holder||!options.pane.contains(holder)||event.button>0||target.closest('button,input,textarea,[contenteditable="true"]')||(options.canStart&&!options.canStart(+holder.dataset.page)))return false;
      var sheet=holder.querySelector('.pdf-sheet'),rect=sheet&&sheet.getBoundingClientRect(),box=holder.getBoundingClientRect();
      if(!rect||!rect.width||!rect.height||event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)return false;
      options.onStart(+holder.dataset.page);
      var preview=svg('g');preview.classList.add('pdf-ink-preview');layer(sheet).appendChild(preview);
      gesture={context:context,id:id,source:source,touchId:source==='touch'?id:null,holder:holder,sheet:sheet,rect:rect,aspect:(sheet.offsetHeight||1)/(sheet.offsetWidth||1),page:+holder.dataset.page,tool:options.getTool(),color:options.getColor(),width:options.getWidth(),points:[],erased:new Set(),preview:preview,last:{x:event.clientX,y:event.clientY}};
      document.body.classList.add('pdf-ink-drawing');move(event,true);
      try{if(source==='pointer')holder.setPointerCapture(id);}catch(e){}return true;
    }
    function stylus(touches) { return Array.from(touches||[]).find(function(t){return t.touchType==='stylus';}); }
    global.addEventListener('pointerdown',function(e){if(gesture){if(e.pointerType==='touch'||e.pointerType==='pen')own(e);return;}if((e.pointerType==='pen'||e.pointerType==='mouse')&&start(e,e.pointerId,'pointer'))own(e);},true);
    global.addEventListener('pointermove',function(e){var g=gesture;if(!g)return;if(g.source==='pointer'&&g.id===e.pointerId){var samples=e.getCoalescedEvents?e.getCoalescedEvents():[];(samples.length?samples:[e]).forEach(function(sample){move(sample,false);});own(e);}else if(e.pointerType==='touch'||e.pointerType==='pen')own(e);},true);
    ['pointerup','pointercancel'].forEach(function(type){global.addEventListener(type,function(e){var g=gesture;if(!g)return;if(g.source==='pointer'&&g.id===e.pointerId){if(type==='pointerup')move(e,false);finish(type==='pointercancel');own(e);}else if(e.pointerType==='touch'||e.pointerType==='pen')own(e);},true);});
    global.addEventListener('lostpointercapture',function(e){if(gesture&&gesture.source==='pointer'&&gesture.id===e.pointerId)finish(true);},true);
    global.addEventListener('touchstart',function(e){var t=stylus(e.changedTouches);if(!gesture&&t)start(t,t.identifier,'touch');if(gesture){if(t&&gesture.touchId===null)gesture.touchId=t.identifier;own(e);}}, {capture:true,passive:false});
    global.addEventListener('touchmove',function(e){var g=gesture;if(!g)return;if(g.source==='touch'){var t=Array.from(e.changedTouches||[]).find(function(t){return t.identifier===g.id;});if(t)move(t,false);}own(e);},{capture:true,passive:false});
    ['touchend','touchcancel'].forEach(function(type){global.addEventListener(type,function(e){var g=gesture;if(g){var t=Array.from(e.changedTouches||[]).find(function(t){return t.identifier===(g.source==='touch'?g.id:g.touchId);});if(t&&(g.source==='touch'||type==='touchcancel')){if(type==='touchend')move(t,false);finish(type==='touchcancel');}own(e);}else{var ended=stylus(e.changedTouches);if(ended&&ended.identifier===lastTouch&&Date.now()<suppressUntil&&options.pane.contains(ended.target))own(e);}},{capture:true,passive:false});});
    global.addEventListener('click',function(e){if(Date.now()<suppressUntil&&options.pane.contains(e.target))own(e);},true);
    ['blur','pagehide','resize'].forEach(function(type){global.addEventListener(type,function(){finish(true);});});
    document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')finish(true);});
    options.pane.addEventListener('scroll',function(){finish(true);},{passive:true});
    global.addEventListener('keydown',function(e){if(e.key==='Escape')finish(true);},true);
    return {cancel:function(){finish(true);},active:function(){return !!gesture;}};
  }
  global.PhloemInk={normalize:normalize,merge:merge,render:render,create:create};
})(window);
