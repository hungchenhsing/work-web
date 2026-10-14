/* work-web v2 · reporting slides: executive summary (status light, plan vs actual, milestones, issues, decisions)
   and the two-part slide that puts any two blocks side by side. */
'use strict';

var COMBO_TYPES = ['kpi','matrix','scurve','timeline','mstable','table','breakdown','lookahead','punch','photos','actions','text'];
function issuesRegId(){ var r = allRegs().filter(function(x){ return x.d.tpl === 'issues' && !isPrivate(x); })[0]; return r ? r.id : ''; }
Object.assign(SLIDES, {
  summary:{en:'Executive summary', zh:'执行摘要', t:['Executive summary','执行摘要'], def:function(){ return {regs:[tplReg('site')].filter(Boolean), ms:msRegId(), iss:issuesRegId(), period:14, rag:'auto', ach:'', iss2:'', dec:''}; }},
  combo:{en:'Two-part slide', zh:'左右组合页', t:['Overview','概览'], def:function(){ return {split:'1:1', L:{type:'matrix', cfg:SLIDES.matrix.def()}, R:{type:'photos', cfg:Object.assign(SLIDES.photos.def(), {layout:'2x2'})}}; }}
});
SLIDE_ORDER.splice(1, 0, 'summary');
SLIDE_ORDER.push('combo');

/* ---------------- executive summary ---------------- */
var RAG = {green:{en:'On track', zh:'正常', c:'#2E9E6A'}, amber:{en:'At risk', zh:'有风险', c:'#E8930C'}, red:{en:'Behind', zh:'滞后', c:'#D2453F'}};
SLIDE_DATA.summary = function(c, ctx){
  var A = ctx.asOf, P = +c.period || 14, hd = c.hide || [], out = {period:P, asOf:A};
  var regs = usable(ctx, c.regs);
  if(regs.length){ var miss = regs.filter(function(r){ return !histFor(r.id); }); if(miss.length){ loadHistory(miss.map(function(r){ return r.id; })).then(function(){ notify(); }); out.loading = true; }
    else { var sc = scurveCalc({regs:regs, asOf:A, ctx:ctx}); if(!sc.err){ out.plan = sc.nowPlan; out.act = sc.nowAct; out.base = sc.hasBase; } } }
  var msRegs = c.ms ? usable(ctx, [c.ms]) : usable(ctx, regsWithDates()), ach = [], next = [], late = 0;
  msRegs.forEach(function(reg){ recsOf(reg.id).forEach(function(r){ if(!recOk(ctx, reg, r) || !isMilestone(reg, r) || hd.indexOf('r:' + r.id) >= 0) return; var mi = msInfo(reg, r, A), it = {id:r.id, no:recNo(reg, r), t:recPair(reg, r), fc:mi.fc, slip:mi.slip, st:mi.st};
    if(mi.done && mi.fc != null && mi.fc > A - P && mi.fc <= A) ach.push(it); else if(!mi.done && mi.fc != null && mi.fc > A && mi.fc <= A + 60) next.push(it); if(mi.st === 'late') late++; }); });
  ach.sort(function(a, b){ return b.fc - a.fc; }); next.sort(function(a, b){ return a.fc - b.fc; });
  var iss = [], dec = [], ireg = c.iss && getReg(c.iss);
  if(ireg && regOk(ctx, ireg)){ var pf = fieldOf(ireg, 'prio'), kf = fieldOf(ireg, 'kind'), po = {}; if(pf) optsOf(pf).forEach(function(o, i){ po[o.v] = i; });
    recsOf(ireg.id).forEach(function(r){ if(!recOk(ctx, ireg, r) || isDone(ireg, r) || hd.indexOf('r:' + r.id) >= 0) return; if(ctx.owner && fieldOf(ireg, 'escalate') && !r.d.escalate && !r.d.ext) return; var p = planOf(ireg, r), o = pf && optOf(pf, r.d.prio), it = {id:r.id, no:recNo(ireg, r), t:recPair(ireg, r), due:p ? p.f : null, prio:o ? {v:o.v, color:o.color} : null, o:pf ? (po[r.d.prio] == null ? 9 : po[r.d.prio]) : 9};
      if(kf && r.d.kind === 'decision') dec.push(it); else iss.push(it); });
    iss.sort(function(a, b){ return a.o - b.o || (a.due || 1e9) - (b.due || 1e9); }); dec.sort(function(a, b){ return (a.due || 1e9) - (b.due || 1e9); }); }
  var v = out.act != null && out.plan != null ? Math.round((out.act - out.plan) * 10) / 10 : null;
  var auto = v == null ? (late ? 'amber' : 'green') : v >= -2 ? (late ? 'amber' : 'green') : v >= -5 ? 'amber' : 'red';
  out.rag = c.rag && c.rag !== 'auto' ? c.rag : auto; out.ragAuto = !c.rag || c.rag === 'auto'; out.v = v; out.late = late;
  out.ach = ach.slice(0, 5); out.next = next.slice(0, 5); out.iss = iss.slice(0, 5); out.dec = dec.slice(0, 5);
  out.achTxt = c.ach || ''; out.issTxt = c.iss2 || ''; out.decTxt = c.dec || '';
  return out;
};
function sumList(title, items, txt, kind, empty){
  var lines = String(txt || '').split(/\n/).filter(function(x){ return x.trim(); });
  return '<div class="sl-sm"><h3>' + esc(title) + '</h3>' + (items.length || lines.length ? '<ul>' + items.map(function(x){
    var tail = kind === 'ach' ? '<span class="sl-smd ok">✓ ' + esc(fmtD(x.fc)) + '</span>' : kind === 'next' ? '<span class="sl-smd' + (x.slip > 0 ? ' bad' : '') + '">' + esc(fmtD(x.fc)) + (x.slip > 0 ? ' · +' + n0(x.slip, 0) + T('d', '天') : '') + '</span>' : kind === 'dec' ? (x.due != null ? '<span class="sl-smd' + (x.due < 0 ? '' : '') + '">' + esc(T('by ', '截止 ') + fmtD(x.due)) + '</span>' : '') : (x.prio ? '<span class="sl-chip c-' + esc(x.prio.color) + '">' + esc(x.prio.v) + '</span>' : '');
    return '<li data-hk="r:' + esc(x.id) + '" data-hl="' + esc(x.no) + '"><span class="sl-smt">' + bil1(x.t) + '</span>' + tail + '</li>'; }).join('') + lines.map(function(l){ return '<li><span class="sl-smt">' + esc(l.replace(/^[\s\-•*]+/, '')) + '</span></li>'; }).join('') + '</ul>' : '<p class="sl-note">' + esc(empty) + '</p>') + '</div>';
}
SLIDE_RENDER.summary = function(d){
  var r = RAG[d.rag] || RAG.green;
  var left = '<div class="sl-sml"><div class="sl-rag" style="background:' + r.c + '"><span>' + esc(T('Overall status', '总体状态')) + '</span><b>' + esc(T1(r.en, r.zh)) + '</b></div>' +
    '<div class="sl-tile"><span>' + esc(d.base ? T('Planned to date (baseline)', '截至今日计划（基准）') : T('Planned to date', '截至今日计划')) + '</span><b>' + (d.loading ? '…' : d.plan == null ? '—' : n0(d.plan, 0) + '%') + '</b></div>' +
    '<div class="sl-tile good"><span>' + esc(T('Actual to date', '截至今日实际')) + '</span><b>' + (d.loading ? '…' : d.act == null ? '—' : n0(d.act, 0) + '%') + '</b></div>' +
    '<div class="sl-tile' + (d.v != null && d.v < 0 ? ' bad' : '') + '"><span>' + esc(T('Variance', '偏差')) + '</span><b>' + (d.v == null ? '—' : (d.v > 0 ? '+' : '') + n0(d.v, 0) + ' pp') + '</b>' + (d.late ? '<small>' + esc(T(n0(d.late, 0) + ' milestone(s) late', n0(d.late, 0) + ' 个里程碑延误')) + '</small>' : '') + '</div></div>';
  var right = '<div class="sl-smg">' + sumList(T('Achieved in the last ' + d.period + ' days', '近 ' + d.period + ' 天完成'), d.ach, d.achTxt, 'ach', T('No milestones achieved in this period.', '本期没有达成的里程碑。')) +
    sumList(T('Next milestones', '下一步里程碑'), d.next, '', 'next', T('No milestones in the next 60 days.', '未来 60 天没有里程碑。')) +
    sumList(T('Top issues & risks', '主要问题与风险'), d.iss, d.issTxt, 'iss', T('No open issues.', '没有未解决的问题。')) +
    sumList(T('Decisions needed from the Owner', '需业主决策事项'), d.dec, d.decTxt, 'dec', T('None this period.', '本期没有。')) + '</div>';
  return ['<div class="sl-smw">' + left + right + '</div>'];
};

/* ---------------- two-part slide ---------------- */
function comboPart(x, parent){ var c = Object.assign({}, (x && x.cfg) || {}); if(parent && parent.cfg){ c.msg = parent.cfg.msg; c.side = parent.cfg.side; } return {type:x ? x.type : 'text', cfg:c}; }
SLIDE_DATA.combo = function(c, ctx){
  function one(x){ if(!x || !SLIDE_DATA[x.type]) return {err:'x'}; try{ return SLIDE_DATA[x.type](x.cfg || {}, ctx); }catch(e){ console.error(e); return {err:'x'}; } }
  return {split:c.split || '1:1', L:one(c.L), R:one(c.R), tL:c.L && c.L.type, tR:c.R && c.R.type, hL:c.L && c.L.title || null, hR:c.R && c.R.title || null};
};
SLIDE_RENDER.combo = function(d, s){
  var sp = (d.split || '1:1').split(':').map(Number), tot = 1184 - 28, wl = Math.round(tot * sp[0] / (sp[0] + sp[1])), wr = tot - wl, H = 560 - (s.cfg && s.cfg.msg ? 60 : 0) - (s.cfg && s.cfg.side ? 130 : 0);
  function part(key, t, data, w){ var x = (s.cfg && s.cfg[key]) || {type:t}, ps = comboPart(x, s), pages, ttl = d['h' + key] || x.title; try{ pages = SLIDE_RENDER[t](data, ps, {w:w, h:H}); }catch(e){ console.error(e); pages = [slEmpty('This part could not be drawn.', '这部分无法显示。')]; }
    return '<div class="sl-cmb" data-hp="cfg.' + key + '" style="width:' + w + 'px">' + (ttl && (ttl.en || ttl.zh) ? '<h3 class="sl-cmbt">' + bil1(ttl) + '</h3>' : '') + (pages[0] || '') + (pages.length > 1 ? '<div class="sl-more">' + esc(T('+' + (pages.length - 1) + ' more page(s) not shown — leave some items out or use a full slide', '另有 ' + (pages.length - 1) + ' 页未显示，可隐藏部分内容或改用整页')) + '</div>' : '') + '</div>'; }
  return ['<div class="sl-cmw">' + part('L', d.tL, d.L, wl) + part('R', d.tR, d.R, wr) + '</div>'];
};

SLIDE_CSS += [
'.sl-smw{display:grid;grid-template-columns:330px 1fr;gap:28px;flex:1;min-height:0}',
'.sl-sml{display:flex;flex-direction:column;gap:12px}.sl-sml .sl-tile{padding:10px 16px}.sl-sml .sl-tile b{font-size:30px}',
'.sl-rag{border-radius:10px;color:#fff;padding:14px 18px;display:flex;flex-direction:column;gap:2px}.sl-rag span{font-size:14px;opacity:.9}.sl-rag b{font-size:34px;line-height:1.1}',
'.sl-smg{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:16px 24px;min-height:0}',
'.sl-sm{border-top:3px solid var(--sl-p2);padding-top:8px;min-height:0;overflow:hidden}.sl-sm h3{margin:0 0 6px;font-size:16px;color:var(--sl-p)}',
'.sl-sm ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}.sl-sm li{display:flex;gap:10px;align-items:baseline;font-size:15px;line-height:1.3}.sl-sm li:before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:var(--sl-acc);transform:translateY(-3px)}',
'.sl-smt{flex:1;min-width:0}.sl-smd{flex:none;font:13px ui-monospace,Menlo,monospace;color:#5A6067;white-space:nowrap}.sl-smd.ok{color:#1F6B45}.sl-smd.bad{color:#A1262A;font-weight:700}',
'.sl-cmw{display:flex;gap:28px;flex:1;min-height:0}.sl-cmb{display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0;overflow:hidden}',
'.sl-cmbt{margin:0;font-size:17px;color:var(--sl-p);border-bottom:2px solid var(--sl-p2);padding-bottom:4px}',
'.sl-cmb .sl-tiles{grid-template-columns:repeat(2,1fr)}.sl-cmb .sl-2c{grid-template-columns:1fr}.sl-cmb .sl-bdr{grid-template-columns:38% 1fr 70px}.sl-cmb .sl-t{font-size:14px}.sl-cmb .sl-t td{padding:6px 8px}.sl-cmb .sl-txt{font-size:20px}',
'.sl-more{font-size:12px;color:#8A9096;font-style:italic}'
].join('\n');
(function(){ var st = document.getElementById('slide-css'); if(st) st.textContent = SLIDE_CSS; })();
