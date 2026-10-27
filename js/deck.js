/* work-web v2 · Presentations.
   A deck is one record in a hidden "Presentations" register, so privacy, change log, undo and live sync come for free.
   Each slide = {id, type, title:{en,zh}, hidden, note, cfg}. Slide data is computed from the registers (live) by
   SLIDE_DATA[type](cfg, ctx) into plain JSON; SLIDE_RENDER[type](data, ctx) turns that JSON into one or more 1280×720 pages.
   Issuing a deck freezes the JSON (d.snap) so the deck keeps showing what was presented; the Owner copy carries the same JSON. */
'use strict';

var DECK_REG = 'reg_decks';
UI_ICONS.present = '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8M7 12l3-3 2 2 4-4"/>';
REG_ICONS.present = UI_ICONS.present;

/* ---------------- register & lookups ---------------- */
function deckReg(){ return getReg(DECK_REG) || ((STORE && STORE.regs) || []).filter(function(r){ return r.d.kind === 'decks'; })[0] || null; }
function allDecks(){ var r = deckReg(); if(!r) return []; return recsOf(r.id).slice().sort(function(a, b){ return String(b.d.date || '').localeCompare(String(a.d.date || '')) || String(b.d.no || '').localeCompare(String(a.d.no || '')); }); }
function canDeckEdit(){ var r = deckReg(); return r ? canWrite(r) : canTeamEdit(); }
function ensureDeckReg(){
  if(deckReg()) return Promise.resolve(deckReg());
  if(!canTeamEdit()) return Promise.reject(new Error('permission'));
  var r = {id:DECK_REG, vis:'team', d:{kind:'decks', en:'Presentations', zh:'演示文稿', icon:'present', sec:'other', prefix:'PRS', view:'table',
    fields:[F('no','No.','编号','text'),F('title','Title','标题','text'),F('titleZh','Title (中文)','标题（中文）','text'),F('date','Date','日期','date'),F('status','Status','状态','select',{opts:[O('draft','Draft','草稿','amber'),O('issued','Issued','已定稿','green',{done:true})]}),
      F('lang','Language','语言','text'),F('aud','Audience','对象','text'),F('meeting','Meeting','会议','link'),F('presenter','Presenter','汇报人','text'),F('slides','Slides','页面','sub',{cols:[], hide:true}),F('snap','Frozen data','定稿数据','check',{hide:true}),F('issuedAt','Issued at','定稿时间','text')],
    roles:{title:'title', no:'no', status:'status'}}};
  return STORE.createReg(r).then(function(){ return deckReg(); });
}
function tplReg(key){ var r = allRegs().filter(function(x){ return x.d.tpl === key && !isPrivate(x); })[0]; return r ? r.id : ''; }
function withLang(lang, fn){ var old = S.lang; S.lang = lang || 'en'; T_DOC++; try{ return fn(); } finally { S.lang = old; T_DOC--; } }
function regLab(reg){ return reg ? {en:reg.d.en || '', zh:reg.d.zh || '', icon:reg.d.icon, color:reg.d.color || 'blue'} : {en:'', zh:''}; }
function bil(o){ if(!o) return ''; if(S.lang === 'zh') return esc(o.zh || o.en || ''); if(S.lang === 'en' || !o.zh || o.zh === o.en) return esc(o.en || o.zh || ''); return esc(o.en || '') + '<span class="sl-zh">' + esc(o.zh) + '</span>'; }
/* a slide title as editable spans: data-ed names the path that inline editing writes to */
function edTitle(o){ o = o || {}; var en = o.en || '', zh = o.zh || '';
  if(S.lang === 'zh') return '<span data-ed="title.zh">' + esc(zh || en) + '</span>';
  if(S.lang === 'en' || !zh || zh === en) return '<span data-ed="title.en">' + esc(en || zh) + '</span>';
  return '<span data-ed="title.en">' + esc(en) + '</span><span class="sl-zh" data-ed="title.zh">' + esc(zh) + '</span>'; }
/* DK_STYLE: the style of the deck being built. In the drawing-sheet style the key message sits under the title (not in the body). */
var DK_STYLE = 'sheet';
function msgIn(s){ return DK_STYLE === 'classic' && !!(s && s.cfg && s.cfg.msg); }
function room(s, n, mc, sc){ var c = (s && s.cfg) || {}; return Math.max(3, n - (msgIn(s) ? (mc == null ? 1 : mc) : 0) - (c.side ? (sc == null ? 3 : sc) : 0)); }
function bulletsHtml(t){ var lines = String(t || '').split(/\n/).filter(function(x){ return x.trim(); }); return lines.length ? '<ul>' + lines.map(function(l){ var sb = /^\s{2,}|^\t|^-\s/.test(l); return '<li' + (sb ? ' class="sub"' : '') + '>' + esc(l.replace(/^[\s\-•*]+/, '')) + '</li>'; }).join('') + '</ul>' : ''; }
function bil1(o){ return o ? esc(S.lang === 'zh' ? (o.zh || o.en || '') : (o.en || o.zh || '')) : ''; }
function recPair(reg, r){ var ro = rolesOf(reg); return {en:(ro.title && r.d[ro.title]) || '', zh:(ro.title2 && r.d[ro.title2]) || ''}; }
function stPair(reg, r){ var o = statusOpt(reg, r); return o ? {en:o.en, zh:o.zh || '', color:o.color, done:!!o.done} : null; }
var DK_CACHE = null;
function isLeaf(r){ if(r.d && r.d.asDoc) return true; var idx = DK_CACHE ? (DK_CACHE[r.reg] || (DK_CACHE[r.reg] = kidsIndex(r.reg))) : kidsIndex(r.reg); return !idx[r.id]; }
function mxDef(reg, c){ var ro = rolesOf(reg); return {row:(c && c.row) || (reg.d.matrix && reg.d.matrix.row) || ro.tree || ro.status || '', col:(c && c.col) || (reg.d.matrix && reg.d.matrix.col) || ro.block || ''}; }

/* owner mode: only fields the Owner can see, External records (for registers that publish to the Owner), never private registers */
function dctx(deck){ return {deck:deck, owner:(deck.d.aud || 'owner') !== 'internal', asOf:d2n(deck.d.date) != null ? d2n(deck.d.date) : asOfN(), lang:deck.d.lang || 'en'}; }
/* decks are team-visible, so private (Only me) registers never feed a slide — not even an internal deck. */
function regOk(ctx, reg){ return !!reg && reg.d.kind !== 'decks' && !isPrivate(reg); }
/* ctx.focus (present mode “Focus”): only one block, only overdue, only key items */
function focusOk(f, reg, r){ if(f.blk){ var bf = rf(reg, 'block'); if(bf && asArr(r.d[bf.key]).indexOf(f.blk) < 0) return false; } if(f.od && !isOverdue(reg, r)) return false; if(f.star && !r.d.star) return false; return true; }
function recOk(ctx, reg, r){ if(ctx.focus && !focusOk(ctx.focus, reg, r)) return false; if(!ctx.owner) return true; if(isPrivate(reg)) return false; return !ownerGated(reg) || !!r.d.ext; }
/* registers on a slide that Owner mode cuts down: published-to-Owner registers show only records marked “Owner can see” */
function slideRegIds(s){
  var out = [];
  function take(c){ if(!c) return; (c.regs || []).forEach(function(id){ out.push(id); }); ['reg', 'ms', 'iss'].forEach(function(k){ if(c[k]) out.push(c[k]); }); }
  take(s.cfg); ['L', 'R'].forEach(function(k){ if(s.cfg && s.cfg[k]) take(s.cfg[k].cfg); });
  (s.els || []).forEach(function(e){ if(e.k === 'data') take(e.cfg); });
  return out.filter(function(id, i){ return id && out.indexOf(id) === i; });
}
function ownerGaps(deck, s){
  if(!deck || !s || !dctx(deck).owner) return [];
  return slideRegIds(s).map(getReg).filter(function(r){ return r && !isPrivate(r) && ownerGated(r); }).map(function(r){
    var rs = recsOf(r.id), n = 0; rs.forEach(function(x){ if(x.d.ext) n++; }); return {reg:r, ext:n, total:rs.length};
  }).filter(function(g){ return g.total > 0 && g.ext < g.total; });
}
function ownerGapHtml(gaps, ed, strong){
  if(!gaps.length) return '';
  var list = gaps.map(function(g){ return '<b>' + esc(regName(g.reg)) + '</b> ' + g.ext + ' / ' + g.total; }).join(' · ');
  var msg = strong ? L('Owner mode · records shared with the Owner: ', '业主模式 · 对业主公开的记录：') + list : L('Owner mode shows only records marked “Owner can see”: ', '业主模式只显示标记「业主可见」的记录：') + list;
  return '<div class="dk-ogap' + (strong ? ' strong' : '') + '">' + uic('eye', 13) + ' <span title="' + esc(T('Owner mode shows only records marked “Owner can see”.', '业主模式只显示标记「业主可见」的记录。')) + '">' + msg + '</span>' +
    (ed ? '<button type="button" class="btn sm" data-act="dkSet" data-k="aud" data-v="internal">' + L('Use Internal', '改为内部') + '</button>' +
      gaps.map(function(g){ return '<button type="button" class="btn sm" data-act="reg" data-v="' + esc(g.reg.id) + '" title="' + esc(T('Open the register, tick rows and use “Show to the Owner”', '打开台账，勾选记录后点「对业主显示」')) + '">' + L('Choose records', '选择记录') + (gaps.length > 1 ? ' · ' + esc(regName(g.reg)) : '') + ' →</button>'; }).join('') : '') + '</div>';
}
function fieldOk(ctx, reg, f){ if(!ctx.owner) return true; if(typeof isLk === 'function' && isLk(f)) return false;   /* v3.4: lookups read other registers */ var ro = rolesOf(reg); if(reg.d.kind === 'library' && LIB_OWNER_KEYS.indexOf(f.key) >= 0) return true; return !!f.ext || [ro.title, ro.title2, ro.no].indexOf(f.key) >= 0; }
function defCols(reg){ var ro = rolesOf(reg); return [ro.no, ro.title, ro.block, ro.start, ro.finish, ro.progress, ro.status].filter(function(k, i, a){ return k && fieldOf(reg, k) && a.indexOf(k) === i; }); }
/* a table row's group: a select option, or a package (tree) at level 1 or 2 — bilingual, with a sort order */
function tblGroup(reg, r, f, lvl){
  var v = r.d[f.key];
  if(f.type === 'tree'){ var path = treePath(f, v), n = path[Math.min(lvl, path.length) - 1]; if(!n) return {k:'_n', en:'Unclassified', zh:'未分类', o:1e9};
    var ord = 0, i = 0; treeDfs(f, function(x){ if(x.id === n.id) ord = i; i++; }); var cd = n.code ? n.code + ' ' : ''; return {k:'t:' + n.id, en:cd + (n.en || n.zh || ''), zh:cd + (n.zh || n.en || ''), o:ord}; }
  if(f.type === 'select'){ var x = asArr(v)[0]; if(x == null || x === '') return {k:'_n', en:'(empty)', zh:'（空）', o:1e9}; var o = optOf(f, x), opts = optsOf(f);
    return {k:'v:' + x, en:o ? o.en || x : x, zh:o ? o.zh || o.en || x : x, o:o ? opts.indexOf(o) : 5e8}; }
  var t = String(v == null ? '' : textOf(reg, f, r)).trim(); return t ? {k:'x:' + t, en:t, zh:t, o:0} : {k:'_n', en:'(empty)', zh:'（空）', o:1e9};
}
function usable(ctx, ids){ return (ids || []).map(getReg).filter(function(r){ return regOk(ctx, r); }); }

/* which items of a table slide are open: the slide's own choice (saved), changed for the moment while presenting */
function slOpen(s){ var o = {}; asArr(s && s.cfg && s.cfg.open).forEach(function(id){ o[id] = 1; }); var rt = typeof S !== 'undefined' && S.present && S.present.open;
  return function(id){ return rt && Object.prototype.hasOwnProperty.call(rt, id) ? !!rt[id] : !!o[id]; }; }

/* ---------------- slide types ---------------- */
var SLIDES = {
  cover:{en:'Cover', zh:'封面', t:['',''], def:function(){ return {sub:'', presenter:''}; }},
  kpi:{en:'Key figures', zh:'关键数据', t:['Progress overview','进度总览'], def:function(){ return {regs:allRegs().filter(function(r){ return !isPrivate(r) && !r.d.meeting && !r.d.allMs && r.d.tpl !== 'issues' && rf(r, 'status'); }).map(function(r){ return r.id; })}; }},
  matrix:{en:'Block progress matrix', zh:'区域进度矩阵', t:['Progress by block','分区施工进度'], def:function(){ return {reg:tplReg('site'), row:'', col:'', val:'progress'}; }},
  lookahead:{en:'Look-ahead', zh:'近期计划', t:['Look-ahead','近期工作计划'], def:function(){ return {regs:[tplReg('site'), tplReg('turnover')].filter(Boolean), weeks:3, overdue:true}; }},
  table:{en:'Register table / list', zh:'台账表格 / 清单', t:['Register','台账'], def:function(){ return {reg:tplReg('turnover'), cols:null, filter:{}, per:10}; }},
  breakdown:{en:'Status breakdown', zh:'状态分布', t:['Status by package','按分类的状态分布'], def:function(){ return {reg:tplReg('turnover'), by:''}; }},
  punch:{en:'Punch-list summary', zh:'尾项汇总', t:['Punch list','尾项 / 缺陷'], def:function(){ return {reg:tplReg('punch')}; }},
  photos:{en:'Site photos', zh:'现场照片', t:['Site photos','现场照片'], def:function(){ return {mode:'auto', days:7, regs:[], picks:[], layout:'2x2'}; }},
  actions:{en:'Meeting action items', zh:'会议待办', t:['Action items','待办事项'], def:function(){ return {reg:tplReg('meetings'), meeting:'latest', open:true}; }},
  text:{en:'Text / bullets', zh:'文字 / 要点', t:['Notes','说明'], def:function(){ return {body:'', body2:''}; }},
  section:{en:'Section divider', zh:'分节页', t:['Section','分节'], def:function(){ return {sub:''}; }}
};
var SLIDE_ORDER = ['cover','kpi','matrix','lookahead','table','breakdown','punch','photos','actions','text','section'];
function newSlide(type, cfg, title){ var t = SLIDES[type]; return {id:uid('s'), type:type, title:title || {en:t.t[0], zh:t.t[1]}, hidden:false, note:'', cfg:Object.assign(t.def(), cfg || {})}; }

/* ---------------- data (pure JSON, frozen on issue) ---------------- */
function pctOf(reg, list){ var ps = list.map(function(r){ return progressOf(reg, r, true); }).filter(function(x){ return x != null; }); return ps.length ? Math.round(ps.reduce(function(s, x){ return s + x; }, 0) / ps.length) : null; }
function aggCell(reg, items, val){
  if(!items.length) return null;
  if(val === 'count') return {t:String(items.length), v:null};
  if(val === 'open'){ var o = items.filter(function(r){ return !isDone(reg, r); }).length; return {t:String(o), v:null, bad:o > 0}; }
  var pf = rf(reg, 'progress');
  if(pf && pf.auto){ var a = 0, b = 0, any = false; items.forEach(function(r){ var x = num(r.d[pf.auto.a]), y = num(r.d[pf.auto.b]); if(x != null && y){ a += x; b += y; any = true; } }); if(any){ var p = Math.round(a / b * 100); return {t:p + '%', v:p, sub:Math.round(a).toLocaleString() + ' / ' + Math.round(b).toLocaleString()}; } }
  var avg = pctOf(reg, items); return avg == null ? {t:'—', v:null} : {t:avg + '%', v:avg};
}
var SLIDE_DATA = {
  cover:function(c, ctx){ var d = ctx.deck.d, m = d.meeting && getRec(d.meeting), mr = m && getReg(m.reg), pc = cfg();
    return {title:{en:d.title || '', zh:d.titleZh || ''}, sub:c.sub || '', date:d.date || '', presenter:c.presenter || d.presenter || '', project:{en:pc.projectEn, zh:pc.projectZh},
      meeting: m && mr ? {no:recNo(mr, m), loc:m.d.loc || '', time:m.d.time || ''} : null}; },
  kpi:function(c, ctx){ var A = ctx.asOf, tot = 0, done = 0, od = 0, due = 0, wsum = 0, wn = 0;
    var items = usable(ctx, c.regs).map(function(reg){ var rs = recsOf(reg.id).filter(function(r){ return recOk(ctx, reg, r) && isLeaf(r); });
      var dn = rs.filter(function(r){ return isDone(reg, r); }).length, o = rs.filter(function(r){ if(isDone(reg, r)) return false; var p = planOf(reg, r); return p && p.f < A; }).length;
      var d14 = rs.filter(function(r){ if(isDone(reg, r)) return false; var p = planOf(reg, r); return p && p.f >= A && p.f <= A + 14; }).length, pc = pctOf(reg, rs);
      tot += rs.length; done += dn; od += o; due += d14; if(pc != null){ wsum += pc * rs.length; wn += rs.length; }
      return {id:reg.id, reg:regLab(reg), n:rs.length, done:dn, od:o, due:d14, pct:pc}; });
    return {items:items, tot:tot, done:done, od:od, due:due, pct: wn ? Math.round(wsum / wn) : null, hideT:(c.hide || []).filter(function(k){ return /^t:/.test(k); })}; },
  matrix:function(c, ctx){ var reg = getReg(c.reg); if(!regOk(ctx, reg)) return {err:'reg'};
    var md = mxDef(reg, c), row = md.row, col = md.col, cf = fieldOf(reg, col), rfd = fieldOf(reg, row);
    if(!cf || !rfd) return {err:'cfg'};
    var hd = (c.hide || []), list = recsOf(reg.id).filter(function(r){ return recOk(ctx, reg, r) && isLeaf(r); }), cols = optsOf(cf).filter(function(o){ return hd.indexOf('c:' + o.v) < 0; }).map(function(o){ return {v:o.v, en:o.en, zh:o.zh || '', color:o.color}; });
    var rows = groupRecs(reg, list, row).filter(function(g){ return hd.indexOf('g:' + g.label) < 0; }).map(function(g){ return {label:g.label, color:g.color || '', cells:cols.map(function(cc){ return aggCell(reg, g.items.filter(function(r){ return asArr(r.d[cf.key]).indexOf(cc.v) >= 0; }), c.val); }), tot:aggCell(reg, g.items, c.val)}; });
    return {reg:regLab(reg), rowName:{en:rfd.en, zh:rfd.zh || ''}, cols:cols, rows:rows, val:c.val, total:{cells:cols.map(function(cc){ return aggCell(reg, list.filter(function(r){ return asArr(r.d[cf.key]).indexOf(cc.v) >= 0; }), c.val); }), all:aggCell(reg, list, c.val)}}; },
  lookahead:function(c, ctx){ var A = ctx.asOf, dow = (new Date(A * 864e5).getUTCDay() + 6) % 7, from = A - dow, to = from + (c.weeks || 3) * 7 - 1, rows = [];
    usable(ctx, c.regs).forEach(function(reg){ var bf = rf(reg, 'block'); recsOf(reg.id).forEach(function(r){ if(!recOk(ctx, reg, r) || !isLeaf(r) || isDone(reg, r) || (c.hide || []).indexOf('r:' + r.id) >= 0) return; var p = planOf(reg, r); if(!p) return;
      var inWin = p.s <= to && p.f >= from, late = p.f < from; if(!inWin && !(late && c.overdue)) return;
      var pv = progressOf(reg, r); rows.push({id:r.id, reg:regLab(reg), no:recNo(reg, r), t:recPair(reg, r), s:p.s, f:p.f, pct:pv == null ? null : Math.round(pv), st:stPair(reg, r), od:p.f < A, ms:isMilestone(reg, r) || p.s === p.f, blocks:bf ? asArr(r.d[bf.key]) : null}); }); });
    rows.sort(function(a, b){ return (b.od - a.od) || a.s - b.s; });
    return {from:from, to:to, asOf:A, rows:rows}; },
  table:function(c, ctx){ var reg = getReg(c.reg); if(!regOk(ctx, reg)) return {err:'reg'};
    var f = c.filter || {}, A = ctx.asOf, ro = rolesOf(reg), sf = rf(reg, 'status'), bf = rf(reg, 'block');
    var fx = clone(f.fx || {}); if(sf && f.st && f.st.length) fx[sf.key] = f.st; if(bf && f.blk && f.blk.length) fx[bf.key] = f.blk;
    var mf = {q:f.q || '', fx:fx, from:f.from || '', to:f.to || '', od:false, star:!!f.star, ext:!!f.ext, node:f.node || 'all'};
    var hd = c.hide || [], list;
    if(c.mode === 'pick') list = (c.picks || []).map(getRec).filter(function(r){ return r && r.reg === reg.id && recOk(ctx, reg, r) && hd.indexOf('r:' + r.id) < 0; });
    else {
      list = recsOf(reg.id).filter(function(r){ if(hd.indexOf('r:' + r.id) >= 0 || !recOk(ctx, reg, r) || !matchRec(reg, r, mf)) return false; if(f.open && isDone(reg, r)) return false; var p = planOf(reg, r);
        if(f.od && !(p && p.f < A && !isDone(reg, r))) return false; if(f.due && !(p && p.f <= A + f.due * 7)) return false; return true; });
      var sk = (c.sort && c.sort.k) || ro.no, sd = (c.sort && c.sort.d) || 1;
      list.sort(function(a, b){ var x = sortValue(reg, a, sk), y = sortValue(reg, b, sk); return (x < y ? -1 : x > y ? 1 : 0) * sd; }); }
    var keys = c.cols && c.cols.length ? c.cols : defCols(reg);
    var fs = keys.map(function(k){ return fieldOf(reg, k); }).filter(function(x){ return x && fieldOk(ctx, reg, x); });
    var gf = c.group && fieldOf(reg, c.group), gl = c.glvl === 2 ? 2 : 1, gof = {};
    if(gf){ list.forEach(function(r){ gof[r.id] = tblGroup(reg, r, gf, gl); }); list = list.filter(function(r){ return hd.indexOf('g:' + gof[r.id].k) < 0; });
      var pos = {}; list.forEach(function(r, i){ pos[r.id] = i; }); list.sort(function(a, b){ return (gof[a.id].o - gof[b.id].o) || (pos[a.id] - pos[b.id]); }); }
    var sf2 = rf(reg, 'status');
    function stCounts(rs){ if(!sf2) return []; rs = rs.filter(isLeaf); return optsOf(sf2).map(function(o){ return {en:o.en, zh:o.zh || '', color:o.color, n:rs.filter(function(r){ return asArr(val(r, sf2))[0] === o.v; }).length}; }).filter(function(x){ return x.n; }); }
    /* v3.4.7: a package counts its documents — items and the sub-items under them, not heading items */
    function gDocs(rs){ var out = []; (function w(a, g){ a.forEach(function(r){ out.push(r); if(g < 6) w(kidsL[r.id] || [], g + 1); }); })(rs, 0); return out.filter(isLeaf); }
    /* v3.4.6: an item's sub-items follow it (under discipline headings); they are hidden until the item is opened */
    var inL = {}, kidsL = {}; list.forEach(function(r){ inL[r.id] = 1; });
    list.forEach(function(r){ var p = r.d.parent; if(p && p !== r.id && inL[p]) (kidsL[p] = kidsL[p] || []).push(r); });
    var tops = list.filter(function(r){ var p = r.d.parent; return !(p && p !== r.id && inL[p]); });
    var sgf = typeof subGroupField === 'function' ? subGroupField(reg) : null;
    function kidRows(r, lv, out, guard){ var ks = kidsL[r.id] || []; if(!ks.length || guard > 6) return;
      var gs = {}, order = [];
      if(sgf){ ks.forEach(function(k){ var v = asArr(k.d[sgf.key])[0]; v = v == null ? '' : String(v); if(!gs[v]){ gs[v] = []; order.push(v); } gs[v].push(k); });
        var ov = optsOf(sgf).map(function(o){ return o.v; }); order.sort(function(a, b){ var ra = a === '' ? 1e9 : (ov.indexOf(a) >= 0 ? ov.indexOf(a) : 1e6), rb = b === '' ? 1e9 : (ov.indexOf(b) >= 0 ? ov.indexOf(b) : 1e6); return ra - rb || a.localeCompare(b); }); }
      if(order.length < 2){ ks.forEach(function(k){ out.push(rowOf(k, lv, r.id)); kidRows(k, lv + 1, out, guard + 1); }); return; }
      order.forEach(function(v){ var o = v ? optOf(sgf, v) : null; out.push({h:1, pid:r.id, lv:lv, en:v ? (o ? o.en || v : v) : 'No ' + (sgf.en || '').toLowerCase(), zh:v ? (o ? o.zh || o.en || v : v) : '未填' + (sgf.zh || sgf.en || ''), n:gs[v].length});
        gs[v].forEach(function(k){ out.push(rowOf(k, lv, r.id)); kidRows(k, lv + 1, out, guard + 1); }); });
    }
    function withKids(rs){ var out = []; rs.forEach(function(r){ out.push(rowOf(r, 0, null)); kidRows(r, 1, out, 0); }); return out; }
    function rowOf(r, lv, pid){ var ks = kidsL[r.id] || [], kd = ks.filter(function(k){ return isDone(reg, k); }).length;
      return {id:r.id, hl:recNo(reg, r) + ' ' + (r.d[ro.title] || ''), od:isOverdue(reg, r), dep:lv || 0, lv:lv || 0, pid:pid || null, kn:ks.length, kd:kd, kc:ks.length, c:fs.map(function(x){
        if(x.key === ro.title) return {t:recPair(reg, r)};
        if(x.type === 'select' && !x.multi && !x.list){ var o = optOf(x, asArr(val(r, x))[0]); return o ? {s:{en:o.en, zh:o.zh || '', color:o.color}} : {v:''}; }
        if(x.type === 'percent' || (x.type === 'calc' && x.calc && x.calc.op === 'pct')){ var pv = val(r, x); if(pv == null && x.key === ro.progress) pv = progressOf(reg, r); return {p:pv == null ? null : Math.round(pv)}; }
        if(x.type === 'tree'){ var n = treeNode(x, r.d[x.key]); return {v: n ? treeLabel(n) : ''}; }
        if(x.type === 'select' && x.list === 'blocks') return {b:asArr(r.d[x.key])};
        return {v:textOf(reg, x, r), m:x.type === 'date' || x.type === 'number' || x.key === ro.no}; })}; }
    var rows = [], topSet = {}; tops.forEach(function(r){ topSet[r.id] = 1; });
    if(gf){ var cur = null, grs = [];
      list.forEach(function(r){ if(!topSet[r.id]) return; var g = gof[r.id]; if(!cur || cur.k !== g.k){ cur = {k:g.k, en:g.en, zh:g.zh, items:[]}; grs.push(cur); } cur.items.push(r); });
      grs.forEach(function(g){ var gd = gDocs(g.items); rows.push({g:1, k:g.k, en:g.en, zh:g.zh, n:gd.length, st:c.gst === false ? [] : stCounts(gd)}); rows = rows.concat(withKids(g.items)); }); }
    else rows = withKids(tops);
    return {reg:regLab(reg), cols:fs.map(function(x){ return {en:x.en, zh:x.zh || '', type:x.type, key:x.key, title:x.key === ro.title}; }), per:c.per || 12, dense:!!c.dense,
      sum:c.sum ? {n:list.filter(isLeaf).length, od:list.filter(function(r){ return isOverdue(reg, r); }).length, st:stCounts(list)} : null, rows:rows}; },
  breakdown:function(c, ctx){ var reg = getReg(c.reg); if(!regOk(ctx, reg)) return {err:'reg'};
    var ro = rolesOf(reg), by = c.by || ro.tree || ro.block, sf = rf(reg, 'status'); if(!fieldOf(reg, by) || !sf) return {err:'cfg'};
    var list = recsOf(reg.id).filter(function(r){ return recOk(ctx, reg, r) && isLeaf(r); }), opts = optsOf(sf);
    return {reg:regLab(reg), by:{en:fieldOf(reg, by).en, zh:fieldOf(reg, by).zh || ''}, legend:opts.map(function(o){ return {en:o.en, zh:o.zh || '', color:o.color}; }),
      groups:groupRecs(reg, list, by).filter(function(g){ return (c.hide || []).indexOf('g:' + g.label) < 0; }).map(function(g){ return {label:g.label, n:g.items.length, done:g.items.filter(function(r){ return isDone(reg, r); }).length, segs:opts.map(function(o){ return g.items.filter(function(r){ return asArr(val(r, sf))[0] === o.v; }).length; })}; })}; },
  punch:function(c, ctx){ var reg = getReg(c.reg); if(!regOk(ctx, reg)) return {err:'reg'};
    var A = ctx.asOf, pf = fieldOf(reg, 'prio') || dataFields(reg).filter(function(f){ return f.type === 'select' && !f.multi && f.key !== rolesOf(reg).status && !f.list; })[0], bf = rf(reg, 'block');
    var all = recsOf(reg.id).filter(function(r){ return recOk(ctx, reg, r) && isLeaf(r); }), open = all.filter(function(r){ return !isDone(reg, r); });
    var prios = pf ? optsOf(pf).map(function(o){ return {v:o.v, en:o.en, zh:o.zh || '', color:o.color}; }) : [], blocks = bf ? optsOf(bf).map(function(o){ return {v:o.v, color:o.color}; }) : [];
    var closedF = fieldOf(reg, 'closed'), closedWk = closedF ? all.filter(function(r){ var n = d2n(r.d.closed); return n != null && n > A - 7 && n <= A; }).length : null;
    var grid = prios.map(function(p){ return blocks.map(function(b){ return open.filter(function(r){ return r.d[pf.key] === p.v && asArr(r.d[bf.key]).indexOf(b.v) >= 0; }).length; }); });
    var po = {}; prios.forEach(function(p, i){ po[p.v] = i; });
    var top = open.filter(function(r){ return (c.hide || []).indexOf('r:' + r.id) < 0; }).sort(function(a, b){ return ((pf ? po[a.d[pf.key]] : 0) || 0) - ((pf ? po[b.d[pf.key]] : 0) || 0) || (planOf(reg, a) ? planOf(reg, a).f : 1e9) - (planOf(reg, b) ? planOf(reg, b).f : 1e9); }).slice(0, 7);
    var rf2 = dataFields(reg).filter(function(f){ return f.list === 'people'; })[0];
    return {reg:regLab(reg), prios:prios, blocks:blocks, grid:grid, open:open.length, total:all.length, od:open.filter(function(r){ return isOverdue(reg, r); }).length, closedWk:closedWk,
      top:top.map(function(r){ var p = planOf(reg, r), po2 = pf && optOf(pf, r.d[pf.key]); return {id:r.id, no:recNo(reg, r), t:recPair(reg, r), b:bf ? asArr(r.d[bf.key]) : [], loc:r.d.loc || '', due:p ? n2d(p.f) : '', od:isOverdue(reg, r), prio:po2 ? {v:po2.v, color:po2.color} : null, who:rf2 ? textOf(reg, rf2, r) : ''}; })}; },
  photos:function(c, ctx){ var A = ctx.asOf, out = [];
    function push(reg, r, x, f){ var bf = rf(reg, 'block'); out.push({path:x.path, name:x.name || '', no:recNo(reg, r), t:recPair(reg, r), f:{en:f.en, zh:f.zh || ''}, b:bf ? asArr(r.d[bf.key]) : [], date:String(x.at || r.ua || '').slice(0, 10)}); }
    /* a record's photos = its own attachments + photos of library documents linked to it (recFiles) */
    if(c.mode === 'pick'){ (c.picks || []).forEach(function(pk){ var r = getRec(pk.rec), reg = r && getReg(r.reg); if(!r || !regOk(ctx, reg) || !recOk(ctx, reg, r)) return; recFiles(r).forEach(function(fx){ if(fx.x.path === pk.path) push(reg, r, fx.x, fx.f); }); }); }
    else { var regs = c.regs && c.regs.length ? usable(ctx, c.regs) : allRegs().filter(function(r){ return regOk(ctx, r); }), seen = {};
      regs.forEach(function(reg){ recsOf(reg.id).forEach(function(r){ if(!recOk(ctx, reg, r)) return; recFiles(r).forEach(function(fx){ var x = fx.x; if(!/^image\//.test(x.type || '') || seen[x.path]) return; var n = d2n(String(x.at || r.ua || '').slice(0, 10)); if(n == null || n < A - (c.days || 7) || n > A + 1) return; seen[x.path] = 1; push(reg, r, x, fx.f); }); }); });
      out.sort(function(a, b){ return String(b.date).localeCompare(String(a.date)); }); out = out.slice(0, 24); }
    out = out.filter(function(p){ return (c.hide || []).indexOf('p:' + p.path) < 0; });
    return {photos:out, layout:c.layout || '2x2'}; },
  actions:function(c, ctx){ var reg = getReg(c.reg); if(!regOk(ctx, reg)) return {err:'reg'};
    var sub = dataFields(reg).filter(function(f){ return f.type === 'sub' && (f.cols || []).some(function(x){ return x.type === 'check'; }); })[0]; if(!sub) return {err:'cfg'};
    var ck = sub.cols.filter(function(x){ return x.type === 'check'; })[0].key, dk = (sub.cols.filter(function(x){ return x.type === 'date'; })[0] || {}).key, tk = (sub.cols.filter(function(x){ return x.type === 'text' || x.type === 'long'; })[0] || {}).key, wk = (sub.cols.filter(function(x){ return /who|owner|resp/i.test(x.key); })[0] || {}).key;
    var m = null, ro = rolesOf(reg);
    if(c.meeting && c.meeting !== 'latest') m = getRec(c.meeting);
    if(!m) m = recsOf(reg.id).filter(function(r){ var n = d2n(r.d[ro.start]); return asArr(r.d[sub.key]).length && (n == null || n <= ctx.asOf); }).sort(function(a, b){ return String(b.d[ro.start] || '').localeCompare(String(a.d[ro.start] || '')); })[0];
    if(!m || !recOk(ctx, reg, m)) return {meeting:null, rows:[]};
    var rows = asArr(m.d[sub.key]).filter(function(x){ return (!c.open || !x[ck]) && (c.hide || []).indexOf('a:' + x._id) < 0; }).map(function(x){ var n = d2n(x[dk]); return {id:x._id, a:x[tk] || '', who:subVal(sub.cols.filter(function(cc){ return cc.key === wk; })[0], x[wk]) || '', due:x[dk] || '', done:!!x[ck], od:!x[ck] && n != null && n < ctx.asOf}; });
    return {meeting:{no:recNo(reg, m), t:recPair(reg, m), date:m.d[ro.start] || ''}, rows:rows}; },
  text:function(c){ return {body:c.body || '', body2:c.body2 || ''}; },
  section:function(c){ return {sub:c.sub || ''}; }
};

/* ---------------- render (data → page bodies) ---------------- */
function slBar(p){ p = p == null ? 0 : clamp(Math.round(p), 0, 100); return '<span class="sl-bar"><i style="width:' + p + '%"></i></span>'; }
function slBlk(arr){ arr = arr || []; if(!arr.length) return '<span class="sl-blk">' + (S.lang === 'zh' ? '全场' : 'Site') + '</span>'; if(arr.length > 2) return '<span class="sl-blk">' + esc(arr.join('·')) + '</span>'; return arr.map(function(b){ return '<span class="sl-blk">' + esc(b) + '</span>'; }).join(''); }
function slChip(s){ return s ? '<span class="sl-chip c-' + esc(s.color || 'grey') + '"><i></i>' + bil1(s) + '</span>' : ''; }
function slSt(color, txt){ return '<span class="sl-chip c-' + esc(color || 'grey') + '"><i></i>' + esc(txt) + '</span>'; }
function slHeat(v){ if(v == null) return ''; var t = (6 + clamp(+v || 0, 0, 100) * 0.55) / 100; return 'background:rgb(' + [46, 158, 106].map(function(c){ return Math.round(255 + (c - 255) * t); }).join(',') + ')'; }
function chunk(arr, n){ var out = []; for(var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out.length ? out : [[]]; }
function fmtD(n){ var d = new Date(n * 864e5); return pad(d.getUTCDate()) + ' ' + MON[d.getUTCMonth()]; }
/* SL_WHY: set while drawing data whose registers have nothing shared with the Owner, so “no items” reads true for that audience */
var SL_WHY = 0;
function slEmpty(en, zh){ if(SL_WHY){ en = 'Nothing from the chosen registers is shared with the Owner yet.'; zh = '所选台账还没有对业主公开的记录。'; } return '<div class="sl-empty">' + esc(S.lang === 'zh' ? zh : en) + '</div>'; }
/* v3.3 · columns (and caption parts, tiles) hidden on one slide: hover → × on the editor preview, restored in the side panel */
function slHid(s, k){ return !!(s && s.cfg && (s.cfg.hide || []).indexOf(k.indexOf(':') > 0 ? k : 'c:' + k) >= 0); }
function slTh(s, k, label, st){ return slHid(s, k) ? '' : '<th data-hk="c:' + k + '" data-hl="' + esc(label) + '"' + (st ? ' style="' + st + '"' : '') + '>' + label + '</th>'; }
function slTd(s, k, html){ return slHid(s, k) ? '' : html; }
function slRender(type, data, s, box){ SL_WHY = data && data._on ? 1 : 0; try{ return SLIDE_RENDER[type](data, s, box); } finally { SL_WHY = 0; } }
function ownerNone(c, ctx){
  if(!ctx || !ctx.owner) return false;
  var regs = slideRegIds({cfg:c}).map(getReg).filter(function(r){ return r && !isPrivate(r); });
  return regs.length > 0 && regs.some(function(r){ return recsOf(r.id).length; }) && regs.every(function(r){ return ownerGated(r) && !recsOf(r.id).some(function(x){ return x.d.ext; }); });
}
var SLIDE_RENDER = {
  cover:function(d){
    var zh = S.lang === 'zh', ttl = zh ? (d.title.zh || d.title.en) : (d.title.en || d.title.zh), dt = d.date ? (zh ? +d.date.slice(0, 4) + '年' + (+d.date.slice(5, 7)) + '月' + (+d.date.slice(8, 10)) + '日' : fmtD(d2n(d.date)) + ' ' + d.date.slice(0, 4)) : '';
    if(DK_STYLE === 'sheet'){
      var cells = [[T('Date', '日期'), dt + (d.meeting && d.meeting.time ? ' · ' + d.meeting.time : '')]];
      if(d.meeting && d.meeting.loc) cells.push([T('Venue', '地点'), d.meeting.loc]);
      if(d.presenter) cells.push([T('Presented by', '汇报人'), d.presenter, 'cfg.presenter']);
      if(d.meeting) cells.push([T('Meeting', '会议'), d.meeting.no]);
      return ['<i class="sl-cvb"></i><div class="sl-cv3"><div class="sl-cv3-proj">' + esc(d.project.en) + (d.project.zh && S.lang !== 'en' ? '<span>' + esc(d.project.zh) + '</span>' : '') + '</div>' +
        '<h1 data-ed="' + (zh ? 'deck.titleZh' : 'deck.title') + '">' + esc(ttl) + '</h1>' + (S.lang === 'both' && d.title.zh && d.title.en ? '<h2 data-ed="deck.titleZh">' + esc(d.title.zh) + '</h2>' : '') +
        '<i class="sl-cv3-rule"></i><p class="sl-cv-sub" data-ed="cfg.sub" data-ph="' + esc(T('Subtitle', '副标题')) + '">' + esc(d.sub || '') + '</p></div>' +
        '<div class="sl-tb sl-tbcv">' + cells.map(function(c){ return '<div><small>' + esc(c[0]) + '</small><b' + (c[2] ? ' data-ed="' + c[2] + '"' : '') + '>' + esc(c[1]) + '</b></div>'; }).join('') + '</div>']; }
    return ['<div class="sl-cv-l"><i class="sl-cv-bar"></i><div class="sl-cv-proj">' + esc(d.project.en) + (d.project.zh && S.lang !== 'en' ? '<span>' + esc(d.project.zh) + '</span>' : '') + '</div><h1 data-ed="' + (zh ? 'deck.titleZh' : 'deck.title') + '">' + esc(ttl) + '</h1>' + (S.lang === 'both' && d.title.zh && d.title.en ? '<h2 data-ed="deck.titleZh">' + esc(d.title.zh) + '</h2>' : '') + '<p class="sl-cv-sub" data-ed="cfg.sub" data-ph="' + esc(T('Subtitle', '副标题')) + '">' + esc(d.sub || '') + '</p></div>' +
    '<div class="sl-cv-meta"><div><b>' + T('Date', '日期') + '</b>' + esc(dt) + (d.meeting && d.meeting.time ? ' · ' + esc(d.meeting.time) : '') + '</div>' + (d.meeting && d.meeting.loc ? '<div><b>' + T('Venue', '地点') + '</b>' + esc(d.meeting.loc) + '</div>' : '') + (d.presenter ? '<div><b>' + T('Presented by', '汇报人') + '</b><span data-ed="cfg.presenter">' + esc(d.presenter) + '</span></div>' : '') + (d.meeting ? '<div><b>' + T('Meeting', '会议') + '</b>' + esc(d.meeting.no) + '</div>' : '') + '</div>']; },
  section:function(d, s, box){
    if(DK_STYLE === 'sheet') return ['<div class="sl-sec3"><b class="sl-secn">' + (box && box.secNo ? pad(box.secNo) : '') + '</b><div class="sl-sec3t"><h1>' + edTitle(s.title) + '</h1><p data-ed="cfg.sub" data-ph="' + esc(T('Subtitle', '副标题')) + '">' + esc(d.sub || '') + '</p></div></div>'];
    return ['<div class="sl-sec"><h1>' + edTitle(s.title) + '</h1><p data-ed="cfg.sub" data-ph="' + esc(T('Subtitle', '副标题')) + '">' + esc(d.sub || '') + '</p></div>']; },
  kpi:function(d, s){
    if(!d.items.length) return [slEmpty('Choose registers for this slide.', '请为此页选择台账。')];
    var tiles = [[T('Overall progress', '总体进度'), d.pct == null ? '—' : d.pct + '%', d.pct, ''], [T('Items completed', '已完成'), d.done + ' / ' + d.tot, null, ''], [T('Overdue', '逾期'), String(d.od), null, d.od ? 'bad' : ''], [T('Due in next 14 days', '未来 14 天到期'), String(d.due), null, '']];
    return ['<div class="sl-tiles">' + tiles.map(function(t, ti){ return ((d.hideT || []).indexOf('t:' + ti) >= 0 || (s && s.cfg && (s.cfg.hide || []).indexOf('t:' + ti) >= 0)) ? '' : '<div class="sl-tile ' + t[3] + '" data-hk="t:' + ti + '" data-hl="' + esc(t[0]) + '"><span>' + esc(t[0]) + '</span><b>' + esc(t[1]) + '</b>' + (t[2] != null ? slBar(t[2]) : '') + '</div>'; }).join('') + '</div>' +
      '<table class="sl-t sl-kt"><thead><tr><th>' + T('Register', '台账') + '</th>' + slTh(s, 'n', T('Items', '数量')) + slTh(s, 'done', T('Completed', '已完成')) + slTh(s, 'pct', T('Progress', '进度'), 'width:300px') + slTh(s, 'od', T('Overdue', '逾期')) + slTh(s, 'due', T('Due ≤ 14 d', '14 天内到期')) + '</tr></thead><tbody>' +
      d.items.map(function(x){ return '<tr data-hk="k:' + esc(x.id || '') + '" data-hl="' + esc(x.reg.en) + '"><td><b>' + bil(x.reg) + '</b></td>' + slTd(s, 'n', '<td class="n">' + x.n + '</td>') + slTd(s, 'done', '<td class="n">' + x.done + '</td>') + slTd(s, 'pct', '<td>' + (x.pct != null ? slBar(x.pct) + ' <span class="n">' + x.pct + '%</span>' : '—') + '</td>') + slTd(s, 'od', '<td class="n' + (x.od ? ' bad' : '') + '">' + x.od + '</td>') + slTd(s, 'due', '<td class="n">' + x.due + '</td>') + '</tr>'; }).join('') + '</tbody></table>'];
  },
  matrix:function(d, s){
    if(d.err) return [slEmpty('Choose a register with a Block field.', '请选择有区域字段的台账。')];
    var rows = chunk(d.rows, room(s, 9, 1, 1));
    return rows.map(function(part, pi){ return '<table class="sl-t sl-mx"><thead><tr><th>' + bil1(d.rowName) + '</th>' + d.cols.map(function(c){ return '<th data-hk="c:' + esc(c.v) + '" data-hl="' + esc(c.v) + '"><span class="sl-blk c-' + esc(c.color) + '">' + esc(c.v) + '</span> ' + bil1(c) + '</th>'; }).join('') + '<th>' + T('Total', '合计') + '</th></tr></thead><tbody>' +
      part.map(function(r){ return '<tr data-hk="g:' + esc(r.label) + '" data-hl="' + esc(r.label) + '"><th>' + esc(r.label) + '</th>' + r.cells.map(function(c){ return c ? '<td style="' + (d.val === 'progress' ? slHeat(c.v) : c.bad ? 'background:#FBE8E8' : '') + '"><b>' + esc(c.t) + '</b>' + (c.sub ? '<small>' + esc(c.sub) + '</small>' : '') + '</td>' : '<td class="na">·</td>'; }).join('') + '<td class="tot" style="' + (d.val === 'progress' && r.tot ? slHeat(r.tot.v) : '') + '"><b>' + esc(r.tot ? r.tot.t : '—') + '</b></td></tr>'; }).join('') +
      (pi === rows.length - 1 ? '<tr class="sl-sum"><th>' + T('Total', '合计') + '</th>' + d.total.cells.map(function(c){ return '<td style="' + (d.val === 'progress' && c ? slHeat(c.v) : '') + '"><b>' + esc(c ? c.t : '—') + '</b></td>'; }).join('') + '<td class="tot"><b>' + esc(d.total.all ? d.total.all.t : '—') + '</b></td></tr>' : '') + '</tbody></table>' +
      (d.val === 'progress' ? '<p class="sl-note">' + T('Progress = completed ÷ planned quantity where quantities exist, otherwise average item progress.', '有工程量时进度 = 完成量 ÷ 计划量，否则为平均完成率。') + '</p>' : ''); });
  },
  lookahead:function(d, s, box){
    var sl0 = s;
    if(!d.rows.length) return [slEmpty('Nothing planned in this window.', '此期间没有计划工作。')];
    var days = d.to - d.from + 1, W = Math.max(200, Math.min(640, ((box && box.w) || 1184) - 544)), px = W / days;
    var head = '<div class="sl-gh">'; for(var w = 0; w < days; w += 7) head += '<span style="left:' + (w * px) + 'px;width:' + (7 * px) + 'px">' + esc(fmtD(d.from + w)) + '</span>'; head += '<i class="sl-today" style="left:' + ((d.asOf - d.from) * px) + 'px"></i></div>';
    return chunk(d.rows, room(s, 12)).map(function(part){ return '<table class="sl-t sl-la"><thead><tr>' + slTh(sl0, 'no', T('No.', '编号'), 'width:96px') + '<th>' + T('Item', '事项') + '</th>' + slTh(sl0, 'blk', T('Block', '区域'), 'width:80px') + '<th style="width:' + W + 'px;padding:0">' + head + '</th></tr></thead><tbody>' +
      part.map(function(r){ var s = Math.max(r.s, d.from), f = Math.min(r.f, d.to), l = (s - d.from) * px, wd = Math.max(px * 0.8, (f - s + 1) * px), late = r.f < d.from;
        return '<tr data-hk="r:' + esc(r.id) + '" data-hl="' + esc(r.no + ' ' + (r.t.en || r.t.zh)) + '"' + (r.od ? ' class="sl-od"' : '') + '>' + slTd(sl0, 'no', '<td class="n">' + esc(r.no) + '</td>') + '<td><span class="sl-reg c-' + esc(r.reg.color) + '"></span>' + bil1(r.t) + '</td>' + slTd(sl0, 'blk', '<td>' + (r.blocks ? slBlk(r.blocks) : '') + '</td>') + '<td class="sl-gc" style="width:' + W + 'px"><i class="sl-today" style="left:' + ((d.asOf - d.from) * px) + 'px"></i>' +
          (late ? '<span class="sl-late">' + T('overdue since ', '逾期自 ') + esc(fmtD(r.f)) + '</span>' : r.ms ? '<i class="sl-ms" style="left:' + (l + wd / 2 - 7) + 'px"></i>' : '<span class="sl-gb' + (r.od ? ' sl-od' : '') + '" style="left:' + l + 'px;width:' + wd + 'px"><i style="width:' + (r.pct || 0) + '%"></i></span>' + (r.pct != null ? (l + wd + 44 > W ? '<span class="sl-gp sl-in" style="right:' + (W - l - wd + 4) + 'px">' + r.pct + '%</span>' : '<span class="sl-gp" style="left:' + (l + wd + 4) + 'px">' + r.pct + '%</span>') : '')) + '</td></tr>'; }).join('') + '</tbody></table>'; });
  },
  table:function(d, s){
    if(d.err) return [slEmpty('Choose a register.', '请选择台账。')];
    if(!d.rows.length) return [slEmpty('No items match this slide’s filter.', '没有符合此页筛选条件的记录。')];
    var nc = d.cols.length, per = room(s, d.per || 10), pages = [], cur = [], g = null, open = slOpen(s);
    /* v3.4.6: sub-items show only under an opened item (▸ on the slide; Expand all / Collapse all in its settings) */
    var byId = {}; d.rows.forEach(function(r){ if(r.id && !r.h) byId[r.id] = r; });
    function shown(r){ var p = r.pid, gd = 0; while(p && gd++ < 10){ if(!open(p)) return false; p = byId[p] ? byId[p].pid : null; } return true; }
    var vis = d.rows.filter(shown);
    function cell(r){ return r.c.map(function(c){
      if(c.t){ var tg = r.kn ? '<span class="sl-tg" data-tg="' + esc(r.id) + '" data-o="' + (open(r.id) ? 1 : 0) + '" role="button" aria-label="' + esc(T('Sub-items', '子项')) + '">' + (open(r.id) ? '▾' : '▸') + '</span>' : '';
        return '<td class="sl-tt"' + (r.dep ? ' style="padding-left:' + (10 + r.dep * 18) + 'px"' : '') + '>' + (r.dep && !r.kn ? '<span class="sl-tk">└</span>' : '') + tg + bil(c.t) + (r.kn ? ' <span class="sl-kc">' + bil({en:r.kn + (r.kn === 1 ? ' sub-item' : ' sub-items') + (r.kc ? ' · ' + r.kd + '/' + r.kc + ' done' : ''), zh:r.kn + ' 个子项' + (r.kc ? ' · 完成 ' + r.kd + '/' + r.kc : '')}) + '</span>' : '') + '</td>'; }
      if(c.s) return '<td>' + slChip(c.s) + '</td>'; if(c.p !== undefined) return '<td>' + (c.p == null ? '—' : slBar(c.p) + ' <span class="n">' + c.p + '%</span>') + '</td>'; if(c.b) return '<td>' + slBlk(c.b) + '</td>';
      return '<td' + (c.m ? ' class="n"' : '') + '>' + esc(c.v || '—') + '</td>'; }).join(''); }
    function stc(st){ return (st || []).map(function(x){ return '<span class="sl-tsc">' + slChip(x) + '<b>' + x.n + '</b></span>'; }).join(''); }
    function grow(x, cont){ return '<tr class="sl-grp"' + (cont ? '' : ' data-hk="g:' + esc(x.k) + '" data-hl="' + esc(x.en) + '"') + '><td colspan="' + nc + '"><b>' + bil(x) + '</b>' + (cont ? ' <span class="sl-gc">' + bil({en:'(continued)', zh:'（续）'}) + '</span>' : ' <span class="sl-gn">' + x.n + '</span>' + stc(x.st)) + '</td></tr>'; }
    function cap(){ return per - (d.sum && !pages.length ? 1 : 0); }
    vis.forEach(function(r){
      if(r.g){ if(cur.length && cur.length >= cap() - 1){ pages.push(cur); cur = []; } g = r; cur.push(grow(r)); return; }
      /* an opened item never sits alone at the foot of a page — it moves over with its first sub-item */
      if(cur.length >= cap() || (r.kn && !r.h && open(r.id) && cur.length >= cap() - 1 && cur.length > 2)){ pages.push(cur); cur = []; if(g) cur.push(grow(g, true)); }
      if(r.h){ cur.push('<tr class="sl-kgrp"><td colspan="' + nc + '" style="padding-left:' + (10 + (r.lv || 1) * 18) + 'px">' + bil(r) + ' <span class="sl-gn">' + r.n + '</span></td></tr>'); return; }
      cur.push('<tr data-hk="r:' + esc(r.id) + '" data-hl="' + esc(r.hl || '') + '"' + (r.od ? ' class="sl-od"' : '') + '>' + cell(r) + '</tr>'); });
    if(cur.length) pages.push(cur);
    var head = '<thead><tr>' + d.cols.map(function(c){ return '<th data-hk="c:' + esc(c.key) + '" data-hl="' + esc(c.en) + '">' + bil(c) + '</th>'; }).join('') + '</tr></thead>';
    var sum = d.sum ? '<div class="sl-tsum"><span class="sl-tsn"><b>' + d.sum.n + '</b> ' + bil({en:d.sum.n === 1 ? 'item' : 'items', zh:'项'}) + '</span>' + stc(d.sum.st) + (d.sum.od ? '<span class="sl-tso">' + bil({en:d.sum.od + ' overdue', zh:'逾期 ' + d.sum.od}) + '</span>' : '') + '</div>' : '';
    return pages.map(function(part, i){ return (i === 0 ? sum : '') + '<table class="sl-t' + (d.dense ? ' sl-dense' : '') + '">' + head + '<tbody>' + part.join('') + '</tbody></table>'; });
  },
  breakdown:function(d, s){
    if(d.err) return [slEmpty('Choose a register with a status field.', '请选择有状态字段的台账。')];
    var max = Math.max.apply(null, d.groups.map(function(g){ return g.n; }).concat([1]));
    return chunk(d.groups, room(s, 10)).map(function(part){ return '<div class="sl-bd">' + part.map(function(g){ return '<div class="sl-bdr" data-hk="g:' + esc(g.label) + '" data-hl="' + esc(g.label) + '"><span class="sl-bdl">' + esc(g.label) + '</span><span class="sl-bdb" style="width:' + Math.max(4, g.n / max * 100) + '%">' + g.segs.map(function(n, i){ return n ? '<i class="cb-' + esc(d.legend[i].color) + '" style="flex:' + n + '" title="' + n + '">' + (n / g.n > 0.08 ? n : '') + '</i>' : ''; }).join('') + '</span><span class="sl-bdn"><b>' + g.done + '</b> / ' + g.n + '</span></div>'; }).join('') + '</div><div class="sl-legend">' + d.legend.map(function(l){ return '<span><i class="cb-' + esc(l.color) + '"></i>' + bil1(l) + '</span>'; }).join('') + '</div>'; });
  },
  punch:function(d, s){
    if(d.err) return [slEmpty('Choose the punch-list register.', '请选择尾项台账。')];
    var tl = [['open', T('Open items', '未关闭'), d.open, d.open ? ' bad' : '', T('of ' + d.total + ' raised', '共 ' + d.total + ' 项')], ['od', T('Past due date', '超期未关闭'), d.od, d.od ? ' bad' : '']].concat(d.closedWk != null ? [['wk', T('Closed in last 7 days', '近 7 天关闭'), d.closedWk, ' good']] : []).filter(function(t){ return !slHid(s, 't:' + t[0]); });
    var tiles = tl.length ? '<div class="sl-tiles s' + Math.max(tl.length, 2) + '">' + tl.map(function(t){ return '<div class="sl-tile' + t[3] + '" data-hk="t:' + t[0] + '" data-hl="' + esc(t[1]) + '"><span>' + esc(t[1]) + '</span><b>' + t[2] + '</b>' + (t[4] ? '<small>' + esc(t[4]) + '</small>' : '') + '</div>'; }).join('') + '</div>' : '';
    var grid = d.prios.length && d.blocks.length && !slHid(s, 'b:grid') ? '<table class="sl-t sl-pg" data-hk="b:grid" data-hl="' + esc(T('Priority × block table', '优先级 × 区域表')) + '"><thead><tr><th>' + T('Priority', '优先级') + '</th>' + d.blocks.map(function(b){ return '<th><span class="sl-blk c-' + esc(b.color) + '">' + esc(b.v) + '</span></th>'; }).join('') + '<th>' + T('Total', '合计') + '</th></tr></thead><tbody>' + d.prios.map(function(p, i){ var row = d.grid[i] || [], tot = row.reduce(function(s, x){ return s + x; }, 0); return '<tr><th>' + slChip(p) + '</th>' + row.map(function(n){ return '<td class="n' + (n ? ' hit' : '') + '">' + (n || '·') + '</td>'; }).join('') + '<td class="n"><b>' + tot + '</b></td></tr>'; }).join('') + '</tbody></table>' : '';
    var topRows = d.top.slice(0, room(s, 7)), top = topRows.length ? '<table class="sl-t sl-pt"><thead><tr>' + slTh(s, 'prio', T('Priority', '优先级')).replace('>' + T('Priority', '优先级') + '<', '><') + '<th>' + T('Item', '问题') + '</th>' + slTh(s, 'loc', T('Location', '位置')) + slTh(s, 'due', T('Due', '期限')) + '</tr></thead><tbody>' + topRows.map(function(r){ return '<tr data-hk="r:' + esc(r.id) + '" data-hl="' + esc(r.no) + '"' + (r.od ? ' class="sl-od"' : '') + '>' + slTd(s, 'prio', '<td>' + (r.prio ? slSt(r.prio.color, r.prio.v) : '') + '</td>') + '<td><span class="n">' + esc(r.no) + '</span> ' + bil1(r.t) + '</td>' + slTd(s, 'loc', '<td>' + slBlk(r.b) + ' ' + esc(r.loc) + '</td>') + slTd(s, 'due', '<td class="n">' + esc(r.due ? fmtD(d2n(r.due)) : '') + '</td>') + '</tr>'; }).join('') + '</tbody></table>' : '';
    return [tiles + (grid && top ? '<div class="sl-2c"><div>' + grid + '</div><div>' + top + '</div></div>' : grid || top)];
  },
  photos:function(d){
    if(!d.photos.length) return [slEmpty('No photos for this slide yet. Add photos to records, or pick them in the slide settings.', '此页还没有照片。请在记录中上传照片，或在右侧设置中挑选。')];
    var per = d.layout === '3x2' ? 6 : d.layout === '1' ? 1 : 4, s0 = arguments[1];
    var parts = [['no', T('Number', '编号')], ['t', T('Title', '标题')], ['b', T('Block', '区域')], ['date', T('Date', '日期')]].filter(function(x){ return !slHid(s0, x[0]); });
    var cap = parts.length ? function(p){ return parts.map(function(x){ var k = x[0], hk = ' data-hk="c:' + k + '" data-hl="' + esc(x[1] + ' (' + T('all photos', '所有照片') + ')') + '"';
      return k === 'no' ? '<b' + hk + '>' + esc(p.no) + '</b> ' : k === 't' ? '<b class="sl-pt1"' + hk + '>' + bil1(p.t) + '</b> ' : k === 'b' ? '<b class="sl-pb"' + hk + '>' + slBlk(p.b) + '</b>' : '<span' + hk + '>' + esc(p.date) + '</span>'; }).join(''); } : null;
    return chunk(d.photos, per).map(function(part){ return '<div class="sl-ph l' + esc(d.layout) + '">' + part.map(function(p){ var u = p.src || (p.path && STORE && STORE.fileUrl(p.path)) || ''; return '<figure data-hk="p:' + esc(p.path || '') + '" data-hl="' + esc(p.no + ' ' + (p.name || '')) + '">' + (u ? '<img src="' + esc(u) + '" alt="">' : '<div class="sl-noimg"></div>') + (cap ? '<figcaption>' + cap(p) + '</figcaption>' : '') + '</figure>'; }).join('') + '</div>'; });
  },
  actions:function(d, s){
    if(d.err) return [slEmpty('Choose the meetings register.', '请选择会议台账。')];
    if(!d.meeting) return [slEmpty('No meeting with action items before this date.', '此日期前没有带待办事项的会议。')];
    var head = '<p class="sl-sub">' + T('From ', '来自 ') + esc(d.meeting.no) + ' · ' + bil1(d.meeting.t) + ' · ' + esc(d.meeting.date) + '</p>';
    if(!d.rows.length) return [head + slEmpty('No open action items.', '没有未完成的待办事项。')];
    return chunk(d.rows, room(s, 11)).map(function(part){ return head + '<table class="sl-t"><thead><tr>' + slTh(s, 'n', '#', 'width:40px') + '<th>' + T('Action', '事项') + '</th>' + slTh(s, 'who', T('Owner', '负责人'), 'width:220px') + slTh(s, 'due', T('Due', '期限'), 'width:130px') + slTh(s, 'st', T('Status', '状态'), 'width:110px') + '</tr></thead><tbody>' + part.map(function(r, i){ return '<tr data-hk="a:' + esc(r.id || '') + '" data-hl="' + esc(String(r.a).slice(0, 40)) + '"' + (r.od ? ' class="sl-od"' : '') + '>' + slTd(s, 'n', '<td class="n">' + (d.rows.indexOf(r) + 1) + '</td>') + '<td>' + esc(r.a) + '</td>' + slTd(s, 'who', '<td>' + esc(r.who) + '</td>') + slTd(s, 'due', '<td class="n">' + esc(r.due) + '</td>') + slTd(s, 'st', '<td>' + (r.done ? slSt('green', T('Done', '完成')) : r.od ? slSt('red', T('Overdue', '逾期')) : slSt('blue', T('Open', '进行中'))) + '</td>') + '</tr>'; }).join('') + '</tbody></table>'; });
  },
  text:function(d){
    return ['<div class="sl-txt' + (d.body2 ? ' two' : '') + '"><div data-ed="cfg.body" data-raw="1" data-ph="' + esc(T('Click to type the points — one per line', '点击输入要点，每行一条')) + '">' + bulletsHtml(d.body) + '</div>' + (d.body2 ? '<div data-ed="cfg.body2" data-raw="1">' + bulletsHtml(d.body2) + '</div>' : '') + '</div>'];
  }
};

/* ---------------- deck → pages ---------------- */
/* slide data is cached until register data changes (REC_VER); presentation edits alone keep the cache */
var SD_CACHE = {ver:-1, m:null};
function sdCached(type, c, ctx){
  if(type === 'cover') return SLIDE_DATA.cover(c, ctx);   // depends on the deck itself (title, date, presenter)
  if(SD_CACHE.ver !== REC_VER || !SD_CACHE.m) SD_CACHE = {ver:REC_VER, m:new Map()};
  var k = type + '|' + ctx.lang + '|' + ctx.owner + '|' + ctx.asOf + '|' + JSON.stringify(ctx.focus || null) + '|' + JSON.stringify(c), v = SD_CACHE.m.get(k);
  if(v === undefined){ LK_DECK++; try{ v = SLIDE_DATA[type](c, ctx); } finally { LK_DECK--; } if(v && typeof v === 'object' && ownerNone(c, ctx)) v._on = 1; if(!(v && v.loading)) SD_CACHE.m.set(k, v); }
  return v;
}
function slideData(deck, s, ctx){ var snap = deck.d.status === 'issued' && deck.d.snap && deck.d.snap[s.id]; if(snap) return snap; try{ return sdCached(s.type, s.cfg || {}, ctx); }catch(e){ console.error(e); return {err:'x'}; } }
/* a data block placed on a slide like any other element: its data is keyed slideId#elementId (frozen on issue, carried to the Owner) */
function elKey(s, e){ return s.id + '#' + e.id; }
function elData(deck, s, e, ctx){ var snap = deck.d.status === 'issued' && deck.d.snap && deck.d.snap[elKey(s, e)]; if(snap) return snap; try{ return sdCached(e.type, e.cfg || {}, ctx); }catch(err){ console.error(err); return {err:'x'}; } }
function isDataEl(e){ return !!(e && e.k === 'data' && SLIDE_DATA[e.type] && SLIDE_RENDER[e.type]); }
function slideTitle(s){ return s.title || {en:'', zh:''}; }
/* text size: auto fits the content to its box (scaled between 66 % and 120 %); L / M / S are fixed */
var SL_SZ = {L:1.15, M:1, S:0.86};
function fitWrap(inner, size){ var k = SL_SZ[size]; return k ? '<div class="sl-fit" data-k="' + k + '" style="width:' + (100 / k) + '%;height:' + (100 / k) + '%;transform:scale(' + k + ')">' + inner + '</div>' : '<div class="sl-fit" data-fit="auto" data-k="1">' + inner + '</div>'; }
function cleanBox(b){ if(!b || typeof b !== 'object') return null; var o = {x:Math.round(n0(b.x, 52)), y:Math.round(n0(b.y, 150)), w:Math.round(clamp(n0(b.w, 600), 60, 1280)), h:Math.round(clamp(n0(b.h, 300), 40, 720))}; return o; }
var SHEET_BODY = {x:52, y:150, w:1176, h:470};
function bodyBox(s, th){ var b = cleanBox(s.box); if(b) return {w:b.w, h:b.h}; if(th.style === 'classic') return {w:1184, h:560}; var ag = th.agenda ? 30 : 0; return {w:1176, h:(s.cfg && s.cfg.msg ? 466 : 500) - ag}; }
function bodyWrap(s, inner, cls){ var b = cleanBox(s.box), c = s.cfg || {};
  return '<div class="sl-b' + (b ? ' abs' : '') + (cls ? ' ' + cls : '') + '" data-blk="main"' + (b ? ' style="left:' + b.x + 'px;top:' + b.y + 'px;width:' + b.w + 'px;height:' + b.h + 'px"' : '') + '>' + fitWrap(inner, c.size) + '</div>'; }
function fmtLong(iso){ var n = d2n(iso); if(n == null) return iso || ''; if(S.lang === 'zh') return +iso.slice(0, 4) + '年' + (+iso.slice(5, 7)) + '月' + (+iso.slice(8, 10)) + '日'; return fmtD(n) + ' ' + iso.slice(0, 4); }
function titleBlock(th, hdr, n, total){
  function cell(lab, v, cls){ return '<div class="' + (cls || '') + '"><small>' + esc(lab) + '</small><b>' + esc(v) + '</b></div>'; }
  var cells = [];
  if(th.logos){ var a = logoUrl(th.logoL), b = logoUrl(th.logoR); cells.push('<div class="sl-tbl">' + (a ? '<img src="' + esc(a) + '" alt="">' : '') + (b ? '<img src="' + esc(b) + '" alt="">' : '') + '</div>'); }
  cells.push(cell(T('Project', '项目'), hdr.proj, 'w3'));
  if(th.foot === 'custom') cells.push(cell(T('Note', '说明'), th.footText || '', 'w3'));
  else if(th.foot !== 'none' && th.foot !== 'project') cells.push(cell(T('Presentation', '文稿'), hdr.title + (hdr.no ? ' · ' + hdr.no : ''), 'w3'));
  cells.push(cell(T('Data as of', '数据日期'), fmtLong(hdr.date), 'w2'));
  cells.push(th.conf ? cell(T('Marking', '密级'), th.conf, 'w2 cf') : cell(T('Audience', '对象'), hdr.aud === 'internal' ? T1('Internal', '内部') : T1('Owner', '业主'), 'w2'));
  cells.push(cell(T('Page', '页'), n + ' / ' + total, 'w1'));
  return '<div class="sl-tb">' + cells.join('') + '</div>';
}
function agendaHtml(hdr, cur){ if(!hdr.secs || !hdr.secs.length) return '<div class="sl-ag empty"></div>'; return '<div class="sl-ag">' + hdr.secs.map(function(x, i){ return '<span' + (i === cur ? ' class="on"' : '') + '>' + esc(T1(x.t.en, x.t.zh)) + '</span>'; }).join('') + '</div>'; }
function wrapPage(deck, s, body, pi, pn, n, total, hdr, x){
  x = x || {}; var th = hdr.theme || themeOf(deck), st = ' style="' + themeVars(th) + '"', els = elsHtml(s, x.edata), c = s.cfg || {};
  var side = c.side ? '<div class="sl-side' + (String(c.side).split(/\n/).filter(function(q){ return q.trim(); }).length > 4 ? ' two' : '') + '" data-ed="cfg.side" data-raw="1">' + bulletsHtml(c.side) + '</div>' : '';
  if(th.style === 'classic'){
    var foot = footHtml(th, hdr, n, total);
    if(s.type === 'cover' || s.type === 'section') return '<div class="sl st-classic sl-' + s.type + '"' + st + '>' + (s.type === 'cover' ? logosHtml(th, 'cv') : '') + body + '<div class="sl-f2"><span>' + esc(hdr.proj) + '</span><span>' + n + ' / ' + total + '</span></div>' + els + '</div>';
    var msg = c.msg ? '<div class="sl-msg" data-ed="cfg.msg">' + esc(c.msg) + '</div>' : '';
    if(s.type === 'blank' && c.noHead) return '<div class="sl st-classic sl-blank"' + st + '>' + bodyWrap(s, '', 'nohead') + foot + els + '</div>';
    return '<div class="sl st-classic"' + st + '><div class="sl-band"><i></i><b></b></div><div class="sl-h"><h1>' + edTitle(slideTitle(s)) + (pn > 1 ? '<span class="sl-pgn">' + (pi + 1) + ' / ' + pn + '</span>' : '') + '</h1>' + (th.logos ? logosHtml(th, 'h') : '<div class="sl-proj">' + esc(hdr.proj) + '</div>') + '</div>' + bodyWrap(s, msg + body + side) + foot + els + '</div>';
  }
  var ag = th.agenda ? agendaHtml(hdr, x.sec) : '', cls = 'sl st-sheet' + (ag ? ' has-ag' : '');
  if(s.type === 'cover') return '<div class="' + cls + ' sl-cover"' + st + '><i class="sl-frame"></i>' + logosHtml(th, 'cv') + body + els + '</div>';
  var tb = titleBlock(th, hdr, n, total);
  if(s.type === 'section') return '<div class="' + cls + ' sl-section"' + st + '><i class="sl-frame"></i>' + ag + body + tb + els + '</div>';
  if(s.type === 'blank' && c.noHead) return '<div class="' + cls + ' sl-blank"' + st + '><i class="sl-frame"></i>' + ag + bodyWrap(s, '', 'nohead') + tb + els + '</div>';
  var head = '<div class="sl-h"><h1>' + edTitle(slideTitle(s)) + (pn > 1 ? '<span class="sl-pgn">' + (pi + 1) + ' / ' + pn + '</span>' : '') + '</h1>' + (c.msg ? '<p class="sl-hs" data-ed="cfg.msg">' + esc(c.msg) + '</p>' : '') + '</div>';
  return '<div class="' + cls + '"' + st + '><i class="sl-frame"></i>' + ag + head + bodyWrap(s, body + side) + tb + els + '</div>';
}
function deckBuild(deck, opts){
  opts = opts || {};
  var ctx = dctx(deck), outer = DK_CACHE, oldSt = DK_STYLE; DK_CACHE = outer || {}; if(opts.focus) ctx.focus = opts.focus;
  try{ return withLang(ctx.lang, function(){
    var pc = cfg(), th = themeOf(deck); DK_STYLE = th.style;
    var hdr = {theme:th, proj:S.lang === 'zh' ? (pc.projectZh || pc.projectEn) : pc.projectEn, title:S.lang === 'zh' ? (deck.d.titleZh || deck.d.title || '') : (deck.d.title || deck.d.titleZh || ''), no:deck.d.no || '', date:deck.d.date || '', aud:deck.d.aud || 'owner', secs:[]};
    (deck.d.slides || []).forEach(function(s){ if(s.type === 'section' && !s.hidden && SLIDES[s.type]) hdr.secs.push({id:s.id, t:s.title || {en:'', zh:''}}); });
    var out = [], cur = -1;
    (deck.d.slides || []).forEach(function(s){ if(!SLIDES[s.type]) return;
      if(s.type === 'section' && !s.hidden) cur = hdr.secs.map(function(q){ return q.id; }).indexOf(s.id);
      if(s.hidden && !opts.all) return;
      var data = opts.data ? (opts.data[s.id] || {err:'x'}) : slideData(deck, s, ctx), ed = {}, b;
      (s.els || []).forEach(function(e){ if(isDataEl(e)) ed[e.id] = opts.data ? (opts.data[elKey(s, e)] || {err:'x'}) : elData(deck, s, e, ctx); });
      var box = bodyBox(s, th); if(s.type === 'section') box.secNo = s.hidden ? 0 : cur + 1;
      try{ b = slRender(s.type, data, s, box); }catch(e){ console.error(e); b = [slEmpty('This slide could not be drawn.', '此页无法显示。')]; }
      out.push({s:s, data:data, edata:ed, sec:cur, bodies:b.length ? b : [slEmpty('Empty', '空')]}); });
    var total = 0, n = 0; out.forEach(function(x){ if(!x.s.hidden) total += x.bodies.length; });
    out.forEach(function(x){ x.first = x.s.hidden ? 0 : n + 1; x.pages = x.bodies.map(function(b, i){ return wrapPage(deck, x.s, b, i, x.bodies.length, x.s.hidden ? '–' : ++n, total, hdr, x); }); });
    out.total = total; out.theme = th;
    return out;
  }); } finally { DK_CACHE = outer; DK_STYLE = oldSt; }
}
function deckPages(deck, opts){ var out = []; deckBuild(deck, opts).forEach(function(x){ if(x.s.hidden) return; x.pages.forEach(function(h){ out.push({sid:x.s.id, html:h}); }); }); return out; }
/* v3.4: while slide data is worked out, lookups leave out "Only me" items (slides are shared and can be frozen) */
var LK_DECK = 0;
function deckData(deck){ var ctx = dctx(deck), o = {}, outer = DK_CACHE; DK_CACHE = outer || {}; LK_DECK++; try{ withLang(ctx.lang, function(){ (deck.d.slides || []).forEach(function(s){ if(!SLIDES[s.type]) return; try{ o[s.id] = SLIDE_DATA[s.type](s.cfg || {}, ctx); }catch(e){ console.error(e); o[s.id] = {err:'x'}; }
  (s.els || []).forEach(function(e){ if(!isDataEl(e)) return; try{ o[elKey(s, e)] = SLIDE_DATA[e.type](e.cfg || {}, ctx); }catch(er){ console.error(er); o[elKey(s, e)] = {err:'x'}; } }); }); }); } finally { DK_CACHE = outer; LK_DECK--; } return o; }

/* ---------------- fit: scale each content box so it fills its space without overflowing ----------------
   Runs wherever slides are put on screen (editor, thumbnails, present mode, Owner view, PDF window, PowerPoint export). */
var SL_FIT = {};
function slHash(t){ var h = 2166136261; for(var i = 0; i < t.length; i++){ h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + '.' + t.length; }
function slFit1(el){
  var box = el.parentElement; if(!box) return; var W = box.clientWidth, H = box.clientHeight; if(!W || !H) return;
  function set(k){ el.style.width = (W / k) + 'px'; el.style.height = (H / k) + 'px'; el.style.transform = 'scale(' + k + ')'; el.setAttribute('data-k', k); }
  var key = slHash(el.innerHTML) + ':' + W + 'x' + H, k = SL_FIT[key];
  if(k){ set(k); return; }
  var ks = [1.2, 1.1, 1, 0.92, 0.85, 0.78, 0.72, 0.66]; k = ks[ks.length - 1];
  for(var i = 0; i < ks.length; i++){ set(ks[i]); if(el.scrollHeight <= el.clientHeight + 2 && el.scrollWidth <= el.clientWidth + 2){ k = ks[i]; break; } }
  set(k); SL_FIT[key] = k;
}
function slFitAll(root){ Array.prototype.forEach.call((root || document).querySelectorAll('.sl-fit[data-fit="auto"]'), slFit1); }
var SL_FONT = (function(){ try{ return new URL('vendor/fonts/', document.baseURI).href; }catch(e){ return 'vendor/fonts/'; } })();

/* ---------------- slide CSS (used on screen, in present mode and in the PDF window) ----------------
   Two looks: st-sheet (drawing sheet: frame, title block, action title) and st-classic (coloured band). Content styles are shared. */
var SLIDE_CSS = [
'@font-face{font-family:SlPlex;src:url(' + SL_FONT + 'ibm-plex-sans-latin-400-normal.woff2) format("woff2");font-weight:400;font-display:swap}',
'@font-face{font-family:SlPlex;src:url(' + SL_FONT + 'ibm-plex-sans-latin-600-normal.woff2) format("woff2");font-weight:500 600;font-display:swap}',
'@font-face{font-family:SlPlex;src:url(' + SL_FONT + 'ibm-plex-sans-latin-700-normal.woff2) format("woff2");font-weight:700 800;font-display:swap}',
'.sl{--sl-p:#14365E;--sl-p2:#1D4E89;--sl-p3:#0E2A4C;--sl-acc:#E8930C;--sl-ink:#17202B;--sl-mut:#4A5561;--sl-line:#CDD2D8;--sl-soft:#F2F4F6;width:1280px;height:720px;background:#fff;color:var(--sl-ink);position:relative;overflow:hidden;display:flex;flex-direction:column;text-align:left;white-space:normal;letter-spacing:normal;font:18px/1.4 SlPlex,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif;font-variant-numeric:tabular-nums;-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}',
'.sl *{box-sizing:border-box}',
'.sl-zh{display:block;font-size:.78em;color:#5B6570;font-weight:400}',
'.sl-b{flex:1;min-height:0;position:relative;overflow:hidden}.sl-b.abs{position:absolute;flex:none;margin:0!important}',
'.sl-fit{position:absolute;left:0;top:0;width:100%;height:100%;display:flex;flex-direction:column;gap:16px;transform-origin:0 0;overflow:hidden}',
/* drawing sheet */
'.st-sheet{padding:0 0 96px}',
'.sl-frame{position:absolute;inset:18px;border:1.5px solid var(--sl-ink);pointer-events:none;z-index:3}',
'.sl-ag{position:absolute;left:19px;right:19px;top:19px;height:30px;display:flex;border-bottom:1px solid var(--sl-line);font-size:13px;z-index:1}',
'.sl-ag.empty{border-bottom:0}.sl-ag span{flex:1;display:flex;align-items:center;justify-content:center;color:#7A838D;border-right:1px solid var(--sl-line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 8px}.sl-ag span:last-child{border-right:0}.sl-ag span.on{background:var(--sl-p);color:#fff;font-weight:600}',
'.st-sheet .sl-h{flex:none;padding:40px 52px 0;position:relative;z-index:2}.st-sheet.has-ag .sl-h{padding-top:68px}',
'.st-sheet .sl-h h1{margin:0;font-size:36px;line-height:1.16;font-weight:600;color:var(--sl-p);letter-spacing:-.01em}',
'.st-sheet .sl-h h1 .sl-zh{font-size:22px;font-weight:400;color:#5B6570;margin-top:4px;letter-spacing:0}',
'.st-sheet .sl-pgn{font-size:15px;font-weight:400;color:#7A838D;margin-left:14px;letter-spacing:0}',
'.sl-hs{margin:8px 0 0;font-size:20px;line-height:1.35;color:#47515C;max-width:1100px}',
'.st-sheet .sl-b{margin:24px 52px 0}.st-sheet.sl-blank .sl-b.nohead{margin:40px 52px 0}.st-sheet.has-ag.sl-blank .sl-b.nohead{margin-top:68px}',
'.sl-tb{position:absolute;left:18px;right:18px;bottom:18px;height:58px;border-top:1.5px solid var(--sl-ink);display:flex;z-index:1;background:#fff}',
'.sl-tb>div{flex:2;min-width:0;border-left:1px solid var(--sl-line);padding:7px 14px;display:flex;flex-direction:column;justify-content:center;overflow:hidden}.sl-tb>div:first-child{border-left:0}',
'.sl-tb>.w3{flex:3}.sl-tb>.w1{flex:1}.sl-tb small{font-size:11px;color:#6B7580;white-space:nowrap}.sl-tb b{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.sl-tb>.sl-tbl{flex:none;flex-direction:row;align-items:center;gap:12px;padding:6px 14px}.sl-tbl img{height:38px;max-width:150px;object-fit:contain}',
'.sl-tb .cf b{color:#A1262A;text-transform:uppercase;letter-spacing:.04em}',
'.st-sheet.sl-cover{padding:0}',
'.sl-cvb{position:absolute;left:18px;top:18px;bottom:18px;width:18px;background:var(--sl-p);z-index:1}',
'.sl-cv3{position:absolute;left:96px;right:96px;top:150px;display:flex;flex-direction:column;gap:12px}',
'.sl-cv3-proj{font-size:18px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--sl-p2)}.sl-cv3-proj span{margin-left:14px;letter-spacing:.02em;color:#5B6570;font-weight:400}',
'.sl-cv3 h1{margin:8px 0 0;font-size:60px;line-height:1.08;font-weight:600;color:var(--sl-p);letter-spacing:-.02em}',
'.sl-cv3 h2{margin:0;font-size:32px;font-weight:400;color:#47515C}',
'.sl-cv3-rule{display:block;width:96px;height:6px;background:var(--sl-acc);margin:14px 0 4px}',
'.sl-cv3 .sl-cv-sub{font-size:24px;color:#47515C;margin:0}',
'.sl-tbcv{left:36px;height:84px}.sl-tbcv>div{padding:10px 22px}.sl-tbcv small{font-size:13px}.sl-tbcv b{font-size:20px}',
'.st-sheet .sl-logos.cv{position:absolute;top:44px;right:52px;z-index:2;display:flex;gap:18px}.st-sheet .sl-logos.cv img{height:52px;max-width:200px;object-fit:contain}',
'.st-sheet.sl-section{padding:0 0 96px}',
'.sl-sec3{flex:1;display:flex;align-items:center;gap:48px;padding:0 96px}',
'.sl-secn{font-size:150px;line-height:1;font-weight:600;color:var(--sl-acc);letter-spacing:-.04em;flex:none}',
'.sl-sec3t{border-left:3px solid var(--sl-ink);padding-left:40px;display:flex;flex-direction:column;gap:12px}',
'.sl-sec3 h1{margin:0;font-size:54px;line-height:1.1;font-weight:600;color:var(--sl-p)}.sl-sec3 h1 .sl-zh{font-size:30px;margin-top:6px}.sl-sec3 p{margin:0;font-size:24px;color:#47515C}',
/* classic */
'.sl-band{height:8px;display:flex;flex:none}.sl-band i{flex:7;background:var(--sl-p2)}.sl-band b{flex:3;background:var(--sl-acc)}',
'.st-classic .sl-h{display:flex;justify-content:space-between;align-items:flex-end;padding:22px 48px 12px;border-bottom:1px solid #E3E5E0;flex:none}',
'.st-classic .sl-h h1{margin:0;font-size:32px;font-weight:700;letter-spacing:-.01em;color:var(--sl-p);display:flex;align-items:baseline;gap:14px}',
'.st-classic .sl-h h1 .sl-zh{font-size:22px;font-weight:500;color:#5A6067;margin:0}',
'.st-classic .sl-pgn{font-size:16px;font-weight:500;color:#8A9096}',
'.sl-proj{font-size:14px;color:#5A6067;font-weight:600;letter-spacing:.04em;text-transform:uppercase}',
'.st-classic .sl-b{margin:20px 48px 12px}.st-classic .sl-b.nohead{margin:24px 48px 12px}',
'.sl-f{height:40px;flex:none;display:flex;justify-content:space-between;align-items:center;padding:0 48px;font-size:13px;color:#7A8087;border-top:1px solid #E3E5E0}',
'.sl-f2{position:absolute;left:0;right:0;bottom:0;height:40px;display:flex;justify-content:space-between;align-items:center;padding:0 48px;font-size:13px;color:rgba(255,255,255,.7)}',
'.st-classic.sl-cover{background:var(--sl-p);color:#fff;flex-direction:row}',
'.sl-cv-l{flex:1;padding:120px 72px 60px;display:flex;flex-direction:column;justify-content:center;gap:12px;background:linear-gradient(135deg,var(--sl-p) 0,var(--sl-p2) 100%);position:relative}',
'.sl-cv-bar{position:absolute;left:72px;bottom:120px;width:120px;height:6px;background:var(--sl-acc)}',
'.sl-cv-proj{font-size:20px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#C9D8EC}.sl-cv-proj span{display:block;font-size:16px;letter-spacing:0;color:#9FB6D3}',
'.st-classic.sl-cover h1{font-size:54px;line-height:1.12;margin:6px 0 0;font-weight:700;letter-spacing:-.02em}.st-classic.sl-cover h2{font-size:30px;margin:0;font-weight:500;color:#DCE6F3}',
'.st-classic .sl-cv-sub{font-size:22px;color:#DCE6F3;margin:6px 0 0}',
'.sl-cv-meta{width:380px;flex:none;background:var(--sl-p3);padding:120px 48px 60px;display:flex;flex-direction:column;justify-content:center;gap:22px;font-size:20px}',
'.sl-cv-meta b{display:block;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#9FB6D3;font-weight:600;margin-bottom:2px}',
'.st-classic.sl-section{background:var(--sl-p2);color:#fff}',
'.sl-sec{flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 96px;gap:10px;border-left:16px solid var(--sl-acc)}',
'.sl-sec h1{font-size:56px;margin:0;font-weight:700}.sl-sec h1 .sl-zh{color:#DCE6F3;font-size:32px}.sl-sec p{font-size:24px;color:#DCE6F3;margin:0}',
'.sl-msg{flex:none;font-size:21px;font-weight:600;color:var(--sl-p);background:#FFF6E6;border-left:6px solid var(--sl-acc);padding:9px 16px;line-height:1.35}',
/* shared content */
'.sl-cv-sub:empty,.sl-sec p:empty,.sl-sec3 p:empty{display:none}',
'.sl-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:28px;flex:none}.sl-tiles.s3{grid-template-columns:repeat(3,1fr)}.sl-tiles.s2{grid-template-columns:repeat(2,1fr)}.sl-ph figcaption .sl-pt1{font-weight:400;overflow:hidden;text-overflow:ellipsis;min-width:0}.sl-ph figcaption .sl-pb{font-weight:400}',
'.sl-tile{border-top:2px solid var(--sl-ink);padding:10px 0 0;display:flex;flex-direction:column;gap:4px;min-width:0}',
'.sl-tile span{font-size:15px;color:var(--sl-mut)}.sl-tile b{font-size:44px;line-height:1.05;font-weight:600;letter-spacing:-.01em}.sl-tile small{font-size:14px;color:#6B7580}',
'.sl-tile.bad b{color:#C8372D}.sl-tile.good b{color:#1F6B45}',
'.sl-bar{display:inline-block;vertical-align:middle;width:160px;height:8px;border-radius:4px;background:#E3E6EA;overflow:hidden}.sl-tile .sl-bar{width:100%;margin-top:4px}',
'.sl-bar i{display:block;height:100%;background:#2E9E6A;border-radius:4px}',
'.sl-t{width:100%;border-collapse:collapse;font-size:18px}',
'.sl-t th{text-align:left;font-size:14px;font-weight:600;color:var(--sl-mut);padding:0 12px 9px;border-bottom:1.5px solid var(--sl-ink);vertical-align:bottom}',
'.sl-t th .sl-zh{display:inline;margin-left:4px}',
'.sl-t td{padding:10px 12px;border-bottom:1px solid var(--sl-line);vertical-align:middle}',
'.sl-t tr.sl-od td:first-child{border-left:4px solid #C8372D}.sl-t td.bad{color:#C8372D;font-weight:600}',
'.sl-t .n{white-space:nowrap;font-size:.92em}',
'.sl-t td.sl-tt .sl-zh{display:inline;margin-left:8px;font-size:.85em}',
'.sl-tg{display:inline-block;width:1.3em;margin-right:4px;color:var(--sl-mut);cursor:pointer;user-select:none}.sl-tk{color:var(--sl-mut);margin-right:4px}.sl-kc{display:inline-block;margin-left:8px;padding:0 7px;border-radius:9px;background:#EEF0EC;color:var(--sl-mut);font-size:.78em;white-space:nowrap}',
'.sl-t tr.sl-kgrp td{padding-top:5px;padding-bottom:5px;font-size:.82em;font-weight:600;color:var(--sl-mut);background:#F7F8F5}.sl-kgrp .sl-gn{background:var(--sl-mut)}',
'.sl-t.sl-dense{font-size:15px}.sl-t.sl-dense td{padding:5px 10px}.sl-t.sl-dense th{font-size:12.5px;padding-bottom:6px}',
'.sl-t tr.sl-grp td{background:var(--sl-soft,#F2F4F7);padding-top:7px;padding-bottom:7px;border-bottom:1px solid var(--sl-line)}.sl-t tr.sl-grp b{font-weight:700}.sl-t tr.sl-grp b .sl-zh{display:inline;margin-left:6px;font-weight:500}',
'.sl-t.sl-dense tr.sl-grp td{padding-top:4px;padding-bottom:4px}',
'.sl-gn{display:inline-block;min-width:1.6em;text-align:center;margin:0 10px 0 8px;padding:0 6px;border-radius:9px;background:var(--sl-ink);color:#fff;font-size:.78em;font-weight:600}.sl-gc{color:var(--sl-mut);font-size:.85em}',
'.sl-tsc{display:inline-flex;align-items:center;gap:5px;margin-right:12px;font-size:.85em}.sl-tsc b{font-weight:700}',
'.sl-tsum{display:flex;flex-wrap:wrap;align-items:center;gap:6px 4px;margin:0 0 12px;padding:8px 12px;border:1px solid var(--sl-line);border-radius:4px;font-size:17px}.sl-tsn{margin-right:16px}.sl-tsn b{font-size:1.3em}.sl-tso{color:#C8372D;font-weight:600;font-size:.9em}',
'.sl-kt td{font-size:19px}',
'.sl-mx th,.sl-mx td{text-align:center;border:1px solid var(--sl-line)}.sl-mx thead th{text-align:center;border-bottom:1.5px solid var(--sl-ink)}.sl-mx tbody th{text-align:left;font-size:16px;color:var(--sl-ink);background:#fff;font-weight:600;width:280px;padding:8px 12px}',
'.sl-mx td b{display:block;font-size:20px;font-weight:600}.sl-mx td small{display:block;font-size:12px;color:var(--sl-mut)}.sl-mx td.na{color:#C8CBC5}.sl-mx tr.sl-sum th,.sl-mx tr.sl-sum td{border-top:1.5px solid var(--sl-ink)}',
'.sl-blk{display:inline-block;font-size:13px;line-height:18px;font-weight:600;padding:0 6px;border-radius:3px;border:1px solid #BCC3CA;color:#3D434A;margin-right:3px;white-space:nowrap;background:#fff}',
'.sl-chip{display:inline-flex;align-items:center;gap:8px;font-size:.92em;white-space:nowrap;color:var(--sl-ink)}.sl-chip>i{flex:none;width:10px;height:10px;border-radius:50%;background:#8E949A}',
'.sl-chip.c-blue>i{background:#2F6DB5}.sl-chip.c-green>i{background:#2E9E6A}.sl-chip.c-amber>i{background:#E8930C}.sl-chip.c-red>i{background:#D2453F}.sl-chip.c-violet>i{background:#7564B5}.sl-chip.c-teal>i{background:#2F9A93}.sl-chip.c-pink>i{background:#C25690}',
'.sl-chip.c-red{color:#A1262A;font-weight:600}',
'.sl .sl-chip{background:none;padding:0;border-radius:0;line-height:inherit}.sl .sl-blk{background:#fff}',
'.sl-blk.c-blue{border-color:#3E6FAD;color:#1D4E89}.sl-blk.c-green{border-color:#3C8A5E;color:#1F6B45}.sl-blk.c-amber{border-color:#C9822F;color:#8A3F00}.sl-blk.c-red{border-color:#B8474A;color:#A1262A}.sl-blk.c-violet{border-color:#7564B5;color:#4A3A8C}.sl-blk.c-teal{border-color:#2F9A93;color:#0E6B6B}.sl-blk.c-pink{border-color:#C25690;color:#9B2C68}',
'.cb-grey{background:#8E949A}.cb-blue{background:#3E6FAD}.cb-amber{background:#C9822F}.cb-red{background:#B8474A}.cb-green{background:#3C8A5E}.cb-violet{background:#7564B5}.cb-teal{background:#2F9A93}.cb-pink{background:#C25690}',
'.sl-note{font-size:13px;color:#6B7580;margin:0}.sl-sub{font-size:16px;color:var(--sl-mut);margin:0}',
'.sl-la td{padding:6px 10px;font-size:16px}.sl-gh{position:relative;height:30px}.sl-gh span{position:absolute;top:6px;font-size:12px;color:var(--sl-mut);border-left:1px solid #C8CBC5;padding-left:4px;white-space:nowrap}',
'.sl-gc{position:relative;height:34px;padding:0!important}',
'.sl-gb{position:absolute;top:10px;height:14px;border-radius:2px;background:#2F6DB5;overflow:hidden}.sl-gb i{display:block;height:100%;background:#2E9E6A}.sl-gb.sl-od{background:#D2453F}',
'.sl-gp{position:absolute;top:8px;font-size:12px;color:var(--sl-mut);white-space:nowrap}.sl-gp.sl-in{top:10px;font-size:11px;line-height:14px;color:#fff;font-weight:600;z-index:2}',
'.sl-ms{position:absolute;top:10px;width:14px;height:14px;background:var(--sl-ink);transform:rotate(45deg)}',
'.sl-today{position:absolute;top:0;bottom:0;width:2px;background:var(--sl-acc);z-index:1}.sl-late{position:absolute;left:6px;top:7px;font-size:12px;color:#A1262A;font-weight:600;background:#FDF1F1;padding:0 4px;z-index:2;white-space:nowrap}',
'.sl-reg{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;vertical-align:1px}.sl-reg.c-blue{background:#3E6FAD}.sl-reg.c-green{background:#3C8A5E}.sl-reg.c-amber{background:#C9822F}.sl-reg.c-violet{background:#7564B5}.sl-reg.c-red{background:#B8474A}.sl-reg.c-teal{background:#2F9A93}.sl-reg.c-grey{background:#8E949A}.sl-reg.c-pink{background:#C25690}',
'.sl-bd{display:flex;flex-direction:column;gap:14px}.sl-bdr{display:grid;grid-template-columns:320px 1fr 96px;gap:16px;align-items:center}',
'.sl-bdl{font-size:17px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sl-bdb{display:flex;height:28px;overflow:hidden;background:#E9ECEF}',
'.sl-bdb i{display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:600;font-style:normal}.sl-bdn{font-size:16px;color:var(--sl-mut);text-align:right}.sl-bdn b{color:var(--sl-ink);font-weight:600}',
'.sl-legend{display:flex;gap:20px;font-size:14px;color:var(--sl-mut);flex-wrap:wrap;flex:none}.sl-legend i{display:inline-block;width:14px;height:14px;border-radius:2px;margin-right:6px;vertical-align:-2px}',
'.sl-2c{display:grid;grid-template-columns:440px 1fr;gap:28px;min-height:0}.sl-pg td.hit{color:#C8372D;font-weight:600}.sl-pg td,.sl-pg th{text-align:center}.sl-pg tbody th{text-align:left}.sl-pt td{font-size:16px}',
'.sl-ph{flex:1;display:grid;gap:16px;min-height:0}.sl-ph.l2x2{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}.sl-ph.l3x2{grid-template-columns:repeat(3,1fr);grid-template-rows:1fr 1fr}.sl-ph.l1{grid-template-columns:1fr}',
'.sl-ph figure{margin:0;display:flex;flex-direction:column;min-height:0;overflow:hidden}',
'.sl-ph img,.sl-noimg{flex:1;min-height:0;width:100%;object-fit:cover;background:#E6E8E3}',
'.sl-ph figcaption{padding:6px 0 0;font-size:14px;display:flex;gap:6px;align-items:center;white-space:nowrap;overflow:hidden;border-bottom:1px solid var(--sl-line);padding-bottom:5px}.sl-ph figcaption span{margin-left:auto;color:#6B7580;font-size:13px}',
'.sl-txt{display:grid;gap:48px;font-size:26px;line-height:1.35}.sl-txt.two{grid-template-columns:1fr 1fr}.sl-txt ul{margin:0;padding-left:30px;display:flex;flex-direction:column;gap:16px}.sl-txt li::marker{color:var(--sl-acc)}.sl-txt li.sub{margin-left:32px;font-size:21px;color:#3D434A;list-style:circle}',
'.sl-side{flex:none;max-height:124px;overflow:hidden;font-size:16px;color:#2E3338;background:var(--sl-soft);border-left:4px solid var(--sl-acc);padding:9px 16px 9px 14px}.sl-side ul{margin:0;padding-left:20px}.sl-side li{margin:2px 0}.sl-side li.sub{margin-left:20px;list-style:circle}.sl-side.two ul{columns:2;column-gap:36px}',
'.sl-empty{flex:1;display:flex;align-items:center;justify-content:center;color:#8A9096;font-size:20px;border:2px dashed #DADDD6;border-radius:4px;text-align:center;padding:40px}'
].join('\n');
(function(){ var st = document.createElement('style'); st.id = 'slide-css'; st.textContent = SLIDE_CSS; document.head.appendChild(st); })();
