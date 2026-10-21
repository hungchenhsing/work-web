/* work-web · reads a spreadsheet away from the page. A crafted file cannot reach the site's own objects
   (SheetJS 0.18.5 has known issues with malicious files), and a parse that hangs is simply stopped.
   v3.3.1: date cells come back as YYYY-MM-DD text worked out from the cell's serial number — SheetJS's own Date objects
   are off by one day in time zones such as Asia/Shanghai (it applies the 1899 local-mean-time offset). */
'use strict';
importScripts('../vendor/xlsx-0.18.5.full.min.js');
function p2(n){ return (n < 10 ? '0' : '') + n; }
onmessage = function(e){
  try{
    var wb = XLSX.read(e.data, {type:'array', cellDates:false, cellNF:true}), out = [];
    wb.SheetNames.forEach(function(sn){
      var ws = wb.Sheets[sn];
      Object.keys(ws).forEach(function(k){ if(k.charAt(0) === '!') return; var c = ws[k];
        if(c && c.t === 'n' && c.z && XLSX.SSF.is_date(c.z)){ var d = XLSX.SSF.parse_date_code(c.v); if(d && d.y > 1900){ c.t = 's'; c.v = d.y + '-' + p2(d.m) + '-' + p2(d.d); delete c.w; } }
        else if(c && c.t === 'd' && c.v instanceof Date){ c.t = 's'; c.v = c.v.getUTCFullYear() + '-' + p2(c.v.getUTCMonth() + 1) + '-' + p2(c.v.getUTCDate()); delete c.w; } });
      out.push({sn:String(sn), aoa:XLSX.utils.sheet_to_json(ws, {header:1, defval:'', raw:true, blankrows:false})});
    });
    postMessage({ok:true, sheets:out});
  }catch(err){ postMessage({ok:false, err:String((err && err.message) || err)}); }
};
