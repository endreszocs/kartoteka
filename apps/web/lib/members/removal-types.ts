/**
 * Személy-törlés két útja (2026-08-14, Endre 1. döntése) — közös típusok.
 *
 * KÜLÖN FÁJLBAN, mert a tagnyilvantartas/actions.ts 'use server' modul,
 * amiből csak async function exportálható (Next 16 szabály).
 *
 * 2026-08-15 (desktop-paritás 2. szelet): a kapcsolat-ellenőrzés típusai a
 * közös @kartoteka/validations csomagba kerültek (members/szemely-remove.ts) —
 * a desktop kivezetés-tükre is ugyanazokat használja. Innen re-export a
 * meglévő webes importok kedvéért.
 */

export type { PersonReferenceItem, PersonReferencesResult } from '@kartoteka/validations'

/** Egy rejtett (isvisible=false) személy a visszahozó listában. */
export interface HiddenMemberItem {
  id: number
  nev: string
  memberStatus: string | null
}
