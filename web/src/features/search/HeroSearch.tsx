import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { WebSearchProviderID } from '../../app/api/webSearch';
import type { SearchEntry } from './linkSearch';
import { ProviderIcon } from './ProviderIcon';
import { getSearchProvider, searchProviders } from './providers';
import { SearchResults } from './SearchResults';
import { optionID, useSearchList } from './useSearchList';
import { submitWebSearch } from './webSearch';
import styles from './HeroSearch.module.css';

type HeroSearchProps = {
  index: readonly SearchEntry[];
  providerID: WebSearchProviderID;
  onProviderChange: (providerID: WebSearchProviderID) => void;
  faviconVersions: Readonly<Record<string, number>>;
  inputRef: RefObject<HTMLInputElement | null>;
};

export function HeroSearch({ index, providerID, onProviderChange, faviconVersions, inputRef }: HeroSearchProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listID = `hero-results-${useId().replace(/:/g, '')}`;
  const provider = getSearchProvider(providerID);
  const list = useSearchList(index, query, 6);
  const expanded = open && list.items.length > 0;

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target) !== true) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  function search(text: string): void {
    void submitWebSearch(provider, text).then(setStatus);
  }

  function activate(position: number): void {
    const item = list.items[position];
    if (item === undefined) return;
    if (item.kind === 'web') search(item.query);
    else document.getElementById(optionID(listID, position))?.click();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing) return;
    if (list.handleNavigationKey(event.key)) {
      event.preventDefault();
      setOpen(true);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      activate(list.activeIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (query.length > 0) setQuery('');
      else event.currentTarget.blur();
    }
  }

  return (
    <div className={styles.search} ref={rootRef}>
      <form
        className={styles.field}
        onSubmit={(event) => event.preventDefault()}
        role="search"
        aria-label="搜索网页与链接"
      >
        <span className={styles.engine}>
          <span className={styles.badge}>
            <ProviderIcon className={styles.icon} providerID={provider.id} />
          </span>
          {provider.shortLabel}
        </span>
        <input
          aria-activedescendant={expanded ? optionID(listID, list.activeIndex) : undefined}
          aria-autocomplete="list"
          aria-controls={listID}
          aria-expanded={expanded}
          aria-label="搜索网页或筛选链接"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setStatus('');
            setOpen(true);
          }}
          onBlur={(event) => {
            // Keep the list while a result takes focus (pointer down on an option); otherwise
            // collapse it so it does not cover the engine row that Tab moves to.
            if (!(event.relatedTarget instanceof Node && dropdownRef.current?.contains(event.relatedTarget) === true)) setOpen(false);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={provider.category === 'ai' ? '向模型提问，或筛选链接' : '搜索网页，或筛选链接'}
          ref={inputRef}
          role="combobox"
          spellCheck={false}
          type="search"
          value={query}
        />
        <kbd aria-hidden="true">/</kbd>
      </form>
      {expanded ? (
        <div className={styles.dropdown} ref={dropdownRef}>
          <SearchResults
            activeIndex={list.activeIndex}
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
      ) : null}
      <div aria-label="搜索入口" className={styles.engines} role="group">
        <span aria-hidden="true" className={styles.enginesLabel}>
          ENGINE
        </span>
        {searchProviders.map((option, position) => (
          <Fragment key={option.id}>
            {position > 0 && option.category !== searchProviders[position - 1]?.category ? (
              <span aria-hidden="true" className={styles.separator} />
            ) : null}
            <button
              aria-pressed={option.id === provider.id}
              className={styles.engineOption}
              onClick={() => {
                onProviderChange(option.id);
                setStatus('');
                inputRef.current?.focus();
              }}
              type="button"
            >
              <span>{option.shortLabel}</span>
            </button>
          </Fragment>
        ))}
      </div>
      <p className={styles.status} role="status">
        {status}
      </p>
    </div>
  );
}
