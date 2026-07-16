// ─────────────────────────────────────────────
//  07-context.js · 上下文构建层
//  依赖：00-prompts.js（SEED_PROMPT）
//        01-state.js（state、getRole、getConv）
//        02-utils.js（getNowStamp、fmtDeadline、fmtDateOnly、aboutEmoji、dayKey）
//        03-markdown.js（MEM_REGEX 等、parseThinking）
//        06-providers.js（getActiveConfig）
// ─────────────────────────────────────────────

/* ── 注入历史摘要数据（按设置过滤；步骤9：接管原daily注入开关） ── */

function getSegmentsForInjection(){
  const r=getRole();
  if(!r||!r.segments||!r.segments.length)return [];
  if(!settings.dailyInjectEnabled)return [];
  const days=Math.max(1,parseInt(settings.segmentInjectDays)||14);
  const cutoff=new Date();cutoff.setDate(cutoff.getDate()-days);
  const cutoffKey=dayKey(cutoff.getTime());
  const list=r.segments.filter(s=>{
    if(s.status!=='confirmed'&&s.status!=='edited')return false;
    return s.pinned||(s.date_end&&s.date_end>=cutoffKey);
  });
  list.sort((a,b)=>(a.date_end||'').localeCompare(b.date_end||''));
  return list;
}
function getSharedMemosForInjection(){
  const r=getRole();
  if(!r||!r.memos||!r.memos.length)return [];
  return r.memos.filter(m=>m.shared).sort((a,b)=>(b.updatedAt||b.createdAt)-(a.updatedAt||a.createdAt));
}
function renderContextBar(){
  const area=document.getElementById('context-bar-area');
  if(!area)return;
  area.innerHTML='';
  const c=getConv();if(!c)return;
  const segments=getSegmentsForInjection();
  const sharedMemos=getSharedMemosForInjection();
  if(segments.length===0&&sharedMemos.length===0)return;
  const bar=document.createElement('div');bar.className='context-bar';
  const arrow=contextBarExpanded?'<i class="ph-light ph-caret-up"></i>':'<i class="ph-light ph-caret-down"></i>';
  const parts=[];
  if(sharedMemos.length)parts.push(`<b>${sharedMemos.length}</b> 条共享备忘录`);
  if(segments.length)parts.push(`<b>${segments.length}</b> 条历史摘要`);
  bar.innerHTML=`
    <div class="context-bar-head">
      <span class="cb-icon"><i class="ph-light ph-paperclip"></i></span>
      <span class="cb-text">本次给初晓带了：${parts.join(' · ')}</span>
      <span class="cb-arrow">${arrow}</span>
    </div>
    ${contextBarExpanded?`<div class="context-bar-list" id="cb-list"></div>`:''}`;
  bar.querySelector('.context-bar-head').onclick=()=>{contextBarExpanded=!contextBarExpanded;renderContextBar()};
  area.appendChild(bar);
  if(contextBarExpanded){
    const listEl=document.getElementById('cb-list');
    if(sharedMemos.length){
      const t=document.createElement('div');t.className='cb-section-title';t.innerHTML='<i class="ph-light ph-lock-open"></i> 共享备忘录';
      listEl.appendChild(t);
      sharedMemos.forEach(m=>{
        const item=document.createElement('div');item.className='cb-item';
        const summary=m.content||'';
        const truncated=summary.length>120;
        const tagsHtml=(m.tags||[]).map(t=>`<span>${escapeHtml(t)}</span>`).join('');
        item.innerHTML=`
          <div class="cb-item-head"><span class="cb-date"><i class="ph-light ph-notebook"></i> ${fmtDateOnly(m.updatedAt||m.createdAt)}</span></div>
          ${m.title?`<div class="cb-item-title">${escapeHtml(m.title)}</div>`:''}
          <div class="cb-item-summary ${truncated?'truncated':''}">${renderMarkdown(summary)}</div>
          ${truncated?'<span class="cb-item-toggle">展开 ▾</span>':''}
          ${tagsHtml?`<div class="cb-item-tags">${tagsHtml}</div>`:''}`;
        if(truncated){
          const sum=item.querySelector('.cb-item-summary');const tog=item.querySelector('.cb-item-toggle');
          tog.onclick=()=>{if(sum.classList.contains('expanded')){sum.classList.remove('expanded');sum.classList.add('truncated');tog.textContent='展开 ▾'}else{sum.classList.add('expanded');sum.classList.remove('truncated');tog.textContent='收起 ▴'}};
        }
        listEl.appendChild(item);
      });
    }
    if(segments.length){
      const t=document.createElement('div');t.className='cb-section-title';t.innerHTML='<i class="ph-light ph-scroll"></i> 历史摘要';
      listEl.appendChild(t);
      segments.forEach(s=>{
        const item=document.createElement('div');item.className='cb-item';
        const summary=s.summary||'';
        const truncated=summary.length>120;
        const tagsHtml=(s.tags||[]).map(t=>`<span>${escapeHtml(t)}</span>`).join('');
        const dateLabel=s.date_start===s.date_end?s.date_start:`${s.date_start} ~ ${s.date_end}`;
        item.innerHTML=`
          <div class="cb-item-head"><span class="cb-date">${escapeHtml(dateLabel)}</span></div>
          <div class="cb-item-summary ${truncated?'truncated':''}">${escapeHtml(summary)}</div>
          ${truncated?'<span class="cb-item-toggle">展开 ▾</span>':''}
          ${tagsHtml?`<div class="cb-item-tags">${tagsHtml}</div>`:''}`;
        if(truncated){
          const sum=item.querySelector('.cb-item-summary');const tog=item.querySelector('.cb-item-toggle');
          tog.onclick=()=>{if(sum.classList.contains('expanded')){sum.classList.remove('expanded');sum.classList.add('truncated');tog.textContent='展开 ▾'}else{sum.classList.add('expanded');sum.classList.remove('truncated');tog.textContent='收起 ▴'}};
        }
        listEl.appendChild(item);
      });
    }
  }
}
/* ── 时间感知：历史消息时间锚点 + 动态时间摘要 ── */

function buildTimeAnchor(prevTs,curTs){
  if(!prevTs||!curTs)return '';
  if(curTs-prevTs<300000)return '';
  const d=new Date(curTs),now=new Date();
  const pad=n=>String(n).padStart(2,'0');
  const hm=pad(d.getHours())+':'+pad(d.getMinutes());
  const ds=d.toDateString(),ns=now.toDateString();
  const y=new Date(now);y.setDate(now.getDate()-1);
  if(d.getFullYear()!==now.getFullYear())return '['+d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+hm+']\n';
  if(ds===ns)return '[今天 '+hm+']\n';
  if(ds===y.toDateString())return '[昨天 '+hm+']\n';
  const p=new Date(prevTs);
  if(ds===p.toDateString())return '['+hm+']\n';
  return '['+(d.getMonth()+1)+'月'+d.getDate()+'日 '+hm+']\n';
}
function buildTimeGuide(msgs){
  const list=(msgs||[]).filter(m=>!m.streaming);
  if(!list.length)return '';
  const now=new Date();
  const pad=n=>String(n).padStart(2,'0');
  const wk=['周日','周一','周二','周三','周四','周五','周六'];
  const nowStr=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate())+' '+wk[now.getDay()]+' '+pad(now.getHours())+':'+pad(now.getMinutes());
  let lastUser=null,prevUser=null,rounds=0;
  for(let i=list.length-1;i>=0;i--){
    const m=list[i];
    if(m.role==='user'){
      if(!lastUser)lastUser=m.ts;else if(!prevUser)prevUser=m.ts;
      rounds++;
    }
  }
  function fmtGap(ms){
    if(!ms||ms<0)return '刚刚';
    const min=Math.floor(ms/60000);
    if(min<1)return '刚刚';
    if(min<60)return min+'分钟';
    const hr=Math.floor(ms/3600000);
    if(hr<24)return hr+'小时';
    return Math.floor(ms/86400000)+'天';
  }
  const parts=['现在：'+nowStr];
  if(prevUser!=null)parts.push('距你上条：'+fmtGap(lastUser-prevUser));
  const role=getRole();
  if(role&&role.lastAiReplyTs)parts.push('距我上次回复：'+fmtGap(Date.now()-role.lastAiReplyTs));
  else parts.push('我还没回复过');
  parts.push('本窗口第'+rounds+'轮');
  return '\n\n[时间感知] '+parts.join(' | ');
}
function buildSystemPrompt(){
  // 步骤9：注入顺序按变动频率从稳到活重排，让prompt cache的前缀尽量长命中。
  // 人设 → 长期记忆(facts/promises，稳) → 历史摘要(新增) → 共享备忘录 → 信/日记(压缩成一行) → moments(单独摘出，比facts/promises活跃) → 便利贴(最活跃，放最后)
  const r=getRole();let sys=(r.systemPrompt||SEED_PROMPT);

  if(r.entries&&r.entries.length){
    const facts=r.entries.filter(e=>e.type==='fact');
    const promises=r.entries.filter(e=>e.type==='promise');
    const fmt=e=>`- ${e.starred?'⭐ ':''}${e.content}`;
    const group=(arr)=>{
      const by={'洛洛':[],'我们':[],'初晓':[]};
      arr.forEach(e=>{(by[e.about]||(by[e.about]=[])).push(e)});
      let out='';
      ['洛洛','我们','初晓'].forEach(k=>{if(by[k]&&by[k].length){out+=`\n**关于${k}${aboutEmoji(k)}**\n`;by[k].sort((a,b)=>(b.starred?1:0)-(a.starred?1:0));by[k].forEach(e=>{out+=fmt(e)+'\n'})}});
      return out;
    };
    if(facts.length||promises.length){
      sys+='\n\n## 📚 已归档记忆（只读 · 不要再次标 [[MEMORY]]）';
      if(facts.length)sys+='\n\n### 🧠 长期事实'+group(facts);
      if(promises.length)sys+='\n\n### 🤝 我们的约定'+group(promises);
      sys+='\n\n（以上 📚 已归档 · 自然带出来即可，不要逐字复述，也不要重新标 [[MEMORY]]）';
    }
  }

  const segments=getSegmentsForInjection();
  if(segments.length){
    sys+=`\n\n## 📜 历史摘要（📚 已归档 · 按话题整理的前情，供你回忆上下文）\n`;
    segments.forEach(s=>{
      const dateLabel=s.date_start===s.date_end?s.date_start:`${s.date_start} ~ ${s.date_end}`;
      const tagsLabel=(s.tags&&s.tags.length)?`（${s.tags.join(' / ')}）`:'';
      sys+=`\n### ${dateLabel}${tagsLabel}\n${s.summary}\n`;
    });
    sys+=`\n（这些是话题流水 📚 已归档 · 不要逐字复述；如果洛洛问起、或话题接得上时再自然带出来）`;
  }

  const sharedMemos=getSharedMemosForInjection();
  if(sharedMemos.length){
    sys+='\n\n## 🤍 共享备忘录（📚 我们的共同笔记本，只读）\n';
    sys+='这些是洛洛和你共同认可的方案/共识/攻略。你可以引用，**但是不要重复创建相同主题的 [[MEMO_SHARED]]**。\n';
    sharedMemos.forEach(m=>{sys+=`\n### ${m.title||'(无题)'}　_${fmtDateOnly(m.updatedAt||m.createdAt)}_\n${m.content}\n`});
    sys+='\n（以上 📚 已归档 · 自然引用，别逐字复述）';
  }

  if(r.letters&&r.letters.length){
    const last=[...r.letters].sort((a,b)=>(b.ts||0)-(a.ts||0))[0];
    sys+=`\n\n## ✉️ 写信记录\n你最近写信：${fmtDateOnly(last.ts||last.createdAt)}（别短期内重复写信）`;
  }
  if(r.diaries&&r.diaries.length){
    const last=[...r.diaries].sort((a,b)=>(b.ts||0)-(a.ts||0))[0];
    sys+=`\n\n## 📓 写日记记录\n你最近写日记：${fmtDateOnly(last.ts||last.createdAt)}（注意密度，别每天都写）`;
  }

  if(r.entries&&r.entries.length){
    const cutoffDate=new Date();cutoffDate.setDate(cutoffDate.getDate()-30);
    const cutoffKey=dayKey(cutoffDate.getTime());
    const moments=r.entries.filter(e=>e.type==='moment'&&(e.starred||dayKey(e.ts)>=cutoffKey));
    if(moments.length){
      const sorted=[...moments].sort((a,b)=>a.ts-b.ts);
      sys+='\n\n## 💭 近期值得记住的瞬间（📚 已归档 · 近30天+星标，只读，不要重新标 [[MEMORY]]）\n';
      sorted.forEach(n=>{const d=new Date(n.ts);const ds=`${d.getMonth()+1}/${d.getDate()}`;sys+=`- ${ds} ${n.starred?'⭐ ':''}${n.content}\n`});
      sys+='\n（自然带出来即可，不要逐字复述）';
    }
  }

  if(r.todos&&r.todos.length){
    const weekAhead=Date.now()+7*86400000;
    const active=r.todos.filter(t=>(t.status==='pending'||t.status==='delayed')&&(!t.deadline||t.deadline<=weekAhead));
    if(active.length){
      sys+='\n\n## 📌 便利贴（她目前的待办 · 只显示一周内到期+无期限的，不要重复标TODO）\n';
      active.forEach(t=>{const dl=t.deadline?`（截止 ${fmtDeadline(t.deadline)}）`:'（没设时间）';sys+=`- ${t.content} ${dl}${t.status==='delayed'?' ⏳拖延中':''}\n`});
    }
  }

  return sys;
}
function buildMessages(c){
  const sysText=buildSystemPrompt();
  const sysContent=settings.cacheControlEnabled
    ? [{type:'text',text:sysText,cache_control:{type:'ephemeral'}}]
    : sysText;
  const arr=[{role:'system',content:sysContent}];
  const recent20=c.messages.filter(m=>!m.streaming).slice(-20);
  let prevTs=null;
  recent20.forEach(m=>{
    let timePrefix='';
    if(prevTs&&m.role==='user'){
      timePrefix=buildTimeAnchor(prevTs,m.ts);
    }
    if(m.role==='user'){
      if(m.images&&m.images.length){
        const parts=[];
        const text=(timePrefix||'')+(m.content||'');
        if(text)parts.push({type:'text',text});
        m.images.forEach(url=>parts.push({type:'image_url',image_url:{url}}));
        arr.push({role:'user',content:parts});
      }else arr.push({role:'user',content:timePrefix+(m.content||'')});
    }else if(m.role==='assistant'){
      const clean=m.displayContent!==undefined?m.displayContent:parseThinking(stripAllTags(m.content||''),m.reasoningContent||'').contentAfter.trim();
      arr.push({role:'assistant',content:clean});
    }
    prevTs=m.ts;
  });
  const timeGuide=buildTimeGuide(c.messages);
  const thinkGuide='\n\n（无论你是否有原生 reasoning/thinking 能力，这次回复都必须先按【思考开始】…【思考结束】格式思考，这两个标签必须真实打出来，不能省略、不能因为"自己有原生思考"就跳过）';
  for(let i=arr.length-1;i>=0;i--){
    if(arr[i].role==='user'){
      const fullGuide=timeGuide+thinkGuide;
      if(typeof arr[i].content==='string'){arr[i]={...arr[i],content:arr[i].content+fullGuide}}
      else if(Array.isArray(arr[i].content)){
        const parts=[...arr[i].content];
        const last=parts[parts.length-1];
        if(last&&last.type==='text')parts[parts.length-1]={...last,text:last.text+fullGuide};
        else parts.push({type:'text',text:fullGuide.trim()});
        arr[i]={...arr[i],content:parts};
      }
      break;
    }
  }
  return arr;
}
function buildMessagesForComment(node){
  let sys=buildSystemPrompt();
  sys+=`\n\n## 当前正在评论的记忆树节点
${typeIcon(node.type)} **${node.content}**（${new Date(node.ts).toLocaleString('zh-CN')}）

接下来洛洛在这条节点底下追问/聊天，请就这条节点的内容自然回应。`;
  const arr=[{role:'system',content:sys}];
  const cmts=(node.comments||[]).filter(c=>!c.streaming);
  let prevTs=null;
  cmts.forEach(c=>{
    let timePrefix='';
    if(prevTs&&c.role==='user'){
      timePrefix=buildTimeAnchor(prevTs,c.ts);
    }
    if(c.role==='user'){
      arr.push({role:'user',content:timePrefix+(c.content||'')});
    }else{
      const content=c.displayContent!==undefined?c.displayContent:parseThinking(stripAllTags(c.content||''),c.reasoningContent||'').contentAfter.trim();
      arr.push({role:'assistant',content:content||''});
    }
    prevTs=c.ts;
  });
  const timeGuide=buildTimeGuide(node.comments||[]);
  const thinkGuide='\n\n（无论你是否有原生 reasoning/thinking 能力，这次回复都必须先按【思考开始】…【思考结束】格式思考，这两个标签必须真实打出来，不能省略、不能因为"自己有原生思考"就跳过）';
  for(let i=arr.length-1;i>=0;i--){
    if(arr[i].role==='user'){
      if(typeof arr[i].content==='string')arr[i]={...arr[i],content:arr[i].content+timeGuide+thinkGuide};
      break;
    }
  }
  return arr;
}
