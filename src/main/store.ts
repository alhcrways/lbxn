// 本地数据持久化：JSON 文件存储（位于系统 userData 目录）
// 说明：PRD 建议 SQLite(better-sqlite3)，因其需要原生模块编译（Windows 上常因
// 缺少构建工具失败），这里以相同表结构的 JSON 存储实现，完全离线运行；
// 接口与 SQLite 版本一一对应，后续如需可无缝替换。
import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { LogEntry, GrowthData, OutfitData, PetState, StoreKey, ChatMessage, LlmConfig, StickyNote, ServerAuth } from '../shared/types';

export type { StoreKey };

interface Stores {
  log: LogEntry[];
  growth: GrowthData;
  outfit: OutfitData;
  state: PetState;
  chat: ChatMessage[];
  llmConfig: LlmConfig;
  notes: StickyNote[];
  serverAuth: ServerAuth;
}

const now = () => Date.now();
const uid = () => now().toString(36) + Math.random().toString(36).slice(2, 7);

const defaults = (): Stores => ({
  log: [],
  growth: {
    xp: 0,
    level: 1,
    snacks: { chocobi: 0, chips: 0, pudding: 0 },
    unlocked: [],
    interactionCount: 0,
  },
  outfit: { costume: 'default', accessory: 'none', scene: 'none' },
  state: {
    firstLaunchAt: now(),
    lastInteractionAt: 0,
    emotion: 'curious',
    totalInteractions: 0,
  },
  chat: [],
  llmConfig: {
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    model: 'deepseek-flash',
  },
  notes: [],
  serverAuth: { token: '' },
});

let stores: Stores | null = null;
let dataDir = '';

function filePath(key: StoreKey) {
  return join(dataDir, `${key}.json`);
}

/** 取存储对象（未初始化时自动初始化） */
function S(): Stores {
  if (!stores) initStores();
  return stores!;
}

/** 宽松索引访问（绕过 TS 的 Record 索引签名限制） */
function bag(): Record<StoreKey, unknown> {
  return S() as unknown as Record<StoreKey, unknown>;
}

export function initStores() {
  dataDir = join(app.getPath('userData'), 'shinchan-pet-data');
  mkdirSync(dataDir, { recursive: true });
  const def = defaults();
  const target = {} as Record<StoreKey, unknown>;
  for (const key of Object.keys(def) as StoreKey[]) {
    const fallback = def[key];
    try {
      if (existsSync(filePath(key))) {
        const parsed = JSON.parse(readFileSync(filePath(key), 'utf-8'));
        // 数组类型（log / chat / notes）必须保持数组：对象 spread 会把 [] 变成 {}，
        // 导致后续 .slice/.push 抛 TypeError
        const isArrKey = key === 'log' || key === 'chat' || key === 'notes';
        target[key] = isArrKey
          ? (Array.isArray(parsed) ? parsed : fallback)
          : { ...(fallback as object), ...parsed };
      } else {
        target[key] = fallback;
      }
    } catch {
      target[key] = fallback;
    }
  }
  stores = target as unknown as Stores;
  // 启动即落盘，便于用户确认数据位置与排障
  for (const key of Object.keys(def) as StoreKey[]) persist(key);
  return stores;
}

function persist(key: StoreKey): { ok: boolean; error?: string } {
  try {
    const path = filePath(key);
    if (key === 'notes') {
      // Replace complete JSON only after writing succeeds; avoid a truncated note file.
      writeFileSync(`${path}.tmp`, JSON.stringify(bag()[key], null, 2), 'utf-8');
      renameSync(`${path}.tmp`, path);
    } else writeFileSync(path, JSON.stringify(bag()[key], null, 2), 'utf-8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function getData(key: StoreKey) {
  return bag()[key];
}

export function setData(key: StoreKey, value: unknown) {
  bag()[key] = value;
  return persist(key);
}

/** 追加互动日记（读-改-写在主进程内完成，避免竞态） */
export function appendLog(entry: Omit<LogEntry, 'id' | 'ts'> & { id?: string; ts?: number }) {
  const full: LogEntry = {
    id: entry.id ?? uid(),
    ts: entry.ts ?? now(),
    type: entry.type,
    text: entry.text,
    note: entry.note,
  };
  const s = S();
  s.log.push(full);
  // 日记最多保留 5000 条，防止无限增长
  if (s.log.length > 5000) s.log = s.log.slice(-5000);
  const r = persist('log');
  return { result: full, ...r };
}

export function updateLogNote(id: string, note: string) {
  const entry = S().log.find((e) => e.id === id);
  if (entry) entry.note = note;
  return persist('log');
}

/** 追加聊天消息到历史记录（最多保留最近 100 条） */
export function appendChatMessage(msg: Omit<ChatMessage, 'ts'> & { ts?: number }) {
  const full: ChatMessage = { ...msg, ts: msg.ts ?? now() };
  const s = S();
  s.chat.push(full);
  if (s.chat.length > 100) s.chat = s.chat.slice(-100);
  const r = persist('chat');
  return { result: full, ...r };
}

/** 创建一张新便利贴 */
export function appendNote(note: Omit<StickyNote, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number; updatedAt?: number }) {
  const s = S();
  if (s.notes.length >= 50) return { ok: false, result: null, error: '已有 50 张便利贴，请先整理或删除不需要的便签。' };
  const full: StickyNote = {
    id: note.id ?? uid(),
    content: note.content,
    pinned: note.pinned,
    bounds: note.bounds,
    color: note.color,
    createdAt: note.createdAt ?? now(),
    updatedAt: note.updatedAt ?? now(),
  };
  s.notes.push(full);
  const r = persist('notes');
  if (!r.ok) s.notes = s.notes.filter((n) => n.id !== full.id);
  return { result: full, ...r };
}

/** 更新便利贴（内容/颜色/固定状态/窗口位置） */
export function updateNote(id: string, patch: Partial<Omit<StickyNote, 'id' | 'createdAt'>>) {
  const s = S();
  const note = s.notes.find((n) => n.id === id);
  if (!note) return { ok: false, error: '找不到这张便利贴。' };
  const previous = { ...note };
  Object.assign(note, patch, { updatedAt: now() });
  const result = persist('notes');
  if (!result.ok) s.notes[s.notes.findIndex((n) => n.id === id)] = previous;
  return result;
}

/** 删除便利贴 */
export function deleteNote(id: string) {
  const s = S();
  const previous = s.notes;
  s.notes = s.notes.filter((n) => n.id !== id);
  const result = persist('notes');
  if (!result.ok) s.notes = previous;
  return result;
}
