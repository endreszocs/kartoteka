// Kartotéka Desktop — Tauri Rust backend
//
// M1.2  : üres Tauri 2 váz — greet demo
// M1.5  : desktop login képernyő (frontend-oldali munka)
// M2.1  : lokális SQLite (tauri-plugin-sql) — eltávolítva az M2.2-ben
// M2.2  : SQLCipher-titkosított SQLite + saját Tauri commands ← MOST ITT
// M2.3+ : Stronghold kulcstár (a SQLCipher-kulcsot tárolja)
// M2.4+ : outbox + pull/push-sync + konfliktus-kezelés

mod auth;
mod auth_pin;
mod db;
mod device;
mod avatar;
mod excel;

use auth::{auth_clear_item, auth_read_item, auth_store_item};
use auth_pin::{
    auth_pin_clear, auth_pin_has, auth_pin_set, auth_pin_status, auth_pin_verify,
};
use db::{
    chitanta_wallet_claim_next, chitanta_wallet_release, db_execute, db_select, db_status,
    iratszam_wallet_claim_next, iratszam_wallet_release, open_and_migrate, DbState,
};
use device::device_info;
use avatar::{fetch_image, fetch_page_text};
use excel::{
    excel_append_rows, excel_default_folder, excel_folder_info, excel_list_sheets,
    excel_open_folder, excel_read_cells, excel_read_meta, excel_read_sheet_sums,
    excel_save_file, excel_set_cells, excel_setup_folder, oblio_default_folder,
    oblio_folder_info, oblio_setup_folder,
};
use tauri::Manager;

/// Tauri alkalmazás belépési pont.
///
/// A `setup()` blokk első lépése a DB megnyitása + migrációk futtatása.
/// Ha bármi hibára fut, az app elindul (ne akadja a UI-t), de a DB-state
/// üresen marad — a TS-oldal kliens-hívásai a `"A DB még nincs megnyitva"`
/// hibával térnek vissza.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(DbState::new())
        .setup(|app| {
            let state: tauri::State<DbState> = app.state();
            match open_and_migrate(app.handle()) {
                Ok(conn) => {
                    let mut guard = state
                        .conn
                        .lock()
                        .expect("DbState mutex poisoned a DB megnyitás közben");
                    *guard = Some(conn);
                    eprintln!("[Kartotéka] SQLCipher DB megnyitva és migrálva.");
                }
                Err(e) => {
                    eprintln!("[Kartotéka] DB megnyitás / migráció hiba: {e}");
                    // Rögzítsük az init-hibát a state-be, hogy a frontend (db_status)
                    // le tudja kérni — különben a user csak generic "nincs megnyitva"-hibát
                    // lát, anélkül, hogy tudná, miért.
                    let mut err_guard = state
                        .init_error
                        .lock()
                        .expect("DbState init_error mutex poisoned");
                    *err_guard = Some(e);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            db_execute,
            db_select,
            db_status,
            device_info,
            auth_store_item,
            auth_read_item,
            auth_clear_item,
            auth_pin_has,
            auth_pin_set,
            auth_pin_verify,
            auth_pin_clear,
            auth_pin_status,
            chitanta_wallet_claim_next,
            chitanta_wallet_release,
            iratszam_wallet_claim_next,
            iratszam_wallet_release,
            excel_list_sheets,
            excel_read_meta,
            excel_read_cells,
            fetch_image,
            fetch_page_text,
            excel_read_sheet_sums,
            excel_set_cells,
            excel_save_file,
            excel_append_rows,
            excel_default_folder,
            excel_folder_info,
            excel_setup_folder,
            excel_open_folder,
            oblio_default_folder,
            oblio_folder_info,
            oblio_setup_folder
        ])
        .run(tauri::generate_context!())
        .expect("Tauri alkalmazás indítása meghiúsult");
}

// ───────────────────────────────────────────────────────────────────────────
// Demo Tauri parancs — M1.2 óta itt él, csak tesztelésre
// ───────────────────────────────────────────────────────────────────────────
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Üdv, {}! A Rust-oldali híd működik.", name)
}
