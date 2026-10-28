import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createSocialServer } from '../src/social/server';
import { SocialClient, defaultSocialSettings, normalizeSocialUrl, type SocialSettings } from '../src/main/socialClient';

async function waitFor(check: () => boolean, label: string, ms = 6000) {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

test('two real clients: consent, bidirectional delivery, offline recovery and server restart', { timeout: 25_000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'shinchan-social-data-'));
  const dataFile = join(directory, 'server.json');
  let server = createSocialServer({ dataFile, pollMs: 150 });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}`;
  const saved = new Map<string, SocialSettings>();
  const clients: SocialClient[] = [];
  function make(name: string) {
    const client = new SocialClient(structuredClone(saved.get(name) ?? defaultSocialSettings()), config => { saved.set(name, structuredClone(config)); }, () => {});
    clients.push(client); return client;
  }
  const alice = make('alice'), bob = make('bob');
  const act = async (client: SocialClient, action: Parameters<SocialClient['action']>[0]) => {
    const result = await client.action(action); assert.equal(result.ok, true, result.error);
  };
  try {
    await act(alice, { type: 'connect', serverUrl: url, nickname: '小红' });
    await act(bob, { type: 'connect', serverUrl: url, nickname: '小蓝' });
    const a = alice.getState().snapshot!.me, b = bob.getState().snapshot!.me;
    assert.match(a.code, /^[A-F0-9]{10}$/);
    assert.equal((await alice.action({ type: 'send', to: b.id, text: '陌生人消息', clientId: 'blocked' })).ok, false);
    await act(alice, { type: 'request', code: b.code });
    await waitFor(() => bob.getState().snapshot!.requests.length === 1, 'friend request');
    let request = bob.getState().snapshot!.requests[0];
    assert.equal((await alice.action({ type: 'respond', requestId: request.id, accept: true })).ok, false, 'only the recipient may accept');
    await act(bob, { type: 'respond', requestId: request.id, accept: false });
    await waitFor(() => alice.getState().snapshot!.outgoing.length === 0, 'declined request removed');
    await act(alice, { type: 'request', code: b.code });
    await waitFor(() => bob.getState().snapshot!.requests.length === 1, 'second request');
    request = bob.getState().snapshot!.requests[0];
    await act(bob, { type: 'respond', requestId: request.id, accept: true });
    await waitFor(() => alice.getState().snapshot!.friends.length === 1, 'mutual friendship');
    await act(alice, { type: 'send', to: b.id, text: '第一封信', clientId: 'message-one' });
    await waitFor(() => bob.getState().snapshot!.messages.length === 1, 'incoming message');
    assert.equal(bob.getState().snapshot!.friends[0].unread, 1);
    const through = bob.getState().snapshot!.messages[0].seq;
    await act(alice, { type: 'send', to: b.id, text: '第一封信', clientId: 'message-one' });
    assert.equal(alice.getState().snapshot!.messages.length, 1, 'retries must be idempotent');
    assert.equal((await alice.action({ type: 'send', to: b.id, text: '复用 ID 的另一封信', clientId: 'message-one' })).ok, false);
    await act(alice, { type: 'send', to: b.id, text: '第二封信', clientId: 'message-two' });
    await act(bob, { type: 'read', peerId: a.id, through });
    assert.equal(bob.getState().snapshot!.friends[0].unread, 1, 'read acknowledgement cannot swallow a later arrival');
    await act(bob, { type: 'send', to: a.id, text: '收到啦！<img src=x onerror=alert(1)>', clientId: 'reply' });
    await waitFor(() => alice.getState().snapshot!.messages.some(m => m.from === b.id), 'reply delivered');
    assert.equal(alice.getState().snapshot!.friends[0].unread, 1);
    await act(bob, { type: 'disconnect' });
    await act(alice, { type: 'send', to: b.id, text: '离线留言', clientId: 'offline' });
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await waitFor(() => alice.getState().status === 'reconnecting', 'network disconnect shown');
    const aliceRestarted = make('alice');
    await aliceRestarted.start();
    await waitFor(() => aliceRestarted.getState().status === 'reconnecting', 'cold-start retry while relay is offline');
    alice.stop();
    server = createSocialServer({ dataFile, pollMs: 150 });
    server.listen(port, '127.0.0.1'); await once(server, 'listening');
    await waitFor(() => aliceRestarted.getState().status === 'connected', 'cold-start automatic reconnect');
    const bobRestored = make('bob');
    await act(bobRestored, { type: 'connect', serverUrl: url, nickname: '小蓝' });
    assert.equal(bobRestored.getState().snapshot!.me.id, b.id, 'identity survives restart');
    assert.equal(bobRestored.getState().snapshot!.me.code, b.code);
    assert.equal(bobRestored.getState().snapshot!.messages.filter(m => m.from === a.id).length, 3);
    assert.equal(bobRestored.getState().snapshot!.friends[0].unread, 2);
    const last = Math.max(...bobRestored.getState().snapshot!.messages.map(m => m.seq));
    await act(bobRestored, { type: 'read', peerId: a.id, through: last });
    assert.equal(bobRestored.getState().snapshot!.friends[0].unread, 0);
    const disk = readFileSync(dataFile, 'utf8');
    assert.ok(!disk.includes(saved.get('alice')!.accounts[url].token), 'server stores token hashes, not bearer credentials');
    assert.ok(!JSON.stringify(alice.getState()).includes('token'), 'UI state must never contain credentials');
    const stranger = make('stranger'); await act(stranger, { type: 'connect', serverUrl: url, nickname: '旁观者' });
    assert.equal(stranger.getState().snapshot!.messages.length, 0);
    assert.equal((await stranger.action({ type: 'send', to: a.id, text: '越权消息', clientId: 'bad' })).ok, false);
    const unauth = await fetch(url + '/state'); assert.equal(unauth.status, 401);
    const browser = await fetch(url + '/register', { method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' }, body: '{"nickname":"网页"}' }); assert.equal(browser.status, 403);
    const malformed = await fetch(url + '/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null' }); assert.equal(malformed.status, 400);
  } finally {
    clients.forEach(c => c.stop()); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('service addresses require HTTPS off the local network and cannot embed credentials', () => {
  assert.equal(normalizeSocialUrl('http://127.0.0.1:4317/'), 'http://127.0.0.1:4317');
  assert.equal(normalizeSocialUrl('http://192.168.1.10:4317'), 'http://192.168.1.10:4317');
  assert.equal(normalizeSocialUrl('https://friends.example.com'), 'https://friends.example.com');
  for (const url of ['file:///etc/passwd', 'http://example.com', 'https://user:password@example.com', 'https://example.com/api', 'https://example.com/?token=secret']) assert.throws(() => normalizeSocialUrl(url));
});
