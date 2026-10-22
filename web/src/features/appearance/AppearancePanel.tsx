import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import {
  getPattern,
  maxPatternStrength,
  minPatternStrength,
  palettes,
  patterns,
  type PatternID,
  type ThemePreference,
} from './options';
import { PatternCanvas } from './PatternCanvas';
import { useAppearance } from './useAppearance';
import styles from './AppearancePanel.module.css';

type AppearancePanelProps = {
  id: string;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: (restoreFocus: boolean) => void;
};

const themeChoices: readonly { id: ThemePreference; name: string; en: string; background: string; accent: string }[] = [
  { id: 'default', name: '跟随系统', en: 'Auto', background: '#f1ede4', accent: '#09090b' },
  ...palettes,
];

const arrowKeyOffsets: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** Arrow keys move and select within a radio group, matching native radio buttons. */
function handleRadioKeys<T extends string>(event: KeyboardEvent<HTMLDivElement>, values: readonly T[], current: T, select: (value: T) => void): void {
  const index = values.indexOf(current);
  let next: number;
  if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = values.length - 1;
  else if (event.key in arrowKeyOffsets) next = (index + (arrowKeyOffsets[event.key] ?? 0) + values.length) % values.length;
  else return;
  event.preventDefault();
  const value = values[next];
  if (value === undefined) return;
  select(value);
  event.currentTarget.querySelector<HTMLElement>(`[data-value="${value}"]`)?.focus();
}

export function AppearancePanel({ id, anchorRef, onClose }: AppearancePanelProps): React.JSX.Element {
  const appearance = useAppearance();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) === true || anchorRef.current?.contains(target) === true) return;
      onClose(false);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') onClose(true);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchorRef, onClose]);

  const patternValues = patterns.map((pattern) => pattern.id);
  const themeValues = themeChoices.map((choice) => choice.id);

  return (
    <div aria-label="外观" className={styles.panel} id={id} ref={panelRef} role="dialog">
      <p className={styles.heading} id={`${id}-patterns`}>
        <span>纹样 · PATTERN</span>
        <span>{getPattern(appearance.pattern).en.toUpperCase()}</span>
      </p>
      <div
        aria-labelledby={`${id}-patterns`}
        className={styles.patterns}
        onKeyDown={(event) => handleRadioKeys<PatternID>(event, patternValues, appearance.pattern, appearance.setPattern)}
        role="radiogroup"
      >
        {patterns.map((pattern) => {
          const checked = pattern.id === appearance.pattern;
          return (
            <button
              aria-checked={checked}
              aria-label={`${pattern.name} ${pattern.en}`}
              className={styles.pattern}
              data-value={pattern.id}
              key={pattern.id}
              onClick={() => appearance.setPattern(pattern.id)}
              role="radio"
              tabIndex={checked ? 0 : -1}
              type="button"
            >
              {pattern.id === 'none' ? (
                <span className={styles.plain}>PLAIN</span>
              ) : (
                <PatternCanvas animated={appearance.animated} className={styles.preview} pattern={pattern.id} preview />
              )}
              <span className={styles.label}>
                {pattern.name}
                <small>{pattern.en}</small>
              </span>
            </button>
          );
        })}
      </div>

      <p className={styles.heading} id={`${id}-palettes`}>
        <span>色调 · PALETTE</span>
      </p>
      <div
        aria-labelledby={`${id}-palettes`}
        className={styles.palettes}
        onKeyDown={(event) =>
          handleRadioKeys<ThemePreference>(event, themeValues, appearance.themePreference, appearance.setThemePreference)
        }
        role="radiogroup"
      >
        {themeChoices.map((choice) => {
          const checked = choice.id === appearance.themePreference;
          return (
            <button
              aria-checked={checked}
              className={styles.palette}
              data-value={choice.id}
              key={choice.id}
              onClick={() => appearance.setThemePreference(choice.id)}
              role="radio"
              style={{ '--swatch-a': choice.background, '--swatch-b': choice.accent } as React.CSSProperties}
              tabIndex={checked ? 0 : -1}
              type="button"
            >
              <i aria-hidden="true" />
              {choice.name}
              <small>{choice.en}</small>
            </button>
          );
        })}
      </div>

      <label className={styles.control}>
        <span>纹样强度</span>
        <input
          max={maxPatternStrength}
          min={minPatternStrength}
          onChange={(event) => appearance.setStrength(Number(event.target.value))}
          type="range"
          value={appearance.strength}
        />
      </label>
      <div className={styles.control}>
        <span id={`${id}-motion`}>
          动态效果
          {appearance.reducedMotion ? <small>系统已开启“减少动态效果”，仅显示静态纹样</small> : null}
        </span>
        <button
          aria-checked={appearance.motion}
          aria-labelledby={`${id}-motion`}
          className={styles.switch}
          onClick={() => appearance.setMotion(!appearance.motion)}
          role="switch"
          type="button"
        />
      </div>
    </div>
  );
}
