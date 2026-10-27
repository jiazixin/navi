import { useEffect } from 'react'
import { RotateCcw } from 'lucide-react'
import { BrandMark } from '../../components/BrandMark'
import { StatePanel } from '../../components/StatePanel'
import { Backdrop } from '../appearance'
import styles from './NavigationFailure.module.css'

type NavigationFailureProps = {
  message: string
  retryPath: string
}

export function NavigationFailure({
  message,
  retryPath,
}: NavigationFailureProps): React.JSX.Element {
  useEffect(() => {
    const previousTitle = document.title
    document.title = `${message} · Navi`
    return () => {
      document.title = previousTitle
    }
  }, [message])

  return (
    <div className={styles.page}>
      <Backdrop />
      <main className={styles.layout}>
        <a aria-label="返回 Navi 首页" className={styles.brand} href="/">
          <BrandMark />
          <span>NAVI</span>
        </a>
        <StatePanel
          description="暂时无法连接到目标站点，请稍后重试。"
          eyebrow="UNREACHABLE"
          headingLevel={1}
          title={message}
        >
          <a href={retryPath}>
            <RotateCcw aria-hidden="true" size={16} strokeWidth={1.8} />
            重试访问
          </a>
          <a href="/">返回导航</a>
        </StatePanel>
      </main>
    </div>
  )
}
