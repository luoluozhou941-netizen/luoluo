// ─────────────────────────────────────────────
//  14-search.js · 全局搜索
//  依赖：01-state.js（state、getRole）
//        02-utils.js（escapeHtml、fmtDateTime、fmtDateOnly、
//                    fmtDeadline、fmtDateLabel）
//        05-storage.js（save）
//        11-render-timeline.js（jumpToTimelineEntry）
//        13-render-todo-health.js（renderTodoPanel）
// ─────────────────────────────────────────────

/* ── 搜索状态变量 ── */

let searchOpen=false;
let searchExpandedGroups=new Set();
function escapeRegex(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function highlightKw(text,kw){const e=escapeHtml(text||'');if(!kw)return e;const re=new RegExp(escapeRegex(kw),'gi');return e.replace(re,m=>`<mark>${m}</mark>`)}
function snippetAround(text,kw,maxLen){
  maxLen=maxLen||120;text=String(text||'');
  if(!kw)return text.length>maxLen?text.slice(0,maxLen)+'…':text;
  const lower=text.toLowerCase();const idx=lower.indexOf(kw.toLowerCase());
  if(idx<0)return text.length>maxLen?text.slice(0,maxLen)+'…':text;
  const radius=Math.floor(maxLen/2);
  let start=Math.max(0,idx-radius);let end=Math.min(text.length,idx+kw.length+radius);
  let s=text.slice(start,end);
  if(start>0)s='…'+s;if(end<text.length)s=s+'…';
  return s;
}
function openSearch(){
  if(searchOpen)return;
  searchOpen=true;searchExpandedGroups=new Set();closeDrawers();
  const mask=document.createElement('div');mask.className='search-mask';
  mask.innerHTML=`<div class="search-panel">
    <div class="search-head">
      <input id="search-input" placeholder="<i class="ph-light ph-magnifying-glass"></i> 搜聊天 / 记忆树 / 备忘录 / 收藏 / 今日档案 / 便利贴 / 健康 / 生理期 / 信 / 日记…" autocomplete="off">
      <button id="search-close" title="关闭"><i class="ph-light ph-x"></i></button>
    </div>
    <div class="search-body" id="search-body">
      <div class="search-tip"><span class="emoji"><i class="ph-light ph-magnifying-glass" style="font-size:32px"></i></span>输入关键词搜索<br>
        <span style="color:var(--ink-3);font-size:11px">支持：聊天 / 记忆树 / 备忘录 / 收藏 / 今日档案 / 便利贴 / 健康 / 生理期 / 信 / 日记</span></div>
    </div>
  </div>`;
  document.body.appendChild(mask);
  const input=mask.querySelector('#search-input');
  const close=()=>{
    if(!searchOpen)return;searchOpen=false;
    if(mask.parentNode)mask.parentNode.removeChild(mask);
    document.removeEventListener('keydown',keyHandler);window._closeSearch=null;
  };
  const keyHandler=e=>{if(e.key==='Escape'){e.preventDefault();close()}};
  document.addEventListener('keydown',keyHandler);
  mask.onclick=e=>{if(e.target===mask)close()};
  mask.querySelector('#search-close').onclick=close;
  let debounce=null;
  input.addEventListener('input',()=>{if(debounce)clearTimeout(debounce);debounce=setTimeout(()=>{searchExpandedGroups=new Set();doSearch(input.value)},120)});
  setTimeout(()=>input.focus(),50);
  window._closeSearch=close;
}
function doSearch(kw){
  const body=document.getElementById('search-body');if(!body)return;
  kw=(kw||'').trim();
  if(!kw){body.innerHTML=`<div class="search-tip"><span class="emoji"><i class="ph-light ph-magnifying-glass" style="font-size:32px"></i></span>输入关键词搜索<br><span style="color:var(--ink-3);font-size:11px">支持：聊天 / 记忆树 / 备忘录 / 收藏 / 今日档案 / 便利贴 / 健康 / 生理期 / 信 / 日记</span></div>`;return}
  const r=getRole();if(!r){body.innerHTML='<div class="search-tip">还没角色～</div>';return}
  const kwLower=kw.toLowerCase();const has=t=>(t||'').toLowerCase().includes(kwLower);
  const groups=[];
  const chats=[];
  r.conversations.forEach(c=>{c.messages.forEach(m=>{if(m.streaming)return;
    const content=m.role==='assistant'?(m.displayContent!==undefined?m.displayContent:(m.content||'')):(m.content||'');
    if(has(content))chats.push({title:`${m.role==='user'?'洛洛 🥔':r.name+' '+(r.emoji||'🤍')} · 「${c.title||''}」`,meta:fmtDateTime(m.ts),content:snippetAround(content,kw),
      jump:()=>{switchActiveConv(c.id,{unarchive:true,switchToChat:true});
        setTimeout(()=>{const el=document.querySelector(`.node[data-id="${m.id}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});const b=el.querySelector('.bubble');if(b){b.style.boxShadow='0 0 0 3px var(--amber)';setTimeout(()=>b.style.boxShadow='',1600)}}},150)}});
  })});
  if(chats.length)groups.push({key:'chat',label:'<i class="ph-light ph-chat-circle"></i> 聊天',items:chats});
  const entries=[];
  r.entries.forEach(e=>{
    if(has(e.content))entries.push({title:`${typeIcon(e.type)} ${aboutEmoji(e.about)} ${e.starred?'<i class="ph-light ph-star"></i> ':''}记忆树`,meta:fmtDateTime(e.ts),content:snippetAround(e.content,kw),jump:()=>jumpToTimelineEntry(e.id)});
    (e.comments||[]).forEach(c=>{const cc=c.role==='assistant'?(c.displayContent!==undefined?c.displayContent:c.content||''):(c.content||'');
      if(has(cc))entries.push({title:`<i class="ph-light ph-chat"></i> ${c.role==='user'?'洛洛 🥔':r.name+' '+(r.emoji||'🤍')} 在记忆树评论`,meta:fmtDateTime(c.ts)+' · '+(e.content||'').slice(0,20),content:snippetAround(cc,kw),jump:()=>jumpToTimelineEntry(e.id)});
    });
  });
  if(entries.length)groups.push({key:'entry',label:'<i class="ph-light ph-tree"></i> 记忆树',items:entries});
  const memos=[];
  r.memos.forEach(m=>{
    const tags=(m.tags||[]).join(' ');
    const all=(m.title||'')+' '+(m.content||'')+' '+tags;
    if(has(all))memos.push({title:`<i class="ph-light ph-notebook"></i> ${m.shared?'<i class="ph-light ph-lock-open"></i> 共享 · ':''}${m.title||'备忘录'}${m.tags&&m.tags.length?' · '+m.tags.join(' / '):''}`,meta:fmtDateTime(m.updatedAt||m.createdAt),content:snippetAround(m.content,kw),
      jump:()=>{switchTab('box');state.boxTab='memo';save();renderBox();setTimeout(()=>{const el=document.querySelector(`.memo-item[data-id="${m.id}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.boxShadow='0 0 0 3px var(--amber)';setTimeout(()=>el.style.boxShadow='',1600)}},150)}});
    (m.comments||[]).forEach(c=>{if(has(c.content))memos.push({title:`<i class="ph-light ph-chat"></i> 备忘录追评`,meta:fmtDateTime(c.ts),content:snippetAround(c.content,kw),jump:()=>{switchTab('box');state.boxTab='memo';save();renderBox();setTimeout(()=>{const el=document.querySelector(`.memo-item[data-id="${m.id}"]`);if(el)el.scrollIntoView({behavior:'smooth',block:'center'})},150)}})});
  });
  if(memos.length)groups.push({key:'memo',label:'<i class="ph-light ph-notebook"></i> 备忘录',items:memos});
  const bms=[];r.bookmarks.forEach(b=>{if(has(b.content))bms.push({title:`<i class="ph-light ph-bookmark-simple"></i> 收藏 · ${b.role==='user'?'洛洛 🥔':r.name+' '+(r.emoji||'🤍')}`,meta:fmtDateTime(b.ts)+' · 「'+(b.convTitle||'')+'」',content:snippetAround(b.content,kw),
    jump:()=>{switchTab('box');state.boxTab='bookmark';save();renderBox();setTimeout(()=>{const el=document.querySelector(`.bm-item[data-id="${b.id}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.boxShadow='0 0 0 3px var(--amber)';setTimeout(()=>el.style.boxShadow='',1600)}},150)}})});
  if(bms.length)groups.push({key:'bookmark',label:'<i class="ph-light ph-bookmark-simple"></i> 收藏',items:bms});
  const dailies=[];r.dailies.forEach(d=>{const all=(d.title||'')+' '+(d.summary||'')+' '+((d.tags||[]).join(' '));
    if(has(all))dailies.push({title:`<i class="ph-light ph-calendar-blank"></i> ${d.date} 今日档案${d.title?' · '+d.title:''}`,meta:(d.tags||[]).join(' / '),content:snippetAround(d.summary||'',kw),
      jump:()=>{switchTab('timeline');state.tlFilter='all';save();renderTimeline();setTimeout(()=>{const el=document.querySelector(`.tl-daily[data-date="${d.date}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.boxShadow='0 0 0 3px var(--amber)';setTimeout(()=>el.style.boxShadow='',1800)}},150)}})});
  if(dailies.length)groups.push({key:'daily',label:'<i class="ph-light ph-calendar-blank"></i> 今日档案',items:dailies});
  const segments=[];(r.segments||[]).forEach(s=>{const all=(s.summary||'')+' '+((s.tags||[]).join(' '));
    if(has(all)){const dateLabel=s.date_start===s.date_end?s.date_start:`${s.date_start}~${s.date_end}`;
      segments.push({title:`<i class="ph-light ph-scroll"></i> ${dateLabel} 滚动摘要${s.tags&&s.tags.length?' · '+s.tags.join(' / '):''}`,meta:s.pinned?'<i class="ph-light ph-push-pin"></i> 置顶':'',content:snippetAround(s.summary||'',kw),
        jump:()=>{switchTab('timeline');state.tlFilter='segment';save();renderTimeline();setTimeout(()=>{const el=document.querySelector(`.tl-segment[data-id="${s.id}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.boxShadow='0 0 0 3px var(--amber)';setTimeout(()=>el.style.boxShadow='',1800)}},150)}})}});
  if(segments.length)groups.push({key:'segment',label:'<i class="ph-light ph-scroll"></i> 滚动摘要',items:segments});
  const todos=[];r.todos.forEach(t=>{const all=(t.content||'')+' '+(t.reason||'');
    if(has(all)){const statusLabel={pending:'<i class="ph-light ph-fire"></i> 进行中',delayed:'<i class="ph-light ph-books"></i> 已拖延',done:'<i class="ph-light ph-trophy"></i> 已完成',cancelled:'<i class="ph-light ph-flag-banner"></i> 已放弃'}[t.status]||'';
      todos.push({title:`<i class="ph-light ph-push-pin"></i> 便利贴 · ${statusLabel}`,meta:t.deadline?'<i class="ph-light ph-clock-countdown"></i> '+fmtDeadline(t.deadline):'没设时间',content:snippetAround(t.content+(t.reason?' · '+t.reason:''),kw),
        jump:()=>{const tabMap={pending:'active',delayed:'delayed',done:'done',cancelled:'cancelled'};state.todoTab=tabMap[t.status]||'active';save();renderTodoPanel();if(window.innerWidth<900)openDrawer('right');
          setTimeout(()=>{const el=document.querySelector(`.todo-item[data-id="${t.id}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.boxShadow='0 0 0 3px var(--amber)';setTimeout(()=>el.style.boxShadow='',1800)}},200)}})}});
  if(todos.length)groups.push({key:'todo',label:'<i class="ph-light ph-push-pin"></i> 便利贴',items:todos});
  const healths=[];r.healthItems.forEach(h=>{const histText=(h.history||[]).map(x=>x.note||'').join(' ');const all=(h.title||'')+' '+(h.note||'')+' '+histText+' '+(h.type||'');
    if(has(all))healths.push({title:`<i class="ph-light ph-first-aid"></i> ${h.title||'(未命名)'} · ${h.type||'其他'}`,meta:h.nextDate?'<i class="ph-light ph-calendar-blank"></i> '+fmtDateLabel(h.nextDate):'未排期',content:snippetAround(h.note||histText||h.title||'',kw),
      jump:()=>{switchTab('box');state.boxTab='health';save();renderBox();setTimeout(()=>{const el=document.querySelector(`.hp-item[data-id="${h.id}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.boxShadow='0 0 0 3px var(--amber)';setTimeout(()=>el.style.boxShadow='',1800)}},150)}})});
  if(healths.length)groups.push({key:'health',label:'<i class="ph-light ph-first-aid"></i> 健康',items:healths});
  const periods=[];r.periods.forEach(p=>{if(has(p.note||''))periods.push({title:`<i class="ph-light ph-drop"></i> ${fmtDateOnly(p.startDate)}`,meta:p.duration?'持续 '+p.duration+' 天':'',content:snippetAround(p.note||'',kw),
    jump:()=>{switchTab('box');state.boxTab='period';save();renderBox();setTimeout(()=>{const el=document.querySelector(`.hp-item[data-id="${p.id}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.boxShadow='0 0 0 3px var(--amber)';setTimeout(()=>el.style.boxShadow='',1800)}},150)}})});
  if(periods.length)groups.push({key:'period',label:'<i class="ph-light ph-drop"></i> 生理期',items:periods});
  const letters=[];r.letters.forEach(l=>{const repText=(l.replies||[]).map(x=>(x.title||'')+' '+(x.content||'')).join(' ');const all=(l.title||'')+' '+(l.content||'')+' '+repText;
    if(has(all))letters.push({title:`<i class="ph-light ph-envelope"></i> ${l.title||'(无题)'}${!l.read?' 🔴':''}`,meta:fmtDateTime(l.ts||l.createdAt)+' · '+(l.content||'').length+' 字',content:snippetAround(l.content||'',kw),
      jump:()=>{switchTab('box');state.boxTab='letter';save();renderBox();setTimeout(()=>{const el=document.querySelector(`.letter-item[data-id="${l.id}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.boxShadow='0 0 0 3px var(--amber)';setTimeout(()=>el.style.boxShadow='',1800)}},150)}})});
  if(letters.length)groups.push({key:'letter',label:'<i class="ph-light ph-envelope"></i> 信',items:letters});
  const diaries=[];r.diaries.forEach(d=>{if(has(d.content||''))diaries.push({title:`<i class="ph-light ph-notebook"></i> 日记 · ${fmtDateOnly(d.ts||d.createdAt)}`,meta:(d.content||'').length+' 字',content:snippetAround(d.content||'',kw),
    jump:()=>{switchTab('box');state.boxTab='diary';save();renderBox();setTimeout(()=>{const el=document.querySelector(`.diary-item[data-id="${d.id}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.boxShadow='0 0 0 3px var(--amber)';setTimeout(()=>el.style.boxShadow='',1800)}},150)}})});
  if(diaries.length)groups.push({key:'diary',label:'<i class="ph-light ph-notebook"></i> 日记',items:diaries});
  if(groups.length===0){body.innerHTML=`<div class="search-tip"><span class="emoji"><i class="ph-light ph-question"></i></span>没找到包含「${escapeHtml(kw)}」的内容～<br><span style="color:var(--ink-3);font-size:11px">换个关键词试试 🤍</span></div>`;return}
  const total=groups.reduce((s,g)=>s+g.items.length,0);
  let html=`<div class="search-stat">共 <b>${total}</b> 条 · 分布在 <b>${groups.length}</b> 个分类</div>`;
  groups.forEach(g=>{
    const expanded=searchExpandedGroups.has(g.key);
    const showItems=expanded?g.items:g.items.slice(0,5);
    const more=g.items.length-showItems.length;
    html+=`<div class="search-group" data-group="${g.key}">
      <div class="search-group-head">${g.label} · ${g.items.length} 条</div>
      ${showItems.map((it,i)=>`<div class="search-item" data-gk="${g.key}" data-idx="${i}">
        <div class="search-item-title">${escapeHtml(it.title)}</div>
        ${it.meta?`<div class="search-item-meta">${escapeHtml(it.meta)}</div>`:''}
        <div class="search-item-content">${highlightKw(it.content||'',kw)}</div>
      </div>`).join('')}
      ${more>0?`<div class="search-more" data-more="${g.key}">展开剩余 ${more} 条 ▾</div>`:''}
    </div>`;
  });
  body.innerHTML=html;
  body.querySelectorAll('.search-item').forEach(el=>{el.onclick=()=>{const gk=el.dataset.gk;const idx=parseInt(el.dataset.idx);const grp=groups.find(g=>g.key===gk);if(grp&&grp.items[idx]){if(window._closeSearch)window._closeSearch();grp.items[idx].jump()}}});
  body.querySelectorAll('.search-more').forEach(el=>{el.onclick=()=>{const gk=el.dataset.more;searchExpandedGroups.add(gk);doSearch(kw)}});
}
