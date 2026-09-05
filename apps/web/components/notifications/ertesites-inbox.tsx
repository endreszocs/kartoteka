'use client'

/**
 * ÉRTESÍTÉSEK — BESZÉLGETÉS-NÉZET (2026-09-05, „Apple-chat", D4–D7).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT ÍRÓDOTT ÁT A LISTA
 * ════════════════════════════════════════════════════════════════════════════
 * A 2026-08-11-es egyoszlopos kártyalista megválaszolta a „mi történt / mikor /
 * mit tegyek" kérdéseket, de a tulajdonos negyedik kérdésére — KITŐL? — nem
 * tudott felelni: az `ertesitesek` tábla feladó nélkül élt, és a lista is
 * időblokkokban, nem küldőnként mutatta a sorokat. Mostantól:
 *
 *   BAL OSZLOP  — beszélgetés-lista feladó szerint (avatar, név, utolsó
 *                 üzenet kivonata, idő, olvasatlan-pirula), kereséssel és a
 *                 régi három kapcsolóval EGY szűrőben (Mind / Olvasatlan / Archívum);
 *   JOBB OSZLOP — a szál buborékokban, időrendben (régi fent, új lent),
 *                 dátum-elválasztókkal; a részletek (Teendő, Megoldva, Megnyitás,
 *                 jóváhagyás) a buborékban.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * URL-ÁLLAPOT, NEM useState (D6)
 * ════════════════════════════════════════════════════════════════════════════
 * `?felado=<kulcs>&uzenet=<id>&archivum=1&szuro=olvasatlan` — a csengő és a
 * mélylinkek ide mutatnak, a böngésző Vissza gombja a listára visz (mobilon a
 * lista → szál lépés egy history-bejegyzés). Az URL-t a natív
 * `history.pushState/replaceState` írja: a Next.js router ezt szinkronizálja a
 * `useSearchParams`-szal, de NEM kér új szerver-renderelést — egy `router.push`
 * minden szál-váltásnál újra lefuttatná az oldal három lekérdezését.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * NINCS OPTIMISTA HAZUGSÁG — de a lelkész keze alól sem tűnik el semmi
 * ════════════════════════════════════════════════════════════════════════════
 * Minden írás szerver-akció; a képernyő csak SIKER után változik (a sor
 * helyben frissül a szerver válasza alapján, majd egy összevont újraolvasás
 * egyeztet). Hiba → toast. Az „Olvasatlan" szűrőben a most olvasottnak jelölt
 * sorok a szűrőváltásig bent maradnak (`megtartott`).
 *
 * ⚠️ MOBIL-ELSŐ: 375 px-en egy oszlop (lista, majd a szál 44 px-es „← Üzenetek"
 *    gombbal); minden érintőfelület ≥ 44 px. Sötét mód kizárólag tokenekkel.
 */

import { useCallback, useMemo, useRef, useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

import { approveAdminAccess, denyAdminAccess } from '@/app/(dashboard)/notifications/actions'
import {
  csoportositBeszelgetesek,
  ertesitesUrl,
  keresBeszelgetesek,
  osszesOlvasatlan,
  szurSorok,
  urlAllapot,
  valasztSzal,
  type ErtesitesUrlAllapot,
  type SzalSzuro,
} from '@/lib/notifications/beszelgetesek'
import {
  archivalErtesitestAction,
  jelolMindOlvasottnakAction,
  jelolOlvasatlannakAction,
  jelolOlvasottnakAction,
  listErtesitesekAction,
  visszaallitErtesitestAction,
} from '@/lib/notifications/uzenetek-actions'
import type { UzenetMuveletEredmeny, UzenetSor } from '@/lib/notifications/uzenetek-shared'
import { cn } from '@/lib/utils'

import { BeszelgetesLista } from './beszelgetes-lista'
import { BeszelgetesSzal } from './beszelgetes-szal'
import type { UzenetMuveletek } from './uzenet-buborek'
import { useErtesitesRealtime } from './use-ertesites-realtime'

const URES_HALMAZ: ReadonlySet<string> = new Set()

/** Az összevont újraolvasás késleltetése a láthatóságra jelölés után. */
const UJRAOLVASAS_MS = 600

export function ErtesitesInbox({
  kezdoSorok,
  kezdoHiba,
  kezdoFigyelmeztetes,
  tobbVan,
  userId,
}: {
  kezdoSorok: UzenetSor[]
  kezdoHiba?: string | null
  /**
   * 2026-09-05 (P3): NEM végzetes figyelmeztetés a szerver-akcióból (a
   * hozzáférés-kérelmek tényleges állapota nem olvasható) — a lista megvan,
   * de a „Válaszra vár" az érintett soroknál a sor saját jelöléséből jön.
   * KIÍRJUK; néma függő nincs.
   */
  kezdoFigyelmeztetes?: string | null
  tobbVan?: boolean
  /** A bejelentkezett felhasználó — az élő frissítés (realtime) szűrője. */
  userId?: string | null
}) {
  const [sorok, setSorok] = useState<UzenetSor[]>(kezdoSorok)
  const [hiba, setHiba] = useState<string | null>(kezdoHiba ?? null)
  const [figyelmeztetes, setFigyelmeztetes] = useState<string | null>(kezdoFigyelmeztetes ?? null)
  const [kereses, setKereses] = useState('')
  const [fut, indit] = useTransition()

  // ── URL-állapot ──────────────────────────────────────────────────────────
  const sp = useSearchParams()
  const allapot = useMemo(() => urlAllapot((k) => sp.get(k)), [sp])

  const allitUrl = useCallback(
    (uj: Partial<ErtesitesUrlAllapot>, mod: 'push' | 'replace') => {
      const url = ertesitesUrl({ ...allapot, ...uj })
      if (mod === 'push') window.history.pushState(null, '', url)
      else window.history.replaceState(null, '', url)
    },
    [allapot],
  )

  // ── „Megtartott" sorok: az Olvasatlan szűrőben nem tűnhet el, amit épp olvas ──
  const ctxKulcs = `${allapot.szuro}|${allapot.felado ?? ''}`
  const [megtartott, setMegtartott] = useState<{ ctx: string; ids: ReadonlySet<string> }>({ ctx: ctxKulcs, ids: URES_HALMAZ })
  const aktivMegtartott = megtartott.ctx === ctxKulcs ? megtartott.ids : URES_HALMAZ

  // ── Levezetett adatok ────────────────────────────────────────────────────
  const szurtSorok = useMemo(() => szurSorok(sorok, allapot.szuro, aktivMegtartott), [sorok, allapot.szuro, aktivMegtartott])
  const osszes = useMemo(() => csoportositBeszelgetesek(szurtSorok), [szurtSorok])
  const lathato = useMemo(() => keresBeszelgetesek(osszes, kereses), [osszes, kereses])
  const olvasatlanOssz = useMemo(() => osszesOlvasatlan(osszes), [osszes])

  // A mélylink (`?uzenet=`) feladó nélkül is megtalálja a szálat; egy NEM ILLŐ
  // `?felado=` kulcs viszont NEM választás — mobilon a lista marad látható, nem
  // egy üres szál (a szabály és a MIÉRT a `valasztSzal`-nál).
  const { aktiv, valasztott: szalNyitva } = useMemo(
    () => valasztSzal(osszes, lathato, sorok, allapot),
    [osszes, lathato, sorok, allapot],
  )

  // ── Újraolvasás (fail-closed: hibánál a régi lista marad, a hiba kiírva) ──
  const ujratolt = useCallback(async () => {
    const r = await listErtesitesekAction()
    if (r.error) {
      setHiba(r.error)
      return
    }
    setHiba(null)
    // A figyelmeztetés a friss válaszé: ha a mellék-lekérés most sikerült, eltűnik.
    setFigyelmeztetes(r.warning ?? null)
    setSorok(r.rows ?? [])
  }, [])

  useErtesitesRealtime(userId, () => {
    void ujratolt()
  })

  const ujraolvasasIdozito = useRef<ReturnType<typeof setTimeout> | null>(null)
  const utemezUjraolvasast = useCallback(() => {
    if (ujraolvasasIdozito.current) clearTimeout(ujraolvasasIdozito.current)
    ujraolvasasIdozito.current = setTimeout(() => {
      ujraolvasasIdozito.current = null
      void ujratolt()
    }, UJRAOLVASAS_MS)
  }, [ujratolt])

  /** Egy szerver-művelet, utána újraolvasás. A képernyő csak SIKER után változik. */
  const muvelet = useCallback(
    (fn: () => Promise<UzenetMuveletEredmeny>, hibaElotag: string) => {
      indit(async () => {
        const r = await fn()
        if (!r.success) {
          toast.error(`${hibaElotag}: ${r.error ?? 'ismeretlen hiba.'}`)
          return
        }
        await ujratolt()
      })
    },
    [ujratolt],
  )

  // ── Láthatóságra olvasottnak (D5) — egyszer soronként, csak siker után ──
  const jeloltRef = useRef<Set<string>>(new Set())
  const onLathato = useCallback(
    (id: string) => {
      if (jeloltRef.current.has(id)) return
      jeloltRef.current.add(id)
      void (async () => {
        const r = await jelolOlvasottnakAction(id)
        if (!r.success) {
          jeloltRef.current.delete(id)
          toast.error(`Az üzenet olvasottnak jelölése nem sikerült: ${r.error ?? 'ismeretlen hiba.'}`)
          return
        }
        // A szerver MEGERŐSÍTETTE — a sor helyben frissül, a szűrő megtartja,
        // az összevont újraolvasás pedig a számlálókat egyezteti.
        const ctx = ctxKulcs
        setMegtartott((prev) => ({ ctx, ids: new Set([...(prev.ctx === ctx ? prev.ids : URES_HALMAZ), id]) }))
        setSorok((prev) =>
          prev.map((s) => (s.id === id ? { ...s, olvasva: true, readAt: s.readAt ?? new Date().toISOString() } : s)),
        )
        utemezUjraolvasast()
      })()
    },
    [ctxKulcs, utemezUjraolvasast],
  )

  // ── Buborék-műveletek ────────────────────────────────────────────────────
  const muveletek = useMemo<UzenetMuveletek>(
    () => ({
      onLathato,
      onOlvasott: (id) => muvelet(() => jelolOlvasottnakAction(id), 'Az olvasottnak jelölés nem sikerült'),
      onOlvasatlan: (id) => muvelet(() => jelolOlvasatlannakAction(id), 'Az olvasatlanra állítás nem sikerült'),
      onArchival: (id) => muvelet(() => archivalErtesitestAction(id), 'Az archiválás nem sikerült'),
      onVisszaallit: (id) => muvelet(() => visszaallitErtesitestAction(id), 'A visszaállítás nem sikerült'),
      onJovahagy: (adminRequestId) =>
        indit(async () => {
          const r = await approveAdminAccess(adminRequestId)
          if ('error' in r && r.error) {
            toast.error(r.error)
            return
          }
          toast.success('Hozzáférés jóváhagyva.')
          if ('warning' in r && r.warning) toast.warning(r.warning)
          await ujratolt()
        }),
      onElutasit: (adminRequestId) =>
        indit(async () => {
          const r = await denyAdminAccess(adminRequestId)
          if ('error' in r && r.error) {
            toast.error(r.error)
            return
          }
          toast.success('Hozzáférés elutasítva.')
          if ('warning' in r && r.warning) toast.warning(r.warning)
          await ujratolt()
        }),
    }),
    [onLathato, muvelet, ujratolt, indit],
  )

  /** A szál összes olvasatlanja — soronként, hogy csak a SAJÁT sorok változzanak. */
  const onSzalMindOlvasott = useCallback(() => {
    if (!aktiv) return
    const ids = aktiv.sorok.filter((s) => !s.olvasva && !s.archived).map((s) => s.id)
    if (ids.length === 0) return
    indit(async () => {
      const eredmenyek = await Promise.all(ids.map((id) => jelolOlvasottnakAction(id)))
      const hibasak = eredmenyek.filter((e) => !e.success)
      if (hibasak.length > 0) {
        toast.error(`${hibasak.length} üzenet jelölése nem sikerült: ${hibasak[0].error ?? 'ismeretlen hiba.'}`)
      }
      await ujratolt()
    })
  }, [aktiv, ujratolt, indit])

  const onMindOlvasott = useCallback(
    () => muvelet(jelolMindOlvasottnakAction, 'Az összes olvasottnak jelölése nem sikerült'),
    [muvelet],
  )

  // ── Navigáció ────────────────────────────────────────────────────────────
  const onValaszt = useCallback(
    (kulcs: string) => allitUrl({ felado: kulcs, uzenet: null }, 'push'),
    [allitUrl],
  )
  const onVissza = useCallback(() => allitUrl({ felado: null, uzenet: null }, 'replace'), [allitUrl])
  const onSzuro = useCallback((szuro: SzalSzuro) => allitUrl({ szuro, archivum: szuro === 'archivalt', uzenet: null }, 'replace'), [allitUrl])
  const onArchivumValt = useCallback(
    () => onSzuro(allapot.szuro === 'archivalt' ? 'mind' : 'archivalt'),
    [onSzuro, allapot.szuro],
  )

  return (
    <div className="space-y-3">
      {hiba ? (
        <p role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm leading-relaxed text-foreground">
          {hiba}
        </p>
      ) : null}
      {/* ── Nem végzetes, de HANGOS: a kérelem-állapotok mellék-lekérése nem sikerült ── */}
      {figyelmeztetes ? (
        <p role="status" className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm leading-relaxed text-foreground">
          {figyelmeztetes}
        </p>
      ) : null}

      <div className="gap-3 lg:grid lg:h-[calc(100dvh-9rem)] lg:min-h-[28rem] lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
        <BeszelgetesLista
          beszelgetesek={lathato}
          aktivKulcs={aktiv?.kulcs ?? null}
          szuro={allapot.szuro}
          kereses={kereses}
          osszOlvasatlan={olvasatlanOssz}
          fut={fut}
          onValaszt={onValaszt}
          onSzuro={onSzuro}
          onKereses={setKereses}
          onMindOlvasott={onMindOlvasott}
          className={cn('max-lg:min-h-[20rem]', szalNyitva ? 'hidden lg:flex' : 'flex')}
        />
        <BeszelgetesSzal
          beszelgetes={aktiv}
          szuro={allapot.szuro}
          kiemeltId={allapot.uzenet}
          fut={fut}
          muveletek={muveletek}
          onMindOlvasott={onSzalMindOlvasott}
          onArchivumValt={onArchivumValt}
          onVissza={onVissza}
          className={cn('max-lg:h-[calc(100dvh-7rem)] max-lg:min-h-[24rem]', szalNyitva ? 'flex' : 'hidden lg:flex')}
        />
      </div>

      {tobbVan ? (
        <p className="rounded-2xl border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          A legutóbbi 200 üzenetet mutatjuk. A régebbiek nem vesztek el — ha szükséged van rájuk, szólj a
          rendszergazdának.
        </p>
      ) : null}
    </div>
  )
}
