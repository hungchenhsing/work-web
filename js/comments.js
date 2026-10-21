/* work-web v3.3.1 · review comments on a document (first used for the TDS): one row per comment with the revision it
   belongs to, the comment and its date, our reply and its date, the status and the date it was closed.
   They live in a sub-table field marked kind:'comments' (TDS template: 'rvc'), so they merge row by row like any sub-table,
   are in the change log and in Excel exports. Shown as cards on the record's "Review comments" tab, as "open / total" in
   the table, and across all records in the register's "Comments" view (filter, export, import). */
'use strict';

function cmFieldDef(){ return clone(TEMPLATES.tds.fields.filter(function(f){ return f.kind === 'comments'; })[0]); }   // the TDS template holds the definition
function cmField(reg){ return dataFields(reg).filter(function(f){ return f.type === 'sub' && f.kind === 'comments'; })[0] || null; }
function cmCol(f, k){ return ((f && f.cols) || []).filter(function(c){ return c.key === k; })[0] || null; }
function cmRows(rec, f){ return asArr(rec && f && rec.d[f.key]).filter(isPlainObj); }
function cmClosed(f, x){ var o = optOf(cmCol(f, 'st'), x.st); return !!(o && o.done); }
function cmAwaiting(x){ return !x.st || x.st === 'open' || x.st === 'notacc'; }
function cmStats(f, rows){ var s = {n:rows.length, open:0, wait:0}; rows.forEach(function(x){ if(!cmClosed(f, x)){ s.open++; if(cmAwaiting(x)) s.wait++; } }); return s; }
function cmRevs(rows, cur){ var out = []; rows.forEach(function(x){ var r = x.rev || ''; if(out.indexOf(r) < 0) out.push(r); }); if(cur && out.indexOf(cur) < 0) out.unshift(cur);
  return out.sort(function(a, b){ return a === cur ? -1 : b === cur ? 1 : String(b).localeCompare(String(a), undefined, {numeric:true}); }); }
function cmCurRev(reg, rec){ var f = fieldOf(reg, 'rev'); return f ? String(rec.d.rev || '') : ''; }
function cmNextNo(rows){ var m = 0; rows.forEach(function(x){ var n = parseInt(String(x.no || '').replace(/\D+/g, ''), 10); if(n > m) m = n; }); return String(m + 1); }
function cmDays(x){ var a = d2n(x.cdate); if(a == null) return null; var b = x.st === 'closed' ? d2n(x.cldate) : TODAY; return b == null ? null : Math.max(0, b - a); }
/* what one edit also changes: a reply marks the comment replied (and dates it); closing dates it */
function cmPatchRow(x, col, v){
  var o = Object.assign({}, x); o[col] = v;
  if(col === 'rep' && String(v || '').trim()){ if(cmAwaiting(o)) o.st = 'replied'; if(!o.rdate) o.rdate = TODAY_S; }
  if(col === 'st' && v === 'closed' && !o.cldate) o.cldate = TODAY_S;
  if(col === 'st' && v !== 'closed' && x.st === 'closed') o.cldate = '';
  return o;
}
function cmSetRow(rec, f, rowId, col, v){ var rows = clone(cmRows(rec, f)).map(function(x){ return x._id === rowId ? cmPatchRow(x, col, v) : x; }); return setRec(rec, mk(f.key, rows), {silent:true}); }
function cmNew(reg, rec, f, extra){ var rows = cmRows(rec, f); return Object.assign({_id:uid('s'), no:cmNextNo(rows), rev:cmCurRev(reg, rec), cdate:TODAY_S, st:'open'}, extra || {}); }

/* ---------------- the record's "Review comments" tab ---------------- */
function cmCountHtml(f, rows){ var s = cmStats(f, rows);
  return '<span class="cmcnt' + (s.wait ? ' wait' : '') + '" title="' + esc(T(s.wait + ' awaiting our reply · ' + s.open + ' not closed · ' + s.n + ' in all', s.wait + ' 条待回复 · ' + s.open + ' 条未关闭 · 共 ' + s.n + ' 条')) + '"><b class="mono">' + s.open + '</b> ' + esc(T('open', '未关闭')) + ' <span class="muted">/ ' + s.n + '</span></span>'; }
function cmPanel(reg, rec, ed){
  var f = cmField(reg); if(!f) return '';
  var rows = cmRows(rec, f), cur = cmCurRev(reg, rec), revs = cmRevs(rows, cur), st = S.cmSt || {}, rv = S.cmRev && S.cmRev.id === rec.id ? S.cmRev.v : (cur ? 'cur' : 'all');
  var sf = cmCol(f, 'st'), s = cmStats(f, rows);
  var h = '<div class="cmbar"><div class="cmsum">' + optsOf(sf).map(function(o){ var n = rows.filter(function(x){ return (x.st || 'open') === o.v; }).length; return '<button type="button" class="fchip" data-act="cmSt" data-v="' + esc(o.v) + '" aria-pressed="' + !!st[o.v] + '">' + chip(o.color, esc(nm(o))) + ' <b class="mono">' + n + '</b></button>'; }).join('') + '</div>' +
    '<span class="row"><select class="in sm" id="cmRev" aria-label="' + esc(T('Revision', '版本')) + '">' + (cur ? '<option value="cur"' + (rv === 'cur' ? ' selected' : '') + '>' + esc(T('Current revision (' + cur + ')', '当前版本（' + cur + '）')) + '</option>' : '') + '<option value="all"' + (rv === 'all' ? ' selected' : '') + '>' + esc(T('All revisions', '全部版本')) + '</option>' +
      revs.filter(function(r){ return r !== cur; }).map(function(r){ return '<option value="r:' + esc(r) + '"' + (rv === 'r:' + r ? ' selected' : '') + '>' + esc(T('Rev. ', '版本 ') + (r || '—')) + '</option>'; }).join('') + '</select>' +
      (ed ? '<button type="button" class="btn sm pri" data-act="cmAdd">' + uic('plus', 13) + ' ' + L('Add comment', '新增意见') + '</button>' +
        '<details class="menu"><summary class="btn sm" aria-label="' + esc(T('More ways to add', '更多新增方式')) + '">⋯</summary><div class="pop pop-r"><button type="button" data-act="cmPaste">' + L('Paste several comments…', '粘贴多条意见…') + '</button><button type="button" data-act="cmImport" data-v="' + esc(rec.id) + '">' + L('Import from Excel…', '从 Excel 导入…') + '</button></div></details>' : '') + '</span></div>';
  var shown = rows.filter(function(x){ var any = Object.keys(st).some(function(k){ return st[k]; }); if(any && !st[x.st || 'open']) return false; if(rv === 'cur') return (x.rev || '') === cur; if(rv.indexOf('r:') === 0) return (x.rev || '') === rv.slice(2); return true; });
  if(!rows.length) return h + '<div class="card empty">' + L('No review comments yet.', '还没有审查意见。') + (ed ? ' ' + L('Add them one by one, paste a list, or import the reviewer’s comment sheet.', '可以逐条新增、粘贴一段文字，或导入审查意见表。') : '') + '</div>';
  if(!shown.length) return h + '<div class="note" style="padding:12px 2px">' + L('No comments match.', '没有符合条件的意见。') + ' ' + (rv === 'cur' ? '<button type="button" class="lnk" data-act="cmRevAll">' + L('Show all revisions', '显示全部版本') + '</button>' : '') + '</div>';
  var groups = rv === 'all' ? cmRevs(shown, cur).map(function(r){ return {r:r, list:shown.filter(function(x){ return (x.rev || '') === r; })}; }).filter(function(g){ return g.list.length; }) : [{r:null, list:shown}];
  groups.forEach(function(g){
    if(g.r !== null) h += '<h4 class="cmrev">' + esc(T('Rev. ', '版本 ') + (g.r || '—')) + (g.r === cur && cur ? ' <span class="chip c-blue">' + L('current', '当前') + '</span>' : '') + ' <span class="muted mono">' + g.list.length + '</span></h4>';
    h += g.list.map(function(x){ return cmCard(reg, rec, f, x, ed); }).join('');
  });
  return h + (s.n ? '<p class="note">' + L('A reply marks the comment “Replied” and dates it; closing a comment dates it too. Everything is in the change log.', '填写回复会把意见标为「已回复」并记录日期；关闭时也会记录日期。所有修改都记入修改记录。') + '</p>' : '');
}
function cmCard(reg, rec, f, x, ed){
  var sf = cmCol(f, 'st'), o = optOf(sf, x.st || 'open'), id = x._id, a = function(col){ return ' data-cm="' + esc(rec.id + '|' + id + '|' + col) + '" data-fk="cm:' + esc(id + ':' + col) + '"' + (ed ? '' : ' disabled'); };
  var days = cmDays(x), fo = S.cmFocus === id;
  var lab = function(en, zh){ return '<span class="cml">' + L(en, zh) + '</span>'; };
  return '<article class="cmcard st-' + esc(x.st || 'open') + (fo ? ' focus' : '') + '" id="cm-' + esc(id) + '">' +
    '<div class="cmh"><b class="mono">#' + esc(x.no || '') + '</b>' +
      '<label class="cmf sm">' + lab('Rev.', '版本') + '<input class="in" style="width:64px"' + a('rev') + ' value="' + esc(x.rev || '') + '"></label>' +
      '<label class="cmf">' + lab('Reviewer', '审核人') + '<input class="in"' + a('by') + ' value="' + esc(x.by || '') + '" placeholder="—"></label>' +
      '<label class="cmf">' + lab('Comment date', '意见日期') + '<input class="in" type="date"' + a('cdate') + ' value="' + esc(x.cdate || '') + '"></label>' +
      '<label class="cmf">' + lab('Status', '状态') + '<select class="in cmst c-' + esc((o && o.color) || 'grey') + '"' + a('st') + '>' + optsOf(sf).map(function(op){ return '<option value="' + esc(op.v) + '"' + ((x.st || 'open') === op.v ? ' selected' : '') + '>' + esc(T1(op.en, op.zh)) + '</option>'; }).join('') + '</select></label>' +
      (x.st === 'closed' ? '<label class="cmf">' + lab('Closed on', '关闭日期') + '<input class="in" type="date"' + a('cldate') + ' value="' + esc(x.cldate || '') + '"></label>' : (days != null ? '<span class="cmdays' + (days > 14 ? ' late' : '') + '" title="' + esc(T('Days since the comment', '距意见日期天数')) + '">' + days + T(' d open', ' 天未关闭') + '</span>' : '')) +
      '<label class="cmf sm">' + lab('Follows', '接续') + '<input class="in" style="width:58px"' + a('ref') + ' value="' + esc(x.ref || '') + '" placeholder="#"></label>' +
      (ed ? '<button type="button" class="ib cmdel" data-act="cmDel" data-v="' + esc(id) + '" aria-label="' + esc(T('Delete comment #', '删除意见 #') + (x.no || '')) + '">' + uic('trash', 14) + '</button>' : '') + '</div>' +
    '<label class="cmt">' + lab('Comment', '意见内容') + '<textarea class="in" rows="2"' + a('cmt') + ' placeholder="' + esc(T('What the reviewer asked', '审查方的意见')) + '">' + esc(x.cmt || '') + '</textarea></label>' +
    '<div class="cmr"><label class="cmt">' + lab('Our reply', '我方回复') + '<textarea class="in" rows="2"' + a('rep') + ' placeholder="' + esc(T('Our answer', '我方的答复')) + '">' + esc(x.rep || '') + '</textarea></label>' +
      '<label class="cmf">' + lab('Reply date', '回复日期') + '<input class="in" type="date"' + a('rdate') + ' value="' + esc(x.rdate || '') + '"></label></div>' +
    (ed && x.st === 'notacc' ? '<div class="cmfoot"><button type="button" class="btn sm" data-act="cmFollow" data-v="' + esc(id) + '">' + uic('plus', 12) + ' ' + L('New comment that follows this one', '新增接续意见') + '</button></div>' : '') + '</article>';
}

/* ---------------- paste several ---------------- */
function cmSplit(text){
  var lines = String(text || '').replace(/\r/g, '').split('\n'), num = /^\s*(?:\(?\d{1,3}[.)、:：]|[-•·*])\s+/, items = [], cur = null;
  var numbered = lines.filter(function(l){ return num.test(l); }).length >= 2;
  lines.forEach(function(l){
    if(!l.trim()){ if(!numbered && cur){ items.push(cur); cur = null; } return; }
    if(numbered){ if(num.test(l)){ if(cur) items.push(cur); cur = l.replace(num, '').trim(); } else if(cur != null) cur += '\n' + l.trim(); else cur = l.trim(); return; }
    if(cur) items.push(cur); cur = l.trim();
  });
  if(cur) items.push(cur);
  return items.filter(function(x){ return x.trim(); });
}
function cmPasteModal(m){
  var rec = getRec(m.rec), reg = rec && getReg(rec.reg); if(!reg) return {title:'', html:''};
  var items = cmSplit(m.text || '');
  return {title:L('Paste review comments', '粘贴审查意见') + ' · ' + esc(recNo(reg, rec)), wide:true,
    html:'<textarea class="in" id="cmPasteT" data-fk="cmPasteT" rows="9" placeholder="' + esc(T('One comment per line, or a numbered list (1. … 2. …)', '每行一条意见，或编号列表（1. … 2. …）')) + '">' + esc(m.text || '') + '</textarea>' +
      '<div class="fg"><label class="fl">' + L('Revision', '版本') + '<input class="in" id="cmPasteRev" value="' + esc(m.rev != null ? m.rev : cmCurRev(reg, rec)) + '"></label>' +
      '<label class="fl">' + L('Comment date', '意见日期') + dateIn({id:'cmPasteDate', value:m.date || TODAY_S}) + '</label>' +
      '<label class="fl">' + L('Reviewer', '审核人') + '<input class="in" id="cmPasteBy" value="' + esc(m.by || '') + '"></label></div>' +
      '<p class="note">' + (items.length ? L(items.length + ' comments will be added:', '将新增 ' + items.length + ' 条意见：') : L('Nothing to add yet.', '还没有内容。')) + '</p>' +
      (items.length ? '<ol class="cmprev">' + items.slice(0, 30).map(function(t){ return '<li>' + esc(t.length > 160 ? t.slice(0, 158) + '…' : t) + '</li>'; }).join('') + (items.length > 30 ? '<li class="muted">…</li>' : '') + '</ol>' : ''),
    foot:'<button type="button" class="btn pri" data-act="cmPasteDo"' + (items.length ? '' : ' disabled') + '>' + L('Add ' + items.length + ' comments', '新增 ' + items.length + ' 条意见') + '</button><button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button>'};
}
function cmPasteDo(){
  var m = S.modal, rec = getRec(m.rec), reg = rec && getReg(rec.reg), f = reg && cmField(reg); if(!f || !canWrite(reg)) return;
  var items = cmSplit(m.text || ''); if(!items.length) return;
  var rev = (($('#cmPasteRev') || {}).value || '').trim(), dt = normDate(($('#cmPasteDate') || {}).value || '') || TODAY_S, by = (($('#cmPasteBy') || {}).value || '').trim();
  var rows = clone(cmRows(rec, f)), n = +cmNextNo(rows);
  items.forEach(function(t){ rows.push({_id:uid('s'), no:String(n++), rev:rev, by:by, cmt:t, cdate:dt, st:'open'}); });
  closeModal(); setRec(rec, mk(f.key, rows), {silent:true}).then(function(){ toast(T(items.length + ' comments added', '已新增 ' + items.length + ' 条意见')); });
}

/* ---------------- the register's "Comments" view: every comment, filtered ---------------- */
function cmFil(reg){ var f = rfil(reg.id); return f.cm || (f.cm = {st:[], rev:'cur', from:'', to:'', q:''}); }
function cmAll(reg, list){
  var f = cmField(reg), c = cmFil(reg), out = [], q = String(c.q || '').toLowerCase(), from = d2n(c.from), to = d2n(c.to);
  list.forEach(function(r){ var cur = cmCurRev(reg, r);
    cmRows(r, f).forEach(function(x){
      if(c.st && c.st.length && c.st.indexOf(x.st || 'open') < 0) return;
      if(c.rev === 'cur' && (x.rev || '') !== cur) return;
      var cd = d2n(x.cdate); if(from != null && (cd == null || cd < from)) return; if(to != null && (cd == null || cd > to)) return;
      if(q && [x.cmt, x.rep, x.by, x.no, recNo(reg, r), recTitle(reg, r)].join(' ').toLowerCase().indexOf(q) < 0) return;
      out.push({rec:r, x:x, cur:cur});
    }); });
  return out.sort(function(a, b){ return String(recNo(reg, a.rec)).localeCompare(String(recNo(reg, b.rec)), undefined, {numeric:true}) || String(b.x.rev || '').localeCompare(String(a.x.rev || ''), undefined, {numeric:true}) || (+a.x.no || 0) - (+b.x.no || 0); });
}
function viewComments(reg, list){
  var f = cmField(reg); if(!f) return '';
  var c = cmFil(reg), sf = cmCol(f, 'st'), all = cmAll(reg, list), ed = canWrite(reg);
  var base = []; list.forEach(function(r){ cmRows(r, f).forEach(function(x){ base.push(x); }); });
  var h = '<div class="tbar cmtool"><div class="cmsum">' + optsOf(sf).map(function(o){ return '<button type="button" class="fchip" data-act="cmvSt" data-v="' + esc(o.v) + '" aria-pressed="' + (c.st.indexOf(o.v) >= 0) + '">' + chip(o.color, esc(nm(o))) + '</button>'; }).join('') + '</div>' +
    '<label class="chk"><input type="checkbox" id="cmvCur"' + (c.rev === 'cur' ? ' checked' : '') + '>' + L('Current revision only', '只看当前版本') + '</label>' +
    '<span class="drange"><span class="flab">' + L('Comment date', '意见日期') + '</span>' + dateIn({id:'cmvFrom', value:c.from, label:T('From', '从')}) + '–' + dateIn({id:'cmvTo', value:c.to, label:T('To', '到')}) + '</span>' +
    '<label class="search">' + uic('search', 15) + '<input id="cmvQ" type="search" data-fk="cmvQ" placeholder="' + esc(T('Search comments and replies', '搜索意见和回复')) + '" value="' + esc(c.q || '') + '"></label>' +
    '<span class="row" style="margin-left:auto"><button type="button" class="btn sm" data-act="cmExport">' + L('Export Excel', '导出 Excel') + '</button>' + (ed ? '<button type="button" class="btn sm" data-act="cmImport" data-v="">' + L('Import comment sheet…', '导入意见表…') + '</button>' : '') + '</span></div>';
  h += '<p class="note">' + L(all.length + ' of ' + base.length + ' comments', '共 ' + base.length + ' 条意见，显示 ' + all.length + ' 条') + ' · ' + L('Click a row to open it in its record.', '点一行可在记录中打开。') + '</p>';
  if(!all.length) return h + '<div class="card empty">' + (base.length ? L('No comments match these filters.', '没有符合条件的意见。') : L('No review comments yet. Open a record → Review comments, or import a comment sheet.', '还没有审查意见。打开一条记录 → 审查意见，或导入意见表。')) + '</div>';
  h += '<div class="card tbl-wrap"><table class="tbl cmtbl"><thead><tr><th>' + L('No.', '编号') + '</th><th>' + L(rf(reg, 'title') ? rf(reg, 'title').en : 'Item', rf(reg, 'title') ? rf(reg, 'title').zh : '项目') + '</th><th>' + L('Rev.', '版本') + '</th><th>#</th><th style="min-width:260px">' + L('Comment', '意见内容') + '</th><th>' + L('Date', '日期') + '</th><th style="min-width:220px">' + L('Our reply', '我方回复') + '</th><th>' + L('Replied', '回复日期') + '</th><th>' + L('Status', '状态') + '</th><th>' + L('Days', '天数') + '</th></tr></thead><tbody>' +
    all.map(function(e){ var x = e.x, o = optOf(sf, x.st || 'open'), d = cmDays(x);
      return '<tr class="cmrow" data-act="cmOpen" data-id="' + esc(e.rec.id) + '" data-v="' + esc(x._id) + '" tabindex="0"><td class="mono">' + esc(recNo(reg, e.rec)) + '</td><td>' + esc(recTitle(reg, e.rec) || '—') + '</td><td class="mono">' + esc(x.rev || '—') + ((x.rev || '') !== e.cur ? ' <span class="muted" title="' + esc(T('Not the current revision', '非当前版本')) + '">↺</span>' : '') + '</td><td class="mono">' + esc(x.no || '') + '</td>' +
        '<td class="cmtx">' + esc(x.cmt || '') + '</td><td class="mono nowrap">' + esc(x.cdate || '') + '</td><td class="cmtx">' + esc(x.rep || '') + '</td><td class="mono nowrap">' + esc(x.rdate || '') + '</td><td>' + (o ? chip(o.color, esc(nm(o))) : '') + '</td><td class="mono' + (d != null && d > 14 && x.st !== 'closed' ? ' od' : '') + '">' + (d == null ? '' : d) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  return h;
}
function cmExport(reg){
  xlsxLib().then(function(){
    var f = cmField(reg), sf = cmCol(f, 'st'), all = cmAll(reg, sortRecs(reg, filteredRecs(reg)));
    var head = ['No. 编号', 'Item 项目', 'Rev. 版本', '# 序号', 'Reviewer 审核人', 'Comment 意见内容', 'Comment date 意见日期', 'Our reply 我方回复', 'Reply date 回复日期', 'Status 状态', 'Closed on 关闭日期', 'Days 天数', 'Follows 接续'];
    var rows = all.map(function(e){ var x = e.x, o = optOf(sf, x.st || 'open'); return [recNo(reg, e.rec), recTitle(reg, e.rec), x.rev || '', x.no || '', x.by || '', x.cmt || '', x.cdate || '', x.rep || '', x.rdate || '', o ? o.en + (o.zh ? ' ' + o.zh : '') : '', x.cldate || '', cmDays(x) == null ? '' : cmDays(x), x.ref || '']; });
    var ws = XLSX.utils.aoa_to_sheet([head].concat(rows)); ws['!cols'] = [12, 30, 6, 5, 14, 60, 12, 60, 12, 16, 12, 6, 8].map(function(w){ return {wch:w}; });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Review comments'); XLSX.writeFile(wb, fname(slug(reg.d.en || 'register') + '_comments'));
  }).catch(function(e){ toast(errText(e)); });
}

/* ---------------- import a comment sheet (one record, or many by their number) ---------------- */
var CM_IMP = [['no', 'No.', '序号', /^(no\.?|#|item|item\s*no\.?|序号|序號|编号|編號)$|^comment\s*no|意见编号/i], ['rev', 'Revision', '版本', /rev|版本|version/i], ['by', 'Reviewer', '审核人', /reviewer|commented\s*by|review(ed)?\s*by|审核|審核|审查人|提出人/i],
  ['cmt', 'Comment', '意见内容', /comment|意见|意見|remark|审查意见/i], ['cdate', 'Comment date', '意见日期', /date|日期/i], ['rep', 'Reply', '我方回复', /reply|response|answer|回复|回覆|答复|contractor/i],
  ['rdate', 'Reply date', '回复日期', /(reply|response|回复|回覆|答复).*(date|日期)|(date|日期).*(reply|response|回复|回覆)/i], ['st', 'Status', '状态', /status|状态|狀態/i], ['cldate', 'Closed on', '关闭日期', /clos.*(date|on)|关闭日期|關閉日期/i]];
function cmGuess(headers, many){
  var map = {}, used = {}, H = headers.map(function(h){ return String(h == null ? '' : h).trim(); });
  function take(k, test){ if(map[k] != null) return; for(var i = 0; i < H.length; i++){ if(!used[i] && H[i] && test(H[i])){ map[k] = i; used[i] = 1; return; } } }
  if(many) take('doc', function(h){ return /tds|doc(ument)?\s*(no|number|#)|文件编号|文件編號|^编号$|^編號$/i.test(h); });
  take('rdate', function(h){ return CM_IMP[6][3].test(h); }); take('cldate', function(h){ return CM_IMP[8][3].test(h); });
  take('rep', function(h){ return CM_IMP[5][3].test(h) && !/date|日期/i.test(h); });
  take('cmt', function(h){ return CM_IMP[3][3].test(h) && !/date|日期|no\b|编号|序号/i.test(h); });
  ['no', 'rev', 'by', 'st'].forEach(function(k){ var t = CM_IMP.filter(function(x){ return x[0] === k; })[0][3]; take(k, function(h){ return t.test(h); }); });
  take('cdate', function(h){ return CM_IMP[4][3].test(h); });
  return map;
}
function cmStatusOf(s, rep){ s = String(s == null ? '' : s).trim().toLowerCase(); if(!s) return rep ? 'replied' : 'open';
  if(/not\s*accept|不接受|reject|退回|reopen/.test(s)) return 'notacc'; if(/clos|关闭|關閉|accept|接受|ok|resolved|完成/.test(s)) return 'closed';
  if(/repl|respond|answer|已回复|已回覆|已答复/.test(s)) return 'replied'; if(/open|pending|待|未/.test(s)) return 'open'; return rep ? 'replied' : 'open'; }
function cmDate(v){ if(v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate()); if(typeof v === 'number' && v > 20000 && v < 80000){ var d = new Date(Date.UTC(1899, 11, 30) + v * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); } return normDate(String(v || '')) || ''; }
function cmImportModal(m){
  var reg = getReg(m.reg); if(!reg) return {title:'', html:''};
  var rec = m.rec && getRec(m.rec), many = !rec;
  var title = L('Import review comments', '导入审查意见') + ' · ' + esc(rec ? recNo(reg, rec) : regName(reg));
  if(!m.sheet) return {title:title, html:'<p>' + (many ? L('Choose the reviewer’s comment sheet (.xlsx / .xls / .csv). It needs a column with the item number (e.g. TDS-002) so each comment goes to its record.', '选择审查意见表（.xlsx / .xls / .csv）。需要有一列项目编号（例如 TDS-002），以便每条意见归入对应记录。') : L('Choose the reviewer’s comment sheet (.xlsx / .xls / .csv). Every row becomes a comment of this record.', '选择审查意见表（.xlsx / .xls / .csv），每一行成为本记录的一条意见。')) + '</p><label class="btn pri">' + uic('upload', 14) + ' ' + L('Choose file…', '选择文件…') + '<input type="file" id="cmImpFile" accept=".xlsx,.xls,.csv" hidden></label>',
    foot:'<button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button>'};
  var H = m.sheet.headers.map(function(h){ return String(h == null ? '' : h); }), plan = cmImpPlan(m, reg);
  var opt = function(k, req){ return '<label class="fl">' + (k === 'doc' ? L('Item number', '项目编号') : L(CM_IMP.filter(function(x){ return x[0] === k; })[0][1], CM_IMP.filter(function(x){ return x[0] === k; })[0][2])) + (req ? ' *' : '') + '<select class="in" data-cmmap="' + k + '"><option value="">—</option>' + H.map(function(h, i){ return '<option value="' + i + '"' + (m.map[k] === i ? ' selected' : '') + '>' + esc(h || T('Column ', '列 ') + (i + 1)) + '</option>'; }).join('') + '</select></label>'; };
  var h = '<p class="note">' + esc(m.name) + ' · ' + esc(m.sheet.sn) + ' · ' + L(m.sheet.rows.length + ' rows', m.sheet.rows.length + ' 行') + '</p><div class="fg">' + (many ? opt('doc', true) : '') + opt('cmt', true) + opt('rep') + opt('cdate') + opt('rdate') + opt('st') + opt('rev') + opt('no') + opt('by') + opt('cldate') + '</div>' +
    '<label class="chk"><input type="checkbox" id="cmImpSkip"' + (m.skip !== false ? ' checked' : '') + '>' + L('Skip comments already there (same revision and text)', '跳过已存在的意见（同一版本、同样内容）') + '</label>' +
    '<p class="note">' + L('Rows with no revision get the record’s current revision; rows with no date get today; a status is read from words like Open, Replied, Closed, Accepted, Not accepted (or 待回复、已回复、关闭、不接受).', '没有版本的行使用记录的当前版本；没有日期的行使用今天；状态按 Open、Replied、Closed、Accepted、Not accepted（或 待回复、已回复、关闭、不接受）等字样识别。') + '</p>' +
    '<div class="note"><b>' + L(plan.add.length + ' comments to add', '将新增 ' + plan.add.length + ' 条意见') + '</b>' + (plan.dup ? ' · ' + L(plan.dup + ' already there', plan.dup + ' 条已存在') : '') + (plan.empty ? ' · ' + L(plan.empty + ' rows without a comment', plan.empty + ' 行没有意见内容') : '') + (plan.miss.length ? ' · ' + L(plan.miss.length + ' rows with an unknown number: ', plan.miss.length + ' 行编号找不到：') + esc(plan.miss.slice(0, 6).join(', ')) + (plan.miss.length > 6 ? '…' : '') : '') + '</div>' +
    (plan.add.length ? '<div class="tbl-wrap card" style="max-height:240px"><table class="tbl cmtbl"><thead><tr>' + (many ? '<th>' + L('No.', '编号') + '</th>' : '') + '<th>' + L('Rev.', '版本') + '</th><th>' + L('Comment', '意见内容') + '</th><th>' + L('Our reply', '我方回复') + '</th><th>' + L('Status', '状态') + '</th></tr></thead><tbody>' + plan.add.slice(0, 8).map(function(a){ var o = optOf(cmCol(cmField(reg), 'st'), a.x.st); return '<tr>' + (many ? '<td class="mono">' + esc(recNo(reg, a.rec)) + '</td>' : '') + '<td class="mono">' + esc(a.x.rev || '') + '</td><td class="cmtx">' + esc(a.x.cmt) + '</td><td class="cmtx">' + esc(a.x.rep || '') + '</td><td>' + (o ? chip(o.color, esc(nm(o))) : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '');
  return {title:title, wide:true, html:h, foot:'<button type="button" class="btn pri" data-act="cmImpDo"' + (plan.add.length ? '' : ' disabled') + '>' + L('Import ' + plan.add.length + ' comments', '导入 ' + plan.add.length + ' 条意见') + '</button><button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button>'};
}
function cmImpPlan(m, reg){
  var f = cmField(reg), rec0 = m.rec && getRec(m.rec), out = {add:[], dup:0, empty:0, miss:[]}, byNo = {}, next = {}, seen = {};
  if(!rec0) recsOf(reg.id).forEach(function(r){ var k = String(recNo(reg, r) || '').trim().toLowerCase(); if(k) byNo[k] = r; });
  function cell(row, k){ var i = m.map[k]; return i == null || i === '' ? '' : row[+i]; }
  (m.sheet ? m.sheet.rows : []).forEach(function(row){
    var rec = rec0; if(!rec){ var no = String(cell(row, 'doc') || '').trim(); if(!no) return; rec = byNo[no.toLowerCase()]; if(!rec){ if(out.miss.indexOf(no) < 0) out.miss.push(no); return; } }
    var cmt = String(cell(row, 'cmt') == null ? '' : cell(row, 'cmt')).trim(); if(!cmt){ out.empty++; return; }
    var rep = String(cell(row, 'rep') == null ? '' : cell(row, 'rep')).trim(), rev = String(cell(row, 'rev') == null ? '' : cell(row, 'rev')).trim() || cmCurRev(reg, rec);
    var key = rec.id + '|' + rev + '|' + cmt.replace(/\s+/g, ' ').toLowerCase();
    if(m.skip !== false && (seen[key] || cmRows(rec, f).some(function(x){ return (x.rev || '') === rev && String(x.cmt || '').replace(/\s+/g, ' ').trim().toLowerCase() === cmt.replace(/\s+/g, ' ').toLowerCase(); }))){ out.dup++; return; }
    seen[key] = 1;
    if(next[rec.id] == null) next[rec.id] = +cmNextNo(cmRows(rec, f));
    var st = cmStatusOf(cell(row, 'st'), rep), no2 = String(cell(row, 'no') == null ? '' : cell(row, 'no')).trim();
    var x = {_id:uid('s'), no:no2 || String(next[rec.id]++), rev:rev, by:String(cell(row, 'by') || '').trim(), cmt:cmt, cdate:cmDate(cell(row, 'cdate')) || TODAY_S, rep:rep, rdate:cmDate(cell(row, 'rdate')), st:st, cldate:cmDate(cell(row, 'cldate')) || ''};
    if(no2 && /^\d+$/.test(no2) && +no2 >= next[rec.id]) next[rec.id] = +no2 + 1;
    out.add.push({rec:rec, x:x});
  });
  return out;
}
function cmImpDo(){
  var m = S.modal, reg = getReg(m.reg), f = reg && cmField(reg); if(!f || !canWrite(reg)) return;
  var plan = cmImpPlan(m, reg), by = {}; plan.add.forEach(function(a){ (by[a.rec.id] = by[a.rec.id] || []).push(a.x); });
  var list = Object.keys(by).map(function(id){ var r = getRec(id); return {rec:r, patch:mk(f.key, cmRows(r, f).concat(by[id]))}; });
  closeModal();
  setRecs(list).then(function(res){ toast(T(plan.add.length + ' comments imported into ' + ((res && res.ok) || 0) + ' records', '已导入 ' + plan.add.length + ' 条意见到 ' + ((res && res.ok) || 0) + ' 条记录')); });
}
DECK_MODALS.cmPaste = cmPasteModal; DECK_MODALS.cmImport = cmImportModal;

/* one-time (v3.3.1): TDS registers made before this version get the review-comments field */
var CM_RUN = false;
function cmUpgrade(){
  if(CM_RUN || !appReady()) return; CM_RUN = true;
  allRegs().filter(canWrite).forEach(function(reg){
    if(reg.d.migCm || cmField(reg)) return;
    var tds = reg.d.tpl === 'tds' || (fieldOf(reg, 'mfr') && fieldOf(reg, 'model') && fieldOf(reg, 'rev')); if(!tds) return;
    var fs = clone(fieldsOf(reg)), at = fs.map(function(f){ return f.key; }).indexOf('sheet'), nf = cmFieldDef();
    if(fs.some(function(f){ return f.key === nf.key; })) nf.key = 'rvc2';
    if(at < 0) fs.push(nf); else fs.splice(at, 0, nf);
    STORE.patchReg(reg.id, {fields:fs, migCm:1}).catch(function(){});
  });
}

/* ---------------- events ---------------- */
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act]'); if(!el) return;
  var act = el.dataset.act, v = el.dataset.v, rec = S.open && getRec(S.open), reg = rec ? getReg(rec.reg) : curReg(), f = reg && cmField(reg);
  switch(act){
    case 'cmAdd': if(rec && f && canWrite(reg)){ var nx = cmNew(reg, rec, f); setRec(rec, mk(f.key, clone(cmRows(rec, f)).concat([nx])), {silent:true}).then(function(){ S.cmFocus = nx._id; renderDrawer(); setTimeout(function(){ var t = document.querySelector('[data-fk="cm:' + nx._id + ':cmt"]'); if(t){ t.focus(); t.scrollIntoView({block:'center'}); } }, 30); }); } break;
    case 'cmFollow': if(rec && f && canWrite(reg)){ var src = cmRows(rec, f).filter(function(x){ return x._id === v; })[0], nf2 = cmNew(reg, rec, f, {ref:src ? '#' + src.no : '', rev:src ? src.rev : cmCurRev(reg, rec), by:src ? src.by : ''}); setRec(rec, mk(f.key, clone(cmRows(rec, f)).concat([nf2])), {silent:true}).then(function(){ S.cmFocus = nf2._id; renderDrawer(); setTimeout(function(){ var t = document.querySelector('[data-fk="cm:' + nf2._id + ':cmt"]'); if(t){ t.focus(); t.scrollIntoView({block:'center'}); } }, 30); }); } break;
    case 'cmDel': if(rec && f && canWrite(reg)){ var dx = cmRows(rec, f).filter(function(x){ return x._id === v; })[0]; if(!dx || ((dx.cmt || dx.rep) && !confirm(T('Delete comment #' + dx.no + '? You can restore it from the change log.', '删除意见 #' + dx.no + '？可在修改记录中恢复。')))) return; setRec(rec, mk(f.key, cmRows(rec, f).filter(function(x){ return x._id !== v; })), {silent:true}); } break;
    case 'cmSt': S.cmSt = S.cmSt || {}; S.cmSt[v] = !S.cmSt[v]; renderDrawer(); break;
    case 'cmRevAll': if(rec){ S.cmRev = {id:rec.id, v:'all'}; renderDrawer(); } break;
    case 'cmPaste': if(rec){ openModal({kind:'cmPaste', rec:rec.id, text:''}); setTimeout(function(){ var t = $('#cmPasteT'); if(t) t.focus(); }, 30); } break;
    case 'cmPasteDo': cmPasteDo(); break;
    case 'cmImport': if(reg && f) openModal({kind:'cmImport', reg:reg.id, rec:v || null, map:{}}); break;
    case 'cmImpDo': cmImpDo(); break;
    case 'cmExport': if(reg && f) cmExport(reg); break;
    case 'cmvSt': (function(){ var r = curReg(); if(!r) return; var c = cmFil(r), i = c.st.indexOf(v); if(i >= 0) c.st.splice(i, 1); else c.st.push(v); renderMain(); })(); break;
    case 'cmOpen': (function(){ S.cmFocus = v; openRec(el.dataset.id, 'rvc'); var r = getRec(el.dataset.id), g = r && getReg(r.reg); if(g && r){ var x = cmRows(r, cmField(g)).filter(function(y){ return y._id === v; })[0]; if(x && x.rev !== cmCurRev(g, r)){ S.cmRev = {id:r.id, v:'all'}; renderDrawer(); } } setTimeout(function(){ var c = document.getElementById('cm-' + v); if(c) c.scrollIntoView({block:'center'}); }, 60); })(); break;
  }
});
document.addEventListener('keydown', function(e){ var t = e.target; if((e.key === 'Enter' || e.key === ' ') && t && t.classList && t.classList.contains('cmrow')){ e.preventDefault(); t.click(); } });
document.addEventListener('change', function(e){
  var el = e.target, d = el.dataset && el.dataset.cm, p;
  if(d){ p = d.split('|'); var rec = getRec(p[0]), reg = rec && getReg(rec.reg), f = reg && cmField(reg); if(!f || !canWrite(reg)) return; var v = el.value; if(el.type === 'date' || el.classList.contains('dti')) v = normDate(v) || ''; cmSetRow(rec, f, p[1], p[2], v); return; }
  if(el.id === 'cmRev'){ var r0 = S.open && getRec(S.open); if(r0){ S.cmRev = {id:r0.id, v:el.value}; renderDrawer(); } return; }
  if(el.id === 'cmImpFile' && el.files && el.files[0]){ var m = S.modal, reg2 = getReg(m.reg); readSheet(el.files[0]).then(function(sh){ if(!sh || !sh.rows.length){ toast(T('No rows found in that file.', '文件中没有找到数据行。')); return; } m.name = el.files[0].name; m.sheet = sh; m.map = cmGuess(sh.headers, !m.rec); renderModal(); }).catch(function(er){ toast(T('Could not read the file: ', '无法读取文件：') + (er && er.message)); }); return; }
  if(el.dataset && el.dataset.cmmap && S.modal && S.modal.kind === 'cmImport'){ if(el.value === '') delete S.modal.map[el.dataset.cmmap]; else S.modal.map[el.dataset.cmmap] = +el.value; renderModal(); return; }
  if(el.id === 'cmImpSkip' && S.modal){ S.modal.skip = el.checked; renderModal(); return; }
  var r1 = curReg(); if(!r1 || !cmField(r1)) return;
  if(el.id === 'cmvCur'){ cmFil(r1).rev = el.checked ? 'cur' : 'all'; renderMain(); return; }
  if(el.id === 'cmvFrom' || el.id === 'cmvTo'){ cmFil(r1)[el.id === 'cmvFrom' ? 'from' : 'to'] = normDate(el.value) || ''; renderMain(); return; }
});
var cmQT;
document.addEventListener('input', function(e){
  var el = e.target;
  if(el.id === 'cmPasteT' && S.modal && S.modal.kind === 'cmPaste'){ S.modal.text = el.value; clearTimeout(cmQT); cmQT = setTimeout(function(){ var a = document.activeElement, s = a && a.selectionStart; S.modal.rev = ($('#cmPasteRev') || {}).value; S.modal.by = ($('#cmPasteBy') || {}).value; S.modal.date = ($('#cmPasteDate') || {}).value; renderModal(); var t = $('#cmPasteT'); if(t){ t.focus(); try{ t.setSelectionRange(s, s); }catch(_){} } }, 300); return; }
  if(el.id === 'cmvQ'){ var r = curReg(); if(r){ cmFil(r).q = el.value; clearTimeout(cmQT); cmQT = setTimeout(renderMain, 250); } }
});
