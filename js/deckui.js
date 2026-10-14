/* work-web v2 · Presentations UI: list, editor, present mode, PDF export, issue / share with Owner,
   and the links from registers (current view → slide), records (photos → slide) and meetings (meeting → deck). */
'use strict';

UI_ICONS.play = '<path d="M7 4.5l12 7.5-12 7.5z"/>';
UI_ICONS.pdf = '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M12 11v6M9.5 14.5L12 17l2.5-2.5"/>';
UI_ICONS.left = '<path d="M15 5l-7 7 7 7"/>';
UI_ICONS.right = '<path d="M9 5l7 7-7 7"/>';
UI_ICONS.hide = '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.6 6.6C3.7 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>';
UI_ICONS.send = '<path d="M4 12l16-8-6 16-2.5-6.5z"/>';
UI_ICONS.lockon = UI_ICONS.lock;

/* ---------------- helpers ---------------- */
function isDeckRec(r){ var dr = deckReg(); return !!(r && dr && r.reg === dr.id); }
function deckRegs(test){ return allRegs().filter(function(r){ return !isPrivate(r) && (!test || test(r)); }); }
function meetingRecs(){ var out = []; allRegs().forEach(function(reg){ if(!reg.d.meeting || isPrivate(reg)) return; recsOf(reg.id).forEach(function(r){ out.push({reg:reg, r:r, date:r.d[rolesOf(reg).start] || ''}); }); }); return out.sort(function(a, b){ return String(b.date).localeCompare(String(a.date)); }); }
function deckTitle(d){ return (S.lang === 'zh' ? (d.titleZh || d.title) : (d.title || d.titleZh)) || T('Untitled presentation', '未命名演示文稿'); }
function deckChips(deck){
  var d = deck.d, n = (d.slides || []).filter(function(s){ return !s.hidden; }).length;
  return (d.status === 'issued' ? chip('green', uic('lock', 11) + ' ' + L('Issued', '已定稿')) : chip('amber', L('Draft · live data', '草稿 · 实时数据'))) + ' ' +
    ((d.aud || 'owner') === 'internal' ? chip('grey', L('Internal', '内部')) : chip('violet', L('Owner mode', '业主模式'))) + ' ' +
    chip('blue', esc({en:'EN', zh:'中文', both:'EN + 中'}[d.lang || 'en'])) + ' <span class="muted mono">' + n + ' ' + L('slides', '页') + '</span>';
}
/* paths into a slide; a segment "els#<id>" steps into the element (data block) with that id */
function pathStep(a, k, make){ if(a == null) return undefined; if(k.indexOf('els#') === 0){ var id = k.slice(4); return (a.els || []).filter(function(e){ return e.id === id; })[0]; } if(make && (a[k] == null || typeof a[k] !== 'object')) a[k] = {}; return a[k]; }
function getPath(o, p){ return p.split('.').reduce(function(a, k){ return pathStep(a, k, false); }, o); }
function setPath(o, p, v){ var ks = p.split('.'), last = ks.pop(), t = o; for(var i = 0; i < ks.length; i++){ t = pathStep(t, ks[i], true); if(t == null) return; } t[last] = v; }
/* every change made in the editor goes through deckEdit, which keeps an undo / redo history per deck (Cmd+Z / Cmd+Shift+Z) */
var UNDO = {};
function undoOf(id){ return UNDO[id] || (UNDO[id] = {u:[], r:[]}); }
function deckEdit(deck, patch, quiet, noHist){
  if(Object.keys(patch).every(function(k){ return same(deck.d[k], patch[k]); })) return Promise.resolve();
  if(!noHist && canDeckEdit()){ var st = undoOf(deck.id), old = {}; Object.keys(patch).forEach(function(k){ old[k] = deck.d[k] === undefined ? null : clone(deck.d[k]); }); st.u.push(old); if(st.u.length > 80) st.u.shift(); st.r = []; }
  DECK_ONLY = true;
  var pr = setRec(deck, patch, quiet ? {silent:true} : undefined);
  DECK_ONLY = false;   // consumed by notify() when the write happened; cleared if nothing was written
  return pr;
}
function saveSlides(deck, slides, quiet){ return deckEdit(deck, {slides:slides}, quiet); }
function deckUndo(redo){
  var deck = S.deck && getRec(S.deck); if(!deck || deck.d.status === 'issued' || !canDeckEdit()) return;
  var st = undoOf(deck.id), from = redo ? st.r : st.u, to = redo ? st.u : st.r, snap = from.pop(); if(!snap){ toast(redo ? T('Nothing to redo', '没有可重做的操作') : T('Nothing to undo', '没有可撤销的操作')); return; }
  var cur = {}; Object.keys(snap).forEach(function(k){ cur[k] = deck.d[k] === undefined ? null : clone(deck.d[k]); }); to.push(cur);
  if(snap.slides && !(snap.slides || []).some(function(x){ return x.id === S.dslide; })) S.dslide = null;
  deckEdit(deck, snap, true, true); toast(redo ? T('Redone', '已重做') : T('Undone', '已撤销'));
}
function slideById(deck, id){ return (deck.d.slides || []).filter(function(s){ return s.id === id; })[0] || null; }
function photoLists(d){ var out = []; if(!d) return out; if(d.photos) out.push(d.photos); if(d.L && d.L.photos) out.push(d.L.photos); if(d.R && d.R.photos) out.push(d.R.photos); return out; }
function photoPaths(built){ var out = []; built.forEach(function(x){ [x.data].concat(Object.keys(x.edata || {}).map(function(k){ return x.edata[k]; })).forEach(function(dd){ photoLists(dd).forEach(function(list){ list.forEach(function(p){ if(p.path && !p.src) out.push(p.path); }); }); }); (x.s.els || []).forEach(function(e){ if(e.path && !e.src) out.push(e.path); }); }); var th = built.theme; if(th){ [th.logoL, th.logoR].forEach(function(l){ if(l && l.path && !l.src) out.push(l.path); }); } return out; }
function signFor(built, deck){ if(deck) built.theme = themeOf(deck); return STORE && STORE.signUrls ? STORE.signUrls(photoPaths(built)) : Promise.resolve(); }
function openDeck(id, sid){ S.elSel = null; S.page = 'decks'; if(S.deck !== id) S.dkBar = null; S.deck = id; S.dslide = sid || null; S.dpage = 0; S.open = null; S.sideOpen = false; closePop(); saveUI(); renderAll(); var m = $('#main'); if(m) m.scrollTop = 0; }
function scaled(html, cls){ return '<div class="dk-fit' + (cls ? ' ' + cls : '') + '"><div class="dk-sc">' + html + '</div></div>'; }
function fitSlides(){ if(typeof fitStage === 'function') fitStage(); if(typeof thumbFill === 'function' && $('.dke-film [data-thumb]:empty')) thumbFill(); $$('.dk-fit').forEach(function(el){ var w = el.clientWidth, inner = el.firstElementChild; if(inner && w) inner.style.transform = 'scale(' + (w / 1280) + ')'; }); slFitAll(document); }
if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ SL_FIT = {}; if(typeof fitSlides === 'function') fitSlides(); });

/* ---------------- templates ---------------- */
var DECK_TPLS = [
  ['weekly','Weekly Owner meeting','业主周例会','Cover · key figures · block matrix · 3-week look-ahead · document status · documents due · punch list · photos · open actions · decisions','封面 · 关键数据 · 区域矩阵 · 三周计划 · 文件状态 · 到期文件 · 尾项 · 照片 · 待办 · 决策事项'],
  ['internal','Internal progress review','内部进度检查','Same data, focused on what is late: overdue documents, open punch items and actions','同样的数据，重点看滞后：逾期文件、未关闭尾项和待办'],
  ['blank','Blank','空白','Only a cover — add the slides you need','只有封面，自行添加需要的页面']
];
function tplSlides(tpl){
  var site = tplReg('site'), doc = tplReg('turnover'), pun = tplReg('punch'), mtg = tplReg('meetings'), A = [newSlide('cover')];
  if(tpl === 'blank') return A;
  A.push(newSlide('summary', site ? {regs:[site]} : {}));
  A.push(newSlide('kpi'));
  if(site) A.push(newSlide('matrix', {reg:site}, {en:'Site works – progress by block', zh:'现场施工 – 分区进度'}));
  if(site) A.push(newSlide('scurve', {regs:[site]}, {en:'Site works – S-curve', zh:'现场施工 – S 曲线'}));
  if(msRegId()) A.push(newSlide('timeline'));
  A.push(newSlide('lookahead', {regs:[site, doc].filter(Boolean), weeks:3, overdue:true}, {en:'3-week look-ahead', zh:'未来三周工作计划'}));
  if(doc){
    A.push(newSlide('breakdown', {reg:doc}, {en:'Turnover documents – status by package', zh:'移交文件 – 各文件包状态'}));
    A.push(tpl === 'internal' ? newSlide('table', {reg:doc, cols:defCols(getReg(doc)), filter:{open:true, od:true}}, {en:'Overdue documents', zh:'逾期文件'}) : newSlide('table', {reg:doc, cols:defCols(getReg(doc)), filter:{open:true, due:2}}, {en:'Documents due in the next 2 weeks', zh:'未来两周到期的文件'}));
  }
  if(pun) A.push(newSlide('punch', {reg:pun}));
  A.push(newSlide('photos', {mode:'auto', days:7, layout:'2x2'}, {en:'Site photos – last 7 days', zh:'近 7 天现场照片'}));
  if(mtg) A.push(newSlide('actions', {reg:mtg, meeting:'latest', open:true}, {en:'Open action items', zh:'未完成待办事项'}));
  if(tpl === 'weekly') A.push(newSlide('text', {body:'Decisions needed from the Owner\n  …\nNext steps\n  …'}, {en:'Decisions & next steps', zh:'需决策事项与下一步'}));
  return A;
}

/* ================= page: list or editor ================= */
function viewDecks(){
  var deck = S.deck && getRec(S.deck);
  if(deck && isDeckRec(deck)) return viewDeckEditor(deck);
  S.deck = null;
  return viewDeckList();
}
function viewDeckList(){
  var decks = allDecks(), ed = canDeckEdit();
  var h = '<div class="ph"><div><h1 class="vtitle">' + L('Presentations', '演示文稿') + '</h1><span class="muted">' + L('Slides built from the registers for Owner and site meetings. Present full-screen or save as PDF. While a deck is a draft its figures stay live; issuing it freezes them.', '用台账数据生成会议用的演示文稿，可全屏演示或另存为 PDF。草稿阶段数据实时更新，定稿后数据冻结。') + '</span></div><div class="pha">' + (ed ? '<button type="button" class="btn pri" data-act="dkNew">' + uic('plus', 14) + ' ' + L('New presentation', '新建演示文稿') + '</button>' : '') + '</div></div>';
  if(!decks.length) return h + '<div class="card empty dk-none"><div class="dk-none-art">' + scaled(withLang(S.lang === 'zh' ? 'zh' : 'en', function(){ return deckBuild({id:'_', d:{title:'Weekly progress meeting', titleZh:'周进度汇报会', date:n2d(asOfN()), lang:S.lang === 'zh' ? 'zh' : 'en', theme:{style:'sheet'}, slides:[{id:'s0', type:'cover', cfg:{}}]}})[0].pages[0]; })) + '</div><p>' + L('No presentations yet. Start from the weekly Owner-meeting template: it fills itself from site works, turnover documents, punch list, photos and meeting actions.', '还没有演示文稿。可从「业主周例会」模板开始：内容会自动取自现场施工、移交文件、尾项、照片和会议待办。') + '</p>' + (ed ? '<button type="button" class="btn pri" data-act="dkNew">' + uic('plus', 14) + ' ' + L('New presentation', '新建演示文稿') + '</button>' : '') + '</div>';
  return h + '<div class="dk-list">' + decks.map(function(deck){
    var first = (deck.d.slides || []).filter(function(s){ return !s.hidden; })[0], thumb = '';
    if(first){ var b = deckBuild({id:deck.id, d:Object.assign({}, deck.d, {slides:[first]})}); thumb = b[0] ? b[0].pages[0] : ''; }
    var m = deck.d.meeting && getRec(deck.d.meeting);
    return '<article class="card dk-card"><button type="button" class="dk-cthumb" data-act="dkOpen" data-v="' + esc(deck.id) + '" aria-label="' + esc(T('Open', '打开')) + '">' + scaled(thumb) + '</button><div class="dk-cbody"><div class="dk-cno mono muted">' + esc(deck.d.no || '') + ' · ' + esc(deck.d.date || '') + '</div><h3><button type="button" class="lnk" data-act="dkOpen" data-v="' + esc(deck.id) + '">' + esc(deckTitle(deck.d)) + '</button></h3><div class="dk-cchips">' + deckChips(deck) + '</div>' +
      (m ? '<div class="note">' + uic('link', 12) + ' <button type="button" class="lnk" data-act="openRec" data-id="' + esc(m.id) + '">' + esc(recLabel(m)) + '</button></div>' : '') +
      '<div class="row dk-cact"><button type="button" class="btn sm pri" data-act="dkPresent" data-v="' + esc(deck.id) + '">' + uic('play', 13) + ' ' + L('Present', '演示') + '</button><button type="button" class="btn sm" data-act="dkPdf" data-v="' + esc(deck.id) + '">' + uic('pdf', 14) + ' PDF</button><button type="button" class="btn sm" data-act="dkPptx" data-v="' + esc(deck.id) + '">' + uic('pdf', 14) + ' PPTX</button>' + (ed ? '<button type="button" class="btn sm" data-act="dkCopy" data-v="' + esc(deck.id) + '">' + uic('copy', 13) + ' ' + L('Copy for next week', '复制为下周') + '</button>' : '') + '</div></div></article>';
  }).join('') + '</div>';
}

/* the editor itself (viewDeckEditor) lives in deckedit.js */
/* ---------------- slide properties ---------------- */
function themeBar(deck, ed){
  var th = themeOf(deck), dis = ed ? '' : ' disabled';
  function logo(k, lab){ var l = th[k], u = logoUrl(l); return '<div class="fl"><span>' + lab + '</span><div class="dk-logo">' + (u ? '<img src="' + esc(u) + '" alt="">' : '<span class="note">' + L('none', '无') + '</span>') + (ed ? '<label class="btn sm">' + L('Upload', '上传') + '<input type="file" accept="image/*" hidden data-logo="' + k + '"></label>' + (l ? '<button type="button" class="ib" data-act="dkLogoDel" data-v="' + k + '">' + uic('x', 13) + '</button>' : '') : '') + '</div></div>'; }
  return '<div class="fl dk-wide"><span>' + L('Colours', '配色') + '</span><div class="dk-theme">' + Object.keys(THEMES).map(function(k){ var p = THEMES[k]; return '<button type="button" class="dk-thc' + (th.color === k ? ' on' : '') + '"' + (ed ? ' data-act="dkTheme" data-v="' + k + '"' : ' disabled') + ' title="' + esc(T1(p.en, p.zh)) + '"><i style="background:' + p.p2 + '"></i><i style="background:' + p.acc + '"></i></button>'; }).join('') + '</div></div>' +
    logo('logoL', L('Logo 1 (e.g. company)', 'Logo 1（如公司）')) + logo('logoR', L('Logo 2 (e.g. Owner)', 'Logo 2（如业主）')) +
    '<label class="fl">' + L('Footer, left', '页脚左侧') + '<select class="in" data-th="foot"' + dis + '>' + [['title', T('Presentation title', '文稿标题')], ['project', T('Project name', '项目名称')], ['custom', T('Custom text…', '自定义文字…')], ['none', T('Nothing', '不显示')]].map(function(o){ return '<option value="' + o[0] + '"' + (th.foot === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' + (th.foot === 'custom' ? '<input class="in" data-th="footText" data-fk="th:footText" value="' + esc(th.footText || '') + '"' + dis + '>' : '') + '</label>' +
    '<label class="fl">' + L('Marking (optional)', '密级标注（可选）') + '<input class="in" data-th="conf" data-fk="th:conf" value="' + esc(th.conf || '') + '" placeholder="Confidential"' + dis + '></label>' +
    (ed && canTeamEdit() ? '<div class="fl"><span>&nbsp;</span><button type="button" class="btn sm" data-act="dkThemeDef">' + L('Use this look for new presentations', '设为新文稿的默认样式') + '</button></div>' : '');
}
function pIn(path, v, ed, ph){ return '<input class="in" data-sp="' + path + '" data-fk="sp:' + esc(S.dslide + ':' + path) + '" value="' + esc(v == null ? '' : v) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + (ed ? '' : ' disabled') + '>'; }
function pSel(path, v, opts, ed, t){ return '<select class="in" data-sp="' + path + '"' + (t ? ' data-t="' + t + '"' : '') + (ed ? '' : ' disabled') + '>' + opts.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (String(v) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
function pChk(path, on, label, ed, v, t){ return '<label class="chk"><input type="checkbox" data-sp="' + path + '"' + (v != null ? ' data-v="' + esc(v) + '"' : '') + ' data-t="' + (t || (v != null ? 'list' : 'bool')) + '"' + (on ? ' checked' : '') + (ed ? '' : ' disabled') + '>' + label + '</label>'; }
function pRow(label, html, note){ return '<div class="fl"><span class="flab">' + label + '</span>' + html + (note ? '<span class="note">' + note + '</span>' : '') + '</div>'; }
function regOpts(test){ return [['', T('— choose —', '— 选择 —')]].concat(deckRegs(test).map(function(r){ return [r.id, regName(r)]; })); }
function slideProps(deck, s, ed, region){
  var c = s.cfg || {}, t = SLIDES[s.type], h = region ? '' : '<div class="dk-pt">' + esc(T1(t.en, t.zh)) + '</div>';
  if(s.type !== 'cover' && !region) h += pRow(L('Slide title', '页面标题'), pIn('title.en', s.title && s.title.en, ed, 'English') + pIn('title.zh', s.title && s.title.zh, ed, '中文'));
  var reg = c.reg && getReg(c.reg);
  switch(s.type){
    case 'summary':
      h += pRow(L('Progress from', '进度来自'), '<div class="dk-cl">' + deckRegs(function(r){ return (rolesOf(r).start || rolesOf(r).finish) && (rf(r, 'progress') || rf(r, 'status')); }).map(function(r){ return pChk('cfg.regs', (c.regs || []).indexOf(r.id) >= 0, esc(regName(r)), ed, r.id); }).join('') + '</div>', L('Planned vs actual to date, as on the S-curve.', '截至今日计划 vs 实际，与 S 曲线相同。'));
      h += pRow(L('Milestones from', '里程碑来自'), pSel('cfg.ms', c.ms || '', [['', T('All registers (records marked ◆)', '全部台账（标 ◆ 的记录）')]].concat(deckRegs(function(r){ return rolesOf(r).start || rolesOf(r).finish; }).map(function(r){ return [r.id, regName(r)]; })), ed));
      h += pRow(L('Issues & decisions from', '问题与决策来自'), pSel('cfg.iss', c.iss || '', [['', T('— none —', '— 无 —')]].concat(deckRegs().map(function(r){ return [r.id, regName(r)]; })), ed), issuesRegId() ? '' : L('Tip: create an “Issues, risks & decisions” register (New register → template).', '提示：可新建「问题、风险与决策事项」台账（新建台账 → 模板）。'));
      h += pRow(L('Period', '本期'), pSel('cfg.period', c.period || 14, [7, 14, 30].map(function(n){ return [n, T('Last ' + n + ' days', '近 ' + n + ' 天')]; }), ed, 'num'));
      h += pRow(L('Overall status', '总体状态'), pSel('cfg.rag', c.rag || 'auto', [['auto', T('Automatic (variance ≥ −2 pp green, ≥ −5 pp amber, late milestones → amber)', '自动（偏差 ≥ −2 绿，≥ −5 黄；有延误里程碑 → 黄）')], ['green', T('Green · on track', '绿 · 正常')], ['amber', T('Amber · at risk', '黄 · 有风险')], ['red', T('Red · behind', '红 · 滞后')]], ed));
      h += pRow(L('Add achievements', '补充完成事项'), '<textarea class="in" rows="3" data-sp="cfg.ach" data-fk="sp:' + esc(s.id) + ':ach"' + (ed ? '' : ' disabled') + '>' + esc(c.ach || '') + '</textarea>') + pRow(L('Add issues & risks', '补充问题与风险'), '<textarea class="in" rows="3" data-sp="cfg.iss2" data-fk="sp:' + esc(s.id) + ':iss2"' + (ed ? '' : ' disabled') + '>' + esc(c.iss2 || '') + '</textarea>') + pRow(L('Add decisions needed', '补充待决策事项'), '<textarea class="in" rows="3" data-sp="cfg.dec" data-fk="sp:' + esc(s.id) + ':dec"' + (ed ? '' : ' disabled') + '>' + esc(c.dec || '') + '</textarea>', L('One per line. Shown after the items taken from the registers.', '每行一条，显示在台账数据之后。'));
      break;
    case 'combo':
      h += pRow(L('Split', '比例'), pSel('cfg.split', c.split || '1:1', [['1:1', T('Half / half', '左右各半')], ['3:2', T('Wider left', '左宽右窄')], ['2:3', T('Wider right', '左窄右宽')]], ed)) + regionProps(deck, s, 'L', ed) + regionProps(deck, s, 'R', ed);
      break;
    case 'etable':
      h += (ed ? '<div class="row"><button type="button" class="btn sm" data-act="etAdd" data-v="row">' + uic('plus', 12) + ' ' + L('Row', '行') + '</button><button type="button" class="btn sm" data-act="etAdd" data-v="col">' + uic('plus', 12) + ' ' + L('Column', '列') + '</button></div>' : '') +
        '<p class="note">' + L('Click a cell on the slide to type. Hover a row or column header and click × to delete it.', '点页面上的单元格即可输入；鼠标移到行或表头上点 × 可删除。') + (c.orig ? ' ' + L('Made from a live slide — “Back to live data” restores it.', '由实时数据页转换而来，可点「恢复实时数据」还原。') : '') + '</p>' +
        pRow(L('Rows per page', '每页行数'), pSel('cfg.per', c.per || 10, [6, 8, 10, 12, 14, 16].map(function(n){ return [n, String(n)]; }), ed, 'num'));
      break;
    case 'blank': h += pChk('cfg.noHead', c.noHead, L('No title bar (full canvas)', '不要标题栏（整页画布）'), ed) + '<p class="note">' + L('Use Insert above the slide to add text, notes, boxes, arrows and images. Drag to move, pull the handles to resize.', '用页面上方的「插入」添加文字、便签、方框、箭头和图片；拖动可移动，拉动控制点可缩放。') + '</p>'; break;
    case 'cover': h += pRow(L('Subtitle', '副标题'), pIn('cfg.sub', c.sub, ed, T('e.g. Progress report week 42', '如：第 42 周进度报告'))) + '<p class="note">' + L('Title, date, presenter and meeting come from the bar above the slides.', '标题、日期、汇报人和会议取自页面上方的设置栏。') + '</p>'; break;
    case 'section': h += pRow(L('Subtitle', '副标题'), pIn('cfg.sub', c.sub, ed)); break;
    case 'text': h += pRow(L('Points', '要点'), '<textarea class="in" rows="9" data-sp="cfg.body" data-fk="sp:' + esc(S.dslide) + ':cfg.body"' + (ed ? '' : ' disabled') + '>' + esc(c.body || '') + '</textarea>', L('One point per line. Start a line with two spaces or “- ” for a sub-point.', '每行一个要点；以两个空格或「- 」开头为下级要点。')) + pRow(L('Second column (optional)', '第二栏（可选）'), '<textarea class="in" rows="5" data-sp="cfg.body2" data-fk="sp:' + esc(S.dslide) + ':cfg.body2"' + (ed ? '' : ' disabled') + '>' + esc(c.body2 || '') + '</textarea>'); break;
    case 'kpi': h += pRow(L('Registers', '台账'), '<div class="dk-cl">' + deckRegs(function(r){ return rf(r, 'status'); }).map(function(r){ return pChk('cfg.regs', (c.regs || []).indexOf(r.id) >= 0, esc(regName(r)), ed, r.id); }).join('') + '</div>', L('Counts use the lowest level of each item (sub-items, not their parent).', '按最底层计数（子项计入，上级不重复计）。')); break;
    case 'matrix':
      h += pRow(L('Register', '台账'), pSel('cfg.reg', c.reg, regOpts(function(r){ return rf(r, 'block'); }), ed));
      if(reg){ var rowF = dataFields(reg).filter(function(f){ return f.type === 'tree' || (f.type === 'select' && !f.list); }), colF = dataFields(reg).filter(function(f){ return f.type === 'select'; }), mc = mxDef(reg, c);
        h += pRow(L('Rows', '行'), pSel('cfg.row', mc.row, rowF.map(function(f){ return [f.key, T1(f.en, f.zh)]; }), ed)) + pRow(L('Columns', '列'), pSel('cfg.col', mc.col, colF.map(function(f){ return [f.key, T1(f.en, f.zh)]; }), ed)) + pRow(L('Cells show', '单元格显示'), pSel('cfg.val', c.val || 'progress', [['progress', T('Progress %', '完成率')], ['count', T('Number of items', '数量')], ['open', T('Open items', '未完成数')]], ed)); }
      break;
    case 'lookahead':
      h += pRow(L('Registers', '台账'), '<div class="dk-cl">' + deckRegs(function(r){ return rolesOf(r).start || rolesOf(r).finish; }).map(function(r){ return pChk('cfg.regs', (c.regs || []).indexOf(r.id) >= 0, esc(regName(r)), ed, r.id); }).join('') + '</div>') +
        pRow(L('Window', '时间范围'), pSel('cfg.weeks', c.weeks || 3, [1, 2, 3, 4, 6, 8].map(function(n){ return [n, T(n + (n > 1 ? ' weeks' : ' week'), n + ' 周')]; }), ed, 'num'), L('Starts on the Monday of the “data as of” week.', '从数据日期所在周的周一开始。')) + pChk('cfg.overdue', c.overdue, L('Also list overdue items that are still open', '同时列出仍未完成的逾期项'), ed);
      break;
    case 'table':
      h += pRow(L('Register', '台账'), pSel('cfg.reg', c.reg, regOpts(), ed));
      if(reg){ var f0 = c.filter || {}, sf = rf(reg, 'status'), bf = rf(reg, 'block'), tf = rf(reg, 'tree'), cols = c.cols && c.cols.length ? c.cols : defCols(reg), ctx = dctx(deck);
        var hiddenCols = cols.filter(function(k){ var f = fieldOf(reg, k); return f && !fieldOk(ctx, reg, f); });
        if(region !== true) h += pRow(L('Rows', '行'), pSel('cfg.mode', c.mode || 'filter', [['filter', T('By filter (updates itself)', '按条件筛选（自动更新）')], ['pick', T('Pick records by hand', '手动挑选记录')]], ed));
        if(c.mode === 'pick') h += pickerHtml(reg, c, ed);
        h += pRow(L('Column order', '列顺序'), '<div class="dk-ord">' + cols.map(function(k, i){ var f = fieldOf(reg, k); return f ? '<div class="dk-ordr"><span>' + esc(T1(f.en, f.zh)) + '</span>' + (ed ? '<button type="button" class="ib" data-act="dkColMv" data-v="' + esc(k) + '" data-d="-1"' + (i ? '' : ' disabled') + '>' + uic('up', 12) + '</button><button type="button" class="ib" data-act="dkColMv" data-v="' + esc(k) + '" data-d="1"' + (i < cols.length - 1 ? '' : ' disabled') + '>' + uic('down', 12) + '</button>' : '') + '</div>' : ''; }).join('') + '</div>');
        h += pRow(L('Columns', '列'), '<div class="dk-cl">' + dataFields(reg).filter(function(f){ return ['files','sub','link','section'].indexOf(f.type) < 0; }).map(function(f){ return pChk('cfg.cols', cols.indexOf(f.key) >= 0, esc(T1(f.en, f.zh)) + (ctx.owner && !fieldOk(ctx, reg, f) ? ' <span class="chip c-grey">' + L('internal', '内部') + '</span>' : ''), ed, f.key); }).join('') + '</div>', hiddenCols.length ? L(hiddenCols.length + ' ticked column(s) are internal and are left out in Owner mode. Tick “Owner can see” in Fields & columns to show them.', '有 ' + hiddenCols.length + ' 个勾选的列为内部字段，业主模式下不显示。可在「字段与列」中勾选「业主可见」。') : '');
        if(c.mode !== 'pick') h += '<div class="fl"><span class="flab">' + L('Which items', '哪些记录') + '</span>' + pChk('cfg.filter.open', f0.open, L('Open items only', '只看未完成'), ed) + pChk('cfg.filter.od', f0.od, L('Overdue only', '只看逾期'), ed) + pChk('cfg.filter.star', f0.star, L('Key items only (★)', '只看重点（★）'), ed) +
          pRow(L('Due within', '到期范围'), pSel('cfg.filter.due', f0.due || 0, [[0, T('any date', '不限')]].concat([1, 2, 3, 4, 6, 8].map(function(n){ return [n, T(n + ' week' + (n > 1 ? 's' : ''), n + ' 周内')]; })), ed, 'num')) + '</div>';
        if(sf && c.mode !== 'pick') h += pRow(L(sf.en, sf.zh), '<div class="dk-cl">' + optsOf(sf).map(function(o){ return pChk('cfg.filter.st', (f0.st || []).indexOf(o.v) >= 0, optChip(o), ed, o.v); }).join('') + '</div>', L('None ticked = all', '不勾选 = 全部'));
        if(bf && c.mode !== 'pick') h += pRow(L(bf.en, bf.zh), '<div class="dk-cl dk-inl">' + optsOf(bf).map(function(o){ return pChk('cfg.filter.blk', (f0.blk || []).indexOf(o.v) >= 0, esc(o.v), ed, o.v); }).join('') + '</div>');
        if(tf && c.mode !== 'pick'){ var topts = [['all', T('All', '全部')]]; treeDfs(tf, function(n, dp){ topts.push([n.id, new Array(dp + 1).join('  ') + treeLabel(n)]); }); h += pRow(L(tf.en, tf.zh), pSel('cfg.filter.node', f0.node || 'all', topts, ed)); }
        var fxn = Object.keys(f0.fx || {}).filter(function(k){ return (f0.fx[k] || []).length; }).length + (f0.q ? 1 : 0) + (f0.from || f0.to ? 1 : 0);
        if(fxn) h += '<p class="note">' + L(fxn + ' more filter(s) carried over from the register view.', '另有 ' + fxn + ' 个从台账视图带过来的筛选条件。') + (ed ? ' <button type="button" class="lnk" data-act="dkClearFx">' + L('Clear them', '清除') + '</button>' : '') + '</p>';
        h += pRow(L('Sort by', '排序'), pSel('cfg.sort.k', (c.sort && c.sort.k) || rolesOf(reg).no || '', dataFields(reg).filter(function(f){ return ['files','sub','link','section','long'].indexOf(f.type) < 0; }).map(function(f){ return [f.key, T1(f.en, f.zh)]; }), ed) + pSel('cfg.sort.d', (c.sort && c.sort.d) || 1, [[1, T('ascending', '升序')], [-1, T('descending', '降序')]], ed, 'num'));
        h += pRow(L('Rows per page', '每页行数'), pSel('cfg.per', c.per || 10, [6, 8, 10, 12, 14].map(function(n){ return [n, String(n)]; }), ed, 'num'), L('More rows continue on extra pages automatically.', '超出部分自动分页。'));
      }
      break;
    case 'breakdown':
      h += pRow(L('Register', '台账'), pSel('cfg.reg', c.reg, regOpts(function(r){ return rf(r, 'status'); }), ed));
      if(reg) h += pRow(L('One bar per', '每条代表'), pSel('cfg.by', c.by || rolesOf(reg).tree || rolesOf(reg).block || '', dataFields(reg).filter(function(f){ return f.type === 'tree' || f.type === 'select'; }).map(function(f){ return [f.key, T1(f.en, f.zh)]; }), ed));
      break;
    case 'punch': h += pRow(L('Register', '台账'), pSel('cfg.reg', c.reg, regOpts(function(r){ return rf(r, 'status'); }), ed), L('Uses the Priority and Block fields when the register has them.', '如有「优先级」和「区域」字段会自动使用。')); break;
    case 'photos':
      h += pRow(L('Photos', '照片'), pSel('cfg.mode', c.mode || 'auto', [['auto', T('Newest automatically', '自动取最新')], ['pick', T('Pick them myself', '自己挑选')]], ed)) + pRow(L('Layout', '版式'), pSel('cfg.layout', c.layout || '2x2', [['1', T('1 large', '1 张大图')], ['2x2', T('4 per page (2 × 2)', '每页 4 张（2×2）')], ['3x2', T('6 per page (3 × 2)', '每页 6 张（3×2）')]], ed));
      if((c.mode || 'auto') === 'auto') h += pRow(L('Taken in the last', '最近'), pSel('cfg.days', c.days || 7, [3, 7, 14, 30].map(function(n){ return [n, T(n + ' days', n + ' 天')]; }), ed, 'num')) + pRow(L('From registers', '来自台账'), '<div class="dk-cl">' + deckRegs(function(r){ return dataFields(r).some(function(f){ return f.type === 'files'; }); }).map(function(r){ return pChk('cfg.regs', (c.regs || []).indexOf(r.id) >= 0, esc(regName(r)), ed, r.id); }).join('') + '</div>', L('None ticked = all registers', '不勾选 = 全部台账'));
      else h += photoPicker(c, ed);
      break;
    case 'timeline': case 'gantt':
      h += pRow(L('Registers', '台账'), '<div class="dk-cl">' + deckRegs(function(r){ return rolesOf(r).start || rolesOf(r).finish; }).map(function(r){ return pChk('cfg.regs', (c.regs || []).indexOf(r.id) >= 0, esc(regName(r)), ed, r.id); }).join('') + '</div>');
      h += pRow(L('Show', '显示'), pSel('cfg.only', c.only || 'ms', [['ms', T('Milestones only (◆)', '只显示里程碑（◆）')], ['all', T('Milestones and activities (bars)', '里程碑和作业（横条）')]], ed));
      h += pRow(L('Lanes', '泳道'), pSel('cfg.lanes', c.lanes || 'reg', [['reg', T('One lane per register', '每个台账一条泳道')], ['tree', T('By package / category', '按文件包 / 分类')], ['block', T('By block', '按区域')], ['none', T('No lanes', '不分泳道')]], ed));
      h += pRow(L('Time window', '时间范围'), pSel('cfg.months', c.months == null ? 6 : c.months, [[0, T('Whole programme', '整个工期')]].concat([3, 6, 9, 12, 18, 24].map(function(n){ return [n, T(n + ' months', n + ' 个月')]; })), ed, 'num') + ((c.months == null ? 6 : c.months) > 0 ? pSel('cfg.back', c.back == null ? 1 : c.back, [0, 1, 2, 3].map(function(n){ return [n, T('starting ' + n + ' month(s) before today', '从今天前 ' + n + ' 个月开始')]; }), ed, 'num') : ''), L('Or fix the dates:', '或指定日期：') + ' <input class="in" type="date" data-sp="cfg.from" value="' + esc(c.from || '') + '"' + (ed ? '' : ' disabled') + ' style="width:auto"> – <input class="in" type="date" data-sp="cfg.to" value="' + esc(c.to || '') + '"' + (ed ? '' : ' disabled') + ' style="width:auto">');
      h += '<div class="fl">' + pChk('cfg.base', c.base !== false, L('Show the baseline (hollow ◇ / grey bar) and the slip in days', '显示基准（空心 ◇ / 灰色条）和延误天数'), ed) + pChk('cfg.hideDone', c.hideDone, L('Hide finished items', '隐藏已完成项'), ed) + '</div>';
      h += '<p class="note">' + L('No baseline yet? Use “Set baseline…” in the register’s ⋯ menu. Mark single records as milestones with ◆ in the record.', '还没有基准？在台账 ⋯ 菜单点「设定基准计划…」。单条记录可在记录右上角点 ◆ 设为里程碑。') + '</p>';
      break;
    case 'mstable':
      h += pRow(L('Registers', '台账'), '<div class="dk-cl">' + deckRegs(function(r){ return rolesOf(r).start || rolesOf(r).finish; }).map(function(r){ return pChk('cfg.regs', (c.regs || []).indexOf(r.id) >= 0, esc(regName(r)), ed, r.id); }).join('') + '</div>') +
        pRow(L('Which milestones', '哪些里程碑'), pSel('cfg.show', c.show || 'all', [['all', T('All', '全部')], ['open', T('Not yet achieved', '未达成')], ['next', T('Late + next 60 days', '延误 + 未来 60 天')]], ed));
      break;
    case 'scurve':
      var sregs = deckRegs(function(r){ return (rolesOf(r).start || rolesOf(r).finish) && (rf(r, 'progress') || rf(r, 'status')); }), r0 = getReg((c.regs || [])[0]);
      h += pRow(L('Registers', '台账'), '<div class="dk-cl">' + sregs.map(function(r){ return pChk('cfg.regs', (c.regs || []).indexOf(r.id) >= 0, esc(regName(r)), ed, r.id); }).join('') + '</div>');
      h += pRow(L('Block', '区域'), pSel('cfg.blk', c.blk || '', [['', T('Whole site', '全场')]].concat(optsOf({list:'blocks'}).map(function(o){ return [o.v, nm(o)]; })), ed));
      h += pRow(L('Weight of each item', '每项权重'), pSel('cfg.weight', c.weight || '', [['', T('Equal', '相同')]].concat(r0 ? dataFields(r0).filter(function(f){ return f.type === 'number'; }).map(function(f){ return [f.key, T1(f.en, f.zh)]; }) : []), ed), L('e.g. planned quantity, budget or man-hours', '例如计划工程量、预算或人工时'));
      h += pRow(L('Earlier actual % (optional)', '早期实际 %（可选）'), '<textarea class="in" rows="4" data-sp="cfg.manual" data-fk="sp:' + esc(S.dslide) + ':manual"' + (ed ? '' : ' disabled') + ' placeholder="2026-08-02	12.5&#10;2026-08-09	14.1">' + esc(c.manual || '') + '</textarea>', L('Paste from Excel: date and actual %, one week per line. Used for weeks before the website’s history and overrides any week.', '从 Excel 贴上：日期与实际 %，每行一周。用于网站有记录之前的周次，也可覆盖任何一周。'));
      h += '<p class="note">' + L('Planned curve: each item’s weight spread evenly between its start and finish (baseline dates when set). Actual: weekly snapshots and the change log.', '计划曲线：每项权重平均分摊在开始到结束之间（有基准时用基准日期）。实际曲线：每周快照与修改记录。') + '</p>';
      break;
    case 'actions':
      h += pRow(L('Meetings register', '会议台账'), pSel('cfg.reg', c.reg, regOpts(function(r){ return dataFields(r).some(function(f){ return f.type === 'sub' && (f.cols || []).some(function(x){ return x.type === 'check'; }); }); }), ed));
      if(reg) h += pRow(L('Meeting', '会议'), pSel('cfg.meeting', c.meeting || 'latest', [['latest', T('Latest meeting before the deck date', '演示日期前的最近一次会议')]].concat(recsOf(reg.id).slice().sort(function(a, b){ return String(b.d[rolesOf(reg).start] || '').localeCompare(String(a.d[rolesOf(reg).start] || '')); }).map(function(r){ return [r.id, (r.d[rolesOf(reg).start] || '') + ' · ' + recLabel(r)]; })), ed)) + pChk('cfg.open', c.open, L('Open actions only', '只显示未完成'), ed);
      break;
  }
  var hd = c.hide || [];
  if(hd.length) h += '<div class="fl dk-hid"><span class="flab">' + L('Hidden on this slide', '此页已隐藏') + ' <span class="mono">' + hd.length + '</span>' + (ed ? ' <button type="button" class="lnk" data-act="dkUnhide" data-v="*">' + L('Show all', '全部恢复') + '</button>' : '') + '</span><div class="dk-hidl">' + hd.map(function(k){ return '<span class="chip c-grey">' + esc((c.hideLab && c.hideLab[k]) || k.slice(2)) + (ed ? ' <button type="button" class="lnk" data-act="dkUnhide" data-v="' + esc(k) + '" title="' + esc(T('Show again', '恢复显示')) + '">×</button>' : '') + '</span>'; }).join(' ') + '</div></div>';
  else if(ed && ['cover','section','text','blank','scurve'].indexOf(s.type) < 0) h += '<p class="note">' + L('Hover a row, column, bar, photo or tile on the slide and click × to leave it out of this slide only.', '把鼠标移到页面上的某行、某列、某条、某张照片或某个卡片上，点 × 即可只在此页隐藏它。') + '</p>';
  if(region) return h;
  if(['cover','section','text'].indexOf(s.type) < 0) h += pRow(L('Key message', '重点结论'), pIn('cfg.msg', c.msg, ed, T('One line shown under the title', '显示在标题下方的一句话')), L('Shown under the title in an orange bar. Leave empty to hide.', '以橙色条显示在标题下方；留空即隐藏。')) + pRow(L('Notes box', '说明框'), '<textarea class="in" rows="3" data-sp="cfg.side" data-fk="sp:' + esc(S.dslide) + ':side"' + (ed ? '' : ' disabled') + ' placeholder="' + esc(T('Your comments on this slide, one point per line', '对此页的说明，每行一条')) + '">' + esc(c.side || '') + '</textarea>', L('Shown at the bottom of the slide. The data above stays live.', '显示在页面底部；上方数据仍实时更新。'));
  h += pRow(L('Speaker notes', '演讲备注'), '<textarea class="in" rows="3" data-sp="note" data-fk="sp:' + esc(S.dslide) + ':note"' + (ed ? '' : ' disabled') + ' placeholder="' + esc(T('Only you see these — in the editor and in present mode (press N).', '只有你能看到：在编辑页和演示时（按 N）显示。')) + '">' + esc(s.note || '') + '</textarea>');
  return h;
}
function regionProps(deck, s, key, ed){
  var x = (s.cfg && s.cfg[key]) || {type:'text', cfg:{}}, pseudo = {id:s.id, type:x.type, cfg:x.cfg || {}, title:x.title};
  var h = '<div class="dk-region"><div class="dk-pt">' + (key === 'L' ? L('Left part', '左边') : L('Right part', '右边')) + '</div>' +
    pRow(L('Shows', '内容'), pSel('cfg.' + key + '.type', x.type, COMBO_TYPES.map(function(t){ return [t, T1(SLIDES[t].en, SLIDES[t].zh)]; }), ed)) +
    pRow(L('Small heading (optional)', '小标题（可选）'), pIn('cfg.' + key + '.title.en', x.title && x.title.en, ed, 'English') + pIn('cfg.' + key + '.title.zh', x.title && x.title.zh, ed, '中文'));
  var inner = slideProps(deck, pseudo, ed, true).replace(/data-sp="/g, 'data-sp="cfg.' + key + '.').replace(/data-fk="sp:/g, 'data-fk="sp:' + key + ':').replace(/data-act="(dkColMv|dkUnhide|dkClearFx)"/g, 'data-act="$1" data-hp="cfg.' + key + '"');
  return h + inner + '</div>';
}
function pickerHtml(reg, c, ed){
  var picks = c.picks || [], q = (S.dkPickQ || '').toLowerCase(), ro = rolesOf(reg);
  var cand = sortRecs(reg, recsOf(reg.id).filter(function(r){ if(picks.indexOf(r.id) >= 0) return false; var t = (recNo(reg, r) + ' ' + (r.d[ro.title] || '') + ' ' + (r.d[ro.title2] || '')).toLowerCase(); return !q || t.indexOf(q) >= 0; })).slice(0, 40);
  return '<div class="fl"><span class="flab">' + L('Picked', '已选') + ' <span class="mono">' + picks.length + '</span></span><div class="dk-ord">' + picks.map(function(id, i){ var r = getRec(id); return r ? '<div class="dk-ordr"><span>' + esc(recLabel(r)) + '</span>' + (ed ? '<button type="button" class="ib" data-act="dkPickMv" data-v="' + esc(id) + '" data-d="-1"' + (i ? '' : ' disabled') + '>' + uic('up', 12) + '</button><button type="button" class="ib" data-act="dkPickMv" data-v="' + esc(id) + '" data-d="1"' + (i < picks.length - 1 ? '' : ' disabled') + '>' + uic('down', 12) + '</button><button type="button" class="ib" data-act="dkPickDel" data-v="' + esc(id) + '">' + uic('x', 12) + '</button>' : '') + '</div>' : ''; }).join('') + (picks.length ? '' : '<div class="note">' + L('Nothing picked yet.', '还没有选择。') + '</div>') + '</div>' +
    (ed ? '<input class="in" id="dkPickQ" data-fk="dkPickQ" placeholder="' + esc(T('Search to add…', '搜索并添加…')) + '" value="' + esc(S.dkPickQ || '') + '"><div class="dk-ord dk-cand">' + cand.map(function(r){ return '<button type="button" class="dk-ordr dk-add1" data-act="dkPickAdd" data-v="' + esc(r.id) + '">' + uic('plus', 12) + ' <span>' + esc(recLabel(r)) + '</span></button>'; }).join('') + '</div>' : '') + '</div>';
}
function photoPicker(c, ed){
  var picks = c.picks || [], all = [];
  var seenP = {}; deckRegs().forEach(function(reg){ recsOf(reg.id).forEach(function(r){ recFiles(r).forEach(function(fx){ var x = fx.x; if(/^image\//.test(x.type || '') && !seenP[x.path]){ seenP[x.path] = 1; all.push({reg:reg, r:r, x:x}); } }); }); });
  all.sort(function(a, b){ return String(b.x.at || b.r.ua || '').localeCompare(String(a.x.at || a.r.ua || '')); });
  if(!all.length) return '<p class="note">' + L('No photos yet. Upload photos to records (Files tab or “Take photo”), then pick them here.', '还没有照片。请先在记录的「文件」里上传或拍照，再回来挑选。') + '</p>';
  return '<div class="fl"><span class="flab">' + L('Pick photos', '挑选照片') + ' <span class="muted mono">' + picks.length + '</span></span><div class="dk-pick">' + all.slice(0, 80).map(function(e){ var on = picks.some(function(p){ return p.path === e.x.path; }), u = STORE.fileUrl(e.x.path);
    return '<label class="dk-pk' + (on ? ' on' : '') + '" title="' + esc(recLabel(e.r) + ' · ' + e.x.name) + '"><input type="checkbox" data-sp="cfg.picks" data-t="pick" data-v="' + esc(JSON.stringify({rec:e.r.id, path:e.x.path})) + '"' + (on ? ' checked' : '') + (ed ? '' : ' disabled') + '>' + (u ? '<img src="' + esc(u) + '" alt="" loading="lazy">' : '<span class="dk-ph0"></span>') + '<span class="mono">' + esc(recNo(e.reg, e.r)) + '</span></label>'; }).join('') + '</div></div>';
}

/* ================= modals ================= */
function newDeckModal(m){
  var ms = meetingRecs();
  return {title:L('New presentation', '新建演示文稿'), wide:false, html:
    '<div class="dk-tpls">' + DECK_TPLS.map(function(t){ return '<button type="button" class="dk-tpl' + (m.tpl === t[0] ? ' on' : '') + '" data-act="dkTpl" data-v="' + t[0] + '"><b>' + L(t[1], t[2]) + '</b><span class="note">' + esc(T1(t[3], t[4])) + '</span></button>'; }).join('') + '</div>' +
    '<div class="fg"><label class="fl">' + L('Title', '标题') + '<input class="in" data-nd="title" data-fk="nd:title" value="' + esc(m.title || '') + '" placeholder="Weekly progress meeting"></label><label class="fl">' + L('Title (中文)', '中文标题') + '<input class="in" data-nd="titleZh" data-fk="nd:titleZh" value="' + esc(m.titleZh || '') + '" placeholder="周进度汇报会"></label>' +
    '<label class="fl">' + L('For meeting', '对应会议') + '<select class="in" data-nd="meeting"><option value="">' + esc(T('— none —', '— 无 —')) + '</option>' + ms.map(function(x){ return '<option value="' + esc(x.r.id) + '"' + (m.meeting === x.r.id ? ' selected' : '') + '>' + esc(x.date + ' · ' + recLabel(x.r)) + '</option>'; }).join('') + '</select></label>' +
    '<label class="fl">' + L('Data as of', '数据日期') + '<input class="in" type="date" data-nd="date" data-fk="nd:date" value="' + esc(m.date || '') + '"></label>' +
    '<label class="fl">' + L('Slide language', '页面语言') + '<select class="in" data-nd="lang">' + [['en','English'],['both','English + 中文'],['zh','中文']].map(function(o){ return '<option value="' + o[0] + '"' + (m.lang === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
    '<label class="fl">' + L('Audience', '对象') + '<select class="in" data-nd="aud"><option value="owner"' + (m.aud !== 'internal' ? ' selected' : '') + '>' + esc(T('Owner mode — only what the Owner may see', '业主模式：只显示业主可见内容')) + '</option><option value="internal"' + (m.aud === 'internal' ? ' selected' : '') + '>' + esc(T('Internal — everything', '内部：全部内容')) + '</option></select></label></div>' +
    (m.slide ? '<p class="note">' + L('The slide you were adding goes in after the cover.', '你要添加的页面会放在封面之后。') + '</p>' : ''),
    foot:'<button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button><button type="button" class="btn pri" data-act="dkCreate">' + L('Create', '创建') + '</button>'};
}
function addToDeckModal(m){
  var drafts = allDecks().filter(function(x){ return x.d.status !== 'issued'; });
  if(!m.deck) m.deck = drafts[0] ? drafts[0].id : '__new';
  return {title:L('Add to presentation', '添加到演示文稿'), html:
    (m.cands.length > 1 ? '<div class="fl"><span class="flab">' + L('Slide', '页面') + '</span><div class="dk-tpls">' + m.cands.map(function(c, i){ return '<button type="button" class="dk-tpl' + (m.pick === i ? ' on' : '') + '" data-act="dkCand" data-v="' + i + '"><b>' + esc(T1(SLIDES[c.s.type].en, SLIDES[c.s.type].zh)) + '</b><span class="note">' + esc(c.note) + '</span></button>'; }).join('') + '</div></div>' : '<p>' + esc(m.cands[0].note) + '</p>') +
    '<label class="fl">' + L('Presentation', '演示文稿') + '<select class="in" id="atdDeck">' + drafts.map(function(x){ return '<option value="' + esc(x.id) + '"' + (m.deck === x.id ? ' selected' : '') + '>' + esc((x.d.no || '') + ' · ' + (x.d.date || '') + ' · ' + deckTitle(x.d)) + '</option>'; }).join('') + '<option value="__new"' + (m.deck === '__new' ? ' selected' : '') + '>' + esc(T('+ New presentation…', '+ 新建演示文稿…')) + '</option></select></label>' +
    '<p class="note">' + L('Only draft presentations are listed — issued ones are frozen. The slide keeps following the live data until its presentation is issued.', '只列出草稿状态的演示文稿（已定稿的不可修改）。在定稿前，此页面会一直跟随实时数据。') + '</p>',
    foot:'<button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button><button type="button" class="btn pri" data-act="dkAddGo">' + L('Add slide', '添加页面') + '</button>'};
}
var DECK_MODALS = {newDeck:newDeckModal, addToDeck:addToDeckModal};

/* candidate slides from a register's current view */
function viewCands(reg){
  var v = regView(reg), f = rfil(reg.id), ro = rolesOf(reg), sf = rf(reg, 'status'), bf = rf(reg, 'block'), name = {en:reg.d.en || '', zh:reg.d.zh || ''}, out = [];
  var fx = clone(f.fx || {}), st = sf && fx[sf.key] ? fx[sf.key] : [], blk = bf && fx[bf.key] ? fx[bf.key] : []; if(sf) delete fx[sf.key]; if(bf) delete fx[bf.key];
  var n = function(list){ return list.length; };
  var cols = tableCols(reg).filter(function(x){ return ['files','sub','link','section'].indexOf(x.type) < 0; }).map(function(x){ return x.key; });
  out.push({key:'table', s:newSlide('table', {reg:reg.id, cols:cols, filter:{q:f.q || '', fx:fx, st:st, blk:blk, from:f.from || '', to:f.to || '', od:!!f.od, star:!!f.star, ext:!!f.ext, node:f.node || 'all'}, sort:S.rs[reg.id] || null}, name), note:T('Table with the current filters and columns (' + n(filteredRecs(reg)) + ' items now)', '表格，沿用当前筛选和列（目前 ' + n(filteredRecs(reg)) + ' 项）')});
  if(ro.block){ var mc = matrixCfg(reg); out.push({key:'matrix', s:newSlide('matrix', {reg:reg.id, row:mc.row, col:mc.col, val:mc.val}, {en:name.en + ' – by block', zh:(name.zh || name.en) + ' – 分区'}), note:T('Block matrix with the current rows, columns and values', '区域矩阵，沿用当前的行、列和数值')}); }
  if(ro.start || ro.finish){ out.push({key:'gantt', s:newSlide('gantt', {regs:[reg.id], only:'all', lanes:ro.tree ? 'tree' : 'none', months:0, base:true}, {en:name.en + ' – programme', zh:(name.zh || name.en) + ' – 进度计划'}), note:T('Programme Gantt with baseline and milestones', '含基准和里程碑的进度甘特图')});
    if(recsOf(reg.id).some(function(r){ return isMilestone(reg, r); })) out.push({key:'ms', s:newSlide('timeline', {regs:[reg.id], only:'ms', lanes:'reg', months:6, back:1, base:true}, {en:name.en + ' – milestones', zh:(name.zh || name.en) + ' – 里程碑'}), note:T('Milestone timeline: baseline vs forecast vs actual', '里程碑时间轴：基准 vs 预测 vs 实际')});
    if(rf(reg, 'progress') || rf(reg, 'status')) out.push({key:'sc', s:newSlide('scurve', {regs:[reg.id]}, {en:name.en + ' – S-curve', zh:(name.zh || name.en) + ' – S 曲线'}), note:T('Planned vs actual S-curve', '计划 vs 实际 S 曲线')}); }
  if(ro.start || ro.finish) out.push({key:'la', s:newSlide('lookahead', {regs:[reg.id], weeks:3, overdue:true}, {en:name.en + ' – look-ahead', zh:(name.zh || name.en) + ' – 近期计划'}), note:T('3-week look-ahead bars from the Gantt dates', '按甘特日期生成三周计划条形图')});
  if(sf) out.push({key:'board', s:newSlide('breakdown', {reg:reg.id, by:ro.tree || ro.block || ''}, {en:name.en + ' – status', zh:(name.zh || name.en) + ' – 状态分布'}), note:T('Status bars per category / block', '按分类或区域的状态条形图')});
  if(sf && fieldOf(reg, 'prio')) out.push({key:'punch', s:newSlide('punch', {reg:reg.id}), note:T('Punch-list summary: priority × block, top open items', '尾项汇总：优先级 × 区域，以及最重要的未关闭项')});
  if(dataFields(reg).some(function(x){ return x.type === 'files'; })) out.push({key:'photos', s:newSlide('photos', {mode:'auto', days:7, regs:[reg.id], layout:'2x2'}, {en:name.en + ' – photos', zh:(name.zh || name.en) + ' – 照片'}), note:T('Newest photos of this register (last 7 days)', '本台账最近 7 天的照片')});
  var pick = 0; out.forEach(function(c, i){ if(c.key === v || (v === 'board' && c.key === 'punch')) pick = i; });
  return {cands:out, pick:pick};
}
function addSlideTo(deck, slide, after){
  var slides = clone(deck.d.slides || []), i = after ? slides.map(function(s){ return s.id; }).indexOf(after) : -1;
  if(i < 0) slides.push(slide); else slides.splice(i + 1, 0, slide);
  return saveSlides(deck, slides, true);
}
function createDeck(m){
  return ensureDeckReg().then(function(reg){
    var d = {title:(m.title || '').trim(), titleZh:(m.titleZh || '').trim(), date:m.date || n2d(asOfN()), lang:m.lang || 'en', aud:m.aud || 'owner', meeting:m.meeting || '', presenter:m.presenter || ((STORE.me && STORE.me.name) || ''), slides:tplSlides(m.tpl || 'weekly'), theme:{style:((cfg().deckTheme || {}).style === 'classic' ? 'classic' : 'sheet')}};
    if(!d.title && !d.titleZh){ d.title = 'Weekly progress meeting'; d.titleZh = '周进度汇报会'; }
    if(m.slide) d.slides.splice(1, 0, m.slide);
    return createRec(reg, d, false);
  });
}

/* ================= present mode: see present.js ================= */
/* everything a deck needs before it is shown outside the editor: progress history for S-curves, then signed photo links */
function deckNeedsHist(deck){ var ids = []; (deck.d.slides || []).forEach(function(s){ [s].concat(s.cfg && s.cfg.L ? [s.cfg.L, s.cfg.R] : []).concat((s.els || []).filter(function(e){ return e && e.k === 'data'; })).forEach(function(x){ if(x && x.type === 'scurve' || x && x.type === 'summary') (x.cfg && x.cfg.regs || []).forEach(function(id){ if(ids.indexOf(id) < 0) ids.push(id); }); }); }); return deck.d.status === 'issued' && deck.d.snap ? [] : ids; }
function deckPrepare(deck){ return loadHistory(deckNeedsHist(deck)).then(function(){ return signFor(deckBuild(deck), deck); }); }

/* ================= PDF (browser print → Save as PDF, vector text) ================= */
function pdfHtml(pages, title){
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + SLIDE_CSS +
    '\n@page{size:1280px 720px;margin:0}html,body{margin:0;padding:0;background:#6B7178}body{padding:56px 0 24px}.sl{margin:0 auto 18px;box-shadow:0 4px 18px rgba(0,0,0,.35);break-after:page;page-break-after:always;break-inside:avoid}.sl:last-of-type{break-after:auto;page-break-after:auto}' +
    '.pbar{position:fixed;top:0;left:0;right:0;height:44px;display:flex;align-items:center;gap:14px;padding:0 18px;background:#1A1D21;color:#fff;font:14px system-ui,sans-serif;z-index:9}.pbar button{font:inherit;padding:6px 14px;border-radius:6px;border:0;background:#E8930C;color:#1A1D21;font-weight:600;cursor:pointer}.pbar span{opacity:.8}' +
    '@media print{html,body{background:none;padding:0}.pbar{display:none}.sl{margin:0;box-shadow:none}}</style></head><body><div class="pbar"><button type="button" onclick="print()">Print / Save as PDF · 打印 / 另存为 PDF</button><span>Destination: “Save as PDF”. Page size is set to 16:9 automatically (Chrome / Edge). In Safari choose Landscape. · 目标选「另存为 PDF」。</span></div>' +
    pages.map(function(p){ return p.html; }).join('') +
    '<script>var SL_FIT={};' + slHash.toString() + slFit1.toString() + slFitAll.toString() + '(function(){function go(){var im=[].slice.call(document.images);(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(function(){slFitAll(document);return Promise.all(im.map(function(i){return i.complete?0:new Promise(function(r){i.onload=i.onerror=r;});}));}).then(function(){setTimeout(function(){window.focus();window.print();},350);});}if(document.readyState==="complete")go();else window.addEventListener("load",go);})();<\/script></body></html>';
}
function exportPdf(getPages, title, pre){
  var w = null; try{ w = window.open('', '_blank'); }catch(e){}
  if(w){ try{ w.document.write('<!doctype html><title>…</title><body style="font:16px system-ui;padding:40px;color:#555">Preparing PDF… 正在生成 PDF…</body>'); }catch(e){} }
  (pre || Promise.resolve()).then(function(){
    var html = pdfHtml(getPages(), title);
    if(w && !w.closed){ w.document.open(); w.document.write(html); w.document.close(); return; }
    var f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f);
    f.contentWindow.document.open(); f.contentWindow.document.write(html.replace(/<div class="pbar">[\s\S]*?<\/div>/, '')); f.contentWindow.document.close();
    setTimeout(function(){ try{ document.body.removeChild(f); }catch(e){} }, 120000);
  });
}
function pdfTitle(d){ return [d.no, (d.title || d.titleZh || 'Presentation'), d.date].filter(Boolean).join(' · ').replace(/[\\\/:*?"<>|]+/g, ' '); }
function deckPdf(deck){ exportPdf(function(){ return deckPages(deck); }, pdfTitle(deck.d), deckPrepare(deck)); }

/* ================= issue / share ================= */
function issueDeck(deck){ return loadHistory(deckNeedsHist(deck)).then(function(){ deck = getRec(deck.id) || deck; return setRec(deck, {status:'issued', snap:deckData(deck), issuedAt:new Date().toISOString()}); }); }
function imgToData(url, max){
  return new Promise(function(res){ var im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = function(){ try{ var s = Math.min(1, (max || 1280) / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.72)); }catch(e){ res(null); } };
    im.onerror = function(){ res(null); }; im.src = url; });
}
function imgToDataPng(url){ return new Promise(function(res){ var im = new Image(); im.crossOrigin = 'anonymous'; im.onload = function(){ try{ var s = Math.min(1, 600 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/png')); }catch(e){ res(null); } }; im.onerror = function(){ res(null); }; im.src = url; }); }
async function shareDeck(deck){
  if((deck.d.aud || 'owner') === 'internal'){ toast(T('Switch the audience to Owner mode before sharing.', '请先切换到业主模式再发给业主。')); return; }
  if(deck.d.status !== 'issued'){ if(!confirm(T('Sharing issues the presentation: its figures are frozen as they are now, and the Owner sees exactly this version. Continue?', '发给业主会同时定稿：数据按当前冻结，业主看到的就是这一版。继续？'))) return; await issueDeck(deck); deck = getRec(deck.id); if(!deck || deck.d.status !== 'issued' || !deck.d.snap){ toast(T('Could not issue the presentation, so nothing was shared.', '无法定稿，因此没有发出。')); return; } }
  else if(!confirm(T('Publish this issued presentation to the Owner?', '把这份已定稿的演示文稿发布给业主？'))) return;
  toast(T('Preparing the Owner copy…', '正在准备业主版本…'));
  if(STORE.ensurePubs) await STORE.ensurePubs();
  function pubEl(e){ if(!e || !okId(e.id)) return null; if(e.k === 'data') return {id:e.id, k:'data', type:e.type, ttl:e.ttl || null, x:e.x, y:e.y, w:e.w, h:e.h, cfg:{hide:clone((e.cfg && e.cfg.hide) || []), size:(e.cfg && e.cfg.size) || ''}}; return clone(e); }
  function pubPart(x){ return x ? {type:x.type, title:x.title || null, cfg:{hide:clone(x.cfg && x.cfg.hide || [])}} : undefined; }
  var data = clone(deck.d.snap || deckData(deck)), slides = (deck.d.slides || []).filter(function(s){ return !s.hidden; }).map(function(s){ var c = s.cfg || {}; return {id:s.id, type:s.type, title:s.title, box:cleanBox(s.box), cfg:{msg:c.msg || '', side:c.side || '', sub:s.type === 'section' ? (c.sub || '') : undefined, noHead:!!c.noHead, size:c.size || '', hide:clone(c.hide || []), L:pubPart(c.L), R:pubPart(c.R)}, els:(s.els || []).map(pubEl).filter(Boolean)}; });
  var keep = {}; slides.forEach(function(s){ keep[s.id] = data[s.id]; s.els.forEach(function(e){ if(e.k === 'data') keep[elKey(s, e)] = data[elKey(s, e)]; }); });
  var paths = [], bad = 0, kk = Object.keys(keep); kk.forEach(function(k){ photoLists(keep[k]).forEach(function(list){ list.forEach(function(p){ if(p.path) paths.push(p.path); }); }); });
  if(paths.length && STORE.signUrls) await STORE.signUrls(paths);
  for(var i = 0; i < kk.length; i++){ var lists = photoLists(keep[kk[i]]); for(var q = 0; q < lists.length; q++){ for(var j = 0; j < lists[q].length; j++){ var p = lists[q][j], u = p.path ? STORE.fileUrl(p.path) : null; p.src = u ? await imgToData(u, 1280) : (p.src || null); if(!p.src) bad++; delete p.path; } } }
  var th = themeOf(deck), theme = {_pub:true, color:th.color, foot:th.foot, footText:th.footText || '', conf:th.conf || '', style:th.style, agenda:!!th.agenda, logoL:null, logoR:null};
  var elPaths = []; slides.forEach(function(x){ (x.els || []).forEach(function(e){ if(e.path) elPaths.push(e.path); }); }); [th.logoL, th.logoR].forEach(function(l){ if(l && l.path) elPaths.push(l.path); });
  if(elPaths.length && STORE.signUrls) await STORE.signUrls(elPaths);
  for(var a = 0; a < slides.length; a++){ var els = slides[a].els || []; for(var b = 0; b < els.length; b++){ if(els[b].path){ var u2 = STORE.fileUrl(els[b].path); els[b].src = u2 ? await imgToData(u2, 1600) : null; delete els[b].path; } } }
  for(var lk of ['logoL', 'logoR']){ var lg = th[lk]; if(lg && (lg.path || lg.src)){ var u3 = lg.src || STORE.fileUrl(lg.path); theme[lk] = {src:u3 ? await imgToDataPng(u3) : null}; } }
  var max = 0; (STORE.pubs || []).forEach(function(p){ var mm = /PUB-(\d+)/.exec(p.no || ''); if(mm) max = Math.max(max, +mm[1]); });
  var no = 'PUB-' + String(max + 1).padStart(3, '0'), d = deck.d;
  var pub = {kind:'deck', no:no, at:new Date().toISOString(), by:(STORE.me && (STORE.me.name || STORE.me.email)) || '', note:(d.no || '') + ' · ' + (d.date || ''), deckId:deck.id, deckNo:d.no || '', title:{en:d.title || '', zh:d.titleZh || ''}, date:d.date || '', lang:d.lang || 'en', presenter:d.presenter || '', slides:slides, data:keep, theme:theme, count:slides.length};
  try{ await STORE.createPub(no, pub); toast(T('Shared with the Owner as ' + no, '已作为 ' + no + ' 发给业主') + (bad ? ' · ' + T(bad + ' photo(s) could not be included', bad + ' 张照片未能附上') : '')); }
  catch(e){ toast(errText(e)); }
}
function pubDeck(p){ return {id:p.deckId || p.id, d:{no:p.deckNo, title:p.title && p.title.en, titleZh:p.title && p.title.zh, date:p.date, lang:p.lang, aud:'owner', presenter:p.presenter, status:'issued', slides:p.slides, theme:p.theme || null}}; }
function pubPages(p){ var out = []; deckBuild(pubDeck(p), {data:p.data}).forEach(function(x){ x.pages.forEach(function(h, i){ out.push({sid:x.s.id, html:h, title:x.s.title, sub:i}); }); }); return out; }

/* Owner portal: a published presentation */
function ownerDeckView(p, pubs){
  var pages = pubPages(p), fb = (STORE.fb || []).filter(function(x){ return x.pub_id === p.id; });
  return '<div class="ph"><div><h1 class="vtitle">' + esc(T1(p.title.en, p.title.zh) || T('Presentation', '演示文稿')) + '</h1><span class="muted">' + esc(p.no + ' · ' + (p.date || '') + (p.presenter ? ' · ' + p.presenter : '')) + '</span></div><div class="pha"><select class="in" id="pubSel">' + pubs.map(function(x){ return '<option value="' + esc(x.id) + '"' + (x.id === p.id ? ' selected' : '') + '>' + esc(x.no + ' · ' + fmtTime(x.at).slice(0, 10) + ' · ' + (x.kind === 'deck' ? T1(x.title.en, x.title.zh) : (x.reg ? T1(x.reg.en, x.reg.zh) : ''))) + '</option>'; }).join('') + '</select><button type="button" class="btn pri" data-act="pubPresent">' + uic('play', 14) + ' ' + L('Present', '演示') + '</button><button type="button" class="btn" data-act="pubPdf">' + uic('pdf', 15) + ' ' + L('Download PDF', '下载 PDF') + '</button><button type="button" class="btn" data-act="pubPptx">' + uic('pdf', 15) + ' PowerPoint</button></div></div>' +
    '<div class="dk-olist">' + pages.map(function(pg, i){ var key = (p.deckNo || p.no) + ' · p.' + (i + 1), cs = fb.filter(function(x){ return x.reg_no === key; });
      return '<section class="dk-opage">' + scaled(pg.html, 'card') + '<div class="row dk-ofb"><span class="muted mono">' + (i + 1) + ' / ' + pages.length + '</span>' + cs.map(function(x){ return '<span class="chip ' + (x.status === 'open' ? 'c-amber' : 'c-green') + '" title="' + esc(x.body + (x.reply ? '\n↳ ' + x.reply : '')) + '">' + esc(x.body.slice(0, 40)) + '</span>'; }).join('') +
        '<button type="button" class="btn sm" data-act="dkOfb" data-v="' + esc(key) + '">' + L('Comment', '意见') + '</button></div>' + (S.fbFor === key ? '<div class="row"><textarea class="in" id="fbBody" rows="2" style="flex:1" placeholder="' + esc(T('Your comment on page ' + (i + 1), '对第 ' + (i + 1) + ' 页的意见')) + '"></textarea><button type="button" class="btn pri" data-act="dkOfbSend" data-v="' + esc(key) + '">' + L('Send', '提交') + '</button></div>' : '') + '</section>'; }).join('') + '</div>';
}

/* ================= links from the rest of the site ================= */
function meetingDeckStrip(rec){
  var ds = allDecks().filter(function(x){ return x.d.meeting === rec.id; });
  if(!ds.length && !canDeckEdit()) return '';
  return '<div class="dk-mstrip">' + uic('present', 14) + ' ' + ds.map(function(x){ return '<button type="button" class="lnk" data-act="dkOpen" data-v="' + esc(x.id) + '">' + esc((x.d.no || '') + ' ' + deckTitle(x.d)) + '</button> ' + (x.d.status === 'issued' ? chip('green', L('Issued', '已定稿')) : chip('amber', L('Draft', '草稿'))); }).join(' · ') + (canDeckEdit() ? ' <button type="button" class="btn sm" data-act="dkForMeeting" data-v="' + esc(rec.id) + '">' + uic('plus', 12) + ' ' + L('Presentation for this meeting', '为此会议做演示文稿') + '</button>' : '') + '</div>';
}
function recPhotoBtn(rec){
  var reg = getReg(rec.reg); if(!reg || isPrivate(reg) || !canDeckEdit()) return '';
  var n = recFiles(rec).filter(function(fx){ return /^image\//.test(fx.x.type || ''); }).length;
  return n ? '<button type="button" class="btn sm dk-recph" data-act="dkRecPhotos" data-v="' + esc(rec.id) + '">' + uic('present', 13) + ' ' + L('Add these ' + n + ' photos to a presentation', '把这 ' + n + ' 张照片加入演示文稿') + '</button>' : '';
}
function regMenuItem(reg){ return !isPrivate(reg) && canDeckEdit() && reg.d.kind !== 'decks' ? '<button type="button" data-act="dkAddView" data-v="' + esc(reg.id) + '">' + L('Add this view to a presentation…', '把当前视图加入演示文稿…') + '</button>' : ''; }
function newDeckFromMeeting(rec){
  var reg = getReg(rec.reg), date = rec.d[rolesOf(reg).start] || n2d(asOfN());
  openModal({kind:'newDeck', tpl:rec.d.mtype === 'internal' ? 'internal' : 'weekly', lang:'en', aud:rec.d.mtype === 'internal' ? 'internal' : 'owner', meeting:rec.id, date:date, title:rec.d[rolesOf(reg).title] || '', titleZh:rec.d[rolesOf(reg).title2] || ''});
}

/* ================= events ================= */
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act]'); if(!el) return;
  var act = el.dataset.act, v = el.dataset.v; if(!/^(dk|et[A-Z]|pres|pub[PD]|regHistDeck)/.test(act) || act === 'pubDel') return;
  var deck = S.deck && getRec(S.deck);
  switch(act){
    case 'dkNew': openModal({kind:'newDeck', tpl:'weekly', lang:'en', aud:'owner', date:n2d(asOfN())}); break;
    case 'dkTpl': S.modal.tpl = v; renderModal(); break;
    case 'dkCreate': (function(){ var m = S.modal; closeModal(); createDeck(m).then(function(id){ if(id){ openDeck(id); toast(T('Presentation created — the slides already show live data.', '演示文稿已创建，页面已显示实时数据。')); } }).catch(function(er){ toast(errText(er)); }); })(); break;
    case 'dkOpen': (function(){ var p = String(v).split('|'); openDeck(p[0], p[1]); })(); break;
    case 'dkBack': S.deck = null; saveUI(); renderMain(); break;
    case 'dkSlide': S.dslide = v; S.dpage = 0; S.elSel = null; renderMain(); break;
    case 'dkPage': S.dpage = +v; renderMain(); break;
    case 'dkSet': if(deck) deckEdit(deck, mk(el.dataset.k, v), true); break;
    case 'dkAddMenu': openPick('menu', {html:'<div class="plist">' + SLIDE_ORDER.map(function(t){ return '<button type="button" class="popt" data-act="dkAddType" data-v="' + t + '">' + esc(T1(SLIDES[t].en, SLIDES[t].zh)) + '</button>'; }).join('') + '</div>', w:260}, el); break;
    case 'dkAddType': (function(){ closePop(); if(!deck) return; var s = newSlide(v); addSlideTo(deck, s, S.dslide).then(function(){ S.dslide = s.id; S.dpage = 0; renderMain(); }); })(); break;
    case 'dkMove': (function(){ var sl = clone(deck.d.slides || []), i = sl.map(function(s){ return s.id; }).indexOf(S.dslide), j = i + (+v); if(i < 0 || j < 0 || j >= sl.length) return; var x = sl[i]; sl[i] = sl[j]; sl[j] = x; saveSlides(deck, sl, true); })(); break;
    case 'dkDup': (function(){ var s = slideById(deck, S.dslide); if(!s) return; var c = clone(s); c.id = uid('s'); addSlideTo(deck, c, s.id).then(function(){ S.dslide = c.id; renderMain(); }); })(); break;
    case 'dkHide': (function(){ var sl = clone(deck.d.slides || []); sl.forEach(function(s){ if(s.id === S.dslide) s.hidden = !s.hidden; }); saveSlides(deck, sl, true); })(); break;
    case 'dkDelSlide': (function(){ var sl = deck.d.slides || [], i = sl.map(function(s){ return s.id; }).indexOf(S.dslide); if(i < 0) return; var rest = sl.filter(function(s){ return s.id !== S.dslide; }); S.dslide = rest[Math.min(i, rest.length - 1)] ? rest[Math.min(i, rest.length - 1)].id : null; saveSlides(deck, clone(rest)); })(); break;
    case 'dkTheme': deckEdit(deck, {theme:Object.assign({}, deck.d.theme || {}, {color:v})}, true); break;
    case 'dkLogoDel': (function(){ var t0 = Object.assign({}, deck.d.theme || {}); t0[v] = null; deckEdit(deck, {theme:t0}, true); })(); break;
    case 'dkThemeDef': (function(){ var th = themeOf(deck); STORE.saveCfg({deckTheme:{color:th.color, style:th.style, agenda:!!th.agenda, foot:th.foot, footText:th.footText || '', conf:th.conf || '', logoL:th.logoL || null, logoR:th.logoR || null}}).then(function(){ toast(T('New presentations will use this look', '新文稿将使用此样式')); }).catch(function(er){ toast(errText(er)); }); })(); break;
    case 'dkUndo': deckUndo(false); break;
    case 'dkRedo': deckUndo(true); break;
    case 'dkUnhide': (function(){ var sl = clone(deck.d.slides || []); sl.forEach(function(x0){ if(x0.id !== S.dslide) return; var x = el.dataset.hp ? getPath(x0, el.dataset.hp) : x0; if(!x || !x.cfg) return; if(v === '*'){ x.cfg.hide = []; x.cfg.hideLab = {}; } else { x.cfg.hide = (x.cfg.hide || []).filter(function(k){ return k !== v; }); if(x.cfg.hideLab) delete x.cfg.hideLab[v]; } }); saveSlides(deck, sl, true); })(); break;
    case 'dkColMv': (function(){ var sl = clone(deck.d.slides || []), s00 = sl.filter(function(x){ return x.id === S.dslide; })[0]; if(!s00) return; var s0 = el.dataset.hp ? getPath(s00, el.dataset.hp) : s00; if(!s0) return; var r0 = getReg(s0.cfg.reg), cols = s0.cfg.cols && s0.cfg.cols.length ? s0.cfg.cols.slice() : (r0 ? defCols(r0) : []), i = cols.indexOf(v), j = i + (+el.dataset.d); if(i < 0 || j < 0 || j >= cols.length) return; cols[i] = cols[j]; cols[j] = v; s0.cfg.cols = cols; saveSlides(deck, sl, true); })(); break;
    case 'dkPickAdd': case 'dkPickDel': case 'dkPickMv': (function(){ var sl = clone(deck.d.slides || []), s0 = sl.filter(function(x){ return x.id === S.dslide; })[0]; if(!s0) return; var p = (s0.cfg.picks || []).slice(), i = p.indexOf(v);
      if(act === 'dkPickAdd' && i < 0) p.push(v); if(act === 'dkPickDel' && i >= 0) p.splice(i, 1); if(act === 'dkPickMv'){ var j = i + (+el.dataset.d); if(i < 0 || j < 0 || j >= p.length) return; p[i] = p[j]; p[j] = v; } s0.cfg.picks = p; saveSlides(deck, sl, true); })(); break;
    case 'dkFreeze': (function(){ var s0 = slideById(deck, S.dslide), f = s0 && freezeSlide(deck, s0); if(!f){ toast(T('This slide has no table to convert.', '此页没有可转换的表格。')); return; } saveSlides(deck, (deck.d.slides || []).map(function(x){ return x.id === f.id ? f : x; })); })(); break;
    case 'dkUnfreeze': (function(){ var s0 = slideById(deck, S.dslide); if(!s0 || !s0.cfg.orig) return; if(!confirm(T('Go back to the live slide? Your typed changes in this table are dropped (Undo brings them back).', '恢复为实时数据页？表格里手动输入的内容会被放弃（可用撤销找回）。'))) return; var o = clone(s0); o.type = s0.cfg.orig.type; o.cfg = Object.assign(clone(s0.cfg.orig.cfg || {}), {msg:s0.cfg.msg, side:s0.cfg.side}); saveSlides(deck, (deck.d.slides || []).map(function(x){ return x.id === o.id ? o : x; })); })(); break;
    case 'etAdd': (function(){ var sl = clone(deck.d.slides || []), s0 = sl.filter(function(x){ return x.id === S.dslide; })[0]; if(!s0) return; var c0 = s0.cfg; if(v === 'row') c0.rows.push(c0.head.map(function(){ return {t:''}; })); else { c0.head.push(T1('Column', '列')); c0.rows.forEach(function(r){ r.push({t:''}); }); } saveSlides(deck, sl, true); })(); break;
    case 'dkCopyTo': (function(){ var ds = allDecks().filter(function(x){ return x.d.status !== 'issued'; }); openPick('menu', {html:'<div class="plist">' + ds.map(function(x){ return '<button type="button" class="popt" data-act="dkCopyGo" data-v="' + esc(x.id) + '">' + esc((x.d.no || '') + ' · ' + (x.d.date || '') + ' · ' + deckTitle(x.d)) + (x.id === deck.id ? ' <span class="muted">(' + esc(T('this one', '本文稿')) + ')</span>' : '') + '</button>'; }).join('') + '</div>', w:340}, el); })(); break;
    case 'dkCopyGo': (function(){ closePop(); var to = getRec(v), s0 = slideById(deck, S.dslide); if(!to || !s0) return; var c0 = clone(s0); c0.id = uid('s'); (c0.els || []).forEach(function(e){ e.id = uid('e'); }); addSlideTo(to, c0, to.id === deck.id ? s0.id : null).then(function(){ toast(T('Copied to ', '已复制到 ') + (to.d.no || ''), {act:'dkOpen', v:to.id + '|' + c0.id, label:T('Open', '打开')}); }); })(); break;
    case 'dkAddMsg': case 'dkAddSide': (function(){ var k = act === 'dkAddMsg' ? 'msg' : 'side', sl = clone(deck.d.slides || []); sl.forEach(function(x){ if(x.id === S.dslide){ x.cfg = x.cfg || {}; x.cfg[k] = k === 'msg' ? T1('Key message', '重点结论') : T1('Comment', '说明'); } }); S.dkFocus = 'cfg.' + k; saveSlides(deck, sl, true); })(); break;
    case 'dkClearFx': (function(){ var sl = clone(deck.d.slides || []); sl.forEach(function(s0){ var s = el.dataset.hp ? getPath(s0, el.dataset.hp) : s0; if(s0.id === S.dslide && s && s.cfg.filter){ s.cfg.filter.fx = {}; s.cfg.filter.q = ''; s.cfg.filter.from = ''; s.cfg.filter.to = ''; } }); saveSlides(deck, sl, true); })(); break;
    case 'dkPresent': (function(){ var d0 = getRec(v); if(d0) presentDeck(d0); })(); break;
    case 'dkPresentHere': if(deck) presentDeck(deck, S.dslide); break;
    case 'dkPdf': (function(){ var d0 = getRec(v); if(d0) deckPdf(d0); })(); break;
    case 'dkIssue': if(deck && confirm(T('Issue this presentation? The figures are frozen as they are now so the deck always shows what was presented. You can go back to draft later.', '定稿此演示文稿？数据会按当前冻结，以后打开仍是汇报时的内容。之后可以退回草稿。'))) issueDeck(deck).then(function(){ toast(T('Issued — figures frozen', '已定稿，数据已冻结'), {act:'quickUndo', label:T('Undo', '撤销')}); }).catch(function(er){ console.error(er); toast(T('Could not issue: ', '无法定稿：') + (er && er.message || er)); }); break;
    case 'dkReopen': if(deck && confirm(T('Back to draft? The slides show live data again (the frozen figures are kept in the Change log).', '退回草稿？页面将重新显示实时数据（冻结的数据保留在修改记录中）。'))) setRec(deck, {status:'draft', snap:null, issuedAt:null}); break;
    case 'dkShare': if(deck) shareDeck(deck); break;
    case 'dkCopy': (function(){ var src = getRec(v); if(!src) return; var d = clone(src.d), reg = getReg(src.reg); delete d.snap; delete d.issuedAt; d.status = 'draft'; d.no = nextNo(reg); var n0 = d2n(d.date); d.date = n0 != null ? n2d(n0 + 7) : n2d(asOfN());
      var om = d.meeting && getRec(d.meeting), nd = d2n(d.date); d.meeting = ''; if(om){ var mr = getReg(om.reg), cand = recsOf(mr.id).filter(function(r){ var x = d2n(r.d[rolesOf(mr).start]); return r.id !== om.id && x != null && Math.abs(x - nd) <= 3 && r.d.mtype === om.d.mtype; })[0]; if(cand) d.meeting = cand.id; }
      d.slides = (d.slides || []).map(function(s){ s.id = uid('s'); return s; });
      var id = uid('r'); STORE.createRec({id:id, reg:reg.id, d:d}).then(function(){ openDeck(id); toast(T('Copied as ' + d.no + ' for ' + d.date + ' — data is live again.', '已复制为 ' + d.no + '（' + d.date + '），数据恢复实时。')); }).catch(function(er){ toast(errText(er)); }); })(); break;
    case 'dkDel': if(deck && confirm(T('Delete this presentation? You can restore it from the Change log.', '删除此演示文稿？可在修改记录中恢复。'))){ var id0 = deck.id; S.deck = null; STORE.deleteRec(id0).then(function(){ toast(T('Deleted — restore it from the Change log', '已删除，可在修改记录中恢复')); }).catch(function(er){ toast(errText(er)); }); renderAll(); } break;
    case 'regHistDeck': S.act = {reg:deckReg().id, who:'', type:''}; goPage('activity'); break;
    case 'dkAddView': (function(){ var reg = getReg(v); if(!reg) return; var c = viewCands(reg); el.closest('details') && el.closest('details').removeAttribute('open'); openModal({kind:'addToDeck', cands:c.cands, pick:c.pick}); })(); break;
    case 'dkRecPhotos': (function(){ var r = getRec(v), reg = r && getReg(r.reg); if(!reg) return; var picks = []; recFiles(r).forEach(function(fx){ if(/^image\//.test(fx.x.type || '')) picks.push({rec:r.id, path:fx.x.path}); });
      var t = {en:'Photos – ' + (recNo(reg, r) ? recNo(reg, r) + ' ' : '') + (r.d[rolesOf(reg).title] || ''), zh:'照片 – ' + (recNo(reg, r) ? recNo(reg, r) + ' ' : '') + (r.d[rolesOf(reg).title2] || r.d[rolesOf(reg).title] || '')};
      openModal({kind:'addToDeck', cands:[{key:'photos', s:newSlide('photos', {mode:'pick', picks:picks, layout:picks.length === 1 ? '1' : picks.length <= 4 ? '2x2' : '3x2'}, t), note:T(picks.length + ' photo(s) of ' + recLabel(r) + ' on one slide (more pages if needed).', '把 ' + recLabel(r) + ' 的 ' + picks.length + ' 张照片放在一页（需要时自动分页）。')}], pick:0}); })(); break;
    case 'dkCand': S.modal.pick = +v; renderModal(); break;
    case 'dkAddGo': (function(){ var m = S.modal, sel = ($('#atdDeck') || {}).value || m.deck, c = m.cands[m.pick || 0]; if(!c) return;
      if(sel === '__new'){ openModal({kind:'newDeck', tpl:'blank', lang:'en', aud:'owner', date:n2d(asOfN()), slide:c.s}); return; }
      var d0 = getRec(sel); if(!d0) return; closeModal(); addSlideTo(d0, c.s).then(function(){ toast(T('Slide added to ', '已添加到 ') + (d0.d.no || ''), {act:'dkOpen', v:d0.id + '|' + c.s.id, label:T('Open', '打开')}); }); })(); break;
    case 'dkForMeeting': (function(){ var r = getRec(v); if(r){ S.open = null; renderDrawer(); newDeckFromMeeting(r); } })(); break;
    case 'pubPresent': (function(){ var p = curPub(); if(p) startPresent(pubPages(p), 0, T1(p.title.en, p.title.zh)); })(); break;
    case 'pubPdf': (function(){ var p = curPub(); if(p) exportPdf(function(){ return pubPages(p); }, [p.deckNo || p.no, T1(p.title.en, p.title.zh), p.date].filter(Boolean).join(' · ')); })(); break;
    case 'dkOfb': S.fbFor = S.fbFor === v ? null : v; renderAll(); setTimeout(function(){ var b = $('#fbBody'); if(b) b.focus(); }, 30); break;
    case 'dkOfbSend': (function(){ var body = (($('#fbBody') || {}).value || '').trim(), p = curPub(); if(!body || !p) return; STORE.addFeedback({pub_id:p.id, item_id:p.deckId || p.id, reg_no:v, body:body}).then(function(){ S.fbFor = null; toast(T('Sent', '已提交')); renderAll(); }).catch(function(er){ toast(errText(er)); }); })(); break;
  }
});
function curPub(){ var pubs = STORE.pubs || []; return pubs.filter(function(x){ return x.id === S.pubSel; })[0] || pubs[0] || null; }

/* slide properties & deck bar (save on change, so typing never fights re-renders) */
document.addEventListener('change', function(e){
  var el = e.target, deck = S.deck && getRec(S.deck), d;
  if((d = el.dataset.nd) && S.modal && S.modal.kind === 'newDeck'){ var m = S.modal; m[d] = el.value;
    if(d === 'meeting' && el.value){ var r = getRec(el.value), rg = r && getReg(r.reg); if(r){ m.date = r.d[rolesOf(rg).start] || m.date; if(!m.title) m.title = r.d[rolesOf(rg).title] || ''; if(!m.titleZh) m.titleZh = r.d[rolesOf(rg).title2] || ''; renderModal(); } }
    return; }
  if(!deck || !isDeckRec(deck)) return;
  if((d = el.dataset.th)){ var t1 = Object.assign({}, deck.d.theme || {}); t1[d] = el.type === 'checkbox' ? el.checked : el.value;
    /* the agenda bar pushes the title down 28 px: move hand-placed blocks with it so they don't run into the title */
    if(d === 'agenda' && !!t1.agenda !== !!themeOf(deck).agenda && themeOf(deck).style === 'sheet'){ var dy = t1.agenda ? 28 : -28, sl0 = clone(deck.d.slides || []); var BOT = 624; function sh(b){ var was = b.y + b.h <= BOT + 1; b.y += dy; if(dy > 0 && was && b.y + b.h > BOT) b.h = Math.max(60, BOT - b.y); } sl0.forEach(function(x){ if(x.type === 'cover') return; if(x.box) sh(x.box); (x.els || []).forEach(function(e){ if(e.k === 'arrow' || e.k === 'line'){ if(e.y > 40) e.y += dy; return; } if(e.y + Math.max(0, e.h) > 40) sh(e); }); }); deckEdit(deck, {theme:t1, slides:sl0}, true); return; }
    deckEdit(deck, {theme:t1}, true); return; }
  if((d = el.dataset.logo) && el.files && el.files[0]){ var f0 = el.files[0], key0 = d; el.value = ''; toast(T('Uploading logo…', '正在上传 Logo…')); shrinkImage(f0, 800).then(function(f){ return STORE.upload(f, deck.reg, deck.id); }).then(function(up){ var dk = getRec(deck.id), t2 = Object.assign({}, dk.d.theme || {}); t2[key0] = {path:up.path}; deckEdit(dk, {theme:t2}, true); }).catch(function(er){ toast(errText(er)); }); return; }
  if((d = el.dataset.dk)){ var p = mk(d, el.value); if(d === 'meeting' && el.value && !deck.d.date){ var mr = getRec(el.value); if(mr) p.date = mr.d[rolesOf(getReg(mr.reg)).start] || ''; } deckEdit(deck, p, true); return; }
  if((d = el.dataset.sp)){
    var slides = clone(deck.d.slides || []), s = slides.filter(function(x){ return x.id === S.dslide; })[0]; if(!s) return;
    var obj = s, rel = d, mm = /^cfg\.(L|R)\.(.+)$/.exec(d); if(mm && s.type === 'combo'){ obj = s.cfg[mm[1]] = s.cfg[mm[1]] || {type:'text', cfg:{}}; rel = mm[2]; }
    var me = /^els#([^.]+)\.(.+)$/.exec(d); if(me){ obj = (s.els || []).filter(function(x){ return x.id === me[1]; })[0]; rel = me[2]; if(!obj) return; }
    var t = el.dataset.t, v;
    if(t === 'bool') v = el.checked;
    else if(t === 'num') v = +el.value;
    else if(t === 'px'){ v = Math.round(+el.value); if(!isFinite(v)) return; }
    else if(t === 'list' || t === 'pick'){ var cur = (getPath(obj, rel) || []).slice(); if(rel === 'cfg.cols' && !cur.length){ var r0 = getReg(obj.cfg.reg); cur = r0 ? defCols(r0) : []; } var item = t === 'pick' ? JSON.parse(el.dataset.v) : el.dataset.v, ix = -1; cur.forEach(function(x, i){ if(same(t === 'pick' ? x.path : x, t === 'pick' ? item.path : item)) ix = i; }); if(el.checked && ix < 0) cur.push(item); if(!el.checked && ix >= 0) cur.splice(ix, 1); v = cur; }
    else v = el.value;
    if(rel === 'type'){ obj.type = v; obj.cfg = SLIDES[v] ? SLIDES[v].def() : {}; if(obj.k === 'data') obj.ttl = {en:SLIDES[v].t[0], zh:SLIDES[v].t[1]}; else obj.title = {en:SLIDES[v].t[0], zh:SLIDES[v].t[1]}; saveSlides(deck, slides, true); return; }
    setPath(obj, rel, v);
    if(rel === 'cfg.reg'){ var nr = getReg(v); if(obj.type === 'table'){ obj.cfg.cols = nr ? defCols(nr) : []; obj.cfg.filter = {open:!!(obj.cfg.filter && obj.cfg.filter.open)}; obj.cfg.sort = null; obj.cfg.picks = []; if(obj === s && nr && (!s.title || !s.title.en || s.title.en === 'Register')) s.title = {en:nr.d.en || '', zh:nr.d.zh || ''}; } if(obj.type === 'matrix'){ obj.cfg.row = ''; obj.cfg.col = ''; } if(obj.type === 'breakdown') obj.cfg.by = ''; if(obj.type === 'actions') obj.cfg.meeting = 'latest'; obj.cfg.hide = []; }
    saveSlides(deck, slides, true);
  }
});

/* inline editing on the slide preview: text marked data-ed becomes editable in place (only in the editor, only for drafts) */
function enableInline(){
  var deck = S.deck && getRec(S.deck); if(S.page !== 'decks' || !deck || !isDeckRec(deck) || deck.d.status === 'issued' || !canDeckEdit()) return;
  $$('.dk-stage [data-ed]').forEach(function(el){ try{ el.contentEditable = 'plaintext-only'; }catch(e){ el.contentEditable = 'true'; } if(el.contentEditable !== 'plaintext-only') el.contentEditable = 'true'; el.spellcheck = false; el.setAttribute('data-fk', 'ed:' + S.dslide + ':' + el.dataset.ed); });
  drawSel();
  if(S.dkFocus){ var f = $('.dk-stage [data-ed="' + S.dkFocus + '"]'); S.dkFocus = null; if(f){ f.focus(); try{ var r = document.createRange(); r.selectNodeContents(f); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }catch(e){} } }
}
function edRaw(deck, path){ if(path.indexOf('deck.') === 0) return deck.d[path.slice(5)] || ''; var s = slideById(deck, S.dslide); return s ? (getPath(s, path) || '') : ''; }
document.addEventListener('focusin', function(e){
  var el = e.target; if(!el || !el.dataset || !el.dataset.ed || !el.isContentEditable) return;
  var deck = S.deck && getRec(S.deck); if(!deck) return;
  if(el.dataset.raw){ var raw = edRaw(deck, el.dataset.ed); el.dataset.orig = raw; el.classList.add('sl-raw'); el.textContent = raw; }
  else el.dataset.orig = el.textContent;
});
document.addEventListener('keydown', function(e){
  var el = e.target; if(!el || !el.dataset || !el.dataset.ed || !el.isContentEditable) return;
  if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); el.dataset.cancel = '1'; el.blur(); return; }
  if(e.key === 'Enter' && (!el.dataset.raw || e.metaKey || e.ctrlKey)){ e.preventDefault(); el.blur(); }
}, true);
document.addEventListener('focusout', function(e){
  var el = e.target; if(S.inRender || !el || !el.dataset || !el.dataset.ed || !el.isContentEditable) return;
  RG.parts = {};   // the slide was typed into: redraw it from the data even if its HTML string is unchanged
  var deck = S.deck && getRec(S.deck), path = el.dataset.ed, cancel = el.dataset.cancel; delete el.dataset.cancel;
  if(!deck || deck.d.status === 'issued'){ return; }
  var v = el.innerText.replace(/\u00a0/g, ' '); if(!el.dataset.raw) v = v.replace(/\s*\n\s*/g, ' ').trim(); else v = v.replace(/\s+$/, '');
  if(cancel || v === (el.dataset.orig || '')){ if(el.dataset.raw || cancel) setTimeout(renderMain, 0); return; }
  if(path.indexOf('deck.') === 0){ deckEdit(deck, mk(path.slice(5), v), true); return; }
  var sl = clone(deck.d.slides || []), s = sl.filter(function(x){ return x.id === S.dslide; })[0]; if(!s) return;
  setPath(s, path, v); saveSlides(deck, sl, true);
});

/* editor: drag thumbnails to reorder; ↑/↓ to move between slides */
document.addEventListener('toggle', function(e){ var t = e.target; if(t && t.dataset && t.dataset.dkbar){ var o = t.open; if(S.dkBar !== o){ S.dkBar = o; var sl = t.querySelector('summary .lnk'); if(sl) sl.innerHTML = o ? L('Hide', '收起') : L('Edit', '编辑'); } } }, true);
document.addEventListener('dragstart', function(e){ var t = e.target.closest && e.target.closest('[data-sdrag]'); if(!t) return; S.sdrag = t.dataset.sdrag; e.dataTransfer.setData('text/plain', 'slide'); e.dataTransfer.effectAllowed = 'move'; t.classList.add('dragging'); });
document.addEventListener('dragover', function(e){ if(!S.sdrag) return; var t = e.target.closest && e.target.closest('.dk-t'); if(!t) return; e.preventDefault(); var r = t.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2; $$('.dk-t.dropb,.dk-t.dropa').forEach(function(x){ x.classList.remove('dropb', 'dropa'); }); t.classList.add(after ? 'dropa' : 'dropb'); });
document.addEventListener('drop', function(e){ if(!S.sdrag) return; var t = e.target.closest && e.target.closest('.dk-t'), deck = S.deck && getRec(S.deck); if(!t || !deck) return; e.preventDefault(); var after = t.classList.contains('dropa'), to = t.dataset.v, from = S.sdrag; S.sdrag = null; if(from === to) { renderMain(); return; }
  var sl = clone(deck.d.slides || []), x = sl.filter(function(s){ return s.id === from; })[0]; sl = sl.filter(function(s){ return s.id !== from; }); var j = sl.map(function(s){ return s.id; }).indexOf(to); sl.splice(after ? j + 1 : j, 0, x); saveSlides(deck, sl, true); });
document.addEventListener('dragend', function(){ if(!S.sdrag && !$('.dk-t.dragging')) return; S.sdrag = null; $$('.dk-t').forEach(function(x){ x.classList.remove('dragging', 'dropa', 'dropb'); }); });
document.addEventListener('keydown', function(e){
  if(S.page !== 'decks' || !S.deck || S.present || S.modal || S.pop || S.open) return;
  var tg = e.target; if(tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable)) return;
  if((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')){ e.preventDefault(); deckUndo(e.shiftKey); return; }
  if((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y')){ e.preventDefault(); deckUndo(true); return; }
  if(e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  var deck = getRec(S.deck); if(!deck) return; var ids = (deck.d.slides || []).map(function(s){ return s.id; }), i = ids.indexOf(S.dslide), j = clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, ids.length - 1);
  if(j !== i){ e.preventDefault(); S.dslide = ids[j]; S.dpage = 0; renderMain(); var on = $('.dk-t.on'); if(on && on.scrollIntoView) on.scrollIntoView({block:'nearest'}); }
});
window.addEventListener('resize', function(){ clearTimeout(window.__dkrz); window.__dkrz = setTimeout(function(){ fitSlides(); if(S.present) renderPresent(); }, 120); });
if(window.ResizeObserver){ (function(){ var ro = new ResizeObserver(function(){ fitSlides(); }); var t = setInterval(function(){ var m = document.getElementById('main'); if(m){ ro.observe(m); clearInterval(t); } }, 50); })(); }

/* hover a row / column / bar / photo / tile on the editor preview → × leaves it out of this slide only */
function dkxBtn(){ var b = document.getElementById('dkx'); if(!b){ b = document.createElement('button'); b.id = 'dkx'; b.type = 'button'; b.hidden = true; b.innerHTML = '×'; b.title = T('Leave out of this slide', '在此页隐藏'); document.body.appendChild(b); } return b; }
function dkxHide(){ var b = document.getElementById('dkx'); if(b) b.hidden = true; $$('.dk-hov').forEach(function(x){ x.classList.remove('dk-hov'); }); S.dkxEl = null; }
document.addEventListener('mouseover', function(e){
  if(S.page !== 'decks' || !edOk() || ELD) return;
  if(e.target.closest && e.target.closest('#dkx')) return;
  var t = e.target.closest && e.target.closest('.dk-stage [data-hk]');
  if(!t){ if(S.dkxEl) dkxHide(); return; }
  if(t === S.dkxEl) return;
  dkxHide(); S.dkxEl = t; t.classList.add('dk-hov');
  var r = t.getBoundingClientRect(), b = dkxBtn(), isCol = /^(c|x):/.test(t.dataset.hk);
  b.style.left = Math.min(window.innerWidth - 30, r.right - 12) + 'px'; b.style.top = Math.max(4, (isCol ? r.top - 14 : r.top + Math.min(r.height / 2, 20) - 11)) + 'px';
  b.dataset.hk = t.dataset.hk; b.dataset.hl = t.dataset.hl || ''; var hp = t.closest('[data-hp]'); b.dataset.hp = hp ? hp.dataset.hp : ''; b.hidden = false;
});
document.addEventListener('click', function(e){
  var b = e.target.closest && e.target.closest('#dkx'); if(!b) return;
  var key = b.dataset.hk, lab = b.dataset.hl, base = b.dataset.hp, deck = curDeck(); dkxHide(); if(!deck || !key) return;
  var sl = clone(deck.d.slides || []), s0 = sl.filter(function(x){ return x.id === S.dslide; })[0]; if(!s0) return;
  var obj = base ? getPath(s0, base) : s0; if(!obj) return; var c = obj.cfg = obj.cfg || {}, k2 = key.slice(2);
  if(key.indexOf('c:') === 0 && obj.type === 'table'){ var r0 = getReg(c.reg); c.cols = (c.cols && c.cols.length ? c.cols : (r0 ? defCols(r0) : [])).filter(function(x){ return x !== k2; }); }
  else if(key.indexOf('k:') === 0){ c.regs = (c.regs || []).filter(function(x){ return x !== k2; }); }
  else if(key.indexOf('e:') === 0){ c.rows.splice(+k2, 1); }
  else if(key.indexOf('x:') === 0){ if(c.head.length < 2) return; c.head.splice(+k2, 1); c.rows.forEach(function(r){ r.splice(+k2, 1); }); }
  else { c.hide = (c.hide || []).concat([key]); c.hideLab = Object.assign({}, c.hideLab || {}); c.hideLab[key] = lab || k2; }
  saveSlides(deck, sl, true);
  var gone = /^(e|x):/.test(key);
  toast(gone ? T('Deleted from the table', '已从表格删除') : T('Left out of this slide — Undo or restore it in the panel on the right', '已在此页隐藏，可撤销或在右侧恢复'), {act:'dkUndo', label:T('Undo', '撤销')});
});
document.addEventListener('input', function(e){ if(e.target && e.target.id === 'dkPickQ'){ S.dkPickQ = e.target.value; clearTimeout(window.__dkpq); window.__dkpq = setTimeout(renderMain, 200); } });
