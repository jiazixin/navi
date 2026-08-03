import styles from './LoadingCatalog.module.css';

const skeletonGroups = [3, 2] as const;

export function LoadingCatalog(): React.JSX.Element {
  return (
    <div className={styles.catalog} aria-busy="true" aria-label="正在加载导航目录">
      {skeletonGroups.map((cardCount, groupIndex) => (
        <section className={styles.group} key={groupIndex}>
          <div className={styles.headingRow}>
            <span className={`${styles.skeleton} ${styles.heading}`} />
            <span className={`${styles.skeleton} ${styles.count}`} />
            <span className={styles.rule} />
          </div>
          <div className={styles.grid}>
            {Array.from({ length: cardCount }, (_, cardIndex) => (
              <div className={styles.card} key={cardIndex}>
                <span className={`${styles.skeleton} ${styles.icon}`} />
                <span className={styles.copy}>
                  <span className={`${styles.skeleton} ${styles.title}`} />
                  <span className={`${styles.skeleton} ${styles.secondary}`} />
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
