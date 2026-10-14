/* work-web · one-time upgrade of the turnover package tree to the contract handover structure (DEF_TREE, DEF_TREE_VER).
   Runs once for an editor or admin when a register still has the first-version tree (node ids pk1…pk8):
   - the tree is replaced (kept ids keep their records; extra nodes someone added are kept),
   - records that clearly belong to a new package are moved by title keywords (each move is in the history),
   - the old tree and the list of moves are kept on the register, so “Undo” puts everything back. */
'use strict';

var PKG_RULES = [
  {from:['pk1', 'pk3', 'pk8'], to:'ct4', re:/\b(performance|PR|NDC|net dependable|capacity test|GCT|grid compliance|reliability run|thermograph\w*|infrared)\b|性能|红外|容量测试|电网合规/i},
  {from:['pk1', 'pk2', 'pk7', 'pk8'], to:'ct8', re:/\b(permits?|licen[cs]es?|registrations?)\b|许可|批复|执照/i},
  {from:['pk1', 'pk2', 'pk8'], to:'ct7', re:/\bKKS\b|\btagging\b|\blabels?\b|标识|标签/i},
  {from:['pk1', 'pk8'], to:'ct9', re:/\b(QA|QC|quality|HSE|safety|ITP|RAMS|HAZOP|HAZID|method statements?|monthly reports?|weekly reports?|management plan|communication plan)\b|质量|安全|周报|月报/i},
  {from:['pk1', 'pk8'], to:'ct1', re:/\bMDL\b|master document/i},
  {from:['pk1', 'pk8'], to:'pk3', re:/commission|punch|\bTOP\b|take[- ]?over package|\bFAT\b|\bSAT\b|调试|尾项|整改/i},
  {from:['pk8'], to:'ct10', re:/checklist|总检|检查清单/i},
  {from:['pk1', 'pk8'], to:'ct11', re:/\bsectional\b|分段/i},
  {from:['pk1', 'pk2'], to:'pk4', re:/\bO\s?&\s?M manual|operation (and|&) maintenance manual|运维手册/i}
];
function pkgOldTree(f){ var ids = (f.tree || []).map(function(n){ return n.id; }); return ids.indexOf('pk1') >= 0 && ids.indexOf('pk8') >= 0 && f.treeVer !== DEF_TREE_VER && f.treeVer !== 'declined'; }
function pkgTarget(reg, r, key){
  var from = r.d[key], txt = [r.d[rolesOf(reg).title], r.d[rolesOf(reg).title2], r.d.docNo].filter(Boolean).join(' ');
  for(var i = 0; i < PKG_RULES.length; i++){ var x = PKG_RULES[i]; if(x.from.indexOf(from) >= 0 && x.re.test(txt)) return x.to !== from ? x.to : null; }
  return null;
}
function pkgPlan(reg){
  var f = fieldsOf(reg).filter(function(x){ return x.type === 'tree' && pkgOldTree(x); })[0]; if(!f) return null;
  var ids = DEF_TREE.map(function(n){ return n.id; }), tree = clone(DEF_TREE);
  (f.tree || []).forEach(function(n){ if(ids.indexOf(n.id) < 0){ var c = clone(n); if(c.parent && !tree.some(function(t){ return t.id === c.parent; }) && ids.indexOf(c.parent) < 0) c.parent = ''; tree.push(c); } });
  var moves = recsOf(reg.id).map(function(r){ var to = pkgTarget(reg, r, f.key); return to ? {id:r.id, from:r.d[f.key], to:to} : null; }).filter(Boolean);
  return {f:f, tree:tree, moves:moves};
}
var PKG_RUN = false;
function pkgUpgrade(){
  if(PKG_RUN || !appReady() || !canTeamEdit()) return; PKG_RUN = true;
  var jobs = allRegs().filter(canWrite).map(function(reg){ var p = pkgPlan(reg); return p ? {reg:reg, p:p} : null; }).filter(Boolean);
  if(!jobs.length) return;
  var moved = 0;
  Promise.all(jobs.map(function(j){
    var fs = clone(fieldsOf(j.reg)); fs.forEach(function(x){ if(x.key === j.p.f.key){ x.tree = j.p.tree; x.treeVer = DEF_TREE_VER; } });
    var mig = {at:new Date().toISOString(), key:j.p.f.key, prev:clone(j.p.f.tree), prevVer:j.p.f.treeVer || '', moves:j.p.moves};
    return STORE.patchReg(j.reg.id, {fields:fs, pkgMig:mig}).then(function(){
      var i = 0; function next(){ var b = j.p.moves.slice(i, i + 20); i += 20; if(!b.length) return Promise.resolve();
        return Promise.all(b.map(function(m){ var r = getRec(m.id); if(!r) return null; var pt = {}; pt[j.p.f.key] = m.to; moved++; return setRec(r, pt, {silent:true}); })).then(next); }
      return next(); });
  })).then(function(){
    S.pkgNote = {regs:jobs.map(function(j){ return j.reg.id; }), moved:moved};
    renderAll(); toast(T('Turnover packages now follow the contract handover list (P0–P12)' + (moved ? '; ' + moved + ' record(s) moved to their new package' : '') + '.', '文件包已按合同移交清单调整为 P0–P12' + (moved ? '，' + moved + ' 条记录已移到新的文件包' : '') + '。'), {act:'pkgReview', label:T('Details', '查看')});
  }).catch(function(e){ console.error(e); toast(T('Could not update the package list: ', '文件包更新失败：') + (e && e.message || e)); });
}
function pkgReviewModal(m){
  var regs = (S.pkgNote ? S.pkgNote.regs : allRegs().filter(function(r){ return r.d.pkgMig; }).map(function(r){ return r.id; })).map(getReg).filter(function(r){ return r && r.d.pkgMig; });
  var h = '<p class="note" style="margin-top:0">' + L('Packages now follow the contract handover requirements: P0 handover process, then the submission list 1–12. Records keep their package unless listed below.', '文件包已按合同移交需求调整：P0 为移交流程，P1–P12 对应提交资料清单 1–12。未列出的记录保持原文件包（名称已更新）。') + '</p>';
  regs.forEach(function(reg){ var mg = reg.d.pkgMig, f = fieldOf(reg, mg.key);
    function lab(id){ var n = f && treeNode(f, id) || (mg.prev || []).filter(function(x){ return x.id === id; })[0]; return n ? treeLabel(n) : id; }
    function oldLab(id){ var n = (mg.prev || []).filter(function(x){ return x.id === id; })[0]; return n ? treeLabel(n) : id; }
    h += '<h3>' + esc(regName(reg)) + '</h3>' + (mg.moves.length ? '<table class="tbl"><thead><tr><th>' + L('Record', '记录') + '</th><th>' + L('Was', '原为') + '</th><th>' + L('Now', '现为') + '</th></tr></thead><tbody>' + mg.moves.map(function(x){ var r = getRec(x.id); return '<tr><td>' + (r ? '<a href="#" data-act="openRec" data-v="' + esc(r.id) + '">' + esc(recNo(reg, r) + ' ' + (r.d[rolesOf(reg).title] || '')) + '</a>' : esc(x.id)) + '</td><td>' + esc(oldLab(x.from)) + '</td><td>' + esc(lab(x.to)) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="note">' + L('No records needed moving.', '没有需要移动的记录。') + '</p>');
    if(canTeamEdit()) h += '<div class="row" style="margin-top:8px"><button type="button" class="btn sm danger-o" data-act="pkgUndo" data-v="' + esc(reg.id) + '">' + L('Undo: restore the previous packages', '撤销：恢复原来的文件包') + '</button></div>';
  });
  return {title:L('Package structure updated', '文件包结构已更新'), wide:true, html:h, foot:'<button type="button" class="btn pri" data-act="mclose">' + L('OK', '好') + '</button>'};
}
function pkgUndo(regId){
  var reg = getReg(regId), mg = reg && reg.d.pkgMig; if(!mg) return;
  var fs = clone(fieldsOf(reg)); fs.forEach(function(x){ if(x.key === mg.key){ x.tree = mg.prev; x.treeVer = 'declined'; } });
  var back = mg.moves.filter(function(m){ var r = getRec(m.id); return r && r.d[mg.key] === m.to; });
  STORE.patchReg(reg.id, {fields:fs, pkgMig:null}).then(function(){ return Promise.all(back.map(function(m){ var pt = {}; pt[mg.key] = m.from; return setRec(getRec(m.id), pt, {silent:true}); })); })
    .then(function(){ closeModal(); toast(T('Previous packages restored.', '已恢复原来的文件包。')); });
}
/* a banner until each person has seen the change once (per browser) */
function pkgBanner(){
  var reg = allRegs().filter(function(r){ return r.d.pkgMig && r.d.pkgMig.at; })[0]; if(!reg) return '';
  var at = reg.d.pkgMig.at, seen = ''; try{ seen = localStorage.getItem('ww.pkgSeen') || ''; }catch(e){}
  if(seen === at) return '';
  return '<div class="banner">' + L('Turnover packages now follow the contract handover requirements: P0 handover process, P1–P12 submission list.', '移交文件包已按合同移交需求调整：P0 移交流程，P1–P12 对应提交资料清单。') +
    ' <button type="button" class="btn sm" data-act="pkgReview">' + L('See what changed', '查看变更') + '</button> <button type="button" class="btn sm" data-act="pkgSeen" data-v="' + esc(at) + '">' + L('Got it', '知道了') + '</button></div>';
}
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act="pkgReview"],[data-act="pkgUndo"],[data-act="pkgSeen"]'); if(!el) return;
  if(el.dataset.act === 'pkgReview') openModal({kind:'pkgReview'});
  else if(el.dataset.act === 'pkgSeen'){ try{ localStorage.setItem('ww.pkgSeen', el.dataset.v); }catch(err){} renderAll(); }
  else pkgUndo(el.dataset.v);
});
if(typeof DECK_MODALS !== 'undefined') DECK_MODALS.pkgReview = pkgReviewModal;
