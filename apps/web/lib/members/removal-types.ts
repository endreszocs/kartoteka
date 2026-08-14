/**
 * Személy-törlés két útja (2026-08-14, Endre 1. döntése) — közös típusok.
 *
 * KÜLÖN FÁJLBAN, mert a tagnyilvantartas/actions.ts 'use server' modul,
 * amiből csak async function exportálható (Next 16 szabály).
 */

/** Egy hivatkozás-kategória a szemely_kapcsolatok RPC katalógusából. */
export interface PersonReferenceItem {
  kulcs: string
  cimke: string
  darab: number
}

/**
 * Az előzetes kapcsolat-ellenőrzés eredménye.
 * `available: false` = az RPC (még) nem érhető el — a felület a régi,
 * általános figyelmeztetést mutatja (fail-soft, a migráció előtt is működik).
 */
export interface PersonReferencesResult {
  available: boolean
  /** Védett kapcsolatok — ha van ilyen, nincs fizikai törlés, csak elrejtés. */
  blokkolo: PersonReferenceItem[]
  /** A törléssel együtt eltűnő kapcsolt sorok (tájékoztató). */
  veleTorlodik: PersonReferenceItem[]
  error?: string
}

/** Egy rejtett (isvisible=false) személy a visszahozó listában. */
export interface HiddenMemberItem {
  id: number
  nev: string
  memberStatus: string | null
}
