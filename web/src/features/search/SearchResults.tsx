import { useEffect, useRef } from 'react';
import { ArrowUpRight, Globe } from 'lucide-react';
import { iconSource, navigationHref } from '../../app/api/routes';
import { LinkIcon } from '../../components/LinkIcon';
import { highlight } from './linkSearch';
import type { SearchProvider } from './providers';
import { optionID, type SearchItem } from './useSearchList';
import styles from './SearchResults.module.css';

type SearchResultsProps = {
  id: string;
  label: string;
  items: readonly SearchItem[];
  activeIndex: number;
  query: string;
  provider: SearchProvider;
  faviconVersions: Readonly<Record<string, number>>;
  onHover: (index: number) => void;
  onWebSearch: (query: string) => void;
  /** Shown when there is no query yet. */
  emptyHint?: string;
};

function Highlighted({ text, query }: { text: string; query: string }): React.JSX.Element {
  const parts = highlight(text, query);
  if (parts === null) return <>{text}</>;
  return (
    <>
      {parts.before}
      <mark>{parts.match}</mark>
      {parts.after}
    </>
  );
}

export function SearchResults({
  id,
  label,
  items,
  activeIndex,
  query,
  provider,
  faviconVersions,
  onHover,
  onWebSearch,
  emptyHint,
}: SearchResultsProps): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  const linkCount = items.filter((item) => item.kind === 'link').length;
  let caption: React.ReactNode;
  if (items.length === 0) caption = <p className={styles.empty} role="presentation">{emptyHint}</p>;
  else if (linkCount > 0)
    caption = (
      <p className={styles.caption} role="presentation">
        站内链接 · {linkCount}
      </p>
    );
  else
    caption = (
      <p className={styles.empty} role="presentation">
        没有匹配「{query.trim()}」的链接
      </p>
    );

  useEffect(() => {
    listRef.current?.ownerDocument.getElementById(optionID(id, activeIndex))?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, id]);

  return (
    <div aria-label={label} className={styles.list} id={id} ref={listRef} role="listbox">
      {caption}
      {items.map((item, index) =>
        item.kind === 'link' ? (
          <a
            aria-selected={index === activeIndex}
            className={styles.option}
            href={navigationHref(item.entry.link.runtimeId)}
            id={optionID(id, index)}
            key={item.entry.link.runtimeId}
            onPointerMove={() => onHover(index)}
            rel="noreferrer"
            role="option"
            tabIndex={-1}
            target="_blank"
          >
            <LinkIcon
              name={item.entry.link.name}
              size="small"
              src={iconSource(item.entry.link.runtimeId, faviconVersions[item.entry.link.runtimeId])}
            />
            <span className={styles.text}>
              <span className={styles.name}>
                <Highlighted query={query} text={item.entry.link.name} />
              </span>
              <span className={styles.meta}>
                {item.entry.page} · {item.entry.group} · <Highlighted query={query} text={item.entry.host} />
              </span>
            </span>
            <ArrowUpRight aria-hidden="true" className={styles.go} size={15} strokeWidth={1.8} />
          </a>
        ) : (
          <div
            aria-selected={index === activeIndex}
            className={styles.option}
            id={optionID(id, index)}
            key="web"
            onClick={() => onWebSearch(item.query)}
            onPointerMove={() => onHover(index)}
            role="option"
            tabIndex={-1}
          >
            <span aria-hidden="true" className={styles.web}>
              <Globe size={16} strokeWidth={1.6} />
            </span>
            <span className={styles.text}>
              <span className={styles.name}>
                在 {provider.label} 中{provider.category === 'ai' ? '提问' : '搜索'}「{item.query}」
              </span>
              <span className={styles.meta}>{provider.submission === 'clipboard' ? '打开新标签页并复制问题' : '打开新标签页'}</span>
            </span>
            <kbd aria-hidden="true">↵</kbd>
          </div>
        ),
      )}
    </div>
  );
}
