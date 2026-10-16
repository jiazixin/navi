import { useState } from 'react';
import { hueOf, monogramOf } from './monogram';
import styles from './LinkIcon.module.css';

type LinkIconProps = {
  name: string;
  /** Favicon URL; changing it (e.g. a new cache version) retries after an earlier failure. */
  src: string;
  size?: 'regular' | 'small';
};

function iconState(loaded: boolean | null): 'pending' | 'loaded' | 'fallback' {
  if (loaded === null) return 'pending';
  return loaded ? 'loaded' : 'fallback';
}

function IconImage({ src, onLoad }: { src: string; onLoad: (loaded: boolean) => void }): React.JSX.Element {
  return (
    <img
      alt=""
      className={styles.image}
      decoding="async"
      loading="lazy"
      onError={() => onLoad(false)}
      onLoad={() => onLoad(true)}
      src={src}
    />
  );
}

export function LinkIcon({ name, src, size = 'regular' }: LinkIconProps): React.JSX.Element {
  const [state, setState] = useState<{ src: string; loaded: boolean | null }>({ src, loaded: null });
  const loaded = state.src === src ? state.loaded : null;

  return (
    <span
      aria-hidden="true"
      className={styles.tile}
      data-size={size}
      data-state={iconState(loaded)}
      style={{ '--hue': hueOf(name) } as React.CSSProperties}
    >
      <span className={styles.monogram}>{monogramOf(name)}</span>
      {loaded === false ? null : (
        <IconImage key={src} onLoad={(result) => setState({ src, loaded: result })} src={src} />
      )}
    </span>
  );
}
