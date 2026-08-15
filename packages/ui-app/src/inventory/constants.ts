/**
 * Leltár közös konstansok — kategóriák, címkék (HU/RO), prefixek, normalizálás
 * (2026-08-15, desktop-paritás 4. szelet — „Leltár: rögzítés + fisa").
 *
 * MIÉRT közös: a webes `apps/web/lib/constants/inventory.next.ts`-ből emeltük
 * ide VÁLTOZATLAN tartalommal — a webes fájl mostantól innen re-exportál, a
 * desktop leltár-oldal és tétel-dialógus pedig szintén innen importál. Így a
 * kategória-készlet és a román hivatalos terminológia EGY helyen él (a
 * „második felület a régi implementációt őrzi" hibaosztály megszüntetése:
 * a desktop leltar-page.tsx saját, ELAVULT kategória-címkéket tükrözött).
 *
 * Az amortizációs katalógus NEM itt van: az már korábban közösbe került
 * (`packages/ui-app/src/finance/inventory.ts`) — onnan importáld
 * (INVENTORY_AMORTIZATION_CATALOG, getInventoryAmortizationCatalogEntry).
 */

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
  /** 2026-08-09: a kapcsolt kiadás xkey-e (pénzügy→leltár / leltár→pénzügy híd). */
  penzugy_xkey: string | null
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
