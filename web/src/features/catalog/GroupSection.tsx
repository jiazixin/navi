import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { motionTokens } from '../../motion/tokens';
import type { CatalogGroup } from '../../shared/api/catalog';
import { LinkCard } from './LinkCard';
import styles from './GroupSection.module.css';

type GroupSectionProps = {
  group: CatalogGroup;
  index?: number;
  enableLayoutMotion?: boolean;
  entranceMode?: 'initial' | 'filter';
};

export function GroupSection({
  group,
  index = 0,
  enableLayoutMotion = true,
  entranceMode = 'initial',
}: GroupSectionProps): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const entranceDelay = entranceMode === 'initial' ? Math.min(index * motionTokens.stagger, 0.24) : 0;
  const entranceDuration = entranceMode === 'initial' ? motionTokens.emphasis : motionTokens.favicon;
  const entranceOffset = entranceMode === 'initial' ? 8 : 0;

  return (
    <motion.section
      aria-labelledby={`group-${index}`}
      className={styles.section}
      exit={
        reduceMotion
          ? { opacity: 0, transition: { duration: motionTokens.instant } }
          : { opacity: 0, transition: { duration: motionTokens.fast, ease: [0.4, 0, 1, 1] } }
      }
      initial={reduceMotion ? false : { opacity: 0, y: entranceOffset }}
      layout={enableLayoutMotion && !reduceMotion ? 'position' : false}
      transition={
        reduceMotion
          ? { duration: motionTokens.instant }
          : { duration: entranceDuration, delay: entranceDelay, ease: [0.22, 1, 0.36, 1] }
      }
    >
      <header className={styles.headingRow}>
        <h2 id={`group-${index}`}>{group.name}</h2>
        <span className={styles.count} aria-label={`${group.links.length} 个链接`}>
          {group.links.length}
        </span>
        <span className={styles.rule} aria-hidden="true" />
      </header>
      <motion.div className={styles.grid} layout={enableLayoutMotion && !reduceMotion}>
        <AnimatePresence initial={false} mode="popLayout">
          {group.links.map((link) => (
            <LinkCard key={link.runtimeId} enableLayoutMotion={enableLayoutMotion} link={link} />
          ))}
        </AnimatePresence>
      </motion.div>
    </motion.section>
  );
}
