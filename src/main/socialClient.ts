import type { SocialAction, SocialSnapshot, SocialState } from '../shared/social';

export interface SocialCredentials { token: string; nickname: string }
export interface SocialSettings {
  serverUrl: string;
  enabled: boolean;
  accounts: Record<string, SocialCredentials>;
}
export const defaultSocialSettings = (): SocialSettings => ({ serverUrl: 'http://127.0.0.1:4317', enabled: false, accounts: {} });

export function normalizeSocialUrl(value: unknown) {
  if (typeof value !== 'string') throw new Error('请输入通信服务地址');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('通信服务地址格式不正确'); }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || /^10\.\d+\.\d+\.\d+$/.test(url.hostname) || /^192\.168\.\d+\.\d+$/.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('公网通信请使用 HTTPS 地址；HTTP 仅用于本机或可信局域网测试');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('请填写服务根地址，例如 http://127.0.0.1:4317');
  return url.origin;
}

/** Tokens stay in the main process; only the sanitized snapshot crosses IPC. */
export class SocialClient {
  private controller: AbortController | null = null;
  private epoch = 0;
  private state: SocialState;
  constructor(private settings: SocialSettings, private save: (settings: SocialSettings) => void, private changed: (state: SocialState) => void) {
    this.state = { serverUrl: settings.serverUrl, status: 'disconnected', error: '', snapshot: null };
  }
  getState() { return structuredClone(this.state); }
  private publish(patch: Partial<SocialState>) { this.state = { ...this.state, ...patch }; this.changed(this.getState()); }
  private accept(snapshot: SocialSnapshot) {
    if (!snapshot || !Array.isArray(snapshot.friends) || !Array.isArray(snapshot.messages) || !Array.isArray(snapshot.requests) || !snapshot.me || !Number.isSafeInteger(snapshot.revision)) throw new Error('通信服务返回的数据格式不正确');
    if (!this.state.snapshot || snapshot.revision >= this.state.snapshot.revision) this.publish({ snapshot, status: 'connected', error: '' });
  }
  private async request(path: string, data?: unknown, wait = false, token?: string) {
    const controller = this.controller;
    if (!controller) throw new Error('请先连接好友通信服务');
    const timeout = AbortSignal.timeout(wait ? 35_000 : 12_000);
    const credentials = token ?? this.settings.accounts[this.state.serverUrl]?.token;
    const response = await fetch(this.state.serverUrl + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { ...(credentials ? { Authorization: `Bearer ${credentials}` } : {}), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.any([controller.signal, timeout]),
      redirect: 'error',
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `服务返回 ${response.status}`);
    return result;
  }
  async start() {
    if (this.settings.enabled && this.settings.accounts[this.settings.serverUrl]) {
      try {
        const serverUrl = normalizeSocialUrl(this.settings.serverUrl);
        this.stop(); this.controller = new AbortController();
        this.publish({ serverUrl, status: 'connecting', error: '', snapshot: null });
        // Keep retrying if the desktop starts before its relay server does.
        void this.poll(this.epoch);
      } catch (error) { this.publish({ error: error instanceof Error ? error.message : '服务地址无效' }); }
    }
  }
  stop() { ++this.epoch; this.controller?.abort(); this.controller = null; }
  private async connect(value: string, name: string) {
    const serverUrl = normalizeSocialUrl(value);
    const nickname = typeof name === 'string' ? name.trim() : '';
    if (!nickname || nickname.length > 20) throw new Error('昵称需要 1～20 个字符');
    this.stop();
    const epoch = this.epoch;
    this.controller = new AbortController();
    this.publish({ serverUrl, status: 'connecting', error: '', snapshot: null });
    try {
      const account = this.settings.accounts[serverUrl];
      let snapshot: SocialSnapshot;
      let token = account?.token;
      if (!token) {
        const result = await this.request('/register', { nickname });
        token = result.token;
        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('通信服务没有返回有效身份');
        snapshot = result.snapshot;
      } else snapshot = await this.request('/profile', { nickname }, false, token);
      if (epoch !== this.epoch) return;
      const next = { serverUrl, enabled: true, accounts: { ...this.settings.accounts, [serverUrl]: { token, nickname } } };
      this.save(next);
      this.settings = next;
      this.accept(snapshot);
      void this.poll(epoch);
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.stop();
      this.publish({ status: 'disconnected', error: error instanceof Error && error.message !== 'fetch failed' ? error.message : '连接失败，请确认通信服务已启动，地址和端口正确' });
      throw error;
    }
  }
  private async poll(epoch: number) {
    let failures = 0;
    while (epoch === this.epoch && this.controller) {
      try {
        const snapshot = await this.request(`/state?after=${this.state.snapshot?.revision ?? -1}&wait=1`, undefined, true);
        if (epoch !== this.epoch) return;
        this.accept(snapshot);
        failures = 0;
      } catch (error) {
        if (epoch !== this.epoch) return;
        this.publish({ status: 'reconnecting', error: '连接中断，正在重连。未发送成功的消息可保留后重试。' });
        await new Promise<void>(resolve => {
          const signal = this.controller!.signal;
          const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
          const timer = setTimeout(done, Math.min(15_000, 1000 * 2 ** Math.min(failures++, 4)));
          signal.addEventListener('abort', done, { once: true });
        });
      }
    }
  }
  async action(action: SocialAction): Promise<{ ok: boolean; error?: string }> {
    try {
      if (!action || typeof action !== 'object') throw new Error('无效操作');
      if (action.type === 'connect') await this.connect(action.serverUrl, action.nickname);
      else if (action.type === 'disconnect') {
        const next = { ...this.settings, enabled: false };
        this.save(next); this.settings = next; this.stop();
        this.publish({ status: 'disconnected', error: '' });
      } else {
        if (!this.state.snapshot || this.state.status === 'disconnected' || this.state.status === 'connecting') throw new Error('请先连接好友通信服务');
        const routes = { request: '/requests', respond: '/requests/respond', send: '/messages', read: '/read' };
        const route = routes[action.type];
        if (!route) throw new Error('无效操作');
        const epoch = this.epoch;
        const snapshot = await this.request(route, action);
        if (epoch !== this.epoch) throw new Error('连接已变更，请重试');
        this.accept(snapshot);
      }
      return { ok: true };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : '操作失败，请重试' }; }
  }
}
