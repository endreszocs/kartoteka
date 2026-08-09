import type { PublicSiteData } from '@/lib/public-site/site-loader'

import styles from './public-home-stats.module.css'

interface PublicHomeStatsProps {
  site: PublicSiteData
  stats: { members: number; presbyters: number; families: number }
}

/**
 * „Közösségünk számokban" — 2026-08-10-i újratervezés.
 *
 * Korábban ez 70 sornyi, kártyánként megismételt inline stílus volt a
 * kezdőlapon, benne HALOTT `transition: transform .3s` deklarációkkal:
 * inline stílusból nincs `:hover`, és nem volt sem hover-handler, sem
 * CSS-osztály — az átmenet sosem futott le. Most CSS-modul, valódi
 * interakcióval, gradienssel töltött ikoncsempék nélkül: a szám maga a
 * vizuál, display-serifben.
 *
 * A számok szűk, aggregált RPC-ből jönnek; nincs publikus base-table olvasás.
 */
export function PublicHomeStats({ site, stats }: PublicHomeStatsProps) {
  const items = [
    site.show_member_count
      ? { key: 'members', value: stats.members, label: 'Aktív gyülekezeti tag' }
      : null,
    site.show_presbyter_count
      ? { key: 'presbyters', value: stats.presbyters, label: 'Presbiter' }
      : null,
    site.show_family_count
      ? { key: 'families', value: stats.families, label: 'Család' }
      : null,
  ].filter((item): item is { key: string; value: number; label: string } =>
    Boolean(item),
  )

  if (items.length === 0) return null

  return (
    <section className={`public-section-tight ${styles.section}`}>
      <div className="public-container">
        <p className={`public-eyebrow ${styles.eyebrow}`}>
          Közösségünk számokban
        </p>

        <dl className={styles.grid}>
          {items.map((item) => (
            <div key={item.key} className={styles.item}>
              <dd className={styles.value}>
                {new Intl.NumberFormat('hu-HU').format(item.value)}
              </dd>
              <dt className={styles.label}>{item.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
