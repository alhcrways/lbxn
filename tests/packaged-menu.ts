import { app, BrowserWindow, screen } from 'electron';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { once } from 'node:events';

const archive = process.env.SHINCHAN_MENU_TEST_ASAR;
if (!archive) throw new Error('Missing packaged app archive');
const output = resolve('output/packaged-menu');
mkdirSync(output, { recursive: true });
app.setPath('userData', mkdtempSync(join(output, 'profile-')));
app.disableHardwareAcceleration();
async function waitFor(check: () => boolean | Promise<boolean>, name: string) {
  const until = Date.now() + 15000;
  while (!await check()) {
    if (Date.now() > until) throw new Error(`Timed out: ${name}`);
    await new Promise(resolve => setTimeout(resolve, 40));
  }
}
function report(message: unknown) { process.send?.(message); }
// Load the shipped main/preload/HTML files, not recompiled source or a mocked BrowserWindow.
require(join(archive, 'dist-electron/main.cjs'));
app.whenReady().then(async () => {
  try {
    let pet: BrowserWindow | undefined;
    await waitFor(async () => {
      pet = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/dist/index.html'));
      return !!pet && await pet.webContents.executeJavaScript('Boolean(window.petAPI && document.querySelector("[data-pet-stage]"))').catch(() => false);
    }, 'packaged pet ready');
    assert.equal(pet!.webContents.listenerCount('console-message'), 0, 'Production must not forward renderer console messages');
    // Exercise the real main-process cursor polling and packaged image alpha hit test.
    // Mock only the OS cursor position so this test does not move the user's mouse.
    let cursor = { x: -10000, y: -10000 };
    screen.getCursorScreenPoint = () => cursor;
    const chatVisible = () => pet!.webContents.executeJavaScript(`(() => {
      const button = document.querySelector('[aria-label="和小新聊天"]');
      return !!button && getComputedStyle(button).visibility === 'visible';
    })()`);
    async function hoverCharacter() {
      const point = await pet!.webContents.executeJavaScript(`(() => {
        const image = [...document.querySelectorAll('[data-pet-stage] img')].find(img => img.complete && img.naturalWidth && getComputedStyle(img).opacity !== '0');
        if (!image) return null;
        const rect = image.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      })()`);
      assert.ok(point, 'Packaged character image must load');
      const bounds = pet!.getBounds(), zoom = pet!.webContents.getZoomFactor();
      cursor = { x: Math.round(bounds.x + point.x * zoom), y: Math.round(bounds.y + point.y * zoom) };
      await waitFor(chatVisible, 'hover on character reveals chat');
    }
    report({ type: 'ready' });
    await once(process, 'message');
    // Both pipes have now been destroyed by the parent, like a launcher that has exited.
    console.log('late packaged stdout');
    console.error('late packaged stderr');
    await pet!.webContents.executeJavaScript("console.log('renderer diagnostic after launcher exits')");
    for (let round = 0; round < 3; round++) {
      await pet!.webContents.executeJavaScript('window.petAPI.openMenu()');
      let menu: BrowserWindow | undefined;
      await waitFor(() => {
        menu = BrowserWindow.getAllWindows().find(window => window !== pet && window.webContents.getTitle() === '春日部控制台');
        return !!menu?.isVisible();
      }, 'packaged context menu');
      const text = await menu!.webContents.executeJavaScript('document.documentElement.innerText');
      assert.ok(text.includes('护眼走动提醒'));
      assert.ok(!/box-sizing|font:|console\.|ipcRenderer|const |function |EPIPE|Uncaught/.test(text), 'Menu must show controls, not CSS, source or exception text');
      assert.equal(await menu!.webContents.executeJavaScript('getComputedStyle(document.head).display'), 'none');
      assert.equal(await menu!.webContents.executeJavaScript('getComputedStyle(document.querySelector("style")).display'), 'none');
      await menu!.webContents.executeJavaScript("document.querySelector('[data-command=\"size-smaller\"]').click(); document.querySelector('[data-command=\"size-smaller\"]').click(); document.getElementById('reminder-minutes').value='30'; document.getElementById('reminder-minutes').dispatchEvent(new Event('change',{bubbles:true}));");
      await waitFor(async () => (await pet!.webContents.executeJavaScript('window.petAPI.getWalkingState()')).intervalMinutes === 30, 'save reminder interval');
      assert.equal(menu!.isVisible(),true);
      if (round === 2) writeFileSync(join(output,'menu-after-closed-pipes.png'), (await menu!.webContents.capturePage()).toPNG());
      await menu!.webContents.executeJavaScript("document.querySelector('[data-command=\"close-menu\"]').click()");
      await waitFor(() => menu!.isDestroyed(), 'manual menu close');
      await hoverCharacter();
      await pet!.webContents.executeJavaScript('document.querySelector(\'[aria-label="和小新聊天"]\').click()');
      let chat: BrowserWindow | undefined;
      await waitFor(() => {
        chat = BrowserWindow.getAllWindows().find(window => window.webContents.getTitle() === '和小新聊聊');
        return !!chat?.isVisible();
      }, 'chat icon opens the chat window');
      await waitFor(async () => await pet!.webContents.executeJavaScript('document.querySelector(\'[aria-label="和小新聊天"]\')?.getAttribute("aria-expanded") === "true"'), 'chat state received');
      assert.equal(await chatVisible(), true, 'Open chat must keep its hover shortcut available');
      chat!.hide();
      await pet!.webContents.executeJavaScript('document.querySelector(\'[aria-label="和小新聊天"]\').click()');
      await waitFor(() => !!chat?.isVisible(), 'chat shortcut restores existing window');
      assert.equal(BrowserWindow.getAllWindows().filter(window => window.webContents.getTitle() === '和小新聊聊').length, 1);
      await chat!.webContents.executeJavaScript('document.getElementById("close").click()');
      await waitFor(() => chat!.isDestroyed(), 'chat closes');
      await hoverCharacter();
      const bounds = pet!.getBounds();
      cursor = { x: bounds.x + 2, y: bounds.y + 2 };
      await waitFor(async () => !await chatVisible(), 'transparent blank hides chat');
    }
    report({ type: 'pass', details: 'packaged menu remains styled after stdout/stderr close; repeated scale changes, reminder save, pixel hover, chat open/restore/close and blank-area hiding pass' });
    app.exit(0);
  } catch (error) { report({ type: 'failure', error: String(error) }); app.exit(1); }
});
