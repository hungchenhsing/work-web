/* work-web v2 · model: lookups, field values, filters, grouping, undo, migration from v1, demo data. */
'use strict';

var STORE = null;
function role(){ return (STORE && STORE.me && STORE.me.role) || 'none'; }
function myId(){ return (STORE && STORE.me && STORE.me.id) || ''; }
function isInternal(){ return ['admin','editor','viewer'].indexOf(role()) >= 0; }
function canTeamEdit(){ return role() === 'admin' || role() === 'editor'; }
/* ---------- lookup indexes ----------
   DATA_VER goes up on every data change (notify() bumps it synchronously, right after the store mutates), so lookups
   are rebuilt once per change instead of scanning all records on every call. */
var DATA_VER = 0, IX = {ver:-1};
/* REC_VER moves on every change except edits to a presentation itself (deckEdit sets DECK_ONLY), so slide data can be cached */
var REC_VER = 0, DECK_ONLY = false;
function ix(){
  var recs = (STORE && STORE.recs) || [], regs = (STORE && STORE.regs) || [], c = STORE && STORE.cfg;
  if(IX.ver === DATA_VER && IX.recs === recs && IX.n === recs.length && IX.regs === regs && IX.rn === regs.length && IX.cfg === c) return IX;
  var byId = new Map(), byReg = new Map(), regById = new Map();
  for(var i = 0; i < recs.length; i++){ var r = recs[i]; byId.set(r.id, r); var a = byReg.get(r.reg); if(!a){ a = []; byReg.set(r.reg, a); } a.push(r); }
  for(var j = 0; j < regs.length; j++) regById.set(regs[j].id, regs[j]);
  IX = {ver:DATA_VER, recs:recs, n:recs.length, regs:regs, rn:regs.length, cfg:c, byId:byId, byReg:byReg, regById:regById, memo:{}};
  return IX;
}
function memo(key, fn){ var x = ix(); if(!(key in x.memo)) x.memo[key] = fn(); return x.memo[key]; }
function cfgBase(){ return memo('cfg', function(){ var c = (STORE && STORE.cfg) || {}, o = {}; for(var k in DEF_CFG) o[k] = (c[k] !== undefined && c[k] !== null ? c[k] : clone(DEF_CFG[k])); return o; }); }
function cfg(){ return Object.assign({}, cfgBase()); }
function lists(){ return Object.assign({}, memo('lists', function(){ var l = cfgBase().lists || {}, o = {}; Object.keys(DEF_LISTS).forEach(function(k){ o[k] = l[k] || clone(DEF_LISTS[k]); }); Object.keys(l).forEach(function(k){ o[k] = l[k]; }); return o; })); }

/* registers */
function allRegs(){
  return memo('allRegs', function(){ var order = cfgBase().regOrder || [], regs = ((STORE && STORE.regs) || []).filter(function(r){ return r.d.kind !== 'decks' && r.d.kind !== 'snaps' && r.d.kind !== 'library'; });
    regs.sort(function(a, b){ var ia = order.indexOf(a.id), ib = order.indexOf(b.id); if(ia < 0) ia = 999; if(ib < 0) ib = 999; return ia - ib || String(a.d.en || '').localeCompare(String(b.d.en || '')); });
    return regs; }).slice();
}
function getReg(id){ var r = ix().regById.get(id); if(r) return r; return ((STORE && STORE.regs) || []).filter(function(x){ return x.id === id; })[0] || null; }
function allRecs(){ return (STORE && STORE.recs) || []; }
function recsOf(regId){ var a = ix().byReg.get(regId); return a ? a.slice() : []; }
function getRec(id){ if(id == null) return null; var r = ix().byId.get(id); if(r && r.id === id) return r; for(var i = 0, a = allRecs(); i < a.length; i++) if(a[i].id === id){ IX.ver = -1; return a[i]; } return null; }
function isPrivate(reg){ return reg && reg.vis === 'private'; }
function canWrite(reg){ if(!reg) return false; if(reg.vis === 'private') return reg.owner === myId(); return canTeamEdit(); }
function canDeleteReg(reg){ if(!reg) return false; if(reg.vis === 'private') return reg.owner === myId(); return role() === 'admin'; }
function canCreateReg(){ return canTeamEdit() || role() === 'viewer'; }
function regName(reg){ return reg ? T1(reg.d.en, reg.d.zh) : ''; }
function regNameL(reg){ return reg ? L(reg.d.en || '', reg.d.zh || '') : ''; }

/* fields */
function fieldsOf(reg){ return (reg && reg.d.fields) || []; }
function dataFields(reg){ return fieldsOf(reg).filter(function(f){ return f.type !== 'section'; }); }
function fieldOf(reg, key){ return fieldsOf(reg).filter(function(f){ return f.key === key; })[0] || null; }
/* registers whose records reach the Owner only when marked “Show in Owner plan” (ext): published registers and the document library */
function ownerGated(reg){ return !!reg && (!!reg.d.ownerPublish || reg.d.kind === 'library'); }
function rolesOf(reg){ return (reg && reg.d.roles) || {}; }
function rf(reg, roleName){ var k = rolesOf(reg)[roleName]; return k ? fieldOf(reg, k) : null; }
function optsOf(f){ if(!f) return []; if(f.list){ var l = lists()[f.list]; return (l && l.opts) || []; } return f.opts || []; }
function optOf(f, v){ return optsOf(f).filter(function(o){ return o.v === v; })[0] || null; }
function treeNodes(f){ return (f && f.tree) || []; }
function treeNode(f, id){ return treeNodes(f).filter(function(n){ return n.id === id; })[0] || null; }
function treeKids(f, pid){ return treeNodes(f).filter(function(n){ return (n.parent || '') === (pid || ''); }); }
function treePath(f, id){ var out = [], n = treeNode(f, id), g = 0; while(n && g++ < 20){ out.unshift(n); n = n.parent ? treeNode(f, n.parent) : null; } return out; }
function treeDesc(f, id){ var set = {}; (function w(x){ set[x] = 1; treeKids(f, x).forEach(function(k){ w(k.id); }); })(id); return set; }
function treeDfs(f, cb){ (function w(pid, d){ treeKids(f, pid).forEach(function(n){ cb(n, d); w(n.id, d + 1); }); })('', 0); }
function treeLabel(n){ return n ? (n.code ? n.code + ' ' : '') + nm(n) : ''; }
function newKey(reg, base){ var k = slug(base) || 'field', i = 1, out = k; while(fieldOf(reg, out) || ['id','star','ext','base'].indexOf(out) >= 0){ out = k + '_' + (++i); } return out; }

/* values */
function num(v){ if(v === '' || v == null) return null; var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? null : n; }
function calcVal(op, a, b){
  if(op === 'days'){ var x = d2n(a), y = d2n(b); return x == null || y == null ? null : y - x; }
  a = num(a); b = num(b); if(a == null || b == null) return null;
  if(op === 'pct') return b ? Math.round(a / b * 1000) / 10 : null;
  if(op === 'sub') return a - b; if(op === 'add') return a + b; if(op === 'mul') return a * b; return null;
}
function val(rec, f){
  if(!rec || !f) return null;
  var d = rec.d || {};
  if(f.type === 'calc' && f.calc) return calcVal(f.calc.op, d[f.calc.a], d[f.calc.b]);
  if(f.type === 'percent' && f.auto){ var c = calcVal(f.auto.op || 'pct', d[f.auto.a], d[f.auto.b]); if(c != null) return clamp(c, 0, 100); }
  return d[f.key];
}
function isAutoNow(rec, f){ return f && f.type === 'percent' && f.auto && calcVal(f.auto.op || 'pct', rec.d[f.auto.a], rec.d[f.auto.b]) != null; }
function asArr(v){ return v == null || v === '' ? [] : Array.isArray(v) ? v : [v]; }
function textOf(reg, f, rec, raw){
  var v = raw !== undefined ? raw : val(rec, f);
  if(isEmpty(v)) return '';
  switch(f.type){
    case 'select': return asArr(v).map(function(x){ var o = optOf(f, x); return o ? nm(o) : x; }).join(', ');
    case 'tree': var n = treeNode(f, v); return n ? treeLabel(n) : '';
    case 'check': return v ? '✓' : '';
    case 'percent': return Math.round(+v) + '%';
    case 'number': return String(v) + (f.unit ? ' ' + f.unit : '');
    case 'calc': return (f.calc && f.calc.op === 'pct') ? v + '%' : String(v);
    case 'files': return asArr(v).map(function(x){ return x.name || ''; }).join(', ');
    case 'link': return asArr(v).map(function(id){ var r = getRec(id); return r ? recLabel(r) : ''; }).filter(Boolean).join(', ');
    case 'sub': return asArr(v).length + ' ' + T('rows', '行');
    default: return String(v);
  }
}
function recTitle(reg, rec){ var r = rolesOf(reg), a = r.title ? rec.d[r.title] : '', b = r.title2 ? rec.d[r.title2] : ''; if(S.lang === 'zh') return b || a || ''; return a || b || ''; }
function recTitle2(reg, rec){ var r = rolesOf(reg); if(S.lang !== 'both') return ''; var a = r.title ? rec.d[r.title] : '', b = r.title2 ? rec.d[r.title2] : ''; return a && b ? b : ''; }
function recNo(reg, rec){ var k = rolesOf(reg).no; return k ? (rec.d[k] || '') : ''; }
function recLabel(rec){ var reg = getReg(rec.reg); if(!reg) return ''; var n = recNo(reg, rec); return (n ? n + ' · ' : '') + (recTitle(reg, rec) || T('Untitled', '未命名')); }
function planOf(reg, rec){
  var r = rolesOf(reg), s = r.start ? d2n(rec.d[r.start]) : null, f = r.finish ? d2n(rec.d[r.finish]) : null;
  if(s == null) s = f; if(f == null) f = s; if(s == null) return null;
  if(f < s){ var t = s; s = f; f = t; } return {s:s, f:f};
}
function statusOpt(reg, rec){ var f = rf(reg, 'status'); return f ? optOf(f, rec.d[f.key]) : null; }
function isDone(reg, rec){ var o = statusOpt(reg, rec); return !!(o && o.done); }
function progressOf(reg, rec, noRoll){ var f = rf(reg, 'progress'); var v = f ? num(val(rec, f)) : null; if(v == null){ if(isDone(reg, rec)) return 100; if(!noRoll){ var ru = rollup(reg, rec); if(ru) return ru.pct; } return statusOpt(reg, rec) ? 0 : null; } return clamp(v, 0, 100); }
function asOfN(){ var a = S.asOfLocal || cfg().asOf; return d2n(a) != null ? d2n(a) : TODAY; }
function isOverdue(reg, rec){ if(isDone(reg, rec)) return false; var p = planOf(reg, rec); return !!p && p.f < asOfN(); }
function isMilestone(reg, rec){ if(reg && reg.d.allMs) return true; if(rec.d.ms) return true; var f = rf(reg, 'kind'); if(!f) return false; var o = optOf(f, rec.d[f.key]); return !!(o && o.ms); }
function blocksOf(reg, rec){ var f = rf(reg, 'block'); return f ? asArr(rec.d[f.key]) : []; }
function openFb(id){ return ((STORE && STORE.fb) || []).filter(function(f){ return f.item_id === id && f.status === 'open'; }).length; }

/* sub-items (a record can hold child records, e.g. a drawing list under one as-built package) */
function kidsIndex(regId){ return memo('kids:' + regId, function(){ var m = {}; (ix().byReg.get(regId) || []).forEach(function(r){ var p = r.d.parent; if(p && p !== r.id) (m[p] = m[p] || []).push(r); }); return m; }); }
function childrenOf(rec){ return (kidsIndex(rec.reg)[rec.id] || []).slice(); }
function parentRec(rec){ return rec && rec.d.parent && rec.d.parent !== rec.id ? getRec(rec.d.parent) : null; }
function depthOf(rec){ var d = 0, p = parentRec(rec), g = 0; while(p && g++ < 10){ d++; p = parentRec(p); } return d; }
function descendantsOf(rec){ var out = [], idx = kidsIndex(rec.reg); (function w(id, g){ if(g > 10) return; (idx[id] || []).forEach(function(k){ out.push(k); w(k.id, g + 1); }); })(rec.id, 0); return out; }
function rollup(reg, rec, kids){
  kids = kids || childrenOf(rec); if(!kids.length) return null;
  var done = kids.filter(function(k){ return isDone(reg, k); }).length, ps = kids.map(function(k){ return progressOf(reg, k); }).filter(function(x){ return x != null; });
  var pctv = ps.length ? Math.round(ps.reduce(function(s, x){ return s + x; }, 0) / ps.length) : Math.round(done / kids.length * 100);
  return {n:kids.length, done:done, pct:pctv};
}
function nextChildNo(reg, parent){
  var k = rolesOf(reg).no; if(!k) return ''; var base = parent.d[k]; if(!base) return nextNo(reg);
  var max = 0, re = new RegExp('^' + String(base).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-(\\d+)$');
  recsOf(reg.id).forEach(function(r){ var m = re.exec(r.d[k] || ''); if(m) max = Math.max(max, +m[1]); });
  return base + '-' + String(max + 1).padStart(2, '0');
}
function childData(reg, parent, extra){
  var d = {parent:parent.id}, ro = rolesOf(reg);
  if(ro.no) d[ro.no] = nextChildNo(reg, parent);
  [ro.tree, ro.block, 'dept', 'disc', 'contacts', 'resp', 'subcon', 'type', 'wbs', 'cat'].forEach(function(k){ if(k && parent.d[k] !== undefined && fieldOf(reg, k)) d[k] = clone(parent.d[k]); });
  var sf = rf(reg, 'status'); if(sf && optsOf(sf)[0]) d[sf.key] = optsOf(sf)[0].v;
  return Object.assign(d, extra || {});
}
function splitLine(line, reg){
  var ro = rolesOf(reg), parts = line.split(/\t| {2,}| \| /).map(function(s){ return s.trim(); }).filter(Boolean), o = {};
  var codeKey = fieldOf(reg, 'docNo') ? 'docNo' : null;
  if(parts.length === 1 && codeKey){ var mm = /^([A-Za-z0-9]+[-_.\/][\w.\-\/]*\d[\w.\-\/]*)\s+(.+)$/.exec(parts[0]); if(mm) parts = [mm[1], mm[2]]; }
  if(parts.length >= 2 && codeKey && /^[A-Za-z0-9][\w.\-\/]*$/.test(parts[0]) && /\d/.test(parts[0])){ o[codeKey] = parts.shift(); }
  parts = [].concat.apply([], parts.map(function(p){ var mm = /^(.*?[A-Za-z0-9)\]])\s+([一-鿿].*)$/.exec(p); return mm && /[A-Za-z]{3,}/.test(mm[1]) && !/[A-Za-z]{3,}/.test(mm[2]) ? [mm[1], mm[2]] : [p]; }));
  parts.forEach(function(p){ var zh = /[一-鿿]/.test(p) && !/[A-Za-z]{3,}/.test(p); if(zh && ro.title2 && !o[ro.title2]) o[ro.title2] = p; else if(ro.title && !o[ro.title]) o[ro.title] = p; else if(ro.title) o[ro.title] += ' / ' + p; });
  return o;
}
function addChildren(reg, parent, lines){
  var arr = [], used = {}, k = rolesOf(reg).no;
  lines.forEach(function(line){ line = String(line || '').trim(); if(!line) return; var d = childData(reg, parent, splitLine(line, reg));
    if(k){ while(used[d[k]] || recsOf(reg.id).some(function(r){ return r.d[k] === d[k]; })){ var m = /-(\d+)$/.exec(d[k]); d[k] = d[k].replace(/-(\d+)$/, '-' + String((m ? +m[1] : 0) + 1).padStart(2, '0')); } used[d[k]] = 1; }
    arr.push({id:uid('r'), reg:reg.id, d:d}); });
  if(!arr.length) return Promise.resolve(0);
  return STORE.createRecs(arr).then(function(res){ return res.ok; });
}

/* numbering */
function nextNo(reg){
  var k = rolesOf(reg).no; if(!k) return '';
  var pre = String(reg.d.prefix || 'REC').toUpperCase(), max = 0, re = new RegExp('^' + pre.replace(/[^A-Z0-9]/g, '') + '-(\\d+)$', 'i');
  recsOf(reg.id).forEach(function(r){ var m = re.exec(r.d[k] || ''); if(m) max = Math.max(max, +m[1]); });
  return pre + '-' + String(max + 1).padStart(3, '0');
}
function blankData(reg, extra){
  var d = {}, r = rolesOf(reg);
  if(r.no) d[r.no] = nextNo(reg);
  var sf = rf(reg, 'status'); if(sf && optsOf(sf)[0]) d[sf.key] = optsOf(sf)[0].v;
  return Object.assign(d, extra || {});
}

/* writes with change log + quick undo */
function setRec(rec, patch, opts){
  var reg = getReg(rec.reg); if(!canWrite(reg)) return Promise.resolve();
  var old = {}, changed = {};
  Object.keys(patch).forEach(function(k){ if(!same(rec.d[k], patch[k])){ old[k] = rec.d[k] === undefined ? null : clone(rec.d[k]); changed[k] = patch[k]; } });
  var sf = rf(reg, 'status'), pf = rf(reg, 'progress');
  if(sf && changed[sf.key] !== undefined && pf && pf.type === 'percent' && !isAutoNow(rec, pf)){ var o = optOf(sf, changed[sf.key]); if(o && o.done && num(rec.d[pf.key]) !== 100){ old[pf.key] = rec.d[pf.key] === undefined ? null : rec.d[pf.key]; changed[pf.key] = 100; } }
  if(!Object.keys(changed).length) return Promise.resolve();
  var p = STORE.patchRec(rec.id, changed);
  if(!(opts && opts.silent)){ S.lastUndo = {id:rec.id, old:old}; toast(T('Saved', '已保存'), {act:'quickUndo', label:T('Undo', '撤销')}); }
  return p.catch(function(){});
}
function quickUndo(){ var u = S.lastUndo; if(!u) return; var rec = getRec(u.id); S.lastUndo = null; if(rec) STORE.patchRec(rec.id, u.old).then(function(){ toast(T('Undone', '已撤销')); }).catch(function(e){ toast(errText(e)); }); }
function createRec(reg, extra, open){
  if(!canWrite(reg)) return Promise.resolve(null);
  var id = uid('r'), d = blankData(reg, extra);
  return STORE.createRec({id:id, reg:reg.id, d:d}).then(function(){ if(open !== false){ S.open = id; S.dtab = 'details'; renderDrawer(); } return id; }).catch(function(e){ toast(errText(e)); return null; });
}

/* undo any change-log row */
function auditUndoable(a){
  var reg = getReg(a.register_id);
  if(a.action === 'reg_delete') return a.actor === myId() || STORE.mode === 'demo';
  if(!reg) return false;
  if(a.action === 'reg_insert') return false;
  return canWrite(reg);
}
async function undoAudit(a){
  try{
    if(a && a._light){ var full = await STORE.auditRow(a.id); if(!full){ toast(T('That change could not be found.', '找不到这条修改记录。')); return; } a = full; }
    if(a.action === 'update'){
      var rec = getRec(a.record_id); if(!rec){ toast(T('That record no longer exists.', '该记录已不存在。')); return; }
      var cur = pick(rec.d, a.keys || []), conflict = (a.keys || []).filter(function(k){ return !same(cur[k], (a.new || {})[k]); });
      if(conflict.length && !confirm(T('These fields were changed again since: ', '以下字段之后又被修改过：') + conflict.join(', ') + '\n' + T('Undo anyway?', '仍要撤销吗？'))) return;
      await STORE.patchRec(rec.id, clone(a.old || {}));
    } else if(a.action === 'insert'){
      if(!getRec(a.record_id)){ toast(T('Already removed.', '已删除。')); return; }
      if(!confirm(T('Undo this addition (delete the record)?', '撤销这次新增（删除该记录）？'))) return;
      await STORE.deleteRec(a.record_id);
    } else if(a.action === 'delete'){
      if(!getReg(a.register_id)){ toast(T('Restore its register first.', '请先恢复所属台账。')); return; }
      await STORE.restoreRec({id:a.record_id, reg:a.register_id, d:clone(a.old || {})});
    } else if(a.action === 'reg_update'){
      var o = clone(a.old || {}), vis = o._visibility; delete o._visibility;
      var reg = getReg(a.register_id); if(!reg) return;
      var p = {}; Object.keys(Object.assign({}, reg.d, o)).forEach(function(k){ p[k] = o[k] === undefined ? null : o[k]; });
      await STORE.patchReg(a.register_id, p);
      if(vis && vis !== reg.vis) await STORE.setRegVis(a.register_id, vis);
    } else if(a.action === 'reg_delete'){
      var od = clone(a.old || {}), v2 = od._visibility || 'team'; delete od._visibility;
      await STORE.restoreReg({id:a.register_id, vis:v2, d:od});
      var since = new Date(new Date(a.at).getTime() - 60000).toISOString();
      var rows = await STORE.loadAudit({reg:a.register_id, action:'delete', since:since, limit:5000});
      var back = rows.filter(function(x){ return x.action === 'delete' && x.record_id; }).map(function(x){ return {id:x.record_id, reg:a.register_id, d:x.old || {}}; });
      var seen = {}; back = back.filter(function(x){ if(seen[x.id]) return false; seen[x.id] = 1; return true; });
      if(back.length) await STORE.createRecs(back);
    }
    toast(T('Undone', '已撤销'));
  }catch(e){ toast(errText(e)); }
}

/* filters per register */
function rfil(regId){ return S.rf[regId] || (S.rf[regId] = {q:'', fx:{}, from:'', to:'', od:false, star:false, ext:false, node:'all'}); }
function filterFields(reg){ return dataFields(reg).filter(function(f){ return f.type === 'select' || f.type === 'check'; }); }
function matchRec(reg, rec, f, skipNode){
  f = f || rfil(reg.id);
  if(f.q){
    var q = f.q.toLowerCase(), hit = dataFields(reg).some(function(fd){ if(['files','sub','link'].indexOf(fd.type) >= 0) return false; return textOf(reg, fd, rec).toLowerCase().indexOf(q) >= 0; });
    if(!hit) return false;
  }
  for(var k in f.fx){ var want = f.fx[k]; if(!want || !want.length) continue; var fd = fieldOf(reg, k); if(!fd) continue;
    var have = fd.type === 'check' ? [rec.d[k] ? '1' : '0'] : asArr(rec.d[k]);
    if(!have.length && want.indexOf('__none') >= 0) continue;
    if(!have.some(function(x){ return want.indexOf(x) >= 0; })) return false; }
  if(f.from || f.to){ var p = planOf(reg, rec); if(!p) return false; if(f.from && p.f < d2n(f.from)) return false; if(f.to && p.s > d2n(f.to)) return false; }
  if(f.od && !isOverdue(reg, rec)) return false;
  if(f.star && !rec.d.star) return false;
  if(f.ext && !rec.d.ext) return false;
  if(!skipNode && f.node && f.node !== 'all'){ var tf = rf(reg, 'tree'); if(tf){ if(f.node === 'none'){ if(rec.d[tf.key] && treeNode(tf, rec.d[tf.key])) return false; } else if(!treeDesc(tf, f.node)[rec.d[tf.key]]) return false; } }
  return true;
}
function filteredRecs(reg){ var f = rfil(reg.id); return recsOf(reg.id).filter(function(r){ return matchRec(reg, r, f); }); }
function activeFilterCount(reg){ var f = rfil(reg.id), n = 0; for(var k in f.fx) if(f.fx[k] && f.fx[k].length) n++; return n + (f.q ? 1 : 0) + (f.from || f.to ? 1 : 0) + (f.od ? 1 : 0) + (f.star ? 1 : 0) + (f.ext ? 1 : 0) + (f.node && f.node !== 'all' ? 1 : 0); }

/* grouping */
function groupable(reg){ return dataFields(reg).filter(function(f){ return ['select','tree','check','date','text'].indexOf(f.type) >= 0; }); }
function groupKey(reg, rec, key){
  if(!key || key === 'none') return [{k:'all', label:'', o:0}];
  var f = fieldOf(reg, key); if(!f) return [{k:'all', label:'', o:0}];
  var v = rec.d[key];
  if(f.type === 'select'){
    var arr = asArr(v); if(!arr.length) return [{k:'_n', label:T('(empty)', '（空）'), o:1e9}];
    var opts = optsOf(f), x = arr[0], o = optOf(f, x);
    if(arr.length > 1 && f.list === 'blocks') return [{k:'_multi', label:T('Several blocks', '多区域'), o:9e8}];
    return [{k:'v:' + x, label: o ? nm(o) : x, color: o && o.color, o: o ? opts.indexOf(o) : 5e8, set:(function(){ var s = {}; s[key] = f.multi ? [x] : x; return s; })()}];
  }
  if(f.type === 'tree'){ var path = treePath(f, v), l1 = path[0]; if(!l1) return [{k:'_n', label:T('Unclassified', '未分类'), o:1e9}];
    var ord = 0, i = 0; treeDfs(f, function(n){ if(n.id === l1.id) ord = i; i++; }); var s1 = {}; s1[key] = l1.id; return [{k:'t:' + l1.id, label:treeLabel(l1), o:ord, set:s1}]; }
  if(f.type === 'check'){ var s2 = {}; s2[key] = !!v; return [{k:v ? 'y' : 'n', label: v ? T('Yes', '是') : T('No', '否'), o: v ? 0 : 1, set:s2}]; }
  if(f.type === 'date'){ var n = d2n(v); if(n == null) return [{k:'_n', label:T('No date', '无日期'), o:1e9}]; var mk = monthKey(n), ml = monthLabel(mk); return [{k:'m:' + mk, label:T1(ml.en, ml.zh), o:+mk.replace('-', '')}]; }
  var t = String(v || '').trim(); return [{k:'x:' + t, label: t || T('(empty)', '（空）'), o: t ? 0 : 1e9}];
}
function groupRecs(reg, list, key){
  var groups = [], gi = {};
  list.forEach(function(r){ var g = groupKey(reg, r, key)[0]; if(!gi[g.k]){ gi[g.k] = Object.assign({items:[]}, g); groups.push(gi[g.k]); } gi[g.k].items.push(r); });
  groups.sort(function(a, b){ return a.o - b.o || String(a.label).localeCompare(String(b.label)); });
  return groups;
}
function sortValue(reg, rec, key){
  var f = fieldOf(reg, key); if(!f) return '';
  var v = val(rec, f);
  if(f.type === 'number' || f.type === 'percent' || f.type === 'calc') return num(v) == null ? -1e15 : num(v);
  if(f.type === 'date') return d2n(v) == null ? 1e9 : d2n(v);
  if(f.type === 'select'){ var o = optOf(f, asArr(v)[0]); return o ? optsOf(f).indexOf(o) : 1e6; }
  if(f.type === 'tree'){ var ord = 1e6, i = 0; treeDfs(f, function(n){ if(n.id === v) ord = i; i++; }); return ord; }
  if(f.type === 'check') return v ? 0 : 1;
  var s = textOf(reg, f, rec), m = /^(\D*)(\d+)(.*)$/.exec(s);
  return m ? (m[1] + String(+m[2]).padStart(8, '0') + m[3]).toLowerCase() : s.toLowerCase();
}
function sortRecs(reg, list){
  var s = S.rs[reg.id] || {k: rolesOf(reg).no || '', d:1};
  if(!s.k) return list;
  return list.slice().sort(function(a, b){ var x = sortValue(reg, a, s.k), y = sortValue(reg, b, s.k); return (x < y ? -1 : x > y ? 1 : 0) * s.d; });
}

/* registers from templates */
function regFromTemplate(key, over){
  var t = clone(TEMPLATES[key] || TEMPLATES.blank);
  var d = {en:t.en, zh:t.zh, icon:t.icon, sec:t.sec, prefix:t.prefix, fields:t.fields, roles:t.roles, view:t.view, tpl:key,
    ownerPublish:!!t.ownerPublish, matrix:t.matrix || null, board:t.board || null, meeting:!!t.meeting, allMs:!!t.allMs};
  return {id:(over && over.id) || ('reg_' + key + '_' + Date.now().toString(36)), vis:(over && over.vis) || t.visibility || 'team', d:Object.assign(d, (over && over.d) || {})};
}

/* ---------------- v1 → v2 migration (runs once, by the admin) ---------------- */
function v1ToV2(v1){
  var oc = v1.cfg || {}, L2 = clone(DEF_LISTS);
  if(oc.areas && oc.areas.length) L2.blocks.opts = oc.areas.map(function(a){ return O(a.id, a.en, a.zh, a.color); });
  if(oc.discs && oc.discs.length) L2.disc.opts = oc.discs.map(function(a){ return O(a.code, a.en, a.zh); });
  if(oc.depts && oc.depts.length) L2.dept.opts = oc.depts.map(function(a){ return O(a.code, a.en, a.zh); });
  var people = {}; (v1.items || []).forEach(function(it){ (it.contacts || []).forEach(function(p){ if(p) people[p] = 1; }); });
  L2.people.opts = Object.keys(people).sort().map(function(p){ return O(p, p, ''); });
  var tv = regFromTemplate('turnover', {id:'reg_turnover'});
  var fs = tv.d.fields;
  function fld(k){ return fs.filter(function(f){ return f.key === k; })[0]; }
  if(v1.tree && v1.tree.length) fld('node').tree = v1.tree.map(function(n){ return {id:n.id, parent:n.parent || '', code:n.code || '', en:n.en || '', zh:n.zh || ''}; });
  if(oc.statuses && oc.statuses.length) fld('status').opts = oc.statuses.map(function(s){ return O(s.key, s.en, s.zh, s.color, s.done ? {done:true} : {}); });
  if(oc.types && oc.types.length) fld('type').opts = oc.types.map(function(t){ return O(t.key, t.en, t.zh, t.shape === 'milestone' ? 'violet' : 'blue', t.shape === 'milestone' ? {ms:true} : {}); });
  if(oc.ownerResults && oc.ownerResults.length) fld('ownerResult').opts = oc.ownerResults.map(function(t){ return O(t.key, t.en, t.zh, t.color); });
  (oc.customFields || []).forEach(function(cf){ fs.push(F('c_' + cf.key, cf.en, cf.zh, cf.kind === 'number' ? 'number' : cf.kind === 'date' ? 'date' : cf.kind === 'select' ? 'select' : 'text', cf.kind === 'select' ? {opts:String(cf.options || '').split(',').map(function(x){ x = x.trim(); return x ? O(x, x, '') : null; }).filter(Boolean)} : {})); });
  var ofs = oc.ownerFields || []; if(ofs.length){ var map = {title:['en','zh'], class:['node'], disc:['disc'], areas:['areas'], dept:['dept'], docNo:['docNo'], rev:['rev'], start:['start'], finish:['finish'], actual:['actualStart'], status:['status'], progress:['progress'], ownerResult:['ownerResult'], extNote:['extNote'], explanation:['explanation'], regNo:['regNo']};
    fs.forEach(function(f){ f.ext = false; }); ofs.forEach(function(k){ (map[k] || []).forEach(function(x){ var f = fld(x); if(f) f.ext = true; }); }); }
  var recs = (v1.items || []).map(function(it){
    var d = {};
    ['regNo','docNo','rev','node','dept','en','zh','disc','areas','type','start','finish','actualStart','actualEnd','progress','status','ownerResult','explanation','remarks','contacts','extNote','attachments','baseStart','baseFinish'].forEach(function(k){ if(it[k] !== undefined && it[k] !== '' && !(Array.isArray(it[k]) && !it[k].length)) d[k] = clone(it[k]); });
    if(it.updates && it.updates.length) d.updates = it.updates.map(function(u){ return {_id:uid('u'), d:u.d || '', text:u.text || ''}; });
    if(it.intNote) d.remarks = (d.remarks ? d.remarks + '\n' : '') + '[internal] ' + it.intNote;
    if(it.ongoing && !d.actualEnd) d.actualEnd = '';
    if(it.key) d.star = true; if(it.ownerVisible) d.ext = true;
    Object.keys(it.custom || {}).forEach(function(k){ d['c_' + k] = it.custom[k]; });
    if(d.attachments) d.attachments = d.attachments.map(function(a){ return {path:a.path, name:a.name, type:a.type, size:a.size}; });
    return {id:it.id, reg:tv.id, d:d};
  });
  return {lists:L2, turnover:tv, recs:recs, cfg:{projectEn:oc.projectEn || DEF_CFG.projectEn, projectZh:oc.projectZh || DEF_CFG.projectZh, asOf:oc.asOf || '', ganttStart:oc.ganttStart || '', ganttEnd:oc.ganttEnd || DEF_CFG.ganttEnd}};
}
async function runSetup(){
  if(S.setupRunning) return; S.setupRunning = true;
  try{
    var v1 = STORE.v1 || {}, m = v1ToV2(v1), have = {}; (STORE.regs || []).forEach(function(r){ have[r.d.tpl || r.id] = 1; });
    toast(T('Setting up registers…', '正在建立台账…'));
    var mk = [m.turnover, regFromTemplate('site', {id:'reg_site'}), regFromTemplate('punch', {id:'reg_punch'}), regFromTemplate('meetings', {id:'reg_meetings'}), regFromTemplate('tds', {id:'reg_tds'})];
    for(var i = 0; i < mk.length; i++){ if(!getReg(mk[i].id) && !have[mk[i].d.tpl]) await STORE.createReg(mk[i]); }
    if(m.recs.length){ var exist = {}; allRecs().forEach(function(r){ exist[r.id] = 1; }); var todo = m.recs.filter(function(r){ return !exist[r.id]; }); if(todo.length) await STORE.createRecs(todo); }
    await STORE.saveCfg(Object.assign({}, m.cfg, {lists:m.lists, regOrder:mk.map(function(x){ return x.id; }), v2:true}));
    STORE.v1 = null; toast(T('Registers ready', '台账已建立') + (m.recs.length ? ' · ' + T(m.recs.length + ' turnover records moved over', '已迁移 ' + m.recs.length + ' 条移交记录') : ''));
    S.page = 'home'; renderAll();
  }catch(e){ toast(errText(e)); }
  S.setupRunning = false;
}

/* ---------------- demo data ---------------- */
function buildDemo(){
  var asOf = TODAY_S, A = TODAY;
  function dd(off){ return n2d(A + off); }
  var lists0 = clone(DEF_LISTS);
  lists0.people.opts = ['Wang Lei 王磊','Li Na 李娜','Zhang Wei 张伟','Chen Jie 陈杰','Maria Santos','Jose Reyes'].map(function(p){ return O(p, p, ''); });
  lists0.subcon.opts = [O('sc1','PV Builders Inc.',''),O('sc2','Luzon Electrical Co.',''),O('sc3','Civil Works Ltd.','')];
  var regs = [regFromTemplate('site', {id:'reg_site'}), regFromTemplate('milestones', {id:'reg_ms'}), regFromTemplate('turnover', {id:'reg_turnover'}), regFromTemplate('punch', {id:'reg_punch'}), regFromTemplate('meetings', {id:'reg_meetings'}), regFromTemplate('issues', {id:'reg_issues'}), regFromTemplate('tds', {id:'reg_tds'})]
    .map(function(r){ return {id:r.id, owner:'demo', vis:r.vis, d:r.d}; });
  var recs = [], n = 0;
  function add(reg, d){ recs.push({id:'r' + (++n), reg:reg, d:d, ca:new Date().toISOString(), ua:new Date().toISOString()}); }
  var acts = [['Piling','打桩','w2','pile',[5200,4800,5100,4900],[5200,4300,2600,900]],['Tracker installation','支架安装','w3','tracker',[260,240,255,245],[260,190,80,0]],['Module installation','组件安装','w4','module',[61000,56000,60000,57500],[58000,30000,6000,0]],['DC cabling & strings','直流电缆与组串','w5','string',[2300,2100,2250,2150],[1500,600,0,0]],['Inverters & combiner boxes','逆变器与汇流箱','w6','inv',[12,11,12,11],[12,6,0,0]]];
  var blocks = ['B','C','D','E'], k = 0;
  acts.forEach(function(a, ai){ blocks.forEach(function(b, bi){ k++; var done = a[5][bi], plan = a[4][bi];
    var s0 = -120 + ai * 25 + bi * 10, f0 = -40 + ai * 30 + bi * 18, sl = bi === 3 ? 21 : bi === 2 ? 9 : 0;
    add('reg_site', {regNo:'SW-' + String(k).padStart(3, '0'), en:a[0] + ' – Block ' + b, zh:b + '区' + a[1], wbs:a[2], areas:[b], unit:a[3], qtyPlan:plan, qtyDone:done, start:dd(s0), finish:dd(f0 + sl), baseStart:dd(s0), baseFinish:dd(f0), status: done >= plan ? 'completed' : done > 0 ? 'in_progress' : 'not_started', resp:[['Wang Lei 王磊','Zhang Wei 张伟','Chen Jie 陈杰','Maria Santos'][bi]], subcon:['sc1','sc2','sc1','sc3'][ai % 4]}); }); });
  add('reg_site', {regNo:'SW-021', en:'MV cable trench – ring 1', zh:'中压电缆沟 – 一回路', wbs:'w7', areas:['B','C'], unit:'m', qtyPlan:3800, qtyDone:3100, start:dd(-50), finish:dd(10), status:'in_progress', resp:['Chen Jie 陈杰'], subcon:'sc3'});
  add('reg_site', {regNo:'SW-022', en:'Performance ratio test', zh:'PR 性能测试', wbs:'w10', areas:['B','C','D','E'], start:dd(25), finish:dd(70), status:'not_started', progress:0, resp:['Li Na 李娜']});
  var docs = [['Formal handover notification','正式移交通知','pk1',[],'not_started',0,dd(10),dd(25)],['Commissioning completion report','调试完成报告','pk3',[],'in_progress',40,dd(-30),dd(-15)],['Punch list status / defect register','整改项状态 / 缺陷登记册','pk3',['B','C','D','E'],'in_progress',70,dd(-45),dd(-20)],['As-built single line diagram','电气竣工单线图','pk2',[],'in_progress',60,dd(-30),dd(5)],['Pile drawings','桩图','pk2',['B','C','D','E'],'completed',100,dd(-40),dd(-25)],['PV string / array layout','光伏组串','pk2',['B','C','D','E'],'in_progress',30,dd(-20),dd(12)],['Earthing & lightning protection drawings','接地与防雷','pk2',[],'not_started',0,dd(-5),dd(20)],['SCADA architecture & point list','SCADA 架构图与点表','pk2',[],'pending',0,dd(15),dd(40)],['O&M manual','运维手册','pk4',[],'not_started',0,dd(20),dd(60)],['O&M training','运维培训','pk5',[],'not_started',0,dd(40),dd(80)],['Spare parts list','备品备件清单','pk6',[],'not_started',0,dd(40),dd(80)],['Take-over package submitted','TOP 移交包提交','pk3',['B','C','D','E'],'not_started',0,dd(80),dd(80)]];
  docs.forEach(function(x, i){ add('reg_turnover', {regNo:'DOC-' + String(i + 1).padStart(3, '0'), en:x[0], zh:x[1], node:x[2], areas:x[3], status:x[4], progress:x[5], start:x[6], finish:x[7], type: i === 11 ? 'milestone' : 'deliverable', dept: i < 3 ? 'ENG' : i < 8 ? 'DES' : 'COM', disc:[i >= 3 && i < 8 ? 'ele' : 'doc'], contacts:[i % 2 ? 'Li Na 李娜' : 'Wang Lei 王磊'], ext: i < 7, star: i === 3 || i === 5, links: i === 4 ? ['r1','r2','r3','r4'] : undefined}); });
  add('reg_turnover', {regNo:'DOC-013', en:'As-built drawing set – Electrical', zh:'电气竣工图', node:'pk2a', areas:['B','C','D','E'], status:'in_progress', start:dd(-25), finish:dd(20), type:'deliverable', dept:'DES', disc:['ele'], contacts:['Li Na 李娜'], ext:true});
  var parentId = 'r' + n;
  [['E-ASB-001','Single line diagram','单线图','completed'],['E-ASB-002','Inverter station layout','逆变站布置图','completed'],['E-ASB-003','Earthing & lightning protection layout','接地防雷布置图','in_progress'],['E-ASB-004','DC cable routing – Block B','B区直流电缆路由','in_progress'],['E-ASB-005','MV cable routing','中压电缆路由','not_started'],['E-ASB-006','Lighting & small power','照明及小动力','not_started']].forEach(function(x, i){
    add('reg_turnover', {regNo:'DOC-013-' + String(i + 1).padStart(2, '0'), docNo:x[0], en:x[1], zh:x[2], parent:parentId, node:'pk2a', areas:['B','C','D','E'], status:x[3], type:'deliverable', dept:'DES', disc:['ele'], contacts:['Li Na 李娜']}); });
  var pl = [['Loose module clamps on tracker row 12','12 排支架组件压块松动','B','T12-R3','mech','A','ready'],['Missing cable tags in combiner box CB-C07','汇流箱 CB-C07 缺少电缆标牌','C','CB-C07','elec','B','open'],['Erosion at drainage culvert near gate 2','2 号门附近涵洞冲刷','D','Culvert DC-4','civil','A','wip'],['Fence gap at north boundary','北侧围栏缺口','E','Fence N-14','hse','A','open'],['Inverter INV-B03 door seal damaged','逆变器 INV-B03 柜门密封损坏','B','INV-B03','elec','C','closed'],['As-built markups not returned for Block C DC routing','C区直流路由竣工标注未返回','C','—','doc','B','open']];
  pl.forEach(function(x, i){ add('reg_punch', {regNo:'PL-' + String(i + 1).padStart(3, '0'), en:x[0], zh:x[1], areas:[x[2]], loc:x[3], cat:x[4], prio:x[5], status:x[6], raised:dd(-20 + i * 2), due:dd(-3 + i * 4), raisedBy:'Maria Santos', resp:[['Zhang Wei 张伟','Chen Jie 陈杰'][i % 2]], subcon:['sc1','sc2','sc3'][i % 3], closed: x[6] === 'closed' ? dd(-2) : undefined}); });
  add('reg_meetings', {regNo:'MOM-001', en:'Weekly coordination meeting #38', zh:'第38周协调会', date:dd(-7), time:'09:00', mtype:'weekly', loc:'Site office', chair:'Wang Lei 王磊', attendees:['Wang Lei 王磊','Li Na 李娜','Zhang Wei 张伟','Maria Santos'], status:'issued',
    agenda:[{_id:'a1', topic:'Site progress by block', by:'Zhang Wei 张伟', notes:''},{_id:'a2', topic:'Turnover documents status', by:'Li Na 李娜', notes:''},{_id:'a3', topic:'HSE observations', by:'Maria Santos', notes:''}],
    minutes:'1. Piling in Block E restarted after rain.\n2. As-built SLD to be issued for review next week.\n3. Fence gap at north boundary to be closed before Owner walk-down.',
    actions:[{_id:'x1', action:'Issue as-built SLD for review', who:'Li Na 李娜', due:dd(3), done:false},{_id:'x2', action:'Close fence gap N-14', who:'Zhang Wei 张伟', due:dd(-1), done:false},{_id:'x3', action:'Send rain-delay notice to Owner', who:'Wang Lei 王磊', due:dd(-5), done:true}]});
  add('reg_meetings', {regNo:'MOM-002', en:'Owner monthly progress meeting', zh:'业主月度进度会', date:dd(6), time:'14:00', mtype:'owner', loc:'Owner office', chair:'Wang Lei 王磊', attendees:['Wang Lei 王磊','Li Na 李娜'], status:'planned',
    agenda:[{_id:'b1', topic:'Overall progress & look-ahead', by:'Wang Lei 王磊', notes:''},{_id:'b2', topic:'Turnover plan for the next half-month', by:'Li Na 李娜', notes:''}], actions:[]});
  [['Notice to proceed','开工令','contract',-300,-300,-300],['Mechanical completion – Block B','B区机械完工','internal',-20,-14,-12],['Mechanical completion – Block C','C区机械完工','internal',10,24,null],['Mechanical completion – Block D','D区机械完工','internal',35,52,null],['Mechanical completion – Block E','E区机械完工','internal',55,82,null],['Back-feed / energisation','倒送电','owner',45,52,null],['Grid synchronisation','并网','owner',75,86,null],['Commercial operation date (COD)','商业运营（COD）','contract',105,118,null],['Taking-over certificate / PAC','移交证书 / PAC','contract',135,148,null],['Final acceptance (FAC)','最终验收（FAC）','contract',500,500,null]].forEach(function(x, i){
    add('reg_ms', {regNo:'MS-' + String(i + 1).padStart(3, '0'), en:x[0], zh:x[1], cat:x[2], base:dd(x[3]), forecast:dd(x[4]), actual:x[5] != null ? dd(x[5]) : undefined, status:x[5] != null ? 'done' : x[4] - x[3] > 10 ? 'risk' : 'planned', areas:/Block ([BCDE])/.test(x[0]) ? [RegExp.$1] : []}); });
  [['issue','Grid connection approval from NGCP still pending','NGCP 并网批复仍未取得','A',-12,6,'Escalate at Owner meeting; request joint letter'],['risk','Typhoon season may stop module installation in Block E','台风季可能导致 E 区组件安装停工','B',-20,30,'Secure modules; add second crew after storms'],['decision','Approve revised MV energisation date','批准调整后的中压送电日期','A',-5,8,'Proposed new date with recovery plan attached'],['issue','Late return of as-built markups from subcontractor','分包商竣工标注返回滞后','B',-9,3,'Weekly review; payment linked to markups']].forEach(function(x, i){
    add('reg_issues', {regNo:'ISS-' + String(i + 1).padStart(3, '0'), en:x[1], zh:x[2], kind:x[0], prio:x[3], raised:dd(x[4]), due:dd(x[5]), status:'open', mitig:x[6], escalate:x[3] === 'A', owner:['Wang Lei 王磊']}); });
  add('reg_tds', {regNo:'TDS-001', en:'Bifacial PV module 580 W', zh:'双面光伏组件 580W', cat:'module', mfr:'—', model:'—', rev:'A', status:'approved', submitted:dd(-90), approved:dd(-70)});
  add('reg_tds', {regNo:'TDS-002', en:'String inverter 320 kW', zh:'组串式逆变器 320kW', cat:'inverter', mfr:'—', model:'—', rev:'B', status:'submitted', submitted:dd(-10)});
  add('reg_tds', {regNo:'TDS-003', en:'MV cable 33 kV 1×300 mm²', zh:'33kV 中压电缆', cat:'cable', mfr:'—', model:'—', rev:'A', status:'draft'});
  regs.push({id:'reg_snaps', owner:'demo', vis:'team', d:{kind:'snaps', en:'Progress snapshots', zh:'进度快照', fields:[F('week','Week','周','text'),F('date','Date','日期','date')], roles:{title:'week', no:'week'}}});
  for(var wk = 10; wk >= 1; wk--){ var vals = {reg_site:{}}; recs.forEach(function(r){ if(r.reg !== 'reg_site') return; var p = r.d.qtyPlan ? Math.min(100, r.d.qtyDone / r.d.qtyPlan * 100) : (r.d.status === 'completed' ? 100 : 0); vals.reg_site[r.id] = Math.max(0, Math.round(p * (1 - wk * 0.075) * 10) / 10); }); add('reg_snaps', {week:isoWeek(A - wk * 7), date:dd(-wk * 7), vals:vals}); }
  return {v2:true, v:4, cfg:Object.assign(clone(DEF_CFG), {lists:lists0, regOrder:regs.map(function(r){ return r.id; }), v2:true, asOf:asOf}), regs:regs, recs:recs, audit:[], pubs:[], fb:[]};
}
