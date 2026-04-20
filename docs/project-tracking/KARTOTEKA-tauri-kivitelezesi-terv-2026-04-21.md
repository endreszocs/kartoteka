# Kartotéka — Tauri 2 kivitelezési terv (runbook)

**Dátum**: 2026-04-21x
**Státusz**: DÖNTÉSRE VÁR — Endre jóváhagyására
**Fejlesztő**: Szőcs Endre (saját idő)
**Függőség**: a `KARTOTEKA-tauri-migracio-terv-2026-04-21.md` döntési anyag
**Célrendszer**: Next.js marad web-appnak (Railway EU) + új Tauri 2 desktop kliens (Windows x64)

---

## 0. Bevezetés

Ez a dokumentum **hogyan** fogjuk végrehajtani a Tauri-migrációt. Heti bontás, konkrét
commitok, minden fázis végén **ellenőrző kritériumok**. Ha elfogadod, **azt követően**
elkezdem a régi offline stack törlését és az új rendszer építését.

### 0.1 Kulcs-elvek

1. **Non-breaking**: a jelenlegi Next.js web-app **végig működik**. Nincs "nagy törés" pillanat.
2. **Moduláris**: minden fázis önállóan **leszállítható**, nem kell az egész projektet befejezni, hogy hasznos legyen.
3. **Inkrementális törlés**: a régi offline stack **nem hirtelen** tűnik el, hanem fázisonként, mikor már nincs rá szükség.
4. **Git-biztonság**: minden fázis **saját branch**-en (`feat/m0-supabase-bovites`, `feat/m1-tauri-poc` stb.), csak teszt + review után merge main-be.
5. **Reversible**: minden fázis végén legyen **rollback útmutató** (mit és hogyan lehet visszacsinálni, ha valami rossz irányba megy).

### 0.2 Projektstruktúra végállapot

```
KARTOTEKA/                              # git root (monorepo)
├── apps/
│   ├── web/                            # a jelenlegi Next.js 16 app (költöztetve ide)
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   └── next.config.ts
│   └── desktop/                        # ÚJ — Tauri 2 + Vite SPA
│       ├── src/                        # React/Vite frontend
│       ├── src-tauri/                  # Rust backend
│       │   ├── src/
│       │   ├── Cargo.toml
│       │   └── tauri.conf.json
│       └── package.json
├── packages/                           # ÚJ — közös kódbázis
│   ├── ui/                             # közös React-komponensek (shadcn alapú)
│   ├── supabase-client/                # typed Supabase-kliens
│   ├── design-tokens/                  # Tailwind preset + CSS vars
│   └── schema-types/                   # TS típusok a DB-sémából
├── supabase/                           # ÚJ — Supabase config + Edge Functions
│   ├── functions/                      # Deno Edge Fn-ek
│   └── migrations/                     # SQL migrációk (timestamp + név)
├── docs/
├── migration-docs/
└── Kartotéka AGY/                      # Obsidian vault (ez külön könyvtárban élhet)
```

A `apps/web/` maga a jelenlegi `D:\Egyházi APP\KARTOTEKA` gyökér tartalmát kapja —
**nem költöztetjük át** fizikailag, hanem a monorepo-struktúrát **a jelenlegi
állapoton belül** hozzuk létre. A `apps/desktop/` új, üres mappa.

---

## 1. Fázisok áttekintése

| Fázis | Időkeret | Fő deliverable | Merge-kritérium |
|-------|---------|-----------------|-----------------|
| **M0** | 6 hét | Supabase backend bővítés + V1 biztonsági | Admin approval-flow működik, email-confirm kötelező |
| **M1** | 6-8 hét | Tauri PoC + Vite SPA auth | `npm run tauri dev` Windows-on, auth működik |
| **M2** | 8-10 hét | SQLCipher + Stronghold + offline CRUD | `szemely` lista offline, outbox, titkosítva |
| **M3** | 6-8 hét | Sync + konfliktus-kezelés | Mind a 26 tábla sync-ben, 409 dialog |
| **M4** | 5-6 hét | E2E dokumentum-titkosítás | DEK + device public key, Storage csak ciphertext |
| **M5** | 3-4 hét | Updater + licenc + device-bind | Aláírt MSI + Tauri auto-update |
| **M6** | 6-8 hét | Béta + stabilizálás | 3 gyülekezet 6 hét, crash-log tiszta |

**Összes**: ~40-50 hét naptár-idő (saját munkaidő mellett, más munka nélkül).

---

## 2. M0 — Supabase backend bővítés + V1 (6 hét)

### M0.1 (1. hét) — access_requests tábla + admin UI

**Feladatok**:
- [ ] SQL migráció: `access_requests` tábla létrehozása a 7. szekcióban specifikált módon
- [ ] RLS policy: anon INSERT, admin SELECT/UPDATE
- [ ] `app/(dashboard)/admin/access-requests/` új oldal — a jelenlegi admin-layout alatt
- [ ] `access-requests-table.tsx` — lista, szűrő (pending/approved/rejected), reszponzív
- [ ] `approve-dialog.tsx` / `reject-dialog.tsx` — az action-ök modal-ja
- [ ] Server actions: `approveAccessRequest(id, notes)`, `rejectAccessRequest(id, reason)`

**Fájlok módosítása**:
- ÚJ: `app/(dashboard)/admin/access-requests/page.tsx`
- ÚJ: `app/(dashboard)/admin/access-requests/actions.ts`
- ÚJ: `components/admin/access-request-*.tsx` (3 komp.)
- ÚJ: `migration-docs/sql/2026-04-22-access-requests.sql` (Endre futtatja)
- MÓDOSÍT: `components/admin/admin-tabs-v3.tsx` — új tab hozzáadva

**Branch**: `feat/m0-1-access-requests`
**Merge-kritérium**: admin láthatja a pending kéréseket, tudja jóváhagyni/elutasítani, audit-log bejegyzés keletkezik minden akciónál.

### M0.2 (2. hét) — Publikus access-request űrlap + email

**Feladatok**:
- [ ] `/hozzaferes-kerese` publikus oldal (a landing után)
- [ ] Űrlap: email, teljes név, gyülekezet, szerepkör (lelkesz/esperes/hivatal), indoklás
- [ ] Rate limiting: ip_hash mentés, 1 kérés/IP/24ó
- [ ] reCAPTCHA vagy Turnstile (Cloudflare) spam-ellenesen
- [ ] **Brevo átállás a Resend-ről** (`lib/broadcasts/email.ts`) — `feat/m0-2-brevo-migration` branch
- [ ] Email-sablonok: access-request confirmation, admin-notification, approval/rejection
- [ ] `.env.local` + `.env.example`: `BREVO_API_KEY`, `BREVO_FROM` → dokumentumentációban

**Fájlok**:
- ÚJ: `app/hozzaferes-kerese/page.tsx`
- ÚJ: `app/hozzaferes-kerese/actions.ts`
- MÓDOSÍT: `lib/broadcasts/email.ts` (Resend → Brevo, ~20 sor)
- MÓDOSÍT: `package.json` (`resend` → `@getbrevo/brevo`)
- ÚJ: `lib/email/templates/access-request-confirm.html`
- ÚJ: `lib/email/templates/access-approved.html`
- ÚJ: `lib/email/templates/access-rejected.html`

**Branch**: `feat/m0-2-public-access-request`
**Merge-kritérium**: anon user submit-elhet, saját email-címére kap confirmation-t, admin kap notification-t, approval-kor a user értesül email-ben.

### M0.3 (3. hét) — profiles.approved + custom JWT claim

**Feladatok**:
- [ ] SQL: `profiles.approved` oszlop + trigger `handle_new_user()` frissítése (approved default false)
- [ ] Supabase Dashboard: "Enable email confirmations" bekapcsolása
- [ ] SQL: `custom_access_token_hook` function létrehozás
- [ ] Supabase Dashboard: hook aktiválása
- [ ] `middleware.ts`: approved=false esetén redirect `/fiokod-jovahagyasra-var` oldalra
- [ ] `/fiokod-jovahagyasra-var` új oldal (magyarázó szöveg, admin kontakt)

**Fájlok**:
- MÓDOSÍT: `migration-docs/sql/2026-04-22-profiles-approved.sql`
- MÓDOSÍT: `middleware.ts` (approved-check)
- ÚJ: `app/fiokod-jovahagyasra-var/page.tsx`

**Branch**: `feat/m0-3-approved-claim`
**Merge-kritérium**: új user regisztrál → nem tud belépni, amíg admin nem approve-olja. Approve-olás után JWT-ben `approved: true` claim.

### M0.4 (4. hét) — RLS audit minden táblán

**Feladatok**:
- [ ] SQL lekérdezés: minden `public` schema tábla listája + RLS státusza
- [ ] Tábla-tábla ellenőrzés: van-e RLS, van-e valid policy
- [ ] Hiányzó policy-k hozzáadása (pl. olyan tábla, ahol csak a creator láthat)
- [ ] Policy-minták: `is_admin()`, `same_congregation()`, `is_owner()` SQL function-ök
- [ ] Dokumentálás: `migration-docs/rules/rls-policy-catalog.md` — minden tábla + policy
- [ ] Script: `scripts/check-rls-coverage.sql` — végig-auditálni

**Fájlok**:
- ÚJ: `migration-docs/sql/2026-04-22-rls-audit-fixes.sql`
- ÚJ: `migration-docs/rules/rls-policy-catalog.md`
- ÚJ: `scripts/check-rls-coverage.sql`

**Branch**: `feat/m0-4-rls-audit`
**Merge-kritérium**: **minden** `public` schema tábla RLS-védett, minden policy dokumentált.

### M0.5 (5. hét) — user_devices + licenses táblák

**Feladatok**:
- [ ] SQL: `user_devices`, `licenses`, `audit_log` táblák
- [ ] RLS policy mindegyikre
- [ ] Admin UI: `/admin/devices` — eszköz-lista per user + revoke gomb
- [ ] Admin UI: `/admin/licenses` — licenc-kiadás, lejárat módosítás
- [ ] Audit-log oldal: `/admin/audit-log` — időrendben szűrhető

**Fájlok**:
- ÚJ: `migration-docs/sql/2026-04-22-devices-licenses-audit.sql`
- ÚJ: `app/(dashboard)/admin/devices/page.tsx`
- ÚJ: `app/(dashboard)/admin/licenses/page.tsx`
- ÚJ: `app/(dashboard)/admin/audit-log/page.tsx`

**Branch**: `feat/m0-5-devices-licenses`
**Merge-kritérium**: admin láthatja az eszközöket, tud revokálni, minden akció audit-log-ban.

### M0.6 (6. hét) — storage + documents séma

**Feladatok**:
- [ ] SQL: `documents`, `document_keys` táblák
- [ ] Supabase Storage buckets: `documents-encrypted` (private)
- [ ] Storage policy: csak authenticated user + tulajdonos
- [ ] Signed URL helper: `lib/storage/signed-url.ts` (15 perces TTL)
- [ ] Cleanup-cron: 7 napja deleted_at-tal rendelkező rekordok + Storage fájlok törlése (Supabase pg_cron)

**Fájlok**:
- ÚJ: `migration-docs/sql/2026-04-22-documents-schema.sql`
- ÚJ: `lib/storage/signed-url.ts`
- ÚJ: `supabase/functions/cleanup-deleted-documents/index.ts`

**Branch**: `feat/m0-6-documents-schema`
**Merge-kritérium**: dokumentum-táblák + bucket létezik. Még **nincs** E2E titkosítás — az M4-ben jön.

### M0 összefoglaló

**M0 végén** (6 hét múlva):
- ✅ Minden új user admin-jóváhagyást igényel
- ✅ Email confirm kötelező (Brevo-val, ingyen)
- ✅ RLS audit kész, minden tábla védett
- ✅ Eszköz-regisztráció + licenc-infrastruktúra **létezik** (de még nincs Tauri, ami használja)
- ✅ Dokumentum-táblák és privát Storage bucket **létezik** (titkosítás nélkül egyelőre)
- ✅ **V1 KÉSZ**: ez önmagában a biztonsági célú átfogás. Ha M1-et nem folytatjuk, akkor is értékes.

**Rollback M0 esetén**: minden SQL migrációnak van `DOWN` szakasza, így minden visszafordítható. A Brevo-migrációt vissza-Resend-re cserélni: 30 perc.

---

## 3. M1 — Tauri PoC (6-8 hét)

### M1.1 (1. hét) — Monorepo szerkezet kialakítása

**Feladatok**:
- [ ] npm workspaces konfiguráció (`package.json` → `"workspaces": ["apps/*", "packages/*"]`)
- [ ] A jelenlegi Next.js app áthelyezése `apps/web/` alá (fájlok `git mv`-vel)
- [ ] `packages/ui/`, `packages/supabase-client/`, `packages/design-tokens/` létrehozás üresen
- [ ] Az `apps/web/package.json` átnevezése: `@kartoteka/web`
- [ ] Root `package.json` — workspace-eket regisztrál, közös dep-ek

**Fájlok**:
- MÓDOSÍT: root `package.json` → `workspaces` mező hozzáadása
- `package.json` → root + apps/web/
- `apps/web/` (minden jelenlegi fájl áttöltve)
- ÚJ: `packages/*/package.json` (szerkezet)

**Branch**: `feat/m1-1-monorepo-init`
**Merge-kritérium**: `cd apps/web && npm run dev` ugyanúgy elindítja a jelenlegi appot. Nincs regresszió.

### M1.2 (2. hét) — Tauri projekt init

**Feladatok**:
- [ ] `apps/desktop/` létrehozás: `npm create tauri-app@latest` sablon: React + TypeScript + Vite
- [ ] `src-tauri/Cargo.toml`: alap függőségek (tauri 2, tokio, serde)
- [ ] `tauri.conf.json`: ablak-méret, címek, icon
- [ ] `npm run tauri dev` tesztelés Windowson — működő React Hello World WebView-ban
- [ ] `npm run tauri build` tesztelés — működő MSI generálás (még nem aláírt)

**Fájlok**:
- ÚJ: `apps/desktop/` teljes Tauri-sablon
- MÓDOSÍT: root `package.json` workspaces — apps/desktop már érvényes

**Branch**: `feat/m1-2-tauri-init`
**Merge-kritérium**: `npm run tauri dev` egy "Hello Kartotéka" ablakot nyit Windows-on. MSI-build sikeres.

### M1.3 (3. hét) — packages/supabase-client közös

**Feladatok**:
- [ ] `packages/supabase-client/` — typed Supabase kliens, kompatibilis web + Tauri
- [ ] `generate-typescript-types` — a Supabase CLI-vel generáljuk a DB-séma TS-típusokat
- [ ] `createBrowserClient()` wrapper — auto env-detekció (web vs. Tauri)
- [ ] `apps/web/lib/supabase/client.ts` átemelése — most a `packages/supabase-client`-re hivatkozik
- [ ] `apps/desktop/src/lib/supabase.ts` — ugyanazt a klienst használja

**Fájlok**:
- ÚJ: `packages/supabase-client/src/index.ts`
- ÚJ: `packages/supabase-client/src/types.ts` (generated)
- MÓDOSÍT: `apps/web/lib/supabase/client.ts` (csak re-export)

**Branch**: `feat/m1-3-shared-supabase`
**Merge-kritérium**: az `apps/web/` továbbra is működik. Az `apps/desktop/` ugyanazzal az importtal elér egy Supabase klienst.

### M1.4 (4-5. hét) — packages/ui + design-tokens

**Feladatok**:
- [ ] `packages/design-tokens/` — Tailwind preset, brand-színek, font-family, radius-ok
- [ ] `packages/ui/` — a `components/ui/*` (shadcn-alapú) átemelése packages-be
- [ ] `apps/web/` + `apps/desktop/` egyaránt a `@kartoteka/ui`-ból importálja a komponenseket
- [ ] Storybook init a `packages/ui/`-hoz (opcionális, ha időben fér)

**Fájlok**:
- ÚJ: `packages/design-tokens/tailwind-preset.js`
- ÚJ: `packages/ui/src/*.tsx` (shadcn komponensek)
- MÓDOSÍT: `apps/web/tailwind.config.ts` — a preset használata

**Branch**: `feat/m1-4-shared-ui`
**Merge-kritérium**: `apps/web` UI változatlan (regresszió-teszt Playwright). `apps/desktop` egy `<Button>` komponenst használ ugyanolyan megjelenéssel.

### M1.5 (6-8. hét) — Tauri auth + routing

**Feladatok**:
- [ ] Tauri: Supabase login űrlap (email+password)
- [ ] Tauri: redirect-handling (Supabase OAuth/magic-link — egyelőre csak email+jelszó)
- [ ] Tauri: `approved` claim check, ha nem → blokkolás
- [ ] Tauri routing: `react-router-dom` + védett routes
- [ ] Tauri: session perzisztálás (`Stronghold` plugin — erre már előkészítjük az M2-ben)
- [ ] Tauri: dashboard-placeholder oldal login után

**Fájlok**:
- ÚJ: `apps/desktop/src/pages/Login.tsx`
- ÚJ: `apps/desktop/src/pages/Dashboard.tsx` (placeholder)
- ÚJ: `apps/desktop/src/auth/AuthProvider.tsx`
- ÚJ: `apps/desktop/src/routes/ProtectedRoute.tsx`
- ÚJ: `apps/desktop/src-tauri/src/commands/session.rs` (skeleton)

**Branch**: `feat/m1-5-tauri-auth`
**Merge-kritérium**: Tauri app indul, user email+jelszóval belép, dashboardot lát. Session tartósul, ha újraindul. Approved=false → block screen.

### M1 összefoglaló

**M1 végén** (6-8 hét múlva):
- ✅ Monorepo szerkezet
- ✅ Működő Tauri desktop app Windows-on
- ✅ Közös UI + design + Supabase-kliens packages
- ✅ Auth-flow működik (login, session, approved-check)
- ❌ **Nincs még lokális DB** — minden online Supabase-hez
- ❌ **Nincs még offline** — ha net kiesik, az app nem működik

**Rollback M1 esetén**: a `apps/desktop/` mappa törlésével. Az `apps/web/` + `packages/*` megmarad (a monorepo-migrálás visszahozható ha kell, de érdemes megtartani).

---

## 4. M2 — SQLCipher + Stronghold + offline CRUD (8-10 hét)

### M2.1 (1-2. hét) — SQLCipher infrastruktúra

**Feladatok**:
- [ ] `apps/desktop/src-tauri/Cargo.toml`: `rusqlite` feature `"bundled-sqlcipher"` — SQLCipher Community Edition statikusan belinkelve
- [ ] `cargo build` tesztelés — sikeres compile Windows-on (cross-link SQLCipher.lib)
- [ ] DB-init függvény: ha nincs DB, létrehozás + első migráció
- [ ] Séma 1.0: `schema_version` tábla + `_outbox` tábla (egyelőre üres, M3-ban tölti)

**Fájlok**:
- ÚJ: `apps/desktop/src-tauri/src/db/mod.rs`
- ÚJ: `apps/desktop/src-tauri/src/db/schema.rs`
- ÚJ: `apps/desktop/src-tauri/src/db/migrations/001_initial.sql`

**Branch**: `feat/m2-1-sqlcipher-init`
**Merge-kritérium**: `npm run tauri dev` — app induláskor létrejön egy `kartoteka.db` fájl az AppData-ban, SQLCipher-titkosítva.

### M2.2 (3. hét) — Stronghold kulcstár

**Feladatok**:
- [ ] `tauri-plugin-stronghold` hozzáadása
- [ ] Első indulás: user-megad egy "mester jelszót" (min. 8 karakter)
- [ ] argon2-derivált master-key → Stronghold-ba
- [ ] Az SQLCipher DB-key randomgenerálva → wrap-olva a master-key-vel → Stronghold-ba
- [ ] Minden DB-nyitáskor: master-password check → DB-key unlock → SQLCipher `PRAGMA key`
- [ ] UI: első-indulás wizard (master-jelszó beállítás) + minden indulás wizard (master-jelszó megadás, ha timeout)

**Fájlok**:
- ÚJ: `apps/desktop/src-tauri/src/keyring/mod.rs`
- ÚJ: `apps/desktop/src/pages/SetupWizard.tsx`
- ÚJ: `apps/desktop/src/pages/UnlockScreen.tsx`

**Branch**: `feat/m2-2-stronghold`
**Merge-kritérium**: ha a user rossz jelszót ad meg, nincs DB-hozzáférés. Helyes jelszó → app indul. A `kartoteka.db` fájl **nem olvasható** sqlite3 CLI-ből.

### M2.3 (4-5. hét) — Első tábla: `szemely` CRUD offline

**Feladatok**:
- [ ] SQL séma: `szemely` tábla lokálisan (minden Supabase oszlop, + `_sync_status`, `_base_revision`)
- [ ] Rust cmd: `list_szemely(filter)` — olvas SQLCipher-ből
- [ ] Rust cmd: `upsert_szemely(row)` — ír SQLCipher-be + outbox-ba
- [ ] Rust cmd: `delete_szemely(id)` — `_pending_delete = true`, outbox-ba
- [ ] Tauri IPC: ezeket hívja a React frontend
- [ ] Frontend: `useTauriQuery('list_szemely')`, `useTauriMutation('upsert_szemely')`
- [ ] UI: tag-lista, új tag dialog, szerkesztés — offline is működjön

**Fájlok**:
- ÚJ: `apps/desktop/src-tauri/src/commands/szemely.rs`
- ÚJ: `apps/desktop/src-tauri/src/db/migrations/002_szemely.sql`
- ÚJ: `apps/desktop/src/hooks/useTauri*.ts` (2 hook)
- ÚJ: `apps/desktop/src/pages/Szemely.tsx`
- ÚJ: `apps/desktop/src/components/SzemelyDialog.tsx`

**Branch**: `feat/m2-3-szemely-offline`
**Merge-kritérium**: Tauri app offline módban is működik — látja a tagokat, lehet újat hozzáadni, szerkeszteni.

### M2.4 (6-7. hét) — További táblák (csalad, befizetes, kiadas)

**Feladatok**:
- [ ] `csalad` tábla + Rust cmd + UI (analóg a `szemely`-hez)
- [ ] `befizetes` + `kiadas` ditto
- [ ] Generic helper: `list_table<T>(table, filter)` — a Rust kód ne duplikálódjon
- [ ] Scope-filter minden query-ben (congregation_id)

**Fájlok**:
- ÚJ: `apps/desktop/src-tauri/src/commands/` (3 új fájl)
- ÚJ: `apps/desktop/src-tauri/src/db/migrations/003-005_*.sql`
- ÚJ: `apps/desktop/src/pages/Csalad.tsx`, `Befizetes.tsx`, `Kiadas.tsx`

**Branch**: `feat/m2-4-fobbi-tablak`
**Merge-kritérium**: 4 modul offline-ban működik.

### M2.5 (8-10. hét) — A maradék 22 tábla séma + adapter

**Feladatok**:
- [ ] Az SQL-sémat a `migration-docs/Database_schema.sql`-ből generáljuk Rust-ba egy script-tel (`scripts/generate-sqlcipher-schema.ts`)
- [ ] Minden tábla CRUD-helper generálása
- [ ] UI-ban: csak a legfőbb 4 oldalt implementáljuk interaktívan, a többi **read-only** listaként (a teljes interaktivitás M6-ra csúszhat)

**Fájlok**:
- ÚJ: `scripts/generate-sqlcipher-schema.ts`
- ÚJ: `apps/desktop/src-tauri/src/db/migrations/006-026_*.sql` (automatikus gen.)

**Branch**: `feat/m2-5-full-schema`
**Merge-kritérium**: 26 tábla séma létezik. A fő 4 modul interaktív, a többi read-only.

### M2 összefoglaló

**M2 végén** (8-10 hét):
- ✅ SQLCipher titkosított DB
- ✅ Stronghold kulcstár, master-jelszó
- ✅ 26 tábla séma
- ✅ 4 modul teljes CRUD offline
- ✅ 22 modul read-only offline
- ❌ **Nincs még sync** — a lokális és felhő DB elválik. Minden ami offline történik,
   nem megy fel. Minden ami felhőben történik, nem jön le.

**Rollback M2 esetén**: a `apps/desktop/` mappa visszavágható M1 végi állapotba.

---

## 5. M3 — Sync + konfliktus-kezelés (6-8 hét)

### M3.1 (1-2. hét) — Rust outbox worker

**Feladatok**:
- [ ] `_outbox` tábla: `id`, `table_name`, `row_id`, `op` (insert/update/delete), `payload`, `status`, `attempt_count`, `base_revision`
- [ ] Rust worker: `tokio::spawn` async task, 10 sec-enként próbálja
- [ ] Exponential backoff (1s→4s→16s→1min→5min→max 30min)
- [ ] Retry-limit: 5× → `dead` status
- [ ] HTTP kliens `reqwest` → Supabase REST API
- [ ] Optimistic locking: update `WHERE id=? AND revision=base_revision`
- [ ] 409 → outbox.status = 'conflict', `_conflicts` tábla

**Fájlok**:
- ÚJ: `apps/desktop/src-tauri/src/sync/outbox.rs`
- ÚJ: `apps/desktop/src-tauri/src/sync/http_client.rs`
- ÚJ: `apps/desktop/src-tauri/src/sync/mod.rs`

**Branch**: `feat/m3-1-outbox-worker`
**Merge-kritérium**: offline INSERT → online → auto-push → Supabase-ben megjelenik.

### M3.2 (3. hét) — Pull rendszer

**Feladatok**:
- [ ] `_sync_meta` tábla: `table_name`, `last_pull_at`
- [ ] Rust pull: minden 2 perc (aktív), 15 perc (háttér)
- [ ] Delta pull: `GET /rest/v1/{table}?updated_at=gt.{cursor}`
- [ ] Bulk upsert lokális SQLCipher-be, `_sync_status = 'clean'`
- [ ] Cursor frissítés

**Fájlok**:
- ÚJ: `apps/desktop/src-tauri/src/sync/pull.rs`
- ÚJ: `apps/desktop/src-tauri/src/db/migrations/027_sync_meta.sql`

**Branch**: `feat/m3-2-pull`
**Merge-kritérium**: Supabase-ben változtatás → pull worker 2 percen belül lehúzza → Tauri UI látja.

### M3.3 (4-5. hét) — Supabase Realtime integráció

**Feladatok**:
- [ ] `tokio-tungstenite` crate a Rust-ban → WebSocket kapcsolat
- [ ] Supabase Realtime protocol: subscribe-olunk a 26 tábla-változásra
- [ ] Ha szerver-change érkezik → pull-t triggerezünk (nem fogadjuk el direktben, mert auth miatt RLS-t kell validálni)
- [ ] Reconnect-logika: kapcsolat megszakadásakor exp-backoff

**Fájlok**:
- ÚJ: `apps/desktop/src-tauri/src/sync/realtime.rs`

**Branch**: `feat/m3-3-realtime`
**Merge-kritérium**: 2 Tauri-kliens ugyanazzal a userrel — 1-es változtatása <5 sec-ben megjelenik a 2-esen.

### M3.4 (6-7. hét) — Konfliktus UI

**Feladatok**:
- [ ] `_conflicts` tábla UI-ja: lista a pending konfliktusokról
- [ ] Conflict-dialog: 3 oszlop (szerver-érték / saját-érték / merge-mezők)
- [ ] 3 akció: "Szerveré legyen", "Saját legyen", "Manuális merge" (mezőnként)
- [ ] Resolve után az outbox-ba új mutation, új base_revision

**Fájlok**:
- ÚJ: `apps/desktop/src/pages/Conflicts.tsx`
- ÚJ: `apps/desktop/src/components/ConflictDialog.tsx`

**Branch**: `feat/m3-4-conflict-ui`
**Merge-kritérium**: szándékos konfliktus-generálás 2 klienssel → conflict-dialog jön elő, user választ, sync-folytatódik.

### M3.5 (8. hét) — Status bar + audit

**Feladatok**:
- [ ] Tauri state: `useSyncStatus()` hook
- [ ] Fejléc sáv: online/offline, pending count, last-sync idő
- [ ] Minden outbox-actionra audit-log bejegyzés a Supabase-be
- [ ] Admin-nek látható audit-log oldal

**Fájlok**:
- ÚJ: `apps/desktop/src/components/SyncStatusBar.tsx`

**Branch**: `feat/m3-5-sync-status`
**Merge-kritérium**: status-bar pontosan tükrözi a sync-állapotot. Audit-log minden műveletet rögzít.

### M3 összefoglaló

**M3 végén** (6-8 hét):
- ✅ Kétirányú sync Supabase ↔ Tauri
- ✅ Konfliktus-kezelés
- ✅ Realtime update más eszközökön
- ✅ Audit-log
- ❌ **Dokumentumok még nincsenek titkosítva**

---

## 6. M4 — E2E dokumentum-titkosítás (5-6 hét)

### M4.1 (1-2. hét) — X25519 kulcs-infra

**Feladatok**:
- [ ] Első device-registráció: X25519 keypair generálás Rust-ban
- [ ] Public key → Supabase `user_devices.public_key`
- [ ] Private key → Stronghold (védett)
- [ ] Multi-device: ugyanazon user több device-pénzél — mindegyik saját keypair

**Fájlok**:
- ÚJ: `apps/desktop/src-tauri/src/crypto/keygen.rs`

### M4.2 (3-4. hét) — DEK + Storage upload

**Feladatok**:
- [ ] Doc-upload flow:
  1. User választ fájlt
  2. Rust: random DEK (AES-256) generálás
  3. Rust: fájl titkosítás AES-GCM
  4. HTTP POST → Supabase Storage (private bucket)
  5. DEK wrap minden device-kulcshoz (X25519-ChaCha20Poly1305)
  6. `document_keys` tábla insert

**Fájlok**:
- ÚJ: `apps/desktop/src-tauri/src/crypto/document.rs`
- ÚJ: `apps/desktop/src-tauri/src/commands/documents.rs`

### M4.3 (5-6. hét) — Doc-download + dekript

**Feladatok**:
- [ ] Doc-download flow:
  1. Signed URL kérés `issue-signed-url` Edge Fn-től
  2. GET → ciphertext
  3. `document_keys`-ből wrap-olt DEK
  4. Rust: unwrap DEK (X25519 private key + ChaCha20Poly1305)
  5. Rust: fájl dekriptálás (AES-GCM)
  6. Temp fájl, megnyitás system-associated app-pal
- [ ] UI: doc-list + preview + upload/download gombok

**Fájlok**:
- ÚJ: `apps/desktop/src/pages/Documents.tsx`

**Branch**: `feat/m4-docs-e2e`
**Merge-kritérium**: Admin-ként feltöltök egy PDF-et. A Supabase Storage-ban ciphertext van (nem olvasható). Another device-on, ahol a user logged-in, letölthető és olvasható.

---

## 7. M5 — Updater + licenc (3-4 hét)

### M5.1 (1. hét) — Code-signing setup

**Feladatok**:
- [ ] OV Code-signing cert vásárlás (~$100/év — DigiCert / Sectigo)
- [ ] Private key biztonságos tárolása (1Password / USB token)
- [ ] Tauri build: signing step hozzáadva
- [ ] Első aláírt MSI → Windows SmartScreen reputation-építés

### M5.2 (2. hét) — Tauri Updater

**Feladatok**:
- [ ] `tauri-plugin-updater` konfig
- [ ] Supabase Storage-ban release-fájlok (MSI + signature)
- [ ] `check_updates` Edge Fn: visszaad legújabb release-t
- [ ] Auto-check indulásnál, user-approval-kor patch

### M5.3 (3-4. hét) — Licenc + device-limit

**Feladatok**:
- [ ] Licenc-JWT generálás admin-ban
- [ ] Offline-validálás Rust-ban (public key ellenőrzés)
- [ ] Device-limit check: új regisztrációnál, ha > limit → admin-approval kell

**Branch**: `feat/m5-updater-license`
**Merge-kritérium**: új MSI release → klienseken auto-update. Licenc-lejárat → app-ban warning 7 nappal előtte.

---

## 8. M6 — Béta + stabilizálás (6-8 hét)

### M6.1 — Béta-kör (4 hét)

**Feladatok**:
- [ ] 3 béta-gyülekezet kiválasztása (Endrével + EREK Elnöksége)
- [ ] Béta-csomag kiküldés + telepítési útmutató magyarul
- [ ] Weekly feedback-call a béta-userekkel
- [ ] Crash-log gyűjtés (Sentry vagy Tauri-natív)

### M6.2 — Tesztelés + doc (2-4 hét)

**Feladatok**:
- [ ] Playwright e2e tesztek a kritikus flow-kra
- [ ] Rust unit-tesztek a sync-worker-re, crypto-ra
- [ ] Telepítő-útmutató magyar PDF
- [ ] Release-note (Obsidian + user-barát verzió)
- [ ] **V1.0 release** → production deploy

---

## 9. Régi offline stack törlése (párhuzamosan M2-M6-tal)

Ahogy a Tauri-app átveszi a szerepet, a régi web-PWA offline-kód **feleslegessé válik**.
A törlés fázisonként:

### M1 végén
- ❌ **Semmi sem törlődik** — a web-app ugyanúgy működik

### M2 végén (SQLCipher működik a desktop-ban)
- ❌ A web-PWA offline (Dexie) **még megmarad**, mert a böngészőben futó userek
  továbbra is használhatják

### M3 végén (sync működik)
- ❌ A web-PWA még mindig megmarad — párhuzamos megoldás

### M5 végén (updater kész)
- **Kommunikáció a lelkészeknek**: "Az új desktop app elérhető, használd azt offline-hoz"
- Még **nem töröljük** a web-PWA-t

### M6.1 közepén (béta-userek átálltak)
- **Törlés fázis** kezdődik, PR-onként:
  - `feat/cleanup-1-dexie-removal`: `lib/offline/db.ts` + Dexie csomagok törlés
  - `feat/cleanup-2-serwist-removal`: `app/sw.ts` + Serwist config törlés
  - `feat/cleanup-3-mutation-queue`: `lib/offline/mutation-queue.ts` + hook törlés
  - `feat/cleanup-4-excel-io`: `lib/offline/excel-*.ts` törlés (Tauri-ba át lehet hozni később)
  - `feat/cleanup-5-standalone`: `lib/standalone/*` + `app/api/standalone/*` törlés
  - `feat/cleanup-6-offline-components`: `components/offline/*` (ami már nem kell) törlés

### M6.2 végén
- A web-app **csak online** — offline-képesség a Tauri-appban
- Dokumentáció átírva: `docs/project-tracking/KARTOTEKA-pwa-offline-first-2026-04-15.md` → `docs/archive/`

**Becsült törlési LOC**: ~3200 sor

---

## 10. Git workflow

- `main` — stabil, production
- `develop` — integráció, csak review-olt PR-ök
- `feat/m{N}-{sub}-{name}` — minden alfázis külön branch
- Minden PR-ben:
  - Description: mit csinál, miért
  - Screenshot, ha UI-változás
  - Test-run eredmény (`npm test`, `npm run tauri build`)
  - Reviewer: self-review (mivel solo-dev), de **checklist** alapján
- Merge után: commit-message convention (Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`)

### 10.1 Self-review checklist (minden PR-hez)
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` 0 error
- [ ] `npm test` zöld (ha írtunk tesztet)
- [ ] Working manual-test a kritikus flow-ra
- [ ] Dokumentáció frissítve (CHANGELOG + ha architektúra-változás, docs)
- [ ] Obsidian jegyzet (ha új fogalom vagy döntés született)

---

## 11. Rollback és biztonsági hálók

### Fázis-szintű rollback

| Fázis | Rollback módszer |
|-------|-----------------|
| M0 | SQL DOWN migrációk + Brevo→Resend visszacserélés (~1 nap) |
| M1 | `apps/desktop/` törlés + monorepo-packages visszacserélés (~2 nap) |
| M2 | Régi `apps/web/` offline-stack még megvan, desktop csak külön kliens (~1 nap) |
| M3 | Sync kikapcsolása (Tauri offline-only mód) (~1 nap) |
| M4 | Dokumentum-feature elrejtése UI-ban (~0.5 nap) |
| M5 | Unsigned build + manuális update (~1 nap) |
| M6 | Béta-userek vissza-webre (~1 nap) |

### Adatvesztés-védelem
- Minden SQL migráció `BEGIN; ... COMMIT;` blokkban
- Supabase: **point-in-time recovery** enabled (Pro tier)
- Tauri-kliens: hetenkénti automatic backup exportálható a user-nek (zip)
- Stronghold: seed-phrase export (24 szó BIP39 — recovery-hez)

### Biztonsági incidens-plan
- Lopott laptop: admin revoke-olja az eszközt → új push-ok rejected
- Elvesztett mester-jelszó: seed-phrase-ből visszaállítható, vagy admin új device-t regisztrál (adatvesztéssel)
- Supabase-incident: pg_dump napi backup (Supabase Pro includes)

---

## 12. Költség-ütemezés (saját idő + szolgáltatás)

| Hó | Szakmai óra (saját) | Új szolgáltatási költség |
|----|--------------------|-----------------------|
| 1 (M0) | ~80h | $0 (Supabase megvan, Brevo ingyen) |
| 2 (M0) | ~80h | $0 |
| 3 (M1) | ~100h | +$15/hó Railway (új web-deploy) |
| 4 (M1) | ~100h | +$15/hó Railway |
| 5-6 (M2) | ~180h | +$15/hó Railway |
| 7-8 (M3) | ~140h | +$15/hó Railway |
| 9 (M4) | ~80h | +$15/hó Railway |
| 10 (M4) | ~80h | +$15/hó Railway |
| 11 (M5) | ~60h | +$100 code-sign cert (egyszeri) |
| 12 (M6) | ~80h | +$15/hó Railway |
| 13-14 (M6) | ~140h | +$15/hó Railway |

**Összesen**:
- Saját munkaidő: ~1120 óra (~14 hó × 80h) — átlag 20h/hét
- Új szolgáltatási költség: **kb. $100 (code-sign) + $180-360 (Railway, 12 hó)** = **$280-460 (~260-430 EUR)**

---

## 13. Mit csinálok MA, ha jóváhagyod

Ha **most jóváhagysz**:

1. **Ma (első ülés, 2-3 óra)**:
   - Branch létrehozás: `feat/m0-1-access-requests`
   - SQL migráció fájl: `migration-docs/sql/2026-04-22-access-requests.sql`
   - TypeScript típusok: `access_requests` DTO

2. **Holnap (második ülés, 2-3 óra)**:
   - `app/(dashboard)/admin/access-requests/page.tsx` — lista-oldal
   - `app/(dashboard)/admin/access-requests/actions.ts` — server actions

3. **Harmadik napon**:
   - `access-request-table.tsx` + `approve-dialog.tsx` komponensek

4. **Első hét végén**:
   - SQL-migráció futtatása Supabase-en (te csinálod)
   - Teszt manualisan
   - PR review

**Nem csinálok MA**: Tauri projektet, SQLCipher-t, semmit ami M1 fázis.

---

## 14. Mit NEM csinálok (hatókörön kívül)

Ebben a tervben **nincs**:
- iOS/Android mobilkliens (másik projekt lenne)
- Oblio (e-Factura) migráció (maradhat ahogy most)
- Missziós Műhely (MM) új funkciók (külön terv)
- Egyházmegyei adminisztrációs új modul
- AI-asszisztens (GPU-szerver) integráció a Tauri-ba (a webes verzióban maradhat)
- A már meglévő 24 modul működésének átdolgozása (UI-scope-on kívül)

---

## 15. Kérdések jóváhagyás előtt

Ha bármi nem világos, ezek a döntési pontok:

1. **Monorepo-ra váltás (M1.1)** — 1 hét a jelenlegi fájlok áthelyezésével. Elfogadod? Vagy inkább külön repo-kban dolgozzunk?
2. **Brevo-átállás (M0.2)** — ezt már most meg tudjuk csinálni (fél nap), vagy várunk a teljes M0-ra?
3. **Code-signing cert típus (M5.1)** — OV ($100/év) vagy EV ($300-700 egyszeri + $200/év)? Az EV jobb SmartScreen-reputation-t ad (nincs "ismeretlen publisher" warning), de drágább.
4. **Béta-gyülekezetek (M6.1)** — te választod, vagy az EREK Elnökséggel?
5. **Timeline**: 14 hó reálistis (20h/hét), de **nyári szünet**, **egyházi szezonok** (karácsony, húsvét) megszakíthatják. Van-e konkrét deadline, amire kész kell legyen az 1.0?

---

## 16. Jóváhagyás után azonnal

Amint válaszolsz "**elfogadom**" vagy hasonló megfogalmazással, elkezdem az M0.1-et:
**access_requests tábla + admin UI**. Ez kb. **1 hét munka** lesz, első konkrét
deliverable. Az eredményről CHANGELOG bejegyzést írok, és megmutatom a PR-diff-et.

**Ha a konkrét kivitelezési terv NEM tetszik** — pontosítsuk, melyik részt hogyan változtassuk.
