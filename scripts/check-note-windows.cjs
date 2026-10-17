const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { buildSync } = require('esbuild');
const dir = fs.mkdtempSync(path.resolve('output/note-window-tests-'));
const app = Object.assign(new EventEmitter(), {
  getPath: () => dir, setAppUserModelId() {}, requestSingleInstanceLock: () => true,
  whenReady: () => new Promise(() => {}), quit() { this.quitCalled = true; },
});
class NoteWindow extends EventEmitter {
  constructor(options) {
    super(); this.options = options; this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height };
    this.webContents = Object.assign(new EventEmitter(), {
      executeJavaScript: async () => this.draft ?? { content: '', color: 'yellow' },
      send: (...args) => { this.lastMessage = args; },
    });
  }
  isDestroyed() { return !!this.destroyed; }
  setAlwaysOnTop(value, level) { this.onTop = value; this.topLevel = level; }
  getBounds() { return this.bounds; }
  setBounds(bounds) { this.bounds = bounds; }
  loadURL(url) { this.html = decodeURIComponent(url.split(',').slice(1).join(',')); return Promise.resolve(); }
  loadFile(file) { this.html = fs.readFileSync(file, 'utf8'); this.localFile = file; return Promise.resolve(); }
  show() { this.visible = true; }
  showInactive() { this.visible = true; this.inactive = true; }
  focus() { this.focused = true; }
  setBackgroundColor(value) { this.color = value; }
  close() {
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    this.emit('close', event);
    if (!event.prevented) { this.destroyed = true; this.emit('closed'); }
  }
}
const handles = new Map();
const ipc = Object.assign(new EventEmitter(), { handle: (name, fn) => handles.set(name, fn) });
const wa = { x: -1200, y: 0, width: 1200, height: 900 };
let cursorY = 400;
let dialogResponse = 0;
const electron = { app, ipcMain: ipc, BrowserWindow: NoteWindow,
  screen: { getPrimaryDisplay: () => ({ workArea: wa }), getDisplayMatching: () => ({ workArea: wa }), getCursorScreenPoint: () => ({ x: -900, y: cursorY }) },
  dialog: { showMessageBox: async () => ({ response: dialogResponse }) },
  Menu: { buildFromTemplate: (items) => ({ popup() { electron.menuItems = items; } }) },
};
const source = fs.readFileSync('src/main/main.ts', 'utf8') + '\nexport { openLlmConfigWindow, configWin, registerIpc, newNoteWindow, openNoteEditor, createNoteWindow, restorePinnedNotes, noteFolderWin, noteWins, initStores, getData, updateNote };';
const code = buildSync({ stdin: { contents: source, loader: 'ts', resolveDir: path.resolve('src/main') },
  bundle: true, platform: 'node', format: 'cjs', external: ['electron'], write: false,
}).outputFiles[0].text;
const mod = { exports: {} };
new Function('require', 'module', 'exports', '__dirname', code)(
  (id) => id === 'electron' ? electron : require(id), mod, mod.exports, path.resolve('dist-electron'),
);
const api = mod.exports;
const settle = () => new Promise((r) => setImmediate(r));
(async () => {
  api.initStores(); api.registerIpc();
  api.openLlmConfigWindow(); await settle();
  const configSender = api.configWin.webContents;
  const saveConfig = handles.get('llm-config-save');
  assert.equal(saveConfig({ sender: {} }, { providerId: 'kimi', model: 'kimi-test-model', apiKey: 'test-key' }).ok, false);
  assert.equal(saveConfig({ sender: configSender }, { providerId: 'invalid', model: 'kimi-test-model', apiKey: 'test-key' }).ok, false);
  assert.equal(api.configWin.isDestroyed(), false);
  assert.equal(saveConfig({ sender: configSender }, { providerId: 'kimi', model: 'kimi-test-model', apiKey: 'test-kimi-key' }).ok, true);
  assert.equal(api.getData('llmConfig').model, 'kimi-test-model');
  assert.equal(api.getData('llmConfig').baseUrl, 'https://api.moonshot.cn/v1');
  api.initStores();
  assert.equal(api.getData('llmConfig').apiKey, 'test-kimi-key');
  api.newNoteWindow(); api.newNoteWindow(); await settle();
  const [one, two] = api.getData('notes');
  const first = api.noteWins.get(one.id), second = api.noteWins.get(two.id);
  assert.equal(api.noteWins.size, 2);
  assert.equal(first.listenerCount('blur'), 0);
  first.emit('blur'); assert.equal(first.isDestroyed(), false);
  assert.equal(first.options.resizable, true);
  assert.equal(first.options.minWidth, first.options.maxWidth);
  assert.equal(first.options.transparent, true);
  assert.equal(first.options.backgroundColor, '#00000000');
  assert.ok(first.localFile.endsWith('note-window.html'));
  const initial = handles.get('note:initial')({ sender: first.webContents });
  assert.equal(initial.note.id, one.id);
  assert.ok(initial.stickers.shiro.startsWith('file:'));
  const update = handles.get('note:update'), pin = handles.get('note:pin');
  assert.ok(update({ sender: first.webContents }, one.id, { content: '第一件任务', color: 'green' }).ok);
  assert.equal(update({ sender: second.webContents }, one.id, { content: 'wrong window' }).ok, false);
  assert.ok(pin({ sender: first.webContents }, one.id, true).ok);
  assert.equal(first.onTop, true); assert.equal(first.topLevel, 'screen-saver');
  assert.ok(pin({ sender: first.webContents }, one.id, false).ok);
  assert.equal(first.onTop, false); assert.equal(first.isDestroyed(), false);
  const original = { ...first.bounds };
  ipc.emit('note:resize-start', { sender: first.webContents }, one.id);
  cursorY = 295;
  ipc.emit('note:resize-move', { sender: first.webContents }, one.id);
  assert.equal(first.bounds.height, original.height - 105);
  assert.equal(first.bounds.width, original.width);
  assert.equal(first.bounds.y, original.y);
  cursorY = 0;
  ipc.emit('note:resize-move', { sender: first.webContents }, one.id);
  assert.equal(first.bounds.height, 96);
  ipc.emit('note:resize-end', { sender: first.webContents }, one.id);
  assert.equal(api.getData('notes')[0].bounds.height, 96);
  api.openNoteEditor(first);
  const folderSender = api.noteFolderWin.webContents;
  assert.equal(handles.get('note-folder:list')({ sender: folderSender }).length, 2);
  assert.equal(handles.get('note-folder:list')({ sender: first.webContents }).length, 0);
  assert.equal((await handles.get('note-folder:action')({ sender: first.webContents }, 'delete', one.id)).ok, false);
  assert.equal(api.noteFolderWin.options.transparent, true);
  assert.ok(api.noteFolderWin.html.includes('春日部便签夹'));
  assert.equal(first.options.minHeight, 96);
  ipc.emit('note:close', { sender: first.webContents }, one.id, '收起前最后一个字');
  assert.equal(first.isDestroyed(), true);
  assert.equal(api.getData('notes').find((n) => n.id === one.id).content, '收起前最后一个字');
  api.createNoteWindow(api.getData('notes').find((n) => n.id === one.id)); await settle();
  const reopened = api.noteWins.get(one.id);
  reopened.draft = { content: '原生关闭也保存', color: 'pink' };
  reopened.close(); await settle();
  assert.equal(reopened.isDestroyed(), true);
  assert.equal(api.getData('notes').find((n) => n.id === one.id).content, '原生关闭也保存');
  assert.equal(api.getData('notes').find((n) => n.id === one.id).color, 'pink');
  api.openNoteEditor();
  second.draft = { content: '从便签夹删除', color: 'yellow' };
  dialogResponse = 1;
  await handles.get('note-folder:action')({ sender: folderSender }, 'delete', two.id);
  await settle();
  dialogResponse = 0;
  assert.equal(second.isDestroyed(), true); assert.equal(api.getData('notes').length, 1);
  api.updateNote(one.id, { pinned: true, bounds: { x: -1000, y: 100, width: 220, height: 96 } });
  api.restorePinnedNotes(); await settle();
  const restored = api.noteWins.get(one.id);
  assert.equal(restored.inactive, true); assert.equal(restored.focused, undefined);
  assert.equal(restored.bounds.x, -1000); assert.equal(restored.bounds.height, 96); assert.equal(restored.onTop, true);
  restored.draft = { content: '退出前最后几个字', color: 'green' };
  let prevented = false;
  app.emit('before-quit', { preventDefault() { prevented = true; } }); await settle();
  assert.equal(prevented, true); assert.equal(app.quitCalled, true);
  const saved = api.getData('notes')[0];
  assert.equal(saved.content, '退出前最后几个字'); assert.equal(saved.pinned, true);
  console.log('Note window checks passed: concurrent windows, no blur close, own-note IPC, pin/unpin, folder, close/reopen/delete, restore, quit flush.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
