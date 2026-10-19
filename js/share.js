/* work-web · public links: read-only pages anyone with the link can open, no sign-in.
   The database decides what leaves it (share_get / share_project in supabase/schema.sql): Owner rules —
   registers published to the Owner and the library give only records marked "Show in Owner plan"; register views
   carry only External fields plus No. and title, the chosen columns and the records matching the publisher's filter;
   overviews and presentations add the fields charts need (dates, progress, status, block, package, type, baseline).
   This file builds links (register view, presentation, progress overview), manages them, and shows the public page. */
'use strict';

var SHARE_ROLE_KEYS = ['no', 'title', 'title2', 'start', 'finish', 'progress', 'status', 'block', 'tree', 'kind', 'astart', 'afinish', 'base'];
var SHARE_BAD = ['files', 'link', 'sub', 'section'];
var SHARE_LIB_KEYS = ['no', 'title', 'titleZh', 'docNo', 'rev', 'disc', 'status', 'date'];
var SHARE_FIELD_KEYS = ['key', 'en', 'zh', 'type', 'list', 'multi', 'opts', 'tree', 'unit', 'w', 'hide', 'ext'];
var SHARE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/* ---------------- the public copy ----------------
   The database builds it (share_project / share_get in supabase/schema.sql). These functions do exactly the same in the
   browser — for the demo, and for the preview when a link is made — and are tested against the database for identical output. */
function shareCl(x){ return x === undefined ? null : clone(x); }
function shareObj(o){ var x = {}; Object.keys(o).forEach(function(k){ if(o[k] != null) x[k] = o[k]; }); return x; }
function shareIsObj(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
function shareTruthy(v){ return !(v == null || v === false || v === 0 || v === ''); }
function shareStr(v){ return typeof v === 'string' ? v : null; }
function shareArr(v){ return v == null || v === '' ? [] : Array.isArray(v) ? v : [v]; }
function shareSet(){ return Object.create(null); }
function shareFields(d){ return (Array.isArray(d.fields) ? d.fields : []).filter(shareIsObj); }
function shareRoles(d){ return shareIsObj(d.roles) ? d.roles : {}; }
/* a field definition as visitors get it: what displaying needs (no explanations or other settings) */
function shareField(f){
  var o = {}; SHARE_FIELD_KEYS.forEach(function(k){ o[k] = shareCl(f[k]); });
  ['auto', 'calc'].forEach(function(k){ var a = f[k]; o[k] = shareIsObj(a) ? shareObj({op:shareCl(a.op), a:shareCl(a.a), b:shareCl(a.b)}) : null; });
  return shareObj(o);
}
/* which fields of a register go out. strict (register views): External fields plus No. and title only;
   cols: only these columns (plus No., title and package) */
function shareKeys(reg, strict, cols){
  var d = (reg && shareIsObj(reg.d)) ? reg.d : {}, lib = d.kind === 'library', fs = shareFields(d), ro = shareRoles(d), keys = shareSet();
  fs.forEach(function(f){ var k = shareStr(f.key); if(k && SHARE_BAD.indexOf(shareStr(f.type) || '') < 0 && (f.ext === true || (lib && SHARE_LIB_KEYS.indexOf(k) >= 0))) keys[k] = 1; });
  (strict ? ['no', 'title', 'title2'] : SHARE_ROLE_KEYS).forEach(function(r){ var k = shareStr(ro[r]); if(k) keys[k] = 1; });
  if(!strict){
    fs.forEach(function(f){ if(typeof f.key === 'string' && f.key === ro.progress && shareIsObj(f.auto)){ [shareStr(f.auto.a), shareStr(f.auto.b)].forEach(function(k){ if(k) keys[k] = 1; }); } });
    var mx = shareIsObj(d.matrix) ? d.matrix : {}; [shareStr(mx.row), shareStr(mx.col)].forEach(function(k){ if(k) keys[k] = 1; });
    keys.baseStart = 1; keys.baseFinish = 1;
  }
  fs.forEach(function(f){ if(typeof f.key === 'string' && SHARE_BAD.indexOf(shareStr(f.type) || '') >= 0) delete keys[f.key]; });
  if(Array.isArray(cols)){ var allow = shareSet(); cols.forEach(function(c){ if(typeof c === 'string') allow[c] = 1; }); ['no', 'title', 'title2', 'tree'].forEach(function(r){ var k = shareStr(ro[r]); if(k) allow[k] = 1; });
    Object.keys(keys).forEach(function(k){ if(!allow[k]) delete keys[k]; }); }
  return keys;
}
function shareGated(reg){ return !!reg && shareIsObj(reg.d) && (reg.d.kind === 'library' || shareTruthy(reg.d.ownerPublish)); }
function shareRegOk(reg){ return !!reg && reg.vis === 'team' && typeof reg.id === 'string' && SHARE_ID.test(reg.id) && shareIsObj(reg.d) && ['decks', 'snaps', 'people'].indexOf(shareStr(reg.d.kind) || '') < 0; }
/* the publisher's filter of a register view, prepared once per register: field values (fx) and the package (node) */
function shareFilterPrep(fs, ro, f){
  var p = {fx:[], mode:'all', tk:null, set:shareSet()};
  if(!shareIsObj(f)) return p;
  function first(k){ return fs.filter(function(x){ return x.key === k; })[0] || null; }
  if(shareIsObj(f.fx)) Object.keys(f.fx).sort().forEach(function(k){ var w = f.fx[k]; if(!Array.isArray(w) || !w.length) return; var fd = first(k); if(fd) p.fx.push({k:k, w:w, c:fd.type === 'check'}); });
  var nd = shareStr(f.node), tk = shareStr(ro.tree);
  if(!nd || nd === 'all' || !tk) return p;
  var tf = first(tk); if(!tf) return p;
  var tn = (Array.isArray(tf.tree) ? tf.tree : []).filter(function(n){ return shareIsObj(n) && typeof n.id === 'string'; });
  p.tk = tk;
  if(nd === 'none'){ p.mode = 'none'; tn.forEach(function(n){ p.set[n.id] = 1; }); return p; }
  p.mode = 'set'; p.set[nd] = 1; var q = [nd];
  while(q.length){ var pid = q.shift(); tn.forEach(function(n){ if((shareStr(n.parent) || '') === pid && !p.set[n.id]){ p.set[n.id] = 1; q.push(n.id); } }); }
  return p;
}
function shareFilterRec(p, d){
  d = shareIsObj(d) ? d : {};
  for(var i = 0; i < p.fx.length; i++){
    var c = p.fx[i], have = c.c ? [shareTruthy(d[c.k]) ? '1' : '0'] : shareArr(d[c.k]);
    if(!have.length && c.w.indexOf('__none') >= 0) continue;
    if(!have.some(function(h){ return c.w.some(function(w){ return same(h, w); }); })) return false;
  }
  if(p.mode === 'all') return true;
  var v = d[p.tk], hit = typeof v === 'string' && !!p.set[v];
  return p.mode === 'none' ? !(shareTruthy(v) && hit) : hit;
}
/* lists behind status / type / block / matrix keep every entry; other lists (names) keep only the entries the records use */
function shareListUse(acc, flds, recs, ro, mx){
  var st = shareSet(); mx = shareIsObj(mx) ? mx : {}; ro = shareIsObj(ro) ? ro : {};
  [shareStr(ro.status), shareStr(ro.kind), shareStr(ro.block), shareStr(mx.row), shareStr(mx.col)].forEach(function(k){ if(k != null) st[k] = 1; });
  flds.forEach(function(f){ var L = shareStr(f.list); if(!L) return; acc.lst[L] = 1; if(st[f.key]){ acc.full[L] = 1; return; }
    recs.forEach(function(r){ shareArr(r.d[f.key]).forEach(function(v){ if(typeof v === 'string') acc.used[L + '\x1f' + v] = 1; }); }); });
}
function shareLists(l0, acc){
  var cl = {}; l0 = shareIsObj(l0) ? l0 : {};
  Object.keys(l0).forEach(function(k){ if(!acc.lst[k]) return; var v = l0[k];
    if(acc.full[k] || !shareIsObj(v) || !Array.isArray(v.opts)) cl[k] = shareCl(v);
    else { var x = clone(v); x.opts = v.opts.filter(function(o){ return shareIsObj(o) && typeof o.v === 'string' && acc.used[k + '\x1f' + o.v]; }).map(clone); cl[k] = x; } });
  return cl;
}
/* opt: {strict, cols, filter, ids} — see share_project */
function shareProject(src, ids, opt){
  opt = shareIsObj(opt) ? opt : {};
  var strict = opt.strict === true, only = null;
  if(Array.isArray(opt.ids)){ only = shareSet(); opt.ids.forEach(function(x){ if(typeof x === 'string') only[x] = 1; }); }
  var regs = [], recs = [], acc = {lst:shareSet(), full:shareSet(), used:shareSet()}, seen = shareSet();
  (ids || []).forEach(function(id){
    if(seen[id]) return; seen[id] = 1;
    var g = (src.regs || []).filter(function(r){ return r && r.id === id; })[0]; if(!shareRegOk(g)) return;
    var d0 = g.d, fs = shareFields(d0), ro = shareRoles(d0), gated = shareGated(g), keys = shareKeys(g, strict, opt.cols), roles = {};
    Object.keys(ro).forEach(function(k){ if(SHARE_ROLE_KEYS.indexOf(k) >= 0 && typeof ro[k] === 'string' && keys[ro[k]]) roles[k] = ro[k]; });
    var flds = fs.filter(function(f){ return typeof f.key === 'string' && keys[f.key]; }).map(shareField), d = {};
    ['kind', 'en', 'zh', 'icon', 'color', 'sec', 'prefix', 'tpl', 'ownerPublish', 'allMs', 'view', 'matrix'].forEach(function(k){ d[k] = shareCl(d0[k]); });
    d.roles = roles; d.fields = flds;
    regs.push({id:g.id, vis:'team', d:shareObj(d)});
    /* parent / ms / ext travel with records unless a field of that name exists (then the field rules apply) */
    var allk = shareSet(), fp = shareFilterPrep(fs, ro, opt.filter), rs = [];
    fs.forEach(function(f){ if(typeof f.key === 'string') allk[f.key] = 1; });
    (src.recs || []).forEach(function(r){
      if(!r || r.reg !== g.id) return; var rd = shareIsObj(r.d) ? r.d : {};
      if((gated && rd.ext !== true) || (only && !(typeof r.id === 'string' && only[r.id])) || !shareFilterRec(fp, rd)) return;
      var o = {}; Object.keys(rd).forEach(function(k){ if(rd[k] !== undefined && (keys[k] || ((k === 'parent' || k === 'ms' || k === 'ext') && !allk[k]))) o[k] = clone(rd[k]); });
      rs.push({id:r.id, reg:r.reg, d:o});
    });
    recs = recs.concat(rs);
    shareListUse(acc, flds, rs, ro, d0.matrix);
  });
  var c = shareIsObj(src.cfg) ? src.cfg : {}, out = {v2:true};
  ['projectEn', 'projectZh', 'asOf', 'ganttStart', 'ganttEnd'].forEach(function(k){ if(c[k] != null) out[k] = clone(c[k]); });
  out.lists = shareLists(c.lists, acc);
  return {regs:regs, recs:recs, cfg:out};
}
/* which registers a link reads, and the options for shareProject (stage: live / freeze / check) */
function shareRegList(d){ return d && shareIsObj(d.cfg) && Array.isArray(d.cfg.regs) ? d.cfg.regs.filter(function(x){ return typeof x === 'string'; }) : []; }
function shareOpt(d, stage){
  if(!d || d.kind !== 'reg') return {}; var c = shareIsObj(d.cfg) ? d.cfg : {};
  return shareObj({strict:true, cols:shareCl(c.cols), filter:stage !== 'check' ? shareCl(c.filter) : null, ids:stage === 'freeze' ? shareCl(c.ids) : null});
}
/* a snapshot keeps its values but follows today's permissions (share_recheck) */
function shareRecheck(snap, live){
  if(!shareIsObj(snap)) return null;
  var regs = [], recs = [], acc = {lst:shareSet(), full:shareSet(), used:shareSet()}, lregs = live && Array.isArray(live.regs) ? live.regs : [], lrecs = live && Array.isArray(live.recs) ? live.recs : [];
  (Array.isArray(snap.regs) ? snap.regs : []).forEach(function(g){
    if(!shareIsObj(g) || !shareIsObj(g.d) || typeof g.id !== 'string') return;
    var lg = lregs.filter(function(x){ return x && x.id === g.id; })[0]; if(!lg) return;
    /* what may go out for this register today: its fields, and the record keys its live copy carries */
    var kf = shareSet(), kr = shareSet(), lids = shareSet(), gated = lg.d.kind === 'library' || shareTruthy(lg.d.ownerPublish);
    (lg.d.fields || []).forEach(function(f){ if(f && typeof f.key === 'string'){ kf[f.key] = 1; kr[f.key] = 1; } });
    lrecs.forEach(function(x){ if(x && x.reg === g.id){ lids[x.id] = 1; Object.keys(x.d || {}).forEach(function(k){ kr[k] = 1; }); } });
    var fl = (Array.isArray(g.d.fields) ? g.d.fields : []).filter(function(f){ return f && typeof f.key === 'string' && kf[f.key]; }).map(shareField);
    var ro = shareRoles(g.d), rl = {}; Object.keys(ro).forEach(function(k){ if(typeof ro[k] === 'string' && kf[ro[k]]) rl[k] = ro[k]; });
    regs.push(Object.assign(clone(g), {d:Object.assign(clone(g.d), {fields:fl, roles:rl})}));
    var rs = [];
    (Array.isArray(snap.recs) ? snap.recs : []).forEach(function(r){
      if(!shareIsObj(r) || r.reg !== g.id || (gated && !(typeof r.id === 'string' && lids[r.id]))) return;
      var rd = shareIsObj(r.d) ? r.d : {}, o = {}; Object.keys(rd).forEach(function(k){ if(rd[k] !== undefined && kr[k]) o[k] = clone(rd[k]); });
      rs.push(Object.assign(clone(r), {d:o}));
    });
    recs = recs.concat(rs);
    shareListUse(acc, fl, rs, rl, g.d.matrix);
  });
  var c = shareIsObj(snap.cfg) ? clone(snap.cfg) : {};
  if('lists' in c) c.lists = shareLists(c.lists, acc);
  return {regs:regs, recs:recs, cfg:c};
}
/* a presentation as visitors of a live link get it: visible slides only, display settings only
   (no speaker notes, comments, frozen internal figures, hidden slides, photo picks or file paths, hidden-item labels) */
function shareHide(h){ return h.filter(function(x){ return !(typeof x === 'string' && x.slice(0, 2) === 'p:'); }).map(clone); }
function sharePcfg(t, c){
  if(!shareIsObj(c)) return null; var x = clone(c);
  delete x.picks; delete x.hideLab; delete x.hide;
  if(Array.isArray(c.hide)) x.hide = shareHide(c.hide);
  if(t !== 'photos' && Array.isArray(c.picks)) x.picks = c.picks.map(function(p){ if(!shareIsObj(p)) return shareCl(p); var q = clone(p); delete q.path; return q; });
  return x;
}
function shareCfg(t, c){
  if(t !== 'combo' || !shareIsObj(c)) return sharePcfg(t, c);
  var x = sharePcfg(t, c); ['L', 'R'].forEach(function(k){ var p = c[k]; if(shareIsObj(p)){ var q = clone(p), pc = sharePcfg(p.type, p.cfg); if(pc != null) q.cfg = pc; x[k] = q; } });
  return x;
}
function shareEl(e){ if(!shareIsObj(e) || e.k !== 'data') return shareCl(e); var x = clone(e), c = shareCfg(e.type, e.cfg); if(c != null) x.cfg = c; return x; }
function shareLogo(l){ return shareIsObj(l) && typeof l.path === 'string' ? {path:l.path} : null; }
function shareDeckPublic(rec){
  if(!rec || !shareIsObj(rec.d)) return null; var p = rec.d, th = p.theme;
  var slides = (Array.isArray(p.slides) ? p.slides : []).filter(function(s){ return shareIsObj(s) && !shareTruthy(s.hidden); }).map(function(s){
    return shareObj({id:shareCl(s.id), type:shareCl(s.type), title:shareCl(s.title), box:shareCl(s.box), cfg:shareCfg(s.type, s.cfg), els:Array.isArray(s.els) ? s.els.map(shareEl) : null}); });
  return {id:rec.id, d:shareObj({no:shareCl(p.no), title:shareCl(p.title), titleZh:shareCl(p.titleZh), date:shareCl(p.date), lang:shareCl(p.lang), presenter:shareCl(p.presenter), aud:'owner',
    theme:shareIsObj(th) ? shareObj({color:shareCl(th.color), foot:shareCl(th.foot), footText:shareCl(th.footText), conf:shareCl(th.conf), style:shareCl(th.style), agenda:shareCl(th.agenda), logoL:shareLogo(th.logoL), logoR:shareLogo(th.logoR)}) : null,
    slides:slides})};
}
/* images embedded in a live presentation link: only those the visible slides and the logos use */
function shareMedia(m, dk){
  var use = shareSet(), out = {}; if(!shareIsObj(m) || !dk) return out;
  (dk.d.slides || []).forEach(function(s){ (Array.isArray(s.els) ? s.els : []).forEach(function(e){ if(shareIsObj(e) && typeof e.path === 'string') use[e.path] = 1; }); });
  var th = dk.d.theme || {}; ['logoL', 'logoR'].forEach(function(k){ if(th[k] && typeof th[k].path === 'string') use[th[k].path] = 1; });
  Object.keys(m).forEach(function(k){ if(use[k]) out[k] = clone(m[k]); });
  return out;
}
var SHARE_VER = 2;   /* links made before v2.6.1 followed older rules and stay closed */
/* one link as a visitor gets it (share_get without the view counter); src = {regs, recs, cfg} */
function shareServe(src, x){
  if(!x || x.revoked || (x.expires_at && Date.parse(x.expires_at) <= Date.now())) return null;
  var d = shareIsObj(x.data) ? clone(x.data) : {}, regs = shareRegList(d), dk = null;
  if(d.v !== SHARE_VER) return null;
  if(d.kind === 'deck'){
    var did = shareIsObj(d.cfg) ? d.cfg.deck : null;
    dk = typeof did === 'string' ? (src.recs || []).filter(function(r){ return r && r.id === did; })[0] || null : null;
    var g = dk && (src.regs || []).filter(function(r){ return r && r.id === dk.reg; })[0];
    if(!dk || !shareIsObj(dk.d) || !g || g.vis !== 'team' || !shareIsObj(g.d) || g.d.kind !== 'decks' || dk.d.aud === 'internal') return null;
  }
  var media = d.media; delete d.media;
  if(d.mode === 'live'){ delete d.snap; d.live = shareProject(src, regs, shareOpt(d, 'live')); if(d.kind === 'deck'){ d.deck = shareDeckPublic(dk); d.media = shareMedia(media, d.deck); } }
  else if(d.kind !== 'deck') d.snap = shareRecheck(d.snap, shareProject(src, regs, shareOpt(d, 'check')));
  if(shareIsObj(d.cfg)){ delete d.cfg.filter; delete d.cfg.ids; }
  return {id:x.id, at:new Date().toISOString(), created_at:x.created_at, expires_at:x.expires_at || null, data:d};
}
function shareFreezeData(src, d){ return shareProject(src, shareRegList(d), shareOpt(d, 'freeze')); }
function shareSrc(){ return {regs:(STORE && STORE.regs) || [], recs:(STORE && STORE.recs) || [], cfg:(STORE && STORE.cfg) || {}}; }

/* ---------------- links ---------------- */
function shareToken(){ var a = new Uint8Array(18); crypto.getRandomValues(a); return btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function shareUrl(id){ return location.origin + location.pathname + '#s=' + id; }
var SHARE_KINDS = {reg:['Register view', '台账视图'], deck:['Presentation', '演示文稿'], overview:['Progress overview', '进度总览']};
/* registers a presentation reads from (for a live link) */
function deckShareRegs(deck){
  var ids = {};
  (deck.d.slides || []).filter(function(s){ return !s.hidden; }).forEach(function(s){ slideRegIds(s).forEach(function(id){ ids[id] = 1; });
    if(s.type === 'summary' && !(s.cfg && s.cfg.ms)) allRegs().forEach(function(r){ if(rolesOf(r).start || rolesOf(r).finish) ids[r.id] = 1; }); });
  return Object.keys(ids).filter(function(id){ return shareRegOk(getReg(id)); });
}
/* the publisher's filter, kept only where it uses fields the link carries. The database applies field values and the
   package itself; search text, dates and "overdue" are kept by snapshots only (they freeze the matching records). */
function shareFilter(reg, mode){
  var f = clone(rfil(reg.id)), keys = shareKeys(reg, true), dropped = [], snapOnly = [], ro = rolesOf(reg);
  Object.keys(f.fx || {}).forEach(function(k){ if(!(f.fx[k] || []).length) { delete f.fx[k]; return; } if(!keys[k]){ var fd = fieldOf(reg, k); dropped.push(fd ? T1(fd.en, fd.zh) : k); delete f.fx[k]; } });
  if(f.star){ dropped.push(T('Key items', '重点')); f.star = false; }
  f.ext = false;
  if(f.node && f.node !== 'all' && !(ro.tree && keys[ro.tree])){ dropped.push(T('Package', '文件包')); f.node = 'all'; }
  if(mode !== 'snap'){
    if(f.q){ snapOnly.push(T('Search text', '搜索文字')); f.q = ''; }
    if(f.from || f.to){ snapOnly.push(T('Date range', '日期范围')); f.from = ''; f.to = ''; }
    if(f.od){ snapOnly.push(T('Overdue only', '仅逾期')); f.od = false; }
  }
  return {f:f, dropped:dropped, snapOnly:snapOnly};
}
function shareCandidates(){ return allRegs().filter(function(r){ return shareRegOk(r) && (rolesOf(r).status || rolesOf(r).start || rolesOf(r).finish); }); }

/* ---------------- create ---------------- */
function openShareNew(o){ openModal(Object.assign({kind:'shareNew', mode:'live', exp:'0', title:''}, o)); }
function shareNewModal(m){
  var h = '', ok = true, notes = [];
  if(m.done){
    var url = shareUrl(m.done);
    return {title:L('Public link ready', '公开链接已生成'), html:'<p>' + L('Anyone with this link can open the page without signing in. You can withdraw it at any time in Settings → Public links.', '任何拿到链接的人无需登录即可打开。可随时在「设置 → 公开链接」撤销。') + '</p>' +
      '<div class="row"><input class="in" id="shareUrl" readonly value="' + esc(url) + '" style="flex:1"><button type="button" class="btn pri" data-act="shareCopy" data-v="' + esc(m.done) + '">' + L('Copy', '复制') + '</button><a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">' + L('Open', '打开') + '</a></div>',
      foot:'<button type="button" class="btn" data-act="shareManage">' + L('Manage links', '管理链接') + '</button><button type="button" class="btn pri" data-act="mclose">' + L('Done', '完成') + '</button>'};
  }
  if(m.sk === 'reg'){
    var reg = getReg(m.reg); if(!reg){ return {title:'', html:''}; }
    var keys = shareKeys(reg, true), sf = shareFilter(reg, m.mode), view = recsOf(reg.id).filter(function(r){ return matchRec(reg, r, sf.f); });
    m._cfg = {regs:[reg.id], reg:reg.id, filter:sf.f, cols:tableCols(reg).filter(function(f){ return keys[f.key]; }).map(function(f){ return f.key; }), group:S.rg[reg.id] && S.rg[reg.id] === rolesOf(reg).tree ? 'tree' : ''};
    if(m.mode === 'snap') m._cfg.ids = view.map(function(r){ return r.id; });
    /* exactly what the database will send: the same rules run here on the same data */
    var pv = shareProject(shareSrc(), [reg.id], shareOpt({kind:'reg', cfg:m._cfg}, m.mode === 'snap' ? 'freeze' : 'live')), pr = pv.regs[0], n = pv.recs.length, hid = shareGated(reg) ? Math.max(0, view.length - n) : 0;
    h += '<div class="shs"><b>' + esc(regName(reg)) + '</b><span>' + L(n + ' records will be shown', '将显示 ' + n + ' 条记录') + (hid ? ' · ' + L(hid + ' not marked “Show in Owner plan” stay hidden', hid + ' 条未标记「显示于业主计划」，不公开') : '') + '</span>' +
      '<span>' + L('Columns: ', '列：') + esc((pr ? pr.d.fields : []).map(function(f){ return T1(f.en, f.zh); }).join(' · ') || '—') + '</span></div>';
    if(sf.dropped.length) notes.push(L('These filters use fields the link does not carry and are left out: ', '以下筛选条件用到不公开的字段，链接中不保留：') + esc(sf.dropped.join(', ')));
    if(sf.snapOnly.length) notes.push(L('A live link keeps filters by field values and package only. Left out: ', '实时链接只保留按字段值和文件包的筛选。未保留：') + esc(sf.snapOnly.join(', ')) + L(' — choose Snapshot to keep them.', '。如需保留，请选择「快照」。'));
    if(!n){ notes.push(L('No record would be visible. In the register, tick records and use “Show in Owner plan”.', '目前没有可显示的记录。请在台账中勾选记录，点「显示于业主计划」。')); }
    notes.push(L('Only the columns listed above go out: fields marked External among the visible columns, plus No. and title. To show another column (e.g. Package or Block), mark it External in Fields & columns and show it in the table.', '只公开上面列出的列：表格中可见、且标记为「对外」的字段，以及编号和名称。要显示其他列（如文件包、区域），请在「字段与列」中把它设为「对外」并在表格中显示。'));
    if(!m.title) m.title = regName(reg);
  } else if(m.sk === 'deck'){
    var deck = getRec(m.deck); if(!deck) return {title:'', html:''};
    if((deck.d.aud || 'owner') === 'internal'){ ok = false; notes.push(L('Internal presentations cannot be shared. Switch the audience to Owner mode in Presentation settings.', '内部文稿不能公开。请在文稿设置中切换为业主模式。')); }
    var n = (deck.d.slides || []).filter(function(s){ return !s.hidden; }).length;
    h += '<div class="shs"><b>' + esc((deck.d.no ? deck.d.no + ' · ' : '') + deckTitle(deck.d)) + '</b><span>' + L(n + ' slides (hidden ones are left out), Owner mode', n + ' 页（隐藏页不包括），业主模式') + '</span><span>' + L('Speaker notes are never shared.', '讲者备注不会公开。') + '</span></div>';
    if(m.mode === 'live') notes.push(L('Live: site photos and the S-curve “actual” line are only included in snapshots. Images and logos are taken as they are now; pictures added to slides later need a new link.', '实时模式：现场照片和 S 曲线「实际」线只在快照中提供。图片和 Logo 按现在的版本附上，之后在页面中新增的图片需要重新生成链接。'));
    if(!m.title) m.title = deckTitle(deck.d);
  } else {
    var cands = shareCandidates(); if(!m.regs) m.regs = cands.filter(function(r){ return !shareGated(r) || recsOf(r.id).some(function(x){ return x.d.ext === true; }); }).map(function(r){ return r.id; });
    h += '<div class="fl"><span class="flab">' + L('Registers in the overview', '总览包含的台账') + '</span><div class="dk-cl">' + cands.map(function(r){ var on = m.regs.indexOf(r.id) >= 0, g = shareGated(r), nn = g ? recsOf(r.id).filter(function(x){ return x.d.ext === true; }).length : recsOf(r.id).length;
      return '<label class="chk"><input type="checkbox" data-shreg="' + esc(r.id) + '"' + (on ? ' checked' : '') + '>' + esc(regName(r)) + ' <span class="note">' + (g ? L(nn + ' marked for the Owner', nn + ' 条对业主公开') : L(nn + ' records', nn + ' 条')) + '</span></label>'; }).join('') + '</div></div>';
    notes.push(L('The overview shows headline figures, milestones, the programme, block progress and status per package, built the same way as Owner-mode slides: besides External fields, the charts use dates, progress, status, block and package of the shared records. Other fields (remarks, contacts…) go out only if marked External; files, links and field explanations never do.', '总览包括关键数字、里程碑、进度计划、区域进度和各文件包状态，规则与业主模式简报相同：除「对外」字段外，图表会用到所公开记录的日期、进度、状态、区域和文件包。其他字段（备注、联系人等）只有标记为「对外」才会公开；附件、关联和字段说明永不公开。'));
    if(!m.regs.length){ ok = false; }
    if(!m.title) m.title = T('Progress overview', '进度总览');
  }
  h = '<label class="fl">' + L('Title', '标题') + '<input class="in" id="shareTitle" data-fk="shareTitle" value="' + esc(m.title) + '"></label>' + h +
    '<div class="fl"><span class="flab">' + L('Data', '数据') + '</span><div class="seg">' + [['live', 'Live — always current', '实时：打开时为最新'], ['snap', 'Snapshot — as it is now', '快照：按现在冻结']].map(function(o){ return '<button type="button" class="' + (m.mode === o[0] ? 'on' : '') + '" data-act="shareMode" data-v="' + o[0] + '">' + L(o[1], o[2]) + '</button>'; }).join('') + '</div></div>' +
    '<label class="fl">' + L('Link valid for', '有效期') + '<select class="in" id="shareExp">' + [['0', 'No end date', '不设期限'], ['7', '7 days', '7 天'], ['30', '30 days', '30 天'], ['90', '90 days', '90 天']].map(function(o){ return '<option value="' + o[0] + '"' + (m.exp === o[0] ? ' selected' : '') + '>' + esc(T(o[1], o[2])) + '</option>'; }).join('') + '</select></label>' +
    notes.map(function(x){ return '<p class="note">' + x + '</p>'; }).join('') + (m.err ? '<p class="note" style="color:var(--bad)">' + esc(m.err) + '</p>' : '');
  return {title:L('Public link · ' + SHARE_KINDS[m.sk][0], '公开链接 · ' + SHARE_KINDS[m.sk][1]), html:h,
    foot:'<button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button><button type="button" class="btn pri" data-act="shareCreate"' + (ok && !m.busy ? '' : ' disabled') + '>' + (m.busy ? L('Creating…', '正在生成…') : L('Create link', '生成链接')) + '</button>'};
}
DECK_MODALS.shareNew = shareNewModal;

async function shareCreate(){
  var m = S.modal; if(!m || m.kind !== 'shareNew' || m.busy) return;
  var id = shareToken(), exp = +m.exp ? new Date(Date.now() + (+m.exp) * 864e5).toISOString() : null;
  var data = {v:SHARE_VER, kind:m.sk, mode:m.mode, title:{en:m.title || '', zh:''}, lang:S.lang, at:new Date().toISOString(), cfgProject:{projectEn:cfg().projectEn || '', projectZh:cfg().projectZh || ''}};
  m.busy = true; m.err = ''; renderModal();
  try{
    if(m.sk === 'reg') data.cfg = m._cfg;
    else if(m.sk === 'overview') data.cfg = {regs:m.regs.slice()};
    else {
      var deck = getRec(m.deck);
      if(m.mode === 'snap'){ await loadHistory(deckNeedsHist(deck)); deck = getRec(deck.id) || deck; data.cfg = {deck:deck.id}; data.snap = await deckPubPayload(deck); }
      else { data.cfg = {deck:deck.id, regs:deckShareRegs(deck)}; data.media = await deckMedia(deck); }
    }
    await STORE.shareCreate(id, data, exp);
    m.busy = false; m.done = id; S.shares = null; renderModal();
  }catch(e){ m.busy = false; m.err = shareErr(e); renderModal(); }
}
function shareErr(e){ var s = String((e && (e.message || e.code)) || e || ''); if(/shares|share_get|share_freeze|PGRST20[25]|42P01|42883/.test(s)) return T('The database needs the updated structure: in Supabase open SQL Editor → New query, paste supabase/schema.sql and click Run once.', '数据库需要更新结构：在 Supabase 打开 SQL Editor → New query，粘贴 supabase/schema.sql 并点 Run（只需一次）。'); return errText(e); }
/* images a live presentation needs (logos, pictures placed on slides), embedded once when the link is made */
async function deckMedia(deck){
  var th = themeOf(deck), paths = [], out = {};
  [th.logoL, th.logoR].forEach(function(l){ if(l && l.path) paths.push(l.path); });
  (deck.d.slides || []).filter(function(s){ return !s.hidden; }).forEach(function(s){ (s.els || []).forEach(function(e){ if(e && e.path) paths.push(e.path); }); });
  if(!paths.length) return out;
  if(STORE.signUrls) await STORE.signUrls(paths);
  for(var i = 0; i < paths.length; i++){ var u = STORE.fileUrl(paths[i]); if(u){ var src = await imgToData(u, 1600); if(src) out[paths[i]] = src; } }
  return out;
}

/* ---------------- manage (Settings → Public links) ---------------- */
function setLinks(){
  if(!canTeamEdit()) return '<div class="card empty">' + L('Only admins and editors manage public links.', '只有管理员和编辑可以管理公开链接。') + '</div>';
  if(S.shares == null && !S.sharesBusy){ S.sharesBusy = true; STORE.shareList().then(function(x){ S.shares = x || []; S.sharesErr = ''; }).catch(function(e){ S.shares = []; S.sharesErr = shareErr(e); }).then(function(){ S.sharesBusy = false; renderMain(); }); }
  var h = '<div class="card sec"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><p class="note" style="margin:0;max-width:760px">' + L('A public link opens a read-only page without signing in. It follows the Owner rules: registers published to the Owner show only records marked “Show in Owner plan”, and only External fields are listed. Make links from a register (⋯ menu), a presentation (Issue & share) or here.', '公开链接无需登录即可只读查看，规则与业主相同：发布给业主的台账只显示标记「显示于业主计划」的记录，只列出「对外」字段。可在台账（⋯ 菜单）、演示文稿（定稿与分享）或这里生成。') + '</p>' +
    '<button type="button" class="btn pri" data-act="shareOverview">' + uic('plus', 14) + ' ' + L('Progress overview link…', '进度总览链接…') + '</button></div></div>';
  if(S.sharesErr) h += '<div class="card" style="color:var(--warn);background:var(--warn-soft)">' + esc(S.sharesErr) + '</div>';
  if(S.shares == null) return h + '<div class="card empty">' + L('Loading…', '正在加载…') + '</div>';
  if(!S.shares.length) return h + '<div class="card empty">' + L('No public links yet.', '还没有公开链接。') + '</div>';
  var now = Date.now();
  return h + '<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>' + L('Title', '标题') + '</th><th>' + L('Content', '内容') + '</th><th>' + L('Data', '数据') + '</th><th>' + L('Made', '生成') + '</th><th>' + L('Status', '状态') + '</th><th>' + L('Views', '浏览') + '</th><th></th></tr></thead><tbody>' +
    S.shares.map(function(x){ var exp = x.expires_at && Date.parse(x.expires_at) <= now, st = x.revoked ? chip('red', L('Withdrawn', '已撤销')) : exp ? chip('grey', L('Expired', '已过期')) : chip('green', L('Active', '有效')) + (x.expires_at ? ' <span class="note">' + L('until ', '至 ') + esc(String(x.expires_at).slice(0, 10)) + '</span>' : '');
      var k = SHARE_KINDS[x.kind] || ['', ''], t = x.title && (x.title.en || x.title.zh) || '';
      if(+x.v !== SHARE_VER && !x.revoked) st = chip('grey', L('Old link — make a new one', '旧链接：请重新生成'));
      return '<tr><td><b>' + esc(t) + '</b></td><td>' + L(k[0], k[1]) + '</td><td>' + (x.mode === 'snap' ? L('Snapshot', '快照') + (x.snapAt ? ' <span class="note">' + esc(fmtTime(x.snapAt)) + '</span>' : '') : L('Live', '实时')) + '</td><td class="mono" style="white-space:nowrap">' + esc(String(x.created_at || '').slice(0, 10)) + '</td><td>' + st + '</td><td class="mono">' + (x.views || 0) + (x.last_view ? ' <span class="note">' + esc(fmtTime(x.last_view)) + '</span>' : '') + '</td><td style="white-space:nowrap">' +
        '<button type="button" class="btn sm" data-act="shareCopy" data-v="' + esc(x.id) + '">' + L('Copy link', '复制链接') + '</button> <a class="btn sm" href="' + esc(shareUrl(x.id)) + '" target="_blank" rel="noopener">' + L('Open', '打开') + '</a> ' +
        (x.mode === 'snap' && !x.revoked ? '<button type="button" class="btn sm" data-act="shareRefresh" data-v="' + esc(x.id) + '" title="' + esc(T('Replace the snapshot with the data as it is now', '用当前数据替换快照')) + '">' + L('Update snapshot', '更新快照') + '</button> ' : '') +
        '<button type="button" class="btn sm" data-act="shareRevoke" data-v="' + esc(x.id) + '">' + (x.revoked ? L('Restore', '恢复') : L('Withdraw', '撤销')) + '</button> ' +
        (S.shareDel === x.id ? '<button type="button" class="btn sm danger" data-act="shareDelYes" data-v="' + esc(x.id) + '">' + L('Confirm delete', '确认删除') + '</button>' : '<button type="button" class="btn sm danger-o" data-act="shareDel" data-v="' + esc(x.id) + '">' + L('Delete', '删除') + '</button>') + '</td></tr>'; }).join('') + '</tbody></table></div>';
}
async function shareRefresh(id){
  var x = (S.shares || []).filter(function(s){ return s.id === id; })[0]; if(!x) return;
  try{
    if(x.kind === 'deck'){ var deck = getRec(x.cfg && x.cfg.deck); if(!deck){ toast(T('The presentation no longer exists.', '该演示文稿已不存在。')); return; } if((deck.d.aud || 'owner') === 'internal'){ toast(T('Switch the presentation to Owner mode first.', '请先把文稿切换为业主模式。')); return; }
      toast(T('Preparing…', '正在准备…')); await loadHistory(deckNeedsHist(deck)); deck = getRec(deck.id) || deck; await STORE.shareSetSnap(id, await deckPubPayload(deck)); }
    else {
      /* a register view: the records matching its filter now */
      if(x.kind === 'reg'){ var c = x.cfg || {}, reg = getReg(c.reg); if(!reg){ toast(T('The register no longer exists.', '该台账已不存在。')); return; }
        var fl = Object.assign({q:'', fx:{}, from:'', to:'', od:false, star:false, ext:false, node:'all'}, c.filter || {});
        await STORE.shareSetCfg(id, Object.assign({}, c, {ids:recsOf(reg.id).filter(function(r){ return matchRec(reg, r, fl); }).map(function(r){ return r.id; })})); }
      await STORE.shareFreeze(id);
    }
    toast(T('Snapshot updated', '快照已更新')); S.shares = null; renderMain();
  }catch(e){ toast(shareErr(e)); }
}
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act^="share"]'); if(!el) return;
  var act = el.dataset.act, v = el.dataset.v, m = S.modal;
  if(act === 'shareCopy'){ var u = shareUrl(v); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function(){ toast(T('Link copied', '链接已复制')); }).catch(function(){ var i = $('#shareUrl'); if(i){ i.select(); try{ document.execCommand('copy'); toast(T('Link copied', '链接已复制')); }catch(er){} } else prompt('', u); }); return; }
  if(act === 'shareMode' && m){ m.mode = v; renderModal(); return; }
  if(act === 'shareCreate'){ var ti = $('#shareTitle'), ex = $('#shareExp'); if(m){ if(ti) m.title = ti.value; if(ex) m.exp = ex.value; } shareCreate(); return; }
  if(act === 'shareManage'){ closeModal(); S.page = 'settings'; S.stab = 'links'; renderAll(); return; }
  if(act === 'shareOverview'){ openShareNew({sk:'overview'}); return; }
  if(act === 'shareReg'){ openShareNew({sk:'reg', reg:v}); return; }
  if(act === 'shareDeck'){ closePop(); openShareNew({sk:'deck', deck:v}); return; }
  if(act === 'shareRefresh'){ shareRefresh(v); return; }
  if(act === 'shareRevoke'){ var x = (S.shares || []).filter(function(s){ return s.id === v; })[0]; if(!x) return; STORE.shareUpdate(v, {revoked:!x.revoked}).then(function(){ toast(x.revoked ? T('Link restored', '链接已恢复') : T('Link withdrawn — it no longer opens', '链接已撤销，无法再打开')); S.shares = null; renderMain(); }).catch(function(er){ toast(shareErr(er)); }); return; }
  if(act === 'shareDel'){ S.shareDel = v; renderMain(); return; }
  if(act === 'shareDelYes'){ S.shareDel = null; STORE.shareDelete(v).then(function(){ toast(T('Link deleted', '链接已删除')); S.shares = null; renderMain(); }).catch(function(er){ toast(shareErr(er)); }); return; }
});
document.addEventListener('change', function(e){
  var el = e.target; if(!el || !el.dataset) return; var m = S.modal;
  if(el.dataset.shreg && m && m.kind === 'shareNew'){ var id = el.dataset.shreg, i = m.regs.indexOf(id); if(el.checked && i < 0) m.regs.push(id); if(!el.checked && i >= 0) m.regs.splice(i, 1); var ti = $('#shareTitle'); if(ti) m.title = ti.value; renderModal(); }
  if(el.id === 'shareExp' && m) m.exp = el.value;
});
document.addEventListener('input', function(e){ var el = e.target; if(el && el.id === 'shareTitle' && S.modal && S.modal.kind === 'shareNew') S.modal.title = el.value; });

/* ================= the public page ================= */
function PublicStore(token, fetcher){
  var api = {
    mode:'public', ready:false, rt:'public', me:{id:'', email:'', name:'', role:'public'}, users:[], regs:[], recs:[], cfg:{}, audit:[], pubs:[], fb:[], share:null, fail:false,
    loadAudit:function(){ return Promise.resolve([]); }, fileUrl:function(){ return null; }, signUrls:function(){ return Promise.resolve(); }, saveCfg:function(){ return Promise.resolve(); },
    init:function(){
      return Promise.resolve().then(function(){ return fetcher(token); }).then(function(res){
        api.share = res || null;
        if(res && res.data){ var d = res.data, src = d.mode === 'live' ? d.live : (d.kind === 'deck' ? null : d.snap);
          if(src){ api.regs = src.regs || []; api.recs = src.recs || []; api.cfg = src.cfg || {}; }
          else api.cfg = d.cfgProject || {}; }
        api.ready = true; notify();
      }).catch(function(e){ console.error(e); api.fail = true; api.ready = true; notify(); });
    }
  };
  return api;
}
function startPublic(token, C){
  var fetcher;
  if(C.supabaseUrl && C.supabaseKey && window.supabase){
    var sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false}});
    fetcher = function(t){ return sb.rpc('share_get', {p_token:t}).then(function(r){ if(r.error) throw r.error; return r.data; }); };
  } else fetcher = function(t){ return DemoStore().shareGet(t); };
  STORE = PublicStore(token, fetcher); S.pub = {q:'', node:'all', grp:true}; renderAll(); STORE.init();
}
/* leaving or switching a link: start over */
window.addEventListener('hashchange', function(){ var pub = /^#s=/.test(location.hash || ''); if(pub || (STORE && STORE.mode === 'public')) location.reload(); });

function pubTitle(d){ return d && d.title ? (S.lang === 'zh' ? d.title.zh || d.title.en : d.title.en || d.title.zh) || '' : ''; }
function renderPublic(){
  document.body.classList.add('gate', 'pubv');
  var sh = STORE.share, d = sh && sh.data, c = cfg();
  $('#top').innerHTML = '<div class="brand"><b>' + esc(c.projectEn || 'work-web') + '</b><span>' + esc(c.projectZh || '') + '</span></div>' +
    '<div class="tools"><span class="sync"><span class="dot live"></span><span class="stx">' + (d ? (d.mode === 'live' ? L('Read-only · live', '只读 · 实时') : L('Read-only · snapshot ', '只读 · 快照 ') + esc(fmtTime(d.snapAt || d.at || sh.created_at))) : L('Read-only', '只读')) + '</span></span>' +
    '<div class="seg">' + [['en', 'EN'], ['both', 'EN + 中'], ['zh', '中']].map(function(o){ return '<button type="button" data-act="lang" data-v="' + o[0] + '"' + (S.lang === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>'; }).join('') + '</div></div>';
  $('#side').innerHTML = '';
  var m = $('#main'), h;
  if(!STORE.ready) h = '<div class="card empty">' + L('Loading…', '正在加载…') + '</div>';
  else if(STORE.fail) h = '<div class="card empty">' + L('This page could not be loaded. Check the connection and reload.', '页面无法加载，请检查网络后重新整理。') + '</div>';
  else if(!d) h = '<div class="card empty pub-gone"><h1 class="vtitle">' + L('This link is not available', '此链接无法打开') + '</h1><p>' + L('It may have expired or been withdrawn. Ask the person who sent it for a new link.', '链接可能已过期或已被撤销，请向发送者索取新链接。') + '</p></div>';
  else { try{ h = d.kind === 'reg' ? pubRegView(d) : d.kind === 'deck' ? pubDeckView(d) : pubOverview(d); }catch(e){ console.error(e); h = '<div class="card empty">' + L('This page could not be shown.', '页面无法显示。') + '</div>'; } }
  m.innerHTML = h;
  document.title = (pubTitle(d) ? pubTitle(d) + ' · ' : '') + (c.projectEn || 'work-web');
  vwAfterRender(); fitSlides();
}
function pubHead(d, sub, tools){ return '<div class="ph"><div><h1 class="vtitle">' + esc(pubTitle(d) || T('Shared page', '共享页面')) + '</h1>' + (sub ? '<span class="muted">' + sub + '</span>' : '') + '</div>' + (tools ? '<div class="pha">' + tools + '</div>' : '') + '</div>'; }

/* a register view: search, package filter, grouped by package */
function pubRegView(d){
  var c = d.cfg || {}, reg = getReg(c.reg) || getReg((c.regs || [])[0]); if(!reg || !SHARE_ID.test(reg.id)) return pubHead(d) + '<div class="card empty">' + L('Nothing to show.', '没有可显示的内容。') + '</div>';
  var ro = rolesOf(reg), tf = ro.tree && fieldOf(reg, ro.tree), P = S.pub;
  var base = recsOf(reg.id);   /* the database already applied the publisher's filter */
  var list = base.filter(function(r){ return (!P.q || matchRec(reg, r, {q:P.q, fx:{}, node:'all'})) && (P.node === 'all' || !tf || (treeDesc(tf, P.node))[r.d[tf.key]]); });
  list = sortRecs(reg, list);
  var cols = (c.cols && c.cols.length ? c.cols : dataFields(reg).map(function(f){ return f.key; })).map(function(k){ return fieldOf(reg, k); }).filter(Boolean); if(!cols.some(function(f){ return f.key === ro.title; }) && fieldOf(reg, ro.title)) cols.unshift(fieldOf(reg, ro.title)); if(ro.no && fieldOf(reg, ro.no) && !cols.some(function(f){ return f.key === ro.no; })) cols.unshift(fieldOf(reg, ro.no));
  var chips = '';
  if(tf){ var top = treeKids(tf, ''), cnt = function(n){ var s = treeDesc(tf, n.id); return base.filter(function(r){ return s[r.d[tf.key]]; }).length; };
    chips = '<div class="pub-chips"><button type="button" class="fbtn' + (P.node === 'all' ? ' on' : '') + '" data-act="pubNode" data-v="all">' + L('All', '全部') + ' <b>' + base.length + '</b></button>' + top.map(function(n){ var k = cnt(n); return k ? '<button type="button" class="fbtn' + (P.node === n.id ? ' on' : '') + '" data-act="pubNode" data-v="' + esc(n.id) + '">' + esc(treeLabel(n)) + ' <b>' + k + '</b></button>' : ''; }).join('') + '</div>'; }
  var rows = [], span = cols.length;
  function row(r){ return '<tr>' + cols.map(function(f){ var v = f.key === ro.title ? '<span class="tt1">' + esc(recTitle(reg, r) || '—') + '</span>' + (recTitle2(reg, r) ? '<span class="tt2">' + esc(recTitle2(reg, r)) + '</span>' : '') : cellHtml(reg, f, r); return '<td class="t-' + esc(f.type) + (f.key === ro.title ? ' tt' : '') + '">' + v + '</td>'; }).join('') + '</tr>'; }
  if(tf && P.grp){ var gs = groupRecs(reg, list, tf.key); gs.forEach(function(g){ rows.push('<tr class="grp"><td colspan="' + span + '"><b>' + esc(g.label) + '</b> <span class="muted mono">' + g.items.length + '</span></td></tr>'); g.items.forEach(function(r){ rows.push(row(r)); }); }); }
  else list.forEach(function(r){ rows.push(row(r)); });
  if(!list.length) rows.push('<tr><td colspan="' + span + '" class="empty">' + L('No records match.', '没有符合条件的记录。') + '</td></tr>');
  var key = 'pub:' + reg.id, long = rows.length > VW_MIN;
  var cg = long ? '<colgroup>' + cols.map(function(f){ return '<col style="width:' + colWidth(reg, f) + 'px">'; }).join('') + '</colgroup>' : '';
  return pubHead(d, esc(regName(reg)) + ' · ' + L(list.length + ' of ' + base.length + ' records', '显示 ' + list.length + ' / ' + base.length + ' 条')) +
    '<div class="card pub-bar"><label class="gsearch">' + uic('search', 15) + '<input id="pubq" data-fk="pubq" type="search" placeholder="' + esc(T('Search', '搜索')) + '" value="' + esc(P.q) + '"></label>' + (tf ? '<label class="chk"><input type="checkbox" id="pubgrp"' + (P.grp ? ' checked' : '') + '>' + L('Group by ' + tf.en, '按' + (tf.zh || tf.en) + '分组') + '</label>' : '') + '</div>' + chips +
    '<div class="card tbl-wrap"' + (long ? ' data-vw="' + esc(key) + '"' : '') + '><table class="tbl' + (long ? ' vwt' : '') + '">' + cg + '<thead><tr>' + cols.map(function(f){ return '<th>' + L(f.en, f.zh) + '</th>'; }).join('') + '</tr></thead><tbody data-vwb="' + esc(key) + '">' + vwHtml(key, rows, 'tr', span) + '</tbody></table></div>';
}

/* a presentation: snapshot (frozen figures) or live (built now from the public copy) */
function pubDeckPages(d){
  if(d.mode === 'snap' && d.snap) return pubPages(d.snap).map(function(p){ return {sid:p.sid, html:p.html}; });
  var dk = d.deck; if(!dk) return [];
  var deck = clone(dk), media = d.media || {}, th = deck.d.theme || {};
  ['logoL', 'logoR'].forEach(function(k){ var l = th[k]; if(l && l.path) th[k] = media[l.path] ? {src:media[l.path]} : null; });
  (deck.d.slides || []).forEach(function(s){ (s.els || []).forEach(function(e){ if(e.path){ e.src = media[e.path] || null; delete e.path; } }); });
  deck.d.status = 'draft'; deck.d.aud = 'owner';
  (d.cfg && d.cfg.regs || []).forEach(function(id){ HIST[id] = {rows:[], at:Date.now() + 864e5}; });
  return deckPages(deck);
}
function pubDeckView(d){
  var pages = pubDeckPages(d); S.pubPages = pages;
  var sub = d.mode === 'snap' && d.snap ? esc([d.snap.deckNo, d.snap.date, d.snap.presenter].filter(Boolean).join(' · ')) : esc([d.deck && d.deck.d.no, d.deck && d.deck.d.date].filter(Boolean).join(' · '));
  return pubHead(d, sub, pages.length ? '<button type="button" class="btn pri" data-act="pubPres">' + uic('present', 14) + ' ' + L('Present', '演示') + '</button><button type="button" class="btn" data-act="pubPdf">' + L('PDF', 'PDF') + '</button>' : '') +
    (pages.length ? '<div class="dk-olist">' + pages.map(function(p, i){ return '<section class="dk-opage">' + scaled(p.html, 'card') + '<div class="row dk-ofb"><span class="muted mono">' + (i + 1) + ' / ' + pages.length + '</span></div></section>'; }).join('') + '</div>' : '<div class="card empty">' + L('This presentation has no slides to show.', '此演示文稿没有可显示的页面。') + '</div>');
}

/* the progress overview: Owner-mode slides built from the chosen registers, empty ones left out */
function pubOverviewDeck(d){
  var ids = (d.cfg && d.cfg.regs) || [], regs = ids.map(getReg).filter(Boolean), slides = [];
  var withStatus = regs.filter(function(r){ return rolesOf(r).status; }), withDates = regs.filter(function(r){ return rolesOf(r).start || rolesOf(r).finish; });
  if(withStatus.length) slides.push(newSlide('kpi', {regs:withStatus.map(function(r){ return r.id; })}, {en:'Key figures', zh:'关键数字'}));
  if(withDates.length) slides.push(newSlide('timeline', {regs:withDates.map(function(r){ return r.id; }), only:'ms', lanes:'reg', months:6, back:1}, {en:'Key milestones', zh:'关键里程碑'}));
  regs.forEach(function(r){ var ro = rolesOf(r);
    if((ro.start || ro.finish) && r.d.kind !== 'library') slides.push(newSlide('gantt', {regs:[r.id], only:'all', lanes:ro.tree ? 'tree' : 'reg', months:0, base:true}, {en:(r.d.en || '') + ' – programme', zh:(r.d.zh || r.d.en || '') + ' – 进度计划'}));
    if(ro.block && (ro.tree || (r.d.matrix && r.d.matrix.row)) && ro.progress) slides.push(newSlide('matrix', {reg:r.id}, {en:(r.d.en || '') + ' – progress by block', zh:(r.d.zh || r.d.en || '') + ' – 区域进度'}));
    if(ro.status && (ro.tree || ro.block)) slides.push(newSlide('breakdown', {reg:r.id, by:ro.tree || ro.block}, {en:(r.d.en || '') + ' – status', zh:(r.d.zh || r.d.en || '') + ' – 状态分布'})); });
  ids.forEach(function(id){ HIST[id] = {rows:[], at:Date.now() + 864e5}; });
  return {id:'pub-overview', d:{title:pubTitle(d), date:n2d(asOfN()), lang:d.lang || 'en', aud:'owner', status:'draft', theme:{style:'sheet'}, slides:slides}};
}
function pubOverview(d){
  var deck = pubOverviewDeck(d), pages = [];
  deckBuild(deck).forEach(function(x){ var dt = x.data || {}; if(dt.err || dt.loading) return; x.pages.forEach(function(h){ pages.push({sid:x.s.id, html:h}); }); });
  S.pubPages = pages;
  return pubHead(d, L('As of ', '截至 ') + esc(n2d(asOfN())), pages.length ? '<button type="button" class="btn pri" data-act="pubPres">' + uic('present', 14) + ' ' + L('Present', '演示') + '</button><button type="button" class="btn" data-act="pubPdf">' + L('PDF', 'PDF') + '</button>' : '') +
    (pages.length ? '<div class="dk-olist">' + pages.map(function(p){ return '<section class="dk-opage">' + scaled(p.html, 'card') + '</section>'; }).join('') + '</div>' : '<div class="card empty">' + L('Nothing to show yet.', '暂无可显示的内容。') + '</div>');
}
document.addEventListener('click', function(e){
  if(!STORE || STORE.mode !== 'public') return;
  var el = e.target.closest && e.target.closest('[data-act^="pub"]'); if(!el) return;
  var act = el.dataset.act, d = STORE.share && STORE.share.data;
  if(act === 'pubNode'){ S.pub.node = el.dataset.v; VW = {}; renderPublic(); }
  else if(act === 'pubPres' && S.pubPages && S.pubPages.length) startPresent(S.pubPages.map(function(p){ return {sid:p.sid, html:p.html}; }), 0, pubTitle(d));
  else if(act === 'pubPdf' && S.pubPages) exportPdf(function(){ return S.pubPages; }, pubTitle(d) || 'Shared');
});
document.addEventListener('input', function(e){ if(!STORE || STORE.mode !== 'public') return; var el = e.target; if(el && el.id === 'pubq'){ S.pub.q = el.value; VW = {}; clearTimeout(S.pubT); S.pubT = setTimeout(function(){ var fk = focusKey(document.activeElement); renderPublic(); restoreFocus(fk); }, 150); } });
document.addEventListener('change', function(e){ if(!STORE || STORE.mode !== 'public') return; var el = e.target; if(el && el.id === 'pubgrp'){ S.pub.grp = el.checked; VW = {}; renderPublic(); } });
