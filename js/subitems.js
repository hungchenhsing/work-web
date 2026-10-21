/* work-web v3.4.4 · items inside items.
   An item can hold other items (e.g. the spare-parts delivery record holds the 50 spare parts). Here:
   - the split of a list into items and their sub-items, shared by the table, cards, board and Gantt;
     which items are open is kept in this browser; a search opens the items whose sub-items match
   - putting several items under one item (the package follows the new item), or back to the top level
   - merging duplicates into one item (sub-items, files, links, schedule links and texts move across)
   - turning the sub-folders of a category tree into items: one dialog, a choice per folder, undo */
'use strict';

/* ---------- which items are open ---------- */
(function(){ var o = LS.get('ww.rexp', {}); S.rexp = o && typeof o === 'object' && !Array.isArray(o) ? o : {}; })();
function rexpSet(id, on){ if(on) S.rexp[id] = 1; else delete S.rexp[id]; LS.set('ww.rexp', S.rexp); }

/* items → top-level rows and the sub-items under each. With a search or filter on, the items holding a match are
   added (marked ctx) and opened, so a match is seen inside its item. sortFn orders each level. */
function hierSplit(reg, items, sortFn, opts){
  var ids = {}, kids = {}, roots = [], ctx = {}, forced = {}, extra = [];
  items.forEach(function(r){ ids[r.id] = 1; });
  if(!(opts && opts.noCtx) && typeof oFiltered === 'function' && oFiltered(reg)) items.forEach(function(r){
    var p = parentRec(r), g = 0;
    while(p && g++ < 10 && p.reg === r.reg){ if(!ids[p.id]){ ids[p.id] = 1; ctx[p.id] = 1; extra.push(p); } forced[p.id] = 1; p = parentRec(p); }
  });
  items.concat(extra).forEach(function(r){ var p = r.d.parent; if(p && p !== r.id && ids[p]) (kids[p] = kids[p] || []).push(r); else roots.push(r); });
  if(sortFn){ roots = sortFn(roots); Object.keys(kids).forEach(function(k){ kids[k] = sortFn(kids[k]); }); }
  return {roots:roots, kids:kids, ids:ids, ctx:ctx, open:function(id){ return !!forced[id] || !!S.rexp[id]; }, forced:function(id){ return !!forced[id]; }};
}

/* ---------- under another item ---------- */
function isUnder(rec, anc){ var p = parentRec(rec), g = 0; while(p && g++ < 12){ if(p.id === anc.id) return true; p = parentRec(p); } return false; }
/* patches that put recs under par (null = top level). The package follows the new item, for their sub-items too.
   An item is never put under itself or under one of its own sub-items. */
function underPatches(reg, recs, par){
  var tf = rf(reg, 'tree'), out = [], seen = {}, chosen = {};
  recs.forEach(function(r){ if(r) chosen[r.id] = 1; });
  recs.forEach(function(r){
    if(!r || seen[r.id] || (par && (r.id === par.id || isUnder(par, r)))) return;
    if(par && (function(){ var a = parentRec(r), g = 0; while(a && g++ < 12){ if(chosen[a.id]) return true; a = parentRec(a); } return false; })()) return;   // it comes along under its own selected item
    var p = {};
    if((r.d.parent || null) !== (par ? par.id : null)) p.parent = par ? par.id : null;
    if(tf && par && !same(r.d[tf.key], par.d[tf.key])) p[tf.key] = par.d[tf.key] === undefined ? null : clone(par.d[tf.key]);
    if(!Object.keys(p).length) return;
    out.push({rec:r, patch:p}); seen[r.id] = 1;
    if(tf && par && p[tf.key] !== undefined) descendantsOf(r).forEach(function(k){ if(seen[k.id] || same(k.d[tf.key], par.d[tf.key])) return; var q = {}; q[tf.key] = p[tf.key]; out.push({rec:k, patch:q}); seen[k.id] = 1; });
  });
  return out;
}
/* write patches with one Undo for all of them */
function setRecsUndo(list, msg){
  list = list.filter(function(x){ return x && x.rec; });
  if(!list.length) return Promise.resolve({ok:0, failed:0});
  var undo = list.map(function(x){ var old = {}; Object.keys(x.patch).forEach(function(k){ old[k] = x.rec.d[k] === undefined ? null : clone(x.rec.d[k]); }); return {id:x.rec.id, old:old}; });
  return setRecs(list).then(function(res){ if(res && res.ok){ S.lastUndo = {list:undo}; toast(msg + (res.failed ? ' · ' + T(res.failed + ' failed', '失败 ' + res.failed) : ''), {act:'quickUndo', label:T('Undo', '撤销')}); } return res; });
}
/* bulk delete takes the sub-items along (innermost first), like deleting one item does */
function bulkDelIds(ids){ var out = [], seen = {}; ids.forEach(function(id){ var r = getRec(id); if(!r) return; descendantsOf(r).reverse().forEach(function(k){ if(!seen[k.id]){ seen[k.id] = 1; out.push(k.id); } }); if(!seen[id]){ seen[id] = 1; out.push(id); } }); return out; }
function bulkSelRecs(reg){ return Object.keys(S.sel).filter(function(id){ return S.sel[id]; }).map(getRec).filter(function(r){ return r && r.reg === reg.id; }); }
/* the bulk bar: put the selected items under one item, take them out again, merge them */
function subBulk(reg){
  var sel = bulkSelRecs(reg); if(!sel.length) return '';
  return '<button type="button" class="btn sm" data-act="putUnder">' + uic('layers', 13) + ' ' + L('Put under an item…', '归到某一项下…') + '</button>' +
    (sel.some(function(r){ return r.d.parent; }) ? '<button type="button" class="btn sm" data-act="putTop">' + L('Make top level', '设为顶层') + '</button>' : '') +
    (sel.length > 1 ? '<button type="button" class="btn sm" data-act="mergeOpen">' + L('Merge…', '合并…') + '</button>' : '');
}
function putUnderCands(reg, m){
  var sel = (m.ids || []).map(getRec).filter(Boolean), tf = rf(reg, 'tree'), q = String(m.q || '').trim().toLowerCase();
  var bad = {}; sel.forEach(function(r){ bad[r.id] = 1; descendantsOf(r).forEach(function(k){ bad[k.id] = 1; }); });
  var list = recsOf(reg.id).filter(function(r){ return !bad[r.id] && (!q || (recNo(reg, r) + ' ' + recTitle(reg, r) + ' ' + (recTitle2(reg, r) || '')).toLowerCase().indexOf(q) >= 0); });
  /* items in the selection's own package first, then by package and number */
  var home = sel[0] && tf ? (treePath(tf, sel[0].d[tf.key])[0] || {}).id : null;
  function pk(r){ return tf ? (treePath(tf, r.d[tf.key])[0] || {}).id || '~' : ''; }
  var order = tf ? treeNodes(tf).map(function(n){ return n.id; }) : [];
  list.sort(function(a, b){ var pa = pk(a), pb = pk(b); if(pa !== pb){ if(pa === home) return -1; if(pb === home) return 1; return order.indexOf(pa) - order.indexOf(pb); } return String(recNo(reg, a)).localeCompare(String(recNo(reg, b)), undefined, {numeric:true}); });
  return {list:list.slice(0, 120), total:list.length};
}
function putUnderModal(m){
  var reg = getReg(m.reg); if(!reg) return {title:'', html:''};
  var c = putUnderCands(reg, m), tf = rf(reg, 'tree'), n = (m.ids || []).length;
  var h = '<p class="note" style="margin-top:0">' + L('The ' + n + ' selected item' + (n === 1 ? '' : 's') + ' become sub-items of the item you choose, and move to its package. Their own sub-items come along.', '所选的 ' + n + ' 项会成为你选中那一项的子项，并移到它所在的文件包；它们自己的子项一起移动。') + '</p>' +
    '<label class="search" style="width:100%">' + uic('search', 15) + '<input id="puq" type="search" data-fk="puq" placeholder="' + esc(T('Search number or title', '搜索编号或名称')) + '" value="' + esc(m.q || '') + '" autocomplete="off"></label>' +
    '<div class="lpl">' + (c.list.length ? c.list.map(function(r){ var kids = childrenOf(r).length, path = tf ? treePath(tf, r.d[tf.key]) : [];
      return '<button type="button" class="lpi" data-act="putUnderGo" data-v="' + esc(r.id) + '"><span class="mono muted">' + esc(recNo(reg, r)) + '</span><span class="lpt">' + esc(recTitle(reg, r) || '—') + (recTitle2(reg, r) ? ' <span class="muted">' + esc(recTitle2(reg, r)) + '</span>' : '') + (parentRec(r) ? ' <span class="note">↳ ' + esc(recNo(reg, parentRec(r))) + '</span>' : '') + '</span>' + (kids ? '<span class="chip c-grey">' + L(kids + (kids === 1 ? ' sub-item' : ' sub-items'), kids + ' 个子项') + '</span>' : '') + (path.length ? '<span class="rlreg">' + esc(path[0].code || nm(path[0])) + '</span>' : '') + '</button>'; }).join('') : '<div class="note" style="padding:10px">' + L('Nothing found.', '没有找到。') + '</div>') +
    (c.total > c.list.length ? '<div class="note" style="padding:8px">' + L('Showing ' + c.list.length + ' of ' + c.total + ' — search to narrow down.', '显示 ' + c.total + ' 项中的 ' + c.list.length + ' 项，请搜索缩小范围。') + '</div>' : '') + '</div>';
  return {title:L('Put under an item', '归到某一项下'), wide:true, html:h, foot:'<button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button>'};
}
DECK_MODALS.putUnder = putUnderModal;

/* ---------- merge duplicates ---------- */
/* why a duplicate cannot be merged by itself (it is left as it is) */
function mergeBlock(reg, keeper, dup){
  if(dup.id === keeper.id) return '';
  if(isUnder(keeper, dup)) return T('the item to keep is one of its sub-items', '要保留的那一项是它的子项');
  if(((STORE && STORE.fb) || []).some(function(f){ return f.item_id === dup.id; })) return T('it has review comments — move them first', '它有审查意见，请先处理');
  if(typeof docTrnHistory === 'function' && docTrnHistory(dup).length) return T('it was sent in a transmittal', '它已随传递单发出');
  return '';
}
/* the keeper takes the duplicates' sub-items, files, links, predecessors and any text it does not have yet;
   whatever pointed at a duplicate points at the keeper; then the duplicates are deleted (restore from the Change log) */
function mergePlan(reg, keeper, dups){
  var kd = keeper.d, kp = {}, dupIds = {}, tf = rf(reg, 'tree'), patches = [], skip = [];
  dups = dups.filter(function(d){ var why = mergeBlock(reg, keeper, d); if(why){ skip.push({rec:d, why:why}); return false; } return d.id !== keeper.id; });
  dups.forEach(function(d){ dupIds[d.id] = 1; });
  var ro = rolesOf(reg);
  dataFields(reg).forEach(function(f){
    /* a field the keeper has left empty takes the first value a duplicate has */
    if(['text', 'number', 'percent', 'date', 'select'].indexOf(f.type) >= 0 && f.key !== ro.no && (!tf || f.key !== tf.key) && isEmpty(kd[f.key]) && !(f.type === 'percent' && f.auto)){
      var dv = dups.map(function(d){ return d.d[f.key]; }).filter(function(v){ return !isEmpty(v); })[0]; if(dv !== undefined) kp[f.key] = clone(dv); }
    if(f.type === 'sub'){ var rows = asArr(kd[f.key]).slice(), n0 = rows.length; dups.forEach(function(d){ asArr(d.d[f.key]).forEach(function(x){ if(x) rows.push(clone(x)); }); }); if(rows.length !== n0) kp[f.key] = rows; }
    if(f.type === 'link'){ var lv = asArr(kd[f.key]).filter(function(id){ return !dupIds[id]; }); dups.forEach(function(d){ asArr(d.d[f.key]).forEach(function(id){ if(id && id !== keeper.id && !dupIds[id] && lv.indexOf(id) < 0) lv.push(id); }); }); if(!same(lv, asArr(kd[f.key]))) kp[f.key] = lv; }
    if(f.type === 'files'){ var cur = asArr(kd[f.key]).slice(), have = {}; cur.forEach(function(x){ have[x.path || x.name] = 1; });
      dups.forEach(function(d){ asArr(d.d[f.key]).forEach(function(x){ var k = x && (x.path || x.name); if(k && !have[k]){ cur.push(x); have[k] = 1; } }); });
      if(cur.length !== asArr(kd[f.key]).length) kp[f.key] = cur; }
    if(f.type === 'long'){ var t = String(kd[f.key] || '');
      dups.forEach(function(d){ var x = String(d.d[f.key] || '').trim(); if(x && t.indexOf(x) < 0) t = (t ? t + '\n' : '') + '[' + (recNo(reg, d) || T('merged', '合并')) + '] ' + x; });
      if(t !== String(kd[f.key] || '')) kp[f.key] = t; }
  });
  /* the keeper's own links and predecessors that point at a duplicate are dropped (they would point at nothing) */
  var rel = asArr(kd.rel).filter(function(x){ return x && !dupIds[x.to]; }), rk = {}; rel.forEach(function(x){ rk[x.to + ':' + (x.t || 'rel')] = 1; });
  dups.forEach(function(d){ asArr(d.d.rel).forEach(function(x){ if(!x || !x.to || x.to === keeper.id || dupIds[x.to]) return; var k = x.to + ':' + (x.t || 'rel'); if(!rk[k]){ rel.push(clone(x)); rk[k] = 1; } }); });
  if(!same(rel, asArr(kd.rel))) kp.rel = rel;
  var dep = asArr(kd.dep).filter(function(x){ return x && !dupIds[x.id]; });
  dups.forEach(function(d){ asArr(d.d.dep).forEach(function(x){ if(x && x.id && x.id !== keeper.id && !dupIds[x.id] && !dep.some(function(y){ return y && y.id === x.id; })) dep.push(clone(x)); }); });
  if(!same(dep, asArr(kd.dep))) kp.dep = dep;
  var byId = {}; function add(r, p){ if(!Object.keys(p).length) return; if(byId[r.id]) Object.assign(byId[r.id].patch, p); else { byId[r.id] = {rec:r, patch:p}; patches.push(byId[r.id]); } }
  add(keeper, kp);
  /* the duplicates' sub-items go under the keeper (their own sub-items follow it into its package) */
  var kids = []; dups.forEach(function(d){ childrenOf(d).forEach(function(k){ if(!dupIds[k.id] && k.id !== keeper.id) kids.push(k); }); });
  underPatches(reg, kids, keeper).forEach(function(x){ add(x.rec, x.patch); });
  allRecs().forEach(function(r){
    if(dupIds[r.id] || r.id === keeper.id) return; var p = {};
    var rr = asArr(r.d.rel); if(rr.some(function(x){ return x && dupIds[x.to]; })){ var seen = {}; p.rel = rr.map(function(x){ return x && dupIds[x.to] ? Object.assign({}, x, {to:keeper.id}) : x; }).filter(function(x){ if(!x) return false; var k = x.to + ':' + (x.t || 'rel'); if(seen[k] || x.to === r.id) return false; seen[k] = 1; return true; }); }
    var dd = asArr(r.d.dep); if(dd.some(function(x){ return x && dupIds[x.id]; })){ var sd = {}; p.dep = dd.map(function(x){ return x && dupIds[x.id] ? Object.assign({}, x, {id:keeper.id}) : x; }).filter(function(x){ if(!x || x.id === r.id || sd[x.id]) return false; sd[x.id] = 1; return true; }); }
    var rg = getReg(r.reg); if(rg) dataFields(rg).forEach(function(f){ if(f.type !== 'link') return; var v = asArr(r.d[f.key]); if(!v.some(function(id){ return dupIds[id]; })) return;
      var nv = []; v.forEach(function(id){ var t = dupIds[id] ? keeper.id : id; if(t !== r.id && nv.indexOf(t) < 0) nv.push(t); }); p[f.key] = nv; });
    add(r, p);
  });
  return {keeper:keeper, dups:dups, skip:skip, patches:patches};
}
/* before records are merged away or deleted in bulk: remember the highest number, so it is not given out again */
function noHighKeep(reg){
  var ro = rolesOf(reg), pre = String(reg.d.prefix || 'REC').toUpperCase(), re = new RegExp('^' + pre.replace(/[^A-Z0-9]/g, '') + '-(\\d+)$', 'i'), mx = 0;
  if(!ro.no) return Promise.resolve();
  recsOf(reg.id).forEach(function(r){ var mm = re.exec(r.d[ro.no] || ''); if(mm) mx = Math.max(mx, +mm[1]); });
  return mx > (+reg.d.noHigh || 0) ? STORE.patchReg(reg.id, {noHigh:mx}).catch(function(){}) : Promise.resolve();
}
async function mergeRun(reg, plan){
  if(!plan.dups.length) return {merged:0, skip:plan.skip};
  await noHighKeep(reg);
  var res = await setRecs(plan.patches);
  if(res && res.failed) return {merged:0, skip:plan.skip, failed:res.failed};
  var n = 0;
  for(var i = 0; i < plan.dups.length; i++){ try{ await STORE.deleteRec(plan.dups[i].id); n++; }catch(e){ console.error(e); } }
  return {merged:n, skip:plan.skip};
}
function mergeModal(m){
  var reg = getReg(m.reg); if(!reg) return {title:'', html:''};
  var recs = (m.ids || []).map(getRec).filter(Boolean), keep = getRec(m.keep) || recs[0];
  var pl = keep ? mergePlan(reg, keep, recs.filter(function(r){ return r.id !== keep.id; })) : null;
  var h = '<p class="note" style="margin-top:0">' + L('Choose the item to keep. The others are merged into it: their sub-items, files, links, predecessors and remarks move across, and fields it has left empty take their values; then they are deleted (you can restore them from the Change log).', '选择要保留的一项。其他几项会并入它：它们的子项、文件、关联、前置事项和说明文字移过来，它空着的字段取它们的值；然后删除（可在修改记录中恢复）。') + '</p><div class="lpl">' +
    recs.map(function(r){ var on = keep && r.id === keep.id, sk = pl && pl.skip.filter(function(x){ return x.rec.id === r.id; })[0];
      return '<label class="lpi' + (on ? ' on' : '') + '"><input type="radio" name="mkeep" data-mkeep="' + esc(r.id) + '"' + (on ? ' checked' : '') + '><span class="mono muted">' + esc(recNo(reg, r)) + '</span><span class="lpt">' + esc(recTitle(reg, r) || '—') + (recTitle2(reg, r) ? ' <span class="muted">' + esc(recTitle2(reg, r)) + '</span>' : '') + (sk ? '<span class="note err"> · ' + esc(T('stays: ', '保留不动：') + sk.why) + '</span>' : on ? '' : '<span class="note"> → ' + esc(T('merged and deleted', '并入后删除')) + '</span>') + '</span>' + (childrenOf(r).length ? '<span class="chip c-grey">' + L(childrenOf(r).length + (childrenOf(r).length === 1 ? ' sub-item' : ' sub-items'), childrenOf(r).length + ' 个子项') + '</span>' : '') + '</label>'; }).join('') + '</div>';
  var n = pl ? pl.dups.length : 0;
  return {title:L('Merge items', '合并事项'), wide:true, html:h, foot:'<button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button><button type="button" class="btn pri" data-act="mergeGo"' + (n ? '' : ' disabled') + '>' + L('Merge ' + n + ' into ' + (keep ? recNo(reg, keep) : ''), '把 ' + n + ' 项并入 ' + (keep ? recNo(reg, keep) : '')) + '</button>'};
}
DECK_MODALS.merge = mergeModal;

/* ---------- import: an Action column (Delete / Merge into <No.>) ---------- */
function impAction(raw){
  var s = String(raw == null ? '' : raw).trim(); if(!s) return null;
  if(/^(delete|remove|删除|刪除)$/i.test(s)) return {del:true};
  var m = /^(?:merge\s*(?:into|to)?|并入|併入|合并到|合併到|合并至|合併至)\s*[:：]?\s*(.+)$/i.exec(s); if(m) return {into:m[1].trim()};
  return {bad:s};
}
/* why a row's Delete is not done: anything that would be lost */
function impDelBlock(reg, r){
  if(childrenOf(r).length) return T('it has sub-items', '它有子项');
  if(dataFields(reg).some(function(f){ return f.type === 'files' && asArr(r.d[f.key]).length; })) return T('it has files', '它有文件');
  if(((STORE && STORE.fb) || []).some(function(f){ return f.item_id === r.id; })) return T('it has review comments', '它有审查意见');
  if(typeof docTrnHistory === 'function' && docTrnHistory(r).length) return T('it was sent in a transmittal', '它已随传递单发出');
  return '';
}

/* ---------- sub-folders → items ---------- */
function fcSubs(reg){ var tf = rf(reg, 'tree'); return tf ? treeNodes(tf).filter(function(n){ return n.parent && treeNode(tf, n.parent); }) : []; }
function fcMenu(reg){ return canSchemaEdit(reg) && fcSubs(reg).length ? '<button type="button" data-act="fcOpen" data-v="' + esc(reg.id) + '">' + L('Turn sub-folders into items…', '把子目录改成事项…') + '</button>' : ''; }
/* the choice for each sub-folder: keep it, a new item (name, package), into an existing item, or dissolve.
   At most two levels by default: a folder that has sub-folders is dissolved, the others become items. */
function fcChoices(reg, m){
  var tf = rf(reg, 'tree'); m.ch = m.ch || {};
  fcSubs(reg).forEach(function(n){ if(m.ch[n.id]) return;
    var hasSub = treeKids(tf, n.id).length > 0, empty = !recsOf(reg.id).some(function(r){ return r.d[tf.key] === n.id; });
    m.ch[n.id] = {mode:hasSub || empty ? 'up' : 'new', en:n.en || n.zh || '', zh:n.zh || '', pkg:n.parent, into:''}; });   // an empty folder has nothing to hold
  return m.ch;
}
function fcPlan(reg, m){
  var tf = rf(reg, 'tree'), ro = rolesOf(reg), ch = fcChoices(reg, m), nodes = treeNodes(tf), byId = {};
  nodes.forEach(function(n){ byId[n.id] = n; });
  function isTop(id){ var n = byId[id]; return !!n && (!n.parent || !byId[n.parent]); }
  var D = {}, creates = [], err = [], pre = String(reg.d.prefix || 'REC').toUpperCase(), nmax = 0, re = new RegExp('^' + pre.replace(/[^A-Z0-9]/g, '') + '-(\\d+)$', 'i');
  recsOf(reg.id).forEach(function(r){ var mm = re.exec(r.d[ro.no] || ''); if(mm) nmax = Math.max(nmax, +mm[1]); });
  nmax = Math.max(nmax, +reg.d.noHigh || 0);
  var parentOf = {}, nodeOf = {}, newById = {};
  /* where the direct items of folder id go: {node, rec} */
  function dest(id, g){
    if(D[id]) return D[id]; if((g || 0) > 20) return {node:id, rec:null};
    var n = byId[id]; if(isTop(id)) return (D[id] = {node:id, rec:null});
    var c = ch[id] || {mode:'keep'}, base = isTop(n.parent) ? {node:(c.pkg && isTop(c.pkg) ? c.pkg : n.parent), rec:null} : dest(n.parent, (g || 0) + 1);
    if(c.mode === 'keep') return (D[id] = {node:id, rec:null});
    if(c.mode === 'up') return (D[id] = base);
    if(c.mode === 'into'){ var x = getRec(c.into); if(x && x.reg === reg.id) return (D[id] = {node:null, rec:x.id}); err.push(T('Choose the item for ', '请为以下目录选择事项：') + treeLabel(n)); return (D[id] = base); }
    var d = blankData(reg, {}), rid = uid('r');
    if(ro.no) d[ro.no] = pre + '-' + String(++nmax).padStart(3, '0');
    if(ro.title) d[ro.title] = String(c.en || '').trim() || nm(n); if(ro.title2) d[ro.title2] = String(c.zh || '').trim();
    d[tf.key] = base.node; if(base.rec) d.parent = base.rec;
    parentOf[rid] = base.rec || null; nodeOf[rid] = base.node;
    var cr = {id:rid, reg:reg.id, d:d, folder:id}; creates.push(cr); newById[rid] = cr;
    return (D[id] = {node:null, rec:rid});
  }
  var subs = fcSubs(reg), gone = {};
  subs.forEach(function(n){ dest(n.id); if((ch[n.id] || {}).mode !== 'keep') gone[n.id] = 1; });
  /* the items of the folders that go */
  var moved = recsOf(reg.id).filter(function(r){ return gone[r.d[tf.key]]; }), per = {};
  moved.forEach(function(r){ var dd = D[r.d[tf.key]], hasPar = r.d.parent && getRec(r.d.parent);
    per[r.d[tf.key]] = (per[r.d[tf.key]] || 0) + 1;
    if(!hasPar){ parentOf[r.id] = dd.rec || null; nodeOf[r.id] = dd.node; } });
  function par(id){ if(id in parentOf) return parentOf[id]; var r = getRec(id); return r && r.d.parent && getRec(r.d.parent) ? r.d.parent : null; }
  function finalNode(id){ var g = 0, cur = id, seen = {}; while(g++ < 30){ if(seen[cur]){ return null; } seen[cur] = 1; var p = par(cur); if(!p) break; cur = p; }
    if(g >= 30) return null; if(cur in nodeOf && nodeOf[cur]) return nodeOf[cur]; var r = getRec(cur); return r ? r.d[tf.key] : null; }
  /* a loop (folder A into an item of folder B, and B into an item of A) is refused */
  Object.keys(parentOf).forEach(function(id){ var g = 0, cur = id, seen = {}; while(cur && g++ < 30){ if(seen[cur]){ var r = getRec(id) || newById[id]; err.push(T('These choices put items inside each other: ', '这些选择会让事项互相包含：') + (r ? (r.d[ro.no] || '') : id)); break; } seen[cur] = 1; cur = par(cur); } });
  /* nodes: every moved item, new item and their sub-items end up in the package of their top item */
  var touched = {}; moved.forEach(function(r){ touched[r.id] = 1; descendantsOf(r).forEach(function(k){ touched[k.id] = 1; }); });
  creates.forEach(function(c){ c.d[tf.key] = finalNode(c.id) || c.d[tf.key]; });
  var patches = [];
  Object.keys(touched).forEach(function(id){ var r = getRec(id); if(!r) return; var p = {}, fn = finalNode(id);
    if(id in parentOf && (r.d.parent || null) !== parentOf[id]) p.parent = parentOf[id];
    if(fn && fn !== r.d[tf.key]) p[tf.key] = fn;
    if(Object.keys(p).length) patches.push({rec:r, patch:p}); });
  /* the tree keeps the top level and the folders kept; a kept folder hangs on its nearest kept ancestor */
  var tree = nodes.filter(function(n){ return !gone[n.id]; }).map(function(n){ var c = clone(n), p = c.parent, g = 0; while(p && gone[p] && g++ < 20) p = byId[p] ? byId[p].parent : ''; c.parent = p || ''; return c; });
  return {creates:creates, patches:patches, tree:tree, err:err, D:D, per:per, gone:gone, moved:moved.length};
}
function fcModal(m){
  var reg = getReg(m.reg), tf = reg && rf(reg, 'tree'); if(!tf) return {title:'', html:''};
  var ch = fcChoices(reg, m), pl = fcPlan(reg, m), ro = rolesOf(reg), tops = treeNodes(tf).filter(function(n){ return !n.parent || !treeNode(tf, n.parent); });
  function depth(n){ var d = 0, p = n.parent, g = 0; while(p && treeNode(tf, p) && g++ < 20){ d++; p = treeNode(tf, p).parent; } return d; }
  function inSub(id, r){ var p = treePath(tf, r.d[tf.key]); return p.some(function(x){ return x.id === id; }); }
  var h = '<p class="note" style="margin-top:0">' + L('Each sub-folder can become an item that holds its items as sub-items, go into an item that is already there, or be dissolved (its items go one level up). Nothing changes until you press Turn into items; Undo puts everything back. Saved views that pick one of these sub-folders are switched to where its items go; a public link that picks one needs its package chosen again.', '每个子目录可以变成一个事项（原来的内容成为它的子项）、放进已有的某一项，或者拆掉（内容上移一层）。按「改成事项」之前不会改动任何数据；可以撤销。保存的视图如果选了这些子目录，会改成内容所去的文件包；公开链接如果选了子目录，需要重新选择文件包。') + '</p>' +
    '<div class="tbl-wrap" style="max-height:56vh"><table class="tbl fcv"><thead><tr><th>' + L('Sub-folder', '子目录') + '</th><th>' + L('Items', '事项') + '</th><th>' + L('Becomes', '改成') + '</th></tr></thead><tbody>' +
    fcSubs(reg).map(function(n){ var c = ch[n.id], top = !treeNode(tf, n.parent).parent || !treeNode(tf, treeNode(tf, n.parent).parent), cnt = recsOf(reg.id).filter(function(r){ return r.d[tf.key] === n.id; }).length;
      var pkSel = '<select class="in sm" data-fcpkg="' + esc(n.id) + '" aria-label="' + esc(T('Package', '文件包')) + '">' + tops.map(function(t){ return '<option value="' + esc(t.id) + '"' + ((c.pkg || n.parent) === t.id ? ' selected' : '') + '>' + esc(treeLabel(t)) + '</option>'; }).join('') + '</select>';
      var cands = recsOf(reg.id).filter(function(r){ return !inSub(n.id, r); }), tp = treePath(tf, n.id)[0];
      cands.sort(function(a, b){ var pa = (treePath(tf, a.d[tf.key])[0] || {}).id === (tp && tp.id) ? 0 : 1, pb = (treePath(tf, b.d[tf.key])[0] || {}).id === (tp && tp.id) ? 0 : 1; return pa - pb || String(recNo(reg, a)).localeCompare(String(recNo(reg, b)), undefined, {numeric:true}); });
      var opt = '<select class="in sm" data-fcmode="' + esc(n.id) + '" aria-label="' + esc(T('What ', '如何处理 ') + treeLabel(n) + T(' becomes', '')) + '">' + [['new', 'A new item', '新建一个事项'], ['into', 'Into an existing item', '放进已有的事项'], ['up', 'Dissolve (items one level up)', '拆掉（内容上移一层）'], ['keep', 'Keep as a sub-folder', '保留为子目录']].map(function(o){ return '<option value="' + o[0] + '"' + (c.mode === o[0] ? ' selected' : '') + '>' + esc(T(o[1], o[2])) + '</option>'; }).join('') + '</select>';
      var more = '';
      if(c.mode === 'new') more = '<input class="in sm" data-fcen="' + esc(n.id) + '" data-fk="fcen:' + esc(n.id) + '" value="' + esc(c.en) + '" placeholder="' + esc(T('Name (English)', '名称（英文）')) + '" aria-label="' + esc(T('Name (English)', '名称（英文）')) + '">' + (ro.title2 ? '<input class="in sm" data-fczh="' + esc(n.id) + '" data-fk="fczh:' + esc(n.id) + '" value="' + esc(c.zh) + '" placeholder="' + esc(T('Name (Chinese)', '名称（中文）')) + '" aria-label="' + esc(T('Name (Chinese)', '名称（中文）')) + '">' : '') + (top ? '<span class="fcin">' + L('in', '放在') + ' ' + pkSel + '</span>' : '');
      if(c.mode === 'into') more = '<select class="in sm fcinto" data-fcinto="' + esc(n.id) + '" aria-label="' + esc(T('Item', '事项')) + '"><option value="">' + esc(T('Choose the item…', '选择事项…')) + '</option>' + cands.map(function(r){ return '<option value="' + esc(r.id) + '"' + (c.into === r.id ? ' selected' : '') + '>' + esc((recNo(reg, r) + ' ' + (recTitle(reg, r) || '') + (recTitle2(reg, r) ? ' ' + recTitle2(reg, r) : '')).slice(0, 90)) + '</option>'; }).join('') + '</select>';
      if(c.mode === 'up' && top) more = '<span class="fcin">' + L('items go into', '内容放进') + ' ' + pkSel + '</span>';
      var dd = pl.D[n.id], res = '';
      if(c.mode === 'keep') res = T('stays a sub-folder', '保留为子目录');
      else if(dd && dd.rec){ var nr = getRec(dd.rec), nc = pl.creates.filter(function(x){ return x.id === dd.rec; })[0], lab = nr ? recNo(reg, nr) : nc ? nc.d[ro.no] : '';
        res = (c.mode === 'new' ? T('new item ', '新事项 ') : T('into ', '放进 ')) + lab + (cnt ? T(' · its ' + cnt + ' items become sub-items', '，原来的 ' + cnt + ' 项成为子项') : ''); }
      else if(dd){ var tn = treeNode(tf, dd.node); res = T('items go into ', '内容放进 ') + (tn ? treeLabel(tn) : ''); }
      return '<tr><td style="padding-left:' + (8 + (depth(n) - 1) * 18) + 'px"><span class="mono muted">' + esc(n.code || '') + '</span> ' + esc(nm(n)) + '</td><td class="mono">' + cnt + '</td><td><div class="fcc">' + opt + more + '</div><div class="note">→ ' + esc(res) + '</div></td></tr>'; }).join('') + '</tbody></table></div>';
  h += '<div class="impsum card"><div><b>' + L('Result', '结果') + '</b> · ' + L(pl.creates.length + ' new items', '新建 ' + pl.creates.length + ' 个事项') + ' · ' + L(pl.patches.length + ' items change place', '调整 ' + pl.patches.length + ' 个事项的位置') + ' · ' + L(Object.keys(pl.gone).length + ' sub-folders removed', '移除 ' + Object.keys(pl.gone).length + ' 个子目录') + '</div>' +
    (pl.err.length ? '<div class="note err">' + esc(pl.err.slice(0, 4).join(' · ')) + '</div>' : '') + '</div>';
  return {title:L('Turn sub-folders into items', '把子目录改成事项') + ' · ' + esc(regName(reg)), wide:true, html:h, foot:'<button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button><button type="button" class="btn pri" data-act="fcGo"' + (pl.err.length || m.busy ? ' disabled' : '') + '>' + (m.busy ? L('Working…', '处理中…') : L('Turn into items', '改成事项')) + '</button>'};
}
DECK_MODALS.foldConv = fcModal;
async function fcGo(){
  var m = S.modal, reg = m && getReg(m.reg), tf = reg && rf(reg, 'tree'); if(!tf || !canSchemaEdit(reg) || m.busy) return;
  var pl = fcPlan(reg, m); if(pl.err.length) return;
  var oldFields = clone(fieldsOf(reg)), undo = pl.patches.map(function(x){ var old = {}; Object.keys(x.patch).forEach(function(k){ old[k] = x.rec.d[k] === undefined ? null : clone(x.rec.d[k]); }); return {id:x.rec.id, old:old}; });
  var oldViews = {team:clone(reg.d.views || null), mine:clone(myPrefs()['v:' + reg.id] || null)};
  m.busy = true; renderModal();
  var u = {reg:reg.id, created:[], list:undo, fields:oldFields, views:oldViews};
  try{
    if(pl.creates.length){ var cr = await STORE.createRecs(pl.creates.map(function(c){ return {id:c.id, reg:reg.id, d:c.d}; }));
      u.created = pl.creates.map(function(c){ return c.id; }).filter(getRec);
      if(cr && cr.failed) throw new Error(T('Some new items could not be created.', '部分新事项无法建立。')); }
    var res = pl.patches.length ? await setRecs(pl.patches) : null;
    if(res && res.failed) throw new Error(T(res.failed + ' items could not be moved.', res.failed + ' 个事项无法移动。'));
    var fs = clone(fieldsOf(reg)); fs.forEach(function(f){ if(f.key === tf.key) f.tree = pl.tree; });
    await STORE.patchReg(reg.id, {fields:fs});
  }catch(e){
    /* anything half done is put back */
    S.foldUndo = u; await foldUndo(true);
    m.busy = false; renderModal(); toast(errText(e) + ' ' + T('Nothing was changed.', '已全部复原。')); return;
  }
  /* the list, saved views that picked a removed sub-folder now pick where its items went */
  function newNode(id){ var d = pl.D[id]; if(!d) return 'all'; if(d.rec){ var r = getRec(d.rec); return r && r.d[tf.key] ? r.d[tf.key] : 'all'; } return d.node || 'all'; }
  var fl = rfil(reg.id); if(fl.node && pl.gone[fl.node]) fl.node = newNode(fl.node);
  function remap(list){ var ch = false; list = asArr(list).map(function(x){ if(x && x.st && x.st.f && pl.gone[x.st.f.node]){ x = clone(x); x.st.f.node = newNode(x.st.f.node); ch = true; } return x; }); return ch ? list : null; }
  var tv = remap(reg.d.views); if(tv) await STORE.patchReg(reg.id, {views:tv}).catch(function(){});
  var mv = remap(myPrefs()['v:' + reg.id]); if(mv) await savePref('v:' + reg.id, mv);
  S.foldUndo = u; S.modal = null; renderAll();
  toast(T('Done: ' + pl.creates.length + ' new items, ' + Object.keys(pl.gone).length + ' sub-folders removed', '完成：新建 ' + pl.creates.length + ' 个事项，移除 ' + Object.keys(pl.gone).length + ' 个子目录'), {act:'foldUndo', label:T('Undo', '撤销')});
}
async function foldUndo(quiet){
  var u = S.foldUndo, reg = u && getReg(u.reg); if(!reg) return; S.foldUndo = null;
  try{
    await STORE.patchReg(reg.id, {fields:u.fields});
    if(u.views && !same(reg.d.views || null, u.views.team)) await STORE.patchReg(reg.id, {views:u.views.team}).catch(function(){});
    if(u.views && !same(myPrefs()['v:' + reg.id] || null, u.views.mine)) await savePref('v:' + reg.id, u.views.mine);
    var list = u.list.filter(function(x){ return getRec(x.id); }).map(function(x){ return {id:x.id, patch:x.old}; });
    if(list.length) await STORE.patchRecs(list);
    /* the new items go, innermost first (one may sit inside another) */
    var made = {}; u.created.forEach(function(id){ made[id] = 1; });
    for(var i = u.created.length - 1; i >= 0; i--){ var r = getRec(u.created[i]); if(r && !childrenOf(r).some(function(k){ return !made[k.id]; })) await STORE.deleteRec(r.id); }
    var fl = rfil(reg.id); if(fl.node && fl.node !== 'all' && fl.node !== 'none' && !treeNode(rf(reg, 'tree'), fl.node)) fl.node = 'all';
    renderAll(); if(!quiet) toast(T('Undone', '已撤销'));
  }catch(e){ toast(errText(e)); }
}

/* ---------- events ---------- */
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act]'); if(!el) return;
  var act = el.dataset.act;
  if(act === 'fcOpen'){ var rg = getReg(el.dataset.v) || curReg(); if(rg && canSchemaEdit(rg)){ var d = el.closest('details'); if(d) d.open = false; openModal({kind:'foldConv', reg:rg.id}); } return; }
  if(act === 'fcGo'){ fcGo(); return; }
  if(act === 'foldUndo'){ foldUndo(); return; }
  var reg = curReg(); if(!reg) return;
  if(act === 'putUnder'){ var ids = bulkSelRecs(reg).map(function(r){ return r.id; }); if(ids.length){ openModal({kind:'putUnder', reg:reg.id, ids:ids, q:''}); setTimeout(function(){ var i = document.getElementById('puq'); if(i) i.focus(); }, 30); } }
  else if(act === 'putUnderGo'){ var m = S.modal, par = getRec(el.dataset.v); if(!m || !par) return; var recs = (m.ids || []).map(getRec).filter(Boolean), list = underPatches(reg, recs, par); closeModal(); S.sel = {}; rexpSet(par.id, true);
    setRecsUndo(list, T(recs.length + ' now under ', recs.length + ' 项已归到 ') + recNo(reg, par)).then(function(){ renderMain(); }); }
  else if(act === 'putTop'){ var sel = bulkSelRecs(reg).filter(function(r){ return r.d.parent; }); S.sel = {}; setRecsUndo(underPatches(reg, sel, null), T(sel.length + ' moved to the top level', sel.length + ' 项已设为顶层')).then(function(){ renderMain(); }); }
  else if(act === 'mergeOpen'){ var ms = bulkSelRecs(reg); if(ms.length > 1) openModal({kind:'merge', reg:reg.id, ids:ms.map(function(r){ return r.id; }), keep:ms[0].id}); }
  else if(act === 'mergeGo'){ var mm = S.modal; if(!mm || mm.kind !== 'merge') return; var recs2 = (mm.ids || []).map(getRec).filter(Boolean), keep = getRec(mm.keep) || recs2[0], pl = mergePlan(reg, keep, recs2.filter(function(r){ return r.id !== keep.id; }));
    closeModal(); S.sel = {};
    mergeRun(reg, pl).then(function(res){ renderAll(); toast(T(res.merged + ' merged into ', res.merged + ' 项已并入 ') + recNo(reg, keep) + (res.skip.length ? T(' · ' + res.skip.length + ' left as they were', ' · ' + res.skip.length + ' 项保留未动') : '') + T(' — restore from the Change log', '，可在修改记录中恢复')); }); }
});
document.addEventListener('change', function(e){
  var el = e.target, m = S.modal; if(!m) return;
  if(m.kind === 'merge' && el.dataset && el.dataset.mkeep){ m.keep = el.dataset.mkeep; renderModal(); return; }
  if(m.kind !== 'foldConv' || !el.dataset) return;
  var ch = m.ch || {}, id;
  if((id = el.dataset.fcmode)){ ch[id].mode = el.value; renderModal(); }
  else if((id = el.dataset.fcpkg)){ ch[id].pkg = el.value; renderModal(); }
  else if((id = el.dataset.fcinto)){ ch[id].into = el.value; renderModal(); }
});
document.addEventListener('input', function(e){
  var el = e.target, m = S.modal; if(!m || !el.dataset) return;
  if(m.kind === 'foldConv'){ var id; if((id = el.dataset.fcen)) m.ch[id].en = el.value; else if((id = el.dataset.fczh)) m.ch[id].zh = el.value; return; }
  if(m.kind === 'putUnder' && el.id === 'puq'){ m.q = el.value; clearTimeout(PU_QT); PU_QT = setTimeout(renderModal, 150); }
});
var PU_QT;
