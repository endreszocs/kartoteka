import Image from 'next/image'
import { UsersRound } from 'lucide-react'
import type { PublicSiteAgeDistribution } from '@/lib/public-site/stats-loader'
import { getPublicVisualTheme } from '@/lib/public-site/visual-theme-registry'

interface PublicAgeDistributionProps {
  distribution: PublicSiteAgeDistribution
  themeKey?: string | null
}

export function PublicAgeDistribution({
  distribution,
  themeKey,
}: PublicAgeDistributionProps) {
  const visualTheme = getPublicVisualTheme(themeKey)
  const rows = [
    { label: '18 év alatt', value: distribution.under18 },
    { label: '18–35 év', value: distribution.age18To35 },
    { label: '36–59 év', value: distribution.age36To59 },
    { label: '60 év felett', value: distribution.age60Plus },
  ]

  return (
    <section className="public-section relative overflow-hidden">
      {visualTheme && (
        <Image
          src={visualTheme.assets.hero}
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-[0.07]"
          style={{ objectPosition: visualTheme.hero.backgroundPosition }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--public-soft) 92%, transparent), color-mix(in srgb, var(--public-surface) 94%, transparent))',
        }}
      />

      <div className="public-container relative">
        <div className="mx-auto grid max-w-5xl gap-8 rounded-[var(--public-radius)] border bg-[color-mix(in_srgb,var(--public-surface)_92%,transparent)] p-6 shadow-sm backdrop-blur-sm sm:p-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-12 lg:p-10">
          <div>
            <div
              className="mb-5 inline-flex size-12 items-center justify-center rounded-2xl text-white"
              style={{
                background:
                  'linear-gradient(135deg, var(--public-primary), color-mix(in srgb, var(--public-primary) 65%, var(--public-accent)))',
              }}
            >
              <UsersRound className="size-6" aria-hidden="true" />
            </div>
            <p
              className="mb-2 text-xs font-semibold uppercase tracking-[0.16em]"
              style={{ color: 'var(--public-accent-on-surface)' }}
            >
              Generációk együtt
            </p>
            <h2 className="mb-4" style={{ color: 'var(--public-ink)' }}>
              Közösségünk korosztályai
            </h2>
            <p className="text-sm leading-6" style={{ color: 'var(--public-muted)' }}>
              Gyülekezetünkben minden nemzedék otthonra talál. Az adatok kizárólag
              összesítve, adatvédelmi küszöb felett jelennek meg.
            </p>
          </div>

          <dl className="space-y-5" aria-label="Korosztályok megoszlása">
            {rows.map((row) => {
              const percentage = distribution.total > 0
                ? Math.round((row.value / distribution.total) * 100)
                : 0

              return (
                <div key={row.label}>
                  <div className="mb-2 flex items-baseline justify-between gap-4">
                    <dt className="text-sm font-semibold" style={{ color: 'var(--public-ink)' }}>
                      {row.label}
                    </dt>
                    <dd className="text-sm tabular-nums" style={{ color: 'var(--public-muted)' }}>
                      {row.value} fő · {percentage}%
                    </dd>
                  </div>
                  <div
                    className="h-2.5 overflow-hidden rounded-full"
                    style={{
                      backgroundColor:
                        'color-mix(in srgb, var(--public-primary) 10%, transparent)',
                    }}
                    role="progressbar"
                    aria-label={row.label}
                    aria-valuemin={0}
                    aria-valuemax={distribution.total}
                    aria-valuenow={row.value}
                    aria-valuetext={`${row.value} fő, ${percentage} százalék`}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${percentage}%`,
                        background:
                          'linear-gradient(90deg, var(--public-primary), var(--public-accent))',
                      }}
                      aria-hidden="true"
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
