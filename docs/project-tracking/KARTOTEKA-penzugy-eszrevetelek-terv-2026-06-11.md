# KARTOTÉKA — Pénzügyi észrevételek: diagnózis, javítások és fejlesztési terv (2026-06-11)

> Endre 8 élesben talált észrevételének feldolgozása. Elv: ÓVATOS javítás,
> találgatás helyett diagnózis; minden nagyobb fejlesztés ITT van megtervezve,
> implementáció csak Endre jóváhagyása után.
> Kapcsolódó: `KARTOTEKA-penzugy-teljes-audit-2026-06-11.md` (teljes audit) ·
> `migration-docs/sql/2026-06-11h-diagnoszt-penzugy-eszrevetelek.sql` (futtatandó!).

---

## A) AZONNAL JAVÍTVA (ebben a körben, kód kész)

### 1. ✅ Státusz-jelzők a headerben (1. észrevétel)
**Volt:** az „Offline munkamenet" és a szinkron-jelvények `fixed` pozícióval a
tartalom FÖLÖTT lebegtek (jobb-felül + alul-középen) — kitakarták a modulokat.
**Lett:** a `KartotekaHeader`/`KartotekaShell` új, opcionális `headerExtra`
bővítőpontot kapott; a desktop a három jelvényt (munkamenet, szinkron-számláló,
auto-szinkron sáv) inline módban a header jobb sávjába teszi, a súgó-gomb elé.
A web-et nem érinti (opcionális prop). Fájlok: `kartoteka-header.tsx`,
`kartoteka-shell.tsx`, `SessionStatusBadge/SyncStatusBadge` (position prop),
`auto-sync-status-bar.tsx`, `auth-gate.tsx` (lebegő render törölve),
`desktop-shell.tsx` (headerExtra bekötés).

### 2. ✅ Kategória-aggregátok + egyházmegyei tételek kiszűrve (2. észrevétel)
**Diagnózis:** a rögzítő a `befizetescel`/`kiadascel` MINDEN aktív sorát
kínálta — köztük az aggregát kategóriafejeket („Egyházi tevékenységből származó
bevételek (5+...+12)", „Múlt évi pénztármaradvány (2+3)"…) és a nem-gyülekezeti
szintű tételeket. A hiba a WEBEN IS megvolt (azonos képlet).
**Szabály (a hivatalos katalógus ellen igazolva):** könyvelhető = a kód
illeszkedik a `^(10[1-7]|20[1-7])\.\d+$` mintára (pontosan a hivatalos
39 bevétel + 48 kiadás = 87 levél) ÉS gyülekezeti szintű. A kanonikus
belső-mozgás kódok az összevont rögzítőben maradnak (a belső-mozgás sor-típushoz).
**Hatókör:** web `finance-tabs.tsx` (CSAK gyülekezeti scope-ban — az
egyházmegyei mód VÁLTOZATLAN), desktop `penzugy-page.tsx`, desktop dedikált
Bevétel/Kiadás oldalak. Közös helper: `isGyulekezetiKonyvelhetoKod`
(`packages/ui-app/src/finance/types.ts`).
**⚠️ ELLENŐRZÉS (Endre):** futtasd a diagnoszt-SQL 2–3. lekérdezését — a
kizártak közt CSAK aggregát/egyenleg/belső-mozgás/egyházmegyei sor lehet, és a
maradó darabszám ~39+48. Ha bármi hiányzik, jelezd!

### 3. ✅ „permission denied for table befizetes" (5. észrevétel)
**Diagnózis (magas konfidencia):** NEM adatbázis-hiba. A rögzítő
`navigator.onLine` alapján döntött az online mentésről — PIN-es (offline)
munkamenetben viszont nincs Supabase-session, így működő internettel a kérés
`anon` szerepkörrel ment, amit a Postgres helyesen utasít el. (A web ugyanazt a
kódot futtatja, de ott nincs PIN-mód — ezért csak desktopon jött elő.)
**Javítás:** új `useSessionOnline` hook / `isOnlineWithSession()` —
ONLINE = hálózat ÉS érvényes session. PIN-módban a rögzítés a bevált OFFLINE
ágon fut (iratszám-tárca + outbox), és a következő online belépéskor
szinkronizálódik. Átállítva: összevont rögzítő + Bevétel/Kiadás/Belső mozgás
oldalak.
**⚠️ MEGERŐSÍTÉS (Endre):** futtasd a diagnoszt-SQL 1. lekérdezését — elvárt,
hogy az `authenticated` szerepkörnek van joga, az `anon`-nak nincs. Ha az
authenticated-nél hiányzik a SELECT/INSERT a `befizetes`/`kiadas` táblákra,
az KÜLÖN hiba — azonnal jelezd, és adok javító SQL-t.

### 4. ✅ Belső mozgás egyértelmű megnevezésekkel (4. észrevétel)
- **Összevont rögzítő** (web+desktop közös komponens): a belső-mozgás opciók
  címkéje a gyülekezet SAJÁT banki megnevezését hordozza — egy bankszámlánál
  „Készpénzletétel a(z) BCR (RON) számlára" (a mentett nevet szó szerint
  használja); több banknál irány-címke + a sor bank-választója dönt.
  **Ha nincs rögzített bankszámla, a belső-mozgás opciók el sem jelennek meg.**
  A mentett kategória és a hivatalos Excelbe írt katalógus-név VÁLTOZATLAN
  (a SUMIF-kompatibilitás érinthetetlen).
- **Belső mozgás oldal (desktop):** a forrás/cél szabad szövegmező helyett a
  rögzített bankszámlák legördülője (név + deviza); a kassza-oldal fix
  „Kassza"; bank nélkül világos üzenet. (Elgépelt banknév = rossz betű-lap az
  Excelben — ez mostantól kizárt.)

### 5. ✅ Sidebar „halott részek" (7. észrevétel) — audit + javítás
Teljes menü ↔ route összevetés eredménye:

| Menüpont | Cél | Állapot | Intézkedés |
|---|---|---|---|
| Profilom | /profile | ❌ nincs desktop-oldal (Hamarosan-placeholder) | desktopon ELREJTVE |
| Admin Panel | /admin | ❌ nincs desktop-oldal | desktopon ELREJTVE |
| Egyházmegye | /dashboard-egyhazmegye | ❌ nincs desktop-oldal | desktopon ELREJTVE |
| Egyházkerület | /dashboard-kerulet | ❌ nincs desktop-oldal | desktopon ELREJTVE |
| Pénzügy-almenü: Áttekintés/Tranzakciók/Számadás/Tartozások | külön oldalak | ⚠️ DUPLIKÁLT (a /penzugy tab-oldal ugyanazt adja) | almenü a tab-horgonyokra mutat (webazonos); + új „Kassza" link |
| Minden más menüpont | — | ✅ élő route | — |

Mechanizmus: új opcionális `hiddenMenuHrefs` prop a közös sidebar-ban — a web
változatlan. A régi route-ok megmaradtak (közvetlen URL működik).

### 6. ✅ Kimutatasok_2026.xlsx — írás TILOS (8. észrevétel)
Kódszinten igazolva: SEMMI nem ír a Kimutatások-fájlba (a Rust-oldali
`find_adatok_file` kizárólag `Adatok_*.xlsx`-et fogad el írási célnak).
A korábbi tervjavaslatot („számadás-export a Kimutatásokba") TÖRÖLTÜK az
audit-dokumentumból, az elv rögzítve: minden tétel az Adatok-fájlba megy, a
Kimutatások onnan automatikusan származtat.

---

## B) MEGTERVEZVE — Endre jóváhagyására vár (implementáció a következő körben)

### B1. Tag-keresés a „Befizető / forrás" mezőben (3. észrevétel)
**Cél:** az összevont rögzítő bevétel-sorában a befizető a tagnyilvántartásból
kereshető, és a befizetés `id_szemely`-hez (családi módban `id_csalad`-hoz)
kapcsolódik (egyházfenntartás, adomány — a tartozás-motor így látja!).
**Terv (web-paritás-biztos):**
1. A közös `CombinedEntryBody` ÚJ, opcionális propja:
   `onSearchMembers?: (query: string) => Promise<Array<{id, csaladnev, k_nev}>>`
   — ha nincs megadva, a mező marad sima szöveg (a web addig változatlan).
2. A bevétel-sor `EntryRow`-ja opcionális `szemelyId`/`csaladId` mezőt kap; a
   „Befizető / forrás" mező autocomplete-té bővül (a dedikált Bevétel oldal
   meglévő tag-keresőjének mintájára: 2 karaktertől keres, kiválasztásnál a
   név beíródik + az id rögzül, X-szel leválasztható).
3. `SaveIncomeBatchRow` bővítés: `id_szemely?: number|null`, `id_csalad?: number|null`
   — a `saveIncomeUseCase` ezt MÁR MOST támogatja (nincs core-változás).
4. Bekötés: desktop → `searchMembersForFinanceUseCase`; web → meglévő
   `searchMembersAction`. Excel G-oszlop: a kiválasztott tag neve megy.
**Becslés:** ~3-4 óra, közepes kockázat (közös komponens — web build + desktop
build + kézi próba mindkét oldalon kötelező).

### B2. Pénzügyi Súgó vizuális felújítása (6. észrevétel)
**Cél:** „szájbarágós", lépésről lépésre vezetett, vizuális súgó.
**Terv-vázlat:**
1. **Szerkezet:** a meglévő `FinanceSugoTab` kategória-szekciói maradnak, de
   minden téma elejére „Mikor kell ez neked?" egysoros helyzet-példa kerül
   (pl. „Vasárnap megszámoltad a perselypénzt → Kassza, bevétel").
2. **Vizuális elemek:** számozott lépés-kártyák (1→2→3 színes körökkel, a
   tagnyilvantartas-help mintájára); folyamat-ábrák a kulcs-folyamatokhoz
   (rögzítés → nyugta → Excel; sztornó-lánc; offline → szinkron út) — egyszerű
   SVG/CSS, nem képernyőkép (nem évül el); „Gyakori hibák" piros kártyák
   (pl. „Banki tételt ne a Kasszába!").
3. **Hangnem:** minden szekció pasztorális nyelvű — a meglévő CHANGELOG-stílus
   („nem kell kétszer beírni…") kiterjesztése.
4. **Terjedelem:** ~10 fő-téma × 1 folyamatábra/lépéssor; a desktop
   „Asztali (offline) verzió" szekciója kiegészül az Excel-szinkron
   magyarázatával (bank-párosítás, „Excel nyitva" jelzés, várakozó tételek).
**Becslés:** ~1 nap, alacsony kockázat (csak megjelenítés).

### B3. Belső-mozgás opciók bankonként kibontva (4. észrevétel folytatása)
Több bankszámlánál a legördülő bankonként külön opciót adhatna
(„Készpénzletétel a(z) BCR (RON) számlára" / „… a(z) OTP (EUR) számlára"),
ami a kategóriát ÉS a bankot egyben állítja — a külön bank-választó kiesik.
Mélyebb beavatkozás a közös sor-modellbe → külön kör, B1-gyel együtt érdemes.

### B4. Desktop bank-import bankszámla-hozzárendelés (audit P1 — folyamatban)
Már kiadott külön feladat (chip): számlaválasztó + `bankszamla_id` átadás +
utána az import-tételek Excel-betű-lapra írása.

### B5. Egyéb függőben lévő (a teljes auditból)
- E2E Excel-teszt aláírt buildkel (checklista az auditban) + E4 keresztellenőrzés.
- bank↔bank / valutacsere Excel-írás.
- PIN-kód csere a Beállításokból (A-M15).
- Web dialógus-verziók takarítása; Oblio token-rotáció; friss séma-dump.

---

## B6) Biztonság: szinkron csak hitelesített belépéssel ✅ (Endre kérése, 2026-06-11)

**Kérés:** „A szinkronizáció a Supabase adatbázissal csak akkor történhet meg,
ha biztosan helyesen van belépve! Ennek a biztonsági funkcióit ki kell dolgozni
alaposan!"

**Elkészült (1. ütem — a felhő-ÍRÁS védelme):** új `verified-session.ts` őr,
amely MINDEN push-szinkron (befizetés, kiadás, nyugta) előtt hármat ellenőriz:
1. van-e érvényes Supabase-session (4 mp-es határidővel — sosem blokkol);
2. nem járt-e le (a lejárt session nem ad zöld utat);
3. **fiók-egyezőség:** a bejelentkezett fiók azonos-e azzal, akihez a gépen
   tárolt adatok tartoznak — ha valaki MÁS fiókkal lép be ugyanazon a gépen,
   a helyi függő tételek NEM mennek fel (látható üzenettel: „Más fiókkal vagy
   bejelentkezve… a szinkron biztonsági okból szünetel."). Sosem csendben.

**2. ütem (tervezett — jóváhagyásra):**
- ugyanez az őr a LETÖLTŐ (pull) szinkronra is — más fiók alatt a helyi tükör
  ne íródjon felül idegen adatokkal;
- fiók-váltási folyamat: ha szándékosan vált gazdát a gép, vezetett
  adattörlés + új letöltés (a meglévő wipe-mechanizmusra építve);
- a PIN-es offline munkamenetben a felhő-műveletek egységes tiltása már él
  (session-tudatos online-döntés, A/3. pont).

---

## C) KÉRDÉSEK ENDRÉHEZ (válasz után lépünk)

> **2026-06-11 állapot:** Endre válaszolt — B1 ✅ jóváhagyva (családi móddal
> EGYÜTT — implementálva: közös `PartnerCell` kereső + desktop bekötés; a web
> bekötése a desktopos próba után), dedikált oldalak ✅ rendben, B2 súgó-irány
> ✅ jóváhagyva (következő kör). A diagnoszt-SQL-ből csak a 3. eredmény jött át
> (Supabase-korlát: csak az utolsó lekérdezés látszik) — **31 bevétel + 38
> kiadás maradt a hivatalos 39+48 helyett → 8+10 hivatalos kategória hiányzik
> a választékból.** Két ÚJ, egy-lekérdezéses szkript készült:
> `2026-06-11i-hianyzo-hivatalos-kategoriak.sql` (név szerint mutatja a
> hiányzókat) és `2026-06-11j-grants-ellenorzes.sql` (jogosultság-ellenőrzés).

> **KORREKCIÓ (Endre képernyőképe nyomán, még 2026-06-11):** a 87-es katalógus
> EGYHÁZMEGYEI tételeket is tartalmaz! Az egyházközségi bevétel-lista a
> hivatalos Excelben 30 tételes (101.01–107.02), a 9 különbözet mind felsőbb
> szintű (101.07/101.08, 105.03 Kongrua, 106.01–106.06). **A DB 31-es bevétel-
> készlete tehát lényegében HELYES, nem hiányos.** Az i-SQL v2-re frissült
> (a kép tudását hordozza); a kiadás-oldal igazolásához Endre kiadási
> képernyőképe kell (a névminta ott nem dönt — pl. a „Központi járulékok"
> tipikus GYÜLEKEZETI fizetési kötelezettség).

> **LEZÁRÁS (Endre kiadás-oldali képe, 2026-06-11):** a kiadás-oldal is
> igazolva — az egyházközségi kiadás-lista PONTOSAN 38 tételes, ami egyezik a
> DB-vel! A felsőbb szintű 10: 201.15–201.19 (bér-blokk: nettó fizetések, adó,
> TB, eü., munkabizt.) + 206.02–206.06. A heurisztikus gyanú a 203.06/203.07-re
> TÉVES volt (azok gyülekezeti kiadások — a kép igazolta; ezért nem találgatunk).
> **A kategória-készlet tehát HELYES (30+38 = 68 egyházközségi tétel; a
> katalógus 19 felsőbb tételével együtt 87).** Egyetlen nyitott szál: a
> bevétel-oldali +1 (31 vs 30) — valószínűleg duplikált sor (a sablonban a
> 101.06 kétszer szerepel) → `2026-06-11k-bevetel-duplikatum.sql` mutatja meg.
> Az i-SQL v3 immár mindkét kép tudását hordozza.

> **VÉGSŐ LEZÁRÁS (2026-06-11):**
> - **Jogosultságok ✅** — a j-SQL eredménye: `authenticated` = SELECT/INSERT/
>   UPDATE/DELETE a befizetes/kiadas/belsomozgas táblákon; `anon` = SEMMI
>   (nem is szerepel). Pontosan a kívánt állapot — a „permission denied"
>   diagnózis (PIN-módos anon-kérés, kliens-oldalon javítva) 100%-ban igazolt.
> - **Duplikátum nincs** (k-SQL: 0 találat) → a bevételi +1 = az egyik
>   felsőbb szintű kód aktívan felvéve a választékba. Javítás:
>   `2026-06-11l-felsobb-szint-jeloles.sql` — a 19 igazoltan felsőbb szintű
>   kód (9 bevétel + 10 kiadás) szint='egyhazmegye' jelölése; ettől a
>   gyülekezeti rögzítő pontosan 30+38 tételes lesz, az egyházmegyei felület
>   pedig pont ezeket kapja. Rögzített tételeket nem érint, nem töröl.
> - **bank↔bank Excel-írás ✅ élesítve** — a bank-lap képernyőkép igazolta a
>   névmintát (301.xx „Átutalva …ról - X" / 401.xx „Átutalva …ra - X" + a
>   kassza-párok); a névszótár v2 (840 név), buildBankBankExcelRows
>   név-egyeztetéssel, 2 sor enqueue (bank-forras/bank-cel), a worker mindkét
>   betűt a megerősített párosításból oldja fel. Valutacsere továbbra is
>   későbbi kör.

> **A „+1" AZONOSÍTVA (m-SQL, 2026-06-11):** a kakukktojás a **106.01
> „Bevételek más egyházi intézmények részére"** — pontosan a várt felsőbb
> szintű családból. A teljes lista minden más sora (30 bevétel + 38 kiadás)
> hivatalos ✔. Teendő: az l-javítószkript futtatása (a 106.01-et és a többi
> 18 felsőbb kódot egyházmegyei szintre jelöli) → a rögzítő pontosan 30+38
> tételes lesz. **Ezzel a kategória-téma VÉGLEG lezárva.**

> **KORREKCIÓ #2 (Endre, 2026-06-11): a 106.01 GYÜLEKEZETI tétel** — tévesen
> maradt le a hivatalos képről. A helyes egyházközségi készlet tehát
> **31 bevétel + 38 kiadás** — vagyis a DB készlete EREDETILEG IS PONTOS volt!
> Teendő: ha az l-szkript (v1) már lefutott, a
> `2026-06-11n-106-01-visszaallitas.sql` visszaállítja a 106.01-et; az
> l-szkript v2-re frissült (18 kód, a 106.01 nélkül); az m/i ellenőrzők is
> követik a korrekciót. App-oldali kódváltozás NEM kell (a szűrő szint-alapú).

> **✅ ADATBÁZIS-OLDAL LEZÁRVA (Endre futtatta, 2026-06-11):** n-szkript:
> 106.01 = gyulekezet, választékban, bevetel_db = 31 ✓ · l-szkript v2: mind a
> 18 felsőbb kód szint = egyhazmegye ✓. (Az ellenőrző tábla „valasztekban_volt
> IGEN" felirata csak a kategória-KAPCSOLAT meglétét jelzi — a rögzítőben
> egyedül a 106.01 volt ténylegesen látható, a többit a szint-jelölés már
> korábban is rejtette.) **Végállapot: 31 bevétel + 38 kiadás — hivatalos.**

1. **Diagnoszt-SQL eredményei** (`2026-06-11h-diagnoszt-penzugy-eszrevetelek.sql`):
   (a) az 1. lekérdezésben az `authenticated`-nek van-e SELECT/INSERT joga a
   `befizetes`/`kiadas` táblákra? (b) a 2. lekérdezés kizárt-listájában van-e
   olyan tétel, amit könyvelni szoktatok? (c) a 3. darabszám ~39/48-e?
2. **B1 tag-keresés:** jóváhagyod a fenti tervet? (A „Befizető / forrás" mező
   családi befizetést is tudjon-e — a dedikált oldalon már van családi mód?)
3. **Dedikált Bevétel/Kiadás oldalak:** ott a belső-mozgás kategóriákat
   KIVETTÜK (bank-párosítás nélkül ott nem értelmezhetők; a Belső mozgás
   oldal a helyük). Rendben van így?
4. **B2 súgó:** a vázolt irány (lépés-kártyák + folyamatábrák + „gyakori
   hibák") megfelel-e; van-e konkrét téma, amit elsőként kérsz?

---

## ✅ KONSZOLIDÁLT LISTA #5 — PARITÁS KÉSZ (2026-06-11, este)

A Bank / Költségvetés / Monetár fülek bekerültek az egységes desktop
`/penzugy` tab-oldalba — a web-azonos MEGOSZTOTT komponensekkel
(`@kartoteka/ui-app`: BankTab, BudgetTab, MonetaryTab), desktop adatforrással:

| Fül | Adatforrás | Írás |
|---|---|---|
| **Bank** | tranzakciók a lokális tükörből (`bankszamla_id` az adapteren át), bankszámla-törzs + éves nyitó egyenlegek online | sztornó/visszavonás/szerkesztés a meglévő desktop dialógusokkal; bankszámla felvétel/szerkesztés új `DesktopBankAccountDialog`-gal (B6-őr) |
| **Költségvetés** | online a közös `loadBudgetRowsCompat`-tal (`@kartoteka/core`-ba költözött, a web shim-en át ugyanazt használja); OFFLINE megtekintés a `koltsegvetes_local` tükörből | mentés/véglegesítés/egyházmegyei beküldés/feloldás-kérés igazolt belépéssel; mentés után lokális tükör-frissítés |
| **Monetár** | címlettörzs + pillanatfelvétel online (web-azonos kanonikus fallback) | mentés igazolt belépéssel; címletjegyzék-nyomtatás rejtett iframe printtel |

Kapcsolódó: a sidebar Pénzügy-almenü web-paritásra bővült (Bank, Költségvetés,
Bérleti szerződések, Monetár, Súgó horgonyok); az összevont rögzítő
(`+ Tétel rögzítése`) mostantól a VALÓDI bankszámla-listát kapja (eddig üres
tömböt — banki tétel és belső mozgás opciók így a fő oldalról is teljesek).

**Tudatosan később (nem hiba):**
- **Bérleti szerződések fül**: webes szerződés-dialógra + Oblio e-Facturára
  épül — a desktop fül tájékoztató kártyát mutat, a webre irányít.
- **Költségvetés-nyomtatás gomb** (webes html2pdf print-engine): a fül teljes
  funkciójú nélküle; desktop-print később, az egységes print-stratégiával.
- **BCR import-wizard modal**: desktopon a dedikált `/bank-import` oldal a
  kanonikus út (bankszámla-kötéssel + Excel-írással) — a fül gombja oda visz.
