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
 *
 * ─────────────────────────────────────────────────────────────────
 * 2026-08-11 (P1-perf/adatvédelem) — MINDEN bejegyzés kap explicit `select`-et
 * ─────────────────────────────────────────────────────────────────
 * Korábban egyetlen bejegyzésen sem volt `select`, így a pull `SELECT *`-ot
 * küldött mind a 27 táblára. A `szemely`-nél ez azt jelentette, hogy a
 * base64-kódolt fényképet tároló `kep` oszlop is lejött MINDEN sorral —
 * ugyanaz az oszlop, amit a `tagnyilvantartas/actions.ts` kifejezetten kihagy
 * („a potenciálisan NAGY base64 `kep`"), és amit a lista-nézet a könnyű
 * `photo_url`-lel helyettesít. Egy 800 fős, fényképeket használó gyülekezetnél
 * ez a legelső pull-nál több tíz MB-ot írt az IndexedDB-be.
 *
 * A lista SZÁRMAZTATÁSA (ha új oszlopot kell felvenni, ezt kell újranézni):
 *   1. sync-infrastruktúra: `id`, `revision`, `updated_at`,
 *      `congregation_id` (csak ahol a tábla valóban tartalmazza),
 *   2. soft-delete jelző: `deleted`, ill. a `leltar_tetelek`-nél `is_deleted`
 *      (a Kuka nézet a `recycle-bin-actions.ts`-ben mindkettőt vizsgálja),
 *   3. az adott tábla Excel-séma mezői (`excel-schema/registry.ts` →
 *      `ExcelFieldDef.technical`) — ez az egyetlen konzumens, amely
 *      NÉV SZERINT olvas oszlopokat a Dexie-ből,
 *   4. a Kuka/Excel-diff címkéi (`recycle-bin-labels.ts`,
 *      `excel-import-diff.ts` `buildDisplayLabel`),
 *   5. a `db.ts` `*Record` interfészeiben deklarált mezők (ez a kliens-oldali
 *      szerződés a tábla tartalmára).
 * Minden más oszlopot KIHAGYUNK — a `full-backup.ts` nyers Dexie-dumpja is
 * csak azt tudja menteni, ami itt szerepel, ezért a lista bővítése olcsó,
 * a szűkítése viszont csak ezen szabályok mentén indokolt.
 *
 * FIGYELEM: nem létező oszlopnév PostgREST 42703 hibát ad, és a pull
 * SZÁNDÉKOSAN fail-closed (a kurzort nem lépteti) — a hiba a
 * „Kapcsolat nélküli mód" panelen `lastError`-ként jelenik meg.
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
  /**
   * 2026-08-14 (6. pont): a soft-delete jelző OSZLOPNEVE, ha nem `deleted`.
   * A `leltar_tetelek` az `is_deleted` nevet használja — e mező nélkül a
   * push soft-delete ága `deleted = true`-t próbálna írni, amit a PostgREST
   * 42703-mal (nincs ilyen oszlop) utasítana el.
   */
  softDeleteColumn?: string
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
    // 2026-08-11: KIHAGYVA a `kep` (base64 fénykép — helyette a könnyű
    // `photo_url` jön le), a `szig`/`taj` (személyi- és TB-szám: egyetlen
    // offline konzumens sem olvassa, viszont a legérzékenyebb PII), valamint a
    // `c_szcim`, `created`, `namepattern`, `befizetoev`, `family_id`, a
    // FK-azonosítók (`id_apja`, `id_anyja`, `sz_helyid`, `c_utcaid`,
    // `c_helysegid`) és a hozzájárulás-mezők (`gdpr_consent_at`,
    // `photo_consent`, `mailing_consent`, `voter_*`, `social_profil_url`).
    // Az `isvisible` BENNE MARAD: a `szemely`-nek nincs `deleted` oszlopa,
    // a kivezetést ez a jelző hordozza.
    select: [
      'id', 'revision', 'updated_at', 'congregation_id', 'isvisible',
      'cnp', 'csaladnev', 'k_nev', 'szcs_nev', 'ferjk_nev', 'sz_datum',
      'ferfi', 'meghalt', 'apjaneve', 'anyjaneve', 'csaladfo', 'allapot',
      'vallas', 'nemzetiseg', 'foglalkozas', 'c_szam', 'c_tombhaz',
      'c_lepcsohaz', 'c_emelet', 'c_ajto', 'telefon', 'email', 'type',
      'member_status', 'megjegyzes', 'photo_url',
    ].join(', '),
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
    // 2026-08-11: a `csalad` táblán NINCS `congregation_id` és `deleted` oszlop.
    select: [
      'id', 'revision', 'updated_at',
      'id_ferfi', 'id_no', 'c_utcaid', 'c_szam', 'c_tombhaz', 'c_lepcsohaz',
      'c_emelet', 'c_ajto', 'isaktiv',
    ].join(', '),
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
    // 2026-08-11: a `congregation_id` SZÁNDÉKOSAN kimarad — a hatókör az
    // id_szemely FK-n (és az RLS-en) keresztül érvényesül, a db.ts szerint
    // pedig a mező megbízhatatlan. Az Excel-séma `aktiv` mezője a valós
    // táblán NEM létezik, ezért nem is kérjük le.
    select: [
      'id', 'revision', 'updated_at',
      'id_szemely', 'tisztseg', 'korzet', 'korzetszamok', 'id_csoport',
    ].join(', '),
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
    // 2026-08-11: a `gyerek` tábla mindössze 5 oszlopos, congregation_id nélkül.
    select: ['id', 'revision', 'updated_at', 'id_csalad', 'id_szemely'].join(', '),
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
    // 2026-08-11: KIHAGYVA a `created` és a `congregation_id` (a hatókör az
    // id_szemely/id_csalad FK-n keresztül érvényesül, lásd presbiter).
    select: [
      'id', 'revision', 'updated_at',
      'id_csalad', 'id_szemely', 'felmento', 'datum', 'oka', 'kezdete', 'vege',
    ].join(', '),
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
    // 2026-08-14 (6. pont, BLOKKOLO-javitas): softDelete: true — a tabla
    // BIZONYITOTTAN soft-delete-elt (a select-ben ott a jelzo-oszlop, es az
    // uzleti kod is szuri), de a flag false-on allt, ezert a Kuka SOSEM
    // mutatta a torolt sorait, az op:'delete' pedig VEGLEGES DELETE-et
    // futtatott volna soft-delete helyett.
    softDelete: true,
    // 2026-08-11: KIHAGYVA a `created`, `userid`, `melleklet`, `synced`,
    // `stornozott_at/_indok/_by`, `dispozitie_id`. A `stornozott`,
    // `osszeg_ron` és `arfolyam` BENNE MARAD — nélkülük egyetlen offline
    // pénzügyi összesítés sem lehet helyes (devizás tétel + stornó).
    select: [
      'id', 'revision', 'updated_at', 'congregation_id', 'deleted',
      'xkey', 'id_csalad', 'id_szemely', 'forrasa', 'id_befizetescel',
      'datum', 'osszeg', 'osszeg_ron', 'arfolyam', 'nyugta', 'iratszam',
      'irattipus', 'csalad', 'fizetettev', 'bankszamla_id', 'is_potlas',
      'belso_mozgas_xkey', 'stornozott', 'megjegyzes',
    ].join(', '),
    module: 'penzugy',
    label: 'Befizetések',
    priority: 30,
  },
  {
    dexieTable: 'kiadas',
    supabaseTable: 'kiadas',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    // 2026-08-14 (6. pont, BLOKKOLO-javitas): softDelete: true — a tabla
    // BIZONYITOTTAN soft-delete-elt (a select-ben ott a jelzo-oszlop, es az
    // uzleti kod is szuri), de a flag false-on allt, ezert a Kuka SOSEM
    // mutatta a torolt sorait, az op:'delete' pedig VEGLEGES DELETE-et
    // futtatott volna soft-delete helyett.
    softDelete: true,
    // 2026-08-11: KIHAGYVA a `created`, `userid`, `melleklet`,
    // `kedvezmenyezett_cui`, `stornozott_at/_indok/_by`, `decont_id`,
    // `dispozitie_id`. A partner-oszlop `atvevo` (NEM `kedvezmenyzett`).
    select: [
      'id', 'revision', 'updated_at', 'congregation_id', 'deleted',
      'xkey', 'id_kiadascel', 'datum', 'osszeg', 'osszeg_ron', 'arfolyam',
      'nyugta', 'iratszam', 'irattipus', 'atvevo', 'atvevoid',
      'bankszamla_id', 'is_potlas', 'vonatkozo_idoszak', 'belso_mozgas_xkey',
      'stornozott', 'megjegyzes',
    ].join(', '),
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
    // 2026-08-11: KIHAGYVA a megjelenítési (`szin`, `ikon`, `is_default`) és
    // az egyházmegyei scope-mezők (`scope`, `diocese_id`) + `created_at`.
    select: [
      'id', 'revision', 'updated_at', 'congregation_id',
      'bank_neve', 'iban', 'valuta', 'nyito_egyenleg', 'aktiv',
    ].join(', '),
    module: 'penzugy',
    label: 'Bankszámlák',
    priority: 32,
  },
  {
    dexieTable: 'belsomozgas',
    supabaseTable: 'belsomozgas',
    primaryKey: 'id',
    scopeFilter: 'congregation_id',
    // 2026-08-14 (6. pont, BLOKKOLO-javitas): softDelete: true — a tabla
    // BIZONYITOTTAN soft-delete-elt (a select-ben ott a jelzo-oszlop, es az
    // uzleti kod is szuri), de a flag false-on allt, ezert a Kuka SOSEM
    // mutatta a torolt sorait, az op:'delete' pedig VEGLEGES DELETE-et
    // futtatott volna soft-delete helyett.
    softDelete: true,
    // 2026-08-11: KIHAGYVA a `created_by` és `created_at`. A `cel_osszeg` +
    // `arfolyam` benne marad (devizás átvezetés).
    select: [
      'id', 'revision', 'updated_at', 'congregation_id', 'deleted',
      'datum', 'tipus', 'forras', 'cel', 'osszeg', 'cel_osszeg', 'arfolyam',
      'megjegyzes',
    ].join(', '),
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
    // 2026-08-11: KIHAGYVA a `created_at`, `userid` és a teljes Oblio-blokk
    // (`oblio_auto_szamlaz`, `oblio_klienesseg_id`, `oblio_termek_kod`),
    // valamint a `jogi_tipus`, `ceg_adoszam`, `telekkonyvi_szam`.
    select: [
      'id', 'revision', 'updated_at', 'congregation_id', 'deleted',
      'berlo_nev', 'ceg_nev', 'id_szemely', 'targy', 'leiras', 'tipus',
      'osszeg', 'fizetesi_ciklus', 'kezdet', 'vege', 'id_szamadasicel',
      'leltari_szam', 'aktiv', 'megjegyzes',
    ].join(', '),
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
    // 2026-08-11: KIHAGYVA az `alapige` (csak a munkanapló-nézet olvassa).
    select: [
      'id', 'revision', 'updated_at', 'congregation_id',
      'id_szemely', 'datum', 'lelkeszneve', 'okirat', 'egyhazi_szam',
      'keresztszulok', 'megjegyzes', 'munkanaploba', 'helyid', 'munkanaplo_id',
    ].join(', '),
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
    // 2026-08-11: a tábla dátum-oszlopa `datum` (NEM `mikor`).
    select: [
      'id', 'revision', 'updated_at', 'congregation_id',
      'id_szemely', 'datum', 'lelkeszneve', 'keresztelesideje', 'okirat',
      'egyhazi_szam', 'megjegyzes', 'helyid', 'munkanaplo_id',
    ].join(', '),
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
    // 2026-08-11: KIHAGYVA a `vegyes` (vegyes házasság jelző — offline nem olvassuk).
    select: [
      'id', 'revision', 'updated_at', 'congregation_id',
      'id_ferfi', 'id_no', 'datum', 'lelkeszneve', 'hlevel', 'egyhazi_szam',
      'tanuk', 'megjegyzes', 'munkanaploba', 'helyid', 'munkanaplo_id',
    ].join(', '),
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
    // 2026-08-11: a temetés dátuma `tdatum`, a halálé `hdatum` — NINCS `datum`.
    select: [
      'id', 'revision', 'updated_at', 'congregation_id',
      'id_szemely', 'hdatum', 'hoka', 'tdatum', 'lelkeszneve', 'okirat',
      'egyhazi_szam', 'megjegyzes', 'munkanaploba', 'hhelyid', 'thelyid',
      'munkanaplo_id',
    ].join(', '),
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
    // 2026-08-14 (6. pont, BLOKKOLO-javitas): softDelete: true — a tabla
    // BIZONYITOTTAN soft-delete-elt (a select-ben ott a jelzo-oszlop, es az
    // uzleti kod is szuri), de a flag false-on allt, ezert a Kuka SOSEM
    // mutatta a torolt sorait, az op:'delete' pedig VEGLEGES DELETE-et
    // futtatott volna soft-delete helyett.
    softDelete: true,
    // 2026-08-11: KIHAGYVA a `created`.
    select: [
      'id', 'revision', 'updated_at', 'congregation_id', 'deleted',
      'idopont', 'kategoria', 'jellege', 'id_jellege', 'bibliaolvasas',
      'alapige', 'cim', 'enekek', 'jelenlet_ferfi', 'jelenlet_no',
      'jelenlet_gyermek', 'jelenlet_osszesen', 'szolgalt', 'persely',
      // 2026-08-14 (18. pont): napszak + uv_* — az oszlopok ÉLESBEN léteznek
      // (2026-07-11-es F1-migráció, az OSSZKEP-ellenőrzésből igazolva), a
      // desktop-tükör már eddig is szinkronizálta őket; a webes offline
      // másolat eddig e nélkül járt.
      'megjegyzes', 'mediapath', 'du', 'napszak', 'uv_templomban', 'uv_betegnel',
    ].join(', '),
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
    // 2026-08-11: KIHAGYVA a `created_at`, `userid` és az F8-as bővítmények
    // (`external_ref_*`, `beerkezes_ideje`, `mellekletek_szama`,
    // `valasz_iktatoszam`, `ugykor_kod`, `retention_type`, `has_duplicate`).
    select: [
      'id', 'revision', 'updated_at', 'congregation_id', 'deleted',
      'year', 'sequence_number', 'direction', 'subject', 'sender_or_recipient',
      'file_folder', 'kelt', 'targykivonat', 'elintezes_ideje',
      'elintezes_modja', 'irattarijel', 'oldalszam', 'megjegyzes',
    ].join(', '),
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
    // 2026-08-11: KIHAGYVA a `created_by`, `created_at`.
    select: [
      'id', 'revision', 'updated_at', 'congregation_id', 'deleted',
      'nev', 'tipus', 'leiras', 'tartalom', 'aktiv', 'sorrend',
    ].join(', '),
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
    // 2026-08-14 (6. pont, BLOKKOLO-javitas): softDelete: true — a tabla
    // BIZONYITOTTAN soft-delete-elt (a select-ben ott a jelzo-oszlop, es az
    // uzleti kod is szuri), de a flag false-on allt, ezert a Kuka SOSEM
    // mutatta a torolt sorait, az op:'delete' pedig VEGLEGES DELETE-et
    // futtatott volna soft-delete helyett.
    softDelete: true,
    softDeleteColumn: 'is_deleted',
    // 2026-08-11: a soft-delete jelző itt `is_deleted` (NEM `deleted`).
    // KIHAGYVA a `created_at`, `userid`, `penzugy_xkey`, `regi_leltari_szam`,
    // a törlési blokk (`torles_datuma`, `torles_bizonylat`, `torles_indoklasa`)
    // és a könyvtári blokk (`konyv_*`, `szerzo`).
    select: [
      'id', 'revision', 'updated_at', 'congregation_id', 'is_deleted',
      'kategoria', 'megnevezes', 'leltari_szam', 'helyszin',
      'felelos_szemely_id', 'felelos_neve', 'beszerzes_datuma',
      'beszerzes_bizonylat', 'beszerzesi_ertek', 'mennyiseg', 'mertekegyseg',
      'katalogus_kod', 'hasznalati_ido_ev', 'megjegyzes',
    ].join(', '),
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
    // 2026-08-11: KIHAGYVA a `created_at`.
    select: [
      'id', 'revision', 'updated_at', 'congregation_id', 'deleted',
      'nev', 'cim', 'aktiv', 'megjegyzes',
    ].join(', '),
    module: 'sirhely',
    label: 'Temetők',
    priority: 80,
  },
  // ⚠️ 2026-08-10 (biztonsági tanulság): a `scopeFilter: 'none'` azt jelenti,
  // hogy a kliens SZŰRETLEN SELECT-et küld, és a gyülekezet-hatókört KIZÁRÓLAG
  // az adatbázis-oldali RLS adja. Ha ott bármelyik táblán nyitott
  // (`USING (true)`) policy van, a szinkron MINDEN gyülekezet adatát letölti a
  // böngésző helyi tárolójába — pontosan ez történt az alábbi három temetői
  // táblával. ÚJ tábla felvételekor: vagy legyen `congregation_id` szűrés,
  // vagy előbb ELLENŐRIZD a tábla RLS-policy-jét (nincs-e `USING (true)`).
  {
    // sirhely-nek NINCS congregation_id mezője — a temetoid FK-n keresztül
    // szűrhető az ahhoz tartozó sirhelytemeto.congregation_id alapján
    dexieTable: 'sirhely',
    supabaseTable: 'sirhely',
    primaryKey: 'id',
    scopeFilter: 'none',
    softDelete: true,
    // 2026-08-11: KIHAGYVA a `created_at`. NINCS `congregation_id` oszlop.
    select: [
      'id', 'revision', 'updated_at', 'deleted',
      'temetoid', 'parcella', 'sor', 'szam', 'elhelyezkedes', 'meret',
      'tipus', 'allapot', 'aktivberlesid', 'imagelnk', 'gps_lat', 'gps_lng',
      'megjegyzes',
    ].join(', '),
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
    // 2026-08-11: KIHAGYVA a `created_at`.
    select: [
      'id', 'revision', 'updated_at', 'deleted',
      'sirhelyid', 'befizetesid', 'megvaltas', 'lejarata', 'berlo', 'berloid',
      'berlocim', 'berloelerhetoseg', 'tipus', 'osszeg', 'megjegyzes',
    ].join(', '),
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
    // 2026-08-11: KIHAGYVA az `id_szemely` (nem olvassa offline konzumens).
    select: [
      'id', 'revision', 'updated_at', 'deleted',
      'sirhelyid', 'temetesid', 'nev', 'sznev', 'ferfi', 'sz_datum',
      'sz_hely', 'anyjaneve', 'hdatum', 'hhely', 'tdatum', 'ttipus',
      'tmodja', 'elhelyezkedes', 'temetteto', 'szolgaltato', 'megjegyzes',
    ].join(', '),
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
    // 2026-08-11: KIHAGYVA a `created_at` és a `hatarozatkepesseg`.
    select: [
      'id', 'revision', 'updated_at', 'congregation_id',
      'ev', 'ules_sorszam', 'tipus', 'datum', 'hely', 'kezdes', 'zaras',
      'elnok_neve', 'jegyzo_neve', 'hitelesito1', 'hitelesito2', 'igevers',
      'felolvasas', 'megjegyzes', 'allapot',
    ].join(', '),
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
    // 2026-08-11: a tábla mind a 7 oszlopa kell (nincs congregation_id).
    select: [
      'id', 'revision', 'updated_at',
      'jegyzokonyv_id', 'nev', 'statusz', 'szerep',
    ].join(', '),
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
    // 2026-08-11: a tábla mind a 11 oszlopa kell (nincs congregation_id).
    select: [
      'id', 'revision', 'updated_at',
      'jegyzokonyv_id', 'sorszam', 'cim', 'eloado', 'targyalas',
      'szavazas_igen', 'szavazas_nem', 'szavazas_tartozkodo',
    ].join(', '),
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
    // 2026-08-11: a tábla mind a 11 oszlopa kell (nincs congregation_id).
    select: [
      'id', 'revision', 'updated_at',
      'jegyzokonyv_id', 'napirendi_pont_id', 'ev', 'sorszam', 'szoveg',
      'felelos', 'hatarido', 'allapot',
    ].join(', '),
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
