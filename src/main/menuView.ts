import { HERO_PALETTE } from './heroPalette';
import { RELEASE_FEATURES } from '../shared/releaseFeatures';

export function controlMenuHtml() {
  const items = [
    ...(RELEASE_FEATURES.growth ? [['growth', '🍬', '养成系统']] : []),
    ...(RELEASE_FEATURES.chat ? [['chat', '💬', '和小新聊天']] : []),
    ['note', '✎', '便利贴'],
    ['llmconfig', '⚙', '聊天设置'],
    ['passthrough', '↗', '鼠标穿透'],
    ['quit', '♡', '退出'],
  ];
  return `<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{padding:8px;background:transparent;color:#594332;font:13px/1.5 "Microsoft YaHei",sans-serif;cursor:default}
    .menu{padding:10px;background:${HERO_PALETTE.blue};border:2.5px solid #594332;border-radius:18px 14px 20px 16px;box-shadow:0 3px 0 #59433230}
    header{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-weight:700;letter-spacing:1px;color:#594332}
    .badge{display:grid;place-items:center;flex:none;width:32px;height:32px;background:${HERO_PALETTE.yellow};border:1.5px solid #594332;border-radius:10px 7px 11px 8px;transform:rotate(-5deg)}
    .badge svg{width:29px;height:29px}
    .item{display:flex;align-items:center;gap:10px;padding:6px 8px;margin-top:5px;border-radius:10px 8px 12px 8px;font:inherit;color:#594332;cursor:pointer;border:1.5px solid #594332;background:#fffdf3;width:100%;text-align:left;box-shadow:0 2px 0 #59433220}
    .item:hover{background:#f8edc9}.item:focus-visible{background:#f8edc9;outline:2px solid ${HERO_PALETTE.focus};outline-offset:2px}
    .icon{display:grid;place-items:center;flex:none;width:24px;height:24px;background:${HERO_PALETTE.yellow};color:#594332;border:1.5px solid #594332;border-radius:7px 5px 8px 6px;font-size:16px;font-weight:700}
    .item:nth-of-type(2n) .icon{background:${HERO_PALETTE.green};color:#594332}
    .danger{margin-top:10px;background:#fff1ed;color:#a85e50}.danger .icon{background:${HERO_PALETTE.red}!important;color:#594332}.danger:hover{background:#f5dfd6}
  </style><body><div class="menu"><header><span class="badge" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M16 3l4 9 10 3-8 6-1 9-8-6-9 1 3-9-4-6 10 1z" fill="${HERO_PALETTE.blue}" stroke="#594332" stroke-width="1.6" stroke-linejoin="round"/><path d="M21 10l4-7" stroke="#594332" stroke-width="4" stroke-linecap="round"/><path d="M21 10l4-7" stroke="${HERO_PALETTE.red}" stroke-width="2" stroke-linecap="round"/><ellipse cx="12" cy="15" rx="3.5" ry="4.5" fill="${HERO_PALETTE.yellow}" stroke="#594332" stroke-width="1.4"/><ellipse cx="20" cy="18" rx="4.5" ry="3.5" fill="${HERO_PALETTE.yellow}" stroke="#594332" stroke-width="1.4"/></svg></span>春日部控制台</header>
  ${items.map(([cmd, icon, label]) => `<button class="item ${cmd === 'quit' ? 'danger' : ''}" onclick="cmd('${cmd}')"><span class="icon" aria-hidden="true">${icon}</span>${label}</button>`).join('')}
  </div><script>const{ipcRenderer}=require('electron');function cmd(c){ipcRenderer.send('menu-cmd',c)}</script></body></html>`;
}
