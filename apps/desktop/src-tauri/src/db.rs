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
pub struct DbState {
    pub conn: Mutex<Option<Connection>>,
}

impl DbState {
    pub fn new() -> Self {
        Self {
            conn: Mutex::new(None),
        }
    }
}

impl Default for DbState {
    fn default() -> Self {
        Self::new()
    }
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

    // Jövőbeli migrációk ide:
    // if current < 4 { ... PRAGMA user_version = 4; }

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
