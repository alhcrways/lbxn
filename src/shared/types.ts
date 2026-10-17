// 主进程 / 渲染进程共享的类型定义

/** 存储键（对应 PRD 的三张表 + 运行状态 + 聊天 + 便利贴 + 手机连接） */
export type StoreKey = 'log' | 'growth' | 'outfit' | 'state' | 'chat' | 'llmConfig' | 'notes' | 'serverAuth';

/** 互动类型：点击 / 拖拽 / 喂食 / 换装 / 系统状态变更 / 聊天 */
export type InteractionType = 'click' | 'drag' | 'feed' | 'outfit' | 'system' | 'chat';

/** 互动日记条目（对应 PRD 的 interaction_log 表） */
export interface LogEntry {
  id: string;
  /** 时间戳（ms） */
  ts: number;
  type: InteractionType;
  /** 对话/事件内容 */
  text: string;
  /** 用户心情备注（可空） */
  note?: string;
}

/** 零食库存（对应 growth_log 的零食部分） */
export interface SnackInventory {
  /** 巧克力棒 */
  chocobi: number;
  /** 薯片 */
  chips: number;
  /** 布丁 */
  pudding: number;
}

/** 养成数据（对应 growth_log 表） */
export interface GrowthData {
  xp: number;
  level: number;
  snacks: SnackInventory;
  /** 已解锁内容 id 列表 */
  unlocked: string[];
  /** 累计互动次数（用于发零食） */
  interactionCount: number;
}

/** 服装 */
export type CostumeId = 'default' | 'superman' | 'pajamas';
/** 配饰 */
export type AccessoryId = 'none' | 'shiroHat' | 'sunglasses';
/** 场景 */
export type SceneId = 'none' | 'supermanBase' | 'kasukabeGuard' | 'noharaLiving';

/** 换装搭配（对应 outfit_config 表） */
export interface OutfitData {
  costume: CostumeId;
  accessory: AccessoryId;
  scene: SceneId;
}

/** 帧动画：帧序列（相对 character 根的 URL）+ 帧间隔毫秒 */
export interface FrameAnim {
  frames: string[];
  frameMs: number;
}

/** 单个姿态的资源：单图或帧动画 */
export type PoseAsset = { kind: 'image'; src: string } | ({ kind: 'anim' } & FrameAnim);

/** 一种形象的完整资源清单（主进程扫描 character/{costume}/ 产出） */
export interface CostumeAssets {
  /** 姿态名 → 资源（单图取去扩展名文件名，动画取目录名） */
  poses: Record<string, PoseAsset>;
  /** 该形象的随机动画池（无互动 40s 后每 10 分钟随机播放） */
  random: ({ dir: string } & FrameAnim)[];
  /** 该形象的时段动画池（idle-HHMM 子目录，按小时命中） */
  timed: ({ hour: number } & FrameAnim)[];
}

/** 桌宠情绪 */
export type Emotion = 'curious' | 'happy' | 'bored' | 'sleepy';

/** 持久化运行状态 */
export interface PetState {
  firstLaunchAt: number;
  lastInteractionAt: number;
  emotion: Emotion;
  totalInteractions: number;
}

/** 窗口位置 */
export interface WinBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 聊天消息（与 LLM 的对话历史） */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** 时间戳（ms） */
  ts: number;
}

/** LLM 配置（API 密钥等，仅主进程使用） */
export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** 便利贴颜色主题（小新色调） */
export type NoteColor = 'yellow' | 'green' | 'pink';

/** 一张便利贴记录 */
export interface StickyNote {
  id: string;
  /** 文本内容 */
  content: string;
  /** 固定后置顶并在重启时自动恢复；取消固定仍保留当前窗口。 */
  pinned: boolean;
  /** 窗口位置与尺寸，收起后重新打开也恢复；换屏时夹取到可见工作区。 */
  bounds?: { x: number; y: number; width: number; height: number };
  /** 颜色主题 */
  color: NoteColor;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后更新时间戳 */
  updatedAt: number;
}

/** 手机连接服务的访问令牌（URL ?t= 参数） */
export interface ServerAuth {
  token: string;
}

/** 托盘 / 右键菜单指令 */
export type TrayCommand = 'open-growth' | 'open-chat' | 'toggle-passthrough' | 'toggle-top' | 'show-hide' | 'quit';
