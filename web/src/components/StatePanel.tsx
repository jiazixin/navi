import type { ReactNode } from 'react'
import styles from './StatePanel.module.css'

type StatePanelProps = {
  role?: 'alert' | 'status'
  eyebrow: string
  title: string
  description: string
  children?: ReactNode
  headingLevel?: 1 | 2
}

/** Centered empty, failure and recovery message with optional actions. */
export function StatePanel({
  role,
  eyebrow,
  title,
  description,
  children,
  headingLevel = 2,
}: StatePanelProps): React.JSX.Element {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <section role={role} className={styles.panel} aria-label={title}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <Heading className={styles.title}>{title}</Heading>
      <p className={styles.description}>{description}</p>
      {children === undefined ? null : <div className={styles.actions}>{children}</div>}
    </section>
  )
}
