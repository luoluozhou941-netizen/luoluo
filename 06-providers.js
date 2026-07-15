// ─────────────────────────────────────────────
//  06-providers.js · Provider 配置读取层
//  依赖：00-prompts.js（USAGE_KEYS）
//        01-state.js（settings、getRole、getConv）
// ─────────────────────────────────────────────

/* ── 按 ID 取 Provider 对象 ── */

function getProvider(id){
  if(!id)return null;
  return (settings.providers||[]).find(p=>p.id===id)||null;
}
function getActiveConfig(conv){
  const role=getRole();
  if(!role)return null;
  let provId=null,model=null;
  if(conv&&conv.providerId){provId=conv.providerId;model=conv.model||null}
  if(!provId&&role.providerId){provId=role.providerId;if(!model)model=role.model||null}
  if(!provId)return null;
  const prov=getProvider(provId);
  if(!prov)return null;
  if(!model)model=prov.defaultModel||(prov.models&&prov.models[0])||'';
  return {provider:prov,model,baseUrl:prov.baseUrl||'',apiKey:prov.apiKey||''};
}
function getUsageConfig(usageKey){
  const binding=(settings.usageBindings||{})[usageKey];
  if(binding&&binding!=='role'){
    const prov=getProvider(binding);
    if(prov)return {provider:prov,model:prov.defaultModel||'',baseUrl:prov.baseUrl||'',apiKey:prov.apiKey||''};
  }
  return getActiveConfig(getConv());
}
function getDailyConfig(){return getUsageConfig('daily')}
function getSegmentConfig(){return getUsageConfig('segment')}
async function fetchModelList(baseUrl,apiKey){
  if(!baseUrl)throw new Error('baseUrl 为空');
  if(!apiKey)throw new Error('apiKey 为空');
  const url=baseUrl.replace(/\/$/,'')+'/models';
  const resp=await fetch(url,{
    method:'GET',
    headers:{'Authorization':'Bearer '+apiKey}
  });
  if(!resp.ok){
    const t=await resp.text();
    throw new Error(`HTTP ${resp.status}: ${t.slice(0,200)}`);
  }
  const j=await resp.json();
  if(!j||!Array.isArray(j.data))throw new Error('返回格式不对，没有 data 数组');
  return j.data.map(x=>x&&x.id).filter(Boolean);
}
