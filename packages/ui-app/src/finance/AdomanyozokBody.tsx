'use client'

/**
 * ADOMÁNYOZÓK ÉS SZPONZOROK — a fül megjelenítője (Endre 5. kérése, 2026-08-27).
 *
 * „Listázza ki, hogy ki adományozott az adott évben (és visszamenőleg is), mely
 *  személyek, mely cégek adtak szponzorpénzt, adományt, ki mennyit és mikor."
 *  — bankit ÉS készpénzeset egyaránt.
 *
 * KÖZÖS komponens (web + desktop): adatot NEM kér le, mindent propsból kap.
 * Az összesítés a `@kartoteka/core` `osszesitAdomanyozok`-jában készül, hogy a
 * két felület ne adhasson két különböző végösszeget.
 *
 * ── AMIT A FELÜLET SZÁNDÉKOSAN KIMOND ─────────────────────────────────────
 * A bevétel-oldalon NINCS cégnyilvántartás. Ezért a besorolás mérhető jelekből
 * áll (tagnyilvántartási kapcsolat / szervezeti számadási kód), a névből fakadó
 * cég-gyanú pedig KÜLÖN, halványan jelölt — hogy senki ne higgye ténynek.
 * A persely (101.03) sorai névtelenek: nem tüntetjük el őket, de a lista végén,
 * külön csoportban állnak, hogy ne nyomják el a valódi adományozókat.
 */

import { useMemo, useState } from 'react'
import { Building2, ChevronDown, ChevronRight, Download, Landmark, Search, User, Users, Wallet } from 'lucide-react'
import type { Adomanyozo, AdomanyozoTipus, AdomanyozokOsszesito } from '@kartoteka/core'

export interface AdomanyozokBodyProps {
  /** Az összesítő — `null`, amíg tölt. */
  osszesito: AdomanyozokOsszesito | null
  /** Hibaüzenet, ha a betöltés elhasalt. */
  error?: string | null
  betoltes?: boolean
  /** Az évválasztóban felkínált évek (csökkenő). */
  valaszthatoEvek: number[]
  evTol: number
  evIg: number
  onEvValtas: (evTol: number, evIg: number) => void
  /** CSV-mentés — ha nincs megadva, a gomb nem jelenik meg. */
  onCsvExport?: (sorok: string[][]) => void
}

const penz = (n: number) =>
  n.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TIPUS_CIMKE: Record<AdomanyozoTipus, string> = {
  szemely: 'Tagnyilvántartásból azonosított személy',
  szervezet: 'Szervezet / intézmény (a számadási kód szerint)',
  egyeb: 'Nem azonosított adományozó',
  nevtelen: 'Névtelen',
}

const TIPUS_ROVID: Record<AdomanyozoTipus, string> = {
  szemely: 'Személy',
  szervezet: 'Szervezet',
  egyeb: 'Egyéb',
  nevtelen: 'Névtelen',
}

const TIPUS_SZIN: Record<AdomanyozoTipus, string> = {
  szemely: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  szervezet: 'bg-violet-50 text-violet-800 border-violet-200',
  egyeb: 'bg-slate-100 text-slate-700 border-slate-200',
  nevtelen: 'bg-amber-50 text-amber-800 border-amber-200',
}

function StatKartya({
  cimke, ertek, alcim, ikon,
}: { cimke: string; ertek: string; alcim?: string; ikon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        {ikon}
        {cimke}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{ertek}</div>
      {alcim && <div className="mt-0.5 text-xs text-slate-500">{alcim}</div>}
    </div>
  )
}

export function AdomanyozokBody({
  osszesito, error, betoltes, valaszthatoEvek, evTol, evIg, onEvValtas, onCsvExport,
}: AdomanyozokBodyProps) {
  const [kereses, setKereses] = useState('')
  const [tipusSzuro, setTipusSzuro] = useState<AdomanyozoTipus | 'mind'>('mind')
  const [kodSzuro, setKodSzuro] = useState<string>('mind')
  const [nyitott, setNyitott] = useState<Set<string>>(new Set())

  const evLista = valaszthatoEvek.length ? valaszthatoEvek : [new Date().getFullYear()]

  const szurt = useMemo(() => {
    const lista = osszesito?.adomanyozok ?? []
    const q = kereses.trim().toLowerCase()
    return lista.filter((a) => {
      if (tipusSzuro !== 'mind' && a.tipus !== tipusSzuro) return false
      if (kodSzuro !== 'mind' && !(kodSzuro in a.kodonkent)) return false
      if (q && !a.nev.toLowerCase().includes(q)) return false
      return true
    })
  }, [osszesito, kereses, tipusSzuro, kodSzuro])

  // A szűrt lista SAJÁT végösszege — a fejléc kártyái a TELJES időszakot mutatják,
  // ez pedig azt, amit a felhasználó éppen lát. A kettő keverése félrevezetne.
  const szurtOsszeg = useMemo(() => szurt.reduce((s, a) => s + a.osszesen, 0), [szurt])

  const valt = (kulcs: string) => {
    setNyitott((elozo) => {
      const uj = new Set(elozo)
      if (uj.has(kulcs)) uj.delete(kulcs)
      else uj.add(kulcs)
      return uj
    })
  }

  const csv = () => {
    if (!onCsvExport) return
    const fej = ['Adományozó', 'Besorolás', 'Dátum', 'Összeg (RON)', 'Forrás', 'Kategória', 'Iratszám', 'Megjegyzés']
    const sorok: string[][] = [fej]
    for (const a of szurt) {
      for (const t of a.tetelek) {
        sorok.push([
          a.nev,
          TIPUS_ROVID[a.tipus],
          t.datum,
          t.osszeg.toFixed(2),
          t.banki ? 'bank' : 'készpénz',
          t.kod,
          t.iratszam ?? '',
          t.megjegyzes ?? '',
        ])
      }
    }
    onCsvExport(sorok)
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-medium">Az adományozói lista nem tölthető be.</p>
        <p className="mt-1">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Időszak ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor="adomany-ev-tol">Ettől az évtől</label>
          <select
            id="adomany-ev-tol"
            className="mt-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
            value={evTol}
            onChange={(e) => onEvValtas(Number(e.target.value), evIg)}
          >
            {evLista.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor="adomany-ev-ig">Eddig az évig</label>
          <select
            id="adomany-ev-ig"
            className="mt-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
            value={evIg}
            onChange={(e) => onEvValtas(evTol, Number(e.target.value))}
          >
            {evLista.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        {evLista.length > 1 && (
          <button
            type="button"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => onEvValtas(evLista[evLista.length - 1], evLista[0])}
          >
            Minden év
          </button>
        )}
        <p className="ml-auto max-w-md text-xs text-slate-500">
          Az év a <strong>befizetés dátuma</strong> szerint számít (nem a „melyik évre szól"
          mező) — egy adománynál az a kérdés, mikor érkezett a pénz.
        </p>
      </div>

      {betoltes && <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />}

      {!betoltes && osszesito && (
        <>
          {/* ── Összegzés ───────────────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatKartya
              cimke="Összes adomány"
              ertek={`${penz(osszesito.osszesen)} RON`}
              alcim={`${evTol}–${evIg}`}
              ikon={<Users className="size-3.5" />}
            />
            <StatKartya
              cimke="Készpénz"
              ertek={`${penz(osszesito.keszpenzOsszesen)} RON`}
              alcim="kasszába érkezett"
              ikon={<Wallet className="size-3.5" />}
            />
            <StatKartya
              cimke="Bank"
              ertek={`${penz(osszesito.bankOsszesen)} RON`}
              alcim="bankszámlára érkezett"
              ikon={<Landmark className="size-3.5" />}
            />
            <StatKartya
              cimke="Adományozók"
              ertek={String(osszesito.adomanyozoDb)}
              alcim="a névtelen tételek nélkül"
              ikon={<User className="size-3.5" />}
            />
          </div>

          {/* ── Kategóriák ──────────────────────────────────────────────── */}
          {osszesito.kodonkent.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-800">Kategóriák szerint</h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-1.5 pr-3">Kód</th>
                      <th className="py-1.5 pr-3">Megnevezés</th>
                      <th className="py-1.5 pr-3 text-right">Tételek</th>
                      <th className="py-1.5 text-right">Összeg (RON)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {osszesito.kodonkent.map((k) => (
                      <tr key={k.kod} className="border-b border-slate-100 last:border-0">
                        <td className="py-1.5 pr-3 font-mono text-xs text-slate-600">{k.kod}</td>
                        <td className="py-1.5 pr-3 text-slate-800">{k.nev}</td>
                        <td className="py-1.5 pr-3 text-right text-slate-600">{k.alkalmak}</td>
                        <td className="py-1.5 text-right font-medium text-slate-900">{penz(k.osszeg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Szűrők ──────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm"
                placeholder="Keresés név szerint…"
                value={kereses}
                onChange={(e) => setKereses(e.target.value)}
              />
            </div>
            <select
              aria-label="Besorolás szerinti szűrés"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              value={tipusSzuro}
              onChange={(e) => setTipusSzuro(e.target.value as AdomanyozoTipus | 'mind')}
            >
              <option value="mind">Minden besorolás</option>
              <option value="szemely">{TIPUS_ROVID.szemely}</option>
              <option value="szervezet">{TIPUS_ROVID.szervezet}</option>
              <option value="egyeb">{TIPUS_ROVID.egyeb}</option>
              <option value="nevtelen">{TIPUS_ROVID.nevtelen}</option>
            </select>
            <select
              aria-label="Kategória szerinti szűrés"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              value={kodSzuro}
              onChange={(e) => setKodSzuro(e.target.value)}
            >
              <option value="mind">Minden kategória</option>
              {osszesito.kodonkent.map((k) => (
                <option key={k.kod} value={k.kod}>{k.kod} — {k.nev}</option>
              ))}
            </select>
            {onCsvExport && (
              <button
                type="button"
                onClick={csv}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Download className="size-4" />
                Táblázat mentése
              </button>
            )}
          </div>

          {/* ── A lista ─────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <h3 className="text-sm font-semibold text-slate-800">
                Adományozók ({szurt.length})
              </h3>
              <span className="text-sm text-slate-600">
                A látott sorok összege: <strong className="text-slate-900">{penz(szurtOsszeg)} RON</strong>
              </span>
            </div>

            {szurt.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                {osszesito.adomanyozok.length === 0
                  ? 'Ebben az időszakban nincs rögzített adomány vagy szponzortámogatás.'
                  : 'A szűrőknek egyetlen adományozó sem felel meg.'}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {szurt.map((a) => (
                  <AdomanyozoSor
                    key={a.kulcs}
                    a={a}
                    nyitva={nyitott.has(a.kulcs)}
                    onValt={() => valt(a.kulcs)}
                  />
                ))}
              </ul>
            )}
          </div>

          <p className="px-1 text-xs text-slate-500">
            A besorolás mérhető jelekből áll: a <em>Személy</em> azt jelenti, hogy a tétel a
            tagnyilvántartáshoz van kötve; a <em>Szervezet</em> azt, hogy a számadási kód maga
            szervezeti forrás (103.01, 103.09, 105.01, 105.02). A bevétel-oldalon nincs
            cégnyilvántartás, ezért a névből fakadó „cég?" jelzés csak figyelmeztetés — nem tény.
          </p>
        </>
      )}
    </div>
  )
}

function AdomanyozoSor({ a, nyitva, onValt }: { a: Adomanyozo; nyitva: boolean; onValt: () => void }) {
  const evek = Object.keys(a.evenkent).map(Number).sort((x, y) => y - x)
  return (
    <li>
      <button
        type="button"
        onClick={onValt}
        aria-expanded={nyitva}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        {nyitva ? <ChevronDown className="size-4 shrink-0 text-slate-400" /> : <ChevronRight className="size-4 shrink-0 text-slate-400" />}
        <span className="shrink-0 text-slate-400">
          {a.tipus === 'szervezet' ? <Building2 className="size-4" /> : <User className="size-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-slate-900">{a.nev}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span
              title={TIPUS_CIMKE[a.tipus]}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${TIPUS_SZIN[a.tipus]}`}
            >
              {TIPUS_ROVID[a.tipus]}
            </span>
            {a.cegGyanu && (
              <span
                title="A név cégre/intézményre utal. Ez csak jelzés — a bevétel-oldalon nincs cégnyilvántartás."
                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500"
              >
                cég?
              </span>
            )}
            <span className="text-[11px] text-slate-500">
              {a.alkalmak} tétel · {a.elsoDatum === a.utolsoDatum ? a.elsoDatum : `${a.elsoDatum} – ${a.utolsoDatum}`}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-semibold text-slate-900">{penz(a.osszesen)} RON</span>
          <span className="block text-[11px] text-slate-500">
            készpénz {penz(a.keszpenz)} · bank {penz(a.bank)}
          </span>
        </span>
      </button>

      {nyitva && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          {evek.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {evek.map((e) => (
                <span key={e} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                  {e}: <strong>{penz(a.evenkent[e])}</strong> RON
                </span>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-3">Dátum</th>
                  <th className="py-1 pr-3 text-right">Összeg</th>
                  <th className="py-1 pr-3">Forrás</th>
                  <th className="py-1 pr-3">Kategória</th>
                  <th className="py-1 pr-3">Iratszám</th>
                  <th className="py-1">Megjegyzés</th>
                </tr>
              </thead>
              <tbody>
                {a.tetelek.map((t) => (
                  <tr key={t.id} className="border-t border-slate-200/70">
                    <td className="py-1 pr-3 whitespace-nowrap text-slate-700">{t.datum}</td>
                    <td className="py-1 pr-3 text-right font-medium text-slate-900">{penz(t.osszeg)}</td>
                    <td className="py-1 pr-3 whitespace-nowrap text-slate-600">
                      {t.banki ? 'bank' : 'készpénz'}
                    </td>
                    <td className="py-1 pr-3 font-mono text-xs text-slate-600">{t.kod}</td>
                    <td className="py-1 pr-3 text-slate-600">{t.iratszam ?? '—'}</td>
                    <td className="py-1 text-slate-600">{t.megjegyzes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </li>
  )
}
