import { X } from 'lucide-react'
import styles from './StatusBanner.module.css'

export type StatusBannerKind = 'degraded' | 'offline'

type StatusBannerProps = {
  kind: StatusBannerKind
  message: string
  onDismiss: () => void
}

export function StatusBanner({ kind, message, onDismiss }: StatusBannerProps): React.JSX.Element {
  return (
    <div className={styles.banner} data-kind={kind} role="alert">
      <span aria-hidden="true" className={styles.signal} />
      <span className={styles.label}>{kind === 'offline' ? 'OFFLINE' : 'DEGRADED'}</span>
      <p className={styles.message}>{message}</p>
      <button aria-label="关闭提示" className={styles.dismiss} onClick={onDismiss} type="button">
        <X aria-hidden="true" size={16} strokeWidth={1.8} />
      </button>
    </div>
  )
}
