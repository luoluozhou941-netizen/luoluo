// ─────────────────────────────────────────────
//  15-modal-toast.js · 弹窗与提示层
//  依赖：无（最底层 UI 工具，不依赖其他模块）
// ─────────────────────────────────────────────

/* ── 通用弹窗 ── */

function showModal(innerHtml,onOk,okText='保存',okClass='primary'){
  const mask=document.createElement('div');mask.className='modal-mask';
  const m=document.createElement('div');m.className='modal';
  m.innerHTML=innerHtml+`<div class="modal-actions"><button data-cancel>${onOk?'取消':okText}</button>${onOk?`<button class="${okClass}" data-ok>${okText}</button>`:''}</div>`;
  mask.appendChild(m);document.body.appendChild(mask);
  const close=()=>{if(mask.parentNode)document.body.removeChild(mask)};
  m.querySelector('[data-cancel]').onclick=close;
  if(onOk)m.querySelector('[data-ok]').onclick=()=>{
    try{const r=onOk();if(r===false)return}finally{}close();
  };
  mask.onclick=e=>{if(e.target===mask)close()};
}
function showToast(msg,opts){
  opts=opts||{};
  const duration=opts.duration||4000;
  const wrap=document.getElementById('toast-wrap');
  const el=document.createElement('div');
  el.className='toast'+(opts.type==='error'?' error':'');
  const msgSpan=document.createElement('div');msgSpan.className='toast-msg';msgSpan.innerHTML=msg;
  msgSpan.addEventListener('click',e=>{e.stopPropagation();el.classList.toggle('expanded')});
  el.appendChild(msgSpan);
  if(opts.actionText&&opts.onAction){
    const btn=document.createElement('button');btn.className='toast-action';btn.textContent=opts.actionText;
    btn.onclick=e=>{e.stopPropagation();try{opts.onAction()}finally{closeToast()}};
    el.appendChild(btn);
  }
  const close=document.createElement('button');close.className='toast-close';close.innerHTML='<i class="ph-light ph-x"></i>';
  close.onclick=e=>{e.stopPropagation();closeToast()};
  el.appendChild(close);
  wrap.appendChild(el);
  let timer=setTimeout(closeToast,duration);
  function closeToast(){if(timer){clearTimeout(timer);timer=null}el.classList.add('leaving');setTimeout(()=>{if(el.parentNode)el.parentNode.removeChild(el)},220)}
}

/* ── 滚动摘要确认弹卡：存 / 改 / 重写 三选一 ── */

function showSegmentConfirmModal(segment){
  if(!segment)return;
  const r=getRole();
  const mask=document.createElement('div');mask.className='modal-mask';
  const m=document.createElement('div');m.className='modal';
  const dateLabel=segment.date_start===segment.date_end?segment.date_start:`${segment.date_start} ~ ${segment.date_end}`;
  const tagsLabel=(segment.tags&&segment.tags.length)?segment.tags.join(' / '):'';
  m.innerHTML=`
    <h3><i class="ph-light ph-scroll"></i> 话题摘要整理好啦</h3>
    <div style="font-size:12px;color:var(--ink-3);margin:2px 0 10px">${dateLabel}${tagsLabel?' · '+tagsLabel:''}</div>
    <textarea class="seg-confirm-ta" rows="6" style="width:100%;box-sizing:border-box;resize:vertical">${escapeHtml(segment.summary||'')}</textarea>
    <div class="modal-actions" style="flex-wrap:wrap;gap:8px">
      <button data-rewrite>重写</button>
      <button data-edit>改并存</button>
      <button class="primary" data-save>直接存</button>
    </div>`;
  mask.appendChild(m);document.body.appendChild(mask);
  const close=()=>{if(mask.parentNode)document.body.removeChild(mask)};
  const ta=m.querySelector('.seg-confirm-ta');

  m.querySelector('[data-save]').onclick=()=>{
    segment.status='confirmed';segment.updatedAt=Date.now();
    save();if(state.activeTab==='timeline')renderTimeline();
    showToast(`摘要存好啦 📝${r&&r.signature||''}`);
    close();
  };
  m.querySelector('[data-edit]').onclick=()=>{
    const v=ta.value.trim();
    if(!v){showToast('内容不能是空的哦',{type:'error'});return}
    segment.summary=v;segment.status='edited';segment.updatedAt=Date.now();
    save();if(state.activeTab==='timeline')renderTimeline();
    showToast('改好啦，存上了📝');
    close();
  };
  m.querySelector('[data-rewrite]').onclick=()=>{
    close();
    showModal('<h3>重新生成这段摘要？</h3><div style="line-height:1.7;color:var(--ink-2)">会覆盖当前内容，从这段聊天记录重新读一遍</div>',()=>{
      const msgs=getMessagesForSegment(segment);
      generateSegmentSummary(segment,msgs,{}).then(()=>{
        if(segment.status==='pending')showSegmentConfirmModal(segment);
      });
    },'重新生成');
  };
  mask.onclick=e=>{if(e.target===mask)close()};
}
