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
function getPath(o, p){ return p.split('.').reduce(function(a, k){ return a == null ? undefined : a[k]; }, o); }
function setPath(o, p, v){ var ks = p.split('.'), last = ks.pop(), t = o; ks.forEach(function(k){ if(t[k] == null || typeof t[k] !== 'object') t[k] = {}; t = t[k]; }); t[last] = v; }
function saveSlides(deck, slides, quiet){ return setRec(deck, {slides:slides}, quiet ? {silent:true} : undefined); }
function slideById(deck, id){ return (deck.d.slides || []).filter(function(s){ return s.id === id; })[0] || null; }
function photoPaths(built){ var out = []; built.forEach(function(x){ if(x.data && x.data.photos) x.data.photos.forEach(function(p){ if(p.path && !p.src) out.push(p.path); }); }); return out; }
function signFor(built){ return STORE && STORE.signUrls ? STORE.signUrls(photoPaths(built)) : Promise.resolve(); }
function openDeck(id, sid){ S.page = 'decks'; if(S.deck !== id) S.dkBar = null; S.deck = id; S.dslide = sid || null; S.dpage = 0; S.open = null; S.sideOpen = false; closePop(); saveUI(); renderAll(); var m = $('#main'); if(m) m.scrollTop = 0; }
function scaled(html, cls){ return '<div class="dk-fit' + (cls ? ' ' + cls : '') + '"><div class="dk-sc">' + html + '</div></div>'; }
function fitSlides(){ $$('.dk-fit').forEach(function(el){ var w = el.clientWidth, inner = el.firstElementChild; if(inner && w) inner.style.transform = 'scale(' + (w / 1280) + ')'; }); }

/* ---------------- templates ---------------- */
var DECK_TPLS = [
  ['weekly','Weekly Owner meeting','业主周例会','Cover · key figures · block matrix · 3-week look-ahead · document status · documents due · punch list · photos · open actions · decisions','封面 · 关键数据 · 区域矩阵 · 三周计划 · 文件状态 · 到期文件 · 尾项 · 照片 · 待办 · 决策事项'],
  ['internal','Internal progress review','内部进度检查','Same data, focused on what is late: overdue documents, open punch items and actions','同样的数据，重点看滞后：逾期文件、未关闭尾项和待办'],
  ['blank','Blank','空白','Only a cover — add the slides you need','只有封面，自行添加需要的页面']
];
function tplSlides(tpl){
  var site = tplReg('site'), doc = tplReg('turnover'), pun = tplReg('punch'), mtg = tplReg('meetings'), A = [newSlide('cover')];
  if(tpl === 'blank') return A;
  A.push(newSlide('kpi'));
  if(site) A.push(newSlide('matrix', {reg:site}, {en:'Site works – progress by block', zh:'现场施工 – 分区进度'}));
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
  if(!decks.length) return h + '<div class="card empty dk-none"><div class="dk-none-art">' + scaled(withLang(S.lang === 'zh' ? 'zh' : 'en', function(){ return wrapPage({d:{}}, {type:'cover'}, SLIDE_RENDER.cover({title:{en:'Weekly progress meeting', zh:'周进度汇报会'}, project:{en:cfg().projectEn, zh:cfg().projectZh}, date:n2d(asOfN()), presenter:'', sub:''})[0], 0, 1, 1, 1, {proj:cfg().projectEn}); })) + '</div><p>' + L('No presentations yet. Start from the weekly Owner-meeting template: it fills itself from site works, turnover documents, punch list, photos and meeting actions.', '还没有演示文稿。可从「业主周例会」模板开始：内容会自动取自现场施工、移交文件、尾项、照片和会议待办。') + '</p>' + (ed ? '<button type="button" class="btn pri" data-act="dkNew">' + uic('plus', 14) + ' ' + L('New presentation', '新建演示文稿') + '</button>' : '') + '</div>';
  return h + '<div class="dk-list">' + decks.map(function(deck){
    var first = (deck.d.slides || []).filter(function(s){ return !s.hidden; })[0], thumb = '';
    if(first){ var b = deckBuild({id:deck.id, d:Object.assign({}, deck.d, {slides:[first]})}); thumb = b[0] ? b[0].pages[0] : ''; }
    var m = deck.d.meeting && getRec(deck.d.meeting);
    return '<article class="card dk-card"><button type="button" class="dk-cthumb" data-act="dkOpen" data-v="' + esc(deck.id) + '" aria-label="' + esc(T('Open', '打开')) + '">' + scaled(thumb) + '</button><div class="dk-cbody"><div class="dk-cno mono muted">' + esc(deck.d.no || '') + ' · ' + esc(deck.d.date || '') + '</div><h3><button type="button" class="lnk" data-act="dkOpen" data-v="' + esc(deck.id) + '">' + esc(deckTitle(deck.d)) + '</button></h3><div class="dk-cchips">' + deckChips(deck) + '</div>' +
      (m ? '<div class="note">' + uic('link', 12) + ' <button type="button" class="lnk" data-act="openRec" data-id="' + esc(m.id) + '">' + esc(recLabel(m)) + '</button></div>' : '') +
      '<div class="row dk-cact"><button type="button" class="btn sm pri" data-act="dkPresent" data-v="' + esc(deck.id) + '">' + uic('play', 13) + ' ' + L('Present', '演示') + '</button><button type="button" class="btn sm" data-act="dkPdf" data-v="' + esc(deck.id) + '">' + uic('pdf', 14) + ' PDF</button>' + (ed ? '<button type="button" class="btn sm" data-act="dkCopy" data-v="' + esc(deck.id) + '">' + uic('copy', 13) + ' ' + L('Copy for next week', '复制为下周') + '</button>' : '') + '</div></div></article>';
  }).join('') + '</div>';
}

function viewDeckEditor(deck){
  var d = deck.d, issued = d.status === 'issued', ed = canDeckEdit() && !issued, built = deckBuild(deck, {all:true});
  var sel = built.filter(function(x){ return x.s.id === S.dslide; })[0] || built.filter(function(x){ return !x.s.hidden; })[0] || built[0];
  S.dslide = sel ? sel.s.id : null;
  var pi = sel ? clamp(S.dpage || 0, 0, sel.pages.length - 1) : 0; S.dpage = pi;
  var fbs = ((STORE && STORE.fb) || []).filter(function(x){ return x.item_id === deck.id; }), fbOpen = fbs.filter(function(x){ return x.status === 'open'; }).length;
  var h = '<button type="button" class="lnk dk-back" data-act="dkBack">' + uic('left', 13) + ' ' + L('All presentations', '全部演示文稿') + '</button><div class="ph dk-ph"><div class="dk-title"><h1 class="vtitle">' + esc(deckTitle(d)) + '</h1><div class="dk-cchips"><span class="muted mono">' + esc(d.no || '') + '</span> ' + deckChips(deck) + '</div></div>' +
    '<div class="pha"><button type="button" class="btn pri" data-act="dkPresent" data-v="' + esc(deck.id) + '">' + uic('play', 14) + ' ' + L('Present', '演示') + '</button><button type="button" class="btn" data-act="dkPdf" data-v="' + esc(deck.id) + '">' + uic('pdf', 15) + ' ' + L('Export PDF', '导出 PDF') + '</button>' +
    (canDeckEdit() ? (issued ? '<button type="button" class="btn" data-act="dkReopen">' + L('Back to draft', '退回草稿') + '</button>' : '<button type="button" class="btn" data-act="dkIssue">' + uic('lock', 14) + ' ' + L('Issue', '定稿') + '</button>') +
      '<button type="button" class="btn" data-act="dkShare"' + ((d.aud || 'owner') === 'internal' ? ' disabled title="' + esc(T('Internal decks cannot be shared with the Owner. Switch the audience to Owner mode first.', '内部演示文稿不能发给业主，请先切换到业主模式。')) + '"' : '') + '>' + uic('send', 14) + ' ' + L('Share with Owner', '发给业主') + '</button>' +
      '<details class="menu"><summary class="btn">⋯</summary><div class="pop pop-r"><button type="button" data-act="dkCopy" data-v="' + esc(deck.id) + '">' + L('Copy for next week', '复制为下周') + '</button><button type="button" data-act="regHistDeck">' + L('Change log of this deck', '此文稿修改记录') + '</button><button type="button" data-act="dkDel">' + L('Delete presentation', '删除演示文稿') + '</button></div></details>' : '') + '</div></div>';
  if(issued) h += '<div class="banner dk-issued">' + uic('lock', 14) + ' ' + L('Issued ' + fmtTime(d.issuedAt) + ' — the figures are frozen as presented. “Back to draft” makes them live again; “Copy for next week” starts a new draft.', '定稿于 ' + fmtTime(d.issuedAt) + '：数据已按汇报时冻结。「退回草稿」可恢复实时数据；「复制为下周」可开始新的草稿。') + '</div>';
  h += deckBar(deck, ed);
  h += '<div class="dk-ed"><aside class="dk-th" aria-label="' + esc(T('Slides', '页面')) + '">' + built.map(function(x){
      return '<div class="dk-t' + (x.s.id === S.dslide ? ' on' : '') + (x.s.hidden ? ' hid' : '') + '" data-act="dkSlide" data-v="' + esc(x.s.id) + '"' + (ed ? ' draggable="true" data-sdrag="' + esc(x.s.id) + '"' : '') + ' role="button" tabindex="0"><span class="dk-tn mono">' + (x.s.hidden ? uic('hide', 12) : x.first) + (x.pages.length > 1 && !x.s.hidden ? '<small>+' + (x.pages.length - 1) + '</small>' : '') + '</span>' + scaled(x.pages[0], 'dk-tw') + '<span class="dk-tl">' + esc(T1(SLIDES[x.s.type].en, SLIDES[x.s.type].zh)) + '</span></div>'; }).join('') +
    (ed ? '<button type="button" class="btn dk-add" data-act="dkAddMenu">' + uic('plus', 14) + ' ' + L('Add slide', '添加页面') + '</button>' : '') + '</aside>';
  h += '<section class="dk-pv">' + (sel ? (sel.pages.length > 1 ? '<div class="seg dk-pg">' + sel.pages.map(function(_, i){ return '<button type="button" data-act="dkPage" data-v="' + i + '" aria-pressed="' + (i === pi) + '">' + L('Page ' + (i + 1), '第 ' + (i + 1) + ' 页') + '</button>'; }).join('') + '</div><p class="note dk-pgn">' + L('Long content continues automatically on ' + sel.pages.length + ' pages.', '内容较多，自动分为 ' + sel.pages.length + ' 页。') + '</p>' : '') +
      scaled(sel.pages[pi], 'dk-stage card') +
      '<div class="row dk-stb"><button type="button" class="btn sm" data-act="dkPresentHere">' + uic('play', 12) + ' ' + L('Present from here', '从此页演示') + '</button>' + (ed ? '<span class="dk-sp"></span><button type="button" class="ib" data-act="dkMove" data-v="-1" title="' + esc(T('Move up', '上移')) + '">' + uic('up', 15) + '</button><button type="button" class="ib" data-act="dkMove" data-v="1" title="' + esc(T('Move down', '下移')) + '">' + uic('down', 15) + '</button><button type="button" class="ib" data-act="dkDup" title="' + esc(T('Duplicate', '复制')) + '">' + uic('copy', 15) + '</button><button type="button" class="ib' + (sel.s.hidden ? ' on' : '') + '" data-act="dkHide" title="' + esc(sel.s.hidden ? T('Show this slide', '显示此页') : T('Hide this slide (kept, not presented)', '隐藏此页（保留但不演示）')) + '">' + uic(sel.s.hidden ? 'eye' : 'hide', 15) + '</button><button type="button" class="ib" data-act="dkDelSlide" title="' + esc(T('Delete slide', '删除此页')) + '">' + uic('trash', 15) + '</button>' : '') + '</div>' +
      (sel.s.note ? '<div class="card dk-note"><b>' + L('Speaker notes', '演讲备注') + '</b><div>' + esc(sel.s.note) + '</div></div>' : '')
    : '<div class="card empty">' + L('This presentation has no slides yet.', '此演示文稿还没有页面。') + '</div>') +
    (fbs.length ? '<details class="card dk-fb"' + (fbOpen ? ' open' : '') + '><summary><b>' + L('Owner comments', '业主意见') + '</b> ' + (fbOpen ? chip('red', fbOpen + ' ' + L('open', '待处理')) : '') + '</summary>' + fbs.map(function(x){ return '<div class="fb' + (x.status === 'open' ? ' open' : '') + '"><div class="ahead"><b>' + esc(x.author_name || '') + '</b> <span class="mono muted">' + esc(x.reg_no || '') + '</span> <span class="muted">' + esc(fmtTime(x.created_at)) + '</span></div><div style="white-space:pre-wrap">' + esc(x.body) + '</div>' + (x.reply ? '<div class="note">↳ ' + esc(x.reply) + '</div>' : '') + (canTeamEdit() && x.status === 'open' ? '<div class="row"><input class="in" id="rp_' + esc(x.id) + '" placeholder="' + esc(T('Reply (optional)', '回复（可选）')) + '"><button type="button" class="btn sm" data-act="fbResolve" data-v="' + esc(x.id) + '">' + L('Reply & resolve', '回复并关闭') + '</button></div>' : '') + '</div>'; }).join('') + '</details>' : '') +
    '</section>';
  h += '<aside class="dk-props card">' + (sel ? slideProps(deck, sel.s, ed) : '') + '</aside></div>';
  return h;
}
function deckBar(deck, ed){
  var d = deck.d, dis = ed ? '' : ' disabled', ms = meetingRecs();
  var ml = d.meeting && getRec(d.meeting), open = S.dkBar != null ? S.dkBar : !d.title && !d.titleZh;
  var sum = '<summary><b>' + L('Presentation settings', '文稿设置') + '</b><span class="muted">' + esc([d.date ? T('Data as of', '数据日期') + ' ' + d.date : '', ml ? recNo(getReg(ml.reg), ml) : '', d.presenter || ''].filter(Boolean).join(' · ')) + '</span><span class="lnk">' + (open ? L('Hide', '收起') : (ed ? L('Edit', '编辑') : L('Show', '展开'))) + '</span></summary>';
  return '<details class="card dk-bar"' + (open ? ' open' : '') + ' data-dkbar="1">' + sum + '<div class="dk-barg"><label class="fl">' + L('Title', '标题') + '<input class="in" data-dk="title" value="' + esc(d.title || '') + '"' + dis + ' placeholder="Weekly progress meeting"></label>' +
    '<label class="fl">' + L('Title (中文)', '中文标题') + '<input class="in" data-dk="titleZh" value="' + esc(d.titleZh || '') + '"' + dis + ' placeholder="周进度汇报会"></label>' +
    '<label class="fl dk-w">' + L('Data as of', '数据日期') + '<input class="in" type="date" data-dk="date" value="' + esc(d.date || '') + '"' + dis + '></label>' +
    '<div class="fl dk-w"><span>' + L('Slide language', '页面语言') + '</span><div class="seg">' + [['en','EN'],['both','EN + 中'],['zh','中文']].map(function(o){ return '<button type="button"' + (ed ? ' data-act="dkSet" data-k="lang" data-v="' + o[0] + '"' : ' disabled') + ' aria-pressed="' + ((d.lang || 'en') === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div></div>' +
    '<div class="fl dk-w"><span>' + L('Audience', '对象') + '</span><div class="seg">' + [['owner','Owner mode','业主模式'],['internal','Internal','内部']].map(function(o){ return '<button type="button"' + (ed ? ' data-act="dkSet" data-k="aud" data-v="' + o[0] + '"' : ' disabled') + ' aria-pressed="' + ((d.aud || 'owner') === o[0]) + '">' + L(o[1], o[2]) + '</button>'; }).join('') + '</div></div>' +
    '<label class="fl">' + L('For meeting', '对应会议') + '<select class="in" data-dk="meeting"' + dis + '><option value="">' + esc(T('— none —', '— 无 —')) + '</option>' + ms.map(function(x){ return '<option value="' + esc(x.r.id) + '"' + (d.meeting === x.r.id ? ' selected' : '') + '>' + esc(x.date + ' · ' + recLabel(x.r)) + '</option>'; }).join('') + '</select></label>' +
    '<label class="fl">' + L('Presented by', '汇报人') + '<input class="in" data-dk="presenter" value="' + esc(d.presenter || '') + '"' + dis + '></label>' +
    '<p class="note dk-bnote">' + ((d.aud || 'owner') === 'internal' ? L('Internal: every record and field of the team registers can appear.', '内部：团队台账的全部记录和字段都可出现。') : L('Owner mode: only Owner-visible fields; registers that publish to the Owner show only records marked “Show in Owner plan”.', '业主模式：只显示「业主可见」字段；发布给业主的台账只显示标记「显示于业主计划」的记录。')) + ' ' + L('Registers set to “Only me” are never used in presentations.', '「仅自己可见」的台账不会用于演示文稿。') + '</p></div></details>';
}

/* ---------------- slide properties ---------------- */
function pIn(path, v, ed, ph){ return '<input class="in" data-sp="' + path + '" value="' + esc(v == null ? '' : v) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + (ed ? '' : ' disabled') + '>'; }
function pSel(path, v, opts, ed, t){ return '<select class="in" data-sp="' + path + '"' + (t ? ' data-t="' + t + '"' : '') + (ed ? '' : ' disabled') + '>' + opts.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (String(v) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
function pChk(path, on, label, ed, v, t){ return '<label class="chk"><input type="checkbox" data-sp="' + path + '"' + (v != null ? ' data-v="' + esc(v) + '"' : '') + ' data-t="' + (t || (v != null ? 'list' : 'bool')) + '"' + (on ? ' checked' : '') + (ed ? '' : ' disabled') + '>' + label + '</label>'; }
function pRow(label, html, note){ return '<div class="fl"><span class="flab">' + label + '</span>' + html + (note ? '<span class="note">' + note + '</span>' : '') + '</div>'; }
function regOpts(test){ return [['', T('— choose —', '— 选择 —')]].concat(deckRegs(test).map(function(r){ return [r.id, regName(r)]; })); }
function slideProps(deck, s, ed){
  var c = s.cfg || {}, t = SLIDES[s.type], h = '<div class="dk-pt">' + esc(T1(t.en, t.zh)) + '</div>';
  if(s.type !== 'cover') h += pRow(L('Slide title', '页面标题'), pIn('title.en', s.title && s.title.en, ed, 'English') + pIn('title.zh', s.title && s.title.zh, ed, '中文'));
  var reg = c.reg && getReg(c.reg);
  switch(s.type){
    case 'cover': h += pRow(L('Subtitle', '副标题'), pIn('cfg.sub', c.sub, ed, T('e.g. Progress report week 42', '如：第 42 周进度报告'))) + '<p class="note">' + L('Title, date, presenter and meeting come from the bar above the slides.', '标题、日期、汇报人和会议取自页面上方的设置栏。') + '</p>'; break;
    case 'section': h += pRow(L('Subtitle', '副标题'), pIn('cfg.sub', c.sub, ed)); break;
    case 'text': h += pRow(L('Points', '要点'), '<textarea class="in" rows="9" data-sp="cfg.body"' + (ed ? '' : ' disabled') + '>' + esc(c.body || '') + '</textarea>', L('One point per line. Start a line with two spaces or “- ” for a sub-point.', '每行一个要点；以两个空格或「- 」开头为下级要点。')) + pRow(L('Second column (optional)', '第二栏（可选）'), '<textarea class="in" rows="5" data-sp="cfg.body2"' + (ed ? '' : ' disabled') + '>' + esc(c.body2 || '') + '</textarea>'); break;
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
        h += pRow(L('Columns', '列'), '<div class="dk-cl">' + dataFields(reg).filter(function(f){ return ['files','sub','link','section'].indexOf(f.type) < 0; }).map(function(f){ return pChk('cfg.cols', cols.indexOf(f.key) >= 0, esc(T1(f.en, f.zh)) + (ctx.owner && !fieldOk(ctx, reg, f) ? ' <span class="chip c-grey">' + L('internal', '内部') + '</span>' : ''), ed, f.key); }).join('') + '</div>', hiddenCols.length ? L(hiddenCols.length + ' ticked column(s) are internal and are left out in Owner mode. Tick “Owner can see” in Fields & columns to show them.', '有 ' + hiddenCols.length + ' 个勾选的列为内部字段，业主模式下不显示。可在「字段与列」中勾选「业主可见」。') : '');
        h += '<div class="fl"><span class="flab">' + L('Which items', '哪些记录') + '</span>' + pChk('cfg.filter.open', f0.open, L('Open items only', '只看未完成'), ed) + pChk('cfg.filter.od', f0.od, L('Overdue only', '只看逾期'), ed) + pChk('cfg.filter.star', f0.star, L('Key items only (★)', '只看重点（★）'), ed) +
          pRow(L('Due within', '到期范围'), pSel('cfg.filter.due', f0.due || 0, [[0, T('any date', '不限')]].concat([1, 2, 3, 4, 6, 8].map(function(n){ return [n, T(n + ' week' + (n > 1 ? 's' : ''), n + ' 周内')]; })), ed, 'num')) + '</div>';
        if(sf) h += pRow(L(sf.en, sf.zh), '<div class="dk-cl">' + optsOf(sf).map(function(o){ return pChk('cfg.filter.st', (f0.st || []).indexOf(o.v) >= 0, optChip(o), ed, o.v); }).join('') + '</div>', L('None ticked = all', '不勾选 = 全部'));
        if(bf) h += pRow(L(bf.en, bf.zh), '<div class="dk-cl dk-inl">' + optsOf(bf).map(function(o){ return pChk('cfg.filter.blk', (f0.blk || []).indexOf(o.v) >= 0, esc(o.v), ed, o.v); }).join('') + '</div>');
        if(tf){ var topts = [['all', T('All', '全部')]]; treeDfs(tf, function(n, dp){ topts.push([n.id, new Array(dp + 1).join('  ') + treeLabel(n)]); }); h += pRow(L(tf.en, tf.zh), pSel('cfg.filter.node', f0.node || 'all', topts, ed)); }
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
    case 'actions':
      h += pRow(L('Meetings register', '会议台账'), pSel('cfg.reg', c.reg, regOpts(function(r){ return dataFields(r).some(function(f){ return f.type === 'sub' && (f.cols || []).some(function(x){ return x.type === 'check'; }); }); }), ed));
      if(reg) h += pRow(L('Meeting', '会议'), pSel('cfg.meeting', c.meeting || 'latest', [['latest', T('Latest meeting before the deck date', '演示日期前的最近一次会议')]].concat(recsOf(reg.id).slice().sort(function(a, b){ return String(b.d[rolesOf(reg).start] || '').localeCompare(String(a.d[rolesOf(reg).start] || '')); }).map(function(r){ return [r.id, (r.d[rolesOf(reg).start] || '') + ' · ' + recLabel(r)]; })), ed)) + pChk('cfg.open', c.open, L('Open actions only', '只显示未完成'), ed);
      break;
  }
  h += pRow(L('Speaker notes', '演讲备注'), '<textarea class="in" rows="3" data-sp="note"' + (ed ? '' : ' disabled') + ' placeholder="' + esc(T('Only you see these — in the editor and in present mode (press N).', '只有你能看到：在编辑页和演示时（按 N）显示。')) + '">' + esc(s.note || '') + '</textarea>');
  return h;
}
function photoPicker(c, ed){
  var picks = c.picks || [], all = [];
  deckRegs().forEach(function(reg){ var ffs = dataFields(reg).filter(function(f){ return f.type === 'files'; }); recsOf(reg.id).forEach(function(r){ ffs.forEach(function(f){ asArr(r.d[f.key]).forEach(function(x){ if(/^image\//.test(x.type || '')) all.push({reg:reg, r:r, x:x}); }); }); }); });
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
    '<div class="fg"><label class="fl">' + L('Title', '标题') + '<input class="in" data-nd="title" value="' + esc(m.title || '') + '" placeholder="Weekly progress meeting"></label><label class="fl">' + L('Title (中文)', '中文标题') + '<input class="in" data-nd="titleZh" value="' + esc(m.titleZh || '') + '" placeholder="周进度汇报会"></label>' +
    '<label class="fl">' + L('For meeting', '对应会议') + '<select class="in" data-nd="meeting"><option value="">' + esc(T('— none —', '— 无 —')) + '</option>' + ms.map(function(x){ return '<option value="' + esc(x.r.id) + '"' + (m.meeting === x.r.id ? ' selected' : '') + '>' + esc(x.date + ' · ' + recLabel(x.r)) + '</option>'; }).join('') + '</select></label>' +
    '<label class="fl">' + L('Data as of', '数据日期') + '<input class="in" type="date" data-nd="date" value="' + esc(m.date || '') + '"></label>' +
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
  if(ro.start || ro.finish) out.push({key:'gantt', s:newSlide('lookahead', {regs:[reg.id], weeks:3, overdue:true}, {en:name.en + ' – look-ahead', zh:(name.zh || name.en) + ' – 近期计划'}), note:T('3-week look-ahead bars from the Gantt dates', '按甘特日期生成三周计划条形图')});
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
    var d = {title:(m.title || '').trim(), titleZh:(m.titleZh || '').trim(), date:m.date || n2d(asOfN()), lang:m.lang || 'en', aud:m.aud || 'owner', meeting:m.meeting || '', presenter:m.presenter || ((STORE.me && STORE.me.name) || ''), slides:tplSlides(m.tpl || 'weekly')};
    if(!d.title && !d.titleZh){ d.title = 'Weekly progress meeting'; d.titleZh = '周进度汇报会'; }
    if(m.slide) d.slides.splice(1, 0, m.slide);
    return createRec(reg, d, false);
  });
}

/* ================= present mode ================= */
function presRoot(){ var r = $('#present-root'); if(!r){ r = document.createElement('div'); r.id = 'present-root'; document.body.appendChild(r); } return r; }
function startPresent(pages, at, title){
  if(!pages.length){ toast(T('Nothing to present — all slides are hidden.', '没有可演示的页面（全部已隐藏）。')); return; }
  S.present = {pages:pages, i:clamp(at || 0, 0, pages.length - 1), title:title || '', note:false, fs:false};
  try{ var de = document.documentElement; if(de.requestFullscreen) de.requestFullscreen().catch(function(){}); }catch(e){}
  renderPresent();
}
function presentDeck(deck, sid){
  var built = deckBuild(deck);
  var go = function(){ var pages = []; deckBuild(deck).forEach(function(x){ x.pages.forEach(function(h){ pages.push({sid:x.s.id, html:h, note:x.s.note || ''}); }); }); var at = 0; if(sid) pages.some(function(p, i){ if(p.sid === sid){ at = i + (S.dpage || 0); return true; } return false; }); startPresent(pages, at, deckTitle(deck.d)); };
  var paths = photoPaths(built); if(!paths.length){ go(); return; }
  S.present = {pages:[{html:'<div class="sl"><div class="sl-empty">' + esc(T('Loading photos…', '正在加载照片…')) + '</div></div>'}], i:0, note:false}; renderPresent();
  try{ var de = document.documentElement; if(de.requestFullscreen) de.requestFullscreen().catch(function(){}); }catch(e){}
  signFor(built).then(function(){ var fs = S.present && S.present.fs; go(); if(S.present) S.present.fs = fs; });
}
function renderPresent(){
  var r = presRoot(), p = S.present;
  if(!p){ r.innerHTML = ''; document.body.classList.remove('presenting'); return; }
  document.body.classList.add('presenting');
  var vw = window.innerWidth, vh = window.innerHeight - 44, sc = Math.min(vw / 1280, vh / 720), pg = p.pages[p.i];
  r.innerHTML = '<div class="pres" role="dialog" aria-modal="true" aria-label="' + esc(p.title) + '"><div class="pres-stage" data-act="presNext"><div class="pres-sc" style="width:' + (1280 * sc) + 'px;height:' + (720 * sc) + 'px"><div class="dk-sc" style="transform:scale(' + sc + ')">' + pg.html + '</div></div></div>' +
    (p.note && pg.note ? '<div class="pres-note">' + esc(pg.note) + '</div>' : '') +
    '<div class="pres-bar"><button type="button" class="ib" data-act="presPrev" aria-label="Previous">' + uic('left', 20) + '</button><span class="mono">' + (p.i + 1) + ' / ' + p.pages.length + '</span><button type="button" class="ib" data-act="presNext" aria-label="Next">' + uic('right', 20) + '</button><span class="pres-t">' + esc(p.title) + '</span>' +
    (p.pages.some(function(x){ return x.note; }) ? '<button type="button" class="btn sm" data-act="presNote" aria-pressed="' + !!p.note + '">' + L('Notes (N)', '备注 (N)') + '</button>' : '') + '<button type="button" class="btn sm" data-act="presExit">' + L('Exit (Esc)', '退出 (Esc)') + '</button></div></div>';
}
function presGo(d){ var p = S.present; if(!p) return; p.i = clamp(p.i + d, 0, p.pages.length - 1); renderPresent(); }
function presExit(){ S.present = null; renderPresent(); try{ if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function(){}); }catch(e){} }
document.addEventListener('fullscreenchange', function(){ var p = S.present; if(!p) return; if(document.fullscreenElement) p.fs = true; else if(p.fs) presExit(); else renderPresent(); });
document.addEventListener('keydown', function(e){
  if(!S.present) return;
  var k = e.key, used = true;
  if(k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter') presGo(1);
  else if(k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') presGo(-1);
  else if(k === 'Home') presGo(-1e4); else if(k === 'End') presGo(1e4);
  else if(k === 'Escape') presExit();
  else if(k === 'n' || k === 'N'){ S.present.note = !S.present.note; renderPresent(); }
  else used = false;
  if(used){ e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

/* ================= PDF (browser print → Save as PDF, vector text) ================= */
function pdfHtml(pages, title){
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + SLIDE_CSS +
    '\n@page{size:1280px 720px;margin:0}html,body{margin:0;padding:0;background:#6B7178}body{padding:56px 0 24px}.sl{margin:0 auto 18px;box-shadow:0 4px 18px rgba(0,0,0,.35);break-after:page;page-break-after:always;break-inside:avoid}.sl:last-of-type{break-after:auto;page-break-after:auto}' +
    '.pbar{position:fixed;top:0;left:0;right:0;height:44px;display:flex;align-items:center;gap:14px;padding:0 18px;background:#1A1D21;color:#fff;font:14px system-ui,sans-serif;z-index:9}.pbar button{font:inherit;padding:6px 14px;border-radius:6px;border:0;background:#E8930C;color:#1A1D21;font-weight:600;cursor:pointer}.pbar span{opacity:.8}' +
    '@media print{html,body{background:none;padding:0}.pbar{display:none}.sl{margin:0;box-shadow:none}}</style></head><body><div class="pbar"><button type="button" onclick="print()">Print / Save as PDF · 打印 / 另存为 PDF</button><span>Destination: “Save as PDF”. Page size is set to 16:9 automatically (Chrome / Edge). In Safari choose Landscape. · 目标选「另存为 PDF」。</span></div>' +
    pages.map(function(p){ return p.html; }).join('') +
    '<script>(function(){function go(){var im=[].slice.call(document.images);Promise.all(im.map(function(i){return i.complete?0:new Promise(function(r){i.onload=i.onerror=r;});})).then(function(){setTimeout(function(){window.focus();window.print();},350);});}if(document.readyState==="complete")go();else window.addEventListener("load",go);})();<\/script></body></html>';
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
function deckPdf(deck){ var built = deckBuild(deck); exportPdf(function(){ return deckPages(deck); }, pdfTitle(deck.d), signFor(built)); }

/* ================= issue / share ================= */
function issueDeck(deck){ return setRec(deck, {status:'issued', snap:deckData(deck), issuedAt:new Date().toISOString()}); }
function imgToData(url, max){
  return new Promise(function(res){ var im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = function(){ try{ var s = Math.min(1, (max || 1280) / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.72)); }catch(e){ res(null); } };
    im.onerror = function(){ res(null); }; im.src = url; });
}
async function shareDeck(deck){
  if((deck.d.aud || 'owner') === 'internal'){ toast(T('Switch the audience to Owner mode before sharing.', '请先切换到业主模式再发给业主。')); return; }
  if(deck.d.status !== 'issued'){ if(!confirm(T('Sharing issues the presentation: its figures are frozen as they are now, and the Owner sees exactly this version. Continue?', '发给业主会同时定稿：数据按当前冻结，业主看到的就是这一版。继续？'))) return; await issueDeck(deck); deck = getRec(deck.id); }
  else if(!confirm(T('Publish this issued presentation to the Owner?', '把这份已定稿的演示文稿发布给业主？'))) return;
  toast(T('Preparing the Owner copy…', '正在准备业主版本…'));
  var data = clone(deck.d.snap || deckData(deck)), slides = (deck.d.slides || []).filter(function(s){ return !s.hidden; }).map(function(s){ return {id:s.id, type:s.type, title:s.title, cfg:{}}; });
  var paths = [], bad = 0; slides.forEach(function(s){ var dd = data[s.id]; if(dd && dd.photos) dd.photos.forEach(function(p){ paths.push(p.path); }); });
  if(paths.length && STORE.signUrls) await STORE.signUrls(paths);
  for(var i = 0; i < slides.length; i++){ var dd = data[slides[i].id]; if(!dd || !dd.photos) continue; for(var j = 0; j < dd.photos.length; j++){ var p = dd.photos[j], u = STORE.fileUrl(p.path); p.src = u ? await imgToData(u, 1280) : null; if(!p.src) bad++; delete p.path; } }
  var keep = {}; slides.forEach(function(s){ keep[s.id] = data[s.id]; });
  var max = 0; (STORE.pubs || []).forEach(function(p){ var mm = /PUB-(\d+)/.exec(p.no || ''); if(mm) max = Math.max(max, +mm[1]); });
  var no = 'PUB-' + String(max + 1).padStart(3, '0'), d = deck.d;
  var pub = {kind:'deck', no:no, at:new Date().toISOString(), by:(STORE.me && (STORE.me.name || STORE.me.email)) || '', note:(d.no || '') + ' · ' + (d.date || ''), deckId:deck.id, deckNo:d.no || '', title:{en:d.title || '', zh:d.titleZh || ''}, date:d.date || '', lang:d.lang || 'en', presenter:d.presenter || '', slides:slides, data:keep, count:slides.length};
  try{ await STORE.createPub(no, pub); toast(T('Shared with the Owner as ' + no, '已作为 ' + no + ' 发给业主') + (bad ? ' · ' + T(bad + ' photo(s) could not be included', bad + ' 张照片未能附上') : '')); }
  catch(e){ toast(errText(e)); }
}
function pubDeck(p){ return {id:p.deckId || p.id, d:{no:p.deckNo, title:p.title && p.title.en, titleZh:p.title && p.title.zh, date:p.date, lang:p.lang, aud:'owner', presenter:p.presenter, status:'issued', slides:p.slides}}; }
function pubPages(p){ var out = []; deckBuild(pubDeck(p), {data:p.data}).forEach(function(x){ x.pages.forEach(function(h, i){ out.push({sid:x.s.id, html:h, title:x.s.title, sub:i}); }); }); return out; }

/* Owner portal: a published presentation */
function ownerDeckView(p, pubs){
  var pages = pubPages(p), fb = (STORE.fb || []).filter(function(x){ return x.pub_id === p.id; });
  return '<div class="ph"><div><h1 class="vtitle">' + esc(T1(p.title.en, p.title.zh) || T('Presentation', '演示文稿')) + '</h1><span class="muted">' + esc(p.no + ' · ' + (p.date || '') + (p.presenter ? ' · ' + p.presenter : '')) + '</span></div><div class="pha"><select class="in" id="pubSel">' + pubs.map(function(x){ return '<option value="' + esc(x.id) + '"' + (x.id === p.id ? ' selected' : '') + '>' + esc(x.no + ' · ' + fmtTime(x.at).slice(0, 10) + ' · ' + (x.kind === 'deck' ? T1(x.title.en, x.title.zh) : (x.reg ? T1(x.reg.en, x.reg.zh) : ''))) + '</option>'; }).join('') + '</select><button type="button" class="btn pri" data-act="pubPresent">' + uic('play', 14) + ' ' + L('Present', '演示') + '</button><button type="button" class="btn" data-act="pubPdf">' + uic('pdf', 15) + ' ' + L('Download PDF', '下载 PDF') + '</button></div></div>' +
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
  var n = 0; dataFields(reg).forEach(function(f){ if(f.type === 'files') n += asArr(rec.d[f.key]).filter(function(x){ return /^image\//.test(x.type || ''); }).length; });
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
  var act = el.dataset.act, v = el.dataset.v; if(!/^(dk|pres|pub[PD]|regHistDeck)/.test(act) || act === 'pubDel') return;
  var deck = S.deck && getRec(S.deck);
  switch(act){
    case 'dkNew': openModal({kind:'newDeck', tpl:'weekly', lang:'en', aud:'owner', date:n2d(asOfN())}); break;
    case 'dkTpl': S.modal.tpl = v; renderModal(); break;
    case 'dkCreate': (function(){ var m = S.modal; closeModal(); createDeck(m).then(function(id){ if(id){ openDeck(id); toast(T('Presentation created — the slides already show live data.', '演示文稿已创建，页面已显示实时数据。')); } }).catch(function(er){ toast(errText(er)); }); })(); break;
    case 'dkOpen': (function(){ var p = String(v).split('|'); openDeck(p[0], p[1]); })(); break;
    case 'dkBack': S.deck = null; saveUI(); renderMain(); break;
    case 'dkSlide': S.dslide = v; S.dpage = 0; renderMain(); break;
    case 'dkPage': S.dpage = +v; renderMain(); break;
    case 'dkSet': if(deck) setRec(deck, mk(el.dataset.k, v), {silent:true}); break;
    case 'dkAddMenu': openPick('menu', {html:'<div class="plist">' + SLIDE_ORDER.map(function(t){ return '<button type="button" class="popt" data-act="dkAddType" data-v="' + t + '">' + esc(T1(SLIDES[t].en, SLIDES[t].zh)) + '</button>'; }).join('') + '</div>', w:260}, el); break;
    case 'dkAddType': (function(){ closePop(); if(!deck) return; var s = newSlide(v); addSlideTo(deck, s, S.dslide).then(function(){ S.dslide = s.id; S.dpage = 0; renderMain(); }); })(); break;
    case 'dkMove': (function(){ var sl = clone(deck.d.slides || []), i = sl.map(function(s){ return s.id; }).indexOf(S.dslide), j = i + (+v); if(i < 0 || j < 0 || j >= sl.length) return; var x = sl[i]; sl[i] = sl[j]; sl[j] = x; saveSlides(deck, sl, true); })(); break;
    case 'dkDup': (function(){ var s = slideById(deck, S.dslide); if(!s) return; var c = clone(s); c.id = uid('s'); addSlideTo(deck, c, s.id).then(function(){ S.dslide = c.id; renderMain(); }); })(); break;
    case 'dkHide': (function(){ var sl = clone(deck.d.slides || []); sl.forEach(function(s){ if(s.id === S.dslide) s.hidden = !s.hidden; }); saveSlides(deck, sl, true); })(); break;
    case 'dkDelSlide': (function(){ var sl = deck.d.slides || [], i = sl.map(function(s){ return s.id; }).indexOf(S.dslide); if(i < 0) return; var rest = sl.filter(function(s){ return s.id !== S.dslide; }); S.dslide = rest[Math.min(i, rest.length - 1)] ? rest[Math.min(i, rest.length - 1)].id : null; saveSlides(deck, clone(rest)); })(); break;
    case 'dkClearFx': (function(){ var sl = clone(deck.d.slides || []); sl.forEach(function(s){ if(s.id === S.dslide && s.cfg.filter){ s.cfg.filter.fx = {}; s.cfg.filter.q = ''; s.cfg.filter.from = ''; s.cfg.filter.to = ''; } }); saveSlides(deck, sl, true); })(); break;
    case 'dkPresent': (function(){ var d0 = getRec(v); if(d0) presentDeck(d0); })(); break;
    case 'dkPresentHere': if(deck) presentDeck(deck, S.dslide); break;
    case 'dkPdf': (function(){ var d0 = getRec(v); if(d0) deckPdf(d0); })(); break;
    case 'dkIssue': if(deck && confirm(T('Issue this presentation? The figures are frozen as they are now so the deck always shows what was presented. You can go back to draft later.', '定稿此演示文稿？数据会按当前冻结，以后打开仍是汇报时的内容。之后可以退回草稿。'))) issueDeck(deck).then(function(){ toast(T('Issued — figures frozen', '已定稿，数据已冻结'), {act:'quickUndo', label:T('Undo', '撤销')}); }); break;
    case 'dkReopen': if(deck && confirm(T('Back to draft? The slides show live data again (the frozen figures are kept in the Change log).', '退回草稿？页面将重新显示实时数据（冻结的数据保留在修改记录中）。'))) setRec(deck, {status:'draft', snap:null, issuedAt:null}); break;
    case 'dkShare': if(deck) shareDeck(deck); break;
    case 'dkCopy': (function(){ var src = getRec(v); if(!src) return; var d = clone(src.d), reg = getReg(src.reg); delete d.snap; delete d.issuedAt; d.status = 'draft'; d.no = nextNo(reg); var n0 = d2n(d.date); d.date = n0 != null ? n2d(n0 + 7) : n2d(asOfN());
      var om = d.meeting && getRec(d.meeting), nd = d2n(d.date); d.meeting = ''; if(om){ var mr = getReg(om.reg), cand = recsOf(mr.id).filter(function(r){ var x = d2n(r.d[rolesOf(mr).start]); return r.id !== om.id && x != null && Math.abs(x - nd) <= 3 && r.d.mtype === om.d.mtype; })[0]; if(cand) d.meeting = cand.id; }
      d.slides = (d.slides || []).map(function(s){ s.id = uid('s'); return s; });
      var id = uid('r'); STORE.createRec({id:id, reg:reg.id, d:d}).then(function(){ openDeck(id); toast(T('Copied as ' + d.no + ' for ' + d.date + ' — data is live again.', '已复制为 ' + d.no + '（' + d.date + '），数据恢复实时。')); }).catch(function(er){ toast(errText(er)); }); })(); break;
    case 'dkDel': if(deck && confirm(T('Delete this presentation? You can restore it from the Change log.', '删除此演示文稿？可在修改记录中恢复。'))){ var id0 = deck.id; S.deck = null; STORE.deleteRec(id0).then(function(){ toast(T('Deleted — restore it from the Change log', '已删除，可在修改记录中恢复')); }).catch(function(er){ toast(errText(er)); }); renderAll(); } break;
    case 'regHistDeck': S.act = {reg:deckReg().id, who:'', type:''}; goPage('activity'); break;
    case 'dkAddView': (function(){ var reg = getReg(v); if(!reg) return; var c = viewCands(reg); el.closest('details') && el.closest('details').removeAttribute('open'); openModal({kind:'addToDeck', cands:c.cands, pick:c.pick}); })(); break;
    case 'dkRecPhotos': (function(){ var r = getRec(v), reg = r && getReg(r.reg); if(!reg) return; var picks = []; dataFields(reg).forEach(function(f){ if(f.type === 'files') asArr(r.d[f.key]).forEach(function(x){ if(/^image\//.test(x.type || '')) picks.push({rec:r.id, path:x.path}); }); });
      var t = {en:'Photos – ' + (recNo(reg, r) ? recNo(reg, r) + ' ' : '') + (r.d[rolesOf(reg).title] || ''), zh:'照片 – ' + (recNo(reg, r) ? recNo(reg, r) + ' ' : '') + (r.d[rolesOf(reg).title2] || r.d[rolesOf(reg).title] || '')};
      openModal({kind:'addToDeck', cands:[{key:'photos', s:newSlide('photos', {mode:'pick', picks:picks, layout:picks.length === 1 ? '1' : picks.length <= 4 ? '2x2' : '3x2'}, t), note:T(picks.length + ' photo(s) of ' + recLabel(r) + ' on one slide (more pages if needed).', '把 ' + recLabel(r) + ' 的 ' + picks.length + ' 张照片放在一页（需要时自动分页）。')}], pick:0}); })(); break;
    case 'dkCand': S.modal.pick = +v; renderModal(); break;
    case 'dkAddGo': (function(){ var m = S.modal, sel = ($('#atdDeck') || {}).value || m.deck, c = m.cands[m.pick || 0]; if(!c) return;
      if(sel === '__new'){ openModal({kind:'newDeck', tpl:'blank', lang:'en', aud:'owner', date:n2d(asOfN()), slide:c.s}); return; }
      var d0 = getRec(sel); if(!d0) return; closeModal(); addSlideTo(d0, c.s).then(function(){ toast(T('Slide added to ', '已添加到 ') + (d0.d.no || ''), {act:'dkOpen', v:d0.id + '|' + c.s.id, label:T('Open', '打开')}); }); })(); break;
    case 'dkForMeeting': (function(){ var r = getRec(v); if(r){ S.open = null; renderDrawer(); newDeckFromMeeting(r); } })(); break;
    case 'presNext': presGo(1); break;
    case 'presPrev': presGo(-1); break;
    case 'presNote': S.present.note = !S.present.note; renderPresent(); break;
    case 'presExit': presExit(); break;
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
  if((d = el.dataset.dk)){ var p = mk(d, el.value); if(d === 'meeting' && el.value && !deck.d.date){ var mr = getRec(el.value); if(mr) p.date = mr.d[rolesOf(getReg(mr.reg)).start] || ''; } setRec(deck, p, {silent:true}); return; }
  if((d = el.dataset.sp)){
    var slides = clone(deck.d.slides || []), s = slides.filter(function(x){ return x.id === S.dslide; })[0]; if(!s) return;
    var t = el.dataset.t, v;
    if(t === 'bool') v = el.checked;
    else if(t === 'num') v = +el.value;
    else if(t === 'list' || t === 'pick'){ var cur = (getPath(s, d) || []).slice(); if(d === 'cfg.cols' && !cur.length){ var r0 = getReg(s.cfg.reg); cur = r0 ? defCols(r0) : []; } var item = t === 'pick' ? JSON.parse(el.dataset.v) : el.dataset.v, ix = -1; cur.forEach(function(x, i){ if(same(t === 'pick' ? x.path : x, t === 'pick' ? item.path : item)) ix = i; }); if(el.checked && ix < 0) cur.push(item); if(!el.checked && ix >= 0) cur.splice(ix, 1); v = cur; }
    else v = el.value;
    setPath(s, d, v);
    if(d === 'cfg.cols'){ var rg2 = getReg(s.cfg.reg); if(rg2){ var ord = dataFields(rg2).map(function(f){ return f.key; }); s.cfg.cols.sort(function(a, b){ return ord.indexOf(a) - ord.indexOf(b); }); } }
    if(d === 'cfg.reg'){ var nr = getReg(v); if(s.type === 'table'){ s.cfg.cols = nr ? defCols(nr) : []; s.cfg.filter = {open:!!(s.cfg.filter && s.cfg.filter.open)}; s.cfg.sort = null; if(nr && (!s.title || !s.title.en || s.title.en === 'Register')) s.title = {en:nr.d.en || '', zh:nr.d.zh || ''}; } if(s.type === 'matrix'){ s.cfg.row = ''; s.cfg.col = ''; } if(s.type === 'breakdown') s.cfg.by = ''; if(s.type === 'actions') s.cfg.meeting = 'latest'; }
    saveSlides(deck, slides, true);
  }
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
  if(e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  var deck = getRec(S.deck); if(!deck) return; var ids = (deck.d.slides || []).map(function(s){ return s.id; }), i = ids.indexOf(S.dslide), j = clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, ids.length - 1);
  if(j !== i){ e.preventDefault(); S.dslide = ids[j]; S.dpage = 0; renderMain(); var on = $('.dk-t.on'); if(on && on.scrollIntoView) on.scrollIntoView({block:'nearest'}); }
});
window.addEventListener('resize', function(){ clearTimeout(window.__dkrz); window.__dkrz = setTimeout(function(){ fitSlides(); if(S.present) renderPresent(); }, 120); });
if(window.ResizeObserver){ (function(){ var ro = new ResizeObserver(function(){ fitSlides(); }); var t = setInterval(function(){ var m = document.getElementById('main'); if(m){ ro.observe(m); clearInterval(t); } }, 50); })(); }
