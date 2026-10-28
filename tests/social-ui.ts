import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { createSocialServer } from '../src/social/server';
import { SocialClient, defaultSocialSettings } from '../src/main/socialClient';
import { setupSocial } from '../src/main/socialWindow';

const output = resolve('output/social-ui'); mkdirSync(output, { recursive: true });
const directory = process.env.SOCIAL_UI_TEST_PROFILE!;
if (!directory) throw new Error('Missing isolated test profile');
app.setPath('userData', directory);
app.disableHardwareAcceleration();
async function waitFor(check: () => Promise<boolean> | boolean, label: string) {
  const until = Date.now() + 10_000;
  while (!await check()) { if (Date.now() > until) throw new Error(`Timed out: ${label}`); await new Promise(resolve => setTimeout(resolve, 40)); }
}
app.whenReady().then(async () => {
  const server = createSocialServer({ dataFile: join(directory, 'server.json'), pollMs: 200 });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const bob = new SocialClient(defaultSocialSettings(), () => {}, () => {});
  let unread = 0;
  const manager = setupSocial(() => null, count => { unread = count; });
  try {
    manager.open();
    const window = BrowserWindow.getAllWindows()[0]; window.hide();
    const errors: string[] = [];
    window.webContents.on('preload-error', (_e, _path, error) => errors.push(error.message));
    await waitFor(() => window.webContents.executeJavaScript(`Boolean(window.friendsAPI && document.getElementById('connect-form'))`).catch(() => false), 'preload and local HTML');
    assert.equal(await window.webContents.executeJavaScript(`typeof require`), 'undefined', 'Node must be unavailable to message content');
    await window.webContents.executeJavaScript(`document.getElementById('server').value=${JSON.stringify(url)}; document.getElementById('nickname').value='小红'; document.getElementById('connect-form').requestSubmit();`);
    await waitFor(() => window.webContents.executeJavaScript(`document.getElementById('code').textContent.includes('好友码：')`), 'UI registration');
    const state = await window.webContents.executeJavaScript(`window.friendsAPI.getState()`);
    assert.equal(JSON.stringify(state).includes('token'), false);
    assert.equal((await bob.action({ type: 'connect', serverUrl: url, nickname: '小蓝' })).ok, true);
    await bob.action({ type: 'request', code: state.snapshot.me.code });
    await waitFor(() => window.webContents.executeJavaScript(`document.getElementById('requests').textContent.includes('小蓝')`), 'incoming friend request UI');
    assert.equal(unread, 1, 'desktop request badge');
    await window.webContents.executeJavaScript(`document.querySelector('#requests button').click()`);
    await waitFor(() => bob.getState().snapshot!.friends.length === 1, 'accept request from UI');
    await waitFor(() => window.webContents.executeJavaScript(`Boolean(document.querySelector('#friends button'))`), 'friend button');
    await window.webContents.executeJavaScript(`document.querySelector('#friends button').click(); document.getElementById('message').value='今天也要开心呀'; document.getElementById('send-form').requestSubmit();`);
    await waitFor(() => bob.getState().snapshot!.messages.some(m => m.text === '今天也要开心呀'), 'send via composer');
    const malicious = '<img src=x onerror="window.hacked=true">我收到啦！';
    await bob.action({ type: 'send', to: state.snapshot.me.id, text: malicious, clientId: 'ui-reply' });
    await waitFor(() => window.webContents.executeJavaScript(`document.getElementById('messages').textContent.includes('我收到啦')`), 'render reply');
    assert.equal(await window.webContents.executeJavaScript(`Boolean(window.hacked || document.querySelector('#messages img'))`), false, 'messages render as text, never HTML');
    assert.equal(unread, 1, 'hidden conversations remain unread');
    const disk = readFileSync(join(directory, 'shinchan-pet-data/friends-identity.bin'));
    assert.ok(!disk.toString('utf8').includes('accounts'), 'identity file must be encrypted');
    for (const size of [{ width: 660, height: 590 }, { width: 560, height: 470 }]) {
      window.setSize(size.width, size.height);
      const dimensions = await window.webContents.executeJavaScript(`(() => {const panel=document.querySelector('.panel').getBoundingClientRect(), composer=document.querySelector('.composer').getBoundingClientRect();return {width:innerWidth,height:innerHeight,scrollWidth:document.body.scrollWidth,scrollHeight:document.body.scrollHeight,bottom:composer.bottom,panelBottom:panel.bottom};})()`);
      assert.ok(dimensions.scrollWidth <= dimensions.width + 1 && dimensions.scrollHeight <= dimensions.height + 1, JSON.stringify(dimensions));
      assert.ok(dimensions.bottom < dimensions.panelBottom, 'composer must remain inside panel');
      const image = await window.capturePage(undefined, { stayHidden: true });
      writeFileSync(join(output, `friends-${size.width}.png`), image.toPNG());
    }
    assert.deepEqual(errors, []);
    console.log('PASS: real sandboxed preload, registration, friend approval, composer, unread badge, reply, HTML escaping, encrypted identity and 660/560px layouts');
  } finally {
    bob.stop(); manager.stop(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
