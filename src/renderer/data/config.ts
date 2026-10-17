// 养成系统配置：零食、等级、解锁内容、服装/配饰/场景
import type { SnackInventory, CostumeId, AccessoryId, SceneId } from '../../shared/types';

export interface SnackDef {
  id: keyof SnackInventory;
  name: string;
  emoji: string;
  xp: number;
}

export const SNACKS: SnackDef[] = [
  { id: 'chocobi', name: '巧克力棒', emoji: '🍫', xp: 10 },
  { id: 'chips', name: '薯片', emoji: '🍟', xp: 8 },
  { id: 'pudding', name: '布丁', emoji: '🍮', xp: 12 },
];

export type UnlockType = 'quote' | 'action' | 'scene' | 'title';

export interface LevelDef {
  level: number;
  /** 所需累计经验值 */
  xp: number;
  unlock: { type: UnlockType; id: string; name: string } | null;
}

export const LEVELS: LevelDef[] = [
  { level: 1, xp: 0, unlock: null },
  { level: 2, xp: 30, unlock: { type: 'quote', id: 'superman', name: '新台词「动感超人篇」' } },
  { level: 3, xp: 70, unlock: { type: 'action', id: 'dance', name: '新动作「大象舞 / 动感超人姿势」' } },
  { level: 4, xp: 120, unlock: { type: 'scene', id: 'supermanBase', name: '场景「动感超人基地」' } },
  { level: 5, xp: 180, unlock: { type: 'quote', id: 'kasukabe', name: '新台词「春日部日常篇」' } },
  { level: 6, xp: 250, unlock: { type: 'scene', id: 'kasukabeGuard', name: '场景「春日部防卫队总部」' } },
  { level: 7, xp: 330, unlock: { type: 'scene', id: 'noharaLiving', name: '场景「野原家客厅」' } },
  { level: 8, xp: 420, unlock: { type: 'title', id: 'legend', name: '称号「春日部的传说」' } },
];

export const MAX_LEVEL = LEVELS[LEVELS.length - 1].level;

export function levelForXp(xp: number): number {
  let lv = 1;
  for (const l of LEVELS) if (xp >= l.xp) lv = l.level;
  return lv;
}

export function levelProgress(xp: number): { level: number; cur: number; need: number; next: LevelDef | null } {
  const level = levelForXp(xp);
  const curDef = LEVELS.find((l) => l.level === level)!;
  const next = LEVELS.find((l) => l.level === level + 1) ?? null;
  const cur = xp - curDef.xp;
  const need = next ? next.xp - curDef.xp : 0;
  return { level, cur, need, next };
}

export const COSTUMES: { id: CostumeId; name: string; emoji: string }[] = [
  { id: 'default', name: '经典红T恤', emoji: '👕' },
  { id: 'superman', name: '动感超人服', emoji: '🦸' },
  { id: 'pajamas', name: '小新睡衣', emoji: '🛌' },
];

export const ACCESSORIES: { id: AccessoryId; name: string; emoji: string }[] = [
  { id: 'none', name: '不戴配饰', emoji: '🚫' },
  { id: 'shiroHat', name: '小白帽', emoji: '🐶' },
  { id: 'sunglasses', name: '酷酷墨镜', emoji: '🕶️' },
];

export const SCENES: { id: SceneId; name: string; emoji: string; unlockLevel: number }[] = [
  { id: 'none', name: '透明桌面', emoji: '✨', unlockLevel: 1 },
  { id: 'supermanBase', name: '动感超人基地', emoji: '🛸', unlockLevel: 4 },
  { id: 'kasukabeGuard', name: '春日部防卫队总部', emoji: '🚩', unlockLevel: 6 },
  { id: 'noharaLiving', name: '野原家客厅', emoji: '🛋️', unlockLevel: 7 },
];

/** 每累计 N 次互动发放 1 个随机零食 */
export const SNACK_REWARD_INTERVAL = 10;
