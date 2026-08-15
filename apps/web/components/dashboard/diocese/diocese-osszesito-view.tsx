'use client'

/**
 * EGYHÁZMEGYEI ÖSSZESÍTŐ — felület (2026-08-15, terv 3.5 + 3.6).
 *
 * MIT MUTAT: a megye gyülekezetei által VÉGLEGESÍTETT és beküldött iratok
 * megyei összesítését évenként — számadás, költségvetés, vagyonleltár,
 * választók névjegyzéke, lelkészi jelentés —, és innen megy fel az összesítő
 * az egyházkerületnek (KÜLÖN véglegesítési út a megye SAJÁT iratai mellett,
 * Endre 3. döntése).
 *
 * FAIL-CLOSED FELÜLET: minden szakasz kimondja, HÁNY és MELYIK gyülekezet
 * adata hiányzik belőle. Egy „kerek" végösszeg, ami mögött fél megye hiánya
 * áll, rosszabb, mint a nyílt hiány — az esperes ebből tudja, kit kell
 * megsürgetnie a felküldés előtt.
 *
 * Design: a gyülekezeti felülettel AZONOS nyelv (card-raised, rounded-2xl,
 * emerald/teal), mobilon is teljes értékű (a táblák saját vízszintes
 * görgetőben, a fejléc-sáv törhető).
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import {
  BadgeCheck,
  ChevronDown,
  ClipboardList,
  Loader2,
  Printer,
  RefreshCw,
  Send,
  TriangleAlert,
  Users,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'

import { FinalizeButton } from '@kartoteka/ui-app'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  getMegyeiOsszesito,
  kerjOsszesitoFeloldas,
  veglegesitEsFelkuldOsszesito,
} from '@/app/(dashboard)/dashboard-egyhazmegye/osszesito-actions'
import type { OsszesitoOldalAdat } from '@/app/(dashboard)/dashboard-egyhazmegye/osszesito-shared'
import type { KodSor, TipusAllapot } from '@/lib/diocese/osszesito-core'
import { buildOsszesitoPrintHtml } from '@/lib/diocese/osszesito-print'
import { printToBrowser } from '@/lib/utils/print-engine-v2'

interface Props {
  /** A szerver-oldalon már kiszámolt első év — így nincs üres első képernyő. */
  kezdoAdat: OsszesitoOldalAdat
  kezdoEv: number
}

function penz(n: number): string {
  return n.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function rovidDatum(iso: string | null | undefined): string | null {
  if (!iso) return null
  const nap = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(nap) ? nap.replace(/-/g, '. ') + '.' : null
}

export function DioceseOsszesitoView({ kezdoAdat, kezdoEv }: Props) {
  const [ev, setEv] = useState(kezdoEv)
  const [adat, setAdat] = useState<OsszesitoOldalAdat>(kezdoAdat)
  const [toltes, setToltes] = useState(false)
  const [muvelet, startMuvelet] = useTransition()

  const betolt = useCallback(async (celEv: number) => {
    setToltes(true)
    try {
      const friss = await getMegyeiOsszesito(celEv)
      setAdat(friss)
    } finally {
      setToltes(false)
    }
  }, [])

  // Év-váltáskor újratöltés. Az effect TÖRZSÉBEN nincs szinkron setState — a
  // betöltés microtaskban indul (a repó bevett mintája).
  useEffect(() => {
    if (ev === kezdoEv) return
    let elavult = false
    queueMicrotask(() => {
      if (!elavult) void betolt(ev)
    })
    return () => {
      elavult = true
    }
  }, [ev, kezdoEv, betolt])

  const o = adat.osszesito
  const evek = useMemo(() => {
    const halmaz = new Set<number>(adat.evek || [])
    halmaz.add(ev)
    return [...halmaz].sort((a, b) => b - a)
  }, [adat.evek, ev])

  const felkuldve = adat.felkuldes
    ? adat.felkuldes.status === 'submitted' || adat.felkuldes.status === 'received'
    : false

  function felkuld() {
    startMuvelet(async () => {
      const res = await veglegesitEsFelkuldOsszesito(ev)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`A(z) ${ev}. évi összesítő véglegesítve és felküldve az egyházkerületnek!`)
      await betolt(ev)
    })
  }

  async function feloldasKeres(indoklas: string) {
    const res = await kerjOsszesitoFeloldas(ev, indoklas)
    if (res.error) {
      toast.error(res.error)
      return { error: res.error }
    }
    if (res.visszavonva) {
      toast.success(
        'A felküldést visszavontuk — az egyházkerület még nem vette át. Javíts, majd véglegesítsd újra.',
      )
    } else {
      toast.success('A feloldási kérelmet rögzítettük — az egyházkerület bírálja el.')
    }
    await betolt(ev)
    return { success: true }
  }

  async function nyomtat() {
    if (!o) return
    try {
      await printToBrowser(
        buildOsszesitoPrintHtml(o, {
          egyhazmegyeNev: adat.dioceseNev ?? null,
          felkuldveEkkor: adat.felkuldes?.submittedAt ?? null,
        }),
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A nyomtatás nem indítható el.')
    }
  }

  // ── Fail-closed hiba: nincs hatókör vagy nem olvasható az adat ────────────
  if (adat.error) {
    return (
      <div className="card-raised rounded-2xl border-amber-300/60 p-5 dark:border-amber-400/30">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div>
            <h2 className="font-heading text-base text-foreground">
              Az összesítő most nem jeleníthető meg
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{adat.error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Fejléc-sáv: év-választó + műveletek + EGYSÉGES véglegesítés-gomb ── */}
      <div className="card-raised rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <ClipboardList className="size-4 text-teal-600" />
          <p className="text-base font-semibold text-foreground">
            {ev}. évi egyházmegyei összesítő
          </p>
          {toltes && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl max-sm:min-h-10"
              onClick={() => void nyomtat()}
              disabled={!o || toltes}
            >
              <Printer className="mr-1 size-3.5" />
              Nyomtatás
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl max-sm:min-h-10"
              onClick={() => void betolt(ev)}
              disabled={toltes}
            >
              <RefreshCw className="mr-1 size-3.5" />
              Frissítés
            </Button>
            {/* A KÖZÖS véglegesítés-gomb — ugyanaz a komponens, ugyanaz a
                viselkedés, mint a hat gyülekezeti iratnál; a címzett viszont
                itt az EGYHÁZKERÜLET (Endre 3. döntése: két külön út). */}
            {adat.canWrite && !adat.felkuldesHiba && (
              <FinalizeButton
                documentLabel="egyházmegyei összesítő"
                year={ev}
                finalized={felkuldve}
                finalizedAt={adat.felkuldes?.submittedAt ?? null}
                unlockRequested={adat.felkuldes?.unlockRequested ?? false}
                finalizeLabel="Véglegesítés és felküldés"
                confirmDescription={
                  'Az összesítő a gyülekezetek eddig beküldött, véglegesített iratainak megyei ' +
                  'összegzése. A véglegesítéssel a mostani állapot fagyasztott pillanatképként ' +
                  'felkerül az egyházkerülethez.'
                }
                confirmBullets={[
                  'A felküldött csomag azt tartalmazza, ami MOST szerepel az összesítőben — a később érkező gyülekezeti iratok NEM kerülnek bele automatikusan.',
                  'Amíg az egyházkerület nem vette át, a „Feloldás kérése" gombbal visszavonhatod a felküldést, és javítás után újraküldheted.',
                ]}
                disabled={muvelet || toltes}
                onFinalize={felkuld}
                onRequestUnlock={feloldasKeres}
                unlockAuthorityLabel="az egyházkerület"
                unlockPlaceholder="Pl. Sepsi gyülekezet a felküldés után küldte be a számadását, ezért újra kell számolni az összesítőt."
              />
            )}
          </div>
        </div>

        {/* Év-választó chipek — a megyében ténylegesen létező évek. */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {evek.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEv(e)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition max-sm:min-h-9 ${
                e === ev
                  ? 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-400/40 dark:bg-teal-400/15 dark:text-teal-300'
                  : 'border-border text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {e}.
            </button>
          ))}
        </div>

        {/* Számvevői (ellenőri) nézet magyarázata — a gomb hiánya sose legyen néma. */}
        {!adat.canWrite && (
          <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-sm leading-relaxed text-sky-900 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200">
            {adat.readOnlyReason ||
              'Ellenőri nézet: az összesítőt megtekintheted és kinyomtathatod, a felküldés az esperesi hivatal feladata.'}
            {felkuldve && adat.felkuldes?.submittedAt
              ? ` Az összesítő felküldve: ${rovidDatum(adat.felkuldes.submittedAt)}`
              : ''}
          </p>
        )}

        {/* A felküldés-állapot betöltési hibája — nem hallgatjuk el. */}
        {adat.felkuldesHiba && (
          <p className="mt-3 rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
            {adat.felkuldesHiba}
          </p>
        )}

        {/* Feloldás-oszlopok hiánya (migráció) — csak a feloldás útját érinti. */}
        {adat.felkuldes?.feloldasOszlopokHianyoznak && (
          <p className="mt-3 rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
            A feloldás-kérés nyilvántartásához szükséges adatbázis-oszlopok még hiányoznak
            (2026-08-15-egyhazmegyei-osszesito-feloldas.sql). Az összesítő és a felküldés
            működik; a már átvett összesítő feloldás-kérése az SQL lefuttatásáig nem rögzíthető.
          </p>
        )}

        {/* Az egyházkerület visszaküldte — az indoklás nélkül a megye nem tudná,
            mit javítson. (A kerületi felület külön körben épül; a mező már él.) */}
        {adat.felkuldes?.status === 'returned' && (
          <p className="mt-3 rounded-xl border border-rose-300/60 bg-rose-50/60 p-3 text-sm leading-relaxed text-rose-900 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200">
            Az egyházkerület javításra visszaküldte ezt az összesítőt.
            {adat.felkuldes.returnedReason ? ` Indoklás: ${adat.felkuldes.returnedReason}` : ''} A
            javítás után véglegesítsd és küldd fel újra.
          </p>
        )}

        {/* „A felküldés óta újabb irat érkezett" — a csomag már nem teljes. */}
        {o && o.felkuldesUtaniBekuldesek > 0 && (
          <p className="mt-3 rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
            A felküldés óta <strong>{o.felkuldesUtaniBekuldesek}</strong> újabb gyülekezeti irat
            érkezett, ezek tehát <strong>nincsenek benne</strong> a felküldött csomagban. Ha ezeket
            is fel kell terjeszteni, kérj feloldást, majd véglegesítsd és küldd fel újra az
            összesítőt.
          </p>
        )}
      </div>

      {!o ? (
        <div className="card-raised rounded-2xl p-6 text-center text-sm text-muted-foreground">
          {toltes ? 'Az összesítő számítása folyamatban…' : 'Erre az évre nincs megjeleníthető adat.'}
        </div>
      ) : (
        <>
          {/* ── KPI-sáv ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={<Wallet className="size-5 text-emerald-600" />}
              cimke="Számadás — bevétel"
              ertek={`${penz(o.szamadas.osszBevetel)} RON`}
              alcim={`${o.szamadas.allapot.bekuldott.length} / ${o.gyulekezetSzam} gyülekezet`}
            />
            <Kpi
              icon={<Wallet className="size-5 text-rose-600" />}
              cimke="Számadás — kiadás"
              ertek={`${penz(o.szamadas.osszKiadas)} RON`}
              alcim={`Egyenleg: ${penz(o.szamadas.egyenleg)} RON`}
            />
            <Kpi
              icon={<ClipboardList className="size-5 text-sky-600" />}
              cimke="Költségvetés — bevétel"
              ertek={`${penz(o.koltsegvetes.osszBevetel)} RON`}
              alcim={`${o.koltsegvetes.allapot.bekuldott.length} / ${o.gyulekezetSzam} gyülekezet`}
            />
            <Kpi
              icon={<Users className="size-5 text-violet-600" />}
              cimke="Választásra jogosultak"
              ertek={`${o.valasztok.fo.toLocaleString('hu-HU')} fő`}
              alcim={`${o.valasztok.allapot.bekuldott.length} / ${o.gyulekezetSzam} gyülekezet`}
            />
          </div>

          {/* ── Számadás ────────────────────────────────────────────────── */}
          <Szakasz
            cim="Számadás összesítő"
            leiras="A gyülekezetek véglegesített számadásainak összege számadási kódonként."
            allapot={o.szamadas.allapot}
            gyulekezetSzam={o.gyulekezetSzam}
          >
            <div className="grid gap-3 lg:grid-cols-2">
              <KodTabla cim="Bevételek" sorok={o.szamadas.bevetelSorok} vegosszeg={o.szamadas.osszBevetel} />
              <KodTabla cim="Kiadások" sorok={o.szamadas.kiadasSorok} vegosszeg={o.szamadas.osszKiadas} />
            </div>
            <GyulekezetTabla
              cim="Gyülekezetenkénti bontás"
              sorok={o.szamadas.gyulekezetenkent.map((gy) => ({
                id: gy.id,
                nev: gy.nev,
                oszlopok: [penz(gy.bevetel), penz(gy.kiadas), penz(gy.egyenleg)],
              }))}
              fejlecek={['Bevétel', 'Kiadás', 'Egyenleg']}
            />
          </Szakasz>

          {/* ── Költségvetés ────────────────────────────────────────────── */}
          <Szakasz
            cim="Költségvetés összesítő"
            leiras="Az ÉRVÉNYES terv összege: ahol volt költségvetés-módosítás, ott a legutolsó módosított összeg számít."
            allapot={o.koltsegvetes.allapot}
            gyulekezetSzam={o.gyulekezetSzam}
          >
            <div className="grid gap-3 lg:grid-cols-2">
              <KodTabla
                cim="Tervezett bevételek"
                sorok={o.koltsegvetes.bevetelSorok}
                vegosszeg={o.koltsegvetes.osszBevetel}
              />
              <KodTabla
                cim="Tervezett kiadások"
                sorok={o.koltsegvetes.kiadasSorok}
                vegosszeg={o.koltsegvetes.osszKiadas}
              />
            </div>
            <GyulekezetTabla
              cim="Gyülekezetenkénti bontás"
              sorok={o.koltsegvetes.gyulekezetenkent.map((gy) => ({
                id: gy.id,
                nev: gy.modositassalSzamolt ? `${gy.nev} (módosított terv)` : gy.nev,
                oszlopok: [penz(gy.bevetel), penz(gy.kiadas), penz(gy.egyenleg)],
              }))}
              fejlecek={['Bevétel', 'Kiadás', 'Egyenleg']}
            />
          </Szakasz>

          {/* ── Vagyonleltár + választók ────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Szakasz
              cim="Vagyonleltári jelentés"
              leiras="A beküldött vagyonleltári jelentések összesített tételszáma és értéke."
              allapot={o.vagyonleltar.allapot}
              gyulekezetSzam={o.gyulekezetSzam}
            >
              <div className="grid grid-cols-2 gap-3">
                <Kpi
                  cimke="Leltári tételek"
                  ertek={o.vagyonleltar.tetelSzam.toLocaleString('hu-HU')}
                  alcim="összesen a megyében"
                />
                <Kpi
                  cimke="Könyv szerinti érték"
                  ertek={`${penz(o.vagyonleltar.konyvSzerintiErtek)} RON`}
                  alcim="a beküldött jelentések alapján"
                />
              </div>
              <GyulekezetTabla
                cim="Gyülekezetenként"
                sorok={o.vagyonleltar.gyulekezetenkent.map((gy) => ({
                  id: gy.id,
                  nev: gy.nev,
                  oszlopok: [gy.tetelSzam.toLocaleString('hu-HU'), penz(gy.ertek)],
                }))}
                fejlecek={['Tétel', 'Érték (RON)']}
              />
            </Szakasz>

            <Szakasz
              cim="Választók névjegyzéke"
              leiras="A beküldött névjegyzékek szerinti választásra jogosultak száma."
              allapot={o.valasztok.allapot}
              gyulekezetSzam={o.gyulekezetSzam}
            >
              <Kpi
                cimke="Választásra jogosultak"
                ertek={`${o.valasztok.fo.toLocaleString('hu-HU')} fő`}
                alcim="a beküldött névjegyzékek összege"
              />
              <GyulekezetTabla
                cim="Gyülekezetenként"
                sorok={o.valasztok.gyulekezetenkent.map((gy) => ({
                  id: gy.id,
                  nev: gy.nev,
                  oszlopok: [`${gy.fo.toLocaleString('hu-HU')} fő`],
                }))}
                fejlecek={['Jogosult']}
              />
            </Szakasz>
          </div>

          {/* ── Lelkészi jelentés mutatói ───────────────────────────────── */}
          <Szakasz
            cim="Lelkészi jelentés — megyei mutatók"
            leiras="A hivatalos Adatlap kulcs-mutatóinak megyei összege a beküldött jelentésekből."
            allapot={o.lelkesziJelentes.allapot}
            gyulekezetSzam={o.gyulekezetSzam}
          >
            {o.lelkesziJelentes.mezok.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                Erre az évre még nincs beküldött lelkészi jelentés, amiből összesíteni lehetne.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-2 text-left text-xs font-medium text-muted-foreground">Mutató</th>
                      <th className="p-2 text-right text-xs font-medium text-muted-foreground">Összesen</th>
                      <th className="p-2 text-right text-xs font-medium text-muted-foreground">Gyülekezet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {o.lelkesziJelentes.mezok.map((m) => (
                      <tr key={m.id}>
                        <td className="p-2 text-foreground">
                          <span className="font-mono text-xs text-muted-foreground">{m.id}</span> {m.label}
                        </td>
                        <td className="p-2 text-right tabular-nums text-foreground">
                          {m.osszeg.toLocaleString('hu-HU')}
                          {m.egyseg ? ` ${m.egyseg}` : ''}
                        </td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">{m.adatSzam}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Szakasz>

          {/* Felküldés-pecsét — a lap alján is látszik, mi az irat állapota. */}
          <div className="card-raised flex flex-wrap items-center gap-2 rounded-2xl p-4">
            <Send className="size-4 text-teal-600" />
            <span className="text-sm text-foreground">
              {felkuldve
                ? 'Ez az összesítő felküldve az egyházkerületnek.'
                : 'Ez az összesítő még nincs felküldve az egyházkerületnek.'}
            </span>
            {felkuldve && (
              <Badge className="gap-1 rounded-full border border-emerald-300/70 bg-emerald-100 px-2.5 py-1 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-400/40 dark:bg-emerald-400/15 dark:text-emerald-300">
                <BadgeCheck className="size-3.5" />
                {adat.felkuldes?.status === 'received' ? 'Átvéve' : 'Felküldve'}
                {rovidDatum(adat.felkuldes?.submittedAt) ? ` · ${rovidDatum(adat.felkuldes?.submittedAt)}` : ''}
              </Badge>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Belső komponensek
// ───────────────────────────────────────────────────────────────────────────

function Kpi({
  icon,
  cimke,
  ertek,
  alcim,
}: {
  icon?: React.ReactNode
  cimke: string
  ertek: string
  alcim?: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-3.5">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {cimke}
        </span>
      </div>
      <p className="mt-1.5 text-xl font-bold leading-tight text-foreground sm:text-2xl">{ertek}</p>
      {alcim && <p className="mt-0.5 text-xs text-muted-foreground">{alcim}</p>}
    </div>
  )
}

/**
 * Egy összesítő-szakasz: cím + magyarázat + a TELJESSÉGI kép (ki hiányzik) +
 * a tartalom. A hiány-blokk mindig ott van — ez a fail-closed láthatóság.
 */
function Szakasz({
  cim,
  leiras,
  allapot,
  gyulekezetSzam,
  children,
}: {
  cim: string
  leiras: string
  allapot: TipusAllapot
  gyulekezetSzam: number
  children: React.ReactNode
}) {
  const [reszletek, setReszletek] = useState(false)
  const hianyzik = allapot.hianyzo.length + allapot.visszakuldott.length
  return (
    <section className="card-raised space-y-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-heading text-base text-foreground">{cim}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{leiras}</p>
        </div>
        <Badge
          variant="outline"
          className={`rounded-full ${
            hianyzik === 0
              ? 'border-emerald-300 text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-300'
              : 'border-amber-300 text-amber-700 dark:border-amber-400/40 dark:text-amber-300'
          }`}
        >
          {allapot.bekuldott.length} / {gyulekezetSzam} beküldve
        </Badge>
      </div>

      {hianyzik > 0 && (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 dark:border-amber-400/30 dark:bg-amber-400/10">
          <button
            type="button"
            onClick={() => setReszletek((v) => !v)}
            className="flex w-full items-center gap-2 text-left text-sm font-medium text-amber-900 dark:text-amber-200"
          >
            <TriangleAlert className="size-4 shrink-0" />
            <span className="flex-1">
              {allapot.hianyzo.length > 0 && `${allapot.hianyzo.length} gyülekezet nem küldte be`}
              {allapot.hianyzo.length > 0 && allapot.visszakuldott.length > 0 && ' · '}
              {allapot.visszakuldott.length > 0 &&
                `${allapot.visszakuldott.length} irat javításra visszaküldve`}
              {' — ezek adata NINCS benne az összegben.'}
            </span>
            <ChevronDown
              className={`size-4 shrink-0 transition-transform ${reszletek ? 'rotate-180' : ''}`}
            />
          </button>
          {reszletek && (
            <div className="mt-2 space-y-1.5 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              {allapot.hianyzo.length > 0 && (
                <p>
                  <strong>Nem küldte be:</strong> {allapot.hianyzo.map((gy) => gy.nev).join(', ')}
                </p>
              )}
              {allapot.visszakuldott.length > 0 && (
                <p>
                  <strong>Javításra visszaküldve:</strong>{' '}
                  {allapot.visszakuldott.map((gy) => gy.nev).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {children}
    </section>
  )
}

function KodTabla({ cim, sorok, vegosszeg }: { cim: string; sorok: KodSor[]; vegosszeg: number }) {
  if (sorok.length === 0) {
    return (
      <div className="rounded-xl border border-border p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cim}</p>
        <p className="mt-1.5 text-sm italic text-muted-foreground">Nincs beküldött adat.</p>
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <p className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {cim}
      </p>
      {/* A széles tábla SAJÁT vízszintes görgetőben — az oldal törzse sosem
          görgethet oldalra (mobil-first követelmény). */}
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/40">
            <tr>
              <th className="p-2 text-left text-xs font-medium text-muted-foreground">Kód</th>
              <th className="p-2 text-left text-xs font-medium text-muted-foreground">Megnevezés</th>
              <th className="p-2 text-right text-xs font-medium text-muted-foreground">Összeg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorok.map((s) => (
              <tr key={`${s.tipus}-${s.kod}`}>
                <td className="p-2 font-mono text-xs text-muted-foreground">{s.kod}</td>
                <td className="p-2 text-foreground">{s.nev || '—'}</td>
                <td className="p-2 text-right tabular-nums text-foreground">{penz(s.osszeg)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-border bg-muted/30">
              <td className="p-2 font-semibold text-foreground" colSpan={2}>
                Összesen
              </td>
              <td className="p-2 text-right font-semibold tabular-nums text-foreground">
                {penz(vegosszeg)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GyulekezetTabla({
  cim,
  fejlecek,
  sorok,
}: {
  cim: string
  fejlecek: string[]
  sorok: Array<{ id: string; nev: string; oszlopok: string[] }>
}) {
  const [nyitva, setNyitva] = useState(false)
  if (sorok.length === 0) return null
  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setNyitva((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground max-sm:min-h-11"
      >
        <span className="flex-1">
          {cim} <span className="text-muted-foreground">({sorok.length} gyülekezet)</span>
        </span>
        <ChevronDown className={`size-4 shrink-0 transition-transform ${nyitva ? 'rotate-180' : ''}`} />
      </button>
      {nyitva && (
        <div className="max-h-96 overflow-auto border-t border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/40">
              <tr>
                <th className="p-2 text-left text-xs font-medium text-muted-foreground">Gyülekezet</th>
                {fejlecek.map((f) => (
                  <th key={f} className="p-2 text-right text-xs font-medium text-muted-foreground">
                    {f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorok.map((sor) => (
                <tr key={sor.id}>
                  <td className="p-2 text-foreground">{sor.nev}</td>
                  {sor.oszlopok.map((ertek, i) => (
                    <td key={i} className="p-2 text-right tabular-nums text-foreground">
                      {ertek}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
