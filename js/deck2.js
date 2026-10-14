/* work-web v2 · schedule slides: milestone timeline (swim lanes, baseline vs forecast vs actual, slip), programme Gantt,
   milestone status table and the planned-vs-actual S-curve. Same contract as deck.js: data(cfg, ctx) → JSON, render(data, slide, box) → pages. */
'use strict';

function msRegId(){ var r = allRegs().filter(function(x){ return x.d.allMs && !isPrivate(x); })[0]; return r ? r.id : ''; }
function regsWithDates(){ return allRegs().filter(function(r){ return !isPrivate(r) && (rolesOf(r).start || rolesOf(r).finish); }).map(function(r){ return r.id; }); }
function hidden(c){ return (c && c.hide) || []; }
function isHidden(c, k){ return hidden(c).indexOf(k) >= 0; }

Object.assign(SLIDES, {
  timeline:{en:'Milestone timeline', zh:'里程碑时间轴', t:['Key milestones','关键里程碑'], def:function(){ var m = msRegId(); return {regs:m ? [m] : regsWithDates(), only:'ms', lanes:'reg', months:6, back:1, base:true}; }},
  gantt:{en:'Programme (Gantt)', zh:'进度计划（甘特图）', t:['Programme','总体进度计划'], def:function(){ return {regs:[tplReg('site'), tplReg('turnover')].filter(Boolean), only:'all', lanes:'tree', months:0, base:true}; }},
  mstable:{en:'Milestone table', zh:'里程碑表', t:['Milestone status','里程碑状态'], def:function(){ var m = msRegId(); return {regs:m ? [m] : regsWithDates(), show:'all'}; }},
  scurve:{en:'S-curve (plan vs actual)', zh:'S 曲线（计划 vs 实际）', t:['Overall progress – S-curve','总体进度 S 曲线'], def:function(){ return {regs:[tplReg('site')].filter(Boolean), blk:'', weight:'', manual:''}; }}
});
SLIDE_ORDER.splice(SLIDE_ORDER.indexOf('lookahead') + 1, 0, 'timeline', 'gantt', 'mstable', 'scurve');

/* ---------------- data ---------------- */
function monthStart(n){ var d = new Date(n * 864e5); return d2n(d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-01'); }
function addMonths(n, k){ var d = new Date(n * 864e5); return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1) / 864e5); }
function laneOf(reg, r, lanes){
  if(lanes === 'none') return '';
  if(lanes === 'reg') return T1(reg.d.en, reg.d.zh);
  var key = lanes === 'tree' ? rolesOf(reg).tree : lanes === 'block' ? rolesOf(reg).block : lanes;
  if(!key || !fieldOf(reg, key)) return T1(reg.d.en, reg.d.zh);
  return groupKey(reg, r, key)[0].label || T1(reg.d.en, reg.d.zh);
}
SLIDE_DATA.timeline = function(c, ctx){
  var A = ctx.asOf, regs = usable(ctx, c.regs), items = [];
  regs.forEach(function(reg){ var idx = kidsIndex(reg.id);
    recsOf(reg.id).forEach(function(r){
      if(!recOk(ctx, reg, r) || isHidden(c, 'r:' + r.id)) return;
      var ms = isMilestone(reg, r); if(c.only === 'ms' && !ms) return; if(c.only !== 'ms' && idx[r.id]) return;
      var mi = msInfo(reg, r, A); if(!mi.plan && !mi.base && !(mi.act && mi.act.f != null)) return; if(c.hideDone && mi.done) return;
      var lane = laneOf(reg, r, c.lanes || 'reg'), lk = c.lanes === 'reg' || !c.lanes ? (c.regs || []).indexOf(reg.id) : (function(){ var key = c.lanes === 'tree' ? rolesOf(reg).tree : c.lanes === 'block' ? rolesOf(reg).block : c.lanes; return key && fieldOf(reg, key) ? (c.regs || []).indexOf(reg.id) * 1e6 + groupKey(reg, r, key)[0].o : (c.regs || []).indexOf(reg.id) * 1e6; })(); if(isHidden(c, 'g:' + lane)) return;
      var pv = progressOf(reg, r);
      items.push({id:r.id, lane:lane, lo:lk, no:recNo(reg, r), t:recPair(reg, r), ms:ms || (mi.plan && mi.plan.s === mi.plan.f && !rolesOf(reg).progress), plan:mi.plan, base:mi.base, act:mi.act, st:mi.st, slip:mi.slip, fc:mi.fc, pct:pv == null ? null : Math.round(pv)}); }); });
  if(!items.length) return {err:'none', only:c.only};
  var lo, hi;
  if(c.from && d2n(c.from) != null && c.to && d2n(c.to) != null){ lo = d2n(c.from); hi = d2n(c.to); }
  else if(c.months > 0){ lo = addMonths(monthStart(A), -(c.back == null ? 1 : +c.back)); hi = addMonths(lo, +c.months) - 1; }
  else { lo = Infinity; hi = -Infinity; items.forEach(function(x){ [x.plan, x.base].forEach(function(p){ if(p){ lo = Math.min(lo, p.s); hi = Math.max(hi, p.f); } }); if(x.act && x.act.f != null){ lo = Math.min(lo, x.act.f); hi = Math.max(hi, x.act.f); } }); lo = monthStart(lo); hi = addMonths(monthStart(hi), 1) - 1; }
  if(c.months > 0 || c.from) items = items.filter(function(x){ var s = Math.min(x.plan ? x.plan.s : 1e9, x.base ? x.base.s : 1e9, x.fc != null ? x.fc : 1e9), f = Math.max(x.plan ? x.plan.f : -1e9, x.base ? x.base.f : -1e9, x.fc != null ? x.fc : -1e9); return (f >= lo && s <= hi) || (!x.fc || x.st === 'late') && f < lo && x.st !== 'done'; });
  if(!items.length) return {err:'none', only:c.only};
  var lanes = [], li = {};
  items.sort(function(a, b){ return (a.plan ? a.plan.s : a.fc || 0) - (b.plan ? b.plan.s : b.fc || 0); });
  items.forEach(function(x){ if(!li[x.lane]){ li[x.lane] = {label:x.lane, o:x.lo, items:[]}; lanes.push(li[x.lane]); } li[x.lane].items.push(x); });
  lanes.sort(function(a, b){ return a.o - b.o; });
  return {from:lo, to:hi, asOf:A, lanes:lanes, base:c.base !== false, only:c.only};
};
SLIDE_DATA.gantt = SLIDE_DATA.timeline;
SLIDE_DATA.mstable = function(c, ctx){
  var A = ctx.asOf, rows = [];
  usable(ctx, c.regs).forEach(function(reg){ var bf = rf(reg, 'block'), rk = fieldOf(reg, 'remarks') && fieldOk(ctx, reg, fieldOf(reg, 'remarks')) ? 'remarks' : null;
    recsOf(reg.id).forEach(function(r){ if(!recOk(ctx, reg, r) || !isMilestone(reg, r) || isHidden(c, 'r:' + r.id)) return; var mi = msInfo(reg, r, A);
      if(c.show === 'open' && mi.done) return; if(c.show === 'next' && (mi.done || mi.fc == null || mi.fc > A + 60)) return;
      rows.push({id:r.id, no:recNo(reg, r), t:recPair(reg, r), b:bf ? asArr(r.d[bf.key]) : null, base:mi.base ? n2d(mi.base.f) : '', fc:mi.plan ? n2d(mi.plan.f) : '', act:mi.act && mi.act.f != null ? n2d(mi.act.f) : '', slip:mi.slip, st:mi.st, n:mi.fc, rem:rk ? String(r.d[rk] || '').split('\n')[0].slice(0, 90) : ''}); }); });
  rows.sort(function(a, b){ return (a.n == null ? 1e9 : a.n) - (b.n == null ? 1e9 : b.n); });
  return {rows:rows, blk:rows.some(function(x){ return x.b && x.b.length; }), rem:rows.some(function(x){ return x.rem; })};
};
SLIDE_DATA.scurve = function(c, ctx){
  var regs = usable(ctx, c.regs); if(!regs.length) return {err:'reg'};
  var miss = regs.filter(function(r){ return !histFor(r.id); });
  if(miss.length){ loadHistory(miss.map(function(r){ return r.id; })).then(function(){ notify(); }); return {loading:true}; }
  var out = scurveCalc({regs:regs, asOf:ctx.asOf, blk:c.blk, weight:c.weight, manual:c.manual, hide:hidden(c), ctx:ctx});
  out.blk = c.blk || ''; return out;
};

/* ---------------- render ---------------- */
var TL_COL = {done:'#2E9E6A', ok:'#2F6DB5', risk:'#E8930C', late:'#D2453F'};
function axisTicks(lo, hi, W){
  var span = hi - lo + 1, px = W / span, out = [];
  if(span <= 120){ var t = lo - ((new Date(lo * 864e5).getUTCDay() + 6) % 7); for(; t <= hi; t += 7) if(t >= lo) out.push({x:(t - lo) * px, l:fmtD(t)}); }
  else { var m = monthStart(lo); if(m < lo) m = addMonths(m, 1); var step = span > 900 ? 3 : 1; for(var k = 0; m <= hi; k++, m = addMonths(m, 1)){ if(k % step) continue; var d = new Date(m * 864e5); out.push({x:(m - lo) * px, l:MON[d.getUTCMonth()] + (d.getUTCMonth() === 0 || k === 0 ? ' ' + d.getUTCFullYear() : '')}); } }
  return out;
}
function diamond(x, y, size, fill, stroke, extra){ return '<i class="sl-dia" data-shape="diamond" style="left:' + (x - size / 2) + 'px;top:' + (y - size / 2) + 'px;width:' + size + 'px;height:' + size + 'px;background:' + fill + ';border-color:' + (stroke || fill) + '"' + (extra || '') + '></i>'; }
function tlRender(d, s, box){
  if(d.err) return [slEmpty(d.only === 'ms' ? 'No milestones in the chosen registers. Tick “Milestone” (◆) on records, or add a Key milestones register.' : 'Nothing with dates in the chosen registers.', d.only === 'ms' ? '所选台账没有里程碑。可在记录上点 ◆ 标为里程碑，或新增「关键里程碑」台账。' : '所选台账没有带日期的记录。')];
  var BW = (box && box.w) || 1184, LW = BW < 900 ? 200 : 300, CW = BW - LW, span = d.to - d.from + 1, px = CW / span, RH = 34;
  function X(n){ return clamp((n - d.from) * px, 0, CW); }
  var rows = []; d.lanes.forEach(function(l){ if(d.lanes.length > 1) rows.push({lane:l}); l.items.forEach(function(x){ rows.push({it:x}); }); });
  var ticks = axisTicks(d.from, d.to, CW), today = d.asOf >= d.from && d.asOf <= d.to ? X(d.asOf) : null;
  var head = '<div class="sl-tlh"><div class="sl-tll" style="width:' + LW + 'px"></div><div class="sl-tla" style="width:' + CW + 'px">' + ticks.map(function(t){ return '<span style="left:' + t.x + 'px">' + esc(t.l) + '</span>'; }).join('') + (today != null ? '<b class="sl-tlt" style="left:' + today + 'px">' + esc(T('Today', '今天')) + '</b>' : '') + '</div></div>';
  var grid = ticks.map(function(t){ return '<i class="sl-tlg" style="left:' + t.x + 'px"></i>'; }).join('') + (today != null ? '<i class="sl-today" style="left:' + today + 'px"></i>' : '');
  function itemRow(x){
    var h = '', col = TL_COL[x.st] || TL_COL.ok, y = RH / 2, lab = '';
    if(x.ms){
      var bx = null; if(d.base && x.base){ bx = X(x.base.f); h += diamond(bx, y, 14, '#fff', '#8A9096', ' title="baseline"'); if(x.slip && x.fc != null){ var fx = X(x.fc); h += '<i class="sl-slip" style="left:' + Math.min(bx, fx) + 'px;width:' + Math.abs(fx - bx) + 'px;border-color:' + (x.slip > 0 ? '#D2453F' : '#2E9E6A') + '"></i>'; } }
      if(x.fc != null){ var cx = X(x.fc), off = x.fc < d.from ? '◀ ' : x.fc > d.to ? '▶ ' : ''; h += diamond(cx, y, 18, col); lab = (x.st === 'done' ? '✓ ' : '') + off + fmtD(x.fc) + (x.slip ? '  ' + (x.slip > 0 ? '+' : '') + n0(x.slip, 0) + T('d', '天') : ''); var rx = Math.max(cx, bx == null ? -1 : bx), lx = Math.min(cx, bx == null ? 1e9 : bx), toLeft = rx > CW - 150; h += '<span class="sl-tll2' + (toLeft ? ' r' : '') + '" style="' + (toLeft ? 'right:' + (CW - lx + 14) : 'left:' + (rx + 14)) + 'px;color:' + (x.slip > 0 || x.st === 'late' ? '#A1262A' : '#3D434A') + '">' + esc(lab) + '</span>'; }
    } else {
      if(d.base && x.base){ h += '<i class="sl-tlb" style="left:' + X(x.base.s) + 'px;width:' + Math.max(2, X(x.base.f + 1) - X(x.base.s)) + 'px"></i>'; }
      if(x.plan){ var l = X(x.plan.s), r = X(x.plan.f + 1), w = Math.max(3, r - l); h += '<span class="sl-tlbar" style="left:' + l + 'px;width:' + w + 'px;background:' + col + '33;border-color:' + col + '"><i style="width:' + (x.st === 'done' ? 100 : x.pct || 0) + '%;background:' + col + '"></i></span>';
        if(x.plan.f < d.from) h += '<span class="sl-tll2" style="left:4px;color:#A1262A">◀ ' + esc(fmtD(x.plan.f)) + '</span>';
        else h += '<span class="sl-tll2' + (r > CW - 120 ? ' r' : '') + '" style="' + (r > CW - 120 ? 'right:' + (CW - l + 6) : 'left:' + (r + 6)) + 'px">' + (x.pct != null ? n0(x.pct, 0) + '%' : '') + (x.slip > 0 ? ' <b style="color:#A1262A">+' + n0(x.slip, 0) + T('d', '天') + '</b>' : '') + '</span>'; }
    }
    return '<div class="sl-tlr" data-hk="r:' + esc(x.id) + '" data-hl="' + esc(x.no + ' ' + (x.t.en || x.t.zh)) + '"><div class="sl-tll" style="width:' + LW + 'px"><span class="sl-dot" style="background:' + col + '"></span><span class="n">' + esc(x.no) + '</span> <span class="sl-tlx">' + bil1(x.t) + '</span></div><div class="sl-tla" style="width:' + CW + 'px">' + grid + h + '</div></div>';
  }
  var legend = '<div class="sl-legend sl-tlleg">' + ['done','ok','risk','late'].map(function(k){ return '<span><i class="sl-legd" style="background:' + TL_COL[k] + '"></i>' + esc(T1(MS_ST[k].en, MS_ST[k].zh)) + '</span>'; }).join('') + (d.base ? '<span><i class="sl-legd" style="background:#fff;border:2px solid #8A9096"></i>' + esc(T('Baseline', '基准')) + '</span>' : '') + '<span><i style="display:inline-block;width:2px;height:14px;background:var(--sl-acc);margin-right:6px;vertical-align:-2px"></i>' + esc(T('Status date', '状态日期')) + ' ' + esc(fmtD(d.asOf)) + '</span></div>';
  return chunk(rows, room(s, 13)).map(function(part){ return '<div class="sl-tl">' + head + part.map(function(r){ return r.lane ? '<div class="sl-tlln" data-hk="g:' + esc(r.lane.label) + '" data-hl="' + esc(r.lane.label) + '"><span style="width:' + LW + 'px">' + esc(r.lane.label || '') + '</span><div class="sl-tla" style="width:' + CW + 'px">' + grid + '</div></div>' : itemRow(r.it); }).join('') + '</div>' + legend; });
}
SLIDE_RENDER.timeline = tlRender;
SLIDE_RENDER.gantt = tlRender;
SLIDE_RENDER.mstable = function(d, s, box){
  if(!d.rows.length) return [slEmpty('No milestones to show.', '没有可显示的里程碑。')];
  if(box && box.w < 760) d = Object.assign({}, d, {blk:false, rem:false, narrow:true});
  return chunk(d.rows, room(s, 11)).map(function(part){ return '<table class="sl-t sl-mst"><thead><tr><th>' + T('No.', '编号') + '</th><th>' + T('Milestone', '里程碑') + '</th>' + (d.blk ? '<th>' + T('Block', '区域') + '</th>' : '') + '<th>' + T('Baseline', '基准') + '</th><th>' + T('Forecast', '预测') + '</th>' + (d.narrow ? '' : '<th>' + T('Actual', '实际') + '</th>') + '<th>' + T('Var. (d)', '偏差（天）') + '</th><th>' + T('Status', '状态') + '</th>' + (d.rem ? '<th>' + T('Remarks', '备注') + '</th>' : '') + '</tr></thead><tbody>' +
    part.map(function(r){ var stc = MS_ST[r.st] || MS_ST.ok; return '<tr data-hk="r:' + esc(r.id) + '" data-hl="' + esc(r.no + ' ' + (r.t.en || r.t.zh)) + '"' + (r.st === 'late' ? ' class="sl-od"' : '') + '><td class="n">' + esc(r.no) + '</td><td class="sl-tt"><span class="sl-dia sm" data-shape="diamond" style="background:' + TL_COL[r.st] + ';border-color:' + TL_COL[r.st] + '"></span> ' + bil(r.t) + '</td>' + (d.blk ? '<td>' + (r.b ? slBlk(r.b) : '') + '</td>' : '') + '<td class="n">' + esc(r.base || '—') + '</td><td class="n">' + esc(r.fc || '—') + '</td>' + (d.narrow ? '' : '<td class="n">' + esc(r.act || '—') + '</td>') + '<td class="n" style="font-weight:700;color:' + (r.slip > 0 ? '#A1262A' : r.slip < 0 ? '#1F6B45' : '#5A6067') + '">' + (r.slip == null ? '—' : (r.slip > 0 ? '+' : '') + n0(r.slip, 0)) + '</td><td><span class="sl-chip c-' + stc.color + '">' + esc(T1(stc.en, stc.zh)) + '</span></td>' + (d.rem ? '<td class="sl-rem">' + esc(r.rem) + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table>'; });
};
SLIDE_RENDER.scurve = function(d, s, box){
  if(d.loading) return ['<div class="sl-empty">' + esc(T('Reading the progress history…', '正在读取进度历史…')) + '</div>'];
  if(d.err) return [slEmpty('No items with planned dates in the chosen registers.', '所选台账没有带计划日期的记录。')];
  var BW = (box && box.w) || 1184, H = ((box && box.h) || 560) - (s && s.cfg && s.cfg.msg ? 60 : 0) - (s && s.cfg && s.cfg.side ? 130 : 0) - (((box && box.w) || 1184) < 760 ? 150 : 160), H2 = Math.max(220, H), L = 56, R = 70, T0 = 14, B = 34, CW = BW - L - R, CH = H2 - T0 - B, n = d.pts.length;
  function x(i){ return L + (n > 1 ? i / (n - 1) * CW : 0); } function y(v){ return T0 + CH - v / 100 * CH; }
  function path(arr){ var p = '', on = false; arr.forEach(function(v, i){ if(v == null){ on = false; return; } p += (on ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' '; on = true; }); return p; }
  var grid = [0, 20, 40, 60, 80, 100].map(function(v){ return '<line x1="' + L + '" x2="' + (L + CW) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#E6E8E3"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="12" fill="#5A6067">' + v + '%</text>'; }).join('');
  var lastM = -1, xl = ''; d.pts.forEach(function(p, i){ var dt = new Date(p * 864e5), m = dt.getUTCFullYear() * 12 + dt.getUTCMonth(); if(m !== lastM && (n < 40 || dt.getUTCMonth() % (n > 100 ? 3 : 1) === 0)){ xl += '<text x="' + x(i) + '" y="' + (T0 + CH + 20) + '" font-size="12" fill="#5A6067" text-anchor="middle">' + MON[dt.getUTCMonth()] + (dt.getUTCMonth() === 0 || lastM < 0 ? ' ' + dt.getUTCFullYear() : '') + '</text>'; } lastM = m; });
  var iA = -1; d.pts.forEach(function(p, i){ if(p <= d.asOf) iA = i; });
  var planArr = d.base || d.plan, lastAct = null; d.actual.forEach(function(v, i){ if(v != null) lastAct = i; });
  var endLab = function(arr, col, name){ var i = arr === d.actual ? lastAct : arr.length - 1; if(i == null || i < 0 || arr[i] == null) return ''; return '<text x="' + (x(i) + 6) + '" y="' + (y(arr[i]) + 4) + '" font-size="13" font-weight="700" fill="' + col + '">' + n0(arr[i], 0) + '%</text>'; };
  var chart = {labels:d.pts.map(n2d), series:[]};
  if(d.base) chart.series.push({name:T('Baseline plan', '基准计划'), values:d.base, color:'8A9096', dash:true});
  chart.series.push({name:d.base ? T('Current plan', '当前计划') : T('Planned', '计划'), values:d.plan, color:'2F6DB5'});
  chart.series.push({name:T('Actual', '实际'), values:d.actual, color:'2E9E6A'});
  var svg = '<svg class="sl-sc" data-chart="' + esc(JSON.stringify(chart)) + '" width="' + BW + '" height="' + H2 + '" viewBox="0 0 ' + BW + ' ' + H2 + '" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">' + grid + xl +
    (iA >= 0 ? '<line x1="' + x(iA) + '" x2="' + x(iA) + '" y1="' + T0 + '" y2="' + (T0 + CH) + '" stroke="#E8930C" stroke-width="2"/>' : '') +
    (d.base ? '<path d="' + path(d.base) + '" fill="none" stroke="#8A9096" stroke-width="2" stroke-dasharray="6 5"/>' + endLab(d.base, '#8A9096') : '') +
    '<path d="' + path(d.plan) + '" fill="none" stroke="#2F6DB5" stroke-width="3"/>' + endLab(d.plan, '#2F6DB5') +
    '<path d="' + path(d.actual) + '" fill="none" stroke="#2E9E6A" stroke-width="4"/>' + (lastAct != null ? '<circle cx="' + x(lastAct) + '" cy="' + y(d.actual[lastAct]) + '" r="6" fill="#2E9E6A"/>' : '') + endLab(d.actual, '#1F6B45') + '</svg>';
  var v = d.nowAct != null ? Math.round((d.nowAct - d.nowPlan) * 10) / 10 : null;
  var narrow = BW < 760;
  var tiles = '<div class="sl-tiles s4' + (narrow ? ' sn' : '') + '"><div class="sl-tile"><span>' + esc(d.base ? T('Planned (baseline) to date', '截至今日计划（基准）') : T('Planned to date', '截至今日计划')) + '</span><b>' + n0(d.nowPlan, 0) + '%</b></div><div class="sl-tile good"><span>' + esc(T('Actual to date', '截至今日实际')) + '</span><b>' + (d.nowAct == null ? '—' : n0(d.nowAct, 0) + '%') + '</b></div><div class="sl-tile' + (v != null && v < 0 ? ' bad' : v != null ? ' good' : '') + '"><span>' + esc(T('Variance', '偏差')) + '</span><b>' + (v == null ? '—' : (v > 0 ? '+' : '') + n0(v, 0) + ' pp') + '</b></div><div class="sl-tile"><span>' + esc(T('Items weighted', '计入项目')) + '</span><b>' + n0(d.n, 0) + '</b>' + (d.blk ? '<small>' + esc(T('Block ', '区域 ') + d.blk) + '</small>' : '') + '</div></div>';
  var leg = '<div class="sl-legend">' + chart.series.map(function(sr){ var sc0 = /^[0-9a-f]{6}$/i.test(sr.color) ? sr.color : '888888'; return '<span><i style="' + (sr.dash ? 'height:0;background:none;border-top:3px dashed #' + sc0 : 'background:#' + sc0) + '"></i>' + esc(sr.name) + '</span>'; }).join('') + (d.histFrom ? '<span class="sl-note" style="margin-left:auto">' + esc(T('Actual rebuilt from the change log since ' + d.histFrom + ' and weekly snapshots.', '实际曲线由 ' + d.histFrom + ' 起的修改记录和每周快照还原。')) + '</span>' : '') + '</div>';
  return [tiles + svg + leg];
};

SLIDE_CSS += [
'.sl-tl{display:flex;flex-direction:column;font-size:14px}',
'.sl-tlh{display:flex;height:30px;border-bottom:2px solid var(--sl-p2)}.sl-tlh .sl-tla{position:relative}.sl-tlh .sl-tla span{position:absolute;top:7px;font-size:12px;color:#5A6067;padding-left:4px;border-left:1px solid #C8CBC5;white-space:nowrap}',
'.sl-tlt{position:absolute;top:-2px;transform:translateX(-50%);font-size:11px;color:#fff;background:var(--sl-acc);padding:0 5px;border-radius:3px;z-index:2}',
'.sl-tlr,.sl-tlln{display:flex;height:34px;border-bottom:1px solid #EEF0EC}.sl-tlln{height:26px;background:#F3F5F8}.sl-tlln>span{flex:none;font-weight:700;font-size:13px;color:var(--sl-p);padding:4px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.sl-tll{flex:none;display:flex;align-items:center;gap:6px;padding:0 8px;white-space:nowrap;overflow:hidden}.sl-tll .n{font:12px ui-monospace,Menlo,monospace;color:#5A6067}.sl-tlx{overflow:hidden;text-overflow:ellipsis}',
'.sl-tla{position:relative;flex:none;height:100%}.sl-tlg{position:absolute;top:0;bottom:0;width:1px;background:#EEF0EC}',
'.sl-dot{width:8px;height:8px;border-radius:50%;flex:none}',
'.sl-dia{position:absolute;border:2px solid;transform:rotate(45deg);z-index:2;box-sizing:border-box}.sl-dia.sm{position:relative;display:inline-block;width:11px;height:11px;margin:0 4px;vertical-align:0}',
'.sl-slip{position:absolute;top:16px;height:0;border-top:2px dashed;z-index:1}',
'.sl-tll2{position:absolute;top:8px;font-size:12px;white-space:nowrap;z-index:3;color:#3D434A}',
'.sl-tlb{position:absolute;top:24px;height:5px;border-radius:2px;background:#B9BEC4}',
'.sl-tlbar{position:absolute;top:8px;height:14px;border:1px solid;border-radius:3px;overflow:hidden;box-sizing:border-box}.sl-tlbar i{display:block;height:100%}',
'.sl-tlleg{margin-top:8px}.sl-legd{display:inline-block;width:11px!important;height:11px!important;transform:rotate(45deg);margin-right:8px!important;box-sizing:border-box}',
'.sl-mst td{font-size:15px}.sl-rem{font-size:13px!important;color:#3D434A;max-width:300px}',
'.sl-tiles.s4{grid-template-columns:repeat(4,1fr)}.sl-tiles.s4 .sl-tile{padding:10px 16px}.sl-tiles.s4 .sl-tile b{font-size:30px}',
'.sl-sc{display:block;flex:none}',
'.sl-tiles.sn{grid-template-columns:repeat(4,1fr);gap:8px}.sl-tiles.sn .sl-tile{padding:6px 8px}.sl-tiles.sn .sl-tile b{font-size:20px}.sl-tiles.sn .sl-tile span{font-size:11px}'
].join('\n');
(function(){ var st = document.getElementById('slide-css'); if(st) st.textContent = SLIDE_CSS; })();
