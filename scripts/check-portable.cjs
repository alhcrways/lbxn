// Exercise the self-extracting EXE, including a second launch while the first is alive.
// Loading app.asar in node_modules/electron cannot catch a portable launcher deleting its runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright-core');

async function waitFor(check, name, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out: ' + name);
}
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

(async () => {
  const version = require('../package.json').version;
  const exe = path.resolve(process.argv[2] || `release/Shinchan-Pet-${version}-Portable.exe`);
  assert.ok(fs.existsSync(exe), 'Build the portable executable first');
  const output = path.resolve('output/portable-test');
  fs.mkdirSync(output, { recursive: true });
  const env = { ...process.env, SHINCHAN_PROFILE: 'portable-test-' + Date.now() };
  for (const key of ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'ELECTRON_START_URL']) delete env[key];
  const port = await freePort();
  const child = spawn(exe, [`--remote-debugging-port=${port}`], { env, stdio: 'ignore', windowsHide: true });
  let childError;
  child.on('error', error => { childError = error; });
  let browser, pet;
  try {
    await waitFor(async () => {
      if (childError) throw childError;
      if (child.exitCode !== null) throw new Error('Portable launcher exited: ' + child.exitCode);
      return fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.ok).catch(() => false);
    }, 'portable launch');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    pet = await waitFor(() => context.pages().find(p => p.url().includes('/dist/index.html')), 'pet page');
    await pet.waitForSelector('[data-pet-stage]');

    async function openMenu() {
      await pet.evaluate(() => window.petAPI.openMenu());
      const menu = await waitFor(async () => {
        for (const page of context.pages()) if (page !== pet && await page.title().catch(() => '') === '春日部控制台') return page;
      }, 'control menu');
      await menu.waitForSelector('.menu');
      return menu;
    }
    let menu = await openMenu();
    const runtime = await menu.evaluate(() => require('node:path').dirname(process.execPath));
    const resources = ['resources.pak', 'chrome_100_percent.pak', 'chrome_200_percent.pak', 'resources/app.asar'];
    const hashes = resources.map(file => require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(runtime, file))).digest('hex'));
    await menu.locator('[data-command="close-menu"]').click();
    await waitFor(() => menu.isClosed(), 'menu closed');

    for (let round = 0; round < 2; round++) {
      const second = spawn(exe, [], { env, stdio: 'ignore', windowsHide: true });
      second.on('error', error => { childError = error; });
      await waitFor(() => {
        if (childError) throw childError;
        return second.exitCode !== null;
      }, 'second launch exits through single-instance lock');
      assert.equal(second.exitCode, 0);
      const missing = resources.filter(file => !fs.existsSync(path.join(runtime, file)));
      console.log('After repeated launch, missing runtime files:', missing);
      menu = await openMenu();
      const state = await menu.evaluate(() => ({
        text: document.documentElement.innerText,
        head: getComputedStyle(document.head).display,
        style: getComputedStyle(document.querySelector('style')).display,
        color: getComputedStyle(document.querySelector('.menu')).backgroundColor,
      }));
      await menu.screenshot({ path: path.join(output, `menu-after-relaunch-${round}.png`) });
      fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ runtime, missing, state }, null, 2));
      assert.deepEqual(missing, [], 'Repeated launch must preserve the running instance’s runtime files');
      resources.forEach((file, i) => assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(runtime, file))).digest('hex'), hashes[i]));
      assert.equal(state.head, 'none');
      assert.equal(state.style, 'none');
      assert.ok(!/box-sizing|font:|ipcRenderer|const |EPIPE/.test(state.text), 'Menu must not display CSS or JavaScript');
      assert.equal(state.color, 'rgb(213, 231, 238)');
      await menu.locator('[data-command="size-smaller"]').click();
      await menu.locator('[data-command="size-smaller"]').click();
      assert.ok(!menu.isClosed(), 'Resizing must keep menu open');
      await menu.locator('[data-command="close-menu"]').click();
      await waitFor(() => menu.isClosed(), 'manual menu close');
    }
    console.log('PASS: real portable EXE survives repeated launches with intact runtime, styled menu, repeated resizing and manual close');
  } finally {
    if (pet && !pet.isClosed()) await pet.evaluate(() => window.petAPI.quit()).catch(() => {});
    if (browser) await browser.close();
    await waitFor(() => child.exitCode !== null, 'test launcher cleanup', 15000).catch(() => child.kill());
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
