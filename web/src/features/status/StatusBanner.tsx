import { CheckCircle2, CloudOff, TriangleAlert, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { motionTokens } from '../../motion/tokens';
import { IconButton } from '../../shared/ui/IconButton';
import styles from './StatusBanner.module.css';

export type StatusBannerKind = 'degraded' | 'offline' | 'restored';

type StatusBannerProps = {
  kind: StatusBannerKind;
  message: string;
  onDismiss: () => void;
};

export function StatusBanner({ kind, message, onDismiss }: StatusBannerProps): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const Icon = kind === 'restored' ? CheckCircle2 : kind === 'offline' ? CloudOff : TriangleAlert;

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={styles.banner}
      data-kind={kind}
      exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
      initial={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
      role={kind === 'restored' ? 'status' : 'alert'}
      transition={{ duration: reduceMotion ? motionTokens.instant : motionTokens.standard }}
    >
      <Icon aria-hidden="true" className={styles.statusIcon} size={18} strokeWidth={1.8} />
      <p>{message}</p>
      <IconButton className={styles.dismiss} label="关闭状态提示" onClick={onDismiss} tooltipAlign="end">
        <X aria-hidden="true" size={18} strokeWidth={1.8} />
      </IconButton>
    </motion.div>
  );
}
