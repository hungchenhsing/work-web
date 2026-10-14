/* work-web v2.5 · document library and typed two-way links.
   Documents: every uploaded file from a team register becomes its own record in the hidden "Documents" register
   (no., title, document no., revision, discipline, status, file + earlier revisions), so one file can be linked to many
   items and to other documents. Records of private ("Only me") registers keep their files as plain attachments.
   Links: any record (item, document, meeting, presentation) stores outgoing links in d.rel = [{to, t}]; the reverse side
   is computed, so both ends show the link. Link fields of registers are shown the same way. */
'use strict';

var LIB_REG = 'reg_lib';
UI_ICONS.upload = '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>';
UI_ICONS.grid = UI_ICONS.grid || '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>';
UI_ICONS.list = '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>';
UI_ICONS.dl = '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>';
UI_ICONS.ext = '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>';

/* ---------------- the library register ---------------- */
function libReg(){ return getReg(LIB_REG) || ((STORE && STORE.regs) || []).filter(function(r){ return r.d.kind === 'library'; })[0] || null; }
function isLibRec(r){ var g = libReg(); return !!(r && g && r.reg === g.id); }
function libDocs(){ var g = libReg(); return g ? recsOf(g.id) : []; }
/* library fields an Owner-mode presentation may show (files and remarks stay internal) */
var LIB_OWNER_KEYS = ['no', 'title', 'titleZh', 'docNo', 'rev', 'disc', 'status', 'date'];
var LIB_ST = [O('info', 'For information', '仅供参考', 'blue'), O('draft', 'Draft', '草稿', 'grey'), O('review', 'For review', '待审', 'amber'), O('approved', 'Approved', '已批准', 'green', {done:true}), O('super', 'Superseded', '已作废', 'red')];
function ensureLibReg(){
  if(libReg()) return Promise.resolve(libReg());
  if(!canTeamEdit()) return Promise.reject(new Error('permission'));
  var r = {id:LIB_REG, vis:'team', d:{kind:'library', en:'Documents', zh:'文件库', icon:'doc', color:'teal', sec:'other', prefix:'D', view:'table',
    fields:[F('no', 'No.', '编号', 'text'), F('title', 'Title', '名称', 'text'), F('titleZh', 'Title (中文)', '名称（中文）', 'text'), F('docNo', 'Document No.', '文件编号', 'text'), F('rev', 'Revision', '版本', 'text'),
      F('disc', 'Discipline', '专业', 'select', {list:'disc'}), F('status', 'Status', '状态', 'select', {opts:LIB_ST}), F('date', 'Date', '日期', 'date'), F('files', 'File & earlier revisions', '文件与历史版本', 'files'), F('remarks', 'Remarks', '备注', 'long')],
    roles:{no:'no', title:'title', title2:'titleZh', status:'status'}}};
  return STORE.createReg(r).then(function(){ return libReg(); });
}
/* where an upload from a record goes: team registers → the library; private registers, presentations → attachment */
function libShow(reg){ return !!reg && !isPrivate(reg) && ['library', 'decks', 'snaps'].indexOf(reg.d.kind) < 0; }
function libRoute(reg){ return libShow(reg) && canTeamEdit(); }
function curFile(doc){ var fl = asArr(doc && doc.d.files); return fl.length ? fl[fl.length - 1] : null; }
function isImg(x){ return !!x && /^image\//.test(x.type || ''); }
function isPdf(x){ return !!x && (/pdf/.test(x.type || '') || /\.pdf$/i.test(x.name || '')); }
function extOf(x){ var m = /\.([a-z0-9]{1,5})$/i.exec((x && x.name) || ''); return m ? m[1].toUpperCase() : 'FILE'; }
function docTitle(doc){ return recTitle(libReg(), doc) || ((curFile(doc) || {}).name) || T('Untitled document', '未命名文件'); }
function stripExt(n){ return String(n || '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' ').trim(); }

/* upload files as new library documents; optionally link them from a record */
function uploadDocs(files, o){
  o = o || {}; files = Array.prototype.slice.call(files || []).filter(function(f){ if(f.size > 50 * 1024 * 1024){ toast(T('Over 50 MB: ', '超过 50 MB：') + f.name); return false; } return true; });
  if(!files.length) return Promise.resolve([]);
  S.uploading = true; renderDrawer(); toast(T('Uploading ' + files.length + ' file(s)…', '正在上传 ' + files.length + ' 个文件…'));
  return ensureLibReg().then(function(lib){
    var first = nextNo(lib), m = /^(.*-)(\d+)$/.exec(first), base = m ? +m[2] : 1, pre = m ? m[1] : 'D-';
    var who = (STORE.me && (STORE.me.name || STORE.me.email)) || '', today = n2d(TODAY);
    return Promise.all(files.map(function(f, i){ var id = uid('r'); return STORE.upload(f, lib.id, id).then(function(up){ up.at = new Date().toISOString(); up.by = who;
      return {id:id, reg:lib.id, d:{no:pre + String(base + i).padStart(3, '0'), title:stripExt(f.name), date:today, status:'info', disc:o.disc || '', files:[up]}}; }).catch(function(e){ toast(errText(e)); return null; }); }))
      .then(function(docs){ docs = docs.filter(Boolean); if(!docs.length) return []; return STORE.createRecs(docs).then(function(){ return docs.map(function(x){ return x.id; }); }); });
  }).then(function(ids){
    S.uploading = false;
    var src = o.link && getRec(o.link.id); if(src && ids.length) return addRels(src, ids, o.t || 'rel').then(function(){ toast(T(ids.length + ' file(s) added to the library and linked', ids.length + ' 个文件已加入文件库并关联')); return ids; });
    if(ids.length) toast(T(ids.length + ' file(s) added to the library', ids.length + ' 个文件已加入文件库')); renderAll(); return ids;
  }).catch(function(e){ S.uploading = false; renderDrawer(); toast(errText(e)); return []; });
}
function uploadRevision(doc, file){
  if(!doc || !file || !canWrite(getReg(doc.reg))) return;
  toast(T('Uploading the new revision…', '正在上传新版本…'));
  STORE.upload(file, doc.reg, doc.id).then(function(up){ up.at = new Date().toISOString(); up.by = (STORE.me && (STORE.me.name || STORE.me.email)) || ''; var cur = getRec(doc.id); return setRec(cur, {files:asArr(cur.d.files).concat([up])}, {silent:true}); })
    .then(function(){ toast(T('New revision uploaded — update the Revision field if needed', '新版本已上传，如有需要请更新「版本」')); }).catch(function(e){ toast(errText(e)); });
}

/* ---------------- typed two-way links ---------------- */
var REL_T = {rel:['Related', '相关', 'Related', '相关'], ref:['References', '引用', 'Referenced by', '被引用'], sup:['Supersedes', '取代', 'Superseded by', '被取代'], ans:['Responds to', '回复', 'Answered by', '被回复'], evi:['Evidence for', '作为证据', 'Evidence', '证据']};
var REL_ORDER = ['rel', 'ref', 'sup', 'ans', 'evi'];
/* id → [{id, t, dir:'out'|'in', host (record that stores it), field?}] for every record, built once per data change */
function relIndex(){
  return memo('rel', function(){
    var m = new Map(); function add(id, e){ var a = m.get(id); if(!a){ a = []; m.set(id, a); } a.push(e); }
    allRecs().forEach(function(r){
      asArr(r.d.rel).forEach(function(x){ if(!x || !x.to || x.to === r.id) return; var t = REL_T[x.t] ? x.t : 'rel'; add(r.id, {id:x.to, t:t, dir:'out', host:r.id}); add(x.to, {id:r.id, t:t, dir:'in', host:r.id}); });
      var reg = getReg(r.reg); if(!reg) return;
      dataFields(reg).forEach(function(f){ if(f.type !== 'link') return; asArr(r.d[f.key]).forEach(function(id){ if(!id || id === r.id) return; add(r.id, {id:id, t:'rel', dir:'out', host:r.id, field:f}); add(id, {id:r.id, t:'rel', dir:'in', host:r.id, field:f}); }); });
    });
    return m;
  });
}
function relsOf(rec){ if(!rec) return []; var seen = {}; return (relIndex().get(rec.id) || []).filter(function(e){ var k = e.id + e.t + e.dir + (e.field ? e.field.key : ''); if(seen[k]) return false; seen[k] = 1; return true; }); }
function relCount(rec){ return relsOf(rec).filter(function(e){ return getRec(e.id); }).length; }
function relLabel(e){ if(e.field) return e.dir === 'out' ? T1(e.field.en, e.field.zh) : T1('Linked here from “' + e.field.en + '”', '在「' + (e.field.zh || e.field.en) + '」中关联了此项'); var t = REL_T[e.t] || REL_T.rel; return e.dir === 'in' ? T1(t[2], t[3]) : T1(t[0], t[1]); }
function addRels(src, ids, t){
  var reg = getReg(src.reg); if(!canWrite(reg)){ toast(T('You cannot change this record.', '你不能修改此记录。')); return Promise.resolve(); }
  t = REL_T[t] ? t : 'rel'; var cur = asArr(src.d.rel).slice(), n = 0;
  ids.forEach(function(id){ if(!id || id === src.id || cur.some(function(x){ return x.to === id && (x.t || 'rel') === t; })) return; cur.push({to:id, t:t}); n++; });
  return n ? setRec(src, {rel:cur}, {silent:true}) : Promise.resolve();
}
function canUnlink(e){ var host = getRec(e.host); return !!host && canWrite(getReg(host.reg)); }
function removeRel(rec, e){
  var host = getRec(e.host); if(!host || !canWrite(getReg(host.reg))) return Promise.resolve();
  var other = e.dir === 'out' ? e.id : rec.id;
  if(e.field) return setRec(host, mk(e.field.key, asArr(host.d[e.field.key]).filter(function(x){ return x !== other; })), {silent:true});
  return setRec(host, {rel:asArr(host.d.rel).filter(function(x){ return !(x.to === other && (REL_T[x.t] ? x.t : 'rel') === e.t); })}, {silent:true});
}
/* every file that belongs to a record: its own attachments + the current file of each linked library document */
function recFiles(rec){
  var out = [], reg = rec && getReg(rec.reg); if(!reg) return out;
  dataFields(reg).forEach(function(f){ if(f.type === 'files') asArr(rec.d[f.key]).forEach(function(x){ out.push({x:x, f:f, doc:null}); }); });
  if(!isLibRec(rec)) relsOf(rec).forEach(function(e){ var d = getRec(e.id); if(d && isLibRec(d)){ var x = curFile(d); if(x && !out.some(function(o){ return o.x.path === x.path; })) out.push({x:x, f:{en:docTitle(d), zh:docTitle(d)}, doc:d}); } });
  return out;
}

/* ---------------- pieces shown in a record ---------------- */
function docsOf(rec){ var seen = {}; return relsOf(rec).map(function(e){ return getRec(e.id); }).filter(function(d){ if(!d || !isLibRec(d) || seen[d.id]) return false; seen[d.id] = 1; return true; }); }
/* the documents linked to a record, as thumbnails, with add / take photo / link buttons */
function docGridHtml(rec, ed){
  var docs = docsOf(rec);
  return '<div class="files">' + docs.map(function(d){ var x = curFile(d), u = x && isImg(x) ? STORE.fileUrl(x.path) : null; return '<div class="fitem">' + (u ? '<button type="button" class="fimg" data-act="viewFile" data-v="' + esc(d.id) + '"><img src="' + esc(u) + '" alt="" loading="lazy"></button>' : '<button type="button" class="fdoc" data-act="openRec" data-id="' + esc(d.id) + '"><b class="rext">' + esc(x ? extOf(x) : 'DOC') + '</b></button>') + '<div class="fname" title="' + esc(docTitle(d)) + '"><button type="button" class="lnk" data-act="openRec" data-id="' + esc(d.id) + '">' + esc(docTitle(d)) + '</button></div></div>'; }).join('') + (docs.length ? '' : '<div class="note">' + L('No files yet', '还没有文件') + '</div>') + '</div>' +
    (ed ? '<div class="fbtns"><label class="btn sm">' + uic('plus', 13) + ' ' + L('Add files', '添加文件') + '<input type="file" multiple hidden data-relup="' + esc(rec.id) + '"></label><label class="btn sm">' + uic('camera', 13) + ' ' + L('Take photo', '拍照') + '<input type="file" accept="image/*" capture="environment" hidden data-relup="' + esc(rec.id) + '"></label><button type="button" class="btn sm" data-act="linkOpen" data-id="' + esc(rec.id) + '">' + uic('link', 13) + ' ' + L('Link existing…', '关联已有文件…') + '</button>' + (S.uploading ? '<span class="note">' + L('Uploading…', '上传中…') + '</span>' : '') + '</div>' : '');
}
function recIcon(r){ if(isDeckRec(r)) return uic('present', 13); var g = getReg(r.reg); return g ? icon(g.d.icon, 13) : ''; }
function relItem(rec, e, ed){
  var o = getRec(e.id);
  if(!o) return '<div class="rli muted">' + L('A record you cannot see (private or deleted)', '无法查看的记录（私有或已删除）') + '</div>';
  var g = getReg(o.reg), lib = isLibRec(o), x = lib ? curFile(o) : null, u = x && isImg(x) ? STORE.fileUrl(x.path) : null, st = statusOpt(g, o);
  return '<div class="rli">' + (lib ? '<span class="rlth">' + (u ? '<img src="' + esc(u) + '" alt="" loading="lazy">' : '<b>' + esc(x ? extOf(x) : 'DOC') + '</b>') + '</span>' : '<span class="rlic">' + recIcon(o) + '</span>') +
    '<button type="button" class="lnk rlt" data-act="openRec" data-id="' + esc(o.id) + '"><span class="mono">' + esc(recNo(g, o)) + '</span> ' + esc(lib ? docTitle(o) : (isDeckRec(o) ? deckTitle(o.d) : recTitle(g, o) || '—')) + '</button>' +
    (st ? optChip(st) : '') + '<span class="rlreg">' + esc(isDeckRec(o) ? T('Presentation', '演示文稿') : regName(g)) + '</span>' +
    (lib && x ? '<button type="button" class="ib" data-act="viewFile" data-v="' + esc(o.id) + '" title="' + esc(T('Preview', '预览')) + '">' + uic('eye', 14) + '</button>' : '') +
    (ed && canUnlink(e) ? '<button type="button" class="ib" data-act="relDel" data-v="' + esc(JSON.stringify({id:e.id, t:e.t, dir:e.dir, host:e.host, f:e.field ? e.field.key : ''})) + '" title="' + esc(T('Remove link', '取消关联')) + '">' + uic('x', 13) + '</button>' : '') + '</div>';
}
/* all links of a record, grouped by kind of link */
function relatedPanel(rec, ed){
  var es = relsOf(rec), groups = {}, order = [];
  es.forEach(function(e){ var k = relLabel(e); if(!groups[k]){ groups[k] = []; order.push(k); } groups[k].push(e); });
  var h = '<div class="relp">' + (ed ? '<div class="row relbar"><button type="button" class="btn sm pri" data-act="linkOpen" data-id="' + esc(rec.id) + '">' + uic('link', 13) + ' ' + L('Link…', '关联…') + '</button>' + (libRoute(getReg(rec.reg)) || isLibRec(rec) ? '<label class="btn sm">' + uic('upload', 13) + ' ' + L('Upload & link files', '上传并关联文件') + '<input type="file" multiple hidden data-relup="' + esc(rec.id) + '"></label>' : '') + '<span class="note">' + L('Links work both ways: the other record shows this one too. You can also drop files here.', '关联是双向的：对方记录也会显示此项。也可以把文件拖到这里。') + '</span></div>' : '');
  if(!es.length) return h + '<div class="note">' + L('Nothing linked yet.', '还没有关联。') + '</div></div>';
  return h + order.map(function(k){ return '<h3 class="fsec">' + esc(k) + ' <span class="cnt">' + groups[k].length + '</span></h3>' + groups[k].map(function(e){ return relItem(rec, e, ed); }).join(''); }).join('') + '</div>';
}
/* compact strip at the top of a record's details */
function relStrip(rec, ed){
  var es = relsOf(rec).filter(function(e){ return getRec(e.id); });
  if(!es.length && !ed) return '';
  return '<div class="rels">' + es.slice(0, 8).map(function(e){ var o = getRec(e.id), lib = isLibRec(o), x = lib ? curFile(o) : null, u = x && isImg(x) ? STORE.fileUrl(x.path) : null, g = getReg(o.reg);
      return '<button type="button" class="rchip" data-act="openRec" data-id="' + esc(o.id) + '" title="' + esc(relLabel(e) + ' · ' + recLabel(o)) + '">' + (u ? '<img src="' + esc(u) + '" alt="">' : lib ? '<b class="rext">' + esc(x ? extOf(x) : 'DOC') + '</b>' : recIcon(o)) + '<span>' + esc(lib ? docTitle(o) : recNo(g, o) || recTitle(g, o) || (isDeckRec(o) ? o.d.no : '')) + '</span>' + (e.t !== 'rel' ? '<i>' + esc(relLabel(e)) + '</i>' : '') + '</button>'; }).join('') +
    (es.length > 8 ? '<button type="button" class="rchip more" data-act="dtab" data-v="links">+' + (es.length - 8) + '</button>' : '') +
    (ed ? '<button type="button" class="rchip add" data-act="linkOpen" data-id="' + esc(rec.id) + '">' + uic('plus', 12) + ' ' + L('Link', '关联') + '</button>' : '') + '</div>';
}
/* a library document: preview, revisions */
function docPreview(doc, ed){
  var fl = asArr(doc.d.files), x = curFile(doc), u = x ? STORE.fileUrl(x.path) : null;
  var pv = !x ? '<div class="dpv empty">' + L('No file yet', '还没有文件') + '</div>' : isImg(x) ? '<button type="button" class="dpv img" data-act="viewFile" data-v="' + esc(doc.id) + '">' + (u ? '<img src="' + esc(u) + '" alt="">' : '<span class="note">…</span>') + '</button>' :
    '<div class="dpv file"><b class="dext">' + esc(extOf(x)) + '</b><div><div class="dname">' + esc(x.name) + '</div><div class="note">' + esc(fmtSize(x.size)) + '</div></div><div class="row">' + (isPdf(x) ? '<button type="button" class="btn sm pri" data-act="viewFile" data-v="' + esc(doc.id) + '">' + uic('eye', 13) + ' ' + L('Preview', '预览') + '</button>' : '') + (u ? '<a class="btn sm" href="' + esc(u) + '" target="_blank" rel="noopener" download="' + esc(x.name) + '">' + uic('dl', 13) + ' ' + L('Download', '下载') + '</a>' : '') + '</div></div>';
  var revs = fl.slice().reverse().map(function(f, i){ var uu = STORE.fileUrl(f.path); return '<div class="rev' + (i === 0 ? ' cur' : '') + '"><span class="mono">' + (i === 0 ? L('Current', '当前') : L('Earlier', '旧版') + ' ' + (fl.length - i)) + '</span><span class="rvn">' + esc(f.name) + '</span><span class="muted">' + esc(fmtTime(f.at || '')) + (f.by ? ' · ' + esc(f.by) : '') + '</span>' + (uu ? '<a class="ib" href="' + esc(uu) + '" target="_blank" rel="noopener" title="' + esc(T('Open', '打开')) + '">' + uic('ext', 13) + '</a>' : '') + '</div>'; }).join('');
  return '<div class="docv">' + pv + '<div class="revs"><div class="revh"><b>' + L('Revisions', '版本') + '</b> <span class="cnt">' + fl.length + '</span>' + (ed ? '<label class="btn sm">' + uic('upload', 13) + ' ' + L('Upload new revision', '上传新版本') + '<input type="file" hidden data-librev="' + esc(doc.id) + '"></label>' : '') + '</div>' + (revs || '<div class="note">' + L('None', '无') + '</div>') + '</div></div>';
}
function fmtSize(n){ n = +n || 0; return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? Math.round(n / 1024) + ' KB' : n + ' B'; }

/* ---------------- file viewer (images and PDFs, full screen) ---------------- */
function openViewer(x, title){
  if(!x) return; var u = x.src || (x.path ? STORE.fileUrl(x.path) : null);
  if(!u){ if(!x.path) return; toast(T('Getting the file…', '正在获取文件…')); setTimeout(function(){ if(STORE.fileUrl(x.path)) openViewer(x, title); }, 900); return; }
  var r = $('#pv-root'); if(!r){ r = document.createElement('div'); r.id = 'pv-root'; document.body.appendChild(r); }
  r.innerHTML = '<div class="pv" role="dialog" aria-modal="true" aria-label="' + esc(title || x.name) + '"><div class="pvbar"><b>' + esc(title || x.name) + '</b><span class="muted">' + esc(x.name) + '</span><span style="flex:1"></span><a class="btn sm" href="' + esc(u) + '" target="_blank" rel="noopener" download="' + esc(x.name) + '">' + uic('dl', 13) + ' ' + L('Download', '下载') + '</a><button type="button" class="btn sm" data-act="pvClose">' + L('Close (Esc)', '关闭 (Esc)') + '</button></div><div class="pvb">' +
    (isImg(x) ? '<img src="' + esc(u) + '" alt="">' : isPdf(x) ? '<iframe src="' + esc(u) + '" title="' + esc(x.name) + '"></iframe>' : '<div class="card empty">' + L('This file type cannot be previewed here. Use Download.', '此类文件无法在此预览，请下载查看。') + '</div>') + '</div></div>';
  S.viewer = true;
}
function closeViewer(){ var r = $('#pv-root'); if(r) r.innerHTML = ''; S.viewer = false; }
document.addEventListener('keydown', function(e){ if(S.viewer && e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); closeViewer(); } }, true);

/* ---------------- link picker ---------------- */
function linkCands(m){
  var src = getRec(m.rec), q = (m.q || '').trim().toLowerCase(), have = {}, out = [];
  if(src) relsOf(src).forEach(function(e){ if(e.dir === 'out' && e.t === (m.t || 'rel')) have[e.id] = 1; });
  var regs = allRegs().concat(libReg() ? [libReg()] : []).concat(deckReg() ? [deckReg()] : []);
  regs.forEach(function(g){ if(m.reg && m.reg !== g.id) return; recsOf(g.id).forEach(function(r){ if(src && r.id === src.id) return;
    var lib = isLibRec(r), x = lib ? curFile(r) : null, t = (recNo(g, r) + ' ' + (g.d.kind === 'decks' ? (r.d.title || '') + ' ' + (r.d.titleZh || '') : (r.d[rolesOf(g).title] || '') + ' ' + (r.d[rolesOf(g).title2] || '')) + ' ' + (r.d.docNo || '') + ' ' + (x ? x.name : '')).toLowerCase();
    if(q && t.indexOf(q) < 0) return; out.push({r:r, g:g, s:q ? (t.indexOf(q) === 0 ? 0 : 1) : 0, ua:r.ua || ''}); }); });
  out.sort(function(a, b){ return a.s - b.s || String(b.ua).localeCompare(String(a.ua)); });
  return {list:out.slice(0, 80), total:out.length, have:have};
}
function linkPickModal(m){
  var src = getRec(m.rec); if(!src) return {title:'', html:''};
  m.sel = m.sel || {}; var c = linkCands(m), regs = allRegs().concat(libReg() ? [libReg()] : []), nsel = Object.keys(m.sel).filter(function(k){ return m.sel[k]; }).length;
  var h = '<p class="note" style="margin-top:0">' + L('Link ', '把 ') + '<b>' + esc(recLabel(src)) + '</b>' + L(' to other items, documents, meetings or presentations. Both sides will show the link.', ' 关联到其他事项、文件、会议或演示文稿，双方都会显示。') + '</p>' +
    '<div class="row lpf"><label class="search" style="flex:1 1 240px">' + uic('search', 15) + '<input id="lpq" type="search" data-fk="lpq" placeholder="' + esc(T('Search number, title, document no. or file name', '搜索编号、名称、文件编号或文件名')) + '" value="' + esc(m.q || '') + '" autocomplete="off"></label>' +
    '<select class="in" id="lpreg" style="width:auto"><option value="">' + esc(T('Everything', '全部')) + '</option>' + regs.map(function(g){ return '<option value="' + esc(g.id) + '"' + (m.reg === g.id ? ' selected' : '') + '>' + esc(regName(g)) + '</option>'; }).join('') + (deckReg() ? '<option value="' + esc(deckReg().id) + '"' + (m.reg === deckReg().id ? ' selected' : '') + '>' + esc(T('Presentations', '演示文稿')) + '</option>' : '') + '</select></div>' +
    '<div class="lpl">' + (c.list.length ? c.list.map(function(it){ var r = it.r, g = it.g, lib = isLibRec(r), x = lib ? curFile(r) : null, u = x && isImg(x) ? STORE.fileUrl(x.path) : null, had = c.have[r.id], on = !!m.sel[r.id], st = statusOpt(g, r);
      return '<label class="lpi' + (had ? ' had' : '') + (on ? ' on' : '') + '"><input type="checkbox" data-lpsel="' + esc(r.id) + '"' + (on || had ? ' checked' : '') + (had ? ' disabled' : '') + '>' + (lib ? '<span class="rlth">' + (u ? '<img src="' + esc(u) + '" alt="" loading="lazy">' : '<b>' + esc(x ? extOf(x) : 'DOC') + '</b>') + '</span>' : '<span class="rlic">' + recIcon(r) + '</span>') +
        '<span class="lpt"><span class="mono">' + esc(recNo(g, r)) + '</span> ' + esc(lib ? docTitle(r) : isDeckRec(r) ? deckTitle(r.d) : recTitle(g, r) || '—') + (lib && r.d.docNo ? ' <span class="muted mono">' + esc(r.d.docNo) + (r.d.rev ? ' · ' + esc(r.d.rev) : '') + '</span>' : '') + '</span>' + (st ? optChip(st) : '') + '<span class="rlreg">' + esc(isDeckRec(r) ? T('Presentation', '演示文稿') : regName(g)) + '</span>' + (had ? '<span class="note">' + L('linked', '已关联') + '</span>' : '') + '</label>'; }).join('') + (c.total > c.list.length ? '<div class="note" style="padding:8px">' + L('Showing 80 of ' + c.total + ' — type to narrow down.', '显示 80 / ' + c.total + ' 项，请输入关键字缩小范围。') + '</div>' : '') : '<div class="note" style="padding:12px">' + L('Nothing found.', '没有找到。') + '</div>') + '</div>';
  return {title:L('Link', '关联'), wide:true, html:h,
    foot:'<label class="fl row" style="margin-right:auto">' + L('Kind of link', '关联类型') + '<select class="in" id="lpt" style="width:auto">' + REL_ORDER.map(function(t){ return '<option value="' + t + '"' + ((m.t || 'rel') === t ? ' selected' : '') + '>' + esc(T1(REL_T[t][0], REL_T[t][1])) + (t !== 'rel' ? ' → ' + esc(T1(REL_T[t][2], REL_T[t][3])) : '') + '</option>'; }).join('') + '</select></label>' +
      (libRoute(getReg(src.reg)) || isLibRec(src) ? '<label class="btn">' + uic('upload', 14) + ' ' + L('Upload new…', '上传新文件…') + '<input type="file" multiple hidden data-lpup="1"></label>' : '') +
      '<button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button><button type="button" class="btn pri" data-act="lpGo"' + (nsel ? '' : ' disabled') + '>' + L('Link ' + (nsel || ''), '关联 ' + (nsel || '')) + '</button>'};
}
DECK_MODALS.linkPick = linkPickModal;

/* ---------------- moving existing attachments into the library ---------------- */
function attachments(){ var out = []; allRegs().forEach(function(reg){ if(!libRoute(reg)) return; var ff = dataFields(reg).filter(function(f){ return f.type === 'files'; }); if(!ff.length) return; recsOf(reg.id).forEach(function(r){ ff.forEach(function(f){ asArr(r.d[f.key]).forEach(function(x){ out.push({reg:reg, r:r, f:f, x:x}); }); }); }); }); return out; }
async function migrateAttachments(){
  var all = attachments(); if(!all.length) return;
  if(!confirm(T('Move ' + all.length + ' file(s) from records of team registers into the library? Each file becomes a document linked to its record. Files of “Only me” registers stay where they are.', '把团队台账记录中的 ' + all.length + ' 个文件移入文件库？每个文件会成为一个文件，并与原记录关联。「仅自己可见」台账的文件不动。'))) return;
  var lib = await ensureLibReg();
  /* safe to repeat: a file already in the library (same storage path) is not created twice */
  var have = {}; libDocs().forEach(function(d){ asArr(d.d.files).forEach(function(x){ have[x.path] = d.id; }); });
  var first = nextNo(lib), m = /^(.*-)(\d+)$/.exec(first), base = m ? +m[2] : 1, pre = m ? m[1] : 'D-', docs = [], plan = [];
  all.forEach(function(a){ var id = have[a.x.path]; if(!id){ id = uid('r'); have[a.x.path] = id; docs.push({id:id, reg:lib.id, d:{no:pre + String(base + docs.length).padStart(3, '0'), title:stripExt(a.x.name), date:String(a.x.at || a.r.ua || '').slice(0, 10) || n2d(TODAY), status:'info', files:[a.x]}}); } plan.push({rec:a.r.id, key:a.f.key, path:a.x.path, doc:id}); });
  toast(T('Moving ' + all.length + ' file(s)…', '正在移动 ' + all.length + ' 个文件…'));
  if(docs.length) await STORE.createRecs(docs);
  /* per record: link the documents that now exist and remove exactly those files (anything added meanwhile stays) */
  var byRec = {}, failed = 0, moved = 0; plan.forEach(function(x){ if(!getRec(x.doc)){ failed++; return; } (byRec[x.rec] = byRec[x.rec] || []).push(x); });
  var ids = Object.keys(byRec);
  for(var i = 0; i < ids.length; i++){ var cur = getRec(ids[i]); if(!cur) continue; var xs = byRec[ids[i]], gone = {}, p = {}, rel = asArr(cur.d.rel).slice();
    xs.forEach(function(x){ gone[x.path] = 1; if(!rel.some(function(q){ return q.to === x.doc; })) rel.push({to:x.doc, t:'rel'}); });
    p.rel = rel; xs.forEach(function(x){ p[x.key] = asArr(cur.d[x.key]).filter(function(f){ return !gone[f.path]; }); });
    try{ await STORE.patchRec(cur.id, p); moved += xs.length; }catch(e){ failed += xs.length; } }
  toast(failed ? T(moved + ' moved, ' + failed + ' not moved — try again (nothing is duplicated)', '已移动 ' + moved + ' 个，' + failed + ' 个未完成，可再试一次（不会重复）') : T(moved + ' file(s) are now in the library', moved + ' 个文件已移入文件库'));
}

/* ---------------- the library page (replaces “Files & photos”) ---------------- */
function viewFiles(){
  var q0 = S.lib = S.lib || {q:'', kind:'', disc:'', st:'', link:'', view:'grid', sort:'new'}, ed = canTeamEdit(), lib = libReg(), docs = libDocs();
  var items = docs.map(function(d){ var x = curFile(d), rs = relsOf(d).filter(function(e){ return getRec(e.id) && !isLibRec(getRec(e.id)); }); return {d:d, x:x, rs:rs}; });
  if(q0.q){ var q = q0.q.toLowerCase(); items = items.filter(function(it){ return ((it.d.d.no || '') + ' ' + (it.d.d.title || '') + ' ' + (it.d.d.titleZh || '') + ' ' + (it.d.d.docNo || '') + ' ' + (it.x ? it.x.name : '') + ' ' + it.rs.map(function(e){ return recLabel(getRec(e.id)); }).join(' ')).toLowerCase().indexOf(q) >= 0; }); }
  if(q0.kind === 'img') items = items.filter(function(it){ return isImg(it.x); }); if(q0.kind === 'doc') items = items.filter(function(it){ return !isImg(it.x); });
  if(q0.disc) items = items.filter(function(it){ return it.d.d.disc === q0.disc; }); if(q0.st) items = items.filter(function(it){ return it.d.d.status === q0.st; });
  if(q0.link === '__none') items = items.filter(function(it){ return !it.rs.length; }); else if(q0.link) items = items.filter(function(it){ return it.rs.some(function(e){ var o = getRec(e.id); return o && o.reg === q0.link; }); });
  if(q0.blk) items = items.filter(function(it){ return it.rs.some(function(e){ var o = getRec(e.id), g = o && getReg(o.reg); return g && blocksOf(g, o).indexOf(q0.blk) >= 0; }); });
  items.sort(q0.sort === 'name' ? function(a, b){ return docTitle(a.d).localeCompare(docTitle(b.d)); } : q0.sort === 'no' ? function(a, b){ return String(a.d.d.docNo || a.d.d.no || '').localeCompare(String(b.d.d.docNo || b.d.d.no || '')); } : function(a, b){ return String((b.x && b.x.at) || b.d.ua || '').localeCompare(String((a.x && a.x.at) || a.d.ua || '')); });
  var att = ed ? attachments() : [], sel = S.libSel || {}, nsel = Object.keys(sel).filter(function(k){ return sel[k] && getRec(k); }).length, lists0 = lists();
  var h = '<div class="ph libp-h"><div><h1 class="vtitle">' + L('Documents', '文件库') + '</h1><span class="muted">' + L(docs.length + ' documents · each can be linked to any number of items, meetings and other documents', '共 ' + docs.length + ' 个文件 · 每个文件都可关联到任意事项、会议和其他文件') + '</span></div><div class="pha">' +
    (ed ? '<label class="btn pri">' + uic('upload', 14) + ' ' + L('Upload', '上传') + '<input type="file" multiple hidden data-libup="1"></label>' : '') + '<div class="seg">' + [['grid', 'grid'], ['list', 'list']].map(function(v){ return '<button type="button" data-act="libView" data-v="' + v[0] + '" aria-pressed="' + (q0.view === v[0]) + '" title="' + esc(v[0] === 'grid' ? T('Grid', '网格') : T('List', '列表')) + '">' + uic(v[1], 15) + '</button>'; }).join('') + '</div></div></div>';
  if(att.length) h += '<div class="banner libmig">' + uic('file', 14) + ' ' + L(att.length + ' file(s) are still attached directly to records. Move them into the library so they can be linked, revised and reused.', '还有 ' + att.length + ' 个文件直接挂在记录上。移入文件库后即可关联、更新版本和重复使用。') + ' <button type="button" class="btn sm pri" data-act="libMigrate">' + L('Move into the library', '移入文件库') + '</button></div>';
  h += '<div class="card filters"><label class="search">' + uic('search', 15) + '<input id="libq" type="search" data-fk="libq" placeholder="' + esc(T('Title, document no., file or linked item', '名称、文件编号、文件名或关联事项')) + '" value="' + esc(q0.q || '') + '"></label>' +
    '<div class="seg">' + [['', 'All', '全部'], ['doc', 'Documents', '文档'], ['img', 'Photos', '照片']].map(function(o){ return '<button type="button" data-act="libKind" data-v="' + o[0] + '" aria-pressed="' + ((q0.kind || '') === o[0]) + '">' + L(o[1], o[2]) + '</button>'; }).join('') + '</div>' +
    '<select class="in" data-libf="disc"><option value="">' + esc(T('All disciplines', '全部专业')) + '</option>' + ((lists0.disc && lists0.disc.opts) || []).map(function(o){ return '<option value="' + esc(o.v) + '"' + (q0.disc === o.v ? ' selected' : '') + '>' + esc(nm(o)) + '</option>'; }).join('') + '</select>' +
    '<select class="in" data-libf="st"><option value="">' + esc(T('Any status', '全部状态')) + '</option>' + LIB_ST.map(function(o){ return '<option value="' + o.v + '"' + (q0.st === o.v ? ' selected' : '') + '>' + esc(nm(o)) + '</option>'; }).join('') + '</select>' +
    '<select class="in" data-libf="link"><option value="">' + esc(T('Linked to anything', '关联到任意')) + '</option><option value="__none"' + (q0.link === '__none' ? ' selected' : '') + '>' + esc(T('Not linked to anything', '未关联任何事项')) + '</option>' + allRegs().map(function(g){ return '<option value="' + esc(g.id) + '"' + (q0.link === g.id ? ' selected' : '') + '>' + esc(T('Linked to ', '关联到 ') + regName(g)) + '</option>'; }).join('') + '</select>' +
    '<select class="in" data-libf="sort">' + [['new', 'Newest first', '最新优先'], ['name', 'Title A–Z', '按名称'], ['no', 'Document no.', '按文件编号']].map(function(o){ return '<option value="' + o[0] + '"' + (q0.sort === o[0] ? ' selected' : '') + '>' + esc(T(o[1], o[2])) + '</option>'; }).join('') + '</select>' +
    '<div class="fchips">' + lists0.blocks.opts.map(function(o){ return '<button type="button" class="fchip" data-act="libBlk" data-v="' + esc(o.v) + '" aria-pressed="' + (q0.blk === o.v) + '">' + esc(o.v) + '</button>'; }).join('') + '</div></div>';
  if(nsel && ed) h += '<div class="bulk"><b>' + L(nsel + ' selected', '已选 ' + nsel) + '</b><button type="button" class="btn sm" data-act="libLinkTo">' + uic('link', 13) + ' ' + L('Link to an item…', '关联到事项…') + '</button><select class="in" id="libBulkSt" style="width:auto"><option value="">' + esc(T('Set status…', '设置状态…')) + '</option>' + LIB_ST.map(function(o){ return '<option value="' + o.v + '">' + esc(nm(o)) + '</option>'; }).join('') + '</select><button type="button" class="btn sm" data-act="libExt" data-v="1">' + L('Show in Owner plan', '显示于业主计划') + '</button><button type="button" class="btn sm" data-act="libExt" data-v="0">' + L('Remove from Owner plan', '移出业主计划') + '</button>' + (S.libDel ? '<button type="button" class="btn sm danger" data-act="libDelYes">' + L('Confirm delete ' + nsel, '确认删除 ' + nsel + ' 项') + '</button>' : '<button type="button" class="btn sm danger-o" data-act="libDel">' + L('Delete', '删除') + '</button>') + '<button type="button" class="btn sm" data-act="libSelClear">' + L('Clear selection', '取消选择') + '</button></div>';
  if(!docs.length) return h + '<div class="card empty libdrop">' + uic('upload', 28) + '<p>' + L('No documents yet. Drop files here or use Upload. Files you add to records of team registers also land here.', '还没有文件。把文件拖到这里或点「上传」。在团队台账记录里添加的文件也会出现在这里。') + '</p></div>';
  if(!items.length) return h + '<div class="card empty">' + L('No documents match the filters.', '没有符合筛选条件的文件。') + '</div>';
  var shown = items.slice(0, S.libMore ? 100000 : 240), more = items.length - shown.length;
  if(q0.view === 'list') h += '<div class="card tbl-wrap libdrop"><table class="tbl libt"><thead><tr>' + (ed ? '<th class="sel"></th>' : '') + '<th></th><th>' + L('No.', '编号') + '</th><th>' + L('Title', '名称') + '</th><th>' + L('Document No.', '文件编号') + '</th><th>' + L('Rev.', '版本') + '</th><th>' + L('Discipline', '专业') + '</th><th>' + L('Status', '状态') + '</th><th>' + L('Linked to', '关联到') + '</th><th>' + L('Updated', '更新') + '</th></tr></thead><tbody>' +
    shown.map(function(it){ var d = it.d, x = it.x, u = x && isImg(x) ? STORE.fileUrl(x.path) : null, st = optOf({opts:LIB_ST}, d.d.status), dc = d.d.disc && optOf({list:'disc'}, d.d.disc);
      return '<tr>' + (ed ? '<td class="sel"><input type="checkbox" class="libsel" data-id="' + esc(d.id) + '"' + (sel[d.id] ? ' checked' : '') + '></td>' : '') + '<td class="lthc"><span class="rlth">' + (u ? '<img src="' + esc(u) + '" alt="" loading="lazy">' : '<b>' + esc(x ? extOf(x) : '—') + '</b>') + '</span></td><td class="mono"><button type="button" class="lnk mono" data-act="openRec" data-id="' + esc(d.id) + '">' + esc(d.d.no || '') + '</button></td><td>' + esc(docTitle(d)) + '</td><td class="mono">' + esc(d.d.docNo || '') + '</td><td class="mono">' + esc(d.d.rev || '') + '</td><td>' + (dc ? esc(nm(dc)) : '') + '</td><td>' + (st ? optChip(st) : '') + '</td><td>' + it.rs.slice(0, 2).map(function(e){ var o = getRec(e.id); return '<button type="button" class="lnk" data-act="openRec" data-id="' + esc(o.id) + '">' + esc(recNo(getReg(o.reg), o) || recTitle(getReg(o.reg), o)) + '</button>'; }).join(', ') + (it.rs.length > 2 ? ' +' + (it.rs.length - 2) : '') + '</td><td class="mono muted">' + esc(String((x && x.at) || d.ua || '').slice(0, 10)) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  else h += '<div class="libg libdrop">' + shown.map(function(it){ var d = it.d, x = it.x, u = x && isImg(x) ? STORE.fileUrl(x.path) : null, st = optOf({opts:LIB_ST}, d.d.status);
      return '<div class="lc' + (sel[d.id] ? ' on' : '') + '"><button type="button" class="lcth" data-act="openRec" data-id="' + esc(d.id) + '">' + (u ? '<img src="' + esc(u) + '" alt="" loading="lazy">' : '<b class="dext">' + esc(x ? extOf(x) : '—') + '</b>') + '</button>' + (ed ? '<input type="checkbox" class="libsel" data-id="' + esc(d.id) + '"' + (sel[d.id] ? ' checked' : '') + ' aria-label="Select">' : '') +
        '<div class="lcb"><button type="button" class="lnk lct" data-act="openRec" data-id="' + esc(d.id) + '">' + esc(docTitle(d)) + '</button><span class="mono muted">' + esc([d.d.docNo, d.d.rev ? 'Rev ' + d.d.rev : '', d.d.no].filter(Boolean).join(' · ')) + '</span><span class="lcm">' + (st ? optChip(st) : '') + (it.rs.length ? '<span class="chip c-teal" title="' + esc(it.rs.map(function(e){ return recLabel(getRec(e.id)); }).join('\n')) + '">' + uic('link', 11) + ' ' + it.rs.length + '</span>' : '<span class="chip c-grey">' + L('not linked', '未关联') + '</span>') + '</span></div></div>'; }).join('') + '</div>';
  if(more > 0) h += '<button type="button" class="btn" data-act="libMore">' + L('Show ' + more + ' more', '再显示 ' + more + ' 项') + '</button>';
  return h;
}

/* ---------------- events ---------------- */
document.addEventListener('click', function(ev){
  var el = ev.target.closest && ev.target.closest('[data-act]'); if(!el) return;
  var act = el.dataset.act, v = el.dataset.v;
  switch(act){
    case 'linkOpen': closePop(); openModal({kind:'linkPick', rec:el.dataset.id || S.open, q:'', reg:'', t:'rel', sel:{}}); setTimeout(function(){ var i = $('#lpq'); if(i) i.focus(); }, 30); break;
    case 'lpGo': (function(){ var m = S.modal; if(!m) return; var src = getRec(m.rec), ids = Object.keys(m.sel || {}).filter(function(k){ return m.sel[k]; }); closeModal(); if(!src || !ids.length) return; var old = {rel:src.d.rel === undefined ? null : clone(src.d.rel)}; addRels(src, ids, m.t).then(function(){ S.lastUndo = {id:src.id, old:old}; toast(T('Linked ' + ids.length, '已关联 ' + ids.length + ' 项'), {act:'quickUndo', label:T('Undo', '撤销')}); }); })(); break;
    case 'openRecV': openRec(v); break;
    case 'openRecTab': openRec(v, 'links'); break;
    case 'relDel': (function(){ var o = JSON.parse(v), rec = getRec(S.open); if(!rec) return; var e = {id:o.id, t:o.t, dir:o.dir, host:o.host, field:o.f ? fieldOf(getReg(getRec(o.host).reg), o.f) : null}; removeRel(rec, e).then(function(){ toast(T('Link removed', '已取消关联')); }); })(); break;
    case 'viewFile': (function(){ var d = getRec(v); if(d) openViewer(curFile(d), docTitle(d)); })(); break;
    case 'pvClose': closeViewer(); break;
    case 'libView': S.lib.view = v; renderMain(); break;
    case 'libKind': S.lib.kind = v; renderMain(); break;
    case 'libBlk': S.lib.blk = S.lib.blk === v ? '' : v; renderMain(); break;
    case 'libMore': S.libMore = true; renderMain(); break;
    case 'libMigrate': migrateAttachments(); break;
    case 'libSelClear': S.libSel = {}; S.libDel = false; renderMain(); break;
    case 'libDel': S.libDel = true; renderMain(); break;
    case 'libDelYes': (function(){ var ids = Object.keys(S.libSel || {}).filter(function(k){ return S.libSel[k]; }); S.libSel = {}; S.libDel = false; Promise.all(ids.map(function(id){ return STORE.deleteRec(id).catch(function(){}); })).then(function(){ toast(T(ids.length + ' deleted — restore them from the Change log', '已删除 ' + ids.length + ' 项，可在修改记录中恢复')); }); renderMain(); })(); break;
    case 'libLinkTo': openModal({kind:'libTarget', q:'', reg:''}); break;
    case 'libExt': (function(){ var on = v === '1', ids = Object.keys(S.libSel || {}).filter(function(k){ return S.libSel[k]; }), n = 0; ids.forEach(function(id){ var d = getRec(id); if(d && !!d.d.ext !== on){ n++; setRec(d, {ext:on}, {silent:true}); } }); toast(on ? T(n + ' document(s) now shown in Owner-mode presentations', n + ' 个文件已显示于业主计划') : T(n + ' document(s) removed from the Owner plan', n + ' 个文件已移出业主计划')); })(); break;
    case 'libTargetGo': (function(){ var tgt = getRec(v), ids = Object.keys(S.libSel || {}).filter(function(k){ return S.libSel[k]; }); closeModal(); if(!tgt || !ids.length) return; addRels(tgt, ids, 'rel').then(function(){ S.libSel = {}; toast(T(ids.length + ' document(s) linked to ' + recLabel(tgt), ids.length + ' 个文件已关联到 ' + recLabel(tgt)), {act:'openRecV', v:tgt.id, label:T('Open', '打开')}); renderMain(); }); })(); break;
  }
});
/* choosing one item to link selected documents to */
DECK_MODALS.libTarget = function(m){
  var c = linkCands({rec:null, q:m.q, reg:m.reg, t:'rel'}), regs = allRegs();
  return {title:L('Link the selected documents to…', '把所选文件关联到…'), wide:true, html:'<div class="row lpf"><label class="search" style="flex:1 1 240px">' + uic('search', 15) + '<input id="ltq" type="search" data-fk="ltq" placeholder="' + esc(T('Search number or title', '搜索编号或名称')) + '" value="' + esc(m.q || '') + '" autocomplete="off"></label><select class="in" id="ltreg" style="width:auto"><option value="">' + esc(T('All registers', '全部台账')) + '</option>' + regs.map(function(g){ return '<option value="' + esc(g.id) + '"' + (m.reg === g.id ? ' selected' : '') + '>' + esc(regName(g)) + '</option>'; }).join('') + '</select></div>' +
    '<div class="lpl">' + c.list.filter(function(it){ return !isLibRec(it.r) && canWrite(it.g); }).map(function(it){ var st = statusOpt(it.g, it.r); return '<button type="button" class="lpi" data-act="libTargetGo" data-v="' + esc(it.r.id) + '"><span class="rlic">' + recIcon(it.r) + '</span><span class="lpt"><span class="mono">' + esc(recNo(it.g, it.r)) + '</span> ' + esc(isDeckRec(it.r) ? deckTitle(it.r.d) : recTitle(it.g, it.r) || '—') + '</span>' + (st ? optChip(st) : '') + '<span class="rlreg">' + esc(isDeckRec(it.r) ? T('Presentation', '演示文稿') : regName(it.g)) + '</span></button>'; }).join('') + '</div>',
    foot:'<button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button>'};
};
document.addEventListener('input', function(e){
  var el = e.target; if(!el || !el.id) return;
  if(el.id === 'lpq' && S.modal && S.modal.kind === 'linkPick'){ S.modal.q = el.value; clearTimeout(window.__lpq); window.__lpq = setTimeout(renderModal, 150); }
  if(el.id === 'ltq' && S.modal && S.modal.kind === 'libTarget'){ S.modal.q = el.value; clearTimeout(window.__ltq); window.__ltq = setTimeout(renderModal, 150); }
  if(el.id === 'libq'){ S.lib.q = el.value; clearTimeout(window.__libq); window.__libq = setTimeout(renderMain, 200); }
});
document.addEventListener('change', function(e){
  var el = e.target; if(!el || !el.dataset) return;
  if(el.dataset.lpsel && S.modal){ S.modal.sel = S.modal.sel || {}; S.modal.sel[el.dataset.lpsel] = el.checked; renderModal(); return; }
  if(el.id === 'lpreg' && S.modal){ S.modal.reg = el.value; renderModal(); return; }
  if(el.id === 'ltreg' && S.modal){ S.modal.reg = el.value; renderModal(); return; }
  if(el.id === 'lpt' && S.modal){ S.modal.t = el.value; return; }
  if(el.dataset.lpup && S.modal && el.files && el.files.length){ var src = getRec(S.modal.rec), t = S.modal.t || 'rel', fl = el.files; closeModal(); if(src) uploadDocs(fl, {link:src, t:t}); return; }
  if(el.dataset.relup && el.files && el.files.length){ var r0 = getRec(el.dataset.relup); if(r0) uploadDocs(el.files, {link:r0}); el.value = ''; return; }
  if(el.dataset.libup && el.files && el.files.length){ uploadDocs(el.files, {}); el.value = ''; return; }
  if(el.dataset.librev && el.files && el.files[0]){ uploadRevision(getRec(el.dataset.librev), el.files[0]); el.value = ''; return; }
  if(el.dataset.libf){ S.lib[el.dataset.libf] = el.value; renderMain(); return; }
  if(el.classList && el.classList.contains('libsel')){ S.libSel = S.libSel || {}; S.libSel[el.dataset.id] = el.checked; S.libDel = false; renderMain(); return; }
  if(el.id === 'libBulkSt' && el.value){ var st = el.value, ids = Object.keys(S.libSel || {}).filter(function(k){ return S.libSel[k]; }); ids.forEach(function(id){ var d = getRec(id); if(d) setRec(d, {status:st}, {silent:true}); }); toast(T('Status set on ' + ids.length, '已设置 ' + ids.length + ' 项的状态')); return; }
});
/* drop files on a record (drawer, table row, Related panel) or on the library page */
function dropTarget(ev){
  var t = ev.target; if(!t || !t.closest) return null;
  if(t.closest('.drawer') && S.open){ var r = getRec(S.open); return r ? {rec:r} : null; }
  var row = t.closest('tr'), b = row && row.querySelector('[data-act="openRec"][data-id]'); if(row && b && t.closest('.tbl') && !t.closest('.libt')){ var r2 = getRec(b.dataset.id); return r2 ? {rec:r2, el:row} : null; }
  if(t.closest('.libdrop') || (S.page === 'files' && t.closest('#main'))) return {lib:true, el:t.closest('.libdrop') || $('#main')};
  return null;
}
document.addEventListener('dragover', function(ev){ if(!ev.dataTransfer || Array.prototype.indexOf.call(ev.dataTransfer.types || [], 'Files') < 0 || !canTeamEdit()) return; var d = dropTarget(ev); if(!d) return; ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; $$('.dropon').forEach(function(x){ x.classList.remove('dropon'); }); var el = d.el || $('.drawer'); if(el) el.classList.add('dropon'); });
document.addEventListener('dragleave', function(ev){ if(ev.target && ev.target.classList && ev.target.classList.contains('dropon')) ev.target.classList.remove('dropon'); });
document.addEventListener('drop', function(ev){
  if(!ev.dataTransfer || !ev.dataTransfer.files || !ev.dataTransfer.files.length) return; var d = dropTarget(ev); $$('.dropon').forEach(function(x){ x.classList.remove('dropon'); }); if(!d) return; ev.preventDefault();
  if(d.lib){ uploadDocs(ev.dataTransfer.files, {}); return; }
  var reg = getReg(d.rec.reg); if(!canWrite(reg)) return;
  if(isLibRec(d.rec)){ uploadRevision(d.rec, ev.dataTransfer.files[0]); return; }
  if(libRoute(reg)) uploadDocs(ev.dataTransfer.files, {link:d.rec}); else { var ff = dataFields(reg).filter(function(f){ return f.type === 'files'; })[0]; if(ff) upload(d.rec, ff.key, ev.dataTransfer.files); else toast(T('This register has no file field.', '此台账没有文件字段。')); }
});

