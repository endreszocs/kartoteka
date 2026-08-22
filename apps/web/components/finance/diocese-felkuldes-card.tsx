'use client'

/**
 * „Felküldés az egyházkerületnek" kártya — CSAK megyei hatókörben.
 *
 * MIÉRT (egyházmegyei terv, 3.4 + 3.6, Endre 3. döntése): a megye SAJÁT
 * számadását / költségvetését / költségvetés-módosítását ugyanaz a
 * véglegesítés-gomb zárja le, mint a gyülekezetekét — a beküldés célja viszont
 * eggyel feljebb, az EGYHÁZKERÜLET. A kerületi FOGADÓ felület a 3. szint külön
 * körében épül; addig ez a kártya az egyetlen hely, ahol az esperesi hivatal
 * LÁTJA, mi ment fel, mikor — és ahonnan pótolhatja, ha a felküldés valamiért
 * (hálózat, hiányzó migráció, beállítatlan egyházkerület) elmaradt.
 *
 * FAIL-CLOSED felület: ha az állapot betöltése hibára fut, HIBÁT írunk ki, nem
 * „nincs felküldve" képet — az utóbbi arra bírná a lelkészt, hogy másodszor is
 * felküldje azt, ami már fent van.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 2026-08-17 (KERÜLETI S5) — EZ A KÁRTYA KERÜLETI NÉZETBEN NEM JELENHET MEG
 * ─────────────────────────────────────────────────────────────────────────────
 * Endre K3 döntése: az EGYHÁZKERÜLET FÖLÖTT NINCS negyedik szint. A kártya
 * három dolgot állít, és kerületi hatókörben MIND A HÁROM hamis volna:
 *   1. „Felküldés az egyházkerületnek" — a kerület önmagának küldene fel;
 *   2. a `felterjesztMegyeiSzamadas` / `felterjesztMegyeiKoltsegvetes` szerver
 *      akciók SZÁNDÉKOSAN `scope === 'diocese'`-hez kötöttek, tehát a gomb
 *      hibaüzenettel bukna („csak egyházmegyei nézetben értelmezhető");
 *   3. a `getDioceseFinalizedAccountings` 2026-08-17 óta KERÜLETI hatókörben is
 *      ad adatot — a kerület véglegesített évei tehát megjelennének a
 *      „Véglegesített egyházmegyei számadások" felirat alatt. Ez az a fajta
 *      néma félrecímkézés, amiből később hivatalos irat lesz.
 *
 * A VALÓDI megjelenítési kapu a hívónál van: `accounting-tab-v2.tsx`
 * (`const megyei = props.scope === 'diocese'`) — az `=== 'diocese'` alak a
 * kerületet helyesen kizárja. A lenti `scope` prop ennek az ÖV-ÉS-NADRÁGTARTÓ
 * párja: ha egy jövőbeli hívó mégis átadná a kerületi hatókört, a kártya
 * magától nem renderel. A prop OPCIONÁLIS és 'diocese' az alapértéke, ezért a
 * MAI hívó (ami nem ad át semmit) viselkedése BYTE-RA változatlan.
 */

import { useCallback, useEffect, useState, useTransition } from 'react'
import { BadgeCheck, Loader2, RefreshCw, Send, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  felterjesztMegyeiKoltsegvetes,
  felterjesztMegyeiSzamadas,
  getDioceseFelterjesztesAllapot,
  getDioceseFinalizedAccountings,
} from '@/app/(dashboard)/penzugy/actions'
import type { BealitasRow } from '@/lib/constants/finance'
// 2026-08-17 (kerületi S5): a hatókör KANONIKUS típusa (import-mentes mag,
// kliens-oldalon is biztonságos).
import type { FinanceScope } from '@/lib/auth/finance-scope-core'

interface Props {
  year: number
  /** A megyei évi beállítás-sor (normalizált alak) — a véglegesítés-zászlókhoz. */
  settings: BealitasRow
  /** Ellenőri (számvevői) nézet: a felküldés-gombok nem jelennek meg. */
  readOnly?: boolean
  /**
   * 2026-08-17 (kerületi S5) — ÖV-ÉS-NADRÁGTARTÓ (a MIÉRT a fájl fejlécében).
   * A kártya KIZÁRÓLAG egyházmegyei hatókörben értelmes; bármi más értéknél
   * `null`-t rendel. Alapérték `'diocese'`, hogy a mai (paramétert nem adó)
   * hívóhely viselkedése bit-azonos maradjon.
   */
  scope?: FinanceScope
}

type Tetel = {
  kulcs: string
  cim: string
  /** Véglegesítve van-e a megyénél (enélkül nincs mit felküldeni). */
  veglegesitve: boolean
  /** 0 = számadás/alap költségvetés, 1–3 = költségvetés-módosítás. */
  modNumber: 0 | 1 | 2 | 3
  fajta: 'szamadas' | 'koltsegvetes'
}

/** ISO időbélyeg → rövid magyar dátum (a nap pontosság elég a pecséthez). */
function rovidDatum(iso: string | null): string | null {
  if (!iso) return null
  const nap = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(nap) ? nap.replace(/-/g, '. ') + '.' : null
}

export function DioceseFelkuldesCard({
  year,
  settings,
  readOnly = false,
  scope = 'diocese',
}: Props) {
  // A kapu ÉRTÉKE itt dől el, de a `return null` csak a hookok UTÁN állhat
  // (React hook-szabály) — lásd lentebb.
  const megyeiHatokor = scope === 'diocese'
  const [allapot, setAllapot] = useState<
    | { fazis: 'toltes' }
    | { fazis: 'hiba'; uzenet: string }
    | { fazis: 'kesz'; sorok: Record<string, { submittedAt: string | null; status: string }> }
  >({ fazis: 'toltes' })
  const [kuldes, startKuldes] = useTransition()
  // A megye SAJÁT zárszámadás-tára (`diocese_annual_reports`) — évek a
  // véglegesítés dátumával. Ez a tábla évekig ÍRÓDOTT, de senki nem olvasta
  // (a terv „zsákutcaként" rögzítette): innentől ez a sáv a fogyasztója.
  const [evek, setEvek] = useState<
    Array<{ year: number; finalizedAt: string | null }> | null
  >(null)

  const betolt = useCallback(async () => {
    const [res, evekRes] = await Promise.all([
      getDioceseFelterjesztesAllapot(year),
      getDioceseFinalizedAccountings(),
    ])
    // A véglegesített évek sávja KIEGÉSZÍTŐ információ: ha nem jön, a kártya
    // fő tartalma (felküldés-állapot) attól még helyes — ezért nem visz hibába.
    setEvek(evekRes.error ? [] : (evekRes.years || []).map((e) => ({ year: e.year, finalizedAt: e.finalizedAt })))
    if (res.error) {
      setAllapot({ fazis: 'hiba', uzenet: res.error })
      return
    }
    const terkep: Record<string, { submittedAt: string | null; status: string }> = {}
    for (const sor of res.rows || []) {
      terkep[`${sor.docType}#${sor.modificationNumber}`] = {
        submittedAt: sor.submittedAt,
        status: sor.status,
      }
    }
    setAllapot({ fazis: 'kesz', sorok: terkep })
  }, [year])

  useEffect(() => {
    // ⛔ Nem-megyei hatókörben NEM indítunk lekérést: a felterjesztés-állapot
    // fogalma is csak a megyénél létezik, és a kártya úgysem renderel.
    if (!megyeiHatokor) return
    let elavult = false
    // Az effect törzsében nincs szinkron setState — a betöltés microtaskban indul.
    queueMicrotask(() => {
      if (elavult) return
      void betolt()
    })
    return () => {
      elavult = true
    }
  }, [betolt, megyeiHatokor])

  // ⛔ 2026-08-17 (kerületi S5): a fail-closed kapu — a hookok UTÁN, hogy a
  // hook-sorrend minden rendereléskor azonos legyen. A MIÉRT a fájl fejlécében:
  // az egyházkerület fölött nincs szint (K3), ennek a kártyának ott nincs
  // igaz állítása.
  if (!megyeiHatokor) return null

  const tetelek: Tetel[] = ([
    {
      kulcs: 'megyei_szamadas#0',
      cim: `${year}. évi egyházmegyei számadás`,
      veglegesitve: !!settings.accounting_finalized,
      modNumber: 0,
      fajta: 'szamadas',
    },
    {
      kulcs: 'megyei_koltsegvetes#0',
      cim: `${year}. évi egyházmegyei költségvetés`,
      veglegesitve: !!settings.budget_finalized,
      modNumber: 0,
      fajta: 'koltsegvetes',
    },
    {
      kulcs: 'megyei_koltsegvetes_modositas#1',
      cim: '1. költségvetés-módosítás',
      veglegesitve: !!settings.budget_mod1_finalized,
      modNumber: 1,
      fajta: 'koltsegvetes',
    },
    {
      kulcs: 'megyei_koltsegvetes_modositas#2',
      cim: '2. költségvetés-módosítás',
      veglegesitve: !!settings.budget_mod2_finalized,
      modNumber: 2,
      fajta: 'koltsegvetes',
    },
    {
      kulcs: 'megyei_koltsegvetes_modositas#3',
      cim: '3. költségvetés-módosítás',
      veglegesitve: !!settings.budget_mod3_finalized,
      modNumber: 3,
      fajta: 'koltsegvetes',
    },
  ] as Tetel[]).filter((t) => t.veglegesitve)

  function felkuld(tetel: Tetel) {
    startKuldes(async () => {
      const res =
        tetel.fajta === 'szamadas'
          ? await felterjesztMegyeiSzamadas(year)
          : await felterjesztMegyeiKoltsegvetes(
              year,
              tetel.modNumber === 0 ? null : (tetel.modNumber as 1 | 2 | 3),
              null,
            )
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`${tetel.cim} felküldve az egyházkerületnek!`)
      await betolt()
    })
  }

  return (
    <div className="card-raised mb-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Send className="size-4 text-teal-600" />
        <p className="text-base font-semibold text-foreground">Felküldés az egyházkerületnek</p>
        <Badge
          variant="outline"
          className="rounded-full border-teal-200 text-teal-700 dark:border-teal-400/40 dark:text-teal-300"
        >
          {year}
        </Badge>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        A véglegesített egyházmegyei iratok az egyházkerülethez kerülnek. A kerületi felület
        külön körben készül el — a felküldés ténye, ideje és tartalma addig is rögzül, hogy
        semmit ne kelljen utólag papírokból pótolni.
      </p>

      {allapot.fazis === 'toltes' && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Felküldések állapota betöltés alatt…
        </p>
      )}

      {allapot.fazis === 'hiba' && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 dark:border-amber-400/30 dark:bg-amber-400/10">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-200">
            {allapot.uzenet}
          </p>
        </div>
      )}

      {allapot.fazis === 'kesz' && tetelek.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Erre az évre még nincs véglegesített egyházmegyei irat. Amint a Számadás vagy a
          Költségvetés fülön véglegesítesz, az irat automatikusan felkerül ide.
        </p>
      )}

      {allapot.fazis === 'kesz' && tetelek.length > 0 && (
        <ul className="mt-3 space-y-2">
          {tetelek.map((tetel) => {
            const sor = allapot.sorok[tetel.kulcs]
            const datum = rovidDatum(sor?.submittedAt ?? null)
            const felkuldve = !!sor && sor.status !== 'draft'
            return (
              <li
                key={tetel.kulcs}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2"
              >
                <span className="text-sm text-foreground">{tetel.cim}</span>
                {felkuldve ? (
                  <Badge className="gap-1 rounded-full border border-emerald-300/70 bg-emerald-100 px-2.5 py-1 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-400/40 dark:bg-emerald-400/15 dark:text-emerald-300">
                    <BadgeCheck className="size-3.5" />
                    Felküldve{datum ? ` · ${datum}` : ''}
                  </Badge>
                ) : readOnly ? (
                  <Badge
                    variant="outline"
                    className="rounded-full border-amber-300 text-amber-700 dark:border-amber-400/40 dark:text-amber-300"
                  >
                    Még nincs felküldve
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl max-sm:min-h-10 border-teal-200 text-teal-700 hover:bg-teal-50 dark:border-teal-400/40 dark:text-teal-300"
                    onClick={() => felkuld(tetel)}
                    disabled={kuldes}
                  >
                    {kuldes ? (
                      <Loader2 className="mr-1 size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 size-3.5" />
                    )}
                    Felküldés pótlása
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {evek && evek.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Véglegesített egyházmegyei számadások
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {evek.map((e) => (
              <Badge
                key={e.year}
                variant="outline"
                className="rounded-full border-border text-foreground"
                title={
                  rovidDatum(e.finalizedAt)
                    ? `Véglegesítve: ${rovidDatum(e.finalizedAt)}`
                    : 'Véglegesítve'
                }
              >
                {e.year}
                {rovidDatum(e.finalizedAt) ? ` · ${rovidDatum(e.finalizedAt)}` : ''}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
