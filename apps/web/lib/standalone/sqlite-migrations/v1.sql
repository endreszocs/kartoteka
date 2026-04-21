-- =====================================================================
-- KARTOTEKA SQLite séma — v1
-- =====================================================================
-- A 26 offline-tracked tábla lokális tükörképe, + 3 meta tábla (mutation
-- queue, sync meta, conflicts). A Supabase Database_schema.sql alapján,
-- SQLite-kompatibilis típusokkal.
--
-- KÜLÖNBSÉGEK a Supabase-hez képest:
--   - UUID helyett TEXT (SQLite nem ismeri az uuid típust)
--   - BIGINT helyett INTEGER (SQLite INTEGER 8-byte)
--   - TIMESTAMPTZ helyett TEXT (ISO 8601 string)
--   - JSONB helyett TEXT (JSON-ként szerializált)
--   - NEM tesszük fel a FK constraint-eket (SQLite támogatja, de offline
--     környezetben a pull-sync miatt a children előbb jöhet mint a parent,
--     és az integrity check mindig futtatható)
--
-- INDEXEK:
--   - Minden táblán `congregation_id` (ahol van) + `updated_at` index
--   - Child-táblákon a parent FK oszlop index
--   - Soft-delete oszlop index (`deleted` vagy `is_deleted`)
-- =====================================================================

-- WAL mode bekapcsolása (crash-safe)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = OFF;
PRAGMA synchronous = NORMAL;

-- ─────────────────────────────────────────────────────────────────
-- META TÁBLÁK
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS _sync_meta (
  table_name TEXT PRIMARY KEY,
  last_pull_at TEXT,      -- ISO timestamp
  last_push_at TEXT,
  last_error TEXT,
  dirty INTEGER DEFAULT 0 -- 0 = szinkron, 1 = van push-olnivaló
);

CREATE TABLE IF NOT EXISTS _mutation_queue (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  op TEXT NOT NULL,         -- insert | update | delete
  payload TEXT NOT NULL,    -- JSON
  base_revision INTEGER,
  client_timestamp INTEGER NOT NULL,
  retry_count INTEGER DEFAULT 0,
  next_retry_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|syncing|failed|conflict|dead
  error_msg TEXT
);
CREATE INDEX IF NOT EXISTS idx_mutation_queue_status ON _mutation_queue(status, next_retry_at);

CREATE TABLE IF NOT EXISTS _conflicts (
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  local_payload TEXT NOT NULL,
  server_payload TEXT NOT NULL,
  base_payload TEXT,
  detected_at INTEGER NOT NULL,
  resolved INTEGER DEFAULT 0,
  PRIMARY KEY (table_name, row_id)
);

-- ─────────────────────────────────────────────────────────────────
-- TAGNYILVÁNTARTÁS
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS szemely (
  id INTEGER PRIMARY KEY,
  cnp TEXT NOT NULL,
  szcs_nev TEXT, k_nev TEXT, csaladnev TEXT, ferjk_nev TEXT,
  allapot TEXT, apjaneve TEXT, id_apja TEXT, anyjaneve TEXT, id_anyja TEXT,
  csaladfo INTEGER NOT NULL DEFAULT 0, ferfi INTEGER NOT NULL DEFAULT 0, meghalt INTEGER NOT NULL DEFAULT 0,
  sz_datum TEXT, sz_helyid INTEGER, vallas TEXT, foglalkozas TEXT, nemzetiseg TEXT,
  c_utcaid INTEGER NOT NULL, c_szam TEXT, c_tombhaz TEXT, c_lepcsohaz TEXT, c_ajto TEXT, c_emelet TEXT, c_szcim TEXT,
  telefon TEXT, email TEXT, befizetoev INTEGER NOT NULL DEFAULT 0, megjegyzes TEXT,
  isvisible INTEGER NOT NULL DEFAULT 1, kep TEXT, type TEXT NOT NULL,
  created TEXT, namepattern TEXT, szig TEXT, taj TEXT,
  congregation_id TEXT, family_id TEXT, member_status TEXT DEFAULT 'aktív',
  voter_eligible INTEGER DEFAULT 0, photo_url TEXT, c_helysegid INTEGER,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_szemely_cong ON szemely(congregation_id);
CREATE INDEX IF NOT EXISTS idx_szemely_updated ON szemely(updated_at);
CREATE INDEX IF NOT EXISTS idx_szemely_cnp ON szemely(cnp);

CREATE TABLE IF NOT EXISTS csalad (
  id INTEGER PRIMARY KEY,
  id_ferfi INTEGER, id_no INTEGER,
  c_utcaid INTEGER NOT NULL, c_szam TEXT NOT NULL,
  c_tombhaz TEXT, c_lepcsohaz TEXT, c_ajto TEXT, c_emelet TEXT,
  id_csoport INTEGER, isaktiv INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_csalad_updated ON csalad(updated_at);
CREATE INDEX IF NOT EXISTS idx_csalad_ferfi ON csalad(id_ferfi);
CREATE INDEX IF NOT EXISTS idx_csalad_no ON csalad(id_no);

CREATE TABLE IF NOT EXISTS presbiter (
  id INTEGER PRIMARY KEY,
  id_szemely INTEGER NOT NULL,
  tisztseg TEXT NOT NULL,
  korzet TEXT, korzetszamok TEXT,
  id_csoport INTEGER,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_presbiter_szemely ON presbiter(id_szemely);
CREATE INDEX IF NOT EXISTS idx_presbiter_updated ON presbiter(updated_at);

CREATE TABLE IF NOT EXISTS gyerek (
  id INTEGER PRIMARY KEY,
  id_csalad INTEGER NOT NULL,
  id_szemely INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gyerek_csalad ON gyerek(id_csalad);
CREATE INDEX IF NOT EXISTS idx_gyerek_szemely ON gyerek(id_szemely);

CREATE TABLE IF NOT EXISTS felmentes (
  id INTEGER PRIMARY KEY,
  id_csalad INTEGER, id_szemely INTEGER,
  felmento TEXT NOT NULL, datum TEXT NOT NULL, oka TEXT NOT NULL,
  kezdete INTEGER, vege INTEGER,
  created TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_felmentes_szemely ON felmentes(id_szemely);
CREATE INDEX IF NOT EXISTS idx_felmentes_csalad ON felmentes(id_csalad);

-- ─────────────────────────────────────────────────────────────────
-- PÉNZÜGY
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS befizetes (
  id INTEGER PRIMARY KEY,
  xkey TEXT NOT NULL,
  id_csalad INTEGER, id_szemely INTEGER,
  forrasa TEXT NOT NULL, id_befizetescel INTEGER NOT NULL,
  datum TEXT NOT NULL, osszeg REAL NOT NULL,
  nyugta TEXT NOT NULL, iratszam TEXT NOT NULL, irattipus TEXT NOT NULL,
  csalad INTEGER NOT NULL DEFAULT 0, megjegyzes TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  created TEXT, fizetettev INTEGER NOT NULL,
  userid TEXT NOT NULL, melleklet INTEGER,
  synced INTEGER DEFAULT 0,
  congregation_id TEXT,
  is_potlas INTEGER DEFAULT 0,
  bankszamla_id INTEGER,
  belso_mozgas_xkey TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_befizetes_cong ON befizetes(congregation_id);
CREATE INDEX IF NOT EXISTS idx_befizetes_updated ON befizetes(updated_at);
CREATE INDEX IF NOT EXISTS idx_befizetes_datum ON befizetes(datum);
CREATE INDEX IF NOT EXISTS idx_befizetes_deleted ON befizetes(deleted);
CREATE INDEX IF NOT EXISTS idx_befizetes_szemely ON befizetes(id_szemely);

CREATE TABLE IF NOT EXISTS kiadas (
  id INTEGER PRIMARY KEY,
  xkey TEXT NOT NULL,
  id_kiadascel INTEGER NOT NULL,
  datum TEXT NOT NULL, osszeg REAL NOT NULL,
  nyugta TEXT NOT NULL, iratszam TEXT NOT NULL, irattipus TEXT NOT NULL,
  megjegyzes TEXT, created TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  atvevo TEXT, atvevoid INTEGER,
  userid TEXT NOT NULL, melleklet INTEGER,
  congregation_id TEXT,
  is_potlas INTEGER DEFAULT 0,
  bankszamla_id INTEGER,
  vonatkozo_idoszak TEXT,
  belso_mozgas_xkey TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_kiadas_cong ON kiadas(congregation_id);
CREATE INDEX IF NOT EXISTS idx_kiadas_updated ON kiadas(updated_at);
CREATE INDEX IF NOT EXISTS idx_kiadas_datum ON kiadas(datum);
CREATE INDEX IF NOT EXISTS idx_kiadas_deleted ON kiadas(deleted);

CREATE TABLE IF NOT EXISTS bankszamlak (
  id INTEGER PRIMARY KEY,
  congregation_id TEXT NOT NULL,
  bank_neve TEXT NOT NULL, iban TEXT, valuta TEXT DEFAULT 'RON',
  aktiv INTEGER DEFAULT 1, nyito_egyenleg REAL DEFAULT 0,
  created_at TEXT,
  szin TEXT DEFAULT '#206bc4', is_default INTEGER DEFAULT 0,
  ikon TEXT DEFAULT 'building-2',
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bankszamlak_cong ON bankszamlak(congregation_id);
CREATE INDEX IF NOT EXISTS idx_bankszamlak_updated ON bankszamlak(updated_at);

CREATE TABLE IF NOT EXISTS belsomozgas (
  id INTEGER PRIMARY KEY,
  congregation_id TEXT NOT NULL,
  datum TEXT NOT NULL, tipus TEXT NOT NULL,
  forras TEXT NOT NULL, cel TEXT NOT NULL, osszeg REAL NOT NULL,
  cel_osszeg REAL, arfolyam REAL,
  megjegyzes TEXT,
  created_by TEXT, created_at TEXT,
  deleted INTEGER DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_belsomozgas_cong ON belsomozgas(congregation_id);
CREATE INDEX IF NOT EXISTS idx_belsomozgas_updated ON belsomozgas(updated_at);
CREATE INDEX IF NOT EXISTS idx_belsomozgas_datum ON belsomozgas(datum);

CREATE TABLE IF NOT EXISTS berleti_szerzodes (
  id TEXT PRIMARY KEY,   -- uuid
  congregation_id TEXT NOT NULL,
  berlo_nev TEXT NOT NULL, id_szemely INTEGER,
  targy TEXT, leiras TEXT NOT NULL,
  tipus TEXT DEFAULT 'terulet',
  osszeg REAL NOT NULL, fizetesi_ciklus TEXT DEFAULT 'eves',
  kezdet TEXT NOT NULL, vege TEXT,
  id_szamadasicel TEXT DEFAULT '104.05',
  leltari_szam TEXT, telekkonyvi_szam TEXT,
  ceg_nev TEXT, ceg_adoszam TEXT,
  aktiv INTEGER DEFAULT 1, megjegyzes TEXT,
  created_at TEXT, userid TEXT,
  deleted INTEGER DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_berleti_cong ON berleti_szerzodes(congregation_id);
CREATE INDEX IF NOT EXISTS idx_berleti_updated ON berleti_szerzodes(updated_at);
CREATE INDEX IF NOT EXISTS idx_berleti_aktiv ON berleti_szerzodes(aktiv);

-- ─────────────────────────────────────────────────────────────────
-- ANYAKÖNYV
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS keresztseg (
  id INTEGER PRIMARY KEY,
  id_szemely INTEGER NOT NULL,
  datum TEXT NOT NULL,
  lelkeszneve TEXT, okirat TEXT, keresztszulok TEXT,
  megjegyzes TEXT,
  munkanaploba INTEGER NOT NULL DEFAULT 0,
  helyid INTEGER, congregation_id TEXT, munkanaplo_id INTEGER,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_keresztseg_cong ON keresztseg(congregation_id);
CREATE INDEX IF NOT EXISTS idx_keresztseg_updated ON keresztseg(updated_at);
CREATE INDEX IF NOT EXISTS idx_keresztseg_datum ON keresztseg(datum);
CREATE INDEX IF NOT EXISTS idx_keresztseg_szemely ON keresztseg(id_szemely);

CREATE TABLE IF NOT EXISTS konfirmalas (
  id INTEGER PRIMARY KEY,
  id_szemely INTEGER NOT NULL,
  datum TEXT NOT NULL,
  lelkeszneve TEXT, keresztelesideje TEXT,
  megjegyzes TEXT,
  helyid INTEGER, congregation_id TEXT, munkanaplo_id INTEGER,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_konfirmalas_cong ON konfirmalas(congregation_id);
CREATE INDEX IF NOT EXISTS idx_konfirmalas_updated ON konfirmalas(updated_at);
CREATE INDEX IF NOT EXISTS idx_konfirmalas_datum ON konfirmalas(datum);

CREATE TABLE IF NOT EXISTS hazassag (
  id INTEGER PRIMARY KEY,
  id_ferfi INTEGER NOT NULL, id_no INTEGER NOT NULL,
  datum TEXT NOT NULL,
  lelkeszneve TEXT, hlevel TEXT, tanuk TEXT,
  megjegyzes TEXT,
  munkanaploba INTEGER NOT NULL DEFAULT 0,
  helyid INTEGER, congregation_id TEXT, munkanaplo_id INTEGER,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hazassag_cong ON hazassag(congregation_id);
CREATE INDEX IF NOT EXISTS idx_hazassag_updated ON hazassag(updated_at);
CREATE INDEX IF NOT EXISTS idx_hazassag_datum ON hazassag(datum);

CREATE TABLE IF NOT EXISTS temetes (
  id INTEGER PRIMARY KEY,
  id_szemely INTEGER NOT NULL,
  hdatum TEXT NOT NULL, hoka TEXT,
  tdatum TEXT NOT NULL,
  lelkeszneve TEXT, okirat TEXT,
  megjegyzes TEXT,
  munkanaploba INTEGER NOT NULL DEFAULT 0,
  hhelyid INTEGER, thelyid INTEGER,
  congregation_id TEXT, munkanaplo_id INTEGER,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_temetes_cong ON temetes(congregation_id);
CREATE INDEX IF NOT EXISTS idx_temetes_updated ON temetes(updated_at);
CREATE INDEX IF NOT EXISTS idx_temetes_hdatum ON temetes(hdatum);
CREATE INDEX IF NOT EXISTS idx_temetes_tdatum ON temetes(tdatum);

-- ─────────────────────────────────────────────────────────────────
-- MUNKANAPLÓ
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS munkanaplo (
  id INTEGER PRIMARY KEY,
  idopont TEXT,
  jellege TEXT, id_jellege TEXT,
  bibliaolvasas TEXT, alapige TEXT, cim TEXT, enekek TEXT,
  jelenlet_ferfi INTEGER, jelenlet_no INTEGER, jelenlet_gyermek INTEGER,
  szolgalt TEXT, persely REAL, megjegyzes TEXT,
  created TEXT,
  jelenlet_osszesen INTEGER NOT NULL DEFAULT 0,
  mediapath TEXT,
  congregation_id TEXT,
  kategoria TEXT DEFAULT 'szolgalat',
  du INTEGER DEFAULT 0,
  deleted INTEGER DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_munkanaplo_cong ON munkanaplo(congregation_id);
CREATE INDEX IF NOT EXISTS idx_munkanaplo_updated ON munkanaplo(updated_at);
CREATE INDEX IF NOT EXISTS idx_munkanaplo_idopont ON munkanaplo(idopont);
CREATE INDEX IF NOT EXISTS idx_munkanaplo_kategoria ON munkanaplo(kategoria);

-- ─────────────────────────────────────────────────────────────────
-- IKTATÓ
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS iktato (
  id TEXT PRIMARY KEY,    -- uuid
  congregation_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  sequence_number INTEGER NOT NULL,
  direction TEXT,
  subject TEXT NOT NULL,
  sender_or_recipient TEXT, file_folder TEXT,
  created_at TEXT, kelt TEXT,
  targykivonat TEXT,
  elintezes_ideje TEXT, elintezes_modja TEXT,
  irattarijel TEXT, oldalszam INTEGER,
  megjegyzes TEXT,
  deleted INTEGER DEFAULT 0, userid TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_iktato_cong ON iktato(congregation_id);
CREATE INDEX IF NOT EXISTS idx_iktato_updated ON iktato(updated_at);
CREATE INDEX IF NOT EXISTS idx_iktato_year ON iktato(year, sequence_number);

CREATE TABLE IF NOT EXISTS iktato_sablonok (
  id TEXT PRIMARY KEY,    -- uuid
  congregation_id TEXT NOT NULL,
  nev TEXT NOT NULL, tipus TEXT NOT NULL DEFAULT 'egyeb',
  leiras TEXT, tartalom TEXT NOT NULL,
  aktiv INTEGER DEFAULT 1, sorrend INTEGER DEFAULT 0,
  created_by TEXT, created_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted INTEGER DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_iktato_sablonok_cong ON iktato_sablonok(congregation_id);
CREATE INDEX IF NOT EXISTS idx_iktato_sablonok_updated ON iktato_sablonok(updated_at);

-- ─────────────────────────────────────────────────────────────────
-- LELTÁR
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS leltar_tetelek (
  id TEXT PRIMARY KEY,    -- uuid
  congregation_id TEXT NOT NULL,
  kategoria TEXT NOT NULL, megnevezes TEXT NOT NULL, leltari_szam TEXT NOT NULL,
  helyszin TEXT,
  felelos_szemely_id INTEGER, felelos_neve TEXT,
  beszerzes_datuma TEXT, beszerzes_bizonylat TEXT,
  beszerzesi_ertek REAL DEFAULT 0,
  mennyiseg REAL DEFAULT 1, mertekegyseg TEXT DEFAULT 'db',
  katalogus_kod TEXT,
  hasznalati_ido_ev INTEGER,
  torles_datuma TEXT, torles_bizonylat TEXT, torles_indoklasa TEXT,
  is_deleted INTEGER DEFAULT 0, megjegyzes TEXT,
  created_at TEXT, userid TEXT,
  szerzo TEXT, regi_leltari_szam TEXT, penzugy_xkey TEXT,
  konyv_isbn TEXT, konyv_kiado TEXT, konyv_kiadas_helye TEXT,
  konyv_kiadas_eve INTEGER, konyv_terjedelem TEXT, konyv_sorozatcim TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_leltar_cong ON leltar_tetelek(congregation_id);
CREATE INDEX IF NOT EXISTS idx_leltar_updated ON leltar_tetelek(updated_at);
CREATE INDEX IF NOT EXISTS idx_leltar_kategoria ON leltar_tetelek(kategoria);
CREATE INDEX IF NOT EXISTS idx_leltar_is_deleted ON leltar_tetelek(is_deleted);

-- ─────────────────────────────────────────────────────────────────
-- SÍRHELY (4 tábla)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sirhelytemeto (
  id INTEGER PRIMARY KEY,
  nev TEXT NOT NULL,
  megjegyzes TEXT, congregation_id TEXT, cim TEXT,
  aktiv INTEGER DEFAULT 1, deleted INTEGER DEFAULT 0,
  created_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sirhelytemeto_cong ON sirhelytemeto(congregation_id);
CREATE INDEX IF NOT EXISTS idx_sirhelytemeto_updated ON sirhelytemeto(updated_at);

CREATE TABLE IF NOT EXISTS sirhely (
  id INTEGER PRIMARY KEY,
  parcella TEXT NOT NULL, sor INTEGER NOT NULL, szam TEXT NOT NULL,
  elhelyezkedes TEXT, meret TEXT, tipus TEXT, megjegyzes TEXT,
  aktivberlesid INTEGER, temetoid INTEGER NOT NULL,
  imagelnk TEXT,
  allapot TEXT DEFAULT 'szabad',
  gps_lat REAL, gps_lng REAL,
  deleted INTEGER DEFAULT 0, created_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sirhely_temeto ON sirhely(temetoid);
CREATE INDEX IF NOT EXISTS idx_sirhely_updated ON sirhely(updated_at);
CREATE INDEX IF NOT EXISTS idx_sirhely_allapot ON sirhely(allapot);

CREATE TABLE IF NOT EXISTS sirhelyberles (
  id INTEGER PRIMARY KEY,
  sirhelyid INTEGER NOT NULL, befizetesid INTEGER,
  megvaltas TEXT NOT NULL, lejarata TEXT,
  megjegyzes TEXT,
  berlo TEXT, berloid INTEGER, berlocim TEXT, berloelerhetoseg TEXT,
  tipus TEXT DEFAULT 'berles', osszeg REAL,
  deleted INTEGER DEFAULT 0, created_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sirhelyberles_sirhely ON sirhelyberles(sirhelyid);
CREATE INDEX IF NOT EXISTS idx_sirhelyberles_updated ON sirhelyberles(updated_at);

CREATE TABLE IF NOT EXISTS sirhelyelhunyt (
  id INTEGER PRIMARY KEY,
  temetesid INTEGER, sirhelyid INTEGER NOT NULL,
  sz_datum TEXT, sz_hely TEXT,
  ferfi INTEGER,
  anyjaneve TEXT,
  hdatum TEXT, hhely TEXT,
  tdatum TEXT, ttipus TEXT, tmodja TEXT,
  elhelyezkedes TEXT, temetteto TEXT, szolgaltato TEXT,
  megjegyzes TEXT,
  nev TEXT, sznev TEXT,
  deleted INTEGER DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sirhelyelhunyt_sirhely ON sirhelyelhunyt(sirhelyid);
CREATE INDEX IF NOT EXISTS idx_sirhelyelhunyt_updated ON sirhelyelhunyt(updated_at);

-- ─────────────────────────────────────────────────────────────────
-- JEGYZŐKÖNYVEK (4 tábla, uuid PK-kal)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS presbiteri_jegyzokonyvek (
  id TEXT PRIMARY KEY,    -- uuid
  congregation_id TEXT NOT NULL,
  tipus TEXT NOT NULL DEFAULT 'presbiteri',
  ev INTEGER NOT NULL, ules_sorszam INTEGER NOT NULL,
  datum TEXT NOT NULL,
  hely TEXT, kezdes TEXT, zaras TEXT,
  hatarozatkepesseg INTEGER DEFAULT 1,
  elnok_neve TEXT, jegyzo_neve TEXT,
  hitelesito1 TEXT, hitelesito2 TEXT,
  allapot TEXT NOT NULL DEFAULT 'draft',
  megjegyzes TEXT,
  created_at TEXT,
  igevers TEXT, felolvasas TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pjk_cong ON presbiteri_jegyzokonyvek(congregation_id);
CREATE INDEX IF NOT EXISTS idx_pjk_updated ON presbiteri_jegyzokonyvek(updated_at);
CREATE INDEX IF NOT EXISTS idx_pjk_ev ON presbiteri_jegyzokonyvek(ev, ules_sorszam);

CREATE TABLE IF NOT EXISTS jegyzokonyv_resztvevok (
  id TEXT PRIMARY KEY,    -- uuid
  jegyzokonyv_id TEXT NOT NULL,
  nev TEXT NOT NULL,
  statusz TEXT NOT NULL DEFAULT 'jelen',
  szerep TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jk_resztvevok_jk ON jegyzokonyv_resztvevok(jegyzokonyv_id);
CREATE INDEX IF NOT EXISTS idx_jk_resztvevok_updated ON jegyzokonyv_resztvevok(updated_at);

CREATE TABLE IF NOT EXISTS jegyzokonyv_napirendi_pontok (
  id TEXT PRIMARY KEY,    -- uuid
  jegyzokonyv_id TEXT NOT NULL,
  sorszam INTEGER NOT NULL,
  cim TEXT NOT NULL,
  eloado TEXT, targyalas TEXT,
  szavazas_igen INTEGER DEFAULT 0,
  szavazas_nem INTEGER DEFAULT 0,
  szavazas_tartozkodo INTEGER DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jk_np_jk ON jegyzokonyv_napirendi_pontok(jegyzokonyv_id);
CREATE INDEX IF NOT EXISTS idx_jk_np_updated ON jegyzokonyv_napirendi_pontok(updated_at);

CREATE TABLE IF NOT EXISTS jegyzokonyv_hatarozatok (
  id TEXT PRIMARY KEY,    -- uuid
  jegyzokonyv_id TEXT NOT NULL,
  napirendi_pont_id TEXT,
  sorszam INTEGER NOT NULL, ev INTEGER NOT NULL,
  szoveg TEXT NOT NULL,
  felelos TEXT, hatarido TEXT,
  allapot TEXT DEFAULT 'elfogadva',
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jk_hat_jk ON jegyzokonyv_hatarozatok(jegyzokonyv_id);
CREATE INDEX IF NOT EXISTS idx_jk_hat_updated ON jegyzokonyv_hatarozatok(updated_at);
CREATE INDEX IF NOT EXISTS idx_jk_hat_ev ON jegyzokonyv_hatarozatok(ev, sorszam);

-- ─────────────────────────────────────────────────────────────────
-- _sync_meta inicial bejegyzések (üres lastPullAt)
-- ─────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO _sync_meta (table_name) VALUES
  ('szemely'), ('csalad'), ('presbiter'), ('gyerek'), ('felmentes'),
  ('befizetes'), ('kiadas'), ('bankszamlak'), ('belsomozgas'), ('berleti_szerzodes'),
  ('keresztseg'), ('konfirmalas'), ('hazassag'), ('temetes'),
  ('munkanaplo'),
  ('iktato'), ('iktato_sablonok'),
  ('leltar_tetelek'),
  ('sirhelytemeto'), ('sirhely'), ('sirhelyberles'), ('sirhelyelhunyt'),
  ('presbiteri_jegyzokonyvek'),
  ('jegyzokonyv_resztvevok'), ('jegyzokonyv_napirendi_pontok'), ('jegyzokonyv_hatarozatok');
