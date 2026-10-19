/* work-web v2.5 · present mode.
   Next / previous, number + Enter to jump, G overview (with hidden “backup” slides), Z zoom, L laser pointer, N notes,
   F focus (one block / overdue / key items — recomputes every data slide of a draft deck), R open any register view
   (table, Gantt, matrix, status) as a temporary slide with its own filters, and click a row, milestone or photo to see
   that item's details, related documents and photos. Owner copies (frozen) get overview, zoom and laser only. */
'use strict';

UI_ICONS.ov = '<rect x="3" y="3" width="8" height="6" rx="1"/><rect x="13" y="3" width="8" height="6" rx="1"/><rect x="3" y="13" width="8" height="6" rx="1"/><rect x="13" y="13" width="8" height="6" rx="1"/>';
UI_ICONS.zoom = '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M11 8v6M8 11h6"/>';
UI_ICONS.laser = '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>';
UI_ICONS.filter = '<path d="M4 5h16l-6 7v6l-4 2v-8z"/>';
UI_ICONS.table2 = '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 10h18M9 10v9"/>';

function presRoot(){ var r = $('#present-root'); if(!r){ r = document.createElement('div'); r.id = 'present-root'; document.body.appendChild(r); } return r; }
function presDeck(){ var p = S.present; return p && p.deckId ? getRec(p.deckId) : null; }
function presLive(){ var d = presDeck(); return !!(d && !(d.d.status === 'issued' && d.d.snap)); }
/* all pages of a deck, hidden slides included (flagged), so the overview can call up backup slides */
function deckPresPages(deck, focus){ var pages = []; deckBuild(deck, {all:true, focus:focus || null}).forEach(function(x){ x.pages.forEach(function(h, i){ pages.push({sid:x.s.id, sub:i, html:h, note:x.s.note || '', hidden:!!x.s.hidden, t:slideTitle(x.s), type:x.s.type}); }); }); return pages; }
function startPresent(pages, at, title, o){
  o = o || {};
  if(!pages.some(function(x){ return !x.hidden; })){ toast(T('Nothing to present — all slides are hidden.', '没有可演示的页面（全部已隐藏）。')); return; }
  var i = clamp(at || 0, 0, pages.length - 1); if(pages[i].hidden && !o.keepHidden){ while(i < pages.length - 1 && pages[i].hidden) i++; while(pages[i].hidden && i > 0) i--; }
  S.present = {pages:pages, i:i, title:title || '', note:false, fs:false, deckId:o.deckId || null, focus:null, ov:false, zoomMode:false, zoom:null, laser:false, menu:null, drill:null, lv:null, num:''};
  try{ var de = document.documentElement; if(de.requestFullscreen) de.requestFullscreen().catch(function(){}); }catch(e){}
  renderPresent();
}
function presentDeck(deck, sid){
  var go = function(){ var pages = deckPresPages(deck), at = 0; if(sid) pages.some(function(p, i){ if(p.sid === sid){ at = i + (S.dpage || 0); return true; } return false; }); var fs = S.present && S.present.fs; startPresent(pages, at, deckTitle(deck.d), {deckId:deck.id, keepHidden:!!sid}); if(S.present && fs) S.present.fs = fs; };
  var built = deckBuild(deck, {all:true}), paths = photoPaths(built);
  if(!paths.length && !deckNeedsHist(deck).some(function(id){ return !histFor(id); })){ go(); return; }
  S.present = {pages:[{html:'<div class="sl"><div class="sl-empty">' + esc(T('Loading photos…', '正在加载照片…')) + '</div></div>'}], i:0, note:false, title:''}; renderPresent();
  try{ var de = document.documentElement; if(de.requestFullscreen) de.requestFullscreen().catch(function(){}); }catch(e){}
  loadHistory(deckNeedsHist(deck)).then(function(){ return signFor(deckBuild(deck, {all:true}), deck); }).then(go);
}
function presRebuild(){ var p = S.present, deck = presDeck(); if(!p || !deck) return; var cur = p.pages[p.i] || {}; p.pages = deckPresPages(deck, p.focus); var j = -1; p.pages.forEach(function(x, i){ if(j < 0 && x.sid === cur.sid && x.sub === cur.sub) j = i; }); if(j < 0) p.pages.forEach(function(x, i){ if(j < 0 && x.sid === cur.sid) j = i; }); p.i = j < 0 ? 0 : j; if(p.lv) lvBuild(); }
function visIdx(p){ var out = []; p.pages.forEach(function(x, i){ if(!x.hidden) out.push(i); }); return out; }
function presGo(d){
  var p = S.present; if(!p) return;
  if(p.lv){ p.lv.i = clamp(p.lv.i + (d > 0 ? 1 : -1), 0, p.lv.pages.length - 1); p.zoom = null; renderPresent(); return; }
  if(Math.abs(d) >= 1e4){ var v = visIdx(p); p.i = d > 0 ? v[v.length - 1] : v[0]; }
  else { var j = p.i; do { j += d > 0 ? 1 : -1; } while(j >= 0 && j < p.pages.length && p.pages[j].hidden); if(j >= 0 && j < p.pages.length) p.i = j; }
  p.zoom = null; p.drill = null; renderPresent();
}
function presJump(n){ var p = S.present, v = visIdx(p); if(n >= 1 && n <= v.length){ p.i = v[n - 1]; p.zoom = null; p.drill = null; p.lv = null; renderPresent(); } }
function presExit(){ S.present = null; renderPresent(); try{ if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function(){}); }catch(e){} }

/* ---------------- drawing ---------------- */
function presCounter(p){ if(p.lv) return esc(T('Live view', '实时视图')) + ' · ' + (p.lv.i + 1) + ' / ' + p.lv.pages.length; var pg = p.pages[p.i]; if(!pg) return ''; if(pg.hidden) return esc(T('Backup', '备用页')); var v = visIdx(p); return (v.indexOf(p.i) + 1) + ' / ' + v.length; }
function renderPresent(){
  var r = presRoot(), p = S.present;
  if(!p){ r.innerHTML = ''; document.body.classList.remove('presenting'); return; }
  document.body.classList.add('presenting');
  var live = presLive(), deck = presDeck(), top = p.lv ? 44 : 0, vw = window.innerWidth - (p.drill ? Math.min(460, window.innerWidth * 0.42) : 0), vh = window.innerHeight - 48 - top, sc = Math.min(vw / 1280, vh / 720);
  var pg = p.lv ? p.lv.pages[p.lv.i] : p.pages[p.i]; if(!pg) pg = {html:''};
  var tf = 'scale(' + sc + ')';
  if(p.zoom){ var k = 2 * sc, W = 1280 * sc, H = 720 * sc, tx = clamp(W / 2 - p.zoom.x * k, W - 1280 * k, 0), ty = clamp(H / 2 - p.zoom.y * k, H - 720 * k, 0); tf = 'translate(' + tx + 'px,' + ty + 'px) scale(' + k + ')'; }
  var fz = p.focus && (p.focus.blk || p.focus.od || p.focus.star) ? [p.focus.blk ? T('Block ', '区域 ') + p.focus.blk : '', p.focus.od ? T('overdue only', '只看逾期') : '', p.focus.star ? T('key items only', '只看重点') : ''].filter(Boolean).join(' · ') : '';
  var h = '<div class="pres' + (p.laser ? ' laser' : '') + (p.zoomMode ? ' zoomm' : '') + (deck && !p.zoomMode ? ' drillable' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(p.title) + '">' +
    (p.lv ? lvBar() : '') +
    '<div class="pres-main"><div class="pres-stage"><div class="pres-sc" style="width:' + (1280 * sc) + 'px;height:' + (720 * sc) + 'px"><div class="dk-sc" style="transform:' + tf + '">' + pg.html + '</div>' + (fz && !p.lv ? '<span class="pres-fz">' + uic('filter', 12) + ' ' + esc(fz) + '</span>' : '') + '</div></div>' +
    (p.drill ? '<aside class="pres-drill">' + drillHtml(p.drill) + '</aside>' : '') + '</div>' +
    (p.note && pg.note && !p.lv ? '<div class="pres-note">' + esc(pg.note) + '</div>' : '') +
    (p.ov ? ovHtml(p) : '') + (p.menu ? menuHtml(p) : '') +
    '<div class="pres-bar"><button type="button" class="ib" data-act="presPrev" aria-label="Previous">' + uic('left', 20) + '</button><span class="mono pres-n">' + presCounter(p) + '</span><button type="button" class="ib" data-act="presNext" aria-label="Next">' + uic('right', 20) + '</button><span class="pres-t">' + esc(p.title) + '</span>' +
    '<button type="button" class="btn sm" data-act="presOv" aria-pressed="' + !!p.ov + '" title="G">' + uic('ov', 14) + ' ' + L('Overview', '总览') + '</button>' +
    (deck ? '<button type="button" class="btn sm" data-act="presMenu" data-v="focus" aria-pressed="' + (p.menu === 'focus' || !!fz) + '" title="F"' + (live ? '' : ' disabled') + '>' + uic('filter', 14) + ' ' + L('Focus', '聚焦') + '</button>' +
      '<button type="button" class="btn sm" data-act="presMenu" data-v="reg" aria-pressed="' + (p.menu === 'reg' || !!p.lv) + '" title="R">' + uic('table2', 14) + ' ' + L('Registers', '台账') + '</button>' : '') +
    '<button type="button" class="btn sm" data-act="presZoom" aria-pressed="' + !!p.zoomMode + '" title="Z">' + uic('zoom', 14) + '</button><button type="button" class="btn sm" data-act="presLaser" aria-pressed="' + !!p.laser + '" title="L">' + uic('laser', 14) + '</button>' +
    (p.pages.some(function(x){ return x.note; }) ? '<button type="button" class="btn sm" data-act="presNote" aria-pressed="' + !!p.note + '" title="N">' + L('Notes', '备注') + '</button>' : '') + '<button type="button" class="btn sm" data-act="presExit">' + L('Exit (Esc)', '退出 (Esc)') + '</button></div>' +
    (p.laser ? '<i class="pres-dot" style="left:' + (p.lx || -40) + 'px;top:' + (p.ly || -40) + 'px"></i>' : '') + '</div>';
  r.innerHTML = h;
  slFitAll(r); if(p.ov) presFitOv();
}
window.addEventListener('resize', function(){ if(S.present) renderPresent(); });

/* overview: every slide, hidden ones marked as backup */
function ovHtml(p){
  var v = visIdx(p);
  return '<div class="pres-ov"><div class="pres-ovh"><b>' + L('All slides', '全部页面') + '</b><span class="muted">' + L('Click a slide to go there · type its number and press Enter · Esc closes', '点击页面跳转 · 输入页码按 Enter · Esc 关闭') + '</span>' + (p.pages.some(function(x){ return x.hidden; }) ? '<span class="pres-bk">' + L('Backup = hidden slide, shown only when you pick it', '备用页 = 隐藏页面，只在点选时显示') + '</span>' : '') + '</div><div class="pres-ovg">' +
    p.pages.map(function(x, i){ var n = v.indexOf(i); return '<button type="button" class="pres-ovt' + (i === p.i && !p.lv ? ' on' : '') + (x.hidden ? ' hid' : '') + '" data-act="presTo" data-v="' + i + '"><span class="pres-ovn">' + (x.hidden ? esc(T('Backup', '备用')) : n + 1) + '</span><span class="dk-fit"><span class="dk-sc">' + x.html + '</span></span><span class="pres-ovl">' + esc(T1((x.t || {}).en, (x.t || {}).zh) || T1(SLIDES[x.type] ? SLIDES[x.type].en : '', SLIDES[x.type] ? SLIDES[x.type].zh : '')) + '</span></button>'; }).join('') + '</div></div>';
}
function presFitOv(){ $$('.pres-ov .dk-fit').forEach(function(el){ var w = el.clientWidth, inner = el.firstElementChild; if(inner && w) inner.style.transform = 'scale(' + (w / 1280) + ')'; }); }

/* focus and register menus (drawn inside present mode, above the bar) */
function menuHtml(p){
  if(p.menu === 'focus'){
    var f = p.focus || {}, bl = lists().blocks.opts;
    return '<div class="pres-menu" data-pm="1"><b>' + L('Focus every data slide on', '所有数据页只看') + '</b><div class="pres-chips">' + bl.map(function(o){ return '<button type="button" class="pres-chip" data-act="presFocus" data-k="blk" data-v="' + esc(o.v) + '" aria-pressed="' + (f.blk === o.v) + '">' + esc(T('Block ', '区域 ') + o.v) + '</button>'; }).join('') + '</div>' +
      '<div class="pres-chips"><button type="button" class="pres-chip" data-act="presFocus" data-k="od" aria-pressed="' + !!f.od + '">' + L('Overdue only', '只看逾期') + '</button><button type="button" class="pres-chip" data-act="presFocus" data-k="star" aria-pressed="' + !!f.star + '">★ ' + L('Key items only', '只看重点') + '</button></div>' +
      '<div class="row"><button type="button" class="btn sm" data-act="presFocus" data-k="reset">' + L('Show everything', '显示全部') + '</button><span class="note">' + L('Only for this showing — the presentation itself is not changed.', '只影响这次演示，不会修改文稿。') + '</span></div></div>';
  }
  if(p.menu === 'reg'){
    var deck = presDeck(), ctx = deck ? dctx(deck) : {owner:false};
    return '<div class="pres-menu" data-pm="1"><b>' + L('Open a register view', '打开台账视图') + '</b><div class="pres-regs">' + allRegs().filter(function(g){ return regOk(ctx, g); }).map(function(g){ var ro = rolesOf(g), types = [['table', 'Table', '表格']].concat(ro.start || ro.finish ? [['gantt', 'Gantt', '甘特图']] : []).concat(ro.block ? [['matrix', 'Matrix', '矩阵']] : []).concat(rf(g, 'status') ? [['breakdown', 'Status', '状态']] : []);
      return '<div class="pres-reg"><span>' + icon(g.d.icon, 14) + ' ' + esc(regName(g)) + '</span><span class="pres-chips">' + types.map(function(t){ return '<button type="button" class="pres-chip" data-act="presLv" data-v="' + esc(g.id + '|' + t[0]) + '">' + L(t[1], t[2]) + '</button>'; }).join('') + '</span></div>'; }).join('') + '</div>' +
      (ctx.owner ? '<p class="note">' + L('Owner mode: only fields the Owner can see and records are shown.', '业主模式：只显示业主可见的字段与记录。') + '</p>' : '') + '</div>';
  }
  return '';
}

/* ---------------- a register view as a temporary slide ---------------- */
function lvCfg(reg, type, f){
  var st = f.st ? [f.st] : [], blk = f.blk ? [f.blk] : [];
  if(type === 'table'){ var cols = tableCols(reg).filter(function(x){ return ['files', 'sub', 'link', 'section', 'long'].indexOf(x.type) < 0; }).map(function(x){ return x.key; }).slice(0, 7); return {reg:reg.id, cols:cols, filter:{q:f.q || '', st:st, blk:blk, open:!!f.open, od:!!f.od}, per:12}; }
  if(type === 'gantt') return {regs:[reg.id], only:'all', lanes:rolesOf(reg).tree ? 'tree' : 'none', months:0, base:true, hideDone:!!f.open};
  if(type === 'matrix') return {reg:reg.id, val:'progress'};
  return {reg:reg.id};
}
function lvBuild(){
  var p = S.present, lv = p && p.lv, deck = presDeck(), reg = lv && getReg(lv.reg); if(!lv || !deck || !reg) return;
  var s = newSlide(lv.type, lvCfg(reg, lv.type, lv.f), {en:reg.d.en || '', zh:reg.d.zh || ''}); lv.slide = s;
  var tmp = {id:deck.id, d:Object.assign({}, deck.d, {slides:[s], status:'draft', snap:null})};
  lv.pages = []; deckBuild(tmp, {focus:p.focus}).forEach(function(x){ x.pages.forEach(function(h){ lv.pages.push({html:h}); }); }); lv.i = clamp(lv.i || 0, 0, Math.max(0, lv.pages.length - 1));
}
function lvBar(){
  var p = S.present, lv = p.lv, reg = getReg(lv.reg), sf = rf(reg, 'status'), bf = rf(reg, 'block'), deck = presDeck(), canAdd = deck && canDeckEdit() && deck.d.status !== 'issued';
  return '<div class="pres-lv"><b>' + icon(reg.d.icon, 14) + ' ' + esc(regName(reg)) + '</b>' + (lv.type === 'table' ? '<input class="in" id="lvq" data-fk="lvq" placeholder="' + esc(T('Search', '搜索')) + '" value="' + esc(lv.f.q || '') + '" autocomplete="off">' : '') +
    (sf && lv.type === 'table' ? '<select class="in" id="lvst"><option value="">' + esc(T('Any status', '全部状态')) + '</option>' + optsOf(sf).map(function(o){ return '<option value="' + esc(o.v) + '"' + (lv.f.st === o.v ? ' selected' : '') + '>' + esc(nm(o)) + '</option>'; }).join('') + '</select>' : '') +
    (bf && lv.type === 'table' ? '<select class="in" id="lvblk"><option value="">' + esc(T('All blocks', '全部区域')) + '</option>' + optsOf(bf).map(function(o){ return '<option value="' + esc(o.v) + '"' + (lv.f.blk === o.v ? ' selected' : '') + '>' + esc(o.v) + '</option>'; }).join('') + '</select>' : '') +
    (lv.type === 'table' || lv.type === 'gantt' ? '<label class="pres-ck"><input type="checkbox" id="lvopen"' + (lv.f.open ? ' checked' : '') + '>' + L('Open only', '只看未完成') + '</label>' : '') +
    (lv.type === 'table' ? '<label class="pres-ck"><input type="checkbox" id="lvod"' + (lv.f.od ? ' checked' : '') + '>' + L('Overdue', '逾期') + '</label>' : '') +
    '<span style="flex:1"></span>' + (canAdd ? '<button type="button" class="btn sm" data-act="presLvAdd">' + uic('plus', 13) + ' ' + L('Add to presentation', '加入文稿') + '</button>' : '') + '<button type="button" class="btn sm pri" data-act="presLvClose">' + L('Back to slides', '返回页面') + '</button></div>';
}
function lvOpen(regId, type){ var p = S.present; if(!p) return; p.lv = {reg:regId, type:type, f:{q:'', st:'', blk:(p.focus && p.focus.blk) || '', open:false, od:false}, i:0}; p.menu = null; p.drill = null; p.zoom = null; p.ov = false; lvBuild(); renderPresent(); }

/* ---------------- click-through: one item's details ---------------- */
function drillHtml(id){
  var r = getRec(id), deck = presDeck(), ctx = deck ? dctx(deck) : {owner:false}, reg = r && getReg(r.reg);
  var close = '<button type="button" class="ib pres-dx" data-act="presDrillClose" aria-label="Close">' + uic('x', 18) + '</button>';
  if(!r || !reg || isPrivate(reg) || (ctx.owner && !recOk({owner:true}, reg, r))) return close + '<p class="muted">' + L('Details are not available for this item.', '此项无法显示详情。') + '</p>';
  var ro = rolesOf(reg), own = !!ctx.owner, fOk = function(k){ var f = k && fieldOf(reg, k); return !own || (f && fieldOk(ctx, reg, f)); };
  /* Owner mode (the Owner is in the room): only fields the Owner can see and records, no library documents */
  var st = statusOpt(reg, r), p = fOk(ro.start) || fOk(ro.finish) ? planOf(reg, r) : null, b = own ? null : baseOf(reg, r), a = own ? null : actOf(reg, r), pr = fOk(ro.progress) ? progressOf(reg, r) : null, kids = childrenOf(r).filter(function(k){ return !own || recOk({owner:true}, reg, k); });
  var h = close + '<div class="pd-h"><span class="muted">' + icon(reg.d.icon, 13) + ' ' + esc(regName(reg)) + ' · <span class="mono">' + esc(recNo(reg, r)) + '</span></span><h2>' + esc(recTitle(reg, r) || '—') + '</h2>' + (recTitle2(reg, r) ? '<div class="muted">' + esc(recTitle2(reg, r)) + '</div>' : '') +
    '<div class="pd-chips">' + (st ? optChip(st) : '') + (isOverdue(reg, r) ? chip('red', L('Overdue', '逾期')) : '') + (r.d.star ? chip('amber', '★ ' + L('Key', '重点')) : '') + (rf(reg, 'block') && fOk(ro.block) ? blockChips(r.d[rf(reg, 'block').key], rf(reg, 'block')) : '') + '</div></div>';
  if(p || pr != null) h += '<div class="pd-dates">' + (p ? '<div><small>' + L('Plan', '计划') + '</small><b>' + esc(n2d(p.s) + (p.f !== p.s ? ' → ' + n2d(p.f) : '')) + '</b></div>' : '') + (b ? '<div><small>' + L('Baseline', '基准') + '</small><b>' + esc(n2d(b.f)) + '</b></div>' : '') + (a && a.f != null ? '<div><small>' + L('Actual', '实际') + '</small><b>' + esc(n2d(a.f)) + '</b></div>' : '') + (pr != null ? '<div><small>' + L('Progress', '进度') + '</small><b>' + Math.round(pr) + '%</b>' + pbar(pr) + '</div>' : '') + '</div>';
  var fs = dataFields(reg).filter(function(f){ return fieldOk(ctx, reg, f) && ['files', 'sub', 'link', 'section', 'calc'].indexOf(f.type) < 0 && [ro.no, ro.title, ro.title2, ro.status, ro.start, ro.finish, ro.progress, ro.block].indexOf(f.key) < 0 && !isEmpty(r.d[f.key]); });
  if(fs.length) h += '<dl class="pd-f">' + fs.map(function(f){ return '<dt>' + esc(T1(f.en, f.zh)) + '</dt><dd' + (f.type === 'long' ? ' class="long"' : '') + '>' + esc(textOf(reg, f, r)) + '</dd>'; }).join('') + '</dl>';
  if(kids.length){ var dn = kids.filter(function(k){ return isDone(reg, k); }).length; h += '<h3>' + L('Sub-items', '子项') + ' <span class="cnt">' + dn + ' / ' + kids.length + '</span></h3><div class="pd-l">' + kids.slice(0, 12).map(function(k){ var s2 = statusOpt(reg, k); return '<button type="button" class="pd-i" data-act="presDrill" data-v="' + esc(k.id) + '"><span class="mono">' + esc(recNo(reg, k)) + '</span><span>' + esc(recTitle(reg, k) || '—') + '</span>' + (s2 ? optChip(s2) : '') + '</button>'; }).join('') + '</div>'; }
  var imgs = recFiles(r).filter(function(fx){ return isImg(fx.x) && (!own || (!fx.doc && fieldOk(ctx, reg, fx.f))); });
  if(imgs.length) h += '<h3>' + L('Photos', '照片') + ' <span class="cnt">' + imgs.length + '</span></h3><div class="pd-ph">' + imgs.slice(0, 12).map(function(fx){ var u = STORE.fileUrl(fx.x.path); return '<button type="button" data-act="presPhoto" data-v="' + esc(JSON.stringify({path:fx.x.path, name:fx.x.name, type:fx.x.type})) + '">' + (u ? '<img src="' + esc(u) + '" alt="">' : '') + '</button>'; }).join('') + '</div>';
  var rel = relsOf(r).filter(function(e){ var o = getRec(e.id), g = o && getReg(o.reg); if(!o || !g || isPrivate(g)) return false; if(isLibRec(o)) return !own && !isImg(curFile(o)); if(isDeckRec(o)) return false; return !ctx.owner || recOk({owner:true}, g, o); });
  if(rel.length) h += '<h3>' + L('Related', '相关') + ' <span class="cnt">' + rel.length + '</span></h3><div class="pd-l">' + rel.map(function(e){ var o = getRec(e.id), g = getReg(o.reg), lib = isLibRec(o), x = lib ? curFile(o) : null, s3 = statusOpt(g, o);
      return '<button type="button" class="pd-i" data-act="' + (lib ? 'presDoc' : 'presDrill') + '" data-v="' + esc(o.id) + '">' + (lib ? '<b class="rext">' + esc(x ? extOf(x) : 'DOC') + '</b>' : '<span class="mono">' + esc(recNo(g, o)) + '</span>') + '<span>' + esc(lib ? docTitle(o) : recTitle(g, o) || '—') + '<small>' + esc(relLabel(e)) + ' · ' + esc(regName(g)) + '</small></span>' + (s3 ? optChip(s3) : '') + '</button>'; }).join('') + '</div>';
  var deckIssued = deck && deck.d.status === 'issued' && deck.d.snap;
  return h + '<p class="note pd-note">' + (deckIssued ? L('Live data as of now — the slide shows the issued figures.', '此处为当前实时数据；页面显示的是定稿时的数据。') : L('Live data.', '实时数据。')) + '</p>';
}

/* ---------------- events ---------------- */
document.addEventListener('click', function(ev){
  var p = S.present; if(!p) return;
  var el = ev.target.closest && ev.target.closest('[data-act]'), act = el && el.dataset.act, v = el && el.dataset.v;
  if(act && /^pres|^pubPresent/.test(act)){
    switch(act){
      case 'presNext': presGo(1); break;
      case 'presPrev': presGo(-1); break;
      case 'presNote': p.note = !p.note; renderPresent(); break;
      case 'presExit': presExit(); break;
      case 'presOv': p.ov = !p.ov; p.menu = null; renderPresent(); presFitOv(); break;
      case 'presTo': p.i = +v; p.ov = false; p.lv = null; p.zoom = null; p.drill = null; renderPresent(); break;
      case 'presZoom': p.zoomMode = !p.zoomMode; p.zoom = null; renderPresent(); break;
      case 'presLaser': p.laser = !p.laser; renderPresent(); break;
      case 'presMenu': p.menu = p.menu === v ? null : v; p.ov = false; renderPresent(); break;
      case 'presFocus': (function(){ var k = el.dataset.k, f = Object.assign({}, p.focus || {}); if(k === 'reset') f = {}; else if(k === 'blk') f.blk = f.blk === v ? '' : v; else f[k] = !f[k]; p.focus = (f.blk || f.od || f.star) ? f : null; presRebuild(); renderPresent(); })(); break;
      case 'presLv': (function(){ var a = String(v).split('|'); lvOpen(a[0], a[1]); })(); break;
      case 'presLvClose': p.lv = null; p.zoom = null; renderPresent(); break;
      case 'presLvAdd': (function(){ var deck = presDeck(), lv = p.lv; if(!deck || !lv || !lv.slide) return; var s = clone(lv.slide); s.id = uid('s'); var after = (p.pages[p.i] || {}).sid; addSlideTo(deck, s, after).then(function(){ toast(T('Added to the presentation after the current slide', '已加入文稿（当前页之后）')); presRebuild(); renderPresent(); }); })(); break;
      case 'presDrill': p.drill = v; renderPresent(); break;
      case 'presDrillClose': p.drill = null; renderPresent(); break;
      case 'presPhoto': (function(){ var x = JSON.parse(v); openViewer(x, x.name); })(); break;
      case 'presDoc': (function(){ var d = getRec(v); if(d) openViewer(curFile(d), docTitle(d)); })(); break;
    }
    ev.stopPropagation(); return;
  }
  if(p.menu && !(ev.target.closest && ev.target.closest('[data-pm]'))){ p.menu = null; renderPresent(); return; }
  var stage = ev.target.closest && ev.target.closest('.pres-sc'); if(!stage) return;
  if(p.zoomMode){ if(p.zoom){ p.zoom = null; } else { var rr = stage.getBoundingClientRect(), sc = rr.width / 1280; p.zoom = {x:(ev.clientX - rr.left) / sc, y:(ev.clientY - rr.top) / sc}; } renderPresent(); return; }
  var hk = ev.target.closest('[data-hk]'), key = hk ? hk.getAttribute('data-hk') : '';
  if(presDeck()){
    if(/^r:/.test(key) && getRec(key.slice(2))){ p.drill = key.slice(2); renderPresent(); return; }
    if(/^k:/.test(key) && getReg(key.slice(2))){ lvOpen(key.slice(2), 'table'); return; }
  }
  if(/^p:/.test(key)){ var path = key.slice(2), img = hk.querySelector('img'); openViewer({path:path, src:path ? '' : (img ? img.src : ''), name:hk.getAttribute('data-hl') || 'Photo', type:'image/jpeg'}, hk.getAttribute('data-hl') || ''); return; }
  if(p.drill){ p.drill = null; renderPresent(); return; }
  presGo(1);
}, true);
document.addEventListener('mousemove', function(ev){ var p = S.present; if(!p || !p.laser) return; p.lx = ev.clientX; p.ly = ev.clientY; var d = $('.pres-dot'); if(d){ d.style.left = ev.clientX + 'px'; d.style.top = ev.clientY + 'px'; } });
/* in full screen the browser takes Esc to leave full screen: close the top overlay instead of ending the presentation */
document.addEventListener('fullscreenchange', function(){ var p = S.present; if(!p) return; if(document.fullscreenElement){ p.fs = true; return; } if(!p.fs){ renderPresent(); return; }
  if(p.menu || p.ov || p.drill || p.zoom || p.zoomMode || p.lv || S.viewer){ p.fs = false; if(S.viewer) closeViewer(); else if(p.menu) p.menu = null; else if(p.ov) p.ov = false; else if(p.drill) p.drill = null; else if(p.zoom) p.zoom = null; else if(p.zoomMode) p.zoomMode = false; else p.lv = null; renderPresent(); return; }
  presExit(); });
document.addEventListener('input', function(e){ var p = S.present; if(!p || !p.lv) return; if(e.target.id === 'lvq'){ p.lv.f.q = e.target.value; clearTimeout(window.__lvq); window.__lvq = setTimeout(function(){ p.lv.i = 0; lvBuild(); var fk = focusKey(document.activeElement); renderPresent(); restoreFocus(fk); }, 250); } });
document.addEventListener('change', function(e){ var p = S.present; if(!p || !p.lv) return; var id = e.target.id; if(['lvst', 'lvblk', 'lvopen', 'lvod'].indexOf(id) < 0) return; var f = p.lv.f; if(id === 'lvst') f.st = e.target.value; if(id === 'lvblk') f.blk = e.target.value; if(id === 'lvopen') f.open = e.target.checked; if(id === 'lvod') f.od = e.target.checked; p.lv.i = 0; lvBuild(); renderPresent(); });
document.addEventListener('keydown', function(e){
  var p = S.present; if(!p) return; if(S.viewer) return;
  var tg = e.target; if(tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable)){ if(e.key === 'Escape'){ tg.blur(); e.preventDefault(); } return; }
  var k = e.key, used = true;
  if(/^[0-9]$/.test(k)){ p.num = (p.num || '') + k; clearTimeout(window.__pnum); window.__pnum = setTimeout(function(){ p.num = ''; }, 1500); }
  else if(k === 'Enter' && p.num){ presJump(+p.num); p.num = ''; }
  else if(k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter') presGo(1);
  else if(k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') presGo(-1);
  else if(k === 'Home') presGo(-1e4); else if(k === 'End') presGo(1e4);
  else if(k === 'Escape'){ if(p.menu) p.menu = null; else if(p.ov) p.ov = false; else if(p.drill) p.drill = null; else if(p.zoom) p.zoom = null; else if(p.zoomMode) p.zoomMode = false; else if(p.lv) p.lv = null; else { presExit(); e.preventDefault(); e.stopImmediatePropagation(); return; } renderPresent(); }
  else if(k === 'g' || k === 'G'){ p.ov = !p.ov; p.menu = null; renderPresent(); presFitOv(); }
  else if(k === 'z' || k === 'Z'){ p.zoomMode = !p.zoomMode; p.zoom = null; renderPresent(); }
  else if(k === 'l' || k === 'L'){ p.laser = !p.laser; renderPresent(); }
  else if(k === 'n' || k === 'N'){ p.note = !p.note; renderPresent(); }
  else if((k === 'f' || k === 'F') && presLive()){ p.menu = p.menu === 'focus' ? null : 'focus'; renderPresent(); }
  else if((k === 'r' || k === 'R') && presDeck()){ p.menu = p.menu === 'reg' ? null : 'reg'; renderPresent(); }
  else used = false;
  if(used){ e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
