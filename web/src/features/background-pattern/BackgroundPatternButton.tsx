import { getNextMenuIndex, isMenuNavigationKey } from '../../lib/keyboard/menuNavigation';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Orbit } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { motionTokens } from '../../styles/motion';
import { IconButton } from '../../components/IconButton';
import { BackgroundPatternArtwork } from './BackgroundPatternArtwork';
import {
  backgroundPatternOptions,
  getBackgroundPatternOption,
} from './backgroundPatternOptions';
import type { BackgroundPatternPreference } from './useBackgroundPattern';
import styles from './BackgroundPatternButton.module.css';

type BackgroundPatternButtonProps = {
  preference: BackgroundPatternPreference;
  onChange: (pattern: BackgroundPatternPreference) => void;
};

const menuID = 'background-pattern-menu';

export function BackgroundPatternButton({
  preference,
  onChange,
}: BackgroundPatternButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const reduceMotion = useReducedMotion();
  const currentPattern = getBackgroundPatternOption(preference);

  useEffect(() => {
    if (!open) return undefined;

    const selectedIndex = backgroundPatternOptions.findIndex((option) => option.id === preference);
    optionRefs.current[selectedIndex]?.focus();

    function handlePointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && rootRef.current?.contains(event.target) !== true) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, preference]);

  function closeAndRestoreFocus(): void {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function selectPattern(pattern: BackgroundPatternPreference): void {
    onChange(pattern);
    closeAndRestoreFocus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      closeAndRestoreFocus();
      return;
    }

    if (event.key === 'Tab' && open) {
      setOpen(false);
      return;
    }

    if (!isMenuNavigationKey(event.key)) return;

    event.preventDefault();
    if (!open) {
      setOpen(true);
      return;
    }

    const activeIndex = optionRefs.current.findIndex(
      (element) => element === document.activeElement,
    );
    const selectedIndex = backgroundPatternOptions.findIndex((option) => option.id === preference);
    const currentIndex = activeIndex >= 0 ? activeIndex : selectedIndex;
    const nextIndex = getNextMenuIndex(event.key, currentIndex, backgroundPatternOptions.length);
    optionRefs.current[nextIndex]?.focus();
  }

  return (
    <div
      className={styles.root}
      data-open={open ? 'true' : 'false'}
      onKeyDown={handleKeyDown}
      ref={rootRef}
    >
      <IconButton
        aria-controls={menuID}
        aria-expanded={open}
        aria-haspopup="menu"
        buttonRef={triggerRef}
        className={styles.trigger}
        label={`背景纹样：${currentPattern.label}`}
        onClick={() => setOpen((current) => !current)}
        tooltipAlign="end"
      >
        <Orbit aria-hidden="true" size={19} strokeWidth={1.8} />
      </IconButton>

      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-label="选择背景纹样"
            className={styles.menu}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.98, y: reduceMotion ? 0 : -4 }}
            id={menuID}
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.98, y: reduceMotion ? 0 : -4 }}
            role="menu"
            transition={{ duration: reduceMotion ? motionTokens.instant : motionTokens.fast }}
          >
            {backgroundPatternOptions.map((option, index) => (
              <button
                aria-checked={option.id === preference}
                aria-label={option.label}
                className={styles.option}
                data-selected={option.id === preference ? 'true' : 'false'}
                key={option.id}
                onClick={() => selectPattern(option.id)}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="menuitemradio"
                tabIndex={-1}
                type="button"
              >
                <span className={styles.preview} aria-hidden="true">
                  <BackgroundPatternArtwork
                    className={styles.previewArtwork}
                    pattern={option.id}
                  />
                </span>
                <span className={styles.copy}>
                  <span className={styles.label}>{option.label}</span>
                  <span className={styles.description}>{option.description}</span>
                </span>
                <span className={styles.check} aria-hidden="true">
                  {option.id === preference ? <Check size={17} strokeWidth={2} /> : null}
                </span>
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
