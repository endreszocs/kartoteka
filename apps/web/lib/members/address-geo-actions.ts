'use server'

/**
 * CÍM-EGYEZTETÉS MENTÉSE (2026-08-11).
 *
 * A tulajdonosi kérés: „Legyen valamilyen egyeztetés és lekérés, hogy biztosan
 * jól működjön!" — vagyis ha az automatikus térkép-link mégis mellétalál, a
 * lelkész EGYSZER megerősíthesse a helyet, és onnantól soha többé ne hibázzon.
 *
 * A megerősítés a TELEPÜLÉS vagy az UTCA sorára kerül, nem a személyre: a
 * „Barátos → Brateș" egyeztetés így EGYSZERRE javítja mindenkit, aki ott lakik.
 *
 * ⚠️ Az `adrlocality`/`adrstreet` KÖZÖS, országos törzsadat: az `authenticated`
 *    szerepnek csak SELECT-grantja van rá (2026-04-21-adr-grant-authenticated.sql),
 *    írni kizárólag guardolt SECURITY DEFINER RPC-n keresztül lehet — ugyanaz a
 *    minta, mint az `app_get_or_create_locality`-nál. Az RPC azt is ellenőrzi,
 *    hogy a hívó gyülekezete TÉNYLEG használja-e az adott települést/utcát,
 *    így egy lelkész nem tud országos referencia-adatot elrontani.
 *
 * ⚠️ A funkció MŰKÖDIK a 2026-08-11-cim-geokodolas.sql lefutása ELŐTT is: ha az
 *    RPC még nem létezik, barátságos magyar üzenetet adunk vissza, és a karton
 *    a hivatalos román névvel dolgozik tovább — semmi nem omlik össze.
 */

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { isValidGeoPoint, type AddressGeoSaveInput, type AddressGeoSaveResult } from '@/lib/members/directions'

/** A migráció hiányát jelző PostgREST-hibák (séma-gyorsítótár + Postgres). */
const MISSING_RPC_HINT =
  'A cím-egyeztetés adatbázis-része még nincs telepítve (migration-docs/sql/2026-08-11-cim-geokodolas.sql). Amíg nem fut le, az útvonal a hivatalos román névvel próbálkozik — a mentés viszont nem működik.'

export async function saveAddressGeo(input: AddressGeoSaveInput): Promise<AddressGeoSaveResult> {
  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó — jelentkezz be újra.' }
  if (!congregationId) return { error: 'Nincs kiválasztott gyülekezet — válassz profilt, majd próbáld újra.' }

  if (input.scope !== 'locality' && input.scope !== 'street') {
    return { error: 'Ismeretlen egyeztetési szint.' }
  }
  if (!Number.isInteger(input.id) || input.id <= 0) {
    return { error: 'Hiányzik a település/utca azonosítója — a cím valószínűleg szabad szövegként van rögzítve. Nyisd meg a tag szerkesztőjét, és válaszd ki a települést a listából.' }
  }

  const hasPoint = input.lat != null && input.lng != null
  const point = hasPoint ? { lat: Number(input.lat), lng: Number(input.lng) } : null
  if (hasPoint && !isValidGeoPoint(point)) {
    return { error: 'A megadott koordináta érvénytelen.' }
  }

  const nameRo = (input.nameRo || '').trim()
  if (!hasPoint && !nameRo) {
    return { error: 'Adj meg legalább egy térkép-pontot vagy a hivatalos román nevet.' }
  }
  if (nameRo.length > 120) {
    return { error: 'A hivatalos név túl hosszú (legfeljebb 120 karakter).' }
  }

  const { data, error } = await supabase.rpc('app_set_address_geo', {
    p_scope: input.scope,
    p_id: input.id,
    p_lat: point ? point.lat : null,
    p_lng: point ? point.lng : null,
    p_name_ro: nameRo || null,
  })

  if (error) {
    // PGRST202 = a séma-gyorsítótár nem ismeri a függvényt; 42883 = undefined_function.
    const missing =
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      /app_set_address_geo/i.test(error.message || '')
    if (missing) {
      console.warn('[cim-egyeztetes] az app_set_address_geo RPC hiányzik:', error.message)
      return { error: MISSING_RPC_HINT }
    }
    console.error('[cim-egyeztetes] a mentés hibára futott:', error.message)
    return { error: `A mentés nem sikerült: ${error.message}` }
  }

  // Az RPC jsonb-t ad vissza; a `nev_frissult=false` azt jelenti, hogy a
  // hivatalos név MÁR ki volt töltve, és SZÁNDÉKOSAN nem írtuk felül (egy
  // gyülekezet nem javíthat felül egy másikét az országos törzsadaton).
  const payload = (data ?? {}) as { nev_frissult?: boolean | null }
  if (nameRo && payload.nev_frissult === false) {
    return {
      ok: true,
      warning: hasPoint
        ? 'A térkép-pontot elmentettük. A hivatalos román nevet nem írtuk felül, mert a címtörzsben már szerepel egy — ha az hibás, jelezd a fejlesztőnek.'
        : 'A hivatalos román nevet nem írtuk felül, mert a címtörzsben már szerepel egy — így most semmi nem változott. Ha a tárolt név hibás, jelezd a fejlesztőnek; addig ments inkább térkép-pontot, az mindig érvényesül.',
    }
  }

  return { ok: true }
}
