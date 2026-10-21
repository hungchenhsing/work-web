/* work-web v3.4.3 · registers with a category tree (e.g. the turnover packages P0–P12) as an outline
   - the left list shows the top level; ▸ opens a folder's sub-folders (remembered in this browser)
   - table, phone cards and Gantt: a sub-folder is one row among the items of its parent, with its own figures
     (done / total, progress, earliest start, latest finish); ▸ opens it in place. "All" shows only the top level.
     While a search or filter is on, folders with matches open by themselves and empty ones are left out.
   - the package column shows the top level, with the full place as a tooltip */
'use strict';
UI_ICONS.folder = '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';

/* ---------- the left list ---------- */
function tOpen(reg){ var o = LS.get('ww.tOpen.' + reg.id, {}); return o && typeof o === 'object' ? o : {}; }
function tOpenSet(reg, id, on){ var o = tOpen(reg); if(on) o[id] = 1; else delete o[id]; LS.set('ww.tOpen.' + reg.id, o); }
/* rows of the list: top level, plus the sub-folders of opened folders (and of the picked one, so it stays visible) */
function treeRows(reg, tf, all){
  var open = tOpen(reg), f = rfil(reg.id), sel = f.node && f.node !== 'all' ? treeNode(tf, f.node) : null, out = [];
  if(sel) treePath(tf, sel.id).slice(0, -1).forEach(function(n){ open[n.id] = 1; });
  (function walk(pid, d){ treeKids(tf, pid).forEach(function(n){ var kids = treeKids(tf, n.id).length; out.push({n:n, d:d, kids:kids, open:all || !!open[n.id]}); if(kids && (all || open[n.id])) walk(n.id, d + 1); }); })('', 0);
  return out;
}
function treeFoldBtn(reg, x){
  if(!x.kids) return '<span class="tfold sp" aria-hidden="true"></span>';
  var lab = (x.n.code ? x.n.code + ' ' : '') + nm(x.n);
  return '<button type="button" class="tfold" data-act="tnFold" data-v="' + esc(x.n.id) + '" aria-expanded="' + x.open + '" aria-label="' + esc((x.open ? T('Hide the sub-folders of ', '收起子目录：') : T('Show the sub-folders of ', '展开子目录：')) + lab) + '">' + (x.open ? '▾' : '▸') + '</button>';
}

/* the top-level package in a table cell, the full place as a tooltip */
function treeCellHtml(f, v){
  var path = treePath(f, v), top = path[0]; if(!top) return '<span class="muted">—</span>';
  var full = path.map(treeLabel).join(' › ');
  return '<span class="tn" title="' + esc(full) + '"><span class="mono">' + esc(top.code || '') + '</span> ' + esc(nm(top)) + (path.length > 1 ? '<span class="tdeep" aria-label="' + esc(T('in ', '位于 ') + full) + '">›</span>' : '') + '</span>';
}

/* ---------- the outline ---------- */
/* which folders are open (kept in this browser). Until someone opens or closes one: a tree with sub-levels (like the
   turnover packages) starts closed, a one-level tree (like a WBS list of areas) starts open, so it reads like grouping */
function oOpen(reg){
  var o = LS.get('ww.oOpen.' + reg.id, null); if(o && typeof o === 'object') return o;
  var tf = rf(reg, 'tree'), ns = treeNodes(tf), d = {};
  if(tf && !ns.some(function(n){ return n.parent; })) ns.map(function(n){ return n.id; }).concat(['__none']).forEach(function(id){ d[id] = 1; });
  return d;
}
function oOpenSet(reg, ids, on){ var o = oOpen(reg); ids.forEach(function(id){ if(on) o[id] = 1; else delete o[id]; }); LS.set('ww.oOpen.' + reg.id, o); }
/* a search or filter other than the package is on: folders with matches open by themselves */
function oFiltered(reg){ var f = rfil(reg.id); return !!(f.q || Object.keys(f.fx || {}).some(function(k){ return f.fx[k] && f.fx[k].length; }) || f.from || f.to || f.od || f.due || f.star || f.ext || f.cmo); }
/* the outline is used for a register with a category tree, unless another grouping (or a flat list) is chosen */
function oTableGroup(reg){
  var tf = rf(reg, 'tree'), g = S.rg[reg.id] || (reg.d.group && fieldOf(reg, reg.d.group) ? reg.d.group : (tf ? '@tree' : 'none'));
  if(tf && g === tf.key) g = '@tree';
  if(!tf && (g === '@tree' || g === '@flat')) g = 'none';
  return g;
}
function oActive(reg, g){ var tf = rf(reg, 'tree'), f = rfil(reg.id); return !!tf && g === '@tree' && f.node !== 'none'; }
/* folders under the picked one (or the top), each with its own items and everything under it */
function oTree(reg, list){
  var tf = rf(reg, 'tree'), f = rfil(reg.id), root = f.node && f.node !== 'all' && treeNode(tf, f.node) ? f.node : '', by = {}, unc = [];
  list.forEach(function(r){ var v = r.d[tf.key]; if(v && treeNode(tf, v)) (by[v] = by[v] || []).push(r); else unc.push(r); });
  function build(id){ var kids = treeKids(tf, id).map(function(n){ return build(n.id); }), direct = id ? (by[id] || []) : [], all = direct.slice(); kids.forEach(function(k){ all = all.concat(k.all); }); return {id:id, n:id ? treeNode(tf, id) : null, direct:direct, kids:kids, all:all}; }
  var top = build(root);
  if(!root && unc.length) top.kids.push({id:'__none', n:{code:'', en:'Unclassified', zh:'未分类'}, direct:unc, kids:[], all:unc});
  return top;
}
/* figures of a folder: done / total, overdue, progress, plan span */
function oStats(reg, recs){
  var dn = 0, od = 0, ps = [], s = Infinity, e = -Infinity;
  recs.forEach(function(r){ if(isDone(reg, r)) dn++; if(isOverdue(reg, r)) od++; var p = progressOf(reg, r); if(p != null) ps.push(p); var pl = planOf(reg, r); if(pl){ s = Math.min(s, pl.s); e = Math.max(e, pl.f); } });
  return {n:recs.length, dn:dn, od:od, pct:ps.length ? Math.round(ps.reduce(function(a, b){ return a + b; }, 0) / ps.length) : null, s:isFinite(s) ? s : null, e:isFinite(e) ? e : null};
}
function oLabel(k){ return (k.n.code ? k.n.code + ' ' : '') + nm(k.n); }
function oCount(k){ var sub = k.kids.length; return L(k.all.length + (k.all.length === 1 ? ' item' : ' items'), k.all.length + ' 项') + (sub ? ' · ' + L(sub + (sub === 1 ? ' sub-folder' : ' sub-folders'), sub + ' 个子目录') : ''); }
function oToggle(reg, k, open, cls){
  if(!k.all.length && !k.kids.length) return '<span class="cx0" aria-hidden="true"></span>';
  return '<button type="button" class="' + (cls || 'cx') + ' otog" data-act="oTog" data-v="' + esc(k.id) + '" aria-expanded="' + open + '" aria-label="' + esc((open ? T('Close ', '收起 ') : T('Open ', '展开 ')) + oLabel(k)) + '">' + (open ? '▾' : '▸') + '</button>';
}
/* walk the outline: folders first (tree order), then the folder's own items */
function oWalk(reg, top, visit){
  var filt = oFiltered(reg), open = oOpen(reg);
  (function w(node, depth){
    node.kids.forEach(function(k){ if(filt && !k.all.length) return; var op = filt ? k.all.length > 0 : !!open[k.id]; visit.folder(k, depth, op); if(op) w(k, depth + 1); });
    if(node.direct.length) visit.items(node.direct, depth);
  })(top, 0);
}
var O_VIS = {};   // ids of the items on screen, for "select all"
/* table rows */
function oTableBody(reg, list, cols, ed){
  var ro = rolesOf(reg), span = cols.length + (ed ? 1 : 0) + (canSchemaEdit(reg) ? 1 : 0), out = '', vis = [], tf = rf(reg, 'tree');
  /* the folder's name runs from the first column to the title column, its figures sit in their own columns */
  var ti = Math.max(0, cols.map(function(f){ return f.key; }).indexOf(ro.title));
  oWalk(reg, oTree(reg, list), {
    folder:function(k, depth, open){
      var st = oStats(reg, k.all), set = {}; if(tf && k.id !== '__none') set[tf.key] = k.id;
      out += '<tr class="ofold">' + (ed ? '<td class="sel"></td>' : '') + '<td class="ofl" colspan="' + (ti + 1) + '"><div class="ofw" style="padding-left:' + (depth * 18) + 'px">' + oToggle(reg, k, open) + '<span class="mono ofcode">' + esc(k.n.code || '') + '</span><span class="ofname">' + uic('folder', 14) + ' ' + esc(nm(k.n)) + '</span><span class="ofcnt muted">' + oCount(k) + '</span>' +
          (ed && k.id !== '__none' ? '<button type="button" class="ib ofadd" data-act="grpAdd" data-reg="' + esc(reg.id) + '" data-v="' + esc(JSON.stringify(set)) + '" title="' + esc(T('New item in ', '在此目录新增：') + oLabel(k)) + '" aria-label="' + esc(T('New item in ', '在此目录新增：') + oLabel(k)) + '">' + uic('plus', 13) + '</button>' : '') + '</div></td>' + cols.slice(ti + 1).map(function(f){
        if(f.key === ro.status) return '<td><span class="mono ofst">' + st.dn + '/' + st.n + '</span>' + (st.od ? ' ' + chip('red', L(st.od + ' overdue', st.od + ' 逾期')) : '') + '</td>';
        if(f.key === ro.progress) return '<td class="t-percent">' + (st.pct != null ? pbar(st.pct, '<span class="auto" title="' + esc(T('Average of the items in this folder', '本目录事项的平均')) + '">Σ</span>') : '') + '</td>';
        if(f.key === ro.start && ro.start !== ro.finish) return '<td class="t-date"><span class="mono muted">' + (st.s != null ? esc(md(n2d(st.s))) : '') + '</span></td>';
        if(f.key === ro.finish) return '<td class="t-date"><span class="mono muted">' + (st.e != null ? esc(md(n2d(st.e))) : '') + '</span></td>';
        return '<td></td>';
      }).join('') + (canSchemaEdit(reg) ? '<td></td>' : '') + '</tr>';
    },
    items:function(items, depth){ items = sortRecs(reg, items); items.forEach(function(r){ vis.push(r.id); }); out += hierRows(reg, items, cols, ed, depth); }
  });
  O_VIS[reg.id] = vis;
  if(!list.length) out += '<tr><td colspan="' + span + '" class="empty">' + (recsOf(reg.id).length ? L('No items match the filters.', '没有符合筛选条件的记录。') : L('No items yet.', '还没有记录。')) + '</td></tr>';
  return out;
}
/* phone cards */
function oCards(reg, list){
  var out = '', vis = [];
  oWalk(reg, oTree(reg, list), {
    folder:function(k, depth, open){ var st = oStats(reg, k.all);
      out += '<div class="ofc" style="margin-left:' + (depth * 14) + 'px">' + oToggle(reg, k, open, 'ofcb') + '<span class="ofct"><b>' + esc(oLabel(k)) + '</b><span class="muted">' + oCount(k) + ' · ' + st.dn + '/' + st.n + '</span></span>' + (st.pct != null ? pbar(st.pct) : '') + '</div>'; },
    items:function(items, depth){ items = sortRecs(reg, items); out += '<div class="ofci" style="margin-left:' + (depth * 14) + 'px">' + items.map(function(r){ vis.push(r.id); return recCard(reg, r); }).join('') + '</div>'; }
  });
  O_VIS[reg.id] = vis;
  return out;
}

/* a wide table scrolled sideways: the package label of a folder row stays at the left, over the frozen columns
   (the cell it sits in spans several columns, so CSS sticky alone cannot hold it there) */
function oHs(w){ var x = w.scrollLeft; w.style.setProperty('--hx', x + 'px'); w.classList.toggle('hs', x > 0); }
document.addEventListener('scroll', function(e){ var w = e.target; if(w && w.classList && w.classList.contains('tbl-wrap') && w.querySelector('tr.ofold')) oHs(w); }, true);
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act]'); if(!el) return;
  var act = el.dataset.act, reg = curReg(); if(!reg) return;
  var refocus0 = function(sel){ setTimeout(function(){ var b = document.querySelector(sel); if(b) b.focus(); }, 0); };
  if(act === 'tnFold'){ var o = tOpen(reg); tOpenSet(reg, el.dataset.v, !o[el.dataset.v]); renderMain(); refocus0('[data-act=tnFold][data-v="' + String(el.dataset.v).replace(/"/g, '') + '"]'); }
  else if(act === 'oTog'){ var v = el.dataset.v, op = oOpen(reg); oOpenSet(reg, [v], !op[v]); S.gKeep = true; renderMain(); refocus0('[data-act=oTog][data-v="' + String(v).replace(/"/g, '') + '"]'); }
  else if(act === 'oAll'){ var tf = rf(reg, 'tree'); if(!tf) return; var ids = treeNodes(tf).map(function(n){ return n.id; }).concat(['__none']); if(el.dataset.v === '1') oOpenSet(reg, ids, true); else LS.set('ww.oOpen.' + reg.id, {}); S.gKeep = true; renderMain(); }
});
