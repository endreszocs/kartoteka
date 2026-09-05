'use client'

/**
 * EGY ÜZENET-BUBORÉK A SZÁLBAN (2026-09-05).
 *
 * A régi csengő-kártya (`NotificationCard`) és az oldal `UzenetKartya`-ja
 * EGY komponensbe olvadt: két másolat ugyanarra a sorra két különböző
 * viselkedést adott (a csengő némán írt a kliens-Supabase-be, az oldal
 * fail-closed szerver-akcióval). Mostantól minden művelet a szülő
 * (`ErtesitesInbox`) kezelőin át megy, és mind szerver-akció.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * OLVASOTTÁ JELÖLÉS LÁTHATÓSÁGRA, NEM KATTINTÁSRA (D5)
 * ════════════════════════════════════════════════════════════════════════════
 * A régi lista a kibontással EGYIDEJŰLEG jelölt olvasottnak — és a „Csak
 * olvasatlan" szűrő azonnal kidobta a kártyát a lelkész keze alól. Az
 * `IntersectionObserver` (threshold 0.5, egyszer, csak olvasatlan soron) a
 * mobilon is működő megoldás: ha a buborék legalább félig látszik, elolvasták.
 * A szülő gondoskodik róla, hogy a most jelölt sor a szűrőben bent maradjon.
 *
 * Elem-azonosító: `uzenet-<sor.id>` — DB-azonosító, a `?uzenet=` mélylink és a
 * csengő-kattintás ide görget. React-kulcs SOHA nem gépelt tartalomból.
 */

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  CheckCircle2,
  Inbox,
  MailCheck,
  MoreHorizontal,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { valaszraVarE } from '@/lib/notifications/beszelgetesek'
import type { UzenetSor } from '@/lib/notifications/uzenetek-shared'
import { BUKARESTI_ZONA_FELIRAT, huIdopontBukarest, huOraPercBukarest } from '@/lib/utils/idopont-bukarest'
import { cn } from '@/lib/utils'

import { getTypeVisual, notificationLink } from './ertesites-vizualis'
import { UzenetTorzs } from './uzenet-torzs'

export interface UzenetMuveletek {
  /** A buborék legalább félig látszik ÉS olvasatlan — a szülő jelöli olvasottnak. */
  onLathato: (id: string) => void
  onOlvasott: (id: string) => void
  onOlvasatlan: (id: string) => void
  onArchival: (id: string) => void
  onVisszaallit: (id: string) => void
  onJovahagy: (adminRequestId: string) => void
  onElutasit: (adminRequestId: string) => void
}

export function UzenetBuborek({
  sor,
  fut,
  kiemelt,
  muveletek,
}: {
  sor: UzenetSor
  fut: boolean
  /** A `?uzenet=<id>` mélylink erre a buborékra mutat — kiemelt keret. */
  kiemelt: boolean
  muveletek: UzenetMuveletek
}) {
  const visual = getTypeVisual(sor.tipus)
  const link = notificationLink(sor.hivatkozas)
  const valaszraVar = valaszraVarE(sor)

  // ── Láthatóságra olvasottnak (threshold 0.5, egyszer, csak olvasatlan) ──
  const elemRef = useRef<HTMLElement | null>(null)
  const { onLathato } = muveletek
  useEffect(() => {
    if (sor.olvasva || sor.archived) return
    const elem = elemRef.current
    if (!elem || typeof IntersectionObserver === 'undefined') return
    const figyelo = new IntersectionObserver(
      (bejegyzesek) => {
        if (bejegyzesek.some((b) => b.isIntersecting)) {
          figyelo.disconnect()
          onLathato(sor.id)
        }
      },
      { threshold: 0.5 },
    )
    figyelo.observe(elem)
    return () => figyelo.disconnect()
  }, [sor.id, sor.olvasva, sor.archived, onLathato])

  return (
    <article
      id={`uzenet-${sor.id}`}
      ref={elemRef}
      aria-label={sor.cim}
      className={cn(
        'group relative max-w-[min(42rem,92%)] rounded-2xl rounded-tl-md border px-4 py-3 transition-colors',
        sor.olvasva ? 'border-border/70 bg-secondary/60' : 'border-primary/35 bg-secondary/80',
        sor.archived && 'opacity-80',
        kiemelt && 'ring-2 ring-primary/50',
      )}
    >
      {/* ── Fej: cím + típus-pill + Megoldva + olvasatlan-pötty + menü ── */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className={cn('text-sm leading-snug text-foreground', sor.olvasva ? 'font-semibold' : 'font-bold')}>
            {sor.cim}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
            <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 font-medium', visual.pill)}>
              {visual.label}
            </span>
            {sor.megoldva ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-3" aria-hidden />
                Megoldva
              </span>
            ) : null}
            {valaszraVar ? (
              <span className="inline-flex items-center rounded-full bg-amber-500/14 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                Válaszra vár
              </span>
            ) : null}
            {sor.congregationNev ? (
              <span className="truncate text-muted-foreground">· {sor.congregationNev}</span>
            ) : null}
          </div>
        </div>

        {!sor.olvasva && !sor.archived ? (
          <span aria-label="Olvasatlan" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary ring-2 ring-primary/20" />
        ) : null}

        {/* Buborék-menü — 44 px, MINDIG látható (telefonon nincs hover). */}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Üzenet-műveletek"
            disabled={fut}
            className="-mr-2 -mt-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            {sor.archived ? (
              <DropdownMenuItem className="min-h-11" onSelect={() => muveletek.onVisszaallit(sor.id)}>
                <ArchiveRestore className="size-4" aria-hidden />
                Vissza az archívumból
              </DropdownMenuItem>
            ) : (
              <>
                {sor.olvasva ? (
                  <DropdownMenuItem className="min-h-11" onSelect={() => muveletek.onOlvasatlan(sor.id)}>
                    <Inbox className="size-4" aria-hidden />
                    Olvasatlanra
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="min-h-11" onSelect={() => muveletek.onOlvasott(sor.id)}>
                    <MailCheck className="size-4" aria-hidden />
                    Olvasottnak jelölés
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="min-h-11" onSelect={() => muveletek.onArchival(sor.id)}>
                  <Archive className="size-4" aria-hidden />
                  Archiválás
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── „A baj elmúlt" zöld sáv ── */}
      {sor.megoldva ? (
        <p className="mt-2.5 flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm leading-relaxed text-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden />
          <span className="min-w-0 flex-1">
            <strong>Ez a baj azóta elmúlt.</strong>
            {sor.megoldasUzenet ? ` ${sor.megoldasUzenet}` : ''}
            {sor.megoldvaAt ? ` (${huIdopontBukarest(sor.megoldvaAt, 'short')} — ${BUKARESTI_ZONA_FELIRAT})` : ''}
          </span>
        </p>
      ) : null}

      {/* ── Törzs ── */}
      {sor.uzenet || sor.uzenetHtml ? <UzenetTorzs sor={sor} className="mt-2" /> : null}

      {/* ── Műveletsor: Megnyitás gomb + döntés ── */}
      {link || valaszraVar ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {link ? (
            link.external ? (
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                Megnyitás
                <ArrowUpRight className="size-4" aria-hidden />
              </a>
            ) : (
              <Link
                href={link.href}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                Megnyitás
                <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            )
          ) : null}

          {valaszraVar && sor.adminRequestId ? (
            <>
              <Button
                type="button"
                disabled={fut}
                onClick={() => muveletek.onJovahagy(sor.adminRequestId as string)}
                className="min-h-11"
              >
                Jóváhagyás
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={fut}
                onClick={() => muveletek.onElutasit(sor.adminRequestId as string)}
                className="min-h-11"
              >
                Elutasítás
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {/* ── Láb: pontos idő (Bukarest) ── */}
      <footer className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
        <time dateTime={sor.createdAt} title={`${huIdopontBukarest(sor.createdAt, 'long')} — ${BUKARESTI_ZONA_FELIRAT}`} className="tabular-nums">
          {huOraPercBukarest(sor.createdAt)}
        </time>
        {sor.readAt ? (
          <span title={`Olvasva: ${huIdopontBukarest(sor.readAt, 'short')}`} className="inline-flex items-center gap-1">
            <MailCheck className="size-3" aria-hidden />
            olvasva
          </span>
        ) : null}
        {sor.archived ? <span>· archivált</span> : null}
      </footer>
    </article>
  )
}
