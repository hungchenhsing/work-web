/* work-web v2 · events and start-up. */
'use strict';

function goPage(p){ S.page = p; S.sideOpen = false; S.q = ''; S.sel = {}; S.bulkF = null; closePop(); saveUI(); renderAll(); $('#main').scrollTop = 0; }
function goReg(id){ S.page = 'reg'; S.reg = id; S.sideOpen = false; S.q = ''; S.sel = {}; S.bulkF = null; S.gKeep = false; closePop(); saveUI(); renderAll(); $('#main').scrollTop = 0; }
function openRec(id, tab){ var r = getRec(id); if(!r) return; if(isDeckRec(r)){ openDeck(id); return; } S.open = id; S.dtab = tab || 'details'; S.delAsk = false; S.hist = null; S.q = ''; closePop(); renderAll(); }
function curReg(){ return S.page === 'reg' ? getReg(S.reg) : null; }
function odArr(){ var m = S.modal; if(m && m.kind === 'fields' && m.exp != null){ var f = m.d.fields[m.exp]; if(f.type === 'select' && !f.list){ f.opts = f.opts || []; return f.opts; } } if(m && m.kind === 'opts' && m.d && m.d.opts) return m.d.opts; return S.ldraft ? S.ldraft.opts : []; }
function tdArr(){ var m = S.modal; if(m && m.kind === 'fields' && m.exp != null){ var f = m.d.fields[m.exp]; f.tree = f.tree || []; return f.tree; } if(m && m.kind === 'opts' && m.d && m.d.tree) return m.d.tree; return []; }
function rerenderDraft(){ if(S.modal) renderModal(); else renderMain(); }

/* ---------------- clicks ---------------- */
document.addEventListener('click', function(e){
  var t = e.target;
  // inline-edit cells
  var gce = t.closest && t.closest('[data-gce]');
  if(gce){ S.edit = {id:gce.dataset.gce, k:gce.dataset.k}; S.gKeep = true; renderMain(); var gi = $('[data-ie]'); if(gi){ gi.focus(); try{ gi.showPicker && gi.showPicker(); }catch(_){} } return; }
  var ce = t.closest && t.closest('td[data-ce]');
  if(ce && !t.closest('button,a,input,textarea,select')){ startCellEdit(ce); return; }
  var el = t.closest && t.closest('[data-act]'); if(!el) return;
  var act = el.dataset.act, v = el.dataset.v;
  if(el.tagName === 'INPUT' && el.type === 'checkbox') return;
  if(S.suppressOpen && Date.now() - S.suppressOpen < 400 && act === 'openRec') return;
  if(el.tagName === 'A' && act !== 'openRec') return;
  var reg = curReg(), rec = S.open && getRec(S.open), drReg = rec && getReg(rec.reg);
  switch(act){
    case 'side': S.sideOpen = !S.sideOpen; renderSide(); break;
    case 'page': goPage(v); break;
    case 'reg': goReg(v); break;
    case 'lang': S.lang = v; if(STORE && STORE.mode === 'public') LS.set('ww.publang', v); else LS.set('ww.lang', v); renderAll(); break;
    case 'signout': STORE.signOut && STORE.signOut(); break;
    case 'recheck': STORE.boot(true); break;
    case 'authTab': S.auth = {tab:v}; renderGate(); break;
    case 'setup': runSetup(); break;
    case 'openRec': openRec(el.dataset.id, el.dataset.tab); break;
    case 'close': S.open = null; S.delAsk = false; renderDrawer(); break;
    case 'dtab': S.dtab = v; renderDrawer(); break;
    case 'star': setRec(rec, {star:!rec.d.star}, {silent:true}); break;
    case 'msTog': setRec(rec, {ms:!rec.d.ms}); break;
    case 'printMom': printMinutes(rec); break;
    case 'dupRec': (function(){ var d = clone(rec.d); var ro = rolesOf(drReg); if(ro.no) d[ro.no] = nextNo(drReg); dataFields(drReg).forEach(function(f){ if(f.type === 'files') delete d[f.key]; });
      if(typeof isTrnReg === 'function' && isTrnReg(drReg)){ d.status = 'draft'; delete d.pub; delete d.date; d.items = asArr(d.items).map(function(it){ return {_id:uid('t'), rid:it.rid, no:it.no, docNo:it.docNo, title:it.title, title2:it.title2, rev:it.rev, files:asArr(it.files).map(function(f){ return {path:f.path, name:f.name, size:f.size, type:f.type}; })}; }); } var id = uid('r'); STORE.createRec({id:id, reg:drReg.id, d:d}).then(function(){ openRec(id); toast(T('Duplicated', '已复制')); }).catch(function(er){ toast(errText(er)); }); })(); break;
    case 'delAsk': S.delAsk = true; renderDrawer(); break;
    case 'delNo': S.delAsk = false; renderDrawer(); break;
    case 'delYes': (function(){ var id = rec.id, lab = recLabel(rec), desc = descendantsOf(rec); S.open = null; S.delAsk = false; desc.reverse().forEach(function(k){ STORE.deleteRec(k.id).catch(function(){}); }); STORE.deleteRec(id).then(function(){ toast(T('Deleted ', '已删除 ') + lab + ' — ' + T('restore it from the Change log', '可在修改记录中恢复')); }).catch(function(er){ toast(errText(er)); }); renderAll(); })(); break;
    case 'pick': (function(){ var pr = (el.dataset.id && getRec(el.dataset.id)) || rec; openPick('opts', {reg:pr.reg, rec:pr.id, key:el.dataset.k}, el); })(); break;
    case 'pickTree': openPick('tree', {reg:rec.reg, rec:rec.id, key:el.dataset.k}, el); break;
    case 'pickLink': openPick('link', {reg:rec.reg, rec:rec.id, key:el.dataset.k, w:420}, el); break;
    case 'unlink': setRec(rec, mk(el.dataset.k, asArr(rec.d[el.dataset.k]).filter(function(x){ return x !== v; })), {silent:true}); break;
    case 'fileDel': (function(){ var arr = clone(asArr(rec.d[el.dataset.k])), x = arr.splice(+v, 1)[0]; setRec(rec, mk(el.dataset.k, arr)); if(x && STORE.removeFile) STORE.removeFile(x.path); })(); break;
    case 'subAdd': (function(){ var k = el.dataset.sub, rows = clone(asArr(rec.d[k])); rows.push({_id:uid('s')}); setRec(rec, mk(k, rows), {silent:true}); })(); break;
    case 'subDel': (function(){ var k = el.dataset.sub, rows = asArr(rec.d[k]).filter(function(x){ return x._id !== el.dataset.row; }); setRec(rec, mk(k, rows), {silent:true}); })(); break;
    case 'subPick': openPick('opts', {reg:rec.reg, rec:rec.id, key:el.dataset.sub, sub:{key:el.dataset.sub, row:el.dataset.row, col:el.dataset.col}}, el); break;
    case 'popPick': pickApply(v); break;
    case 'popAdd': (function(){ var p = S.pop, f = popField(), rg = getReg(p.reg); addOption(rg, f, p.q).then(function(nv){ if(nv == null) return; p.q = ''; if(p.kind === 'fxPick'){ renderPop(); return; } pickApply(nv); }).catch(function(er){ toast(errText(er)); }); })(); break;
    case 'popClear': (function(){ var p = S.pop; if(p.bulk){ p.onPick(null); return; } if(p.fx){ var ff = rfil(p.reg); ff.fx[p.key] = []; closePop(); renderMain(); return; } var r = getRec(p.rec); if(p.sub) subSet(r, p.sub.key, p.sub.row, p.sub.col, null); else setRec(r, mk(p.key, p.kind === 'opts' && popField().multi ? [] : '')); closePop(); })(); break;
    case 'popClose': closePop(); if(S.page === 'reg') renderMain(); break;
    case 'editOpts': (function(){ var rid = el.dataset.reg || (S.pop && S.pop.reg) || S.reg; closePop(); S.ldraft = null; openModal({kind:'opts', reg:rid, key:v}); })(); break;
    case 'optsSave': (function(){ var m = S.modal, rg = getReg(m.reg), fs = clone(fieldsOf(rg)), f = fs.filter(function(x){ return x.key === m.key; })[0];
      if(m.d.tree){ if(m.d.tree.some(function(n){ return !n.en && !n.zh; })){ toast(T('Every category needs a name', '每个分类都需要名称')); return; } f.tree = m.d.tree; }
      else { var bad = cleanOpts(m.d.opts); if(bad){ toast(bad); return; } f.opts = m.d.opts; }
      STORE.patchReg(rg.id, {fields:fs}).then(function(){ toast(T('Saved', '已保存')); closeModal(); }).catch(function(er){ toast(errText(er)); }); })(); break;
    case 'odAdd': odArr().push(O('opt' + (odArr().length + 1), '', '', COLORS[odArr().length % COLORS.length])); rerenderDraft(); break;
    case 'odDel': odArr().splice(+v, 1); rerenderDraft(); break;
    case 'odMove': (function(){ var a = odArr(), i = +v, j = i + (+el.dataset.d); if(j < 0 || j >= a.length) return; var x = a[i]; a[i] = a[j]; a[j] = x; rerenderDraft(); })(); break;
    case 'tdAdd': tdArr().push({id:uid('n'), parent:'', code:'', en:'', zh:''}); rerenderDraft(); break;
    case 'tdChild': (function(){ var a = tdArr(), p = a[+v]; a.push({id:uid('n'), parent:p.id, code:(p.code ? p.code + '.' + (a.filter(function(n){ return n.parent === p.id; }).length + 1) : ''), en:'', zh:''}); rerenderDraft(); })(); break;
    case 'tdDel': (function(){ var a = tdArr(), n = a[+v]; a.splice(+v, 1); a.forEach(function(x){ if(x.parent === n.id) x.parent = n.parent || ''; }); rerenderDraft(); })(); break;
    case 'listEdit': S.ldraft = Object.assign({k:v}, clone(lists()[v])); renderMain(); break;
    case 'listCancel': S.ldraft = null; renderMain(); break;
    case 'listSave': (function(){ var d = S.ldraft, bad = cleanOpts(d.opts); if(bad){ toast(bad); return; } var ls = clone(lists()); ls[d.k] = {en:d.en, zh:d.zh, opts:d.opts}; STORE.saveCfg({lists:ls}).then(function(){ toast(T('Saved', '已保存')); }).catch(function(er){ toast(errText(er)); }); S.ldraft = null; if(el.dataset.close) closeModal(); renderAll(); })(); break;
    case 'listNew': (function(){ var n = ($('#newListName') || {}).value || ''; n = n.trim(); if(!n) return; var k = slug(n) || uid('l'), ls = clone(lists()); if(ls[k]) k = k + '_' + Date.now().toString(36).slice(-3); var zh = /[一-鿿]/.test(n); ls[k] = {en:zh ? n : n, zh:zh ? n : '', opts:[]}; STORE.saveCfg({lists:ls}).then(function(){ S.ldraft = Object.assign({k:k}, ls[k]); renderMain(); }); })(); break;
    case 'listDel': (function(){ if(!confirm(T('Delete this list?', '删除此列表？'))) return; var ls = clone(cfg().lists || {}); delete ls[v]; STORE.saveCfg({lists:ls}); })(); break;
    case 'undoAudit': (function(){ var a = (window.__AUD || {})[v] || ((STORE && STORE.audit) || []).filter(function(x){ return String(x.id) === String(v); })[0]; if(a) undoAudit(a).then(function(){ S.hist = null; if(S.act) S.act.rows = null; renderAll(); }); })(); break;
    case 'quickUndo': quickUndo(); break;
    case 'actMore': (function(){ var a = S.act, last = a.rows && a.rows[a.rows.length - 1]; if(!last) return; STORE.loadAudit({reg:a.reg || undefined, action:a.type || undefined, before:last.id, limit:150}).then(function(rows){ a.rows = a.rows.concat(rows); a.more = rows.length >= 150; renderMain(); }); })(); break;
    // register page
    case 'rview': S.rv[S.reg] = v; S.gKeep = false; saveUI(); renderMain(); break;
    case 'newRec': createRec(reg, nodeExtra(reg)); break;
    case 'boardAdd': (function(){ var bf = boardField(reg); createRec(reg, mk(bf.key, v)); })(); break;
    case 'grpAdd': (function(){ var rg = el.dataset.reg ? getReg(el.dataset.reg) : reg; createRec(rg, JSON.parse(v)); })(); break;
    case 'impOpen': impOpen(getReg(v)); break;
    case 'impRun': impRun(); break;
    case 'expReg': exportReg(getReg(v)); break;
    case 'bMore': S.bmore = S.bmore || {}; S.bmore[v] = 1; renderMain(); break;
    case 'regHist': S.act = {reg:v, who:'', type:''}; goPage('activity'); break;
    case 'fToggle': S.fOpen = !S.fOpen; renderMain(); break;
    case 'fx': (function(){ var f = rfil(S.reg), k = el.dataset.k, a = (f.fx[k] = f.fx[k] || []), i = a.indexOf(v); if(i >= 0) a.splice(i, 1); else a.push(v); renderMain(); })(); break;
    case 'fxPick': fxPick(reg, el.dataset.k, el); break;
    case 'fClear': (function(){ var n = rfil(S.reg).node; S.rf[S.reg] = null; rfil(S.reg).node = n; renderMain(); })(); break;
    case 'tnode': rfil(S.reg).node = v; renderMain(); break;
    case 'treeEdit': S.treeEdit = S.treeEdit || {}; S.treeEdit[S.reg] = !S.treeEdit[S.reg]; renderMain(); break;
    case 'tnAdd': tnEditor(reg, rf(reg, 'tree'), null, v || '', el); break;
    case 'tnRen': tnEditor(reg, rf(reg, 'tree'), v, null, el); break;
    case 'tnSave': (function(){ var tf = rf(reg, 'tree'), nodes = clone(treeNodes(tf)), code = ($('#tnCode') || {}).value || '', en = ($('#tnEn') || {}).value || '', zh = ($('#tnZh') || {}).value || '';
      if(!en.trim() && !zh.trim()){ toast(T('Give it a name', '请填写名称')); return; }
      if(el.dataset.node){ nodes.forEach(function(x){ if(x.id === el.dataset.node){ x.code = code.trim(); x.en = en.trim() || zh.trim(); x.zh = zh.trim(); } }); }
      else nodes.push({id:uid('n'), parent:el.dataset.parent || '', code:code.trim(), en:en.trim() || zh.trim(), zh:zh.trim()});
      closePop(); treeSave(reg, tf, nodes).then(function(){ toast(T('Saved', '已保存')); }); })(); break;
    case 'tnMove': (function(){ var tf = rf(reg, 'tree'), nodes = clone(treeNodes(tf)), n = nodes.filter(function(x){ return x.id === v; })[0]; var sib = nodes.filter(function(x){ return (x.parent || '') === (n.parent || ''); }), i = sib.indexOf(n), j = i + (+el.dataset.d); if(j < 0 || j >= sib.length) return; var a = nodes.indexOf(sib[i]), b = nodes.indexOf(sib[j]); nodes[a] = sib[j]; nodes[b] = sib[i]; treeSave(reg, tf, nodes); })(); break;
    case 'tnDel': (function(){ var tf = rf(reg, 'tree'), nodes = clone(treeNodes(tf)), n = nodes.filter(function(x){ return x.id === v; })[0]; if(!n) return;
      var set = treeDesc(tf, v), recs = recsOf(reg.id).filter(function(r){ return r.d[tf.key] === v; }), sub = nodes.filter(function(x){ return x.parent === v; }).length, par = n.parent || '';
      if(!confirm(T('Delete category “' + treeLabel(n) + '”?', '删除分类「' + treeLabel(n) + '」？') + '\n' + (sub ? T(sub + ' sub-levels move up one level. ', sub + ' 个下级会上移一层。') : '') + (recs.length ? T(recs.length + ' records move to the level above.', recs.length + ' 条记录会移到上一级。') : ''))) return;
      nodes = nodes.filter(function(x){ return x.id !== v; }); nodes.forEach(function(x){ if(x.parent === v) x.parent = par; });
      treeSave(reg, tf, nodes).then(function(){ setRecs(recs.map(function(r){ return {rec:r, patch:mk(tf.key, par)}; })); if(rfil(reg.id).node === v) rfil(reg.id).node = 'all'; toast(T('Category deleted — undo from the Change log', '分类已删除，可在修改记录中撤销')); }); })(); break;
    case 'rexp': S.rexp = S.rexp || {}; S.rexp[v] = !S.rexp[v]; renderMain(); break;
    case 'pickParent': openPick('parent', {reg:rec.reg, rec:rec.id, w:380}, el); break;
    case 'setParent': (function(){ var r = (S.pop && S.pop.kind === 'parent') ? getRec(S.pop.rec) : rec; if(!r) return; closePop(); setRec(r, {parent:v || null}); })(); break;
    case 'subQuick': (function(){ var i = $('#subQuick'), t = i && i.value.trim(); if(!t) return; addChildren(drReg, rec, [t]).then(function(n){ if(n){ toast(T('Added', '已新增')); var j = $('#subQuick'); if(j){ j.value = ''; j.focus(); } } }); })(); break;
    case 'subBulk': (function(){ var t = ($('#subBulk') || {}).value || '', lines = t.split(/\r?\n/).filter(function(x){ return x.trim(); }); if(!lines.length) return; addChildren(drReg, rec, lines).then(function(n){ toast(T('Added ' + n + ' sub-items', '已新增 ' + n + ' 个子项')); S.rexp = S.rexp || {}; S.rexp[rec.id] = true; renderAll(); }); })(); break;
    case 'sort': (function(){ var s = S.rs[S.reg] || {}; S.rs[S.reg] = {k:v, d: s.k === v ? -s.d || -1 : 1}; saveUI(); renderMain(); })(); break;
    case 'gcol': S.gcol[v] = !S.gcol[v]; renderMain(); break;
    case 'colsPick': colsPick(reg, el); break;
    case 'selClear': S.sel = {}; S.bulkF = null; S.bulkDel = false; renderMain(); break;
    case 'bulkPick': (function(){ var f = fieldOf(reg, S.bulkF); openPick(f.type === 'tree' ? 'tree' : 'opts', {reg:reg.id, key:f.key, bulk:true, bulkVal:null, noClear:false, onPick:function(val){ bulkApply(reg, f, val); closePop(); }}, el); })(); break;
    case 'bulkSet': bulkApply(reg, fieldOf(reg, S.bulkF), v === '1'); break;
    case 'bulkApply': (function(){ var f = fieldOf(reg, S.bulkF), raw = ($('#bulkVal') || {}).value; bulkApply(reg, f, f.type === 'number' || f.type === 'percent' ? num(raw) : raw); })(); break;
    case 'bulkExt': bulkApply(reg, {key:'ext', type:'check'}, v !== '0'); break;
    case 'bulkDel': S.bulkDel = true; renderMain(); break;
    case 'bulkDelYes': (function(){ var ids = selIds(reg); S.sel = {}; S.bulkDel = false; Promise.all(ids.map(function(id){ return STORE.deleteRec(id).catch(function(){}); })).then(function(){ toast(T('Deleted ' + ids.length + ' — restore from the Change log', '已删除 ' + ids.length + ' 项，可在修改记录中恢复')); }); })(); break;
    case 'mxCell': (function(){ var o = JSON.parse(v), m = matrixCfg(reg), f = rfil(reg.id), rfd = fieldOf(reg, m.row); f.fx = {}; f.fx[m.col] = [o.c]; S.mxFilter = {k:m.row, g:o.g}; if(rfd && (rfd.type === 'select')) f.fx[m.row] = [o.g.replace(/^v:/, '')]; if(rfd && rfd.type === 'tree') f.node = o.g.replace(/^t:/, ''); S.rv[reg.id] = 'table'; renderMain(); })(); break;
    case 'gzoom': S.gz = v; S.gKeep = false; saveUI(); renderMain(); break;
    case 'gToday': S.gKeep = false; renderMain(); break;
    case 'schedReg': (function(){ var all = allRegs().filter(function(r){ return rolesOf(r).start || rolesOf(r).finish; }).map(function(r){ return r.id; }), p = (S.sched || all).slice(), i = p.indexOf(v); if(i >= 0) p.splice(i, 1); else p.push(v); S.sched = p; saveUI(); renderMain(); })(); break;
    case 'schedBlk': (function(){ var a = S.schedBlk = S.schedBlk || [], i = a.indexOf(v); if(i >= 0) a.splice(i, 1); else a.push(v); renderMain(); })(); break;
    case 'goBlock': (function(){ var p = v.split('|'), rg = getReg(p[0]), bf = rg && rf(rg, 'block'); if(!rg) return; S.rf[rg.id] = null; if(bf) rfil(rg.id).fx[bf.key] = [p[1]]; goReg(rg.id); })(); break;
    // registers
    case 'newReg': openModal({kind:'newReg'}); break;
    case 'tplPick': (function(){ var m = S.modal; m.tpl = v; m.en = null; m.zh = null; m.vis = null; m.sec = null; renderModal(); })(); break;
    case 'regCreate': (function(){ var m = S.modal, en = ($('#nrEn') || {}).value || '', zh = ($('#nrZh') || {}).value || '', vis = ($('#nrVis') || {}).value || 'team', sec = ($('#nrSec') || {}).value || 'other';
      if(!en.trim() && !zh.trim()){ toast(T('Give the register a name', '请填写台账名称')); return; }
      var r = regFromTemplate(m.tpl, {vis:canTeamEdit() ? vis : 'private', d:{en:en.trim() || zh.trim(), zh:zh.trim(), sec:sec}});
      STORE.createReg(r).then(function(){ var sd = (TEMPLATES[m.tpl] || {}).seed; if(sd && sd.length){ var k = 0; STORE.createRecs(sd.map(function(x){ k++; var d = blankData(r, {en:x[0], zh:x[1], cat:x[2]}); d.regNo = (r.d.prefix || 'MS') + '-' + String(k).padStart(3, '0'); return {id:uid('r'), reg:r.id, d:d}; })).catch(function(){}); } var order = (cfg().regOrder || []).concat([r.id]); if(canTeamEdit()) STORE.saveCfg({regOrder:order}).catch(function(){}); closeModal(); goReg(r.id); toast(T('Register created', '台账已建立')); }).catch(function(er){ toast(errText(er)); }); })(); break;
    case 'regSettings': openModal({kind:'regSettings', reg:v}); break;
    case 'rsIcon': S.modal.d.icon = v; renderModal(); break;
    case 'regSave': (function(){ var m = S.modal, rg = getReg(m.reg), d = m.d, p = {en:d.en, zh:d.zh, icon:d.icon, color:d.color, sec:d.sec, prefix:String(d.prefix || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), ownerPublish:d.vis === 'private' ? false : !!d.ownerPublish, view:d.view, meeting:!!d.meeting};
      var jobs = [STORE.patchReg(rg.id, p)]; if(d.vis !== rg.vis) jobs.push(STORE.setRegVis(rg.id, d.vis));
      Promise.all(jobs).then(function(){ toast(T('Saved', '已保存')); closeModal(); }).catch(function(er){ toast(errText(er)); }); })(); break;
    case 'regDelete': (function(){ var m = S.modal, rg = getReg(m.reg), nmv = ($('#delRegName') || {}).value || ''; if(nmv.trim() !== String(rg.d.en).trim() && nmv.trim() !== String(rg.d.zh || '').trim()){ toast(T('Type the register name exactly to confirm', '请准确输入台账名称以确认')); return; }
      STORE.deleteReg(rg.id).then(function(){ closeModal(); goPage('home'); toast(T('Register deleted — restore it from the Change log', '台账已删除，可在修改记录中恢复')); }).catch(function(er){ toast(errText(er)); }); })(); break;
    case 'regMove': (function(){ var ids = allRegs().map(function(r){ return r.id; }), i = ids.indexOf(v), j = i + (+el.dataset.d); if(j < 0 || j >= ids.length) return; ids[i] = ids[j]; ids[j] = v; STORE.saveCfg({regOrder:ids}); })(); break;
    // field manager
    case 'fieldsOpen': closePop(); openModal({kind:'fields', reg:v || S.reg}); break;
    case 'fmMove': (function(){ var a = S.modal.d.fields, i = +v, j = i + (+el.dataset.d); if(j < 0 || j >= a.length) return; var x = a[i]; a[i] = a[j]; a[j] = x; if(S.modal.exp === i) S.modal.exp = j; else if(S.modal.exp === j) S.modal.exp = i; renderModal(); })(); break;
    case 'fmExp': S.modal.exp = S.modal.exp === +v ? null : +v; renderModal(); break;
    case 'fmDel': (function(){ var m = S.modal, f = m.d.fields[+v], n = recsOf(m.reg).filter(function(r){ return !isEmpty(r.d[f.key]); }).length; if(n && !confirm(T(n + ' records have a value in this field. Hide the field? (The data is kept.)', n + ' 条记录在此字段有值。确定移除该字段？（数据会保留）'))) return; m.d.fields.splice(+v, 1); Object.keys(m.d.roles).forEach(function(r){ if(m.d.roles[r] === f.key) delete m.d.roles[r]; }); m.exp = null; renderModal(); })(); break;
    case 'fmAdd': (function(){ var m = S.modal, rg = getReg(m.reg), type = ($('#fmNewType') || {}).value || 'text', name = (($('#fmNewName') || {}).value || '').trim(); if(!name){ toast(T('Type a name for the new field', '请输入新字段名称')); return; }
      var zh = /[一-鿿]/.test(name) && !/[A-Za-z]{3,}/.test(name), tmp = {d:{fields:m.d.fields}}, key = newKey(tmp, zh ? 'f' + (m.d.fields.length + 1) : name);
      var f = F(key, zh ? name : name, zh ? name : '', type); if(type === 'select') f.opts = []; if(type === 'sub') f.cols = [F('item','Item','事项','text'),F('d','Date','日期','date')]; if(type === 'calc') f.calc = {op:'pct', a:'', b:''}; if(type === 'tree') f.tree = [];
      m.d.fields.push(f); m.exp = m.d.fields.length - 1; renderModal(); setTimeout(function(){ var b = $('.mbody'); if(b) b.scrollTop = b.scrollHeight; }, 20); })(); break;
    case 'fmSave': (function(){ var m = S.modal, rg = getReg(m.reg), fs = m.d.fields;
      for(var i = 0; i < fs.length; i++){ if(!fs[i].en && !fs[i].zh){ toast(T('Every field needs a name', '每个字段都需要名称')); return; } if(fs[i].type === 'select' && !fs[i].list){ var bad = cleanOpts(fs[i].opts || []); if(bad){ toast(T1(fs[i].en, fs[i].zh) + ': ' + bad); return; } } }
      Object.keys(m.d.roles).forEach(function(r){ if(!m.d.roles[r]) delete m.d.roles[r]; });
      STORE.patchReg(rg.id, {fields:fs, roles:m.d.roles}).then(function(){ toast(T('Fields saved', '字段已保存')); closeModal(); }).catch(function(er){ toast(errText(er)); }); })(); break;
    case 'colsOpen': (function(){ var parent = S.modal; S.modal = {kind:'cols', i:+v, parent:parent}; renderModal(); })(); break;
    case 'cdAdd': S.modal.cols.push(F('c' + (S.modal.cols.length + 1) + Date.now().toString(36).slice(-2), '', '', 'text')); renderModal(); break;
    case 'cdDel': S.modal.cols.splice(+v, 1); renderModal(); break;
    case 'cdSave': (function(){ var m = S.modal; m.parent.d.fields[m.i].cols = m.cols; S.modal = m.parent; renderModal(); })(); break;
    case 'cdBack': S.modal = S.modal.parent; renderModal(); break;
    case 'mclose': closeModal(); S.ldraft = null; if(S.page === 'settings') renderMain(); break;
    // owner
    case 'otab': S.otab = v; renderMain(); break;
    case 'publish': (STORE.ensurePubs ? STORE.ensurePubs() : Promise.resolve()).then(function(){ var rg = getReg(S.oreg), snap = ownerSnapshot(rg), max = 0; (STORE.pubs || []).forEach(function(p){ var mm = /PUB-(\d+)/.exec(p.no || ''); if(mm) max = Math.max(max, +mm[1]); });
      var no = 'PUB-' + String(max + 1).padStart(3, '0'); STORE.createPub(no, Object.assign(snap, {no:no, at:new Date().toISOString(), by:(STORE.me && (STORE.me.name || STORE.me.email)) || '', note:($('#snapNote') || {}).value || ''})).then(function(no2){ toast(T('Published ', '已发布 ') + (no2 || no)); S.otab = 'snaps'; renderMain(); }).catch(function(er){ toast(errText(er)); }); }); break;
    case 'pubDel': if(confirm(T('Withdraw this publication? The Owner will no longer see it.', '撤回此发布？业主将无法再看到。'))) STORE.deletePub(v).catch(function(er){ toast(errText(er)); }); break;
    case 'fbOpen': S.fbFor = S.fbFor === v ? null : v; renderMain(); break;
    case 'fbSend': (function(){ var body = (($('#fbBody') || {}).value || '').trim(); if(!body) return; var p = (STORE.pubs || []).filter(function(x){ return x.id === S.pubSel; })[0] || (STORE.pubs || [])[0]; STORE.addFeedback({pub_id:p && p.id, item_id:v, reg_no:el.dataset.no, body:body}).then(function(){ S.fbFor = null; toast(T('Sent', '已提交')); renderMain(); }).catch(function(er){ toast(errText(er)); }); })(); break;
    case 'fbResolve': (function(){ var rp = ($('#rp_' + v) || {}).value || ''; STORE.updateFeedback(v, {status:'resolved', reply:rp, resolved_at:new Date().toISOString()}).then(function(){ toast(T('Resolved', '已关闭')); }).catch(function(er){ toast(errText(er)); }); })(); break;
    // settings / files
    case 'stab': S.stab = v; S.ldraft = null; saveUI(); renderMain(); break;
    case 'reloadUsers': STORE.reloadUsers && STORE.reloadUsers(); break;
    case 'backupXlsx': backupXlsx(); break;
    case 'backupJson': backupJson(); break;
    case 'bkNow': (function(){ var b = S.bk = S.bk || {}; b.busy = T('Backing up…', '正在备份…'); renderMain(); STORE.backupNow().then(function(){ toast(T('Backup made', '已备份')); b.list = null; }).catch(function(e){ toast(errText(e)); }).then(function(){ b.busy = null; renderMain(); }); })(); break;
    case 'bkDl': (function(){ var b = S.bk = S.bk || {}, row = (b.list || []).filter(function(x){ return String(x.id) === v; })[0]; b.busy = T('Preparing the download…', '正在准备下载…'); renderMain();
      STORE.backupGet(+v).then(function(data){ saveJson(data, slug(cfg().projectEn) + '_server_backup_' + (row ? bkWhen(row.at).replace(/[: ]/g, '-') : v) + '.json'); }).catch(function(e){ toast(errText(e)); }).then(function(){ b.busy = null; renderMain(); }); })(); break;
    case 'bkAsk': S.bk.ask = +v; renderMain(); setTimeout(function(){ var i = $('#bkWord'); if(i) i.focus(); }, 0); break;
    case 'bkCancel': S.bk.ask = null; renderMain(); break;
    case 'bkGo': (function(){ var b = S.bk, w = (($('#bkWord') || {}).value || '').trim(); if(w !== 'RESTORE'){ toast(T('Type RESTORE to confirm', '请输入 RESTORE 确认')); return; }
      b.busy = T('Restoring…', '正在还原…'); renderMain();
      STORE.backupRestore(+v, w).then(function(res){ b.ask = null; b.list = null; toast(T('Restored · ' + ((res && res.records_changed) || 0) + ' records changed, ' + ((res && res.records_back) || 0) + ' brought back, ' + ((res && res.records_removed) || 0) + ' removed', '已还原 · 修改 ' + ((res && res.records_changed) || 0) + '，恢复 ' + ((res && res.records_back) || 0) + '，移除 ' + ((res && res.records_removed) || 0) + ' 条记录')); })
        .catch(function(e){ toast(errText(e)); }).then(function(){ b.busy = null; renderAll(); }); })(); break;
    case 'unusedCheck': (function(){ var u = S.unused = S.unused || {}; u.busy = T('Checking…', '正在检查…'); renderMain(); STORE.storageUnused(30).then(function(l){ u.list = l; }).catch(function(e){ toast(errText(e)); }).then(function(){ u.busy = null; renderMain(); }); })(); break;
    case 'unusedDel': (function(){ var u = S.unused || {}, l = u.list || []; if(!l.length || !confirm(T('Delete ' + l.length + ' unused file(s) for good?', '永久删除 ' + l.length + ' 个未使用的文件？'))) return; u.busy = T('Deleting…', '正在删除…'); renderMain();
      STORE.deleteFiles(l.map(function(x){ return x.name; })).then(function(n){ toast(T(n + ' file(s) deleted', '已删除 ' + n + ' 个文件')); u.list = null; }).catch(function(e){ toast(errText(e)); }).then(function(){ u.busy = null; renderMain(); }); })(); break;
    case 'resetDemo': if(confirm(T('Reset all demo data in this browser?', '重置本浏览器中的全部演示数据？'))) STORE.resetDemo(); break;
    case 'fileKind': S.files.kind = v; renderMain(); break;
    case 'fileBlk': S.files.blk = S.files.blk === v ? '' : v; renderMain(); break;
  }
});
function nodeExtra(reg){ var tf = rf(reg, 'tree'), n = rfil(reg.id).node, o = {}; if(tf && n && n !== 'all' && n !== 'none' && treeNode(tf, n)) o[tf.key] = n; return o; }
function treeSave(reg, tf, nodes){ var fs = clone(fieldsOf(reg)); fs.forEach(function(f){ if(f.key === tf.key) f.tree = nodes; }); return STORE.patchReg(reg.id, {fields:fs}).catch(function(er){ toast(errText(er)); }); }
function tnEditor(reg, tf, nodeId, parentId, anchor){
  var n = nodeId ? treeNode(tf, nodeId) : null, par = parentId ? treeNode(tf, parentId) : null;
  var sugg = ''; if(!n){ var sib = treeKids(tf, parentId || ''); sugg = par && par.code ? par.code + '.' + (sib.length + 1) : 'P' + (sib.length + 1); }
  var html = '<div class="tned"><b>' + (n ? L('Rename category', '修改分类') : par ? L('New sub-level under ', '在此下新增：') + esc(treeLabel(par)) : L('New top-level category', '新增顶层分类')) + '</b>' +
    '<label class="fl">' + L('Code', '编号') + '<input class="in" id="tnCode" value="' + esc(n ? n.code || '' : sugg) + '"></label><label class="fl">' + L('Name (EN)', '英文名') + '<input class="in" id="tnEn" value="' + esc(n ? n.en || '' : '') + '"></label><label class="fl">' + L('Name (中)', '中文名') + '<input class="in" id="tnZh" value="' + esc(n ? n.zh || '' : '') + '"></label>' +
    '<div class="row"><button type="button" class="btn pri sm" data-act="tnSave" data-node="' + esc(nodeId || '') + '" data-parent="' + esc(parentId || '') + '">' + L('Save', '保存') + '</button><button type="button" class="btn sm" data-act="popClose">' + L('Cancel', '取消') + '</button></div></div>';
  openPick('menu', {reg:reg.id, html:html, w:280}, anchor);
  setTimeout(function(){ var i = $(n ? '#tnEn' : '#tnEn'); if(i) i.focus(); }, 20);
}
function cleanOpts(opts){ var seen = {}; for(var i = 0; i < opts.length; i++){ var o = opts[i]; o.v = String(o.v || '').trim(); if(!o.v) o.v = String(o.en || o.zh || '').trim(); if(!o.v) return T('Each option needs a code or a name', '每个选项需要代码或名称'); if(!o.en) o.en = o.zh || o.v; if(seen[o.v]) return T('Duplicate option code: ', '选项代码重复：') + o.v; seen[o.v] = 1; } return null; }
function selIds(reg){ return Object.keys(S.sel).filter(function(id){ var r = S.sel[id] && getRec(id); return r && r.reg === reg.id; }); }
function bulkApply(reg, f, value){
  var ids = selIds(reg); if(!ids.length || !f) return;
  var v = value; if(f.type === 'select' && f.multi && v != null) v = [v]; if(v == null) v = f.type === 'select' && f.multi ? [] : '';
  setRecs(ids.map(function(id){ return {rec:getRec(id), patch:mk(f.key, clone(v))}; }), null, {check:true}).then(function(res){ if(res && res.cancelled){ renderMain(); return; } toast(T('Updated ' + ids.length, '已更新 ' + ids.length + ' 项') + (res && res.failed ? T(' · ' + res.failed + ' not saved', ' · ' + res.failed + ' 项未保存') : '')); S.bulkF = null; renderMain(); });
}
function fxPick(reg, key, anchor){
  var fd = fieldOf(reg, key), f = rfil(reg.id);
  var opts = fd.type === 'check' ? [O('1', 'Yes', '是'), O('0', 'No', '否')] : optsOf(fd).slice();
  if(fd.type === 'select'){ var known = {}; opts.forEach(function(o){ known[o.v] = 1; }); var extra = {};   // values in the records that are not in the option list (e.g. imported names)
    recsOf(reg.id).forEach(function(r){ asArr(r.d[key]).forEach(function(x){ if(typeof x === 'string' && x && !known[x]) extra[x] = 1; }); });
    Object.keys(extra).sort().forEach(function(x){ opts.push(O(x, x + ' (' + T('not in list', '不在名单') + ')', x + '（不在名单）', 'grey')); }); }
  if(fd.type !== 'check') opts.push(O('__none', '(empty)', '（空）'));
  var html = '<div class="plist">' + opts.map(function(o){ var on = (f.fx[key] || []).indexOf(o.v) >= 0; return '<button type="button" class="popt' + (on ? ' on' : '') + '" data-act="fxTog" data-k="' + esc(key) + '" data-v="' + esc(o.v) + '"><span class="cbx">' + (on ? '✓' : '') + '</span><span class="sw c-' + esc(o.color || 'grey') + '"></span>' + esc(nm(o)) + '</button>'; }).join('') + '</div><div class="pfoot"><button type="button" class="lnk" data-act="popClear">' + L('Clear', '清除') + '</button><button type="button" class="btn sm" data-act="popClose">' + L('Done', '完成') + '</button></div>';
  openPick('menu', {reg:reg.id, key:key, fx:true, html:html}, anchor);
}
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act="fxTog"]'); if(!el) return;
  var reg = curReg(), f = rfil(reg.id), k = el.dataset.k, a = (f.fx[k] = f.fx[k] || []), i = a.indexOf(el.dataset.v); if(i >= 0) a.splice(i, 1); else a.push(el.dataset.v);
  fxPick(reg, k, {getBoundingClientRect:function(){ return {left:S.pop.x, bottom:S.pop.y - 4, width:S.pop.w}; }}); renderMain();
});
function colsPick(reg, anchor){
  var cur = tableCols(reg).map(function(f){ return f.key; });
  var html = '<div class="plist">' + dataFields(reg).map(function(f){ var on = cur.indexOf(f.key) >= 0; return '<label class="popt"><input type="checkbox" data-colk="' + esc(f.key) + '"' + (on ? ' checked' : '') + '>' + esc(T1(f.en, f.zh)) + '</label>'; }).join('') + '</div><div class="pfoot"><button type="button" class="lnk" data-act="colsReset">' + L('Reset to default', '恢复默认') + '</button><button type="button" class="btn sm" data-act="popClose">' + L('Done', '完成') + '</button></div>';
  openPick('menu', {reg:reg.id, html:html}, anchor);
}
document.addEventListener('click', function(e){ var el = e.target.closest && e.target.closest('[data-act="colsReset"]'); if(!el) return; delete S.rcols[S.reg]; saveUI(); closePop(); renderMain(); });

/* ---------------- inline cell editing ---------------- */
function startCellEdit(td){
  var rec = getRec(td.dataset.id), reg = rec && getReg(rec.reg), f = reg && fieldOf(reg, td.dataset.k); if(!f || !canWrite(reg)) return;
  if(f.type === 'select'){ openPick('opts', {reg:reg.id, rec:rec.id, key:f.key}, td); return; }
  if(f.type === 'tree'){ openPick('tree', {reg:reg.id, rec:rec.id, key:f.key}, td); return; }
  if(f.type === 'check'){ setRec(rec, mk(f.key, !rec.d[f.key])); return; }
  if(canInline(f)){ S.edit = {id:rec.id, k:f.key}; renderMain(); var i = $('[data-ie]'); if(i){ i.focus(); if(i.select && f.type !== 'date') i.select(); } return; }
  openRec(rec.id, f.type === 'files' ? 'files' : f.type === 'link' ? 'links' : 'details');
}
function commitEdit(cancel){
  var ed = S.edit; if(!ed) return; S.edit = null;
  var i = $('[data-ie]'), rec = getRec(ed.id), reg = rec && getReg(rec.reg), f = reg && fieldOf(reg, ed.k);
  if(!cancel && i && rec && f){
    var v = i.value;
    if(f.type === 'number') v = num(v); else if(f.type === 'percent') v = v === '' ? null : clamp(Math.round(+v || 0), 0, 100);
    if(f.type === 'date' && (f.key === rolesOf(reg).start || f.key === rolesOf(reg).finish)) setRec(rec, dateFix(reg, rec, f.key, v));
    else setRec(rec, mk(f.key, v));
  }
  renderMain();
}
function dateFix(reg, rec, k, v){
  var o = mk(k, v), ro = rolesOf(reg);
  if(isMilestone(reg, rec) && ro.start && ro.finish && ro.start !== ro.finish){ o[ro.start] = v; o[ro.finish] = v; return o; }
  if(!v || !ro.start || !ro.finish || ro.start === ro.finish) return o;
  var s = d2n(k === ro.start ? v : rec.d[ro.start]), f = d2n(k === ro.finish ? v : rec.d[ro.finish]);
  if(k === ro.start && f != null && s > f) o[ro.finish] = v;
  if(k === ro.finish && s != null && f < s) o[ro.start] = v;
  return o;
}
document.addEventListener('change', function(e){ if(e.target.dataset && e.target.dataset.ie && e.target.type === 'date' && S.edit) commitEdit(false); }, true);
document.addEventListener('focusout', function(e){ if(e.target.dataset && e.target.dataset.ie && S.edit) setTimeout(function(){ if(S.edit) commitEdit(false); }, 0); });

/* ---------------- keyboard ---------------- */
document.addEventListener('keydown', function(e){
  var el = e.target;
  /* elements that act as buttons without being one (e.g. the status inside a card): Enter / Space */
  if(el.getAttribute && el.getAttribute('role') === 'button' && el.tagName !== 'BUTTON' && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); e.stopPropagation(); el.click(); return; }
  if(el.dataset && el.dataset.ie){
    if(e.key === 'Escape'){ e.preventDefault(); commitEdit(true); return; }
    if(e.key === 'Enter' && (el.tagName !== 'TEXTAREA' || e.ctrlKey || e.metaKey)){ e.preventDefault(); commitEdit(false); return; }
    return;
  }
  if(el.id === 'qadd' && e.key === 'Enter'){
    e.preventDefault(); var t = el.value.trim(); if(!t) return; var reg = curReg(); if(!reg) return; var ro = rolesOf(reg), d = {};
    var zh = /[一-鿿]/.test(t) && !/[A-Za-z]{3,}/.test(t); if(zh && ro.title2) d[ro.title2] = t; else if(ro.title) d[ro.title] = t; Object.assign(d, nodeExtra(reg));
    if(el.dataset.gantt && ro.start && ro.finish){ d[ro.start] = n2d(asOfN()); d[ro.finish] = n2d(asOfN() + 13); }
    el.value = ''; createRec(reg, d, false).then(function(){ var q = $('#qadd'); if(q) q.focus(); });
    return;
  }
  if(el.dataset && el.dataset.kadd && e.key === 'Enter'){ e.preventDefault(); var pr = getRec(el.dataset.kadd), prg = pr && getReg(pr.reg), tx = el.value.trim(); if(!pr || !tx) return; el.value = ''; addChildren(prg, pr, [tx]).then(function(){ var q = $('[data-kadd="' + pr.id + '"]'); if(q) q.focus(); }); return; }
  if(el.id === 'subQuick' && e.key === 'Enter'){ e.preventDefault(); var b0 = $('[data-act="subQuick"]'); if(b0) b0.click(); return; }
  if(el.id === 'popq' && e.key === 'Enter'){ e.preventDefault(); var b = $('.popover [data-act="popAdd"]') || $('.popover [data-act="popPick"]'); if(b) b.click(); return; }
  if(e.key === 'Escape'){
    if(S.pop){ closePop(); return; } if(S.modal){ closeModal(); return; } if(S.open){ S.open = null; renderDrawer(); return; } if(S.q){ S.q = ''; renderTop(); return; } if(S.sideOpen){ S.sideOpen = false; renderSide(); }
  }
});

/* ---------------- typing (no full re-render while typing in drafts) ---------------- */
var qT;
document.addEventListener('input', function(e){
  var el = e.target, d;
  if(el.id === 'gq'){ S.q = el.value; clearTimeout(qT); qT = setTimeout(function(){ renderTop(); restoreFocus({k:'gq', s:el.selectionStart, e:el.selectionEnd}); }, 150); return; }
  if(el.id === 'fq'){ rfil(S.reg).q = el.value; clearTimeout(qT); qT = setTimeout(renderMain, 200); return; }
  if(el.id === 'fileq'){ S.files.q = el.value; clearTimeout(qT); qT = setTimeout(renderMain, 200); return; }
  if(el.id === 'popq'){ S.pop.q = el.value; renderPop(); var p = $('#popq'); if(p){ p.focus(); p.setSelectionRange(p.value.length, p.value.length); } return; }
  if((d = el.dataset.fm)){ fmSet(d, el); return; }
  if((d = el.dataset.od)){ var p1 = d.split(':'), a = odArr(); if(a[+p1[0]] && p1[1] !== 'color' && p1[1] !== 'done') a[+p1[0]][p1[1]] = el.value; return; }
  if((d = el.dataset.td)){ var p2 = d.split(':'), t = tdArr(); if(t[+p2[0]] && p2[1] !== 'parent') t[+p2[0]][p2[1]] = el.value; return; }
  if((d = el.dataset.cd)){ var p3 = d.split(':'), c = S.modal.cols[+p3[0]]; if(c && (p3[1] === 'en' || p3[1] === 'zh')) c[p3[1]] = el.value; return; }
  if((d = el.dataset.rs)){ if(el.type !== 'checkbox' && el.tagName !== 'SELECT') S.modal.d[d] = el.value; return; }
  if((d = el.dataset.ld)){ S.ldraft[d] = el.value; return; }
  if(el.id === 'nrEn' || el.id === 'nrZh'){ S.modal[el.id === 'nrEn' ? 'en' : 'zh'] = el.value; return; }
});
function fmSet(d, el){
  var m = S.modal, p = d.split(':'), f = m.d.fields[+p[0]], k = p[1]; if(!f) return;
  if(k === 'en' || k === 'zh' || k === 'help' || k === 'unit') f[k] = el.value;
  else if(k === 'w') f.w = el.value ? +el.value : undefined;
  else if(k === 'show') f.hide = !el.checked;
  else if(k === 'ext') f.ext = el.checked;
  else if(k === 'multi') f.multi = el.checked;
  else if(k === 'type'){ f.type = el.value; if(f.type === 'select' && !f.list && !f.opts) f.opts = []; if(f.type === 'tree' && !f.tree) f.tree = []; if(f.type === 'sub' && !f.cols) f.cols = [F('item','Item','事项','text')]; if(f.type === 'calc' && !f.calc) f.calc = {op:'pct', a:'', b:''}; m.exp = +p[0]; renderModal(); }
  else if(k === 'list'){ f.list = el.value || undefined; if(!f.list && !f.opts) f.opts = []; renderModal(); }
  else if(k === 'autoA' || k === 'autoB'){ f.auto = f.auto || {op:'pct'}; f.auto[k === 'autoA' ? 'a' : 'b'] = el.value; if(!f.auto.a || !f.auto.b){ if(!f.auto.a && !f.auto.b) delete f.auto; } }
  else if(k === 'calcOp' || k === 'calcA' || k === 'calcB'){ f.calc = f.calc || {}; f.calc[k === 'calcOp' ? 'op' : k === 'calcA' ? 'a' : 'b'] = el.value; }
  else if(k === 'link'){ var rid = p.slice(2).join(':'), l = f.link || [], i = l.indexOf(rid); if(el.checked && i < 0) l.push(rid); if(!el.checked && i >= 0) l.splice(i, 1); f.link = l; }
}

/* ---------------- change events ---------------- */
document.addEventListener('change', function(e){
  var el = e.target, reg = curReg(), rec = S.open && getRec(S.open), d;
  if(el.id === 'rgroup'){ S.rg[S.reg] = el.value; saveUI(); renderMain(); return; }
  if(el.id === 'ggroup'){ S.rg[S.reg + ':g'] = el.value; saveUI(); renderMain(); return; }
  if(el.id === 'rboard'){ S.rboard[S.reg] = el.value; saveUI(); renderMain(); return; }
  if(el.id === 'mxRow' || el.id === 'mxCol' || el.id === 'mxVal'){ var mm = S.rmx[S.reg] = S.rmx[S.reg] || {}; mm[el.id === 'mxRow' ? 'row' : el.id === 'mxCol' ? 'col' : 'val'] = el.value; saveUI(); renderMain(); return; }
  if(el.id === 'gAsOf'){ if(canTeamEdit()) STORE.saveCfg({asOf:el.value || ''}); else { S.asOfLocal = el.value || null; renderMain(); } return; }
  if(el.id === 'ffrom' || el.id === 'fto'){ rfil(S.reg)[el.id === 'ffrom' ? 'from' : 'to'] = el.value || ''; renderMain(); return; }
  if(el.id === 'fod' || el.id === 'fstar' || el.id === 'fext'){ rfil(S.reg)[el.id.slice(1)] = el.checked; renderMain(); return; }
  if(el.id === 'schOpen'){ S.schOpen = el.checked; renderMain(); return; }
  if(el.id === 'actReg' || el.id === 'actType'){ S.act[el.id === 'actReg' ? 'reg' : 'type'] = el.value; S.act.rows = null; renderMain(); return; }
  if(el.id === 'actWho'){ S.act.who = el.value; renderMain(); return; }
  if(el.dataset && el.dataset.act === 'carryDone'){ var cr = getRec(el.dataset.id); if(!cr) return; var ck = actionCols(fieldOf(getReg(cr.reg), el.dataset.k)).ck;
    setRec(cr, mk(el.dataset.k, asArr(cr.d[el.dataset.k]).map(function(x){ if(x && x._id === el.dataset.row){ x = clone(x); x[ck] = el.checked; } return x; }))); return; }
  if(el.id === 'mePick'){ LS.set('ww2.mePid', el.value || null); renderAll(); return; }
  if(el.id === 'fileReg'){ S.files.reg = el.value; renderMain(); return; }
  if(el.id === 'oreg'){ S.oreg = el.value; renderMain(); return; }
  if(el.id === 'pubSel'){ S.pubSel = el.value; S.fbFor = null; renderMain(); return; }
  if(el.id === 'bulkField'){ S.bulkF = el.value || null; renderMain(); return; }
  if(el.id === 'selall'){ S.sel = {}; if(el.checked) filteredRecs(reg).forEach(function(r){ S.sel[r.id] = true; }); renderMain(); return; }
  if(el.classList.contains('rowsel')){ S.sel[el.dataset.id] = el.checked; S.bulkDel = false; renderMain(); return; }
  if(el.dataset.colk){ var cur = tableCols(reg).map(function(f){ return f.key; }), k = el.dataset.colk, i = cur.indexOf(k); if(el.checked && i < 0) cur.push(k); if(!el.checked && i >= 0) cur.splice(i, 1); var ord = dataFields(reg).map(function(f){ return f.key; }); cur.sort(function(a, b){ return ord.indexOf(a) - ord.indexOf(b); }); S.rcols[S.reg] = cur; saveUI(); renderMain(); return; }
  if(el.dataset.act === 'extTog' && rec){ setRec(rec, {ext:el.checked}, {silent:true}); return; }
  if((d = el.dataset.df) && rec){ var rg = getReg(rec.reg), f = fieldOf(rg, d), v = el.type === 'checkbox' ? el.checked : el.value;
    if(f.type === 'number') v = num(v); if(f.type === 'percent') v = v === '' ? null : clamp(Math.round(+v || 0), 0, 100);
    if(f.type === 'date' && (d === rolesOf(rg).start || d === rolesOf(rg).finish)) setRec(rec, dateFix(rg, rec, d, v)); else setRec(rec, mk(d, v)); return; }
  if(el.dataset.gd){ var gr = getRec(el.dataset.gd), grg = gr && getReg(gr.reg); if(gr) setRec(gr, dateFix(grg, gr, el.dataset.k, el.value)); return; }
  if(el.dataset.sub && rec){ var col = el.dataset.col, vv = el.type === 'checkbox' ? el.checked : el.value; subSet(rec, el.dataset.sub, el.dataset.row, col, vv); return; }
  if(el.dataset.up && rec){ upload(rec, el.dataset.up, el.files); el.value = ''; return; }
  if((d = el.dataset.cfg)){ var p = {}; p[d] = el.value; STORE.saveCfg(p).then(function(){ toast(T('Saved', '已保存')); }).catch(function(er){ toast(errText(er)); }); return; }
  if(el.dataset.role){ STORE.setRole(el.dataset.role, el.value).then(function(){ toast(T('Role updated', '角色已更新')); }).catch(function(er){ toast(errText(er)); }); return; }
  if((d = el.dataset.fm)){ fmSet(d, el); return; }
  if((d = el.dataset.fmrole)){ S.modal.d.roles[d] = el.value; return; }
  if((d = el.dataset.od)){ var q = d.split(':'), a = odArr(); if(a[+q[0]]) a[+q[0]][q[1]] = q[1] === 'done' ? el.checked : el.value; return; }
  if((d = el.dataset.td)){ var q2 = d.split(':'), t = tdArr(); if(t[+q2[0]]){ t[+q2[0]][q2[1]] = el.value; if(q2[1] === 'parent') rerenderDraft(); } return; }
  if((d = el.dataset.cd)){ var q3 = d.split(':'), c = S.modal.cols[+q3[0]]; if(!c) return; if(q3[1] === 'type'){ c.type = el.value; if(c.type === 'select' && !c.opts) c.opts = []; renderModal(); } else if(q3[1] === 'optsTxt'){ c.opts = splitList(el.value, /\s*[,，;；]\s*/).map(function(x, i){ return O(x, x, '', COLORS[(i + 1) % COLORS.length]); }); } return; }
  if((d = el.dataset.rs)){ S.modal.d[d] = el.type === 'checkbox' ? el.checked : el.value; if(d === 'vis') renderModal(); return; }
  if(el.dataset.imap != null){ S.modal.map[+el.dataset.imap] = el.value; renderModal(); return; }
  if(el.id === 'impMatch'){ S.modal.matchKey = el.value; renderModal(); return; }
  if(el.id === 'impFile' && el.files && el.files[0]){ impFile(el.files[0]); return; }
  if(el.id === 'nrVis' || el.id === 'nrSec'){ S.modal[el.id === 'nrVis' ? 'vis' : 'sec'] = el.value; return; }
});
function upload(rec, key, files){
  var reg = getReg(rec.reg); if(!files || !files.length || !canWrite(reg)) return;
  if(libRoute(reg)){ uploadDocs(files, {link:rec}); return; }
  S.uploading = true; renderDrawer();
  var jobs = Array.prototype.map.call(files, function(f){ if(f.size > 50 * 1024 * 1024){ toast(T('Over 50 MB: ', '超过 50 MB：') + f.name); return Promise.resolve(null); } return STORE.upload(f, reg.id, rec.id).catch(function(er){ toast(errText(er)); return null; }); });
  Promise.all(jobs).then(function(res){
    S.uploading = false; var got = res.filter(Boolean).map(function(x){ return Object.assign(x, {at:new Date().toISOString(), by:(STORE.me && (STORE.me.name || STORE.me.email)) || ''}); });
    var cur = getRec(rec.id); if(got.length && cur) setRec(cur, mk(key, asArr(cur.d[key]).concat(got)), {silent:true}).then(function(){ toast(T('Uploaded ' + got.length, '已上传 ' + got.length)); });
    renderDrawer();
  });
}

/* ---------------- sign-in forms ---------------- */
document.addEventListener('submit', function(e){
  var fm = e.target; e.preventDefault();
  if(fm.id === 'fAuth'){
    var a = S.auth, email = ($('#aEmail') || {}).value, pw = ($('#aPw') || {}).value, name = ($('#aName') || {}).value;
    a.err = ''; a.msg = ''; a.busy = true; renderGate();
    var pr = a.tab === 'in' ? STORE.signIn(email, pw) : a.tab === 'up' ? STORE.signUp(email, pw, name) : STORE.reset(email);
    pr.then(function(r){ a.busy = false; if(r && r.error) a.err = r.error.message; else if(a.tab === 'up') a.msg = (r && r.data && r.data.session) ? T('Account created. Opening…', '注册成功，正在进入…') : T('Account created. If you are not signed in automatically, confirm your email, then sign in.', '注册成功。如未自动登录，请确认邮箱后再登录。'); else if(a.tab === 'reset') a.msg = T('If that email has an account, a reset link is on its way.', '如该邮箱已注册，重置链接已发出。'); renderGate(); })
      .catch(function(err){ a.busy = false; a.err = String(err && err.message || err); renderGate(); });
  }
  if(fm.id === 'fRecover'){ STORE.setPassword(($('#aPw') || {}).value).then(function(r){ if(r.error){ S.auth.err = r.error.message; renderGate(); return; } S.recovery = false; toast(T('Password saved', '密码已保存')); STORE.boot(true); }); }
});

/* ---------------- Gantt drag ---------------- */
var DR = null;
document.addEventListener('pointerdown', function(e){
  var bar = e.target.closest && e.target.closest('.bw,.msw'); if(!bar || e.button !== 0 || !S.gm) return;
  var rec = getRec(bar.dataset.id), reg = rec && getReg(rec.reg); if(!rec || !canWrite(reg)) return; var p = planOf(reg, rec); if(!p) return;
  var hEl = e.target.closest('.hd');
  DR = {rec:rec, reg:reg, p:p, bar:bar, mode: bar.classList.contains('msw') ? 'ms' : (hEl ? hEl.dataset.h : 'm'), x0:e.clientX, y0:e.clientY, l0:parseFloat(bar.style.left) || 0, w0:parseFloat(bar.style.width) || 14, moved:false, dd:0,
    touch:e.pointerType === 'touch', armed:e.pointerType !== 'touch', pid:e.pointerId};
  /* on a touch screen a swipe scrolls: dates move only after holding the bar still for half a second */
  if(DR.touch){ var d0 = DR; d0.timer = setTimeout(function(){ if(DR !== d0) return; d0.armed = true; bar.classList.add('armed'); try{ bar.setPointerCapture(d0.pid); }catch(_){} try{ navigator.vibrate && navigator.vibrate(15); }catch(_){} }, 450); }
  else { try{ bar.setPointerCapture(e.pointerId); }catch(_){} }
});
document.addEventListener('touchmove', function(e){ if(DR && DR.touch && DR.armed && e.cancelable) e.preventDefault(); }, {passive:false});
document.addEventListener('pointermove', function(e){
  if(!DR) return; var dx = e.clientX - DR.x0;
  if(!DR.armed){ if(Math.abs(dx) > 8 || Math.abs(e.clientY - DR.y0) > 8){ clearTimeout(DR.timer); DR = null; } return; }
  if(!DR.moved && Math.abs(dx) < 4) return; DR.moved = true;
  var px = S.gm.px, dd = Math.round(dx / px), s = DR.p.s, f = DR.p.f, ns = s, nf = f; DR.dd = dd;
  if(DR.mode === 'ms' || DR.mode === 'm'){ DR.bar.style.left = (DR.l0 + dd * px) + 'px'; ns = s + dd; nf = f + dd; }
  else if(DR.mode === 'l'){ ns = Math.min(s + dd, f); DR.bar.style.left = (DR.l0 + (ns - s) * px) + 'px'; DR.bar.style.width = (DR.w0 - (ns - s) * px) + 'px'; }
  else { nf = Math.max(f + dd, s); DR.bar.style.width = (DR.w0 + (nf - f) * px) + 'px'; }
  DR.ns = ns; DR.nf = nf;
  var hint = $('#dhint'); hint.hidden = false; hint.textContent = n2d(ns) + ' → ' + n2d(nf) + '  (' + (nf - ns + 1) + 'd)'; hint.style.left = (e.clientX + 12) + 'px'; hint.style.top = (e.clientY - 30) + 'px';
});
function endDrag(e){
  if(!DR) return; var d = DR; DR = null; clearTimeout(d.timer); d.bar.classList.remove('armed'); $('#dhint').hidden = true;
  if(e && e.type === 'pointercancel'){ if(d.moved) renderMain(); return; }   /* interrupted (e.g. the page scrolled): nothing is saved */
  if(!d.moved) return; S.suppressOpen = Date.now(); S.gKeep = true;
  if(!d.dd){ renderMain(); return; }
  var ro = rolesOf(d.reg), o = {}; if(ro.start) o[ro.start] = n2d(d.ns); if(ro.finish) o[ro.finish] = n2d(d.nf);
  setRec(d.rec, o);
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

/* ---------------- board drag & drop ---------------- */
document.addEventListener('dragstart', function(e){ var c = e.target.closest && e.target.closest('[data-drag]'); if(!c) return; e.dataTransfer.setData('text/plain', c.dataset.drag); e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging'); });
document.addEventListener('dragend', function(e){ $$('.dragging').forEach(function(x){ x.classList.remove('dragging'); }); $$('.bcol.over').forEach(function(x){ x.classList.remove('over'); }); });
document.addEventListener('dragover', function(e){ var col = e.target.closest && e.target.closest('.bcol'); if(!col) return; e.preventDefault(); $$('.bcol.over').forEach(function(x){ if(x !== col) x.classList.remove('over'); }); col.classList.add('over'); });
document.addEventListener('drop', function(e){ var col = e.target.closest && e.target.closest('.bcol'); if(!col) return; e.preventDefault(); col.classList.remove('over'); var id = e.dataTransfer.getData('text/plain'), rec = getRec(id); if(!rec) return; S.suppressOpen = Date.now(); setRec(rec, mk(col.dataset.k, col.dataset.drop)); });

/* ---------------- start ---------------- */
window.addEventListener('resize', function(){ clearTimeout(window.__rz); window.__rz = setTimeout(function(){ if(S.page === 'reg' || S.page === 'schedule') renderMain(); }, 200); });
(function boot(){
  var C = window.WW_CONFIG || {}, sm = /^#s=([A-Za-z0-9_-]{20,64})$/.exec(location.hash || '');
  if(sm){ startPublic(sm[1], C); window.__ww = {S:S, get STORE(){ return STORE; }}; return; }   // a public link: read-only page, no sign-in
  if(C.supabaseUrl && C.supabaseKey && window.supabase){ STORE = CloudStore(C.supabaseUrl, C.supabaseKey); renderAll(); STORE.init(); }
  else { STORE = DemoStore(); renderAll(); }
  window.__ww = {S:S, get STORE(){ return STORE; }};
})();
