import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { EventEmitter } from 'node:events';
import type { DirectMessage, SocialPerson, SocialSnapshot } from '../shared/social';

interface User extends SocialPerson { tokenHash: string }
interface Request { id: string; from: string; to: string; createdAt: number }
interface Pair { members: [string, string]; read: Record<string, number>; messages: DirectMessage[] }
interface Database { version: 1; revision: number; seq: number; users: User[]; requests: Request[]; pairs: Pair[] }
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const person = ({ id, nickname, code }: User): SocialPerson => ({ id, nickname, code });
const textField = (value: unknown, max: number, label: string) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new ApiError(400, `${label}须为 1～${max} 个字符`);
  return value.trim();
};
const blank = (): Database => ({ version: 1, revision: 0, seq: 0, users: [], requests: [], pairs: [] });

/** Small self-hosted relay: authenticated HTTP + long polling, with atomic JSON persistence. */
export function createSocialServer(options: { dataFile: string; pollMs?: number }) {
  let db: Database = existsSync(options.dataFile) ? JSON.parse(readFileSync(options.dataFile, 'utf8')) : blank();
  if (db.version !== 1 || !Array.isArray(db.users) || !Array.isArray(db.pairs) || !Array.isArray(db.requests)) throw new Error('通信数据库格式无效，请恢复备份');
  const changes = new EventEmitter();
  changes.setMaxListeners(0);
  const limits = new Map<string, { count: number; until: number }>();
  const onlinePolls = new Map<string, number>();
  function limit(key: string, maximum: number, ms = 60_000) {
    const now = Date.now();
    for (const [k, value] of limits) if (value.until < now) limits.delete(k);
    const row = limits.get(key) ?? { count: 0, until: now + ms };
    if (++row.count > maximum) throw new ApiError(429, '操作太频繁，请稍后再试');
    limits.set(key, row);
  }
  function commit(update: (next: Database) => void) {
    const next = structuredClone(db);
    update(next);
    next.revision++;
    mkdirSync(dirname(options.dataFile), { recursive: true });
    writeFileSync(`${options.dataFile}.tmp`, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 });
    renameSync(`${options.dataFile}.tmp`, options.dataFile);
    db = next;
    changes.emit('change');
  }
  function snapshot(id: string): SocialSnapshot {
    const user = db.users.find(u => u.id === id)!;
    const pairs = db.pairs.filter(p => p.members.includes(id));
    return {
      revision: db.revision, me: person(user),
      friends: pairs.map(p => {
        const peer = db.users.find(u => u.id === p.members.find(member => member !== id))!;
        return { ...person(peer), unread: p.messages.filter(m => m.to === id && m.seq > (p.read[id] ?? 0)).length };
      }),
      requests: db.requests.filter(r => r.to === id).map(r => ({ id: r.id, from: person(db.users.find(u => u.id === r.from)!), createdAt: r.createdAt })),
      outgoing: db.requests.filter(r => r.from === id).map(r => ({ id: r.id, to: person(db.users.find(u => u.id === r.to)!), createdAt: r.createdAt })),
      messages: pairs.flatMap(p => p.messages).sort((a, b) => a.seq - b.seq),
    };
  }
  const send = (res: ServerResponse, status: number, data: unknown) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(data));
  };
  async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
    if (!req.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, '需要 JSON 请求');
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16_384) throw new ApiError(413, '请求太大');
      chunks.push(Buffer.from(chunk));
    }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      return value;
    } catch { throw new ApiError(400, 'JSON 格式无效'); }
  }
  const server = createServer(async (req, res) => {
    try {
      // This is a desktop-client API, not a browser API. Never enable wildcard CORS.
      if (req.headers.origin) throw new ApiError(403, '不接受网页跨域请求');
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, service: 'shinchan-social', version: 1 });
      if (req.method === 'POST' && url.pathname === '/register') {
        limit(`register:${req.socket.remoteAddress}`, 10, 600_000);
        const nickname = textField((await body(req)).nickname, 20, '昵称');
        if (db.users.length >= 500) throw new ApiError(503, '此测试服务的用户数已达上限');
        const token = randomBytes(32).toString('hex');
        let code: string;
        do { code = randomBytes(5).toString('hex').toUpperCase(); } while (db.users.some(u => u.code === code));
        const user = { id: randomUUID(), nickname, code, tokenHash: hash(token) };
        commit(next => { next.users.push(user); });
        return send(res, 201, { token, snapshot: snapshot(user.id) });
      }
      const auth = req.headers.authorization;
      const user = auth?.startsWith('Bearer ') ? db.users.find(u => u.tokenHash === hash(auth.slice(7))) : undefined;
      if (!user) throw new ApiError(401, '身份验证失败，请检查服务地址或恢复原来的本机身份文件');
      if (req.method === 'GET' && url.pathname === '/state') {
        const after = Number(url.searchParams.get('after') ?? -1);
        if (after !== db.revision || url.searchParams.get('wait') !== '1') return send(res, 200, snapshot(user.id));
        if ((onlinePolls.get(user.id) ?? 0) >= 2) throw new ApiError(429, '连接过多');
        onlinePolls.set(user.id, (onlinePolls.get(user.id) ?? 0) + 1);
        const finish = () => { cleanup(); send(res, 200, snapshot(user.id)); };
        const cleanup = () => { clearTimeout(timer); changes.off('change', finish); res.off('close', cleanup); onlinePolls.set(user.id, Math.max(0, (onlinePolls.get(user.id) ?? 1) - 1)); };
        const timer = setTimeout(finish, options.pollMs ?? 25_000);
        changes.once('change', finish);
        res.once('close', cleanup);
        return;
      }
      if (req.method !== 'POST') throw new ApiError(404, '接口不存在');
      limit(`user:${user.id}`, 120);
      const data = await body(req);
      if (url.pathname === '/profile') {
        const nickname = textField(data.nickname, 20, '昵称');
        if (user.nickname !== nickname) commit(next => { next.users.find(u => u.id === user.id)!.nickname = nickname; });
      } else if (url.pathname === '/requests') {
        const code = textField(data.code, 10, '好友码').toUpperCase();
        const target = db.users.find(u => u.code === code);
        if (!target) throw new ApiError(404, '没有找到这个好友码');
        if (target.id === user.id) throw new ApiError(400, '不能添加自己');
        if (db.pairs.some(p => p.members.includes(user.id) && p.members.includes(target.id))) throw new ApiError(409, '已经是好友啦');
        if (db.requests.some(r => [r.from, r.to].includes(user.id) && [r.from, r.to].includes(target.id))) throw new ApiError(409, '已有待处理申请，请到好友申请中查看');
        if (db.requests.filter(r => r.from === user.id || r.to === target.id).length >= 50) throw new ApiError(429, '待处理申请太多');
        commit(next => { next.requests.push({ id: randomUUID(), from: user.id, to: target.id, createdAt: Date.now() }); });
      } else if (url.pathname === '/requests/respond') {
        const request = db.requests.find(r => r.id === data.requestId && r.to === user.id);
        if (!request) throw new ApiError(404, '申请不存在或已处理');
        if (typeof data.accept !== 'boolean') throw new ApiError(400, '无效的申请操作');
        commit(next => {
          next.requests = next.requests.filter(r => r.id !== request.id);
          if (data.accept) next.pairs.push({ members: [request.from, request.to], read: {}, messages: [] });
        });
      } else if (url.pathname === '/messages') {
        const to = textField(data.to, 64, '收件人');
        const text = textField(data.text, 2000, '消息');
        const clientId = textField(data.clientId, 64, '消息编号');
        const pair = db.pairs.find(p => p.members.includes(user.id) && p.members.includes(to));
        if (!pair || to === user.id) throw new ApiError(403, '双方成为好友后才能发消息');
        const duplicate = pair.messages.find(m => m.from === user.id && m.clientId === clientId);
        if (duplicate && (duplicate.text !== text || duplicate.to !== to)) throw new ApiError(409, '消息编号已被使用');
        if (!duplicate) commit(next => {
          const p = next.pairs.find(p => p.members.includes(user.id) && p.members.includes(to))!;
          p.messages.push({ id: randomUUID(), seq: ++next.seq, clientId, from: user.id, to, text, createdAt: Date.now() });
          p.messages = p.messages.slice(-500);
        });
      } else if (url.pathname === '/read') {
        const pair = db.pairs.find(p => p.members.includes(user.id) && p.members.includes(String(data.peerId)));
        if (!pair) throw new ApiError(403, '好友不存在');
        if (!Number.isSafeInteger(data.through) || Number(data.through) < 0) throw new ApiError(400, '无效的已读位置');
        const through = Math.max(0, ...pair.messages.filter(m => m.to === user.id && m.seq <= Number(data.through)).map(m => m.seq));
        if (through > (pair.read[user.id] ?? 0)) commit(next => {
          next.pairs.find(p => p.members.includes(user.id) && p.members.includes(String(data.peerId)))!.read[user.id] = through;
        });
      } else throw new ApiError(404, '接口不存在');
      send(res, 200, snapshot(user.id));
    } catch (error) {
      send(res, error instanceof ApiError ? error.status : 500, { error: error instanceof ApiError ? error.message : '服务端保存失败，请稍后重试' });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}
