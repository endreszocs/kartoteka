export const WORKLOG_CATEGORIES = ['szolgalat', 'katekezis', 'latogatas'] as const
export type WorklogCategory = typeof WORKLOG_CATEGORIES[number]

export const WORKLOG_CATEGORY_LABELS: Record<WorklogCategory, string> = {
  szolgalat: 'Szolgálat', katekezis: 'Katekézis', latogatas: 'Látogatás',
}

export const WORKLOG_TYPES: Record<WorklogCategory, string[]> = {
  szolgalat: ['Istentisztelet', 'Igehirdetés', 'Úrvacsora', 'Bibliaóra', 'Imaóra', 'Esti áhítat', 'Alkalmi istentisztelet', 'Egyéb szolgálat'],
  katekezis: ['Bibliaóra', 'Hittan', 'Konfirmáció előkészítő', 'Ifjúsági óra', 'Gyermek foglalkozás', 'Egyéb katekézis'],
  latogatas: ['Családlátogatás', 'Kórházlátogatás', 'Idősek otthona', 'Börtönlátogatás', 'Egyéb látogatás'],
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
