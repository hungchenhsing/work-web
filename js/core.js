/* work-web v2 · core: utilities, language, state, field types, register templates.
   The site is a frame: every register (turnover, site works, TDS, punch list, meetings…) is defined by
   its own list of fields, which people edit on the site. Files load in order: core → store → model → ui → views → excel → main. */
'use strict';

/* ================= utilities ================= */
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
var LS = {
  get: function(k, d){ try{ var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set: function(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
  del: function(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
function uid(p){ return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function pad(n){ return String(n).padStart(2, '0'); }
function clone(o){ return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function same(a, b){ return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }
function isEmpty(v){ return v == null || v === '' || (Array.isArray(v) && !v.length); }
var NOW = new Date();
var TODAY_S = NOW.getFullYear() + '-' + pad(NOW.getMonth() + 1) + '-' + pad(NOW.getDate());
function d2n(s){ if(!s) return null; var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s)); if(!m) return null; return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5); }
function n2d(n){ return new Date(n * 864e5).toISOString().slice(0, 10); }
var TODAY = d2n(TODAY_S);
var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function md(s){ return s ? String(s).slice(5) : ''; }
function dshort(s){ var n = d2n(s); if(n == null) return ''; var d = new Date(n * 864e5); return pad(d.getUTCDate()) + ' ' + MON[d.getUTCMonth()] + (d.getUTCFullYear() !== NOW.getFullYear() ? ' ' + String(d.getUTCFullYear()).slice(2) : ''); }
function monthKey(n){ var d = new Date(n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1); }
function monthLabel(k){ var y = +k.slice(0, 4), m = +k.slice(5, 7); return {en:MON[m - 1] + ' ' + y, zh:y + '年' + m + '月'}; }
function monthRange(k){ var y = +k.slice(0, 4), m = +k.slice(5, 7), last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return [k + '-01', k + '-' + pad(last)]; }
function parseDate(v){
  if(v == null || v === '') return '';
  if(v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
  if(typeof v === 'number' && v > 20000 && v < 80000) return n2d(Math.round(v) - 25569);
  var s = String(v).trim(), m = /^(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})/.exec(s);
  if(m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
  m = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/.exec(s); if(m) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
  var t = Date.parse(s); if(!isNaN(t)){ var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  return '';
}
function splitList(v, re){ return String(v == null ? '' : v).split(re || /\s*[\/、,，;；\n]\s*/).map(function(s){ return s.trim(); }).filter(Boolean); }
function fmtTime(iso){ if(!iso) return ''; var d = new Date(iso); if(isNaN(d)) return ''; return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function ago(iso){ var s = (Date.now() - new Date(iso).getTime()) / 1000; if(s < 60) return T('just now', '刚刚'); if(s < 3600) return T(Math.round(s / 60) + ' min ago', Math.round(s / 60) + ' 分钟前'); if(s < 86400) return T(Math.round(s / 3600) + ' h ago', Math.round(s / 3600) + ' 小时前'); return fmtTime(iso).slice(0, 10); }
function slug(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24); }
var toastT;
function toast(msg, act){
  var t = $('#toast'); t.innerHTML = esc(msg) + (act ? ' <button type="button" class="lnk" data-act="' + esc(act.act) + '" data-v="' + esc(act.v || '') + '">' + esc(act.label) + '</button>' : '');
  t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function(){ t.classList.remove('on'); }, act ? 7000 : 3600);
}
function errText(e){
  var m = (e && (e.message || e.code || e.error_description)) || String(e || '');
  if(/row-level security|permission|not allowed|42501/i.test(m)) return T('You do not have permission for this change.', '没有权限进行此修改。');
  if(/JWT|session|auth/i.test(m)) return T('Your sign-in expired. Sign in again.', '登录已过期，请重新登录。');
  if(/fetch|network|Failed/i.test(m)) return T('Network problem — the change was not saved. Try again.', '网络问题，修改未保存，请重试。');
  return T('Could not save: ', '保存失败：') + String(m).slice(0, 140);
}

/* ================= language ================= */
function L(en, zh){ var m = S.lang; if(m === 'en' || !zh) return esc(en); if(m === 'zh') return esc(zh); return esc(en) + ' <span class="zh">' + esc(zh) + '</span>'; }
function T(en, zh){ var m = S.lang; if(m === 'en' || !zh) return en; if(m === 'zh') return zh; return en + ' · ' + zh; }
function T1(en, zh){ return S.lang === 'zh' ? (zh || en || '') : (en || zh || ''); }
function nm(o){ return o ? T1(o.en, o.zh) : ''; }
function nmL(o){ return o ? L(o.en || o.zh || '', o.en ? o.zh : '') : ''; }

/* ================= UI state ================= */
var UI = LS.get('ww2.ui', {});
var S = {
  lang: LS.get('ww.lang', 'both'),
  page: UI.page || 'home', reg: UI.reg || null, deck: UI.deck || null, dslide: null, dpage: 0, present: null,
  rv: UI.rv || {}, rf: {}, rs: UI.rs || {}, rg: UI.rg || {}, rcols: UI.rcols || {}, rmx: UI.rmx || {}, rboard: UI.rboard || {},
  sel: {}, open: null, dtab: 'details', pop: null, modal: null, rexp: {}, treeEdit: {},
  stab: UI.stab || 'project', sreg: null, sched: UI.sched || null, gz: UI.gz || 'week', gcol: {},
  act: {reg:'', who:'', type:''}, files: {reg:'', q:''}, otab: 'live', oreg: null, pubSel: null, fbFor: null,
  q: '', auth: {tab:'in'}, sideOpen: false, imp: null, asOfLocal: null
};
function saveUI(){ LS.set('ww2.ui', {page:S.page, reg:S.reg, deck:S.deck, rv:S.rv, rs:S.rs, rg:S.rg, rcols:S.rcols, rmx:S.rmx, rboard:S.rboard, stab:S.stab, sched:S.sched, gz:S.gz}); }

/* ================= colours ================= */
var COLORS = ['grey','blue','green','amber','red','violet','teal','pink'];
var COLOR_NAMES = {grey:['Grey','灰'],blue:['Blue','蓝'],green:['Green','绿'],amber:['Amber','橙'],red:['Red','红'],violet:['Violet','紫'],teal:['Teal','青'],pink:['Pink','粉']};

/* ================= field types ================= */
var TYPES = {
  text:    {en:'Text', zh:'文本', icon:'T'},
  long:    {en:'Long text', zh:'长文本', icon:'¶'},
  number:  {en:'Number', zh:'数字', icon:'#'},
  percent: {en:'Percent', zh:'百分比', icon:'%'},
  date:    {en:'Date', zh:'日期', icon:'▦'},
  select:  {en:'Choice', zh:'选项', icon:'◉'},
  tree:    {en:'Category tree', zh:'分类树', icon:'⋔'},
  check:   {en:'Checkbox', zh:'勾选', icon:'☑'},
  url:     {en:'Link (URL)', zh:'网址', icon:'↗'},
  files:   {en:'Files / photos', zh:'文件 / 照片', icon:'⎙'},
  link:    {en:'Linked records', zh:'关联记录', icon:'⇄'},
  calc:    {en:'Calculation', zh:'计算', icon:'ƒ'},
  sub:     {en:'Sub-table', zh:'子表', icon:'☰'},
  section: {en:'Section heading', zh:'分节标题', icon:'§'}
};
var CALC_OPS = [['pct','A ÷ B × 100 (%)','A ÷ B × 100（%）'],['sub','A − B','A − B'],['add','A + B','A + B'],['mul','A × B','A × B'],['days','Days from A to B','A 到 B 的天数']];
var ROLES = [
  ['title','Title','标题'],['title2','Second title (e.g. Chinese)','副标题（如中文）'],['no','Number','编号'],
  ['start','Start date','开始日期'],['finish','Finish / due date','结束 / 到期日期'],['progress','Progress %','完成率'],
  ['status','Status','状态'],['block','Block','区域'],['tree','Category tree (left panel)','分类树（左侧面板）'],['kind','Type (milestone shape)','类型（里程碑形状）']
];
var SUB_TYPES = ['text','long','number','date','select','check'];

/* field helpers */
function F(key, en, zh, type, extra){ return Object.assign({key:key, en:en, zh:zh, type:type}, extra || {}); }
function O(v, en, zh, color, extra){ return Object.assign({v:v, en:en, zh:zh || '', color:color || 'grey'}, extra || {}); }

/* ================= shared lists (used by many registers) ================= */
var DEF_LISTS = {
  blocks: {en:'Blocks', zh:'区域', opts:[O('B','Block B','B区','blue'),O('C','Block C','C区','green'),O('D','Block D','D区','amber'),O('E','Block E','E区','violet')]},
  disc: {en:'Disciplines', zh:'专业', opts:[O('doc','Documents','文件'),O('ele','Electrical','电气','blue'),O('civ','Civil','土建','amber'),O('inc','Protection & control','继保控制','violet'),O('equip','Equipment','设备','teal'),O('archi','Architecture','建筑'),O('pip','Water & drainage','给排水','teal'),O('hvac','HVAC','暖通'),O('str','Structure','结构','amber'),O('mech','Mechanical','机务','green')]},
  dept: {en:'Departments', zh:'部门', opts:[O('ENG','Engineering','工程'),O('COM','Commissioning & O&M','调试&运维'),O('QA','Quality','质量'),O('DES','Design','设计'),O('HSE','HSE','安全环保')]},
  people: {en:'People', zh:'人员', opts:[]},
  subcon: {en:'Subcontractors', zh:'分包商', opts:[]}
};
var DEF_CFG = {projectEn:'CEEC-TERRA I', projectZh:'TERRA I 光伏项目', asOf:'', ganttStart:'', ganttEnd:'2027-12-31', lists:DEF_LISTS, regOrder:[], v2:false};

/* ================= register templates ================= */
var ST_DOC = [O('not_started','Not started','未开始','amber'),O('in_progress','In progress','进行中','blue'),O('submitted','Submitted','已提交','violet'),O('pending','Pending','暂缓 / 待定','red'),O('completed','Completed','已完成','green',{done:true})];
var ST_WORK = [O('not_started','Not started','未开始','amber'),O('in_progress','In progress','进行中','blue'),O('on_hold','On hold','暂停','red'),O('completed','Completed','已完成','green',{done:true})];
var DEF_TREE = [
  {id:'pk1',parent:'',code:'P1',en:'Turnover Preparation',zh:'移交准备'},{id:'pk2',parent:'',code:'P2',en:'As-built Drawings & Design',zh:'竣工图及设计资料'},{id:'pk2a',parent:'pk2',code:'P2.1',en:'Electrical',zh:'电气'},{id:'pk2b',parent:'pk2',code:'P2.2',en:'Civil & structural',zh:'土建与结构'},{id:'pk2c',parent:'pk2',code:'P2.3',en:'Protection, control & communication',zh:'继保、控制与通信'},{id:'pk2d',parent:'pk2',code:'P2.4',en:'Buildings & services',zh:'建筑与水暖'},
  {id:'pk3',parent:'',code:'P3',en:'Testing, Commissioning & Performance',zh:'测试、调试与性能'},{id:'pk4',parent:'',code:'P4',en:'OEM & O&M Documents',zh:'OEM 与运维资料'},
  {id:'pk5',parent:'',code:'P5',en:'Training & Readiness',zh:'培训与运行准备'},{id:'pk6',parent:'',code:'P6',en:'Spare Parts & Tools',zh:'备件与工具'},
  {id:'pk7',parent:'',code:'P7',en:'Warranty & Commercial',zh:'质保与商务'},{id:'pk8',parent:'',code:'P8',en:'Final Handover & Close-out',zh:'最终移交与关闭'}
];
var WBS_TREE = [
  {id:'w1',parent:'',code:'W1',en:'Site preparation & civil',zh:'场平与土建'},{id:'w2',parent:'',code:'W2',en:'Piling',zh:'打桩'},
  {id:'w3',parent:'',code:'W3',en:'Tracker / structure installation',zh:'跟踪支架安装'},{id:'w4',parent:'',code:'W4',en:'Module installation',zh:'组件安装'},
  {id:'w5',parent:'',code:'W5',en:'DC cabling & strings',zh:'直流电缆与组串'},{id:'w6',parent:'',code:'W6',en:'Inverters & combiner boxes',zh:'逆变器与汇流箱'},
  {id:'w7',parent:'',code:'W7',en:'MV cabling & transformers',zh:'中压电缆与箱变'},{id:'w8',parent:'',code:'W8',en:'Substation & SCADA',zh:'升压站与 SCADA'},
  {id:'w9',parent:'',code:'W9',en:'Roads, drainage, fencing & security',zh:'道路、排水、围栏与安防'},{id:'w10',parent:'',code:'W10',en:'Testing & commissioning',zh:'测试与调试'}
];
var UPDATES_COLS = [F('d','Date','日期','date'),F('text','Update','更新内容','long')];

var TEMPLATES = {
  blank: {en:'Blank register', zh:'空白台账', icon:'list', sec:'other', prefix:'REC', fields:[
    F('no','No.','编号','text'),F('title','Title','标题','text'),F('status','Status','状态','select',{opts:ST_WORK}),
    F('start','Start','开始','date'),F('finish','Finish','结束','date'),F('owner','Responsible','负责人','select',{list:'people', multi:true}),F('remarks','Remarks','备注','long')
  ], roles:{title:'title', no:'no', status:'status', start:'start', finish:'finish'}, view:'table'},

  turnover: {en:'Turnover documents', zh:'移交文件台账', icon:'doc', sec:'docs', prefix:'DOC', ownerPublish:true, fields:[
    F('regNo','No.','序号','text',{w:84}),F('docNo','Document No.','文件编号','text'),F('rev','Rev.','版本','text',{w:56, hide:true}),
    F('node','Package','文件包','tree',{tree:DEF_TREE}),F('dept','Department','部门','select',{list:'dept'}),
    F('en','Document title','文件名称（英文）','text',{w:260, ext:true}),F('zh','Name (中文)','文件名称','text',{hide:true}),
    F('disc','Discipline','专业','select',{list:'disc', multi:true}),F('areas','Block','区域','select',{list:'blocks', multi:true}),
    F('type','Type','类型','select',{opts:[O('deliverable','Deliverable','交付项','blue'),O('activity','Activity','活动','teal'),O('task','Task','任务','grey'),O('milestone','Milestone','里程碑','violet',{ms:true})], hide:true}),
    F('s1','Schedule & submission','计划与提交','section'),
    F('start','Plan start','计划开始','date',{ext:true}),F('finish','Plan finish','计划结束','date',{ext:true}),
    F('actualStart','Actual submission from','实际提交开始','date',{ext:true}),F('actualEnd','Actual submission to','实际提交结束','date',{hide:true}),
    F('progress','Progress','完成率','percent'),F('status','Status','状态','select',{opts:ST_DOC, ext:true}),
    F('ownerResult','Owner result','业主结果','select',{opts:[O('pending','Pending review','待审查','blue'),O('accepted','Accepted','接受','green'),O('accepted_c','Accepted w/ comments','带意见接受','green'),O('revise','Revise & resubmit','退回重交','red'),O('rejected','Rejected','拒绝','red')], hide:true}),
    F('s2','Notes','说明','section'),
    F('explanation','Explanation','解释说明','long'),F('remarks','Remarks / comments','备注 / 意见','long'),F('contacts','Contacts','对接人','select',{list:'people', multi:true}),
    F('updates','Updates','更新记录','sub',{cols:UPDATES_COLS, hide:true}),F('extNote','External note','对外备注','long',{ext:true, hide:true}),
    F('attachments','Files','文件','files',{hide:true}),F('links','Related records','关联记录','link',{hide:true})
  ], roles:{title:'en', title2:'zh', no:'regNo', start:'start', finish:'finish', progress:'progress', status:'status', block:'areas', tree:'node', kind:'type'}, view:'table'},

  site: {en:'Site works', zh:'现场施工', icon:'site', sec:'site', prefix:'SW', fields:[
    F('regNo','No.','编号','text',{w:76}),F('en','Activity','施工活动','text',{w:240}),F('zh','Activity (中文)','活动（中文）','text',{hide:true}),
    F('wbs','Work package','工作包','tree',{tree:WBS_TREE}),F('areas','Block','区域','select',{list:'blocks', multi:true}),
    F('disc','Discipline','专业','select',{list:'disc', multi:true, hide:true}),
    F('s1','Quantities','工程量','section'),
    F('unit','Unit','单位','select',{opts:[O('pile','piles','根桩'),O('tracker','trackers','套支架'),O('module','modules','块组件'),O('string','strings','串'),O('inv','inverters','台逆变器'),O('cb','combiner boxes','台汇流箱'),O('tx','transformers','台箱变'),O('m','m','米'),O('km','km','公里'),O('set','sets','套'),O('lot','lot','项')]}),
    F('qtyPlan','Planned qty','计划量','number'),F('qtyDone','Done qty','完成量','number'),
    F('progress','Progress','完成率','percent',{auto:{op:'pct', a:'qtyDone', b:'qtyPlan'}}),
    F('s2','Schedule','计划','section'),
    F('start','Plan start','计划开始','date'),F('finish','Plan finish','计划结束','date'),
    F('actualStart','Actual start','实际开始','date',{hide:true}),F('actualFinish','Actual finish','实际完成','date',{hide:true}),
    F('status','Status','状态','select',{opts:ST_WORK}),F('resp','Responsible','负责人','select',{list:'people', multi:true}),F('subcon','Subcontractor','分包商','select',{list:'subcon'}),
    F('s3','Records','记录','section'),
    F('remarks','Remarks','备注','long'),F('updates','Daily updates','每日更新','sub',{cols:UPDATES_COLS, hide:true}),
    F('photos','Photos','照片','files',{hide:true}),F('links','Related documents','关联资料','link',{hide:true})
  ], roles:{title:'en', title2:'zh', no:'regNo', start:'start', finish:'finish', progress:'progress', status:'status', block:'areas', tree:'wbs'}, view:'matrix',
     matrix:{row:'wbs', col:'areas', val:'progress'}},

  tds: {en:'TDS · Technical data sheets', zh:'TDS 技术数据表', icon:'tds', sec:'docs', prefix:'TDS', visibility:'private', fields:[
    F('regNo','No.','编号','text',{w:76}),F('en','Equipment / material','设备 / 材料','text',{w:220}),F('zh','Name (中文)','名称（中文）','text',{hide:true}),
    F('cat','Category','类别','select',{opts:[O('module','PV module','光伏组件','blue'),O('inverter','Inverter','逆变器','violet'),O('tracker','Tracker / structure','跟踪支架','amber'),O('tx','Transformer','变压器','teal'),O('cable','Cable','电缆','grey'),O('cb','Combiner box','汇流箱','green'),O('scada','SCADA / comms','SCADA / 通信','violet'),O('sw','Switchgear','开关柜','red'),O('other','Other','其他','grey')]}),
    F('mfr','Manufacturer','厂家','text'),F('model','Model','型号','text'),F('spec','Key specifications','主要参数','long',{hide:true}),F('rev','Rev.','版本','text',{w:56}),
    F('status','Status','状态','select',{opts:[O('draft','Draft','草稿','grey'),O('submitted','Submitted','已提交','violet'),O('approved','Approved','已批准','green',{done:true}),O('approved_c','Approved w/ comments','带意见批准','green',{done:true}),O('rejected','Rejected','退回','red'),O('superseded','Superseded','已作废','grey',{done:true})]}),
    F('submitted','Submitted','提交日期','date'),F('approved','Approved','批准日期','date'),
    F('sheet','Datasheet','数据表文件','files'),F('links','Related records','关联记录','link',{hide:true}),F('remarks','Remarks','备注','long')
  ], roles:{title:'en', title2:'zh', no:'regNo', start:'submitted', finish:'approved', status:'status'}, view:'table'},

  punch: {en:'Punch list', zh:'尾项 / 缺陷清单', icon:'punch', sec:'site', prefix:'PL', fields:[
    F('regNo','No.','编号','text',{w:70}),F('en','Description','问题描述','text',{w:260}),F('zh','Description (中文)','描述（中文）','text',{hide:true}),
    F('areas','Block','区域','select',{list:'blocks', multi:true}),F('loc','Location detail','具体位置','text',{help:'Row / table / inverter / box ID'}),
    F('cat','Category','类别','select',{opts:[O('civil','Civil','土建','amber'),O('mech','Mechanical','机械','teal'),O('elec','Electrical','电气','blue'),O('inc','I&C / SCADA','仪控 / SCADA','violet'),O('hse','HSE','安全环保','red'),O('doc','Documentation','资料','grey')]}),
    F('prio','Priority','优先级','select',{opts:[O('A','A · critical','A · 紧急','red'),O('B','B · major','B · 重要','amber'),O('C','C · minor','C · 一般','blue')]}),
    F('status','Status','状态','select',{opts:[O('open','Open','未处理','red'),O('wip','In progress','处理中','blue'),O('ready','Ready for inspection','待验收','violet'),O('closed','Closed','已关闭','green',{done:true})]}),
    F('raisedBy','Raised by','提出人','select',{list:'people'}),F('raised','Raised','提出日期','date'),
    F('resp','Responsible','责任人','select',{list:'people', multi:true}),F('subcon','Subcontractor','分包商','select',{list:'subcon'}),
    F('due','Due','要求完成','date'),F('closed','Closed on','关闭日期','date',{hide:true}),
    F('before','Photos · before','整改前照片','files'),F('after','Photos · after','整改后照片','files'),F('remarks','Remarks','备注','long',{hide:true})
  ], roles:{title:'en', title2:'zh', no:'regNo', start:'raised', finish:'due', status:'status', block:'areas'}, view:'board', board:'status'},

  meetings: {en:'Meetings · agenda & minutes', zh:'会议议程与纪要', icon:'meet', sec:'meet', prefix:'MOM', fields:[
    F('regNo','No.','编号','text',{w:84}),F('en','Meeting','会议名称','text',{w:240}),F('zh','Meeting (中文)','会议（中文）','text',{hide:true}),
    F('date','Date','日期','date'),F('time','Time','时间','text',{w:70}),
    F('mtype','Type','类型','select',{opts:[O('weekly','Weekly coordination','周例会','blue'),O('owner','Owner meeting','业主会议','violet'),O('internal','Internal','内部会议','grey'),O('hse','HSE','安全会议','red'),O('tech','Technical','技术会议','teal'),O('com','Commissioning','调试会议','green')]}),
    F('loc','Location','地点','text'),F('chair','Chair','主持','select',{list:'people'}),F('attendees','Attendees','参会人','select',{list:'people', multi:true}),
    F('status','Status','状态','select',{opts:[O('planned','Planned','计划中','amber'),O('held','Held','已召开','blue'),O('issued','Minutes issued','纪要已发','green',{done:true})]}),
    F('s1','Agenda','议程','section'),
    F('agenda','Agenda','议程','sub',{cols:[F('topic','Topic','议题','text'),F('by','Presenter','汇报人','text'),F('notes','Notes','说明','long')], hide:true}),
    F('s2','Minutes','纪要','section'),
    F('minutes','Minutes','会议纪要','long',{hide:true}),
    F('actions','Action items','待办事项','sub',{cols:[F('action','Action','事项','long'),F('who','Owner','负责人','text'),F('due','Due','期限','date'),F('done','Done','完成','check')], hide:true}),
    F('files','Files','附件','files',{hide:true}),F('links','Related records','关联记录','link',{hide:true})
  ], roles:{title:'en', title2:'zh', no:'regNo', start:'date', finish:'date', status:'status'}, view:'table', meeting:true}
};
var REG_ICONS = {
  doc:'<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  site:'<path d="M3 20h18"/><path d="M5 17l3-8h8l3 8z"/><path d="M8 9l1 8M16 9l-1 8M6.5 13h11"/><circle cx="12" cy="4" r="1.5"/>',
  tds:'<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  punch:'<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  meet:'<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M3 20c0-3 2.5-5 5-5s5 2 5 5M11 20c0-3 2.5-5 5-5s5 2 5 5"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  box:'<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>',
  bolt:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  check:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>'
};
var SECS = [['site','Site','现场'],['docs','Documents','资料'],['meet','Meetings','会议'],['other','Other','其他']];
function icon(name, size){ return '<svg class="ic" width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (REG_ICONS[name] || REG_ICONS.list) + '</svg>'; }
var UI_ICONS = {
  home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>', cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  hist:'<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5M12 7v5l3 3"/>', file:'<path d="M4 7h6l2 2h8v10H4z"/>', owner:'<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', plus:'<path d="M12 5v14M5 12h14"/>', search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>', undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>', board:'<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  gantt:'<path d="M4 6h8M7 12h10M10 18h10"/>', grid:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  star:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', print:'<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  camera:'<path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/>', up:'<path d="M12 19V5M5 12l7-7 7 7"/>', down:'<path d="M12 5v14M5 12l7 7 7-7"/>',
  link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
};
function uic(name, size){ return '<svg class="ic" width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (UI_ICONS[name] || '') + '</svg>'; }
