import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motionTokens } from '../../styles/motion';
import styles from './LinkIcon.module.css';

type LinkIconProps = {
  name: string;
  runtimeId: string;
  iconURL?: string;
};

function getMonogram(name: string): string {
  const firstCharacter = Array.from(name.trim())[0];
  return firstCharacter?.toLocaleUpperCase() ?? '?';
}

export function LinkIcon({ name, runtimeId, iconURL }: LinkIconProps): React.JSX.Element {
  const [imageState, setImageState] = useState<'pending' | 'loaded' | 'error'>('pending');
  const reduceMotion = useReducedMotion();

  return (
    <span className={styles.frame} data-state={imageState} aria-hidden="true">
      <span className={styles.monogram}>{getMonogram(name)}</span>
      {imageState !== 'error' ? (
        <motion.img
          animate={{ opacity: imageState === 'loaded' ? 1 : 0, scale: imageState === 'loaded' ? 1 : 0.94 }}
          className={styles.image}
          initial={false}
          onError={() => setImageState('error')}
          onLoad={() => setImageState('loaded')}
          src={iconURL ?? `/api/icons/${encodeURIComponent(runtimeId)}`}
          transition={{ duration: reduceMotion ? motionTokens.instant : motionTokens.favicon }}
        />
      ) : null}
    </span>
  );
}
