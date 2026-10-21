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
    var tail = kind === 'ach' ? '<span class="sl-smd ok">✓ ' + esc(fmtD(x.fc)) + '</span>' : kind === 'next' ? '<span class="sl-smd' + (x.slip > 0 ? ' bad' : '') + '">' + esc(fmtD(x.fc)) + (x.slip > 0 ? ' · +' + n0(x.slip, 0) + T('d', '天') : '') + '</span>' : kind === 'dec' ? (x.due != null ? '<span class="sl-smd' + (x.due < 0 ? '' : '') + '">' + esc(T('by ', '截止 ') + fmtD(x.due)) + '</span>' : '') : (x.prio ? slSt(x.prio.color, x.prio.v) : '');
    return '<li data-hk="r:' + esc(x.id) + '" data-hl="' + esc(x.no) + '"><span class="sl-smt">' + bil1(x.t) + '</span>' + tail + '</li>'; }).join('') + lines.map(function(l){ return '<li><span class="sl-smt">' + esc(l.replace(/^[\s\-•*]+/, '')) + '</span></li>'; }).join('') + '</ul>' : '<p class="sl-note">' + esc(empty) + '</p>') + '</div>';
}
SLIDE_RENDER.summary = function(d, s, box){
  var r = RAG[d.rag] || RAG.green, nar = box && box.w < 900;
  var big = [[d.base ? T('Planned to date (baseline)', '截至今日计划（基准）') : T('Planned to date', '截至今日计划'), d.loading ? '…' : d.plan == null ? '—' : n0(d.plan, 0) + '%', ''],
    [T('Actual to date', '截至今日实际'), d.loading ? '…' : d.act == null ? '—' : n0(d.act, 0) + '%', ''],
    [T('Variance', '偏差'), d.v == null ? '—' : (d.v > 0 ? '+' : d.v < 0 ? '−' : '') + n0(Math.abs(d.v), 0) + ' pp', d.v != null && d.v < 0 ? 'bad' : d.v > 0 ? 'good' : ''],
    [T('Late milestones', '延误里程碑'), String(n0(d.late || 0, 0)), d.late ? 'bad' : '']];
  var left = '<div class="sl-sml"><div class="sl-rag"><i style="background:' + r.c + '"></i><div><b>' + esc(T1(r.en, r.zh)) + '</b><span>' + esc(d.ragAuto ? T('Overall status · from variance', '总体状态 · 按偏差自动判断') : T('Overall status', '总体状态')) + '</span></div></div>' +
    '<div class="sl-big">' + big.map(function(x){ return '<div class="' + x[2] + '"><small>' + esc(x[0]) + '</small><b>' + esc(x[1]) + '</b></div>'; }).join('') + '</div></div>';
  var right = '<div class="sl-smg">' + sumList(T('Achieved in the last ' + d.period + ' days', '近 ' + d.period + ' 天完成'), d.ach, d.achTxt, 'ach', T('No milestones achieved in this period.', '本期没有达成的里程碑。')) +
    sumList(T('Next milestones', '下一步里程碑'), d.next, '', 'next', T('No milestones in the next 60 days.', '未来 60 天没有里程碑。')) +
    sumList(T('Top issues & risks', '主要问题与风险'), d.iss, d.issTxt, 'iss', T('No open issues.', '没有未解决的问题。')) +
    sumList(T('Decisions needed from the Owner', '需业主决策事项'), d.dec, d.decTxt, 'dec', T('None this period.', '本期没有。')) + '</div>';
  return ['<div class="sl-smw' + (nar ? ' nar' : '') + '">' + left + right + '</div>'];
};

/* ---------------- two-part slide ---------------- */
function comboPart(x, parent){ var c = Object.assign({}, (x && x.cfg) || {}); if(parent && parent.cfg){ c.msg = parent.cfg.msg; c.side = parent.cfg.side; } return {type:x ? x.type : 'text', cfg:c}; }
SLIDE_DATA.combo = function(c, ctx){
  function one(x){ if(!x || !SLIDE_DATA[x.type]) return {err:'x'}; LK_DECK++; try{ return SLIDE_DATA[x.type](x.cfg || {}, ctx); }catch(e){ console.error(e); return {err:'x'}; } finally { LK_DECK--; } }
  return {split:c.split || '1:1', L:one(c.L), R:one(c.R), tL:c.L && c.L.type, tR:c.R && c.R.type, hL:c.L && c.L.title || null, hR:c.R && c.R.title || null};
};
SLIDE_RENDER.combo = function(d, s, box){
  var sp = (d.split || '1:1').split(':').map(Number), tot = ((box && box.w) || 1184) - 32, wl = Math.round(tot * sp[0] / (sp[0] + sp[1])), wr = tot - wl, H = ((box && box.h) || 560) - (msgIn(s) ? 60 : 0) - (s.cfg && s.cfg.side ? 130 : 0);
  function part(key, t, data, w){ var x = (s.cfg && s.cfg[key]) || {type:t}, ps = comboPart(x, s), pages, ttl = d['h' + key] || x.title; try{ pages = slRender(t, data, ps, {w:w, h:H}); }catch(e){ console.error(e); pages = [slEmpty('This part could not be drawn.', '这部分无法显示。')]; }
    return '<div class="sl-cmb" data-hp="cfg.' + key + '" style="width:' + w + 'px">' + (ttl && (ttl.en || ttl.zh) ? '<h3 class="sl-cmbt">' + bil1(ttl) + '</h3>' : '') + (pages[0] || '') + (pages.length > 1 ? '<div class="sl-more">' + esc(T('+' + (pages.length - 1) + ' more page(s) not shown — leave some items out or use a full slide', '另有 ' + (pages.length - 1) + ' 页未显示，可隐藏部分内容或改用整页')) + '</div>' : '') + '</div>'; }
  return ['<div class="sl-cmw">' + part('L', d.tL, d.L, wl) + part('R', d.tR, d.R, wr) + '</div>'];
};

SLIDE_CSS += [
'.sl-smw{display:grid;grid-template-columns:340px 1fr;gap:44px;flex:1;min-height:0}.sl-smw.nar{grid-template-columns:1fr;gap:20px}',
'.sl-sml{display:flex;flex-direction:column;gap:0}',
'.sl-rag{display:flex;align-items:center;gap:16px;padding-bottom:18px;border-bottom:1px solid var(--sl-line);margin-bottom:18px}.sl-rag i{flex:none;width:48px;height:48px;border-radius:50%}.sl-rag b{display:block;font-size:30px;line-height:1.1;font-weight:700}.sl-rag span{font-size:15px;color:var(--sl-mut)}',
'.sl-big{display:grid;grid-template-columns:1fr 1fr;gap:20px 22px}.sl-big small{display:block;font-size:14px;color:var(--sl-mut)}.sl-big b{display:block;font-size:42px;line-height:1.1;font-weight:600;letter-spacing:-.01em}.sl-big .bad b{color:#C8372D}.sl-big .good b{color:#1F6B45}',
'.sl-smg{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto auto;gap:28px 36px;align-content:start;min-height:0}',
'.sl-sm{min-height:0;overflow:hidden}.sl-sm h3{margin:0 0 8px;font-size:17px;font-weight:600;color:var(--sl-p);padding-bottom:6px;border-bottom:1.5px solid var(--sl-ink)}',
'.sl-sm ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column}.sl-sm li{display:flex;gap:12px;align-items:baseline;justify-content:space-between;font-size:17px;line-height:1.35;padding:6px 0;border-bottom:1px solid #E3E6EA}',
'.sl-smt{flex:1;min-width:0}.sl-smd{flex:none;font-size:15px;color:var(--sl-mut);white-space:nowrap}.sl-smd.ok{color:#1F6B45}.sl-smd.bad{color:#C8372D;font-weight:600}',
'.sl-cmw{display:flex;gap:28px;flex:1;min-height:0}.sl-cmb{display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0;overflow:hidden}',
'.sl-cmbt{margin:0;font-size:18px;font-weight:600;color:var(--sl-p);border-bottom:1.5px solid var(--sl-ink);padding-bottom:6px}',
'.sl-cmb .sl-tiles{grid-template-columns:repeat(2,1fr)}.sl-cmb .sl-2c{grid-template-columns:1fr}.sl-cmb .sl-bdr{grid-template-columns:38% 1fr 70px}.sl-cmb .sl-t{font-size:14px}.sl-cmb .sl-t td{padding:6px 8px}.sl-cmb .sl-txt{font-size:20px}',
'.sl-cmw .sl-more{margin-top:4px}',
'.sl-b,.sl-dbb,.sl-cmb{container-type:inline-size}',
'@container (max-width:760px){.sl-tiles,.sl-tiles.s3{grid-template-columns:repeat(2,1fr);gap:16px 20px}.sl-2c{grid-template-columns:1fr}.sl-bdr{grid-template-columns:38% 1fr 70px}.sl-smw{grid-template-columns:1fr;gap:18px}.sl-txt.two{grid-template-columns:1fr}.sl-tile b{font-size:34px}}'
].join('\n');
(function(){ var st = document.getElementById('slide-css'); if(st) st.textContent = SLIDE_CSS; })();
