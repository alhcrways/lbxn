// 养成系统浮层：喂食升级 + 换装打扮（PRD §5 养成系统）
import { useEffect, useState } from 'react';
import {
  IconCandy,
  IconShirt,
  IconX,
  IconLock,
  IconSparkles,
  IconDeviceTv,
} from '@tabler/icons-react';
import type { GrowthData, OutfitData, CostumeId, AccessoryId, SceneId, CostumeAssets } from '../../shared/types';
import {
  SNACKS,
  LEVELS,
  levelProgress,
  COSTUMES,
  ACCESSORIES,
  SCENES,
  SNACK_REWARD_INTERVAL,
} from '../data/config';
import Character from './Character';
import styles from './GrowthOverlay.module.css';

interface Props {
  growth: GrowthData;
  outfit: OutfitData;
  onFeed: (snackId: keyof GrowthData['snacks']) => void;
  onSaveOutfit: (outfit: OutfitData) => void;
  onClose: () => void;
  /** 刚刚升级到的等级（用于庆祝动画） */
  celebrationLevel: number | null;
  onCelebrationDone: () => void;
}

type Tab = 'feed' | 'outfit';

export default function GrowthOverlay({
  growth,
  outfit,
  onFeed,
  onSaveOutfit,
  onClose,
  celebrationLevel,
  onCelebrationDone,
}: Props) {
  const [tab, setTab] = useState<Tab>('feed');
  const [draft, setDraft] = useState<OutfitData>(outfit);
  const [dirty, setDirty] = useState(false);
  // 各形象资源（预览用）：切换 draft.costume 时按需扫描并缓存
  const [previewAssets, setPreviewAssets] = useState<Partial<Record<CostumeId, CostumeAssets>>>({});

  useEffect(() => {
    const c = draft.costume;
    if (previewAssets[c]) return;
    let cancelled = false;
    void window.petAPI.listCostumeAssets(c).then((assets) => {
      if (!cancelled) setPreviewAssets((prev) => ({ ...prev, [c]: assets }));
    });
    return () => {
      cancelled = true;
    };
  }, [draft.costume, previewAssets]);
  const prog = levelProgress(growth.xp);
  const totalSnacks = SNACKS.reduce((s, d) => s + growth.snacks[d.id], 0);

  const updateDraft = (patch: Partial<OutfitData>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      background: '#fff3e0',
      border: '2px solid #ffccbc',
      borderRadius: 24,
      overflow: 'hidden',
    }}>
      {celebrationLevel && (
        <div className={styles.celebration} onClick={onCelebrationDone}>
          <div className={styles.celebrationCard}>
            <IconSparkles size={36} color="#ffb300" />
            <div className={styles.celebrationTitle}>升级啦！Lv.{celebrationLevel}</div>
            <div className={styles.celebrationUnlock}>
              {LEVELS.find((l) => l.level === celebrationLevel)?.unlock?.name ?? '小新又长大了一点～'}
            </div>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={styles.confetti} style={{ '--i': i } as React.CSSProperties} />
            ))}
          </div>
        </div>
      )}

      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 8px 12px', borderBottom: '2px dashed #ffccbc' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setTab('feed')} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, fontSize: 13,
            background: tab === 'feed' ? '#e64a19' : 'transparent', color: tab === 'feed' ? '#fff' : '#5d4037',
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <IconCandy size={16} /> 喂食成长
          </button>
          <button onClick={() => setTab('outfit')} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, fontSize: 13,
            background: tab === 'outfit' ? '#e64a19' : 'transparent', color: tab === 'outfit' ? '#fff' : '#5d4037',
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <IconShirt size={16} /> 换装打扮
          </button>
        </div>
        <button onClick={onClose} title="返回桌面" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30,
          borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', color: '#5d4037',
        }}>
          <IconX size={18} />
        </button>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {tab === 'feed' ? (
          <div>
            {/* 等级与经验条 */}
            <div className={styles.levelCard}>
              <div className={styles.levelRow}>
                <span className={styles.levelBadge}>Lv.{prog.level}</span>
                <span className={styles.levelTitle}>
                  {prog.level >= 8 ? '春日部的传说' : prog.level >= 5 ? '春日部防卫队队员' : '春日部的小麻烦'}
                </span>
              </div>
              <div className={styles.xpBar}>
                <div
                  className={styles.xpFill}
                  style={{ width: prog.next ? `${Math.min(100, (prog.cur / prog.need) * 100)}%` : '100%' }}
                />
              </div>
              <div className={styles.xpText}>
                {prog.next ? `经验 ${prog.cur}/${prog.need}（再 ${Math.max(0, prog.need - prog.cur)} 升级）` : '已满级！'}
              </div>
            </div>

            {totalSnacks === 0 ? (
              // 空库存引导（PRD 边界情况）
              <div className={styles.empty}>
                <div className={styles.emptyEmoji}>🍫</div>
                <p>零食库存空空的～</p>
                <p className={styles.emptyHint}>每和小新互动 {SNACK_REWARD_INTERVAL} 次，就会掉落一个零食哦</p>
                <button className={styles.primaryBtn} onClick={onClose}>
                  去互动
                </button>
              </div>
            ) : (
              <div className={styles.snackGrid}>
                {SNACKS.map((s) => {
                  const count = growth.snacks[s.id];
                  return (
                    <button
                      key={s.id}
                      className={`${styles.snackCard} ${count === 0 ? styles.snackDisabled : ''}`}
                      disabled={count === 0}
                      onClick={() => onFeed(s.id)}
                    >
                      <span className={styles.snackEmoji}>{s.emoji}</span>
                      <span className={styles.snackName}>{s.name}</span>
                      <span className={styles.snackXp}>+{s.xp} 经验</span>
                      <span className={styles.snackCount}>×{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 等级路线图 */}
            <div className={styles.roadmap}>
              <div className={styles.roadmapTitle}>
                <IconDeviceTv size={14} /> 升级解锁
              </div>
              {LEVELS.filter((l) => l.unlock).map((l) => {
                const unlocked = growth.level >= l.level;
                return (
                  <div key={l.level} className={`${styles.roadmapItem} ${unlocked ? styles.roadmapOn : ''}`}>
                    {unlocked ? <IconSparkles size={14} color="#ffb300" /> : <IconLock size={14} color="#a1887f" />}
                    <span>
                      Lv.{l.level} · {l.unlock!.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={styles.outfitTab}>
            {/* 实时预览（显示所选形象的默认站立形象） */}
            <div className={styles.preview}>
              <Character
                pose="idle"
                costume={draft.costume}
                accessory={draft.accessory}
                size={110}
                poseAsset={previewAssets[draft.costume]?.poses['idle']}
              />
              <div className={styles.previewSceneName}>
                {SCENES.find((s) => s.id === draft.scene)?.name}
              </div>
            </div>

            <Section title="服装">
              {COSTUMES.map((c) => (
                <OptionPill
                  key={c.id}
                  active={draft.costume === c.id}
                  onClick={() => updateDraft({ costume: c.id as CostumeId })}
                  label={`${c.emoji} ${c.name}`}
                />
              ))}
            </Section>

            <Section title="配饰">
              {ACCESSORIES.map((a) => (
                <OptionPill
                  key={a.id}
                  active={draft.accessory === a.id}
                  onClick={() => updateDraft({ accessory: a.id as AccessoryId })}
                  label={`${a.emoji} ${a.name}`}
                />
              ))}
            </Section>

            <Section title="场景">
              {SCENES.map((s) => {
                const locked = s.unlockLevel > growth.level;
                return (
                  <OptionPill
                    key={s.id}
                    active={draft.scene === s.id}
                    onClick={() => !locked && updateDraft({ scene: s.id as SceneId })}
                    label={`${s.emoji} ${s.name}${locked ? `（Lv.${s.unlockLevel} 解锁）` : ''}`}
                    disabled={locked}
                  />
                );
              })}
            </Section>

            <button
              className={`${styles.primaryBtn} ${!dirty ? styles.btnDisabled : ''}`}
              disabled={!dirty}
              onClick={() => {
                onSaveOutfit(draft);
                setDirty(false);
              }}
            >
              保存搭配
            </button>
            <p className={styles.saveHint}>搭配方案会自动保存到本地，重启后依然有效</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      <div className={styles.pillRow}>{children}</div>
    </div>
  );
}

function OptionPill({
  active,
  onClick,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`${styles.pill} ${active ? styles.pillActive : ''} ${disabled ? styles.pillDisabled : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
