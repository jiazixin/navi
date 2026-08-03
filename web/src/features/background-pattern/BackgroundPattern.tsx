import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { motionTokens } from '../../motion/tokens';
import type { CatalogBackgroundPattern } from '../../shared/api/backgroundPattern';
import { BackgroundPatternArtwork } from './BackgroundPatternArtwork';
import styles from './BackgroundPattern.module.css';

type BackgroundPatternProps = {
  pattern: CatalogBackgroundPattern;
};

export function BackgroundPattern({ pattern }: BackgroundPatternProps): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const duration = reduceMotion ? motionTokens.instant : motionTokens.standard;

  return (
    <div
      aria-hidden="true"
      className={styles.layer}
      data-background-pattern-layer
      data-pattern={pattern}
    >
      <AnimatePresence initial={false} mode="sync">
        {pattern === 'none' ? null : (
          <motion.div
            animate={{ opacity: 1 }}
            className={styles.frame}
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key={pattern}
            transition={{ duration }}
          >
            <BackgroundPatternArtwork className={styles.artwork} pattern={pattern} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
