import { CircleSlash2, RotateCcw } from 'lucide-react';
import styles from './EmptyState.module.css';

type EmptyStateProps = {
  title: string;
  description: string;
};

type FailurePageProps = {
  onRetry: () => void;
};

export function EmptyState({ title, description }: EmptyStateProps): React.JSX.Element {
  return (
    <section className={styles.state} aria-live="polite">
      <CircleSlash2 aria-hidden="true" className={styles.icon} size={24} strokeWidth={1.7} />
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}

export function FailurePage({ onRetry }: FailurePageProps): React.JSX.Element {
  return (
    <section className={styles.state} role="alert">
      <CircleSlash2 aria-hidden="true" className={styles.icon} size={24} strokeWidth={1.7} />
      <h2>目录暂时无法加载</h2>
      <p>现有内容没有被修改。请稍后重试。</p>
      <button className={styles.retryButton} onClick={onRetry} type="button">
        <RotateCcw aria-hidden="true" size={17} strokeWidth={1.8} />
        重试
      </button>
    </section>
  );
}
