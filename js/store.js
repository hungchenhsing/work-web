/* work-web v2 · stores. Both expose the same API:
   cfg, regs [{id, owner, vis, d}], recs [{id, reg, d, ca, ua, ub}], audit [rows], pubs, fb, users, me
   and promise-returning writes. Writes update memory first (instant UI), then the server. */
'use strict';

function auditDiff(o, n){
  var keys = {}, out = [];
  Object.keys(o || {}).forEach(function(k){ keys[k] = 1; }); Object.keys(n || {}).forEach(function(k){ keys[k] = 1; });
  Object.keys(keys).sort().forEach(function(k){ if(!same((o || {})[k], (n || {})[k])) out.push(k); });
  return out;
}
function pick(o, keys){ var r = {}; keys.forEach(function(k){ r[k] = o && o[k] !== undefined ? o[k] : null; }); return r; }

/* ---------------- demo: everything in this browser ---------------- */
function DemoStore(){
  var KEY = 'ww2.demo';
  var st = LS.get(KEY, null);
  if(!st || !st.v2 || (st.v || 0) < 4){ st = buildDemo(); LS.set(KEY, st); }
  var blobs = {}, aid = st.audit.length ? st.audit[0].id : 0;
  function me(){ return api.me; }
  function log(row){ row.id = ++aid; row.at = new Date().toISOString(); row.actor = 'demo'; row.actor_name = 'Demo'; st.audit.unshift(row); if(st.audit.length > 1500) st.audit.length = 1500; }
  function rec(id){ return st.recs.filter(function(r){ return r.id === id; })[0]; }
  function reg(id){ return st.regs.filter(function(r){ return r.id === id; })[0]; }
  var api = {
    mode:'demo', ready:true, rt:'demo', me:{id:'demo', email:'', name:'Demo', role:'admin'}, users:[],
    get cfg(){ return st.cfg; }, get regs(){ return st.regs; }, get recs(){ return st.recs; }, get audit(){ return st.audit; }, get pubs(){ return st.pubs; }, get fb(){ return st.fb; },
    save: function(){ LS.set(KEY, st); notify(); },
    saveCfg: function(p){ st.cfg = Object.assign({}, st.cfg, clone(p)); api.save(); return Promise.resolve(); },
    createReg: function(r){ var o = {id:r.id, owner:'demo', vis:r.vis || 'team', d:clone(r.d)}; st.regs.push(o); log({register_id:o.id, action:'reg_insert', new:Object.assign({_visibility:o.vis}, o.d)}); api.save(); return Promise.resolve(); },
    patchReg: function(id, p){ var r = reg(id); if(!r) return Promise.resolve(); var old = clone(r.d); Object.assign(r.d, clone(p)); log({register_id:id, action:'reg_update', old:Object.assign({_visibility:r.vis}, old), new:Object.assign({_visibility:r.vis}, r.d)}); api.save(); return Promise.resolve(); },
    setRegVis: function(id, vis){ var r = reg(id); if(!r) return Promise.resolve(); var o = r.vis; r.vis = vis; log({register_id:id, action:'reg_update', old:Object.assign({_visibility:o}, r.d), new:Object.assign({_visibility:vis}, r.d)}); api.save(); return Promise.resolve(); },
    deleteReg: function(id){ var r = reg(id); if(!r) return Promise.resolve(); st.recs.filter(function(x){ return x.reg === id; }).forEach(function(x){ log({register_id:id, record_id:x.id, action:'delete', old:clone(x.d)}); }); st.recs = st.recs.filter(function(x){ return x.reg !== id; }); st.regs = st.regs.filter(function(x){ return x.id !== id; }); log({register_id:id, action:'reg_delete', old:Object.assign({_visibility:r.vis}, r.d)}); api.save(); return Promise.resolve(); },
    restoreReg: function(r){ if(reg(r.id)) return Promise.resolve(); return api.createReg(r); },
    createRec: function(r){ var o = {id:r.id, reg:r.reg, d:clone(r.d), ca:new Date().toISOString(), ua:new Date().toISOString(), ub:'Demo'}; st.recs.push(o); log({register_id:r.reg, record_id:r.id, action:'insert', new:clone(r.d)}); api.save(); return Promise.resolve(); },
    createRecs: function(arr){ arr.forEach(function(r){ var o = {id:r.id, reg:r.reg, d:clone(r.d), ca:new Date().toISOString(), ua:new Date().toISOString(), ub:'Demo'}; st.recs.push(o); log({register_id:r.reg, record_id:r.id, action:'insert', new:clone(r.d)}); }); api.save(); return Promise.resolve({ok:arr.length, failed:0}); },
    patchRec: function(id, p){ var r = rec(id); if(!r) return Promise.resolve(); var old = clone(r.d); Object.assign(r.d, clone(p)); var k = auditDiff(old, r.d); if(k.length) log({register_id:r.reg, record_id:id, action:'update', keys:k, old:pick(old, k), new:pick(r.d, k)}); r.ua = new Date().toISOString(); r.ub = 'Demo'; api.save(); return Promise.resolve(); },
    deleteRec: function(id){ var r = rec(id); if(!r) return Promise.resolve(); st.recs = st.recs.filter(function(x){ return x.id !== id; }); log({register_id:r.reg, record_id:id, action:'delete', old:clone(r.d)}); api.save(); return Promise.resolve(); },
    restoreRec: function(r){ var ex = rec(r.id); if(ex) return api.patchRec(r.id, r.d); return api.createRec(r); },
    ensurePubs: function(){ return Promise.resolve(); },
    auditRow: function(id){ return Promise.resolve(st.audit.filter(function(a){ return a.id === id; })[0] || null); },
    pubFull: function(id){ return Promise.resolve(st.pubs.filter(function(x){ return x.id === id; })[0] || null); },
    loadAudit: function(o){ o = o || {}; var rows = st.audit.filter(function(a){ return (!o.reg || a.register_id === o.reg) && (!o.rec || a.record_id === o.rec) && (!o.before || a.id < o.before) && (!o.since || a.at >= o.since); }); return Promise.resolve(rows.slice(0, o.limit || 200)); },
    createPub: function(id, data){ st.pubs.unshift(Object.assign({id:id}, clone(data))); api.save(); return Promise.resolve(); },
    deletePub: function(id){ st.pubs = st.pubs.filter(function(x){ return x.id !== id; }); api.save(); return Promise.resolve(); },
    /* public links (the demo keeps them in this browser and builds the public copy the way the database does) */
    shareList: function(){ return Promise.resolve((st.shares || []).map(function(x){ var d = x.data || {}; return {id:x.id, revoked:!!x.revoked, expires_at:x.expires_at || null, views:x.views || 0, last_view:x.last_view || null, created_at:x.created_at, kind:d.kind, mode:d.mode, title:d.title, cfg:d.cfg, snapAt:d.snapAt || null}; })); },
    shareCreate: function(id, data, exp){ st.shares = st.shares || []; var x = {id:id, data:clone(data), revoked:false, expires_at:exp || null, views:0, created_at:new Date().toISOString()}; if(data.mode === 'snap' && data.kind !== 'deck'){ x.data.snap = shareFreezeData(st, x.data); x.data.snapAt = new Date().toISOString(); } st.shares.unshift(x); api.save(); return Promise.resolve(); },
    shareFreeze: function(id){ var x = (st.shares || []).filter(function(s){ return s.id === id; })[0]; if(x && x.data.kind !== 'deck'){ x.data.snap = shareFreezeData(st, x.data); x.data.snapAt = new Date().toISOString(); api.save(); } return Promise.resolve(); },
    shareSetSnap: function(id, snap){ var x = (st.shares || []).filter(function(s){ return s.id === id; })[0]; if(x){ x.data.snap = clone(snap); x.data.snapAt = new Date().toISOString(); api.save(); } return Promise.resolve(); },
    shareSetCfg: function(id, c){ var x = (st.shares || []).filter(function(s){ return s.id === id; })[0]; if(x){ x.data.cfg = clone(c); api.save(); } return Promise.resolve(); },
    shareUpdate: function(id, p){ (st.shares || []).forEach(function(x){ if(x.id === id) Object.assign(x, clone(p)); }); api.save(); return Promise.resolve(); },
    shareDelete: function(id){ st.shares = (st.shares || []).filter(function(x){ return x.id !== id; }); api.save(); return Promise.resolve(); },
    /* what share_get returns; counted only when the link opens, once per 20 seconds */
    shareGet: function(token){
      var x = (st.shares || []).filter(function(s){ return s.id === token; })[0], res = shareServe(st, x);
      if(res && (!x.last_view || Date.now() - Date.parse(x.last_view) >= 20000)){ x.views = (x.views || 0) + 1; x.last_view = new Date().toISOString(); LS.set(KEY, st); }
      return Promise.resolve(res);
    },
    addFeedback: function(o){ st.fb.push(Object.assign({id:uid('f'), status:'open', created_at:new Date().toISOString(), author:'demo', author_name:'Demo'}, o)); api.save(); return Promise.resolve(); },
    updateFeedback: function(id, p){ st.fb.forEach(function(f){ if(f.id === id) Object.assign(f, p); }); api.save(); return Promise.resolve(); },
    resetDemo: function(){ LS.del(KEY); location.reload(); },
    upload: function(file){ var id = 'demo:' + uid('b'); blobs[id] = URL.createObjectURL(file); return Promise.resolve({path:id, name:file.name, type:file.type || '', size:file.size}); },
    fileUrl: function(path){ return blobs[path] || null; },
    signUrls: function(){ return Promise.resolve(); },
    removeFile: function(){ return Promise.resolve(); }
  };
  return api;
}

/* ---------------- cloud: Supabase ---------------- */
function CloudStore(url, key){
  var sb = window.supabase.createClient(url, key, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}});
  var urls = {}, pendingUrls = {}, urlTimer = null, channel = null;
  var api = {mode:'cloud', sb:sb, ready:false, rt:'connecting', session:null, me:null, cfg:null, regs:[], recs:[], audit:[], pubs:[], fb:[], users:[], v1:null};
  function rowReg(r){ return {id:r.id, owner:r.owner, vis:r.visibility, d:r.data || {}, ua:r.updated_at}; }
  function rowRec(r){ return {id:r.id, reg:r.register_id, d:r.data || {}, ca:r.created_at, ua:r.updated_at, ub:r.updated_by}; }
  function check(res){ if(res && res.error) throw res.error; return res; }
  function fail(e){ toast(errText(e)); }
  function findI(arr, id){ for(var i = 0; i < arr.length; i++) if(arr[i].id === id) return i; return -1; }
  api.init = function(){
    sb.auth.onAuthStateChange(function(ev, session){
      api.session = session;
      if(ev === 'PASSWORD_RECOVERY'){ S.recovery = true; notify(); return; }
      if(ev === 'SIGNED_IN' && session && api.uid === session.user.id && api.ready) return;
      if(ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'USER_UPDATED') setTimeout(function(){ api.boot(); }, 0);
    });
    return sb.auth.getSession().then(function(r){ api.session = r.data && r.data.session; return api.boot(); });
  };
  api.boot = function(){
    if(!api.session){ api.me = null; api.uid = null; api.ready = true; teardown(); notify(); return Promise.resolve(); }
    var u = api.session.user; api.uid = u.id;
    return sb.from('profiles').select('*').eq('id', u.id).maybeSingle().then(function(r){
      api.me = r.data ? r.data : {id:u.id, email:u.email, name:(u.user_metadata || {}).name || '', role:'pending'};
      if(!api.me.email) api.me.email = u.email;
      return api.loadAll();
    }).catch(function(e){ api.me = {id:u.id, email:u.email, name:'', role:'pending'}; api.ready = true; notify(); fail(e); });
  };
  function teardown(){ if(channel){ try{ sb.removeChannel(channel); }catch(e){} channel = null; } api.regs = []; api.recs = []; api.audit = []; api.pubs = []; api.fb = []; api.users = []; api.cfg = null; }
  async function pageAll(table, cols, order){
    var out = [], from = 0, size = 1000;
    for(;;){ var r = check(await sb.from(table).select(cols).order(order || 'id').range(from, from + size - 1)); out = out.concat(r.data); if(r.data.length < size) break; from += size; }
    return out;
  }
  api.loadAll = async function(){
    teardown(); api.ready = false; notify();
    var role = api.me.role, internal = ['admin','editor','viewer'].indexOf(role) >= 0;
    try{
      if(internal){
        /* the three things the first screen needs, in parallel; everything else loads after the site is shown */
        var three = await Promise.all([sb.from('app_config').select('id,data'), pageAll('registers', 'id,owner,visibility,data,updated_at'), pageAll('records', 'id,register_id,data,created_at,updated_at,updated_by')]);
        var c = check(three[0]);
        c.data.forEach(function(r){ if(r.id === 'main') api.cfg = r.data; });
        api.regs = three[1].map(rowReg);
        api.recs = three[2].map(rowRec);
        if(!(api.cfg && api.cfg.v2)){
          var tr = c.data.filter(function(r){ return r.id === 'tree'; })[0];
          api.v1 = {cfg:api.cfg, tree: tr && tr.data && tr.data.nodes || null, items: (await pageAll('items', 'id,data')).map(function(r){ return Object.assign({}, r.data, {id:r.id}); })};
        }
      }
      if(role === 'owner'){
        var oo = await Promise.all([sb.from('app_config').select('id,data').eq('id', 'main'), pubList(), sb.from('feedback').select('*').order('created_at')]);
        if(oo[0].data && oo[0].data[0]) api.cfg = oo[0].data[0].data; api.pubs = oo[1]; api.fb = check(oo[2]).data || [];
      }
    }catch(e){ if(/registers|records|audit_log/.test(String(e && e.message)) || e && (e.code === '42P01' || e.code === 'PGRST205')) api.needSchema = true; else fail(e); }
    api.ready = true; subscribe(); notify();
    if(internal && !api.needSchema) loadRest(role);
  };
  /* after the first screen: recent changes (light: no before/after values), publication list (light: no slides or photos),
     Owner comments and, for admins, the user list. A publication's full content is fetched when it is opened. */
  var PUB_COLS = 'id,created_at,kind:data->>kind,no:data->>no,at:data->>at,by:data->>by,note:data->>note,deckId:data->>deckId,deckNo:data->>deckNo,title:data->title,date:data->>date,reg:data->reg,count:data->count,lang:data->>lang,presenter:data->>presenter';
  function pubList(){ return sb.from('publications').select(PUB_COLS).order('created_at', {ascending:false}).then(function(r){ if(r.error) throw r.error; return (r.data || []).map(function(x){ var o = Object.assign({}, x, {_light:true}); delete o.created_at; return o; }); }); }
  api.ensurePubs = function(){ return api._pubsLoaded ? Promise.resolve() : pubList().then(function(list){ var have = {}; api.pubs.forEach(function(x){ have[x.id] = 1; }); api.pubs = api.pubs.concat(list.filter(function(x){ return !have[x.id]; })); api._pubsLoaded = true; }); };
  function loadRest(role){
    var jobs = [sb.from('audit_log').select(AUD_LIGHT).order('id', {ascending:false}).limit(40), pubList(), sb.from('feedback').select('*').order('created_at')];
    if(role === 'admin') jobs.push(sb.from('profiles').select('*').order('created_at'));
    Promise.all(jobs).then(function(r){
      var seen = {}; api.audit.forEach(function(x){ seen[x.id] = 1; });
      api.audit = api.audit.concat((r[0].data || []).filter(function(x){ return !seen[x.id]; }).map(function(x){ x._light = true; return x; })).sort(function(a, b){ return b.id - a.id; });
      var have = {}; api.pubs.forEach(function(x){ have[x.id] = 1; }); api.pubs = api.pubs.concat(r[1].filter(function(x){ return !have[x.id]; })); api._pubsLoaded = true;
      api.fb = (r[2] && r[2].data) || []; if(r[3]) api.users = r[3].data || [];
      notify();
    }).catch(fail);
  }
  var AUD_LIGHT = 'id,at,actor,actor_name,register_id,record_id,action,keys';
  /* one audit row with its before / after values (undo needs them) */
  api.auditRow = function(id){ return sb.from('audit_log').select('*').eq('id', id).maybeSingle().then(function(r){ if(r.error) throw r.error; return r.data; }); };
  /* one publication in full (slides, data, photos) */
  api.pubFull = function(id){ var p = api.pubs.filter(function(x){ return x.id === id; })[0]; if(p && !p._light) return Promise.resolve(p);
    if(api._pubLoading && api._pubLoading[id]) return api._pubLoading[id]; api._pubLoading = api._pubLoading || {};
    return (api._pubLoading[id] = sb.from('publications').select('id,data').eq('id', id).maybeSingle().then(function(r){ delete api._pubLoading[id]; if(r.error) throw r.error; if(!r.data) return null; var o = Object.assign({}, r.data.data, {id:r.data.id}), i = findI(api.pubs, id); if(i >= 0) api.pubs[i] = o; else api.pubs.unshift(o); notify(); return o; })); };
  function subscribe(){
    channel = sb.channel('ww2-' + Date.now());
    channel.on('postgres_changes', {event:'*', schema:'public', table:'records'}, function(p){
      if(p.eventType === 'DELETE'){ var i0 = findI(api.recs, p.old.id); if(i0 >= 0) api.recs.splice(i0, 1); }
      else { var r = rowRec(p.new), i = findI(api.recs, r.id);
        /* the echo of our own change: the data is already on screen, so no redraw */
        if(i >= 0 && api.recs[i].reg === r.reg && same(api.recs[i].d, r.d)){ api.recs[i].ua = r.ua; api.recs[i].ub = r.ub; return; }
        if(i >= 0) api.recs[i] = r; else api.recs.push(r); }
      notify();
    }).on('postgres_changes', {event:'*', schema:'public', table:'registers'}, function(p){
      if(p.eventType === 'DELETE'){ var i0 = findI(api.regs, p.old.id); if(i0 >= 0) api.regs.splice(i0, 1); api.recs = api.recs.filter(function(x){ return x.reg !== p.old.id; }); }
      else { var r = rowReg(p.new), i = findI(api.regs, r.id); if(i >= 0) api.regs[i] = r; else api.regs.push(r); }
      notify();
    }).on('postgres_changes', {event:'INSERT', schema:'public', table:'audit_log'}, function(p){
      if(!api.audit.some(function(x){ return x.id === p.new.id; })){ api.audit.unshift(p.new); if(api.audit.length > 600) api.audit.length = 600; notifySoft(); }
    }).on('postgres_changes', {event:'*', schema:'public', table:'app_config'}, function(p){
      if(p.eventType !== 'DELETE' && p.new.id === 'main'){ api.cfg = p.new.data; notify(); }
    }).on('postgres_changes', {event:'*', schema:'public', table:'publications'}, function(p){
      if(p.eventType === 'DELETE') api.pubs = api.pubs.filter(function(x){ return x.id !== p.old.id; });
      else { var o = Object.assign({}, p.new.data, {id:p.new.id}), i = findI(api.pubs, o.id); if(i >= 0) api.pubs[i] = o; else api.pubs.unshift(o); }
      notify();
    }).on('postgres_changes', {event:'*', schema:'public', table:'feedback'}, function(p){
      if(p.eventType === 'DELETE') api.fb = api.fb.filter(function(x){ return x.id !== p.old.id; });
      else { var i = findI(api.fb, p.new.id); if(i >= 0) api.fb[i] = p.new; else api.fb.push(p.new); }
      notify();
    }).subscribe(function(status){ api.rt = status === 'SUBSCRIBED' ? 'live' : (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'off' : 'connecting'); notifySoft(); });
  }
  function reloadRec(id){ sb.from('records').select('id,register_id,data,created_at,updated_at,updated_by').eq('id', id).maybeSingle().then(function(r){ var i = findI(api.recs, id); if(r.data){ if(i >= 0) api.recs[i] = rowRec(r.data); else api.recs.push(rowRec(r.data)); } else if(i >= 0) api.recs.splice(i, 1); notify(); }); }
  function reloadReg(id){ sb.from('registers').select('id,owner,visibility,data,updated_at').eq('id', id).maybeSingle().then(function(r){ var i = findI(api.regs, id); if(r.data){ if(i >= 0) api.regs[i] = rowReg(r.data); } else if(i >= 0) api.regs.splice(i, 1); notify(); }); }
  api.saveCfg = function(p){ api.cfg = Object.assign({}, api.cfg || {}, clone(p)); notify(); return sb.rpc('config_patch', {p_id:'main', p_patch:p}).then(function(r){ if(r.error) throw r.error; }); };
  api.createReg = function(r){
    api.regs.push({id:r.id, owner:api.uid, vis:r.vis || 'team', d:clone(r.d)}); notify();
    return sb.from('registers').insert({id:r.id, visibility:r.vis || 'team', data:r.d}).then(function(x){ if(x.error) throw x.error; }).catch(function(e){ var i = findI(api.regs, r.id); if(i >= 0) api.regs.splice(i, 1); notify(); throw e; });
  };
  api.restoreReg = api.createReg;
  api.patchReg = function(id, p){ var i = findI(api.regs, id); if(i >= 0) Object.assign(api.regs[i].d, clone(p)); notify(); return sb.rpc('register_patch', {p_id:id, p_patch:p}).then(function(r){ if(r.error) throw r.error; }).catch(function(e){ reloadReg(id); throw e; }); };
  api.setRegVis = function(id, vis){ var i = findI(api.regs, id); if(i >= 0) api.regs[i].vis = vis; notify(); return sb.from('registers').update({visibility:vis}).eq('id', id).select('id').then(function(r){ if(r.error) throw r.error; if(!r.data || !r.data.length) throw new Error('permission'); }).catch(function(e){ reloadReg(id); throw e; }); };
  api.deleteReg = function(id){ var i = findI(api.regs, id); var keep = i >= 0 ? api.regs[i] : null; if(i >= 0) api.regs.splice(i, 1); var kr = api.recs.filter(function(x){ return x.reg === id; }); api.recs = api.recs.filter(function(x){ return x.reg !== id; }); notify();
    return sb.from('registers').delete().eq('id', id).select('id').then(function(r){ if(r.error) throw r.error; if(!r.data || !r.data.length) throw new Error('permission'); }).catch(function(e){ if(keep){ api.regs.push(keep); api.recs = api.recs.concat(kr); notify(); } throw e; }); };
  api.createRec = function(r){
    api.recs.push({id:r.id, reg:r.reg, d:clone(r.d), ca:new Date().toISOString(), ua:new Date().toISOString()}); notify();
    return sb.from('records').insert({id:r.id, register_id:r.reg, data:r.d}).then(function(x){ if(x.error) throw x.error; }).catch(function(e){ var i = findI(api.recs, r.id); if(i >= 0) api.recs.splice(i, 1); notify(); throw e; });
  };
  api.createRecs = async function(arr, onProgress){
    var ok = 0, failed = 0;
    for(var i = 0; i < arr.length; i += 200){
      var chunk = arr.slice(i, i + 200);
      var r = await sb.from('records').insert(chunk.map(function(x){ return {id:x.id, register_id:x.reg, data:x.d}; }));
      if(r.error){ failed += chunk.length; } else { ok += chunk.length; chunk.forEach(function(x){ if(findI(api.recs, x.id) < 0) api.recs.push({id:x.id, reg:x.reg, d:clone(x.d), ca:new Date().toISOString(), ua:new Date().toISOString()}); }); }
      if(onProgress) onProgress(Math.min(arr.length, i + 200), arr.length);
    }
    notify(); return {ok:ok, failed:failed};
  };
  api.patchRec = function(id, p){
    var i = findI(api.recs, id); if(i >= 0){ Object.assign(api.recs[i].d, clone(p)); api.recs[i].ua = new Date().toISOString(); } notify();
    return sb.rpc('record_patch', {p_id:id, p_patch:p}).then(function(r){ if(r.error) throw r.error; }).catch(function(e){ fail(e); reloadRec(id); throw e; });
  };
  api.deleteRec = function(id){ var i = findI(api.recs, id), keep = i >= 0 ? api.recs[i] : null; if(i >= 0) api.recs.splice(i, 1); notify();
    return sb.from('records').delete().eq('id', id).select('id').then(function(r){ if(r.error) throw r.error; if(!r.data || !r.data.length) throw new Error('permission'); }).catch(function(e){ if(keep){ api.recs.push(keep); notify(); } throw e; }); };
  api.restoreRec = function(r){ return findI(api.recs, r.id) >= 0 ? api.patchRec(r.id, r.d) : api.createRec(r); };
  api.loadAudit = function(o){
    o = o || {}; var q = sb.from('audit_log').select(o.light ? AUD_LIGHT : '*').order('id', {ascending:false}).limit(o.limit || 200);
    if(o.reg) q = q.eq('register_id', o.reg); if(o.rec) q = q.eq('record_id', o.rec); if(o.before) q = q.lt('id', o.before); if(o.since) q = q.gte('at', o.since); if(o.action) q = q.eq('action', o.action);
    return q.then(function(r){ if(r.error) throw r.error; return r.data; });
  };
  api.createPub = function(id, data){ return sb.from('publications').insert({id:id, data:data}).then(function(r){ if(r.error) throw r.error; }); };
  api.deletePub = function(id){ return sb.from('publications').delete().eq('id', id).then(function(r){ if(r.error) throw r.error; }); };
  /* public links: rows are read and written by admins / editors only (row-level security); visitors use share_get */
  api.shareList = function(){ return sb.from('shares').select('id,revoked,expires_at,views,last_view,created_at,kind:data->>kind,mode:data->>mode,title:data->title,cfg:data->cfg,snapAt:data->>snapAt').order('created_at', {ascending:false}).then(function(r){ if(r.error) throw r.error; return r.data || []; }); };
  api.shareCreate = function(id, data, exp){ return sb.from('shares').insert({id:id, data:data, expires_at:exp || null}).then(function(r){ if(r.error) throw r.error; if(data.mode === 'snap' && data.kind !== 'deck') return api.shareFreeze(id); }); };
  api.shareFreeze = function(id){ return sb.rpc('share_freeze', {p_id:id}).then(function(r){ if(r.error) throw r.error; }); };
  api.shareSetCfg = function(id, c){ return sb.from('shares').select('data').eq('id', id).single().then(function(r){ if(r.error) throw r.error; var d = Object.assign({}, r.data.data, {cfg:c}); return sb.from('shares').update({data:d, updated_at:new Date().toISOString()}).eq('id', id); }).then(function(r){ if(r && r.error) throw r.error; }); };
  api.shareSetSnap = function(id, snap){ return sb.from('shares').select('data').eq('id', id).single().then(function(r){ if(r.error) throw r.error; var d = Object.assign({}, r.data.data, {snap:snap, snapAt:new Date().toISOString()}); return sb.from('shares').update({data:d, updated_at:new Date().toISOString()}).eq('id', id); }).then(function(r){ if(r && r.error) throw r.error; }); };
  api.shareUpdate = function(id, p){ return sb.from('shares').update(Object.assign({updated_at:new Date().toISOString()}, p)).eq('id', id).then(function(r){ if(r.error) throw r.error; }); };
  api.shareDelete = function(id){ return sb.from('shares').delete().eq('id', id).then(function(r){ if(r.error) throw r.error; }); };
  api.addFeedback = function(o){ return sb.from('feedback').insert(Object.assign({}, o, {author_name: api.me.name || api.me.email})).select().single().then(function(r){ if(r.error) throw r.error; if(r.data && findI(api.fb, r.data.id) < 0) api.fb.push(r.data); notify(); }); };
  api.updateFeedback = function(id, p){ return sb.from('feedback').update(p).eq('id', id).then(function(r){ if(r.error) throw r.error; }); };
  api.setRole = function(id, role){ return sb.from('profiles').update({role:role}).eq('id', id).then(function(r){ if(r.error) throw r.error; api.users.forEach(function(u){ if(u.id === id) u.role = role; }); notify(); }); };
  api.reloadUsers = function(){ return sb.from('profiles').select('*').order('created_at').then(function(r){ api.users = r.data || []; notify(); }); };
  api.upload = function(file, regId, recId){
    var safe = String(file.name || 'file').replace(/[^\w.\-]+/g, '_').slice(-80);
    var path = 'r/' + regId + '/' + (recId || 'misc') + '/' + Date.now().toString(36) + '_' + safe;
    return sb.storage.from('files').upload(path, file, {contentType: file.type || undefined, upsert:false}).then(function(r){ if(r.error) throw r.error; return {path:path, name:file.name, type:file.type || '', size:file.size}; });
  };
  api.removeFile = function(path){ return sb.storage.from('files').remove([path]).then(function(){}); };
  api.fileUrl = function(path){
    var c = urls[path]; if(c && c.exp > Date.now()) return c.url;
    pendingUrls[path] = 1;
    if(!urlTimer) urlTimer = setTimeout(function(){
      var paths = Object.keys(pendingUrls); pendingUrls = {}; urlTimer = null;
      sb.storage.from('files').createSignedUrls(paths, 3600).then(function(r){ (r.data || []).forEach(function(x){ if(x.signedUrl) urls[x.path] = {url:x.signedUrl, exp:Date.now() + 3300e3}; }); notifySoft(); });
    }, 30);
    return null;
  };
  api.signUrls = function(paths){
    var need = (paths || []).filter(function(p, i, a){ var c = urls[p]; return p && a.indexOf(p) === i && !(c && c.exp > Date.now() + 60e3); });
    if(!need.length) return Promise.resolve();
    return sb.storage.from('files').createSignedUrls(need, 3600).then(function(r){ (r.data || []).forEach(function(x){ if(x.signedUrl) urls[x.path] = {url:x.signedUrl, exp:Date.now() + 3300e3}; }); }).catch(function(){});
  };
  api.signIn = function(email, pw){ return sb.auth.signInWithPassword({email:email, password:pw}); };
  api.signUp = function(email, pw, name){ return sb.auth.signUp({email:email, password:pw, options:{data:{name:name}, emailRedirectTo: location.origin + location.pathname}}); };
  api.reset = function(email){ return sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname}); };
  api.setPassword = function(pw){ return sb.auth.updateUser({password:pw}); };
  api.signOut = function(){ return sb.auth.signOut(); };
  return api;
}
