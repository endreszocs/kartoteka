'use client'

/**
 * WorklogStatistics — munkanapló év-statisztika felület (2026-07-16, F4/S2).
 *
 * Három blokk a Lelkészi jelentés fül aljára:
 *   1. LÁTOGATOTTSÁG — szolgálat-típusonkénti táblázat + a top 5 típus havi
 *      trendje (tisztán CSS mini-oszlopdiagram, chart-lib nélkül),
 *   2. ÉNEKEK — top 15 leggyakrabban énekelt, tematikus szakasz-bontás és
 *      „régen nem énekelt” javaslatok,
 *   3. IGEVERSEK — top 10 alapige + Károli-lefedettség könyvenkénti hőtérképpel.
 *
 * SZÁMÍTÁS: a pure computeWorklogStatistics (lib/worklog/statistics.ts) végzi —
 * ez a komponens csak megjelenít. Mindig a TELJES év bejegyzéseit kapja
 * (yearEntries), a jelentés-fül hónap-szűrése erre nem hat.
 *
 * TELJESÍTMÉNY:
 *   - a komponenst a worklog-tabs next/dynamic-kal tölti (fő chunk nem nő);
 *   - a @kartoteka/enekeskonyv (608 KB korpusz) CSAK itt, dynamic import()-tal,
 *     modul-szintű cache-sel töltődik be — amíg tölt, a lista az ének-azonosítókat
 *     mutatja, a cím/szakasz-dúsítás betöltés után jelenik meg;
 *   - a @kartoteka/biblia statikus import (kicsi: parser + ~5 KB katalógus).
 *
 * MOBILE-FIRST: a táblázat saját overflow-konténerben görgethető (az oldal
 * sosem görget vízszintesen), a hőtérkép-csempék érintőbarát (min. 44 px)
 * rácsban törnek új sorba. Minden szín token-alapú (világos + sötét téma).
 */

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, BookOpenText, ListMusic, Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { WorklogEntry } from '@/lib/constants/worklog'
import { HU_MONTHS, HU_MONTHS_SHORT } from '@/lib/constants/dashboard'
import {
  computeWorklogStatistics,
  type EnekStat,
  type IgehelyStat,
  type KonyvLefedettseg,
  type TipusStat,
} from '@/lib/worklog/statistics'
import { getBook } from '@kartoteka/biblia'
// Type-only import: fordításkor törlődik, a korpuszt NEM húzza be a chunkba.
import type { Enek } from '@kartoteka/enekeskonyv'

// ── Énekeskönyv-modul lusta betöltése (közös minta az enekek-field.tsx-szel) ─

type EnekeskonyvModule = typeof import('@kartoteka/enekeskonyv')

// Module-szintű cache: a csomag egyszer töltődik be, minden példány közös.
let enekeskonyvModule: EnekeskonyvModule | null = null
let enekeskonyvPromise: Promise<EnekeskonyvModule> | null = null

function loadEnekeskonyv(): Promise<EnekeskonyvModule> {
  if (!enekeskonyvPromise) {
    enekeskonyvPromise = import('@kartoteka/enekeskonyv').then((mod) => {
      enekeskonyvModule = mod
      return mod
    })
    // Hiba (pl. hálózat) esetén a következő megnyitás újrapróbálhassa.
    void enekeskonyvPromise.catch(() => {
      enekeskonyvPromise = null
    })
  }
  return enekeskonyvPromise
}

// ── Formázók ─────────────────────────────────────────────────────────────────

const NUM_HU = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 })
const NUM_HU_1 = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 })
const NUM_HU_2 = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 })

/** ISO időpont → magyar rövid dátum ('2026-03-15…' → '2026. 03. 15.'). */
function formatDatumHu(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso || '—'
  return `${m[1]}. ${m[2]}. ${m[3]}.`
}

// ── Közös kártya-fejléc ──────────────────────────────────────────────────────

function BlockHeader({
  icon: Icon,
  kicker,
  title,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>
  kicker: string
  title: string
  sub?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-4.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{kicker}</p>
        <h3 className="mt-0.5 font-heading text-xl text-foreground">{title}</h3>
        {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
      </div>
    </div>
  )
}

// ── 1. blokk: Látogatottság ──────────────────────────────────────────────────

function LatogatottsagBlock({ tipusok }: { tipusok: TipusStat[] }) {
  const trendTipusok = tipusok.slice(0, 5)
  // A trend-diagramon kiválasztott hónap-cella szövege ('Június: 5 alkalom') —
  // kattintásra/fókuszra töltődik, a diagram alatt látható sorként jelenik meg.
  const [kivalasztottHonap, setKivalasztottHonap] = useState<string | null>(null)

  return (
    <div className="card-raised p-4 sm:p-5">
      <BlockHeader
        icon={BarChart3}
        kicker="Év-statisztika"
        title="Látogatottság"
        sub="Szolgálati alkalmak típusonként — darabszám, átlagjelenlét, napszak-bontás"
      />

      {tipusok.length === 0 ? (
        <p className="mt-4 rounded-xl bg-muted px-3.5 py-3 text-sm text-muted-foreground">
          Ebben az évben még nincs szolgálati alkalom — a látogatottság-statisztika az
          első szolgálati bejegyzés után jelenik meg.
        </p>
      ) : (
        <>
          {/* Típusonkénti táblázat — saját overflow-konténerben görgethető,
              az oldal maga sosem görget vízszintesen. A régió fókuszálható,
              hogy billentyűzetről is görgethető legyen. */}
          <div
            tabIndex={0}
            role="region"
            aria-label="Szolgálati alkalmak típusonként — görgethető táblázat"
            className="mt-4 overflow-x-auto"
          >
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Alkalom</th>
                  <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Db</th>
                  <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Átlagjelenlét</th>
                  <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">F / N / Gy</th>
                  <th scope="col" className="py-2 pl-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">De / Du / Este</th>
                </tr>
              </thead>
              <tbody>
                {tipusok.map((t) => (
                  <tr key={t.jellege} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 font-medium text-foreground">{t.jellege}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{NUM_HU.format(t.db)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {t.atlagJelenlet != null ? NUM_HU_1.format(t.atlagJelenlet) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {NUM_HU.format(t.ferfi)} / {NUM_HU.format(t.no)} / {NUM_HU.format(t.gyermek)}
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">
                      {NUM_HU.format(t.deDb)} / {NUM_HU.format(t.duDb)} / {NUM_HU.format(t.esteDb)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top típusok havi trendje — tisztán CSS mini-oszlopdiagram. */}
          <div className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              A leggyakoribb típusok havi trendje
            </p>
            <div className="mt-3 space-y-2.5">
              {trendTipusok.map((t) => {
                const max = Math.max(...t.havonta)
                return (
                  <div key={t.jellege} className="flex items-center gap-2.5 sm:gap-3">
                    <span
                      className="w-28 shrink-0 truncate text-xs text-muted-foreground sm:w-44"
                      title={t.jellege}
                    >
                      {t.jellege}
                    </span>
                    <div
                      role="group"
                      aria-label={`${t.jellege} havi trendje`}
                      className="flex h-8 min-w-0 flex-1 items-end gap-px sm:gap-0.5"
                    >
                      {t.havonta.map((c, i) => {
                        const cellaCimke = `${HU_MONTHS[i]}: ${c} alkalom`
                        return (
                          <button
                            key={i}
                            type="button"
                            aria-label={cellaCimke}
                            title={cellaCimke}
                            onClick={() => setKivalasztottHonap(cellaCimke)}
                            onFocus={() => setKivalasztottHonap(cellaCimke)}
                            className="flex h-full flex-1 items-end"
                          >
                            {c > 0 && max > 0 ? (
                              <div
                                className="w-full rounded-t-sm bg-primary/70"
                                style={{ height: `${Math.max((c / max) * 100, 14)}%` }}
                              />
                            ) : (
                              // Üres hónap: vékony alapvonal-csonk, hogy a rács olvasható maradjon
                              <div className="h-px w-full rounded-full bg-muted" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {NUM_HU.format(t.db)}
                    </span>
                  </div>
                )
              })}
              {/* Hónap-tengely (dekoráció — a pontos értékek a cellák aria-labeljében) */}
              <div aria-hidden className="flex items-center gap-2.5 sm:gap-3">
                <span className="w-28 shrink-0 sm:w-44" />
                <div className="flex min-w-0 flex-1 gap-px sm:gap-0.5">
                  {HU_MONTHS_SHORT.map((_, i) => (
                    <span key={i} className="flex-1 text-center text-[9px] text-muted-foreground">
                      {i + 1}
                    </span>
                  ))}
                </div>
                <span className="w-8 shrink-0" />
              </div>
              {/* A kiválasztott cella látható kiírása — tap-ra és Tab-ra is */}
              {kivalasztottHonap ? (
                <p aria-live="polite" className="text-xs text-foreground">
                  {kivalasztottHonap}
                </p>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── 2. blokk: Énekek ─────────────────────────────────────────────────────────

/** Ének-azonosító jelvény (a top-listában és a javaslatokban közös). */
function EnekBadge({ azonosito }: { azonosito: string }) {
  return (
    <span className="inline-flex h-6 min-w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 px-1.5 text-xs font-semibold tabular-nums text-primary">
      {azonosito}
    </span>
  )
}

/** Énekeskönyv-betöltési hibasor kis „Újrapróbálás” gombbal (közös a 3 helyen). */
function EnekHibaSor({ onRetry, className }: { onRetry: () => void; className?: string }) {
  return (
    <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground', className)}>
      <span>Az énekeskönyv betöltése nem sikerült.</span>
      <button
        type="button"
        onClick={onRetry}
        className="font-medium text-primary underline underline-offset-2 transition-colors hover:text-primary/80"
      >
        Újrapróbálás
      </button>
    </p>
  )
}

function EnekekBlock({
  enekek,
  mod,
  year,
  hiba,
  onRetry,
}: {
  enekek: EnekStat[]
  mod: EnekeskonyvModule | null
  year: number
  /** Igaz, ha az énekeskönyv-korpusz betöltése hibára futott. */
  hiba: boolean
  onRetry: () => void
}) {
  const top15 = useMemo(() => enekek.slice(0, 15), [enekek])

  // Szakasz-bontás: melyik tematikus szakaszból hány éneklés volt (db-vel súlyozva).
  const szakaszBontas = useMemo(() => {
    if (!mod || enekek.length === 0) return null
    const gyujto = new Map<string, number>()
    for (const stat of enekek) {
      const enek = mod.getEnek(stat.azonosito)
      if (!enek) continue
      gyujto.set(enek.szakasz, (gyujto.get(enek.szakasz) ?? 0) + stat.db)
    }
    const sorok = Array.from(gyujto.entries())
      .map(([szakasz, db]) => ({ szakasz, db }))
      .sort((a, b) => b.db - a.db || a.szakasz.localeCompare(b.szakasz, 'hu'))
    return sorok.slice(0, 6)
  }, [mod, enekek])

  /**
   * „Régen nem énekelt” javaslatok: 7 ének, amit idén (még) nem énekeltek —
   * szakaszonként vegyesen (körbejárás a tematikus szakaszokon), az évszám
   * szerint forgatva/választva, hogy évről évre más-más kerüljön elő, de az
   * adott éven belül stabil maradjon. Ha (elméletben) minden számot énekeltek
   * már, a legrégebben énekeltek töltik fel a listát.
   */
  const javaslatok = useMemo(() => {
    if (!mod || enekek.length === 0) return null
    const CEL = 7
    // Szám-szinten zárunk ki: ha a 400a ment idén, a 400b-t se javasoljuk.
    const enekeltSzamok = new Set<number>()
    for (const stat of enekek) {
      const n = parseInt(stat.azonosito, 10)
      if (Number.isFinite(n)) enekeltSzamok.add(n)
    }
    const out: Enek[] = []
    const felhasznaltSzamok = new Set<number>()
    const szakaszok = mod.listSzakaszok()
    if (szakaszok.length > 0) {
      const eltolas = year % szakaszok.length
      for (let i = 0; i < szakaszok.length && out.length < CEL; i++) {
        const szakasz = szakaszok[(i + eltolas) % szakaszok.length]
        // A forgatás horgonya a TELJES szakasz-lista (nem a szűrt): így a
        // kezdőpont az éven belül stabil, és egy ének elénekelésekor csak az
        // az egy javaslat lép tovább a következő szabad jelöltre.
        const osszes = mod.getEnekekBySzakasz(szakasz)
        if (!osszes.length) continue
        const start = (year * 31 + i * 7) % osszes.length
        let pick: Enek | null = null
        for (let j = 0; j < osszes.length; j++) {
          const jelolt = osszes[(start + j) % osszes.length]
          if (!enekeltSzamok.has(jelolt.szam) && !felhasznaltSzamok.has(jelolt.szam)) {
            pick = jelolt
            break
          }
        }
        if (!pick) continue
        felhasznaltSzamok.add(pick.szam)
        out.push(pick)
      }
    }
    // Tartalék: ha nem gyűlt össze elég (szinte minden ének elhangzott már),
    // a legrégebben énekeltekkel egészítjük ki.
    if (out.length < CEL) {
      const legregebbiek = [...enekek].sort((a, b) => a.utolsoDatum.localeCompare(b.utolsoDatum))
      for (const stat of legregebbiek) {
        if (out.length >= CEL) break
        const enek = mod.getEnek(stat.azonosito)
        if (enek && !felhasznaltSzamok.has(enek.szam)) {
          felhasznaltSzamok.add(enek.szam)
          out.push(enek)
        }
      }
    }
    return out
  }, [mod, enekek, year])

  const szakaszMax = szakaszBontas && szakaszBontas.length > 0 ? szakaszBontas[0].db : 0

  return (
    <div className="card-raised p-4 sm:p-5">
      <BlockHeader
        icon={ListMusic}
        kicker="Év-statisztika"
        title="Énekek"
        sub="A munkanapló Énekek mezőiből — minden kategória alkalmaiból"
      />

      {enekek.length === 0 ? (
        <p className="mt-4 rounded-xl bg-muted px-3.5 py-3 text-sm text-muted-foreground">
          Ebben az évben még nincs rögzített ének — az alkalmak Énekek mezőjének
          kitöltése után itt jelenik meg a gyakorisági lista és a javaslatok.
        </p>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          {/* Top 15 leggyakrabban énekelt */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              A 15 leggyakrabban énekelt
            </p>
            {!mod ? (
              hiba ? (
                <EnekHibaSor onRetry={onRetry} className="mt-1.5 text-[11px]" />
              ) : (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Énekeskönyv betöltése — a címek hamarosan megjelennek…
                </p>
              )
            ) : null}
            <ol className="mt-3 space-y-1.5">
              {top15.map((stat, idx) => {
                const enek = mod ? mod.getEnek(stat.azonosito) : null
                return (
                  <li key={stat.azonosito} className="flex items-start gap-2.5">
                    <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {idx + 1}.
                    </span>
                    <EnekBadge azonosito={stat.azonosito} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground" title={enek ? (enek.cim ?? enek.elsoSor) : undefined}>
                        {enek ? (enek.cim ?? enek.elsoSor) : <span className="text-muted-foreground">{mod ? 'Nem azonosítható ének' : '…'}</span>}
                      </span>
                      {/* Mobilon a dátum a cím alatti második sor — sm-től a jobb oldali oszlop mutatja */}
                      <span className="block truncate text-[11px] text-muted-foreground sm:hidden">
                        utoljára: {stat.utolsoDatum ? formatDatumHu(stat.utolsoDatum) : '—'}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
                      {NUM_HU.format(stat.db)}×
                    </span>
                    <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:inline">
                      {stat.utolsoDatum ? formatDatumHu(stat.utolsoDatum) : '—'}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="space-y-6">
            {/* Szakasz-bontás */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Tematikus szakaszok szerint
              </p>
              {szakaszBontas ? (
                <ul className="mt-3 space-y-2">
                  {szakaszBontas.map((sor) => (
                    <li key={sor.szakasz} className="flex items-center gap-2.5">
                      <span className="w-32 shrink-0 truncate text-xs text-muted-foreground sm:w-44" title={sor.szakasz}>
                        {sor.szakasz}
                      </span>
                      <div
                        role="img"
                        aria-label={`${sor.szakasz}: ${sor.db} éneklés`}
                        className="h-2 min-w-0 flex-1 rounded-full bg-muted"
                      >
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${szakaszMax > 0 ? Math.max((sor.db / szakaszMax) * 100, 4) : 0}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {NUM_HU.format(sor.db)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : hiba ? (
                <EnekHibaSor onRetry={onRetry} className="mt-3 text-xs" />
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">Énekeskönyv betöltése…</p>
              )}
            </div>

            {/* Régen nem énekelt javaslatok */}
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" aria-hidden />
                Régen nem énekelt javaslatok
              </p>
              {javaslatok && javaslatok.length > 0 ? (
                <>
                  <ul className="mt-3 grid gap-2 xl:grid-cols-2">
                    {javaslatok.map((enek) => (
                      <li
                        key={enek.azonosito}
                        className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3 py-2"
                      >
                        <EnekBadge azonosito={enek.azonosito} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground" title={enek.cim ?? enek.elsoSor}>
                            {enek.cim ?? enek.elsoSor}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">{enek.szakasz}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Az énekeskönyv különböző tematikus szakaszaiból — idén még egyik sem hangzott el.
                  </p>
                </>
              ) : hiba ? (
                <EnekHibaSor onRetry={onRetry} className="mt-3 text-xs" />
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">Énekeskönyv betöltése…</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 3. blokk: Igeversek + Biblia-lefedettség ─────────────────────────────────

/**
 * Hőtérkép-árnyalat a lefedettség-százalékhoz — token-alapú opacity-lépcsők
 * (0% = bg-muted). A text-foreground-os létra teteje /50: e fölött a kis
 * szöveg kontrasztja (WCAG AA) már nem garantált a primary-alapon. A 35–99%
 * sáv megkülönböztető gyűrűt kap; a teli 'bg-primary text-primary-foreground'
 * CSAK a 100%-os (teljes) könyvé — a token-pár mindkét témában garantáltan
 * kontrasztos (világosban sötét primary + világos felirat, sötétben fordítva).
 */
function lefedettsegCsempeOsztaly(szazalek: number): string {
  if (szazalek <= 0) return 'bg-muted text-muted-foreground'
  if (szazalek < 2) return 'bg-primary/15 text-foreground'
  if (szazalek < 6) return 'bg-primary/30 text-foreground'
  if (szazalek < 15) return 'bg-primary/45 text-foreground'
  if (szazalek < 35) return 'bg-primary/50 text-foreground'
  if (szazalek < 100) return 'bg-primary/50 text-foreground ring-1 ring-inset ring-primary'
  return 'bg-primary text-primary-foreground'
}

function KonyvCsempe({
  konyv,
  onValaszt,
}: {
  konyv: KonyvLefedettseg
  /** Kattintásra/fókuszra a csempe teljes adat-címkéjét adja fel a rácsnak. */
  onValaszt: (cimke: string) => void
}) {
  const adat = getBook(konyv.book)
  const nev = adat?.canonical ?? konyv.book
  const rovid = adat?.abbrev ?? konyv.book
  const cimke = `${nev}: ${NUM_HU.format(konyv.erintett)} / ${NUM_HU.format(konyv.osszVers)} vers (${NUM_HU_2.format(konyv.szazalek)}%)`
  return (
    <button
      type="button"
      aria-label={cimke}
      title={cimke}
      onClick={() => onValaszt(cimke)}
      onFocus={() => onValaszt(cimke)}
      className={cn(
        'flex h-11 min-w-0 items-center justify-center rounded-md px-1 transition-colors',
        lefedettsegCsempeOsztaly(konyv.szazalek),
      )}
    >
      <span className="truncate text-[10px] font-semibold sm:text-[11px]">{rovid}</span>
    </button>
  )
}

function KonyvRacs({ cim, konyvek }: { cim: string; konyvek: KonyvLefedettseg[] }) {
  const erintettDb = konyvek.reduce((db, k) => db + (k.erintett > 0 ? 1 : 0), 0)
  // A kiválasztott könyv teljes adat-sora ('Zsoltárok: 1 234 / 2 461 vers (50,14%)')
  // — tap-ra ÉS Tab-fókuszra is töltődik, a rács alatt látható szövegként.
  const [kivalasztott, setKivalasztott] = useState<string | null>(null)
  return (
    <div>
      <p className="flex items-baseline justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <span>{cim}</span>
        <span className="tabular-nums normal-case tracking-normal">
          {erintettDb}/{konyvek.length} könyv érintett
        </span>
      </p>
      <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1">
        {konyvek.map((k) => (
          <KonyvCsempe key={k.book} konyv={k} onValaszt={setKivalasztott} />
        ))}
      </div>
      {kivalasztott ? (
        <p aria-live="polite" className="mt-2 text-xs tabular-nums text-foreground">
          {kivalasztott}
        </p>
      ) : null}
    </div>
  )
}

function IgeBlock({
  igehelyek,
  konyvek,
  lefedettseg,
  hibak,
}: {
  igehelyek: IgehelyStat[]
  konyvek: KonyvLefedettseg[]
  lefedettseg: { osszes: number; erintett: number; szazalek: number }
  hibak: string[]
}) {
  const top10 = igehelyek.slice(0, 10)
  // A konyvek bibliai sorrendben jönnek: az első 39 az Ószövetség, a többi 27 az Új.
  const oszovetseg = konyvek.slice(0, 39)
  const ujszovetseg = konyvek.slice(39)
  const nincsAdat = top10.length === 0 && lefedettseg.erintett === 0
  // Van érintett vers, de a 2 tizedesre kerekített érték 0 lenne → ne a
  // félrevezető '0%' jelenjen meg, hanem '<0,01%'.
  const szazalekFmt = NUM_HU_2.format(lefedettseg.szazalek)
  const szazalekSzoveg =
    lefedettseg.erintett > 0 && szazalekFmt === '0' ? '<0,01%' : `${szazalekFmt}%`

  return (
    <div className="card-raised p-4 sm:p-5">
      <BlockHeader
        icon={BookOpenText}
        kicker="Év-statisztika"
        title="Igeversek és Biblia-lefedettség"
        sub="Az Alapige mezők gyakorisága + az Alapige és Bibliaolvasás együttes vers-lefedettsége"
      />

      {nincsAdat ? (
        <p className="mt-4 rounded-xl bg-muted px-3.5 py-3 text-sm text-muted-foreground">
          Ebben az évben még nincs felismert igehely — az Alapige és Bibliaolvasás
          mezők kitöltése után itt jelenik meg a gyakorisági lista és a lefedettség-hőtérkép.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            {/* Össz-lefedettség nagy kijelzővel */}
            <div className="flex flex-col justify-center rounded-2xl bg-muted/50 px-4 py-5 sm:px-5">
              <p className="font-heading text-4xl font-semibold tabular-nums text-primary sm:text-5xl">
                {szazalekSzoveg}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                A Biblia ekkora része érintett idén —{' '}
                <strong className="tabular-nums text-foreground">{NUM_HU.format(lefedettseg.erintett)}</strong> vers
                a {NUM_HU.format(lefedettseg.osszes)}-ból (Károli-fordítás, 66 könyv).
              </p>
              {/* Árnyalat-jelmagyarázat a hőtérképhez — a skálát követi:
                  0 / fokozatok / 35–99% gyűrűs minta / teljes könyv */}
              <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>0%</span>
                <span className="h-3 w-4 rounded-sm bg-muted ring-1 ring-inset ring-border" aria-hidden />
                <span className="h-3 w-4 rounded-sm bg-primary/15" aria-hidden />
                <span className="h-3 w-4 rounded-sm bg-primary/30" aria-hidden />
                <span className="h-3 w-4 rounded-sm bg-primary/45" aria-hidden />
                <span className="h-3 w-4 rounded-sm bg-primary/50" aria-hidden />
                <span className="h-3 w-4 rounded-sm bg-primary/50 ring-1 ring-inset ring-primary" aria-hidden />
                <span>35–99%</span>
                <span className="h-3 w-4 rounded-sm bg-primary" aria-hidden />
                <span>teljes könyv</span>
              </div>
            </div>

            {/* Top 10 alapige */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                A 10 leggyakoribb alapige
              </p>
              {top10.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Alapige még nincs rögzítve — a lefedettség a Bibliaolvasás mezőkből számol.
                </p>
              ) : (
                <ol className="mt-3 space-y-1.5">
                  {top10.map((ige, idx) => (
                    <li key={ige.hivatkozas} className="flex items-center gap-2.5">
                      <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                        {idx + 1}.
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {ige.hivatkozas}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {NUM_HU.format(ige.db)}×
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {/* Könyvenkénti hőtérkép — 66 csempe bibliai sorrendben, ÓSZ/ÚSZ bontásban */}
          <div className="mt-6 space-y-4">
            <KonyvRacs cim="Ószövetség" konyvek={oszovetseg} />
            <KonyvRacs cim="Újszövetség" konyvek={ujszovetseg} />
          </div>
        </>
      )}

      {/* Diszkrét diagnosztika: amit a felismerő nem értett */}
      {hibak.length > 0 ? (
        <details className="mt-5 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5">
          <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            Nem felismert igehelyek ({hibak.length})
          </summary>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Az alábbi szövegeket a felismerő nem tudta igehelyként értelmezni, ezért a
            statisztikába nem számítanak bele. Érdemes a bejegyzésekben kanonikus
            alakra javítani (pl. „Jn 3,16”).
          </p>
          {/* Legfeljebb 20 tétel renderelődik — a summary számlálója a valós
              teljes darabszámot mutatja, a maradékot egy záró tétel jelzi. */}
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {hibak.slice(0, 20).map((h) => (
              <li key={h} className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
                {h}
              </li>
            ))}
            {hibak.length > 20 ? (
              <li className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                … és további {NUM_HU.format(hibak.length - 20)} szöveg
              </li>
            ) : null}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

// ── Fő komponens ─────────────────────────────────────────────────────────────

export interface WorklogStatisticsProps {
  /** A kiválasztott év ÖSSZES bejegyzése (nem hónap-szűrt!) — a statisztika éves. */
  yearEntries: WorklogEntry[]
  year: number
}

export function WorklogStatistics({ yearEntries, year }: WorklogStatisticsProps) {
  const stats = useMemo(() => computeWorklogStatistics(yearEntries), [yearEntries])
  const vanBejegyzes = useMemo(() => yearEntries.some((e) => !e.deleted), [yearEntries])

  // Az énekeskönyv-korpusz (608 KB) CSAK a blokk megjelenésekor, és csak akkor
  // töltődik, ha van ének-adat, amit dúsítani lehet.
  const [enekMod, setEnekMod] = useState<EnekeskonyvModule | null>(() => enekeskonyvModule)
  const [enekHiba, setEnekHiba] = useState(false)
  // Retry-számláló: az „Újrapróbálás” gomb növeli, az effect újrafut.
  // A hiba-állapotot a gomb kezelője nullázza (nem az effect — a szinkron
  // setState az effect törzsében kaszkád-rendert okozna, lint is tiltja).
  const [enekRetry, setEnekRetry] = useState(0)
  useEffect(() => {
    if (enekMod || stats.enekek.length === 0) return
    let cancelled = false
    loadEnekeskonyv()
      .then((mod) => {
        if (!cancelled) setEnekMod(mod)
      })
      .catch(() => {
        // Betöltési hiba (pl. hálózat): a lista azonosító-szinten marad, és
        // hibaüzenet + Újrapróbálás gomb jelenik meg. A loadEnekeskonyv
        // promise-cache-e hibánál törlődik, így az újrapróbálás tényleg
        // új import()-ot indít.
        if (!cancelled) setEnekHiba(true)
      })
    return () => {
      cancelled = true
    }
  }, [enekMod, stats.enekek.length, enekRetry])

  return (
    <section aria-label={`Év-statisztika, ${year}`} className="space-y-4">
      {/* Szakasz-fejléc: egyértelműsíti, hogy a statisztika mindig a teljes évé */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-heading text-xl text-foreground sm:text-2xl">Év-statisztika</h2>
        <p className="text-xs text-muted-foreground">
          Mindig a teljes {year}. évből számol — a hónap-szűréstől függetlenül
        </p>
      </div>

      {!vanBejegyzes ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-10 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <BarChart3 className="size-6" aria-hidden />
          </div>
          <p className="mt-3 font-heading text-base text-foreground">
            {year}. évben még nincs statisztika-adat
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            A látogatottság, az énekek és az igeversek statisztikája az első rögzített
            munkanapló-bejegyzés után jelenik meg — automatikusan, külön beállítás nélkül.
          </p>
        </div>
      ) : (
        <>
          <LatogatottsagBlock tipusok={stats.tipusok} />
          <EnekekBlock
            enekek={stats.enekek}
            mod={enekMod}
            year={year}
            hiba={enekHiba}
            onRetry={() => {
              setEnekHiba(false)
              setEnekRetry((n) => n + 1)
            }}
          />
          <IgeBlock
            igehelyek={stats.igehelyek}
            konyvek={stats.konyvek}
            lefedettseg={stats.lefedettseg}
            hibak={stats.ertelmezhetetlenIgehelyek}
          />
        </>
      )}
    </section>
  )
}
