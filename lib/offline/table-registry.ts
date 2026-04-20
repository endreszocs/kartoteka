/**
 * Table Registry — a sync-tracked táblák központi nyilvántartása.
 *
 * Minden bejegyzés leírja, hogyan kell egy adott Supabase táblát
 * letölteni (pull) és helyileg (Dexie) tárolni.
 *
 * Kulcs mezők:
 *  - `supabaseTable`: a valós Supabase tábla neve (select-tel azonos)
 *  - `dexieTable`: a Dexie tárolás neve (99%-ban azonos)
 *  - `primaryKey`: a sor egyedi azonosítója (az `id` mező neve)
 *  - `scopeFilter`: hogyan szűrünk gyülekezet-scope alapján
 *     - 'congregation_id': szűrés `congregation_id = X`
 *     - 'none': nincs scope (globális lookup tábla)
 *  - `softDelete`: hard DELETE helyett `deleted = true` flag van-e
 *  - `select`: mezők listája vagy '*' (pull-nál elküldjük a szervernek)
 *  - `module`: az Excel fájl modulhoz rendelése
 *
 * A Fázis 0-ban definiált 18 Dexie táblának mind itt kell legyen bejegyzése.
 */

export type ScopeFilter = 'congregation_id' | 'none'

export type ModuleKey =
  | 'tagnyilvantartas'
  | 'penzugy'
  | 'anyakonyv'
  | 'munkanaplo'
  | 'leltar'
  | 'iktato'
  | 'sirhely'
  | 'jegyzokonyvek'
  | 'misszios-muhely'

export interface TableRegistryEntry {
  /** Dexie tábla név — unikus */
  dexieTable: string
  /** Supabase tábla név (általában ugyanaz) */
  supabaseTable: string
  /** Primary key mező neve */
  primaryKey: 'id'
  /** Scope szűrő */
  scopeFilter: ScopeFilter
  /** Soft-delete használat */
  softDelete: boolean
  /** Milyen mezőket válasszunk (* alapértelmezett) */
  select?: string
  /** Modul besorolás (Excel fájlhoz) */
  module: ModuleKey
  /** Ember-olvasható magyar cím (UI-ra) */
  label: string
  /** Pull priority — kisebb szám előbb fut (pl. szemely előbb mint befizetes) */
  priority: number
}

// ─────────────────────────────────────────────────────────────────
// Tagnyilvántartás
// ─────────────────────────────────────────────────────────────────

const TAGNYILVANTARTAS_TABLES: TableRegistryEntry[] = [
  {
    dexieTable: 'szemely',
    supabaseTable: 'szemely',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    softDelete: false,
    module: 'tagnyilvantartas',
    label: 'Személyek',
    priority: 10,
  },
  {
    dexieTable: 'csalad',
    supabaseTable: 'csalad',
    primaryKey: 'id',
    scopeFilter: 'none', // a csalad-nak nincs congregation_id, a szemely-n keresztül
    softDelete: false,
    module: 'tagnyilvantartas',
    label: 'Családok',
    priority: 11,
  },
  {
    dexieTable: 'presbiter',
    supabaseTable: 'presbiter',
    primaryKey: 'id',
    scopeFilter: 'none', // id_szemely FK-n keresztül scope
    softDelete: false,
    module: 'tagnyilvantartas',
    label: 'Presbiterek',
    priority: 20,
  },
  {
    dexieTable: 'gyerek',
    supabaseTable: 'gyerek',
    primaryKey: 'id',
    scopeFilter: 'none',
    softDelete: false,
    module: 'tagnyilvantartas',
    label: 'Gyermekek',
    priority: 21,
  },
  {
    dexieTable: 'felmentes',
    supabaseTable: 'felmentes',
    primaryKey: 'id',
    scopeFilter: 'none',
    softDelete: false,
    module: 'tagnyilvantartas',
    label: 'Felmentések',
    priority: 22,
  },
]

// ─────────────────────────────────────────────────────────────────
// Pénzügy
// ─────────────────────────────────────────────────────────────────

const PENZUGY_TABLES: TableRegistryEntry[] = [
  {
    dexieTable: 'befizetes',
    supabaseTable: 'befizetes',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    softDelete: false,
    module: 'penzugy',
    label: 'Befizetések',
    priority: 30,
  },
  {
    dexieTable: 'kiadas',
    supabaseTable: 'kiadas',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    softDelete: false,
    module: 'penzugy',
    label: 'Kiadások',
    priority: 31,
  },
  {
    dexieTable: 'bankszamlak',
    supabaseTable: 'bankszamlak',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    softDelete: false,
    module: 'penzugy',
    label: 'Bankszámlák',
    priority: 32,
  },
  {
    dexieTable: 'belsomozgas',
    supabaseTable: 'belsomozgas',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    softDelete: false,
    module: 'penzugy',
    label: 'Belső mozgás',
    priority: 33,
  },
  {
    dexieTable: 'berleti_szerzodes',
    supabaseTable: 'berleti_szerzodes',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    softDelete: true, // deleted flag
    module: 'penzugy',
    label: 'Bérleti szerződések',
    priority: 34,
  },
]

// ─────────────────────────────────────────────────────────────────
// Anyakönyv
// ─────────────────────────────────────────────────────────────────

const ANYAKONYV_TABLES: TableRegistryEntry[] = [
  {
    dexieTable: 'keresztseg',
    supabaseTable: 'keresztseg',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    softDelete: false,
    module: 'anyakonyv',
    label: 'Keresztelések',
    priority: 40,
  },
  {
    dexieTable: 'konfirmalas',
    supabaseTable: 'konfirmalas',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    softDelete: false,
    module: 'anyakonyv',
    label: 'Konfirmációk',
    priority: 41,
  },
  {
    dexieTable: 'hazassag',
    supabaseTable: 'hazassag',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    softDelete: false,
    module: 'anyakonyv',
    label: 'Házasságok',
    priority: 42,
  },
  {
    dexieTable: 'temetes',
    supabaseTable: 'temetes',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    softDelete: false,
    module: 'anyakonyv',
    label: 'Temetések',
    priority: 43,
  },
]

// ─────────────────────────────────────────────────────────────────
// Munkanapló
// ─────────────────────────────────────────────────────────────────

const MUNKANAPLO_TABLES: TableRegistryEntry[] = [
  {
    dexieTable: 'munkanaplo',
    supabaseTable: 'munkanaplo',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    softDelete: false,
    module: 'munkanaplo',
    label: 'Munkanapló',
    priority: 50,
  },
]

// ─────────────────────────────────────────────────────────────────
// Iktató
// ─────────────────────────────────────────────────────────────────

const IKTATO_TABLES: TableRegistryEntry[] = [
  {
    dexieTable: 'iktato',
    supabaseTable: 'iktato',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    softDelete: true, // deleted flag van
    module: 'iktato',
    label: 'Iratok',
    priority: 60,
  },
  {
    dexieTable: 'iktato_sablonok',
    supabaseTable: 'iktato_sablonok',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    softDelete: true,
    module: 'iktato',
    label: 'Sablonok',
    priority: 61,
  },
]

// ─────────────────────────────────────────────────────────────────
// Leltár
// ─────────────────────────────────────────────────────────────────

const LELTAR_TABLES: TableRegistryEntry[] = [
  {
    dexieTable: 'leltar_tetelek',
    supabaseTable: 'leltar_tetelek',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    softDelete: false,
    module: 'leltar',
    label: 'Leltár tételek',
    priority: 70,
  },
]

// ─────────────────────────────────────────────────────────────────
// Sírhely (Fázis 5a)
// ─────────────────────────────────────────────────────────────────

const SIRHELY_TABLES: TableRegistryEntry[] = [
  {
    dexieTable: 'sirhelytemeto',
    supabaseTable: 'sirhelytemeto',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    softDelete: true,
    module: 'sirhely',
    label: 'Temetők',
    priority: 80,
  },
  {
    // sirhely-nek NINCS congregation_id mezője — a temetoid FK-n keresztül
    // szűrhető az ahhoz tartozó sirhelytemeto.congregation_id alapján
    dexieTable: 'sirhely',
    supabaseTable: 'sirhely',
    primaryKey: 'id',
    scopeFilter: 'none',
    softDelete: true,
    module: 'sirhely',
    label: 'Sírhelyek',
    priority: 81,
  },
  {
    // sirhelyberles-nek NINCS congregation_id mezője — a sirhelyid FK-n keresztül
    dexieTable: 'sirhelyberles',
    supabaseTable: 'sirhelyberles',
    primaryKey: 'id',
    scopeFilter: 'none',
    softDelete: true,
    module: 'sirhely',
    label: 'Bérletek',
    priority: 82,
  },
  {
    // sirhelyelhunyt-nek NINCS congregation_id mezője — a sirhelyid FK-n keresztül
    dexieTable: 'sirhelyelhunyt',
    supabaseTable: 'sirhelyelhunyt',
    primaryKey: 'id',
    scopeFilter: 'none',
    softDelete: true,
    module: 'sirhely',
    label: 'Elhunytak',
    priority: 83,
  },
]

// ─────────────────────────────────────────────────────────────────
// Jegyzőkönyvek (Fázis 5a)
// ─────────────────────────────────────────────────────────────────

const JEGYZOKONYVEK_TABLES: TableRegistryEntry[] = [
  {
    dexieTable: 'presbiteri_jegyzokonyvek',
    supabaseTable: 'presbiteri_jegyzokonyvek',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    softDelete: false,
    module: 'jegyzokonyvek',
    label: 'Jegyzőkönyvek',
    priority: 90,
  },
  {
    dexieTable: 'jegyzokonyv_resztvevok',
    supabaseTable: 'jegyzokonyv_resztvevok',
    primaryKey: 'id',
    scopeFilter: 'none', // jegyzokonyv_id FK-n keresztül scope
    softDelete: false,
    module: 'jegyzokonyvek',
    label: 'Résztvevők',
    priority: 91,
  },
  {
    dexieTable: 'jegyzokonyv_napirendi_pontok',
    supabaseTable: 'jegyzokonyv_napirendi_pontok',
    primaryKey: 'id',
    scopeFilter: 'none',
    softDelete: false,
    module: 'jegyzokonyvek',
    label: 'Napirendi pontok',
    priority: 92,
  },
  {
    dexieTable: 'jegyzokonyv_hatarozatok',
    supabaseTable: 'jegyzokonyv_hatarozatok',
    primaryKey: 'id',
    scopeFilter: 'none',
    softDelete: false,
    module: 'jegyzokonyvek',
    label: 'Határozatok',
    priority: 93,
  },
]

// ─────────────────────────────────────────────────────────────────
// Egyesített registry
// ─────────────────────────────────────────────────────────────────

export const TABLE_REGISTRY: TableRegistryEntry[] = [
  ...TAGNYILVANTARTAS_TABLES,
  ...PENZUGY_TABLES,
  ...ANYAKONYV_TABLES,
  ...MUNKANAPLO_TABLES,
  ...IKTATO_TABLES,
  ...LELTAR_TABLES,
  ...SIRHELY_TABLES,
  ...JEGYZOKONYVEK_TABLES,
]

/** Modulonkénti lekérdezés — Excel generáláshoz hasznos. */
export function getTablesByModule(module: ModuleKey): TableRegistryEntry[] {
  return TABLE_REGISTRY.filter(t => t.module === module).sort(
    (a, b) => a.priority - b.priority,
  )
}

/** Minden tábla pull-prioritás szerinti sorrendben. */
export function getAllTablesSorted(): TableRegistryEntry[] {
  return [...TABLE_REGISTRY].sort((a, b) => a.priority - b.priority)
}

/** Egyetlen bejegyzés keresése Dexie tábla név alapján. */
export function getTableEntry(dexieTable: string): TableRegistryEntry | null {
  return TABLE_REGISTRY.find(t => t.dexieTable === dexieTable) || null
}

// ─────────────────────────────────────────────────────────────────
// Modul metaadatok (UI-hoz)
// ─────────────────────────────────────────────────────────────────

export const MODULE_META: Record<ModuleKey, { label: string; excelFileName: string; color: string }> = {
  tagnyilvantartas: { label: 'Tagnyilvántartás', excelFileName: 'tagnyilvantartas.xlsx', color: 'emerald' },
  penzugy: { label: 'Pénzügy', excelFileName: 'penzugy.xlsx', color: 'amber' },
  anyakonyv: { label: 'Anyakönyv', excelFileName: 'anyakonyv.xlsx', color: 'blue' },
  munkanaplo: { label: 'Munkanapló', excelFileName: 'munkanaplo.xlsx', color: 'violet' },
  leltar: { label: 'Leltár', excelFileName: 'leltar.xlsx', color: 'slate' },
  iktato: { label: 'Iktató', excelFileName: 'iktato.xlsx', color: 'teal' },
  sirhely: { label: 'Sírhely', excelFileName: 'sirhelyek.xlsx', color: 'stone' },
  jegyzokonyvek: { label: 'Jegyzőkönyvek', excelFileName: 'jegyzokonyvek.xlsx', color: 'indigo' },
  'misszios-muhely': { label: 'Missziós Műhely', excelFileName: 'misszios-muhely.xlsx', color: 'fuchsia' },
}
