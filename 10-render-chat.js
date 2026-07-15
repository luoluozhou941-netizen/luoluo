// ─────────────────────────────────────────────
//  10-render-chat.js · 채팅 렌더링층
//  依赖：01-state.js（state、getRole、getConv、activeStreams、
//                    openActionMsgId、editingMsgId）
//        02-utils.js（escapeHtml、fmtTime、dayKey、fmtDay、
//                    fmtDeadline、toInputDatetime、parseInputDatetime、
//                    copyToClipboard、getMsgCopyText、aboutEmoji）
//        03-markdown.js（renderMarkdown、parseThinking、MEM_REGEX 等）
//        04-extractors.js（findSimilarEntry）
//        05-storage.js（save）
//        09-render-sidebar.js（renderModelChipBar）
//        15-modal-toast.js（showToast）← 运行时依赖
// ─────────────────────────────────────────────

/* ── 主聊天区渲染 ── */

function renderChat(){
  const c=getConv();const tl=document.getElementById('chat-stream');
  document.getElementById('conv-title').textContent=c?c.title:'—';
  document.getElementById('ai-name').textContent=getRole()?.name||'';
  renderModelChipBar();
  tl.innerHTML='';
  if(!c){tl.innerHTML='<div class="empty">点 ☰ 选窗口<br>或新建一个 ✨</div>';return}
  if(c.messages.length===0){tl.innerHTML=`<div class="empty">还没说话呢～<br>下面发点什么吧 ${getRole()?.signature||''}</div>`;return}
  const groups={};
  c.messages.forEach(m=>{(groups[dayKey(m.ts)]=groups[dayKey(m.ts)]||[]).push(m)});
  Object.keys(groups).sort().forEach(day=>{
    const g=document.createElement('div');g.className='day-group';
    const lbl=document.createElement('div');lbl.className='day-label';lbl.textContent=fmtDay(day);g.appendChild(lbl);
    groups[day].forEach(m=>g.appendChild(renderChatNode(m)));
    tl.appendChild(g);
  });
  tl.scrollTop=tl.scrollHeight;
}
function isBookmarked(msgId){
  const r=getRole();if(!r)return false;
  return r.bookmarks.some(b=>b.msgId===msgId);
}
function bindThinkingToggle(box){
  if(!box)return;
  const head=box.querySelector('.thinking-head');
  if(!head)return;
  head.onclick=e=>{
    e.stopPropagation();
    const id=box.dataset.tk;
    state.thinkingExpanded[id]=!state.thinkingExpanded[id];
    box.classList.toggle('expanded');
    save();
  };
}
function renderChatNode(m){
  const node=document.createElement('div');
  const bookmarked=isBookmarked(m.id);
  node.className='node '+m.role
    +(m.streaming?' streaming':'')
    +(m.interrupted?' interrupted':'')
    +(m.pinned?' pinned':'')
    +(bookmarked?' bookmarked':'');
  node.dataset.id=m.id;
  const r=getRole();
  const roleLabel=m.role==='user'?`${r.userMark||'我'}`:`${r.name} ${r.emoji||''}`.trim();
  const isEditing=editingMsgId===m.id&&!m.streaming;
  const isOpen=openActionMsgId===m.id&&!m.streaming&&!isEditing;

  let imgHtml='';
  if(m.images&&m.images.length)imgHtml=m.images.map(im=>`<img src="${im}" style="max-width:200px">`).join('');

  const displayContent=m.role==='assistant'?(m.displayContent!==undefined?m.displayContent:m.content):m.content;
  const bodyHtml=renderMarkdown(displayContent||'');

  const metaHtml=`<div class="meta"><span class="role">${roleLabel}</span><span>${fmtTime(m.ts)}</span></div>`;
  const wrapClass='bubble-wrap'+(isOpen?' show-actions':'');

  if(isEditing){
    const editVal=m.role==='assistant'
      ? (m.displayContent!==undefined?m.displayContent:parseThinking(stripAllTags(m.content||''),m.reasoningContent||'').contentAfter.trim())
      : (m.content||'');
    node.innerHTML=`${metaHtml}
      <div class="${wrapClass}">
        ${imgHtml?`<div class="bubble">${imgHtml}</div>`:''}
        <textarea class="bubble-edit" rows="3">${escapeHtml(editVal)}</textarea>
        <div class="bubble-edit-actions">
          <button data-act="cancel-edit">取消</button>
          <button class="primary" data-act="save-edit">保存</button>
        </div>
      </div>`;
    const ta=node.querySelector('.bubble-edit');
    setTimeout(()=>{ta.focus();ta.style.height='auto';ta.style.height=Math.max(70,ta.scrollHeight)+'px'},0);
    ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.max(70,ta.scrollHeight)+'px'});
    ta.addEventListener('keydown',e=>{
      if(e.key==='Escape'){editingMsgId=null;renderChat()}
      if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();saveEditMsg(m,ta.value)}
    });
    node.querySelector('[data-act="cancel-edit"]').onclick=()=>{editingMsgId=null;renderChat()};
    node.querySelector('[data-act="save-edit"]').onclick=()=>saveEditMsg(m,ta.value);
    return node;
  }

  let thinkingHtml='';
  if(m.role==='assistant'&&m.thinking){
    const expanded=!!state.thinkingExpanded[m.id];
    const streamingCls=(m.streaming&&!(m.displayContent&&m.displayContent.trim()))?' streaming':'';
    thinkingHtml=`<div class="thinking-box${expanded?' expanded':''}${streamingCls}" data-tk="${m.id}">
      <div class="thinking-head">
        <span class="thinking-arrow">▶</span>
        <span>💭 思考过程</span>
      </div>
      <div class="thinking-body">${escapeHtml(m.thinking)}</div>
    </div>`;
  }

  node.innerHTML=`${metaHtml}
    <div class="${wrapClass}">
      ${thinkingHtml}
      <div class="bubble">${imgHtml}<span class="text">${bodyHtml}</span></div>
    </div>`;

  bindThinkingToggle(node.querySelector('.thinking-box'));

  const wrap=node.querySelector('.bubble-wrap');
  const bubble=node.querySelector('.bubble');

  if(m.streaming&&m.role==='assistant'){
    const stopBtn=document.createElement('button');
    stopBtn.className='btn-stop';
    stopBtn.innerHTML='<i class="ph-light ph-stop"></i> 停止生成';
    stopBtn.onclick=e=>{e.stopPropagation();stopStream(m.id)};
    wrap.appendChild(stopBtn);
  }

  bubble.addEventListener('click',e=>{
    if(m.streaming)return;
    if(e.target.closest('a,pre,code'))return;
    const sel=window.getSelection&&window.getSelection();
    if(sel&&sel.toString().length>0)return;
    if(openActionMsgId===m.id){openActionMsgId=null}
    else{openActionMsgId=m.id;editingMsgId=null}
    renderChat();
  });

  if(isOpen){
    const actions=document.createElement('div');
    actions.className='msg-actions';
    // 🆕 1.10.3：聊天气泡加 📋 复制按钮
    actions.innerHTML=`
      <button data-act="copy"><i class="ph-light ph-copy"></i> 复制</button>
      <button data-act="pin"><i class="ph-light ph-tree"></i> 挂到记忆树</button>
      <button class="${bookmarked?'on':''}" data-act="bookmark">${bookmarked?'<i class="ph-light ph-bookmark-simple-fill"></i> 已收藏':'<i class="ph-light ph-bookmark-simple"></i> 收藏'}</button>
      <button data-act="edit"><i class="ph-light ph-pencil-simple"></i> 编辑</button>
      <button class="danger" data-act="del"><i class="ph-light ph-trash"></i> 删除</button>`;
    actions.querySelector('[data-act="copy"]').onclick=e=>{e.stopPropagation();copyToClipboard(getMsgCopyText(m))};
    actions.querySelector('[data-act="pin"]').onclick=e=>{e.stopPropagation();pinToTimeline(m.id)};
    actions.querySelector('[data-act="bookmark"]').onclick=e=>{e.stopPropagation();toggleBookmark(m.id)};
    actions.querySelector('[data-act="edit"]').onclick=e=>{e.stopPropagation();openActionMsgId=null;editingMsgId=m.id;renderChat()};
    actions.querySelector('[data-act="del"]').onclick=e=>{e.stopPropagation();deleteMsg(m.id)};
    wrap.appendChild(actions);
  }

  if(m.role==='assistant'&&m.savedMemoRefs&&m.savedMemoRefs.length){
    m.savedMemoRefs.forEach(ref=>{
      const tip=document.createElement('div');
      tip.className='memo-pending';
      tip.innerHTML=`<span><i class="ph-light ph-notebook"></i> 已收进共享备忘录：<b>${escapeHtml(ref.title)}</b> ${r.signature||''}</span><button data-memo-id="${ref.id}">去看看</button>`;
      tip.querySelector('button').onclick=e=>{
        e.stopPropagation();
        switchTab('box');state.boxTab='memo';save();renderBox();
        setTimeout(()=>{
          const el=document.querySelector(`.memo-item[data-id="${ref.id}"]`);
          if(el){el.scrollIntoView({behavior:'smooth',block:'center'});
            el.style.boxShadow='0 0 0 3px var(--mint-deep)';setTimeout(()=>el.style.boxShadow='',1800)}
        },150);
      };
      node.appendChild(tip);
    });
  }
  if(m.role==='assistant'&&m.savedLetterRefs&&m.savedLetterRefs.length){
    m.savedLetterRefs.forEach(ref=>{
      const tip=document.createElement('div');
      tip.className='letter-pending';
      tip.innerHTML=`<span><i class="ph-light ph-envelope"></i> 已收进信箱：<b>${escapeHtml(ref.title)}</b></span>
        <button data-letter-id="${ref.id}">去看看</button>`;
      tip.querySelector('button').onclick=e=>{
        e.stopPropagation();
        switchTab('box');state.boxTab='letter';save();renderBox();
        setTimeout(()=>{
          const el=document.querySelector(`.letter-item[data-id="${ref.id}"]`);
          if(el){el.scrollIntoView({behavior:'smooth',block:'center'});
            el.style.boxShadow='0 0 0 3px var(--amber)';setTimeout(()=>el.style.boxShadow='',1800)}
        },150);
      };
      node.appendChild(tip);
    });
  }
  if(m.role==='assistant'&&m.savedDiaryRefs&&m.savedDiaryRefs.length){
    m.savedDiaryRefs.forEach(ref=>{
      const tip=document.createElement('div');
      tip.className='diary-pending';
      tip.innerHTML=`<span><i class="ph-light ph-notebook"></i> 已收进日记本（${ref.length}字）</span>
        <button data-diary-id="${ref.id}">去看看</button>`;
      tip.querySelector('button').onclick=e=>{
        e.stopPropagation();
        switchTab('box');state.boxTab='diary';save();renderBox();
        setTimeout(()=>{
          const el=document.querySelector(`.diary-item[data-id="${ref.id}"]`);
          if(el){el.scrollIntoView({behavior:'smooth',block:'center'});
            el.style.boxShadow='0 0 0 3px #B8862E';setTimeout(()=>el.style.boxShadow='',1800)}
        },150);
      };
      node.appendChild(tip);
    });
  }

  if(m.role==='assistant'&&m.memSuggests&&m.memSuggests.length){
    const mw=document.createElement('div');mw.className='mem-suggests';
    m.memSuggests.forEach(s=>{
      let card;
      if(s.kind==='todo')card=renderTodoCard(m,s);
      else card=renderMemCard(m,s);
      if(card)mw.appendChild(card);
    });
    if(mw.children.length)node.appendChild(mw);
  }
  return node;
}
function stopStream(msgId){
  const info=activeStreams.get(msgId);
  if(!info)return;
  try{info.controller.abort()}catch(e){}
  activeStreams.delete(msgId);
  finishReveal(msgId);finishReveal('cmt:'+msgId);
}
function toggleBookmark(msgId){
  const r=getRole();const c=getConv();
  if(!r||!c)return;
  const m=c.messages.find(x=>x.id===msgId);
  if(!m)return;
  const existed=r.bookmarks.findIndex(b=>b.msgId===msgId);
  if(existed>=0){
    r.bookmarks.splice(existed,1);
    save();renderChat();
    showToast('已取消收藏',{duration:1500});
  }else{
    const content=getMsgCopyText(m);
    r.bookmarks.push({
      id:uid(),msgId:m.id,convId:c.id,convTitle:c.title,
      role:m.role,content,images:m.images||[],ts:m.ts,bookmarkedAt:Date.now()
    });
    save();renderChat();
    showToast(`已收藏 <i class="ph-light ph-bookmark-simple-fill"></i>${r.signature||''}`,{duration:1500,actionText:'看看',onAction:()=>{switchTab('box');state.boxTab='bookmark';save();renderBox()}});
  }
}
function renderMemCard(msg,s){
  const r=getRole();
  const card=document.createElement('div');
  if(s.status==='saved'){
    card.className='mem-card saved-info';
    card.innerHTML=`<i class="ph-light ph-check-circle"></i> 已记住 ${typeIcon(s.type)}：<b>${escapeHtml(s.content)}</b>（关于${aboutEmoji(s.about)}${escapeHtml(s.about)}）`;
    return card;
  }
  if(s.status==='skipped'){
    card.className='mem-card skipped-info';
    card.innerHTML=`<i class="ph-light ph-x-circle"></i> 已忽略这条记忆建议`;
    return card;
  }
  card.className='mem-card';
  card.innerHTML=`
    <div class="mem-card-head">
      <span>${r.signature||''} ${r.name}想记住</span>
      <select class="sel about-sel">
        <option value="${r.userMark||'我'}">${r.userMark||''} 关于你</option>
        <option value="${r.name}">${r.signature||''} 关于${r.name}</option>
        <option value="我们">${r.pairMark||''} 关于我们</option>
      </select>
      <select class="sel type-sel">
        <option value="fact"><i class="ph-light ph-brain"></i> 事实</option>
        <option value="moment"><i class="ph-light ph-cloud"></i> 瞬间</option>
        <option value="promise"><i class="ph-light ph-handshake"></i> 约定</option>
      </select>
    </div>
    <div class="dup-slot"></div>
    <textarea rows="2"></textarea>
    <div class="mem-card-actions">
      <button class="skip">× 不用记</button>
      <button class="save">✓ 存下来</button>
    </div>`;
  card.querySelector('.about-sel').value=s.about;
  card.querySelector('.type-sel').value=s.type;
  const ta=card.querySelector('textarea');ta.value=s.content;
  const aboutSel=card.querySelector('.about-sel');
  const dupSlot=card.querySelector('.dup-slot');
  const checkDup=()=>{
    const dup=findSimilarEntry(ta.value.trim(),aboutSel.value);
    if(dup){
      const tip=dup.kind==='exact'?'已经存过一模一样的':'已有相似的';
      dupSlot.innerHTML=`<div class="mem-dup-warn">
        <span class="dup-text">⚠️ ${tip}：<b>${escapeHtml(dup.entry.content)}</b></span>
        <button data-act="jump">看看</button>
      </div>`;
      dupSlot.querySelector('[data-act="jump"]').onclick=e=>{e.stopPropagation();jumpToTimelineEntry(dup.entry.id)};
    }else dupSlot.innerHTML='';
  };
  ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=ta.scrollHeight+'px';checkDup()});
  aboutSel.addEventListener('change',checkDup);
  setTimeout(()=>{ta.style.height='auto';ta.style.height=ta.scrollHeight+'px';checkDup()},0);
  card.querySelector('.skip').onclick=()=>{s.status='skipped';save();renderChat()};
  card.querySelector('.save').onclick=()=>{
    const content=ta.value.trim();if(!content){showToast('内容不能为空～');return}
    const about=aboutSel.value;
    const type=card.querySelector('.type-sel').value;
    const r=getRole();
    r.entries.push({id:uid(),ts:msg.ts,type,about,content,starred:false,
      sourceConvId:getConv()?.id||null,sourceMsgId:msg.id,comments:[]});
    s.status='saved';s.content=content;s.about=about;s.type=type;
    save();renderChat();renderTimeline();
  };
  return card;
}
function renderTodoCard(msg,s){
  const card=document.createElement('div');
  if(s.status==='saved'){
    card.className='mem-card saved-info';
    const dl=s.deadline?'，截止 '+fmtDeadline(s.deadline):'，没设截止';
    card.innerHTML=`<i class="ph-light ph-check-circle"></i> 已记到便利贴：<b>${escapeHtml(s.content)}</b>${dl}`;
    return card;
  }
  if(s.status==='skipped'){
    card.className='mem-card skipped-info';
    card.innerHTML=`<i class="ph-light ph-x-circle"></i> 已忽略这条待办`;
    return card;
  }
  card.className='mem-card todo-card';
  card.innerHTML=`
    <div class="mem-card-head">
      <span><i class="ph-light ph-push-pin"></i> ${r.name}想帮你记这件事</span>
    </div>
    <textarea rows="2" placeholder="具体要做啥"></textarea>
    <div style="margin-top:6px;font-size:11px;color:var(--ink-2)">截止时间（可留空）：</div>
    <input type="datetime-local" class="todo-dl">
    <div class="mem-card-actions">
      <button class="skip">× 不用记</button>
      <button class="save">✓ 钉到便利贴</button>
    </div>`;
  const ta=card.querySelector('textarea');ta.value=s.content;
  const dlInput=card.querySelector('.todo-dl');
  if(s.deadline)dlInput.value=toInputDatetime(s.deadline);
  ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=ta.scrollHeight+'px'});
  setTimeout(()=>{ta.style.height='auto';ta.style.height=ta.scrollHeight+'px'},0);
  card.querySelector('.skip').onclick=()=>{s.status='skipped';save();renderChat()};
  card.querySelector('.save').onclick=()=>{
    const content=ta.value.trim();if(!content){showToast('内容不能为空～');return}
    const deadline=parseInputDatetime(dlInput.value);
    const r=getRole();
    r.todos.push({id:uid(),content,deadline,createdAt:Date.now(),status:'pending',
      reason:null,history:[{ts:Date.now(),action:'created',from:'ai',sourceMsgId:msg.id}]});
    s.status='saved';s.content=content;s.deadline=deadline;
    save();renderChat();renderTodoPanel();
  };
  return card;
}
function saveEditMsg(m,newText){
  const r=getRole();
  const v=(newText||'').trim();
  if(!v&&(!m.images||m.images.length===0)){showToast('内容不能为空～');return}
  if(m.role==='assistant'){
    const clean=stripAllTags(v).trim();
    m.content=clean;m.displayContent=clean;
  }else m.content=v;
  if(m.interrupted)delete m.interrupted;
  editingMsgId=null;save();renderChat();
  showToast(`已保存 ${r.signature||''}`,{duration:2000});
}
function deleteMsg(msgId){
  const c=getConv();if(!c)return;
  const idx=c.messages.findIndex(x=>x.id===msgId);
  if(idx<0)return;
  if(activeStreams.has(msgId))stopStream(msgId);
  const removed=c.messages[idx];
  c.messages.splice(idx,1);
  openActionMsgId=null;editingMsgId=null;
  save();renderChat();
  showToast('已删除',{
    actionText:'撤销',duration:5000,
    onAction:()=>{
      const cNow=getConv();if(!cNow)return;
      const insertAt=Math.min(idx,cNow.messages.length);
      cNow.messages.splice(insertAt,0,removed);
      save();renderChat();
      showToast(`已撤销 ${r.signature||''}`,{duration:1800});
    }
  });
}
