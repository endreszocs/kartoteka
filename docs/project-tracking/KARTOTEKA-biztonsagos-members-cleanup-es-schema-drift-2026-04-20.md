# KARTOTEKA - Biztonsagos members cleanup es schema drift

**Datum:** 2026-04-20  
**Fokusz:** tagnyilvantartas legacy komponensek biztonsagos eltavolitasa, plusz frissen feljott schema-snapshot drift dokumentalasa  
**Allapot:** vegrehajtva, build-validalva, audit-validalva

---

## 1. Mi tortent ebben a korben?

Ebben a korben a tagnyilvantartas regi, mar nem hasznalt komponensagait tisztitottuk ki. A torles minden esetben csak akkor tortent meg, amikor:

- az aktiv route egyertelmuen latszott,
- az aktiv utodkomponens latszott,
- a teljes repo-szintu kereses nem mutatott elo runtime-importot,
- a torles utan az `npm run audit:safety` es az `npm run build` is ujrafutott.

Kulon fontos eredmeny, hogy a tisztitas utan az audit uj, valos schema-drift jelzest adott. Ez nem a takaritas mellekhatasa, hanem azt mutatja, hogy a kod mar uj tablakat hasznal, mikozben a `migration-docs/Database_schema.sql` snapshot ezt meg nem tartalmazza.

---

## 2. Torolt fajlok

Eltavolitott legacy fajlok:

- `components/members/families-tab.tsx`
- `components/members/member-admin-import-tab.tsx`
- `components/members/member-admin-import-tab-v2.tsx`
- `components/members/member-tabs.tsx`
- `components/members/member-tabs-v2.tsx`
- `components/members/member-tabs-v3.tsx`
- `components/shared/module-admin-import-tab.tsx`

---

## 3. Mi igazolta a torlest?

Aktiv futasi lanc:

- `app/(dashboard)/tagnyilvantartas/page.tsx` -> `MemberTabsV4`
- ugyanott a privilegizalt importfelulet -> `ModuleAdminWorkspace`
- `components/shared/module-admin-workspace.tsx` -> `ModuleAdminImportTabV2`
- `components/members/member-tabs-v4.tsx` -> `families-tab-v2`, `overview-tab`, `persons-tab`, `presbyters-tab`, `districts-tab`, `voters-tab`

Mit mutatott a repo-szintu ellenorzes:

- a torolt fajlokra nem maradt aktiv app/components import
- a maradek hivatkozasok dokumentacios vagy torteneti jegyzetekben voltak
- a `member-admin-import-tab-v2.tsx` mar csak a torolt V2/V3 tagnyilvantartas-tabokhoz kellett, a jelenlegi rendszer mar kozvetlenul a kozos `ModuleAdminImportTabV2` komponenst hasznalja

---

## 4. Verifikacio

### 4.1 Audit

`npm run audit:safety`

Eredmeny a kor vegen:

- schema tablakszam: `107`
- `.from()` hivatkozasok: `1595`
- runtime hianyzo tablahivatkozasok: `6`
- legacy/source-links hamis pozitiv: `2`
- arva komponens-jeloltek: `22`
- arva public asset-jeloltek: `0`

Tisztulasi mertek ebben a members-korben:

- arva komponens-jeloltek: `28 -> 22`

### 4.2 Build

`npm run build`

Eredmeny:

- a production build sikeresen lefutott a torles utan
- a `tagnyilvantartas` route tovabbra is epul
- nem jelent meg import-hiba vagy hianyzo komponens-hiba

Megmaradt framework-warning:

- `middleware` file convention deprecated -> kesobb `proxy`-ra kell atvezetni

### 4.3 Lint snapshot

`npm run lint`

Aktualis allapot:

- `3 error`
- `68 warning`

Ez a kor nem a lint-javitasrol szolt, de a snapshotot rogzitjuk, hogy a kovetkezo javitasi koroknek biztos alapja legyen.

Aktualis blokkolo hibak:

- `components/presentation/motion-primitives.tsx:145` -> `react-hooks/set-state-in-effect`
- `components/admin/access-request-approve-dialog.tsx:111` -> `react/no-unescaped-entities`
- `components/admin/access-requests-table.tsx:125` -> `react/no-unescaped-entities`

---

## 5. Uj, fontos megfigyeles: schema snapshot drift

Az audit most mar nemcsak legacy maradvanyokat, hanem valos schema-driftet is jelez:

- `access_requests`
- `user_devices`
- `licenses`
- `audit_log`
- `documents`

Erintett kodhelyek:

- `app/(dashboard)/admin/access-requests-actions.ts`
- `app/(public)/hozzaferes-kerese/actions.ts`
- `app/(dashboard)/admin/devices-licenses-actions.ts`
- `lib/storage/signed-url.ts`

Mit mutat a repo:

- ezekre a tablaka a kod mar aktivan hivatkozik
- a repo-ban mar vannak olyan SQL fajlok, amelyek letrehozzak ezeket a tablakat
- a `migration-docs/Database_schema.sql` jelenlegi snapshotja viszont ezeket meg nem tartalmazza

Fontos kovetkeztetes:

- ez jelenleg **nem bizonyitja**, hogy a live adatbazisban hianyoznak a tablak
- azt bizonyitja, hogy a **kod** es a **helyi schema-pillanatkep** mar nincs teljes szinkronban
- a kovetkezo biztonsagos lepes nem torles, hanem a schema-snapshot frissitesi folyamat tisztazasa

Kulonosen eros jelzesek:

- `migration-docs/sql/2026-04-23-m0-REPAIR-idempotent.sql`
- `migration-docs/sql/2026-04-23-m0-5-devices-licenses-audit.sql`
- `migration-docs/sql/2026-04-23-m0-6-documents-schema.sql`

Ezek a repo-ban mar letezo SQL-fajlok egyertelmuen mutatjak, hogy az uj tablakat a csapat mar tervezi vagy mar be is vezette a migracios vonalon, csak a nagy snapshot nincs utanuk huzva.

---

## 6. Dokumentacios drift

Tobb torteneti vagy architektura-jegyzet meg emliti a most torolt fajlneveket, peldaul:

- `migration-docs/modules/member-registry-architecture.md`
- `migration-docs/todo/phase-3-member-registry.md`
- `migration-docs/validation/member-registry-validation.md`

Ezeket most **nem** irtam at automatikusan, mert egy reszuk torteneti allapotot rogzit. Karbantartasi szempontbol viszont mar erdemes oket "historical reference only" szemlelettel kezelni, amig el nem valik:

- melyik dokumentum torteneti naplo,
- melyiknek kell a jelenlegi allapotot tukroznie.

---

## 7. Kovetkezo legbiztonsagosabb celpontok

A mostani audit alapjan a kovetkezo korben ezek lehetnek jo jeloltek, de csak ugyanilyen szigoru validalas utan:

- `components/dashboard/hero-banner-refined.tsx`
- a regi finance-tab variansok egy csoportja:
  - `components/finance/accounting-tab.tsx`
  - `components/finance/audit-tab.tsx`
  - `components/finance/debt-tab.tsx`
  - `components/finance/erek-finance-guide-tab.tsx`
  - `components/finance/monetary-tab.tsx`
- regi modal-variansok, ha van bizonyitott aktiv utodjuk

Azonnali torlesre ezek kozul egyiket sem jeloljuk ki automatikusan.

---

## 8. Vegso allapot ebben a korben

- 7 tovabbi, bizonyitottan levallt `members`/import legacy fajl eltavolitva
- `npm run build` sikeres
- `npm run audit:safety` sikeres
- arva komponens-jeloltek: `28 -> 22`
- uj, kulon kezelesre varo schema-snapshot drift dokumentalva

