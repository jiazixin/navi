import { ArrowUpRight } from 'lucide-react'
import type { CatalogLink } from '../../app/api/catalog'
import { iconSource, navigationHref } from '../../app/api/routes'
import { LinkIcon } from '../../components/LinkIcon'
import styles from './LinkCard.module.css'

type LinkCardProps = {
  link: CatalogLink
  host: string
  order: number
  iconVersion?: number | undefined
}

export function LinkCard({ link, host, order, iconVersion }: LinkCardProps): React.JSX.Element {
  return (
    <a
      aria-label={`打开 ${link.name}`}
      className={styles.card}
      href={navigationHref(link.runtime_id)}
      rel="noreferrer"
      data-order={Math.min(order, 16)}
      target="_blank"
      title={host.length > 0 ? `${link.name} — ${host}` : link.name}
    >
      <LinkIcon name={link.name} src={iconSource(link.runtime_id, iconVersion)} />
      <span className={styles.copy}>
        <span className={styles.name}>
          <span className={styles.nameText}>{link.name}</span>
          {link.private_url === undefined ? null : <span className={styles.tag}>内网</span>}
        </span>
        <span className={styles.description}>{link.description ?? host}</span>
        {host.length > 0 ? <span className={styles.host}>{host}</span> : null}
      </span>
      <ArrowUpRight aria-hidden="true" className={styles.arrow} size={18} strokeWidth={1.8} />
    </a>
  )
}
