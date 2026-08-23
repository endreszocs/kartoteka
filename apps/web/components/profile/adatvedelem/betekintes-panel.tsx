'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Eye, Info, Loader2, RefreshCw } from 'lucide-react'

import { betekintesNaploBetoltes } from '@/app/(dashboard)/profile/adatvedelem-actions'
import {
  BETEKINTES_IDOTAVOK,
  BETEKINTES_PLAFON,
  type BetekintesSzelet,
} from '@/app/(dashboard)/profile/adatvedelem-shared'
import {
  NAPLO_KORLATOK,
  auditMondat,
  muveletSulya,
  type BetekintesBejegyzes,
  type MuveletSuly,
} from '@/lib/export/betekintes-naplo'

/**
 * BETEKINTÉS-KIMUTATÁS — kliens-panel (2026-08-23).
 *
 * ⚠️ A CÍM NEM ÍGÉRHET TÖBBET, MINT AMIT A NAPLÓ TUD. A rendszer a
 * VÁLTOZÁSOKAT naplózza, a puszta megtekintést ma nem. Ezt a panel alja
 * KIMONDJA (`NAPLO_KORLATOK`) — enélkül egy üres lista azt sugallná, hogy
 * „senki nem látta az adataimat", ami nem következik a naplóból.
 */

const SULY_STILUS: Record<MuveletSuly, string> = {
  belepes: 'bg-sky-50 text-sky-800 border-sky-200',
  letrehozas: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  modositas: 'bg-amber-50 text-amber-800 border-amber-200',
  torles: 'bg-rose-50 text-rose-800 border-rose-200',
  egyeb: 'bg-slate-50 text-slate-700 border-slate-200',
}

const SULY_CIMKE: Record<MuveletSuly, string> = {
  belepes: 'belépés',
  letrehozas: 'létrehozás',
  modositas: 'módosítás',
  torles: 'törlés',
  egyeb: 'egyéb',
}

type Allapot =
  | { nev: 'betolt' }
  | { nev: 'tiltva'; uzenet: string }
  | {
      nev: 'kesz'
      bejegyzesek: BetekintesBejegyzes[]
      naploElerheto: boolean
      megjegyzes: string | null
      csonkolt: boolean
    }

export function BetekintesPanel() {
  const [szelet, setSzelet] = useState<BetekintesSzelet>('gyulekezet')
  const [napok, setNapok] = useState<number>(90)
  const [allapot, setAllapot] = useState<Allapot>({ nev: 'betolt' })
  const [ujratolt, setUjratolt] = useState(0)

  // ⚠️ A „töltés" állapotot az ESEMÉNYKEZELŐK állítják be (lásd lentebb) — az
  //    effektben szinkron setState tilos (CI lint-hibaosztály: cascading render).
  useEffect(() => {
    let megszakitva = false
    betekintesNaploBetoltes(szelet, napok)
      .then((valasz) => {
        if (megszakitva) return
        if (!valasz.ok) {
          setAllapot({ nev: 'tiltva', uzenet: valasz.uzenet })
          return
        }
        setAllapot({
          nev: 'kesz',
          bejegyzesek: valasz.bejegyzesek,
          naploElerheto: valasz.naploElerheto,
          megjegyzes: valasz.megjegyzes,
          csonkolt: valasz.csonkolt,
        })
      })
      .catch(() => {
        if (!megszakitva) {
          setAllapot({
            nev: 'tiltva',
            uzenet: 'A kimutatás most nem tölthető be. Próbáld újra néhány perc múlva.',
          })
        }
      })
    return () => {
      megszakitva = true
    }
  }, [szelet, napok, ujratolt])

  // A szűrő-váltás és a frissítés EGYÜTT állítja a tiszta lapot és az új
  // paramétert — így az effekt sosem hív szinkron setState-et.
  const valasztSzelet = useCallback((ertek: BetekintesSzelet) => {
    setAllapot({ nev: 'betolt' })
    setSzelet(ertek)
  }, [])

  const valasztNapok = useCallback((ertek: number) => {
    setAllapot({ nev: 'betolt' })
    setNapok(ertek)
  }, [])

  const frissit = useCallback(() => {
    setAllapot({ nev: 'betolt' })
    setUjratolt((n) => n + 1)
  }, [])

  return (
    <section className="card-raised p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
          <Eye className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-xl text-slate-800">Ki nyúlt az adatokhoz?</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Közérthető kimutatás a rendszer naplójából: ki, mikor, milyen műveletet végzett. Csak
            azt látod, amihez jogosultságod van — a saját tevékenységedet, illetve a saját
            gyülekezeted adatain végzett műveleteket.
          </p>
        </div>
      </div>

      {/* ── Szűrők ────────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-slate-300 p-0.5">
          {(
            [
              { ertek: 'gyulekezet' as const, cimke: 'A gyülekezet adatai' },
              { ertek: 'sajat' as const, cimke: 'Saját tevékenységem' },
            ] satisfies { ertek: BetekintesSzelet; cimke: string }[]
          ).map((opcio) => (
            <button
              key={opcio.ertek}
              type="button"
              onClick={() => valasztSzelet(opcio.ertek)}
              aria-pressed={szelet === opcio.ertek}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                szelet === opcio.ertek
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {opcio.cimke}
            </button>
          ))}
        </div>

        <select
          value={napok}
          onChange={(e) => valasztNapok(Number(e.target.value))}
          className="rounded-full border border-slate-300 bg-transparent px-3 py-1.5 text-xs font-medium text-slate-700"
          aria-label="Időtáv"
        >
          {BETEKINTES_IDOTAVOK.map((t) => (
            <option key={t.napok} value={t.napok}>
              {t.cimke}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={frissit}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="size-3.5" />
          Frissítés
        </button>
      </div>

      {/* ── Tartalom ──────────────────────────────────────────────────────── */}
      <div className="mt-4">
        {allapot.nev === 'betolt' && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            A kimutatás betöltése…
          </p>
        )}

        {allapot.nev === 'tiltva' && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm leading-6 text-amber-900">{allapot.uzenet}</p>
              {szelet === 'gyulekezet' && (
                <button
                  type="button"
                  onClick={() => valasztSzelet('sajat')}
                  className="mt-2 text-xs font-medium text-amber-900 underline underline-offset-2"
                >
                  Mutasd a saját tevékenységemet
                </button>
              )}
            </div>
          </div>
        )}

        {allapot.nev === 'kesz' && !allapot.naploElerheto && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <p className="text-sm leading-6 text-amber-900">{allapot.megjegyzes}</p>
          </div>
        )}

        {allapot.nev === 'kesz' && allapot.naploElerheto && allapot.bejegyzesek.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <p className="text-sm leading-6 text-slate-700">
              A választott időszakban nincs naplózott művelet.{' '}
              <span className="text-slate-500">
                Ez nem jelenti azt, hogy senki nem nézte meg az adatokat — a megtekintést a rendszer
                ma nem naplózza.
              </span>
            </p>
          </div>
        )}

        {allapot.nev === 'kesz' && allapot.bejegyzesek.length > 0 && (
          <>
            <ol className="space-y-2">
              {allapot.bejegyzesek.map((b) => {
                const suly = muveletSulya(b)
                return (
                  <li
                    key={`${b.forras}-${b.id}`}
                    className="flex flex-col gap-1.5 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                  >
                    <p className="min-w-0 text-sm leading-6 text-slate-700">{auditMondat(b)}</p>
                    <span
                      className={`inline-flex w-fit shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${SULY_STILUS[suly]}`}
                    >
                      {SULY_CIMKE[suly]}
                    </span>
                  </li>
                )
              })}
            </ol>
            {allapot.csonkolt && (
              <p className="mt-3 text-xs leading-5 text-slate-500">
                A lista a legutóbbi {BETEKINTES_PLAFON} bejegyzést mutatja. Régebbi eseményekhez
                válassz rövidebb időtávot, vagy kérd a rendszergazdától a teljes naplót.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── A napló korlátai — KIMONDVA ───────────────────────────────────── */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Info className="size-3.5" />
          Mit tud és mit nem tud ez a kimutatás
        </p>
        <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-600">
          {NAPLO_KORLATOK.map((sor) => (
            <li key={sor} className="flex gap-2">
              <span aria-hidden="true">·</span>
              <span>{sor}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
