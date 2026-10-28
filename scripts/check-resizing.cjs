const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { buildSync } = require('esbuild');
fs.mkdirSync(path.resolve('output'), { recursive: true });
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
      getZoomFactor: () => this.zoom ?? 1,
      setZoomFactor: (value) => { this.zoom = value; },
      send: (...args) => { this.lastMessage = args; },
    });
  }
  isDestroyed() { return !!this.destroyed; }
  setIgnoreMouseEvents(flag) { this.ignoresMouse = flag; }
  isVisible() { return this.visible !== false; }
  setContentProtection() {}
  setAlwaysOnTop(value, level) { this.onTop = value; this.topLevel = level; }
  getBounds() { return this.bounds; }
  setBounds(bounds) { this.boundsRequests ??= []; this.boundsRequests.push({ ...bounds }); this.bounds = { ...bounds, y: bounds.y + (this.verticalDrift ?? 0) }; }
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
let cursorX = -900;
let cursorY = 400;
let dialogResponse = 0;
const electron = { app, ipcMain: ipc, BrowserWindow: NoteWindow,
  screen: { getPrimaryDisplay: () => ({ workArea: wa }), getAllDisplays: () => [{ workArea: wa }], getDisplayMatching: () => ({ workArea: wa }), getCursorScreenPoint: () => ({ x: cursorX, y: cursorY }) },
  dialog: { showMessageBox: async () => ({ response: dialogResponse }) },
  Menu: { buildFromTemplate: (items) => ({ popup() { electron.menuItems = items; } }) },
};
const source = fs.readFileSync('src/main/main.ts', 'utf8') + '\nexport { openLlmConfigWindow, configWin, registerIpc, breakReminder, tickWalking, scanCostume, startDrag, endDrag, openMenuWindow, menuWin, changePetScale, loadPetScale, createWindow, setWindowSize, win, petScale, newNoteWindow, openNoteEditor, createNoteWindow, restorePinnedNotes, noteFolderWin, noteWins, initStores, getData, updateNote };';
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
  api.newNoteWindow(); await settle();
  const note = api.getData('notes')[0], nw = api.noteWins.get(note.id);
  assert.equal(nw.options.minWidth, 180);
  assert.equal(nw.options.maxWidth, undefined);
  const original = { ...nw.bounds }, event = { sender: nw.webContents };
  ipc.emit('note:resize-start', event, note.id, 'right');
  cursorX += 80;
  ipc.emit('note:resize-move', event, note.id);
  assert.equal(nw.bounds.width, original.width + 80);
  assert.equal(nw.bounds.x, original.x);
  ipc.emit('note:resize-end', event, note.id);
  assert.equal(api.getData('notes')[0].bounds.width, original.width + 80);
  const right = nw.bounds.x + nw.bounds.width;
  ipc.emit('note:resize-start', event, note.id, 'left');
  cursorX += 1000;
  ipc.emit('note:resize-move', event, note.id);
  assert.equal(nw.bounds.width, 180);
  assert.equal(nw.bounds.x + nw.bounds.width, right);
  ipc.emit('note:resize-end', event, note.id);
  const before = { ...nw.bounds };
  ipc.emit('note:resize-start', { sender: {} }, note.id, 'right');
  cursorX -= 300;
  ipc.emit('note:resize-move', { sender: {} }, note.id);
  assert.deepEqual(nw.bounds, before);
  ipc.emit('note:resize-start', event, note.id);
  cursorY += 60;
  ipc.emit('note:resize-move', event, note.id);
  assert.equal(nw.bounds.height, before.height + 60);
  ipc.emit('note:resize-end', event, note.id);
  api.createWindow();
  const pet = api.win, bounds = { ...pet.bounds };
  api.changePetScale(1.5);
  assert.equal(pet.zoom, 1.5);
  assert.equal(pet.bounds.width, 255);
  assert.equal(pet.bounds.height, 306);
  assert.equal(pet.bounds.y + pet.bounds.height, bounds.y + bounds.height);
  api.setWindowSize(170, 204);
  assert.equal(pet.bounds.width, 255);
  api.changePetScale(0.1);
  assert.equal(pet.zoom, 0.5);
  api.changePetScale(4);
  assert.equal(pet.zoom, 2);
  api.loadPetScale();
  assert.equal(api.petScale, 2);
  api.changePetScale(1);
  assert.equal(pet.bounds.width, 170);
  assert.equal(pet.bounds.height, 204);
  const petEvent = { sender: pet.webContents };
  ipc.emit('pet:transparentPassthrough', petEvent, true);
  assert.equal(pet.ignoresMouse, true);
  ipc.emit('pet:transparentPassthrough', { sender: {} }, false);
  assert.equal(pet.ignoresMouse, true);
  ipc.emit('pet:transparentPassthrough', petEvent, false);
  assert.equal(pet.ignoresMouse, false);
  await handles.get('pet:command')(petEvent, 'toggle-passthrough');
  ipc.emit('pet:transparentPassthrough', petEvent, false);
  assert.equal(pet.ignoresMouse, true, 'Manual full passthrough takes priority');
  await handles.get('pet:command')(petEvent, 'toggle-passthrough');
  assert.equal(pet.ignoresMouse, false);
  ipc.emit('pet:transparentPassthrough', petEvent, true);
  api.startDrag();
  assert.equal(pet.ignoresMouse, false, 'Drag locks native mouse capture');
  api.endDrag();
  assert.equal(pet.ignoresMouse, true);
  api.openMenuWindow(); await settle();
  const panel = api.menuWin;
  const menuEvent = { sender: panel.webContents };
  ipc.emit('menu-cmd', menuEvent, 'size-smaller');
  ipc.emit('menu-cmd', menuEvent, 'size-smaller');
  assert.equal(Math.round(pet.zoom * 100), 80);
  assert.equal(api.menuWin, panel);
  assert.equal(panel.isDestroyed(), false);
  panel.emit('blur');
  assert.equal(panel.isDestroyed(), false);
  ipc.emit('menu-cmd', { sender: {} }, 'close-menu');
  assert.equal(panel.isDestroyed(), false);
  ipc.emit('menu-cmd', menuEvent, 'close-menu');
  assert.equal(panel.isDestroyed(), true);
  assert.equal(api.menuWin, null);
  api.openMenuWindow(); await settle();
  api.openMenuWindow();
  assert.equal(api.menuWin, null);
  ipc.emit('pet:transparentPassthrough', { sender: pet.webContents }, true);
  api.breakReminder.configure(true,1,0);
  const originalWalkX = pet.bounds.x;
  api.tickWalking(0);
  assert.equal(pet.bounds.x, originalWalkX, 'Missing animation readiness must block movement');
  ipc.emit('pet:walkingReady', { sender: {} }, true);
  api.tickWalking(6000);
  assert.equal(pet.bounds.x, originalWalkX, 'Only pet renderer can enable animations');
  ipc.emit('pet:walkingReady', { sender: pet.webContents }, true);
  const laneY=pet.bounds.y;
  pet.boundsRequests=[];
  pet.verticalDrift=1;
  for (let now=6020;now<70000;now+=20) api.tickWalking(now);
  assert.ok(pet.boundsRequests.length>10);
  assert.ok(pet.boundsRequests.every(bounds=>bounds.y===laneY),'All native move requests must keep one fixed y');
  assert.equal(pet.bounds.y,laneY+1,'Native rounding error must not accumulate');
  pet.verticalDrift=0;
  assert.ok(pet.bounds.x < originalWalkX, 'Ready pet must actually move left');
  const beforeHover=pet.bounds.x;
  ipc.emit('pet:transparentPassthrough',{sender:pet.webContents},false);
  api.tickWalking(70000);
  assert.ok(pet.bounds.x<beforeHover,'Hover alone must not interrupt an active reminder patrol');
  const beforeHold=pet.bounds.x;
  ipc.emit('pet:pointerHeld',{sender:pet.webContents},true);
  api.tickWalking(70020);
  assert.equal(pet.bounds.x,beforeHold,'Pressing the character pauses motion for a reliable double click');
  ipc.emit('pet:pointerHeld',{sender:pet.webContents},false);
  const movingX=pet.bounds.x;
  api.openMenuWindow();
  api.tickWalking(70020);
  assert.equal(pet.bounds.x,movingX,'Opening menu pauses actual window motion');
  const walkingMenu=api.menuWin;
  assert.equal(handles.get('walking:configure')({sender:{}},30).ok,false);
  assert.equal(handles.get('walking:configure')({sender:walkingMenu.webContents},0).ok,false);
  assert.equal(handles.get('walking:configure')({sender:walkingMenu.webContents},30).ok,true);
  assert.equal(api.breakReminder.intervalMinutes,30);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'pet-walking.json'),'utf8')).intervalMinutes,30);
  api.breakReminder.tick(api.breakReminder.nextReminderAt,true);
  assert.equal(api.breakReminder.active,true);
  assert.equal(handles.get('pet:dismissWalkingReminder')({sender:{}}),null);
  const dismissed=handles.get('pet:dismissWalkingReminder')({sender:pet.webContents});
  assert.equal(dismissed.reminderActive,false);
  assert.equal(dismissed.walking,false);
  assert.equal(dismissed.enabled,true);
  assert.ok(dismissed.nextReminderAt>Date.now());
  ipc.emit('menu-cmd',{sender:walkingMenu.webContents},'toggle-walking');
  assert.equal(handles.get('pet:getWalkingState')({sender:pet.webContents}).enabled,false);
  assert.equal(walkingMenu.isDestroyed(),false);
  ipc.emit('menu-cmd',{sender:walkingMenu.webContents},'close-menu');
  const assets=api.scanCostume('default');
  for (const direction of ['left','right']) {
    assert.equal(assets.poses['walk-'+direction].kind,'anim');
    assert.equal(assets.poses['walk-'+direction].frames.length,6);
    assert.equal(assets.poses['walk-'+direction].frameMs,120);
  }
  console.log('PASS: walking IPC, actual window movement, menu pause/toggle and packaged walking assets; persistent menu, repeated zoom, manual close, sender validation; note horizontal/vertical resizing, limits, ownership, persistence; pet zoom, anchoring, bounds and saved scale');
})().catch(error => { console.error(error); process.exitCode = 1; });
