/* work-web · Team & contacts directory (v2.7).
   One register of kind 'people' is the source of every "people" dropdown (Responsible, Contacts, Raised by, Chair,
   Attendees…): the options are its records, by name. People who left stay on old records but are not offered again.
   Relations: "Reports to" links people to people; each person's record lists where they are assigned across registers.
   What records store is the person's dropdown code (e.g. "jj") or, when it is empty, the name: with a code a rename
   changes nothing in the records; without one, a rename can be carried into every record using the old name.
   The "Match names" tool maps names typed or imported in other spellings onto directory entries. */
'use strict';

function peopleDir(){ return memo('peopleDir', function(){ return allRegs().filter(function(r){ return r.d.kind === 'people' && !isPrivate(r); })[0] || null; }); }
function isPeopleReg(reg){ return !!reg && reg.d.kind === 'people'; }
function personNames(rec){ var dir = rec && getReg(rec.reg), ro = rolesOf(dir); return [rec && rec.d[ro.title], rec && rec.d[ro.title2]].map(function(x){ return typeof x === 'string' ? x.trim() : ''; }).filter(Boolean); }
function personName(rec){ return personNames(rec)[0] || ''; }
/* what records store for a person: the dropdown code, else the name */
function personValueOf(reg, d){ var ro = rolesOf(reg), k = String((d && d.key) || '').trim(); return k || String((d && d[ro.title]) || '').trim() || String((d && d[ro.title2]) || '').trim(); }
function personValue(rec){ return personValueOf(getReg(rec.reg), rec.d); }
function personKeys(rec){ var a = [personValue(rec)].concat(personNames(rec)); return a.filter(function(x, i){ return x && a.indexOf(x) === i; }); }
/* the dropdown options: one per person, by name; people who left are kept for display but not offered */
function peopleOpts(){
  var dir = peopleDir(); if(!dir) return null;
  return memo('peopleOpts', function(){
    var ro = rolesOf(dir), out = [], seen = {};
    recsOf(dir.id).forEach(function(r){
      var en = String(r.d[ro.title] || '').trim(), zh = String(r.d[ro.title2] || '').trim(), v = personValueOf(dir, r.d);
      if(!v || seen[v]) return; seen[v] = 1;
      out.push({v:v, en:en || zh || v, zh:en && zh ? zh : '', color:'grey', left:r.d.active === 'left', pid:r.id});
    });
    return out.sort(function(a, b){ return a.en.localeCompare(b.en); });
  });
}
function peopleFields(reg){ return dataFields(reg).filter(function(f){ return f.type === 'select' && f.list === 'people'; }); }
/* people columns inside sub-tables (e.g. the owner of a meeting action): [{f: the sub-table field, c: the column}] */
function peopleSubCols(reg){ var out = []; dataFields(reg).forEach(function(f){ if(f.type === 'sub') (f.cols || []).forEach(function(c){ if(c.type === 'select' && c.list === 'people') out.push({f:f, c:c}); }); }); return out; }
/* where a set of names is used: [{reg, rec, keys, rows}] across every register you can see (rows: sub-table rows naming them) */
function peopleRefs(names){
  var want = {}; (names || []).forEach(function(n){ if(n) want[n] = 1; }); var out = [];
  allRegs().forEach(function(reg){
    if(isPeopleReg(reg)) return; var fs = peopleFields(reg), sc = peopleSubCols(reg); if(!fs.length && !sc.length) return;
    recsOf(reg.id).forEach(function(r){ var ks = fs.filter(function(f){ return asArr(r.d[f.key]).some(function(v){ return want[v]; }); }).map(function(f){ return f.key; }), rows = [];
      sc.forEach(function(x){ asArr(r.d[x.f.key]).forEach(function(row){ if(row && asArr(row[x.c.key]).some(function(v){ return want[v]; })){ rows.push({key:x.f.key, col:x.c.key, row:row}); if(ks.indexOf(x.f.key) < 0) ks.push(x.f.key); } }); });
      if(ks.length) out.push({reg:reg, rec:r, keys:ks, rows:rows}); });
  });
  return out;
}
/* replace a name with another in every people field (records you can edit); resolves to the number of records changed */
function peopleReplace(from, to){
  var ps = [], n = 0;
  allRegs().forEach(function(reg){
    if(isPeopleReg(reg) || !canWrite(reg)) return; var fs = peopleFields(reg), sc = peopleSubCols(reg); if(!fs.length && !sc.length) return;
    recsOf(reg.id).forEach(function(r){
      var patch = {};
      fs.forEach(function(f){ var v = r.d[f.key];
        if(Array.isArray(v)){ if(v.indexOf(from) < 0) return; var nv = []; v.forEach(function(x){ var y = x === from ? to : x; if(y && nv.indexOf(y) < 0) nv.push(y); }); patch[f.key] = nv; }
        else if(v === from) patch[f.key] = f.multi ? [to] : to; });
      sc.forEach(function(x){ var rows = asArr(patch[x.f.key] || r.d[x.f.key]), hit = false;
        var nr = rows.map(function(row){ if(!row) return row; var cv = row[x.c.key];
          if(Array.isArray(cv) && cv.indexOf(from) >= 0){ hit = true; row = clone(row); var nv = []; cv.forEach(function(y){ y = y === from ? to : y; if(y && nv.indexOf(y) < 0) nv.push(y); }); row[x.c.key] = nv; }
          else if(cv === from){ hit = true; row = clone(row); row[x.c.key] = x.c.multi ? [to] : to; }
          return row; });
        if(hit) patch[x.f.key] = nr; });
      if(Object.keys(patch).length){ n++; ps.push({id:r.id, patch:patch}); }
    });
  });
  return (ps.length ? STORE.patchRecs(ps) : Promise.resolve()).then(function(){ return n; });
}
/* after what records store for a person changes (code, or the name when there is no code): offer to carry it over */
function peopleAfterSave(reg, rec, old, changed){
  if(!isPeopleReg(reg)) return;
  var from = personValueOf(reg, Object.assign({}, rec.d, old)), to = personValueOf(reg, Object.assign({}, rec.d, changed)); if(!from || !to || from === to) return;
  var n = peopleRefs([from]).length; if(!n) return;
  S.pRename = {from:from, to:to};
  setTimeout(function(){ toast(T(n + ' records still use “' + from + '”. Update them to “' + to + '”?', n + ' 条记录仍使用「' + from + '」，改为「' + to + '」？'), {act:'peopleRename', label:T('Update', '更新')}); }, 300);
}
function peopleRename(){
  var x = S.pRename; if(!x) return; S.pRename = null;
  peopleReplace(x.from, x.to).then(function(n){ toast(T(n + ' records updated', '已更新 ' + n + ' 条记录')); }).catch(function(e){ toast(errText(e)); });
}
/* a name typed into a people dropdown becomes a new person in the directory */
function peopleAdd(label){
  var dir = peopleDir(); label = String(label || '').trim(); if(!dir || !label || !canWrite(dir)) return Promise.resolve(null);
  var ro = rolesOf(dir), d = {}; d[/[一-鿿]/.test(label) && !/[A-Za-z]{3,}/.test(label) && ro.title2 ? ro.title2 : ro.title] = label;
  if(fieldOf(dir, 'active')) d.active = 'active';
  return createRec(dir, d, false).then(function(){ return label; });
}

/* ---------------- a person's record: who reports to them, and where they are assigned ---------------- */
function peopleWorkCount(reg, rec){ return memo('pwork:' + rec.id, function(){ return peopleRefs(personKeys(rec)).length + peopleReports(reg, rec).length; }); }
function peopleReports(reg, rec){ var lk = dataFields(reg).filter(function(f){ return f.type === 'link' && (f.link || []).indexOf('self') >= 0; })[0]; if(!lk) return [];
  return recsOf(reg.id).filter(function(r){ return asArr(r.d[lk.key]).indexOf(rec.id) >= 0; }); }
function peopleWork(reg, rec){
  var names = personKeys(rec), reps = peopleReports(reg, rec), refs = peopleRefs(names), h = '';
  h += '<h3 class="fsec">' + L('Reporting to this person', '向此人汇报') + ' <span class="cnt">' + reps.length + '</span></h3>' +
    (reps.length ? '<div class="links">' + reps.map(function(r){ return recRow(r); }).join('') + '</div>' : '<p class="note">' + L('Nobody yet. Set “Reports to” on a team member’s record.', '暂无。可在成员记录中设置「汇报对象」。') + '</p>');
  h += '<h3 class="fsec">' + L('Assigned in registers', '在各台账中的事项') + ' <span class="cnt">' + refs.length + '</span></h3>';
  if(!names.length) return h + '<p class="note">' + L('Give this person a name first.', '请先填写姓名。') + '</p>';
  if(!refs.length) return h + '<p class="note">' + L('Not named in any record yet. Records list people in fields such as Responsible, Contacts or Attendees.', '尚未出现在任何记录中。记录通过负责人、对接人、参会人等字段关联到人。') + '</p>';
  var by = {}; refs.forEach(function(x){ (by[x.reg.id] = by[x.reg.id] || {reg:x.reg, items:[]}).items.push(x); });
  Object.keys(by).forEach(function(id){ var g = by[id], fl = {};
    g.items.forEach(function(x){ x.keys.forEach(function(k){ var f = fieldOf(g.reg, k); if(f) fl[k] = T1(f.en, f.zh); }); });
    h += '<div class="pw-reg"><b>' + icon(g.reg.d.icon, 13) + ' ' + esc(regName(g.reg)) + '</b> <span class="muted">' + g.items.length + ' · ' + esc(Object.keys(fl).map(function(k){ return fl[k]; }).join(', ')) + '</span></div>' +
      '<div class="links">' + sortRecs(g.reg, g.items.map(function(x){ return x.rec; })).slice(0, 200).map(function(r){ return recRow(r); }).join('') + (g.items.length > 200 ? '<p class="note">' + L('Showing the first 200.', '仅显示前 200 条。') + '</p>' : '') + '</div>';
  });
  return h;
}

/* ---------------- Match names: names used in records that are not in the directory ---------------- */
function pnorm(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9一-鿿]+/g, ''); }
function ptoks(s){ return String(s || '').toLowerCase().split(/[^a-z0-9一-鿿]+/).filter(Boolean).sort().join(' '); }
function peopleUnmatched(){
  var po = peopleOpts() || [], known = {}, m = {};
  po.forEach(function(o){ known[o.v] = 1; });
  function see(reg, v){ if(typeof v !== 'string' || !v.trim() || known[v]) return; var x = m[v] || (m[v] = {v:v, n:0, regs:{}}); x.n++; x.regs[reg.id] = 1; }
  allRegs().forEach(function(reg){ if(isPeopleReg(reg)) return; peopleFields(reg).forEach(function(f){ recsOf(reg.id).forEach(function(r){ asArr(r.d[f.key]).forEach(function(v){ see(reg, v); }); }); });
    peopleSubCols(reg).forEach(function(x){ recsOf(reg.id).forEach(function(r){ asArr(r.d[x.f.key]).forEach(function(row){ if(row) see(reg, row[x.c.key]); }); }); }); });
  return Object.keys(m).map(function(k){ return m[k]; }).sort(function(a, b){ return b.n - a.n || a.v.localeCompare(b.v); });
}
/* a likely directory entry for a name written another way (case, spaces, hyphens, commas, order, Chinese name) */
function peopleGuess(v){
  var dir = peopleDir(); if(!dir) return '';
  var nv = pnorm(v), tv = ptoks(v), hit = '';
  recsOf(dir.id).some(function(r){ var names = personNames(r), main = personValue(r); if(!main) return false;
    var ok = names.some(function(n){ var pn = pnorm(n); return pn === nv || ptoks(n) === tv ||
      (pn.length >= 2 && nv.indexOf(pn) >= 0 && /[一-鿿]/.test(n)) ||     /* "Wang Lei 王磊" written for the person 王磊 */
      (nv.length >= 2 && /^[一-鿿]+$/.test(nv) && pn.indexOf(nv) >= 0); });   /* "王磊" written for "Wang Lei 王磊" */
    if(ok) hit = main; return ok; });
  return hit;
}
function peopleMatchModal(m){
  var dir = peopleDir(); if(!dir) return {title:L('Match names', '名字对照'), html:'<p class="note">' + L('Create the Team & contacts register first.', '请先创建「团队与联系人」台账。') + '</p>'};
  if(!m.rows){ m.rows = peopleUnmatched(); m.pick = {}; m.rows.forEach(function(x){ m.pick[x.v] = peopleGuess(x.v); }); }
  var po = (peopleOpts() || []).filter(function(o){ return !o.left; });
  if(m.done) return {title:L('Match names', '名字对照'), html:'<p>' + esc(m.done) + '</p>', foot:'<button type="button" class="btn pri" data-act="mclose">' + L('Done', '完成') + '</button>'};
  var h = '<p class="note">' + L('Names below are used in records but are not in Team & contacts. Choose who each one is: every record using that name is updated to the directory name. “Add as a new person” keeps the name and adds it to the directory.', '以下名字在记录中使用，但不在「团队与联系人」中。为每个名字选择对应的人：使用该名字的记录会统一改为名录中的名字。「新增为新人员」则保留名字并加入名录。') + '</p>';
  if(!m.rows.length) h += '<div class="card empty">' + L('Every name in your records is in the directory.', '所有记录中的名字都已在名录中。') + '</div>';
  else h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + L('Name in records', '记录中的名字') + '</th><th>' + L('Records', '记录数') + '</th><th>' + L('Is', '对应') + '</th></tr></thead><tbody>' +
    m.rows.map(function(x, i){ var cur = m.pick[x.v] || '';
      return '<tr><td><b>' + esc(x.v) + '</b></td><td class="mono">' + x.n + '</td><td><select class="in" data-pm="' + i + '">' +
        '<option value=""' + (!cur ? ' selected' : '') + '>' + esc(T('— leave as is —', '— 保持不变 —')) + '</option>' +
        '<option value="__new"' + (cur === '__new' ? ' selected' : '') + '>' + esc(T('Add as a new person', '新增为新人员')) + '</option>' +
        po.map(function(o){ return '<option value="' + esc(o.v) + '"' + (cur === o.v ? ' selected' : '') + '>' + esc(nm(o)) + '</option>'; }).join('') + '</select></td></tr>'; }).join('') + '</tbody></table></div>';
  var n = m.rows.filter(function(x){ return m.pick[x.v]; }).length;
  return {title:L('Match names', '名字对照'), wide:true, html:h,
    foot:'<button type="button" class="btn" data-act="mclose">' + L('Cancel', '取消') + '</button><button type="button" class="btn pri" data-act="peopleMatchApply"' + (n && !m.busy ? '' : ' disabled') + '>' + (m.busy ? L('Updating…', '正在更新…') : L('Apply ' + n, '应用 ' + n + ' 项')) + '</button>'};
}
DECK_MODALS.peopleMatch = peopleMatchModal;
async function peopleMatchApply(){
  var m = S.modal; if(!m || m.kind !== 'peopleMatch' || m.busy) return;
  m.busy = true; renderModal();
  var recs = 0, added = 0, mapped = 0;
  try{
    for(var i = 0; i < m.rows.length; i++){ var x = m.rows[i], p = m.pick[x.v]; if(!p) continue;
      if(p === '__new'){ await peopleAdd(x.v); added++; }
      else { recs += await peopleReplace(x.v, p); mapped++; } }
    m.busy = false; m.done = T(mapped + ' names matched (' + recs + ' records updated), ' + added + ' people added.', '已对照 ' + mapped + ' 个名字（更新 ' + recs + ' 条记录），新增 ' + added + ' 人。'); renderModal();
  }catch(e){ m.busy = false; toast(errText(e)); renderModal(); }
}

document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act^="people"]'); if(!el) return;
  var act = el.dataset.act;
  if(act === 'peopleRename') peopleRename();
  else if(act === 'peopleMatch'){ closePop(); openModal({kind:'peopleMatch'}); }
  else if(act === 'peopleMatchApply') peopleMatchApply();
  else if(act === 'peopleOpenDir'){ var dir = peopleDir(); if(dir){ closeModal(); S.page = 'reg'; S.reg = dir.id; renderAll(); } }
});
document.addEventListener('change', function(e){
  var el = e.target; if(!el || !el.dataset || el.dataset.pm == null) return; var m = S.modal; if(!m || m.kind !== 'peopleMatch' || !m.rows) return;
  var x = m.rows[+el.dataset.pm]; if(x){ m.pick[x.v] = el.value; renderModal(); }
});

/* ---------------- one-time upgrade (v3.0): the owner of a meeting action becomes a person from the directory ----------------
   Registers made from the meetings template had a free-text "Owner" column in their action items. It becomes a people
   dropdown; owners written exactly as a person's name (English, Chinese or both) are switched to that person. */
var PSUB_RUN = false, PSUB_HIT = {};   // registers the v3.0 upgrade changed in this session (the v3.3 one waits for the next start)
function peopleSubUpgrade(){
  if(PSUB_RUN || !appReady() || !canTeamEdit()) return; var dir = peopleDir(); if(!dir) return; PSUB_RUN = true;
  allRegs().filter(canWrite).forEach(function(reg){
    if(isPeopleReg(reg) || reg.d.whoPeople) return;
    var fs = clone(fieldsOf(reg)), hit = [];
    fs.forEach(function(f){ if(f.type !== 'sub') return; (f.cols || []).forEach(function(c){ if(c.key === 'who' && c.type === 'text'){ c.type = 'select'; c.list = 'people'; hit.push({f:f.key, c:c.key}); } }); });
    if(!hit.length) return;
    PSUB_HIT[reg.id] = 1;
    var byName = {}; recsOf(dir.id).forEach(function(r){ var v = personValue(r); if(!v) return; personNames(r).concat([personNames(r).join(' ')]).forEach(function(n){ n = String(n || '').trim().toLowerCase(); if(n && !byName[n]) byName[n] = v; }); });
    STORE.patchReg(reg.id, {fields:fs, whoPeople:1}).then(function(){
      var list = [];
      recsOf(reg.id).forEach(function(r){ var patch = {};
        hit.forEach(function(h){ var rows = asArr(patch[h.f] || r.d[h.f]), ch = false;
          var nr = rows.map(function(row){ var v = row && typeof row[h.c] === 'string' ? byName[row[h.c].trim().toLowerCase()] : null; if(v && v !== row[h.c]){ ch = true; row = clone(row); row[h.c] = v; } return row; });
          if(ch) patch[h.f] = nr; });
        if(Object.keys(patch).length) list.push({rec:r, patch:patch}); });
      return setRecs(list);
    }).catch(function(){});
  });
}

/* ---------------- one-time upgrade (v3.3): several people / companies ----------------
   Meeting actions can have several owners; a punch item several people who raised it and several subcontractors.
   Only fields still as the templates made them are changed; the change and the converted records are in the change log. */
var MULTI_RUN = false;
function multiUpgrade(){
  if(MULTI_RUN || !appReady() || !canTeamEdit()) return; MULTI_RUN = true;
  allRegs().filter(canWrite).forEach(function(reg){
    if(reg.d.mig33 || isPeopleReg(reg)) return;
    if(PSUB_HIT[reg.id] || (!reg.d.whoPeople && peopleDir() && fieldsOf(reg).some(function(f){ return f.type === 'sub' && (f.cols || []).some(function(c){ return c.key === 'who' && c.type === 'text'; }); }))) return;   // the v3.0 upgrade of this register goes first (next start)
    var fs = clone(fieldsOf(reg)), hit = [], punch = reg.d.tpl === 'punch' || (fieldOf(reg, 'raisedBy') && fieldOf(reg, 'subcon') && fieldOf(reg, 'prio'));
    fs.forEach(function(f){
      if(punch && f.type === 'select' && !f.multi && ((f.key === 'raisedBy' && f.list === 'people') || (f.key === 'subcon' && f.list === 'subcon'))){ f.multi = true; hit.push({key:f.key, to:true}); }
      if((reg.d.tpl === 'meetings' || reg.d.meeting) && f.type === 'sub' && f.key === 'actions') (f.cols || []).forEach(function(c){ if(c.key === 'who' && c.type === 'select' && c.list === 'people' && !c.multi){ c.multi = true; hit.push({key:f.key, col:c.key, to:true}); } });
    });
    if(!hit.length) return;
    STORE.patchReg(reg.id, {fields:fs, mig33:1}).then(function(){ var c = multiPatches(reg, hit); return c.list.length ? setRecs(c.list) : null; }).catch(function(){});
  });
}

/* ---------------- My work (v3.0): everything assigned to the person signed in ----------------
   Who you are: the directory entry whose email is your sign-in email, or the person you pick (remembered in this browser).
   What counts: open records where you are in a responsible-type people field (not Attendees, Chair or Raised by),
   and open meeting actions you own. Grouped by when they are due. */
var MINE_SKIP = /^(attendees|chair|raisedBy|raised|presenter)$/i;
function myPerson(){
  var dir = peopleDir(); if(!dir) return null;
  var pid = LS.get('ww2.mePid', null), r = pid && getRec(pid); if(r && r.reg === dir.id) return r;
  var em = String((STORE && STORE.me && STORE.me.email) || '').trim().toLowerCase(); if(!em) return null;
  return recsOf(dir.id).filter(function(x){ return String(x.d.email || '').trim().toLowerCase() === em; })[0] || null;
}
function myWork(){
  var me = myPerson(); if(!me) return null;
  return memo('mywork:' + me.id, function(){
    var A = asOfN(), out = [];
    peopleRefs(personKeys(me)).forEach(function(x){
      var main = x.keys.filter(function(k){ var f = fieldOf(x.reg, k); return f && f.type !== 'sub' && !MINE_SKIP.test(k); });
      if(main.length && !isDone(x.reg, x.rec) && !isHead(x.reg, x.rec)){ var p = planOf(x.reg, x.rec); out.push({kind:'rec', reg:x.reg, rec:x.rec, due:p ? p.f : null, title:recTitle(x.reg, x.rec), no:recNo(x.reg, x.rec)}); }
      (x.rows || []).forEach(function(rw){ var sf = fieldOf(x.reg, rw.key), cols = (sf && sf.cols) || [], ck = (cols.filter(function(c){ return c.type === 'check'; })[0] || {}).key, dk = (cols.filter(function(c){ return c.type === 'date'; })[0] || {}).key, tk = (cols.filter(function(c){ return c.type === 'long' || c.type === 'text'; })[0] || {}).key;
        if(ck && rw.row[ck]) return; out.push({kind:'act', reg:x.reg, rec:x.rec, due:dk ? d2n(rw.row[dk]) : null, title:(tk && rw.row[tk]) || '—', no:recNo(x.reg, x.rec)}); });
    });
    out.forEach(function(e){ e.grp = e.due == null ? 3 : e.due < A ? 0 : e.due <= A + 14 ? 1 : 2; });
    return out.sort(function(a, b){ return a.grp - b.grp || (a.due == null ? 1e9 : a.due) - (b.due == null ? 1e9 : b.due) || String(a.no).localeCompare(String(b.no)); });
  });
}
function viewMine(){
  var dir = peopleDir(), me = myPerson();
  var h = '<div class="ph"><div><h1 class="vtitle">' + L('My work', '我的工作') + '</h1><span class="muted">' + (me ? esc(personName(me)) + ' · ' : '') + L('open items where you are responsible, and your meeting actions', '你负责的未完成事项，以及你的会议待办') + '</span></div></div>';
  if(!dir) return h + '<div class="card empty">' + L('This needs the Team & contacts register (Settings → Registers → New register → Team & contacts).', '需要先建立「团队与联系人」台账（设置 → 台账 → 新建台账 → Team & contacts）。') + '</div>';
  var pick = '<select class="in" id="mePick" aria-label="' + esc(T('Which person are you?', '你是哪位？')) + '"><option value="">' + esc(T('Choose…', '请选择…')) + '</option>' + recsOf(dir.id).filter(function(r){ return r.d.active !== 'left'; }).map(function(r){ return '<option value="' + esc(r.id) + '"' + (me && me.id === r.id ? ' selected' : '') + '>' + esc(personName(r)) + '</option>'; }).join('') + '</select>';
  if(!me) return h + '<div class="card sec"><p>' + L('Which person in Team & contacts are you? (Found automatically when your entry has your sign-in email.)', '你是「团队与联系人」中的哪一位？（如果你的条目填写了登录邮箱，会自动识别。）') + '</p><div class="row">' + pick + '</div></div>';
  var items = myWork() || [], G = [['Overdue', '已逾期'], ['Due in the next 14 days', '未来 14 天到期'], ['Later', '之后'], ['No date', '无日期']];
  h += '<div class="row" style="margin-bottom:10px"><span class="note">' + L('You are:', '你是：') + '</span>' + pick + '</div>';
  if(!items.length) return h + '<div class="card empty">' + L('Nothing open is assigned to you.', '目前没有分配给你的未完成事项。') + '</div>';
  G.forEach(function(g, gi){ var list = items.filter(function(e){ return e.grp === gi; }); if(!list.length) return;
    h += '<section class="card sec"><div class="sech"><h2>' + L(g[0], g[1]) + ' <span class="cnt">' + list.length + '</span></h2></div>' + list.map(function(e){
      var st = e.kind === 'rec' ? statusOpt(e.reg, e.rec) : null;
      return '<button type="button" class="lrow2 mw" data-act="openRec" data-id="' + esc(e.rec.id) + '"><span class="ri c-' + esc(e.reg.d.color || 'blue') + '">' + icon(e.reg.d.icon, 13) + '</span><span class="mono muted">' + esc(e.no) + '</span><span class="lt">' + (e.kind === 'act' ? '<span class="chip c-grey">' + L('Action', '待办') + '</span> ' : '') + esc(e.title) + '</span><span class="mwst">' + (st ? optChip(st) : '') + '</span><span class="mono nowrap' + (gi === 0 ? ' od' : '') + '">' + (e.due != null ? esc(md(n2d(e.due))) : '') + '</span></button>';
    }).join('') + '</section>';
  });
  return h;
}
