import { app, BrowserWindow } from 'electron';
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
      const text = await menu!.webContents.executeJavaScript('document.body.innerText');
      assert.ok(text.includes('护眼走动提醒'));
      assert.ok(!/console\.|ipcRenderer|const |function |EPIPE|Uncaught/.test(text), 'Menu must show controls, not source or exception text');
      await menu!.webContents.executeJavaScript("document.querySelector('[data-command=\"size-smaller\"]').click(); document.querySelector('[data-command=\"size-smaller\"]').click(); document.getElementById('reminder-minutes').value='30'; document.getElementById('reminder-minutes').dispatchEvent(new Event('change',{bubbles:true}));");
      await waitFor(async () => (await pet!.webContents.executeJavaScript('window.petAPI.getWalkingState()')).intervalMinutes === 30, 'save reminder interval');
      assert.equal(menu!.isVisible(),true);
      if (round === 2) writeFileSync(join(output,'menu-after-closed-pipes.png'), (await menu!.webContents.capturePage()).toPNG());
      await menu!.webContents.executeJavaScript("document.querySelector('[data-command=\"close-menu\"]').click()");
      await waitFor(() => menu!.isDestroyed(), 'manual menu close');
    }
    report({ type: 'pass', details: 'packaged menu opens three times after stdout/stderr close; repeated scale changes, reminder save and close remain functional' });
    app.exit(0);
  } catch (error) { report({ type: 'failure', error: String(error) }); app.exit(1); }
});
