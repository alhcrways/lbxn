import { HERO_PALETTE } from './heroPalette';
import { RELEASE_FEATURES } from '../shared/releaseFeatures';

export function controlMenuHtml(walkingEnabled = true, intervalMinutes = 60) {
  const items = [
    ...(RELEASE_FEATURES.growth ? [['growth', '<svg viewBox="0 0 24 24"><path d="M8 8h8v10H8zM9 8c-2-3 2-5 3 0m3 0c2-3-2-5-3 0M6 11h12"/></svg>', '养成系统']] : []),
    ...(RELEASE_FEATURES.chat ? [['chat', '<svg viewBox="0 0 24 24"><path d="M4 5h16v12H9l-5 3z"/><path d="M8 9h8M8 13h5"/></svg>', '和小新聊天']] : []),
    ['friends', '<svg viewBox="0 0 24 24"><path d="M3 6h18v14H3zM3 6l9 7 9-7"/></svg>', '好友消息'],
    ['note', '<svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z"/><path d="M15 4v4h4M8 12h8M8 16h6"/></svg>', '便利贴'],
    ['llmconfig', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>', '聊天设置'],
    ['toggle-walking', '<svg viewBox="0 0 24 24"><path d="M8 4l3 3-2 5 5 2 2 6M9 12l-4 7M11 7l5 3 4-2"/></svg>', `护眼走动提醒：${walkingEnabled ? '开启' : '关闭'}`],
    ['passthrough', '<svg viewBox="0 0 24 24"><path d="M5 4l13 8-6 2-3 6z"/><path d="M14 14l4 5"/></svg>', '鼠标穿透'],
    ['quit', '<svg viewBox="0 0 24 24"><path d="M12 20S4 15.6 4 9.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8 3.5C20 15.6 12 20 12 20z"/></svg>', '退出'],
  ];
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>春日部控制台</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{width:100%;height:100%;overflow:auto}body{padding:8px;background:transparent;color:#594332;font:13px/1.5 "Microsoft YaHei UI","Microsoft YaHei",sans-serif;cursor:default}
    .menu{padding:10px;background:${HERO_PALETTE.blue};border:2.5px solid #594332;border-radius:18px 14px 20px 16px;box-shadow:0 3px 0 #59433230}
    header{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-weight:700;letter-spacing:1px;color:#594332}
    .close{margin-left:auto;flex:none;width:26px;height:26px;border:1.5px solid #594332;border-radius:8px;background:#fffdf3;color:#594332;font-size:20px;line-height:1;cursor:pointer}.close:hover{background:#f8edc9}.close:focus-visible{outline:2px solid ${HERO_PALETTE.focus};outline-offset:2px}
    .badge{display:grid;place-items:center;flex:none;width:32px;height:32px;background:${HERO_PALETTE.yellow};border:1.5px solid #594332;border-radius:10px 7px 11px 8px;transform:rotate(-5deg)}
    .badge svg{width:29px;height:29px}
    .item{display:flex;align-items:center;gap:10px;padding:6px 8px;margin-top:5px;border-radius:10px 8px 12px 8px;font:inherit;color:#594332;cursor:pointer;border:1.5px solid #594332;background:#fffdf3;width:100%;text-align:left;box-shadow:0 2px 0 #59433220}
    .item:hover{background:#f8edc9}.item:focus-visible{background:#f8edc9;outline:2px solid ${HERO_PALETTE.focus};outline-offset:2px}
    .icon{display:grid;place-items:center;flex:none;width:24px;height:24px;background:${HERO_PALETTE.yellow};color:#594332;border:1.5px solid #594332;border-radius:7px 5px 8px 6px}
    .icon svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .item:nth-of-type(2n) .icon{background:${HERO_PALETTE.green};color:#594332}
    .reminder-item{cursor:default;gap:8px;align-items:flex-start}.reminder-body{flex:1;min-width:0}.reminder-heading{display:flex;align-items:center;justify-content:space-between;gap:4px;font-size:12px;white-space:nowrap}.reminder-switch{position:relative;flex:none;width:28px;height:16px;border:1px solid #947253;border-radius:12px;background:#d8cec0;cursor:pointer}.reminder-switch::after{content:'';position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:#fffdf3;box-shadow:0 1px 2px #59433240;transition:transform .15s}.reminder-switch[aria-checked=true]{background:#72955f}.reminder-switch[aria-checked=true]::after{transform:translateX(12px)}.reminder-switch:focus-visible{outline:2px solid ${HERO_PALETTE.focus};outline-offset:2px}.reminder-interval{display:flex;align-items:center;gap:4px;margin-top:5px;font-size:11px;white-space:nowrap}.reminder-interval input{width:52px;min-width:0;padding:2px 3px;border:1px solid #b8a48c;border-radius:4px;color:inherit;background:#fff;font:inherit}.reminder-status{font-size:10px;color:#a84d3c;white-space:normal}.reminder-status:empty{display:none}
    .danger{margin-top:10px;background:#fff1ed;color:#a85e50}.danger .icon{background:${HERO_PALETTE.red}!important;color:#594332}.danger:hover{background:#f5dfd6}
  </style></head><body><div class="menu"><header><span class="badge" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M16 3l4 9 10 3-8 6-1 9-8-6-9 1 3-9-4-6 10 1z" fill="${HERO_PALETTE.blue}" stroke="#594332" stroke-width="1.6" stroke-linejoin="round"/><path d="M21 10l4-7" stroke="#594332" stroke-width="4" stroke-linecap="round"/><path d="M21 10l4-7" stroke="${HERO_PALETTE.red}" stroke-width="2" stroke-linecap="round"/><ellipse cx="12" cy="15" rx="3.5" ry="4.5" fill="${HERO_PALETTE.yellow}" stroke="#594332" stroke-width="1.4"/><ellipse cx="20" cy="18" rx="4.5" ry="3.5" fill="${HERO_PALETTE.yellow}" stroke="#594332" stroke-width="1.4"/></svg></span>春日部控制台<button class="close" data-command="close-menu" aria-label="关闭面板" title="关闭面板">×</button></header>
  ${items.map(([cmd, icon, label]) => cmd === 'toggle-walking' ? `<form id="reminder-settings" class="item reminder-item" aria-label="护眼走动提醒"><span class="icon" aria-hidden="true">${icon}</span><div class="reminder-body"><div class="reminder-heading"><span>护眼走动提醒</span><button class="reminder-switch" type="button" role="switch" aria-label="护眼走动提醒" aria-checked="${walkingEnabled}" data-command="toggle-walking" title="开启或关闭护眼提醒"></button></div><label class="reminder-interval" for="reminder-minutes">间隔<input id="reminder-minutes" aria-label="提醒间隔（分钟）" title="修改后自动保存，按 Enter 也可保存" type="number" min="1" max="1440" step="1" required value="${intervalMinutes}">分钟</label><div id="reminder-status" class="reminder-status" role="status"></div></div></form>` : `<button class="item ${cmd === 'quit' ? 'danger' : ''}" data-command="${cmd}"><span class="icon" aria-hidden="true">${icon}</span>${label}</button>`).join('')}

  <div style="display:flex;gap:4px;margin-top:8px;align-items:center" aria-label="桌宠大小"><span style="white-space:nowrap">桌宠大小</span><button data-command="size-smaller" aria-label="缩小桌宠" style="flex:1">−</button><button data-command="size-reset" style="flex:2">默认</button><button data-command="size-larger" aria-label="放大桌宠" style="flex:1">＋</button></div>
  </div></body></html>`;
}

/** Injected only after the data URL has finished loading to avoid script text flashing. */
export function controlMenuScript() {
  return `(() => {
    const { ipcRenderer } = require('electron');
    const input = document.getElementById('reminder-minutes');
    const status = document.getElementById('reminder-status');
    document.querySelectorAll('[data-command]').forEach(button => {
      button.addEventListener('click', () => ipcRenderer.send('menu-cmd', button.dataset.command));
    });
    ipcRenderer.on('walking-state', (_event, state) => {
      const toggle = document.querySelector('[data-command="toggle-walking"]');
      toggle.setAttribute('aria-checked', String(state.enabled));
    });
    let savedValue = Number(input.value);
    let revision = 0;
    async function saveInterval() {
      if (!input.checkValidity()) { input.reportValidity(); return; }
      const minutes = Number(input.value);
      if (minutes === savedValue) return;
      const current = ++revision;
      try {
        const result = await ipcRenderer.invoke('walking:configure', minutes);
        if (current !== revision) return;
        if (result.ok) { savedValue = minutes; status.textContent = ''; }
        else status.textContent = result.error || '保存失败，请重试';
      } catch { if (current === revision) status.textContent = '保存失败，请重试'; }
    }
    input.addEventListener('change', saveInterval);
    document.getElementById('reminder-settings').addEventListener('submit', event => {
      event.preventDefault(); void saveInterval();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') ipcRenderer.send('menu-cmd', 'close-menu'); });
  })();`;
}
