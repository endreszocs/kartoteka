# M6.6 — Desktop Supabase session Tauri keyring-ben

**Dátum:** 2026-04-22
**Fázis:** M6.6 — Tauri desktop auth-session tárolás OS-szintű keyring-ben
**Státusz:** ✅ Kivitelezve + verifikálva (4/4 Rust test, TS typecheck mindkét workspace zöld, `cargo check` 5s)

Roadmap: [`KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md`](KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md).

---

## Miért kell

A Supabase JS kliens alapértelmezetten a `localStorage`-ba menti a session-t: access_token + refresh_token + expires_at JSON formában, `sb-<projectref>-auth-token` kulccsal. Ez **több gondot is okoz** a Tauri desktop környezetben:

1. **DevTools hozzáférés**: a Tauri webview-ben a user `F12`-vel láthatja a localStorage-t, és kiolvashatja a tokent.
2. **Fájlrendszer export**: a Tauri LocalStorage file-ban tárolódik az app adatmappájában — egyszerűen másolható.
3. **Nem illeszkedik a meglévő biztonsági modellhez**: az SQLCipher-kulcs (M2.3) és a device-privkey (M3.3) már OS-szintű keyring-ben van. A session itt a gyenge láncszem.

Az M6.6-ben felvált a localStorage-t az OS-szintű keyring-re:
- **Windows**: Credential Manager (DPAPI — per-user védelem)
- **macOS**: Keychain
- **Linux**: Secret Service

Fizikai gép-hozzáférés sem ad automatikus olvasást; másik user fiók szintén nem fér hozzá.

## Mi történt

### 1. Rust — `apps/desktop/src-tauri/src/auth.rs` (új modul)

localStorage-szerű kulcsonkénti interface, 3 Tauri command:

```rust
#[tauri::command] auth_store_item(key: String, value: String) -> Result<(), String>
#[tauri::command] auth_read_item(key: String)  -> Result<Option<String>, String>
#[tauri::command] auth_clear_item(key: String) -> Result<(), String>
```

**Kulcs-sanitize + prefix-lock**:
- Csak `auth-` prefixű kulcsok engedélyezettek — a többi keyring-slot (SQLCipher-kulcs, device-privkey) biztonsági elkülönítve
- Engedélyezett karakterek: `a-z0-9-_.:` — bármely más karakter `_`-re cserélve
- Max 128 karakter hosszú kulcs

**4 unit test** a `sanitize_key` függvényre, mind PASS: valid prefix elfogad, invalid karakter escape, rossz prefix rejekció, túl hosszú kulcs rejekció.

### 2. Rust — `apps/desktop/src-tauri/src/lib.rs`

`mod auth` + 3 új command regisztrálva a `tauri::generate_handler![...]`-ban.

### 3. TS shared — `packages/supabase-client/src/{browser,index}.ts`

A `createKartotekaBrowserClient` factory bővítve `authOptions` paraméterrel:

```ts
export interface SupabaseAuthStorage {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

export interface SupabaseBrowserConfig {
  url: string
  anonKey: string
  authOptions?: {
    storage?: SupabaseAuthStorage
    storageKey?: string
    persistSession?: boolean
    autoRefreshToken?: boolean
    detectSessionInUrl?: boolean
  }
}
```

A web oldal **nem módosul** (a cookie-alapú SSR session változatlan). Csak a desktop oldal kap `authOptions`-t.

### 4. TS desktop — `apps/desktop/src/lib/supabase.ts`

`tauriKeyringStorage` adapter:

```ts
const tauriKeyringStorage: SupabaseAuthStorage = {
  async getItem(key)        { return invoke('auth_read_item',  { key: `auth-${key}` }) ?? null },
  async setItem(key, value) { return invoke('auth_store_item', { key: `auth-${key}`, value }) },
  async removeItem(key)     { return invoke('auth_clear_item', { key: `auth-${key}` }) },
}
```

A `getDesktopSupabase()` factory singleton átadja ezt:

```ts
createKartotekaBrowserClient({
  url, anonKey,
  authOptions: {
    storage: tauriKeyringStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // Tauri webview — nincs OAuth URL-redirect
  },
})
```

## Verifikáció

```bash
# TS typecheck (shared + desktop)
npm run typecheck --workspace=@kartoteka/supabase-client   # 0 hiba
cd apps/desktop && npx tsc --noEmit                         # 0 hiba

# Rust cargo check
cd apps/desktop/src-tauri && cargo check                    # Finished in 5.06s

# Rust unit tests
cd apps/desktop/src-tauri && cargo test auth::              # 4 passed; 0 failed
```

## Szignál-szint smoketest (Endrének, amikor a desktop app-ot következőre fordítjuk)

Első indítás, login után:

1. **Tauri devtools**: `localStorage` üres vagy nincs benne `sb-*-auth-token` (csak alap Supabase-flush-okok, ha vannak).
2. **Windows Credential Manager** (Vezérlőpult → Hitelesítő adatok kezelője → Windows-hitelesítő adatok): kell lennie egy `kartoteka-desktop:auth-sb-<projectref>-auth-token` entry-nek.
3. **Restart app** → a user még bejelentkezve van (a session a keyring-ből betöltődik).
4. **Logout** → a Credential Manager entry eltűnik.

## Backward-compatibility

A meglévő session-ök a localStorage-ban **nem vándorolnak automatikusan** át — az első kliens-indításkor `auth_read_item` `Null`-t ad, ami a Supabase JS számára "no session" → **re-login szükséges egyszer**. Ez elfogadható, mert:
1. A desktop a beta-fázisban van, a userek száma limitált
2. A re-login egy egyszerű lépés, nem tart 5 másodpercnél tovább
3. A migrálás script-je nem indokolt — félkész állapot kockázatosabb, mint egy egyszerű re-login

Ha a jövőben (prod-rollout előtt M16-ban) indokolt lesz, egy egyszeri migrációs lépés hozzáadható a `auth-gate.tsx`-be.

## Mi NEM volt scope-ban

- **Windows Hello / PIN** védelem a session-en — ez M13 (E2E doc-titkosítás) előtt nem indokolt
- **Session refresh background worker** — a Supabase JS `autoRefreshToken: true` ezt kezeli, külön scheduler nem kell
- **Offline-login UI** — amikor a refresh token lejár offline (30 nap után), külön UX-elem kell; M8 elején a profil-modul keretén belül kerül be

## Kapcsolódó fájlok

- [`apps/desktop/src-tauri/src/auth.rs`](../../apps/desktop/src-tauri/src/auth.rs) (új, ~130 sor + 4 unit test)
- [`apps/desktop/src-tauri/src/lib.rs`](../../apps/desktop/src-tauri/src/lib.rs) (+ `mod auth`, + 3 command reg)
- [`packages/supabase-client/src/browser.ts`](../../packages/supabase-client/src/browser.ts) (+ `SupabaseAuthStorage`, `authOptions`)
- [`packages/supabase-client/src/index.ts`](../../packages/supabase-client/src/index.ts) (+ `SupabaseAuthStorage` re-export)
- [`apps/desktop/src/lib/supabase.ts`](../../apps/desktop/src/lib/supabase.ts) (+ `tauriKeyringStorage`)

## Következő M6 lépések

- **M6.3** — portable-user diagnostic eredménye alapján döntés és megvalósítás
- **M6.8** — Offline orchestrator átemelése `apps/web/lib/offline/*` → `packages/offline-sync/src/*` (az M7 utolsó előfeltétele)
- **M7** — Pénzügyi wave **indulhat**, mihelyt M6.8 kész (az M6.2 + M6.7 már nem blokkolnak)

Az M6 fázis **~70%-ban kész**, csak M6.3 (vagy lépcsős vagy azonnali) + M6.8 (offline orchestrator átemelés) maradt.
