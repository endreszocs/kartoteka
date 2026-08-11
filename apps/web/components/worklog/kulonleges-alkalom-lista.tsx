'use client'

/**
 * Különleges gyülekezeti alkalmak — megerősítő lista (2026-08-11, 6. kör).
 *
 * MIT CSINÁL
 *   A lelkészi jelentés összeállításakor végigkérdezi a betervezett KÜLÖNLEGES
 *   alkalmakat (szeretetvendégség, hangverseny, tábor, kirándulás, gyülekezeti
 *   nap…): megvolt-e, és hányan voltak ott. A rutin alkalmakat (istentisztelet,
 *   bibliaóra, kateketikai óra) SOHA nem kérdezi — azok a munkanaplóból jönnek.
 *
 * ERGONÓMIA — a mérce: 12 alkalom 2 perc alatt, TELEFONON
 *   · a gyorsúton SORONKÉNT EGY koppintás: [Megvolt] / [Nem volt];
 *   · a létszám OPCIONÁLIS és NINCS autofókusz (az feldobná a billentyűzetet
 *     minden sornál, és sorononként két koppintást tenne hozzá);
 *   · nincs globális „Mentés" gomb — minden koppintás azonnal ment,
 *     sor-szintű „mentve ✓" visszajelzéssel;
 *   · a kétértelmű típusok (ünnep / nőszövetség / egyéb) külön, ALAPBÓL
 *     ÖSSZECSUKOTT blokkban vannak — nem sürgetnek, és nem is számítanak
 *     „függőben" tételnek.
 *
 * MIT NEM CSINÁL
 *   Nem blokkolja a véglegesítést, és nem ír egyetlen jelentés-rubrikát sem
 *   automatikusan. A III.4 / II.10 KÉZI marad — ez a lista csak JAVASLATOT ad.
 *
 * Ház-konvenciók: kizárólag téma-tokenek (semmi beégetett hex), ≥44px érintő-
 * célok, flex-wrap (soha vízszintes görgetés), magyar UI ékezetesen, tegeződés.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarPlus,
  Check,
  ChevronDown,
  Database,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { PROG_TIPUS_EMOJI, PROG_TIPUS_LABELS } from '@/lib/constants/dashboard'
import {
  huNapNev,
  huRovidDatum,
  maiDatum,
  szamolOsszesites,
  URES_OSSZESITES,
  type KulonlegesAllapot,
  type KulonlegesOsszesites,
  type KulonlegesTetel,
} from '@/lib/worklog/kulonleges-alkalom-shared'
import {
  addKulonlegesAlkalom,
  listKulonlegesAlkalmak,
  saveKulonlegesValasz,
  torolKulonlegesValasz,
} from '@/app/(dashboard)/munkanaplo/kulonleges-alkalom-actions'

// ─────────────────────────────────────────────────────────────────────────
// Adat-hook — EGY betöltés, amit a jelentés-dialógus és ez a lista is használ
// ─────────────────────────────────────────────────────────────────────────

/** A hook teljes állapota; a listának propként adjuk át (nincs kettős fetch). */
export interface KulonlegesAdat {
  tetelek: KulonlegesTetel[]
  osszesites: KulonlegesOsszesites
  needsSql: boolean
  hiba: string | null
  betoltes: boolean
  /** Teljes újratöltés a szerverről. */
  frissit: () => Promise<void>
  /** Optimista helyi módosítás (a koppintás után nincs teljes újratöltés). */
  patch: (kulcs: string, p: Partial<KulonlegesTetel>) => void
}

/** Sor-azonosító: a mentett sor id-je, különben a terv (program + nap) kulcsa. */
export function sorKulcs(t: KulonlegesTetel): string {
  return t.id || `terv:${t.programId || ''}|${t.tervezettDatum}`
}

/**
 * A különleges alkalmak betöltése egy évre. `aktiv=false` esetén nem tölt
 * (a jelentés-dialógus csak nyitáskor kapcsolja be).
 */
export function useKulonlegesAlkalmak(ev: number, aktiv: boolean): KulonlegesAdat {
  const [tetelek, setTetelek] = useState<KulonlegesTetel[]>([])
  const [needsSql, setNeedsSql] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [betoltes, setBetoltes] = useState(false)

  const ma = useMemo(() => maiDatum(), [])
  const osszesites = useMemo(
    () => (needsSql ? { ...URES_OSSZESITES } : szamolOsszesites(tetelek, ev, ma)),
    [tetelek, ev, ma, needsSql],
  )

  const frissit = useCallback(async () => {
    setBetoltes(true)
    try {
      const res = await listKulonlegesAlkalmak(ev)
      setNeedsSql(!!res.needsSql)
      setTetelek(res.tetelek || [])
      // A migráció-hiány NEM hiba, hanem állapot — külön (halkabb) sávot kap.
      setHiba(res.needsSql ? null : res.error || null)
    } catch {
      setHiba('Hálózati hiba — a különleges alkalmak nem tölthetők be.')
    } finally {
      setBetoltes(false)
    }
  }, [ev])

  useEffect(() => {
    if (!aktiv) return
    void frissit()
  }, [aktiv, frissit])

  const patch = useCallback((kulcs: string, p: Partial<KulonlegesTetel>) => {
    setTetelek((prev) => prev.map((t) => (sorKulcs(t) === kulcs ? { ...t, ...p } : t)))
  }, [])

  return { tetelek, osszesites, needsSql, hiba, betoltes, frissit, patch }
}

// ─────────────────────────────────────────────────────────────────────────
// Megjelenítő segédek
// ─────────────────────────────────────────────────────────────────────────

function tipusEmoji(tipus: string | null): string {
  if (!tipus) return '📌'
  return (PROG_TIPUS_EMOJI as Record<string, string>)[tipus] || '📌'
}

function tipusCimke(tipus: string | null): string {
  if (!tipus) return 'Külön rögzített'
  return (PROG_TIPUS_LABELS as Record<string, string>)[tipus] || 'Egyéb'
}

// ─────────────────────────────────────────────────────────────────────────
// A lista
// ─────────────────────────────────────────────────────────────────────────

export interface KulonlegesAlkalomListaProps {
  ev: number
  adat: KulonlegesAdat
  /** A jelentés véglegesítve van-e — csak passzív jelvényhez (nem tilt). */
  zarolva?: boolean
  /** Kompakt mód a véglegesítő wizard 2. lépéséhez (nincs saját fejléc-keret). */
  kompakt?: boolean
}

export function KulonlegesAlkalomLista({
  ev,
  adat,
  zarolva = false,
  kompakt = false,
}: KulonlegesAlkalomListaProps) {
  const { tetelek, osszesites, needsSql, hiba, betoltes, frissit, patch } = adat
  const ma = useMemo(() => maiDatum(), [])

  const [mentesFolyamatban, setMentesFolyamatban] = useState<string | null>(null)
  const [mentve, setMentve] = useState<Set<string>>(new Set())
  const [nyitottSorok, setNyitottSorok] = useState<Set<string>>(new Set())
  const [ketertelmuNyitva, setKetertelmuNyitva] = useState(false)
  const [ujNyitva, setUjNyitva] = useState(false)

  function jelezMentve(kulcs: string) {
    setMentve((prev) => new Set(prev).add(kulcs))
    window.setTimeout(() => {
      setMentve((prev) => {
        const next = new Set(prev)
        next.delete(kulcs)
        return next
      })
    }, 2000)
  }

  /** Egy sor mentése: a jelenlegi tétel + a most változott mezők. */
  const ment = useCallback(
    async (t: KulonlegesTetel, valtozas: Partial<KulonlegesTetel>) => {
      const kulcs = sorKulcs(t)
      const uj: KulonlegesTetel = { ...t, ...valtozas }
      const megtartva = uj.allapot === 'megtartva'
      const tenyleges = megtartva ? uj.tenylegesDatum || uj.tervezettDatum : null

      setMentesFolyamatban(kulcs)
      // Optimista: a felület azonnal reagál a koppintásra.
      patch(kulcs, {
        ...valtozas,
        tenylegesDatum: tenyleges,
        szeretetvendegseg: megtartva ? uj.szeretetvendegseg : false,
        resztvevok: megtartva ? uj.resztvevok : null,
        ev: tenyleges ? Number(tenyleges.slice(0, 4)) : Number(uj.tervezettDatum.slice(0, 4)),
        masEvbe: Number((tenyleges || uj.tervezettDatum).slice(0, 4)) !== ev,
      })

      const res = await saveKulonlegesValasz({
        id: uj.id || undefined,
        programId: uj.programId,
        tervezettDatum: uj.tervezettDatum,
        tenylegesDatum: tenyleges,
        cim: uj.cim,
        allapot: uj.allapot as KulonlegesAllapot,
        szeretetvendegseg: megtartva ? uj.szeretetvendegseg : false,
        resztvevok: megtartva ? uj.resztvevok : null,
        megjegyzes: uj.megjegyzes,
      })
      setMentesFolyamatban(null)

      if (res.needsSql) {
        toast.error(res.error || 'A funkció adatbázis-migrációra vár.')
        void frissit()
        return
      }
      if (res.error) {
        toast.error(res.error)
        // A szerver az igazság: visszatöltjük az állapotot, hogy a felület ne
        // mutasson olyan választ, ami valójában nem mentődött el.
        void frissit()
        return
      }
      if (res.id && !uj.id) {
        // Az új sor azonosítója megjött — a kulcs is átvált, ezért a „mentve"
        // jelzést már az ÚJ kulcsra tesszük.
        patch(kulcs, { id: res.id })
        jelezMentve(res.id)
        setNyitottSorok((prev) => {
          if (!prev.has(kulcs)) return prev
          const next = new Set(prev)
          next.delete(kulcs)
          next.add(res.id!)
          return next
        })
        return
      }
      jelezMentve(kulcs)
    },
    [ev, frissit, patch],
  )

  const visszavon = useCallback(
    async (t: KulonlegesTetel) => {
      if (!t.id) return
      setMentesFolyamatban(sorKulcs(t))
      const res = await torolKulonlegesValasz(t.id)
      setMentesFolyamatban(null)
      if (res.error) {
        toast.error(res.error)
        return
      }
      await frissit()
    },
    [frissit],
  )

  function toggleSor(kulcs: string) {
    setNyitottSorok((prev) => {
      const next = new Set(prev)
      if (next.has(kulcs)) next.delete(kulcs)
      else next.add(kulcs)
      return next
    })
  }

  // ── Blokkokra bontás ──
  const { esedekes, megvalaszolt, jovobeli, ketertelmuek, kihagyottak } = useMemo(() => {
    const esedekes: KulonlegesTetel[] = []
    const megvalaszolt: KulonlegesTetel[] = []
    const jovobeli: KulonlegesTetel[] = []
    const ketertelmuek: KulonlegesTetel[] = []
    const kihagyottak: KulonlegesTetel[] = []
    for (const t of tetelek) {
      if (t.allapot === 'nem_kulonleges') kihagyottak.push(t)
      else if (t.allapot) megvalaszolt.push(t)
      else if (t.ketertelmu) ketertelmuek.push(t)
      else if (t.tervezettDatum <= ma) esedekes.push(t)
      else jovobeli.push(t)
    }
    return { esedekes, megvalaszolt, jovobeli, ketertelmuek, kihagyottak }
  }, [tetelek, ma])

  // ── Migráció-hiány: barátságos, nem ijesztő ──
  if (needsSql) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-4">
        <div className="flex items-start gap-3">
          <Database className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              A különleges alkalmak nyilvántartása még nincs bekapcsolva
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Ez a rész akkor éled fel, ha lefut a 2026-08-11-es „különleges alkalmak"
              adatbázis-migráció. Addig minden más változatlanul működik — a jelentés
              III.4 és II.10 rubrikáját kézzel töltsd ki, ahogy eddig.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // FIGYELEM: a keret NEM lehet a renderben definiált komponens — az minden
  // rendernél új típus-identitást kapna, React újramountolná a teljes fát, és
  // a sorokban gépelt (még nem mentett) létszám/megjegyzés elveszne.
  return (
    <Keret kompakt={kompakt}>
      {/* Fejléc + összesítő (aria-live: a képernyőolvasó is követi a számokat) */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-heading text-sm text-foreground sm:text-base">
            Különleges alkalmak — {ev}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Csak a betervezett <strong className="text-foreground">különleges</strong> alkalmakra
            kérdezünk rá (szeretetvendégség, hangverseny, tábor, kirándulás…). Az istentiszteleteket
            és a bibliaórákat a munkanapló viszi — azokat itt nem kérdezzük.
          </p>
        </div>
        {betoltes && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>

      <div aria-live="polite" className="flex flex-wrap gap-1.5 text-[11px]">
        <Szamlalo label="Szeretetvendégség" ertek={osszesites.szeretetvendegseg} hangsuly />
        <Szamlalo label="Más alkalom" ertek={osszesites.egyeb} hangsuly />
        {osszesites.fuggoben > 0 && <Szamlalo label="Megerősítésre vár" ertek={osszesites.fuggoben} />}
        {osszesites.elmaradt > 0 && <Szamlalo label="Elmaradt" ertek={osszesites.elmaradt} />}
        {osszesites.masEvbe > 0 && <Szamlalo label={`Másik év jelentésébe`} ertek={osszesites.masEvbe} />}
      </div>

      {zarolva && (
        <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          <span>
            A(z) {ev}. évi jelentés véglegesítve — az itt rögzített alkalom már nem változtatja meg a
            beküldött számot. Rögzítheted, hogy a nyilvántartás teljes legyen.
          </span>
        </p>
      )}

      {hiba && (
        <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{hiba}</span>
        </p>
      )}

      {/* 1. Megerősítésre vár */}
      <Blokk cim="Megerősítésre vár" darab={esedekes.length} ures="Nincs megválaszolatlan alkalom.">
        {esedekes.map((t) => (
          <Sor
            key={sorKulcs(t)}
            t={t}
            ev={ev}
            nyitva={nyitottSorok.has(sorKulcs(t))}
            mentesFolyamatban={mentesFolyamatban === sorKulcs(t)}
            mentve={mentve.has(sorKulcs(t))}
            onToggle={() => toggleSor(sorKulcs(t))}
            onMent={ment}
            onVisszavon={visszavon}
          />
        ))}
      </Blokk>

      {/* 2. Megerősítve (összecsukott összefoglalók) */}
      {megvalaszolt.length > 0 && (
        <Blokk cim="Megerősítve" darab={megvalaszolt.length} ures="">
          {megvalaszolt.map((t) => (
            <Sor
              key={sorKulcs(t)}
              t={t}
              ev={ev}
              nyitva={nyitottSorok.has(sorKulcs(t))}
              mentesFolyamatban={mentesFolyamatban === sorKulcs(t)}
              mentve={mentve.has(sorKulcs(t))}
              onToggle={() => toggleSor(sorKulcs(t))}
              onMent={ment}
              onVisszavon={visszavon}
            />
          ))}
        </Blokk>
      )}

      {/* 3. Még nem esedékes — halvány, nem kérdez */}
      {jovobeli.length > 0 && (
        <details className="rounded-xl border border-border bg-muted/30">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-medium text-muted-foreground">
            Még nem esedékes ({jovobeli.length}) — {ev} későbbi napjaira tervezve
          </summary>
          <ul className="space-y-1 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            {jovobeli.map((t) => (
              <li key={sorKulcs(t)} className="flex flex-wrap items-baseline gap-x-2">
                <span aria-hidden>{tipusEmoji(t.tipus)}</span>
                <span className="text-foreground">{t.cim}</span>
                <span className="tabular-nums">{huRovidDatum(t.tervezettDatum)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* 4. Kétértelmű típusok — ALAPBÓL összecsukva, nem sürget */}
      {(ketertelmuek.length > 0 || kihagyottak.length > 0) && (
        <div className="rounded-xl border border-border bg-muted/30">
          <button
            type="button"
            onClick={() => setKetertelmuNyitva((v) => !v)}
            aria-expanded={ketertelmuNyitva}
            className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1">
              Ezekre is rákérdezzek? ({ketertelmuek.length})
              {kihagyottak.length > 0 && ` · ${kihagyottak.length} kihagyva`}
            </span>
            <ChevronDown className={cn('size-4 shrink-0 transition-transform', ketertelmuNyitva && 'rotate-180')} />
          </button>
          {ketertelmuNyitva && (
            <div className="space-y-2 border-t border-border p-3">
              <p className="text-[11px] leading-5 text-muted-foreground">
                Ezek a naptár-tételek (ünnep, nőszövetség, egyéb) lehetnek rutin és különleges
                alkalmak is — ezért alapból nem kérdezünk rájuk.
              </p>
              {ketertelmuek.map((t) => (
                <Sor
                  key={sorKulcs(t)}
                  t={t}
                  ev={ev}
                  nyitva={nyitottSorok.has(sorKulcs(t))}
                  mentesFolyamatban={mentesFolyamatban === sorKulcs(t)}
                  mentve={mentve.has(sorKulcs(t))}
                  onToggle={() => toggleSor(sorKulcs(t))}
                  onMent={ment}
                  onVisszavon={visszavon}
                />
              ))}
              {kihagyottak.length > 0 && (
                <div className="rounded-lg border border-dashed border-border p-2.5">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Kihagyva („ne kérdezd többé")
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {kihagyottak.map((t) => (
                      <li key={sorKulcs(t)} className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate text-muted-foreground" title={t.cim}>
                          {t.cim} · {huRovidDatum(t.tervezettDatum)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="min-h-11"
                          onClick={() => void visszavon(t)}
                          disabled={mentesFolyamatban === sorKulcs(t)}
                        >
                          <RotateCcw className="size-3.5" />
                          Mégis kérdezz rá
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Alkalom hozzáadása (nem volt betervezve) */}
      {ujNyitva ? (
        <UjAlkalomUrlap
          ev={ev}
          onMegse={() => setUjNyitva(false)}
          onKesz={async () => {
            setUjNyitva(false)
            await frissit()
          }}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          onClick={() => setUjNyitva(true)}
        >
          <CalendarPlus className="size-4" />
          Alkalom hozzáadása (nem volt betervezve)
        </Button>
      )}
    </Keret>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Egy sor
// ─────────────────────────────────────────────────────────────────────────

function Sor({
  t,
  ev,
  nyitva,
  mentesFolyamatban,
  mentve,
  onToggle,
  onMent,
  onVisszavon,
}: {
  t: KulonlegesTetel
  ev: number
  nyitva: boolean
  mentesFolyamatban: boolean
  mentve: boolean
  onToggle: () => void
  onMent: (t: KulonlegesTetel, valtozas: Partial<KulonlegesTetel>) => Promise<void>
  onVisszavon: (t: KulonlegesTetel) => Promise<void>
}) {
  // Helyi (nyers) szerkesztő-értékek — a mentés blur/váltáskor indul, hogy a
  // gépelés közben ne menjen kérés minden leütésre.
  const [letszam, setLetszam] = useState(t.resztvevok == null ? '' : String(t.resztvevok))
  const [megjegyzes, setMegjegyzes] = useState(t.megjegyzes || '')

  // Szinkron a szerverről érkező ÚJ értékre — RENDER közbeni igazítással, nem
  // effekttel (a `useEffect` + setState kaszkádoló újrarenderelést okoz, és a
  // lint szabály is tiltja). Csak akkor fut le, ha a prop TÉNYLEGESEN változott.
  const [elozoResztvevok, setElozoResztvevok] = useState(t.resztvevok)
  if (elozoResztvevok !== t.resztvevok) {
    setElozoResztvevok(t.resztvevok)
    setLetszam(t.resztvevok == null ? '' : String(t.resztvevok))
  }
  const [elozoMegjegyzes, setElozoMegjegyzes] = useState(t.megjegyzes)
  if (elozoMegjegyzes !== t.megjegyzes) {
    setElozoMegjegyzes(t.megjegyzes)
    setMegjegyzes(t.megjegyzes || '')
  }

  const megtartva = t.allapot === 'megtartva'
  const elmaradt = t.allapot === 'elmaradt'
  const valaszolt = megtartva || elmaradt

  const napnev = huNapNev(t.tervezettDatum)

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-3',
        megtartva ? 'border-emerald-500/40' : elmaradt ? 'border-border' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <span className="shrink-0 text-base leading-6" aria-hidden>
          {megtartva ? '✅' : elmaradt ? '⛔' : tipusEmoji(t.tipus)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-5 text-foreground">{t.cim}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
            <span className="tabular-nums">{huRovidDatum(t.tervezettDatum)}</span>
            {napnev && <span>· {napnev}</span>}
            {t.helyszin && <span>· {t.helyszin}</span>}
            <span>· {tipusCimke(t.tipus)}</span>
            {t.naptarbolTorolve && <span>· a naptárban már nem szerepel</span>}
            {/* 2026-08-11 (6. kör): a naptárban áthelyezett tétel — NEM új sor,
                ugyanaz az alkalom. A jelzés azért kell, hogy a lelkész lássa,
                miért más a dátum, mint amikor válaszolt rá. */}
            {t.athelyezveRolo && (
              <span>· a naptárban áthelyezve (eredetileg {huRovidDatum(t.athelyezveRolo)})</span>
            )}
          </p>
        </div>
        {mentesFolyamatban ? (
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : mentve ? (
          <span className="mt-0.5 shrink-0 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            mentve ✓
          </span>
        ) : null}
      </div>

      {/* 2026-08-11 (6. kör): TÖBB élő válasz ugyanarra a naptár-sorra (a régi,
          dátumos egyedi index hagyatéka). A lista egyesítette őket — de némán
          soha nem hagyjuk, mert a kettős számolás aláírt nyomtatványra menne. */}
      {t.duplikaltValasz && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-5 text-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Ehhez a naptár-tételhez több válasz is tartozott (valószínűleg a naptárban áthelyezett
            dátum miatt). Egyként számoljuk — ellenőrizd, hogy a lenti adat a helyes.
          </span>
        </p>
      )}

      {/* Átcsúszott alkalom — HANGOS, mert másik év jelentésébe számít */}
      {t.masEvbe && megtartva && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-5 text-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Ez az alkalom a(z) <strong>{t.ev}</strong>-es jelentésbe fog számítani, nem a(z) {ev}-esbe.
          </span>
        </p>
      )}

      {/* Gyorsút: KÉT csempe, egy koppintás */}
      {!valaszolt ? (
        <fieldset className="mt-2.5">
          <legend className="sr-only">{t.cim} — megtörtént-e?</legend>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-11 flex-1"
              disabled={mentesFolyamatban}
              onClick={() => void onMent(t, { allapot: 'megtartva' })}
            >
              <Check className="size-4" />
              Megvolt
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1"
              disabled={mentesFolyamatban}
              onClick={() => void onMent(t, { allapot: 'elmaradt' })}
            >
              <X className="size-4" />
              Nem volt
            </Button>
          </div>
          <button
            type="button"
            className="mt-1.5 min-h-11 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            disabled={mentesFolyamatban}
            onClick={() => void onMent(t, { allapot: 'nem_kulonleges' })}
          >
            Ez nem különleges alkalom — ne kérdezd többé
          </button>
        </fieldset>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              {megtartva ? (
                <>
                  Megtartva
                  {t.tenylegesDatum && t.tenylegesDatum !== t.tervezettDatum
                    ? ` — ${huRovidDatum(t.tenylegesDatum)}`
                    : ''}
                </>
              ) : (
                'Elmaradt'
              )}
            </p>
            <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={onToggle}>
              {nyitva ? 'Bezár' : 'Részletek'}
              <ChevronDown className={cn('size-3.5 transition-transform', nyitva && 'rotate-180')} />
            </Button>
          </div>

          {/* 2026-08-11 (6. kör, reviewer-major) — A LÉTSZÁM A SORON BELÜL.
              A tulajdonos kérésének a MÁSIK fele („hány személy volt ott")
              korábban a [Részletek] mögött lakott: soronként 3 extra interakció,
              egy évnyi alkalomra ~36 koppintás telefonon. Itt a [Megvolt] után
              AZONNAL látszik. Autofókusz SZÁNDÉKOSAN nincs — az minden sornál
              feldobná a billentyűzetet, és elrontaná az egykoppintásos gyorsutat. */}
          {megtartva && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Label
                htmlFor={`letszam-${t.id || t.programId || t.tervezettDatum}`}
                className="text-[11px] text-muted-foreground"
              >
                Hányan voltak?
              </Label>
              <Input
                id={`letszam-${t.id || t.programId || t.tervezettDatum}`}
                value={letszam}
                onChange={(e) => setLetszam(e.target.value.replace(/[^\d]/g, ''))}
                onBlur={() => {
                  const uj = letszam === '' ? null : Number(letszam)
                  if (uj === t.resztvevok) return
                  void onMent(t, { resztvevok: uj })
                }}
                inputMode="numeric"
                placeholder="fő"
                disabled={mentesFolyamatban}
                className="h-11 w-24 tabular-nums"
              />
              <span className="text-[11px] text-muted-foreground">
                {t.resztvevok == null ? 'nem kötelező' : 'fő'}
              </span>
              <PipaGomb
                kompakt
                bekapcsolva={t.szeretetvendegseg}
                disabled={mentesFolyamatban}
                onClick={() => void onMent(t, { szeretetvendegseg: !t.szeretetvendegseg })}
              >
                Szeretetvendégség
              </PipaGomb>
            </div>
          )}
        </>
      )}

      {/* Részletek — csak megválaszolt sornál, kérésre */}
      {valaszolt && nyitva && (
        <div className="mt-2.5 space-y-2.5 border-t border-border pt-2.5">
          {megtartva && (
            <div className="max-w-[14rem]">
              <Label className="text-[11px] text-muted-foreground">Más napon volt?</Label>
              <Input
                type="date"
                value={t.tenylegesDatum || t.tervezettDatum}
                onChange={(e) => {
                  const v = e.target.value
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return
                  void onMent(t, { tenylegesDatum: v })
                }}
                disabled={mentesFolyamatban}
                className="mt-1 h-11"
              />
            </div>
          )}

          <div>
            <Label className="text-[11px] text-muted-foreground">
              Egy mondat a jelentésbe (ki szolgált, mi történt)
            </Label>
            <Textarea
              value={megjegyzes}
              onChange={(e) => setMegjegyzes(e.target.value)}
              onBlur={() => {
                if ((megjegyzes || '') === (t.megjegyzes || '')) return
                void onMent(t, { megjegyzes: megjegyzes || null })
              }}
              rows={2}
              disabled={mentesFolyamatban}
              className="mt-1"
              placeholder="pl. A helyi fúvószenekar szolgált."
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {megtartva ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={mentesFolyamatban}
                onClick={() => void onMent(t, { allapot: 'elmaradt' })}
              >
                <X className="size-3.5" />
                Mégis elmaradt
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={mentesFolyamatban}
                onClick={() => void onMent(t, { allapot: 'megtartva' })}
              >
                <Check className="size-3.5" />
                Mégis megvolt
              </Button>
            )}
            {t.id && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 text-muted-foreground"
                disabled={mentesFolyamatban}
                onClick={() => void onVisszavon(t)}
              >
                <RotateCcw className="size-3.5" />
                Válasz visszavonása
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Új (nem betervezett) alkalom
// ─────────────────────────────────────────────────────────────────────────

function UjAlkalomUrlap({
  ev,
  onMegse,
  onKesz,
}: {
  ev: number
  onMegse: () => void
  onKesz: () => Promise<void>
}) {
  const [cim, setCim] = useState('')
  const [datum, setDatum] = useState(() => {
    const ma = maiDatum()
    // Ha nem a folyó évet jelentjük, az év utolsó napja a semleges alapérték.
    return ma.slice(0, 4) === String(ev) ? ma : `${ev}-12-31`
  })
  const [szv, setSzv] = useState(false)
  const [letszam, setLetszam] = useState('')
  const [ment, setMent] = useState(false)

  async function hozzaad() {
    if (!cim.trim()) {
      toast.error('Add meg az alkalom megnevezését.')
      return
    }
    if (datum.slice(0, 4) !== String(ev)) {
      toast.error(`Ez a dátum nem a(z) ${ev}. évben van — az alkalom másik év jelentésébe kerülne.`)
      return
    }
    setMent(true)
    const res = await addKulonlegesAlkalom({
      tervezettDatum: datum,
      tenylegesDatum: datum,
      cim: cim.trim(),
      allapot: 'megtartva',
      szeretetvendegseg: szv,
      resztvevok: letszam === '' ? null : Number(letszam),
    })
    setMent(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Az alkalom rögzítve.')
    await onKesz()
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="text-sm font-medium text-foreground">Megtartott alkalom rögzítése</p>
      <div>
        <Label className="text-[11px] text-muted-foreground">Megnevezés</Label>
        <Input
          value={cim}
          onChange={(e) => setCim(e.target.value)}
          placeholder="pl. Adventi szeretetvendégség"
          className="mt-1 h-11"
          disabled={ment}
        />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[9rem] flex-1">
          <Label className="text-[11px] text-muted-foreground">Mikor volt?</Label>
          <Input
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            className="mt-1 h-11"
            disabled={ment}
          />
        </div>
        <div className="min-w-[7rem] flex-1">
          <Label className="text-[11px] text-muted-foreground">Hányan voltak? (nem kötelező)</Label>
          <Input
            value={letszam}
            onChange={(e) => setLetszam(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            placeholder="fő"
            className="mt-1 h-11 tabular-nums"
            disabled={ment}
          />
        </div>
      </div>
      <PipaGomb bekapcsolva={szv} disabled={ment} onClick={() => setSzv((v) => !v)}>
        Szeretetvendégség volt (a III.4 rubrikába számít)
      </PipaGomb>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11 flex-1" onClick={() => void hozzaad()} disabled={ment}>
          {ment ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Hozzáadás
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={onMegse} disabled={ment}>
          Mégse
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Apró segéd-komponensek
// ─────────────────────────────────────────────────────────────────────────

/** Külső keret: önálló panel a munkanaplóban, keret nélküli sáv a wizardban. */
function Keret({ kompakt, children }: { kompakt: boolean; children: React.ReactNode }) {
  if (kompakt) return <div className="space-y-3">{children}</div>
  return <section className="space-y-3 rounded-2xl border border-border bg-card p-4">{children}</section>
}

function Szamlalo({ label, ertek, hangsuly }: { label: string; ertek: number; hangsuly?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1',
        hangsuly ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
      )}
    >
      {label}
      <strong className="tabular-nums">{ertek}</strong>
    </span>
  )
}

/** Pipa-kapcsoló 44px érintőcéllal (nincs Checkbox primitívünk).
 *  `kompakt` → sorba illeszkedő, tartalomhoz igazodó szélesség (a listasoron
 *  belüli szeretetvendégség-jelöléshez); a 44px magasság így is megmarad. */
function PipaGomb({
  bekapcsolva,
  disabled,
  kompakt = false,
  onClick,
  children,
}: {
  bekapcsolva: boolean
  disabled?: boolean
  kompakt?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={bekapcsolva}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
        kompakt ? 'w-auto shrink-0' : 'w-full',
        bekapcsolva
          ? 'border-primary/50 bg-primary/10 text-foreground'
          : 'border-border bg-card text-muted-foreground hover:bg-muted/50',
      )}
    >
      <span
        className={cn(
          'inline-flex size-5 shrink-0 items-center justify-center rounded-md border',
          bekapcsolva ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
        )}
        aria-hidden
      >
        {bekapcsolva && <Check className="size-3.5" />}
      </span>
      <span className="min-w-0">{children}</span>
    </button>
  )
}

function Blokk({
  cim,
  darab,
  ures,
  children,
}: {
  cim: string
  darab: number
  ures: string
  children: React.ReactNode
}) {
  if (darab === 0) {
    if (!ures) return null
    return (
      <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
        {ures}
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {cim} ({darab})
      </p>
      {children}
    </div>
  )
}
