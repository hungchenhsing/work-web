/* work-web v3.3 · personal settings, saved views and the customisable sidebar.
   Personal settings (STORE.prefs → the user_prefs table) follow each person's account: their overview, sidebar, own views,
   row density. An admin sets the team defaults (app_config.prefDef); anyone can go back to them at any time.
   Team views live with the register (reg.d.views) — editors and admins create them, an admin picks the default (reg.d.defView). */
'use strict';

function myPrefs(){ return (STORE && STORE.prefs) || {}; }
/* the team's own settings (team note, team defaults) are kept apart from the project settings the Owner can read */
function teamCfg(){ return (STORE && STORE.team) || {}; }
function prefDef(k){ return (teamCfg().prefDef || {})[k]; }
/* a failed save is reported by the store (and the setting waits on this device); callers chain on it only for success messages */
function savePref(k, v){ var o = {}; o[k] = v == null ? null : clone(v); var p = STORE && STORE.savePrefs ? STORE.savePrefs(o) : Promise.resolve(); p.catch(function(){}); return p; }
function isAdmin(){ return role() === 'admin'; }
function saveTeam(p){ return STORE && STORE.saveTeam ? STORE.saveTeam(p) : Promise.reject(new Error('no store')); }
function saveTeamDef(k, v){ var d = Object.assign({}, teamCfg().prefDef || {}); if(v == null) delete d[k]; else d[k] = clone(v); return saveTeam({prefDef:d}); }

/* small view settings (row density, package list folded): the person's own, else the team's, else this browser's */
function uiPref(k, def){ var u = myPrefs().ui; if(u && hasOwn(u, k)) return u[k]; var d = prefDef('ui'); if(d && hasOwn(d, k)) return d[k]; return LS.get('ww.' + k, def); }
function setPref(k, v){ LS.set('ww.' + k, v); var u = Object.assign({}, myPrefs().ui || {}); u[k] = v; savePref('ui', u); }

/* ================= saved views ================= */
var FIL0 = function(){ return {q:'', fx:{}, from:'', to:'', od:false, due:false, star:false, ext:false, node:'all'}; };
function viewNow(reg){
  var id = reg.id;
  return {v:S.rv[id] || null, f:clone(rfil(id)), s:S.rs[id] ? clone(S.rs[id]) : null, g:S.rg[id] || null, gg:S.rg[id + ':g'] || null,
    c:S.rcols[id] && S.rcols[id].length ? S.rcols[id].slice() : null, b:S.rboard[id] || null, mx:S.rmx[id] ? clone(S.rmx[id]) : null};
}
function normFil(f){ f = f || {}; var fx = {}; Object.keys(f.fx || {}).forEach(function(k){ if(f.fx[k] && f.fx[k].length) fx[k] = f.fx[k].slice().sort(); });
  var cm = f.cm ? {st:(f.cm.st || []).slice().sort(), rev:f.cm.rev || 'cur', from:f.cm.from || '', to:f.cm.to || '', q:f.cm.q || ''} : null;
  if(cm && !cm.st.length && cm.rev === 'cur' && !cm.from && !cm.to && !cm.q) cm = null;
  return {q:f.q || '', fx:fx, from:f.from || '', to:f.to || '', od:!!f.od, due:!!f.due, star:!!f.star, ext:!!f.ext, cmo:!!f.cmo, node:f.node || 'all', cm:cm}; }
function viewNorm(st){ st = st || {}; return {v:st.v || null, f:normFil(st.f), s:st.s || null, g:st.g && st.g !== 'none' ? st.g : null, gg:st.gg || null, c:st.c && st.c.length ? st.c : null, b:st.b || null, mx:st.mx || null}; }
function viewSame(a, b){ return sameData(viewNorm(a), viewNorm(b)); }
function teamViews(reg){ return asArr(reg && reg.d.views).filter(function(x){ return x && x.id && x.st; }); }
function myViews(reg){ return asArr(reg && myPrefs()['v:' + reg.id]).filter(function(x){ return x && x.id && x.st; }); }
function findView(reg, id){ return id ? teamViews(reg).concat(myViews(reg)).filter(function(x){ return x.id === id; })[0] || null : null; }
function isTeamView(reg, id){ return teamViews(reg).some(function(x){ return x.id === id; }); }
function canEditView(reg, id){ return isTeamView(reg, id) ? canWrite(reg) : !!findView(reg, id); }
function defViewOf(reg){ var x = findView(reg, reg.d.defView); return x && isTeamView(reg, x.id) ? x : null; }

function applyViewState(reg, st){
  var id = reg.id; st = st || {};
  function put(o, k, v){ if(v == null) delete o[k]; else o[k] = clone(v); }
  put(S.rv, id, st.v); put(S.rs, id, st.s); put(S.rg, id, st.g); put(S.rg, id + ':g', st.gg); put(S.rcols, id, st.c); put(S.rboard, id, st.b); put(S.rmx, id, st.mx);
  S.rf[id] = Object.assign(FIL0(), clone(st.f || {}));
}
function useView(reg, vid){
  var x = vid ? findView(reg, vid) : null; if(vid && !x) return;
  applyViewState(reg, x ? x.st : {}); S.cv[reg.id] = vid || ''; S.sel = {}; S.gKeep = false; saveUI(); renderMain();
}
/* the first time a register is shown in this browser its default view is used; a chosen view's filters come back each visit */
function ensureRegView(reg){
  S.cvInit = S.cvInit || {}; if(S.cvInit[reg.id]) return; S.cvInit[reg.id] = 1;
  var cur = S.cv[reg.id];
  if(cur === undefined){ var d = defViewOf(reg), fresh = !S.rf[reg.id] || sameData(normFil(S.rf[reg.id]), normFil({}));   // arriving with a filter (a block on the overview) keeps it
    if(d && fresh){ applyViewState(reg, d.st); S.cv[reg.id] = d.id; saveUI(); } return; }
  var x = findView(reg, cur); if(x && !S.rf[reg.id]) S.rf[reg.id] = Object.assign(FIL0(), clone(x.st.f || {}));
}
function curView(reg){ return findView(reg, S.cv[reg.id]); }
function viewChanged(reg){ var x = curView(reg); return x ? !viewSame(viewNow(reg), x.st) : false; }

/* the "view" menu at the start of a register's tool bar */
function viewMenu(reg){
  var x = curView(reg), ch = viewChanged(reg), tv = teamViews(reg), mv = myViews(reg), dv = defViewOf(reg);
  var name = x ? x.name : T('All items', '全部记录');
  function item(v){ var on = x && x.id === v.id; return '<button type="button" class="vmi' + (on ? ' on' : '') + '" data-act="vwUse" data-v="' + esc(v.id) + '" aria-pressed="' + !!on + '"><span>' + esc(v.name) + '</span>' + (dv && dv.id === v.id ? '<span class="vdef" title="' + esc(T('Default for everyone', '所有人的默认视图')) + '">' + L('default', '默认') + '</span>' : '') + '</button>'; }
  var h = '<details class="menu vmenu"><summary class="btn vbtn" title="' + esc(T('Saved views', '保存的视图')) + '">' + uic('layers', 14) + '<span class="vnm">' + esc(name) + '</span>' + (ch ? '<i class="vmod" aria-hidden="true" title="' + esc(T('Changed since it was saved', '保存后已修改')) + '"></i><span class="sr-only">' + esc(T('(changed)', '（已修改）')) + '</span>' : '') + '</summary><div class="pop vpop">' +
    '<button type="button" class="vmi' + (!x ? ' on' : '') + '" data-act="vwUse" data-v="" aria-pressed="' + !x + '"><span>' + L('All items', '全部记录') + '</span></button>';
  if(tv.length) h += '<div class="vph">' + L('Team views', '团队视图') + '</div>' + tv.map(item).join('');
  if(mv.length) h += '<div class="vph">' + L('My views', '我的视图') + '</div>' + mv.map(item).join('');
  h += '<hr>';
  if(x && ch && canEditView(reg, x.id)) h += '<button type="button" data-act="vwUpdate">' + uic('check', 13) + ' ' + L('Update “' + x.name + '”', '更新「' + x.name + '」') + '</button>';
  if(x && ch) h += '<button type="button" data-act="vwRevert">' + uic('undo', 13) + ' ' + L('Undo changes to this view', '撤销对此视图的修改') + '</button>';
  h += '<button type="button" data-act="vwSaveAs">' + uic('plus', 13) + ' ' + L('Save as a new view…', '另存为新视图…') + '</button>';
  if(tv.length || mv.length) h += '<button type="button" data-act="vwManage">' + L('Manage views…', '管理视图…') + '</button>';
  return h + '</div></details>';
}
function vwSaveModal(m){
  var reg = getReg(m.reg); if(!reg) return {title:'', html:''};
  var team = canWrite(reg) && !isPrivate(reg);
  var h = '<label class="fl">' + L('Name', '名称') + '<input class="in" id="vwName" data-fk="vwName" value="' + esc(m.name || '') + '" placeholder="' + esc(T('e.g. Open items in P2, by due date', '例如：P2 未完成，按到期日')) + '" maxlength="60"></label>';
  if(team) h += '<div class="fl"><span class="flab">' + L('Who sees it', '谁能看到') + '</span><label class="chk"><input type="radio" name="vwScope" data-vws="1" value="me"' + (m.scope !== 'team' ? ' checked' : '') + '>' + L('Only me', '只有我') + '</label><label class="chk"><input type="radio" name="vwScope" data-vws="1" value="team"' + (m.scope === 'team' ? ' checked' : '') + '>' + L('Everyone (team view)', '所有人（团队视图）') + '</label></div>';
  if(team && isAdmin()) h += '<label class="chk"><input type="checkbox" id="vwDef"' + (m.def ? ' checked' : '') + '>' + L('Use as the default view of this register for everyone', '设为此台账所有人的默认视图') + '</label>';
  h += '<p class="note">' + L('Saves the view type, filters, package, sort, grouping and columns as they are now.', '保存当前的视图类型、筛选、文件包、排序、分组和显示的列。') + '</p>';
  return {title:L('Save view', '保存视图') + ' · ' + esc(regName(reg)), html:h, foot:'<button type="button" class="btn pri" data-act="vwSaveDo">' + L('Save view', '保存视图') + '</button><button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button>'};
}
function vwManageModal(m){
  var reg = getReg(m.reg); if(!reg) return {title:'', html:''};
  var tv = teamViews(reg), mv = myViews(reg), dv = defViewOf(reg), ed = canWrite(reg);
  function row(v, team){ var can = team ? ed : true;
    return '<div class="vmr"><input class="in" data-vwn="' + esc(v.id) + '" data-fk="vwn:' + esc(v.id) + '" value="' + esc(v.name) + '"' + (can ? '' : ' disabled') + ' aria-label="' + esc(T('Name', '名称')) + '">' +
      (team && isAdmin() ? '<label class="chk"><input type="radio" name="vwDefR" data-vwdef="' + esc(v.id) + '"' + (dv && dv.id === v.id ? ' checked' : '') + '>' + L('Default', '默认') + '</label>' : team && dv && dv.id === v.id ? '<span class="vdef">' + L('default', '默认') + '</span>' : '<span></span>') +
      (can ? '<button type="button" class="ib" data-act="vwDel" data-v="' + esc(v.id) + '" aria-label="' + esc(T('Delete view ', '删除视图 ') + v.name) + '">' + uic('trash', 14) + '</button>' : '<span></span>') + '</div>'; }
  var h = '';
  if(tv.length) h += '<h3 class="fsec">' + L('Team views', '团队视图') + '</h3>' + tv.map(function(v){ return row(v, true); }).join('') + (isAdmin() && dv ? '<button type="button" class="lnk" data-act="vwNoDef">' + L('No default view', '不设默认视图') + '</button>' : '');
  if(mv.length) h += '<h3 class="fsec">' + L('My views', '我的视图') + '</h3>' + mv.map(function(v){ return row(v, false); }).join('');
  if(!h) h = '<p class="note">' + L('No saved views yet.', '还没有保存的视图。') + '</p>';
  return {title:L('Manage views', '管理视图') + ' · ' + esc(regName(reg)), html:'<div class="vml">' + h + '</div>', foot:'<button type="button" class="btn pri" data-act="mclose">' + L('Done', '完成') + '</button><span class="note">' + L('Names save when you leave the box.', '名称在离开输入框时保存。') + '</span>'};
}
function putTeamViews(reg, list, extra){ return STORE.patchReg(reg.id, Object.assign({views:list}, extra || {})).catch(function(e){ toast(errText(e)); throw e; }); }
function putMyViews(reg, list){ return savePref('v:' + reg.id, list.length ? list : null); }
function vwSaveDo(){
  var m = S.modal, reg = getReg(m.reg); if(!reg) return;
  var name = (($('#vwName') || {}).value || '').trim(); if(!name){ toast(T('Give the view a name', '请给视图起个名字')); return; }
  var sc = $('input[name=vwScope]:checked'), team = !!(sc && sc.value === 'team') && canWrite(reg), def = team && isAdmin() && !!($('#vwDef') || {}).checked;
  var x = {id:uid('v'), name:name, st:viewNow(reg), by:(STORE.me && (STORE.me.name || STORE.me.email)) || '', at:new Date().toISOString()};
  var p = team ? putTeamViews(reg, teamViews(reg).concat([x]), def ? {defView:x.id} : null) : putMyViews(reg, myViews(reg).concat([x]));
  var was = S.cv[reg.id]; S.cv[reg.id] = x.id; saveUI(); closeModal();
  p.then(function(){ toast(T('View saved', '视图已保存')); renderMain(); }, function(){ if(team){ S.cv[reg.id] = was; saveUI(); } renderMain(); });
}
function vwUpdate(reg){
  var x = curView(reg); if(!x || !canEditView(reg, x.id)) return; var st = viewNow(reg);
  var p = isTeamView(reg, x.id) ? putTeamViews(reg, teamViews(reg).map(function(v){ return v.id === x.id ? Object.assign({}, v, {st:st, at:new Date().toISOString()}) : v; }))
    : putMyViews(reg, myViews(reg).map(function(v){ return v.id === x.id ? Object.assign({}, v, {st:st, at:new Date().toISOString()}) : v; }));
  p.then(function(){ toast(T('View updated', '视图已更新')); renderMain(); }, function(){ renderMain(); });
}
function vwRename(reg, id, name){
  name = String(name || '').trim(); var x = findView(reg, id); if(!x || !name || name === x.name || !canEditView(reg, id)) return;
  (isTeamView(reg, id) ? putTeamViews(reg, teamViews(reg).map(function(v){ return v.id === id ? Object.assign({}, v, {name:name}) : v; }))
    : putMyViews(reg, myViews(reg).map(function(v){ return v.id === id ? Object.assign({}, v, {name:name}) : v; }))).catch(function(){ renderModal(); });
}
function vwDelete(reg, id){
  var x = findView(reg, id); if(!x || !canEditView(reg, id)) return;
  if(!confirm(T('Delete the view “' + x.name + '”?', '删除视图「' + x.name + '」？'))) return;
  var p = isTeamView(reg, id) ? putTeamViews(reg, teamViews(reg).filter(function(v){ return v.id !== id; }), reg.d.defView === id && isAdmin() ? {defView:null} : null) : putMyViews(reg, myViews(reg).filter(function(v){ return v.id !== id; }));
  if(S.cv[reg.id] === id) S.cv[reg.id] = '';
  p.then(function(){ saveUI(); renderModal(); renderMain(); }, function(){ renderModal(); renderMain(); });
}

/* ================= the sidebar (and the phone's sheets): order, hide, pin ================= */
function navCfg(){ return myPrefs().side || prefDef('side') || {}; }
function navOrd(list, idf){ var ord = navCfg().order || []; return list.map(function(x, i){ return {x:x, i:i, o:ord.indexOf(idf(x))}; }).sort(function(a, b){ return (a.o < 0 ? 1e6 + a.i : a.o) - (b.o < 0 ? 1e6 + b.i : b.o); }).map(function(a){ return a.x; }); }
function navHidden(id){ return NAV_KEEP.indexOf(id) < 0 && (navCfg().hide || []).indexOf(id) >= 0; }
function navPinned(id){ return (navCfg().pins || []).indexOf(id) >= 0; }
/* pages and register groups as the person arranged them; edit mode keeps hidden items (dimmed) so they can come back */
function navModel(edit){
  var pages = navOrd(sidePages(), function(p){ return p[0]; }).filter(function(p){ return edit || !navHidden(p[0]); });
  var pins = (navCfg().pins || []).map(getReg).filter(function(r){ return r && (edit || !navHidden(r.id)); });
  var groups = regGroups().map(function(g){ return {s:g.s, regs:navOrd(g.regs, function(r){ return r.id; }).filter(function(r){ return !navPinned(r.id) && (edit || !navHidden(r.id)); })}; }).filter(function(g){ return g.regs.length; });
  return {pages:pages, pins:pins, groups:groups};
}
function navSave(c){ return savePref('side', c); }
function navEditCfg(){ var c = clone(navCfg()); c.order = c.order || []; c.hide = c.hide || []; c.pins = c.pins || []; return c; }
function navMove(id, d, sec){
  var c = navEditCfg(), m = navModel(true), list;
  if(sec === 'pins'){ var vis = c.pins.filter(function(x){ return !!getReg(x); }), i = vis.indexOf(id), j = i + d; if(i < 0 || j < 0 || j >= vis.length) return; vis[i] = vis[j]; vis[j] = id; c.pins = vis.concat(c.pins.filter(function(x){ return !getReg(x); })); navSave(c); return; }
  list = sec === 'pages' ? m.pages.map(function(p){ return p[0]; }) : ((m.groups.filter(function(g){ return g.s[0] === sec; })[0] || {regs:[]}).regs.map(function(r){ return r.id; }));
  var a = list.indexOf(id), b = a + d; if(a < 0 || b < 0 || b >= list.length) return; list[a] = list[b]; list[b] = id;
  c.order = c.order.filter(function(x){ return list.indexOf(x) < 0; }).concat(list); navSave(c);
}
function navToggle(kind, id){ var c = navEditCfg(), l = c[kind], i = l.indexOf(id); if(i >= 0) l.splice(i, 1); else l.push(id); navSave(c); }
var NAV_KEEP = ['home', 'settings'];   // always reachable, so nothing can be locked away (on a phone there is no other way back)
function navCtl(id, sec, i, n, isReg){
  var hid = navHidden(id), pin = navPinned(id), keep = NAV_KEEP.indexOf(id) >= 0;
  return '<span class="navc">' + (isReg ? '<button type="button" class="ib' + (pin ? ' on' : '') + '" data-act="navPin" data-v="' + esc(id) + '" aria-pressed="' + pin + '" title="' + esc(pin ? T('Unpin', '取消置顶') : T('Pin to the top', '置顶')) + '">' + uic('pin', 13) + '</button>' : '') +
    '<button type="button" class="ib" data-act="navMove" data-v="' + esc(id) + '" data-s="' + esc(sec) + '" data-d="-1"' + (i ? '' : ' disabled') + ' aria-label="' + esc(T('Move up', '上移')) + '">' + uic('up', 13) + '</button>' +
    '<button type="button" class="ib" data-act="navMove" data-v="' + esc(id) + '" data-s="' + esc(sec) + '" data-d="1"' + (i < n - 1 ? '' : ' disabled') + ' aria-label="' + esc(T('Move down', '下移')) + '">' + uic('down', 13) + '</button>' +
    (keep ? '<span class="ib" aria-hidden="true"></span>' : '<button type="button" class="ib' + (hid ? '' : ' on') + '" data-act="navHide" data-v="' + esc(id) + '" aria-pressed="' + !hid + '" aria-label="' + esc((hid ? T('Show in the menu: ', '在菜单中显示：') : T('Hide from the menu: ', '从菜单中隐藏：')) + id) + '" title="' + esc(hid ? T('Show in the menu', '在菜单中显示') : T('Hide from the menu', '从菜单中隐藏')) + '">' + uic(hid ? 'hide' : 'eye', 13) + '</button>') + '</span>';
}
function navEditRow(label, id, sec, i, n, isReg){ return '<div class="nrow' + (navHidden(id) ? ' hid' : '') + '"><span class="nlab">' + label + '</span>' + navCtl(id, sec, i, n, isReg) + '</div>'; }
/* registers part of the menu (sidebar and the phone's Registers sheet) */
function navRegsHtml(cls, edit){
  var m = navModel(edit), h = '';
  function lab(r){ return '<span class="ri c-' + esc(r.d.color || 'blue') + '">' + icon(r.d.icon) + '</span><span class="rn">' + esc(regName(r)) + '</span>'; }
  if(m.pins.length) h += '<div class="sh">' + uic('pin', 12) + ' ' + L('Pinned', '置顶') + '</div>' + m.pins.map(function(r, i){ return edit ? navEditRow(lab(r), r.id, 'pins', i, m.pins.length, true) : regBtn(r, cls); }).join('');
  m.groups.forEach(function(g){
    h += '<div class="sh">' + (g.s[0] === 'private' ? uic('lock', 12) + ' ' : '') + L(g.s[1], g.s[2]) + '</div>' + g.regs.map(function(r, i){ return edit ? navEditRow(lab(r), r.id, g.s[0], i, g.regs.length, true) : regBtn(r, cls); }).join('');
  });
  return h;
}
function navEditFoot(){
  return '<div class="navf"><button type="button" class="btn sm pri" data-act="navDone">' + L('Done', '完成') + '</button>' +
    (myPrefs().side ? '<button type="button" class="btn sm" data-act="navReset">' + L('Back to the team default', '恢复团队默认') + '</button>' : '') +
    (isAdmin() ? '<button type="button" class="btn sm" data-act="navTeam">' + L('Make this the team default', '设为团队默认') + '</button>' : '') + '</div>';
}
UI_ICONS.pin = UI_ICONS.pin || '<path d="M9 4h6l-1 6 4 4H6l4-4z"/><path d="M12 14v6"/>';
UI_ICONS.eye = UI_ICONS.eye || '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
UI_ICONS.layers = UI_ICONS.layers || '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>';
UI_ICONS.undo = UI_ICONS.undo || '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>';
UI_ICONS.check = UI_ICONS.check || '<path d="M5 12l5 5 9-10"/>';

/* ================= record templates ================= */
function tplSaveModal(m){
  var rec = getRec(m.rec), reg = rec && getReg(rec.reg); if(!reg) return {title:'', html:''};
  var fs = dataFields(reg).filter(function(f){ return tplKeyOk(reg, f) && !isEmpty(rec.d[f.key]); });
  if(!m.pick){ m.pick = {}; fs.forEach(function(f){ if(tplDefaultOn(reg, f)) m.pick[f.key] = 1; }); }
  var h = '<label class="fl">' + L('Template name', '模板名称') + '<input class="in" id="tplName" data-fk="tplName" maxlength="60" value="' + esc(m.name || '') + '" placeholder="' + esc(T('e.g. Weekly coordination meeting', '例如：周协调会')) + '"></label>' +
    '<div class="fl"><span class="flab">' + L('What new items get from it', '新记录会带入的内容') + '</span><div class="tplf">' + fs.map(function(f){ var v = f.type === 'sub' ? T(asArr(rec.d[f.key]).length + ' rows', asArr(rec.d[f.key]).length + ' 行') : String(textOf(reg, f, rec) || '');
      return '<label class="chk"><input type="checkbox" data-tplk="' + esc(f.key) + '"' + (m.pick[f.key] ? ' checked' : '') + '><span><b>' + esc(T1(f.en || f.key, f.zh)) + '</b> <span class="muted">' + esc(v.length > 60 ? v.slice(0, 58) + '…' : v) + '</span></span></label>'; }).join('') + '</div></div>' +
    '<p class="note">' + L('The number, files and links are never copied. Dates, status, progress and meeting action items are left unticked; empty fields still get their default.', '编号、附件和关联不会带入；日期、状态、进度和会议待办默认不勾；空字段仍使用预设值。') + '</p>';
  return {title:L('Save as a template', '存成模板') + ' · ' + esc(regName(reg)), html:h, foot:'<button type="button" class="btn pri" data-act="tplSaveDo">' + L('Save template', '保存模板') + '</button><button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button>'};
}
function tplSaveDo(){
  var m = S.modal, rec = m && getRec(m.rec), reg = rec && getReg(rec.reg); if(!reg || !canWrite(reg)) return;
  var name = (($('#tplName') || {}).value || '').trim(); if(!name){ toast(T('Give the template a name', '请给模板起个名字')); return; }
  var d = {}; Object.keys(m.pick || {}).forEach(function(k){ if(m.pick[k] && rec.d[k] !== undefined && tplKeyOk(reg, fieldOf(reg, k))) d[k] = clone(rec.d[k]); });
  if(!Object.keys(d).length){ toast(T('Tick at least one field', '请至少勾选一个字段')); return; }
  var t = {id:uid('t'), name:name, d:d, by:(STORE.me && (STORE.me.name || STORE.me.email)) || '', at:new Date().toISOString()};
  STORE.patchReg(reg.id, {tpls:regTpls(reg).concat([t])}).then(function(){ closeModal(); toast(T('Template saved — use ▾ next to New', '模板已保存，可在「新增」旁的 ▾ 中使用')); }, function(er){ toast(errText(er)); });
}
function tplManageModal(m){
  var reg = getReg(m.reg); if(!reg) return {title:'', html:''};
  var ts = regTpls(reg), ed = canWrite(reg);
  var h = ts.length ? ts.map(function(t){ var ks = Object.keys(t.d || {}).map(function(k){ var f = fieldOf(reg, k); return f ? T1(f.en || k, f.zh) : k; });
      return '<div class="vmr"><input class="in" data-tpln="' + esc(t.id) + '" data-fk="tpln:' + esc(t.id) + '" value="' + esc(t.name) + '"' + (ed ? '' : ' disabled') + ' aria-label="' + esc(T('Name', '名称')) + '"><span class="note" title="' + esc(ks.join(', ')) + '">' + esc(T(ks.length + ' fields', ks.length + ' 个字段')) + '</span>' + (ed ? '<button type="button" class="ib" data-act="tplDel" data-v="' + esc(t.id) + '" aria-label="' + esc(T('Delete template ', '删除模板 ') + t.name) + '">' + uic('trash', 14) + '</button>' : '<span></span>') + '</div>'; }).join('')
    : '<p class="note">' + L('No templates yet. Open an item, then ⋯ → Save as a template….', '还没有模板。打开一条记录，在 ⋯ 中选「存成模板…」。') + '</p>';
  return {title:L('Templates', '模板') + ' · ' + esc(regName(reg)), html:'<div class="vml">' + h + '</div>', foot:'<button type="button" class="btn pri" data-act="mclose">' + L('Done', '完成') + '</button>'};
}
document.addEventListener('change', function(e){
  var el = e.target, d;
  if((d = el.dataset && el.dataset.tplk) && S.modal && S.modal.kind === 'tplSave'){ S.modal.pick = S.modal.pick || {}; if(el.checked) S.modal.pick[d] = 1; else delete S.modal.pick[d]; return; }
  if((d = el.dataset && el.dataset.tpln) && S.modal && S.modal.kind === 'tplManage'){ var reg = getReg(S.modal.reg), nm0 = el.value.trim(); if(!reg || !nm0 || !canWrite(reg)) return;
    STORE.patchReg(reg.id, {tpls:regTpls(reg).map(function(t){ return t.id === d ? Object.assign({}, t, {name:nm0}) : t; })}).catch(function(er){ toast(errText(er)); }); }
});
document.addEventListener('input', function(e){ if(e.target && e.target.id === 'tplName' && S.modal && S.modal.kind === 'tplSave') S.modal.name = e.target.value; });

DECK_MODALS.vwSave = vwSaveModal; DECK_MODALS.vwManage = vwManageModal; DECK_MODALS.tplSave = tplSaveModal; DECK_MODALS.tplManage = tplManageModal;

/* events */
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act]'); if(!el) return;
  var act = el.dataset.act, v = el.dataset.v, reg = curReg();
  switch(act){
    case 'vwUse': if(reg) useView(reg, v); break;
    case 'vwSaveAs': if(reg){ var x = curView(reg); openModal({kind:'vwSave', reg:reg.id, name:'', scope:x && isTeamView(reg, x.id) ? 'team' : 'me'}); setTimeout(function(){ var i = $('#vwName'); if(i) i.focus(); }, 30); } break;
    case 'vwSaveDo': vwSaveDo(); break;
    case 'vwUpdate': if(reg) vwUpdate(reg); break;
    case 'vwRevert': if(reg){ var cx = curView(reg); if(cx) useView(reg, cx.id); } break;
    case 'vwManage': if(reg) openModal({kind:'vwManage', reg:reg.id}); break;
    case 'vwDel': (function(){ var r = getReg(S.modal && S.modal.reg); if(r) vwDelete(r, v); })(); break;
    case 'vwNoDef': (function(){ var r = getReg(S.modal && S.modal.reg); if(r && isAdmin()) STORE.patchReg(r.id, {defView:null}).then(function(){ renderModal(); renderMain(); }, function(er){ toast(errText(er)); }); })(); break;
    case 'navEdit': S.sideEdit = !S.sideEdit; renderSide(); renderSheet(); break;
    case 'navDone': S.sideEdit = false; renderSide(); renderSheet(); break;
    case 'navMove': navMove(v, +el.dataset.d, el.dataset.s); refocus('[data-act="navMove"][data-v="' + v + '"][data-d="' + el.dataset.d + '"]', '[data-act="navMove"][data-v="' + v + '"]'); break;
    case 'navHide': navToggle('hide', v); break;
    case 'navPin': navToggle('pins', v); break;
    case 'navReset': savePref('side', null).then(function(){ toast(T('Menu back to the team default', '菜单已恢复团队默认')); }, function(){}); break;
    case 'navTeam': if(isAdmin()) saveTeamDef('side', navCfg()).then(function(){ toast(T('Team default menu saved', '已保存为团队默认菜单')); }, function(er){ toast(errText(er)); }); break;
  }
});
/* after a move the page is drawn again: put the focus back on the same control (or its neighbour at the end of a list) */
function refocus(sel, alt){ setTimeout(function(){ requestAnimationFrame(function(){ var b = document.querySelector(sel); if(!b || b.disabled) b = alt && Array.prototype.filter.call(document.querySelectorAll(alt), function(x){ return !x.disabled; })[0]; if(b) b.focus(); }); }, 0); }
document.addEventListener('change', function(e){
  var el = e.target, reg = getReg(S.modal && S.modal.reg), d;
  if(el.dataset && el.dataset.vws && S.modal && S.modal.kind === 'vwSave'){ S.modal.scope = el.value; return; }
  if(el.id === 'vwDef' && S.modal && S.modal.kind === 'vwSave'){ S.modal.def = el.checked; return; }
  if((d = el.dataset && el.dataset.vwn) && reg){ vwRename(reg, d, el.value); return; }
  if((d = el.dataset && el.dataset.vwdef) && reg && isAdmin()){ STORE.patchReg(reg.id, {defView:d}).then(function(){ toast(T('Default view set', '已设为默认视图')); renderMain(); }, function(er){ toast(errText(er)); }); }
});
document.addEventListener('keydown', function(e){ if(e.key === 'Enter' && e.target && (e.target.id === 'vwName' || e.target.id === 'tplName')){ e.preventDefault(); if(e.target.id === 'vwName') vwSaveDo(); else tplSaveDo(); } });
document.addEventListener('input', function(e){ if(e.target && e.target.id === 'vwName' && S.modal && S.modal.kind === 'vwSave') S.modal.name = e.target.value; });
