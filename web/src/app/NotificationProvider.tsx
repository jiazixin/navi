import { useState, type ReactNode } from 'react'
import { NotificationContext } from './notifications'
import styles from './NotificationProvider.module.css'

type NotificationProviderProps = { children: ReactNode }

export function NotificationProvider({ children }: NotificationProviderProps): React.JSX.Element {
  const [message, setMessage] = useState('')
  return (
    <NotificationContext value={setMessage}>
      {children}
      <div role="status" aria-live="polite" className={message === '' ? undefined : styles.toast}>
        {message}
        {message === '' ? null : (
          <button type="button" onClick={() => setMessage('')} aria-label="关闭通知">
            关闭
          </button>
        )}
      </div>
    </NotificationContext>
  )
}
