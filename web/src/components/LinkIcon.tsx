import { useState } from 'react'
import { monogramOf } from './monogram'
import styles from './LinkIcon.module.css'

type LinkIconProps = {
  name: string
  /** Favicon URL; changing it (e.g. a new cache version) retries after an earlier failure. */
  src: string
  size?: 'regular' | 'small'
}

function iconState(isLoaded: boolean | null): 'pending' | 'loaded' | 'fallback' {
  if (isLoaded === null) return 'pending'
  return isLoaded ? 'loaded' : 'fallback'
}

type IconImageProps = { src: string; onSettle: (isLoaded: boolean) => void }

function IconImage({ src, onSettle }: IconImageProps): React.JSX.Element {
  return (
    <img
      alt=""
      className={styles.image}
      decoding="async"
      loading="lazy"
      onError={() => onSettle(false)}
      onLoad={() => onSettle(true)}
      src={src}
    />
  )
}

export function LinkIcon({ name, src, size = 'regular' }: LinkIconProps): React.JSX.Element {
  const [state, setState] = useState<{ src: string; isLoaded: boolean | null }>({
    src,
    isLoaded: null,
  })
  const isLoaded = state.src === src ? state.isLoaded : null

  return (
    <span
      aria-hidden="true"
      className={styles.tile}
      data-size={size}
      data-state={iconState(isLoaded)}
    >
      <span className={styles.monogram}>{monogramOf(name)}</span>
      {isLoaded === false ? null : (
        <IconImage
          key={src}
          onSettle={(isResult) => setState({ src, isLoaded: isResult })}
          src={src}
        />
      )}
    </span>
  )
}
