/* work-web v3.3 · the overview, made of widgets each person can arrange (add, remove, move, width).
   The layout follows the person's account (user_prefs.home); an admin can make a layout the team default (app_config.prefDef.home),
   and anyone can go back to it. The team note's text is shared (app_config.teamNote) and editors keep it up to date. */
'use strict';

var HW = {
  blocks:{en:'By block', zh:'按区域', w:'full', d:['Average progress and open items in each block, per register', '每个区域在各台账的平均进度和未完成项']},
  regs:{en:'Registers', zh:'台账', w:'full', d:['A card per register: items, done, overdue, due soon', '每个台账一张卡：数量、完成、逾期、即将到期'], cfg:true},
  late:{en:'Overdue', zh:'已逾期', w:'third', d:['Open items past their finish date, all registers', '所有台账中超过完成日期的未完成项']},
  soon:{en:'Due soon', zh:'即将到期', w:'third', d:['Open items due in the next days', '未来几天内到期的未完成项'], cfg:true},
  acts:{en:'Open meeting actions', zh:'会议待办', w:'third', d:['Action items not done yet, from all meetings', '所有会议中尚未完成的待办事项']},
  star:{en:'Key items', zh:'重点项', w:'half', d:['Open items marked ★, all registers', '所有台账中标了 ★ 的未完成项']},
  ms:{en:'Upcoming milestones', zh:'即将到来的里程碑', w:'half', d:['Milestones in the coming weeks, with the slip against the baseline', '未来几周的里程碑，含与基准相比的偏差'], cfg:true},
  view:{en:'Saved view', zh:'保存的视图', w:'half', d:['The first items of a saved view; open it in one click', '一个保存视图的前几项，可一键打开'], cfg:true},
  note:{en:'Team note', zh:'团队公告', w:'full', d:['A short text, e.g. this week’s focus', '一段文字，例如本周重点'], cfg:true},
  recent:{en:'Recent changes', zh:'最近修改', w:'full', d:['The latest changes to records', '记录的最新修改']}
};
var HOME_DEF = [{id:'w1', t:'blocks', w:'full'}, {id:'w2', t:'regs', w:'full'}, {id:'w3', t:'late', w:'third'}, {id:'w4', t:'soon', w:'third'}, {id:'w5', t:'acts', w:'third'}, {id:'w6', t:'recent', w:'full'}];
function homeLayout(){ var p = myPrefs().home; if(Array.isArray(p)) return p; var d = prefDef('home'); if(Array.isArray(d)) return d; return HOME_DEF; }
function homeSave(list){ return savePref('home', list); }   // savePref already reports a failure
function hwTitle(w){ var t = HW[w.t] || {en:w.t, zh:''}; if(w.t === 'view'){ var r = getReg(w.c && w.c.reg), x = r && findView(r, w.c.vid); if(x) return {en:x.name, zh:''}; }
  if(w.t === 'note' && w.c && w.c.src === 'me') return {en:'My note', zh:'我的便笺'}; if(w.t === 'soon') return {en:'Due in the next ' + ((w.c && w.c.days) || 14) + ' days', zh:'未来 ' + ((w.c && w.c.days) || 14) + ' 天到期'}; return t; }

/* ================= the page ================= */
function viewHome(){
  var c = cfg(), regs = allRegs(), A = asOfN(), ed = !!S.homeEdit;
  var nOpen = 0, nOd = 0, nDue = 0; regs.forEach(function(r){ recsOf(r.id).forEach(function(x){ if(isDone(r, x)) return; nOpen++; if(isOverdue(r, x)) nOd++; else { var p = planOf(r, x); if(p && p.f >= A && p.f <= A + 14) nDue++; } }); });
  var h = '<header class="tblk"><div class="tb-name"><div class="tb-nm"><h1 class="vtitle">' + L('Overview', '总览') + '</h1><span class="tb-sub">' + esc(c.projectEn) + (c.projectZh ? ' · ' + esc(c.projectZh) : '') + '</span></div></div><div class="tb-cells">' +
    '<div class="tb-c tb-asof"><span class="tb-l">' + L('Status date', '状态日期') + '</span><span class="tb-v">' + esc(n2d(A)) + '</span></div>' +
    '<div class="tb-c"><span class="tb-l">' + L('Open items', '未完成') + '</span><span class="tb-v">' + nOpen + '</span></div>' +
    '<div class="tb-c' + (nOd ? ' bad' : '') + '"><span class="tb-l">' + L('Overdue', '逾期') + '</span><span class="tb-v">' + nOd + '</span></div>' +
    '<div class="tb-c' + (nDue ? ' soon' : '') + '"><span class="tb-l">' + L('Due in 14 days', '14 天内到期') + '</span><span class="tb-v">' + nDue + '</span></div></div>' +
    (regs.length && !ed ? '<div class="tb-act"><button type="button" class="btn" data-act="homeEdit">' + uic('gear', 14) + ' ' + L('Customize', '自订') + '</button></div>' : '') + '</header>';
  if(!regs.length) return h + '<div class="card empty">' + L('No registers yet.', '还没有台账。') + (canCreateReg() ? ' <button type="button" class="btn pri" data-act="newReg">' + L('Create the first register', '建立第一个台账') + '</button>' : '') + '</div>';
  var lay = homeLayout();
  if(ed) h += '<div class="hedbar card"><span><b>' + L('Arranging your overview', '正在整理你的总览') + '</b> <span class="note">' + L('Only you see these changes.', '只影响你自己。') + '</span></span><span class="row">' +
    '<button type="button" class="btn sm" data-act="hwAdd">' + uic('plus', 13) + ' ' + L('Add widget', '添加小工具') + '</button>' +
    (Array.isArray(myPrefs().home) ? '<button type="button" class="btn sm" data-act="homeReset">' + L('Back to the team default', '恢复团队默认') + '</button>' : '') +
    (isAdmin() ? '<button type="button" class="btn sm" data-act="homeTeam">' + L('Make this the team default', '设为团队默认') + '</button>' : '') +
    '<button type="button" class="btn sm pri" data-act="homeDone">' + L('Done', '完成') + '</button></span></div>';
  if(!lay.length) return h + '<div class="card empty">' + L('Your overview is empty.', '你的总览是空的。') + ' <button type="button" class="btn" data-act="' + (ed ? 'hwAdd' : 'homeEdit') + '">' + L('Add widgets', '添加小工具') + '</button></div>';
  h += '<div class="hgrid">' + lay.map(function(w, i){ return hwHtml(w, i, lay.length, ed); }).join('') + '</div>';
  return h;
}
function hwHtml(w, i, n, ed){
  var def = HW[w.t]; if(!def) return '';
  var body = '', head = '', cnt = null, wd = w.w || def.w, tt = hwTitle(w);
  try{ var r = HW_R[w.t](w.c || {}, w); body = r.body; cnt = r.cnt; head = r.head || ''; }catch(e){ console.error(e); body = '<div class="note">' + esc(e.message) + '</div>'; }
  var frame = w.t !== 'regs';
  var bar = ed ? '<div class="hwbar"><span class="hwn">' + esc(T1(tt.en, tt.zh)) + '</span>' +
    '<button type="button" class="ib" data-act="hwMove" data-v="' + esc(w.id) + '" data-d="-1"' + (i ? '' : ' disabled') + ' aria-label="' + esc(T('Move earlier', '前移')) + '">' + uic('up', 14) + '</button>' +
    '<button type="button" class="ib" data-act="hwMove" data-v="' + esc(w.id) + '" data-d="1"' + (i < n - 1 ? '' : ' disabled') + ' aria-label="' + esc(T('Move later', '后移')) + '">' + uic('down', 14) + '</button>' +
    '<select class="in sm" data-hww="' + esc(w.id) + '" aria-label="' + esc(T('Width', '宽度')) + '">' + [['full', T('Full width', '整行')], ['half', '½'], ['third', '⅓']].map(function(o){ return '<option value="' + o[0] + '"' + (wd === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' +
    (def.cfg ? '<button type="button" class="btn sm" data-act="hwCfg" data-v="' + esc(w.id) + '">' + L('Settings', '设置') + '</button>' : '') +
    '<button type="button" class="ib" data-act="hwDel" data-v="' + esc(w.id) + '" aria-label="' + esc(T('Remove ', '移除 ') + T1(tt.en, tt.zh)) + '">' + uic('x', 15) + '</button></div>' : '';
  var title = '<div class="sech"><h2>' + (tt.zh ? L(tt.en, tt.zh) : esc(tt.en)) + (cnt != null ? ' <span class="cnt">' + cnt + '</span>' : '') + '</h2>' + head + '</div>';
  return '<section class="hw w-' + esc(wd) + (frame ? ' card sec' : ' sec') + (ed ? ' hw-ed' : '') + '" data-hw="' + esc(w.id) + '">' + bar + '<div class="hwb">' + title + body + '</div></section>';
}
function hwList(arr, A, max){ max = max || 12;
  return arr.slice(0, max).map(function(e){ return '<button type="button" class="lrow2" data-act="openRec" data-id="' + esc(e.x.id) + '"><span class="ri c-' + esc(e.r.d.color || 'blue') + '">' + icon(e.r.d.icon, 13) + '</span><span class="mono muted">' + esc(recNo(e.r, e.x)) + '</span><span class="lt">' + esc(e.t != null ? e.t : recTitle(e.r, e.x) || '—') + (e.sub ? ' <span class="muted">· ' + esc(e.sub) + '</span>' : '') + '</span>' + (e.tag || '<span></span>') + '<span class="mono' + (e.f != null && e.f < A && !e.noOd ? ' od' : '') + '">' + esc(e.f != null ? md(n2d(e.f)) : '—') + '</span></button>'; }).join('') +
    (arr.length > max ? '<div class="note">+' + (arr.length - max) + '</div>' : ''); }
function openItems(fn){ var out = [], A = asOfN(); allRegs().forEach(function(r){ recsOf(r.id).forEach(function(x){ if(isDone(r, x)) return; var p = planOf(r, x), e = fn(r, x, p, A); if(e) out.push(e); }); }); return out; }
var HW_R = {
  blocks:function(){
    var regs = allRegs(), bl = lists().blocks, bregs = regs.filter(function(r){ return rf(r, 'block'); });
    if(!(bl && bl.opts.length && bregs.length)) return {body:'<div class="note">' + L('No register has a Block field yet.', '还没有台账使用「区域」字段。') + '</div>'};
    return {head:'<span class="blegend"><span><i class="lgbar"></i>' + L('average progress', '平均进度') + '</span><span><b>4</b> ' + L('open items', '未完成项') + '</span><span class="odn"><b>1!</b> ' + L('overdue', '逾期') + '</span></span>',
      body:'<div class="blocks">' + bl.opts.map(function(b){
        var rows = bregs.map(function(r){
          var its = recsOf(r.id).filter(function(x){ return blocksOf(r, x).indexOf(b.v) >= 0; }); if(!its.length) return '';
          var ps = its.map(function(x){ return progressOf(r, x); }).filter(function(x){ return x != null; }), avg = ps.length ? Math.round(ps.reduce(function(s, x){ return s + x; }, 0) / ps.length) : null;
          var open = its.filter(function(x){ return !isDone(r, x); }).length, od = its.filter(function(x){ return isOverdue(r, x); }).length;
          return '<button type="button" class="brow" data-act="goBlock" data-v="' + esc(r.id + '|' + b.v) + '"><span class="ri c-' + esc(r.d.color || 'blue') + '">' + icon(r.d.icon, 13) + '</span><span class="bn">' + esc(regName(r)) + '</span>' + (avg != null ? pbar(avg) : '<span></span>') + '<span class="mono muted" title="' + esc(T(open + ' open' + (od ? ', ' + od + ' overdue' : ''), open + ' 项未完成' + (od ? '，' + od + ' 项逾期' : ''))) + '">' + open + (od ? ' <b class="odn">' + od + '!</b>' : '') + '</span></button>';
        }).join('');
        return '<div class="bcard"><div class="bh"><span class="ar c-' + esc(b.color) + '">' + esc(b.v) + '</span> <b>' + esc(nm(b)) + '</b></div>' + (rows || '<div class="note">' + L('Nothing yet', '暂无') + '</div>') + '</div>';
      }).join('') + '</div>'};
  },
  regs:function(c){
    var A = asOfN(), pickd = asArr(c.regs), regs = allRegs().filter(function(r){ return !pickd.length || pickd.indexOf(r.id) >= 0; });
    return {body:'<div class="rgrid">' + regs.map(function(r){
      var its = recsOf(r.id), done = its.filter(function(x){ return isDone(r, x); }).length, od = its.filter(function(x){ return isOverdue(r, x); }).length;
      var due = its.filter(function(x){ var p = planOf(r, x); return p && !isDone(r, x) && p.f >= A && p.f <= A + 14; }).length;
      var sf = rf(r, 'status'), segs = sf && its.length ? optsOf(sf).map(function(o){ var k = its.filter(function(x){ return x.d[sf.key] === o.v; }).length; return k ? '<span class="cb-' + esc(o.color) + '" style="width:' + (k / its.length * 100) + '%" title="' + esc(nm(o) + ': ' + k) + '"></span>' : ''; }).join('') : '';
      return '<button type="button" class="rcard card" data-act="reg" data-v="' + esc(r.id) + '"><div class="rch"><span class="ri c-' + esc(r.d.color || 'blue') + '">' + icon(r.d.icon, 18) + '</span><b>' + esc(regName(r)) + '</b>' + (isPrivate(r) ? uic('lock', 13) : '') + '</div>' +
        '<div class="rcn"><span><b class="mono">' + its.length + '</b> ' + L('items', '项') + '</span>' + (sf ? '<span><b class="mono">' + pct(done, its.length) + '%</b> ' + L('done', '完成') + '</span>' : '') + (od ? '<span class="odn"><b class="mono">' + od + '</b> ' + L('overdue', '逾期') + '</span>' : '') + (due ? '<span><b class="mono">' + due + '</b> ' + L('due ≤14d', '14天内到期') + '</span>' : '') + '</div>' + (segs ? '<span class="stack">' + segs + '</span>' : '') + '</button>';
    }).join('') + (canCreateReg() && !pickd.length ? '<button type="button" class="rcard card addc" data-act="newReg">' + uic('plus', 20) + L('New register', '新建台账') + '</button>' : '') + '</div>'};
  },
  late:function(){
    var A = asOfN(), list = openItems(function(r, x, p){ return p && p.f < A ? {r:r, x:x, f:p.f} : null; }).sort(function(a, b){ return a.f - b.f; });
    return {cnt:list.length, body:list.length ? hwList(list, A) : '<div class="note">' + L('Nothing overdue', '没有逾期项') + '</div>'};
  },
  soon:function(c){
    var A = asOfN(), dd = +c.days || 14, list = openItems(function(r, x, p){ return p && p.f >= A && p.f <= A + dd ? {r:r, x:x, f:p.f} : null; }).sort(function(a, b){ return a.f - b.f; });
    return {cnt:list.length, body:list.length ? hwList(list, A) : '<div class="note">' + L('Nothing due', '没有到期项') + '</div>'};
  },
  acts:function(){
    var A = asOfN(), acts = [];
    allRegs().forEach(function(r){ dataFields(r).filter(function(f){ return f.type === 'sub' && isActionField(f); }).forEach(function(f){
      var a = actionCols(f);
      recsOf(r.id).forEach(function(x){ asArr(x.d[f.key]).forEach(function(row){ if(row && !row[a.ck]) acts.push({r:r, x:x, t:row[a.tk] || '—', sub:subVal(a.wc, a.wc ? row[a.wc.key] : ''), f:d2n(row[a.dk])}); }); }); }); });
    acts.sort(function(a, b){ return (a.f == null ? 1e9 : a.f) - (b.f == null ? 1e9 : b.f); });
    return {cnt:acts.length, body:acts.length ? hwList(acts, A) : '<div class="note">' + L('No open actions', '没有待办') + '</div>'};
  },
  star:function(){
    var A = asOfN(), list = openItems(function(r, x, p){ return x.d.star ? {r:r, x:x, f:p ? p.f : null} : null; }).sort(function(a, b){ return (a.f == null ? 1e9 : a.f) - (b.f == null ? 1e9 : b.f); });
    return {cnt:list.length, body:list.length ? hwList(list, A) : '<div class="note">' + L('No open item is marked ★. Mark one with the ☆ at the top of a record.', '没有标 ★ 的未完成项。可在记录顶部点 ☆ 标记。') + '</div>'};
  },
  ms:function(c){
    var A = asOfN(), dd = +c.days || 60, list = openItems(function(r, x, p){ if(!p || !isMilestone(r, x) || p.f > A + dd) return null;
      var b = typeof baseOf === 'function' ? baseOf(r, x) : null, slip = b ? p.f - b.f : null;
      return {r:r, x:x, f:p.f, tag:slip ? '<span class="mono msl' + (slip > 0 ? ' bad' : ' good') + '" title="' + esc(T('Against the baseline', '与基准相比')) + '">' + (slip > 0 ? '+' : '−') + Math.abs(slip) + T('d', '天') + '</span>' : ''}; })
      .sort(function(a, b){ return a.f - b.f; });
    return {cnt:list.length, body:list.length ? hwList(list, A) : '<div class="note">' + L('No milestone in the next ' + dd + ' days.', '未来 ' + dd + ' 天没有里程碑。') + '</div>'};
  },
  view:function(c){
    var reg = getReg(c.reg), x = reg && findView(reg, c.vid);
    if(!x) return {body:'<div class="note">' + L('Choose a saved view in Settings (⋯ Customize).', '请在「自订 → 设置」中选择一个保存的视图。') + '</div>'};
    var f = Object.assign(FIL0(), clone(x.st.f || {})), s = x.st.s || {k:rolesOf(reg).no || '', d:1}, A = asOfN();
    var list = recsOf(reg.id).filter(function(r){ return matchRec(reg, r, f); });
    if(s.k) list.sort(function(a, b){ var p = sortValue(reg, a, s.k), q = sortValue(reg, b, s.k); return (p < q ? -1 : p > q ? 1 : 0) * (s.d || 1); });
    var n = +c.n || 8;
    return {cnt:list.length, head:'<button type="button" class="lnk" data-act="hwOpenView" data-reg="' + esc(reg.id) + '" data-v="' + esc(x.id) + '">' + L('Open in ' + regName(reg), '在' + regName(reg) + '中打开') + '</button>',
      body:list.length ? list.slice(0, n).map(function(r){ var p = planOf(reg, r), st = statusOpt(reg, r); return '<button type="button" class="lrow2 nori" data-act="openRec" data-id="' + esc(r.id) + '"><span class="mono muted">' + esc(recNo(reg, r)) + '</span><span class="lt">' + esc(recTitle(reg, r) || '—') + '</span>' + (st ? chip(st.color, esc(nm(st))) : '<span></span>') + '<span class="mono' + (isOverdue(reg, r) ? ' od' : '') + '">' + esc(p ? md(n2d(p.f)) : '') + '</span></button>'; }).join('') + (list.length > n ? '<div class="note">+' + (list.length - n) + '</div>' : '')
        : '<div class="note">' + L('Nothing in this view.', '此视图中没有记录。') + '</div>'};
  },
  note:function(c, w){
    var team = c.src !== 'me', tn = team ? (teamCfg().teamNote || {}) : {text:c.text || ''}, can = team ? canTeamEdit() : true;
    return {head:can ? '<button type="button" class="lnk" data-act="noteEdit" data-v="' + (team ? 'team' : esc(w.id)) + '">' + uic('edit', 13) + ' ' + L('Edit', '编辑') + '</button>' : '',
      body:tn.text ? '<div class="hnote">' + noteHtml(tn.text) + '</div>' + (team && tn.by ? '<div class="note">' + esc(tn.by) + ' · ' + esc(fmtTime(tn.at)) + '</div>' : '') : '<div class="note">' + (can ? L('Nothing written yet — click Edit.', '还没有内容，点「编辑」。') : L('Nothing written yet.', '还没有内容。')) + '</div>'};
  },
  recent:function(){
    var au = ((STORE && STORE.audit) || []).slice(0, 8); window.__AUD = window.__AUD || {}; au.forEach(function(a){ window.__AUD[a.id] = a; });
    return {head:'<button type="button" class="lnk" data-act="page" data-v="activity">' + L('Full change log', '完整修改记录') + ' →</button>',
      body:au.length ? au.map(function(a){ return auditRowHtml(a, {showReg:true, showRec:true}); }).join('') : '<div class="note">' + L('No changes yet', '还没有修改') + '</div>'};
  }
};
/* a short text: paragraphs, "- " bullets, links */
function noteHtml(t){
  var out = '', inList = false;
  function part(x){ return typeof numLink === 'function' ? numLink(x) : esc(x); }   // v3.4: item and document numbers open the record
  function link(s){ var out = '', at = 0; s = String(s); s.replace(/https?:\/\/[^\s<>"'\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]+/g, function(u, i){ out += part(s.slice(at, i)) + '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u) + '</a>'; at = i + u.length; return u; }); return out + part(s.slice(at)); }
  String(t || '').split(/\n/).forEach(function(line){
    var m = /^\s*[-•·*]\s+(.*)$/.exec(line);
    if(m){ if(!inList){ out += '<ul>'; inList = true; } out += '<li>' + link(m[1]) + '</li>'; return; }
    if(inList){ out += '</ul>'; inList = false; }
    out += line.trim() ? '<p>' + link(line) + '</p>' : '';
  });
  return out + (inList ? '</ul>' : '');
}
UI_ICONS.edit = UI_ICONS.edit || '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>';

/* ================= arranging ================= */
function homeEditList(){ return clone(homeLayout()); }
function hwFind(list, id){ for(var i = 0; i < list.length; i++) if(list[i].id === id) return i; return -1; }
function hwAddModal(){
  var have = homeLayout().map(function(w){ return w.t; });
  return {title:L('Add a widget', '添加小工具'), html:'<div class="hwpick">' + Object.keys(HW).map(function(k){ var d = HW[k], dup = have.indexOf(k) >= 0 && k !== 'view' && k !== 'note';
    return '<button type="button" class="hwopt card" data-act="hwAddDo" data-v="' + k + '"' + (dup ? ' disabled' : '') + '><b>' + L(d.en, d.zh) + '</b><span class="note">' + L(d.d[0], d.d[1]) + (dup ? ' · ' + L('already on your overview', '已在总览中') : '') + '</span></button>'; }).join('') + '</div>',
    foot:'<button type="button" class="btn" data-act="mclose">' + L('Close', '关闭') + '</button>'};
}
function allSavedViews(){ var out = []; allRegs().forEach(function(r){ teamViews(r).forEach(function(v){ out.push({reg:r, v:v, team:true}); }); myViews(r).forEach(function(v){ out.push({reg:r, v:v, team:false}); }); }); return out; }
function hwCfgModal(m){
  var list = homeLayout(), w = list[hwFind(list, m.id)]; if(!w) return {title:'', html:''};
  var c = w.c || {}, h = '';
  if(w.t === 'soon') h += '<label class="fl">' + L('Due within', '到期范围') + '<select class="in" data-hwc="days">' + [7, 14, 30].map(function(n){ return '<option value="' + n + '"' + ((+c.days || 14) === n ? ' selected' : '') + '>' + esc(T(n + ' days', n + ' 天')) + '</option>'; }).join('') + '</select></label>';
  if(w.t === 'ms') h += '<label class="fl">' + L('Look ahead', '向前看') + '<select class="in" data-hwc="days">' + [30, 60, 90, 180].map(function(n){ return '<option value="' + n + '"' + ((+c.days || 60) === n ? ' selected' : '') + '>' + esc(T(n + ' days', n + ' 天')) + '</option>'; }).join('') + '</select></label><p class="note">' + L('Overdue milestones are always listed.', '逾期的里程碑总会列出。') + '</p>';
  if(w.t === 'regs') h += '<div class="fl"><span class="flab">' + L('Registers shown (none ticked = all)', '显示哪些台账（都不勾 = 全部）') + '</span><div class="dk-cl">' + allRegs().map(function(r){ return '<label class="chk"><input type="checkbox" data-hwc="regs" value="' + esc(r.id) + '"' + (asArr(c.regs).indexOf(r.id) >= 0 ? ' checked' : '') + '>' + esc(regName(r)) + '</label>'; }).join('') + '</div></div>';
  if(w.t === 'view'){ var vs = allSavedViews();
    h += vs.length ? '<label class="fl">' + L('Saved view', '保存的视图') + '<select class="in" data-hwc="vid"><option value="">—</option>' + vs.map(function(x){ var k = x.reg.id + '|' + x.v.id; return '<option value="' + esc(k) + '"' + (c.reg === x.reg.id && c.vid === x.v.id ? ' selected' : '') + '>' + esc(regName(x.reg) + ' · ' + x.v.name + (x.team ? '' : ' (' + T('mine', '我的') + ')')) + '</option>'; }).join('') + '</select></label>' +
      '<label class="fl">' + L('Rows', '行数') + '<select class="in" data-hwc="n">' + [5, 8, 12, 20].map(function(n){ return '<option value="' + n + '"' + ((+c.n || 8) === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>'
      : '<p class="note">' + L('No saved views yet. Open a register, set the filters you want, then use the view menu at the start of its tool bar → Save as a new view.', '还没有保存的视图。打开一个台账，设好筛选，然后在工具列开头的视图选单中选「另存为新视图」。') + '</p>'; }
  if(w.t === 'note') h += '<div class="fl"><span class="flab">' + L('Text', '内容') + '</span><label class="chk"><input type="radio" name="hwNoteSrc" data-hwc="src" value="team"' + (c.src !== 'me' ? ' checked' : '') + '>' + L('The team note (everyone sees the same text; editors can change it)', '团队公告（所有人看到同一段文字，编辑可修改）') + '</label><label class="chk"><input type="radio" name="hwNoteSrc" data-hwc="src" value="me"' + (c.src === 'me' ? ' checked' : '') + '>' + L('My own note (only on my overview)', '我自己的便笺（只在我的总览）') + '</label></div>';
  return {title:L('Widget settings', '小工具设置') + ' · ' + L(HW[w.t].en, HW[w.t].zh), html:h || '<p class="note">' + L('Nothing to set.', '没有可设置的内容。') + '</p>', foot:'<button type="button" class="btn pri" data-act="mclose">' + L('Done', '完成') + '</button>'};
}
function noteEditModal(m){
  var team = m.v === 'team', text = team ? ((teamCfg().teamNote || {}).text || '') : ((homeLayout().filter(function(w){ return w.id === m.v; })[0] || {c:{}}).c.text || '');
  if(m.text == null) m.text = text;
  return {title:team ? L('Team note', '团队公告') : L('My note', '我的便笺'), html:'<textarea class="in" id="noteText" data-fk="noteText" rows="9" maxlength="4000">' + esc(m.text) + '</textarea><p class="note">' + L('A line starting with “- ” becomes a bullet; links are clickable.', '以「- 」开头的行显示为项目符号；链接可点击。') + (team ? ' ' + L('Everyone with the team note on their overview sees this text.', '所有在总览放了团队公告的人都会看到这段文字。') : '') + '</p>',
    foot:'<button type="button" class="btn pri" data-act="noteSave" data-v="' + (team ? 'team' : esc(m.v)) + '">' + L('Save', '保存') + '</button><button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button>'};
}
DECK_MODALS.hwAdd = hwAddModal; DECK_MODALS.hwCfg = hwCfgModal; DECK_MODALS.noteEdit = noteEditModal;
function hwUpdate(id, fn){ var list = homeEditList(), i = hwFind(list, id); if(i < 0) return; fn(list[i], list, i); homeSave(list); }

document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act]'); if(!el) return;
  var act = el.dataset.act, v = el.dataset.v;
  switch(act){
    case 'homeEdit': S.homeEdit = true; renderMain(); break;
    case 'homeDone': S.homeEdit = false; renderMain(); break;
    case 'homeReset': if(confirm(T('Replace your overview with the team default?', '用团队默认替换你的总览？'))) homeSave(null).then(function(){ toast(T('Overview back to the team default', '总览已恢复团队默认')); }, function(){}); break;
    case 'homeTeam': (function(){ if(!isAdmin()) return; var all = homeLayout(), keep = all.filter(function(w){ if(w.t === 'note' && w.c && w.c.src === 'me') return false; if(w.t === 'view'){ var r = getReg(w.c && w.c.reg); return !!(r && isTeamView(r, w.c.vid)); } return true; }), left = all.length - keep.length;
      saveTeamDef('home', keep).then(function(){ toast(T('This layout is now the team default', '此版面已设为团队默认') + (left ? T(' (' + left + ' personal widgets left out: own notes and own views)', '（未包含 ' + left + ' 个个人小工具：个人便笺和个人视图）') : '')); }, function(){}); })(); break;
    case 'hwAdd': openModal({kind:'hwAdd'}); break;
    case 'hwAddDo': (function(){ var t = v, d = HW[t]; if(!d) return; var list = homeEditList(), w = {id:uid('w'), t:t, w:d.w}; if(t === 'note') w.c = {src:homeLayout().some(function(x){ return x.t === 'note' && (!x.c || x.c.src !== 'me'); }) ? 'me' : 'team'};
      list.push(w); var go = function(){ if(t === 'view'){ S.modal = {kind:'hwCfg', id:w.id}; renderModal(); } else { closeModal(); setTimeout(function(){ var s = document.querySelector('[data-hw="' + w.id + '"]'); if(s && s.scrollIntoView) s.scrollIntoView({block:'nearest'}); }, 50); } };
      homeSave(list).then(go, go); })(); break;   // added here either way; a save that failed waits on this device
    case 'hwMove': hwUpdate(v, function(w, list, i){ var j = i + (+el.dataset.d); if(j < 0 || j >= list.length) return; list[i] = list[j]; list[j] = w; }); refocus('[data-act="hwMove"][data-v="' + v + '"][data-d="' + el.dataset.d + '"]', '[data-act="hwMove"][data-v="' + v + '"]'); break;
    case 'hwDel': (function(){ var w0 = homeLayout().filter(function(x){ return x.id === v; })[0]; if(w0 && w0.t === 'note' && w0.c && w0.c.src === 'me' && w0.c.text && !confirm(T('Remove this note and its text?', '移除这则便笺及其内容？'))) return; hwUpdate(v, function(w, list, i){ list.splice(i, 1); }); })(); break;
    case 'hwCfg': openModal({kind:'hwCfg', id:v}); break;
    case 'hwOpenView': (function(){ var reg = getReg(el.dataset.reg); if(!reg) return; goReg(reg.id); useView(reg, v); })(); break;
    case 'noteEdit': openModal({kind:'noteEdit', v:v}); setTimeout(function(){ var t = $('#noteText'); if(t) t.focus(); }, 30); break;
    case 'noteSave': (function(){ var t = (($('#noteText') || {}).value || '').replace(/\s+$/, '');
      if(v === 'team'){ if(!canTeamEdit()) return; saveTeam({teamNote:{text:t, by:(STORE.me && (STORE.me.name || STORE.me.email)) || '', at:new Date().toISOString()}}).then(function(){ closeModal(); toast(T('Team note saved', '团队公告已保存')); }, function(){}); return; }
      var list = homeEditList(), w = list.filter(function(x){ return x.id === v; })[0]; if(!w) return; w.c = Object.assign({}, w.c || {}, {src:'me', text:t}); homeSave(list).then(function(){ closeModal(); }, function(){}); })(); break;
  }
});
document.addEventListener('change', function(e){
  var el = e.target, d;
  if((d = el.dataset && el.dataset.hww)){ hwUpdate(d, function(w){ w.w = el.value; }); return; }
  if((d = el.dataset && el.dataset.hwc) && S.modal && S.modal.kind === 'hwCfg'){
    hwUpdate(S.modal.id, function(w){ w.c = w.c || {};
      if(d === 'regs'){ var a = asArr(w.c.regs).slice(), i = a.indexOf(el.value); if(el.checked && i < 0) a.push(el.value); if(!el.checked && i >= 0) a.splice(i, 1); w.c.regs = a; }
      else if(d === 'vid'){ var p = el.value.split('|'); w.c.reg = p[0] || ''; w.c.vid = p[1] || ''; }
      else if(d === 'days' || d === 'n') w.c[d] = +el.value;
      else w.c[d] = el.value; });
  }
});
document.addEventListener('input', function(e){ if(e.target && e.target.id === 'noteText' && S.modal && S.modal.kind === 'noteEdit') S.modal.text = e.target.value; });
