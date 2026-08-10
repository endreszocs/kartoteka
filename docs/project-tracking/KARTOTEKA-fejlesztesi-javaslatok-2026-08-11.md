# KARTOTÉKA — fejlesztési javaslatok az 5. diagnosztikai körből

**Dátum:** 2026-08-11 · **Forrás:** 5. kör, 5 párhuzamos audit-ágens · **Tételszám:** 35

---

## Mit tartasz a kezedben

Ez nem hibalista. A hibákat (P0–P3) a kör már javította — ez a 35 tétel az, amit az ágensek
**a javítás közben** észrevettek: hol tud ugyanaz a hiba **újra** bejönni.

A dokumentum döntési segédlet: azt segít eldönteni, mire menjen a következő 2-3 hétvégéd.
Nem kell mind a 35-öt megcsinálnod. Nem is kellene.

### Az egy mondat, amit érdemes elvinni

> **A 35 tételből kb. 30 ugyanarra a négy hibafajtára vezethető vissza, és a rendszer ma
> semmilyen automatikus módon nem tudja megakadályozni, hogy visszatérjenek — ezért nem a 30 tétel
> lejavítása a legjobb befektetés, hanem három kapu felállítása, ami után a 30 nagy része
> egyszerűen nem tud újra bejönni.**

A négy visszatérő hibafajta — mind a négy **többször** megharapta már ezt a projektet:

| # | Hibafajta | Mit jelent a gyülekezetben |
|---|---|---|
| 1 | **Néma hibaelnyelés** | A lekérdezés hibázik, a kód nullát/üres listát ad vissza, a felület pedig azt mutatja: „nincs adat". Senki nem tudja, hogy hiba történt. |
| 2 | **Lapozatlan olvasás** | 1000 sor fölött a szerver némán levágja a választ. Egy 1200 tagú gyülekezetnél 200 tag egyszerűen nem jelenik meg — se hibaüzenet, se jelzés. |
| 3 | **Hatókör-széthúzás** | A „melyik gyülekezet adatát látod" kérdésre két helyen két különböző válasz születik. Rossz esetben más gyülekezet adata jelenik meg. |
| 4 | **A második felület a régi kódot őrzi** | A webben javítod, a desktopon (vagy egy másik dialógusban) marad a régi, hibás változat. |

---

## ✅ Ami ebből a listából MÁR ELKÉSZÜLT — ne tedd vissza a backlogba

A kör P1/P2/P3 javításai közben hat javaslat egészben vagy nagyrészt megvalósult.
Ellenőriztem a kódban, nem a jelentésekre hagyatkoztam.

| Tétel | Állapot | Mi készült el, mi maradt |
|---|---|---|
| **#16** Lapozó-szabály egységesítése | 🟢 **Nagyrészt kész** | Egyetlen közös lapozó helper létrejött, és kb. 20 webes fájl átállt rá. Ráadásul egy súlyosabb hiba is kiderült közben: több ciklus fix léptékkel haladt, ami nem csak *levágta*, hanem **kihagyta** a lista közepét. **Maradt:** az ESLint-kapu, és a `packages/core` + desktop saját ciklusai (`packages/supabase-client/src/select-all-paged.ts`, `apps/desktop/src/lib/sync.ts:55`, `packages/core/src/finance/befizetes/list.ts:40`) |
| **#6** Kötelező lapozás + kikényszerített rendezés | 🟢 **Nagyrészt kész** | A rendezést most már maga a helper húzza rá, a hívó nem tudja elrontani. A felsorolt lapozatlan lekérdezések javítva: TVA-plafon, éves jelentés kazuáliái, `getMembers`, offline pull. **Maradt egy:** a leltári lista még mindig lapozatlan `select('*')` (`apps/web/app/(dashboard)/leltar/actions.ts:66`) |
| **#19** „Nem mentett adat" őr a dialógusokhoz | 🟡 **Fele kész** | A háttérre koppintás **többé nem zárja be** egyetlen dialógust sem — ez volt a néma adatvesztés fő forrása telefonon. **Maradt:** a `useDirtyGuard` + Esc-re megerősítés + `beforeunload` (`packages/ui/src/components/dialog.tsx:11`) |
| **#21** Kontraszt-ellenőrzés | 🟡 **Fele kész** | Az összes „Első rögzítés" CTA-gomb 600-ról 700-as árnyalatra váltott (amber 3,19:1 → 5,05:1), a lenyíló menük és a select AA-bukása javítva. **Maradt:** a build-idejű, automatikus kontraszt-mérő script (`apps/web/components/ui/empty-first-record.tsx:30`) |
| **#15** Bundle- és precache-méret kapu | 🟡 **Fele kész** | A 70 MB-os precache-manifest kikerült: kurált lista maradt, ~2 MB. Az iOS-en emiatt néma offline-kiesés megszűnt. **Maradt:** maga a *mérő* script, ami a visszacsúszást elkapná (`apps/web/next.config.ts:20`) |
| **#11** Escape-elt ilike | 🟡 **Nagyrészt kész** | Négy azonosító-kereső megkapta a jokerkarakter-escape-et. **Maradt:** a közös helper kiemelése, és két hívó (`apps/web/app/(setup)/welcome/actions.ts:387`, `apps/web/app/(dashboard)/admin/access-requests-actions.ts:173`) |

Ezen felül: a **#4**-ben említett halott `inventory.ts` már törölve (a nagytakarítás vitte),
a P3 által kifogásolt három halott `income-dialog*.tsx` szintén.

---

## 🎯 Ha csak hármat választasz

Sorrendben, indoklással. Mind a három **kapu**, nem javítás — vagyis nem egy hibát old meg,
hanem megakadályozza, hogy a hibafajta újra bejöjjön.

### 1. #27 — Első CI-workflow (`.github/workflows/ci.yml`)

**Mit előz meg:** azt, hogy a már megírt ellenőrzők tovább aludjanak. Ma három kész,
működő ellenőrző script hever a repóban (`audit-safety.mjs`, `check-desktop-banned-imports.mjs`,
négy selftest) — és egyiket sem futtatja senki automatikusan. A `npm run lint` **197 hibával
áll el**, amiből 182 a magyar idézőjel („…") miatti álhiba. Vagyis a lint gyakorlatilag ki van
kapcsolva a fejlesztői reflexben — és vele együtt elveszik az a **13 valódi React-hiba** is,
ami a zajban ül.

**Mennyi munka:** **S** — egy szombat délelőtt. Két lépés: (a) a `react/no-unescaped-entities`
szabály kikapcsolása (magyar szövegű UI-nál értelmetlen), majd a maradék ~15 valódi hiba
javítása; (b) egy 30 soros YAML, ami `npm ci` → `lint` → `tsc --noEmit` → selftestek →
`audit:safety` sorrendben fut.

**Mibe kerül halogatni:** minden további kapu, amit megírsz (a 2. és 3. pont is), **dekoratív
marad**. Egy ESLint-szabály, ami nem fut, nem szabály — jó szándék.

**Fájlok:** nincs `.github/` könyvtár · `apps/web/eslint.config.mjs` (ma 28 sor) ·
`apps/web/package.json` (nincs `typecheck` script)

---

### 2. #24 + #20 — Három ESLint-kapu a három visszatérő hibafajtára

**Mit előz meg:** az 1., 2. és 3. hibafajtát — **strukturálisan**, nem fegyelemmel.
Három szabály:

1. **Tilos `const { data } = await supabase…`** — az `error`-t kötelező kibontani.
   Ma 44 helyen nincs kibontva az `app` + `lib` fában. Ez az a hiba, amitől az esperes
   „nincs beküldött dokumentum"-ot lát, miközben valójában a lekérdezés hibázott.
2. **Tilos a nyers `.range(` ciklus** a közös helperen kívül. Ez az 1000-soros néma
   csonkolás — a kör most 15 ilyen ciklust javított, és talált kettőt, ami nem csak
   csonkolt, hanem **kihagyta a lista közepét**.
3. **`'use server'` fájlban tilos `supabase.from(` a hatókör-helper hívása előtt.**
   Ez a „skalár hatókör + `if (id) filter`" osztály, ami már szerepel a projekt-memóriában
   mint hibaosztály — és ebben a körben is szállított egy P0-t.

Mellé egy `mustAffectRows()` segédfüggvény (**#20**): ma egy `update().eq()`, ami **nulla sort
talál**, hibamentesen „sikeres" — a lelkész „Mentve" visszajelzést lát, és semmi nem mentődött.

**Mennyi munka:** **M** — egy teljes hétvége, de **kevesebb, mint amennyinek a javaslat írásakor
látszott**: a közös lapozó helper (#16) már elkészült, tehát a 2. szabály célja már létezik,
csak ki kell kényszeríteni. A `scripts/check-desktop-banned-imports.mjs` bevált precedens arra,
hogy ehhez nem kell AST-elemző, egy egyszerű node-script is elég.

**Mibe kerül halogatni:** ez a három szabály **az elmúlt 5 diagnosztikai kör hibáinak
többségét visszamenőleg kifogta volna**. Amíg nincs meg, minden kör újratermeli őket — és
a 6. kör ugyanezt a listát fogja megírni, más fájlnevekkel.

**Fájlok:** új `packages/core/src/db/query.ts` vagy a meglévő
`packages/supabase-client/src/select-all-paged.ts` bővítése · `apps/web/eslint.config.mjs` ·
példák: `apps/web/app/(dashboard)/sirhelyek/actions.ts:29`, `apps/web/lib/auth/finance-scope.ts:194`

---

### 3. #26 — Vitest + arany-tesztek a pénzre, a sorszámozásra, a hatókörre

**Mit előz meg:** azt, hogy a **pénzügyi matek** és a **hivatalos sorszámok** csendben
elromoljanak. Két konkrét, megtörtént eset:

- A járulék-motor kódjában a saját kommented dokumentál egy regressziót: *„a `kor` ág korábban
  a százalékot is fizetendőként értelmezte… Az űrlap 50%-os alapértéke elrejtette."* Ez azt
  jelenti, hogy tagoknak **rossz járulékösszeget** mutatott a rendszer, és nem lehetett látni.
  Egy háromsoros teszt ezt örökre kizárja.
- A nyugtaszám-P0 **kétszer** jött vissza (2026-07-25 F6.1, majd most a desktop-ágon). Egy
  hivatalos, hézagmentesnek előírt sorozatban a duplikált szám könyvelői probléma, nem
  kényelmi kérdés.

**Mennyi munka:** **M** — egy hétvége, és a fele már megvan: **négy teszt már meg van írva**
(`scripts/selftest-biblia.mjs`, `-enekeskonyv`, `-print-columns`, `-worklog-stats`, összesen 645 sor),
csak nincs futtatójuk, ezért kézzel transpile-álnak temp könyvtárba. A vitest bekötése után
ez a hack eltűnik. A tesztelendő függvények **mind tiszta függvények** — nem kell hozzájuk
adatbázis.

**Mibe kerül halogatni:** minden pénzügyi finomhangolás vakon történik. Ma nincs semmi, ami
megmondaná, hogy a járulék-számítás módosítása nem rontott-e el egy másik ágat.

**Fájlok:** `vitest.config.ts` a gyökérben · `packages/ui-app/src/finance/jarulek-calculation.ts`
(701 sor) · `packages/ui-app/src/finance/rental-calculation.ts` · `apps/web/lib/inventory/reporting.ts:239` ·
`apps/web/lib/auth/admin-scope.ts` (`getAdminDistrictScope` — üres lista = semmit nem lát)

---

### Miért ez a sorrend

A #27 azért első, mert **a legolcsóbb és mindent megsokszoroz**: egy délelőtt, és utána
minden további kapu tényleg köt. A #24 azért második, mert **a legtöbb hibafajtát zárja le
egyszerre**, és mert a kör munkája után már fele áron megvan. A #26 azért harmadik, mert
**a legdrágább hibákat** (pénz, hivatalos szám) védi, de reaktívan: a teszt azt fogja meg,
amire gondoltál, a lint-szabály azt is, amire nem.

### A negyedik, ami majdnem befért: #25 — generált Supabase-típusok + séma-drift CI

Ez az **egyetlen legnagyobb hibaosztály-lezárás** az egész repóban: ma a
`packages/supabase-client/src/types.ts` tartalma `export type Database = unknown`, tehát
**1628 db `.from()` hívás és minden `select('…')` sztring típusellenőrzés nélkül fut**.
Ennek az ára már látszik: 8 külön `isMissingColumnError` helper és „canonical / modernFallback /
minimalFallback" hármas insert-próbálkozás, mert senki nem tudja biztosan, milyen oszlopok
vannak élesben. A memóriádban szerepel is ez hibaosztályként („⚠️ szemely: NINCS elkoltozott oszlop
— rossz select → némán ÜRES lista").

Azért csúszott a negyedik helyre, mert **valódi beüzemelési súrlódása van**: Supabase CLI
összekötése az éles projekttel, `supabase gen types`, séma-dump script, majd CI-lépés. Ez nem
kódírás, hanem infrastruktúra — és a projektben ma minden SQL kézzel fut. Ha egy hétvégén
sikerül összekötni a CLI-t, utána viszont **három-négy másik javaslat magától elhal**
(#4 fallback-ágai, a 8 helper, a séma-dump elavulása — a `Database_schema.sql` utolsó
commitja 2026-07-10).

---

## 📋 A többi tétel, témák szerint

Csoportokon belül érték/ráfordítás szerint rendezve. A ✅/🟡 jelzésűeket a kör már elintézte
vagy megkezdte — azokat nem kell újra tervezned.

### 🔒 Kapuk és hibaosztály-lezárás

| | Tétel | Munka |
|---|---|---|
| **#20** | **Néma Supabase-hibák lint-szabálya + `mustAffectRows()`.** Ma egy „Mentve" visszajelzés nem jelenti azt, hogy bármi mentődött: az `update().eq()` nulla találattal is sikeresnek látszik. A sírhely-modul négy törlője ugyanebbe esett. → *Vidd be a #24-be, egy munkának számít.* (`apps/web/app/(dashboard)/sirhelyek/actions.ts:29`) | **M** |
| **#13** | **Gazdátlan, de exportált server action-ök kigyomlálása.** Négy admin-lekérdező akadt, aminek **nulla hívója van, de élő POST-végpontként fut** — a Next.js minden `'use server'` exportnak ad action-azonosítót, importtól függetlenül. Ezek a pre-#2, pre-kerületi-hatókör világot tükrözik, tehát a legrégebbi jogosultsági logikát viszik tovább. A nagytakarítás után is maradt legalább egy ilyen (`useUnseenCrossCongregationCount` — a hívója törlődött). (`apps/web/app/(dashboard)/admin/actions.ts:515,528,545`) | **S** |
| **#1** | **Árva-modul kapu a CI-be.** Ez a kör ~12 000 sornyi elérhetetlen kódot talált, és a meglévő `audit-safety.mjs` heurisztikája nem fogta meg őket (csak a `-v2`/`-v3`/`legacy` nevűeket keresi, de az `audit-tab.tsx` és a `families-tab-v2.tsx` átcsúszott). Egy valódi elérhetőség-bejárás kell helyette. Jó hír: a repóban **nulla dinamikus import** van, tehát a statikus gráf ma pontos — ezt érdemes lezárni, amíg igaz. (`apps/web/scripts/audit-safety.mjs:38-64`) | **M** |
| **#23** | **„Vadonatúj gyülekezet" végigjátszás mint visszatérő teszt.** Több hiba **kizárólag üres adatbázison** jön elő: a leltár-véglegesítés némán semmit nem csinál `bealitas` sor nélkül, a sírhely-CTA üres temető-listát ad, a pénzügy ékezet nélküli fejlesztői hibát dob. A teszt-gyülekezeted fiktív adatokkal fel van töltve, tehát ezeket **soha nem látod**. Egy scriptelt „nulla adatból az első 10 művelet" végigjátszás (gyülekezet → tag → befizetés → leltári tétel → sírhely → irat → beküldés) pont ezt fedné le. **Ez az a tétel, ami az új gyülekezetek első benyomását védi.** | **L** |

### 💰 Pénz és hivatalos sorozatok

| | Tétel | Munka |
|---|---|---|
| **#7** | **Zárt-év őr szerver-oldali dekorátorba + látható zár a felületen.** Ma minden action kézzel ellenőrzi, hogy zárt évbe ír-e — és van, ahol a **beérkező dátumból** oldja fel az évet a módosítandó rekord dátuma helyett; ez okozta ennek a körnek az egyik P0-ját. Egy `withFinalizedYearGuard(action, resolveYear)` wrapper strukturálisan zárná ki. **Ráadás, ami külön is megéri:** ma semmi nem jelzi a pénztárosnak, hogy zárt évben dolgozik — a szerkesztés/stornó gombok kirajzolódnak, csak a mentés bukik el. | **M** |
| **#5** | **Egyetlen kanonikus „hivatalos összeg" helper (`ronOf`).** Az `osszeg` vs. `osszeg_ron` széthúzás **legalább 5 helyen** él (könyvelés-fül, két nyomtatási dialógus, véglegesítés, TVA-plafon), miközben a helper már létezik. Következmény: ugyanaz a szám két nyomtatványon eltérhet. Devizás tétel esetén az egyik a devizaösszeget, a másik a lej-ellenértéket adja össze. (`packages/ui-app/src/finance/reporting.ts:33`) | **M** |
| **#9** | **Deviza-egyenleg a tényleges könyvelésből.** A december 31-i átértékelés alapja ma **csak a valutacsere-sorokból** számol, és a saját doksija ismeri el, hogy a számlára közvetlenül könyvelt be- és kifizetéseket figyelmen kívül hagyja. Vagyis a devizás számla év végi átértékelése — és a 103.04/203.03-ra könyvelt árfolyam-eredmény — **rossz alapon áll**. Mivel a devizás sorok már `osszeg` + `osszeg_ron` párban tárolódnak, kiszámolható a könyvelésből. (`apps/web/lib/finance/bank-balance.ts:53-85`) | **M** |
| **#8** | **Sorszám-foglalás és rekord-beszúrás egy tranzakcióba.** A chitanță, dispoziție és decont mind ugyanúgy működik: az adatbázis atomi módon lefoglalja a sorszámot, majd **külön hálózati hívással** szúrja be a rekordot. Ha a második lépés bukik (megszakadt net a templomban), **javíthatatlan hézag** marad a hivatalos, hézagmentesnek előírt sorozatban — ezt utólag csak a könyvelővel lehet rendezni. Egy PL/pgSQL függvény, ami a kettőt egy tranzakcióban végzi, az egész osztályt megszünteti, ráadásul a párhuzamos kiállítás versenyhelyzetét is. Azért **L**, mert három sorozat × (SQL + kód + tesztelés), és élesben futó SQL-t érint. | **L** |

### 👤 Ki mit lát — hatókör és biztonság

| | Tétel | Munka |
|---|---|---|
| **#10** | **Egyetlen, fail-closed „aktív munkatárs" kapu.** A központi hatókör-feloldó **soha nem nézi meg a profil státuszát** — ezt egyedül a dashboard-elrendezés teszi, amit viszont a server action-ök **nem futtatnak le**, mert azok külön POST-végpontok. Következmény: aki csak egy érvényes bejelentkezési tokent birtokol — beleértve a nyilvános „Hozzáférés kérése" űrlapon keletkezett, még jóvá **nem** hagyott fiókokat —, elér olyan végpontokat, amik semmit vagy csak a bejelentkezettséget ellenőrzik. Egy `requireActiveStaff()` kötelező belépési pont + CI-grep, ami tiltja a megkerülését. **Ez a legfontosabb nyitott biztonsági tétel a listán.** (`apps/web/lib/auth/effective-access.ts:252`, `app/(dashboard)/layout.tsx:143-149`) | **M** |
| **#12** | **Döntsd el az admin-átvétel („impersonation") termék-történetét.** Ma **három kódút mond mást** arról, ki veheti át egy gyülekezet nézetét: a belépő függvény engedi a mestert, az admint és a kerületi admint; a lelkészi hozzájárulás jóváhagyó/elutasító párja a lelkészt és az esperest; a **tényleges fogyasztó viszont csak a mestert + aktív god-mode-ot**. Ez azt jelenti, hogy a lelkészi hozzájárulás funkció **ma gyakorlatilag nem csinál semmit** — de közben elküldi a „Hozzáférés jóváhagyva" értesítést. Ez nem kódhiba, hanem eldöntetlen kérdés: neked kell eldöntened, aztán törölni, amit a döntés árván hagy. (`admin/actions.ts:412`, `admin-override/actions.ts:22`, `notifications/actions.ts:28,60`) | **M** |
| 🟡 **#11** | **Escape-elt ilike helper.** *Nagyrészt kész* — négy azonosító-kereső megkapta az escape-et. Maradt a közös helper kiemelése és két hívó. Alacsony kockázat, de olcsó lezárni. | **S** |

### 🖥️ Web és desktop széthúzása

Ez a 4. hibafajta („a második felület a régi kódot őrzi") saját csoportja. Mind a négy tétel
ugyanarról szól, csak más rétegben.

| | Tétel | Munka |
|---|---|---|
| **#28** | **A desktopon teljesen hiányzik a hatókör-feloldás.** A webben 476 sor kezeli, hogy ki mit lát (több szerep, profilváltó, egyházmegyei/kerületi hatókör). A desktopon a `profile_roles` szó **egyetlen helyen** fordul elő: egy TODO-kommentben. A tényleges hatókör: a profil egyetlen `congregation_id` mezője. **Következmény:** egy több gyülekezethez rendelt könyvelő, egy esperes vagy egy kerületi admin a desktopon **vagy semmit nem lát, vagy egyetlen, önkényes gyülekezetet** — miközben a webben profilváltóval választ. Ez nem kényelmi kérdés: hatókör-eltérés két kliens között biztonsági kérdés is. Megoldás: a hatókör-feloldás kiemelése tiszta függvénybe `packages/core`-ba, amit **mindkét** kliens hív. (`apps/desktop/src/lib/shell/desktop-shell.tsx:255,263,322`) | **L** |
| **#2** | **Válassz gazdát üzleti szabályonként.** Három réteg (webes action-ök, `@kartoteka/core` use-case-ek, `@kartoteka/ui-app` komponensek) **részben** birtokolja ugyanazokat a szabályokat, és a megkeményítés mindig abba a rétegbe kerül, amit az adott hétvégén nyitottál ki. A bizonyíték rá a projekt saját kódjában van: a befizetés-action fejléc-kommentje egy **félbehagyott** core-ra költözést ír le, amitől mindkét implementáció él, de csak az egyik van megvédve. Ez nem egy hétvégés kód-munka, hanem egy **fél oldalas döntés** (befizetés/kiadás, leltár, misszió, súgó — melyik réteg a hiteles), amit utána fokozatosan hajtasz végre. | **L** |
| **#35** | **Két párhuzamos Zod-réteg + a `-v2/-v3/-v4` szaporodás lezárása.** Ugyanannak az entitásnak két külön validációs sémája van (`packages/validations` 20 fájl, `apps/web/lib/validations` 10 fájl) — ha az egyikben szigorítasz, a másik marad. És 28 `-vN/-refined/legacy` nevű fájl van a webben, amiből több él (`sidebar-adaptive-v4`, `member-tabs-v4`, `header-refined-v3`) — a verziószám tehát **semmit nem jelent**, csak a történetet őrzi. Megoldás: a webes sémák beolvasztása, a web csak re-exportál; plusz egy konvenció, hogy új komponens nem kaphat `-vN` utótagot (a `git` őrzi a történetet). | **M** |
| **#29** | **Két külön, 5–10 ezer soros szinkron-motor.** A deklarált közös réteg mindössze 306 sor típus. A tényleges implementáció: web 4750 sor **deklaratív** tábla-regiszterrel, desktop 5713 + 2459 sor **kézzel írt** per-modul pull-függvényekkel. Ugyanaz a szemantika kétszer, kétféleképp — minden új tábla két helyen fejlesztendő, és pont a két ág eltéréséből fakadtak az „offline cache-szivárgás" típusú hibák. Hosszú távon ez a **legnagyobb karbantartási megtakarítás** a repóban, de nagy falat. **Rövid távon már az is sokat érne, ha a tábla-regiszter közös lenne** — az önmagában kifogná a „desktopon másik oszlop-lista" hibákat. | **L** |

### ⚡ Teljesítmény

| | Tétel | Munka |
|---|---|---|
| **#14** | **A tagnyilvántartásnak valódi szerver-oldali lekérdezési útra van szüksége.** Szinte minden lassúság-panasz ide vezet: a tagnyilvántartás ma **letölti az egész gyülekezetet**, és JS-ben szűr, rendez, számol. Ez interakciónként ~36 egymás utáni hálózati kör. Megoldás: kereső-oszlop (`tsvector` + GIN index) a `szemely`-en, plusz egy `member_list_page(...)` SQL-függvény, ami a szűrést, rendezést, számolást és lapozást **a Postgresben** végzi — így 36 kör helyett 1. A P1 munka most megduplázta a sebességet (a köteg-méret 500-ról 1000-re nőtt, és a hibás léptetés is javult), de **az architektúra változatlan**. Ez a lista legnagyobb, egyben legérezhetőbb teljesítmény-tétele — falusi internetkapcsolaton ez a különbség „megnyílik" és „megvárom". | **L** |
| **#34** | **Szerver-oldali összesítő RPC-k az irányítópultokra.** A dashboard **minden oldalletöltésnél** lehúzza az összes személyt, az összes elköltözöttet, az összes háztartást és két év teljes be- és kifizetését — hogy aztán JS-ben rajzoljon korfát. Egy 2000 fős gyülekezetnél ez oldalanként több ezer sor. A megoldás mintája **már bevált a repóban** (`public_calendar_feed`), tehát a migrációs és biztonsági minta adott. *Megjegyzés: a P1 javítás miatt ez ma már csak sebesség-kérdés, nem adathelyesség — a csonkolás megszűnt.* | **M** |
| **#17** | **Az offline pull egyetlen delta-RPC-vé.** Ma 27 tábla, 27 egymás utáni kérés, táblánként **saját** időbélyeggel — ami azt jelenti, hogy a szinkron nem konzisztens pillanatképet hoz le. Egy `pull_deltas(...)` függvény 1 körre csökkentené, egy helyre tenné az oszloplistákat, és a szerver adna **egy** konzisztens időbélyeget. | **M** |
| 🟡 **#15** | **Bundle- és precache-méret kapu.** *Fele kész* — a 70 MB-os precache már kurált listára cserélve. Maradt a **mérő** script, ami a visszacsúszást elkapná. Olcsó, és jól illeszkedik a #27 CI-hoz. | **S** |

### 🔤 Magyar szöveg, akadálymentesség, higiénia

| | Tétel | Munka |
|---|---|---|
| **#22** | **Szövegstílus-döntés + tiltószótár az AGENTS.md-be.** A magázás és a tegezés **fájlon belül is** keveredik, néhány felhasználói üzenet pedig ékezet nélkül, fejlesztői zsargonnal íródott — a lelkész „schema cache" hibaüzenetet lát. Egy rövid, kötelező szakasz (megszólítás; hibaüzenet-recept: *mi történt + mit tegyél*; tiltólista: DB-oszlopnév, „legacy", nyers `error.message`), plusz egy `scripts/check-hu-strings.mjs`. **Ez a tétel közvetlenül a lelkész-felhasználók élményét védi**, és a #27 CI-val együtt olcsón kikényszeríthető. | **S** |
| **#3** | **Értesítés-hivatkozások és e-mail CTA-k átfésülése a mai útvonaltáblán.** Három elavult `/admin?tab=…` és nyolc elavult `/penzugy?tab=…` link túlélte a saját redesignját, mert **senki nem típusellenőrzi az URL-eket**. A rosszabbik fajta: az értesítések hivatkozásai **beíródnak az adatbázisba**, tehát túlélnek minden kódváltoztatást — a lelkész rákattint egy régi értesítésre, és rossz oldalon köt ki. Megoldás: egy `ROUTES` konstans, amivel az útvonal átnevezése fordítási hiba lesz, nem néma tévedés. | **M** |
| **#18** | **Ne kerüljön verziókövetésbe a lefordított service worker.** A `public/sw.js` ma követett fájl, és a benne lévő manifest jelenleg **Windows-build eredménye**: minden beágyazott útvonal fordított perjelet használ. Élesben ma nincs baja (a deploy Linuxon újragenerálja), de ez tiszta build-eredmény, minden helyi buildnél nagy diffet csinál, és ha valaha így kerülne ki, **azonnal elrontaná az offline működést**. Egy sor a `.gitignore`-ba. | **S** |
| **#4** | **Nevezd át az `inventory.next.ts`-t, és töröld a maradék legacy-oszlop ágakat.** A halott `inventory.ts` már törölve, de az élő fájl neve továbbra is `.next.ts` — ami az **ellenkezőjét** sugallja annak, ami igaz. Külön: három helyen él „modernFallback" payload régi oszlopnevekkel és rájuk épülő újrapróbálkozás, miközben az éles tábla csak a kanonikus neveket ismeri — ezek az ágak **soha nem tudnak lefutni**, csak kétszer olyan hosszúra nyújtják minden leltári írási út olvasását. (`apps/web/app/(dashboard)/leltar/actions.ts:143-155`, `penzugy/actions.ts:938-955,1044-1050`) | **S** |
| 🟡 **#19** | **Dialógus-őr, 2. fele.** A háttérre koppintás már nem zár be — a `useDirtyGuard` + `beforeunload` maradt. A lelkészek telefonon gyakran váltanak fület, tehát a `beforeunload` érdemi védelem. | **M** |
| 🟡 **#21** | **Kontraszt-mérő script.** A konkrét bukások javítva; a **visszacsúszás-védelem** maradt, mind a 6 téma-variánsra. | **S** |

---

## ✨ Új funkciók, amelyekhez MÁR MEGVAN minden adat

**Ez a négy tétel más fajta, mint a többi 31.** Azok azt akadályozzák meg, hogy valami rossz
történjen. Ezek **adnak valamit** — és mind a négy olyan adatból, amit a rendszer **ma is
tárol, de soha nem használ semmire**.

Ha egy hétvégén nem javítani akarsz, hanem építeni, ezek közül válassz.

### 🥇 #32 — Személyes lelkészi ICS-naptár (S / magas)

**A legjobb érték/ráfordítás arányú tétel az egész listán.**

Az infrastruktúra **100%-ban készen áll**: a publikus gyülekezeti naptár-feed már működik,
Google Naptárba felvehető előfizetésként, és a 229 soros ICS-építő is megvan. Ami hiányzik:
egy **második, privát feed**, amiben azok a dátumok vannak, amik **a lelkésznek** számítanak —
születésnapok (a rendszer már számolja), névnapok (a `nevnap` táblát a dashboard már napra
szűrve olvassa), házassági évfordulók, konfirmációs évfordulók, és a lejáratok (#30).

**Mit jelent a gyakorlatban:** a telefonod magától szól reggel, hogy ma kinek van
születésnapja és melyik házaspárnak évfordulója — **nulla új adatbevitel**, tisztán a már
meglévő adat újrahasznosítása. Nem kell megnyitnod a Kartotékát ahhoz, hogy tudd.

**Amire figyelni kell:** kell egy visszavonható token (profil-oldalon generálható), és mivel
ez privát adat, a tokent nem szabad kitalálhatóvá tenni. Egy adatbázis-oszlop kell hozzá.
(`apps/web/app/api/calendar/[token]/route.ts`, `apps/web/lib/calendar/ics.ts`)

### 🥈 #30 — Lejárat-radar: sírhely-bérletek és bérleti szerződések (S / magas)

Mindkét lejárati mező **tárolva és szerkeszthető, de sehol nem számolva**: a teljes
`app`+`lib`+`components` fában 12 találat van a „lejárat"-ra, és **mind tárolás vagy
megjelenítés** — nulla „hamarosan lejár" logika, nulla értesítés.

**Mit jelent a gyülekezetben:** a lejáró sírhely-bérlet egyszerre **bevétel** (megváltás) és
**pásztori kapcsolatfelvétel** — a család, akit évek óta nem láttál, most természetes módon
megkereshető. A lejáró bérleti szerződés viszont jogi kockázat és elmaradt bevétel. Ma
mindkettőt papíron vagy fejből követi az ember.

**Trükk, amivel ez ma estére kész lehet:** a javaslat három részből áll (számoló modul +
dashboard-kártya + heti értesítés). **Az első kettő önmagában is teljes értékű**, és nem
igényel sem adatbázis-változást, sem új háttérfolyamatot — kb. két óra. A heti értesítés
utólag ráépíthető, a már bevált hírlevél-worker mintájára.
(`apps/web/app/(dashboard)/sirhelyek/page.tsx:27`)

### 🥉 #31 — Családlátogatás-lefedettség (M / magas)

A `csaladlatogatas` táblába **írunk**, de sosem **összesítünk**: ma csak egyetlen család
előzményét lehet lekérdezni. Nincs semmilyen összesítő nézet.

**Mit jelent:** a „kit nem látogattam meg három éve?" a lelkészi év egyik legfontosabb
tervezési kérdése — és **pontosan kiszámolható** a meglévő család-, háztartás- és
látogatás-adatokból, a születési dátummal együtt (idős, egyedülálló tagok előre sorolása).
Cím szerint rendezve **körzetenkénti látogatási túrává** áll össze, és a személyi kartonon
már van útvonaltervezés hozzá. Nyomtatható a meglévő munkanapló-nyomtatómotorral.

Ugyanitt pótolható a hiányzó **látogatás-törlés felület** is, ami a saját munkanapló-audit
tervedben nyitott tételként szerepel.
(`apps/web/app/(dashboard)/tagnyilvantartas/family-actions.ts:1950`)

### #33 — Konfirmandus- és keresztelési kohorsz-listák (M / közepes)

Az anyakönyvi táblák minden szükséges adatot tartalmaznak, és az éves jelentés már olvassa
őket — de **csak visszatekintő statisztika** van, előretekintő nézet nincs. Három lista jönne:

- **konfirmandus-jelöltek:** megkeresztelt, élő, nem elköltözött tagok, akik idén vagy jövőre
  töltik a konfirmációs életkort, és **nincs konfirmációs bejegyzésük**;
- **megkereszteletlen gyerekek** aktív családokban;
- **idén 18 évesek** — és ez az, ami közvetlenül pénzügyi hatású: ez egyszerre
  **járulékkötelessé válás** és **választói névjegyzék-esemény**. Ma ezt kézzel veszi észre
  az ember, ha észreveszi.

Azért került negyediknek, mert **több üzleti szabályt kell benne pontosan eltalálni**
(mi a konfirmációs életkor, mi számít aktív családnak, mikortól járulékköteles), és ezek
gyülekezetenként eltérhetnek — vagyis a munka nagyobb része nem kód, hanem egyeztetés.

---

## 📊 Záró tábla

Munka: **S** = egy este (1–3 óra) · **M** = egy hétvége (4–10 óra) · **L** = több hétvége.

| # | Tétel | Téma | Munka | Érték | Ajánlott sorrend |
|---|---|---|---|---|---|
| 27 | Első CI-workflow | Kapuk | S | magas | **1** |
| 24 | Három ESLint-kapu (+#20) | Kapuk | M | magas | **2** |
| 26 | Vitest + arany-tesztek | Kapuk | M | magas | **3** |
| 32 | Privát lelkészi ICS-naptár | Új funkció | S | magas | **4** |
| 30 | Lejárat-radar (1. fázis) | Új funkció | S | magas | **5** |
| 10 | `requireActiveStaff()` kapu | Biztonság | M | magas | **6** |
| 25 | Generált típusok + séma-drift CI | Kapuk | M | magas | **7** |
| 7 | Zárt-év dekorátor + látható zár | Pénzügy | M | magas | 8 |
| 5 | Kanonikus `ronOf` | Pénzügy | M | magas | 9 |
| 22 | Magyar szövegstílus + ellenőrző | Szöveg | S | közepes | 10 |
| 18 | `sw.js` a `.gitignore`-ba | Higiénia | S | közepes | 11 |
| 4 | `inventory.next.ts` átnevezés + halott ágak | Higiénia | S | közepes | 12 |
| 13 | Gazdátlan server action-ök | Kapuk | S | közepes | 13 |
| 15 🟡 | Bundle-/precache-mérő | Teljesítmény | S | közepes | 14 |
| 21 🟡 | Kontraszt-mérő script | Akadálymentesség | S | közepes | 15 |
| 11 🟡 | ilike-helper kiemelése | Biztonság | S | közepes | 16 |
| 31 | Családlátogatás-lefedettség | Új funkció | M | magas | 17 |
| 9 | Deviza-egyenleg a könyvelésből | Pénzügy | M | közepes | 18 |
| 12 | Admin-átvétel: döntés | Biztonság | M | közepes | 19 |
| 3 | `ROUTES` konstans + link-átfésülés | Higiénia | M | közepes | 20 |
| 19 🟡 | Dialógus-őr 2. fele | Akadálymentesség | M | magas | 21 |
| 1 | Árva-modul kapu | Kapuk | M | magas | 22 |
| 34 | Dashboard összesítő RPC-k | Teljesítmény | M | közepes | 23 |
| 17 | Offline pull delta-RPC | Teljesítmény | M | közepes | 24 |
| 35 | Zod-rétegek + `-vN` konvenció | Széthúzás | M | közepes | 25 |
| 33 | Kohorsz-listák | Új funkció | M | közepes | 26 |
| 6 🟢 | Kötelező lapozás | Kapuk | S | magas | *maradék: 1 fájl* |
| 16 🟢 | Lapozó-szabály | Kapuk | S | magas | *maradék: lint-kapu* |
| 28 | Desktop hatókör-feloldás | Széthúzás | L | magas | 27 |
| 23 | Első-futás végigjátszás | Kapuk | L | magas | 28 |
| 14 | Tagnyilvántartás szerver-oldali lekérdezés | Teljesítmény | L | magas | 29 |
| 2 | Egy gazda üzleti szabályonként | Széthúzás | L | magas | 30 |
| 8 | Sorszám + insert egy tranzakcióban | Pénzügy | L | közepes | 31 |
| 29 | Egységes szinkron-motor | Széthúzás | L | közepes | 32 |

🟢 = nagyrészt kész · 🟡 = fele kész

---

## Amit ez a dokumentum NEM mond meg

- **A #12 (admin-átvétel) nem technikai kérdés.** Csak te tudod eldönteni, hogy egy esperes
  beleláthat-e egy gyülekezet pénzügyeibe a lelkész hozzájárulása nélkül. Amíg nincs döntés,
  a funkció félkészen fut, és értesítést küld olyasmiről, ami nem történik meg.
- **A #33 üzleti szabályai gyülekezetenként eltérhetnek** (konfirmációs életkor, aktív család
  definíciója). Ez inkább egyeztetés, mint fejlesztés.
- **A #2 (rétegek gazdája) egy fél oldalas döntés**, nem hétvégi kódolás. A kód utána
  fokozatosan követi.

---

*A kör P0–P3 javításai külön dokumentumban. Ez a fájl kizárólag a 35 javaslat döntési
segédlete — ha egy tétel elkészül, jelöld itt, hogy a 6. kör ne találja meg újra.*
