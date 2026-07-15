// ─────────────────────────────────────────────
//  04-extractors.js · 标记提取器
//  依赖：01-state.js（uid、getRole）
//        03-markdown.js（各 *_REGEX、parseThinking）
//        02-utils.js（parseInputDatetime）
// ─────────────────────────────────────────────

/* ── about / type 归一化 ── */

function normalizeAbout(a){
  const r=getRole();
  const userName=r?.userMark||'我';
  const aiName=r?.name||'AI';
  const userPattern=new RegExp(userName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'|lolo|🥔','i');
  const aiPattern=new RegExp(aiName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'|阿素|chuxiao|🤍','i');
  if(userPattern.test(a))return userName;
  if(aiPattern.test(a))return aiName;
  if(/我们|us|🤍🥔/.test(a))return '我们';
  return userName;
}
function normalizeType(t){
  t=(t||'').toLowerCase().trim();
  if(t==='fact'||t==='moment'||t==='promise')return t;
  if(/事实/.test(t))return 'fact';
  if(/瞬间/.test(t))return 'moment';
  if(/约定/.test(t))return 'promise';
  return 'fact';
}
function findSimilarEntry(content,about){
  const r=getRole();if(!r||!content)return null;
  const norm=s=>(s||'').replace(/[\s\u3000，。、；：！？,.;:!?·…—\-—\(\)（）「」"'""'']/g,'').toLowerCase();
  const target=norm(content);
  if(target.length<3)return null;
  for(const e of r.entries){
    if(e.about!==about)continue;
    const exist=norm(e.content);
    if(!exist)continue;
    if(exist===target)return {entry:e,kind:'exact'};
    if(exist.length>=4&&target.length>=4){
      const longer=exist.length>=target.length?exist:target;
      const shorter=exist.length>=target.length?target:exist;
      if(longer.includes(shorter)&&shorter.length/longer.length>=0.6){
        return {entry:e,kind:'contain'};
      }
    }
  }
  return null;
}
function extractMemories(rawText){
  const suggests=[];
  let cleaned=(rawText||'').replace(MEM_REGEX,(_,inner)=>{
    const parts=inner.split('|').map(s=>s.trim());
    let about,type,content;
    if(parts.length>=3){[about,type,content]=parts}
    else if(parts.length===2){[about,content]=parts;type='fact'}
    else return '';
    if(!content)return '';
    about=normalizeAbout(about);
    type=normalizeType(type);
    const dup=findSimilarEntry(content,about);
    if(dup)return '';
    suggests.push({id:uid(),about,type,content,status:'pending',kind:'memory'});
    return '';
  });
  cleaned=cleaned.replace(/\n{3,}/g,'\n\n').trim();
  return {cleaned,suggests};
}
function extractTodos(rawText){
  const suggests=[];
  let cleaned=(rawText||'').replace(TODO_REGEX,(_,inner)=>{
    const parts=inner.split('|').map(s=>s.trim());
    const content=parts[0]||'';
    const deadlineStr=parts[1]||'';
    if(!content)return '';
    const deadline=deadlineStr?parseInputDatetime(deadlineStr.replace(' ','T')):null;
    suggests.push({id:uid(),content,deadline,status:'pending',kind:'todo'});
    return '';
  });
  cleaned=cleaned.replace(/\n{3,}/g,'\n\n').trim();
  return {cleaned,suggests};
}
function extractLetters(rawText,opts){
  opts=opts||{};
  const r=getRole();
  const savedLetters=[];
  let cleaned=(rawText||'').replace(LETTER_REGEX,(_,inner)=>{
    const idx=inner.indexOf('|');
    let title='',content='';
    if(idx<0){content=inner.trim()}
    else{title=inner.slice(0,idx).trim();content=inner.slice(idx+1).trim()}
    if(!content)return '';
    if(!title)title='给你的信';
    title=title.slice(0,30);
    if(opts.autoSave&&r){
      const dup=r.letters.find(l=>(l.sourceMsgId===opts.msgId)&&(l.content||'').slice(0,60)===content.slice(0,60));
      if(!dup){
        const newLetter={id:uid(),title,content,ts:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),read:false,replies:[],sourceMsgId:opts.msgId||null};
        r.letters.push(newLetter);
        savedLetters.push(newLetter);
      }else savedLetters.push(dup);
    }else savedLetters.push({title,content});
    return '';
  });
  cleaned=cleaned.replace(/\n{3,}/g,'\n\n').trim();
  return {cleaned,savedLetters};
}
function extractDiaries(rawText,opts){
  opts=opts||{};
  const r=getRole();
  const savedDiaries=[];
  let cleaned=(rawText||'').replace(DIARY_REGEX,(_,inner)=>{
    const content=inner.trim();
    if(!content)return '';
    if(opts.autoSave&&r){
      const dup=r.diaries.find(d=>(d.sourceMsgId===opts.msgId)&&(d.content||'').slice(0,60)===content.slice(0,60));
      if(!dup){
        const newDiary={id:uid(),content,ts:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),sourceMsgId:opts.msgId||null};
        r.diaries.push(newDiary);
        savedDiaries.push(newDiary);
      }else savedDiaries.push(dup);
    }else savedDiaries.push({content});
    return '';
  });
  cleaned=cleaned.replace(/\n{3,}/g,'\n\n').trim();
  return {cleaned,savedDiaries};
}
function extractSharedMemos(rawText,opts){
  opts=opts||{};
  const r=getRole();
  const savedMemos=[];
  let cleaned=(rawText||'').replace(MEMO_SHARED_REGEX,(_,inner)=>{
    const idx=inner.indexOf('|');
    let title='',content='';
    if(idx<0){content=inner.trim()}
    else{title=inner.slice(0,idx).trim();content=inner.slice(idx+1).trim()}
    if(!content)return '';
    if(!title)title='共识方案';
    title=title.slice(0,30);
    if(opts.autoSave&&r){
      const dup=r.memos.find(m=>(m.sourceMsgId===opts.msgId)&&(m.content||'').slice(0,60)===content.slice(0,60));
      if(!dup){
        const newMemo={id:uid(),title,content,tags:['🤍 共享','方案'],comments:[],shared:true,sourceMsgId:opts.msgId||null,createdAt:Date.now(),updatedAt:Date.now()};
        r.memos.unshift(newMemo);
        savedMemos.push(newMemo);
      }else savedMemos.push(dup);
    }else savedMemos.push({title,content});
    return '';
  });
  cleaned=cleaned.replace(/\n{3,}/g,'\n\n').trim();
  return {cleaned,savedMemos};
}
function extractTopicEnd(rawText){
  let topicEnd=null;
  const cleaned=(rawText||'').replace(TOPIC_END_REGEX,(_,inner)=>{
    const info={append_to:null,tags:[],summary_hint:''};
    inner.split(',').map(s=>s.trim()).filter(Boolean).forEach(p=>{
      const eq=p.indexOf('=');
      if(eq<0)return;
      const key=p.slice(0,eq).trim();
      const val=p.slice(eq+1).trim();
      if(key==='append_to')info.append_to=val||null;
      else if(key==='tags')info.tags=val.split('/').map(s=>s.trim()).filter(Boolean);
      else if(key==='summary_hint')info.summary_hint=val;
    });
    topicEnd=info;
    return '';
  });
  return {cleaned,topicEnd};
}
function extractAll(rawText,opts){
  opts=opts||{};
  const t=parseThinking(rawText, opts.reasoningContent||'');
  const l=extractLetters(t.contentAfter,{autoSave:opts.autoSave,msgId:opts.msgId});
  const d=extractDiaries(l.cleaned,{autoSave:opts.autoSave,msgId:opts.msgId});
  const sm=extractSharedMemos(d.cleaned,{autoSave:opts.autoSave,msgId:opts.msgId});
  const m=extractMemories(sm.cleaned);
  const td=extractTodos(m.cleaned);
  const te=extractTopicEnd(td.cleaned);
  return {thinking:t.thinking,cleaned:te.cleaned,suggests:[...m.suggests,...td.suggests],
    savedLetters:l.savedLetters,savedDiaries:d.savedDiaries,savedMemos:sm.savedMemos,topicEnd:te.topicEnd};
}
function streamPlaceholder(rawText){
  let s=rawText||'';
  s=s.replace(LETTER_REGEX,'').replace(DIARY_REGEX,'').replace(MEMO_SHARED_REGEX,'');
  s=s.replace(/\[\[LETTER:[\s\S]*$/,'\n\n_✉️ 我在给你写一封信，写好就收进信箱啦…_');
  s=s.replace(/\[\[DIARY:[\s\S]*$/,'\n\n_📓 我在写日记，写好放进日记本…_');
  s=s.replace(/\[\[MEMO_SHARED:[\s\S]*$/,'\n\n_📓 我在整理一份共识备忘录…_');
  return s;
}
