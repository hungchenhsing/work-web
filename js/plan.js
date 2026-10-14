/* work-web v2 · plan model: baselines, actual dates, milestone status, progress history (from the change log and
   weekly snapshots) and the S-curve maths shared by the register views and the presentation slides. */
'use strict';

/* ---------------- dates per record ---------------- */
function baseKeys(reg){ var ro = rolesOf(reg); return ro.base && fieldOf(reg, ro.base) ? {single:ro.base} : {s:'baseStart', f:'baseFinish'}; }
function baseOf(reg, rec){
  var k = baseKeys(reg);
  if(k.single){ var n = d2n(rec.d[k.single]); return n == null ? null : {s:n, f:n}; }
  var s = d2n(rec.d.baseStart), f = d2n(rec.d.baseFinish); if(s == null) s = f; if(f == null) f = s; if(s == null) return null;
  return {s:Math.min(s, f), f:Math.max(s, f)};
}
function actOf(reg, rec){
  var ro = rolesOf(reg), d = rec.d;
  var sk = ro.astart || (d.actualStart !== undefined ? 'actualStart' : null), fk = ro.afinish || ['actualFinish', 'actualEnd', 'actual'].filter(function(k){ return d[k] !== undefined && fieldOf(reg, k); })[0];
  var s = sk ? d2n(d[sk]) : null, f = fk ? d2n(d[fk]) : null;
  if(s == null && f == null) return null;
  return {s:s, f:f};
}
/* forecast = the current plan dates; for a milestone only the finish matters */
function msInfo(reg, rec, A){
  var p = planOf(reg, rec), b = baseOf(reg, rec), a = actOf(reg, rec), done = isDone(reg, rec) || !!(a && a.f != null && isMilestone(reg, rec));
  var fc = a && a.f != null && done ? a.f : (p ? p.f : null), slip = b && fc != null ? fc - b.f : null;
  var st = done ? 'done' : (fc != null && fc < A) ? 'late' : (slip != null && slip > 0) ? 'risk' : 'ok';
  return {plan:p, base:b, act:a, done:done, fc:fc, slip:slip, st:st};
}
var MS_ST = {done:{en:'Achieved / done', zh:'已完成', color:'green'}, ok:{en:'On track', zh:'正常', color:'blue'}, risk:{en:'Behind baseline', zh:'晚于基准', color:'amber'}, late:{en:'Late', zh:'延误', color:'red'}};

/* ---------------- baseline ---------------- */
function baselineCount(reg){ var n = 0, has = 0; recsOf(reg.id).forEach(function(r){ if(planOf(reg, r)){ n++; if(baseOf(reg, r)) has++; } }); return {n:n, has:has}; }
function setBaseline(reg, overwrite){
  var k = baseKeys(reg), jobs = [];
  recsOf(reg.id).forEach(function(r){
    var p = planOf(reg, r); if(!p) return; if(!overwrite && baseOf(reg, r)) return;
    var patch = {}; if(k.single) patch[k.single] = n2d(p.f); else { patch.baseStart = n2d(p.s); patch.baseFinish = n2d(p.f); }
    jobs.push(function(){ return setRec(r, patch, {silent:true}); });
  });
  var i = 0; function next(){ if(i >= jobs.length) return Promise.resolve(jobs.length); var batch = jobs.slice(i, i + 20).map(function(f){ return f(); }); i += 20; return Promise.all(batch).then(next); }
  return next();
}

/* ---------------- progress history ---------------- */
var HIST = {};   // regId -> {rows:[audit rows newest first], loading, at}
function histFor(regId){ return HIST[regId] && HIST[regId].rows ? HIST[regId].rows : null; }
function loadHistory(regIds){
  return Promise.all((regIds || []).map(function(id){
    var h = HIST[id];
    if(h && h.rows && Date.now() - h.at < 120e3) return Promise.resolve();
    if(h && h.p) return h.p;
    h = HIST[id] = HIST[id] || {};
    h.p = (async function(){
      var out = [], before = null;
      for(var g = 0; g < 40; g++){ var rows = await STORE.loadAudit({reg:id, limit:1000, before:before || undefined}); out = out.concat(rows || []); if(!rows || rows.length < 1000) break; before = rows[rows.length - 1].id; }
      h.rows = out.filter(function(a){ return a.record_id && (a.action === 'update' || a.action === 'insert'); }); h.at = Date.now(); h.p = null;
    })().catch(function(e){ h.p = null; h.rows = h.rows || []; h.at = Date.now(); console.warn(e); });
    return h.p;
  }));
}
function histStart(regIds){ var m = null; regIds.forEach(function(id){ (histFor(id) || []).forEach(function(a){ var t = Date.parse(a.at); if(!isNaN(t) && (m == null || t < m)) m = t; }); }); return m; }
/* the record as it stood at time t (ms): walk the change log backwards; null = it did not exist yet */
function recAt(rec, rowsDesc, t){
  if(!rowsDesc.length) return rec;
  var d = clone(rec.d);
  for(var i = 0; i < rowsDesc.length; i++){ var a = rowsDesc[i]; if(a.record_id !== rec.id) continue; var at = Date.parse(a.at); if(!(at > t)) continue;
    if(a.action === 'insert') return null;
    (a.keys || Object.keys(a.old || {})).forEach(function(k){ var o = (a.old || {})[k]; if(o === null || o === undefined) delete d[k]; else d[k] = clone(o); }); }
  return {id:rec.id, reg:rec.reg, d:d};
}

/* ---------------- weekly snapshots (hidden register, one record per week) ---------------- */
var SNAP_REG = 'reg_snaps';
function snapReg(){ return getReg(SNAP_REG) || ((STORE && STORE.regs) || []).filter(function(r){ return r.d.kind === 'snaps'; })[0] || null; }
function isoWeek(n){ var d = new Date(n * 864e5), day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); var y = d.getUTCFullYear(), f = new Date(Date.UTC(y, 0, 4)), w = 1 + Math.round(((d - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7); return y + '-W' + pad(w); }
function snapValues(){
  var vals = {};
  allRegs().forEach(function(reg){ if(isPrivate(reg) || !(rf(reg, 'progress') || rf(reg, 'status'))) return; var idx = kidsIndex(reg.id), o = {};
    recsOf(reg.id).forEach(function(r){ if(idx[r.id]) return; var p = progressOf(reg, r, true); if(p != null) o[r.id] = Math.round(p * 10) / 10; });
    vals[reg.id] = o; });
  return vals;
}
var snapTried = false;
function takeSnapshotIfDue(){
  var wk = isoWeek(d2n(new Date().toISOString().slice(0, 10)));
  if(snapTried === wk || !STORE || !STORE.ready || !canTeamEdit() || STORE.needSchema || (STORE.mode === 'cloud' && STORE.v1)) return;
  snapTried = wk;
  var go = function(reg){ if(recsOf(reg.id).some(function(r){ return r.d.week === wk; })) return; return STORE.createRec({id:uid('snap'), reg:reg.id, d:{week:wk, date:TODAY_S, vals:snapValues()}}); };
  var r = snapReg();
  if(r){ Promise.resolve(go(r)).catch(function(){}); return; }
  STORE.createReg({id:SNAP_REG, vis:'team', d:{kind:'snaps', en:'Progress snapshots', zh:'进度快照', icon:'list', sec:'other', fields:[F('week','Week','周','text'),F('date','Date','日期','date')], roles:{title:'week', no:'week'}}})
    .then(function(){ return go(snapReg()); }).catch(function(){});
}
function snapshots(){ var r = snapReg(); return r ? recsOf(r.id).map(function(x){ return {n:d2n(x.d.date), vals:x.d.vals || {}}; }).filter(function(x){ return x.n != null; }).sort(function(a, b){ return a.n - b.n; }) : []; }

/* ---------------- S-curve ---------------- */
/* items: leaf records with plan dates; weight 1 each (or a number field); planned % from the baseline (or plan) spread
   evenly over each item's duration; actual % from the weekly snapshot of that week when there is one, otherwise the record
   rebuilt from the change log as it stood at the end of that week. Manual lines override any week. */
function scurveCalc(o){
  var A = o.asOf, regs = o.regs, items = [];
  regs.forEach(function(reg){ var idx = kidsIndex(reg.id), bf = rf(reg, 'block');
    recsOf(reg.id).forEach(function(r){ if(idx[r.id]) return; if(o.ctx && !recOk(o.ctx, reg, r)) return; if(o.blk && bf && asArr(r.d[bf.key]).length && asArr(r.d[bf.key]).indexOf(o.blk) < 0) return; if(o.hide && o.hide.indexOf('r:' + r.id) >= 0) return;
      var p = planOf(reg, r); if(!p) return; var w = o.weight && fieldOf(reg, o.weight) ? num(r.d[o.weight]) : 1; if(!w || w < 0) return;
      items.push({reg:reg, r:r, p:p, b:baseOf(reg, r), w:w}); }); });
  if(!items.length) return {err:'none'};
  var lo = Infinity, hi = -Infinity; items.forEach(function(x){ var s = Math.min(x.p.s, x.b ? x.b.s : Infinity), f = Math.max(x.p.f, x.b ? x.b.f : -Infinity); lo = Math.min(lo, s); hi = Math.max(hi, f); });
  if(o.from && d2n(o.from) != null) lo = d2n(o.from); if(o.to && d2n(o.to) != null) hi = d2n(o.to);
  var W = items.reduce(function(s, x){ return s + x.w; }, 0), hasBase = items.some(function(x){ return x.b; });
  var pts = [], t = A; while(t > lo - 7) t -= 7; t += 7; for(; t <= hi + 7; t += 7) pts.push(t); if(pts.length > 160) pts = pts.filter(function(_, i){ return i % Math.ceil(pts.length / 160) === 0; });
  function share(s, f, n){ return n < s ? 0 : n >= f ? 1 : (n - s + 1) / (f - s + 1); }
  var plan = pts.map(function(n){ return Math.round(items.reduce(function(s, x){ return s + x.w * share(x.p.s, x.p.f, n); }, 0) / W * 1000) / 10; });
  var base = hasBase ? pts.map(function(n){ return Math.round(items.reduce(function(s, x){ var b = x.b || x.p; return s + x.w * share(b.s, b.f, n); }, 0) / W * 1000) / 10; }) : null;
  var snaps = snapshots(), hs = histStart(regs.map(function(r){ return r.id; })), rows = {}, actual = [];
  regs.forEach(function(r){ (histFor(r.id) || []).forEach(function(a){ (rows[a.record_id] = rows[a.record_id] || []).push(a); }); });
  var manual = {}; String(o.manual || '').split(/\r?\n/).forEach(function(l){ var m = /^\s*(\d{4}-\d{1,2}-\d{1,2}|\d{4}\/\d{1,2}\/\d{1,2})\s*[\t,; ]\s*([\d.]+)\s*%?/.exec(l); if(m){ var n = d2n(parseDate(m[1])); if(n != null) manual[n] = +m[2]; } });
  var mk = Object.keys(manual).map(Number).sort(function(a, b){ return a - b; });
  pts.forEach(function(n, i){
    if(n > A){ actual.push(null); return; }
    var mm = mk.filter(function(k){ return k <= n && k > n - 7; }).pop(); if(mm != null){ actual.push(manual[mm]); return; }
    var sn = snaps.filter(function(s){ return s.n <= n && s.n > n - 7; }).pop();
    var tEnd = (n + 1) * 864e5 - 1;
    if(!sn && (hs == null || tEnd < hs) && n < A){ actual.push(null); return; }
    var sum = 0;
    items.forEach(function(x){ var v = null;
      if(n >= A) v = progressOf(x.reg, x.r, true);
      else if(sn && sn.vals[x.reg.id] && sn.vals[x.reg.id][x.r.id] != null) v = sn.vals[x.reg.id][x.r.id];
      else { var st = recAt(x.r, rows[x.r.id] || [], tEnd); v = st ? progressOf(x.reg, st, true) : 0; }
      sum += x.w * (v || 0); });
    actual.push(Math.round(sum / W * 10) / 10);
  });
  var iA = pts.filter(function(n){ return n <= A; }).length - 1, nowPlan = iA >= 0 ? (base || plan)[iA] : 0, nowAct = iA >= 0 ? actual[iA] : null;
  return {pts:pts, plan:plan, base:base, actual:actual, asOf:A, n:items.length, nowPlan:nowPlan, nowAct:nowAct, hasBase:hasBase, histFrom:hs ? new Date(hs).toISOString().slice(0, 10) : null};
}
