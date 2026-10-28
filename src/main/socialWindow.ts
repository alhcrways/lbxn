import { app, BrowserWindow, clipboard, ipcMain, Notification, safeStorage, screen } from 'electron';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultSocialSettings, SocialClient, type SocialSettings } from './socialClient';
import type { SocialAction, SocialState } from '../shared/social';

export function setupSocial(getPet: () => BrowserWindow | null, unreadChanged: (count: number) => void) {
  const directory = join(app.getPath('userData'), 'shinchan-pet-data');
  const file = join(directory, 'friends-identity.bin');
  let settings = defaultSocialSettings();
  let identityError = '';
  try {
    if (existsSync(file)) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('系统暂时无法解密本机好友身份，请稍后重启');
      settings = JSON.parse(safeStorage.decryptString(readFileSync(file)));
      if (typeof settings.serverUrl !== 'string' || !settings.accounts || typeof settings.accounts !== 'object') throw new Error('好友身份文件格式无效，请恢复备份');
    }
  } catch (error) { identityError = error instanceof Error ? error.message : '读取本机好友身份失败'; }
  let window: BrowserWindow | null = null;
  let last: SocialState | null = null;
  let unread = 0;
  const client = new SocialClient(settings, next => {
    if (identityError) throw new Error(identityError);
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统凭据加密不可用，暂不能创建好友身份');
    mkdirSync(directory, { recursive: true });
    writeFileSync(`${file}.tmp`, safeStorage.encryptString(JSON.stringify(next)), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  }, state => {
    window?.webContents.send('friends:state-changed', state);
    const snapshot = state.snapshot;
    unread = (snapshot?.friends.reduce((sum, f) => sum + f.unread, 0) ?? 0) + (snapshot?.requests.length ?? 0);
    unreadChanged(unread);
    const prior = last?.snapshot;
    const sameAccount = prior?.me.id === snapshot?.me.id && last?.serverUrl === state.serverUrl;
    const incoming = snapshot?.messages.some(m => m.to === snapshot.me.id && (!sameAccount || m.seq > Math.max(0, ...(prior?.messages ?? []).map(p => p.seq))));
    const request = snapshot?.requests.some(r => !sameAccount || !prior?.requests.some(p => p.id === r.id));
    if (state.status === 'connected' && unread && (!window?.isFocused()) && (incoming || request) && Notification.isSupported()) {
      const notification = new Notification({ title: '小新帮你带来一封信', body: request ? '收到好友申请，点击查看。' : '朋友有新消息，点击打开好友信箱。', silent: false });
      notification.on('click', open);
      notification.show();
    }
    last = state;
  });
  function open() {
    if (window && !window.isDestroyed()) { window.show(); window.focus(); return; }
    const pet = getPet()?.getBounds();
    const area = screen.getDisplayMatching(pet ?? screen.getPrimaryDisplay().workArea).workArea;
    const width = Math.min(660, area.width), height = Math.min(590, area.height);
    const current = new BrowserWindow({
      width, height, x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2),
      minWidth: Math.min(560, width), minHeight: Math.min(470, height),
      frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
      skipTaskbar: true, show: false, resizable: true,
      webPreferences: { preload: join(__dirname, 'social-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    window = current;
    current.setAlwaysOnTop(true, 'floating');
    current.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    current.webContents.on('will-navigate', event => event.preventDefault());
    current.on('closed', () => { if (window === current) window = null; });
    void current.loadFile(join(__dirname, '../assets/social-window.html')).then(() => {
      if (!current.isDestroyed()) { current.show(); current.focus(); }
    }).catch(error => { console.error('[friends-window]', error.message); if (!current.isDestroyed()) current.close(); });
  }
  const own = (sender: Electron.WebContents) => sender === window?.webContents;
  ipcMain.handle('friends:state', event => { if (!own(event.sender)) throw new Error('无效窗口'); return { ...client.getState(), ...(identityError ? { error: identityError } : {}) }; });
  ipcMain.handle('friends:action', (event, action: SocialAction) => {
    if (!own(event.sender)) return { ok: false, error: '无效窗口' };
    if (identityError) return { ok: false, error: identityError };
    return client.action(action);
  });
  ipcMain.handle('friends:copy-code', event => {
    if (!own(event.sender)) throw new Error('无效窗口');
    const code = client.getState().snapshot?.me.code;
    if (code) clipboard.writeText(code);
  });
  ipcMain.handle('friends:close', event => { if (own(event.sender)) window?.close(); });
  ipcMain.handle('pet:openFriends', event => { if (event.sender === getPet()?.webContents) open(); });
  ipcMain.handle('pet:friendsUnread', event => event.sender === getPet()?.webContents ? unread : 0);
  app.on('before-quit', () => client.stop());
  if (!identityError) void client.start();
  return { open, stop: () => { client.stop(); window?.close(); } };
}
