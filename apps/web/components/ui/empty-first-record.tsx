'use client'

/**
 * EmptyFirstRecord — egységes „Rögzítsd az első…" üres-állapot / üdvözlő modul.
 *
 * Akkor jelenik meg, ha egy modulban (tagnyilvántartás, anyakönyv, pénzügy,
 * iktató, leltár, sírhelyek, munkanapló, jegyzőkönyvek, …) még nincs egyetlen
 * bejegyzés sem. Barátságos, pásztori hangvételű, egy határozott elsődleges
 * CTA-val (pl. „Rögzítsd az első tagot"), opcionális másodlagos akcióval
 * (pl. Excel-import) és tipp-sávval.
 *
 * Design: a `card-raised` + lágy gradient-glow az ikon mögött, a dashboard
 * üdvözlő-overlay vizuális nyelvén. Akcentus-szín modulonként választható.
 */

import type { ElementType, ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'

export type EmptyAccent = 'teal' | 'indigo' | 'amber' | 'emerald' | 'rose' | 'sky' | 'violet'

interface AccentStyle {
  badge: string
  glow: string
  btn: string
}

/**
 * 2026-08-11 (P2 #22) — a CTA-háttér 600-ról 700-ra váltott.
 *
 * A gomb felirata `text-white`, 14px, font-semibold — ez a WCAG szerint NEM
 * „large text", tehát 4,5:1 kell. A Tailwind 4 alap-palettáján mérve fehér
 * szöveggel a 600-as árnyalatok megbuktak: amber-600 3,19:1, teal-600 3,66:1,
 * emerald-600 3,67:1, sky-600 4,02:1 (csak rose 4,51, violet 5,88 és
 * indigo 6,44 felelt meg). A 700-as árnyalatokkal mind megfelel:
 * amber-700 5,05:1, teal-700 5,39:1, emerald-700 5,37:1, sky-700 5,85:1,
 * rose-700 6,06:1, violet-700 7,29:1, indigo-700 8,07:1. A hover 800-as lett
 * (7,13–10,09:1), így a lenyomott állapot is olvasható marad.
 *
 * Miért fontos: ez az a gomb, amit egy új gyülekezet a leltárban, a
 * sírhelyeknél, a pénzügyben, a tagnyilvántartásban és az iktatóban legelőször
 * lát — idősebb lelkész, gyakran telefonon, változó fényviszonyok között.
 * Az ikon-badge (`bg-*-50` + `text-*-600`) maradhat: 32px-es grafikus elem,
 * ott a 3:1 az elvárás, és a leggyengébb (amber) is 3,08:1.
 */
const ACCENTS: Record<EmptyAccent, AccentStyle> = {
  teal: { badge: 'bg-teal-50 text-teal-600', glow: 'from-teal-200/50', btn: 'bg-teal-700 hover:bg-teal-800' },
  indigo: { badge: 'bg-indigo-50 text-indigo-600', glow: 'from-indigo-200/50', btn: 'bg-indigo-700 hover:bg-indigo-800' },
  amber: { badge: 'bg-amber-50 text-amber-600', glow: 'from-amber-200/50', btn: 'bg-amber-700 hover:bg-amber-800' },
  emerald: { badge: 'bg-emerald-50 text-emerald-600', glow: 'from-emerald-200/50', btn: 'bg-emerald-700 hover:bg-emerald-800' },
  rose: { badge: 'bg-rose-50 text-rose-600', glow: 'from-rose-200/50', btn: 'bg-rose-700 hover:bg-rose-800' },
  sky: { badge: 'bg-sky-50 text-sky-600', glow: 'from-sky-200/50', btn: 'bg-sky-700 hover:bg-sky-800' },
  violet: { badge: 'bg-violet-50 text-violet-600', glow: 'from-violet-200/50', btn: 'bg-violet-700 hover:bg-violet-800' },
}

interface EmptyFirstRecordProps {
  /** A modul ikonja (lucide). */
  icon: ElementType
  /** Cím — pl. „Még nincs egyetlen gyülekezeti tag sem". */
  title: string
  /** Leírás — barátságos, egy-két mondat. */
  description: string
  /** Elsődleges CTA felirata — pl. „Rögzítsd az első tagot". */
  ctaLabel: string
  /** CTA kattintás (pl. új-dialógus nyitása). `ctaHref`-fel kölcsönösen kizáró. */
  onCta?: () => void
  /** CTA mint link (navigáció). Ha megadva, Link renderelődik. */
  ctaHref?: string
  /** Másodlagos akció felirata — pl. „Importálás Excelből". */
  secondaryLabel?: string
  /** Másodlagos akció kattintása. */
  onSecondary?: () => void
  /** Akcentus-szín (modulonként). Default: 'teal'. */
  accent?: EmptyAccent
  /** Extra tartalom a gombok alá (pl. tipp-sáv). */
  children?: ReactNode
  /** Külső osztály a wrapper-hez. */
  className?: string
}

export function EmptyFirstRecord({
  icon: Icon,
  title,
  description,
  ctaLabel,
  onCta,
  ctaHref,
  secondaryLabel,
  onSecondary,
  accent = 'teal',
  children,
  className,
}: EmptyFirstRecordProps) {
  const a = ACCENTS[accent]

  return (
    <div
      className={`card-raised relative overflow-hidden px-6 py-12 text-center sm:px-10 sm:py-16 ${className ?? ''}`}
    >
      {/* Lágy háttér-glow */}
      <div
        aria-hidden
        className={`pointer-events-none absolute left-1/2 top-0 size-72 -translate-x-1/2 -translate-y-1/3 rounded-full bg-gradient-to-br ${a.glow} via-transparent to-transparent blur-3xl`}
      />

      <div className="relative mx-auto flex max-w-md flex-col items-center">
        {/* Ikon-badge */}
        <div className={`flex size-16 items-center justify-center rounded-2xl ${a.badge} shadow-sm`}>
          <Icon className="size-8" strokeWidth={1.7} />
        </div>

        <h3 className="mt-5 font-heading text-xl text-slate-800 sm:text-2xl">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>

        {/* Akciók */}
        <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          {ctaHref ? (
            <Link
              href={ctaHref}
              className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition ${a.btn}`}
            >
              <Plus className="size-4" strokeWidth={2.2} />
              {ctaLabel}
              <ArrowRight className="size-4" strokeWidth={2} />
            </Link>
          ) : (
            <Button
              size="lg"
              onClick={onCta}
              className={`gap-2 rounded-xl font-semibold text-white ${a.btn}`}
            >
              <Plus className="size-4" strokeWidth={2.2} />
              {ctaLabel}
              <ArrowRight className="size-4" strokeWidth={2} />
            </Button>
          )}

          {secondaryLabel && onSecondary && (
            <Button
              size="lg"
              variant="outline"
              onClick={onSecondary}
              className="gap-2 rounded-xl font-medium"
            >
              {secondaryLabel}
            </Button>
          )}
        </div>

        {children && <div className="mt-6 w-full">{children}</div>}
      </div>
    </div>
  )
}
