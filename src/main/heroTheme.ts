import { HERO_PALETTE } from './heroPalette';
// 原生独立窗口共用动感超人配色与卡通面板样式。
export const HERO_PANEL_CSS = `
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{padding:8px;background:transparent;color:#594332;font:13px/1.5 "Microsoft YaHei",sans-serif}
button,input,select{font:inherit}button{cursor:pointer;color:inherit}button:disabled{opacity:.55;cursor:wait}
.panel{height:100%;display:flex;flex-direction:column;padding:12px;background:${HERO_PALETTE.blue};border:2.5px solid #594332;border-radius:18px 14px 20px 16px;box-shadow:0 3px 0 #59433230;overflow:hidden}
.heading{display:flex;align-items:center;gap:9px;color:#594332;font-size:15px;font-weight:700;margin-bottom:12px;-webkit-app-region:drag}
.emblem{display:grid;place-items:center;width:30px;height:30px;background:${HERO_PALETTE.yellow};color:#594332;border:1.5px solid #594332;border-radius:9px 6px 10px 7px;transform:rotate(-5deg)}
.close{color:#594332;margin-left:auto;width:26px;height:26px;padding:0;border:1.5px solid #594332;border-radius:8px;background:#fffdf3;font-size:19px;line-height:1;-webkit-app-region:no-drag}
.card{min-height:0;padding:14px;background:#fffdf3;border:1.5px solid #594332;border-radius:12px 9px 14px 10px}
.primary{padding:8px 12px;background:${HERO_PALETTE.yellow};border:1.5px solid #594332;border-radius:9px 6px 10px 7px;font-weight:700;box-shadow:0 2px 0 #59433220}
button:hover{filter:brightness(.96)}button:focus-visible,input:focus-visible{outline:2px solid ${HERO_PALETTE.focus};outline-offset:2px}
.secondary{padding:5px 10px;background:${HERO_PALETTE.green};color:#594332;border:1.5px solid #594332;border-radius:7px 5px 8px 6px}
.danger{padding:5px 10px;background:#fff1ed;color:#a85e50;border:1.5px solid #594332;border-radius:7px 5px 8px 6px}
.error{color:#a85e50;font-size:12px;margin:6px 0 0}
`;
