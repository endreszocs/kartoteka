/**
 * ⚠️ 2026-08-11 — A `'use client'` DIREKTÍVA SZÁNDÉKOSAN NINCS ITT.
 *
 * ELŐZMÉNY (user-bejelentés): a `/notifications` oldal élesben 500-as
 * szerverhibát adott. Ok: ez a komponens `'use client'` volt, az oldal viszont
 * SZERVER-komponens, és `Icon={Bell}` formában egy FÜGGVÉNYT ad át neki.
 * A React szerver-komponensből nem enged függvényt átadni kliens-komponensnek:
 *   „Functions cannot be passed directly to Client Components…"
 * A böngésző ebből csak annyit mutatott: „A server error occurred" — a Next.js
 * produkciós módban elrejti a valódi üzenetet.
 *
 * MIÉRT EZ A JAVÍTÁS, ÉS NEM AZ, HOGY A HÍVÓK KERÜLJÉK KI:
 * ez a komponens TISZTA MEGJELENÍTÉS — nincs benne egyetlen hook, esemény-
 * kezelő vagy böngésző-API sem (ellenőrizve: useState/useEffect/useRef/useMemo/
 * onClick/onChange/useRouter — egyik sem szerepel). A `'use client'` tehát
 * fölösleges volt, és EZ okozta a hibát. Az eltávolítás EGYSZERRE javítja mind
 * az öt hívási helyet (/notifications és a négy publikus gyülekezeti oldal),
 * ahelyett hogy mindegyikbe külön kerülő megoldás kerülne.
 *
 * ⚠️ HA VALAHA interaktivitás kerülne ide (gomb, hook), akkor NEM a direktívát
 * kell visszatenni, hanem az interaktív részt kell külön, saját `'use client'`
 * gyerek-komponensbe emelni — különben ez a hiba azonnal visszatér.
 * Az `actions?: ReactNode` prop pont ezért ReactNode: a hívó adhat át KÉSZ,
 * saját kliens-komponenst, az szabályos.
 */

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface PageHeroProps {
  eyebrow?: string
  title: string
  description?: string
  Icon: LucideIcon
  actions?: ReactNode
  stats?: Array<{ label: string; value: string }>
}

export function PageHero({ eyebrow, title, description, Icon, actions, stats }: PageHeroProps) {
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] bg-card p-5 shadow-[0_36px_90px_-40px_rgba(14,52,48,0.38)] ring-1 ring-border sm:p-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.75rem]">
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--accent2) 30%, transparent)' }} />
        <div className="absolute -left-8 bottom-0 h-28 w-28 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--primary) 25%, transparent)' }} />
      </div>

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-[1.25rem] text-[var(--primary-foreground)] shadow-[0_20px_40px_-26px_rgba(15,74,66,0.55)] sm:size-16 sm:rounded-[1.35rem]" style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent))' }}>
            <Icon className="size-7" />
          </div>
          <div className="min-w-0">
            {eyebrow && (
              // ⚠️ 2026-08-11 (WCAG AA) — `text-teal-700/70` volt. Az alfa a
              //    hátteret keverte bele: VILÁGOSBAN 3,03:1 a kártyán, SÖTÉTBEN
              //    1,61:1 — utóbbi gyakorlatilag olvashatatlan. A `/70` miatt az
              //    osztálynév `text-teal-700\/70`, amire a kartoteka.css sötét
              //    rétegének `.text-teal-700` felülírása RÁ SEM ILLESZKEDIK,
              //    ezért sötét témában semmi nem mentette meg.
              //    A `text-primary` token mindkét témában átmegy: 4,93:1 / 5,17:1.
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                {eyebrow}
              </p>
            )}
            <h1 className="mt-1 font-serif text-[1.8rem] leading-[1.08] text-slate-800 sm:text-[2rem]">
              {title}
            </h1>
            {description && (
              <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-start">
            {actions}
          </div>
        )}
      </div>

      {stats && stats.length > 0 && (
        <div className="relative mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
          {stats.map((s) => (
            // ⚠️ 2026-08-11 (WCAG AA + sötét téma) — HÁROM JAVÍTÁS EGY CSEMPÉN:
            //    · `bg-white/85` → `bg-background/70`: token-alapú, tehát a
            //      sötét témát nem a kartoteka.css „hardkódolt fehér" mentőöve
            //      tartja életben;
            //    · `ring-white/70` → `ring-border`: a fehér gyűrűre a sötét
            //      réteg `border-white/70` szabálya NEM illeszkedik (az `ring-`,
            //      nem `border-`), ezért sötét témában világító keret maradt;
            //    · `text-slate-400` → `text-muted-foreground`: a címke 10 px,
            //      tehát NORMÁL szöveg, küszöb 4,5:1. A slate-400 a csempén
            //      2,47:1 volt (világos), a `muted-foreground` viszont MIND A
            //      HÁROM élő témában átmegy — kert 5,08/5,68 · parókia 4,95/5,68
            //      · zsoltáros 4,96/6,00 —, mert a P2 #24 kör pont ezért
            //      sötétítette be. A hierarchia így megmarad (a címke halványabb
            //      az értéknél), de olvasható.
            <div
              key={s.label}
              className="rounded-[1rem] bg-background/70 px-3 py-2 shadow-[0_14px_28px_-22px_rgba(15,74,66,0.35)] ring-1 ring-border"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {s.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
