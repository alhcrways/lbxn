// 桌宠形象组件
// 按 poseAsset 渲染当前形象资源（主进程扫描 character/{costume}/ 产出）：
//   单图姿态 → <img>；帧动画姿态 → 序列帧播放器（任意姿态均可动画化）；
//   资源缺失 / 加载失败 → 内置 SVG 占位形象（复古童趣火柴人风格）。
import { useState, useEffect } from 'react';
import type { CostumeId, AccessoryId, PoseAsset } from '../../shared/types';
import styles from './Character.module.css';

export type Pose =
  | 'idle'
  | 'thinking'
  | 'shy'
  | 'happy'
  | 'angry'
  | 'fall'
  | 'sleepy'
  | 'bored'
  | 'curious'
  | 'eat'
  | 'dance'
  | 'drag';

interface Props {
  pose: Pose;
  costume: CostumeId;
  accessory?: AccessoryId;
  size?: number;
  /** 当前姿态的资源（由 App 层查 CostumeAssets.poses / idleAnim 计算后传入） */
  poseAsset?: PoseAsset;
}

/** 默认帧间隔（ms / 帧），约 8 FPS，仅当子目录未声明 frame.txt 时使用 */
const DEFAULT_FRAME_INTERVAL = 125;

/**
 * 害羞原图为横向留白较大的方形画布，按人物不透明区域对齐眨眼待机。
 * 参考：blink 543×724，人物框 (71,39)-(477,690)；
 * shy 1266×1242，人物框 (254,70)-(1112,1171)。
 * 保持等比缩放，统一可见人物高度、水平中心与脚底，不拉伸脸型。
 */
export function shyImageLayout(size: number) {
  const idleScale = Math.min(size / 543, (size * 1.2) / 724);
  const idleLeft = (size - 543 * idleScale) / 2;
  const idleTop = (size * 1.2 - 724 * idleScale) / 2;
  const scale = ((690 - 39) * idleScale) / (1171 - 70);
  return {
    width: 1266 * scale,
    height: 1242 * scale,
    left: idleLeft + ((71 + 477) / 2) * idleScale - ((254 + 1112) / 2) * scale,
    top: idleTop + 690 * idleScale - 1171 * scale,
  };
}

export default function Character({ pose, costume, accessory = 'none', size = 130, poseAsset }: Props) {
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [frameIdx, setFrameIdx] = useState(0);
  const anim = poseAsset?.kind === 'anim' ? poseAsset : undefined;
  const frames = anim?.frames;
  const frameMs = anim?.frameMs ?? DEFAULT_FRAME_INTERVAL;

  // 资产标识：切换姿态 / 形象 / 动画时重置播放进度，并清空失败记录
  // （否则换形象后同名帧路径的失败缓存会永久遮蔽新资源）
  const assetKey = anim
    ? `anim|${anim.frames.join('|')}|${anim.frameMs}`
    : poseAsset?.kind === 'image'
      ? `img|${poseAsset.src}`
      : 'none';
  useEffect(() => {
    setFrameIdx(0);
    setFailed(new Set());
  }, [assetKey]);

  // 帧序列播放器：按各自帧率循环切换显示帧
  useEffect(() => {
    if (!frames || frames.length <= 1) return;
    const timer = window.setInterval(() => {
      setFrameIdx((i) => (i + 1) % frames.length);
    }, frameMs);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetKey]);

  // 帧动画资源且有可用帧 → 帧播放器
  if (frames && frames.length > 0) {
    const available = frames.filter((c) => !failed.has(c));
    if (available.length > 0) {
      const activeIdx = Math.min(frameIdx, available.length - 1);
      return (
        <div
          className={styles.frameWrap}
          style={{ width: size, height: size * 1.2 }}
        >
          {available.map((src, i) => (
            <img
              key={src}
              src={src}
              alt="蜡笔小新"
              draggable={false}
              width={size}
              height={size * 1.2}
              className={`${styles.frame} ${i === activeIdx ? styles.frameActive : ''}`}
              onError={() => setFailed((prev) => new Set(prev).add(src))}
            />
          ))}
        </div>
      );
    }
  }

  // 单图资源未失败 → 直接显示
  if (poseAsset?.kind === 'image' && !failed.has(poseAsset.src)) {
    if (pose === 'shy' && costume === 'default' && poseAsset.src === 'character/default/shy.png') {
      const layout = shyImageLayout(size);
      return (
        <div className={styles.frameWrap} style={{ width: size, height: size * 1.2 }}>
          <img
            src={poseAsset.src}
            alt="害羞的小新"
            draggable={false}
            className={styles.img}
            style={{ position: 'absolute', ...layout }}
            onError={() => setFailed((prev) => new Set(prev).add(poseAsset.src))}
          />
        </div>
      );
    }
    return (
      <img
        key={poseAsset.src}
        src={poseAsset.src}
        alt="蜡笔小新"
        draggable={false}
        width={size}
        height={size * 1.2}
        className={styles.img}
        onError={() => setFailed((prev) => new Set(prev).add(poseAsset.src))}
      />
    );
  }

  return (
    <svg
      className={styles.svg}
      width={size}
      height={size * 1.2}
      viewBox="0 0 120 144"
      aria-label="小新（占位形象）"
    >
      <PlaceholderFigure pose={pose} costume={costume} accessory={accessory} />
    </svg>
  );
}

/* ===================== SVG 占位形象 ===================== */

function PlaceholderFigure({
  pose,
  costume,
  accessory,
}: {
  pose: Pose;
  costume: CostumeId;
  accessory: AccessoryId;
}) {
  const skin = '#ffe0b2';
  const ink = '#3e2723';
  const shirt = costume === 'superman' ? '#1565c0' : costume === 'pajamas' ? '#fbc02d' : '#e64a19';
  const shorts = costume === 'superman' ? '#d32f2f' : '#5d4037';

  // 摔倒：整体后仰
  const transform = pose === 'fall' ? 'rotate(-24 60 110)' : pose === 'dance' ? 'rotate(6 60 110)' : undefined;
  const breathing = pose === 'idle' || pose === 'curious' || pose === 'bored' || pose === 'sleepy';

  return (
    <g transform={transform} className={breathing ? styles.breathe : undefined}>
      {/* 动感超人披风 */}
      {costume === 'superman' && (
        <path d="M42 92 Q18 108 24 134 Q44 124 42 92 Z" fill="#d32f2f" stroke={ink} strokeWidth="2" />
      )}

      {/* 腿 */}
      <Legs pose={pose} skin={skin} ink={ink} shorts={shorts} />

      {/* 身体 */}
      <rect x="40" y="86" width="40" height="42" rx="14" fill={shirt} stroke={ink} strokeWidth="2.5" />
      {/* 肚子标记 */}
      {costume === 'superman' && <circle cx="60" cy="104" r="7" fill="#ffeb3b" stroke={ink} strokeWidth="1.5" />}
      {costume === 'pajamas' && (
        <>
          <circle cx="52" cy="100" r="2.5" fill="#fff3e0" />
          <circle cx="66" cy="110" r="2.5" fill="#fff3e0" />
          <circle cx="60" cy="98" r="2.5" fill="#fff3e0" />
        </>
      )}

      {/* 手臂 */}
      <Arms pose={pose} skin={skin} ink={ink} shirt={shirt} />

      {/* 头 */}
      <g>
        <ellipse cx="60" cy="52" rx="34" ry="30" fill={skin} stroke={ink} strokeWidth="2.5" />
        {/* 头发：小新标志性的刘海 */}
        <path d="M28 46 Q34 16 60 22 Q86 16 92 46 Q80 34 70 38 Q66 28 56 36 Q44 32 28 46 Z" fill={ink} />
        <Face pose={pose} ink={ink} />
        <Accessory accessory={accessory} ink={ink} />
      </g>

      {/* 姿态附加元素 */}
      <PoseExtras pose={pose} />
    </g>
  );
}

function Legs({ pose, skin, ink, shorts }: { pose: Pose; skin: string; ink: string; shorts: string }) {
  const dangle = pose === 'drag';
  return (
    <g>
      <rect x={dangle ? 44 : 46} y="118" width="12" height={dangle ? 20 : 24} rx="5" fill={shorts} stroke={ink} strokeWidth="2" />
      <rect x={dangle ? 64 : 62} y="118" width="12" height={dangle ? 20 : 24} rx="5" fill={shorts} stroke={ink} strokeWidth="2" />
      <ellipse cx={dangle ? 50 : 52} cy={dangle ? 140 : 144} rx="8" ry="5" fill={skin} stroke={ink} strokeWidth="2" />
      <ellipse cx={dangle ? 70 : 68} cy={dangle ? 140 : 144} rx="8" ry="5" fill={skin} stroke={ink} strokeWidth="2" />
    </g>
  );
}

function Arms({ pose, skin, ink, shirt }: { pose: Pose; skin: string; ink: string; shirt: string }) {
  const arm = (x: number, y: number, w: number, h: number, rotate: number) => (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx="6"
      fill={shirt}
      stroke={ink}
      strokeWidth="2"
      transform={`rotate(${rotate} ${x + w / 2} ${y + 4})`}
    />
  );
  switch (pose) {
    case 'happy':
    case 'drag':
      return (
        <g>
          {arm(26, 78, 12, 26, 35)}
          {arm(82, 78, 12, 26, -35)}
          <circle cx="24" cy="66" r="6" fill={skin} stroke={ink} strokeWidth="2" />
          <circle cx="96" cy="66" r="6" fill={skin} stroke={ink} strokeWidth="2" />
        </g>
      );
    case 'angry': // 叉腰
      return (
        <g>
          {arm(30, 88, 12, 22, 55)}
          {arm(78, 88, 12, 22, -55)}
          <circle cx="24" cy="110" r="6" fill={skin} stroke={ink} strokeWidth="2" />
          <circle cx="96" cy="110" r="6" fill={skin} stroke={ink} strokeWidth="2" />
        </g>
      );
    case 'dance': // 动感超人姿势
    case 'eat':
      return (
        <g>
          {arm(30, 82, 12, 24, 100)}
          {arm(78, 88, 12, 22, -55)}
          <circle cx="22" cy="106" r="6" fill={skin} stroke={ink} strokeWidth="2" />
          <circle cx="96" cy="108" r="6" fill={skin} stroke={ink} strokeWidth="2" />
        </g>
      );
    default:
      return (
        <g>
          {arm(30, 88, 12, 22, 12)}
          {arm(78, 88, 12, 22, -12)}
          <circle cx="28" cy="112" r="6" fill={skin} stroke={ink} strokeWidth="2" />
          <circle cx="92" cy="112" r="6" fill={skin} stroke={ink} strokeWidth="2" />
        </g>
      );
  }
}

function Face({ pose, ink }: { pose: Pose; ink: string }) {
  const brow = (x: number, tilt = 0) => (
    <rect x={x} y="44" width="14" height="4.5" rx="2" fill={ink} transform={`rotate(${tilt} ${x + 7} 46)`} />
  );

  const eyes = () => {
    switch (pose) {
      case 'happy':
      case 'eat':
        return (
          <g stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round">
            <path d="M40 54 Q46 48 52 54" />
            <path d="M68 54 Q74 48 80 54" />
          </g>
        );
      case 'sleepy':
      case 'bored':
        return (
          <g stroke={ink} strokeWidth="2.5" strokeLinecap="round">
            <line x1="40" y1="54" x2="52" y2="54" />
            <line x1="68" y1="54" x2="80" y2="54" />
          </g>
        );
      case 'fall': // 星星眼
        return (
          <g fill="#ffb300" stroke={ink} strokeWidth="1.5">
            <Star cx={46} cy={53} />
            <Star cx={74} cy={53} />
          </g>
        );
      case 'angry':
        return (
          <g>
            <circle cx="46" cy="55" r="3.2" fill={ink} />
            <circle cx="74" cy="55" r="3.2" fill={ink} />
          </g>
        );
      default:
        return (
          <g>
            <ellipse cx="46" cy="54" rx="4" ry="5" fill={ink} />
            <ellipse cx="74" cy="54" rx="4" ry="5" fill={ink} />
            <circle cx="47.5" cy="52" r="1.2" fill="#fff" />
            <circle cx="75.5" cy="52" r="1.2" fill="#fff" />
          </g>
        );
    }
  };

  const mouth = () => {
    switch (pose) {
      case 'happy':
      case 'eat':
        return <path d="M50 66 Q60 78 70 66 Z" fill="#bf360c" stroke={ink} strokeWidth="2" />;
      case 'angry':
        return <path d="M50 70 Q60 62 70 70" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />;
      case 'fall':
        return <ellipse cx="60" cy="68" rx="6" ry="7" fill="#bf360c" stroke={ink} strokeWidth="2" />;
      case 'bored':
        return <line x1="52" y1="68" x2="68" y2="68" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />;
      case 'sleepy':
        return <ellipse cx="60" cy="69" rx="5" ry="4" fill="#bf360c" stroke={ink} strokeWidth="2" />;
      default:
        return <path d="M52 66 Q60 72 68 66" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />;
    }
  };

  return (
    <g>
      {pose === 'angry' ? (
        <>
          {brow(38, -12)}
          {brow(68, 12)}
        </>
      ) : pose === 'dance' ? (
        <>
          {brow(38, 10)}
          {brow(68, -10)}
        </>
      ) : (
        <>
          {brow(38)}
          {brow(68)}
        </>
      )}
      {eyes()}
      {/* 腮红 */}
      <ellipse cx="36" cy="62" rx="5" ry="3" fill="#ff8a65" opacity="0.7" />
      <ellipse cx="84" cy="62" rx="5" ry="3" fill="#ff8a65" opacity="0.7" />
      {mouth()}
    </g>
  );
}

function Star({ cx, cy }: { cx: number; cy: number }) {
  const pts = [0, -6, 1.8, -1.8, 6, -1.8, 2.4, 1.2, 3.6, 6, 0, 3, -3.6, 6, -2.4, 1.2, -6, -1.8, -1.8, -1.8];
  return <polygon points={pts.map((v, i) => (i % 2 === 0 ? cx + v : cy + v)).join(' ')} />;
}

function Accessory({ accessory, ink }: { accessory: AccessoryId; ink: string }) {
  if (accessory === 'shiroHat') {
    return (
      <g>
        <ellipse cx="60" cy="26" rx="26" ry="8" fill="#fffde7" stroke={ink} strokeWidth="2" />
        <path d="M44 26 Q46 12 60 12 Q74 12 76 26 Z" fill="#fffde7" stroke={ink} strokeWidth="2" />
        <circle cx="60" cy="14" r="3" fill="#e64a19" />
      </g>
    );
  }
  if (accessory === 'sunglasses') {
    return (
      <g>
        <rect x="36" y="48" width="20" height="12" rx="5" fill={ink} />
        <rect x="64" y="48" width="20" height="12" rx="5" fill={ink} />
        <line x1="56" y1="53" x2="64" y2="53" stroke={ink} strokeWidth="3" />
      </g>
    );
  }
  return null;
}

function PoseExtras({ pose }: { pose: Pose }) {
  switch (pose) {
    case 'sleepy':
      return (
        <g fill="#3e2723" fontFamily="inherit" fontWeight="700">
          <text x="94" y="30" fontSize="14">z</text>
          <text x="102" y="18" fontSize="11">z</text>
        </g>
      );
    case 'angry':
      return (
        <g>
          {/* 冒火怒气符号 */}
          <path d="M92 30 l6 -10 l1 6 l7 -4 l-4 8 l6 1 l-8 4 Z" fill="#ff5722" stroke="#3e2723" strokeWidth="1.5" />
        </g>
      );
    case 'curious':
      return (
        <text x="94" y="26" fontSize="20" fill="#e64a19" fontWeight="700">
          ?
        </text>
      );
    case 'eat':
      return (
        <g>
          {/* 巧克力棒 */}
          <rect x="86" y="100" width="20" height="6" rx="2" fill="#8d6e63" stroke="#3e2723" strokeWidth="1.5" transform="rotate(-30 86 100)" />
        </g>
      );
    case 'dance':
      return (
        <g>
          <text x="88" y="24" fontSize="16">✨</text>
          <text x="18" y="30" fontSize="14">🎵</text>
        </g>
      );
    default:
      return null;
  }
}
