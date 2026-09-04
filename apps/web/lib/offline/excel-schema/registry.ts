/**
 * Excel Schema Registry — per-modul sémadefiníciók.
 *
 * Minden modul 1 Excel fájlra (pl. `tagnyilvantartas.xlsx`), és a
 * fájlon belül minden tábla 1 munkalapra kerül.
 *
 * Struktúra (per-fájl):
 *  - Sheet 1 (rejtett): `_meta` — schema-verzió, modul, gyülekezet, export dátum
 *  - Sheet 2+: Munkalapok a táblákhoz
 *     - 1. sor: display header (magyar, ember-olvasható)
 *     - 2+. sor: tényleges adat
 *     - Freeze first row (görgetéskor a fejléc marad)
 *     - AutoFilter minden oszlopon
 *     - Sheet protected (csak olvasható — sorrend/szűrő engedélyezett)
 *
 * KURÁLT SÉMA: csak a RELEVÁNS, ember-olvasható mezők jelennek meg.
 * A technikai FK ID-k (id_apja, id_anyja, congregation_id stb.) rejtve.
 *
 * FÁZIS 3 SCOPE: 6 modul (tag/pénzügy/anyakönyv/munkanapló/iktató/leltár).
 */

import type { ModuleKey } from '../table-registry'

// ─────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────

export type ExcelFieldType = 'string' | 'number' | 'date' | 'boolean' | 'currency'

export interface ExcelFieldDef {
  /** Ember-olvasható display header magyarul */
  displayName: string
  /** Technikai snake_case oszlopnév (DB mező neve) */
  technical: string
  /** Adattípus — a cella formázáshoz */
  type: ExcelFieldType
  /** Oszlop szélesség (karakterekben, default 14) */
  width?: number
}

export interface ExcelSheetDef {
  /** Munkalap neve (Excel-ben látszik) */
  sheetName: string
  /** Dexie tábla név, amiből az adat jön */
  dexieTable: string
  /** Mezők sorrendben */
  fields: ExcelFieldDef[]
  /** Szín-szintű (téma) a munkalap fülére — hex kód */
  tabColor?: string
}

export interface ExcelModuleSchema {
  /** Modul kulcs (lásd table-registry ModuleKey) */
  module: ModuleKey
  /** Excel fájlnév */
  fileName: string
  /** Schema verzió — ha változik, a fájl Excel-migrációt igényel */
  schemaVersion: number
  /** Munkalapok sorrendben */
  sheets: ExcelSheetDef[]
  /** Fő téma-szín (hex, header háttér alapja) */
  themeColor: string
}

// ─────────────────────────────────────────────────────────────────
// Tagnyilvántartás modul — EMERALD téma
// ─────────────────────────────────────────────────────────────────

const TAGNYILVANTARTAS_SCHEMA: ExcelModuleSchema = {
  module: 'tagnyilvantartas',
  fileName: 'tagnyilvantartas.xlsx',
  schemaVersion: 1,
  themeColor: '059669', // emerald-600
  sheets: [
    {
      sheetName: 'Személyek',
      dexieTable: 'szemely',
      tabColor: '10b981', // emerald-500
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        // 2026-09-05: a fejléc eddig „CNP" volt, de az oszlop a rendszer által
        // GENERÁLT egyházi azonosítót tartalmazza (EC-…, 999…). A lelkész abban
        // a hitben adta tovább a fájlt, hogy abban személyi szám van. A
        // HIVATALOS személyi szám külön, szűkebb hozzáférésű táblában él, és
        // SZÁNDÉKOSAN nem kerül az Excel-tükörbe (a `szig`/`taj` precedense).
        { displayName: 'Egyházi azonosító', technical: 'cnp', type: 'string', width: 20 },
        { displayName: 'Családnév', technical: 'csaladnev', type: 'string', width: 18 },
        { displayName: 'Keresztnév', technical: 'k_nev', type: 'string', width: 18 },
        { displayName: 'Születéskori név', technical: 'szcs_nev', type: 'string', width: 18 },
        { displayName: 'Férjezett név', technical: 'ferjk_nev', type: 'string', width: 18 },
        { displayName: 'Születési dátum', technical: 'sz_datum', type: 'date', width: 13 },
        { displayName: 'Nem', technical: 'ferfi', type: 'boolean', width: 8 },
        { displayName: 'Meghalt?', technical: 'meghalt', type: 'boolean', width: 10 },
        { displayName: 'Apja neve', technical: 'apjaneve', type: 'string', width: 22 },
        { displayName: 'Anyja neve', technical: 'anyjaneve', type: 'string', width: 22 },
        { displayName: 'Családfő?', technical: 'csaladfo', type: 'boolean', width: 10 },
        { displayName: 'Állapot', technical: 'allapot', type: 'string', width: 14 },
        { displayName: 'Vallás', technical: 'vallas', type: 'string', width: 14 },
        { displayName: 'Nemzetiség', technical: 'nemzetiseg', type: 'string', width: 14 },
        { displayName: 'Foglalkozás', technical: 'foglalkozas', type: 'string', width: 20 },
        { displayName: 'Házszám', technical: 'c_szam', type: 'string', width: 10 },
        { displayName: 'Tömbház', technical: 'c_tombhaz', type: 'string', width: 10 },
        { displayName: 'Lépcsőház', technical: 'c_lepcsohaz', type: 'string', width: 10 },
        { displayName: 'Emelet', technical: 'c_emelet', type: 'string', width: 8 },
        { displayName: 'Ajtó', technical: 'c_ajto', type: 'string', width: 8 },
        { displayName: 'Telefon', technical: 'telefon', type: 'string', width: 16 },
        { displayName: 'Email', technical: 'email', type: 'string', width: 24 },
        { displayName: 'Típus', technical: 'type', type: 'string', width: 10 },
        { displayName: 'Tagsági állapot', technical: 'member_status', type: 'string', width: 14 },
        { displayName: 'Megjegyzés', technical: 'megjegyzes', type: 'string', width: 30 },
      ],
    },
    {
      sheetName: 'Családok',
      dexieTable: 'csalad',
      tabColor: '10b981',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        { displayName: 'Férj ID', technical: 'id_ferfi', type: 'number', width: 10 },
        { displayName: 'Feleség ID', technical: 'id_no', type: 'number', width: 10 },
        { displayName: 'Házszám', technical: 'c_szam', type: 'string', width: 10 },
        { displayName: 'Tömbház', technical: 'c_tombhaz', type: 'string', width: 10 },
        { displayName: 'Lépcsőház', technical: 'c_lepcsohaz', type: 'string', width: 10 },
        { displayName: 'Emelet', technical: 'c_emelet', type: 'string', width: 8 },
        { displayName: 'Ajtó', technical: 'c_ajto', type: 'string', width: 8 },
        { displayName: 'Aktív?', technical: 'isaktiv', type: 'boolean', width: 10 },
      ],
    },
    {
      sheetName: 'Presbiterek',
      dexieTable: 'presbiter',
      tabColor: '10b981',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        { displayName: 'Személy ID', technical: 'id_szemely', type: 'number', width: 10 },
        { displayName: 'Tisztség', technical: 'tisztseg', type: 'string', width: 22 },
        { displayName: 'Aktív?', technical: 'aktiv', type: 'boolean', width: 10 },
      ],
    },
    {
      sheetName: 'Gyermekek',
      dexieTable: 'gyerek',
      tabColor: '10b981',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        { displayName: 'Személy ID', technical: 'id_szemely', type: 'number', width: 10 },
        { displayName: 'Név', technical: 'nev', type: 'string', width: 24 },
        { displayName: 'Születési dátum', technical: 'szul_datum', type: 'date', width: 13 },
      ],
    },
    {
      sheetName: 'Felmentések',
      dexieTable: 'felmentes',
      tabColor: '10b981',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        { displayName: 'Személy ID', technical: 'id_szemely', type: 'number', width: 10 },
        { displayName: 'Család ID', technical: 'id_csalad', type: 'number', width: 10 },
        { displayName: 'Kezdete', technical: 'kezdete', type: 'date', width: 13 },
        { displayName: 'Vége', technical: 'vege', type: 'date', width: 13 },
      ],
    },
  ],
}

// ─────────────────────────────────────────────────────────────────
// Pénzügy modul — AMBER téma
// ─────────────────────────────────────────────────────────────────

const PENZUGY_SCHEMA: ExcelModuleSchema = {
  module: 'penzugy',
  fileName: 'penzugy.xlsx',
  schemaVersion: 1,
  themeColor: 'd97706', // amber-600
  sheets: [
    {
      sheetName: 'Befizetések',
      dexieTable: 'befizetes',
      tabColor: 'f59e0b',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        { displayName: 'Dátum', technical: 'datum', type: 'date', width: 13 },
        { displayName: 'Összeg (RON)', technical: 'osszeg', type: 'currency', width: 14 },
        { displayName: 'Fizető személy ID', technical: 'id_szemely', type: 'number', width: 14 },
        { displayName: 'Család ID', technical: 'id_csalad', type: 'number', width: 12 },
        { displayName: 'Forrás (név)', technical: 'forrasa', type: 'string', width: 22 },
        { displayName: 'Befizetési cél ID', technical: 'id_befizetescel', type: 'number', width: 14 },
        { displayName: 'Fizetett év', technical: 'fizetettev', type: 'number', width: 10 },
        { displayName: 'Nyugta', technical: 'nyugta', type: 'string', width: 14 },
        { displayName: 'Iratszám', technical: 'iratszam', type: 'string', width: 14 },
        { displayName: 'Irattípus', technical: 'irattipus', type: 'string', width: 14 },
        { displayName: 'Bankszámla ID', technical: 'bankszamla_id', type: 'number', width: 14 },
        { displayName: 'Pótlás?', technical: 'is_potlas', type: 'boolean', width: 10 },
        { displayName: 'Megjegyzés', technical: 'megjegyzes', type: 'string', width: 28 },
      ],
    },
    {
      sheetName: 'Kiadások',
      dexieTable: 'kiadas',
      tabColor: 'f59e0b',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        { displayName: 'Dátum', technical: 'datum', type: 'date', width: 13 },
        { displayName: 'Összeg (RON)', technical: 'osszeg', type: 'currency', width: 14 },
        { displayName: 'Kiadási cél ID', technical: 'id_kiadascel', type: 'number', width: 14 },
        { displayName: 'Megjegyzés', technical: 'megjegyzes', type: 'string', width: 30 },
        { displayName: 'Nyugta', technical: 'nyugta', type: 'string', width: 14 },
        { displayName: 'Iratszám', technical: 'iratszam', type: 'string', width: 14 },
        { displayName: 'Irattípus', technical: 'irattipus', type: 'string', width: 14 },
        { displayName: 'Átvevő', technical: 'atvevo', type: 'string', width: 22 },
        { displayName: 'Átvevő ID', technical: 'atvevoid', type: 'number', width: 11 },
        { displayName: 'Bankszámla ID', technical: 'bankszamla_id', type: 'number', width: 14 },
        { displayName: 'Pótlás?', technical: 'is_potlas', type: 'boolean', width: 10 },
        { displayName: 'Vonatk. időszak', technical: 'vonatkozo_idoszak', type: 'string', width: 16 },
      ],
    },
    {
      sheetName: 'Bankszámlák',
      dexieTable: 'bankszamlak',
      tabColor: 'f59e0b',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        { displayName: 'Bank neve', technical: 'bank_neve', type: 'string', width: 22 },
        { displayName: 'IBAN', technical: 'iban', type: 'string', width: 28 },
        { displayName: 'Valuta', technical: 'valuta', type: 'string', width: 8 },
        // ⛔ 2026-08-28 (Endre döntése): a „Nyitó egyenleg" oszlop KIVEZETVE.
        //    Szerkeszthető cella volt egy olyan értékhez, aminek NINCS ÉVE, és az
        //    „Alkalmaz" a mutation_queue-n keresztül minden ellenőrzés megkerulésével
        //    írta vissza. A hivatalos nyitót a Gyülekezet beállításai → Nyitó
        //    egyenlegek felület adja (évenkénti, zárt-év védett).
        //    RÉGI MUNKAFÜZETEK: az import-diff a SÉMÁBÓL iterál (excel-import-diff.ts),
        //    ezért egy korábban exportált fájl fölös oszlopa egyszerűen kimarad — mérve.
      ],
    },
    {
      sheetName: 'Belső mozgás',
      dexieTable: 'belsomozgas',
      tabColor: 'f59e0b',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        { displayName: 'Dátum', technical: 'datum', type: 'date', width: 13 },
        { displayName: 'Típus', technical: 'tipus', type: 'string', width: 14 },
        { displayName: 'Összeg (RON)', technical: 'osszeg', type: 'currency', width: 14 },
        { displayName: 'Forrás', technical: 'forras', type: 'string', width: 16 },
        { displayName: 'Cél', technical: 'cel', type: 'string', width: 16 },
      ],
    },
    {
      sheetName: 'Bérleti szerződések',
      dexieTable: 'berleti_szerzodes',
      tabColor: 'f59e0b',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'string', width: 14 },
        { displayName: 'Bérlő neve', technical: 'berlo_nev', type: 'string', width: 22 },
        { displayName: 'Cég neve', technical: 'ceg_nev', type: 'string', width: 22 },
        { displayName: 'Leírás', technical: 'leiras', type: 'string', width: 30 },
        { displayName: 'Típus', technical: 'tipus', type: 'string', width: 14 },
        { displayName: 'Összeg (RON)', technical: 'osszeg', type: 'currency', width: 14 },
        { displayName: 'Ciklus', technical: 'fizetesi_ciklus', type: 'string', width: 10 },
        { displayName: 'Kezdet', technical: 'kezdet', type: 'date', width: 13 },
        { displayName: 'Vége', technical: 'vege', type: 'date', width: 13 },
        { displayName: 'Aktív?', technical: 'aktiv', type: 'boolean', width: 10 },
      ],
    },
  ],
}

// ─────────────────────────────────────────────────────────────────
// Anyakönyv modul — BLUE téma
// ─────────────────────────────────────────────────────────────────

const ANYAKONYV_SCHEMA: ExcelModuleSchema = {
  module: 'anyakonyv',
  fileName: 'anyakonyv.xlsx',
  schemaVersion: 1,
  themeColor: '2563eb', // blue-600
  sheets: [
    {
      sheetName: 'Keresztelések',
      dexieTable: 'keresztseg',
      tabColor: '3b82f6',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        { displayName: 'Személy ID', technical: 'id_szemely', type: 'number', width: 10 },
        { displayName: 'Dátum', technical: 'datum', type: 'date', width: 13 },
        { displayName: 'Lelkész', technical: 'lelkeszneve', type: 'string', width: 22 },
        { displayName: 'Keresztszülők', technical: 'keresztszulok', type: 'string', width: 28 },
        { displayName: 'Okirat', technical: 'okirat', type: 'string', width: 16 },
        { displayName: 'Hely ID', technical: 'helyid', type: 'number', width: 10 },
        { displayName: 'Megjegyzés', technical: 'megjegyzes', type: 'string', width: 28 },
      ],
    },
    {
      sheetName: 'Konfirmálások',
      dexieTable: 'konfirmalas',
      tabColor: '3b82f6',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        { displayName: 'Személy ID', technical: 'id_szemely', type: 'number', width: 10 },
        { displayName: 'Dátum', technical: 'datum', type: 'date', width: 13 },
        { displayName: 'Lelkész', technical: 'lelkeszneve', type: 'string', width: 22 },
        { displayName: 'Keresztelés ideje', technical: 'keresztelesideje', type: 'date', width: 14 },
        { displayName: 'Hely ID', technical: 'helyid', type: 'number', width: 10 },
        { displayName: 'Megjegyzés', technical: 'megjegyzes', type: 'string', width: 28 },
      ],
    },
    {
      sheetName: 'Házasságok',
      dexieTable: 'hazassag',
      tabColor: '3b82f6',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        { displayName: 'Férj ID', technical: 'id_ferfi', type: 'number', width: 10 },
        { displayName: 'Feleség ID', technical: 'id_no', type: 'number', width: 10 },
        { displayName: 'Dátum', technical: 'datum', type: 'date', width: 13 },
        { displayName: 'Lelkész', technical: 'lelkeszneve', type: 'string', width: 22 },
        { displayName: 'H. levél', technical: 'hlevel', type: 'string', width: 14 },
        { displayName: 'Tanúk', technical: 'tanuk', type: 'string', width: 28 },
        { displayName: 'Hely ID', technical: 'helyid', type: 'number', width: 10 },
        { displayName: 'Megjegyzés', technical: 'megjegyzes', type: 'string', width: 28 },
      ],
    },
    {
      sheetName: 'Temetések',
      dexieTable: 'temetes',
      tabColor: '3b82f6',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        { displayName: 'Személy ID', technical: 'id_szemely', type: 'number', width: 10 },
        { displayName: 'Halál dátuma', technical: 'hdatum', type: 'date', width: 13 },
        { displayName: 'Halál oka', technical: 'hoka', type: 'string', width: 22 },
        { displayName: 'Temetés dátuma', technical: 'tdatum', type: 'date', width: 13 },
        { displayName: 'Lelkész', technical: 'lelkeszneve', type: 'string', width: 22 },
        { displayName: 'Okirat', technical: 'okirat', type: 'string', width: 16 },
        { displayName: 'Halál hely ID', technical: 'hhelyid', type: 'number', width: 12 },
        { displayName: 'Temetés hely ID', technical: 'thelyid', type: 'number', width: 14 },
        { displayName: 'Megjegyzés', technical: 'megjegyzes', type: 'string', width: 28 },
      ],
    },
  ],
}

// ─────────────────────────────────────────────────────────────────
// Munkanapló modul — VIOLET téma
// ─────────────────────────────────────────────────────────────────

const MUNKANAPLO_SCHEMA: ExcelModuleSchema = {
  module: 'munkanaplo',
  fileName: 'munkanaplo.xlsx',
  schemaVersion: 1,
  themeColor: '7c3aed', // violet-600
  sheets: [
    {
      sheetName: 'Bejegyzések',
      dexieTable: 'munkanaplo',
      tabColor: '8b5cf6',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        { displayName: 'Időpont', technical: 'idopont', type: 'date', width: 14 },
        { displayName: 'Kategória', technical: 'kategoria', type: 'string', width: 14 },
        { displayName: 'Jellege', technical: 'jellege', type: 'string', width: 18 },
        { displayName: 'Cím / téma', technical: 'cim', type: 'string', width: 28 },
        { displayName: 'Persely (RON)', technical: 'persely', type: 'currency', width: 13 },
        { displayName: 'Jelenlét (fő)', technical: 'jelenlet_osszesen', type: 'number', width: 12 },
      ],
    },
  ],
}

// ─────────────────────────────────────────────────────────────────
// Iktató modul — TEAL téma
// ─────────────────────────────────────────────────────────────────

const IKTATO_SCHEMA: ExcelModuleSchema = {
  module: 'iktato',
  fileName: 'iktato.xlsx',
  schemaVersion: 1,
  themeColor: '0d9488', // teal-600
  sheets: [
    {
      sheetName: 'Iratok',
      dexieTable: 'iktato',
      tabColor: '14b8a6',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'string', width: 14 }, // uuid
        { displayName: 'Év', technical: 'year', type: 'number', width: 7 },
        { displayName: 'Sorszám', technical: 'sequence_number', type: 'number', width: 10 },
        { displayName: 'Irány', technical: 'direction', type: 'string', width: 10 },
        { displayName: 'Kelt', technical: 'kelt', type: 'date', width: 13 },
        { displayName: 'Tárgy', technical: 'subject', type: 'string', width: 32 },
        { displayName: 'Feladó/címzett', technical: 'sender_or_recipient', type: 'string', width: 22 },
        { displayName: 'Mappa', technical: 'file_folder', type: 'string', width: 12 },
        { displayName: 'Tárgykivonat', technical: 'targykivonat', type: 'string', width: 32 },
        { displayName: 'Elintézés ideje', technical: 'elintezes_ideje', type: 'date', width: 14 },
        { displayName: 'Elintézés módja', technical: 'elintezes_modja', type: 'string', width: 18 },
        { displayName: 'Irattári jel', technical: 'irattarijel', type: 'string', width: 12 },
        { displayName: 'Oldalszám', technical: 'oldalszam', type: 'number', width: 10 },
        { displayName: 'Megjegyzés', technical: 'megjegyzes', type: 'string', width: 28 },
      ],
    },
    {
      sheetName: 'Sablonok',
      dexieTable: 'iktato_sablonok',
      tabColor: '14b8a6',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'string', width: 14 },
        { displayName: 'Név', technical: 'nev', type: 'string', width: 24 },
        { displayName: 'Típus', technical: 'tipus', type: 'string', width: 14 },
        { displayName: 'Leírás', technical: 'leiras', type: 'string', width: 32 },
        { displayName: 'Aktív?', technical: 'aktiv', type: 'boolean', width: 10 },
        { displayName: 'Sorrend', technical: 'sorrend', type: 'number', width: 10 },
      ],
    },
  ],
}

// ─────────────────────────────────────────────────────────────────
// Leltár modul — SLATE téma
// ─────────────────────────────────────────────────────────────────

const LELTAR_SCHEMA: ExcelModuleSchema = {
  module: 'leltar',
  fileName: 'leltar.xlsx',
  schemaVersion: 1,
  themeColor: '475569', // slate-600
  sheets: [
    {
      sheetName: 'Tételek',
      dexieTable: 'leltar_tetelek',
      tabColor: '64748b',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'string', width: 14 }, // uuid
        { displayName: 'Leltári szám', technical: 'leltari_szam', type: 'string', width: 16 },
        { displayName: 'Megnevezés', technical: 'megnevezes', type: 'string', width: 30 },
        { displayName: 'Kategória', technical: 'kategoria', type: 'string', width: 18 },
        { displayName: 'Helyszín', technical: 'helyszin', type: 'string', width: 22 },
        { displayName: 'Felelős neve', technical: 'felelos_neve', type: 'string', width: 22 },
        { displayName: 'Beszerzés dátuma', technical: 'beszerzes_datuma', type: 'date', width: 14 },
        { displayName: 'Beszerz. bizonylat', technical: 'beszerzes_bizonylat', type: 'string', width: 16 },
        { displayName: 'Beszerzési érték (RON)', technical: 'beszerzesi_ertek', type: 'currency', width: 18 },
        { displayName: 'Mennyiség', technical: 'mennyiseg', type: 'number', width: 11 },
        { displayName: 'Mértékegység', technical: 'mertekegyseg', type: 'string', width: 13 },
        { displayName: 'Megjegyzés', technical: 'megjegyzes', type: 'string', width: 28 },
      ],
    },
  ],
}

// ─────────────────────────────────────────────────────────────────
// Sírhely modul — STONE téma
// FONTOS: a valódi DB séma szerinti oszlopnevek (Database_schema.sql)
// ─────────────────────────────────────────────────────────────────

const SIRHELY_SCHEMA: ExcelModuleSchema = {
  module: 'sirhely',
  fileName: 'sirhelyek.xlsx',
  schemaVersion: 2, // bumpolva, mert v1 hibás oszlopneveket tartalmazott
  themeColor: '57534e', // stone-600
  sheets: [
    {
      sheetName: 'Temetők',
      dexieTable: 'sirhelytemeto',
      tabColor: '78716c', // stone-500
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        { displayName: 'Név', technical: 'nev', type: 'string', width: 24 },
        { displayName: 'Cím', technical: 'cim', type: 'string', width: 32 },
        { displayName: 'Aktív?', technical: 'aktiv', type: 'boolean', width: 9 },
        { displayName: 'Megjegyzés', technical: 'megjegyzes', type: 'string', width: 32 },
      ],
    },
    {
      sheetName: 'Sírhelyek',
      dexieTable: 'sirhely',
      tabColor: '78716c',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        { displayName: 'Temető ID', technical: 'temetoid', type: 'number', width: 10 },
        { displayName: 'Parcella', technical: 'parcella', type: 'string', width: 12 },
        { displayName: 'Sor', technical: 'sor', type: 'number', width: 8 },
        { displayName: 'Szám', technical: 'szam', type: 'string', width: 10 },
        { displayName: 'Állapot', technical: 'allapot', type: 'string', width: 12 },
        { displayName: 'Elhelyezkedés', technical: 'elhelyezkedes', type: 'string', width: 18 },
        { displayName: 'Méret', technical: 'meret', type: 'string', width: 10 },
        { displayName: 'Típus', technical: 'tipus', type: 'string', width: 12 },
        { displayName: 'GPS lat', technical: 'gps_lat', type: 'number', width: 12 },
        { displayName: 'GPS lng', technical: 'gps_lng', type: 'number', width: 12 },
        { displayName: 'Megjegyzés', technical: 'megjegyzes', type: 'string', width: 32 },
      ],
    },
    {
      sheetName: 'Bérletek',
      dexieTable: 'sirhelyberles',
      tabColor: '78716c',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        { displayName: 'Sírhely ID', technical: 'sirhelyid', type: 'number', width: 10 },
        { displayName: 'Befizetés ID', technical: 'befizetesid', type: 'number', width: 12 },
        { displayName: 'Bérlő', technical: 'berlo', type: 'string', width: 24 },
        { displayName: 'Bérlő ID', technical: 'berloid', type: 'number', width: 10 },
        { displayName: 'Bérlő címe', technical: 'berlocim', type: 'string', width: 28 },
        { displayName: 'Bérlő elérhetősége', technical: 'berloelerhetoseg', type: 'string', width: 22 },
        { displayName: 'Megváltás', technical: 'megvaltas', type: 'date', width: 13 },
        { displayName: 'Lejárata', technical: 'lejarata', type: 'date', width: 13 },
        { displayName: 'Típus', technical: 'tipus', type: 'string', width: 12 },
        { displayName: 'Összeg (RON)', technical: 'osszeg', type: 'currency', width: 14 },
        { displayName: 'Megjegyzés', technical: 'megjegyzes', type: 'string', width: 32 },
      ],
    },
    {
      sheetName: 'Elhunytak',
      dexieTable: 'sirhelyelhunyt',
      tabColor: '78716c',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'number', width: 7 },
        { displayName: 'Sírhely ID', technical: 'sirhelyid', type: 'number', width: 10 },
        { displayName: 'Temetés ID', technical: 'temetesid', type: 'number', width: 11 },
        { displayName: 'Név', technical: 'nev', type: 'string', width: 26 },
        { displayName: 'Sz. név', technical: 'sznev', type: 'string', width: 22 },
        { displayName: 'Férfi?', technical: 'ferfi', type: 'boolean', width: 9 },
        { displayName: 'Sz. dátum', technical: 'sz_datum', type: 'date', width: 13 },
        { displayName: 'Sz. hely', technical: 'sz_hely', type: 'string', width: 18 },
        { displayName: 'Anyja neve', technical: 'anyjaneve', type: 'string', width: 24 },
        { displayName: 'H. dátum', technical: 'hdatum', type: 'date', width: 13 },
        { displayName: 'H. hely', technical: 'hhely', type: 'string', width: 18 },
        { displayName: 'T. dátum', technical: 'tdatum', type: 'date', width: 13 },
        { displayName: 'T. típus', technical: 'ttipus', type: 'string', width: 14 },
        { displayName: 'T. módja', technical: 'tmodja', type: 'string', width: 14 },
        { displayName: 'Elhelyezkedés', technical: 'elhelyezkedes', type: 'string', width: 18 },
        { displayName: 'Temettető', technical: 'temetteto', type: 'string', width: 22 },
        { displayName: 'Szolgáltató', technical: 'szolgaltato', type: 'string', width: 22 },
        { displayName: 'Megjegyzés', technical: 'megjegyzes', type: 'string', width: 32 },
      ],
    },
  ],
}

// ─────────────────────────────────────────────────────────────────
// Jegyzőkönyvek modul — INDIGO téma
// ─────────────────────────────────────────────────────────────────

const JEGYZOKONYVEK_SCHEMA: ExcelModuleSchema = {
  module: 'jegyzokonyvek',
  fileName: 'jegyzokonyvek.xlsx',
  schemaVersion: 1,
  themeColor: '4f46e5', // indigo-600
  sheets: [
    {
      sheetName: 'Jegyzőkönyvek',
      dexieTable: 'presbiteri_jegyzokonyvek',
      tabColor: '6366f1', // indigo-500
      fields: [
        { displayName: 'ID', technical: 'id', type: 'string', width: 14 },
        { displayName: 'Év', technical: 'ev', type: 'number', width: 7 },
        { displayName: 'Ülés sorszám', technical: 'ules_sorszam', type: 'number', width: 12 },
        { displayName: 'Típus', technical: 'tipus', type: 'string', width: 14 },
        { displayName: 'Dátum', technical: 'datum', type: 'date', width: 13 },
        { displayName: 'Hely', technical: 'hely', type: 'string', width: 20 },
        { displayName: 'Kezdés', technical: 'kezdes', type: 'string', width: 10 },
        { displayName: 'Zárás', technical: 'zaras', type: 'string', width: 10 },
        { displayName: 'Elnök neve', technical: 'elnok_neve', type: 'string', width: 24 },
        { displayName: 'Jegyző neve', technical: 'jegyzo_neve', type: 'string', width: 24 },
        { displayName: 'Hitelesítő 1', technical: 'hitelesito1', type: 'string', width: 22 },
        { displayName: 'Hitelesítő 2', technical: 'hitelesito2', type: 'string', width: 22 },
        { displayName: 'Igevers', technical: 'igevers', type: 'string', width: 20 },
        { displayName: 'Felolvasás', technical: 'felolvasas', type: 'string', width: 20 },
        { displayName: 'Megjegyzés', technical: 'megjegyzes', type: 'string', width: 32 },
        { displayName: 'Állapot', technical: 'allapot', type: 'string', width: 12 },
      ],
    },
    {
      sheetName: 'Résztvevők',
      dexieTable: 'jegyzokonyv_resztvevok',
      tabColor: '6366f1',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'string', width: 14 },
        { displayName: 'Jegyzőkönyv ID', technical: 'jegyzokonyv_id', type: 'string', width: 14 },
        { displayName: 'Név', technical: 'nev', type: 'string', width: 26 },
        { displayName: 'Státusz', technical: 'statusz', type: 'string', width: 14 },
        { displayName: 'Szerep', technical: 'szerep', type: 'string', width: 18 },
      ],
    },
    {
      sheetName: 'Napirendi pontok',
      dexieTable: 'jegyzokonyv_napirendi_pontok',
      tabColor: '6366f1',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'string', width: 14 },
        { displayName: 'Jegyzőkönyv ID', technical: 'jegyzokonyv_id', type: 'string', width: 14 },
        { displayName: 'Sorszám', technical: 'sorszam', type: 'number', width: 10 },
        { displayName: 'Cím', technical: 'cim', type: 'string', width: 32 },
        { displayName: 'Előadó', technical: 'eloado', type: 'string', width: 20 },
        { displayName: 'Tárgyalás', technical: 'targyalas', type: 'string', width: 40 },
        { displayName: 'Igen szavazat', technical: 'szavazas_igen', type: 'number', width: 12 },
        { displayName: 'Nem szavazat', technical: 'szavazas_nem', type: 'number', width: 12 },
        { displayName: 'Tartózkodó', technical: 'szavazas_tartozkodo', type: 'number', width: 12 },
      ],
    },
    {
      sheetName: 'Határozatok',
      dexieTable: 'jegyzokonyv_hatarozatok',
      tabColor: '6366f1',
      fields: [
        { displayName: 'ID', technical: 'id', type: 'string', width: 14 },
        { displayName: 'Jegyzőkönyv ID', technical: 'jegyzokonyv_id', type: 'string', width: 14 },
        { displayName: 'Napirendi pont ID', technical: 'napirendi_pont_id', type: 'string', width: 14 },
        { displayName: 'Év', technical: 'ev', type: 'number', width: 7 },
        { displayName: 'Sorszám', technical: 'sorszam', type: 'number', width: 10 },
        { displayName: 'Szöveg', technical: 'szoveg', type: 'string', width: 40 },
        { displayName: 'Felelős', technical: 'felelos', type: 'string', width: 20 },
        { displayName: 'Határidő', technical: 'hatarido', type: 'date', width: 13 },
        { displayName: 'Állapot', technical: 'allapot', type: 'string', width: 14 },
      ],
    },
  ],
}

// ─────────────────────────────────────────────────────────────────
// Egyesített registry
// ─────────────────────────────────────────────────────────────────

export const EXCEL_SCHEMAS: Partial<Record<ModuleKey, ExcelModuleSchema>> = {
  tagnyilvantartas: TAGNYILVANTARTAS_SCHEMA,
  penzugy: PENZUGY_SCHEMA,
  anyakonyv: ANYAKONYV_SCHEMA,
  munkanaplo: MUNKANAPLO_SCHEMA,
  iktato: IKTATO_SCHEMA,
  leltar: LELTAR_SCHEMA,
  sirhely: SIRHELY_SCHEMA,
  jegyzokonyvek: JEGYZOKONYVEK_SCHEMA,
  // Fázis 5c-ben: misszios-muhely (bookmark pattern)
}

export function getExcelSchema(module: ModuleKey): ExcelModuleSchema | null {
  return EXCEL_SCHEMAS[module] || null
}

export function getAllExcelSchemas(): ExcelModuleSchema[] {
  return Object.values(EXCEL_SCHEMAS).filter(Boolean) as ExcelModuleSchema[]
}
