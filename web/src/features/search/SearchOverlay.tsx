import { useEffect, useRef, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { motionTokens } from '../../motion/tokens';
import type { CatalogPage } from '../../shared/api/catalog';
import { IconButton } from '../../shared/ui/IconButton';
import { CatalogView } from '../catalog/CatalogView';
import { SearchField } from './SearchField';
import styles from './SearchOverlay.module.css';

type SearchOverlayProps = {
  page: CatalogPage;
  query: string;
  onChange: (query: string) => void;
  onClose: () => void;
  faviconVersions?: Readonly<Record<string, number>>;
};

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('hidden'));
}

export function SearchOverlay({ page, query, onChange, onClose, faviconVersions }: SearchOverlayProps): React.JSX.Element {
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shell = document.getElementById('navi-shell');
    document.body.style.overflow = 'hidden';
    if (shell !== null) {
      shell.setAttribute('inert', '');
      shell.setAttribute('aria-hidden', 'true');
    }
    inputRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (shell !== null) {
        shell.removeAttribute('inert');
        shell.removeAttribute('aria-hidden');
      }
      if (previousFocus?.isConnected === true) {
        previousFocus.focus();
      }
    };
  }, []);

  function focusFirstResult(): void {
    overlayRef.current?.querySelector<HTMLAnchorElement>('a[href^="/go/"]')?.focus();
  }

  function openFirstResult(): void {
    overlayRef.current?.querySelector<HTMLAnchorElement>('a[href^="/go/"]')?.click();
  }

  function handleEscape(): void {
    if (query.length > 0) {
      onChange('');
      return;
    }
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Tab' || overlayRef.current === null) {
      return;
    }

    const focusable = getFocusableElements(overlayRef.current);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <motion.div
      ref={overlayRef}
      animate={{ opacity: 1, y: 0 }}
      aria-label="搜索导航"
      aria-modal="true"
      className={styles.overlay}
      exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
      initial={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
      onKeyDown={handleKeyDown}
      role="dialog"
      transition={{ duration: reduceMotion ? motionTokens.instant : motionTokens.standard }}
    >
      <div className={styles.header}>
        <SearchField
          inputRef={inputRef}
          onChange={onChange}
          onEscape={handleEscape}
          onMoveToResults={focusFirstResult}
          onOpenFirstResult={openFirstResult}
          value={query}
        />
        <IconButton label="关闭搜索" onClick={onClose} tooltipAlign="end">
          <X aria-hidden="true" size={20} strokeWidth={1.8} />
        </IconButton>
      </div>
      <main className={styles.results}>
        <CatalogView
          {...(faviconVersions === undefined ? {} : { faviconVersions })}
          page={page}
          entranceMode="filter"
          searching={query.length > 0}
        />
      </main>
    </motion.div>
  );
}
