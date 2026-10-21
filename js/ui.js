/* work-web v2 · UI shell, cell rendering, pickers, record drawer, modals, sign-in gate. */
'use strict';

var renderQ = false;
function notify(){ DATA_VER++; if(!DECK_ONLY) REC_VER++; DECK_ONLY = false; if(renderQ) return; renderQ = true; requestAnimationFrame(function(){ renderQ = false; renderAll(); }); }
/* redraw without marking data as changed (new change-log rows, signed photo links) */
function notifySoft(){ if(renderQ) return; renderQ = true; requestAnimationFrame(function(){ renderQ = false; renderAll(); }); }
/* changes arriving from the database (others' edits, the echoes of a bulk change): data is marked changed at once, the
   redraw waits until the stream pauses for 200 ms (at most 800 ms), so a burst of events costs one redraw, not one per event */
var remoteT = null, remoteFirst = 0;
function notifyRemote(soft){
  if(!soft){ DATA_VER++; if(!DECK_ONLY) REC_VER++; DECK_ONLY = false; }
  var now = Date.now(); if(!remoteT) remoteFirst = now; else clearTimeout(remoteT);
  remoteT = setTimeout(function(){ remoteT = null; notifySoft(); }, Math.max(0, Math.min(200, remoteFirst + 800 - now)));
}
function appReady(){ return STORE && STORE.ready && (STORE.mode === 'demo' || (STORE.me && STORE.session)); }

/* keep focus + caret across re-renders */
function focusKey(el){ if(!el || !el.getAttribute) return null; var k = el.getAttribute('data-fk'); if(!k) return null; if(el.isContentEditable) return {k:k, ce:true, v:el.innerText, raw:el.classList.contains('sl-raw')}; var txt = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|number|email)$/.test(el.type || 'text')); return {k:k, s:el.selectionStart, e:el.selectionEnd, v:txt ? el.value : null}; }
function restoreFocus(f){ if(!f) return; var el = document.querySelector('[data-fk="' + f.k.replace(/"/g, '\\"') + '"]'); if(el && f.ce){ if(!el.isContentEditable) return; el.focus(); if(f.raw) el.classList.add('sl-raw'); if(el.innerText !== f.v) el.textContent = f.v; try{ var r = document.createRange(); r.selectNodeContents(el); r.collapse(false); var sl = window.getSelection(); sl.removeAllRanges(); sl.addRange(r); }catch(e){} return; }
  if(el){ if(f.v != null && el.value !== f.v && !el.disabled) el.value = f.v; el.focus(); try{ if(f.s != null) el.setSelectionRange(f.s, f.e); }catch(e){} } }

function renderAll(){
  if(!STORE) return;
  if(S.newBlank && typeof dropIfBlank === 'function') dropIfBlank();
  var fk = focusKey(document.activeElement);
  document.documentElement.lang = S.lang === 'zh' ? 'zh-CN' : 'en';
  document.body.classList.toggle('lang-both', S.lang === 'both');
  if(STORE.mode === 'public'){ renderPublic(); return; }
  renderTop();
  if(typeof pkgUpgrade === 'function') setTimeout(pkgUpgrade, 0);
  if(typeof peopleSubUpgrade === 'function') setTimeout(peopleSubUpgrade, 0);
  if(typeof multiUpgrade === 'function') setTimeout(multiUpgrade, 0);
  if(typeof cmUpgrade === 'function') setTimeout(cmUpgrade, 0);
  if(STORE.mode === 'cloud' && (!STORE.ready || !STORE.session || !STORE.me || role() === 'pending' || role() === 'none' || S.recovery)){ $('#side').innerHTML = ''; document.body.classList.add('gate'); renderGate(); renderDrawer(); renderPop(); renderModal(); return; }
  document.body.classList.remove('gate');
  if(role() === 'owner'){ $('#side').innerHTML = ''; document.body.classList.add('gate'); $('#main').innerHTML = viewOwnerPortal(); fitSlides(); renderDrawer(); renderPop(); renderModal(); return; }
  renderSide();
  renderMain();
  renderBnav();
  renderDrawer(); renderPop(); renderModal();
  restoreFocus(fk);
  if(STORE.ready && canTeamEdit() && !S.snapT){ S.snapT = 1; setTimeout(function(){ S.snapT = 0; takeSnapshotIfDue(); }, 4000); }
}

/* ---------------- top bar & side navigation ---------------- */
function renderTop(){
  var c = cfg(), st = '';
  if(STORE){ if(STORE.mode === 'demo') st = ['Demo · this browser only', '演示 · 仅本浏览器', 'demo']; else if(appReady()) st = STORE.rt === 'live' ? ['Live', '在线', 'live'] : STORE.rt === 'off' ? ['Offline', '离线', 'off', 'Offline — changes may not be saved until the connection is back', '离线：恢复连接前修改可能无法保存'] : ['Connecting…', '连接中…', 'wait']; }
  var signed = STORE && STORE.mode === 'cloud' && STORE.me && STORE.session;
  $('#top').innerHTML =
    '<button type="button" class="ib sidebtn" data-act="side" aria-label="Menu">' + uic('menu', 20) + '</button>' +
    '<div class="brand"><b>' + esc(c.projectEn) + '</b><span>' + esc(c.projectZh) + '</span></div>' +
    (appReady() && isInternal() || (STORE && STORE.mode === 'demo') ? '<label class="gsearch">' + uic('search', 15) + '<input id="gq" type="search" data-fk="gq" placeholder="' + esc(T('Search all registers', '搜索全部台账')) + '" value="' + esc(S.q) + '" autocomplete="off"></label>' : '<span style="flex:1"></span>') +
    '<div class="tools">' + (st ? '<span class="sync ' + st[2] + '" role="status" title="' + esc(st[3] ? T(st[3], st[4]) : T(st[0], st[1])) + '"><span class="dot ' + st[2] + '"></span><span class="stx">' + L(st[0], st[1]) + '</span></span>' : '') +
    noticeBell() +
    '<div class="seg lseg" role="group" aria-label="Language">' + [['en','EN'],['both','EN + 中'],['zh','中']].map(function(o){ return '<button type="button" data-act="lang" data-v="' + o[0] + '" aria-pressed="' + (S.lang === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
    (signed ? '<details class="menu um"><summary class="btn sm">' + esc(STORE.me.name || STORE.me.email || '') + ' · ' + esc(roleName(role())) + '</summary><div class="pop pop-r"><div class="note" style="padding:6px 10px">' + esc(STORE.me.email || '') + '</div><button type="button" data-act="signout">' + L('Sign out', '退出登录') + '</button></div></details>' : '') + '</div>' +
    (S.q && appReady() ? searchResults() : '') + (S.nOpen ? noticePanel() : '');
}
/* v3.2 · notices: what the site wants to tell you sits behind the bell instead of across the top of every page;
   only things that need action now (update the database, load the new version, the first set-up) stay as one line on the page */
UI_ICONS.bell = '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>';
function noticeList(){
  var out = [];
  if(STORE && STORE.mode === 'demo') out.push({k:'demo', unread:false, html:L('Demo mode: data stays in this browser. Connect Supabase (see README) to go live for everyone.', '演示模式：数据只保存在本浏览器。连接 Supabase 后即可多人在线使用。')});
  if(typeof pkgNotice === 'function' && STORE && !STORE.needSchema && !STORE.v1){ var p = pkgNotice(); if(p) out.push(p); }
  return out;
}
function noticeBell(){
  if(!STORE || !(appReady() || STORE.mode === 'demo')) return '';
  var ns = noticeList(), n = ns.filter(function(x){ return x.unread; }).length;
  return '<button type="button" class="ib nbell' + (S.nOpen ? ' on' : '') + '" data-act="notices" aria-expanded="' + !!S.nOpen + '" aria-label="' + esc(T('Notices', '通知') + (n ? ' (' + n + ')' : '')) + '" title="' + esc(T('Notices', '通知')) + '">' + uic('bell', 18) + (n ? '<span class="nbn">' + n + '</span>' : '') + '</button>';
}
function noticePanel(){
  var ns = noticeList();
  return '<div class="npanel card" role="dialog" aria-label="' + esc(T('Notices', '通知')) + '"><div class="nph"><b>' + L('Notices', '通知') + '</b><button type="button" class="ib" data-act="notices" aria-label="' + esc(T('Close', '关闭')) + '">' + uic('x', 15) + '</button></div>' +
    (ns.length ? ns.map(function(x){ return '<div class="nitem' + (x.unread ? ' unread' : '') + '">' + x.html + '</div>'; }).join('') : '<div class="note" style="padding:8px 2px">' + L('Nothing new.', '没有新通知。') + '</div>') + '</div>';
}
/* a click elsewhere closes the notices without redrawing the bar, so the click still lands where it was aimed */
document.addEventListener('click', function(e){
  if(!S.nOpen) return;
  if(e.target.closest && (e.target.closest('.npanel') || e.target.closest('.nbell'))) return;
  S.nOpen = false; var np = document.querySelector('.npanel'); if(np) np.remove();
  var nb = document.querySelector('.nbell'); if(nb){ nb.classList.remove('on'); nb.setAttribute('aria-expanded', 'false'); }
}, true);
/* ⋯ menus (<details class="menu">): a choice or a click elsewhere closes them */
document.addEventListener('click', function(e){
  var t = e.target, own = t.closest && t.closest('details.menu');
  Array.prototype.forEach.call(document.querySelectorAll('details.menu[open]'), function(d){ if(d !== own) d.removeAttribute('open'); });
  if(own && !(t.closest('summary')) && t.closest('button, a, [data-act]')) own.removeAttribute('open');
}, true);
/* in "EN + 中" the Chinese of a button or hint shows when the pointer rests on it */
document.addEventListener('mouseover', function(e){
  if(S.lang !== 'both' || !e.target.closest) return;
  var el = e.target.closest('button, a, label, .chip, .note, .achip, .tb-c, summary, .flab'); if(!el || el.hasAttribute('title')) return;
  var z = el.querySelector('.zh'); if(z && getComputedStyle(z).display === 'none'){ var t = z.textContent.trim(); if(t) el.setAttribute('title', t); }
});

function roleName(r){ var m = {admin:['Admin','管理员'], editor:['Editor','编辑'], viewer:['Viewer','只读'], owner:['Owner','业主'], pending:['Waiting','待审批']}[r] || [r, '']; return T1(m[0], m[1]); }
function searchResults(){
  var q = S.q.toLowerCase(), out = [];
  allRegs().concat(libReg() ? [libReg()] : []).forEach(function(reg){ recsOf(reg.id).forEach(function(r){ if(out.length > 40) return; var t = (recNo(reg, r) + ' ' + (r.d[rolesOf(reg).title] || '') + ' ' + (r.d[rolesOf(reg).title2] || '') + ' ' + (r.d.docNo || '')).toLowerCase(); if(t.indexOf(q) >= 0) out.push({reg:reg, rec:r}); }); });
  return '<div class="gres card">' + (out.length ? out.map(function(x){ return '<button type="button" data-act="openRec" data-id="' + esc(x.rec.id) + '">' + icon(x.reg.d.icon, 14) + '<span class="mono muted">' + esc(recNo(x.reg, x.rec)) + '</span> ' + esc(recTitle(x.reg, x.rec) || '—') + ' <span class="muted" style="margin-left:auto;font-size:12px">' + esc(regName(x.reg)) + '</span></button>'; }).join('') : '<div class="note" style="padding:10px">' + L('No matches', '没有匹配') + '</div>') + '</div>';
}
/* v3.2 · phones: a bottom bar (overview, my work, registers, search, more); registers and more open as sheets */
function sidePages(){ return [['home','home','Overview','总览']].concat(peopleDir() && (isInternal() || STORE.mode === 'demo') ? [['mine','user','My work','我的工作']] : []).concat([['schedule','cal','Schedule','进度计划'],['decks','present','Presentations','演示文稿'],['activity','hist','Change log','修改记录'],['files','file','Documents','文件库'],['owner','owner','Owner plan','业主计划'],['settings','gear','Settings','设置']]); }
function regGroups(){ var regs = allRegs(), out = SECS.map(function(s){ return {s:s, regs:regs.filter(function(r){ return !isPrivate(r) && (r.d.sec || 'other') === s[0]; })}; }); out.push({s:['private','Only me','仅自己可见'], regs:regs.filter(isPrivate)}); return out.filter(function(g){ return g.regs.length; }); }
function regBtn(r, cls){ var n = recsOf(r.id), od = n.filter(function(x){ return isOverdue(r, x); }).length;
  return '<button type="button" class="' + cls + '" data-act="reg" data-v="' + esc(r.id) + '"' + (S.page === 'reg' && S.reg === r.id ? ' aria-current="page"' : '') + '><span class="ri c-' + esc(r.d.color || 'blue') + '">' + icon(r.d.icon) + '</span><span class="rn">' + esc(regName(r)) + '</span><span class="scnt">' + (od ? '<b class="odn" title="' + esc(T(od + ' overdue', od + ' 项逾期')) + '">' + od + '</b> ' : '') + n.length + '</span></button>'; }
function renderBnav(){
  var nb = $('#bnav'); if(!nb) return;
  if(!STORE || document.body.classList.contains('gate') || STORE.mode === 'public'){ nb.innerHTML = ''; renderSheet(); return; }
  var mine = peopleDir() && (isInternal() || STORE.mode === 'demo'), inMore = ['schedule','decks','activity','files','owner','settings'].indexOf(S.page) >= 0;
  var it = [['home','home','Overview','总览', S.page === 'home' && !S.sheet], mine ? ['mine','user','My work','我的工作', S.page === 'mine' && !S.sheet] : null, ['@regs','table','Registers','台账', S.sheet === 'regs' || (S.page === 'reg' && !S.sheet)], ['@search','search','Search','搜索', !!S.msearch], ['@more','menu','More','更多', S.sheet === 'more' || (inMore && !S.sheet)]].filter(Boolean);
  nb.innerHTML = it.map(function(x){ return '<button type="button" data-act="bnav" data-v="' + x[0] + '"' + (x[4] ? ' aria-current="page"' : '') + '>' + uic(x[1], 20) + '<span>' + esc(T1(x[2], x[3])) + '</span></button>'; }).join('');
  renderSheet();
}
function renderSheet(){
  var r = $('#sheet-root'); if(!r) return;
  if(!S.sheet){ r.innerHTML = ''; return; }
  var h = '';
  if(S.sheet === 'regs') h = '<h2>' + L('Registers', '台账') + '</h2>' + navRegsHtml('sreg', !!S.sideEdit) + (S.sideEdit ? navEditFoot() : (canCreateReg() ? '<button type="button" class="sadd" data-act="newReg">' + uic('plus', 14) + ' ' + L('New register', '新建台账') + '</button>' : '') + '<button type="button" class="sadd" data-act="navEdit">' + uic('gear', 14) + ' ' + L('Arrange this menu', '整理菜单') + '</button>');
  else if(S.sideEdit){ var mp = navModel(true).pages; h = '<h2>' + L('More', '更多') + '</h2><div class="snav">' + mp.map(function(p, k){ return navEditRow(uic(p[1]) + '<span>' + L(p[2], p[3]) + '</span>', p[0], 'pages', k, mp.length, false); }).join('') + '</div>' + navEditFoot(); }
  else h = '<h2>' + L('More', '更多') + '</h2><div class="snav">' + navModel(false).pages.filter(function(p){ return p[0] !== 'home' && p[0] !== 'mine'; }).map(function(p){ return '<button type="button" data-act="page" data-v="' + p[0] + '"' + (S.page === p[0] ? ' aria-current="page"' : '') + '>' + uic(p[1]) + '<span>' + L(p[2], p[3]) + '</span></button>'; }).join('') + '</div><button type="button" class="sadd" data-act="navEdit">' + uic('gear', 14) + ' ' + L('Arrange this menu', '整理菜单') + '</button>' +
    (STORE.mode === 'cloud' && STORE.me ? '<div class="sme"><span>' + esc(STORE.me.name || STORE.me.email || '') + ' · ' + esc(roleName(role())) + '</span><button type="button" class="btn sm" data-act="signout">' + L('Sign out', '退出登录') + '</button></div>' : '');
  var was = r.querySelector('.sheet');
  r.innerHTML = '<div class="sheet-scrim" data-act="sheetClose"></div><div class="sheet" role="dialog" aria-modal="true" tabindex="-1" aria-label="' + esc(S.sheet === 'regs' ? T('Registers', '台账') : T('More', '更多')) + '"><span class="sgrip"></span>' + h + '</div>';
  if(!was){ var sh = r.querySelector('.sheet'); if(sh) sh.focus(); }
}
/* v3.3 · the menu as each person arranged it (order, hidden items, pinned registers); "Arrange this menu" switches to edit mode */
function renderSide(){
  var ed = !!S.sideEdit, m = navModel(ed);
  var h = '<div class="snav">' + m.pages.map(function(p, i){ var lab = uic(p[1]) + '<span>' + L(p[2], p[3]) + '</span>'; return ed ? navEditRow(lab, p[0], 'pages', i, m.pages.length, false) : '<button type="button" data-act="page" data-v="' + p[0] + '"' + (S.page === p[0] ? ' aria-current="page"' : '') + '>' + lab + '</button>'; }).join('') + '</div>';
  h += navRegsHtml('sreg', ed);
  if(ed) h += navEditFoot();
  else { if(canCreateReg()) h += '<button type="button" class="sadd" data-act="newReg">' + uic('plus', 14) + ' ' + L('New register', '新建台账') + '</button>';
    h += '<button type="button" class="sadd sarr" data-act="navEdit">' + uic('gear', 14) + ' ' + L('Arrange this menu', '整理菜单') + '</button>'; }
  $('#side').innerHTML = h; $('#side').classList.toggle('editing', ed);
  document.body.classList.toggle('side-open', !!S.sideOpen);
}
/* while the main area is rebuilt, the browser fires focusout on the element being replaced — inline editors ignore that */
function renderMain(){ S.inRender = (S.inRender || 0) + 1; try{ renderMain0(); } finally { S.inRender--; } }
function renderMain0(){
  var pk0 = S.page + ':' + S.reg + ':' + (S.rv[S.reg] || ''); if(S.lastPk !== pk0) VW = {}; LZ = [];
  var m = $('#main'), sx = m.scrollTop, h, gw = $('#gwrap'), gsc = gw ? [gw.scrollLeft, gw.scrollTop] : null, tw = $('.tbl-wrap'), tsc = tw ? [tw.scrollLeft, tw.scrollTop] : null, pk = S.page + ':' + S.reg + ':' + (S.rv[S.reg] || '');
  try{
    if(S.page === 'reg' && getReg(S.reg)) h = viewRegister(getReg(S.reg));
    else if(S.page === 'schedule') h = viewSchedule();
    else if(S.page === 'activity') h = viewActivity();
    else if(S.page === 'files') h = viewFiles();
    else if(S.page === 'owner') h = viewOwner();
    else if(S.page === 'settings') h = viewSettings();
    else if(S.page === 'decks') h = viewDecks();
    else if(S.page === 'mine') h = viewMine();
    else { S.page = 'home'; h = viewHome(); }
  }catch(e){ console.error(e); h = '<div class="card empty">' + L('Something went wrong showing this page.', '页面显示出错。') + '<pre class="note">' + esc(e && e.message) + '</pre></div>'; }
  var banner = '';
  if(STORE.mode === 'demo') banner = '';
  else if(STORE.needSchema) banner = '<div class="banner strip">' + L('The database needs the updated structure. In Supabase open SQL Editor → New query, paste the new supabase/schema.sql, click Run, then reload this page.', '数据库需要更新结构：在 Supabase 打开 SQL Editor → New query，粘贴新的 supabase/schema.sql，点 Run，然后刷新本页。') + '</div>';
  else if(STORE.v1 && role() === 'admin') banner = '<div class="banner strip">' + L('One-time setup: create the registers (turnover, site works, punch list, meetings, TDS) and move existing turnover data into the new structure.', '一次性设置：建立台账（移交、现场施工、尾项、会议、TDS），并把现有移交数据迁移到新结构。') + ' <button type="button" class="btn pri sm" data-act="setup">' + L('Set up now', '立即设置') + '</button></div>';
  else if(STORE.v1) banner = '<div class="banner strip">' + L('The project admin needs to sign in once to finish setting up the registers.', '需要项目管理员登录一次完成台账设置。') + '</div>';
  if(S.newVer) banner = '<div class="banner strip">' + L('A newer version of this site is available (' + S.newVer + ').', '网站有新版本（' + S.newVer + '）。') + ' <button type="button" class="btn pri sm" data-act="appReload">' + L('Load it now', '立即载入') + '</button></div>' + banner;
  if(h.indexOf('data-rg=') < 0 || !regionPatch(m, banner + h)){ RG = {}; m.innerHTML = banner + h; }
  if(typeof enhanceDates === 'function') enhanceDates(m);
  $$('.dke-film .dk-t').forEach(function(t){ t.classList.toggle('on', t.dataset.v === S.dslide); });
  document.body.classList.toggle('dkfull', S.page === 'decks' && !!m.querySelector('.dke'));
  m.scrollTop = sx;
  var same = S.lastPk === pk; S.lastPk = pk;
  if(same && tsc){ var t2 = $('.tbl-wrap'); if(t2){ t2.scrollLeft = tsc[0]; t2.scrollTop = tsc[1]; } }
  if(S.page === 'reg' || S.page === 'schedule') afterGantt(same && S.gKeep ? gsc : null);
  vwAfterRender();
  stickyCols();
  if(S.page === 'decks'){ fitSlides(); enableInline(); }
}
/* the number and title columns stay in view while a wide table scrolls sideways (when they are the first columns) */
function stickyCols(){
  $$('table.tbl').forEach(function(t){
    var sel = t.querySelector('thead th.sel'), no = t.querySelector('thead th.no'), tt = t.querySelector('thead th.tt'); if(window.innerWidth < 700 || (!no && !tt)){ t.classList.remove('sk-no', 'sk-tt'); return; }
    var x = sel ? sel.offsetWidth : 0, noFirst = no && (!tt || no.cellIndex < tt.cellIndex);
    /* the number column sticks only when it comes first; the title sticks next to it (columns between scroll underneath) */
    if(noFirst){ t.style.setProperty('--sl-no', x + 'px'); x += no.offsetWidth; }
    if(tt) t.style.setProperty('--sl-tt', x + 'px');
    t.classList.toggle('sk-no', !!noFirst); t.classList.toggle('sk-tt', !!tt && x + tt.offsetWidth < t.parentElement.clientWidth * 0.6);
  });
}

/* ---------------- region patching ----------------
   A page can mark big parts with data-rg="name". When only some parts changed since the last draw, only those are
   replaced; the rest of the page (and whatever scripts did to it: scaling, fitting, focus) stays as it is. */
var RG = {};
function regionPatch(m, html){
  var tp = document.createElement('template'); tp.innerHTML = html;
  var regs = tp.content.querySelectorAll('[data-rg]'), parts = {}, names = [];
  Array.prototype.forEach.call(regs, function(r){ parts[r.dataset.rg] = r.innerHTML; names.push(r.dataset.rg); r.innerHTML = ''; });
  var skel = tp.innerHTML;
  if(RG.skel !== skel || !m.querySelector('[data-rg]')){ m.innerHTML = html; RG = {skel:skel, parts:parts}; return true; }
  names.forEach(function(n){ if(RG.parts[n] !== parts[n]){ var el = m.querySelector('[data-rg="' + n + '"]'); if(el) el.innerHTML = parts[n]; } });
  RG.parts = parts; return true;
}

/* ---------------- long lists: draw only the rows near the visible part ----------------
   Lists up to VW_MIN rows are drawn in full. Longer ones (table rows or Gantt rows) keep all row HTML in memory and put
   only a window of rows in the page, with spacers above and below.
   Rows differ in height (two-line titles, sub-item buttons, chips), so each drawn row's real height is remembered and
   rows not drawn yet count with the average. Positions come from the running sum of those heights. The browser's own
   scroll anchoring is off for these lists ([data-vw]{overflow-anchor:none}); instead the row at the top of the view is
   kept in place when heights get corrected, and after every redraw the visible part is checked and filled at once. */
var VW = {}, VW_MIN = 150, LZ = [];
/* a lazy row: its HTML is only built when the row is drawn */
function lzRow(fn, kind){ var i = LZ.push(fn) - 1; return kind === 'div' ? '<div class="grow" data-lz="' + i + '"></div>' : '<tr data-lz="' + i + '"></tr>'; }
function lzGet(lz, x){ var m = /^<(?:tr|div class="grow") data-lz="(\d+)"><\/(?:tr|div)>$/.exec(x); return m && lz[+m[1]] ? lz[+m[1]]() : x; }
function vwSplit(html, kind){ return kind === 'tr' ? html.split(/(?=<tr[\s>])/).filter(Boolean) : html.split(/(?=<div class="grow[\s"])/).filter(Boolean); }
function vwSpacer(st, h){ return st.kind === 'tr' ? '<tr class="vsp" aria-hidden="true"><td colspan="' + st.span + '" style="height:' + Math.round(h) + 'px"></td></tr>' : '<div class="vsp" aria-hidden="true" style="height:' + Math.round(h) + 'px"></div>'; }
function vwSetSp(sp, h){ if(sp) (sp.firstElementChild || sp).style.height = Math.max(0, Math.round(h)) + 'px'; }
function vwEst(st){ return st.cnt ? st.sum / st.cnt : (st.kind === 'tr' ? 40 : 38); }
/* offsets: o[i] = top of row i inside the list, o[n] = full height */
function vwOff(st){ var n = st.rows.length, o = new Float64Array(n + 1), e = vwEst(st), acc = 0; for(var i = 0; i < n; i++){ o[i] = acc; var h = st.hs[i]; acc += h > 0 ? h : e; } o[n] = acc; st.off = o; return o; }
function vwFind(o, y){ var lo = 0, hi = o.length - 2; if(hi <= 0 || y <= 0) return 0; while(lo < hi){ var m = (lo + hi) >> 1; if(o[m + 1] > y) hi = m; else lo = m + 1; } return lo; }
/* rows to draw for a view starting at y (list coordinates) of height vh, with a margin of about one screen above and below */
function vwRange(st, y, vh){ var o = vwOff(st), n = st.rows.length, buf = Math.max(500, vh); var s = vwFind(o, y - buf), e = Math.min(n, vwFind(o, y + vh + buf) + 1); if(e <= s) e = Math.min(n, s + 1); return [s, e]; }
function vwInner(st){ var r = st.range, o = st.off || vwOff(st), out = ''; for(var i = r[0]; i < r[1]; i++){ var x = st.rows[i]; if(x.indexOf('data-lz=') > 0 && x.length < 60){ x = lzGet(st.lz, x); st.rows[i] = x; } out += x; } return vwSpacer(st, o[r[0]]) + out + vwSpacer(st, o[st.rows.length] - o[r[1]]); }
/* rows: array of row HTML. Returns the HTML to put inside the scrolling list (all rows when short). */
function vwHtml(key, rows, kind, span){
  if(rows.length <= VW_MIN){ delete VW[key]; return rows.map(function(x){ return lzGet(LZ, x); }).join(''); }
  var old = VW[key] || {}, keep = old.rows && old.rows.length === rows.length;
  var st = VW[key] = {key:key, rows:rows, lz:LZ, kind:kind, span:span || 1, hs:keep ? old.hs : [], sum:keep ? old.sum : 0, cnt:keep ? old.cnt : 0, top:old.top || 0, head:old.head == null ? (kind === 'tr' ? 34 : 56) : old.head, vh:old.vh || Math.round(window.innerHeight * 0.75)};
  if(!keep && old.cnt){ st.sum = old.sum / old.cnt * 20; st.cnt = 20; }   // keep the average as a first guess
  st.range = vwRange(st, st.top - st.head, st.vh);
  return vwInner(st);
}
function vwBody(key){ return document.querySelector('[data-vwb="' + key + '"]'); }
function vwKids(b){ return Array.prototype.filter.call(b.children, function(c){ return !c.classList.contains('vsp'); }); }
/* the first row (index and screen position) showing at the top of the view, to keep it still */
function vwAnchor(st, c, b){ var ct = c.getBoundingClientRect().top + 40, kids = vwKids(b); for(var k = 0; k < kids.length; k++){ var rc = kids[k].getBoundingClientRect(); if(rc.bottom > ct) return {i:st.range[0] + k, y:rc.top}; } return null; }
/* after the rows are in the page: measure them, fix the spacers, keep the top row still, and make sure the view is filled */
function vwSync(st, c, b, anchor){
  for(var pass = 0; pass < 4; pass++){
    var r = st.range, kids = vwKids(b);
    kids.forEach(function(el, k){ var i = r[0] + k, h = el.getBoundingClientRect().height; if(!(h > 0)) return; var was = st.hs[i]; if(was > 0){ st.sum += h - was; } else { st.sum += h; st.cnt++; } st.hs[i] = h; });
    var o = vwOff(st), sp = b.querySelectorAll(':scope>.vsp'); vwSetSp(sp[0], o[r[0]]); vwSetSp(sp[1], o[st.rows.length] - o[r[1]]);
    if(anchor && anchor.i >= r[0] && anchor.i < r[1] && kids[anchor.i - r[0]]){ var dy = kids[anchor.i - r[0]].getBoundingClientRect().top - anchor.y; if(Math.abs(dy) >= 1) c.scrollTop += dy; }
    st.top = c.scrollTop; st.vh = c.clientHeight || st.vh;
    var bt = b.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop; if(isFinite(bt)) st.head = bt;
    var y = st.top - st.head, n = st.rows.length;
    if((r[0] === 0 || o[r[0]] <= y) && (r[1] === n || o[r[1]] >= y + st.vh)) return;
    st.range = vwRange(st, y, st.vh); b.innerHTML = vwInner(st);
  }
}
/* redraw the window around the current scroll position */
function vwRender(st, c){
  var b = vwBody(st.key); if(!b) return; var fk = focusKey(document.activeElement), anchor = vwAnchor(st, c, b);
  st.top = c.scrollTop; st.vh = c.clientHeight || st.vh; st.range = vwRange(st, st.top - st.head, st.vh);
  b.innerHTML = vwInner(st); vwSync(st, c, b, anchor); if(fk) restoreFocus(fk);
}
function vwAfterRender(){
  Object.keys(VW).forEach(function(k){ var b = vwBody(k), c = b && b.closest('[data-vw]'); if(!c){ delete VW[k]; return; } vwSync(VW[k], c, b, null); vwWatch(VW[k], c, b); });
  /* once more after the browser has laid out images and fonts */
  requestAnimationFrame(function(){ Object.keys(VW).forEach(function(k){ var st = VW[k], b = vwBody(k), c = b && b.closest('[data-vw]'); if(c && !vwCovered(st, c, b)) vwRender(st, c); }); });
}
/* is the view filled? checked on the page itself (row positions on screen), not on the remembered heights */
function vwCovered(st, c, b){
  var kids = vwKids(b); if(!kids.length) return st.rows.length === 0;
  var cr = c.getBoundingClientRect(), head = st.head - 0, top = cr.top + Math.max(0, Math.min(head, 80)), bot = cr.top + c.clientHeight, r = st.range, n = st.rows.length;
  var f = kids[0].getBoundingClientRect(), l = kids[kids.length - 1].getBoundingClientRect();
  return (r[0] === 0 || f.top <= top + 1) && (r[1] >= n || l.bottom >= bot - 1);
}
/* rows change height after they were measured (window width, sidebar, fonts, images): measure again and keep the view filled */
var VW_RO = typeof ResizeObserver === 'function' ? new ResizeObserver(function(es){
  es.forEach(function(e){ var b = e.target, key = b.getAttribute('data-vwb'), st = key && VW[key], c = b.closest('[data-vw]'); if(!st || !c) return;
    var w = Math.round(e.contentRect.width); if(st.ow === w) return; st.ow = w;   // width changed: row heights may have changed
    if(st.roT) cancelAnimationFrame(st.roT); st.roT = requestAnimationFrame(function(){ st.roT = 0; st.hs = []; st.sum = 0; st.cnt = 0; vwSync(st, c, b, vwAnchor(st, c, b)); }); });
}) : null;
function vwWatch(st, c, b){ if(VW_RO && b && !b.__vwro){ b.__vwro = 1; VW_RO.observe(b); } }
if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ Object.keys(VW).forEach(function(k){ var st = VW[k], b = vwBody(k), c = b && b.closest('[data-vw]'); if(c){ st.hs = []; st.sum = 0; st.cnt = 0; vwSync(st, c, b, vwAnchor(st, c, b)); } }); });
document.addEventListener('load', function(ev){ var t = ev.target; if(!t || t.tagName !== 'IMG') return; var b = t.closest && t.closest('[data-vwb]'), c = b && b.closest('[data-vw]'), st = b && VW[b.getAttribute('data-vwb')]; if(st && c && !vwCovered(st, c, b)) vwRender(st, c); }, true);
/* while scrolling: redraw as soon as the drawn rows no longer reach a margin past the view (in the same frame, before paint) */
document.addEventListener('scroll', function(ev){
  var c = ev.target; if(!c || !c.getAttribute) return; var key = c.getAttribute('data-vw'); if(!key || !VW[key]) return;
  var st = VW[key], o = st.off || vwOff(st), r = st.range, n = st.rows.length, vh = c.clientHeight || st.vh, y = c.scrollTop - st.head, m = Math.min(300, vh / 2);
  st.top = c.scrollTop;
  if((r[0] === 0 || o[r[0]] <= y - m) && (r[1] === n || o[r[1]] >= y + vh + m)){ var b = vwBody(key); if(!b || vwCovered(st, c, b)) return; }
  vwRender(st, c);
}, true);
/* table column widths for long (windowed) tables, so columns don't jump while scrolling */
/* a width set in the field manager: below 40 px it is treated as a slip (back to automatic), otherwise kept within 60–600 px */
function fieldW(f){ var w = +(f && f.w) || 0; return w < 40 ? 0 : clamp(Math.round(w), 60, 600); }
function colWidth(reg, f){ var fw = fieldW(f); if(fw) return fw; var ro = rolesOf(reg); if(f.key === ro.no) return 110; if(f.key === ro.title) return 300; if(f.key === ro.title2) return 220;
  return {text:160, long:260, date:112, number:100, percent:130, select:f.multi ? 180 : 140, tree:200, check:70, calc:110, files:90, link:90, sub:120, url:120}[f.type] || 140; }

/* ---------------- cell rendering ---------------- */
function chip(color, html){ return '<span class="chip c-' + esc(color || 'grey') + '">' + html + '</span>'; }
function optChip(o, v){ return o ? chip(o.color, esc(nm(o))) : chip('grey', esc(v)); }
function blockChips(arr, f){ arr = asArr(arr); if(!arr.length) return '<span class="ar c-grey">' + esc(S.lang === 'zh' ? '全场' : 'Site') + '</span>'; return arr.map(function(v){ var o = optOf(f, v); return '<span class="ar c-' + esc(o ? o.color : 'grey') + '" title="' + esc(o ? nm(o) : v) + '">' + esc(v) + '</span>'; }).join(''); }
function pbar(p, extra){ p = clamp(Math.round(+p || 0), 0, 100); return '<div class="prog"><i><b style="width:' + p + '%"></b></i><span class="mono">' + p + '</span>' + (extra || '') + '</div>'; }
/* phone numbers and email addresses open the phone or mail app (v3.0) */
var EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
function contactHref(f, v){ v = String(v == null ? '' : v).trim(); if(!v) return '';
  if(EMAIL_RE.test(v)) return 'mailto:' + v;
  if(/phone|tel|mobile/i.test(f.key || '') && /^[+()\d][\d\s().\-\/]{5,}$/.test(v) && (v.match(/\d/g) || []).length >= 6) return 'tel:' + v.split('/')[0].replace(/[^\d+]/g, '');
  return ''; }
function cellHtml(reg, f, rec, opts){
  var v = val(rec, f);
  switch(f.type){
    case 'select':
      if(f.list === 'blocks') return blockChips(v, f);
      if(isEmpty(v)) return '<span class="muted">—</span>';
      if(f.list === 'people' || f.list === 'subcon') return '<span class="ppl">' + asArr(v).map(function(x){ var o = optOf(f, x); return esc(o ? nm(o) : x); }).join(', ') + '</span>';
      return asArr(v).map(function(x){ return optChip(optOf(f, x), x); }).join(' ');
    case 'tree': return treeCellHtml(f, v);   // v3.4.2: the top level, the full place as a tooltip
    case 'percent': if(v == null || v === '') return '<span class="muted">—</span>'; return pbar(v, isAutoNow(rec, f) ? '<span class="auto" title="' + esc(T('Calculated from quantities', '按工程量自动计算')) + '">ƒ</span>' : '');
    case 'number': return v == null || v === '' ? '<span class="muted">—</span>' : '<span class="mono">' + esc(Number(v).toLocaleString()) + (f.unit ? ' <span class="muted">' + esc(f.unit) + '</span>' : '') + '</span>';
    case 'calc': if(f.calc && f.calc.op === 'lk') return lkCell(reg, f, rec); return v == null ? '<span class="muted">—</span>' : (f.calc && f.calc.op === 'pct' ? pbar(v) : '<span class="mono">' + esc(v) + '</span>');
    case 'date':
      if(!v) return '<span class="muted">—</span>';
      var od = rolesOf(reg).finish === f.key && isOverdue(reg, rec);
      return '<span class="mono' + (od ? ' od' : '') + '">' + esc(opts && opts.full ? v : md(v)) + (od ? ' !' : '') + '</span>';
    case 'check': return '<span class="ck' + (v ? ' on' : '') + '">' + (v ? '✓' : '') + '</span>';
    case 'files': var fl = asArr(v); if(!fl.length) return '<span class="muted">—</span>'; var img = fl.filter(function(x){ return /^image\//.test(x.type || ''); })[0], u = img && STORE.fileUrl(img.path);
      return (u ? '<img class="thumb" src="' + esc(u) + '" alt="">' : '') + '<span class="mono muted">' + fl.length + '</span>';
    case 'link': var ls = asArr(v); if(ls.length && ls.length <= 2){ var nms = ls.map(function(id){ var r = getRec(id), g = r && getReg(r.reg); return r ? (isPeopleReg(g) ? personName(r) : recLabel(r)) : ''; }).filter(Boolean); if(nms.length === ls.length) return esc(nms.join(', ')); }
      return ls.length ? '<span class="chip c-teal">' + uic('link', 12) + ' ' + ls.length + '</span>' : '<span class="muted">—</span>';
    case 'sub': var rows = asArr(v); if(!rows.length) return '<span class="muted">—</span>'; if(f.kind === 'comments' && typeof cmCountHtml === 'function') return cmCountHtml(f, rows.filter(isPlainObj)); var open = f.key === 'actions' ? rows.filter(function(x){ return !x.done; }).length : null; return '<span class="mono muted">' + rows.length + (open != null ? ' · ' + open + ' ' + T('open', '未完成') : '') + '</span>';
    case 'url': return v ? '<a href="' + esc(/^https?:/i.test(v) ? v : 'https://' + v) + '" target="_blank" rel="noopener">' + uic('link', 13) + ' ' + esc(String(v).replace(/^https?:\/\//, '').slice(0, 28)) + '</a>' : '<span class="muted">—</span>';
    case 'long': return v ? '<span class="clamp">' + numLink(v, rec && rec.id) + '</span>' : '<span class="muted">—</span>';
    default: if(isEmpty(v)) return '<span class="muted">—</span>'; var ch = f.type === 'text' ? contactHref(f, v) : ''; return ch ? '<a class="ctl" href="' + esc(ch) + '">' + esc(v) + '</a>' : '<span class="clamp">' + (f.type === 'text' && rec && f.key !== rolesOf(reg).no ? numLink(v, rec.id) : esc(v)) + '</span>';
  }
}
function canInline(f){ return ['text','number','percent','date','url','long'].indexOf(f.type) >= 0; }

/* ---------------- pickers (popover) ---------------- */
function openPick(kind, o, anchor){
  var r = anchor.getBoundingClientRect();
  S.pop = Object.assign({kind:kind, q:'', x:r.left, y:r.bottom + 4, w:Math.max(240, r.width)}, o);
  renderPop();
  setTimeout(function(){ var i = $('#popq'); if(i) i.focus(); }, 10);
}
function closePop(){ if(S.pop){ S.pop = null; renderPop(); } }
function popField(){ var p = S.pop; if(!p) return null; var reg = getReg(p.reg); if(!reg) return null; if(p.sub){ var pf = fieldOf(reg, p.sub.key); return pf ? (pf.cols || []).filter(function(c){ return c.key === p.sub.col; })[0] : null; } return fieldOf(reg, p.key); }
function popCurrent(){ var p = S.pop, rec = p.rec && getRec(p.rec), reg = getReg(p.reg); if(p.bulk) return p.bulkVal; if(p.sub){ var rows = asArr(rec && rec.d[p.sub.key]); var row = rows.filter(function(x){ return x._id === p.sub.row; })[0]; return row ? row[p.sub.col] : null; } return rec ? rec.d[p.key] : null; }
function renderPop(){
  var root = $('#pop-root'), p = S.pop;
  if(!p){ root.innerHTML = ''; return; }
  var reg = getReg(p.reg), h = '';
  if(p.kind === 'opts'){
    var f = popField(); if(!f){ root.innerHTML = ''; return; }
    var cur = asArr(popCurrent()), q = p.q.toLowerCase(), multi = !!f.multi;
    var opts = optsOf(f).filter(function(o){ return (!o.left || cur.indexOf(o.v) >= 0) && (!q || (o.v + ' ' + o.en + ' ' + (o.zh || '')).toLowerCase().indexOf(q) >= 0); });
    var canAdd = p.q.trim() && !optsOf(f).some(function(o){ return o.v.toLowerCase() === q.trim() || (o.en || '').toLowerCase() === q.trim(); }) && (f.list ? canTeamEdit() : canWrite(reg));
    h = '<input class="in" id="popq" data-fk="popq" placeholder="' + esc(T('Search or type a new option', '搜索或输入新选项')) + '" value="' + esc(p.q) + '" autocomplete="off">' +
      '<div class="plist">' + opts.map(function(o){ var on = cur.indexOf(o.v) >= 0; return '<button type="button" class="popt' + (on ? ' on' : '') + '" data-act="popPick" data-v="' + esc(o.v) + '">' + (multi ? '<span class="cbx">' + (on ? '✓' : '') + '</span>' : '') + '<span class="sw c-' + esc(o.color || 'grey') + '"></span>' + esc(nm(o)) + (o.v !== o.en && f.list !== 'people' ? ' <span class="muted mono" style="font-size:11px">' + esc(o.v) + '</span>' : '') + '</button>'; }).join('') +
      (!opts.length && !canAdd ? '<div class="note" style="padding:6px 8px">' + L('No options', '没有选项') + '</div>' : '') + '</div>' +
      (canAdd ? '<button type="button" class="popt add" data-act="popAdd">' + uic('plus', 13) + ' ' + L('Add', '新增') + ' “' + esc(p.q.trim()) + '”' + (f.list ? ' <span class="muted">→ ' + esc(f.list === 'people' && peopleDir() ? regName(peopleDir()) : nm(lists()[f.list])) + '</span>' : '') + '</button>' : '') +
      '<div class="pfoot">' + (cur.length && !p.noClear ? '<button type="button" class="lnk" data-act="popClear">' + L('Clear', '清除') + '</button>' : '<span></span>') + (multi ? '<button type="button" class="btn sm" data-act="popClose">' + L('Done', '完成') + '</button>' : '') + (canSchemaEdit(reg) && !p.sub ? '<button type="button" class="lnk" data-act="editOpts" data-v="' + esc(f.key) + '">' + L('Edit options…', '编辑选项…') + '</button>' : '') + '</div>';
  } else if(p.kind === 'tree'){
    var tf = fieldOf(reg, p.key), cv = popCurrent(), tq = p.q.toLowerCase(), rows = [];
    treeDfs(tf, function(n, d){ if(!tq || treeLabel(n).toLowerCase().indexOf(tq) >= 0) rows.push('<button type="button" class="popt' + (cv === n.id ? ' on' : '') + '" data-act="popPick" data-v="' + esc(n.id) + '" style="padding-left:' + (8 + d * 14) + 'px"><span class="mono muted">' + esc(n.code || '') + '</span> ' + esc(nm(n)) + '</button>'); });
    h = '<input class="in" id="popq" data-fk="popq" placeholder="' + esc(T('Search', '搜索')) + '" value="' + esc(p.q) + '" autocomplete="off"><div class="plist">' + rows.join('') + '</div><div class="pfoot">' + (cv ? '<button type="button" class="lnk" data-act="popClear">' + L('Clear', '清除') + '</button>' : '<span></span>') + (canSchemaEdit(reg) ? '<button type="button" class="lnk" data-act="editOpts" data-v="' + esc(tf.key) + '">' + L('Edit tree…', '编辑分类…') + '</button>' : '') + '</div>';
  } else if(p.kind === 'link'){
    var lf = fieldOf(reg, p.key), rec = getRec(p.rec), have = asArr(rec && rec.d[p.key]), lq = p.q.toLowerCase(), allowed = (lf && lf.link && lf.link.length) ? lf.link.map(function(x){ return x === 'self' ? reg.id : x; }) : null, found = [];
    allRegs().forEach(function(rg){ if(allowed && allowed.indexOf(rg.id) < 0) return; recsOf(rg.id).forEach(function(r){ if(r.id === p.rec || found.length > 60) return; var t = (recNo(rg, r) + ' ' + recTitle(rg, r) + ' ' + (r.d[rolesOf(rg).title2] || '')).toLowerCase(); if(!lq || t.indexOf(lq) >= 0) found.push({rg:rg, r:r}); }); });
    h = '<input class="in" id="popq" data-fk="popq" placeholder="' + esc(T('Search records in any register', '搜索任意台账的记录')) + '" value="' + esc(p.q) + '" autocomplete="off"><div class="plist">' + found.map(function(x){ var on = have.indexOf(x.r.id) >= 0; return '<button type="button" class="popt' + (on ? ' on' : '') + '" data-act="popPick" data-v="' + esc(x.r.id) + '"><span class="cbx">' + (on ? '✓' : '') + '</span>' + icon(x.rg.d.icon, 13) + ' <span class="mono muted">' + esc(recNo(x.rg, x.r)) + '</span> ' + esc(recTitle(x.rg, x.r) || '—') + '</button>'; }).join('') + '</div><div class="pfoot"><span></span><button type="button" class="btn sm" data-act="popClose">' + L('Done', '完成') + '</button></div>';
  } else if(p.kind === 'parent'){
    var pr = getRec(p.rec), bad = {}; bad[p.rec] = 1; descendantsOf(pr).forEach(function(x){ bad[x.id] = 1; });
    var pq = p.q.toLowerCase(), cands = sortRecs(reg, recsOf(reg.id).filter(function(r){ if(bad[r.id]) return false; var t = (recNo(reg, r) + ' ' + recTitle(reg, r) + ' ' + (r.d[rolesOf(reg).title2] || '')).toLowerCase(); return !pq || t.indexOf(pq) >= 0; })).slice(0, 80);
    h = '<input class="in" id="popq" data-fk="popq" placeholder="' + esc(T('Search the parent item', '搜索上级项')) + '" value="' + esc(p.q) + '" autocomplete="off"><div class="plist">' + cands.map(function(r){ return '<button type="button" class="popt' + (pr.d.parent === r.id ? ' on' : '') + '" data-act="setParent" data-v="' + esc(r.id) + '" style="padding-left:' + (8 + depthOf(r) * 14) + 'px"><span class="mono muted">' + esc(recNo(reg, r)) + '</span> ' + esc(recTitle(reg, r) || '—') + '</button>'; }).join('') + '</div>';
  } else if(p.kind === 'menu'){
    h = p.html;
  }
  var vw = window.innerWidth, vh = window.innerHeight, w = Math.min(p.w || 260, vw - 16), x = Math.max(8, Math.min(p.x, vw - w - 8)), y = p.y, maxH = Math.max(200, vh - y - 12);
  if(maxH < 260 && p.y > vh / 2){ y = Math.max(8, p.y - 330); maxH = 320; }
  root.innerHTML = '<div class="popscrim" data-act="popClose"></div><div class="popover card" role="dialog" style="left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;max-height:' + maxH + 'px">' + h + '</div>';
}
function canSchemaEdit(reg){ return canWrite(reg); }
function addOption(reg, f, label){
  label = String(label || '').trim(); if(!label) return Promise.resolve(null);
  if(f.list === 'people' && peopleDir()) return peopleAdd(label);
  var isZh = /[一-鿿]/.test(label) && !/[A-Za-z]{3,}/.test(label);
  var o = O(f.list === 'people' || f.list === 'subcon' ? label : label.length <= 12 ? label : slug(label) || uid('o'), isZh ? label : label, isZh ? label : '', COLORS[(optsOf(f).length + 1) % COLORS.length]);
  if(f.list === 'blocks') o.v = label.toUpperCase().replace(/^BLOCK\s*/i, '').trim();
  if(optsOf(f).some(function(x){ return x.v === o.v; })) o.v = o.v + '_' + (optsOf(f).length + 1);
  if(f.list){ var ls = clone(lists()); ls[f.list].opts.push(o); return STORE.saveCfg({lists:ls}).then(function(){ return o.v; }); }
  var fields = clone(fieldsOf(reg)), path = S.pop && S.pop.sub ? S.pop.sub : null;
  var tgt = fields.filter(function(x){ return x.key === (path ? path.key : f.key); })[0];
  if(path) tgt = (tgt.cols || []).filter(function(c){ return c.key === path.col; })[0];
  tgt.opts = (tgt.opts || []).concat([o]);
  return STORE.patchReg(reg.id, {fields:fields}).then(function(){ return o.v; });
}
function pickApply(v){
  var p = S.pop, reg = getReg(p.reg), f = popField();
  if(p.bulk){ p.onPick(v); return; }
  var rec = p.rec && getRec(p.rec);
  if(p.kind === 'link'){ var have = asArr(rec.d[p.key]).slice(), i = have.indexOf(v); if(i >= 0) have.splice(i, 1); else have.push(v); setRec(rec, mk(p.key, have), {silent:true}); renderPop(); return; }
  if(p.sub && f && f.multi){ var rows0 = asArr(rec.d[p.sub.key]), row0 = rows0.filter(function(x){ return x._id === p.sub.row; })[0], cur0 = asArr(row0 && row0[p.sub.col]).slice(), k0 = cur0.indexOf(v); if(k0 >= 0) cur0.splice(k0, 1); else cur0.push(v); subSet(rec, p.sub.key, p.sub.row, p.sub.col, cur0); renderPop(); return; }
  if(p.sub){ subSet(rec, p.sub.key, p.sub.row, p.sub.col, v); closePop(); return; }
  if(p.kind === 'opts' && f.multi){ var cur = asArr(rec.d[p.key]).slice(), j = cur.indexOf(v); if(j >= 0) cur.splice(j, 1); else cur.push(v); setRec(rec, mk(p.key, cur)); renderPop(); return; }
  setRec(rec, mk(p.key, v)); closePop();
}
function mk(k, v){ var o = {}; o[k] = v; return o; }

/* ---------------- sub-tables ---------------- */
function subSet(rec, key, rowId, col, v){ var rows = clone(asArr(rec.d[key])); rows.forEach(function(r){ if(r._id === rowId) r[col] = v; }); setRec(rec, mk(key, rows), {silent:true}); }
function carryHtml(reg, rec, f, ed){
  var list = earlierActions(reg, rec, f); if(!list.length) return ''; var A = asOfN();
  return '<div class="carry"><h4>' + L('Still open from earlier meetings', '之前会议未完成的待办') + ' <span class="cnt">' + list.length + '</span></h4><table class="subt"><thead><tr><th>' + L('Action', '事项') + '</th><th>' + L('Owner', '负责人') + '</th><th>' + L('Due', '期限') + '</th><th>' + L('From', '来自') + '</th><th>' + L('Done', '完成') + '</th></tr></thead><tbody>' +
    list.map(function(x){ var od = x.due != null && x.due < A;
      return '<tr><td>' + esc(x.text || '—') + '</td><td>' + esc(x.who || '—') + '</td><td class="mono nowrap' + (od ? ' od' : '') + '">' + (x.due != null ? esc(md(n2d(x.due))) + (od ? ' !' : '') : '—') + '</td><td><button type="button" class="lnk mono" data-act="openRec" data-id="' + esc(x.rec.id) + '">' + esc(recNo(reg, x.rec)) + '</button></td>' +
        '<td><input type="checkbox" data-act="carryDone" data-id="' + esc(x.rec.id) + '" data-k="' + esc(f.key) + '" data-row="' + esc(x.row._id || '') + '"' + (ed && canWrite(reg) ? '' : ' disabled') + ' aria-label="' + esc(T('Mark done', '标记完成')) + '"></td></tr>'; }).join('') +
    '</tbody></table><p class="note">' + L('Ticking one marks it done in the meeting that raised it.', '勾选后会在提出它的那次会议中标记为完成。') + '</p></div>';
}
function c0lk(r){ return typeof nlChip === 'function' ? nlChip(r) : ''; }
function subEditor(reg, f, rec, ed){
  var rows = asArr(rec.d[f.key]), cols = f.cols || [];
  var h = '<div class="subwrap"><table class="subt"><thead><tr>' + cols.map(function(c){ return '<th>' + L(c.en, c.zh) + '</th>'; }).join('') + (ed ? '<th></th>' : '') + '</tr></thead><tbody>';
  var act = isActionField(f) ? actionCols(f) : null, nlOk = act && ed && typeof nlTargets === 'function' && nlTargets().length;
  rows.forEach(function(r, i){
    var lkc = act && c0lk(r);
    h += '<tr>' + cols.map(function(c){
      var v = r[c.key], a = ' data-sub="' + esc(f.key) + '" data-row="' + esc(r._id) + '" data-col="' + esc(c.key) + '" aria-label="' + esc(T1(c.en || c.key, c.zh) + ' ' + (i + 1)) + '"' + (ed ? '' : ' disabled');
      if(c.type === 'check') return '<td class="tc"><input type="checkbox"' + a + (v ? ' checked' : '') + '></td>';
      if(c.type === 'long') return '<td><textarea class="in" rows="2"' + a + ' data-fk="sub:' + esc(f.key + ':' + r._id + ':' + c.key) + '">' + esc(v || '') + '</textarea>' + (lkc && c.key === act.tk ? lkc : '') + '</td>';
      if(c.type === 'select'){ var vs = asArr(v).filter(function(x){ return x !== '' && x != null; });
        return '<td><button type="button" class="pickbtn' + (c.multi ? ' multi' : '') + '" data-act="subPick"' + a + '>' + (vs.length ? vs.map(function(x){ var o = optOf(c, x); return c.list === 'people' ? '<span class="ppl">' + esc(o ? nm(o) : x) + '</span>' : o ? optChip(o, x) : esc(x); }).join(' ') : '<span class="muted">—</span>') + '</button></td>'; }
      return '<td><input class="in" type="' + (c.type === 'date' ? 'date' : c.type === 'number' ? 'number' : 'text') + '"' + a + ' value="' + esc(v == null ? '' : v) + '" data-fk="sub:' + esc(f.key + ':' + r._id + ':' + c.key) + '">' + (lkc && c.key === act.tk ? lkc : '') + '</td>';
    }).join('') + (ed ? '<td class="tc nowrap">' + (nlOk && !(r.lk && getRec(r.lk)) && String(r[act.tk] || '').trim() ? '<button type="button" class="ib" data-act="nlRow" data-id="' + esc(rec.id) + '" data-sub="' + esc(f.key) + '" data-row="' + esc(r._id) + '" title="' + esc(T('New linked item from this action', '用此待办新增关联项目')) + '" aria-label="' + esc(T('New linked item from action ', '用此待办新增关联项目 ') + (i + 1)) + '">' + uic('link', 14) + '</button>' : '') + '<button type="button" class="ib" data-act="subDel" data-sub="' + esc(f.key) + '" data-row="' + esc(r._id) + '" title="' + esc(T('Remove row', '删除行')) + '">' + uic('x', 14) + '</button></td>' : '') + '</tr>';
  });
  if(!rows.length) h += '<tr><td colspan="' + (cols.length + 1) + '" class="note">' + L('No rows yet', '还没有内容') + '</td></tr>';
  return h + '</tbody></table>' + (ed ? '<button type="button" class="btn sm" data-act="subAdd" data-sub="' + esc(f.key) + '">' + uic('plus', 13) + ' ' + L('Add row', '添加一行') + '</button>' : '') + '</div>';
}

/* ---------------- record drawer ---------------- */
/* v3.2 · the record drawer: a title block with the fields that matter most (edit them in place), then the rest grouped by
   section with secondary empty fields folded away; only the tabs a record can use; duplicate / delete in the ⋯ menu;
   the drawer can be widened (drag its left edge) or opened full width */
function sumFields(reg){
  var ro = rolesOf(reg), out = [], add = function(f){ if(f && out.indexOf(f) < 0 && ['sub','files','link','long','section','calc','tree'].indexOf(f.type) < 0) out.push(f); };
  add(rf(reg, 'status')); add(fieldOf(reg, 'ownerResult')); add(fieldOf(reg, 'rev'));
  var ppl = dataFields(reg).filter(function(f){ return f.list === 'people' && f.key !== 'attendees'; }), who = ppl.filter(function(f){ return /resp|owner|who|contact|chair|assign/i.test(f.key); })[0] || ppl[0]; add(who);
  add(rf(reg, 'start')); add(rf(reg, 'finish')); add(rf(reg, 'progress')); add(rf(reg, 'astart')); add(rf(reg, 'afinish'));
  return out.filter(function(f){ return f.key !== ro.title && f.key !== ro.title2 && f.key !== ro.no; }).slice(0, 8);
}
function sumCell(reg, f, rec, ed){
  var v = rec.d[f.key], inner;
  if(f.type === 'select') inner = '<button type="button" class="sumv pickbtn"' + (ed ? ' data-act="pick" data-id="' + esc(rec.id) + '" data-k="' + esc(f.key) + '"' : ' disabled') + '>' + (isEmpty(v) ? '<span class="muted">—</span>' : cellHtml(reg, f, rec)) + '</button>';
  else if(f.type === 'percent' && isAutoNow(rec, f)) inner = '<div class="sumv ro">' + pbar(val(rec, f)) + '</div>';
  else inner = fieldInput(reg, f, rec, ed).replace('<input class="in"', '<input class="in" placeholder="—"');
  return '<div class="sumc t-' + esc(f.type) + '" role="group" aria-label="' + esc(T1(f.en || f.key, f.zh)) + '"><span class="flab">' + L(f.en, f.zh) + '</span>' + inner + '</div>';
}
function drawerTabs(reg, rec, kids){
  var lib = isLibRec(rec), trn = typeof isTrnReg === 'function' && isTrnReg(reg), fl = lib ? 0 : recFiles(rec).length, lk = relCount(rec);
  if(lib) return [['details','Document','文件'],['links','Used by & related','引用与相关', lk],['history','History','修改记录']];
  var tabs = [['details','Details','详情']];
  if(trn) tabs.push(['trn','Documents','文件清单', trnItems(rec).length]);
  if(isPeopleReg(reg)) tabs.push(['work','Assignments','参与事项', peopleWorkCount(reg, rec)]);
  if(!trn && (kids.length || S.dtab === 'subs')) tabs.push(['subs','Sub-items','子项', kids.length]);
  if(!trn) tabs.push(['files','Files','文件', fl]);
  var cmf = typeof cmField === 'function' ? cmField(reg) : null; if(cmf){ var cms = cmStats(cmf, cmRows(rec, cmf)); tabs.splice(1, 0, ['rvc','Review comments','审查意见', cms.n ? cms.open + '/' + cms.n : 0]); }
  tabs.push(['links','Related','相关', lk]);
  tabs.push(['history','History','修改记录']);
  if(((STORE && STORE.fb) || []).some(function(x){ return x.item_id === rec.id; })) tabs.push(['comments','Owner comments','业主意见', openFb(rec.id)]);
  return tabs;
}
function drawerW(){ var w = +LS.get('ww.dw', 0); return w >= 420 ? Math.min(w, window.innerWidth) : 0; }
function renderDrawer(){
  var root = $('#drawer-root'), rec = S.open && getRec(S.open);
  if(!rec){ if(S.open && STORE && STORE.ready){ S.open = null; } root.innerHTML = ''; document.body.classList.remove('dopen'); return; }
  var reg = getReg(rec.reg); if(!reg){ root.innerHTML = ''; return; }
  var ed = canWrite(reg), fk = focusKey(document.activeElement), ds = $('.dbody') ? $('.dbody').scrollTop : 0;
  var lib = isLibRec(rec), trn = typeof isTrnReg === 'function' && isTrnReg(reg), kids = lib ? [] : childrenOf(rec);
  var tabs = drawerTabs(reg, rec, kids);
  if(!tabs.some(function(t){ return t[0] === S.dtab; })) S.dtab = 'details';
  var desc = descendantsOf(rec).length, w = drawerW();
  var menu = '<details class="menu dmenu"><summary class="ib" aria-label="' + esc(T('More actions', '更多操作')) + '" title="' + esc(T('More actions', '更多操作')) + '">' + uic('dots', 18) + '</summary><div class="pop pop-r">' +
    (ed ? '<button type="button" data-act="dupRec">' + uic('copy', 14) + ' ' + L('Duplicate', '复制') + '</button>' : '') +
    (ed && !lib && !trn && reg.d.kind !== 'decks' ? '<button type="button" data-act="tplSave">' + uic('layers', 14) + ' ' + L('Save as a template…', '存成模板…') + '</button>' : '') +
    (ed && !lib && !trn ? '<button type="button" data-act="dtab" data-v="subs">' + uic('list', 14) + ' ' + L('Sub-items…', '子项…') + '</button>' : '') +
    (ed ? '<button type="button" data-act="linkOpen" data-id="' + esc(rec.id) + '">' + uic('link', 14) + ' ' + L('Link to…', '关联到…') + '</button>' : '') +
    (!lib && reg.d.kind !== 'decks' && typeof nlTargets === 'function' && nlTargets().length ? '<button type="button" data-act="nlOpen" data-id="' + esc(rec.id) + '">' + uic('plus', 14) + ' ' + L('New linked item…', '新增关联项目…') + '</button>' : '') +
    (reg.d.meeting ? '<button type="button" data-act="printMom">' + uic('print', 14) + ' ' + L('Print minutes', '打印纪要') + '</button>' : '') +
    '<button type="button" data-act="dtab" data-v="history">' + uic('hist', 14) + ' ' + L('History', '修改记录') + '</button>' +
    (canSchemaEdit(reg) ? '<button type="button" data-act="fieldsOpen" data-v="' + esc(reg.id) + '">' + uic('gear', 14) + ' ' + L('Fields of this register', '本台账字段') + '</button>' : '') +
    (ed ? '<hr><button type="button" class="dang" data-act="delAsk">' + uic('trash', 14) + ' ' + (desc ? L('Delete with ' + desc + ' sub-items…', '连同 ' + desc + ' 个子项删除…') : L('Delete…', '删除…')) + '</button>' : '') + '</div></details>';
  var es = relsOf(rec).filter(function(e){ return e.t !== 'men' && getRec(e.id); });
  var chips = (rf(reg, 'block') ? blockChips(rec.d[rf(reg, 'block').key], rf(reg, 'block')) : '') + (isOverdue(reg, rec) ? chip('red', L('Overdue', '逾期')) : '') + (!ed ? chip('grey', L('Read only', '只读')) : '') +
    (ownerGated(reg) && !isPrivate(reg) ? (ed ? '<label class="chip c-violet tog"><input type="checkbox" data-act="extTog"' + (rec.d.ext ? ' checked' : '') + '>' + uic('eye', 12) + ' ' + L('Owner can see', '业主可见') + '</label>' : (rec.d.ext ? chip('violet', uic('eye', 12) + ' ' + L('Owner can see', '业主可见')) : '')) : '') +
    (!lib && !es.length && ed ? '<button type="button" class="rchip add" data-act="linkOpen" data-id="' + esc(rec.id) + '">' + uic('plus', 12) + ' ' + L('Link', '关联') + '</button>' : '');
  var sf = lib || trn ? [] : sumFields(reg);
  var h = '<div class="scrim" data-act="close"></div><aside class="drawer' + (S.dwide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(recLabel(rec)) + '"' + (w && !S.dwide ? ' style="width:' + w + 'px"' : '') + '><div class="dres" data-dres="1" title="' + esc(T('Drag to resize', '拖动调整宽度')) + '"></div>' +
    '<div class="dh"><div class="dhr"><span class="crumb">' + icon(reg.d.icon, 14) + ' ' + esc(regName(reg)) + (isPrivate(reg) ? ' ' + uic('lock', 12) : '') + ' <span class="cs">›</span> ' + (parentRec(rec) ? '<button type="button" class="lnk" data-act="openRec" data-id="' + esc(parentRec(rec).id) + '">' + esc(recNo(reg, parentRec(rec)) || '↑') + '</button> <span class="cs">›</span> ' : '') + '<b>' + esc(recNo(reg, rec)) + '</b></span><span class="dha">' +
    (ed && !reg.d.allMs && !lib ? '<button type="button" class="ib' + (rec.d.ms ? ' on' : '') + '" data-act="msTog" aria-pressed="' + !!rec.d.ms + '" title="' + esc(T('Milestone (shows as a diamond on timelines)', '里程碑（在时间轴上显示为菱形）')) + '">' + icon('flag', 16) + '</button>' : '') +
    (ed ? '<button type="button" class="ib' + (rec.d.star ? ' on' : '') + '" data-act="star" aria-pressed="' + !!rec.d.star + '" title="' + esc(T('Key item', '重点')) + '">' + uic('star', 16) + '</button>' : '') + menu +
    '<button type="button" class="ib dwbtn" data-act="dwide" aria-pressed="' + !!S.dwide + '" title="' + esc(S.dwide ? T('Narrower', '收窄') : T('Full width', '展开全宽')) + '">' + uic(S.dwide ? 'right' : 'left', 16) + '</button>' +
    '<button type="button" class="ib" data-act="close" aria-label="' + esc(T('Close', '关闭')) + '">' + uic('x', 18) + '</button></span></div>' +
    '<div class="dtitle">' + esc(recTitle(reg, rec) || T('Untitled', '未命名')) + '</div>' + (recTitle2(reg, rec) ? '<div class="dtitle2">' + esc(recTitle2(reg, rec)) + '</div>' : '') +
    (chips ? '<div class="dchips">' + chips + '</div>' : '') + (reg.d.meeting && !isPrivate(reg) ? meetingDeckStrip(rec) : '') +
    (S.delAsk ? '<div class="dconf"><span>' + (desc ? L('Delete ' + recNo(reg, rec) + ' and its ' + desc + ' sub-items? You can restore them from the change log.', '删除 ' + recNo(reg, rec) + ' 及其 ' + desc + ' 个子项？可在修改记录中恢复。') : L('Delete ' + (recNo(reg, rec) || T('this item', '此项')) + '? You can restore it from the change log.', '删除 ' + (recNo(reg, rec) || '此项') + '？可在修改记录中恢复。')) + '</span><button type="button" class="btn sm danger" data-act="delYes">' + L('Delete', '删除') + '</button><button type="button" class="btn sm" data-act="delNo">' + L('Cancel', '取消') + '</button></div>' : '') +
    '<div class="dtabs" role="tablist">' + tabs.map(function(t){ return '<button type="button" role="tab" data-act="dtab" data-v="' + t[0] + '" aria-selected="' + (S.dtab === t[0]) + '">' + L(t[1], t[2]) + (t[3] ? ' <span class="cnt">' + t[3] + '</span>' : '') + '</button>'; }).join('') + '</div></div><div class="dbody">';
  if(S.dtab === 'files') h += drawerFiles(reg, rec, ed);
  else if(S.dtab === 'links') h += drawerLinks(reg, rec, ed);
  else if(S.dtab === 'subs') h += drawerSubs(reg, rec, ed, kids);
  else if(S.dtab === 'history') h += drawerHistory(reg, rec);
  else if(S.dtab === 'comments') h += drawerComments(reg, rec);
  else if(S.dtab === 'rvc' && typeof cmPanel === 'function') h += cmPanel(reg, rec, ed);
  else if(S.dtab === 'work' && isPeopleReg(reg)) h += peopleWork(reg, rec);
  else if(S.dtab === 'trn' && trn) h += trnItemsHtml(reg, rec, ed);
  else h += (sf.length ? '<div class="dsum">' + sf.map(function(f){ return sumCell(reg, f, rec, ed); }).join('') + '</div>' : '') + (lib ? docPreview(rec, ed) : (es.length ? relStrip(rec, ed) : '')) + (typeof closeChecklistHtml === 'function' ? closeChecklistHtml(reg, rec) : '') + drawerForm(reg, rec, ed, sf.concat(typeof cmField === 'function' && cmField(reg) ? [cmField(reg)] : [])) + (typeof docTrnHtml === 'function' && !isPrivate(reg) ? docTrnHtml(reg, rec) : '');
  h += '</div></aside>';
  root.innerHTML = h; document.body.classList.add('dopen');
  if(typeof enhanceDates === 'function') enhanceDates(root);
  var b = $('.dbody'); if(b) b.scrollTop = ds;
  restoreFocus(fk);
}
/* dragging the drawer's left edge sets its width (kept in this browser) */
document.addEventListener('pointerdown', function(e){
  var hnd = e.target.closest && e.target.closest('[data-dres]'); if(!hnd) return;
  var dr = hnd.parentNode; e.preventDefault(); hnd.setPointerCapture && hnd.setPointerCapture(e.pointerId);
  function mv(ev){ var w = Math.max(420, Math.min(window.innerWidth - 40, window.innerWidth - ev.clientX)); dr.style.width = w + 'px'; }
  function up(ev){ hnd.removeEventListener('pointermove', mv); hnd.removeEventListener('pointerup', up); var w = parseInt(dr.style.width, 10); if(w) LS.set('ww.dw', w); }
  hnd.addEventListener('pointermove', mv); hnd.addEventListener('pointerup', up);
});
function fieldInput(reg, f, rec, ed){
  var v = rec.d[f.key], dis = ed ? '' : ' disabled', a = ' data-df="' + esc(f.key) + '" data-fk="df:' + esc(rec.id + ':' + f.key) + '" aria-label="' + esc(T(f.en || f.key, f.zh)) + '"' + dis;
  switch(f.type){
    case 'text': case 'url': var chf = f.type === 'text' ? contactHref(f, v) : '', inp = '<input class="in" type="' + (f.type === 'url' ? 'url' : chf.indexOf('mailto:') === 0 ? 'email' : chf ? 'tel' : 'text') + '"' + a + ' value="' + esc(v == null ? '' : v) + '">';
      return chf ? '<div class="inu">' + inp + '<a class="btn sm" href="' + esc(chf) + '">' + (chf.indexOf('tel:') === 0 ? L('Call', '拨打') : L('Email', '发邮件')) + '</a></div>' : inp;
    case 'long': return '<textarea class="in" rows="' + (f.key === 'minutes' ? 8 : 3) + '"' + a + '>' + esc(v || '') + '</textarea>' + menChips(v, rec.id, f.key);
    case 'number': return '<div class="inu"><input class="in" type="number" step="any"' + a + ' value="' + esc(v == null ? '' : v) + '">' + (f.unit ? '<span class="muted">' + esc(f.unit) + '</span>' : '') + '</div>';
    case 'percent': if(isAutoNow(rec, f)) return '<div class="ro">' + pbar(val(rec, f)) + ' <span class="note">' + L('calculated from quantities', '按工程量计算') + '</span></div>'; return '<input class="in" type="number" min="0" max="100" step="5"' + a + ' value="' + esc(v == null ? '' : v) + '">';
    case 'date': return '<input class="in" type="date"' + a + ' value="' + esc(v || '') + '">';
    case 'check': return '<label class="chk"><input type="checkbox"' + a + (v ? ' checked' : '') + '>' + L('Yes', '是') + '</label>';
    case 'select': return '<button type="button" class="pickbtn in"' + (ed ? ' data-act="pick" data-id="' + esc(rec.id) + '" data-k="' + esc(f.key) + '"' : ' disabled') + '>' + (isEmpty(v) ? '<span class="muted">' + L('Choose…', '选择…') + '</span>' : cellHtml(reg, f, rec)) + '</button>';
    case 'tree': return '<button type="button" class="pickbtn in"' + (ed ? ' data-act="pickTree" data-id="' + esc(rec.id) + '" data-k="' + esc(f.key) + '"' : ' disabled') + '>' + (v ? esc(treePath(f, v).map(treeLabel).join(' › ')) : '<span class="muted">' + L('Choose…', '选择…') + '</span>') + '</button>';
    case 'calc': if(f.calc && f.calc.op === 'lk') return lkDrawer(reg, f, rec); return '<div class="ro">' + cellHtml(reg, f, rec) + '</div>';
    case 'files': return libShow(reg) && !isLibRec(rec) && (dataFields(reg).filter(function(x){ return x.type === 'files'; })[0] || {}).key === f.key ? docGridHtml(rec, ed) + (asArr(v).length ? '<div class="note" style="margin-top:6px">' + L('Attached directly:', '直接附加：') + '</div>' + fileList(reg, f, rec, ed) : '') : fileList(reg, f, rec, ed);
    case 'link': return linkList(reg, f, rec, ed);
    case 'sub': return subEditor(reg, f, rec, ed) + (isActionField(f) && reg.d.meeting ? carryHtml(reg, rec, f, ed) : '');
    default: return esc(v);
  }
}
function drawerForm(reg, rec, ed, skip){
  var lib = isLibRec(rec), ro = rolesOf(reg), all = !!S.dAll || (S.newBlank && S.newBlank.id === rec.id), folded = 0;
  if(!S.dFold || S.dFold.id !== rec.id) S.dFold = {id:rec.id, keys:fieldsOf(reg).filter(function(f){ return f.hide && isEmpty(rec.d[f.key]); }).map(function(f){ return f.key; })};
  /* sections: fields up to the next section heading; secondary fields (hidden in the table by default) that are empty fold away */
  var secs = [{h:null, fs:[]}];
  fieldsOf(reg).forEach(function(f){
    if(lib && f.type === 'files') return;
    if(f.type === 'section'){ secs.push({h:f, fs:[]}); return; }
    if(skip && skip.indexOf(f) >= 0) return;
    if(!all && f.hide && S.dFold.keys.indexOf(f.key) >= 0 && isEmpty(rec.d[f.key]) && f.key !== ro.title && f.type !== 'sub'){ folded++; return; }
    secs[secs.length - 1].fs.push(f);
  });
  var h = '<div class="fg">';
  secs.forEach(function(sc){
    if(!sc.fs.length) return;
    if(sc.h) h += '<h3 class="fsec full">' + L(sc.h.en, sc.h.zh) + '</h3>';
    sc.fs.forEach(function(f){
      var wide = ['long','sub','files','link'].indexOf(f.type) >= 0 || isLk(f) || f.key === ro.title || f.key === ro.title2;
      h += '<div class="fl' + (wide ? ' full' : '') + '" role="group" aria-label="' + esc(T1(f.en || f.key, f.zh)) + '"><span class="flab">' + L(f.en, f.zh) + (f.help ? ' <span class="note">' + esc(f.help) + '</span>' : '') + '</span>' + fieldInput(reg, f, rec, ed) + '</div>';
    });
  });
  h += '</div>';
  if(folded || S.dAll) h += '<button type="button" class="lnk dmore" data-act="dAll">' + (S.dAll ? L('Hide empty fields', '收起空字段') : L('Show ' + folded + ' more fields', '显示另外 ' + folded + ' 个字段')) + '</button>';
  h += (typeof depHtml === 'function' ? depHtml(reg, rec, ed) : '') + baseInfo(reg, rec);
  h += '<div class="note" style="margin-top:14px">' + L('Created', '创建') + ' ' + esc(fmtTime(rec.ca)) + ' · ' + L('last change', '最后修改') + ' ' + esc(fmtTime(rec.ua)) + (canSchemaEdit(reg) ? ' · <button type="button" class="lnk" data-act="fieldsOpen" data-v="' + esc(reg.id) + '">' + L('Add or change fields', '增删 / 修改字段') + '</button>' : '') + '</div>';
  return h;
}
function fileList(reg, f, rec, ed){
  var fl = asArr(rec.d[f.key]);
  var h = '<div class="files">' + fl.map(function(x, i){ var u = STORE.fileUrl(x.path), img = /^image\//.test(x.type || '');
    return '<div class="fitem">' + (img ? (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="' + esc(x.name) + '" loading="lazy"></a>' : '<div class="fph"></div>') : '<a class="fdoc" href="' + esc(u || '#') + '" target="_blank" rel="noopener">' + uic('file', 22) + '</a>') +
      '<div class="fname" title="' + esc(x.name) + '">' + esc(x.name) + '</div>' + (ed ? '<button type="button" class="ib fdel" data-act="fileDel" data-k="' + esc(f.key) + '" data-v="' + i + '" title="' + esc(T('Remove', '移除')) + '">' + uic('x', 13) + '</button>' : '') + '</div>'; }).join('') + '</div>';
  if(ed) h += '<div class="fbtns"><label class="btn sm">' + uic('plus', 13) + ' ' + L('Add files', '添加文件') + '<input type="file" multiple hidden data-up="' + esc(f.key) + '"></label><label class="btn sm">' + uic('camera', 13) + ' ' + L('Take photo', '拍照') + '<input type="file" accept="image/*" capture="environment" hidden data-up="' + esc(f.key) + '"></label>' + (S.uploading ? '<span class="note">' + L('Uploading…', '上传中…') + '</span>' : '') + '</div>';
  return h;
}
function drawerFiles(reg, rec, ed){
  var ff = dataFields(reg).filter(function(f){ return f.type === 'files'; }), docs = relsOf(rec).map(function(e){ return getRec(e.id); }).filter(function(d, i, a){ return d && isLibRec(d) && a.indexOf(d) === i; });
  if(libShow(reg)){
    var h0 = recPhotoBtn(rec) + '<h3 class="fsec">' + L('Documents & photos', '文件与照片') + ' <span class="cnt">' + docsOf(rec).length + '</span></h3>' + docGridHtml(rec, ed) + (ed ? '<p class="note">' + L('New files go into the Documents library and are linked here, so the same file can also be linked to other items. You can drop files onto this panel.', '新文件会存入「文件库」并关联到此处，同一文件也可关联到其他事项。可直接把文件拖到此面板。') + '</p>' : '');
    var old = ff.filter(function(f){ return asArr(rec.d[f.key]).length; });
    return h0 + old.map(function(f){ return '<h3 class="fsec">' + L(f.en, f.zh) + ' <span class="note">' + L('attached directly — use “Move into the library” on the Documents page', '直接附加 — 可在「文件库」页面移入文件库') + '</span></h3>' + fileList(reg, f, rec, ed); }).join('');
  }
  if(!ff.length) return '<div class="note">' + L('This register has no file field yet.', '此台账还没有文件字段。') + (canSchemaEdit(reg) ? ' <button type="button" class="lnk" data-act="fieldsOpen" data-v="' + esc(reg.id) + '">' + L('Add one', '添加') + '</button>' : '') + '</div>';
  return recPhotoBtn(rec) + ff.map(function(f){ return '<h3 class="fsec">' + L(f.en, f.zh) + '</h3>' + fileList(reg, f, rec, ed); }).join('');
}
function backlinks(rec){ var out = []; allRecs().forEach(function(r){ if(r.id === rec.id) return; var reg = getReg(r.reg); if(!reg) return; dataFields(reg).forEach(function(f){ if(f.type === 'link' && asArr(r.d[f.key]).indexOf(rec.id) >= 0) out.push(r); }); }); return out; }
function recRow(r, extra){ var reg = getReg(r.reg); if(!reg) return ''; return '<div class="lrow"><button type="button" class="lnk" data-act="openRec" data-id="' + esc(r.id) + '">' + icon(reg.d.icon, 13) + ' <span class="mono">' + esc(recNo(reg, r)) + '</span> ' + esc(recTitle(reg, r) || '—') + '</button>' + (statusOpt(reg, r) ? optChip(statusOpt(reg, r)) : '') + '<span class="muted" style="font-size:12px">' + esc(regName(reg)) + '</span>' + (extra || '') + '</div>'; }
function linkList(reg, f, rec, ed){
  var ls = asArr(rec.d[f.key]);
  return '<div class="links">' + ls.map(function(id){ var r = getRec(id); return r ? recRow(r, ed ? '<button type="button" class="ib" data-act="unlink" data-k="' + esc(f.key) + '" data-v="' + esc(id) + '">' + uic('x', 13) + '</button>' : '') : '<div class="lrow note">' + L('A record you cannot see (private or deleted)', '无法查看的记录（私有或已删除）') + '</div>'; }).join('') + (!ls.length ? '<div class="note">' + L('None', '无') + '</div>' : '') + '</div>' +
    (ed ? '<button type="button" class="btn sm" data-act="pickLink" data-id="' + esc(rec.id) + '" data-k="' + esc(f.key) + '">' + uic('link', 13) + ' ' + L('Link a record', '关联记录') + '</button>' : '');
}
function drawerSubs(reg, rec, ed, kids){
  var par = parentRec(rec), ru = rollup(reg, rec, kids), sf = rf(reg, 'status'), pf = rf(reg, 'progress');
  var h = '<div class="fl"><span class="flab">' + L('Belongs to', '上级') + '</span><div class="row">' + (par ? recRow(par) : '<span class="note">' + L('Top level', '顶层') + '</span>') +
    (ed ? '<button type="button" class="btn sm" data-act="pickParent" data-id="' + esc(rec.id) + '">' + (par ? L('Change…', '更改…') : L('Put under another item…', '归到其他项下…')) + '</button>' + (par ? '<button type="button" class="btn sm" data-act="setParent" data-v="">' + L('Make top level', '设为顶层') + '</button>' : '') : '') + '</div></div>';
  h += '<h3 class="fsec">' + L('Sub-items', '子项') + (ru ? ' <span class="note">' + L(ru.done + ' of ' + ru.n + ' done · ' + ru.pct + '%', ru.n + ' 项中已完成 ' + ru.done + ' · ' + ru.pct + '%') + '</span>' : '') + '</h3>';
  h += '<p class="note" style="margin:0 0 8px">' + L('Use sub-items for the individual drawings or documents inside one package (e.g. the sheets of an as-built set). Each sub-item has its own status, dates, files and history; the parent’s progress rolls up from them.', '子项用于一个文件包里的各张图纸或文件（如一套竣工图的每一张）。每个子项有自己的状态、日期、文件与修改记录；上级的进度由子项自动汇总。') + '</p>';
  if(kids.length){
    h += '<div class="card tbl-wrap" style="max-height:none"><table class="tbl subl"><thead><tr><th>' + L('No.', '编号') + '</th>' + (fieldOf(reg, 'docNo') ? '<th>' + L('Doc. No.', '文件编号') + '</th>' : '') + '<th>' + L('Title', '名称') + '</th>' + (sf ? '<th>' + L(sf.en, sf.zh) + '</th>' : '') + (pf ? '<th>%</th>' : '') + '<th></th></tr></thead><tbody>' +
      sortRecs(reg, kids).map(function(k){ var st = statusOpt(reg, k), gk = childrenOf(k).length;
        return '<tr><td class="mono">' + esc(recNo(reg, k)) + '</td>' + (fieldOf(reg, 'docNo') ? '<td class="mono">' + esc(k.d.docNo || '') + '</td>' : '') + '<td>' + esc(recTitle(reg, k) || '—') + (gk ? ' <span class="chip c-grey">' + gk + '</span>' : '') + '</td>' +
          (sf ? '<td>' + (ed ? '<button type="button" class="pickbtn" style="width:auto;min-height:26px" data-act="pick" data-id="' + esc(k.id) + '" data-k="' + esc(sf.key) + '">' + (st ? optChip(st) : '<span class="muted">—</span>') + '</button>' : (st ? optChip(st) : '')) + '</td>' : '') +
          (pf ? '<td class="mono">' + (progressOf(reg, k) != null ? progressOf(reg, k) + '%' : '') + '</td>' : '') + '<td><button type="button" class="btn sm" data-act="openRec" data-id="' + esc(k.id) + '">' + L('Open', '打开') + '</button></td></tr>'; }).join('') + '</tbody></table></div>';
  } else h += '<div class="note">' + L('No sub-items yet.', '还没有子项。') + '</div>';
  if(ed){
    h += '<div class="row" style="margin-top:10px"><input class="in" id="subQuick" data-fk="subQuick" placeholder="' + esc(T('Add one: e.g. E-ASB-001 Single line diagram', '新增一项：如 E-ASB-001 单线图')) + '" style="flex:1 1 280px"><button type="button" class="btn" data-act="subQuick">' + uic('plus', 13) + ' ' + L('Add', '新增') + '</button></div>' +
      '<details class="paste"><summary class="lnk">' + L('Paste a whole list (one per line)…', '粘贴整份清单（每行一项）…') + '</summary><textarea class="in" id="subBulk" rows="7" data-fk="subBulk" placeholder="E-ASB-001    Single line diagram 单线图&#10;E-ASB-002    Earthing layout 接地布置图&#10;…"></textarea><p class="note">' + L('Copy rows from Excel (drawing no. + title, tab-separated) or type one title per line. A drawing no. goes into Document No.; Chinese text goes into the Chinese name. Sub-items inherit the package, block and discipline.', '可直接从 Excel 复制（图号 + 名称，Tab 分隔），或每行一个名称。图号写入「文件编号」，中文写入中文名称。子项自动继承文件包、区域和专业。') + '</p><button type="button" class="btn pri" data-act="subBulk">' + L('Add all lines', '全部新增') + '</button></details>';
  }
  return h;
}
function drawerLinks(reg, rec, ed){
  return relatedPanel(rec, ed);
  var lf = dataFields(reg).filter(function(f){ return f.type === 'link'; }), bl = backlinks(rec);
  var h = lf.map(function(f){ return '<h3 class="fsec">' + L(f.en, f.zh) + '</h3>' + linkList(reg, f, rec, ed); }).join('');
  if(!lf.length) h += '<div class="note">' + L('This register has no link field yet.', '此台账还没有关联字段。') + (canSchemaEdit(reg) ? ' <button type="button" class="lnk" data-act="fieldsOpen" data-v="' + esc(reg.id) + '">' + L('Add one', '添加') + '</button>' : '') + '</div>';
  h += '<h3 class="fsec">' + L('Linked from', '被以下记录关联') + '</h3><div class="links">' + (bl.length ? bl.map(function(r){ return recRow(r); }).join('') : '<div class="note">' + L('None', '无') + '</div>') + '</div>';
  return h;
}
function auditRowHtml(a, opts){
  var reg = getReg(a.register_id), regOk = !!reg;
  var what = a.action === 'insert' ? L('added', '新增') : a.action === 'delete' ? L('deleted', '删除') : a.action === 'update' ? L('changed', '修改') : a.action === 'reg_insert' ? L('created register', '新建台账') : a.action === 'reg_delete' ? L('deleted register', '删除台账') : L('changed register setup', '修改台账设置');
  var data = a.new || a.old || {}, recName = '';
  if(a.record_id && opts && opts.showRec){ var r = getRec(a.record_id); recName = r ? '<button type="button" class="lnk" data-act="openRec" data-id="' + esc(r.id) + '">' + esc(recLabel(r)) + '</button>' : '<span>' + esc((reg && rolesOf(reg).no ? data[rolesOf(reg).no] || '' : '') + ' ' + (reg && rolesOf(reg).title ? data[rolesOf(reg).title] || '' : '')) + '</span>'; }
  if(!a.record_id){ var nmx = (a.new || a.old || {}); recName = '<b>' + esc(T1(nmx.en, nmx.zh)) + '</b>'; }
  var diff = '';
  if(a.action === 'update' && reg && a._light) diff = '<div class="diff"><div><span class="dk">' + esc((a.keys || []).map(function(k){ var f = fieldOf(reg, k); return f ? T1(f.en, f.zh) : k; }).join(', ')) + '</span></div></div>';
  else if(a.action === 'update' && reg){
    diff = '<div class="diff">' + (a.keys || []).map(function(k){ var f = fieldOf(reg, k) || (k === 'parent' ? {key:k, en:'Belongs to', zh:'上级', type:'link'} : k === 'dep' ? {key:k, en:'Starts after', zh:'前置事项', type:'dep'} : k === 'rel' ? {key:k, en:'Related', zh:'相关', type:'rel'} : {key:k, en:({star:'Key', ext:'External', ms:'Milestone', baseStart:'Baseline start', baseFinish:'Baseline finish'})[k] || k, zh:({star:'重点', ext:'对外', ms:'里程碑', baseStart:'基准开始', baseFinish:'基准结束'})[k] || '', type: k === 'star' || k === 'ext' || k === 'ms' ? 'check' : 'text'});
      var ov = textOf(reg, f, null, (a.old || {})[k]), nv = textOf(reg, f, null, (a.new || {})[k]);
      if(f.type === 'sub' || f.type === 'files' || f.type === 'link'){ ov = textOf(reg, f, null, (a.old || {})[k]) || '—'; nv = textOf(reg, f, null, (a.new || {})[k]) || '—'; }
      if(f.type === 'long'){ ov = String(ov).slice(0, 80); nv = String(nv).slice(0, 80); }
      return '<div><span class="dk">' + esc(T1(f.en, f.zh)) + '</span> <s>' + esc(ov || '—') + '</s> → <b>' + esc(nv || '—') + '</b></div>'; }).join('') + '</div>';
  }
  if(a.action === 'reg_update'){ var o = a.old || {}, n = a.new || {}, ch = []; if(o._visibility !== n._visibility) ch.push(T('visibility', '可见范围') + ': ' + o._visibility + ' → ' + n._visibility); if(!same(o.fields, n.fields)) ch.push(T('fields', '字段')); if(!same(o.roles, n.roles)) ch.push(T('field roles', '字段用途')); ['en','zh','icon','color','sec','prefix','ownerPublish','view'].forEach(function(k){ if(!same(o[k], n[k])) ch.push(k); }); diff = '<div class="diff note">' + esc(ch.join(' · ')) + '</div>'; }
  var undo = auditUndoable(a) ? '<button type="button" class="btn sm" data-act="undoAudit" data-v="' + esc(a.id) + '">' + uic('undo', 13) + ' ' + L('Undo', '撤销') + '</button>' : '';
  return '<div class="arow"><div class="ahead"><span class="who">' + esc(a.actor_name || '—') + '</span> ' + what + ' ' + (opts && opts.showReg && reg ? '<span class="muted">' + esc(regName(reg)) + ' ·</span> ' : (!regOk && a.register_id ? '<span class="muted">(' + L('deleted register', '已删除台账') + ')</span> ' : '')) + recName + '<span class="when" title="' + esc(fmtTime(a.at)) + '">' + esc(ago(a.at)) + '</span>' + undo + '</div>' + diff + '</div>';
}
function drawerHistory(reg, rec){
  if(!S.hist || S.hist.rec !== rec.id){ S.hist = {rec:rec.id, rows:null}; STORE.loadAudit({rec:rec.id, limit:300}).then(function(rows){ if(S.hist && S.hist.rec === rec.id){ S.hist.rows = rows; renderDrawer(); } }).catch(function(e){ toast(errText(e)); }); }
  var rows = S.hist.rows; if(!rows) return '<div class="note">' + L('Loading…', '加载中…') + '</div>';
  var live = ((STORE && STORE.audit) || []).filter(function(a){ return a.record_id === rec.id && !rows.some(function(x){ return x.id === a.id; }); });
  rows = live.concat(rows);
  window.__AUD = window.__AUD || {}; rows.forEach(function(a){ window.__AUD[a.id] = a; });
  return '<p class="note" style="margin:0 0 8px">' + L('Every change is recorded by the database — who, when, old and new value. Undo puts the old value back (and is itself recorded).', '每次修改都由数据库自动记录：谁、何时、旧值与新值。撤销会恢复旧值，撤销本身也会被记录。') + '</p>' +
    (rows.length ? rows.map(function(a){ return auditRowHtml(a); }).join('') : '<div class="note">' + L('No changes recorded yet.', '还没有修改记录。') + '</div>');
}
function drawerComments(reg, rec){
  var fbs = ((STORE && STORE.fb) || []).filter(function(x){ return x.item_id === rec.id; }), ed = canTeamEdit();
  return fbs.map(function(x){ return '<div class="fb' + (x.status === 'open' ? ' open' : '') + '"><div class="ahead"><b>' + esc(x.author_name || '') + '</b> <span class="muted">' + esc(fmtTime(x.created_at)) + '</span> ' + chip(x.status === 'open' ? 'red' : 'green', x.status === 'open' ? L('Open', '待处理') : L('Resolved', '已关闭')) + '</div><div style="white-space:pre-wrap">' + esc(x.body) + '</div>' + (x.reply ? '<div class="note">↳ ' + esc(x.reply) + '</div>' : '') +
    (ed && x.status === 'open' ? '<div class="row"><input class="in" id="rp_' + esc(x.id) + '" placeholder="' + esc(T('Reply (optional)', '回复（可选）')) + '"><button type="button" class="btn sm" data-act="fbResolve" data-v="' + esc(x.id) + '">' + L('Reply & resolve', '回复并关闭') + '</button></div>' : '') + '</div>'; }).join('');
}

/* ---------------- modal ---------------- */
function openModal(m){ S.modal = m; renderModal(); }
function closeModal(){ var m = S.modal; S.modal = null; renderModal(); if(m && typeof m.onClose === 'function') m.onClose(); }   // v3.4: a modal can tidy up when it is dismissed
function renderModal(){
  var root = $('#modal-root'), m = S.modal;
  if(!m){ root.innerHTML = ''; return; }
  var fk = focusKey(document.activeElement), body;
  try{ body = modalBody(m); }catch(e){ console.error(e); body = {title:'Error', html:esc(e.message)}; }
  var mb = $('.mbody'), sy = mb ? mb.scrollTop : 0, lpl = root.querySelector('.lpl'), ly = lpl ? lpl.scrollTop : 0;   // v3.4: pickers keep their list position
  root.innerHTML = '<div class="scrim" data-act="mclose"></div><div class="modal card' + (body.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(body.title) + '"><div class="mhead"><h2>' + body.title + '</h2><button type="button" class="ib" data-act="mclose" aria-label="Close">' + uic('x', 18) + '</button></div><div class="mbody">' + body.html + '</div>' + (body.foot ? '<div class="mfoot">' + body.foot + '</div>' : '') + '</div>';
  var nb = $('.mbody'); if(nb) nb.scrollTop = sy; var nl = root.querySelector('.lpl'); if(nl && ly) nl.scrollTop = ly;
  if(typeof enhanceDates === 'function') enhanceDates(root);
  restoreFocus(fk);
  if(root.querySelector('.dk-fit') && typeof fitSlides === 'function') fitSlides();
}

/* ---------------- sign-in gate ---------------- */
function renderGate(){
  var v = $('#main');
  if(!STORE.ready){ v.innerHTML = '<div class="card empty">' + L('Connecting…', '连接中…') + '</div>'; return; }
  if(S.recovery){ v.innerHTML = '<div class="card auth"><h1 class="vtitle">' + L('Set a new password', '设置新密码') + '</h1><form id="fRecover" class="fg1"><label class="fl">' + L('New password', '新密码') + '<input class="in" type="password" id="aPw" minlength="8" required autocomplete="new-password"></label><button class="btn pri" type="submit">' + L('Save password', '保存密码') + '</button></form></div>'; return; }
  if(STORE.session && STORE.me && (role() === 'pending' || role() === 'none')){
    v.innerHTML = '<div class="card auth"><h1 class="vtitle">' + L('Waiting for approval', '等待审批') + '</h1><p>' + L('Your account (' + (STORE.me.email || '') + ') is registered. The project admin needs to give you access.', '你的账号（' + (STORE.me.email || '') + '）已注册，需要项目管理员授权后才能查看。') + '</p><div class="row"><button class="btn" data-act="recheck">' + L('Check again', '重新检查') + '</button><button class="btn" data-act="signout">' + L('Sign out', '退出登录') + '</button></div></div>'; return;
  }
  var a = S.auth, c = cfg();
  var tabs = '<div class="seg" role="tablist">' + [['in','Sign in','登录'],['up','Create account','注册'],['reset','Forgot password','忘记密码']].map(function(t){ return '<button type="button" data-act="authTab" data-v="' + t[0] + '" aria-pressed="' + (a.tab === t[0]) + '">' + L(t[1], t[2]) + '</button>'; }).join('') + '</div>';
  var body = '';
  if(a.tab === 'up') body = '<label class="fl">' + L('Name', '姓名') + '<input class="in" id="aName" required autocomplete="name"></label><label class="fl">' + L('Email', '邮箱') + '<input class="in" type="email" id="aEmail" required autocomplete="email"></label><label class="fl">' + L('Password (8+ characters)', '密码（至少 8 位）') + '<input class="in" type="password" id="aPw" minlength="8" required autocomplete="new-password"></label><button class="btn pri" type="submit"' + (a.busy ? ' disabled' : '') + '>' + L('Create account', '注册') + '</button><p class="note">' + L('After you register, the project admin gives you access.', '注册后，由项目管理员授权。') + '</p>';
  else if(a.tab === 'reset') body = '<label class="fl">' + L('Email', '邮箱') + '<input class="in" type="email" id="aEmail" required autocomplete="email"></label><button class="btn pri" type="submit"' + (a.busy ? ' disabled' : '') + '>' + L('Send reset link', '发送重置链接') + '</button>';
  else body = '<label class="fl">' + L('Email', '邮箱') + '<input class="in" type="email" id="aEmail" required autocomplete="email"></label><label class="fl">' + L('Password', '密码') + '<input class="in" type="password" id="aPw" required autocomplete="current-password"></label><button class="btn pri" type="submit"' + (a.busy ? ' disabled' : '') + '>' + L('Sign in', '登录') + '</button>';
  v.innerHTML = '<div class="card auth"><h1 class="vtitle">' + esc(c.projectEn) + '</h1><p class="muted" style="margin:0">work-web · ' + L('Site & document registers', '现场与资料台账') + '</p>' + tabs + '<form id="fAuth" class="fg1">' + body + '</form>' + (a.err ? '<p class="err" role="alert">' + esc(a.err) + '</p>' : '') + (a.msg ? '<p class="okm" role="status">' + esc(a.msg) + '</p>' : '') + '</div>';
}

/* ---------------- new version check ----------------
   The site's pages can stay cached in the browser for a while after an update. version.json is read without the
   cache; when it names a newer version than the running page, a banner offers to load it (a new URL skips the cache). */
function appVer(){ var m = document.querySelector('meta[name="app-ver"]'); return m ? m.content : ''; }
function checkVersion(){
  if(!window.fetch || location.protocol === 'file:') return;
  fetch('version.json?t=' + Date.now(), {cache:'no-store'}).then(function(r){ return r.ok ? r.json() : null; }).then(function(j){
    if(j && /^[\w.-]{1,20}$/.test(j.v || '') && appVer() && j.v !== appVer() && S.newVer !== j.v){ S.newVer = j.v; if(typeof renderAll === 'function') renderAll(); }
  }).catch(function(){});
}
setTimeout(checkVersion, 4000); setInterval(checkVersion, 10 * 60 * 1000);
window.addEventListener('focus', function(){ if(!S.verAt || Date.now() - S.verAt > 60000){ S.verAt = Date.now(); checkVersion(); } });
document.addEventListener('click', function(e){ var el = e.target.closest && e.target.closest('[data-act="appReload"]'); if(!el) return; location.replace(location.pathname + '?v=' + encodeURIComponent(S.newVer || Date.now()) + location.hash); });
