export const INVENTORY_CATEGORIES = ['alapeszkoz', 'telek', 'csekely', 'konyv', 'kegyszer', 'karpotlasi', 'bizomanyi'] as const
export type InventoryCategory = typeof INVENTORY_CATEGORIES[number]

export const INVENTORY_CATEGORY_LABELS: Record<InventoryCategory, string> = {
  alapeszkoz: 'Alapeszközök',
  telek: 'Telkek / földek',
  csekely: 'Csekély értékű',
  konyv: 'Könyvek',
  kegyszer: 'Kegyszerek',
  karpotlasi: 'Kárpótlási',
  bizomanyi: 'Bizományi',
}

export const INVENTORY_CATEGORY_PREFIXES: Record<InventoryCategory, string> = {
  alapeszkoz: 'AE', telek: 'TF', csekely: 'CS', konyv: 'KV', kegyszer: 'KE', karpotlasi: 'KP', bizomanyi: 'BZ',
}

export interface InventoryItem {
  id: string
  leltari_szam: string | null
  megnevezes: string
  kategoria: string
  beszerzes_erteke: number
  beszerzes_datuma: string | null
  katalogus_kod: string | null
  hasznalati_ido: number | null
  helyszin: string | null
  felelos_nev: string | null
  vonalkod: string | null
  megjegyzes: string | null
  deleted: boolean
}
