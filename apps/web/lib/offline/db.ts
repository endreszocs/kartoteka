/**
 * Dexie (IndexedDB) séma — KARTOTEKA offline-first PWA lokális cache.
 *
 * Ez a fájl a KARTOTEKA local-first rétegének a központja. A Supabase a
 * hivatalos (authoritative) adattár; a Dexie egy gyors, offline-capable
 * mirror, amit a `sync-orchestrator` tart szinkronban.
 *
 * Architektúra:
 *  - Minden modul táblának saját Dexie táblája van (ugyanaz a név)
 *  - Minden rekordnak VAN: `id`, `revision`, `updated_at`, `congregation_id`
 *  - Rejtett sync-metaadatok (client-side only):
 *     - `_syncStatus`: 'clean' | 'pending' | 'conflict' | 'deleting'
 *     - `_pendingDelete`: boolean — ha user törölt offline
 *     - `_baseRevision`: bigint — az utolsó szerver-ismert revision
 *  - A scope filtering minden query-ben: `.where('congregation_id').equals(scope)`
 *
 * Fázis 0: a 20 legfontosabb tábla (tagnyilvántartás + pénzügy + anyakönyv)
 *         — a maradékot az 5. fázisban adjuk hozzá.
 */

import Dexie, { type Table } from 'dexie'

// ─────────────────────────────────────────────────────────────────
// Típusok — minden Dexie rekord alap interface-e
// ─────────────────────────────────────────────────────────────────

/**
 * Minden sync-tracked rekord kötelező alapmezői.
 *
 * A `revision` és `updated_at` a szerverről érkezik a pull-ban, a kliens
 * az optimistic write-nál nem állítja be őket (a szerver ad új értéket).
 *
 * A `_syncStatus` kliens-oldali állapot:
 *  - 'clean': szinkronban van a szerverrel
 *  - 'pending': helyi változtatás van, ami még nem ment fel
 *  - 'conflict': a szerver 409-et adott, user beavatkozás kell
 *  - 'deleting': helyi törlés jelzés, queue-ban várja a push-t
 */
export interface SyncTrackedRecord {
  id: string | number  // UUID vagy int (táblánként változó)
  revision: number     // szerver-oldali verzió
  updated_at: string   // ISO timestamptz a szerverről
  congregation_id: string | null  // scope
  _syncStatus: 'clean' | 'pending' | 'conflict' | 'deleting'
  _pendingDelete?: boolean
  _baseRevision?: number  // az utolsó server-szinkronizált revision (ha pending)
  deleted?: boolean  // Supabase soft-delete flag (ha tábla soft-delete-et használ)
}

// ─────────────────────────────────────────────────────────────────
// Tagnyilvántartás modul — fő táblák
// ─────────────────────────────────────────────────────────────────

export interface SzemelyRecord extends SyncTrackedRecord {
  id: number
  cnp: string
  csaladnev: string | null
  k_nev: string | null
  sz_datum: string | null
  ferfi: boolean
  allapot: string | null
  email: string | null
  telefon: string | null
  type: string
  congregation_id: string
  // ... a teljes oszloplista a generator.ts-ből importálható később
}

export interface CsaladRecord extends SyncTrackedRecord {
  id: number
  id_ferfi: number | null
  id_no: number | null
  c_szam: string
  c_utcaid: number | null
  isaktiv: boolean
  congregation_id: string
}

export interface PresbiterRecord extends SyncTrackedRecord {
  id: number
  id_szemely: number
  tisztseg: string // NOT NULL
  korzet: string | null
  korzetszamok: string | null
  id_csoport: number | null
  congregation_id: string | null // NINCS DB-ben
}

export interface GyerekRecord extends SyncTrackedRecord {
  id: number
  id_csalad: number // NOT NULL
  id_szemely: number // NOT NULL
  congregation_id: string | null // NINCS DB-ben
}

export interface FelmentesRecord extends SyncTrackedRecord {
  id: number
  id_csalad: number | null
  id_szemely: number | null
  felmento: string // NOT NULL
  datum: string // NOT NULL
  oka: string // NOT NULL
  kezdete: number | null // év (integer!), nem dátum
  vege: number | null // év (integer!), nem dátum
  congregation_id: string | null // NINCS DB-ben
}

// ─────────────────────────────────────────────────────────────────
// Pénzügy modul — fő táblák
// ─────────────────────────────────────────────────────────────────

export interface BefizetesRecord extends SyncTrackedRecord {
  id: number
  xkey: string
  id_csalad: number | null
  id_szemely: number | null
  forrasa: string // NOT NULL
  id_befizetescel: number // NOT NULL
  datum: string
  osszeg: number
  nyugta: string
  iratszam: string
  irattipus: string
  csalad: boolean
  fizetettev: number
  bankszamla_id: number | null // NULL = kassza
  is_potlas: boolean
  belso_mozgas_xkey: string | null
  megjegyzes: string | null
  deleted: boolean
  congregation_id: string | null
}

export interface KiadasRecord extends SyncTrackedRecord {
  id: number
  xkey: string
  id_kiadascel: number // NOT NULL
  datum: string
  osszeg: number
  nyugta: string
  iratszam: string
  irattipus: string
  megjegyzes: string | null
  atvevo: string | null
  atvevoid: number | null
  bankszamla_id: number | null // NULL = kassza
  is_potlas: boolean
  vonatkozo_idoszak: string | null
  belso_mozgas_xkey: string | null
  deleted: boolean
  congregation_id: string | null
}

export interface BankszamlakRecord extends SyncTrackedRecord {
  id: number
  bank_neve: string | null
  iban: string | null
  valuta: string | null
  nyito_egyenleg: number | null
  congregation_id: string
}

export interface BelsomozgasRecord extends SyncTrackedRecord {
  id: number
  datum: string
  tipus: string
  osszeg: number
  forras: string | null
  cel: string | null
  congregation_id: string
}

export interface BerletiSzerzodesRecord extends SyncTrackedRecord {
  id: string
  berlo_nev: string | null
  ceg_nev: string | null
  leiras: string
  tipus: string
  osszeg: number
  fizetesi_ciklus: string
  kezdet: string
  vege: string | null
  aktiv: boolean
  congregation_id: string
}

// ─────────────────────────────────────────────────────────────────
// Anyakönyv modul — fő táblák
// ─────────────────────────────────────────────────────────────────

export interface KeresztsegRecord extends SyncTrackedRecord {
  id: number
  id_szemely: number // NOT NULL
  datum: string // NOT NULL (timestamp)
  lelkeszneve: string | null
  okirat: string | null // ÁLLAMI anyakönyvi szám
  egyhazi_szam: string | null // 2026-04-29: EGYHÁZI anyakönyvi szám (YYYY01NNNN)
  keresztszulok: string | null
  megjegyzes: string | null
  munkanaploba: boolean
  helyid: number | null
  munkanaplo_id: number | null
  congregation_id: string | null
}

export interface KonfirmalasRecord extends SyncTrackedRecord {
  id: number
  id_szemely: number // NOT NULL
  datum: string // NOT NULL (date) — NEM `mikor`!
  lelkeszneve: string | null
  keresztelesideje: string | null
  megjegyzes: string | null
  helyid: number | null
  munkanaplo_id: number | null
  okirat: string | null // 2026-04-29: ÁLLAMI anyakönyvi szám
  egyhazi_szam: string | null // 2026-04-29: EGYHÁZI anyakönyvi szám (YYYY02NNNN)
  congregation_id: string | null
}

export interface HazassagRecord extends SyncTrackedRecord {
  id: number
  id_ferfi: number // NOT NULL
  id_no: number // NOT NULL
  datum: string // NOT NULL (timestamp)
  lelkeszneve: string | null
  hlevel: string | null // ÁLLAMI házassági levél száma
  egyhazi_szam: string | null // 2026-04-29: EGYHÁZI anyakönyvi szám (YYYY03NNNN)
  tanuk: string | null
  megjegyzes: string | null
  munkanaploba: boolean
  helyid: number | null
  munkanaplo_id: number | null
  congregation_id: string | null
}

export interface TemetesRecord extends SyncTrackedRecord {
  id: number
  id_szemely: number // NOT NULL
  hdatum: string // halál dátuma (NOT NULL)
  hoka: string | null
  tdatum: string // temetés dátuma (NOT NULL) — NEM `datum`!
  lelkeszneve: string | null
  okirat: string | null // ÁLLAMI halotti anyakönyvi szám
  egyhazi_szam: string | null // 2026-04-29: EGYHÁZI anyakönyvi szám (YYYY04NNNN)
  megjegyzes: string | null
  munkanaploba: boolean
  hhelyid: number | null
  thelyid: number | null
  munkanaplo_id: number | null
  congregation_id: string | null
}

// ─────────────────────────────────────────────────────────────────
// Munkanapló
// ─────────────────────────────────────────────────────────────────

export interface MunkanaploRecord extends SyncTrackedRecord {
  id: number
  idopont: string | null // date
  kategoria: string | null // default 'szolgalat'
  jellege: string | null
  id_jellege: string | null
  bibliaolvasas: string | null
  alapige: string | null
  cim: string | null
  enekek: string | null
  jelenlet_ferfi: number | null
  jelenlet_no: number | null
  jelenlet_gyermek: number | null
  jelenlet_osszesen: number // NOT NULL
  szolgalt: string | null
  persely: number | null
  megjegyzes: string | null
  mediapath: string | null
  du: boolean
  congregation_id: string | null
}

// ─────────────────────────────────────────────────────────────────
// Iktató
// ─────────────────────────────────────────────────────────────────

export interface IktatoRecord extends SyncTrackedRecord {
  id: string // uuid PK!
  year: number // NOT NULL
  sequence_number: number // auto-sequence, NOT NULL
  direction: string // 'incoming' | 'outgoing'
  subject: string // NOT NULL
  sender_or_recipient: string | null
  file_folder: string | null
  kelt: string | null // date
  targykivonat: string | null
  elintezes_ideje: string | null
  elintezes_modja: string | null
  irattarijel: string | null
  oldalszam: number | null
  megjegyzes: string | null
  deleted: boolean
  congregation_id: string
}

export interface IktatoSablonRecord extends SyncTrackedRecord {
  id: string // uuid PK
  nev: string // NOT NULL
  tipus: string // 'igazolas' | 'level' | 'hatarozat' | 'meghivo' | 'jegyzokonyv' | 'egyeb'
  leiras: string | null
  tartalom: string // NOT NULL
  aktiv: boolean
  sorrend: number
  deleted: boolean
  congregation_id: string
}

// ─────────────────────────────────────────────────────────────────
// Leltár
// ─────────────────────────────────────────────────────────────────

export interface LeltarTetelRecord extends SyncTrackedRecord {
  id: string // uuid PK!
  congregation_id: string // NOT NULL
  kategoria: string // NOT NULL
  megnevezes: string // NOT NULL
  leltari_szam: string // NOT NULL
  helyszin: string | null
  felelos_szemely_id: number | null
  felelos_neve: string | null
  beszerzes_datuma: string | null // date
  beszerzes_bizonylat: string | null
  beszerzesi_ertek: number | null
  mennyiseg: number | null
  mertekegyseg: string | null
  katalogus_kod: string | null
  hasznalati_ido_ev: number | null
  is_deleted: boolean // NOTE: NEM `deleted`, hanem `is_deleted`!
  megjegyzes: string | null
  // a `deleted` field a SyncTrackedRecord-ban opcionális, itt felülírjuk a BE-vel
  deleted?: boolean
}

// ─────────────────────────────────────────────────────────────────
// Sírhely (Fázis 5a) — 4 tábla
//
// FONTOS: Az oszlopnevek az aktuális Database_schema.sql szerintiek.
// A sirhely / sirhelyberles / sirhelyelhunyt tábláknak NINCS
// `congregation_id` mezőjük — a scope a sirhelytemeto.congregation_id-on
// keresztül érvényesül. Ezért a TableRegistry `scopeFilter: 'none'`-re
// van állítva ezekre, és a `congregation_id` itt mégis opcionálisként
// szerepel a SyncTrackedRecord interface kompatibilitás miatt
// (a pull/push runtime null-tűrő).
// ─────────────────────────────────────────────────────────────────

export interface SirhelytemetoRecord extends SyncTrackedRecord {
  id: number
  nev: string
  cim: string | null
  megjegyzes: string | null
  aktiv: boolean
  deleted: boolean
  congregation_id: string
}

export interface SirhelyRecord extends SyncTrackedRecord {
  id: number
  temetoid: number
  parcella: string
  sor: number
  szam: string
  elhelyezkedes: string | null
  meret: string | null
  tipus: string | null
  megjegyzes: string | null
  aktivberlesid: number | null
  imagelnk: string | null
  allapot: string // szabad/foglalt/lejart/zart/fenntartott
  gps_lat: number | null
  gps_lng: number | null
  deleted: boolean
  congregation_id: string | null
}

export interface SirhelyberlesRecord extends SyncTrackedRecord {
  id: number
  sirhelyid: number
  befizetesid: number
  megvaltas: string // timestamp
  lejarata: string | null // timestamp
  berlo: string | null
  berloid: number | null
  berlocim: string | null
  berloelerhetoseg: string | null
  tipus: string // berles/megvaltas
  osszeg: number | null
  megjegyzes: string | null
  deleted: boolean
  congregation_id: string | null
}

export interface SirhelyelhunytRecord extends SyncTrackedRecord {
  id: number
  sirhelyid: number
  temetesid: number
  nev: string | null
  sznev: string | null
  sz_datum: string | null
  sz_hely: string | null
  ferfi: boolean
  anyjaneve: string | null
  hdatum: string | null
  hhely: string | null
  tdatum: string | null
  ttipus: string | null
  tmodja: string | null
  elhelyezkedes: string | null
  temetteto: string | null
  szolgaltato: string | null
  megjegyzes: string | null
  deleted: boolean
  congregation_id: string | null
}

// ─────────────────────────────────────────────────────────────────
// Jegyzőkönyvek (Fázis 5a) — 4 tábla, UUID primary key-kel
// ─────────────────────────────────────────────────────────────────

export interface PresbiteriJegyzokonyvRecord extends SyncTrackedRecord {
  id: string
  ev: number
  ules_sorszam: number
  tipus: string
  datum: string
  hely: string | null
  kezdes: string | null
  zaras: string | null
  elnok_neve: string | null
  jegyzo_neve: string | null
  hitelesito1: string | null
  hitelesito2: string | null
  igevers: string | null
  felolvasas: string | null
  megjegyzes: string | null
  allapot: string
  congregation_id: string
}

export interface JegyzokonyvResztvevoRecord extends SyncTrackedRecord {
  id: string
  jegyzokonyv_id: string
  nev: string
  statusz: string
  szerep: string | null
  congregation_id: string | null
}

export interface JegyzokonyvNapirendiPontRecord extends SyncTrackedRecord {
  id: string
  jegyzokonyv_id: string
  sorszam: number
  cim: string
  eloado: string | null
  targyalas: string | null
  szavazas_igen: number | null
  szavazas_nem: number | null
  szavazas_tartozkodo: number | null
  congregation_id: string | null
}

export interface JegyzokonyvHatarozatRecord extends SyncTrackedRecord {
  id: string
  jegyzokonyv_id: string
  napirendi_pont_id: string | null
  ev: number
  sorszam: number
  szoveg: string
  felelos: string | null
  hatarido: string | null
  allapot: string
  congregation_id: string | null
}

// ─────────────────────────────────────────────────────────────────
// Sync metadata — kliens-oldali meta
// ─────────────────────────────────────────────────────────────────

export interface SyncMetaRecord {
  /** A kulcs: tábla neve (pl. 'szemely') */
  table: string
  /** Az utolsó sikeres pull ISO timestamp-ja (cursor) */
  lastPullAt: string | null
  /** Az utolsó sikeres push ISO timestamp-ja */
  lastPushAt: string | null
  /** Az utolsó pull hibaüzenet (ha volt) */
  lastError: string | null
  /** Cong scope — csak ezt a congregation_id-t tartjuk cache-ben */
  congregationId: string | null
  /** Séma-verzió — ha változik, a cache-et wipe-oljuk */
  schemaVersion: number
  /** Dirty flag — ha valamely ebbe a táblába írás történt,
   *  Excel flush-nak újra kell íródnia */
  dirty: boolean
  /**
   * A `congregations.restore_epoch` utoljára ISMERT értéke (2026-08-11).
   *
   * ⚠️ CSAK a `__restore_epoch` pszeudo-soron van kitöltve (lásd
   *    `lib/offline/restore-epoch.ts`). Nem indexelt mező, ezért NEM igényel
   *    Dexie verzió-emelést.
   *
   *    MIÉRT KELL: a visszaállított sorok a RÉGI `updated_at`-tal jönnek vissza,
   *    ezért a delta-pull (`updated_at > lastPullAt`) SOHA nem venné észre őket,
   *    a törölt sorok pedig ottmaradnának a Dexie-ben — és a push visszaírná a
   *    helyi, újabb verziókat. Vagyis a laptop NÉMÁN visszacsinálná a
   *    visszaállítást. Az epoch változása = teljes újratöltés + a helyi
   *    mutációs sor KARANTÉNBA (nem eldobás).
   */
  restoreEpoch?: number | null
}

export interface MutationEnvelope {
  /** Kliens-generált UUID */
  id: string
  /** Modul/tábla neve */
  table: string
  /** Művelet típusa */
  op: 'insert' | 'update' | 'delete'
  /** A payload (a sor adatai, delete esetén csak id) */
  payload: Record<string, unknown>
  /** Az update előtti revision — ezt küldjük a szervernek optimistic lock-hoz */
  baseRevision: number | null
  /** Kliens-oldali timestamp (diagnosztikához) */
  clientTimestamp: number
  /** Sikertelen push-ok számlálója */
  retryCount: number
  /** Következő try időpontja (backoff) */
  nextRetryAt: number | null
  /** Jelenlegi állapot */
  status: 'pending' | 'syncing' | 'failed' | 'conflict' | 'dead'
  /** Utolsó hibaüzenet (ha volt) */
  errorMsg: string | null
}

export interface ConflictRecord {
  /** A tábla és a rekord ID együtt ad kulcsot */
  table: string
  rowId: string
  /** A saját lokális verzió (a user által módosított) */
  localPayload: Record<string, unknown>
  /** A szerver oldali verzió */
  serverPayload: Record<string, unknown>
  /** Az eredeti (base) rekord, amire a user módosításai épültek */
  basePayload: Record<string, unknown> | null
  /** Mikor észleltük a konfliktust */
  detectedAt: number
  /** Megoldva-e */
  resolved: boolean
}

/**
 * FileSystemDirectoryHandle perzisztálás. A böngésző (Chrome) meg tudja őrizni
 * a kézi mappa-handle-t IndexedDB-ben, de reload után permission prompt kell.
 */
export interface FsHandleRecord {
  /** Stabil kulcs — pl. 'kartoteka-root' */
  key: string
  /** A FileSystemDirectoryHandle — típust IDBObjectStore-ban unknown-ként kezeljük */
  handle: unknown
  /** Mikor mentettük */
  savedAt: number
}

// ─────────────────────────────────────────────────────────────────
// Dexie DB class
// ─────────────────────────────────────────────────────────────────

export class KartotekaDB extends Dexie {
  // Tagnyilvántartás
  szemely!: Table<SzemelyRecord, number>
  csalad!: Table<CsaladRecord, number>
  presbiter!: Table<PresbiterRecord, number>
  gyerek!: Table<GyerekRecord, number>
  felmentes!: Table<FelmentesRecord, number>

  // Pénzügy
  befizetes!: Table<BefizetesRecord, number>
  kiadas!: Table<KiadasRecord, number>
  bankszamlak!: Table<BankszamlakRecord, number>
  belsomozgas!: Table<BelsomozgasRecord, number>
  berleti_szerzodes!: Table<BerletiSzerzodesRecord, string>

  // Anyakönyv
  keresztseg!: Table<KeresztsegRecord, number>
  konfirmalas!: Table<KonfirmalasRecord, number>
  hazassag!: Table<HazassagRecord, number>
  temetes!: Table<TemetesRecord, number>

  // Munkanapló
  munkanaplo!: Table<MunkanaploRecord, number>

  // Iktató — uuid PK!
  iktato!: Table<IktatoRecord, string>
  iktato_sablonok!: Table<IktatoSablonRecord, string>

  // Leltár — uuid PK!
  leltar_tetelek!: Table<LeltarTetelRecord, string>

  // Sírhely (Fázis 5a)
  sirhelytemeto!: Table<SirhelytemetoRecord, number>
  sirhely!: Table<SirhelyRecord, number>
  sirhelyberles!: Table<SirhelyberlesRecord, number>
  sirhelyelhunyt!: Table<SirhelyelhunytRecord, number>

  // Jegyzőkönyvek (Fázis 5a) — UUID PK-k
  presbiteri_jegyzokonyvek!: Table<PresbiteriJegyzokonyvRecord, string>
  jegyzokonyv_resztvevok!: Table<JegyzokonyvResztvevoRecord, string>
  jegyzokonyv_napirendi_pontok!: Table<JegyzokonyvNapirendiPontRecord, string>
  jegyzokonyv_hatarozatok!: Table<JegyzokonyvHatarozatRecord, string>

  // Sync meta
  _sync_meta!: Table<SyncMetaRecord, string>
  _mutation_queue!: Table<MutationEnvelope, string>
  _conflicts!: Table<ConflictRecord, [string, string]>
  _fs_handles!: Table<FsHandleRecord, string>

  constructor() {
    super('kartoteka_offline')

    // v1 — alap séma (Fázis 0)
    // A Dexie stringek: első az `id` primary key, `&` unique, `+` autoinc
    // Index-ek: `congregation_id` mindenhol (scope filter), `_syncStatus` (queue),
    //           `updated_at` (delta pull cursor), `revision` (optimistic lock)
    this.version(1).stores({
      // Tagnyilvántartás
      szemely: 'id, congregation_id, updated_at, _syncStatus, cnp, type',
      csalad: 'id, congregation_id, updated_at, _syncStatus, id_ferfi, id_no',
      presbiter: 'id, congregation_id, updated_at, _syncStatus, id_szemely',
      gyerek: 'id, congregation_id, updated_at, _syncStatus, id_szemely',
      felmentes: 'id, congregation_id, updated_at, _syncStatus, id_szemely, id_csalad',

      // Pénzügy
      befizetes: 'id, congregation_id, updated_at, _syncStatus, datum, id_szemely, id_befizetescel, fizetettev',
      kiadas: 'id, congregation_id, updated_at, _syncStatus, datum, id_kiadascel',
      bankszamlak: 'id, congregation_id, updated_at, _syncStatus',
      belsomozgas: 'id, congregation_id, updated_at, _syncStatus, datum, tipus',
      berleti_szerzodes: 'id, congregation_id, updated_at, _syncStatus, aktiv, kezdet',

      // Anyakönyv
      keresztseg: 'id, congregation_id, updated_at, _syncStatus, id_szemely, datum',
      konfirmalas: 'id, congregation_id, updated_at, _syncStatus, id_szemely, mikor',
      hazassag: 'id, congregation_id, updated_at, _syncStatus, id_ferfi, id_no, datum',
      temetes: 'id, congregation_id, updated_at, _syncStatus, id_szemely, datum',

      // Munkanapló
      munkanaplo: 'id, congregation_id, updated_at, _syncStatus, idopont, kategoria',

      // Iktató
      iktato: 'id, congregation_id, updated_at, _syncStatus, year, sequence_number, direction, deleted',
      iktato_sablonok: 'id, congregation_id, updated_at, _syncStatus, tipus, aktiv',

      // Leltár
      leltar_tetelek: 'id, congregation_id, updated_at, _syncStatus, kategoria',

      // Sync meta
      _sync_meta: 'table, congregationId, lastPullAt, dirty',
      _mutation_queue: 'id, table, status, nextRetryAt, clientTimestamp',
      _conflicts: '[table+rowId], detectedAt, resolved',
      _fs_handles: 'key, savedAt',
    })

    // v2 — Fázis 5a: sirhely + jegyzokonyvek modulok
    // A v1 táblák változatlanok — csak új táblákat adunk hozzá.
    // Ezt ENYHE bővítésként kezeljük, nem igényel adatmigrációt.
    this.version(2).stores({
      // Sírhely — a valódi Database_schema.sql szerinti oszlopnevek
      sirhelytemeto: 'id, congregation_id, updated_at, _syncStatus, deleted, nev',
      sirhely: 'id, updated_at, _syncStatus, deleted, temetoid, allapot',
      sirhelyberles: 'id, updated_at, _syncStatus, deleted, sirhelyid, befizetesid, megvaltas, lejarata',
      sirhelyelhunyt: 'id, updated_at, _syncStatus, deleted, sirhelyid, temetesid, hdatum',

      // Jegyzőkönyvek — UUID PK, gyakran child-query: jegyzokonyv_id
      presbiteri_jegyzokonyvek: 'id, congregation_id, updated_at, _syncStatus, ev, ules_sorszam, datum, allapot',
      jegyzokonyv_resztvevok: 'id, jegyzokonyv_id, updated_at, _syncStatus',
      jegyzokonyv_napirendi_pontok: 'id, jegyzokonyv_id, updated_at, _syncStatus, sorszam',
      jegyzokonyv_hatarozatok: 'id, jegyzokonyv_id, updated_at, _syncStatus, ev, sorszam, allapot',
    })

    // v3 — Database_schema.sql alapján javított oszlopnevek
    // - konfirmalas: `mikor` → `datum` index
    // - temetes: `datum` index eltávolítva (nem létező mező), `hdatum` és `tdatum` hozzáadva
    // - leltar_tetelek: `is_deleted` index hozzáadva (a `deleted` alias mellett)
    // - iktato: már létező index marad (uuid stringként is működik)
    // A meglévő rekordok megmaradnak — csak az indexek frissülnek.
    this.version(3).stores({
      konfirmalas: 'id, congregation_id, updated_at, _syncStatus, id_szemely, datum',
      temetes: 'id, congregation_id, updated_at, _syncStatus, id_szemely, hdatum, tdatum',
      leltar_tetelek: 'id, congregation_id, updated_at, _syncStatus, kategoria, leltari_szam, is_deleted',
    })
  }
}

// ─────────────────────────────────────────────────────────────────
// Singleton export
// ─────────────────────────────────────────────────────────────────

let dbInstance: KartotekaDB | null = null

/**
 * Lazy singleton — csak a kliens-oldalon hívható. Server Component-ben NEM!
 * Csak 'use client' komponensek vagy browser-only modulok használhatják.
 */
export function getDb(): KartotekaDB {
  if (typeof window === 'undefined') {
    throw new Error('KartotekaDB csak a kliens-oldalon használható (nincs window objektum).')
  }
  if (!dbInstance) {
    dbInstance = new KartotekaDB()
  }
  return dbInstance
}

/**
 * A teljes cache wipe — scope-váltásnál (pl. god-mode override, logout, stb.).
 */
export async function wipeDb(): Promise<void> {
  if (typeof window === 'undefined') return
  const db = getDb()
  const tables = db.tables.map(t => t.name)
  await db.transaction('rw', db.tables, async () => {
    for (const tbl of tables) {
      await db.table(tbl).clear()
    }
  })
  // Töröljük a singleton-t is, hogy a következő getDb() fresh instance-et adjon
  dbInstance = null
}

/**
 * 2026-08-10 (biztonsági takarítás): EGYSZERI helyi cache-ürítés a korábban
 * IDEGEN gyülekezetektől letöltött soroknak.
 *
 * Háttér: a temetői táblák (`sirhely`, `sirhelyberles`, `sirhelyelhunyt`) a
 * registry-ben `scopeFilter: 'none'`-nal szerepelnek — vagyis a szűrésüket
 * KIZÁRÓLAG az adatbázis-oldali RLS végezte. Mivel ezeken a táblákon nyitott
 * (`USING (true)`) policy volt, a szinkron MINDEN gyülekezet sírhely-, bérlet-
 * és elhunyt-adatát letöltötte a böngésző helyi tárolójába. Az RLS-javítás
 * (2026-08-10-nyitott-rls-policyk-takaritas.sql) a jövőbeli letöltést
 * megszünteti, de a MÁR letöltött sorok a felhasználók gépén maradnának —
 * ezért ez az egyszeri, jelölővel védett törlés.
 *
 * A törölt táblák a következő szinkronnál újratöltődnek, immár helyesen szűrve.
 */
const LEAKED_CACHE_PURGE_KEY = 'kartoteka:offline-purge:2026-08-10-sirhely'
const LEAKED_CACHE_TABLES = ['sirhely', 'sirhelyberles', 'sirhelyelhunyt'] as const

export async function purgeLeakedOfflineCaches(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    if (window.localStorage.getItem(LEAKED_CACHE_PURGE_KEY)) return
  } catch {
    return // letiltott localStorage — ne fussunk körbe-körbe
  }

  try {
    const db = getDb()
    for (const table of LEAKED_CACHE_TABLES) {
      if (!db.tables.some((t) => t.name === table)) continue
      await db.table(table).clear()
      // A pull-kurzort is nullázzuk, hogy a teljes (immár szűrt) állomány
      // újratöltődjön, ne csak az azóta módosult sorok.
      const meta = await db._sync_meta.get(table)
      if (meta) await db._sync_meta.put({ ...meta, lastPullAt: null })
    }
    window.localStorage.setItem(LEAKED_CACHE_PURGE_KEY, new Date().toISOString())
  } catch (e) {
    console.warn('[offline] A helyi temetői cache ürítése nem sikerült:', e)
  }
}

/**
 * Sync meta lekérés egy táblára — ha nincs, default-tal tér vissza.
 */
export async function getSyncMeta(
  table: string,
  congregationId: string | null,
): Promise<SyncMetaRecord> {
  const db = getDb()
  const existing = await db._sync_meta.get(table)
  if (existing) return existing
  return {
    table,
    lastPullAt: null,
    lastPushAt: null,
    lastError: null,
    congregationId,
    schemaVersion: 1,
    dirty: false,
  }
}

/**
 * Sync meta frissítés.
 */
export async function setSyncMeta(meta: SyncMetaRecord): Promise<void> {
  const db = getDb()
  await db._sync_meta.put(meta)
}
