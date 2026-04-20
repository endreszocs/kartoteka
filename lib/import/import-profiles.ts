/**
 * Univerzális import profilok minden modulhoz.
 *
 * Egy profil = egyetlen "sheet → tábla" leképezés:
 *   – mely Excel oszlopok (és aliasok) milyen DB mezőre kerülnek
 *   – milyen típuskonverzió szükséges (dátum, szám, bool)
 *   – melyek a kötelező mezők
 *   – automatikusan kitöltött mezők (congregation_id, userid, created, …)
 *
 * A profilokat a közös multi-sheet import UI és a batch-import server action
 * egyaránt használja: az UI megmutatja az elvárt oszlopokat + előnézetet,
 * a server action pedig a columnMap alapján transzformálja és validálja a sorokat.
 */

// ---------------------------------------------------------------------------
// Típusok
// ---------------------------------------------------------------------------

export type ColumnType = 'string' | 'number' | 'date' | 'boolean'

export interface ColumnMapping {
  /** Az Excel fejléc neve (elsődleges) */
  excelHeader: string
  /** Alternatív fejléc nevek — a rendszer fuzzy-matcheli */
  excelAliases?: string[]
  /** A cél DB oszlop neve */
  dbColumn: string
  /** A típus, amire konvertálni kell a cellát */
  type: ColumnType
  /** Kötelező-e ez az oszlop (ha hiányzik, a sor hibás) */
  required: boolean
  /** Rövid magyar leírás az UI tooltip-jéhez */
  hint?: string
}

export type AutoColumnSource =
  | 'congregation_id'
  | 'user_id'
  | 'now'
  | 'current_year'
  | 'true'
  | 'false'

export interface AutoColumn {
  dbColumn: string
  source: AutoColumnSource
}

export type ImportModule =
  | 'members'
  | 'finance'
  | 'registry'
  | 'worklog'
  | 'filing'
  | 'inventory'

export interface ImportProfile {
  /** Egyedi kulcs (pl. 'income', 'baptism', 'worklog_services') */
  key: string
  /** Melyik modulhoz tartozik */
  module: ImportModule
  /** Magyar megjelenítési név */
  label: string
  /** Rövid leírás az UI-hoz */
  description: string
  /** A cél DB tábla neve (public sémában) */
  targetTable: string
  /** Excel oszlop → DB oszlop leképezés */
  columnMap: ColumnMapping[]
  /** Automatikusan kitöltött oszlopok (nem jelenik meg az Excel-ben) */
  autoColumns: AutoColumn[]
  /** Előfeltétel hintek az UI-ban (magyar) */
  hints: string[]
  /** Melyik sheet nevek utalhatnak erre a profilra az Excel fájlban */
  sheetHints?: string[]
}

// ---------------------------------------------------------------------------
// Helper — összes profil "elvárt oszlop" neveinek listája (UI-hoz)
// ---------------------------------------------------------------------------

export function getRequiredHeaders(profile: ImportProfile): string[] {
  return profile.columnMap.filter((c) => c.required).map((c) => c.excelHeader)
}

export function getAllHeaders(profile: ImportProfile): string[] {
  return profile.columnMap.map((c) => c.excelHeader)
}

/**
 * Megpróbálja megtalálni a megfelelő ColumnMapping-et egy Excel fejléc alapján.
 * Case-insensitive, alias támogatás, ékezet-toleráns összehasonlítás.
 */
export function matchHeader(
  header: string,
  profile: ImportProfile,
): ColumnMapping | null {
  const norm = normalizeForMatch(header)
  for (const col of profile.columnMap) {
    if (normalizeForMatch(col.excelHeader) === norm) return col
    if (col.excelAliases?.some((a) => normalizeForMatch(a) === norm)) return col
  }
  return null
}

/** Normalizálja a stringet összehasonlításhoz: kisbetű, pont/szóköz eltávolítás */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.\s_-]+/g, '')
    .trim()
}

/**
 * Automatikusan próbál profilt társítani egy sheet nevéhez.
 * Ha a sheet neve tartalmazza a profil sheetHints-jeit, jó találat.
 */
export function suggestProfileForSheet(
  sheetName: string,
  profiles: ImportProfile[],
): ImportProfile | null {
  const norm = normalizeForMatch(sheetName)
  for (const profile of profiles) {
    if (!profile.sheetHints) continue
    for (const hint of profile.sheetHints) {
      if (norm.includes(normalizeForMatch(hint))) return profile
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// PROFILOK
// ---------------------------------------------------------------------------

// ===========================
// 1. TAGNYILVÁNTARTÁS (Members)
// ===========================

export const PROFILE_PERSONS: ImportProfile = {
  key: 'persons',
  module: 'members',
  label: 'Személyek',
  description: 'Tagok, alap személyes adatok, címek és gyülekezeti státuszok importja.',
  targetTable: 'szemely',
  columnMap: [
    { excelHeader: 'Családnév', excelAliases: ['csaladnev', 'Vezetéknév', 'Név'], dbColumn: 'csaladnev', type: 'string', required: true, hint: 'Vezetéknév / családnév' },
    { excelHeader: 'Keresztnév', excelAliases: ['keresztnev', 'k_nev', 'Utónév'], dbColumn: 'k_nev', type: 'string', required: true, hint: 'Utónév / keresztnév' },
    { excelHeader: 'CNP', excelAliases: ['cnp', 'Személyi szám', 'Személyi'], dbColumn: 'cnp', type: 'string', required: false, hint: 'Személyi szám (egyedi)' },
    { excelHeader: 'Születési dátum', excelAliases: ['szuletesi_datum', 'Sz.dátum', 'sz_datum'], dbColumn: 'sz_datum', type: 'date', required: false, hint: 'ÉÉÉÉ-HH-NN vagy ÉÉÉÉ.HH.NN' },
    { excelHeader: 'Születési név', excelAliases: ['szcs_nev', 'Leánykori név'], dbColumn: 'szcs_nev', type: 'string', required: false },
    { excelHeader: 'Nem', excelAliases: ['ferfi', 'Férfi'], dbColumn: 'ferfi', type: 'boolean', required: false, hint: 'F/Férfi/igen → true; N/Nő/nem → false' },
    { excelHeader: 'Telefon', excelAliases: ['telefon', 'Tel', 'Telefonszám'], dbColumn: 'telefon', type: 'string', required: false },
    { excelHeader: 'Email', excelAliases: ['email', 'E-mail'], dbColumn: 'email', type: 'string', required: false },
    { excelHeader: 'Vallás', excelAliases: ['vallas', 'Felekezet'], dbColumn: 'vallas', type: 'string', required: false },
    { excelHeader: 'Foglalkozás', excelAliases: ['foglalkozas', 'Foglalk.'], dbColumn: 'foglalkozas', type: 'string', required: false },
    { excelHeader: 'Családi állapot', excelAliases: ['allapot', 'Állapot'], dbColumn: 'allapot', type: 'string', required: false },
    { excelHeader: 'Apja neve', excelAliases: ['apjaneve'], dbColumn: 'apjaneve', type: 'string', required: false },
    { excelHeader: 'Anyja neve', excelAliases: ['anyjaneve'], dbColumn: 'anyjaneve', type: 'string', required: false },
    { excelHeader: 'Cím', excelAliases: ['c_szcim', 'Lakcím'], dbColumn: 'c_szcim', type: 'string', required: false },
    { excelHeader: 'Házszám', excelAliases: ['c_szam', 'Szám'], dbColumn: 'c_szam', type: 'string', required: false },
    { excelHeader: 'Megjegyzés', excelAliases: ['megjegyzes', 'Jegyzet'], dbColumn: 'megjegyzes', type: 'string', required: false },
  ],
  autoColumns: [
    { dbColumn: 'congregation_id', source: 'congregation_id' },
    { dbColumn: 'isvisible', source: 'true' },
    { dbColumn: 'created', source: 'now' },
  ],
  hints: [
    'Egy sor = egy személy.',
    'A CNP legyen egyedi — duplikált CNP-s sorok kihagyásra kerülnek.',
    'A dátumok ÉÉÉÉ-HH-NN vagy ÉÉÉÉ.HH.NN formátumban.',
    'Nem mező: "F"/"Férfi"/"igen" → férfi; "N"/"Nő"/"nem" → nő.',
  ],
  sheetHints: ['Személyek', 'Tagok', 'szemely', 'Members'],
}

export const PROFILE_FAMILIES: ImportProfile = {
  key: 'families',
  module: 'members',
  label: 'Családok',
  description: 'Családi egységek és háztartási adatok importja.',
  targetTable: 'csalad',
  columnMap: [
    { excelHeader: 'Családazonosító', excelAliases: ['csalad_azonosito', 'Család ID'], dbColumn: 'id', type: 'number', required: false, hint: 'Opcionális — ha üres, automatikus' },
    { excelHeader: 'Férfi CNP', excelAliases: ['ferfi_cnp', 'Családfő CNP'], dbColumn: '_ferfi_cnp', type: 'string', required: false, hint: 'A férfi/családfő személyi száma → id_ferfi megkereséséhez' },
    { excelHeader: 'Nő CNP', excelAliases: ['no_cnp', 'Feleség CNP'], dbColumn: '_no_cnp', type: 'string', required: false, hint: 'A nő személyi száma → id_no megkereséséhez' },
    { excelHeader: 'Házszám', excelAliases: ['hazszam', 'c_szam', 'Szám'], dbColumn: 'c_szam', type: 'string', required: false },
    { excelHeader: 'Megjegyzés', excelAliases: ['megjegyzes'], dbColumn: '_megjegyzes', type: 'string', required: false },
  ],
  autoColumns: [
    { dbColumn: 'isaktiv', source: 'true' },
  ],
  hints: [
    'A családtagokat CNP-vel vagy névvel azonosítjuk.',
    'A cím egy családon belül egységes legyen.',
  ],
  sheetHints: ['Családok', 'csalad', 'Families'],
}

export const PROFILE_PRESBYTERS: ImportProfile = {
  key: 'presbyters',
  module: 'members',
  label: 'Presbiterek',
  description: 'Presbiteri tisztségek és szolgálati körök importja.',
  targetTable: 'presbiter',
  columnMap: [
    { excelHeader: 'Személy CNP', excelAliases: ['szemely_cnp', 'CNP'], dbColumn: '_szemely_cnp', type: 'string', required: true, hint: 'A presbiter személyi száma → id_szemely megkereséséhez' },
    { excelHeader: 'Teljes név', excelAliases: ['teljes_nev', 'Név'], dbColumn: '_teljes_nev', type: 'string', required: false, hint: 'Fallback, ha a CNP nem egyezik' },
    { excelHeader: 'Tisztség', excelAliases: ['tiszseg', 'tisztseg', 'Pozíció'], dbColumn: 'tisztseg', type: 'string', required: false },
    { excelHeader: 'Körzet', excelAliases: ['korzet', 'Körzet neve'], dbColumn: 'korzet', type: 'string', required: false },
  ],
  autoColumns: [],
  hints: [
    'A személyeket CNP-vel azonosítjuk — a CNP oszlop kötelező.',
    'A tisztségek legyenek egységes megnevezésűek.',
  ],
  sheetHints: ['Presbiterek', 'presbiter', 'Presbyters'],
}

// ===========================
// 2. PÉNZÜGY (Finance)
// ===========================

export const PROFILE_INCOME: ImportProfile = {
  key: 'income',
  module: 'finance',
  label: 'Bevételek',
  description: 'Bevételi tételek (kassza/bankszámla) importja az EREK sablonból vagy egyedi Excel-ből.',
  targetTable: 'befizetes',
  columnMap: [
    { excelHeader: 'Dátum', excelAliases: ['datum', 'Datum', 'Kelt'], dbColumn: 'datum', type: 'date', required: true, hint: 'ÉÉÉÉ-HH-NN / Excel dátum sorszám' },
    { excelHeader: 'Összeg', excelAliases: ['osszeg', 'Összeg (RON)', 'Napi bevétel'], dbColumn: 'osszeg', type: 'number', required: true, hint: 'Pozitív szám, ponttal vagy vesszővel' },
    { excelHeader: 'Befizetés célja', excelAliases: ['befizetescel', 'Cél', 'Kategória', 'id_befizetescel'], dbColumn: '_befizetescel_nev', type: 'string', required: false, hint: 'Kategória neve — a rendszer azonosítóra fordítja' },
    { excelHeader: 'Forrás', excelAliases: ['forrasa', 'Befizető', 'Személy'], dbColumn: 'forrasa', type: 'string', required: false },
    { excelHeader: 'Iratszám', excelAliases: ['iratszam', 'Bizonylat', 'Nyugtaszám'], dbColumn: 'iratszam', type: 'string', required: false },
    { excelHeader: 'Irattípus', excelAliases: ['irattipus', 'Bizonylat típus'], dbColumn: 'irattipus', type: 'string', required: false, hint: 'nyugta / számla / átutalás / készpénz' },
    { excelHeader: 'Fizetett év', excelAliases: ['fizetettev', 'Év'], dbColumn: 'fizetettev', type: 'number', required: false },
    { excelHeader: 'Megjegyzés', excelAliases: ['megjegyzes', 'Jegyzet', 'Megj.'], dbColumn: 'megjegyzes', type: 'string', required: false },
  ],
  autoColumns: [
    { dbColumn: 'congregation_id', source: 'congregation_id' },
    { dbColumn: 'userid', source: 'user_id' },
    { dbColumn: 'created', source: 'now' },
    { dbColumn: 'deleted', source: 'false' },
  ],
  hints: [
    'Az összeg mindig pozitív szám legyen.',
    'A dátum legyen egységes formátumú (ÉÉÉÉ-HH-NN).',
    'A "Befizetés célja" oszlop a rendszer kategória nevekkel kell megegyezzen.',
    'Az EREK sablon Kassza / A-T fülei automatikusan felismerhetőek.',
  ],
  sheetHints: ['Kassza', 'Bevételek', 'Income', 'bevétel'],
}

export const PROFILE_EXPENSE: ImportProfile = {
  key: 'expense',
  module: 'finance',
  label: 'Kiadások',
  description: 'Kiadási tételek (kassza/bankszámla) importja.',
  targetTable: 'kiadas',
  columnMap: [
    { excelHeader: 'Dátum', excelAliases: ['datum', 'Datum', 'Kelt'], dbColumn: 'datum', type: 'date', required: true },
    { excelHeader: 'Összeg', excelAliases: ['osszeg', 'Összeg (RON)', 'Napi kiadás'], dbColumn: 'osszeg', type: 'number', required: true, hint: 'Pozitív szám' },
    { excelHeader: 'Kiadás célja', excelAliases: ['kiadascel', 'Cél', 'Kategória', 'id_kiadascel'], dbColumn: '_kiadascel_nev', type: 'string', required: false, hint: 'Kategória neve' },
    { excelHeader: 'Kedvezményezett', excelAliases: ['kedvezmenyzett', 'Átvevő', 'atvevo'], dbColumn: 'atvevo', type: 'string', required: false },
    { excelHeader: 'Iratszám', excelAliases: ['iratszam', 'Bizonylat'], dbColumn: 'iratszam', type: 'string', required: false },
    { excelHeader: 'Irattípus', excelAliases: ['irattipus'], dbColumn: 'irattipus', type: 'string', required: false },
    { excelHeader: 'Megjegyzés', excelAliases: ['megjegyzes', 'Jegyzet'], dbColumn: 'megjegyzes', type: 'string', required: false },
  ],
  autoColumns: [
    { dbColumn: 'congregation_id', source: 'congregation_id' },
    { dbColumn: 'userid', source: 'user_id' },
    { dbColumn: 'created', source: 'now' },
    { dbColumn: 'deleted', source: 'false' },
  ],
  hints: [
    'Az összeg mindig pozitív szám legyen.',
    'A "Kiadás célja" oszlop a rendszer kategória nevekkel kell megegyezzen.',
  ],
  sheetHints: ['Kiadások', 'Expense', 'kiadás'],
}

// ===========================
// 3. ANYAKÖNYV (Registry)
// ===========================

export const PROFILE_BAPTISM: ImportProfile = {
  key: 'baptism',
  module: 'registry',
  label: 'Keresztelések',
  description: 'Keresztelési anyakönyvi bejegyzések importja.',
  targetTable: 'keresztseg',
  columnMap: [
    { excelHeader: 'Személy CNP', excelAliases: ['cnp', 'szemely_cnp', 'Személyi'], dbColumn: '_szemely_cnp', type: 'string', required: false, hint: 'A megkeresztelt személyi száma' },
    { excelHeader: 'Név', excelAliases: ['nev', 'Teljes név', 'Személy neve'], dbColumn: '_szemely_nev', type: 'string', required: false, hint: 'Fallback, ha nincs CNP' },
    { excelHeader: 'Dátum', excelAliases: ['datum', 'Keresztelés dátuma'], dbColumn: 'datum', type: 'date', required: true },
    { excelHeader: 'Lelkész neve', excelAliases: ['lelkeszneve', 'Lelkész'], dbColumn: 'lelkeszneve', type: 'string', required: false },
    { excelHeader: 'Okirat szám', excelAliases: ['okirat', 'Anyakönyvi szám'], dbColumn: 'okirat', type: 'string', required: false },
    { excelHeader: 'Keresztszülők', excelAliases: ['keresztszulok', 'Keresztszülő'], dbColumn: 'keresztszulok', type: 'string', required: false },
    { excelHeader: 'Megjegyzés', excelAliases: ['megjegyzes'], dbColumn: 'megjegyzes', type: 'string', required: false },
  ],
  autoColumns: [
    { dbColumn: 'congregation_id', source: 'congregation_id' },
  ],
  hints: [
    'A személyt CNP-vel vagy névvel azonosítjuk a meglévő tagok között.',
    'Ha a személy még nincs a rendszerben, a sor kihagyásra kerül (figyelmeztetéssel).',
  ],
  sheetHints: ['Keresztelés', 'Baptism', 'keresztseg'],
}

export const PROFILE_CONFIRMATION: ImportProfile = {
  key: 'confirmation',
  module: 'registry',
  label: 'Konfirmálások',
  description: 'Konfirmálási anyakönyvi bejegyzések importja.',
  targetTable: 'konfirmalas',
  columnMap: [
    { excelHeader: 'Személy CNP', excelAliases: ['cnp', 'szemely_cnp'], dbColumn: '_szemely_cnp', type: 'string', required: false },
    { excelHeader: 'Név', excelAliases: ['nev', 'Teljes név'], dbColumn: '_szemely_nev', type: 'string', required: false },
    { excelHeader: 'Dátum', excelAliases: ['datum', 'Konfirmálás dátuma'], dbColumn: 'datum', type: 'date', required: true },
    { excelHeader: 'Lelkész neve', excelAliases: ['lelkeszneve', 'Lelkész'], dbColumn: 'lelkeszneve', type: 'string', required: false },
    { excelHeader: 'Megjegyzés', excelAliases: ['megjegyzes'], dbColumn: 'megjegyzes', type: 'string', required: false },
  ],
  autoColumns: [
    { dbColumn: 'congregation_id', source: 'congregation_id' },
  ],
  hints: [
    'A személyt CNP-vel vagy névvel azonosítjuk.',
    'Már konfirmált személyek duplikált sorai kihagyásra kerülnek.',
  ],
  sheetHints: ['Konfirmálás', 'Confirmation', 'konfirmalas'],
}

export const PROFILE_MARRIAGE: ImportProfile = {
  key: 'marriage',
  module: 'registry',
  label: 'Házasságok',
  description: 'Házassági anyakönyvi bejegyzések importja.',
  targetTable: 'hazassag',
  columnMap: [
    { excelHeader: 'Vőlegény CNP', excelAliases: ['ferfi_cnp', 'Férfi CNP'], dbColumn: '_ferfi_cnp', type: 'string', required: false },
    { excelHeader: 'Vőlegény neve', excelAliases: ['ferfi_nev', 'Férfi neve'], dbColumn: '_ferfi_nev', type: 'string', required: false },
    { excelHeader: 'Menyasszony CNP', excelAliases: ['no_cnp', 'Nő CNP'], dbColumn: '_no_cnp', type: 'string', required: false },
    { excelHeader: 'Menyasszony neve', excelAliases: ['no_nev', 'Nő neve'], dbColumn: '_no_nev', type: 'string', required: false },
    { excelHeader: 'Dátum', excelAliases: ['datum', 'Esküvő dátuma'], dbColumn: 'datum', type: 'date', required: true },
    { excelHeader: 'Lelkész neve', excelAliases: ['lelkeszneve', 'Lelkész'], dbColumn: 'lelkeszneve', type: 'string', required: false },
    { excelHeader: 'Tanúk', excelAliases: ['tanuk', 'Tanú'], dbColumn: 'tanuk', type: 'string', required: false },
    { excelHeader: 'Megjegyzés', excelAliases: ['megjegyzes'], dbColumn: 'megjegyzes', type: 'string', required: false },
  ],
  autoColumns: [
    { dbColumn: 'congregation_id', source: 'congregation_id' },
  ],
  hints: [
    'Mind a vőlegényt, mind a menyasszonyt CNP-vel vagy névvel azonosítjuk.',
  ],
  sheetHints: ['Házasság', 'Marriage', 'hazassag', 'Esküvő'],
}

export const PROFILE_BURIAL: ImportProfile = {
  key: 'burial',
  module: 'registry',
  label: 'Temetések',
  description: 'Temetési anyakönyvi bejegyzések importja.',
  targetTable: 'temetes',
  columnMap: [
    { excelHeader: 'Személy CNP', excelAliases: ['cnp', 'szemely_cnp'], dbColumn: '_szemely_cnp', type: 'string', required: false },
    { excelHeader: 'Név', excelAliases: ['nev', 'Teljes név', 'Elhunyt neve'], dbColumn: '_szemely_nev', type: 'string', required: false },
    { excelHeader: 'Halál dátuma', excelAliases: ['hdatum', 'Elhalálozás'], dbColumn: 'hdatum', type: 'date', required: false },
    { excelHeader: 'Temetés dátuma', excelAliases: ['tdatum', 'Temetés'], dbColumn: 'tdatum', type: 'date', required: true },
    { excelHeader: 'Halál oka', excelAliases: ['hoka', 'Ok'], dbColumn: 'hoka', type: 'string', required: false },
    { excelHeader: 'Lelkész neve', excelAliases: ['lelkeszneve', 'Lelkész'], dbColumn: 'lelkeszneve', type: 'string', required: false },
    { excelHeader: 'Okirat szám', excelAliases: ['okirat'], dbColumn: 'okirat', type: 'string', required: false },
    { excelHeader: 'Megjegyzés', excelAliases: ['megjegyzes'], dbColumn: 'megjegyzes', type: 'string', required: false },
  ],
  autoColumns: [
    { dbColumn: 'congregation_id', source: 'congregation_id' },
  ],
  hints: [
    'A személyt CNP-vel vagy névvel azonosítjuk.',
    'A temetés dátuma kötelező.',
  ],
  sheetHints: ['Temetés', 'Burial', 'temetes'],
}

// ===========================
// 4. MUNKANAPLÓ (Worklog)
// ===========================

export const PROFILE_WORKLOG_SERVICES: ImportProfile = {
  key: 'worklog_services',
  module: 'worklog',
  label: 'Szolgálati alkalmak',
  description: 'Istentiszteletek, igehirdetések és egyéb szolgálati alkalmak importja az EREK sablonból.',
  targetTable: 'munkanaplo',
  columnMap: [
    { excelHeader: 'Datum', excelAliases: ['Dátum', 'datum', 'Idopont'], dbColumn: 'idopont', type: 'date', required: true },
    { excelHeader: 'Szolgalat jellege', excelAliases: ['Szolgálat jellege', 'jellege', 'Jelleg', 'Alkalom'], dbColumn: 'jellege', type: 'string', required: true, hint: 'Istentisztelet / Bibliaóra / stb.' },
    { excelHeader: 'Du.', excelAliases: ['du', 'Délután', 'Du'], dbColumn: 'du', type: 'boolean', required: false, hint: '"x"/igen → délutáni alkalom' },
    { excelHeader: 'Ferfi', excelAliases: ['Férfi', 'Jelenlét férfi'], dbColumn: 'jelenlet_ferfi', type: 'number', required: false },
    { excelHeader: 'No', excelAliases: ['Nő', 'Jelenlét nő'], dbColumn: 'jelenlet_no', type: 'number', required: false },
    { excelHeader: 'Bibliaolvasas', excelAliases: ['Bibliaolvasás', 'Bibliai rész'], dbColumn: 'bibliaolvasas', type: 'string', required: false },
    { excelHeader: 'Alapige', excelAliases: ['Ige', 'Igehely', 'alapige'], dbColumn: 'alapige', type: 'string', required: false },
    { excelHeader: 'Enekek', excelAliases: ['Énekek', '1-6. enek', 'Ének'], dbColumn: 'enekek', type: 'string', required: false },
    { excelHeader: 'Szolgalt', excelAliases: ['Szolgált', 'Ki szolgált'], dbColumn: 'szolgalt', type: 'string', required: false },
    { excelHeader: 'Perselypenz', excelAliases: ['Perselypénz', 'Persely', 'P.penz'], dbColumn: 'persely', type: 'number', required: false },
    { excelHeader: 'Megjegyzes', excelAliases: ['Megjegyzés', 'Jegyzet'], dbColumn: 'megjegyzes', type: 'string', required: false },
  ],
  autoColumns: [
    { dbColumn: 'congregation_id', source: 'congregation_id' },
    { dbColumn: 'kategoria', source: 'szolgalat' as AutoColumnSource }, // override: literal 'szolgalat'
    { dbColumn: 'created', source: 'now' },
    { dbColumn: 'deleted', source: 'false' },
  ],
  hints: [
    'Az EREK sablon "Szolgalati_alkalmak" füle automatikusan felismerhető.',
    'A "Du." oszlop: "x"/igen = délutáni, üres = délelőtti.',
    'A létszámok (Férfi/Nő) egész számok legyenek.',
  ],
  sheetHints: ['Szolgalati_alkalmak', 'Szolgálati', 'Istentisztelet'],
}

export const PROFILE_WORKLOG_CATECHESIS: ImportProfile = {
  key: 'worklog_catechesis',
  module: 'worklog',
  label: 'Katekézis',
  description: 'Vallásóra/konfirmációi előkészítő/vasárnapi iskola alkalmak importja.',
  targetTable: 'munkanaplo',
  columnMap: [
    { excelHeader: 'Datum', excelAliases: ['Dátum', 'datum'], dbColumn: 'idopont', type: 'date', required: true },
    { excelHeader: 'Katekezis jellege', excelAliases: ['Katekézis jellege', 'Jelleg', 'Alkalom'], dbColumn: 'jellege', type: 'string', required: true },
    { excelHeader: 'Reszt vett', excelAliases: ['Részt vett', 'Létszám', 'Résztvevők'], dbColumn: 'jelenlet_osszesen', type: 'number', required: false },
    { excelHeader: 'Tananyag', excelAliases: ['Téma', 'Cím'], dbColumn: 'cim', type: 'string', required: false },
    { excelHeader: 'Perselypenz', excelAliases: ['Perselypénz', 'Persely'], dbColumn: 'persely', type: 'number', required: false },
    { excelHeader: 'A katekézist tartotta', excelAliases: ['Tartotta', 'Szolgált'], dbColumn: 'szolgalt', type: 'string', required: false },
    { excelHeader: 'Megjegyzes', excelAliases: ['Megjegyzés'], dbColumn: 'megjegyzes', type: 'string', required: false },
  ],
  autoColumns: [
    { dbColumn: 'congregation_id', source: 'congregation_id' },
    { dbColumn: 'kategoria', source: 'katekezis' as AutoColumnSource },
    { dbColumn: 'created', source: 'now' },
    { dbColumn: 'deleted', source: 'false' },
  ],
  hints: [
    'Az EREK sablon "Katekezis" füle automatikusan felismerhető.',
    'A "Részt vett" oszlop összlétszámot jelent.',
  ],
  sheetHints: ['Katekezis', 'Katekézis', 'Vallásóra', 'Konfirmáció'],
}

export const PROFILE_WORKLOG_VISITS: ImportProfile = {
  key: 'worklog_visits',
  module: 'worklog',
  label: 'Család/beteglátogatás',
  description: 'Családlátogatás és beteglátogatás bejegyzések importja.',
  targetTable: 'munkanaplo',
  columnMap: [
    { excelHeader: 'Datum', excelAliases: ['Dátum', 'datum'], dbColumn: 'idopont', type: 'date', required: true },
    { excelHeader: 'CsL/BL', excelAliases: ['Típus', 'Látogatás típusa'], dbColumn: 'jellege', type: 'string', required: false, hint: 'CsL = családlátogatás, BL = beteglátogatás' },
    { excelHeader: 'A meglátogatott család neve', excelAliases: ['Család neve', 'Név'], dbColumn: 'cim', type: 'string', required: false },
    { excelHeader: 'Cim', excelAliases: ['Cím', 'Lakcím'], dbColumn: '_cim', type: 'string', required: false },
    { excelHeader: 'Jelen volt', excelAliases: ['Jelenlévők', 'Létszám'], dbColumn: 'jelenlet_osszesen', type: 'number', required: false },
    { excelHeader: 'Jegyzet (Bibliai resz, enek, egyeb)', excelAliases: ['Jegyzet', 'Megjegyzés', 'Bibliai rész'], dbColumn: 'megjegyzes', type: 'string', required: false },
  ],
  autoColumns: [
    { dbColumn: 'congregation_id', source: 'congregation_id' },
    { dbColumn: 'kategoria', source: 'diakoniai' as AutoColumnSource },
    { dbColumn: 'created', source: 'now' },
    { dbColumn: 'deleted', source: 'false' },
  ],
  hints: [
    'Az EREK sablon "Csaladlatogatas" füle automatikusan felismerhető.',
    'CsL = családlátogatás, BL = beteglátogatás.',
  ],
  sheetHints: ['Csaladlatogatas', 'Családlátogatás', 'Beteglátogatás', 'Látogatás'],
}

// ===========================
// 5. IKTATÓ (Filing)
// ===========================

export const PROFILE_FILING: ImportProfile = {
  key: 'filing',
  module: 'filing',
  label: 'Iktatás',
  description: 'Iktatási bejegyzések importja az EREK sablon vagy egyedi Excel alapján.',
  targetTable: 'iktato',
  columnMap: [
    { excelHeader: 'Helyi iktato szam', excelAliases: ['Iktatószám', 'Sorszám', 'sequence_number'], dbColumn: 'sequence_number', type: 'number', required: false, hint: 'Ha üres, automatikus sorszám' },
    { excelHeader: 'Irány', excelAliases: ['direction', 'Irány', 'Tipus'], dbColumn: 'direction', type: 'string', required: false, hint: 'incoming / outgoing — ha üres, alapértelmezés: incoming' },
    { excelHeader: 'Erkezes/kuldes datuma', excelAliases: ['Dátum', 'Kelt', 'datum', 'kelt', 'Érkezés dátuma', 'Küldés dátuma'], dbColumn: 'kelt', type: 'date', required: true },
    { excelHeader: 'Kuldo keltezese', excelAliases: ['Küldő keltezése', 'Keltezés'], dbColumn: '_kuldo_keltezese', type: 'date', required: false, hint: 'A küldő irat kelte (megjegyzésbe kerül)' },
    { excelHeader: 'Cim Kitol/Kinek', excelAliases: ['Küldő/Címzett', 'sender_or_recipient', 'Kitol/Kinek', 'Cím', 'Feladó'], dbColumn: 'sender_or_recipient', type: 'string', required: false },
    { excelHeader: 'Targykivonat', excelAliases: ['Tárgykivonat', 'Tárgy', 'subject', 'Targykivonat', 'Kivonat'], dbColumn: 'subject', type: 'string', required: false, hint: 'Az irat tárgya / tárgykivonata' },
    { excelHeader: 'Iratgyujto', excelAliases: ['Iratgyűjtő', 'Dosszié', 'file_folder', 'Gyűjtő'], dbColumn: 'file_folder', type: 'string', required: false },
    { excelHeader: 'Lapok szama', excelAliases: ['Oldalszám', 'oldalszam', 'Lapszám', 'Lapok'], dbColumn: 'oldalszam', type: 'number', required: false },
    { excelHeader: 'Kuldo iktato szama', excelAliases: ['Küldő iktatószáma', 'Külső szám', 'Küldő szám'], dbColumn: 'irattarijel', type: 'string', required: false },
    { excelHeader: 'Ha valasz', excelAliases: ['Válasz', 'Elintézés módja', 'elintezes_modja', 'Válasz módja'], dbColumn: 'elintezes_modja', type: 'string', required: false },
    { excelHeader: 'Megjegyzes', excelAliases: ['Megjegyzés', 'megjegyzes', 'Jegyzet'], dbColumn: 'megjegyzes', type: 'string', required: false },
    { excelHeader: 'Hivatkozas cime', excelAliases: ['Hivatkozás címe', 'Hivatkozás'], dbColumn: '_hivatkozas', type: 'string', required: false, hint: 'Kereszthivatkozás (virtuális mező)' },
  ],
  autoColumns: [
    { dbColumn: 'congregation_id', source: 'congregation_id' },
    { dbColumn: 'year', source: 'current_year' },
    { dbColumn: 'userid', source: 'user_id' },
    { dbColumn: 'deleted', source: 'false' },
  ],
  hints: [
    'Az EREK sablon "Iktato" füle automatikusan felismerhető.',
    'Az iktatószám opcionális — ha üres, a rendszer automatikusan sorszámozza.',
    'A dátum kötelező (Kelt oszlop).',
  ],
  sheetHints: ['Iktato', 'Iktatás', 'Iktatószám', 'Filing'],
}

// ---------------------------------------------------------------------------
// Gyűjtemények modulonként
// ---------------------------------------------------------------------------

export const MEMBER_PROFILES: ImportProfile[] = [
  PROFILE_PERSONS,
  PROFILE_FAMILIES,
  PROFILE_PRESBYTERS,
]

export const FINANCE_PROFILES: ImportProfile[] = [
  PROFILE_INCOME,
  PROFILE_EXPENSE,
]

export const REGISTRY_PROFILES: ImportProfile[] = [
  PROFILE_BAPTISM,
  PROFILE_CONFIRMATION,
  PROFILE_MARRIAGE,
  PROFILE_BURIAL,
]

export const WORKLOG_PROFILES: ImportProfile[] = [
  PROFILE_WORKLOG_SERVICES,
  PROFILE_WORKLOG_CATECHESIS,
  PROFILE_WORKLOG_VISITS,
]

export const FILING_PROFILES: ImportProfile[] = [
  PROFILE_FILING,
]

/** Minden profil egyetlen tömbben */
export const ALL_IMPORT_PROFILES: ImportProfile[] = [
  ...MEMBER_PROFILES,
  ...FINANCE_PROFILES,
  ...REGISTRY_PROFILES,
  ...WORKLOG_PROFILES,
  ...FILING_PROFILES,
]

/** Profil keresése kulcs alapján */
export function getProfileByKey(key: string): ImportProfile | undefined {
  return ALL_IMPORT_PROFILES.find((p) => p.key === key)
}

/** Egy modul összes profilja */
export function getProfilesByModule(module: ImportModule): ImportProfile[] {
  return ALL_IMPORT_PROFILES.filter((p) => p.module === module)
}
