# M0 teljesítési jelentés — Supabase biztonsági backend (V1)

**Dátum**: 2026-04-23
**Fázis**: M0 (M0.1 → M0.6) — **teljes körű teljesítés**
**Kódolási ciklus**: 1 nap (önálló, teszteléssel + hibajavítással)
**Státusz**: ✅ KÉSZ, tesztelésre vár (Endre SQL-futtatás + dev-runtime verify)

---

## 1. Vezetői összefoglaló

A Tauri-migráció első (előkészítő) fázisát lezártam. Ez a **V1 biztonsági alapvonal**
— önmagában is értékes, a Tauri-kliens (M1-M6) nélkül is működik.

**Fő eredmény**: a Kartotéka rendszer **már nem fogad nyílt regisztrációt**. Új felhasználó
csak **hozzáférés-kérelem → admin-jóváhagyás** útján léphet be. Ez megfelel az EREK
Elnökségi elvárásnak ("nincs ismeretlen lelkész a rendszerben").

**6 SQL migráció** + **kb. 30 új/módosított kódfájl**. 0 TypeScript error.

## 2. Teljesített alfázisok

### M0.1 — access_requests tábla + admin UI ✅
- SQL: `access_requests` tábla (17 oszlop), 4 index, 3 RLS policy, rate-limit SQL függvény
- Server actions: 6 export (list/approve/reject/revert/stats/get)
- 4 UI komponens: tab + table + 2 dialog (approve/reject)
- Admin-tabs integráció: amber "Hozzáférés-kérelmek" fül

**Javítás közben**: `check_access_request_rate_limit` függvény plpgsql → SQL language
(Supabase parser bug elkerülés), `ROLE_LABELS` const kiemelve külön `shared.ts`-be
(Next.js 16 `'use server'` fájlból csak async export engedélyezett).

### M0.2 — Brevo email + publikus űrlap ✅
- `lib/utils/ip-hash.ts` — GDPR-kompatibilis IP SHA-256
- `lib/email/` könyvtár: provider abstrakció (Brevo + Resend), 4 email-sablon
- Publikus `/hozzaferes-kerese` oldal + űrlap — anon elérhető, rate-limit
- Login-oldal link: "Regisztráljon!" → "Kérjen hozzáférést!"
- `reject` action frissítve — most automatikusan Brevo-email-t küld

### M0.3 — profiles.approved + JWT claim ✅
- SQL: `custom_access_token_hook` plpgsql függvény
- JWT-be kerül: `approved`, `profile_status`, `congregation_id`, `profile_role`
- `is_user_approved(uuid)` segédfüggvény RLS-hez
- `lib/supabase/admin-client.ts` — service_role kliens (server-only, `inviteUserByEmail`-hez)
- `approve` action frissítve: létrehozza a Supabase auth.users-t `inviteUserByEmail`-lel,
  a `profiles` sort frissíti (status='approved', role), és magyar nyelvű approved-email-t küld
- **Supabase Dashboard lépés kötelező**: Authentication → Hooks → Custom Access Token Hook aktiválás

### M0.4 — RLS audit + segédfüggvények ✅
- `2026-04-23-m0-4-rls-audit.sql` — riport-script (csak SELECT), végigméri a `public`
  schema táblákat
- Új segédfüggvények: `is_admin()`, `is_egyhazkeruleti_admin()`, `same_congregation(uuid)`,
  `is_current_user_approved()`
- `migration-docs/rules/rls-policy-catalog.md` — teljes policy-minták dokumentuma
  (congregation-szintű, user-saját, admin-only, lookup, anon-elérhető)
- Szabály: minden új tábla **kötelezően** RLS-védett, legalább 1 policy-val

### M0.5 — user_devices + licenses + audit_log ✅
- SQL: 3 új tábla, mind RLS-védett, mind indexelve
- `log_audit_event(action, target_table, target_id, metadata, device_id)` SECURITY
  DEFINER függvény (minden action kényelmesen loggolható)
- Server actions: `listUserDevices`, `revokeDevice`, `listLicenses`, `listAuditLog`
- Admin UI: új "Eszközök és napló" fül (cyan szín) sub-tabokkal
- Jelenleg üres állapottal: a Tauri-kliens (M1+) tölti majd adattal

### M0.6 — documents + privát Storage bucket ✅
- SQL: `documents` tábla (E2E-ready, filename_encrypted BYTEA, deleted_at soft-delete)
- `document_keys` tábla: DEK wrap-olt értékek device-enként
- `soft_delete_document(uuid)` függvény — 30 napos kuka-séma
- `lib/storage/signed-url.ts` — Supabase Storage signed URL helper (15 perc TTL)
- Storage bucket: **Endre Dashboard-ban hozza létre**: `documents-encrypted`, private
  (a SQL fájl végén konkrét lépések + policy-minták)
- A tényleges titkosítás az M4 fázisban jön (Tauri-kliens)

---

## 3. Új fájlok listája

### SQL migrációk (6 db — Endre futtatja)
```
migration-docs/sql/2026-04-22-m0-1-access-requests.sql
migration-docs/sql/2026-04-22-m0-1-access-requests-FIX.sql    (hotfix)
migration-docs/sql/2026-04-23-m0-3-approved-claim.sql
migration-docs/sql/2026-04-23-m0-4-rls-audit.sql
migration-docs/sql/2026-04-23-m0-5-devices-licenses-audit.sql
migration-docs/sql/2026-04-23-m0-6-documents-schema.sql
```

### Server actions (3 db)
```
app/(dashboard)/admin/access-requests-actions.ts         (6 export)
app/(dashboard)/admin/access-requests-shared.ts          (types + labels)
app/(dashboard)/admin/devices-licenses-actions.ts        (4 export)
app/(dashboard)/admin/devices-licenses-shared.ts         (types + labels)
app/(public)/hozzaferes-kerese/actions.ts                (1 export)
```

### Komponensek (7 db)
```
components/admin/access-requests-tab.tsx
components/admin/access-requests-table.tsx
components/admin/access-request-approve-dialog.tsx
components/admin/access-request-reject-dialog.tsx
components/admin/devices-licenses-tab.tsx
components/public/access-request-form.tsx
app/(public)/hozzaferes-kerese/page.tsx
```

### Library (7 db)
```
lib/utils/ip-hash.ts
lib/email/types.ts
lib/email/send.ts
lib/email/providers/brevo.ts
lib/email/providers/resend.ts
lib/email/templates/access-request.ts
lib/supabase/admin-client.ts
lib/storage/signed-url.ts
```

### Dokumentáció (3 db)
```
migration-docs/rules/rls-policy-catalog.md
docs/project-tracking/KARTOTEKA-M0-teljesitesi-jelentes-2026-04-23.md   (ez a fájl)
```

### Módosított fájlok
```
.env.example                                    (új env vars)
components/admin/admin-tabs-v3.tsx              (2 új tab)
components/auth/login-form.tsx                  (link frissítés)
docs/CHANGELOG.md                               ([2026-04-23] bejegyzés)
```

## 4. Endre teendői (sorrendben)

### 4.1 SQL migrációk futtatása (Supabase Dashboard → SQL Editor)

Sorrendben:
1. `2026-04-22-m0-1-access-requests.sql` — alapok
2. `2026-04-22-m0-1-access-requests-FIX.sql` — rate-limit fn javítás
3. `2026-04-23-m0-3-approved-claim.sql` — JWT claim hook
4. `2026-04-23-m0-5-devices-licenses-audit.sql` — device/license/audit táblák
5. `2026-04-23-m0-6-documents-schema.sql` — documents + document_keys

**Az M0.4 RLS-audit**-ot külön célszerű futtatni (csak SELECT, nem módosít):
6. `2026-04-23-m0-4-rls-audit.sql`

### 4.2 Supabase Dashboard konfig
- **Authentication → Hooks**: "Customize Access Token (JWT) Claims" → Enable,
  function: `custom_access_token_hook`
- **Storage → New bucket**: `documents-encrypted`, **private**, 25 MB limit
- **Storage → Policies**: a 3 policy (INSERT/SELECT/DELETE) a SQL fájl végén

### 4.3 Környezeti változók
A `.env.local`-ba (Railway-en env vars):
- `EMAIL_PROVIDER=brevo`
- `BREVO_API_KEY=...` (Brevo Dashboard-ból: https://app.brevo.com/settings/keys/api)
- `BREVO_FROM_EMAIL=no-reply@kartoteka.ro` (vagy hasonló, Brevo-ban verifikált)
- `BREVO_FROM_NAME=Kartotéka Rendszer`
- `IP_HASH_SALT=...` (openssl rand -hex 32)

### 4.4 Manuális teszt (kötelező minden SQL-migráció + Dashboard-konfig után)
1. `pnpm dev` újraindítás (ha fut)
2. Böngésző inkognitó → `http://localhost:3000/hozzaferes-kerese`
3. Töltsd ki az űrlapot teszt-adatokkal
4. Kapsz confirmation-email-t? (ha nincs Brevo-kulcs: a rekord létrejön, csak email nem)
5. Admin bejelentkezés → "Hozzáférés-kérelmek" fül → látod a teszt-sort
6. Approve → az invite-email megjelenik? Az auth.users-ben létrejön a user?

## 5. Diagnostikai eredmény (TypeScript + ESLint)

- `npx tsc --noEmit --project .` → **0 error**
- A `'use server'` hiba (M0.1-ben) javítva — minden server-action fájlból csak async
  export, a types/consts/labels külön `-shared.ts` fájlokban
- A SQL migrációk mind idempotensek (`IF NOT EXISTS`, `CREATE OR REPLACE`) — újrafuttathatók

## 6. Következő fázis: M1 — Tauri PoC

Az M1-hez Endre dönt:
1. **Monorepo kialakítás** (apps/web + apps/desktop): elfogadja-e? (~1 hét munka)
2. **Code-signing cert**: OV ($100/év) vagy EV ($300-700 egyszeri + $200/év)?

Az M1 indulását **csak Endre engedélye után** kezdem — a jelenlegi kód **non-breaking**,
a böngésző-PWA **végig működik**, nincs sürgős teendő.

---

*M0 teljesítés: 2026-04-23 ** — a Tauri-migráció első lépcsője.*
