'use client'

/**
 * Közös építőkövek a READ-ONLY, kategorizált, színes „Apple-beállítások"
 * stílusú adat-ablakokhoz.
 *
 * MIÉRT KÜLÖN FÁJL (egyházmegyei terv, 4.1): a „Gyülekezetünk adatai" ablak
 * (congregation-summary.tsx) és az új „Egyházmegyénk" ablak
 * (diocese-summary.tsx) UGYANEZT a megjelenést használja — közös komponens,
 * prop-alapú adatforrás, SOHA nem széthúzó másolat (a „második felület a
 * régi implementációt őrzi" hibaosztály ellen). Ide csak MEGJELENÍTŐ
 * primitívek kerülhetnek; adatforrás-specifikus logika a hívó ablakokban él.
 */

import { CopyButton } from '@/components/ui/copy-button'

export const SUMMARY_EMPTY = '—'

// ── Színpaletták kategóriánként (élénk, „apple settings" jelleg) ──────────────
// 2026-08-14 (4. pont): minden akcentus SÖTÉT variánst kapott — korábban a
// kártyafejlécek sötét módban világos pasztell sávok maradtak világos
// szöveggel (olvashatatlan), a színkódolás pedig élesben megsemmisült.
export type Accent = 'sky' | 'violet' | 'emerald' | 'amber' | 'teal' | 'rose' | 'indigo'
export const ACCENTS: Record<Accent, { chip: string; ring: string; title: string; head: string }> = {
  sky: { chip: 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300', ring: 'ring-sky-100 dark:ring-sky-400/20', title: 'text-sky-800 dark:text-sky-300', head: 'from-sky-50 to-white dark:from-sky-400/10 dark:to-transparent' },
  violet: { chip: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300', ring: 'ring-violet-100 dark:ring-violet-400/20', title: 'text-violet-800 dark:text-violet-300', head: 'from-violet-50 to-white dark:from-violet-400/10 dark:to-transparent' },
  emerald: { chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300', ring: 'ring-emerald-100 dark:ring-emerald-400/20', title: 'text-emerald-800 dark:text-emerald-300', head: 'from-emerald-50 to-white dark:from-emerald-400/10 dark:to-transparent' },
  amber: { chip: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300', ring: 'ring-amber-100 dark:ring-amber-400/20', title: 'text-amber-800 dark:text-amber-300', head: 'from-amber-50 to-white dark:from-amber-400/10 dark:to-transparent' },
  teal: { chip: 'bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300', ring: 'ring-teal-100 dark:ring-teal-400/20', title: 'text-teal-800 dark:text-teal-300', head: 'from-teal-50 to-white dark:from-teal-400/10 dark:to-transparent' },
  rose: { chip: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300', ring: 'ring-rose-100 dark:ring-rose-400/20', title: 'text-rose-800 dark:text-rose-300', head: 'from-rose-50 to-white dark:from-rose-400/10 dark:to-transparent' },
  indigo: { chip: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300', ring: 'ring-indigo-100 dark:ring-indigo-400/20', title: 'text-indigo-800 dark:text-indigo-300', head: 'from-indigo-50 to-white dark:from-indigo-400/10 dark:to-transparent' },
}

/** Kategória-kártya színes fejléccel. */
export function SummaryGroup({ icon, title, accent, children }: { icon: React.ReactNode; title: string; accent: Accent; children: React.ReactNode }) {
  const a = ACCENTS[accent]
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm ring-1 dark:border-slate-700 dark:bg-slate-900/60 ${a.ring}`}>
      <div className={`flex items-center gap-2.5 border-b border-slate-100 bg-gradient-to-r px-4 py-2.5 dark:border-slate-800 ${a.head}`}>
        <span className={`flex size-7 items-center justify-center rounded-xl shadow-sm ${a.chip}`}>{icon}</span>
        <h3 className={`text-[13px] font-bold uppercase tracking-wide ${a.title}`}>{title}</h3>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">{children}</div>
    </section>
  )
}

/** Egy címke–érték sor, opcionális másolás-gombbal és mailto/tel/https linkkel. */
export function SummaryRowLine({
  label, value, mono, copyText, copyLabel, href,
}: {
  label: string
  value?: React.ReactNode
  mono?: boolean
  /** 2026-08-14 (4. pont): ha megadott, másolás-gomb áll a sor végén. */
  copyText?: string
  copyLabel?: string
  /** mailto:/tel:/https link — telefonon ez a leggyakoribb művelet. */
  href?: string
}) {
  const empty = value == null || value === '' || value === SUMMARY_EMPTY
  // A hosszú, szóköz nélküli értékek (IBAN, adószám, e-mail) mobilon kilógtak
  // és levágódtak → min-w-0 + break-all a mono, break-words a szöveges értékekre.
  const valueClass = `min-w-0 text-right text-sm ${
    empty
      ? 'italic text-slate-300 dark:text-slate-600'
      : `font-semibold text-slate-800 dark:text-slate-100 ${mono ? 'break-all tabular-nums' : 'break-words'}`
  }`
  const inner = empty ? SUMMARY_EMPTY : value
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2.5">
      <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className="flex min-w-0 items-start gap-1">
        {href && !empty ? (
          <a href={href} className={`${valueClass} underline-offset-2 hover:underline`} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
            {inner}
          </a>
        ) : (
          <span className={valueClass}>{inner}</span>
        )}
        {copyText && !empty && <CopyButton value={copyText} label={copyLabel || label} className="-mr-1.5 -mt-0.5" />}
      </span>
    </div>
  )
}
