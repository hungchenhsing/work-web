/* work-web v2 · presentation layout: themes and logos, free elements drawn on top of any slide (text box, note, box,
   circle, arrow, line, image), the editable table and blank slides, and the in-editor tools to place and change them. */
'use strict';

/* ---------------- theme ---------------- */
var THEMES = {
  navy:{en:'Navy', zh:'深蓝', p:'#123660', p2:'#1D4E89', p3:'#0E2A4C', acc:'#E8930C'},
  teal:{en:'Teal', zh:'青绿', p:'#0B4744', p2:'#0F6B64', p3:'#083633', acc:'#E8930C'},
  green:{en:'Solar green', zh:'光伏绿', p:'#1E4A2C', p2:'#2D6B40', p3:'#163822', acc:'#E2A400'},
  graphite:{en:'Graphite', zh:'石墨', p:'#22272E', p2:'#3A424D', p3:'#171B20', acc:'#E8930C'},
  red:{en:'China red', zh:'中国红', p:'#7A1418', p2:'#A31D24', p3:'#5C0F12', acc:'#C9A227'}
};
function themeOf(deck){
  /* the page design (style) is the deck's own: decks and publications made before v2.4 have none and keep the classic look;
     new decks are stamped when created (createDeck), so changing the team default never re-designs existing decks */
  var own = (deck && deck.d && deck.d.theme) || {}, t = Object.assign({color:'navy', foot:'title', conf:'', agenda:false}, own._pub ? {} : (cfg().deckTheme || {}), own), pal = THEMES[t.color] || THEMES.navy;
  t.style = own.style === 'sheet' ? 'sheet' : 'classic'; t.agenda = !!t.agenda;
  t.pal = pal; t.logos = !!(t.logoL || t.logoR); return t;
}
function themeVars(t){ var p = t.pal || THEMES.navy; return '--sl-p:' + p.p + ';--sl-p2:' + p.p2 + ';--sl-p3:' + p.p3 + ';--sl-acc:' + p.acc; }
function logoUrl(l){ return l ? (l.src || (l.path && STORE && STORE.fileUrl(l.path)) || '') : ''; }
function logosHtml(t, where){
  if(!t.logos) return '';
  var a = logoUrl(t.logoL), b = logoUrl(t.logoR);
  return '<div class="sl-logos ' + where + '">' + (a ? '<img src="' + esc(a) + '" alt="">' : '') + (b ? '<img src="' + esc(b) + '" alt="">' : '') + '</div>';
}
function footHtml(t, hdr, n, total){
  var left = t.foot === 'project' ? hdr.proj : t.foot === 'custom' ? (t.footText || '') : t.foot === 'none' ? '' : hdr.title;
  return '<div class="sl-f"><span>' + esc(left) + '</span><span>' + esc(hdr.date) + (t.conf ? ' · <b class="sl-conf">' + esc(t.conf) + '</b>' : '') + '</span><span>' + n + ' / ' + total + '</span></div>';
}

/* ---------------- free elements ---------------- */
var EL_COLORS = ['#1A1D21', '#D2453F', '#E8930C', '#2E9E6A', '#2F6DB5', '#7564B5', '#FFFFFF'];
var EL_FILLS = ['', '#FFFFFF', '#FFF3B0', '#E5EDF7', '#E3F1E8', '#FBE8E8', '#123660'];
var DATA_EL_TYPES = ['summary', 'kpi', 'matrix', 'breakdown', 'punch', 'timeline', 'gantt', 'mstable', 'scurve', 'lookahead', 'photos', 'table', 'actions'];
function okId(id){ return /^[\w-]{1,40}$/.test(String(id == null ? '' : id)); }
var EL_KINDS = {data:{en:'Data block', zh:'数据区块'}, text:{en:'Text', zh:'文字'}, note:{en:'Note', zh:'便签'}, rect:{en:'Box', zh:'方框'}, ellipse:{en:'Circle', zh:'圆圈'}, arrow:{en:'Arrow', zh:'箭头'}, line:{en:'Line', zh:'直线'}, image:{en:'Image', zh:'图片'}};
function newEl(k){
  var e = {id:uid('e'), k:k, x:440, y:260, w:400, h:120};
  if(k === 'text'){ e.t = T1('Text', '文字'); e.fs = 24; e.c = '#1A1D21'; e.h = 60; }
  if(k === 'note'){ e.t = T1('Note', '说明'); e.fs = 18; e.c = '#1A1D21'; e.f = '#FFF3B0'; e.w = 320; e.h = 110; }
  if(k === 'rect'){ e.c = '#D2453F'; e.lw = 4; e.w = 300; e.h = 140; e.t = ''; e.fs = 20; }
  if(k === 'ellipse'){ e.c = '#D2453F'; e.lw = 4; e.w = 220; e.h = 140; e.t = ''; e.fs = 20; }
  if(k === 'arrow' || k === 'line'){ e.x = 460; e.y = 300; e.w = 260; e.h = 0; e.c = '#D2453F'; e.lw = 5; }
  return e;
}
function safeCol(c, d){ return /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : d; }
function n0(v, d){ v = +v; return isFinite(v) ? v : d; }
function cleanEl(e){ return {id:okId(e.id) ? String(e.id) : 'x', k:EL_KINDS[e.k] ? e.k : 'text', x:n0(e.x, 0), y:n0(e.y, 0), w:n0(e.w, 100), h:n0(e.h, 40), t:e.t == null ? null : String(e.t), fs:clamp(n0(e.fs, 20), 6, 120), c:safeCol(e.c, '#1A1D21'), f:safeCol(e.f, ''), tc:safeCol(e.tc, ''), b:!!e.b, al:['left','center','right'].indexOf(e.al) >= 0 ? e.al : 'left', lw:clamp(n0(e.lw, 4), 1, 30), path:e.path ? String(e.path) : '', src:/^(data:image\/|blob:|https:)/.test(String(e.src || '')) ? String(e.src) : '',
  type:DATA_EL_TYPES.indexOf(e.type) >= 0 && SLIDES[e.type] ? e.type : '', cfg:e.cfg && typeof e.cfg === 'object' ? e.cfg : {}, ttl:e.ttl && typeof e.ttl === 'object' ? {en:String(e.ttl.en || ''), zh:String(e.ttl.zh || '')} : null}; }
function elStyle(e){ return 'left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px;height:' + e.h + 'px;'; }
/* a data block: any slide type drawn into its own box (first page only); its text paths are prefixed so inline edits land on the block */
function dataElHtml(e, i, s, data){
  var tt = e.ttl && (e.ttl.en || e.ttl.zh), zh = S.lang === 'zh', head = tt ? '<div class="sl-dbh" data-ed="els#' + esc(e.id) + '.ttl.' + (zh ? 'zh' : 'en') + '">' + esc(T1(e.ttl.en, e.ttl.zh)) + '</div>' : '';
  var ps = {id:s ? s.id : '', type:e.type, cfg:Object.assign({}, e.cfg, {msg:'', side:''}), title:e.ttl || {en:'', zh:''}}, pages;
  if(!data) pages = [slEmpty('Loading…', '正在加载…')];
  else { try{ pages = slRender(e.type, data, ps, {w:e.w, h:e.h - (tt ? 40 : 0)}); }catch(er){ console.error(er); pages = [slEmpty('This block could not be drawn.', '此区块无法显示。')]; } }
  var body = (pages[0] || '') + (pages.length > 1 ? '<div class="sl-more">' + esc(T('+' + (pages.length - 1) + ' more page(s) not shown — enlarge the block or leave some items out', '另有 ' + (pages.length - 1) + ' 页未显示，可放大区块或隐藏部分内容')) + '</div>' : '');
  body = body.replace(/data-ed="(cfg|title)\./g, function(m, g){ return 'data-ed="els#' + e.id + '.' + g + '.'; });
  return '<div class="sl-el k-data" data-el="' + esc(e.id) + '" data-hp="els#' + esc(e.id) + '" style="' + elStyle(e) + '">' + head + '<div class="sl-dbb">' + fitWrap(body, e.cfg.size) + '</div></div>';
}
function elHtml(e0, i, s, data){
  if(!e0 || !okId(e0.id)) return '';
  var e = cleanEl(e0);
  if(e.k === 'data') return e.type && SLIDE_RENDER[e.type] ? dataElHtml(e, i, s, data) : '';
  var tt = e.t != null ? '<div class="sl-elt" data-edl="els.' + i + '.t" data-raw="1" style="font-size:' + (e.fs || 20) + 'px;color:' + (e.k === 'rect' || e.k === 'ellipse' ? (e.tc || '#1A1D21') : (e.c || '#1A1D21')) + ';font-weight:' + (e.b ? 700 : 400) + ';text-align:' + (e.al || 'left') + '">' + esc(e.t) + '</div>' : '';
  if(e.k === 'text' || e.k === 'note') return '<div class="sl-el k-' + e.k + '" data-el="' + esc(e.id) + '" data-shape="rect" style="' + elStyle(e) + (e.f ? 'background:' + e.f + ';' : '') + (e.k === 'note' ? 'border:1px solid rgba(0,0,0,.12);' : '') + '">' + tt + '</div>';
  if(e.k === 'rect' || e.k === 'ellipse') return '<div class="sl-el k-' + e.k + '" data-el="' + esc(e.id) + '" data-shape="' + (e.k === 'ellipse' ? 'ellipse' : 'rect') + '" style="' + elStyle(e) + 'border:' + (e.lw || 4) + 'px solid ' + (e.c || '#D2453F') + ';' + (e.f ? 'background:' + e.f + ';' : '') + '">' + tt + '</div>';
  if(e.k === 'image'){ var u = e.src || (e.path && STORE && STORE.fileUrl(e.path)) || ''; return '<div class="sl-el k-image" data-el="' + esc(e.id) + '" style="' + elStyle(e) + '">' + (u ? '<img src="' + esc(u) + '" alt="" style="width:100%;height:100%;object-fit:contain">' : '<span class="sl-elimg0"></span>') + '</div>'; }
  if(e.k === 'arrow' || e.k === 'line'){
    var pad = 16, x1 = e.x, y1 = e.y, x2 = e.x + e.w, y2 = e.y + e.h, L = Math.min(x1, x2) - pad, Tp = Math.min(y1, y2) - pad, W = Math.abs(e.w) + pad * 2, H = Math.abs(e.h) + pad * 2, lw = e.lw || 4, col = e.c || '#D2453F';
    var a = Math.atan2(y2 - y1, x2 - x1), hl = 10 + lw * 2.2, head = '';
    if(e.k === 'arrow'){ var px = x2 - L, py = y2 - Tp; head = '<polygon points="' + px + ',' + py + ' ' + (px - hl * Math.cos(a - 0.45)) + ',' + (py - hl * Math.sin(a - 0.45)) + ' ' + (px - hl * Math.cos(a + 0.45)) + ',' + (py - hl * Math.sin(a + 0.45)) + '" fill="' + col + '"/>'; }
    var ex = e.k === 'arrow' ? hl * 0.7 : 0;
    return '<svg class="sl-el k-' + e.k + '" data-el="' + esc(e.id) + '" data-shape="line" data-line="' + [x1, y1, x2, y2, lw, col.replace('#', ''), e.k === 'arrow' ? 1 : 0].join(',') + '" style="left:' + L + 'px;top:' + Tp + 'px;width:' + W + 'px;height:' + H + 'px" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg"><line x1="' + (x1 - L) + '" y1="' + (y1 - Tp) + '" x2="' + (x2 - L - ex * Math.cos(a)) + '" y2="' + (y2 - Tp - ex * Math.sin(a)) + '" stroke="' + col + '" stroke-width="' + lw + '" stroke-linecap="round"/>' + head + '</svg>';
  }
  return '';
}
function elsHtml(s, edata){ var els = s.els || []; return els.length ? '<div class="sl-els">' + els.map(function(e, i){ return elHtml(e, i, s, edata && edata[e.id]); }).join('') + '</div>' : ''; }

/* ---------------- editable table + blank slide ---------------- */
Object.assign(SLIDES, {
  etable:{en:'Editable table', zh:'可编辑表格', t:['Table','表格'], def:function(){ return {head:[T1('Item', '事项'), T1('Status', '状态'), T1('Remarks', '备注')], rows:[[{t:''}, {t:''}, {t:''}], [{t:''}, {t:''}, {t:''}]], per:10}; }},
  blank:{en:'Blank (free layout)', zh:'空白页（自由排版）', t:['',''], def:function(){ return {noHead:false}; }}
});
SLIDE_ORDER.push('etable', 'blank');
SLIDE_DATA.etable = function(c){ return {head:c.head || [], rows:c.rows || [], per:c.per || 10, live:!!c.orig}; };
SLIDE_DATA.blank = function(){ return {}; };
SLIDE_RENDER.blank = function(){ return ['']; };
SLIDE_RENDER.etable = function(d, s){
  var idx = d.rows.map(function(_, i){ return i; });
  return chunk(idx, room(s, d.per || 10)).map(function(part){ return '<table class="sl-t sl-et"><thead><tr>' + d.head.map(function(h, j){ return '<th data-ed="cfg.head.' + j + '" data-hk="x:' + j + '" data-hl="' + esc(h) + '">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    part.map(function(i){ var row = d.rows[i] || []; return '<tr data-hk="e:' + i + '" data-hl="' + esc(((row[0] || {}).t || '').slice(0, 30)) + '">' + d.head.map(function(_, j){ var c = row[j] || {t:''}; if(typeof c === 'string') c = {t:c};
      return '<td' + (c.bg ? ' style="background:' + esc(c.bg) + '"' : '') + '>' + (c.c ? '<span class="sl-chip c-' + esc(c.c) + '"><i></i><span data-ed="cfg.rows.' + i + '.' + j + '.t">' + esc(c.t) + '</span></span>' : '<div class="sl-etc" data-ed="cfg.rows.' + i + '.' + j + '.t" data-raw="1">' + esc(c.t) + '</div>') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'; });
};
/* turn the tables a slide shows right now into an editable table (keeps title, key message, notes, elements; can go back to live data) */
function freezeSlide(deck, s){
  var built = deckBuild({id:deck.id, d:Object.assign({}, deck.d, {slides:[s]})}, {all:true}), x = built[0]; if(!x) return null;
  var head = null, rows = [], dp = new DOMParser();
  x.bodies.forEach(function(b){ var doc = dp.parseFromString('<div>' + b + '</div>', 'text/html'); Array.prototype.forEach.call(doc.querySelectorAll('.sl-zh'), function(z){ if(z.previousSibling) z.parentNode.insertBefore(doc.createTextNode(' / '), z); }); var tabs = Array.prototype.slice.call(doc.querySelectorAll('table.sl-t')); if(!tabs.length) return;
    var tb = tabs.sort(function(a, c){ return c.rows.length - a.rows.length; })[0];
    Array.prototype.forEach.call(tb.rows, function(tr, ri){
      var cells = Array.prototype.map.call(tr.cells, function(td){ var chip = td.querySelector('.sl-chip'), t = td.innerText != null ? td.textContent : ''; t = String(td.textContent || '').replace(/\s+/g, ' ').trim(); var o = {t:t}; if(chip && chip.textContent.trim() === t){ var m = /c-(\w+)/.exec(chip.className); if(m) o.c = m[1]; } var bg = td.getAttribute('style') || ''; var mb = /background:([^;]+)/.exec(bg); if(mb && !/color-mix/.test(mb[1])) o.bg = mb[1].trim(); return o; });
      if(tr.parentNode.tagName === 'THEAD'){ if(!head) head = cells.map(function(c){ return c.t; }); return; }
      if(head) while(cells.length < head.length) cells.push({t:''});
      rows.push(cells); }); });
  if(!head) return null;
  var c = {head:head, rows:rows, per:(s.cfg && s.cfg.per) || 10, msg:s.cfg && s.cfg.msg, side:s.cfg && s.cfg.side, orig:{type:s.type, cfg:clone(s.cfg)}};
  return Object.assign(clone(s), {type:'etable', cfg:c});
}
function canFreeze(s){ return ['table', 'mstable', 'lookahead', 'actions', 'kpi', 'matrix', 'punch'].indexOf(s.type) >= 0; }

/* ---------------- editor: selecting, moving and resizing — free elements, data blocks and the slide's main content block ----------------
   S.elSel is an element id, or '@main' for the slide's own content block (its position is s.box; empty = standard place).
   Dragging snaps to the slide margins and centre and to the edges / centres of other blocks (hold Alt to place freely). */
function curDeck(){ var d = S.deck && getRec(S.deck); return d && isDeckRec(d) ? d : null; }
function edOk(){ var d = curDeck(); return !!(d && d.d.status !== 'issued' && canDeckEdit()); }
function curSlide(){ var d = curDeck(); return d ? slideById(d, S.dslide) : null; }
function stageScale(){ var st = $('.dk-stage'); return st ? st.clientWidth / 1280 : 1; }
function elById(s, id){ return (s && s.els || []).filter(function(e){ return e.id === id; })[0] || null; }
function saveEls(fn, quiet){ var deck = curDeck(); if(!deck) return Promise.resolve(); var sl = clone(deck.d.slides || []), s = sl.filter(function(x){ return x.id === S.dslide; })[0]; if(!s) return Promise.resolve(); s.els = s.els || []; fn(s); return saveSlides(deck, sl, quiet !== false); }
function mainNode(){ return $('.dk-stage [data-blk="main"]'); }
function mainRect(s){ var b = cleanBox(s && s.box); if(b) return b; var n = mainNode(); return n ? {x:n.offsetLeft, y:n.offsetTop, w:n.offsetWidth, h:n.offsetHeight} : {x:52, y:150, w:1176, h:470}; }
function hasMain(s){ return !!s && ['cover', 'section'].indexOf(s.type) < 0 && !(s.type === 'blank'); }
function selObj(s){ if(!s || !S.elSel) return null; if(S.elSel === '@main') return hasMain(s) ? Object.assign({id:'@main', k:'main'}, mainRect(s)) : null; return elById(s, S.elSel); }
function isBoxy(e){ return e && e.k !== 'arrow' && e.k !== 'line'; }

/* the format strip above the canvas: changes for the selected element */
function elFormat(ed){
  var s = curSlide(), e = s && selObj(s);
  if(e && e.k !== 'main' && !EL_KINDS[e.k]) e = null;
  if(!e && ed){ var og = ownerGaps(curDeck(), s); if(og.some(function(g){ return !g.ext; })) return ownerGapHtml(og, ed, true); }
  if(!ed || !e) return '<span class="note">' + (ed ? esc(T1('Click to select · drag to move · click text to type · Alt-drag: no snapping', '点选 · 拖动移动 · 点文字可输入 · 按住 Alt 拖动不对齐')) : L('Read only', '只读')) + '</span>';
  var zbtn = '<button type="button" class="ib" data-act="elZ" data-v="1" title="' + esc(T('Bring to front', '置于顶层')) + '">' + uic('up', 14) + '</button><button type="button" class="ib" data-act="elZ" data-v="-1" title="' + esc(T('Send to back', '置于底层')) + '">' + uic('down', 14) + '</button><button type="button" class="ib" data-act="elDup" title="' + esc(T('Duplicate (Cmd+D)', '复制（Cmd+D）')) + '">' + uic('copy', 14) + '</button><button type="button" class="ib" data-act="elDel" title="' + esc(T('Delete (Del)', '删除（Del）')) + '">' + uic('trash', 14) + '</button>';
  if(e.k === 'main') return '<span class="dk-elg"><b>' + L('Slide content', '本页内容') + '</b>' + sizeSeg(s.cfg && s.cfg.size, 'cfg.size', ed) + (s.box ? '<button type="button" class="btn sm" data-act="dkBoxReset">' + L('Back to standard place', '恢复默认位置') + '</button>' : '') + '<button type="button" class="btn sm" data-act="dkTab" data-v="content">' + L('Settings', '设置') + ' →</button></span>';
  if(e.k === 'data') return '<span class="dk-elg"><b>' + esc(T1(SLIDES[e.type] ? SLIDES[e.type].en : '', SLIDES[e.type] ? SLIDES[e.type].zh : '')) + '</b>' + sizeSeg(e.cfg && e.cfg.size, 'els#' + e.id + '.cfg.size', ed) + '<button type="button" class="btn sm" data-act="dkTab" data-v="content">' + L('Settings', '设置') + ' →</button>' + zbtn + '</span>';
  var line = e.k === 'arrow' || e.k === 'line', txt = e.t != null, frame = line || e.k === 'rect' || e.k === 'ellipse';
  return '<span class="dk-elg"><b>' + esc(T1(EL_KINDS[e.k].en, EL_KINDS[e.k].zh)) + '</b>' +
    (e.k !== 'image' ? '<span class="dk-sw">' + EL_COLORS.map(function(c){ return '<button type="button" class="dk-swc' + (e.c === c ? ' on' : '') + '" style="background:' + c + '" data-act="elSet" data-k="c" data-v="' + c + '" title="' + esc(frame ? T('Line colour', '线条颜色') : T('Text colour', '文字颜色')) + '"></button>'; }).join('') + '</span>' : '') +
    (!line && e.k !== 'image' ? '<span class="dk-sw">' + EL_FILLS.map(function(c){ return '<button type="button" class="dk-swc fill' + ((e.f || '') === c ? ' on' : '') + '" style="background:' + (c || 'transparent') + '" data-act="elSet" data-k="f" data-v="' + c + '" title="' + esc(c ? T('Fill', '填充') : T('No fill', '无填充')) + '">' + (c ? '' : '∅') + '</button>'; }).join('') + '</span>' : '') +
    (txt ? '<button type="button" class="btn sm" data-act="elFs" data-v="-2">A−</button><button type="button" class="btn sm" data-act="elFs" data-v="2">A+</button><button type="button" class="btn sm' + (e.b ? ' on' : '') + '" data-act="elSet" data-k="b" data-v="' + (e.b ? '' : '1') + '"><b>B</b></button>' + ['left','center','right'].map(function(a){ return '<button type="button" class="btn sm' + ((e.al || 'left') === a ? ' on' : '') + '" data-act="elSet" data-k="al" data-v="' + a + '">' + {left:'⇤', center:'≡', right:'⇥'}[a] + '</button>'; }).join('') : '') +
    (frame ? '<button type="button" class="btn sm" data-act="elLw" data-v="-1">' + L('Thinner', '细') + '</button><button type="button" class="btn sm" data-act="elLw" data-v="1">' + L('Thicker', '粗') + '</button>' : '') + zbtn + '</span>';
}
function sizeSeg(v, path, ed){ return '<span class="seg dk-szs" title="' + esc(T('Text size', '文字大小')) + '">' + [['', T('Auto', '自动')], ['L', 'L'], ['M', 'M'], ['S', 'S']].map(function(o){ return '<button type="button"' + (ed ? ' data-act="dkSize" data-p="' + esc(path) + '" data-v="' + o[0] + '"' : ' disabled') + ' aria-pressed="' + ((v || '') === o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</span>'; }

/* selection frame with handles (+ alignment guides while dragging), drawn inside the scaled slide so it follows zoom */
function drawSel(guides){
  $$('.dk-selbox').forEach(function(x){ x.remove(); });
  if(!S.elSel || !edOk()) return; var s = curSlide(), e = s && (ELD && ELD.cur && ELD.id === S.elSel ? ELD.cur : selObj(s)), sc = $('.dk-stage .dk-sc'); if(!e || !sc){ return; }
  e = Object.assign({}, e, {x:n0(e.x, 0), y:n0(e.y, 0), w:n0(e.w, 0), h:n0(e.h, 0)});
  var k = 1 / stageScale(), hs = 12 * k, box = document.createElement('div'); box.className = 'dk-selbox';
  var h = '';
  if(e.k === 'arrow' || e.k === 'line') h = [[e.x, e.y, 'p1'], [e.x + e.w, e.y + e.h, 'p2']].map(function(p){ return '<i data-hd="' + p[2] + '" style="left:' + (p[0] - hs / 2) + 'px;top:' + (p[1] - hs / 2) + 'px;width:' + hs + 'px;height:' + hs + 'px"></i>'; }).join('');
  else h = '<b class="' + (e.k === 'main' ? 'main' : '') + '" style="left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px;height:' + e.h + 'px;border-width:' + (2 * k) + 'px"></b>' + ['nw','n','ne','e','se','s','sw','w'].map(function(d){ var x = e.x + (/w/.test(d) ? 0 : /e/.test(d) ? e.w : e.w / 2), y = e.y + (/n/.test(d) ? 0 : /s/.test(d) ? e.h : e.h / 2); return '<i data-hd="' + d + '" style="left:' + (x - hs / 2) + 'px;top:' + (y - hs / 2) + 'px;width:' + hs + 'px;height:' + hs + 'px;cursor:' + d + '-resize"></i>'; }).join('') +
    (e.k === 'main' || e.k === 'data' ? '<span class="dk-seltag" style="left:' + e.x + 'px;top:' + (e.y - 24 * k) + 'px;font-size:' + (12 * k) + 'px;padding:' + (2 * k) + 'px ' + (6 * k) + 'px">' + esc(e.k === 'main' ? T('Slide content', '本页内容') : T1(SLIDES[e.type] ? SLIDES[e.type].en : '', SLIDES[e.type] ? SLIDES[e.type].zh : '')) + ' · ' + Math.round(e.w) + ' × ' + Math.round(e.h) + '</span>' : '');
  (guides || []).forEach(function(g){ h += g.v != null ? '<u class="dk-gd" style="left:' + g.v + 'px;top:0;width:' + (1.5 * k) + 'px;height:720px"></u>' : '<u class="dk-gd" style="top:' + g.h + 'px;left:0;height:' + (1.5 * k) + 'px;width:1280px"></u>'; });
  box.innerHTML = h; sc.appendChild(box);
}
/* snapping: candidate lines from the slide (margins, centre) and from the other blocks */
function snapLines(s, skip){
  var sheet = themeOf(curDeck()).style !== 'classic', xs = sheet ? [52, 640, 1228] : [48, 640, 1232], ys = [360, sheet ? 624 : 668];
  if(S.elSel !== '@main' && hasMain(s)){ var m = mainRect(s); xs.push(m.x, m.x + m.w / 2, m.x + m.w); ys.push(m.y, m.y + m.h / 2, m.y + m.h); }
  (s.els || []).forEach(function(e){ if(e.id === skip || !isBoxy(e)) return; xs.push(e.x, e.x + e.w / 2, e.x + e.w); ys.push(e.y, e.y + e.h / 2, e.y + e.h); });
  return {x:xs, y:ys};
}
function snapBest(vals, cands, th){ var best = null; vals.forEach(function(v){ cands.forEach(function(c){ var d = c - v; if(Math.abs(d) <= th && (!best || Math.abs(d) < Math.abs(best.d))) best = {d:d, at:c}; }); }); return best; }
var ELD = null;
function stageNode(id){ return id === '@main' ? mainNode() : $('.dk-stage [data-el="' + id + '"]'); }
document.addEventListener('pointerdown', function(ev){
  var stage = ev.target.closest && ev.target.closest('.dk-stage'); if(!stage || !edOk() || ev.button !== 0) return;
  if(ev.target.isContentEditable || (ev.target.closest && ev.target.closest('#dkx'))) return;
  var s = curSlide(); if(!s) return;
  var ae = document.activeElement; if(ae && ae !== document.body && ae.closest && ae.closest('.dke-insp')) ae.blur();
  var hd = ev.target.closest('[data-hd]'), elx = ev.target.closest('[data-el]'), mx = ev.target.closest('[data-blk="main"]');
  if(hd){ var e0 = selObj(s); if(!e0) return; ELD = {mode:hd.dataset.hd, id:S.elSel, o:clone(e0), x0:ev.clientX, y0:ev.clientY, moved:false}; ev.preventDefault(); return; }
  if(elx){ var id = elx.dataset.el, e1 = elById(s, id); if(!e1) return; if(S.elSel !== id){ S.elSel = id; refreshElUi(); }
    ELD = {mode:'move', id:id, o:clone(e1), x0:ev.clientX, y0:ev.clientY, moved:false}; ev.preventDefault(); return; }
  if(mx && hasMain(s)){ if(S.elSel !== '@main'){ S.elSel = '@main'; refreshElUi(); } ELD = {mode:'move', id:'@main', o:Object.assign({id:'@main', k:'main'}, mainRect(s)), x0:ev.clientX, y0:ev.clientY, moved:false}; ev.preventDefault(); return; }
  if(S.elSel && !ev.target.closest('[data-ed]')){ S.elSel = null; refreshElUi(); }
});
document.addEventListener('pointermove', function(ev){
  if(!ELD) return; var k = 1 / stageScale(), dx = (ev.clientX - ELD.x0) * k, dy = (ev.clientY - ELD.y0) * k; if(!ELD.moved && Math.abs(dx) + Math.abs(dy) < 3) return; ELD.moved = true;
  var o = ELD.o, e = Object.assign({}, o), m = ELD.mode, sh = ev.shiftKey, s = curSlide(); if(!s) return;
  if(m === 'move'){ e.x = Math.round(o.x + dx); e.y = Math.round(o.y + dy); }
  else if(m === 'p1'){ e.x = Math.round(o.x + dx); e.y = Math.round(o.y + dy); e.w = o.w - (e.x - o.x); e.h = o.h - (e.y - o.y); if(sh){ if(Math.abs(e.w) > Math.abs(e.h)){ e.y = o.y + o.h; e.h = 0; } else { e.x = o.x + o.w; e.w = 0; } } }
  else if(m === 'p2'){ e.w = Math.round(o.w + dx); e.h = Math.round(o.h + dy); if(sh){ if(Math.abs(e.w) > Math.abs(e.h)) e.h = 0; else e.w = 0; } }
  else { var mw = e.k === 'main' || e.k === 'data' ? 120 : 16, mh = e.k === 'main' || e.k === 'data' ? 80 : 12; if(/e/.test(m)) e.w = Math.max(mw, Math.round(o.w + dx)); if(/s/.test(m)) e.h = Math.max(mh, Math.round(o.h + dy)); if(/w/.test(m)){ e.w = Math.max(mw, Math.round(o.w - dx)); e.x = o.x + o.w - e.w; } if(/n/.test(m)){ e.h = Math.max(mh, Math.round(o.h - dy)); e.y = o.y + o.h - e.h; } }
  var guides = [];
  if(isBoxy(e) && !ev.altKey){ var L0 = snapLines(s, ELD.id), th = Math.max(4, 6 * k), bx, by;
    if(m === 'move'){ bx = snapBest([e.x, e.x + e.w / 2, e.x + e.w], L0.x, th); by = snapBest([e.y, e.y + e.h / 2, e.y + e.h], L0.y, th); if(bx){ e.x += bx.d; guides.push({v:bx.at}); } if(by){ e.y += by.d; guides.push({h:by.at}); } }
    else if(/^(n|s|e|w|ne|nw|se|sw)$/.test(m)){
      if(/e/.test(m)){ bx = snapBest([e.x + e.w], L0.x, th); if(bx){ e.w += bx.d; guides.push({v:bx.at}); } } if(/w/.test(m)){ bx = snapBest([e.x], L0.x, th); if(bx){ e.x += bx.d; e.w -= bx.d; guides.push({v:bx.at}); } }
      if(/s/.test(m)){ by = snapBest([e.y + e.h], L0.y, th); if(by){ e.h += by.d; guides.push({h:by.at}); } } if(/n/.test(m)){ by = snapBest([e.y], L0.y, th); if(by){ e.y += by.d; e.h -= by.d; guides.push({h:by.at}); } } } }
  ELD.cur = e;
  var node = stageNode(ELD.id);
  if(node && (e.k === 'main' || e.k === 'data')){ node.classList.add('abs'); node.style.position = 'absolute'; node.style.margin = '0'; node.style.left = e.x + 'px'; node.style.top = e.y + 'px'; node.style.width = e.w + 'px'; node.style.height = e.h + 'px'; if(m !== 'move'){ clearTimeout(window.__dkfit); window.__dkfit = setTimeout(function(){ slFitAll(node); }, 60); } }
  else if(node){ var tmp = document.createElement('div'), i = (s.els || []).map(function(x){ return x.id; }).indexOf(e.id); tmp.innerHTML = elHtml(e, i, s); if(tmp.firstChild) node.replaceWith(tmp.firstChild); }
  drawSel(guides);
});
document.addEventListener('pointerup', function(){ if(!ELD) return; var d = ELD; ELD = null; if(!d.moved || !d.cur){ drawSel(); return; } var c = d.cur;
  if(d.id === '@main') return saveEls(function(s){ s.box = {x:c.x, y:c.y, w:c.w, h:c.h}; });
  saveEls(function(s){ s.els = s.els.map(function(x){ return x.id === d.id ? Object.assign({}, x, {x:c.x, y:c.y, w:c.w, h:c.h}) : x; }); }); });
document.addEventListener('dblclick', function(ev){
  var elx = ev.target.closest && ev.target.closest('.dk-stage [data-el]'); if(!elx || !edOk()) return;
  if(elx.classList.contains('k-data')){ S.dkTab = 'content'; S.dkInsp = true; renderMain(); return; }
  var t = elx.querySelector('[data-edl]'); if(!t) return;
  t.setAttribute('data-ed', t.dataset.edl); try{ t.contentEditable = 'plaintext-only'; }catch(e){ t.contentEditable = 'true'; } if(t.contentEditable !== 'plaintext-only') t.contentEditable = 'true';
  t.setAttribute('data-fk', 'ed:' + S.dslide + ':' + t.dataset.edl); t.focus();
  try{ var r = document.createRange(); r.selectNodeContents(t); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }catch(e){}
});
function refreshElUi(){ var tb = $('.dk-fmt'); if(tb) tb.innerHTML = elFormat(edOk()); drawSel(); if(S.dkTab === 'layout' || S.dkTab === 'content' || !S.dkTab){ var ins = $('.dke-insp'); if(ins && typeof inspHtml === 'function'){ var d = curDeck(); if(d){ var fk = focusKey(document.activeElement); if(!fk) ins.innerHTML = inspHtml(d); } } } }
document.addEventListener('click', function(ev){
  var el = ev.target.closest && ev.target.closest('[data-act]'); if(!el) return; var act = el.dataset.act; if(!/^el[A-Z]/.test(act)) return;
  var v = el.dataset.v, id = S.elSel;
  switch(act){
    case 'elAdd': (function(){ var e = newEl(v); S.elSel = e.id; saveEls(function(s){ s.els.push(e); }).then(function(){ if(e.t != null){ setTimeout(function(){ var n = $('.dk-stage [data-el="' + e.id + '"]'); if(n) n.dispatchEvent(new MouseEvent('dblclick', {bubbles:true})); }, 60); } }); closePop(); })(); break;
    case 'elSet': saveEls(function(s){ s.els.forEach(function(e){ if(e.id === id){ if(v === '') delete e[el.dataset.k]; else e[el.dataset.k] = v; } }); }); break;
    case 'elFs': saveEls(function(s){ s.els.forEach(function(e){ if(e.id === id) e.fs = clamp((e.fs || 20) + (+v), 10, 96); }); }); break;
    case 'elLw': saveEls(function(s){ s.els.forEach(function(e){ if(e.id === id) e.lw = clamp((e.lw || 4) + (+v), 1, 16); }); }); break;
    case 'elZ': saveEls(function(s){ var i = s.els.map(function(e){ return e.id; }).indexOf(id); if(i < 0) return; var e = s.els.splice(i, 1)[0]; if(+v > 0) s.els.push(e); else s.els.unshift(e); }); break;
    case 'elDup': elDuplicate(); break;
    case 'elDel': elDelete(); break;
  }
});
function elDuplicate(){ var id = S.elSel; if(!id || id === '@main') return; var nid = uid('e'); saveEls(function(s){ var e = elById(s, id); if(!e) return; var c = clone(e); c.id = nid; c.x += 24; c.y += 24; s.els.push(c); }); S.elSel = nid; }
function elDelete(){ var id = S.elSel; if(!id || id === '@main') return; S.elSel = null; saveEls(function(s){ s.els = s.els.filter(function(e){ return e.id !== id; }); }, false); }
function elInsertImage(file){
  var deck = curDeck(); if(!deck || !file) return;
  toast(T('Uploading image…', '正在上传图片…'));
  shrinkImage(file, 2000).then(function(f){ return Promise.all([STORE.upload(f, deck.reg, deck.id), imgSize(f)]); }).then(function(res){
    var up = res[0], sz = res[1], w = 480, h = Math.round(w * (sz.h / (sz.w || 1))); if(h > 480){ h = 480; w = Math.round(h * sz.w / sz.h); }
    var e = {id:uid('e'), k:'image', x:Math.round((1280 - w) / 2), y:Math.round((720 - h) / 2), w:w, h:h, path:up.path}; S.elSel = e.id; saveEls(function(s){ s.els.push(e); });
  }).catch(function(er){ toast(errText(er)); });
}
function imgSize(file){ return new Promise(function(res){ var u = URL.createObjectURL(file), im = new Image(); im.onload = function(){ res({w:im.naturalWidth, h:im.naturalHeight}); }; im.onerror = function(){ res({w:4, h:3}); }; im.src = u; }); }
function shrinkImage(file, max){
  return new Promise(function(res){ if(!/^image\/(jpeg|png|webp)/.test(file.type) || file.size < 600e3){ res(file); return; }
    var u = URL.createObjectURL(file), im = new Image(); im.onload = function(){ var s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)); if(s >= 1 && file.size < 2e6){ res(file); return; } var c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      var png = file.type === 'image/png'; c.toBlob(function(b){ res(b ? new File([b], file.name.replace(/\.\w+$/, png ? '.png' : '.jpg'), {type:png ? 'image/png' : 'image/jpeg'}) : file); }, png ? 'image/png' : 'image/jpeg', 0.85); };
    im.onerror = function(){ res(file); }; im.src = u; });
}
document.addEventListener('change', function(ev){ var el = ev.target; if(el.dataset && el.dataset.elimg && el.files && el.files[0]){ closePop(); elInsertImage(el.files[0]); el.value = ''; } });
document.addEventListener('keydown', function(ev){
  if(S.page !== 'decks' || !S.elSel || !edOk() || S.present || S.modal || S.pop) return;
  var s0 = curSlide(); if(!s0 || !selObj(s0)) return;
  var tg = ev.target; if(tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable)) return;
  var k = ev.key, step = ev.shiftKey ? 10 : 1, main = S.elSel === '@main';
  if(k === 'Delete' || k === 'Backspace'){ ev.preventDefault(); if(!main) elDelete(); return; }
  if(k === 'Escape'){ S.elSel = null; refreshElUi(); return; }
  if((ev.metaKey || ev.ctrlKey) && (k === 'd' || k === 'D')){ ev.preventDefault(); elDuplicate(); return; }
  if((ev.metaKey || ev.ctrlKey) && (k === 'c' || k === 'C') && !main){ var e = elById(s0, S.elSel); if(e){ S.elClip = clone(e); toast(T('Copied — paste on any slide with Cmd+V', '已复制：可在任一页按 Cmd+V 粘贴')); } return; }
  var mv = {ArrowLeft:[-step, 0], ArrowRight:[step, 0], ArrowUp:[0, -step], ArrowDown:[0, step]}[k];
  if(mv){ ev.preventDefault(); ev.stopImmediatePropagation(); var id = S.elSel;
    if(main){ var r = mainRect(s0); saveEls(function(s){ s.box = {x:r.x + mv[0], y:r.y + mv[1], w:r.w, h:r.h}; }); }
    else saveEls(function(s){ s.els.forEach(function(e){ if(e.id === id){ e.x += mv[0]; e.y += mv[1]; } }); }); }
}, true);
document.addEventListener('paste', function(ev){
  if(S.page !== 'decks' || !edOk() || S.modal) return; var tg = ev.target; if(tg && (/^(INPUT|TEXTAREA)$/.test(tg.tagName) || tg.isContentEditable)) return;
  var files = Array.prototype.slice.call((ev.clipboardData && ev.clipboardData.files) || []).filter(function(f){ return /^image\//.test(f.type); });
  if(files.length){ ev.preventDefault(); elInsertImage(files[0]); return; }
  if(S.elClip){ ev.preventDefault(); var c = clone(S.elClip); c.id = uid('e'); c.x += 20; c.y += 20; S.elClip = clone(c); S.elSel = c.id; saveEls(function(s){ s.els.push(c); }); }
});

SLIDE_CSS += [
'.sl-els{position:absolute;inset:0;pointer-events:none;z-index:5}',
'.sl-el{position:absolute;box-sizing:border-box;pointer-events:auto;overflow:visible}',
'.sl-el.k-text,.sl-el.k-note{padding:6px 10px;border-radius:4px}.sl-el.k-note{box-shadow:0 2px 6px rgba(0,0,0,.12)}',
'.sl-el.k-rect{border-radius:6px;padding:6px 10px}.sl-el.k-ellipse{border-radius:50%;padding:6px 18px;display:flex;align-items:center;justify-content:center}',
'.sl-elt{white-space:pre-wrap;line-height:1.3;min-height:1em;outline:none}',
'.sl-el.k-image{overflow:hidden}.sl-elimg0{display:block;width:100%;height:100%;background:#E6E8E3}',
'.sl-logos{display:flex;gap:14px;align-items:center}.sl-logos img{height:40px;max-width:180px;object-fit:contain}.sl-logos.cv{position:absolute;top:32px;right:48px;z-index:2;background:rgba(255,255,255,.95);padding:8px 14px;border-radius:8px}.sl-logos.cv img{height:44px}',
'.sl-conf{color:#A1262A;font-weight:600;letter-spacing:.04em;text-transform:uppercase}',
'.sl-blank .sl-b{flex:1}',
'.sl-et td{font-size:17px}.sl-etc{white-space:pre-wrap;min-height:1.2em}',
'.sl-el.k-data{display:flex;flex-direction:column;background:#fff;overflow:hidden}',
'.sl-dbh{flex:none;font-size:18px;line-height:1.25;font-weight:600;color:var(--sl-p);border-bottom:1.5px solid var(--sl-ink);padding-bottom:6px;margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;outline:none}',
'.sl-dbb{flex:1;min-height:0;position:relative;overflow:hidden}',
'.sl-more{font-size:12px;color:#8A9096;font-style:italic;flex:none}'
].join('\n');
(function(){ var st = document.getElementById('slide-css'); if(st) st.textContent = SLIDE_CSS; })();
