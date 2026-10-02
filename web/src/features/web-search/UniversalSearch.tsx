import { getNextMenuIndex, isMenuNavigationKey } from '../../lib/keyboard/menuNavigation';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import { Check, Search } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { motionTokens } from '../../styles/motion';
import type { WebSearchProviderID } from '../../app/api/webSearch';
import { ProviderIcon } from './ProviderIcon';
import {
  aiSearchProviders,
  getSearchProvider,
  searchProviders,
  webSearchProviders,
  type SearchProvider,
  type SearchProviderID,
} from './providers';
import styles from './UniversalSearch.module.css';

type UniversalSearchProps = {
  configuredProviderID?: WebSearchProviderID;
};

export const pointerExpansionHoldDuration = 8_000;

const productiveExpandTransition = {
  duration: 0.22,
  ease: [0, 0, 0.38, 0.9],
  type: 'tween',
} as const;

const productiveCollapseTransition = {
  duration: 0.18,
  ease: [0.2, 0, 0.38, 0.9],
  type: 'tween',
} as const;

type ProviderMenuGroupProps = {
  label: string;
  providers: readonly SearchProvider[];
  selectedProviderID: SearchProviderID;
  optionRefs: RefObject<(HTMLButtonElement | null)[]>;
  offset: number;
  onSelect: (providerID: SearchProviderID) => void;
};

function ProviderMenuGroup({
  label,
  providers,
  selectedProviderID,
  optionRefs,
  offset,
  onSelect,
}: ProviderMenuGroupProps): React.JSX.Element {
  return (
    <div aria-label={label} className={styles.menuGroup} role="group">
      <span className={styles.menuGroupLabel}>{label}</span>
      <div className={styles.menuOptions}>
        {providers.map((provider, index) => (
          <button
            aria-checked={provider.id === selectedProviderID}
            aria-label={provider.label}
            className={styles.menuOption}
            data-selected={provider.id === selectedProviderID ? 'true' : 'false'}
            key={provider.id}
            onClick={() => onSelect(provider.id)}
            ref={(element) => {
              optionRefs.current[offset + index] = element;
            }}
            role="menuitemradio"
            tabIndex={-1}
            type="button"
          >
            <span className={styles.menuOptionIcon}>
              <ProviderIcon className={styles.providerIcon} providerID={provider.id} />
            </span>
            <span className={styles.menuOptionLabel}>{provider.shortLabel}</span>
            <span className={styles.menuOptionCheck} aria-hidden="true">
              {provider.id === selectedProviderID ? <Check size={15} strokeWidth={2} /> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function UniversalSearch({
  configuredProviderID = 'baidu',
}: UniversalSearchProps): React.JSX.Element {
  const [manualProviderID, setManualProviderID] = useState<SearchProviderID | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [pointerExpansionHeld, setPointerExpansionHeld] = useState(false);
  const [focused, setFocused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pointerExpansionTimerRef = useRef<number | undefined>(undefined);
  const menuID = useId();
  const reduceMotion = useReducedMotion() ?? false;
  const providerID = manualProviderID ?? configuredProviderID;
  const provider = getSearchProvider(providerID);
  const expanded = pointerExpansionHeld || focused || menuOpen;
  const placeholder = provider.category === 'ai' ? `向 ${provider.label} 提问` : `在 ${provider.label} 中搜索`;

  useEffect(() => {
    if (!menuOpen) return undefined;

    const selectedIndex = searchProviders.findIndex((option) => option.id === providerID);
    optionRefs.current[selectedIndex]?.focus();

    function handlePointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && rootRef.current?.contains(event.target) !== true) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [menuOpen, providerID]);

  useEffect(
    () => () => {
      if (pointerExpansionTimerRef.current !== undefined) {
        window.clearTimeout(pointerExpansionTimerRef.current);
      }
    },
    [],
  );

  function holdPointerExpansion(): void {
    setPointerExpansionHeld(true);
    if (pointerExpansionTimerRef.current !== undefined) {
      window.clearTimeout(pointerExpansionTimerRef.current);
    }
    pointerExpansionTimerRef.current = window.setTimeout(() => {
      pointerExpansionTimerRef.current = undefined;
      setPointerExpansionHeld(false);
    }, pointerExpansionHoldDuration);
  }

  function closeMenu(restoreTriggerFocus: boolean): void {
    setMenuOpen(false);
    if (restoreTriggerFocus) triggerRef.current?.focus();
  }

  function selectProvider(nextProviderID: SearchProviderID): void {
    setManualProviderID(nextProviderID);
    setStatus('');
    setMenuOpen(false);
    inputRef.current?.focus();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape' && menuOpen) {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    if (event.key === 'Tab' && menuOpen) {
      setMenuOpen(false);
      return;
    }

    if (!isMenuNavigationKey(event.key)) return;

    event.preventDefault();
    if (!menuOpen) {
      setMenuOpen(true);
      return;
    }

    const activeIndex = optionRefs.current.findIndex(
      (element) => element === document.activeElement,
    );
    const selectedIndex = searchProviders.findIndex((option) => option.id === providerID);
    const currentIndex = activeIndex >= 0 ? activeIndex : selectedIndex;
    const nextIndex = getNextMenuIndex(event.key, currentIndex, searchProviders.length);
    optionRefs.current[nextIndex]?.focus();
  }

  function handleFormBlur(event: FocusEvent<HTMLFormElement>): void {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setFocused(false);
    }
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>): void {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      inputRef.current?.focus();
      return;
    }

    window.open(provider.buildURL(trimmedQuery), '_blank', 'noopener,noreferrer');

    if (provider.submission === 'direct') {
      setStatus('');
      return;
    }

    const clipboard = Reflect.get(navigator, 'clipboard') as Clipboard | undefined;
    if (clipboard === undefined) {
      setStatus(`已打开 ${provider.label}，请手动粘贴问题。`);
      return;
    }

    setStatus(`已打开 ${provider.label}，正在复制问题。`);
    void clipboard.writeText(trimmedQuery).then(
      () => setStatus(`问题已复制，请在 ${provider.label} 中粘贴发送。`),
      () => setStatus(`已打开 ${provider.label}，剪贴板不可用，请手动粘贴问题。`),
    );
  }

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      aria-label="外部搜索"
      className={styles.stage}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      transition={{
        duration: reduceMotion ? motionTokens.instant : 0.24,
        ease: [0, 0, 0.38, 0.9],
      }}
    >
      <div className={styles.inner}>
        <motion.div
          className={styles.cluster}
          data-expanded={expanded ? 'true' : 'false'}
          data-testid="external-search-cluster"
          layout
          onPointerEnter={(event) => {
            if (
              event.pointerType === 'mouse' &&
              !window.matchMedia('(max-width: 767px)').matches
            ) {
              holdPointerExpansion();
            }
          }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : expanded
                ? productiveExpandTransition
                : productiveCollapseTransition
          }
        >
          <form
            className={styles.form}
            onBlurCapture={handleFormBlur}
            onFocusCapture={() => setFocused(true)}
            onSubmit={handleSubmit}
            role="search"
          >
            <div className={styles.searchShell}>
              <div
                className={styles.providerPicker}
                onKeyDown={handleMenuKeyDown}
                ref={rootRef}
              >
                <button
                  aria-controls={menuID}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  aria-label={`搜索入口：${provider.label}`}
                  className={styles.providerTrigger}
                  data-testid="current-provider-icon"
                  onClick={() => setMenuOpen((current) => !current)}
                  ref={triggerRef}
                  title={`搜索入口：${provider.label}`}
                  type="button"
                >
                  <ProviderIcon className={styles.currentProviderIcon} providerID={provider.id} />
                </button>

                <AnimatePresence>
                  {menuOpen ? (
                    <motion.div
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      aria-label="选择搜索入口"
                      className={styles.providerMenu}
                      exit={{
                        opacity: 0,
                        scale: reduceMotion ? 1 : 0.98,
                        y: reduceMotion ? 0 : -5,
                      }}
                      id={menuID}
                      initial={{
                        opacity: 0,
                        scale: reduceMotion ? 1 : 0.98,
                        y: reduceMotion ? 0 : -5,
                      }}
                      role="menu"
                      transition={{
                        duration: reduceMotion ? motionTokens.instant : motionTokens.fast,
                        ease: [0, 0, 0.38, 0.9],
                      }}
                    >
                      <ProviderMenuGroup
                        label="网页"
                        offset={0}
                        onSelect={selectProvider}
                        optionRefs={optionRefs}
                        providers={webSearchProviders}
                        selectedProviderID={providerID}
                      />
                      <ProviderMenuGroup
                        label="模型"
                        offset={webSearchProviders.length}
                        onSelect={selectProvider}
                        optionRefs={optionRefs}
                        providers={aiSearchProviders}
                        selectedProviderID={providerID}
                      />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              <input
                ref={inputRef}
                aria-label="搜索互联网或询问模型"
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={placeholder}
                spellCheck={false}
                type="search"
                value={query}
              />
              <button
                aria-label={`使用 ${provider.label} 搜索`}
                className={styles.submit}
                type="submit"
              >
                <Search aria-hidden="true" size={22} strokeWidth={1.8} />
              </button>
            </div>
          </form>
        </motion.div>

        <p className={styles.status} role="status">
          {status}
        </p>
      </div>
    </motion.section>
  );
}
