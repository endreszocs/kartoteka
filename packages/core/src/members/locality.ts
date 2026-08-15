import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Település-feloldás — meglévő `adrlocality` sor keresése, hiányzónál guardolt
 * RPC-s létrehozás.
 *
 * 2026-08-15 (desktop-paritás 2. szelet): az implementáció az
 * apps/web/app/(dashboard)/tagnyilvantartas/actions.ts privát helperéből
 * került ide, mert a kivezetés desktop-tükrének ugyanez a feloldás kell —
 * két másolat helyett egy közös függvény (a repó ismert hibaosztálya:
 * „a második felület a régi implementációt őrzi"). A web-oldali wrapper
 * csak a kliens-példányosítást teszi hozzá.
 */
export async function getOrCreateLocality(
  supabase: SupabaseClient,
  name: string,
): Promise<number | null> {
  const trimmed = name?.trim()
  if (!trimmed) return null
  // 1) Meglévő település keresése — SELECT-grant mindig van, így ez a
  //    leggyakoribb eset a migráció lefutása előtt is működik.
  //    2026-07-24 (PR-11 review): a % és _ ILIKE-metakarakterek escape-elve
  //    (különben pl. "Sepsi_szentgyörgy" mintaként viselkedne), és
  //    determinisztikus sorrend duplikált nevű települések esetére.
  const escaped = trimmed.replace(/([\\%_])/g, '\\$1')
  const { data: existing } = await supabase
    .from('adrlocality')
    .select('id')
    .ilike('name', escaped)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existing?.id) return existing.id
  // 2) Létrehozás guardolt RPC-n
  const { data, error } = await supabase.rpc('app_get_or_create_locality', { p_name: trimmed })
  if (error || typeof data !== 'number') {
    console.error('[getOrCreateLocality] sikertelen:', error?.message)
    return null
  }
  return data
}
