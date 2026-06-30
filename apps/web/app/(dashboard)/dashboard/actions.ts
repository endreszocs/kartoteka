'use server'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'

// FONTOS: ez egy 'use server' fájl — csak ASYNC FÜGGVÉNYT exportálhat.
// A típusok és segéd-fv-ek NEM exportáltak (lokálisak), így nem sérül a szabály.
type AddressMemberRow = {
  id: number
  c_szam: string | null
  c_szcim: string | null
  adrstreet: { name: string | null } | { name: string | null }[] | null
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
  const locality = localityObj?.name?.trim() || null

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

  const { data } = await supabase
    .from('szemely')
    .select('id, c_szam, c_szcim, adrstreet!c_utcaid(name), adrlocality!c_helysegid(name)')
    .eq('congregation_id', congregationId)
    .eq('meghalt', false)

  const map: Record<string, string> = {}
  for (const row of (data || []) as AddressMemberRow[]) {
    const addr = composeAddress(row)
    if (addr) map[String(row.id)] = addr
  }
  return map
}
