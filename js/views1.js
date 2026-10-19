/* work-web v2 · views: overview, register (table / board / gantt / block matrix), schedule, shared gantt. */
'use strict';

function kpi(label, value, sub, cls, act, v){ return '<' + (act ? 'button type="button" data-act="' + act + '" data-v="' + esc(v || '') + '"' : 'div') + ' class="kpi card ' + (cls || '') + '"><span class="kl">' + label + '</span><b>' + value + '</b>' + (sub ? '<span class="ks">' + sub + '</span>' : '') + '</' + (act ? 'button' : 'div') + '>'; }
function pct(a, b){ return b ? Math.round(a / b * 100) : 0; }
function heat(p){ if(p == null) return ''; var a = Math.round(8 + p * 0.5); return 'background:color-mix(in srgb, var(--gp-green) ' + a + '%, var(--surface))'; }

/* ================= Overview ================= */
function viewHome(){
  var c = cfg(), regs = allRegs(), A = asOfN();
  var h = '<div class="ph"><div><h1 class="vtitle">' + L('Overview', '总览') + '</h1><span class="muted">' + esc(c.projectEn) + ' · ' + L('status date', '状态日期') + ' <span class="mono">' + esc(n2d(A)) + '</span></span></div></div>';
  if(!regs.length) return h + '<div class="card empty">' + L('No registers yet.', '还没有台账。') + (canCreateReg() ? ' <button type="button" class="btn pri" data-act="newReg">' + L('Create the first register', '建立第一个台账') + '</button>' : '') + '</div>';
  // block panel (PV site): progress from registers with a block role
  var bl = lists().blocks, bregs = regs.filter(function(r){ return rf(r, 'block'); });
  if(bl && bl.opts.length && bregs.length){
    h += '<section class="card sec"><div class="sech"><h2>' + L('By block', '按区域') + '</h2><span class="note">' + L('Average progress of each register in that block · open items', '各台账在该区域的平均进度 · 未完成项') + '</span></div><div class="blocks">' + bl.opts.map(function(b){
      var rows = bregs.map(function(r){
        var its = recsOf(r.id).filter(function(x){ return blocksOf(r, x).indexOf(b.v) >= 0; }); if(!its.length) return '';
        var ps = its.map(function(x){ return progressOf(r, x); }).filter(function(x){ return x != null; }), avg = ps.length ? Math.round(ps.reduce(function(s, x){ return s + x; }, 0) / ps.length) : null;
        var open = its.filter(function(x){ return !isDone(r, x); }).length, od = its.filter(function(x){ return isOverdue(r, x); }).length;
        return '<button type="button" class="brow" data-act="goBlock" data-v="' + esc(r.id + '|' + b.v) + '"><span class="ri c-' + esc(r.d.color || 'blue') + '">' + icon(r.d.icon, 13) + '</span><span class="bn">' + esc(regName(r)) + '</span>' + (avg != null ? pbar(avg) : '<span></span>') + '<span class="mono muted">' + open + (od ? ' <b class="odn">' + od + '!</b>' : '') + '</span></button>';
      }).join('');
      return '<div class="bcard"><div class="bh"><span class="ar c-' + esc(b.color) + '">' + esc(b.v) + '</span> <b>' + esc(nm(b)) + '</b></div>' + (rows || '<div class="note">' + L('Nothing yet', '暂无') + '</div>') + '</div>';
    }).join('') + '</div></section>';
  }
  // registers
  h += '<section class="sec"><div class="sech"><h2>' + L('Registers', '台账') + '</h2></div><div class="rgrid">' + regs.map(function(r){
    var its = recsOf(r.id), done = its.filter(function(x){ return isDone(r, x); }).length, od = its.filter(function(x){ return isOverdue(r, x); }).length;
    var due = its.filter(function(x){ var p = planOf(r, x); return p && !isDone(r, x) && p.f >= A && p.f <= A + 14; }).length;
    var sf = rf(r, 'status'), segs = sf && its.length ? optsOf(sf).map(function(o){ var k = its.filter(function(x){ return x.d[sf.key] === o.v; }).length; return k ? '<span class="cb-' + esc(o.color) + '" style="width:' + (k / its.length * 100) + '%" title="' + esc(nm(o) + ': ' + k) + '"></span>' : ''; }).join('') : '';
    return '<button type="button" class="rcard card" data-act="reg" data-v="' + esc(r.id) + '"><div class="rch"><span class="ri c-' + esc(r.d.color || 'blue') + '">' + icon(r.d.icon, 18) + '</span><b>' + esc(regName(r)) + '</b>' + (isPrivate(r) ? uic('lock', 13) : '') + '</div>' +
      '<div class="rcn"><span><b class="mono">' + its.length + '</b> ' + L('items', '项') + '</span>' + (sf ? '<span><b class="mono">' + pct(done, its.length) + '%</b> ' + L('done', '完成') + '</span>' : '') + (od ? '<span class="odn"><b class="mono">' + od + '</b> ' + L('overdue', '逾期') + '</span>' : '') + (due ? '<span><b class="mono">' + due + '</b> ' + L('due ≤14d', '14天内到期') + '</span>' : '') + '</div>' + (segs ? '<span class="stack">' + segs + '</span>' : '') + '</button>';
  }).join('') + (canCreateReg() ? '<button type="button" class="rcard card addc" data-act="newReg">' + uic('plus', 20) + L('New register', '新建台账') + '</button>' : '') + '</div></section>';
  // due soon + overdue
  var soon = [], late = [];
  regs.forEach(function(r){ recsOf(r.id).forEach(function(x){ if(isDone(r, x)) return; var p = planOf(r, x); if(!p) return; if(p.f < A) late.push({r:r, x:x, f:p.f}); else if(p.f <= A + 14) soon.push({r:r, x:x, f:p.f}); }); });
  late.sort(function(a, b){ return a.f - b.f; }); soon.sort(function(a, b){ return a.f - b.f; });
  function lst(arr){ return arr.slice(0, 12).map(function(e){ return '<button type="button" class="lrow2" data-act="openRec" data-id="' + esc(e.x.id) + '"><span class="ri c-' + esc(e.r.d.color || 'blue') + '">' + icon(e.r.d.icon, 13) + '</span><span class="mono muted">' + esc(recNo(e.r, e.x)) + '</span><span class="lt">' + esc(recTitle(e.r, e.x) || '—') + '</span><span class="mono' + (e.f < A ? ' od' : '') + '">' + esc(md(n2d(e.f))) + '</span></button>'; }).join('') + (arr.length > 12 ? '<div class="note">+' + (arr.length - 12) + '</div>' : ''); }
  // open meeting actions
  var acts = [];
  regs.forEach(function(r){ dataFields(r).filter(function(f){ return f.type === 'sub' && (f.cols || []).some(function(c){ return c.type === 'check'; }) && (f.cols || []).some(function(c){ return c.type === 'date'; }); }).forEach(function(f){
    var ck = f.cols.filter(function(c){ return c.type === 'check'; })[0].key, dk = f.cols.filter(function(c){ return c.type === 'date'; })[0].key, tk = (f.cols.filter(function(c){ return c.type === 'text' || c.type === 'long'; })[0] || {}).key, wk = (f.cols.filter(function(c){ return /who|owner|resp/i.test(c.key); })[0] || {}).key;
    recsOf(r.id).forEach(function(x){ asArr(x.d[f.key]).forEach(function(row){ if(!row[ck]) acts.push({r:r, x:x, t:row[tk], who:row[wk], due:row[dk]}); }); }); }); });
  acts.sort(function(a, b){ return (d2n(a.due) || 1e9) - (d2n(b.due) || 1e9); });
  h += '<div class="cols3"><section class="card sec"><div class="sech"><h2>' + L('Overdue', '已逾期') + ' <span class="cnt">' + late.length + '</span></h2></div>' + (late.length ? lst(late) : '<div class="note">' + L('Nothing overdue', '没有逾期项') + '</div>') + '</section>' +
    '<section class="card sec"><div class="sech"><h2>' + L('Due in the next 14 days', '未来 14 天到期') + ' <span class="cnt">' + soon.length + '</span></h2></div>' + (soon.length ? lst(soon) : '<div class="note">' + L('Nothing due', '没有到期项') + '</div>') + '</section>' +
    '<section class="card sec"><div class="sech"><h2>' + L('Open meeting actions', '会议待办') + ' <span class="cnt">' + acts.length + '</span></h2></div>' + (acts.length ? acts.slice(0, 12).map(function(e){ var od = d2n(e.due) != null && d2n(e.due) < A; return '<button type="button" class="lrow2" data-act="openRec" data-id="' + esc(e.x.id) + '"><span class="ri c-' + esc(e.r.d.color || 'blue') + '">' + icon(e.r.d.icon, 13) + '</span><span class="mono muted">' + esc(recNo(e.r, e.x)) + '</span><span class="lt">' + esc(e.t || '—') + (e.who ? ' <span class="muted">· ' + esc(e.who) + '</span>' : '') + '</span><span class="mono' + (od ? ' od' : '') + '">' + esc(md(e.due) || '—') + '</span></button>'; }).join('') : '<div class="note">' + L('No open actions', '没有待办') + '</div>') + '</section></div>';
  // recent changes
  var au = ((STORE && STORE.audit) || []).slice(0, 8); window.__AUD = window.__AUD || {}; au.forEach(function(a){ window.__AUD[a.id] = a; });
  h += '<section class="card sec"><div class="sech"><h2>' + L('Recent changes', '最近修改') + '</h2><button type="button" class="lnk" data-act="page" data-v="activity">' + L('Full change log', '完整修改记录') + ' →</button></div>' + (au.length ? au.map(function(a){ return auditRowHtml(a, {showReg:true, showRec:true}); }).join('') : '<div class="note">' + L('No changes yet', '还没有修改') + '</div>') + '</section>';
  return h;
}

/* ================= Register page ================= */
function regView(reg){ var v = S.rv[reg.id] || reg.d.view || 'table'; if(v === 'gantt' && !rolesOf(reg).start && !rolesOf(reg).finish) v = 'table'; if(v === 'board' && !boardField(reg)) v = 'table'; if(v === 'matrix' && !matrixCfg(reg).col) v = 'table'; return v; }
function boardField(reg){ var k = S.rboard[reg.id] || reg.d.board || rolesOf(reg).status; var f = k && fieldOf(reg, k); if(f && f.type === 'select') return f; return dataFields(reg).filter(function(x){ return x.type === 'select' && !x.multi; })[0] || null; }
function matrixCfg(reg){ var m = Object.assign({}, reg.d.matrix || {}, S.rmx[reg.id] || {}); if(!m.col || !fieldOf(reg, m.col)) m.col = rolesOf(reg).block || ''; if(!m.row || !fieldOf(reg, m.row)) m.row = rolesOf(reg).tree || rolesOf(reg).status || ''; if(!m.val) m.val = rolesOf(reg).progress ? 'progress' : 'count'; return m; }
function viewRegister(reg){
  var ed = canWrite(reg), v = regView(reg), all = recsOf(reg.id), list = filteredRecs(reg), ro = rolesOf(reg);
  var views = [['table','table','Table','表格']];
  if(boardField(reg)) views.push(['board','board','Board','看板']);
  if(ro.start || ro.finish) views.push(['gantt','gantt','Gantt','甘特图']);
  if(ro.block) views.push(['matrix','grid','Block matrix','区域矩阵']);
  var h = '<div class="ph"><div class="pht"><span class="ri big c-' + esc(reg.d.color || 'blue') + '">' + icon(reg.d.icon, 20) + '</span><div><h1 class="vtitle">' + regNameL(reg) + '</h1><span class="muted">' + (isPrivate(reg) ? uic('lock', 12) + ' ' + L('Only you can see this register', '仅你自己可见') + ' · ' : '') + L(list.length + ' of ' + all.length + ' items', all.length + ' 项中显示 ' + list.length + ' 项') + (ed ? '' : ' · ' + L('read only', '只读')) + '</span></div></div>' +
    '<div class="pha"><div class="seg">' + views.map(function(x){ return '<button type="button" data-act="rview" data-v="' + x[0] + '" aria-pressed="' + (v === x[0]) + '">' + uic(x[1], 14) + ' ' + L(x[2], x[3]) + '</button>'; }).join('') + '</div>' +
    (ed ? '<button type="button" class="btn pri" data-act="newRec">' + uic('plus', 14) + ' ' + L('New', '新增') + '</button>' : '') +
    '<details class="menu"><summary class="btn">⋯</summary><div class="pop pop-r">' +
      (canSchemaEdit(reg) ? '<button type="button" data-act="fieldsOpen" data-v="' + esc(reg.id) + '">' + L('Fields & columns', '字段与列') + '</button><button type="button" data-act="regSettings" data-v="' + esc(reg.id) + '">' + L('Register settings', '台账设置') + '</button>' : '') +
      (ed ? '<button type="button" data-act="impOpen" data-v="' + esc(reg.id) + '">' + L('Import Excel…', '导入 Excel…') + '</button>' : '') +
      '<button type="button" data-act="expReg" data-v="' + esc(reg.id) + '">' + L('Export Excel (filtered)', '导出 Excel（当前筛选）') + '</button>' +
      '<button type="button" data-act="regHist" data-v="' + esc(reg.id) + '">' + L('Change log of this register', '本台账修改记录') + '</button>' + regPlanMenu(reg) + regMenuItem(reg) + (isPeopleReg(reg) && canTeamEdit() ? '<button type="button" data-act="peopleMatch">' + L('Match names in other registers…', '对照其他台账中的名字…') + '</button>' : '') + (canTeamEdit() && !isPrivate(reg) && reg.d.kind !== 'decks' && !isPeopleReg(reg) ? '<button type="button" data-act="shareReg" data-v="' + esc(reg.id) + '">' + L('Public link for this view…', '为当前视图生成公开链接…') + '</button>' : '') +
    '</div></details></div></div>';
  h += regFilters(reg);
  var body;
  if(v === 'board') body = viewBoard(reg, list);
  else if(v === 'gantt') body = ganttHtml([{reg:reg, items:list}], {reg:reg, group:S.rg[reg.id + ':g'] || (ro.tree || 'none')});
  else if(v === 'matrix') body = viewMatrix(reg, list);
  else body = viewTable(reg, list);
  var tf = rf(reg, 'tree');
  if(tf && (v === 'table' || v === 'board')) h += '<div class="withtree">' + treePanel(reg, tf) + '<div class="wt-main">' + body + '</div></div>';
  else h += body;
  return h;
}
function treePanel(reg, tf){
  var f = rfil(reg.id), base = recsOf(reg.id).filter(function(r){ return matchRec(reg, r, f, true); }), cnt = {};
  base.forEach(function(r){ treePath(tf, r.d[tf.key]).forEach(function(n){ cnt[n.id] = (cnt[n.id] || 0) + 1; }); });
  var none = base.filter(function(r){ return !treeNode(tf, r.d[tf.key]); }).length;
  var te = !!(S.treeEdit && S.treeEdit[reg.id]) && canSchemaEdit(reg);
  var h = '<aside class="tree card' + (te ? ' editing' : '') + '"><div class="th"><b>' + L(tf.en, tf.zh) + '</b>' + (canSchemaEdit(reg) ? '<button type="button" class="btn sm' + (te ? ' on' : '') + '" data-act="treeEdit">' + (te ? L('Done', '完成') : L('Edit', '编辑')) + '</button>' : '') + '</div>';
  if(te) h += '<p class="note" style="margin:0 6px 6px">' + L('＋ adds a sub-level, ✎ renames, ↑↓ reorders, × deletes. Changes save at once and are in the change log.', '＋ 添加下级，✎ 改名，↑↓ 排序，× 删除。修改即时保存并记入修改记录。') + '</p>';
  h += '<button type="button" class="tnode' + (f.node === 'all' || !f.node ? ' on' : '') + '" data-act="tnode" data-v="all"><span>' + L('All', '全部') + '</span><span class="mono muted">' + base.length + '</span></button>';
  treeDfs(tf, function(n, d){
    if(te){ h += '<div class="tnode te" style="padding-left:' + (10 + d * 14) + 'px"><span class="tlab"><span class="mono muted">' + esc(n.code || '') + '</span> ' + esc(nm(n)) + ' <span class="mono muted">' + (cnt[n.id] || 0) + '</span></span><span class="tacts"><button type="button" class="ib" data-act="tnAdd" data-v="' + esc(n.id) + '" title="' + esc(T('Add sub-level', '添加下级')) + '">＋</button><button type="button" class="ib" data-act="tnRen" data-v="' + esc(n.id) + '" title="' + esc(T('Rename', '改名')) + '">✎</button><button type="button" class="ib" data-act="tnMove" data-v="' + esc(n.id) + '" data-d="-1" title="' + esc(T('Up', '上移')) + '">↑</button><button type="button" class="ib" data-act="tnMove" data-v="' + esc(n.id) + '" data-d="1" title="' + esc(T('Down', '下移')) + '">↓</button><button type="button" class="ib" data-act="tnDel" data-v="' + esc(n.id) + '" title="' + esc(T('Delete', '删除')) + '">×</button></span></div>'; return; }
    h += '<button type="button" class="tnode' + (f.node === n.id ? ' on' : '') + '" data-act="tnode" data-v="' + esc(n.id) + '" style="padding-left:' + (10 + d * 14) + 'px"><span><span class="mono muted">' + esc(n.code || '') + '</span> ' + esc(nm(n)) + '</span><span class="mono muted">' + (cnt[n.id] || 0) + '</span></button>'; });
  if(te) h += '<button type="button" class="btn sm" data-act="tnAdd" data-v="" style="margin:8px 6px">＋ ' + L('Add top-level category', '新增顶层分类') + '</button>';
  if(none) h += '<button type="button" class="tnode' + (f.node === 'none' ? ' on' : '') + '" data-act="tnode" data-v="none"><span class="muted">' + L('Unclassified', '未分类') + '</span><span class="mono muted">' + none + '</span></button>';
  return h + '</aside>';
}
function regFilters(reg){
  var f = rfil(reg.id), n = activeFilterCount(reg), ff = filterFields(reg);
  var h = '<div class="card filters' + (S.fOpen ? ' open' : '') + '"><label class="search">' + uic('search', 15) + '<input id="fq" type="search" data-fk="fq:' + esc(reg.id) + '" placeholder="' + esc(T('Search this register', '搜索本台账')) + '" value="' + esc(f.q) + '"></label>' +
    '<button type="button" class="btn ftoggle" data-act="fToggle">' + L('Filters', '筛选') + (n ? ' (' + n + ')' : '') + '</button><div class="fmore">';
  ff.forEach(function(fd){
    var sel = f.fx[fd.key] || [];
    if(fd.list === 'blocks'){ h += '<div class="fchips">' + optsOf(fd).map(function(o){ return '<button type="button" class="fchip" data-act="fx" data-k="' + esc(fd.key) + '" data-v="' + esc(o.v) + '" aria-pressed="' + (sel.indexOf(o.v) >= 0) + '">' + esc(S.lang === 'zh' ? (o.zh || o.v) : o.en || o.v) + '</button>'; }).join('') + '</div>'; return; }
    var lab = sel.length ? sel.map(function(v){ if(fd.type === 'check') return v === '1' ? T('Yes', '是') : T('No', '否'); var o = optOf(fd, v); return o ? nm(o) : v; }).join(', ') : '';
    h += '<button type="button" class="fbtn' + (sel.length ? ' on' : '') + '" data-act="fxPick" data-k="' + esc(fd.key) + '">' + esc(T1(fd.en, fd.zh)) + (lab ? ': <b>' + esc(lab.length > 26 ? lab.slice(0, 24) + '…' : lab) + '</b>' : ' ▾') + '</button>';
  });
  if(rolesOf(reg).start || rolesOf(reg).finish) h += '<span class="drange"><span class="muted">' + L('Dates', '日期') + '</span><input class="in" type="date" id="ffrom" value="' + esc(f.from) + '" aria-label="From">–<input class="in" type="date" id="fto" value="' + esc(f.to) + '" aria-label="To"></span>';
  h += (rolesOf(reg).finish ? '<label class="chk"><input type="checkbox" id="fod"' + (f.od ? ' checked' : '') + '>' + L('Overdue', '逾期') + '</label>' : '') +
    '<label class="chk"><input type="checkbox" id="fstar"' + (f.star ? ' checked' : '') + '>★ ' + L('Key', '重点') + '</label>' +
    (reg.d.ownerPublish ? '<label class="chk"><input type="checkbox" id="fext"' + (f.ext ? ' checked' : '') + '>' + L('External', '对外') + '</label>' : '') +
    (n ? '<button type="button" class="btn sm" data-act="fClear">' + L('Clear', '清除') + '</button>' : '') + '</div></div>';
  return h;
}

/* ---------------- table ---------------- */
function tableCols(reg){ var pick = S.rcols[reg.id]; var ds = dataFields(reg); if(pick && pick.length) return ds.filter(function(f){ return pick.indexOf(f.key) >= 0; }); return ds.filter(function(f){ return !f.hide; }); }
function viewTable(reg, list){
  var ed = canWrite(reg), cols = tableCols(reg), gk = S.rg[reg.id] || (reg.d.group && fieldOf(reg, reg.d.group) ? reg.d.group : 'none'), ro = rolesOf(reg);
  if(window.innerWidth < 720) return viewCards(reg, list);
  list = sortRecs(reg, list);
  var s = S.rs[reg.id] || {k: ro.no || '', d:1};
  var selIds = Object.keys(S.sel).filter(function(id){ return S.sel[id] && getRec(id) && getRec(id).reg === reg.id; });
  var h = '<div class="tbar"><label class="fl row">' + L('Group', '分组') + '<select class="in" id="rgroup"><option value="none">' + esc(T('None', '不分组')) + '</option>' + groupable(reg).map(function(f){ return '<option value="' + esc(f.key) + '"' + (gk === f.key ? ' selected' : '') + '>' + esc(T1(f.en, f.zh)) + '</option>'; }).join('') + '</select></label>' +
    '<button type="button" class="btn" data-act="colsPick">' + L('Columns', '列') + ' ▾</button>' +
    '<span class="note">' + L('Click a cell to edit · click the No. for all fields', '点单元格直接编辑 · 点编号查看全部字段') + '</span></div>';
  if(selIds.length && ed){
    h += '<div class="bulk"><b>' + L(selIds.length + ' selected', '已选 ' + selIds.length) + '</b><select class="in" id="bulkField"><option value="">' + esc(T('Set a field…', '批量设置字段…')) + '</option>' + dataFields(reg).filter(function(f){ return ['text','number','percent','date','select','tree','check','long'].indexOf(f.type) >= 0 && !(f.type === 'percent' && f.auto); }).map(function(f){ return '<option value="' + esc(f.key) + '">' + esc(T1(f.en, f.zh)) + '</option>'; }).join('') + '</select>' +
      (S.bulkF ? bulkInput(reg, fieldOf(reg, S.bulkF)) : '') +
      (reg.d.ownerPublish && !isPrivate(reg) ? '<button type="button" class="btn sm" data-act="bulkExt" data-v="1">' + L('Show in Owner plan', '显示于业主计划') + '</button><button type="button" class="btn sm" data-act="bulkExt" data-v="0">' + L('Remove from Owner plan', '移出业主计划') + '</button>' : '') +
      (S.bulkDel ? '<button type="button" class="btn sm danger" data-act="bulkDelYes">' + L('Confirm delete ' + selIds.length, '确认删除 ' + selIds.length + ' 项') + '</button>' : '<button type="button" class="btn sm danger-o" data-act="bulkDel">' + L('Delete', '删除') + '</button>') +
      '<button type="button" class="btn sm" data-act="selClear">' + L('Clear selection', '取消选择') + '</button></div>';
  }
  var th = '<tr>' + (ed ? '<th class="sel"><input type="checkbox" id="selall" aria-label="Select all"></th>' : '') + cols.map(function(f){
    var sorted = s.k === f.key;
    return '<th style="' + (fieldW(f) ? 'min-width:' + fieldW(f) + 'px' : '') + '"><button type="button" class="thb" data-act="sort" data-v="' + esc(f.key) + '">' + L(f.en, f.zh) + (sorted ? (s.d > 0 ? ' ↑' : ' ↓') : '') + '</button></th>';
  }).join('') + (canSchemaEdit(reg) ? '<th class="addcol"><button type="button" class="ib" data-act="fieldsOpen" data-v="' + esc(reg.id) + '" title="' + esc(T('Add a field', '添加字段')) + '">' + uic('plus', 14) + '</button></th>' : '') + '</tr>';
  var body = '', groups = gk === 'none' ? [{k:'all', items:list}] : groupRecs(reg, list, gk), span = cols.length + (ed ? 1 : 0) + (canSchemaEdit(reg) ? 1 : 0);
  groups.forEach(function(g){
    if(gk !== 'none'){ var colp = !!S.gcol[reg.id + g.k], dn = g.items.filter(function(x){ return isDone(reg, x); }).length;
      body += '<tr class="grp"><td colspan="' + span + '"><button type="button" class="glb" data-act="gcol" data-v="' + esc(reg.id + g.k) + '">' + (colp ? '▸' : '▾') + ' ' + (g.color ? '<span class="sw c-' + esc(g.color) + '"></span>' : '') + '<b>' + esc(g.label) + '</b> <span class="muted mono">' + (rf(reg, 'status') ? dn + '/' : '') + g.items.length + '</span></button>' + (ed && g.set ? ' <button type="button" class="btn sm" data-act="grpAdd" data-v="' + esc(JSON.stringify(g.set)) + '">+ ' + L('Add here', '在此新增') + '</button>' : '') + '</td></tr>';
      if(colp) return; }
    body += hierRows(reg, g.items, cols, ed);
  });
  if(!list.length) body += '<tr><td colspan="' + span + '" class="empty">' + (recsOf(reg.id).length ? L('No items match the filters.', '没有符合筛选条件的记录。') : L('No items yet.', '还没有记录。')) + '</td></tr>';
  if(ed) body += '<tr class="qadd"><td colspan="' + span + '"><input class="in" id="qadd" data-fk="qadd:' + esc(reg.id) + '" placeholder="' + esc(T('+ Type a title and press Enter to add', '+ 输入标题后按 Enter 新增')) + '"></td></tr>';
  var vkey = 'tbl:' + reg.id, rowsA = vwSplit(body, 'tr'), long = rowsA.length > VW_MIN;
  var cg = long ? '<colgroup>' + (ed ? '<col style="width:34px">' : '') + cols.map(function(f){ return '<col style="width:' + colWidth(reg, f) + 'px">'; }).join('') + (canSchemaEdit(reg) ? '<col style="width:40px">' : '') + '</colgroup>' : '';
  var tw = long ? (ed ? 34 : 0) + cols.reduce(function(s0, f){ return s0 + colWidth(reg, f); }, 0) + (canSchemaEdit(reg) ? 40 : 0) : 0;
  return h + '<div class="card tbl-wrap"' + (long ? ' data-vw="' + esc(vkey) + '"' : '') + '><table class="tbl' + (long ? ' vwt' : '') + '"' + (long ? ' style="min-width:' + tw + 'px"' : '') + '>' + cg + '<thead>' + th + '</thead><tbody data-vwb="' + esc(vkey) + '">' + vwHtml(vkey, rowsA, 'tr', span) + '</tbody></table></div>';
}
function hierRows(reg, items, cols, ed){
  var ids = {}, kids = {}, roots = [], all = kidsIndex(reg.id), out = '';
  items.forEach(function(r){ ids[r.id] = 1; });
  items.forEach(function(r){ var p = r.d.parent; if(p && p !== r.id && ids[p]) (kids[p] = kids[p] || []).push(r); else roots.push(r); });
  (function w(list, depth){ list.forEach(function(r){
    var k = kids[r.id] || [], tot = all[r.id] || [], open = !!S.rexp[r.id];
    var hh = {depth:depth, kids:tot, open:open, orphan: depth === 0 && r.d.parent && !ids[r.d.parent] ? getRec(r.d.parent) : null};
    out += lzRow(function(){ return tableRow(reg, r, cols, ed, hh); });
    if(open && depth < 6){ if(k.length) w(k, depth + 1); if(ed) out += '<tr class="kadd"><td colspan="' + (cols.length + (ed ? 1 : 0) + (canSchemaEdit(reg) ? 1 : 0)) + '"><input class="in" data-kadd="' + esc(r.id) + '" data-fk="kadd:' + esc(r.id) + '" placeholder="' + esc(T('+ Add a sub-item under ', '+ 在此项下新增子项：') + recNo(reg, r) + T(' (Enter)', '（按 Enter）')) + '" style="margin-left:' + (28 + (depth + 1) * 22) + 'px"></td></tr>'; }
  }); })(roots, 0);
  return out;
}
function tableRow(reg, r, cols, ed, h){
  h = h || {depth:0, kids:[]};
  var ro = rolesOf(reg), od = isOverdue(reg, r), cm = openFb(r.id) > 0, ru = h.kids.length ? rollup(reg, r, h.kids) : null;
  return '<tr class="' + (r.d.star ? 'star ' : '') + (od ? 'odr ' : '') + (h.depth ? 'kid' : '') + '">' + (ed ? '<td class="sel"><input type="checkbox" class="rowsel" data-id="' + esc(r.id) + '"' + (S.sel[r.id] ? ' checked' : '') + ' aria-label="Select"></td>' : '') + cols.map(function(f){
    var ce = ed && f.type !== 'calc' && !(f.type === 'percent' && isAutoNow(r, f)), inner;
    if(S.edit && S.edit.id === r.id && S.edit.k === f.key){
      var v = r.d[f.key] == null ? '' : r.d[f.key];
      inner = f.type === 'long' ? '<textarea class="in ie" data-ie="1" data-fk="ie" rows="3">' + esc(v) + '</textarea>' : '<input class="in ie" data-ie="1" data-fk="ie" type="' + (f.type === 'date' ? 'date' : f.type === 'number' || f.type === 'percent' ? 'number' : 'text') + '" value="' + esc(v) + '">';
      return '<td class="editing">' + inner + '</td>';
    }
    if(f.key === ro.no) return '<td class="no"><button type="button" class="lnk mono" data-act="openRec" data-id="' + esc(r.id) + '">' + esc(r.d[f.key] || '—') + '</button>' + (r.d.star ? ' <span class="kst">★</span>' : '') + (cm ? '<span class="rdot"></span>' : '') + (function(){ var n = relCount(r); return n ? '<button type="button" class="rlk" data-act="openRecTab" data-v="' + esc(r.id) + '" title="' + esc(T(n + ' linked', n + ' 项关联')) + '">' + uic('link', 11) + n + '</button>' : ''; })() + '</td>';
    if(f.key === ro.title){ var lead = '<span class="ind" style="width:' + (h.depth * 22) + 'px"></span>' + (h.kids.length ? '<button type="button" class="cx" data-act="rexp" data-v="' + esc(r.id) + '" aria-expanded="' + !!h.open + '" title="' + esc(T('Show sub-items', '展开子项')) + '">' + (h.open ? '▾' : '▸') + '</button>' : (h.depth ? '<span class="cx0">└</span>' : ''));
      return '<td class="tt' + (ce ? ' ce' : '') + '"' + (ce ? ' data-ce="1" data-id="' + esc(r.id) + '" data-k="' + esc(f.key) + '"' : '') + '><div class="ttw">' + lead + '<div class="ttx">' + (h.orphan ? '<span class="pp">↳ ' + esc(recNo(reg, h.orphan) || recTitle(reg, h.orphan)) + '</span>' : '') + '<span class="tt1" title="' + esc(r.d[f.key] || recTitle(reg, r) || '') + '">' + esc(r.d[f.key] || recTitle(reg, r) || '—') + '</span>' + (recTitle2(reg, r) && !tableCols(reg).some(function(c){ return c.key === ro.title2; }) ? '<span class="tt2" title="' + esc(recTitle2(reg, r)) + '">' + esc(recTitle2(reg, r)) + '</span>' : '') + (ru ? '<button type="button" class="kc" data-act="rexp" data-v="' + esc(r.id) + '">' + L(ru.done + '/' + ru.n + ' sub-items done', ru.n + ' 个子项，已完成 ' + ru.done) + '</button>' : '') + '</div></div></td>'; }
    if(f.key === ro.progress && ru && (r.d[f.key] == null || r.d[f.key] === '') && !isAutoNow(r, f)) return '<td class="t-percent">' + pbar(ru.pct, '<span class="auto" title="' + esc(T('Rolled up from sub-items', '由子项汇总')) + '">Σ</span>') + '</td>';
    var tip = (f.type === 'text' || f.type === 'long') && r.d[f.key] && String(r.d[f.key]).length > 40 ? ' title="' + esc(String(r.d[f.key]).slice(0, 1200)) + '"' : '';
    return '<td class="t-' + esc(f.type) + (ce ? ' ce' : '') + '"' + tip + (ce ? ' data-ce="1" data-id="' + esc(r.id) + '" data-k="' + esc(f.key) + '"' : ' data-act="openRec" data-id="' + esc(r.id) + '"') + '>' + cellHtml(reg, f, r) + '</td>';
  }).join('') + (canSchemaEdit(reg) ? '<td></td>' : '') + '</tr>';
}
function bulkInput(reg, f){
  if(!f) return '';
  if(f.type === 'select' || f.type === 'tree') return '<button type="button" class="btn sm" data-act="bulkPick">' + L('Choose value…', '选择值…') + '</button>';
  if(f.type === 'check') return '<button type="button" class="btn sm" data-act="bulkSet" data-v="1">' + L('Tick', '勾选') + '</button><button type="button" class="btn sm" data-act="bulkSet" data-v="0">' + L('Untick', '取消勾选') + '</button>';
  return '<input class="in" id="bulkVal" type="' + (f.type === 'date' ? 'date' : f.type === 'number' || f.type === 'percent' ? 'number' : 'text') + '" style="width:160px"><button type="button" class="btn sm pri" data-act="bulkApply">' + L('Apply', '应用') + '</button>';
}
function viewCards(reg, list){
  list = sortRecs(reg, list); var ro = rolesOf(reg), ed = canWrite(reg);
  return '<div class="cards">' + list.map(function(r){ return recCard(reg, r); }).join('') + (!list.length ? '<div class="card empty">' + L('No items', '没有记录') + '</div>' : '') + '</div>' + (ed ? '<input class="in" id="qadd" data-fk="qadd:' + esc(reg.id) + '" placeholder="' + esc(T('+ Type a title and press Enter', '+ 输入标题后按 Enter')) + '" style="margin-top:10px;width:100%">' : '');
}
function recCard(reg, r, drag){
  var p = planOf(reg, r), od = isOverdue(reg, r), pr = progressOf(reg, r), bf = rf(reg, 'block');
  var img = null; dataFields(reg).forEach(function(f){ if(!img && f.type === 'files') img = asArr(r.d[f.key]).filter(function(x){ return /^image\//.test(x.type || ''); })[0]; });
  var u = img && STORE.fileUrl(img.path);
  var who = dataFields(reg).filter(function(f){ return f.list === 'people' && f.key !== 'attendees'; })[0];
  return '<button type="button" class="rc card' + (od ? ' od' : '') + (r.d.star ? ' star' : '') + '" data-act="openRec" data-id="' + esc(r.id) + '"' + (drag ? ' draggable="true" data-drag="' + esc(r.id) + '"' : '') + '>' + (u ? '<img src="' + esc(u) + '" alt="" loading="lazy">' : '') +
    '<span class="rc1"><span class="mono muted">' + esc(recNo(reg, r)) + '</span>' + (statusOpt(reg, r) && !drag ? optChip(statusOpt(reg, r)) : '') + (r.d.star ? '<span class="kst">★</span>' : '') + '</span>' +
    '<span class="rct">' + esc(recTitle(reg, r) || '—') + '</span>' + (recTitle2(reg, r) ? '<span class="rct2">' + esc(recTitle2(reg, r)) + '</span>' : '') +
    '<span class="rc2">' + (bf ? blockChips(r.d[bf.key], bf) : '') + (p ? '<span class="mono' + (od ? ' od' : '') + '">' + esc(md(n2d(p.f))) + (od ? ' !' : '') + '</span>' : '') + (who && !isEmpty(r.d[who.key]) ? '<span class="muted ppl">' + esc(textOf(reg, who, r)) + '</span>' : '') + '</span>' +
    (pr != null && rf(reg, 'progress') ? pbar(pr) : '') + '</button>';
}

/* ---------------- board ---------------- */
function viewBoard(reg, list){
  var bf = boardField(reg), ed = canWrite(reg);
  list = sortRecs(reg, list);
  var h = '<div class="tbar"><label class="fl row">' + L('Columns by', '分栏依据') + '<select class="in" id="rboard">' + dataFields(reg).filter(function(f){ return f.type === 'select' && !f.multi; }).map(function(f){ return '<option value="' + esc(f.key) + '"' + (f.key === bf.key ? ' selected' : '') + '>' + esc(T1(f.en, f.zh)) + '</option>'; }).join('') + '</select></label>' + (ed ? '<span class="note">' + L('Drag cards between columns to change ', '拖动卡片到其他栏即可修改') + esc(T1(bf.en, bf.zh)) + '</span>' : '') + '</div>';
  var cols = optsOf(bf).map(function(o){ return {v:o.v, o:o, items:list.filter(function(r){ return r.d[bf.key] === o.v; })}; });
  var none = list.filter(function(r){ return !optOf(bf, r.d[bf.key]); });
  if(none.length) cols.unshift({v:'', o:null, items:none});
  return h + '<div class="board">' + cols.map(function(c){
    return '<section class="bcol" data-drop="' + esc(c.v) + '" data-k="' + esc(bf.key) + '"><div class="bch">' + (c.o ? '<span class="sw c-' + esc(c.o.color) + '"></span><b>' + esc(nm(c.o)) + '</b>' : '<b class="muted">' + L('(empty)', '（空）') + '</b>') + '<span class="mono muted">' + c.items.length + '</span>' + (ed && c.o ? '<button type="button" class="ib" data-act="boardAdd" data-v="' + esc(c.v) + '" title="' + esc(T('Add', '新增')) + '">' + uic('plus', 14) + '</button>' : '') + '</div><div class="bcl">' + (function(){ var mk0 = reg.id + ':' + c.v, lim = (S.bmore || {})[mk0] ? 1e9 : 40; return c.items.slice(0, lim).map(function(r){ return recCard(reg, r, ed); }).join('') + (c.items.length > lim ? '<button type="button" class="btn sm bmore" data-act="bMore" data-v="' + esc(mk0) + '">' + L('Show ' + (c.items.length - lim) + ' more', '再显示 ' + (c.items.length - lim) + ' 项') + '</button>' : ''); })() + '</div></section>';
  }).join('') + '</div>';
}

/* ---------------- block matrix (PV) ---------------- */
function matrixAgg(reg, items){
  var m = matrixCfg(reg);
  if(!items.length) return null;
  if(m.val === 'count') return {v:items.length, t:String(items.length)};
  if(m.val === 'open'){ var o = items.filter(function(r){ return !isDone(reg, r); }).length; return {v:o, t:String(o), bad:o > 0}; }
  var pf = rf(reg, 'progress');
  if(pf && pf.auto){ var a = 0, b = 0, any = false; items.forEach(function(r){ var x = num(r.d[pf.auto.a]), y = num(r.d[pf.auto.b]); if(x != null && y){ a += x; b += y; any = true; } }); if(any){ var p = Math.round(a / b * 100); return {v:p, t:p + '%', sub:Math.round(a).toLocaleString() + ' / ' + Math.round(b).toLocaleString()}; } }
  var ps = items.map(function(r){ return progressOf(reg, r); }).filter(function(x){ return x != null; });
  if(!ps.length) return {v:null, t:'—'};
  var avg = Math.round(ps.reduce(function(s, x){ return s + x; }, 0) / ps.length); return {v:avg, t:avg + '%'};
}
function viewMatrix(reg, list){
  var m = matrixCfg(reg), cf = fieldOf(reg, m.col), rfd = fieldOf(reg, m.row);
  if(!cf) return '<div class="card empty">' + L('Choose a column field (e.g. Block).', '请选择列字段（如区域）。') + '</div>';
  var selF = dataFields(reg).filter(function(f){ return f.type === 'select'; }), rowF = groupable(reg);
  var h = '<div class="tbar"><label class="fl row">' + L('Rows', '行') + '<select class="in" id="mxRow">' + rowF.map(function(f){ return '<option value="' + esc(f.key) + '"' + (f.key === m.row ? ' selected' : '') + '>' + esc(T1(f.en, f.zh)) + '</option>'; }).join('') + '</select></label>' +
    '<label class="fl row">' + L('Columns', '列') + '<select class="in" id="mxCol">' + selF.map(function(f){ return '<option value="' + esc(f.key) + '"' + (f.key === m.col ? ' selected' : '') + '>' + esc(T1(f.en, f.zh)) + '</option>'; }).join('') + '</select></label>' +
    '<label class="fl row">' + L('Show', '显示') + '<select class="in" id="mxVal">' + [['progress','Progress','进度'],['count','Count','数量'],['open','Open items','未完成项']].map(function(o){ return '<option value="' + o[0] + '"' + (m.val === o[0] ? ' selected' : '') + '>' + esc(T(o[1], o[2])) + '</option>'; }).join('') + '</select></label></div>';
  var cols = optsOf(cf).map(function(o){ return {v:o.v, o:o}; });
  var groups = groupRecs(reg, list, m.row);
  var t = '<table class="mx"><thead><tr><th>' + L(rfd ? rfd.en : '', rfd ? rfd.zh : '') + '</th>' + cols.map(function(c){ return '<th><span class="ar c-' + esc(c.o.color) + '">' + esc(c.v) + '</span> ' + esc(nm(c.o)) + '</th>'; }).join('') + '<th>' + L('Total', '合计') + '</th></tr></thead><tbody>';
  groups.forEach(function(g){
    t += '<tr><th class="mr">' + (g.color ? '<span class="sw c-' + esc(g.color) + '"></span>' : '') + esc(g.label) + ' <span class="muted mono">' + g.items.length + '</span></th>' + cols.map(function(c){
      var its = g.items.filter(function(r){ return asArr(r.d[cf.key]).indexOf(c.v) >= 0; }), a = matrixAgg(reg, its);
      if(!a) return '<td class="mc mc0">·</td>';
      return '<td class="mc" style="' + (m.val === 'progress' ? heat(a.v) : a.bad ? 'background:var(--bad-soft)' : '') + '"><button type="button" class="mcb" data-act="mxCell" data-v="' + esc(JSON.stringify({g:g.k, c:c.v})) + '"><b class="mono">' + esc(a.t) + '</b>' + (a.sub ? '<span class="mono muted">' + esc(a.sub) + '</span>' : '') + '</button></td>';
    }).join('');
    var tot = matrixAgg(reg, g.items); t += '<td class="mc tot" style="' + (m.val === 'progress' && tot ? heat(tot.v) : '') + '"><b class="mono">' + esc(tot ? tot.t : '—') + '</b></td></tr>';
  });
  t += '<tr class="mtot"><th>' + L('Total', '合计') + '</th>' + cols.map(function(c){ var its = list.filter(function(r){ return asArr(r.d[cf.key]).indexOf(c.v) >= 0; }), a = matrixAgg(reg, its); return '<td class="mc" style="' + (m.val === 'progress' && a ? heat(a.v) : '') + '"><b class="mono">' + esc(a ? a.t : '—') + '</b></td>'; }).join('') + '<td class="mc"><b class="mono">' + esc((matrixAgg(reg, list) || {}).t || '—') + '</b></td></tr>';
  return h + '<div class="card tbl-wrap">' + t + '</tbody></table></div><p class="note">' + L('Progress uses quantities (done ÷ planned) when they are filled in, otherwise the average progress. Click a cell to see those items.', '有工程量时进度 = 完成量 ÷ 计划量，否则取平均完成率。点击单元格查看对应记录。') + '</p>';
}

/* ================= Schedule (several registers on one Gantt) ================= */
function viewSchedule(){
  var regs = allRegs().filter(function(r){ return rolesOf(r).start || rolesOf(r).finish; });
  var pick = S.sched || regs.map(function(r){ return r.id; });
  var h = '<div class="ph"><div><h1 class="vtitle">' + L('Schedule', '进度计划') + '</h1><span class="muted">' + L('Site works, documents, punch items and meetings on one timeline', '现场施工、资料、尾项与会议在同一时间轴') + '</span></div></div>';
  h += '<div class="card filters"><div class="fchips">' + regs.map(function(r){ return '<button type="button" class="fchip" data-act="schedReg" data-v="' + esc(r.id) + '" aria-pressed="' + (pick.indexOf(r.id) >= 0) + '">' + icon(r.d.icon, 13) + ' ' + esc(regName(r)) + '</button>'; }).join('') + '</div>' +
    '<div class="fchips">' + (lists().blocks.opts || []).map(function(o){ return '<button type="button" class="fchip" data-act="schedBlk" data-v="' + esc(o.v) + '" aria-pressed="' + ((S.schedBlk || []).indexOf(o.v) >= 0) + '">' + esc(S.lang === 'zh' ? o.zh || o.v : o.en) + '</button>'; }).join('') + '</div>' +
    '<label class="chk"><input type="checkbox" id="schOpen"' + (S.schOpen ? ' checked' : '') + '>' + L('Hide completed', '隐藏已完成') + '</label></div>';
  var groups = regs.filter(function(r){ return pick.indexOf(r.id) >= 0; }).map(function(r){ return {reg:r, items:recsOf(r.id).filter(function(x){ if(S.schOpen && isDone(r, x)) return false; if(S.schedBlk && S.schedBlk.length){ var b = blocksOf(r, x); if(b.length && !b.some(function(v){ return S.schedBlk.indexOf(v) >= 0; })) return false; } return planOf(r, x); })}; });
  return h + ganttHtml(groups, {multi:true});
}

/* ================= Gantt (shared) ================= */
var PX = {day:24, week:8, month:2.6};
function ganttHtml(sets, o){
  var g = S.gz || 'week', px = PX[g] || 8, A = asOfN(), c = cfg();
  var rows = []; sets.forEach(function(s){ s.items.forEach(function(r){ rows.push({reg:s.reg, rec:r}); }); });
  var lo = Infinity, hi = -Infinity;
  rows.forEach(function(x){ var p = planOf(x.reg, x.rec); if(p){ lo = Math.min(lo, p.s); hi = Math.max(hi, p.f); } });
  if(!isFinite(lo)){ lo = A - 14; hi = A + 60; }
  var gs = d2n(c.ganttStart), mn = gs != null ? Math.min(gs, lo - 7) : Math.min(lo, A) - 7;
  var dow = (new Date(mn * 864e5).getUTCDay() + 6) % 7; mn -= dow;
  var ge = d2n(c.ganttEnd), mx = Math.max(hi + 21, A + 21, ge != null ? ge : 0);
  var ncol = Math.ceil((mx - mn + 1) / 7); mx = mn + ncol * 7 - 1;
  var W = Math.ceil((mx - mn + 1) * px), colW = g === 'day' ? px : 7 * px;
  S.gm = {px:px, mn:mn};
  var narrow = window.innerWidth < 900, LC = narrow ? [['no','No.','编号',64],['title','Item','事项',170]] : [['no','No.','编号',70],['title','Item','事项',250],['blk','Block','区域',64],['s','Start','开始',56],['f','Finish','结束',56],['p','%','完成',44],['st','Status','状态',104]];
  var LW = LC.reduce(function(s, x){ return s + x[3]; }, 0), tpl = LC.map(function(x){ return x[3] + 'px'; }).join(' ');
  var grid = 'width:' + W + 'px;background-size:' + colW + 'px 100%';
  var h = '<div class="tbar"><div class="seg">' + [['day','Day','日'],['week','Week','周'],['month','Month','月']].map(function(z){ return '<button type="button" data-act="gzoom" data-v="' + z[0] + '" aria-pressed="' + (g === z[0]) + '">' + L(z[1], z[2]) + '</button>'; }).join('') + '</div>' +
    (o.reg ? '<label class="fl row">' + L('Group', '分组') + '<select class="in" id="ggroup"><option value="none">' + esc(T('None', '不分组')) + '</option>' + groupable(o.reg).map(function(f){ return '<option value="' + esc(f.key) + '"' + (o.group === f.key ? ' selected' : '') + '>' + esc(T1(f.en, f.zh)) + '</option>'; }).join('') + '</select></label>' : '') +
    '<label class="fl row" style="color:var(--asof)">' + L('Status date', '状态日期') + '<input class="in" type="date" id="gAsOf" value="' + esc(n2d(A)) + '"></label>' +
    '<button type="button" class="btn" data-act="gToday">' + L('Go to status date', '跳到状态日期') + '</button>' +
    '<span class="legend"><span><i class="g-b"></i>' + L('Plan', '计划') + '</span><span><i class="g-g"></i>' + L('Progress', '完成') + '</span><span><i class="g-x"></i>' + L('Delay', '延误') + '</span><span><i style="background:var(--asof);width:3px"></i>' + L('Status date', '状态日期') + '</span>' + (canTeamEdit() ? '<span class="note">' + L('Drag bars to move, drag ends to change dates', '拖动条形移动，拖两端改日期') + '</span>' : '') + '</span></div>';
  if(!rows.length) return h + '<div class="card empty">' + L('Nothing with dates to show.', '没有带日期的记录。') + '</div>';
  var ticks = '', lastM = -1;
  for(var col = 0; col < Math.ceil((mx - mn + 1) / (g === 'day' ? 1 : 7)); col++){
    var n = mn + col * (g === 'day' ? 1 : 7), dt = new Date(n * 864e5), x = (n - mn) * px;
    if(dt.getUTCMonth() !== lastM){ lastM = dt.getUTCMonth(); ticks += '<div class="tick m" style="left:' + x + 'px">' + esc(S.lang === 'zh' ? dt.getUTCFullYear() + '年' + (dt.getUTCMonth() + 1) + '月' : MON[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear()) + '</div>'; }
    if(g === 'day') ticks += '<div class="tick w" style="left:' + x + 'px;width:' + px + 'px' + ((n + 3) % 7 >= 5 ? ';color:var(--bad)' : '') + '">' + dt.getUTCDate() + '</div>';
    else if(g === 'week') ticks += '<div class="tick w" style="left:' + x + 'px;width:' + colW + 'px">' + pad(dt.getUTCDate()) + '</div>';
    else if(col % 2 === 0) ticks += '<div class="tick w" style="left:' + x + 'px">' + pad(dt.getUTCDate()) + '</div>';
  }
  var lines = '<div class="asof" style="left:' + ((A - mn) * px) + 'px"></div>' + (TODAY !== A ? '<div class="today" style="left:' + ((TODAY - mn) * px) + 'px"></div>' : '');
  var body = '<div class="grow ghead"><div class="gleft" style="width:' + LW + 'px;grid-template-columns:' + tpl + '">' + LC.map(function(x){ return '<div class="gc">' + L(x[1], x[2]) + '</div>'; }).join('') + '</div><div class="gt" style="' + grid + ';height:40px">' + ticks + lines + '</div></div>';
  function grpRow(key, label, items, reg, color, set){
    var smn = Infinity, smx = -Infinity; items.forEach(function(x){ var p = planOf(x.reg, x.rec); if(p){ smn = Math.min(smn, p.s); smx = Math.max(smx, p.f); } });
    var colp = !!S.gcol[key], dn = items.filter(function(x){ return isDone(x.reg, x.rec); }).length;
    body += '<div class="grow ggrp"><div class="gleft" style="width:' + LW + 'px"><div class="gspan"><button type="button" class="glb" data-act="gcol" data-v="' + esc(key) + '">' + (colp ? '▸ ' : '▾ ') + (color ? '<span class="sw c-' + esc(color) + '"></span>' : '') + '<b>' + label + '</b> <span class="muted mono">' + dn + '/' + items.length + '</span></button>' + (reg && set && canWrite(reg) ? '<button type="button" class="btn sm" data-act="grpAdd" data-reg="' + esc(reg.id) + '" data-v="' + esc(JSON.stringify(set)) + '">+</button>' : '') + '</div></div><div class="gt" style="' + grid + '">' + lines + (isFinite(smn) ? '<div class="sum" style="left:' + ((smn - mn) * px) + 'px;width:' + Math.max(px, (smx - smn + 1) * px) + 'px"></div>' : '') + '</div></div>';
    return colp;
  }
  function sortByStart(items){ return items.sort(function(a, b){ var pa = planOf(a.reg, a.rec), pb = planOf(b.reg, b.rec); return (pa ? pa.s : 1e9) - (pb ? pb.s : 1e9); }); }
  if(o.multi){
    sets.forEach(function(s){ var its = sortByStart(s.items.map(function(r){ return {reg:s.reg, rec:r}; })); if(!its.length) return;
      if(grpRow('sched:' + s.reg.id, icon(s.reg.d.icon, 13) + ' ' + esc(regName(s.reg)), its, s.reg, s.reg.d.color)) return;
      its.forEach(function(x){ body += lzRow(function(){ return ganttRow(x.reg, x.rec, mn, px, grid, lines, LC, LW, tpl, A); }, 'div'); }); });
  } else {
    var reg = o.reg, its = sortByStart(rows);
    if(o.group && o.group !== 'none'){ groupRecs(reg, its.map(function(x){ return x.rec; }), o.group).forEach(function(gr){ var gi = gr.items.map(function(r){ return {reg:reg, rec:r}; }); if(grpRow(reg.id + ':' + gr.k, esc(gr.label), gi, reg, gr.color, gr.set)) return; gi.forEach(function(x){ body += lzRow(function(){ return ganttRow(reg, x.rec, mn, px, grid, lines, LC, LW, tpl, A); }, 'div'); }); }); }
    else its.forEach(function(x){ body += lzRow(function(){ return ganttRow(reg, x.rec, mn, px, grid, lines, LC, LW, tpl, A); }, 'div'); });
    if(canWrite(reg)) body += '<div class="grow"><div class="gleft" style="width:' + LW + 'px"><div class="gspan"><input class="in" id="qadd" data-fk="qadd:' + esc(reg.id) + '" data-gantt="1" placeholder="' + esc(T('+ Type a new item and press Enter', '+ 输入新事项后按 Enter')) + '" style="flex:1;min-width:0"></div></div><div class="gt" style="' + grid + '">' + lines + '</div></div>';
  }
  var gkey = 'g:' + (o.multi ? 'sched' : o.reg.id), grows = vwSplit(body, 'div'), ghead = grows.shift() || '';
  return h + '<div class="card gwrap" id="gwrap"' + (grows.length > VW_MIN ? ' data-vw="' + esc(gkey) + '"' : '') + '><div class="gin">' + ghead + '<div class="gbody" data-vwb="' + esc(gkey) + '">' + vwHtml(gkey, grows, 'div') + '</div></div></div>';
}
function ganttRow(reg, rec, mn, px, grid, lines, LC, LW, tpl, A){
  var p = planOf(reg, rec), ed = canWrite(reg), od = isOverdue(reg, rec), pr = progressOf(reg, rec), fb = openFb(rec.id) > 0, st = statusOpt(reg, rec), ro = rolesOf(reg);
  var left = LC.map(function(c){
    var k = c[0];
    if(k === 'no') return '<div class="gc"><button type="button" class="glb mono" data-act="openRec" data-id="' + esc(rec.id) + '">' + esc(recNo(reg, rec) || '—') + '</button>' + (fb ? '<span class="rdot"></span>' : '') + '</div>';
    if(k === 'title') return '<div class="gc t' + (rec.d.star ? ' key' : '') + '" data-act="openRec" data-id="' + esc(rec.id) + '"' + (rec.d.parent ? ' style="padding-left:' + (6 + depthOf(rec) * 16) + 'px"' : '') + '>' + (rec.d.parent ? '<span class="cx0">└</span>' : '') + '<span style="min-width:0"><span class="tt">' + esc(recTitle(reg, rec) || '—') + '</span>' + (recTitle2(reg, rec) ? '<span class="ts">' + esc(recTitle2(reg, rec)) + '</span>' : '') + '</span></div>';
    if(k === 'blk'){ var bf = rf(reg, 'block'); return '<div class="gc">' + (bf ? blockChips(rec.d[bf.key], bf) : '') + '</div>'; }
    if(k === 's' || k === 'f'){ var dk = k === 's' ? ro.start : ro.finish, dv = p ? md(n2d(k === 's' ? p.s : p.f)) : '';
      if(ed && dk && S.edit && S.edit.id === rec.id && S.edit.k === dk) return '<div class="gc"><input class="gdi mono" type="date" data-ie="1" data-fk="ie" value="' + esc(rec.d[dk] || '') + '"></div>';
      return '<div class="gc mono' + (k === 'f' && od ? ' od' : '') + (ed && dk ? ' gce' : '') + '"' + (ed && dk ? ' data-gce="' + esc(rec.id) + '" data-k="' + esc(dk) + '" title="' + esc(T('Click to change', '点击修改')) + '"' : '') + '>' + esc(dv || '—') + '</div>'; }
    if(k === 'p') return '<div class="gc mono">' + (pr != null ? pr + '%' : '') + '</div>';
    if(k === 'st') return '<div class="gc">' + (st ? chip(st.color, esc(S.lang === 'zh' ? st.zh || st.en : st.en)) : '') + '</div>';
    return '<div class="gc"></div>';
  }).join('');
  var tr = lines;
  var bo = baseOf(reg, rec); if(bo){ var bs = bo.s, bfn = bo.f; tr += '<div class="bsl" style="left:' + ((bs - mn) * px) + 'px;width:' + Math.max(3, (bfn - bs + 1) * px) + 'px"></div>'; }
  var ao = actOf(reg, rec), as = ao ? ao.s : null, ae = ao ? ao.f : null;
  if(as != null){ if(ae == null) ae = isDone(reg, rec) ? as : A; tr += '<div class="act" style="left:' + ((as - mn) * px) + 'px;width:' + Math.max(3, (ae - as + 1) * px) + 'px"></div>'; }
  if(!p) tr += '<span class="bl" style="left:8px">' + L('No dates', '未设日期') + '</span>';
  else {
    var tip = esc(recLabel(rec) + ' · ' + n2d(p.s) + ' → ' + n2d(p.f) + (pr != null ? ' · ' + pr + '%' : '') + (st ? ' · ' + nm(st) : ''));
    if(isMilestone(reg, rec) || p.s === p.f && !ro.progress){
      tr += '<div class="msw" data-id="' + esc(rec.id) + '" style="left:' + ((p.f - mn) * px + px / 2 - 8) + 'px" title="' + tip + '"><i class="ms' + (isDone(reg, rec) ? ' done' : od ? ' od' : '') + '"></i></div>';
    } else {
      var l = (p.s - mn) * px, w = Math.max(px, (p.f - p.s + 1) * px), dur = p.f - p.s + 1, done = isDone(reg, rec) ? 100 : (pr || 0);
      var gN = Math.round(dur * done / 100), dl = isDone(reg, rec) ? 0 : clamp(Math.min(A, p.f) - (p.s + gN) + 1, 0, dur - gN);
      var inner = '<span class="seg-g" style="width:' + (gN / dur * 100) + '%"></span><span class="seg-x" style="width:' + (dl / dur * 100) + '%"></span><span class="seg-b"></span>';
      tr += '<div class="bw' + (fb ? ' cm' : '') + (rec.d.star ? ' key' : '') + '" data-id="' + esc(rec.id) + '" data-act="openRec" style="left:' + l + 'px;width:' + w + 'px" title="' + tip + '">' + inner + (ed ? '<span class="hd l" data-h="l"></span><span class="hd r" data-h="r"></span>' : '') + '</div>' + (pr != null ? '<span class="bl" style="left:' + (l + w + 5) + 'px">' + pr + '%</span>' : '');
    }
  }
  return '<div class="grow' + (od ? ' odr' : '') + '"><div class="gleft" style="width:' + LW + 'px;grid-template-columns:' + tpl + '">' + left + '</div><div class="gt" style="' + grid + '">' + tr + '</div></div>';
}
function afterGantt(prev){
  var w = $('#gwrap'); if(!w || !S.gm) return;
  if(prev){ w.scrollLeft = prev[0]; w.scrollTop = prev[1]; return; }
  var x = (asOfN() - S.gm.mn) * S.gm.px - 300; w.scrollLeft = Math.max(0, x); S.gKeep = true;
}
