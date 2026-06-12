//! Avatar-képletöltés (2026-06-11, Endre kérése).
//!
//! A közösségi profilképek letöltése a Tauri WEBVIEW-ból CORS-korlátos
//! (a graph.facebook.com/fbcdn/instagram nem ad ACAO-headert) — ezért a
//! letöltés Rust-oldalon fut (reqwest), és base64-ben adja vissza a képet.
//! A frontend tölti fel a Supabase Storage-ba (auth-olt supabase-js).
//!
//! CSAK letöltés — fájlrendszert nem ír, kizárólag http(s) URL-t fogad.

use base64::Engine as _;
use serde::Serialize;

const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedImage {
    /// Nyers base64 (data:-prefix nélkül).
    pub base64: String,
    pub mime: String,
}

/// Kép letöltése egy URL-ről (redirect-követéssel, böngésző User-Agenttel).
/// Nem-kép tartalomra vagy 5 MB felett hibát ad.
#[tauri::command]
pub async fn fetch_image(url: String) -> Result<FetchedImage, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Csak http(s) URL tölthető le.".to_string());
    }
    let client = reqwest::Client::builder()
        .user_agent(BROWSER_UA)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP-kliens hiba: {e}"))?;

    let resp = client
        .get(&url)
        .header("Accept", "image/*,*/*;q=0.8")
        .send()
        .await
        .map_err(|e| format!("Letöltési hiba: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("A letöltés nem sikerült (HTTP {}).", resp.status().as_u16()));
    }
    let mime = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.split(';').next().unwrap_or("").trim().to_string())
        .unwrap_or_else(|| "image/jpeg".to_string());
    if !mime.starts_with("image/") {
        return Err("A link nem képet adott vissza.".to_string());
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Letöltési hiba: {e}"))?;
    if bytes.is_empty() {
        return Err("Üres kép érkezett.".to_string());
    }
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("A kép túl nagy (max 5 MB).".to_string());
    }
    Ok(FetchedImage {
        base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
        mime,
    })
}

/// Szöveges tartalom (HTML) letöltése — az og:image best-effort scrape-hez.
/// Max 2 MB; csak http(s).
#[tauri::command]
pub async fn fetch_page_text(url: String) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Csak http(s) URL tölthető le.".to_string());
    }
    let client = reqwest::Client::builder()
        .user_agent(BROWSER_UA)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP-kliens hiba: {e}"))?;
    let resp = client
        .get(&url)
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
        .map_err(|e| format!("Letöltési hiba: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("A lekérés nem sikerült (HTTP {}).", resp.status().as_u16()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Letöltési hiba: {e}"))?;
    let slice = &bytes[..bytes.len().min(2 * 1024 * 1024)];
    Ok(String::from_utf8_lossy(slice).to_string())
}
