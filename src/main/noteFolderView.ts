import { HERO_PANEL_CSS } from './heroTheme';

export function noteFolderHtml() {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>便签夹</title><style>${HERO_PANEL_CSS}
  .primary{width:100%;margin-bottom:12px}.list{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:9px;padding:1px 3px 3px 1px;scrollbar-width:thin}
  article{flex:none}.summary{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .actions{display:flex;align-items:center;gap:7px}.state{margin-right:auto;color:#586c73;font-size:11px}.empty{text-align:center;color:#586c73;padding:24px 8px}
  </style><body><section class="panel"><header class="heading"><span class="emblem" aria-hidden="true">✎</span>春日部便签夹<button class="close" id="close" aria-label="关闭便签夹">×</button></header>
  <button class="primary" id="new">＋ 新建便利贴</button><div class="list" id="list" aria-label="已保存的便利贴"></div><p class="error" id="error" role="status" hidden></p></section>
  <script>
  const{ipcRenderer}=require('electron');const list=document.getElementById('list'),error=document.getElementById('error');
  async function refresh(){const notes=await ipcRenderer.invoke('note-folder:list');list.replaceChildren();if(!notes.length){const el=document.createElement('div');el.className='card empty';el.textContent='还没有便利贴，写下第一件小事吧';list.append(el)}
  for(const note of notes){const card=document.createElement('article');card.className='card';const text=document.createElement('p');text.className='summary';text.textContent=note.content.trim()||'空白便利贴';const actions=document.createElement('div');actions.className='actions';const state=document.createElement('span');state.className='state';state.textContent=note.pinned?'📌 已固定':note.open?'已打开':'已收起';actions.append(state);
  for(const [action,label,cls]of[['open','打开 / 定位','secondary'],['delete','删除','danger']]){const button=document.createElement('button');button.className=cls;button.textContent=label;button.onclick=()=>run(action,note.id,button);actions.append(button)}card.append(text,actions);list.append(card)}}
  async function run(action,id,button){button.disabled=true;error.hidden=true;try{const r=await ipcRenderer.invoke('note-folder:action',action,id);if(!r.ok)throw Error(r.error||'操作失败，请重试');await refresh()}catch(e){error.textContent=e.message;error.hidden=false}finally{button.disabled=false}}
  document.getElementById('new').onclick=e=>run('new',null,e.currentTarget);document.getElementById('close').onclick=()=>window.close();window.addEventListener('focus',()=>refresh().catch(()=>{}));refresh().catch(()=>{error.hidden=false;error.textContent='便签夹加载失败，请重新打开'});
  </script></body></html>`;
}
