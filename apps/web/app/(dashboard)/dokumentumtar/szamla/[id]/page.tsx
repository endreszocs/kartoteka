import { notFound } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import type { SzallitoiSzamla } from '@/lib/dokumentumtar/szamla-types'
import { SzamlaNyomtatasGomb } from './nyomtatas-gomb'

/**
 * Szállítói számla — szépen formázott, NYOMTATHATÓ adatlap (Endre 2026-08-28).
 *
 * Endre kérése: „Lehessen kinyomtatni a kartotékából - Legyen egy szép
 * formája! […] A megnyitás új fülön legyen egy nyomtatási ablak, mert
 * jelenleg egy nyers szöveg jelenik ott meg."
 *
 * A lap a tárolt számla-adatlapot mutatja (a hiteles bizonylat maga az
 * e-Factura XML / PDF — az továbbra is letölthető a Számlák nézetből);
 * kétnyelvű feliratokkal, a könyvelési párosítás állapotával, és egy
 * nyomtatás-gombbal. Nyomtatáskor csak maga a lap kerül papírra.
 */
export default async function SzamlaAdatlapPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.effectiveCongregationId) return notFound()
  const congId = access.effectiveCongregationId

  const { data, error } = await access.supabase
    .from('szallitoi_szamla')
    .select('*')
    .eq('id', id)
    .eq('congregation_id', congId)
    .maybeSingle()
  if (error || !data) return notFound()
  const szamla = data as SzallitoiSzamla

  // Könyvelési párosítás(ok) + bank-nevek — a „hol van a könyvelésben" sorhoz.
  const [{ data: kapcsolatok }, { data: bankok }] = await Promise.all([
    access.supabase
      .from('szallitoi_szamla_kiadas')
      // 2026-09-03 (átvilágítás P1): a törölt/sztornózott zászló IS kell — ez az
      // adatlap KIFELÉ megy (nyomtatva, könyvelőnek), és eddig sztornózott
      // tételt sorolt fel „Könyvelési tétel"-ként.
      .select('osszeg_resz, kiadas:kiadas_id (id, datum, osszeg, iratszam, bankszamla_id, deleted, stornozott)')
      .eq('szamla_id', id)
      .eq('congregation_id', congId),
    access.supabase.from('bankszamlak').select('id, bank_neve').eq('congregation_id', congId),
  ])
  const bankNevById = new Map(
    ((bankok || []) as Array<{ id: number; bank_neve: string }>).map((b) => [b.id, b.bank_neve]),
  )
  const parok = ((kapcsolatok || []) as unknown as Array<{
    osszeg_resz: number
    kiadas: {
      id: number
      datum: string | null
      osszeg: number
      iratszam: string | null
      bankszamla_id: number | null
      deleted?: boolean | null
      stornozott?: boolean | null
    } | null
  }>)
    .filter((k) => k.kiadas)
    .map((k) => ({
      datum: k.kiadas!.datum,
      iratszam: k.kiadas!.iratszam,
      osszegResz: Number(k.osszeg_resz) || 0,
      ervenytelen: !!k.kiadas!.deleted || !!k.kiadas!.stornozott,
      hely: k.kiadas!.bankszamla_id != null
        ? bankNevById.get(k.kiadas!.bankszamla_id) ?? `#${k.kiadas!.bankszamla_id}`
        : 'Kassza',
    }))
  // Az ÉLŐ párok döntik el a „Könyvelve" állítást; a halottakat KIÍRJUK, de
  // láthatóan megjelölve — egy hivatalos íven nem szerepelhet néma valótlanság.
  const eloParok = parok.filter((p) => !p.ervenytelen)

  const datum = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('hu-HU') : '—'
  const osszeg = `${szamla.osszeg.toLocaleString('hu-HU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${szamla.penznem}`
  const lejart =
    !szamla.kifizetve &&
    !!szamla.fizetesi_hatarido &&
    szamla.fizetesi_hatarido < new Date().toISOString().slice(0, 10)

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-4">
      {/* Nyomtatáskor CSAK a lap látszik — az app-héj (oldalsáv, fejléc) nem. */}
      {/* eslint-disable-next-line react/no-danger */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print {
            body * { visibility: hidden !important; }
            #szamla-lap, #szamla-lap * { visibility: visible !important; }
            #szamla-lap { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: 0 !important; }
          }`,
        }}
      />

      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-slate-500">
          Számla-adatlap — a hiteles bizonylat az e-Factura XML / PDF.
        </p>
        <SzamlaNyomtatasGomb />
      </div>

      <div
        id="szamla-lap"
        className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        {/* Fejléc */}
        <div className="mb-6 flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
              Factură primită · Befogadott számla
            </p>
            <h1 className="mt-1 font-heading text-2xl text-slate-900">
              {szamla.szallito_nev || 'Ismeretlen szállító'}
            </h1>
            {szamla.szallito_cui && (
              <p className="text-sm text-slate-600">CUI/CIF: {szamla.szallito_cui}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
              {szamla.tipus === 'jovairo' ? 'Jóváíró · Credit Note' : 'Számla · Invoice'}
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {szamla.szamla_szam || '—'}
            </p>
            <p className="text-xs text-slate-500">{access.congregationName}</p>
          </div>
        </div>

        {/* Adatsorok */}
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">
              Kiállítás dátuma · Data emiterii
            </dt>
            <dd className="text-sm font-medium text-slate-800">{datum(szamla.kiallitas_datum)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">
              Fizetési határidő · Scadența
            </dt>
            <dd className={`text-sm font-medium ${lejart ? 'text-red-600' : 'text-slate-800'}`}>
              {datum(szamla.fizetesi_hatarido)}
              {lejart ? ' — LEJÁRT' : ''}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">
              Végösszeg · Total de plată
            </dt>
            <dd className="text-xl font-bold tabular-nums text-slate-900">{osszeg}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">
              ANAF-azonosító
            </dt>
            <dd className="break-all text-sm text-slate-700">{szamla.anaf_uuid}</dd>
          </div>
        </dl>

        {/* Állapotok */}
        <div className="mt-6 flex flex-wrap gap-2">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
              szamla.kifizetve
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                : 'bg-amber-50 text-amber-800 ring-amber-200'
            }`}
          >
            {szamla.kifizetve ? 'Kifizetve · Achitată' : 'Kifizetetlen · Neachitată'}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
              parok.length > 0
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                : 'bg-slate-50 text-slate-600 ring-slate-200'
            }`}
          >
            {eloParok.length > 0
              ? `Könyvelve — ${[...new Set(eloParok.map((p) => p.hely))].join(', ')}`
              : 'Még nincs a könyvelésben'}
          </span>
        </div>

        {/* Könyvelési párok */}
        {parok.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
              Könyvelési tétel(ek) · Înregistrări contabile
            </p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-1.5 pr-3 font-medium">Dátum</th>
                  <th className="py-1.5 pr-3 font-medium">Iratszám</th>
                  <th className="py-1.5 pr-3 font-medium">Hely</th>
                  <th className="py-1.5 text-right font-medium">Összeg-rész</th>
                </tr>
              </thead>
              <tbody>
                {parok.map((p, i) => (
                  <tr
                    key={i}
                    className={`border-b border-slate-100 ${p.ervenytelen ? 'text-slate-400 line-through' : ''}`}
                  >
                    <td className="py-1.5 pr-3">{datum(p.datum)}</td>
                    <td className="py-1.5 pr-3">
                      {p.iratszam || '—'}
                      {p.ervenytelen && (
                        <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 no-underline">
                          sztornózott
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3">{p.hely}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {p.osszegResz.toLocaleString('hu-HU', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      RON
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {szamla.megjegyzes && (
          <p className="mt-6 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            {szamla.megjegyzes}
          </p>
        )}

        <p className="mt-8 border-t border-slate-200 pt-3 text-[11px] text-slate-400">
          Kartotéka — számla-adatlap · a hiteles bizonylat az ANAF e-Factura XML.
          Nyomtatva: {new Date().toLocaleDateString('hu-HU')}
        </p>
      </div>
    </div>
  )
}
