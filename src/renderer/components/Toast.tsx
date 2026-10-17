// 轻量 toast 提示（用于保存失败、获得零食、升级等反馈）
import { useEffect } from 'react';
import styles from './Toast.module.css';

export interface ToastItem {
  id: number;
  text: string;
  tone?: 'info' | 'ok' | 'error';
}

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 2600);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div className={`${styles.toast} ${toast.tone === 'error' ? styles.error : toast.tone === 'ok' ? styles.ok : ''}`}>
      {toast.text}
    </div>
  );
}

export default function ToastHub({ toasts, onDismiss }: Props) {
  return (
    <div className={styles.hub}>
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
