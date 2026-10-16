import { PatternCanvas } from './PatternCanvas';
import { useAppearance } from './useAppearance';
import styles from './Backdrop.module.css';

/** Fixed atmospheric layer: ambient glow, the animated pattern and film grain. Never intercepts input. */
export function Backdrop(): React.JSX.Element {
  const { pattern, animated } = useAppearance();
  return (
    <div aria-hidden="true" className={styles.backdrop} data-backdrop>
      <div className={styles.ambient} />
      <PatternCanvas animated={animated} className={styles.canvas} pattern={pattern} />
      <div className={styles.grain} />
    </div>
  );
}
