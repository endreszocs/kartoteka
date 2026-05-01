'use client'

/**
 * AgeDistribution — korelosztás widget (Sprint O, 2026-04-25, v0.5.3).
 *
 * 5 korcsoportos vízszintes-bar megjelenítés a gyülekezet életkor-spektrumáról.
 * A szülő (home-page) `calculateAgeDistribution()`-tel számolja a counts-ot,
 * és átadja itt props-on. A widget tisztán prezentációs.
 *
 * Vizuális design (paritás Celebrations + UpcomingPrograms-szal):
 *   - card-raised háttér + finom blur-pötty dekoráció
 *   - Eyebrow ("Demográfia") + serif heading ("Korelosztás")
 *   - Csoportonként: címke + szám + arány-bar színkódolva
 *   - Üres állapotban: barátságos magyarázó szöveg
 */

import { BarChart3 } from 'lucide-react'

export interface AgeBucketEntry {
  label: string
  count: number
  /** Inkluzív minimum kor (a sortolásra). */
  min?: number
}

export interface AgeDistributionProps {
  buckets: AgeBucketEntry[]
}

const BUCKET_GRADIENTS = [
  'from-amber-400 to-amber-500',     // 0-14: gyermekek (sárgás)
  'from-emerald-400 to-emerald-500', // 15-29: fiatalok (zöld)
  'from-sky-400 to-sky-500',         // 30-49: felnőttek (kék)
  'from-violet-400 to-violet-500',   // 50-69: érettek (lila)
  'from-rose-400 to-rose-500',       // 70+: idősek (rózsa)
]

export function AgeDistribution({ buckets }: AgeDistributionProps) {
  const total = buckets.reduce((sum, b) => sum + b.count, 0)

  return (
    <div className="card-raised relative overflow-hidden p-5 sm:p-6">
      <div
        className="absolute -right-8 -top-8 h-32 w-32 rounded-full blur-3xl"
        style={{ background: 'color-mix(in oklab, var(--accent) 25%, transparent)' }}
      />
      <div
        className="absolute -left-6 bottom-0 h-24 w-24 rounded-full blur-3xl"
        style={{ background: 'color-mix(in oklab, var(--accent2) 22%, transparent)' }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-700/70">
              Demográfia
            </p>
            <h2 className="mt-1 font-heading text-xl text-slate-800 sm:text-2xl">
              Korelosztás
            </h2>
          </div>
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-white shadow-[0_14px_24px_-18px_rgba(0,0,0,0.45)]"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent))' }}
          >
            <BarChart3 className="size-4" />
          </span>
        </div>

        {total === 0 ? (
          <p className="mt-5 text-sm text-slate-500">
            Még nincs születési dátummal regisztrált tag a gyülekezetben — frissítés vagy új tag
            felvétele után jelennek meg az adatok.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {buckets.map((b, idx) => {
              const pct = total > 0 ? (b.count / total) * 100 : 0
              const gradient = BUCKET_GRADIENTS[idx] ?? BUCKET_GRADIENTS[BUCKET_GRADIENTS.length - 1]
              return (
                <div key={b.label}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate font-medium text-slate-700">{b.label}</span>
                    <span className="shrink-0 font-mono text-slate-500">
                      {b.count.toLocaleString('hu')}
                      <span className="ml-1 text-[10px] text-slate-400">
                        ({pct.toFixed(0)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-500`}
                      style={{ width: `${Math.max(pct, 1.5)}%` }}
                    />
                  </div>
                </div>
              )
            })}

            <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              Összesen <strong className="text-slate-700">{total.toLocaleString('hu')}</strong> regisztrált
              tag életkora alapján. Ismeretlen születési dátum esetén nem szerepel a megoszlásban.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
