import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import type { WebSearchProviderID } from '../../app/api/webSearch';
import type { SearchEntry } from './linkSearch';
import { getSearchProvider } from './providers';
import { SearchResults } from './SearchResults';
import { optionID, useSearchList } from './useSearchList';
import { submitWebSearch } from './webSearch';
import styles from './CommandPalette.module.css';

type CommandPaletteProps = {
  index: readonly SearchEntry[];
  providerID: WebSearchProviderID;
  faviconVersions: Readonly<Record<string, number>>;
  onClose: () => void;
};

export function CommandPalette({ index, providerID, faviconVersions, onClose }: CommandPaletteProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listID = `palette-results-${useId().replace(/:/g, '')}`;
  const provider = getSearchProvider(providerID);
  const list = useSearchList(index, query, 12);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function search(text: string): void {
    void submitWebSearch(provider, text).then((message) => {
      if (message.length > 0) setStatus(message);
      else onClose();
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      // The palette is modal: keep focus on its only text control.
      event.preventDefault();
      inputRef.current?.focus();
      return;
    }
    if (event.target !== inputRef.current || event.nativeEvent.isComposing) return;
    if (list.handleNavigationKey(event.key)) {
      event.preventDefault();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = list.items[list.activeIndex];
      if (item?.kind === 'web') search(item.query);
      else if (item !== undefined) document.getElementById(optionID(listID, list.activeIndex))?.click();
    }
  }

  return (
    <div
      className={styles.overlay}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-label="搜索链接"
        aria-modal="true"
        className={styles.dialog}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <div className={styles.inputRow}>
          <Search aria-hidden="true" size={18} strokeWidth={1.8} />
          <input
            aria-activedescendant={list.items.length > 0 ? optionID(listID, list.activeIndex) : undefined}
            aria-autocomplete="list"
            aria-controls={listID}
            aria-expanded="true"
            aria-label="搜索链接"
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
              setStatus('');
            }}
            placeholder="搜索链接、分组、标签或域名…"
            ref={inputRef}
            role="combobox"
            spellCheck={false}
            type="search"
            value={query}
          />
          <kbd aria-hidden="true">ESC</kbd>
        </div>
        <div
          className={styles.results}
          onClick={(event) => {
            // Link results navigate in a new tab; the palette has done its job.
            if (event.target instanceof Element && event.target.closest('a[role="option"]') !== null) onClose();
          }}
        >
          <SearchResults
            activeIndex={list.activeIndex}
            emptyHint={`输入关键词，在 ${index.length} 个链接中查找；回车也可在 ${provider.label} 中搜索。`}
            faviconVersions={faviconVersions}
            id={listID}
            items={list.items}
            label="搜索结果"
            onHover={list.setActiveIndex}
            onWebSearch={search}
            provider={provider}
            query={query}
          />
        </div>
        <p className={styles.footer}>
          <span>↑↓ 选择</span>
          <span>↵ 打开</span>
          <span>ESC 关闭</span>
          <span className={styles.status} role="status">
            {status}
          </span>
        </p>
      </div>
    </div>
  );
}
