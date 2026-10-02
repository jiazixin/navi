import { memo, useEffect, useRef, useState } from 'react';
import { ExternalLink, LoaderCircle } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { motionTokens } from '../../styles/motion';
import type { CatalogLink } from '../../app/api/catalog';
import { LinkIcon } from './LinkIcon';
import styles from './LinkCard.module.css';

type LinkCardProps = {
  link: CatalogLink;
  enableLayoutMotion?: boolean;
  iconURL?: string;
};

function getHostname(link: CatalogLink): string {
  const candidate = link.publicUrl ?? link.privateUrl;
  if (candidate === undefined) {
    return link.name;
  }

  try {
    return new URL(candidate).hostname;
  } catch {
    return link.name;
  }
}

export const LinkCard = memo(function LinkCard({ link, enableLayoutMotion = true, iconURL }: LinkCardProps): React.JSX.Element {
  const [opening, setOpening] = useState(false);
  const openingTimer = useRef<number | undefined>(undefined);
  const reduceMotion = useReducedMotion();
  const secondaryText = link.description ?? getHostname(link);

  useEffect(() => () => window.clearTimeout(openingTimer.current), []);

  function handleClick(): void {
    setOpening(true);
    window.clearTimeout(openingTimer.current);
    openingTimer.current = window.setTimeout(() => setOpening(false), 800);
  }

  return (
    <motion.a
      aria-label={`打开 ${link.name}`}
      className={styles.card}
      data-opening={opening ? 'true' : 'false'}
      animate={
        reduceMotion
          ? { opacity: 1 }
          : {
              opacity: 1,
              scale: 1,
              transition: { duration: motionTokens.favicon, ease: [0.22, 1, 0.36, 1] },
            }
      }
      exit={
        reduceMotion
          ? { opacity: 0, transition: { duration: motionTokens.instant } }
          : {
              opacity: 0,
              scale: 0.98,
              transition: { duration: motionTokens.fast, ease: [0.4, 0, 1, 1] },
            }
      }
      href={`/go/${encodeURIComponent(link.runtimeId)}`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
      layout={enableLayoutMotion && !reduceMotion ? 'position' : false}
      onClick={handleClick}
      rel="noreferrer"
      target="_blank"
      transition={
        reduceMotion ? { duration: motionTokens.instant } : { layout: motionTokens.spring }
      }
    >
      <span className={styles.iconSlot}>
        <LinkIcon
          key={iconURL ?? link.runtimeId}
          {...(iconURL === undefined ? {} : { iconURL })}
          name={link.name}
          runtimeId={link.runtimeId}
        />
      </span>
      <span className={styles.copy}>
        <span className={styles.title} title={link.name}>
          {link.name}
        </span>
        <span className={styles.secondary} title={secondaryText}>
          {secondaryText}
        </span>
      </span>
      <span className={styles.trailing} aria-hidden="true">
        {opening ? (
          <LoaderCircle className={styles.spinner} size={17} strokeWidth={1.8} />
        ) : (
          <ExternalLink size={17} strokeWidth={1.7} />
        )}
      </span>
    </motion.a>
  );
});
