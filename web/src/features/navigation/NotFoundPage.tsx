import { BrandMark } from '../../components/BrandMark'
import { StatePanel } from '../../components/StatePanel'
import { Backdrop } from '../appearance'
import styles from './NavigationFailure.module.css'

export function NotFoundPage(): React.JSX.Element {
  return (
    <div className={styles.page}>
      <Backdrop />
      <main className={styles.layout}>
        <a aria-label="返回 Navi 首页" className={styles.brand} href="/">
          <BrandMark />
          <span>NAVI</span>
        </a>
        <StatePanel
          role="alert"
          eyebrow="NOT FOUND"
          headingLevel={1}
          title="页面不存在"
          description="请检查地址，或返回首页继续浏览。"
        >
          <a href="/">返回首页</a>
        </StatePanel>
      </main>
    </div>
  )
}
