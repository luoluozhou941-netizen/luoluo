// ─────────────────────────────────────────────
//  09-render-sidebar.js · 侧边栏渲染层
//  依赖：00-prompts.js（ROLE_EMOJI_PRESETS）
//        01-state.js（state、settings、getRole、getConv、
//                    openActionMsgId、editingMsgId、modelPickerOpen）
//        02-utils.js（escapeHtml）
//        05-storage.js（save）
//        06-providers.js（getProvider、getActiveConfig）
//        15-modal-toast.js（showModal、showToast）← 运行时依赖
// ─────────────────────────────────────────────

/* ── 角色头像栏 ── */

function renderRoleBar(){
  const el=document.getElementById('role-bar');el.innerHTML='';
  state.roles.forEach(r=>{
    const d=document.createElement('div');
    d.className='role-avatar'+(r.id===state.activeRoleId?' active':'');
    d.textContent=r.emoji||r.name[0];d.title=r.name;
    d.onclick=()=>{switchActiveRole(r.id)};
    el.appendChild(d);
  });
  const add=document.createElement('div');
  add.className='role-avatar add';add.textContent='＋';add.title='新建房间';
  add.onclick=()=>openCreateRole();
  el.appendChild(add);
  const r=getRole();document.getElementById('role-name-cur').textContent=r?`${r.name} ${r.emoji||''}`:'—';
}
function openCreateRole(){
  if((settings.providers||[]).length===0){
    showModal(`<h3>还没有提供商哦～</h3>
      <div style="line-height:1.7;color:var(--ink-2)">每个房间必须绑定一个提供商才能聊天。<br><br>先去配一个吧 🤍</div>`,()=>{
      openProviderPage();
    },'去配置');
    return;
  }
  const provOptions=settings.providers.map(p=>`<option value="${p.id}">${escapeHtml(p.name||'(未命名)')}</option>`).join('');
  const emojiHtml=ROLE_EMOJI_PRESETS.map(e=>`<span data-emoji="${e}">${e}</span>`).join('');
  showModal(`<h3><i class="ph-light ph-plus"></i> 新建房间</h3>
    <div class="role-create-form" style="margin:0;border:none;box-shadow:none;padding:0;background:transparent">
      <label>常驻名字</label>
      <input id="rc-name" placeholder="比如：初晓 / 阿素 / 月白" maxlength="20">
      <label>房间标志（emoji）</label>
      <div class="row-emoji">
        <input id="rc-emoji" placeholder="自己输一个，或点右边选" maxlength="4">
        <div class="emoji-picker">${emojiHtml}</div>
      </div>
      <label>提供商 <span style="color:var(--danger)">（必选）</span></label>
      <select id="rc-prov"><option value="">— 请选择 —</option>${provOptions}</select>
      <label>模型（可留空，留空用提供商默认）</label>
      <select id="rc-model"><option value="">默认</option></select>
      <label>常驻人设（人设）</label>
      <textarea id="rc-sys" rows="4" placeholder="留空用默认人设；如果想做不同角色，自己写"></textarea>
      <label>AI 标志 <span style="color:var(--ink-3);font-size:12px">（选填，比如 🤍）</span></label>
      <input id="rc-signature" placeholder="留空则用房间 emoji" maxlength="8">
      <label>我的标志 <span style="color:var(--ink-3);font-size:12px">（选填，比如 🥔）</span></label>
      <input id="rc-usermark" placeholder="留空" maxlength="8">
      <label>配对标志 <span style="color:var(--ink-3);font-size:12px">（选填，比如 🤍🥔）</span></label>
      <input id="rc-pairmark" placeholder="留空" maxlength="16">
    </div>
    <div class="warn">⚠️ 每个房间独立绑定提供商，不会和别的角色串。模型可后续切换 🤍</div>`,()=>{
    const name=document.getElementById('rc-name').value.trim();
    const emoji=document.getElementById('rc-emoji').value.trim()||'🤍';
    const provId=document.getElementById('rc-prov').value;
    const model=document.getElementById('rc-model').value;
    const sys=document.getElementById('rc-sys').value.trim();
    const signature=document.getElementById('rc-signature').value.trim()||emoji;
    const userMark=document.getElementById('rc-usermark').value.trim();
    const pairMark=document.getElementById('rc-pairmark').value.trim();
    if(!name){showToast('名字不能为空～');return false}
    if(!provId){showToast('要选一个提供商哦～',{type:'error'});return false}
    const newRole=newRoleObj(name,emoji,provId,model||null);
    newRole.activeConvId=newRole.conversations[0].id;
    newRole.signature=signature;newRole.userMark=userMark;newRole.pairMark=pairMark;
    if(sys)newRole.systemPrompt=sys;
    state.roles.push(newRole);
    switchActiveRole(newRole.id);
    showToast(`已新建房间「${name}」${emoji} 🤍`,{duration:2200});
  },'创建');
  setTimeout(()=>{
    document.querySelectorAll('.emoji-picker span').forEach(s=>{
      s.onclick=()=>{document.getElementById('rc-emoji').value=s.dataset.emoji};
    });
    const provSel=document.getElementById('rc-prov');
    const modelSel=document.getElementById('rc-model');
    const refreshModels=()=>{
      const pid=provSel.value;
      modelSel.innerHTML='<option value="">默认</option>';
      if(!pid)return;
      const p=getProvider(pid);
      if(!p)return;
      const list=p.models&&p.models.length?p.models:(p.defaultModel?[p.defaultModel]:[]);
      list.forEach(m=>{
        const opt=document.createElement('option');opt.value=m;opt.textContent=m;
        modelSel.appendChild(opt);
      });
    };
    provSel.onchange=refreshModels;
  },50);
}
function renderConvList(){
  const r=getRole();const el=document.getElementById('conv-list');el.innerHTML='';
  if(!r)return;
  let list=r.conversations.filter(c=>!c.archived);
  list.sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0));
  list.forEach(c=>{
    const div=document.createElement('div');
    div.className='conv'+(c.id===r.activeConvId?' active':'')+(c.pinned?' pinned':'');
    div.innerHTML=`<span class="kind-icon">${c.kindIcon||'💬'}</span><span class="conv-title">${escapeHtml(c.title)}</span>
      <span class="conv-actions">
        <button data-act="rename"><i class="ph-light ph-pencil-simple"></i></button>
        ${c.pinned?'':'<button data-act="archive"><i class="ph-light ph-package"></i></button>'}
        ${c.pinned?'':'<button data-act="delete"><i class="ph-light ph-trash"></i></button>'}
      </span>`;
    div.addEventListener('click',e=>{
      const act=e.target.closest('button')?.dataset.act;
      if(act==='rename'){e.stopPropagation();renameConv(c.id)}
      else if(act==='archive'){e.stopPropagation();c.archived=true;save();renderAll()}
      else if(act==='delete'){e.stopPropagation();deleteConv(c.id)}
      else{switchActiveConv(c.id,{closeDrawers:true})}
    });
    el.appendChild(div);
  });
  if(state.showArchived){
    const archived=r.conversations.filter(c=>c.archived);
    if(archived.length===0){const t=document.createElement('div');t.style.cssText='color:var(--ink-3);font-size:12px;padding:8px 12px';t.textContent='（暂无归档）';el.appendChild(t)}
    archived.forEach(c=>{
      const div=document.createElement('div');
      div.className='conv'+(c.id===r.activeConvId?' active':'');div.style.opacity='0.65';
      div.innerHTML=`<span class="kind-icon">${c.kindIcon||'💬'}</span><span class="conv-title">${escapeHtml(c.title)}</span>
        <span class="conv-actions"><button data-act="restore"><i class="ph-light ph-arrow-counter-clockwise"></i></button><button data-act="delete"><i class="ph-light ph-trash"></i></button></span>`;
      div.addEventListener('click',e=>{
        const act=e.target.closest('button')?.dataset.act;
        if(act==='restore'){e.stopPropagation();c.archived=false;save();renderAll()}
        else if(act==='delete'){e.stopPropagation();deleteConv(c.id)}
        else{switchActiveConv(c.id,{closeDrawers:true})}
      });
      el.appendChild(div);
    });
  }
  document.getElementById('archive-toggle').innerHTML=`<i class="ph-light ph-package"></i> 已归档 ${state.showArchived?'▴':'▾'}`;
}
function renameConv(id){
  const r=getRole();const c=r.conversations.find(x=>x.id===id);if(!c)return;
  showModal(`<h3>重命名窗口</h3><input id="prompt-input" value="${escapeHtml(c.title)}">`,()=>{
    const v=document.getElementById('prompt-input').value.trim();if(v){c.title=v;save();renderAll()}
  });
}
function deleteConv(id){
  const r=getRole();const c=r.conversations.find(x=>x.id===id);if(!c||c.pinned)return;
  showModal('<h3>确认删除？</h3><div style="line-height:1.7;color:var(--ink-2)">这个窗口和里面的对话都会消失，不可恢复哦。<br><br>（记忆树/便利贴/备忘录/收藏夹/信/日记 不受影响 🤍）</div>',()=>{
    r.conversations=r.conversations.filter(x=>x.id!==id);
    if(r.activeConvId===id){
      switchActiveConv(r.conversations[0]?.id||null,{skipArchiveCheck:true});
    }else{
      save();renderAll();
    }
  },'删掉','danger');
}
function renderModelChipBar(){
  const el=document.getElementById('model-chip-bar');
  if(!el)return;
  const c=getConv();
  if(!c){el.innerHTML='';return}
  const providers=settings.providers||[];
  const role=getRole();
  if(providers.length===0){
    el.innerHTML=`<button class="model-chip" id="mc-empty">
      <span class="mc-icon">⚠️</span>
      <span class="mc-text">还没配提供商</span>
      <span class="mc-arrow"><i class="ph-light ph-caret-down"></i></span>
    </button>
    <span class="mc-hint">点开配一个 🤍</span>`;
    el.querySelector('#mc-empty').onclick=()=>{openProviderPage()};
    return;
  }
  if(!role.providerId){
    el.innerHTML=`<button class="model-chip" id="mc-unbound">
      <span class="mc-icon">⚠️</span>
      <span class="mc-text">当前房间还没绑提供商</span>
      <span class="mc-arrow"><i class="ph-light ph-caret-down"></i></span>
    </button>
    <span class="mc-hint">去⚙️绑一个 🤍</span>`;
    el.querySelector('#mc-unbound').onclick=()=>{openSettings()};
    return;
  }
  const cfg=getActiveConfig(c);
  let chipText='';
  if(cfg){
    const pname=cfg.provider.name||'(未命名)';
    const mname=cfg.model||'(未选模型)';
    const usingRoleDefault=!c.providerId;
    chipText=`<span class="mc-icon"><i class="ph-light ph-microchip"></i></span>
      <span class="mc-text"><b>${escapeHtml(pname)}</b> · ${escapeHtml(mname)}${usingRoleDefault?' <span style="color:var(--ink-3)">(角色默认)</span>':''}</span>
      <span class="mc-arrow"><i class="ph-light ph-caret-down"></i></span>`;
  }else{
    chipText=`<span class="mc-icon">⚠️</span>
      <span class="mc-text">未配置</span>
      <span class="mc-arrow"><i class="ph-light ph-caret-down"></i></span>`;
  }
  // 步骤7：切窗兜底归纳的"轮数状态点"，只在正常态（已绑定模型）显示，跟mc-hint共用右侧空位
  const unsegRounds=getUnsegmentedMsgs(c).filter(m=>m.role==='user').length;
  const nudgeLevel=unsegRounds>=80?80:unsegRounds>=60?60:unsegRounds>=40?40:0;
  if(nudgeLevel>(c.nudgeLevel||0)){
    if(nudgeLevel===60)showToast(`这段已经聊了 ${unsegRounds} 轮啦，要不要让${role.name}先归纳一下～`,{duration:2800});
    c.nudgeLevel=nudgeLevel;save();
  }
  const dotColor=nudgeLevel>=80?'var(--danger)':nudgeLevel>=60?'var(--amber-deep)':nudgeLevel>=40?'var(--amber)':'var(--mint-deep)';
  el.innerHTML=`<button class="model-chip" id="mc-btn">${chipText}</button>
    <span class="nudge-dot" id="nudge-dot"><span class="nudge-circle" style="background:${dotColor}"></span><span class="nudge-num">${unsegRounds}轮</span></span>`;
  if(nudgePopoverOpen){
    const pop=document.createElement('div');
    pop.className='nudge-popover';
    const lastText=c.lastSegmentTs?fmtDateTime(c.lastSegmentTs):'还没归纳过';
    pop.innerHTML=`<div class="nudge-pop-row">这段已聊 <b>${unsegRounds}</b> 轮</div>
      <div class="nudge-pop-row nudge-pop-sub">上次归纳：${lastText}</div>
      ${nudgeLevel>=80?`<button class="nudge-pop-btn" id="nudge-manual">让${escapeHtml(role.name)}归纳一下</button>`:''}`;
    const mask=document.createElement('div');
    mask.className='model-picker-mask';
    mask.onclick=()=>{nudgePopoverOpen=false;renderModelChipBar()};
    el.appendChild(mask);
    el.appendChild(pop);
    const manualBtn=pop.querySelector('#nudge-manual');
    if(manualBtn)manualBtn.onclick=()=>{nudgePopoverOpen=false;manualArchiveConv(c);renderModelChipBar()};
  }
  if(modelPickerOpen){
    const picker=document.createElement('div');
    picker.className='model-picker';
    let html='';
    html+=`<div class="model-picker-section">
      <div class="model-picker-title">📌 窗口设置</div>
      <div class="model-picker-item ${!c.providerId?'active':''}" data-act="use-role">
        <span class="mp-name"><i class="ph-light ph-arrows-clockwise"></i> 跟随当前房间（${escapeHtml(role.name)} ${escapeHtml(role.emoji||'🤍')}）</span>
        ${!c.providerId?'<span class="mp-mark">✓</span>':''}
      </div>
    </div>`;
    providers.forEach(p=>{
      const models=p.models&&p.models.length?p.models:(p.defaultModel?[p.defaultModel]:[]);
      if(models.length===0)return;
      html+=`<div class="model-picker-section">
        <div class="model-picker-title">${escapeHtml(p.name||'(未命名)')}</div>`;
      models.forEach(m=>{
        const active=c.providerId===p.id&&c.model===m;
        html+=`<div class="model-picker-item ${active?'active':''}" data-pid="${p.id}" data-model="${escapeHtml(m)}">
          <span class="mp-name">${escapeHtml(m)}</span>
          ${active?'<span class="mp-mark">✓</span>':''}
        </div>`;
      });
      html+=`</div>`;
    });
    html+=`<div class="model-picker-footer" data-act="manage"><i class="ph-light ph-gear"></i> 管理提供商</div>`;
    picker.innerHTML=html;
    const mask=document.createElement('div');
    mask.className='model-picker-mask';
    mask.onclick=()=>{modelPickerOpen=false;renderModelChipBar()};
    el.appendChild(mask);
    el.appendChild(picker);
    picker.querySelectorAll('.model-picker-item').forEach(it=>{
      it.onclick=()=>{
        const act=it.dataset.act;
        if(act==='use-role'){c.providerId=null;c.model=null}
        else{c.providerId=it.dataset.pid;c.model=it.dataset.model}
        modelPickerOpen=false;
        save();renderModelChipBar();
      };
    });
    picker.querySelector('[data-act="manage"]').onclick=()=>{
      modelPickerOpen=false;
      openProviderPage();
    };
  }
  const btn=el.querySelector('#mc-btn');
  if(btn)btn.onclick=()=>{modelPickerOpen=!modelPickerOpen;nudgePopoverOpen=false;renderModelChipBar()};
  const dot=el.querySelector('#nudge-dot');
  if(dot)dot.onclick=e=>{e.stopPropagation();nudgePopoverOpen=!nudgePopoverOpen;modelPickerOpen=false;renderModelChipBar()};
}
