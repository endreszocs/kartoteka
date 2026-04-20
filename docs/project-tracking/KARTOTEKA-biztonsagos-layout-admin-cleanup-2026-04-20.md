# KARTOTEKA - Biztonsagos layout es admin cleanup

**Datum:** 2026-04-20  
**Fokusz:** bizonyitottan levallt UI-verziok eltavolitasa kizarolag aktiv utoddal rendelkezo klaszterekbol  
**Kapcsolodo dokumentumok:**  
- `docs/project-tracking/KARTOTEKA-hasznalaton-kivuli-kod-taxonomia-2026-04-20.md`
- `docs/project-tracking/KARTOTEKA-route-es-asset-audit-2026-04-20.md`
- `docs/project-tracking/KARTOTEKA-audit-automation-es-programs-fix-2026-04-20.md`
**Allapot:** 4 kis kockazatu cleanup batch vegrehajtva, build es lint snapshot frissitve

---

## 1. Mi tortent ebben a korben?

Ebben a korben mar nem csak diagnozis tortent, hanem az elso komolyabb, meg mindig szigoru vedoszabalyok menten vegrehajtott repo-tisztitas.

Az alapelv:

- csak olyan fajl torolheto,
- amelynek nincs aktiv importja,
- latszik az aktiv utodja,
- es a torles utan az audit + build azonnal ujrafut.

Negy kis batch ment le:

1. regi layout variansok
2. regi admin orchestrator es placeholder tabok
3. regi admin security tab
4. regi leltar fo-munkafelület es nyomtatasi dialog

---

## 2. Torolt layout fajlok

Eltavolitott fajlok:

- `components/layout/god-mode-banner-v2.tsx`
- `components/layout/header-refined-v2.tsx`
- `components/layout/header-refined.tsx`
- `components/layout/sidebar-adaptive-v2.tsx`
- `components/layout/sidebar-adaptive-v3.tsx`
- `components/layout/sidebar-refined.tsx`

Mi igazolta a torlest?

- a `DashboardShell` aktivan a `HeaderRefinedV3` es `GodModeBannerV3` komponenst hasznalja
- a `DashboardLayoutClient` aktivan a `SidebarAdaptiveV4` komponenst hasznalja
- futokodban nem maradt import a regi variansokra

---

## 3. Torolt admin fajlok

Eltavolitott fajlok:

- `components/admin/admin-tabs-v2.tsx`
- `components/admin/admin-tabs.tsx`
- `components/admin/import-tab.tsx`
- `components/admin/overview-tab.tsx`
- `components/admin/security-settings-tab.tsx`

Mi igazolta a torlest?

- az aktiv admin oldal az `app/(dashboard)/admin/page.tsx` -> `AdminTabsV3` utat hasznalja
- az aktiv alkomponensek:
  - `OverviewTabRefined`
  - `ImportTabRefined`
  - `SecuritySettingsTabV2`
- a regi `import-tab.tsx` sajat szovege szerint is csak fejlesztes alatti placeholder volt

---

## 4. Torolt inventory fajlok

Eltavolitott fajlok:

- `components/inventory/inventory-main-v2.tsx`
- `components/inventory/inventory-print-dialog.tsx`

Mi igazolta a torlest?

- az aktiv leltar route az `app/(dashboard)/leltar/page.tsx` -> `inventory-main-v3` utat hasznalja
- a `inventory-main-v3.tsx` mar az `inventory-print-dialog-v2` komponenst importalja
- futokodban nem maradt import a regi inventory variansokra

---

## 5. Audit eredmeny valtozasa

Cleanup elott:

- arva komponens-jeloltek: `40`

Cleanup utan:

- arva komponens-jeloltek: `28`

Valtozatlanul igaz:

- valos schema-drift: `0`
- arva publikus asset-jelolt: `0`

Ez fontos, mert a torles nem nyitott uj schema-kockazatot, es nem okozott uj asset-higieniai problemat sem.

---

## 6. Verifikacio

Minden batch utan lefutott:

- `npm run audit:safety`
- `npm run build`

Vegallapot:

- a build tobbszor is sikeresen lefutott
- az aktiv route-ok es bundle ujraepultek
- torott import nem maradt a futo kodban

Lint snapshot a cleanup utan:

- `npm run lint` -> `1 error, 67 warnings`
- a blokkoló hiba tovabbra is ugyanaz:
  - `components/presentation/motion-primitives.tsx:145`
  - `react-hooks/set-state-in-effect`

Kovetkeztetes:

- a mostani cleanup **nem rontotta** a lint-helyzetet,
- de a lint oldalon kulon javitasi kor tovabbra is szukseges.

---

## 7. Ami most kovetkezhet a legbiztonsagosabban

A megmaradt 28 jeloltbol a kovetkezo logikus kovetkezo batch:

- `members` regi vonal
  - `components/members/families-tab.tsx`
  - `components/members/member-admin-import-tab.tsx`
  - `components/members/member-tabs-v2.tsx`
  - `components/members/member-tabs-v3.tsx`
  - `components/members/member-tabs.tsx`
  - `components/shared/module-admin-import-tab.tsx`

Miert ez a kovetkezo jo jelolt?

- az aktiv tagnyilvantartas oldal mar `MemberTabsV4`-et hasznal
- a szemely- es csaladresz mar ujabb dialogvonalra van kotve
- ez hasonloan tiszta utodlasi minta, mint a most eltavolitott layout/admin/inventory klasztereknel

---

## 8. Zaro megallapitas

Ez volt az elso olyan cleanup-kor, ahol mar nemcsak a diagnosis, hanem a kontrollalt vegrehajtas is megtortent.

Nem egyszerre "nagytakaritas" tortent, hanem:

- kis batch,
- teljes kontextus,
- azonnali verifikacio,
- dokumentalt eredmeny.

Pont ez a fajta fegyelem kell ahhoz, hogy a Kartoteka tisztuljon, mikozben a rendszer stabilitasaba es biztonsagaba nem ronditunk bele.
