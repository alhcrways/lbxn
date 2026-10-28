// 应用总控：数据加载/持久化、情绪感知引擎、手势分发、零食奖励、页面切换
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Emotion, GrowthData, LogEntry, OutfitData, PetState, TrayCommand, CostumeId, CostumeAssets, PoseAsset, WalkingState } from '../shared/types';
import PetStage, { type Bubble, type Gesture } from './components/PetStage';
import GrowthOverlay from './components/GrowthOverlay';
import ToastHub, { type ToastItem } from './components/Toast';
import type { Pose } from './components/Character';
import { QUOTE_GROUPS, EMOTION_LOG_TEXT } from './data/quotes';
import { SNACKS, levelForXp, SNACK_REWARD_INTERVAL, LEVELS } from './data/config';
import { PET_SIZE, EXPANDED_SIZE } from './data/windowSizes';
import styles from './App.module.css';
import { MinimumReplyGate } from './data/minimumReplyGate';

type Mode = 'pet' | 'growth' | 'diary';

/** 互动后情绪判定阈值 */
const HAPPY_WINDOW = 2 * 60_000; // 2 分钟内有互动 → 开心
const SLEEPY_WINDOW = 10 * 60_000; // 10 分钟无互动 → 困倦

/** 姿态持续时间（ms），结束后回到 idle */
const POSE_DURATION: Partial<Record<Pose, number>> = {
  happy: 2000,
  shy: 3000,
  dance: 1600,
  fall: 1200,
  angry: 1200,
  eat: 1600,
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 根据等级挑选台词（仅从未解锁的台词组中选） */
function pickQuote(level: number): string {
  const groups = QUOTE_GROUPS.filter((g) => g.unlockLevel <= level);
  return pick(groups.flatMap((g) => g.lines));
}

function computeEmotion(state: PetState): Emotion {
  if (state.totalInteractions === 0) return 'curious';
  const gap = Date.now() - state.lastInteractionAt;
  if (gap <= HAPPY_WINDOW) return 'happy';
  if (gap <= SLEEPY_WINDOW) return 'bored';
  return 'sleepy';
}

/** 基线姿态：始终 idle（显示默认形象），情绪不再改变姿态 */
function basePose(_emotion: Emotion): Pose {
  return 'idle';
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<Mode>('pet');

  const [growth, setGrowth] = useState<GrowthData | null>(null);
  const [outfit, setOutfit] = useState<OutfitData | null>(null);
  const [petState, setPetState] = useState<PetState | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  const [emotion, setEmotion] = useState<Emotion>('curious');
  const [pose, setPose] = useState<Pose>('idle');
  const [poseRun, setPoseRun] = useState(0);
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [celebrationLevel, setCelebrationLevel] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [walking, setWalking] = useState<WalkingState>({ enabled: true, walking: false, direction: 'left', reminderActive: false, intervalMinutes: 60, nextReminderAt: null });
  useEffect(() => {
    let received = false;
    const off = window.petAPI.onWalkingState(state => { received = true; setWalking(state); });
    void window.petAPI.getWalkingState().then(state => { if (!received && state) setWalking(state); });
    return off;
  }, []);
  // 聊天状态
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  // 形象资源：按 costume 缓存（ref），state 仅保存当前形象清单
  const assetsCacheRef = useRef<Partial<Record<CostumeId, CostumeAssets>>>({});
  const [costumeAssets, setCostumeAssets] = useState<CostumeAssets | null>(null);

  const poseTimer = useRef<number | null>(null);
  const bubbleTimer = useRef<number | null>(null);
  const toastId = useRef(0);
  /** 记录上一次的页面模式，用于从浮层返回时精确还原桌宠位置 */
  const prevModeRef = useRef<Mode>('pet');
  /** 聊天流式响应的累积文本 */
  const chatResponseRef = useRef('');
  /** 小新最后一次聊天回复：关闭输入框时气泡消失，重新打开时恢复显示 */
  const lastReplyRef = useRef('');
  /** 输入框开关状态的实时引用（供 IPC 回调读取，避免闭包过期） */
  const chatOpenRef = useRef(false);
  /** 待查看的手机端消息队列（点小新后展开查看） */
  const mobileUnreadRef = useRef<string[]>([]);
  /** 正在查看的手机消息文本：聊天框打开期间气泡优先显示它 */
  const viewingMobileRef = useRef<string | null>(null);
  const replyGateRef = useRef<MinimumReplyGate | null>(null);
  const chatRequestRef = useRef(0);
  const chatBusyRef = useRef(false);
  if (!replyGateRef.current) {
    replyGateRef.current = new MinimumReplyGate(
      (text) => {
        lastReplyRef.current = text;
        if (chatOpenRef.current) setBubble({ text, kind: 'speech' });
      },
      () => {
        chatBusyRef.current = false;
        setChatLoading(false);
      },
    );
  }

  /** 统一封装输入框开关：同步 state 与 ref */
  const chatOpenRequest = useRef(0);
  const changeChatOpen = useCallback(async (open: boolean) => {
    const request = ++chatOpenRequest.current;
    const result = await window.petAPI.setChatWindowOpen(open);
    if (request !== chatOpenRequest.current) return;
    chatOpenRef.current = result.open;
    setChatOpen(result.open);
  }, []);

  useEffect(() => window.petAPI.onChatWindowState((open) => {
    chatOpenRequest.current += 1;
    chatOpenRef.current = open;
    setChatOpen(open);
  }), []);

  useEffect(() => window.petAPI.onChatStatus((busy) => {
    setChatLoading(busy);
    if (busy) {
      if (poseTimer.current) window.clearTimeout(poseTimer.current);
      setPose('idle');
    }
  }), []);

  const toast = useCallback((text: string, tone: ToastItem['tone'] = 'info') => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-2), { id, text, tone }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ---------- 数据加载 ----------
  const loadAll = useCallback(async () => {
    try {
      const [g, o, s, l] = await Promise.all([
        window.petAPI.getData('growth') as Promise<GrowthData>,
        window.petAPI.getData('outfit') as Promise<OutfitData>,
        window.petAPI.getData('state') as Promise<PetState>,
        window.petAPI.getData('log') as Promise<LogEntry[]>,
      ]);
      setGrowth(g);
      setOutfit(o);
      setPetState(s);
      setLog(Array.isArray(l) ? l : []);
      setLoadError(false);
      const em = computeEmotion(s);
      setEmotion(em);
      setPose(basePose(em));
      // 首次启动欢迎台词（PRD 边界情况：空数据）
      if (s.totalInteractions === 0) {
        setBubble({ text: '咦？你来啦~', kind: 'speech' });
        if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
        bubbleTimer.current = window.setTimeout(() => setBubble(null), 3000);
      }
    } catch {
      setLoadError(true);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ---------- 形象资源加载 ----------
  // outfit.costume 变化时扫描 character/{costume}/（缓存未命中才调 IPC）；
  // 切换时清空当前清单，避免短暂显示旧服装资源
  const costume = outfit?.costume;
  useEffect(() => {
    if (!costume) return;
    setCostumeAssets(null);
    const cached = assetsCacheRef.current[costume];
    if (cached) {
      setCostumeAssets(cached);
      return;
    }
    let cancelled = false;
    void window.petAPI.listCostumeAssets(costume).then((assets) => {
      if (cancelled) return;
      assetsCacheRef.current[costume] = assets;
      setCostumeAssets(assets);
    });
    return () => {
      cancelled = true;
    };
  }, [costume]);

  // ---------- 托盘指令 ----------
  useEffect(() => {
    const off = window.petAPI.onTrayCommand((cmd: TrayCommand) => {
      if (cmd === 'open-growth') setMode('growth');
      else if (cmd === 'open-chat') {
        setMode('pet');
        changeChatOpen(true);
      }
    });
    return off;
  }, [changeChatOpen]);

  // ---------- 气泡 / 姿态的定时回收 ----------
  const showBubble = useCallback((b: Bubble, duration = 3000) => {
    setBubble(b);
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), duration);
  }, []);

  const setTransientPose = useCallback((p: Pose) => {
    setPoseRun((run) => run + 1);
    setPose(p);
    if (poseTimer.current) window.clearTimeout(poseTimer.current);
    const duration = POSE_DURATION[p];
    if (duration) {
      poseTimer.current = window.setTimeout(() => {
        setPose(basePoseRef.current);
      }, duration);
    }
  }, []);

  // 情绪基线姿态的引用（供定时器读取最新值）
  const basePoseRef = useRef<Pose>('curious');
  useEffect(() => {
    basePoseRef.current = basePose(emotion);
  }, [emotion]);

  // ---------- 互动记录与状态更新 ----------
  const logInteraction = useCallback(
    async (type: LogEntry['type'], text: string) => {
      try {
        const r = await window.petAPI.appendLog({ type, text });
        if (r.ok && r.result) setLog((prev) => [...prev, r.result]);
      } catch {
        toast('日记写入失败', 'error');
      }
    },
    [toast],
  );

  const touchState = useCallback(
    async (prev: PetState | null) => {
      if (!prev) return;
      const next: PetState = {
        ...prev,
        lastInteractionAt: Date.now(),
        totalInteractions: prev.totalInteractions + 1,
      };
      setPetState(next);
      const r = await window.petAPI.setData('state', next);
      if (!r.ok) toast('保存失败，请检查磁盘空间', 'error');
    },
    [toast],
  );

  // ---------- 聊天（多服务商流式） ----------
  // 流式 chunk / 完成 / 错误的 IPC 监听（挂载时注册一次）
  useEffect(() => {
    const offChunk = window.petAPI.onChatChunk((delta) => {
      chatResponseRef.current += delta;
      // 输入框已关闭时不显示气泡（回复保留在 lastReply，重新打开时恢复）
      replyGateRef.current?.update(chatResponseRef.current);
    });
    const offDone = window.petAPI.onChatDone((fullText) => {
      chatResponseRef.current = fullText;
      replyGateRef.current?.update(fullText);
    });
    const offError = window.petAPI.onChatError(() => {
      // 仅做清理：toast 由 handleChat 的 !result.ok 路径统一处理
      replyGateRef.current?.cancel();
      chatBusyRef.current = false;
      setChatLoading(false);
      setBubble(null);
    });
    return () => {
      replyGateRef.current?.cancel();
      chatRequestRef.current += 1;
      offChunk();
      offDone();
      offError();
    };
  }, []);

  // 手机端消息：入队等待查看；聊天框关闭时弹通知气泡（单条直接显示内容）
  const mobileNotice = useCallback((duration = 8000) => {
    const n = mobileUnreadRef.current.length;
    const text =
      n === 1 ? `📱 手机消息：${mobileUnreadRef.current[0]}` : `📱 手机来消息啦（共${n}条），点小新查看`;
    showBubble({ text, kind: 'speech' }, duration);
  }, [showBubble]);

  useEffect(() => {
    const off = window.petAPI.onMobileMessage((msg) => {
      mobileUnreadRef.current = [...mobileUnreadRef.current, msg];
      if (!chatOpenRef.current) {
        mobileNotice();
        setTransientPose('happy');
      }
    });
    return off;
  }, [mobileNotice, setTransientPose]);

  // 独立聊天小窗打开时，回复与输入都由小窗显示；主窗口不再生成聊天气泡或伸缩。
  useEffect(() => {
    if (!chatOpen) {
      viewingMobileRef.current = null;
      setBubble(null);
      // 关闭聊天框时若还有未查看的手机消息，继续弹通知
      if (mobileUnreadRef.current.length > 0) mobileNotice();
    } else {
      // 清掉通知气泡的自动清除定时器，防止刚显示的消息被误清
      if (bubbleTimer.current) {
        window.clearTimeout(bubbleTimer.current);
        bubbleTimer.current = null;
      }
      // 任何入口打开聊天框（点小新/点图标/右键）都先消化未读手机消息
      if (mobileUnreadRef.current.length > 0) {
        viewingMobileRef.current = mobileUnreadRef.current.join('；');
        mobileUnreadRef.current = [];
      }
      setBubble(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen]);

  const handleChat = useCallback(
    async (message: string) => {
      if (chatBusyRef.current) return;
      chatBusyRef.current = true;
      const request = ++chatRequestRef.current;
      replyGateRef.current?.begin();
      // 清除已有气泡定时器；发送回复后不再以手机消息为气泡内容
      if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
      viewingMobileRef.current = null;
      chatResponseRef.current = '';
      // 思考中气泡
      setBubble({ text: '……', kind: 'speech' });
      setChatLoading(true);
      // 清掉临时动作，回复完成后直接回到默认眨眼待机。
      if (poseTimer.current) window.clearTimeout(poseTimer.current);
      setPose('idle');
      // 记录互动
      if (petState) void touchState(petState);
      void logInteraction('chat', `对小新说：${message}`);

      let result: { ok: boolean; response?: string; error?: string };
      try {
        result = await window.petAPI.chat(message);
      } catch (e) {
        result = { ok: false, error: e instanceof Error ? e.message : '聊天异常，请重试' };
      }

      if (request !== chatRequestRef.current) return;

      if (!result.ok) {
        replyGateRef.current?.cancel();
        chatBusyRef.current = false;
        setChatLoading(false);
        setBubble(null);
        if (result.error === 'NO_API_KEY') {
          toast('请先选择模型并填写 API Key：右键 → 聊天设置', 'error');
        } else {
          toast(result.error || '聊天失败，请稍后重试', 'error');
        }
        return;
      }

      // 流式回调正常触发时，chunk/done 已处理气泡；
      // 兜底：若流式未触发（网络重试等边界），用返回值直接展示
      if (!chatResponseRef.current && result.response) {
        chatResponseRef.current = result.response;
      }
      // 回复已完成且最少等待 1 秒后，统一显示并恢复眨眼。
      replyGateRef.current?.finish(chatResponseRef.current);
    },
    [petState, touchState, logInteraction, toast],
  );

  // ---------- 窗口尺寸管理 ----------
  // 桌宠模式：默认只占人物大小；气泡 / Toast 出现时临时扩展（底部中心锚定，人物不位移）
  // 右键菜单由独立悬浮窗弹出，完全不碰主窗口尺寸
  // 浮层模式（养成 / 日记）：移动到屏幕工作区内「完整可见」的位置并放大；
  //   关闭浮层时精确还原桌宠原来的位置与尺寸（小新原地复现，不会丢）
  // 拖拽期间冻结尺寸：窗口伸缩会改变坐标原点，主进程拖拽基准会被破坏
  useEffect(() => {
    if (dragging) return;
    if (mode !== 'pet') {
      void window.petAPI.openOverlay();
    } else if (prevModeRef.current !== 'pet') {
      // 刚从浮层返回：精确还原桌宠位置
      void window.petAPI.closeOverlay();
    } else {
      const expanded = !!bubble || toasts.length > 0 || walking.reminderActive;
      void window.petAPI.setWindowSize(
        expanded ? EXPANDED_SIZE.width : PET_SIZE.width,
        expanded ? EXPANDED_SIZE.height : PET_SIZE.height,
      );
    }
    prevModeRef.current = mode;
  }, [mode, bubble, toasts.length, dragging, walking.reminderActive]);

  // ---------- 手势处理 ----------
  const handleGesture = useCallback(
    (g: Gesture) => {
      if (!growth || !petState || mode !== 'pet') return;
      // 有未查看的手机消息 → 单击优先"查看"：打开聊天框（消息内容由 chatOpen effect 统一消化显示）
      if (g === 'click' && mobileUnreadRef.current.length > 0) {
        changeChatOpen(true);
        setTransientPose('happy');
        return;
      }
      if (g === 'dblclick' && walking.reminderActive) {
        setWalking(previous => ({ ...previous, walking: false, reminderActive: false }));
        if (poseTimer.current) window.clearTimeout(poseTimer.current);
        setPose('idle');
        void window.petAPI.dismissWalkingReminder().then(state => { if (state) setWalking(state); });
        return;
      }
      if (g === 'dblclick') {
        // 双击直接显示害羞静态形象，3 秒后恢复待机；再次双击重置计时。
        setTransientPose(costumeAssets?.poses.shy ? 'shy' : 'happy');
        void touchState(petState);

        // 互动计数 + 零食掉落（仅内部记录，不弹 Toast，避免窗口扩展）
        const count = growth.interactionCount + 1;
        const snacks = { ...growth.snacks };
        const newGrowth: GrowthData = { ...growth, interactionCount: count };
        if (count % SNACK_REWARD_INTERVAL === 0) {
          const drop = pick(SNACKS);
          snacks[drop.id] += 1;
          newGrowth.snacks = snacks;
        }
        setGrowth(newGrowth);
        void window.petAPI.setData('growth', newGrowth);
      }
      // 单击 / 拖拽（含甩飞）→ 不触发任何反应，保持默认 idle
    },
    [growth, petState, mode, touchState, setTransientPose, changeChatOpen, costumeAssets, walking.reminderActive],
  );

  // ---------- 情绪感知引擎 ----------
  const emotionRef = useRef<Emotion>('curious');
  useEffect(() => {
    emotionRef.current = emotion;
  }, [emotion]);

  useEffect(() => {
    if (!ready || !petState) return;
    const check = () => {
      const next = computeEmotion(petState);
      if (emotionRef.current === next) return;
      emotionRef.current = next;
      setEmotion(next);
      // 情绪状态变更 → 记为系统互动事件（不触发台词气泡）
      void logInteraction('system', EMOTION_LOG_TEXT[next] ?? `小新的情绪变成了「${next}」`);
      const persist: PetState = { ...petState, emotion: next };
      setPetState(persist);
      void window.petAPI.setData('state', persist);
    };
    check();
    const timer = window.setInterval(check, 15_000);
    return () => window.clearInterval(timer);
    // petState 变化时也要重新判定，故将其作为依赖
  }, [ready, petState, logInteraction]);

  // 姿态跟随情绪基线（仅在非临时姿态时）
  useEffect(() => {
    setPose((cur) => {
      const transient: Pose[] = ['happy', 'shy', 'dance', 'fall', 'angry', 'eat', 'drag'];
      return transient.includes(cur) ? cur : basePose(emotion);
    });
  }, [emotion]);

  // 待机固定播放眨眼，不再按时间或随机池切换动作。

  // ---------- 喂食 ----------
  const handleFeed = useCallback(
    async (snackId: keyof GrowthData['snacks']) => {
      if (!growth) return;
      const def = SNACKS.find((s) => s.id === snackId);
      if (!def || growth.snacks[snackId] <= 0) return;

      const snacks = { ...growth.snacks, [snackId]: growth.snacks[snackId] - 1 };
      const xp = growth.xp + def.xp;
      const oldLevel = growth.level;
      const newLevel = levelForXp(xp);
      const next: GrowthData = { ...growth, snacks, xp, level: newLevel };

      setGrowth(next);
      setTransientPose('eat');
      showBubble({ text: `啊呜~${def.name}最好吃了！`, kind: 'speech' }, 2000);
      void logInteraction('feed', `给小新喂了${def.name}，获得 ${def.xp} 点经验`);

      if (newLevel > oldLevel) {
        setCelebrationLevel(newLevel);
        const unlocks = LEVELS.filter((l) => l.level > oldLevel && l.level <= newLevel && l.unlock)
          .map((l) => l.unlock!.name)
          .join('、');
        void logInteraction('system', `小新升到了 Lv.${newLevel}${unlocks ? `，解锁了${unlocks}` : ''}`);
      }

      const r = await window.petAPI.setData('growth', next);
      if (!r.ok) toast('保存失败，请检查磁盘空间', 'error');
    },
    [growth, logInteraction, showBubble, setTransientPose, toast],
  );

  // ---------- 换装 ----------
  const handleSaveOutfit = useCallback(
    async (next: OutfitData) => {
      setOutfit(next);
      setTransientPose('happy');
      void logInteraction('outfit', `换上了新搭配（${next.costume === 'default' ? '经典红T恤' : next.costume === 'superman' ? '动感超人服' : '小新睡衣'}）`);
      const r = await window.petAPI.setData('outfit', next);
      toast(r.ok ? '搭配已保存！' : '保存失败，请检查磁盘空间', r.ok ? 'ok' : 'error');
    },
    [logInteraction, setTransientPose, toast],
  );

  // ---------- 备注保存 ----------
  const handleSaveNote = useCallback(
    async (id: string, note: string) => {
      const r = await window.petAPI.updateLogNote(id, note);
      if (r.ok) {
        setLog((prev) => prev.map((e) => (e.id === id ? { ...e, note } : e)));
      } else {
        toast('保存失败，请检查磁盘空间', 'error');
      }
    },
    [toast],
  );

  const canWalk = ready && mode === 'pet' && pose === 'idle' && !dragging && !chatOpen && !chatLoading && !bubble
    && !!costumeAssets?.poses['walk-left'] && !!costumeAssets?.poses['walk-right'];
  useEffect(() => {
    window.petAPI.setWalkingReady(canWalk);
    return () => window.petAPI.setWalkingReady(false);
  }, [canWalk]);

  if (!ready) {
    return <div className={styles.boot}>…</div>;
  }

  // 眨眼是固定待机；未提供眨眼素材的服装继续使用自己的站姿。
  const displayPose: Pose = walking.reminderActive && costumeAssets?.poses[`walk-${walking.direction}`]
    ? `walk-${walking.direction}`
    : chatLoading && costumeAssets?.poses.thinking ? 'thinking' : pose;
  const poseAsset: PoseAsset | undefined = displayPose === 'idle'
    ? costumeAssets?.poses.blink ?? costumeAssets?.poses.idle
    : displayPose === 'shy' && costume === 'default'
      ? { kind: 'image', src: 'character/default/shy.png' }
    : costumeAssets?.poses[displayPose];

  return (
    <div className={styles.app}>
      {mode === 'pet' && growth && outfit && (
        <PetStage
          pose={displayPose}
          poseRun={poseRun}
          bubble={bubble}
          breakReminderActive={walking.reminderActive}
          emotion={emotion}
          scene={outfit.scene}
          costume={outfit.costume}
          accessory={outfit.accessory}
          poseAsset={poseAsset}
          onGesture={handleGesture}
          onDragPose={(dragging) => {
            setDragging(dragging);
            // 拖拽时不切换姿态，保持默认 idle 形象
          }}
          onNavigate={(p) => setMode(p)}
          chatOpen={chatOpen}
          onChatOpenChange={changeChatOpen}
        />
      )}

      {mode === 'growth' && growth && outfit && (
        <GrowthOverlay
          growth={growth}
          outfit={outfit}
          onFeed={handleFeed}
          onSaveOutfit={handleSaveOutfit}
          onClose={() => setMode('pet')}
          celebrationLevel={celebrationLevel}
          onCelebrationDone={() => setCelebrationLevel(null)}
        />
      )}

      <ToastHub toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
