import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { motionTokens } from '../../motion/tokens';
import type { Catalog } from '../../shared/api/catalog';
import { EmptyState } from '../../shared/ui/EmptyState';
import { countLinks } from './filterCatalog';
import { GroupSection } from './GroupSection';
import styles from './CatalogView.module.css';

type CatalogViewProps = {
  catalog: Catalog;
  searching?: boolean;
  entranceMode?: 'initial' | 'filter';
};

export function CatalogView({
  catalog,
  searching = false,
  entranceMode = 'initial',
}: CatalogViewProps): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const linkCount = countLinks(catalog);
  const enableLayoutMotion = linkCount <= 80;

  if (linkCount === 0) {
    return (
      <EmptyState
        description={searching ? '换一个关键词，或清空搜索后查看全部链接。' : '在 urls.yaml 中添加链接后，这里会自动更新。'}
        title={searching ? '没有匹配的链接' : '目录还是空的'}
      />
    );
  }

  return (
    <>
      <span className={styles.liveRegion} aria-live="polite">
        {searching ? `找到 ${linkCount} 个链接` : ''}
      </span>
      <motion.div
        animate={{ opacity: 1 }}
        className={styles.catalog}
        initial={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? motionTokens.instant : motionTokens.standard }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {catalog.groups.map((group, index) => (
            <GroupSection
              key={group.name}
              enableLayoutMotion={enableLayoutMotion}
              entranceMode={entranceMode}
              group={group}
              index={index}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
