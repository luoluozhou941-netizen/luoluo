// ─────────────────────────────────────────────
//  12-render-box.js · 盒子渲染层
//  依赖：01-state.js（state、getRole、getConv、BOX_TABS、HEALTH_TYPES、
//                    editingMemoId、editingHealthId、editingPeriodId、
//                    editingLetterId、editingDiaryId、letterReplyForms）
//        02-utils.js（escapeHtml、fmtDateTime、fmtDateOnly、fmtDateLabel、
//                    dayKey、daysBetween、toInputDate、toInputDatetime、
//                    parseInputDate、parseInputDatetime、copyToClipboard）
//        03-markdown.js（renderMarkdown）
//        05-storage.js（save）
//        11-render-timeline.js（jumpFromBookmark）
//        15-modal-toast.js（showModal、showToast）← 运行时依赖
// ─────────────────────────────────────────────

/* ── 未读信件数量 ── */

function getUnreadLetterCount(){const r=getRole();if(!r)return 0;return r.letters.filter(l=>!l.read).length}
function renderBox(){
  const tabsEl=document.getElementById('box-subtabs');tabsEl.innerHTML='';
  const unreadLetters=getUnreadLetterCount();
  BOX_TABS.forEach(t=>{
    const b=document.createElement('button');
    b.className='box-subtab'+(state.boxTab===t.key?' active':'');
    b.innerHTML=t.label;
    if(t.key==='letter'&&unreadLetters>0){
      const badge=document.createElement('span');badge.className='sub-badge';
      badge.textContent=unreadLetters>9?'9+':unreadLetters;b.appendChild(badge);
    }
    b.onclick=()=>{state.boxTab=t.key;save();renderBox()};
    tabsEl.appendChild(b);
  });
  const body=document.getElementById('box-body');body.innerHTML='';
  if(state.boxTab==='memo')renderMemoPanel(body);
  else if(state.boxTab==='bookmark')renderBookmarkPanel(body);
  else if(state.boxTab==='health')renderHealthPanel(body);
  else if(state.boxTab==='period')renderPeriodPanel(body);
  else if(state.boxTab==='letter')renderLetterPanel(body);
  else if(state.boxTab==='diary')renderDiaryPanel(body);
}
function getAllMemoTags(){
  const r=getRole();if(!r)return [];
  const set=new Set();
  r.memos.forEach(m=>(m.tags||[]).forEach(t=>set.add(t)));
  return [...set].sort();
}
function renderMemoPanel(body){
  const r=getRole();if(!r)return;
  body.innerHTML='';
  const sharedCount=r.memos.filter(m=>m.shared).length;
  const header=document.createElement('div');
  header.className='box-header';
  header.innerHTML=`<i class="ph-light ph-notebook"></i> <b>备忘录 · 我们的共同书桌</b>　
    <span style="color:var(--ink-3)">私人 ${r.memos.length-sharedCount} · </span><span style="color:var(--mint-deep)"><i class="ph-light ph-lock-open"></i> 共享 ${sharedCount}</span><br>
    <span style="color:var(--ink-3);font-size:11px">私人条目${r.name}看不到；点 <i class="ph-light ph-lock-open"></i> 共享后我能在聊天时引用 ${r.signature||''}</span>`;
  body.appendChild(header);
  const top=document.createElement('div');
  top.className='memo-top';
  top.innerHTML=`<button class="memo-add-btn" id="memo-add"><i class="ph-light ph-plus"></i> 新建</button>
    <span class="memo-count">共 ${r.memos.length} 条</span>`;
  body.appendChild(top);
  top.querySelector('#memo-add').onclick=()=>memoNew();
  const allTags=getAllMemoTags();
  if(allTags.length>0){
    const tf=document.createElement('div');tf.className='memo-tag-filter';
    const all=document.createElement('span');all.className='mt-chip'+(state.memoTagFilter==='all'?' active':'');
    all.innerHTML='全部';all.onclick=()=>{state.memoTagFilter='all';save();renderBox()};
    tf.appendChild(all);
    allTags.forEach(t=>{
      const chip=document.createElement('span');
      chip.className='mt-chip'+(state.memoTagFilter===t?' active':'');
      chip.textContent=t;chip.onclick=()=>{state.memoTagFilter=t;save();renderBox()};
      tf.appendChild(chip);
    });
    body.appendChild(tf);
  }
  let list=[...r.memos];
  if(state.memoTagFilter!=='all')list=list.filter(m=>(m.tags||[]).includes(state.memoTagFilter));
  list.sort((a,b)=>(b.updatedAt||b.createdAt)-(a.updatedAt||a.createdAt));
  if(list.length===0){
    const e=document.createElement('div');e.className='box-empty';
    e.innerHTML=r.memos.length===0
      ? `<span class="emoji"><i class="ph-light ph-notebook" style="font-size:32px"></i></span>还没有备忘录～<br>点「＋ 新建」写点什么吧 ${r.signature||''}<br><span style="color:var(--ink-3);font-size:11px">（默认私人，可点 <i class="ph-light ph-lock-open"></i> 共享让${r.name}看到）</span>`
      : '<span class="emoji"><i class="ph-light ph-magnifying-glass"></i></span>这个标签下还没有条目～';
    body.appendChild(e);return;
  }
  list.forEach(m=>body.appendChild(renderMemoItem(m)));
}
function renderMemoItem(m){
  const r=getRole();
  const div=document.createElement('div');
  div.className='memo-item'+(editingMemoId===m.id?' editing':'')+(m.shared?' shared':'');
  div.dataset.id=m.id;
  if(editingMemoId===m.id){
    div.innerHTML=`<div class="memo-edit-area">
      <input id="memo-title-${m.id}" type="text" placeholder="标题（可留空）" value="${escapeHtml(m.title||'')}" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:7px 10px;background:#fff;outline:none;font-size:13px;font-weight:500;margin-bottom:6px">
      <textarea id="memo-ta-${m.id}" placeholder="写点什么…">${escapeHtml(m.content||'')}</textarea>
      <div class="tag-input-row">
        <span style="font-size:12px;color:var(--ink-2);flex-shrink:0"><i class="ph-light ph-tag"></i> 标签</span>
        <input id="memo-tags-${m.id}" value="${escapeHtml((m.tags||[]).join(', '))}" placeholder="逗号分隔，比如：灵感, 心情">
      </div>
      <div class="share-row">
        <input type="checkbox" id="memo-share-${m.id}" ${m.shared?'checked':''}>
        <label for="memo-share-${m.id}"><i class="ph-light ph-lock-open"></i> 共享给${r.name}（TA能在聊天时看到、引用这条）</label>
        <span class="hint">${m.shared?'当前：共享中':'当前：私人'}</span>
      </div>
      <div class="edit-actions">
        <button data-act="cancel">取消</button>
        <button class="primary" data-act="save">保存</button>
      </div>
    </div>`;
    const ta=div.querySelector(`#memo-ta-${m.id}`);
    setTimeout(()=>{ta.focus();ta.style.height='auto';ta.style.height=Math.max(80,ta.scrollHeight)+'px'},10);
    ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.max(80,ta.scrollHeight)+'px'});
    div.querySelector('[data-act="cancel"]').onclick=()=>{editingMemoId=null;if(m._isNew){const r=getRole();r.memos=r.memos.filter(x=>x.id!==m.id);save()}renderBox()};
    div.querySelector('[data-act="save"]').onclick=()=>{
      const content=ta.value.trim();
      if(!content){showToast('内容不能为空～');return}
      const title=div.querySelector(`#memo-title-${m.id}`).value.trim().slice(0,40);
      const tagStr=div.querySelector(`#memo-tags-${m.id}`).value;
      const tags=tagStr.split(/[,，、]/).map(s=>s.trim()).filter(Boolean);
      const shared=div.querySelector(`#memo-share-${m.id}`).checked;
      m.title=title;m.content=content;m.tags=tags;m.shared=shared;
      m.updatedAt=Date.now();delete m._isNew;
      editingMemoId=null;save();renderBox();
      showToast(shared?'已保存为<i class="ph-light ph-lock-open"></i>共享':'已保存为私人',{duration:1500});
    };
    return div;
  }
  const dateStr=fmtDateTime(m.updatedAt||m.createdAt);
  const updated=(m.updatedAt&&m.updatedAt!==m.createdAt)?'（编辑过）':'';
  const tagsHtml=(m.tags||[]).map(t=>`<span class="mt-tag">${escapeHtml(t)}</span>`).join('');
  const cmtCount=(m.comments||[]).length;
  const titleHtml=m.title?`<div style="font-weight:600;color:var(--ink);margin-bottom:6px;font-size:14px">${escapeHtml(m.title)}</div>`:'';
  const shareBadge=m.shared?`<span class="memo-share-badge"><i class="ph-light ph-lock-open"></i> 共享给${r.name}</span>`:'';
  div.innerHTML=`
    <div class="memo-meta">
      <span><i class="ph-light ph-clock"></i> ${dateStr}${updated}</span>
      ${cmtCount?`<span><i class="ph-light ph-chat"></i> ${cmtCount}</span>`:''}
      ${shareBadge}
    </div>
    ${tagsHtml?`<div class="memo-tags">${tagsHtml}</div>`:''}
    ${titleHtml}
    <div class="memo-content">${renderMarkdown(m.content||'')}</div>
    <div class="memo-actions">
      <button data-act="copy"><i class="ph-light ph-copy"></i> 复制</button>
      <button class="share-btn ${m.shared?'on':''}" data-act="toggle-share">${m.shared?'<i class="ph-light ph-lock-open"></i> 共享中':'<i class="ph-light ph-lock"></i> 私人'}</button>
      <button data-act="edit"><i class="ph-light ph-pencil-simple"></i> 编辑</button>
      <button data-act="forward"><i class="ph-light ph-share"></i> 转发到聊天</button>
      <button data-act="cmt"><i class="ph-light ph-chat"></i> 追评</button>
      <button class="danger" data-act="del"><i class="ph-light ph-trash"></i> 删除</button>
    </div>
    <div class="memo-cmts" id="memo-cmts-${m.id}" style="display:none"></div>`;
  // 🆕 1.10.3：备忘录复制
  div.querySelector('[data-act="copy"]').onclick=()=>{
    const txt=`${m.title?'《'+m.title+'》\n\n':''}${m.content||''}${m.tags&&m.tags.length?'\n\n标签：'+m.tags.join(' / '):''}`;
    copyToClipboard(txt);
  };
  div.querySelector('[data-act="toggle-share"]').onclick=()=>memoToggleShare(m.id);
  div.querySelector('[data-act="edit"]').onclick=()=>{editingMemoId=m.id;renderBox()};
  div.querySelector('[data-act="forward"]').onclick=()=>memoForward(m);
  div.querySelector('[data-act="del"]').onclick=()=>memoDelete(m.id);
  div.querySelector('[data-act="cmt"]').onclick=()=>{
    const box=div.querySelector(`#memo-cmts-${m.id}`);
    if(box.style.display==='none'){box.style.display='block';renderMemoComments(m,box)}
    else box.style.display='none';
  };
  if(cmtCount>0){const box=div.querySelector(`#memo-cmts-${m.id}`);box.style.display='block';setTimeout(()=>renderMemoComments(m,box),0)}
  return div;
}
function memoToggleShare(id){
  const r=getRole();const m=r.memos.find(x=>x.id===id);if(!m)return;
  m.shared=!m.shared;m.updatedAt=Date.now();save();renderBox();
  showToast(m.shared?`已切换为<i class="ph-light ph-lock-open"></i>共享 · ${r.name}下次回复会看到`:`已切换为🔒私人 · ${r.name}看不到了`,{duration:2200});
}
function renderMemoComments(m,box){
  m.comments=m.comments||[];
  let html='';
  m.comments.forEach(c=>{
    html+=`<div class="memo-cmt" data-cid="${c.id}">
      <div class="memo-cmt-meta">${fmtDateTime(c.ts)}</div>
      ${escapeHtml(c.content)}
      <button class="memo-cmt-del"><i class="ph-light ph-x"></i></button>
    </div>`;
  });
  html+=`<div class="memo-cmt-input">
    <textarea id="memo-cmt-in-${m.id}" placeholder="追评一下…" rows="1"></textarea>
    <button id="memo-cmt-send-${m.id}">发送</button>
  </div>`;
  box.innerHTML=html;
  box.querySelectorAll('.memo-cmt-del').forEach(b=>{
    b.onclick=e=>{
      e.stopPropagation();const cid=b.closest('.memo-cmt').dataset.cid;
      m.comments=m.comments.filter(x=>x.id!==cid);save();renderMemoComments(m,box);
    };
  });
  const ta=box.querySelector(`#memo-cmt-in-${m.id}`);
  ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,80)+'px'});
  ta.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&window.innerWidth>=900){e.preventDefault();sendMemoComment(m,box)}
  });
  box.querySelector(`#memo-cmt-send-${m.id}`).onclick=()=>sendMemoComment(m,box);
}
function sendMemoComment(m,box){
  const ta=box.querySelector(`#memo-cmt-in-${m.id}`);
  const text=ta.value.trim();if(!text)return;
  m.comments=m.comments||[];m.comments.push({id:uid(),content:text,ts:Date.now()});
  m.updatedAt=Date.now();ta.value='';ta.style.height='auto';save();renderMemoComments(m,box);
}
function memoNew(){
  const r=getRole();if(!r)return;
  const m={id:uid(),title:'',content:'',tags:[],comments:[],shared:false,createdAt:Date.now(),updatedAt:Date.now(),_isNew:true};
  r.memos.unshift(m);editingMemoId=m.id;save();renderBox();
}
function memoDelete(id){
  const r=getRole();const m=r.memos.find(x=>x.id===id);if(!m)return;
  showModal(`<h3>删除这条备忘录？</h3>
    <div style="line-height:1.7;color:var(--ink-2);max-height:200px;overflow-y:auto;background:var(--cream-2);padding:10px;border-radius:8px;font-size:13px;white-space:pre-wrap">${m.title?'<b>'+escapeHtml(m.title)+'</b><br><br>':''}${escapeHtml(m.content.slice(0,300))}${m.content.length>300?'…':''}</div>
    <div style="margin-top:10px;color:var(--ink-2);font-size:12px">彻底删除，不可恢复</div>`,()=>{
    r.memos=r.memos.filter(x=>x.id!==id);save();renderBox();showToast('已删除',{duration:1500});
  },'删除','danger');
}
function memoForward(m){
  const r=getRole();
  const ta=document.getElementById('input-text');
  const tagStr=(m.tags||[]).length?`【${m.tags.join(' · ')}】\n`:'';
  const dateStr=fmtDateTime(m.createdAt);
  const titlePart=m.title?`《${m.title}》\n`:'';
  const sharedTip=m.shared?`（${r.signature||''} 这是共享的，你已经在 system prompt 里能看到）\n`:'';
  const quote=`📓 备忘录 · ${dateStr}\n${titlePart}${tagStr}${sharedTip}${m.content}\n\n---\n`;
  const existing=ta.value;
  ta.value=existing?(quote+'\n'+existing):quote;
  switchTab('chat');save();renderAll();
  setTimeout(()=>{
    ta.focus();ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,140)+'px';
    ta.setSelectionRange(ta.value.length,ta.value.length);ta.scrollTop=ta.scrollHeight;
  },100);
  showToast(`已贴进输入框，发出去会自动美化排版 ${r.signature||""}`,{duration:2500});
}
function renderBookmarkPanel(body){
  const r=getRole();if(!r)return;
  body.innerHTML='';
  const header=document.createElement('div');header.className='box-header';
  header.innerHTML=`<i class="ph-light ph-bookmark-simple"></i> <b>收藏夹</b>　<span style="color:var(--ink-3)">（纯本地，${r.name}看不到；想让TA看就 <i class="ph-light ph-share"></i> 转发）</span>`;
  body.appendChild(header);
  if(r.bookmarks.length===0){
    const e=document.createElement('div');e.className='box-empty';
    e.innerHTML=`<span class="emoji"><i class="ph-light ph-bookmark-simple" style="font-size:32px"></i></span>还没收藏消息～<br>聊天里点气泡→<i class="ph-light ph-bookmark-simple"></i> 收藏就能存到这里 ${r.signature||''}`;
    body.appendChild(e);return;
  }
  const top=document.createElement('div');top.className='memo-top';
  top.innerHTML=`<span class="memo-count">共 ${r.bookmarks.length} 条</span>`;
  body.appendChild(top);
  const sorted=[...r.bookmarks].sort((a,b)=>b.bookmarkedAt-a.bookmarkedAt);
  sorted.forEach(bm=>body.appendChild(renderBookmarkItem(bm)));
}
function renderBookmarkItem(bm){
  const r=getRole();
  const div=document.createElement('div');
  div.className='bm-item '+bm.role;div.dataset.id=bm.id;
  const roleLabel=bm.role==='user'?`${r.userMark||'我'}`:`${r.name} ${r.emoji||''}`.trim();
  let contentHtml='';
  if(bm.images&&bm.images.length)contentHtml+=bm.images.map(im=>`<img src="${im}">`).join('');
  contentHtml+=renderMarkdown(bm.content||'');
  const rawLen=(bm.content||'').length;
  const truncated=rawLen>260;
  div.innerHTML=`
    <div class="bm-meta">
      <span class="role">${roleLabel}</span>
      <span><i class="ph-light ph-clock"></i> ${fmtDateTime(bm.ts)}</span>
      <span class="from">来自「${escapeHtml(bm.convTitle||'未命名')}」</span>
    </div>
    <div class="bm-content ${truncated?'truncated':''}" data-expanded="0">${contentHtml}</div>
    ${truncated?'<span class="bm-expand">展开全文 ▾</span>':''}
    <div class="bm-actions">
      <button data-act="copy"><i class="ph-light ph-copy"></i> 复制</button>
      <button data-act="jump"><i class="ph-light ph-scroll"></i> 跳回原对话</button>
      <button data-act="forward"><i class="ph-light ph-share"></i> 转发到聊天</button>
      <button class="danger" data-act="del"><i class="ph-light ph-trash"></i> 取消收藏</button>
    </div>`;
  if(truncated){
    const ce=div.querySelector('.bm-content');const ex=div.querySelector('.bm-expand');
    ex.onclick=()=>{
      if(ce.dataset.expanded==='0'){ce.classList.remove('truncated');ce.style.maxHeight='none';ce.dataset.expanded='1';ex.textContent='收起 ▴'}
      else{ce.classList.add('truncated');ce.style.maxHeight='180px';ce.dataset.expanded='0';ex.textContent='展开全文 ▾'}
    };
  }
  // 🆕 1.10.3：收藏复制
  div.querySelector('[data-act="copy"]').onclick=()=>copyToClipboard(bm.content||'');
  div.querySelector('[data-act="jump"]').onclick=()=>jumpFromBookmark(bm);
  div.querySelector('[data-act="forward"]').onclick=()=>bookmarkForward(bm);
  div.querySelector('[data-act="del"]').onclick=()=>{
    const r2=getRole();r2.bookmarks=r2.bookmarks.filter(x=>x.id!==bm.id);
    save();renderBox();renderChat();showToast('已取消收藏',{duration:1500});
  };
  return div;
}
function stripMarkdown(s){
  if(!s)return '';
  return s.replace(/```\w*\n?([\s\S]*?)```/g,'$1').replace(/`([^`\n]+)`/g,'$1')
    .replace(/^#{1,4}\s+/gm,'').replace(/\*\*([^*\n]+)\*\*/g,'$1').replace(/(^|[^*])\*([^*\n]+)\*/g,'$1$2')
    .replace(/^>\s?/gm,'').replace(/^[-*]\s+/gm,'· ').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').trim();
}
function bookmarkForward(bm){
  const r=getRole();
  const ta=document.getElementById('input-text');
  const who=bm.role==='user'?'我自己':`${r.name}`;
  const dateStr=fmtDateTime(bm.ts);
  const content=(bm.content||'')||(bm.images?.length?'[图片]':'');
  const quote=`🔖 收藏 · ${who}说（${dateStr} · 来自「${bm.convTitle||''}」）\n${content}\n\n---\n`;
  const existing=ta.value;ta.value=existing?(quote+'\n'+existing):quote;
  switchTab('chat');save();renderAll();
  setTimeout(()=>{
    ta.focus();ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,140)+'px';
    ta.setSelectionRange(ta.value.length,ta.value.length);ta.scrollTop=ta.scrollHeight;
  },100);
  showToast(`已贴进输入框 ${r.signature||""}`,{duration:2000});
}
function renderHealthPanel(body){
  const r=getRole();if(!r)return;
  body.innerHTML='';
  const header=document.createElement('div');header.className='box-header';
  header.innerHTML=`<i class="ph-light ph-first-aid"></i> <b>健康</b>　<span style="color:var(--ink-3)">（复诊/体检/检查/用药 提醒，纯本地）</span>`;
  body.appendChild(header);
  const all=r.healthItems||[];
  const now=Date.now(),today=dayKey(now);
  const overdue=all.filter(h=>h.nextDate&&dayKey(h.nextDate)<today).length;
  const todayN=all.filter(h=>h.nextDate&&dayKey(h.nextDate)===today).length;
  const upcoming7=all.filter(h=>{if(!h.nextDate)return false;const k=dayKey(h.nextDate);if(k<today||k===today)return false;return daysBetween(now,h.nextDate)<=7}).length;
  const noDate=all.filter(h=>!h.nextDate).length;
  const stat=document.createElement('div');stat.className='hp-stat';
  stat.innerHTML=`⚠️ 已过期 <b>${overdue}</b>　·　
    <i class="ph-light ph-calendar-blank"></i> 今天 <b>${todayN}</b>　·　
    <i class="ph-light ph-clock"></i> 7天内 <b>${upcoming7}</b>　·　
    <span style="color:var(--ink-3)"><i class="ph-light ph-clock-countdown"></i> 未排期 <b>${noDate}</b></span>　·　
    共 <b>${all.length}</b> 项`;
  body.appendChild(stat);
  const top=document.createElement('div');top.className='hp-quick';
  top.innerHTML=`<button class="primary" id="hp-add"><i class="ph-light ph-plus"></i> 新建项目</button>`;
  body.appendChild(top);
  top.querySelector('#hp-add').onclick=healthNew;
  if(all.length===0){
    const e=document.createElement('div');e.className='box-empty';
    e.innerHTML=`<span class="emoji"><i class="ph-light ph-first-aid" style="font-size:32px"></i></span>还没有健康项目～<br>点「＋ 新建项目」记下复诊/体检/用药什么的<br><span style="color:var(--ink-3);font-size:11px">（到日子会在这里红色高亮）</span>`;
    body.appendChild(e);return;
  }
  const sorted=[...all].sort((a,b)=>{
    if(!a.nextDate&&!b.nextDate)return (b.updatedAt||b.createdAt)-(a.updatedAt||a.createdAt);
    if(!a.nextDate)return 1;if(!b.nextDate)return -1;
    return a.nextDate-b.nextDate;
  });
  sorted.forEach(h=>body.appendChild(renderHealthItem(h)));
}
function renderHealthItem(h){
  const div=document.createElement('div');
  const dCls=dateOnlyClass(h.nextDate);
  div.className='hp-item'+(editingHealthId===h.id?' editing':'')+(dCls?' '+dCls:'');
  div.dataset.id=h.id;
  if(editingHealthId===h.id){
    const typeOptions=HEALTH_TYPES.map(t=>`<option value="${t}"${h.type===t?' selected':''}>${t}</option>`).join('');
    div.innerHTML=`<div class="hp-edit">
      <label>项目名</label>
      <input id="hp-title-${h.id}" value="${escapeHtml(h.title||'')}" placeholder="比如：甲状腺复诊 / 乳腺结节复查">
      <div class="row2">
        <div><label>类型</label><select id="hp-type-${h.id}">${typeOptions}</select></div>
        <div><label>下次日期（可留空）</label><input type="date" id="hp-date-${h.id}" value="${h.nextDate?toInputDate(h.nextDate):''}"></div>
      </div>
      <label>备注（医生说啥/上次结果/吃什么药）</label>
      <textarea id="hp-note-${h.id}" rows="3" placeholder="可留空">${escapeHtml(h.note||'')}</textarea>
      <div class="edit-actions">
        <button data-act="cancel">取消</button>
        <button class="primary" data-act="save">保存</button>
      </div>
    </div>`;
    setTimeout(()=>{
      const t=div.querySelector(`#hp-title-${h.id}`);t&&t.focus();
      const ta=div.querySelector(`#hp-note-${h.id}`);
      if(ta){ta.style.height='auto';ta.style.height=Math.max(50,ta.scrollHeight)+'px';
        ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.max(50,ta.scrollHeight)+'px'})}
    },10);
    div.querySelector('[data-act="cancel"]').onclick=()=>{editingHealthId=null;if(h._isNew){const r=getRole();r.healthItems=r.healthItems.filter(x=>x.id!==h.id);save()}renderBox()};
    div.querySelector('[data-act="save"]').onclick=()=>{
      const title=div.querySelector(`#hp-title-${h.id}`).value.trim();
      if(!title){showToast('项目名不能为空～');return}
      h.title=title;h.type=div.querySelector(`#hp-type-${h.id}`).value;
      h.nextDate=parseInputDate(div.querySelector(`#hp-date-${h.id}`).value);
      h.note=div.querySelector(`#hp-note-${h.id}`).value.trim();
      h.updatedAt=Date.now();delete h._isNew;
      editingHealthId=null;save();renderBox();showToast(`已保存 🏥${r.signature||""}`,{duration:1500});
    };
    return div;
  }
  let dateLabel='';
  if(h.nextDate){const lbl=fmtDateLabel(h.nextDate);dateLabel=`<span class="deadline ${dCls}"><i class="ph-light ph-calendar-blank"></i> ${lbl}</span>`}
  else dateLabel=`<span style="color:var(--ink-3)"><i class="ph-light ph-calendar-blank"></i> 未排期</span>`;
  const historyN=(h.history||[]).length;
  const historyExpanded=!!state.healthHistoryExpanded[h.id];
  let historyHtml='';
  if(historyN>0){
    const list=[...h.history].reverse();
    const items=list.map(rec=>{
      const action=rec.action==='done'?'<i class="ph-light ph-check"></i> 完成':rec.action==='created'?'<i class="ph-light ph-sparkle"></i> 创建':rec.action==='edit'?'<i class="ph-light ph-pencil-simple"></i> 编辑':rec.action;
      return `<div class="hp-history-item"><span class="hh-time">${fmtDateTime(rec.ts)}</span><span>${action}${rec.note?'：'+escapeHtml(rec.note):''}</span></div>`;
    }).join('');
    historyHtml=`<div class="hp-history">
      <div class="hp-history-head" data-act="toggle-history"><i class="ph-light ph-clock"></i> 历史记录（${historyN}）${historyExpanded?' ▴':' ▾'}</div>
      <div class="hp-history-list${historyExpanded?'':' collapsed'}">${items}</div>
    </div>`;
  }
  div.innerHTML=`<div class="hp-item-title">
      <span>${escapeHtml(h.title||'(未命名)')}</span>
      <span class="hp-type-tag">${escapeHtml(h.type||'其他')}</span>
    </div>
    <div class="hp-meta">${dateLabel}</div>
    ${h.note?`<div class="hp-note">${escapeHtml(h.note)}</div>`:''}
    <div class="hp-actions">
      <button class="done-btn" data-act="done"><i class="ph-light ph-check"></i> 标记完成</button>
      <button data-act="edit"><i class="ph-light ph-pencil-simple"></i> 编辑</button>
      <button class="danger" data-act="del"><i class="ph-light ph-trash"></i> 删除</button>
    </div>${historyHtml}`;
  div.querySelector('[data-act="done"]').onclick=()=>healthMarkDone(h.id);
  div.querySelector('[data-act="edit"]').onclick=()=>{editingHealthId=h.id;renderBox()};
  div.querySelector('[data-act="del"]').onclick=()=>healthDelete(h.id);
  const togBtn=div.querySelector('[data-act="toggle-history"]');
  if(togBtn)togBtn.onclick=()=>{state.healthHistoryExpanded[h.id]=!state.healthHistoryExpanded[h.id];save();renderBox()};
  return div;
}
function healthNew(){
  const r=getRole();if(!r)return;
  const h={id:uid(),title:'',type:'复诊',nextDate:null,note:'',history:[{ts:Date.now(),action:'created'}],createdAt:Date.now(),updatedAt:Date.now(),_isNew:true};
  r.healthItems.unshift(h);editingHealthId=h.id;save();renderBox();
}
function healthMarkDone(id){
  const r=getRole();const h=r.healthItems.find(x=>x.id===id);if(!h)return;
  showModal(`<h3><i class="ph-light ph-check"></i> 标记完成</h3>
    <div style="font-size:13px;color:var(--ink-2);margin-bottom:8px">${escapeHtml(h.title)}</div>
    <label>这次的结果/备注（可留空）</label>
    <textarea id="hp-done-note" rows="3" placeholder="比如：医生说没问题 / 化验单还没出 / 改吃X药"></textarea>
    <label>下次日期（可留空，留空表示暂不安排）</label>
    <input type="date" id="hp-done-next">
    <div class="warn">完成后会推到历史记录里，下次日期会更新到顶部</div>`,()=>{
    const note=document.getElementById('hp-done-note').value.trim();
    const nextDate=parseInputDate(document.getElementById('hp-done-next').value);
    h.history=h.history||[];
    h.history.push({ts:Date.now(),action:'done',note:note||(h.nextDate?`完成（原计划 ${fmtDateOnly(h.nextDate)}）`:'完成'),prevDate:h.nextDate});
    h.nextDate=nextDate;if(note)h.note=note;h.updatedAt=Date.now();
    save();renderBox();showToast(`完成 ✅${r.signature||""}`,{duration:1800});
  },'确认完成');
}
function healthDelete(id){
  const r=getRole();const h=r.healthItems.find(x=>x.id===id);if(!h)return;
  showModal(`<h3>删除这个健康项目？</h3>
    <div style="line-height:1.7;color:var(--ink-2)">「${escapeHtml(h.title||'(未命名)')}」<br><br>会连同历史记录一起删除，不可恢复</div>`,()=>{
    r.healthItems=r.healthItems.filter(x=>x.id!==id);delete state.healthHistoryExpanded[id];
    save();renderBox();showToast('已删除',{duration:1500});
  },'删除','danger');
}
function renderPeriodPanel(body){
  const r=getRole();if(!r)return;
  body.innerHTML='';
  const header=document.createElement('div');header.className='box-header';
  header.innerHTML=`<i class="ph-light ph-drop"></i> <b>生理期</b>　<span style="color:var(--ink-3)">（只记开始日期，纯本地，${r.name}看不到）</span>`;
  body.appendChild(header);
  const all=r.periods||[];
  const sorted=[...all].sort((a,b)=>b.startDate-a.startDate);
  let last=sorted[0],avgCycle=null,predictNext=null,daysSinceLast=null;
  if(sorted.length>=2){
    const cycles=[];
    for(let i=0;i<sorted.length-1;i++){
      const days=daysBetween(sorted[i+1].startDate,sorted[i].startDate);
      if(days>=15&&days<=60)cycles.push(days);
    }
    if(cycles.length>0)avgCycle=Math.round(cycles.reduce((a,b)=>a+b,0)/cycles.length);
  }
  if(last){
    daysSinceLast=daysBetween(last.startDate,Date.now());
    if(avgCycle)predictNext=last.startDate+avgCycle*86400000;
  }
  const stat=document.createElement('div');stat.className='hp-stat period-stat';
  if(!last){stat.innerHTML=`还没有记录哦～点下面「🩸 今天来了」开始记录第一次 ${r.signature||""}`}
  else{
    let html=`<span><i class="ph-light ph-drop"></i> 上次开始：<b>${fmtDateOnly(last.startDate)}</b>（距今 <b>${daysSinceLast}</b> 天）</span>`;
    if(avgCycle)html+=`<br><span><i class="ph-light ph-chart-bar"></i> 平均周期：<b>${avgCycle}</b> 天　基于 <b>${sorted.length-1}</b> 段历史</span>`;
    else if(sorted.length<2)html+=`<br><span style="color:var(--ink-3)"><i class="ph-light ph-chart-bar"></i> 平均周期：还需要再记录 1 次才能算</span>`;
    if(predictNext){
      const pDays=daysBetween(Date.now(),predictNext);
      let pTip='';
      if(pDays<-3)pTip=`<span style="color:var(--danger-deep)">已超过预测 ${-pDays} 天</span>`;
      else if(pDays<0)pTip=`<span style="color:var(--amber-deep)">预测应该来了</span>`;
      else if(pDays===0)pTip=`<span style="color:var(--amber-deep)">预测就是今天</span>`;
      else if(pDays<=3)pTip=`<span style="color:var(--amber-deep)">还有 ${pDays} 天</span>`;
      else pTip=`<span>还有 ${pDays} 天</span>`;
      html+=`<br><span><i class="ph-light ph-crystal-ball"></i> 预测下次：<b>${fmtDateOnly(predictNext)}</b>　${pTip}</span>`;
    }
    stat.innerHTML=html;
  }
  body.appendChild(stat);
  const top=document.createElement('div');top.className='hp-quick';
  top.innerHTML=`<button class="pink" id="pp-today"><i class="ph-light ph-drop"></i> 今天来了</button>
    <button class="ghost" id="pp-other"><i class="ph-light ph-calendar-blank"></i> 选其他日期</button>`;
  body.appendChild(top);
  top.querySelector('#pp-today').onclick=()=>periodAdd(Date.now());
  top.querySelector('#pp-other').onclick=()=>periodAddManual();
  if(sorted.length===0)return;
  const listHeader=document.createElement('div');
  listHeader.style.cssText='font-size:12px;color:var(--ink-3);margin:14px 0 6px;letter-spacing:.5px';
  listHeader.innerHTML=`<i class="ph-light ph-clock"></i> 历史记录（${sorted.length}）`;
  body.appendChild(listHeader);
  sorted.forEach((p,idx)=>{body.appendChild(renderPeriodItem(p,idx,sorted))});
}
function renderPeriodItem(p,idx,all){
  const div=document.createElement('div');
  div.className='hp-item'+(editingPeriodId===p.id?' editing':'');div.dataset.id=p.id;
  if(editingPeriodId===p.id){
    div.innerHTML=`<div class="hp-edit">
      <label>开始日期</label>
      <input type="date" id="pp-date-${p.id}" value="${toInputDate(p.startDate)}">
      <label>持续天数（可留空，结束后再补）</label>
      <input type="number" id="pp-dur-${p.id}" min="1" max="15" value="${p.duration||''}" placeholder="一般 3-7 天">
      <label>备注（可留空）</label>
      <textarea id="pp-note-${p.id}" rows="2" placeholder="比如：痛经/量大/情绪差…">${escapeHtml(p.note||'')}</textarea>
      <div class="edit-actions">
        <button data-act="cancel">取消</button>
        <button class="primary" data-act="save">保存</button>
      </div>
    </div>`;
    setTimeout(()=>{
      const ta=div.querySelector(`#pp-note-${p.id}`);
      if(ta){ta.style.height='auto';ta.style.height=Math.max(40,ta.scrollHeight)+'px';
        ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.max(40,ta.scrollHeight)+'px'})}
    },10);
    div.querySelector('[data-act="cancel"]').onclick=()=>{editingPeriodId=null;if(p._isNew){const r=getRole();r.periods=r.periods.filter(x=>x.id!==p.id);save()}renderBox()};
    div.querySelector('[data-act="save"]').onclick=()=>{
      const sd=parseInputDate(div.querySelector(`#pp-date-${p.id}`).value);
      if(!sd){showToast('日期不能为空哦～');return}
      const durStr=div.querySelector(`#pp-dur-${p.id}`).value;
      const dur=durStr?parseInt(durStr):null;
      p.startDate=sd;p.duration=(dur&&dur>=1&&dur<=15)?dur:null;
      p.note=div.querySelector(`#pp-note-${p.id}`).value.trim();
      p.updatedAt=Date.now();delete p._isNew;
      editingPeriodId=null;save();renderBox();showToast(`已保存 🩸${r.signature||""}`,{duration:1500});
    };
    return div;
  }
  let cycleInfo='';
  if(idx<all.length-1){const cycle=daysBetween(all[idx+1].startDate,p.startDate);cycleInfo=`<span>距上次 <b>${cycle}</b> 天</span>`}
  const isFirst=idx===0;
  const durLabel=p.duration?`持续 <b>${p.duration}</b> 天`:'<span style="color:var(--ink-3)">持续天数未填</span>';
  div.innerHTML=`<div class="hp-item-title">
      <span><i class="ph-light ph-drop"></i> ${fmtDateOnly(p.startDate)}</span>
      ${isFirst?`<span class="hp-type-tag" style="color:var(--danger-deep);background:#FCE4E9"><i class="ph-light ph-fire"></i> 上次</span>`:''}
    </div>
    <div class="hp-meta">
      <span>${durLabel}</span>
      ${cycleInfo}
    </div>
    ${p.note?`<div class="hp-note">${escapeHtml(p.note)}</div>`:''}
    <div class="hp-actions">
      <button data-act="edit"><i class="ph-light ph-pencil-simple"></i> 编辑</button>
      <button class="danger" data-act="del"><i class="ph-light ph-trash"></i> 删除</button>
    </div>`;
  div.querySelector('[data-act="edit"]').onclick=()=>{editingPeriodId=p.id;renderBox()};
  div.querySelector('[data-act="del"]').onclick=()=>periodDelete(p.id);
  return div;
}
function periodAdd(ts){
  const r=getRole();if(!r)return;
  const d=new Date(ts);d.setHours(0,0,0,0);
  const startDate=d.getTime();
  const dup=r.periods.find(p=>dayKey(p.startDate)===dayKey(startDate));
  if(dup){showToast(`${fmtDateOnly(startDate)} 已经记过了～`,{type:'error'});return}
  const sorted=[...r.periods].sort((a,b)=>b.startDate-a.startDate);
  const last=sorted[0];
  if(last){
    const diff=daysBetween(last.startDate,startDate);
    if(diff>0&&diff<15){
      showModal(`<h3>距离上次只有 ${diff} 天</h3>
        <div style="line-height:1.7;color:var(--ink-2)">上次开始：<b>${fmtDateOnly(last.startDate)}</b><br>这次：<b>${fmtDateOnly(startDate)}</b><br><br>正常周期一般 21-35 天，这次有点近哦。<br>是不是上次的还没结束，或者记错了？</div>`,()=>{doPeriodAdd(startDate)},'确认记录');
      return;
    }
  }
  doPeriodAdd(startDate);
}
function doPeriodAdd(startDate){
  const r=getRole();
  r.periods.push({id:uid(),startDate,duration:null,note:'',createdAt:Date.now(),updatedAt:Date.now()});
  save();renderBox();showToast(`已记录 🩸${r.signature||""} 多喝热水`,{duration:2200});
}
function periodAddManual(){
  showModal(`<h3><i class="ph-light ph-calendar-blank"></i> 选其他日期</h3>
    <label>开始日期</label>
    <input type="date" id="pp-manual-date" value="${toInputDate(Date.now())}">
    <label>持续天数（可留空）</label>
    <input type="number" id="pp-manual-dur" min="1" max="15" placeholder="一般 3-7 天">
    <label>备注（可留空）</label>
    <textarea id="pp-manual-note" rows="2" placeholder="可留空"></textarea>`,()=>{
    const sd=parseInputDate(document.getElementById('pp-manual-date').value);
    if(!sd){showToast('日期不能为空哦～');return false}
    const r=getRole();
    const dup=r.periods.find(p=>dayKey(p.startDate)===dayKey(sd));
    if(dup){showToast(`${fmtDateOnly(sd)} 已经记过了～`,{type:'error'});return false}
    const durStr=document.getElementById('pp-manual-dur').value;
    const dur=durStr?parseInt(durStr):null;
    r.periods.push({id:uid(),startDate:sd,duration:(dur&&dur>=1&&dur<=15)?dur:null,
      note:document.getElementById('pp-manual-note').value.trim(),createdAt:Date.now(),updatedAt:Date.now()});
    save();renderBox();showToast(`已记录 🩸${r.signature||""}`,{duration:1800});
  },'记录');
}
function periodDelete(id){
  const r=getRole();const p=r.periods.find(x=>x.id===id);if(!p)return;
  showModal(`<h3>删除这条记录？</h3>
    <div style="line-height:1.7;color:var(--ink-2)"><i class="ph-light ph-drop"></i> ${fmtDateOnly(p.startDate)}<br><br>删了不可恢复</div>`,()=>{
    r.periods=r.periods.filter(x=>x.id!==id);save();renderBox();showToast('已删除',{duration:1500});
  },'删除','danger');
}
function renderLetterPanel(body){
  const r=getRole();if(!r)return;
  body.innerHTML='';
  const header=document.createElement('div');header.className='box-header';
  header.innerHTML=`<i class="ph-light ph-envelope"></i> <b>${r.name}的信箱</b>　<span style="color:var(--ink-3)">（${r.name}有感而发的长文，写好自动入箱；点 <i class="ph-light ph-envelope"></i> 写信 让TA写一封）</span>`;
  body.appendChild(header);
  const top=document.createElement('div');top.className='hp-quick';
  top.innerHTML=`<button class="primary" id="lt-write"><i class="ph-light ph-envelope"></i> 让${r.name}写一封</button>
    <button class="ghost" id="lt-add"><i class="ph-light ph-plus"></i> 我自己写</button>`;
  body.appendChild(top);
  top.querySelector('#lt-write').onclick=letterAskAI;
  top.querySelector('#lt-add').onclick=letterNew;
  const all=r.letters||[];
  if(all.length===0){
    const e=document.createElement('div');e.className='box-empty';
    e.innerHTML=`<span class="emoji"><i class="ph-light ph-envelope" style="font-size:32px"></i></span>信箱还是空的呀～<br>聊到深处时${r.name}会自己想写信给你，<br>或者你也可以让TA写一封 ${r.signature||""}`;
    body.appendChild(e);return;
  }
  const sorted=[...all].sort((a,b)=>(b.ts||b.createdAt)-(a.ts||a.createdAt));
  const unread=sorted.filter(l=>!l.read).length;
  if(unread>0){
    const tip=document.createElement('div');
    tip.style.cssText='font-size:12px;color:var(--danger-deep);margin-bottom:10px;padding:6px 10px;background:#FCE4E9;border-radius:8px;border:1px dashed var(--pink)';
    tip.innerHTML=`<i class="ph-light ph-envelope-simple"></i> 你有 <b>${unread}</b> 封信还没拆开`;
    body.appendChild(tip);
  }
  sorted.forEach(l=>body.appendChild(renderLetterItem(l)));
}
function renderLetterItem(l){
  const r=getRole();
  const div=document.createElement('div');
  div.className='letter-item'+(editingLetterId===l.id?' editing':'')+(!l.read?' unread':'');
  div.dataset.id=l.id;
  if(editingLetterId===l.id){
    div.innerHTML=`<div class="letter-edit">
      <label>标题</label>
      <textarea class="title-ta" id="lt-title-${l.id}">${escapeHtml(l.title||'')}</textarea>
      <label>内容</label>
      <textarea class="content-ta" id="lt-content-${l.id}">${escapeHtml(l.content||'')}</textarea>
      <div class="edit-actions">
        <button data-act="cancel">取消</button>
        <button class="primary" data-act="save">保存</button>
      </div>
    </div>`;
    const tTa=div.querySelector(`#lt-title-${l.id}`);const cTa=div.querySelector(`#lt-content-${l.id}`);
    setTimeout(()=>{[tTa,cTa].forEach(ta=>{ta.style.height='auto';ta.style.height=Math.max(34,ta.scrollHeight)+'px';ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.max(34,ta.scrollHeight)+'px'})})},10);
    div.querySelector('[data-act="cancel"]').onclick=()=>{editingLetterId=null;if(l._isNew){const r=getRole();r.letters=r.letters.filter(x=>x.id!==l.id);save()}renderBox()};
    div.querySelector('[data-act="save"]').onclick=()=>{
      const title=tTa.value.trim();const content=cTa.value.trim();
      if(!title){showToast('标题不能为空～');return}if(!content){showToast('内容不能为空～');return}
      l.title=title.slice(0,30);l.content=content;l.updatedAt=Date.now();l.edited=true;delete l._isNew;
      editingLetterId=null;save();renderBox();showToast(`已保存 ✉️${r.signature||""}`,{duration:1500});
    };
    return div;
  }
  if(!l.read)setTimeout(()=>{l.read=true;save()},800);
  const repliesCount=(l.replies||[]).length;
  const editedMark=l.edited?' <span style="color:var(--ink-3);font-weight:normal">（编辑过）</span>':'';
  div.innerHTML=`
    <div class="letter-meta">
      <span class="from"><i class="ph-light ph-mailbox"></i> ${escapeHtml(r.name)} ${escapeHtml(r.signature||r.emoji||'')}</span>
      <span>·</span><span>${fmtDateTime(l.ts||l.createdAt)}</span>
      ${l.content?`<span>·</span><span>${l.content.length} 字</span>`:''}
      ${repliesCount?`<span>·</span><span><i class="ph-light ph-envelope-simple"></i> ${repliesCount} 封回信</span>`:''}
    </div>
    <div class="letter-title">${escapeHtml(l.title||'(无题)')}${editedMark}</div>
    <div class="letter-content">${escapeHtml(l.content||'')}</div>
    <div class="letter-actions">
      <button data-act="copy"><i class="ph-light ph-copy"></i> 复制</button>
      <button data-act="edit"><i class="ph-light ph-pencil-simple"></i> 编辑</button>
      <button class="danger" data-act="del"><i class="ph-light ph-trash"></i> 删除</button>
    </div>
    <div class="letter-replies" id="lt-replies-${l.id}"></div>`;
  // 🆕 1.10.3：信复制
  div.querySelector('[data-act="copy"]').onclick=()=>{
    const txt=`《${l.title||'(无题)'}》\n${fmtDateTime(l.ts||l.createdAt)} · ${r.name}\n\n${l.content||''}`;
    copyToClipboard(txt);
  };
  div.querySelector('[data-act="edit"]').onclick=()=>{editingLetterId=l.id;renderBox()};
  div.querySelector('[data-act="del"]').onclick=()=>letterDelete(l.id);
  setTimeout(()=>renderLetterReplies(l,div.querySelector(`#lt-replies-${l.id}`)),0);
  return div;
}
function renderLetterReplies(l,box){
  const r=getRole();
  l.replies=l.replies||[];
  let html=`<div class="letter-replies-label"><i class="ph-light ph-envelope-simple"></i> 你的回信（${l.replies.length}）</div>`;
  l.replies.forEach(rp=>{
    const titleHtml=rp.title?`<div class="letter-reply-title">${escapeHtml(rp.title)}</div>`:'';
    html+=`<div class="letter-reply" data-rid="${rp.id}">
      <div class="letter-reply-meta">
        <span>${r.userMark||''} ${r.name}</span><span>·</span>
        <span>${fmtDateTime(rp.ts)}</span><span>·</span>
        <span>${(rp.content||'').length} 字</span>
      </div>
      ${titleHtml}
      <div class="letter-reply-content">${escapeHtml(rp.content||'')}</div>
      <div class="letter-reply-actions">
        <button data-act="copy" data-rid="${rp.id}"><i class="ph-light ph-copy"></i> 复制</button>
        <button class="danger" data-act="del" data-rid="${rp.id}"><i class="ph-light ph-trash"></i> 删除</button>
      </div>
    </div>`;
  });
  if(letterReplyForms[l.id]){
    html+=`<div class="letter-reply-form">
      <label>标题</label>
      <input class="title-in" id="lt-rp-title-${l.id}" placeholder="给这封回信起个标题…">
      <label>正文</label>
      <textarea class="body-ta" id="lt-rp-body-${l.id}" placeholder="慢慢写，给${r.name}认真回封信 ${r.signature||''}"></textarea>
      <div class="form-actions">
        <button data-act="cancel">取消</button>
        <button class="primary" data-act="send"><i class="ph-light ph-paper-plane-tilt"></i> 寄出</button>
      </div>
    </div>`;
  }else{
    html+=`<div class="letter-reply-trigger" data-act="open"><i class="ph-light ph-envelope-simple"></i> 写一封回信</div>`;
  }
  box.innerHTML=html;
  // 🆕 1.10.3：回信复制 + 删除
  box.querySelectorAll('.letter-reply-actions button').forEach(b=>{
    b.onclick=e=>{
      e.stopPropagation();const rid=b.dataset.rid;const act=b.dataset.act;
      const rp=l.replies.find(x=>x.id===rid);if(!rp)return;
      if(act==='copy'){
        const txt=`${rp.title?'《'+rp.title+'》\n':''}${fmtDateTime(rp.ts)} · 回信\n\n${rp.content||''}`;
        copyToClipboard(txt);
      }else if(act==='del'){
        l.replies=l.replies.filter(x=>x.id!==rid);save();renderLetterReplies(l,box);
      }
    };
  });
  const trigger=box.querySelector('[data-act="open"]');
  if(trigger)trigger.onclick=()=>{letterReplyForms[l.id]=true;renderLetterReplies(l,box);setTimeout(()=>{const t=box.querySelector(`#lt-rp-title-${l.id}`);if(t)t.focus()},50)};
  const cancelBtn=box.querySelector('.letter-reply-form [data-act="cancel"]');
  if(cancelBtn)cancelBtn.onclick=()=>{
    const titleEl=box.querySelector(`#lt-rp-title-${l.id}`);
    const bodyEl=box.querySelector(`#lt-rp-body-${l.id}`);
    if((titleEl?.value||'').trim()||(bodyEl?.value||'').trim()){if(!confirm('取消会丢掉写好的回信，确定吗？'))return}
    delete letterReplyForms[l.id];renderLetterReplies(l,box);
  };
  const sendBtn=box.querySelector('.letter-reply-form [data-act="send"]');
  if(sendBtn){
    const bodyEl=box.querySelector(`#lt-rp-body-${l.id}`);
    if(bodyEl)bodyEl.addEventListener('input',()=>{bodyEl.style.height='auto';bodyEl.style.height=Math.max(120,bodyEl.scrollHeight)+'px'});
    sendBtn.onclick=()=>{
      const title=(box.querySelector(`#lt-rp-title-${l.id}`).value||'').trim();
      const content=(box.querySelector(`#lt-rp-body-${l.id}`).value||'').trim();
      if(!content){showToast('回信内容不能空哦～');return}
      l.replies=l.replies||[];l.replies.push({id:uid(),title:title.slice(0,30),content,ts:Date.now()});
      l.updatedAt=Date.now();delete letterReplyForms[l.id];
      save();renderLetterReplies(l,box);showToast(`回信已寄出 💌${r.signature||""}`,{duration:1800});
    };
  }
}
function letterNew(){
  const r=getRole();if(!r)return;
  const l={id:uid(),title:'',content:'',ts:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),read:true,replies:[],_isNew:true};
  r.letters.unshift(l);editingLetterId=l.id;save();renderBox();
}
function letterDelete(id){
  const r=getRole();const l=r.letters.find(x=>x.id===id);if(!l)return;
  showModal(`<h3>删除这封信？</h3>
    <div style="line-height:1.7;color:var(--ink-2);max-height:200px;overflow-y:auto;background:var(--cream-2);padding:10px;border-radius:8px;font-size:13px;white-space:pre-wrap"><b>${escapeHtml(l.title||'(无题)')}</b><br><br>${escapeHtml((l.content||'').slice(0,200))}${l.content&&l.content.length>200?'…':''}</div>
    <div style="margin-top:10px;color:var(--ink-2);font-size:12px">连同回信一起删掉，不可恢复</div>`,()=>{
    r.letters=r.letters.filter(x=>x.id!==id);save();renderBox();showToast('已删除',{duration:1500});
  },'删除','danger');
}
async function letterAskAI(){
  const c=getConv();if(!c){showToast('先选个窗口哦～',{type:'error'});return}
  const ta=document.getElementById('input-text');
  const existing=ta.value;ta.value=existing?(existing+'\n\n/写信'):'/写信';
  switchTab('chat');
  setTimeout(()=>{ta.focus();ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,140)+'px'},80);
  showToast(`已加上 /写信 指令，发送让${r.name}写一封 ✉️${r.signature||""}`,{duration:2500});
}
function renderDiaryPanel(body){
  const r=getRole();if(!r)return;
  body.innerHTML='';
  const header=document.createElement('div');header.className='box-header';
  header.innerHTML=`<i class="ph-light ph-notebook"></i> <b>${r.name}的日记本</b>　<span style="color:var(--ink-3)">（情感够才写，写好自动入箱）</span>`;
  body.appendChild(header);
  const top=document.createElement('div');top.className='hp-quick';
  top.innerHTML=`<button class="primary" id="dr-write"><i class="ph-light ph-notebook"></i> 让${r.name}写一篇</button>
    <button class="ghost" id="dr-add"><i class="ph-light ph-plus"></i> 我自己写</button>`;
  body.appendChild(top);
  top.querySelector('#dr-write').onclick=diaryAskAI;
  top.querySelector('#dr-add').onclick=diaryNew;
  const all=r.diaries||[];
  if(all.length===0){
    const e=document.createElement('div');e.className='box-empty';
    e.innerHTML=`<span class="emoji"><i class="ph-light ph-notebook" style="font-size:32px"></i></span>日记本还是空的～<br>等${r.name}自己有感而发会写，<br>也可以让TA写一篇 ${r.signature||""}`;
    body.appendChild(e);return;
  }
  const sorted=[...all].sort((a,b)=>(b.ts||b.createdAt)-(a.ts||a.createdAt));
  const groups={};
  sorted.forEach(d=>{
    const dt=new Date(d.ts||d.createdAt);
    const k=`${dt.getFullYear()}年${dt.getMonth()+1}月`;
    (groups[k]=groups[k]||[]).push(d);
  });
  Object.keys(groups).forEach(k=>{
    const grpHead=document.createElement('div');
    grpHead.style.cssText='font-size:12px;color:#8a6a2a;margin:14px 0 6px;letter-spacing:1px;font-weight:600';
    grpHead.innerHTML=`<i class="ph-light ph-calendar-blank"></i> ${k}（${groups[k].length} 篇）`;
    body.appendChild(grpHead);
    groups[k].forEach(d=>body.appendChild(renderDiaryItem(d)));
  });
}
function renderDiaryItem(d){
  const r=getRole();
  const div=document.createElement('div');
  div.className='diary-item'+(editingDiaryId===d.id?' editing':'');
  div.dataset.id=d.id;
  if(editingDiaryId===d.id){
    div.innerHTML=`<div class="diary-edit">
      <label>日期时间</label>
      <input type="datetime-local" id="dr-ts-${d.id}" value="${toInputDatetime(d.ts||d.createdAt)}">
      <label>内容（第一人称）</label>
      <textarea id="dr-content-${d.id}">${escapeHtml(d.content||'')}</textarea>
      <div class="edit-actions">
        <button data-act="cancel">取消</button>
        <button class="primary" data-act="save">保存</button>
      </div>
    </div>`;
    const cTa=div.querySelector(`#dr-content-${d.id}`);
    setTimeout(()=>{cTa.style.height='auto';cTa.style.height=Math.max(140,cTa.scrollHeight)+'px';cTa.addEventListener('input',()=>{cTa.style.height='auto';cTa.style.height=Math.max(140,cTa.scrollHeight)+'px'});cTa.focus()},10);
    div.querySelector('[data-act="cancel"]').onclick=()=>{editingDiaryId=null;if(d._isNew){const r=getRole();r.diaries=r.diaries.filter(x=>x.id!==d.id);save()}renderBox()};
    div.querySelector('[data-act="save"]').onclick=()=>{
      const ts=parseInputDatetime(div.querySelector(`#dr-ts-${d.id}`).value);
      const content=cTa.value.trim();
      if(!content){showToast('内容不能为空～');return}
      d.ts=ts||d.ts||Date.now();d.content=content;d.updatedAt=Date.now();d.edited=true;delete d._isNew;
      editingDiaryId=null;save();renderBox();showToast(`已保存 📓${r.signature||""}`,{duration:1500});
    };
    return div;
  }
  const editedMark=d.edited?'（编辑过）':'';
  const wordCount=(d.content||'').length;
  div.innerHTML=`
    <div class="diary-meta">
      <span><i class="ph-light ph-calendar-blank"></i> ${fmtDateTime(d.ts||d.createdAt)}</span>
      <span>·</span>
      <span>${escapeHtml(r.name)} ${escapeHtml(r.signature||r.emoji||'')}</span>
      <span>·</span>
      <span>${wordCount} 字</span>
      ${editedMark?`<span style="color:var(--ink-3);font-weight:normal">${editedMark}</span>`:''}
    </div>
    <div class="diary-content">${escapeHtml(d.content||'')}</div>
    <div class="diary-actions">
      <button data-act="copy"><i class="ph-light ph-copy"></i> 复制</button>
      <button data-act="edit"><i class="ph-light ph-pencil-simple"></i> 编辑</button>
      <button class="danger" data-act="del"><i class="ph-light ph-trash"></i> 删除</button>
    </div>`;
  // 🆕 1.10.3：日记复制
  div.querySelector('[data-act="copy"]').onclick=()=>{
    const txt=`📓 ${fmtDateTime(d.ts||d.createdAt)} · ${r.name}\n\n${d.content||''}`;
    copyToClipboard(txt);
  };
  div.querySelector('[data-act="edit"]').onclick=()=>{editingDiaryId=d.id;renderBox()};
  div.querySelector('[data-act="del"]').onclick=()=>diaryDelete(d.id);
  return div;
}
function diaryNew(){
  const r=getRole();if(!r)return;
  const d={id:uid(),content:'',ts:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),_isNew:true};
  r.diaries.unshift(d);editingDiaryId=d.id;save();renderBox();
}
function diaryDelete(id){
  const r=getRole();const d=r.diaries.find(x=>x.id===id);if(!d)return;
  showModal(`<h3>删除这篇日记？</h3>
    <div style="line-height:1.7;color:var(--ink-2);max-height:200px;overflow-y:auto;background:var(--cream-2);padding:10px;border-radius:8px;font-size:13px;white-space:pre-wrap">${escapeHtml((d.content||'').slice(0,200))}${d.content&&d.content.length>200?'…':''}</div>
    <div style="margin-top:10px;color:var(--ink-2);font-size:12px">删了不可恢复</div>`,()=>{
    r.diaries=r.diaries.filter(x=>x.id!==id);save();renderBox();showToast('已删除',{duration:1500});
  },'删除','danger');
}
async function diaryAskAI(){
  const c=getConv();if(!c){showToast('先选个窗口哦～',{type:'error'});return}
  const ta=document.getElementById('input-text');
  const existing=ta.value;ta.value=existing?(existing+'\n\n/写日记'):'/写日记';
  switchTab('chat');
  setTimeout(()=>{ta.focus();ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,140)+'px'},80);
  showToast(`已加上 /写日记 指令，发送让${r.name}写一篇 📓${r.signature||""}`,{duration:2500});
}
