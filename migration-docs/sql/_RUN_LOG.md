# SQL migráció napló — Kartotéka

A `migration-docs/sql/` mappa 197+ SQL fájlt tartalmaz. Ez a napló követi, melyik migráció **futott le** a production Supabase-en, melyik **PENDING** (futtatásra vár), és melyiknek a státusza **ELLENŐRIZENDŐ** (csak Endre tudja).

## Konvenció

```
- [x] YYYY-MM-DD HH:MM — fájlnév.sql
       Megjegyzés (opcionális)

- [ ] fájlnév.sql — PENDING (még nem futott)
       Indok: ...

- [?] fájlnév.sql — ELLENŐRIZENDŐ
       (csak Endre tudja megerősíteni, hogy futott-e)
```

A `[x]` kipipált bejegyzéseknek időbélyeg jár (mikor futott le). A `[ ]` pending bejegyzéseknek **indok** kell (miért nem futott még, mire vár). A `[?]` ellenőrizendő bejegyzéseknek nem kell indok — csak Endre kell hogy futtassa `SELECT * FROM pg_proc WHERE proname = '...'` típusú ellenőrzést.

---

## 🔴 PENDING (futtatásra vár) — 2026-05-17

### Sorrend nem számít (mind független művelet)

- [ ] **`2026-05-15-legacy-cleanup-drop.sql`** — 19× `DROP TABLE IF EXISTS *_ARCHIVE_2026_04_15`. **FUTTATÁS ELŐTT BEGIN/COMMIT KÖRÉ CSOMAGOLNI** (a fájl jelenleg nincs tranzakcióban). Verifikáció: a fájl elején lévő SELECT-tel ellenőrizni a row-számot. Visszavonhatatlan — PITR rollback-tervvel.

- [ ] **`2026-05-17-security-definer-search-path-pin.sql`** — 18× `ALTER FUNCTION ... SET search_path = public, pg_temp` (CVE-2018-1058 mitigation). **BEGIN/COMMIT-ben van, idempotens, biztonságos.** Verifikációs SELECT a végén.

- [ ] **`2026-05-06-egyhfenntartas-import-dup-index.sql`** — `CREATE INDEX IF NOT EXISTS idx_befizetes_egyhf_import_lookup` (5-mezős partial WHERE deleted=false). Idempotens, `CREATE INDEX` self-tx, BEGIN/COMMIT nem szükséges. Biztonságos.

- [ ] **`2026-04-30k-diagnoszt-baptism-szulok.sql`** — diagnosztikai SELECT-ek a keresztelő szülő-load hibakereséséhez. Read-only, séma-érintetlen. Hardcoded `id = 1163`, cserélendő.

- [ ] **`2026-04-30l-backfill-csalad-text-szulokbol.sql`** — DRY-RUN előnézet (1-3. blokk) + élő backfill (4-7. blokk, kommentelt). Az élő UPDATE/INSERT a `/* ... */` blokkban — uncomment szükséges.

---

## 🟢 LEFUTOTT (a kódbázis ezekre épít) — 2026-04-08 — 2026-05-06

A 2026-04-08 és 2026-05-06 közötti migrációk feltehetően mind lefutottak — a Kartotéka kódbázisa épít rájuk (lásd `apps/web/app/(dashboard)/**/actions.ts` import-ok, RPC-hivatkozások, table-referenciák, RLS-policy-k). A pontos időbélyeg-listához a Supabase Studio `supabase_migrations.schema_migrations` táblát kell lekérdezni, vagy Endre memóriáját.

Tipikus chronologia (csoportosítva fő-csomagok szerint):

### 2026-04-09 — Alapok (3 fájl)
- [?] `2026-04-09-extension-table-policies.sql`
- [?] `2026-04-09-god-mode-and-congregation-finance.sql`
- [?] `2026-04-09-profile-and-congregation-extensions.sql`

### 2026-04-12 — Phase 0 RLS hardening + új modulok (10 fájl)
- [?] `2026-04-12-budget-modifications.sql`
- [?] `2026-04-12-document-submissions.sql`
- [?] `2026-04-12-jegyzokonyv-restructure.sql`
- [?] `2026-04-12-missziós-muhely-rls.sql`
- [?] `2026-04-12-phase-0-rls-hardening.sql`
- [?] `2026-04-12-presbiteri-jegyzokonyvek.sql`
- [?] `2026-04-12-public-magazines.sql`
- [?] `2026-04-12-public-site-stats.sql`
- [?] `2026-04-12-public-site-tables.sql`
- [?] `2026-04-12-storage-buckets.sql`
- [?] `2026-04-12-support-tickets.sql`

### 2026-04-13 — RLS finomítás (5 fájl)
- [?] `2026-04-13-rls-ALL-FIXED.sql`
- [?] `2026-04-13-rls-congregation-tables.sql`
- [?] `2026-04-13-rls-hybrid-admin-tables.sql`
- [?] `2026-04-13-rls-mm-misc-tables.sql`
- [?] `2026-04-13-rls-reference-tables.sql`

### 2026-04-15 — Annual reports, MM RLS fix, standalone licenses
- [?] `2026-04-15-annual-reports-extension.sql`
- [?] `2026-04-15-mm-rls-fix.sql`
- [?] `2026-04-15-mm-rls-fix-part2.sql`
- [?] `2026-04-15-remove-default-god-mode-pin.sql`
- [?] `2026-04-15-standalone-licenses.sql`

### 2026-04-21 — M6 RLS audit + DIAG-only (1 fájl)
- [?] `2026-04-21-m6-2-rls-audit-full.sql` (AUDIT-only — SELECT-ek, semmilyen DDL)

### 2026-04-23 — M0 hotfixes (3 fájl)
- [?] `2026-04-23-m0-DIAGNOSTIC.sql`
- [?] `2026-04-23-m0-HOTFIX-grants.sql`
- [?] `2026-04-23-m0-REPAIR-idempotent.sql`
- [?] `2026-04-23-m0-5-devices-licenses-audit.sql`

### 2026-04-24 — M7 sorszámok + admin wipe (2 fájl)
- [?] `2026-04-24-a-m7-2d1-reserve-chitanta-numbers.sql`
- [?] `2026-04-24-admin-wipe-congregation-data.sql`

### 2026-04-25 — M0.5 + M7 iratszám pointers (2 fájl)
- [?] `2026-04-25-m0-5-audit-log-view.sql`
- [?] `2026-04-25-a-m7-9a-iratszam-pointers.sql`

### 2026-04-26 — Family-link inference RPC (1 fájl)
- [?] `2026-04-26-family-link-inference-rpc.sql`

### 2026-04-30 — Tag-validáció diagnoszt + backfill (2 fájl)
- [?] `2026-04-30k-diagnoszt-baptism-szulok.sql` (lásd PENDING fent)
- [?] `2026-04-30l-backfill-csalad-text-szulokbol.sql` (lásd PENDING fent)

### 2026-05-02 — Finance import RPC + access-requests + user-trigger (10+ fájl)
- [?] `2026-05-02-diagnose-users-visibility.sql`
- [?] `2026-05-02-finance-dup-lookup-indexes.sql`
- [?] `2026-05-02-finance-import-rpc.sql`
- [?] `2026-05-02-fix-access-requests-COMPLETE.sql`
- [?] `2026-05-02-fix-access-requests-anon-insert.sql`
- [?] `2026-05-02-handle-new-user-trigger.sql`
- [?] `2026-05-02-member-validation-errors.sql`
- [?] `2026-05-02-profiles-approved-to-active.sql`
- [?] `2026-05-02-rls-fix-merge-v7-result.sql`

### 2026-05-03 — Finance kódok (4 fájl)
- [?] `2026-05-03-finance-300-01-INSTALL.sql`
- [?] `2026-05-03-finance-belso-mozgas-INSTALL.sql`
- [?] `2026-05-03-finance-belso-mozgas-celok.sql`
- [?] `2026-05-03-finance-import-rpc-v2.sql`

### 2026-05-04 — Admin RPC-k + onboarding (13 fájl)
- [?] `2026-05-04-admin-user-status-rpc.sql`
- [?] `2026-05-04b-grant-service-role-profiles.sql`
- [?] `2026-05-04c-profile-congregations-rpc.sql`
- [?] `2026-05-04d-ertesitesek-read-at-archived.sql`
- [?] `2026-05-04e-system-broadcasts-allow-resend.sql`
- [?] `2026-05-04f-complete-user-onboarding-rpc.sql`
- [?] `2026-05-04g-pending-wizard-diagnosis.sql`
- [?] `2026-05-04h-beke-tivadar-diagnosis.sql`
- [?] `2026-05-04i-restart-user-onboarding-rpc.sql`
- [?] `2026-05-04j-complete-onboarding-fix-ambiguous.sql`
- [?] `2026-05-04k-restart-onboarding-fix-ambiguous.sql`
- [?] `2026-05-04l-chitanta-tombok-rls-fix.sql`
- [?] `2026-05-04m-create-teszt-congregation.sql`

### 2026-05-05 — Pastor service history (1 fájl)
- [?] `2026-05-05-pastor-service-history-tartozas-mod.sql`

---

## Nem érintett SQL fájlok (197+ a többi)

A fenti chronologia nem teljes — a `migration-docs/sql/` mappa 197 fájlt tartalmaz, és a 2026-04-08 előtti (M0, M1, M2, M3, M4, M5 sprintek) migrációk százainak száma. Ezek mind lefutottak (mert a fő séma — `congregations`, `profiles`, `szemely`, `csalad`, `befizetes`, `kiadas`, `chitanta_*`, `befizetescel`, `kiadascel`, `szamadasicel`, `iratszam_*`, `audit_log` stb. — már létezik a productionben).

A teljes lista lekérése Supabase Studio-ban:
```sql
SELECT version, name, executed_at FROM supabase_migrations.schema_migrations ORDER BY version;
```

---

## Hibajavítások (drop, restore)

Eddig nem volt katasztrofális PITR-rollback. Ha jövőben szükség lesz, ide jegyezzük:

| Időpont | Művelet | Indok | Eredmény |
|---|---|---|---|
| (üres) | | | |

---

## Hivatkozások

- **DIAGNOSTICS P2-9 + P2-10**: a _RUN_LOG.md hiánya és pending SQL-ek
- **DIAGNOSTICS P2-11**: SECURITY DEFINER search_path → `2026-05-17-security-definer-search-path-pin.sql`
- **DIAGNOSTICS P2-12**: a RPC-installer migrációk BEGIN/COMMIT csomagolása — új migrációknál betartani
