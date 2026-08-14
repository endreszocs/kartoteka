# A 18 pont felmérése — bizonyíték-alapú állapotjelentés

**Készült:** 2026-08-14 · 14 párhuzamos kódfelmérő ágens + a hivatalos EREK Excel gépi elemzése
+ romániai jogszabály-kutatás alapján.
**Alapállapot:** `npm run typecheck` tiszta, `npm run selftest` minden zöld.

Kapcsolódó dokumentumok:
- [EREK munkanapló + lelkészi jelentés specifikáció](./EREK-MUNKANAPLO-LELKESZI-JELENTES-SPEC-2026-08-14.md)
- [Romániai szabványok és külső integrációk kutatás](./ROMAN-SZABVANYOK-KUTATAS-2026-08-14.md)

---

## 0. Vezetői összefoglaló — amit MOST tudni kell

### 🔴 Azonnali, felhasználói teendő

> **A napi biztonsági mentés NEM INDUL EL.**
> A `migration-docs/sql/2026-08-13-changelog-jelolesek-besorolas.sql` szinte biztosan
> **nem futott le** élesben. Amíg nem fut, a mentés fail-closed őrszeme megállítja a futást.
> Ez a legmagasabb prioritású tétel az egész listán, mert **adatvesztési kockázat**,
> és egyetlen SQL lefuttatásával orvosolható.

### 🔴 Amit a rendszer ma HAMISAN állít

| Hol | Mit állít | Valóság |
|---|---|---|
| Jogi nyilatkozat | „van kétlépcsős azonosítás" | **Nincs.** Semmilyen MFA-kód nincs a monorepóban. |
| Profil → Szolgálati háttér | „Még nincs rögzítve" | A `pastor_service_history` tábla **létezik és tele lehet** — csak senki nem olvassa. |
| Kuka → „Végleges törlés" | törölve | A rekord a **következő szinkronnal visszajön**. |
| Kuka → „30 nap múlva törlődik" | visszaszámláló | Az `updated_at`-ból számol, nem a törlés idejéből — **hamis dátum**. |
| Csoportnapló típusleírás | „oldalszámozva" | *(javítva 2026-08-14)* |

### 🔴 Néma adatvesztés / néma üres lista (a projekt ismert hibaosztálya)

1. **Leltár: 1000 soros PostgREST-plafon** lapozás nélkül → az egész modul némán csonkul.
2. **Kuka: a ténylegesen törölt modulok soha nem jelennek meg** (hibás `softDelete` flag).
3. **Beállítások: minden kapcsoló csak localStorage-ba megy**, és soha senki nem olvassa vissza.
4. **Leltár RLS szűkebb, mint az app-hatókör** → könyvelőnek/számvevőnek/kerületi adminnak néma üres lista.
5. **`igehirdetesi_terv` RLS a skalár helperre épül** → profilváltó lelkésznél néma üres lista.

---

## 1. Pontonkénti állapot

Jelölés: ✅ kész · 🟡 részben · ⛔ blokkoló hiba · 📐 tervezendő

### 1. pont — Lelkipásztori profil ⛔ · ráfordítás: L

| Megállapítás | Súly |
|---|---|
| A `pastor_service_history` tábla **létezik, RLS-sel együtt**, a welcome-varázsló **ír is bele** — de az **egész repóban senki nem olvassa**. Ezért áll „Még nincs rögzítve". | ⛔ |
| A szolgálati hely **sehol nincs a gyülekezethez kötve** — mindkét tároló szabad szöveg, nincs `congregation_id` FK. | ⛔ |
| A `profiles.congregation_id` **helyben íródik felül** (`admin_activate_user`) — nincs előzmény-sor, nincs mezőszintű audit. | ⛔ |
| Az e-mail a hero `overflow-hidden` konténerében **levágódik** (nincs `break-words`/`min-w-0`). A fejlécben `truncate`, mobilon egyáltalán nem látszik. | 🔴 |
| A profil mentése **felülírja** a varázsló szolgálati előzményét → két divergáló tároló. | 🔴 |
| Áthelyezéskor a lelkész **nem kap értesítést**, pedig az `ertesitesek` mechanizmus él. | 🔴 |
| A `/profile` **oldal** és a profil **dialógus** széthúz — az oldal a `pastor_profiles`-t nem is ismeri, minden új mező kétszer építendő. | 🟠 |

**Teendő:** új, gyülekezethez kötött szolgálati-hely napló (`congregation_id` FK + `-tól/-ig`),
trigger/audit a `congregation_id` változására, értesítés áthelyezéskor, a `pastor_service_history`
bekötése olvasásra + szerkesztésre, e-mail sortörés.

### 2. és 5. pont — Beállítások + Gyülekezet beállítása ⛔ · L

| Megállapítás | Súly |
|---|---|
| **A teljes Beállítások ablak halott**: minden kapcsoló `localStorage`-ba megy, és soha nem olvassa vissza senki. Nincs `user_preferences` tábla. | 🔴 |
| A „Gyülekezetünk adatai" **szerkesztő ága elérhetetlen** → az `updateCongregation` server action halott kód. | 🔴 |
| Az **Egyéb díjak** panel write-only: a `congregation_custom_fees` táblát semmi nem olvassa a saját CRUD-ján kívül. | 🔴 |
| A varázsló bankszámla-mentése **fixen `aktiv:true`** → a deaktivált számla minden mentéskor némán újraaktiválódik. | 🔴 |
| A setup-mentés jogosultsága a **legacy `profiles.congregation_id`**-t nézi, nem az `effectiveCongregationId`-t → **roles-first lelkész nem tudja menteni a saját gyülekezetét**. | 🔴 |
| „Kijelentkezés minden eszközön" → csak `toast.info('hamarosan')`. Betűméret-választó → nincs fogyasztója. Nyelvválasztó → nincs i18n. | 🟠 |
| ℹ️ A `congregations` SELECT policy **`USING(true)`**: adószám, IBAN, e-mail, telefon **minden gyülekezetről anonim módon olvasható**. | 🔴 |

### 3. pont — Desktop paritás 🟡 · XL

Teljes paritás-mátrix elkészült. A desktop **9 route-on részleges**, **14 route-on hiányzik**.

- **Pénzügy** a legjobb (9 kész fül), de **két, eltérő adatmodellű tétel-rögzítőt** kínál, és a **menü a legacy-t nyitja**.
- **Anyakönyv, leltár, iktató, jegyzőkönyvek, sírhelyek, éves jelentés: READ-ONLY** pillanatkép 2026-04-25 óta.
- **Nincs desktopon:** kuka, profil, admin (+17 aloldal), értesítések, támogatás, publikus oldal, egyházmegyei/kerületi nézet.
- **A desktop hatóköre a `profiles.role` skalárból** származik, nem a `profile_roles`-ból → nincs fail-closed őrszem.
- A `@kartoteka/offline-sync` **csontváz maradt** — két teljes, párhuzamos sync-motor él.
- Az M6.7 tiltott-import őr **lyukas**: a desktop által bundle-elt `@kartoteka/ui-app` maga importál Dexie-t.

### 4. pont — „Gyülekezetünk adatai" 🟡 · M

| Megállapítás | Súly |
|---|---|
| A 7 kártya **akcentusa élesben egyforma** — a színkódolás némán megsemmisül. | 🔴 |
| **Sötét módban minden kártyafejléc világos pasztell sáv marad, világos szöveggel → olvashatatlan.** | 🔴 |
| **Nincs másolás és nincs megosztás** — pedig a megosztható publikus link már be van töltve a szülőben, csak nem jut el a komponensig. | 🔴 |
| **Mobilon a hosszú, szóköz nélküli értékek (IBAN, adószám) kilógnak és levágódnak.** | 🔴 |
| „Bejegyzési szám" sor **soha nem jelenik meg**; az „Egyházkerület" a legacy szövegoszlopból jön → mindenkinél a default látszik. | 🟠 |
| A komponens **0 db design-tokent** használ. Kész minta viszont van: Web Share (`birthday-card-dialog.tsx`), `printToPdf`. | ℹ️ |

### 6. pont — Kuka ⛔⛔⛔ · L

**Három egymástól független blokkoló:**

1. **Az oldal minden betöltésnél kivétellel elszáll** — függvény-prop megy Server Componentből Client Componentbe.
2. **A ténylegesen törölt modulok (pénzügy, munkanapló, leltár) SOHA nem jelennek meg** — hibás `softDelete` flag.
3. **A „Végleges törlés" és a „Kuka ürítése" nem töröl véglegesen** — a rekord a következő szinkronnal **visszajön** (a push nem tud igazi hard delete-et).

További: nincs `deleted_at` oszlop **egyetlen** soft-delete táblán sem (a 30 napos visszaszámláló
az `updated_at`-ból hamisítva); nincs szerver-oldali visszaállító RPC (a Kuka csak azt látja, ami
éppen a böngésző IndexedDB-jében van); a `purge_recycle_bin()` csak 7 registry-táblát ismer.

> **Ezt Ön is jelezte, hogy át kell beszélnünk** — a *miért nem működik* fentebb megvan;
> a *milyen legyen* kérdésre a javaslatom a 2. szakaszban.

### 7. pont — Oblio ZIP + gyülekezeti Drive ⛔ · XL · 📐

| Megállapítás | Súly |
|---|---|
| **A Drive-integráció globális szingleton** (master admin + globális `backup_settings id=1`) — gyülekezeti Drive-terület **nem létezik**. | ⛔ |
| A **`drive.file` hatókör** miatt a gyülekezet **meglévő** Drive-mappájába nem tudunk dolgozni. | ⛔ |
| **Nincs szerveroldali ZIP/UBL feldolgozó lánc** — a parser böngésző-only (`DOMParser` nélkül kilép). | ⛔ |
| **A „kifizetetlen számla" fogalomnak nincs adatalapja** — nincs tábla, ami befogadott szállítói számlát kiadás nélkül tárolna. | ⛔ |
| Egy számla **csak EGY kiadáshoz** köthető (`UNIQUE (congregation_id, anaf_uuid)`) — a kért **szétosztás strukturálisan lehetetlen**. | 🔴 |
| A webes mappa a gyülekezet **nevéből** slugolódik, nem az azonosítójából → **átnevezés = néma fájlvesztés**. | 🔴 |
| A 2026-07-10-i hibrid terv **egyetlen eleme sem épült meg**. | 🟠 |

**Kutatási eredmények, amelyek a tervet alakítják** (részletek a kutatási jegyzetben):
- Az Oblio API `/docs/invoice/list` végpontjának **`collected=0`** paramétere **hitelesen adja a kifizetetlen számlákat** — nem kell heurisztika.
- Az **ANAF SPV csak 60 napig őrzi** a számlákat, a törvény viszont **5–10 év** megőrzést ír elő → a gyülekezeti archívum **jogszabályi megfelelés**, nem kényelem.
- **Javaslat:** az adapter elsődleges bemenete az **e-Factura XML (UBL 2.1 / RO_CIUS)** legyen, ne a szolgáltató saját formátuma — ezt törvény írja elő *minden* szolgáltatónak, így a későbbi szolgáltatók (SmartBill, Facturis, FGO) lényegében ingyen jönnek.
- Tisztázandó **döntés**: ki köti össze a gyülekezeti Drive-ot (lelkész / gondnok / könyvelő), és mi történik a tokennel lelkészváltáskor.

### 8. pont — Kétlépcsős belépés ⛔ · L · 📐

| Megállapítás | Súly |
|---|---|
| **A jogi nyilatkozat HAZUDIK: azt állítja, van 2FA — de nincs.** Semmilyen MFA-kód nincs a repóban. | ⛔ |
| A **system és a kerületi admin második faktor nélkül lép be bármely gyülekezetbe 2 órára**. | 🔴 |
| **A god-mode PIN PLAINTEXT-ben van az adatbázisban**, és az összevetés nem timing-safe. A default PIN **benne van egy migration-fájlban**. | 🔴 |
| A fő rendszergazda azonosítása **puszta e-mail-string egyezés**. | 🔴 |
| Az `audit_log` **`ip` és `user_agent` oszlopa soha nem töltődik** — a felület mégis mutatja. **A sikertelen bejelentkezés és a kijelentkezés soha nem kerül naplóba.** | 🟠 |
| Az `/admin/rendszer` „biztonsági felület" valójában **egyetlen PIN-mező**. | 🟠 |
| Nincs alkalmazás-szintű **login rate-limit** (a god-mode PIN-nek van, a bejelentkezésnek nincs). | 🟠 |

**Ajánlás:** a **Supabase natív TOTP MFA** (ingyenes, alapból bekapcsolt). Bevezetés **opt-in RLS-policyval**,
`as restrictive`, `aal2` ellenőrzéssel. ⚠️ Két csapda: az `unenroll` **csak a refresh-intervallum után**
fokoz le; és a desktop login **nem kezel challenge-et**, tehát az első enrollolt faktor után
a desktop belépés **némán elbukna** — ezt a desktop-flow-val együtt kell szállítani.
Recovery-kód infrastruktúra **nincs**, a Supabase TOTP nem ad — ez önkéntes, idős felhasználókat is
kiszolgáló rendszerben a legvalószínűbb üzemzavar, tervezni kell rá.

### 9. pont — Sötét mód + mobil ⛔ · XL

| Megállapítás | Súly |
|---|---|
| **A 9 fő modul fülsora (ColorTabs) sötét módban olvashatatlan** — az aktív fül majdnem fehér pirula, világos szöveggel. | ⛔ |
| A `.dark` kompatibilitási blokk **hardkódolt teal rgba-kat** használ tokenek helyett → a témaválasztás sötétben részben hatástalan. | ⛔ |
| **589 komponensből 82 ismer `dark:` variánst; 268 fájlban van hardkódolt szín NULLA `dark:` párral.** Összesen ~11 549 hardkódolt paletta-osztály. | 🔴 |
| A globális `.dark{…!important}` **átszivárog a szándékosan mindig világos felületekre** (Missziós Műhely, publikus oldal). | 🔴 |
| **Az irányítópult diagramjai** (az első képernyő) sötétben nem követik a témát — Recharts inline stílus, CSS-sel nem javítható. | 🔴 |
| **A shell gyökere `h-screen`** → telefonon a lap alja a böngésző-címsáv alá kerül és nem görgethető oda. **100 dialógus `vh`-val írja felül a `dvh`-alapot** → a Mentés gomb a képernyő alá kerülhet. | 🔴 |
| **905 helyen 9–11px-es szöveg**; a Beállítások **„Betűméret" vezérlője HALOTT** — az 55+ éves, telefonon dolgozó célközönségnek ez a legfontosabb hiányzó kapcsoló. | 🔴 |
| 12 fájlban `<table>` vízszintes görgető-konténer nélkül. Téma-villanás (FOUC) minden betöltéskor. | 🟠 |

### 10–12. pont — Leltár ⛔ · L

| Megállapítás | Súly |
|---|---|
| **A leltár olvasója nem lapoz — néma 1000 soros PostgREST-plafon az EGÉSZ modulon.** | ⛔ |
| **RLS-hatókör szűkebb, mint az app-hatókör** → néma ÜRES lista könyvelőnek, számvevőnek, kerületi adminnak. | 🔴 |
| **A törlés nem írja a kivezetési adatokat** (`torles_datuma`/`_bizonylat`/`_indoklasa`) → a hivatalos „Leltárból törölt tárgyak" nyomtatvány **januártól kiürül**. | 🔴 |
| **8 létező oszlopot a webes UI soha nem tud kitölteni** (könyv-metaadatok, felelős személy) → a könyv-kategória fisája üres marad. | 🔴 |
| **11. pont:** a fisa **kétnyelvű, de nincs nyelvválasztás**, és a román szöveg **elavult helyesírású**. A `getInventoryCategoryRomanianLabel` **halott kód**. **A projektben nincs i18n-infrastruktúra**, csak egy hazudós placeholder-kapcsoló. | 🔴 |
| **12. pont:** a kategória-szűrő **legördülő, nem gombsáv**, és **nincs darabszám sehol**; az „Új tétel" gomb **a négy egyforma outline-gomb egyike**. | 🟠 |

**A 11. ponthoz — jó hír a kutatásból:** az **OMFP 2634/2015 eltörölte a merev nyomtatványmintákat**,
csak *kötelező minimális tartalmat* ír elő. A `Fişa mijlocului fix` (cod **14-2-2**) tehát
**szabadon tervezhető szépre és kétnyelvűre**, amíg a kötelező mezők megvannak — ezeket a hivatalos
normából kigyűjtöttem (román↔magyar párokkal) a kutatási jegyzetbe.
⚠️ **Alapeszköz-küszöb: 2 500 lej** (2026-01-01) — ez köti a leltárt a lelkészi jelentés VIII.3. sorához,
és **konfigurálhatónak** kell lennie, mert a kormány emelheti.

### 13. pont — Pénzügy készpénz (Kassza) 🟡 · M

| Megállapítás | Súly |
|---|---|
| **A rögzítő gomb nem a Kassza fülön van**, hanem a fül feletti hero-sávban („Tétel rögzítése") — a Kassza fülnek **egyáltalán nincs saját rögzítő gombja**. | 🔴 |
| **Az új sor alapértelmezett dátuma MA, nem a nézett pénzügyi év** → a mentett tétel **eltűnhet a listáról**. | 🔴 |
| A dátum szerinti rendezés **működik**, de **csökkenő** (legújabb elöl) — a hivatalos pénztárnapló kronologikus. *(terméki döntés kell)* | 🟠 |
| A mentés után **semmi nem jelzi, hol landolt** az új tétel (nincs highlight, nincs fülváltás, nincs scroll-to). | 🟠 |
| A „bevétel ÉS kiadás párhuzamosan" biztatás **létezik, de halkan és csak a modálon belül**. | 🟠 |
| **A pénzügy modulban nulla igevers / lelki tartalom van.** A `/api/daily-verse` 31 általános igét tartalmaz (a kommentje 366-ot ígér); **nincs pénzügyi/sáfársági igekészlet**. | ℹ️ |
| ⚠️ A `CashbookTab` és a `CombinedEntryBody` **megosztott** a desktoppal — minden itteni változás **a desktopot is elmozdítja** (slot-prop minta kell). | ⚠️ |

### 14–17. pont — Nyomtatási központ ✅🟡 · L

**✅ ELVÉGEZVE (2026-08-14, `9498ccf`):**
- **17. pont** — a görgetés visszaáll dokumentumváltáskor.
- **14. pont (részben)** — a „Belső használatra…" felirat törölve (borító + sáv); az **üres részek megszűntek**.
  Kiderült, hogy a 14. és a 17. pont **ugyanabból a gyökérokból** fakadt: az előnézet-magasság
  „racsnizott" (a mért érték sosem lehetett kisebb az aktuálisnál), ezért a doboz csak nőhetett.
- **15. pont** — a csoportnapló **valódi lapokra bomlik**, ismétlődő fejléccel, „folytatás" jelzéssel,
  árva-fejléc védelemmel és valódi „pg. N / M" oldalszámmal (a korábbi CSS Paged Media megoldást
  egyetlen böngésző sem támogatja). **Új önellenőrzés:** `scripts/selftest-csoportnaplo.mjs` (C1–C10).

**🟡 HÁTRA (14. pont):** az előnézet **mobil-reszponzivitása** — nincs zoom, nincs
„teljes oldal / teljes szélesség" kapcsoló, nincs lapléptetés többoldalas dokumentumnál.

**⛔ HÁTRA (16. pont) — romániai szabvány:**

| Megállapítás | Súly |
|---|---|
| **A fekvő nyomtatványok PDF-je nem egyezik az előnézettel**: a raszterizáló iframe **fixen 210mm×297mm (álló)**, tájolástól függetlenül — az ÖSSZES fekvő register (Registru Casa/Banca, Registrul-Jurnal, Nyugtatömb, Csoportnapló) álló viewportban renderelődik. | 🔴 |
| A `reporting.ts` **teljes diakritika-hiány** + **magyar szám- és dátumformátum a hivatalos ROMÁN registereken**. Két builder-fájl **két konvenciót** visz. | 🟠 |
| `Registru Casă`: a norma szerint **naponta** kell vezetni és **napi záró egyenleget** megállapítani — a havi zárás és a hiányzó `Casier` aláírás ellenőrizendő. | 🟠 |
| `Registrul-Jurnal`: a **nyitó egyenleg a FORGALMI oszlopba** kerül. | 🟠 |
| A `buildFinancePrintDocument` a `kiadasi_kiseroiv` típusra **némán Registru Casát ad**. | 🟠 |
| A folyó év és a múlt év **nem ugyanabból a forrásból** dolgozik. | 🟠 |

### 18. pont — Munkanapló + lelkészi jelentés ⛔ · XL · 📐

**A legnagyobb tétel.** Van már működő alap (122 mezős, nyomtatható lelkészi jelentés,
erős védelmi mintákkal), de **a régi űrlapra épül**.

| Megállapítás | Súly |
|---|---|
| **A `De.2` / `Du.2` szabály nincs megvalósítva** → a templomlátogatási átlag **ÁTLAGOL, ahol ÖSSZEADNI kellene**. A súgó példája: 300 helyett 150. | ⛔ |
| **A mező-azonosítók jsonb-kulcsok** (`kezi_adatok`, `felulirasok`, véglegesítési snapshot) → **a katalógus átszámozása adatvesztés**. Csak append-only bővítés lehetséges. | ⛔ |
| A mai enumeráció **31 érték**, a hivatalos EREK lista **37 + 11 + 2 = 50**. | 🔴 |
| **KÉT párhuzamos „éves jelentés" él** a kódban, más adatmodellel, más számokkal (`lelkeszi_jelentes` I–X. · `annual_reports` 10 szekció · `reporting.ts buildEvesJelentes`). | 🔴 |
| A **vallásóra-átlag szabálya** (nevező = a `Vallásóra 1. csoport` alkalmainak száma) **nincs meg**. | 🔴 |
| **Többéves összehasonlítás létezik — de egy másik modulban.** A lelkészi jelentés csak az **előző** évet ismeri. | 🔴 |
| **Katekézis és családlátogatás: nincs külön nyilvántartás** — kategória-címkeként élnek a munkanaplóban. | 🔴 |
| Az offline/desktop tükör **nem szinkronizálja** a `napszak` / `uv_templomban` / `uv_betegnel` oszlopokat. | 🔴 |
| Az esperes a beküldött jelentést **nyers JSON-ként** látja. | 🟠 |
| A **IV. / VI. / VIII. fejezet** ma 4+2+2 szabadszöveges mezővel él — a hivatalos új űrlapon **~25 / 5 blokk / 5 blokk** konkrét mezőkkel és összegekkel. | 🔴 |
| A **VII. fejezet** ma aggregált kódokból számol, nem a számadás **megnevezett soraiból** (1., 5., 7., 52., 112., 116., 128.). | 🔴 |
| ℹ️ **Recharts 3.8.1 megvan** a projektben — de a munkanapló/jelentés **egyetlen grafikont sem** használ. | ℹ️ |
| ℹ️ **A következtetés-motor KÉSZ**: `lib/annual-report/conclusions.ts`, 12 kategória, rövid/hosszú táv, `basis` + `dataQuality`, min. 3 év a trendhez — csak nincs bekötve a lelkészi jelentésbe. | ℹ️ |

### Kereszt-metsző: adatbázis-állapot ⛔

| Megállapítás | Súly |
|---|---|
| **A `2026-08-13-changelog-jelolesek-besorolas.sql` majdnem biztosan nem futott — és amíg nem fut, a napi mentés NEM indul el.** | ⛔ |
| **Nincs `supabase/migrations/`** — a migrációkezelés teljes egészében kézi; nincs `config.toml`, nincs `seed.sql`. | 🔴 |
| A `_RUN_LOG.md` **elavult** (70 SQL fájlról nem tud), és a **PENDING-jelölései részben bizonyíthatóan elavultak** — a napló **önmaga is félrevezet**. | 🔴 |
| A séma-dump (`Database_schema.sql`) **~70 táblával le van maradva**. A `packages/schema-types` **üres placeholder** — ~150 tábla, nulla generált típus. | 🔴 |
| 405 SQL fájlból 100 állít RLS policyt; **nincs gépi bizonyíték egyetlen migráció lefutásáról**. | 🔴 |

---

## 2. Javasolt sorrend

A 18 pont együtt **több hónap**. A sorrend elve: **előbb a hazugságok és a néma adatvesztés,
utána a napi bosszúság, végül a nagy építkezés.**

### 0. hullám — azonnal, felhasználói teendő
- [ ] **A mentés-blokkoló SQL lefuttatása** (`2026-08-13-changelog-jelolesek-besorolas.sql`).

### 1. hullám — „ne hazudjon a rendszer" (⛔ blokkolók)
1. **Kuka (6.)** — a három blokkoló javítása + `deleted_at` oszlop + szerver-oldali visszaállító/hard-delete RPC.
2. **Leltár lapozás (10.)** — a néma 1000 soros plafon megszüntetése + RLS-hatókör felzárkóztatása.
3. **2FA jogi nyilatkozat (8.)** — vagy a nyilatkozat javítása, vagy a 2FA szállítása; a mai állapot vállalhatatlan.
4. **Sötét mód ColorTabs + `dvh` (9.)** — a két blokkoló, amitől a rendszer telefonon és sötétben használhatatlan.

### 2. hullám — a kért napi javítások (kis-közepes, nagy hatás)
5. **Profil e-mail + szolgálati napló (1.)**
6. **Gyülekezetünk adatai redesign + másolás/megosztás (4.)**
7. **Leltár oldal: kategória-gombok + kiemelt gomb (12.)**
8. **Készpénz: kiemelt gomb + igevers + dátum-védelem (13.)**
9. **Nyomtatási előnézet mobil-reszponzivitás (14. maradék)**
10. **Leltári fisa RO/HU (11.)**

### 3. hullám — adatlánc-tisztítás
11. **Beállítások + Gyülekezet beállítása (2., 5.)** — `user_preferences` tábla, halott ágak kivezetése, RLS-lyukak.
12. **Nyomtatványok romániai szabványosítása (16.)** — fekvő PDF-útvonal, egységes román lokalizáció.

### 4. hullám — nagy építkezés
13. **Munkanapló + lelkészi jelentés (18.)** — a taxonómia-migrációval kezdve (minden más arra épül).
14. **Oblio ZIP + gyülekezeti Drive (7.)** — UBL-adapter alapon.
15. **Desktop paritás (3.)** — a `@kartoteka/offline-sync` kitöltésével.

---

## 3. Nyitott döntések (az Öné)

1. **Kuka:** mi kerüljön bele? Ma 7 registry-tábla + (hibásan) a pénzügy/munkanapló/leltár.
   A `szemely` táblának **nincs** `deleted` oszlopa (a kivezetést az `isvisible` hordozza) —
   a személyek felvétele **külön szemantikai döntés**, nem flag-átbillentés.
   Továbbá: a 30 napos megőrzés valódi `deleted_at`-ra épüljön (ehhez oszlop kell minden érintett táblán).
2. **Kassza rendezési irány:** maradjon a mai csökkenő (legújabb elöl), vagy váltson
   kronologikusra, ahogy a hivatalos pénztárnapló?
3. **Gyülekezeti Drive:** ki köti össze (lelkész / gondnok / könyvelő), és mi történjen
   a tokennel lelkészváltáskor?
4. **2FA bevezetés:** kötelező mindenkinek, csak új felhasználóknak, vagy opt-in?
   (Az opt-in a javaslatom — de a desktop-flow-t vele együtt kell szállítani, különben
   az első enrollolt faktor után a desktop belépés némán elbukik.)
