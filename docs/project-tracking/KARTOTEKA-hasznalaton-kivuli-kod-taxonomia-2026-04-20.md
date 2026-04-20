# KARTOTEKA - Hasznalaton kivuli kod taxonomia es no-touch zonak

**Datum:** 2026-04-20  
**Fokusz:** a runtime szempontjabol nem hasznalt kod valodi kategoriainak szetvalasztasa a szandekosan megtartott, illetve tiltottan torlendo allomanyoktol  
**Kapcsolodo dokumentumok:**  
- `docs/project-tracking/KARTOTEKA-repo-higienia-diagnosztika-2026-04-20.md`
- `docs/project-tracking/KARTOTEKA-schema-drift-es-arva-komponens-audit-2026-04-20.md`
- `docs/project-tracking/KARTOTEKA-route-es-asset-audit-2026-04-20.md`
- `docs/project-tracking/KARTOTEKA-audit-automation-es-programs-fix-2026-04-20.md`
**Allapot:** tovabbi tisztazas megtortent, tomeges torles tovabbra sem javasolt felugyelet nelkul

---

## 1. Mi tortent ebben a korben?

A korabbi audit utan a fo kerdes mar nem az volt, hogy van-e valos schema-drift, hanem az, hogy a megmaradt "arva" jeloltek kozul:

- melyik tenylegesen runtime-mentes, levallt kod,
- melyik csak szandekosan megtartott tooling vagy csomagolasi anyag,
- es melyik olyan dormant vagy kompatibilitasi reteg, amit nem szabad reflexbol torolni.

Ennek erdekeben ebben a korben negy dolgot ellenoriztem:

1. ujrafuttattam a `npm run audit:safety` parancsot;
2. klasztereztem a 40 arva komponens-jeloltet;
3. route- es komponensszinten visszaellenoriztem az aktiv utodokat;
4. kulon atneztem a `standalone-build/`, `scripts/`, `public/downloads/` es `icon/` agakat.

---

## 2. Jelenlegi biztos allapot

Az aktualis audit osszegzes:

- schema tablakh: `107`
- Supabase `.from()` hivatkozasok: `1578`
- futo kodban hianyzo tablahivatkozas: `0`
- legacy/source-links hamis pozitiv: `2`
- arva komponens-jelolt: `40`
- arva publikus asset-jelolt: `0`

Ez azt jelenti, hogy a valos schema-drift oldal jelenleg tiszta, a tovabbi munka mar foleg repo-higienia es kod-eletciklus kerdes.

---

## 3. No-touch zonak

Az alabbi allomanyok es mappak jelenleg **nem minosulnek folosleges maradeknak**, tehat torlesuk nem javasolt:

### 3.1. Framework specialis fajlok

- `app/favicon.ico`
- `app/icon.png`
- `app/robots.ts`
- `app/sitemap.ts`

Ezeket a Next kulon file convention alapjan kezeli, tehat import nelkul is aktiv szerepuk van.

### 3.2. Standalone csomagolasi ag

- `standalone-build/build-portable.ps1`
- `standalone-build/installer.iss`
- `standalone-build/installer-resources/**`

Ez az ag nem arva:

- a `next.config.ts` tartalmazza az `output: 'standalone'` beallitast,
- a `package.json` tartalmazza a `build:portable` scriptet,
- a dokumentacioban kulon standalone/offline csomagolasi terv tartozik hozza.

Kovetkeztetes:

- a `standalone-build/` jelenleg **szandekos csomagolasi infrastruktura**, nem torlendo maradek.

### 3.3. Publikus letoltesi fajlok

- `public/downloads/README.md`
- `public/downloads/install-resend.bat`

Ezek korabban gyanusnak tuntek, de mar ellenorizve lett, hogy az offline fejlesztoi felulet tenylegesen hasznalja oket.

### 3.4. Script ag

- `scripts/audit-safety.mjs`
- `scripts/build-adr-seed.mjs`

Ezek kozul:

- az `audit-safety.mjs` az aktualis diagnosztika resze,
- a `build-adr-seed.mjs` nem runtime kod, hanem dokumentalt adateloallitasi/generator script.

Kovetkeztetes:

- a `scripts/` mappa jelen allapotban **nem szemetscript-gyujto**, hanem celzott karbantartasi es build-tooling ag.

### 3.5. Ikon forrasanyagok

- `icon/**`

A runtime jelenleg a `public/EREK.png` es `public/kartoteka-icon.png` fajlokat hasznalja. Az `icon/` mappa ettol meg nem feltetlen torlendo, mert sokkal inkabb forras- vagy munkaanyag-tarolo szerepet mutat. Ezt csak kulon design-asset dontessel szabad majd tisztitani.

---

## 4. Runtime szempontbol levallt, aktiv utoddal rendelkezo klaszterek

Itt azok a jeloltek szerepelnek, ahol a futo rendszerben mar lathato az ujabb aktiv utod.

### 4.1. Admin klaszter

Jeloltek:

- `components/admin/admin-tabs-v2.tsx`
- `components/admin/admin-tabs.tsx`
- `components/admin/import-tab.tsx`
- `components/admin/overview-tab.tsx`

Aktiv utodok:

- `app/(dashboard)/admin/page.tsx` -> `AdminTabsV3`
- ugyanabban a konyvtarban: `import-tab-refined.tsx`
- ugyanabban a konyvtarban: `overview-tab-refined.tsx`

Megallapitas:

- ez eros valoszinuseggel levallt admin-UI vonal.

### 4.2. Layout klaszter

Jeloltek:

- `components/layout/god-mode-banner-v2.tsx`
- `components/layout/header-refined-v2.tsx`
- `components/layout/header-refined.tsx`
- `components/layout/sidebar-adaptive-v2.tsx`
- `components/layout/sidebar-adaptive-v3.tsx`
- `components/layout/sidebar-refined.tsx`

Aktiv utodok:

- `components/layout/dashboard-shell.tsx` -> `HeaderRefinedV3`
- `components/layout/dashboard-shell.tsx` -> `GodModeBannerV3`
- `components/layout/dashboard-layout-client.tsx` -> `SidebarAdaptiveV4`

Megallapitas:

- ez egy klasszikus UI-verziovaltasi klaszter, ahol az ujabb fejlec/sidebar/banner vonal mar atvette a runtime szerepet.

### 4.3. Tagnyilvantartasi klaszter

Jeloltek:

- `components/members/families-tab.tsx`
- `components/members/member-admin-import-tab.tsx`
- `components/members/member-tabs-v2.tsx`
- `components/members/member-tabs-v3.tsx`
- `components/members/member-tabs.tsx`
- `components/modals/family-details-dialog.tsx`
- `components/modals/member-details-dialog-refined.tsx`
- `components/modals/member-details-dialog.tsx`
- `components/shared/module-admin-import-tab.tsx`

Aktiv utodok:

- `app/(dashboard)/tagnyilvantartas/page.tsx` -> `MemberTabsV4`
- `components/members/persons-tab.tsx` -> `MemberDetailsDialogV2`
- `components/members/persons-tab.tsx` es `components/members/families-tab-v2.tsx` -> `FamilyDetailsDialogRefined`
- `app/(dashboard)/tagnyilvantartas/page.tsx` -> `ModuleAdminWorkspace`

Megallapitas:

- itt nem pusztan elszigetelt fajlokrol, hanem egy egesz regebbi tagnyilvantartasi szerkesztesi vonalrol van szo.

### 4.4. Penzugyi klaszter

Jeloltek:

- `components/finance/accounting-tab.tsx`
- `components/finance/debt-tab.tsx`
- `components/finance/monetary-tab.tsx`
- `components/modals/expense-dialog.tsx`
- `components/modals/income-dialog-v2.tsx`
- `components/modals/income-dialog.tsx`
- `components/modals/congregation-dialog.tsx`
- `components/modals/god-mode-dialog-v2.tsx`
- `components/modals/god-mode-dialog-v3.tsx`
- `components/modals/god-mode-dialog-v4.tsx`
- `components/modals/god-mode-dialog.tsx`

Aktiv utodok:

- `components/finance/finance-tabs.tsx` -> `AccountingTabV2`
- `components/finance/finance-tabs.tsx` -> `DebtTabV2`
- `components/finance/finance-tabs.tsx` -> `MonetaryTabV2`
- `components/finance/finance-tabs.tsx` -> `IncomeDialog` a `income-dialog-v3` fajlbol
- `components/finance/finance-tabs.tsx` -> `ExpenseDialogV2`
- `components/layout/dashboard-shell.tsx` -> `CongregationDialogV2`
- `components/layout/dashboard-shell.tsx` -> `GodModeDialogV5`

Tovabbi fontos megfigyeles:

- a `components/finance/finance-tabs.tsx` explicit kommentje szerint a korabbi `InternalTransferDialog` mar el lett tavolitva, es a flow ma a `DecontDialog` + bank/kassza ful logikaval megy tovabb.

Megallapitas:

- ez a klaszter szinte teljes egeszeben levallt penzugyi UI generacio.

### 4.5. Leltar klaszter

Jeloltek:

- `components/inventory/inventory-main-v2.tsx`
- `components/inventory/inventory-print-dialog.tsx`

Aktiv utodok:

- `app/(dashboard)/leltar/page.tsx` -> `InventoryMain` a `inventory-main-v3` fajlbol
- a `inventory-main-v3.tsx` az `inventory-print-dialog-v2` valtozatot hasznalja

Megallapitas:

- a leltar regi fo-munkafelulete es regi nyomtatasi dialogja jelenleg nem aktiv.

---

## 5. Runtime-ban inaktiv, de fokozott ovatossagot igenylo jeloltek

Ezeknel a fajloknal az importgraf szerint nincs aktiv runtime-behuzas, de a projekt tudasvagyonaban, terveiben vagy kommentjeiben meg mindig latszik szerepuk.

### 5.1. Dokumentalt, de jelenleg nem aktiv penzugyi elemek

- `components/finance/audit-tab.tsx`
- `components/finance/erek-finance-guide-tab.tsx`
- `components/modals/chitanta-issue-dialog.tsx`
- `components/modals/chitanta-reprint-dialog.tsx`
- `components/modals/fx-revaluation-dialog.tsx`
- `components/modals/internal-transfer-dialog.tsx`

Miert ovatos a besorolas?

- tobbet kozuluk a `migration-docs/` es a projektlogok tovabbra is nevesitenek,
- egy reszuk korabbi roadmap, audit vagy szakmai workflow lenyomata,
- a `fx-revaluation-dialog.tsx` es az `internal-transfer-dialog.tsx` korul kommentelt kompatibilitasi es konyvelesi atalakitas is latszik.

Kovetkeztetes:

- runtime szempontbol ma nem aktiv jeloltek,
- de **nem ajanlott oket azonnali hulladekkent kezelni**;
- elobb kulon termek- es penzugyi dontes kell rola, hogy archiv vagy vegleges kivezetes legyen-e a sorsuk.

### 5.2. Misszios muhely kompatibilitasi hej

- `components/missions/mission-workshop-v2.tsx`

Kulon megfigyeles:

- a fajl vegen a `MissionWorkshopV3` ujraexportja latszik,
- vagyis ez nem tiszta onallo funkcionalis komponens, inkabb egy kompatibilitasi hej jelolt,
- jelen korben nem talaltam aktiv route importot a mission-workshop vonalra.

Kovetkeztetes:

- nem aktiv runtime-fuggoseg,
- de a hej-jelleg miatt ovatosabban kezelendo, mint egy sima elhagyott UI maradvany.

---

## 6. Praktikus torlesi strategia - mit jelent ez a gyakorlatban?

Jelen allapotban a legbiztonsagosabb megkozelites:

1. **ne egyszerre toroljuk a 40 fajlt;**
2. klaszterenkent haladjunk;
3. minden klaszter utan fusson:
   - `npm run audit:safety`
   - `npm run build`
4. csak olyan klaszter menjen elso torlesi korbe, ahol:
   - van igazolt aktiv utod,
   - nincs dokumentalt kompatibilitasi megjegyzes,
   - nincs nyitott uzleti dontesi kerdes.

### Javasolt legbiztonsagosabb torlesi sorrend

**Elsonek jo jeloltek lehetnek:**

- layout regi verziok (`header-refined-v2`, `header-refined`, `sidebar-adaptive-v2`, `sidebar-adaptive-v3`, `sidebar-refined`, `god-mode-banner-v2`)
- admin regi verziok (`admin-tabs-v2`, `admin-tabs`, `import-tab`, `overview-tab`)
- leltar regi verziok (`inventory-main-v2`, `inventory-print-dialog`)

**Masodik korben johetnek:**

- tagnyilvantartas regi tab-vonalai
- penzugyi regi v2/v3 elotti modalok es tabok

**Kulon vezetoi donteshez kotendo:**

- `audit-tab.tsx`
- `erek-finance-guide-tab.tsx`
- `fx-revaluation-dialog.tsx`
- `internal-transfer-dialog.tsx`
- `chitanta-*` dialogok
- `mission-workshop-v2.tsx`

---

## 7. Zaro megallapitas

Ebben a korben nem az derult ki, hogy "minden arva torolheto", hanem az, hogy a rendszerben mar tisztan kulonvalaszthato:

- az aktiven hasznalt, megorizendo infrastruktura,
- a levallt UI-generaciok,
- es a dormant, de meg dokumentalt vagy kompatibilitasi jellegu elemek.

Ez biztonsagi szempontbol kulcsfontossagu, mert innentol a repo-tisztitas nem megerzesre, hanem **kategoriakra es bizonyitekra** epulhet.
