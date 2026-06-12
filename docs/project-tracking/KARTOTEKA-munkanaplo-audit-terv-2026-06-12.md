# KARTOTÉKA — Munkanapló audit + fejlesztési terv (2026-06-12)

> Endre webes kérései #3 (munkanapló feltérképezés: hibák, javaslatok, új funkciók)
> és #4 (anyakönyv ⇄ munkanapló integráció) alapján.
> Státusz-jelölés: ✅ = ebben a körben implementálva · 🔜 = későbbre tervezett · 📋 = döntésre vár.

---

## 1. Architektúra-térkép (mi hol él)

| Réteg | Fájl | Szerep |
|---|---|---|
| Oldal | `apps/web/app/(dashboard)/munkanaplo/page.tsx` | server page: hozzáférés-ellenőrzés + import-tab |
| Actionök | `apps/web/app/(dashboard)/munkanaplo/actions.ts` | getWorklogs / saveWorklog / deleteWorklog (+ ✅ getWorklogsForYear) |
| Fő UI | `apps/web/components/worklog/worklog-tabs.tsx` | 3 kategória-fül + Lelkészi jelentés fül + szűrők + CSV |
| Rögzítő dialog | `apps/web/components/modals/worklog-dialog.tsx` | kategória/típus + mezők |
| Nyomtatás | `apps/web/components/worklog/worklog-print-dialog.tsx` + `apps/web/lib/worklog/reporting.ts` | 4 nyomtatvány (szolgálati/katekétikai/diakóniai összesítő + éves lelkészi jelentés) |
| Konstansok | `apps/web/lib/constants/worklog.ts` | kategóriák, típusok, WorklogEntry típus (+ ✅ categorizeWorklogEntry) |
| Anyakönyv | `apps/web/app/(dashboard)/anyakonyv/actions.ts` | saveBaptism / saveMarriage / saveBurial / saveConfirmationBatch / deleteRegistryEntry |
| Családlátogatás | `apps/web/app/(dashboard)/tagnyilvantartas/family-actions.ts` (`saveFamilyVisit`) + `components/modals/family-visit-form-dialog.tsx` | `csaladlatogatas` tábla + opcionális munkanapló-pipa |
| Éves jelentés | `apps/web/app/(dashboard)/eves-jelentes/*` + `apps/web/lib/annual-report/generator.ts` | 10 szekciós hivatalos jelentés — a II. és V. szekció a munkanaplóból aggregál |
| ✅ ÚJ: szinkron-helper | `apps/web/lib/worklog/registry-sync.ts` | idempotens anyakönyv→munkanapló írás + soft-delete |

**DB:** `munkanaplo` (idopont, jellege, id_jellege, bibliaolvasas, alapige, cim, enekek, jelenlet_ferfi/no/gyermek/osszesen, szolgalt, persely, megjegyzes, mediapath, kategoria, du, congregation_id) · a `keresztseg` / `hazassag` / `temetes` / `konfirmalas` / `csaladlatogatas` táblák **mind tartalmaznak `munkanaplo_id` link-oszlopot** (eddig sehol nem volt kitöltve), a keresztseg/hazassag/temetes `munkanaploba` boolean-t is.

### Excel-minta lefedettség (Munkanaplo_Lelkeszi jelentes.xlsx)

| Excel-lap | App-megfelelő | Lefedettség |
|---|---|---|
| Szolgalati_alkalmak (S.sz., Dátum, Jelleg, Du., Férfi/Nő, Bibliaolvasás, Alapige, 1-3. ének) | `munkanaplo` kategoria='szolgalat' | ✅ teljes — a Du. mező mostantól a rögzítőben is (eddig csak DB-ben élt) |
| Katekezis (Dátum, Jelleg, Résztvett, Tananyag, Perselypénz, Tartotta, Megjegyzés) | `munkanaplo` kategoria='katekezis' | ✅ teljes — Perselypénz + Tartotta mező a rögzítőbe felvéve; Tananyag = Cím mező; ÚJ típusok: Vallásóra, Kátéóra |
| Csaladlatogatas (Dátum, CsL/BL, név+cím, jelen volt, jegyzet) | `csaladlatogatas` tábla + munkanapló kategoria='latogatas' | ✅ — „Beteglátogatás" típus felvéve (CsL/BL bontás); jelenlét-mezők a látogatás-kategóriában is |
| Jelentes (éves lelkészi jelentés — 66/2023. IT-határozat) | `eves-jelentes` modul (10 szekció) + munkanapló-nyomtatványok | ✅ aggregál a munkanaplóból (II. + V. szekció) — a soft-delete-elt sorok kizárása most került be |

---

## 2. TALÁLT HIBÁK (és state-jük)

### P0 — a modul működését blokkoló hibák

1. **✅ JAVÍTVA — minden anyakönyvi munkanapló-insert némán elbukott.**
   A `munkanaplo.jelenlet_osszesen` NOT NULL **és nincs DB-default**, a
   keresztelő/temetés/konfirmáció insertjei pedig nem adták meg → a PostgREST
   hibát adott vissza, amit a `try/catch` nem fogott (a Supabase nem dob,
   hanem `{ error }`-t ad vissza). **A „Rögzítés a munkanaplóba" pipa soha nem
   csinált semmit.** Ugyanez vitte el a családlátogatás → munkanapló szinkront is.
   → Javítás: közös `registry-sync.ts` helper (mindig megadja a mezőt) + a
   2026-06-12c SQL DB-default-ot is pótol.

2. **✅ JAVÍTVA (fallback-kel) — a webes kód `deleted` oszlopot használ, ami a
   friss schema-dump szerint NEM létezik a `munkanaplo` táblán.** A
   `getWorklogs` `.eq('deleted', false)` szűrője hibára fut → üres lista; a
   mentés/törlés ugyanígy. (A desktop kliens-tükör v7 migrációja a web-kód
   alapján *feltételezte* az oszlop létét — körkörös bizonyíték, a schema-dump
   az irányadó.) → Javítás: minden lekérdezés/mutáció oszlop-hiányra
   érzékeny fallback-kel fut, a 2026-06-12c SQL pedig létrehozza az oszlopot
   (akkor lesz valódi soft-delete).

3. **✅ JAVÍTVA — az éves lelkészi jelentés nyomtatványa szinte üres volt.**
   A nyomtatási központ a fülektől az AKTUÁLIS HÓNAP bejegyzés-listáját kapta,
   miközben év-választót kínált → az „Éves lelkészi jelentés" legfeljebb egy
   hónapnyi adatot tartalmazott. → A dialog mostantól maga tölti be a
   kiválasztott év TELJES adatát (`getWorklogsForYear`).

### P1 — funkcionális hibák

4. **✅ JAVÍTVA — esketés → munkanapló integráció teljesen hiányzott.**
   A `hazassag.munkanaploba` oszlop és a séma-mező létezett, de a
   marriage-dialogban nem volt pipa, és a `saveMarriage` sosem írt munkanaplót.

5. **✅ JAVÍTVA — szerkesztés némán kikapcsolta a munkanapló-pipát.**
   A baptism/burial dialog edit-módban fixen `setMunkanaploba(false)`-t
   állított → minden szerkesztés-mentés visszaírta a DB-be a false-t.
   Mostantól a mentett értéket tölti vissza.

6. **✅ JAVÍTVA — duplikált típuslista elgépeléssel.** A worklog-tabs saját
   WORKLOG_TYPES másolatot tartott `'Egyéb katekázis'`-sal, miközben a dialog
   a konstans `'Egyéb katekézis'`-t menti → az így rögzített bejegyzés egyik
   fülön sem jelent meg. A kategorizálás mostantól KÖZÖS helperen fut
   (`categorizeWorklogEntry`: kategoria-mező elsőbbség + jellege-fallback).

7. **✅ JAVÍTVA — az anyakönyvből generált bejegyzések láthatatlanok voltak.**
   A 'Keresztelő'/'Temetés'/'Konfirmáció' jellege-értékek egyik fül
   típuslistájában sem szerepeltek → csak a „Lelkészi jelentés" fül összesenjében
   látszottak (volna). A kazuáliák felvéve a szolgálati típusok közé
   (Keresztelő, Esketés, Temetés, Konfirmáció).

8. **✅ JAVÍTVA — konfirmációs batch hibás darabszámot írt.** A munkanapló-cím
   a `candidates.length`-et használta, miközben a már konfirmáltak kiszűrése
   után csak `newCandidates` került mentésre; a visszaadott `count` is a kért
   (nem a tényleges) darabszám volt.

9. **✅ JAVÍTVA — törléskor/stornózáskor árva munkanapló-sor maradt.**
   `deleteRegistryEntry` mostantól a kapcsolt bejegyzést soft-delete-eli
   (konfirmációnál csak ha már nincs másik sor, ami rá hivatkozik).
   **Dokumentált döntés:** anyakönyvi törlés = a generált szolgálat-bejegyzés
   is törlődik (soft — a DB-ben visszaállítható); a kicsekkolt pipa
   szerkesztéskor szintén eltávolítja.

10. **✅ JAVÍTVA — az éves jelentés a törölt munkanapló-sorokat is számolta**
    (generator.ts: nem szűrt deleted-re). Fallback-kel szűr mostantól.

### P2 — kisebb hibák / hiányok

11. **✅ JAVÍTVA — worklog-dialog edit-módban a kategória-felismerés** a
    jellege-listák első találatára ugrott (kategoria-mezőt ignorálta) +
    legacy/egyedi típusnál a select üresre ugrott (option-megőrzés bekerült).
12. **✅ JAVÍTVA — saveWorklog szerkesztéskor kinullázta az `id_jellege`-t**
    (ebben él mostantól az anyakönyvi forrás-marker) — csak akkor írjuk, ha jött érték.
13. 🔜 **A munkanapló oldalon nincs Családlátogatás-rögzítő gomb** — a
    family-visit-form-dialog kommentje ígéri („Használható a Munkanapló
    oldalról"), de nincs bekötve; család-választó kellene hozzá (a látogatás
    `id_csalad` NOT NULL). → tervezett (lásd 5. szakasz).
14. 🔜 **Családlátogatás-törlés**: a `csaladlatogatas` sorokhoz nincs törlés-UI
    és a kapcsolt munkanapló-takarítás sem létezik (a link mostantól kitöltődik,
    tehát később olcsón megoldható).
15. 📋 **Desktop-paritás**: a desktop munkanapló-oldal és a sync (apps/desktop)
    NEM része ennek a körnek (5. pont, későbbi munka) — de a `deleted` oszlop
    létrejötte után a desktop v7 feltételezése is igazzá válik.
16. **✅ JAVÍTVA — rendszergazdai import: látogatás-profil rossz kategóriával.**
    A `PROFILE_WORKLOG_VISITS` `kategoria='diakoniai'` literált írt (a kanonikus
    készlet: szolgalat/katekezis/latogatas) → az importált látogatások a
    Szolgálat fülre estek volna. → 'latogatas'-ra javítva.
17. **SQL-lel gyógyul — import szolgálati profil `jelenlet_osszesen` nélkül.**
    A `PROFILE_WORKLOG_SERVICES` nem tölti a NOT NULL `jelenlet_osszesen`-t
    (csak férfi/nő oszlopokat) → az import a DEFAULT 0 nélkül elhasal. A
    2026-06-12c SQL DEFAULT-ja ezt megoldja; transformer-szintű összegzés
    (ferfi+no) későbbre. 🔜

---

## 3. Webes kutatás — mi bevett az egyházi szolgálat-naplózásban

Források: [Undershepherd pastoral care guide](https://undershepherd.app/pastoral-care-tracking-software-guide/),
[CareNote how-to-track-pastoral-care](https://www.carenote.app/guides/how-to-track-pastoral-care),
[ChurchSuite attendance database](https://churchsuite.com/church-attendance-database/),
[Church Metrics](https://churchmetrics.com/), [SteepleMate attendance](https://get.steeplemate.com/attendance/),
[PDS Sacramental Register](https://www.acstechnologies.com/parish-data/tools/sacramental-register/),
[Pastoral Recordbase](https://www.freechurchforms.com/pastoral-recordbase.html),
[PowerChurch attendance](https://www.powerchurch.com/products/pcplus/activities-groups-attendance-tracking.php),
[Kálvin Kiadó — Lelkipásztori napló](https://www.kalvinkiado.hu/konyv/egyhaz-es-gyulekezet/lelkipasztori-naplo-detail).

Bevett funkciókészlet és hogy hol állunk:

| Funkció (iparági standard) | Kartotéka-státusz |
|---|---|
| Ki/mi/mikor/ki-szolgált/jegyzet rögzítése | ✅ megvan |
| Anyakönyv (sacramental register) → szolgálati napló automatikus frissítés | ✅ MOST került be (PDS-minta: a register-változás automatikusan átvezetődik) |
| Hónap/év szerinti szűrés + trend | ✅ év/hónap-szűrő most került be; 🔜 trend-grafikon (havi oszlopdiagram) |
| Éves/havi összesítő jelentés nyomtatva | ✅ (4 nyomtatvány; éves jelentés most kap teljes éves adatot) |
| CSV/Excel export | ✅ CSV megvan; 🔜 valódi .xlsx export az Excel-sablon formátumában |
| Látogatások follow-up / „next step" + státusz (active/resolved) | 🔜 nagy tétel — lásd 5.2 |
| Egyéni jelenléti ív (ki volt jelen név szerint) | 🔜 nagy tétel — lásd 5.3 |
| Jogosultság / privacy a lelkigondozói jegyzetekre | 📋 jelenleg gyülekezet-szintű RLS; érzékeny jegyzetekhez külön szerep később |
| Audit-trail (ki mikor nézte/módosította) | 📋 a meglévő audit_log kiterjesztése (lásd 2026-06-05 tervdoc) |

---

## 4. MOST IMPLEMENTÁLT VÁLTOZÁSOK (összefoglaló)

### 4a. Anyakönyv ⇄ munkanapló integráció (#4)

- **ÚJ: `apps/web/lib/worklog/registry-sync.ts`** — idempotens szinkron:
  - kanonikus link: a forrás-tábla `munkanaplo_id` oszlopa (eddig kihasználatlan);
  - másodlagos kulcs: `munkanaplo.id_jellege` forrás-marker (`keresztseg:123`);
  - update-kor csak az anyakönyv-tulajdonú mezőket írja (dátum/típus/cím/
    lelkész/alapige) — a lelkész által kézzel kitöltött jelenlét/persely megmarad;
  - pipa kivételekor / törléskor soft-delete; `deleted`-oszlop-hiányra fallback.
- **saveBaptism**: insert ÉS update után szinkron; cím a megkeresztelt nevével;
  alapige + lelkész átadva. (Korábban: csak insert, és az is némán elbukott.)
- **saveMarriage**: TELJESEN ÚJ integráció — 'Esketés' bejegyzés a pár nevével;
  pipa a marriage-dialogba is bekerült.
- **saveBurial**: insert+update szinkron; cím az elhunyt nevével; idopont = temetés napja.
- **saveConfirmationBatch**: EGY közös bejegyzés / batch (egy alkalom!), minden
  konfirmalas sor linkje kitöltve; megjegyzésben a konfirmandusok névsora;
  darabszám-bug javítva.
- **saveConfirmationSingle**: szándékosan NEM nyúl a munkanaplóhoz (a bejegyzés
  a batch-alkalomé, nem az egyéné) — dokumentált döntés.
- **deleteRegistryEntry**: kapcsolt bejegyzés soft-delete (konfirmációnál
  referencia-számlálással).
- **saveFamilyVisit** (családlátogatás): a közös helperre kötve; a
  `csaladlatogatas.munkanaplo_id` link mostantól kitöltődik; kategoria='latogatas'.
- Dialógusok: munkanaploba-pipa visszatöltése edit-módban (baptism/burial/marriage).

### 4b. Munkanapló oldal fejlesztések (#3)

- Év + hónap szűrő („Egész év" opcióval) — éves áttekintés a fülön is.
- Nyomtatási központ: saját éves adatbetöltés (`getWorklogsForYear`).
- Rögzítő dialog: Du. (délutáni alkalom) pipa; katekézisnél Perselypénz +
  Tartotta; látogatásnál Lelkész + jelenlét; jelenlét-hármas minden kategóriánál.
- Típuslisták bővítése: kazuáliák (szolgálat), Vallásóra/Kátéóra (katekézis),
  Beteglátogatás (látogatás — Excel CsL/BL bontás).
- Közös kategorizáló (`categorizeWorklogEntry`) mindenhol; a jelentés-fül
  szövege év-módban helyesen fogalmaz.
- A lekérdezések/mutációk `deleted`-oszlop-hiányra ellenállóak (a modul az
  SQL lefuttatása ELŐTT is működik, utána soft-delete-tel).

### 4c. Gyülekezet-beállítás varázsló ellenőrzés (#2) — találatok és javítások

Az actionök léteznek és hibakezeltek (getCongregationForSetup,
saveCongregationSetup, uploadCongregationCimer, getCongregationBankAccounts,
saveCongregationBankAccount, deleteCongregationBankAccount); az event-lánc
(header → dashboard-shell → lazy wizard) él. Javított hibák:

1. A kliens „Mentésre kész" feltételéből hiányzott a **cím (utca)** és a
   **címer** — a szerver-séma kötelezően kéri őket → a gomb aktív volt, de a
   mentés hibával elszállt. Most a kliens-feltétel tükrözi a szervert, ÉS a
   hiányzó mezők fel vannak sorolva a gomb felett.
2. **Sorrend-bug**: a bankszámla insert/update/DELETE a fő űrlap validálása
   ELŐTT futott → érvénytelen űrlapnál is részleges mentés történt. Mostantól
   előbb a szigorúan validált alapadat-mentés, utána a bankszámlák.
3. A bankszámla-törlés hibája néma volt → most toast.
4. A betöltési hiba néma volt (üres űrlap magyarázat nélkül) → most toast.

---

## 5. KÉSŐBBRE TERVEZETT (nagy tételek)

### 5.1 Munkanapló trend-vizualizáció (közepes)
Havi oszlopdiagram (alkalmak + összjelenlét + persely) az év nézetben, a
Lelkészi jelentés fülre. A `getWorklogs('YYYY')` már szállítja az adatot;
csak chart-komponens kell (recharts már elérhető a projektben — ellenőrizni).

### 5.2 Látogatási follow-up / lelkigondozói státusz (nagy)
Iparági minta (Undershepherd/CareNote): minden látogatásnál „következő lépés"
+ határidő + státusz (aktív/lezárt) + felelős. Javasolt megvalósítás:
`csaladlatogatas` bővítése (`kovetkezo_lepes text, hatarido date, statusz
varchar default 'lezart'`) + dashboard-widget az esedékes follow-upokról.
SQL-tervezet készül, ha Endre rábólint. **Adatvédelmi kérdés:** a lelkigondozói
jegyzet érzékeny — érdemes-e külön (csak lelkész) láthatósági szint? 📋

### 5.3 Egyéni jelenléti ív (nagy)
Név szerinti jelenlét (ki volt ott az alkalmon) — kapcsolótábla
(`munkanaplo_jelenlet`: munkanaplo_id + id_szemely). Erre épülhet:
„régen nem látott tagok" lista (ChurchSuite/SteepleMate minta). Csak
igény esetén — a magyar gyakorlatban a létszám-bontás (férfi/nő/gyermek)
a hivatalos elvárás, az megvan.

### 5.4 XLSX-export a hivatalos Excel-sablon formátumában (közepes)
A meglévő CSV mellé: Munkanaplo_Lelkeszi jelentes.xlsx lapszerkezetét követő
.xlsx generálás (exceljs), hogy a megszokott formátumban adható le.

### 5.5 Munkanapló oldali családlátogatás-rögzítés (kicsi-közepes)
„Új családlátogatás" gomb a Családlátogatás fülre: család-kereső +
a meglévő FamilyVisitFormDialog újrahasznosítása. (A látogatás `id_csalad`
NOT NULL — családhoz kötött.)

### 5.6 Katekézis-tananyag tervező (📋 csak ötlet)
Éves tanmenet (témasor) előre rögzítése, az alkalom-rögzítésnél választható
„következő tananyag". Az Excel Katekezis-lap Tananyag-oszlopa most a Cím
mezőben él — ez kis lépésben már lefedett.

### 5.7 Desktop-paritás (Endre #5 — másik kör)
A desktop munkanapló-oldal ugyanezeket a mezőket/szűrőket kapja; a
`deleted`-oszlop a 2026-06-12c SQL után a desktop v7 migrációjával is konzisztens.

---

## 6. ENDRÉRE VÁRÓ TEENDŐ — SQL

**`migration-docs/sql/2026-06-12c-munkanaplo-integracio.sql`** (idempotens):
1. `munkanaplo.deleted` oszlop létrehozása (soft-delete);
2. `jelenlet_osszesen` DEFAULT 0 (a néma insert-bukások gyökéroka ellen);
3. részleges index (gyülekezet + dátum, élő sorok);
4. **backfill**: a régi, pipával mentett keresztelések/temetések (+ esketések)
   hiányzó munkanapló-bejegyzéseinek pótlása névvel + a `munkanaplo_id` linkek
   beállítása (konfirmációra nem lehetséges — ott nincs perzisztált pipa);
5. ellenőrző lekérdezések (0 linkeletlen sor az elvárt eredmény).

A webes kód az SQL lefuttatása NÉLKÜL is működik (fallback-ek), de a
soft-delete és a backfill csak utána él.

---

## 7. Verifikáció

- `cd apps/web && npx tsc --noEmit` — zöld (2026-06-12).
- `npm run build` — lásd a kísérő jelentést.
- Manuális teszt-forgatókönyv (Endrének, SQL után):
  1. Új keresztelés pipával → Munkanapló/Igehirdetés fülön megjelenik a
     „Keresztelés: <név>" sor a keresztelés dátumán.
  2. A keresztelés dátumának módosítása → a munkanapló-sor követi (nem duplázódik).
  3. Pipa kivétele szerkesztéskor → a sor eltűnik a naplóból.
  4. Anyakönyvi sor törlése → a napló-sor is eltűnik.
  5. Esketés rögzítése pipával → „Esketés: X és Y" sor.
  6. Konfirmáció-batch (3 fő) → EGY sor „Konfirmáció (3 fő)" + névsor a megjegyzésben.
  7. Családlátogatás a családi kartonról pipával → Családlátogatás fülön megjelenik.
  8. Nyomtatási központ → éves jelentés a TELJES év adataival.
