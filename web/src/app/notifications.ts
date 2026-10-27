import { createContext, useContext } from 'react'

export const NotificationContext = createContext<((message: string) => void) | null>(null)

/** Sends one accessible application notification, replacing the previous one. */
export function useNotify() {
  const notify = useContext(NotificationContext)
  if (notify === null) throw new Error('useNotify requires NotificationProvider')
  return notify
}
