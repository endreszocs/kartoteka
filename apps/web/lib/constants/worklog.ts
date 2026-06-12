export const WORKLOG_CATEGORIES = ['szolgalat', 'katekezis', 'latogatas'] as const
export type WorklogCategory = typeof WORKLOG_CATEGORIES[number]

export const WORKLOG_CATEGORY_LABELS: Record<WorklogCategory, string> = {
  szolgalat: 'Szolgálat', katekezis: 'Katekézis', latogatas: 'Látogatás',
}

// 2026-06-12 (Endre #3-4 munkanapló): a kazuáliák (Keresztelő, Esketés,
// Temetés, Konfirmáció) bekerültek a szolgálati típusok közé — az anyakönyvi
// rögzítés automatikus munkanapló-bejegyzései így a Szolgálat fülön és a
// jelentésekben is megjelennek. (A hivatalos Excel "Szolgálat jellege"
// oszlopa is ide sorolja őket.)
export const WORKLOG_TYPES: Record<WorklogCategory, string[]> = {
  szolgalat: ['Istentisztelet', 'Igehirdetés', 'Úrvacsora', 'Bibliaóra', 'Imaóra', 'Esti áhítat', 'Alkalmi istentisztelet', 'Keresztelő', 'Esketés', 'Temetés', 'Konfirmáció', 'Egyéb szolgálat'],
  katekezis: ['Bibliaóra', 'Hittan', 'Vallásóra', 'Kátéóra', 'Konfirmáció előkészítő', 'Ifjúsági óra', 'Gyermek foglalkozás', 'Egyéb katekézis'],
  latogatas: ['Családlátogatás', 'Beteglátogatás', 'Kórházlátogatás', 'Idősek otthona', 'Börtönlátogatás', 'Egyéb látogatás'],
}

/**
 * 2026-06-12: KÖZÖS kategorizáló — a munkanapló-fülek, a nyomtatási modul és
 * a jelentések is ezt használják.
 *
 * Szabály:
 *  1. ha a `kategoria` kifejezetten 'katekezis' vagy 'latogatas' → azt
 *     használjuk (ezek nem lehetnek DB-default értékek, tehát tudatosan
 *     lettek beállítva);
 *  2. különben a `jellege` típuslisták döntenek (a kategoria oszlop DEFAULT
 *     'szolgalat'-tal jött létre, ezért a legacy soroknál nem megbízható);
 *  3. alapértelmezés: 'szolgalat'.
 */
export function categorizeWorklogEntry(e: { kategoria?: string | null; jellege?: string | null }): WorklogCategory {
  if (e.kategoria === 'katekezis' || e.kategoria === 'latogatas') return e.kategoria
  for (const cat of WORKLOG_CATEGORIES) {
    if (e.jellege && WORKLOG_TYPES[cat].includes(e.jellege)) return cat
  }
  return 'szolgalat'
}

// FONTOS: a mezőnevek a valódi DB séma (munkanaplo tábla) szerintiek.
// A korábbi `leiras`/`resztvevok_*`/`igehely`/`szolgalatvezeto`/`id_szemely`/`id_csalad`
// mezők NEM léteztek a sémában — helyette: `bibliaolvasas`/`alapige`/`enekek`/
// `jelenlet_*`/`szolgalt`/`mediapath`/`kategoria`/`du`/`id_jellege`.
export interface WorklogEntry {
  id: number
  idopont: string | null
  kategoria: string | null
  jellege: string | null
  id_jellege: string | null
  bibliaolvasas: string | null
  alapige: string | null
  cim: string | null
  enekek: string | null
  jelenlet_ferfi: number | null
  jelenlet_no: number | null
  jelenlet_gyermek: number | null
  jelenlet_osszesen: number
  szolgalt: string | null
  persely: number | null
  megjegyzes: string | null
  mediapath: string | null
  du: boolean
  deleted: boolean
  congregation_id: string | null
}
