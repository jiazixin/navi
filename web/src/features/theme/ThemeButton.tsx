import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Palette } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { motionTokens } from '../../motion/tokens';
import type { ThemePreference } from './useTheme';
import { IconButton } from '../../shared/ui/IconButton';
import { getThemeOption, themeOptions } from './themeOptions';
import styles from './ThemeButton.module.css';

type ThemeButtonProps = {
  preference: ThemePreference;
  onChange: (theme: ThemePreference) => void;
};

const menuID = 'theme-menu';

export function ThemeButton({ preference, onChange }: ThemeButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const reduceMotion = useReducedMotion();
  const currentTheme = getThemeOption(preference);

  useEffect(() => {
    if (!open) return undefined;

    const selectedIndex = themeOptions.findIndex((option) => option.id === preference);
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

  function selectTheme(theme: ThemePreference): void {
    onChange(theme);
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

    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    if (!open) {
      setOpen(true);
      return;
    }

    const activeIndex = optionRefs.current.findIndex(
      (element) => element === document.activeElement,
    );
    const selectedIndex = themeOptions.findIndex((option) => option.id === preference);
    const currentIndex = activeIndex >= 0 ? activeIndex : selectedIndex;
    const lastIndex = themeOptions.length - 1;
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? lastIndex
          : event.key === 'ArrowDown'
            ? currentIndex >= lastIndex
              ? 0
              : currentIndex + 1
            : currentIndex <= 0
              ? lastIndex
              : currentIndex - 1;
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
        label={`主题：${currentTheme.label}`}
        onClick={() => setOpen((current) => !current)}
        tooltipAlign="end"
      >
        <Palette aria-hidden="true" size={19} strokeWidth={1.8} />
      </IconButton>

      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-label="选择主题"
            className={styles.menu}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.98, y: reduceMotion ? 0 : -4 }}
            id={menuID}
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.98, y: reduceMotion ? 0 : -4 }}
            role="menu"
            transition={{ duration: reduceMotion ? motionTokens.instant : motionTokens.fast }}
          >
            {themeOptions.map((option, index) => (
              <button
                aria-checked={option.id === preference}
                aria-label={option.label}
                className={styles.option}
                data-selected={option.id === preference ? 'true' : 'false'}
                key={option.id}
                onClick={() => selectTheme(option.id)}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="menuitemradio"
                type="button"
              >
                <span className={styles.swatches} aria-hidden="true">
                  {option.colors.map((color) => (
                    <span className={styles.swatch} key={color} style={{ background: color }} />
                  ))}
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
