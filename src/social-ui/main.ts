import type { SocialAction, SocialState } from '../shared/social';

interface FriendsAPI {
  getState(): Promise<SocialState>;
  action(action: SocialAction): Promise<{ ok: boolean; error?: string }>;
  copyCode(): Promise<void>;
  close(): Promise<void>;
  onState(callback: (state: SocialState) => void): () => void;
}
const api = (window as unknown as { friendsAPI: FriendsAPI }).friendsAPI;
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const server = el<HTMLInputElement>('server');
const nickname = el<HTMLInputElement>('nickname');
const message = el<HTMLTextAreaElement>('message');
const send = el<HTMLButtonElement>('send');
let state: SocialState;
let selected = '';
let account = '';
let initialized = false;
let messageKey = '';
let sending = false;
let reading = false;
const drafts = new Map<string, string>();
const retries = new Map<string, { text: string; clientId: string }>();
function notice(value: string) { el('notice').textContent = value; }
function label(tag: string, text: string, className = '') { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; }
function button(text: string, fn: () => void, className = '') { const node = label('button', text, className) as HTMLButtonElement; node.type = 'button'; node.onclick = fn; return node; }
async function run(action: SocialAction) {
  try {
    const result = await api.action(action);
    if (!result.ok) { notice(result.error ?? '操作失败，请重试'); return false; }
    notice(''); return true;
  } catch { notice('窗口连接异常，请关闭好友信箱后重试'); return false; }
}
async function markRead() {
  if (reading || !document.hasFocus() || document.hidden || state?.status !== 'connected' || !selected) return;
  const friend = state.snapshot?.friends.find(f => f.id === selected);
  const through = Math.max(0, ...(state.snapshot?.messages.filter(m => m.from === selected) ?? []).map(m => m.seq));
  if (!friend?.unread || !through) return;
  reading = true;
  let succeeded = false;
  try { succeeded = (await api.action({ type: 'read', peerId: selected, through })).ok; } catch { /* Retry on the next state/focus update. */ } finally { reading = false; }
  // Another message may have arrived while this acknowledgement was in flight.
  if (succeeded) void markRead();
}
function render(next: SocialState) {
  state = next;
  const snap = next.snapshot;
  const connected = next.status === 'connected';
  const identity = snap ? `${next.serverUrl}/${snap.me.id}` : '';
  if (account && identity && identity !== account) { drafts.clear(); retries.clear(); selected = ''; message.value = ''; }
  if (identity) account = identity;
  if (!initialized) { server.value = next.serverUrl; initialized = true; }
  el('status').textContent = { disconnected: '未连接', connecting: '正在连接……', connected: '已连接 · 小新正在帮你送信', reconnecting: '连接中断 · 自动重连中' }[next.status];
  if (next.error) notice(next.error);
  el<HTMLButtonElement>('connect').disabled = next.status === 'connecting';
  el('identity').hidden = !snap;
  el<HTMLButtonElement>('disconnect').disabled = next.status === 'disconnected';
  el<HTMLButtonElement>('add').disabled = !connected;
  if (snap) {
    el('me').textContent = snap.me.nickname;
    el('code').textContent = `好友码：${snap.me.code}`;
    if (!nickname.value) nickname.value = snap.me.nickname;
  }
  const requests = el('requests'); requests.replaceChildren();
  for (const req of snap?.requests ?? []) {
    const row = document.createElement('div'); row.className = 'request'; row.append(label('p', `${req.from.nickname} 想和你成为好友`));
    for (const [text, accept] of [['同意', true], ['忽略', false]] as const) {
      const b = button(text, async () => { b.disabled = true; await run({ type: 'respond', requestId: req.id, accept }); if (b.isConnected) b.disabled = false; }, accept ? 'secondary' : '');
      b.disabled = !connected; row.append(b);
    }
    requests.append(row);
  }
  if (!requests.children.length) requests.append(label('p', '暂时没有新申请', 'hint'));
  const friends = el('friends'); friends.replaceChildren();
  if (selected && !snap?.friends.some(f => f.id === selected)) { selected = ''; message.value = ''; }
  for (const friend of snap?.friends ?? []) {
    const b = button('', () => {
      if (selected) drafts.set(selected, message.value);
      selected = friend.id; message.value = drafts.get(selected) ?? ''; render(state); message.focus(); void markRead();
    }, 'friend');
    b.setAttribute('aria-pressed', String(selected === friend.id)); b.append(label('span', friend.nickname));
    if (friend.unread) b.append(label('span', String(friend.unread), 'count'));
    friends.append(b);
  }
  if (!friends.children.length) friends.append(label('p', '交换好友码，邀请朋友来坐坐吧', 'hint'));
  const outgoing = el('outgoing'); outgoing.replaceChildren();
  for (const req of snap?.outgoing ?? []) outgoing.append(label('p', `${req.to.nickname} · 等待对方同意`, 'hint'));
  if (!outgoing.children.length) outgoing.append(label('p', '暂无', 'hint'));
  el('peer').textContent = snap?.friends.find(f => f.id === selected)?.nickname ?? '选一位好友，聊聊今天吧';
  message.disabled = !selected || !connected || sending;
  send.disabled = !selected || !connected || sending;
  const messages = snap?.messages.filter(m => m.from === selected || m.to === selected) ?? [];
  const key = `${account}/${selected}/${messages.map(m => m.id).join(',')}`;
  if (key !== messageKey) {
    const box = el('messages'); const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 70 || !messageKey.startsWith(`${account}/${selected}/`);
    messageKey = key; box.replaceChildren();
    for (const msg of messages) {
      const row = document.createElement('article'); row.className = `message${msg.from === snap?.me.id ? ' own' : ''}`;
      row.append(label('small', new Date(msg.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })), label('p', msg.text));
      box.append(row);
    }
    if (!messages.length) box.append(label('p', selected ? '今天过得怎么样？给朋友发一句问候吧。' : '消息会由小新送到朋友的桌面上。', 'empty'));
    if (atBottom) box.scrollTop = box.scrollHeight;
  }
  void markRead();
}
el('connect-form').onsubmit = async event => {
  event.preventDefault();
  if (await run({ type: 'connect', serverUrl: server.value, nickname: nickname.value })) el<HTMLDetailsElement>('setup').open = false;
};
el('disconnect').onclick = () => { void run({ type: 'disconnect' }); };
el('copy').onclick = async () => { try { await api.copyCode(); notice('好友码已复制'); } catch { notice('复制失败，请手动复制好友码'); } };
el('close').onclick = () => { void api.close(); };
el('add-form').onsubmit = async event => {
  event.preventDefault(); const code = el<HTMLInputElement>('friend-code');
  if (await run({ type: 'request', code: code.value.trim().toUpperCase() })) { code.value = ''; notice('申请已发送，等待朋友同意'); }
};
message.oninput = () => { if (selected) drafts.set(selected, message.value); };
el('send-form').onsubmit = async event => {
  event.preventDefault();
  if (sending || !selected || !message.value.trim() || state.status !== 'connected') return;
  const peer = selected, text = message.value.trim();
  let pending = retries.get(peer);
  if (!pending || pending.text !== text) { pending = { text, clientId: crypto.randomUUID() }; retries.set(peer, pending); }
  sending = true; render(state);
  try {
    if (await run({ type: 'send', to: peer, text, clientId: pending.clientId })) {
      retries.delete(peer); drafts.delete(peer);
      if (selected === peer) message.value = '';
    }
  } finally { sending = false; render(state); if (selected === peer) message.focus(); }
};
message.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); el<HTMLFormElement>('send-form').requestSubmit(); } };
window.addEventListener('focus', () => { void markRead(); });
document.addEventListener('visibilitychange', () => { void markRead(); });
let updates = 0;
api.onState(next => { updates++; render(next); });
void api.getState().then(next => { if (!updates) render(next); }).catch(() => notice('好友信箱初始化失败，请重新打开'));
