// ─────────────────────────────────────────────
//  01-state.js · 状态层
//  依赖：00-prompts.js（SEED_PROMPT、defaultSettings、STORAGE_KEY、SETTINGS_KEY）
// ─────────────────────────────────────────────

/* ── 常量：条目类型元数据 ── */

const TYPE_META={
  fact:{icon:'<i class="ph-light ph-brain"></i>',label:'事实'},
  moment:{icon:'<i class="ph-light ph-cloud"></i>',label:'瞬间'},
  promise:{icon:'<i class="ph-light ph-handshake"></i>',label:'约定'}
};
function typeIcon(t){return (TYPE_META[t]||TYPE_META.fact).icon}
const TODO_TABS=[
  {key:'active',label:'<i class="ph-light ph-fire"></i> 进行中'},
  {key:'today',label:'<i class="ph-light ph-calendar-blank"></i> 今天'},
  {key:'done',label:'<i class="ph-light ph-trophy"></i> 战绩厅'},
  {key:'delayed',label:'<i class="ph-light ph-books"></i> 拖延档案'},
  {key:'cancelled',label:'<i class="ph-light ph-flag-banner"></i> 大饼坟场'}
];
const BOX_TABS=[
  {key:'memo',label:'<i class="ph-light ph-notebook"></i> 备忘录'},
  {key:'bookmark',label:'<i class="ph-light ph-bookmark-simple"></i> 收藏夹'},
  {key:'health',label:'<i class="ph-light ph-first-aid"></i> 健康'},
  {key:'period',label:'<i class="ph-light ph-drop"></i> 生理期'},
  {key:'letter',label:'<i class="ph-light ph-envelope"></i> 信'},
  {key:'diary',label:'<i class="ph-light ph-notebook"></i> 日记'}
];
const HEALTH_TYPES=['复诊','体检','检查','用药','其他'];
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function newRoleObj(name,emoji,providerId,model){
  name=name||'初晓';emoji=emoji||'🤍';providerId=providerId||null;model=model||null;
  return {id:uid(),name,emoji,systemPrompt:SEED_PROMPT,
    signature:emoji,userMark:'',pairMark:'',
    providerId,model,lastAiReplyTs:null,
    conversations:[newConvObj('新窗口','💬',false)],activeConvId:null,
    entries:[],todos:[],memos:[],bookmarks:[],dailies:[],healthItems:[],periods:[],
    letters:[],diaries:[],segments:[],pendingSegmentId:null};
}
function newSegmentObj(convIds,dateStart,dateEnd,source='auto'){
  return {id:'seg_'+uid(),date_start:dateStart,date_end:dateEnd||dateStart,
    conv_ids:convIds||[],tags:[],summary:'',hsl:null,pinned:false,
    status:'draft',errMsg:null,created_at:Date.now(),updatedAt:Date.now(),source};
}
function newConvObj(title='新窗口',kindIcon='💬',pinned=false){
  return {id:uid(),title,kindIcon,pinned,archived:false,createdAt:Date.now(),messages:[],
    providerId:null,model:null,lastSegmentTs:null,nudgeLevel:0};
}
let state={roles:[],activeRoleId:null,activeTab:'chat',showArchived:false,tlFilter:'all',todoTab:'active',boxTab:'memo',memoTagFilter:'all',lastDailyCheck:null,thinkingExpanded:{},healthHistoryExpanded:{}};
let settings={...defaultSettings};
let pendingImages=[];
let replyTimer=null,cdInterval=null,replyDeadline=0;
let expandedNodes=new Set();
let openActionMsgId=null;
let editingMsgId=null;
let fsEditOpen=false;
let editingMemoId=null;
let editingDailyDate=null;
let editingSegmentId=null;
let editingHealthId=null;
let editingPeriodId=null;
let editingLetterId=null;
let editingDiaryId=null;
let contextBarExpanded=false;
let letterReplyForms={};
let modelPickerOpen=false;
let nudgePopoverOpen=false;
let providerPageOpen=false;
let editingProviderId=null;
let creatingRole=false;
let activeStreams=new Map();
let throttledSaveTimer=null;
function getRole(){return state.roles.find(r=>r.id===state.activeRoleId)}
function getConv(){const r=getRole();if(!r)return null;return r.conversations.find(c=>c.id===r.activeConvId)}
