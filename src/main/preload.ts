// preload：通过 contextBridge 暴露安全 API 给渲染进程
import { contextBridge, ipcRenderer } from 'electron';
import type { StoreKey, TrayCommand, WinBounds, LogEntry, ChatMessage, CostumeAssets } from '../shared/types';

const api = {
  // ---- 数据 ----
  getData: (key: StoreKey) => ipcRenderer.invoke('pet:getData', key) as Promise<unknown>,
  setData: (key: StoreKey, value: unknown) =>
    ipcRenderer.invoke('pet:setData', key, value) as Promise<{ ok: boolean; error?: string }>,
  appendLog: (entry: { type: LogEntry['type']; text: string; note?: string }) =>
    ipcRenderer.invoke('pet:appendLog', entry) as Promise<{ result: LogEntry; ok: boolean; error?: string }>,
  updateLogNote: (id: string, note: string) =>
    ipcRenderer.invoke('pet:updateLogNote', id, note) as Promise<{ ok: boolean; error?: string }>,
  // ---- 窗口 ----
  dragStart: () => ipcRenderer.invoke('pet:dragStart') as Promise<{ ok: boolean }>,
  dragEnd: () =>
    ipcRenderer.invoke('pet:dragEnd') as Promise<{ bounds: WinBounds | null; speed: number } | null>,
  setWindowSize: (width: number, height: number) =>
    ipcRenderer.invoke('pet:setWindowSize', width, height) as Promise<WinBounds | null>,
  /** 打开或关闭独立聊天小窗；主桌宠窗口不再因聊天而伸缩。 */
  setChatWindowOpen: (open: boolean) =>
    ipcRenderer.invoke('pet:setChatWindowOpen', open) as Promise<{ open: boolean }>,
  onChatWindowState: (cb: (open: boolean) => void) => {
    const listener = (_e: unknown, open: boolean) => cb(open);
    ipcRenderer.on('chat-window-state', listener);
    return () => { ipcRenderer.off('chat-window-state', listener); };
  },
  onChatStatus: (cb: (busy: boolean) => void) => {
    const listener = (_e: unknown, busy: boolean) => cb(busy);
    ipcRenderer.on('chat-status', listener);
    return () => { ipcRenderer.off('chat-status', listener); };
  },
  setIgnoreMouseEvents: (flag: boolean) => ipcRenderer.invoke('pet:setIgnoreMouseEvents', flag),
  /** 打开浮层：记住桌宠位置并把窗口移到屏幕内完整可见处 */
  openOverlay: () => ipcRenderer.invoke('pet:openOverlay') as Promise<WinBounds | null>,
  /** 关闭浮层：精确还原桌宠位置 */
  closeOverlay: () => ipcRenderer.invoke('pet:closeOverlay'),
  /** 右键菜单指令转发（穿透切换 / 退出） */
  command: (cmd: TrayCommand) => ipcRenderer.invoke('pet:command', cmd),
  /** 右键 → 弹出独立菜单窗口 */
  openMenu: () => ipcRenderer.invoke('pet:openMenu'),
  quit: () => ipcRenderer.invoke('pet:quit'),
  /** 扫描 character/{costume}/ 目录，返回该形象资源清单（姿态单图/动画 + 随机池 + 时段池） */
  listCostumeAssets: (costume: string) =>
    ipcRenderer.invoke('pet:listCostumeAssets', costume) as Promise<CostumeAssets>,
  // ---- 聊天（DeepSeek 流式） ----
  /** 发送聊天消息，流式 chunk 通过 onChatChunk 回调推送 */
  chat: (message: string) =>
    ipcRenderer.invoke('pet:chat', message) as Promise<{ ok: boolean; response?: string; error?: string }>,
  /** 流式 chunk 回调，返回取消订阅函数 */
  onChatChunk: (cb: (delta: string) => void) => {
    const listener = (_e: unknown, delta: string) => cb(delta);
    ipcRenderer.on('chat-chunk', listener);
    return () => { ipcRenderer.off('chat-chunk', listener); };
  },
  /** 聊天完成回调，返回取消订阅函数 */
  onChatDone: (cb: (fullText: string) => void) => {
    const listener = (_e: unknown, text: string) => cb(text);
    ipcRenderer.on('chat-done', listener);
    return () => { ipcRenderer.off('chat-done', listener); };
  },
  /** 聊天错误回调，返回取消订阅函数 */
  onChatError: (cb: (error: string) => void) => {
    const listener = (_e: unknown, error: string) => cb(error);
    ipcRenderer.on('chat-error', listener);
    return () => { ipcRenderer.off('chat-error', listener); };
  },
  /** 手机端消息回调（手机网页发来的留言），返回取消订阅函数 */
  onMobileMessage: (cb: (message: string) => void) => {
    const listener = (_e: unknown, message: string) => cb(message);
    ipcRenderer.on('mobile-message', listener);
    return () => { ipcRenderer.off('mobile-message', listener); };
  },
  /** 获取 LLM 配置（API Key 脱敏） */
  getLlmConfig: () =>
    ipcRenderer.invoke('pet:getLlmConfig') as Promise<{ baseUrl: string; model: string; hasApiKey: boolean }>,
  /** 获取聊天历史 */
  getChatHistory: () => ipcRenderer.invoke('pet:getChatHistory') as Promise<ChatMessage[]>,
  // ---- 托盘事件 ----
  onTrayCommand: (cb: (cmd: TrayCommand) => void) => {
    const listener = (_e: unknown, cmd: TrayCommand) => cb(cmd);
    ipcRenderer.on('tray-command', listener);
    // 返回取消订阅函数，供 effect 清理，避免 StrictMode 重复挂载叠加监听
    return () => {
      ipcRenderer.off('tray-command', listener);
    };
  },
};

contextBridge.exposeInMainWorld('petAPI', api);

export type PetAPI = typeof api;
