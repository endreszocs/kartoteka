// Kartotéka Desktop — SQLCipher adatbázis-réteg (M2.2).
//
// Ez a modul:
//   1. Megnyit egy SQLCipher-titkosított SQLite fájlt az app-data mappában
//      (`%APPDATA%\com.erek.kartoteka\kartoteka.db`)
//   2. Lefuttatja a séma-migrációkat (PRAGMA user_version alapján)
//   3. Két `#[tauri::command]`-ot exportál a TS oldalnak:
//        - `db_execute(sql, params)` → DDL/DML, visszaadja az érintett sorok számát
//        - `db_select(sql, params)`  → SELECT, visszaad egy Vec<JsonObject>-ot
//
// Állapot: a `DbState`-et `tauri::manage()` tartalmazza. Egy globális, mutexelt
// kapcsolat — alkalmazás-szintű DB egyszerre egy query. Későbbi optimalizáció
// (r2d2 pool, read/write separation) M2.4-nél jöhet, ha kell.
//
// ⚠️ Biztonság: jelenleg a DB-kulcs **statikus fejlesztői kulcs** (`DEV_DB_KEY`
// konstans). Ez NEM production-safe. M2.3-ban a kulcs a Stronghold kulcstárból
// jön (user-jelszóból derivált). Addig minden titkosítás "nominálisan titkosított"
// — a bináris visszafejthető, ha a támadó hozzáfér a kliens-kódhoz.

use rusqlite::{params_from_iter, Connection, OpenFlags};
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

/// M2.2 statikus dev-kulcs — M2.3-ban Stronghold-ból érkezik.
const DEV_DB_KEY: &str = "kartoteka-dev-key-m2.2-2026";

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

/// Megnyitja a DB-t (létrehozza, ha nincs), beállítja a SQLCipher kulcsot, és
/// lefuttatja a pending migrációkat. A `setup()` belőle hívódik, nem
/// felhasználó-indítottan.
pub fn open_and_migrate(app: &AppHandle) -> Result<Connection, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Nem sikerült lekérni az app-data könyvtárat: {e}"))?;

    // Hozzuk létre a könyvtárat, ha még nincs
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

    // SQLCipher kulcs. A `pragma_update` a string értéket escape-elve adja át a
    // SQLCipher-nek (`PRAGMA key = 'kartoteka-dev-key-m2.2-2026'`).
    conn.pragma_update(None, "key", DEV_DB_KEY)
        .map_err(|e| format!("SQLCipher PRAGMA key sikertelen: {e}"))?;

    // Ellenőrző olvasás: ha a kulcs rossz (pl. az M2.1-es sima SQLite fájl),
    // a `SELECT count(*) FROM sqlite_master` panaszkodni fog.
    let _sanity: i64 = conn
        .query_row("SELECT count(*) FROM sqlite_master", [], |row| row.get(0))
        .map_err(|e| format!("SQLCipher sanity-check sikertelen (rossz kulcs?): {e}"))?;

    run_migrations(&conn)?;

    Ok(conn)
}

/// Verzió-alapú migráció `PRAGMA user_version` alapján. Minden új séma-verzió
/// kap egy `if current < N { ... PRAGMA user_version = N; }` blokkot. A
/// korábbi blokkokat **soha nem** módosítjuk.
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

    // Jövőbeli migrációk ide:
    // if current < 2 { ... PRAGMA user_version = 2; }

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
/// Minden sor egy `{ "col1": value1, "col2": value2, ... }` JSON objektum.
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
        // Array / Object — stringify JSON-ként tároljuk
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
