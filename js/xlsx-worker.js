/* work-web · reads a spreadsheet away from the page. A crafted file cannot reach the site's own objects
   (SheetJS 0.18.5 has known issues with malicious files), and a parse that hangs is simply stopped. */
'use strict';
importScripts('../vendor/xlsx-0.18.5.full.min.js');
onmessage = function(e){
  try{
    var wb = XLSX.read(e.data, {type:'array', cellDates:true}), out = [];
    wb.SheetNames.forEach(function(sn){ out.push({sn:String(sn), aoa:XLSX.utils.sheet_to_json(wb.Sheets[sn], {header:1, defval:'', raw:true, blankrows:false})}); });
    postMessage({ok:true, sheets:out});
  }catch(err){ postMessage({ok:false, err:String((err && err.message) || err)}); }
};
