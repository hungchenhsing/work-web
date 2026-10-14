/* work-web v2 · export a presentation as an editable PowerPoint file.
   Each page is laid out by the browser exactly as on screen, then read back element by element:
   boxes → shapes, text → text boxes, tables → PowerPoint tables, the S-curve → a native line chart, arrows → lines,
   photos / logos → pictures. Everything stays editable in PowerPoint. The library loads only when needed. */
'use strict';

var PPTX_LIB = 'vendor/pptxgenjs-3.12.0.bundle.js';
function loadPptxLib(){
  if(window.PptxGenJS) return Promise.resolve();
  return new Promise(function(res, rej){ var s = document.createElement('script'); s.src = PPTX_LIB; s.onload = function(){ res(); }; s.onerror = function(){ rej(new Error('Could not load the PowerPoint library')); }; document.head.appendChild(s); });
}
var PPTX_DPI = 96;  // CSS px per inch; the slide is 1280 × 720 px = 13.333 × 7.5 in (LAYOUT_WIDE)
function inch(v){ return Math.round(v / PPTX_DPI * 1000) / 1000; }
function rgbHex(c){ var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(c || ''); if(!m) return null; if(m[4] != null && +m[4] < 0.05) return null; return [m[1], m[2], m[3]].map(function(x){ return (+x).toString(16).padStart(2, '0'); }).join('').toUpperCase(); }
function alphaOf(c){ var m = /rgba\(\s*\d+[,\s]+\d+[,\s]+\d+[,\s/]+([\d.]+)/.exec(c || ''); return m ? +m[1] : 1; }
function gradFirst(bi){ var m = /rgba?\([^)]*\)/.exec(bi || ''); return m ? rgbHex(m[0]) : null; }
function hasCJK(t){ return /[　-鿿＀-￯]/.test(t); }
function fontFor(cs, text){ if(/mono|Menlo|Consolas/i.test(cs.fontFamily)) return 'Consolas'; return hasCJK(text) ? 'Microsoft YaHei' : 'Calibri'; }
function toDataUrl(url){
  if(!url) return Promise.resolve(null); if(/^data:/.test(url)) return Promise.resolve(url);
  return fetch(url).then(function(r){ if(!r.ok) throw new Error(r.status); return r.blob(); }).then(function(b){ return new Promise(function(res){ var fr = new FileReader(); fr.onload = function(){ res(fr.result); }; fr.onerror = function(){ res(null); }; fr.readAsDataURL(b); }); }).catch(function(){ return null; });
}
function svgToPng(svg, w, h){
  return new Promise(function(res){ try{ var xml = new XMLSerializer().serializeToString(svg), u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml), im = new Image();
    im.onload = function(){ var c = document.createElement('canvas'); c.width = Math.round(w * 2); c.height = Math.round(h * 2); var g = c.getContext('2d'); g.scale(2, 2); g.drawImage(im, 0, 0, w, h); try{ res(c.toDataURL('image/png')); }catch(e){ res(null); } };
    im.onerror = function(){ res(null); }; im.src = u; }catch(e){ res(null); } });
}

/* read one rendered page and add it to a PowerPoint slide */
async function pageToSlide(pptx, root, note){
  var slide = pptx.addSlide(), R0 = root.getBoundingClientRect(), jobs = [];
  slide.background = {color:'FFFFFF'};
  function box(r){ return {x:inch(r.left - R0.left), y:inch(r.top - R0.top), w:inch(Math.max(1, r.width)), h:inch(Math.max(1, r.height))}; }
  function visible(el, cs){ if(cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; var r = el.getBoundingClientRect(); return r.width > 0.5 && r.height > 0.5; }
  function runStyle(cs, text){ var o = {fontFace:fontFor(cs, text), fontSize:Math.max(5, Math.round(parseFloat(cs.fontSize) * 0.75 * 10) / 10), color:rgbHex(cs.color) || '1A1D21', bold:+cs.fontWeight >= 600 || cs.fontWeight === 'bold'}; if(cs.fontStyle === 'italic') o.italic = true; return o; }
  function shapeFor(el, cs, r){
    var bg = rgbHex(cs.backgroundColor), gr = cs.backgroundImage && cs.backgroundImage !== 'none' ? gradFirst(cs.backgroundImage) : null, fill = bg || gr;
    var bw = ['Top','Right','Bottom','Left'].map(function(s){ return parseFloat(cs['border' + s + 'Width']) || 0; }), bc = ['Top','Right','Bottom','Left'].map(function(s){ return rgbHex(cs['border' + s + 'Color']); });
    var allB = bw.every(function(x){ return x > 0 && x === bw[0]; }) && bc.every(function(x){ return x && x === bc[0]; }) && cs.borderTopStyle !== 'none';
    var shapeName = el.dataset && el.dataset.shape === 'diamond' ? 'diamond' : el.dataset && el.dataset.shape === 'ellipse' || parseFloat(cs.borderTopLeftRadius) >= Math.min(r.width, r.height) / 2 - 1 && parseFloat(cs.borderTopLeftRadius) > 4 ? 'ellipse' : parseFloat(cs.borderTopLeftRadius) > 3 ? 'roundRect' : 'rect';
    var b = box(r);
    if(shapeName === 'diamond'){ var d = Math.min(r.width, r.height), cx = r.left + r.width / 2, cy = r.top + r.height / 2; b = {x:inch(cx - d / 2 - R0.left), y:inch(cy - d / 2 - R0.top), w:inch(d), h:inch(d)}; }
    if(fill || allB){ var o = Object.assign({}, b, {fill:fill ? {color:fill, transparency:Math.round((1 - alphaOf(cs.backgroundColor)) * 100)} : {type:'none'}, line:allB ? {color:bc[0], width:Math.max(0.25, bw[0] * 0.75), dashType:cs.borderTopStyle === 'dashed' ? 'dash' : 'solid'} : {type:'none'}});
      if(shapeName === 'roundRect') o.rectRadius = Math.min(0.5, parseFloat(cs.borderTopLeftRadius) / Math.min(r.width, r.height));
      slide.addShape(shapeName === 'roundRect' ? pptx.ShapeType.roundRect : shapeName === 'ellipse' ? pptx.ShapeType.ellipse : shapeName === 'diamond' ? pptx.ShapeType.diamond : pptx.ShapeType.rect, o); }
    if(!allB) bw.forEach(function(w, i){ if(w <= 0 || !bc[i] || cs['border' + ['Top','Right','Bottom','Left'][i] + 'Style'] === 'none') return;
      var x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.top; if(i === 1){ x1 = x2 = r.right; y2 = r.bottom; } if(i === 2){ y1 = y2 = r.bottom; } if(i === 3){ x2 = x1; y2 = r.bottom; }
      slide.addShape(pptx.ShapeType.line, {x:inch(x1 - R0.left), y:inch(y1 - R0.top), w:inch(x2 - x1) || 0.001, h:inch(y2 - y1) || 0.001, line:{color:bc[i], width:Math.max(0.25, w * 0.75), dashType:cs['border' + ['Top','Right','Bottom','Left'][i] + 'Style'] === 'dashed' ? 'dash' : 'solid'}}); });
  }
  function textRuns(el, out, inheritCs){
    Array.prototype.forEach.call(el.childNodes, function(n){
      if(n.nodeType === 3){ var t = n.textContent.replace(/\s+/g, ' '); if(t.trim() || out.length) out.push({text:t, options:runStyle(inheritCs, t)}); }
      else if(n.nodeType === 1){ var cs = getComputedStyle(n); if(cs.display === 'none') return; if(n.tagName === 'BR'){ out.push({text:'', options:{breakLine:true}}); return; } if(cs.display === 'block' && out.length){ out[out.length - 1].options.breakLine = true; } textRuns(n, out, cs); }
    });
    return out;
  }
  function isInlineOnly(el){ return Array.prototype.every.call(el.children, function(c){ var d = getComputedStyle(c).display; return d === 'inline' || c.tagName === 'BR'; }); }
  function addText(el, cs, r, runs){
    if(!runs.length) return; var txt = runs.map(function(x){ return x.text; }).join(''); if(!txt.trim()) return;
    runs[0].text = runs[0].text.replace(/^\s+/, ''); runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
    var pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0, pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0, bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0;
    var x = r.left + pl + bl - R0.left, y = r.top + pt + bt - R0.top, w = r.width - pl - pr - bl * 2 + 6, h = r.height - pt - pb - bt * 2;
    var lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3, oneLine = h < lh * 1.6;
    var al = cs.textAlign === 'center' ? 'center' : cs.textAlign === 'right' || cs.textAlign === 'end' ? 'right' : 'left', va = (cs.display === 'flex' || cs.display === 'inline-flex') && cs.alignItems === 'center' || el.tagName === 'TD' || el.tagName === 'TH' ? 'middle' : 'top';
    if(el.tagName === 'LI') runs.unshift({text:(el.classList.contains('sub') ? '◦ ' : '• '), options:Object.assign(runStyle(cs, '•'), {color:'E8930C', bold:true})});
    slide.addText(runs, {x:inch(x - 2), y:inch(y), w:inch(Math.max(8, w)), h:inch(Math.max(lh, h)), margin:0, align:al, valign:va, wrap:!(oneLine || cs.whiteSpace === 'nowrap'), fit:'none', lineSpacingMultiple:Math.max(0.9, Math.min(1.6, lh / (parseFloat(cs.fontSize) || 16)))});
  }
  function addTable(tb){
    var r = tb.getBoundingClientRect(), rows = [], colW = [], rowH = [];
    Array.prototype.forEach.call(tb.rows, function(tr, ri){
      rowH.push(inch(tr.getBoundingClientRect().height));
      var row = [];
      Array.prototype.forEach.call(tr.cells, function(td, ci){
        var cs = getComputedStyle(td), trcs = getComputedStyle(tr), txt = String(td.innerText || td.textContent || '').replace(/[ \t]+/g, ' ').trim(), chip = td.querySelector('.sl-chip,.sl-blk'), ccs = chip ? getComputedStyle(chip) : cs;
        if(ri === 0) colW.push(inch(td.getBoundingClientRect().width));
        var fill = rgbHex(cs.backgroundColor) || rgbHex(trcs.backgroundColor), o = Object.assign(runStyle(chip && chip.textContent.trim() === txt ? ccs : cs, txt), {align:cs.textAlign === 'center' ? 'center' : cs.textAlign === 'right' ? 'right' : 'left', valign:'middle'});
        if(fill) o.fill = {color:fill}; if(td.colSpan > 1) o.colspan = td.colSpan;
        var bb = rgbHex(cs.borderBottomColor), bbw = parseFloat(cs.borderBottomWidth) || 0, bt = rgbHex(cs.borderTopColor), btw = parseFloat(cs.borderTopWidth) || 0, blc = rgbHex(cs.borderLeftColor), blw = parseFloat(cs.borderLeftWidth) || 0;
        o.border = [btw ? {type:'solid', pt:btw * 0.75, color:bt} : {type:'none'}, blw && blc ? {type:'solid', pt:blw * 0.75, color:blc} : {type:'none'}, bbw ? {type:'solid', pt:bbw * 0.75, color:bb} : {type:'none'}, blw && blc ? {type:'solid', pt:blw * 0.75, color:blc} : {type:'none'}];
        row.push({text:txt, options:o});
      });
      rows.push(row);
    });
    if(!rows.length) return;
    slide.addTable(rows, {x:inch(r.left - R0.left), y:inch(r.top - R0.top), w:inch(r.width), colW:colW, rowH:rowH, margin:[2, 5, 2, 5], autoPage:false});
  }
  async function walk(el){
    var cs = getComputedStyle(el); if(!visible(el, cs)) return;
    var r = el.getBoundingClientRect(), tag = el.tagName;
    if(tag === 'TABLE' && !el.querySelector('.sl-gc,.sl-bar,.sl-dia,img')){ addTable(el); return; }
    if(tag === 'svg' || tag === 'SVG'){
      if(el.dataset.chart){ try{ var ch = JSON.parse(el.dataset.chart), b = box(r);
        var lastM = ''; var labs = ch.labels.map(function(l){ var m = l.slice(0, 7); if(m === lastM) return ''; lastM = m; var dt = new Date(l + 'T00:00:00Z'); return MON[dt.getUTCMonth()] + ' ' + String(dt.getUTCFullYear()).slice(2); });
        slide.addChart(pptx.ChartType.line, ch.series.map(function(sr){ return {name:sr.name, labels:labs, values:sr.values.map(function(v){ return v == null ? null : v; })}; }), Object.assign(b, {chartColors:ch.series.map(function(sr){ return sr.color; }), lineSize:2, lineDataSymbol:'none', valAxisMaxVal:100, valAxisMinVal:0, valAxisLabelFormatCode:'0"%"', catAxisLabelFrequency:1, catAxisLabelRotate:0, showLegend:false, catAxisLabelFontSize:9, valAxisLabelFontSize:9, legendFontSize:10, displayBlanksAs:'gap'})); }catch(e){ console.warn(e); } return; }
      if(el.dataset.line){ var p = el.dataset.line.split(','), x1 = +p[0], y1 = +p[1], x2 = +p[2], y2 = +p[3], sc = R0.width / 1280, dx = x2 - x1, dy = y2 - y1;
        var o = {x:inch(Math.min(x1, x2) * sc), y:inch(Math.min(y1, y2) * sc), w:inch(Math.abs(dx) * sc) || 0.001, h:inch(Math.abs(dy) * sc) || 0.001, line:{color:p[5], width:+p[4] * 0.75}};
        if(p[6] === '1') o.line.endArrowType = 'triangle';
        if(dx < 0) o.flipH = true; if(dy < 0) o.flipV = true;
        slide.addShape(pptx.ShapeType.line, o); return; }
      var png = await svgToPng(el, r.width, r.height); if(png) slide.addImage(Object.assign(box(r), {data:png})); return;
    }
    if(tag === 'IMG'){ var du = await toDataUrl(el.currentSrc || el.src); if(du){ var fit = getComputedStyle(el).objectFit, iw = el.naturalWidth || r.width, ih = el.naturalHeight || r.height, b2 = box(r);
        if(fit === 'cover' || fit === 'contain') b2.sizing = {type:fit, w:b2.w, h:b2.h};
        slide.addImage(Object.assign(b2, {data:du})); } return; }
    if(el.classList && (el.classList.contains('dk-selbox') || el.id === 'dkx')) return;
    shapeFor(el, cs, r);
    if(el.dataset && el.dataset.shape === 'diamond') return;
    var hasText = Array.prototype.some.call(el.childNodes, function(n){ return n.nodeType === 3 && n.textContent.trim(); });
    if(el.children.length === 0 || (hasText && isInlineOnly(el)) || (isInlineOnly(el) && el.textContent.trim() && !el.querySelector('img,svg,table'))){ addText(el, cs, r, textRuns(el, [], cs)); return; }
    for(var i = 0; i < el.childNodes.length; i++){ var n = el.childNodes[i];
      if(n.nodeType === 3){ var t = n.textContent.replace(/\s+/g, ' '); if(!t.trim()) continue; var rg = document.createRange(); rg.selectNodeContents(n); var rr = rg.getBoundingClientRect(); if(rr.width < 1) continue;
        slide.addText([{text:t.trim(), options:runStyle(cs, t)}], {x:inch(rr.left - R0.left - 1), y:inch(rr.top - R0.top), w:inch(rr.width + 6), h:inch(rr.height), margin:0, wrap:false, valign:'top'}); }
      else if(n.nodeType === 1) await walk(n); }
  }
  await walk(root);
  if(note) slide.addNotes(note);
}

async function buildPptx(pages, title, fileName){
  await loadPptxLib();
  var pptx = new window.PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.title = title || 'Presentation'; pptx.company = cfg().projectEn || '';
  var host = document.createElement('div'); host.className = 'pptx-host'; host.style.cssText = 'position:fixed;left:-30000px;top:0;width:1280px;height:720px;overflow:hidden;z-index:-1'; document.body.appendChild(host);
  try{
    for(var i = 0; i < pages.length; i++){
      host.innerHTML = pages[i].html;
      var imgs = Array.prototype.slice.call(host.querySelectorAll('img'));
      await Promise.all(imgs.map(function(im){ return im.complete ? 0 : new Promise(function(r){ im.onload = im.onerror = r; setTimeout(r, 8000); }); }));
      await pageToSlide(pptx, host.firstElementChild, pages[i].note || '');
      if(S.pptxProg) S.pptxProg(i + 1, pages.length);
    }
  } finally { host.remove(); }
  await pptx.writeFile({fileName:(fileName || title || 'presentation').replace(/[\\\/:*?"<>|]+/g, ' ').slice(0, 120) + '.pptx'});
}
function deckPptx(deck){
  toast(T('Building the PowerPoint file…', '正在生成 PowerPoint 文件…'));
  S.pptxProg = function(i, n){ toast(T('Building the PowerPoint file… ' + i + ' / ' + n, '正在生成 PowerPoint 文件… ' + i + ' / ' + n)); };
  deckPrepare(deck).then(function(){ var pages = []; deckBuild(deck).forEach(function(x){ x.pages.forEach(function(h){ pages.push({html:h, note:x.s.note || ''}); }); }); return buildPptx(pages, deckTitle(deck.d), pdfTitle(deck.d)); })
    .then(function(){ S.pptxProg = null; toast(T('PowerPoint file downloaded', 'PowerPoint 文件已下载')); }).catch(function(e){ S.pptxProg = null; console.error(e); toast(T('Could not build the PowerPoint file: ', '无法生成 PowerPoint 文件：') + (e && e.message || e)); });
}
function pubPptx(p){
  toast(T('Building the PowerPoint file…', '正在生成 PowerPoint 文件…'));
  buildPptx(pubPages(p).map(function(x){ return {html:x.html}; }), T1(p.title.en, p.title.zh), [p.deckNo || p.no, T1(p.title.en, p.title.zh), p.date].filter(Boolean).join(' · ')).then(function(){ toast(T('PowerPoint file downloaded', 'PowerPoint 文件已下载')); }).catch(function(e){ toast(String(e && e.message || e)); });
}
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act]'); if(!el) return;
  if(el.dataset.act === 'dkPptx'){ var d = getRec(el.dataset.v); if(d) deckPptx(d); }
  if(el.dataset.act === 'pubPptx'){ var p = curPub(); if(p) pubPptx(p); }
});
