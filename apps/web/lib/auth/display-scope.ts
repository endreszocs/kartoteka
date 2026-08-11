import 'server-only'

/**
 * MEGJELENÍTÉSI HATÓKÖR — szerver-oldali feloldó (2026-08-11).
 *
 * A döntési szabály a `display-scope-core.ts`-ben van (tiszta függvény, önteszttel).
 * Ez a fájl csak annyit tesz, hogy a bekapcsolt profil `scope`/`scope_id` párját
 * GYÜLEKEZET-AZONOSÍTÓKRA oldja fel, majd átadja a metsző függvénynek.
 *
 * ⚠️ MINDEN feloldási hiba `undefined`-ot ad vissza (nem üres tömböt), mert a
 *    kettő MÁST jelent: az üres tömb = „bizonyítottan nincs gyülekezet",
 *    az `undefined` = „nem tudjuk" → a metsző fail-closed ágára fut.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  metszHatokort,
  type AktivScopeBemenet,
  type MegjelenitesiHatokor,
} from './display-scope-core'

export type {
  AktivScopeBemenet,
  MegjelenitesiHatokor,
  ProfilScope,
} from './display-scope-core'
export { uresHatokor } from './display-scope-core'

/**
 * A bekapcsolt profil hatóköre gyülekezet-azonosítókban.
 *
 * @returns `null` = a profil nem szűkít (rendszergazdai profil).
 *          `undefined` = NEM SIKERÜLT feloldani (fail-closed jelzés).
 */
async function resolveProfilCongregationIds(
  supabase: SupabaseClient,
  scope: AktivScopeBemenet,
  scopeId: string | null,
  effectiveCongregationId: string | null,
): Promise<string[] | null | undefined> {
  // „Nem tudjuk, mi a bekapcsolt profil" → nincs mit feloldani, fail-closed.
  if (scope === 'ismeretlen') return undefined
  if (scope === null || scope === 'system') return null

  if (scope === 'congregation') {
    // A profil saját gyülekezete. Ha a `scope_id` hiányzik, a szerver-oldalon
    // feloldott effektív gyülekezet a tartalék — ha az sincs, fail-closed.
    const id = scopeId || effectiveCongregationId
    return id ? [id] : undefined
  }

  if (scope === 'diocese') {
    if (!scopeId) return undefined
    const { data, error } = await supabase
      .from('congregations')
      .select('id')
      .eq('diocese_id', scopeId)
    if (error) return undefined
    return (data ?? []).map((c) => (c as { id: string }).id)
  }

  // scope === 'district'
  if (!scopeId) return undefined
  const { data, error } = await supabase
    .from('congregations')
    .select('id, dioceses!inner(district_id)')
    .eq('dioceses.district_id', scopeId)
  if (error) return undefined
  return (data ?? []).map((c) => (c as { id: string }).id)
}

/**
 * A megjelenítési hatókör: `metszet(jogosultsági hatókör, bekapcsolt profil)`.
 *
 * @param jogosultsagi a `getScopedCongregationIds` eredménye (`null` = korlátlan)
 */
export async function resolveMegjelenitesiHatokor(params: {
  supabase: SupabaseClient
  jogosultsagi: string[] | null
  /** `'ismeretlen'` = a `profile_roles` nem volt beolvasható → fail-closed. */
  aktivScope: AktivScopeBemenet
  aktivScopeId: string | null
  effectiveCongregationId: string | null
}): Promise<MegjelenitesiHatokor> {
  let profil: string[] | null | undefined
  try {
    profil = await resolveProfilCongregationIds(
      params.supabase,
      params.aktivScope,
      params.aktivScopeId,
      params.effectiveCongregationId,
    )
  } catch {
    // Kivétel = nem tudjuk → fail-closed (a metsző üres hatókört ad).
    profil = undefined
  }

  return metszHatokort({
    jogosultsagi: params.jogosultsagi,
    profil,
    aktivScope: params.aktivScope,
  })
}
