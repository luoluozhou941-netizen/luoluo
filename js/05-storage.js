// ─────────────────────────────────────────────
//  05-storage.js · 持久化层
//  依赖：00-prompts.js（STORAGE_KEY、SETTINGS_KEY、SEED_PROMPT、defaultSettings）
//        01-state.js（state、settings、throttledSaveTimer、newRoleObj、newConvObj）
//        03-markdown.js（parseThinking、MEM_REGEX 等）
//        06-providers.js（getProvider）← 运行时依赖
// ─────────────────────────────────────────────

/* ── 直接存取 ── */

function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
function saveSettings(){localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings))}
function throttledSave(){
  if(throttledSaveTimer)return;
  throttledSaveTimer=setTimeout(()=>{
    throttledSaveTimer=null;
    save();
  },2000);
}
function migrateProviders(){
  if(!Array.isArray(settings.providers))settings.providers=[];
  if(settings.providers.length===0&&(settings.apiKey||(settings.apiBase&&settings.apiBase!=='https://api.openai.com/v1')||(settings.model&&settings.model!=='gpt-4o-mini'))){
    const p={
      id:uid(),
      name:'默认（迁移）',
      baseUrl:settings.apiBase||'https://api.openai.com/v1',
      apiKey:settings.apiKey||'',
      defaultModel:settings.model||'gpt-4o-mini',
      models:settings.model?[settings.model]:[],
      note:'从旧版本自动迁移',
      createdAt:Date.now()
    };
    settings.providers.push(p);
    settings.defaultProviderId=p.id;
  }
}
function migrateRoleProviders(){
  const oldDefault=settings.defaultProviderId;
  const fallback=oldDefault&&getProvider(oldDefault)?oldDefault:(settings.providers[0]&&settings.providers[0].id)||null;
  if(!fallback)return;
  state.roles.forEach(r=>{
    if(!r.providerId){
      r.providerId=fallback;
      const prov=getProvider(fallback);
      if(prov&&!r.model)r.model=prov.defaultModel||(prov.models&&prov.models[0])||null;
    }else{
      if(!getProvider(r.providerId)){r.providerId=fallback;r.model=null}
    }
  });
}
function load(){
  try{const s=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');if(s&&s.roles)state=s}catch(e){}
  try{const c=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');if(c)settings={...defaultSettings,...c}}catch(e){}
  if(!state.tlFilter)state.tlFilter='all';
  if(!state.todoTab)state.todoTab='active';
  if(!state.boxTab)state.boxTab='memo';
  if(!state.memoTagFilter)state.memoTagFilter='all';
  if(!state.lastDailyCheck)state.lastDailyCheck=null;
  if(!state.thinkingExpanded)state.thinkingExpanded={};
  if(!state.healthHistoryExpanded)state.healthHistoryExpanded={};
  if(!state.roles||state.roles.length===0){
    const r=newRoleObj('初晓','🤍');r.activeConvId=r.conversations[0].id;
    state.roles=[r];state.activeRoleId=r.id;
  }
  state.roles.forEach(r=>{
    if(typeof r.providerId==='undefined')r.providerId=null;
    if(typeof r.lastAiReplyTs==='undefined')r.lastAiReplyTs=null;
    if(typeof r.model==='undefined')r.model=null;
    if(!r.conversations)r.conversations=[];
    if(r.conversations.length===0){
      r.conversations.push(newConvObj('新窗口','💬',false));
    }
    r.conversations.forEach(c=>{if(typeof c.lastSegmentTs==='undefined')c.lastSegmentTs=null});
    r.conversations.forEach(c=>{if(typeof c.nudgeLevel==='undefined')c.nudgeLevel=0});
    if(!r.activeConvId&&r.conversations[0])r.activeConvId=r.conversations[0].id;
    if(!r.entries)r.entries=[];
    if(!r.todos)r.todos=[];
    if(!r.memos)r.memos=[];
    if(!r.bookmarks)r.bookmarks=[];
    if(!r.dailies)r.dailies=[];
    if(!r.healthItems)r.healthItems=[];
    if(!r.periods)r.periods=[];
    if(!r.letters)r.letters=[];
    if(!r.diaries)r.diaries=[];
    if(!r.segments)r.segments=[];
    if(typeof r.pendingSegmentId==='undefined')r.pendingSegmentId=null;
    if(!r.systemPrompt)r.systemPrompt=SEED_PROMPT;
    if(typeof r.signature==='undefined')r.signature=r.emoji||'';
    if(typeof r.userMark==='undefined')r.userMark='';
    if(typeof r.pairMark==='undefined')r.pairMark='';
    r.conversations.forEach(c=>{
      if(typeof c.archived==='undefined')c.archived=false;
      if(typeof c.providerId==='undefined')c.providerId=null;
      if(typeof c.model==='undefined')c.model=null;
      if(c.title==='日常'&&c.pinned&&c.kindIcon==='💬'){
        c.pinned=false;
      }
      c.messages.forEach(m=>{
        if(m.streaming){
          delete m.streaming;
          m.interrupted=true;
          if(m.role==='assistant'&&m.content){
            const parsed=parseThinking(m.content,m.reasoningContent||'');
            m.thinking=parsed.thinking;
            m.displayContent=stripAllTags(parsed.contentAfter)
              .replace(/\[\[LETTER:[\s\S]*$/,'').replace(/\[\[DIARY:[\s\S]*$/,'').replace(/\[\[MEMO_SHARED:[\s\S]*$/,'')
              .trim();
          }
        }
      });
    });
    r.entries.forEach(e=>{
      if(!e.comments)e.comments=[];
      if(!e.type)e.type='fact';
      if(!e.about)e.about='洛洛';
    });
    r.todos.forEach(t=>{
      if(!t.history)t.history=[];
      if(!t.status)t.status='pending';
    });
    r.memos.forEach(m=>{
      if(!m.tags)m.tags=[];
      if(!m.comments)m.comments=[];
      if(!m.createdAt)m.createdAt=Date.now();
      if(typeof m.shared==='undefined')m.shared=false;
      if(typeof m.title==='undefined')m.title='';
    });
    r.bookmarks.forEach(b=>{
      if(!b.bookmarkedAt)b.bookmarkedAt=Date.now();
    });
    r.dailies.forEach(d=>{
      if(!d.tags)d.tags=[];
      if(!d.status)d.status='done';
      if(!d.createdAt)d.createdAt=Date.now();
      if(!d.updatedAt)d.updatedAt=d.createdAt;
    });
    r.healthItems.forEach(h=>{
      if(!h.history)h.history=[];
      if(!h.type)h.type='复诊';
      if(!h.createdAt)h.createdAt=Date.now();
    });
    r.periods.forEach(p=>{
      if(!p.createdAt)p.createdAt=Date.now();
    });
    r.letters.forEach(l=>{
      if(!l.replies)l.replies=[];
      if(!l.createdAt)l.createdAt=Date.now();
      if(!l.updatedAt)l.updatedAt=l.createdAt;
      if(typeof l.read==='undefined')l.read=true;
      l.replies.forEach(rp=>{
        if(typeof rp.title==='undefined')rp.title='';
      });
    });
    r.diaries.forEach(d=>{
      if(!d.createdAt)d.createdAt=Date.now();
      if(!d.updatedAt)d.updatedAt=d.createdAt;
      if(!d.ts)d.ts=d.createdAt;
    });
    r.entries.forEach(e=>{
      (e.comments||[]).forEach(c=>{
        if(c.streaming){
          delete c.streaming;
          c.interrupted=true;
        }
      });
    });
  });
  migrateProviders();
  migrateRoleProviders();
  if(!settings.usageBindings)settings.usageBindings={};
  delete settings.apiBase;
  delete settings.apiKey;
  delete settings.model;
  delete settings.defaultProviderId;
  save();
  saveSettings();
}
