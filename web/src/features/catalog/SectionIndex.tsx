import { useEffect, useRef } from 'react';
import type { CatalogGroup } from '../../app/api/catalog';
import styles from './SectionIndex.module.css';

type SectionIndexProps = {
  groups: readonly CatalogGroup[];
  ids: readonly string[];
  active: number;
};

export function SectionIndex({ groups, ids, active }: SectionIndexProps): React.JSX.Element {
  const listRef = useRef<HTMLOListElement>(null);

  // On narrow screens the index is a horizontal strip; keep the active chip in view.
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="location"]');
    if (list === null || current === null || current === undefined || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({ left: current.offsetLeft - 16, behavior: 'smooth' });
  }, [active]);

  return (
    <nav aria-label="分区目录" className={styles.index}>
      <p aria-hidden="true" className={styles.title}>
        INDEX · 目录
      </p>
      <ol ref={listRef}>
        {groups.map((group, index) => (
          <li key={group.name}>
            <a aria-current={index === active ? 'location' : undefined} href={`#${ids[index] ?? ''}`}>
              <span aria-hidden="true" className={styles.number}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className={styles.name}>{group.name}</span>
              <span aria-label={`${group.links.length} 个链接`} className={styles.count}>
                {group.links.length}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
