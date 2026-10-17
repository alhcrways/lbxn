// 蜡笔小新桌宠 · 主进程
// 职责：透明置顶无边框窗口、托盘菜单、窗口移动/穿透控制、本地数据 IPC
import { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, dialog, Notification } from 'electron';
import { join, relative, resolve, sep } from 'node:path';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as http from 'node:http';
import * as os from 'node:os';
import { initStores, getData, setData, appendLog, updateLogNote, appendChatMessage, appendNote, updateNote, deleteNote } from './store';
import { streamChat, buildChatMessages } from './llm';
import { NOTE_COLORS, type NoteStickers } from './noteView';
import { resolveProviderSelection } from './modelPresets';
import { settingsHtml } from './settingsView';
import { noteFolderHtml } from './noteFolderView';
import { controlMenuHtml } from './menuView';
import { chatWindowHtml } from './chatView';
import { RELEASE_FEATURES } from '../shared/releaseFeatures';
import { SHINCHAN_PERSONA } from '../shared/persona';
import type { StoreKey, TrayCommand, WinBounds, LlmConfig, ChatMessage, StickyNote, NoteColor, CostumeAssets, ServerAuth, OutfitData, PetState } from '../shared/types';

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let passthrough = false;
/** 打开浮层前桌宠窗口的位置，关闭浮层时据此精确还原 */
let savedPetBounds: WinBounds | null = null;
/** 右键菜单的独立悬浮窗（不碰主窗口尺寸，小新绝不位移） */
let menuWin: BrowserWindow | null = null;
/** API Key 配置窗口 */
let configWin: BrowserWindow | null = null;
/** 独立聊天小窗：桌宠主窗口保持固定尺寸，避免透明窗口伸缩产生残影。 */
let chatWin: BrowserWindow | null = null;
let noteFolderWin: BrowserWindow | null = null;
/** 便利贴窗口池（noteId → BrowserWindow），未固定与已固定共用 */
const noteWins = new Map<string, BrowserWindow>();

// 无 GPU / 受限沙箱（远程桌面、容器等）环境的逃生开关：
// 设置环境变量 SHINCHAN_NO_GPU=1 启动
if (process.env.SHINCHAN_NO_GPU === '1') {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
  app.commandLine.appendSwitch('no-sandbox');
  app.disableHardwareAcceleration();
}

const isDev = !!process.env.ELECTRON_START_URL;

// Windows 通知需要 AppUserModelID 才能正常弹出（手机连接开启时用它显示访问地址）
app.setAppUserModelId('com.shinchan.pet');

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  // 桌宠窗口默认只有人物大小；气泡/浮层出现时由渲染进程动态调整尺寸
  const width = 170;
  const height = 204;

  win = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 60,
    y: workArea.y + workArea.height - height - 40,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false, // 位置由渲染进程拖拽逻辑控制
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');

  if (isDev) {
    win.loadURL(process.env.ELECTRON_START_URL!);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'));
  }

  win.once('ready-to-show', () => {
    const w = win;
    if (!w) return;
    w.show();
    // 置顶失败降级提示（PRD 边界情况：权限不足）
    if (!w.isAlwaysOnTop()) {
      dialog.showMessageBox(w, {
        type: 'info',
        message: '小新需要置顶权限才能陪你哦～请在系统设置中启用',
      });
    }
  });

  win.on('closed', () => {
    if (chatWin && !chatWin.isDestroyed()) chatWin.close();
    win = null;
  });
}

/** 拖拽移动窗口，并限制在显示器工作区内 */
function moveWindow(x: number, y: number, size: { width: number; height: number }) {
  if (!win) return;
  const displays = screen.getAllDisplays();
  // 找到距离最近的显示器，取其工作区做夹取
  let target = screen.getPrimaryDisplay().workArea;
  let bestDist = Infinity;
  for (const d of displays) {
    const wa = d.workArea;
    const cx = Math.max(wa.x, Math.min(x, wa.x + wa.width));
    const cy = Math.max(wa.y, Math.min(y, wa.y + wa.height));
    const dist = (cx - x) ** 2 + (cy - y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      target = wa;
    }
  }
  const nx = Math.round(Math.min(Math.max(x, target.x), target.x + target.width - size.width));
  const ny = Math.round(Math.min(Math.max(y, target.y), target.y + target.height - size.height));
  // 必须用 setBounds 显式钉死尺寸：Windows 上 transparent 窗口调用 setPosition
  // 在 DPI 缩放下会引发尺寸持续漂移（表现为鼠标停住后小新还在自己移动）
  win.setBounds({ x: nx, y: ny, width: size.width, height: size.height });
  positionChatWindow();
}

/**
 * 主进程接管拖拽：轮询系统光标位置来移动窗口。
 * getCursorScreenPoint() 与 getBounds()/setPosition() 同处 DIP 坐标系，
 * 彻底规避渲染进程 clientX/Y 的 DPI 换算误差，以及拖拽途中窗口
 * 因气泡出现/消失而伸缩导致的抓取基准失效（表现为"一拖就往上飘"）。
 */
let dragState: {
  cursor: { x: number; y: number };
  origin: { x: number; y: number };
  /** 拖拽开始时的窗口尺寸快照：tick 中 setBounds 显式保持，防 DPI 漂移 */
  size: { width: number; height: number };
  prev: { t: number; x: number; y: number };
  speed: number;
  timer: ReturnType<typeof setInterval>;
} | null = null;

function startDrag() {
  if (!win) return { ok: false };
  const b = win.getBounds();
  const c = screen.getCursorScreenPoint();
  // 若上一次拖拽未正常结束（松手事件丢失导致卡死），先清理旧轮询，
  // 避免多个定时器叠加、窗口被旧基准拖走
  if (dragState) clearInterval(dragState.timer);
  dragState = {
    cursor: { x: c.x, y: c.y },
    origin: { x: b.x, y: b.y },
    size: { width: b.width, height: b.height },
    prev: { t: Date.now(), x: c.x, y: c.y },
    speed: 0,
    timer: setInterval(() => {
      const ds = dragState;
      if (!ds || !win) return;
      const cur = screen.getCursorScreenPoint();
      const now = Date.now();
      const dt = now - ds.prev.t;
      if (dt > 0) {
        // 记录最近一次光标瞬时速度（px/s），用于松手时的"甩飞"判定
        ds.speed = (Math.hypot(cur.x - ds.prev.x, cur.y - ds.prev.y) / dt) * 1000;
      }
      ds.prev = { t: now, x: cur.x, y: cur.y };
      moveWindow(ds.origin.x + (cur.x - ds.cursor.x), ds.origin.y + (cur.y - ds.cursor.y), ds.size);
    }, 10),
  };
  return { ok: true };
}

function endDrag() {
  const speed = dragState?.speed ?? 0;
  if (dragState) {
    clearInterval(dragState.timer);
    dragState = null;
  }
  return { bounds: win?.getBounds() ?? null, speed };
}

/**
 * 调整窗口尺寸：保持「底部中心」（人物所在处）锚点绝对不动。
 * 工作区空间不足时按可用空间「收缩」窗口，而不是把窗口平移进来——
 * 平移会连带人物一起位移（表现为：贴边时每弹一次气泡/菜单，小新就跳一段）。
 */
function setWindowSize(width: number, height: number) {
  if (!win) return null;
  // 拖拽进行中冻结尺寸：伸缩会改变窗口原点，破坏拖拽的抓取基准
  if (dragState) return win.getBounds();
  const b = win.getBounds();
  const cx = b.x + b.width / 2;
  const by = b.y + b.height;
  // 找到锚点所在（或最近）显示器的工作区
  let target = screen.getPrimaryDisplay().workArea;
  let bestDist = Infinity;
  for (const d of screen.getAllDisplays()) {
    const wa = d.workArea;
    const px = Math.max(wa.x, Math.min(cx, wa.x + wa.width));
    const py = Math.max(wa.y, Math.min(by, wa.y + wa.height));
    const dist = (px - cx) ** 2 + (py - by) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      target = wa;
    }
  }
  // 人物中心到工作区左/右/上边缘的可用空间（拖拽夹取保证窗口始终完整落在工作区内，
  // 因此可用空间至少能容纳人物本体 170×204）
  const availW = Math.min(2 * (cx - target.x), 2 * (target.x + target.width - cx));
  const availH = by - target.y;
  const w = Math.round(Math.max(Math.min(width, availW), 170));
  const h = Math.round(Math.max(Math.min(height, availH), 204));
  if (b.width === w && b.height === h) return b;
  win.setBounds({ x: Math.round(cx - w / 2), y: Math.round(by - h), width: w, height: h });
  return win.getBounds();
}

function sendTrayCommand(cmd: TrayCommand) {
  win?.webContents.send('tray-command', cmd);
  if (cmd === 'quit') {
    app.quit();
  } else if (cmd === 'toggle-passthrough') {
    passthrough = !passthrough;
    win?.setIgnoreMouseEvents(passthrough, { forward: true });
  } else if (cmd === 'toggle-top') {
    if (win) win.setAlwaysOnTop(!win.isAlwaysOnTop(), 'screen-saver');
  } else if (cmd === 'show-hide') {
    if (win?.isVisible()) win.hide();
    else win?.show();
  }
}

/**
 * 右键菜单独立悬浮窗：完全不碰主窗口尺寸（小新绝不位移），
 * 锚定在小新头顶上方居中；上方空间不够时翻到下方；水平夹取到屏幕内。
 * 用 nodeIntegration + ipcRenderer.send 直接通信，不走导航（最可靠）。
 */
function openMenuWindow() {
  if (!win) return;
  if (dragState) return; // 拖拽中不弹
  if (menuWin) {
    menuWin.close(); // 已打开 → 再次右键关闭
    return;
  }

  const menuW = 224;
  const menuH = 276 + (RELEASE_FEATURES.growth ? 44 : 0) + (RELEASE_FEATURES.chat ? 44 : 0);
  const b = win.getBounds();
  const { workArea } = screen.getPrimaryDisplay();
  // 手机连接入口暂从 UI 隐藏（功能代码保留，恢复时把菜单项加回即可）
  const mobileUrl: string | null = null;

  // 菜单锚定在小新头顶上方居中
  let mx = Math.round(b.x + (b.width - menuW) / 2);
  let my = Math.round(b.y - menuH - 8);
  // 上方空间不足 → 翻到小新下方
  if (my < workArea.y) {
    my = Math.round(b.y + b.height + 8);
  }
  // 水平夹取到工作区内
  mx = Math.max(workArea.x, Math.min(mx, workArea.x + workArea.width - menuW));

  const html = controlMenuHtml();

  menuWin = new BrowserWindow({
    x: mx,
    y: my,
    width: menuW,
    height: menuH,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    },
  });
  menuWin.setAlwaysOnTop(true, 'screen-saver');

  const currentMenu = menuWin;
  currentMenu.once('ready-to-show', () => { if (!currentMenu.isDestroyed()) currentMenu.show(); });
  void currentMenu.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  // 失焦 / 关闭时清理
  menuWin.on('blur', () => menuWin?.close());
  menuWin.on('closed', () => {
    menuWin = null;
  });
}

/**
 * API Key 配置窗口：与右键菜单类似的独立悬浮窗，
 * 用 nodeIntegration + ipcRenderer 通信，风格与菜单一致。
 */
function openLlmConfigWindow() {
  if (configWin) {
    configWin.focus();
    return;
  }

  const cfg = getData('llmConfig') as LlmConfig;

  const cw = 320;
  const ch = 440;
  const b = win?.getBounds() ?? { x: 0, y: 0, width: 170, height: 204 };
  const { workArea } = screen.getPrimaryDisplay();
  let mx = Math.round(b.x + (b.width - cw) / 2);
  let my = Math.round(b.y - ch - 8);
  if (my < workArea.y) my = Math.round(b.y + b.height + 8);
  mx = Math.max(workArea.x, Math.min(mx, workArea.x + workArea.width - cw));

  const html = settingsHtml(cfg);

  configWin = new BrowserWindow({
    x: mx,
    y: my,
    width: cw,
    height: ch,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    },
  });
  configWin.setAlwaysOnTop(true, 'screen-saver');
  const currentConfig = configWin;
  currentConfig.once('ready-to-show', () => { if (!currentConfig.isDestroyed()) currentConfig.show(); });
  void configWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)).then(() => {
    configWin?.focus();
  });
  configWin.on('blur', () => configWin?.close());
  configWin.on('closed', () => {
    configWin = null;
  });
}

const CHAT_WINDOW_SIZE = { width: 250, height: 220 };

/** 将聊天小窗贴在小新侧边，并在屏幕边缘自动翻到另一侧。 */
function positionChatWindow() {
  if (!win || !chatWin || chatWin.isDestroyed()) return;
  const pet = win.getBounds();
  const area = screen.getDisplayMatching(pet).workArea;
  let x = pet.x + pet.width - 24;
  if (x + CHAT_WINDOW_SIZE.width > area.x + area.width) x = pet.x - CHAT_WINDOW_SIZE.width + 24;
  const y = pet.y + pet.height - CHAT_WINDOW_SIZE.height + 12;
  chatWin.setBounds({
    x: Math.max(area.x, Math.min(Math.round(x), area.x + area.width - CHAT_WINDOW_SIZE.width)),
    y: Math.max(area.y, Math.min(Math.round(y), area.y + area.height - CHAT_WINDOW_SIZE.height)),
    ...CHAT_WINDOW_SIZE,
  });
}

function openChatWindow() {
  if (!win) return false;
  if (chatWin && !chatWin.isDestroyed()) {
    positionChatWindow();
    chatWin.show();
    chatWin.focus();
    return true;
  }
  chatWin = new BrowserWindow({
    width: CHAT_WINDOW_SIZE.width,
    height: CHAT_WINDOW_SIZE.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    show: false,
    webPreferences: { contextIsolation: false, nodeIntegration: true },
  });
  chatWin.setAlwaysOnTop(true, 'screen-saver');
  positionChatWindow();
  const current = chatWin;
  current.once('ready-to-show', () => {
    if (current.isDestroyed()) return;
    current.show();
    current.focus();
  });
  current.on('closed', () => {
    if (chatWin === current) chatWin = null;
    win?.webContents.send('chat-window-state', false);
  });
  void current.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(chatWindowHtml()));
  return true;
}

function closeChatWindow() {
  if (chatWin && !chatWin.isDestroyed()) chatWin.close();
}

// ---------- 便利贴 ----------
const NOTE_W = 300;
const NOTE_H = 340;
const noteCloseAllowed = new WeakSet<BrowserWindow>();
const noteResizeOrigins = new Map<string, { cursorY: number; bounds: WinBounds }>();
let quittingWithSavedNotes = false;
let savingBeforeQuit = false;
function noteStickerSources(): NoteStickers {
  const root = join(__dirname, '../assets/note-decor');
  return {
    shiro: pathToFileURL(join(root, 'shiro.png')).href,
    hero: pathToFileURL(join(root, 'hero-collage.png')).href,
    robot: pathToFileURL(join(root, 'robot.png')).href,
    chocobi: pathToFileURL(join(root, 'chocobi.png')).href,
    pattern: pathToFileURL(join(root, 'chocobi-pattern.png')).href,
  };
}

/** Capture the actual editor value before closing, including an unfinished debounce. */
async function flushNote(nw: BrowserWindow, id: string, unpin = false) {
  if (nw.isDestroyed()) return true;
  try {
    const draft: { content?: unknown; color?: unknown } = await nw.webContents.executeJavaScript('window.getNoteDraft?.() ?? ({ content: null, color: null })');
    const patch: Parameters<typeof updateNote>[1] = { bounds: nw.getBounds() };
    if (typeof draft.content === 'string') patch.content = draft.content;
    if (draft.color === 'yellow' || draft.color === 'green' || draft.color === 'pink') patch.color = draft.color;
    if (unpin) patch.pinned = false;
    return updateNote(id, patch).ok;
  } catch { return false; }
}

function createNoteWindow(note: StickyNote, focus = true) {
  const existing = noteWins.get(note.id);
  if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return; }
  const anchor = note.bounds ?? win?.getBounds();
  const wa = anchor ? screen.getDisplayMatching(anchor).workArea : screen.getPrimaryDisplay().workArea;
  const width = Math.min(wa.width, Math.max(180, note.bounds?.width ?? NOTE_W));
  const height = Math.min(wa.height, Math.max(96, note.bounds?.height ?? NOTE_H));
  const pet = win?.getBounds() ?? { x: wa.x + 80, y: wa.y + 80, width: 170, height: 204 };
  const stagger = (noteWins.size % 5) * 22;
  let x = note.bounds?.x ?? pet.x + pet.width + 12 + stagger;
  if (!note.bounds && x + width > wa.x + wa.width) x = pet.x - width - 12 - stagger;
  const y = Math.max(wa.y, Math.min(note.bounds?.y ?? pet.y + stagger, wa.y + wa.height - height));
  x = Math.max(wa.x, Math.min(x, wa.x + wa.width - width));
  const nw = new BrowserWindow({
    x, y, width, height, minWidth: width, maxWidth: width, minHeight: Math.min(96, wa.height),
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    alwaysOnTop: note.pinned, skipTaskbar: true, resizable: true, focusable: true, show: false,
    webPreferences: { contextIsolation: false, nodeIntegration: true },
  });
  nw.setAlwaysOnTop(note.pinned, 'screen-saver');
  let boundsTimer: ReturnType<typeof setTimeout> | undefined;
  const saveBounds = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (!nw.isDestroyed() && !updateNote(note.id, { bounds: nw.getBounds() }).ok) nw.webContents.send('note:save-error');
    }, 250);
  };
  nw.on('moved', saveBounds);
  nw.on('resized', saveBounds);
  let closing = false;
  nw.on('close', (event) => {
    if (quittingWithSavedNotes || noteCloseAllowed.has(nw)) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    void flushNote(nw, note.id, true).then((ok) => {
      closing = false;
      if (nw.isDestroyed()) return;
      if (ok) { noteCloseAllowed.add(nw); nw.close(); }
      else nw.webContents.send('note:save-error');
    });
  });
  nw.on('closed', () => { clearTimeout(boundsTimer); noteResizeOrigins.delete(note.id); noteWins.delete(note.id); });
  noteWins.set(note.id, nw);
  // Local HTML + file image URLs avoid Chromium's ~2MB data: URL limit.
  void nw.loadFile(join(__dirname, '../assets/note-window.html')).then(() => {
    if (nw.isDestroyed()) return;
    if (focus) { nw.show(); nw.focus(); } else nw.showInactive();
  }).catch(() => {
    if (!nw.isDestroyed()) { noteCloseAllowed.add(nw); nw.close(); }
    void dialog.showMessageBox({ type: 'error', message: '便利贴窗口未能打开，内容仍保留在便签夹。请重启应用后重试。' });
  });
}

function newNoteWindow() {
  const result = appendNote({ content: '', pinned: false, color: 'yellow' });
  if (!result.ok || !result.result) {
    void dialog.showMessageBox({ type: 'info', message: result.error || '便利贴创建失败，请检查磁盘空间。' });
    return { ok: false, error: result.error || '便利贴创建失败' };
  }
  createNoteWindow(result.result);
  return { ok: true };
}

async function deleteNoteFromFolder(id: string) {
  const nw = noteWins.get(id);
  if (nw && !await flushNote(nw, id)) { nw.webContents.send('note:save-error'); return { ok: false, error: '便签保存失败，暂未删除' }; }
  const note = (getData('notes') as StickyNote[]).find((n) => n.id === id);
  if (!note) return { ok: false, error: '便签已不存在' };
  const answer = await dialog.showMessageBox({ type: 'question',
    message: '删除这张便利贴？', detail: note.content.trim().slice(0, 100) || '空白便利贴',
    buttons: ['取消', '删除'], defaultId: 0, cancelId: 0,
  });
  if (answer.response !== 1) return { ok: true };
  const result = deleteNote(id);
  if (result.ok && nw && !nw.isDestroyed()) { noteCloseAllowed.add(nw); nw.close(); }
  return result;
}

/** A folder exposes every saved note, rather than only the most recent draft. */
function openNoteEditor(parent?: BrowserWindow) {
  if (noteFolderWin && !noteFolderWin.isDestroyed()) { noteFolderWin.show(); noteFolderWin.focus(); return; }
  const anchor = (parent ?? win)?.getBounds();
  const area = screen.getDisplayMatching(anchor ?? screen.getPrimaryDisplay().workArea).workArea;
  const width = Math.min(360, area.width), height = Math.min(430, area.height);
  const folder = new BrowserWindow({
    x: Math.max(area.x, Math.min(anchor?.x ?? area.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(anchor?.y ?? area.y, area.y + area.height - height)),
    width, height, frame: false, transparent: true, backgroundColor: '#00000000',
    alwaysOnTop: true, skipTaskbar: true, resizable: false, show: false,
    webPreferences: { contextIsolation: false, nodeIntegration: true },
  });
  noteFolderWin = folder;
  folder.setAlwaysOnTop(true, 'screen-saver');
  folder.once('ready-to-show', () => { if (!folder.isDestroyed()) folder.show(); });
  folder.on('closed', () => { if (noteFolderWin === folder) noteFolderWin = null; });
  void folder.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(noteFolderHtml()));
}
function restorePinnedNotes() {
  for (const note of getData('notes') as StickyNote[]) if (note.pinned) createNoteWindow(note, false);
}

// Wait for the final keystrokes before app quit; keep pin state for next launch.
app.on('before-quit', (event) => {
  if (quittingWithSavedNotes || noteWins.size === 0) return;
  event.preventDefault();
  if (savingBeforeQuit) return;
  savingBeforeQuit = true;
  void Promise.all([...noteWins].map(([id, nw]) => flushNote(nw, id))).then((results) => {
    savingBeforeQuit = false;
    if (results.every(Boolean)) { quittingWithSavedNotes = true; app.quit(); }
    else void dialog.showMessageBox({ type: 'error', message: '部分便利贴未能保存，暂未退出。请检查磁盘空间后重试。' });
  });
});

// ---------- 手机连接（局域网网页版，与电脑端共用聊天历史） ----------
let mobileServer: http.Server | null = null;
let mobilePort = 0;
let mobileHeartbeat: ReturnType<typeof setInterval> | null = null;
/** 已连接手机端的 SSE 响应集合 */
const sseClients = new Set<http.ServerResponse>();
/** 一轮聊天进行中标记：电脑/手机任一端发送时另一端会被拒绝 */
let chatBusy = false;

/** 局域网内网 IPv4 地址（找不到则返回 null） */
function lanAddress(): string | null {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const it of list ?? []) {
      if (it.family === 'IPv4' && !it.internal) return it.address;
    }
  }
  return null;
}

/** 手机访问的完整地址（带令牌）；未开启时返回 null */
function mobileServerUrl(): string | null {
  if (!mobileServer || !mobilePort) return null;
  const ip = lanAddress();
  if (!ip) return null;
  const auth = getData('serverAuth') as ServerAuth;
  return `http://${ip}:${mobilePort}/?t=${auth.token}`;
}

/** 静态资源根目录：dev 读源码 public，生产读 dist 构建产物 */
function mobileStaticRoot(): string {
  return isDev ? join(__dirname, '../../src/renderer/public') : join(__dirname, '../dist');
}

/** 防路径穿越：把相对路径钉死在静态根目录内 */
function safeStaticPath(rel: string): string | null {
  const root = resolve(mobileStaticRoot());
  const p = resolve(join(root, rel));
  return p.startsWith(root + sep) ? p : null;
}

function serveFile(res: http.ServerResponse, file: string, type: string) {
  try {
    const data = readFileSync(file);
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
}

/** SSE 事件广播到所有已连接的手机端 */
function sseBroadcast(event: string, data: unknown) {
  if (sseClients.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

/**
 * 扫描某形象的整套动画资产（电脑端渲染与手机端 /assets 接口共用）。
 * 目录结构：
 *   character/<形象>/idle.png happy.png ...   → 姿态单图（文件名去扩展名 = 姿态名）
 *   character/<形象>/dance/01.png 02.png ...  → 姿态帧动画（目录名 = 姿态名，覆盖同名单图语义）
 *   character/<形象>/random/<动画名>/...      → 随机池
 *   character/<形象>/timed/idle-HHMM/...      → 时段池
 */
function scanCostume(costume: string): CostumeAssets {
  const extRe = /\.(png|webp|apng)$/i; // 序列帧仅用 png/webp/apng（gif 有黑底问题已弃用）
  const DEFAULT_FRAME_MS = 125;
  const EMPTY: CostumeAssets = { poses: {}, random: [], timed: [] };
  // 白名单校验，防路径穿越
  if (costume !== 'default' && costume !== 'superman' && costume !== 'pajamas') return EMPTY;
  const charDir = join(__dirname, isDev ? '../../src/renderer/public/character' : '../dist/character');
  const root = join(charDir, costume);
  const rel = `character/${costume}`;

  /** 读子目录内 frame.txt，返回帧间隔毫秒；不存在/无效则返回默认 */
  const readFrameMs = (dir: string): number => {
    try {
      const raw = readFileSync(join(dir, 'frame.txt'), 'utf8').trim();
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 16 && n <= 2000) return n;
    } catch {
      /* frame.txt 不存在或读失败 → 用默认 */
    }
    return DEFAULT_FRAME_MS;
  };
  /** 列出某目录下按文件名排序的帧文件（相对 character 根的完整路径） */
  const listFrames = (dir: string): string[] => {
    try {
      return readdirSync(dir)
        .filter((f) => extRe.test(f))
        .sort()
        .map((f) => `${dir === root ? rel : `${rel}/${relative(root, dir)}`}/${f}`);
    } catch {
      return [];
    }
  };
  /** 列出某目录下所有子目录 */
  const listSubDirs = (dir: string): string[] => {
    try {
      return readdirSync(dir).filter((f) => {
        try {
          return statSync(join(dir, f)).isDirectory();
        } catch {
          return false;
        }
      });
    } catch {
      return [];
    }
  };

  try {
    const result: CostumeAssets = { poses: {}, random: [], timed: [] };

    // ① 形象根目录：文件 → 姿态单图；子目录（排除 random/timed）→ 姿态帧动画
    const entries = readdirSync(root, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile() && extRe.test(ent.name)) {
        const poseName = ent.name.replace(extRe, '');
        result.poses[poseName] = { kind: 'image', src: `${rel}/${ent.name}` };
      } else if (ent.isDirectory() && ent.name !== 'random' && ent.name !== 'timed') {
        const frames = listFrames(join(root, ent.name));
        if (frames.length > 0) {
          result.poses[ent.name] = { kind: 'anim', frames, frameMs: readFrameMs(join(root, ent.name)) };
        }
      }
    }

    // ② 随机池：random/ 下任意名子目录
    for (const dirName of listSubDirs(join(root, 'random'))) {
      const frames = listFrames(join(root, 'random', dirName));
      if (frames.length > 0) {
        result.random.push({ dir: dirName, frames, frameMs: readFrameMs(join(root, 'random', dirName)) });
      }
    }

    // ③ 时段池：timed/idle-HHMM（HHMM 仅取「小时」生效）
    for (const dirName of listSubDirs(join(root, 'timed'))) {
      const m = dirName.match(/^idle-(\d{2})\d{2}$/i);
      if (!m) continue;
      const frames = listFrames(join(root, 'timed', dirName));
      if (frames.length > 0) {
        result.timed.push({ hour: parseInt(m[1], 10), frames, frameMs: readFrameMs(join(root, 'timed', dirName)) });
      }
    }
    return result;
  } catch {
    // 目录不存在（如某形象还没有素材）→ 空清单，渲染进程回退占位形象
    return EMPTY;
  }
}

/** 手机端 HTTP 请求处理：页面 / 形象图片 / SSE 事件流 / 发送消息 */
function handleMobileRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const auth = getData('serverAuth') as ServerAuth;
  const u = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (u.searchParams.get('t') !== auth.token) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('令牌无效，请从电脑端右键菜单重新获取地址');
    return;
  }
  const p = u.pathname;
  // 手机页面
  if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
    serveFile(res, join(mobileStaticRoot(), 'mobile/index.html'), 'text/html; charset=utf-8');
    return;
  }
  // 桌宠形象图片
  if (req.method === 'GET' && p.startsWith('/character/')) {
    const file = safeStaticPath(p.replace(/^\/+/, ''));
    if (!file) {
      res.writeHead(404);
      res.end();
      return;
    }
    const type = file.endsWith('.webp') ? 'image/webp' : 'image/png';
    serveFile(res, file, type);
    return;
  }
  // 手机端桌宠形象：当前搭配的整套动画资产（与电脑端换装同步）
  if (req.method === 'GET' && p === '/assets') {
    const outfit = getData('outfit') as OutfitData | null;
    const costume = outfit?.costume || 'default';
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ costume, assets: scanCostume(costume) }));
    return;
  }
  // SSE：连接即推当前状态（小新最近一次回复），之后推流式回复
  if (req.method === 'GET' && p === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const history = getData('chat') as ChatMessage[];
    const list = Array.isArray(history) ? history : [];
    const lastAssistant = [...list].reverse().find((m) => m.role === 'assistant');
    res.write(`event: state\ndata: ${JSON.stringify({ lastReply: lastAssistant?.content ?? null })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }
  // POST：投递手机消息到电脑端桌宠（由主人在电脑端查看并回复）
  if (req.method === 'POST' && p === '/send') {
    let body = '';
    req.on('data', (c: Buffer) => {
      body += c;
    });
    req.on('end', () => {
      void (async () => {
        let message = '';
        try {
          const parsed = JSON.parse(body || '{}') as { message?: unknown };
          if (typeof parsed.message === 'string') message = parsed.message;
        } catch {
          // fallthrough → 400
        }
        if (!message.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'EMPTY' }));
          return;
        }
        // 手机端消息不直接触发 LLM：进共享历史（LLM 上下文可见），
        // 并通知电脑端桌宠显示"收到手机消息"，等主人点开回复
        appendChatMessage({ role: 'user', content: message.trim() });
        win?.webContents.send('mobile-message', message.trim());
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, delivered: true }));
      })();
    });
    return;
  }
  res.writeHead(404);
  res.end();
}

function startMobileServer() {
  if (mobileServer) return;
  const tryPort = (port: number, attempt: number) => {
    if (attempt > 10) return;
    const srv = http.createServer(handleMobileRequest);
    srv.once('error', () => {
      srv.removeAllListeners();
      tryPort(port + 1, attempt + 1);
    });
    srv.once('listening', () => {
      mobileServer = srv;
      mobilePort = port;
      // SSE 心跳：防止部分路由器/浏览器空闲超时断开
      mobileHeartbeat = setInterval(() => {
        for (const res of sseClients) {
          try {
            res.write(': hb\n\n');
          } catch {
            sseClients.delete(res);
          }
        }
      }, 30_000);
      const url = mobileServerUrl();
      if (url) {
        new Notification({ title: '小新已开启手机连接', body: `手机浏览器打开：\n${url}` }).show();
      } else {
        new Notification({ title: '手机连接已开启', body: '未检测到局域网 IP，请检查网络' }).show();
      }
    });
    srv.listen(port, '0.0.0.0');
  };
  tryPort(8765, 0);
}

function stopMobileServer() {
  if (mobileHeartbeat) {
    clearInterval(mobileHeartbeat);
    mobileHeartbeat = null;
  }
  for (const res of sseClients) {
    try {
      res.end();
    } catch {
      // ignore
    }
  }
  sseClients.clear();
  mobileServer?.close();
  mobileServer = null;
  mobilePort = 0;
}

/** 统一聊天入口：电脑端 IPC 与手机端 HTTP 共用，回复同时推给两端 */
function sendChatWindowEvent(channel: string, ...args: unknown[]) {
  win?.webContents.send(channel, ...args);
  if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send(channel, ...args);
}

async function runChatTurn(userMessage: string): Promise<{ ok: boolean; response?: string; error?: string }> {
  if (chatBusy) return { ok: false, error: 'BUSY' };
  const cfg = getData('llmConfig') as LlmConfig;
  if (!cfg.apiKey) return { ok: false, error: 'NO_API_KEY' };
  chatBusy = true;
  sendChatWindowEvent('chat-status', true);
  try {
    const history = getData('chat') as ChatMessage[];
    const messages = buildChatMessages(SHINCHAN_PERSONA, Array.isArray(history) ? history : [], userMessage);
    // 先存用户消息（电脑/手机共享同一份历史）
    appendChatMessage({ role: 'user', content: userMessage });
    let fullText = '';
    let chatError: string | null = null;
    await streamChat(
      cfg,
      messages,
      (delta) => {
        fullText += delta;
        sendChatWindowEvent('chat-chunk', delta);
        sseBroadcast('chunk', { delta });
      },
      (done) => {
        fullText = done;
        appendChatMessage({ role: 'assistant', content: done });
        sendChatWindowEvent('chat-done', done);
        sseBroadcast('done', { text: done });
      },
      (err) => {
        chatError = err.message;
        sendChatWindowEvent('chat-error', err.message);
        sseBroadcast('error', { message: err.message });
      },
    );
    if (chatError) return { ok: false, error: chatError };
    return { ok: true, response: fullText };
  } finally {
    chatBusy = false;
    sendChatWindowEvent('chat-status', false);
  }
}

function handleMenuCommand(cmd: string) {
  switch (cmd) {
    case 'growth':
      win?.webContents.send('tray-command', 'open-growth');
      break;
    case 'chat':
      win?.webContents.send('tray-command', 'open-chat');
      break;
    case 'note':
      openNoteEditor();
      break;
    case 'mobile':
      if (mobileServer) stopMobileServer();
      else startMobileServer();
      break;
    case 'llmconfig':
      openLlmConfigWindow();
      break;
    case 'passthrough':
      sendTrayCommand('toggle-passthrough');
      break;
    case 'quit':
      sendTrayCommand('quit');
      break;
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(join(__dirname, '../assets/icon.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('蜡笔小新桌宠');

  const rebuild = () => {
    const menu = Menu.buildFromTemplate([
      { label: '便利贴 / 便签夹', click: () => openNoteEditor() },
      ...(RELEASE_FEATURES.growth ? [{ label: '养成系统 🍫', click: () => sendTrayCommand('open-growth') }] : []),
      { type: 'separator' },
      { label: `${passthrough ? '✓ ' : ''}鼠标穿透`, click: () => { sendTrayCommand('toggle-passthrough'); rebuild(); } },
      { label: `${win?.isAlwaysOnTop() ? '✓ ' : ''}窗口置顶`, click: () => { sendTrayCommand('toggle-top'); rebuild(); } },
      { label: '显示 / 隐藏小新', click: () => sendTrayCommand('show-hide') },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]);
    tray?.setContextMenu(menu);
  };
  rebuild();
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('note-folder:list', (event) => {
    if (event.sender !== noteFolderWin?.webContents) return [];
    return [...getData('notes') as StickyNote[]].sort((a, b) => b.updatedAt - a.updatedAt)
      .map(note => ({ ...note, open: noteWins.has(note.id) }));
  });
  ipcMain.handle('note-folder:action', async (event, action: string, id?: string) => {
    if (event.sender !== noteFolderWin?.webContents) return { ok: false, error: '无效的便签夹窗口' };
    if (action === 'new') return newNoteWindow();
    const note = (getData('notes') as StickyNote[]).find(item => item.id === id);
    if (!note) return { ok: false, error: '这张便签已不存在' };
    if (action === 'open') createNoteWindow(note);
    else if (action === 'delete') return deleteNoteFromFolder(note.id);
    else return { ok: false, error: '未知操作' };
    return { ok: true };
  });
  ipcMain.handle('pet:getData', (_e, key: StoreKey) => getData(key));
  ipcMain.handle('pet:setData', (_e, key: StoreKey, value: unknown) => {
    const r = setData(key, value);
    // 电脑端换装 → 实时同步手机端形象
    if (key === 'outfit') {
      const o = value as OutfitData | null;
      sseBroadcast('costume', { costume: o?.costume || 'default' });
    }
    return r;
  });
  ipcMain.handle('pet:appendLog', (_e, entry: Parameters<typeof appendLog>[0]) => appendLog(entry));
  ipcMain.handle('pet:updateLogNote', (_e, id: string, note: string) => updateLogNote(id, note));
  ipcMain.handle('pet:dragStart', () => startDrag());
  ipcMain.handle('pet:dragEnd', () => endDrag());
  ipcMain.handle('pet:setWindowSize', (_e, w: number, h: number) => setWindowSize(w, h));
  ipcMain.handle('pet:setChatWindowOpen', (event, open: boolean) => {
    if (event.sender !== win?.webContents) return { open: false };
    if (open) return { open: openChatWindow() };
    closeChatWindow();
    return { open: false };
  });
  ipcMain.handle('pet:setIgnoreMouseEvents', (_e, flag: boolean) => {
    passthrough = flag;
    win?.setIgnoreMouseEvents(flag, { forward: true });
  });
  // 浮层（养成 / 日记）打开：记住桌宠当前位置，把窗口移动到「屏幕工作区内、
  // 完整可见」的位置（居中）。这样即使桌宠贴在屏幕顶部/边缘，浮层也不会被裁切。
  ipcMain.handle('pet:openOverlay', () => {
    if (!win) {
      console.log('[openOverlay] FAIL: win is null');
      return null;
    }
    if (!savedPetBounds) savedPetBounds = win.getBounds();
    const { workArea } = screen.getPrimaryDisplay();
    const w = 380;
    const h = 560;
    const x = Math.max(
      workArea.x,
      Math.min(Math.round(workArea.x + (workArea.width - w) / 2), workArea.x + workArea.width - w),
    );
    const y = Math.max(
      workArea.y,
      Math.min(Math.round(workArea.y + (workArea.height - h) / 2), workArea.y + workArea.height - h),
    );
    console.log('[openOverlay] moving to', { x, y, w, h, workArea });
    win.setBounds({ x, y, width: w, height: h });
    // 右键菜单是独立 BrowserWindow 且 focusable，关闭后焦点会跑到桌面/其他应用，
    // 主窗口虽 alwaysOnTop 但未激活会被遮挡——这里显式 show + focus + moveTop 强制置顶
    win.setAlwaysOnTop(true, 'screen-saver');
    win.show();
    win.focus();
    win.moveTop();
    console.log('[openOverlay] done, bounds=', win.getBounds(), 'alwaysOnTop=', win.isAlwaysOnTop(), 'visible=', win.isVisible());
    return savedPetBounds;
  });

  // 浮层关闭：精确还原回桌宠原来的位置与尺寸，小新原地复现
  ipcMain.handle('pet:closeOverlay', () => {
    if (!win) return;
    const b = savedPetBounds ?? { x: 0, y: 0, width: 170, height: 204 };
    win.setBounds(b);
    savedPetBounds = null;
  });

  // 渲染进程右键菜单里的指令转发（鼠标穿透切换 / 退出等），复用托盘逻辑
  ipcMain.handle('pet:command', (_e, cmd: TrayCommand) => {
    sendTrayCommand(cmd);
  });
  ipcMain.handle('pet:openMenu', () => openMenuWindow());
  // 菜单窗口按钮点击：ipcRenderer.send('menu-cmd', cmd) → 执行命令 + 关闭菜单
  ipcMain.on('menu-cmd', (_e, cmd: string) => {
    // 先把焦点交回主窗口并关闭菜单，再执行命令——
    // 否则 win.focus() 会抢走刚创建的配置窗口焦点，触发其 blur 自动关闭
    win?.show();
    win?.focus();
    menuWin?.close();
    handleMenuCommand(cmd);
  });

  // ---------- 便利贴 IPC（只允许窗口修改自己的记录） ----------
  const ownNote = (sender: Electron.WebContents, id: unknown) => typeof id === 'string' && noteWins.get(id)?.webContents === sender;
  ipcMain.on('note:resize-start', (event, id: string) => {
    if (!ownNote(event.sender, id)) return;
    noteResizeOrigins.set(id, { cursorY: screen.getCursorScreenPoint().y, bounds: noteWins.get(id)!.getBounds() });
  });
  ipcMain.on('note:resize-move', (event, id: string) => {
    if (!ownNote(event.sender, id)) return;
    const origin = noteResizeOrigins.get(id);
    if (!origin) return;
    const nw = noteWins.get(id)!;
    const area = screen.getDisplayMatching(origin.bounds).workArea;
    const maximum = Math.max(96, area.y + area.height - origin.bounds.y);
    const height = Math.round(Math.max(96, Math.min(maximum, origin.bounds.height + screen.getCursorScreenPoint().y - origin.cursorY)));
    nw.setBounds({ ...origin.bounds, height });
  });
  ipcMain.on('note:resize-end', (event, id: string) => {
    if (!ownNote(event.sender, id)) return;
    noteResizeOrigins.delete(id);
    const nw = noteWins.get(id)!;
    if (!updateNote(id, { bounds: nw.getBounds() }).ok) nw.webContents.send('note:save-error');
  });
  ipcMain.handle('note:initial', (event) => {
    const entry = [...noteWins].find(([, nw]) => nw.webContents === event.sender);
    const note = entry && (getData('notes') as StickyNote[]).find((n) => n.id === entry[0]);
    if (!note) throw new Error('找不到这张便利贴');
    return { note, stickers: noteStickerSources() };
  });
  ipcMain.handle('note:update', (event, id: string, patch: { content?: unknown; color?: unknown }) => {
    if (!ownNote(event.sender, id) || !patch || typeof patch !== 'object') return { ok: false };
    const next: Parameters<typeof updateNote>[1] = {};
    if (typeof patch.content === 'string') next.content = patch.content;
    if (patch.color === 'yellow' || patch.color === 'green' || patch.color === 'pink') next.color = patch.color;
    const result = updateNote(id, next);
    return result;
  });
  ipcMain.handle('note:pin', (event, id: string, pinned: boolean) => {
    if (!ownNote(event.sender, id) || typeof pinned !== 'boolean') return { ok: false };
    const nw = noteWins.get(id)!;
    const result = updateNote(id, { pinned, bounds: nw.getBounds() });
    if (result.ok) nw.setAlwaysOnTop(pinned, 'screen-saver');
    return result;
  });
  ipcMain.on('note:new', (event, id: string) => { if (ownNote(event.sender, id)) newNoteWindow(); });
  ipcMain.on('note:folder', (event, id: string) => { if (ownNote(event.sender, id)) openNoteEditor(noteWins.get(id)); });
  ipcMain.on('note:close', (event, id: string, content?: string) => {
    if (!ownNote(event.sender, id)) return;
    const nw = noteWins.get(id)!;
    const result = updateNote(id, { ...(typeof content === 'string' ? { content } : {}), pinned: false, bounds: nw.getBounds() });
    if (result.ok) { noteCloseAllowed.add(nw); nw.close(); }
    else nw.webContents.send('note:save-error');
  });
  ipcMain.on('note:delete', (event, id: string) => {
    if (!ownNote(event.sender, id)) return;
    const nw = noteWins.get(id)!;
    if (deleteNote(id).ok) { noteCloseAllowed.add(nw); nw.close(); }
    else nw.webContents.send('note:save-error');
  });
  ipcMain.handle('pet:quit', () => app.quit());

  // 扫描 character/{costume}/ 目录，返回该形象的完整资源清单（姿态单图/动画 + 随机池 + 时段池）
  // 形象资产清单：电脑端换装预览 / 渲染与手机端 /assets 共用同一套扫描
  ipcMain.handle('pet:listCostumeAssets', (_e, costume: string): CostumeAssets => scanCostume(costume));

  // ---------- 聊天（DeepSeek 流式） ----------
  // 渲染进程调用后，主进程逐 chunk 通过 webContents.send 推送，最终返回完成状态
  ipcMain.handle('pet:chat', async (event, userMessage: string) => {
    if (event.sender === chatWin?.webContents && typeof userMessage === 'string' && userMessage.trim()) {
      const message = userMessage.trim().slice(0, 200);
      const state = getData('state') as PetState;
      setData('state', { ...state, lastInteractionAt: Date.now(), totalInteractions: state.totalInteractions + 1 });
      appendLog({ type: 'chat', text: `对小新说：${message}` });
      return runChatTurn(message);
    }
    return runChatTurn(userMessage);
  });

  // 获取 LLM 配置（API Key 脱敏：只返回是否已配置）
  ipcMain.handle('pet:getLlmConfig', () => {
    const cfg = getData('llmConfig') as LlmConfig;
    return {
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      hasApiKey: !!cfg.apiKey,
    };
  });

  // 获取聊天历史
  ipcMain.handle('pet:getChatHistory', () => getData('chat') as ChatMessage[]);

  // API Key 配置窗口保存
  ipcMain.handle('llm-config-save', (event, data: { apiKey?: unknown; providerId?: unknown; model?: unknown; baseUrl?: unknown }) => {
    if (!configWin || event.sender !== configWin.webContents) return { ok: false, error: '无效的设置窗口' };
    const next = resolveProviderSelection(getData('llmConfig') as LlmConfig, data?.providerId, data?.apiKey, data?.model, data?.baseUrl);
    if (!next) return { ok: false, error: '请检查厂商、模型名称、API Key 和接口地址' };
    const result = setData('llmConfig', next);
    if (!result.ok) return result;
    configWin.close();
    win?.show();
    win?.focus();
    return { ok: true };
  });
}

// 单实例锁（避免托盘出现多个宠物）
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    initStores();
    // 首次启动生成手机连接访问令牌（固定持久化，手机收藏的地址长期有效）
    const auth = getData('serverAuth') as ServerAuth;
    if (!auth.token) {
      setData('serverAuth', { token: Math.random().toString(36).slice(2, 8) });
    }
    createWindow();
    createTray();
    registerIpc();
    // 还原固定在桌面的便利贴
    restorePinnedNotes();

    // ===== 临时调试：转发渲染进程 console 到主进程 stdout =====
    win?.webContents.on('console-message', (_e, _level, message) => {
      console.log('[renderer]', message);
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
