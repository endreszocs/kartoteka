'use server'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'

// FONTOS: ez egy 'use server' fájl — csak ASYNC FÜGGVÉNYT exportálhat.
// A típusok és segéd-fv-ek NEM exportáltak (lokálisak), így nem sérül a szabály.
type StreetRel = { name: string | null; adrlocality?: { name: string | null } | { name: string | null }[] | null }
type AddressMemberRow = {
  id: number
  c_szam: string | null
  c_szcim: string | null
  adrstreet: StreetRel | StreetRel[] | null
  adrlocality: { name: string | null } | { name: string | null }[] | null
}

/**
 * Lakcím összeállítása „Helység, Utca Házszám" formátumban.
 * Prioritás: strukturált (adrstreet) → szabad-szöveges c_szcim → csak helység/házszám.
 * (Bit-azonos a korábbi birthday-list-dialog logikával — 2026-06-30 áthelyezve ide.)
 */
function composeAddress(m: AddressMemberRow): string | null {
  const streetRaw = m.adrstreet
  const streetObj = Array.isArray(streetRaw) ? streetRaw[0] : streetRaw
  const street = streetObj?.name?.trim() || null

  const localityRaw = m.adrlocality
  const localityObj = Array.isArray(localityRaw) ? localityRaw[0] : localityRaw
  // 2026-07-17 (PR-1): ha a c_helysegid-join üres (import-hiba öröksége), a
  // település az utca beágyazott adrlocality-jából pótlódik.
  const streetLocRaw = streetObj?.adrlocality
  const streetLocObj = Array.isArray(streetLocRaw) ? streetLocRaw[0] : streetLocRaw
  const locality = localityObj?.name?.trim() || streetLocObj?.name?.trim() || null

  const hazszam = m.c_szam?.trim() || null
  const szabadSzoveg = m.c_szcim?.trim() || null

  if (street) {
    const streetLine = hazszam ? `${street} ${hazszam}` : street
    return locality ? `${locality}, ${streetLine}` : streetLine
  }
  if (szabadSzoveg) return hazszam ? `${szabadSzoveg} ${hazszam}` : szabadSzoveg
  if (locality) return hazszam ? `${locality}, ${hazszam}` : locality
  if (hazszam) return hazszam
  return null
}

/**
 * A születésnap-lista nyomtatásához szükséges lakcímek — KÉRÉSRE betöltve.
 *
 * A dashboard fő lekérdezése (2026-06-30 perf) már NEM hozza a cím-joinokat,
 * mert azok csak a BirthdayListDialog modálban, a „Lakhely megjelenítése"
 * kapcsoló mögött kellenek. Visszatérés: { [szemely_id]: összeállított cím }.
 * (Csak a nem-üres címek kerülnek be a térképbe.)
 */
export async function getBirthdayListAddresses(): Promise<Record<string, string>> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return {}

  // 2026-08-01 (PR-19): lapozott lekérés — 1000 tag felett a címek egy része
  // némán hiányzott volna.
  const PAGE = 1000
  const map: Record<string, string> = {}
  for (let fromIdx = 0; ; fromIdx += PAGE) {
    const { data, error } = await supabase
      .from('szemely')
      .select('id, c_szam, c_szcim, adrstreet!c_utcaid(name, adrlocality!localityid(name)), adrlocality!c_helysegid(name)')
      .eq('congregation_id', congregationId)
      .eq('meghalt', false)
      .order('id', { ascending: true })
      .range(fromIdx, fromIdx + PAGE - 1)
    if (error) {
      // 2026-08-02 (review-fix): a néma break FÉLIG kitöltött cím-térképet
      // adott volna vissza (félrevezető, mintha a többieknek nem lenne címe) —
      // hibánál inkább dobunk, a dialógus catch-e egységesen üresre esik vissza.
      console.error('[getBirthdayListAddresses] lap-lekérés hiba, from=' + fromIdx, error.message)
      throw new Error('A címek betöltése nem sikerült.')
    }
    for (const row of (data || []) as AddressMemberRow[]) {
      const addr = composeAddress(row)
      if (addr) map[String(row.id)] = addr
    }
    if ((data || []).length < PAGE) break
  }
  return map
}
