// 互动记录浮层：日记列表 + 时间筛选 + 详情/心情备注（PRD §5 互动记录）
import { useMemo, useState } from 'react';
import {
  IconBook2,
  IconX,
  IconPointer,
  IconHandMove,
  IconCookie,
  IconShirt,
  IconInfoCircle,
  IconPencil,
  IconDeviceFloppy,
  IconMessageCircle,
} from '@tabler/icons-react';
import type { LogEntry, InteractionType } from '../../shared/types';
import styles from './DiaryOverlay.module.css';

interface Props {
  log: LogEntry[];
  /** 加载失败（PRD 边界情况：本地数据库读取失败） */
  loadError: boolean;
  onRetryLoad: () => void;
  onSaveNote: (id: string, note: string) => Promise<void>;
  onClose: () => void;
}

type Filter = 'today' | 'week' | 'all';

const TYPE_META: Record<InteractionType, { label: string; icon: React.ReactNode; cls: string }> = {
  click: { label: '点击', icon: <IconPointer size={13} />, cls: 'click' },
  drag: { label: '拖拽', icon: <IconHandMove size={13} />, cls: 'drag' },
  feed: { label: '喂食', icon: <IconCookie size={13} />, cls: 'feed' },
  outfit: { label: '换装', icon: <IconShirt size={13} />, cls: 'outfit' },
  system: { label: '系统', icon: <IconInfoCircle size={13} />, cls: 'system' },
  chat: { label: '聊天', icon: <IconMessageCircle size={13} />, cls: 'chat' },
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'today', label: '今天' },
  { id: 'week', label: '本周' },
  { id: 'all', label: '全部' },
];

function fmtTime(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}

export default function DiaryOverlay({ log, loadError, onRetryLoad, onSaveNote, onClose }: Props) {
  const [filter, setFilter] = useState<Filter>('today');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const entries = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 86400_000;
    const min = filter === 'today' ? todayStart : filter === 'week' ? weekStart : 0;
    return [...log].filter((e) => e.ts >= min).sort((a, b) => b.ts - a.ts);
  }, [log, filter]);

  const openEntry = (e: LogEntry) => {
    if (expandedId === e.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(e.id);
    setNoteDraft(e.note ?? '');
    setSavedId(null);
  };

  const saveNote = async (id: string) => {
    setSaving(true);
    await onSaveNote(id, noteDraft);
    setSaving(false);
    setSavedId(id);
  };

  return (
    <div className={styles.overlay}>
      <header className={styles.header}>
        <div className={styles.title}>
          <IconBook2 size={17} />
          互动日记
        </div>
        <button className={styles.closeBtn} onClick={onClose} title="返回桌面">
          <IconX size={18} />
        </button>
      </header>

      <div className={styles.filterBar}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`${styles.filterBtn} ${filter === f.id ? styles.filterActive : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        {loadError ? (
          // PRD 边界情况：读取失败
          <div className={styles.empty}>
            <div className={styles.emptyEmoji}>:(</div>
            <p>日记加载失败，请重启应用</p>
            <button className={styles.retryBtn} onClick={onRetryLoad}>
              重新加载
            </button>
          </div>
        ) : entries.length === 0 ? (
          // PRD 边界情况：空数据
          <div className={styles.empty}>
            <svg className={styles.emptyArt} viewBox="0 0 120 90" aria-hidden>
              <ellipse cx="60" cy="70" rx="34" ry="8" fill="#ffccbc" />
              <circle cx="60" cy="42" r="24" fill="#ffe0b2" stroke="#3e2723" strokeWidth="2.5" />
              <path d="M38 38 Q44 18 60 24 Q76 18 82 38 Q72 30 60 34 Q48 30 38 38 Z" fill="#3e2723" />
              <line x1="50" y1="48" x2="58" y2="48" stroke="#3e2723" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="64" y1="48" x2="72" y2="48" stroke="#3e2723" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M52 58 Q60 64 68 58" fill="none" stroke="#3e2723" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <p>{log.length === 0 ? '还没有互动记录，去戳戳小新吧' : '这个时间段还没有记录哦'}</p>
            <button className={styles.retryBtn} onClick={onClose}>
              去互动
            </button>
          </div>
        ) : (
          <ul className={styles.list}>
            {entries.map((e) => {
              const meta = TYPE_META[e.type];
              const expanded = expandedId === e.id;
              return (
                <li key={e.id} className={`${styles.item} ${expanded ? styles.itemOpen : ''}`}>
                  <button className={styles.itemHead} onClick={() => openEntry(e)}>
                    <span className={`${styles.badge} ${styles[meta.cls]}`}>
                      {meta.icon}
                      {meta.label}
                    </span>
                    <span className={styles.itemText}>{e.text}</span>
                    <span className={styles.itemTime}>{fmtTime(e.ts)}</span>
                  </button>

                  {expanded && (
                    <div className={styles.detail}>
                      <div className={styles.detailText}>{e.text}</div>
                      <div className={styles.noteRow}>
                        <span className={styles.noteLabel}>
                          <IconPencil size={13} /> 心情备注
                        </span>
                        <textarea
                          className={styles.noteInput}
                          value={noteDraft}
                          placeholder="写下这一刻的心情，比如：今天很开心"
                          rows={2}
                          onChange={(ev) => setNoteDraft(ev.target.value)}
                        />
                        <button className={styles.saveBtn} disabled={saving} onClick={() => saveNote(e.id)}>
                          <IconDeviceFloppy size={13} />
                          {savedId === e.id ? '已保存' : saving ? '保存中…' : '保存备注'}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
