import { HERO_PALETTE } from './heroPalette';
import { RELEASE_FEATURES } from '../shared/releaseFeatures';

export function controlMenuHtml() {
  const items = [
    ...(RELEASE_FEATURES.growth ? [['growth', '<svg viewBox="0 0 24 24"><path d="M8 8h8v10H8zM9 8c-2-3 2-5 3 0m3 0c2-3-2-5-3 0M6 11h12"/></svg>', '养成系统']] : []),
    ...(RELEASE_FEATURES.chat ? [['chat', '<svg viewBox="0 0 24 24"><path d="M4 5h16v12H9l-5 3z"/><path d="M8 9h8M8 13h5"/></svg>', '和小新聊天']] : []),
    ['note', '<svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z"/><path d="M15 4v4h4M8 12h8M8 16h6"/></svg>', '便利贴'],
    ['llmconfig', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>', '聊天设置'],
    ['passthrough', '<svg viewBox="0 0 24 24"><path d="M5 4l13 8-6 2-3 6z"/><path d="M14 14l4 5"/></svg>', '鼠标穿透'],
    ['quit', '<svg viewBox="0 0 24 24"><path d="M12 20S4 15.6 4 9.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8 3.5C20 15.6 12 20 12 20z"/></svg>', '退出'],
  ];
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>春日部控制台</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{width:100%;height:100%;overflow:hidden}body{padding:8px;background:transparent;color:#594332;font:13px/1.5 "Microsoft YaHei UI","Microsoft YaHei",sans-serif;cursor:default}
    .menu{padding:10px;background:${HERO_PALETTE.blue};border:2.5px solid #594332;border-radius:18px 14px 20px 16px;box-shadow:0 3px 0 #59433230}
    header{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-weight:700;letter-spacing:1px;color:#594332}
    .badge{display:grid;place-items:center;flex:none;width:32px;height:32px;background:${HERO_PALETTE.yellow};border:1.5px solid #594332;border-radius:10px 7px 11px 8px;transform:rotate(-5deg)}
    .badge svg{width:29px;height:29px}
    .item{display:flex;align-items:center;gap:10px;padding:6px 8px;margin-top:5px;border-radius:10px 8px 12px 8px;font:inherit;color:#594332;cursor:pointer;border:1.5px solid #594332;background:#fffdf3;width:100%;text-align:left;box-shadow:0 2px 0 #59433220}
    .item:hover{background:#f8edc9}.item:focus-visible{background:#f8edc9;outline:2px solid ${HERO_PALETTE.focus};outline-offset:2px}
    .icon{display:grid;place-items:center;flex:none;width:24px;height:24px;background:${HERO_PALETTE.yellow};color:#594332;border:1.5px solid #594332;border-radius:7px 5px 8px 6px}
    .icon svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .item:nth-of-type(2n) .icon{background:${HERO_PALETTE.green};color:#594332}
    .danger{margin-top:10px;background:#fff1ed;color:#a85e50}.danger .icon{background:${HERO_PALETTE.red}!important;color:#594332}.danger:hover{background:#f5dfd6}
  </style></head><body><div class="menu"><header><span class="badge" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M16 3l4 9 10 3-8 6-1 9-8-6-9 1 3-9-4-6 10 1z" fill="${HERO_PALETTE.blue}" stroke="#594332" stroke-width="1.6" stroke-linejoin="round"/><path d="M21 10l4-7" stroke="#594332" stroke-width="4" stroke-linecap="round"/><path d="M21 10l4-7" stroke="${HERO_PALETTE.red}" stroke-width="2" stroke-linecap="round"/><ellipse cx="12" cy="15" rx="3.5" ry="4.5" fill="${HERO_PALETTE.yellow}" stroke="#594332" stroke-width="1.4"/><ellipse cx="20" cy="18" rx="4.5" ry="3.5" fill="${HERO_PALETTE.yellow}" stroke="#594332" stroke-width="1.4"/></svg></span>春日部控制台</header>
  ${items.map(([cmd, icon, label]) => `<button class="item ${cmd === 'quit' ? 'danger' : ''}" data-command="${cmd}"><span class="icon" aria-hidden="true">${icon}</span>${label}</button>`).join('')}
  </div></body></html>`;
}

/** Injected only after the data URL has finished loading to avoid script text flashing. */
export function controlMenuScript() {
  return `(() => { const { ipcRenderer } = require('electron'); document.querySelectorAll('[data-command]').forEach(button => { button.addEventListener('click', () => ipcRenderer.send('menu-cmd', button.dataset.command)); }); })();`;
}
