import { CircleSlash2, RotateCcw } from 'lucide-react';
import type { CatalogTheme } from '../../app/api/theme';
import { useTheme } from '../theme/useTheme';
import styles from '../../components/EmptyState.module.css';
import layout from './NavigationFailure.module.css';

type NavigationFailureProps = {
  message: string;
  retryPath: string;
  configuredTheme: CatalogTheme;
};

export function NavigationFailure({ message, retryPath, configuredTheme }: NavigationFailureProps): React.JSX.Element {
  useTheme(configuredTheme);
  return (
    <main className={layout.page}>
      <section className={styles.state} aria-labelledby="navigation-failure-title">
        <CircleSlash2 aria-hidden="true" className={styles.icon} size={24} strokeWidth={1.7} />
        <h1 className={layout.title} id="navigation-failure-title">{message}</h1>
        <p>暂时无法连接到目标站点，请稍后重试。</p>
        <div className={layout.actions}>
          <a className={`${styles.retryButton} ${layout.retry}`} href={retryPath}>
            <RotateCcw aria-hidden="true" size={17} strokeWidth={1.8} />
            重试访问
          </a>
          <a className={layout.back} href="/">返回导航</a>
        </div>
      </section>
    </main>
  );
}
