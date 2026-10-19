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
/* where a set of names is used: [{reg, rec, keys}] across every register you can see */
function peopleRefs(names){
  var want = {}; (names || []).forEach(function(n){ if(n) want[n] = 1; }); var out = [];
  allRegs().forEach(function(reg){
    if(isPeopleReg(reg)) return; var fs = peopleFields(reg); if(!fs.length) return;
    recsOf(reg.id).forEach(function(r){ var ks = fs.filter(function(f){ return asArr(r.d[f.key]).some(function(v){ return want[v]; }); }).map(function(f){ return f.key; }); if(ks.length) out.push({reg:reg, rec:r, keys:ks}); });
  });
  return out;
}
/* replace a name with another in every people field (records you can edit); resolves to the number of records changed */
function peopleReplace(from, to){
  var ps = [], n = 0;
  allRegs().forEach(function(reg){
    if(isPeopleReg(reg) || !canWrite(reg)) return; var fs = peopleFields(reg); if(!fs.length) return;
    recsOf(reg.id).forEach(function(r){
      var patch = {};
      fs.forEach(function(f){ var v = r.d[f.key];
        if(Array.isArray(v)){ if(v.indexOf(from) < 0) return; var nv = []; v.forEach(function(x){ var y = x === from ? to : x; if(y && nv.indexOf(y) < 0) nv.push(y); }); patch[f.key] = nv; }
        else if(v === from) patch[f.key] = f.multi ? [to] : to; });
      if(Object.keys(patch).length){ n++; ps.push(STORE.patchRec(r.id, patch)); }
    });
  });
  return Promise.all(ps).then(function(){ return n; });
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
  allRegs().forEach(function(reg){ if(isPeopleReg(reg)) return; peopleFields(reg).forEach(function(f){ recsOf(reg.id).forEach(function(r){ asArr(r.d[f.key]).forEach(function(v){
    if(typeof v !== 'string' || !v.trim() || known[v]) return; var x = m[v] || (m[v] = {v:v, n:0, regs:{}}); x.n++; x.regs[reg.id] = 1; }); }); }); });
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
