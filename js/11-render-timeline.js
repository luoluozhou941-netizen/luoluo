// ─────────────────────────────────────────────
//  11-render-timeline.js · 时间轴渲染层
//  依赖：01-state.js（state、getRole、getConv、expandedNodes、
//                    editingDailyDate、openActionMsgId、activeStreams）
//        02-utils.js（escapeHtml、fmtTime、fmtDay、fmtDateTime、
//                    dayKey、copyToClipboard、cleanForCopy）
//        03-markdown.js（renderMarkdown、MEM_REGEX 等）
//        04-extractors.js（extractAll）
//        05-storage.js（save）
//        08-ai-client.js（callOpenAIStreamForComment）
//        10-render-chat.js（bindThinkingToggle、stopStream）
//        15-modal-toast.js（showModal、showToast）← 运行时依赖
// ─────────────────────────────────────────────

/* ── 日期格式化（时间轴专用，智能显示今天/昨天） ── */

function fmtDailyDate(dateStr){
  const today=dayKey(Date.now());
  const y=yesterdayStr();
  if(dateStr===today)return '今天 · '+dateStr;
  if(dateStr===y)return '昨天 · '+dateStr;
  return dateStr;
}
function yesterdayStr(){
  const d=new Date();d.setDate(d.getDate()-1);
  return dayKey(d.getTime());
}
function getDailyOfDate(role,dateStr){
  return role.dailies.find(d=>d.date===dateStr);
}
function renderTimeline(){
  const r=getRole();const wrap=document.getElementById('tl-wrap');wrap.innerHTML='';
  if(!r)return;
  const filter=document.createElement('div');filter.className='tl-filter';
  const filters=[['all','全部'],['fact','<i class="ph-light ph-brain"></i> 事实'],['moment','<i class="ph-light ph-cloud"></i> 瞬间'],['promise','<i class="ph-light ph-handshake"></i> 约定'],['starred','<i class="ph-light ph-star"></i> 星标'],['segment','<i class="ph-light ph-scroll"></i> 摘要']];
  filters.forEach(([k,lbl])=>{
    const b=document.createElement('button');b.innerHTML=lbl;
    if(state.tlFilter===k)b.classList.add('active');
    b.onclick=()=>{state.tlFilter=k;save();renderTimeline()};
    filter.appendChild(b);
  });
  wrap.appendChild(filter);
  if(state.tlFilter==='segment'){
    renderSegmentList(r,wrap);
    return;
  }
  if(state.tlFilter==='all'){
    const bar=document.createElement('div');bar.className='tl-daily-bar';
    bar.innerHTML=`<button id="tl-daily-gen"><i class="ph-light ph-calendar-blank"></i> 生成/补今日档案</button>`;
    bar.querySelector('#tl-daily-gen').onclick=openDailyGenModal;
    wrap.appendChild(bar);
  }
  const stat={fact:0,moment:0,promise:0,starred:0};
  r.entries.forEach(e=>{stat[e.type]=(stat[e.type]||0)+1;if(e.starred)stat.starred++});
  const header=document.createElement('div');header.className='tl-header';
  const dailyCount=r.dailies?r.dailies.length:0;
  header.innerHTML=`<i class="ph-light ph-tree"></i><b>${escapeHtml(r.name)} 的记忆树</b><br>
    <span style="font-size:12px;color:var(--ink-3)">
    <i class="ph-light ph-brain"></i>${stat.fact} · <i class="ph-light ph-cloud"></i>${stat.moment} · <i class="ph-light ph-handshake"></i>${stat.promise} · <i class="ph-light ph-star"></i>${stat.starred} · <i class="ph-light ph-calendar-blank"></i>${dailyCount}　·　共 ${r.entries.length} 条</span>`;
  wrap.appendChild(header);
  let list=[...r.entries];
  if(state.tlFilter==='starred')list=list.filter(e=>e.starred);
  else if(state.tlFilter!=='all')list=list.filter(e=>e.type===state.tlFilter);
  const hasDailies=state.tlFilter==='all'&&r.dailies&&r.dailies.length>0;
  if(list.length===0&&!hasDailies){
    const e=document.createElement('div');e.className='tl-empty';
    e.innerHTML= r.entries.length===0
      ? `这里还很空旷～<br>聊天里${r.name}会主动标记，或点气泡系到这里 ${r.signature||''}`
      : '这个分类下还没有条目～';
    wrap.appendChild(e);return;
  }
  const sorted=list.sort((a,b)=>b.ts-a.ts);
  const groups={};
  sorted.forEach(n=>{(groups[dayKey(n.ts)]=groups[dayKey(n.ts)]||[]).push(n)});
  if(state.tlFilter==='all')r.dailies.forEach(d=>{if(!groups[d.date])groups[d.date]=[]});
  const days=Object.keys(groups).sort().reverse();
  days.forEach(day=>{
    const g=document.createElement('div');g.className='tl-day';
    const lbl=document.createElement('div');lbl.className='tl-day-label';lbl.textContent=fmtDay(day);g.appendChild(lbl);
    if(state.tlFilter==='all'){
      const daily=getDailyOfDate(r,day);
      if(daily)g.appendChild(renderDailyCard(daily));
    }
    groups[day].forEach(n=>g.appendChild(renderTLNode(n)));
    wrap.appendChild(g);
  });
}
function renderSegmentList(r,wrap){
  const header=document.createElement('div');header.className='tl-header';
  const segs=r.segments||[];
  header.innerHTML=`<i class="ph-light ph-scroll"></i><b>${escapeHtml(r.name)} 的滚动摘要</b><br>
    <span style="font-size:12px;color:var(--ink-3)">按话题自动/手动归纳的摘要，共 ${segs.length} 条</span>`;
  wrap.appendChild(header);
  if(segs.length===0){
    const e=document.createElement('div');e.className='tl-empty';
    e.innerHTML=`这里还没有摘要～<br>聊完一个话题，或者切窗口时攒够了内容，会自动生成一条 ${r.signature||''}`;
    wrap.appendChild(e);return;
  }
  const sorted=[...segs].sort((a,b)=>{
    if(!!a.pinned!==!!b.pinned)return a.pinned?-1:1;
    return (b.date_end||'').localeCompare(a.date_end||'')||(b.created_at||0)-(a.created_at||0);
  });
  sorted.forEach(s=>wrap.appendChild(renderSegmentCard(s)));
}
function renderSegmentCard(seg){
  const r=getRole();
  const card=document.createElement('div');
  card.className='tl-segment';
  card.dataset.id=seg.id;
  const dateLabel=seg.date_start===seg.date_end?seg.date_start:`${seg.date_start} ~ ${seg.date_end}`;
  if(seg.status==='loading'||seg.status==='draft'){
    card.classList.add('loading');
    card.innerHTML=`<div class="tl-seg-head"><i class="ph-light ph-scroll"></i> ${dateLabel} · 整理中</div>
      <div>${escapeHtml(r.name)}正在读这段… <span style="color:var(--mint-deep)">▍</span></div>`;
    return card;
  }
  if(seg.status==='error'){
    card.classList.add('error');
    card.innerHTML=`<div class="tl-seg-head"><i class="ph-light ph-warning"></i> ${dateLabel} · 摘要生成失败</div>
      <div style="color:var(--danger-deep);font-size:12px;line-height:1.6;margin-bottom:8px;word-break:break-word">${escapeHtml(seg.errMsg||'未知错误')}</div>
      <div class="tl-seg-actions">
        <button class="primary" data-act="retry"><i class="ph-light ph-arrows-clockwise"></i> 重试</button>
        <button class="danger" data-act="del"><i class="ph-light ph-trash"></i> 删除</button>
      </div>`;
    card.querySelector('[data-act="retry"]').onclick=()=>{
      const msgs=getMessagesForSegment(seg);
      generateSegmentSummary(seg,msgs,{});
    };
    card.querySelector('[data-act="del"]').onclick=()=>deleteSegmentConfirm(seg.id);
    return card;
  }
  const isEditing=editingSegmentId===seg.id;
  if(isEditing){
    card.innerHTML=`<div class="tl-seg-head"><i class="ph-light ph-pencil-simple"></i> 编辑 · ${dateLabel}</div>
      <div class="tl-seg-edit">
        <label>摘要</label>
        <textarea class="sum-ta" id="sg-sum-${seg.id}">${escapeHtml(seg.summary||'')}</textarea>
        <label>标签（逗号分隔）</label>
        <input class="tags-in" id="sg-tags-${seg.id}" value="${escapeHtml((seg.tags||[]).join(', '))}" placeholder="逗号分隔，比如：Luma 开发, 情绪…">
        <div class="tl-seg-actions">
          <button data-act="cancel">取消</button>
          <button data-act="regen"><i class="ph-light ph-arrows-clockwise"></i> 重新生成</button>
          <button class="primary" data-act="save"><i class="ph-light ph-floppy-disk"></i> 保存</button>
        </div>
      </div>`;
    const sTa=card.querySelector(`#sg-sum-${seg.id}`);
    setTimeout(()=>{sTa.style.height='auto';sTa.style.height=sTa.scrollHeight+'px'},0);
    sTa.addEventListener('input',()=>{sTa.style.height='auto';sTa.style.height=sTa.scrollHeight+'px'});
    card.querySelector('[data-act="cancel"]').onclick=()=>{editingSegmentId=null;renderTimeline()};
    card.querySelector('[data-act="regen"]').onclick=()=>{
      showModal('<h3>重新生成这段摘要？</h3><div style="line-height:1.7;color:var(--ink-2)">会覆盖当前内容，从这段聊天记录重新读一遍</div>',()=>{
        editingSegmentId=null;
        const msgs=getMessagesForSegment(seg);
        generateSegmentSummary(seg,msgs,{});
      },'重新生成');
    };
    card.querySelector('[data-act="save"]').onclick=()=>{
      const summary=sTa.value.trim();
      const tagStr=card.querySelector(`#sg-tags-${seg.id}`).value;
      if(!summary){showToast('摘要不能为空～');return}
      seg.summary=summary;
      seg.tags=tagStr.split(/[,，、]/).map(s=>s.trim()).filter(Boolean).slice(0,4);
      seg.status='edited';seg.updatedAt=Date.now();
      editingSegmentId=null;save();renderTimeline();showToast(`已保存 ${r.signature||''}`,{duration:1500});
    };
    return card;
  }
  const tagsHtml=(seg.tags||[]).map(t=>`<span class="td-tag">${escapeHtml(t)}</span>`).join('');
  const statusMark=seg.status==='pending'?' <span style="color:var(--amber-deep);font-weight:normal">（待确认）</span>'
    :seg.status==='edited'?' <span style="color:var(--ink-3);font-weight:normal">（编辑过）</span>':'';
  const pinMark=seg.pinned?'<i class="ph-light ph-push-pin" style="margin-right:2px"></i>':'';
  if(seg.status==='pending')card.classList.add('pending');
  card.innerHTML=`<div class="tl-seg-head">${pinMark}<i class="ph-light ph-scroll"></i> ${dateLabel}${statusMark}</div>
    <div class="tl-seg-summary">${escapeHtml(seg.summary||'')}</div>
    ${tagsHtml?`<div class="tl-seg-tags">${tagsHtml}</div>`:''}
    <div class="tl-seg-actions">
      ${seg.status==='pending'?'<button class="primary" data-act="confirm"><i class="ph-light ph-check"></i> 确认</button>':''}
      <button data-act="copy"><i class="ph-light ph-copy"></i> 复制</button>
      <button data-act="edit"><i class="ph-light ph-pencil-simple"></i> 编辑</button>
      <button data-act="pin"><i class="ph-light ph-push-pin"></i> ${seg.pinned?'取消置顶':'置顶'}</button>
      <button class="danger" data-act="del"><i class="ph-light ph-trash"></i> 删除</button>
    </div>`;
  if(seg.status==='pending')card.querySelector('[data-act="confirm"]').onclick=()=>showSegmentConfirmModal(seg);
  card.querySelector('[data-act="copy"]').onclick=()=>{
    const txt=`📜 ${dateLabel}\n\n${seg.summary||''}${seg.tags&&seg.tags.length?'\n\n标签：'+seg.tags.join(' / '):''}`;
    copyToClipboard(txt);
  };
  card.querySelector('[data-act="edit"]').onclick=()=>{editingSegmentId=seg.id;renderTimeline()};
  card.querySelector('[data-act="pin"]').onclick=()=>{seg.pinned=!seg.pinned;save();renderTimeline()};
  card.querySelector('[data-act="del"]').onclick=()=>deleteSegmentConfirm(seg.id);
  return card;
}
function deleteSegmentConfirm(id){
  const r=getRole();if(!r)return;
  const s=(r.segments||[]).find(x=>x.id===id);if(!s)return;
  const dateLabel=s.date_start===s.date_end?s.date_start:`${s.date_start} ~ ${s.date_end}`;
  showModal(`<h3>删除这条摘要？</h3>
    <div style="line-height:1.7;color:var(--ink-2)">${escapeHtml(dateLabel)} 的摘要删除后不可恢复。<br><br>（聊天记录不受影响）</div>`,()=>{
    r.segments=r.segments.filter(x=>x.id!==id);
    if(r.pendingSegmentId===id)r.pendingSegmentId=null;
    if(editingSegmentId===id)editingSegmentId=null;
    save();renderTimeline();showToast('已删除',{duration:1500});
  },'删除','danger');
}
function renderDailyCard(daily){
  const r=getRole();
  const card=document.createElement('div');
  card.className='tl-daily';
  card.dataset.date=daily.date;
  if(daily.status==='loading'){
    card.classList.add('loading');
    card.innerHTML=`<div class="tl-daily-head"><i class="ph-light ph-calendar-blank"></i> ${fmtDailyDate(daily.date)} · 今日档案整理中</div>
      <div>${r.name}正在读这一天… <span style="color:var(--amber)">▍</span></div>`;
    return card;
  }
  if(daily.status==='error'){
    card.classList.add('error');
    card.innerHTML=`<div class="tl-daily-head"><i class="ph-light ph-warning"></i> ${fmtDailyDate(daily.date)} · 今日档案整理失败</div>
      <div style="color:var(--danger-deep);font-size:12px;line-height:1.6;margin-bottom:8px;word-break:break-word">${escapeHtml(daily.errMsg||'未知错误')}</div>
      <div class="tl-daily-actions">
        <button class="primary" data-act="retry"><i class="ph-light ph-arrows-clockwise"></i> 重试</button>
        <button class="danger" data-act="del"><i class="ph-light ph-trash"></i> 删除</button>
      </div>`;
    card.querySelector('[data-act="retry"]').onclick=()=>generateDaily(daily.date);
    card.querySelector('[data-act="del"]').onclick=()=>deleteDailyConfirm(daily.date);
    return card;
  }
  const isEditing=editingDailyDate===daily.date;
  if(isEditing){
    card.innerHTML=`<div class="tl-daily-head"><i class="ph-light ph-pencil-simple"></i> 编辑 · ${fmtDailyDate(daily.date)} 今日档案</div>
      <div class="tl-daily-edit">
        <label>标题</label>
        <textarea class="title-ta" id="dl-title-${daily.date}">${escapeHtml(daily.title||'')}</textarea>
        <label>摘要</label>
        <textarea class="sum-ta" id="dl-sum-${daily.date}">${escapeHtml(daily.summary||'')}</textarea>
        <label>标签（逗号分隔）</label>
        <input class="tags-in" id="dl-tags-${daily.date}" value="${escapeHtml((daily.tags||[]).join(', '))}" placeholder="逗号分隔，比如：Luma 开发, 身体…">
        <div class="tl-daily-actions">
          <button data-act="cancel">取消</button>
          <button data-act="regen"><i class="ph-light ph-arrows-clockwise"></i> 重新生成</button>
          <button class="primary" data-act="save"><i class="ph-light ph-floppy-disk"></i> 保存</button>
        </div>
      </div>`;
    const tTa=card.querySelector(`#dl-title-${daily.date}`);
    const sTa=card.querySelector(`#dl-sum-${daily.date}`);
    [tTa,sTa].forEach(ta=>{
      setTimeout(()=>{ta.style.height='auto';ta.style.height=ta.scrollHeight+'px'},0);
      ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=ta.scrollHeight+'px'});
    });
    card.querySelector('[data-act="cancel"]').onclick=()=>{editingDailyDate=null;renderTimeline()};
    card.querySelector('[data-act="regen"]').onclick=()=>{
      showModal('<h3>重新生成这天的今日档案？</h3><div style="line-height:1.7;color:var(--ink-2)">会覆盖当前编辑的内容，从聊天记录重新读一遍</div>',()=>{
        editingDailyDate=null;generateDaily(daily.date);
      },'重新生成');
    };
    card.querySelector('[data-act="save"]').onclick=()=>{
      const title=tTa.value.trim();const summary=sTa.value.trim();
      const tagStr=card.querySelector(`#dl-tags-${daily.date}`).value;
      if(!title){showToast('标题不能为空～');return}
      if(!summary){showToast('摘要不能为空～');return}
      daily.title=title.slice(0,30);daily.summary=summary;
      daily.tags=tagStr.split(/[,，、]/).map(s=>s.trim()).filter(Boolean).slice(0,8);
      daily.edited=true;daily.updatedAt=Date.now();
      editingDailyDate=null;save();renderTimeline();showToast(`已保存 ${r.signature||""}`,{duration:1500});
    };
    return card;
  }
  const tagsHtml=(daily.tags||[]).map(t=>`<span class="td-tag">${escapeHtml(t)}</span>`).join('');
  const editedMark=daily.edited?' <span style="color:var(--ink-3);font-weight:normal">（编辑过）</span>':'';
  card.innerHTML=`<div class="tl-daily-head"><i class="ph-light ph-calendar-blank"></i> ${fmtDailyDate(daily.date)} 今日档案${editedMark}</div>
    ${daily.title?`<div class="tl-daily-title">${escapeHtml(daily.title)}</div>`:''}
    <div class="tl-daily-summary">${escapeHtml(daily.summary||'')}</div>
    ${tagsHtml?`<div class="tl-daily-tags">${tagsHtml}</div>`:''}
    <div class="tl-daily-actions">
      <button data-act="copy"><i class="ph-light ph-copy"></i> 复制</button>
      <button data-act="edit"><i class="ph-light ph-pencil-simple"></i> 编辑</button>
      <button data-act="regen"><i class="ph-light ph-arrows-clockwise"></i> 重新生成</button>
      <button class="danger" data-act="del"><i class="ph-light ph-trash"></i> 删除</button>
    </div>`;
  // 🆕 1.10.3：今日档案复制
  card.querySelector('[data-act="copy"]').onclick=()=>{
    const txt=`📅 ${daily.date}${daily.title?' · '+daily.title:''}\n\n${daily.summary||''}${daily.tags&&daily.tags.length?'\n\n标签：'+daily.tags.join(' / '):''}`;
    copyToClipboard(txt);
  };
  card.querySelector('[data-act="edit"]').onclick=()=>{editingDailyDate=daily.date;renderTimeline()};
  card.querySelector('[data-act="regen"]').onclick=()=>{
    showModal('<h3>重新生成这天的今日档案？</h3><div style="line-height:1.7;color:var(--ink-2)">会覆盖当前内容，从聊天记录重新读一遍</div>',()=>{generateDaily(daily.date)},'重新生成');
  };
  card.querySelector('[data-act="del"]').onclick=()=>deleteDailyConfirm(daily.date);
  return card;
}
function deleteDailyConfirm(date){
  const r=getRole();if(!r)return;
  const d=getDailyOfDate(r,date);if(!d)return;
  showModal(`<h3>删除这天的今日档案？</h3>
    <div style="line-height:1.7;color:var(--ink-2)">${escapeHtml(fmtDailyDate(date))} 的今日档案删除后不可恢复。<br><br>（聊天记录不受影响，以后还能重新生成）</div>`,()=>{
    r.dailies=r.dailies.filter(x=>x.date!==date);
    if(editingDailyDate===date)editingDailyDate=null;
    save();renderTimeline();showToast('已删除',{duration:1500});
  },'删除','danger');
}
function openDailyGenModal(){
  const r=getRole();if(!r)return;
  const today=dayKey(Date.now());
  const candidates=new Set();
  r.conversations.forEach(c=>c.messages.forEach(m=>{
    if(m.streaming)return;
    const k=dayKey(m.ts);
    if(k<=today)candidates.add(k);
  }));
  const sorted=[...candidates].sort().reverse().slice(0,14);
  if(sorted.length===0){showToast('还没有聊天记录可以总结～',{type:'error'});return}
  const options=sorted.map(k=>{
    const has=getDailyOfDate(r,k);
    const suffix=has?(has.status==='done'?'（已有，重新生成会覆盖）':has.status==='error'?'（上次失败）':'（生成中…）'):'';
    return `<option value="${k}">${fmtDailyDate(k)}${suffix}</option>`;
  }).join('');
  const y=yesterdayStr();
  const defaultVal=sorted.includes(y)?y:sorted[0];
  showModal(`<h3><i class="ph-light ph-calendar-blank"></i> 生成今日档案</h3>
    <label>选择日期（最近14天有聊天记录的）</label>
    <select id="dl-date">${options}</select>
    <div class="warn">选了已有今日档案的日子会覆盖当前内容哦</div>`,()=>{
    const val=document.getElementById('dl-date').value;
    if(!val){showToast('没有可选日期～');return false}
    generateDaily(val);
  },'生成');
  setTimeout(()=>{const sel=document.getElementById('dl-date');if(sel&&defaultVal)sel.value=defaultVal},30);
}
function renderTLNode(n){
  const r=getRole();
  const div=document.createElement('div');
  div.className='tl-node'+(expandedNodes.has(n.id)?' expanded':'');
  div.dataset.id=n.id;div.dataset.type=n.type;
  const mark=n.starred?'<span><i class="ph-light ph-star"></i></span>':'';
  const cmtCount=(n.comments||[]).length;
  const canJump=!!n.sourceMsgId;
  div.innerHTML=`<div class="tl-node-head">
      <span class="tl-time">${fmtTime(n.ts)}</span>
      <span class="tl-type-icon" title="${TYPE_META[n.type]?.label||''}">${typeIcon(n.type)}</span>
      <span class="tl-title">${escapeHtml(n.content||'(未命名)')}</span>
      <span class="tl-marks">${mark}${cmtCount?`<span style="color:var(--ink-3);font-size:11px;margin-left:4px"><i class="ph-light ph-chat"></i>${cmtCount}</span>`:''}</span>
    </div>
    <div class="tl-body">
      <textarea class="tl-content-edit" rows="2">${escapeHtml(n.content||'')}</textarea>
      <div class="tl-meta-row">
        <select data-f="type">
          <option value="fact"><i class="ph-light ph-brain"></i> 事实</option>
          <option value="moment"><i class="ph-light ph-cloud"></i> 瞬间</option>
          <option value="promise"><i class="ph-light ph-handshake"></i> 约定</option>
        </select>
        <select data-f="about">
          <option value="${r.userMark||'我'}">${r.userMark||''} 关于你</option>
          <option value="${r.name}">${r.signature||''} 关于${r.name}</option>
          <option value="我们">${r.pairMark||''} 关于我们</option>
        </select>
      </div>
      <div class="tl-actions">
        <button class="save-btn" data-act="save"><i class="ph-light ph-floppy-disk"></i> 保存</button>
        <button data-act="copy"><i class="ph-light ph-copy"></i> 复制</button>
        <button data-act="mark">${n.starred?'<i class="ph-light ph-star"></i> 取消星标':'<i class="ph-light ph-star"></i> 星标'}</button>
        ${canJump?'<button data-act="open"><i class="ph-light ph-scroll"></i> 查看原对话</button>':''}
        <button data-act="del"><i class="ph-light ph-trash"></i> 删除</button>
      </div>
      <div class="tl-comments" id="cmt-${n.id}"></div>
    </div>`;
  div.querySelector('[data-f="type"]').value=n.type;
  div.querySelector('[data-f="about"]').value=n.about;
  div.querySelector('.tl-node-head').onclick=()=>{
    if(expandedNodes.has(n.id))expandedNodes.delete(n.id);else expandedNodes.add(n.id);
    div.classList.toggle('expanded');
    if(div.classList.contains('expanded'))renderComments(n);
  };
  div.querySelectorAll('.tl-actions button').forEach(b=>{
    b.onclick=e=>{
      e.stopPropagation();const act=b.dataset.act;
      if(act==='save'){
        const newContent=div.querySelector('.tl-content-edit').value.trim();
        if(!newContent){showToast('内容不能为空～');return}
        n.content=newContent;
        n.type=div.querySelector('[data-f="type"]').value;
        n.about=div.querySelector('[data-f="about"]').value;
        save();renderTimeline();showToast(`已保存 ${r.signature||""}`,{duration:1800});
      }
      // 🆕 1.10.3：记忆树节点复制
      else if(act==='copy'){
        const txt=`${typeIcon(n.type)} ${n.content||''}\n（${fmtDateTime(n.ts)} · 关于${n.about}${n.starred?' · ⭐':''}）`;
        copyToClipboard(txt);
      }
      else if(act==='mark'){n.starred=!n.starred;save();renderTimeline()}
      else if(act==='open')jumpToConv(n);
      else if(act==='del'){
        showModal('<h3>删除这条？</h3><div style="line-height:1.7;color:var(--ink-2)">从记忆树移除后不可恢复。原始聊天记录不受影响。</div>',()=>{
          const r=getRole();
          if(n.sourceMsgId){
            for(const conv of r.conversations){
              const msg=conv.messages.find(x=>x.id===n.sourceMsgId);
              if(msg){msg.pinned=false;break}
            }
          }
          r.entries=r.entries.filter(x=>x.id!==n.id);
          expandedNodes.delete(n.id);save();renderAll();
        },'删除','danger');
      }
    };
  });
  if(expandedNodes.has(n.id))setTimeout(()=>renderComments(n),0);
  return div;
}
function renderComments(n){
  const box=document.getElementById('cmt-'+n.id);if(!box)return;
  const r=getRole();
  let html=`<div class="tl-comments-label"><i class="ph-light ph-chat"></i> 在这里聊聊（${(n.comments||[]).length}）</div>`;
  (n.comments||[]).forEach(c=>{
    const isUser=c.role==='user';
    const roleLabel=isUser?`${r.userMark||'我'}`:`${r.name} ${r.emoji||''}`.trim();
    const rawBody=isUser?(c.content||''):(c.displayContent!==undefined?c.displayContent:c.content||'');
    const body=renderMarkdown(rawBody);
    let thinkingHtml='';
    if(!isUser&&c.thinking){
      const exp=!!state.thinkingExpanded[c.id];
      thinkingHtml=`<div class="thinking-box${exp?' expanded':''}" data-tk="${c.id}">
        <div class="thinking-head"><span class="thinking-arrow">▶</span><span>💭 思考过程</span></div>
        <div class="thinking-body">${escapeHtml(c.thinking)}</div>
      </div>`;
    }
    html+=`<div class="tl-cmt ${c.role}" data-cid="${c.id}">
      <div class="tl-cmt-meta"><span class="role">${roleLabel}</span><span class="time">${fmtTime(c.ts)}</span>${c.interrupted?'<span style="color:var(--amber-deep);font-size:10px">⚠️ 上次中断</span>':''}</div>
      ${thinkingHtml}
      <div class="tl-cmt-body">${body}${c.streaming?'<span class="tl-streaming"></span>':''}</div>
      <div class="tl-cmt-actions">
        <button data-act="copy" data-cid="${c.id}"><i class="ph-light ph-copy"></i> 复制</button>
        <button class="danger" data-act="del" data-cid="${c.id}"><i class="ph-light ph-trash"></i> 删除</button>
      </div>
    </div>`;
  });
  html+=`<div class="tl-cmt-input">
    <textarea id="cmt-input-${n.id}" placeholder="对这条说点什么…" rows="1"></textarea>
    <button id="cmt-send-${n.id}">发送</button>
  </div>`;
  box.innerHTML=html;
  box.querySelectorAll('.thinking-box').forEach(bindThinkingToggle);
  // 🆕 1.10.3：评论复制 + 删除（替换原来的浮动 × 按钮）
  box.querySelectorAll('.tl-cmt-actions button').forEach(b=>{
    b.onclick=e=>{
      e.stopPropagation();const cid=b.dataset.cid;const act=b.dataset.act;
      const cmt=(n.comments||[]).find(x=>x.id===cid);
      if(!cmt)return;
      if(act==='copy'){
        const txt=cmt.role==='user'?(cmt.content||''):(cmt.displayContent!==undefined?cmt.displayContent:cleanForCopy(cmt.content||''));
        copyToClipboard(txt);
      }else if(act==='del'){
        if(activeStreams.has(cid))stopStream(cid);
        n.comments=n.comments.filter(x=>x.id!==cid);save();renderComments(n);
      }
    };
  });
  const ta=box.querySelector(`#cmt-input-${n.id}`);
  ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,100)+'px'});
  ta.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&window.innerWidth>=900){e.preventDefault();sendComment(n)}
  });
  box.querySelector(`#cmt-send-${n.id}`).onclick=()=>sendComment(n);
}
async function sendComment(n){
  const ta=document.getElementById('cmt-input-'+n.id);
  const text=ta.value.trim();if(!text)return;
  const cfg=getActiveConfig(getConv());
  if(!cfg||!cfg.apiKey){showToast(`当前房间还没绑提供商或 Key 没填`,{type:'error'});return}
  const userMsg={id:uid(),role:'user',content:text,ts:Date.now()};
  n.comments=n.comments||[];n.comments.push(userMsg);
  ta.value='';ta.style.height='auto';
  save();renderComments(n);
  const aiMsg={id:uid(),role:'assistant',content:'',reasoningContent:'',thinking:null,ts:Date.now(),streaming:true};
  n.comments.push(aiMsg);renderComments(n);
  let hadError=null;
  try{await callOpenAIStreamForComment(n,aiMsg)}catch(err){hadError=err}
  const finalize=()=>{
    const {thinking,cleaned,savedLetters,savedDiaries,savedMemos}=extractAll(aiMsg.content,{autoSave:true,msgId:aiMsg.id,reasoningContent:aiMsg.reasoningContent||''});
    aiMsg.thinking=thinking;aiMsg.displayContent=cleaned;
    if(savedLetters&&savedLetters.length)aiMsg.savedLetterRefs=savedLetters.map(l=>({id:l.id,title:l.title}));
    if(savedDiaries&&savedDiaries.length)aiMsg.savedDiaryRefs=savedDiaries.map(d=>({id:d.id,length:(d.content||'').length}));
    if(savedMemos&&savedMemos.length)aiMsg.savedMemoRefs=savedMemos.map(mm=>({id:mm.id,title:mm.title}));
    delete aiMsg.streaming;
    const role=getRole();if(role){role.lastAiReplyTs=aiMsg.ts;}
    return {savedLetters,savedDiaries,savedMemos};
  };
  const isAborted=hadError&&(hadError.name==='AbortError'||/aborted/i.test(hadError.message||''));
  if(hadError&&!isAborted){
    if(!aiMsg.content||!aiMsg.content.trim())n.comments=n.comments.filter(x=>x.id!==aiMsg.id);
    else finalize();
    save();renderComments(n);
    showToast('评论回复失败：'+hadError.message,{type:'error',duration:8000});
  }else{
    if(isAborted){
      if(!aiMsg.content||!aiMsg.content.trim()){
        n.comments=n.comments.filter(x=>x.id!==aiMsg.id);
      }else{
        finalize();aiMsg.interrupted=true;
      }
      save();renderComments(n);
      showToast('已停止生成',{duration:1500});
    }else{
      const {savedLetters,savedDiaries,savedMemos}=finalize();
      save();renderComments(n);renderTimeline();
      if(savedMemos&&savedMemos.length)showToast(`📓 ${r.name}收进共享备忘录《${savedMemos[0].title}》～`,{duration:2200,actionText:'去看看',onAction:()=>{switchTab('box');state.boxTab='memo';save();renderBox()}});
      if(savedLetters&&savedLetters.length)showToast(`✉️ ${r.name}写了一封信给你～`,{duration:2200,actionText:'去信箱',onAction:()=>{switchTab('box');state.boxTab='letter';save();renderBox()}});
      if(savedDiaries&&savedDiaries.length)showToast(`📓 ${r.name}写了一篇日记～`,{duration:2200,actionText:'去日记本',onAction:()=>{switchTab('box');state.boxTab='diary';save();renderBox()}});
    }
  }
  expandedNodes.add(n.id);
  setTimeout(()=>{
    const el=document.querySelector(`.tl-node[data-id="${n.id}"]`);
    if(el){el.classList.add('expanded');renderComments(n)}
  },10);
}
function pinToTimeline(msgId){
  const r=getRole();const c=getConv();
  const m=c.messages.find(x=>x.id===msgId);if(!m)return;
  if(m.pinned){showToast(`这条已经在记忆树上啦 ${r.signature||""}`);return}
  const raw=m.displayContent!==undefined?m.displayContent:(m.content||'');
  const preview=raw.replace(/\s+/g,' ').slice(0,80);
  const defaultContent=preview||(m.images?.length?'(一张图片)':'');
  showModal(`<h3><i class="ph-light ph-tree"></i> 挂到记忆树</h3>
    <label>内容（一句话描述）</label>
    <textarea id="pin-content" rows="3">${escapeHtml(defaultContent)}</textarea>
    <label>类型</label>
    <select id="pin-type">
      <option value="moment"><i class="ph-light ph-cloud"></i> 瞬间（默认）</option>
      <option value="fact"><i class="ph-light ph-brain"></i> 事实</option>
      <option value="promise"><i class="ph-light ph-handshake"></i> 约定</option>
    </select>
    <label>归属</label>
    <select id="pin-about">
      <option value="我们">${r.pairMark||''} 我们</option>
      <option value="${r.userMark||'我'}">${r.userMark||''} 你</option>
      <option value="${r.name}">${r.signature||''} ${r.name}</option>
    </select>
    <label style="margin-top:12px"><input type="checkbox" id="pin-mark" style="width:auto;margin-right:6px"><i class="ph-light ph-star"></i> 星标</label>`,()=>{
    const content=document.getElementById('pin-content').value.trim()||'(未命名)';
    const type=document.getElementById('pin-type').value;
    const about=document.getElementById('pin-about').value;
    const starred=document.getElementById('pin-mark').checked;
    r.entries.push({id:uid(),ts:m.ts,type,about,content,starred,sourceConvId:c.id,sourceMsgId:m.id,comments:[]});
    m.pinned=true;openActionMsgId=null;save();renderAll();
    showToast(`已挂到记忆树 🌳${r.signature||""}`,{duration:2200});
  },'钉住');
}
function jumpToConv(n){
  if(!n.sourceConvId||!n.sourceMsgId){showToast('这条没有关联原对话～');return}
  const r=getRole();const c=r.conversations.find(x=>x.id===n.sourceConvId);
  if(!c){showToast('原窗口已被删除～');return}
  switchActiveConv(c.id,{unarchive:true,switchToChat:true});
  setTimeout(()=>{
    const node=document.querySelector(`.node[data-id="${n.sourceMsgId}"]`);
    if(node){node.scrollIntoView({behavior:'smooth',block:'center'});
      const b=node.querySelector('.bubble');
      if(b){b.style.boxShadow='0 0 0 3px var(--amber)';setTimeout(()=>b.style.boxShadow='',1600)}
    }else showToast('原消息找不到了（可能被删除了）',{type:'error'});
  },120);
}
function jumpFromBookmark(bm){
  const r=getRole();
  const c=r.conversations.find(x=>x.id===bm.convId);
  if(!c){showToast('原窗口已被删除～',{type:'error'});return}
  switchActiveConv(c.id,{unarchive:true,switchToChat:true});
  setTimeout(()=>{
    const node=document.querySelector(`.node[data-id="${bm.msgId}"]`);
    if(node){node.scrollIntoView({behavior:'smooth',block:'center'});
      const b=node.querySelector('.bubble');
      if(b){b.style.boxShadow='0 0 0 3px var(--amber)';setTimeout(()=>b.style.boxShadow='',1600)}
    }else showToast('原消息找不到了～',{type:'error'});
  },120);
}
function jumpToTimelineEntry(entryId){
  state.tlFilter='all';
  expandedNodes.add(entryId);
  switchTab('timeline');
  save();
  setTimeout(()=>{
    const el=document.querySelector(`.tl-node[data-id="${entryId}"]`);
    if(el){
      el.classList.add('expanded');
      el.scrollIntoView({behavior:'smooth',block:'center'});
      const head=el.querySelector('.tl-node-head');
      if(head){head.style.boxShadow='0 0 0 3px var(--amber)';setTimeout(()=>head.style.boxShadow='',1800)}
    }else showToast('记忆树里找不到这条了～',{type:'error'});
  },180);
}
