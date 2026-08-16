'use client'

/**
 * „Egyházkerületünk" — az egyházkerület hivatalos törzsadatainak OLVASÓ
 * felülete (egyházkerületi S2, 2026-08-16).
 *
 * MIÉRT OLVASÓ, ÉS MIÉRT NEM ŰRLAP
 * ---------------------------------
 * A megyei párja (`our-diocese-section.tsx`) még kétarcú: egyszerre mutat és
 * szerkeszt, miközben UGYANAZOKAT a mezőket az „Egyházmegye beállításai"
 * varázsló is menti. Két írófelület egy törzsadatra = a „második felület a régi
 * implementációt őrzi" hibaosztály (lásd MEMORY): az egyik ág megkapja az új
 * mezőt (román név, pecsét, aláírás), a másik nem, és a felhasználó attól
 * függően lát mást, hogy melyik ajtón lépett be.
 *
 * A kerületi szint ezért TUDATOSAN egyirányú:
 *   · ez a szekció MUTAT (és elmagyaráz, ha valami hiányzik),
 *   · az ÍRÁS egyetlen helyen, az „Egyházkerület beállításai" varázslóban él.
 * A megjelenítő primitívek a KÖZÖS `summary-kit.tsx`-ből jönnek (ugyanaz a
 * kártya- és sor-nyelv, mint a „Gyülekezetünk adatai" és az „Egyházmegyénk"
 * ablakban) — nem másolat, hanem ugyanaz a komponens.
 *
 * KÉT SZERVER-AKCIÓ, EGY IGAZSÁG
 * -------------------------------
 * `getDistrict()` adja az ÉRTÉKEKET, `checkDistrictSetupStatus()` pedig azt,
 * hogy MI HIÁNYZIK. A hiánylistát SZÁNDÉKOSAN nem itt számoljuk ki: a szerveren
 * él a `REQUIRED_SETUP_FIELDS`, abból dolgozik a setup-banner és a varázsló is.
 * Ha itt saját listát tartanánk, előbb-utóbb más adatot követelne a banner és
 * mást ez az oldal — pontosan az a réteg-divergencia, amit a projekt már
 * többször megszenvedett. Ez a fájl csak FELIRATOT ad a szerver kulcsaihoz, és
 * ismeretlen kulcsot is kiír (nyersen), hogy egy új kötelező mező soha ne
 * tűnhessen el némán a felületről.
 *
 * A JOGOSULTSÁG-KAPU A SZERVEREN ÉL, A GOMB-ÁLLAPOT ITT
 * ------------------------------------------------------
 * A `canWrite` / `readOnlyReason` párost a HÍVÓ oldal adja, mert azt szerver
 * oldalon a `canWriteDistrictScope()` / `describeDistrictWriteBlock()` dönti el
 * (lásd `dashboard-kerulet/page.tsx`, ahol a `readOnlyScope` már ki van
 * számolva). Alapértelmezés: `canWrite=false` — FAIL-CLOSED. Ha a hívó
 * elfelejtené átadni, a felület olvasó marad; soha nem fordul elő, hogy egy
 * jogosulatlan felhasználó szerkesztő gombot kap.
 *
 * ⚠️ SZÁNDÉKOSAN LETILTVA, NEM ELREJTVE: a kerületi számvevő LÁTJA a gombot, de
 * nem tudja megnyomni, és mellette ott a magyar magyarázat, hogy miért. Az
 * elrejtés azt üzenné, hogy „ez a funkció nem létezik" — a letiltás azt, hogy
 * „létezik, de más kezében van". Ez utóbbi az igazság.
 */

import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  Database,
  FileText,
  Landmark,
  Lock,
  MapPin,
  Pencil,
  Phone,
  Stamp,
  StickyNote,
  Users,
  Wallet,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SummaryGroup as Group, SummaryRowLine as Row } from '@/components/modals/summary-kit'
import {
  checkDistrictSetupStatus,
  getDistrict,
  type DistrictRecord,
} from '@/app/(dashboard)/dashboard-kerulet/district-actions'

// ───────────────────────────────────────────────────────────────────────────
// Feliratok a szerver kötelező-mező kulcsaihoz
// ───────────────────────────────────────────────────────────────────────────

/**
 * A `checkDistrictSetupStatus().missingFields` kulcsainak magyar felirata és a
 * „mi áll meg nélküle" magyarázata.
 *
 * MIÉRT KELL A `miert`: ha csak annyit írnánk, hogy „hiányzik a CIF", a püspöki
 * hivatal munkatársa nem tudja eldönteni, hogy ez most sürgős-e. Így viszont
 * látja, mi nem készül el nélküle.
 *
 * ⚠️ A BANK ÉS A SZÁMVEVŐ NINCS A SZERVER LISTÁJÁN (Endre, 2026-08-15: „a banki
 * kontók beállítása később"), ezért itt sem szerepelhet — a felület nem
 * követelhet olyat, amit a varázsló maga sem kér.
 */
const MEZO_FELIRATOK: Record<string, { felirat: string; miert: string }> = {
  name: { felirat: 'Magyar hivatalos név', miert: 'ez áll minden irat fejlécén' },
  nev_ro: { felirat: 'Román hivatalos név', miert: 'a kétnyelvű fejléc ebből épül' },
  nev_en: { felirat: 'Angol név', miert: 'a nemzetközi levelezéshez' },
  cif: { felirat: 'CIF (adóazonosító)', miert: 'a pénzügyi bizonylatok kelléke' },
  adoszam: { felirat: 'Magyar adószám', miert: 'a magyarországi pályázatokhoz' },
  cim_orszag: { felirat: 'Ország', miert: 'a hivatalos cím része' },
  cim_megye: { felirat: 'Megye', miert: 'a hivatalos cím része' },
  cim_telepules: { felirat: 'Település', miert: 'a hivatalos cím része' },
  cim_iranyitoszam: { felirat: 'Irányítószám', miert: 'a hivatalos cím része' },
  cim_utca: { felirat: 'Utca, házszám', miert: 'a hivatalos cím része' },
  email: { felirat: 'E-mail cím', miert: 'ide érkezik a hivatalos levelezés' },
  telefon: { felirat: 'Telefonszám', miert: 'az iratok elérhetőség-rovata' },
  puspok_nev: { felirat: 'Püspök neve', miert: 'az aláírás-rovat neve' },
  puspok_cim: { felirat: 'Püspök tisztsége', miert: 'az aláírás alatti tisztség-szöveg' },
  adminisztrator_nev: { felirat: 'Adminisztrátor neve', miert: 'a második aláírás-rovat' },
  cimer_url: { felirat: 'Egyházkerületi címer', miert: 'a nyomtatványok fejlécképe' },
}

/**
 * ⛔ IDE NE KERÜLJÖN MÁSODIK KÖTELEZŐ-LISTA.
 *
 * TÜNET, AMIT EZ A KOMMENT ŐRIZ (2026-08-16): itt élt egy lokális
 * `KIEGESZITO_KOTELEZO = ['nev_ro']` konstans, mert a szerver
 * `REQUIRED_SETUP_FIELDS` listájából hiányzott a román név, miközben a
 * varázsló `setupSchema`-ja kötelezőként validálta. A tünet kezelése helyett a
 * SZERVER-lista egészült ki — az orvosolja a setup-bannert, a varázslót és ezt
 * az oldalt EGYSZERRE.
 *
 * Miért nem építünk ide újra ilyen listát: a két lista a KÖVETKEZŐ új kötelező
 * mezőnél megint széthúzna (a szerver kérné, a felület nem — vagy fordítva), és
 * a felhasználó attól függően látna mást, hogy melyik ajtón lépett be. Ha egy
 * mező hiányzik a hiánylistából, a javítás helye a `district-actions.ts`
 * `REQUIRED_SETUP_FIELDS`-je, nem ez a fájl.
 */

// ───────────────────────────────────────────────────────────────────────────
// Segédek
// ───────────────────────────────────────────────────────────────────────────

/** Egy mező kitöltött szöveges értéke — üres/whitespace/nem-szöveg esetén `null`. */
function szoveg(rekord: DistrictRecord | null, kulcs: keyof DistrictRecord): string | null {
  const ertek = rekord?.[kulcs]
  if (typeof ertek !== 'string') return null
  const tisztitott = ertek.trim()
  return tisztitott ? tisztitott : null
}

/** Weboldal-mezőből kattintható URL (a tárolt érték gyakran protokoll nélküli). */
function weboldalHref(ertek: string | null): string | undefined {
  if (!ertek) return undefined
  return ertek.startsWith('http') ? ertek : `https://${ertek}`
}

/** „2026. augusztus 16." alakú dátum — üres/hibás bemenetre `null`. */
function magyarDatum(nyers: string | null | undefined): string | null {
  if (!nyers) return null
  const d = new Date(nyers)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })
}

// ───────────────────────────────────────────────────────────────────────────
// A szekció
// ───────────────────────────────────────────────────────────────────────────

interface OurDistrictSectionProps {
  /**
   * Melyik egyházkerület? Ha nincs megadva, a szerver-akció a hívó SAJÁT
   * hatóköréből oldja fel — ez a szokásos eset („a mi kerületünk").
   */
  districtId?: string | null
  /**
   * Írhat-e a néző? A hívó SZERVER oldalon számolja ki
   * (`canWriteDistrictScope(access)`), mert a jogosultság egyetlen forrása a
   * szerver. Alapértelmezés: `false` (fail-closed).
   */
  canWrite?: boolean
  /**
   * Miért nem írhat — a `describeDistrictWriteBlock(access)` szövege. A
   * letiltott gomb MELLETT jelenik meg, hogy a felhasználó ugyanazt olvassa,
   * mint amit egy elutasított mentésnél kapna.
   */
  readOnlyReason?: string | null
  /**
   * Az „Egyházkerület beállításai" varázsló megnyitása. A shell/tab adja, mert
   * a varázsló dialógus-állapota ott él.
   *
   * Ha nincs megadva, a gomb a `kartoteka:open-district-setup-wizard`
   * window-eseményt küldi — ugyanaz a minta, amit a gyülekezeti setup-banner
   * használ (`kartoteka:open-congregation-setup-wizard`), hogy egy oldal
   * mélyéről is nyitható legyen a shell-ben élő ablak.
   */
  onOpenSetup?: () => void
}

export function OurDistrictSection({
  districtId,
  canWrite = false,
  readOnlyReason = null,
  onOpenSetup,
}: OurDistrictSectionProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rekord, setRekord] = useState<DistrictRecord | null>(null)
  const [hianyzoMezok, setHianyzoMezok] = useState<string[]>([])
  const [hianyzoMigracio, setHianyzoMigracio] = useState(false)

  useEffect(() => {
    let cancelled = false
    // queueMicrotask: az effect törzsében tilos a szinkron setState
    // (react-hooks/set-state-in-effect = ERROR) — a diocese-summary bevált mintája.
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
      const cel = districtId ?? undefined
      // A két kérés párhuzamosan fut: az egyik az ÉRTÉKEKET, a másik a
      // hiánylistát és a migráció állapotát hozza (lásd a fájl docblockját).
      void Promise.all([getDistrict(cel), checkDistrictSetupStatus(cel)])
        .then(([ertekek, allapot]) => {
          if (cancelled) return
          if (ertekek.error || !ertekek.data) {
            setRekord(null)
            setHianyzoMezok([])
            setHianyzoMigracio(false)
            setError(ertekek.error || 'Nem sikerült betölteni az egyházkerület adatait.')
          } else {
            setRekord(ertekek.data)
            // A hiánylista EGYETLEN forrása a szerver (lásd a fájl docblockját és
            // a fenti ⛔ kommentet): itt nem szűrünk, nem toldunk hozzá.
            setHianyzoMezok(allapot.missingFields)
            setHianyzoMigracio(allapot.hianyzoMigracio)
          }
          setLoading(false)
        })
        .catch(() => {
          if (cancelled) return
          // Migráció ELŐTTI adatbázisnál a lekérdezés dobhat. Ilyenkor HANGOS
          // magyar hibát adunk — örökké pörgő „betöltés…" helyett.
          setRekord(null)
          setError(
            'Az egyházkerület adatai nem tölthetők be. Ha a rendszer most frissült, ' +
              'valószínűleg még nem futott le az egyházkerületi adatbázis-bővítés — ' +
              'kérjük, jelezze a rendszergazdának.',
          )
          setLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [districtId])

  function nyisdMegABeallitast() {
    if (onOpenSetup) {
      onOpenSetup()
      return
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kartoteka:open-district-setup-wizard'))
    }
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Az egyházkerület adatainak betöltése…
      </div>
    )
  }

  if (error || !rekord) {
    return (
      <div className="card-raised border-rose-200 p-5 dark:border-rose-400/25">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">
            <AlertTriangle className="size-5" />
          </span>
          <p className="min-w-0 text-sm leading-relaxed text-rose-700 dark:text-rose-300">
            {error || 'Nem sikerült betölteni az egyházkerület adatait.'}
          </p>
        </div>
      </div>
    )
  }

  // A név-mezőket egyszer oldjuk fel — több blokk is használja őket.
  // ⚠️ Toldalékot NEM fűzünk hozzá (szemben a megyei `formatEgyhazmegyeNev`
  // helperrel): mindhárom élő kerület neve MÁR tartalmazza az „Egyházkerület"
  // szót, a sablonos hozzáfűzés csak duplázást gyártana.
  const nev = szoveg(rekord, 'name')
  const nevRo = szoveg(rekord, 'nev_ro')
  const nevEn = szoveg(rekord, 'nev_en')
  const cimerUrl = szoveg(rekord, 'cimer_url')
  const teszt = rekord.teszt === true

  // A hivatalos cím egyetlen olvasható sorban — a nyomtatványokéval azonos sorrend.
  const cimSor = [
    [szoveg(rekord, 'cim_iranyitoszam'), szoveg(rekord, 'cim_telepules')].filter(Boolean).join(' '),
    szoveg(rekord, 'cim_utca'),
    [szoveg(rekord, 'cim_megye'), szoveg(rekord, 'cim_orszag')].filter(Boolean).join(', '),
  ]
    .filter(Boolean)
    .join(', ')

  const email = szoveg(rekord, 'email')
  const telefon = szoveg(rekord, 'telefon')
  const weboldal = szoveg(rekord, 'weboldal')

  const bankNev = szoveg(rekord, 'bank_nev')
  const bankIban = szoveg(rekord, 'bank_fo_iban')
  const bankValuta = szoveg(rekord, 'bank_fo_iban_valuta')
  const vanBank = Boolean(bankNev || bankIban)

  const puspokNev = szoveg(rekord, 'puspok_nev')
  const puspokCim = szoveg(rekord, 'puspok_cim')
  const megjegyzes = szoveg(rekord, 'megjegyzes')
  const frissitve = magyarDatum(rekord.updated_at)

  return (
    <div className="space-y-4">
      {/* ── Hero ───────────────────────────────────────────────────────────
          Telített gradiens + fehér szöveg: sötét módban is helyes (nem pasztell
          felület, amit a sötét háttéren „világító folttá" tenne a téma). */}
      <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-600 p-5 text-white shadow-lg dark:border-white/10 sm:p-6">
        <div aria-hidden className="absolute -right-8 -top-10 size-40 rounded-full bg-white/15 blur-2xl" />
        <div aria-hidden className="absolute -bottom-12 left-10 size-36 rounded-full bg-white/10 blur-2xl" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {/* ⚠️ A címer-csempe háttere SZÁNDÉKOSAN marad papír-fehér, nem
                `bg-card`: a címer átlátszó hátterű, sötét vonalas PNG (mint a
                pecsét — lásd az `IratKep` docblockját). Token-alapú felületen
                sötét módban gyakorlatilag eltűnne, és a felhasználó azt hinné,
                nincs is feltöltve. A hero gradiense mindkét témában ugyanaz,
                ezért a fehér csempe itt nem „világító folt". */}
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/70 bg-white shadow-md">
              {cimerUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cimerUrl}
                  alt="Egyházkerületi címer"
                  className="h-full w-full object-contain p-1.5"
                />
              ) : (
                <Landmark className="size-9 text-indigo-500" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">
                Egyházkerületünk
              </p>
              <h2 className="font-heading text-2xl leading-tight sm:text-3xl">
                <span className="break-words">{nev || 'Egyházkerület'}</span>
                {teszt && (
                  // Endre kérése: éles használatban NE lehessen összekeverni a
                  // Teszt Egyházkerülettel — a jelzés a CÍM mellett áll, ahol a
                  // szem először jár, nem a lap alján.
                  <span className="ml-2 inline-flex -translate-y-0.5 items-center rounded-full bg-amber-300 px-2.5 py-0.5 align-middle text-[11px] font-bold uppercase tracking-wide text-amber-950 shadow-sm">
                    teszt
                  </span>
                )}
              </h2>
              {(nevRo || nevEn) && (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/85">
                  {nevRo && <span className="break-words">{nevRo}</span>}
                  {nevRo && nevEn && (
                    <span aria-hidden className="text-white/50">
                      ·
                    </span>
                  )}
                  {nevEn && <span className="break-words">{nevEn}</span>}
                </p>
              )}
            </div>
          </div>

          <div className="shrink-0">
            <Button
              size="sm"
              disabled={!canWrite}
              onClick={nyisdMegABeallitast}
              title={canWrite ? undefined : readOnlyReason || undefined}
              aria-describedby={canWrite ? undefined : 'kerulet-csak-olvasas'}
              // A sötét gomb-szín NEM téma-token, és ez itt helyes: a gomb a
              // hero gradiensén ül, ami sötét módban is UGYANAZ. Token-alapú
              // felülettel (`bg-card`) sötét módban beleolvadna a gradiensbe.
              className="w-full bg-slate-900/85 text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60 max-sm:min-h-11 sm:w-auto"
            >
              {canWrite ? <Pencil className="mr-1.5 size-4" /> : <Lock className="mr-1.5 size-4" />}
              Szerkesztés a beállításokban
            </Button>
          </div>
        </div>

        {teszt && (
          <p className="relative mt-3 rounded-xl bg-amber-950/25 px-3 py-2 text-xs leading-relaxed text-amber-50">
            Ez egy <strong>teszt egyházkerület</strong> — a benne rögzített adatok nem hivatalosak, és
            semmilyen valós jelentés nem épülhet rájuk. Ha éles munkát végezne, váltson profilt a
            fejlécben.
          </p>
        )}
      </div>

      {/* ── Ellenőri (számvevői) sáv ────────────────────────────────────────
          A gomb LÁTSZIK, de le van tiltva — itt jön hozzá a magyarázat. */}
      {!canWrite && (
        <div
          id="kerulet-csak-olvasas"
          className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Lock className="size-4" />
          </span>
          <div className="min-w-0 text-sm leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">Ellenőri nézet — csak megtekintés</p>
            <p className="mt-1">
              {readOnlyReason ||
                'Ezen az oldalon most csak megtekintheti és kinyomtathatja az egyházkerület adatait. ' +
                  'A módosítás az egyházkerületi adminisztrátor feladata.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Az adatbázis-bővítés hiánya ─────────────────────────────────────
          Ez NEM felhasználói mulasztás: a varázsló sem tudná eltárolni az
          adatokat, amíg az S2 migráció le nem fut. Ezért külön, más hangnemű
          kártya — a hiánylista helyett. */}
      {hianyzoMigracio && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-400/25 dark:bg-sky-400/10">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">
              <Database className="size-4" />
            </span>
            <div className="min-w-0 text-sm leading-relaxed text-sky-900 dark:text-sky-200">
              <p className="font-semibold">Az egyházkerületi törzsadat-bővítés még nem futott le</p>
              <p className="mt-1 text-xs leading-relaxed text-sky-800 dark:text-sky-200/80">
                Az egyházkerület hivatalos adatainak (román név, CIF, cím, vezetők, címer, pecsét)
                nincs még helye az adatbázisban, ezért az alábbi mezők üresek maradnak. Ez nem az Ön
                mulasztása — kérjük, jelezze a rendszergazdának, hogy futtassa le az egyházkerületi
                adatbázis-bővítést. A beállítás-varázsló addig is elindítható, de az új mezők mentése
                csak a bővítés után lesz teljes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Hiányzó kötelező adatok ─────────────────────────────────────────
          NEM néma üres mező: felsoroljuk, mi hiányzik és mi áll meg nélküle. */}
      {hianyzoMezok.length > 0 && !hianyzoMigracio && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-400/25 dark:bg-amber-400/10">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
              <AlertTriangle className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {hianyzoMezok.length === 1
                  ? 'Egy kötelező adat hiányzik'
                  : `${hianyzoMezok.length} kötelező adat hiányzik`}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-200/80">
                Ezek nélkül az egyházkerület hivatalos iratai hiányosan készülnek el. A pótlásuk az
                „Egyházkerület beállításai" varázslóban néhány perc.
              </p>
              <ul className="mt-2.5 space-y-1">
                {hianyzoMezok.map((kulcs) => {
                  // Ismeretlen kulcsnál is KIÍRUNK valamit (a nyers mezőnevet):
                  // ha a szerver új kötelező mezőt vezet be, ne tűnjön el némán.
                  const felirat = MEZO_FELIRATOK[kulcs]
                  return (
                    <li
                      key={kulcs}
                      className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-amber-900 dark:text-amber-200"
                    >
                      <span className="font-semibold">{felirat?.felirat || kulcs}</span>
                      {felirat?.miert && (
                        <span className="text-amber-700 dark:text-amber-200/70">
                          — {felirat.miert}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>

              <div className="mt-3">
                <Button
                  size="sm"
                  disabled={!canWrite}
                  onClick={nyisdMegABeallitast}
                  title={canWrite ? undefined : readOnlyReason || undefined}
                  aria-describedby={canWrite ? undefined : 'kerulet-csak-olvasas'}
                  className="w-full bg-amber-600 text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60 max-sm:min-h-11 sm:w-auto"
                >
                  {canWrite ? (
                    <Pencil className="mr-1.5 size-4" />
                  ) : (
                    <Lock className="mr-1.5 size-4" />
                  )}
                  Hiányzó adatok pótlása
                </Button>
                {!canWrite && (
                  <p className="mt-1.5 text-xs leading-relaxed text-amber-800 dark:text-amber-200/80">
                    A pótlás az egyházkerületi adminisztrátor feladata — kérjük, jelezze neki a
                    hiányt.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Adatkártyák ─────────────────────────────────────────────────────
          Mobilon egy hasáb, nagy képernyőn kettő; a hosszú értékek (IBAN,
          e-mail) a summary-kit sorában törnek, nem tolják el a lapot. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Group icon={<FileText className="size-4" />} title="Alapadatok" accent="sky">
          <Row
            label="Magyar hivatalos név"
            value={nev || undefined}
            copyText={nev || undefined}
            copyLabel="Magyar hivatalos név"
          />
          <Row
            label="Román név (hivatalos)"
            value={nevRo || undefined}
            copyText={nevRo || undefined}
            copyLabel="Román név"
          />
          <Row
            label="Angol név"
            value={nevEn || undefined}
            copyText={nevEn || undefined}
            copyLabel="Angol név"
          />
          <Row
            label="CIF (adóazonosító)"
            value={szoveg(rekord, 'cif') || undefined}
            mono
            copyText={szoveg(rekord, 'cif') || undefined}
            copyLabel="CIF"
          />
          <Row
            label="Magyar adószám"
            value={szoveg(rekord, 'adoszam') || undefined}
            mono
            copyText={szoveg(rekord, 'adoszam') || undefined}
            copyLabel="Adószám"
          />
          <Row label="Hivatali főszám" value={szoveg(rekord, 'cnp_letter') || undefined} mono />
        </Group>

        <Group icon={<MapPin className="size-4" />} title="Hivatalos cím" accent="rose">
          <Row
            label="Cím"
            value={cimSor || undefined}
            copyText={cimSor || undefined}
            copyLabel="Cím"
          />
        </Group>

        <Group icon={<Phone className="size-4" />} title="Elérhetőség" accent="teal">
          <Row
            label="E-mail"
            value={email || undefined}
            copyText={email || undefined}
            copyLabel="E-mail cím"
            href={email ? `mailto:${email}` : undefined}
          />
          <Row
            label="Telefon"
            value={telefon || undefined}
            mono
            copyText={telefon || undefined}
            copyLabel="Telefonszám"
            href={telefon ? `tel:${telefon.replace(/\s/g, '')}` : undefined}
          />
          <Row
            label="Weboldal"
            value={weboldal || undefined}
            copyText={weboldal || undefined}
            copyLabel="Weboldal"
            href={weboldalHref(weboldal)}
          />
        </Group>

        <Group icon={<Wallet className="size-4" />} title="Bankszámla" accent="violet">
          <Row
            label={`${bankNev || 'Bank'}${bankValuta ? ` (${bankValuta})` : ''}`}
            value={bankIban || undefined}
            mono
            copyText={bankIban || undefined}
            copyLabel={`${bankNev || 'Bank'} IBAN`}
          />
          {!vanBank && (
            // Endre döntése: a bankszámla NEM kötelező a varázslóban („a banki
            // kontók beállítása később"). Ezért itt sem piros hiba — nyugodt,
            // magyarázó jelzés, hogy a felhasználó tudja: ez így rendben van.
            <p className="px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
              A banki adatok még nincsenek megadva — ez most nem hiba. A bankszámla bármikor
              pótolható a beállításokban; a kerületi könyveléshez és az utalásos bizonylatokhoz lesz
              majd szükség rá.
            </p>
          )}
        </Group>

        <Group icon={<Users className="size-4" />} title="Vezetés" accent="amber">
          <Row
            // A `puspok_cim` TISZTSÉG-szöveg (a megyei `esperes_cim` tükre),
            // ezért a CÍMKÉBE kerül — nem az érték mellé.
            label={puspokCim ? `Püspök (${puspokCim})` : 'Püspök'}
            value={puspokNev || undefined}
          />
          <Row
            label="Egyházkerületi adminisztrátor"
            value={szoveg(rekord, 'adminisztrator_nev') || undefined}
          />
          <Row
            label="Egyházkerületi számvevő"
            value={szoveg(rekord, 'szamvevo_nev') || undefined}
          />
        </Group>

        <Group icon={<Stamp className="size-4" />} title="Pecsét és aláírás" accent="indigo">
          <div className="grid grid-cols-2 gap-3 p-4">
            <IratKep felirat="Hivatalos pecsét" url={szoveg(rekord, 'pecset_url')} />
            <IratKep felirat="Püspöki aláírás" url={szoveg(rekord, 'alairas_url')} />
          </div>
          <p className="px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
            Ezek a képek a kerület hivatalos nyomtatványaira kerülnek rá. Feltöltésük az
            „Egyházkerület beállításai" varázslóban történik.
          </p>
        </Group>

        {megjegyzes && (
          <div className="lg:col-span-2">
            <Group icon={<StickyNote className="size-4" />} title="Megjegyzés" accent="emerald">
              {/* `break-words`: a megjegyzés szabad szöveg — egy beillesztett
                  hosszú link vagy iktatószám szóköz nélkül telefonon
                  vízszintes görgetést csinálna az EGÉSZ lapon. */}
              <p className="whitespace-pre-line break-words px-4 py-3 text-sm leading-relaxed text-foreground">
                {megjegyzes}
              </p>
            </Group>
          </div>
        )}
      </div>

      {/* ── Lábjegyzet: mit LÁT és mit NEM lát a kerület ─────────────────────
          Endre K4 döntése (2026-08-15) itt is kimondva, hogy a kerületi
          munkatárs ne keresse hiába az egyházmegyék belső adatait. */}
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Building2 className="size-4" />
        </span>
        <div className="min-w-0 text-xs leading-relaxed text-muted-foreground">
          <p className="text-sm font-semibold text-foreground">Ez az oldal csak megtekintésre való</p>
          <p className="mt-1">
            Az adatok szerkesztése az „Egyházkerület beállításai" varázslóban történik — egyetlen
            helyen, hogy a hivatalos iratok mindig ugyanazt a törzsadatot használják.
          </p>
          <p className="mt-1">
            Az itt látható adatok a SAJÁT egyházkerület törzsadatai. Az egyházmegyék és a
            gyülekezetek belső adatait a kerület — az egyházi autonómia jegyében — nem látja; csak a
            hivatalosan felterjesztett dokumentumokat és azok összesítőjét.
          </p>
          {frissitve && <p className="mt-1">Utoljára frissítve: {frissitve}.</p>}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Belső komponensek
// ───────────────────────────────────────────────────────────────────────────

/**
 * Egy irat-kép (pecsét vagy aláírás) csempéje.
 *
 * ⚠️ A kép-doboz háttere SZÁNDÉKOSAN papír-fehér sötét módban is: a pecsét és az
 * aláírás átlátszó hátterű, SÖTÉT tintás PNG. Ha a csempe a téma sötét felületét
 * kapná, a kép gyakorlatilag láthatatlan lenne — és a felhasználó azt hinné,
 * hogy nincs is feltöltve. Így viszont pontosan úgy néz ki, ahogy a kinyomtatott
 * íven fog.
 */
function IratKep({ felirat, url }: { felirat: string; url: string | null }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {felirat}
      </p>
      {url ? (
        <div className="flex h-24 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={felirat} className="max-h-full max-w-full object-contain" />
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-2 text-center text-xs italic text-muted-foreground">
          Még nincs feltöltve
        </div>
      )}
    </div>
  )
}
