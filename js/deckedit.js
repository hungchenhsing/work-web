/* work-web v2.4 · full-screen presentation editor.
   Layout: toolbar (back · title · undo/redo · + Slide · Insert · Present · Export · Issue & share · ⋯ · panel)
   → filmstrip | canvas (format strip above, pages below) | inspector (Content · Layout · Notes · Presentation).
   The site's top bar and side navigation are hidden while a presentation is open (body.dkfull). */
'use strict';

UI_ICONS.chev = '<path d="M6 9l6 6 6-6"/>';
UI_ICONS.panel = '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>';
UI_ICONS.dots = '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>';
UI_ICONS.textT = '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>';
UI_ICONS.chart = '<path d="M4 20V4M4 20h16"/><path d="M7 15l4-4 3 3 5-6"/>';
UI_ICONS.spark = '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>';
UI_ICONS.shape = '<rect x="3" y="3" width="10" height="10" rx="1"/><circle cx="16" cy="16" r="5"/>';
UI_ICONS.arrow = '<path d="M5 19L19 5M10 5h9v9"/>';
UI_ICONS.layers = '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>';

/* ---------------- slide gallery groups ---------------- */
var DK_GAL = [
  ['status', 'Status', '状态', ['summary', 'kpi', 'matrix', 'breakdown', 'punch']],
  ['plan', 'Schedule', '进度', ['timeline', 'gantt', 'mstable', 'scurve', 'lookahead']],
  ['docs', 'Lists & documents', '清单与文件', ['p:doclist', 'p:liblist', 'table']],
  ['site', 'Site & meetings', '现场与会议', ['photos', 'actions']],
  ['free', 'Text & layout', '文字与版式', ['cover', 'section', 'text', 'etable', 'blank', 'combo']]
];
/* DATA_EL_TYPES (what a data block may show) is defined in deckels.js */
/* presets: a ready-made register table (gallery key p:<name>); make() returns null when the source is missing */
var SL_PRESETS = {
  doclist:{type:'table', en:'Document list', zh:'文件清单', desc:['Turnover documents grouped by package, with a status summary', '移交文件按文件包分组，含状态汇总'],
    make:function(){ var reg = getReg(tplReg('turnover')) || deckRegs(function(r){ return fieldOf(r, 'docNo') && r.d.kind !== 'library'; })[0]; if(!reg) return null; var ro = rolesOf(reg);
      return newSlide('table', {reg:reg.id, cols:[ro.no, 'docNo', ro.title, 'rev', ro.status, 'ownerResult'].filter(function(k, i, a){ return k && fieldOf(reg, k) && a.indexOf(k) === i; }), filter:{}, group:ro.tree || '', sum:true, dense:true, per:18, sort:{k:ro.no, d:1}}, {en:'Document list', zh:'文件清单'}); }},
  liblist:{type:'table', en:'Library documents', zh:'文件库清单', desc:['Documents from the library grouped by discipline', '文件库文件按专业分组'],
    make:function(){ var reg = typeof libReg === 'function' ? libReg() : null; if(!reg || !recsOf(reg.id).length) return null;
      return newSlide('table', {reg:reg.id, cols:['no', 'docNo', 'title', 'rev', 'disc', 'status', 'date'].filter(function(k){ return fieldOf(reg, k); }), filter:{}, group:fieldOf(reg, 'disc') ? 'disc' : '', sum:true, dense:true, per:18, sort:{k:'no', d:1}}, {en:'Documents', zh:'文件清单'}); }}
};
function galSlide(t){ if(t.indexOf('p:') === 0){ var p = SL_PRESETS[t.slice(2)]; try{ return p ? p.make() : null; }catch(e){ console.error(e); return null; } } return SLIDES[t] ? newSlide(t) : null; }
function galType(t){ return t.indexOf('p:') === 0 ? (SL_PRESETS[t.slice(2)] || {}).type : t; }
function galName(t){ var p = t.indexOf('p:') === 0 ? SL_PRESETS[t.slice(2)] : SLIDES[t]; return p ? T1(p.en, p.zh) : t; }
function galDesc(t){ var p = SL_PRESETS[t.slice(2)], ds = t.indexOf('p:') === 0 ? (p ? p.desc : ['', '']) : (DK_DESC[t] || ['', '']); return T1(ds[0], ds[1]); }
var DK_DESC = {
  summary:['Status light, plan vs actual, milestones, issues and decisions', '总体状态、计划 vs 实际、里程碑、问题与决策'],
  kpi:['Headline figures and progress per register', '关键数字与各台账进度'],
  matrix:['Progress by work package × block', '工作包 × 区域进度矩阵'],
  breakdown:['Status bars per package or block', '按文件包或区域的状态条'],
  punch:['Open punch items by priority and block', '按优先级和区域的未关闭尾项'],
  timeline:['Milestones: baseline vs forecast vs actual', '里程碑：基准 vs 预测 vs 实际'],
  gantt:['Programme bars with baseline', '含基准的进度横道图'],
  mstable:['Milestone dates, variance and status', '里程碑日期、偏差与状态'],
  scurve:['Planned vs actual progress curve', '计划 vs 实际进度曲线'],
  lookahead:['What is planned in the next weeks', '未来几周的计划工作'],
  photos:['Newest or hand-picked site photos', '最新或挑选的现场照片'],
  table:['Any register as a table or list: filter, group, pick', '任意台账做成表格或清单：筛选、分组、挑选'],
  actions:['Open actions from the latest meeting', '最近会议的未完成待办'],
  cover:['Title page', '封面'], section:['Divider; fills the agenda bar', '分节页，同时生成议程条'], text:['Bullet points, one or two columns', '要点，一栏或两栏'],
  etable:['A table you type into', '可直接输入的表格'], blank:['Empty page for free layout', '空白页，自由排版'], combo:['Two blocks side by side', '左右两个区块']
};

/* ---------------- sync status (the site top bar is hidden in the editor) ---------------- */
function dkSync(){ if(!STORE) return null; if(STORE.mode === 'demo') return ['Demo · this browser only', '演示 · 仅本浏览器', 'demo']; if(!appReady()) return null; return STORE.rt === 'live' ? ['Live', '在线', 'live'] : STORE.rt === 'off' ? ['Offline — changes may not sync', '离线，修改可能未同步', 'off'] : ['Connecting…', '连接中…', 'wait']; }

/* ================= the editor ================= */
function viewDeckEditor(deck){
  var d = deck.d, issued = d.status === 'issued', ed = canDeckEdit() && !issued, built = deckBuild(deck, {all:true});
  var sel = built.filter(function(x){ return x.s.id === S.dslide; })[0] || built.filter(function(x){ return !x.s.hidden; })[0] || built[0];
  S.dslide = sel ? sel.s.id : null;
  var pi = sel ? clamp(S.dpage || 0, 0, sel.pages.length - 1) : 0; S.dpage = pi;
  S.dkBuilt = built;
  if(S.dkInsp == null) S.dkInsp = window.innerWidth >= 1100;
  if(sel && S.elSel && S.elSel !== '@main' && !elById(sel.s, S.elSel)) S.elSel = null;
  var h = '<div class="dke' + (S.dkInsp ? ' insp' : '') + '">' + dkBar(deck, ed);
  if(issued) h += '<div class="dke-issued">' + uic('lock', 13) + ' ' + L('Issued ' + fmtTime(d.issuedAt) + ' — figures frozen as presented. Use “Issue & share → Back to draft” to edit, or “Copy for next week”.', '定稿于 ' + fmtTime(d.issuedAt) + '：数据按汇报时冻结。要修改请用「定稿与分享 → 退回草稿」，或「复制为下周」。') + '</div>';
  h += '<div class="dke-main"><aside class="dke-film" data-rg="film" aria-label="' + esc(T('Slides', '页面')) + '">' + built.map(function(x){
      return '<div class="dk-t' + (x.s.hidden ? ' hid' : '') + '" data-act="dkSlide" data-v="' + esc(x.s.id) + '"' + (ed ? ' draggable="true" data-sdrag="' + esc(x.s.id) + '"' : '') + ' role="button" tabindex="0" title="' + esc(T1(SLIDES[x.s.type].en, SLIDES[x.s.type].zh)) + '"><span class="dk-tn">' + (x.s.hidden ? uic('hide', 11) : x.first) + (x.pages.length > 1 && !x.s.hidden ? '<small>+' + (x.pages.length - 1) + '</small>' : '') + '</span>' + thumbSlot(x.pages[0], x.s.id) + (ed ? '<button type="button" class="dk-tm" data-act="dkThumbMenu" data-v="' + esc(x.s.id) + '" aria-label="' + esc(T('Slide actions', '页面操作')) + '">' + uic('dots', 16) + '</button>' : '') + '</div>'; }).join('') +
    (ed ? '<button type="button" class="dk-add" data-act="dkGal" data-v="slide">' + uic('plus', 15) + ' ' + L('Add slide', '添加页面') + '</button>' : '') + '</aside>';
  h += '<section class="dke-cv"><div class="dke-ctx" data-rg="ctx"><div class="dk-fmt">' + elFormat(ed) + '</div></div>' +
    '<div class="dke-sw" data-rg="sw">' + (sel ? '<div class="dk-stage"><div class="dk-sc">' + sel.pages[pi] + '</div></div>' : '<div class="card empty">' + L('This presentation has no slides yet.', '此演示文稿还没有页面。') + (ed ? ' <button type="button" class="btn pri" data-act="dkGal" data-v="slide">' + L('Add slide', '添加页面') + '</button>' : '') + '</div>') + '</div>' +
    (sel && sel.pages.length > 1 ? '<div class="dke-pg"><span class="note">' + L('Continues on ' + sel.pages.length + ' pages', '自动分为 ' + sel.pages.length + ' 页') + '</span><div class="seg">' + sel.pages.map(function(_, i){ return '<button type="button" data-act="dkPage" data-v="' + i + '" aria-pressed="' + (i === pi) + '">' + (i + 1) + '</button>'; }).join('') + '</div></div>' : '') + '</section>';
  if(S.dkInsp) h += '<aside class="dke-insp" data-rg="insp">' + inspHtml(deck) + '</aside>';
  return h + '</div></div>';
}
function dkBar(deck, ed){
  var d = deck.d, sy = dkSync(), fbOpen = ((STORE && STORE.fb) || []).filter(function(x){ return x.item_id === deck.id && x.status === 'open'; }).length;
  return '<header class="dke-bar" data-rg="bar"><button type="button" class="ib" data-act="dkBack" title="' + esc(T('All presentations', '全部演示文稿')) + '">' + uic('left', 18) + '</button>' +
    '<div class="dke-tt"><button type="button" class="dke-name" data-act="dkTab" data-v="deck" title="' + esc(T('Presentation settings', '文稿设置')) + '">' + esc(deckTitle(d)) + '</button><span class="dke-sub">' + (sy ? '<span class="dot ' + sy[2] + '" title="' + esc(T(sy[0], sy[1])) + '"></span>' : '') + '<span class="mono">' + esc(d.no || '') + '</span> ' + (d.status === 'issued' ? chip('green', uic('lock', 10) + ' ' + L('Issued', '已定稿')) : chip('amber', L('Draft · live', '草稿 · 实时'))) + ' ' + ((d.aud || 'owner') === 'internal' ? chip('grey', L('Internal', '内部')) : chip('violet', L('Owner', '业主'))) + (fbOpen ? ' <button type="button" class="lnk" data-act="dkTab" data-v="notes">' + chip('red', fbOpen + ' ' + L('comments', '条意见')) + '</button>' : '') + '</span></div>' +
    (ed ? '<div class="dke-g"><button type="button" class="ib" data-act="dkUndo" title="' + esc(T('Undo (Cmd+Z)', '撤销（Cmd+Z）')) + '">' + uic('undo', 17) + '</button><button type="button" class="ib dk-redo" data-act="dkRedo" title="' + esc(T('Redo (Cmd+Shift+Z)', '重做（Cmd+Shift+Z）')) + '">' + uic('undo', 17) + '</button></div>' +
      '<div class="dke-g"><button type="button" class="btn" data-act="dkGal" data-v="slide">' + uic('plus', 14) + ' ' + L('Slide', '页面') + '</button><button type="button" class="btn" data-act="dkMenu" data-v="insert">' + L('Insert', '插入') + ' ' + uic('chev', 13) + '</button></div>' : '') +
    '<span class="dke-sp"></span>' +
    '<div class="dke-g"><span class="dke-split"><button type="button" class="btn pri" data-act="dkPresent" data-v="' + esc(deck.id) + '">' + uic('play', 13) + ' ' + L('Present', '演示') + '</button><button type="button" class="btn pri" data-act="dkMenu" data-v="present" aria-label="' + esc(T('More present options', '更多演示选项')) + '">' + uic('chev', 13) + '</button></span>' +
    '<button type="button" class="btn" data-act="dkMenu" data-v="export">' + L('Export', '导出') + ' ' + uic('chev', 13) + '</button>' +
    (canDeckEdit() ? '<button type="button" class="btn" data-act="dkMenu" data-v="share">' + uic('send', 13) + ' ' + L('Issue & share', '定稿与分享') + ' ' + uic('chev', 13) + '</button>' : '') +
    '<button type="button" class="ib" data-act="dkMenu" data-v="more" title="' + esc(T('More', '更多')) + '">' + uic('dots', 18) + '</button>' +
    '<button type="button" class="ib' + (S.dkInsp ? ' on' : '') + '" data-act="dkInsp" title="' + esc(T('Show / hide the side panel', '显示 / 隐藏侧边面板')) + '" aria-pressed="' + !!S.dkInsp + '">' + uic('panel', 17) + '</button></div></header>';
}
function popt(act, v, label, ico, extra){ return '<button type="button" class="popt" data-act="' + act + '"' + (v != null ? ' data-v="' + esc(v) + '"' : '') + (extra || '') + '>' + (ico ? uic(ico, 15) : '<span style="width:15px"></span>') + '<span>' + label + '</span></button>'; }
function dkMenuHtml(kind, deck, el){
  var d = deck.d, s = slideById(deck, S.dslide), ed = canDeckEdit() && d.status !== 'issued', h = '';
  if(kind === 'insert'){
    h = popt('dkGal', 'el', L('Data block…', '数据区块…') + ' <span class="note">' + L('table, chart, milestones, photos…', '表格、图表、里程碑、照片…') + '</span>', 'chart') + '<hr>' +
      popt('elAdd', 'text', L('Text box', '文本框'), 'textT') + popt('elAdd', 'note', L('Note', '便签'), 'textT') + popt('elAdd', 'rect', L('Box', '方框'), 'shape') + popt('elAdd', 'ellipse', L('Circle', '圆圈'), 'shape') + popt('elAdd', 'arrow', L('Arrow', '箭头'), 'arrow') + popt('elAdd', 'line', L('Line', '直线'), 'arrow') +
      '<label class="popt">' + uic('camera', 15) + '<span>' + L('Image…', '图片…') + ' <span class="note">' + L('or paste with Cmd+V', '或用 Cmd+V 粘贴') + '</span></span><input type="file" accept="image/*" hidden data-elimg="1"></label>';
  }
  if(kind === 'present') h = popt('dkPresent', deck.id, L('From the beginning', '从头开始'), 'play') + popt('dkPresentHere', null, L('From this slide', '从当前页开始'), 'play');
  if(kind === 'export') h = popt('dkPdf', deck.id, L('PDF', 'PDF') + ' <span class="note">' + L('print / save as PDF', '打印 / 另存为 PDF') + '</span>', 'pdf') + popt('dkPptx', deck.id, L('PowerPoint (.pptx)', 'PowerPoint（.pptx）') + ' <span class="note">' + L('editable', '可编辑') + '</span>', 'pdf');
  if(kind === 'share'){
    h = (d.status === 'issued' ? popt('dkReopen', null, L('Back to draft', '退回草稿') + ' <span class="note">' + L('figures live again', '数据恢复实时') + '</span>', 'undo') : popt('dkIssue', null, L('Issue', '定稿') + ' <span class="note">' + L('freeze the figures', '冻结数据') + '</span>', 'lock')) +
      ((d.aud || 'owner') === 'internal' ? '<div class="note" style="padding:6px 8px">' + L('Internal decks cannot be shared with the Owner. Switch the audience in Presentation settings.', '内部文稿不能发给业主，请在文稿设置中切换对象。') + '</div>' : popt('dkShare', null, L('Share with Owner…', '发给业主…'), 'send')) + '<hr>' +
      popt('dkCopy', deck.id, L('Copy for next week', '复制为下周'), 'copy');
  }
  if(kind === 'more') h = popt('dkTab', 'deck', L('Presentation settings', '文稿设置'), 'gear') + popt('regHistDeck', null, L('Change log of this deck', '此文稿修改记录'), 'hist') + (canDeckEdit() ? popt('dkDel', null, L('Delete presentation', '删除演示文稿'), 'trash') : '') + '<hr><div class="note" style="padding:4px 8px">' + L('Screen language', '界面语言') + '</div><div class="seg" style="margin:0 8px 6px">' + [['en','EN'],['both','EN + 中'],['zh','中']].map(function(o){ return '<button type="button" data-act="lang" data-v="' + o[0] + '" aria-pressed="' + (S.lang === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
  if(kind === 'thumb' && s){
    h = popt('dkPresentHere', null, L('Present from here', '从此页演示'), 'play') + (ed ? popt('dkDup', null, L('Duplicate', '复制'), 'copy') + popt('dkHide', null, s.hidden ? L('Show slide', '显示此页') : L('Hide slide', '隐藏此页') + ' <span class="note">' + L('kept, not presented', '保留但不演示') + '</span>', s.hidden ? 'eye' : 'hide') +
      popt('dkCopyTo', null, L('Copy to another presentation…', '复制到其他演示文稿…'), 'link') +
      (canFreeze(s) ? popt('dkFreeze', null, L('Make editable table', '转为可编辑表格') + ' <span class="note">' + L('stops following the registers', '不再跟随台账') + '</span>', 'table') : '') + (s.type === 'etable' && s.cfg && s.cfg.orig ? popt('dkUnfreeze', null, L('Back to live data', '恢复实时数据'), 'undo') : '') +
      '<hr>' + popt('dkDelSlide', null, L('Delete slide', '删除此页'), 'trash') : '');
  }
  return '<div class="plist dk-menu">' + h + '</div>';
}

/* ---------------- filmstrip thumbnails are kept between redraws: a slide whose page did not change reuses its node ---------------- */
var THUMBS = {}, THUMB_NEXT = {};
function thumbSlot(html, sid){ var k = sid + '.' + slHash(html); THUMB_NEXT[k] = html; return '<div class="dk-fit dk-tw" data-thumb="' + k + '"></div>'; }
function thumbFill(){
  var keep = {};
  $$('.dke-film [data-thumb]').forEach(function(slot){ var k = slot.dataset.thumb, n = THUMBS[k];
    if(!n){ n = document.createElement('div'); n.className = 'dk-sc'; n.innerHTML = THUMB_NEXT[k] || ''; }
    slot.appendChild(n); keep[k] = n; var w = slot.clientWidth; if(w) n.style.transform = 'scale(' + (w / 1280) + ')'; });
  THUMBS = keep; THUMB_NEXT = {};
}

/* ================= inspector ================= */
function inspHtml(deck){
  var tab = S.dkTab || 'content', tabs = [['content', 'Content', '内容'], ['layout', 'Layout', '版面'], ['notes', 'Notes', '备注'], ['deck', 'Presentation', '文稿']];
  var h = '<div class="dki-tabs" role="tablist">' + tabs.map(function(t){ return '<button type="button" role="tab" data-act="dkTab" data-v="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + esc(T1(t[1], t[2])) + '</button>'; }).join('') + '<button type="button" class="ib" data-act="dkInsp" title="' + esc(T('Hide panel', '收起面板')) + '">' + uic('x', 14) + '</button></div><div class="dki-body">';
  try{ h += tab === 'layout' ? inspLayout(deck) : tab === 'notes' ? inspNotes(deck) : tab === 'deck' ? inspDeck(deck) : inspContent(deck); }catch(e){ console.error(e); h += '<p class="note">' + esc(e.message) + '</p>'; }
  return h + '</div>';
}
function builtOf(id){ return (S.dkBuilt || []).filter(function(x){ return x.s.id === id; })[0] || null; }
function inspContent(deck){
  var s = slideById(deck, S.dslide); if(!s) return '';
  var ed = canDeckEdit() && deck.d.status !== 'issued', e = selObj(s), t = SLIDES[s.type], h = '';
  if(e && e.k === 'data') return dataElProps(deck, s, e, ed);
  if(e && e.k !== 'main') h += '<p class="note dki-sel">' + uic('shape', 13) + ' ' + L('Selected: ' + EL_KINDS[e.k].en + '. Colours and text style are in the bar above the slide; position in Layout.', '已选：' + EL_KINDS[e.k].zh + '。颜色和文字样式在页面上方的工具条；位置在「版面」。') + '</p>';
  h += '<div class="dk-pt">' + esc(T1(t.en, t.zh)) + '</div>' + ownerGapHtml(ownerGaps(deck, s), ed, false);
  if(s.type !== 'cover'){
    h += pRow(L('Title', '标题'), pIn('title.en', s.title && s.title.en, ed, 'English') + pIn('title.zh', s.title && s.title.zh, ed, '中文'));
    var x = builtOf(s.id), sug = x ? suggestHead(s, x.data) : null;
    if(sug && ed){ var cur = s.title || {}, lang = deck.d.lang || 'en', show = lang === 'zh' ? sug.zh : sug.en, same0 = (lang === 'zh' ? cur.zh : cur.en) === show;
      if(!same0) h += '<div class="dk-sug"><span class="dk-sugl">' + uic('spark', 13) + ' ' + L('Suggested headline from the data', '根据数据建议的标题') + '</span><q>' + esc(show) + '</q>' + (lang === 'both' ? '<q class="zh2">' + esc(sug.zh) + '</q>' : '') + '<button type="button" class="btn sm" data-act="dkSuggest">' + L('Use this', '使用此标题') + '</button></div>'; }
    if(['section', 'blank'].indexOf(s.type) < 0) h += pRow(L('Subtitle / key message', '副标题 / 重点结论'), pIn('cfg.msg', s.cfg && s.cfg.msg, ed, T('One line under the title (optional)', '标题下方的一句话（可选）')));
  }
  h += slideProps(deck, s, ed, 'main');
  if(['cover', 'section', 'text', 'blank'].indexOf(s.type) < 0) h += pRow(L('Notes box', '说明框'), '<textarea class="in" rows="3" data-sp="cfg.side" data-fk="sp:' + esc(S.dslide) + ':side"' + (ed ? '' : ' disabled') + ' placeholder="' + esc(T('Your comments on this slide, one point per line', '对此页的说明，每行一条')) + '">' + esc((s.cfg && s.cfg.side) || '') + '</textarea>', L('Shown under the content. The data stays live.', '显示在内容下方；数据仍实时更新。'));
  return h;
}
function dataElProps(deck, s, e, ed){
  if(!okId(e.id)) return ''; var pre = 'els#' + esc(e.id), el0 = elById(s, e.id) || e, pseudo = {id:s.id, type:el0.type, cfg:el0.cfg || {}, title:el0.ttl};
  var h = '<div class="dk-pt">' + uic('chart', 13) + ' ' + L('Data block', '数据区块') + '</div>' + ownerGapHtml(ownerGaps(deck, {cfg:el0.cfg || {}}), ed, false) +
    pRow(L('Shows', '内容'), pSel(pre + '.type', el0.type, DATA_EL_TYPES.map(function(t){ return [t, T1(SLIDES[t].en, SLIDES[t].zh)]; }), ed)) +
    pRow(L('Heading', '小标题'), pIn(pre + '.ttl.en', el0.ttl && el0.ttl.en, ed, 'English') + pIn(pre + '.ttl.zh', el0.ttl && el0.ttl.zh, ed, '中文'), L('Leave both empty for no heading.', '两栏都留空即不显示小标题。'));
  var inner = slideProps(deck, pseudo, ed, true).replace(/data-sp="/g, function(){ return 'data-sp="' + pre + '.'; }).replace(/data-fk="sp:/g, function(){ return 'data-fk="sp:' + esc(e.id) + ':'; }).replace(/data-act="(dkColMv|dkUnhide|dkClearFx)"/g, function(m, a){ return 'data-act="' + a + '" data-hp="' + pre + '"'; });
  return h + inner + (ed ? '<div class="row" style="margin-top:6px"><button type="button" class="btn sm" data-act="elDel">' + uic('trash', 13) + ' ' + L('Remove block', '删除区块') + '</button></div>' : '');
}
function inspLayout(deck){
  var s = slideById(deck, S.dslide); if(!s) return ''; var ed = canDeckEdit() && deck.d.status !== 'issued', c = s.cfg || {}, e = selObj(s), h = '';
  if(e){ var r = e.k === 'main' ? mainRect(s) : e, line = e.k === 'arrow' || e.k === 'line';
    h += '<div class="dk-pt">' + esc(e.k === 'main' ? T('Slide content block', '本页内容区块') : T1(EL_KINDS[e.k].en, EL_KINDS[e.k].zh)) + '</div><div class="dk-xywh">' + [['x', 'X'], ['y', 'Y'], ['w', line ? 'ΔX' : T('W', '宽')], ['h', line ? 'ΔY' : T('H', '高')]].map(function(f){ return '<label>' + esc(f[1]) + '<input class="in" type="number" step="1" data-lp="' + f[0] + '" data-lid="' + esc(e.id) + '" data-fk="lp:' + esc(e.id) + ':' + f[0] + '" value="' + Math.round(r[f[0]] || 0) + '"' + (ed ? '' : ' disabled') + '></label>'; }).join('') + '</div><p class="note">' + L('Slide is 1280 × 720. Arrow keys nudge by 1, Shift+arrow by 10.', '页面尺寸 1280 × 720。方向键移动 1，Shift+方向键移动 10。') + '</p>';
    if(e.k === 'data') h += pRow(L('Text size', '文字大小'), sizeSeg(e.cfg && e.cfg.size, 'els#' + e.id + '.cfg.size', ed));
    if(e.k !== 'main') h += '<div class="row">' + '<button type="button" class="btn sm" data-act="elZ" data-v="1">' + uic('up', 13) + ' ' + L('To front', '置顶') + '</button><button type="button" class="btn sm" data-act="elZ" data-v="-1">' + uic('down', 13) + ' ' + L('To back', '置底') + '</button><button type="button" class="btn sm" data-act="elDup">' + uic('copy', 13) + ' ' + L('Duplicate', '复制') + '</button></div>';
    h += '<hr class="dki-hr">'; }
  if(hasMain(s)){
    h += '<div class="dk-pt">' + L('This slide', '本页') + '</div>' + pRow(L('Text size', '文字大小'), sizeSeg(c.size, 'cfg.size', ed), L('Auto fits the content to its space.', '「自动」会按空间放大或缩小内容。'));
    h += pRow(L('Content block', '内容区块'), '<div class="dk-presets">' + [['full', 'Full width', '整页'], ['l62', 'Left ⅔', '左 ⅔'], ['l50', 'Left ½', '左 ½'], ['r50', 'Right ½', '右 ½'], ['t60', 'Top ⅔', '上 ⅔']].map(function(p){ return '<button type="button" class="dk-pre" data-act="dkBoxPreset" data-v="' + p[0] + '"' + (ed ? '' : ' disabled') + ' title="' + esc(T1(p[1], p[2])) + '"><i class="p-' + p[0] + '"></i><span>' + esc(T1(p[1], p[2])) + '</span></button>'; }).join('') + '</div>', L('Or drag the content on the slide and pull its handles. Leaves room for data blocks, photos or notes.', '也可直接在页面上拖动内容并拉动控制点，为数据区块、照片或说明留出位置。'));
  }
  if(s.type === 'blank') h += pChk('cfg.noHead', c.noHead, L('No title (full canvas)', '不要标题（整页画布）'), ed);
  var els = s.els || [];
  h += '<div class="dk-pt">' + uic('layers', 13) + ' ' + L('On this slide', '本页元素') + '</div><div class="dk-layers">' + (hasMain(s) ? '<button type="button" class="dk-lay' + (S.elSel === '@main' ? ' on' : '') + '" data-act="dkSelEl" data-v="@main">' + uic('table', 13) + ' ' + L('Slide content', '本页内容') + ' <span class="note">' + esc(T1(SLIDES[s.type].en, SLIDES[s.type].zh)) + '</span></button>' : '') +
    els.slice().reverse().map(function(x){ var nm0 = x.k === 'data' ? T1(SLIDES[x.type] ? SLIDES[x.type].en : '', SLIDES[x.type] ? SLIDES[x.type].zh : '') : T1(EL_KINDS[x.k] ? EL_KINDS[x.k].en : x.k, EL_KINDS[x.k] ? EL_KINDS[x.k].zh : ''); return '<button type="button" class="dk-lay' + (S.elSel === x.id ? ' on' : '') + '" data-act="dkSelEl" data-v="' + esc(x.id) + '">' + uic(x.k === 'data' ? 'chart' : x.k === 'image' ? 'camera' : x.k === 'text' || x.k === 'note' ? 'textT' : 'shape', 13) + ' ' + esc(nm0) + (x.t ? ' <span class="note">' + esc(String(x.t).slice(0, 24)) + '</span>' : x.ttl && (x.ttl.en || x.ttl.zh) ? ' <span class="note">' + esc(T1(x.ttl.en, x.ttl.zh).slice(0, 24)) + '</span>' : '') + '</button>'; }).join('') + (els.length || hasMain(s) ? '' : '<p class="note">' + L('Nothing yet — use Insert.', '还没有元素，可用「插入」。') + '</p>') + '</div>';
  return h;
}
function inspNotes(deck){
  var s = slideById(deck, S.dslide), ed = canDeckEdit() && deck.d.status !== 'issued', h = '';
  if(s) h += pRow(L('Speaker notes', '演讲备注'), '<textarea class="in" rows="8" data-sp="note" data-fk="sp:' + esc(S.dslide) + ':note"' + (ed ? '' : ' disabled') + ' placeholder="' + esc(T('Only you see these — here and in present mode (press N). Saved into the PowerPoint notes.', '只有你能看到：在此处和演示时（按 N）显示，也会存入 PowerPoint 备注。')) + '">' + esc(s.note || '') + '</textarea>');
  var fbs = ((STORE && STORE.fb) || []).filter(function(x){ return x.item_id === deck.id; });
  h += '<div class="dk-pt">' + L('Owner comments', '业主意见') + ' <span class="mono muted">' + fbs.length + '</span></div>' + (fbs.length ? fbs.map(function(x){ return '<div class="fb' + (x.status === 'open' ? ' open' : '') + '"><div class="ahead"><b>' + esc(x.author_name || '') + '</b> <span class="mono muted">' + esc(x.reg_no || '') + '</span> <span class="muted">' + esc(fmtTime(x.created_at)) + '</span></div><div style="white-space:pre-wrap">' + esc(x.body) + '</div>' + (x.reply ? '<div class="note">↳ ' + esc(x.reply) + '</div>' : '') + (canTeamEdit() && x.status === 'open' ? '<div class="row"><input class="in" id="rp_' + esc(x.id) + '" placeholder="' + esc(T('Reply (optional)', '回复（可选）')) + '"><button type="button" class="btn sm" data-act="fbResolve" data-v="' + esc(x.id) + '">' + L('Reply & resolve', '回复并关闭') + '</button></div>' : '') + '</div>'; }).join('') : '<p class="note">' + L('Comments the Owner leaves on the shared copy appear here.', '业主在分享版本上留下的意见会显示在这里。') + '</p>');
  return h;
}
function inspDeck(deck){
  var d = deck.d, ed = canDeckEdit() && d.status !== 'issued', dis = ed ? '' : ' disabled', ms = meetingRecs(), th = themeOf(deck);
  return '<div class="dk-pt">' + L('Presentation', '文稿') + '</div>' +
    '<label class="fl">' + L('Title', '标题') + '<input class="in" data-dk="title" data-fk="dk:title" value="' + esc(d.title || '') + '"' + dis + ' placeholder="Weekly progress meeting"></label>' +
    '<label class="fl">' + L('Title (中文)', '中文标题') + '<input class="in" data-dk="titleZh" data-fk="dk:titleZh" value="' + esc(d.titleZh || '') + '"' + dis + ' placeholder="周进度汇报会"></label>' +
    '<label class="fl">' + L('Data as of', '数据日期') + '<input class="in" type="date" data-dk="date" data-fk="dk:date" value="' + esc(d.date || '') + '"' + dis + '></label>' +
    '<div class="fl"><span class="flab">' + L('Slide language', '页面语言') + '</span><div class="seg">' + [['en','EN'],['both','EN + 中'],['zh','中文']].map(function(o){ return '<button type="button"' + (ed ? ' data-act="dkSet" data-k="lang" data-v="' + o[0] + '"' : ' disabled') + ' aria-pressed="' + ((d.lang || 'en') === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div></div>' +
    '<div class="fl"><span class="flab">' + L('Audience', '对象') + '</span><div class="seg">' + [['owner','Owner mode','业主模式'],['internal','Internal','内部']].map(function(o){ return '<button type="button"' + (ed ? ' data-act="dkSet" data-k="aud" data-v="' + o[0] + '"' : ' disabled') + ' aria-pressed="' + ((d.aud || 'owner') === o[0]) + '">' + L(o[1], o[2]) + '</button>'; }).join('') + '</div><span class="note">' + ((d.aud || 'owner') === 'internal' ? L('Internal: every record and field of the team registers can appear.', '内部：团队台账的全部记录和字段都可出现。') : L('Owner mode: only Owner-visible fields; registers that publish to the Owner show only records marked “Show in Owner plan”.', '业主模式：只显示「业主可见」字段；发布给业主的台账只显示标记「显示于业主计划」的记录。')) + '</span></div>' +
    '<label class="fl">' + L('For meeting', '对应会议') + '<select class="in" data-dk="meeting"' + dis + '><option value="">' + esc(T('— none —', '— 无 —')) + '</option>' + ms.map(function(x){ return '<option value="' + esc(x.r.id) + '"' + (d.meeting === x.r.id ? ' selected' : '') + '>' + esc(x.date + ' · ' + recLabel(x.r)) + '</option>'; }).join('') + '</select></label>' +
    '<label class="fl">' + L('Presented by', '汇报人') + '<input class="in" data-dk="presenter" data-fk="dk:presenter" value="' + esc(d.presenter || '') + '"' + dis + '></label>' +
    '<div class="dk-pt">' + L('Look', '样式') + '</div>' +
    '<div class="fl"><span class="flab">' + L('Page design', '页面设计') + '</span><div class="dk-styles">' + [['sheet', 'Drawing sheet', '工程图框', 'Frame and title block, headline titles', '图框与标题栏，结论式标题'], ['classic', 'Classic band', '经典色带', 'Coloured band on top', '顶部色带']].map(function(o){ return '<button type="button" class="dk-sty' + (th.style === o[0] ? ' on' : '') + '"' + (ed ? ' data-act="dkThemeSet" data-k="style" data-v="' + o[0] + '"' : ' disabled') + '><i class="sty-' + o[0] + '"></i><b>' + L(o[1], o[2]) + '</b><span class="note">' + esc(T1(o[3], o[4])) + '</span></button>'; }).join('') + '</div></div>' +
    (th.style === 'sheet' ? '<label class="chk"><input type="checkbox" data-th="agenda"' + (th.agenda ? ' checked' : '') + dis + '>' + L('Agenda bar on top of each slide', '每页顶部显示议程条') + '</label><p class="note">' + L('The agenda lists your section dividers and highlights the current one. Add slides of type “Section divider” to fill it.', '议程条列出各「分节页」并高亮当前一节。添加「分节页」即可生成。') + '</p>' : '') +
    '<div class="dk-barg">' + themeBar(deck, ed) + '</div>' +
    (ed ? '<p class="note">' + L('Registers set to “Only me” are never used in presentations.', '「仅自己可见」的台账不会用于演示文稿。') + '</p>' : '');
}

/* ================= suggested headlines (only applied when the user clicks “Use this”) ================= */
function fx1(v){ return String(Math.round(Math.abs(v) * 10) / 10); }
function pl(n, w, ws){ return n === 1 ? w : (ws || w + 's'); }
function tEn(t){ return t ? (t.en || t.zh || '') : ''; }
function tZh(t){ return t ? (t.zh || t.en || '') : ''; }
function suggestHead(s, d){
  if(!d || d.err || d.loading) return null; var t = s.type;
  if(t === 'summary'){ if(d.v == null) return null; var lt = d.late ? '; ' + d.late + ' ' + pl(d.late, 'milestone') + ' late' : '', ltz = d.late ? '，' + d.late + ' 个里程碑延误' : '';
    return d.v <= -0.5 ? {en:'Progress ' + fx1(d.v) + ' pp behind plan' + lt, zh:'进度落后计划 ' + fx1(d.v) + ' 个百分点' + ltz} : d.v >= 0.5 ? {en:'Progress ' + fx1(d.v) + ' pp ahead of plan' + lt, zh:'进度超前计划 ' + fx1(d.v) + ' 个百分点' + ltz} : {en:'Progress on plan' + lt, zh:'进度与计划持平' + ltz}; }
  if(t === 'kpi'){ if(!d.tot) return null; return {en:(d.pct != null ? d.pct + '% complete overall — ' : '') + d.od + ' ' + pl(d.od, 'item') + ' overdue, ' + d.due + ' due in the next 14 days', zh:(d.pct != null ? '总体完成 ' + d.pct + '%：' : '') + d.od + ' 项逾期，' + d.due + ' 项将在 14 天内到期'}; }
  if(t === 'matrix'){ if(!d.cols || !d.cols.length || !d.total) return null; var cs = d.cols.map(function(c, i){ return {c:c, v:d.total.cells[i] && d.total.cells[i].v}; }).filter(function(x){ return x.v != null; });
    if(d.val === 'progress' && cs.length > 1){ cs.sort(function(a, b){ return b.v - a.v; }); var hi = cs[0], lo = cs[cs.length - 1]; return {en:'Block ' + hi.c.v + ' leads at ' + hi.v + '%; Block ' + lo.c.v + ' trails at ' + lo.v + '%', zh:hi.c.v + ' 区进度领先（' + hi.v + '%），' + lo.c.v + ' 区落后（' + lo.v + '%）'}; }
    return d.total.all ? {en:(d.reg ? tEn(d.reg) + ': ' : '') + d.total.all.t + (d.val === 'open' ? ' open items' : d.val === 'count' ? ' items' : ' complete'), zh:(d.reg ? tZh(d.reg) + '：' : '') + (d.val === 'open' ? '未完成 ' : d.val === 'count' ? '共 ' : '完成 ') + d.total.all.t + (d.val === 'progress' ? '' : ' 项')} : null; }
  if(t === 'lookahead'){ var n = d.rows.length, od = d.rows.filter(function(r){ return r.od; }).length, w = Math.round((d.to - d.from + 1) / 7); return {en:n + ' ' + pl(n, 'activity', 'activities') + ' in the ' + w + '-week look-ahead' + (od ? '; ' + od + ' already overdue' : ''), zh:'未来 ' + w + ' 周共 ' + n + ' 项工作' + (od ? '，其中 ' + od + ' 项已逾期' : '')}; }
  if(t === 'table'){ var rr2 = d.rows.filter(function(r){ return !r.g; }), n2 = rr2.length, od2 = rr2.filter(function(r){ return r.od; }).length; return {en:tEn(d.reg) + ': ' + n2 + ' ' + pl(n2, 'item') + (od2 ? ', ' + od2 + ' overdue' : ''), zh:tZh(d.reg) + '共 ' + n2 + ' 项' + (od2 ? '，其中 ' + od2 + ' 项逾期' : '')}; }
  if(t === 'breakdown'){ var all = 0, dn = 0, worst = null; d.groups.forEach(function(g){ all += g.n; dn += g.done; if(!worst || g.n - g.done > worst.n - worst.done) worst = g; }); if(!all) return null; return {en:dn + ' of ' + all + ' complete' + (worst && worst.n > worst.done ? '; most open in ' + worst.label + ' (' + (worst.n - worst.done) + ')' : ''), zh:'共 ' + all + ' 项，已完成 ' + dn + ' 项' + (worst && worst.n > worst.done ? '；' + worst.label + ' 未完成最多（' + (worst.n - worst.done) + ' 项）' : '')}; }
  if(t === 'punch') return {en:d.open + ' punch ' + pl(d.open, 'item') + ' open' + (d.od ? ', ' + d.od + ' past due' : '') + (d.closedWk != null ? '; ' + d.closedWk + ' closed this week' : ''), zh:'尾项未关闭 ' + d.open + ' 项' + (d.od ? '，超期 ' + d.od + ' 项' : '') + (d.closedWk != null ? '；本周关闭 ' + d.closedWk + ' 项' : '')};
  if(t === 'actions'){ if(!d.meeting) return null; var op = d.rows.filter(function(r){ return !r.done; }).length, od3 = d.rows.filter(function(r){ return r.od; }).length; return {en:op + ' open ' + pl(op, 'action') + ' from ' + d.meeting.no + (od3 ? '; ' + od3 + ' overdue' : ''), zh:d.meeting.no + ' 尚有 ' + op + ' 项待办' + (od3 ? '，其中 ' + od3 + ' 项逾期' : '')}; }
  if(t === 'scurve'){ if(d.nowAct == null || d.nowPlan == null) return null; var v = d.nowAct - d.nowPlan; return {en:'Actual ' + fx1(d.nowAct) + '% against ' + fx1(d.nowPlan) + '% planned — ' + (v <= -0.5 ? fx1(v) + ' pp behind' : v >= 0.5 ? fx1(v) + ' pp ahead' : 'on plan'), zh:'实际 ' + fx1(d.nowAct) + '%，计划 ' + fx1(d.nowPlan) + '%，' + (v <= -0.5 ? '落后 ' + fx1(v) + ' 个百分点' : v >= 0.5 ? '超前 ' + fx1(v) + ' 个百分点' : '与计划持平')}; }
  if(t === 'timeline' || t === 'gantt' || t === 'mstable'){
    var its = t === 'mstable' ? d.rows.map(function(r){ return {t:r.t, st:r.st, fc:r.n, slip:r.slip}; }) : [].concat.apply([], (d.lanes || []).map(function(l){ return l.items.filter(function(x){ return x.ms; }).map(function(x){ return {t:x.t, st:x.st, fc:x.fc, slip:x.slip}; }); }));
    if(!its.length) return null; var late = its.filter(function(x){ return x.st === 'late'; }).length, A = d.asOf != null ? d.asOf : asOfN(), nx = its.filter(function(x){ return x.st !== 'done' && x.fc != null && x.fc >= A; }).sort(function(a, b){ return a.fc - b.fc; })[0];
    var en = late ? late + ' ' + pl(late, 'milestone') + ' late' : 'No milestone late', zh = late ? late + ' 个里程碑延误' : '没有延误的里程碑';
    if(nx){ en += '; next: ' + tEn(nx.t) + ' on ' + fmtD(nx.fc) + (nx.slip > 0 ? ' (+' + nx.slip + ' d)' : ''); zh += '；下一个：' + tZh(nx.t) + '（' + n2d(nx.fc).slice(5) + (nx.slip > 0 ? '，延后 ' + nx.slip + ' 天' : '') + '）'; }
    return {en:en, zh:zh}; }
  return null;
}

/* ================= add-slide / data-block gallery (live previews) ================= */
function galleryModal(m){
  var deck = curDeck(); if(!deck) return {title:'', html:''};
  if(!m.thumbs){ m.thumbs = {}; DK_GAL.forEach(function(g){ g[3].forEach(function(t){ if(!SLIDES[galType(t)] || (m.mode === 'el' && DATA_EL_TYPES.indexOf(galType(t)) < 0)) return; try{ var s = galSlide(t); if(!s) return; var b = deckBuild({id:deck.id, d:Object.assign({}, deck.d, {slides:[s], status:'draft', snap:null})}); m.thumbs[t] = b[0] ? b[0].pages[0] : ''; }catch(e){ console.error(e); m.thumbs[t] = ''; } }); }); }
  var h = DK_GAL.map(function(g){ var ts = g[3].filter(function(t){ return m.thumbs[t] != null; }); if(!ts.length) return '';
    return '<h3 class="dk-galh">' + L(g[1], g[2]) + '</h3><div class="dk-gal">' + ts.map(function(t){ return '<button type="button" class="dk-galc" data-act="dkGalAdd" data-v="' + esc(t) + '">' + scaled(m.thumbs[t]) + '<b>' + esc(galName(t)) + '</b><span class="note">' + esc(galDesc(t)) + '</span></button>'; }).join('') + '</div>'; }).join('');
  return {title:m.mode === 'el' ? L('Insert a data block', '插入数据区块') : L('Add a slide', '添加页面'), wide:true, html:(m.mode === 'el' ? '<p class="note" style="margin-top:0">' + L('A data block is placed on the current slide next to its content; drag and resize it like any element. It follows the registers until the presentation is issued.', '数据区块会放在当前页内容旁边，可像其他元素一样拖动和缩放；在定稿前一直跟随台账更新。') + '</p>' : '<p class="note" style="margin-top:0">' + L('Previews use your live data. The new slide goes after the current one.', '预览使用实时数据；新页面会放在当前页之后。') + '</p>') + h,
    foot:'<button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button>'};
}
DECK_MODALS.dkGallery = galleryModal;
function insertDataEl(type){
  var deck = curDeck(), s = curSlide(), ps = type && type.indexOf('p:') === 0 ? galSlide(type) : null; if(ps) type = ps.type; if(!deck || !s || !SLIDES[type]) return;
  var e = {id:uid('e'), k:'data', type:type, cfg:ps ? ps.cfg : SLIDES[type].def(), ttl:ps ? ps.title : {en:SLIDES[type].t[0], zh:SLIDES[type].t[1]}}, r = mainRect(s), box = null;
  if(hasMain(s) && !s.box && s.type !== 'blank'){ var lw = Math.round(r.w * 0.56); box = {x:r.x, y:r.y, w:lw - 14, h:r.h}; e.x = r.x + lw + 14; e.y = r.y; e.w = r.w - lw - 14; e.h = r.h; }
  else { var area = ['cover', 'section'].indexOf(s.type) >= 0 ? {x:52, y:150, w:1176, h:470} : s.box && hasMain(s) ? freeArea(s) : r, n = (s.els || []).filter(isDataEl).length;
    if(area.free){ e.x = area.x; e.y = area.y; e.w = area.w; e.h = area.h; }
    else { e.w = Math.min(area.w, 620); e.h = Math.min(area.h, 400); e.x = area.x + Math.round((area.w - e.w) / 2) + n * 24; e.y = area.y + Math.round((area.h - e.h) / 2) + n * 24; } }
  S.elSel = e.id; S.dkTab = 'content'; S.dkInsp = true;
  saveEls(function(sl){ if(box) sl.box = box; sl.els.push(e); }).then(function(){ toast(box ? T('Block added on the right; the slide content moved left to make room', '区块已放在右侧；本页内容已左移让出位置') : T('Block added', '已添加区块'), {act:'dkUndo', label:T('Undo', '撤销')}); });
}
/* the largest free space next to a moved content block (right, left or below), not covered by other blocks */
function freeArea(s){ var a = stdBody(s), m = mainRect(s), g = 28, R = a.x + a.w, B = a.y + a.h;
  var c = [{x:m.x + m.w + g, y:a.y, w:R - (m.x + m.w + g), h:a.h}, {x:a.x, y:a.y, w:m.x - g - a.x, h:a.h}, {x:a.x, y:m.y + m.h + 20, w:a.w, h:B - (m.y + m.h + 20)}, {x:a.x, y:a.y, w:a.w, h:m.y - 20 - a.y}];
  var used = (s.els || []).filter(isBoxy); c = c.filter(function(q){ return q.w >= 240 && q.h >= 150 && !used.some(function(e){ return e.x < q.x + q.w && e.x + e.w > q.x && e.y < q.y + q.h && e.y + e.h > q.y; }); });
  c.sort(function(p, q){ return q.w * q.h - p.w * p.h; }); return c[0] ? Object.assign(c[0], {free:true}) : a; }
function stdBody(s){ var c = (S.dkStd || {})[s.id]; if(c) return c; return themeOf(curDeck()).style === 'classic' ? {x:48, y:96, w:1184, h:560} : {x:52, y:150, w:1176, h:470}; }
function boxPreset(v){
  var deck = curDeck(), s = curSlide(); if(!deck || !s) return; var a = stdBody(s), g = 28, b = null;
  if(v === 'l62') b = {x:a.x, y:a.y, w:Math.round(a.w * 0.62) - g / 2, h:a.h};
  if(v === 'l50') b = {x:a.x, y:a.y, w:Math.round(a.w / 2) - g / 2, h:a.h};
  if(v === 'r50') b = {x:a.x + Math.round(a.w / 2) + g / 2, y:a.y, w:Math.round(a.w / 2) - g / 2, h:a.h};
  if(v === 't60') b = {x:a.x, y:a.y, w:a.w, h:Math.round(a.h * 0.62) - g / 2};
  saveEls(function(sl){ sl.box = b; });
}

/* ================= stage sizing ================= */
function fitStage(){
  var w = $('.dke-sw'), st = $('.dk-stage'); if(!w || !st) return;
  var W = w.clientWidth - (window.innerWidth < 760 ? 16 : 56), H = w.clientHeight - (window.innerWidth < 760 ? 16 : 48), sc = Math.max(0.1, Math.min(W / 1280, H / 720));
  st.style.width = Math.floor(1280 * sc) + 'px'; st.style.height = Math.floor(720 * sc) + 'px'; if(st.firstElementChild) st.firstElementChild.style.transform = 'scale(' + sc + ')';
  var s = curSlide(); if(s && !s.box && hasMain(s)){ var n = mainNode(); if(n){ S.dkStd = S.dkStd || {}; S.dkStd[s.id] = {x:n.offsetLeft, y:n.offsetTop, w:n.offsetWidth, h:n.offsetHeight}; } }
}

/* ================= events ================= */
document.addEventListener('click', function(ev){
  var el = ev.target.closest && ev.target.closest('[data-act]'); if(!el) return;
  var act = el.dataset.act, v = el.dataset.v, deck = curDeck();
  switch(act){
    case 'dkMenu': if(deck) openPick('menu', {html:dkMenuHtml(v, deck, el), w:v === 'insert' ? 300 : v === 'more' ? 250 : 270}, el); break;
    case 'dkThumbMenu': ev.stopPropagation(); if(!deck) return; if(S.dslide !== v){ S.dslide = v; S.dpage = 0; S.elSel = null; renderMain(); el = $('.dk-t.on .dk-tm') || el; } openPick('menu', {html:dkMenuHtml('thumb', deck, el), w:280}, el); break;
    case 'dkTab': S.dkTab = v; S.dkInsp = true; closePop(); renderMain(); break;
    case 'dkInsp': S.dkInsp = !S.dkInsp; renderMain(); break;
    case 'dkGal': closePop(); if(deck) openModal({kind:'dkGallery', mode:v}); break;
    case 'dkGalAdd': (function(){ var m = S.modal; closeModal(); if(!deck) return; if(m && m.mode === 'el'){ insertDataEl(v); return; } var s = galSlide(v); if(!s) return; addSlideTo(deck, s, S.dslide).then(function(){ S.dslide = s.id; S.dpage = 0; S.elSel = null; renderMain(); var on = $('.dk-t.on'); if(on && on.scrollIntoView) on.scrollIntoView({block:'nearest'}); }); })(); break;
    case 'dkSuggest': (function(){ var s = curSlide(), x = s && builtOf(s.id), sug = x && suggestHead(s, x.data); if(!sug) return; var sl = clone(deck.d.slides || []); sl.forEach(function(q){ if(q.id === s.id) q.title = {en:sug.en, zh:sug.zh}; }); saveSlides(deck, sl, true); toast(T('Headline applied', '已套用标题'), {act:'dkUndo', label:T('Undo', '撤销')}); })(); break;
    case 'dkSize': (function(){ var p = el.dataset.p; if(!p) return; var sl = clone(deck.d.slides || []), s = sl.filter(function(q){ return q.id === S.dslide; })[0]; if(!s) return; setPath(s, p, v || null); saveSlides(deck, sl, true); })(); break;
    case 'dkBoxPreset': boxPreset(v === 'full' ? null : v); break;
    case 'dkBoxReset': saveEls(function(sl){ sl.box = null; }); break;
    case 'dkSelEl': S.elSel = v; refreshElUi(); renderMain(); break;
    case 'dkThemeSet': if(deck){ var t0 = Object.assign({}, deck.d.theme || {}); t0[el.dataset.k] = v; deckEdit(deck, {theme:t0}, true); } break;
  }
});
/* a choice in a toolbar / slide menu closes that menu (Copy to… opens its own list instead) */
document.addEventListener('click', function(ev){ var el = ev.target.closest && ev.target.closest('.dk-menu [data-act]'); if(!el || el.tagName === 'LABEL' || el.dataset.act === 'dkCopyTo') return; if(S.pop && $('.dk-menu')) closePop(); });
/* position fields in the Layout tab */
document.addEventListener('change', function(ev){
  var el = ev.target, k = el.dataset && el.dataset.lp; if(!k) return; var v = Math.round(+el.value); if(!isFinite(v)) return;
  var s = curSlide(), id = el.dataset.lid; if(!s || !id) return;
  if(id === '@main'){ var r = mainRect(s); r[k] = v; if(k === 'w') r.w = Math.max(120, v); if(k === 'h') r.h = Math.max(80, v); saveEls(function(sl){ sl.box = r; }); return; }
  saveEls(function(sl){ sl.els.forEach(function(e){ if(e.id === id) e[k] = v; }); });
});
/* editable tables: Tab / Shift+Tab moves to the next / previous cell */
document.addEventListener('keydown', function(ev){
  if(ev.key !== 'Tab') return; var el = ev.target; if(!el || !el.dataset || !el.dataset.ed || !el.isContentEditable || !el.closest('.sl-et')) return;
  var all = $$('.dk-stage .sl-et [data-ed]'), i = all.indexOf(el), nx = all[i + (ev.shiftKey ? -1 : 1)]; ev.preventDefault(); if(!nx) return;
  S.dkFocus = nx.dataset.ed; el.blur(); setTimeout(function(){ if(!S.dkFocus) return; var f = $('.dk-stage [data-ed="' + S.dkFocus + '"]'); S.dkFocus = null; if(f){ f.focus(); try{ var r = document.createRange(); r.selectNodeContents(f); var sl = window.getSelection(); sl.removeAllRanges(); sl.addRange(r); }catch(e){} } }, 40);
}, true);
