// Kartotéka Desktop — Supabase session tárolás Tauri keyring-ben (M6.6, 2026-04-22).
//
// A Supabase JS kliens alapértelmezetten `localStorage`-ba menti a session-t
// (access_token + refresh_token + expires_at JSON). A localStorage-ban tárolt
// token böngésző DevTools-ból egyszerűen kiolvasható.
//
// Az M6.6-ben ezt felváltjuk az **OS-szintű keyring-re**: Windows Credential
// Manager (DPAPI), macOS Keychain, Linux Secret Service. A fizikai gép-
// hozzáférés sem ad automatikus olvasást.
//
// A `keyring` crate már használva van az SQLCipher-kulcshoz (M2.3) és a
// device-keypair-hez (M3.3), tehát nincs új függőség — csak új entry-k.
//
// API (3 Tauri command, localStorage-szerű kulcsonkénti tárolás):
//   - auth_store_item(key: String, value: String) -> Result<(), String>
//   - auth_read_item(key: String) -> Result<Option<String>, String>
//   - auth_clear_item(key: String) -> Result<(), String>
//
// Kulcs-korlátozás: CSAK `auth-` prefixű kulcsok engedélyezettek (a Supabase
// session-kulcsai ebbe a családba esnek, ld. storageKey config). Így ha valami
// más kód is használná ezeket a command-okat, nem tud véletlenül más slot-ot
// módosítani (pl. SQLCipher DB-kulcs, device privkey).
//
// A TS oldal egy custom `SupabaseAuthStorage` adapter-rel köti be (ld.
// apps/desktop/src/lib/supabase.ts). A Supabase JS `storage` opciója
// szintaktikusan localStorage-kompatibilis.
//
// Biztonsági megjegyzés:
//   A session JSON tartalmaz egy 30 napos refresh tokent. Ezt védi a keyring,
//   de ha a user gépét kompromittálják, a token hozzáférhető. Ennél szigorúbb
//   védelem (pl. Windows Hello PIN) M13-ban, az E2E doc-titkosítással együtt.

use keyring::{Entry, Error as KeyringError};

const KEYRING_SERVICE: &str = "kartoteka-desktop";
const AUTH_KEY_PREFIX: &str = "auth-";

/// A TS-ből érkező kulcs validálása + sanitize — csak `auth-` prefixű kulcsok,
/// és csak alphanumerikus / - / _ / . / : karakterek maradnak.
fn sanitize_key(raw: &str) -> Result<String, String> {
    if !raw.starts_with(AUTH_KEY_PREFIX) {
        return Err(format!(
            "Tiltott keyring kulcs prefix: '{raw}' — csak '{AUTH_KEY_PREFIX}...' engedélyezett."
        ));
    }
    if raw.len() > 128 {
        return Err(format!(
            "Keyring kulcs túl hosszú ({} karakter, max 128).",
            raw.len()
        ));
    }
    let sanitized: String = raw
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ':') {
                c
            } else {
                '_'
            }
        })
        .collect();
    Ok(sanitized)
}

fn open_entry(raw_key: &str) -> Result<Entry, String> {
    let sanitized = sanitize_key(raw_key)?;
    Entry::new(KEYRING_SERVICE, &sanitized)
        .map_err(|e| format!("Keyring entry '{sanitized}' hiba: {e}"))
}

#[tauri::command]
pub fn auth_store_item(key: String, value: String) -> Result<(), String> {
    let entry = open_entry(&key)?;
    entry
        .set_password(&value)
        .map_err(|e| format!("Keyring '{key}' mentés sikertelen: {e}"))
}

#[tauri::command]
pub fn auth_read_item(key: String) -> Result<Option<String>, String> {
    let entry = open_entry(&key)?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(format!("Keyring '{key}' olvasás sikertelen: {e}")),
    }
}

#[tauri::command]
pub fn auth_clear_item(key: String) -> Result<(), String> {
    let entry = open_entry(&key)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        // Ha eleve nincs bent semmi, az nem hiba — idempotens logout.
        Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(format!("Keyring '{key}' törlés sikertelen: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_key_accepts_valid_prefix() {
        assert_eq!(sanitize_key("auth-token").unwrap(), "auth-token");
        assert_eq!(sanitize_key("auth-sb-abc123").unwrap(), "auth-sb-abc123");
        assert_eq!(
            sanitize_key("auth-sb-xyz.refresh_token:v1").unwrap(),
            "auth-sb-xyz.refresh_token:v1"
        );
    }

    #[test]
    fn sanitize_key_replaces_invalid_chars() {
        assert_eq!(sanitize_key("auth-foo/bar").unwrap(), "auth-foo_bar");
        assert_eq!(sanitize_key("auth-foo bar").unwrap(), "auth-foo_bar");
    }

    #[test]
    fn sanitize_key_rejects_wrong_prefix() {
        assert!(sanitize_key("sqlcipher-key").is_err());
        assert!(sanitize_key("device-privkey").is_err());
        assert!(sanitize_key("").is_err());
    }

    #[test]
    fn sanitize_key_rejects_long_keys() {
        let long = "auth-".to_string() + &"a".repeat(130);
        assert!(sanitize_key(&long).is_err());
    }
}
