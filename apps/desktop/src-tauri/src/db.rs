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

    // Jövőbeli migrációk ide:
    // if current < 8 { ... PRAGMA user_version = 8; }

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
