import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { CatalogPage } from '../../shared/api/catalog';
import styles from './PagePagination.module.css';

type PagePaginationProps = {
  pages: CatalogPage[];
  currentIndex: number;
  onChange: (index: number) => void;
};

export function PagePagination({
  pages,
  currentIndex,
  onChange,
}: PagePaginationProps): React.JSX.Element | null {
  const pagesRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const container = pagesRef.current;
    const currentButton = container?.querySelector<HTMLElement>('[aria-current="page"]');
    if (container === null || currentButton === null || currentButton === undefined) return;
    const left = currentButton.offsetLeft - (container.clientWidth - currentButton.offsetWidth) / 2;
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ behavior: reduceMotion ? 'auto' : 'smooth', left });
    } else {
      container.scrollLeft = left;
    }
  }, [currentIndex, reduceMotion]);

  if (pages.length < 2) return null;

  return (
    <nav aria-label="导航分页" className={styles.pagination}>
      <button
        aria-label="上一页"
        className={styles.arrow}
        disabled={currentIndex === 0}
        onClick={() => onChange(currentIndex - 1)}
        type="button"
      >
        <ChevronLeft aria-hidden="true" size={17} strokeWidth={1.75} />
      </button>

      <div className={styles.pages} ref={pagesRef}>
        {pages.map((page, index) => {
          const current = index === currentIndex;
          return (
            <button
              aria-current={current ? 'page' : undefined}
              aria-label={`第 ${index + 1} 页：${page.title}`}
              className={styles.pageButton}
              data-current={current ? 'true' : 'false'}
              key={page.id}
              onClick={() => onChange(index)}
              title={page.title}
              type="button"
            >
              {current ? (
                <motion.span
                  className={styles.activeIndicator}
                  data-page-indicator="active"
                  layoutId="navi-active-page-indicator"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { duration: 0.28, ease: [0.22, 1, 0.36, 1], type: 'tween' }
                  }
                >
                  <AnimatePresence initial={false}>
                    {reduceMotion ? null : (
                      <motion.span
                        animate={{ opacity: 0, scale: 2.4 }}
                        className={styles.ripple}
                        initial={{ opacity: 0.24, scale: 0.45 }}
                        key={currentIndex}
                        transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
                      />
                    )}
                  </AnimatePresence>
                </motion.span>
              ) : (
                <span aria-hidden="true" className={styles.inactiveDot} />
              )}
            </button>
          );
        })}
      </div>

      <button
        aria-label="下一页"
        className={styles.arrow}
        disabled={currentIndex === pages.length - 1}
        onClick={() => onChange(currentIndex + 1)}
        type="button"
      >
        <ChevronRight aria-hidden="true" size={17} strokeWidth={1.75} />
      </button>
    </nav>
  );
}
