/* work-web v3.5 · checking what each item is (document, activity, goods, index).
   An item's kind comes from its Type (model.js: recKind) unless it is set by hand (d.itemKind). Titles cannot be trusted to
   decide it — an "inspection report" is a document, a "joint site inspection" is an activity — so the site only suggests:
   it lists items still counted as documents whose title reads like an index of documents, like goods, or like an event,
   nothing is ticked until the user ticks it, and applying sets the kind of those items only (their Type stays as it was;
   one undo puts them back). */
'use strict';

/* the vocabulary (KIND_IDX / KIND_DOC / KIND_GOODS / KIND_ACT, nameKind) is shared with Type names: model.js */

function kindTitle(reg, rec){ var ro = rolesOf(reg); return [ro.title ? rec.d[ro.title] : '', ro.title2 ? rec.d[ro.title2] : ''].filter(function(x){ return typeof x === 'string' && x; }).join(' / '); }
/* the kind a title suggests for an item still counted as a document (null: nothing to suggest). Items whose kind was set
   by hand — including "keep as a document" — are not suggested again. */
function kindSuggestTitle(t){ return nameKind(t); }
function kindSuggest(reg, rec){ if(ownKind(rec) || (rec.d && rec.d.kindOk) || recKind(reg, rec) !== 'doc') return null; return kindSuggestTitle(kindTitle(reg, rec)); }
function kindMenu(reg){ return canWrite(reg) && rf(reg, 'kind') && !isVisitor() ? '<button type="button" data-act="kindOpen" data-v="' + esc(reg.id) + '">' + L('Check kinds (document / activity / goods / index)…', '检查种类（文件 / 活动 / 物资 / 索引）…') + '</button>' : ''; }
function kindIcon(k, n){ return k === 'act' ? uic('cal', n || 12) : KIND_ICON[k] ? icon(KIND_ICON[k], n || 12) : ''; }

function kindModal(m){
  var reg = getReg(m.reg), f = reg && rf(reg, 'kind'); if(!reg || !f) return {title:L('Check kinds', '检查种类'), html:'<div class="card empty">' + L('This register has no Type field any more.', '此台账已没有「类型」字段。') + '</div>', foot:'<button type="button" class="btn" data-act="mclose">' + L('Close', '关闭') + '</button>'};
  var all = recsOf(reg.id), kc = kindCounts(reg, all), own = all.filter(function(r){ return ownKind(r) && !isHead(reg, r); }).length;
  if(!m.list){ m.list = sortRecs(reg, all).map(function(r){ var k = kindSuggest(reg, r); return k ? {id:r.id, k:k} : null; }).filter(Boolean); m.on = {}; m.to = {}; m.list.forEach(function(x){ m.to[x.id] = x.k; }); }
  var rows = m.list.filter(function(x){ return getRec(x.id); }), n = rows.filter(function(x){ return m.on[x.id]; }).length;
  var h = '<p class="note" style="margin-top:0">' + KIND_ORDER.filter(function(k){ return kc[k]; }).map(function(k){ return kindNameL(k, kc[k]) + ' <b class="mono">' + kc[k] + '</b>'; }).join(' · ') + (own ? ' · ' + L(own + ' set by hand', own + ' 项单独设定') : '') + '</p>' +
    '<p class="note">' + L('Only documents are counted. These items still count as documents, but their title reads like an index of documents (MDL, drawing list), like goods (spare parts, tools, equipment) or like something that happens (a notice, a test, commissioning, training, an inspection, a handover) — and names no report, record, certificate or other document. Titles can mislead, so nothing is ticked: tick the right ones and adjust “Set to”. Only these items change; their Type stays. “Document” keeps an item as a document and stops suggesting it. One undo puts them all back.', '只有「文件」计入文件数。下面的事项仍算作文件，但标题像文件索引（MDL、图纸清单）、像物资（备品、工具、设备）或像会发生的事（通知、测试、调试、培训、检查、移交），且没写明报告、记录、证书等文件。标题可能误导，所以默认都不勾选：请勾选正确的，并调整「设为」。只改这些事项，「类型」不变；选「文件」表示确认是文件，以后不再建议。可一次撤销。') + '</p>';
  if(!rows.length) h += '<div class="card empty">' + L('Nothing to suggest — no title reads like an index, goods or an event.', '没有可建议的项目：没有标题像索引、物资或事件。') + '</div>';
  else h += '<div class="tbl-wrap" style="max-height:52vh"><table class="tbl"><thead><tr><th><input type="checkbox" data-kchk="all"' + (n && n === rows.length ? ' checked' : '') + ' aria-label="' + esc(T('Tick all', '全选')) + '"></th><th>' + L('No.', '编号') + '</th><th>' + L('Title', '名称') + '</th><th>' + L('Type', '类型') + '</th><th>' + L('Set to', '设为') + '</th></tr></thead><tbody>' +
    rows.map(function(x){ var r = getRec(x.id), cur = optOf(f, asArr(r.d[f.key])[0]), to = m.to[x.id] || x.k;
      return '<tr' + (m.on[x.id] ? ' class="sel"' : '') + '><td><input type="checkbox" data-kchk="' + esc(x.id) + '"' + (m.on[x.id] ? ' checked' : '') + ' aria-label="' + esc(recLabel(r)) + '"></td><td class="mono">' + esc(recNo(reg, r)) + '</td><td>' + esc(kindTitle(reg, r) || '—') + '</td><td>' + (cur ? optChip(cur) : '<span class="muted">—</span>') + '</td><td><span class="kset"><span class="kmk k-' + esc(to) + '">' + kindIcon(to) + '</span><select class="in sm" data-kto="' + esc(x.id) + '" aria-label="' + esc(T('Set to', '设为')) + '">' +
        ['act', 'goods', 'idx', 'doc'].map(function(k){ return '<option value="' + k + '"' + (k === to ? ' selected' : '') + '>' + esc(k === 'doc' ? T('Document (keep)', '文件（保持）') : kindName(k)) + '</option>'; }).join('') + '</select></span></td></tr>'; }).join('') + '</tbody></table></div>';
  return {title:L('Check kinds', '检查种类') + ' · ' + esc(regName(reg)), wide:true, html:h,
    foot:'<button type="button" class="btn" data-act="mclose">' + L('Close', '关闭') + '</button>' + (rows.length ? '<button type="button" class="btn pri" data-act="kindApply"' + (n && !m.busy ? '' : ' disabled') + '>' + (n ? L('Set ' + n + ' item' + (n === 1 ? '' : 's'), '设定 ' + n + ' 项') : L('Tick the items to change', '请勾选要修改的事项')) + '</button>' : '')};
}
DECK_MODALS.kindChk = kindModal;

async function kindApply(){
  var m = S.modal; if(!m || m.kind !== 'kindChk' || m.busy) return;
  var reg = getReg(m.reg); if(!reg || !canWrite(reg)) return;
  /* "Document (keep)" only marks the item as checked (d.kindOk): it is not suggested again, and its kind still follows its
     Type if the Type changes later */
  var list = m.list.filter(function(x){ return m.on[x.id] && getRec(x.id); }).map(function(x){ var k = m.to[x.id] || x.k; return {rec:getRec(x.id), patch:KIND_SET.indexOf(k) >= 0 && k !== 'doc' ? {itemKind:k} : {kindOk:true}}; });
  if(!list.length) return;
  var away = list.filter(function(x){ return x.patch.itemKind; }).length, n = list.length;
  var msg = away === n ? T(n + ' items set — they are no longer counted as documents', '已设定 ' + n + ' 项，不再计入文件数') : !away ? T(n + ' items kept as documents — they will not be suggested again', '已确认 ' + n + ' 项为文件，以后不再建议') : T(n + ' items set (' + away + ' no longer counted as documents, ' + (n - away) + ' kept)', '已设定 ' + n + ' 项（' + away + ' 项不再计入文件数，' + (n - away) + ' 项保持为文件）');
  m.busy = true; renderModal();
  try{
    await setRecsUndo(list, msg);
    if(S.modal === m) closeModal();
  }catch(e){ m.busy = false; toast(errText(e)); if(S.modal === m) renderModal(); }
}
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act^="kind"]'); if(!el) return;
  var act = el.dataset.act;
  if(act === 'kindOpen'){ closePop(); openModal({kind:'kindChk', reg:el.dataset.v}); }
  else if(act === 'kindApply') kindApply();
});
document.addEventListener('change', function(e){
  var el = e.target, m = S.modal; if(!el || !el.dataset || !m || m.kind !== 'kindChk') return;
  if(el.dataset.kto){ m.to[el.dataset.kto] = el.value; m.on[el.dataset.kto] = true; renderModal(); return; }   /* choosing a kind ticks the row */
  if(!el.dataset.kchk) return;
  if(el.dataset.kchk === 'all') m.list.forEach(function(x){ m.on[x.id] = el.checked; }); else m.on[el.dataset.kchk] = el.checked;
  renderModal();
});
