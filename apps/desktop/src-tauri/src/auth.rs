// Kartotéka Desktop — Supabase session tárolás az OS-kulcstárban (keyring)
// (M6.6, 2026-04-22; ÉLESÍTVE + DARABOLÁS 2026-09-05).
//
// A Supabase JS kliens alapértelmezetten `localStorage`-ba menti a session-t
// (access_token + refresh_token + expires_at + user JSON). A localStorage-ban
// tárolt token böngésző DevTools-ból egyszerűen kiolvasható.
//
// Az M6.6-ban ezt felváltjuk az **OS-szintű keyring-re**: Windows Credential
// Manager (DPAPI), macOS Keychain, Linux Secret Service. A fizikai gép-
// hozzáférés sem ad automatikus olvasást.
//
// ⛔ TÖRTÉNET — MIÉRT VOLT EZ 2026-04-22 ÉS 2026-09-05 KÖZÖTT HALOTT KÓD:
//   A közös `createKartotekaBrowserClient` a `@supabase/ssr` createBrowserClient-
//   jét hívta, amely az átadott `auth.storage`-ot a SAJÁT süti-tárolójára
//   cserélte. A desktop-munkamenet így a WebView2 SÜTIJÉBEN élt, ide egyetlen
//   hívás sem érkezett — miközben a fejléc az ellenkezőjét állította. 2026-09-05
//   óta az asztali ág a nyers supabase-js createClient-et használja
//   (packages/supabase-client/src/browser.ts), ezért a három alábbi command
//   MOST TÉNYLEG a session egyetlen tárolója.
//
// ⛔ A WINDOWS-PLAFON ÉS A DARABOLÁS (2026-09-05):
//   A Windows Credential Manager egy bejegyzésben legfeljebb
//   CRED_MAX_CREDENTIAL_BLOB_SIZE = 2560 bájtot tárol. A `keyring` 3.6.3 a
//   jelszót UTF-16-ban írja, és ELŐRE ellenőriz (windows.rs validate_attributes:
//   `encode_utf16().count() * 2 > 2560` → `TooLong`) — vagyis a plafon 1280
//   UTF-16 kódegység. A Supabase-session JSON (két JWT + a `user` objektum a
//   Google-identitással) ennél jóval nagyobb, ezért egyetlen `set_password`
//   MINDEN élesben előforduló session-nél elbukott volna → a munkamenet nem
//   perzisztál, minden indításkor újra kellene kapcsolni.
//
//   Ezért az érték DARABOLVA kerül a kulcstárba — a TS-adapter számára
//   ÁTLÁTSZÓAN (a három command felülete változatlan):
//     '<key>'      rövid érték (≤ CHUNK_UTF16 egység): egyetlen sima bejegyzés
//                  — ez a 2026-09-05 előtti alak is, olvasása változatlan
//     '<key>.n'    FEJLÉC: a darabok száma, decimális szövegként
//     '<key>.0…'   a darabok, egyenként ≤ CHUNK_UTF16 UTF-16 egység,
//                  KARAKTERHATÁRON vágva (surrogate-pár nem szakad ketté)
//
//   Olvasás: ha van fejléc → a darabokat fűzi össze; ha BÁRMELYIK darab
//   hiányzik vagy a fejléc értelmezhetetlen → Ok(None) (fail-closed: fél-
//   session SOHA nem jut a kliens elé) és a roncs törlődik. Ha nincs fejléc →
//   a sima kulcsot olvassa (kompatibilitás a régi, darabolatlan bejegyzéssel).
//   Írás sorrendje: fejléc törlése → sima kulcs törlése → darabok → fejléc
//   UTOLJÁRA → a KORÁBBI érték fölösleges darabjainak takarítása a friss
//   darabszámtól fölfelé (a frissen írtakhoz nem nyúl). Így egy félbeszakadt
//   írás soha nem hagy olvasható, de hibrid (régi+új darabokból összefűzött)
//   értéket: fejléc nélkül az olvasó a sima kulcsra esik (ami ekkor már
//   üres), fejléccel pedig csak a friss darabsor létezik. Törlés: fejléc +
//   sima kulcs + minden darab, idempotensen.
//
//   A darabolás a `Kulcstar` trait-en át ír/olvas, nem közvetlenül a keyring-
//   en: így a több bejegyzésen átívelő sorrend memóriabeli tárral, OS nélkül
//   is tesztelhető (ld. a tesztmodult — az egyik teszt pontosan azt a hibát
//   őrzi, hogy a takarítás a friss darabokat is elvitte).
//
//   A három command egy folyamat-szintű zár alatt fut (KULCSTAR_ZAR), mert a
//   több bejegyzésből álló írás/olvasás csak sorosítva atomi a kliens felől.
//
// API (3 Tauri command, localStorage-szerű kulcsonkénti tárolás):
//   - auth_store_item(key: String, value: String) -> Result<(), String>
//   - auth_read_item(key: String) -> Result<Option<String>, String>
//   - auth_clear_item(key: String) -> Result<(), String>
//
// Kulcs-korlátozás: CSAK `auth-` prefixű kulcsok engedélyezettek (a Supabase
// session-kulcsai ebbe a családba esnek, ld. storageKey config). Így ha valami
// más kód is használná ezeket a command-okat, nem tud véletlenül más slot-ot
// módosítani (pl. SQLCipher DB-kulcs, device privkey). A 128 karakteres korlát
// a TS-ből érkező NYERS kulcsra vonatkozik; a '.n' / '.<i>' utótag ezután,
// a már ellenőrzött névhez kerül hozzá, tehát az 'auth-sb-<ref>-auth-token.12'
// alak mindig elfér.
//
// A TS oldal egy custom `SupabaseAuthStorage` adapter-rel köti be (ld.
// apps/desktop/src/lib/supabase.ts). A Supabase JS `storage` opciója
// szintaktikusan localStorage-kompatibilis.
//
// Biztonsági megjegyzés:
//   A session JSON tartalmaz egy refresh tokent (élettartama a Supabase
//   Dashboard beállításától függ; a „30 nap" a repóban feltételezés). Ezt védi
//   a keyring, de ha a user gépét kompromittálják, a token hozzáférhető. Ennél
//   szigorúbb védelem (pl. Windows Hello PIN) M13-ban, az E2E doc-titkosítással
//   együtt.

use keyring::{Entry, Error as KeyringError};
use std::sync::{Mutex, MutexGuard};

const KEYRING_SERVICE: &str = "kartoteka-desktop";
const AUTH_KEY_PREFIX: &str = "auth-";
/// A TS-ből érkező nyers kulcs felső hossza (a darab-utótag EZUTÁN jön rá).
const MAX_KEY_LEN: usize = 128;

/// A Windows Credential Manager bejegyzés-plafonja bájtban (windows-sys
/// `CRED_MAX_CREDENTIAL_BLOB_SIZE`). A fordítás-idejű őrhöz és a teszt-tár
/// plafonjához kell.
const CRED_MAX_CREDENTIAL_BLOB_SIZE: usize = 2560;

/// Egy darab legfeljebb ennyi UTF-16 kódegység.
/// MIÉRT 1000 és nem a plafon (1280): a keyring UTF-16-ban számol, mi is, de
/// a kerek szám olvasható, a ráhagyás pedig megvéd egy esetleges jövőbeli
/// keyring-oldali többlettől (pl. lezáró nullás, attribútum). Egy tipikus
/// session (4–8 KB) így 4–8 darab.
pub(crate) const CHUNK_UTF16: usize = 1000;

// Fordítás-idejű őr: a darab UTF-16 bájtszáma férjen a Windows-plafon alá.
const _: () = assert!(CHUNK_UTF16 * 2 <= CRED_MAX_CREDENTIAL_BLOB_SIZE);

/// A fejléc-bejegyzés utótagja: '<key>.n' = darabszám.
const CHUNK_HEADER_SUFFIX: &str = ".n";

/// A darabszám felső plafonja — a rosszindulatú / sérült fejléc elleni
/// ciklus-korlát. 64 × 1000 egység = 64k UTF-16 egység, egy session töredéke
/// ennek; ha ennél nagyobb jönne, az hiba, nem tárolandó adat.
pub(crate) const MAX_CHUNKS: usize = 64;

/// Folyamat-szintű zár a kulcstár-műveletekre (ld. a fejlécet: a több
/// bejegyzésből álló írás/olvasás csak sorosítva atomi a kliens felől).
static KULCSTAR_ZAR: Mutex<()> = Mutex::new(());

fn zar() -> MutexGuard<'static, ()> {
    // Egy pánikoló szál mérgezett zárja nem ok arra, hogy a session örökre
    // olvashatatlan legyen — a védett állapot üres egység, nincs mit félteni.
    KULCSTAR_ZAR.lock().unwrap_or_else(|p| p.into_inner())
}

/// A TS-ből érkező kulcs validálása + sanitize — csak `auth-` prefixű kulcsok,
/// és csak alphanumerikus / - / _ / . / : karakterek maradnak.
fn sanitize_key(raw: &str) -> Result<String, String> {
    if !raw.starts_with(AUTH_KEY_PREFIX) {
        return Err(format!(
            "Tiltott keyring kulcs prefix: '{raw}' — csak '{AUTH_KEY_PREFIX}...' engedélyezett."
        ));
    }
    if raw.len() > MAX_KEY_LEN {
        return Err(format!(
            "Keyring kulcs túl hosszú ({} karakter, max {MAX_KEY_LEN}).",
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

/// A fejléc-bejegyzés neve a már ellenőrzött kulcshoz.
fn header_key(sanitized: &str) -> String {
    format!("{sanitized}{CHUNK_HEADER_SUFFIX}")
}

/// Az i. darab bejegyzés-neve a már ellenőrzött kulcshoz.
fn chunk_key(sanitized: &str, i: usize) -> String {
    format!("{sanitized}.{i}")
}

// ───────────────────────────────────────────────────────────────────────────
// Tiszta (keyring-mentes) segédek — a unit-tesztek ezeket mérik.
// ───────────────────────────────────────────────────────────────────────────

/// UTF-16 kódegységek száma — ugyanaz a mérték, amivel a keyring Windows-
/// backendje a plafont ellenőrzi.
pub(crate) fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// Az érték darabolása legfeljebb CHUNK_UTF16 UTF-16 egységes darabokra,
/// KARAKTERHATÁRON. Egy karakter (skalárérték) sosem szakad ketté, így a
/// 2 egységes (surrogate-páros) emoji egészben kerül a következő darabba.
/// Üres értékre egyetlen üres darabot ad (a hívó rövid értéknél nem is hívja).
pub(crate) fn chunk_value(value: &str) -> Vec<String> {
    let mut parts: Vec<String> = Vec::new();
    let mut cur = String::new();
    let mut cur_units = 0usize;
    for c in value.chars() {
        let units = c.len_utf16();
        if cur_units + units > CHUNK_UTF16 {
            parts.push(std::mem::take(&mut cur));
            cur_units = 0;
        }
        cur.push(c);
        cur_units += units;
    }
    if !cur.is_empty() || parts.is_empty() {
        parts.push(cur);
    }
    parts
}

/// A darabok összefűzése — ha BÁRMELYIK hiányzik, None (fail-closed: fél-
/// session soha nem áll össze „valami" értékké).
pub(crate) fn join_chunks(parts: &[Option<String>]) -> Option<String> {
    let mut out = String::with_capacity(parts.len() * CHUNK_UTF16);
    for p in parts {
        out.push_str(p.as_deref()?);
    }
    Some(out)
}

/// A fejléc-bejegyzés szövegének értelmezése: 1..=MAX_CHUNKS közötti egész,
/// minden más (üres, nem szám, 0, túl nagy) → None = sérült fejléc.
pub(crate) fn parse_chunk_count(raw: &str) -> Option<usize> {
    let n: usize = raw.trim().parse().ok()?;
    (1..=MAX_CHUNKS).contains(&n).then_some(n)
}

// ───────────────────────────────────────────────────────────────────────────
// Tároló-absztrakció: egy bejegyzés = egy művelet; NoEntry nem hiba
// ───────────────────────────────────────────────────────────────────────────

/// Bejegyzés-szintű kulcstár. A darabolás (`tarol` / `olvas` /
/// `torol_mindent`) ezen keresztül dolgozik, nem közvetlenül a keyring-en.
///
/// MIÉRT: a darabolás hibái — pl. hogy a takarítás a FRISSEN írt darabokat
/// törli, vagy egy hiányzó darabból fél-session áll össze — csak a több
/// bejegyzésen átívelő sorrendben látszanak, a tiszta chunk/join függvényeken
/// nem. Egy memóriabeli tárral a unit-tesztek ezt a sorrendet is mérik.
pub(crate) trait Kulcstar {
    fn olvas(&self, name: &str) -> Result<Option<String>, String>;
    fn ir(&self, name: &str, value: &str) -> Result<(), String>;
    /// Ok(true) = volt mit törölni, Ok(false) = eleve üres (idempotens).
    fn torol(&self, name: &str) -> Result<bool, String>;
}

/// Az élő OS-kulcstár (keyring crate): Windows Credential Manager, macOS
/// Keychain, Linux Secret Service.
struct OsKulcstar;

impl OsKulcstar {
    fn entry(name: &str) -> Result<Entry, String> {
        Entry::new(KEYRING_SERVICE, name).map_err(|e| format!("Keyring entry '{name}' hiba: {e}"))
    }
}

impl Kulcstar for OsKulcstar {
    fn olvas(&self, name: &str) -> Result<Option<String>, String> {
        match Self::entry(name)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(e) => Err(format!("Keyring '{name}' olvasás sikertelen: {e}")),
        }
    }

    fn ir(&self, name: &str, value: &str) -> Result<(), String> {
        Self::entry(name)?
            .set_password(value)
            .map_err(|e| format!("Keyring '{name}' mentés sikertelen: {e}"))
    }

    fn torol(&self, name: &str) -> Result<bool, String> {
        match Self::entry(name)?.delete_credential() {
            Ok(()) => Ok(true),
            Err(KeyringError::NoEntry) => Ok(false),
            Err(e) => Err(format!("Keyring '{name}' törlés sikertelen: {e}")),
        }
    }
}

// ───────────────────────────────────────────────────────────────────────────
// Darabolás a tároló fölött (a commandok ezt hívják az OsKulcstar-ral)
// ───────────────────────────────────────────────────────────────────────────

/// A '<key>.<i>' darabok törlése a `tol` indextől. Az `ismert` (a korábbi
/// fejlécből olvasott) darabszámig feltétel nélkül próbál (egy sérült
/// sorozatban lyuk is lehet), utána az első hiányzónál megáll — az ép darabok
/// mindig összefüggő 0..k sorozatot alkotnak.
///
/// ⛔ A `tol` paraméter nem elhagyható: írás után a takarítás a FRISS
/// darabszámtól indul, különben a most írt darabokat vinné el (a 2026-09-05-i
/// félbeszakadt futás hibája — a tesztmodul őrzi).
fn torol_darabokat(
    tar: &impl Kulcstar,
    sanitized: &str,
    tol: usize,
    ismert: usize,
) -> Result<(), String> {
    for i in tol..MAX_CHUNKS {
        let volt = tar.torol(&chunk_key(sanitized, i))?;
        if !volt && i >= ismert {
            break;
        }
    }
    Ok(())
}

/// A korábbi fejlécből olvasott darabszám (0, ha nincs vagy sérült) — a
/// takarítás felső határa.
fn korabbi_darabszam(tar: &impl Kulcstar, sanitized: &str) -> Result<usize, String> {
    Ok(tar
        .olvas(&header_key(sanitized))?
        .and_then(|h| parse_chunk_count(&h))
        .unwrap_or(0))
}

/// Minden bejegyzés törlése a kulcshoz: fejléc ELŐSZÖR (az olvasó ettől
/// kezdve nem fűz), aztán a sima kulcs, végül a darabok. Idempotens.
pub(crate) fn torol_mindent(tar: &impl Kulcstar, sanitized: &str) -> Result<(), String> {
    let ismert = korabbi_darabszam(tar, sanitized)?;
    tar.torol(&header_key(sanitized))?;
    tar.torol(sanitized)?;
    torol_darabokat(tar, sanitized, 0, ismert)
}

/// Érték tárolása — rövid értéknél egyetlen sima bejegyzés, hosszúnál
/// darabolva (ld. a fejlécet a Windows 2560 bájtos plafonjáról).
pub(crate) fn tarol(tar: &impl Kulcstar, sanitized: &str, value: &str) -> Result<(), String> {
    // A korábbi érték darabszáma a takarításhoz — MIELŐTT bármihez nyúlnánk.
    let korabbi = korabbi_darabszam(tar, sanitized)?;

    if utf16_len(value) <= CHUNK_UTF16 {
        // RÖVID ÉRTÉK — egyetlen sima bejegyzés (a régi alak). Sorrend: a
        // fejléc tűnik el először (az olvasó a sima kulcsra esik), aztán jön
        // az új érték, végül a korábbi hosszú érték darabjainak takarítása.
        tar.torol(&header_key(sanitized))?;
        tar.ir(sanitized, value)?;
        return torol_darabokat(tar, sanitized, 0, korabbi);
    }

    // HOSSZÚ ÉRTÉK — darabolás. A méret-őr MINDEN írás előtt: túl nagy
    // értéknél a korábbi bejegyzés érintetlenül olvasható marad.
    let parts = chunk_value(value);
    if parts.len() > MAX_CHUNKS {
        return Err(format!(
            "Keyring '{sanitized}': az érték túl nagy a kulcstárhoz ({} darab, max {MAX_CHUNKS}).",
            parts.len()
        ));
    }
    // Fejléc és sima kulcs törlése ELŐBB: az írás ablakában az olvasó None-t
    // kap (fail-closed), nem egy régi+új hibridet.
    tar.torol(&header_key(sanitized))?;
    tar.torol(sanitized)?;
    for (i, part) in parts.iter().enumerate() {
        tar.ir(&chunk_key(sanitized, i), part)?;
    }
    // A fejléc UTOLJÁRA — csak teljes darabsor mellett válik olvashatóvá.
    tar.ir(&header_key(sanitized), &parts.len().to_string())?;
    // Egy korábbi, hosszabb érték fölösleges darabjainak takarítása — a FRISS
    // darabszámtól fölfelé, a most írtakhoz nem nyúl.
    torol_darabokat(tar, sanitized, parts.len(), korabbi)
}

/// Érték olvasása — fejléccel a darabokból, fejléc nélkül a sima kulcsból.
/// Hiányzó darab vagy sérült fejléc → Ok(None) és a roncs takarítása.
pub(crate) fn olvas(tar: &impl Kulcstar, sanitized: &str) -> Result<Option<String>, String> {
    let Some(fejlec) = tar.olvas(&header_key(sanitized))? else {
        // Nincs fejléc → rövid érték vagy 2026-09-05 előtti, darabolatlan
        // bejegyzés: a sima kulcs az igazság (kompatibilitás). Egy félbeszakadt
        // hosszú írás fejléc nélküli darabjai NEM állnak össze.
        return tar.olvas(sanitized);
    };

    let Some(count) = parse_chunk_count(&fejlec) else {
        // Értelmezhetetlen fejléc — fail-closed: nincs session, és a roncsot
        // eltakarítjuk, hogy a következő írás tiszta lappal induljon.
        eprintln!(
            "[Kartotéka] keyring '{sanitized}': értelmezhetetlen darab-fejléc ('{fejlec}') — a tárolt munkamenet eldobva."
        );
        torol_mindent(tar, sanitized)?;
        return Ok(None);
    };

    let mut parts: Vec<Option<String>> = Vec::with_capacity(count);
    for i in 0..count {
        parts.push(tar.olvas(&chunk_key(sanitized, i))?);
    }
    match join_chunks(&parts) {
        Some(value) => Ok(Some(value)),
        None => {
            // Hiányzó darab — fél-session SOHA nem kerül a kliens elé.
            let hianyzo = parts.iter().filter(|p| p.is_none()).count();
            eprintln!(
                "[Kartotéka] keyring '{sanitized}': {hianyzo}/{count} darab hiányzik — a tárolt munkamenet eldobva (újra össze kell kapcsolni)."
            );
            torol_mindent(tar, sanitized)?;
            Ok(None)
        }
    }
}

// ───────────────────────────────────────────────────────────────────────────
// Tauri commands
// ───────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn auth_store_item(key: String, value: String) -> Result<(), String> {
    let sanitized = sanitize_key(&key)?;
    let _zar = zar();
    tarol(&OsKulcstar, &sanitized, &value)
}

#[tauri::command]
pub fn auth_read_item(key: String) -> Result<Option<String>, String> {
    let sanitized = sanitize_key(&key)?;
    let _zar = zar();
    olvas(&OsKulcstar, &sanitized)
}

#[tauri::command]
pub fn auth_clear_item(key: String) -> Result<(), String> {
    let sanitized = sanitize_key(&key)?;
    let _zar = zar();
    // Idempotens logout: ha eleve nincs bent semmi, az nem hiba.
    torol_mindent(&OsKulcstar, &sanitized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;

    // ── sanitize ──────────────────────────────────────────────────────────

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

    #[test]
    fn sanitize_key_a_valos_supabase_kulcsot_es_a_darab_alakot_is_elfogadja() {
        // A supabase-js alapértelmezett kulcsa: sb-<projekt-ref>-auth-token
        // (a ref 20 karakter), az adapter 'auth-' prefixszel adja át.
        let nyers = "auth-sb-abcdefghijklmnopqrst-auth-token";
        let s = sanitize_key(nyers).unwrap();
        assert_eq!(s, nyers);
        assert_eq!(header_key(&s), format!("{nyers}.n"));
        assert_eq!(chunk_key(&s, 12), format!("{nyers}.12"));
        // A 128-as korlát a NYERS kulcsra szól — egy már darab-alakú kulcs is
        // átmegy (nincs újra-ellenőrzés az utótagra).
        assert!(sanitize_key(&format!("{nyers}.12")).is_ok());
        // Pontosan 128 karakteres nyers kulcs + utótag: a származtatott név
        // túllóghat a korláton — csak a nyers hossz számít.
        let hatar = "auth-".to_string() + &"k".repeat(MAX_KEY_LEN - 5);
        assert_eq!(hatar.len(), MAX_KEY_LEN);
        let s = sanitize_key(&hatar).unwrap();
        assert!(chunk_key(&s, 12).len() > MAX_KEY_LEN);
    }

    // ── darabolás / összefűzés (tiszta függvények) ────────────────────────

    fn round_trip(value: &str) -> Vec<String> {
        let parts = chunk_value(value);
        for p in &parts {
            assert!(
                utf16_len(p) <= CHUNK_UTF16,
                "darab túl hosszú: {} egység",
                utf16_len(p)
            );
        }
        let opt: Vec<Option<String>> = parts.iter().cloned().map(Some).collect();
        assert_eq!(join_chunks(&opt).as_deref(), Some(value), "round-trip eltér");
        parts
    }

    #[test]
    fn utf16_len_a_keyring_mertekevel_szamol() {
        assert_eq!(utf16_len(""), 0);
        assert_eq!(utf16_len("abc"), 3);
        assert_eq!(utf16_len("é"), 1); // BMP: 2 bájt UTF-8-ban, 1 egység UTF-16-ban
        assert_eq!(utf16_len("😀"), 2); // surrogate-pár
        assert_eq!(utf16_len("Kőrösi Csoma"), 12);
    }

    #[test]
    fn chunk_value_hatarok_0_1_1000_1001_4000() {
        assert_eq!(round_trip("").len(), 1);
        assert_eq!(round_trip("a").len(), 1);
        assert_eq!(round_trip(&"a".repeat(1000)).len(), 1);
        let p = round_trip(&"a".repeat(1001));
        assert_eq!(p.len(), 2);
        assert_eq!(p[1], "a");
        let p = round_trip(&"x".repeat(4000));
        assert_eq!(p.len(), 4);
        assert!(p.iter().all(|c| c.len() == 1000));
        assert_eq!(round_trip(&"x".repeat(4001)).len(), 5);
    }

    #[test]
    fn chunk_value_egy_valosaghu_session_json() {
        // ~6 KB JSON-szerű szöveg magyar ékezetekkel, ahogy a `user` objektum
        // (full_name) is hordozhatja — biztosan több a Windows-plafonnál.
        let mut json = String::from("{\"access_token\":\"");
        json.push_str(&"eyJhbGciOiJIUzI1NiJ9.".repeat(120));
        json.push_str("\",\"user\":{\"user_metadata\":{\"full_name\":\"Kőrösi Csoma Sándor lelkész\"}},\"refresh_token\":\"");
        json.push_str(&"r".repeat(2000));
        json.push_str("\"}");
        assert!(utf16_len(&json) * 2 > CRED_MAX_CREDENTIAL_BLOB_SIZE);
        let parts = round_trip(&json);
        assert!(parts.len() >= 4 && parts.len() <= MAX_CHUNKS);
    }

    #[test]
    fn chunk_value_nem_vag_szet_surrogate_part() {
        // 999 egység + egy 2 egységes emoji: az emoji NEM fér az elsőbe,
        // egészben a másodikba kerül.
        let value = format!("{}😀b", "a".repeat(999));
        let p = round_trip(&value);
        assert_eq!(p.len(), 2);
        assert_eq!(p[0], "a".repeat(999));
        assert_eq!(p[1], "😀b");
        assert_eq!(utf16_len(&p[0]), 999);
        assert_eq!(utf16_len(&p[1]), 3);
    }

    #[test]
    fn chunk_value_unicode_vegyes_4000_karakter() {
        // é (1 egység) és 😀 (2 egység) váltakozva — 4000 karakter, 6000 egység.
        let value: String = (0..4000)
            .map(|i| if i % 2 == 0 { 'é' } else { '😀' })
            .collect();
        assert_eq!(utf16_len(&value), 6000);
        let p = round_trip(&value);
        // MIÉRT 7 és nem 6: a párok 3 egységesek. Az 1. darab 333 pár + é =
        // pontosan 1000; utána minden darab 😀-val indul, 333 (😀é) pár = 999,
        // mert a következő 😀 (2 egység) már nem fér → 1000+5×999 = 5995, a
        // maradék 5 egység a 7. darab. A karakterhatáros vágás „ára" darabonként
        // legfeljebb 1 egység — ezt méri az alábbi alsó korlát.
        assert_eq!(p.len(), 7);
        let osszes: usize = p.iter().map(|c| utf16_len(c)).sum();
        assert_eq!(osszes, 6000, "egyetlen egység sem veszhet el");
        for (i, c) in p.iter().enumerate() {
            // minden darab érvényes UTF-8 String (a chars()-alapú vágás
            // garantálja), és egyik sem lóg túl a plafonon
            assert!(utf16_len(c) <= CHUNK_UTF16);
            // az utolsó kivételével legfeljebb 1 egység „veszteség" a
            // surrogate-pár miatt
            if i + 1 < p.len() {
                assert!(utf16_len(c) >= CHUNK_UTF16 - 1, "{i}. darab: {} egység", utf16_len(c));
            }
        }
        assert_eq!(utf16_len(&p[0]), 1000);
        assert_eq!(utf16_len(&p[6]), 5);
    }

    #[test]
    fn join_chunks_barmely_hianyzo_darabnal_none() {
        let ep = vec![Some("ab".to_string()), Some("cd".to_string())];
        assert_eq!(join_chunks(&ep).as_deref(), Some("abcd"));
        let lyukas = vec![Some("ab".to_string()), None, Some("ef".to_string())];
        assert_eq!(join_chunks(&lyukas), None);
        let elso_hianyzik = vec![None, Some("x".to_string())];
        assert_eq!(join_chunks(&elso_hianyzik), None);
        let ures: Vec<Option<String>> = vec![];
        assert_eq!(join_chunks(&ures).as_deref(), Some(""));
    }

    #[test]
    fn parse_chunk_count_csak_ervenyes_tartomanyt_fogad() {
        assert_eq!(parse_chunk_count("1"), Some(1));
        assert_eq!(parse_chunk_count(" 7\n"), Some(7));
        assert_eq!(parse_chunk_count(&MAX_CHUNKS.to_string()), Some(MAX_CHUNKS));
        assert_eq!(parse_chunk_count("0"), None);
        assert_eq!(parse_chunk_count(""), None);
        assert_eq!(parse_chunk_count("abc"), None);
        assert_eq!(parse_chunk_count("-1"), None);
        assert_eq!(parse_chunk_count(&(MAX_CHUNKS + 1).to_string()), None);
    }

    #[test]
    fn a_darab_plafon_a_windows_blob_limit_alatt_marad() {
        // A keyring UTF-16-ban számol: darab × 2 bájt ≤ 2560.
        assert!(CHUNK_UTF16 * 2 <= CRED_MAX_CREDENTIAL_BLOB_SIZE);
        // És a fejléc-érték (legfeljebb "64") is triviálisan elfér.
        assert!(MAX_CHUNKS.to_string().len() * 2 <= CRED_MAX_CREDENTIAL_BLOB_SIZE);
    }

    // ── a teljes tárol/olvas/töröl sorrend memóriabeli kulcstárral ────────

    /// Memóriabeli kulcstár, amely UGYANAZT a plafont tartja, mint a Windows-
    /// backend: darabolás nélkül a hosszú érték itt is elbukik — így a
    /// round-trip tesztek a darabolás HIÁNYÁT is kimutatnák.
    struct MemTar {
        m: RefCell<HashMap<String, String>>,
    }

    impl MemTar {
        fn uj() -> Self {
            Self {
                m: RefCell::new(HashMap::new()),
            }
        }
        fn van(&self, name: &str) -> bool {
            self.m.borrow().contains_key(name)
        }
        fn beir(&self, name: &str, v: &str) {
            self.m.borrow_mut().insert(name.to_string(), v.to_string());
        }
        fn kivesz(&self, name: &str) {
            self.m.borrow_mut().remove(name);
        }
        fn ertek(&self, name: &str) -> Option<String> {
            self.m.borrow().get(name).cloned()
        }
        /// Az adott kulcshoz tartozó ÖSSZES bejegyzés neve (sima + fejléc + darabok).
        fn kulcsok(&self, sanitized: &str) -> Vec<String> {
            let prefix = format!("{sanitized}.");
            let mut v: Vec<String> = self
                .m
                .borrow()
                .keys()
                .filter(|k| k.as_str() == sanitized || k.starts_with(&prefix))
                .cloned()
                .collect();
            v.sort();
            v
        }
    }

    impl Kulcstar for MemTar {
        fn olvas(&self, name: &str) -> Result<Option<String>, String> {
            Ok(self.m.borrow().get(name).cloned())
        }
        fn ir(&self, name: &str, value: &str) -> Result<(), String> {
            if utf16_len(value) * 2 > CRED_MAX_CREDENTIAL_BLOB_SIZE {
                return Err(format!(
                    "TooLong: '{name}' ({} UTF-16 egység)",
                    utf16_len(value)
                ));
            }
            self.m.borrow_mut().insert(name.to_string(), value.to_string());
            Ok(())
        }
        fn torol(&self, name: &str) -> Result<bool, String> {
            Ok(self.m.borrow_mut().remove(name).is_some())
        }
    }

    const K: &str = "auth-sb-abcdefghijklmnopqrst-auth-token";

    /// n karakter: a / é / 😀 váltakozva (1 / 1 / 2 UTF-16 egység).
    fn vegyes(n: usize) -> String {
        (0..n)
            .map(|i| match i % 3 {
                0 => 'a',
                1 => 'é',
                _ => '😀',
            })
            .collect()
    }

    #[test]
    fn a_memoria_tar_darabolas_nelkul_a_plafonon_bukik() {
        // Negatív őr: egyetlen bejegyzésbe a 4000 karakteres érték NEM fér —
        // ez az a hiba, amitől élesben a session nem perzisztált.
        let tar = MemTar::uj();
        assert!(tar.ir(K, &"a".repeat(4000)).is_err());
    }

    #[test]
    fn tarol_olvas_round_trip_4000_karakter_unicode() {
        let tar = MemTar::uj();
        let v = vegyes(4000);
        assert!(utf16_len(&v) * 2 > CRED_MAX_CREDENTIAL_BLOB_SIZE);
        tarol(&tar, K, &v).unwrap();
        assert_eq!(olvas(&tar, K).unwrap().as_deref(), Some(v.as_str()));
        assert!(!tar.van(K), "hosszú értéknél nincs sima kulcs");
        let n = chunk_value(&v).len();
        assert_eq!(
            tar.ertek(&header_key(K)).as_deref(),
            Some(n.to_string().as_str())
        );
        assert_eq!(tar.kulcsok(K).len(), n + 1, "n darab + fejléc, semmi más");
    }

    #[test]
    fn a_takaritas_nem_torli_a_friss_darabokat() {
        // ⛔ A 2026-09-05-i félbeszakadt futás hibája: az írás utáni takarítás a
        // 0. daraptól indult és a frissen írt darabokat is elvitte → az olvasás
        // None-t adott, a session mégsem perzisztált.
        let tar = MemTar::uj();
        let v = "y".repeat(2500);
        tarol(&tar, K, &v).unwrap();
        for i in 0..3 {
            assert!(
                tar.van(&chunk_key(K, i)),
                "a(z) {i}. darab hiányzik az írás után"
            );
        }
        assert_eq!(olvas(&tar, K).unwrap().as_deref(), Some(v.as_str()));
    }

    #[test]
    fn rovid_ertek_sima_kulcs_es_a_regi_darabolatlan_alak_olvashato() {
        let tar = MemTar::uj();
        tarol(&tar, K, "rovid").unwrap();
        assert!(tar.van(K));
        assert!(!tar.van(&header_key(K)));
        assert_eq!(olvas(&tar, K).unwrap().as_deref(), Some("rovid"));

        // 2026-09-05 előtti, közvetlenül írt bejegyzés (nincs fejléc): a sima
        // kulcs az igazság — kompatibilitás.
        let regi = MemTar::uj();
        regi.beir(K, "{\"access_token\":\"regi\"}");
        assert_eq!(
            olvas(&regi, K).unwrap().as_deref(),
            Some("{\"access_token\":\"regi\"}")
        );
    }

    #[test]
    fn hianyzo_darab_fail_closed_none_es_a_roncs_eltakaritva() {
        let tar = MemTar::uj();
        tarol(&tar, K, &"x".repeat(3500)).unwrap(); // 4 darab
        tar.kivesz(&chunk_key(K, 2));
        assert_eq!(olvas(&tar, K).unwrap(), None, "fél-session SOHA nem áll össze");
        assert!(
            tar.kulcsok(K).is_empty(),
            "roncs maradt: {:?}",
            tar.kulcsok(K)
        );
    }

    #[test]
    fn fejlec_nelkuli_darabok_nem_allnak_ossze() {
        // Félbeszakadt írás: darabok már vannak, fejléc még nincs → None, nem hibrid.
        let tar = MemTar::uj();
        tar.beir(&chunk_key(K, 0), "a");
        tar.beir(&chunk_key(K, 1), "b");
        assert_eq!(olvas(&tar, K).unwrap(), None);
    }

    #[test]
    fn serult_fejlec_none_es_takarit() {
        let tar = MemTar::uj();
        tar.beir(&header_key(K), "abc");
        tar.beir(&chunk_key(K, 0), "a");
        assert_eq!(olvas(&tar, K).unwrap(), None);
        assert!(tar.kulcsok(K).is_empty());

        let tar = MemTar::uj();
        tar.beir(&header_key(K), "0");
        assert_eq!(olvas(&tar, K).unwrap(), None);
        assert!(tar.kulcsok(K).is_empty());
    }

    #[test]
    fn feluliras_hosszabbrol_rovidebbre_nem_hagy_arva_darabot() {
        let tar = MemTar::uj();
        tarol(&tar, K, &"a".repeat(6000)).unwrap(); // 6 darab
        tarol(&tar, K, &"b".repeat(2500)).unwrap(); // 3 darab
        assert_eq!(
            olvas(&tar, K).unwrap().as_deref(),
            Some("b".repeat(2500).as_str())
        );
        assert_eq!(tar.ertek(&header_key(K)).as_deref(), Some("3"));
        assert!(!tar.van(&chunk_key(K, 3)));
        assert!(!tar.van(&chunk_key(K, 5)));
        assert_eq!(tar.kulcsok(K).len(), 4);
    }

    #[test]
    fn feluliras_hosszu_es_rovid_kozott_mindket_iranyban() {
        let tar = MemTar::uj();
        tarol(&tar, K, &"a".repeat(4000)).unwrap();
        tarol(&tar, K, "rovid").unwrap();
        assert_eq!(olvas(&tar, K).unwrap().as_deref(), Some("rovid"));
        assert_eq!(
            tar.kulcsok(K),
            vec![K.to_string()],
            "csak a sima kulcs maradhat"
        );

        tarol(&tar, K, &"c".repeat(4000)).unwrap();
        assert_eq!(
            olvas(&tar, K).unwrap().as_deref(),
            Some("c".repeat(4000).as_str())
        );
        // MIÉRT: ha a sima kulcs megmaradna, egy később elvesző fejlécnél a
        // régi rövid érték „támadna fel" — az olvasó a sima kulcsra esik.
        assert!(!tar.van(K), "hosszú érték mellett a sima kulcs nem maradhat");
    }

    #[test]
    fn torles_mindent_visz_es_idempotens() {
        let tar = MemTar::uj();
        tarol(&tar, K, &"a".repeat(4000)).unwrap();
        torol_mindent(&tar, K).unwrap();
        assert!(tar.kulcsok(K).is_empty());
        torol_mindent(&tar, K).unwrap(); // üresen is Ok (NoEntry nem hiba)
        tarol(&tar, K, "r").unwrap();
        torol_mindent(&tar, K).unwrap();
        assert!(tar.kulcsok(K).is_empty());
        assert_eq!(olvas(&tar, K).unwrap(), None);
    }

    #[test]
    fn tul_nagy_ertek_hiba_es_a_korabbi_ertek_marad() {
        let tar = MemTar::uj();
        tarol(&tar, K, "marad").unwrap();
        let orias = "z".repeat(MAX_CHUNKS * CHUNK_UTF16 + 1);
        assert!(tarol(&tar, K, &orias).is_err());
        assert_eq!(olvas(&tar, K).unwrap().as_deref(), Some("marad"));
    }

    #[test]
    fn lyukas_regi_sorozat_is_eltakaritva_feluliraskor() {
        // A korábbi fejléc 5 darabot mond, de a 2. hiányzik (sérült állapot);
        // egy rövid érték írása után a 3. és 4. darab sem maradhat ott.
        let tar = MemTar::uj();
        tar.beir(&header_key(K), "5");
        for i in [0usize, 1, 3, 4] {
            tar.beir(&chunk_key(K, i), "d");
        }
        tarol(&tar, K, "uj").unwrap();
        assert_eq!(tar.kulcsok(K), vec![K.to_string()]);
        assert_eq!(olvas(&tar, K).unwrap().as_deref(), Some("uj"));
    }
}
