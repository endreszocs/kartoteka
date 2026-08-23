# Endre észrevételei — bizonyíték-alapú terv

**Készült:** 2026-08-22 · **Állapot:** ⏸️ **JÓVÁHAGYÁSRA VÁR — egyetlen sor kód sem módosult**
**Alap:** 8 párhuzamos kódfelmérő ágens + 6 támadó-lencse adversariális cáfolattal + saját mérések
**Kiindulás:** `feat/egyhazkerulet-s6` ág, web 0.9.172

> **Munkaszabály (2026-08-14 óta):** felmérés → jelzés → **csak jóváhagyás után** megvalósítás.
> Ez a dokumentum a „jelzés". Semmit nem javítottam, nem töröltem, nem futtattam élesben.

---

## 0. Vezetői összefoglaló — amit MOST tudni kell

### 🚨 A legsúlyosabb, amit a kör talált — és NEM a listádon volt

A 2. pont (biztonsági átvilágítás) **négy MAGAS súlyosságú, megerősített találatot** hozott. Kettő közülük egyetlen láncot alkot, és ez a lánc a legkomolyabb:

> **Bármely aktív lelkész — a saját, legitim bejelentkezésével — írhat magának „jóváhagyott" admin-hozzáférést tetszőleges gyülekezethez, majd ezzel hamis bejegyzéseket írhat egy IDEGEN gyülekezet hivatalos anyakönyvébe.**
> Az ok: egy hiányzó `WITH CHECK` ág (`admin_access_requests`), amit négy `SECURITY DEFINER` RPC **jogosultság-bizonyítéknak** fogad el.

És egy másik, amitől a teljes zár-rendszer értelmét veszti:

> **A véglegesítés-zászló (`accounting_finalized`) közvetlenül visszabillenthető** a böngészőből, a tételek a normál felületen átírhatók, majd a zászló visszakapcsolható — **a véglegesítési pecsét (dátum, aláíró) változatlan marad, és audit-nyom nem keletkezik.**

Részletek és a javasolt sorrend a **2. pont** fejezetében. Ezek nem a napi élményt rontják, hanem a rendszer **hitelességét** — ezért javaslom, hogy a B1–B4 kerüljön a sor elejére.

### 🔴 A három legfontosabb megállapítás a listád pontjaiból

| # | Megállapítás | Miért fontos |
|---|---|---|
| **A** | **A 4. pont nem az, aminek látszik.** Az egyházmegyei „👥 Szerepkörök" fül **nem szerepköröket mutat** — a `ProfileCongregationsTab`-ot rendereli, vagyis a *könyvelői/számvevői hozzárendeléseket*. Ugyanez a komponens a rendszergazdai oldalon helyesen „Könyvelői hozzárendelések" néven fut. | Hibátlan működés mellett **sem** jelenne meg itt soha esperes/lelkész/számvevő szerepkör. A felirat hazudik; az üres állapot lehet, hogy tényszerűen igaz. |
| **B** | **A 6. pont fő oka ADATHIÁNY, nem kódhiba.** A képernyőképen látott „Kézdi-Orbai Református Egyházmegye" azért magyar, mert a `dioceses.nev_ro` **NULL** — a `nev_ro \|\| magyar` lánc némán visszaesik. | Ha csak a kódot javítjuk, **a papír ugyanúgy magyar marad**. Előbb az adat kell. |
| **C** | **Az 1. pont fekete sávja a 2026-08-22-i saját javításunk mellékhatása.** A `fit-védelem` ág gyakorlatilag minden böngészőablakban bekapcsol. | Az őrszem közben **19 zöld assertet** ad — mert csak a főcím levágását méri, a sávot nem. Ez a „negatív asszert nélkül vak" szabály iskolapéldája. |

### 🔢 Az 1. pont kimérve — a fekete sáv nem ritka kivétel, hanem a főszabály

Saját méréssel, a `splashStageScale` képletével (`MAX_VAGAS = 12,28%`):

| Nézet | Mód | Fekete sáv |
|---|---|---|
| **Endre képernyőképe (~2000×950)** | `fit-vedelem` | **oldalt 2 × 156 px** |
| Laptop 1536×730 (böngésző-fejléccel) | `fit-vedelem` | oldalt 2 × 119 px |
| Laptop 1366×625 | `fit-vedelem` | oldalt 2 × 127 px |
| **FullHD böngészőben (1920×940)** | `fit-vedelem` | oldalt 2 × 124 px |
| Ultrawide 21:9 (3440×1350) | `fit-vedelem` | **oldalt 2 × 520 px** |
| Tablet álló (820×1180) | `fit-tablet` | fent/lent 2 × 359 px |
| FullHD **teljes képernyőn** (1920×1080) | `fill` | nincs |

Vagyis sáv **csak** valódi, böngésző-fejléc nélküli 16:9-en nincs. Endre nem kivételes esetet talált el.

### ⚠️ Amit a felmérés MELLESLEG talált (nem szerepelt a listán, de ide tartozik)

1. **Desktop-paritás megszakadt a splash-en.** Az `apps/desktop/src/components/splash-screen.tsx` még a 2026-08-22 **előtti**, kétszeresen hibás kódot futtatja (`Math.max` védelem nélkül + `placeItems: center`) — ott a főcím **ma is le van vágva**. A web-őrszem csak a webet nézi.
2. **A Chitanța kitalált adatot nyomtat hivatalos bizonylatra.** Hiányzó román névnél a sablon a **címerből következtet** kerületnévre (`chitanta-print-template.tsx:84`), illetve `PAROHIA REFORMATĂ`-t ír. Hiányzó **magyar** névnél pedig `REFORMÁTUS EGYHÁZKÖZSÉG`-et (`:216`, `:226`).
3. **A megyei/kerületi felhasználónak látszik egy nyugta-gomb, ami mindig bukik.** A Kassza fül nyugta-ikonja felső szinten is renderelődik, de mind a 8 chitanța-action fail-closed megáll: „Nincs aktív gyülekezet."
4. **A web és a desktop nyugtaképe MÁR MA széthúz.** A desktop `ChitantaPrintLayout` a *helyes* viselkedést mutatja (hiánynál elhagyja a román sort), a web találgat.
5. **A megyei pénzügyi nyomtatás értelmezhetetlen hibát ad.** A kerületre van fail-closed kapu, a megyére nincs — a megyei felhasználó a saját hatókörében kap „Nincs aktív gyülekezet." üzenetet.
6. **A „villog" tünetnek van testvére.** A Monetár és a Pénzügyi nyomtatási központ minden szülő-renderre újra lekérdez és visszaesik betöltő-állapotba (nem végtelen hurok, de fölösleges körök + újra kilőtt hibás toast).

---

## 1. pont — Splash: fekete sávok, minden képernyőn tökéletes illeszkedés

### Diagnózis

A splash egy **fix 1920×1080-as „színpad"**, amit `transform: scale()` kicsinyít. A háttérkép (`Hatter.png`) **a színpadon BELÜL** él (`splash-screen.tsx:230`), ezért **együtt zsugorodik a tartalommal** — elvileg sem tud a viewport széléig érni. Ami kimarad, azt a külső réteg `#0d0a07` (majdnem fekete) háttere festi ki (`:184`).

A 2026-08-22-i javítás a **főcím levágását** oldotta meg azzal, hogy túl széles nézetben `Math.min`-re vált (`splash-stage-core.ts:88`) — ez helyes volt a levágásra, de **kicserélte a tünetet sávra**.

**Bizonyíték, hogy a megoldás iránya a projekten belül már működik:** a `MobileSplash` ág (<768 px) full-bleed háttérrel dolgozik, és **ott nincs fekete sáv** (`splash-screen.tsx:609–654`).

### Javaslat — két fázisban

**FÁZIS 1 — a fekete sáv strukturális megszüntetése (kicsi, alacsony kockázat).**
A háttér kikerül a színpadról a külső, teljes viewportot lefedő rétegre:

- `Hatter.png` + vignette + porszemcsék + napsugarak → a `fixed inset-0` rétegre, `objectFit: cover`, `sizes="100vw"`, `objectPosition: '50% 42%'`
- a külső réteg alapszíne `#0d0a07` helyett `#d8cfba` (krém) — így hiba esetén sem **fekete**
- a színpad háttere `transparent`, a `boxShadow` elhagyva
- a skála ezután **bátran lehet mindig `contain`**: ami „kimarad", az már a háttérfotó, nem sáv — így a **főcím-levágás is végleg megszűnik**, `MAX_VAGAS`-küszöb nélkül

**FÁZIS 2 — fluid elrendezés (a `scale()` teljes kiváltása).**
Külön jóváhagyással, mert megváltoztatja az elemek egymáshoz mért arányait:

- `100dvh` (fallback `100svh` → `100vh`), `container-type: size`, `env(safe-area-inset-*)` padding
- főcím: `clamp(2rem, 1rem + 5.2cqi, 6rem)` — `cqi`, nem `vw`, mert a `vw` sérti a **WCAG 1.4.4**-et (200%-os szöveg-átméretezés)
- címerek: `clamp(96px, 16cqi, 280px)`, **blokk-tengelyű plafonnal** (`min(..., 26cqb)`), különben alacsony laptopon kilógnak
- telefon **fekvő** (844×390) ma a 768-as küszöb miatt tablet-ágra esik → 75 px sáv oldalanként; a mobil ágat a **rövid oldal** is dönthesse el

**Külső források (mind megnyitva, nem emlékezetből):**
[web.dev — viewport units](https://web.dev/blog/viewport-units) · [web.dev — fluid type](https://web.dev/articles/baseline-in-action-fluid-type) · [moderncss.dev — grid-stacking hero](https://moderncss.dev/3-popular-website-heroes-created-with-css-grid-layout/) · [CSS-Tricks — The Notch and CSS](https://css-tricks.com/the-notch-and-css/) · [LogRocket — clamp](https://blog.logrocket.com/fluid-vs-responsive-typography-css-clamp/)

### Szintek
Egyetlen kódút: a splash az `(auth)/layout.tsx:32`-ben ül, **mindhárom szint ugyanazt látja**. A javítás automatikusan mindhármat rendezi.

### Őrszem (kötelező bővítés)
- **G6:** új tiszta függvény a maghoz — `hatterFedettseg(vw, vh)`; assert: **minden nézetben mindkét sáv pontosan 0**
- **G6b (negatív asszert):** a MOSTANI szabályt újrajátszva 2000×950-en 155,6 px sávot ad → a G6 mércéjének **buknia kell** rajta
- **G7:** a `Hatter.png` a KÜLSŐ rétegen legyen (szöveges, kommentek kiszedve, mutánssal igazolva)
- **G8:** a selftest nézze meg **a desktop fájlt is** — ma teljesen őrizetlen, és bizonyítottan régi kód

### Kockázat
**Közepes, de látványbeli, nem technikai.** ⚠️ A `viewportFit: 'cover'` bekapcsolása a `layout.tsx`-ben **globális** — iOS-en máshol is a bevágás alá viheti a tartalmat; külön átnézést érdemel. ⚠️ A háttérfotó ezután eltérően vágódik — az `objectPosition` értékét **valós képen kell hitelesíteni**, nem számolással. ⚠️ A splash `sessionStorage`-ból egyszer fut — teszteléshez a `kartoteka_splash_shown` kulcsot törölni kell.

**Méret: L** (Fázis 1 önmagában: M)

---

## 2. pont — Biztonsági átvilágítás („törj be a rendszerbe")

### Módszer és hatókör

**6 támadó-lencse** (hatókör/IDOR · RLS · hitelesítés-munkamenet · injektálás/XSS/CSRF/SSRF · titkok-konfiguráció · üzleti logika), majd **minden egyes találatra külön cáfoló ágens**, aki azt a feladatot kapta, hogy **döntse meg** a bejelentést (kétség esetén elvetés). Összesen **52 ágens**.

> ⛔ **Kizárólag statikus, kód-szintű elemzés.** Az éles rendszer (`kartoteka.app`) ellen **egyetlen kérés sem indult**, bejelentkezési kísérlet nem történt. Ez a te rendszered, a te kérésedre, védelmi céllal.

### Eredmény

| | Darab |
|---|---|
| Bejelentett nyers találat | 46 |
| **Megerősítve** (a cáfolat nem sikerült) | **17** |
| **Megcáfolva** (hamis riasztás) | **29** |

A cáfoló fázis komolyan dolgozott: elvetette többek között a „publikus pecsét-bucket = jogosultság-emelés" állítást (az **már rögzített, vállalt döntés**), a „nincs CSP" vádat (a hitelesített felület fegyverzete **megvan**, csak a bejelentő rossz sort nézte), és a „PIN nem konstans idejű" találatot. **Sőt: az egyik bejelentő javasolt SQL-jéről kiderült, hogy három nem létező oszlopot nevez meg** (`megjegyzes`, `slug`, `teszt` — valójában `public_slug`, `status`), tehát **le sem futna**. Ezt a figyelmeztetést alább megtartom.

---

### 🔴 MAGAS — ezt a négyet érdemes soron kívül kezelni

#### B1. Bármely lelkész saját magának írhat „approved" admin-hozzáférést TETSZŐLEGES gyülekezethez
`migration-docs/sql/2026-04-13-rls-hybrid-admin-tables.sql:8`

Az `admin_access_requests` egyetlen policy-je `FOR ALL TO authenticated`, és **a `WITH CHECK` ág hiányzik** — Postgresben ilyenkor az INSERT/UPDATE ellenőrzés a `USING` kifejezést használja, vagyis az **egyetlen feltétel**: `admin_user_id = auth.uid()`. A `status`, az `expires_at` és a `congregation_id` oszlopra **semmilyen korlát nincs**, trigger sincs, a `status` CHECK pedig **kifejezetten engedi az `'approved'`-ot**.

**Támadás:** a lelkész a saját, legitim JWT-jével közvetlenül a PostgREST-re küld egy sort `status:"approved"`, `expires_at:"2099-…"`, `congregation_id:"<idegen gyülekezet>"` értékekkel. Nincs lelkészi jóváhagyás, nincs 2 órás korlát, nincs admin-szerep. Az `enterCongregation` app-oldali hatókör-ellenőrzése így **teljesen megkerülhető** — a támadó nem az akciót hívja, hanem az adatbázist.

#### B2. SECURITY DEFINER anyakönyvi RPC-k egy FELHASZNÁLÓ ÁLTAL ÍRHATÓ táblát fogadnak el jogosultság-bizonyítéknak
`migration-docs/sql/2026-08-11-import-registry-batch-orzet.sql:333`

A B1 következménye, de **önálló hiba**: az `import_registry_batch`, a `generate_egyhazi_anyakonyvi_szam`, az `import_wizard_family_head` és a családi-link RPC-család mind az `admin_access_requests`-ből vett `EXISTS`-re bízza a hatókört.

> A fájl fejléce **nagy gonddal levezeti**, hogy a „saját hatókör" ág miért nem lehet tágabb az anyakönyvi táblák RLS-énél („SECURITY DEFINER törzsben az RLS nem érvényesül") — **de a delegált ágnál ugyanez a gondolat kimaradt**.

**Következmény:** a támadó tetszőleges mennyiségű **hamis anyakönyvi bejegyzést** írhat idegen gyülekezet hivatalos anyakönyvébe (egyházjogilag bizonyító erejű nyilvántartás), és a `szemely`/`csalad` táblákba is — **CNP-vel együtt**.

**Alapelv, amit rögzíteni kell:** *egy SECURITY DEFINER függvény soha ne fogadjon el hitelesítésként olyan adatot, amit a hívó szerepe módosíthat.*

#### B3. Tárolt XSS a jegyzőkönyv-nyomtatványban
`apps/web/components/minutes/minutes-editor.tsx:320` (+ `minutes-print-selector.tsx`, `minutes-list.tsx`)

A jegyzőkönyv/határozat-kivonat HTML-jét három komponens állítja elő, és **egyetlen mezőt sem escape-el** (`h.szoveg`, `np.cim`, `np.targyalas`, résztvevők, elnök, jegyző, hitelesítők, hely, igevers…). A `.replace(/\n/g, '<br>')` még **segít is** a támadónak: a sortörések megmaradnak, a tagek nem törnek el.

A HTML utána `<iframe srcDoc={html}>`-be kerül — **`sandbox` attribútum nélkül**. A `srcdoc`-iframe **örökli a szülő origint**, tehát a beinjektált script a `kartoteka.app` originben fut, hozzáfér a Supabase session-tokenhez, és bármely server actiont meghívhat **a néző jogaival**.

> **Kontraszt:** a többi nyomtatvány-modul (leltár, választói névjegyzék, személyi karton, iktató) **következetesen escape-el**. A jegyzőkönyv-modul a házi szabály **egyetlen kiugró kivétele**.

**Támadási lánc:** egy jegyzőkönyv-írásra jogosult felhasználó beír egy `<img src=x onerror=…>`-t egy határozat szövegébe → **bárki**, aki később ránéz a „Nyomtatás" gombra (esperes, számvevő, **rendszergazda a felülvizsgálatkor**), a saját munkamenetével futtatja le. Rendszergazdánál ez a **god-mode felület** és az országos adat.

#### B4. A véglegesítés-zászló bármely gyülekezeti felhasználó által visszabillenthető
`migration-docs/sql/2026-04-13-rls-congregation-tables.sql:24`

A `bealitas` táblán egyetlen, mindenre kiterjedő policy ül (`FOR ALL TO authenticated`, csak gyülekezet-tagságot néz), **oszlop-korlátozás nincs, trigger nincs**. A tábla `accounting_finalized` / `budget_finalized` / `leltar_finalized` oszlopa viszont **az egész zár-rendszer egyetlen igazságforrása**: ebből olvas az app-oldali őr, a törlés-zár RLS-függvénye, a költségvetés-zár és a felület zöld jelvénye is.

**A támadási lánc a legkellemetlenebb az egészben:**
1. `PATCH /rest/v1/bealitas` → `{"accounting_finalized": false}`
2. a felület minden gombja **újra működik**
3. a könyvelő a **normál felületen** törli/átírja a terhelő tételeket (így még a Kukába is szabályosan kerül — semmi gyanús)
4. `PATCH` vissza `true`-ra
5. **az `accounting_finalized_at` / `_by` pecsét változatlan marad** — a felület a régi véglegesítési dátumot és aláírót mutatja tovább

**Audit-nyom: nulla.** A PostgREST-írás nem hívja a `log_audit_event` RPC-t. Az egyházmegyének beküldött papír és a rendszer adatai **némán szétcsúsznak**.

> Ez teszi értelmetlenné a gondosan felépített megyei feloldás-jóváhagyást is (`bealitas_update_diocese`, esperes/megyei admin szerephez kötve) — **ha a gyülekezet maga is átírhatja ugyanazt az oszlopot**.

---

### 🟠 KÖZEPES

| # | Találat | Hol |
|---|---|---|
| **B5** | **A `congregations` sorpolicy `USING(true)` és `TO` záradék nélküli — tehát PUBLIC, vagyis `anon`-ra is.** Bejelentkezés **nélkül** letölthető minden gyülekezet `iban`, `bank`, `adoszam`, `tva_kod`, `email`, `telefon`, `cim` adata. A szándék „jegyzék" volt, a hatás a **teljes törzsadat**. | `2026-04-16-wc7-4-fazis2f-congregations.sql:225` |
| **B6** | **A `logos` Storage-policy kerület-vak:** a kerületi ág **pusztán a szerepet nézi**, a path-ból kiolvasott gyülekezet-azonosítót semmilyen hatókörrel nem veti össze → „A" kerület adminja **írhat és törölhet** „B" kerület bármely gyülekezetének mappájában (címer, **pecsét, aláírás**). | `2026-04-19-congregations-logos-bucket.sql:62` |
| **B7** | **Az országos, KÖZÖS számlatükör bárki által átírható:** `befizetescel` / `kiadascel` — `FOR UPDATE TO authenticated USING (true) WITH CHECK (true)`. Egyetlen `PATCH`-csel az **ország minden gyülekezetében** eltüntethető az összes kiadási cél; vagy finomabban: egy cél átnevezésével/átszülősítésével a **már rögzített tételek némán más rovatba csúsznak**. | `2026-04-17-seed-befizetescel-kiadascel.sql:62` |
| **B8** | **A 2FA-kapu a NEM HITELESÍTETT sütitartalomból dönt.** A `getAuthenticatorAssuranceLevel()` argumentum nélkül fut → a `nextLevel` a sütiből visszaolvasott, **aláíratlan** `user.factors` tömbből jön. A támadó (aki tudja a jelszót, de a telefont nem) a sütiben kiüríti a `factors` tömböt — az `access_token` **változatlan és érvényes** marad. A `@supabase/ssr` saját kódja külön meg is jelöli: *„should not be trusted"*. | `apps/web/lib/supabase/middleware.ts:189` |
| **B9** | **HTML-injekció a lelkészcsere-értesítő e-mailbe** (`reason`, név, gyülekezetnév szűrés nélkül). A levelet a service-role kliens küldi **minden rendszergazdának** — saját domainről érkező, hitelesnek látszó adathalász-levél. A testvérfájlok mind `escHtml()`-t használnak; **ez az egy kivétel.** | `apps/web/lib/email/templates/congregation-transfer.ts:40` |
| **B10** | **A service worker gyorsítótárazza a személyes adatot** (RSC-payload: névsorok, CNP, pénzügyi sorok) 24 órára, **és kijelentkezéskor semmi nem üríti**. A **közös hivatali gépen** a következő felhasználó a devtoolsból bejelentkezés nélkül kiolvassa. | `apps/web/app/sw.ts:53` |
| **B11** | **A pénzügyi tételek nyers `DELETE`-tel törölhetők** — megkerüli a Kukát, a `deleted_at`-ot és az audit_log-ot. A zárt-év RESTRICTIVE policy `FOR UPDATE`, tehát **valódi DELETE-re nem fut**. A sor fizikailag eltűnik, a Kukában sem jelenik meg. | `2026-04-12-phase-0-rls-hardening.sql:147` |

### 🟡 ALACSONY

- **B12** — a lelkész **oszlop-korlát nélkül** írhatja a saját gyülekezete `profile_roles` sorait (saját jóváhagyás, tetszőleges jogosultság-JSON). A policy *kommentje* szűk szándékot ír le, a *megvalósítás* a teljes sorra vonatkozik.
- **B13** — **CSV-export formula-injection** (3 exportáló): az idézőjel a **mezőhatárt** jelöli, nem szövegtípust — az Excel a `=HYPERLINK(...)`-et képletként értékeli ki.
- **B14** — **a titok-széf kulcsa némán egy 6 jegyű PIN-re esik vissza** (`VAULT_ENCRYPTION_KEY || GOD_MODE_PIN` → 10⁶ kulcstér), **és a figyelmeztetés halott kód**: az `if (!VAULT_KEY)` csak akkor lép be, ha *mindkettő* hiányzik — pont abban az esetben nem szólal meg, amikor a fallback aktív.
- **B15/B16** — az **`/api/ai/chat`** végpontnak nincs szerveroldali rate limitje és méretkorlátja; a fék **kizárólag a böngészőben** ül. Egy kérésből akár 7–8 kimenő hívás a szervezet fizetős kulcsaival, **pending fiókkal is**.

---

### ⚠️ Amit a javítás előtt tudni kell

> **A migrációs fájl NEM bizonyíték arra, hogy élesben mi van.** Mind a 11 adatbázis-találathoz **ellenőrző SQL-lel kell kezdeni** (`pg_policies`, `information_schema.role_table_grants`), és csak az eredmény alapján javítani.

- **B5 javításánál:** a bejelentő GRANT-listája **három nem létező oszlopot** nevez meg (`megjegyzes` — nincs; `slug` → valójában `public_slug`; `teszt` → valójában `status`). A szűkítendő tényleges kör: `iban, bank, adoszam, tva_kod, email, telefon, cim, calendar_feed_token`.
- **B5 mellékhatás:** a `2026-08-16-…-S1c….sql:502` őrszem **ma ✅-t ad az `USING(true)`-ra** — ha nem írjuk át, **a javítást fogja hibának jelezni**.
- **B6-nál:** a hívott függvényre a `GRANT` **kötelező** — GRANT nélkül a policy nem tagad, hanem **hibázik** (a projekt rögzített hibaosztálya).
- **B14-nél:** a kulcscsere **adatvesztést okoz** újratitkosító lépés nélkül — a régi sorok csak a régi kulccsal fejthetők vissza.

### Javasolt sorrend a 2. ponton belül

| Sorrend | Mit | Miért itt |
|---|---|---|
| **1.** | **B1 + B2 együtt** (a bizonyíték-tábla lezárása **és** az RPC-k önálló bizonyítéka) | A kettő **egy lánc**; külön-külön javítva a másik nyitva marad. Ez a legsúlyosabb: idegen gyülekezet **hivatalos anyakönyvébe** enged írni. |
| **2.** | **B4** (véglegesítés-zászló) + **B11** (nyers DELETE) | Mindkettő **auditálatlan adatmódosítás** hivatalos pénzügyi anyagon. Együtt kezelendők — ugyanaz a réteg. |
| **3.** | **B3** (jegyzőkönyv-XSS) + **B9** (e-mail-injekció) | Tisztán app-oldali, **SQL nem kell**, kis kód, azonnal kiadható. Közös `esc()` helper. |
| **4.** | **B5 + B7** (nyitott RLS-policy-k) | Ellenőrző SQL után; a B5-nél a fenti oszlopnév-csapdára figyelve. |
| **5.** | **B8** (2FA-megkerülés) | Egy fájl két helyén; őrszemmel (hamisított süti újrajátszása). |
| **6.** | **B6, B10, B12–B16** | Kisebb tétel, de a **B14** (széf-kulcs) érdemi — ⚠️ **környezeti változó ellenőrzése a te feladatod**: van-e `VAULT_ENCRYPTION_KEY` a Railway env-ben? |

> **A biztonsági javítások önálló kört és önálló tervdokumentumot érdemelnek** — ezért a 11. fejezet hullám-táblájában a H5-be tettem őket, a B1–B4 kivételével, amit érdemes előre hozni.

---

## 3. pont — Naptár széles képernyőn: alkalmazkodó méret, belső görgetés nélkül

### Diagnózis

**Nincs önálló naptár-oldal.** A modul egyetlen helyen él: az egyházközségi irányítópult hármas csempesorának középső csempéjeként (`dashboard/page.tsx:559`). A `programs/` útvonalon **csak `actions.ts` van, `page.tsx` nincs**.

A szűk oszlop és a kicsi rács **nem véletlen, hanem két szándékos korlát**:

```css
.kt-cal--compact { --kt-cell: 38px; max-width: calc(var(--kt-cell) * 7 + var(--kt-cal-gap) * 6); }
@media (min-width: 1280px) { .kt-cal--compact { --kt-cell: 32px; } }   /* ← széles képernyőn KISEBB! */
.kt-dash-trio { grid-template-columns: minmax(0,1fr) minmax(0,1.1fr) minmax(0,1fr); }
```

Vagyis a rács **soha nem lehet szélesebb 242 px-nél**, és ≥1280 px-en még **zsugorodik is**. A maradék helyet a `margin-inline: auto` üresen hagyja. A CSS-komment ezt ki is mondja: *„keskeny oszlopban zsugorodnak, széles oszlopban **nem nőnek nagyra**"*.

A nap-részletek azért kerülnek a rács **alá**, mert a csempe egyetlen függőleges flex-oszlop — nincs kéthasábos ág.

**A belső görgetés a weben nincs** (`overflow: visible`); ott a `.kt-widget { overflow: hidden }` + fix `35rem` sormagasság inkább **vág**, a túlcsordulást a `DAY_CAP=2 / LIST_CAP=4` „+N további" csonkolás rejti el. **Valódi belső görgetés a desktop párjában van** (`UpcomingPrograms`, `max-height: 760px` + `overflow-y: auto`).

### Javaslat

1. **A rács nőjön a hellyel:** a kemény `max-width` helyett `--kt-cell: clamp(32px, calc((100% - gap*6)/7), 72px)` + `max-width: none`; a ≥1280 px-es zsugorítás megszüntetése; a betűméretek `clamp()`-pel a cellaméretre kötve.
2. **Kéthasábos elrendezés széles csempén** (`@container ktcal (min-width: 520px)`): hónap-rács balra, napi agenda jobbra. A React-oldalon a `<>…</>` fragmentet két `<div>`-be kell csomagolni — más JSX-változtatás nem kell.
3. **A csonkolás oldása, ha van hely:** kéthasábos ágban `DAY_CAP=6, LIST_CAP=12`.
4. **Desktop-paritás:** az `UpcomingPrograms` kapja meg a `kt-widget--flow` módosítót → megszűnik a valódi belső görgetés is.

### Szintek
**Csak egyházközségi.** Megyén és kerületen **nincs naptár-modul** (grep-pel igazolva: se `ProgramScheduler`, se `kt-cal*`, se `megyei_programok`/`keruleti_programok` tábla). Megyei/kerületi naptár = **új funkció, külön döntés**.

### ⚠️ Ütközés korábbi kéréssel — döntést igényel
A `kartoteka.css:2015–2027` kommentje szerint a **hármas, egy méretű csempesor 2026-08-10-én Endre kifejezett kérésére** készült, és a belső görgetés megszüntetése is korábbi kérés volt. **Ezért a javaslat szándékosan a soron BELÜL old** (fluid rács + kéthasáb). Ha a naptár teljes szélességű saját sorba kerülne, az visszavonná azt a döntést — **az külön kérdés** (lásd a döntési listát).

### Kockázat
A `packages/ui/src/kartoteka.css`-t a **web és a desktop is** importálja — minden változás mindkettőre hat. A mobil érintőfelület minimuma (≥36 px) nem sérülhet. ⚠️ A szélesedő rács az `aspect-ratio: 1` miatt **magasabb is lesz** (7 × 72 px ≈ 432 px), ami a 35rem-es sormagasságot áttörheti és a **másik két csempét is megnyújtja** — mérni kell, nem találgatni.

**Méret: M** · Adatoldali kockázat nincs, tisztán elrendezés.

---

## 4. pont — Az egyházmegyei oldalon nem látszódnak a szerepkörök

### Diagnózis — a felirat hazudik

A „👥 Szerepkörök" fül a **`ProfileCongregationsTab`**-ot rendereli (`diocese-dashboard-tabs.tsx:354`), ami a `profile_congregations` táblát olvassa — vagyis **kizárólag a könyvelői / egyházmegyei számvevői hozzárendeléseket**. A valódi szerepkör-lista (`listProfileRoles`) a megyei oldalon **sehol nem jelenik meg**.

> A rendszergazdai oldalon **ugyanez a komponens** „Könyvelői hozzárendelések" néven fut, másodlagos fülként. **A különbség maga a hiba.**

Emellé **négy valódi néma-üres csapda** áll:

| # | Csapda | Hely |
|---|---|---|
| 1 | `if (scopedCongIds) query.in(...)` — **az üres tömb JS-ben truthy**, tehát `in.()` fut → 0 sor, hiba nélkül | `profile-congregations-actions.ts:89` |
| 2 | `getScopedCongregationIds` **két gyökeresen más okra ad ugyanazt az üres tömböt**: „nincs beállított kerület" és „a lekérdezés HIBÁZOTT" | `admin-scope.ts:79, 86` |
| 3 | A kerületi RLS-policy **skalár-only, `profile_roles`-láb nélkül** | `2026-04-16-wc7-uj-szerepkorok.sql:169` |
| 4 | A fül `listAssignments()`-t hív **paraméter nélkül** → nem szűr a képernyőn látott egyházmegyére | `profile-congregations-tab.tsx:88` |

### 🔴 A legvalószínűbb egyetlen magyarázat
A hivatkozott policy forrásfájljának fejléce **szó szerint**: `-- ÁLLAPOT: VÁZLAT — FELHASZNÁLÓI ELLENŐRZÉSRE, MÉG NEM FUTTATVA` (`2026-04-16-wc7-uj-szerepkorok.sql:7`). Ez a repó **egyetlen ilyen jelölésű SQL-je**. Vagyis a policy **valószínűleg nem is létezik élesben**.

### ⚠️ Mellékesen: félrevezető fejléc-felirat
A fejléc a `profiles.role === 'admin'` (**rendszergazda**) értéket írja ki „**Kerületi admin**"-ként (`header-refined-v3.tsx:128`). Vagyis a képernyőképen látott „Kerületi admin" nagy valószínűséggel **rendszergazdát** jelent — más lekérdezési és más RLS-ágat.

### Előbb bizonyítás — ellenőrző SQL (csak olvas)

```sql
-- (1) KI VAGYOK? — ez dönti el, melyik ág fut
SELECT p.id, p.email, p.role AS skalar_role, p.status, p.district_id, p.diocese_id, p.congregation_id
FROM public.profiles p WHERE lower(p.email) = lower('endreszocs@gmail.com');

-- (2) VAN-E PROFILE_ROLES SOROM?
SELECT pr.scope, pr.scope_id, pr.role, pr.active, pr.approval_status, pr.granted_at
FROM public.profile_roles pr JOIN public.profiles p ON p.id = pr.profile_id
WHERE lower(p.email) = lower('endreszocs@gmail.com') ORDER BY pr.granted_at DESC;

-- (3) VAN-E EGYÁLTALÁN ADAT? (ha 0 → a fül HELYESEN üres, csak a felirat hazudik)
SELECT d2.name AS egyhazkerulet, d.name AS egyhazmegye,
       count(*) FILTER (WHERE pc.approval_status='pending')  AS fuggoben,
       count(*) FILTER (WHERE pc.approval_status='approved') AS aktiv,
       count(*) AS osszes
FROM public.profile_congregations pc
JOIN public.congregations c ON c.id = pc.congregation_id
LEFT JOIN public.dioceses  d  ON d.id = c.diocese_id
LEFT JOIN public.districts d2 ON d2.id = d.district_id
GROUP BY ROLLUP (d2.name, d.name) ORDER BY 1,2;

-- (4) MELY POLICY-K ÉLNEK MA A TÁBLÁN? (megvan-e egyáltalán a kerületi policy?)
SELECT policyname, cmd, permissive, roles, qual
FROM pg_policies WHERE schemaname='public' AND tablename='profile_congregations' ORDER BY policyname;

-- (5) VAN-E MÉG KERÜLETI LÁB A HELPERBEN? (false → az S1c szűkítés élesben van)
SELECT p.proname, (pg_get_functiondef(p.oid) LIKE '%current_user_district_ids%') AS van_keruleti_lab
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
  ('felettes_szint_gyulekezet_ids','felettes_szint_hozzaferese','current_user_district_ids');
```

**Döntési tábla:** (3) össz = 0 → csak a felirat-hiba valós. · (4) nincs kerületi policy → **ez az ok**. · (5) `false` → az S1c szűkítés zárja az utat.

### Javaslat (a bizonyítás után)
1. **Felirat és tartalom összehozása** — vagy a fül neve legyen „🧮 Könyvelői hozzárendelések", **vagy** kerüljön mellé egy valódi, hatókörre szűrt megyei szerepkör-lista (új `listProfileRolesForDiocese(dioceseId)` action).
2. **A néma üres lista megszüntetése** — az üres tömb váljon külön a „korlátlan" (null) esettől, beszédes üzenettel.
3. **A hatókör-feloldó „nem tudjuk" ága** — a `if (error) return []` helyett megkülönböztethető jelzés (a `profileRolesFeloldhato` bevált mintája szerint).
4. **Megyei szűrés a fülön** — `dioceseId` prop → `listAssignments({ dioceseId })`.
5. **414-csapda megelőzése** — ha a kerületben >100 gyülekezet van, **80-asával darabolni** vagy szerver-oldali JOIN-t használni. ⚠️ **A 2. lépés az 5. nélkül a tünetet üresről 414-es hibára fordítja.**
6. **RLS: `profile_roles`-láb a kerületi policy-ba** — ⚠️ **ez hatókört TÁGÍT, és ütközik a 2026-08-16-i K4 döntéssel.** Endre explicit döntése kell (lásd a döntési listát).
7. **Fejléc-felirat javítása** — `admin: 'Rendszergazda'`, és a hiányzó szerepek felvétele a meglévő `ROLE_LABELS` térképből.

### Szintek
- **Egyházközség:** közvetve — a lelkész a `/profile/kapcsolatok` oldalon hagyja jóvá ugyanezeket a sorokat; ha ott nem látja, a hozzárendelés örökre `pending` marad, **és a megyei lista tényszerűen üres lesz**.
- **Egyházmegye:** itt a tünet.
- **Egyházkerület:** `/dashboard-kerulet`-en **egyáltalán nincs** Szerepkörök fül. ✅ **De van működő minta:** a `district-actions.ts:1454` már ma olvas `profile_roles`-t kerületi hatókörben — nem kell újat kitalálni.

### Őrszem
**Nem új fájl:** a `selftest-hatokor.mjs` + `selftest-kerulet-hatokor.mjs` pontosan az app⇄RLS szerep-lista széthúzást őrzi — az assert ide való.

**Méret: M** (a 6. lépés RLS-döntéssel: L)

---

## 5. pont — Egyházmegyei pénzügy: befizető-kereső + nyugta CIF

### 5a) A befizető-kereső ma nem „csak személyeket" ad — **SEMMIT nem ad**

A kereső egyetlen forrása a `searchMembersForFinance`, ami a `getProfileCongregation()`-ből jövő `effectiveCongregationId`-re szűr — az viszont **felső szintű aktív profilnál definíció szerint `null`** (`effective-access.ts:414`), így a függvény a `penzugy/actions.ts:2830`-on **azonnal üres tömbbel tér vissza**.

Gyülekezetek és lelkészek keresésére **sehol nincs kód**. A `diocese_befizetes.befizeto_congregation_id` oszlop **létezik**, de az insert **hardkódolt `null`-t** ír bele (`:961`).

**A kerületnél rosszabb a helyzet:** oda **egyházmegyék** fizetnek, és a `district_befizetes`-en **nincs `befizeto_diocese_id` oszlop**.

✅ **Az olvasó oldal viszont bizonyítottan működik** — nem kell újat kitalálni:
`getDioceseVezetoJeloltek` már pontosan ezt csinálja (`congregations.eq('diocese_id')` → `profile_roles` lelkészek → `profiles.full_name`), és van kanonikus helper is (`getCongregationOfficials`).

⚠️ **A tünet három felületen jelenik meg, nem egyen:** `combined-entry-dialog.tsx:126`, `dispozitie-incasare-wizard.tsx:171`, `rental-contract-dialog.tsx:180` — az utóbbiban a hiba **`.catch(() => [])`-lel el is nyelődik**.

### 5b) A nyugta CIF-je

A sablonon **két külön CIF** van:
- a **fejléc** C.I.F.-je = a **kiállító** gyülekezeté (`congregations.adoszam`) ✅ helyes
- a **törzs „CIF" sora** = a **befizetőé** (`klienesseg_cui`) — **ezt egyetlen felület sem tölti ki**, tehát mindig `—` nyomtatódik

Az `issueChitanta` action **tudná** menteni, de **nincs UI-hívója**; az élő út (`autoIssueChitantaForBefizetes`) csak **nevet és lakcímet** ment.

**Három blokkoló a felső szintű nyugta-kiállításhoz:**
1. `oblio_szamlak.congregation_id` **NOT NULL + FK** a `congregations`-re — megyei/kerületi nyugta ma **fizikailag nem menthető**
2. a `next_chitanta_full` RPC csak `congregation_id`-re dolgozik
3. az RLS-policy kizárólag a `congregation_id`-re épül

### Javaslat — három fázisban

**FÁZIS 1 (5a) — scope-tudatos befizető-kereső.** Nincs blokkoló; SQL csak a kerülethez kell.
Új `searchIncomePartners(query)` action a `getFinanceScope()`-ra építve, **exhaustive switch**-csel:
`congregation` → a mai törzs **bájt-azonosan** (regressziót tilos okozni) · `diocese` → a megye gyülekezetei + lelkészeik · `district` → a kerület egyházmegyéi (+ esperesek).
A találat kapjon `kind` mezőt a csoportosított listához, és a mentés írja a valódi FK-t.

```sql
ALTER TABLE public.district_befizetes
  ADD COLUMN IF NOT EXISTS befizeto_diocese_id uuid
    REFERENCES public.dioceses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_district_befizetes_befizeto_diocese
  ON public.district_befizetes(befizeto_diocese_id) WHERE befizeto_diocese_id IS NOT NULL;
```

**FÁZIS 2a (5b, gyülekezeti szint) — a partner CIF/székhely végre kitöltődik.** SQL nem kötelező.
Jogi személynél `klienesseg_cui` ← partner CIF, `klienesseg_cim` ← **bejegyzett székhely** (nem lakcím).

**FÁZIS 2b (5b, megyei + kerületi kiállítás) — a nagy, blokkoló szelet.**
`oblio_szamlak` scope-oszlopok (`NOT VALID` + külön `VALIDATE`), új RLS-lábak, **új** `next_chitanta_full_scoped` RPC (a régit **nem szabad átírni** — élő út).

### ⚠️ Rejtett adatkockázat, amit MOST érdemes lezárni
Egy „örökölt" esperesnél (skalár `role='esperes'`, `profile_roles` sor **nélkül**) a finance-scope a megyei ágra fut, az `effectiveCongregationId` viszont a **saját gyülekezetére** esik — ekkor a nyugta-ikon **nem áll meg**. Olcsó előzetes javítás: a Kassza fül nyugta-útját a `gyulekezeti` kapu alá tenni.

### Szintek
- **Egyházközség:** 5a nem releváns (**a `szemely`-alapú keresőhöz tilos hozzányúlni**); 5b **igen** — jogi személynek kiállított nyugtán ma is `—` a CIF.
- **Egyházmegye:** a pont fő célpontja, **mindkét rész fennáll**.
- **Egyházkerület:** ugyanaz, egy fokkal súlyosabb (megyei befizető-FK **nem is létezik**).

### Kockázat
**MAGAS** — hivatalos, sorszámozott okirat és élő pénzügyi táblák. ⛔ A `DROP NOT NULL` a repó egyik legérzékenyebb tábláján. ⛔ **RLS-csapda:** `NULL` gyülekezet-azonosítójú soron a mai policy nem „tagad szépen", hanem a sor **láthatatlanná válik** — az új policy-lábaknak **ugyanabban a migrációban** kell elkészülniük. ⛔ **Sorszám-integritás:** a nyugtaszám hézagmentes, adóhatóság felé kimutatható. ⚠️ **Történeti hűség:** a partner CIF a nyugtán **pillanatfelvétel** — futásidejű JOIN visszamenőleg átírná a már aláírt nyugták képét.

**Méret: XL** (Fázis 1 önmagában: M)

---

## 6. pont — Román nyomtatványok: minden legyen román, a megnevezések is

### Diagnózis — két külön ok

**(1) Ahol VAN román név-ág, ott néma magyar visszaesés van.**
`congregationNameRo || congregationName` (`reporting.ts:384, 466, 596, 1112`) — ha a `nev_ro` üres, a papír **hang nélkül** magyar nevet ír. **Ez a képernyőkép oka:** a `dioceses.nev_ro` oszlop csak 2026-08-15 óta létezik, és **a meglévő megye-sorokon NULL** (a migráció ezt ki is mondja).

**(2) A nyomtatványok másik felében a román név-ág egyáltalán nem létezik:**
Decont · Decont de încasări · Kiadási kísérőív (BORDEROU DE PLĂȚI) · Monetár · Nyugtatömb-kimutatás · Registru inventar · Lista de inventariere · Fișa mijlocului fix · román Adeverință-sablonok · **(a felmérésből is kimaradt:)** Oblio számla-nyomtatvány és az **e-Factura felé menő számla**.

**(3) Külön, súlyosabb eset — a Chitanța kitalált adatot ír:**
a kerületi román nevet a kód **hardkódoltan `null`**-ra állítja egy **elavult TODO** miatt („az S2 hozza meg" — az S2 2026-08-16-án **lefutott**), a hiányt pedig **találgatással** pótolja: a **címerből következtet** kerületnévre, illetve `PAROHIA REFORMATĂ`-t ír. Hiányzó **magyar** névnél `REFORMÁTUS EGYHÁZKÖZSÉG`-et.

### ⛔ Amit TILOS „javítani" — dokumentumokkal alátámasztva

| Elem | Miért marad |
|---|---|
| **Kevert aláírás-sorok** („Întocmit — Készítette") | A **hivatalos** `Kimutatasok_2026.xlsx` maga írja így (`KONYVELES-2026-…:1123`). Endre kérése volt: *„egy román ajkú ellenőr nem tudta, melyik vonalra ki ír alá."* Jogalap: **Legea 489 Art. 16** — *„…se va ţine **ŞI** în limba română"* (**ŞI = IS**, tehát a kétnyelvűség jogszerű). |
| **„Unitate" / „Unitate - Egység" sáv** | Hivatalos elem: az `Elszamolas_2026.xlsx` pontosan így kezdődik (`:1416`). **Ne cseréld `Unitatea`-ra, ne töröld.** |
| **Fail-closed kapu a román névre** | A `finance-print-dialog.tsx:283–297` kommentje **expliciten megtiltja** — csak figyelmeztetés adható, tiltás nem. |

> Ez pontosan az a hibaosztály, amiről a memória szól: *„a fölöslegesnek látszó nyomtatvány-elem lehet HIVATALOSAN kötelező."*

### Egységes fallback-szabály
Ha **van** román név → `MAGYAR NÉV / ROMÁN NÉV` (a Számadás-borító már helyes mintája szerint).
Ha **nincs** → **csak a magyar név, sablon-kiegészítés NÉLKÜL**.
**SOHA ne generálj román nevet** prefixből, címerből vagy szint-felismerésből.

### Javaslat
1. **ADATOLDAL ELŐSZÖR** — ellenőrző SELECT (lásd alább), majd pótlás **a beállítás-varázslón át**, nem `UPDATE`-tel (a magyarból képzett román alak **hamis adat** lenne).
2. **Közös helper** (`hivatalosKetnyelvuNev`) — 12+ helyen kell ugyanaz a logika; közös helper nélkül a felületek széthúznak.
3. **A meglévő Ro-ág némaságának megszüntetése** (nem viselkedés-változás a papíron).
4. **A hiányzó Ro-ág bekötése** ívenként (típus + builder + hívó).
5. **Chitanța:** a `districts` lekérés kapja meg a `nev_ro`-t, az elavult TODO törölhető; a **találgató fallbackek helyett** a román sor **maradjon el**.
6. **Borító + lábléc:** a hardkódolt „/ EPARHIA REFORMATĂ" helyett a valódi `districts.nev_ro`.
7. **Desktop-hívók is** (a `fisa.ts` román név-mezője a desktop `leltar-page.tsx`-ből is hívódik).

**Ellenőrző SQL — ezt a felmérés nem adta meg, pótlom:**

```sql
SELECT 'dioceses'     AS tabla, count(*) AS osszes,
       count(*) FILTER (WHERE coalesce(nev_ro,'') = '') AS nincs_roman_nev
FROM public.dioceses
UNION ALL
SELECT 'districts', count(*), count(*) FILTER (WHERE coalesce(nev_ro,'') = '')
FROM public.districts
UNION ALL
SELECT 'congregations', count(*), count(*) FILTER (WHERE coalesce(nev_ro,'') = '')
FROM public.congregations;

-- Melyik konkrét egyházmegyénél hiányzik? (a képernyőkép szerinti Kézdi-Orbai várhatóan itt lesz)
SELECT d2.name AS egyhazkerulet, d.name AS egyhazmegye, d.nev_ro
FROM public.dioceses d LEFT JOIN public.districts d2 ON d2.id = d.district_id
WHERE coalesce(d.nev_ro,'') = '' ORDER BY 1, 2;
```

### Szintek
- **Egyházközség:** a legszélesebben érintett — a `nev_ro` itt **opcionális** a varázslóban, tehát a magyar visszaesés **tömeges**.
- **Egyházmegye:** ez a képernyőképen látható eset.
- **Egyházkerület:** szűkebben — a borító román neve **működik** (kötelező mező), de a Chitanța kerületi román neve hardkódolt `null`, a megyei borítón pedig sablonszöveg.

### Őrszem
**Nem új fájl:** a `selftest-kerulet-nyomtatvany.mjs` már a `budget-reporting.ts`-t őrzi — a román entitásnév-helper assertje ide való.
**Két külön mutáns kell:** a `chitanta/print.ts:180` visszaírása **ÉS** a `chitanta-print-template.tsx:84` címer-fallback visszaírása — mert külön fájlban élnek, és az egyik javítása elrejti a másikat.

**Méret: L**

---

## 7. pont — Rendszergazdai szervezeti áttekintő (kerület → megye → egyházközség)

### Diagnózis — mi van ma, mi nincs

**Nincs semmilyen 3-szintű fa vagy hierarchia-nézet.** Az admin Gyülekezetek oldala **két szintig** jut (egyházmegye → gyülekezet); a `DioceseGroup` típusban **ott van** a `district_id`, de a felület **soha nem csoportosít vele**. Az /admin Áttekintés `dioceseStats`-a szintén kerület-vak — így **két kerület 24 egyházmegyéje egyetlen, rendezetlen listában olvad össze**.

**✅ Az alapok megvannak, nem kell újraépíteni:**
- a séma három szintje kész (`districts` ↔ `dioceses.district_id` ↔ `congregations.diocese_id`)
- a `districts` tábla a memóriában rögzített „3 oszlop" állapotból **kinőtt**: az S2 migráció **~28 törzsadat-oszlopot** adott hozzá (`nev_ro`, `cif`, cím, bank, püspök, címer/pecsét/aláírás)
- a `listScopeOptions` **már ma** egyetlen `Promise.all`-ban, **hatókörre szűrve** lekéri mind a három szintet — a fa adat-akciója ennek a **kiterjesztése**, nem új implementáció
- **két kerület, 24 egyházmegye** a seedek szerint (Erdélyi: 15, Királyhágómelléki: 9)

### 🔴 A fő buktató nem az adat, hanem a JOG
A **K4-döntés** (S1c migráció) a kerületi adminról **levette** a gyülekezeti sorok olvasását. Ezért ugyanaz a fa a rendszergazdának és a kerületi adminnak **két különböző adatforrásból** kell hogy tápláljon:

| | Rendszergazda | Kerületi admin |
|---|---|---|
| Taglétszám | `admin_overview_member_counts()` (SECURITY **INVOKER**) | `district_member_counts(p_district_id)` (SECURITY **DEFINER**) |
| Beállítás-hiányok | ✅ látja | ⛔ **kimarad** (K4) |

⛔ **Csapda:** ha a kerületi ág a kézenfekvő `admin_overview_member_counts()`-ot hívja, az S1c után **0 sort ad** → a fa minden gyülekezetnél **„0 tag"-ot mutat, hibaüzenet nélkül**. Kötelező a `tagszamElerheto` minta: **„nem tudjuk" ≠ 0**.

### Javaslat
- **Új útvonal:** `/admin/szervezet` — „Szervezeti áttekintő"
- **Új action:** `getSzervezetiFa()` — 4–5 párhuzamos SELECT + JS-aggregálás (nem RPC), a `listScopeOptions` bevált mintájára
- **A meglévő `_shared` admin-készletet használni** (`AdminSkeleton`, `AdminEmptyState`, `StatusBadge`), a `congregations-tab` kereső/rendezés/„Mindet kinyit" mintáit átemelni
- **Mit mutasson:** kerület (név + román név + címer + „N megye · M gyülekezet · K tag") → megye (esperes neve) → gyülekezet (tagszám, felhasználók szerepkör-jelvényekkel, aktív/inaktív, és **csak rendszergazdának**: „N kötelező mező hiányzik")
- **„Egyházmegye nélkül" és „Egyházkerület nélkül" ág** a végén (árva-kezelés)
- **Menüpont:** az admin almenübe a „Gyülekezetek" **elé**; a kerületi oldalsávra is (szűkített tartalommal)
- **SQL nem kell** — minden adat meglévő táblából/RPC-ből jön

### Kockázat
⛔ **Néma országos szivárgás** — a projekt kétszer megélt hibaosztálya: ha a fa-lekérdezés szűrő nélkül kérdez, a kerületi admin **a másik kerület teljes fáját** látná. Kötelező a `getScopedDioceseIds`/`getScopedCongregationIds` **és** a `districtIds.length === 0 → üres` fail-closed ág.
⛔ **K4-sértés** — a beállítás-hiányok a `bealitas` táblából jönnének, amit a kerület nem olvashat.
⚠️ **`.in()` URL-korlát** — 80-asával darabolni.

### Őrszem
**Nem új fájl:** a `selftest-attekintes.mjs` már az `overview-shared.ts` `tagszamElerheto` mezőjét őrzi — a fa „nem tudjuk ≠ 0" assertje ennek a bővítése.

**Méret: L**

---

## 8. pont — „Adatok betöltése…" villog, de nincs üzenet

### Diagnózis — ez nem lassú betöltés, hanem **önfenntartó végtelen hurok**

```
BudgetPrintDialogBody effect deps  →  [..., onToast]        (onToast INSTABIL)
     ↓
budget-print-dialog.tsx:395        →  onToast={(msg) => …}   (inline = minden renderben ÚJ)
     ↓
budget-print-dialog.tsx:256        →  setEvBeallitas(új objektum)  (SZÜLŐ állapota!)
     ↓
szülő újrarenderel → új onToast → az effect újra fut → setLoading(true) → új lekérés → …
```

A felirat ~200–400 ms-onként megjelenik és eltűnik = **villog**, közben **végtelen hálózati kérés-sorozat** fut.

**Üzenet azért nincs, mert a felület kétállapotú:** `loading && <div>Adatok betöltése...</div>` — nincs sem „nincs adat", sem „betöltve N tétel", sem hiba-ág. A `.then()`-nek **nincs `.catch()`-e**, ezért elutasított promise-nál a felirat **örökre bent ragad**.

**Negatív kontrollok (ezek teszik bizonyossá a diagnózist):**
- a `finance-print-dialog.tsx`-ben **`useState` nulla találat** → ott ugyanaz az instabil prop-készlet **nem zár hurkot**
- a desktop wrapper `useCallback`-kel memoizál és nincs saját state-je → **a hiba webes**
- a `next.config.ts` **nem** kapcsolja be a React Compilert → az inline propok tényleg új identitást kapnak; **a hurok nem elméleti**

### Ugyanez a minta máshol
| Hely | Tünet |
|---|---|
| `worklog-print-dialog.tsx:84` | nincs `.catch()` → **beragad** (nem villog, a deps stabil) |
| `voter-print-dialog.tsx:72` | nincs `.catch()` → **beragad** |
| `FinancePrintDialogBody.tsx:228` | nincs error/üres ág → a szép betöltő **örökké pörög** |
| `MonetaryTab.tsx:200` + `monetary-tab-v2.tsx` | **minden szülő-renderre újra lekérdez** és visszaesik betöltő-állapotba |
| `inventory-print-dialog-v2.tsx:69` | ✅ **pozitív példa** — `try/catch/finally` (de a hibát némán nyeli) |

### Javaslat
1. **A hurok elvágása** — `useCallback` a wrapper `onToast`/`buildReport` propjaira, **ÉS** öv-és-nadrágszíj a közös Body-ban: az `onToast` `useRef`-be tükrözve, kivéve a deps közül. *(Ez az egyetlen, ami egy jövőbeli hanyag wrappert is megvéd.)*
2. **Háromállapotú (valójában négyágú) visszajelzés** diszkriminált unióval:
   - `tolt` → „Adatok betöltése…" *(marad, de most már ténylegesen véges)*
   - `kesz` → „**Betöltve: N költségvetési sor (2026)**"
   - `ures` → „A 2026. évhez még nincs rögzített költségvetési sor. A nyomtatvány elkészül, de minden terv-oszlopa nulla lesz."
   - `hiba` → piros, `role="alert"`, **+ „Újrapróbálom" gomb**
   Kötelező `.catch()` — enélkül egy dobó wrappernél a felirat örökre bent ragad.
3. **Gomb-tiltás hiba-állapotban is** — ma a `loading` csak a töltést fogja, a hibát nem, tehát **hibás betöltés után kinyomtatható egy üres terv-oszlopú hivatalos ív**. Ez a 8. pont valódi kockázata.
4. **Ugyanez a Pénzügyi nyomtatási központban** (a 250 ms-os villódzás-védelem **maradjon**).
5. **A rokon nyomtatási központok** ugyanezzel a mintával (külön, kisebb kör).

### Szintek
**Mindhárom szint UGYANAZT a kódot futtatja** (`/penzugy` → `FinanceTabs` → `BudgetPrintDialog`, csak a `scope` prop más) — **nincs külön megyei/kerületi nyomtatási központ**. A javítás egy helyen rendezi mind a hármat; **új másolatot ne készíts**.
⚠️ **Kerületi specifikum:** ha a kiállító neve hiányzik, a hurok **minden körében új hiba-toastot lő ki** (toast-áradat).

### ⚠️ Kapcsolódó, eddig össze nem kötött hiba
A megyei felhasználó a Pénzügyi nyomtatási központban `'Nincs aktív gyülekezet.'` hibaszöveget kap — ez a **saját hatókörében értelmezhetetlen**. A kerületre van fail-closed kapu, **a megyére nincs**. Ez a „nincs értelmes üzenet" panasz megyei megfelelője.

### Őrszem — ⚠️ ez új infrastruktúra
A `scripts/` alatt **egyetlen komponens-render teszt sincs**. A render-számláló őrszem (assert: az `onLoadBudgetRows` **pontosan egyszer** hívódik megnyitásonként) **új infrastruktúrát igényel** — emiatt a 8. pont mérete őrszemmel együtt **alábecsült**.

**Méret: M** (őrszemmel: L) · **SQL nem kell**, tisztán kliensoldali, visszagörgethető. A hurok megszüntetése **mérhetően csökkenti a Supabase-terhelést**.

---

## 9. pont — ⏳ üresen maradt

A listád 9. pontja szám nélkül maradt. Ha van még észrevétel, írd meg, és beillesztem a tervbe.

---

## 10. Döntést igénylő kérdések — ezekre kérek választ a jóváhagyással

| # | Kérdés | Javasolt alapértelmezés |
|---|---|---|
| **D1** | **4. pont:** a megyei „Szerepkörök" fül **átnevezendő** („Könyvelői hozzárendelések"), vagy **valódi szerepkör-listát is** kapjon mellé? | Mindkettő: átnevezés **most**, valódi lista **külön szeletben**. |
| **D2** | **4. pont:** engedjük-e, hogy a kerületi admin lássa a `profile_congregations` sorokat? **Ez tágítja a hatókört és ütközik a 2026-08-16-i K4 döntéssel.** | **Igen, de kivételként**: csak erre az egy táblára, a `felettes_szint_gyulekezet_ids()` visszatágítása **nélkül**. |
| **D3** | **3. pont:** a naptár maradjon a hármas csempesorban (fluid rács + kéthasáb), vagy **kapjon saját, teljes szélességű sort**? *(Az utóbbi visszavonná a 2026-08-10-i kérésedet.)* | Maradjon a soron belül; a fluid rács + kéthasáb megoldja a panaszt. |
| **D4** | **5b:** a megyei/kerületi **nyugta-kiállítás** most épüljön meg (XL, élő pénzügyi tábla módosításával), vagy előbb csak az 5a + a gyülekezeti CIF? | Előbb 5a + 2a; a 2b **külön kör**. |
| **D5** | **5a:** a **lelkész mint befizető** strukturáltan is tárolódjon (`befizeto_profile_id`), vagy elég a `forrasa` szabad szöveg? | Elég a szabad szöveg egyelőre. |
| **D6** | **6. pont:** a Chitanța hiányzó román nevénél a román sor **maradjon el** (kevesebb szöveg), vagy maradjon a mai sablon? *(A mai megoldás kitalált adatot nyomtat.)* | Maradjon el — kitalált adat hivatalos bizonylaton nem maradhat. |
| **D7** | **1. pont:** a Fázis 2 (teljes fluid átírás) is menjen, vagy elég a Fázis 1 (a sáv megszűnik, a kompozíció változatlan)? | Fázis 1 **most**, Fázis 2 külön — a fogadóképernyő az első benyomás. |
| **D8** | **7. pont:** a **kerületi admin** is lássa a saját kerülete fáját (szűkített tartalommal), vagy csak rendszergazda? | Lássa — de fail-closed, beállítás-hiányok nélkül (K4). |
| **D9** | **2. pont:** a **B1–B4 biztonsági lánc** előzze meg a listád többi pontját, vagy a megszokott sorrendben menjen? | **Előzze meg.** Ezek nem élményhibák: idegen gyülekezet anyakönyvébe engednek írni, illetve auditálatlanul feloldják a véglegesítést. |
| **D10** | **2. pont:** a **B4 javítása viselkedés-változás** — a véglegesítés-zászló ezután csak szerver-akción / RPC-n át lesz írható. Elfogadható? | Igen — enélkül a zár-rendszer csak látszat. A legitim utakat (véglegesítés, megyei feloldás) át kell terelni, ez a munka java része. |

---

## 11. Javasolt sorrend — hullámokban

| Hullám | Tartalom | Miért itt |
|---|---|---|
| **H0 — bizonyítás** | A 4. és 6. pont **ellenőrző SQL-jei** + a **11 biztonsági találat élő-állapot SQL-jei** (mind csak olvas) | Enélkül a 4. és 6. pont javítása **vaktában** menne, a biztonsági javítás pedig **nem létező policy-t** módosítana. A 6. pont valószínűleg **adathiány**. |
| **H1 — 🚨 a biztonsági lánc** | **B1 + B2** (`admin_access_requests` `WITH CHECK` + az RPC-k önálló bizonyítéka) · **B4** (véglegesítés-zászló) · **B11** (nyers DELETE) · **B3** + **B9** (XSS + e-mail-injekció) | A B1–B2 idegen gyülekezet **hivatalos anyakönyvébe** enged írni; a B4+B11 **auditálatlan** módosítás hivatalos pénzügyi anyagon. A B3+B9 tisztán app-oldali, SQL nélküli, azonnal kiadható. |
| **H2 — gyors győzelmek** | **1/Fázis 1** (splash sáv) · **3** (naptár) · **8** (villogás) · fejléc-felirat (4/7. lépés) | Mind **látható**, mind **SQL nélküli**, mind **visszagörgethető**. Ez a három panasz a napi élményt rontja. |
| **H3 — a néma üresek** | **4** (feliratok + néma üres lista + 414-védelem) · **7** (szervezeti fa) | Adatszivárgás-kockázatot **csökkentenek** (fail-closed), SQL csak a D2 döntéstől függően. |
| **H4 — a román ívek** | **6** teljes (közös helper + minden ív + Chitanța + desktop) | A H0 adat-pótlása **után** lesz látható eredménye. |
| **H5 — pénzügy** | **5a** + **5b/Fázis 2a** | Új oszlop kell (`befizeto_diocese_id`), de nem bontja meg a nyugta-táblát. |
| **H6 — külön kör** | **5b/Fázis 2b** (megyei/kerületi nyugta-kiállítás) · **1/Fázis 2** (fluid splash) · a **maradék biztonsági tételek** (B5–B8, B10, B12–B16) | XL méret, élő pénzügyi tábla, hivatalos sorszám. **Saját tervdokumentumot érdemel.** |

---

## 12. SQL-teendők összefoglalása

| Pont | Kell SQL? | Mi |
|---|---|---|
| 1, 3, 8 | ❌ nem | — |
| **2 (biztonság)** | ✅ **igen, 11 találathoz** | **Először ellenőrző** (`pg_policies`, `role_table_grants`), utána: `WITH CHECK` a `admin_access_requests`-re (B1) · `delegalt_hozzaferes_ervenyes()` helper (B2) · trigger vagy RPC a `bealitas` zászlókra (B4) · oszlop-szintű `GRANT` a `congregations`-re (B5) · a `logos` policy hatókörhöz kötése (B6) · a `befizetescel`/`kiadascel` írás lezárása (B7) · `REVOKE DELETE` a pénzügyi táblákról (B11) · oszlop-szintű `GRANT` a `profile_roles`-ra (B12) |
| **4** | ⚠️ **először ELLENŐRZŐ** (5 SELECT) | Utána, **D2 döntéstől függően**, RLS-láb a `profile_congregations`-re |
| **5** | ✅ igen | `district_befizetes.befizeto_diocese_id` (Fázis 1) · `oblio_szamlak` scope-oszlopok (Fázis 2b) |
| **6** | ⚠️ **csak ellenőrző SELECT** | A pótlás **a varázslón át**, nem `UPDATE`-tel |
| 7 | ❌ nem | Minden adat meglévő táblából/RPC-ből. ⚠️ Élesben ellenőrizendő, hogy az S2 migráció lefutott-e |

### 🔑 Környezeti változó — ezt csak te tudod ellenőrizni

**Be van állítva a `VAULT_ENCRYPTION_KEY` a Railway env-ben?** Ha nincs, a titok-széf (Oblio-kulcs, Drive-titok) **némán a 6 jegyű god-mode PIN-nel titkosít** (B14) — és a figyelmeztetés halott kód, tehát soha nem szólalt meg. ⚠️ **A kulcscsere újratitkosító lépés nélkül adatvesztést okoz.**

> **A memória szabálya:** *a migrációs fájl NEM bizonyíték arra, hogy élesben lefutott.* Minden SQL kapjon `0. SZAKASZ` állapotfelmérést és záró fail-closed őrszemet.

---

## 13. Őrszem-terv

**28 selftest létezik, mind a 27 fut a láncban** — **minden új selftestet kötelező felvenni a `package.json:17` sorba**, különben soha nem fut.

| Pont | Meglévőt bővítünk | Új kell |
|---|---|---|
| 1 | `selftest-splash-stage.mjs` (G6/G6b/G7/**G8 = desktop!**) | — |
| **2** | `selftest-hatokor.mjs` (a SECURITY DEFINER RPC-k bizonyíték-forrása) | ✅ **HTML-escape őrszem** (jegyzőkönyv + e-mail-sablonok + CSV) |
| 3 | — | ✅ CSS-geometria őrszem |
| 4 | `selftest-hatokor.mjs` + `selftest-kerulet-hatokor.mjs` | — |
| 5, 7 | `selftest-module-scope.mjs` + `selftest-finance-scope.mjs` (exhaustive switch) | — |
| 6 | `selftest-kerulet-nyomtatvany.mjs` | — |
| 7 | `selftest-attekintes.mjs` („nem tudjuk" ≠ 0) | — |
| 8 | — | ⚠️ **render-számláló — új infrastruktúra** |

**Negatív asszert kötelező** (a „negatív asszert nélkül vak" szabály). Konkrét mutánsok:
- **1:** a mostani szabály újrajátszva 2000×950-en → 155,6 px sáv → a G6 mércéjének buknia kell
- **2 (B3):** egy `<img src=x onerror=…>` határozat-szöveggel generált HTML-ben **ne legyen `onerror=` string**
- **2 (B9):** a sablon kapjon `reason: '<img src=x onerror=1>'`-et → a kimenetben **ne legyen `<img`**
- **2 (B13):** `=1+1` cella → a kimenetben `"'=1+1"` álljon, ne `"=1+1"`
- **3:** a `kartoteka.css:2070` `max-width` visszaírása → bukjon *(a szöveges ellenőrzésnél a kommenteket ki kell szedni!)*
- **6:** **két külön mutáns** — `chitanta/print.ts:180` **és** `chitanta-print-template.tsx:84`
- **8:** inline `onToast` + szülő-state → az `onLoadBudgetRows` **pontosan egyszer** hívódjon megnyitásonként

> ⚠️ **A B1/B2/B4/B11 nem őrizhető selftesttel** — azok adatbázis-oldali szabályok. Ott az „őrszem" a migráció végén futó **fail-closed ellenőrző blokk**: próbáld meg a régi támadást (pl. `INSERT … status='approved'` idegen gyülekezetre), és a **helyes eredmény hibaüzenet**, nem sikeres beszúrás.

---

## 14. Amit a felmérés NEM old meg (nyitva marad)

- a megyei `getYearFinanceRecords` **hatókör-vaksága** (dokumentált, külön ügy)
- a **publikus pecsét-bucket** kérdése — a biztonsági kör **megerősítette, hogy ez rögzített, vállalt döntés**, nem hiba; de a B6 (kerület-vak Storage-policy) miatt **újra elő fog jönni**
- a **desktop-paritás** építése általában (a splash és a Fișa csak két szelete)
- a `packages/ui-app/.../oblio-invoice-builder.ts` — **az e-Factura felé menő számla**, a rendszer legmagasabb tétjű román dokumentuma, ami a román név-leltárból is kimaradt
- a **hitelesített felület CSP-je**: a biztonsági kör ezt **megcáfolta** (a fegyverzet megvan), de a `/gy/:path*` publikus úton az `'unsafe-eval'` **tényleg ott van** — külön mérlegelendő

---

## 15. Mi történjen most

1. **Olvasd át**, és jelezd, ha valamit félreértettem vagy másképp gondolsz.
2. **Válaszolj a 10. fejezet D1–D10 kérdéseire** (elég annyi, hogy „a javasolt alapértelmezés jó", ahol egyetértesz).
3. **Futtasd le a H0 ellenőrző SQL-eket** — a 4. és 6. pontét, illetve a biztonsági találatok élő-állapot lekérdezéseit. Ezek **csak olvasnak**, semmit nem írnak. Az eredmény alapján több pont diagnózisa élesedik vagy elesik.
4. **Ellenőrizd a `VAULT_ENCRYPTION_KEY`-t** a Railway env-ben (B14).
5. **Írd meg a 9. pontot**, ha van még észrevételed.

Ezután kezdem a megvalósítást — fázisonként, ág → PR → CI → merge, CHANGELOG-gal, ahogy szoktuk.
