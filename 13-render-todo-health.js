// ─────────────────────────────────────────────
//  13-render-todo-health.js · 便利贴渲染层
//  依赖：01-state.js（state、getRole、TODO_TABS）
//        02-utils.js（escapeHtml、fmtDeadline、deadlineClass、
//                    toInputDatetime、parseInputDatetime）
//        05-storage.js（save）
//        15-modal-toast.js（showModal、showToast）← 运行时依赖
// ─────────────────────────────────────────────

/* ── 统计各状态待办数量 ── */

function getTodoCounts(){
  const r=getRole();if(!r)return{active:0,today:0,done:0,delayed:0,cancelled:0,overdue:0};
  const now=Date.now(),today=dayKey(now);
  const c={active:0,today:0,done:0,delayed:0,cancelled:0,overdue:0};
  r.todos.forEach(t=>{
    if(t.status==='pending'||t.status==='delayed'){
      c.active++;
      if(t.status==='delayed')c.delayed++;
      if(t.deadline){
        if(t.deadline<now)c.overdue++;
        if(dayKey(t.deadline)===today)c.today++;
      }
    }
    if(t.status==='done')c.done++;
    if(t.status==='cancelled')c.cancelled++;
  });
  return c;
}
function updateTodoBadge(){
  const c=getTodoCounts();
  const badge=document.getElementById('todo-badge');
  const n=c.overdue+c.today;
  if(n>0){badge.style.display='';badge.textContent=n>99?'99+':n}
  else badge.style.display='none';
}
function renderTodoPanel(){
  const r=getRole();if(!r)return;
  const c=getTodoCounts();
  const tabsEl=document.getElementById('todo-tabs');
  tabsEl.innerHTML='';
  const counts={active:c.active,today:c.today,done:c.done,delayed:c.delayed,cancelled:c.cancelled};
  TODO_TABS.forEach(t=>{
    const b=document.createElement('button');
    const n=counts[t.key]||0;
    b.innerHTML=`${t.label}${n?` <b>${n}</b>`:''}`;
    if(state.todoTab===t.key)b.classList.add('active');
    b.onclick=()=>{state.todoTab=t.key;save();renderTodoPanel()};
    tabsEl.appendChild(b);
  });

  const listEl=document.getElementById('todo-list');
  listEl.innerHTML='';

  const now=Date.now(),today=dayKey(now);
  let items=[...r.todos];
  const tab=state.todoTab;
  if(tab==='active')items=items.filter(t=>t.status==='pending'||t.status==='delayed');
  else if(tab==='today')items=items.filter(t=>(t.status==='pending'||t.status==='delayed')&&t.deadline&&dayKey(t.deadline)===today);
  else items=items.filter(t=>t.status===tab);

  if(tab==='active'||tab==='today'){
    const stat=document.createElement('div');stat.className='todo-stat';
    stat.innerHTML=`<i class="ph-light ph-fire"></i> 进行中 <b>${c.active}</b> · <i class="ph-light ph-calendar-blank"></i> 今天 <b>${c.today}</b> · <i class="ph-light ph-warning"></i> 已过期 <b style="color:var(--danger-deep)">${c.overdue}</b>`;
    listEl.appendChild(stat);
  }else if(tab==='delayed'||tab==='cancelled'){
    const stat=document.createElement('div');stat.className='todo-stat';
    const tip=tab==='delayed'?'<i class="ph-light ph-books"></i> 这个月拖了多少次，数据不骗人':'<i class="ph-light ph-flag-banner"></i> 大饼坟场 · 诚实面对画过的饼';
    stat.innerHTML=tip+`<br>共 <b>${items.length}</b> 条`;
    listEl.appendChild(stat);
  }else if(tab==='done'){
    const stat=document.createElement('div');stat.className='todo-stat';
    stat.innerHTML=`<i class="ph-light ph-trophy"></i> 战绩厅 · 已完成 <b>${items.length}</b> 件事！你超棒 🤍`;
    listEl.appendChild(stat);
  }

  if(items.length===0){
    const e=document.createElement('div');e.className='todo-empty';
    const msg={active:'暂无进行中的任务～<br>聊天时说到要做什么，初晓会帮你记 🤍',today:'今天没有截止的事～<br>放松一下下 🍃',done:'还没有战绩哦～<br>完成一件是一件 💪',delayed:'还没有拖延记录～<br>保持住 😤',cancelled:'大饼坟场暂时空着～<br>（这是好事）'};
    e.innerHTML=msg[tab]||'空';
    listEl.appendChild(e);
  }else{
    items.sort((a,b)=>{
      if(tab==='active'||tab==='today'){
        const ad=a.deadline||Infinity,bd=b.deadline||Infinity;
        if(ad!==bd)return ad-bd;
        return b.createdAt-a.createdAt;
      }
      const at=a.history?.[a.history.length-1]?.ts||a.createdAt;
      const bt=b.history?.[b.history.length-1]?.ts||b.createdAt;
      return bt-at;
    });
    items.forEach(t=>listEl.appendChild(renderTodoItem(t)));
  }
  updateTodoBadge();
}
function renderTodoItem(t){
  const div=document.createElement('div');
  const dlCls=deadlineClass(t.deadline);
  div.className='todo-item '+t.status+(dlCls?' '+dlCls:'');
  div.dataset.id=t.id;
  let metaHtml='';
  if(t.deadline)metaHtml+=`<span class="deadline ${dlCls}"><i class="ph-light ph-clock-countdown"></i> ${fmtDeadline(t.deadline)}</span>`;
  else if(t.status==='pending'||t.status==='delayed')metaHtml+=`<span style="color:var(--ink-3)"><i class="ph-light ph-clock"></i> 没设时间</span>`;
  if(t.status==='done'&&t.history){
    const last=[...t.history].reverse().find(h=>h.action==='done');
    if(last)metaHtml+=`<span><i class="ph-light ph-check-circle"></i> ${fmtDeadline(last.ts)}完成</span>`;
  }
  if(t.status==='delayed'&&t.history){
    const count=t.history.filter(h=>h.action==='delay').length;
    if(count)metaHtml+=`<span style="color:var(--amber-deep)"><i class="ph-light ph-hourglass"></i> 拖了 ${count} 次</span>`;
  }
  div.innerHTML=`<div class="todo-content">${escapeHtml(t.content)}</div>
    <div class="todo-meta">${metaHtml}</div>
    ${t.reason?`<div class="reason">${escapeHtml(t.reason)}</div>`:''}`;
  if(t.status==='pending'||t.status==='delayed'){
    const actions=document.createElement('div');actions.className='todo-actions';
    actions.innerHTML=`
      <button class="done-btn" data-act="done"><i class="ph-light ph-check"></i> 完成</button>
      <button class="delay-btn" data-act="delay"><i class="ph-light ph-clock-countdown"></i> 延迟</button>
      <button class="cancel-btn" data-act="cancel"><i class="ph-light ph-x"></i> 放弃</button>
      <button data-act="edit"><i class="ph-light ph-pencil-simple"></i></button>
      <button data-act="del"><i class="ph-light ph-trash"></i></button>`;
    actions.querySelector('[data-act="done"]').onclick=()=>todoMarkDone(t.id);
    actions.querySelector('[data-act="delay"]').onclick=()=>todoDelay(t.id);
    actions.querySelector('[data-act="cancel"]').onclick=()=>todoCancel(t.id);
    actions.querySelector('[data-act="edit"]').onclick=()=>todoEdit(t.id);
    actions.querySelector('[data-act="del"]').onclick=()=>todoDelete(t.id);
    div.appendChild(actions);
  }else{
    const actions=document.createElement('div');actions.className='todo-actions';
    actions.innerHTML=`${t.status!=='pending'?`<button data-act="revive"><i class="ph-light ph-arrow-counter-clockwise"></i> 恢复</button>`:''}
      <button data-act="del"><i class="ph-light ph-trash"></i></button>`;
    actions.querySelector('[data-act="revive"]').onclick=()=>todoRevive(t.id);
    actions.querySelector('[data-act="del"]').onclick=()=>todoDelete(t.id);
    div.appendChild(actions);
  }
  return div;
}
function findTodo(id){const r=getRole();return r?.todos.find(t=>t.id===id)}
function todoMarkDone(id){const t=findTodo(id);if(!t)return;t.status='done';t.history.push({ts:Date.now(),action:'done'});save();renderTodoPanel();showToast('完成一件！🏆🤍',{duration:2000})}
function todoDelay(id){
  const t=findTodo(id);if(!t)return;
  showModal(`<h3><i class="ph-light ph-clock-countdown"></i> 延迟这件事</h3>
    <div style="font-size:13px;color:var(--ink-2);margin-bottom:8px">${escapeHtml(t.content)}</div>
    <label>新的截止时间</label>
    <input type="datetime-local" id="dl-new" value="${toInputDatetime(t.deadline)||''}">
    <label>为什么要延迟？<span style="color:var(--danger)">（必填）</span></label>
    <textarea id="dl-reason" rows="3" placeholder="诚实一点，比如：今天太累了 / 材料没到 / 高估了自己"></textarea>
    <div class="warn"><i class="ph-light ph-books"></i> 会记进「拖延档案」，月底一起看看自己拖了啥——改掉画饼习惯从这里开始 🤍</div>`,()=>{
    const newDl=parseInputDatetime(document.getElementById('dl-new').value);
    const reason=document.getElementById('dl-reason').value.trim();
    if(!reason){showToast('原因必填哦！这是约定 😤',{type:'error'});return false}
    t.status='delayed';t.deadline=newDl;t.reason=reason;
    t.history.push({ts:Date.now(),action:'delay',reason,newDeadline:newDl});
    save();renderTodoPanel();showToast('已记到拖延档案 <i class="ph-light ph-books"></i>',{duration:2500});
  },'确认延迟');
}
function todoCancel(id){
  const t=findTodo(id);if(!t)return;
  showModal(`<h3><i class="ph-light ph-flag-banner"></i> 放弃这件事</h3>
    <div style="font-size:13px;color:var(--ink-2);margin-bottom:8px">${escapeHtml(t.content)}</div>
    <label>为什么要放弃？<span style="color:var(--danger)">（必填）</span></label>
    <textarea id="cc-reason" rows="3" placeholder="诚实一点：想清楚不做了 / 其实是画饼 / 情况变了"></textarea>
    <div class="warn"><i class="ph-light ph-flag-banner"></i> 会进「大饼坟场」——不是惩罚，是让你看清自己的模式 🤍</div>`,()=>{
    const reason=document.getElementById('cc-reason').value.trim();
    if(!reason){showToast('原因必填哦！这是约定 😤',{type:'error'});return false}
    t.status='cancelled';t.reason=reason;
    t.history.push({ts:Date.now(),action:'cancel',reason});
    save();renderTodoPanel();showToast('已埋到大饼坟场 <i class="ph-light ph-flag-banner"></i>',{duration:2500});
  },'确认放弃','danger');
}
function todoRevive(id){const t=findTodo(id);if(!t)return;t.status='pending';t.reason=null;t.history.push({ts:Date.now(),action:'revive'});save();renderTodoPanel();showToast('已恢复到进行中 🔥',{duration:1800})}
function todoEdit(id){
  const t=findTodo(id);if(!t)return;
  showModal(`<h3><i class="ph-light ph-pencil-simple"></i> 编辑待办</h3>
    <label>内容</label>
    <textarea id="te-content" rows="2">${escapeHtml(t.content)}</textarea>
    <label>截止时间（可留空）</label>
    <input type="datetime-local" id="te-dl" value="${toInputDatetime(t.deadline)||''}">`,()=>{
    const content=document.getElementById('te-content').value.trim();
    if(!content){showToast('内容不能为空～');return false}
    t.content=content;t.deadline=parseInputDatetime(document.getElementById('te-dl').value);
    t.history.push({ts:Date.now(),action:'edit'});
    save();renderTodoPanel();
  });
}
function todoDelete(id){
  const t=findTodo(id);if(!t)return;
  showModal(`<h3>删除这条？</h3>
    <div style="line-height:1.7;color:var(--ink-2)">「${escapeHtml(t.content)}」<br><br>彻底删除，不可恢复。<br>（如果想保留记录，建议用"放弃"而不是删除）</div>`,()=>{
    const r=getRole();r.todos=r.todos.filter(x=>x.id!==id);save();renderTodoPanel();
  },'删除','danger');
}
function todoAdd(){
  showModal(`<h3><i class="ph-light ph-plus"></i> 添加便利贴</h3>
    <label>要做什么？</label>
    <textarea id="ta-content" rows="2" placeholder="简短动词短语"></textarea>
    <label>截止时间（可留空）</label>
    <input type="datetime-local" id="ta-dl">`,()=>{
    const content=document.getElementById('ta-content').value.trim();
    if(!content){showToast('内容不能为空～');return false}
    const deadline=parseInputDatetime(document.getElementById('ta-dl').value);
    const r=getRole();
    r.todos.push({id:uid(),content,deadline,createdAt:Date.now(),status:'pending',reason:null,history:[{ts:Date.now(),action:'created',from:'manual'}]});
    state.todoTab='active';save();renderTodoPanel();showToast('已添加 <i class="ph-light ph-push-pin"></i>🤍',{duration:1500});
  },'添加');
}
