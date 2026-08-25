// 2026-08-25: Napi ige — összefésülő modul.
//
// A két félév tartalmát (napi-ige-1felev.ts: 182 kulcs, napi-ige-2felev.ts:
// 184 kulcs) egyetlen 366 kulcsos naptárrá fésüli össze ('01-01' … '12-31',
// +'02-29'). A tartalom-fájlokhoz itt NEM nyúlunk — a szerződés a
// napi-ige-types.ts-ben rögzített.
//
// Fail-closed: hiányzó kulcs → null (a felület elegáns tartalék-szöveget mutat).

import type { NapiIge, NapiIgeNaptar } from './napi-ige-types'
import { napiIgeKulcs } from './napi-ige-types'
import { NAPI_IGEK_1FELEV } from './napi-ige-1felev'
import { NAPI_IGEK_2FELEV } from './napi-ige-2felev'

/** A teljes évi naptár: 366 kulcs ('MM-DD', a szökőnapi '02-29'-cel együtt). */
export const NAPI_IGEK: NapiIgeNaptar = { ...NAPI_IGEK_1FELEV, ...NAPI_IGEK_2FELEV }

/** A mai napi ige — hiányzó bejegyzésnél null (fail-closed, sosem dob). */
export function maiNapiIge(datum: Date): NapiIge | null {
  return NAPI_IGEK[napiIgeKulcs(datum)] ?? null
}
