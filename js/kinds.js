/* work-web v3.5 · checking what each item is (document, activity, index, goods).
   The kind of an item comes from its Type (model.js: recKind). Titles cannot be trusted to decide it on their own — an
   "inspection report" is a document, a "joint site inspection" is an activity — so the site only suggests: it lists items
   still counted as documents whose title reads like an index of documents or like an event, and nothing changes until
   they are ticked and applied (one undo puts them back). */
'use strict';

/* reads like an index of other documents (the MDL, a master document index) */
var KIND_IDX = /\bMDL\b|master document (list|index|register)|document (index|register|list)\b|(drawing|document) index\b|文件(索引|清单|目录)|索引文件|图纸目录|主文件(清单|索引)/i;
/* reads like a review of such an index, not the index itself */
var KIND_IDX_NOT = /\breview|审核|对照|check(ed)? against/i;
/* says that something happens: a notice, a test passed, a certificate issued, a decision, a deadline */
var KIND_ACT = /\bnotice of\b|notification|通知|\bpassed\b|通过|\bissued\b|签发|颁发|\bre-?tests?\b|复测|\bexpiry\b|\bexpires\b|到期|\bends\b|结束|\bdecision\b|决定|\buploaded\b|上传|\bagreed\b|joint (site )?inspection|联合.{0,4}(巡检|检查)|\bdeadline\b|最迟|\bkick-?off\b|\bmeeting\b|会议|walk-?down|\bwitness(ed)?\b/i;
/* …but a report, a record, minutes or a dossier about it is a document */
var KIND_ACT_NOT = /\breports?\b|\brecords?\b|报告|记录|\bminutes\b|纪要|certificate of|\bdossier\b|资料包|\bpackage\b|\bprocedures?\b|\bplans?\b|方案|程序/i;
/* names work done on site — a test, commissioning, training, an inspection, a handover — … */
var KIND_WORK = /\btests?\b|\btesting\b|测试|试验|\bSAT\b|\bFAT\b|\bcommissioning\b|调试|\btrainings?\b|培训|\binspections?\b|检查|巡检|验收|\bhand-?over\b|移交|taking-?over|接收/i;
/* …and is a document as soon as the title names what is handed over: a report, a record, a list, a manual, a drawing… */
var KIND_DOC = /\breports?\b|\brecords?\b|\bresults?\b|\bcertificates?\b|\bdossier\b|\bpackages?\b|\bprocedures?\b|\bplans?\b|\bmanuals?\b|\bregisters?\b|\blists?\b|checklists?|\bforms?\b|\bagreements?\b|\bdrawings?\b|\bdocument(s|ation)?\b|\bevidence\b|\bbackups?\b|data ?sheets?|\bminutes\b|\bstatement\b|\bspecifications?\b|报告|记录|结果|证书|证明|资料|文件|方案|程序|计划|手册|登记|清单|目录|表|协议|图|备份|纪要/i;

function kindTitle(reg, rec){ var ro = rolesOf(reg); return [ro.title ? rec.d[ro.title] : '', ro.title2 ? rec.d[ro.title2] : ''].filter(Boolean).join(' / '); }
/* the kind a title suggests for an item still counted as a document (null: nothing to suggest) */
function kindSuggest(reg, rec){
  if(recKind(reg, rec) !== 'doc') return null;
  var t = kindTitle(reg, rec); if(!t) return null;
  if(KIND_IDX.test(t) && !KIND_IDX_NOT.test(t)) return 'idx';
  if(KIND_ACT.test(t) && !KIND_ACT_NOT.test(t)) return 'act';
  if(KIND_WORK.test(t) && !KIND_DOC.test(t)) return 'act';
  return null;
}
/* the Type option that stands for a kind: the first one marked so (or named so); null when there is none yet */
function kindOpt(reg, k){ var f = rf(reg, 'kind'); if(!f) return null; var os = optsOf(f);
  return os.filter(function(o){ return o.cls === k; })[0] || os.filter(function(o){ return optKind(o) === k; })[0] || null; }
var KIND_NEW = {idx:{v:'index', en:'Index', zh:'索引', color:'violet', cls:'idx'}, act:{v:'activity', en:'Activity', zh:'活动', color:'teal', cls:'act'}};
function kindMenu(reg){ return canWrite(reg) && rf(reg, 'kind') && !isVisitor() ? '<button type="button" data-act="kindOpen" data-v="' + esc(reg.id) + '">' + L('Check kinds (document / activity / index)…', '检查种类（文件 / 活动 / 索引）…') + '</button>' : ''; }

function kindModal(m){
  var reg = getReg(m.reg); if(!reg) return {title:'', html:''};
  var f = rf(reg, 'kind'), kc = kindCounts(reg, recsOf(reg.id));
  if(!m.list){ m.list = sortRecs(reg, recsOf(reg.id)).map(function(r){ var k = kindSuggest(reg, r); return k ? {id:r.id, k:k} : null; }).filter(Boolean); m.on = {}; m.list.forEach(function(x){ m.on[x.id] = true; }); }
  var n = m.list.filter(function(x){ return m.on[x.id]; }).length;
  var h = '<p class="note" style="margin-top:0">' + KIND_ORDER.filter(function(k){ return kc[k]; }).map(function(k){ return kindName(k, kc[k]) + ' <b class="mono">' + kc[k] + '</b>'; }).join(' · ') + '</p>' +
    '<p class="note">' + L('Only documents are counted. The list below has the items still counted as documents whose title reads like an index of documents (MDL, document index) or like an event (a notice, a test or commissioning with no report or record named, a certificate issued, a handover, a decision, a deadline). Titles can mislead — an “inspection report” is a document — so check each before changing it. Changing one sets its Type; one undo puts them all back. To change a whole category, use Fields & columns → Type → Kind.', '只有「文件」计入文件数。下面列出仍算作文件、但标题看起来像文件索引（MDL、文件索引）或像事件（通知、未写明报告或记录的测试/调试、证书签发、移交、决定、期限）的事项。标题可能误导（「巡检报告」是文件），请逐项确认再改。改动的是它的「类型」，可一次撤销。要整类修改，请到「字段与列 → 类型 → 种类」。') + '</p>';
  if(!m.list.length) h += '<div class="card empty">' + L('Nothing to suggest — no title reads like an index or an event.', '没有可建议的项目：没有标题像索引或事件。') + '</div>';
  else h += '<div class="tbl-wrap" style="max-height:52vh"><table class="tbl"><thead><tr><th><input type="checkbox" data-kchk="all"' + (n === m.list.length ? ' checked' : '') + ' aria-label="' + esc(T('All', '全部')) + '"></th><th>' + L('No.', '编号') + '</th><th>' + L('Title', '名称') + '</th><th>' + L('Type now', '现在的类型') + '</th><th>' + L('Change to', '改为') + '</th></tr></thead><tbody>' +
    m.list.map(function(x){ var r = getRec(x.id); if(!r) return ''; var cur = optOf(f, asArr(r.d[f.key])[0]), to = kindOpt(reg, x.k) || KIND_NEW[x.k];
      return '<tr><td><input type="checkbox" data-kchk="' + esc(x.id) + '"' + (m.on[x.id] ? ' checked' : '') + '></td><td class="mono">' + esc(recNo(reg, r)) + '</td><td>' + esc(kindTitle(reg, r) || '—') + '</td><td>' + (cur ? optChip(cur) : '<span class="muted">—</span>') + '</td><td><span class="kmk k-' + x.k + '">' + (x.k === 'act' ? uic('cal', 12) : icon(KIND_ICON[x.k], 12)) + '</span>' + esc(nm(to)) + (kindOpt(reg, x.k) ? '' : ' <span class="note">' + L('(new option)', '（新增选项）') + '</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  if(f.list && m.list.some(function(x){ return !kindOpt(reg, x.k); })) h += '<p class="note" style="color:var(--warn)">' + L('This Type uses a shared list: add an Index / Activity option there first (Settings → Lists).', '此「类型」使用共享列表：请先在「设置 → 列表」加入「索引 / 活动」选项。') + '</p>';
  return {title:L('Check kinds', '检查种类') + ' · ' + esc(regName(reg)), wide:true, html:h,
    foot:'<button type="button" class="btn" data-act="mclose">' + L('Close', '关闭') + '</button>' + (m.list.length ? '<button type="button" class="btn pri" data-act="kindApply"' + (n && !m.busy ? '' : ' disabled') + '>' + L('Change ' + n + ' item' + (n === 1 ? '' : 's'), '修改 ' + n + ' 项') + '</button>' : '')};
}
DECK_MODALS.kindChk = kindModal;

async function kindApply(){
  var m = S.modal; if(!m || m.kind !== 'kindChk' || m.busy) return;
  var reg = getReg(m.reg), f = reg && rf(reg, 'kind'); if(!f || !canWrite(reg)) return;
  var pick = m.list.filter(function(x){ return m.on[x.id] && getRec(x.id); }); if(!pick.length) return;
  m.busy = true; renderModal();
  try{
    /* an Index / Activity option the Type does not have yet is added to it (its own options only) */
    var need = {}; pick.forEach(function(x){ if(!kindOpt(reg, x.k)) need[x.k] = 1; });
    if(Object.keys(need).length){
      if(f.list) throw new Error(T('Add the Index / Activity option to the shared list first.', '请先在共享列表中加入「索引 / 活动」选项。'));
      var fs = clone(reg.d.fields || []), fd = fs.filter(function(x){ return x.key === f.key; })[0]; fd.opts = fd.opts || [];
      Object.keys(need).forEach(function(k){ var o = clone(KIND_NEW[k]); while(fd.opts.some(function(x){ return x.v === o.v; })) o.v += '_'; fd.opts.push(o); });
      await STORE.patchReg(reg.id, {fields:fs}); reg = getReg(reg.id); f = rf(reg, 'kind');
    }
    var list = pick.map(function(x){ var o = kindOpt(reg, x.k); return {rec:getRec(x.id), patch:mk(f.key, f.multi ? [o.v] : o.v)}; });
    await setRecsUndo(list, T(list.length + ' items changed — they are no longer counted as documents', '已修改 ' + list.length + ' 项，不再计入文件数'));
    closeModal();
  }catch(e){ m.busy = false; toast(errText(e)); renderModal(); }
}
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act^="kind"]'); if(!el) return;
  var act = el.dataset.act;
  if(act === 'kindOpen'){ closePop(); openModal({kind:'kindChk', reg:el.dataset.v}); }
  else if(act === 'kindApply') kindApply();
});
document.addEventListener('change', function(e){
  var el = e.target, m = S.modal; if(!el || !el.dataset || !el.dataset.kchk || !m || m.kind !== 'kindChk') return;
  if(el.dataset.kchk === 'all') m.list.forEach(function(x){ m.on[x.id] = el.checked; }); else m.on[el.dataset.kchk] = el.checked;
  renderModal();
});
