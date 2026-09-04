'use server'

/**
 * Szállítói számla — nyomtatvány-action az előnézet-dialógushoz (2026-09-04).
 *
 * Vékony burkoló: hatókör-feloldás + a gyülekezet (vevő) hivatalos adatai, majd a
 * KÖZÖS betöltő (`loadSzamlaNyomtatvany`) — ugyanaz, amit a `szamla/[id]` lap is
 * hív, hogy az előnézet és a lap byte-azonos HTML-t adjon.
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getCongregationHeader } from '@/app/(dashboard)/iktato/szemely-actions'
import { loadSzamlaNyomtatvany } from '@/lib/dokumentumtar/szamla-nyomtatvany-load'
// ⚠️ Next.js 16: a 'use server' fájl CSAK async függvényt exportálhat — a válasz
// típusa ezért a sima lib-ben él (szamla-nyomtatvany.ts), innen csak importáljuk.
import type { SzamlaNyomtatvanyValasz, SzamlaNyomtatvanyVevo } from '@/lib/dokumentumtar/szamla-nyomtatvany'

/** A gyülekezet (vevő) hasábja — a fejléc-adatból + a `congregations` megye/ország mezőiből. */
async function vevoAdatok(): Promise<SzamlaNyomtatvanyVevo> {
  const { header } = await getCongregationHeader()
  const access = await getEffectiveAccessContext()
  let megye: string | null = null
  let orszag: string | null = null
  if (access.effectiveCongregationId) {
    // Best-effort, drift-tűrő: ha az oszlop hiányzik, a hasáb enélkül készül.
    const { data } = await access.supabase
      .from('congregations')
      .select('megye, country')
      .eq('id', access.effectiveCongregationId)
      .maybeSingle()
    const d = (data ?? null) as { megye?: string | null; country?: string | null } | null
    megye = d?.megye?.trim() || null
    orszag = d?.country?.trim() || null
  }
  return {
    nev: header?.hivatalosNev || access.congregationName || null,
    cif: header?.cif ?? null,
    cim: header?.cimHu ?? null,
    megye,
    orszag,
    telefon: header?.telefon ?? null,
    email: header?.email ?? null,
  }
}

export async function getSzamlaNyomtatvany(szamlaId: string): Promise<SzamlaNyomtatvanyValasz> {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.effectiveCongregationId) {
    return { html: null, title: null, sheetCount: 0, xmlHiba: null, error: 'Nincs bejelentkezett felhasználó vagy gyülekezet.' }
  }
  const vevo = await vevoAdatok()
  const r = await loadSzamlaNyomtatvany({
    supabase: access.supabase,
    congId: access.effectiveCongregationId,
    szamlaId,
    vevo,
    nyomtatta: access.user.email ?? null,
  })
  if (!r.ok) return { html: null, title: null, sheetCount: 0, xmlHiba: null, error: r.error }
  return { html: r.eredmeny.html, title: r.eredmeny.title, sheetCount: r.eredmeny.sheetCount, xmlHiba: r.xmlHiba, error: null }
}
