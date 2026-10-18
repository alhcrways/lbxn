import { HERO_PANEL_CSS } from './heroTheme';
import { HERO_PALETTE } from './heroPalette';

/** 独立聊天小窗。与桌宠窗口分离，打开聊天时人物窗口无需伸缩。 */
export function chatWindowHtml() {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>和小新聊聊</title><style>${HERO_PANEL_CSS}
  body{padding:6px;overflow:hidden}.panel{padding:10px}.heading{margin-bottom:8px}.reply{flex:1;min-height:0;overflow:auto;padding:10px;background:#fffdf3;background-image:linear-gradient(#8d76650d 1px,transparent 1px),linear-gradient(90deg,#8d76650d 1px,transparent 1px);background-size:20px 20px;border:1.5px solid #594332;border-radius:12px 9px 14px 10px;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}.name{display:inline-block;margin-bottom:6px;padding:1px 7px;background:${HERO_PALETTE.green};border:1px solid #59433266;border-radius:6px;font-size:11px}.text{font-size:12px;line-height:1.55}.empty{color:#9a8261}.composer{display:flex;gap:5px;margin-top:7px;-webkit-app-region:no-drag}.composer input{min-width:0;flex:1;padding:7px 8px;background:#fffdf3;border:1.5px solid #594332;border-radius:9px 7px 10px 7px;color:#594332;-webkit-app-region:no-drag}.composer .primary{padding:6px 9px;-webkit-app-region:no-drag}.status{min-height:15px;margin:3px 2px 0;color:#9a8261;font-size:10px}.error-text{color:#a85e50}
  </style><body><section class="panel"><header class="heading"><span class="emblem" aria-hidden="true">💬</span>和小新聊聊<button class="close" id="close" aria-label="关闭聊天">×</button></header>
  <div class="reply" id="reply"><span class="name">小新</span><div class="text empty" id="text">想和我说什么呀？</div></div>
  <form class="composer" id="form"><input id="message" maxlength="200" autocomplete="off" placeholder="说点什么……" aria-label="和小新聊天的消息"><button class="primary" id="send" type="submit">发送</button></form><div class="status" id="status"></div></section>
  </body></html>`;
}

/** 页面脚本由主进程在加载完成后执行，避免脚本文本被透明 data URL 窗口误绘制。 */
export function chatWindowScript() {
  return `
  (() => {
  const{ipcRenderer}=require('electron');const form=document.getElementById('form'),input=document.getElementById('message'),send=document.getElementById('send'),text=document.getElementById('text'),status=document.getElementById('status');let busy=false,streamed='';
  function show(value,error=false){text.textContent=value;text.className='text'+(error?' error-text':'');document.getElementById('reply').scrollTop=document.getElementById('reply').scrollHeight}
  function friendly(error){if(error==='NO_API_KEY')return '先在右键菜单的“聊天设置”里填写 API Key 哦。';if(error==='BUSY')return '我还在想上一句话，等一下嘛。';return error||'聊天失败了，再试一次吧。'}
  function minThinkTime(message){const knowledge=/(为什么|是什么|怎么|哪里|哪个|多少|介绍|解释|区别|原因|历史|地理|科学|计算|[？?])/;const emotion=/(难过|伤心|委屈|焦虑|害怕|失落|孤独|压力|生气|哭|不开心)/;if(message.length>60)return 1800;if(knowledge.test(message))return 1500;if(emotion.test(message))return 1200;return 1000}
  ipcRenderer.on('chat-chunk',(_e,delta)=>{streamed+=delta});ipcRenderer.on('chat-done',(_e,full)=>{streamed=full});ipcRenderer.on('chat-error',(_e,error)=>{if(busy)status.textContent=friendly(error)});
  ipcRenderer.invoke('pet:getChatHistory').then(history=>{const last=Array.isArray(history)?[...history].reverse().find(item=>item&&item.role==='assistant'&&item.content):null;if(last)show(last.content)}).catch(()=>{});
  form.onsubmit=async e=>{e.preventDefault();const message=input.value.trim();if(!message||busy)return;busy=true;streamed='';send.disabled=true;input.disabled=true;input.value='';show('认真想想……');status.textContent='';const start=Date.now(),minimum=minThinkTime(message);let result;try{result=await ipcRenderer.invoke('pet:chat',message)}catch(error){result={ok:false,error:error&&error.message||'聊天异常，请重试'}}const wait=Math.max(0,minimum-(Date.now()-start));if(wait)await new Promise(resolve=>setTimeout(resolve,wait));if(result&&result.ok)show(streamed||result.response||'我想好啦，可是刚才忘记说什么了。');else show(friendly(result&&result.error),true);busy=false;send.disabled=false;input.disabled=false;input.focus()};
  document.getElementById('close').onclick=()=>window.close();requestAnimationFrame(()=>input.focus());
  })();`;
}
