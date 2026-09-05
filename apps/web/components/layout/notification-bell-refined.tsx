'use client'

/**
 * Header — értesítés-csengő és üzenet-panel.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 2026-09-05 — ÁTÍRÁS SZERVER-AKCIÓRA, FELADÓ-AVATARRAL (D3)
 * ════════════════════════════════════════════════════════════════════════════
 * Ami MARADT: a csengő gomb, a jelvény, a `bell-shake` / `badge-pulse`
 * animáció (csak valóban új üzenetnél), az overlay + Escape, a panel-fejléc,
 * az „Összes olvasottnak jelölése", a lábléc.
 *
 * Ami VÁLTOZOTT, és miért:
 *   · ADATFORRÁS: `listFrissErtesitesekAction()` — a panel NEM olvas többé
 *     közvetlenül a kliens-Supabase-ből, és NEM ír bele (a régi `markAsRead` /
 *     `archive` / `markAll` némán, `user_id`-őr nélkül írt, a hibát eldobta).
 *     Minden írás a fail-closed szerver-akciókon át, hibánál `toast.error`.
 *   · JELVÉNY: a VALÓDI olvasatlan-szám (`count: 'exact'`), nem a 30-as
 *     lista hossza — 57 olvasatlannál 57, 120-nál „99+".
 *   · TARTALOM: az 5 legfrissebb nem-archivált sor (olvasatlanok elöl), 24 órás
 *     ablak nélkül; soronként FELADÓ-avatar + a feladó neve + relatív idő +
 *     cím + EGYSOROS kivonat (a hírlevél markdown-jelei nélkül).
 *   · KATTINTÁS → `/notifications?felado=<kulcs>&uzenet=<id>`: a beszélgetés-
 *     nézet ugyanazt tudja, jobban — a régi részletes Dialog és a „Tovább"
 *     kinyitó megszűnt. A jóváhagyás/elutasítás gombpár a szálba költözött; a
 *     panelen csak „Válaszra vár" pill.
 *   · REALTIME: `event: '*'` (INSERT + UPDATE) — ha a lelkész a másik fülön
 *     olvasottnak jelöl, vagy a mentés-riasztó „megoldva"-ra állít, a jelvény
 *     itt is frissül.
 *
 * ⚠️ A panel a header stacking contextjében marad (sticky `z-30` + `backdrop-
 *    blur` → a fixed gyerekek containing blockja a header), ezért az overlay
 *    explicit `h-screen w-screen`. Mobilon a panel a fejléc alatt teljes
 *    szélességű lap, vízszintesen SOHA nem lóg ki.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, Bell, BellDot, CheckCheck, CheckCircle2, Inbox, Repeat2, X } from 'lucide-react'
import { toast } from 'sonner'

import { getTypeVisual, relativHuIdo } from '@/components/notifications/ertesites-vizualis'
import { FeladoAvatar } from '@/components/notifications/felado-avatar'
import { useErtesitesRealtime } from '@/components/notifications/use-ertesites-realtime'
import { ertesitesUrl, sorFeladoja, sorKivonata, valaszraVarE } from '@/lib/notifications/beszelgetesek'
import { beszelgetesKulcs } from '@/lib/notifications/felado'
import { jelolMindOlvasottnakAction, listFrissErtesitesekAction } from '@/lib/notifications/uzenetek-actions'
import type { FrissErtesitesek, UzenetSor } from '@/lib/notifications/uzenetek-shared'
import { BUKARESTI_ZONA_FELIRAT, huIdopontBukarest } from '@/lib/utils/idopont-bukarest'
import { cn } from '@/lib/utils'

/** Meddig fusson a badge figyelem-pulzálás egy új üzenet érkezése után. */
const NEW_ARRIVAL_MS = 8_000
const SHAKE_MS = 1_500

export function NotificationBellRefined({ userId }: { userId: string }) {
  const router = useRouter()

  const [friss, setFriss] = useState<FrissErtesitesek | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [markAllPending, setMarkAllPending] = useState(false)
  const [shake, setShake] = useState(false)
  const [justArrived, setJustArrived] = useState(false)

  // Az előző olvasatlan-szám: csak NÖVEKEDÉSNÉL rázunk (első betöltésnél nem).
  const prevCountRef = useRef<number | null>(null)
  const idozitokRef = useRef<Array<ReturnType<typeof setTimeout>>>([])

  /**
   * Betöltés a szerver-akcióból. A rázás/pulzálás itt dől el (az async
   * válasz után), nem effektben — így nincs szinkron setState effekt-törzsben.
   */
  const betolt = useCallback(async () => {
    const r = await listFrissErtesitesekAction()
    const elozo = prevCountRef.current
    if (elozo !== null && !r.error && r.olvasatlan > elozo) {
      setShake(true)
      setJustArrived(true)
      idozitokRef.current.push(
        setTimeout(() => setShake(false), SHAKE_MS),
        setTimeout(() => setJustArrived(false), NEW_ARRIVAL_MS),
      )
    }
    if (!r.error) prevCountRef.current = r.olvasatlan
    setFriss(r)
  }, [])

  useEffect(() => {
    // Az első betöltés mikrotaszkban indul: az effekt törzsében így nincs
    // (a lint által annak olvasott) szinkron setState — a válasz úgyis
    // aszinkron érkezik. Lemondás: leszereléskor a késői válasz sem ír.
    let lemondva = false
    queueMicrotask(() => {
      if (!lemondva) void betolt()
    })
    const idozitok = idozitokRef.current
    return () => {
      lemondva = true
      for (const t of idozitok.splice(0)) clearTimeout(t)
    }
  }, [betolt])

  useErtesitesRealtime(userId, () => {
    void betolt()
  })

  // Escape → panel bezárása
  useEffect(() => {
    if (!dropdownOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dropdownOpen])

  // A panel megnyitásakor friss adat — a realtime nem biztos, hogy tüzel.
  function nyitVagyZar() {
    setDropdownOpen((open) => {
      if (!open) void betolt()
      return !open
    })
  }

  async function markAllAsRead() {
    setMarkAllPending(true)
    const r = await jelolMindOlvasottnakAction()
    setMarkAllPending(false)
    if (!r.success) {
      toast.error(`Az összes olvasottnak jelölése nem sikerült: ${r.error ?? 'ismeretlen hiba.'}`)
      return
    }
    await betolt()
  }

  /** Kattintás egy sorra → a beszélgetés-nézet, a buborékhoz görgetve. */
  function megnyit(sor: UzenetSor) {
    setDropdownOpen(false)
    router.push(ertesitesUrl({ felado: beszelgetesKulcs(sorFeladoja(sor)), uzenet: sor.id }))
  }

  const olvasatlan = friss?.olvasatlan ?? 0
  const hasUnread = olvasatlan > 0
  const badgeLabel = olvasatlan > 99 ? '99+' : String(olvasatlan)
  const sorok = friss?.sorok ?? []
  const fuggo = friss?.fuggoKerelmek ?? 0

  const headline = friss === null
    ? 'Betöltés…'
    : hasUnread
      ? `${olvasatlan} olvasatlan üzenet`
      : sorok.length > 0
        ? 'Minden üzenetet elolvastál'
        : 'Nincs új értesítés'

  return (
    <div className="relative">
      {/* Csengő gomb — a header többi ikongombjának formanyelvét követi */}
      <button
        type="button"
        onClick={nyitVagyZar}
        aria-label={hasUnread ? `${olvasatlan} olvasatlan értesítés` : 'Értesítések'}
        aria-expanded={dropdownOpen}
        aria-haspopup="dialog"
        title="Értesítések"
        className={cn(
          'relative inline-flex size-10 items-center justify-center rounded-[10px] transition',
          'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
          // Egyetlen ring-szélesség + ring-szín osztály állapotonként, hogy a
          // Tailwind-osztályok ne ütközzenek egymással (2026-08-10).
          hasUnread
            ? cn(
                'bg-amber-500/12 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300',
                dropdownOpen ? 'ring-2 ring-amber-500/55' : 'ring-1 ring-amber-500/35 dark:ring-amber-400/35',
              )
            : cn('bg-muted text-foreground hover:bg-muted/70', dropdownOpen && 'ring-2 ring-ring/45'),
        )}
      >
        <span className={cn('inline-flex size-[18px] items-center justify-center', shake && 'bell-shake')}>
          {hasUnread ? <BellDot className="size-[18px]" /> : <Bell className="size-[17px]" />}
        </span>
        {hasUnread && (
          <span
            className={cn(
              'absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-[18px] text-white shadow-sm',
              justArrived && 'badge-pulse',
            )}
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {dropdownOpen && (
        <>
          {/* Kívülre kattintás → bezárás. Mobilon finom sötétítés is.
              ⚠️ A header `backdrop-blur`-t használ, ezért ő a containing block
              a fixed pozíciójú gyerekeknek — az `inset-0` csak a 64 px magas
              fejlécet fedné le. Explicit `h-screen w-screen` kell (2026-08-10). */}
          <div
            className="fixed left-0 top-0 z-40 h-screen w-screen bg-foreground/15 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none"
            onClick={() => setDropdownOpen(false)}
            aria-hidden
          />

          <div
            role="dialog"
            aria-label="Értesítések"
            className={cn(
              'z-50 flex flex-col overflow-hidden',
              // Mobil: a fejléc alatt teljes szélességű lap, 12-12 px margóval.
              'fixed left-3 right-3 top-[4.5rem]',
              // sm-től: a csengőhöz horgonyzott popover
              'sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-3 sm:w-[26rem]',
              'rounded-2xl border border-border bg-popover text-popover-foreground',
              'shadow-[0_28px_70px_-32px_rgba(28,42,38,0.55)]',
            )}
          >
            {/* ── Panel-fejléc ──────────────────────────────────────────── */}
            <div className="shrink-0 border-b border-border/70 bg-gradient-to-b from-secondary/70 to-popover px-4 pb-3 pt-3.5">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 dark:text-foreground">
                  <Bell className="size-[17px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Értesítések
                  </p>
                  <h3 className="truncate font-heading text-[15px] leading-tight text-foreground">{headline}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(false)}
                  aria-label="Panel bezárása"
                  /* 44 px érintőfelület: a bezáró X a képernyő sarkában van. */
                  className="-mr-1 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <X className="size-4" />
                </button>
              </div>

              {hasUnread && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    disabled={markAllPending}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-primary transition hover:bg-primary/10 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-foreground"
                  >
                    <CheckCheck className="size-3.5" />
                    {markAllPending ? 'Jelölés…' : 'Összes olvasottnak jelölése'}
                  </button>
                </div>
              )}
            </div>

            {/* ── A hiba NEM néma: a lelkész látja, ha a számláló nem beszél ── */}
            {friss?.error ? (
              <p role="alert" className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs leading-relaxed text-foreground">
                {friss.error}
              </p>
            ) : null}
            {/* ── Nem végzetes, de HANGOS (P3): a kérelem-állapotok mellék-lekérése nem sikerült —
                a „Válaszra vár" a sor saját jelöléséből jön; borostyán, mint a listában ── */}
            {friss?.warning ? (
              <p role="status" className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs leading-relaxed text-foreground">
                {friss.warning}
              </p>
            ) : null}

            {/* ── Az 5 legfrissebb ──────────────────────────────────────── */}
            {friss !== null && sorok.length === 0 ? (
              <NotificationEmptyState />
            ) : (
              <ul className="max-h-[min(28rem,56vh)] space-y-1 overflow-y-auto overscroll-contain p-2" role="list">
                {sorok.map((sor) => (
                  <li key={sor.id}>
                    <FrissSor sor={sor} onSelect={() => megnyit(sor)} />
                  </li>
                ))}
              </ul>
            )}

            {/* ── Panel-lábléc ──────────────────────────────────────────── */}
            <div className="shrink-0 space-y-0.5 border-t border-border/70 bg-secondary/40 px-3 py-2">
              <Link
                href="/notifications"
                onClick={() => setDropdownOpen(false)}
                className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-foreground"
              >
                <Inbox className="size-3.5" />
                Összes megnyitása{hasUnread ? ` (${badgeLabel})` : ''}
                <ArrowUpRight className="size-3.5" />
              </Link>
              {fuggo > 0 ? (
                <Link
                  href={ertesitesUrl({ ful: 'kerelmek' })}
                  onClick={() => setDropdownOpen(false)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-violet-700 transition hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-violet-300"
                >
                  <Repeat2 className="size-3.5" />
                  Átjelentkezési kérelmek ({fuggo})
                  <ArrowUpRight className="size-3.5" />
                </Link>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Üres állapot
// ──────────────────────────────────────────────────────────────────────────

function NotificationEmptyState() {
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-400/25">
        <CheckCircle2 className="size-6" />
      </div>
      <p className="mt-3.5 text-sm font-semibold text-foreground">Tiszta a postaláda</p>
      <p className="mx-auto mt-1 max-w-[19rem] text-xs leading-relaxed text-muted-foreground">
        Nincs üzeneted. Ha új történik a gyülekezet körül, itt jelezzük.
      </p>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Egy friss sor: feladó-avatar + név + idő · cím · egysoros kivonat
// ──────────────────────────────────────────────────────────────────────────

function FrissSor({ sor, onSelect }: { sor: UzenetSor; onSelect: () => void }) {
  const felado = sorFeladoja(sor)
  const visual = getTypeVisual(sor.tipus)
  const kivonat = sorKivonata(sor)
  const valaszraVar = valaszraVarE(sor)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative flex min-h-14 w-full items-start gap-3 overflow-hidden rounded-xl border border-transparent py-2 pl-3.5 pr-2.5 text-left transition',
        'hover:border-border hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        sor.olvasva ? 'opacity-85 hover:opacity-100' : 'bg-secondary/35',
      )}
    >
      {/* Bal oldali hangsúly-csík — csak olvasatlannál */}
      {!sor.olvasva && (
        <span aria-hidden className={cn('absolute inset-y-2 left-0 w-[3px] rounded-r-full', visual.bar)} />
      )}

      <FeladoAvatar felado={felado} meret="sm" className="mt-0.5" />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">{felado.nev}</span>
          <time
            dateTime={sor.createdAt}
            title={`${huIdopontBukarest(sor.createdAt, 'long')} — ${BUKARESTI_ZONA_FELIRAT}`}
            className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
          >
            {relativHuIdo(sor.createdAt)}
          </time>
        </span>
        <span className="mt-0.5 flex items-start gap-2">
          <span className={cn('line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug text-foreground', sor.olvasva ? 'font-medium' : 'font-semibold')}>
            {sor.cim}
          </span>
          {!sor.olvasva && (
            <span aria-label="Olvasatlan" className="mt-1 size-2 shrink-0 rounded-full bg-primary ring-2 ring-primary/20" />
          )}
        </span>
        {kivonat ? (
          <span className="mt-0.5 block truncate text-xs leading-relaxed text-muted-foreground">{kivonat}</span>
        ) : null}
        {valaszraVar || sor.megoldva ? (
          <span className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            {valaszraVar ? (
              <span className="inline-flex items-center rounded-full bg-amber-500/14 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                Válaszra vár
              </span>
            ) : null}
            {sor.megoldva ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-3" />
                Megoldva
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
    </button>
  )
}
