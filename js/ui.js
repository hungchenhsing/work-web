/* work-web v2 · UI shell, cell rendering, pickers, record drawer, modals, sign-in gate. */
'use strict';

var renderQ = false;
function notify(){ if(renderQ) return; renderQ = true; requestAnimationFrame(function(){ renderQ = false; renderAll(); }); }
function notifySoft(){ notify(); }
function appReady(){ return STORE && STORE.ready && (STORE.mode === 'demo' || (STORE.me && STORE.session)); }

/* keep focus + caret across re-renders */
function focusKey(el){ if(!el || !el.getAttribute) return null; var k = el.getAttribute('data-fk'); return k ? {k:k, s:el.selectionStart, e:el.selectionEnd} : null; }
function restoreFocus(f){ if(!f) return; var el = document.querySelector('[data-fk="' + f.k.replace(/"/g, '\\"') + '"]'); if(el){ el.focus(); try{ if(f.s != null) el.setSelectionRange(f.s, f.e); }catch(e){} } }

function renderAll(){
  if(!STORE) return;
  var fk = focusKey(document.activeElement);
  document.documentElement.lang = S.lang === 'zh' ? 'zh-CN' : 'en';
  renderTop();
  if(STORE.mode === 'cloud' && (!STORE.ready || !STORE.session || !STORE.me || role() === 'pending' || role() === 'none' || S.recovery)){ $('#side').innerHTML = ''; document.body.classList.add('gate'); renderGate(); renderDrawer(); renderPop(); renderModal(); return; }
  document.body.classList.remove('gate');
  if(role() === 'owner'){ $('#side').innerHTML = ''; document.body.classList.add('gate'); $('#main').innerHTML = viewOwnerPortal(); fitSlides(); renderDrawer(); renderPop(); renderModal(); return; }
  renderSide();
  renderMain();
  renderDrawer(); renderPop(); renderModal();
  restoreFocus(fk);
}

/* ---------------- top bar & side navigation ---------------- */
function renderTop(){
  var c = cfg(), st = '';
  if(STORE){ if(STORE.mode === 'demo') st = ['Demo · this browser only', '演示 · 仅本浏览器', 'demo']; else if(appReady()) st = STORE.rt === 'live' ? ['Live', '在线', 'live'] : STORE.rt === 'off' ? ['Offline — changes may not sync', '离线，修改可能未同步', 'off'] : ['Connecting…', '连接中…', 'wait']; }
  var signed = STORE && STORE.mode === 'cloud' && STORE.me && STORE.session;
  $('#top').innerHTML =
    '<button type="button" class="ib sidebtn" data-act="side" aria-label="Menu">' + uic('menu', 20) + '</button>' +
    '<div class="brand"><b>' + esc(c.projectEn) + '</b><span>' + esc(c.projectZh) + '</span></div>' +
    (appReady() && isInternal() || (STORE && STORE.mode === 'demo') ? '<label class="gsearch">' + uic('search', 15) + '<input id="gq" type="search" data-fk="gq" placeholder="' + esc(T('Search all registers', '搜索全部台账')) + '" value="' + esc(S.q) + '" autocomplete="off"></label>' : '<span style="flex:1"></span>') +
    '<div class="tools">' + (st ? '<span class="sync" title="' + esc(T(st[0], st[1])) + '"><span class="dot ' + st[2] + '"></span><span class="stx">' + L(st[0], st[1]) + '</span></span>' : '') +
    '<div class="seg" role="group" aria-label="Language">' + [['en','EN'],['both','EN + 中'],['zh','中']].map(function(o){ return '<button type="button" data-act="lang" data-v="' + o[0] + '" aria-pressed="' + (S.lang === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
    (signed ? '<details class="menu um"><summary class="btn sm">' + esc(STORE.me.name || STORE.me.email || '') + ' · ' + esc(roleName(role())) + '</summary><div class="pop pop-r"><div class="note" style="padding:6px 10px">' + esc(STORE.me.email || '') + '</div><button type="button" data-act="signout">' + L('Sign out', '退出登录') + '</button></div></details>' : '') + '</div>' +
    (S.q && appReady() ? searchResults() : '');
}
function roleName(r){ var m = {admin:['Admin','管理员'], editor:['Editor','编辑'], viewer:['Viewer','只读'], owner:['Owner','业主'], pending:['Waiting','待审批']}[r] || [r, '']; return T1(m[0], m[1]); }
function searchResults(){
  var q = S.q.toLowerCase(), out = [];
  allRegs().forEach(function(reg){ recsOf(reg.id).forEach(function(r){ if(out.length > 40) return; var t = (recNo(reg, r) + ' ' + (r.d[rolesOf(reg).title] || '') + ' ' + (r.d[rolesOf(reg).title2] || '')).toLowerCase(); if(t.indexOf(q) >= 0) out.push({reg:reg, rec:r}); }); });
  return '<div class="gres card">' + (out.length ? out.map(function(x){ return '<button type="button" data-act="openRec" data-id="' + esc(x.rec.id) + '">' + icon(x.reg.d.icon, 14) + '<span class="mono muted">' + esc(recNo(x.reg, x.rec)) + '</span> ' + esc(recTitle(x.reg, x.rec) || '—') + ' <span class="muted" style="margin-left:auto;font-size:12px">' + esc(regName(x.reg)) + '</span></button>'; }).join('') : '<div class="note" style="padding:10px">' + L('No matches', '没有匹配') + '</div>') + '</div>';
}
function renderSide(){
  var pages = [['home','home','Overview','总览'],['schedule','cal','Schedule','进度计划'],['decks','present','Presentations','演示文稿'],['activity','hist','Change log','修改记录'],['files','file','Files & photos','文件与照片'],['owner','owner','Owner plan','业主计划'],['settings','gear','Settings','设置']];
  var h = '<div class="snav">' + pages.map(function(p){ return '<button type="button" data-act="page" data-v="' + p[0] + '"' + (S.page === p[0] ? ' aria-current="page"' : '') + '>' + uic(p[1]) + '<span>' + L(p[2], p[3]) + '</span></button>'; }).join('') + '</div>';
  var regs = allRegs(), secs = SECS.map(function(s){ return {s:s, regs:regs.filter(function(r){ return !isPrivate(r) && (r.d.sec || 'other') === s[0]; })}; });
  secs.push({s:['private','Only me','仅自己可见'], regs:regs.filter(isPrivate)});
  secs.forEach(function(g){
    if(!g.regs.length) return;
    h += '<div class="sh">' + (g.s[0] === 'private' ? uic('lock', 12) + ' ' : '') + L(g.s[1], g.s[2]) + '</div>' + g.regs.map(function(r){
      var n = recsOf(r.id), od = n.filter(function(x){ return isOverdue(r, x); }).length;
      return '<button type="button" class="sreg" data-act="reg" data-v="' + esc(r.id) + '"' + (S.page === 'reg' && S.reg === r.id ? ' aria-current="page"' : '') + '><span class="ri c-' + esc(r.d.color || 'blue') + '">' + icon(r.d.icon) + '</span><span class="rn">' + esc(regName(r)) + '</span><span class="scnt mono">' + (od ? '<b class="odn">' + od + '</b> ' : '') + n.length + '</span></button>';
    }).join('');
  });
  if(canCreateReg()) h += '<button type="button" class="sadd" data-act="newReg">' + uic('plus', 14) + ' ' + L('New register', '新建台账') + '</button>';
  $('#side').innerHTML = h;
  document.body.classList.toggle('side-open', !!S.sideOpen);
}
function renderMain(){
  var m = $('#main'), sx = m.scrollTop, h, gw = $('#gwrap'), gsc = gw ? [gw.scrollLeft, gw.scrollTop] : null, tw = $('.tbl-wrap'), tsc = tw ? [tw.scrollLeft, tw.scrollTop] : null, pk = S.page + ':' + S.reg + ':' + (S.rv[S.reg] || '');
  try{
    if(S.page === 'reg' && getReg(S.reg)) h = viewRegister(getReg(S.reg));
    else if(S.page === 'schedule') h = viewSchedule();
    else if(S.page === 'activity') h = viewActivity();
    else if(S.page === 'files') h = viewFiles();
    else if(S.page === 'owner') h = viewOwner();
    else if(S.page === 'settings') h = viewSettings();
    else if(S.page === 'decks') h = viewDecks();
    else { S.page = 'home'; h = viewHome(); }
  }catch(e){ console.error(e); h = '<div class="card empty">' + L('Something went wrong showing this page.', '页面显示出错。') + '<pre class="note">' + esc(e && e.message) + '</pre></div>'; }
  var banner = '';
  if(STORE.mode === 'demo') banner = '<div class="banner">' + L('Demo mode: data stays in this browser. Connect Supabase (see README) to go live for everyone.', '演示模式：数据只保存在本浏览器。连接 Supabase 后即可多人在线使用。') + '</div>';
  else if(STORE.needSchema) banner = '<div class="banner" style="background:var(--warn-soft);color:var(--warn)">' + L('The database needs the updated structure. In Supabase open SQL Editor → New query, paste the new supabase/schema.sql, click Run, then reload this page.', '数据库需要更新结构：在 Supabase 打开 SQL Editor → New query，粘贴新的 supabase/schema.sql，点 Run，然后刷新本页。') + '</div>';
  else if(STORE.v1 && role() === 'admin') banner = '<div class="banner">' + L('One-time setup: create the registers (turnover, site works, punch list, meetings, TDS) and move existing turnover data into the new structure.', '一次性设置：建立台账（移交、现场施工、尾项、会议、TDS），并把现有移交数据迁移到新结构。') + ' <button type="button" class="btn pri sm" data-act="setup">' + L('Set up now', '立即设置') + '</button></div>';
  else if(STORE.v1) banner = '<div class="banner">' + L('The project admin needs to sign in once to finish setting up the registers.', '需要项目管理员登录一次完成台账设置。') + '</div>';
  m.innerHTML = banner + h;
  m.scrollTop = sx;
  var same = S.lastPk === pk; S.lastPk = pk;
  if(same && tsc){ var t2 = $('.tbl-wrap'); if(t2){ t2.scrollLeft = tsc[0]; t2.scrollTop = tsc[1]; } }
  if(S.page === 'reg' || S.page === 'schedule') afterGantt(same && S.gKeep ? gsc : null);
  if(S.page === 'decks'){ fitSlides(); if(!same) m.scrollTop = 0; }
}

/* ---------------- cell rendering ---------------- */
function chip(color, html){ return '<span class="chip c-' + esc(color || 'grey') + '">' + html + '</span>'; }
function optChip(o, v){ return o ? chip(o.color, esc(nm(o))) : chip('grey', esc(v)); }
function blockChips(arr, f){ arr = asArr(arr); if(!arr.length) return '<span class="ar c-grey">' + esc(S.lang === 'zh' ? '全场' : 'Site') + '</span>'; return arr.map(function(v){ var o = optOf(f, v); return '<span class="ar c-' + esc(o ? o.color : 'grey') + '" title="' + esc(o ? nm(o) : v) + '">' + esc(v) + '</span>'; }).join(''); }
function pbar(p, extra){ p = clamp(Math.round(+p || 0), 0, 100); return '<div class="prog"><i><b style="width:' + p + '%"></b></i><span class="mono">' + p + '</span>' + (extra || '') + '</div>'; }
function cellHtml(reg, f, rec, opts){
  var v = val(rec, f);
  switch(f.type){
    case 'select':
      if(f.list === 'blocks') return blockChips(v, f);
      if(isEmpty(v)) return '<span class="muted">—</span>';
      if(f.list === 'people' || f.list === 'subcon') return '<span class="ppl">' + asArr(v).map(function(x){ var o = optOf(f, x); return esc(o ? nm(o) : x); }).join(', ') + '</span>';
      return asArr(v).map(function(x){ return optChip(optOf(f, x), x); }).join(' ');
    case 'tree': var n = treeNode(f, v); return n ? '<span class="tn"><span class="mono">' + esc(n.code || '') + '</span> ' + esc(nm(n)) + '</span>' : '<span class="muted">—</span>';
    case 'percent': if(v == null || v === '') return '<span class="muted">—</span>'; return pbar(v, isAutoNow(rec, f) ? '<span class="auto" title="' + esc(T('Calculated from quantities', '按工程量自动计算')) + '">ƒ</span>' : '');
    case 'number': return v == null || v === '' ? '<span class="muted">—</span>' : '<span class="mono">' + esc(Number(v).toLocaleString()) + (f.unit ? ' <span class="muted">' + esc(f.unit) + '</span>' : '') + '</span>';
    case 'calc': return v == null ? '<span class="muted">—</span>' : (f.calc && f.calc.op === 'pct' ? pbar(v) : '<span class="mono">' + esc(v) + '</span>');
    case 'date':
      if(!v) return '<span class="muted">—</span>';
      var od = rolesOf(reg).finish === f.key && isOverdue(reg, rec);
      return '<span class="mono' + (od ? ' od' : '') + '">' + esc(opts && opts.full ? v : md(v)) + (od ? ' !' : '') + '</span>';
    case 'check': return '<span class="ck' + (v ? ' on' : '') + '">' + (v ? '✓' : '') + '</span>';
    case 'files': var fl = asArr(v); if(!fl.length) return '<span class="muted">—</span>'; var img = fl.filter(function(x){ return /^image\//.test(x.type || ''); })[0], u = img && STORE.fileUrl(img.path);
      return (u ? '<img class="thumb" src="' + esc(u) + '" alt="">' : '') + '<span class="mono muted">' + fl.length + '</span>';
    case 'link': var ls = asArr(v); return ls.length ? '<span class="chip c-teal">' + uic('link', 12) + ' ' + ls.length + '</span>' : '<span class="muted">—</span>';
    case 'sub': var rows = asArr(v); if(!rows.length) return '<span class="muted">—</span>'; var open = f.key === 'actions' ? rows.filter(function(x){ return !x.done; }).length : null; return '<span class="mono muted">' + rows.length + (open != null ? ' · ' + open + ' ' + T('open', '未完成') : '') + '</span>';
    case 'url': return v ? '<a href="' + esc(/^https?:/i.test(v) ? v : 'https://' + v) + '" target="_blank" rel="noopener">' + uic('link', 13) + ' ' + esc(String(v).replace(/^https?:\/\//, '').slice(0, 28)) + '</a>' : '<span class="muted">—</span>';
    case 'long': return v ? '<span class="clamp">' + esc(v) + '</span>' : '<span class="muted">—</span>';
    default: return isEmpty(v) ? '<span class="muted">—</span>' : esc(v);
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
    var opts = optsOf(f).filter(function(o){ return !q || (o.v + ' ' + o.en + ' ' + (o.zh || '')).toLowerCase().indexOf(q) >= 0; });
    var canAdd = p.q.trim() && !optsOf(f).some(function(o){ return o.v.toLowerCase() === q.trim() || (o.en || '').toLowerCase() === q.trim(); }) && (f.list ? canTeamEdit() : canWrite(reg));
    h = '<input class="in" id="popq" data-fk="popq" placeholder="' + esc(T('Search or type a new option', '搜索或输入新选项')) + '" value="' + esc(p.q) + '" autocomplete="off">' +
      '<div class="plist">' + opts.map(function(o){ var on = cur.indexOf(o.v) >= 0; return '<button type="button" class="popt' + (on ? ' on' : '') + '" data-act="popPick" data-v="' + esc(o.v) + '">' + (multi ? '<span class="cbx">' + (on ? '✓' : '') + '</span>' : '') + '<span class="sw c-' + esc(o.color || 'grey') + '"></span>' + esc(nm(o)) + (o.v !== o.en && f.list !== 'people' ? ' <span class="muted mono" style="font-size:11px">' + esc(o.v) + '</span>' : '') + '</button>'; }).join('') +
      (!opts.length && !canAdd ? '<div class="note" style="padding:6px 8px">' + L('No options', '没有选项') + '</div>' : '') + '</div>' +
      (canAdd ? '<button type="button" class="popt add" data-act="popAdd">' + uic('plus', 13) + ' ' + L('Add', '新增') + ' “' + esc(p.q.trim()) + '”' + (f.list ? ' <span class="muted">→ ' + esc(nm(lists()[f.list])) + '</span>' : '') + '</button>' : '') +
      '<div class="pfoot">' + (cur.length && !p.noClear ? '<button type="button" class="lnk" data-act="popClear">' + L('Clear', '清除') + '</button>' : '<span></span>') + (multi ? '<button type="button" class="btn sm" data-act="popClose">' + L('Done', '完成') + '</button>' : '') + (canSchemaEdit(reg) && !p.sub ? '<button type="button" class="lnk" data-act="editOpts" data-v="' + esc(f.key) + '">' + L('Edit options…', '编辑选项…') + '</button>' : '') + '</div>';
  } else if(p.kind === 'tree'){
    var tf = fieldOf(reg, p.key), cv = popCurrent(), tq = p.q.toLowerCase(), rows = [];
    treeDfs(tf, function(n, d){ if(!tq || treeLabel(n).toLowerCase().indexOf(tq) >= 0) rows.push('<button type="button" class="popt' + (cv === n.id ? ' on' : '') + '" data-act="popPick" data-v="' + esc(n.id) + '" style="padding-left:' + (8 + d * 14) + 'px"><span class="mono muted">' + esc(n.code || '') + '</span> ' + esc(nm(n)) + '</button>'); });
    h = '<input class="in" id="popq" data-fk="popq" placeholder="' + esc(T('Search', '搜索')) + '" value="' + esc(p.q) + '" autocomplete="off"><div class="plist">' + rows.join('') + '</div><div class="pfoot">' + (cv ? '<button type="button" class="lnk" data-act="popClear">' + L('Clear', '清除') + '</button>' : '<span></span>') + (canSchemaEdit(reg) ? '<button type="button" class="lnk" data-act="editOpts" data-v="' + esc(tf.key) + '">' + L('Edit tree…', '编辑分类…') + '</button>' : '') + '</div>';
  } else if(p.kind === 'link'){
    var lf = fieldOf(reg, p.key), rec = getRec(p.rec), have = asArr(rec && rec.d[p.key]), lq = p.q.toLowerCase(), allowed = (lf && lf.link && lf.link.length) ? lf.link : null, found = [];
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
  if(p.sub){ subSet(rec, p.sub.key, p.sub.row, p.sub.col, v); closePop(); return; }
  if(p.kind === 'opts' && f.multi){ var cur = asArr(rec.d[p.key]).slice(), j = cur.indexOf(v); if(j >= 0) cur.splice(j, 1); else cur.push(v); setRec(rec, mk(p.key, cur)); renderPop(); return; }
  setRec(rec, mk(p.key, v)); closePop();
}
function mk(k, v){ var o = {}; o[k] = v; return o; }

/* ---------------- sub-tables ---------------- */
function subSet(rec, key, rowId, col, v){ var rows = clone(asArr(rec.d[key])); rows.forEach(function(r){ if(r._id === rowId) r[col] = v; }); setRec(rec, mk(key, rows), {silent:true}); }
function subEditor(reg, f, rec, ed){
  var rows = asArr(rec.d[f.key]), cols = f.cols || [];
  var h = '<div class="subwrap"><table class="subt"><thead><tr>' + cols.map(function(c){ return '<th>' + L(c.en, c.zh) + '</th>'; }).join('') + (ed ? '<th></th>' : '') + '</tr></thead><tbody>';
  rows.forEach(function(r, i){
    h += '<tr>' + cols.map(function(c){
      var v = r[c.key], a = ' data-sub="' + esc(f.key) + '" data-row="' + esc(r._id) + '" data-col="' + esc(c.key) + '"' + (ed ? '' : ' disabled');
      if(c.type === 'check') return '<td class="tc"><input type="checkbox"' + a + (v ? ' checked' : '') + '></td>';
      if(c.type === 'long') return '<td><textarea class="in" rows="2"' + a + ' data-fk="sub:' + esc(f.key + ':' + r._id + ':' + c.key) + '">' + esc(v || '') + '</textarea></td>';
      if(c.type === 'select'){ var o = (c.opts || []).filter(function(x){ return x.v === v; })[0]; return '<td><button type="button" class="pickbtn" data-act="subPick"' + a + '>' + (o ? optChip(o, v) : '<span class="muted">—</span>') + '</button></td>'; }
      return '<td><input class="in" type="' + (c.type === 'date' ? 'date' : c.type === 'number' ? 'number' : 'text') + '"' + a + ' value="' + esc(v == null ? '' : v) + '" data-fk="sub:' + esc(f.key + ':' + r._id + ':' + c.key) + '"></td>';
    }).join('') + (ed ? '<td class="tc"><button type="button" class="ib" data-act="subDel" data-sub="' + esc(f.key) + '" data-row="' + esc(r._id) + '" title="' + esc(T('Remove row', '删除行')) + '">' + uic('x', 14) + '</button></td>' : '') + '</tr>';
  });
  if(!rows.length) h += '<tr><td colspan="' + (cols.length + 1) + '" class="note">' + L('No rows yet', '还没有内容') + '</td></tr>';
  return h + '</tbody></table>' + (ed ? '<button type="button" class="btn sm" data-act="subAdd" data-sub="' + esc(f.key) + '">' + uic('plus', 13) + ' ' + L('Add row', '添加一行') + '</button>' : '') + '</div>';
}

/* ---------------- record drawer ---------------- */
function renderDrawer(){
  var root = $('#drawer-root'), rec = S.open && getRec(S.open);
  if(!rec){ if(S.open && STORE && STORE.ready){ S.open = null; } root.innerHTML = ''; document.body.classList.remove('dopen'); return; }
  var reg = getReg(rec.reg); if(!reg){ root.innerHTML = ''; return; }
  var ed = canWrite(reg), fk = focusKey(document.activeElement), ds = $('.dbody') ? $('.dbody').scrollTop : 0;
  var fl = dataFields(reg).filter(function(f){ return f.type === 'files'; }).reduce(function(n, f){ return n + asArr(rec.d[f.key]).length; }, 0);
  var lk = dataFields(reg).filter(function(f){ return f.type === 'link'; }).reduce(function(n, f){ return n + asArr(rec.d[f.key]).length; }, 0) + backlinks(rec).length;
  var kids = childrenOf(rec);
  var tabs = [['details','Details','详情'],['subs','Sub-items','子项', kids.length],['files','Files','文件', fl],['links','Links','关联', lk],['history','History','修改记录']];
  if(((STORE && STORE.fb) || []).some(function(x){ return x.item_id === rec.id; })) tabs.push(['comments','Owner comments','业主意见', openFb(rec.id)]);
  var h = '<div class="scrim" data-act="close"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="' + esc(recLabel(rec)) + '">' +
    '<div class="dh"><div class="dhr"><span class="crumb">' + icon(reg.d.icon, 14) + ' ' + esc(regName(reg)) + (isPrivate(reg) ? ' ' + uic('lock', 12) : '') + ' · ' + (parentRec(rec) ? '<button type="button" class="lnk mono" data-act="openRec" data-id="' + esc(parentRec(rec).id) + '">' + esc(recNo(reg, parentRec(rec)) || '↑') + '</button> › ' : '') + '<span class="mono">' + esc(recNo(reg, rec)) + '</span></span><span class="dha">' +
    (ed ? '<button type="button" class="ib' + (rec.d.star ? ' on' : '') + '" data-act="star" title="' + esc(T('Key item', '重点')) + '">' + uic('star', 16) + '</button>' : '') +
    (reg.d.meeting ? '<button type="button" class="ib" data-act="printMom" title="' + esc(T('Print minutes', '打印纪要')) + '">' + uic('print', 16) + '</button>' : '') +
    '<button type="button" class="ib" data-act="close" aria-label="Close">' + uic('x', 18) + '</button></span></div>' +
    '<div class="dtitle">' + esc(recTitle(reg, rec) || T('Untitled', '未命名')) + '</div>' + (recTitle2(reg, rec) ? '<div class="muted">' + esc(recTitle2(reg, rec)) + '</div>' : '') +
    '<div class="dchips">' + (statusOpt(reg, rec) ? optChip(statusOpt(reg, rec)) : '') + (rf(reg, 'block') ? ' ' + blockChips(rec.d[rf(reg, 'block').key], rf(reg, 'block')) : '') + (isOverdue(reg, rec) ? ' ' + chip('red', L('Overdue', '逾期')) : '') + (rec.d.ext ? ' ' + chip('violet', L('External', '对外')) : '') + '</div>' + (reg.d.meeting && !isPrivate(reg) ? meetingDeckStrip(rec) : '') +
    '<div class="dtabs" role="tablist">' + tabs.map(function(t){ return '<button type="button" role="tab" data-act="dtab" data-v="' + t[0] + '" aria-selected="' + (S.dtab === t[0]) + '">' + L(t[1], t[2]) + (t[3] ? ' <span class="cnt">' + t[3] + '</span>' : '') + '</button>'; }).join('') + '</div></div><div class="dbody">';
  if(S.dtab === 'files') h += drawerFiles(reg, rec, ed);
  else if(S.dtab === 'links') h += drawerLinks(reg, rec, ed);
  else if(S.dtab === 'subs') h += drawerSubs(reg, rec, ed, kids);
  else if(S.dtab === 'history') h += drawerHistory(reg, rec);
  else if(S.dtab === 'comments') h += drawerComments(reg, rec);
  else h += drawerForm(reg, rec, ed);
  h += '</div><div class="dfoot">' + (ed ? '<button type="button" class="btn sm" data-act="dupRec">' + uic('copy', 14) + ' ' + L('Duplicate', '复制') + '</button>' + (reg.d.ownerPublish && !isPrivate(reg) ? '<label class="chk"><input type="checkbox" data-act="extTog"' + (rec.d.ext ? ' checked' : '') + '>' + L('Show in Owner plan', '显示于业主计划') + '</label>' : '') +
    (S.delAsk ? '<span class="dl"><button type="button" class="btn sm danger" data-act="delYes">' + (descendantsOf(rec).length ? L('Delete with ' + descendantsOf(rec).length + ' sub-items', '连同 ' + descendantsOf(rec).length + ' 个子项一起删除') : L('Confirm delete', '确认删除')) + '</button><button type="button" class="btn sm" data-act="delNo">' + L('Cancel', '取消') + '</button></span>' : '<button type="button" class="btn sm danger-o" data-act="delAsk">' + uic('trash', 14) + ' ' + L('Delete', '删除') + '</button>') : '<span class="note">' + L('Read only', '只读') + '</span>') + '</div></aside>';
  root.innerHTML = h; document.body.classList.add('dopen');
  var b = $('.dbody'); if(b) b.scrollTop = ds;
  restoreFocus(fk);
}
function fieldInput(reg, f, rec, ed){
  var v = rec.d[f.key], dis = ed ? '' : ' disabled', a = ' data-df="' + esc(f.key) + '" data-fk="df:' + esc(rec.id + ':' + f.key) + '"' + dis;
  switch(f.type){
    case 'text': case 'url': return '<input class="in" type="' + (f.type === 'url' ? 'url' : 'text') + '"' + a + ' value="' + esc(v == null ? '' : v) + '">';
    case 'long': return '<textarea class="in" rows="' + (f.key === 'minutes' ? 8 : 3) + '"' + a + '>' + esc(v || '') + '</textarea>';
    case 'number': return '<div class="inu"><input class="in" type="number" step="any"' + a + ' value="' + esc(v == null ? '' : v) + '">' + (f.unit ? '<span class="muted">' + esc(f.unit) + '</span>' : '') + '</div>';
    case 'percent': if(isAutoNow(rec, f)) return '<div class="ro">' + pbar(val(rec, f)) + ' <span class="note">' + L('calculated from quantities', '按工程量计算') + '</span></div>'; return '<input class="in" type="number" min="0" max="100" step="5"' + a + ' value="' + esc(v == null ? '' : v) + '">';
    case 'date': return '<input class="in" type="date"' + a + ' value="' + esc(v || '') + '">';
    case 'check': return '<label class="chk"><input type="checkbox"' + a + (v ? ' checked' : '') + '>' + L('Yes', '是') + '</label>';
    case 'select': return '<button type="button" class="pickbtn in"' + (ed ? ' data-act="pick" data-id="' + esc(rec.id) + '" data-k="' + esc(f.key) + '"' : ' disabled') + '>' + (isEmpty(v) ? '<span class="muted">' + L('Choose…', '选择…') + '</span>' : cellHtml(reg, f, rec)) + '</button>';
    case 'tree': return '<button type="button" class="pickbtn in"' + (ed ? ' data-act="pickTree" data-id="' + esc(rec.id) + '" data-k="' + esc(f.key) + '"' : ' disabled') + '>' + (v ? esc(treePath(f, v).map(treeLabel).join(' › ')) : '<span class="muted">' + L('Choose…', '选择…') + '</span>') + '</button>';
    case 'calc': return '<div class="ro">' + cellHtml(reg, f, rec) + '</div>';
    case 'files': return fileList(reg, f, rec, ed);
    case 'link': return linkList(reg, f, rec, ed);
    case 'sub': return subEditor(reg, f, rec, ed);
    default: return esc(v);
  }
}
function drawerForm(reg, rec, ed){
  var h = '<div class="fg">';
  fieldsOf(reg).forEach(function(f){
    if(f.type === 'section'){ h += '<h3 class="fsec full">' + L(f.en, f.zh) + '</h3>'; return; }
    var wide = ['long','sub','files','link'].indexOf(f.type) >= 0 || f.key === rolesOf(reg).title || f.key === rolesOf(reg).title2;
    h += '<div class="fl' + (wide ? ' full' : '') + '"><span class="flab">' + L(f.en, f.zh) + (f.help ? ' <span class="note">' + esc(f.help) + '</span>' : '') + '</span>' + fieldInput(reg, f, rec, ed) + '</div>';
  });
  h += '</div>';
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
  var ff = dataFields(reg).filter(function(f){ return f.type === 'files'; });
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
  if(a.action === 'update' && reg){
    diff = '<div class="diff">' + (a.keys || []).map(function(k){ var f = fieldOf(reg, k) || (k === 'parent' ? {key:k, en:'Belongs to', zh:'上级', type:'link'} : {key:k, en:k === 'star' ? 'Key' : k === 'ext' ? 'External' : k, zh:k === 'star' ? '重点' : k === 'ext' ? '对外' : '', type: k === 'star' || k === 'ext' ? 'check' : 'text'});
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
function closeModal(){ S.modal = null; renderModal(); }
function renderModal(){
  var root = $('#modal-root'), m = S.modal;
  if(!m){ root.innerHTML = ''; return; }
  var fk = focusKey(document.activeElement), body;
  try{ body = modalBody(m); }catch(e){ console.error(e); body = {title:'Error', html:esc(e.message)}; }
  var mb = $('.mbody'), sy = mb ? mb.scrollTop : 0;
  root.innerHTML = '<div class="scrim" data-act="mclose"></div><div class="modal card' + (body.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(body.title) + '"><div class="mhead"><h2>' + body.title + '</h2><button type="button" class="ib" data-act="mclose" aria-label="Close">' + uic('x', 18) + '</button></div><div class="mbody">' + body.html + '</div>' + (body.foot ? '<div class="mfoot">' + body.foot + '</div>' : '') + '</div>';
  var nb = $('.mbody'); if(nb) nb.scrollTop = sy;
  restoreFocus(fk);
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
