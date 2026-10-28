// 桌面陪伴主界面：桌宠舞台
// 职责：点击/拖拽手势识别、形象与气泡展示、情绪指示、场景背景、右键菜单、聊天输入
import { useRef, useCallback, useEffect, useState } from 'react';
import type { Emotion, SceneId, CostumeId, AccessoryId, PoseAsset } from '../../shared/types';
import { RELEASE_FEATURES } from '../../shared/releaseFeatures';
import Character, { type Pose } from './Character';
import styles from './PetStage.module.css';
import { hitsCharacter } from '../data/characterHitTest';

export type Gesture = 'click' | 'dblclick' | 'drag-fall' | 'drag-move';

export interface Bubble {
  text: string;
  kind: 'speech' | 'angry';
}

interface Props {
  pose: Pose;
  poseRun?: number;
  bubble: Bubble | null;
  breakReminderActive?: boolean;
  emotion: Emotion;
  scene: SceneId;
  costume: CostumeId;
  accessory: AccessoryId;
  /** 当前姿态的形象资源（App 层查 CostumeAssets.poses / idleAnim 计算后传入） */
  poseAsset?: PoseAsset;
  onGesture: (g: Gesture) => void;
  onDragPose: (dragging: boolean) => void;
  onNavigate: (page: 'growth' | 'diary') => void;
  /** 聊天输入框是否展开（由 App.tsx 控制，右键菜单也能触发） */
  chatOpen: boolean;
  /** 聊天输入框展开/收起通知（用于窗口尺寸管理） */
  onChatOpenChange: (open: boolean) => void;
}

const POSE_ANIM: Partial<Record<Pose, string>> = {
  happy: styles.animBounce,
  dance: styles.animDance,
  fall: styles.animFall,
  angry: styles.animShake,
  eat: styles.animChew,
};

export default function PetStage({
  pose,
  poseRun = 0,
  bubble,
  breakReminderActive = false,
  emotion,
  scene,
  costume,
  accessory,
  poseAsset,
  onGesture,
  onDragPose,
  onNavigate,
  chatOpen,
  onChatOpenChange,
}: Props) {
  const [friendUnread, setFriendUnread] = useState(0);
  useEffect(() => {
    let active = true, received = false;
    const off = window.petAPI.onFriendsUnread(count => { received = true; setFriendUnread(count); });
    void window.petAPI.friendsUnread().then(count => { if (active && !received) setFriendUnread(count); });
    return () => { active = false; off(); };
  }, []);
  const openChat = useCallback(() => {
    onChatOpenChange(true);
  }, [onChatOpenChange]);

  /** 阻止事件冒泡到 stage 的拖拽逻辑 */
  const stopStage = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
  }, []);

  const stageRef = useRef<HTMLDivElement>(null);
  const chatButtonRef = useRef<HTMLButtonElement>(null);
  const characterRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    /** 按下时鼠标在窗口内的位置（用于区分点击与拖动） */
    grabClient: { x: number; y: number };
    moved: boolean;
    downT: number;
  } | null>(null);
  /** 主进程拖拽是否处于活跃状态（自愈判定用） */
  const dragActiveRef = useRef(false);
  /** 上一次轻点（未拖动）的时间戳，用于双击判定 */
  const lastTapRef = useRef<number>(0);

  /** 结束主进程拖拽（不触发任何手势反应，用于异常清理） */
  const abortDrag = useCallback(() => {
    dragRef.current = null;
    window.petAPI.setPetPointerHeld(false);
    if (!dragActiveRef.current) return;
    dragActiveRef.current = false;
    onDragPose(false);
    void window.petAPI.dragEnd();
  }, [onDragPose]);

  /**
   * 窗口移动完全由主进程接管（轮询系统光标坐标）：
   * 渲染进程只负责判定"这是点击还是拖动"以及通知主进程开始/结束拖拽。
   * 光标坐标与窗口定位同处一个坐标系，不受 DPI 缩放和窗口伸缩影响。
   */
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      if (!characterRef.current || !hitsCharacter(characterRef.current, e.clientX, e.clientY)) return;
      // 上一次拖拽若未正常结束（pointerup 丢失），先终结它，
      // 否则主进程会残留一个永久跟随鼠标的拖拽循环
      abortDrag();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      window.petAPI.setPetPointerHeld(true);
      dragRef.current = {
        grabClient: { x: e.clientX, y: e.clientY },
        moved: false,
        downT: performance.now(),
      };
    },
    [abortDrag],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.grabClient.x;
      const dy = e.clientY - d.grabClient.y;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) {
        d.moved = true;
        dragActiveRef.current = true;
        onDragPose(true);
        void window.petAPI.dragStart();
      }
    },
    [onDragPose],
  );

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    window.petAPI.setPetPointerHeld(false);
    // 位移极小且时间短 → 视为轻点，进一步判定单击 / 双击
    if (!d.moved) {
      if (performance.now() - d.downT >= 500) return;
      const now = performance.now();
      if (now - lastTapRef.current < 400) {
        // 双击 → 触发开心反应
        lastTapRef.current = 0;
        onGesture('dblclick');
      } else {
        // 单击：仅记录，等待第二次点击；单击不再触发任何反应
        lastTapRef.current = now;
      }
      return;
    }
    dragActiveRef.current = false;
    onDragPose(false);
    // 拖拽（含甩飞）不再触发任何手势反应，桌宠留在新位置保持 idle
    void window.petAPI.dragEnd();
  }, [onDragPose, onGesture]);

  /**
   * 拖拽自愈：快速拖动时窗口轮询（10ms）会短暂落后于光标，
   * 若松手瞬间光标恰好在窗口边界外，pointerup 会被系统派发给桌面，
   * 渲染进程就永远收不到松手事件 → 主进程拖拽循环卡死，
   * 表现为"桌宠一直自主跟着鼠标跑、窗口尺寸被冻结、右键菜单不可见"。
   * 兜底：一旦收到「没有任何按键按下」的鼠标移动，说明拖拽早已结束，立即终结。
   * （卡死时窗口紧贴光标，鼠标一动就会命中此监听，几乎无感恢复）
   */
  useEffect(() => {
    const heal = (e: PointerEvent) => {
      if (dragActiveRef.current && e.buttons === 0) abortDrag();
    };
    const onBlur = () => abortDrag();
    document.addEventListener('pointermove', heal, true);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('pointermove', heal, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [abortDrag]);

  useEffect(() => {
    let lastIgnore: boolean | undefined;
    let lastCharacterHover = -Infinity;
    let chatVisible = false;
    const off = window.petAPI.onCursorPosition(({ x, y }) => {
      const character = !!characterRef.current && hitsCharacter(characterRef.current, x, y);
      const now = performance.now();
      if (character) lastCharacterHover = now;
      const button = chatButtonRef.current?.getBoundingClientRect();
      const overChat = chatVisible && !!button && x >= button.left && x <= button.right && y >= button.top && y <= button.bottom;
      const body = characterRef.current?.getBoundingClientRect();
      const nearby = !!body && x >= body.left - 20 && x <= body.right + 38 && y >= body.top - 20 && y <= body.bottom + 20;
      // 只在真实人物像素或已显示的聊天按钮上显示；短暂宽限方便跨过两者之间的间隙。
      chatVisible = !dragRef.current && (character || overChat || (nearby && now - lastCharacterHover < 250));
      if (stageRef.current) stageRef.current.dataset.characterHover = String(chatVisible);
      const element = document.elementFromPoint(x, y);
      const control = element?.closest('button, a, input, textarea, select, [role="button"], [data-pet-interactive]');
      // 按下到松手期间保留捕获，不能因拖到人物轮廓外而中断。
      const ignore = !dragRef.current && !control && !character;
      if (ignore !== lastIgnore) {
        lastIgnore = ignore;
        window.petAPI.setTransparentPassthrough(ignore);
      }
    });
    return () => { off(); window.petAPI.setTransparentPassthrough(false); };
  }, []);

  const poseAnim = POSE_ANIM[pose] ?? '';

  return (
    <div
      className={`${styles.stage} ${sceneClass(scene)}`}
      ref={stageRef}
      data-pet-stage
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      onContextMenu={(e) => {
        e.preventDefault();
        void window.petAPI.openMenu();
      }}
    >
      {/* 场景装饰层 */}
      {scene === 'supermanBase' && (
        <>
          <div className={styles.radar} />
          <div className={styles.radarGrid} />
        </>
      )}
      {scene === 'kasukabeGuard' && (
        <div className={styles.flag}>
          <div className={styles.flagCloth} />
          <div className={styles.flagPole} />
        </div>
      )}
      {scene === 'noharaLiving' && (
        <div className={styles.sofa}>
          <div className={styles.sofaBack} />
          <div className={styles.sofaSeat} />
          <div className={styles.sofaArmL} />
          <div className={styles.sofaArmR} />
        </div>
      )}

      {/* 聊天回复固定在侧边输入条上方，允许滚动与选中文字。 */}
      {bubble && !chatOpen && (
        <div
          data-pet-interactive
          className={`${styles.bubble} ${bubble.kind === 'angry' ? styles.bubbleAngry : ''}`}
        >
          {bubble.text}
        </div>
      )}

      {breakReminderActive && (
        <div className={styles.breakReminder} role="status" data-break-reminder title="放松一下眼睛吧～ 双击小新结束本次提醒">
          放松一下眼睛～ · 双击结束
        </div>
      )}

      {/* 聊天图标（收起态） */}
      {friendUnread > 0 && (
        <button className={styles.friendMail} onPointerDown={stopStage} onClick={() => { void window.petAPI.openFriends(); }} title="朋友来信啦" aria-label={`${friendUnread} 条好友消息或申请，打开好友信箱`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 6h18v14H3zM3 6l9 7 9-7" /></svg>
          <span>{friendUnread > 99 ? '99+' : friendUnread}</span>
        </button>
      )}
      {RELEASE_FEATURES.chatHover && !chatOpen && (
        <button
          ref={chatButtonRef}
          className={styles.chatIcon}
          onPointerDown={stopStage}
          onClick={openChat}
          title="和小新聊天"
          aria-label="和小新聊天"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
            <path d="M8 11h8" />
          </svg>
        </button>
      )}

      {/* 桌宠本体（拖拽热区） */}
      <div className={styles.petAnchor}>
        <div ref={characterRef} className={`${styles.petWrap} ${poseAnim}`}>
          <Character key={`${pose}-${poseRun}`} pose={pose} costume={costume} accessory={accessory} poseAsset={poseAsset} />
        </div>
      </div>
    </div>
  );
}

function sceneClass(scene: SceneId): string {
  switch (scene) {
    case 'supermanBase':
      return styles.sceneSuperman;
    case 'kasukabeGuard':
      return styles.sceneGuard;
    case 'noharaLiving':
      return styles.sceneLiving;
    default:
      return '';
  }
}
