/* work-web v3.2 · one date format everywhere (2026-10-20) and a small calendar.
   The browser's own date box shows dates in its own locale (10/20/2026 on many machines), so every <input type="date">
   the pages draw is turned into a text box that takes YYYY-MM-DD (also 2026/10/20, 20261020 or 10-20 for this year) with a
   calendar button. The box keeps the value format of a date input, so everything that reads it works as before. */
'use strict';

UI_ICONS.calendar = UI_ICONS.calendar || '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>';
function dateIn(o){ o = o || {}; return '<input class="in" type="date"' + (o.id ? ' id="' + esc(o.id) + '"' : '') + ' value="' + esc(o.value || '') + '"' + (o.label ? ' aria-label="' + esc(o.label) + '"' : '') + (o.attrs || '') + '>'; }

/* "2026/10/20", "20261020", "10-20" (this year), "2026-1-5" → "2026-01-05"; '' stays ''; null when it is not a date */
function normDate(s){
  s = String(s == null ? '' : s).trim(); if(!s) return '';
  var m = /^(\d{4})[-\/.年 ]?(\d{1,2})[-\/.月 ]?(\d{1,2})日?$/.exec(s), y, mo, d;
  if(m){ y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if((m = /^(\d{1,2})[-\/.月](\d{1,2})日?$/.exec(s))){ y = +(n2d(asOfN()) || TODAY_S).slice(0, 4); mo = +m[1]; d = +m[2]; }
  else return null;
  var t = new Date(Date.UTC(y, mo - 1, d)); if(t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return y + '-' + pad(mo) + '-' + pad(d);
}

/* turn the date boxes of a freshly drawn part of the page into ours */
function enhanceDates(root){
  if(!root || !root.querySelectorAll) return;
  Array.prototype.forEach.call(root.querySelectorAll('input[type="date"]'), function(el){
    el.type = 'text'; el.classList.add('dti'); el.setAttribute('inputmode', 'numeric'); el.setAttribute('autocomplete', 'off'); el.setAttribute('placeholder', 'YYYY-MM-DD'); el.setAttribute('maxlength', '10');
    el.setAttribute('aria-haspopup', 'dialog'); el.setAttribute('aria-expanded', 'false'); if(!el.title) el.title = T('YYYY-MM-DD · Alt+↓ opens the calendar', 'YYYY-MM-DD · Alt+↓ 打开日历');
    el.dataset.v0 = el.value;
    var w = document.createElement('span'); w.className = 'din'; el.parentNode.insertBefore(w, el); w.appendChild(el);
    var b = document.createElement('button'); b.type = 'button'; b.className = 'dpb'; b.tabIndex = -1; b.setAttribute('data-dpb', '1'); b.setAttribute('aria-label', T('Choose a date', '选择日期')); b.innerHTML = uic('calendar', 15);
    if(el.disabled) b.disabled = true;
    w.appendChild(b);
  });
}

/* typed dates are tidied before anyone else sees the change; a date that does not exist is put back */
document.addEventListener('change', function(e){
  var el = e.target; if(!el.classList || !el.classList.contains('dti')) return;
  var v = normDate(el.value);
  if(v === null){ e.stopImmediatePropagation(); toast(T('Not a date: ', '不是有效日期：') + el.value + ' — ' + T('use YYYY-MM-DD', '请用 YYYY-MM-DD')); el.value = el.dataset.v0 || ''; return; }
  el.value = v; el.dataset.v0 = v;
}, true);

/* ---------------- the calendar ---------------- */
var DP = null;   // {el, y, m, c: the day the keyboard is on, kb: opened from the keyboard}
function dpClose(){ var p = document.getElementById('dpop'); if(p) p.remove(); if(DP && DP.el){ DP.el.setAttribute('aria-expanded', 'false'); DP.el.removeAttribute('aria-activedescendant'); } DP = null; }
/* the page may have been drawn again since the calendar opened: find the same box again (or give up) */
function dpLive(){
  if(!DP) return null; var el = DP.el; if(el && el.isConnected) return el;
  var k = el && el.getAttribute('data-fk'), n = k ? document.querySelector('.dti[data-fk="' + k.replace(/"/g, '\\"') + '"]') : el && el.id ? document.getElementById(el.id) : null;
  if(n && n.classList.contains('dti') && !n.disabled){ DP.el = n; return n; }
  return null;
}
function dpOpen(el, kb){
  if(DP) dpClose();
  var v = normDate(el.value) || n2d(asOfN()) || TODAY_S, y = +v.slice(0, 4), m = +v.slice(5, 7) - 1;
  DP = {el:el, y:y, m:m, c:v, kb:!!kb}; el.setAttribute('aria-expanded', 'true'); dpDraw();
}
function dpMove(days, months){
  var c = DP.c.split('-').map(Number), t = new Date(Date.UTC(c[0], c[1] - 1 + (months || 0), c[2] + (days || 0)));
  if(months && t.getUTCDate() !== c[2]) t = new Date(Date.UTC(c[0], c[1] + months, 0));   // 31 Jan + 1 month → 28/29 Feb
  DP.c = t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); DP.y = t.getUTCFullYear(); DP.m = t.getUTCMonth(); DP.kb = true; dpDraw();
}
function dpDraw(){
  if(!DP) return; if(!dpLive()){ dpClose(); return; }
  var el = DP.el, cur = normDate(el.value) || '', today = TODAY_S, asof = n2d(asOfN()), first = new Date(Date.UTC(DP.y, DP.m, 1)), lead = (first.getUTCDay() + 6) % 7, days = new Date(Date.UTC(DP.y, DP.m + 1, 0)).getUTCDate();
  var mn = S.lang === 'zh' ? DP.y + ' 年 ' + (DP.m + 1) + ' 月' : first.toLocaleDateString('en-GB', {month:'long', year:'numeric', timeZone:'UTC'});
  var wd = S.lang === 'zh' ? ['一', '二', '三', '四', '五', '六', '日'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  var cells = ''; for(var i = 0; i < lead; i++) cells += '<span></span>';
  for(var d = 1; d <= days; d++){ var s = DP.y + '-' + pad(DP.m + 1) + '-' + pad(d);
    cells += '<button type="button" tabindex="-1" id="dpd-' + s + '" class="dpd' + (s === cur ? ' on' : '') + (s === today ? ' td' : '') + (s === asof && asof !== today ? ' as' : '') + (DP.kb && s === DP.c ? ' cur' : '') + '" data-dpv="' + s + '" aria-label="' + s + '"' + (s === cur ? ' aria-pressed="true"' : '') + '>' + d + '</button>'; }
  var p = document.getElementById('dpop');
  if(!p){ p = document.createElement('div'); p.id = 'dpop'; p.className = 'dpop'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', T('Choose a date', '选择日期')); document.body.appendChild(p); }
  p.innerHTML = '<div class="dph"><button type="button" class="ib" data-dpm="-1" aria-label="' + esc(T('Previous month', '上个月')) + '">‹</button><b>' + esc(mn) + '</b><button type="button" class="ib" data-dpm="1" aria-label="' + esc(T('Next month', '下个月')) + '">›</button></div>' +
    '<div class="dpg">' + wd.map(function(w){ return '<i>' + w + '</i>'; }).join('') + cells + '</div>' +
    '<div class="dpf"><button type="button" class="lnk" data-dpv="' + today + '">' + esc(T('Today', '今天')) + '</button>' + (asof && asof !== today ? '<button type="button" class="lnk" data-dpv="' + asof + '">' + esc(T('Status date', '状态日期')) + '</button>' : '') + '<span style="flex:1"></span><button type="button" class="lnk" data-dpv="">' + esc(T('Clear', '清除')) + '</button></div>';
  dpPlace();
  if(DP.kb && DP.c.slice(0, 7) === DP.y + '-' + pad(DP.m + 1)) el.setAttribute('aria-activedescendant', 'dpd-' + DP.c); else el.removeAttribute('aria-activedescendant');
}
/* keep the calendar next to its box; when the box scrolls out of sight the calendar closes */
function dpPlace(){
  var p = document.getElementById('dpop'), el = dpLive(); if(!p) return; if(!el){ dpClose(); return; }
  var r = el.getBoundingClientRect(), w = 264, h = p.offsetHeight || 300;
  if(r.bottom < 0 || r.top > window.innerHeight || (!r.width && !r.height)){ dpClose(); return; }
  var left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), top = r.bottom + 4;
  if(top + h > window.innerHeight - 8 && r.top - h - 4 > 8) top = r.top - h - 4;
  p.style.left = left + 'px'; p.style.top = Math.max(8, top) + 'px';
}
function dpPick(v){
  var el = dpLive(); dpClose(); if(!el) return;
  el.value = v; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true}));
  if(el.isConnected && !(el.dataset && el.dataset.ie)) el.focus();
}
/* the calendar button must not take the focus away (an inline cell editor would close) */
document.addEventListener('mousedown', function(e){ var b = e.target.closest && e.target.closest('[data-dpb], #dpop'); if(b) e.preventDefault(); }, true);
document.addEventListener('click', function(e){
  var t = e.target, b = t.closest && t.closest('[data-dpb]');
  if(b){ var el = b.parentNode && b.parentNode.querySelector('.dti'); if(el && !el.disabled){ if(DP && DP.el === el) dpClose(); else { if(document.activeElement !== el) el.focus({preventScroll:true}); dpOpen(el); } } e.preventDefault(); e.stopPropagation(); return; }
  var p = t.closest && t.closest('#dpop');
  if(p){ var dv = t.closest('[data-dpv]'), dm = t.closest('[data-dpm]');
    if(dv){ dpPick(dv.getAttribute('data-dpv')); }
    else if(dm && DP){ DP.m += +dm.getAttribute('data-dpm'); if(DP.m < 0){ DP.m = 11; DP.y--; } if(DP.m > 11){ DP.m = 0; DP.y++; } dpDraw(); }
    e.stopPropagation(); return; }
  if(DP) dpClose();
}, true);
/* keys while the calendar is open (the focus stays in the date box): ↑↓ a week, ←→ a day once the keyboard is in use, PgUp/PgDn a month, Enter picks, Escape closes */
document.addEventListener('keydown', function(e){
  if(!DP) return;
  if(e.key === 'Escape'){ dpClose(); e.preventDefault(); e.stopPropagation(); return; }
  if(e.target !== DP.el) return;
  var k = e.key, mv = {ArrowUp:[-7], ArrowDown:[7], PageUp:[0, -1], PageDown:[0, 1]}[k] || (DP.kb && {ArrowLeft:[-1], ArrowRight:[1]}[k]);
  if(mv && !e.altKey){ e.preventDefault(); e.stopPropagation(); dpMove(mv[0], mv[1]); return; }
  if(k === 'Enter' && DP.kb){ e.preventDefault(); e.stopPropagation(); dpPick(DP.c); return; }
  if(k === 'Tab' || k === 'Enter') dpClose();
}, true);
/* the focus leaving the date box closes the calendar */
document.addEventListener('focusout', function(e){
  if(!DP || e.target !== DP.el || (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#dpop'))) return;
  setTimeout(function(){ if(!DP) return; var a = document.activeElement; if(a && (a === dpLive() || (a.closest && a.closest('#dpop')))) return; dpClose(); }, 0);   // a redraw puts the focus back on the same box
});
window.addEventListener('resize', function(){ if(DP) dpPlace(); });
document.addEventListener('scroll', function(){ if(DP) dpPlace(); }, true);
/* Alt+↓ in a date box opens the calendar */
document.addEventListener('keydown', function(e){ var el = e.target; if(el.classList && el.classList.contains('dti') && e.altKey && e.key === 'ArrowDown'){ e.preventDefault(); e.stopPropagation(); if(DP && DP.el === el) dpClose(); else dpOpen(el, true); } }, true);
