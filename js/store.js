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
  if(!st || !st.v2 || (st.v || 0) < 5){ st = buildDemo(); LS.set(KEY, st); }
  (st.regs || []).forEach(function(r){ cleanFields(r.d); });
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
    patchRecs: function(list){ var sv = api.save; api.save = function(){}; try{ list.forEach(function(x){ api.patchRec(x.id, x.patch); }); } finally{ api.save = sv; } api.save(); return Promise.resolve({ok:list.length, failed:0}); },
    deleteRec: function(id){ var r = rec(id); if(!r) return Promise.resolve(); st.recs = st.recs.filter(function(x){ return x.id !== id; }); log({register_id:r.reg, record_id:id, action:'delete', old:clone(r.d)}); api.save(); return Promise.resolve(); },
    restoreRec: function(r){ var ex = rec(r.id); if(ex) return api.patchRec(r.id, r.d); return api.createRec(r); },
    ensurePubs: function(){ return Promise.resolve(); },
    auditRow: function(id){ return Promise.resolve(st.audit.filter(function(a){ return a.id === id; })[0] || null); },
    pubFull: function(id){ return Promise.resolve(st.pubs.filter(function(x){ return x.id === id; })[0] || null); },
    loadAudit: function(o){ o = o || {}; var rows = st.audit.filter(function(a){ return (!o.reg || a.register_id === o.reg) && (!o.rec || a.record_id === o.rec) && (!o.before || a.id < o.before) && (!o.since || a.at >= o.since); }); return Promise.resolve(rows.slice(0, o.limit || 200)); },
    createPub: function(id, data){ st.pubs.unshift(Object.assign({id:id}, clone(data))); api.save(); return Promise.resolve(id); },
    deletePub: function(id){ st.pubs = st.pubs.filter(function(x){ return x.id !== id; }); api.save(); return Promise.resolve(); },
    /* public links (the demo keeps them in this browser and builds the public copy the way the database does) */
    shareList: function(){ return Promise.resolve((st.shares || []).map(function(x){ var d = x.data || {}; return {id:x.id, revoked:!!x.revoked, expires_at:x.expires_at || null, views:x.views || 0, last_view:x.last_view || null, created_at:x.created_at, kind:d.kind, mode:d.mode, title:d.title, cfg:d.cfg, snapAt:d.snapAt || null, v:d.v || null}; })); },
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
    addFeedback: function(o){ var f = Object.assign({id:uid('f'), status:'open', created_at:new Date().toISOString(), author:'demo', author_name:'Demo'}, o); st.fb.push(f); api.save();
      return o.kind === 'response' && typeof trnApplyResponse === 'function' ? trnApplyResponse(f) : Promise.resolve(); },   // the demo does what the database trigger does (v3.1)
    updateFeedback: function(id, p){ st.fb.forEach(function(f){ if(f.id === id) Object.assign(f, p); }); api.save(); return Promise.resolve(); },
    resetDemo: function(){ LS.del(KEY); location.reload(); },
    upload: function(file){ var id = 'demo:' + uid('b'); blobs[id] = URL.createObjectURL(file); return Promise.resolve({path:id, name:file.name, type:file.type || '', size:file.size}); },
    fileUrl: function(path){ return blobs[path] || null; },
    signUrls: function(){ return Promise.resolve(); },
    removeFile: function(){ return Promise.resolve(); }
  };
  /* v3.3 · personal settings (in the demo: this browser) */
  api.prefs = LS.get('ww3.prefs.demo', {}) || {};
  api.savePrefs = function(p){ prefsMergeInto(api.prefs, p); LS.set('ww3.prefs.demo', api.prefs); notify(); return Promise.resolve(); };
  return api;
}
/* a top-level merge of settings; a key set to null is removed (the same as prefs_merge in schema.sql) */
function prefsMergeInto(o, p){ Object.keys(p || {}).forEach(function(k){ if(p[k] == null) delete o[k]; else o[k] = clone(p[k]); }); return o; }

/* ---------------- cloud: Supabase ---------------- */
function CloudStore(url, key){
  var sb = window.supabase.createClient(url, key, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}});
  var urls = {}, pendingUrls = {}, urlTimer = null, channel = null;
  var api = {mode:'cloud', sb:sb, ready:false, rt:'connecting', session:null, me:null, cfg:null, regs:[], recs:[], audit:[], pubs:[], fb:[], users:[], v1:null, prefs:{}, prefsLocal:false};
  function rowReg(r){ return {id:r.id, owner:r.owner, vis:r.visibility, d:cleanFields(r.data || {}), ua:r.updated_at}; }
  function rowRec(r){ return {id:r.id, reg:r.register_id, d:r.data || {}, ca:r.created_at, ua:r.updated_at, ub:r.updated_by}; }
  function check(res){ if(res && res.error) throw res.error; return res; }
  function fail(e){ toast(errText(e)); }
  function findI(arr, id){ for(var i = 0; i < arr.length; i++) if(arr[i].id === id) return i; return -1; }
  api.init = function(){
    sb.auth.onAuthStateChange(function(ev, session){
      api.session = session;
      if(ev === 'PASSWORD_RECOVERY'){ S.recovery = true; notify(); return; }
      if(ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'USER_UPDATED') setTimeout(function(){ api.boot(ev === 'USER_UPDATED'); }, 0);
    });
    /* back from sleep, a lost connection or a hidden tab: fetch what changed meanwhile */
    var hiddenAt = 0;
    document.addEventListener('visibilitychange', function(){ if(document.hidden) hiddenAt = Date.now(); else if(hiddenAt && Date.now() - hiddenAt > 30000) api.catchUp(); });
    window.addEventListener('online', function(){ if(api.rt === 'off' && api._rtPrev) api.rt = api._rtPrev; notifySoft(); api.catchUp(); });
    window.addEventListener('offline', function(){ if(api.rt !== 'off') api._rtPrev = api.rt; api.rt = 'off'; notifySoft(); toast(T('You are offline — changes made now may not be saved', '已离线：现在的修改可能无法保存')); });
    return sb.auth.getSession().then(function(r){ api.session = r.data && r.data.session; return api.boot(); });
  };
  /* one start per signed-in user: the session is announced both by getSession and by a SIGNED_IN event */
  api.boot = function(force){
    if(!api.session){ api.me = null; api.uid = null; api._bootUid = null; api._bootP = null; api.ready = true; teardown(); notify(); return Promise.resolve(); }
    var u = api.session.user;
    if(!force && api._bootUid === u.id && api._bootP) return api._bootP;
    api.uid = u.id; api._bootUid = u.id;
    return api._bootP = sb.from('profiles').select('*').eq('id', u.id).maybeSingle().then(function(r){
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
        var prefsP = loadPrefs();
        var three = await Promise.all([sb.from('app_config').select('id,data'), pageAll('registers', 'id,owner,visibility,data,updated_at'), pageAll('records', 'id,register_id,data,created_at,updated_at,updated_by')]);
        await prefsP;
        var c = check(three[0]);
        c.data.forEach(function(r){ if(r.id === 'main') api.cfg = r.data; });
        api.regs = three[1].map(rowReg);
        api.recs = three[2].map(rowRec);
        api._sync = null; three[1].concat(three[2]).forEach(function(x){ seenAt(x.updated_at); });
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
  var PUB_COLS = 'id,created_at,kind:data->>kind,no:data->>no,at:data->>at,by:data->>by,note:data->>note,deckId:data->>deckId,deckNo:data->>deckNo,title:data->title,date:data->>date,reg:data->reg,count:data->count,lang:data->>lang,presenter:data->>presenter,trnNo:data->>trnNo,trnId:data->>trnId';
  function pubList(){ return sb.from('publications').select(PUB_COLS).order('created_at', {ascending:false}).then(function(r){ if(r.error) throw r.error; return (r.data || []).map(function(x){ var o = Object.assign({}, x, {_light:true}); delete o.created_at; return o; }); }); }
  api.ensurePubs = function(){ return api._pubsLoaded ? Promise.resolve() : pubList().then(function(list){ var have = {}; api.pubs.forEach(function(x){ have[x.id] = 1; }); api.pubs = api.pubs.concat(list.filter(function(x){ return !have[x.id]; })); api._pubsLoaded = true; }); };
  function loadRest(role){
    var jobs = [sb.from('audit_log').select(AUD_LIGHT).order('id', {ascending:false}).limit(40), pubList(), sb.from('feedback').select('*').order('created_at')];
    if(role === 'admin') jobs.push(usersQuery());
    Promise.all(jobs).then(function(r){
      var seen = {}; api.audit.forEach(function(x){ seen[x.id] = 1; });
      api.audit = api.audit.concat((r[0].data || []).filter(function(x){ return !seen[x.id]; }).map(function(x){ x._light = true; return x; })).sort(function(a, b){ return b.id - a.id; });
      var have = {}; api.pubs.forEach(function(x){ have[x.id] = 1; }); api.pubs = api.pubs.concat(r[1].filter(function(x){ return !have[x.id]; })); api._pubsLoaded = true;
      api.fb = (r[2] && r[2].data) || []; if(r[3]) api.users = r[3].data || [];
      api.audit.forEach(function(x){ if(x.id > (api._auditMax || 0)) api._auditMax = x.id; });
      notify();
    }).catch(fail);
    /* the daily backup when the database has no scheduler (v2.9): made by the first admin or editor who opens the site */
    if(role === 'admin' || role === 'editor') sb.rpc('backup_if_due').then(function(){}, function(){});
  }
  function seenAt(ts){ if(ts && (!api._sync || ts > api._sync)) api._sync = ts; }
  /* what changed while this page was asleep or offline: rows updated since the newest one seen, deletions from the change log */
  api.catchUp = function(){
    var internal = api.me && ['admin','editor','viewer'].indexOf(api.me.role) >= 0;
    if(!api.ready || !api.session || !internal || api.needSchema || api._catching || !api._sync) return Promise.resolve();
    api._catching = true; var since = api._sync;
    var jobs = [sb.from('registers').select('id,owner,visibility,data,updated_at').gt('updated_at', since),
      sb.from('records').select('id,register_id,data,created_at,updated_at,updated_by').gt('updated_at', since).order('updated_at').limit(5000),
      sb.from('app_config').select('id,data').eq('id', 'main')];
    if(api._auditMax) jobs.push(sb.from('audit_log').select('id,at,action,record_id,register_id').gt('id', api._auditMax).in('action', ['delete', 'reg_delete']).order('id').limit(5000));
    return Promise.all(jobs).then(function(r){
      var ch = 0, fresh = {};
      if(!r[0].error) (r[0].data || []).forEach(function(x){ var o = rowReg(x), i = findI(api.regs, o.id); if(i >= 0) api.regs[i] = o; else api.regs.push(o); seenAt(x.updated_at); ch++; });
      if(!r[1].error) (r[1].data || []).forEach(function(x){ var o = rowRec(x), i = findI(api.recs, o.id); fresh[o.id] = 1; seenAt(x.updated_at);
        if(i >= 0 && api.recs[i].reg === o.reg && sameData(api.recs[i].d, o.d)){ api.recs[i].ua = o.ua; return; }
        if(i >= 0) api.recs[i] = o; else api.recs.push(o); ch++; });
      if(!r[2].error && r[2].data && r[2].data[0] && !sameData(api.cfg, r[2].data[0].data)){ api.cfg = r[2].data[0].data; ch++; }
      if(r[3] && !r[3].error) (r[3].data || []).forEach(function(a){
        if(a.action === 'delete' && !fresh[a.record_id]){ var i = findI(api.recs, a.record_id); if(i >= 0){ api.recs.splice(i, 1); ch++; } }
        if(a.action === 'reg_delete' && !api.regs.some(function(g){ return g.id === a.register_id && g.ua > a.at; })){ var j = findI(api.regs, a.register_id); if(j >= 0){ api.regs.splice(j, 1); api.recs = api.recs.filter(function(x){ return x.reg !== a.register_id; }); ch++; } }
        if(a.id > api._auditMax) api._auditMax = a.id; });
      if(ch) notify();
    }).catch(function(){}).then(function(){ api._catching = false; });
  };
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
      else { var r = rowRec(p.new), i = findI(api.recs, r.id); seenAt(p.new.updated_at);
        /* the echo of our own change: the data is already on screen, so no redraw */
        if(i >= 0 && api.recs[i].reg === r.reg && sameData(api.recs[i].d, r.d)){ api.recs[i].ua = r.ua; api.recs[i].ub = r.ub; return; }
        if(i >= 0) api.recs[i] = r; else api.recs.push(r); }
      notifyRemote();
    }).on('postgres_changes', {event:'*', schema:'public', table:'registers'}, function(p){
      if(p.eventType === 'DELETE'){ var i0 = findI(api.regs, p.old.id); if(i0 >= 0) api.regs.splice(i0, 1); api.recs = api.recs.filter(function(x){ return x.reg !== p.old.id; }); }
      else { var r = rowReg(p.new), i = findI(api.regs, r.id); seenAt(p.new.updated_at);
        if(i >= 0 && api.regs[i].vis === r.vis && sameData(api.regs[i].d, r.d)){ api.regs[i].ua = r.ua; return; }   /* the echo of our own change */
        if(i >= 0) api.regs[i] = r; else api.regs.push(r); }
      notifyRemote();
    }).on('postgres_changes', {event:'INSERT', schema:'public', table:'audit_log'}, function(p){
      if(p.new.id > (api._auditMax || 0)) api._auditMax = p.new.id;
      if(!api.audit.some(function(x){ return x.id === p.new.id; })){ api.audit.unshift(p.new); if(api.audit.length > 600) api.audit.length = 600; notifyRemote(true); }
    }).on('postgres_changes', {event:'*', schema:'public', table:'app_config'}, function(p){
      if(p.eventType !== 'DELETE' && p.new.id === 'main'){ api.cfg = p.new.data; notifyRemote(); }
    }).on('postgres_changes', {event:'*', schema:'public', table:'publications'}, function(p){
      if(p.eventType === 'DELETE') api.pubs = api.pubs.filter(function(x){ return x.id !== p.old.id; });
      else { var o = Object.assign({}, p.new.data, {id:p.new.id}), i = findI(api.pubs, o.id); if(i >= 0) api.pubs[i] = o; else api.pubs.unshift(o); }
      notifyRemote();
    }).on('postgres_changes', {event:'*', schema:'public', table:'feedback'}, function(p){
      if(p.eventType === 'DELETE') api.fb = api.fb.filter(function(x){ return x.id !== p.old.id; });
      else { var i = findI(api.fb, p.new.id); if(i >= 0) api.fb[i] = p.new; else api.fb.push(p.new); }
      notifyRemote();
    }).subscribe(function(status){ api.rt = status === 'SUBSCRIBED' ? 'live' : (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'off' : 'connecting');
      if(status === 'SUBSCRIBED'){ if(api._wasDown) api.catchUp(); api._wasDown = false; } else if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') api._wasDown = true;
      notifySoft(); });
  }
  /* after a failed write: show what the server has. A failed read (no connection) changes nothing */
  function reloadRec(id){ sb.from('records').select('id,register_id,data,created_at,updated_at,updated_by').eq('id', id).maybeSingle().then(function(r){ if(r.error) return; var i = findI(api.recs, id); if(r.data){ if(i >= 0) api.recs[i] = rowRec(r.data); else api.recs.push(rowRec(r.data)); } else if(i >= 0) api.recs.splice(i, 1); notify(); }); }
  function reloadReg(id){ sb.from('registers').select('id,owner,visibility,data,updated_at').eq('id', id).maybeSingle().then(function(r){ if(r.error) return; var i = findI(api.regs, id); if(r.data){ if(i >= 0) api.regs[i] = rowReg(r.data); } else if(i >= 0) api.regs.splice(i, 1); notify(); }); }
  api.saveCfg = function(p){ var prev = api.cfg, ops = patchOps(prev || {}, p); api.cfg = Object.assign({}, api.cfg || {}, clone(p)); notify();
    if(!ops.length) return Promise.resolve();
    return opsCall('config_ops', 'config_patch', 'main', ops, p).then(function(r){ if(r.error) throw r.error; })
      .catch(function(e){ api.cfg = prev; notify(); failSave(e); throw e; }); };
  /* v3.3 · personal settings follow the account (user_prefs). Until schema.sql is updated they stay in this browser. */
  function prefsKey(){ return 'ww3.prefs.' + (api.uid || 'x'); }
  function loadPrefs(){
    api.prefs = {}; api.prefsLocal = false;
    return sb.from('user_prefs').select('data').eq('user_id', api.uid).maybeSingle().then(function(r){
      if(r.error) throw r.error; api.prefs = (r.data && r.data.data) || {}; LS.set(prefsKey(), api.prefs);
    }).catch(function(e){
      /* no table yet → this browser; any other failure (offline) → the last copy seen here, and saving keeps trying the server */
      if(e && (e.code === '42P01' || e.code === 'PGRST205' || /user_prefs/.test(e.message || ''))) api.prefsLocal = true;
      api.prefs = LS.get(prefsKey(), {}) || {};
    });
  }
  api.savePrefs = function(p){
    prefsMergeInto(api.prefs, p); LS.set(prefsKey(), api.prefs); notify();
    if(api.prefsLocal) return Promise.resolve();
    return sb.rpc('prefs_merge', {p:p}).then(function(r){
      if(r.error && noFn(r.error)){ api.prefsLocal = true; notifySoft(); return; }
      if(r.error) throw r.error;
    }).catch(function(e){ fail(e); });
  };
  /* element-level writes (v2.9): only what changed is sent, and the database applies it to what it holds now.
     Until schema.sql is updated the older whole-value patch is used. */
  function noFn(e){ return !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message || '')); }
  function opsCall(fn, oldFn, id, ops, p){
    if(ops && !api._noOps) return sb.rpc(fn, {p_id:id, p_ops:ops}).then(function(r){ if(r.error && noFn(r.error)){ api._noOps = true; return opsCall(fn, oldFn, id, null, p); } return r; });
    return sb.rpc(oldFn, {p_id:id, p_patch:p});
  }
  function applyLocal(d, p){ Object.keys(p).forEach(function(k){ if(p[k] === undefined) delete d[k]; else d[k] = clone(p[k]); }); }
  var pend = {};   /* writes still on their way, per record: the server's copy is taken only when the last one returns */
  /* the values a patch replaces, to put back if the server refuses it */
  function before(d, p){ var o = {}; Object.keys(p).forEach(function(k){ o[k] = d[k] === undefined ? undefined : clone(d[k]); }); return o; }
  function putBack(d, o){ Object.keys(o).forEach(function(k){ if(o[k] === undefined) delete d[k]; else d[k] = o[k]; }); }
  function failSave(e){ var lg = S.lang, en, zh; try{ S.lang = 'en'; en = errText(e); S.lang = 'zh'; zh = errText(e); } finally{ S.lang = lg; }
    toast(/not saved|could not save/i.test(en) ? T(en, zh) : T('Not saved — ' + en, '未保存：' + zh)); }
  api.createReg = function(r){
    api.regs.push({id:r.id, owner:api.uid, vis:r.vis || 'team', d:clone(r.d)}); notify();
    return sb.from('registers').insert({id:r.id, visibility:r.vis || 'team', data:r.d}).then(function(x){ if(x.error) throw x.error; }).catch(function(e){ var i = findI(api.regs, r.id); if(i >= 0) api.regs.splice(i, 1); notify(); throw e; });
  };
  api.restoreReg = api.createReg;
  api.patchReg = function(id, p){ var i = findI(api.regs, id), old = i >= 0 ? before(api.regs[i].d, p) : {}, ops = i >= 0 ? patchOps(api.regs[i].d, p) : null, pk = 'reg:' + id;
    if(i >= 0) applyLocal(api.regs[i].d, p); notify();
    if(ops && !ops.length) return Promise.resolve();
    pend[pk] = (pend[pk] || 0) + 1;
    function done(){ var last = pend[pk] === 1; if(!--pend[pk]) delete pend[pk]; return last; }
    return opsCall('register_ops', 'register_patch', id, ops, p).then(function(r){ var last = done(); if(r.error) throw r.error;
        if(last && r.data && typeof r.data === 'object'){ var j = findI(api.regs, id); if(j >= 0 && !sameData(api.regs[j].d, r.data)){ api.regs[j].d = cleanFields(r.data); notifyRemote(); } } },
      function(e){ done(); throw e; })
      .catch(function(e){ var j = findI(api.regs, id); if(j >= 0){ putBack(api.regs[j].d, old); notify(); } reloadReg(id); throw e; }); };
  api.setRegVis = function(id, vis){ var i = findI(api.regs, id); if(i >= 0) api.regs[i].vis = vis; notify(); return sb.from('registers').update({visibility:vis}).eq('id', id).select('id').then(function(r){ if(r.error) throw r.error; if(!r.data || !r.data.length) throw new Error('permission'); }).catch(function(e){ reloadReg(id); throw e; }); };
  api.deleteReg = function(id){ var i = findI(api.regs, id); var keep = i >= 0 ? api.regs[i] : null; if(i >= 0) api.regs.splice(i, 1); var kr = api.recs.filter(function(x){ return x.reg === id; }); api.recs = api.recs.filter(function(x){ return x.reg !== id; }); notify();
    return sb.from('registers').delete().eq('id', id).select('id').then(function(r){ if(r.error) throw r.error; if(!r.data || !r.data.length) throw new Error('permission'); }).catch(function(e){ if(keep){ api.regs.push(keep); api.recs = api.recs.concat(kr); notify(); } throw e; }); };
  /* the database may give a new item the next free number (someone else took that one meanwhile): take what it stored */
  function takeServer(sent, row){
    if(!row || !row.data) return null; var i = findI(api.recs, row.id); if(i < 0) return null; var ch = null;
    Object.keys(row.data).forEach(function(k){ if(!sameData(sent[k], row.data[k])){ api.recs[i].d[k] = clone(row.data[k]); ch = {key:k, from:sent[k], to:row.data[k]}; } });
    return ch;
  }
  api.createRec = function(r){
    api.recs.push({id:r.id, reg:r.reg, d:clone(r.d), ca:new Date().toISOString(), ua:new Date().toISOString()}); notify();
    return sb.from('records').insert({id:r.id, register_id:r.reg, data:r.d}).select('id,data').then(function(x){ if(x.error) throw x.error;
        var ch = takeServer(r.d, x.data && x.data[0]);
        if(ch){ notify(); if(typeof ch.to === 'string') toast(T(String(ch.from) + ' was already used — this item is ' + ch.to, String(ch.from) + ' 已被使用，此项编号为 ' + ch.to)); } })
      .catch(function(e){ var i = findI(api.recs, r.id); if(i >= 0) api.recs.splice(i, 1); notify(); throw e; });
  };
  /* many new records (import, templates): shown at once, written 200 per request */
  api.createRecs = async function(arr, onProgress){
    var ok = 0, failed = 0, renumbered = 0, now = new Date().toISOString(), mine = {};
    arr.forEach(function(x){ if(findI(api.recs, x.id) < 0){ mine[x.id] = 1; api.recs.push({id:x.id, reg:x.reg, d:clone(x.d), ca:now, ua:now}); } }); notify();
    for(var i = 0; i < arr.length; i += 200){
      var chunk = arr.slice(i, i + 200), r = await sb.from('records').insert(chunk.map(function(x){ return {id:x.id, register_id:x.reg, data:x.d}; })).select('id,data');
      if(r.error){ failed += chunk.length; var gone = {}; chunk.forEach(function(x){ if(mine[x.id]) gone[x.id] = 1; }); api.recs = api.recs.filter(function(x){ return !gone[x.id]; }); }
      else { ok += chunk.length; var byId = {}; chunk.forEach(function(x){ byId[x.id] = x; }); (r.data || []).forEach(function(row){ if(byId[row.id] && takeServer(byId[row.id].d, row)) renumbered++; }); }
      if(onProgress) onProgress(Math.min(arr.length, i + 200), arr.length);
    }
    notify(); return {ok:ok, failed:failed, renumbered:renumbered};
  };
  /* base (optional): the values the change starts from, when that is not what this page shows now (undo: what I had set) */
  api.patchRec = function(id, p, base){
    var i = findI(api.recs, id), old = i >= 0 ? before(api.recs[i].d, p) : {}, ops = i >= 0 ? patchOps(base || api.recs[i].d, p) : null;
    if(i >= 0){ applyLocal(api.recs[i].d, p); api.recs[i].ua = new Date().toISOString(); } notify();
    if(ops && !ops.length) return Promise.resolve();
    pend[id] = (pend[id] || 0) + 1;
    function done(){ var last = pend[id] === 1; if(!--pend[id]) delete pend[id]; return last; }
    return opsCall('record_ops', 'record_patch', id, ops, p).then(function(r){ var last = done(); if(r.error) throw r.error;
        /* what the database now holds (it may include what others changed meanwhile) */
        if(last && r.data && typeof r.data === 'object'){ var j = findI(api.recs, id); if(j >= 0 && !sameData(api.recs[j].d, r.data)){ api.recs[j].d = r.data; notifyRemote(); } } },
      function(e){ done(); throw e; })
      .catch(function(e){ var j = findI(api.recs, id); if(j >= 0){ putBack(api.recs[j].d, old); notify(); } failSave(e); reloadRec(id); throw e; });
  };
  /* the same change to many records (bulk edit, renaming a person, import updates): one request per 200 records */
  api.patchRecs = async function(list, onProgress){
    var items = [], olds = {}, now = new Date().toISOString();
    list.forEach(function(x){ var i = findI(api.recs, x.id); if(i < 0) return; var ops = patchOps(api.recs[i].d, x.patch); if(!ops.length) return;
      olds[x.id] = before(api.recs[i].d, x.patch); applyLocal(api.recs[i].d, x.patch); api.recs[i].ua = now; items.push({id:x.id, ops:ops, patch:x.patch}); });
    notify();
    var ok = 0, failed = [], err = null;
    for(var s = 0; s < items.length; s += 200){
      var chunk = items.slice(s, s + 200), r = null;
      if(!api._noOps){ r = await sb.rpc('records_ops', {p_items:chunk.map(function(x){ return {id:x.id, ops:x.ops}; })}); if(r.error && noFn(r.error)){ api._noOps = true; r = null; } }
      if(!r){ var res = await Promise.all(chunk.map(function(x){ return sb.rpc('record_patch', {p_id:x.id, p_patch:x.patch}).then(function(y){ if(y.error){ err = err || y.error; return x.id; } return null; }, function(e){ err = err || e; return x.id; }); }));
        res.forEach(function(id){ if(id) failed.push(id); else ok++; }); }
      else if(r.error){ err = err || r.error; chunk.forEach(function(x){ failed.push(x.id); }); }
      else { var bad = {}; (r.data || []).forEach(function(e){ if(e && e.error) bad[e.id] = 1; }); chunk.forEach(function(x){ if(bad[x.id]) failed.push(x.id); else ok++; }); }
      if(onProgress) onProgress(Math.min(items.length, s + 200), items.length);
    }
    if(failed.length){ failed.forEach(function(id){ var j = findI(api.recs, id); if(j >= 0) putBack(api.recs[j].d, olds[id]); }); notify(); failSave(err || {message:'permission'}); }
    return {ok:ok, failed:failed.length};
  };
  api.deleteRec = function(id){ var i = findI(api.recs, id), keep = i >= 0 ? api.recs[i] : null; if(i >= 0) api.recs.splice(i, 1); notify();
    return sb.from('records').delete().eq('id', id).select('id').then(function(r){ if(r.error) throw r.error; if(!r.data || !r.data.length) throw new Error('permission'); }).catch(function(e){ if(keep){ api.recs.push(keep); notify(); } throw e; }); };
  api.restoreRec = function(r){ return findI(api.recs, r.id) >= 0 ? api.patchRec(r.id, r.d) : api.createRec(r); };
  api.loadAudit = function(o){
    o = o || {}; var q = sb.from('audit_log').select(o.light ? AUD_LIGHT : '*').order('id', {ascending:false}).limit(o.limit || 200);
    if(o.reg) q = q.eq('register_id', o.reg); if(o.rec) q = q.eq('record_id', o.rec); if(o.before) q = q.lt('id', o.before); if(o.since) q = q.gte('at', o.since); if(o.action) q = q.eq('action', o.action);
    return q.then(function(r){ if(r.error) throw r.error; return r.data; });
  };
  api.createPub = function(id, data){ return sb.from('publications').insert({id:id, data:data}).select('id').then(function(r){ if(r.error) throw r.error; var nid = (r.data && r.data[0] && r.data[0].id) || id; return nid; }); };
  api.deletePub = function(id){ return sb.from('publications').delete().eq('id', id).then(function(r){ if(r.error) throw r.error; }); };
  /* public links: rows are read and written by admins / editors only (row-level security); visitors use share_get */
  api.shareList = function(){ return sb.from('shares').select('id,revoked,expires_at,views,last_view,created_at,kind:data->>kind,mode:data->>mode,title:data->title,cfg:data->cfg,snapAt:data->>snapAt,v:data->v').order('created_at', {ascending:false}).then(function(r){ if(r.error) throw r.error; return r.data || []; }); };
  api.shareCreate = function(id, data, exp){ return sb.from('shares').insert({id:id, data:data, expires_at:exp || null}).then(function(r){ if(r.error) throw r.error; if(data.mode === 'snap' && data.kind !== 'deck') return api.shareFreeze(id); }); };
  api.shareFreeze = function(id){ return sb.rpc('share_freeze', {p_id:id}).then(function(r){ if(r.error) throw r.error; }); };
  api.shareSetCfg = function(id, c){ return sb.from('shares').select('data').eq('id', id).single().then(function(r){ if(r.error) throw r.error; var d = Object.assign({}, r.data.data, {cfg:c}); return sb.from('shares').update({data:d, updated_at:new Date().toISOString()}).eq('id', id); }).then(function(r){ if(r && r.error) throw r.error; }); };
  api.shareSetSnap = function(id, snap){ return sb.from('shares').select('data').eq('id', id).single().then(function(r){ if(r.error) throw r.error; var d = Object.assign({}, r.data.data, {snap:snap, snapAt:new Date().toISOString()}); return sb.from('shares').update({data:d, updated_at:new Date().toISOString()}).eq('id', id); }).then(function(r){ if(r && r.error) throw r.error; }); };
  api.shareUpdate = function(id, p){ return sb.from('shares').update(Object.assign({updated_at:new Date().toISOString()}, p)).eq('id', id).then(function(r){ if(r.error) throw r.error; }); };
  api.shareDelete = function(id){ return sb.from('shares').delete().eq('id', id).then(function(r){ if(r.error) throw r.error; }); };
  api.addFeedback = function(o){ return sb.from('feedback').insert(Object.assign({}, o, {author_name: api.me.name || api.me.email})).select().single().then(function(r){ if(r.error) throw r.error; if(r.data && findI(api.fb, r.data.id) < 0) api.fb.push(r.data); notify(); }); };
  api.updateFeedback = function(id, p){ return sb.from('feedback').update(p).eq('id', id).then(function(r){ if(r.error) throw r.error; }); };
  api.setRole = function(id, role){ return sb.from('profiles').update({role:role}).eq('id', id).then(function(r){ if(r.error) throw r.error; api.users.forEach(function(u){ if(u.id === id) u.role = role; }); notify(); }); };
  api.reloadUsers = function(){ return usersQuery().then(function(r){ api.users = r.data || []; notify(); }); };
  /* admins: with sign-up date and email confirmation (admin_users, v2.8); the plain profile list before the update */
  function usersQuery(){ return sb.rpc('admin_users').then(function(r){ return r.error ? sb.from('profiles').select('*').order('created_at') : r; }); }
  api.upload = function(file, regId, recId){
    var safe = String(file.name || 'file').replace(/[^\w.\-]+/g, '_').slice(-80);
    var path = 'r/' + regId + '/' + (recId || 'misc') + '/' + Date.now().toString(36) + '_' + safe;
    return sb.storage.from('files').upload(path, file, {contentType: file.type || undefined, upsert:false}).then(function(r){ if(r.error) throw r.error; return {path:path, name:file.name, type:file.type || '', size:file.size}; });
  };
  api.removeFile = function(){ return Promise.resolve(); };   /* kept: undo and the change log can bring the file back (v2.9) */
  api.deleteFiles = async function(paths){ var n = 0; for(var i = 0; i < paths.length; i += 100){ var r = await sb.storage.from('files').remove(paths.slice(i, i + 100)); if(r.error) throw r.error; n += (r.data || []).length; } return n; };
  /* backups (admins) */
  api.backupList = function(){ return sb.rpc('backup_list').then(function(r){ if(r.error) throw r.error; return r.data || []; }); };
  api.backupNow = function(){ return sb.rpc('backup_now').then(function(r){ if(r.error) throw r.error; return r.data; }); };
  api.backupGet = function(id){ return sb.rpc('backup_get', {p_id:id}).then(function(r){ if(r.error) throw r.error; return r.data; }); };
  api.backupRestore = function(id, word){ return sb.rpc('backup_restore', {p_id:id, p_confirm:word}).then(function(r){ if(r.error) throw r.error; return api.loadAll().then(function(){ notify(); return r.data; }); }); };
  api.storageUnused = function(days){ return sb.rpc('storage_unused', {p_days:days || 30}).then(function(r){ if(r.error) throw r.error; return r.data || []; }); };
  /* a file that cannot be signed (deleted, or not readable for this user) is not asked for again for a minute (v3.1) */
  var urlFail = {};
  function urlsGot(paths, r){ (r && r.data || []).forEach(function(x){ if(x.signedUrl) urls[x.path] = {url:x.signedUrl, exp:Date.now() + 3300e3}; });
    paths.forEach(function(p){ var c = urls[p]; if(!(c && c.exp > Date.now())) urlFail[p] = Date.now() + 60e3; }); }
  api.fileUrl = function(path){
    var c = urls[path]; if(c && c.exp > Date.now()) return c.url;
    if(urlFail[path] > Date.now()) return null;
    pendingUrls[path] = 1;
    if(!urlTimer) urlTimer = setTimeout(function(){
      var paths = Object.keys(pendingUrls); pendingUrls = {}; urlTimer = null;
      sb.storage.from('files').createSignedUrls(paths, 3600).then(function(r){ urlsGot(paths, r); notifySoft(); }, function(){ urlsGot(paths, null); });
    }, 30);
    return null;
  };
  api.signUrls = function(paths){
    var need = (paths || []).filter(function(p, i, a){ var c = urls[p]; return p && a.indexOf(p) === i && !(c && c.exp > Date.now() + 60e3); });
    if(!need.length) return Promise.resolve();
    return sb.storage.from('files').createSignedUrls(need, 3600).then(function(r){ urlsGot(need, r); }, function(){ urlsGot(need, null); });
  };
  api.signIn = function(email, pw){ return sb.auth.signInWithPassword({email:email, password:pw}); };
  api.signUp = function(email, pw, name){ return sb.auth.signUp({email:email, password:pw, options:{data:{name:name}, emailRedirectTo: location.origin + location.pathname}}); };
  api.reset = function(email){ return sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname}); };
  api.setPassword = function(pw){ return sb.auth.updateUser({password:pw}); };
  api.signOut = function(){ return sb.auth.signOut(); };
  return api;
}
