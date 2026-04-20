export const INVENTORY_CATEGORIES = [
  'alapeszkoz',
  'telek',
  'csekely',
  'konyv',
  'kegyszer',
  'karpotlasi',
  'bizomanyi',
] as const

export type InventoryCategory = typeof INVENTORY_CATEGORIES[number]

export const INVENTORY_CATEGORY_LABELS: Record<InventoryCategory, string> = {
  alapeszkoz: 'Alapeszközök',
  telek: 'Telkek, földek, erdők',
  csekely: 'Csekély értékű leltári tárgyak',
  konyv: 'Könyvek',
  kegyszer: 'Kegyszerek',
  karpotlasi: 'Kárpótlási jegyek és részvények',
  bizomanyi: 'Bizományi',
}

export const INVENTORY_CATEGORY_ROMANIAN_LABELS: Record<InventoryCategory, string> = {
  alapeszkoz: 'Mijloace fixe',
  telek: 'Terenuri si amplasamenturi',
  csekely: 'Obiecte de inventar',
  konyv: 'Cărți',
  kegyszer: 'Obiecte de cult',
  karpotlasi: 'Acțiuni și titluri de proprietate',
  bizomanyi: 'Custodie',
}

export const INVENTORY_CATEGORY_PREFIXES: Record<InventoryCategory, string> = {
  alapeszkoz: 'AE',
  telek: 'T',
  csekely: 'CS',
  konyv: 'K',
  kegyszer: 'KG',
  karpotlasi: 'KR',
  bizomanyi: 'B',
}

const INVENTORY_CATEGORY_ALIASES: Record<InventoryCategory, string[]> = {
  alapeszkoz: ['alapeszkoz', 'alapeszkozok', 'alapeszközök', 'mijloacefixe'],
  telek: [
    'telek',
    'telkek',
    'telkekfoldekerdok',
    'telkek_foldek_erdok',
    'telkekföldek',
    'terenuri',
  ],
  csekely: ['csekely', 'csekelyerteku', 'csekelyertekutargyak', 'obiectedeinventar'],
  konyv: ['konyv', 'konyvek', 'carti'],
  kegyszer: ['kegyszer', 'kegyszerek', 'obiectedecult'],
  karpotlasi: [
    'karpotlasi',
    'karpotlasijegyekreszvenyek',
    'reszvenyekkarpotlasi',
    'actiuni',
    'titlurideproprietate',
  ],
  bizomanyi: ['bizomanyi', 'custodie'],
}

function normalizeInventoryToken(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

export function normalizeInventoryCategory(value?: string | null): InventoryCategory | null {
  if (!value) return null

  const token = normalizeInventoryToken(value)

  for (const category of INVENTORY_CATEGORIES) {
    if (INVENTORY_CATEGORY_ALIASES[category].some(alias => normalizeInventoryToken(alias) === token)) {
      return category
    }
  }

  return null
}

export function serializeInventoryCategory(category: InventoryCategory): string {
  switch (category) {
    case 'alapeszkoz':
      return 'Alapeszközök'
    case 'telek':
      return 'Telkek_foldek_erdok'
    case 'csekely':
      return 'Csekély értékű'
    case 'konyv':
      return 'Könyvek'
    case 'kegyszer':
      return 'Kegyszerek'
    case 'karpotlasi':
      return 'Kárpótlási'
    case 'bizomanyi':
      return 'Bizományi'
  }
}

export function getInventoryCategoryLabel(value?: string | null) {
  const normalized = normalizeInventoryCategory(value)
  return normalized ? INVENTORY_CATEGORY_LABELS[normalized] : value || 'Ismeretlen kategória'
}

export function getInventoryCategoryRomanianLabel(value?: string | null) {
  const normalized = normalizeInventoryCategory(value)
  return normalized ? INVENTORY_CATEGORY_ROMANIAN_LABELS[normalized] : value || 'Necunoscut'
}

export interface InventoryItem {
  id: string
  leltari_szam: string | null
  regi_leltari_szam: string | null
  megnevezes: string
  kategoria: string
  kategoria_key: InventoryCategory | null
  beszerzes_erteke: number
  beszerzes_datuma: string | null
  beszerzes_bizonylat: string | null
  katalogus_kod: string | null
  hasznalati_ido: number | null
  helyszin: string | null
  felelos_szemely_id: number | null
  felelos_nev: string | null
  vonalkod: string | null
  megjegyzes: string | null
  mennyiseg: number
  mertekegyseg: string | null
  torles_datuma: string | null
  torles_bizonylat: string | null
  torles_indoklasa: string | null
  szerzo: string | null
  konyv_isbn: string | null
  konyv_kiado: string | null
  konyv_kiadas_helye: string | null
  konyv_kiadas_eve: number | null
  konyv_terjedelem: string | null
  konyv_sorozatcim: string | null
  created_at: string | null
  deleted: boolean
}

export interface InventoryAmortizationCatalogEntry {
  kod: string
  nev: string
  minEv: number
  maxEv: number
  defEv: number
}

export const INVENTORY_AMORTIZATION_CATALOG: InventoryAmortizationCatalogEntry[] = [
  { kod: '1.6.2', nev: 'Egyházi, tanügyi épületek', minEv: 40, maxEv: 60, defEv: 50 },
  { kod: '2.1.16.5', nev: 'Hőközpontok (kazánok)', minEv: 8, maxEv: 12, defEv: 10 },
  { kod: '2.2.9', nev: 'Számítógépek, nyomtatók, pénztárgépek', minEv: 2, maxEv: 4, defEv: 3 },
  { kod: '2.3.2.1.1', nev: 'Személyszállító gépkocsi', minEv: 4, maxEv: 6, defEv: 5 },
  { kod: '2.3.2.1.2', nev: 'Mikrobusz', minEv: 4, maxEv: 8, defEv: 6 },
  { kod: '2.3.2.2.1', nev: 'Áruszállító gépkocsi 4.5 t-ig', minEv: 4, maxEv: 6, defEv: 5 },
  { kod: '3.1.1', nev: 'Bútorok (általános)', minEv: 9, maxEv: 15, defEv: 12 },
  { kod: '3.1.1.1', nev: 'Irodai bútor', minEv: 3, maxEv: 5, defEv: 4 },
  { kod: '3.1.5', nev: 'Hangszerek (orgonán kívül)', minEv: 4, maxEv: 6, defEv: 5 },
  { kod: '3.2.1', nev: 'Irodai gépek (a számítógép kivételével)', minEv: 4, maxEv: 6, defEv: 5 },
]

export function getInventoryAmortizationCatalogEntry(code?: string | null) {
  if (!code) return null
  return INVENTORY_AMORTIZATION_CATALOG.find(entry => entry.kod === code) || null
}
