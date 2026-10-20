/* work-web v3.1 · handover core: transmittals (送审单), Owner responses, closing checks and the handover package.
   Transmittals: one register (kind "transmittals", TRN-001…). Each transmittal lists documents (records of document
   registers or the library) in d.items = [{_id, rid, no, docNo, title, title2, rev, files:[{path,name,size,type,sha}],
   code, comment, at, by, src}]. When it is sent, every file gets its SHA-256 fingerprint and the list is locked (the
   database refuses changes to a sent list: guard_transmittal in schema.sql). Responses: the Owner answers per document
   in the Owner portal (a feedback row with a code; the database writes it into the transmittal and the document), or the
   team records an answer received by letter or email. Closing checks warn (they never block) when a document is marked
   complete without its final file or the Owner's acceptance, or a punch item without a photo. The handover package is a
   ZIP of the final files by package, with an Excel index and SHA256SUMS.txt (vendor/fflate builds the ZIP). */
'use strict';

REG_ICONS.trn = '<path d="M21 3L3 10.5l7 2.5 2.5 7z"/><path d="M10 13l5-5"/>';
var TRN_PURPOSE = [O('review', 'For review', '审查', 'amber'), O('approval', 'For approval', '批准', 'blue'), O('info', 'For information', '参考', 'grey'), O('asbuilt', 'As-built / handover', '竣工移交', 'green')];
var TRN_ST = [O('draft', 'Draft', '草稿', 'grey'), O('sent', 'Sent', '已送出', 'blue'), O('responded', 'Responded', '已回复', 'amber'), O('closed', 'Closed', '已关闭', 'green', {done:true})];
var TRN_CODES0 = [O('accepted', 'Accepted', '接受', 'green'), O('accepted_c', 'Accepted w/ comments', '带意见接受', 'green'), O('revise', 'Revise & resubmit', '退回重交', 'red'), O('rejected', 'Rejected', '拒绝', 'red')];
var TRN_OK = ['accepted', 'accepted_c'], TRN_BAD = ['revise', 'rejected'];
TEMPLATES.transmittals = {en:'Transmittals', zh:'送审单', icon:'trn', sec:'docs', prefix:'TRN', kind:'transmittals', fields:[
  F('no', 'No.', '编号', 'text'), F('en', 'Subject', '主题', 'text'), F('zh', 'Subject (中文)', '主题（中文）', 'text'),
  F('date', 'Date sent', '发送日期', 'date'), F('to', 'To', '收件方', 'text'), F('purpose', 'Purpose', '目的', 'select', {opts:TRN_PURPOSE}),
  F('due', 'Response due', '回复期限', 'date'), F('status', 'Status', '状态', 'select', {opts:TRN_ST}), F('remarks', 'Remarks', '备注', 'long')],
  roles:{title:'en', title2:'zh', no:'no', start:'date', finish:'due', status:'status'}, view:'table'};

function isTrnReg(reg){ return !!reg && reg.d.kind === 'transmittals'; }
function trnReg(){ return memo('trnReg', function(){ return allRegs().filter(function(r){ return isTrnReg(r) && !isPrivate(r); })[0] || null; }); }
function ensureTrnReg(){
  if(trnReg()) return Promise.resolve(trnReg());
  if(!canTeamEdit()) return Promise.reject(new Error('permission'));
  var r = regFromTemplate('transmittals', {id:'reg_trn'});
  return STORE.createReg(r).then(function(){ return getReg(r.id); });
}
/* registers whose records are documents that can be transmitted (never an "Only me" register: its files stay private) */
function isDocReg(reg){ return !!reg && !isTrnReg(reg) && !isPrivate(reg) && (reg.d.kind === 'library' || !!fieldOf(reg, 'ownerResult') || reg.d.tpl === 'turnover'); }
/* the four answers the database accepts (labels and colours from a document register's "Owner result" field when it has them) */
function trnCodes(){ return memo('trnCodes', function(){ var d = allRegs().filter(function(r){ return fieldOf(r, 'ownerResult'); })[0], f = d && fieldOf(d, 'ownerResult');
  return TRN_CODES0.map(function(o){ var x = f ? optOf(f, o.v) : null; return x || o; }); }); }
function trnCode(v){ return trnCodes().filter(function(o){ return o.v === v; })[0] || TRN_CODES0.filter(function(o){ return o.v === v; })[0] || null; }
function trnItems(t){ return asArr(t && t.d.items); }
function trnSent(t){ return !!t && (t.d.status || 'draft') !== 'draft'; }
/* the files that make up a document: its own attachments and the current file of each linked library document */
function docFiles(rec){ if(isLibRec(rec)){ var x = curFile(rec); return x && x.path ? [{path:x.path, name:x.name || '', size:x.size || 0, type:x.type || ''}] : []; }
  return recFiles(rec).map(function(o){ return {path:o.x.path, name:o.x.name || '', size:o.x.size || 0, type:o.x.type || ''}; }).filter(function(x){ return x.path; }); }
/* every transmittal a document was in, oldest first: [{t, it}] */
function docTrnHistory(rec){
  var g = trnReg(); if(!g || !rec) return [];
  return memo('trnh', function(){ var m = {}; recsOf(g.id).forEach(function(t){ trnItems(t).forEach(function(it){ (m[it.rid] = m[it.rid] || []).push({t:t, it:it}); }); });
    Object.keys(m).forEach(function(k){ m[k].sort(function(a, b){ return String(a.t.d.date || a.t.ca || '').localeCompare(String(b.t.d.date || b.t.ca || '')); }); }); return m; })[rec.id] || [];
}
function nextRev(r){ r = String(r || '').trim(); if(!r) return 'A'; var m = /^(.*?)(\d+)$/.exec(r); if(m) return m[1] + (+m[2] + 1);
  m = /^(.*?)([A-Y])$/i.exec(r); if(m) return m[1] + String.fromCharCode(m[2].charCodeAt(0) + 1); return r + '1'; }
/* the revision to send next: after a sent one comes the next letter / number, otherwise the document's own revision */
function suggestRev(rec){ var h = docTrnHistory(rec).filter(function(x){ return trnSent(x.t); }), last = h[h.length - 1];
  if(last) return nextRev(last.it.rev); return String(rec.d.rev || '').trim() || 'A'; }
function newItem(rec){ var reg = getReg(rec.reg);
  return {_id:uid('t'), rid:rec.id, no:recNo(reg, rec) || '', docNo:rec.d.docNo || '', title:recTitle(reg, rec) || '', title2:recTitle2(reg, rec) || '', rev:suggestRev(rec), files:docFiles(rec)}; }

/* ---------------- SHA-256 of a stored file ---------------- */
function fileBytes(path){
  return Promise.resolve(STORE.signUrls ? STORE.signUrls([path]) : null).then(function(){ var u = STORE.fileUrl(path); if(!u) throw new Error(T('A file could not be opened: ', '无法打开文件：') + path);
    return fetch(u).then(function(r){ if(!r.ok) throw new Error(r.status + ' ' + path); return r.arrayBuffer(); }); });
}
function sha256(buf){ return crypto.subtle.digest('SHA-256', buf).then(function(h){ return Array.prototype.map.call(new Uint8Array(h), function(b){ return ('0' + b.toString(16)).slice(-2); }).join(''); }); }

/* ---------------- creating and sending ---------------- */
function trnCreate(ids){
  var recs = (ids || []).map(getRec).filter(function(r){ return r && isDocReg(getReg(r.reg)); });
  return ensureTrnReg().then(function(g){
    var one = recs.length === 1 ? (recs[0].d.docNo || recNo(getReg(recs[0].reg), recs[0])) : '';
    var d = {en:one ? 'Submission of ' + one : 'Documents for review', zh:one ? '提交 ' + one : '送审文件', purpose:'review', status:'draft', items:recs.map(newItem)};
    return createRec(g, d, true);
  }).then(function(id){ if(id){ S.newBlank = null; S.dtab = 'trn'; renderDrawer(); } return id; }).catch(function(e){ toast(errText(e)); });   // (not removed as an untouched new item)
}
function trnSetItems(t, items){ return setRec(t, {items:items}, {silent:true}); }
function trnSend(t, toOwner){
  var items = clone(trnItems(t)); if(!items.length){ toast(T('Add at least one document first.', '请先加入至少一份文件。')); return Promise.resolve(); }
  var all = []; items.forEach(function(it){ (it.files || []).forEach(function(f){ all.push(f); }); });
  var m = S.modal; if(m) m.busy = T('Fingerprinting files…', '正在计算文件指纹…') + ' 0 / ' + all.length; renderModal();
  var k = 0;
  return all.reduce(function(p, f){ return p.then(function(){ return fileBytes(f.path).then(sha256).then(function(h){ f.sha = h; k++; if(S.modal) { S.modal.busy = T('Fingerprinting files…', '正在计算文件指纹…') + ' ' + k + ' / ' + all.length; renderModal(); } }); }); }, Promise.resolve())
    .then(function(){
      var date = t.d.date || TODAY_S, patch = {items:items, status:'sent', date:date};
      return STORE.patchRec(t.id, patch).then(function(){
        /* each document: the revision sent, the submission date, and "pending review" */
        var list = items.map(function(it){ var r = getRec(it.rid); if(!r) return null; var reg = getReg(r.reg), p = {};
          if(fieldOf(reg, 'rev') && it.rev && r.d.rev !== it.rev) p.rev = it.rev;
          if(fieldOf(reg, 'ownerResult')) p.ownerResult = 'pending';
          if(fieldOf(reg, 'actualEnd')){ p.actualEnd = date; if(fieldOf(reg, 'actualStart') && !r.d.actualStart) p.actualStart = date; }
          return Object.keys(p).length ? {rec:r, patch:p} : null; }).filter(Boolean);
        return setRecs(list);
      }).then(function(){ return toOwner ? trnPublish(getRec(t.id)) : null; });
    });
}
/* the Owner's copy: a publication they can open in the Owner portal and answer, with the files they may download */
function trnPublish(t){
  if(!t) return Promise.resolve();
  var items = trnItems(t).map(function(it){ return {_id:it._id, no:it.no, docNo:it.docNo, title:it.title, title2:it.title2, rev:it.rev, files:(it.files || []).map(function(f){ return {path:f.path, name:f.name, size:f.size, sha:f.sha}; })}; });
  var paths = []; items.forEach(function(it){ it.files.forEach(function(f){ if(paths.indexOf(f.path) < 0) paths.push(f.path); }); });
  var pub = {kind:'transmittal', no:'', at:new Date().toISOString(), by:(STORE.me && (STORE.me.name || STORE.me.email)) || '', note:t.d.no + ' · ' + (t.d.en || ''), trnId:t.id, trnNo:t.d.no || '', title:{en:t.d.en || '', zh:t.d.zh || ''}, date:t.d.date || '', due:t.d.due || '', purpose:t.d.purpose || '', to:t.d.to || '', items:items, paths:paths};
  var no = '';
  return (STORE.ensurePubs ? STORE.ensurePubs() : Promise.resolve()).then(function(){
    var max = 0; (STORE.pubs || []).forEach(function(p){ var mm = /PUB-(\d+)/.exec(p.no || p.id || ''); if(mm) max = Math.max(max, +mm[1]); });
    no = pub.no = 'PUB-' + String(max + 1).padStart(3, '0'); return STORE.createPub(no, pub);
  }).then(function(no2){ return STORE.patchRec(t.id, {pub:no2 || no}); });
}
/* an answer the team records (received by letter or email); the document's Owner result follows */
function trnRespond(t, itemId, code, comment, src){
  var items = clone(trnItems(t)), it = items.filter(function(x){ return x._id === itemId; })[0]; if(!it) return Promise.resolve();
  it.code = code || ''; it.comment = comment || ''; it.at = new Date().toISOString(); it.by = (STORE.me && (STORE.me.name || STORE.me.email)) || ''; it.src = src || 'letter';
  var patch = {items:items}; if(t.d.status === 'sent' && items.every(function(x){ return x.code; })) patch.status = 'responded';
  return STORE.patchRec(t.id, patch).then(function(){ return trnApplyToDoc(it); });
}
/* (only while the document is still at the revision that was answered: a late answer to an older revision changes nothing) */
function trnApplyToDoc(it){ var r = it && getRec(it.rid), reg = r && getReg(r.reg); if(!r || !fieldOf(reg, 'ownerResult') || !it.code || r.d.ownerResult === it.code) return Promise.resolve();
  if(fieldOf(reg, 'rev') && r.d.rev && it.rev && String(r.d.rev) !== String(it.rev)) return Promise.resolve();
  return STORE.patchRec(r.id, {ownerResult:it.code}).then(function(){ if(TRN_BAD.indexOf(it.code) >= 0) toast(T(it.no + ' needs a new revision (' + nextRev(it.rev) + ')', it.no + ' 需要提交新版本（' + nextRev(it.rev) + '）')); }); }

/* demo only: what the database trigger apply_owner_response does with an Owner's response (schema.sql v3.1) */
function trnApplyResponse(f){
  var p = (STORE.pubs || []).filter(function(x){ return x.id === f.pub_id; })[0], t = p && p.kind === 'transmittal' && getRec(p.trnId); if(!t || ['sent', 'responded'].indexOf(t.d.status) < 0) return Promise.resolve();
  var items = clone(trnItems(t)), it = items.filter(function(x){ return x._id === f.item_id; })[0]; if(!it) return Promise.resolve();
  Object.assign(it, {code:f.code, comment:f.body === f.code ? '' : f.body, at:f.created_at, by:f.author_name || '', src:'portal', fb:f.id});
  var patch = {items:items}; if(t.d.status === 'sent' && items.every(function(x){ return x.code; })) patch.status = 'responded';
  return STORE.patchRec(t.id, patch).then(function(){ return trnApplyToDoc(it); });
}

function trnPubStatus(t, st){ if(STORE.mode !== 'demo' || !t) return; (STORE.pubs || []).forEach(function(p){ if(p.id === t.d.pub){ p.status = st; STORE.save(); } }); }

/* ---------------- the transmittal's documents (drawer tab) ---------------- */
function trnPubLive(t){ return !!(t && t.d.pub && (STORE.pubs || []).some(function(p){ return p.id === t.d.pub; })); }
function trnItemsHtml(reg, t, ed){
  var items = trnItems(t), sent = trnSent(t), A = asOfN(), od = !!(t.d.due && d2n(t.d.due) < A && t.d.status === 'sent'), live = trnPubLive(t);
  var h = '<div class="trn-h">' + (sent ? '<span class="note">' + L('Sent ' + (t.d.date || '') + ' · the documents and files below are locked', '已于 ' + (t.d.date || '') + ' 送出 · 下列文件与版本已锁定') + (live ? ' · ' + L('Owner copy ' + (t.d.pub), '业主副本 ' + (t.d.pub)) : t.d.pub ? ' · ' + L('the Owner copy was withdrawn', '业主副本已撤回') : '') + '</span>' : '<span class="note">' + L('Draft: add documents, check each revision and its files, then send.', '草稿：加入文件，核对版本和文件后送出。') + '</span>') +
    (od ? ' ' + chip('red', L('Response overdue', '回复逾期')) : '') + '</div>';
  if(!items.length) h += '<div class="card empty">' + L('No documents yet.', '还没有文件。') + '</div>';
  else h += '<table class="subt trn-t"><thead><tr><th>' + L('Document', '文件') + '</th><th>' + L('Rev.', '版本') + '</th><th>' + L('Files', '文件') + '</th><th>' + (sent ? L('Owner response', '业主回复') : '') + '</th></tr></thead><tbody>' + items.map(function(it){
    var r = getRec(it.rid), fl = it.files || [], c = it.code ? trnCode(it.code) : null;
    var avail = !sent && r ? docFiles(r) : [];
    var files = sent ? fl.map(function(f){ return '<div class="trn-f"><span>' + esc(f.name || f.path.split('/').pop()) + '</span> <span class="mono muted" title="SHA-256 ' + esc(f.sha || '') + '">' + esc(fmtSize(f.size)) + (f.sha ? ' · ' + esc(f.sha.slice(0, 10)) + '…' : '') + '</span></div>'; }).join('')
      : (avail.length ? avail.map(function(f){ var on = fl.some(function(x){ return x.path === f.path; }); return '<label class="trn-f chk"><input type="checkbox" data-trnfile="' + esc(it._id) + '" data-path="' + esc(f.path) + '"' + (on ? ' checked' : '') + (ed ? '' : ' disabled') + '> ' + esc(f.name || f.path.split('/').pop()) + ' <span class="mono muted">' + esc(fmtSize(f.size)) + '</span></label>'; }).join('') : '<span class="od">' + L('No file attached to this document', '该文件没有附件') + '</span>');
    var resp = sent ? (c ? optChip(c) + (it.comment ? '<div class="note">' + esc(it.comment) + '</div>' : '') + '<div class="note">' + esc((it.src === 'portal' ? T('Owner portal', '业主门户') : T('By letter / email', '来函')) + (it.by ? ' · ' + it.by : '') + (it.at ? ' · ' + String(it.at).slice(0, 10) : '')) + '</div>' : '<span class="muted">' + L('Waiting', '等待中') + '</span>') +
        (ed ? ' <button type="button" class="lnk" data-act="trnResp" data-v="' + esc(it._id) + '">' + (c ? L('Change', '修改') : L('Record response…', '录入回复…')) + '</button>' : '') : '';
    return '<tr><td><button type="button" class="lnk mono" data-act="openRec" data-id="' + esc(it.rid) + '">' + esc(it.no || '—') + '</button>' + (it.docNo ? ' <span class="mono muted">' + esc(it.docNo) + '</span>' : '') + '<div>' + esc(it.title || '') + '</div>' + (!r ? '<div class="note od">' + L('The document record was deleted', '文件记录已删除') + '</div>' : '') + '</td>' +
      '<td>' + (sent || !ed ? '<span class="mono">' + esc(it.rev || '—') + '</span>' : '<input class="in trn-rev" data-trnrev="' + esc(it._id) + '" data-fk="trnrev:' + esc(it._id) + '" value="' + esc(it.rev || '') + '" aria-label="' + esc(T('Revision', '版本')) + '">') + '</td>' +
      '<td>' + files + '</td><td>' + resp + (!sent && ed ? '<button type="button" class="ib" data-act="trnDel" data-v="' + esc(it._id) + '" aria-label="' + esc(T('Remove', '移除')) + '">' + uic('x', 13) + '</button>' : '') + '</td></tr>';
  }).join('') + '</tbody></table>';
  if(ed && !sent) h += '<div class="row" style="margin-top:10px"><button type="button" class="btn" data-act="trnAdd">' + uic('plus', 13) + ' ' + L('Add documents…', '加入文件…') + '</button><span style="flex:1"></span><button type="button" class="btn pri" data-act="trnSendAsk"' + (items.length ? '' : ' disabled') + '>' + uic('send', 13) + ' ' + L('Send…', '送出…') + '</button></div>';
  if(sent && ed && t.d.status !== 'closed') h += '<div class="row" style="margin-top:10px">' + (!live ? '<button type="button" class="btn" data-act="trnPub">' + L('Show to the Owner', '发给业主') + '</button>' : '') + '<span style="flex:1"></span><button type="button" class="btn" data-act="trnClose">' + L('Close transmittal', '关闭送审单') + '</button></div>';
  h += '<div class="row" style="margin-top:10px"><button type="button" class="btn sm" data-act="trnPrint">' + uic('print', 13) + ' ' + L('Print / PDF', '打印 / PDF') + '</button></div>';
  return h;
}
/* the transmittals a document was in, and what to do next (shown in the document's details) */
function docTrnHtml(reg, rec){
  if(!isDocReg(reg)) return '';
  var h0 = docTrnHistory(rec), sentH = h0.filter(function(x){ return trnSent(x.t); }), last = sentH[sentH.length - 1], h = '';
  if(last && TRN_BAD.indexOf(last.it.code) >= 0) h += '<div class="banner warnbox" style="margin:0 0 10px">' + L('The Owner asked for a new revision (' + (last.t.d.no) + ', Rev ' + (last.it.rev) + '). Next: Rev ' + (nextRev(last.it.rev)) + '.', '业主要求提交新版本（' + (last.t.d.no) + '，' + (last.it.rev) + ' 版）。下一版：' + (nextRev(last.it.rev)) + '。') +
    (canTeamEdit() ? ' <button type="button" class="btn sm" data-act="trnNewFor" data-v="' + esc(rec.id) + '">' + L('New transmittal for this document', '为此文件新建送审单') + '</button>' : '') + '</div>';
  if(!h0.length) return h + (canTeamEdit() ? '<div class="row" style="margin-top:12px"><button type="button" class="btn sm" data-act="trnNewFor" data-v="' + esc(rec.id) + '">' + uic('send', 13) + ' ' + L('Send in a transmittal…', '放入送审单…') + '</button></div>' : '');
  return h + '<h3 class="fsec">' + L('Transmittals', '送审记录') + ' <span class="cnt">' + h0.length + '</span></h3><table class="subt"><thead><tr><th>' + L('Transmittal', '送审单') + '</th><th>' + L('Date', '日期') + '</th><th>' + L('Rev.', '版本') + '</th><th>' + L('Owner response', '业主回复') + '</th></tr></thead><tbody>' +
    h0.slice().reverse().map(function(x){ var c = x.it.code ? trnCode(x.it.code) : null; return '<tr><td><button type="button" class="lnk mono" data-act="openRecTrn" data-v="' + esc(x.t.id) + '">' + esc(x.t.d.no || '—') + '</button>' + (trnSent(x.t) ? '' : ' <span class="muted">' + L('draft', '草稿') + '</span>') + '</td><td class="mono">' + esc(x.t.d.date || '') + '</td><td class="mono">' + esc(x.it.rev || '') + '</td><td>' + (c ? optChip(c) : '<span class="muted">—</span>') + (x.it.comment ? '<div class="note">' + esc(x.it.comment) + '</div>' : '') + '</td></tr>'; }).join('') + '</tbody></table>' +
    (canTeamEdit() ? '<div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-act="trnNewFor" data-v="' + esc(rec.id) + '">' + uic('send', 13) + ' ' + L('Send in a new transmittal…', '放入新送审单…') + '</button></div>' : '');
}

/* ---------------- closing checks (they warn, they never block) ---------------- */
function closeRules(reg){ if(!reg) return null; if(fieldOf(reg, 'ownerResult') && !isTrnReg(reg)) return 'doc'; if(reg.d.tpl === 'punch') return 'punch'; return null; }
function closeChecks(reg, rec, next){
  var k = closeRules(reg); if(!k) return [];
  var d = next || rec.d, probe = {id:rec.id, reg:rec.reg, d:d}, out = [];
  if(k === 'doc'){ out.push({ok:docFiles(probe).length > 0, en:'Final file attached', zh:'已附最终版文件'}); out.push({ok:TRN_OK.indexOf(d.ownerResult) >= 0, en:'Owner result: Accepted', zh:'业主结果：接受'}); }
  if(k === 'punch') out.push({ok:recFiles(probe).some(function(o){ return isImg(o.x); }), en:'Photo attached (e.g. after the fix)', zh:'已附照片（如整改后）'});
  return out;
}
/* a transmittal's status follows its sending: Draft → Send… → Sent → Responded → Closed, never back to Draft */
function trnStatusIssue(reg, rec, changed){
  if(!isTrnReg(reg) || changed.status === undefined) return '';
  var was = rec.d.status || 'draft', to = changed.status || 'draft';
  if(was === 'draft' && to !== 'draft') return T('Use “Send…” in the Documents tab: it fingerprints the files and locks the list.', '请在「文件清单」中用「送出…」：它会计算文件指纹并锁定清单。');
  if(was !== 'draft' && to === 'draft') return T('A sent transmittal cannot go back to Draft. Put a new revision in a new transmittal.', '已送出的送审单不能退回草稿。新版本请放入新的送审单。');
  return '';
}
/* before a status that counts as done is saved: what is missing (empty = fine) */
function closeIssues(reg, rec, changed){
  var sf = rf(reg, 'status'); if(!sf || changed[sf.key] === undefined || !closeRules(reg)) return [];
  var o = optOf(sf, changed[sf.key]), was = optOf(sf, rec.d[sf.key]); if(!o || !o.done || (was && was.done)) return [];
  return closeChecks(reg, rec, Object.assign({}, rec.d, changed)).filter(function(c){ return !c.ok; });
}
function closeAsk(list){ /* list: [{rec, issues}] */
  if(!list.length) return true;
  var head = list.length === 1 ? recLabel(list[0].rec) + '\n' + T('does not meet the closing checklist:', '未满足关闭条件：') : T(list.length + ' items do not meet the closing checklist, for example:', list.length + ' 项未满足关闭条件，例如：') + '\n' + recLabel(list[0].rec);
  return confirm(head + '\n' + list[0].issues.map(function(c){ return '• ' + T('Missing: ' + c.en, '缺少：' + c.zh); }).join('\n') + '\n\n' + T('Mark as complete anyway?', '仍要标记为完成吗？'));
}
function closeChecklistHtml(reg, rec){
  var cs = closeChecks(reg, rec); if(!cs.length) return '';
  return '<div class="ccl"><b>' + L('Closing checklist', '关闭条件') + '</b>' + cs.map(function(c){ return '<span class="' + (c.ok ? 'ok' : 'no') + '">' + (c.ok ? '✓' : '✗') + ' ' + L(c.en, c.zh) + '</span>'; }).join('') + '</div>';
}

/* ---------------- add-documents picker ---------------- */
function trnPickModal(m){
  var q = String(m.q || '').toLowerCase().trim(), t = getRec(m.trn), have = {}; trnItems(t).forEach(function(it){ have[it.rid] = 1; });
  var regs = allRegs().concat(libReg() ? [libReg()] : []).filter(function(g){ return isDocReg(g); });
  var rows = []; regs.forEach(function(g){ if(m.reg && m.reg !== g.id) return; recsOf(g.id).forEach(function(r){ if(have[r.id]) return; var s = [recNo(g, r), r.d.docNo, recTitle(g, r), recTitle2(g, r)].join(' ').toLowerCase(); if(!q || s.indexOf(q) >= 0) rows.push({g:g, r:r}); }); });
  var n = Object.keys(m.sel || {}).filter(function(k){ return m.sel[k]; }).length;
  return {title:L('Add documents', '加入文件'), wide:true, html:'<div class="row"><input class="in" id="trnq" data-fk="trnq" aria-label="' + esc(T('Search', '搜索')) + '" placeholder="' + esc(T('Search number, title…', '搜索编号、名称…')) + '" value="' + esc(m.q || '') + '" style="flex:1"><select class="in" id="trnreg" aria-label="' + esc(T('Register', '台账')) + '"><option value="">' + esc(T('All document registers', '全部文件台账')) + '</option>' + regs.map(function(g){ return '<option value="' + esc(g.id) + '"' + (m.reg === g.id ? ' selected' : '') + '>' + esc(regName(g)) + '</option>'; }).join('') + '</select></div>' +
    '<div class="tbl-wrap" style="max-height:52vh;margin-top:8px"><table class="tbl"><tbody>' + rows.slice(0, 300).map(function(x){ var nf = docFiles(x.r).length; return '<tr><td style="width:34px"><input type="checkbox" data-trnsel="' + esc(x.r.id) + '"' + (m.sel && m.sel[x.r.id] ? ' checked' : '') + ' aria-label="' + esc(T('Select', '选择')) + '"></td><td class="mono nowrap">' + esc(recNo(x.g, x.r)) + '</td><td>' + esc(recTitle(x.g, x.r) || '') + (x.r.d.docNo ? ' <span class="mono muted">' + esc(x.r.d.docNo) + '</span>' : '') + '</td><td class="mono">' + esc(x.r.d.rev || '') + '</td><td class="nowrap">' + (nf ? '<span class="muted">' + nf + ' ' + L('file(s)', '个文件') + '</span>' : '<span class="od">' + L('no file', '无文件') + '</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>' + (rows.length > 300 ? '<p class="note">' + L('Showing the first 300 — search to narrow.', '仅显示前 300 项，请搜索缩小范围。') + '</p>' : ''),
    foot:'<button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button><button type="button" class="btn pri" data-act="trnPickGo"' + (n ? '' : ' disabled') + '>' + L('Add ' + n, '加入 ' + n + ' 项') + '</button>'};
}
function trnSendModal(m){
  var t = getRec(m.trn); if(!t) return {title:'', html:''};
  var items = trnItems(t), nf = 0, nofile = items.filter(function(it){ return !(it.files || []).length; });
  items.forEach(function(it){ nf += (it.files || []).length; });
  return {title:L('Send ' + (t.d.no || ''), '送出 ' + (t.d.no || '')), html:'<p>' + L(items.length + ' document(s), ' + nf + ' file(s). Each file gets its SHA-256 fingerprint and the list is locked: a later revision goes in a new transmittal.', items.length + ' 份文件、' + nf + ' 个附件。每个文件会计算 SHA-256 指纹，清单随即锁定；之后的新版本请用新的送审单。') + '</p>' +
    (nofile.length ? '<p class="note warn">' + L(nofile.length + ' document(s) have no file: ', nofile.length + ' 份文件没有附件：') + esc(nofile.map(function(x){ return x.no; }).join(', ')) + '</p>' : '') +
    '<label class="chk"><input type="checkbox" id="trnToOwner"' + (m.toOwner === false ? '' : ' checked') + '> ' + L('Show it to the Owner in the Owner portal (they can download the files and answer each document)', '同时在业主门户中发给业主（业主可下载文件并逐份回复）') + '</label>' +
    (m.busy ? '<p class="note">' + esc(m.busy) + '</p>' : ''),
    foot:'<button type="button" class="btn" data-act="mclose"' + (m.busy ? ' disabled' : '') + '>' + L('Cancel', '取消') + '</button><button type="button" class="btn pri" data-act="trnSendGo"' + (m.busy ? ' disabled' : '') + '>' + L('Send', '送出') + '</button>'};
}
function trnRespModal(m){
  var t = getRec(m.trn), it = t && trnItems(t).filter(function(x){ return x._id === m.item; })[0]; if(!it) return {title:'', html:''};
  return {title:L('Response for ' + (it.no), (it.no) + ' 的回复'), html:'<p class="note">' + esc((it.docNo ? it.docNo + ' · ' : '') + it.title + ' · Rev ' + (it.rev || '')) + '</p>' +
    '<label class="lab" for="trnCode">' + L('Code', '代码') + '</label><select class="in" id="trnCode">' + trnCodes().map(function(o){ return '<option value="' + esc(o.v) + '"' + ((m.code || it.code) === o.v ? ' selected' : '') + '>' + esc(nm(o)) + '</option>'; }).join('') + '</select>' +
    '<label class="lab" for="trnCmt">' + L('Comments', '意见') + '</label><textarea class="in" id="trnCmt" rows="4">' + esc(it.comment || '') + '</textarea>' +
    '<label class="lab" for="trnSrc">' + L('Received', '来源') + '</label><select class="in" id="trnSrc"><option value="letter">' + esc(T('By letter / email', '来函 / 邮件')) + '</option><option value="meeting">' + esc(T('In a meeting', '会议中')) + '</option></select>',
    foot:'<button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button><button type="button" class="btn pri" data-act="trnRespGo">' + L('Save', '保存') + '</button>'};
}
DECK_MODALS.trnPick = trnPickModal; DECK_MODALS.trnSend = trnSendModal; DECK_MODALS.trnResp = trnRespModal;

/* ---------------- printed transmittal ---------------- */
function trnPrint(t){
  var c = cfg(), items = trnItems(t), p = optOf({opts:TRN_PURPOSE}, t.d.purpose);
  var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(t.d.no || 'Transmittal') + '</title><style>body{font:13px/1.45 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#111;margin:28px}h1{font-size:20px;margin:0 0 2px}table{border-collapse:collapse;width:100%;margin-top:10px}td,th{border:1px solid #bbb;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f1f1f1}.m{color:#555}.meta td{border:0;padding:2px 12px 2px 0}.h{font:11px ui-monospace,monospace;color:#555;word-break:break-all}.sig td{height:60px}@media print{body{margin:12mm}}</style></head><body>' +
    '<div class="m">' + esc((c.projectEn || '') + ' · ' + (c.projectZh || '')) + '</div><h1>Document transmittal 文件送审单 · ' + esc(t.d.no || '') + '</h1><div>' + esc(t.d.en || '') + (t.d.zh ? ' · ' + esc(t.d.zh) : '') + '</div>' +
    '<table class="meta"><tr><td>Date 日期</td><td><b>' + esc(t.d.date || '') + '</b></td><td>To 收件方</td><td><b>' + esc(t.d.to || '') + '</b></td></tr><tr><td>Purpose 目的</td><td><b>' + esc(p ? p.en + ' · ' + p.zh : '') + '</b></td><td>Response due 回复期限</td><td><b>' + esc(t.d.due || '') + '</b></td></tr></table>' +
    '<table><thead><tr><th>#</th><th>No. / Document No.<br><small>编号 / 文件编号</small></th><th>Title<br><small>名称</small></th><th>Rev.<br><small>版本</small></th><th>Files and SHA-256<br><small>文件与指纹</small></th><th>Response<br><small>回复</small></th></tr></thead><tbody>' +
    items.map(function(it, i){ var cc = it.code ? trnCode(it.code) : null; return '<tr><td>' + (i + 1) + '</td><td>' + esc(it.no || '') + (it.docNo ? '<br>' + esc(it.docNo) : '') + '</td><td>' + esc(it.title || '') + (it.title2 ? '<br><span class="m">' + esc(it.title2) + '</span>' : '') + '</td><td>' + esc(it.rev || '') + '</td><td>' + (it.files || []).map(function(f){ return esc(f.name || '') + (f.sha ? '<div class="h">' + esc(f.sha) + '</div>' : ''); }).join('<br>') + '</td><td>' + (cc ? esc(cc.en + ' · ' + cc.zh) : '') + (it.comment ? '<br><span class="m">' + esc(it.comment) + '</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table>' +
    (t.d.remarks ? '<p>' + esc(t.d.remarks).replace(/\n/g, '<br>') + '</p>' : '') +
    '<table class="sig"><tr><th>Sent by 发送人</th><th>Received by 接收人</th></tr><tr><td></td><td></td></tr></table><p class="m">SHA-256: the fingerprint of each file as sent. Any change to a file changes its fingerprint. 每个文件送出时的指纹，文件有任何改动指纹都会不同。</p></body></html>';
  var w = window.open('', '_blank'); if(!w){ toast(T('Allow pop-ups to print.', '请允许弹出窗口以打印。')); return; }
  w.document.open(); w.document.write(html); w.document.close(); setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} }, 400);
}

/* ---------------- Owner portal: a transmittal to answer ---------------- */
function ownerTrnView(p, pubs){
  var mine = function(id){ return (STORE.fb || []).filter(function(f){ return f.pub_id === p.id && f.item_id === id && f.kind === 'response'; }).sort(function(a, b){ return String(b.created_at).localeCompare(String(a.created_at)); })[0]; };
  var pu = optOf({opts:TRN_PURPOSE}, p.purpose), closed = p.status === 'closed';
  return '<div class="ph"><div><h1 class="vtitle">' + esc(p.trnNo || p.no) + ' · ' + esc(T1(p.title && p.title.en, p.title && p.title.zh)) + '</h1><span class="muted">' + esc((p.date || '') + (pu ? ' · ' + T(pu.en, pu.zh) : '') + (p.due ? ' · ' + T('response due ', '回复期限 ') + p.due : '')) + '</span></div>' +
    '<select class="in" id="pubSel" aria-label="' + esc(T('Publication', '发布内容')) + '">' + pubs.map(function(x){ return '<option value="' + esc(x.id) + '"' + (x.id === p.id ? ' selected' : '') + '>' + esc(x.no + ' · ' + (x.note || '')) + '</option>'; }).join('') + '</select></div>' +
    '<div class="card sec"><p class="note">' + (closed ? L('This transmittal is closed. You can still download its files.', '此送审单已关闭，仍可下载其中的文件。') : L('Download each document, then give your response. Your answer goes straight to the team.', '请下载各份文件后给出回复，回复会直接送达团队。')) + '</p>' +
    asArr(p.items).map(function(it){ var r = mine(it._id), c = r ? trnCode(r.code) : null, dr = (S.orDraft || {})[p.id + ':' + it._id] || {};
      return '<div class="otrn"><div><b class="mono">' + esc(it.no) + '</b> ' + esc(it.docNo || '') + ' · Rev ' + esc(it.rev || '') + '<div>' + esc(it.title || '') + (it.title2 ? ' · ' + esc(it.title2) : '') + '</div>' +
        asArr(it.files).map(function(f){ var u = STORE.fileUrl(f.path); return '<div class="trn-f">' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener" download="' + esc(f.name || '') + '">' + uic('dl', 13) + ' ' + esc(f.name || 'file') + '</a>' : esc(f.name || 'file')) + ' <span class="mono muted" title="SHA-256">' + esc(fmtSize(f.size)) + (f.sha ? ' · ' + esc(f.sha.slice(0, 12)) + '…' : '') + '</span></div>'; }).join('') + '</div>' +
        '<div class="otrn-r">' + (c ? optChip(c) + (r.body && r.body !== r.code ? '<div class="note">' + esc(r.body) + '</div>' : '') + '<div class="note">' + esc(fmtTime(r.created_at)) + '</div>' : '') + (closed ? (c ? '' : '<span class="muted">' + L('No response', '未回复') + '</span>') + '</div></div>' :
        '<select class="in" data-orcode="' + esc(it._id) + '" data-pub="' + esc(p.id) + '" data-fk="orcode:' + esc(it._id) + '" aria-label="' + esc(T('Response', '回复')) + '">' + trnCodes().map(function(o){ return '<option value="' + esc(o.v) + '"' + (dr.code === o.v ? ' selected' : '') + '>' + esc(nm(o)) + '</option>'; }).join('') + '</select>' +
        '<textarea class="in" rows="2" data-orcmt="' + esc(it._id) + '" data-pub="' + esc(p.id) + '" data-fk="orcmt:' + esc(it._id) + '" aria-label="' + esc(T('Comments', '意见')) + '" placeholder="' + esc(T('Comments (optional)', '意见（可选）')) + '">' + esc(dr.cmt || '') + '</textarea>' +
        '<button type="button" class="btn pri sm" data-act="orSend" data-v="' + esc(it._id) + '" data-pub="' + esc(p.id) + '" data-no="' + esc(it.no) + '">' + (c ? L('Send a new response', '重新回复') : L('Send response', '提交回复')) + '</button></div></div>'); }).join('') + '</div>';
}

/* ---------------- the handover package: ZIP of final files + Excel index + SHA256SUMS.txt ---------------- */
function zipLib(){ if(window.fflate) return Promise.resolve(); return new Promise(function(res, rej){ var s = document.createElement('script'); s.src = 'vendor/fflate-0.8.2.min.js'; s.onload = function(){ res(); }; s.onerror = function(){ rej(new Error('fflate')); }; document.head.appendChild(s); }); }
function safeName(s){ return String(s || '').replace(/[\\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || '_'; }
/* documents of a register under a package node ('' = all), in package order */
function hoDocs(reg, node){
  var tf = rf(reg, 'tree'), inside = node && tf ? treeDesc(tf, node) : null, order = {}, i = 0;
  if(tf) (function w(p){ treeKids(tf, p).forEach(function(n){ order[n.id] = i++; w(n.id); }); })('');
  return recsOf(reg.id).filter(function(r){ return !inside || inside[r.d[tf.key]]; }).sort(function(a, b){ var x = tf ? (order[a.d[tf.key]] == null ? 1e6 : order[a.d[tf.key]]) - (order[b.d[tf.key]] == null ? 1e6 : order[b.d[tf.key]]) : 0; return x || String(recNo(reg, a)).localeCompare(String(recNo(reg, b)), undefined, {numeric:true}); });
}
function hoFolder(reg, r){ var tf = rf(reg, 'tree'), path = tf ? treePath(tf, r.d[tf.key]) : []; return path.map(function(n){ return safeName((n.code ? n.code + ' ' : '') + (n.en || n.zh || '')); }).join('/') || 'No package 未分类'; }
function hoModal(m){
  var reg = getReg(m.reg), tf = rf(reg, 'tree'), docs = hoDocs(reg, m.node || ''), nf = 0, size = 0, nofile = 0, notacc = 0;
  docs.forEach(function(r){ var fl = docFiles(r); nf += fl.length; fl.forEach(function(f){ size += +f.size || 0; }); if(!fl.length) nofile++; if(TRN_OK.indexOf(r.d.ownerResult) < 0) notacc++; });
  var opts = '<option value="">' + esc(T('All packages', '全部文件包')) + '</option>'; if(tf) (function w(p, dep){ treeKids(tf, p).forEach(function(n){ opts += '<option value="' + esc(n.id) + '"' + (m.node === n.id ? ' selected' : '') + '>' + esc(' '.repeat(dep * 3) + (n.code ? n.code + ' ' : '') + (n.en || n.zh || '')) + '</option>'; if(dep < 2) w(n.id, dep + 1); }); })('', 0);
  return {title:L('Handover package', '移交文件包'), html:(tf ? '<label class="lab" for="hoNode">' + L('Package', '文件包') + '</label><select class="in" id="hoNode">' + opts + '</select>' : '') +
    '<p>' + L(docs.length + ' documents · ' + nf + ' files · about ' + fmtSize(size), docs.length + ' 份文件 · ' + nf + ' 个附件 · 约 ' + fmtSize(size)) + '</p>' +
    ((nofile || notacc) ? '<p class="note warn">' + L(nofile + ' without a file, ' + notacc + ' not accepted by the Owner yet — they are listed on a separate sheet of the index.', nofile + ' 份没有文件，' + notacc + ' 份尚未获业主接受——会在索引的另一张表中列出。') + '</p>' : '') +
    '<p class="note">' + L('The ZIP has a folder per package with the current files, an Excel index (number, title, revision, file, size, SHA-256, transmittal, Owner result) and SHA256SUMS.txt to check every file. Above about 250 MB it is saved in several parts (the browser may ask to allow several downloads); the index is in the last part.', 'ZIP 按文件包分文件夹放当前文件，附 Excel 索引（编号、名称、版本、文件、大小、SHA-256、送审单、业主结果）和用于逐个核对的 SHA256SUMS.txt。超过约 250 MB 会分成几个文件保存（浏览器可能询问是否允许多个下载），索引在最后一个文件里。') + '</p>' +
    (m.busy ? '<p class="note"><b>' + esc(m.busy) + '</b></p>' : ''),
    foot:'<button type="button" class="btn" data-act="mclose"' + (m.busy ? ' disabled' : '') + '>' + L('Close', '关闭') + '</button><button type="button" class="btn pri" data-act="hoGo"' + (m.busy || !nf ? ' disabled' : '') + '>' + uic('dl', 13) + ' ' + L('Build ZIP', '生成 ZIP') + '</button>'};
}
DECK_MODALS.handover = hoModal;
var HO_PART = 250 * 1024 * 1024;
/* parts of about 250 MB (memory: a part is held once as data and once as the file being saved): each part is finished and saved as soon as it is full (so memory stays bounded) and has its
   own SHA256SUMS.txt; the Excel index of every file (with its part) is in the last part */
async function hoBuild(m){
  var reg = getReg(m.reg), docs = hoDocs(reg, m.node || ''), tf = rf(reg, 'tree'), node = m.node && tf ? treeNode(tf, m.node) : null;
  await zipLib(); await xlsxLib();
  var miss = [], all = [], LIMIT = m.limit || HO_PART, used = {}, c = cfg();
  var base = slug(c.projectEn || 'project') + '_handover_' + slug(node ? (node.code || node.en || 'pkg') : 'all') + '_' + TODAY_S;
  var readme = 'Handover package · 移交文件包\r\n' + (c.projectEn || '') + ' ' + (c.projectZh || '') + '\r\nMade ' + new Date().toISOString() + (node ? '\r\nPackage: ' + (node.code || '') + ' ' + (node.en || '') : '') +
    '\r\n\r\nindex.xlsx (in the last part) — every file with its SHA-256 fingerprint, revision, transmittal and Owner result.\r\nSHA256SUMS.txt — check the files of this part: on macOS / Linux run  shasum -a 256 -c SHA256SUMS.txt  in this folder;\r\n  on Windows run  certutil -hashfile <file> SHA256  for one file.\r\n';
  docs.forEach(function(r){ var fl = docFiles(r), h = docTrnHistory(r).filter(function(x){ return trnSent(x.t); }), folder = hoFolder(reg, r) + '/' + safeName(recNo(reg, r) + ' ' + (recTitle(reg, r) || ''));
    if(!fl.length || TRN_OK.indexOf(r.d.ownerResult) < 0) miss.push({r:r, why:!fl.length ? 'No file 无文件' : 'Not accepted by the Owner 未获业主接受'});
    fl.forEach(function(f){ var nm0 = safeName(f.name || f.path.split('/').pop()), p = folder + '/' + nm0, k = 1; while(used[p.toLowerCase()]){ p = folder + '/' + (++k) + '_' + nm0; } used[p.toLowerCase()] = 1;
      var sent = null; h.forEach(function(x){ (x.it.files || []).forEach(function(y){ if(y.path === f.path) sent = {t:x.t, it:x.it, sha:y.sha}; }); });
      all.push({r:r, f:f, zp:p, sent:sent}); }); });
  var parts = 0, cur = null, done = 0, bad = 0;
  function open(){ var chunks = []; cur = {z:new fflate.Zip(function(err, dat){ if(err) throw err; chunks.push(dat); }), chunks:chunks, bytes:0, sums:[]}; parts++; }
  function add(name, u8){ var e = new fflate.ZipPassThrough(name); cur.z.add(e); e.push(u8, true); }
  function save(last, extra){
    if(extra) add('index.xlsx', extra);
    add('SHA256SUMS.txt', fflate.strToU8(cur.sums.join('\n') + (cur.sums.length ? '\n' : '')));
    add('README.txt', fflate.strToU8(readme + (parts > 1 || !last ? '\r\nPart ' + parts + (last ? ' (last)' : '') + '\r\n' : '')));
    cur.z.end();
    var blob = new Blob(cur.chunks, {type:'application/zip'}), a = document.createElement('a'), name = base + (parts > 1 || !last ? '_part' + parts : '') + '.zip';
    cur.chunks.length = 0; cur = null; if(m.onPart) m.onPart(name, blob);
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); blob = null; setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 20000);
  }
  if(STORE.signUrls) for(var j = 0; j < all.length; j += 200){ m.busy = T('Preparing…', '准备中…'); renderModal(); await STORE.signUrls(all.slice(j, j + 200).map(function(x){ return x.f.path; })); }
  open();
  for(var i = 0; i < all.length; i++){
    var x = all[i]; m.busy = T('Adding files… ', '正在加入文件… ') + (i + 1) + ' / ' + all.length + (parts > 1 ? ' · ' + T('part ', '分卷 ') + parts : ''); renderModal();
    var buf = null; try{ buf = await fileBytes(x.f.path); }catch(e){ x.err = String(e && e.message || e); }
    if(!buf){ bad++; continue; }
    x.sha = await sha256(buf); x.size = buf.byteLength;
    if(cur.bytes && cur.bytes + buf.byteLength > LIMIT){ save(false); open(); }
    add(x.zp, new Uint8Array(buf)); buf = null; cur.bytes += x.size; cur.sums.push(x.sha + '  ' + x.zp); x.part = parts; done++;
  }
  var head = ['Package 文件包', 'No. 编号', 'Document No. 文件编号', 'Title 名称', 'Title (中文) 中文名称', 'Rev. 版本', 'File in the ZIP 文件', 'Size (bytes) 大小', 'SHA-256', 'Same as sent 与送审一致', 'Transmittal 送审单', 'Date sent 送出日期', 'Owner result 业主结果', 'Part 分卷', 'Problem 问题'];
  var orf = fieldOf(reg, 'ownerResult'), rows = all.map(function(x){ var o = orf ? optOf(orf, x.r.d.ownerResult) : null;
    return [hoFolder(reg, x.r), recNo(reg, x.r), x.r.d.docNo || '', x.r.d[rolesOf(reg).title] || '', x.r.d[rolesOf(reg).title2] || '', (x.sent && x.sent.it.rev) || x.r.d.rev || '', x.zp, x.size || x.f.size || '', x.sha || '',
      x.sent && x.sent.sha && x.sha ? (x.sent.sha === x.sha ? 'yes 是' : 'NO 否 — changed since it was sent 送出后已改动') : '', x.sent ? x.sent.t.d.no || '' : '', x.sent ? x.sent.t.d.date || '' : '',
      o ? o.en + ' · ' + o.zh : (x.r.d.ownerResult || ''), x.part || '', x.err ? 'Could not be read 无法读取: ' + x.err : '']; });
  var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet([head].concat(rows)); ws['!cols'] = [30, 12, 18, 40, 30, 6, 60, 12, 66, 14, 12, 12, 20, 6, 30].map(function(w){ return {wch:w}; }); XLSX.utils.book_append_sheet(wb, ws, 'Index');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No. 编号', 'Document No. 文件编号', 'Title 名称', 'Problem 问题']].concat(miss.map(function(x){ return [recNo(reg, x.r), x.r.d.docNo || '', x.r.d[rolesOf(reg).title] || '', x.why]; }))), 'Missing or not accepted');
  save(true, new Uint8Array(XLSX.write(wb, {type:'array', bookType:'xlsx'})));
  m.busy = null; renderModal();
  toast(T(done + ' file(s) packed' + (bad ? ', ' + bad + ' could not be read (see the index)' : '') + (parts > 1 ? ' in ' + parts + ' parts' : ''), '已打包 ' + done + ' 个文件' + (bad ? '，' + bad + ' 个无法读取（见索引）' : '') + (parts > 1 ? '，共 ' + parts + ' 个分卷' : '')));
  return {files:done, bad:bad, parts:parts, rows:rows.length, miss:miss.length};
}
/* ---------------- menu entries (document registers) ---------------- */
function trnMenu(reg){
  if(!isDocReg(reg) || !canTeamEdit()) return '';
  return '<button type="button" data-act="trnNewSel" data-v="' + esc(reg.id) + '">' + L('New transmittal…', '新建送审单…') + '</button>' + (rf(reg, 'tree') || fieldOf(reg, 'ownerResult') ? '<button type="button" data-act="hoOpen" data-v="' + esc(reg.id) + '">' + L('Handover package (ZIP)…', '移交文件包（ZIP）…') + '</button>' : '');
}
function trnBulk(reg){ return isDocReg(reg) && canTeamEdit() ? '<button type="button" class="btn sm" data-act="trnNewSel" data-v="' + esc(reg.id) + '">' + uic('send', 13) + ' ' + L('Transmit…', '送审…') + '</button>' : ''; }

/* ---------------- events ---------------- */
/* while files are being fingerprinted or packed, the dialog stays open (closing it would leave the work running unseen) */
var HO_RUN = false;
document.addEventListener('click', function(ev){ var el = ev.target.closest && ev.target.closest('[data-act="mclose"]'); if(el && S.modal && S.modal.busy && /^(trnSend|handover)$/.test(S.modal.kind)){ ev.stopImmediatePropagation(); ev.preventDefault(); toast(T('Please wait until it is finished.', '请等待完成。')); } }, true);
document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape' && S.modal && S.modal.busy && /^(trnSend|handover)$/.test(S.modal.kind)){ ev.stopImmediatePropagation(); ev.preventDefault(); } }, true);
document.addEventListener('click', function(ev){
  var el = ev.target.closest && ev.target.closest('[data-act]'); if(!el) return;
  var act = el.dataset.act, v = el.dataset.v, t = S.open && getRec(S.open);
  switch(act){
    case 'trnNewSel': (function(){ var reg = getReg(v), ids = Object.keys(S.sel || {}).filter(function(id){ var r = S.sel[id] && getRec(id); return r && r.reg === v; }); S.sel = {}; trnCreate(ids); })(); break;
    case 'trnNewFor': trnCreate([v]); break;
    case 'openRecTrn': openRec(v, 'trn'); break;
    case 'trnAdd': if(t) openModal({kind:'trnPick', trn:t.id, q:'', reg:'', sel:{}}); setTimeout(function(){ var i = $('#trnq'); if(i) i.focus(); }, 30); break;
    case 'trnPickGo': (function(){ var m = S.modal, tt = m && getRec(m.trn); if(!tt) return; var ids = Object.keys(m.sel || {}).filter(function(k){ return m.sel[k]; }); closeModal(); trnSetItems(tt, clone(trnItems(tt)).concat(ids.map(getRec).filter(Boolean).map(newItem))); })(); break;
    case 'trnDel': if(t && !trnSent(t)) trnSetItems(t, clone(trnItems(t)).filter(function(x){ return x._id !== v; })); break;
    case 'trnSendAsk': if(t) openModal({kind:'trnSend', trn:t.id}); break;
    case 'trnSendGo': (function(){ var m = S.modal, tt = m && getRec(m.trn); if(!tt || m.busy) return; var own = ($('#trnToOwner') || {}).checked !== false; m.toOwner = own;
      trnSend(tt, own).then(function(){ closeModal(); toast(T((tt.d.no || '') + ' sent', (tt.d.no || '') + ' 已送出') + (own ? T(' · the Owner can answer it in the Owner portal', ' · 业主可在业主门户回复') : '')); renderAll(); })
        .catch(function(e){ if(S.modal) S.modal.busy = null; renderModal(); toast(errText(e)); }); })(); break;
    case 'trnPub': if(t) trnPublish(t).then(function(){ toast(T('Shown to the Owner', '已发给业主')); }).catch(function(e){ toast(errText(e)); }); break;
    case 'trnClose': if(t && confirm(T('Close this transmittal? The Owner can then no longer answer it.', '关闭此送审单？关闭后业主不能再回复。'))) setRec(t, {status:'closed'}, {noCheck:true}).then(function(){ trnPubStatus(getRec(t.id), 'closed'); }); break;
    case 'trnResp': if(t) openModal({kind:'trnResp', trn:t.id, item:v}); break;
    case 'trnRespGo': (function(){ var m = S.modal, tt = m && getRec(m.trn); if(!tt) return; var code = ($('#trnCode') || {}).value, cmt = ($('#trnCmt') || {}).value || '', src = ($('#trnSrc') || {}).value || 'letter'; closeModal(); trnRespond(tt, m.item, code, cmt, src).catch(function(e){ toast(errText(e)); }); })(); break;
    case 'trnPrint': if(t) trnPrint(t); break;
    case 'hoOpen': openModal({kind:'handover', reg:v, node:''}); break;
    case 'hoGo': (function(){ var m = S.modal; if(!m || m.busy || HO_RUN) return; HO_RUN = true; m.busy = T('Starting…', '开始…'); renderModal();
      hoBuild(m).catch(function(e){ m.busy = null; renderModal(); toast(errText(e)); }).then(function(){ HO_RUN = false; }); })(); break;
    case 'orSend': (function(){ var code = ($('[data-orcode="' + v + '"]') || {}).value, cmt = (($('[data-orcmt="' + v + '"]') || {}).value || '').trim(), c = trnCode(code); if(!c) return;
      STORE.addFeedback({pub_id:el.dataset.pub, item_id:v, reg_no:el.dataset.no || '', body:cmt || code, code:code, kind:'response'}).then(function(){ if(S.orDraft) delete S.orDraft[el.dataset.pub + ':' + v]; toast(T('Response sent', '回复已提交')); renderAll(); }).catch(function(e){ toast(errText(e)); }); })(); break;
  }
});
function orDraft(el){ S.orDraft = S.orDraft || {}; var k = el.dataset.pub + ':' + (el.dataset.orcmt || el.dataset.orcode); return (S.orDraft[k] = S.orDraft[k] || {}); }
document.addEventListener('input', function(e){ var el = e.target; if(el.id === 'trnq' && S.modal){ S.modal.q = el.value; renderModal(); return; }
  if(el.dataset && el.dataset.orcmt) orDraft(el).cmt = el.value; });
document.addEventListener('change', function(e){
  var el = e.target, t = S.open && getRec(S.open);
  if(el.dataset.orcode){ orDraft(el).code = el.value; return; }
  if(el.dataset.trnsel && S.modal){ S.modal.sel = S.modal.sel || {}; S.modal.sel[el.dataset.trnsel] = el.checked; renderModal(); return; }
  if(el.id === 'trnreg' && S.modal){ S.modal.reg = el.value; renderModal(); return; }
  if(el.id === 'hoNode' && S.modal){ S.modal.node = el.value; renderModal(); return; }
  if(el.dataset.trnrev && t && !trnSent(t)){ var its = clone(trnItems(t)); its.forEach(function(x){ if(x._id === el.dataset.trnrev) x.rev = el.value.trim(); }); trnSetItems(t, its); return; }
  if(el.dataset.trnfile && t && !trnSent(t)){ var r0 = null, its2 = clone(trnItems(t)); its2.forEach(function(x){ if(x._id !== el.dataset.trnfile) return; r0 = getRec(x.rid); var f = r0 ? docFiles(r0).filter(function(y){ return y.path === el.dataset.path; })[0] : null;
      x.files = (x.files || []).filter(function(y){ return y.path !== el.dataset.path; }); if(el.checked && f) x.files.push(f); }); trnSetItems(t, its2); return; }
});
