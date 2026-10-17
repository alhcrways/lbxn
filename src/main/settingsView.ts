import { MODEL_PROVIDERS, findModelProvider } from './modelPresets';
import { HERO_PALETTE } from './heroPalette';
import type { LlmConfig } from '../shared/types';
import { escapeNoteHtml } from './noteView';
import { HERO_PANEL_CSS } from './heroTheme';

export function settingsHtml(config: LlmConfig) {
  const initial = findModelProvider(config);
  const options = [
    ...MODEL_PROVIDERS,
    { id: 'custom', label: '自定义接口', baseUrl: '', hint: '支持 OpenAI Chat Completions 兼容接口。', example: '填写服务提供的模型 ID' },
  ];
  const selected = initial?.id ?? (config.apiKey ? 'custom' : MODEL_PROVIDERS[0].id);
  const publicOptions = JSON.stringify(options.map(({ id, baseUrl, hint, example }) => ({ id, baseUrl, hint, example }))).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>聊天设置</title><style>${HERO_PANEL_CSS}
  [hidden]{display:none!important}.custom{display:flex;flex-direction:column;gap:8px}.card{display:flex;flex-direction:column;gap:8px;flex:1;overflow:auto}
  label{font-weight:700}input,select{width:100%;padding:8px 10px;background:#fff;border:1.5px solid #594332;border-radius:8px;color:#594332;outline:none}
  input:focus-visible,select:focus-visible{outline-color:${HERO_PALETTE.focus}}.hint{font-size:11px;color:#8d7665;margin:4px 0 0;line-height:1.6}.primary{margin-top:5px}
  </style><body><section class="panel"><header class="heading"><span class="emblem" aria-hidden="true">⚙</span>聊天设置<button class="close" id="close" aria-label="关闭聊天设置">×</button></header>
  <form class="card" id="settings"><label for="provider">模型厂商</label><select id="provider">${options.map(p => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${escapeNoteHtml(p.label)}</option>`).join('')}</select>
  <div id="custom-config" class="custom" hidden><label for="base-url">接口地址</label><input id="base-url" type="url" autocomplete="off" placeholder="https://服务地址/v1" value="${escapeNoteHtml(initial ? '' : config.baseUrl)}"></div>
  <label for="model">模型名称</label><input id="model" required maxlength="200" autocomplete="off" value="${escapeNoteHtml(initial || config.apiKey ? config.model : '')}">
  <label for="key">API Key</label><input id="key" type="password" autocomplete="off" required placeholder="填写所选服务商的 API Key" value="${escapeNoteHtml(config.apiKey)}">
  <p class="hint" id="provider-hint"></p><button class="primary" id="save" type="submit">保存设置</button>
  <p class="hint">密钥保存在本机，请求发送给所选厂商。</p><p class="error" id="error" role="status" hidden></p></form></section>
  <script>
  const{ipcRenderer}=require('electron');const options=${publicOptions},provider=document.getElementById('provider'),model=document.getElementById('model'),key=document.getElementById('key'),button=document.getElementById('save'),error=document.getElementById('error'),url=document.getElementById('base-url'),custom=document.getElementById('custom-config');
  let previous=provider.value;const drafts=new Map();
  function option(id){return options.find(p=>p.id===id)}function hint(){const p=option(provider.value);document.getElementById('provider-hint').textContent=p.hint;model.placeholder=p.example;custom.hidden=p.id!=='custom';url.required=!custom.hidden}
  provider.onchange=()=>{drafts.set(previous,{key:key.value,model:model.value,url:url.value});const draft=drafts.get(provider.value);key.value=draft?.key||'';model.value=draft?.model||'';url.value=draft?.url||'';previous=provider.value;lastUrl=url.value;error.hidden=true;hint()};hint();
  let lastUrl=url.value;url.onchange=()=>{if(url.value!==lastUrl){key.value='';lastUrl=url.value}};
  document.getElementById('close').onclick=()=>window.close();document.getElementById('settings').onsubmit=async e=>{e.preventDefault();button.disabled=true;provider.disabled=true;error.hidden=true;try{const result=await ipcRenderer.invoke('llm-config-save',{apiKey:key.value.trim(),providerId:provider.value,model:model.value.trim(),...(provider.value==='custom'?{baseUrl:url.value.trim()}: {})});if(!result.ok){error.textContent=result.error||'保存失败，请重试';error.hidden=false}}catch{error.textContent='保存失败，请重试';error.hidden=false}finally{button.disabled=false;provider.disabled=false}}
  </script></body></html>`;
}
