// ─────────────────────────────────────────────
//  02-utils.js · 通用工具函数
//  依赖：00-prompts.js（各正则常量）
//        15-modal-toast.js（showToast，运行时依赖，不是加载依赖）
// ─────────────────────────────────────────────

/* ── viewport 高度修正（解决移动端软键盘问题） ── */

function setupVH(){
  const isEdge=/Edg\//i.test(navigator.userAgent);
  const update=()=>{
    const h=(!isEdge&&window.visualViewport?window.visualViewport.height:window.innerHeight)+'px';
    document.documentElement.style.setProperty('--vh',h);
  };
  update();
  window.addEventListener('resize',update);
  if(!isEdge&&window.visualViewport){
    window.visualViewport.addEventListener('resize',update);
    window.visualViewport.addEventListener('scroll',update);
  }
}
function escapeHtml(s){return(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function copyToClipboard(text,silent){
  if(!text){if(!silent)showToast('没东西可以复制～',{type:'error'});return false}
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      await navigator.clipboard.writeText(text);
    }else{
      const ta=document.createElement('textarea');
      ta.value=text;ta.style.position='fixed';ta.style.left='-9999px';ta.style.top='0';
      document.body.appendChild(ta);ta.focus();ta.select();
      const ok=document.execCommand('copy');
      document.body.removeChild(ta);
      if(!ok)throw new Error('execCommand 失败');
    }
    if(!silent)showToast('已复制 📋🤍',{duration:1500});
    return true;
  }catch(err){
    if(!silent)showToast('复制失败：'+err.message,{type:'error',duration:5000});
    return false;
  }
}
function stripAllTags(text){
  return (text||'')
    .replace(MEM_REGEX,'')
    .replace(TODO_REGEX,'')
    .replace(LETTER_REGEX,'')
    .replace(DIARY_REGEX,'')
    .replace(MEMO_SHARED_REGEX,'')
    .replace(TOPIC_END_REGEX,'');
}
function cleanForCopy(text){
  if(!text)return '';
  return stripAllTags(String(text))
    .replace(THINKING_REGEX,'')
    .replace(THINKING_OPEN_REGEX,'')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}
function getMsgCopyText(m){
  if(!m)return '';
  if(m.role==='user')return m.content||'';
  if(m.displayContent!==undefined)return m.displayContent;
  return cleanForCopy(m.content||'');
}
function getNowStamp(){
  const d=new Date();
  const weekMap=['日','一','二','三','四','五','六'];
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}年${pad(d.getMonth()+1)}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}（周${weekMap[d.getDay()]}）`;
}
function fmtTime(ts){const d=new Date(ts);return [d.getHours(),d.getMinutes(),d.getSeconds()].map(n=>String(n).padStart(2,'0')).join(':')}
function dayKey(ts){const d=new Date(ts);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function fmtDay(key){
  const today=new Date();
  const k=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const yest=new Date(today);yest.setDate(today.getDate()-1);
  if(key===k(today))return '今天 · '+key;
  if(key===k(yest))return '昨天 · '+key;
  return key;
}
function fmtDateTime(ts){const d=new Date(ts);const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`}
function fmtDateOnly(ts){const d=new Date(ts);const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function fmtDeadline(ts){
  if(!ts)return '';
  const d=new Date(ts),now=new Date();
  const today=dayKey(now.getTime()),target=dayKey(ts);
  const tm=[String(d.getHours()).padStart(2,'0'),String(d.getMinutes()).padStart(2,'0')].join(':');
  const tmr=new Date(now);tmr.setDate(now.getDate()+1);
  if(target===today)return '今天 '+tm;
  if(target===dayKey(tmr.getTime()))return '明天 '+tm;
  return `${d.getMonth()+1}/${d.getDate()} ${tm}`;
}
function fmtDateLabel(ts){
  if(!ts)return '';
  const d=new Date(ts),now=new Date();
  const today=dayKey(now.getTime()),target=dayKey(ts);
  const tmr=new Date(now);tmr.setDate(now.getDate()+1);
  if(target===today)return '今天';
  if(target===dayKey(tmr.getTime()))return '明天';
  const yes=new Date(now);yes.setDate(now.getDate()-1);
  if(target===dayKey(yes.getTime()))return '昨天';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function deadlineClass(ts){
  if(!ts)return '';
  const now=Date.now();
  if(ts<now)return 'overdue';
  if(dayKey(ts)===dayKey(now))return 'today';
  return '';
}
function dateOnlyClass(ts){
  if(!ts)return '';
  const today=dayKey(Date.now()),target=dayKey(ts);
  if(target<today)return 'overdue';
  if(target===today)return 'today';
  return '';
}
function daysBetween(a,b){
  const da=new Date(dayKey(a)),db=new Date(dayKey(b));
  return Math.round((db-da)/86400000);
}
function toInputDatetime(ts){
  if(!ts)return '';
  const d=new Date(ts);
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toInputDate(ts){
  if(!ts)return '';
  const d=new Date(ts);
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function parseInputDatetime(s){if(!s)return null;const t=new Date(s).getTime();return isNaN(t)?null:t}
function parseInputDate(s){
  if(!s)return null;
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return null;
  const d=new Date(+m[1],+m[2]-1,+m[3],0,0,0,0);
  return d.getTime();
}
function aboutEmoji(a){return a==='洛洛'?'🥔':a==='初晓'?'🤍':'🤍🥔'}
