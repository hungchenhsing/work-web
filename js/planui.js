/* work-web v2 · plan UI on the site: set baseline, baseline / slip line in the record drawer. */
'use strict';

function baseInfo(reg, rec){
  var b = baseOf(reg, rec); if(!b) return '';
  var mi = msInfo(reg, rec, asOfN()), s = mi.slip;
  return '<div class="note bsinfo">' + uic('cal', 13) + ' ' + L('Baseline', '基准') + ' <span class="mono">' + esc(b.s === b.f ? n2d(b.f) : n2d(b.s) + ' → ' + n2d(b.f)) + '</span>' +
    (s != null && s !== 0 ? ' · <b class="' + (s > 0 ? 'odn' : 'okn') + '">' + (s > 0 ? '+' : '') + s + ' ' + L('d vs baseline', '天（对比基准）') + '</b>' : s === 0 ? ' · ' + L('on baseline', '与基准一致') : '') + '</div>';
}
function regPlanMenu(reg){ var ro = rolesOf(reg); if(!canWrite(reg) || !(ro.start || ro.finish)) return ''; return '<button type="button" data-act="baseOpen" data-v="' + esc(reg.id) + '">' + L('Set baseline…', '设定基准计划…') + '</button>'; }
function baselineModal(m){
  var reg = getReg(m.reg), c = baselineCount(reg), k = baseKeys(reg);
  return {title:L('Set baseline', '设定基准计划') + ' · ' + esc(regName(reg)), html:
    '<p>' + L('The baseline is a saved copy of today’s planned dates. Timelines and the S-curve compare the current plan and actual dates with it, and show the slip in days.', '基准是当前计划日期的存档。时间轴和 S 曲线会拿当前计划与实际日期跟它比较，并显示延误天数。') + '</p>' +
    '<p class="note">' + L(c.n + ' items have planned dates · ' + c.has + ' already have a baseline.', c.n + ' 项有计划日期 · 其中 ' + c.has + ' 项已有基准。') + (k.single ? ' ' + L('Stored in the field “' + T1(fieldOf(reg, k.single).en, fieldOf(reg, k.single).zh) + '”.', '保存在字段「' + T1(fieldOf(reg, k.single).en, fieldOf(reg, k.single).zh) + '」。') : '') + '</p>' +
    '<label class="chk"><input type="radio" name="bsMode" value="missing" checked> ' + L('Only items without a baseline', '只设定还没有基准的项') + '</label><br><label class="chk"><input type="radio" name="bsMode" value="all"> ' + L('All items — replace existing baselines (re-baseline)', '全部项目：覆盖现有基准（重新设基准）') + '</label>' +
    '<p class="note">' + L('Every change goes into the Change log and can be undone.', '每项修改都会记入修改记录，可以撤销。') + '</p>',
    foot:'<button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button><button type="button" class="btn pri" data-act="baseGo">' + L('Save baseline', '保存基准') + '</button>'};
}
DECK_MODALS.baseline = baselineModal;
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act]'); if(!el) return;
  var act = el.dataset.act;
  if(act === 'baseOpen'){ var d = el.closest('details'); if(d) d.removeAttribute('open'); openModal({kind:'baseline', reg:el.dataset.v}); }
  if(act === 'baseGo'){ var m = S.modal, reg = getReg(m.reg), all = ($('input[name=bsMode]:checked') || {}).value === 'all'; closeModal(); toast(T('Saving baseline…', '正在保存基准…'));
    setBaseline(reg, all).then(function(n){ toast(T('Baseline saved for ' + n + ' items', '已为 ' + n + ' 项保存基准')); }).catch(function(er){ toast(errText(er)); }); }
});
