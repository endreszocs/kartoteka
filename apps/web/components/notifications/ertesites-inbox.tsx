'use client'

/**
 * ÉRTESÍTÉSEK — ÁTNÉZHETŐ LISTA (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT SZÜLETETT — A TULAJDONOS KÉRÉSE
 * ════════════════════════════════════════════════════════════════════════════
 * „A megnyitásra kattintva nem jelenik meg az értesítések oldal, ahol
 * részletesebben és szépen átnézhetem az üzeneteket."
 *
 * Igaza volt: ilyen oldal NEM LÉTEZETT. Az `ertesitesek` tábla sorait EGYETLEN
 * felület mutatta, a fejléc-csengő lenyíló panelje — ott is csak az olvasatlanok
 * és a 24 óránál frissebben olvasottak. Ami ennél régebbi (vagy archivált) volt,
 * az a felületről VÉGLEG eltűnt, miközben a sor ott maradt az adatbázisban.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A NÉGY KÉRDÉS, AMIRE EGY KIBONTOTT ÜZENET VÁLASZOL
 * ════════════════════════════════════════════════════════════════════════════
 *   MI TÖRTÉNT?   — a törzs, teljes egészében (nem 2 sorra vágva)
 *   MIKOR?        — pontos bukaresti idő ÉS relatív idő, együtt
 *   KIT ÉRINT?    — az érintett gyülekezet neve, ha van
 *   MIT TEGYEK?   — a „Teendő" külön dobozban, plusz a működő hivatkozás
 * …és ha a baj MÁR ELMÚLT, azt zöld sávban kimondjuk. Egy rendszer, ami csak
 * panaszkodni tud, előbb-utóbb a panaszait is elveszti.
 *
 * ⚠️ MOBIL-ELSŐ. A lelkész úton, telefonon nézi: minden érintőfelület 44 px,
 *    a kártya 375 px-en sem lóg ki, és a szűrők görgethető sorban állnak.
 * ⚠️ TÉMA-TOKENEK. Hardkódolt fehér/slate SEHOL — a régi `/notifications` oldal
 *    sötét témában olvashatatlan volt.
 */

import { useCallback, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Clock,
  Inbox,
  Loader2,
  MailOpen,
  Church,
  Wrench,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  archivalErtesitestAction,
  jelolMindOlvasottnakAction,
  jelolOlvasatlannakAction,
  jelolOlvasottnakAction,
  listErtesitesekAction,
  visszaallitErtesitestAction,
} from '@/lib/notifications/uzenetek-actions'
import {
  CSOPORTOK,
  IDO_CIMKEK,
  bontUzenet,
  idoCsoportja,
  uzenetCsoportja,
  type IdoCsoport,
  type UzenetCsoport,
  type UzenetSor,
} from '@/lib/notifications/uzenetek-shared'
import {
  BUKARESTI_ZONA_FELIRAT,
  bukarestiNapKulcs,
  huIdopontBukarest,
} from '@/lib/utils/idopont-bukarest'

import { getTypeVisual, notificationLink, relativHuIdo } from './ertesites-vizualis'

type SzuroCsoport = UzenetCsoport | 'mind'

export function ErtesitesInbox({
  kezdoSorok,
  kezdoHiba,
  tobbVan,
}: {
  kezdoSorok: UzenetSor[]
  kezdoHiba?: string | null
  tobbVan?: boolean
}) {
  const [sorok, setSorok] = useState<UzenetSor[]>(kezdoSorok)
  const [hiba, setHiba] = useState<string | null>(kezdoHiba ?? null)
  const [csoport, setCsoport] = useState<SzuroCsoport>('mind')
  const [csakOlvasatlan, setCsakOlvasatlan] = useState(false)
  const [archivum, setArchivum] = useState(false)
  const [nyitott, setNyitott] = useState<string | null>(null)
  const [fut, indit] = useTransition()

  const ujratolt = useCallback(async () => {
    const r = await listErtesitesekAction()
    if (r.error) {
      setHiba(r.error)
      return
    }
    setHiba(null)
    setSorok(r.rows ?? [])
  }, [])

  /**
   * ⚠️ NINCS OPTIMISTA HAZUGSÁG. A művelet után ÚJRAOLVASSUK a listát a
   *    szerverről. Ha az írás elbukott (lejárt munkamenet, RLS), a képernyő
   *    NEM mutat sikert — pontosan az a hibaosztály, amit ez a kör irt ki.
   */
  const muvelet = useCallback(
    (fn: () => Promise<{ success: boolean; error?: string }>) => {
      indit(async () => {
        const r = await fn()
        if (!r.success) {
          setHiba(r.error ?? 'A művelet nem sikerült.')
          return
        }
        await ujratolt()
      })
    },
    [ujratolt],
  )

  const maKulcs = bukarestiNapKulcs()
  const tegnapKulcs = useMemo(() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 1)
    return bukarestiNapKulcs(d)
  }, [])

  const olvasatlanSzam = sorok.filter((s) => !s.olvasva && !s.archived).length
  const archivaltSzam = sorok.filter((s) => s.archived).length

  const szurt = useMemo(() => {
    return sorok.filter((s) => {
      if (archivum !== s.archived) return false
      // ⚠️ 2026-08-11 JAVÍTÁS — AZ ÜZENET ELTŰNT A KEZE ALÓL.
      //    A `megnyit()` a kibontással EGYIDEJŰLEG olvasottnak jelöl, a `muvelet()`
      //    pedig utána újraolvassa a listát a szerverről. A friss soron
      //    `olvasva: true`, ezért a „Csak olvasatlan" szűrő kidobta azt a
      //    kártyát, amit a lelkész ÉPP MOST nyitott ki — még mielőtt elolvasta
      //    volna. Szó szerint ugyanaz a panasz, amit a tulajdonos bejelentett:
      //    „rákattintok, és nem történik semmi".
      //    A NYITOTT sor ezért bent marad; csak becsukáskor vagy szűrőváltáskor
      //    tűnik el.
      if (csakOlvasatlan && s.olvasva && s.id !== nyitott) return false
      if (csoport !== 'mind' && uzenetCsoportja(s) !== csoport) return false
      return true
    })
  }, [sorok, archivum, csakOlvasatlan, csoport, nyitott])

  /** Idő-blokkok — a lelkész naptárban gondolkodik, nem órákban. */
  const blokkok = useMemo(() => {
    const map = new Map<IdoCsoport, UzenetSor[]>()
    for (const s of szurt) {
      const kulcs = idoCsoportja(bukarestiNapKulcs(new Date(s.createdAt)), maKulcs, tegnapKulcs)
      const lista = map.get(kulcs)
      if (lista) lista.push(s)
      else map.set(kulcs, [s])
    }
    const sorrend: IdoCsoport[] = ['ma', 'tegnap', 'het', 'korabban']
    return sorrend.filter((k) => map.has(k)).map((k) => ({ kulcs: k, sorok: map.get(k) ?? [] }))
  }, [szurt, maKulcs, tegnapKulcs])

  function megnyit(s: UzenetSor) {
    const most = nyitott === s.id ? null : s.id
    setNyitott(most)
    // A megnyitás egyben elolvasás — de csak akkor írunk, ha tényleg változik.
    if (most && !s.olvasva) muvelet(() => jelolOlvasottnakAction(s.id))
  }

  return (
    <div className="space-y-3">
      {/* ── SZŰRŐSOR ──────────────────────────────────────────────────────── */}
      <div className="card-raised space-y-3 p-3 sm:p-4">
        {/* Csoport-választó. Vízszintesen görgethető: 375 px-en öt pirula nem fér ki. */}
        <div
          role="tablist"
          aria-label="Üzenet-csoportok"
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        >
          {[{ id: 'mind' as const, cimke: 'Mind', szin: 'slate', leiras: 'Minden üzenet.' }, ...CSOPORTOK].map(
            (cs) => {
              const aktiv = csoport === cs.id
              const darab =
                cs.id === 'mind'
                  ? sorok.filter((s) => s.archived === archivum).length
                  : sorok.filter((s) => s.archived === archivum && uzenetCsoportja(s) === cs.id).length
              return (
                <button
                  key={cs.id}
                  type="button"
                  role="tab"
                  aria-selected={aktiv}
                  title={cs.leiras}
                  onClick={() => setCsoport(cs.id as SzuroCsoport)}
                  className={cn(
                    'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                    aktiv
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-secondary/60',
                  )}
                >
                  {cs.cimke}
                  <span className="rounded-full bg-secondary px-1.5 text-[11px] font-semibold text-muted-foreground">
                    {darab}
                  </span>
                </button>
              )
            },
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={csakOlvasatlan}
              onChange={(e) => setCsakOlvasatlan(e.currentTarget.checked)}
              className="size-4"
              aria-label="Csak az olvasatlan üzenetek mutatása"
            />
            Csak olvasatlan ({olvasatlanSzam})
          </label>

          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={archivum}
              onChange={(e) => {
                setArchivum(e.currentTarget.checked)
                setNyitott(null)
              }}
              className="size-4"
              aria-label="Az archivált üzenetek mutatása"
            />
            Archívum ({archivaltSzam})
          </label>

          {olvasatlanSzam > 0 && !archivum ? (
            <Button
              type="button"
              variant="outline"
              disabled={fut}
              onClick={() => muvelet(jelolMindOlvasottnakAction)}
              className="min-h-11 gap-2"
              aria-label="Minden üzenet olvasottnak jelölése"
            >
              <CheckCheck className="size-4" aria-hidden />
              Összes olvasottnak
            </Button>
          ) : null}

          {fut ? (
            <span className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Mentés…
            </span>
          ) : null}
        </div>
      </div>

      {hiba ? (
        <p
          role="status"
          className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm leading-relaxed text-foreground"
        >
          {hiba}
        </p>
      ) : null}

      {/* ── LISTA ─────────────────────────────────────────────────────────── */}
      {blokkok.length === 0 ? (
        <UresAllapot archivum={archivum} szurt={csoport !== 'mind' || csakOlvasatlan} />
      ) : (
        blokkok.map((b) => (
          <section key={b.kulcs} className="space-y-2">
            <h2 className="px-1 pt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {IDO_CIMKEK[b.kulcs]}
            </h2>
            <ul className="space-y-2" role="list">
              {b.sorok.map((s) => (
                <li key={s.id}>
                  <UzenetKartya
                    sor={s}
                    nyitva={nyitott === s.id}
                    fut={fut}
                    onValt={() => megnyit(s)}
                    onArchival={() => muvelet(() => archivalErtesitestAction(s.id))}
                    onVisszaallit={() => muvelet(() => visszaallitErtesitestAction(s.id))}
                    onOlvasatlan={() => muvelet(() => jelolOlvasatlannakAction(s.id))}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {tobbVan ? (
        <p className="rounded-2xl border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          A legutóbbi 200 üzenetet mutatjuk. A régebbiek nem vesztek el — ha szükséged van rájuk,
          szólj a rendszergazdának.
        </p>
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EGY ÜZENET
// ─────────────────────────────────────────────────────────────────────────────

function UzenetKartya({
  sor,
  nyitva,
  fut,
  onValt,
  onArchival,
  onVisszaallit,
  onOlvasatlan,
}: {
  sor: UzenetSor
  nyitva: boolean
  fut: boolean
  onValt: () => void
  onArchival: () => void
  onVisszaallit: () => void
  onOlvasatlan: () => void
}) {
  const visual = getTypeVisual(sor.tipus)
  const Ikon = visual.icon
  const link = notificationLink(sor.hivatkozas)
  const { torzs, teendo } = bontUzenet(sor.uzenet)

  return (
    <article
      className={cn(
        'overflow-hidden rounded-2xl border transition',
        sor.olvasva ? 'border-border bg-card' : 'border-primary/30 bg-secondary/40',
      )}
    >
      {/* FEJ — kattintható, 44 px fölött. `<button>`, hogy a billentyűzet is vigye. */}
      <button
        type="button"
        onClick={onValt}
        aria-expanded={nyitva}
        className="flex w-full items-start gap-3 px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:px-4"
      >
        <span
          className={cn(
            'mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl ring-1',
            visual.chip,
          )}
        >
          <Ikon className="size-5" aria-hidden />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 text-sm leading-snug text-foreground',
                sor.olvasva ? 'font-medium' : 'font-semibold',
              )}
            >
              {sor.cim}
            </span>
            {!sor.olvasva && (
              <span
                aria-label="Olvasatlan"
                className="mt-1.5 size-2 shrink-0 rounded-full bg-primary ring-2 ring-primary/20"
              />
            )}
          </span>

          {!nyitva && torzs ? (
            <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
              {torzs}
            </span>
          ) : null}

          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span
              className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 font-medium', visual.pill)}
            >
              {visual.label}
            </span>
            {sor.megoldva ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-3" aria-hidden />
                Megoldva
              </span>
            ) : null}
            <span className="tabular-nums">{relativHuIdo(sor.createdAt)}</span>
          </span>
        </span>

        <ChevronDown
          className={cn(
            'mt-2 size-4 shrink-0 text-muted-foreground transition-transform',
            nyitva && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {/* KIBONTVA — MI TÖRTÉNT / MIKOR / KIT ÉRINT / MIT TEGYEK */}
      {nyitva ? (
        <div className="space-y-3 border-t border-border/70 px-3 pb-3 pt-3 sm:px-4">
          {sor.megoldva ? (
            <p className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm leading-relaxed text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <strong>Ez a baj azóta elmúlt.</strong>
                {sor.megoldasUzenet ? ` ${sor.megoldasUzenet}` : ''}
                {sor.megoldvaAt
                  ? ` (${huIdopontBukarest(sor.megoldvaAt, 'short')} — ${BUKARESTI_ZONA_FELIRAT})`
                  : ''}
              </span>
            </p>
          ) : null}

          {torzs ? (
            <div className="rounded-xl border border-border/70 bg-background px-3 py-2.5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{torzs}</p>
            </div>
          ) : null}

          {teendo ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                <Wrench className="size-3.5" aria-hidden />
                Mit tegyek?
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">{teendo}</p>
            </div>
          ) : null}

          <dl className="grid gap-x-4 gap-y-1.5 text-xs text-muted-foreground sm:grid-cols-2">
            <div className="flex items-start gap-1.5">
              <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                <dt className="inline font-semibold text-foreground">Érkezett: </dt>
                <dd className="inline">
                  {huIdopontBukarest(sor.createdAt, 'long')} ({relativHuIdo(sor.createdAt)}) ·{' '}
                  <span className="whitespace-nowrap">{BUKARESTI_ZONA_FELIRAT}</span>
                </dd>
              </span>
            </div>
            {sor.readAt ? (
              <div className="flex items-start gap-1.5">
                <MailOpen className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <dt className="inline font-semibold text-foreground">Olvasva: </dt>
                  <dd className="inline">{huIdopontBukarest(sor.readAt, 'short')}</dd>
                </span>
              </div>
            ) : null}
            {sor.congregationNev ? (
              <div className="flex items-start gap-1.5">
                <Church className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <dt className="inline font-semibold text-foreground">Érintett gyülekezet: </dt>
                  <dd className="inline">{sor.congregationNev}</dd>
                </span>
              </div>
            ) : null}
          </dl>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {link ? (
              link.external ? (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                >
                  Megnyitás
                  <ArrowUpRight className="size-4" aria-hidden />
                </a>
              ) : (
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                >
                  Megnyitás
                  <ArrowUpRight className="size-4" aria-hidden />
                </Link>
              )
            ) : null}

            {sor.archived ? (
              <Button
                type="button"
                variant="outline"
                disabled={fut}
                onClick={onVisszaallit}
                className="min-h-11 gap-2"
                aria-label="Az üzenet visszahozása az archívumból"
              >
                <ArchiveRestore className="size-4" aria-hidden />
                Vissza az archívumból
              </Button>
            ) : (
              <>
                {sor.olvasva ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={fut}
                    onClick={onOlvasatlan}
                    className="min-h-11 gap-2"
                    aria-label="Az üzenet megjelölése olvasatlanként"
                  >
                    <Inbox className="size-4" aria-hidden />
                    Olvasatlanra
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  disabled={fut}
                  onClick={onArchival}
                  className="min-h-11 gap-2"
                  aria-label="Az üzenet archiválása"
                >
                  <Archive className="size-4" aria-hidden />
                  Archiválás
                </Button>
              </>
            )}
          </div>

          {/* ⚠️ AZ ARCHIVÁLÁS NEM TÖRLÉS — és ezt ki is mondjuk. Korábban a
              felület ezt sugallta, mert nem volt út vissza. */}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Az archiválás nem törlés: az üzenet átkerül az „Archívum" nézetbe, ahonnan bármikor
            visszahozható.
          </p>
        </div>
      ) : null}
    </article>
  )
}

function UresAllapot({ archivum, szurt }: { archivum: boolean; szurt: boolean }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-secondary/40 px-6 py-12 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-400/25">
        <CheckCircle2 className="size-6" aria-hidden />
      </div>
      <p className="mt-3.5 text-sm font-semibold text-foreground">
        {archivum ? 'Az archívum üres' : szurt ? 'Ebben a szűrésben nincs üzenet' : 'Tiszta a postaláda'}
      </p>
      <p className="mx-auto mt-1 max-w-[22rem] text-xs leading-relaxed text-muted-foreground">
        {archivum
          ? 'Amit archiválsz, ide kerül — és innen bármikor visszahozható.'
          : szurt
            ? 'Próbáld a „Mind" csoportot, vagy vedd le a „Csak olvasatlan" szűrőt.'
            : 'Ha új történik a gyülekezet körül, itt jelezzük. Az üzenetek innen nem tűnnek el maguktól.'}
      </p>
    </div>
  )
}
