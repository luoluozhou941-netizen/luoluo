// ─────────────────────────────────────────────
//  03-markdown.js · Markdown 渲染 + 思考解析
//  依赖：02-utils.js（escapeHtml）
// ─────────────────────────────────────────────

/* ── 标记提取正则常量 ── */

const MEM_REGEX=/`?\[\[MEMORY:([^\]]+)\]\]`?/g;
const TODO_REGEX=/`?\[\[TODO:([^\]]+)\]\]`?/g;
const LETTER_REGEX=/`?\[\[LETTER:([\s\S]+?)\]\]`?/g;
const DIARY_REGEX=/`?\[\[DIARY:([\s\S]+?)\]\]`?/g;
const MEMO_SHARED_REGEX=/`?\[\[MEMO_SHARED:([\s\S]+?)\]\]`?/g;
const TOPIC_END_REGEX=/`?\[\[TOPIC_END:([^\]]+)\]\]`?/g;
const LETTER_OPEN_REGEX=/\[\[LETTER:([\s\S]*?)$/;
const DIARY_OPEN_REGEX=/\[\[DIARY:([\s\S]*?)$/;
const MEMO_SHARED_OPEN_REGEX=/\[\[MEMO_SHARED:([\s\S]*?)$/;
const THINKING_REGEX=/【思考开始】\s*([\s\S]*?)\s*【思考结束】/;
const THINKING_OPEN_REGEX=/【思考开始】\s*([\s\S]*)$/;
/* ── Markdown 渲染（marked.js + DOMPurify） ── */

marked.use({breaks:true,gfm:true});
function renderMarkdown(src){
  if(!src)return '';
  return DOMPurify.sanitize(marked.parse(src));
}
function parseThinking(rawText, reasoningContent){
  const compress=s=>(s||'').replace(/\n{3,}/g,'\n\n');
  if(reasoningContent && reasoningContent.trim()){
    const contentAfter = (rawText||'').replace(THINKING_REGEX,'').replace(THINKING_OPEN_REGEX,'').replace(/^\s+/,'');
    return {thinking: compress(reasoningContent.trim()), contentAfter, isStreaming: false};
  }
  if(!rawText)return {thinking:null,contentAfter:'',isStreaming:false};
  const closed=rawText.match(THINKING_REGEX);
  if(closed){
    const thinking=compress((closed[1]||'').trim());
    const contentAfter=rawText.replace(THINKING_REGEX,'').replace(/^\s+/,'');
    return {thinking,contentAfter,isStreaming:false};
  }
  const open=rawText.match(THINKING_OPEN_REGEX);
  if(open){
    const thinking=compress((open[1]||'').trim());
    return {thinking,contentAfter:'',isStreaming:true};
  }
  return {thinking:null,contentAfter:rawText,isStreaming:false};
}
