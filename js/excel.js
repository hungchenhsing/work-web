/* work-web v2 · Excel import (map each column to a field, preview, then write) and export / backup. */
'use strict';

function normH(h){ return String(h == null ? '' : h).toLowerCase().replace(/[\s\/／\\()（）:：_\-.·]+/g, ''); }
var IMP_SYN = {
  regNo:['no','序号','编号','regno','no序号'], docNo:['documentno','文件编号','docno','documentnumber'], rev:['rev','版本','revision'], node:['package','文件包类别','文件包','classcode','分类编号','workpackage','工作包'],
  dept:['department','部门','dept'], en:['documenttitle','title','titleen','englishtitle','activity','description','equipment','meeting'], zh:['文件名称','中文名称','名称','中文'],
  disc:['discipline','专业'], areas:['block','bolck','区域','areas','area'], start:['planstart','计划开始','start','开始'], finish:['planfinish','计划结束','finish','承诺日期','due','结束','到期'],
  actualStart:['actualsubmission','实际提交日期','submissiondate','actualstart','实际开始'], progress:['progress','完成率','%'], status:['status','状态'], explanation:['explanation','解释说明'],
  remarks:['remarks','备注','comments','意见'], contacts:['contacts','对接人','contact','owner','主责人','responsible','负责人'], type:['type','类型'], ownerResult:['ownerresult','业主结果'], extNote:['externalnote','对外备注']
};
var SPECIAL = [['','— ignore —','— 忽略 —'],['__phase','提交阶段 → start/finish dates','提交阶段 → 开始/结束日期'],['__task','Task / Document (EN / 中 together)','任务/文件（中英合并）'],['__actual','Actual dates range (a – b)','实际日期区间（a – b）'],['__ext','External (Yes/No)','对外（是/否）'],['__parent','Parent No. (makes it a sub-item)','上级编号（设为子项）'],['__star','Key ★ (Yes/No)','重点（是/否）']];
function guessField(reg, header){
  var n = normH(header); if(!n) return '';
  if(/提交阶段|submissionphase|^phase$/.test(n)) return '__phase';
  if(/任务文件|taskdocument/.test(n)) return '__task';
  if(/^对外$|^external$|^external对外$|^对外external$|^业主可见$|^ownercansee$|^ownercansee业主可见$/.test(n)) return '__ext';
  if(/^重点$|^key$|^key重点$|^重点key$|^★/.test(n)) return '__star';
  if(/parent|上级|父项/.test(n)) return '__parent';
  var best = '', bl = 0;
  dataFields(reg).forEach(function(f){ [f.key, f.en, f.zh].concat(IMP_SYN[f.key] || []).forEach(function(s){ s = normH(s); if(!s) return; if((n === s || (s.length >= 2 && n.indexOf(s) >= 0)) && s.length > bl){ best = f.key; bl = s.length; } }); });
  if(/实际提交|actualsubmission/.test(n) && fieldOf(reg, 'actualStart') && fieldOf(reg, 'actualEnd')) return '__actual';
  return best;
}
/* SheetJS (880 KB) is loaded only when a spreadsheet is imported or exported */
function xlsxLib(){ if(window.XLSX) return Promise.resolve(); return new Promise(function(res, rej){ var s = document.createElement('script'); s.src = 'vendor/xlsx-0.18.5.full.min.js'; s.onload = function(){ res(); }; s.onerror = function(){ rej(new Error('Could not load the spreadsheet library')); }; document.head.appendChild(s); }); }
/* the file is parsed in a worker (js/xlsx-worker.js), which is stopped after 60 seconds */
function parseBook(buf){
  return new Promise(function(res, rej){
    var w; try{ w = new Worker('js/xlsx-worker.js?v=' + appVer()); }catch(e){ rej(e); return; }
    var t = setTimeout(function(){ w.terminate(); rej(new Error(T('The spreadsheet took too long to read.', '读取表格超时。'))); }, 60000);
    w.onmessage = function(e){ clearTimeout(t); w.terminate(); var m = e.data || {}; if(m.ok) res(m.sheets || []); else rej(new Error(m.err || 'read error')); };
    w.onerror = function(e){ clearTimeout(t); w.terminate(); rej(new Error(e.message || 'read error')); };
    w.postMessage(buf, [buf]);
  });
}
/* only plain cell values come back into the page */
function cellVal(v){ return v instanceof Date || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : v == null ? '' : String(v); }
function readSheet(file){
  return file.arrayBuffer().then(parseBook).then(function(sheets){
    var best = null;
    sheets.forEach(function(sh){
      var sn = sh.sn, aoa = (Array.isArray(sh.aoa) ? sh.aoa : []).map(function(r){ return Array.isArray(r) ? r.map(cellVal) : []; });
      var hr = 0, hs = -1; for(var i = 0; i < Math.min(15, aoa.length); i++){ var sc = aoa[i].filter(function(v){ return typeof v === 'string' && v.trim() && v.length < 60; }).length; if(sc > hs){ hs = sc; hr = i; } }
      var rows = aoa.slice(hr + 1).filter(function(r){ return r.some(function(v){ return String(v).trim(); }); });
      if(!best || rows.length > best.rows.length) best = {sn:sn, headers:aoa[hr] || [], rows:rows, hr:hr};
    });
    return best;
  });
}
function impOpen(reg){ openModal({kind:'import', reg:reg.id, step:'file'}); }
function impFile(file){
  var m = S.modal, reg = getReg(m.reg);
  readSheet(file).then(function(sh){
    if(!sh || !sh.rows.length){ toast(T('No rows found in that file.', '文件中没有找到数据行。')); return; }
    m.name = file.name; m.sheet = sh; m.step = 'map';
    m.map = sh.headers.map(function(h){ return guessField(reg, h); });
    var used = {}; m.map = m.map.map(function(k){ if(k && k.indexOf('__') !== 0){ if(used[k]) return ''; used[k] = 1; } return k; });
    m.matchKey = rolesOf(reg).no || '';
    if(fieldOf(reg, 'docNo') && m.map.indexOf('docNo') >= 0 && m.map.indexOf(rolesOf(reg).no) < 0) m.matchKey = 'docNo';
    renderModal();
  }).catch(function(e){ toast(T('Could not read the file: ', '无法读取文件：') + (e && e.message)); });
}
function importModal(m){
  var reg = getReg(m.reg); if(!reg) return {title:'', html:''};
  if(m.step === 'file') return {title:L('Import Excel', '导入 Excel') + ' · ' + esc(regName(reg)), html:'<p class="note">' + L('Choose an .xlsx / .xls / .csv file. Next you will match each column to a field and see a preview — nothing is written until you confirm.', '选择 .xlsx / .xls / .csv 文件。下一步会把每一列对应到字段并预览，确认前不会写入任何数据。') + '</p><input type="file" id="impFile" accept=".xlsx,.xls,.csv">'};
  if(m.step === 'busy') return {title:L('Importing…', '导入中…'), html:'<p>' + esc(m.progress || '') + '</p>'};
  var sh = m.sheet, opts = SPECIAL.map(function(s){ return [s[0], T(s[1], s[2])]; }).concat(dataFields(reg).filter(function(f){ return ['calc','sub','files','link'].indexOf(f.type) < 0; }).map(function(f){ return [f.key, T1(f.en, f.zh) + ' · ' + T(TYPES[f.type].en, TYPES[f.type].zh)]; }));
  var plan = impPlan(m, reg);
  var h = '<p class="note">' + esc(m.name) + ' · ' + L('sheet', '工作表') + ' “' + esc(sh.sn) + '” · ' + sh.rows.length + ' ' + L('rows', '行') + '</p>';
  h += '<div class="tbl-wrap"><table class="tbl imap"><thead><tr><th>' + L('Column in file', '文件中的列') + '</th><th>' + L('Examples', '示例') + '</th><th>' + L('Goes into field', '写入字段') + '</th></tr></thead><tbody>' + sh.headers.map(function(hd, i){
    var ex = sh.rows.slice(0, 3).map(function(r){ var v = r[i]; return v instanceof Date ? parseDate(v) : String(v == null ? '' : v).slice(0, 30); }).filter(Boolean).join(' | ');
    return '<tr><td><b>' + esc(hd || '(' + T('column', '列') + ' ' + (i + 1) + ')') + '</b></td><td class="note">' + esc(ex) + '</td><td><select class="in" data-imap="' + i + '">' + opts.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (m.map[i] === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></td></tr>';
  }).join('') + '</tbody></table></div>';
  h += '<div class="fg" style="margin-top:10px"><label class="fl">' + L('Match existing records by', '按此字段匹配已有记录') + '<select class="in" id="impMatch"><option value="">' + esc(T('Do not match — always add new', '不匹配，全部新增')) + '</option>' + dataFields(reg).filter(function(f){ return f.type === 'text'; }).map(function(f){ return '<option value="' + esc(f.key) + '"' + (m.matchKey === f.key ? ' selected' : '') + '>' + esc(T1(f.en, f.zh)) + '</option>'; }).join('') + '</select></label></div>';
  h += '<div class="impsum card"><b>' + L('Preview', '预览') + '</b> · ' + L(plan.adds.length + ' new', '新增 ' + plan.adds.length) + ' · ' + L(plan.updates.length + ' updated', '更新 ' + plan.updates.length) + (plan.skipped ? ' · ' + L(plan.skipped + ' empty rows skipped', '跳过 ' + plan.skipped + ' 个空行') : '') +
    (plan.newOpts.length ? '<div class="note">' + L('New options that will be added: ', '将自动新增的选项：') + esc(plan.newOpts.slice(0, 30).join(', ')) + (plan.newOpts.length > 30 ? '…' : '') + '</div>' : '') +
    (plan.warn.length ? '<div class="note err">' + esc(plan.warn.slice(0, 8).join(' · ')) + '</div>' : '') + '<div class="note">' + L('Matched records are updated; empty cells never overwrite existing values; nothing is deleted. Every change is recorded and can be undone.', '已匹配的记录会被更新；空单元格不会覆盖原值；不会删除任何记录。所有修改都会被记录，可撤销。') + '</div></div>';
  return {title:L('Import Excel', '导入 Excel') + ' · ' + esc(regName(reg)), wide:true, html:h, foot:'<button type="button" class="btn pri" data-act="impRun"' + (plan.adds.length + plan.updates.length ? '' : ' disabled') + '>' + L('Import now', '立即导入') + '</button><button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button>'};
}
var LEGACY_PH = {'PH-01':['2026-08-17','2026-08-30'],'PH-02':['2026-09-01','2026-09-15'],'PH-03':['2026-09-16','2026-09-30'],'PH-04':['2026-10-01','2026-10-15'],'PH-05':['2026-10-16','2026-10-31']};
/* submission phases: PH-01…PH-05 as agreed, then every half month (1st–15th, 16th–month end) with no end date */
function phaseRange(n){
  n = +n; if(!(n >= 1)) return null; var k = 'PH-' + pad(n); if(LEGACY_PH[k]) return LEGACY_PH[k];
  var ks = Object.keys(LEGACY_PH).sort(), lastN = +ks[ks.length - 1].slice(3), d = d2n(LEGACY_PH[ks[ks.length - 1]][1]) + 1;
  for(var i = lastN + 1; i <= n && i < 1000; i++){ var t = new Date(d * 864e5), y = t.getUTCFullYear(), mo = t.getUTCMonth();
    var e = t.getUTCDate() <= 15 ? Math.round(Date.UTC(y, mo, 15) / 864e5) : Math.round(Date.UTC(y, mo + 1, 0) / 864e5);
    if(i === n) return [n2d(d), n2d(e)]; d = e + 1; }
  return null;
}
function impConvert(reg, f, raw, ctx){
  if(raw instanceof Date) raw = parseDate(raw);
  var s = String(raw == null ? '' : raw).trim(); if(s === '') return undefined;
  switch(f.type){
    case 'date': return parseDate(raw) || undefined;
    case 'number': return num(s) == null ? undefined : num(s);
    case 'percent': var p = parseFloat(s.replace('%', '')); if(isNaN(p)) return undefined; return clamp(Math.round(p > 0 && p <= 1 && s.indexOf('%') < 0 ? p * 100 : p), 0, 100);
    case 'check': return /^(y|yes|true|1|是|✓|√|x)$/i.test(s);
    case 'tree':
      var nodes = ctx.tree(f), low = s.toLowerCase(), m = /^([A-Za-z]?\d+(?:\.\d+)*)\s*(.*)$/.exec(s);
      var hit = nodes.filter(function(n){ return [n.code, n.en, n.zh, (n.code || '') + (n.zh || ''), (n.code || '') + ' ' + (n.zh || ''), (n.code || '') + ' ' + (n.en || '')].concat(n.aka || []).some(function(x){ return x && String(x).toLowerCase() === low; }); })[0];
      if(!hit && m) hit = nodes.filter(function(n){ return String(n.code || '').toLowerCase() === m[1].toLowerCase(); })[0];
      if(!hit && m && m[2]) hit = nodes.filter(function(n){ return n.zh === m[2] || n.en === m[2]; })[0];
      if(!hit){ hit = {id:uid('n'), parent:'', code: m ? m[1] : '', en: m ? (/[一-鿿]/.test(m[2]) ? '' : m[2]) : (/[一-鿿]/.test(s) ? '' : s), zh: m ? (/[一-鿿]/.test(m[2]) ? m[2] : '') : (/[一-鿿]/.test(s) ? s : '')}; if(!hit.en) hit.en = hit.zh || s; nodes.push(hit); ctx.newOpt(T1(f.en, f.zh) + ': ' + s); }
      return hit.id;
    case 'select':
      var opts = ctx.opts(f), parts = f.multi ? splitList(s, /\s*[,，;；、\/\n]\s*/) : [s];
      var out = parts.map(function(p){
        var pl = p.toLowerCase(), cand = f.list === 'blocks' ? p.replace(/block|区/ig, '').trim().toUpperCase() : null;
        var o = opts.filter(function(x){ return [x.v, x.en, x.zh].some(function(y){ return y && String(y).toLowerCase() === pl; }) || (cand && x.v === cand); })[0];
        var person = f.list === 'people' || f.list === 'subcon';   // names: exact match only (郑道明 must not become 郑道)
        if(!o && !person){ var mm = /^([a-zA-Z]+)\s*(.*)$/.exec(p); if(mm) o = opts.filter(function(x){ return x.v.toLowerCase() === mm[1].toLowerCase(); })[0]; }
        if(!o && f.list !== 'blocks' && !person) o = opts.filter(function(x){ return [x.en, x.zh].some(function(y){ return y && pl.indexOf(String(y).toLowerCase()) >= 0 && String(y).length > 1; }); })[0];
        if(!o){ var zh = /[一-鿿]/.test(p) && !/[A-Za-z]{3,}/.test(p); o = O(cand || (f.list === 'people' || f.list === 'subcon' ? p : p.length <= 14 ? p : slug(p) || uid('o')), zh ? p : p, zh ? p : '', COLORS[(opts.length + 1) % COLORS.length]); opts.push(o); ctx.newOpt(T1(f.en, f.zh) + ': ' + p); }
        return o.v;
      });
      if(f.multi && f.list === 'blocks' && /^(all|全场|site)/i.test(s)) return [];
      return f.multi ? out : out[0];
    default: return s;
  }
}
function impPlan(m, reg, apply){
  var sh = m.sheet, rows = sh.rows, newOpts = [], warn = [], adds = [], updates = [], skipped = 0;
  var draftOpts = {}, draftTree = {}, draftLists = {};
  var ctx = {
    opts:function(f){ if(f.list){ if(!draftLists[f.list]) draftLists[f.list] = clone(lists()[f.list].opts); return draftLists[f.list]; } if(!draftOpts[f.key]) draftOpts[f.key] = clone(f.opts || []); return draftOpts[f.key]; },
    tree:function(f){ if(!draftTree[f.key]) draftTree[f.key] = clone(f.tree || []); return draftTree[f.key]; },
    newOpt:function(s){ if(newOpts.indexOf(s) < 0) newOpts.push(s); }
  };
  var byKey = {}, mk = m.matchKey, ro = rolesOf(reg);
  if(mk) recsOf(reg.id).forEach(function(r){ var v = String(r.d[mk] || '').trim().toUpperCase(); if(v) byKey[v] = r; });
  var seen = {};
  rows.forEach(function(row, ri){
    var d = {};
    m.map.forEach(function(k, i){
      if(!k) return; var raw = row[i];
      if(k === '__phase'){ var s = String(raw || ''), pm = /PH\s*-?\s*(\d+)/i.exec(s); if(pm){ var w = phaseRange(+pm[1]); if(w){ d.__ph = w; } else warn.push((ri + 2) + ': ' + s + ' ?'); } return; }
      if(k === '__task'){ String(raw || '').split(/\s*\/\s*/).forEach(function(p){ p = p.trim(); if(!p) return; if(/[一-鿿]/.test(p)){ if(ro.title2 && !d[ro.title2]) d[ro.title2] = p; else if(!d[ro.title]) d[ro.title] = p; } else if(ro.title) d[ro.title] = d[ro.title] ? d[ro.title] + ' / ' + p : p; }); return; }
      if(k === '__actual'){ var a = String(raw instanceof Date ? parseDate(raw) : raw || ''), am = /(\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2})(?:\s*[-–~至]\s*(\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}))?/.exec(a); if(am){ d.actualStart = parseDate(am[1]); if(am[2]) d.actualEnd = parseDate(am[2]); } return; }
      if(k === '__ext'){ var e = String(raw || '').trim(); if(e) d.ext = /^(y|yes|true|1|是|对外|可见|业主可见)/i.test(e); return; }
      if(k === '__parent'){ var pv = String(raw == null ? '' : raw).trim(); if(pv) d.__parentNo = pv; return; }
      if(k === '__star'){ var st = String(raw || '').trim(); if(st) d.star = /^(y|yes|true|1|是|★|重点)/i.test(st); return; }
      var f = fieldOf(reg, k); if(!f) return;
      var v = impConvert(reg, f, raw, ctx); if(v !== undefined) d[k] = v;
    });
    if(d.__ph){ if(ro.start && !d[ro.start] && ro.finish && !d[ro.finish]){ d[ro.start] = d.__ph[0]; d[ro.finish] = d.__ph[1]; } delete d.__ph; }
    var keys = Object.keys(d); if(!keys.length || !keys.some(function(k){ return k === ro.title || k === ro.title2 || k === mk || k === ro.no; })){ skipped++; return; }
    var kv = mk && d[mk] ? String(d[mk]).trim().toUpperCase() : '';
    if(kv && seen[kv]){ warn.push(T('Row ', '第 ') + (ri + 2) + T(': duplicate ', ' 行：重复 ') + d[mk]); return; } if(kv) seen[kv] = 1;
    var ex = kv ? byKey[kv] : null;
    if(ex) updates.push({rec:ex, d:d}); else adds.push(d);
  });
  return {adds:adds, updates:updates, skipped:skipped, newOpts:newOpts, warn:warn, draftOpts:draftOpts, draftTree:draftTree, draftLists:draftLists};
}
async function impRun(){
  var m = S.modal, reg = getReg(m.reg); if(!reg || !canWrite(reg)) return;
  var plan = impPlan(m, reg);
  m.step = 'busy'; m.progress = T('Updating fields and options…', '正在更新字段与选项…'); renderModal();
  try{
    if(Object.keys(plan.draftLists).length){ var ls = clone(lists()); Object.keys(plan.draftLists).forEach(function(k){ ls[k].opts = plan.draftLists[k]; }); await STORE.saveCfg({lists:ls}); }
    if(Object.keys(plan.draftOpts).length || Object.keys(plan.draftTree).length){
      var fs = clone(fieldsOf(reg)); fs.forEach(function(f){ if(plan.draftOpts[f.key]) f.opts = plan.draftOpts[f.key]; if(plan.draftTree[f.key]) f.tree = plan.draftTree[f.key]; });
      await STORE.patchReg(reg.id, {fields:fs});
    }
    var ro = rolesOf(reg), pre = String(reg.d.prefix || 'REC').toUpperCase(), used = {}, nmax = 0, re = new RegExp('^' + pre.replace(/[^A-Z0-9]/g, '') + '-(\\d+)$', 'i');
    recsOf(reg.id).forEach(function(r){ var v = r.d[ro.no]; if(v){ used[String(v).toUpperCase()] = 1; var mm = re.exec(v); if(mm) nmax = Math.max(nmax, +mm[1]); } });
    var newRecs = plan.adds.map(function(d){
      if(ro.no && (!d[ro.no] || used[String(d[ro.no]).toUpperCase()] || /^\d+$/.test(String(d[ro.no])))){ d[ro.no] = pre + '-' + String(++nmax).padStart(3, '0'); }
      if(ro.no) used[String(d[ro.no]).toUpperCase()] = 1;
      var sf = rf(reg, 'status'); if(sf && !d[sf.key] && optsOf(sf)[0]) d[sf.key] = optsOf(sf)[0].v;
      return {id:uid('r'), reg:reg.id, d:d};
    });
    var noMap = {}; recsOf(reg.id).forEach(function(r){ if(ro.no && r.d[ro.no]) noMap[String(r.d[ro.no]).toUpperCase()] = r.id; }); newRecs.forEach(function(r){ if(ro.no && r.d[ro.no]) noMap[String(r.d[ro.no]).toUpperCase()] = r.id; });
    newRecs.forEach(function(r){ if(r.d.__parentNo){ var pid = noMap[String(r.d.__parentNo).toUpperCase()]; if(pid && pid !== r.id) r.d.parent = pid; } delete r.d.__parentNo; });
    plan.updates.forEach(function(u){ if(u.d.__parentNo){ var pid2 = noMap[String(u.d.__parentNo).toUpperCase()]; if(pid2 && pid2 !== u.rec.id) u.d.parent = pid2; } delete u.d.__parentNo; });
    m.progress = T('Adding ' + newRecs.length + ' records…', '正在新增 ' + newRecs.length + ' 条记录…'); renderModal();
    var res = newRecs.length ? await STORE.createRecs(newRecs, function(a, b){ m.progress = T('Adding records… ', '正在新增记录… ') + a + ' / ' + b; renderModal(); }) : {ok:0, failed:0};
    var ups = [];
    plan.updates.forEach(function(u){ var p = {}; Object.keys(u.d).forEach(function(k){ if(!same(u.rec.d[k], u.d[k])) p[k] = u.d[k]; }); if(Object.keys(p).length) ups.push({id:u.rec.id, patch:p}); });
    var ur = ups.length ? await STORE.patchRecs(ups, function(a, b){ m.progress = T('Updating records… ', '正在更新记录… ') + a + ' / ' + b; renderModal(); }) : {ok:0, failed:0};
    var uok = ur.ok, ufail = ur.failed;
    closeModal();
    toast(T('Imported: ' + res.ok + ' added, ' + uok + ' updated', '导入完成：新增 ' + res.ok + '，更新 ' + uok) + (res.failed + ufail ? T(', ' + (res.failed + ufail) + ' failed', '，失败 ' + (res.failed + ufail)) : '') +
      (res.renumbered ? T(' · ' + res.renumbered + ' numbers were already used and were given the next free ones', ' · ' + res.renumbered + ' 个编号已被使用，已改为下一个可用编号') : ''));
  }catch(e){ m.step = 'map'; renderModal(); toast(errText(e)); }
}

/* ---------------- export ---------------- */
function regSheet(reg, list){
  var fs = dataFields(reg).filter(function(f){ return f.type !== 'section'; });
  var head = fs.map(function(f){ return f.en + (f.zh && f.zh !== f.en ? ' ' + f.zh : ''); });
  if(reg.d.ownerPublish) head.push('Owner can see 业主可见'); head.push('Key 重点'); head.push('Parent No. 上级编号');
  var rows = list.map(function(r){
    var row = fs.map(function(f){
      var v = val(r, f);
      if(f.type === 'number' || f.type === 'percent') return num(v) == null ? '' : num(v);
      if(f.type === 'calc') return v == null ? '' : v;
      if(f.type === 'sub') return asArr(v).map(function(x){ return (f.cols || []).map(function(c){ return x[c.key] == null ? '' : (c.type === 'check' ? (x[c.key] ? '✓' : '') : x[c.key]); }).filter(function(y){ return y !== ''; }).join(' · '); }).join('\n');
      if(f.type === 'tree'){ var n = treeNode(f, v); return n ? (n.code ? n.code + ' ' : '') + (n.en || '') + (n.zh ? ' ' + n.zh : '') : ''; }
      if(f.type === 'select' && f.list === 'blocks') return asArr(v).join(', ');
      return textOf(reg, f, r);
    });
    if(reg.d.ownerPublish) row.push(r.d.ext ? 'Yes' : 'No'); row.push(r.d.star ? 'Yes' : ''); var pr = parentRec(r); row.push(pr ? recNo(reg, pr) : '');
    return row;
  });
  var ws = XLSX.utils.aoa_to_sheet([head].concat(rows));
  ws['!cols'] = fs.map(function(f){ return {wch: f.type === 'long' || f.key === rolesOf(reg).title ? 40 : f.type === 'sub' ? 50 : 14}; });
  ws['!freeze'] = {xSplit:0, ySplit:1};
  return ws;
}
function fname(base){ return slug(cfg().projectEn || 'work-web') + '_' + base + '_' + TODAY_S + '.xlsx'; }
function exportReg(reg){ xlsxLib().then(function(){ exportReg0(reg); }).catch(function(e){ toast(errText(e)); }); }
function exportReg0(reg){
  var wb = XLSX.utils.book_new(), list = sortRecs(reg, filteredRecs(reg));
  XLSX.utils.book_append_sheet(wb, regSheet(reg, list), String(reg.d.en || 'Register').replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31));
  XLSX.writeFile(wb, fname(slug(reg.d.en) || 'register'));
}
function backupXlsx(){ xlsxLib().then(backupXlsx0).catch(function(e){ toast(errText(e)); }); }
function backupXlsx0(){
  var wb = XLSX.utils.book_new(), names = {};
  allRegs().concat(libReg() ? [libReg()] : []).forEach(function(reg){ var n = String(reg.d.en || reg.id).replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 28), k = n, i = 1; while(names[k]) k = n.slice(0, 26) + ' ' + (++i); names[k] = 1; XLSX.utils.book_append_sheet(wb, regSheet(reg, sortRecs(reg, recsOf(reg.id))), k); });
  XLSX.writeFile(wb, fname('backup'));
}
function backupJson(){
  var data = {exported:new Date().toISOString(), cfg:STORE.cfg, registers:(STORE.regs || []).map(function(r){ return {id:r.id, visibility:r.vis, data:r.d}; }), records:allRecs().map(function(r){ return {id:r.id, register_id:r.reg, data:r.d}; })};
  saveJson(data, slug(cfg().projectEn) + '_backup_' + TODAY_S + '.json');
}
function saveJson(data, name){
  var blob = new Blob([JSON.stringify(data, null, 1)], {type:'application/json'}), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------------- meeting minutes print ---------------- */
function printMinutes(rec){
  var reg = getReg(rec.reg), d = rec.d, c = cfg();
  function fv(k){ var f = fieldOf(reg, k); return f ? esc(textOf(reg, f, rec)) : ''; }
  function carryPrint(){ var f = fieldOf(reg, 'actions'); if(!isActionField(f)) return ''; var list = earlierActions(reg, rec, f); if(!list.length) return '';
    return '<h2>Still open from earlier meetings 之前会议未完成的待办</h2><table><thead><tr><th>#</th><th>Action<br><small>事项</small></th><th>Owner<br><small>负责人</small></th><th>Due<br><small>期限</small></th><th>From<br><small>来自</small></th></tr></thead><tbody>' +
      list.map(function(x, i){ return '<tr><td>' + (i + 1) + '</td><td>' + esc(x.text).replace(/\n/g, '<br>') + '</td><td>' + esc(x.who) + '</td><td>' + esc(x.due != null ? n2d(x.due) : '') + '</td><td>' + esc(recNo(reg, x.rec)) + '</td></tr>'; }).join('') + '</tbody></table>'; }
  function sub(k){ var f = fieldOf(reg, k); if(!f) return ''; var rows = asArr(d[k]); if(!rows.length) return '<p class="m">—</p>'; return '<table><thead><tr><th>#</th>' + (f.cols || []).map(function(cc){ return '<th>' + esc(cc.en) + (cc.zh ? '<br><small>' + esc(cc.zh) + '</small>' : '') + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function(r, i){ return '<tr><td>' + (i + 1) + '</td>' + (f.cols || []).map(function(cc){ var v = r[cc.key]; return '<td>' + (cc.type === 'check' ? (v ? '✓' : '') : esc(subVal(cc, v))).replace(/\n/g, '<br>') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'; }
  var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(recLabel(rec)) + '</title><style>body{font:13px/1.5 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#111;margin:28px}h1{font-size:19px;margin:0 0 2px}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #999;padding-bottom:2px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f1f1f1}.meta td{border:0;padding:2px 10px 2px 0}.m{color:#666}small{color:#666;font-weight:400}td:first-child,th:first-child{width:30px}@media print{body{margin:12mm}}</style></head><body>' +
    '<div class="m">' + esc(c.projectEn + ' · ' + c.projectZh) + '</div><h1>' + esc(recTitle(reg, rec)) + '</h1>' + (d.zh && d.en ? '<div>' + esc(d.zh) + '</div>' : '') +
    '<table class="meta"><tr><td><b>No.</b> ' + esc(recNo(reg, rec)) + '</td><td><b>Date 日期</b> ' + fv('date') + ' ' + fv('time') + '</td><td><b>Type 类型</b> ' + fv('mtype') + '</td><td><b>Location 地点</b> ' + fv('loc') + '</td></tr><tr><td colspan="4"><b>Chair 主持</b> ' + fv('chair') + ' &nbsp; <b>Attendees 参会人</b> ' + fv('attendees') + '</td></tr></table>' +
    '<h2>Agenda 议程</h2>' + sub('agenda') + '<h2>Minutes 会议纪要</h2><div>' + esc(d.minutes || '—').replace(/\n/g, '<br>') + '</div><h2>Action items 待办事项</h2>' + sub('actions') + carryPrint() +
    '<p class="m" style="margin-top:24px">Printed ' + esc(fmtTime(new Date().toISOString())) + '</p></body></html>';
  var w = window.open('', '_blank'); if(!w){ toast(T('Allow pop-ups to print.', '请允许弹出窗口以打印。')); return; }
  w.document.open(); w.document.write(html); w.document.close(); setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} }, 300);
}
