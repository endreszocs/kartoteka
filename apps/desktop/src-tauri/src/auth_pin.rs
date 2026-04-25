// Kartotéka Desktop — Offline PIN hitelesítés (A-M6.9, 2026-04-22).
//
// MIÉRT KELL:
//   A Supabase JWT refresh token 30 napos élettartamú. Ha a lelkész ennél
//   hosszabb ideig offline van (falvak, szolgálati utak, gyenge net),
//   a refresh token lejár és a user kizáródik a saját, lokálisan tárolt
//   adataiból is. Az offline PIN ezt a rést zárja be: egy rövid kódot
//   (4-64 karakter, Argon2id-hash-elve) tárolunk az OS keyring-ben, amivel
//   a user offline-módban is be tud lépni és olvasni tud a SQLCipher-ből.
//
// MIT TESZ:
//   - auth_pin_set(pin)       — PIN-hash létrehozása + lockout-state reset
//   - auth_pin_verify(pin)    — PIN-ellenőrzés + exponential lockout
//   - auth_pin_status()       — has_pin, locked_until, failed_attempts
//   - auth_pin_clear()        — PIN törlése (logout / reset)
//
// MIT NEM TESZ:
//   - NEM cserél Supabase session-t: a sikeres PIN-verify csak "offline-mode"
//     flag-et ad; online-ba kapcsolódáskor új jelszavas login kell, ha a
//     refresh token is lejárt.
//   - NEM kriptó-kulcs: a SQLCipher-kulcs külön slot-ban él (M2.3 óta),
//     nem derivált PIN-ből. A PIN csak **auth-gate**, nem crypto-KEK.
//     (M13-ban a Stronghold + argon2-derivált KEK külön projekt.)
//
// LOCKOUT-SZABÁLYZAT (keyring-perzisztens, újraindítás-álló):
//   - 3 rossz PIN     → 30 másodperc várakozás
//   - 5 rossz PIN     → 5 perc várakozás
//   - 7 rossz PIN     → 1 óra várakozás
//   - 10 rossz PIN    → FORCE LOGOUT: PIN-hash törlődik, újra online-login
//
// BIZTONSÁGI MEGJEGYZÉS:
//   - Argon2id paraméterek: a crate default (m=19456 KiB, t=2, p=1) — OWASP 2023
//   - A lockout-timer a rendszer-óra manipulálásával kerülhető, DE ez csak a
//     brute-force lassítás ellen szól; valós támadás már keyring-szintű
//     hozzáférést igényelne, és ott más crypto-véd van (SQLCipher, Stronghold).

use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
    Argon2,
};
use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

const KEYRING_SERVICE: &str = "kartoteka-desktop";
const KEYRING_PIN_HASH: &str = "pin-hash";
const KEYRING_PIN_LOCKOUT: &str = "pin-lockout";

const MIN_PIN_LENGTH: usize = 4;
const MAX_PIN_LENGTH: usize = 64;

/// (failed_attempts küszöb, lockout időtartama ms-ben)
const LOCKOUT_THRESHOLDS: &[(u32, u64)] = &[
    (3, 30_000),             // 3. után 30 mp
    (5, 5 * 60_000),         // 5. után 5 perc
    (7, 60 * 60_000),        // 7. után 1 óra
];
const FORCE_LOGOUT_AFTER: u32 = 10;

#[derive(Serialize, Deserialize, Default, Debug, Clone)]
struct LockoutState {
    failed_attempts: u32,
    locked_until_ms: Option<u64>,
}

fn current_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn open_entry(key: &str) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, key)
        .map_err(|e| format!("Keyring entry '{key}' hiba: {e}"))
}

fn read_lockout() -> Result<LockoutState, String> {
    let entry = open_entry(KEYRING_PIN_LOCKOUT)?;
    match entry.get_password() {
        Ok(json) => {
            serde_json::from_str(&json).map_err(|e| format!("Lockout JSON parse hiba: {e}"))
        }
        Err(KeyringError::NoEntry) => Ok(LockoutState::default()),
        Err(e) => Err(format!("Lockout olvasás sikertelen: {e}")),
    }
}

fn write_lockout(state: &LockoutState) -> Result<(), String> {
    let entry = open_entry(KEYRING_PIN_LOCKOUT)?;
    let json = serde_json::to_string(state).map_err(|e| format!("Lockout serialize hiba: {e}"))?;
    entry
        .set_password(&json)
        .map_err(|e| format!("Lockout mentés sikertelen: {e}"))
}

fn clear_lockout() -> Result<(), String> {
    let entry = open_entry(KEYRING_PIN_LOCKOUT)?;
    match entry.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(format!("Lockout törlés sikertelen: {e}")),
    }
}

fn clear_pin_hash() -> Result<(), String> {
    let entry = open_entry(KEYRING_PIN_HASH)?;
    match entry.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(format!("PIN törlés sikertelen: {e}")),
    }
}

/// A következő lockout-küszöbig hátralévő kísérletek száma (UI-nak).
fn attempts_until_next_threshold(failed_attempts: u32) -> Option<u32> {
    LOCKOUT_THRESHOLDS
        .iter()
        .find(|(threshold, _)| *threshold > failed_attempts)
        .map(|(threshold, _)| *threshold - failed_attempts)
}

// ────────────────────────────────────────────────────────────────────────
// Tauri command-ok
// ────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn auth_pin_has() -> Result<bool, String> {
    let entry = open_entry(KEYRING_PIN_HASH)?;
    match entry.get_password() {
        Ok(_) => Ok(true),
        Err(KeyringError::NoEntry) => Ok(false),
        Err(e) => Err(format!("PIN-státusz olvasás sikertelen: {e}")),
    }
}

#[tauri::command]
pub fn auth_pin_set(pin: String) -> Result<(), String> {
    if pin.len() < MIN_PIN_LENGTH {
        return Err(format!(
            "A PIN legalább {MIN_PIN_LENGTH} karakterből álljon."
        ));
    }
    if pin.len() > MAX_PIN_LENGTH {
        return Err(format!(
            "A PIN legfeljebb {MAX_PIN_LENGTH} karakter lehet."
        ));
    }

    let salt = SaltString::generate(&mut OsRng);
    let argon = Argon2::default();
    let hash = argon
        .hash_password(pin.as_bytes(), &salt)
        .map_err(|e| format!("PIN hash-elés sikertelen: {e}"))?
        .to_string();

    let entry = open_entry(KEYRING_PIN_HASH)?;
    entry
        .set_password(&hash)
        .map_err(|e| format!("PIN mentés sikertelen: {e}"))?;
    clear_lockout()?;
    Ok(())
}

#[derive(Serialize, Debug)]
pub struct PinVerifyResult {
    /// Sikeres PIN-ellenőrzés. Ha true, a kliens offline-mode-ba válthat.
    pub ok: bool,
    /// Ha lockout-ban vagyunk, ez mondja meg, mikor próbálkozhat újra (ms óta epoch).
    pub locked_until_ms: Option<u64>,
    /// Hány kísérlet maradt a következő lockout-küszöbig (UI-nak).
    pub attempts_remaining: Option<u32>,
    /// Elérte-e a FORCE_LOGOUT küszöböt — ilyenkor a PIN automatikusan törlődik,
    /// és újra online-login kell.
    pub force_logout: bool,
}

#[tauri::command]
pub fn auth_pin_verify(pin: String) -> Result<PinVerifyResult, String> {
    // Lockout check első
    let mut lockout = read_lockout()?;
    let now = current_ms();
    if let Some(until) = lockout.locked_until_ms {
        if until > now {
            return Ok(PinVerifyResult {
                ok: false,
                locked_until_ms: Some(until),
                attempts_remaining: None,
                force_logout: false,
            });
        }
        // Lockout lejárt — a counter nem resetelődik automatikusan (a következő
        // rossz PIN azonnal újabb lockout-t válthat ki), csak a `locked_until_ms`
        // null-ra megy. Ezt a write_lockout az end-en mentí ha volt failed.
        lockout.locked_until_ms = None;
    }

    // PIN-hash betöltés
    let entry = open_entry(KEYRING_PIN_HASH)?;
    let stored_hash = match entry.get_password() {
        Ok(h) => h,
        Err(KeyringError::NoEntry) => {
            return Err(
                "Nincs beállítva offline PIN. Először online jelentkezz be."
                    .to_string(),
            );
        }
        Err(e) => return Err(format!("PIN-hash olvasás sikertelen: {e}")),
    };

    let parsed = PasswordHash::new(&stored_hash)
        .map_err(|e| format!("PIN-hash parse hiba: {e}"))?;
    let verified = Argon2::default()
        .verify_password(pin.as_bytes(), &parsed)
        .is_ok();

    if verified {
        // Sikerült: lockout-state törlése
        clear_lockout()?;
        return Ok(PinVerifyResult {
            ok: true,
            locked_until_ms: None,
            attempts_remaining: None,
            force_logout: false,
        });
    }

    // Sikertelen — növeljük az attempts-et
    lockout.failed_attempts = lockout.failed_attempts.saturating_add(1);

    // Force logout küszöb
    if lockout.failed_attempts >= FORCE_LOGOUT_AFTER {
        clear_pin_hash()?;
        clear_lockout()?;
        return Ok(PinVerifyResult {
            ok: false,
            locked_until_ms: None,
            attempts_remaining: None,
            force_logout: true,
        });
    }

    // Lockout-duration meghatározása (a legnagyobb elért küszöb időtartama)
    let lockout_duration = LOCKOUT_THRESHOLDS
        .iter()
        .rev()
        .find(|(threshold, _)| lockout.failed_attempts >= *threshold)
        .map(|(_, duration)| *duration);

    if let Some(duration) = lockout_duration {
        lockout.locked_until_ms = Some(now + duration);
    }

    write_lockout(&lockout)?;

    Ok(PinVerifyResult {
        ok: false,
        locked_until_ms: lockout.locked_until_ms,
        attempts_remaining: attempts_until_next_threshold(lockout.failed_attempts),
        force_logout: false,
    })
}

#[tauri::command]
pub fn auth_pin_clear() -> Result<(), String> {
    clear_pin_hash()?;
    clear_lockout()?;
    Ok(())
}

#[derive(Serialize, Debug)]
pub struct PinStatus {
    pub has_pin: bool,
    pub locked_until_ms: Option<u64>,
    pub failed_attempts: u32,
    pub attempts_remaining: Option<u32>,
}

#[tauri::command]
pub fn auth_pin_status() -> Result<PinStatus, String> {
    let has_entry = open_entry(KEYRING_PIN_HASH)?;
    let has_pin = match has_entry.get_password() {
        Ok(_) => true,
        Err(KeyringError::NoEntry) => false,
        Err(e) => return Err(format!("PIN-státusz olvasás sikertelen: {e}")),
    };
    let lockout = read_lockout()?;
    let now = current_ms();
    let locked_until_ms = lockout.locked_until_ms.filter(|&u| u > now);
    Ok(PinStatus {
        has_pin,
        locked_until_ms,
        failed_attempts: lockout.failed_attempts,
        attempts_remaining: attempts_until_next_threshold(lockout.failed_attempts),
    })
}

// ────────────────────────────────────────────────────────────────────────
// Unit tests (a keyring-hez NEM nyúlnak — csak a pure-helpers)
// ────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attempts_until_threshold_basic() {
        assert_eq!(attempts_until_next_threshold(0), Some(3));
        assert_eq!(attempts_until_next_threshold(1), Some(2));
        assert_eq!(attempts_until_next_threshold(2), Some(1));
        assert_eq!(attempts_until_next_threshold(3), Some(2)); // next is 5
        assert_eq!(attempts_until_next_threshold(5), Some(2)); // next is 7
        assert_eq!(attempts_until_next_threshold(7), None); // nincs tovább — force_logout @ 10
    }

    #[test]
    fn argon2_hash_verify_roundtrip() {
        // A logika: hash-elés + verify ugyanazon a PIN-en OK, máson nem.
        let salt = SaltString::generate(&mut OsRng);
        let argon = Argon2::default();
        let hash_str = argon
            .hash_password(b"1234", &salt)
            .expect("hash")
            .to_string();
        let parsed = PasswordHash::new(&hash_str).expect("parse");
        assert!(Argon2::default().verify_password(b"1234", &parsed).is_ok());
        assert!(Argon2::default().verify_password(b"0000", &parsed).is_err());
    }

    #[test]
    fn lockout_state_serde_roundtrip() {
        let state = LockoutState {
            failed_attempts: 4,
            locked_until_ms: Some(1_700_000_000_000),
        };
        let json = serde_json::to_string(&state).unwrap();
        let parsed: LockoutState = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.failed_attempts, 4);
        assert_eq!(parsed.locked_until_ms, Some(1_700_000_000_000));
    }
}
