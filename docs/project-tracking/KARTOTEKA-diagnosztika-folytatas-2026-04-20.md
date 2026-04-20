# KARTOTEKA - Diagnosztika folytatása

**Dátum:** 2026-04-20  
**Fókusz:** dokumentációs sodródás, részleges funkciók, framework-adósság, dependency-higiénia  
**Kapcsolódó dokumentum:** `docs/project-tracking/KARTOTEKA-repo-higienia-diagnosztika-2026-04-20.md`  
**Állapot:** elemzés kész, kódmódosítás és törlés NEM történt

---

## 1. Vezetői összefoglaló

A második diagnosztikai körben az derült ki, hogy a rendszer egyik legnagyobb kockázata jelenleg **nem csak a holt kód**, hanem a **holt állítás**.

Ez három formában látszik:

1. **Régi auditok és projektlog-bejegyzések ma már nem mindenhol igazak.**
2. **A felületen van néhány ténylegesen részleges vagy “hamarosan” állapotú funkció.**
3. **A framework- és lint-adósság egy része már a jelenlegi fejlesztői képet is torzítja.**

A legfontosabb korrekció:

- a felsőbb szintű dashboardok (`/dashboard-egyhazmegye`, `/dashboard-kerulet`) **nem placeholder oldalak** a jelenlegi kódban;
- a README **nem** alap Next.js sablon már;
- a teljes-repós lint **nem tiszta**, hiába szerepel több helyen a dokumentációban `0 error, 0 warning`.

Ez azt jelenti, hogy a további szisztematikus javítás előtt **a diagnosztikai dokumentációt is konszolidálni kell**, különben maga a tudásbázis fog félrevezetni.

---

## 2. Módszertan

Ebben a körben az alábbiakat ellenőriztem:

- élő route-ok és oldalak kézi beolvasása
- régi diagnosztikai dokumentumok és projektlog-állítások összevetése a jelenlegi kóddal
- felhasználó által látható “hamarosan”, “fejlesztés alatt”, “nem elérhető” állapotok keresése
- dependency-használat statikus vizsgálata, majd a gyanús csomagok kézi validálása
- friss `npm run lint` futtatás a jelenlegi állapot ellenőrzésére

Friss verifikáció:

- `npm run lint` -> **1 error, 72 warning**

---

## 3. Dokumentációs sodródás

### 3.1. Felsőbb dashboardok - a régi placeholder-állítás elavult

Régi állítások:

- `docs/project-tracking/KARTOTEKA-diagnosztikai-dokumentum-2026-04-07.md`
  - a `dashboard-egyhazmegye` és `dashboard-kerulet` oldalakat placeholderként említi
- `docs/project-tracking/KARTOTEKA-project-log.md`
  - korai szakaszban ugyanígy placeholderként hivatkozik rájuk

Ezzel szemben a jelenlegi kód és a frissebb dokumentumok alapján:

- `app/(dashboard)/dashboard-egyhazmegye/page.tsx` élő, adatot töltő oldal
- `app/(dashboard)/dashboard-kerulet/page.tsx` élő, adatot töltő oldal
- `docs/project-tracking/KARTOTEKA-b4-dashboard-bovites-2026-04-15.md` kifejezetten rögzíti, hogy a korábbi placeholder-megjegyzés elavult

Diagnózis:

- itt nem termékhiba, hanem **dokumentációs időeltolódás** van
- minden további auditnál a frissebb, 2026-04-15 utáni forrásokat kell elsődlegesnek tekinteni

### 3.2. README állapot - a régi audit itt is elavult

Régi projektlog-állítás:

- `docs/project-tracking/KARTOTEKA-project-log.md` szerint a fő `README.md` még alap Next.js sablon

Jelenlegi állapot:

- a `README.md` már kifejezetten a KARTOTEKA termékről szól
- tartalmaz:
  - termékcélokat
  - stack-leírást
  - `.env.example` alapú indítást
  - fő projektfájlokat
  - jelenlegi fókuszt

Diagnózis:

- a README korábbi hiányossága **már részben rendezve lett**
- ezt a régi auditok még nem követték le

### 3.3. Lint-tisztaság - a dokumentáció és a valós repoállapot eltér

Több dokumentum és changelog-bejegyzés állít `0 error, 0 warning` állapotot.

A jelenlegi teljes-repós futtatás eredménye:

- `npm run lint` -> **1 error, 72 warning**

Következtetés:

- a lokális, célzott fájlkörös lint sok helyen lehetett tiszta,
- de ebből **nem következik**, hogy a teljes repó is tiszta

Ez fontos, mert a dokumentáció jelenlegi formájában könnyen azt a benyomást kelti, mintha a lint-konszolidáció már lezárult volna.

---

## 4. Ténylegesen részleges vagy “hamarosan” állapotú funkciók

### 4.1. Apple bejelentkezés - látható, de nem implementált

Fájl:

- `components/auth/oauth-buttons.tsx`

Jelenlegi viselkedés:

- a Google OAuth működő hívást indít
- az Apple gomb csak `toast.info(...)` üzenetet ad:
  - “Az Apple bejelentkezés hamarosan elérhető lesz...”

Diagnózis:

- ez **valós felhasználói részleges funkció**
- a gomb jelen van a login és register felületen, tehát ez nem belső TODO, hanem látható hiány

### 4.2. Beállítások - nyelv és globális kijelentkeztetés részleges

Fájl:

- `components/modals/settings-dialog.tsx`

Jelenlegi állapot:

- a nyelv fül kommentje szerint a román UI “jelenleg placeholder”
- a “Română” opció leírása: “hamarosan”
- a “Kijelentkezés minden eszközön” gomb csak toastot dob:
  - “Ez a funkció hamarosan elérhető lesz.”
- a user beállítások jelenleg localStorage-ben élnek, nem perzisztens szerveroldali preferenciában

Diagnózis:

- ez **nem hiba**, hanem részleges funkcionalitás
- ugyanakkor biztonsági és UX oldalról fontos, mert a “minden eszközről kijelentkeztetés” érzékeny funkció

### 4.3. Egyházmegyei pénzügy - leltár-integrált műveletek részlegesen tiltva

Fájl:

- `app/(dashboard)/penzugy/actions.ts`

Jelenlegi állapot:

- egyházmegyei módban a leltár-integrált bevétel és kiadás külön hibával vissza van utasítva:
  - “jelenleg nem elérhető”

Diagnózis:

- ez **kifejezetten üzleti szabály / részleges implementáció**
- nem szabad bugként kezelni, de a felsőbb szintű scope-ok funkcionális lefedettségéről szóló auditba be kell emelni

### 4.4. Admin import - a régi és az élő felület egyszerre létezik

Fájlok:

- régi: `components/admin/import-tab.tsx`
- élő: `components/admin/import-tab-refined.tsx`
- aktív belépési pont: `components/admin/admin-tabs-v3.tsx`
- közös importmotor: `components/shared/module-admin-import-tab-v2.tsx`
- közös multi-sheet UI: `components/shared/multi-sheet-import.tsx`

Diagnózis:

- a régi `import-tab.tsx` még mindig azt mondja, hogy az import fejlesztés alatt áll
- az aktív admin felület viszont már **fejlettebb labor / multi-sheet / delegált import** irányba ment tovább
- ez kiváló példája annak, hogy a holt vagy árva kód **félrevezető üzleti állítást** is bent hagyhat a repóban

Következtetés:

- az admin importnál nem pusztán takarítás kell, hanem **egyértelmű aktív-vs-legacy leválasztás**

---

## 5. Framework- és minőségbiztosítási adósság

### 5.1. Jelenlegi lint blokkoló

Blokkoló hiba:

- `components/presentation/motion-primitives.tsx:145`
- szabály: `react-hooks/set-state-in-effect`

Konkrét probléma:

- a reduced-motion ágban közvetlen `setDisplay(...)` fut `useEffect`-ből

Következmény:

- a teljes `npm run lint` jelenleg fail-el

### 5.2. Warning-kép

A warningok fő tömbje három helyről jön:

1. régi vagy árva komponensekben bent maradt nem használt változók
2. publikus oldalak és feltöltőfelületek `<img>` használata
3. néhány hiányzó dependency a hookok körül (`react-hooks/exhaustive-deps`)

Megfigyelés:

- a holt vagy régi kódrétegek közvetlenül növelik a lint-zajt
- a cleanup tehát nem csak esztétika, hanem minőségbiztosítási nyereség is

### 5.3. Next.js 16 kompatibilitási adósság

Fájlok:

- `next.config.ts`
- `middleware.ts`

Találatok:

- `experimental.serverComponentsExternalPackages` kulcs még bent van
- a `middleware.ts` konvenció a framework szerint deprecált, a jövőbeni minta `proxy`

Diagnózis:

- a rendszer most még buildelhető,
- de a framework-frissítési teher látható és dokumentálandó

---

## 6. Dependency-higiénia - ebben a körben nincs biztonságos törlési jelölt

Automatikus szkennelés első ránézésre több csomagot gyanúsnak jelölt, például:

- `html2pdf.js`
- `pdfjs-dist`
- `resend`
- `server-only`
- `tw-animate-css`
- `@tailwindcss/postcss`
- `tailwindcss`

A kézi ellenőrzés után:

- `html2pdf.js` aktív dinamikus importtal él a nyomtatási motorban
- `pdfjs-dist` aktív lazy importtal él az Oblio PDF-feldolgozásban
- `resend` aktív dinamikus importtal él a broadcast/e-mail rétegben
- `server-only` több szerveroldali modul belépési őre
- `@tailwindcss/postcss` a `postcss.config.mjs`-ben aktív
- `tailwindcss` és `tw-animate-css` a `app/globals.css`-ből aktív

Következtetés:

- a dependency-takarításban **nincs még olyan csomag**, amit ebből a körből biztonsággal fölöslegesnek lehetne nevezni
- itt a statikus szkennelés könnyen téves képet ad a dinamikus importok és a configalapú használat miatt

---

## 7. Diagnosztikai következtetések

### 7.1. A tudásréteg maga is karbantartandó

Nem elég a kódot rendben tartani. A KARTOTEKA most már olyan méretű lett, hogy:

- régi audit,
- projektlog,
- changelog,
- külön modul-dokumentumok

egymást is el tudják avultatni.

Ezért a dokumentációs karbantartás már önálló feladat.

### 7.2. A “kész / nincs kész” kérdés itt réteges

Ugyanazon területen egyszerre lehet:

- aktív modern megoldás,
- régi árva UI,
- részleges funkció,
- és elavult audit-megállapítás

Az admin import pontosan ilyen terület.

### 7.3. A cleanup stratégia ezért háromágú kell legyen

Nem elég “törölni a fölösleget”.

Három párhuzamos szál kell:

1. árva kód tisztítása
2. részleges funkciók név szerinti listázása
3. dokumentációs ellentmondások megszüntetése

---

## 8. Ajánlott következő lépések

### Rövid táv

1. `components/presentation/motion-primitives.tsx` lint blocker javítása
2. a régi `components/admin/import-tab.tsx` és társai státuszának tisztázása
3. a dokumentációból a már elavult placeholder-állítások kigyomlálása

### Középtáv

1. külön lista az összes “hamarosan / nem elérhető / placeholder” felhasználói funkcióról
2. teljes lint-warning konszolidáció domainenként
3. Next 16 kompatibilitási adósságok rendezése (`proxy`, `serverExternalPackages`)

### Stratégiai

1. “kanonikus állapotdokumentum” kijelölése
2. a projektlog régi, már meghaladott diagnosztikai megállapításainak felülvizsgálata
3. cleanup csak a dokumentációs valóságkép rendbetétele után

---

## 9. Rövid végkövetkeztetés

A rendszer összképe továbbra is erős, de a mostani kör fő tanulsága ez:

**nem csak a kódbázisban maradhat bent legacy réteg, hanem a diagnózisokban is.**

Ha ezt nem kezeljük, a későbbi fejlesztések egy része már nem a valós rendszert, hanem a valós rendszer régi leírását fogja követni.
