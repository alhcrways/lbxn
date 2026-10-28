import type { NoteColor, StickyNote } from '../shared/types';

export const NOTE_COLORS: Record<NoteColor, { bg: string; bar: string; text: string; hint: string }> = {
  yellow: { bg: '#fff7d8', bar: '#f8d56b', text: '#594332', hint: '#9a8261' },
  green: { bg: '#edf5e8', bar: '#b7d399', text: '#405c3e', hint: '#839879' },
  pink: { bg: '#fff0ed', bar: '#efb1a6', text: '#765048', hint: '#ab8980' },
};
export function escapeNoteHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export type NoteStickers = Partial<Record<'shiro' | 'hero' | 'robot' | 'chocobi' | 'pattern', string>>;
export function noteHtml(note: StickyNote, sticker: string | NoteStickers = ''): string {
  const c = NOTE_COLORS[note.color] ?? NOTE_COLORS.yellow;
  const config = JSON.stringify({ id: note.id, pinned: note.pinned, color: note.color })
    .replace(/</g, '\\u003c');
  const stickers = JSON.stringify(typeof sticker === 'string' ? { shiro: sticker } : sticker).replace(/</g, '\\u003c');
  const outline = 'M30 21 C65 16 90 24 124 20 S190 16 223 21 S271 14 284 33 C295 51 288 80 292 107 S286 165 292 196 S287 254 291 283 Q294 316 270 320 C237 327 205 317 175 323 S109 318 81 323 S33 325 19 312 C8 294 15 265 11 235 S16 175 10 146 S15 90 12 65 Q10 28 30 21 Z';
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>小新的便利贴</title><style>
*{box-sizing:border-box}html,body{height:100%;margin:0}body{--paper:${c.bg};--bar:${c.bar};--ink:${c.text};--hint:${c.hint};background:transparent;color:var(--ink);font-family:"Microsoft YaHei",sans-serif;display:flex;flex-direction:column;padding:52px 17px clamp(36px,calc(30vh - 6px),96px);overflow:hidden}body>header,body>.subbar,body>.editor,body>footer{position:relative;z-index:1}.paper{position:fixed;inset:0;width:100%;height:calc(100% - 20px);pointer-events:none;z-index:0}
button{font:inherit;color:inherit;cursor:pointer;border:0}button:focus-visible{outline:2px solid #c36b43;outline-offset:1px}button:disabled{opacity:.5;cursor:wait}
 .bar{position:fixed;top:13px;left:22px;right:22px;height:36px;z-index:3;-webkit-app-region:drag;display:flex;align-items:center;gap:3px;padding:0 0 4px}.bar button{-webkit-app-region:no-drag;background:transparent;border-radius:8px;padding:3px;width:27px;height:29px;display:flex;align-items:center;justify-content:center;font-size:17px;flex:none}.bar button:hover{background:#ffffffa0}.title{font-size:11px;font-weight:700;letter-spacing:.5px;margin-right:auto;padding:4px 7px;border:2px solid #594332;border-radius:10px 8px 11px 7px;background:#fffdf3;transform:rotate(-3deg);white-space:nowrap}.pin svg{width:26px;height:29px;transform:rotate(-23deg);filter:grayscale(.65);opacity:.7;transition:transform .18s,filter .18s,opacity .18s}.pin[aria-pressed=true]{background:#fffdf0}.pin[aria-pressed=true] svg{transform:rotate(0);filter:none;opacity:1}@media(prefers-reduced-motion:reduce){.pin svg{transition:none}}
body[data-pinned="true"]:not([data-actions-visible="true"]) #new,body[data-pinned="true"]:not([data-actions-visible="true"]) #close{visibility:hidden;pointer-events:none}
.subbar{display:flex;align-items:center;gap:7px;padding:7px 1px 5px;flex:none}.dot{width:15px;height:15px;border:1px solid #8b6b4350;border-radius:50%;padding:0}.dot[aria-pressed=true]{outline:2px solid #9a6545;outline-offset:2px}.folder{margin-left:auto;font-size:11px;background:transparent;color:var(--hint);padding:3px}.folder:hover{color:var(--ink)}
.editor{flex:1;min-height:0;margin:8px 0 0;display:flex}textarea{display:block;width:100%;height:100%;resize:none;border:0;outline:0;padding:0 3px;background:transparent;font:14px/28px "Microsoft YaHei",sans-serif;color:var(--ink);scrollbar-width:thin}textarea::placeholder{color:var(--hint)}
 .footer{position:static!important;flex:none;height:0;z-index:2!important}.status{display:none}.status.error{display:block;position:fixed;bottom:40px;left:24px;right:24px;font-size:11px;color:#b84630;background:var(--paper);padding:4px 6px;border-radius:6px;z-index:3}.decor{position:fixed;bottom:max(3px,calc(5% + 30px - clamp(0px,calc(68px - 20vh),44px)));right:25px;display:flex;align-items:flex-end;gap:7px;pointer-events:none}.sticker{width:37px;height:34px;background-repeat:no-repeat;background-position:center;background-size:contain;border:2px solid #fffaf0;border-radius:7px;box-shadow:0 1px 3px #62482220;transform:rotate(-6deg);background-color:#fffaf0}.sticker.secondary{width:29px;height:29px;transform:rotate(8deg)}.sticker.hero{background-size:94px auto;background-position:-21px -12px}.compact-line{display:none}.compact-drag{display:none}
@media(max-height:160px){body{padding:0}.subbar,.editor{display:none}.compact-line{display:block;position:fixed;top:47px;left:24px;right:106px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:24px;pointer-events:none;z-index:1}.compact-drag{display:block;position:fixed;top:9px;left:17px;right:48px;height:28px;-webkit-app-region:drag;z-index:1}.status.error{bottom:32px;left:20px;right:20px;font-size:10px}}
@media(max-width:220px){.bar{left:16px;right:16px;gap:2px}.bar button{width:18px;padding:0}.pin svg{width:18px}.title{font-size:9px;letter-spacing:0;padding:4px 3px}}
.resize-edge{position:fixed;left:20px;right:20px;bottom:calc(5% + 13px);height:12px;cursor:ns-resize;z-index:5;-webkit-app-region:no-drag;touch-action:none}
.resize-side{position:fixed;top:54px;bottom:calc(5% + 24px);width:8px;cursor:ew-resize;z-index:5;-webkit-app-region:no-drag;touch-action:none}.resize-left{left:9px}.resize-right{right:9px}
</style><body data-pinned="${note.pinned}">
<svg class="paper" viewBox="0 0 300 340" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="note-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#a28b6b" stroke-opacity=".17" stroke-width=".65"/></pattern></defs><path d="${outline}" fill="var(--paper)" stroke="#594332" stroke-width="2.4" stroke-linejoin="round"/><path d="${outline}" fill="url(#note-grid)"/></svg>
<header class="bar"><span class="title">春日部 MEMO</span><button id="new" title="新建另一张便利贴" aria-label="新建便利贴">＋</button><button id="pin" class="pin" aria-pressed="${note.pinned}" aria-label="固定到桌面"><svg viewBox="0 0 30 36" fill="none" aria-hidden="true"><path d="M15 24v10" stroke="#594332" stroke-width="2" stroke-linecap="round"/><path d="M8 24h14l-3-5h-8z" fill="#ec7357" stroke="#594332" stroke-width="1.6" stroke-linejoin="round"/><path d="M6 5l5 2 4-5 4 5 5-2v10c0 6-18 6-18 0z" fill="#287cac" stroke="#594332" stroke-width="1.7" stroke-linejoin="round"/><path d="M15 3v5" stroke="#e75a45" stroke-width="3"/><path d="M8 10q4-2 6 3-4 4-6-3zm14 0q-4-2-6 3 4 4 6-3z" fill="#f9d66c" stroke="#594332" stroke-width="1"/><path d="M12 18q3 2 6 0" stroke="#594332" stroke-width="1.2" stroke-linecap="round"/></svg></button><button id="close" title="关闭便利贴，保留在便签夹" aria-label="关闭便利贴">×</button></header>
<div class="subbar"><button class="dot" data-color="yellow" style="background:#f8d56b" title="春日部黄" aria-label="春日部黄"></button><button class="dot" data-color="green" style="background:#b7d399" title="小白绿" aria-label="小白绿"></button><button class="dot" data-color="pink" style="background:#efb1a6" title="动感粉" aria-label="动感粉"></button><button id="folder" class="folder">便签夹 ↗</button></div>
<div class="compact-drag" aria-hidden="true"></div><div id="compact-line" class="compact-line"></div>
<div class="editor"><textarea id="content" aria-label="便利贴内容" placeholder="今天要做什么呢？&#10;任务、灵感，都记在这里～">${escapeNoteHtml(note.content)}</textarea></div>
<div class="resize-side resize-left" data-resize="left" title="左右拖动调整便签宽度" role="separator" aria-label="左侧调整便签宽度" aria-orientation="vertical"></div><div class="resize-side resize-right" data-resize="right" title="左右拖动调整便签宽度" role="separator" aria-label="右侧调整便签宽度" aria-orientation="vertical"></div>
<div data-resize="bottom" id="resize-edge" class="resize-edge" title="上下拖动调整便签高度" role="separator" aria-label="上下缩放便签" aria-orientation="horizontal"></div>
<footer class="footer"><div id="status" class="status" role="status"></div><div class="decor" aria-label="小新主题贴纸"><div id="sticker-main" class="sticker"></div><div id="sticker-extra" class="sticker secondary"></div></div></footer>
<script>
(async()=>{
const {ipcRenderer}=require('electron');let config=${config},stickers=${stickers};const colors=${JSON.stringify(NOTE_COLORS)};
// Draw the top cap in actual CSS pixels; never stretch the entire paper SVG.
function fitPaper(){
 const svg=document.querySelector('.paper'),w=innerWidth,h=Math.max(70,innerHeight-20),r=w-8,b=h*.95;
 svg.setAttribute('viewBox','0 0 '+w+' '+h);
 const d='M28 7 C'+w*.27+' 3 '+w*.42+' 10 '+w*.55+' 6 S'+(w-40)+' 9 '+(w-25)+' 7 Q'+(w-9)+' 8 '+(w-8)+' 26 C'+(r+3)+' '+h*.25+' '+(r-4)+' '+h*.36+' '+r+' '+h*.5+' S'+(r-3)+' '+(b-35)+' '+(r-1)+' '+(b-20)+' Q'+r+' '+(b+1)+' '+(r-22)+' '+b+' C'+w*.66+' '+(b-4)+' '+w*.54+' '+(b+5)+' '+w*.40+' '+b+' S35 '+(b+4)+' 22 '+(b-2)+' Q8 '+(b-5)+' 9 '+(b-25)+' C4 '+h*.63+' 12 '+h*.47+' 7 '+h*.34+' S8 15 17 10 Q22 6 28 7 Z';
 svg.querySelectorAll(':scope > path').forEach(path=>path.setAttribute('d',d));
}
fitPaper();new ResizeObserver(fitPaper).observe(document.documentElement);
if(!config.id){const initial=await ipcRenderer.invoke('note:initial');config=initial.note;stickers=initial.stickers;document.getElementById('content').value=config.content;}
const ta=document.getElementById('content'),status=document.getElementById('status'),pin=document.getElementById('pin');let pinned=config.pinned,color=config.color,timer,revision=0;
window.getNoteDraft=()=>({content:ta.value,color});
// 固定便签默认收起操作按钮；保留布局位置，避免标题和图钉跳动。
document.addEventListener('pointerdown',()=>{if(pinned)document.body.dataset.actionsVisible='true'},true);
window.addEventListener('blur',()=>{document.body.dataset.actionsVisible='false'});
let resizing=false;
function endResize(){if(resizing){resizing=false;ipcRenderer.send('note:resize-end',config.id)}}
document.querySelectorAll('[data-resize]').forEach(edge=>{
edge.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();resizing=true;edge.setPointerCapture(e.pointerId);ipcRenderer.send('note:resize-start',config.id,edge.dataset.resize)});
edge.addEventListener('pointermove',e=>{if(!resizing)return;if(!(e.buttons&1)){endResize();return}ipcRenderer.send('note:resize-move',config.id)});
for(const name of ['pointerup','pointercancel','lostpointercapture'])edge.addEventListener(name,endResize);
});
window.addEventListener('blur',endResize);

function feedback(text,error=false){status.textContent=error?text:'';status.classList.toggle('error',error)}
function firstLine(){const line=ta.value.split(String.fromCharCode(10)).map(s=>s.replace(String.fromCharCode(13),'')).find(s=>s.trim())||'写下第一件小事';const el=document.getElementById('compact-line');el.textContent=line;el.title=line}
async function save(){clearTimeout(timer);const rev=revision;try{const r=await ipcRenderer.invoke('note:update',config.id,{content:ta.value,color});if(rev===revision)feedback(r.ok?'':'保存失败，请重试',!r.ok);return r.ok}catch{feedback('保存失败，请重试',true);return false}}
function dirty(){firstLine();revision++;feedback('');clearTimeout(timer);timer=setTimeout(save,250)}ta.addEventListener('input',dirty);
function palette(){const c=colors[color];for(const key of ['bg','bar','text','hint'])document.body.style.setProperty('--'+({bg:'paper',text:'ink'}[key]||key),c[key]);document.querySelectorAll('.dot').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===color)));const pair={yellow:['shiro','hero'],green:['chocobi','pattern'],pink:['robot','shiro']}[color];['sticker-main','sticker-extra'].forEach((id,i)=>{const el=document.getElementById(id),kind=pair[i];el.hidden=!stickers[kind];el.style.backgroundImage=stickers[kind]?'url("'+stickers[kind]+'")':'none';el.classList.toggle('hero',kind==='hero')})}
document.querySelectorAll('.dot').forEach(b=>b.onclick=()=>{color=b.dataset.color;palette();dirty()});
function pinUI(){document.body.dataset.pinned=String(pinned);document.body.dataset.actionsVisible='false';pin.setAttribute('aria-label',pinned?'取消固定':'固定到桌面');pin.title=pinned?'取消固定，保留窗口':'固定到桌面，重启自动恢复';pin.setAttribute('aria-pressed',String(pinned))}
pin.onclick=async()=>{pin.disabled=true;if(await save()){try{const r=await ipcRenderer.invoke('note:pin',config.id,!pinned);if(r.ok){pinned=!pinned;pinUI()}else feedback('固定状态保存失败',true)}catch{feedback('固定状态保存失败',true)}}pin.disabled=false};

document.getElementById('new').onclick=async()=>{if(await save())ipcRenderer.send('note:new',config.id)};
document.getElementById('close').onclick=async()=>{if(await save())ipcRenderer.send('note:close',config.id,ta.value)};
document.getElementById('folder').onclick=async()=>{if(await save())ipcRenderer.send('note:folder',config.id)};

ipcRenderer.on('note:save-error',()=>feedback('保存失败，请重试',true));palette();pinUI();
firstLine();ta.focus();ta.selectionStart=ta.selectionEnd=ta.value.length;
document.body.dataset.ready='true';
})().catch(()=>{document.getElementById('status').textContent='便签加载失败，请重新打开';document.getElementById('status').classList.add('error')});
</script></body></html>`;
}
