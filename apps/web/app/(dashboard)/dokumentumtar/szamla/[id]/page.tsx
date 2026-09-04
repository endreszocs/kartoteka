import { notFound } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getCongregationHeader } from '@/app/(dashboard)/iktato/szemely-actions'
import { loadSzamlaNyomtatvany } from '@/lib/dokumentumtar/szamla-nyomtatvany-load'
import { SzamlaNyomtatasGomb } from './nyomtatas-gomb'

/**
 * Szállítói számla — NYOMTATHATÓ adatlap (közvetlen URL-ről, könyvjelzőhöz).
 *
 * 2026-09-04 (Endre 3. kérése): a lap az ANAF/Oblio e-Factura-lap SZERKEZETÉT
 * követi — sortételekkel, felekkel, ÁFA-bontással, „Kartotékából nyomtatva"
 * jelöléssel. A HTML-t a KÖZÖS betöltő adja (`loadSzamlaNyomtatvany`), UGYANAZ,
 * amit a Számlák nézet előnézet-dialógusa is hív — a két felület nem tud
 * széthúzni. Az elsődleges út a dialógus; ez a lap a megosztható/könyvjelzőzhető
 * változat.
 *
 * FAIL-LOUD: a DB-hiba és a „nincs ilyen számla" KÜLÖN ág. Korábban
 * `if (error || !data) return notFound()` volt — egy átmeneti 503 (a repó
 * ismert DDL-utáni ablaka) „eltűnt a számla"-ként jelent meg a lelkésznek.
 *
 * Nyomtatáskor CSAK a lap kerül papírra (az app-héj nem): a `#szamla-lap` +
 * `@media print` szabály őrizve (selftest-szamla-egyeztetes-ux).
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

  // A gyülekezet (vevő) hasábja — fejléc-adat + megye/ország (drift-tűrő, best-effort).
  const { header } = await getCongregationHeader()
  let megye: string | null = null
  let orszag: string | null = null
  {
    const { data } = await access.supabase
      .from('congregations')
      .select('megye, country')
      .eq('id', congId)
      .maybeSingle()
    const d = (data ?? null) as { megye?: string | null; country?: string | null } | null
    megye = d?.megye?.trim() || null
    orszag = d?.country?.trim() || null
  }

  const r = await loadSzamlaNyomtatvany({
    supabase: access.supabase,
    congId,
    szamlaId: id,
    vevo: {
      nev: header?.hivatalosNev || access.congregationName || null,
      cif: header?.cif ?? null,
      cim: header?.cimHu ?? null,
      megye,
      orszag,
      telefon: header?.telefon ?? null,
      email: header?.email ?? null,
    },
    nyomtatta: access.user.email ?? null,
  })

  if (!r.ok) {
    if (r.notFound) return notFound()
    // DB-hiba: NEM 404 — mondjuk ki, mi történt, hogy ne „eltűnt számla"-ként lássa.
    return (
      <div className="mx-auto max-w-3xl py-8">
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
          <p className="font-heading text-lg">A számla-adatlap most nem tölthető be.</p>
          <p className="mt-2 text-sm">{r.error}</p>
          <p className="mt-2 text-xs text-rose-700">
            Ez átmeneti adatbázis-hiba lehet — próbáld újra egy perc múlva. A számla nem tűnt el.
          </p>
        </div>
      </div>
    )
  }

  // A közös HTML egy teljes dokumentum; ide a <style> és a lap-doboz kerül be.
  const css = r.eredmeny.html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''
  const lap = r.eredmeny.html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? ''

  return (
    <div className="mx-auto max-w-[220mm] space-y-4 py-4">
      {/* Nyomtatáskor CSAK a lap látszik — az app-héj (oldalsáv, fejléc) nem. */}
      {/* eslint-disable-next-line react/no-danger */}
      <style
        dangerouslySetInnerHTML={{
          __html: `${css}
          #szamla-lap .sheet { margin: 0 auto; }
          @media print {
            body * { visibility: hidden !important; }
            #szamla-lap, #szamla-lap * { visibility: visible !important; }
            #szamla-lap { position: absolute; left: 0; top: 0; width: 100%; }
          }`,
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-slate-500">
          Kartotékából nyomtatott adatlap — a hiteles bizonylat az e-Factura XML / PDF.
          {r.xmlHiba ? ' A sortételek most nem szerepelnek (az XML nem érhető el).' : ''}
        </p>
        <SzamlaNyomtatasGomb />
      </div>

      {/* eslint-disable-next-line react/no-danger */}
      <div id="szamla-lap" dangerouslySetInnerHTML={{ __html: lap }} />
    </div>
  )
}
