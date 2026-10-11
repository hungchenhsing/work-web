/* work-web · CEEC-TERRA I — single-page app.
   Runs in two modes:
   - cloud: Supabase (auth, Postgres, realtime, storage) when config.js has supabaseUrl + supabaseKey
   - demo:  data kept in this browser only (used until the database is connected)
   All UI text is English-first with Simplified Chinese as the secondary line. */
(function(){
'use strict';

/* ================= utilities ================= */
var $ = function(s){ return document.querySelector(s); };
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
var LS = {
  get: function(k, d){ try{ var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set: function(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
function uid(p){ return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function pad(n){ return String(n).padStart(2, '0'); }
function clone(o){ return JSON.parse(JSON.stringify(o == null ? null : o)); }
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
var now = new Date();
var TODAY_S = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
function d2n(s){ if(!s) return null; var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s)); if(!m) return null; return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5); }
function n2d(n){ return new Date(n * 864e5).toISOString().slice(0, 10); }
var TODAY = d2n(TODAY_S);
var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function md(s){ return s ? String(s).slice(5) : '—'; }
function dmon(s){ var n = d2n(s); if(n == null) return ''; var d = new Date(n * 864e5); return pad(d.getUTCDate()) + ' ' + MON[d.getUTCMonth()]; }
function isoWeek(n){ var d = new Date(n * 864e5); var day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); var y = d.getUTCFullYear(); var jan4 = new Date(Date.UTC(y, 0, 4)); return 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7); }
function parseDate(v){
  if(v == null || v === '') return '';
  if(v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
  if(typeof v === 'number' && v > 20000 && v < 80000){ return n2d(Math.round(v) - 25569); }
  var s = String(v).trim(); var m = /^(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})/.exec(s);
  if(m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
  m = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/.exec(s); if(m) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
  var t = Date.parse(s); if(!isNaN(t)){ var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  return '';
}
function splitList(v, re){ return String(v == null ? '' : v).split(re || /\s*[\/、,，;；\n]\s*/).map(function(s){ return s.trim(); }).filter(Boolean); }
var toastT;
function toast(msg){ var t = $('#toast'); t.textContent = msg; clearTimeout(toastT); toastT = setTimeout(function(){ t.textContent = ''; }, 3600); }
function errText(e){
  var m = (e && (e.message || e.code || e.error_description)) || '';
  if(/row-level security|permission|not allowed|42501/i.test(m)) return T('You do not have permission for this change.', '没有权限进行此修改。');
  if(/JWT|session|auth/i.test(m)) return T('Your sign-in expired. Sign in again.', '登录已过期，请重新登录。');
  if(/fetch|network|Failed/i.test(m)) return T('Network problem — the change was not saved. Try again.', '网络问题，修改未保存，请重试。');
  return T('Could not save: ', '保存失败：') + m.slice(0, 120);
}

/* ================= defaults ================= */
var DEF = {
  projectEn: 'CEEC-TERRA I', projectZh: 'TERRA I 光伏项目',
  asOf: '', ganttStart: '',
  areas: [{id:'B',en:'Block B',zh:'B区',color:'blue'},{id:'C',en:'Block C',zh:'C区',color:'green'},{id:'D',en:'Block D',zh:'D区',color:'amber'},{id:'E',en:'Block E',zh:'E区',color:'violet'}],
  phases: [
    {code:'PH-01',en:'Phase 1',zh:'第1阶段',start:'2026-08-17',end:'2026-08-30'},
    {code:'PH-02',en:'Phase 2',zh:'第2阶段',start:'2026-09-01',end:'2026-09-15'},
    {code:'PH-03',en:'Phase 3',zh:'第3阶段',start:'2026-09-16',end:'2026-09-30'},
    {code:'PH-04',en:'Phase 4',zh:'第4阶段',start:'2026-10-01',end:'2026-10-15'},
    {code:'PH-05',en:'Phase 5',zh:'第5阶段',start:'2026-10-16',end:'2026-10-31'}
  ],
  depts: [{code:'ENG',en:'Engineering',zh:'工程'},{code:'COM',en:'Commissioning & O&M',zh:'调试&运维'},{code:'QA',en:'Quality',zh:'质量'},{code:'DES',en:'Design',zh:'设计'}],
  discs: [{code:'doc',en:'Documents',zh:'文件'},{code:'ele',en:'Electrical',zh:'电气'},{code:'civ',en:'Civil',zh:'土建'},{code:'inc',en:'Protection & control',zh:'继保控制'},{code:'equip',en:'Equipment',zh:'设备'},{code:'archi',en:'Architecture',zh:'建筑'},{code:'pip',en:'Water & drainage',zh:'给排水'},{code:'hvac',en:'HVAC',zh:'暖通'},{code:'str',en:'Structure',zh:'结构'},{code:'csa',en:'Civil/structural/arch.',zh:'结构'},{code:'dra',en:'Drainage',zh:'排水'}],
  statuses: [
    {key:'not_started',en:'Not started',zh:'未开始',color:'amber',done:false},
    {key:'in_progress',en:'In progress',zh:'进行中',color:'blue',done:false},
    {key:'submitted',en:'Submitted',zh:'已提交',color:'violet',done:false},
    {key:'pending',en:'Pending',zh:'暂缓 / 待定',color:'red',done:false},
    {key:'completed',en:'Completed',zh:'已完成',color:'green',done:true}
  ],
  types: [
    {key:'deliverable',en:'Deliverable',zh:'交付项',prefix:'DOC',shape:'bar'},
    {key:'activity',en:'Activity',zh:'活动',prefix:'ACT',shape:'bar'},
    {key:'task',en:'Task',zh:'任务',prefix:'TSK',shape:'bar'},
    {key:'milestone',en:'Milestone',zh:'里程碑',prefix:'MS',shape:'milestone'}
  ],
  ownerResults: [
    {key:'pending',en:'Pending review',zh:'待审查',color:'blue'},
    {key:'accepted',en:'Accepted',zh:'接受',color:'green'},
    {key:'accepted_c',en:'Accepted w/ comments',zh:'带意见接受',color:'green'},
    {key:'revise',en:'Revise & resubmit',zh:'退回重交',color:'red'},
    {key:'rejected',en:'Rejected',zh:'拒绝',color:'red'}
  ],
  ownerFields: ['docNo','title','class','disc','phase','window','actual','status','rev','extNote'],
  customFields: []
};
var DEF_TREE = [
  {id:'pk1',parent:'',code:'P1',en:'Turnover Preparation',zh:'移交准备'},
  {id:'pk2',parent:'',code:'P2',en:'As-built Drawings & Design',zh:'竣工图及设计资料'},
  {id:'pk3',parent:'',code:'P3',en:'Testing, Commissioning & Performance',zh:'测试、调试与性能'},
  {id:'pk4',parent:'',code:'P4',en:'OEM & O&M Documents',zh:'OEM 与运维资料'},
  {id:'pk5',parent:'',code:'P5',en:'Training & Readiness',zh:'培训与运行准备'},
  {id:'pk6',parent:'',code:'P6',en:'Spare Parts & Tools',zh:'备件与工具'},
  {id:'pk7',parent:'',code:'P7',en:'Warranty & Commercial',zh:'质保与商务'},
  {id:'pk8',parent:'',code:'P8',en:'Final Handover & Close-out',zh:'最终移交与关闭'}
];
var COLORS = ['grey','blue','green','amber','red','violet'];
var COLOR_NAMES = {grey:['Grey','灰'],blue:['Blue','蓝'],green:['Green','绿'],amber:['Amber','橙'],red:['Red','红'],violet:['Violet','紫']};
var ROLES = [['admin','Admin','管理员'],['editor','Editor','编辑'],['viewer','Viewer','只读'],['owner','Owner (client)','业主'],['pending','Waiting for approval','待审批']];

/* ================= state ================= */
var S = {
  lang: LS.get('ww.lang', 'both'), view: LS.get('ww.view', 'dash'),
  f: {q:'', node:'all', areas:[], type:'', status:'', phase:'', dept:'', disc:'', contact:'', overdue:false, comments:false, key:false},
  sort: LS.get('ww.sort2', {k:'class', d:1}), regGroup: LS.get('ww.rgroup', 'class'), compact: LS.get('ww.compact', false),
  cols: LS.get('ww.cols2', ['regNo','docNo','class','title','disc','areas','phase','window','actual','status','explanation','remarks','contacts']),
  exp: LS.get('ww.exp', {}), sel: {}, open: null, delAsk: false,
  g: Object.assign({zoom:'week', group:'class', color:'pp', phases:true, left:'auto'}, LS.get('ww.g2', {})), gcol: {},
  stab: 'tree', draft: {}, dirty: {}, saved: {},
  imp: null, snapView: null, snapDelAsk: null, clearAsk: false, bulkDelAsk: false, otab: 'live', fbFor: null, pubSel: null,
  auth: {tab:'in', msg:'', err:'', busy:false}, recovery: false, asOfLocal: null, _to: {}
};
var STORE = null;

/* ================= stores ================= */
function notify(){ schedule(); }
function DemoStore(){
  var KEY = 'ww.demo.v2';
  var st = LS.get(KEY, null);
  if(!st){ st = clone(window.WW_DEMO || {}) || {}; st.cfg = Object.assign(clone(DEF), st.cfg || {}, st.cfgPatch || {}); st.tree = st.tree || clone(DEF_TREE); st.items = st.items || []; st.pubs = []; st.fb = []; }
  var blobs = {};
  var api = {
    mode: 'demo', ready: true, rt: 'demo',
    me: {id:'demo', email:'', name:'Demo', role:'admin'},
    get cfg(){ return st.cfg; }, get tree(){ return st.tree; }, get items(){ return st.items; }, get pubs(){ return st.pubs; }, get fb(){ return st.fb; }, users: [],
    save: function(){ LS.set(KEY, st); notify(); },
    patchItem: function(id, patch){ var it = st.items.filter(function(x){ return x.id === id; })[0]; if(it) Object.assign(it, clone(patch)); api.save(); return Promise.resolve(); },
    createItem: function(id, data){ st.items.push(Object.assign({id:id}, clone(data))); api.save(); return Promise.resolve(); },
    deleteItem: function(id){ st.items = st.items.filter(function(x){ return x.id !== id; }); api.save(); return Promise.resolve(); },
    saveCfg: function(p){ st.cfg = Object.assign({}, st.cfg, clone(p)); api.save(); return Promise.resolve(); },
    saveTree: function(nodes){ st.tree = clone(nodes); api.save(); return Promise.resolve(); },
    createPub: function(id, data){ st.pubs.push(Object.assign({id:id}, clone(data))); api.save(); return Promise.resolve(); },
    deletePub: function(id){ st.pubs = st.pubs.filter(function(x){ return x.id !== id; }); api.save(); return Promise.resolve(); },
    addFeedback: function(o){ st.fb.push(Object.assign({id:uid('f'), status:'open', created_at:new Date().toISOString(), author:'demo', author_name:'Demo'}, o)); api.save(); return Promise.resolve(); },
    updateFeedback: function(id, p){ st.fb.forEach(function(f){ if(f.id === id) Object.assign(f, p); }); api.save(); return Promise.resolve(); },
    clearItems: function(){ st.items = []; api.save(); return Promise.resolve(); },
    resetDemo: function(){ try{ localStorage.removeItem(KEY); }catch(e){} location.reload(); },
    upload: function(file){ var id = 'demo:' + uid('b'); blobs[id] = URL.createObjectURL(file); return Promise.resolve({path:id, type:file.type || 'application/octet-stream', size:file.size}); },
    fileUrl: function(path){ return blobs[path] || null; }
  };
  return api;
}
function CloudStore(url, key){
  var sb = window.supabase.createClient(url, key, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}});
  var urls = {}, pendingUrls = {}, urlTimer = null, channel = null;
  var api = {mode:'cloud', sb:sb, ready:false, rt:'connecting', session:null, me:null, cfg:null, tree:[], items:[], pubs:[], fb:[], users:[]};
  function rowItem(r){ return Object.assign({}, r.data || {}, {id:r.id}); }
  function fail(e){ toast(errText(e)); }
  function check(res){ if(res && res.error) throw res.error; return res; }
  api.init = function(){
    sb.auth.onAuthStateChange(function(ev, session){
      api.session = session;
      if(ev === 'PASSWORD_RECOVERY'){ S.recovery = true; notify(); return; }
      if(ev === 'SIGNED_IN' && session && api.uid === session.user.id && api.ready) return;
      if(ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'USER_UPDATED'){ setTimeout(function(){ api.boot(); }, 0); }
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
  function teardown(){ if(channel){ try{ sb.removeChannel(channel); }catch(e){} channel = null; } api.items = []; api.pubs = []; api.fb = []; api.users = []; api.cfg = null; api.tree = []; }
  async function allItems(){
    var out = [], from = 0, size = 1000;
    for(;;){ var r = check(await sb.from('items').select('id,data').order('id').range(from, from + size - 1)); out = out.concat(r.data.map(rowItem)); if(r.data.length < size) break; from += size; }
    return out;
  }
  api.loadAll = async function(){
    teardown();
    var role = api.me.role, internal = ['admin','editor','viewer'].indexOf(role) >= 0;
    try{
      if(internal){
        var c = check(await sb.from('app_config').select('id,data'));
        c.data.forEach(function(r){ if(r.id === 'main') api.cfg = r.data; if(r.id === 'tree') api.tree = (r.data && r.data.nodes) || []; });
        api.items = await allItems();
        if(!api.cfg && role === 'admin'){ api.cfg = clone(DEF); await sb.rpc('config_patch', {p_id:'main', p_patch:DEF}); }
        if(!api.tree.length && role === 'admin' && !c.data.some(function(r){ return r.id === 'tree'; })){ api.tree = clone(DEF_TREE); await sb.from('app_config').upsert({id:'tree', data:{nodes:DEF_TREE}}); }
      }
      if(internal || role === 'owner'){
        var p = check(await sb.from('publications').select('id,data,created_at').order('created_at', {ascending:false}));
        api.pubs = p.data.map(function(r){ return Object.assign({}, r.data, {id:r.id}); });
        var f = check(await sb.from('feedback').select('*').order('created_at'));
        api.fb = f.data;
        if(role === 'owner'){ var cc = await sb.from('app_config').select('id,data').eq('id', 'main'); if(cc.data && cc.data[0]) api.cfg = cc.data[0].data; }
      }
      if(role === 'admin'){ var us = await sb.from('profiles').select('*').order('created_at'); api.users = us.data || []; }
    }catch(e){ fail(e); }
    api.ready = true; subscribe(); notify();
  };
  function subscribe(){
    channel = sb.channel('ww-' + Date.now());
    channel.on('postgres_changes', {event:'*', schema:'public', table:'items'}, function(p){
      if(p.eventType === 'DELETE'){ api.items = api.items.filter(function(x){ return x.id !== p.old.id; }); }
      else { var it = rowItem(p.new), i = api.items.findIndex(function(x){ return x.id === it.id; }); if(i >= 0) api.items[i] = it; else api.items.push(it); }
      notify();
    }).on('postgres_changes', {event:'*', schema:'public', table:'app_config'}, function(p){
      if(p.eventType === 'DELETE') return; if(p.new.id === 'main') api.cfg = p.new.data; if(p.new.id === 'tree') api.tree = (p.new.data && p.new.data.nodes) || []; notify();
    }).on('postgres_changes', {event:'*', schema:'public', table:'publications'}, function(p){
      if(p.eventType === 'DELETE') api.pubs = api.pubs.filter(function(x){ return x.id !== p.old.id; });
      else { var o = Object.assign({}, p.new.data, {id:p.new.id}); var i = api.pubs.findIndex(function(x){ return x.id === o.id; }); if(i >= 0) api.pubs[i] = o; else api.pubs.unshift(o); }
      notify();
    }).on('postgres_changes', {event:'*', schema:'public', table:'feedback'}, function(p){
      if(p.eventType === 'DELETE') api.fb = api.fb.filter(function(x){ return x.id !== p.old.id; });
      else { var i = api.fb.findIndex(function(x){ return x.id === p.new.id; }); if(i >= 0) api.fb[i] = p.new; else api.fb.push(p.new); }
      notify();
    }).subscribe(function(status){ api.rt = status === 'SUBSCRIBED' ? 'live' : (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'off' : 'connecting'); notify(); });
  }
  api.patchItem = function(id, patch){
    var it = api.items.filter(function(x){ return x.id === id; })[0]; if(it) Object.assign(it, clone(patch)); notify();
    return sb.rpc('item_patch', {p_id:id, p_patch:patch}).then(function(r){ if(r.error) throw r.error; }).catch(function(e){ fail(e); reloadItem(id); });
  };
  function reloadItem(id){ sb.from('items').select('id,data').eq('id', id).maybeSingle().then(function(r){ if(r.data){ var i = api.items.findIndex(function(x){ return x.id === id; }); if(i >= 0) api.items[i] = rowItem(r.data); notify(); } }); }
  api.createItem = function(id, data){ api.items.push(Object.assign({id:id}, clone(data))); notify(); return sb.from('items').insert({id:id, data:data}).then(function(r){ if(r.error) throw r.error; }).catch(function(e){ fail(e); api.items = api.items.filter(function(x){ return x.id !== id; }); notify(); throw e; }); };
  api.deleteItem = function(id){ api.items = api.items.filter(function(x){ return x.id !== id; }); notify(); return sb.from('items').delete().eq('id', id).then(function(r){ if(r.error) throw r.error; }).catch(fail); };
  api.saveCfg = function(p){ api.cfg = Object.assign({}, api.cfg || {}, clone(p)); notify(); return sb.rpc('config_patch', {p_id:'main', p_patch:p}).then(function(r){ if(r.error) throw r.error; }); };
  api.saveTree = function(nodes){ api.tree = clone(nodes); notify(); return sb.from('app_config').upsert({id:'tree', data:{nodes:nodes}}).then(function(r){ if(r.error) throw r.error; }); };
  api.createPub = function(id, data){ return sb.from('publications').insert({id:id, data:data}).then(function(r){ if(r.error) throw r.error; }); };
  api.deletePub = function(id){ return sb.from('publications').delete().eq('id', id).then(function(r){ if(r.error) throw r.error; }); };
  api.addFeedback = function(o){ return sb.from('feedback').insert(Object.assign({}, o, {author_name: api.me.name || api.me.email})).select().single().then(function(r){ if(r.error) throw r.error; if(r.data && !api.fb.some(function(x){ return x.id === r.data.id; })) api.fb.push(r.data); notify(); }); };
  api.updateFeedback = function(id, p){ return sb.from('feedback').update(p).eq('id', id).then(function(r){ if(r.error) throw r.error; }); };
  api.clearItems = function(){ return sb.from('items').delete().neq('id', '').then(function(r){ if(r.error) throw r.error; api.items = []; notify(); }); };
  api.setRole = function(id, role){ return sb.from('profiles').update({role:role}).eq('id', id).then(function(r){ if(r.error) throw r.error; api.users.forEach(function(u){ if(u.id === id) u.role = role; }); notify(); }); };
  api.reloadUsers = function(){ return sb.from('profiles').select('*').order('created_at').then(function(r){ api.users = r.data || []; notify(); }); };
  api.upload = function(file, itemId){
    var safe = String(file.name).replace(/[^\w.\-]+/g, '_').slice(-80);
    var path = (itemId || 'misc') + '/' + Date.now().toString(36) + '_' + safe;
    return sb.storage.from('files').upload(path, file, {contentType: file.type || undefined, upsert:false}).then(function(r){ if(r.error) throw r.error; return {path:path, type:file.type || '', size:file.size}; });
  };
  api.fileUrl = function(path){
    var c = urls[path]; if(c && c.exp > Date.now()) return c.url;
    pendingUrls[path] = 1;
    if(!urlTimer) urlTimer = setTimeout(function(){
      var paths = Object.keys(pendingUrls); pendingUrls = {}; urlTimer = null;
      sb.storage.from('files').createSignedUrls(paths, 3600).then(function(r){ (r.data || []).forEach(function(x){ if(x.signedUrl) urls[x.path] = {url:x.signedUrl, exp:Date.now() + 3300e3}; }); notify(); });
    }, 30);
    return null;
  };
  api.signIn = function(email, pw){ return sb.auth.signInWithPassword({email:email, password:pw}); };
  api.signUp = function(email, pw, name){ return sb.auth.signUp({email:email, password:pw, options:{data:{name:name}, emailRedirectTo: location.origin + location.pathname}}); };
  api.reset = function(email){ return sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname}); };
  api.setPassword = function(pw){ return sb.auth.updateUser({password:pw}); };
  api.signOut = function(){ return sb.auth.signOut(); };
  return api;
}

/* ================= config, i18n, lookups ================= */
function cfg(){ var c = (STORE && STORE.cfg) || {}; var o = {}; for(var k in DEF) o[k] = (c[k] !== undefined && c[k] !== null ? c[k] : DEF[k]); return o; }
function role(){ return (STORE && STORE.me && STORE.me.role) || 'none'; }
function canEdit(){ return role() === 'admin' || role() === 'editor'; }
function isInternal(){ return ['admin','editor','viewer'].indexOf(role()) >= 0; }
function items(){ return (STORE && STORE.items) || []; }
function L(en, zh){ var m = S.lang; if(m === 'en' || !zh) return esc(en); if(m === 'zh') return esc(zh); return esc(en) + ' <span class="zh">' + esc(zh) + '</span>'; }
function T(en, zh){ var m = S.lang; if(m === 'en' || !zh) return en; if(m === 'zh') return zh; return en + ' · ' + zh; }
function bi(en, zh){ var m = S.lang; if(m === 'zh') return esc(zh || en); if(m === 'en' || !zh) return esc(en || zh); return esc(en || zh) + (en ? '<span class="zh2">' + esc(zh) + '</span>' : ''); }
function title1(it){ return S.lang === 'zh' ? (it.zh || it.en || '') : (it.en || it.zh || ''); }
function byKey(list, k, field){ return (list || []).filter(function(x){ return x[field || 'key'] === k; })[0]; }
function statusOf(k){ return byKey(cfg().statuses, k) || {key:k, en:k || '—', zh:'', color:'grey'}; }
function typeOf(k){ return byKey(cfg().types, k) || {key:k, en:k || '—', zh:'', prefix:'ITM', shape:'bar'}; }
function areaOf(id){ return byKey(cfg().areas, id, 'id') || {id:id, en:id, zh:'', color:'grey'}; }
function phaseOf(c){ return byKey(cfg().phases, c, 'code'); }
function deptOf(c){ return byKey(cfg().depts, c, 'code'); }
function discOf(c){ return byKey(cfg().discs, c, 'code') || {code:c, en:c, zh:''}; }
function orOf(k){ return byKey(cfg().ownerResults, k); }
function isDone(it){ return !!statusOf(it.status).done; }
function ASOFN(){ return d2n(S.asOfLocal || cfg().asOf) != null ? d2n(S.asOfLocal || cfg().asOf) : TODAY; }
function planOf(it){
  var s = d2n(it.start), f = d2n(it.finish), ph = phaseOf(it.phase), fromPhase = false;
  if(s == null && f == null && ph){ s = d2n(ph.start); f = d2n(ph.end); fromPhase = true; }
  if(s == null) s = f; if(f == null) f = s;
  if(s == null) return null;
  if(f < s){ var t = s; s = f; f = t; }
  return {s:s, f:f, fromPhase:fromPhase};
}
function isOverdue(it){ if(isDone(it)) return false; var p = planOf(it); return !!p && p.f < ASOFN(); }
function openFb(id){ return ((STORE && STORE.fb) || []).filter(function(f){ return f.item_id === id && f.status === 'open'; }).length; }
function hasComments(it){ return (!!String(it.remarks || '').trim() && !it.commentsResolved) || openFb(it.id) > 0; }
function getItem(id){ return items().filter(function(x){ return x.id === id; })[0]; }
function chip(color, html){ return '<span class="chip c-' + esc(color || 'grey') + '">' + html + '</span>'; }
function statusChip(k){ var s = statusOf(k); return chip(s.color, L(s.en, s.zh)); }
function statusChipShort(k){ var s = statusOf(k); return chip(s.color, esc(S.lang === 'zh' ? (s.zh || s.en) : s.en)); }
function areaChips(arr){ arr = arr || []; if(!arr.length) return '<span class="ar c-grey" title="' + esc(T('Site-wide', '全场')) + '">' + esc(S.lang === 'zh' ? '全场' : 'Site') + '</span>'; return arr.map(function(a){ var o = areaOf(a); return '<span class="ar c-' + esc(o.color) + '" title="' + esc(T(o.en, o.zh)) + '">' + esc(o.id) + '</span>'; }).join(''); }
function discTags(arr){ return (arr || []).map(function(c){ var d = discOf(c); return '<span class="tag" title="' + esc(T(d.en, d.zh)) + '">' + esc(c) + (S.lang !== 'en' && d.zh ? esc(d.zh) : '') + '</span>'; }).join(''); }
function phaseWindow(code){ var p = phaseOf(code); return p ? dmon(p.start) + '–' + dmon(p.end) : ''; }
function actualText(it){ if(!it.actualStart && !it.actualEnd) return ''; return (it.actualStart || '?') + ' → ' + (it.actualEnd || (it.ongoing ? T('ongoing', '进行中') : '…')); }
function contactsText(it){ return (it.contacts || []).join(' / '); }
function peopleList(){ var set = {}; items().forEach(function(i){ (i.contacts || []).forEach(function(p){ if(p) set[p] = 1; }); }); return Object.keys(set).sort(); }

/* tree */
var TI = {by:{}, kids:{}}, DESC = {};
function buildTI(){
  var by = {}, kids = {}, tree = (STORE && STORE.tree) || [];
  tree.forEach(function(n){ by[n.id] = n; });
  tree.forEach(function(n){ var p = n.parent && by[n.parent] ? n.parent : ''; (kids[p] = kids[p] || []).push(n); });
  TI = {by:by, kids:kids}; DESC = {};
}
function kidsOf(id){ return TI.kids[id || ''] || []; }
function pathOf(id){ var out = [], n = TI.by[id], g = 0; while(n && g++ < 20){ out.unshift(n); n = n.parent ? TI.by[n.parent] : null; } return out; }
function descOf(id){ if(DESC[id]) return DESC[id]; var set = {}; (function w(x){ set[x] = 1; kidsOf(x).forEach(function(k){ w(k.id); }); })(id); DESC[id] = set; return set; }
function l1Of(id){ return pathOf(id)[0] || null; }
function dfs(cb){ (function w(pid, d){ kidsOf(pid).forEach(function(n){ cb(n, d); w(n.id, d + 1); }); })('', 0); }
function nodeLabel(n){ return n ? (n.code ? n.code + ' ' : '') + T(n.en, n.zh) : T('Unclassified', '未分类'); }
function treeOrder(){ var o = {}, i = 0; dfs(function(n){ o[n.id] = i++; }); return o; }

/* filters */
function emptyF(){ return {q:'', node:'all', areas:[], type:'', status:'', phase:'', dept:'', disc:'', contact:'', overdue:false, comments:false, key:false}; }
function match(it, skipNode){
  var f = S.f;
  if(f.q){ var q = f.q.toLowerCase(); if(![it.regNo, it.en, it.zh, it.docNo, contactsText(it), it.explanation, it.remarks].some(function(v){ return String(v || '').toLowerCase().indexOf(q) >= 0; })) return false; }
  if(!skipNode && f.node !== 'all'){ if(f.node === 'none'){ if(it.node && TI.by[it.node]) return false; } else if(!descOf(f.node)[it.node]) return false; }
  if(f.areas.length){ var a = it.areas || []; var ok = a.length ? a.some(function(x){ return f.areas.indexOf(x) >= 0; }) : f.areas.indexOf('SW') >= 0; if(!ok) return false; }
  if(f.type && it.type !== f.type) return false;
  if(f.status && it.status !== f.status) return false;
  if(f.phase && (it.phase || '') !== (f.phase === '_none' ? '' : f.phase)) return false;
  if(f.dept && it.dept !== f.dept) return false;
  if(f.disc && (it.disc || []).indexOf(f.disc) < 0) return false;
  if(f.contact && (it.contacts || []).indexOf(f.contact) < 0) return false;
  if(f.overdue && !isOverdue(it)) return false;
  if(f.comments && !hasComments(it)) return false;
  if(f.key && !it.key) return false;
  return true;
}
function filtered(){ return items().filter(function(it){ return match(it); }); }
var GROUPS = [['class','Package','文件包'],['phase','Phase','提交阶段'],['area','Block','区域'],['dept','Department','部门'],['disc','Discipline','专业'],['status','Status','状态'],['contact','Contact','对接人'],['type','Type','类型'],['none','None','不分组']];
function groupOf(it, mode){
  var c = cfg();
  if(mode === 'class'){ var l1 = l1Of(it.node); return l1 ? {k:l1.id, code:l1.code || '', en:l1.en, zh:l1.zh, o:S._to[l1.id], node:l1.id} : {k:'_n', code:'', en:'Unclassified', zh:'未分类', o:1e9}; }
  if(mode === 'phase'){ var p = phaseOf(it.phase); return p ? {k:p.code, code:p.code, en:p.en + ' · ' + dmon(p.start) + '–' + dmon(p.end), zh:p.zh, o:c.phases.indexOf(p), phase:p.code} : {k:'_n', code:'', en:'No phase', zh:'未排阶段', o:1e9, phase:''}; }
  if(mode === 'area'){ var a = it.areas || []; if(!a.length) return {k:'SW', code:'', en:'Site-wide', zh:'全场', o:900, areas:[]}; if(a.length > 1) return {k:'MULTI', code:'', en:'Several blocks', zh:'多区域', o:800}; var o = areaOf(a[0]); return {k:o.id, code:o.id, en:o.en, zh:o.zh, o:c.areas.indexOf(o), areas:[o.id]}; }
  if(mode === 'dept'){ var d = deptOf(it.dept); return d ? {k:d.code, code:'', en:d.en, zh:d.zh, o:c.depts.indexOf(d), dept:d.code} : {k:'_n', code:'', en:'No department', zh:'未指定部门', o:1e9}; }
  if(mode === 'disc'){ var x = (it.disc || [])[0]; if(!x) return {k:'_n', code:'', en:'No discipline', zh:'未指定专业', o:1e9}; var dd = discOf(x); return {k:x, code:x, en:dd.en, zh:dd.zh, o:c.discs.indexOf(dd), disc:[x]}; }
  if(mode === 'status'){ var s = statusOf(it.status); return {k:s.key, code:'', en:s.en, zh:s.zh, o:c.statuses.indexOf(s), status:s.key}; }
  if(mode === 'contact'){ var p1 = (it.contacts || [])[0]; return p1 ? {k:'c:' + p1, code:'', en:p1, zh:'', o:0, contacts:[p1]} : {k:'_n', code:'', en:'No contact', zh:'未指定对接人', o:1}; }
  if(mode === 'type'){ var t = typeOf(it.type); return {k:t.key, code:'', en:t.en, zh:t.zh, o:c.types.indexOf(t), type:t.key}; }
  return {k:'all', code:'', en:'', zh:'', o:0};
}
function groupItems(list, mode){
  S._to = treeOrder();
  var groups = [], gi = {};
  list.forEach(function(it){ var g = groupOf(it, mode); if(!gi[g.k]){ gi[g.k] = Object.assign({items:[]}, g); groups.push(gi[g.k]); } gi[g.k].items.push(it); });
  groups.sort(function(a, b){ return (a.o == null ? 1e8 : a.o) - (b.o == null ? 1e8 : b.o) || String(a.en).localeCompare(String(b.en)); });
  return groups;
}

/* ================= item writes ================= */
function shortV(v){ if(v == null) return ''; if(Array.isArray(v)) return v.map(function(x){ return typeof x === 'object' ? (x.d || '') + ' ' + (x.text || '') : x; }).join(', ').slice(0, 80); if(typeof v === 'object') return JSON.stringify(v).slice(0, 60); return String(v).slice(0, 80); }
function setFields(id, obj){
  if(!STORE || !canEdit()) return Promise.resolve();
  var it = getItem(id); if(!it) return Promise.resolve();
  var hist = (it.history || []).slice(-39), changed = false, patch = {};
  var who = (STORE.me && (STORE.me.name || STORE.me.email)) || '';
  Object.keys(obj).forEach(function(f){
    var nv = obj[f], ov = it[f];
    if(JSON.stringify(ov === undefined ? null : ov) === JSON.stringify(nv === undefined ? null : nv)) return;
    if(f === 'custom'){ var oc = ov || {}; Object.keys(nv || {}).forEach(function(k){ if(JSON.stringify(oc[k]) !== JSON.stringify(nv[k])) hist.push({t:new Date().toISOString(), by:who, f:'custom.' + k, from:shortV(oc[k]), to:shortV(nv[k])}); }); }
    else if(f !== 'attachments' && f !== 'updates') hist.push({t:new Date().toISOString(), by:who, f:f, from:shortV(ov), to:shortV(nv)});
    else hist.push({t:new Date().toISOString(), by:who, f:f, from:'', to:'(' + (nv || []).length + ')'});
    changed = true; patch[f] = nv;
  });
  if(!changed) return Promise.resolve();
  patch.history = hist.slice(-40); patch.updatedAt = new Date().toISOString(); patch.updatedBy = who;
  return STORE.patchItem(id, patch);
}
function setField(id, f, v){ var o = {}; o[f] = v; return setFields(id, o); }
function nextRegNo(typeKey){
  var pre = String(typeOf(typeKey).prefix || 'ITM').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'ITM', max = 0;
  items().forEach(function(it){ var m = new RegExp('^' + pre + '-(\\d+)$').exec(it.regNo || ''); if(m) max = Math.max(max, +m[1]); });
  return pre + '-' + String(max + 1).padStart(3, '0');
}
function blankItem(typeKey, extra){
  var c = cfg(), t = typeOf(typeKey), A = ASOFN();
  var o = {regNo: nextRegNo(typeKey), type: typeKey, en: '', zh: '', node: '', areas: [], dept:'', disc:[], phase:'', contacts:[],
    status: c.statuses[0] ? c.statuses[0].key : '', start: n2d(A), finish: t.shape === 'milestone' ? n2d(A) : n2d(A + 13), progress: 0,
    docNo: '', rev: '', actualStart:'', actualEnd:'', ongoing:false, explanation:'', remarks:'', commentsResolved:false, updates:[], key:false,
    ownerResult: '', ownerVisible: false, extNote: '', intNote: '', deps: [], custom: {}, attachments: [],
    history: [{t:new Date().toISOString(), by:(STORE.me && (STORE.me.name || STORE.me.email)) || '', f:'created', from:'', to:''}], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()};
  var f = S.f;
  if(f.node !== 'all' && f.node !== 'none' && TI.by[f.node]) o.node = f.node;
  o.areas = f.areas.filter(function(a){ return a !== 'SW'; });
  if(f.phase && f.phase !== '_none') o.phase = f.phase;
  if(f.dept) o.dept = f.dept; if(f.disc) o.disc = [f.disc]; if(f.contact) o.contacts = [f.contact];
  return Object.assign(o, extra || {});
}
function newItem(typeKey, extra, openIt){
  if(!canEdit()) return;
  var id = uid('i'), o = blankItem(typeKey, extra);
  if(!o.en && !o.zh) o.en = 'New ' + typeOf(typeKey).en.toLowerCase();
  STORE.createItem(id, o).then(function(){ if(openIt !== false){ S.open = id; S.delAsk = false; renderDrawer(); } }).catch(function(){});
}

/* ================= rendering ================= */
var rq = false;
function isField(el){ return el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName); }
function schedule(){
  if(rq) return; rq = true;
  requestAnimationFrame(function(){
    rq = false; buildTI(); renderTop();
    if(!appReady()){ renderGate(); return; }
    var ae = document.activeElement;
    if(isField(ae) && $('#filters').contains(ae)) S.pf = true; else renderFilters();
    if(isField(ae) && $('#view').contains(ae)) S.pv = true; else renderView();
    if(isField(ae) && $('#drawer-root').contains(ae)) S.pdr = true; else renderDrawer();
  });
}
document.addEventListener('focusout', function(){
  setTimeout(function(){
    var ae = document.activeElement;
    if(S.pf && !(isField(ae) && $('#filters').contains(ae))){ S.pf = false; renderFilters(); }
    if(S.pv && !(isField(ae) && $('#view').contains(ae))){ S.pv = false; renderView(); }
    if(S.pdr && !(isField(ae) && $('#drawer-root').contains(ae))){ S.pdr = false; renderDrawer(); }
  }, 0);
});
function appReady(){ return STORE && STORE.ready && (STORE.mode === 'demo' || (STORE.me && !S.recovery && role() !== 'pending' && role() !== 'none')); }
function renderAll(){ buildTI(); renderTop(); if(!appReady()){ renderGate(); return; } renderFilters(); renderView(); renderDrawer(); }

/* ---------- gate: sign-in / pending ---------- */
function renderGate(){
  $('#filters').innerHTML = ''; $('#drawer-root').innerHTML = '';
  var v = $('#view'), a = S.auth;
  if(!STORE || !STORE.ready){ v.innerHTML = '<div class="card empty">' + L('Connecting…', '正在连接…') + '</div>'; return; }
  if(S.recovery){
    v.innerHTML = '<form class="card auth" id="fRecover"><h1 class="vtitle">' + L('Set a new password', '设置新密码') + '</h1><label class="fl">' + L('New password', '新密码') + '<input class="in" type="password" id="aPw" minlength="8" required autocomplete="new-password"></label>' + (a.err ? '<div class="err">' + esc(a.err) + '</div>' : '') + '<button class="btn pri" type="submit">' + L('Save password', '保存密码') + '</button></form>';
    return;
  }
  if(STORE.session && STORE.me && (role() === 'pending' || role() === 'none')){
    v.innerHTML = '<div class="card auth"><h1 class="vtitle">' + L('Waiting for approval', '等待审批') + '</h1><p>' + L('Your account (' + (STORE.me.email || '') + ') is registered. The project admin needs to give you access before you can see the data.', '账号（' + (STORE.me.email || '') + '）已注册，需要项目管理员授权后才能查看数据。') + '</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="recheck">' + L('Check again', '重新检查') + '</button><button class="btn" data-act="signOut">' + L('Sign out', '退出') + '</button></div></div>';
    return;
  }
  var tabs = '<div class="seg" role="tablist">' + [['in','Sign in','登录'],['up','Create account','注册'],['reset','Forgot password','忘记密码']].map(function(t){ return '<button type="button" data-act="authTab" data-v="' + t[0] + '" aria-pressed="' + (a.tab === t[0]) + '">' + L(t[1], t[2]) + '</button>'; }).join('') + '</div>';
  var body = '';
  if(a.tab === 'in') body = '<label class="fl">' + L('Email', '邮箱') + '<input class="in" type="email" id="aEmail" required autocomplete="email"></label><label class="fl">' + L('Password', '密码') + '<input class="in" type="password" id="aPw" required autocomplete="current-password"></label><button class="btn pri" type="submit"' + (a.busy ? ' disabled' : '') + '>' + L('Sign in', '登录') + '</button>';
  else if(a.tab === 'up') body = '<label class="fl">' + L('Name', '姓名') + '<input class="in" id="aName" required autocomplete="name"></label><label class="fl">' + L('Email', '邮箱') + '<input class="in" type="email" id="aEmail" required autocomplete="email"></label><label class="fl">' + L('Password (8+ characters)', '密码（至少 8 位）') + '<input class="in" type="password" id="aPw" minlength="8" required autocomplete="new-password"></label><button class="btn pri" type="submit"' + (a.busy ? ' disabled' : '') + '>' + L('Create account', '注册') + '</button><p class="note">' + L('After you confirm your email, the project admin gives you access.', '确认邮箱后，由项目管理员授权。') + '</p>';
  else body = '<label class="fl">' + L('Email', '邮箱') + '<input class="in" type="email" id="aEmail" required autocomplete="email"></label><button class="btn pri" type="submit"' + (a.busy ? ' disabled' : '') + '>' + L('Send reset link', '发送重置链接') + '</button>';
  v.innerHTML = '<form class="card auth" id="fAuth"><div><h1 class="vtitle">' + esc(cfg().projectEn) + '</h1><div class="muted">work-web · ' + L('Project register and schedule', '项目台账与计划') + '</div></div>' + tabs + body +
    (a.err ? '<div class="err">' + esc(a.err) + '</div>' : '') + (a.msg ? '<div class="ok-msg">' + esc(a.msg) + '</div>' : '') + '</form>';
}

/* ---------- top bar ---------- */
var TABS_INT = [['dash','Overview','总览'],['register','Register','总台账'],['gantt','Gantt','甘特图'],['owner','Owner plan','业主计划'],['files','Files','文件与照片'],['settings','Settings','设置']];
var TABS_OWNER = [['portal','Submission plan','提交计划']];
function tabsFor(){ return role() === 'owner' ? TABS_OWNER : TABS_INT; }
function renderTop(){
  var c = cfg(), tabs = appReady() ? tabsFor() : [];
  if(appReady() && !tabs.some(function(t){ return t[0] === S.view; })) S.view = tabs[0][0];
  var st = STORE && STORE.mode === 'cloud' && !appReady() ? ['','',''] : STORE ? (STORE.mode === 'demo' ? ['Demo · this browser only','演示 · 仅本浏览器','demo'] : STORE.rt === 'live' ? (canEdit() ? ['Live','在线','live'] : ['Live · read-only','在线 · 只读','ro']) : STORE.rt === 'off' ? ['Offline','未连接','off'] : ['Connecting','连接中','']) : ['','',''];
  var me = STORE && STORE.me && STORE.mode === 'cloud' && STORE.session ? '<details class="menu"><summary class="btn sm">' + esc(STORE.me.name || STORE.me.email || '') + '</summary><div class="pop"><div class="note" style="padding:6px 8px">' + esc(STORE.me.email || '') + '<br>' + L.apply(null, (ROLES.filter(function(r){ return r[0] === role(); })[0] || ['', role(), '']).slice(1)) + '</div><button type="button" data-act="signOut">' + L('Sign out', '退出') + '</button></div></details>' : '';
  $('#top').innerHTML = '<div class="brand"><b>' + esc(c.projectEn) + '</b><span>' + esc(S.lang === 'en' ? 'work-web' : (c.projectZh || 'work-web')) + '</span></div>' +
    '<nav class="tabs" aria-label="Sections">' + tabs.map(function(t){ return '<button type="button" data-act="tab" data-v="' + t[0] + '"' + (S.view === t[0] ? ' aria-current="page"' : '') + '>' + (S.lang === 'zh' ? esc(t[2]) : esc(t[1]) + (S.lang === 'both' ? '<span class="zh">' + esc(t[2]) + '</span>' : '')) + '</button>'; }).join('') + '</nav>' +
    '<div class="tools">' + (st[0] ? '<span class="sync"><span class="dot ' + st[2] + '"></span>' + L(st[0], st[1]) + '</span>' : '') +
    '<div class="seg" role="group" aria-label="Display language">' + [['en','EN'],['both','EN + 中'],['zh','中']].map(function(o){ return '<button type="button" data-act="lang" data-v="' + o[0] + '" aria-pressed="' + (S.lang === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' + me + '</div>';
  var b = $('#banner');
  if(STORE && STORE.mode === 'demo') b.innerHTML = '<div class="banner info">' + L('Demo mode: data stays in this browser. Connect the Supabase database (see README) to go live for everyone.', '演示模式：数据只保存在本浏览器。连接 Supabase 数据库后（见 README）即可多人在线使用。') + '</div>';
  else if(STORE && STORE.rt === 'off' && appReady()) b.innerHTML = '<div class="banner">' + L('Live updates are paused. Changes still save; reload to refresh.', '实时同步暂停，修改仍会保存；刷新页面可更新。') + '</div>';
  else b.innerHTML = '';
}

/* ---------- filter bar ---------- */
function renderFilters(){
  $('#dl-people').innerHTML = peopleList().map(function(p){ return '<option value="' + esc(p) + '"></option>'; }).join('');
  if(['register','gantt','owner','files'].indexOf(S.view) < 0 || !isInternal()){ $('#filters').innerHTML = ''; return; }
  var c = cfg(), f = S.f;
  var nodeOpts = '<option value="all">' + esc(T('All packages', '全部文件包')) + '</option><option value="none"' + (f.node === 'none' ? ' selected' : '') + '>' + esc(T('Unclassified', '未分类')) + '</option>';
  dfs(function(n, d){ nodeOpts += '<option value="' + esc(n.id) + '"' + (f.node === n.id ? ' selected' : '') + '>' + '  '.repeat(d) + esc(nodeLabel(n)) + '</option>'; });
  var areas = c.areas.map(function(a){ return '<button type="button" class="fchip" data-act="farea" data-v="' + esc(a.id) + '" aria-pressed="' + (f.areas.indexOf(a.id) >= 0) + '" title="' + esc(T(a.en, a.zh)) + '">' + esc(S.lang === 'zh' ? (a.zh || a.id) : a.en) + '</button>'; }).join('') +
    '<button type="button" class="fchip" data-act="farea" data-v="SW" aria-pressed="' + (f.areas.indexOf('SW') >= 0) + '">' + esc(T('Site-wide', '全场')) + '</button>';
  function sel(id, val, first, opts){ return '<select class="in" id="' + id + '" aria-label="' + esc(first) + '" style="max-width:190px"><option value="">' + esc(first) + '</option>' + opts.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (val === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  var active = ['type','status','phase','dept','disc','contact'].filter(function(k){ return f[k]; }).length + (f.node !== 'all' ? 1 : 0) + f.areas.length + (f.overdue ? 1 : 0) + (f.comments ? 1 : 0) + (f.key ? 1 : 0) + (f.q ? 1 : 0);
  $('#filters').innerHTML = '<div class="card filters' + (S.fOpen ? ' open' : '') + '">' +
    '<label class="search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="fq" type="search" placeholder="' + esc(T('Search no., title, doc no., contact, remarks', '搜索编号、名称、文件号、对接人、备注')) + '" aria-label="Search" value="' + esc(f.q) + '"></label>' +
    '<button type="button" class="btn ftoggle" data-act="fToggle" aria-expanded="' + !!S.fOpen + '">' + L('Filters', '筛选') + (active ? ' (' + active + ')' : '') + '</button><div class="fmore">' +
    '<select class="in" id="fnode" aria-label="Package" style="max-width:250px">' + nodeOpts + '</select>' +
    '<div class="fchips" role="group" aria-label="Blocks">' + areas + '</div>' +
    sel('fphase', f.phase, T('All phases', '全部阶段'), c.phases.map(function(p){ return [p.code, p.code + ' · ' + dmon(p.start) + '–' + dmon(p.end)]; }).concat([['_none', T('No phase', '未排阶段')]])) +
    sel('fstatus', f.status, T('All statuses', '全部状态'), c.statuses.map(function(s){ return [s.key, T(s.en, s.zh)]; })) +
    sel('fdept', f.dept, T('All departments', '全部部门'), c.depts.map(function(d){ return [d.code, T(d.en, d.zh)]; })) +
    sel('fdisc', f.disc, T('All disciplines', '全部专业'), c.discs.map(function(d){ return [d.code, d.code + ' ' + T(d.en, d.zh)]; })) +
    sel('fcontact', f.contact, T('All contacts', '全部对接人'), peopleList().map(function(p){ return [p, p]; })) +
    sel('ftype', f.type, T('All types', '全部类型'), c.types.map(function(t){ return [t.key, T(t.en, t.zh)]; })) +
    '<label class="chk"><input type="checkbox" id="fover"' + (f.overdue ? ' checked' : '') + '>' + L('Overdue', '逾期') + '</label>' +
    '<label class="chk"><input type="checkbox" id="fcom"' + (f.comments ? ' checked' : '') + '>' + L('Has comments', '有意见') + '</label>' +
    '<label class="chk"><input type="checkbox" id="fkey"' + (f.key ? ' checked' : '') + '>' + L('★ Key', '★ 重点') + '</label>' +
    (active ? '<button type="button" class="btn sm" data-act="clearf">' + L('Clear ' + active, '清除 ' + active) + '</button>' : '') + '</div></div>';
}

/* ---------- views ---------- */
function renderView(){
  var v = $('#view');
  var keep = {}; ['.tbl-wrap','.gwrap','.treep'].forEach(function(s){ var el = v.querySelector(s); if(el) keep[s] = [el.scrollLeft, el.scrollTop]; });
  var sx = window.scrollX, sy = window.scrollY, html;
  if(role() === 'owner') html = viewPortal();
  else if(S.view === 'dash') html = viewDash();
  else if(S.view === 'register') html = viewRegister();
  else if(S.view === 'gantt') html = viewGantt();
  else if(S.view === 'owner') html = viewOwner();
  else if(S.view === 'files') html = viewFiles();
  else html = viewSettings();
  v.innerHTML = html;
  Object.keys(keep).forEach(function(s){ var el = v.querySelector(s); if(el){ el.scrollLeft = keep[s][0]; el.scrollTop = keep[s][1]; } });
  if(S.view === 'gantt' && S.gScroll){ S.gScroll = false; var gw = v.querySelector('.gwrap'); if(gw && S.gm) gw.scrollLeft = Math.max(0, (ASOFN() - S.gm.mn) * S.gm.px - 160); }
  window.scrollTo(sx, sy);
}

/* ===== Overview ===== */
function kpi(label, n, sub, cls, act){ return '<' + (act ? 'button type="button" data-act="' + act + '"' : 'div') + ' class="card kpi" style="text-align:left;' + (act ? 'cursor:pointer;color:var(--ink)' : '') + '"><span>' + label + '</span><span class="n ' + (cls || '') + '">' + esc(n) + '</span><span class="muted" style="font-size:12px">' + sub + '</span></' + (act ? 'button' : 'div') + '>'; }
function viewDash(){
  var c = cfg(), all = items(), A = ASOFN();
  if(!all.length) return '<div class="card empty"><div class="vtitle">' + L('No items yet', '还没有记录') + '</div><div>' + L('Add items in the Register or Gantt, or import your Excel register in Settings › Project & data.', '在总台账或甘特图新增，或在 设置 › 项目与数据 导入 Excel。') + '</div><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn pri" data-act="tab" data-v="register">' + L('Open register', '打开总台账') + '</button><button class="btn" data-act="gotoData">' + L('Import Excel', '导入 Excel') + '</button></div></div>';
  var done = all.filter(isDone).length, od = all.filter(isOverdue), com = all.filter(hasComments);
  var due = all.filter(function(i){ var p = planOf(i); return !isDone(i) && p && p.f >= A && p.f <= A + 14; });
  var h = '<div class="bar-row"><div class="l"><h1 class="vtitle">' + L('Overview', '总览') + '</h1><span class="muted">' + L('Status date', '状态日期') + ' <span class="mono">' + n2d(A) + '</span></span></div></div>';
  h += '<div class="kpis">' + kpi(L('Items', '记录数'), all.length, L(done + ' completed (' + Math.round(done / all.length * 100) + '%)', '已完成 ' + done + '（' + Math.round(done / all.length * 100) + '%）')) +
    kpi(L('Overdue', '已逾期'), od.length, L('Plan finish before status date', '计划结束早于状态日期'), od.length ? 'bad' : '', 'kOver') +
    kpi(L('Open comments', '未关闭意见'), com.length, L('Remarks or Owner feedback', '备注或业主反馈'), com.length ? 'bad' : '', 'kCom') +
    kpi(L('Due in 14 days', '14 天内到期'), due.length, L('Not completed', '未完成')) + '</div>';
  // phases
  if(c.phases.length){
    h += '<section class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><h2 style="font-size:15px">' + L('By submission phase', '按提交阶段') + '</h2><div class="phgrid">' + c.phases.map(function(p){
      var its = all.filter(function(i){ return i.phase === p.code; }), n = its.length, cur = A >= d2n(p.start) && A <= d2n(p.end);
      var segs = c.statuses.map(function(s){ var k = its.filter(function(i){ return i.status === s.key; }).length; return k ? '<span class="cb-' + esc(s.color) + '" style="width:' + (k / n * 100) + '%" title="' + esc(T(s.en, s.zh) + ': ' + k) + '"></span>' : ''; }).join('');
      return '<button type="button" class="phrow lnk" data-act="goPhase" data-v="' + esc(p.code) + '" style="color:var(--ink)"><span><b class="mono">' + esc(p.code) + '</b> <span class="muted">' + esc(dmon(p.start) + '–' + dmon(p.end)) + '</span>' + (cur ? ' <span class="chip c-amber">' + L('current', '当前') + '</span>' : '') + '</span><span class="stack">' + (n ? segs : '') + '</span><span class="mono muted" style="text-align:right">' + its.filter(isDone).length + ' / ' + n + '</span></button>';
    }).join('') + '</div><div class="legend">' + c.statuses.map(function(s){ return '<span><i class="cb-' + esc(s.color) + '"></i>' + L(s.en, s.zh) + '</span>'; }).join('') + '</div></section>';
  }
  // blocks
  var al = c.areas.map(function(a){ return {id:a.id, en:a.en, zh:a.zh, items: all.filter(function(i){ return (i.areas || []).indexOf(a.id) >= 0; })}; });
  al.push({id:'SW', en:'Site-wide', zh:'全场', items: all.filter(function(i){ return !(i.areas || []).length; })});
  h += '<section class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><h2 style="font-size:15px">' + L('By block', '按区域') + '</h2><div class="areas4">' + al.map(function(a){
    var n = a.items.length, dn = a.items.filter(isDone).length, o = a.items.filter(isOverdue).length;
    var segs = c.statuses.map(function(s){ var k = a.items.filter(function(i){ return i.status === s.key; }).length; return k ? '<span class="cb-' + esc(s.color) + '" style="width:' + (k / n * 100) + '%"></span>' : ''; }).join('');
    return '<button type="button" class="acard" data-act="goArea" data-v="' + esc(a.id) + '"><div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;width:100%"><b>' + L(a.en, a.zh) + '</b><span class="mono muted">' + dn + ' / ' + n + '</span></div><div class="stack" style="width:100%">' + (n ? segs : '') + '</div><div style="font-size:12px;display:flex;gap:10px;flex-wrap:wrap"><span class="muted">' + L('Completed', '完成') + ' ' + (n ? Math.round(dn / n * 100) : 0) + '%</span>' + (o ? '<span style="color:var(--bad)">' + L(o + ' overdue', '逾期 ' + o) + '</span>' : '') + '</div></button>';
  }).join('') + '</div></section>';
  var rows = kidsOf('').map(function(n){
    var set = descOf(n.id), its = all.filter(function(i){ return set[i.node]; }); if(!its.length) return '';
    var dn = its.filter(isDone).length, o = its.filter(isOverdue).length, cm = its.filter(hasComments).length;
    return '<tr><td><button type="button" class="lnk" data-act="goNode" data-v="' + esc(n.id) + '"><span class="mono">' + esc(n.code || '') + '</span> ' + bi(n.en, n.zh) + '</button></td><td class="mono">' + its.length + '</td><td><div class="prog"><i><b style="width:' + (dn / its.length * 100) + '%"></b></i><span class="mono">' + dn + '</span></div></td><td class="mono" style="' + (o ? 'color:var(--bad);font-weight:600' : '') + '">' + o + '</td><td class="mono" style="' + (cm ? 'color:var(--bad)' : '') + '">' + cm + '</td></tr>';
  }).join('');
  function li(i, red){ var p = planOf(i); return '<div class="li"><button type="button" class="lnk" data-act="open" data-id="' + esc(i.id) + '" style="min-width:0"><span class="mono">' + esc(i.regNo) + '</span> ' + esc(title1(i)) + '</button><span class="mono" style="white-space:nowrap;' + (red ? 'color:var(--bad)' : '') + '">' + (p ? md(n2d(p.f)) : '') + '</span></div>'; }
  h += '<div class="dgrid"><section class="card" style="padding:14px"><h2 style="font-size:15px;margin-bottom:6px">' + L('By package', '按文件包') + '</h2><div style="overflow-x:auto"><table class="ptbl"><thead><tr><th>' + L('Package', '文件包') + '</th><th>' + L('Items', '数量') + '</th><th>' + L('Completed', '完成') + '</th><th>' + L('Overdue', '逾期') + '</th><th>' + L('Comments', '意见') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>' +
    '<section class="card" style="padding:14px"><h2 style="font-size:15px;margin-bottom:6px">' + L('Open comments', '未关闭意见') + '</h2><div class="list">' + (com.slice(0, 10).map(function(i){ return '<div class="li"><button type="button" class="lnk" data-act="open" data-id="' + esc(i.id) + '" style="min-width:0"><span class="mono">' + esc(i.regNo) + '</span> ' + esc(title1(i)) + '<span class="zh2">' + esc(String(i.remarks || '').slice(0, 80) || T('Owner feedback', '业主反馈')) + '</span></button><span class="rdot"></span></div>'; }).join('') || '<div class="li muted">' + L('No open comments', '没有未关闭意见') + '</div>') + '</div></section>' +
    '<section class="card" style="padding:14px"><h2 style="font-size:15px;margin-bottom:6px">' + L('Overdue', '已逾期') + '</h2><div class="list">' + (od.slice(0, 10).map(function(i){ return li(i, true); }).join('') || '<div class="li muted">' + L('Nothing overdue', '没有逾期项') + '</div>') + '</div></section>' +
    '<section class="card" style="padding:14px"><h2 style="font-size:15px;margin-bottom:6px">' + L('Due in the next 14 days', '未来 14 天到期') + '</h2><div class="list">' + (due.sort(function(a, b){ return planOf(a).f - planOf(b).f; }).slice(0, 10).map(function(i){ return li(i, false); }).join('') || '<div class="li muted">' + L('Nothing due', '暂无到期项') + '</div>') + '</div></section></div>';
  return h;
}

/* ===== Register ===== */
var COLS = [
  ['regNo','No.','序号'],['docNo','Doc. No.','文件编号'],['rev','Rev.','版本'],['class','Package','文件包'],['dept','Dept.','部门'],['title','Title','名称'],['disc','Discipline','专业'],
  ['areas','Block','区域'],['phase','Phase','提交阶段'],['window','Phase window','阶段窗口'],['start','Plan start','计划开始'],['finish','Plan finish','计划结束'],['actual','Actual submission','实际提交'],
  ['progress','Progress','完成率'],['status','Status','状态'],['explanation','Explanation','解释说明'],['remarks','Remarks / comments','备注 / 意见'],['contacts','Contacts','对接人'],
  ['updating','Latest update','最新更新'],['type','Type','类型'],['key','Key','重点'],['ownerResult','Owner result','业主结果'],['ext','External','对外']
];
function allCols(){ return COLS.concat((cfg().customFields || []).map(function(cf){ return ['c:' + cf.key, cf.en, cf.zh]; })); }
function visCols(){ var cf = (cfg().customFields || []).filter(function(x){ return x.inTable; }).map(function(x){ return 'c:' + x.key; }); return allCols().filter(function(c){ return S.cols.indexOf(c[0]) >= 0 || cf.indexOf(c[0]) >= 0; }); }
function sortVal(it, k){
  if(k === 'class') return (S._to[it.node] != null ? S._to[it.node] : 99999) * 1e6 + (parseInt(String(it.regNo).replace(/\D/g, ''), 10) || 0);
  if(k === 'title') return title1(it).toLowerCase();
  if(k === 'start' || k === 'finish'){ var p = planOf(it); return p ? (k === 'start' ? p.s : p.f) : 1e9; }
  if(k === 'actual') return d2n(it.actualStart) || 1e9;
  if(k === 'progress') return +it.progress || 0;
  if(k === 'status') return cfg().statuses.map(function(s){ return s.key; }).indexOf(it.status);
  if(k === 'phase' || k === 'window') return it.phase || 'zz';
  if(k === 'areas') return (it.areas || []).join(',') || 'zz';
  if(k === 'disc' || k === 'contacts') return (it[k] || []).join(',').toLowerCase() || 'zz';
  if(k === 'ext') return it.ownerVisible ? 0 : 1;
  if(k === 'key') return it.key ? 0 : 1;
  if(k === 'regNo'){ var m = /^(\D*)(\d+)/.exec(it.regNo || ''); return m ? m[1] + String(+m[2]).padStart(6, '0') : String(it.regNo || ''); }
  if(k.indexOf('c:') === 0) return String((it.custom || {})[k.slice(2)] || '');
  return String(it[k] || '').toLowerCase();
}
function viewRegister(){
  S._to = treeOrder();
  var list = filtered(), k = S.sort.k, d = S.sort.d;
  list.sort(function(a, b){ var x = sortVal(a, k), y = sortVal(b, k); return x < y ? -d : x > y ? d : 0; });
  var cols = visCols(), c = cfg(), ed = canEdit();
  var selIds = Object.keys(S.sel).filter(function(id){ return S.sel[id] && getItem(id); });
  var tp = '<aside class="card treep" aria-label="Packages"><div style="display:flex;justify-content:space-between;align-items:center;padding:4px 6px 8px"><b style="font-size:13px">' + L('Packages', '文件包') + '</b>' + (ed ? '<button type="button" class="btn sm" data-act="editTree">' + L('Edit', '编辑') + '</button>' : '') + '</div>';
  var cnt = function(id){ var set = descOf(id); return items().filter(function(i){ return set[i.node] && match(i, true); }).length; };
  tp += '<div class="tn' + (S.f.node === 'all' ? ' cur' : '') + '"><span class="tg"></span><button type="button" class="tl" data-act="tnode" data-v="all">' + L('All', '全部') + '</button><span class="ct">' + items().filter(function(i){ return match(i, true); }).length + '</span></div>';
  (function walk(pid, dep){ kidsOf(pid).forEach(function(n){
    var kn = kidsOf(n.id).length, open = !!S.exp[n.id];
    tp += '<div class="tn' + (S.f.node === n.id ? ' cur' : '') + '" style="padding-left:' + (dep * 14) + 'px">' + (kn ? '<button type="button" class="tg" data-act="texp" data-v="' + esc(n.id) + '" aria-expanded="' + open + '" aria-label="' + esc((open ? 'Collapse ' : 'Expand ') + n.en) + '">' + (open ? '▾' : '▸') + '</button>' : '<span class="tg"></span>') +
      '<button type="button" class="tl" data-act="tnode" data-v="' + esc(n.id) + '"><span class="mono" style="font-size:11px;color:var(--muted)">' + esc(n.code || '') + '</span> ' + L(n.en, n.zh) + '</button><span class="ct">' + cnt(n.id) + '</span></div>';
    if(kn && open) walk(n.id, dep + 1);
  }); })('', 0);
  var un = items().filter(function(i){ return (!i.node || !TI.by[i.node]) && match(i, true); }).length;
  if(un) tp += '<div class="tn' + (S.f.node === 'none' ? ' cur' : '') + '"><span class="tg"></span><button type="button" class="tl" data-act="tnode" data-v="none">' + L('Unclassified', '未分类') + '</button><span class="ct">' + un + '</span></div>';
  tp += '</aside>';
  var newMenu = ed ? '<details class="menu"><summary class="btn pri">+ ' + L('New', '新增') + '</summary><div class="pop">' + c.types.map(function(t){ return '<button type="button" data-act="new" data-v="' + esc(t.key) + '">' + L(t.en, t.zh) + '</button>'; }).join('') + '</div></details>' : '';
  var colMenu = '<details class="menu"><summary class="btn">' + L('Columns', '列') + '</summary><div class="pop">' + allCols().map(function(col){ return '<label><input type="checkbox" data-col="' + esc(col[0]) + '"' + (S.cols.indexOf(col[0]) >= 0 ? ' checked' : '') + '>' + L(col[1], col[2]) + '</label>'; }).join('') + '</div></details>';
  var h = '<div class="reg">' + tp + '<section class="regmain"><div class="bar-row"><div class="l"><h1 class="vtitle">' + L('Register', '总台账') + '</h1><span class="muted">' + L(list.length + ' items', list.length + ' 项') + '</span></div><div class="r">' +
    '<label class="fl row">' + L('Group', '分组') + '<select class="in" id="rgroup">' + GROUPS.map(function(g){ return '<option value="' + g[0] + '"' + (S.regGroup === g[0] ? ' selected' : '') + '>' + esc(T(g[1], g[2])) + '</option>'; }).join('') + '</select></label>' +
    '<button type="button" class="btn" data-act="density" aria-pressed="' + S.compact + '">' + L(S.compact ? 'Comfortable' : 'Compact', S.compact ? '宽松' : '紧凑') + '</button>' + colMenu +
    '<button type="button" class="btn" data-act="exportReg">' + L('Export Excel', '导出 Excel') + '</button>' + newMenu + '</div></div>';
  if(selIds.length && ed){
    var nodeOpts = ''; dfs(function(n, dd){ nodeOpts += '<option value="' + esc(n.id) + '">' + '  '.repeat(dd) + esc(nodeLabel(n)) + '</option>'; });
    function bs(f, first, opts){ return '<select class="in" data-bulk="' + f + '"><option value="">' + esc(first) + '</option>' + opts.map(function(o){ return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
    h += '<div class="bulk"><b>' + L(selIds.length + ' selected', '已选 ' + selIds.length) + '</b>' +
      bs('status', T('Set status…', '设定状态…'), c.statuses.map(function(s){ return [s.key, T(s.en, s.zh)]; })) +
      bs('phase', T('Set phase…', '设定阶段…'), c.phases.map(function(p){ return [p.code, p.code]; }).concat([['__clear', T('(no phase)', '（清除阶段）')]])) +
      bs('dept', T('Set department…', '设定部门…'), c.depts.map(function(x){ return [x.code, T(x.en, x.zh)]; })) +
      '<select class="in" data-bulk="node"><option value="">' + esc(T('Move to package…', '移动到文件包…')) + '</option>' + nodeOpts + '</select>' +
      bs('addArea', T('Add block…', '加入区域…'), c.areas.map(function(a){ return [a.id, T(a.en, a.zh)]; })) +
      bs('addContact', T('Add contact…', '加入对接人…'), peopleList().map(function(p){ return [p, p]; })) +
      bs('ext', T('External…', '对外…'), [['1', T('Show in owner plan', '显示于业主计划')], ['0', T('Internal only', '仅内部')]]) +
      bs('key', T('Key…', '重点…'), [['1', T('Mark ★', '标记 ★')], ['0', T('Unmark', '取消标记')]]) +
      (S.bulkDelAsk ? '<button type="button" class="btn sm danger" data-act="bulkDelYes">' + L('Confirm delete ' + selIds.length, '确认删除 ' + selIds.length + ' 项') + '</button><button type="button" class="btn sm" data-act="bulkDelNo">' + L('Cancel', '取消') + '</button>' : '<button type="button" class="btn sm danger" data-act="bulkDelAsk">' + L('Delete', '删除') + '</button>') +
      '<button type="button" class="btn sm" data-act="selNone">' + L('Clear selection', '取消选择') + '</button></div>';
  }
  if(!list.length){
    h += '<div class="card empty">' + (items().length ? L('No items match these filters.', '没有符合筛选条件的记录。') + '<button class="btn" data-act="clearf">' + L('Clear filters', '清除筛选') + '</button>' : L('The register is empty. Add an item with “+ New”, or import your Excel register in Settings › Project & data.', '总台账为空。点「新增」或在 设置 › 项目与数据 导入 Excel。')) + '</div></section></div>';
    return h;
  }
  var head = '<tr><th class="stk" style="width:34px"><input type="checkbox" id="selall" aria-label="Select all"' + (selIds.length && selIds.length >= list.length ? ' checked' : '') + '></th>' + cols.map(function(col, i){ var ar = S.sort.k === col[0] ? (S.sort.d > 0 ? ' ↑' : ' ↓') : ''; return '<th' + (i === 0 ? ' class="stk2"' : '') + '><button type="button" data-act="sort" data-v="' + esc(col[0]) + '">' + esc(S.lang === 'zh' ? col[2] : col[1]) + ar + (S.lang === 'both' ? '<br><span style="font-weight:400">' + esc(col[2]) + '</span>' : '') + '</button></th>'; }).join('') + '</tr>';
  var body = '';
  if(S.regGroup !== 'none'){
    groupItems(list, S.regGroup).forEach(function(g){
      var dn = g.items.filter(isDone).length;
      body += '<tr class="grp"><td class="stk"></td><td colspan="' + cols.length + '">' + (g.code ? '<span class="mono">' + esc(g.code) + '</span> ' : '') + L(g.en, g.zh) + ' <span class="muted mono" style="font-weight:400">· ' + dn + '/' + g.items.length + '</span>' + (ed && g.k !== '_n' && g.k !== 'MULTI' ? ' <button type="button" class="btn sm" data-act="gAdd" data-v="' + esc(g.k) + '" style="margin-left:6px">+ ' + L('Add here', '在此新增') + '</button>' : '') + '</td></tr>';
      g.items.forEach(function(it){ body += rowHTML(it, cols); });
    });
  } else list.forEach(function(it){ body += rowHTML(it, cols); });
  h += '<div class="card tbl-wrap"><table class="tbl' + (S.compact ? ' compact' : '') + '"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' +
    '<div class="note">' + (ed ? L('Click a cell to edit · Enter saves · Esc cancels · click the No. for every field · drag-free bulk edits: tick rows', '点单元格直接编辑 · Enter 保存 · Esc 取消 · 点序号查看全部字段 · 勾选多行可批量修改') : L('Read-only access.', '只读权限。')) + '</div></section></div>';
  return h;
}
function rowHTML(it, cols){
  var ed = canEdit(), cm = hasComments(it);
  var tds = cols.map(function(col, ci){
    var k = col[0];
    function E(f, inner, cls){ return '<td' + (ed ? ' data-ed="1"' : '') + ' class="' + (cls || '') + (ci === 0 ? ' stk2' : '') + '" data-id="' + esc(it.id) + '" data-f="' + esc(f) + '">' + inner + '</td>'; }
    function P(inner, cls){ return '<td class="' + (cls || '') + (ci === 0 ? ' stk2' : '') + '">' + inner + '</td>'; }
    if(k === 'regNo') return P('<button type="button" class="lnk mono" data-act="open" data-id="' + esc(it.id) + '" style="white-space:nowrap">' + esc(it.regNo || '—') + '</button>' + (cm ? '<span class="rdot" title="' + esc(T('Has comments', '有意见')) + '"></span>' : ''));
    if(k === 'docNo') return E('docNo', '<span class="mono" style="white-space:nowrap">' + esc(it.docNo || '—') + '</span>');
    if(k === 'rev') return E('rev', '<span class="mono">' + esc(it.rev || '—') + '</span>');
    if(k === 'class'){ var n = TI.by[it.node]; return E('node', n ? '<span class="mono" style="white-space:nowrap">' + esc(n.code || '') + '</span><span class="zh2" style="white-space:nowrap">' + esc(T(n.en, n.zh)) + '</span>' : '<span class="muted">—</span>'); }
    if(k === 'dept'){ var dp = deptOf(it.dept); return E('dept', dp ? '<span style="white-space:nowrap">' + L(dp.en, dp.zh) + '</span>' : '<span class="muted">—</span>'); }
    if(k === 'title') return E(S.lang === 'zh' ? 'zh' : 'en', bi(it.en, it.zh), 'w-title' + (it.key ? ' key' : ''));
    if(k === 'disc') return P(discTags(it.disc) || '<span class="muted">—</span>');
    if(k === 'areas') return P('<span style="white-space:nowrap">' + areaChips(it.areas) + '</span>');
    if(k === 'phase') return E('phase', it.phase ? '<span class="mono" style="white-space:nowrap">' + esc(it.phase) + '</span>' : '<span class="muted">—</span>');
    if(k === 'window') return P('<span class="mono" style="white-space:nowrap;font-size:12px">' + esc(phaseWindow(it.phase) || '—') + '</span>');
    if(k === 'start'){ return E('start', '<span class="mono">' + (it.start ? md(it.start) : (planOf(it) && planOf(it).fromPhase ? '<span class="muted">' + md(n2d(planOf(it).s)) + '</span>' : '—')) + '</span>'); }
    if(k === 'finish'){ var od = isOverdue(it); return E('finish', '<span class="mono">' + (it.finish ? md(it.finish) : (planOf(it) && planOf(it).fromPhase ? '<span class="muted">' + md(n2d(planOf(it).f)) + '</span>' : '—')) + (od ? ' !' : '') + '</span>', od ? 'od' : ''); }
    if(k === 'actual') return P('<span class="mono" style="white-space:nowrap;font-size:12px">' + esc(actualText(it) || '—') + '</span>');
    if(k === 'progress'){ var p = clamp(+it.progress || 0, 0, 100); return E('progress', '<div class="prog"><i><b style="width:' + p + '%"></b></i><span class="mono">' + p + '</span></div>'); }
    if(k === 'status') return E('status', statusChip(it.status));
    if(k === 'explanation') return E('explanation', esc(it.explanation || '') || '<span class="muted">—</span>', 'w-txt');
    if(k === 'remarks') return E('remarks', (it.remarks ? '<span style="' + (cm ? 'color:var(--bad)' : '') + '">' + esc(it.remarks) + '</span>' : '<span class="muted">—</span>') + (openFb(it.id) ? '<div class="chip c-red" style="margin-top:3px">' + L(openFb(it.id) + ' Owner feedback', '业主反馈 ' + openFb(it.id)) + '</div>' : ''), 'w-txt');
    if(k === 'contacts') return E('contacts', '<span style="font-size:12px">' + esc(contactsText(it) || '—') + '</span>');
    if(k === 'updating'){ var u = (it.updates || [])[ (it.updates || []).length - 1 ]; return P(u ? '<span class="mono muted" style="font-size:11px">' + esc(u.d || '') + '</span> <span style="font-size:12px">' + esc(String(u.text || '').slice(0, 120)) + '</span>' : '<span class="muted">—</span>', 'w-txt'); }
    if(k === 'type'){ var t = typeOf(it.type); return E('type', '<span style="white-space:nowrap">' + L(t.en, t.zh) + '</span>'); }
    if(k === 'key') return P('<button type="button" class="vis ' + (it.key ? 'on' : 'off') + '" data-act="togkey" data-id="' + esc(it.id) + '"' + (ed ? '' : ' disabled') + ' aria-pressed="' + !!it.key + '">' + (it.key ? '<span class="star">★</span>' : '☆') + '</button>');
    if(k === 'ownerResult'){ var o = orOf(it.ownerResult); return E('ownerResult', o ? chip(o.color, L(o.en, o.zh)) : '<span class="muted">—</span>'); }
    if(k === 'ext') return P('<button type="button" class="vis ' + (it.ownerVisible ? 'on' : 'off') + '" data-act="togvis" data-id="' + esc(it.id) + '"' + (ed ? '' : ' disabled') + '>' + (it.ownerVisible ? '● ' + esc(T('Owner', '业主可见')) : '○ ' + esc(T('Internal', '内部'))) + '</button>');
    if(k.indexOf('c:') === 0){ var v = (it.custom || {})[k.slice(2)]; return E(k, esc(v == null || v === '' ? '—' : v)); }
    return '<td></td>';
  }).join('');
  return '<tr class="' + (S.sel[it.id] ? 'sel' : '') + '"><td class="stk"><input type="checkbox" class="rowsel" data-id="' + esc(it.id) + '" aria-label="Select ' + esc(it.regNo) + '"' + (S.sel[it.id] ? ' checked' : '') + '></td>' + tds + '</tr>';
}
function editorHTML(f, it){
  var c = cfg();
  function sel(opts, val, blank){ return '<select class="in inl" data-inline="1" data-id="' + esc(it.id) + '" data-f="' + esc(f) + '">' + (blank ? '<option value="">—</option>' : '') + opts.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (val === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  function inp(type, val, extra){ return '<input class="in inl" data-inline="1" data-id="' + esc(it.id) + '" data-f="' + esc(f) + '" type="' + type + '" value="' + esc(val == null ? '' : val) + '"' + (extra || '') + '>'; }
  if(f === 'status') return sel(c.statuses.map(function(s){ return [s.key, T(s.en, s.zh)]; }), it.status);
  if(f === 'type') return sel(c.types.map(function(t){ return [t.key, T(t.en, t.zh)]; }), it.type);
  if(f === 'ownerResult') return sel(c.ownerResults.map(function(o){ return [o.key, T(o.en, o.zh)]; }), it.ownerResult, true);
  if(f === 'dept') return sel(c.depts.map(function(o){ return [o.code, T(o.en, o.zh)]; }), it.dept, true);
  if(f === 'phase') return sel(c.phases.map(function(o){ return [o.code, o.code + ' · ' + dmon(o.start) + '–' + dmon(o.end)]; }), it.phase, true);
  if(f === 'node'){ var o = []; dfs(function(n, d){ o.push([n.id, '  '.repeat(d) + nodeLabel(n)]); }); return sel(o, it.node, true); }
  if(f === 'start' || f === 'finish'){ var pl = planOf(it); return inp('date', it[f] || (pl ? n2d(f === 'start' ? pl.s : pl.f) : '')); }
  if(f === 'progress') return inp('number', it.progress || 0, ' min="0" max="100" step="5"');
  if(f === 'contacts') return inp('text', contactsText(it), ' list="dl-people" placeholder="A / B"');
  if(f.indexOf('c:') === 0){
    var cf = (c.customFields || []).filter(function(x){ return 'c:' + x.key === f; })[0] || {kind:'text'}; var v = (it.custom || {})[cf.key];
    if(cf.kind === 'select') return sel(String(cf.options || '').split(',').map(function(s){ s = s.trim(); return [s, s]; }).filter(function(x){ return x[0]; }), v, true);
    return inp(cf.kind === 'number' ? 'number' : cf.kind === 'date' ? 'date' : 'text', v);
  }
  return inp('text', it[f]);
}
function commitInline(el){
  if(el._done) return; el._done = true;
  var id = el.dataset.id, f = el.dataset.f, v = el.value;
  if(S.inlineCancel){ S.inlineCancel = false; S.pv = false; renderView(); return; }
  var it = getItem(id); if(!it){ renderView(); return; }
  if(f === 'progress'){ v = clamp(Math.round(+v || 0), 0, 100); var o0 = {progress:v}; if(v === 100){ var dk = (cfg().statuses.filter(function(s){ return s.done; })[0] || {}).key; if(dk && !isDone(it)) o0.status = dk; } setFields(id, o0); }
  else if(f === 'contacts') setField(id, 'contacts', splitList(v));
  else if(f.indexOf('c:') === 0){ var cus = Object.assign({}, it.custom || {}); var cf = (cfg().customFields || []).filter(function(x){ return 'c:' + x.key === f; })[0]; cus[f.slice(2)] = cf && cf.kind === 'number' && v !== '' ? +v : v; setFields(id, {custom:cus}); }
  else if(f === 'start' || f === 'finish') setFields(id, dateFix(it, f, v));
  else if(f === 'status'){ var o1 = {status:v}; if(statusOf(v).done) o1.progress = 100; setFields(id, o1); }
  else setField(id, f, v);
  S.pv = false; renderView();
}
function dateFix(it, f, v){
  var o = {}; o[f] = v;
  if(typeOf(it.type).shape === 'milestone'){ o.start = v; o.finish = v; return o; }
  var pl = planOf(it);
  if(f === 'start' && !it.finish && pl) o.finish = n2d(pl.f);
  if(f === 'finish' && !it.start && pl) o.start = n2d(pl.s);
  var s = d2n(o.start || it.start), e = d2n(o.finish || it.finish);
  if(f === 'start' && v && e != null && d2n(v) > e) o.finish = v;
  if(f === 'finish' && v && s != null && d2n(v) < s) o.start = v;
  return o;
}

/* ===== Gantt ===== */
var PX = {day:24, week:8, month:2.6};
var GL_FULL = [['regNo','No.','序号',62],['title','Task / Document','任务 / 文件',250],['areas','Block','区域',58],['start','Start','计划开始',80],['finish','Finish','计划结束',80],['progress','%','完成率',50],['status','Status','状态',112]];
var GL_COMPACT = [['regNo','No.','序号',58],['title','Task / Document','任务 / 文件',190]];
function gLeft(){ var m = S.g.left; if(m === 'auto') m = window.innerWidth < 960 ? 'compact' : 'full'; return m === 'compact' ? GL_COMPACT : GL_FULL; }
function viewGantt(){
  var c = cfg(), g = S.g, px = PX[g.zoom] || 8, ed = canEdit(), A = ASOFN();
  var list = filtered();
  list.sort(function(a, b){ var pa = planOf(a), pb = planOf(b); return (pa ? pa.s : 1e9) - (pb ? pb.s : 1e9) || sortVal(a, 'regNo').localeCompare(sortVal(b, 'regNo')); });
  var lo = Infinity, hi = -Infinity;
  list.forEach(function(it){ var p = planOf(it); if(p){ lo = Math.min(lo, p.s); hi = Math.max(hi, p.f); } [it.actualStart, it.actualEnd, it.baseStart, it.baseFinish].forEach(function(s){ var n = d2n(s); if(n != null){ lo = Math.min(lo, n); hi = Math.max(hi, n); } }); });
  if(!isFinite(lo)){ lo = A - 14; hi = A + 60; }
  var gs = d2n(c.ganttStart), mn = gs != null ? gs : Math.min(lo, A) - 7;
  var mx = Math.max(hi, A) + 21, ncol = Math.ceil((mx - mn + 1) / 7); mx = mn + ncol * 7 - 1;
  var W = Math.ceil((mx - mn + 1) * px);
  S.gm = {px:px, mn:mn};
  var LC = gLeft(), LW = LC.reduce(function(s, x){ return s + x[3]; }, 0), tpl = LC.map(function(x){ return x[3] + 'px'; }).join(' ');
  var colW = (g.zoom === 'day' ? px : 7 * px);
  var grid = 'width:' + W + 'px;overflow:hidden;background-size:' + colW + 'px 100%';
  function seg(name, val, opts){ return '<div class="seg" role="group" aria-label="' + name + '">' + opts.map(function(o){ return '<button type="button" data-act="g' + name + '" data-v="' + o[0] + '" aria-pressed="' + (val === o[0]) + '">' + L(o[1], o[2]) + '</button>'; }).join('') + '</div>'; }
  function sel(id, val, opts){ return '<select class="in" id="' + id + '">' + opts.map(function(o){ return '<option value="' + o[0] + '"' + (val === o[0] ? ' selected' : '') + '>' + esc(T(o[1], o[2])) + '</option>'; }).join('') + '</select>'; }
  var h = '<div class="bar-row"><div class="l"><h1 class="vtitle">' + L('Gantt', '甘特图') + '</h1><span class="muted">' + L(list.length + ' items', list.length + ' 项') + '</span></div><div class="r">' +
    '<label class="fl row">' + L('Timeline start', '时间轴起始') + '<input class="in" type="date" id="gStart" value="' + esc(c.ganttStart || '') + '"' + (ed ? '' : ' disabled') + ' title="' + esc(T('Blank = automatic', '留空 = 自动')) + '"></label>' +
    '<label class="fl row" style="color:var(--asof)">' + L('Status date', '状态日期') + '<input class="in" type="date" id="gAsOf" value="' + esc(n2d(A)) + '"></label>' +
    seg('zoom', g.zoom, [['day','Day','日'],['week','Week','周'],['month','Month','月']]) + '</div></div>';
  h += '<div class="bar-row"><div class="l">' +
    '<label class="fl row">' + L('Group', '分组') + sel('ggroup', g.group, GROUPS) + '</label>' +
    '<label class="fl row">' + L('Colour', '颜色') + sel('gcolor', g.color, [['pp','Plan · progress · delay','计划 · 完成 · 延误'],['status','Status','状态'],['area','Block','区域']]) + '</label>' +
    '<label class="fl row">' + L('Left columns', '左侧列') + sel('gleftc', g.left, [['auto','Auto','自动'],['full','All','全部'],['compact','No. + task','序号 + 任务']]) + '</label>' +
    '<label class="chk"><input type="checkbox" id="gph"' + (g.phases ? ' checked' : '') + '>' + L('Phase windows', '阶段窗口') + '</label></div><div class="r">' +
    '<button type="button" class="btn" data-act="gToAsOf">' + L('Go to status date', '跳到状态日期') + '</button>' +
    (ed ? '<button type="button" class="btn" data-act="baseline">' + L('Save baseline', '保存基线') + '</button>' : '') +
    '<button type="button" class="btn" data-act="exportReg">' + L('Export Excel', '导出 Excel') + '</button>' +
    (ed ? '<details class="menu"><summary class="btn pri">+ ' + L('New', '新增') + '</summary><div class="pop">' + c.types.map(function(t){ return '<button type="button" data-act="new" data-v="' + esc(t.key) + '">' + L(t.en, t.zh) + '</button>'; }).join('') + '</div></details>' : '') + '</div></div>';
  var leg;
  if(g.color === 'pp') leg = '<span><i class="g-b"></i>' + L('Plan', '计划') + '</span><span><i class="g-g"></i>' + L('Progress (completion converted)', '完成率换算') + '</span><span><i class="g-x"></i>' + L('Delay', '延误') + '</span><span><i style="box-shadow:0 0 0 2px var(--gp-red);background:transparent"></i>' + L('Has comments', '有意见') + '</span>';
  else if(g.color === 'status') leg = c.statuses.map(function(s){ return '<span><i class="cb-' + esc(s.color) + '"></i>' + L(s.en, s.zh) + '</span>'; }).join('');
  else leg = c.areas.map(function(a){ return '<span><i class="cb-' + esc(a.color) + '"></i>' + L(a.en, a.zh) + '</span>'; }).join('') + '<span><i class="cb-grey"></i>' + L('Several / site-wide', '多区域 / 全场') + '</span>';
  leg += '<span><i style="background:var(--asof);width:3px"></i>' + L('Status date', '状态日期') + '</span><span><i style="border:1px dashed var(--muted);background:transparent"></i>' + L('Phase window', '阶段窗口') + '</span><span><i style="background:var(--ink2);height:3px"></i>' + L('Actual submission', '实际提交') + '</span><span><i style="background:var(--ms);border-radius:50%;width:10px;height:10px"></i>' + L('Milestone', '里程碑') + '</span>' + (ed ? '<span>· ' + L('Drag bars to move, drag ends to resize, or type dates in the left columns', '拖动条形移动，拖两端改起止，或在左侧直接改日期') + '</span>' : '');
  h += '<div class="legend">' + leg + '</div>';
  if(!list.length){ h += '<div class="card empty">' + L('No items with these filters.', '没有符合筛选条件的记录。') + (ed ? '<button class="btn pri" data-act="new" data-v="activity">+ ' + L('Add an activity', '新增活动') + '</button>' : '') + '</div>'; return h; }
  // header
  var ticks = '', lastM = -1;
  for(var col = 0; col < Math.ceil((mx - mn + 1) / (g.zoom === 'day' ? 1 : 7)); col++){
    var n = mn + col * (g.zoom === 'day' ? 1 : 7), dt = new Date(n * 864e5), x = (n - mn) * px;
    if(dt.getUTCMonth() !== lastM){ lastM = dt.getUTCMonth(); ticks += '<div class="tick m" style="left:' + x + 'px">' + esc(S.lang === 'zh' ? dt.getUTCFullYear() + '年' + (dt.getUTCMonth() + 1) + '月' : MON[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear()) + '</div>'; }
    if(g.zoom === 'day') ticks += '<div class="tick w" style="left:' + x + 'px;width:' + px + 'px;padding-left:2px' + ((n + 3) % 7 >= 5 ? ';color:var(--bad)' : '') + '">' + dt.getUTCDate() + '</div>';
    else if(g.zoom === 'week') ticks += '<div class="tick w" style="left:' + x + 'px;width:' + colW + 'px">' + pad(dt.getUTCDate()) + '</div>';
    else if(col % 2 === 0) ticks += '<div class="tick w" style="left:' + x + 'px">' + pad(dt.getUTCDate()) + '</div>';
  }
  var hh = 40;
  if(g.phases && c.phases.length){ hh = 60; c.phases.forEach(function(p){ var s = d2n(p.start), e = d2n(p.end); if(s == null || e == null || e < mn || s > mx) return; ticks += '<div class="phb" style="left:' + ((Math.max(s, mn) - mn) * px) + 'px;width:' + Math.max(16, (Math.min(e, mx) - Math.max(s, mn) + 1) * px - 2) + 'px" title="' + esc(p.code + ' ' + p.start + ' → ' + p.end) + '">' + esc(p.code) + '</div>'; }); }
  var asofX = (A - mn) * px, todayX = (TODAY - mn) * px;
  var lines = '<div class="asof" style="left:' + asofX + 'px"></div>' + (TODAY !== A ? '<div class="today" style="left:' + todayX + 'px"></div>' : '');
  var body = '<div class="grow ghead"><div class="gleft" style="width:' + LW + 'px;grid-template-columns:' + tpl + '">' + LC.map(function(x){ return '<div class="gc">' + (S.lang === 'zh' ? esc(x[2]) : esc(x[1]) + (S.lang === 'both' ? '<span>' + esc(x[2]) + '</span>' : '')) + '</div>'; }).join('') + '</div><div class="gt" style="' + grid + ';height:' + hh + 'px">' + ticks + lines + '</div></div>';
  var groups = g.group === 'none' ? [{k:'all', items:list}] : groupItems(list, g.group);
  groups.forEach(function(gr){
    if(g.group !== 'none'){
      var smn = Infinity, smx = -Infinity; gr.items.forEach(function(it){ var p = planOf(it); if(p){ smn = Math.min(smn, p.s); smx = Math.max(smx, p.f); } });
      var colp = !!S.gcol[gr.k], dn = gr.items.filter(isDone).length;
      body += '<div class="grow ggrp"><div class="gleft" style="width:' + LW + 'px;grid-template-columns:' + tpl + '"><div class="gspan"><button type="button" class="glb" data-act="gcol" data-v="' + esc(gr.k) + '" aria-expanded="' + !colp + '"><b>' + (colp ? '▸ ' : '▾ ') + (gr.code ? '<span class="mono">' + esc(gr.code) + '</span> ' : '') + esc(S.lang === 'zh' ? (gr.zh || gr.en) : gr.en) + '</b>' + (S.lang === 'both' && gr.zh ? ' <span class="zh">' + esc(gr.zh) + '</span>' : '') + ' <span class="muted mono" style="font-weight:400;font-size:12px">' + dn + '/' + gr.items.length + '</span></button>' + (ed && gr.k !== '_n' && gr.k !== 'MULTI' ? '<button type="button" class="btn sm" data-act="gAdd" data-v="' + esc(gr.k) + '">+</button>' : '') + '</div></div><div class="gt" style="' + grid + '">' + lines + (isFinite(smn) ? '<div class="sum" style="left:' + ((smn - mn) * px) + 'px;width:' + Math.max(px, (smx - smn + 1) * px) + 'px"></div>' : '') + '</div></div>';
      if(colp) return;
    }
    gr.items.forEach(function(it){ body += ganttRow(it, mn, px, grid, lines, LC, LW, tpl, A); });
  });
  if(ed) body += '<div class="grow"><div class="gleft" style="width:' + LW + 'px;grid-template-columns:' + tpl + '"><div class="gspan"><input class="in" id="gQuick" placeholder="' + esc(T('+ Type a new activity and press Enter', '+ 输入新活动名称后按 Enter')) + '" style="flex:1;min-width:0"></div></div><div class="gt" style="' + grid + '">' + lines + '</div></div>';
  h += '<div class="card gwrap"><div class="gin">' + body + '</div></div>';
  return h;
}
function ganttRow(it, mn, px, grid, lines, LC, LW, tpl, A){
  var ed = canEdit(), p = planOf(it), t = typeOf(it.type), cm = hasComments(it), od = isOverdue(it);
  var left = LC.map(function(col){
    var k = col[0];
    function E(f, inner, cls){ return '<div class="gc ' + (cls || '') + '"' + (ed ? ' data-ed="1"' : '') + ' data-id="' + esc(it.id) + '" data-f="' + esc(f) + '">' + inner + '</div>'; }
    if(k === 'regNo') return '<div class="gc"><button type="button" class="glb mono" data-act="open" data-id="' + esc(it.id) + '">' + esc(it.regNo) + '</button>' + (cm ? '<span class="rdot"></span>' : '') + '</div>';
    if(k === 'title') return E(S.lang === 'zh' ? 'zh' : 'en', '<span style="min-width:0"><span class="tt">' + esc(title1(it)) + '</span>' + (S.lang === 'both' && it.zh && it.en ? '<span class="ts">' + esc(it.zh) + '</span>' : '') + '</span>', 't' + (it.key ? ' key' : ''));
    if(k === 'areas') return '<div class="gc" data-act="open" data-id="' + esc(it.id) + '" style="cursor:pointer">' + areaChips(it.areas) + '</div>';
    if(k === 'start') return E('start', '<span class="mono">' + (it.start ? md(it.start) : p ? '<span class="muted" title="' + esc(T('From phase window', '取自阶段窗口')) + '">' + md(n2d(p.s)) + '</span>' : '—') + '</span>');
    if(k === 'finish') return E('finish', '<span class="mono" style="' + (od ? 'color:var(--bad);font-weight:600' : '') + '">' + (it.finish ? md(it.finish) : p ? '<span class="muted">' + md(n2d(p.f)) + '</span>' : '—') + '</span>');
    if(k === 'progress') return E('progress', '<span class="mono">' + clamp(+it.progress || 0, 0, 100) + '%</span>');
    if(k === 'status') return E('status', statusChipShort(it.status));
    return '<div class="gc"></div>';
  }).join('');
  var tr = lines;
  var ph = phaseOf(it.phase);
  if(ph && S.g.phases){ var ps = d2n(ph.start), pe = d2n(ph.end); tr += '<div class="pw" style="left:' + ((ps - mn) * px) + 'px;width:' + Math.max(4, (pe - ps + 1) * px) + 'px" title="' + esc(ph.code + ' ' + ph.start + ' → ' + ph.end) + '"></div>'; }
  if(it.baseStart && it.baseFinish){ var bs = d2n(it.baseStart), bf = d2n(it.baseFinish); tr += '<div class="bsl" style="left:' + ((bs - mn) * px) + 'px;width:' + Math.max(3, (bf - bs + 1) * px) + 'px" title="' + esc(T('Baseline', '基线') + ' ' + it.baseStart + ' → ' + it.baseFinish) + '"></div>'; }
  if(it.actualStart){ var as = d2n(it.actualStart), ae = d2n(it.actualEnd) != null ? d2n(it.actualEnd) : (it.ongoing ? A : as); tr += '<div class="act" style="left:' + ((as - mn) * px) + 'px;width:' + Math.max(3, (ae - as + 1) * px) + 'px" title="' + esc(T('Actual submission', '实际提交') + ' ' + actualText(it)) + '"></div>'; }
  if(!p) tr += '<span class="bl" style="left:8px">' + L('No dates — set start/finish or a phase', '未设日期，请填写起止或阶段') + '</span>';
  else {
    var tip = esc(it.regNo + ' · ' + title1(it) + ' · ' + n2d(p.s) + ' → ' + n2d(p.f) + (p.fromPhase ? ' (' + it.phase + ')' : '') + ' · ' + (+it.progress || 0) + '% · ' + T(statusOf(it.status).en, statusOf(it.status).zh) + (cm ? ' · ' + T('has comments', '有意见') : ''));
    if(t.shape === 'milestone'){
      var x = (p.f - mn) * px + px / 2 - 7;
      tr += '<div class="ms' + (cm ? ' cm' : '') + '" data-id="' + esc(it.id) + '" data-ms="1" data-act="open" style="left:' + x + 'px" title="' + tip + '"></div><span class="bl" style="left:' + (x + 20) + 'px">' + esc(dmon(n2d(p.f))) + '</span>';
    } else {
      var l = (p.s - mn) * px, w = Math.max(px, (p.f - p.s + 1) * px), prog = clamp(+it.progress || 0, 0, 100), inner = '', extra = '';
      if(S.g.color === 'pp'){
        var dur = p.f - p.s + 1, de = isDone(it) ? p.f + 1 : p.s + dur * prog / 100, segs = [];
        if(isDone(it)) segs.push([p.s, p.f + 1, 'g']);
        else {
          if(de > p.s) segs.push([p.s, de, 'g']);
          var be = Math.min(A, p.f + 1); if(be > de) segs.push([de, be, 'x']);
          var rs = Math.max(de, A); if(p.f + 1 > rs) segs.push([rs, p.f + 1, 'b']);
          if(A > p.f + 1) extra = '<div class="ovr" style="left:' + (l + w) + 'px;width:' + ((A - p.f - 1) * px) + 'px"></div>';
        }
        inner = segs.map(function(sg){ return '<div class="sg g-' + sg[2] + '" style="left:' + ((sg[0] - p.s) * px) + 'px;width:' + Math.max(1, (sg[1] - sg[0]) * px) + 'px"></div>'; }).join('');
        tr += '<div class="bw' + (cm ? ' cm' : '') + '" data-id="' + esc(it.id) + '" data-act="open" style="left:' + l + 'px;width:' + w + 'px;' + (p.fromPhase ? 'opacity:.75' : '') + '" title="' + tip + '">' + inner + (ed ? '<span class="h l"></span><span class="h r"></span>' : '') + '</div>' + extra;
      } else {
        var colr = S.g.color === 'area' ? ((it.areas || []).length === 1 ? areaOf(it.areas[0]).color : 'grey') : statusOf(it.status).color;
        tr += '<div class="bw solid cb-' + esc(colr) + (cm ? ' cm' : '') + '" data-id="' + esc(it.id) + '" data-act="open" style="left:' + l + 'px;width:' + w + 'px" title="' + tip + '"><div class="pf" style="width:' + prog + '%"></div>' + (ed ? '<span class="h l"></span><span class="h r"></span>' : '') + '</div>';
      }
      var lx = l + w + 6 + (extra ? (A - p.f - 1) * px : 0);
      tr += '<span class="bl" style="left:' + lx + 'px">' + prog + '%' + (cm ? ' <span style="color:var(--gp-red)">● ' + esc(T('comments', '有意见')) + '</span>' : '') + (it.deps && it.deps.length ? ' · ' + esc(T('after ', '前置 ') + it.deps.join(', ')) : '') + '</span>';
    }
  }
  return '<div class="grow"><div class="gleft" style="width:' + LW + 'px;grid-template-columns:' + tpl + '">' + left + '</div><div class="gt" style="' + grid + '">' + tr + '</div></div>';
}
/* drag on gantt */
var DR = null;
document.addEventListener('pointerdown', function(e){
  var bar = e.target.closest && e.target.closest('.bw,.ms'); if(!bar || !canEdit() || e.button !== 0 || !S.gm) return;
  var it = getItem(bar.dataset.id); if(!it) return; var p = planOf(it); if(!p) return;
  var hEl = e.target.closest('.h');
  DR = {it:it, p:p, bar:bar, mode: bar.dataset.ms ? 'm' : (hEl ? (hEl.classList.contains('l') ? 'l' : 'r') : 'm'), x0:e.clientX, l0:parseFloat(bar.style.left) || 0, w0:parseFloat(bar.style.width) || 14, moved:false, dd:0};
  try{ bar.setPointerCapture(e.pointerId); }catch(_){}
});
document.addEventListener('pointermove', function(e){
  if(!DR) return; var dx = e.clientX - DR.x0; if(!DR.moved && Math.abs(dx) < 4) return; DR.moved = true;
  var px = S.gm.px, dd = Math.round(dx / px), s = DR.p.s, f = DR.p.f, ns = s, nf = f; DR.dd = dd;
  if(DR.bar.dataset.ms){ ns = nf = f + dd; DR.bar.style.left = (DR.l0 + dd * px) + 'px'; }
  else if(DR.mode === 'm'){ DR.bar.style.left = (DR.l0 + dd * px) + 'px'; ns = s + dd; nf = f + dd; }
  else if(DR.mode === 'l'){ ns = Math.min(s + dd, f); DR.bar.style.left = (DR.l0 + (ns - s) * px) + 'px'; DR.bar.style.width = (DR.w0 - (ns - s) * px) + 'px'; }
  else { nf = Math.max(f + dd, s); DR.bar.style.width = (DR.w0 + (nf - f) * px) + 'px'; }
  DR.ns = ns; DR.nf = nf;
  var hint = $('#dhint'); hint.hidden = false; hint.textContent = n2d(ns) + ' → ' + n2d(nf) + '  (' + (nf - ns + 1) + 'd)'; hint.style.left = (e.clientX + 12) + 'px'; hint.style.top = (e.clientY - 30) + 'px';
});
function endDrag(){
  if(!DR) return; var d = DR; DR = null; $('#dhint').hidden = true;
  if(!d.moved) return; S.suppressOpen = Date.now();
  if(!d.dd){ renderView(); return; }
  setFields(d.it.id, {start:n2d(d.ns), finish:n2d(d.nf)}).then(function(){ toast(T('Dates updated', '日期已更新') + ': ' + d.it.regNo + ' ' + n2d(d.ns) + ' → ' + n2d(d.nf)); });
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

/* ===== Owner plan (internal) and owner portal ===== */
var OF = [['docNo','Document No.','文件编号'],['regNo','No.','序号'],['rev','Revision','版本'],['title','Title','名称'],['class','Package','文件包'],['dept','Department','部门'],['disc','Discipline','专业'],['areas','Block','区域'],['phase','Submission phase','提交阶段'],['window','Phase window','阶段窗口'],['start','Planned start','计划开始'],['finish','Committed date','承诺日期'],['actual','Actual submission','实际提交'],['status','Status','状态'],['progress','Progress','完成率'],['explanation','Explanation','解释说明'],['ownerResult','Owner result','业主结果'],['extNote','Remarks','对外备注']];
function ownerVal(it, k){
  if(k === 'title') return {en:it.en || '', zh:it.zh || ''};
  if(k === 'class'){ var n = TI.by[it.node]; return n ? {en:(n.code ? n.code + ' ' : '') + n.en, zh:n.zh || ''} : {en:'', zh:''}; }
  if(k === 'dept'){ var d = deptOf(it.dept); return d ? {en:d.en, zh:d.zh} : {en:'', zh:''}; }
  if(k === 'disc') return {en:(it.disc || []).map(function(x){ return discOf(x).en; }).join(', '), zh:(it.disc || []).map(function(x){ return discOf(x).zh; }).join('、')};
  if(k === 'areas'){ var a = it.areas || []; return a.length ? {en:a.map(function(x){ return areaOf(x).en; }).join(', '), zh:a.map(function(x){ return areaOf(x).zh; }).join('、')} : {en:'Site-wide', zh:'全场'}; }
  if(k === 'window') return {en:phaseWindow(it.phase), zh:''};
  if(k === 'start'){ var p = planOf(it); return {en:p ? n2d(p.s) : '', zh:''}; }
  if(k === 'finish'){ var p2 = planOf(it); return {en:p2 ? n2d(p2.f) : '', zh:''}; }
  if(k === 'actual') return {en:it.actualStart ? (it.actualStart + ' → ' + (it.actualEnd || (it.ongoing ? 'ongoing' : ''))) : '', zh:it.ongoing && !it.actualEnd && it.actualStart ? '进行中' : ''};
  if(k === 'status'){ var s = statusOf(it.status); return {en:s.en, zh:s.zh}; }
  if(k === 'ownerResult'){ var o = orOf(it.ownerResult); return o ? {en:o.en, zh:o.zh} : {en:'', zh:''}; }
  if(k === 'progress') return {en:(+it.progress || 0) + '%', zh:''};
  return {en:String(it[k] == null ? '' : it[k]), zh:''};
}
function ownerGroups(list, fields){
  S._to = treeOrder();
  return groupItems(list.slice().sort(function(a, b){ return sortVal(a, 'class') - sortVal(b, 'class'); }), 'class').map(function(g){
    return {code:g.code, en:g.en, zh:g.zh, rows:g.items.map(function(it){ return {ref:{id:it.id, regNo:it.regNo}, cells:fields.map(function(f){ return ownerVal(it, f); })}; })};
  });
}
function ownerTable(groups, fields, opts){
  opts = opts || {};
  var monoK = {docNo:1, regNo:1, start:1, finish:1, rev:1, progress:1, phase:1, window:1, actual:1};
  return groups.map(function(g){
    return '<section style="display:flex;flex-direction:column;gap:8px"><h3 style="font-size:15px"><span class="mono">' + esc(g.code) + '</span> ' + L(g.en, g.zh) + ' <span class="muted mono" style="font-weight:400;font-size:12px">' + g.rows.length + '</span></h3><div class="card tbl-wrap" style="max-height:none"><table class="tbl"><thead><tr>' + fields.map(function(f){ var d = OF.filter(function(o){ return o[0] === f; })[0] || [f, f, '']; return '<th>' + esc(S.lang === 'zh' ? d[2] : d[1]) + (S.lang === 'both' ? '<br><span style="font-weight:400">' + esc(d[2]) + '</span>' : '') + '</th>'; }).join('') + (opts.feedback ? '<th></th>' : '') + '</tr></thead><tbody>' +
      g.rows.map(function(r){
        var cells = r.cells || r;
        var tr = '<tr>' + cells.map(function(v, i){ return '<td' + (monoK[fields[i]] ? ' class="mono" style="white-space:nowrap;font-size:12px"' : '') + '>' + (S.lang === 'zh' ? esc(v.zh || v.en || '—') : esc(v.en || '—') + (S.lang === 'both' && v.zh ? '<span class="zh2">' + esc(v.zh) + '</span>' : '')) + '</td>'; }).join('');
        if(opts.feedback && r.ref){
          var fbs = ((STORE && STORE.fb) || []).filter(function(f){ return f.item_id === r.ref.id; });
          tr += '<td style="white-space:nowrap"><button type="button" class="btn sm" data-act="fbOpen" data-v="' + esc(r.ref.id) + '">' + L('Comment', '意见') + (fbs.length ? ' (' + fbs.length + ')' : '') + '</button></td>';
        }
        tr += '</tr>';
        if(opts.feedback && r.ref && S.fbFor === r.ref.id){
          var list = ((STORE && STORE.fb) || []).filter(function(f){ return f.item_id === r.ref.id; });
          tr += '<tr><td colspan="' + (cells.length + 1) + '" style="background:var(--surface2)"><div style="display:flex;flex-direction:column;gap:8px;max-width:760px">' + list.map(fbHTML).join('') +
            '<form id="fFb" data-item="' + esc(r.ref.id) + '" data-reg="' + esc(r.ref.regNo) + '" style="display:flex;flex-direction:column;gap:6px"><label class="fl">' + L('Your comment on ' + r.ref.regNo, '对 ' + r.ref.regNo + ' 的意见') + '<textarea class="in" id="fbBody" required></textarea></label><div style="display:flex;gap:8px"><button class="btn pri" type="submit">' + L('Send', '提交') + '</button><button class="btn" type="button" data-act="fbClose">' + L('Close', '关闭') + '</button></div></form></div></td></tr>';
        }
        return tr;
      }).join('') + '</tbody></table></div></section>';
  }).join('');
}
function fbHTML(f){
  var it = getItem(f.item_id);
  return '<div class="fb' + (f.status === 'open' ? ' open' : '') + '"><div class="meta">' + esc(f.author_name || '') + ' · <span class="mono">' + esc(String(f.created_at || '').replace('T', ' ').slice(0, 16)) + '</span> · ' + (f.reg_no ? '<span class="mono">' + esc(f.reg_no) + '</span> · ' : '') + (f.status === 'open' ? '<span style="color:var(--bad)">' + L('Open', '待处理') + '</span>' : '<span style="color:var(--ok)">' + L('Resolved', '已关闭') + '</span>') + '</div><div style="white-space:pre-wrap">' + esc(f.body) + '</div>' + (f.reply ? '<div class="rep">' + esc(f.reply) + '</div>' : '') +
    (canEdit() && f.status === 'open' ? '<form class="fbReply" data-id="' + esc(f.id) + '" style="display:flex;gap:6px;flex-wrap:wrap"><input class="in" name="reply" placeholder="' + esc(T('Reply (optional)', '回复（可选）')) + '" style="flex:1 1 220px"><button class="btn sm pri" type="submit">' + L('Reply & resolve', '回复并关闭') + '</button>' + (it ? '<button type="button" class="btn sm" data-act="open" data-id="' + esc(it.id) + '">' + L('Open item', '打开记录') + '</button>' : '') + '</form>' : '') + '</div>';
}
function viewOwner(){
  var c = cfg(), fields = (c.ownerFields || []).filter(function(f){ return OF.some(function(o){ return o[0] === f; }); });
  var pubs = ((STORE && STORE.pubs) || []).slice().sort(function(a, b){ return String(b.no).localeCompare(String(a.no)); });
  var fbs = ((STORE && STORE.fb) || []).slice().sort(function(a, b){ return (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || String(b.created_at).localeCompare(String(a.created_at)); });
  var openN = fbs.filter(function(f){ return f.status === 'open'; }).length;
  var tabs = '<div class="seg" role="tablist">' + [['live','Live plan','实时计划'],['snaps','Published (' + pubs.length + ')','已发布 (' + pubs.length + ')'],['fb','Owner feedback (' + openN + ' open)','业主反馈（' + openN + ' 待处理）']].map(function(t){ return '<button type="button" data-act="otab" data-v="' + t[0] + '" aria-pressed="' + (S.otab === t[0]) + '">' + L(t[1], t[2]) + '</button>'; }).join('') + '</div>';
  var h = '<div class="bar-row"><div class="l"><h1 class="vtitle">' + L('Owner plan', '业主计划') + '</h1>' + tabs + '</div></div>';
  if(S.otab === 'fb'){
    return h + '<div class="note">' + L('Comments the Owner leaves on published rows arrive here. An open comment marks the item red in the register and Gantt until you resolve it.', '业主在已发布计划上留下的意见会出现在这里；未关闭的意见会让该记录在总台账和甘特图标红。') + '</div>' + (fbs.length ? '<div style="display:flex;flex-direction:column;gap:8px;max-width:900px">' + fbs.map(fbHTML).join('') + '</div>' : '<div class="card empty">' + L('No feedback yet.', '还没有反馈。') + '</div>');
  }
  if(S.otab === 'snaps'){
    if(S.snapView){
      var sn = pubs.filter(function(s){ return s.id === S.snapView; })[0];
      if(sn) return h + '<div class="bar-row"><div class="l"><b class="mono">' + esc(sn.no) + '</b><span class="muted mono">' + esc(String(sn.at || '').replace('T', ' ').slice(0, 16)) + '</span><span class="muted">' + esc(sn.note || '') + '</span></div><div class="r"><button type="button" class="btn" data-act="snapBack">' + L('All publications', '全部发布') + '</button><button type="button" class="btn pri" data-act="snapExport" data-v="' + esc(sn.id) + '">' + L('Export Excel', '导出 Excel') + '</button></div></div>' + ownerTable(sn.groups || [], sn.fields || []);
      S.snapView = null;
    }
    return h + '<div class="note">' + L('Each publication is a fixed snapshot. People with the Owner role see these (and only these) when they sign in.', '每次发布都是固定快照；业主角色登录后只能看到这些发布内容。') + '</div>' + (pubs.length ? '<div class="card" style="overflow-x:auto"><table class="ptbl"><thead><tr><th>' + L('No.', '编号') + '</th><th>' + L('Published', '发布时间') + '</th><th>' + L('Items', '数量') + '</th><th>' + L('Note', '说明') + '</th><th></th></tr></thead><tbody>' + pubs.map(function(s){
      return '<tr><td class="mono"><b>' + esc(s.no) + '</b></td><td class="mono">' + esc(String(s.at || '').replace('T', ' ').slice(0, 16)) + '</td><td class="mono">' + esc(s.count) + '</td><td>' + esc(s.note || '') + '</td><td style="white-space:nowrap"><button type="button" class="btn sm" data-act="snapView" data-v="' + esc(s.id) + '">' + L('View', '查看') + '</button> <button type="button" class="btn sm" data-act="snapExport" data-v="' + esc(s.id) + '">Excel</button>' + (canEdit() ? (S.snapDelAsk === s.id ? ' <button type="button" class="btn sm danger" data-act="snapDelYes" data-v="' + esc(s.id) + '">' + L('Confirm', '确认') + '</button> <button type="button" class="btn sm" data-act="snapDelNo">' + L('Cancel', '取消') + '</button>' : ' <button type="button" class="btn sm" data-act="snapDelAsk" data-v="' + esc(s.id) + '">' + L('Withdraw', '撤回') + '</button>') : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="card empty">' + L('Nothing published yet.', '尚未发布。') + '</div>');
  }
  var list = items().filter(function(it){ return it.ownerVisible && match(it); });
  return h + '<div class="note">' + L('Only items marked External ● appear, with only the fields you choose. Internal notes, explanations you leave unticked, contacts and history never appear. Publish to make a fixed snapshot the Owner can open.', '只显示标记「对外 ●」的记录和选定字段；内部备注、未勾选的说明、对接人与历史不会出现。发布后生成固定快照，业主可登录查看。') + '</div>' +
    '<div class="bar-row"><div class="l"><span class="muted">' + L(list.length + ' items', list.length + ' 项') + '</span></div><div class="r"><button type="button" class="btn" data-act="gotoOwnerFields">' + L('Choose fields', '选择字段') + '</button><button type="button" class="btn" data-act="exportOwner">' + L('Export Excel', '导出 Excel') + '</button></div></div>' +
    (canEdit() ? '<div class="card" style="padding:10px 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end"><label class="fl" style="flex:1 1 260px">' + L('Publication note', '发布说明') + '<input class="in" id="snapNote" placeholder="' + esc(T('e.g. Weekly plan for Owner, PH-05', '例如：PH-05 周计划')) + '"></label><button type="button" class="btn pri" data-act="snapSave"' + (list.length ? '' : ' disabled') + '>' + L('Publish to Owner', '发布给业主') + '</button></div>' : '') +
    (list.length ? ownerTable(ownerGroups(list, fields), fields) : '<div class="card empty">' + L('No items are marked External with these filters. Turn External on in the Register.', '当前筛选下没有对外记录。可在总台账打开「对外」。') + '</div>');
}
function viewPortal(){
  var pubs = ((STORE && STORE.pubs) || []).slice().sort(function(a, b){ return String(b.no).localeCompare(String(a.no)); });
  if(!pubs.length) return '<div class="card empty"><div class="vtitle">' + L('Nothing published yet', '尚未发布') + '</div><div>' + L('The contractor has not published a plan for you yet.', '承包方尚未发布计划。') + '</div></div>';
  var sel = pubs.filter(function(p){ return p.id === S.pubSel; })[0] || pubs[0];
  var h = '<div class="bar-row"><div class="l"><h1 class="vtitle">' + L('Submission plan', '提交计划') + '</h1><select class="in" id="pubSel">' + pubs.map(function(p){ return '<option value="' + esc(p.id) + '"' + (p.id === sel.id ? ' selected' : '') + '>' + esc(p.no + ' · ' + String(p.at || '').slice(0, 10)) + '</option>'; }).join('') + '</select></div><div class="r"><button type="button" class="btn" data-act="snapExport" data-v="' + esc(sel.id) + '">' + L('Export Excel', '导出 Excel') + '</button></div></div>';
  h += '<div class="note">' + L('Published ' + String(sel.at || '').replace('T', ' ').slice(0, 16) + (sel.note ? ' · ' + sel.note : '') + '. Use “Comment” on any row to send feedback to the contractor.', '发布于 ' + String(sel.at || '').replace('T', ' ').slice(0, 16) + (sel.note ? ' · ' + sel.note : '') + '。可在任一行点「意见」向承包方反馈。') + '</div>';
  var mine = ((STORE && STORE.fb) || []).slice().reverse().slice(0, 20);
  h += ownerTable(sel.groups || [], sel.fields || [], {feedback:true});
  if(mine.length) h += '<section class="card" style="padding:14px;display:flex;flex-direction:column;gap:8px"><h2 style="font-size:15px">' + L('Comments', '意见记录') + '</h2>' + mine.map(fbHTML).join('') + '</section>';
  return h;
}

/* ===== Files ===== */
function viewFiles(){
  var list = [];
  filtered().forEach(function(it){ (it.attachments || []).forEach(function(a){ list.push({it:it, a:a}); }); });
  list.sort(function(x, y){ return String(y.a.at || '').localeCompare(String(x.a.at || '')); });
  var h = '<div class="bar-row"><div class="l"><h1 class="vtitle">' + L('Files & photos', '文件与照片') + '</h1><span class="muted">' + L(list.length + ' files', list.length + ' 个文件') + '</span></div></div><div class="note">' + L('Files belong to items. Open an item and use “Add files”; they appear here under the same filters.', '文件挂在记录上：打开记录点「添加文件」上传，这里按同样的筛选显示。') + '</div>';
  if(!list.length) return h + '<div class="card empty">' + L('No files with these filters yet.', '当前筛选下还没有文件。') + '</div>';
  return h + '<div class="files">' + list.map(function(x){
    var img = /^image\//.test(x.a.type || ''), u = img ? STORE.fileUrl(x.a.path) : null;
    return '<button type="button" class="fcard" data-act="open" data-id="' + esc(x.it.id) + '"><div class="th">' + (img && u ? '<img src="' + esc(u) + '" alt="' + esc(x.a.name) + '" loading="lazy">' : '<span class="mono">' + esc((String(x.a.name).split('.').pop() || 'FILE').toUpperCase()) + '</span>') + '</div><div class="tx"><b>' + esc(x.a.name) + '</b><span class="muted"><span class="mono">' + esc(x.it.regNo) + '</span> · ' + esc(title1(x.it)) + '</span><span>' + areaChips(x.it.areas) + ' <span class="mono muted">' + esc(String(x.a.at || '').slice(0, 10)) + '</span></span></div></button>';
  }).join('') + '</div>';
}

/* ===== Settings ===== */
var STABS = [['tree','Packages & classification','文件包与分类'],['areas','Blocks','区域'],['phases','Submission phases','提交阶段'],['depts','Departments','部门'],['discs','Disciplines','专业'],['statuses','Statuses','状态'],['types','Item types','记录类型'],['ownerResults','Owner results','业主结果'],['ownerf','Owner plan fields','对外字段'],['customFields','Custom fields','自定义字段'],['data','Project & data','项目与数据'],['users','Users & access','用户与权限']];
var LISTS = {
  areas: {key:'id', props:[['id','Code','代码','w60'],['en','Name (EN)','英文名'],['zh','Name (中)','中文名'],['color','Colour','颜色','color']], blank:function(){ return {id:'', en:'', zh:'', color:'grey'}; }, used:function(r){ return items().filter(function(i){ return (i.areas || []).indexOf(r.id) >= 0; }).length; }},
  phases: {key:'code', props:[['code','Code','代码','w100'],['en','Name (EN)','英文名'],['zh','Name (中)','中文名'],['start','Window start','窗口开始','date'],['end','Window end','窗口结束','date']], blank:function(){ var last = (S.draft.phases || [])[S.draft.phases.length - 1]; var n = (S.draft.phases || []).length + 1; var st = last && last.end ? n2d(d2n(last.end) + 1) : TODAY_S; var stn = d2n(st), d = new Date(stn * 864e5); var en = d.getUTCDate() === 1 ? n2d(stn + 14) : n2d(Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0) / 864e5)); return {code:'PH-' + pad(n), en:'Phase ' + n, zh:'第' + n + '阶段', start:st, end:en}; }, used:function(r){ return items().filter(function(i){ return i.phase === r.code; }).length; }},
  depts: {key:'code', props:[['code','Code','代码','w60'],['en','Name (EN)','英文名'],['zh','Name (中)','中文名']], blank:function(){ return {code:'', en:'', zh:''}; }, used:function(r){ return items().filter(function(i){ return i.dept === r.code; }).length; }},
  discs: {key:'code', props:[['code','Code','代码','w60'],['en','Name (EN)','英文名'],['zh','Name (中)','中文名']], blank:function(){ return {code:'', en:'', zh:''}; }, used:function(r){ return items().filter(function(i){ return (i.disc || []).indexOf(r.code) >= 0; }).length; }},
  statuses: {props:[['en','Name (EN)','英文名'],['zh','Name (中)','中文名'],['color','Colour','颜色','color'],['done','Counts as complete','视为完成','bool']], blank:function(){ return {key:uid('s'), en:'New status', zh:'', color:'grey', done:false}; }, used:function(r){ return items().filter(function(i){ return i.status === r.key; }).length; }},
  types: {props:[['en','Name (EN)','英文名'],['zh','Name (中)','中文名'],['prefix','No. prefix','编号前缀','w60'],['shape','Gantt shape','甘特形状','shape']], blank:function(){ return {key:uid('t'), en:'New type', zh:'', prefix:'ITM', shape:'bar'}; }, used:function(r){ return items().filter(function(i){ return i.type === r.key; }).length; }},
  ownerResults: {props:[['en','Name (EN)','英文名'],['zh','Name (中)','中文名'],['color','Colour','颜色','color']], blank:function(){ return {key:uid('r'), en:'', zh:'', color:'grey'}; }, used:function(r){ return items().filter(function(i){ return i.ownerResult === r.key; }).length; }},
  customFields: {props:[['en','Name (EN)','英文名'],['zh','Name (中)','中文名'],['kind','Kind','类型','kind'],['options','Options (comma-separated)','选项（逗号分隔）'],['inTable','Show in register','显示在总台账','bool']], blank:function(){ return {key:uid('cf'), en:'New field', zh:'', kind:'text', options:'', inTable:false}; }, used:function(r){ return items().filter(function(i){ var v = (i.custom || {})[r.key]; return v != null && v !== ''; }).length; }}
};
var LIST_NOTES = {
  areas: ['Blocks drive the block filter, Gantt grouping and colours.', '区域用于筛选、甘特分组与颜色。'],
  phases: ['Half-month submission windows. Items with a phase but no dates use the phase window on the Gantt.', '半月提交窗口。有阶段但无日期的记录，在甘特图上按阶段窗口显示。'],
  depts: ['Departments responsible for items (工程, 设计, 质量…).', '负责部门（工程、设计、质量…）。'],
  discs: ['Discipline codes as used in your register (ele, civ, inc…). An item can have several.', '专业代码，与台账一致（ele、civ、inc…），一项可有多个专业。'],
  statuses: ['Order sets list order. “Counts as complete” items are never overdue and show fully green on the Gantt.', '顺序即列表顺序；「视为完成」不算逾期，甘特图显示全绿。'],
  types: ['Each type has its own number prefix. Milestones show as dots on the Gantt.', '每种类型有自己的编号前缀；里程碑在甘特图显示为圆点。'],
  ownerResults: ['The Owner’s formal review outcome, separate from your internal status.', '业主正式审查结果，与内部状态分开。'],
  customFields: ['Add your own fields; they appear in every item, the Excel export and optionally as register columns.', '自定义字段会出现在每条记录、Excel 导出，并可作为总台账列。']
};
function ensureDraft(name){
  if(S.dirty[name] && S.draft[name]) return;
  if(name === 'tree') S.draft.tree = clone((STORE && STORE.tree) || []);
  else if(name === 'proj') S.draft.proj = {projectEn: cfg().projectEn, projectZh: cfg().projectZh};
  else S.draft[name] = clone(cfg()[name] || []);
}
function viewSettings(){
  var tabs = STABS.filter(function(t){ return t[0] !== 'users' || (STORE.mode === 'cloud' && role() === 'admin'); });
  if(!tabs.some(function(t){ return t[0] === S.stab; })) S.stab = 'tree';
  var nav = '<nav class="card snav" aria-label="Settings">' + tabs.map(function(t){ return '<button type="button" data-act="stab" data-v="' + t[0] + '" aria-current="' + (S.stab === t[0]) + '">' + L(t[1], t[2]) + '</button>'; }).join('') + '</nav>';
  var ro = !canEdit() ? '<div class="note">' + L('Read-only: only editors and admins can change settings.', '只读：只有编辑或管理员能修改设置。') + '</div>' : '';
  var p = S.stab === 'tree' ? settingsTree() : S.stab === 'ownerf' ? settingsOwnerFields() : S.stab === 'data' ? settingsData() : S.stab === 'users' ? settingsUsers() : settingsList(S.stab);
  return '<div class="set">' + nav + '<section class="card spanel">' + ro + p + '</section></div>';
}
function saveBar(name){ return '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button type="button" class="btn pri" data-act="saveDraft" data-v="' + name + '"' + (canEdit() ? '' : ' disabled') + '>' + L('Save changes', '保存修改') + '</button><button type="button" class="btn" data-act="discardDraft" data-v="' + name + '">' + L('Discard', '放弃') + '</button><span id="dirty-' + name + '" class="dirty">' + (S.dirty[name] ? L('Unsaved changes', '有未保存的修改') : '') + '</span>' + (S.saved[name] ? '<span class="ok-msg">' + L('Saved', '已保存') + '</span>' : '') + '</div>'; }
function settingsTree(){
  ensureDraft('tree'); var d = S.draft.tree, by = {}, kids = {};
  d.forEach(function(n){ by[n.id] = n; }); d.forEach(function(n){ var p = n.parent && by[n.parent] ? n.parent : ''; (kids[p] = kids[p] || []).push(n); });
  var used = function(id){ var set = {}; (function w(x){ set[x] = 1; (kids[x] || []).forEach(function(k){ w(k.id); }); })(id); return items().filter(function(i){ return set[i.node]; }).length; };
  var rows = '';
  (function walk(pid, dep){ (kids[pid] || []).forEach(function(n){
    var u = used(n.id), hk = (kids[n.id] || []).length;
    rows += '<div class="lrow" style="padding-left:' + (dep * 22) + 'px"><span class="muted mono" style="width:20px;font-size:11px">L' + (dep + 1) + '</span>' +
      '<input class="in w100" aria-label="Code" data-td="' + esc(n.id) + '|code" value="' + esc(n.code || '') + '" placeholder="' + esc(T('Code', '编号')) + '">' +
      '<input class="in" aria-label="Name EN" data-td="' + esc(n.id) + '|en" value="' + esc(n.en || '') + '" placeholder="Name (EN)" style="width:230px">' +
      '<input class="in" aria-label="Name ZH" data-td="' + esc(n.id) + '|zh" value="' + esc(n.zh || '') + '" placeholder="中文名" style="width:170px">' +
      '<button type="button" class="btn sm" data-act="tUp" data-v="' + esc(n.id) + '" aria-label="Move up">↑</button><button type="button" class="btn sm" data-act="tDown" data-v="' + esc(n.id) + '" aria-label="Move down">↓</button>' +
      '<button type="button" class="btn sm" data-act="tOut" data-v="' + esc(n.id) + '" aria-label="Up one level"' + (dep ? '' : ' disabled') + '>←</button><button type="button" class="btn sm" data-act="tIn" data-v="' + esc(n.id) + '" aria-label="Down one level">→</button>' +
      '<button type="button" class="btn sm" data-act="tAdd" data-v="' + esc(n.id) + '">+ ' + L('Sub-level', '下级') + '</button>' +
      (u ? '<span class="note">' + L(u + ' items', u + ' 项') + '</span>' : '<button type="button" class="btn sm danger" data-act="tDel" data-v="' + esc(n.id) + '"' + (hk ? ' disabled' : '') + '>' + L('Delete', '删除') + '</button>') + '</div>';
    walk(n.id, dep + 1);
  }); })('', 0);
  return '<div><h2 style="font-size:17px">' + L('Packages & classification', '文件包与分类') + '</h2><p class="note" style="margin:4px 0 0">' + L('Any depth (package › section › item type…). Items point to the level itself, so renaming or re-coding never breaks links. A level that still holds items cannot be deleted — move its items first.', '层级不限（文件包 › 分部 › 资料类型…）。记录挂在层级本身，改名或改编号不断链；仍有记录的层级不能删除。') + '</p></div><div class="ledit">' + rows + '</div><div><button type="button" class="btn" data-act="tAdd" data-v="">+ ' + L('Top-level package', '顶级文件包') + '</button></div>' + saveBar('tree');
}
function settingsList(name){
  var def = LISTS[name]; if(!def) return '';
  ensureDraft(name); var d = S.draft[name], t = STABS.filter(function(x){ return x[0] === name; })[0];
  var W = function(p){ return p[3] === 'w60' ? 76 : p[3] === 'w100' ? 116 : p[3] === 'bool' ? 120 : (p[3] === 'color' || p[3] === 'shape' || p[3] === 'kind') ? 116 : p[3] === 'date' ? 140 : 150; };
  var head = '<div class="lhead">' + def.props.map(function(p){ return '<span style="width:' + W(p) + 'px">' + L(p[1], p[2]) + '</span>'; }).join('') + '</div>';
  var rows = d.map(function(r, i){
    var u = def.used(r);
    return '<div class="lrow">' + def.props.map(function(p){
      var key = name + '|' + i + '|' + p[0], v = r[p[0]];
      var lockKey = def.key === p[0] && u > 0;
      if(p[3] === 'color') return '<select class="in w100" data-ld="' + key + '" aria-label="Colour">' + COLORS.map(function(c){ return '<option value="' + c + '"' + (v === c ? ' selected' : '') + '>' + esc(T(COLOR_NAMES[c][0], COLOR_NAMES[c][1])) + '</option>'; }).join('') + '</select>';
      if(p[3] === 'shape') return '<select class="in w100" data-ld="' + key + '" aria-label="Shape"><option value="bar"' + (v !== 'milestone' ? ' selected' : '') + '>' + esc(T('Bar', '条形')) + '</option><option value="milestone"' + (v === 'milestone' ? ' selected' : '') + '>' + esc(T('Milestone', '里程碑')) + '</option></select>';
      if(p[3] === 'kind') return '<select class="in w100" data-ld="' + key + '" aria-label="Kind">' + [['text','Text','文本'],['number','Number','数字'],['date','Date','日期'],['select','Choice','选项']].map(function(o){ return '<option value="' + o[0] + '"' + (v === o[0] ? ' selected' : '') + '>' + esc(T(o[1], o[2])) + '</option>'; }).join('') + '</select>';
      if(p[3] === 'bool') return '<label class="chk" style="width:120px"><input type="checkbox" data-ld="' + key + '"' + (v ? ' checked' : '') + '>' + L('Yes', '是') + '</label>';
      if(p[3] === 'date') return '<input class="in" type="date" style="width:140px" data-ld="' + key + '" value="' + esc(v || '') + '" aria-label="' + esc(p[1]) + '">';
      return '<input class="in' + (p[3] === 'w60' ? ' w60' : p[3] === 'w100' ? ' w100' : '') + '" data-ld="' + key + '" value="' + esc(v == null ? '' : v) + '" aria-label="' + esc(p[1]) + '"' + (lockKey ? ' readonly title="' + esc(T('In use — code cannot change', '使用中，代码不可改')) + '"' : '') + '>';
    }).join('') + '<button type="button" class="btn sm" data-act="lUp" data-v="' + name + '|' + i + '" aria-label="Move up">↑</button><button type="button" class="btn sm" data-act="lDown" data-v="' + name + '|' + i + '" aria-label="Move down">↓</button>' +
      (u ? '<span class="note">' + L('in use (' + u + ')', '使用中（' + u + '）') + '</span>' : '<button type="button" class="btn sm danger" data-act="lDel" data-v="' + name + '|' + i + '">' + L('Remove', '移除') + '</button>') + '</div>';
  }).join('');
  var nt = LIST_NOTES[name] || ['', ''];
  return '<div><h2 style="font-size:17px">' + L(t[1], t[2]) + '</h2><p class="note" style="margin:4px 0 0">' + L(nt[0], nt[1]) + '</p></div><div class="ledit">' + head + rows + '</div><div><button type="button" class="btn" data-act="lAdd" data-v="' + name + '">+ ' + L('Add', '添加') + '</button></div>' + saveBar(name);
}
function settingsOwnerFields(){
  var on = cfg().ownerFields || [];
  return '<div><h2 style="font-size:17px">' + L('Owner plan fields', '对外字段') + '</h2><p class="note" style="margin:4px 0 0">' + L('Tick what the Owner may see in published plans and their Excel export. Contacts, internal notes, remarks and history are never offered.', '勾选业主在发布计划及导出中可见的字段；对接人、内部备注、备注意见与历史不提供。') + '</p></div><div class="grid2">' +
    OF.map(function(o){ return '<label class="chk card" style="padding:10px 12px"><input type="checkbox" data-of="' + o[0] + '"' + (on.indexOf(o[0]) >= 0 ? ' checked' : '') + (canEdit() ? '' : ' disabled') + '>' + L(o[1], o[2]) + '</label>'; }).join('') + '</div>';
}
function settingsUsers(){
  var us = (STORE.users || []);
  return '<div><h2 style="font-size:17px">' + L('Users & access', '用户与权限') + '</h2><p class="note" style="margin:4px 0 0">' + L('People create their own account on the sign-in page, then wait here for you to give them a role. Editors change data; Viewers read everything; Owner (client) sees only what you publish and can leave comments.', '同事或业主在登录页自行注册后会出现在这里，由你分配角色：编辑可修改数据；只读可查看全部；业主只能看到你发布的计划并留言。') + '</p></div>' +
    '<div class="card" style="overflow-x:auto"><table class="ptbl"><thead><tr><th>' + L('Name', '姓名') + '</th><th>' + L('Email', '邮箱') + '</th><th>' + L('Role', '角色') + '</th><th>' + L('Joined', '注册时间') + '</th></tr></thead><tbody>' + us.map(function(u){
      var self = STORE.me && u.id === STORE.me.id;
      return '<tr><td>' + esc(u.name || '—') + (self ? ' <span class="chip c-blue">' + L('you', '你') + '</span>' : '') + '</td><td>' + esc(u.email || '') + '</td><td><select class="in" data-role="' + esc(u.id) + '"' + (self ? ' disabled' : '') + '>' + ROLES.map(function(r){ return '<option value="' + r[0] + '"' + (u.role === r[0] ? ' selected' : '') + '>' + esc(T(r[1], r[2])) + '</option>'; }).join('') + '</select></td><td class="mono">' + esc(String(u.created_at || '').slice(0, 10)) + '</td></tr>';
    }).join('') + '</tbody></table></div><div><button type="button" class="btn" data-act="reloadUsers">' + L('Refresh list', '刷新列表') + '</button></div>';
}
function settingsData(){
  ensureDraft('proj'); var d = S.draft.proj, c = cfg();
  var h = '<div><h2 style="font-size:17px">' + L('Project', '项目') + '</h2></div><div class="fg" style="max-width:680px"><label>' + L('Project name (EN)', '项目名称（英文）') + '<input class="in" data-pd="projectEn" value="' + esc(d.projectEn) + '"></label><label>' + L('Project name (中)', '项目名称（中文）') + '<input class="in" data-pd="projectZh" value="' + esc(d.projectZh) + '"></label></div>' + saveBar('proj');
  h += '<div class="fg" style="max-width:680px"><label>' + L('Status date (blank = today)', '状态日期（留空 = 今天）') + '<input class="in" type="date" id="cfgAsOf" value="' + esc(c.asOf || '') + '"' + (canEdit() ? '' : ' disabled') + '></label><label>' + L('Gantt timeline start (blank = automatic)', '甘特时间轴起始（留空 = 自动）') + '<input class="in" type="date" id="cfgGStart" value="' + esc(c.ganttStart || '') + '"' + (canEdit() ? '' : ' disabled') + '></label></div>';
  h += '<div style="border-top:1px solid var(--line);padding-top:14px"><h2 style="font-size:17px">Excel</h2><p class="note" style="margin:4px 0 8px">' + L('Import reads your existing sheets directly (文件编号, 文件包类别, 部门, 文件名称, Document Title, 专业, 提交阶段, 实际提交日期, Status, 解释说明, 备注, 对接人, Updating…) as well as this site’s own export. Rows match by No. or Document No.; matched rows update, new rows are added, nothing is deleted, and empty cells leave fields unchanged. New packages, departments, disciplines, phases and blocks found in the file are added for you.', '导入可直接读取你现有的表（文件编号、文件包类别、部门、文件名称、Document Title、专业、提交阶段、实际提交日期、Status、解释说明、备注、对接人、Updating…）及本站导出格式。按序号或文件编号匹配：已有的更新、新的新增，不删除；空单元格不改原值；文件中出现的新文件包、部门、专业、阶段、区域会自动加入。') + '</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" data-act="exportAll">' + L('Export full register', '导出完整总台账') + '</button><button type="button" class="btn" data-act="template">' + L('Blank template', '空白模板') + '</button>' + (canEdit() ? '<label class="btn pri" style="cursor:pointer">' + L('Import Excel…', '导入 Excel…') + '<input type="file" id="impFile" accept=".xlsx,.xls,.xlsm,.csv" hidden></label>' : '') + '</div>';
  if(S.imp){
    var im = S.imp;
    h += '<div class="card" style="padding:12px;margin-top:10px;display:flex;flex-direction:column;gap:8px"><b>' + esc(im.name) + ' · ' + esc(im.sheet) + '</b><div>' + L(im.adds.length + ' new · ' + im.updates.length + ' to update · ' + im.errors.length + ' skipped', '新增 ' + im.adds.length + ' · 更新 ' + im.updates.length + ' · 跳过 ' + im.errors.length) + '</div>' +
      (im.newLists.length ? '<div class="note">' + L('Will also add: ', '将同时新增：') + esc(im.newLists.join(' · ')) + '</div>' : '') +
      '<div class="note">' + L('Columns used: ', '识别的列：') + esc(im.mapped.join(', ')) + (im.unknown.length ? '<br>' + L('Ignored: ', '忽略：') + esc(im.unknown.join(', ')) : '') + '</div>' +
      (im.errors.length ? '<div class="note" style="color:var(--warn)">' + im.errors.slice(0, 8).map(esc).join('<br>') + (im.errors.length > 8 ? '<br>…' : '') + '</div>' : '') +
      '<div style="display:flex;gap:8px"><button type="button" class="btn pri" data-act="impYes"' + (im.adds.length + im.updates.length ? '' : ' disabled') + '>' + L('Import now', '确认导入') + '</button><button type="button" class="btn" data-act="impNo">' + L('Cancel', '取消') + '</button></div></div>';
  }
  h += '</div><div style="border-top:1px solid var(--line);padding-top:14px;display:flex;flex-direction:column;gap:8px"><h2 style="font-size:17px">' + L('Data', '数据') + '</h2>';
  if(STORE.mode === 'demo') h += '<p class="note" style="margin:0">' + L('Demo data lives only in this browser. Reset it to the original sample at any time.', '演示数据只存在本浏览器，可随时恢复初始示例。') + '</p><div><button type="button" class="btn" data-act="resetDemo">' + L('Reset demo data', '重置演示数据') + '</button></div>';
  else if(role() === 'admin') h += '<p class="note" style="margin:0">' + L(items().length + ' items in the database. Export a full Excel backup regularly.', '数据库中有 ' + items().length + ' 条记录，请定期导出完整 Excel 备份。') + '</p><div>' + (S.clearAsk ? '<button type="button" class="btn danger" data-act="clearYes">' + L('Confirm: delete all ' + items().length + ' items', '确认删除全部 ' + items().length + ' 条') + '</button> <button type="button" class="btn" data-act="clearNo">' + L('Cancel', '取消') + '</button>' : '<button type="button" class="btn danger" data-act="clearAsk">' + L('Delete all items', '删除全部记录') + '</button>') + '</div>';
  h += '</div>';
  return h;
}
function saveDraft(name){
  if(!canEdit()) return;
  var p;
  if(name === 'tree'){
    var nodes = S.draft.tree.map(function(n){ return {id:n.id, parent:n.parent || '', code:String(n.code || '').trim(), en:String(n.en || '').trim(), zh:String(n.zh || '').trim()}; });
    if(nodes.some(function(n){ return !n.en && !n.zh; })){ toast(T('Every level needs a name', '每个层级都需要名称')); return; }
    p = STORE.saveTree(nodes);
  } else if(name === 'proj') p = STORE.saveCfg({projectEn:S.draft.proj.projectEn, projectZh:S.draft.proj.projectZh});
  else {
    var arr = clone(S.draft[name]), k = LISTS[name].key;
    if(k){
      arr.forEach(function(a){ a[k] = String(a[k] || '').trim(); if(name === 'areas') a[k] = a[k].toUpperCase(); if(name === 'phases') a[k] = a[k].toUpperCase(); });
      var ids = arr.map(function(a){ return a[k]; });
      if(ids.some(function(x){ return !x; }) || ids.some(function(x, i){ return ids.indexOf(x) !== i; }) || (name === 'areas' && ids.indexOf('SW') >= 0)){ toast(T('Each row needs a unique code', '每行需要唯一代码')); return; }
    }
    if(name === 'phases' && arr.some(function(x){ return !x.start || !x.end || d2n(x.end) < d2n(x.start); })){ toast(T('Each phase needs a start and an end on or after it', '每个阶段需要开始和不早于开始的结束日期')); return; }
    var o = {}; o[name] = arr; p = STORE.saveCfg(o);
  }
  p.then(function(){ S.dirty[name] = false; S.draft[name] = null; S.saved[name] = true; setTimeout(function(){ S.saved[name] = false; renderView(); }, 2000); renderAll(); }).catch(function(e){ toast(errText(e)); });
}
function markDirty(name){ S.dirty[name] = true; S.saved[name] = false; var el = document.getElementById('dirty-' + name); if(el) el.textContent = T('Unsaved changes', '有未保存的修改'); }
function treeOp(op, id){
  ensureDraft('tree'); var d = S.draft.tree, by = {}; d.forEach(function(n){ by[n.id] = n; });
  var n = by[id], sib = function(x){ return d.filter(function(y){ return (y.parent || '') === (x.parent || ''); }); };
  if(op === 'tAdd'){
    var par = id ? by[id] : null, cnt = d.filter(function(y){ return (y.parent || '') === (id || ''); }).length + 1;
    d.push({id:uid('n'), parent:id || '', code: par ? (par.code ? par.code + '.' + cnt : '') : 'P' + cnt, en:'', zh:''}); if(id) S.exp[id] = true;
  } else if(!n) return;
  else if(op === 'tUp' || op === 'tDown'){ var s = sib(n), i = s.indexOf(n), j = op === 'tUp' ? i - 1 : i + 1; if(j < 0 || j >= s.length) return; var a = d.indexOf(n), b = d.indexOf(s[j]); d[a] = s[j]; d[b] = n; }
  else if(op === 'tIn'){ var s2 = sib(n), k = s2.indexOf(n); if(k <= 0){ toast(T('Needs a level above it at the same depth', '需要上方有同级分类')); return; } n.parent = s2[k - 1].id; d.splice(d.indexOf(n), 1); d.push(n); }
  else if(op === 'tOut'){ var p = by[n.parent]; if(!p) return; n.parent = p.parent || ''; d.splice(d.indexOf(n), 1); d.splice(d.indexOf(p) + 1, 0, n); }
  else if(op === 'tDel') d.splice(d.indexOf(n), 1);
  markDirty('tree'); renderView();
}

/* ===== Drawer ===== */
function openItem(id){ if(S.suppressOpen && Date.now() - S.suppressOpen < 400) return; S.open = id; S.delAsk = false; renderDrawer(); }
function renderDrawer(){
  var root = $('#drawer-root'), it = S.open && getItem(S.open);
  if(!it || !isInternal()){ root.innerHTML = ''; root.dataset.id = ''; return; }
  var c = cfg(), ed = canEdit(), dis = ed ? '' : ' disabled';
  function f(label, html, full){ return '<label' + (full ? ' class="full"' : '') + '>' + label + html + '</label>'; }
  function inp(field, type, extra, val){ return '<input class="in" data-df="' + field + '" type="' + (type || 'text') + '" value="' + esc(val !== undefined ? val : (it[field] == null ? '' : it[field])) + '"' + (extra || '') + dis + '>'; }
  function sel(field, opts, blank){ return '<select class="in" data-df="' + field + '"' + dis + '>' + (blank ? '<option value="">—</option>' : '') + opts.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (it[field] === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  function chips(act, list, onArr, labelFn){ return '<div class="achips">' + list.map(function(x){ var k = x.id || x.code, on = (onArr || []).indexOf(k) >= 0; return '<button type="button" class="fchip" data-act="' + act + '" data-v="' + esc(k) + '" aria-pressed="' + on + '"' + dis + '>' + esc(labelFn(x)) + '</button>'; }).join('') + '</div>'; }
  var nodeOpts = []; dfs(function(n, d){ nodeOpts.push([n.id, '  '.repeat(d) + nodeLabel(n)]); });
  var pth = pathOf(it.node), t = typeOf(it.type), ms = t.shape === 'milestone', pl = planOf(it), cm = hasComments(it);
  var h = '<div class="scrim" data-act="close"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="' + esc(it.regNo) + '">' +
    '<div class="dh"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="mono muted">' + esc(it.regNo) + (it.docNo ? ' · ' + esc(it.docNo) : '') + (it.rev ? ' · ' + esc(it.rev) : '') + '</span><span style="display:flex;gap:6px"><button type="button" class="btn sm" data-act="togkey" data-id="' + esc(it.id) + '"' + dis + ' aria-pressed="' + !!it.key + '">' + (it.key ? '<span class="star">★</span> ' + L('Key', '重点') : '☆ ' + L('Mark key', '标为重点')) + '</button><button type="button" class="btn sm" data-act="close" aria-label="Close">✕</button></span></div>' +
    '<div style="font-size:17px;font-weight:600">' + esc(title1(it) || '—') + '</div>' + (S.lang === 'both' && it.zh && it.en ? '<div class="muted">' + esc(it.zh) + '</div>' : '') +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' + statusChip(it.status) + ' ' + areaChips(it.areas) + (it.phase ? ' <span class="chip c-violet">' + esc(it.phase + ' ' + phaseWindow(it.phase)) + '</span>' : '') + (isOverdue(it) ? ' <span class="chip c-red">' + L('Overdue', '逾期') + '</span>' : '') + (cm ? ' <span class="chip c-red">● ' + L('Has comments', '有意见') + '</span>' : '') + '</div>' +
    (pth.length ? '<div class="note">' + pth.map(function(n){ return '<span class="mono">' + esc(n.code || '') + '</span> ' + esc(T(n.en, n.zh)); }).join(' › ') + '</div>' : '') + '</div><div class="dbody">';
  h += '<div class="sec"><h3>' + L('Document', '文件信息') + '</h3><div class="fg">' +
    f(L('No.', '序号'), inp('regNo')) + f(L('Type', '类型'), sel('type', c.types.map(function(x){ return [x.key, T(x.en, x.zh)]; }))) +
    f(L('Document No.', '文件编号'), inp('docNo')) + f(L('Revision', '版本'), inp('rev')) +
    f(L('Document title (EN)', 'Document Title（英文）'), inp('en'), true) + f(L('Name (中文)', '文件名称（中文）'), inp('zh'), true) +
    f(L('Package / classification', '文件包 / 分类'), sel('node', nodeOpts, true), true) +
    f(L('Department', '部门'), sel('dept', c.depts.map(function(x){ return [x.code, T(x.en, x.zh)]; }), true)) +
    f(L('Contacts (A / B / C)', '对接人（用 / 分隔）'), inp('contacts', 'text', ' list="dl-people"', contactsText(it))) +
    '<div class="fl full">' + L('Discipline', '专业') + chips('dDisc', c.discs, it.disc, function(x){ return x.code + ' ' + (S.lang === 'en' ? x.en : x.zh || x.en); }) + '</div>' +
    '<div class="fl full">' + L('Blocks', '区域') + ' <span class="note">' + L('none = site-wide', '不选 = 全场') + '</span>' + chips('dArea', c.areas, it.areas, function(x){ return T(x.en, x.zh); }) + '</div></div></div>';
  h += '<div class="sec"><h3>' + L('Schedule & submission', '计划与提交') + '</h3><div class="fg">' +
    f(L('Submission phase', '提交阶段'), sel('phase', c.phases.map(function(p){ return [p.code, p.code + ' · ' + dmon(p.start) + '–' + dmon(p.end)]; }), true)) +
    f(L('Status', '状态'), sel('status', c.statuses.map(function(x){ return [x.key, T(x.en, x.zh)]; }))) +
    (ms ? f(L('Date', '日期'), inp('finish', 'date')) : f(L('Plan start', '计划开始'), inp('start', 'date', pl && pl.fromPhase ? ' placeholder="' + n2d(pl.s) + '"' : '')) + f(L('Plan finish', '计划结束'), inp('finish', 'date'))) +
    f(L('Progress %', '完成率 %'), inp('progress', 'number', ' min="0" max="100" step="5"')) +
    f(L('Actual submission from', '实际提交开始'), inp('actualStart', 'date')) + f(L('Actual submission to', '实际提交结束'), inp('actualEnd', 'date')) +
    '<label class="chk" style="align-self:end;padding-bottom:6px"><input type="checkbox" data-df="ongoing"' + (it.ongoing ? ' checked' : '') + dis + '>' + L('Submission ongoing', '提交进行中') + '</label>' +
    f(L('Predecessors (No.)', '前置项（序号）'), '<input class="in" data-df="deps" value="' + esc((it.deps || []).join(', ')) + '" placeholder="ACT-005, DOC-012"' + dis + '>') +
    '<div class="fl full">' + L('Baseline', '基线') + '<span style="color:var(--ink)" class="mono">' + (it.baseStart ? esc(it.baseStart + ' → ' + it.baseFinish) : '—') + '</span>' + (ed ? '<span><button type="button" class="btn sm" data-act="baseOne">' + L('Set baseline to current plan', '以当前计划为基线') + '</button></span>' : '') + '</div>' +
    (pl && pl.fromPhase ? '<div class="note full">' + L('No own dates yet — the Gantt uses the phase window.', '尚未填日期，甘特图按阶段窗口显示。') + '</div>' : '') + '</div></div>';
  var fbs = ((STORE && STORE.fb) || []).filter(function(x){ return x.item_id === it.id; });
  h += '<div class="sec"><h3>' + L('Explanation, remarks & updates', '说明、备注与更新') + '</h3><div class="fg">' +
    f(L('Explanation', '解释说明'), '<textarea class="in" data-df="explanation"' + dis + '>' + esc(it.explanation || '') + '</textarea>', true) +
    f('<span style="color:var(--bad)">' + L('Remarks / comments — shows red until resolved', '备注 / 意见 — 未关闭前标红') + '</span>', '<textarea class="in" data-df="remarks"' + dis + '>' + esc(it.remarks || '') + '</textarea>', true) +
    '<label class="chk full"><input type="checkbox" data-df="commentsResolved"' + (it.commentsResolved ? ' checked' : '') + dis + '>' + L('Comments resolved', '意见已关闭') + '</label></div>' +
    (fbs.length ? '<div class="fl">' + L('Owner feedback', '业主反馈') + '</div>' + fbs.map(fbHTML).join('') : '') +
    '<div class="fl">' + L('Updating log', '更新记录 Updating') + '</div><div class="upd">' + (it.updates || []).slice().reverse().map(function(u, i){ var ix = (it.updates || []).length - 1 - i; return '<div class="u"><b>' + esc(u.d || '') + '</b>' + esc(u.text || '') + (ed ? ' <button type="button" class="lnk" style="font-size:11px" data-act="updRm" data-v="' + ix + '">' + L('remove', '删除') + '</button>' : '') + '</div>'; }).join('') +
    (ed ? '<form id="fUpd" style="display:flex;gap:6px;flex-wrap:wrap"><input class="in" type="date" id="updD" value="' + n2d(ASOFN()) + '" style="width:150px"><input class="in" id="updT" placeholder="' + esc(T('What changed?', '更新内容')) + '" style="flex:1 1 220px" required><button class="btn sm pri" type="submit">' + L('Add', '添加') + '</button></form>' : '') + '</div></div>';
  h += '<div class="sec"><h3>' + L('Owner', '业主') + '</h3><div class="fg">' + f(L('Owner result', '业主结果'), sel('ownerResult', c.ownerResults.map(function(x){ return [x.key, T(x.en, x.zh)]; }), true)) +
    '<label class="chk" style="align-self:end;padding-bottom:6px"><input type="checkbox" data-df="ownerVisible"' + (it.ownerVisible ? ' checked' : '') + dis + '>' + L('Show in owner plan', '显示于业主计划') + '</label>' +
    f('<span style="color:var(--ok)">' + L('External remark — the Owner can see this', '对外备注 — 业主可见') + '</span>', '<textarea class="in" data-df="extNote"' + dis + '>' + esc(it.extNote || '') + '</textarea>', true) +
    f('<span style="color:var(--warn)">' + L('Internal note — never published', '内部备注 — 永不发布') + '</span>', '<textarea class="in" data-df="intNote"' + dis + '>' + esc(it.intNote || '') + '</textarea>', true) + '</div></div>';
  var cfs = c.customFields || [];
  if(cfs.length) h += '<div class="sec"><h3>' + L('Custom fields', '自定义字段') + '</h3><div class="fg">' + cfs.map(function(cf){
    var v = (it.custom || {})[cf.key], lab = L(cf.en, cf.zh);
    if(cf.kind === 'select') return f(lab, '<select class="in" data-dc="' + esc(cf.key) + '"' + dis + '><option value="">—</option>' + String(cf.options || '').split(',').map(function(s){ s = s.trim(); return s ? '<option' + (v === s ? ' selected' : '') + '>' + esc(s) + '</option>' : ''; }).join('') + '</select>');
    return f(lab, '<input class="in" data-dc="' + esc(cf.key) + '" data-kind="' + esc(cf.kind) + '" type="' + (cf.kind === 'number' ? 'number' : cf.kind === 'date' ? 'date' : 'text') + '" value="' + esc(v == null ? '' : v) + '"' + dis + '>');
  }).join('') + '</div></div>';
  var atts = it.attachments || [];
  h += '<div class="sec"><h3>' + L('Files & photos', '文件与照片') + ' <span class="muted mono" style="font-weight:400">' + atts.length + '</span></h3>' +
    (atts.length ? '<div class="atts">' + atts.map(function(a, i){ var img = /^image\//.test(a.type || ''), u = STORE.fileUrl(a.path); return '<div class="att"><a class="th" ' + (u ? 'href="' + esc(u) + '" target="_blank" rel="noopener"' : '') + '>' + (img && u ? '<img src="' + esc(u) + '" alt="' + esc(a.name) + '" loading="lazy">' : '<span class="mono">' + esc((String(a.name).split('.').pop() || 'FILE').toUpperCase()) + '</span>') + '</a><div class="nm" title="' + esc(a.name) + '">' + esc(a.name) + '</div><div class="ac"><span class="mono muted">' + esc(String(a.at || '').slice(5, 10)) + '</span>' + (ed ? '<button type="button" class="lnk" style="font-size:11px" data-act="attRm" data-v="' + i + '">' + L('Remove', '移除') + '</button>' : '') + '</div></div>'; }).join('') + '</div>' : '') +
    (ed ? '<div><label class="btn" style="cursor:pointer">+ ' + L('Add files', '添加文件') + '<input type="file" id="attFile" multiple hidden></label> <span class="note">' + L('Photos, PDF, drawings, Office files', '照片、PDF、图纸、Office 文件') + '</span></div>' : '') + '</div>';
  var hist = (it.history || []).slice().reverse();
  h += '<div class="sec"><h3>' + L('History', '修改记录') + '</h3><div class="hist">' + (hist.length ? hist.map(function(x){ return '<div><span class="mono">' + esc(String(x.t || '').replace('T', ' ').slice(5, 16)) + '</span> · ' + (x.by ? esc(x.by) + ' · ' : '') + esc(x.f) + (x.f === 'created' || x.f === 'imported' ? '' : ': ' + esc(x.from || '∅') + ' → ' + esc(x.to || '∅')) + '</div>'; }).join('') : '—') + '</div></div>';
  if(ed) h += '<div class="sec" style="border-top:1px solid var(--line);padding-top:12px">' + (S.delAsk ? '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span>' + L('Delete ' + it.regNo + ' permanently?', '永久删除 ' + it.regNo + '？') + '</span><button type="button" class="btn danger" data-act="delYes">' + L('Delete', '删除') + '</button><button type="button" class="btn" data-act="delNo">' + L('Cancel', '取消') + '</button></div>' : '<div><button type="button" class="btn danger" data-act="delAsk">' + L('Delete item', '删除此记录') + '</button></div>') + '</div>';
  h += '</div></aside>';
  var sc = root.querySelector('.dbody'), st = sc ? sc.scrollTop : 0, same = root.dataset.id === it.id;
  root.innerHTML = h; root.dataset.id = it.id;
  if(same){ var nb = root.querySelector('.dbody'); if(nb) nb.scrollTop = st; }
}

/* ===== Excel ===== */
var XH = [
  ['regNo','No. 序号'],['docNo','Document No. 文件编号'],['rev','Rev 版本'],['package','Package 文件包类别'],['classCode','Class Code 分类编号'],['dept','Department 部门'],
  ['zh','文件名称'],['en','Document Title'],['disc','Discipline 专业'],['areas','Block 区域'],['phase','Submission Phase 提交阶段'],['window','Phase Window 阶段窗口'],
  ['start','Plan Start 计划开始'],['finish','Plan Finish 计划结束'],['actual','Actual Submission 实际提交日期'],['progress','Progress 完成率'],['status','Status 状态'],
  ['explanation','Explanation 解释说明'],['remarks','Remarks 备注'],['contacts','Contacts 对接人'],['updating','Updating'],['type','Type 类型'],['key','Key 重点'],
  ['ownerVisible','External 对外'],['extNote','External Note 对外备注'],['intNote','Internal Note 内部备注'],['deps','Predecessors 前置项'],['ownerResult','Owner Result 业主结果']
];
var SYN = {
  regNo:['no.序号','序号','no.','no','regno','台账号'], docNo:['documentno.文件编号','文件编号','documentno','docno','doc.no','documentnumber'], rev:['rev版本','版本','rev','revision'],
  package:['package文件包类别','文件包类别','文件包','package'], classCode:['classcode分类编号','分类编号','classcode'], dept:['department部门','部门','department','dept'],
  zh:['文件名称','中文名称','名称中文','titlezh'], en:['documenttitle','titleen','englishtitle'], task:['任务文件taskdocument','任务文件','taskdocument','task'],
  disc:['discipline专业','专业','discipline'], areas:['block区域','block','bolck','区域','areas','area'], phase:['submissionphase提交阶段','提交阶段submissionphase','提交阶段','submissionphase','phase'],
  window:['phasewindow阶段窗口','阶段窗口phasewindow','阶段窗口','phasewindow'], start:['planstart计划开始','计划开始start','计划开始','planstart','start'], finish:['planfinish计划结束','计划结束finish','计划结束','planfinish','finish','承诺日期'],
  actual:['actualsubmission实际提交日期','实际提交日期submissiondate','实际提交日期','submissiondate','actualsubmission'], progress:['progress完成率','完成率progress','完成率','progress'],
  status:['status状态','状态status','状态','status'], explanation:['explanation解释说明','解释说明','explanation'], remarks:['remarks备注','备注','remarks','comments','意见'],
  contacts:['contacts对接人','对接人','contacts','contact','owner','主责人'], updating:['updating','更新记录'], type:['type类型','类型','type'], key:['key重点','重点','key'],
  ownerVisible:['external对外','对外','external'], extNote:['externalnote对外备注','对外备注','externalnote'], intNote:['internalnote内部备注','内部备注','internalnote'], deps:['predecessors前置项','前置项','predecessors'], ownerResult:['ownerresult业主结果','业主结果','ownerresult']
};
function normH(h){ return String(h == null ? '' : h).toLowerCase().replace(/[\s\/／\\()（）:：_\-]+/g, ''); }
function mapHeader(h){
  var n = normH(h); if(!n) return null; var best = null, bl = 0;
  Object.keys(SYN).forEach(function(k){ SYN[k].forEach(function(s){ if((n === s || n.indexOf(s) >= 0) && s.length > bl){ best = k; bl = s.length; } }); });
  return best;
}
function itemRow(it){
  var n = TI.by[it.node] || {}, l1 = l1Of(it.node) || {}, t = typeOf(it.type), s = statusOf(it.status), o = orOf(it.ownerResult), dp = deptOf(it.dept);
  var vals = {regNo:it.regNo || '', docNo:it.docNo || '', rev:it.rev || '', package:l1.code ? l1.code + (l1.zh || l1.en || '') : '', classCode:n.code || '', dept:dp ? dp.zh || dp.en : '',
    zh:it.zh || '', en:it.en || '', disc:(it.disc || []).map(function(c){ return c + (discOf(c).zh || ''); }).join(', '), areas:(it.areas || []).join(', '), phase:it.phase || '', window:phaseWindow(it.phase),
    start:it.start || '', finish:it.finish || '', actual:it.actualStart ? it.actualStart.replace(/-/g, '.') + '-' + (it.actualEnd ? it.actualEnd.replace(/-/g, '.') : (it.ongoing ? 'on going' : '')) : '',
    progress:+it.progress || 0, status:s.en, explanation:it.explanation || '', remarks:it.remarks || '', contacts:contactsText(it), updating:(it.updates || []).map(function(u){ return '>_' + (u.d || '').replace(/-/g, '.') + ': ' + (u.text || ''); }).join('\n'),
    type:t.en, key:it.key ? 'Yes' : '', ownerVisible:it.ownerVisible ? 'Yes' : 'No', extNote:it.extNote || '', intNote:it.intNote || '', deps:(it.deps || []).join(', '), ownerResult:o ? o.en : ''};
  var r = XH.map(function(x){ return vals[x[0]]; });
  (cfg().customFields || []).forEach(function(cf){ var v = (it.custom || {})[cf.key]; r.push(v == null ? '' : v); });
  return r;
}
function saveXlsx(filename, sheets){
  if(!window.XLSX){ toast(T('The Excel library did not load. Reload the page.', 'Excel 组件未加载，请刷新页面。')); return; }
  var wb = XLSX.utils.book_new();
  sheets.forEach(function(sh){ var ws = XLSX.utils.aoa_to_sheet(sh.rows); ws['!cols'] = sh.rows[0].map(function(_, i){ var w = 10; sh.rows.slice(0, 200).forEach(function(r){ w = Math.max(w, Math.min(50, String(r[i] == null ? '' : r[i]).length + 2)); }); return {wch:w}; }); if(sh.rows.length > 1) ws['!autofilter'] = {ref: XLSX.utils.encode_range({s:{r:0, c:0}, e:{r:sh.rows.length - 1, c:sh.rows[0].length - 1}})}; XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31)); });
  XLSX.writeFile(wb, filename);
}
function fname(s){ return cfg().projectEn.replace(/[^\w.-]+/g, '_') + '_' + s + '_' + n2d(TODAY) + '.xlsx'; }
function exportRegister(list){ saveXlsx(fname('register'), [{name:'Register', rows:[XH.map(function(x){ return x[1]; }).concat((cfg().customFields || []).map(function(cf){ return cf.en; }))].concat(list.map(itemRow))}]); }
function exportOwner(groups, fields, name){
  var head = ['Package / 文件包'];
  fields.forEach(function(f){ var d = OF.filter(function(o){ return o[0] === f; })[0] || [f, f, '']; head.push(d[1] + ' / ' + d[2]); if(['title','class','status','ownerResult','areas','dept','disc','actual'].indexOf(f) >= 0) head.push(d[1] + ' (中文)'); });
  var rows = [head];
  groups.forEach(function(g){ g.rows.forEach(function(r){ var cells = r.cells || r, line = [(g.code ? g.code + ' ' : '') + g.en + (g.zh ? ' / ' + g.zh : '')]; cells.forEach(function(v, i){ line.push(v.en); if(['title','class','status','ownerResult','areas','dept','disc','actual'].indexOf(fields[i]) >= 0) line.push(v.zh); }); rows.push(line); }); });
  saveXlsx(name, [{name:'Owner plan', rows:rows}]);
}
function importFile(file){
  if(!window.XLSX){ toast(T('The Excel library did not load. Reload the page.', 'Excel 组件未加载，请刷新页面。')); return; }
  var rd = new FileReader();
  rd.onload = function(){
    try{
      var wb = XLSX.read(rd.result, {type:'array', cellDates:true});
      var best = null;
      wb.SheetNames.forEach(function(sn){
        var aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], {header:1, defval:'', raw:true, blankrows:false});
        for(var r = 0; r < Math.min(15, aoa.length); r++){
          var m = aoa[r].map(mapHeader), score = m.filter(Boolean).length;
          if(score >= 3 && (!best || score > best.score)) best = {sn:sn, aoa:aoa, hr:r, map:m, score:score};
        }
      });
      if(!best){ toast(T('No header row found. The first rows need column names such as 文件名称, Document Title or Status.', '找不到表头行，请确认前几行有「文件名称」「Document Title」「Status」等列名。')); return; }
      S.imp = planImport(best, file.name);
    }catch(err){ console.error(err); S.imp = null; toast(T('Could not read this file. Save it as .xlsx and try again.', '无法读取此文件，请另存为 .xlsx 后重试。')); }
    renderView();
  };
  rd.readAsArrayBuffer(file);
}
function planImport(best, name){
  var c = clone(cfg()), tree = clone((STORE && STORE.tree) || []), hdr = best.aoa[best.hr], map = best.map;
  var mapped = [], unknown = [];
  hdr.forEach(function(h, i){ if(!String(h).trim()) return; if(map[i]) mapped.push(String(h).replace(/\s+/g, ' ').trim()); else unknown.push(String(h).replace(/\s+/g, ' ').trim()); });
  var newLists = [], adds = [], updates = [], errors = [];
  var byReg = {}, byDoc = {}; items().forEach(function(it){ if(it.regNo) byReg[String(it.regNo).trim().toUpperCase()] = it; if(it.docNo) byDoc[String(it.docNo).trim().toUpperCase()] = it; });
  function findL(list, v, keys){ v = String(v || '').trim().toLowerCase(); if(!v) return null; return list.filter(function(x){ return keys.some(function(k){ var y = String(x[k] || '').toLowerCase(); return y && (y === v || v.indexOf(y) >= 0 && y.length >= 2); }); })[0] || null; }
  function pkgNode(v){
    var s = String(v || '').trim(); if(!s) return null;
    var m = /^(P\d+)\s*(.*)$/i.exec(s), code = m ? m[1].toUpperCase() : '', rest = m ? m[2].trim() : s;
    var n = tree.filter(function(x){ return (code && String(x.code).toUpperCase() === code) || (!code && (x.zh === s || x.en === s)); })[0];
    if(!n){ n = {id:uid('n'), parent:'', code:code, en:/[一-鿿]/.test(rest) ? '' : rest, zh:/[一-鿿]/.test(rest) ? rest : ''}; if(!n.en && !n.zh) n.en = s; tree.push(n); newLists.push(T('package ', '文件包 ') + s); }
    return n.id;
  }
  var colOf = {}; map.forEach(function(k, i){ if(k && colOf[k] === undefined) colOf[k] = i; });
  var get = function(row, k){ var i = colOf[k]; return i === undefined ? '' : row[i]; };
  var seen = {};
  best.aoa.slice(best.hr + 1).forEach(function(row, ri){
    var line = best.hr + ri + 2, o = {};
    var zh = String(get(row, 'zh') || '').trim(), en = String(get(row, 'en') || '').trim(), task = String(get(row, 'task') || '').trim();
    if(task && !en && !zh){ var parts = task.split(/\s*\/\s*/); parts.forEach(function(p){ if(/[一-鿿]/.test(p)) zh = zh || p; else en = en ? en + ' / ' + p : p; }); }
    var reg = String(get(row, 'regNo') || '').trim(), doc = String(get(row, 'docNo') || '').trim();
    if(!zh && !en && !doc) return;
    if(zh) o.zh = zh; if(en) o.en = en;
    if(doc) o.docNo = doc;
    var v;
    if((v = String(get(row, 'rev') || '').trim())) o.rev = v;
    if((v = String(get(row, 'classCode') || '').trim())){ var cn = tree.filter(function(x){ return String(x.code).toLowerCase() === v.toLowerCase(); })[0]; if(cn) o.node = cn.id; }
    if(!o.node && (v = String(get(row, 'package') || '').trim())) o.node = pkgNode(v);
    if((v = String(get(row, 'dept') || '').trim())){ var dp = findL(c.depts, v, ['zh','en','code']); if(!dp){ dp = {code:v.replace(/[^\w]/g, '').toUpperCase().slice(0, 6) || uid('D').slice(0, 6), en:/[一-鿿]/.test(v) ? '' : v, zh:/[一-鿿]/.test(v) ? v : ''}; if(!dp.en) dp.en = v; c.depts.push(dp); newLists.push(T('department ', '部门 ') + v); } o.dept = dp.code; }
    if((v = String(get(row, 'disc') || '').trim())){ o.disc = splitList(v, /\s*[,，;；、\/\n]\s*/).map(function(p){ var m = /^([a-zA-Z]+)\s*(.*)$/.exec(p.trim()), code = m ? m[1].toLowerCase() : p.trim(), zz = m ? m[2].trim() : ''; if(!c.discs.some(function(x){ return x.code === code; })){ c.discs.push({code:code, en:code, zh:zz}); newLists.push(T('discipline ', '专业 ') + code); } return code; }); }
    if((v = String(get(row, 'areas') || '').trim())){ o.areas = splitList(v.replace(/block|区/ig, ' '), /[\s,，;、\/&+]+/).map(function(a){ var id = a.toUpperCase().trim(); if(!c.areas.some(function(x){ return x.id === id; })){ c.areas.push({id:id, en:'Block ' + id, zh:id + '区', color:'grey'}); newLists.push(T('block ', '区域 ') + id); } return id; }); }
    if((v = String(get(row, 'phase') || '').trim())){ var pm = /PH\s*-?\s*(\d+)/i.exec(v) || /phase\s*(\d+)/i.exec(v); if(pm){ var code = 'PH-' + pad(+pm[1]); if(!c.phases.some(function(x){ return x.code === code; })){ var w = String(get(row, 'window') || ''), wm = /(\d{1,2})\s*([A-Za-z]{3})\w*\s*[–\-~至]\s*(\d{1,2})\s*([A-Za-z]{3})\w*\s*(\d{4})/.exec(w); var mi = function(s){ return MON.map(function(x){ return x.toLowerCase(); }).indexOf(s.toLowerCase().slice(0, 3)); }; c.phases.push({code:code, en:'Phase ' + (+pm[1]), zh:'第' + (+pm[1]) + '阶段', start: wm ? wm[5] + '-' + pad(mi(wm[2]) + 1) + '-' + pad(wm[1]) : '', end: wm ? wm[5] + '-' + pad(mi(wm[4]) + 1) + '-' + pad(wm[3]) : ''}); newLists.push(T('phase ', '阶段 ') + code); } o.phase = code; } }
    if((v = get(row, 'start')) !== ''){ var sd = parseDate(v); if(sd) o.start = sd; }
    if((v = get(row, 'finish')) !== ''){ var fd = parseDate(v); if(fd) o.finish = fd; }
    if((v = String(get(row, 'actual') || '').trim())){ var am = /(\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2})(?:\s*[-–~至]\s*(\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}|on\s*going|ongoing|进行中))?/i.exec(v); if(am){ o.actualStart = parseDate(am[1]); if(am[2] && /\d/.test(am[2])){ o.actualEnd = parseDate(am[2]); o.ongoing = false; } else if(am[2]){ o.ongoing = true; o.actualEnd = ''; } } else if(get(row, 'actual') instanceof Date){ o.actualStart = parseDate(get(row, 'actual')); } }
    if((v = get(row, 'progress')) !== '' && v != null){ var pv = parseFloat(String(v).replace('%', '')); if(!isNaN(pv)) o.progress = clamp(Math.round(pv > 0 && pv <= 1 && String(v).indexOf('%') < 0 ? pv * 100 : pv), 0, 100); }
    if((v = String(get(row, 'status') || '').trim())){ var low = v.toLowerCase(), st = c.statuses.filter(function(s){ return [s.key, s.en, s.zh].some(function(y){ y = String(y || '').toLowerCase(); return y && (low === y || low.indexOf(y) >= 0); }); })[0]; if(!st && /complete|完成|done/.test(low)) st = c.statuses.filter(function(s){ return s.done; })[0]; if(st) o.status = st.key; else errors.push('Row ' + line + ': status “' + v + '” not recognised (kept empty)'); }
    if((v = String(get(row, 'explanation') || '').trim())) o.explanation = v;
    if((v = String(get(row, 'remarks') || '').trim())) o.remarks = v;
    if((v = String(get(row, 'contacts') || '').trim())) o.contacts = splitList(v);
    if((v = String(get(row, 'updating') || '').trim())){ o.updates = v.split(/(?=>_)/).map(function(x){ x = x.replace(/^>_\s*/, '').trim(); var um = /^(\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2})\s*[:：]?\s*([\s\S]*)$/.exec(x); return um ? {d:parseDate(um[1]), text:um[2].trim()} : {d:'', text:x}; }).filter(function(u){ return u.text; }); }
    if((v = String(get(row, 'type') || '').trim())){ var tp = findL(c.types, v, ['key','en','zh']); if(tp) o.type = tp.key; }
    if((v = String(get(row, 'key') || '').trim())) o.key = /^(y|yes|true|1|是|★|重点)/i.test(v);
    if((v = String(get(row, 'ownerVisible') || '').trim())) o.ownerVisible = /^(y|yes|true|1|是|对外)/i.test(v);
    if((v = String(get(row, 'extNote') || '').trim())) o.extNote = v;
    if((v = String(get(row, 'intNote') || '').trim())) o.intNote = v;
    if((v = String(get(row, 'deps') || '').trim())) o.deps = splitList(v, /[\s,，;]+/).map(function(s){ return s.toUpperCase(); });
    if((v = String(get(row, 'ownerResult') || '').trim())){ var orr = findL(c.ownerResults, v, ['key','en','zh']); if(orr) o.ownerResult = orr.key; }
    var regU = reg.toUpperCase(), ex = (regU && byReg[regU] && !/^\d+$/.test(regU)) ? byReg[regU] : (doc && byDoc[doc.toUpperCase()]) || null;
    if(!ex && (zh || en)) ex = items().filter(function(x){ return (!zh || x.zh === zh) && (!en || x.en === en) && (x.zh || x.en); })[0] || null;
    var keyS = ex ? ex.id : (doc ? 'd:' + doc.toUpperCase() : '');
    if(keyS && seen[keyS]){ errors.push('Row ' + line + ': duplicate of an earlier row (' + (doc || reg) + ')'); return; } if(keyS) seen[keyS] = 1;
    if(ex) updates.push({id:ex.id, o:o}); else adds.push({reg: /^\d+$/.test(reg) ? '' : reg, o:o, line:line});
  });
  return {name:name, sheet:best.sn, adds:adds, updates:updates, errors:errors, unknown:unknown, mapped:mapped, newLists:newLists, cfg:c, tree:tree};
}
async function runImport(){
  var im = S.imp; if(!im || !canEdit()) return; S.imp = null; renderView();
  try{
    var base = cfg(), cp = {};
    ['depts','discs','areas','phases'].forEach(function(k){ if(JSON.stringify(im.cfg[k]) !== JSON.stringify(base[k])) cp[k] = im.cfg[k]; });
    if(Object.keys(cp).length) await STORE.saveCfg(cp);
    if(JSON.stringify(im.tree) !== JSON.stringify((STORE && STORE.tree) || [])) await STORE.saveTree(im.tree);
  }catch(e){ toast(errText(e)); return; }
  buildTI();
  var jobs = [], used = {}, who = (STORE.me && (STORE.me.name || STORE.me.email)) || '';
  items().forEach(function(it){ used[it.regNo] = 1; });
  im.updates.forEach(function(u){ jobs.push(function(){ return setFields(u.id, u.o); }); });
  im.adds.forEach(function(a){
    var type = a.o.type || (a.o.docNo || a.o.node ? 'deliverable' : 'activity');
    var reg = a.reg && !used[a.reg] ? a.reg : null;
    if(!reg){ var pre = String(typeOf(type).prefix || 'ITM').toUpperCase(), n = 1; while(used[pre + '-' + String(n).padStart(3, '0')]) n++; reg = pre + '-' + String(n).padStart(3, '0'); }
    used[reg] = 1;
    var doc = Object.assign(blankItem(type), {regNo:reg, start:'', finish:'', areas:[], node:'', phase:'', dept:'', disc:[], contacts:[], history:[{t:new Date().toISOString(), by:who, f:'imported', from:'', to:im.name}]}, a.o, {type:type});
    if(typeOf(type).shape === 'milestone' && doc.finish) doc.start = doc.finish;
    if(statusOf(doc.status).done && !a.o.progress) doc.progress = 100;
    jobs.push(function(){ return STORE.createItem(uid('i'), doc); });
  });
  var total = jobs.length, failed = 0, done = 0;
  while(jobs.length){
    var batch = jobs.splice(0, 8);
    await Promise.all(batch.map(function(j){ return j().catch(function(){ failed++; }); }));
    done += batch.length; toast(T('Importing ', '导入中 ') + done + '/' + total);
  }
  toast(T('Import finished: ', '导入完成：') + (total - failed) + '/' + total);
}

/* ===== events ===== */
document.addEventListener('click', function(e){
  var cell = e.target.closest && e.target.closest('[data-ed]');
  if(cell && canEdit() && !cell.querySelector('.inl') && !e.target.closest('[data-act]')){
    var it = getItem(cell.dataset.id); if(!it) return;
    cell.innerHTML = editorHTML(cell.dataset.f, it); var el = cell.querySelector('.inl'); if(el){ el.focus(); if(el.select && el.type === 'text') el.select(); }
    return;
  }
  var a = e.target.closest && e.target.closest('[data-act]'); if(!a) return;
  var act = a.dataset.act, v = a.dataset.v, id = a.dataset.id, it;
  var menu = a.closest('details.menu'); if(menu) menu.open = false;
  switch(act){
    case 'tab': S.view = v; LS.set('ww.view', v); S.snapView = null; if(v === 'gantt') S.gScroll = true; renderAll(); window.scrollTo(0, 0); break;
    case 'lang': S.lang = v; LS.set('ww.lang', v); renderAll(); break;
    case 'open': if((a.classList.contains('bw') || a.classList.contains('ms')) && S.suppressOpen && Date.now() - S.suppressOpen < 400) return; openItem(id); break;
    case 'close': S.open = null; S.delAsk = false; renderDrawer(); break;
    case 'farea': var i = S.f.areas.indexOf(v); if(i >= 0) S.f.areas.splice(i, 1); else S.f.areas.push(v); renderFilters(); renderView(); break;
    case 'clearf': S.f = emptyF(); renderFilters(); renderView(); break;
    case 'fToggle': S.fOpen = !S.fOpen; renderFilters(); break;
    case 'tnode': S.f.node = v; if(v !== 'all' && v !== 'none') S.exp[v] = true; LS.set('ww.exp', S.exp); renderFilters(); renderView(); break;
    case 'texp': S.exp[v] = !S.exp[v]; LS.set('ww.exp', S.exp); renderView(); break;
    case 'new': newItem(v); break;
    case 'gAdd': gAdd(v); break;
    case 'togvis': it = getItem(id); if(it) setField(id, 'ownerVisible', !it.ownerVisible); break;
    case 'togkey': it = getItem(id); if(it) setField(id, 'key', !it.key); break;
    case 'sort': if(S.sort.k === v) S.sort.d = -S.sort.d; else S.sort = {k:v, d:1}; LS.set('ww.sort2', S.sort); renderView(); break;
    case 'density': S.compact = !S.compact; LS.set('ww.compact', S.compact); renderView(); break;
    case 'selNone': S.sel = {}; S.bulkDelAsk = false; renderView(); break;
    case 'bulkDelAsk': S.bulkDelAsk = true; renderView(); break;
    case 'bulkDelNo': S.bulkDelAsk = false; renderView(); break;
    case 'bulkDelYes': var ids = Object.keys(S.sel).filter(function(k){ return S.sel[k]; }); S.sel = {}; S.bulkDelAsk = false; Promise.all(ids.map(function(x){ return STORE.deleteItem(x); })).then(function(){ toast(T('Deleted ', '已删除 ') + ids.length); }); break;
    case 'editTree': S.view = 'settings'; S.stab = 'tree'; LS.set('ww.view', 'settings'); renderAll(); break;
    case 'gotoData': S.view = 'settings'; S.stab = 'data'; LS.set('ww.view', 'settings'); renderAll(); break;
    case 'gotoOwnerFields': S.view = 'settings'; S.stab = 'ownerf'; LS.set('ww.view', 'settings'); renderAll(); break;
    case 'goArea': S.f = emptyF(); S.f.areas = [v]; S.view = 'register'; LS.set('ww.view', 'register'); renderAll(); break;
    case 'goNode': S.f = emptyF(); S.f.node = v; S.exp[v] = true; S.view = 'register'; LS.set('ww.view', 'register'); renderAll(); break;
    case 'goPhase': S.f = emptyF(); S.f.phase = v; S.view = 'register'; LS.set('ww.view', 'register'); renderAll(); break;
    case 'kOver': S.f = emptyF(); S.f.overdue = true; S.view = 'register'; renderAll(); break;
    case 'kCom': S.f = emptyF(); S.f.comments = true; S.view = 'register'; renderAll(); break;
    case 'gzoom': S.g.zoom = v; LS.set('ww.g2', S.g); S.gScroll = true; renderView(); break;
    case 'gcol': S.gcol[v] = !S.gcol[v]; renderView(); break;
    case 'gToAsOf': S.gScroll = true; renderView(); break;
    case 'baseline': var its = filtered().filter(function(x){ return planOf(x); }); Promise.all(its.map(function(x){ var p = planOf(x); return setFields(x.id, {baseStart:n2d(p.s), baseFinish:n2d(p.f)}); })).then(function(){ toast(T('Baseline saved for ', '已保存基线：') + its.length); }); break;
    case 'baseOne': it = getItem(S.open); if(it){ var pp = planOf(it); if(pp) setFields(it.id, {baseStart:n2d(pp.s), baseFinish:n2d(pp.f)}); } break;
    case 'dArea': case 'dDisc': it = getItem(S.open); if(!it || !canEdit()) return; var fld = act === 'dArea' ? 'areas' : 'disc', ar = (it[fld] || []).slice(), k2 = ar.indexOf(v); if(k2 >= 0) ar.splice(k2, 1); else ar.push(v); var ord = (act === 'dArea' ? cfg().areas.map(function(x){ return x.id; }) : cfg().discs.map(function(x){ return x.code; })); ar.sort(function(x, y){ return ord.indexOf(x) - ord.indexOf(y); }); setField(it.id, fld, ar); break;
    case 'delAsk': S.delAsk = true; renderDrawer(); break;
    case 'delNo': S.delAsk = false; renderDrawer(); break;
    case 'delYes': var did = S.open; S.open = null; S.delAsk = false; renderDrawer(); STORE.deleteItem(did).then(function(){ toast(T('Deleted', '已删除')); }); break;
    case 'attRm': it = getItem(S.open); if(it){ var at = (it.attachments || []).slice(); at.splice(+v, 1); setField(it.id, 'attachments', at); } break;
    case 'updRm': it = getItem(S.open); if(it){ var up = (it.updates || []).slice(); up.splice(+v, 1); setField(it.id, 'updates', up); } break;
    case 'stab': S.stab = v; if(v === 'users' && STORE.reloadUsers) STORE.reloadUsers(); renderView(); break;
    case 'saveDraft': saveDraft(v); break;
    case 'discardDraft': S.dirty[v] = false; S.draft[v] = null; renderView(); break;
    case 'tUp': case 'tDown': case 'tIn': case 'tOut': case 'tAdd': case 'tDel': treeOp(act, v); break;
    case 'lAdd': ensureDraft(v); S.draft[v].push(LISTS[v].blank()); markDirty(v); renderView(); break;
    case 'lUp': case 'lDown': case 'lDel': var pr = v.split('|'), nm = pr[0], ix = +pr[1]; ensureDraft(nm); var arr = S.draft[nm];
      if(act === 'lDel') arr.splice(ix, 1); else { var j = act === 'lUp' ? ix - 1 : ix + 1; if(j < 0 || j >= arr.length) return; var tmp = arr[ix]; arr[ix] = arr[j]; arr[j] = tmp; }
      markDirty(nm); renderView(); break;
    case 'exportReg': S._to = treeOrder(); exportRegister(filtered().sort(function(x, y){ return sortVal(x, 'class') - sortVal(y, 'class'); })); break;
    case 'exportAll': S._to = treeOrder(); exportRegister(items().slice().sort(function(x, y){ return sortVal(x, 'class') - sortVal(y, 'class'); })); break;
    case 'template': saveXlsx('work-web_template.xlsx', [{name:'Register', rows:[XH.map(function(x){ return x[1]; })]}]); break;
    case 'impYes': runImport(); break;
    case 'impNo': S.imp = null; renderView(); break;
    case 'clearAsk': S.clearAsk = true; renderView(); break;
    case 'clearNo': S.clearAsk = false; renderView(); break;
    case 'clearYes': S.clearAsk = false; STORE.clearItems().then(function(){ toast(T('All items deleted', '已删除全部记录')); }).catch(function(er){ toast(errText(er)); }); break;
    case 'resetDemo': STORE.resetDemo(); break;
    case 'otab': S.otab = v; S.snapView = null; renderView(); break;
    case 'exportOwner': var fl = cfg().ownerFields || []; exportOwner(ownerGroups(items().filter(function(x){ return x.ownerVisible && match(x); }), fl), fl, fname('owner_plan')); break;
    case 'snapSave': saveSnapshot(); break;
    case 'snapView': S.snapView = v; renderView(); break;
    case 'snapBack': S.snapView = null; renderView(); break;
    case 'snapExport': var sn = ((STORE && STORE.pubs) || []).filter(function(x){ return x.id === v; })[0]; if(sn) exportOwner(sn.groups || [], sn.fields || [], fname(sn.no)); break;
    case 'snapDelAsk': S.snapDelAsk = v; renderView(); break;
    case 'snapDelNo': S.snapDelAsk = null; renderView(); break;
    case 'snapDelYes': S.snapDelAsk = null; STORE.deletePub(v).catch(function(er){ toast(errText(er)); }); break;
    case 'fbOpen': S.fbFor = S.fbFor === v ? null : v; renderView(); break;
    case 'fbClose': S.fbFor = null; renderView(); break;
    case 'authTab': S.auth.tab = v; S.auth.err = ''; S.auth.msg = ''; renderGate(); break;
    case 'signOut': STORE.signOut && STORE.signOut(); break;
    case 'recheck': STORE.boot && STORE.boot(); break;
    case 'reloadUsers': STORE.reloadUsers && STORE.reloadUsers(); break;
  }
});
function gAdd(k){
  var mode = S.view === 'gantt' ? S.g.group : S.regGroup, extra = {};
  var sample = filtered().filter(function(it){ return groupOf(it, mode).k === k; })[0];
  if(sample){ var g = groupOf(sample, mode); if(g.node) extra.node = g.node; if(g.phase) extra.phase = g.phase; if(g.areas) extra.areas = g.areas; if(g.dept) extra.dept = g.dept; if(g.disc) extra.disc = g.disc; if(g.status) extra.status = g.status; if(g.contacts) extra.contacts = g.contacts; if(g.type) extra.type = g.type; }
  newItem(extra.type || (S.view === 'gantt' ? 'activity' : 'deliverable'), extra);
}
function saveSnapshot(){
  if(!canEdit()) return;
  var fields = (cfg().ownerFields || []).slice(), list = items().filter(function(x){ return x.ownerVisible && match(x); });
  var max = 0; ((STORE && STORE.pubs) || []).forEach(function(s){ var m = /PUB-(\d+)/.exec(s.no || ''); if(m) max = Math.max(max, +m[1]); });
  var no = 'PUB-' + String(max + 1).padStart(3, '0'), note = ($('#snapNote') || {}).value || '';
  var data = {no:no, at:new Date().toISOString(), by:(STORE.me && (STORE.me.name || STORE.me.email)) || '', note:note, fields:fields, groups:ownerGroups(list, fields), count:list.length};
  STORE.createPub(no, data).then(function(){ toast(T('Published ', '已发布 ') + no); S.otab = 'snaps'; renderView(); }).catch(function(er){ toast(errText(er)); });
}
document.addEventListener('change', function(e){
  var el = e.target;
  var fmap = {fnode:'node', ftype:'type', fstatus:'status', fphase:'phase', fdept:'dept', fdisc:'disc', fcontact:'contact'};
  if(fmap[el.id]){ S.f[fmap[el.id]] = el.value || (el.id === 'fnode' ? 'all' : ''); renderFilters(); renderView(); return; }
  if(el.id === 'fover'){ S.f.overdue = el.checked; renderFilters(); renderView(); return; }
  if(el.id === 'fcom'){ S.f.comments = el.checked; renderFilters(); renderView(); return; }
  if(el.id === 'fkey'){ S.f.key = el.checked; renderFilters(); renderView(); return; }
  if(el.id === 'rgroup'){ S.regGroup = el.value; LS.set('ww.rgroup', S.regGroup); renderView(); return; }
  if(el.id === 'ggroup'){ S.g.group = el.value; LS.set('ww.g2', S.g); renderView(); return; }
  if(el.id === 'gcolor'){ S.g.color = el.value; LS.set('ww.g2', S.g); renderView(); return; }
  if(el.id === 'gleftc'){ S.g.left = el.value; LS.set('ww.g2', S.g); renderView(); return; }
  if(el.id === 'gph'){ S.g.phases = el.checked; LS.set('ww.g2', S.g); renderView(); return; }
  if(el.id === 'gStart' || el.id === 'cfgGStart'){ if(canEdit()) STORE.saveCfg({ganttStart: el.value || ''}).catch(function(er){ toast(errText(er)); }); return; }
  if(el.id === 'gAsOf' || el.id === 'cfgAsOf'){ if(canEdit()) STORE.saveCfg({asOf: el.value || ''}).catch(function(er){ toast(errText(er)); }); else { S.asOfLocal = el.value || null; renderView(); } return; }
  if(el.id === 'pubSel'){ S.pubSel = el.value; S.fbFor = null; renderView(); return; }
  if(el.dataset.inline && el.tagName === 'SELECT'){ commitInline(el); return; }
  if(el.classList.contains('rowsel')){ S.sel[el.dataset.id] = el.checked; S.bulkDelAsk = false; renderView(); return; }
  if(el.id === 'selall'){ var on = el.checked; S.sel = {}; if(on) filtered().forEach(function(it){ S.sel[it.id] = true; }); renderView(); return; }
  if(el.dataset.col){ var k = el.dataset.col, i = S.cols.indexOf(k); if(el.checked && i < 0) S.cols.push(k); if(!el.checked && i >= 0) S.cols.splice(i, 1); var ordr = allCols().map(function(x){ return x[0]; }); S.cols.sort(function(a, b){ return ordr.indexOf(a) - ordr.indexOf(b); }); LS.set('ww.cols2', S.cols); renderView(); return; }
  if(el.dataset.role){ STORE.setRole(el.dataset.role, el.value).then(function(){ toast(T('Role updated', '角色已更新')); }).catch(function(er){ toast(errText(er)); }); return; }
  if(el.dataset.bulk){ var f = el.dataset.bulk, val = el.value; if(!val) return; var ids = Object.keys(S.sel).filter(function(x){ return S.sel[x] && getItem(x); });
    Promise.all(ids.map(function(x){ var it = getItem(x);
      if(f === 'addArea'){ var ar = (it.areas || []).slice(); if(ar.indexOf(val) < 0) ar.push(val); return setField(x, 'areas', ar); }
      if(f === 'addContact'){ var cs = (it.contacts || []).slice(); if(cs.indexOf(val) < 0) cs.push(val); return setField(x, 'contacts', cs); }
      if(f === 'ext') return setField(x, 'ownerVisible', val === '1');
      if(f === 'key') return setField(x, 'key', val === '1');
      if(f === 'phase') return setField(x, 'phase', val === '__clear' ? '' : val);
      if(f === 'status'){ var o = {status:val}; if(statusOf(val).done) o.progress = 100; return setFields(x, o); }
      return setField(x, f, val); })).then(function(){ toast(T('Updated ', '已更新 ') + ids.length); });
    return; }
  if(el.dataset.df){ var it2 = getItem(S.open); if(!it2) return; var fld = el.dataset.df, v = el.type === 'checkbox' ? el.checked : el.value;
    if(fld === 'progress'){ v = clamp(Math.round(+v || 0), 0, 100); }
    if(fld === 'deps') v = splitList(v, /[\s,，;]+/).map(function(s){ return s.toUpperCase(); });
    if(fld === 'contacts') v = splitList(v);
    if(fld === 'regNo'){ v = String(v).trim(); if(!v || items().some(function(x){ return x.id !== it2.id && x.regNo === v; })){ toast(T('That No. is already used', '该序号已被使用')); el.value = it2.regNo; return; } }
    var o2 = {}; o2[fld] = v;
    if(fld === 'start' || fld === 'finish') o2 = dateFix(it2, fld, v);
    if(fld === 'status' && statusOf(v).done) o2.progress = 100;
    if(fld === 'progress' && v === 100){ var dk = (cfg().statuses.filter(function(s){ return s.done; })[0] || {}).key; if(dk && !isDone(it2)) o2.status = dk; }
    if(fld === 'actualEnd' && v) o2.ongoing = false;
    if(fld === 'type' && typeOf(v).shape === 'milestone' && it2.finish) o2.start = it2.finish;
    setFields(it2.id, o2); return; }
  if(el.dataset.dc){ var it3 = getItem(S.open); if(!it3) return; var cus = Object.assign({}, it3.custom || {}); cus[el.dataset.dc] = el.dataset.kind === 'number' && el.value !== '' ? +el.value : el.value; setFields(it3.id, {custom:cus}); return; }
  if(el.dataset.ld && (el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'date')){ var p = el.dataset.ld.split('|'); ensureDraft(p[0]); S.draft[p[0]][+p[1]][p[2]] = el.type === 'checkbox' ? el.checked : el.value; markDirty(p[0]); return; }
  if(el.dataset.of){ var cur = (cfg().ownerFields || []).slice(), ki = cur.indexOf(el.dataset.of); if(el.checked && ki < 0) cur.push(el.dataset.of); if(!el.checked && ki >= 0) cur.splice(ki, 1); var ord2 = OF.map(function(o){ return o[0]; }); cur.sort(function(a, b){ return ord2.indexOf(a) - ord2.indexOf(b); }); STORE.saveCfg({ownerFields:cur}).catch(function(er){ toast(errText(er)); }); return; }
  if(el.id === 'impFile' && el.files && el.files[0]){ importFile(el.files[0]); el.value = ''; return; }
  if(el.id === 'attFile' && el.files && el.files.length){ uploadFiles(Array.prototype.slice.call(el.files)); el.value = ''; return; }
});
document.addEventListener('input', function(e){
  var el = e.target;
  if(el.id === 'fq'){ S.f.q = el.value; renderView(); return; }
  if(el.dataset.td){ var p = el.dataset.td.split('|'); ensureDraft('tree'); var n = S.draft.tree.filter(function(x){ return x.id === p[0]; })[0]; if(n){ n[p[1]] = el.value; markDirty('tree'); } return; }
  if(el.dataset.ld && el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'date'){ var q = el.dataset.ld.split('|'); ensureDraft(q[0]); S.draft[q[0]][+q[1]][q[2]] = el.value; markDirty(q[0]); return; }
  if(el.dataset.pd){ ensureDraft('proj'); S.draft.proj[el.dataset.pd] = el.value; markDirty('proj'); return; }
});
document.addEventListener('submit', function(e){
  var fm = e.target; e.preventDefault();
  if(fm.id === 'fAuth'){
    var a = S.auth, email = ($('#aEmail') || {}).value, pw = ($('#aPw') || {}).value, name = ($('#aName') || {}).value;
    a.err = ''; a.msg = ''; a.busy = true; renderGate();
    var pr = a.tab === 'in' ? STORE.signIn(email, pw) : a.tab === 'up' ? STORE.signUp(email, pw, name) : STORE.reset(email);
    pr.then(function(r){
      a.busy = false;
      if(r && r.error){ a.err = r.error.message; }
      else if(a.tab === 'up') a.msg = T('Check your email to confirm the account, then sign in.', '请到邮箱点击确认链接，然后登录。');
      else if(a.tab === 'reset') a.msg = T('If that email has an account, a reset link is on its way.', '如该邮箱已注册，重置链接已发出。');
      renderGate();
    }).catch(function(err){ a.busy = false; a.err = String(err && err.message || err); renderGate(); });
    return;
  }
  if(fm.id === 'fRecover'){ STORE.setPassword(($('#aPw') || {}).value).then(function(r){ if(r.error){ S.auth.err = r.error.message; renderGate(); return; } S.recovery = false; toast(T('Password saved', '密码已保存')); STORE.boot(); }); return; }
  if(fm.id === 'fUpd'){ var it = getItem(S.open); var t = ($('#updT') || {}).value, d = ($('#updD') || {}).value; if(it && t){ setField(it.id, 'updates', (it.updates || []).concat([{d:d, text:t}])); } return; }
  if(fm.id === 'fFb'){ var body = ($('#fbBody') || {}).value; if(!body) return; var pub = S.pubSel || (((STORE && STORE.pubs) || [])[0] || {}).id || null; STORE.addFeedback({pub_id:pub, item_id:fm.dataset.item, reg_no:fm.dataset.reg, body:body}).then(function(){ toast(T('Comment sent', '意见已提交')); renderView(); }).catch(function(er){ toast(errText(er)); }); return; }
  if(fm.classList.contains('fbReply')){ var rep = fm.querySelector('[name=reply]').value; STORE.updateFeedback(fm.dataset.id, {status:'resolved', reply:rep || null, resolved_at:new Date().toISOString()}).then(function(){ toast(T('Resolved', '已关闭')); }).catch(function(er){ toast(errText(er)); }); return; }
});
document.addEventListener('focusout', function(e){
  var el = e.target; if(!el.dataset || !el.dataset.inline) return;
  if(el.tagName === 'INPUT') commitInline(el);
  else if(el.tagName === 'SELECT' && !el._done){ el._done = true; setTimeout(function(){ S.pv = false; renderView(); }, 0); }
}, true);
document.addEventListener('keydown', function(e){
  var el = e.target;
  if(el.dataset && el.dataset.inline){ if(e.key === 'Enter'){ e.preventDefault(); el.blur(); } else if(e.key === 'Escape'){ S.inlineCancel = true; el.blur(); if(el.tagName === 'SELECT') commitInline(el); } return; }
  if(el.id === 'gQuick' && e.key === 'Enter'){ e.preventDefault(); var t = el.value.trim(); if(!t) return; var o = {}; if(/[一-鿿]/.test(t) && !/[A-Za-z]{3,}/.test(t)) o.zh = t; else o.en = t; newItem('activity', o, false); el.value = ''; setTimeout(function(){ var q = $('#gQuick'); if(q) q.focus(); }, 60); return; }
  if(e.key === 'Escape' && S.open && !isField(el)){ S.open = null; renderDrawer(); }
});
window.addEventListener('resize', function(){ if(S.view === 'gantt' && S.g.left === 'auto') schedule(); });
function uploadFiles(files){
  var it = getItem(S.open); if(!it) return;
  var added = [], i = 0; toast(T('Uploading…', '上传中…'));
  (function next(){
    if(i >= files.length){ var cur = getItem(it.id); if(cur && added.length) setField(it.id, 'attachments', (cur.attachments || []).concat(added)).then(function(){ toast(T('Uploaded ', '已上传 ') + added.length); }); return; }
    var file = files[i++];
    if(file.size > 50 * 1024 * 1024){ toast(file.name + ': ' + T('over 50 MB', '超过 50 MB')); next(); return; }
    STORE.upload(file, it.id).then(function(r){ added.push({path:r.path, name:file.name, type:r.type, size:r.size, at:new Date().toISOString()}); next(); })
      .catch(function(er){ toast(file.name + ': ' + errText(er)); next(); });
  })();
}

/* ===== boot ===== */
(function boot(){
  var conf = window.WW_CONFIG || {};
  if(conf.supabaseUrl && conf.supabaseKey && window.supabase){
    STORE = CloudStore(conf.supabaseUrl, conf.supabaseKey);
    renderAll();
    STORE.init().catch(function(e){ toast(errText(e)); });
  } else {
    STORE = DemoStore();
    if(conf.supabaseUrl && !window.supabase) toast('Supabase library missing — running in demo mode.');
    renderAll();
  }
})();
})();
