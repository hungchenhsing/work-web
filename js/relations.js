/* work-web v3.4 · relations
   1. predecessors: an item starts after others finish (finish → start, plus a gap in calendar days). Moving a
      predecessor later lists the items that would then start too early and moves them only when asked; nothing is
      ever pulled earlier. Arrows on the Gantt, red where an item starts too early.
   2. lookup / rollup fields: a calculation field (calc.op 'lk') that reads the items linked to a record.
   3. new linked item: from a record, a meeting action or a review comment.
   4. item and document numbers written in text become links; "Mentions / Mentioned in" in the Related tab. */
'use strict';

/* ======================= 1. predecessors ======================= */
/* stored on the follower: d.dep = [{id, lag}] */
function depLagOf(v){ var n = Math.round(+v || 0); return isFinite(n) ? clamp(n, -365, 365) : 0; }
function depList(rec){ var seen = {}; return asArr(rec && rec.d && rec.d.dep).filter(function(x){ if(!x || typeof x.id !== 'string' || x.id === rec.id || seen[x.id]) return false; seen[x.id] = 1; return true; }).map(function(x){ return {id:x.id, lag:depLagOf(x.lag)}; }); }
function hasDates(reg){ var ro = rolesOf(reg); return !!(reg && (ro.start || ro.finish) && reg.d.kind !== 'decks' && reg.d.kind !== 'library'); }
/* predecessor id → [{rec: the follower, lag}] */
function succIndex(){ return memo('succ', function(){ var m = new Map(); allRecs().forEach(function(r){ depList(r).forEach(function(x){ var a = m.get(x.id); if(!a){ a = []; m.set(x.id, a); } a.push({rec:r, lag:x.lag}); }); }); return m; }); }
function succsOf(rec){ return rec ? (succIndex().get(rec.id) || []).filter(function(e){ return getRec(e.rec.id) && getReg(e.rec.reg); }) : []; }
function depActStarted(reg, rec){ var a = actOf(reg, rec); return !!(a && a.s != null); }
/* the first day this item may start, from its predecessors' finish dates (null: no dated predecessors) */
function depEarliest(rec, virt){
  var e = null; depList(rec).forEach(function(x){ var pr = getRec(x.id), pg = pr && getReg(pr.reg), pp = pr && pg ? ((virt && virt[pr.id]) || planOf(pg, pr)) : null; if(pp){ var q = pp.f + 1 + x.lag; if(e == null || q > e) e = q; } });
  return e;
}
function depLate(rec){ var g = getReg(rec.reg), p = g && planOf(g, rec), e = p ? depEarliest(rec) : null; return e != null && p.s < e; }
/* the date keys to write when an item keeps its length and moves to np */
function depPatch(reg, rec, np){
  var ro = rolesOf(reg), o = {};
  if(ro.start && ro.finish && ro.start !== ro.finish){ if(rec.d[ro.start]) o[ro.start] = n2d(np.s); if(rec.d[ro.finish]) o[ro.finish] = n2d(np.f); }
  else if(ro.start) o[ro.start] = n2d(np.s); else if(ro.finish) o[ro.finish] = n2d(np.f);
  return o;
}
/* changes: [{rec, was:{s,f}|null, now:{s,f}|null}]. Followers of a changed item whose finish moved later are pushed later
   when they would start too early (keeping their length); a chain moves along. Items that are done, already started,
   read-only or changed in this same edit are not moved: they are returned as blocked. */
function depPlan(changes){
  var virt = {}, fixed = {}, q = [], moves = [], byId = {}, blocked = [], bseen = {}, cnt = {}, guard = 0;
  changes.forEach(function(c){ if(!c.rec) return; fixed[c.rec.id] = 1; if(c.now){ virt[c.rec.id] = c.now; if(!c.was || c.now.f > c.was.f) q.push(c.rec.id); } });
  function cur(r){ return virt[r.id] || planOf(getReg(r.reg), r); }
  while(q.length && guard++ < 20000){
    var pr = getRec(q.shift()), pp = pr && cur(pr); if(!pp) continue;
    succsOf(pr).forEach(function(e){
      var s = e.rec, g = getReg(s.reg), sp = cur(s); if(!sp || !hasDates(g)) return;
      var req = pp.f + 1 + e.lag; if(sp.s >= req) return;
      var why = fixed[s.id] ? 'edited' : !canWrite(g) ? 'ro' : isDone(g, s) ? 'done' : depActStarted(g, s) ? 'started' : '';
      if(why){ if(!bseen[s.id]){ bseen[s.id] = 1; blocked.push({rec:s, reg:g, why:why, req:req}); } return; }
      if((cnt[s.id] = (cnt[s.id] || 0) + 1) > 60) return;   // links that go round in a circle
      if(!byId[s.id]){ byId[s.id] = {rec:s, reg:g, from:planOf(g, s)}; moves.push(byId[s.id]); }
      virt[s.id] = {s:req, f:sp.f + (req - sp.s)}; q.push(s.id);
    });
  }
  moves.forEach(function(m){ m.to = virt[m.rec.id]; m.days = m.to.s - m.from.s; m.patch = depPatch(m.reg, m.rec, m.to); });
  return {moves:moves, blocked:blocked.filter(function(b){ return !byId[b.rec.id]; })};
}
function depChange(reg, rec, patch){ return {rec:rec, was:planOf(reg, rec), now:planOf(reg, {d:Object.assign({}, rec.d, patch)})}; }
/* every edit of a start or finish goes through here */
function datesSet(reg, rec, patch){
  if(!rec || !canWrite(reg)) return Promise.resolve();
  var plan = depPlan([depChange(reg, rec, patch)]);
  if(plan.moves.length){ openModal({kind:'depShift', items:[{id:rec.id, patch:clone(patch)}], onClose:depCancelled}); return Promise.resolve(); }
  return setRec(rec, patch).then(function(){ depWarn([rec.id], plan.blocked); });
}
/* after a batch already saved (import, bulk edit): offer to push the followers */
function depAfterBatch(changes){
  var plan = depPlan(changes.map(function(c){ var r = getRec(c.id), g = r && getReg(r.reg); return r && g ? {rec:r, was:c.was, now:planOf(g, r)} : null; }).filter(Boolean));
  if(plan.moves.length) openModal({kind:'depShift', batch:true, items:changes.map(function(c){ return {id:c.id, was:c.was}; })});
  else depWarn([], plan.blocked);
}
function depCancelled(){ S.gKeep = true; renderMain(); renderDrawer(); }
function depWarn(ids, blocked){
  var late = ids.map(getRec).filter(function(r){ return r && depLate(r); });
  if(late.length) toast(T(recLabel(late[0]) + ' starts before its predecessor allows', recLabel(late[0]) + ' 的开始早于前置事项允许的日期'));
  else if(blocked.length) toast(T(blocked.length + ' following item(s) now start too early but were not moved (done, started or read-only) — shown in red', blocked.length + ' 个后续事项现在开始得太早，但未移动（已完成、已开始或只读）— 以红色显示'));
}
function depPlanFor(m){
  if(m.batch) return depPlan(m.items.map(function(i){ var r = getRec(i.id), g = r && getReg(r.reg); return r && g ? {rec:r, was:i.was, now:planOf(g, r)} : null; }).filter(Boolean));
  return depPlan(m.items.map(function(i){ var r = getRec(i.id), g = r && getReg(r.reg); return r && g ? depChange(g, r, i.patch) : null; }).filter(Boolean));
}
var DEP_WHY = {done:['done', '已完成'], started:['already started', '已开始'], ro:['you cannot change that register', '你不能修改该台账'], edited:['changed in this same edit', '本次同时修改']};
function depShiftModal(m){
  var plan = depPlanFor(m), n = plan.moves.length, first = getRec(m.items[0] && m.items[0].id), fg = first && getReg(first.reg);
  var lead = m.batch ? L('After these changes, ' + n + ' item(s) that follow would start before their predecessors finish:', '这些修改之后，有 ' + n + ' 个后续事项会在前置事项完成前开始：')
    : L((first ? recLabel(first) : '') + ' now finishes on ' + (first && fg ? n2d(depChange(fg, first, m.items[0].patch).now.f) : '') + '. ' + n + ' item(s) that follow would start too early:', (first ? recLabel(first) : '') + ' 的完成日改为 ' + (first && fg ? n2d(depChange(fg, first, m.items[0].patch).now.f) : '') + '，有 ' + n + ' 个后续事项会开始得太早：');
  var h = '<p style="margin-top:0">' + lead + '</p>';
  if(n) h += '<div class="tbl-wrap card" style="max-height:300px"><table class="tbl dept"><thead><tr><th>' + L('No.', '编号') + '</th><th>' + L('Item', '事项') + '</th><th>' + L('Now', '现在') + '</th><th>' + L('Moves to', '移到') + '</th><th></th></tr></thead><tbody>' +
    plan.moves.map(function(mv){ return '<tr><td class="mono">' + esc(recNo(mv.reg, mv.rec) || '—') + '</td><td>' + esc(recTitle(mv.reg, mv.rec) || '—') + ' <span class="muted">' + esc(regName(mv.reg)) + '</span></td><td class="mono">' + esc(md(n2d(mv.from.s)) + ' → ' + md(n2d(mv.from.f))) + '</td><td class="mono"><b>' + esc(md(n2d(mv.to.s)) + ' → ' + md(n2d(mv.to.f))) + '</b></td><td class="mono od">+' + mv.days + T('d', '天') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  if(plan.blocked.length) h += '<p class="note">' + L('Not moved (they will show in red):', '不会移动（将以红色显示）：') + ' ' + plan.blocked.map(function(b){ return esc(recNo(b.reg, b.rec) || recTitle(b.reg, b.rec)) + ' (' + esc(T1(DEP_WHY[b.why][0], DEP_WHY[b.why][1])) + ')'; }).join(', ') + '</p>';
  h += '<p class="note">' + L('Each item keeps its length. Items are never moved earlier. Every change is in the change log and can be undone.', '每个事项保持工期不变，不会被提前。所有修改都记入修改记录，可撤销。') + '</p>';
  var foot = m.batch ? '<button type="button" class="btn pri" data-act="depAll"' + (n ? '' : ' disabled') + '>' + L('Push ' + n + ' later', '顺延 ' + n + ' 项') + '</button><button type="button" class="btn" data-act="mclose">' + L('Leave them', '保持不动') + '</button>'
    : '<button type="button" class="btn pri" data-act="depAll"' + (n ? '' : ' disabled') + '>' + L('Move them too', '一起顺延') + '</button><button type="button" class="btn" data-act="depOne">' + L('Only this item', '只改这一项') + '</button><button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button>';
  return {title:L('Move the items that follow?', '后续事项也要顺延吗？'), wide:true, html:h, foot:foot};
}
function depApply(m, all){
  var plan = depPlanFor(m), list = [];
  if(!m.batch) m.items.forEach(function(i){ var r = getRec(i.id); if(r) list.push({rec:r, patch:i.patch}); });
  if(all) plan.moves.forEach(function(mv){ list.push({rec:mv.rec, patch:mv.patch}); });
  var undo = list.map(function(x){ var o = {}; Object.keys(x.patch).forEach(function(k){ o[k] = x.rec.d[k] === undefined ? null : x.rec.d[k]; }); return {id:x.rec.id, old:o, now:clone(x.patch)}; });
  S.modal = null; renderModal(); S.gKeep = true;
  if(!all){ if(!list.length) return Promise.resolve(); var nm0 = plan.moves.length;
    return setRec(list[0].rec, list[0].patch).then(function(){ if(nm0) toast(T(nm0 + ' following item(s) now start too early — shown in red', nm0 + ' 个后续事项现在开始得太早 — 以红色显示')); }); }
  return setRecs(list).then(function(res){
    if(!res || !res.ok){ return; }
    S.lastUndo = {list:undo}; toast(T('Moved ' + res.ok + ' item(s)', '已顺延 ' + res.ok + ' 项') + (res.failed ? T(', ' + res.failed + ' failed', '，失败 ' + res.failed) : ''), {act:'quickUndo', label:T('Undo', '撤销')});
  });
}
DECK_MODALS.depShift = depShiftModal;

/* ---------- the record's "Schedule links" block ---------- */
function depItemBtn(r){ var g = getReg(r.reg); return '<button type="button" class="lnk deplnk" data-act="openRec" data-id="' + esc(r.id) + '">' + recIcon(r) + ' <span class="mono">' + esc(recNo(g, r)) + '</span> ' + esc(recTitle(g, r) || '—') + '</button>'; }
function depHtml(reg, rec, ed){
  if(!hasDates(reg) || isLibRec(rec) || isDeckRec(rec)) return '';
  var ps = depList(rec), ss = succsOf(rec), p = planOf(reg, rec);
  if(!ps.length && !ss.length && !ed) return '';
  var h = '<div class="deps"><h3 class="fsec">' + L('Schedule links', '前后关系') + '</h3><div class="depg"><div class="deph">' + L('Starts after', '前置事项') + ' <span class="note">' + L('starts the day after each of these finishes, plus the gap', '每项完成的次日（再加间隔天数）才开始') + '</span></div>';
  ps.forEach(function(x){
    var pr = getRec(x.id), pg = pr && getReg(pr.reg);
    if(!pr || !pg){ h += '<div class="deprow"><span class="muted">' + L('An item you cannot see (private or deleted)', '无法查看的事项（私有或已删除）') + '</span>' + (ed ? '<button type="button" class="ib" data-act="depDel" data-v="' + esc(x.id) + '" aria-label="' + esc(T('Remove', '移除')) + '">' + uic('x', 13) + '</button>' : '') + '</div>'; return; }
    var pp = planOf(pg, pr), req = pp ? pp.f + 1 + x.lag : null, bad = p && req != null && p.s < req;
    h += '<div class="deprow' + (bad ? ' bad' : '') + '">' + depItemBtn(pr) + '<span class="mono muted depd">' + (pp ? L('finishes ', '完成 ') + esc(n2d(pp.f)) : L('no dates', '未设日期')) + '</span>' +
      '<label class="deplag">' + L('gap', '间隔') + ' <input class="in mono" type="number" step="1" min="-365" max="365" value="' + x.lag + '" data-deplag="' + esc(x.id) + '" data-fk="deplag:' + esc(x.id) + '" aria-label="' + esc(T('Gap in days after ', '间隔天数：') + recLabel(pr)) + '"' + (ed ? '' : ' disabled') + '> ' + L('days', '天') + '</label>' +
      (ed ? '<button type="button" class="ib" data-act="depDel" data-v="' + esc(x.id) + '" aria-label="' + esc(T('Remove ', '移除 ') + recLabel(pr)) + '">' + uic('x', 13) + '</button>' : '') + '</div>';
  });
  if(!ps.length) h += '<div class="note">' + L('None', '无') + '</div>';
  var e0 = p ? depEarliest(rec) : null;
  if(p && e0 != null && p.s < e0) h += '<div class="depwarn">' + L('Starts on ' + n2d(p.s) + ' — its predecessors allow ' + n2d(e0) + ' at the earliest.', '开始日 ' + n2d(p.s) + ' 早于前置事项允许的最早日期 ' + n2d(e0) + '。') + (ed ? ' <button type="button" class="btn sm" data-act="depFix">' + L('Move to ' + n2d(e0), '改到 ' + n2d(e0)) + '</button>' : '') + '</div>';
  if(ed) h += '<button type="button" class="btn sm" data-act="depPick">' + uic('plus', 13) + ' ' + L('Add a predecessor…', '添加前置事项…') + '</button>';
  h += '</div>';
  if(ss.length) h += '<div class="depg"><div class="deph">' + L('Followed by', '后续事项') + '</div>' + ss.map(function(e){ var g = getReg(e.rec.reg), sp = planOf(g, e.rec), bad = p && sp && sp.s < p.f + 1 + e.lag;
    return '<div class="deprow' + (bad ? ' bad' : '') + '">' + depItemBtn(e.rec) + '<span class="mono muted depd">' + (sp ? L('starts ', '开始 ') + esc(n2d(sp.s)) : L('no dates', '未设日期')) + (e.lag ? ' · ' + L('gap ' + e.lag + ' d', '间隔 ' + e.lag + ' 天') : '') + '</span>' +
      (canWrite(g) && ed ? '<button type="button" class="ib" data-act="depDelS" data-v="' + esc(e.rec.id) + '" aria-label="' + esc(T('Remove the link to ', '移除与此项的关系：') + recLabel(e.rec)) + '">' + uic('x', 13) + '</button>' : '') + '</div>'; }).join('') + '</div>';
  return h + '</div>';
}
/* items that (directly or through others) start after rec: they cannot become its predecessors */
function depAfterSet(rec){ var set = {}, q = [rec]; set[rec.id] = 1; while(q.length){ succsOf(q.shift()).forEach(function(e){ if(!set[e.rec.id]){ set[e.rec.id] = 1; q.push(e.rec); } }); } return set; }
function depCands(m){
  var src = getRec(m.rec), q = (m.q || '').trim().toLowerCase(), have = {}, bad = src ? depAfterSet(src) : {}, out = [];
  depList(src).forEach(function(x){ have[x.id] = 1; });
  allRegs().filter(hasDates).forEach(function(g){ if(m.reg && m.reg !== g.id) return; recsOf(g.id).forEach(function(r){ if(!src || bad[r.id] || have[r.id]) return;
    var t = (recNo(g, r) + ' ' + (r.d[rolesOf(g).title] || '') + ' ' + (r.d[rolesOf(g).title2] || '') + ' ' + (r.d.docNo || '')).toLowerCase(); if(q && t.indexOf(q) < 0) return;
    var p = planOf(g, r); out.push({r:r, g:g, p:p, s:(q && t.indexOf(q) === 0 ? 0 : 1) + (g.id === src.reg ? 0 : 2)}); }); });
  out.sort(function(a, b){ return a.s - b.s || (a.p ? a.p.f : 1e9) - (b.p ? b.p.f : 1e9); });
  return {list:out.slice(0, 80), total:out.length};
}
function depPickModal(m){
  var src = getRec(m.rec); if(!src) return {title:'', html:''};
  m.sel = m.sel || {}; var c = depCands(m), nsel = Object.keys(m.sel).filter(function(k){ return m.sel[k]; }).length, regs = allRegs().filter(hasDates);
  var h = '<p class="note" style="margin-top:0">' + L('Choose what has to finish before ', '选择在 ') + '<b>' + esc(recLabel(src)) + '</b>' + L(' can start. Items that already come after it are not offered (that would be a loop).', ' 开始之前必须完成的事项。已经排在它后面的事项不会列出（否则会形成循环）。') + '</p>' +
    '<div class="row lpf"><label class="search" style="flex:1 1 240px">' + uic('search', 15) + '<input id="dpq" type="search" data-fk="dpq" placeholder="' + esc(T('Search number or title', '搜索编号或名称')) + '" value="' + esc(m.q || '') + '" autocomplete="off"></label>' +
    '<select class="in" id="dpreg" style="width:auto" aria-label="' + esc(T('Register', '台账')) + '"><option value="">' + esc(T('All registers', '全部台账')) + '</option>' + regs.map(function(g){ return '<option value="' + esc(g.id) + '"' + (m.reg === g.id ? ' selected' : '') + '>' + esc(regName(g)) + '</option>'; }).join('') + '</select></div>' +
    '<div class="lpl">' + (c.list.length ? c.list.map(function(it){ var r = it.r, g = it.g, on = !!m.sel[r.id], st = statusOpt(g, r);
      return '<label class="lpi' + (on ? ' on' : '') + '"><input type="checkbox" data-dpsel="' + esc(r.id) + '"' + (on ? ' checked' : '') + '><span class="rlic">' + recIcon(r) + '</span><span class="lpt"><span class="mono">' + esc(recNo(g, r)) + '</span> ' + esc(recTitle(g, r) || '—') + '</span>' + (st ? optChip(st) : '') +
        '<span class="mono muted" style="font-size:12px;white-space:nowrap">' + (it.p ? esc(md(n2d(it.p.s)) + ' → ' + md(n2d(it.p.f))) : esc(T('no dates', '未设日期'))) + '</span><span class="rlreg">' + esc(regName(g)) + '</span></label>'; }).join('') : '<div class="note" style="padding:10px">' + L('Nothing found.', '没有找到。') + '</div>') +
    (c.total > c.list.length ? '<div class="note" style="padding:8px">' + L('Showing 80 of ' + c.total + ' — search to narrow down.', '显示 ' + c.total + ' 项中的 80 项，请搜索缩小范围。') + '</div>' : '') + '</div>';
  return {title:L('Add predecessors', '添加前置事项'), wide:true, html:h, foot:'<button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button><button type="button" class="btn pri" data-act="depGo"' + (nsel ? '' : ' disabled') + '>' + L('Add ' + (nsel || ''), '添加 ' + (nsel || '')) + '</button>'};
}
DECK_MODALS.depPick = depPickModal;
function depText(v){ return asArr(v).map(function(x){ var r = x && getRec(x.id), g = r && getReg(r.reg); return (r && g ? recNo(g, r) || recTitle(g, r) : '?') + (x && +x.lag ? ' (' + (x.lag > 0 ? '+' : '') + x.lag + 'd)' : ''); }).join(', '); }

/* ---------- arrows on the Gantt (drawn over the bars that are on the page) ---------- */
function depShowArrows(){ var v = LS.get('ww.gdep', 1); return v !== 0 && v !== '0'; }
function depAny(recs){ return recs.some(function(r){ return depList(r).length || succsOf(r).length; }); }
function depDraw(){
  var gin = document.querySelector('#gwrap .gin'); if(!gin) return;
  var svg = gin.querySelector('svg.gdeps');
  if(!depShowArrows()){ if(svg) svg.parentNode.removeChild(svg); return; }
  var bars = {}; Array.prototype.forEach.call(gin.querySelectorAll('.bw[data-id],.msw[data-id]'), function(b){ bars[b.dataset.id] = b; });
  var ids = Object.keys(bars), base = gin.getBoundingClientRect(), paths = '';
  function box(el){ var r = (el.classList.contains('msw') ? (el.querySelector('i') || el) : el).getBoundingClientRect(); return {l:r.left - base.left, r:r.right - base.left, t:r.top - base.top, b:r.bottom - base.top, m:(r.top + r.bottom) / 2 - base.top}; }
  ids.forEach(function(id){ var rec = getRec(id); if(!rec) return; var reg = getReg(rec.reg), p = reg && planOf(reg, rec);
    depList(rec).forEach(function(x){ var pb = bars[x.id]; if(!pb) return; var pr = getRec(x.id), pg = pr && getReg(pr.reg), pp = pg && planOf(pg, pr); if(!pp || !p) return;
      var a = box(pb), b = box(bars[id]), bad = p.s < pp.f + 1 + x.lag, x1 = a.r, y1 = a.m, x2 = b.l - 1, y2 = b.m, d;
      if(x2 - x1 >= 12) d = 'M' + x1 + ' ' + y1 + 'H' + (x1 + 6) + 'V' + y2 + 'H' + x2;
      else { var ym = y2 > y1 ? b.t - 4 : b.b + 4; d = 'M' + x1 + ' ' + y1 + 'H' + (x1 + 6) + 'V' + ym + 'H' + (x2 - 8) + 'V' + y2 + 'H' + x2; }
      paths += '<path d="' + d + '" class="' + (bad ? 'bad' : '') + '" marker-end="url(#' + (bad ? 'gdAb' : 'gdA') + ')"><title>' + esc(recLabel(pr) + ' → ' + recLabel(rec) + (bad ? ' · ' + T('starts too early', '开始过早') : '')) + '</title></path>'; }); });
  if(!svg){ svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'gdeps'); svg.setAttribute('aria-hidden', 'true'); gin.appendChild(svg); }
  svg.setAttribute('width', gin.scrollWidth); svg.setAttribute('height', gin.scrollHeight);
  svg.innerHTML = '<defs><marker id="gdA" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" class="mk"/></marker><marker id="gdAb" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" class="mk bad"/></marker></defs>' + paths;
}
var DEP_RAF = 0;
function depSoon(){ if(DEP_RAF) return; DEP_RAF = requestAnimationFrame(function(){ DEP_RAF = 0; setTimeout(depDraw, 0); }); }
document.addEventListener('scroll', function(e){ if(e.target && e.target.id === 'gwrap') depSoon(); }, true);
document.addEventListener('pointermove', function(){ if(typeof DR !== 'undefined' && DR && DR.moved) depSoon(); });
window.addEventListener('resize', depSoon);

/* ---------- events ---------- */
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act]'); if(!el) return;
  var act = el.dataset.act, v = el.dataset.v, rec = S.open && getRec(S.open), reg = rec && getReg(rec.reg);
  switch(act){
    case 'depPick': if(rec){ openModal({kind:'depPick', rec:rec.id, q:'', reg:'', sel:{}}); setTimeout(function(){ var i = $('#dpq'); if(i) i.focus(); }, 30); } break;
    case 'depGo': (function(){ var m = S.modal, src = m && getRec(m.rec), g = src && getReg(src.reg); if(!src || !canWrite(g)) return; var add = Object.keys(m.sel).filter(function(k){ return m.sel[k] && getRec(k); }); if(!add.length) return;
      var bad = depAfterSet(src), cur = depList(src); add.forEach(function(id){ if(!bad[id] && !cur.some(function(x){ return x.id === id; })) cur.push({id:id, lag:0}); });
      closeModal(); setRec(src, {dep:cur}).then(function(){ if(depLate(getRec(src.id))) toast(T('It now starts before its predecessors allow — see Schedule links', '现在开始日早于前置事项允许的日期 — 见「前后关系」')); }); })(); break;
    case 'depDel': if(rec && canWrite(reg)) setRec(rec, {dep:depList(rec).filter(function(x){ return x.id !== v; })}); break;
    case 'depDelS': (function(){ var s = getRec(v), g = s && getReg(s.reg); if(!s || !rec || !canWrite(g)) return; setRec(s, {dep:depList(s).filter(function(x){ return x.id !== rec.id; })}); })(); break;
    case 'depFix': (function(){ if(!rec || !canWrite(reg)) return; var p = planOf(reg, rec), e0 = depEarliest(rec); if(!p || e0 == null || p.s >= e0) return; datesSet(reg, rec, depPatch(reg, rec, {s:e0, f:p.f + (e0 - p.s)})); })(); break;
    case 'depAll': if(S.modal && S.modal.kind === 'depShift') depApply(S.modal, true); break;
    case 'depOne': if(S.modal && S.modal.kind === 'depShift') depApply(S.modal, false); break;
  }
});
document.addEventListener('change', function(e){
  var el = e.target, rec = S.open && getRec(S.open), reg = rec && getReg(rec.reg);
  if(el.dataset && el.dataset.deplag != null && rec && canWrite(reg)){ var id = el.dataset.deplag, lag = depLagOf(el.value); setRec(rec, {dep:depList(rec).map(function(x){ return x.id === id ? {id:id, lag:lag} : x; })}); return; }
  if(el.dataset && el.dataset.dpsel && S.modal && S.modal.kind === 'depPick'){ S.modal.sel[el.dataset.dpsel] = el.checked; renderModal(); return; }
  if(el.id === 'dpreg' && S.modal && S.modal.kind === 'depPick'){ S.modal.reg = el.value; renderModal(); return; }
  if(el.id === 'gDep'){ LS.set('ww.gdep', el.checked ? 1 : 0); depDraw(); return; }
});
var DEP_QT;
document.addEventListener('input', function(e){
  var el = e.target; if(e.isComposing) return;
  if(el.id === 'dpq' && S.modal && S.modal.kind === 'depPick'){ S.modal.q = el.value; clearTimeout(DEP_QT); DEP_QT = setTimeout(renderModal, 150); }
});

/* ======================= 2. lookup / rollup fields =======================
   Stored as a calculation field {type:'calc', calc:{op:'lk', dir, reg, via, fn, of}} so the database needs no change:
   dir  'out' items this one links to · 'in' items that link to this one · 'kids' its sub-items
   reg  only items of this register ('' = any) · via '' any link, 'rel' the Related tab, or a link field's key
   fn   count · open · done · pct · show (a field's values) · sum · min · max · of = that field's key */
var LK_FN = [['count', 'Number of items', '项目数'], ['open', 'Not done yet', '未完成数'], ['done', 'Done', '已完成数'], ['pct', '% done', '完成率'], ['show', 'Show a field of each', '显示其字段'], ['sum', 'Total of a field', '字段合计'], ['min', 'Earliest / smallest', '最早 / 最小'], ['max', 'Latest / largest', '最晚 / 最大']];
var LK_DIR = [['in', 'Items that link to this one', '关联到本项的记录'], ['out', 'Items this one links to', '本项关联的记录'], ['kids', 'Its sub-items', '本项的子项']];
function isLk(f){ return !!(f && f.type === 'calc' && f.calc && f.calc.op === 'lk'); }
function lkNeedsField(fn){ return ['show', 'sum', 'min', 'max'].indexOf(fn) >= 0; }
function lkCfg(f){ var c = (f && f.calc) || {}, s = function(x){ return typeof x === 'string' ? x : ''; };
  return {dir:c.dir === 'out' || c.dir === 'kids' ? c.dir : 'in', reg:s(c.reg), via:s(c.via), fn:LK_FN.some(function(x){ return x[0] === c.fn; }) ? c.fn : 'count', of:s(c.of)}; }
function lkRecs(rec, f){
  var c = lkCfg(f), out = [], seen = {};
  if(!rec) return out;
  if(c.dir === 'kids') return childrenOf(rec);
  relsOf(rec).forEach(function(e){
    if(e.t === 'men' || e.dir !== c.dir) return;
    if(c.via === 'rel' ? !!e.field : (c.via && !(e.field && e.field.key === c.via))) return;
    var r = getRec(e.id); if(!r || seen[r.id] || isDeckRec(r) || (c.reg && r.reg !== c.reg) || !getReg(r.reg)) return;
    seen[r.id] = 1; out.push(r);
  });
  return out;
}
function lkFieldOk(fn, x){
  if(!x || ['files', 'sub', 'link', 'section'].indexOf(x.type) >= 0 || isLk(x)) return false;
  if(fn === 'sum') return ['number', 'percent', 'calc'].indexOf(x.type) >= 0;
  if(fn === 'min' || fn === 'max') return ['date', 'number', 'percent', 'calc'].indexOf(x.type) >= 0;
  return true;
}
/* {v: value for sorting / export, t: text, kind: num | pct | date | text, n: items counted, recs, groups (show)} */
function lkCalc(rec, f){
  var m = memo('lk', function(){ return new Map(); }), k = rec.id + '|' + f.key; if(m.has(k)) return m.get(k);
  var c = lkCfg(f), rs = lkRecs(rec, f), out = {n:rs.length, recs:rs, v:null, t:'', kind:'num'};
  var doneN = function(){ return rs.filter(function(r){ return isDone(getReg(r.reg), r); }).length; };
  if(c.fn === 'count') out.v = rs.length;
  else if(c.fn === 'open') out.v = rs.length - doneN();
  else if(c.fn === 'done') out.v = doneN();
  else if(c.fn === 'pct'){ out.kind = 'pct'; out.v = rs.length ? Math.round(doneN() / rs.length * 100) : null; }
  else if(c.of){
    var vals = []; rs.forEach(function(r){ var g = getReg(r.reg), tf = g && fieldOf(g, c.of); if(tf && lkFieldOk(c.fn, tf)) vals.push({r:r, g:g, tf:tf, v:val(r, tf)}); });
    if(c.fn === 'show'){
      out.kind = 'text'; var groups = [], by = {};
      vals.forEach(function(x){ if(isEmpty(x.v)) return; var t = textOf(x.g, x.tf, x.r); if(!t) return; if(!by[t]){ by[t] = {t:t, x:x, n:0}; groups.push(by[t]); } by[t].n++; });
      out.groups = groups; out.v = groups.length ? groups.map(function(gr){ return gr.t + (gr.n > 1 ? ' ×' + gr.n : ''); }).join(', ') : null;
    } else if(c.fn === 'sum'){
      var s = 0, any = false; vals.forEach(function(x){ var n = num(x.v); if(n != null){ s += n; any = true; } });
      out.v = any ? Math.round(s * 1000) / 1000 : null; out.unit = (vals[0] && vals[0].tf.unit) || '';
    } else {
      var dates = vals.some(function(x){ return x.tf.type === 'date'; }), best = null;
      vals.forEach(function(x){ var n = dates ? d2n(x.v) : num(x.v); if(n == null) return; if(best == null || (c.fn === 'min' ? n < best : n > best)) best = n; });
      out.kind = dates ? 'date' : 'num'; out.v = best == null ? null : dates ? n2d(best) : best;
    }
  }
  out.t = out.v == null ? '' : out.kind === 'pct' ? out.v + '%' : out.kind === 'num' ? String(out.v) + (out.unit ? ' ' + out.unit : '') : String(out.v);
  m.set(k, out); return out;
}
function lkSort(rec, f){ var r = lkCalc(rec, f); if(r.v == null) return r.kind === 'text' ? '' : -1e15; return r.kind === 'date' ? d2n(r.v) : r.kind === 'text' ? String(r.v).toLowerCase() : +r.v; }
function lkGroupHtml(gr){ var x = gr.x, h = ['select', 'tree', 'percent', 'check', 'date'].indexOf(x.tf.type) >= 0 ? cellHtml(x.g, x.tf, x.r) : '<span>' + esc(gr.t) + '</span>'; return h + (gr.n > 1 ? '<span class="muted mono">×' + gr.n + '</span>' : ''); }
function lkCell(reg, f, rec){
  var r = lkCalc(rec, f);
  if(r.v == null || r.v === '') return '<span class="muted">—</span>';
  if(r.kind === 'pct') return pbar(r.v);
  if(r.kind === 'date') return '<span class="mono">' + esc(md(r.v)) + '</span>';
  if(r.kind === 'text'){ var gs = r.groups || []; return '<span class="lkv">' + gs.slice(0, 4).map(lkGroupHtml).join(' ') + (gs.length > 4 ? ' <span class="muted">+' + (gs.length - 4) + '</span>' : '') + '</span>'; }
  return '<span class="mono">' + esc(Number(r.v).toLocaleString()) + (r.unit ? ' <span class="muted">' + esc(r.unit) + '</span>' : '') + '</span>';
}
/* in a record: the value and the items it was worked out from */
function lkDrawer(reg, f, rec){
  var r = lkCalc(rec, f), c = lkCfg(f), rs = r.recs;
  var h = '<div class="ro lkro"><div class="row">' + lkCell(reg, f, rec) + ' <span class="note">' + esc(lkDescribe(reg, f)) + '</span></div>';
  if(rs.length) h += '<div class="lkl">' + rs.slice(0, 12).map(function(x){ var g = getReg(x.reg), st = statusOpt(g, x), tf = c.of && fieldOf(g, c.of), sv = lkNeedsField(c.fn) && tf ? textOf(g, tf, x) : '';
    return '<button type="button" class="rchip" data-act="openRec" data-id="' + esc(x.id) + '" title="' + esc(recLabel(x)) + '">' + recIcon(x) + '<span>' + esc(recNo(g, x) || recTitle(g, x) || '—') + '</span>' + (sv ? '<i>' + esc(sv) + '</i>' : st ? '<i>' + esc(nm(st)) + '</i>' : '') + '</button>'; }).join('') + (rs.length > 12 ? '<span class="note">+' + (rs.length - 12) + '</span>' : '') + '</div>';
  return h + '</div>';
}
function lkDescribe(reg, f){
  var c = lkCfg(f), tg = c.dir === 'kids' ? reg : getReg(c.reg), fn = LK_FN.filter(function(x){ return x[0] === c.fn; })[0], d = LK_DIR.filter(function(x){ return x[0] === c.dir; })[0], tf = tg && c.of ? fieldOf(tg, c.of) : null;
  return T1(fn[1], fn[2]) + (tf ? ' · ' + T1(tf.en, tf.zh) : '') + ' — ' + T1(d[1], d[2]) + (c.dir !== 'kids' ? ' · ' + (tg ? regName(tg) : T('any register', '任意台账')) : '');
}
/* the field settings */
function lkEditor(reg, f, i, d){
  var c = lkCfg(f), a = function(k){ return ' data-fm="' + i + ':lk:' + k + '"'; }, opt = function(v, t, on){ return '<option value="' + esc(v) + '"' + (on ? ' selected' : '') + '>' + esc(t) + '</option>'; };
  var regs = allRegs().filter(function(r){ return r.d.kind !== 'decks'; }), tg = c.dir === 'kids' ? reg : getReg(c.reg);
  var vias = c.dir === 'out' ? d.fields.filter(function(x){ return x.type === 'link'; }) : c.dir === 'in' && tg ? dataFields(tg).filter(function(x){ return x.type === 'link' && (!asArr(x.link).length || asArr(x.link).indexOf(reg.id) >= 0); }) : [];
  var h = '<label class="fl">' + L('Which items', '取哪些记录') + '<select class="in"' + a('dir') + '>' + LK_DIR.map(function(x){ return opt(x[0], T(x[1], x[2]), c.dir === x[0]); }).join('') + '</select></label>';
  if(c.dir !== 'kids'){
    h += '<label class="fl">' + L('From register', '来自台账') + '<select class="in"' + a('reg') + '>' + opt('', T('Any register', '任意台账'), !c.reg) + regs.map(function(r){ return opt(r.id, regName(r), c.reg === r.id); }).join('') + '</select></label>';
    h += '<label class="fl">' + L('Through', '通过') + '<select class="in"' + a('via') + '>' + opt('', T('Any kind of link', '任何关联'), !c.via) + opt('rel', T('Links in the Related tab', '「相关」分页中的关联'), c.via === 'rel') + vias.map(function(x){ return opt(x.key, T('Field: ', '字段：') + T1(x.en, x.zh), c.via === x.key); }).join('') + '</select></label>';
  }
  h += '<label class="fl">' + L('Show', '显示') + '<select class="in"' + a('fn') + '>' + LK_FN.map(function(x){ return opt(x[0], T(x[1], x[2]), c.fn === x[0]); }).join('') + '</select></label>';
  if(lkNeedsField(c.fn)){
    if(!tg) h += '<p class="note">' + L('Choose a register first, then its field.', '请先选择台账，再选择其字段。') + '</p>';
    else { var ofs = dataFields(tg).filter(function(x){ return lkFieldOk(c.fn, x); }); h += '<label class="fl">' + L('Field', '字段') + '<select class="in"' + a('of') + '>' + opt('', '', !c.of) + ofs.map(function(x){ return opt(x.key, T1(x.en, x.zh), c.of === x.key); }).join('') + '</select></label>'; }
  }
  return h + '<p class="note full">' + L('Read only, worked out from the linked items each time; items you cannot see are not counted. Not shown on public links or to the Owner.', '只读，每次按关联记录计算；你看不到的记录不计入。公开链接和业主页面不显示。') + '</p>';
}
function lkProblem(f){ var c = lkCfg(f); if(lkNeedsField(c.fn) && (!c.of || (c.dir !== 'kids' && !c.reg))) return T('choose the register and the field to read', '请选择要读取的台账和字段'); return ''; }

/* ======================= 3. new linked item =======================
   From a record (⋯ → New linked item…), a meeting action or a review comment. The new item is linked back, takes the
   fields the two registers share (same code and kind: area, discipline, responsible…), and — from an action or a
   comment — its title, due date and responsible person. The action / comment then shows the new item. */
function nlTargets(){ return allRegs().filter(function(g){ return canWrite(g) && hasOwnD(g) && ['decks', 'library', 'people', 'transmittals'].indexOf(g.d.kind || '') < 0; }); }
function hasOwnD(g){ return !!(g && g.d && rolesOf(g).title); }
function nlRow(src, sg, row){
  if(!row) return null; var f = fieldOf(sg, row.k), x = f && asArr(src.d[f.key]).filter(function(y){ return y && y._id === row.id; })[0]; if(!x) return null;
  if(f.kind === 'comments') return {f:f, x:x, text:String(x.cmt || ''), pre:recNo(sg, src) + ' #' + (x.no || '') + (x.rev ? ' (Rev. ' + x.rev + ')' : ''), due:'', who:null};
  var a = actionCols(f); return {f:f, x:x, text:String(x[a.tk] || ''), pre:recNo(sg, src), due:a.dk ? x[a.dk] || '' : '', who:a.wc ? x[a.wc.key] : null, whoCol:a.wc};
}
/* what the new item starts with, and a readable list of what was filled in */
function nlBuild(m){
  var src = getRec(m.src), sg = src && getReg(src.reg), g = getReg(m.reg); if(!src || !sg || !g) return null;
  var ro = rolesOf(g), d = {}, fills = [], rw = nlRow(src, sg, m.row);
  var tpl = m.tpl ? regTpls(g).filter(function(t){ return t.id === m.tpl; })[0] : null;
  function fill(f, v, from){ d[f.key] = v; fills.push([T1(f.en, f.zh), textOf(g, f, null, v) + (from ? ' (' + from + ')' : '')]); }
  if(tpl){ var td = tplData(tpl); Object.keys(td).forEach(function(k){ if(!fieldOf(g, k)) delete td[k]; }); td = shapeData(g, td); Object.keys(td).forEach(function(k){ var tf = fieldOf(g, k); if(tf && !isEmpty(td[k]) && tf.type !== 'sub') fill(tf, td[k], T('template', '模板')); else d[k] = td[k]; }); }
  var skip = [ro.no, ro.title, ro.title2, ro.status, ro.progress, ro.start, ro.finish, ro.base, ro.astart, ro.afinish, ro.kind].filter(Boolean);
  if(rw && rw.text.trim()){
    var lines = rw.text.trim().split(/\n+/), t1 = lines[0].trim(), cut = t1.length > 120 || lines.length > 1;
    if(ro.title && isEmpty(d[ro.title])) fill(fieldOf(g, ro.title), t1.length > 120 ? t1.slice(0, 118) + '…' : t1);
    var lf = dataFields(g).filter(function(f){ return f.type === 'long'; }), lng = lf.filter(function(f){ return /desc|detail|remark|note|issue|comment/i.test(f.key); })[0] || lf[0];
    if(lng && isEmpty(d[lng.key])) fill(lng, (rw.pre ? rw.pre + ': ' : '') + (cut ? rw.text.trim() : t1));
  }
  if(rw && rw.due && ro.finish && isEmpty(d[ro.finish]) && d2n(rw.due) != null) fill(fieldOf(g, ro.finish), rw.due);
  if(rw && !isEmpty(rw.who)){ var pf = dataFields(g).filter(function(f){ return f.type === 'select' && f.list === 'people'; }), wf = pf.filter(function(f){ return /resp|owner|who|assign|action/i.test(f.key); })[0] || pf[0];
    if(wf && isEmpty(d[wf.key]) && rw.whoCol && rw.whoCol.list === 'people'){ var wv = asArr(rw.who).filter(Boolean); if(wv.length) fill(wf, wf.multi ? wv : wv[0]); } }
  /* shared lists only (area, discipline, people, subcontractor…): the same code can mean different things in free text */
  dataFields(g).forEach(function(tf){
    if(skip.indexOf(tf.key) >= 0 || !isEmpty(d[tf.key]) || tf.type !== 'select' || !tf.list) return;
    var sf = fieldOf(sg, tf.key); if(!sf || sf.type !== 'select' || sf.list !== tf.list) return; var v = asArr(clone(src.d[sf.key])).filter(function(x){ return x !== '' && x != null; }); if(!v.length) return;
    fill(tf, tf.multi ? v : v[0]);
  });
  var t = REL_T[m.t] ? m.t : 'rel', via = '';
  var lk = t === 'rel' ? dataFields(g).filter(function(f){ return f.type === 'link' && asArr(f.link).indexOf(sg.id) >= 0; })[0] : null;
  if(lk){ d[lk.key] = asArr(d[lk.key]).filter(function(id){ return id !== src.id; }).concat([src.id]); via = T1(lk.en, lk.zh); }
  else { d.rel = asArr(d.rel).filter(function(x){ return x && x.to !== src.id; }).concat([{to:src.id, t:t}]); via = T1(REL_T[t][0], REL_T[t][1]); }
  return {d:d, fills:fills, via:via, src:src, sg:sg, g:g, rw:rw};
}
function nlModal(m){
  var src = getRec(m.src); if(!src) return {title:'', html:''};
  var regs = nlTargets(); if(!m.reg || !regs.some(function(g){ return g.id === m.reg; })) m.reg = (regs[0] || {}).id || '';
  var g = getReg(m.reg), tpls = g ? regTpls(g) : [], b = nlBuild(m), opt = function(v, t, on){ return '<option value="' + esc(v) + '"' + (on ? ' selected' : '') + '>' + esc(t) + '</option>'; };
  if(!regs.length) return {title:L('New linked item', '新增关联项目'), html:'<p class="note">' + L('There is no register you can add items to.', '没有你可以新增项目的台账。') + '</p>'};
  var h = '<p style="margin-top:0">' + L('From ', '来源：') + '<b>' + esc(recLabel(src)) + '</b>' + (b && b.rw ? '<br><span class="note">' + esc(b.rw.pre) + ' · ' + esc(b.rw.text.slice(0, 160)) + (b.rw.text.length > 160 ? '…' : '') + '</span>' : '') + '</p><div class="fg">' +
    '<label class="fl">' + L('Create in', '新增到') + '<select class="in" id="nlReg">' + regs.map(function(r){ return opt(r.id, regName(r), r.id === m.reg); }).join('') + '</select></label>' +
    (tpls.length ? '<label class="fl">' + L('Start from a template', '套用模板') + '<select class="in" id="nlTpl">' + opt('', T('No template', '不用模板'), !m.tpl) + tpls.map(function(t){ return opt(t.id, t.name, m.tpl === t.id); }).join('') + '</select></label>' : '') +
    '<label class="fl">' + L('Kind of link', '关联类型') + '<select class="in" id="nlT">' + REL_ORDER.map(function(t){ return opt(t, T1(REL_T[t][0], REL_T[t][1]), (m.t || 'rel') === t); }).join('') + '</select></label></div>';
  if(b) h += '<div class="nlprev"><div class="note">' + L('The new item will be linked to ', '新项目将关联到 ') + esc(recNo(b.sg, src) || recTitle(b.sg, src)) + ' (' + esc(b.via) + ')' + L(' and start with:', '，并预先填入：') + '</div>' +
    (b.fills.length ? '<ul>' + b.fills.map(function(x){ return '<li><b>' + esc(x[0]) + '</b> ' + esc(String(x[1]).slice(0, 140)) + '</li>'; }).join('') + '</ul>' : '<p class="note">' + L('Nothing else — the two registers share no fields.', '没有其他内容 — 两个台账没有共同字段。') + '</p>') + '</div>';
  return {title:L('New linked item', '新增关联项目'), html:h, foot:'<button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button><button type="button" class="btn pri" data-act="nlGo"' + (b ? '' : ' disabled') + '>' + L('Create and open', '新增并打开') + '</button>'};
}
DECK_MODALS.newLinked = nlModal;
function nlGo(){
  var m = S.modal, b = m && nlBuild(m); if(!b || !canWrite(b.g)) return;
  LS.set('ww.nlReg.' + b.sg.id, b.g.id); closeModal();
  var row = m.row;
  createRec(b.g, b.d).then(function(id){
    if(!id) return; var nr = getRec(id);
    if(b.rw) S.newBlank = null;   // its title came from the action / comment: keep it even if closed at once
    if(row && canWrite(b.sg)){ var cur = getRec(b.src.id), f = cur && fieldOf(b.sg, row.k); if(f) setRec(cur, mk(f.key, asArr(cur.d[f.key]).map(function(x){ if(x && x._id === row.id){ x = clone(x); x.lk = id; } return x; })), {silent:true}); }
    toast(T('Added ' + (nr ? recLabel(nr) : '') + ', linked to ' + recLabel(b.src), '已新增 ' + (nr ? recLabel(nr) : '') + '，并关联到 ' + recLabel(b.src)));
  });
}
function nlOpen(srcId, row){ var src = getRec(srcId), sg = src && getReg(src.reg); if(!src || !sg) return; openModal({kind:'newLinked', src:src.id, row:row || null, reg:LS.get('ww.nlReg.' + sg.id, ''), tpl:'', t:'rel'}); }
/* the item made from an action / comment, as a chip */
function nlChip(x){ var r = x && x.lk && getRec(x.lk), g = r && getReg(r.reg); return r && g ? '<button type="button" class="rchip nlchip" data-act="openRec" data-id="' + esc(r.id) + '" title="' + esc(recLabel(r)) + '">' + recIcon(r) + '<span>' + esc(recNo(g, r) || recTitle(g, r)) + '</span>' + (statusOpt(g, r) ? '<i>' + esc(nm(statusOpt(g, r))) + '</i>' : '') + '</button>' : ''; }
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act]'); if(!el) return;
  var act = el.dataset.act;
  if(act === 'nlOpen'){ closePop(); var dm = el.closest('details.menu'); if(dm) dm.removeAttribute('open'); nlOpen(el.dataset.id || S.open); }
  else if(act === 'nlRow'){ nlOpen(el.dataset.id || S.open, {k:el.dataset.sub, id:el.dataset.row}); }
  else if(act === 'nlGo') nlGo();
});
document.addEventListener('change', function(e){
  var el = e.target, m = S.modal; if(!m || m.kind !== 'newLinked') return;
  if(el.id === 'nlReg'){ m.reg = el.value; m.tpl = ''; renderModal(); } else if(el.id === 'nlTpl'){ m.tpl = el.value; renderModal(); } else if(el.id === 'nlT'){ m.t = el.value; renderModal(); }
});

/* ======================= 4. numbers in text =======================
   Item numbers (TDS-002, PL-015) and document numbers (E-ASB-001) written in text open that record. A number used by
   more than one record asks which. Mentions also show in the Related tab ("Mentions" / "Mentioned in"). */
REL_T.men = ['Mentions', '提及', 'Mentioned in', '被提及于'];
function numKeyOk(s){ return typeof s === 'string' && s.length >= 3 && s.length <= 40 && /[A-Za-z]/.test(s) && /\d/.test(s) && !/\s/.test(s); }
/* NUMBER → [record ids] */
function numIndex(){ return memo('nums', function(){
  var m = new Map(); function add(k, id){ if(!numKeyOk(k)) return; k = k.toUpperCase(); var a = m.get(k); if(!a){ a = []; m.set(k, a); } if(a.indexOf(id) < 0) a.push(id); }
  allRecs().forEach(function(r){ var g = getReg(r.reg); if(!g || g.d.kind === 'decks') return; var n = recNo(g, r); if(n) add(String(n).trim(), r.id); if(typeof r.d.docNo === 'string' && r.d.docNo.trim()) add(r.d.docNo.trim(), r.id); });
  return m; }); }
var NUM_RE = /[A-Za-z0-9]+(?:[-_.\/][A-Za-z0-9]+)*/g, URL_RE = /https?:\/\/[^\s<>"']+/g;
/* the numbers found in a text: [{i, len, tok, key, ids}] */
function numHits(text){
  var out = []; text = String(text || ''); if(!text || !/\d/.test(text)) return out;
  var idx = numIndex(); if(!idx.size) return out;
  var urls = []; text.replace(URL_RE, function(u, at){ urls.push([at, at + u.length]); return u; });
  function inUrl(i){ return urls.some(function(u){ return i >= u[0] && i < u[1]; }); }
  text.replace(NUM_RE, function(tok, at){
    if(!/\d/.test(tok) || !/[A-Za-z]/.test(tok) || inUrl(at)) return tok;
    var k = tok.toUpperCase(), ids = idx.get(k);
    if(ids){ out.push({i:at, len:tok.length, tok:tok, key:k, ids:ids}); return tok; }
    if(tok.indexOf('/') > 0){ var off = 0; tok.split('/').forEach(function(p){ var ii = idx.get(p.toUpperCase()); if(ii) out.push({i:at + off, len:p.length, tok:p, key:p.toUpperCase(), ids:ii}); off += p.length + 1; }); }   // SW-001/SW-002
    return tok;
  });
  return out;
}
function numVisible(ids, self){ return ids.filter(function(id){ return id !== self && getRec(id) && getReg(getRec(id).reg); }); }
/* text → HTML with the numbers as links (plain text on public pages and in the Owner's view) */
function numLink(text, self){
  text = String(text == null ? '' : text);
  if(lkHidden()) return esc(text);
  var hits = numHits(text), out = '', at = 0;
  hits.forEach(function(h){ var ids = numVisible(h.ids, self); if(!ids.length) return; var r = getRec(ids[0]);
    out += esc(text.slice(at, h.i)) + '<button type="button" class="nlk" data-act="numOpen" data-v="' + esc(h.key) + '" data-self="' + esc(self || '') + '" title="' + esc(ids.length > 1 ? T(ids.length + ' records use this number', ids.length + ' 条记录使用此编号') : recLabel(r)) + '">' + esc(h.tok) + '</button>'; at = h.i + h.len; });
  return out + esc(text.slice(at));
}
/* the records a text mentions, as chips (under text boxes, which cannot hold links) */
function menRecs(text, self){ var seen = {}, out = []; numHits(text).forEach(function(h){ numVisible(h.ids, self).forEach(function(id){ if(!seen[id]){ seen[id] = 1; out.push(getRec(id)); } }); }); return out; }
function menInner(text, self){ var rs = menRecs(text, self); if(!rs.length) return '';
  return '<span class="note">' + L('Mentions', '提及') + '</span>' + rs.slice(0, 10).map(function(r){ var g = getReg(r.reg), lib = isLibRec(r); return '<button type="button" class="rchip" data-act="openRec" data-id="' + esc(r.id) + '" title="' + esc(recLabel(r)) + '">' + recIcon(r) + '<span>' + esc((lib && r.d.docNo) || recNo(g, r) || recTitle(g, r)) + '</span><i>' + esc(lib ? docTitle(r) : recTitle(g, r) || '') + '</i></button>'; }).join('') + (rs.length > 10 ? '<span class="note">+' + (rs.length - 10) + '</span>' : ''); }
function menChips(text, self, key){ if(lkHidden()) return ''; var inner = menInner(text, self); return key ? '<div class="menc" data-men="' + esc(key) + '" data-self="' + esc(self || '') + '">' + inner + '</div>' : (inner ? '<div class="menc">' + inner + '</div>' : ''); }
/* for the Related tab: every text and long-text field and sub-table text of a record */
function menScan(r, reg, add){
  var ro = rolesOf(reg), seen = {}, texts = [];
  dataFields(reg).forEach(function(f){ if(f.key === ro.no || f.key === 'docNo') return;
    if(f.type === 'text' || f.type === 'long'){ if(typeof r.d[f.key] === 'string') texts.push(r.d[f.key]); }
    else if(f.type === 'sub'){ var cs = (f.cols || []).filter(function(c){ return c.type === 'text' || c.type === 'long'; }); asArr(r.d[f.key]).forEach(function(x){ if(x && typeof x === 'object') cs.forEach(function(c){ if(typeof x[c.key] === 'string') texts.push(x[c.key]); }); }); } });
  texts.forEach(function(t){ numHits(t).forEach(function(h){ h.ids.forEach(function(id){ if(id === r.id || seen[id]) return; seen[id] = 1; add(r.id, {id:id, t:'men', dir:'out', host:r.id}); add(id, {id:r.id, t:'men', dir:'in', host:r.id}); }); }); });
}
function numPickModal(m){
  var ids = numVisible(numIndex().get(m.key) || [], m.self);
  return {title:L('Which ', '哪一条 ') + esc(m.key) + L('?', '？'), html:'<p class="note" style="margin-top:0">' + L('More than one record uses this number.', '有多条记录使用这个编号。') + '</p><div class="lpl">' + ids.map(function(id){ var r = getRec(id), g = getReg(r.reg), st = statusOpt(g, r), lib = isLibRec(r);
    return '<button type="button" class="lpi" data-act="numGo" data-id="' + esc(id) + '"><span class="rlic">' + recIcon(r) + '</span><span class="lpt"><span class="mono">' + esc(recNo(g, r)) + '</span> ' + esc(lib ? docTitle(r) : recTitle(g, r) || '—') + (r.d.docNo ? ' <span class="muted mono">' + esc(r.d.docNo) + '</span>' : '') + '</span>' + (st ? optChip(st) : '') + '<span class="rlreg">' + esc(regName(g)) + '</span></button>'; }).join('') + '</div>'};
}
DECK_MODALS.numPick = numPickModal;
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act]'); if(!el) return;
  if(el.dataset.act === 'numOpen'){ e.preventDefault(); var ids = numVisible(numIndex().get(el.dataset.v) || [], el.dataset.self); if(ids.length === 1) openRec(ids[0]); else if(ids.length > 1) openModal({kind:'numPick', key:el.dataset.v, self:el.dataset.self}); }
  else if(el.dataset.act === 'numGo'){ closeModal(); openRec(el.dataset.id); }
});
/* chips under a long-text box follow what is typed */
var MEN_T;
document.addEventListener('input', function(e){
  var el = e.target; if(e.isComposing || el.tagName !== 'TEXTAREA') return;
  var box = el.parentNode && el.parentNode.querySelector && el.parentNode.querySelector('.menc[data-men]'); if(!box) return;
  clearTimeout(MEN_T); MEN_T = setTimeout(function(){ box.innerHTML = menInner(el.value, box.dataset.self); }, 300);
});
