import styles from './LoadingCatalog.module.css';

const groups = [6, 4, 5];

export function LoadingCatalog(): React.JSX.Element {
  return (
    <div aria-busy="true" aria-label="正在加载目录" className={styles.loading} role="status">
      {groups.map((count, group) => (
        <div className={styles.group} key={group}>
          <div className={styles.heading}>
            <span className={styles.number} />
            <span className={styles.title} />
            <span className={styles.rule} />
          </div>
          <div className={styles.grid}>
            {Array.from({ length: count }, (_, card) => (
              <div className={styles.card} key={card}>
                <span className={styles.icon} />
                <span className={styles.lines}>
                  <span />
                  <span />
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
