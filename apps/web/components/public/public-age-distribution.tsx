import type { PublicSiteAgeDistribution } from '@/lib/public-site/stats-loader'

interface PublicAgeDistributionProps {
  distribution: PublicSiteAgeDistribution
  /** @deprecated 2026-08-10 — a téma-fotó háttér megszűnt. */
  themeKey?: string | null
}

/**
 * Korosztályi megoszlás.
 *
 * 2026-08-10 javítások:
 *  - a sávokról lekerült a `role="progressbar"` + `aria-value*` készlet. A
 *    progressbar ARIA-szerep folyamatban lévő műveletre való; itt állandó
 *    megoszlás-adatról van szó, amit a `<dt>/<dd>` páros amúgy is kimond —
 *    képernyőolvasóval minden érték kétszer hangzott el. A sáv innentől
 *    `aria-hidden` dekoráció.
 *  - eltűnt a gradienssel töltött ikoncsempe és a témafotós háttér.
 */
export function PublicAgeDistribution({
  distribution,
}: PublicAgeDistributionProps) {
  const rows = [
    { label: '18 év alatt', value: distribution.under18 },
    { label: '18–35 év', value: distribution.age18To35 },
    { label: '36–59 év', value: distribution.age36To59 },
    { label: '60 év felett', value: distribution.age60Plus },
  ]

  return (
    <section
      className="public-section"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--public-soft) 45%, transparent)',
      }}
    >
      <div className="public-container">
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div>
            <p className="public-eyebrow">Generációk együtt</p>
            <h2 className="mt-3" style={{ color: 'var(--public-ink)' }}>
              Közösségünk korosztályai
            </h2>
            <span aria-hidden="true" className="public-rule-start public-rule my-5" />
            <p className="text-sm leading-7" style={{ color: 'var(--public-muted)' }}>
              Gyülekezetünkben minden nemzedék otthonra talál. Az adatok kizárólag
              összesítve, adatvédelmi küszöb felett jelennek meg.
            </p>
          </div>

          <dl className="space-y-6" aria-label="Korosztályok megoszlása">
            {rows.map((row) => {
              const percentage =
                distribution.total > 0
                  ? Math.round((row.value / distribution.total) * 100)
                  : 0

              return (
                <div key={row.label}>
                  <div className="mb-2 flex items-baseline justify-between gap-4">
                    <dt
                      className="text-sm font-semibold"
                      style={{ color: 'var(--public-ink)' }}
                    >
                      {row.label}
                    </dt>
                    <dd
                      className="text-sm tabular-nums"
                      style={{ color: 'var(--public-muted)' }}
                    >
                      {row.value} fő · {percentage}%
                    </dd>
                  </div>
                  <div
                    aria-hidden="true"
                    className="h-1.5 overflow-hidden rounded-full"
                    style={{
                      backgroundColor:
                        'color-mix(in srgb, var(--public-ink) 8%, transparent)',
                    }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${percentage}%`,
                        background:
                          'linear-gradient(90deg, var(--public-primary), var(--public-accent))',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </dl>
        </div>
      </div>
    </section>
  )
}
