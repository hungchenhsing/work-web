/* work-web v2 · views: change log, files, owner plan & portal, settings, field manager and other dialogs. */
'use strict';

/* ================= Change log ================= */
function viewActivity(){
  var a = S.act, regs = allRegs();
  if(!a.rows || a.key !== JSON.stringify([a.reg, a.type])){
    a.key = JSON.stringify([a.reg, a.type]); a.rows = null; a.more = true;
    STORE.loadAudit({reg:a.reg || undefined, action:a.type || undefined, limit:150}).then(function(rows){ a.rows = rows; a.more = rows.length >= 150; renderMain(); }).catch(function(e){ toast(errText(e)); a.rows = []; renderMain(); });
  }
  var rows = a.rows || [];
  var live = ((STORE && STORE.audit) || []).filter(function(x){ return (!a.reg || x.register_id === a.reg) && (!a.type || x.action === a.type) && !rows.some(function(y){ return y.id === x.id; }) && (!rows.length || x.id > rows[0].id); });
  rows = live.concat(rows);
  var people = {}; rows.forEach(function(x){ if(x.actor_name) people[x.actor_name] = 1; });
  if(a.who) rows = rows.filter(function(x){ return x.actor_name === a.who; });
  window.__AUD = window.__AUD || {}; rows.forEach(function(x){ window.__AUD[x.id] = x; });
  var h = '<div class="ph"><div><h1 class="vtitle">' + L('Change log', '修改记录') + '</h1><span class="muted">' + L('Recorded automatically by the database for every add, change and delete. You can undo any entry you are allowed to edit.', '数据库自动记录每一次新增、修改与删除；有编辑权限的条目可以一键撤销。') + '</span></div></div>';
  h += '<div class="card filters"><select class="in" id="actReg"><option value="">' + esc(T('All registers', '全部台账')) + '</option>' + regs.map(function(r){ return '<option value="' + esc(r.id) + '"' + (a.reg === r.id ? ' selected' : '') + '>' + esc(regName(r)) + '</option>'; }).join('') + '</select>' +
    '<select class="in" id="actType"><option value="">' + esc(T('All kinds of change', '全部类型')) + '</option>' + [['insert','Added','新增'],['update','Changed','修改'],['delete','Deleted','删除'],['reg_update','Register setup','台账设置'],['reg_delete','Register deleted','台账删除']].map(function(o){ return '<option value="' + o[0] + '"' + (a.type === o[0] ? ' selected' : '') + '>' + esc(T(o[1], o[2])) + '</option>'; }).join('') + '</select>' +
    '<select class="in" id="actWho"><option value="">' + esc(T('Everyone', '所有人')) + '</option>' + Object.keys(people).sort().map(function(p){ return '<option' + (a.who === p ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select></div>';
  if(!a.rows) return h + '<div class="card empty">' + L('Loading…', '加载中…') + '</div>';
  var day = '';
  h += '<div class="card sec">' + (rows.length ? rows.map(function(x){ var d = fmtTime(x.at).slice(0, 10), hd = d !== day ? '<div class="aday">' + esc(d) + '</div>' : ''; day = d; return hd + auditRowHtml(x, {showReg:true, showRec:true}); }).join('') : '<div class="note">' + L('Nothing recorded yet.', '还没有记录。') + '</div>') +
    (a.more && rows.length ? '<button type="button" class="btn" data-act="actMore">' + L('Load older', '加载更早的记录') + '</button>' : '') + '</div>';
  return h;
}

/* ================= Files & photos ================= */
function viewFiles(){
  var fq = S.files, all = [];
  allRegs().forEach(function(reg){ if(fq.reg && fq.reg !== reg.id) return; var ffs = dataFields(reg).filter(function(f){ return f.type === 'files'; });
    recsOf(reg.id).forEach(function(r){ ffs.forEach(function(f){ asArr(r.d[f.key]).forEach(function(x){ all.push({reg:reg, rec:r, f:f, x:x}); }); }); }); });
  if(fq.kind === 'img') all = all.filter(function(e){ return /^image\//.test(e.x.type || ''); });
  if(fq.kind === 'doc') all = all.filter(function(e){ return !/^image\//.test(e.x.type || ''); });
  if(fq.blk) all = all.filter(function(e){ return blocksOf(e.reg, e.rec).indexOf(fq.blk) >= 0; });
  if(fq.q){ var q = fq.q.toLowerCase(); all = all.filter(function(e){ return (e.x.name + ' ' + recLabel(e.rec)).toLowerCase().indexOf(q) >= 0; }); }
  var h = '<div class="ph"><div><h1 class="vtitle">' + L('Files & photos', '文件与照片') + '</h1><span class="muted">' + L(all.length + ' files · they belong to records; add them from a record', all.length + ' 个文件 · 文件挂在记录上，请在记录里添加') + '</span></div></div>';
  h += '<div class="card filters"><label class="search">' + uic('search', 15) + '<input id="fileq" type="search" data-fk="fileq" placeholder="' + esc(T('File or record name', '文件或记录名称')) + '" value="' + esc(fq.q || '') + '"></label>' +
    '<select class="in" id="fileReg"><option value="">' + esc(T('All registers', '全部台账')) + '</option>' + allRegs().map(function(r){ return '<option value="' + esc(r.id) + '"' + (fq.reg === r.id ? ' selected' : '') + '>' + esc(regName(r)) + '</option>'; }).join('') + '</select>' +
    '<div class="seg">' + [['','All','全部'],['img','Photos','照片'],['doc','Documents','文档']].map(function(o){ return '<button type="button" data-act="fileKind" data-v="' + o[0] + '" aria-pressed="' + ((fq.kind || '') === o[0]) + '">' + L(o[1], o[2]) + '</button>'; }).join('') + '</div>' +
    '<div class="fchips">' + lists().blocks.opts.map(function(o){ return '<button type="button" class="fchip" data-act="fileBlk" data-v="' + esc(o.v) + '" aria-pressed="' + (fq.blk === o.v) + '">' + esc(o.v) + '</button>'; }).join('') + '</div></div>';
  if(!all.length) return h + '<div class="card empty">' + L('No files yet. Open a record and use “Add files” or “Take photo”.', '还没有文件。打开记录后点「添加文件」或「拍照」。') + '</div>';
  return h + '<div class="fgrid">' + all.slice(0, 400).map(function(e){ var u = STORE.fileUrl(e.x.path), img = /^image\//.test(e.x.type || '');
    return '<div class="fcard card">' + (img ? '<a href="' + esc(u || '#') + '" target="_blank" rel="noopener" class="fimg">' + (u ? '<img src="' + esc(u) + '" alt="' + esc(e.x.name) + '" loading="lazy">' : '') + '</a>' : '<a href="' + esc(u || '#') + '" target="_blank" rel="noopener" class="fimg doc">' + uic('file', 30) + '<span>' + esc((e.x.name.split('.').pop() || '').toUpperCase()) + '</span></a>') +
      '<div class="fcap"><div class="fname" title="' + esc(e.x.name) + '">' + esc(e.x.name) + '</div><button type="button" class="lnk" data-act="openRec" data-id="' + esc(e.rec.id) + '" data-tab="files">' + icon(e.reg.d.icon, 12) + ' ' + esc(recLabel(e.rec)) + '</button><span class="note">' + esc(T1(e.f.en, e.f.zh)) + '</span></div></div>'; }).join('') + '</div>';
}

/* ================= Owner plan (internal) ================= */
function ownerRegs(){ return allRegs().filter(function(r){ return r.d.ownerPublish && !isPrivate(r); }); }
function ownerSnapshot(reg){
  var fields = dataFields(reg).filter(function(f){ return f.ext && ['files','sub','link'].indexOf(f.type) < 0; });
  var list = sortRecs(reg, recsOf(reg.id).filter(function(r){ return r.d.ext && matchRec(reg, r); }));
  var tf = rf(reg, 'tree'), groups = tf ? groupRecs(reg, list, tf.key) : [{k:'all', label:'', items:list}];
  return {reg:{id:reg.id, en:reg.d.en, zh:reg.d.zh}, fields:fields.map(function(f){ return {key:f.key, en:f.en, zh:f.zh, type:f.type}; }),
    groups:groups.map(function(g){ return {label:g.label, rows:g.items.map(function(r){ return {ref:{id:r.id, no:recNo(reg, r)}, cells:fields.map(function(f){ return f.type === 'select' ? asArr(r.d[f.key]).map(function(v){ var o = optOf(f, v); return o ? {en:o.en, zh:o.zh || ''} : {en:v, zh:''}; }).reduce(function(a, b){ return {en:a.en ? a.en + ', ' + b.en : b.en, zh:a.zh ? a.zh + '、' + b.zh : b.zh}; }, {en:'', zh:''}) : f.type === 'tree' ? (function(){ var n = treeNode(f, r.d[f.key]); return n ? {en:(n.code ? n.code + ' ' : '') + n.en, zh:n.zh || ''} : {en:'', zh:''}; })() : {en:textOf(reg, f, r), zh:''}; })}; })}; }), count:list.length};
}
function ownerTable(snap, opts){
  opts = opts || {};
  snap = {fields:(snap.fields || []).map(function(f){ return typeof f === 'string' ? {key:f, en:f, zh:'', type:''} : f; }), groups:(snap.groups || []).map(function(g){ return {label: g.label != null ? g.label : ((g.code ? g.code + ' ' : '') + T1(g.en, g.zh)), rows:(g.rows || []).map(function(r){ return {ref:{id:r.ref.id, no:r.ref.no || r.ref.regNo || ''}, cells:r.cells}; })}; })};
  var mono = {date:1, number:1, percent:1};
  return snap.groups.map(function(g){
    return '<section class="osec">' + (g.label ? '<h3>' + esc(g.label) + ' <span class="muted mono">' + g.rows.length + '</span></h3>' : '') + '<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>No.</th>' + snap.fields.map(function(f){ return '<th>' + L(f.en, f.zh) + '</th>'; }).join('') + (opts.fb ? '<th></th>' : '') + '</tr></thead><tbody>' +
      g.rows.map(function(r){ var n = opts.fbCount ? opts.fbCount(r.ref.id) : 0; return '<tr><td class="mono">' + esc(r.ref.no) + '</td>' + r.cells.map(function(c, i){ return '<td class="' + (mono[snap.fields[i].type] ? 'mono' : '') + '">' + (S.lang === 'zh' ? esc(c.zh || c.en) : esc(c.en) + (S.lang === 'both' && c.zh && c.zh !== c.en ? '<span class="zh2">' + esc(c.zh) + '</span>' : '')) + '</td>'; }).join('') + (opts.fb ? '<td><button type="button" class="btn sm" data-act="fbOpen" data-v="' + esc(r.ref.id) + '" data-no="' + esc(r.ref.no) + '">' + L('Comment', '意见') + (n ? ' (' + n + ')' : '') + '</button></td>' : '') + '</tr>' +
        (opts.fb && S.fbFor === r.ref.id ? '<tr><td colspan="' + (snap.fields.length + 2) + '"><div class="row"><textarea class="in" id="fbBody" rows="2" style="flex:1" placeholder="' + esc(T('Your comment on ', '对此项的意见：') + r.ref.no) + '"></textarea><button type="button" class="btn pri" data-act="fbSend" data-v="' + esc(r.ref.id) + '" data-no="' + esc(r.ref.no) + '">' + L('Send', '提交') + '</button></div></td></tr>' : ''); }).join('') + '</tbody></table></div></section>';
  }).join('');
}
function viewOwner(){
  var regs = ownerRegs(), ed = canTeamEdit();
  var h = '<div class="ph"><div><h1 class="vtitle">' + L('Owner plan', '业主计划') + '</h1><span class="muted">' + L('Publish a fixed snapshot of selected records and fields. The Owner role sees only what you publish and can comment on each row.', '发布选定记录与字段的固定快照。业主角色只能看到发布内容，并可逐行留言。') + '</span></div></div>';
  h += '<div class="seg" style="margin-bottom:10px">' + [['live','Preview & publish','预览与发布'],['snaps','Published','已发布'],['fb','Owner comments','业主意见']].map(function(t){ return '<button type="button" data-act="otab" data-v="' + t[0] + '" aria-pressed="' + (S.otab === t[0]) + '">' + L(t[1], t[2]) + '</button>'; }).join('') + '</div>';
  if(S.otab === 'snaps'){
    var pubs = (STORE.pubs || []);
    return h + (pubs.length ? '<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>No.</th><th>' + L('Register', '台账') + '</th><th>' + L('Published', '发布时间') + '</th><th>' + L('By', '发布人') + '</th><th>' + L('Note', '说明') + '</th><th>' + L('Items', '数量') + '</th><th></th></tr></thead><tbody>' + pubs.map(function(p){ return '<tr><td class="mono">' + esc(p.no) + '</td><td>' + (p.kind === 'deck' ? chip('violet', uic('present', 11) + ' ' + L('Presentation', '演示文稿')) + ' ' + esc(T1(p.title.en, p.title.zh)) : esc(p.reg ? T1(p.reg.en, p.reg.zh) : '')) + '</td><td class="mono">' + esc(fmtTime(p.at)) + '</td><td>' + esc(p.by || '') + '</td><td>' + esc(p.note || '') + '</td><td class="mono">' + (p.count || 0) + '</td><td>' + (ed ? '<button type="button" class="btn sm danger-o" data-act="pubDel" data-v="' + esc(p.id) + '">' + L('Withdraw', '撤回') + '</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="card empty">' + L('Nothing published yet.', '尚未发布。') + '</div>');
  }
  if(S.otab === 'fb'){
    var fbs = (STORE.fb || []).slice().reverse();
    return h + (fbs.length ? fbs.map(function(x){ var r = getRec(x.item_id); return '<div class="card fb' + (x.status === 'open' ? ' open' : '') + '"><div class="ahead"><b>' + esc(x.author_name || '') + '</b> · <span class="mono">' + esc(x.reg_no || '') + '</span> ' + (r ? '<button type="button" class="lnk" data-act="openRec" data-id="' + esc(r.id) + '">' + esc(recLabel(r)) + '</button>' : '') + ' <span class="muted">' + esc(fmtTime(x.created_at)) + '</span> ' + chip(x.status === 'open' ? 'red' : 'green', x.status === 'open' ? L('Open', '待处理') : L('Resolved', '已关闭')) + '</div><div style="white-space:pre-wrap">' + esc(x.body) + '</div>' + (x.reply ? '<div class="note">↳ ' + esc(x.reply) + '</div>' : '') + (ed && x.status === 'open' ? '<div class="row"><input class="in" id="rp_' + esc(x.id) + '" placeholder="' + esc(T('Reply (optional)', '回复（可选）')) + '"><button type="button" class="btn sm" data-act="fbResolve" data-v="' + esc(x.id) + '">' + L('Reply & resolve', '回复并关闭') + '</button></div>' : '') + '</div>'; }).join('') : '<div class="card empty">' + L('No comments yet.', '还没有意见。') + '</div>');
  }
  if(!regs.length) return h + '<div class="card empty">' + L('No register is set to publish to the Owner. Turn it on in Register settings.', '还没有台账允许发布给业主。请在「台账设置」中打开。') + '</div>';
  var reg = getReg(S.oreg) && regs.indexOf(getReg(S.oreg)) >= 0 ? getReg(S.oreg) : regs[0]; S.oreg = reg.id;
  var snap = ownerSnapshot(reg);
  h += '<div class="card filters"><label class="fl row">' + L('Register', '台账') + '<select class="in" id="oreg">' + regs.map(function(r){ return '<option value="' + esc(r.id) + '"' + (r.id === reg.id ? ' selected' : '') + '>' + esc(regName(r)) + '</option>'; }).join('') + '</select></label><span class="note">' + L('Rows: records marked “Show in Owner plan” (and the register’s current filters). Columns: fields ticked “Owner can see” in Fields & columns.', '行：标记「显示于业主计划」的记录（并按该台账当前筛选）。列：在「字段与列」中勾选「业主可见」的字段。') + '</span>' + (canSchemaEdit(reg) ? '<button type="button" class="btn sm" data-act="fieldsOpen" data-v="' + esc(reg.id) + '">' + L('Choose fields', '选择字段') + '</button>' : '') + '</div>';
  if(ed) h += '<div class="card row" style="padding:10px 12px"><input class="in" id="snapNote" placeholder="' + esc(T('Publication note, e.g. Plan for 16–31 Oct', '发布说明，例如 10月16–31日计划')) + '" style="flex:1"><button type="button" class="btn pri" data-act="publish"' + (snap.count ? '' : ' disabled') + '>' + L('Publish to Owner', '发布给业主') + ' (' + snap.count + ')</button></div>';
  return h + (snap.count ? ownerTable(snap) : '<div class="card empty">' + L('No records are marked “Show in Owner plan”.', '没有标记「显示于业主计划」的记录。') + '</div>');
}
function viewOwnerPortal(){
  var pubs = STORE.pubs || [];
  if(!pubs.length) return '<div class="card empty">' + L('Nothing has been published yet.', '尚未发布内容。') + '</div>';
  var p = pubs.filter(function(x){ return x.id === S.pubSel; })[0] || pubs[0];
  if(p._light){ STORE.pubFull(p.id).catch(function(e){ toast(errText(e)); }); return '<div class="card empty">' + L('Loading ' + esc(p.no) + '…', '正在加载 ' + esc(p.no) + '…') + '</div>'; }
  if(p.kind === 'deck') return ownerDeckView(p, pubs);
  var fbc = function(id){ return (STORE.fb || []).filter(function(f){ return f.item_id === id; }).length; };
  return '<div class="ph"><div><h1 class="vtitle">' + esc(p.reg ? T1(p.reg.en, p.reg.zh) : T('Submission plan', '提交计划')) + '</h1><span class="muted">' + esc(p.no + ' · ' + fmtTime(p.at) + (p.note ? ' · ' + p.note : '')) + '</span></div><select class="in" id="pubSel">' + pubs.map(function(x){ return '<option value="' + esc(x.id) + '"' + (x.id === p.id ? ' selected' : '') + '>' + esc(x.no + ' · ' + fmtTime(x.at).slice(0, 10) + (x.kind === 'deck' ? ' · ' + T1(x.title.en, x.title.zh) : x.reg ? ' · ' + T1(x.reg.en, x.reg.zh) : '')) + '</option>'; }).join('') + '</select></div>' + ownerTable(p, {fb:true, fbCount:fbc});
}

/* ================= Settings ================= */
function viewSettings(){
  var tabs = [['project','Project','项目'],['registers','Registers','台账'],['lists','Shared lists','共享列表']];
  if(role() === 'admin') tabs.push(['users','Users & access','用户与权限']);
  tabs.push(['data','Data & backup','数据与备份']);
  if(!tabs.some(function(t){ return t[0] === S.stab; })) S.stab = 'project';
  var h = '<div class="ph"><div><h1 class="vtitle">' + L('Settings', '设置') + '</h1><span class="muted">' + L('Everything here is editable on the site — registers, fields, option lists, users.', '这里的一切都可以在网站上修改：台账、字段、选项列表、用户。') + '</span></div></div><div class="seg" style="margin-bottom:12px;flex-wrap:wrap">' + tabs.map(function(t){ return '<button type="button" data-act="stab" data-v="' + t[0] + '" aria-pressed="' + (S.stab === t[0]) + '">' + L(t[1], t[2]) + '</button>'; }).join('') + '</div>';
  if(S.stab === 'registers') return h + setRegisters();
  if(S.stab === 'lists') return h + setLists();
  if(S.stab === 'users') return h + setUsers();
  if(S.stab === 'data') return h + setData();
  return h + setProject();
}
function setProject(){
  var c = cfg(), ed = canTeamEdit(), dis = ed ? '' : ' disabled';
  return '<div class="card sec"><div class="fg" style="max-width:720px">' +
    '<label class="fl">' + L('Project name (EN)', '项目名称（英文）') + '<input class="in" data-cfg="projectEn" value="' + esc(c.projectEn) + '"' + dis + '></label>' +
    '<label class="fl">' + L('Project name (中)', '项目名称（中文）') + '<input class="in" data-cfg="projectZh" value="' + esc(c.projectZh) + '"' + dis + '></label>' +
    '<label class="fl">' + L('Status date (blank = today)', '状态日期（留空 = 今天）') + '<input class="in" type="date" data-cfg="asOf" value="' + esc(c.asOf || '') + '"' + dis + '></label><span></span>' +
    '<label class="fl">' + L('Gantt timeline start (blank = automatic)', '甘特时间轴起始（留空 = 自动）') + '<input class="in" type="date" data-cfg="ganttStart" value="' + esc(c.ganttStart || '') + '"' + dis + '></label>' +
    '<label class="fl">' + L('Gantt timeline end (at least)', '甘特时间轴结束（至少到）') + '<input class="in" type="date" data-cfg="ganttEnd" value="' + esc(c.ganttEnd || '') + '"' + dis + '></label></div><p class="note">' + L('Changes save when you leave the field.', '离开输入框即自动保存。') + '</p></div>';
}
function setRegisters(){
  var regs = allRegs();
  return '<div class="card sec"><div class="sech"><h2>' + L('Registers', '台账') + '</h2>' + (canCreateReg() ? '<button type="button" class="btn pri" data-act="newReg">' + uic('plus', 14) + ' ' + L('New register', '新建台账') + '</button>' : '') + '</div>' +
    '<table class="tbl"><thead><tr><th></th><th>' + L('Name', '名称') + '</th><th>' + L('Visible to', '可见范围') + '</th><th>' + L('Section', '分组') + '</th><th>' + L('Fields', '字段') + '</th><th>' + L('Items', '记录') + '</th><th></th></tr></thead><tbody>' + regs.map(function(r, i){
      var sec = SECS.filter(function(s){ return s[0] === (r.d.sec || 'other'); })[0] || SECS[3];
      return '<tr><td><span class="ri c-' + esc(r.d.color || 'blue') + '">' + icon(r.d.icon) + '</span></td><td><b>' + esc(r.d.en) + '</b><span class="zh2">' + esc(r.d.zh || '') + '</span></td><td>' + (isPrivate(r) ? chip('amber', uic('lock', 11) + ' ' + L('Only me', '仅自己')) : chip('blue', L('Team', '团队'))) + '</td><td>' + L(sec[1], sec[2]) + '</td><td class="mono">' + dataFields(r).length + '</td><td class="mono">' + recsOf(r.id).length + '</td><td class="row nowrap">' +
        (canTeamEdit() ? '<button type="button" class="ib" data-act="regMove" data-v="' + esc(r.id) + '" data-d="-1"' + (i ? '' : ' disabled') + ' title="' + esc(T('Move up', '上移')) + '">' + uic('up', 14) + '</button><button type="button" class="ib" data-act="regMove" data-v="' + esc(r.id) + '" data-d="1"' + (i < regs.length - 1 ? '' : ' disabled') + ' title="' + esc(T('Move down', '下移')) + '">' + uic('down', 14) + '</button>' : '') +
        (canSchemaEdit(r) ? '<button type="button" class="btn sm" data-act="fieldsOpen" data-v="' + esc(r.id) + '">' + L('Fields', '字段') + '</button><button type="button" class="btn sm" data-act="regSettings" data-v="' + esc(r.id) + '">' + L('Settings', '设置') + '</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}
function setLists(){
  var ls = lists(), ed = canTeamEdit(), d = S.ldraft;
  var h = '<div class="card sec"><p class="note" style="margin-top:0">' + L('Shared lists are used by many registers (Blocks, Disciplines, People…). Change a name here and it changes everywhere. You can also add options directly from any cell.', '共享列表被多个台账使用（区域、专业、人员…）。在这里改名会全站同步。也可以直接在任意单元格里新增选项。') + '</p>';
  h += Object.keys(ls).map(function(k){
    var l = ls[k], open = d && d.k === k, used = 0;
    allRegs().forEach(function(r){ dataFields(r).forEach(function(f){ if(f.list === k) used++; }); });
    return '<div class="lblock"><div class="lhead"><b>' + L(l.en, l.zh) + '</b> <span class="muted mono">' + l.opts.length + ' · ' + L('used by ' + used + ' fields', used + ' 个字段使用') + '</span>' + (ed ? (open ? '' : '<button type="button" class="btn sm" data-act="listEdit" data-v="' + esc(k) + '">' + L('Edit', '编辑') + '</button>') + (!used && !DEF_LISTS[k] ? '<button type="button" class="btn sm danger-o" data-act="listDel" data-v="' + esc(k) + '">' + L('Delete list', '删除列表') + '</button>' : '') : '') + '</div>' +
      (open ? '<div class="fg" style="max-width:520px;margin:8px 0"><label class="fl">' + L('List name (EN)', '列表名称（英文）') + '<input class="in" data-ld="en" value="' + esc(d.en) + '"></label><label class="fl">' + L('List name (中)', '列表名称（中文）') + '<input class="in" data-ld="zh" value="' + esc(d.zh) + '"></label></div>' + optEditor(d.opts, {done:false}) + '<div class="row"><button type="button" class="btn pri" data-act="listSave">' + L('Save list', '保存列表') + '</button><button type="button" class="btn" data-act="listCancel">' + L('Cancel', '取消') + '</button></div>'
        : '<div class="lchips">' + l.opts.map(function(o){ return chip(o.color, esc(o.v) + (o.en && o.en !== o.v ? ' · ' + esc(nm(o)) : (o.zh ? ' · ' + esc(o.zh) : ''))); }).join(' ') + '</div>') + '</div>';
  }).join('');
  if(ed) h += '<div class="row" style="margin-top:12px"><input class="in" id="newListName" placeholder="' + esc(T('New list name, e.g. Inverter stations', '新列表名称，例如：逆变站')) + '"><button type="button" class="btn" data-act="listNew">' + uic('plus', 13) + ' ' + L('Add list', '新增列表') + '</button></div>';
  return h + '</div>';
}
function setUsers(){
  var us = STORE.users || [];
  return '<div class="card sec"><div class="sech"><h2>' + L('Users & access', '用户与权限') + '</h2><button type="button" class="btn sm" data-act="reloadUsers">' + L('Refresh', '刷新') + '</button></div>' +
    '<p class="note">' + L('People sign up on the sign-in page, then you give them a role. Registers set to “Only me” stay private to their creator whatever the role — even admins cannot see them.', '同事在登录页自行注册，再由你分配角色。设为「仅自己可见」的台账只有创建者能看到——无论角色，管理员也看不到。') + '</p>' +
    '<table class="tbl"><thead><tr><th>' + L('Name', '姓名') + '</th><th>' + L('Email', '邮箱') + '</th><th>' + L('Role', '角色') + '</th></tr></thead><tbody>' + us.map(function(u){ var self = u.id === myId(); return '<tr><td>' + esc(u.name || '—') + (self ? ' ' + chip('blue', L('you', '你')) : '') + '</td><td>' + esc(u.email || '') + '</td><td><select class="in" data-role="' + esc(u.id) + '"' + (self ? ' disabled' : '') + '>' + [['admin','Admin · everything','管理员 · 全部'],['editor','Editor · edit team registers','编辑 · 修改团队台账'],['viewer','Viewer · read team registers','只读 · 查看团队台账'],['owner','Owner (client) · published plans only','业主 · 仅看发布内容'],['pending','Waiting · no access','待审批 · 无权限']].map(function(o){ return '<option value="' + o[0] + '"' + (u.role === o[0] ? ' selected' : '') + '>' + esc(T(o[1], o[2])) + '</option>'; }).join('') + '</select></td></tr>'; }).join('') + '</tbody></table></div>';
}
function setData(){
  return '<div class="card sec"><h2>' + L('Backup', '备份') + '</h2><p class="note">' + L('Download everything you can see (all registers, records, fields and lists) as one Excel file — one sheet per register — plus a JSON file that can rebuild the site.', '把你能看到的全部内容（台账、记录、字段、列表）下载为一个 Excel（每个台账一张表），以及可用于重建网站的 JSON 文件。') + '</p><div class="row"><button type="button" class="btn" data-act="backupXlsx">' + L('Download Excel backup', '下载 Excel 备份') + '</button><button type="button" class="btn" data-act="backupJson">' + L('Download JSON backup', '下载 JSON 备份') + '</button></div>' +
    '<h2 style="margin-top:16px">' + L('Import', '导入') + '</h2><p class="note">' + L('Import Excel into a register from that register’s ⋯ menu. You map each column to a field and see a preview before anything is written.', '在对应台账的 ⋯ 菜单中导入 Excel：先把每一列对应到字段，预览无误后才写入。') + '</p>' +
    (STORE.mode === 'demo' ? '<h2 style="margin-top:16px">' + L('Demo', '演示') + '</h2><button type="button" class="btn danger-o" data-act="resetDemo">' + L('Reset demo data', '重置演示数据') + '</button>' : '') + '</div>';
}

/* ================= option / tree editors ================= */
function optEditor(opts, o){
  o = o || {};
  return '<div class="oed"><div class="oedh"><span>' + L('Code', '代码') + '</span><span>' + L('Name (EN)', '英文名') + '</span><span>' + L('Name (中)', '中文名') + '</span><span>' + L('Colour', '颜色') + '</span>' + (o.done ? '<span title="' + esc(T('Counts as complete', '视为完成')) + '">' + L('Done', '完成') + '</span>' : '') + '<span></span></div>' + opts.map(function(x, i){
    return '<div class="oedr"><input class="in" data-od="' + i + ':v" data-fk="od:' + i + ':v" value="' + esc(x.v) + '"><input class="in" data-od="' + i + ':en" data-fk="od:' + i + ':en" value="' + esc(x.en || '') + '"><input class="in" data-od="' + i + ':zh" data-fk="od:' + i + ':zh" value="' + esc(x.zh || '') + '"><select class="in" data-od="' + i + ':color">' + COLORS.map(function(c){ return '<option value="' + c + '"' + (x.color === c ? ' selected' : '') + '>' + esc(T(COLOR_NAMES[c][0], COLOR_NAMES[c][1])) + '</option>'; }).join('') + '</select>' +
      (o.done ? '<input type="checkbox" data-od="' + i + ':done"' + (x.done ? ' checked' : '') + ' aria-label="Done">' : '') +
      '<span class="nowrap"><button type="button" class="ib" data-act="odMove" data-v="' + i + '" data-d="-1"' + (i ? '' : ' disabled') + '>' + uic('up', 13) + '</button><button type="button" class="ib" data-act="odMove" data-v="' + i + '" data-d="1"' + (i < opts.length - 1 ? '' : ' disabled') + '>' + uic('down', 13) + '</button><button type="button" class="ib" data-act="odDel" data-v="' + i + '">' + uic('x', 13) + '</button></span></div>';
  }).join('') + '<button type="button" class="btn sm" data-act="odAdd">' + uic('plus', 13) + ' ' + L('Add option', '新增选项') + '</button></div>';
}
function treeEditor(nodes){
  var order = [], byP = {};
  nodes.forEach(function(n){ (byP[n.parent || ''] = byP[n.parent || ''] || []).push(n); });
  (function w(p, d){ (byP[p] || []).forEach(function(n){ order.push({n:n, d:d}); w(n.id, d + 1); }); })('', 0);
  nodes.forEach(function(n){ if(!order.some(function(x){ return x.n === n; })) order.push({n:n, d:0}); });
  return '<div class="oed tree-ed">' + order.map(function(x){ var n = x.n, i = nodes.indexOf(n);
    return '<div class="oedr" style="padding-left:' + (x.d * 18) + 'px"><input class="in w80" data-td="' + i + ':code" data-fk="td:' + i + ':code" value="' + esc(n.code || '') + '" placeholder="P1.1"><input class="in" data-td="' + i + ':en" data-fk="td:' + i + ':en" value="' + esc(n.en || '') + '" placeholder="Name"><input class="in" data-td="' + i + ':zh" data-fk="td:' + i + ':zh" value="' + esc(n.zh || '') + '" placeholder="名称"><select class="in" data-td="' + i + ':parent"><option value="">' + esc(T('(top level)', '（顶层）')) + '</option>' + nodes.filter(function(m){ return m !== n; }).map(function(m){ return '<option value="' + esc(m.id) + '"' + (n.parent === m.id ? ' selected' : '') + '>' + esc((m.code ? m.code + ' ' : '') + (m.en || m.zh)) + '</option>'; }).join('') + '</select><span class="nowrap"><button type="button" class="ib" data-act="tdChild" data-v="' + i + '" title="' + esc(T('Add sub-level', '添加下级')) + '">' + uic('plus', 13) + '</button><button type="button" class="ib" data-act="tdDel" data-v="' + i + '">' + uic('x', 13) + '</button></span></div>'; }).join('') +
    '<button type="button" class="btn sm" data-act="tdAdd">' + uic('plus', 13) + ' ' + L('Add top-level category', '新增顶层分类') + '</button></div>';
}

/* ================= dialogs ================= */
function modalBody(m){
  if(m.kind === 'fields') return fieldManager(m);
  if(m.kind === 'opts') return optsModal(m);
  if(m.kind === 'newReg') return newRegModal(m);
  if(m.kind === 'regSettings') return regSettingsModal(m);
  if(m.kind === 'import') return importModal(m);
  if(m.kind === 'cols') return colsModal(m);
  if(DECK_MODALS[m.kind]) return DECK_MODALS[m.kind](m);
  return {title:'', html:''};
}
function optsModal(m){
  var reg = getReg(m.reg), f = fieldOf(reg, m.key);
  if(!m.d){ m.d = f.type === 'tree' ? {tree:clone(treeNodes(f))} : f.list ? {list:true} : {opts:clone(f.opts || [])}; }
  if(f.list){ S.ldraft = S.ldraft && S.ldraft.k === f.list ? S.ldraft : Object.assign({k:f.list}, clone(lists()[f.list])); return {title:L(lists()[f.list].en, lists()[f.list].zh) + ' <span class="note">' + L('shared list', '共享列表') + '</span>', html:'<p class="note">' + L('This list is shared — changes apply to every register that uses it.', '此列表为共享列表，修改会影响所有使用它的台账。') + '</p>' + optEditor(S.ldraft.opts, {}), foot:'<button type="button" class="btn pri" data-act="listSave" data-close="1">' + L('Save', '保存') + '</button><button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button>'}; }
  if(f.type === 'tree') return {title:L(f.en, f.zh), html:treeEditor(m.d.tree), foot:'<button type="button" class="btn pri" data-act="optsSave">' + L('Save', '保存') + '</button><button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button>'};
  return {title:L(f.en, f.zh), html:optEditor(m.d.opts, {done:true}), foot:'<button type="button" class="btn pri" data-act="optsSave">' + L('Save', '保存') + '</button><button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button>'};
}
function newRegModal(m){
  m.tpl = m.tpl || 'blank';
  var tpls = Object.keys(TEMPLATES);
  return {title:L('New register', '新建台账'), wide:true, html:
    '<p class="note">' + L('Start from a template or blank. Everything — fields, options, layout — can be changed afterwards.', '从模板或空白开始，之后字段、选项、布局都可以修改。') + '</p><div class="tplgrid">' + tpls.map(function(k){ var t = TEMPLATES[k]; return '<button type="button" class="tplc card' + (m.tpl === k ? ' on' : '') + '" data-act="tplPick" data-v="' + k + '"><span class="ri c-blue">' + icon(t.icon, 18) + '</span><b>' + esc(t.en) + '</b><span class="zh2">' + esc(t.zh) + '</span><span class="note">' + t.fields.filter(function(f){ return f.type !== 'section'; }).length + ' ' + L('fields', '个字段') + '</span></button>'; }).join('') + '</div>' +
    '<div class="fg" style="margin-top:12px"><label class="fl">' + L('Name (EN)', '名称（英文）') + '<input class="in" id="nrEn" data-fk="nrEn" value="' + esc(m.en != null ? m.en : TEMPLATES[m.tpl].en) + '"></label><label class="fl">' + L('Name (中)', '名称（中文）') + '<input class="in" id="nrZh" data-fk="nrZh" value="' + esc(m.zh != null ? m.zh : TEMPLATES[m.tpl].zh) + '"></label>' +
    '<label class="fl">' + L('Who can see it', '可见范围') + '<select class="in" id="nrVis"><option value="team"' + ((m.vis || TEMPLATES[m.tpl].visibility || 'team') === 'team' ? ' selected' : '') + (canTeamEdit() ? '' : ' disabled') + '>' + esc(T('Team (by role)', '团队（按角色）')) + '</option><option value="private"' + ((m.vis || TEMPLATES[m.tpl].visibility) === 'private' || !canTeamEdit() ? ' selected' : '') + '>' + esc(T('Only me — private', '仅自己可见')) + '</option></select></label>' +
    '<label class="fl">' + L('Section in the menu', '菜单分组') + '<select class="in" id="nrSec">' + SECS.map(function(s){ return '<option value="' + s[0] + '"' + ((m.sec || TEMPLATES[m.tpl].sec) === s[0] ? ' selected' : '') + '>' + esc(T(s[1], s[2])) + '</option>'; }).join('') + '</select></label></div>',
    foot:'<button type="button" class="btn pri" data-act="regCreate">' + L('Create register', '创建台账') + '</button><button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button>'};
}
function regSettingsModal(m){
  var reg = getReg(m.reg); if(!reg) return {title:'', html:''};
  if(!m.d) m.d = {en:reg.d.en, zh:reg.d.zh || '', icon:reg.d.icon || 'list', color:reg.d.color || 'blue', sec:reg.d.sec || 'other', prefix:reg.d.prefix || '', ownerPublish:!!reg.d.ownerPublish, view:reg.d.view || 'table', meeting:!!reg.d.meeting, vis:reg.vis};
  var d = m.d, own = reg.owner === myId() || STORE.mode === 'demo';
  return {title:L('Register settings', '台账设置') + ' · ' + esc(regName(reg)), html:
    '<div class="fg"><label class="fl">' + L('Name (EN)', '名称（英文）') + '<input class="in" data-rs="en" data-fk="rs:en" value="' + esc(d.en) + '"></label><label class="fl">' + L('Name (中)', '名称（中文）') + '<input class="in" data-rs="zh" data-fk="rs:zh" value="' + esc(d.zh) + '"></label>' +
    '<div class="fl">' + L('Icon', '图标') + '<div class="row">' + Object.keys(REG_ICONS).map(function(k){ return '<button type="button" class="ib' + (d.icon === k ? ' on' : '') + '" data-act="rsIcon" data-v="' + k + '">' + icon(k, 18) + '</button>'; }).join('') + '</div></div>' +
    '<label class="fl">' + L('Colour', '颜色') + '<select class="in" data-rs="color">' + COLORS.map(function(c){ return '<option value="' + c + '"' + (d.color === c ? ' selected' : '') + '>' + esc(T(COLOR_NAMES[c][0], COLOR_NAMES[c][1])) + '</option>'; }).join('') + '</select></label>' +
    '<label class="fl">' + L('Section in the menu', '菜单分组') + '<select class="in" data-rs="sec">' + SECS.map(function(s){ return '<option value="' + s[0] + '"' + (d.sec === s[0] ? ' selected' : '') + '>' + esc(T(s[1], s[2])) + '</option>'; }).join('') + '</select></label>' +
    '<label class="fl">' + L('Number prefix (e.g. DOC → DOC-001)', '编号前缀（如 DOC → DOC-001）') + '<input class="in" data-rs="prefix" value="' + esc(d.prefix) + '"></label>' +
    '<label class="fl">' + L('Default view', '默认视图') + '<select class="in" data-rs="view">' + [['table','Table','表格'],['board','Board','看板'],['gantt','Gantt','甘特图'],['matrix','Block matrix','区域矩阵']].map(function(o){ return '<option value="' + o[0] + '"' + (d.view === o[0] ? ' selected' : '') + '>' + esc(T(o[1], o[2])) + '</option>'; }).join('') + '</select></label>' +
    '<label class="fl">' + L('Who can see it', '可见范围') + '<select class="in" data-rs="vis"' + (own ? '' : ' disabled') + '><option value="team"' + (d.vis === 'team' ? ' selected' : '') + '>' + esc(T('Team (by role)', '团队（按角色）')) + '</option><option value="private"' + (d.vis === 'private' ? ' selected' : '') + '>' + esc(T('Only me — private', '仅自己可见')) + '</option></select>' + (own ? '' : '<span class="note">' + L('Only the person who created this register can make it private.', '只有创建者可以把台账设为私有。') + '</span>') + '</label>' +
    '<label class="chk full"><input type="checkbox" data-rs="ownerPublish"' + (d.ownerPublish ? ' checked' : '') + (d.vis === 'private' ? ' disabled' : '') + '>' + L('Can publish to the Owner plan', '允许发布到业主计划') + '</label>' +
    '<label class="chk full"><input type="checkbox" data-rs="meeting"' + (d.meeting ? ' checked' : '') + '>' + L('Meeting register (adds “Print minutes”)', '会议台账（启用「打印纪要」）') + '</label></div>' +
    (canDeleteReg(reg) ? '<div class="danger-zone"><h3>' + L('Delete register', '删除台账') + '</h3><p class="note">' + L('Deletes the register and its ' + recsOf(reg.id).length + ' records. It can be restored from the Change log.', '将删除台账及其 ' + recsOf(reg.id).length + ' 条记录，可在「修改记录」中恢复。') + '</p><div class="row"><input class="in" id="delRegName" placeholder="' + esc(T('Type the name to confirm: ', '输入名称确认：') + reg.d.en) + '"><button type="button" class="btn danger" data-act="regDelete">' + L('Delete', '删除') + '</button></div></div>' : ''),
    foot:'<button type="button" class="btn pri" data-act="regSave">' + L('Save', '保存') + '</button><button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button>'};
}
/* ---------------- field manager ---------------- */
function fieldManager(m){
  var reg = getReg(m.reg); if(!reg) return {title:'', html:''};
  if(!m.d) m.d = {fields:clone(fieldsOf(reg)), roles:clone(rolesOf(reg))};
  var d = m.d, ls = lists(), regs = allRegs();
  var h = '<p class="note" style="margin-top:0">' + L('Rename, reorder, add or remove fields; choose the type; untick “Table” to hide a column by default. Removing a field hides it — the data stays and comes back if you add a field with the same code.', '可改名、排序、增删字段，选择类型；取消「表格」即默认隐藏该列。删除字段只是隐藏——数据仍保留，重新添加同一代码的字段即可恢复。') + '</p>';
  h += '<div class="fm"><div class="fmh"><span></span><span>' + L('Name (EN)', '英文名') + '</span><span>' + L('Name (中)', '中文名') + '</span><span>' + L('Type', '类型') + '</span><span title="' + esc(T('Shown in the table by default', '默认在表格中显示')) + '">' + L('Table', '表格') + '</span><span title="' + esc(T('Owner can see (published plans)', '业主可见（发布计划中）')) + '">' + L('Owner', '业主') + '</span><span></span></div>';
  d.fields.forEach(function(f, i){
    var x = m.exp === i;
    h += '<div class="fmr' + (f.type === 'section' ? ' sec' : '') + '"><span class="nowrap"><button type="button" class="ib" data-act="fmMove" data-v="' + i + '" data-d="-1"' + (i ? '' : ' disabled') + '>' + uic('up', 13) + '</button><button type="button" class="ib" data-act="fmMove" data-v="' + i + '" data-d="1"' + (i < d.fields.length - 1 ? '' : ' disabled') + '>' + uic('down', 13) + '</button></span>' +
      '<input class="in" data-fm="' + i + ':en" data-fk="fm:' + i + ':en" value="' + esc(f.en || '') + '"><input class="in" data-fm="' + i + ':zh" data-fk="fm:' + i + ':zh" value="' + esc(f.zh || '') + '">' +
      '<select class="in" data-fm="' + i + ':type">' + Object.keys(TYPES).map(function(t){ return '<option value="' + t + '"' + (f.type === t ? ' selected' : '') + '>' + TYPES[t].icon + ' ' + esc(T(TYPES[t].en, TYPES[t].zh)) + '</option>'; }).join('') + '</select>' +
      (f.type === 'section' ? '<span></span><span></span>' : '<input type="checkbox" data-fm="' + i + ':show"' + (!f.hide ? ' checked' : '') + ' aria-label="Table"><input type="checkbox" data-fm="' + i + ':ext"' + (f.ext ? ' checked' : '') + ' aria-label="Owner">') +
      '<span class="nowrap"><button type="button" class="btn sm' + (x ? ' on' : '') + '" data-act="fmExp" data-v="' + i + '">' + L('More', '更多') + ' ' + (x ? '▴' : '▾') + '</button><button type="button" class="ib" data-act="fmDel" data-v="' + i + '" title="' + esc(T('Remove field', '删除字段')) + '">' + uic('trash', 14) + '</button></span></div>';
    if(x) h += '<div class="fmx">' + fieldExtra(reg, f, i, d, ls, regs) + '</div>';
  });
  h += '</div><div class="row" style="margin-top:10px"><select class="in" id="fmNewType">' + Object.keys(TYPES).map(function(t){ return '<option value="' + t + '">' + TYPES[t].icon + ' ' + esc(T(TYPES[t].en, TYPES[t].zh)) + '</option>'; }).join('') + '</select><input class="in" id="fmNewName" placeholder="' + esc(T('New field name', '新字段名称')) + '" data-fk="fmNewName"><button type="button" class="btn" data-act="fmAdd">' + uic('plus', 13) + ' ' + L('Add field', '添加字段') + '</button></div>';
  // roles
  h += '<h3 class="fsec">' + L('What each field is used for', '字段用途') + '</h3><p class="note">' + L('These tell the site which field is the title, dates, status… for Gantt, board, overdue, block views.', '告诉网站哪个字段是标题、日期、状态…，用于甘特图、看板、逾期、区域视图。') + '</p><div class="fg">' + ROLES.map(function(r){
    var ok = d.fields.filter(function(f){ return roleFits(r[0], f); });
    return '<label class="fl">' + L(r[1], r[2]) + '<select class="in" data-fmrole="' + r[0] + '"><option value="">—</option>' + ok.map(function(f){ return '<option value="' + esc(f.key) + '"' + (d.roles[r[0]] === f.key ? ' selected' : '') + '>' + esc(T1(f.en, f.zh)) + '</option>'; }).join('') + '</select></label>';
  }).join('') + '</div>';
  return {title:L('Fields & columns', '字段与列') + ' · ' + esc(regName(reg)), wide:true, html:h, foot:'<button type="button" class="btn pri" data-act="fmSave">' + L('Save fields', '保存字段') + '</button><button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button><span class="note">' + L('Saved changes are recorded in the change log and can be undone.', '保存后的修改会记入修改记录，可撤销。') + '</span>'};
}
function roleFits(r, f){
  if(r === 'title' || r === 'title2' || r === 'no') return f.type === 'text';
  if(r === 'start' || r === 'finish' || r === 'base' || r === 'astart' || r === 'afinish') return f.type === 'date';
  if(r === 'progress') return f.type === 'percent' || (f.type === 'calc' && f.calc && f.calc.op === 'pct');
  if(r === 'status' || r === 'kind') return f.type === 'select' && !f.multi && !f.list;
  if(r === 'block') return f.type === 'select';
  if(r === 'tree') return f.type === 'tree';
  return false;
}
function fieldExtra(reg, f, i, d, ls, regs){
  var h = '<div class="fg"><label class="fl">' + L('Code (internal key)', '代码（内部键）') + '<input class="in mono" value="' + esc(f.key) + '" disabled></label><label class="fl">' + L('Help text', '说明文字') + '<input class="in" data-fm="' + i + ':help" value="' + esc(f.help || '') + '"></label>';
  if(f.type !== 'section') h += '<label class="fl">' + L('Column width (px)', '列宽（像素）') + '<input class="in" type="number" min="60" max="600" step="10" placeholder="' + esc(T('auto', '自动')) + '" data-fm="' + i + ':w" value="' + esc(f.w || '') + '"><span class="note">' + L('60–600, or empty for automatic', '60–600，留空为自动') + '</span></label>';
  if(f.type === 'select'){
    h += '<label class="fl">' + L('Options come from', '选项来源') + '<select class="in" data-fm="' + i + ':list"><option value="">' + esc(T('This field’s own options', '本字段自己的选项')) + '</option>' + Object.keys(ls).map(function(k){ return '<option value="' + esc(k) + '"' + (f.list === k ? ' selected' : '') + '>' + esc(T('Shared list: ', '共享列表：') + nm(ls[k])) + '</option>'; }).join('') + '</select></label>' +
      '<label class="chk"><input type="checkbox" data-fm="' + i + ':multi"' + (f.multi ? ' checked' : '') + '>' + L('Allow several values', '允许多选') + '</label></div>';
    if(!f.list){ S.odTarget = {fm:i}; h += optEditor(f.opts || [], {done:true}); }
    return h;
  }
  if(f.type === 'tree'){ S.tdTarget = {fm:i}; return h + '</div>' + treeEditor(f.tree || []); }
  if(f.type === 'number') h += '<label class="fl">' + L('Unit', '单位') + '<input class="in" data-fm="' + i + ':unit" value="' + esc(f.unit || '') + '"></label>';
  if(f.type === 'percent'){ var nums = d.fields.filter(function(x){ return x.type === 'number'; }); h += '<label class="fl">' + L('Calculate from quantities (optional)', '按数量自动计算（可选）') + '<span class="row"><select class="in" data-fm="' + i + ':autoA"><option value="">' + esc(T('Done qty…', '完成量…')) + '</option>' + nums.map(function(x){ return '<option value="' + esc(x.key) + '"' + (f.auto && f.auto.a === x.key ? ' selected' : '') + '>' + esc(T1(x.en, x.zh)) + '</option>'; }).join('') + '</select>÷<select class="in" data-fm="' + i + ':autoB"><option value="">' + esc(T('Planned qty…', '计划量…')) + '</option>' + nums.map(function(x){ return '<option value="' + esc(x.key) + '"' + (f.auto && f.auto.b === x.key ? ' selected' : '') + '>' + esc(T1(x.en, x.zh)) + '</option>'; }).join('') + '</select></span><span class="note">' + L('When both are filled the % is calculated; otherwise you type it.', '两者都填写时自动计算百分比，否则手动填写。') + '</span></label>'; }
  if(f.type === 'calc'){ var cand = d.fields.filter(function(x){ return x.type === 'number' || x.type === 'date' || x.type === 'percent'; }), c = f.calc || {};
    h += '<label class="fl">' + L('Formula', '公式') + '<select class="in" data-fm="' + i + ':calcOp">' + CALC_OPS.map(function(o){ return '<option value="' + o[0] + '"' + (c.op === o[0] ? ' selected' : '') + '>' + esc(T(o[1], o[2])) + '</option>'; }).join('') + '</select></label>' +
      '<label class="fl">A<select class="in" data-fm="' + i + ':calcA"><option value=""></option>' + cand.map(function(x){ return '<option value="' + esc(x.key) + '"' + (c.a === x.key ? ' selected' : '') + '>' + esc(T1(x.en, x.zh)) + '</option>'; }).join('') + '</select></label><label class="fl">B<select class="in" data-fm="' + i + ':calcB"><option value=""></option>' + cand.map(function(x){ return '<option value="' + esc(x.key) + '"' + (c.b === x.key ? ' selected' : '') + '>' + esc(T1(x.en, x.zh)) + '</option>'; }).join('') + '</select></label>'; }
  if(f.type === 'link') h += '<div class="fl full">' + L('Can link to (none ticked = any register)', '可关联的台账（都不勾 = 任意台账）') + '<div class="row">' + regs.map(function(r){ return '<label class="chk"><input type="checkbox" data-fm="' + i + ':link:' + esc(r.id) + '"' + ((f.link || []).indexOf(r.id) >= 0 ? ' checked' : '') + '>' + esc(regName(r)) + '</label>'; }).join('') + '</div></div>';
  if(f.type === 'sub') h += '<div class="fl full"><button type="button" class="btn sm" data-act="colsOpen" data-v="' + i + '">' + L('Edit sub-table columns', '编辑子表列') + ' (' + (f.cols || []).length + ')</button></div>';
  return h + '</div>';
}
function colsModal(m){
  var parent = S.modal.parent, f = parent.d.fields[m.i];
  if(!m.cols) m.cols = clone(f.cols || []);
  return {title:L('Sub-table columns', '子表列') + ' · ' + esc(T1(f.en, f.zh)), html:'<div class="oed">' + m.cols.map(function(c, j){ return '<div class="oedr"><input class="in" data-cd="' + j + ':en" data-fk="cd:' + j + ':en" value="' + esc(c.en || '') + '" placeholder="Name"><input class="in" data-cd="' + j + ':zh" data-fk="cd:' + j + ':zh" value="' + esc(c.zh || '') + '" placeholder="名称"><select class="in" data-cd="' + j + ':type">' + SUB_TYPES.map(function(t){ return '<option value="' + t + '"' + (c.type === t ? ' selected' : '') + '>' + esc(T(TYPES[t].en, TYPES[t].zh)) + '</option>'; }).join('') + '</select>' + (c.type === 'select' ? '<input class="in" data-cd="' + j + ':optsTxt" value="' + esc((c.opts || []).map(function(o){ return o.v; }).join(', ')) + '" placeholder="A, B, C">' : '<span></span>') + '<button type="button" class="ib" data-act="cdDel" data-v="' + j + '">' + uic('x', 13) + '</button></div>'; }).join('') + '<button type="button" class="btn sm" data-act="cdAdd">' + uic('plus', 13) + ' ' + L('Add column', '添加列') + '</button></div>',
    foot:'<button type="button" class="btn pri" data-act="cdSave">' + L('Apply', '应用') + '</button><button type="button" class="btn" data-act="cdBack">' + L('Back', '返回') + '</button>'};
}
