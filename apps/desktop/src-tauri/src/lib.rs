// Kartotéka Desktop — Tauri Rust backend
//
// M1.2  : üres Tauri 2 váz — greet demo
// M1.5  : desktop login képernyő (frontend-oldali munka)
// M2.1  : lokális SQLite integráció (tauri-plugin-sql) ← MOST ITT
// M2.2+ : SQLCipher (kulcs a Stronghold-ban)
// M2.3+ : outbox + push-sync + konfliktus-kezelés

use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

/// A Tauri alkalmazás belépési pontja.
///
/// A plugin-sql az alkalmazás data-directory-ban hozza létre a `kartoteka.db`
/// fájlt (Windows alatt: `%APPDATA%\com.erek.kartoteka\kartoteka.db`).
/// A séma az alábbi `migrations()`-ben definiáltak szerint verziózva van.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = migrations();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:kartoteka.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("Tauri alkalmazás indítása meghiúsult");
}

// ───────────────────────────────────────────────────────────────────────────
// Séma-migrációk — sorszámozott, idempotens DDL-blokkok.
// Minden új verzió ÚJ `Migration` objektumot ad hozzá, a régieket NEM módosítjuk.
// ───────────────────────────────────────────────────────────────────────────
fn migrations() -> Vec<Migration> {
    vec![
        // v1 — alap séma: minimális settings és outbox séma, hogy az M2.1 demó futhasson.
        Migration {
            version: 1,
            description: "kartoteka_initial_schema",
            sql: r#"
                CREATE TABLE IF NOT EXISTS settings (
                    key         TEXT PRIMARY KEY,
                    value       TEXT NOT NULL,
                    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
                );

                -- Outbox az offline írásokhoz (M2.3-ben tölt fel igazi tartalommal).
                CREATE TABLE IF NOT EXISTS outbox (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    op          TEXT NOT NULL CHECK (op IN ('insert','update','delete')),
                    target_table TEXT NOT NULL,
                    target_id   TEXT,
                    payload     TEXT NOT NULL,
                    status      TEXT NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','sent','failed')),
                    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                    retry_count INTEGER NOT NULL DEFAULT 0,
                    last_error  TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_outbox_status_created
                    ON outbox(status, created_at);
            "#,
            kind: MigrationKind::Up,
        },
        // Jövőbeli migrációk (v2, v3…) ide kerülnek majd:
        // Migration { version: 2, description: "add_members_table", ... }
    ]
}

// ───────────────────────────────────────────────────────────────────────────
// Demo Tauri parancs — M1.2 óta itt él, csak tesztelésre
// ───────────────────────────────────────────────────────────────────────────
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Üdv, {}! A Rust-oldali híd működik.", name)
}
