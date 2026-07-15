// ─────────────────────────────────────────────
//  08-ai-client.js · AI 流式请求层
//  依赖：01-state.js（activeStreams、throttledSaveTimer）
//        03-markdown.js（parseThinking、MEM_REGEX 等、streamPlaceholder）
//        05-storage.js（save、throttledSave）
//        06-providers.js（getActiveConfig）
//        07-context.js（buildMessages、buildMessagesForComment）
// ─────────────────────────────────────────────

/* ── 打字机效果引擎（只管"正文"怎么显示，不影响思考气泡） ──
   思路：deltas 到达时只更新"目标文本"，实际显示速度由这里的循环自己控制，
   跟 API 吐字快慢解耦。积压太多（比如网络抖动一次性来一大段）会自动加速追赶，
   不会让打字机效果拖太久才说完话。 */

const _revealState=new Map(); // id -> {shown, text, raf, last, onTick}
const REVEAL_BASE_SPEED=32;   // 基础速度：字/秒
const REVEAL_CATCHUP_1=80;    // 积压超过这么多字：2.5倍速追赶
const REVEAL_CATCHUP_2=200;   // 积压超过这么多字：5倍速追赶

function _driveReveal(id){
  const st=_revealState.get(id);
  if(!st)return;
  const now=performance.now();
  const dt=now-(st.last||now);
  st.last=now;
  const gap=st.text.length-st.shown;
  if(gap<=0){
    st.onTick(st.text,true);
    _revealState.delete(id);
    return;
  }
  let speed=REVEAL_BASE_SPEED;
  if(gap>REVEAL_CATCHUP_2)speed=REVEAL_BASE_SPEED*5;
  else if(gap>REVEAL_CATCHUP_1)speed=REVEAL_BASE_SPEED*2.5;
  st.shown=Math.min(st.text.length,st.shown+Math.max(1,Math.round(speed*dt/1000)));
  st.onTick(st.text.slice(0,st.shown),false);
  st.raf=requestAnimationFrame(()=>_driveReveal(id));
}
function pushReveal(id,fullText,onTick){
  let st=_revealState.get(id);
  if(!st){
    st={shown:0,text:fullText,last:performance.now(),onTick};
    _revealState.set(id,st);
    _driveReveal(id);
  }else{
    st.text=fullText;st.onTick=onTick;
  }
}
function clearReveal(id){_revealState.delete(id)}
function finishReveal(id){
  const st=_revealState.get(id);
  if(!st)return;
  st.onTick(st.text,true);
  _revealState.delete(id);
}

/* ── 流式更新：主聊天气泡 ── */

function streamUpdateChat(aiMsg){
  const parsed=parseThinking(aiMsg.content,aiMsg.reasoningContent||'');
  aiMsg.thinking=parsed.thinking;
  let cleaned=parsed.contentAfter.replace(MEM_REGEX,'').replace(TODO_REGEX,'').replace(TOPIC_END_REGEX,'');
  cleaned=streamPlaceholder(cleaned).replace(/\n{3,}/g,'\n\n');
  const nodeEl=document.querySelector(`.node[data-id="${aiMsg.id}"]`);
  if(!nodeEl)return;
  const wrap=nodeEl.querySelector('.bubble-wrap');
  if(!wrap)return;
  let tkBox=wrap.querySelector('.thinking-box');
  if(parsed.thinking){
    if(!tkBox){
      tkBox=document.createElement('div');
      tkBox.className='thinking-box streaming';tkBox.dataset.tk=aiMsg.id;
      tkBox.innerHTML=`<div class="thinking-head"><span class="thinking-arrow">▶</span><span>💭 思考过程</span></div><div class="thinking-body"></div>`;
      const bubbleEl=wrap.querySelector('.bubble');
      wrap.insertBefore(tkBox,bubbleEl);
      bindThinkingToggle(tkBox);
    }
    tkBox.querySelector('.thinking-body').textContent=parsed.thinking;
    const reasoningDone=!!(aiMsg.reasoningContent&&aiMsg.reasoningContent.trim()&&aiMsg.content&&aiMsg.content.trim());
    if(parsed.isStreaming&&!reasoningDone)tkBox.classList.add('streaming');
    else tkBox.classList.remove('streaming');
  }
  const textEl=nodeEl.querySelector('.bubble .text');
  if(textEl){
    pushReveal(aiMsg.id,cleaned,(shownText)=>{
      textEl.innerHTML=renderMarkdown(shownText);
      const tl=document.getElementById('chat-stream');if(tl)tl.scrollTop=tl.scrollHeight;
    });
  }
  throttledSave();
}
function streamUpdateComment(aiMsg){
  const parsed=parseThinking(aiMsg.content,aiMsg.reasoningContent||'');
  aiMsg.thinking=parsed.thinking;
  let cleaned=parsed.contentAfter.replace(MEM_REGEX,'').replace(TODO_REGEX,'').replace(TOPIC_END_REGEX,'');
  cleaned=streamPlaceholder(cleaned).replace(/\n{3,}/g,'\n\n');
  const cmtEl=document.querySelector(`.tl-cmt[data-cid="${aiMsg.id}"]`);
  if(!cmtEl)return;
  let tkBox=cmtEl.querySelector('.thinking-box');
  if(parsed.thinking){
    if(!tkBox){
      tkBox=document.createElement('div');
      tkBox.className='thinking-box streaming';tkBox.dataset.tk=aiMsg.id;
      tkBox.innerHTML=`<div class="thinking-head"><span class="thinking-arrow">▶</span><span>💭 思考过程</span></div><div class="thinking-body"></div>`;
      const bodyEl=cmtEl.querySelector('.tl-cmt-body');
      cmtEl.insertBefore(tkBox,bodyEl);
      bindThinkingToggle(tkBox);
    }
    tkBox.querySelector('.thinking-body').textContent=parsed.thinking;
    const reasoningDone=!!(aiMsg.reasoningContent&&aiMsg.reasoningContent.trim()&&aiMsg.content&&aiMsg.content.trim());
    if(parsed.isStreaming&&!reasoningDone)tkBox.classList.add('streaming');
    else tkBox.classList.remove('streaming');
  }
  const bodyEl=cmtEl.querySelector('.tl-cmt-body');
  if(bodyEl){
    pushReveal('cmt:'+aiMsg.id,cleaned,(shownText)=>{
      bodyEl.innerHTML=renderMarkdown(shownText)+'<span class="tl-streaming"></span>';
    });
  }
  throttledSave();
}
function applyReasoning(body,cfg){
  const effort=cfg.provider&&cfg.provider.reasoningEffort;
  if(!effort||effort==='off')return body;
  if(effort==='auto'){
    const model=(cfg.model||'').toLowerCase();
    if(model.includes('claude'))body.thinking={type:'adaptive'};
    return body;
  }
  body.reasoning_effort=effort;
  body.reasoning={effort};
  const model=(cfg.model||'').toLowerCase();
  if(model.includes('claude')){
    const needsAdaptive=/opus-4-[78]|fable-5|mythos-5|mythos-preview/.test(model);
    if(needsAdaptive){
      body.thinking={type:'adaptive'};
    }else{
      const budgetMap={low:4000,medium:10000,high:24000};
      body.thinking={type:'enabled',budget_tokens:budgetMap[effort]||10000};
      delete body.temperature;
    }
  }
  return body;
}
async function callOpenAIStream(conv,aiMsg){
  const cfg=getActiveConfig(conv);
  if(!cfg)throw new Error('没有可用的提供商配置');
  const body=applyReasoning({model:cfg.model,messages:buildMessages(conv),stream:true},cfg);
  await streamCall(cfg,body,aiMsg,()=>streamUpdateChat(aiMsg));
}
async function callOpenAIStreamForComment(node,aiMsg){
  const cfg=getActiveConfig(getConv());
  if(!cfg)throw new Error('没有可用的提供商配置');
  const body=applyReasoning({model:cfg.model,messages:buildMessagesForComment(node),stream:true},cfg);
  await streamCall(cfg,body,aiMsg,()=>streamUpdateComment(aiMsg));
}
async function streamCall(cfg,body,aiMsg,onDelta){
  const controller=new AbortController();
  activeStreams.set(aiMsg.id,{controller,kind:'chat'});
  try{
    const resp=await fetch(cfg.baseUrl.replace(/\/$/,'')+'/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.apiKey},
      body:JSON.stringify(body),
      signal:controller.signal
    });
    if(!resp.ok){const t=await resp.text();throw new Error(`HTTP ${resp.status}: ${t.slice(0,200)}`)}
    const reader=resp.body.getReader();const decoder=new TextDecoder('utf-8');let buf='';
    while(true){
      const {done,value}=await reader.read();if(done)break;
      buf+=decoder.decode(value,{stream:true});
      let idx;
      while((idx=buf.indexOf('\n'))!==-1){
        const line=buf.slice(0,idx).trim();buf=buf.slice(idx+1);
        if(!line||!line.startsWith('data:'))continue;
        const data=line.slice(5).trim();if(data==='[DONE]')break;
        try{
          const j=JSON.parse(data);
          const delta=j.choices&&j.choices[0]&&j.choices[0].delta;
          if(!delta)continue;
          let changed=false;
          if(delta.reasoning_content){aiMsg.reasoningContent=(aiMsg.reasoningContent||'')+delta.reasoning_content;changed=true}
          if(delta.content){aiMsg.content+=delta.content;changed=true}
          if(changed)onDelta();
        }catch(e){}
      }
    }
  }finally{
    activeStreams.delete(aiMsg.id);
    if(throttledSaveTimer){clearTimeout(throttledSaveTimer);throttledSaveTimer=null}
    save();
  }
}
