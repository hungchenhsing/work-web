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
function withLang(lang, fn){ var old = S.lang; S.lang = lang || 'en'; try{ return fn(); } finally { S.lang = old; } }
function regLab(reg){ return reg ? {en:reg.d.en || '', zh:reg.d.zh || '', icon:reg.d.icon, color:reg.d.color || 'blue'} : {en:'', zh:''}; }
function bil(o){ if(!o) return ''; if(S.lang === 'zh') return esc(o.zh || o.en || ''); if(S.lang === 'en' || !o.zh || o.zh === o.en) return esc(o.en || o.zh || ''); return esc(o.en || '') + '<span class="sl-zh">' + esc(o.zh) + '</span>'; }
function bil1(o){ return o ? esc(S.lang === 'zh' ? (o.zh || o.en || '') : (o.en || o.zh || '')) : ''; }
function recPair(reg, r){ var ro = rolesOf(reg); return {en:(ro.title && r.d[ro.title]) || '', zh:(ro.title2 && r.d[ro.title2]) || ''}; }
function stPair(reg, r){ var o = statusOpt(reg, r); return o ? {en:o.en, zh:o.zh || '', color:o.color, done:!!o.done} : null; }
var DK_CACHE = null;
function isLeaf(r){ var idx = DK_CACHE ? (DK_CACHE[r.reg] || (DK_CACHE[r.reg] = kidsIndex(r.reg))) : kidsIndex(r.reg); return !idx[r.id]; }
function mxDef(reg, c){ var ro = rolesOf(reg); return {row:(c && c.row) || (reg.d.matrix && reg.d.matrix.row) || ro.tree || ro.status || '', col:(c && c.col) || (reg.d.matrix && reg.d.matrix.col) || ro.block || ''}; }

/* owner mode: only Owner-visible fields, External records (for registers that publish to the Owner), never private registers */
function dctx(deck){ return {deck:deck, owner:(deck.d.aud || 'owner') !== 'internal', asOf:d2n(deck.d.date) != null ? d2n(deck.d.date) : asOfN(), lang:deck.d.lang || 'en'}; }
/* decks are team-visible, so private (Only me) registers never feed a slide — not even an internal deck. */
function regOk(ctx, reg){ return !!reg && reg.d.kind !== 'decks' && !isPrivate(reg); }
function recOk(ctx, reg, r){ if(!ctx.owner) return true; if(isPrivate(reg)) return false; return !reg.d.ownerPublish || !!r.d.ext; }
function fieldOk(ctx, reg, f){ if(!ctx.owner) return true; var ro = rolesOf(reg); return !!f.ext || [ro.title, ro.title2, ro.no].indexOf(f.key) >= 0; }
function defCols(reg){ var ro = rolesOf(reg); return [ro.no, ro.title, ro.block, ro.start, ro.finish, ro.progress, ro.status].filter(function(k, i, a){ return k && fieldOf(reg, k) && a.indexOf(k) === i; }); }
function usable(ctx, ids){ return (ids || []).map(getReg).filter(function(r){ return regOk(ctx, r); }); }

/* ---------------- slide types ---------------- */
var SLIDES = {
  cover:{en:'Cover', zh:'封面', t:['',''], def:function(){ return {sub:'', presenter:''}; }},
  kpi:{en:'Key figures', zh:'关键数据', t:['Progress overview','进度总览'], def:function(){ return {regs:allRegs().filter(function(r){ return !isPrivate(r) && !r.d.meeting && rf(r, 'status'); }).map(function(r){ return r.id; })}; }},
  matrix:{en:'Block progress matrix', zh:'区域进度矩阵', t:['Progress by block','分区施工进度'], def:function(){ return {reg:tplReg('site'), row:'', col:'', val:'progress'}; }},
  lookahead:{en:'Look-ahead', zh:'近期计划', t:['Look-ahead','近期工作计划'], def:function(){ return {regs:[tplReg('site'), tplReg('turnover')].filter(Boolean), weeks:3, overdue:true}; }},
  table:{en:'Register table', zh:'台账表格', t:['Register','台账'], def:function(){ return {reg:tplReg('turnover'), cols:null, filter:{open:true, due:0}, per:10}; }},
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
      return {reg:regLab(reg), n:rs.length, done:dn, od:o, due:d14, pct:pc}; });
    return {items:items, tot:tot, done:done, od:od, due:due, pct: wn ? Math.round(wsum / wn) : null}; },
  matrix:function(c, ctx){ var reg = getReg(c.reg); if(!regOk(ctx, reg)) return {err:'reg'};
    var md = mxDef(reg, c), row = md.row, col = md.col, cf = fieldOf(reg, col), rfd = fieldOf(reg, row);
    if(!cf || !rfd) return {err:'cfg'};
    var list = recsOf(reg.id).filter(function(r){ return recOk(ctx, reg, r) && isLeaf(r); }), cols = optsOf(cf).map(function(o){ return {v:o.v, en:o.en, zh:o.zh || '', color:o.color}; });
    var rows = groupRecs(reg, list, row).map(function(g){ return {label:g.label, color:g.color || '', cells:cols.map(function(cc){ return aggCell(reg, g.items.filter(function(r){ return asArr(r.d[cf.key]).indexOf(cc.v) >= 0; }), c.val); }), tot:aggCell(reg, g.items, c.val)}; });
    return {reg:regLab(reg), rowName:{en:rfd.en, zh:rfd.zh || ''}, cols:cols, rows:rows, val:c.val, total:{cells:cols.map(function(cc){ return aggCell(reg, list.filter(function(r){ return asArr(r.d[cf.key]).indexOf(cc.v) >= 0; }), c.val); }), all:aggCell(reg, list, c.val)}}; },
  lookahead:function(c, ctx){ var A = ctx.asOf, dow = (new Date(A * 864e5).getUTCDay() + 6) % 7, from = A - dow, to = from + (c.weeks || 3) * 7 - 1, rows = [];
    usable(ctx, c.regs).forEach(function(reg){ var bf = rf(reg, 'block'); recsOf(reg.id).forEach(function(r){ if(!recOk(ctx, reg, r) || isDone(reg, r)) return; var p = planOf(reg, r); if(!p) return;
      var inWin = p.s <= to && p.f >= from, late = p.f < from; if(!inWin && !(late && c.overdue)) return;
      var pv = progressOf(reg, r); rows.push({reg:regLab(reg), no:recNo(reg, r), t:recPair(reg, r), s:p.s, f:p.f, pct:pv == null ? null : Math.round(pv), st:stPair(reg, r), od:p.f < A, ms:isMilestone(reg, r) || p.s === p.f, blocks:bf ? asArr(r.d[bf.key]) : null}); }); });
    rows.sort(function(a, b){ return (b.od - a.od) || a.s - b.s; });
    return {from:from, to:to, asOf:A, rows:rows}; },
  table:function(c, ctx){ var reg = getReg(c.reg); if(!regOk(ctx, reg)) return {err:'reg'};
    var f = c.filter || {}, A = ctx.asOf, ro = rolesOf(reg), sf = rf(reg, 'status'), bf = rf(reg, 'block');
    var fx = clone(f.fx || {}); if(sf && f.st && f.st.length) fx[sf.key] = f.st; if(bf && f.blk && f.blk.length) fx[bf.key] = f.blk;
    var mf = {q:f.q || '', fx:fx, from:f.from || '', to:f.to || '', od:false, star:!!f.star, ext:!!f.ext, node:f.node || 'all'};
    var list = recsOf(reg.id).filter(function(r){ if(!recOk(ctx, reg, r) || !matchRec(reg, r, mf)) return false; if(f.open && isDone(reg, r)) return false; var p = planOf(reg, r);
      if(f.od && !(p && p.f < A && !isDone(reg, r))) return false; if(f.due && !(p && p.f <= A + f.due * 7)) return false; return true; });
    var sk = (c.sort && c.sort.k) || ro.no, sd = (c.sort && c.sort.d) || 1;
    list.sort(function(a, b){ var x = sortValue(reg, a, sk), y = sortValue(reg, b, sk); return (x < y ? -1 : x > y ? 1 : 0) * sd; });
    var keys = c.cols && c.cols.length ? c.cols : defCols(reg);
    var fs = keys.map(function(k){ return fieldOf(reg, k); }).filter(function(x){ return x && fieldOk(ctx, reg, x); });
    return {reg:regLab(reg), cols:fs.map(function(x){ return {en:x.en, zh:x.zh || '', type:x.type, key:x.key, title:x.key === ro.title}; }), per:c.per || 12,
      rows:list.map(function(r){ return {od:isOverdue(reg, r), dep:depthOf(r), c:fs.map(function(x){
        if(x.key === ro.title) return {t:recPair(reg, r)};
        if(x.type === 'select' && !x.multi && !x.list){ var o = optOf(x, r.d[x.key]); return o ? {s:{en:o.en, zh:o.zh || '', color:o.color}} : {v:''}; }
        if(x.type === 'percent' || (x.type === 'calc' && x.calc && x.calc.op === 'pct')){ var pv = val(r, x); if(pv == null && x.key === ro.progress) pv = progressOf(reg, r); return {p:pv == null ? null : Math.round(pv)}; }
        if(x.type === 'tree'){ var n = treeNode(x, r.d[x.key]); return {v: n ? treeLabel(n) : ''}; }
        if(x.type === 'select' && x.list === 'blocks') return {b:asArr(r.d[x.key])};
        return {v:textOf(reg, x, r), m:x.type === 'date' || x.type === 'number' || x.key === ro.no}; })}; })}; },
  breakdown:function(c, ctx){ var reg = getReg(c.reg); if(!regOk(ctx, reg)) return {err:'reg'};
    var ro = rolesOf(reg), by = c.by || ro.tree || ro.block, sf = rf(reg, 'status'); if(!fieldOf(reg, by) || !sf) return {err:'cfg'};
    var list = recsOf(reg.id).filter(function(r){ return recOk(ctx, reg, r) && isLeaf(r); }), opts = optsOf(sf);
    return {reg:regLab(reg), by:{en:fieldOf(reg, by).en, zh:fieldOf(reg, by).zh || ''}, legend:opts.map(function(o){ return {en:o.en, zh:o.zh || '', color:o.color}; }),
      groups:groupRecs(reg, list, by).map(function(g){ return {label:g.label, n:g.items.length, done:g.items.filter(function(r){ return isDone(reg, r); }).length, segs:opts.map(function(o){ return g.items.filter(function(r){ return r.d[sf.key] === o.v; }).length; })}; })}; },
  punch:function(c, ctx){ var reg = getReg(c.reg); if(!regOk(ctx, reg)) return {err:'reg'};
    var A = ctx.asOf, pf = fieldOf(reg, 'prio') || dataFields(reg).filter(function(f){ return f.type === 'select' && !f.multi && f.key !== rolesOf(reg).status && !f.list; })[0], bf = rf(reg, 'block');
    var all = recsOf(reg.id).filter(function(r){ return recOk(ctx, reg, r); }), open = all.filter(function(r){ return !isDone(reg, r); });
    var prios = pf ? optsOf(pf).map(function(o){ return {v:o.v, en:o.en, zh:o.zh || '', color:o.color}; }) : [], blocks = bf ? optsOf(bf).map(function(o){ return {v:o.v, color:o.color}; }) : [];
    var closedF = fieldOf(reg, 'closed'), closedWk = closedF ? all.filter(function(r){ var n = d2n(r.d.closed); return n != null && n > A - 7 && n <= A; }).length : null;
    var grid = prios.map(function(p){ return blocks.map(function(b){ return open.filter(function(r){ return r.d[pf.key] === p.v && asArr(r.d[bf.key]).indexOf(b.v) >= 0; }).length; }); });
    var po = {}; prios.forEach(function(p, i){ po[p.v] = i; });
    var top = open.slice().sort(function(a, b){ return ((pf ? po[a.d[pf.key]] : 0) || 0) - ((pf ? po[b.d[pf.key]] : 0) || 0) || (planOf(reg, a) ? planOf(reg, a).f : 1e9) - (planOf(reg, b) ? planOf(reg, b).f : 1e9); }).slice(0, 7);
    var rf2 = dataFields(reg).filter(function(f){ return f.list === 'people'; })[0];
    return {reg:regLab(reg), prios:prios, blocks:blocks, grid:grid, open:open.length, total:all.length, od:open.filter(function(r){ return isOverdue(reg, r); }).length, closedWk:closedWk,
      top:top.map(function(r){ var p = planOf(reg, r), po2 = pf && optOf(pf, r.d[pf.key]); return {no:recNo(reg, r), t:recPair(reg, r), b:bf ? asArr(r.d[bf.key]) : [], loc:r.d.loc || '', due:p ? n2d(p.f) : '', od:isOverdue(reg, r), prio:po2 ? {v:po2.v, color:po2.color} : null, who:rf2 ? textOf(reg, rf2, r) : ''}; })}; },
  photos:function(c, ctx){ var A = ctx.asOf, out = [];
    function push(reg, r, x, f){ var bf = rf(reg, 'block'); out.push({path:x.path, name:x.name || '', no:recNo(reg, r), t:recPair(reg, r), f:{en:f.en, zh:f.zh || ''}, b:bf ? asArr(r.d[bf.key]) : [], date:String(x.at || r.ua || '').slice(0, 10)}); }
    if(c.mode === 'pick'){ (c.picks || []).forEach(function(pk){ var r = getRec(pk.rec), reg = r && getReg(r.reg); if(!r || !regOk(ctx, reg) || !recOk(ctx, reg, r)) return; dataFields(reg).forEach(function(f){ if(f.type !== 'files') return; asArr(r.d[f.key]).forEach(function(x){ if(x.path === pk.path) push(reg, r, x, f); }); }); }); }
    else { var regs = c.regs && c.regs.length ? usable(ctx, c.regs) : allRegs().filter(function(r){ return regOk(ctx, r); });
      regs.forEach(function(reg){ var ffs = dataFields(reg).filter(function(f){ return f.type === 'files'; }); recsOf(reg.id).forEach(function(r){ if(!recOk(ctx, reg, r)) return; ffs.forEach(function(f){ asArr(r.d[f.key]).forEach(function(x){ if(!/^image\//.test(x.type || '')) return; var n = d2n(String(x.at || r.ua || '').slice(0, 10)); if(n == null || n < A - (c.days || 7) || n > A + 1) return; push(reg, r, x, f); }); }); }); });
      out.sort(function(a, b){ return String(b.date).localeCompare(String(a.date)); }); out = out.slice(0, 24); }
    return {photos:out, layout:c.layout || '2x2'}; },
  actions:function(c, ctx){ var reg = getReg(c.reg); if(!regOk(ctx, reg)) return {err:'reg'};
    var sub = dataFields(reg).filter(function(f){ return f.type === 'sub' && (f.cols || []).some(function(x){ return x.type === 'check'; }); })[0]; if(!sub) return {err:'cfg'};
    var ck = sub.cols.filter(function(x){ return x.type === 'check'; })[0].key, dk = (sub.cols.filter(function(x){ return x.type === 'date'; })[0] || {}).key, tk = (sub.cols.filter(function(x){ return x.type === 'text' || x.type === 'long'; })[0] || {}).key, wk = (sub.cols.filter(function(x){ return /who|owner|resp/i.test(x.key); })[0] || {}).key;
    var m = null, ro = rolesOf(reg);
    if(c.meeting && c.meeting !== 'latest') m = getRec(c.meeting);
    if(!m) m = recsOf(reg.id).filter(function(r){ var n = d2n(r.d[ro.start]); return asArr(r.d[sub.key]).length && (n == null || n <= ctx.asOf); }).sort(function(a, b){ return String(b.d[ro.start] || '').localeCompare(String(a.d[ro.start] || '')); })[0];
    if(!m || !recOk(ctx, reg, m)) return {meeting:null, rows:[]};
    var rows = asArr(m.d[sub.key]).filter(function(x){ return !c.open || !x[ck]; }).map(function(x){ var n = d2n(x[dk]); return {a:x[tk] || '', who:x[wk] || '', due:x[dk] || '', done:!!x[ck], od:!x[ck] && n != null && n < ctx.asOf}; });
    return {meeting:{no:recNo(reg, m), t:recPair(reg, m), date:m.d[ro.start] || ''}, rows:rows}; },
  text:function(c){ return {body:c.body || '', body2:c.body2 || ''}; },
  section:function(c){ return {sub:c.sub || ''}; }
};

/* ---------------- render (data → page bodies) ---------------- */
function slBar(p){ p = p == null ? 0 : clamp(Math.round(p), 0, 100); return '<span class="sl-bar"><i style="width:' + p + '%"></i></span>'; }
function slBlk(arr){ arr = arr || []; if(!arr.length) return '<span class="sl-blk">' + (S.lang === 'zh' ? '全场' : 'Site') + '</span>'; if(arr.length > 2) return '<span class="sl-blk">' + esc(arr.join('·')) + '</span>'; return arr.map(function(b){ return '<span class="sl-blk">' + esc(b) + '</span>'; }).join(''); }
function slChip(s){ return s ? '<span class="sl-chip c-' + esc(s.color || 'grey') + '">' + bil1(s) + '</span>' : ''; }
function slHeat(v){ if(v == null) return ''; return 'background:color-mix(in srgb,#2E9E6A ' + Math.round(6 + v * 0.55) + '%,#fff)'; }
function chunk(arr, n){ var out = []; for(var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out.length ? out : [[]]; }
function fmtD(n){ var d = new Date(n * 864e5); return pad(d.getUTCDate()) + ' ' + MON[d.getUTCMonth()]; }
function slEmpty(en, zh){ return '<div class="sl-empty">' + esc(S.lang === 'zh' ? zh : en) + '</div>'; }
var SLIDE_RENDER = {
  cover:function(d){ return ['<div class="sl-cv-l"><div class="sl-cv-proj">' + esc(d.project.en) + (d.project.zh && S.lang !== 'en' ? '<span>' + esc(d.project.zh) + '</span>' : '') + '</div><h1>' + (S.lang === 'zh' ? esc(d.title.zh || d.title.en) : esc(d.title.en || d.title.zh)) + '</h1>' + (S.lang === 'both' && d.title.zh && d.title.en ? '<h2>' + esc(d.title.zh) + '</h2>' : '') + (d.sub ? '<p class="sl-cv-sub">' + esc(d.sub) + '</p>' : '') + '</div>' +
    '<div class="sl-cv-meta"><div><b>' + T('Date', '日期') + '</b>' + esc(d.date ? (S.lang === 'zh' ? +d.date.slice(0, 4) + '年' + (+d.date.slice(5, 7)) + '月' + (+d.date.slice(8, 10)) + '日' : fmtD(d2n(d.date)) + ' ' + d.date.slice(0, 4)) : '') + (d.meeting && d.meeting.time ? ' · ' + esc(d.meeting.time) : '') + '</div>' + (d.meeting && d.meeting.loc ? '<div><b>' + T('Venue', '地点') + '</b>' + esc(d.meeting.loc) + '</div>' : '') + (d.presenter ? '<div><b>' + T('Presented by', '汇报人') + '</b>' + esc(d.presenter) + '</div>' : '') + (d.meeting ? '<div><b>' + T('Meeting', '会议') + '</b>' + esc(d.meeting.no) + '</div>' : '') + '</div>']; },
  section:function(d, s){ return ['<div class="sl-sec"><h1>' + bil(s.title) + '</h1>' + (d.sub ? '<p>' + esc(d.sub) + '</p>' : '') + '</div>']; },
  kpi:function(d){
    if(!d.items.length) return [slEmpty('Choose registers for this slide.', '请为此页选择台账。')];
    var tiles = [[T('Overall progress', '总体进度'), d.pct == null ? '—' : d.pct + '%', d.pct, ''], [T('Items completed', '已完成'), d.done + ' / ' + d.tot, null, ''], [T('Overdue', '逾期'), String(d.od), null, d.od ? 'bad' : ''], [T('Due in next 14 days', '未来 14 天到期'), String(d.due), null, '']];
    return ['<div class="sl-tiles">' + tiles.map(function(t){ return '<div class="sl-tile ' + t[3] + '"><span>' + esc(t[0]) + '</span><b>' + esc(t[1]) + '</b>' + (t[2] != null ? slBar(t[2]) : '') + '</div>'; }).join('') + '</div>' +
      '<table class="sl-t sl-kt"><thead><tr><th>' + T('Register', '台账') + '</th><th>' + T('Items', '数量') + '</th><th>' + T('Completed', '已完成') + '</th><th style="width:300px">' + T('Progress', '进度') + '</th><th>' + T('Overdue', '逾期') + '</th><th>' + T('Due ≤ 14 d', '14 天内到期') + '</th></tr></thead><tbody>' +
      d.items.map(function(x){ return '<tr><td><b>' + bil(x.reg) + '</b></td><td class="n">' + x.n + '</td><td class="n">' + x.done + '</td><td>' + (x.pct != null ? slBar(x.pct) + ' <span class="n">' + x.pct + '%</span>' : '—') + '</td><td class="n' + (x.od ? ' bad' : '') + '">' + x.od + '</td><td class="n">' + x.due + '</td></tr>'; }).join('') + '</tbody></table>'];
  },
  matrix:function(d){
    if(d.err) return [slEmpty('Choose a register with a Block field.', '请选择有区域字段的台账。')];
    var rows = chunk(d.rows, 9);
    return rows.map(function(part, pi){ return '<table class="sl-t sl-mx"><thead><tr><th>' + bil1(d.rowName) + '</th>' + d.cols.map(function(c){ return '<th><span class="sl-blk c-' + esc(c.color) + '">' + esc(c.v) + '</span> ' + bil1(c) + '</th>'; }).join('') + '<th>' + T('Total', '合计') + '</th></tr></thead><tbody>' +
      part.map(function(r){ return '<tr><th>' + esc(r.label) + '</th>' + r.cells.map(function(c){ return c ? '<td style="' + (d.val === 'progress' ? slHeat(c.v) : c.bad ? 'background:#FBE8E8' : '') + '"><b>' + esc(c.t) + '</b>' + (c.sub ? '<small>' + esc(c.sub) + '</small>' : '') + '</td>' : '<td class="na">·</td>'; }).join('') + '<td class="tot" style="' + (d.val === 'progress' && r.tot ? slHeat(r.tot.v) : '') + '"><b>' + esc(r.tot ? r.tot.t : '—') + '</b></td></tr>'; }).join('') +
      (pi === rows.length - 1 ? '<tr class="sl-sum"><th>' + T('Total', '合计') + '</th>' + d.total.cells.map(function(c){ return '<td style="' + (d.val === 'progress' && c ? slHeat(c.v) : '') + '"><b>' + esc(c ? c.t : '—') + '</b></td>'; }).join('') + '<td class="tot"><b>' + esc(d.total.all ? d.total.all.t : '—') + '</b></td></tr>' : '') + '</tbody></table>' +
      (d.val === 'progress' ? '<p class="sl-note">' + T('Progress = completed ÷ planned quantity where quantities exist, otherwise average item progress.', '有工程量时进度 = 完成量 ÷ 计划量，否则为平均完成率。') + '</p>' : ''); });
  },
  lookahead:function(d){
    if(!d.rows.length) return [slEmpty('Nothing planned in this window.', '此期间没有计划工作。')];
    var days = d.to - d.from + 1, W = 640, px = W / days;
    var head = '<div class="sl-gh">'; for(var w = 0; w < days; w += 7) head += '<span style="left:' + (w * px) + 'px;width:' + (7 * px) + 'px">' + esc(fmtD(d.from + w)) + '</span>'; head += '<i class="sl-today" style="left:' + ((d.asOf - d.from) * px) + 'px"></i></div>';
    return chunk(d.rows, 12).map(function(part){ return '<table class="sl-t sl-la"><thead><tr><th style="width:96px">' + T('No.', '编号') + '</th><th>' + T('Item', '事项') + '</th><th style="width:80px">' + T('Block', '区域') + '</th><th style="width:' + W + 'px;padding:0">' + head + '</th></tr></thead><tbody>' +
      part.map(function(r){ var s = Math.max(r.s, d.from), f = Math.min(r.f, d.to), l = (s - d.from) * px, wd = Math.max(px * 0.8, (f - s + 1) * px), late = r.f < d.from;
        return '<tr' + (r.od ? ' class="sl-od"' : '') + '><td class="n">' + esc(r.no) + '</td><td><span class="sl-reg c-' + esc(r.reg.color) + '"></span>' + bil1(r.t) + '</td><td>' + (r.blocks ? slBlk(r.blocks) : '') + '</td><td class="sl-gc" style="width:' + W + 'px"><i class="sl-today" style="left:' + ((d.asOf - d.from) * px) + 'px"></i>' +
          (late ? '<span class="sl-late">' + T('overdue since ', '逾期自 ') + esc(fmtD(r.f)) + '</span>' : r.ms ? '<i class="sl-ms" style="left:' + (l + wd / 2 - 7) + 'px"></i>' : '<span class="sl-gb' + (r.od ? ' sl-od' : '') + '" style="left:' + l + 'px;width:' + wd + 'px"><i style="width:' + (r.pct || 0) + '%"></i></span>' + (r.pct != null ? (l + wd + 44 > W ? '<span class="sl-gp sl-in" style="right:' + (W - l - wd + 4) + 'px">' + r.pct + '%</span>' : '<span class="sl-gp" style="left:' + (l + wd + 4) + 'px">' + r.pct + '%</span>') : '')) + '</td></tr>'; }).join('') + '</tbody></table>'; });
  },
  table:function(d){
    if(d.err) return [slEmpty('Choose a register.', '请选择台账。')];
    if(!d.rows.length) return [slEmpty('No items match this slide’s filter.', '没有符合此页筛选条件的记录。')];
    return chunk(d.rows, d.per || 12).map(function(part){ return '<table class="sl-t"><thead><tr>' + d.cols.map(function(c){ return '<th>' + bil(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + part.map(function(r){ return '<tr' + (r.od ? ' class="sl-od"' : '') + '>' + r.c.map(function(c, i){
      if(c.t) return '<td class="sl-tt"' + (r.dep ? ' style="padding-left:' + (10 + r.dep * 18) + 'px"' : '') + '>' + (r.dep ? '└ ' : '') + bil(c.t) + '</td>';
      if(c.s) return '<td>' + slChip(c.s) + '</td>'; if(c.p !== undefined) return '<td>' + (c.p == null ? '—' : slBar(c.p) + ' <span class="n">' + c.p + '%</span>') + '</td>'; if(c.b) return '<td>' + slBlk(c.b) + '</td>';
      return '<td' + (c.m ? ' class="n"' : '') + '>' + esc(c.v || '—') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'; });
  },
  breakdown:function(d){
    if(d.err) return [slEmpty('Choose a register with a status field.', '请选择有状态字段的台账。')];
    var max = Math.max.apply(null, d.groups.map(function(g){ return g.n; }).concat([1]));
    return chunk(d.groups, 10).map(function(part){ return '<div class="sl-bd">' + part.map(function(g){ return '<div class="sl-bdr"><span class="sl-bdl">' + esc(g.label) + '</span><span class="sl-bdb" style="width:' + Math.max(4, g.n / max * 100) + '%">' + g.segs.map(function(n, i){ return n ? '<i class="cb-' + esc(d.legend[i].color) + '" style="flex:' + n + '" title="' + n + '">' + (n / g.n > 0.08 ? n : '') + '</i>' : ''; }).join('') + '</span><span class="sl-bdn"><b>' + g.done + '</b> / ' + g.n + '</span></div>'; }).join('') + '</div><div class="sl-legend">' + d.legend.map(function(l){ return '<span><i class="cb-' + esc(l.color) + '"></i>' + bil1(l) + '</span>'; }).join('') + '</div>'; });
  },
  punch:function(d){
    if(d.err) return [slEmpty('Choose the punch-list register.', '请选择尾项台账。')];
    var tiles = '<div class="sl-tiles s3"><div class="sl-tile' + (d.open ? ' bad' : '') + '"><span>' + T('Open items', '未关闭') + '</span><b>' + d.open + '</b><small>' + T('of ' + d.total + ' raised', '共 ' + d.total + ' 项') + '</small></div><div class="sl-tile' + (d.od ? ' bad' : '') + '"><span>' + T('Past due date', '超期未关闭') + '</span><b>' + d.od + '</b></div>' + (d.closedWk != null ? '<div class="sl-tile good"><span>' + T('Closed in last 7 days', '近 7 天关闭') + '</span><b>' + d.closedWk + '</b></div>' : '') + '</div>';
    var grid = d.prios.length && d.blocks.length ? '<table class="sl-t sl-pg"><thead><tr><th>' + T('Priority', '优先级') + '</th>' + d.blocks.map(function(b){ return '<th><span class="sl-blk c-' + esc(b.color) + '">' + esc(b.v) + '</span></th>'; }).join('') + '<th>' + T('Total', '合计') + '</th></tr></thead><tbody>' + d.prios.map(function(p, i){ var row = d.grid[i] || [], tot = row.reduce(function(s, x){ return s + x; }, 0); return '<tr><th>' + slChip(p) + '</th>' + row.map(function(n){ return '<td class="n' + (n ? ' hit' : '') + '">' + (n || '·') + '</td>'; }).join('') + '<td class="n"><b>' + tot + '</b></td></tr>'; }).join('') + '</tbody></table>' : '';
    var top = d.top.length ? '<table class="sl-t sl-pt"><thead><tr><th></th><th>' + T('Item', '问题') + '</th><th>' + T('Location', '位置') + '</th><th>' + T('Due', '期限') + '</th></tr></thead><tbody>' + d.top.map(function(r){ return '<tr' + (r.od ? ' class="sl-od"' : '') + '><td>' + (r.prio ? '<span class="sl-chip c-' + esc(r.prio.color) + '">' + esc(r.prio.v) + '</span>' : '') + '</td><td><span class="n">' + esc(r.no) + '</span> ' + bil1(r.t) + '</td><td>' + slBlk(r.b) + ' ' + esc(r.loc) + '</td><td class="n">' + esc(r.due ? fmtD(d2n(r.due)) : '') + '</td></tr>'; }).join('') + '</tbody></table>' : '';
    return [tiles + '<div class="sl-2c"><div>' + grid + '</div><div>' + top + '</div></div>'];
  },
  photos:function(d){
    if(!d.photos.length) return [slEmpty('No photos for this slide yet. Add photos to records, or pick them in the slide settings.', '此页还没有照片。请在记录中上传照片，或在右侧设置中挑选。')];
    var per = d.layout === '3x2' ? 6 : d.layout === '1' ? 1 : 4;
    return chunk(d.photos, per).map(function(part){ return '<div class="sl-ph l' + esc(d.layout) + '">' + part.map(function(p){ var u = p.src || (p.path && STORE && STORE.fileUrl(p.path)) || ''; return '<figure>' + (u ? '<img src="' + esc(u) + '" alt="">' : '<div class="sl-noimg"></div>') + '<figcaption><b>' + esc(p.no) + '</b> ' + bil1(p.t) + ' ' + slBlk(p.b) + '<span>' + esc(p.date) + '</span></figcaption></figure>'; }).join('') + '</div>'; });
  },
  actions:function(d){
    if(d.err) return [slEmpty('Choose the meetings register.', '请选择会议台账。')];
    if(!d.meeting) return [slEmpty('No meeting with action items before this date.', '此日期前没有带待办事项的会议。')];
    var head = '<p class="sl-sub">' + T('From ', '来自 ') + esc(d.meeting.no) + ' · ' + bil1(d.meeting.t) + ' · ' + esc(d.meeting.date) + '</p>';
    if(!d.rows.length) return [head + slEmpty('No open action items.', '没有未完成的待办事项。')];
    return chunk(d.rows, 11).map(function(part){ return head + '<table class="sl-t"><thead><tr><th style="width:40px">#</th><th>' + T('Action', '事项') + '</th><th style="width:220px">' + T('Owner', '负责人') + '</th><th style="width:130px">' + T('Due', '期限') + '</th><th style="width:110px">' + T('Status', '状态') + '</th></tr></thead><tbody>' + part.map(function(r, i){ return '<tr' + (r.od ? ' class="sl-od"' : '') + '><td class="n">' + (d.rows.indexOf(r) + 1) + '</td><td>' + esc(r.a) + '</td><td>' + esc(r.who) + '</td><td class="n">' + esc(r.due) + '</td><td>' + (r.done ? '<span class="sl-chip c-green">' + T('Done', '完成') + '</span>' : r.od ? '<span class="sl-chip c-red">' + T('Overdue', '逾期') + '</span>' : '<span class="sl-chip c-blue">' + T('Open', '进行中') + '</span>') + '</td></tr>'; }).join('') + '</tbody></table>'; });
  },
  text:function(d){
    function list(t){ var lines = String(t || '').split(/\n/).filter(function(x){ return x.trim(); }); return lines.length ? '<ul>' + lines.map(function(l){ var sub = /^\s{2,}|^\t|^-\s/.test(l); return '<li' + (sub ? ' class="sub"' : '') + '>' + esc(l.replace(/^[\s\-•*]+/, '')) + '</li>'; }).join('') + '</ul>' : ''; }
    return ['<div class="sl-txt' + (d.body2 ? ' two' : '') + '"><div>' + (list(d.body) || slEmpty('Type the points in the slide settings.', '请在右侧设置中输入要点。')) + '</div>' + (d.body2 ? '<div>' + list(d.body2) + '</div>' : '') + '</div>'];
  }
};

/* ---------------- deck → pages ---------------- */
function slideData(deck, s, ctx){ var snap = deck.d.status === 'issued' && deck.d.snap && deck.d.snap[s.id]; if(snap) return snap; try{ return SLIDE_DATA[s.type](s.cfg || {}, ctx); }catch(e){ console.error(e); return {err:'x'}; } }
function slideTitle(s){ return s.title || {en:'', zh:''}; }
function wrapPage(deck, s, body, pi, pn, n, total, hdr){
  if(s.type === 'cover' || s.type === 'section') return '<div class="sl sl-' + s.type + '">' + body + '<div class="sl-f2"><span>' + esc(hdr.proj) + '</span><span>' + n + ' / ' + total + '</span></div></div>';
  return '<div class="sl"><div class="sl-band"></div><div class="sl-h"><h1>' + bil(slideTitle(s)) + (pn > 1 ? '<span class="sl-pgn">' + (pi + 1) + ' / ' + pn + '</span>' : '') + '</h1><div class="sl-proj">' + esc(hdr.proj) + '</div></div><div class="sl-b">' + body + '</div><div class="sl-f"><span>' + esc(hdr.title) + '</span><span>' + esc(hdr.date) + '</span><span>' + n + ' / ' + total + '</span></div></div>';
}
function deckBuild(deck, opts){
  opts = opts || {};
  var ctx = dctx(deck), outer = DK_CACHE; DK_CACHE = outer || {};
  try{ return withLang(ctx.lang, function(){
    var pc = cfg(), hdr = {proj:S.lang === 'zh' ? (pc.projectZh || pc.projectEn) : pc.projectEn, title:S.lang === 'zh' ? (deck.d.titleZh || deck.d.title || '') : (deck.d.title || deck.d.titleZh || ''), date:deck.d.date || ''};
    var out = [];
    (deck.d.slides || []).forEach(function(s){ if(s.hidden && !opts.all) return; if(!SLIDES[s.type]) return;
      var data = opts.data ? (opts.data[s.id] || {err:'x'}) : slideData(deck, s, ctx), b;
      try{ b = SLIDE_RENDER[s.type](data, s); }catch(e){ console.error(e); b = [slEmpty('This slide could not be drawn.', '此页无法显示。')]; }
      out.push({s:s, data:data, bodies:b.length ? b : [slEmpty('Empty', '空')]}); });
    var total = 0, n = 0; out.forEach(function(x){ if(!x.s.hidden) total += x.bodies.length; });
    out.forEach(function(x){ x.first = x.s.hidden ? 0 : n + 1; x.pages = x.bodies.map(function(b, i){ return wrapPage(deck, x.s, b, i, x.bodies.length, x.s.hidden ? '–' : ++n, total, hdr); }); });
    out.total = total;
    return out;
  }); } finally { DK_CACHE = outer; }
}
function deckPages(deck, opts){ var out = []; deckBuild(deck, opts).forEach(function(x){ if(x.s.hidden) return; x.pages.forEach(function(h){ out.push({sid:x.s.id, html:h}); }); }); return out; }
function deckData(deck){ var ctx = dctx(deck), o = {}, outer = DK_CACHE; DK_CACHE = outer || {}; try{ withLang(ctx.lang, function(){ (deck.d.slides || []).forEach(function(s){ if(SLIDES[s.type]) o[s.id] = SLIDE_DATA[s.type](s.cfg || {}, ctx); }); }); } finally { DK_CACHE = outer; } return o; }

/* ---------------- slide CSS (used on screen, in present mode and in the PDF window) ---------------- */
var SLIDE_CSS = [
'.sl{width:1280px;height:720px;background:#fff;color:#1A1D21;position:relative;overflow:hidden;display:flex;flex-direction:column;font:18px/1.4 system-ui,-apple-system,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}',
'.sl *{box-sizing:border-box}',
'.sl-band{height:8px;background:linear-gradient(90deg,#1D4E89 0,#1D4E89 70%,#E8930C 70%,#E8930C 100%)}',
'.sl-h{display:flex;justify-content:space-between;align-items:flex-end;padding:22px 48px 12px;border-bottom:1px solid #E3E5E0}',
'.sl-h h1{margin:0;font-size:32px;font-weight:700;letter-spacing:-.01em;color:#123660;display:flex;align-items:baseline;gap:14px}',
'.sl-h h1 .sl-zh{font-size:22px;font-weight:500;color:#5A6067;margin:0}',
'.sl-pgn{font-size:16px;font-weight:500;color:#8A9096}',
'.sl-proj{font-size:14px;color:#5A6067;font-weight:600;letter-spacing:.04em;text-transform:uppercase}',
'.sl-b{flex:1;min-height:0;padding:20px 48px 12px;display:flex;flex-direction:column;gap:14px;overflow:hidden}',
'.sl-f{height:40px;flex:none;display:flex;justify-content:space-between;align-items:center;padding:0 48px;font-size:13px;color:#7A8087;border-top:1px solid #E3E5E0}',
'.sl-f2{position:absolute;left:0;right:0;bottom:0;height:40px;display:flex;justify-content:space-between;align-items:center;padding:0 48px;font-size:13px;color:rgba(255,255,255,.7)}',
'.sl-zh{display:block;font-size:.78em;color:#6B7178;font-weight:400}',
'.sl-cover{background:#123660;color:#fff;flex-direction:row}',
'.sl-cv-l{flex:1;padding:120px 72px 60px;display:flex;flex-direction:column;justify-content:center;gap:12px;background:linear-gradient(135deg,#123660 0,#1D4E89 100%);position:relative}',
'.sl-cv-l:after{content:"";position:absolute;left:72px;bottom:120px;width:120px;height:6px;background:#E8930C}',
'.sl-cv-proj{font-size:20px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#C9D8EC}',
'.sl-cv-proj span{display:block;font-size:16px;letter-spacing:0;color:#9FB6D3}',
'.sl-cover h1{font-size:54px;line-height:1.12;margin:6px 0 0;font-weight:750;letter-spacing:-.02em}',
'.sl-cover h2{font-size:30px;margin:0;font-weight:500;color:#DCE6F3}',
'.sl-cv-sub{font-size:22px;color:#DCE6F3;margin:6px 0 0}',
'.sl-cv-meta{width:380px;flex:none;background:#0E2A4C;padding:120px 48px 60px;display:flex;flex-direction:column;justify-content:center;gap:22px;font-size:20px}',
'.sl-cv-meta b{display:block;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#9FB6D3;font-weight:600;margin-bottom:2px}',
'.sl-section{background:#1D4E89;color:#fff}',
'.sl-sec{flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 96px;gap:10px;border-left:16px solid #E8930C}',
'.sl-sec h1{font-size:56px;margin:0;font-weight:750}.sl-sec h1 .sl-zh{color:#DCE6F3;font-size:32px}.sl-sec p{font-size:24px;color:#DCE6F3;margin:0}',
'.sl-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.sl-tiles.s3{grid-template-columns:repeat(3,1fr)}',
'.sl-tile{border:1px solid #DADDD6;border-radius:10px;padding:16px 18px;display:flex;flex-direction:column;gap:6px;background:#F7F8F5}',
'.sl-tile span{font-size:15px;color:#5A6067}.sl-tile b{font-size:40px;line-height:1.05;font-variant-numeric:tabular-nums}.sl-tile small{font-size:14px;color:#6B7178}',
'.sl-tile.bad b{color:#A1262A}.sl-tile.good b{color:#1F6B45}',
'.sl-bar{display:inline-block;vertical-align:middle;width:180px;height:10px;border-radius:5px;background:#E6E8E3;overflow:hidden}.sl-tile .sl-bar{width:100%}',
'.sl-bar i{display:block;height:100%;background:#2E9E6A;border-radius:5px}',
'.sl-t{width:100%;border-collapse:collapse;font-size:16px}',
'.sl-t th{text-align:left;font-size:13px;font-weight:600;color:#5A6067;text-transform:none;padding:8px 10px;border-bottom:2px solid #1D4E89;background:#F3F5F8}',
'.sl-t th .sl-zh{display:inline;margin-left:4px}',
'.sl-t td{padding:8px 10px;border-bottom:1px solid #E6E8E3;vertical-align:middle}',
'.sl-t tr.sl-od td{background:#FDF1F1}.sl-t td.bad{color:#A1262A;font-weight:700}',
'.sl-t .n{font-variant-numeric:tabular-nums;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:14px;white-space:nowrap}',
'.sl-t td.sl-tt .sl-zh{display:inline;margin-left:8px;font-size:.85em}',
'.sl-kt td{font-size:18px}',
'.sl-mx th,.sl-mx td{text-align:center;border:1px solid #E3E5E0}.sl-mx thead th{text-align:center}.sl-mx tbody th{text-align:left;font-size:15px;color:#1A1D21;background:#fff;font-weight:600;width:300px}',
'.sl-mx td b{display:block;font-size:20px}.sl-mx td small{display:block;font-size:12px;color:#5A6067;font-family:ui-monospace,Menlo,monospace}.sl-mx td.na{color:#C8CBC5}.sl-mx tr.sl-sum th,.sl-mx tr.sl-sum td{border-top:2px solid #1D4E89}',
'.sl-blk{display:inline-block;font:600 12px/18px ui-monospace,Menlo,monospace;padding:0 6px;border-radius:4px;background:#ECEEEA;color:#3D434A;margin-right:3px}',
'.sl-chip{display:inline-block;font-size:13px;line-height:22px;padding:0 10px;border-radius:11px;white-space:nowrap}',
'.c-grey{background:#ECEEEA;color:#3D434A}.c-blue{background:#E5EDF7;color:#123660}.c-amber{background:#FCEFE1;color:#8A3F00}.c-red{background:#FBE8E8;color:#A1262A}.c-green{background:#E3F1E8;color:#1F6B45}.c-violet{background:#EAE6F6;color:#4A3A8C}.c-teal{background:#DDF1EF;color:#0E6B6B}.c-pink{background:#F8E3EE;color:#9B2C68}',
'.cb-grey{background:#8E949A}.cb-blue{background:#3E6FAD}.cb-amber{background:#C9822F}.cb-red{background:#B8474A}.cb-green{background:#3C8A5E}.cb-violet{background:#7564B5}.cb-teal{background:#2F9A93}.cb-pink{background:#C25690}',
'.sl-note{font-size:13px;color:#7A8087;margin:0}.sl-sub{font-size:16px;color:#5A6067;margin:0}',
'.sl-la td{padding:5px 10px;font-size:15px}.sl-gh{position:relative;height:30px}.sl-gh span{position:absolute;top:6px;font-size:12px;color:#5A6067;border-left:1px solid #C8CBC5;padding-left:4px;white-space:nowrap}',
'.sl-gc{position:relative;height:34px;padding:0!important;background-image:linear-gradient(90deg,#EEF0EC 1px,transparent 1px);background-size:' + (640 / 21 * 7) + 'px 100%}',
'.sl-gb{position:absolute;top:10px;height:14px;border-radius:3px;background:#2F6DB5;overflow:hidden}.sl-gb i{display:block;height:100%;background:#2E9E6A}.sl-gb.sl-od{background:#D2453F}',
'.sl-gp{position:absolute;top:8px;font-size:12px;color:#5A6067;white-space:nowrap}.sl-gp.sl-in{top:10px;font-size:11px;line-height:14px;color:#fff;font-weight:600;z-index:2}'+
'.sl-blk{white-space:nowrap}.sl-ms{position:absolute;top:10px;width:14px;height:14px;background:#1A1D21;transform:rotate(45deg)}',
'.sl-today{position:absolute;top:0;bottom:0;width:2px;background:#E8930C;z-index:1}.sl-late{position:absolute;left:6px;top:7px;font-size:12px;color:#A1262A;font-weight:600;background:#FDF1F1;padding:0 4px;z-index:2;white-space:nowrap}',
'.sl-reg{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;vertical-align:1px}.sl-reg.c-blue{background:#3E6FAD}.sl-reg.c-green{background:#3C8A5E}.sl-reg.c-amber{background:#C9822F}.sl-reg.c-violet{background:#7564B5}.sl-reg.c-red{background:#B8474A}.sl-reg.c-teal{background:#2F9A93}.sl-reg.c-grey{background:#8E949A}.sl-reg.c-pink{background:#C25690}',
'.sl-bd{display:flex;flex-direction:column;gap:12px}.sl-bdr{display:grid;grid-template-columns:330px 1fr 90px;gap:14px;align-items:center}',
'.sl-bdl{font-size:16px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sl-bdb{display:flex;height:26px;border-radius:5px;overflow:hidden;background:#ECEEEA}',
'.sl-bdb i{display:flex;align-items:center;justify-content:center;color:#fff;font:600 12px ui-monospace,Menlo,monospace;font-style:normal}.sl-bdn{font:15px ui-monospace,Menlo,monospace;color:#5A6067;text-align:right}.sl-bdn b{color:#1A1D21}',
'.sl-legend{display:flex;gap:18px;font-size:14px;color:#5A6067;flex-wrap:wrap}.sl-legend i{display:inline-block;width:14px;height:14px;border-radius:3px;margin-right:6px;vertical-align:-2px}',
'.sl-2c{display:grid;grid-template-columns:440px 1fr;gap:24px;min-height:0}.sl-pg td.hit{background:#FDF1F1;color:#A1262A;font-weight:700}.sl-pg td,.sl-pg th{text-align:center}.sl-pg tbody th{text-align:left}.sl-pt td{font-size:14px}',
'.sl-ph{flex:1;display:grid;gap:14px;min-height:0}.sl-ph.l2x2{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}.sl-ph.l3x2{grid-template-columns:repeat(3,1fr);grid-template-rows:1fr 1fr}.sl-ph.l1{grid-template-columns:1fr}',
'.sl-ph figure{margin:0;display:flex;flex-direction:column;min-height:0;border:1px solid #E3E5E0;border-radius:8px;overflow:hidden;background:#F7F8F5}',
'.sl-ph img,.sl-noimg{flex:1;min-height:0;width:100%;object-fit:cover;background:#E6E8E3}',
'.sl-ph figcaption{padding:6px 10px;font-size:13px;display:flex;gap:6px;align-items:center;white-space:nowrap;overflow:hidden}.sl-ph figcaption span{margin-left:auto;color:#7A8087;font-family:ui-monospace,Menlo,monospace;font-size:12px}',
'.sl-txt{display:grid;gap:40px;font-size:24px}.sl-txt.two{grid-template-columns:1fr 1fr}.sl-txt ul{margin:0;padding-left:28px;display:flex;flex-direction:column;gap:14px}.sl-txt li::marker{color:#E8930C}.sl-txt li.sub{margin-left:32px;font-size:20px;color:#3D434A;list-style:circle}',
'.sl-empty{flex:1;display:flex;align-items:center;justify-content:center;color:#8A9096;font-size:20px;border:2px dashed #DADDD6;border-radius:12px;text-align:center;padding:40px}'
].join('\n');
(function(){ var st = document.createElement('style'); st.id = 'slide-css'; st.textContent = SLIDE_CSS; document.head.appendChild(st); })();
