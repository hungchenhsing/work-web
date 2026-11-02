/* work-web v3.5 · checking what each item is (document, activity, goods, index).
   An item's kind comes from its Type (model.js: recKind) unless it is set by hand (d.itemKind). Titles cannot be trusted to
   decide it — an "inspection report" is a document, a "joint site inspection" is an activity — so the site only suggests:
   it lists items still counted as documents whose title reads like an index of documents, like goods, or like an event,
   nothing is ticked until the user ticks it, and applying sets the kind of those items only (their Type stays as it was;
   one undo puts them back). */
'use strict';

/* reads like an index of other documents (the MDL, a master document index, a drawing list) */
var KIND_IDX = /(^|[^a-z0-9])mdl(?![a-z0-9])|master document (list|index|register)|document (index|register|list)\b|(drawing|document) (index|list)\b|^\s*index\s*$|文件(索引|清单|目录)|索引文件|(图纸|竣工图|文件总?)目录|总目录|主文件(清单|索引)|图纸清单/i;
/* …but not a review of such an index, nor index drawings */
var KIND_IDX_NOT = /\breview|审核|对照|check(ed)? against|index drawing|索引图/i;
/* names a document: whatever else the title says, it is handed over as a document */
var KIND_DOC = /\breports?\b|\brecords?\b|\bresults?\b|\bcertificates?\b|\bdossiers?\b|\bpackages?\b|\bprocedures?\b|\bprotocols?\b|\bplans?\b|\bmanuals?\b|\bregisters?\b|\blists?\b|checklists?|\bforms?\b|\bagreements?\b|\bdrawings?\b|\bdocument(s|ation)?\b|\bevidence\b|\bbackups?\b|data ?sheets?|\bsheets?\b|\bminutes\b|\bstatements?\b|\bspecifications?\b|\blogs?\b|\bletters?\b|\bphotos?\b|\bdata\b|\bsummar(y|ies)\b|\bITRs?\b|\bapprovals?\b|\bsubmittals?\b|\btransmittals?\b|\boutline\b|\bwarrant(y|ies)\b|\bas-?built\b|报告|记录|结果|证书|证明|资料|文件|方案|程序|计划|手册|登记|清单|目录|表格|记录表|检查表|签到表|登记表|数据表|一览表|协议|图纸|竣工图|布置图|系统图|接线图|原理图|平面图|结构图|示意图|单线图|基础图|竣工图|图集|备份|纪要|大纲|函|报验单|申请单|签证单|数据|日志|课件|照片|批复|质保/i;
/* names goods: spare parts, tools, equipment, consumables, materials */
var KIND_GOODS = /spare parts?|\bspares\b|\btools?\b|\bequipment\b|\bconsumables?\b|\bmaterials?\b|备品|备件|工具|设备|耗材|物资|材料/i;
/* names something that happens: a notice, a test, commissioning, training, an inspection, a handover, a decision, a deadline */
var KIND_ACT = /\bnotices?\b|notification|通知|\bpassed\b|通过|\bissued\b|签发|颁发|\bre-?tests?\b|复测|\bexpiry\b|\bexpires\b|到期|\bends\b|结束|\bdecision\b|决定|\buploaded\b|上传|\bagreed\b|\bdeadline\b|最迟|\bkick-?off\b|\bmeetings?\b|会议|walk-?down|\bwitness(ed)?\b|\btests?\b|\btesting\b|测试|试验|\bSAT\b|\bFAT\b|\bcommissioning\b|调试|\btrainings?\b|培训|\binspections?\b|检查|巡检|验收|\bhand-?over\b|移交|taking-?over|接收|\bcalibration\b|校验|校准/i;
/* where the last match of a pattern starts (-1: none) — the last noun names the thing: "test equipment" is goods,
   "equipment commissioning" is an activity, 测试设备 is goods, 设备调试 is an activity */
function kindLast(re, t){ var g = new RegExp(re.source, 'gi'), m, at = -1; while((m = g.exec(t))){ at = m.index; if(!m[0].length) g.lastIndex++; } return at; }

function kindTitle(reg, rec){ var ro = rolesOf(reg); return [ro.title ? rec.d[ro.title] : '', ro.title2 ? rec.d[ro.title2] : ''].filter(function(x){ return typeof x === 'string' && x; }).join(' / '); }
/* the kind a title suggests for an item still counted as a document (null: nothing to suggest). Items whose kind was set
   by hand — including "keep as a document" — are not suggested again. */
function kindSuggestTitle(t){
  if(!t) return null;
  if(KIND_IDX.test(t) && !KIND_IDX_NOT.test(t)) return 'idx';
  if(KIND_DOC.test(t)) return null;
  var g = kindLast(KIND_GOODS, t), a = kindLast(KIND_ACT, t);
  if(g < 0 && a < 0) return null;
  return g > a ? 'goods' : 'act';
}
function kindSuggest(reg, rec){ if(ownKind(rec) || recKind(reg, rec) !== 'doc') return null; return kindSuggestTitle(kindTitle(reg, rec)); }
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
  var list = m.list.filter(function(x){ return m.on[x.id] && getRec(x.id); }).map(function(x){ var k = m.to[x.id] || x.k; return {rec:getRec(x.id), patch:{itemKind:KIND_SET.indexOf(k) >= 0 ? k : 'doc'}}; });
  if(!list.length) return;
  var away = list.filter(function(x){ return x.patch.itemKind !== 'doc'; }).length;
  m.busy = true; renderModal();
  try{
    await setRecsUndo(list, away === list.length ? T(list.length + ' items set — they are no longer counted as documents', '已设定 ' + list.length + ' 项，不再计入文件数') : T(list.length + ' items set (' + away + ' no longer counted as documents)', '已设定 ' + list.length + ' 项（其中 ' + away + ' 项不再计入文件数）'));
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
