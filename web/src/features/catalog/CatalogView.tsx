import { useEffect, useMemo, useState, type PointerEvent } from 'react';
import type { CatalogPage } from '../../app/api/catalog';
import { hostOf } from '../../lib/url/host';
import { LinkCard } from './LinkCard';
import { SectionIndex } from './SectionIndex';
import styles from './CatalogView.module.css';

type CatalogViewProps = {
  page: CatalogPage;
  faviconVersions: Readonly<Record<string, number>>;
};

const sectionID = (pageID: string, index: number): string => `section-${pageID}-${index}`;

const pendingSpotlights = new WeakMap<HTMLElement, { x: number; y: number }>();

/**
 * Moves every card's spotlight in the hovered grid so neighbouring borders light up too.
 * Layout is read at most once per frame per grid.
 */
function trackSpotlight(event: PointerEvent<HTMLDivElement>): void {
  const grid = event.currentTarget;
  const scheduled = pendingSpotlights.has(grid);
  pendingSpotlights.set(grid, { x: event.clientX, y: event.clientY });
  if (scheduled) return;
  requestAnimationFrame(() => {
    const point = pendingSpotlights.get(grid);
    pendingSpotlights.delete(grid);
    if (point === undefined) return;
    for (const card of grid.children) {
      if (!(card instanceof HTMLElement)) continue;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--spot-x', `${point.x - rect.left}px`);
      card.style.setProperty('--spot-y', `${point.y - rect.top}px`);
    }
  });
}

function useActiveSection(ids: readonly string[]): number {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(ids.indexOf(entry.target.id));
        }
      },
      { rootMargin: '-35% 0px -60% 0px' },
    );
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element !== null) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

export function CatalogView({ page, faviconVersions }: CatalogViewProps): React.JSX.Element {
  const ids = useMemo(() => page.groups.map((_, index) => sectionID(page.id, index)), [page]);
  const active = useActiveSection(ids);

  return (
    <div className={styles.layout}>
      <SectionIndex active={active} groups={page.groups} ids={ids} />
      <div className={styles.sections}>
        {page.groups.map((group, groupIndex) => (
          <section
            aria-labelledby={`${ids[groupIndex] ?? ''}-title`}
            className={styles.section}
            id={ids[groupIndex]}
            key={group.name}
            style={{ '--section-delay': `${Math.min(groupIndex, 6) * 70}ms` } as React.CSSProperties}
          >
            <header className={styles.heading}>
              <span aria-hidden="true" className={styles.number}>
                {String(groupIndex + 1).padStart(2, '0')}
              </span>
              <h2 id={`${ids[groupIndex] ?? ''}-title`}>{group.name}</h2>
              <span className={styles.count}>{group.links.length} LINKS</span>
              <span aria-hidden="true" className={styles.rule} />
            </header>
            <div
              className={styles.grid}
              onPointerEnter={(event) => event.currentTarget.setAttribute('data-spotlight', 'on')}
              onPointerLeave={(event) => event.currentTarget.removeAttribute('data-spotlight')}
              onPointerMove={trackSpotlight}
            >
              {group.links.map((link, linkIndex) => (
                <LinkCard
                  host={hostOf(link)}
                  iconVersion={faviconVersions[link.runtimeId]}
                  key={link.runtimeId}
                  link={link}
                  order={linkIndex}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
