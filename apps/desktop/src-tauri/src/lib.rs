// Kartotéka Desktop — Tauri Rust backend (M1.2 placeholder).
//
// Az M1.3-tól ide kerülnek:
//  - custom Tauri parancsok (Supabase-token átadás, eszköz-fingerprint, stb.)
//  - SQLCipher-hez kötődő rust-oldali wrapper (M2)
//  - Stronghold kulcstár integráció (M2)
//
// Egyelőre csak egy "greet" demo-parancs, ami bizonyítja, hogy a Rust ↔ JS
// híd működik.

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Üdv, {}! A Rust-oldali híd működik.", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("Tauri alkalmazás indítása meghiúsult");
}
