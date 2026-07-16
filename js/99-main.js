// 99-main.js · 启动入口 + 事件绑定 + 剩余功能
// 依赖：所有 0~15 模块

function renderAttach(){
  const row=document.getElementById('attach-row');row.innerHTML='';
  pendingImages.forEach(im=>{
    const d=document.createElement('div');d.className='attach-thumb';
    d.innerHTML=`<img src="${im.dataURL||''}">${im.loading?'<div class="loading">…</div>':''}<button><i class="ph-light ph-x"></i></button>`;
    d.querySelector('button').onclick=()=>{const idx=pendingImages.indexOf(im);if(idx>-1)pendingImages.splice(idx,1);renderAttach()};
    row.appendChild(d);
  });
  const hasLoading=pendingImages.some(im=>im.loading);
  document.getElementById('btn-send').disabled=hasLoading;
}
function getMessagesOnDate(role,dateStr){
  const msgs=[];
  role.conversations.forEach(c=>{
    c.messages.forEach(m=>{
      if(m.streaming)return;
      if(dayKey(m.ts)===dateStr){msgs.push({...m,_convTitle:c.title})}
    });
  });
  msgs.sort((a,b)=>a.ts-b.ts);
  return msgs;
}
function hasMessagesOnDate(role,dateStr){
  return role.conversations.some(c=>c.messages.some(m=>!m.streaming&&dayKey(m.ts)===dateStr));
}
async function generateDaily(dateStr,opts){
  opts=opts||{};
  const r=getRole();if(!r)return;
  let daily=getDailyOfDate(r,dateStr);
  if(daily&&daily.status==='loading'){
    if(!opts.silent)showToast('正在生成中，稍等一下～');
    return;
  }
  if(!hasMessagesOnDate(r,dateStr)){
    if(!opts.silent)showToast(`${dateStr} 这天没聊天记录可以总结～`,{type:'error'});
    return;
  }
  const cfg=getDailyConfig();
  if(!cfg||!cfg.apiKey){
    if(!opts.silent)showToast('今日档案用的提供商还没配 API Key 哦',{type:'error'});
    return;
  }
  if(!daily){
    daily={id:uid(),date:dateStr,title:'',summary:'',tags:[],createdAt:Date.now(),updatedAt:Date.now(),status:'loading',edited:false};
    r.dailies.push(daily);
  }else{daily.status='loading';daily.errMsg=null}
  save();
  if(state.activeTab==='timeline')renderTimeline();

  const msgs=getMessagesOnDate(r,dateStr);
  const transcript=msgs.map(m=>{
    const who=m.role==='user'?(r.userMark||'用户'):r.name;
    let text='';
    if(m.role==='user')text=m.content||(m.images&&m.images.length?'[图片]':'');
    else text=m.displayContent!==undefined?m.displayContent:parseThinking(stripAllTags(m.content||''),'').contentAfter.trim();
    return `[${fmtTime(m.ts)}] (${m._convTitle||''}) ${who}：${text}`;
  }).join('\n');

  try{
    const content=await callNonStream(cfg,DAILY_PROMPT,`日期：${dateStr}\n\n以下是当天的聊天记录（跨所有窗口）：\n\n${transcript}\n\n请按约定格式输出JSON。`);
    let obj=null;
    try{obj=JSON.parse(content)}catch(e){
      const m=content.match(/\{[\s\S]*\}/);
      if(m){try{obj=JSON.parse(m[0])}catch(e2){}}
    }
    if(!obj||!obj.summary)throw new Error('AI没按格式返回：'+content.slice(0,150));
    daily.title=String(obj.title||'').trim().slice(0,24);
    daily.summary=String(obj.summary||'').trim();
    daily.tags=Array.isArray(obj.tags)?obj.tags.map(t=>String(t).trim().slice(0,12)).filter(Boolean).slice(0,6):[];
    daily.status='done';
    daily.updatedAt=Date.now();
    daily.errMsg=null;
    save();
    if(state.activeTab==='timeline')renderTimeline();
    if(!opts.silent){
      showToast(`${fmtDailyDate(dateStr)} 今日档案整理好啦 📅${r.signature||""}`,{
        duration:2800,actionText:'看看',
        onAction:()=>{switchTab('timeline')}
      });
    }
  }catch(err){
    daily.status='error';
    daily.errMsg=err.message;
    save();
    if(state.activeTab==='timeline')renderTimeline();
    if(!opts.silent)showToast(`今日档案整理失败：${err.message}`,{type:'error',duration:8000});
  }
}
function getUnsegmentedMsgs(conv){
  // 步骤7新增：conv自lastSegmentTs之后、还没被归纳进任何segment的消息。
  // checkAndArchiveConv 和 状态点渲染 共用同一个数据源，避免两处口径悄悄不同步。
  if(!conv)return [];
  const sinceTs=conv.lastSegmentTs||(conv.messages[0]?conv.messages[0].ts:null);
  if(sinceTs===null)return [];
  return conv.messages.filter(m=>!m.streaming&&m.ts>sinceTs);
}
function handleTopicEnd(c,topicEnd){
  const r=getRole();if(!r||!c)return;
  const sinceTs=c.lastSegmentTs||(c.messages[0]?c.messages[0].ts:Date.now());
  const msgs=c.messages.filter(m=>!m.streaming&&m.ts>sinceTs);
  if(!msgs.length)return;
  const dateStart=dayKey(msgs[0].ts),dateEnd=dayKey(msgs[msgs.length-1].ts);
  let segment=null;
  if(topicEnd.append_to)segment=r.segments.find(s=>s.id===topicEnd.append_to)||null;
  if(segment){
    if(!segment.conv_ids.includes(c.id))segment.conv_ids.push(c.id);
    if(dateEnd>segment.date_end)segment.date_end=dateEnd;
    if(dateStart<segment.date_start)segment.date_start=dateStart;
  }else{
    segment=newSegmentObj([c.id],dateStart,dateEnd,'auto');
    r.segments.push(segment);
  }
  segment.tags=Array.from(new Set([...(segment.tags||[]),...(topicEnd.tags||[])])).slice(0,4);
  segment.summary_hint=topicEnd.summary_hint||'';
  c.lastSegmentTs=msgs[msgs.length-1].ts;
  c.nudgeLevel=0;
  save();
  generateSegmentSummary(segment,msgs,{});
}
function checkAndArchiveConv(conv){
  // 步骤6：切窗口/切角色离开某个conv时的兜底摘要检查。
  // 判定：lastSegmentTs之后的消息数≥6且至少1条assistant回复才触发，不然直接丢，避免摘要碎片化。
  // 返回 true=触发了生成，false=不满足条件被跳过——供步骤7的手动归纳按钮判断该给哪种反馈。
  if(!conv)return false;
  const r=getRole();if(!r)return false;
  const msgs=getUnsegmentedMsgs(conv);
  if(msgs.length<6)return false;
  if(!msgs.some(m=>m.role==='assistant'))return false;
  const dateStart=dayKey(msgs[0].ts),dateEnd=dayKey(msgs[msgs.length-1].ts);
  const segment=newSegmentObj([conv.id],dateStart,dateEnd,'auto_switch');
  segment.summary_hint='';
  r.segments.push(segment);
  conv.lastSegmentTs=msgs[msgs.length-1].ts;
  conv.nudgeLevel=0;
  save();
  generateSegmentSummary(segment,msgs,{});
  return true;
}
function manualArchiveConv(conv){
  // 步骤7：状态点80级「让TA归纳一下」按钮走这里——跟静默版checkAndArchiveConv的区别是要给用户一个响应。
  const ok=checkAndArchiveConv(conv);
  if(ok)showToast('开始整理这段啦～',{duration:2000});
  else showToast('这段还太短，不够整理哦',{duration:2000});
  return ok;
}
function getMessagesForSegment(segment){
  const r=getRole();if(!r||!segment)return [];
  const msgs=[];
  r.conversations.forEach(c=>{
    if(segment.conv_ids&&segment.conv_ids.length&&!segment.conv_ids.includes(c.id))return;
    c.messages.forEach(m=>{
      if(m.streaming)return;
      const dk=dayKey(m.ts);
      if(dk>=segment.date_start&&dk<=segment.date_end)msgs.push(m);
    });
  });
  msgs.sort((a,b)=>a.ts-b.ts);
  return msgs;
}
async function generateSegmentSummary(segment,messages,opts){
  opts=opts||{};
  const r=getRole();if(!r||!segment)return;
  if(!messages||!messages.length){
    segment.status='error';segment.errMsg='这段没有聊天记录可以总结';
    save();
    if(!opts.silent)showToast('这段没有聊天记录可以总结～',{type:'error'});
    return;
  }
  const cfg=getSegmentConfig();
  if(!cfg||!cfg.apiKey){
    segment.status='error';segment.errMsg='滚动摘要用的提供商还没配 API Key';
    r.pendingSegmentId=segment.id;
    save();
    if(!opts.silent)showToast('滚动摘要用的提供商还没配 API Key 哦',{type:'error'});
    return;
  }
  segment.status='loading';segment.errMsg=null;
  save();
  if(state.activeTab==='timeline')renderTimeline();

  const transcript=messages.map(m=>{
    const who=m.role==='user'?(r.userMark||'用户'):r.name;
    let text='';
    if(m.role==='user')text=m.content||(m.images&&m.images.length?'[图片]':'');
    else text=m.displayContent!==undefined?m.displayContent:parseThinking(stripAllTags(m.content||''),'').contentAfter.trim();
    return `[${fmtTime(m.ts)}] ${who}：${text}`;
  }).join('\n');
  const hintLine=segment.summary_hint?`\n\nAI在标记这段话题结束时给的提示：${segment.summary_hint}`:'';

  try{
    const content=await callNonStream(cfg,SUMMARY_PROMPT,`以下是这段话题的聊天记录：\n\n${transcript}${hintLine}\n\n请按约定格式输出JSON。`);
    let obj=null;
    try{obj=JSON.parse(content)}catch(e){
      const mm=content.match(/\{[\s\S]*\}/);
      if(mm){try{obj=JSON.parse(mm[0])}catch(e2){}}
    }
    if(!obj||!obj.summary)throw new Error('AI没按格式返回：'+content.slice(0,150));
    segment.summary=String(obj.summary||'').trim();
    const aiTags=Array.isArray(obj.tags)?obj.tags.map(t=>String(t).trim().slice(0,8)).filter(Boolean):[];
    segment.tags=Array.from(new Set([...(segment.tags||[]),...aiTags])).slice(0,4);
    segment.status='pending';
    segment.updatedAt=Date.now();
    segment.errMsg=null;
    if(r.pendingSegmentId===segment.id)r.pendingSegmentId=null;
    save();
    if(state.activeTab==='timeline')renderTimeline();
    if(!opts.silent)showSegmentConfirmModal(segment);
  }catch(err){
    segment.status='error';segment.errMsg=err.message;
    r.pendingSegmentId=segment.id;
    save();
    if(state.activeTab==='timeline')renderTimeline();
    if(!opts.silent)showToast(`滚动摘要生成失败：${err.message}`,{type:'error',duration:8000});
  }
}
function maybeAutoGenerateDaily(){
  const today=dayKey(Date.now());
  if(state.lastDailyCheck===today)return;
  state.lastDailyCheck=today;
  save();
  const r=getRole();if(!r)return;
  const cfg=getDailyConfig();
  if(!cfg||!cfg.apiKey)return;
  const y=yesterdayStr();
  if(hasMessagesOnDate(r,y)&&!getDailyOfDate(r,y)){
    setTimeout(()=>{
      showToast(`${r.signature||''} 发现昨天有新聊天，正在生成今日档案…`,{duration:2500});
      generateDaily(y,{silent:false});
    },1200);
  }
}
function compressImage(file){
  return new Promise(resolve=>{
    const fr=new FileReader();
    fr.onload=()=>{
      const raw=fr.result;
      try{
        const img=new Image();
        img.onload=()=>{
          try{
            const max=1280;let w=img.width,h=img.height;
            if(w>max||h>max){const r=Math.min(max/w,max/h);w=Math.round(w*r);h=Math.round(h*r)}
            const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
            const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
            ctx.drawImage(img,0,0,w,h);
            const out=canvas.toDataURL('image/jpeg',0.85);
            resolve(out.length<raw.length?out:raw);
          }catch(e){resolve(raw)}
        };
        img.onerror=()=>resolve(raw);img.src=raw;
      }catch(e){resolve(raw)}
    };
    fr.onerror=()=>resolve(null);
    fr.readAsDataURL(file);
  });
}
function openProviderPage(){
  if(providerPageOpen)return;
  providerPageOpen=true;
  editingProviderId=null;
  renderProviderPage();
}
function closeProviderPage(){
  providerPageOpen=false;
  editingProviderId=null;
  const mask=document.getElementById('provider-page-mask');
  if(mask&&mask.parentNode)mask.parentNode.removeChild(mask);
  document.removeEventListener('keydown',providerPageKeyHandler);
  renderAll();
}
function providerPageKeyHandler(e){
  if(e.key==='Escape'&&!editingProviderId){e.preventDefault();closeProviderPage()}
}
function renderProviderPage(){
  let mask=document.getElementById('provider-page-mask');
  if(!mask){
    mask=document.createElement('div');
    mask.id='provider-page-mask';
    mask.className='provider-page-mask';
    mask.innerHTML=`<div class="provider-page">
      <div class="provider-page-head">
        <h3><i class="ph-light ph-gear"></i> 提供商管理</h3>
        <button id="pp-close"><i class="ph-light ph-x"></i></button>
      </div>
      <div class="provider-page-body" id="pp-body"></div>
    </div>`;
    document.body.appendChild(mask);
    document.addEventListener('keydown',providerPageKeyHandler);
    mask.querySelector('#pp-close').onclick=closeProviderPage;
    mask.onclick=e=>{if(e.target===mask&&!editingProviderId)closeProviderPage()};
  }
  const body=mask.querySelector('#pp-body');
  body.innerHTML='';
  const secA=document.createElement('div');secA.className='provider-page-section';
  secA.innerHTML=`<div class="provider-page-section-title"><i class="ph-light ph-package"></i> 提供商列表</div>`;
  const bar=document.createElement('div');bar.className='provider-page-bar';
  bar.innerHTML=`<button class="add-btn" id="pp-add"><i class="ph-light ph-plus"></i> 新建提供商</button>
    <span class="count">共 ${settings.providers.length} 个</span>`;
  secA.appendChild(bar);
  bar.querySelector('#pp-add').onclick=()=>{
    editingProviderId='__new__';
    renderProviderPage();
  };
  if(editingProviderId==='__new__'){
    secA.appendChild(renderProviderForm(null));
  }
  if(settings.providers.length===0&&editingProviderId!=='__new__'){
    const e=document.createElement('div');e.className='provider-page-empty';
    e.innerHTML=`<span class="emoji"><i class="ph-light ph-plug" style="font-size:32px"></i></span>还没有配置任何提供商～<br>点「＋ 新建提供商」加一个吧`;
    secA.appendChild(e);
  }else{
    settings.providers.forEach(p=>{
      if(editingProviderId===p.id)secA.appendChild(renderProviderForm(p));
      else secA.appendChild(renderProviderCard(p));
    });
  }
  body.appendChild(secA);
  if(settings.providers.length>0){
    const secB=document.createElement('div');secB.className='provider-page-section';
    secB.innerHTML=`<div class="provider-page-section-title"><i class="ph-light ph-user"></i> 房间 → 提供商绑定</div>`;
    state.roles.forEach(role=>{
      const row=document.createElement('div');
      row.className='role-binding-row'+(!role.providerId?' unbound':'');
      const provOptions=settings.providers.map(p=>`<option value="${p.id}"${role.providerId===p.id?' selected':''}>${escapeHtml(p.name||'(未命名)')}</option>`).join('');
      const curProv=getProvider(role.providerId);
      const modelOptions=['<option value="">默认</option>'];
      if(curProv){
        const list=curProv.models&&curProv.models.length?curProv.models:(curProv.defaultModel?[curProv.defaultModel]:[]);
        list.forEach(m=>modelOptions.push(`<option value="${escapeHtml(m)}"${role.model===m?' selected':''}>${escapeHtml(m)}</option>`));
      }
      row.innerHTML=`<div class="rb-head">
          <span class="rb-name">${escapeHtml(role.emoji||'')} ${escapeHtml(role.name)}</span>
          ${role.providerId?'<span class="rb-bind">已绑定</span>':'<span class="rb-warn">⚠️ 未绑定</span>'}
        </div>
        <select data-rid="${role.id}" data-field="provider"><option value="">— 请选择 —</option>${provOptions}</select>
        ${curProv?`<select data-rid="${role.id}" data-field="model">${modelOptions.join('')}</select>`:''}
        <div class="rb-info">${curProv?`使用：<b>${escapeHtml(curProv.name)}</b> · ${escapeHtml(role.model||curProv.defaultModel||'(默认)')}`:'<span style="color:var(--danger-deep)">没绑定就没法聊天哦</span>'}</div>`;
      row.querySelector('[data-field="provider"]').onchange=e=>{
        const newProv=e.target.value||null;
        role.providerId=newProv;
        const np=getProvider(newProv);
        role.model=np?(np.defaultModel||(np.models&&np.models[0])||null):null;
        save();renderProviderPage();renderAll();
      };
      const modelSel=row.querySelector('[data-field="model"]');
      if(modelSel)modelSel.onchange=e=>{role.model=e.target.value||null;save();renderProviderPage();renderAll()};
      secB.appendChild(row);
    });
    body.appendChild(secB);
  }
  if(settings.providers.length>0){
    const secC=document.createElement('div');secC.className='provider-page-section';
    secC.innerHTML=`<div class="provider-page-section-title"><i class="ph-light ph-target"></i> 用途绑定</div>`;
    USAGE_KEYS.forEach(u=>{
      const row=document.createElement('div');row.className='usage-row';
      const curBinding=(settings.usageBindings||{})[u.key]||'role';
      const options=[`<option value="role"${curBinding==='role'?' selected':''}><i class="ph-light ph-arrows-clockwise"></i> 跟随当前房间</option>`];
      settings.providers.forEach(p=>{
        options.push(`<option value="${p.id}"${curBinding===p.id?' selected':''}>${escapeHtml(p.name||'(未命名)')}</option>`);
      });
      row.innerHTML=`<div class="usage-row-label"><b>${u.label}</b><span class="sub">${u.sub}</span></div>
        <select data-usage="${u.key}">${options.join('')}</select>`;
      row.querySelector('select').onchange=e=>{
        if(!settings.usageBindings)settings.usageBindings={};
        settings.usageBindings[u.key]=e.target.value;
        saveSettings();
      };
      secC.appendChild(row);
    });
    body.appendChild(secC);
  }
}
function renderProviderCard(p){
  const boundRoles=state.roles.filter(r=>r.providerId===p.id);
  const isBound=boundRoles.length>0;
  const card=document.createElement('div');
  card.className='provider-card'+(isBound?' bound':'');
  const masked=p.apiKey?p.apiKey.slice(0,6)+'***'+p.apiKey.slice(-4):'(未填)';
  const modelsList=(p.models||[]).slice(0,8).map(m=>`<span class="pcm-chip">${escapeHtml(m)}</span>`).join('');
  const moreModels=(p.models||[]).length>8?`<span class="pcm-chip">+${(p.models||[]).length-8}</span>`:'';
  const badge=isBound?`<span class="provider-card-badge"><i class="ph-light ph-user"></i> ${boundRoles.map(r=>(r.emoji||'')+r.name).join(' / ')}</span>`:'';
  const formatBadge=p.apiFormat==='anthropic'?`<span class="provider-card-badge" style="background:var(--mint-soft);color:var(--mint-deep)"><i class="ph-light ph-lightning"></i> 原生/messages</span>`:'';
  card.innerHTML=`
    <div class="provider-card-head">
      <span class="provider-card-name">${escapeHtml(p.name||'(未命名)')}</span>
      ${badge}${formatBadge}
    </div>
    <div class="provider-card-info">
      <div><span class="pc-label">Base:</span><code>${escapeHtml(p.baseUrl||'(未填)')}</code></div>
      <div><span class="pc-label">Key:</span><code>${escapeHtml(masked)}</code></div>
      <div><span class="pc-label">默认模型:</span><code>${escapeHtml(p.defaultModel||'(未填)')}</code></div>
      ${p.note?`<div><span class="pc-label">备注:</span>${escapeHtml(p.note)}</div>`:''}
    </div>
    ${modelsList?`<div class="provider-card-models">${modelsList}${moreModels}</div>`:''}
    <div class="provider-card-actions">
      <button data-act="edit"><i class="ph-light ph-pencil-simple"></i> 编辑</button>
      <button class="danger" data-act="del"><i class="ph-light ph-trash"></i> 删除</button>
    </div>`;
  card.querySelector('[data-act="edit"]').onclick=()=>{editingProviderId=p.id;renderProviderPage()};
  card.querySelector('[data-act="del"]').onclick=()=>{
    const usedBy=boundRoles.length;
    const usedByConvs=[];
    state.roles.forEach(r=>r.conversations.forEach(c=>{if(c.providerId===p.id)usedByConvs.push(c)}));
    showModal(`<h3>删除这个提供商？</h3>
      <div style="line-height:1.7;color:var(--ink-2)">「${escapeHtml(p.name)}」<br><br>${usedBy>0?`<b style="color:var(--danger-deep)">⚠️ 有 ${usedBy} 个角色绑定了它</b>，删除后这些角色会变成"未绑定"状态，需要手动重新绑。<br><br>`:''}${usedByConvs.length>0?`另外有 ${usedByConvs.length} 个窗口级模型选择会被清空。<br><br>`:''}不可恢复</div>`,()=>{
      settings.providers=settings.providers.filter(x=>x.id!==p.id);
      Object.keys(settings.usageBindings||{}).forEach(k=>{if(settings.usageBindings[k]===p.id)settings.usageBindings[k]='role'});
      state.roles.forEach(r=>{
        if(r.providerId===p.id){r.providerId=null;r.model=null}
        r.conversations.forEach(c=>{if(c.providerId===p.id){c.providerId=null;c.model=null}});
      });
      saveSettings();save();renderProviderPage();renderAll();
      showToast('已删除',{duration:1500});
    },'删除','danger');
  };
  return card;
}
function renderProviderForm(p){
  const isNew=!p;
  const form=document.createElement('div');form.className='provider-form';
  const formData={
    id:p?.id||uid(),
    name:p?.name||'',
    baseUrl:p?.baseUrl||'',
    apiKey:p?.apiKey||'',
    defaultModel:p?.defaultModel||'',
    models:p?.models?[...p.models]:[],
    reasoningEffort:p?.reasoningEffort||'off',
    apiFormat:p?.apiFormat||'openai',
    note:p?.note||'',
    keyShown:false
  };
  const presetHtml=PROVIDER_PRESETS.map(ps=>`<span class="ps-chip" data-preset="${ps.key}">${escapeHtml(ps.name)}</span>`).join('');
  form.innerHTML=`
    <div class="provider-form-title">${isNew?'<i class="ph-light ph-sparkle"></i> 新建提供商':'<i class="ph-light ph-pencil-simple"></i> 编辑：'+escapeHtml(p.name||'(未命名)')}</div>
    <label>快速选预设（会填充 Base 和默认模型）</label>
    <div class="preset-row">${presetHtml}</div>
    <label>名字 <span style="color:var(--ink-3)">（自己取个好记的）</span></label>
    <input id="pf-name" value="${escapeHtml(formData.name)}" placeholder="比如：OpenAI 主号 / DS 备用">
    <label>Base URL</label>
    <input id="pf-base" value="${escapeHtml(formData.baseUrl)}" placeholder="https://api.openai.com/v1">
    <label>API Key</label>
    <div class="row-key">
      <input id="pf-key" type="password" value="${escapeHtml(formData.apiKey)}" placeholder="sk-...">
      <button id="pf-key-toggle" type="button"><i class="ph-light ph-eye"></i></button>
    </div>
    <label>默认模型</label>
    <div class="row-model">
      <input id="pf-model" value="${escapeHtml(formData.defaultModel)}" placeholder="gpt-4o-mini">
      <button id="pf-fetch" type="button"><i class="ph-light ph-arrows-clockwise"></i> 拉取模型列表</button>
    </div>
    <label>模型池（点击选作默认；从拉取结果里选）</label>
    <div class="models-pool" id="pf-pool">
      ${formData.models.length===0?'<div class="models-pool-empty">还没有模型，点上面「🔄 拉取」拉一下</div>':formData.models.map(m=>`<span class="mp-chip${m===formData.defaultModel?' active':''}" data-model="${escapeHtml(m)}">${escapeHtml(m)}</span>`).join('')}
    </div>
    <label>推理强度 <span style="color:var(--ink-3)">（开启后会让模型多思考一会儿，部分中转可能不支持）</span></label>
    <select id="pf-reasoning">
      <option value="off"${formData.reasoningEffort==='off'?' selected':''}>关闭</option>
      <option value="auto"${formData.reasoningEffort==='auto'?' selected':''}>自动</option>
      <option value="low"${formData.reasoningEffort==='low'?' selected':''}>低</option>
      <option value="medium"${formData.reasoningEffort==='medium'?' selected':''}>中</option>
      <option value="high"${formData.reasoningEffort==='high'?' selected':''}>高</option>
    </select>
    <label>请求格式 <span style="color:var(--ink-3)">（实验性：原生格式才可能真正命中缓存，但风险更高，出问题就切回兼容）</span></label>
    <select id="pf-format">
      <option value="openai"${formData.apiFormat==='openai'?' selected':''}>OpenAI兼容（/chat/completions，默认，最稳）</option>
      <option value="anthropic"${formData.apiFormat==='anthropic'?' selected':''}>Anthropic原生（/messages，支持cache_control）</option>
    </select>
    <label>备注（可留空）</label>
    <textarea id="pf-note" rows="1" placeholder="有空写两句，比如：次数多的时候用这个">${escapeHtml(formData.note)}</textarea>
    <div class="provider-form-actions">
      <button data-act="cancel">取消</button>
      <button class="primary" data-act="save">保存</button>
    </div>`;
  const refreshPool=()=>{
    const pool=form.querySelector('#pf-pool');
    if(formData.models.length===0){
      pool.innerHTML='<div class="models-pool-empty">还没有模型，点上面「🔄 拉取」拉一下</div>';
    }else{
      pool.innerHTML=formData.models.map(m=>`<span class="mp-chip${m===formData.defaultModel?' active':''}" data-model="${escapeHtml(m)}">${escapeHtml(m)}</span>`).join('');
      pool.querySelectorAll('.mp-chip').forEach(chip=>{
        chip.onclick=()=>{
          formData.defaultModel=chip.dataset.model;
          form.querySelector('#pf-model').value=formData.defaultModel;
          refreshPool();
        };
      });
    }
  };
  refreshPool();
  form.querySelectorAll('.ps-chip').forEach(chip=>{
    chip.onclick=()=>{
      const ps=PROVIDER_PRESETS.find(x=>x.key===chip.dataset.preset);
      if(!ps)return;
      if(!formData.name)form.querySelector('#pf-name').value=ps.name;
      if(ps.baseUrl)form.querySelector('#pf-base').value=ps.baseUrl;
      if(ps.defaultModel)form.querySelector('#pf-model').value=ps.defaultModel;
      showToast(`已套用预设：${ps.name}`,{duration:1500});
    };
  });
  const keyInput=form.querySelector('#pf-key');
  form.querySelector('#pf-key-toggle').onclick=()=>{
    formData.keyShown=!formData.keyShown;
    keyInput.type=formData.keyShown?'text':'password';
  };
  const fetchBtn=form.querySelector('#pf-fetch');
  fetchBtn.onclick=async ()=>{
    const baseUrl=form.querySelector('#pf-base').value.trim();
    const apiKey=form.querySelector('#pf-key').value.trim();
    if(!baseUrl){showToast('先填 Base URL～',{type:'error'});return}
    if(!apiKey){showToast('先填 API Key～',{type:'error'});return}
    fetchBtn.disabled=true;fetchBtn.innerHTML='<i class="ph-light ph-spinner"></i> 拉取中…';
    try{
      const list=await fetchModelList(baseUrl,apiKey);
      if(!list||list.length===0){showToast('拉到空列表～',{type:'error',duration:5000});return}
      formData.models=list;refreshPool();
      showToast(`拉到 ${list.length} 个模型`,{duration:2000});
    }catch(err){showToast('拉取失败：'+err.message,{type:'error',duration:8000})}
    finally{fetchBtn.disabled=false;fetchBtn.innerHTML='<i class="ph-light ph-arrows-clockwise"></i> 拉取模型列表'}
  };
  form.querySelector('[data-act="cancel"]').onclick=()=>{editingProviderId=null;renderProviderPage()};
  form.querySelector('[data-act="save"]').onclick=()=>{
    const name=form.querySelector('#pf-name').value.trim();
    const baseUrl=form.querySelector('#pf-base').value.trim();
    const apiKey=form.querySelector('#pf-key').value.trim();
    const defaultModel=form.querySelector('#pf-model').value.trim();
    const note=form.querySelector('#pf-note').value.trim();
    const reasoningEffort=form.querySelector('#pf-reasoning').value;
    const apiFormat=form.querySelector('#pf-format').value;
    if(!name){showToast('名字不能为空～');return}
    if(!baseUrl){showToast('Base URL 不能为空～');return}
    const data={id:formData.id,name,baseUrl,apiKey,defaultModel,models:formData.models||[],reasoningEffort,apiFormat,note,createdAt:p?p.createdAt:Date.now()};
    if(isNew){settings.providers.push(data)}
    else{const idx=settings.providers.findIndex(x=>x.id===p.id);if(idx>=0)settings.providers[idx]=data}
    editingProviderId=null;saveSettings();renderProviderPage();renderAll();
    showToast(isNew?'已创建 🔌':'已保存',{duration:1500});
  };
  return form;
}
function renderAll(){renderRoleBar();renderConvList();renderChat();renderContextBar();renderTimeline();renderAttach();renderTodoPanel();if(state.activeTab==='box')renderBox()}
function switchTab(name){
  state.activeTab=name;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.toggle('active',p.dataset.tab===name));
  if(name==='timeline')renderTimeline();
  else if(name==='box')renderBox();
  save();
}
function openDrawer(side){document.getElementById('col-'+side).classList.add('show');document.getElementById('mask').classList.add('show')}
function closeDrawers(){document.querySelectorAll('.col-left,.col-right').forEach(d=>d.classList.remove('show'));document.getElementById('mask').classList.remove('show')}
function scheduleReply(){
  cancelReply();
  const ms=Math.max(1,settings.replyDelayMin)*60*1000;
  replyDeadline=Date.now()+ms;
  document.getElementById('countdown').classList.remove('hidden');
  updateCountdown();cdInterval=setInterval(updateCountdown,1000);
  replyTimer=setTimeout(triggerReply,ms);
}
function cancelReply(){
  if(replyTimer){clearTimeout(replyTimer);replyTimer=null}
  if(cdInterval){clearInterval(cdInterval);cdInterval=null}
  document.getElementById('countdown').classList.add('hidden');
}
function updateCountdown(){
  const left=Math.max(0,replyDeadline-Date.now());
  const m=Math.floor(left/60000),s=Math.floor((left%60000)/1000);
  document.getElementById('cd-time').textContent=`${m}:${String(s).padStart(2,'0')}`;
}
async function triggerReply(){
  cancelReply();const c=getConv();if(!c)return;
  let need=false;
  for(let i=c.messages.length-1;i>=0;i--){if(c.messages[i].role==='assistant')break;if(c.messages[i].role==='user'){need=true;break}}
  if(!need)return;
  const cfg=getActiveConfig(c);
  if(!cfg||!cfg.apiKey){showToast('当前房间还没绑提供商或 Key 没填',{type:'error'});return}
  const aiMsg={id:uid(),role:'assistant',content:'',reasoningContent:'',displayContent:'',thinking:null,images:[],ts:Date.now(),streaming:true};
  c.messages.push(aiMsg);renderChat();
  let hadError=null;
  try{await callOpenAIStream(c,aiMsg)}catch(err){hadError=err}
  const finalize=()=>{
    const {thinking,cleaned,suggests,savedLetters,savedDiaries,savedMemos,topicEnd}=extractAll(aiMsg.content,{autoSave:true,msgId:aiMsg.id,reasoningContent:aiMsg.reasoningContent||''});
    aiMsg.thinking=thinking;aiMsg.displayContent=cleaned;
    if(suggests.length)aiMsg.memSuggests=suggests;
    if(savedLetters&&savedLetters.length)aiMsg.savedLetterRefs=savedLetters.map(l=>({id:l.id,title:l.title}));
    if(savedDiaries&&savedDiaries.length)aiMsg.savedDiaryRefs=savedDiaries.map(d=>({id:d.id,length:(d.content||'').length}));
    if(savedMemos&&savedMemos.length)aiMsg.savedMemoRefs=savedMemos.map(mm=>({id:mm.id,title:mm.title}));
    delete aiMsg.streaming;
    const role=getRole();if(role){role.lastAiReplyTs=aiMsg.ts;}
    return {savedLetters,savedDiaries,savedMemos,topicEnd};
  };
  const isAborted=hadError&&(hadError.name==='AbortError'||/aborted/i.test(hadError.message||''));
  if(hadError&&!isAborted){
    if((!aiMsg.content||!aiMsg.content.trim())&&(!aiMsg.reasoningContent||!aiMsg.reasoningContent.trim())){
      const idx=c.messages.findIndex(x=>x.id===aiMsg.id);
      if(idx>=0)c.messages.splice(idx,1);
    }else finalize();
    save();renderChat();
    showToast(`${r.name}回复失败：`+hadError.message,{type:'error',duration:8000});
    return;
  }
  if(isAborted){
    if((!aiMsg.content||!aiMsg.content.trim())&&(!aiMsg.reasoningContent||!aiMsg.reasoningContent.trim())){
      const idx=c.messages.findIndex(x=>x.id===aiMsg.id);
      if(idx>=0)c.messages.splice(idx,1);
    }else{finalize();aiMsg.interrupted=true}
    save();renderChat();
    showToast('已停止生成',{duration:1500});
    return;
  }
  const {savedLetters,savedDiaries,savedMemos,topicEnd}=finalize();
  save();renderChat();
  if(savedMemos&&savedMemos.length)showToast(`📓 ${r.name}收进共享备忘录《${savedMemos[0].title}》～`,{duration:2800,actionText:'看看',onAction:()=>{switchTab('box');state.boxTab='memo';save();renderBox()}});
  if(savedLetters&&savedLetters.length)showToast(`✉️ ${r.name}写了一封信《${savedLetters[0].title}》给你～`,{duration:2800,actionText:'去信箱',onAction:()=>{switchTab('box');state.boxTab='letter';save();renderBox()}});
  if(savedDiaries&&savedDiaries.length)showToast(`📓 ${r.name}写了一篇日记～`,{duration:2800,actionText:'去日记本',onAction:()=>{switchTab('box');state.boxTab='diary';save();renderBox()}});
  if(topicEnd)handleTopicEnd(c,topicEnd);
}
function sendUserMessage(){
  if(pendingImages.some(im=>im.loading)){showToast('图片还在处理，等一下下');return}
  const ta=document.getElementById('input-text');
  const text=ta.value.trim();if(!text&&pendingImages.length===0)return;
  let c=getConv();if(!c){newConversation();c=getConv()}
  const userMsg={id:uid(),role:'user',content:text,images:pendingImages.map(p=>p.dataURL).filter(Boolean),ts:Date.now()};
  c.messages.push(userMsg);
  if(c.title==='新窗口'&&text)c.title=text.slice(0,18);
  ta.value='';ta.style.height='auto';pendingImages=[];
  openActionMsgId=null;editingMsgId=null;
  save();renderAll();switchTab('chat');scheduleReply();
}
function switchActiveConv(convId,opts){
  // 步骤6：统一的"切换conv"入口，所有会改 r.activeConvId 的地方都应该走这里，
  // 而不是直接赋值——这样离开旧conv时的归档检查不会漏。
  opts=opts||{};
  const r=getRole();if(!r)return;
  const oldConv=getConv();
  if(!opts.skipArchiveCheck&&oldConv&&oldConv.id!==convId)checkAndArchiveConv(oldConv);
  r.activeConvId=convId;
  if(opts.unarchive){
    const nc=r.conversations.find(x=>x.id===convId);
    if(nc)nc.archived=false;
  }
  openActionMsgId=null;editingMsgId=null;modelPickerOpen=false;
  save();renderAll();
  if(opts.closeDrawers)closeDrawers();
  if(opts.switchToChat)switchTab('chat');
}
function switchActiveRole(newRoleId,opts){
  // 步骤6：统一的"切换role"入口。跟switchActiveConv语义分开——
  // 这里检查的是"旧role当前激活的conv"，不是"旧role"本身。
  opts=opts||{};
  const oldRole=getRole();
  const oldConv=oldRole?oldRole.conversations.find(c=>c.id===oldRole.activeConvId):null;
  if(!opts.skipArchiveCheck&&oldConv)checkAndArchiveConv(oldConv);
  state.activeRoleId=newRoleId;
  save();renderAll();
}
function newConversation(){
  const r=getRole();if(!r)return;
  const c=newConvObj('新窗口','💬',false);
  r.conversations.unshift(c);
  switchActiveConv(c.id,{closeDrawers:true});
}
function openFullscreenEdit(){
  if(fsEditOpen)return;
  fsEditOpen=true;
  const ta=document.getElementById('input-text');
  const initialValue=ta.value;
  const mask=document.createElement('div');mask.className='fs-edit-mask';
  mask.innerHTML=`
    <div class="fs-edit">
      <div class="fs-edit-head">
        <h3><i class="ph-light ph-arrows-out"></i> 放大编辑</h3>
        <button id="fs-close" title="关闭"><i class="ph-light ph-x"></i></button>
      </div>
      <div class="fs-edit-body">
        <textarea id="fs-ta" placeholder="慢慢写，写完发送～"></textarea>
      </div>
      <div class="fs-edit-foot">
        <span class="fs-edit-count" id="fs-count">0 字</span>
        <button class="ghost" id="fs-draft">取消</button>
        <button id="fs-save">保存返回</button>
        <button class="primary" id="fs-send">发送</button>
      </div>
    </div>`;
  document.body.appendChild(mask);
  const fsTa=mask.querySelector('#fs-ta');const cnt=mask.querySelector('#fs-count');
  fsTa.value=initialValue;
  const updateCount=()=>{cnt.textContent=fsTa.value.length+' 字'};
  updateCount();fsTa.addEventListener('input',updateCount);
  setTimeout(()=>fsTa.focus(),30);
  const close=(action)=>{
    if(!fsEditOpen)return;
    fsEditOpen=false;
    const val=fsTa.value;
    if(action==='save'){ta.value=val;ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,140)+'px'}
    else if(action==='send'){ta.value=val;ta.style.height='auto'}
    else if(action==='cancel')ta.value=initialValue;
    if(mask.parentNode)mask.parentNode.removeChild(mask);
    document.removeEventListener('keydown',keyHandler);
    if(action==='send')sendUserMessage();
  };
  const keyHandler=(e)=>{
    if(e.key==='Escape'){e.preventDefault();close('save')}
    else if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();close('send')}
  };
  document.addEventListener('keydown',keyHandler);
  mask.querySelector('#fs-close').onclick=()=>close('save');
  mask.querySelector('#fs-draft').onclick=()=>{if(fsTa.value!==initialValue){if(!confirm('取消会丢掉这次改动，确定吗？'))return}close('cancel')};
  mask.querySelector('#fs-save').onclick=()=>close('save');
  mask.querySelector('#fs-send').onclick=()=>close('send');
}
function openSettings(){
  closeDrawers();const r=getRole();
  const html=`<h3><i class="ph-light ph-gear"></i> 房间设置</h3>
    <label>当前房间名（${escapeHtml(r.emoji||'')}）</label>
    <input id="s-aname" value="${escapeHtml(r.name)}">
    <label>AI 标志 <span style="color:var(--ink-3);font-size:12px">（选填，比如 🤍）</span></label>
    <input id="s-signature" value="${escapeHtml(r.signature||'')}" maxlength="8">
    <label>我的标志 <span style="color:var(--ink-3);font-size:12px">（选填，比如 🥔）</span></label>
    <input id="s-usermark" value="${escapeHtml(r.userMark||'')}" maxlength="8">
    <label>配对标志 <span style="color:var(--ink-3);font-size:12px">（选填，比如 🤍🥔）</span></label>
    <input id="s-pairmark" value="${escapeHtml(r.pairMark||'')}" maxlength="16">
    <label><i class="ph-light ph-plug"></i> 房间电路 · 提供商管理</label>
    <div style="background:var(--cream-2);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.8;color:var(--ink-2)">
      ${settings.providers.length>0?`当前有 <b style="color:var(--amber-deep)">${settings.providers.length}</b> 个提供商`:'<span style="color:var(--danger-deep)">还没配置任何提供商</span>'}
      <br>当前房间绑定：<b>${r.providerId?escapeHtml((getProvider(r.providerId)||{}).name||'(已失效)'):'⚠️ 未绑定'}</b>
      <br>
      <button type="button" id="s-manage" style="background:var(--amber);color:#fff;border:none;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:12px;margin-top:6px;font-weight:500"><i class="ph-light ph-plug"></i> 打开提供商管理页 →</button>
    </div>
    <label>静默几分钟后自动回复</label>
    <input id="s-delay" type="number" min="1" max="30" value="${settings.replyDelayMin}">
    <label><input type="checkbox" id="s-inject" style="width:auto;margin-right:6px"${settings.dailyInjectEnabled?' checked':''}><i class="ph-light ph-paperclip"></i> 给${r.name}注入历史摘要作为前情（共享备忘录不受此开关影响，一直会给）</label>
    <label>注入最近几天的历史摘要（置顶的不受此限制，一直给）</label>
    <input id="s-inject-days" type="number" min="1" max="30" value="${settings.segmentInjectDays}">
    <label><input type="checkbox" id="s-cachectrl" style="width:auto;margin-right:6px"${settings.cacheControlEnabled?' checked':''}><i class="ph-light ph-lightning"></i> 实验性：请求里带上 cache_control 标记（能不能省钱取决于渠道支不支持，开着也不会导致聊天出错）</label>
    <label>当前房间 · 常驻人设</label>
    <textarea id="s-sys" rows="5">${escapeHtml(r.systemPrompt)}</textarea>
    <div class="warn">⚠️ <b>API Key 安全提示</b>：Key 明文存浏览器，别在公共设备用。</div>
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--line)">
    <button type="button" id="s-delete-role" style="background:var(--danger,#e53e3e);color:#fff;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;font-size:13px;width:100%"><i class="ph-light ph-trash"></i> 删除这个房间</button>`;
  showModal(html,()=>{
    r.name=document.getElementById('s-aname').value.trim()||r.name;
    r.signature=document.getElementById('s-signature').value.trim();
    r.userMark=document.getElementById('s-usermark').value.trim();
    r.pairMark=document.getElementById('s-pairmark').value.trim();
    r.systemPrompt=document.getElementById('s-sys').value;
    settings.replyDelayMin=parseInt(document.getElementById('s-delay').value)||2;
    settings.dailyInjectEnabled=document.getElementById('s-inject').checked;
    settings.segmentInjectDays=Math.max(1,Math.min(30,parseInt(document.getElementById('s-inject-days').value)||14));
    settings.cacheControlEnabled=document.getElementById('s-cachectrl').checked;
    save();saveSettings();renderAll();
  });
  setTimeout(()=>{
    const mg=document.getElementById('s-manage');
    if(mg)mg.onclick=()=>{
      const masks=document.querySelectorAll('.modal-mask');
      masks.forEach(m=>{if(m.parentNode)m.parentNode.removeChild(m)});
      openProviderPage();
    };
    const delBtn=document.getElementById('s-delete-role');
    if(delBtn)delBtn.onclick=()=>{
      if(state.roles.length<=1){showToast('至少保留一个房间',{type:'error'});return}
      const roleId=r.id;const roleName=r.name;
      const convCount=r.conversations.length;
      const memCount=r.entries.length;
      showModal(`<h3><i class="ph-light ph-trash"></i> 删除房间「${escapeHtml(roleName)}」</h3>
        <div style="line-height:1.8;color:var(--ink-2)">
          将一起删除：<br>
          · ${convCount} 个对话窗口<br>
          · ${memCount} 条记忆<br>
          · 所有信、日记、待办、备忘录<br><br>
          <b style="color:var(--danger,#e53e3e)">不可恢复，确认删除？</b>
        </div>`,()=>{
        const idx=state.roles.findIndex(x=>x.id===roleId);
        if(idx===-1)return;
        state.roles.splice(idx,1);
        const nextRole=state.roles[Math.max(0,idx-1)];
        switchActiveRole(nextRole.id,{skipArchiveCheck:true});
        showToast(`已删除房间「${escapeHtml(roleName)}」`);
      },'确认删除','danger');
      // 改确认按钮颜色
      setTimeout(()=>{
        const okBtn=document.querySelector('.modal-mask [data-ok]');
        if(okBtn)okBtn.style.cssText='background:var(--danger,#e53e3e);color:#fff;border-color:var(--danger,#e53e3e)';
      },10);
    };
  },50);
}
function exportData(){
  const r=getRole();if(!r)return;
  const data={version:'luma-1.11.0',role:r,exportedAt:Date.now()};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=`luma_${r.name}_${new Date().toISOString().slice(0,10)}.json`;a.click();
}
function importData(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const j=JSON.parse(reader.result);const role=j.role||j;
      if(!role.id||!role.conversations){showToast('文件格式不对哦～',{type:'error'});return}
      if(!role.entries)role.entries=[];
      if(!role.todos)role.todos=[];
      if(!role.memos)role.memos=[];
      if(!role.bookmarks)role.bookmarks=[];
      if(!role.dailies)role.dailies=[];
      if(!role.healthItems)role.healthItems=[];
      if(!role.periods)role.periods=[];
      if(!role.letters)role.letters=[];
      if(!role.diaries)role.diaries=[];
      if(typeof role.signature==='undefined')role.signature=role.emoji||'';
      if(typeof role.userMark==='undefined')role.userMark='';
      if(typeof role.pairMark==='undefined')role.pairMark='';
      if(typeof role.providerId==='undefined')role.providerId=null;
      if(typeof role.model==='undefined')role.model=null;
      role.memos.forEach(m=>{if(typeof m.shared==='undefined')m.shared=false;if(typeof m.title==='undefined')m.title=''});
      // 🆕 建映射表
      const convIdMap={},msgIdMap={};
      role.id=uid();
      role.conversations.forEach(c=>{
        const oldId=c.id;c.id=uid();convIdMap[oldId]=c.id;
        (c.messages||[]).forEach(m=>{
          const oldMid=m.id;m.id=uid();msgIdMap[oldMid]=m.id;
        });
      });
      // 🆕 回填 entries 的引用
      role.entries.forEach(e=>{
        e.id=uid();
        if(e.sourceConvId&&convIdMap[e.sourceConvId])e.sourceConvId=convIdMap[e.sourceConvId];
        else if(e.sourceConvId&&!convIdMap[e.sourceConvId]){e.sourceConvId=null;e.sourceMsgId=null}
        if(e.sourceMsgId&&msgIdMap[e.sourceMsgId])e.sourceMsgId=msgIdMap[e.sourceMsgId];
        else if(e.sourceMsgId&&!msgIdMap[e.sourceMsgId])e.sourceMsgId=null;
        (e.comments||[]).forEach(c=>c.id=uid());
      });
      role.todos.forEach(t=>{
        t.id=uid();
        (t.history||[]).forEach(h=>{if(h.sourceMsgId&&msgIdMap[h.sourceMsgId])h.sourceMsgId=msgIdMap[h.sourceMsgId]});
      });
      role.memos.forEach(m=>{
        m.id=uid();
        if(m.sourceMsgId&&msgIdMap[m.sourceMsgId])m.sourceMsgId=msgIdMap[m.sourceMsgId];
        else if(m.sourceMsgId)m.sourceMsgId=null;
        (m.comments||[]).forEach(c=>c.id=uid());
      });
      // 🆕 回填 bookmarks 的引用
      role.bookmarks.forEach(b=>{
        b.id=uid();
        if(b.convId&&convIdMap[b.convId])b.convId=convIdMap[b.convId];
        else b.convId=null;
        if(b.msgId&&msgIdMap[b.msgId])b.msgId=msgIdMap[b.msgId];
        else b.msgId=null;
      });
      role.dailies.forEach(d=>d.id=uid());
      role.healthItems.forEach(h=>h.id=uid());
      role.periods.forEach(p=>p.id=uid());
      (role.letters||[]).forEach(l=>{
        l.id=uid();
        if(l.sourceMsgId&&msgIdMap[l.sourceMsgId])l.sourceMsgId=msgIdMap[l.sourceMsgId];
        else if(l.sourceMsgId)l.sourceMsgId=null;
        (l.replies||[]).forEach(rp=>rp.id=uid());
      });
      (role.diaries||[]).forEach(d=>{
        d.id=uid();
        if(d.sourceMsgId&&msgIdMap[d.sourceMsgId])d.sourceMsgId=msgIdMap[d.sourceMsgId];
        else if(d.sourceMsgId)d.sourceMsgId=null;
      });
      // 🆕 活跃窗口指针也跟着映射
      if(role.activeConvId&&convIdMap[role.activeConvId])role.activeConvId=convIdMap[role.activeConvId];
      else role.activeConvId=role.conversations[0]?.id||null;
      state.roles.push(role);
      switchActiveRole(role.id);
      showToast(`已导入角色「${role.name}」跳转链接已同步`,{duration:2500});
    }catch(e){showToast('导入失败：'+e.message,{type:'error',duration:8000})}
  };
  reader.readAsText(file);
}
const ta=document.getElementById('input-text');
document.getElementById('btn-menu').onclick=()=>openDrawer('left');
document.getElementById('btn-right').onclick=()=>openDrawer('right');
document.getElementById('mask').onclick=closeDrawers;
document.getElementById('btn-new').onclick=newConversation;
document.getElementById('btn-settings').onclick=openSettings;
document.getElementById('btn-export').onclick=exportData;
document.getElementById('btn-import').onclick=()=>document.getElementById('file-import').click();
document.getElementById('btn-search-top').onclick=openSearch;
window.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();openSearch()}});
document.getElementById('file-import').onchange=e=>{const f=e.target.files[0];if(f)importData(f);e.target.value=''};
document.getElementById('btn-pick-img').onclick=()=>document.getElementById('file-img').click();
document.getElementById('btn-todo-add').onclick=todoAdd;
document.getElementById('btn-fs-edit').onclick=openFullscreenEdit;
document.getElementById('file-img').onchange=async e=>{
  const files=Array.from(e.target.files);e.target.value='';
  for(const f of files){
    const item={id:uid(),name:f.name,dataURL:'',loading:true};
    pendingImages.push(item);renderAttach();
    const url=await compressImage(f);
    if(url){item.dataURL=url;item.loading=false}
    else{const idx=pendingImages.indexOf(item);if(idx>-1)pendingImages.splice(idx,1)}
    renderAttach();
  }
};
document.getElementById('archive-toggle').onclick=()=>{state.showArchived=!state.showArchived;save();renderConvList()};
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>switchTab(t.dataset.tab));
ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,140)+'px'});
ta.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&window.innerWidth>=900){e.preventDefault();sendUserMessage()}
  if(e.key==='e'&&e.shiftKey&&(e.metaKey||e.ctrlKey)){e.preventDefault();openFullscreenEdit()}
});
document.getElementById('btn-send').onclick=sendUserMessage;
document.getElementById('btn-reply-now').onclick=()=>{cancelReply();triggerReply()};
document.getElementById('chat-stream').addEventListener('click',e=>{
  if(e.target.closest('.bubble,.msg-actions,.mem-card,.bubble-edit,.bubble-edit-actions,.thinking-box,.letter-pending,.diary-pending,.memo-pending,.btn-stop'))return;
  if(openActionMsgId){openActionMsgId=null;renderChat()}
});
window.addEventListener('beforeunload',()=>{
  if(throttledSaveTimer){clearTimeout(throttledSaveTimer);throttledSaveTimer=null;save()}
});
setInterval(()=>{if(state.activeTab||true)renderTodoPanel()},60000);
setupVH();
load();
renderAll();
maybeAutoGenerateDaily();
