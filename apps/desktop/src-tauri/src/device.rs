// Kartotéka Desktop — Eszköz-bind (M3.3).
//
// Minden Kartotéka-telepítés az első indításkor generál egy egyedi
// device_id-t + Ed25519 keypair-et, és a publikus kulcsot a Supabase
// `user_devices` táblába regisztráljuk. A privát kulcs az OS-szintű
// keyringben marad (Windows DPAPI védett).
//
// Későbbi célok:
//   - Admin "eszköz-revoke" képesség (user_devices.revoked = true)
//   - Aláírt outbox-payload (M4+) — a user saját privát kulcsával
//   - Doc-titkosítás eszköz-kulccsal (M4)
//
// API:
//   #[tauri::command] device_info() -> DeviceInfo
//     { id, fingerprint, public_key_b64, created_now }
//
// Minden hívás idempotens — a meglévő kulcsot olvassa, vagy első
// alkalommal generálja.

use base64::Engine;
use ed25519_dalek::{SigningKey, VerifyingKey};
use serde::Serialize;

const KEYRING_SERVICE: &str = "kartoteka-desktop";
const KEYRING_DEVICE_ID: &str = "device-id";
const KEYRING_DEVICE_PRIVKEY: &str = "device-privkey-b64";

#[derive(Serialize)]
pub struct DeviceInfo {
    /// A kliens-generált, stabil UUID (ez lesz a `user_devices.id` FK later).
    pub id: String,
    /// Gép-fingerprint: Win registry MachineGuid / macOS IOPlatformUUID / Linux /etc/machine-id.
    pub fingerprint: String,
    /// Ed25519 publikus kulcs, base64-ben (kliens küldi a Supabase-nek).
    pub public_key_b64: String,
    /// Platform-string a Supabase `user_devices.platform` oszlopához.
    pub platform: String,
    /// `true`, ha most generálódott a keypair — a frontend tudja, hogy
    /// a Supabase `user_devices` INSERT-et el kell küldeni.
    pub created_now: bool,
}

/// Kikéri a device_id + ed25519-keypair-t a keyringből; ha első futás,
/// generál + elment.
pub fn load_or_create_device() -> Result<DeviceInfo, String> {
    // 1. Device ID — random UUID, stabil per-install
    let id_entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_DEVICE_ID)
        .map_err(|e| format!("Keyring device-id entry hiba: {e}"))?;
    let (id, id_created) = match id_entry.get_password() {
        Ok(existing) => (existing, false),
        Err(keyring::Error::NoEntry) => {
            let new_id = uuid_v4();
            id_entry
                .set_password(&new_id)
                .map_err(|e| format!("Device-id mentés sikertelen: {e}"))?;
            (new_id, true)
        }
        Err(e) => return Err(format!("Keyring device-id olvasás sikertelen: {e}")),
    };

    // 2. Private key — Ed25519, base64-enkódolva a keyringben
    let pk_entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_DEVICE_PRIVKEY)
        .map_err(|e| format!("Keyring privkey entry hiba: {e}"))?;
    let b64 = base64::engine::general_purpose::STANDARD;

    let (signing_key, key_created) = match pk_entry.get_password() {
        Ok(existing_b64) => {
            let bytes = b64
                .decode(existing_b64.as_bytes())
                .map_err(|e| format!("Keyring privkey base64 decode hiba: {e}"))?;
            if bytes.len() != 32 {
                return Err(format!(
                    "Keyring privkey rossz méret: {} bytes (32 elvárt)",
                    bytes.len()
                ));
            }
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&bytes);
            (SigningKey::from_bytes(&arr), false)
        }
        Err(keyring::Error::NoEntry) => {
            use rand::rngs::OsRng;
            let mut csprng = OsRng;
            let sk = SigningKey::generate(&mut csprng);
            let encoded = b64.encode(sk.to_bytes());
            pk_entry
                .set_password(&encoded)
                .map_err(|e| format!("Keyring privkey mentés sikertelen: {e}"))?;
            (sk, true)
        }
        Err(e) => return Err(format!("Keyring privkey olvasás sikertelen: {e}")),
    };

    // 3. Public key (derived)
    let verifying_key: VerifyingKey = signing_key.verifying_key();
    let public_key_b64 = b64.encode(verifying_key.to_bytes());

    // 4. Hardware fingerprint
    let fingerprint = machine_uid::get().unwrap_or_else(|_| "unknown".to_string());

    // 5. Platform
    let platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
    .to_string();

    Ok(DeviceInfo {
        id,
        fingerprint,
        public_key_b64,
        platform,
        created_now: id_created || key_created,
    })
}

/// Egyszerű UUID-v4 generátor külső `uuid` crate nélkül.
/// RFC 4122 § 4.4 (random-based UUID).
fn uuid_v4() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    // version (4) és variant (RFC 4122)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-\
         {:02x}{:02x}-\
         {:02x}{:02x}-\
         {:02x}{:02x}-\
         {:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5],
        bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15],
    )
}

#[tauri::command]
pub fn device_info() -> Result<DeviceInfo, String> {
    load_or_create_device()
}
