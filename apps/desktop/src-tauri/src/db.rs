// Kartotéka Desktop — SQLCipher adatbázis-réteg.
//
// M2.1 : sima SQLite (tauri-plugin-sql) — eltávolítva
// M2.2 : SQLCipher + saját rusqlite commands + statikus DEV kulcs
// M2.3 : a DB-kulcs a Windows Credential Manager-ben él, per-user (DPAPI) ← MOST
// M2.4+: pull-sync + outbox + konfliktus-kezelés
//
// ## Biztonsági modell (M2.3)
//
// - A SQLCipher-titkosított DB megnyitásához szükséges 256-bit kulcs egy
//   kriptográfiailag biztonságos véletlen érték, amit **első indításkor**
//   generálunk és az **OS-szintű titkos storage**-be mentünk el (Windows
//   Credential Manager / macOS Keychain / Linux Secret Service).
// - Ez azt jelenti: a kulcs **nem a bináris-ben** van (mint M2.2-ben volt).
//   Egy támadó, aki reverse-engineer-eli a .exe-t, NEM kapja meg a kulcsot.
// - A Credential Manager a bejelentkezett Windows-user adatait DPAPI-val
//   titkosítja — másik user (vagy másik gép) Windows-login nélkül NEM
//   olvashatja.
// - Így a fenyegetési modell:
//    * Bejelentkezett user + fizikai hozzáférés = DB olvasható (ez OK, a
//      user szabadon használja az app-ot)
//    * Kilopott eszköz / kilopott DB fájl + NINCS Windows-login = DB
//      visszafejthetetlen
//    * Másik Windows-user ugyanazon a gépen = NEM fér hozzá
//
// ## Mit NEM véd az M2.3 (M2.4+ fogja kezelni)
//
// - Malware a jelenlegi user kontextusban: ha root-joggal fut a támadó
//   saját Windows-loginján, a Credential Manager megnyitható. Ez ellen
//   csak user-jelszó-alapú derived key véd (későbbi M2.6 lehet).
// - Backup / restore: ha a user elveszti a profilját (Windows újratelepítés),
//   a DB-kulcs is elvész → a DB többé nem nyitható. Ennek a backup-ja
//   külön feladat.

use rand::RngCore;
use rusqlite::{params_from_iter, Connection, OpenFlags};
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

// A Credential Manager entry koordinátái. A `keyring::Entry::new(service, user)`
// ezzel a kombóval hozza fel a titkot.
const KEYRING_SERVICE: &str = "kartoteka-desktop";
const KEYRING_USER: &str = "sqlcipher-db-key";

/// Globális DB-állapot — Option, mert az `open` még nem futott le alkalmazás-indulás előtt.
///
/// `init_error`: ha a `setup()`-beli `open_and_migrate()` hibát dobott, a teljes
/// üzenet itt tárolódik, és a frontend a `db_status` Tauri-parancson át megkapja.
/// Enélkül a user csak a generic „A DB még nincs megnyitva"-hibát látta, anélkül,
/// hogy tudta volna, miért nem sikerült a nyitás.
pub struct DbState {
    pub conn: Mutex<Option<Connection>>,
    pub init_error: Mutex<Option<String>>,
}

impl DbState {
    pub fn new() -> Self {
        Self {
            conn: Mutex::new(None),
            init_error: Mutex::new(None),
        }
    }
}

impl Default for DbState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(serde::Serialize)]
pub struct DbStatus {
    /// `true`, ha a Connection objektum megvan a state-ben (tehát a setup sikeres volt).
    pub opened: bool,
    /// A setup-hibaüzenet, ha a `open_and_migrate()` hibára futott.
    pub init_error: Option<String>,
}

#[tauri::command]
pub fn db_status(state: State<'_, DbState>) -> Result<DbStatus, String> {
    let opened = state
        .conn
        .lock()
        .map(|guard| guard.is_some())
        .unwrap_or(false);
    let init_error = state
        .init_error
        .lock()
        .map(|guard| guard.clone())
        .unwrap_or_else(|_| Some("DbState mutex mérgezett".to_string()));
    Ok(DbStatus { opened, init_error })
}

/// Lekéri a SQLCipher-kulcsot az OS-szintű keyringből. Ha még nincs, generál
/// egy új kriptográfiailag biztonságos 32-byte kulcsot és elmenti.
///
/// A visszaadott string egy 64-karakteres hex-érték, amit a SQLCipher-nek
/// `PRAGMA key = "x'...'";` formában adunk át (a `rusqlite` `pragma_update`
/// automatikusan idézőjelezi).
fn load_or_create_db_key() -> Result<String, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Keyring entry létrehozás sikertelen: {e}"))?;

    match entry.get_password() {
        Ok(existing) => Ok(existing),
        Err(keyring::Error::NoEntry) => {
            // Első indítás — generáljunk egy új kulcsot és mentsük le.
            let mut buf = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut buf);
            let hex_key = hex::encode(buf);
            entry
                .set_password(&hex_key)
                .map_err(|e| format!("Keyring kulcs mentés sikertelen: {e}"))?;
            eprintln!("[Kartotéka] Új SQLCipher kulcs generálva és a Credential Managerbe mentve.");
            Ok(hex_key)
        }
        Err(e) => Err(format!("Keyring olvasás sikertelen: {e}")),
    }
}

/// Megnyitja a DB-t (létrehozza, ha nincs), beállítja a SQLCipher kulcsot, és
/// lefuttatja a pending migrációkat. A `setup()` belőle hívódik, nem
/// felhasználó-indítottan.
pub fn open_and_migrate(app: &AppHandle) -> Result<Connection, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Nem sikerült lekérni az app-data könyvtárat: {e}"))?;

    std::fs::create_dir_all(&app_data)
        .map_err(|e| format!("Az app-data könyvtár létrehozása sikertelen: {e}"))?;

    let db_path = app_data.join("kartoteka.db");

    let conn = Connection::open_with_flags(
        &db_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| format!("DB megnyitás sikertelen ({}): {e}", db_path.display()))?;

    // M2.3 — kulcs a Credential Managerből (vagy új, ha első indítás).
    let db_key = load_or_create_db_key()?;

    // `PRAGMA key` — SQLCipher "raw hex key" formátum: `x'...'` 64 hex-karakterrel.
    // A rusqlite `pragma_update` automatikusan idézőjelezi a value-t, ami miatt
    // itt a `x'...'` formát kézzel kell összeraknunk és raw execute-tal küldeni,
    // különben a SQLCipher passphrase-nek veszi és KDF-et futtat rá (lassabb és
    // más eredmény).
    let raw_key_pragma = format!("PRAGMA key = \"x'{db_key}'\";");
    conn.execute_batch(&raw_key_pragma)
        .map_err(|e| format!("SQLCipher raw key PRAGMA sikertelen: {e}"))?;

    // Sanity-check: ha a kulcs rossz (pl. a régi M2.2-es DEV_DB_KEY-vel titkosított
    // DB-t próbáljuk megnyitni az új kulccsal), a sqlite_master olvasás `SQLITE_NOTADB`-t ad.
    let _sanity: i64 = conn
        .query_row("SELECT count(*) FROM sqlite_master", [], |row| row.get(0))
        .map_err(|e| format!(
            "SQLCipher sanity-check sikertelen — nem megfelelő kulcs? \
             Ha M2.2-es DEV-kulccsal készült DB-je van, törölje a \
             {} fájlt és indítsa újra. Hiba: {e}",
            db_path.display(),
        ))?;

    run_migrations(&conn)?;

    Ok(conn)
}

/// Verzió-alapú migráció `PRAGMA user_version` alapján.
fn run_migrations(conn: &Connection) -> Result<(), String> {
    let current: i32 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| format!("PRAGMA user_version olvasás sikertelen: {e}"))?;

    if current < 1 {
        conn.execute_batch(
            r#"
            BEGIN;
            CREATE TABLE IF NOT EXISTS settings (
                key         TEXT PRIMARY KEY,
                value       TEXT NOT NULL,
                updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS outbox (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                op           TEXT NOT NULL CHECK (op IN ('insert','update','delete')),
                target_table TEXT NOT NULL,
                target_id    TEXT,
                payload      TEXT NOT NULL,
                status       TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','sent','failed')),
                created_at   TEXT NOT NULL DEFAULT (datetime('now')),
                retry_count  INTEGER NOT NULL DEFAULT 0,
                last_error   TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_outbox_status_created
                ON outbox(status, created_at);
            PRAGMA user_version = 1;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v1 migráció sikertelen: {e}"))?;
    }

    if current < 2 {
        // M2.4 — profiles_local: a Supabase `profiles` tábla lokális tükörképe.
        conn.execute_batch(
            r#"
            BEGIN;
            CREATE TABLE IF NOT EXISTS profiles_local (
                id                TEXT PRIMARY KEY,        -- uuid (Supabase-formátum)
                email             TEXT,
                full_name         TEXT,
                phone             TEXT,
                role              TEXT,
                status            TEXT,
                congregation_id   TEXT,                    -- uuid
                diocese_id        TEXT,                    -- uuid
                district_id       TEXT,                    -- uuid
                synced_at         TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_profiles_local_congregation
                ON profiles_local(congregation_id);
            PRAGMA user_version = 2;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v2 migráció (profiles_local) sikertelen: {e}"))?;
    }

    if current < 3 {
        // M2.6 — revision + updated_at a profiles_local-ra, az optimistic-concurrency
        // konfliktus-kezeléshez. A Supabase-oldali `profiles` táblán a
        // 2026-04-23-m2-6-profiles-revision.sql migráció hozzáadja ezeket
        // az oszlopokat + egy BEFORE UPDATE triggert, ami inkrementálja a
        // revision-t minden írásnál.
        //
        // A kliens-oldali `profiles_local.revision` a pull-skor kerül friss
        // értékre, és a `processOutbox` / `updateOwnProfile` conditional-updateb\u0151l
        // tudja, konfliktusos-e a kliens-adat.
        conn.execute_batch(
            r#"
            BEGIN;
            ALTER TABLE profiles_local ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE profiles_local ADD COLUMN updated_at TEXT;
            PRAGMA user_version = 3;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v3 migráció (profiles_local revision/updated_at) sikertelen: {e}"))?;
    }

    if current < 4 {
        // M6.2 — congregations_local: a Supabase `congregations` tábla lokális tükörképe.
        // A lelkészek a saját gyülekezet-adataikat offline is látják (név, IBAN, járulék,
        // elérhetőség, logó-URL stb.), és a későbbi fázisokban módosíthatják is.
        //
        // Oszlop-választás elve: a desktop UI által **megjelenített** és
        // **szerkeszthető** mezők kerülnek be. ROI-specifikus (TVA, e-factura)
        // és címhierarchia-join (adrlocality_id, adrstreet_id) mezők KIHAGYVA
        // — ezek későbbi fázisban kerülhetnek be, ha az offline használat igényli.
        //
        // Típusok:
        //   - uuid → TEXT (SQLite-ban nincs uuid típus)
        //   - numeric → REAL (SQLite)
        //   - boolean → INTEGER (0/1)
        //   - timestamptz → TEXT (ISO 8601 string, ahogy a Supabase adja)
        //
        // A Supabase-oldali M6.1 migráció (2026-04-23-m6-1-congregations-revision.sql)
        // hozzáadja a `revision` + `updated_at` oszlopokat a congregations táblához
        // és a BEFORE UPDATE triggert — enélkül a conditional-update konfliktus-
        // kezelés nem működik.
        conn.execute_batch(
            r#"
            BEGIN;
            CREATE TABLE IF NOT EXISTS congregations_local (
                id                    TEXT PRIMARY KEY,       -- uuid
                name                  TEXT NOT NULL,
                nev_hu                TEXT,
                nev_ro                TEXT,
                nev_en                TEXT,
                district              TEXT,
                egyhazmegye           TEXT,
                diocese_id            TEXT,                   -- uuid
                adoszam               TEXT,
                cim                   TEXT,
                email                 TEXT,
                telefon               TEXT,
                web                   TEXT,
                varos                 TEXT,
                megye                 TEXT,
                iranyitoszam          TEXT,
                iban                  TEXT,
                bank                  TEXT,
                eves_jarulek          REAL,
                jarulek_kedvezmenyes  REAL,
                jarulek_hatarid       TEXT,
                cimer_url             TEXT,
                public_slug           TEXT,
                public_site_enabled   INTEGER NOT NULL DEFAULT 0,  -- 0/1 boolean
                revision              INTEGER NOT NULL DEFAULT 0,
                updated_at            TEXT,
                synced_at             TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_congregations_local_updated_at
                ON congregations_local(updated_at);
            PRAGMA user_version = 4;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v4 migráció (congregations_local) sikertelen: {e}"))?;
    }

    if current < 5 {
        // M7.1 — szemely_local: a Supabase `szemely` tábla lokális tükörképe.
        //
        // A lelkész offline is láthatja a saját gyülekezete **tagjait**:
        // név-variánsok, CNP, születési dátum, cím, telefon, e-mail, vallási
        // adatok, családfő-jelzés, stb.
        //
        // Oszlop-választás elve (V1):
        //   - **BEKERÜL**: core identity, családfa-hivatkozás, cím (szöveges),
        //     elérhetőség, vallás/foglalkozás/nemzetiség, státusz, megjegyzés
        //   - **KIMARAD V1-ben**:
        //     * `szig`, `taj` — PII, külön megbeszélés után (M7.5+)
        //     * `kep`, `photo_url` — fotók külön fázis (Supabase Storage cache)
        //     * `sz_helyid`, `c_utcaid`, `c_helysegid` — FK-k cím-táblákhoz;
        //       a `c_szcim` szöveg-mezővel dolgozunk elsőre
        //     * `befizetoev` — pénzügyi, admin-oldali
        //     * `created`, `namepattern` — későbbi szempontok
        //
        // Típusok (megegyezik a congregations-mintával):
        //   - integer → INTEGER  (szemely.id = integer, NEM uuid!)
        //   - uuid → TEXT (congregation_id, family_id)
        //   - boolean → INTEGER (0/1)
        //   - date → TEXT (ISO 'YYYY-MM-DD')
        //   - timestamptz → TEXT (ISO 8601)
        //
        // A Supabase-oldali M7.0 migráció (2026-04-23-m7-0-szemely-csalad-triggers.sql)
        // adja hozzá a BEFORE UPDATE triggert — a `revision`/`updated_at` oszlopok
        // MÁR LÉTEZTEK a Supabase sémában.
        conn.execute_batch(
            r#"
            BEGIN;
            CREATE TABLE IF NOT EXISTS szemely_local (
                -- Core identity (INTEGER PK, szemely_id_seq-ből származik)
                id                INTEGER PRIMARY KEY,
                cnp               TEXT NOT NULL,
                szcs_nev          TEXT,                       -- szül. családnév
                k_nev             TEXT,                       -- keresztnév
                csaladnev         TEXT,                       -- családnév (jelenlegi)
                ferjk_nev         TEXT,                       -- férjezett név (nők)
                allapot           TEXT,                       -- családi állapot

                -- Személyes
                sz_datum          TEXT,                       -- ISO 'YYYY-MM-DD'
                ferfi             INTEGER NOT NULL DEFAULT 0, -- 0/1 boolean
                csaladfo          INTEGER NOT NULL DEFAULT 0,
                meghalt           INTEGER NOT NULL DEFAULT 0,
                member_status     TEXT DEFAULT 'aktív',

                -- Családfa (szülők névvel + CNP-hivatkozás)
                apjaneve          TEXT,
                anyjaneve         TEXT,
                id_apja           TEXT,                       -- apa CNP-je
                id_anyja          TEXT,                       -- anya CNP-je

                -- Cím (szöveges, FK-k nélkül V1-ben)
                c_szam            TEXT,                       -- házszám
                c_tombhaz         TEXT,                       -- tömbház
                c_lepcsohaz       TEXT,                       -- lépcsőház
                c_ajto            TEXT,                       -- ajtó
                c_emelet          TEXT,                       -- emelet
                c_szcim           TEXT,                       -- teljes cím (string)

                -- Elérhetőség
                telefon           TEXT,
                email             TEXT,

                -- Vallás / identitás
                vallas            TEXT,
                foglalkozas       TEXT,
                nemzetiseg        TEXT,
                voter_eligible    INTEGER NOT NULL DEFAULT 0, -- választó-e

                -- Gyülekezet / család FK-k
                congregation_id   TEXT,                       -- uuid (szűrő-mező)
                family_id         TEXT,                       -- uuid (nullable)

                -- Egyéb
                type              TEXT,                       -- szemely.type (pl. 'aktív')
                isvisible         INTEGER NOT NULL DEFAULT 1,
                megjegyzes        TEXT,

                -- Sync metadata
                revision          INTEGER NOT NULL DEFAULT 0,
                updated_at        TEXT,
                synced_at         TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Indexek a leggyakoribb lekérdezésekhez
            CREATE INDEX IF NOT EXISTS idx_szemely_local_congregation
                ON szemely_local(congregation_id);
            CREATE INDEX IF NOT EXISTS idx_szemely_local_family
                ON szemely_local(family_id);
            CREATE INDEX IF NOT EXISTS idx_szemely_local_csaladnev
                ON szemely_local(csaladnev);
            CREATE INDEX IF NOT EXISTS idx_szemely_local_cnp
                ON szemely_local(cnp);
            CREATE INDEX IF NOT EXISTS idx_szemely_local_updated_at
                ON szemely_local(updated_at);

            PRAGMA user_version = 5;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v5 migráció (szemely_local) sikertelen: {e}"))?;
    }

    if current < 6 {
        // M8.1 — munkanaplo_local: a Supabase `munkanaplo` tábla lokális tükörképe.
        //
        // A lelkész napi munkakönyve (istentisztelet, látogatás, szolgálat)
        // offline is elérhető. A szerver-oldali migráció
        // (2026-04-23-m8-0-munkanaplo-triggers.sql) hozzáadja a trigger-t
        // (a revision/updated_at oszlopok már léteztek).
        //
        // Típus-mapping (mint a korábbi fázisokban):
        //   - integer → INTEGER
        //   - numeric → REAL
        //   - boolean → INTEGER (0/1)
        //   - date → TEXT (ISO 'YYYY-MM-DD')
        //   - timestamptz → TEXT (ISO 8601)
        //   - uuid → TEXT
        conn.execute_batch(
            r#"
            BEGIN;
            CREATE TABLE IF NOT EXISTS munkanaplo_local (
                id                  INTEGER PRIMARY KEY,
                idopont             TEXT,              -- ISO date
                jellege             TEXT,              -- istentisztelet / látogatás / egyéb
                id_jellege          TEXT,              -- szabad-szöveges alkategória
                bibliaolvasas       TEXT,              -- pl. 'Jn 3,16'
                alapige             TEXT,              -- a prédikáció alapigéje
                cim                 TEXT,              -- a szolgálat címe
                enekek              TEXT,              -- énekek (comma-separated)
                jelenlet_ferfi      INTEGER,
                jelenlet_no         INTEGER,
                jelenlet_gyermek    INTEGER,
                jelenlet_osszesen   INTEGER NOT NULL DEFAULT 0,
                szolgalt            TEXT,              -- a szolgáló lelkész neve
                persely             REAL,              -- RON
                megjegyzes          TEXT,
                mediapath           TEXT,
                kategoria           TEXT DEFAULT 'szolgalat',
                du                  INTEGER NOT NULL DEFAULT 0, -- délután (0/1)
                congregation_id     TEXT,              -- uuid
                revision            INTEGER NOT NULL DEFAULT 0,
                updated_at          TEXT,
                synced_at           TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_munkanaplo_local_congregation
                ON munkanaplo_local(congregation_id);
            CREATE INDEX IF NOT EXISTS idx_munkanaplo_local_idopont
                ON munkanaplo_local(idopont DESC);
            CREATE INDEX IF NOT EXISTS idx_munkanaplo_local_updated_at
                ON munkanaplo_local(updated_at);

            PRAGMA user_version = 6;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v6 migráció (munkanaplo_local) sikertelen: {e}"))?;
    }

    if current < 7 {
        // M9 — `deleted` oszlop a `munkanaplo_local`-ra (soft-delete támogatás).
        //
        // A Supabase-oldali `munkanaplo.deleted` oszlop már létezik (a web
        // `actions.ts` és a `WorklogEntry` TypeScript-interfész bizonyítja),
        // csak a kliens-tükör nem tartalmazta eddig. Ezzel most a kliens is
        // tudja a soft-delete-et → nem mutat törölt bejegyzéseket.
        conn.execute_batch(
            r#"
            BEGIN;
            ALTER TABLE munkanaplo_local ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            PRAGMA user_version = 7;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v7 migráció (munkanaplo_local.deleted) sikertelen: {e}"))?;
    }

    if current < 8 {
        // A-M7.0 — outbox bővítés a @kartoteka/offline-sync `Mutation` típusához.
        //
        // Az outbox tábla M2.5 óta aktív az INTEGER AUTOINCREMENT PK-val;
        // a `sync.ts` régi logika (op/target_table/target_id/payload/retry_count)
        // változatlanul fut tovább. Itt csak 3 új oszlopot adunk hozzá, hogy a
        // TauriSqliteBackend (Mutation-interface kompat) működjön:
        //   - mutation_id TEXT       — stabil kliens-generált ID (ULID/UUID), UNIQUE
        //   - expected_revision INT  — conditional-update base revision
        //   - last_attempt_at TEXT   — az utolsó push-kísérlet ISO timestamp-je
        //
        // A meglévő sorok (ha vannak) `mutation_id = NULL`-lal maradnak, és a
        // TauriSqliteBackend csak a `mutation_id IS NOT NULL` sorokkal dolgozik.
        conn.execute_batch(
            r#"
            BEGIN;
            ALTER TABLE outbox ADD COLUMN mutation_id TEXT;
            ALTER TABLE outbox ADD COLUMN expected_revision INTEGER;
            ALTER TABLE outbox ADD COLUMN last_attempt_at TEXT;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_mutation_id
                ON outbox(mutation_id)
                WHERE mutation_id IS NOT NULL;
            PRAGMA user_version = 8;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v8 migráció (outbox mutation_id) sikertelen: {e}"))?;
    }

    if current < 9 {
        // A-M7.1a — chitanta_tombok_local: a nyugtatömb (bizonylat-tömb) tábla
        // lokális tükre. A Supabase `chitanta_tombok` offline-szinkronizálása,
        // az A-M7.1 pénzügyi use-case-első lépésében.
        //
        // Típus-mapping (konzisztens az előző fázisokkal):
        //   uuid → TEXT, integer → INTEGER, numeric → REAL,
        //   boolean → INTEGER (0/1), date → TEXT ISO 'YYYY-MM-DD',
        //   timestamptz → TEXT ISO 8601.
        //
        // A `scope` oszlop TEXT + CHECK gyulekezet/egyhazmegye.
        // A `revision` + `updated_at` + trigger a sync-tracking-hez kell;
        // a szerver-oldali trigger a későbbi A-M7.x SQL-migrációban jön
        // (most csak a Rust-oldali tábla, a push-sync még a jövőben kerül be).
        conn.execute_batch(
            r#"
            BEGIN;
            CREATE TABLE IF NOT EXISTS chitanta_tombok_local (
                id                       TEXT PRIMARY KEY,      -- uuid
                congregation_id          TEXT,                  -- uuid | NULL
                diocese_id               TEXT,                  -- uuid | NULL
                block_nr                 TEXT,
                seria                    TEXT NOT NULL,
                szam_kezdet              INTEGER NOT NULL,
                szam_veg                 INTEGER NOT NULL,
                darabszam_ossz           INTEGER NOT NULL,
                felhasznalt_darabszam    INTEGER NOT NULL DEFAULT 0,
                vasarlas_datuma          TEXT NOT NULL,
                vasarlas_ara             REAL,
                elso_hasznalat_datum     TEXT,
                utolso_hasznalat_datum   TEXT,
                aktiv                    INTEGER NOT NULL DEFAULT 1,  -- 0/1
                megjegyzes               TEXT,
                scope                    TEXT NOT NULL DEFAULT 'gyulekezet'
                                            CHECK (scope IN ('gyulekezet','egyhazmegye')),
                created_at               TEXT NOT NULL,
                created_by               TEXT,                  -- uuid | NULL
                updated_at               TEXT NOT NULL,
                revision                 INTEGER NOT NULL DEFAULT 0,
                synced_at                TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_chitanta_tombok_local_congregation
                ON chitanta_tombok_local(congregation_id);
            CREATE INDEX IF NOT EXISTS idx_chitanta_tombok_local_aktiv
                ON chitanta_tombok_local(congregation_id, aktiv);
            CREATE INDEX IF NOT EXISTS idx_chitanta_tombok_local_updated_at
                ON chitanta_tombok_local(updated_at);

            PRAGMA user_version = 9;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v9 migráció (chitanta_tombok_local) sikertelen: {e}"))?;
    }

    if current < 10 {
        // A-M7.2d1 — chitanta_wallet_local: offline sorszám-tárca.
        //
        // A lelkész online-módban előre kér a szervertől N sorszámot
        // (`reserve_chitanta_numbers(N)` RPC), amelyeket ebbe a táblába mentünk.
        // Offline-módban (A-M7.2d2) a `claim_next_reserved_number()` típusú
        // kliens-logika a legkisebb `used=0` sorszámot adja a chitanta-kiállító
        // formnak, és azonnal `used=1`-re állítja.
        //
        // Mivel a szerver-oldali pointer (`oblio_fiokok.chitanta_kovetkezo_szam`)
        // minden foglaláskor atomikusan ugrik, a wallet és az online-kiállítás
        // sorszámai nem ütköznek.
        conn.execute_batch(
            r#"
            BEGIN;
            CREATE TABLE IF NOT EXISTS chitanta_wallet_local (
                id                           INTEGER PRIMARY KEY AUTOINCREMENT,
                congregation_id              TEXT NOT NULL,       -- uuid
                sorozat                      TEXT NOT NULL,
                szam                         INTEGER NOT NULL,
                reserved_at                  TEXT NOT NULL DEFAULT (datetime('now')),
                used                         INTEGER NOT NULL DEFAULT 0, -- 0/1
                used_at                      TEXT,
                used_for_chitanta_local_id   TEXT,                -- ha A-M7.2d2-ben offline chitanta_local lesz
                UNIQUE (congregation_id, sorozat, szam)
            );
            CREATE INDEX IF NOT EXISTS idx_chitanta_wallet_available
                ON chitanta_wallet_local (congregation_id, sorozat, used, szam);
            PRAGMA user_version = 10;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v10 migráció (chitanta_wallet_local) sikertelen: {e}"))?;
    }

    if current < 11 {
        // A-M7.2d2a — chitantak_local: offline-kiállított chitanták lokális tükre.
        //
        // A lelkész hálózat nélkül is kiállíthat chitantát: a wallet-ből vesz egy
        // sorszámot (lásd v10), ideírja a papír-nyugta adatait, és a sor
        // `sync_state='pending'` állapottal várja, hogy a gép újra online
        // legyen, amikor a push-sync feltölti az `oblio_szamlak`-ba.
        //
        // A szerver-oldali tábla (oblio_szamlak) UUID-t vár PK-ként, amit csak
        // a szerver tud adni → a kliens-oldalon **client-generált TEXT ID**-t
        // használunk (`local-<uuid>` formátum), és a sikeres push után a
        // `server_id` oszlopba kerül a szerver-UUID.
        //
        // Mezők (az `oblio_szamlak` chitanta-releváns oszlopai):
        //   - klienesseg_nev, klienesseg_cui, klienesseg_cim  (befizető)
        //   - osszeg_brut (RON)
        //   - reprezentand, befizetes_id, megjegyzes
        //   - issued_by (user uuid), collected_at
        //   - sorozat + szam → a wallet-ből jön, UNIQUE (congregation, sorozat, szam)
        //
        // Sync-state:
        //   - 'pending'  — még nem küldtük a szerverre (az outbox-ban várakozik)
        //   - 'synced'   — a szerver elfogadta, server_id kitöltve
        //   - 'conflict' — a szerver elutasította (pl. duplicate szám), user dönt
        //
        // A `used_for_chitanta_local_id` a wallet-ben erre az ID-re mutat.
        conn.execute_batch(
            r#"
            BEGIN;
            CREATE TABLE IF NOT EXISTS chitantak_local (
                id                    TEXT PRIMARY KEY,      -- 'local-<uuid>'
                server_id             TEXT,                  -- uuid, NULL amíg nincs sync
                congregation_id       TEXT NOT NULL,         -- uuid
                sorozat               TEXT NOT NULL,
                szam                  INTEGER NOT NULL,
                szamla_datum          TEXT NOT NULL,         -- ISO 'YYYY-MM-DD'
                klienesseg_nev        TEXT NOT NULL,
                klienesseg_cui        TEXT,
                klienesseg_cim        TEXT,
                osszeg_brut           REAL NOT NULL,
                reprezentand          TEXT,
                befizetes_id          TEXT,                  -- uuid | NULL
                megjegyzes            TEXT,
                issued_by             TEXT NOT NULL,         -- user uuid
                collected_at          TEXT NOT NULL,         -- ISO timestamp
                sync_state            TEXT NOT NULL DEFAULT 'pending'
                                         CHECK (sync_state IN ('pending','synced','conflict')),
                sync_error            TEXT,
                created_at            TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE (congregation_id, sorozat, szam)
            );

            CREATE INDEX IF NOT EXISTS idx_chitantak_local_congregation_date
                ON chitantak_local(congregation_id, szamla_datum DESC);
            CREATE INDEX IF NOT EXISTS idx_chitantak_local_sync_state
                ON chitantak_local(sync_state, created_at);
            CREATE INDEX IF NOT EXISTS idx_chitantak_local_server_id
                ON chitantak_local(server_id);

            PRAGMA user_version = 11;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v11 migráció (chitantak_local) sikertelen: {e}"))?;
    }

    if current < 12 {
        // A-M7.8a — befizetes_local: offline olvasási cache a `befizetes` táblához.
        //
        // Read-only mirror: a pull-sync alkalmazza a szerver-változásokat, a
        // desktop a listázáshoz használja. A write-offline (save-offline) egy
        // külön iratszám-wallet rendszerrel jönne — az nincs most implementálva.
        //
        // A join-mezők (`befizetescel_nev`, `szemely_nev`, `bankszamla_nev`)
        // a pull-sync-ben plusz-query-vel vagy RPC-vel tölthetők. Most az
        // egyszerűség kedvéért NEM cache-eljük őket — a desktop-lista az
        // offline-módban a join nélkül (ID-n keresztül) jelenik meg.
        //
        // Mezők: a `befizetes` tábla minden releváns oszlopa.
        conn.execute_batch(
            r#"
            BEGIN;
            CREATE TABLE IF NOT EXISTS befizetes_local (
                id                INTEGER PRIMARY KEY,
                xkey              TEXT NOT NULL,
                id_csalad         INTEGER,
                id_szemely        INTEGER,
                forrasa           TEXT,
                id_befizetescel   INTEGER NOT NULL,
                datum             TEXT NOT NULL,       -- ISO 'YYYY-MM-DD'
                osszeg            REAL NOT NULL,
                nyugta            TEXT,
                iratszam          TEXT NOT NULL,
                irattipus         TEXT NOT NULL,
                csalad            INTEGER NOT NULL DEFAULT 0,  -- 0/1
                megjegyzes        TEXT,
                deleted           INTEGER NOT NULL DEFAULT 0,  -- 0/1
                created           TEXT,
                fizetettev        INTEGER NOT NULL,
                userid            TEXT NOT NULL,
                is_potlas         INTEGER NOT NULL DEFAULT 0,
                bankszamla_id     INTEGER,
                stornozott        INTEGER NOT NULL DEFAULT 0,
                stornozott_at     TEXT,
                stornozott_indok  TEXT,
                stornozott_by     TEXT,
                osszeg_ron        REAL,
                arfolyam          REAL,
                congregation_id   TEXT NOT NULL,
                revision          INTEGER NOT NULL DEFAULT 0,
                updated_at        TEXT NOT NULL,
                synced_at         TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_befizetes_local_congregation
                ON befizetes_local(congregation_id);
            CREATE INDEX IF NOT EXISTS idx_befizetes_local_datum
                ON befizetes_local(datum DESC);
            CREATE INDEX IF NOT EXISTS idx_befizetes_local_fizetettev
                ON befizetes_local(fizetettev);
            CREATE INDEX IF NOT EXISTS idx_befizetes_local_updated_at
                ON befizetes_local(updated_at);
            CREATE INDEX IF NOT EXISTS idx_befizetes_local_szemely
                ON befizetes_local(id_szemely);
            CREATE INDEX IF NOT EXISTS idx_befizetes_local_cel
                ON befizetes_local(id_befizetescel);

            PRAGMA user_version = 12;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v12 migráció (befizetes_local) sikertelen: {e}"))?;
    }

    if current < 13 {
        // A-M7.8b — kiadas_local: offline olvasási cache a `kiadas` táblához.
        // A befizetes_local minta szerint.
        conn.execute_batch(
            r#"
            BEGIN;
            CREATE TABLE IF NOT EXISTS kiadas_local (
                id                    INTEGER PRIMARY KEY,
                xkey                  TEXT NOT NULL,
                id_kiadascel          INTEGER NOT NULL,
                datum                 TEXT NOT NULL,       -- ISO timestamp
                osszeg                REAL NOT NULL,
                nyugta                TEXT,
                iratszam              TEXT NOT NULL,
                irattipus             TEXT NOT NULL,
                megjegyzes            TEXT,
                created               TEXT,
                deleted               INTEGER NOT NULL DEFAULT 0,
                atvevo                TEXT,
                atvevoid              INTEGER,
                userid                TEXT NOT NULL,
                is_potlas             INTEGER NOT NULL DEFAULT 0,
                bankszamla_id         INTEGER,
                vonatkozo_idoszak     TEXT,
                kedvezmenyezett_cui   TEXT,
                stornozott            INTEGER NOT NULL DEFAULT 0,
                stornozott_at         TEXT,
                stornozott_indok      TEXT,
                stornozott_by         TEXT,
                osszeg_ron            REAL,
                arfolyam              REAL,
                congregation_id       TEXT NOT NULL,
                revision              INTEGER NOT NULL DEFAULT 0,
                updated_at            TEXT NOT NULL,
                synced_at             TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_kiadas_local_congregation
                ON kiadas_local(congregation_id);
            CREATE INDEX IF NOT EXISTS idx_kiadas_local_datum
                ON kiadas_local(datum DESC);
            CREATE INDEX IF NOT EXISTS idx_kiadas_local_updated_at
                ON kiadas_local(updated_at);
            CREATE INDEX IF NOT EXISTS idx_kiadas_local_atvevoid
                ON kiadas_local(atvevoid);
            CREATE INDEX IF NOT EXISTS idx_kiadas_local_cel
                ON kiadas_local(id_kiadascel);

            PRAGMA user_version = 13;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v13 migráció (kiadas_local) sikertelen: {e}"))?;
    }

    if current < 14 {
        // A-M7.9a — iratszam_wallet_local + befizetes_pending_local
        //
        // Két új tábla az offline-WRITE flow-hoz:
        //
        //   1) `iratszam_wallet_local` — előre-foglalt iratszámok tárolója.
        //      KÖZÖS a befizetés és kiadás között (tipus mezővel),
        //      per (congregation × tipus × ev) szegmentálva. A kliens online-módban
        //      `reserve_iratszam(congregation, tipus, ev, N)` RPC-vel hívja le
        //      a számokat, amiket itt tárolunk.
        //
        //   2) `befizetes_pending_local` — offline-rögzített befizetések lokális
        //      tükre. A `befizetes_local` (v12) READ-cache, ez WRITE-staging.
        //      `sync_state='pending'` → outbox-push, 'synced' → szerver-id van,
        //      'conflict' → manuális rendezés (A-M7.9b későbbi alfázis).
        //
        // A kiadás-write az A-M7.9b-ben jön — akkor lesz `kiadas_pending_local`.
        // A wallet-tábla már most felkészült a 'kiadas' tipusra is.
        conn.execute_batch(
            r#"
            BEGIN;

            CREATE TABLE IF NOT EXISTS iratszam_wallet_local (
                id                       INTEGER PRIMARY KEY AUTOINCREMENT,
                congregation_id          TEXT NOT NULL,                        -- uuid
                iratszam_tipus           TEXT NOT NULL CHECK (iratszam_tipus IN ('befizetes','kiadas')),
                ev                       INTEGER NOT NULL,
                szam                     INTEGER NOT NULL,
                reserved_at              TEXT NOT NULL DEFAULT (datetime('now')),
                used                     INTEGER NOT NULL DEFAULT 0,           -- 0/1
                used_at                  TEXT,
                used_for_local_id        TEXT,                                 -- 'local-<uuid>' a pending-sorra
                UNIQUE (congregation_id, iratszam_tipus, ev, szam)
            );

            CREATE INDEX IF NOT EXISTS idx_iratszam_wallet_available
                ON iratszam_wallet_local (congregation_id, iratszam_tipus, ev, used, szam);

            CREATE TABLE IF NOT EXISTS befizetes_pending_local (
                id                       TEXT PRIMARY KEY,                     -- 'local-<uuid>'
                server_id                INTEGER,                              -- pgint8, NULL amíg nincs sync
                congregation_id          TEXT NOT NULL,
                xkey                     TEXT NOT NULL,                        -- kliens-generált uuid (server is megkapja)
                osszeg                   REAL NOT NULL,
                datum                    TEXT NOT NULL,                        -- ISO 'YYYY-MM-DD'
                id_befizetescel          INTEGER NOT NULL,
                id_szemely               INTEGER,
                id_csalad                INTEGER,
                forrasa                  TEXT,
                iratszam                 TEXT NOT NULL,
                irattipus                TEXT NOT NULL,
                fizetettev               INTEGER NOT NULL,
                megjegyzes               TEXT,
                csalad                   INTEGER NOT NULL DEFAULT 0,           -- 0/1
                is_potlas                INTEGER NOT NULL DEFAULT 0,
                bankszamla_id            INTEGER,
                wallet_id                INTEGER,                              -- iratszam_wallet_local.id
                userid                   TEXT NOT NULL,                        -- kiállító user uuid
                sync_state               TEXT NOT NULL DEFAULT 'pending'
                                            CHECK (sync_state IN ('pending','synced','conflict')),
                sync_error               TEXT,
                created_at               TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE (congregation_id, fizetettev, iratszam)
            );

            CREATE INDEX IF NOT EXISTS idx_befizetes_pending_congregation_date
                ON befizetes_pending_local(congregation_id, datum DESC);
            CREATE INDEX IF NOT EXISTS idx_befizetes_pending_sync_state
                ON befizetes_pending_local(sync_state, created_at);
            CREATE INDEX IF NOT EXISTS idx_befizetes_pending_server_id
                ON befizetes_pending_local(server_id);

            PRAGMA user_version = 14;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v14 migráció (iratszam_wallet_local + befizetes_pending_local) sikertelen: {e}"))?;
    }

    if current < 15 {
        // A-M7.9b — kiadas_pending_local
        //
        // Az A-M7.9a befizetés-write-offline tükörképe a kiadás-oldalra. A
        // wallet (`iratszam_wallet_local`) közös, már most felkészült a 'kiadas'
        // típusra. Csak az új pending-tábla kell.
        //
        // Eltérések a `befizetes_pending_local`-tól (a `kiadas` séma-különbségek
        // miatt):
        //   - `id_kiadascel` az `id_befizetescel` helyett
        //   - `atvevoid` (FK szemely) + `atvevo` (text) — ezek MINDKETTŐ lehet
        //     egyszerre (a tag-FK + szöveges leírás), vagy csak az egyik
        //   - `kedvezmenyezett_cui` (cég adószám)
        //   - `vonatkozo_idoszak` (text, pl. "2026 01")
        //   - NINCS `id_csalad`, `csalad`, `fizetettev` (a kiadás éve a `datum`-ből)
        //   - `datum` TIMESTAMP — TEXT-ként tároljuk ISO formátumban
        conn.execute_batch(
            r#"
            BEGIN;

            CREATE TABLE IF NOT EXISTS kiadas_pending_local (
                id                       TEXT PRIMARY KEY,                     -- 'local-<uuid>'
                server_id                INTEGER,                              -- pgint8, NULL amíg nincs sync
                congregation_id          TEXT NOT NULL,
                xkey                     TEXT NOT NULL,
                osszeg                   REAL NOT NULL,
                datum                    TEXT NOT NULL,                        -- ISO 'YYYY-MM-DDTHH:MM:SS'
                id_kiadascel             INTEGER NOT NULL,
                atvevoid                 INTEGER,                              -- FK szemely.id, vagy NULL
                atvevo                   TEXT,                                 -- szöveges átvevő, vagy NULL
                forrasa                  TEXT,
                iratszam                 TEXT NOT NULL,
                irattipus                TEXT NOT NULL,
                ev                       INTEGER NOT NULL,                     -- EXTRACT(YEAR FROM datum)
                megjegyzes               TEXT,
                vonatkozo_idoszak        TEXT,
                kedvezmenyezett_cui      TEXT,
                is_potlas                INTEGER NOT NULL DEFAULT 0,
                bankszamla_id            INTEGER,
                wallet_id                INTEGER,                              -- iratszam_wallet_local.id
                userid                   TEXT NOT NULL,
                sync_state               TEXT NOT NULL DEFAULT 'pending'
                                            CHECK (sync_state IN ('pending','synced','conflict')),
                sync_error               TEXT,
                created_at               TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE (congregation_id, ev, iratszam)
            );

            CREATE INDEX IF NOT EXISTS idx_kiadas_pending_congregation_date
                ON kiadas_pending_local(congregation_id, datum DESC);
            CREATE INDEX IF NOT EXISTS idx_kiadas_pending_sync_state
                ON kiadas_pending_local(sync_state, created_at);
            CREATE INDEX IF NOT EXISTS idx_kiadas_pending_server_id
                ON kiadas_pending_local(server_id);

            PRAGMA user_version = 15;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v15 migráció (kiadas_pending_local) sikertelen: {e}"))?;
    }

    if current < 16 {
        // M8.1 — szemely_pending_local
        //
        // Az M8.1 új-tag INSERT-offline flow-hoz. A szemely-nél NINCS
        // iratszam-sequence (ellentétben a pénzügyi A-M7.9a/b-vel), de
        // a szerver-oldali `szemely.id` INTEGER sequence — ezért az új
        // tagot lokálisan `local-<uuid>` PK-val tároljuk, aztán a szerver-
        // insert sikere után töltjük ki a `server_id` mezőt.
        //
        // Eltérések a pénzügyi pending-mintáktól:
        //   - Nincs `iratszam` / `wallet_id` — szemely-nél nincs szám-pool.
        //   - `cnp` az egyetlen kliens-ismerős unique-azonosító, ezért a
        //     helyi dupláció-védelemre UNIQUE (congregation_id, cnp). A
        //     szerver-oldali UNIQUE pedig a Supabase schema felelőssége.
        //   - `xkey` nincs (a pénzügyi tábláknál ez a server-oldali
        //     idempotencia-kulcs; szemely-nél az id→server_id mapping
        //     végzi ugyanezt).
        //
        // Az M8.3 család-CRUD-ban egy `csalad_pending_local` tábla is
        // jön majd hasonló logikával, de külön migrációban (v17+).
        conn.execute_batch(
            r#"
            BEGIN;

            CREATE TABLE IF NOT EXISTS szemely_pending_local (
                id                       TEXT PRIMARY KEY,                     -- 'local-<uuid>'
                server_id                INTEGER,                              -- szemely.id, NULL amíg nincs sync
                congregation_id          TEXT NOT NULL,                        -- uuid

                -- Core identity
                cnp                      TEXT NOT NULL,
                szcs_nev                 TEXT,
                k_nev                    TEXT,
                csaladnev                TEXT,
                ferjk_nev                TEXT,
                allapot                  TEXT,

                -- Személyes
                sz_datum                 TEXT,                                 -- ISO 'YYYY-MM-DD'
                ferfi                    INTEGER NOT NULL DEFAULT 0,
                csaladfo                 INTEGER NOT NULL DEFAULT 0,
                meghalt                  INTEGER NOT NULL DEFAULT 0,
                member_status            TEXT DEFAULT 'aktív',

                -- Családfa (szülők névvel + CNP-hivatkozás)
                apjaneve                 TEXT,
                anyjaneve                TEXT,
                id_apja                  TEXT,
                id_anyja                 TEXT,

                -- Cím (szöveges V1-ben, az FK-k kimaradnak)
                c_szam                   TEXT,
                c_tombhaz                TEXT,
                c_lepcsohaz              TEXT,
                c_ajto                   TEXT,
                c_emelet                 TEXT,
                c_szcim                  TEXT,

                -- Elérhetőség
                telefon                  TEXT,
                email                    TEXT,

                -- Vallás / identitás
                vallas                   TEXT,
                foglalkozas              TEXT,
                nemzetiseg               TEXT,
                voter_eligible           INTEGER NOT NULL DEFAULT 0,

                -- Család FK (opcionális, UUID string)
                family_id                TEXT,

                -- Egyéb
                type                     TEXT,
                isvisible                INTEGER NOT NULL DEFAULT 1,
                megjegyzes               TEXT,

                -- Outbox-szerű metaadatok
                userid                   TEXT NOT NULL,                        -- rögzítő user.id
                sync_state               TEXT NOT NULL DEFAULT 'pending'
                                            CHECK (sync_state IN ('pending','synced','conflict')),
                sync_error               TEXT,
                retry_count              INTEGER NOT NULL DEFAULT 0,
                last_attempt_at          TEXT,
                created_at               TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at               TEXT NOT NULL DEFAULT (datetime('now')),

                UNIQUE (congregation_id, cnp)
            );

            CREATE INDEX IF NOT EXISTS idx_szemely_pending_congregation
                ON szemely_pending_local(congregation_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_szemely_pending_sync_state
                ON szemely_pending_local(sync_state, created_at);
            CREATE INDEX IF NOT EXISTS idx_szemely_pending_server_id
                ON szemely_pending_local(server_id);

            PRAGMA user_version = 16;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v16 migráció (szemely_pending_local) sikertelen: {e}"))?;
    }

    if current < 17 {
        // M8.3a — csalad_local + gyerek_local
        //
        // A `szemely_local` (M7.1) tag-szintű lokális tükre után a család-
        // szintű mirror. A Supabase család-modell:
        //   - `csalad` tábla: id (integer), id_ferfi (szemely.id FK),
        //     id_no (szemely.id FK), c_utcaid (adrstreet FK), cím-mezők,
        //     isaktiv, id_csoport (opcionális körzet-FK), revision, updated_at.
        //     ⚠ A `csalad` táblának NINCS közvetlen `congregation_id`-ja —
        //     a családot a szemely.id_ferfi / id_no congregation_id-ja
        //     alapján köthetjük a gyülekezethez.
        //   - `gyerek` tábla: id (integer), id_csalad (FK), id_szemely (FK),
        //     revision, updated_at. Junction-tábla a csalad ↔ szemely
        //     gyerek-kapcsolathoz (a szülőket a csalad.id_ferfi/id_no adja).
        //
        // Oszlop-választás V1-ben:
        //   - c_utcaid (integer FK) a jelenlegi V1 szerint szöveges cím-pótlék
        //     mellett marad, mint a szemely_local-nál. Későbbi M8.3+polish-
        //     ban az FK → `adrstreet.name` backfill jöhet.
        //   - id_csoport (körzet-FK) bekerül — később a körzet-lista-UI-hoz.
        //
        // A v16 `szemely_pending_local` mintájára ez READ-CACHE — a write-ág
        // az M8.3c alfázisban jön (csalad_pending_local + gyerek_pending_local,
        // vagy közös queue).
        conn.execute_batch(
            r#"
            BEGIN;

            CREATE TABLE IF NOT EXISTS csalad_local (
                id              INTEGER PRIMARY KEY,               -- csalad.id (integer sequence)
                id_ferfi        INTEGER,                           -- szemely.id FK, nullable
                id_no           INTEGER,                           -- szemely.id FK, nullable
                c_utcaid        INTEGER NOT NULL DEFAULT -1,       -- dummy a V1-ben
                c_szam          TEXT NOT NULL DEFAULT '',
                c_tombhaz       TEXT,
                c_lepcsohaz     TEXT,
                c_ajto          TEXT,
                c_emelet        TEXT,
                id_csoport      INTEGER,                            -- körzet-FK, nullable
                isaktiv         INTEGER NOT NULL DEFAULT 1,         -- 0/1 boolean
                revision        INTEGER NOT NULL DEFAULT 0,
                updated_at      TEXT,
                synced_at       TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_csalad_local_ferfi
                ON csalad_local(id_ferfi);
            CREATE INDEX IF NOT EXISTS idx_csalad_local_no
                ON csalad_local(id_no);
            CREATE INDEX IF NOT EXISTS idx_csalad_local_updated_at
                ON csalad_local(updated_at);

            CREATE TABLE IF NOT EXISTS gyerek_local (
                id              INTEGER PRIMARY KEY,               -- gyerek.id
                id_csalad       INTEGER NOT NULL,                  -- csalad.id FK
                id_szemely      INTEGER NOT NULL,                  -- szemely.id FK
                revision        INTEGER NOT NULL DEFAULT 0,
                updated_at      TEXT,
                synced_at       TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_gyerek_local_csalad
                ON gyerek_local(id_csalad);
            CREATE INDEX IF NOT EXISTS idx_gyerek_local_szemely
                ON gyerek_local(id_szemely);
            CREATE INDEX IF NOT EXISTS idx_gyerek_local_updated_at
                ON gyerek_local(updated_at);

            PRAGMA user_version = 17;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v17 migráció (csalad_local + gyerek_local) sikertelen: {e}"))?;
    }

    if current < 18 {
        // M8.3c — csalad_pending_local (write-offline a csalad-ra)
        //
        // A szemely_pending_local (v16) mintáját követi, de bővítve egy
        // `operation` oszloppal, hogy az INSERT és UPDATE mutation-ök
        // közös táblában éljenek. Az update-hez a `target_csalad_id` +
        // `expected_revision` fontos, az insert-hez pedig a teljes payload.
        //
        // Csak a `csalad` tábla CRUD-ja megy ide. A `gyerek` junction-ra
        // külön write-offline jön (M8.3d-ben), vagy az outbox-on keresztül
        // (egyszerűbb, ha a gyerek-insert is UPDATE-szerűen megy).
        conn.execute_batch(
            r#"
            BEGIN;

            CREATE TABLE IF NOT EXISTS csalad_pending_local (
                id                  TEXT PRIMARY KEY,                     -- 'local-<uuid>'
                server_id           INTEGER,                              -- csalad.id, NULL amíg nincs sync
                operation           TEXT NOT NULL
                                        CHECK (operation IN ('insert', 'update')),
                target_csalad_id    INTEGER,                              -- update esetén a csalad.id
                expected_revision   INTEGER,                              -- update conditional check-hez

                -- csalad oszlopok
                id_ferfi            INTEGER,
                id_no               INTEGER,
                c_utcaid            INTEGER NOT NULL DEFAULT -1,
                c_szam              TEXT,
                c_tombhaz           TEXT,
                c_lepcsohaz         TEXT,
                c_ajto              TEXT,
                c_emelet            TEXT,
                id_csoport          INTEGER,
                isaktiv             INTEGER NOT NULL DEFAULT 1,

                -- sync metaadatok
                userid              TEXT NOT NULL,
                sync_state          TEXT NOT NULL DEFAULT 'pending'
                                        CHECK (sync_state IN ('pending','synced','conflict')),
                sync_error          TEXT,
                retry_count         INTEGER NOT NULL DEFAULT 0,
                last_attempt_at     TEXT,
                created_at          TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_csalad_pending_sync_state
                ON csalad_pending_local(sync_state, created_at);
            CREATE INDEX IF NOT EXISTS idx_csalad_pending_target
                ON csalad_pending_local(target_csalad_id) WHERE target_csalad_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_csalad_pending_server_id
                ON csalad_pending_local(server_id) WHERE server_id IS NOT NULL;

            PRAGMA user_version = 18;
            COMMIT;
            "#,
        )
        .map_err(|e| format!("v18 migráció (csalad_pending_local) sikertelen: {e}"))?;
    }

    // Jövőbeli migrációk ide:
    // if current < 19 { ... PRAGMA user_version = 19; }

    Ok(())
}

// ───────────────────────────────────────────────────────────────────────────
// Tauri commands — a TS oldalról `invoke()`-kal hívhatók
// ───────────────────────────────────────────────────────────────────────────

/// Futtat egy DDL vagy DML SQL utasítást (CREATE/INSERT/UPDATE/DELETE).
/// Visszaadja az érintett sorok számát.
#[tauri::command]
pub fn db_execute(
    state: State<'_, DbState>,
    sql: String,
    params: Option<Vec<JsonValue>>,
) -> Result<usize, String> {
    let mut guard = state
        .conn
        .lock()
        .map_err(|e| format!("DB mutex zárolás sikertelen: {e}"))?;
    let conn = guard
        .as_mut()
        .ok_or_else(|| "A DB még nincs megnyitva".to_string())?;

    let params_vec = params.unwrap_or_default();
    let sql_params: Vec<rusqlite::types::Value> = params_vec.iter().map(json_to_sql).collect();

    conn.execute(&sql, params_from_iter(sql_params))
        .map_err(|e| format!("SQL execute hiba: {e}"))
}

/// Futtat egy SELECT-et és visszaadja a sorokat objektumok listájaként.
#[tauri::command]
pub fn db_select(
    state: State<'_, DbState>,
    sql: String,
    params: Option<Vec<JsonValue>>,
) -> Result<Vec<JsonMap<String, JsonValue>>, String> {
    let guard = state
        .conn
        .lock()
        .map_err(|e| format!("DB mutex zárolás sikertelen: {e}"))?;
    let conn = guard
        .as_ref()
        .ok_or_else(|| "A DB még nincs megnyitva".to_string())?;

    let params_vec = params.unwrap_or_default();
    let sql_params: Vec<rusqlite::types::Value> = params_vec.iter().map(json_to_sql).collect();

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("SQL prepare hiba: {e}"))?;

    let column_names: Vec<String> = stmt
        .column_names()
        .into_iter()
        .map(String::from)
        .collect();

    let rows_iter = stmt
        .query_map(params_from_iter(sql_params), |row| {
            let mut obj = JsonMap::new();
            for (i, name) in column_names.iter().enumerate() {
                let v = sql_value_to_json(row.get_ref(i)?);
                obj.insert(name.clone(), v);
            }
            Ok(obj)
        })
        .map_err(|e| format!("SQL select hiba: {e}"))?;

    rows_iter
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("Sor-iteráció hiba: {e}"))
}

// ───────────────────────────────────────────────────────────────────────────
// A-M7.2d2a — atomikus wallet-szám fogyasztás
// ───────────────────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct WalletClaim {
    pub szam: i64,
    pub sorozat: String,
    pub id: i64,
}

/// Atomikusan kivesz a wallet-ből egy szabad sorszámot és `used=1`-re állítja.
///
/// Miért Rust-oldali command? A `BEGIN/SELECT/UPDATE/COMMIT` szekvenciát
/// egyetlen `db_execute` hívással **nem lehet** atomikusan lefuttatni a TS
/// oldalon — ha két klienshívás gyorsan egymás után jön (pl. double-click),
/// race-ez. A Mutex<Connection> itt sorosít, és a BEGIN/COMMIT egy
/// tranzakcióba csomagolja a művelet két SQL utasítását.
///
/// Visszaadja: `Ok(Some(WalletClaim))` ha volt szabad szám,
///             `Ok(None)` ha nincs (üres wallet),
///             `Err(_)` DB-hiba esetén.
///
/// A `chitanta_local_id`-t a hívó adja — ez a majd létrehozott `chitantak_local`
/// sor PK-ja. Így a wallet-sor és a chitanta-sor kötése nyomonkövethető
/// az esetleges sztornó-flow-hoz.
#[tauri::command]
pub fn chitanta_wallet_claim_next(
    state: State<'_, DbState>,
    congregation_id: String,
    sorozat: Option<String>,
    chitanta_local_id: String,
) -> Result<Option<WalletClaim>, String> {
    let mut guard = state
        .conn
        .lock()
        .map_err(|e| format!("DB mutex zárolás sikertelen: {e}"))?;
    let conn = guard
        .as_mut()
        .ok_or_else(|| "A DB még nincs megnyitva".to_string())?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("Tranzakció indítás sikertelen: {e}"))?;

    // 1) Megkeressük a legkisebb szabad sorszámot (opcionálisan sorozat-szűrővel).
    let row_opt: Option<(i64, i64, String)> = match &sorozat {
        Some(s) => tx
            .query_row(
                "SELECT id, szam, sorozat FROM chitanta_wallet_local \
                 WHERE congregation_id = ?1 AND sorozat = ?2 AND used = 0 \
                 ORDER BY szam ASC LIMIT 1",
                rusqlite::params![congregation_id, s],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .ok(),
        None => tx
            .query_row(
                "SELECT id, szam, sorozat FROM chitanta_wallet_local \
                 WHERE congregation_id = ?1 AND used = 0 \
                 ORDER BY szam ASC LIMIT 1",
                rusqlite::params![congregation_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .ok(),
    };

    let Some((id, szam, found_sorozat)) = row_opt else {
        // Nincs szabad szám — rollback nem szükséges (nem írtunk),
        // de a tranzakciót tisztán zárjuk.
        tx.rollback().ok();
        return Ok(None);
    };

    // 2) Megjelöljük használtnak + kapcsolunk a chitanta_local_id-hoz.
    tx.execute(
        "UPDATE chitanta_wallet_local \
         SET used = 1, used_at = datetime('now'), used_for_chitanta_local_id = ?1 \
         WHERE id = ?2",
        rusqlite::params![chitanta_local_id, id],
    )
    .map_err(|e| format!("Wallet-szám használt-jelölés sikertelen: {e}"))?;

    tx.commit()
        .map_err(|e| format!("Tranzakció commit sikertelen: {e}"))?;

    Ok(Some(WalletClaim {
        szam,
        sorozat: found_sorozat,
        id,
    }))
}

/// A claim visszavonása — ha a chitanta-kiállítás meghiúsul (pl. validáció,
/// DB-hiba), a lefoglalt szám visszakerül a pool-ba. **Csak akkor hívd, ha
/// tudod, hogy a `used_for_chitanta_local_id` még nem ment tovább az
/// outbox-ba / nem sync-elt.**
#[tauri::command]
pub fn chitanta_wallet_release(
    state: State<'_, DbState>,
    wallet_id: i64,
) -> Result<(), String> {
    let mut guard = state
        .conn
        .lock()
        .map_err(|e| format!("DB mutex zárolás sikertelen: {e}"))?;
    let conn = guard
        .as_mut()
        .ok_or_else(|| "A DB még nincs megnyitva".to_string())?;

    conn.execute(
        "UPDATE chitanta_wallet_local \
         SET used = 0, used_at = NULL, used_for_chitanta_local_id = NULL \
         WHERE id = ?1",
        rusqlite::params![wallet_id],
    )
    .map_err(|e| format!("Wallet-szám release sikertelen: {e}"))?;

    Ok(())
}

// ───────────────────────────────────────────────────────────────────────────
// A-M7.9a — atomikus iratszám-wallet (befizetés + kiadás közös)
// ───────────────────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct IratszamClaim {
    pub szam: i64,
    pub id: i64,
}

/// Atomikusan kivesz egy szabad iratszámot az `iratszam_wallet_local`-ból a
/// (congregation × tipus × ev) szegmensből, és `used=1`-re állítja.
///
/// A chitanta-mintával analóg (lásd `chitanta_wallet_claim_next`): a SELECT MIN
/// + UPDATE egyetlen `BEGIN/COMMIT` blokkban fut a `Mutex<Connection>` mögött,
/// így két párhuzamos hívás (pl. duplicate-click) nem kap ugyanarra a számra.
///
/// A `local_id`-t a hívó adja — ez a majd létrehozott `befizetes_pending_local`
/// (vagy később `kiadas_pending_local`) sor PK-ja. Így a wallet-sor és a
/// pending-sor kötése audit-trailbe nyomonkövethető.
///
/// Visszaadja:
///   - `Ok(Some(IratszamClaim))` ha volt szabad szám
///   - `Ok(None)` ha üres a wallet
///   - `Err(_)` DB-hiba esetén
#[tauri::command]
pub fn iratszam_wallet_claim_next(
    state: State<'_, DbState>,
    congregation_id: String,
    iratszam_tipus: String,
    ev: i64,
    local_id: String,
) -> Result<Option<IratszamClaim>, String> {
    if iratszam_tipus != "befizetes" && iratszam_tipus != "kiadas" {
        return Err(format!(
            "Ismeretlen iratszam_tipus: '{}' (várt: 'befizetes' vagy 'kiadas')",
            iratszam_tipus
        ));
    }

    let mut guard = state
        .conn
        .lock()
        .map_err(|e| format!("DB mutex zárolás sikertelen: {e}"))?;
    let conn = guard
        .as_mut()
        .ok_or_else(|| "A DB még nincs megnyitva".to_string())?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("Tranzakció indítás sikertelen: {e}"))?;

    // 1) Legkisebb szabad szám a (congregation, tipus, ev) szegmensben
    let row_opt: Option<(i64, i64)> = tx
        .query_row(
            "SELECT id, szam FROM iratszam_wallet_local \
             WHERE congregation_id = ?1 AND iratszam_tipus = ?2 AND ev = ?3 AND used = 0 \
             ORDER BY szam ASC LIMIT 1",
            rusqlite::params![congregation_id, iratszam_tipus, ev],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    let Some((id, szam)) = row_opt else {
        tx.rollback().ok();
        return Ok(None);
    };

    // 2) Megjelöljük használtnak + kapcsoljuk a pending-sorhoz
    tx.execute(
        "UPDATE iratszam_wallet_local \
         SET used = 1, used_at = datetime('now'), used_for_local_id = ?1 \
         WHERE id = ?2",
        rusqlite::params![local_id, id],
    )
    .map_err(|e| format!("Iratszám-wallet használt-jelölés sikertelen: {e}"))?;

    tx.commit()
        .map_err(|e| format!("Tranzakció commit sikertelen: {e}"))?;

    Ok(Some(IratszamClaim { szam, id }))
}

/// Az `iratszam_wallet_claim_next` visszavonása. Csak akkor hívd, ha a
/// pending-sor mentése (vagy az outbox-enqueue) meghiúsult, és a szám még
/// nem ment ki szerverre.
#[tauri::command]
pub fn iratszam_wallet_release(state: State<'_, DbState>, wallet_id: i64) -> Result<(), String> {
    let mut guard = state
        .conn
        .lock()
        .map_err(|e| format!("DB mutex zárolás sikertelen: {e}"))?;
    let conn = guard
        .as_mut()
        .ok_or_else(|| "A DB még nincs megnyitva".to_string())?;

    conn.execute(
        "UPDATE iratszam_wallet_local \
         SET used = 0, used_at = NULL, used_for_local_id = NULL \
         WHERE id = ?1",
        rusqlite::params![wallet_id],
    )
    .map_err(|e| format!("Iratszám-wallet release sikertelen: {e}"))?;

    Ok(())
}

// ───────────────────────────────────────────────────────────────────────────
// JSON ↔ SQL érték-konverziók
// ───────────────────────────────────────────────────────────────────────────

fn json_to_sql(v: &JsonValue) -> rusqlite::types::Value {
    use rusqlite::types::Value;
    match v {
        JsonValue::Null => Value::Null,
        JsonValue::Bool(b) => Value::Integer(if *b { 1 } else { 0 }),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::Integer(i)
            } else if let Some(f) = n.as_f64() {
                Value::Real(f)
            } else {
                Value::Null
            }
        }
        JsonValue::String(s) => Value::Text(s.clone()),
        _ => Value::Text(v.to_string()),
    }
}

fn sql_value_to_json(v: rusqlite::types::ValueRef<'_>) -> JsonValue {
    use rusqlite::types::ValueRef;
    match v {
        ValueRef::Null => JsonValue::Null,
        ValueRef::Integer(i) => JsonValue::from(i),
        ValueRef::Real(f) => JsonValue::from(f),
        ValueRef::Text(t) => JsonValue::String(String::from_utf8_lossy(t).to_string()),
        ValueRef::Blob(_) => JsonValue::String("[BLOB]".to_string()),
    }
}
