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
  var moved = 0;
  Promise.all(jobs.map(function(j){
    var fs = clone(fieldsOf(j.reg)); fs.forEach(function(x){ if(x.key === j.p.f.key){ x.tree = j.p.tree; x.treeVer = DEF_TREE_VER; } });
    var mig = {at:new Date().toISOString(), key:j.p.f.key, prev:clone(j.p.f.tree), prevVer:j.p.f.treeVer || '', moves:j.p.moves};
    return STORE.patchReg(j.reg.id, {fields:fs, pkgMig:mig}).then(function(){
      var i = 0; function next(){ var b = j.p.moves.slice(i, i + 20); i += 20; if(!b.length) return Promise.resolve();
        return setRecs(b.map(function(m){ var r = getRec(m.id); if(!r) return null; var pt = {}; pt[j.p.f.key] = m.to; moved++; return {rec:r, patch:pt}; })).then(next); }
      return next(); });
  })).then(function(){ return ctItemsUpgrade(); }).then(function(added){
    if(!jobs.length && !added) return;
    S.pkgNote = {moved:moved, added:added};
    renderAll(); toast(T('Turnover register updated to the contract handover requirements' + (moved ? ' · ' + moved + ' moved' : '') + (added ? ' · ' + added + ' contract items added' : '') + '.', '移交台账已按合同移交需求更新' + (moved ? ' · 移动 ' + moved + ' 条' : '') + (added ? ' · 新增合同要求项 ' + added + ' 条' : '') + '。'), {act:'pkgReview', label:T('Details', '查看')});
  }).catch(function(e){ console.error(e); toast(T('Could not update the turnover register: ', '移交台账更新失败：') + (e && e.message || e)); });
}

/* ---------- contract handover items (process milestones P0 + submission list P1–P12) ----------
   [package node, type, English, 中文, key item, skip-if-a-record-matches (regex), sub-item of a record matching (regex), basis / notes] */
var CT_ITEMS_VER = 'contract-items-1';
var CT_ITEMS = [
  ['pk1', 'milestone', 'Tests on Completion passed (FAT, SAT, performance tests)', '竣工测试全部通过（FAT、SAT、性能测试）', 1, 'tests? on completion|竣工测试', '', '合同依据：Sub-Clause 10.1；移交需求 一.1 · Owner / Owner’s representative witness the tests and co-sign the records 业主或业主代表见证并共同签署测试记录'],
  ['pk1', 'activity', 'Advance notice of readiness for taking-over (max. 14 days before completion)', '提前发出移交准备通知（最多提前 14 天）', 0, 'advance notice|预通知|准备通知', '', '移交需求 一.2 · With supporting evidence 附佐证材料'],
  ['pk1', 'activity', 'Notice of completion readiness (after actual completion)', '正式完工就绪通知（实际完工后）', 0, 'formal handover notification|completion readiness|正式移交通知|就绪通知', '', '移交需求 一.2'],
  ['pk1', 'activity', 'Joint site inspection and punch list agreed', '联合现场巡检并确定尾项清单', 0, 'joint (site )?inspection|联合.{0,4}巡检', '', '移交需求 一.3 · Minor items that do not affect safe operation go on the punch list and are closed in the DNP 不影响安全运行的未完小项列入尾项清单，在缺陷通知期内完成'],
  ['pk1', 'milestone', 'Owner decision on taking-over (within 14 days of the notice)', '业主做出接收决定（收到通知后 14 天内）', 0, 'owner decision|接收决[定策]', '', '移交需求 一.4 · Either issue the TOC (listing the punch items) or reject in writing with the missing work, defects and documents; if rejected, fix and resubmit 签发 TOC（注明尾项）或书面拒绝并列明未完工作、缺陷、缺失文件；被拒后整改并重新申请'],
  ['pk1', 'milestone', 'Taking-Over Certificate (TOC) issued – DNP starts, O&M responsibility transfers', '签发接收证书 TOC（缺陷通知期开始，运维责任转移）', 1, 'taking[- ]?over certificate|\\bTOC\\b|接收证书', '', '合同依据：Sub-Clause 10.1；移交需求 一.6 · DNP 24 months 缺陷通知期 24 个月'],
  ['pk1', 'milestone', 'Latest taking-over – East area (completion + 98 days)', '最迟移交期限 – 东区（完工后 98 天）', 0, 'east.{0,20}98|东区.{0,10}98', '', '移交需求 一.5 · Sectional taking-over only if the Owner requests or both parties agree 仅在业主要求或双方约定时分段移交'],
  ['pk1', 'milestone', 'Latest taking-over – West area (completion + 45 days)', '最迟移交期限 – 西区（完工后 45 天）', 0, 'west.{0,30}45|西区.{0,20}45', '', '移交需求 一.5'],
  ['pk1', 'activity', 'PR re-test – DNP year 1 (incl. annual module degradation)', '缺陷通知期第 1 年 PR 性能比复测（含组件年度衰减）', 0, '(year 1|第 ?1 ?年).{0,40}(PR|性能比)|(PR|性能比).{0,40}(year 1|第 ?1 ?年)', '', '移交需求 一.7 · Checked against the guaranteed PR including yearly module degradation 按含组件年度衰减的保证指标校验'],
  ['pk1', 'activity', 'PR re-test – DNP year 2 (incl. annual module degradation)', '缺陷通知期第 2 年 PR 性能比复测（含组件年度衰减）', 0, '(year 2|第 ?2 ?年).{0,40}(PR|性能比)|(PR|性能比).{0,40}(year 2|第 ?2 ?年)', '', '移交需求 一.7'],
  ['pk1', 'milestone', 'DNP expiry – Performance Certificate issued', '缺陷通知期结束 – 颁发履约证书', 1, 'performance certificate|履约证书', '', '移交需求 一 后续活动 · All punch items and defects closed, performance confirmed 全部尾项与缺陷整改完毕、性能指标确认达标'],
  ['pk1', 'milestone', 'Serial / latent defects warranty ends (TOC + 6 years)', '系列缺陷质保期结束（TOC 起 6 年）', 0, 'serial defect|latent defect|系列缺陷', '', '移交需求 一 后续活动'],
  ['ct1', 'deliverable', 'Master Document List (MDL) – complete project documentation incl. Employer’s Requirements documents', '主文件清单 MDL（全套项目文档，含业主要求文件）', 1, '\\bMDL\\b|master document|主文件清单', '', '移交需求 二.1'],
  ['ct1', 'activity', 'Document review against the MDL', '对照主文件清单 MDL 审核工程文件', 0, 'review.{0,20}MDL|对照.{0,6}MDL', '', '移交需求 一.8'],
  ['pk2', 'deliverable', 'As-built calculations & specifications', '竣工计算书与技术规范', 0, 'calculation|计算书', '', '移交需求 二.2(1)'],
  ['pk2', 'deliverable', 'Manufacturer datasheets (modules, inverters, trackers, MV equipment)', '厂家数据表（组件、逆变器、跟踪支架、中压设备）', 0, 'datasheet|数据表', '', '移交需求 二.2(1)'],
  ['pk2', 'deliverable', 'Third-party reports', '第三方报告', 0, 'third[- ]party|第三方', '', '移交需求 二.2(1)'],
  ['pk2', 'deliverable', 'Component traceability list (serial numbers of modules, inverters, transformers)', '部件可追溯清单（组件、逆变器、变压器序列号）', 0, 'traceab|serial number|可追溯|序列号', '', '移交需求 二.2(1)'],
  ['pk2', 'deliverable', 'As-built QA/QC records', '竣工 QA/QC 记录', 0, 'QA ?[&/] ?QC|质量记录', '', '移交需求 二.2(1)'],
  ['pk2', 'milestone', 'As-built records submitted – 2 hard copies + electronic', '竣工资料提交（纸质 2 套 + 电子版）', 1, 'hard cop|纸质', '', '移交需求 二.2(1) · Drawings, calculations, specifications, datasheets, third-party reports, traceability list, QA/QC records, punch list, commissioning & test reports 图纸、计算书、规范、厂家数据表、第三方报告、可追溯清单、QA/QC 记录、尾项清单、调试测试报告'],
  ['pk4', 'deliverable', 'O&M Manual – interim', '运维手册（临时版）', 1, 'interim|临时版', 'o ?& ?m manual|运维手册', '移交需求 二.2(2) · Start-up / shut-down, emergency and fault procedures, OEM operating instructions, initial spare parts list 启停、应急故障处置流程、厂家操作说明、初始备件清单'],
  ['pk4', 'deliverable', 'O&M Manual – final', '运维手册（终版）', 0, 'final.{0,10}o ?& ?m|终版.{0,6}运维', 'o ?& ?m manual|运维手册', '移交需求 二.2(2)'],
  ['pk3', 'deliverable', 'Pre-commissioning checklists and commissioning procedures per subsystem', '分系统预调试检查表及调试流程文件', 0, 'pre-?commissioning|预调试', '', '移交需求 二.3(2)'],
  ['pk3', 'deliverable', 'Readiness evidence for the ERC Certificate of Compliance (COC)', '申请 ERC 合规证书 COC 的就绪证明', 1, '\\bCOC\\b|certificate of compliance|合规证书', '', '移交需求 二.3(3) · Together with the complete commissioning report (within 2 weeks of commissioning) 与完整调试报告一并提交（调试完成后 2 周内）'],
  ['pk3', 'deliverable', 'SCADA / PCC / EMS communication system FAT records', 'SCADA / PCC / EMS 通信系统 FAT 工厂验收记录', 0, '(SCADA|PPC|PCC|EMS).{0,30}FAT|FAT.{0,30}(SCADA|PPC|EMS)', '', '移交需求 二.3(5)'],
  ['ct4', 'deliverable', 'Tests on Completion and performance test results (minimum performance guarantees)', '竣工测试与性能测试结果（满足最低性能保证）', 1, 'test results|测试结果', '', '移交需求 二.4(1)'],
  ['ct4', 'deliverable', 'Net Dependable Capacity (NDC) test records', '净可靠容量 NDC 测试记录', 0, '\\bNDC\\b|net dependable|净可靠容量', '', '移交需求 二.4(2)'],
  ['ct4', 'deliverable', 'PV performance test package (plan, procedure, report)', '光伏性能测试包（方案、程序、报告）', 0, 'PV performance test|光伏性能测试', '', '移交需求 二.4(3) · The PR test is tracked separately PR 性能比测试单独跟踪'],
  ['ct4', 'deliverable', 'NGCP Grid Compliance Test (GCT) documentation', 'NGCP 电网合规测试 GCT 全套文件', 1, '\\bGCT\\b|grid compliance|电网合规', '', '移交需求 二.4(4) · Pre-test meetings, updated documents, test submissions, GCT test notice 前期研讨、更新文档、送审测试文件、GCT 试验通知'],
  ['pk7', 'deliverable', 'Assignment of equipment suppliers’ warranties (TOC prerequisite)', '设备供应商质保转让文件（TOC 前置条件）', 1, 'warrant.{0,20}(assign|transfer)|质保转让', '', '移交需求 二.5(1)'],
  ['pk7', 'deliverable', 'Equipment service agreements', '设备配套服务协议', 0, 'service agreement|服务协议', '', '移交需求 二.5(2)'],
  ['pk6', 'deliverable', 'Initial spare parts delivery record (per Appendix 12 spare parts list)', '初始备件交付凭证（依据附件 12 备件清单）', 0, 'spare.{0,20}(deliver|handover)|备件交付', 'spare part|备品|备件', '移交需求 二.5(3)'],
  ['pk5', 'deliverable', 'Owner personnel training records (contractual training completed)', '业主人员培训记录（证明已完成合同约定培训）', 1, 'training record|培训记录', 'training|培训', '移交需求 二.6'],
  ['ct7', 'deliverable', 'Label installation records – equipment, panels and instruments (ID numbers)', '设备、柜体、仪表标识标签张贴记录（ID 编号）', 0, 'label|标签张贴', '', '移交需求 二.7'],
  ['ct8', 'deliverable', 'Register of all permits and government approvals', '全部许可及政府批复登记台账', 1, 'permits? register|register of.{0,10}permit|许可.{0,6}登记台账|批复登记', '', '移交需求 二.8'],
  ['ct9', 'deliverable', 'Document management plan', '文档管理计划', 0, 'document management plan|文档管理计划', '', '移交需求 二.9'],
  ['ct9', 'deliverable', 'Communication plan', '沟通计划', 0, 'communication plan|沟通计划', '', '移交需求 二.9'],
  ['ct9', 'deliverable', 'Method statements and risk studies (RAMS, HAZOP, HAZID)', '施工方案与风险研究（RAMS、HAZOP、HAZID）', 0, 'method statement|RAMS|HAZOP|HAZID|施工方案', '', '移交需求 二.9'],
  ['ct9', 'deliverable', 'Weekly and monthly progress reports', '周报与月报', 0, 'weekly report|monthly report|周报|月报', '', '移交需求 二.9'],
  ['ct9', 'deliverable', 'Inspection and Test Plans (ITP)', '检查试验计划 ITP', 0, '\\bITP\\b|检查试验计划', '', '移交需求 二.9'],
  ['ct9', 'deliverable', 'HSE management plan incl. Emergency Response Plan (ERP)', 'HSE 安全管理计划（含应急响应 ERP）', 0, 'HSE|emergency response|应急响应', '', '移交需求 二.9'],
  ['ct9', 'deliverable', 'Quality management plan and QA/QC documents', '质量管理计划及 QA/QC 全套文件', 0, 'quality management|QA ?[&/] ?QC|质量管理', '', '移交需求 二.9'],
  ['pk3', 'deliverable', 'Inspection and test records at hold and witness points', '停工待检点、见证点检查与试验记录', 0, 'hold point|witness point|待检点|见证点', '', '移交需求 一.8'],
  ['pk3', 'deliverable', 'NCR register – all non-conformances closed', '不符合报告 NCR 台账（全部闭环）', 0, '\\bNCR\\b|non-?conformance|不符合', '', '移交需求 一.8'],
  ['ct10', 'deliverable', 'Independent handover checklist – all handover documents complete', '独立移交检查清单（确认全部移交资料齐全）', 1, 'handover checklist|移交.{0,4}检查清单|总检', '', '移交需求 二.10'],
  ['ct11', 'deliverable', 'Sectional taking-over agreement (if applicable)', '分段移交协议（如适用）', 0, 'sectional.{0,20}agreement|分段移交协议', '', '移交需求 二.11'],
  ['ct11', 'deliverable', 'Confirmation of sectional taking-over effective date (if applicable)', '分段移交生效日期确认记录（如适用）', 0, 'effective date|生效日期', '', '移交需求 二.11'],
  ['pk8', 'activity', 'All contract documents uploaded to cloud storage (SharePoint); hard copies on request', '全部合同文件上传云存储（SharePoint），按需提供纸质版', 0, 'sharepoint|cloud storage|云存储', '', '移交需求 二.12'],
  ['pk8', 'milestone', 'Final document set submitted – latest approved revisions, all Owner comments closed (≥ 6 months before DNP expiry)', '终版全套文件提交（最新审批版本，关闭业主全部意见；缺陷通知期到期前 6 个月）', 1, 'final (document|doc) set|终版全套', '', '移交需求 二.12']
];
function ctTreeKey(reg){ var f = fieldsOf(reg).filter(function(x){ return x.type === 'tree' && x.treeVer === DEF_TREE_VER && (x.tree || []).some(function(n){ return n.id === 'ct10'; }); })[0]; return f ? f.key : null; }
function ctItemsPlan(reg){
  var key = ctTreeKey(reg); if(!key || reg.d.ctItems || reg.d.tpl !== 'turnover') return null;
  var ro = rolesOf(reg), recs = recsOf(reg.id), kf = rf(reg, 'kind'), kinds = kf ? optsOf(kf).map(function(o){ return o.v; }) : [];
  function txt(r){ return [r.d[ro.title], r.d[ro.title2]].filter(Boolean).join(' '); }
  var m = String(reg.d.prefix || 'REC').toUpperCase(), re = new RegExp('^' + m.replace(/[^A-Z0-9]/g, '') + '-(\\d+)$', 'i'), max = 0;
  recs.forEach(function(r){ var x = re.exec(r.d[ro.no] || ''); if(x) max = Math.max(max, +x[1]); });
  var add = [], skip = [];
  CT_ITEMS.forEach(function(it){
    var dup = it[5] && recs.filter(function(r){ return new RegExp(it[5], 'i').test(txt(r)); })[0]; if(dup){ skip.push({t:it[2], by:dup.id}); return; }
    var par = it[6] && recs.filter(function(r){ return !r.d.parent && new RegExp(it[6], 'i').test(txt(r)); })[0];
    var d = blankData(reg, {}); if(ro.no) d[ro.no] = m + '-' + String(++max).padStart(3, '0');
    d[ro.title] = it[2]; if(ro.title2) d[ro.title2] = it[3]; d[key] = it[0];
    if(kf && kinds.indexOf(it[1]) >= 0) d[kf.key] = it[1]; if(it[4]) d.star = true; if(fieldOf(reg, 'explanation')) d.explanation = it[7];
    if(par) d.parent = par.id;
    add.push({id:uid('r'), reg:reg.id, d:d});
  });
  return {add:add, skip:skip};
}
function ctItemsUpgrade(){
  var jobs = allRegs().filter(canWrite).map(function(reg){ var p = ctItemsPlan(reg); return p ? {reg:reg, p:p} : null; }).filter(Boolean);
  if(!jobs.length) return Promise.resolve(0);
  var n = 0;
  return Promise.all(jobs.map(function(j){
    return STORE.patchReg(j.reg.id, {ctItems:{ver:CT_ITEMS_VER, at:new Date().toISOString(), ids:j.p.add.map(function(x){ return x.id; }), skip:j.p.skip}})
      .then(function(){ return j.p.add.length ? STORE.createRecs(j.p.add) : null; }).then(function(){ n += j.p.add.length; });
  })).then(function(){ if(typeof notify === 'function') notify(); return n; });
}
function ctItemsUndo(regId){
  var reg = getReg(regId), ci = reg && reg.d.ctItems; if(!ci) return;
  var ids = (ci.ids || []).filter(function(id){ return getRec(id); });
  Promise.all(ids.map(function(id){ return STORE.deleteRec(id); })).then(function(){ return STORE.patchReg(reg.id, {ctItems:{ver:CT_ITEMS_VER, at:ci.at, ids:[], removed:true}}); })
    .then(function(){ closeModal(); toast(T(ids.length + ' contract item(s) removed.', '已删除 ' + ids.length + ' 条合同要求项。')); });
}
function pkgReviewModal(m){
  var regs = allRegs().filter(function(r){ return r.d.pkgMig || (r.d.ctItems && (r.d.ctItems.ids || []).length); });
  var h = '<p class="note" style="margin-top:0">' + L('The turnover register now follows the contract handover requirements: P0 handover process and milestones, P1–P12 the submission list 1–12. Dates are left empty for you to fill in.', '移交台账已按合同移交需求调整：P0 为移交流程与节点，P1–P12 对应提交资料清单 1–12。新增项目的日期留空，请按实际计划填写。') + '</p>';
  regs.forEach(function(reg){ var mg = reg.d.pkgMig, ci = reg.d.ctItems, ro = rolesOf(reg), key = mg ? mg.key : ctTreeKey(reg), f = fieldOf(reg, key);
    function lab(id){ var n = f && treeNode(f, id) || (mg && mg.prev || []).filter(function(x){ return x.id === id; })[0]; return n ? treeLabel(n) : id; }
    function oldLab(id){ var n = (mg && mg.prev || []).filter(function(x){ return x.id === id; })[0]; return n ? treeLabel(n) : id; }
    function link(r){ return '<a href="#" data-act="openRec" data-v="' + esc(r.id) + '">' + esc(recNo(reg, r) + ' ' + (r.d[ro.title] || '')) + '</a>'; }
    h += '<h3>' + esc(regName(reg)) + '</h3>';
    if(mg) h += '<h4>' + L('Moved to a new package', '移到新文件包') + ' (' + mg.moves.length + ')</h4>' + (mg.moves.length ? '<table class="tbl"><thead><tr><th>' + L('Record', '记录') + '</th><th>' + L('Was', '原为') + '</th><th>' + L('Now', '现为') + '</th></tr></thead><tbody>' + mg.moves.map(function(x){ var r = getRec(x.id); return '<tr><td>' + (r ? link(r) : esc(x.id)) + '</td><td>' + esc(oldLab(x.from)) + '</td><td>' + esc(lab(x.to)) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="note">' + L('No records needed moving.', '没有需要移动的记录。') + '</p>');
    if(ci && (ci.ids || []).length){ var added = ci.ids.map(getRec).filter(Boolean), by = {};
      added.forEach(function(r){ var k = r.d[key] || ''; (by[k] = by[k] || []).push(r); });
      h += '<h4>' + L('Added from the contract', '按合同新增') + ' (' + added.length + ')</h4><table class="tbl"><tbody>' + (f ? treeNodes(f) : []).filter(function(n){ return by[n.id]; }).map(function(n){ return '<tr><td style="white-space:nowrap;vertical-align:top"><b>' + esc(treeLabel(n)) + '</b></td><td>' + by[n.id].map(function(r){ return (r.d.star ? '★ ' : '') + link(r) + (r.d.parent && getRec(r.d.parent) ? ' <span class="note">↳ ' + esc(getRec(r.d.parent).d[ro.title] || '') + '</span>' : ''); }).join('<br>') + '</td></tr>'; }).join('') + '</tbody></table>';
      if((ci.skip || []).length) h += '<p class="note">' + L('Already in the register, not added again: ', '台账中已有，未重复添加：') + esc(ci.skip.map(function(x){ var r = getRec(x.by); return x.t + (r ? ' → ' + (r.d[ro.title] || '') : ''); }).join(' · ')) + '</p>';
    }
    if(canTeamEdit()) h += '<div class="row" style="margin-top:8px">' + (ci && (ci.ids || []).length ? '<button type="button" class="btn sm danger-o" data-act="ctUndo" data-v="' + esc(reg.id) + '">' + L('Remove the added items', '删除新增项目') + '</button>' : '') + (mg ? '<button type="button" class="btn sm danger-o" data-act="pkgUndo" data-v="' + esc(reg.id) + '">' + L('Undo everything: previous packages', '全部撤销：恢复原来的文件包') + '</button>' : '') + '</div>';
  });
  if(!regs.length) h += '<p class="note">' + L('Nothing to show.', '没有可显示的内容。') + '</p>';
  return {title:L('Turnover register updated', '移交台账已更新'), wide:true, html:h, foot:'<button type="button" class="btn pri" data-act="mclose">' + L('OK', '好') + '</button>'};
}
function pkgUndo(regId){
  var reg = getReg(regId), mg = reg && reg.d.pkgMig; if(!mg) return;
  var ci = reg.d.ctItems, extra = ci ? (ci.ids || []).filter(function(id){ return getRec(id); }) : [];
  var fs = clone(fieldsOf(reg)); fs.forEach(function(x){ if(x.key === mg.key){ x.tree = mg.prev; x.treeVer = 'declined'; } });
  var back = mg.moves.filter(function(m){ var r = getRec(m.id); return r && r.d[mg.key] === m.to; });
  Promise.all(extra.map(function(id){ return STORE.deleteRec(id); }))
    .then(function(){ return STORE.patchReg(reg.id, {fields:fs, pkgMig:null, ctItems:ci ? {ver:CT_ITEMS_VER, at:ci.at, ids:[], removed:true} : null}); })
    .then(function(){ return setRecs(back.map(function(m){ var pt = {}; pt[mg.key] = m.from; return {rec:getRec(m.id), patch:pt}; })); })
    .then(function(){ closeModal(); toast(T('Previous packages restored.', '已恢复原来的文件包。')); });
}
/* v3.2: the same message as a notice behind the bell (unread until "Got it") */
function pkgNotice(){
  var at = ''; allRegs().forEach(function(r){ [r.d.pkgMig && r.d.pkgMig.at, r.d.ctItems && (r.d.ctItems.ids || []).length && r.d.ctItems.at].forEach(function(x){ if(x && x > at) at = x; }); }); if(!at) return null;
  var seen = ''; try{ seen = localStorage.getItem('ww.pkgSeen') || ''; }catch(e){}
  return {k:'pkg', unread:seen < at, html:L('The turnover register now follows the contract handover requirements: P0 handover process & milestones, P1–P12 submission list.', '移交台账已按合同移交需求更新：P0 移交流程与节点，P1–P12 对应提交资料清单。') +
    '<div class="row" style="margin-top:6px"><button type="button" class="btn sm" data-act="pkgReview">' + L('See what changed', '查看变更') + '</button>' + (seen < at ? '<button type="button" class="btn sm" data-act="pkgSeen" data-v="' + esc(at) + '">' + L('Got it', '知道了') + '</button>' : '') + '</div>'};
}
/* a banner until each person has seen the change once (per browser) */
function pkgBanner(){
  var at = ''; allRegs().forEach(function(r){ [r.d.pkgMig && r.d.pkgMig.at, r.d.ctItems && (r.d.ctItems.ids || []).length && r.d.ctItems.at].forEach(function(x){ if(x && x > at) at = x; }); }); if(!at) return '';
  var seen = ''; try{ seen = localStorage.getItem('ww.pkgSeen') || ''; }catch(e){}
  if(seen >= at) return '';
  return '<div class="banner">' + L('The turnover register now follows the contract handover requirements: P0 handover process & milestones, P1–P12 submission list.', '移交台账已按合同移交需求更新：P0 移交流程与节点，P1–P12 对应提交资料清单。') +
    ' <button type="button" class="btn sm" data-act="pkgReview">' + L('See what changed', '查看变更') + '</button> <button type="button" class="btn sm" data-act="pkgSeen" data-v="' + esc(at) + '">' + L('Got it', '知道了') + '</button></div>';
}
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act="pkgReview"],[data-act="pkgUndo"],[data-act="pkgSeen"],[data-act="ctUndo"]'); if(!el) return;
  if(el.dataset.act === 'pkgReview') openModal({kind:'pkgReview'});
  else if(el.dataset.act === 'pkgSeen'){ try{ localStorage.setItem('ww.pkgSeen', el.dataset.v); }catch(err){} renderAll(); }
  else if(el.dataset.act === 'ctUndo') ctItemsUndo(el.dataset.v);
  else pkgUndo(el.dataset.v);
});
if(typeof DECK_MODALS !== 'undefined') DECK_MODALS.pkgReview = pkgReviewModal;
