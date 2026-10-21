/* work-web v3.4.2 · a coarse view of a register with a category tree (e.g. the turnover packages P0–P12)
   - the left list shows the top level; ▸ opens a folder's sub-folders (remembered in this browser)
   - folders marked "detail" (in the list's Edit mode) hold items that are folded out of the table, board and Gantt
     until "Show" is pressed or that folder is picked in the list; they still count in the totals and in exports
   - the package column shows the top level, with the full place as a tooltip */
'use strict';

/* folder ids marked as detail, with everything under them */
function detSet(reg, tf){
  return memo('det:' + reg.id, function(){
    var set = {}, any = false;
    function down(id){ treeKids(tf, id).forEach(function(k){ if(!set[k.id]){ set[k.id] = 1; down(k.id); } }); }
    treeNodes(tf).forEach(function(n){ if(n.det){ any = true; set[n.id] = 1; down(n.id); } });
    return any ? set : null;
  });
}
function detTree(reg){ var tf = rf(reg, 'tree'); return tf && detSet(reg, tf) ? tf : null; }
function isDetRec(reg, rec){ var tf = detTree(reg); return !!(tf && detSet(reg, tf)[rec.d[tf.key]]); }
/* detail items are shown when asked, or when a detail folder is picked in the list */
function detShown(reg){ var f = rfil(reg.id), tf = detTree(reg); if(!tf) return true; return !!f.det || (!!f.node && !!detSet(reg, tf)[f.node]); }
function detSplit(reg, list){
  if(!detTree(reg) || detShown(reg)) return {shown:list, hidden:0};
  var shown = list.filter(function(r){ return !isDetRec(reg, r); });
  return {shown:shown, hidden:list.length - shown.length};
}
function detNote(reg, list){
  var tf = detTree(reg); if(!tf) return '';
  var f = rfil(reg.id), n = list.filter(function(r){ return isDetRec(reg, r); }).length; if(!n) return '';
  if(!detShown(reg)) return '<div class="detnote" role="status">' + uic('layers', 13) + ' ' + L(n + ' detail items are folded away', '另有 ' + n + ' 项细项已收起') + ' <span class="muted">' + L('(in folders marked as detail)', '（在标为「细项」的目录中）') + '</span> <button type="button" class="lnk" data-act="detTog">' + L('Show', '显示') + '</button></div>';
  if(f.det) return '<div class="detnote on" role="status">' + uic('layers', 13) + ' ' + L(n + ' detail items shown', '已显示 ' + n + ' 项细项') + ' <button type="button" class="lnk" data-act="detTog">' + L('Fold them away', '收起') + '</button></div>';
  return '';
}

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
function detTag(n){ return n.det ? '<span class="dettag" title="' + esc(T('Detail folder: its items are folded away in the list until shown', '细项目录：其中的事项默认在列表中收起')) + '">' + L('detail', '细项') + '</span>' : ''; }

/* the top-level package in a table cell, the full place as a tooltip */
function treeCellHtml(f, v){
  var path = treePath(f, v), top = path[0]; if(!top) return '<span class="muted">—</span>';
  var full = path.map(treeLabel).join(' › ');
  return '<span class="tn" title="' + esc(full) + '"><span class="mono">' + esc(top.code || '') + '</span> ' + esc(nm(top)) + (path.length > 1 ? '<span class="tdeep" aria-label="' + esc(T('in ', '位于 ') + full) + '">›</span>' : '') + '</span>';
}

document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act]'); if(!el) return;
  var act = el.dataset.act, reg = curReg();
  if(act === 'tnFold' && reg){ var o = tOpen(reg); tOpenSet(reg, el.dataset.v, !o[el.dataset.v]); renderMain(); (function(id){ setTimeout(function(){ var b = document.querySelector('[data-act=tnFold][data-v="' + String(id).replace(/"/g, '') + '"]'); if(b) b.focus(); }, 0); })(el.dataset.v); }
  else if(act === 'detTog' && reg){ var f = rfil(reg.id); f.det = !f.det; renderMain(); }
  else if(act === 'tnDet' && reg && canSchemaEdit(reg)){ var tf = rf(reg, 'tree'); if(!tf) return; var nodes = clone(treeNodes(tf)); nodes.forEach(function(n){ if(n.id === el.dataset.v){ if(n.det) delete n.det; else n.det = true; } }); treeSave(reg, tf, nodes); }
});
