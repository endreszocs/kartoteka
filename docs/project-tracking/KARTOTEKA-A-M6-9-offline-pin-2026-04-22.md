# A-M6.9 — Offline PIN hitelesítés + session-státusz informálás

**Dátum:** 2026-04-22
**Fázis:** A-M6.9 (az M6 utáni hotfix, kritikus UX-rés zárása)
**Státusz:** ✅ Kivitelezve + verifikálva (Rust 7 test PASS, TS 0 error, import-check tiszta)

Roadmap: [`KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md`](KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md).

---

## Miért lett hozzáadva az M6-hoz

Endre kérdése (2026-04-22) tárt fel egy valós rést:

> „Ha a lelkésznek nincs egyáltalán internethozzáférése, csak egyszer volt amikor letöltötte a számítógépére, akkor tudja használni a rendszert? Nem lenne szükség egy helyi gyors belépéses PIN módszerre?"

**Audit**: a Supabase JWT refresh-tokenje 30 napig él. 30+ nap offline után a lelkész kizáródik a saját lokálisan tárolt adataiból is — falvak, szolgálati utak, gyenge net mellett ez valós kockázat.

**Megoldás**: egy **lokális offline PIN** — tárolva Argon2id-hash-elve a Tauri keyring-ben, ami engedélyezi a lokális SQLCipher DB-hez való hozzáférést hálózat nélkül. Nem küldődik szervernek, nem cserél Supabase session-t.

Plusz kaptunk egy új **alapelv-memóriát**: [`feedback_lelkesz_informalas.md`](../../../../../Users/Barátosi%20Egyház/.claude/projects/D--Egyh-zi-APP/memory/feedback_lelkesz_informalas.md) — "a lelkész mindenről informálva legyen a megfelelő helyeken". Ez minden jövőbeli UI-munkára kötelező.

## Mit csináltunk

### Rust backend ([`apps/desktop/src-tauri/src/auth_pin.rs`](../../apps/desktop/src-tauri/src/auth_pin.rs))

- **Új dependency**: `argon2 = "0.5"` (pure-Rust, OWASP-ajánlott paraméterekkel — m=19456 KiB, t=2, p=1)
- **5 Tauri command**:
  - `auth_pin_has` — van-e beállítva PIN
  - `auth_pin_set(pin)` — Argon2id hash + keyring (`pin-hash` slot) + lockout-reset
  - `auth_pin_verify(pin)` — ellenőrzés + lockout-lépcső
  - `auth_pin_clear` — PIN + lockout-state törlés
  - `auth_pin_status` — UI-feedback (has_pin, locked_until_ms, failed_attempts, attempts_remaining)
- **Lockout-szabályzat** (keyring-perzisztens, újraindítás-álló):
  | Sikertelen kísérletek | Következmény |
  |---|---|
  | 3 rossz PIN | 30 másodperc lockout |
  | 5 rossz PIN | 5 perc lockout |
  | 7 rossz PIN | 1 óra lockout |
  | **10 rossz PIN** | **FORCE LOGOUT** — PIN-hash törölve, újra online-login kell |
- **3 unit test** pure-helper-ekre (`sanitize_key`, `argon2_roundtrip`, `lockout_state_serde`) — mind PASS

### TS kliens

- [`apps/desktop/src/lib/auth-pin.ts`](../../apps/desktop/src/lib/auth-pin.ts) — Tauri invoke wrapper (hasPin, setPin, verifyPin, clearPin, pinStatus) + `setOfflineMode`/`isOfflineMode` sessionStorage flag + `formatLockoutMessage` pasztorális hungarian hibaszöveg
- [`apps/desktop/src/lib/session-state.ts`](../../apps/desktop/src/lib/session-state.ts) — `analyzeSession()` a 4 állapotot ad (`online` / `offline-pin` / `refresh-expiring` / `signed-out`) + magyar label + tone hint
- [`apps/desktop/src/lib/auth-gate.tsx`](../../apps/desktop/src/lib/auth-gate.tsx) — **négy kapu** logika:
  1. Supabase session él → beenged
  2. Nincs session, de offline-mode aktív → beenged (ebben az indításban már PIN-eltünk)
  3. Nincs session, van tárolt PIN → `/pin-entry`-re
  4. Nincs session, nincs PIN → `/login`-ra
  A `SIGNED_IN` és `SIGNED_OUT` event-re az offline-mode flag törlődik.
- [`apps/desktop/src/components/session-status-indicator.tsx`](../../apps/desktop/src/components/session-status-indicator.tsx) — fix position (jobb-felső) diszkrét státusz-pötty + magyar label, minden autentikált oldalon látszik. 60 mp-enként újraértékeli az állapotot (refresh-lejárat-figyelmeztetés frissítése).

### Új oldalak

- [`apps/desktop/src/pages/pin-setup-page.tsx`](../../apps/desktop/src/pages/pin-setup-page.tsx) — PIN + megerősítés input, sikeres mentés-visszajelzés, "Később" gomb, **pasztorális figyelmeztetés**: "jegyezd meg a kódot — nem tudjuk visszaállítani"
- [`apps/desktop/src/pages/pin-entry-page.tsx`](../../apps/desktop/src/pages/pin-entry-page.tsx) — PIN input + lockout-countdown UI, force-logout kezelés (2.5 mp után /login-ra), "Mégis online jelentkezem be" escape-ajtó, **informáló banner**: "Offline-módban csak olvasni tudsz"

### Integráció a meglévő flow-kba

- `login-page.tsx`: sikeres Supabase login után `setOfflineMode(false)` + `hasPin()` check → ha nincs, `/pin-setup`-re terel (új user azonnal beállíthatja)
- `App.tsx`: 2 új route — `/pin-entry`, `/pin-setup` (az auth-gate-en kívül, mert maguk is auth-ellenőrzésre szolgálnak)

## Informálási pontok (feedback_lelkesz_informalas.md alapelv)

Minden állapot-váltásnál a lelkész látja, mi történik:

| Esemény | Hol és hogyan |
|---|---|
| Online munkamenet | Zöld "Online" pötty a jobb-felső sarokban, minden oldalon |
| Offline-PIN mód | Narancs "Offline munkamenet — változtatásaid később szinkronizálnak" |
| Refresh közeleg | Sárga "A munkamenet X nap múlva lejár — csatlakozz a hálózatra" (7 napon belül aktív) |
| PIN setup (új user) | Bemutató kártya a célról + biztonsági figyelmeztetés ("jegyezd meg, nem visszaállítható") |
| PIN setup siker | Zöld visszajelzés + 1.2 mp után automata továbbítás |
| PIN entry lockout | Sárga banner a hátralévő idővel (élő countdown) |
| PIN force logout | Pasztorális magyarázat 2.5 mp-ig, majd /login |
| PIN hibás próbálkozás | "Még X próbálkozás, mielőtt várnod kell" |

## Verifikáció

```bash
# Rust
cd apps/desktop/src-tauri && cargo check      # Finished in 10.80s
cd apps/desktop/src-tauri && cargo test       # 7 passed (4 auth + 3 auth_pin)

# TS
cd apps/desktop && npx tsc --noEmit           # 0 error

# Desktop import tiltás (A-M6.7)
node scripts/check-desktop-banned-imports.mjs # ✅ 26 fájl, 0 tiltott
```

## Limitációk (tisztán dokumentálva)

- **A PIN NEM crypto-KEK**: a SQLCipher-kulcs külön keyring-slot-ban van (M2.3 óta), nem derivált PIN-ből. Fizikai gép-kompromittáció esetén a kulcs hozzáférhető — ennél szigorúbb védelem az M13 (E2E doc-titkosítás + argon2-derivált KEK) feladata.
- **System-óra manipuláció**: a lockout-timer rendszer-óra-alapú; ez a brute-force lassítás eszköze, nem kripto-védelem.
- **Refresh token lejárt + PIN-verify sikeres**: a user csak olvasni tud a lokális DB-ből, a push-outbox halmozódik; online visszacsatlakozáskor ÚJRA jelszavas login kell ahhoz, hogy valódi Supabase session szülessen.

## Mi következik

- **A-M7.0**: `DexieBackend` + `TauriSqliteBackend` első valós impl — a pénzügyi wave offline-képessége
- **A-M7.1**: `issueChitantaUseCase` a `@kartoteka/core`-ban (a `sendMailUseCase` mintapéldány után)
- **A-M15** UI-polírozás: az A-M6.9 kapcsán még hátra van:
  - Beállítások → Adat&biztonság → PIN-management panel (status, cserélés, törlés)
  - Update utáni "Mi történt időközben" changelog-dialog (ha több-verziós ugrás)
  - Részletes session-panel a status-indicator kattintásra (lockout-státusz, utolsó sync, outbox-count)

## Kapcsolódó fájlok

- [`apps/desktop/src-tauri/src/auth_pin.rs`](../../apps/desktop/src-tauri/src/auth_pin.rs) (új, ~250 sor)
- [`apps/desktop/src-tauri/src/lib.rs`](../../apps/desktop/src-tauri/src/lib.rs) (+ mod + 5 command reg)
- [`apps/desktop/src-tauri/Cargo.toml`](../../apps/desktop/src-tauri/Cargo.toml) (+ `argon2 = "0.5"`)
- [`apps/desktop/src/lib/auth-pin.ts`](../../apps/desktop/src/lib/auth-pin.ts) (új)
- [`apps/desktop/src/lib/session-state.ts`](../../apps/desktop/src/lib/session-state.ts) (új)
- [`apps/desktop/src/lib/auth-gate.tsx`](../../apps/desktop/src/lib/auth-gate.tsx) (teljesen új logika)
- [`apps/desktop/src/components/session-status-indicator.tsx`](../../apps/desktop/src/components/session-status-indicator.tsx) (új)
- [`apps/desktop/src/pages/pin-setup-page.tsx`](../../apps/desktop/src/pages/pin-setup-page.tsx) (új)
- [`apps/desktop/src/pages/pin-entry-page.tsx`](../../apps/desktop/src/pages/pin-entry-page.tsx) (új)
- [`apps/desktop/src/pages/login-page.tsx`](../../apps/desktop/src/pages/login-page.tsx) (sikeres login → hasPin? → pin-setup)
- [`apps/desktop/src/App.tsx`](../../apps/desktop/src/App.tsx) (+ 2 új route)
- [`../../../../../Users/Barátosi Egyház/.claude/projects/D--Egyh-zi-APP/memory/feedback_lelkesz_informalas.md`](../../../../../Users/Barátosi Egyház/.claude/projects/D--Egyh-zi-APP/memory/feedback_lelkesz_informalas.md) (új alapelv)
