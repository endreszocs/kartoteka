# KARTOTEKA — a feltöltés-első számla-egyeztetési lánc átvilágítása

**Dátum**: 2026-09-03
**Módszer**: 131-ágenses workflow (4 térképező + 13 párhuzamos vizsgálati szempont + soronkénti adversariális cáfolat + 3 hiánykritika + szintézis), ~12,2M token, 1476 eszközhívás
**Futás**: `wf_bc0ea48c-1a8` · nyers 92 találat → cáfolat után 92 → deduplikálás után **91**
**Állapot**: felmérés kész, implementáció nem kezdődött el

> ⚠️ **AZ ELLENŐRZÉS CSONKA.** Minden találat átment EGY adversariális cáfolat-körön (külön ágens
> próbálta megcáfolni a forráskódban, „bizonytalanság esetén cáfolva" alapértelmezéssel). A tervezett
> MÁSODIK kör — a P0/P1 találatok kereszttüze két további, független lencsével (reprodukálhatóság,
> következmény) — az első futásban a munkamenet token-limitjén elbukott, és az újrafuttatásból
> szándékosan kimaradt. **A P0/P1 besorolások tehát egy ellenőrzésen alapulnak, nem hármon** —
> javítás előtt a legsúlyosabbakat érdemes emberi szemmel visszaellenőrizni.

**Melléklet**: [talalatok.json](./KARTOTEKA-szamla-feltoltes-lanc-audit-2026-09-03-talalatok.json) — mind a 91 találat gépi formában (bizonyíték-idézet, bukási forgatókönyv, javítási javaslat, a cáfoló ágens indoklása).
**Testvér-jelentés**: az Oblio (mappa-alapú) lánc átvilágítása — külön fájlban.

---

## Tárgy

A webes (feltöltés-első) szállítói számla-lánc és viszonya az asztali (mappa-alapú) Oblio-egyeztetéshez.
**91 megerősített találat** — a fejezet-számok szerinti bontás: **3 P0 · 37 P1 · 42 P2 · 9 P3**.

---

## 1. Vezetői összefoglaló

A feltöltés-első lánc alapszerkezete jó: a hatókör-kezelés végig **fail-closed** (minden action `getCongId()`-vel kezd, és `!congId` esetén azonnal visszatér — szamla-actions.ts:65, :364, :418, :456, :543, :566, :591), a Storage-út három helyen kikényszerített, az XML-parser saját, biztonságos tokenizálót használ (entitás-bomba ellen véd), és a feldolgozás újrafuttatható. A repó legfájóbb hibaosztálya — a NULL skalár hatókör miatti cross-tenant szivárgás — **ebben a láncban nem áll fenn**.

A baj máshol van: **a rendszer két külön igazságforrást tart ugyanarról a valóságról** (a webes `szallitoi_szamla` + `szallitoi_szamla_kiadas`, és az asztali `oblio_kiadas_match`), amelyek között nincs FK, nincs közös kulcs-ellenőrzés, és **egyetlen kódhely sem olvassa a kettőt együtt egyeztetési céllal**. Ebből kettős könyvelés keletkezhet: ugyanaz az e-Factura egyszerre lehet az asztali úton a #A, a webes úton a #B kiadáshoz kötve, és **mindkét felület zöld pipát mutat** (F1, F5).

A számlák azonosítása ingatag: az `anaf_uuid` a gyakori esetben **nem az XML-ből, hanem a fájlnévből** származik, és a végső visszaesés maga a csupasz fájlnév — így két különböző szállító `factura.xml`-je egyetlen kulcson ütközik, a második pedig „már rögzítve" felirattal **nyom nélkül elvész** (F2, F10). A könyvelési kapcsolatnak nincs kiadás-oldali fedezet-őre: egy 500 RON-os kifizetés **korlátlan számú** 500 RON-os számlát „fedezhet", és mindegyik kifizetettként rejtőzik el (F17). A kiadás stornója vagy törlése pedig nem bontja a kapcsolatot és nem vonja vissza a „kifizetve" jelzőt — a számla tévesen „Könyvelve" marad, sőt a nyomtatott, kifelé menő adatlap egy stornózott tételt sorol fel könyvelési tételként (F3).

A megfelelőségi kapuk közül kettő szerkezetileg vak: az év-záró „minden e-Factura bevezetve?" ellenőrzés **mindig zöld** (a forrása egy `kiadas_id NOT NULL` tábla, F6), a 60 napos ANAF-csengő pedig a webes útra vak (F36). A törvény által 5–10 évig megőrzendő számla-fájlok **nincsenek a napi mentésben** (F63), a gyülekezeti adattörlés pedig a metaadatot törli, a fájlt a bucketben hagyja (F7, F28).

Az őrszemek nagy része **látszat-védelem**: a kapcsolás pénzügyi szemantikájára (fedezet, stornó, deviza, jóváíró) **egyetlen asszert sincs** (F76, F87), az aláírás-őr egy halott webes modulra horgonyoz, miközben az igazi desktop ingest (Rust) máig a régi, hibás prefix-szűrőt futtatja (F34), és a 414-es darabolás-őr egy bizonyíthatóan elérhetetlen ágat véd, miközben a valóban korlátlan `.in()` őrizetlen (F35).

**Javaslat:** az F1, F2, F3, F17 és F6 a lánc gerince — ezek nélkül a rendszer pénzügyi állításai nem megbízhatók. Ezek javítása egy fókuszált körben (≈2 hét) elvégezhető, és a többi találat nagy része már csak ezek után nyer értelmet.

---

## 2. Hogyan működik ma — az adatfolyam

**(1) Feltöltés.** Két belépő (Dokumentumtár fül; „Számlák egyeztetése" nagy dropzone), közös `DokumentumtarUploadDialog`. A kliens elő-validál (MIME-whitelist, 0 bájt, 25 MB — dokumentumtar-upload-dialog.tsx:100-114), majd fájlonként: `prepareDokumentumUpload` kiszámolja az utat `${congId}/${kategoria}/${uuid}-${tisztított_név}` (actions.ts:180-181), a fájl a **böngészőből** megy a privát bucketbe a felhasználó saját JWT-jével (upload-dialog.tsx:152-158), végül `registerDokumentum` írja a metaadat-sort prefix-őrrel (actions.ts:216-222). A szerver a bájtokat ebben a szakaszban soha nem látja.

**(2) Feldolgozás.** Ha `kategoria === 'szallitoi-szamlak'` és a név `.zip`/`.xml`, indul a `feldolgozSzamlaZipDokumentum` (szamla-actions.ts:61). Letölti a fájlt, `kibontSzamlaZip`-pel max 2 szint mélyen kibontja (aláírás-fájlok kiszűrve), párosítja az XML–PDF párokat, majd `parseUblSzamla`-val kinyeri a ~8 mezőt, és **5 validációs kapun** átengedve (parse-hiba / ismeretlen típus / nincs anaf_uuid / nincs végösszeg / rossz pénznem) számlánként **egyenként** insertel a `szallitoi_szamla`-ba. Tranzakció nincs; a védelem az idempotencia (UNIQUE + `.is(mezo, null)` őr).

**(3) Kapcsolás.** A „Számlák" nézet sárga „Nincs a könyvelésben" jelzőt ad, ha nincs `szallitoi_szamla_kiadas` sor. A `SzamlaKapcsolasDialog` a legutóbbi 25 élő kiadást kínálja, összeg- és név-pontozással; a `linkSzamlaKiadas` fillérre pontos fedezet-őrrel ír (szamla-actions.ts:493-513). Teljes fedezetnél a **kliens** hívja a `setSzamlaKifizetve(true)`-t.

**(4) Visszacsatolás.** A Tranzakciók fül zöld pipája a két forrás **uniójából** épül (transactions-tab.tsx:85-87) — ez az egyetlen összefésülés, és az is csak megjelenítési célú. Az év-záró `finalization-actions.ts` a `szallitoi_szamla`-t **egyáltalán nem olvassa**.

---

## 3. A két párhuzamos egyeztetési út — a brief kiemelt kérdése

### 3.1 Mit derítettünk ki

| | **(B) Webes, feltöltés-első** | **(A) Asztali, mappa-alapú** |
|---|---|---|
| Tábla | `szallitoi_szamla` + `szallitoi_szamla_kiadas` | `oblio_kiadas_match` |
| Kardinalitás | **n:m**, összeg-résszel (`UNIQUE (szamla_id, kiadas_id)`, SQL:146) | 1:1 az `anaf_uuid`-ra (SQL:75-76); `kiadas_id`-ra nincs unique |
| Fájl-megőrzés | Supabase Storage (de nincs a mentésben) | **csak a lelkész gépén** (`local_file_relpath`, SQL:53) |
| Deviza | nincs szűrő — bármit átenged | `if (!isRon(...)) continue` (oblio-matcher.ts:324, :385, :444) |
| Jóváíró | nincs szűrő | `if (documentType === 'credit_note') continue` (:327, :386, :445) |
| Kulcs-levezetés | `anafUuidFajlnevbol` (ubl-parser.ts:490) | `extractAnafUuidFromFilename` (ui-app/.../ubl-parser.ts:310) |

**A két tábla között semmilyen kapcsolat nincs**: nincs FK, nincs közös unique, nincs join, és egyetlen kódhely sem olvassa a kettőt együtt (a `szallitoi_szamla` szó egyik Oblio-migrációban sem szerepel; a `szamla-actions.ts`-ben az `oblio_kiadas_match` szó egyszer sem).

### 3.2 Ütközhetnek-e? — Igen, három úton

1. **Kettős kiadás-könyvelés (F1, P0).** A desktop „Bevezetés új kiadásként" gombja (desktop-oblio-tab.tsx:587) feltétel nélkül ír új `kiadas` sort, és a `szallitoi_szamla`-t soha nem nézi. Három szerkezeti ok garantálja, hogy épp a weben rögzített kifizetést ne találja meg: (a) a webes kiadás-mentés a CUI-t mindig `null`-ra írja (penzugy/actions.ts:859), így az `auto_cui` ág sosem sül el; (b) deviza kihagyva; (c) jóváíró kihagyva.
2. **Ugyanaz a számla két kiadáshoz (F5, P1).** A webes jelző csak a saját tábláját olvassa, a `linkSzamlaKiadas` sem néz rá az `oblio_kiadas_match`-re — az asztali úton már párosított számla „Nincs a könyvelésben"-ként kapcsolható egy másik kiadáshoz. Mindkét felület zöld marad.
3. **Ellentmondó KPI-k (F4, P1).** Az Oblio-fül „Nincs SPV-ben" piros kártyája csak az `oblio_kiadas_match`-ből számol (OblioEllenorzesTab.tsx:718-722), a Tranzakciók fül viszont a két forrás uniójából (transactions-tab.tsx:85-87). Ugyanarra a 40 kiadásra az egyik képernyő „40 · Nincs SPV-ben · Kifizetés előtt ellenőrizd!", a másik 40 zöld pipát mutat.

**Súlyosbító (F15, F2):** a két út **két külön implementációból** vezeti le a közös `anaf_uuid` kulcsot, és ezek eltérő értéket adnak — futtatva: `4214783.xml.zip` → web `"4214783"`, ui-app `"4214783.xml"`. A webes komment (ubl-parser.ts:486-488) azt állítja, hogy „azonos szemantika" — **ez nem igaz**. Vagyis egy jövőbeli kereszt-ellenőrzés **hamis „nincs ütközés"-t adna**.

### 3.3 Javaslat

**Rövid távon (a döntés előtt is elvégezhető):**
- A `matchXmlsToKiadas` `existing` listájába (desktop-oblio-tab.tsx:326) kerüljenek be a `szallitoi_szamla ⋈ szallitoi_szamla_kiadas` párok is → a weben lekötött kiadás ne legyen szabad jelölt.
- A `handleIntroduceExpense` (desktop-oblio-tab.tsx:587) insert előtt kérdezze le a `szallitoi_szamla`-t az `anaf_uuid`-ra, és fail-closed módon tiltsa a bevezetést, ha találat van.
- A `linkSzamlaKiadas` (szamla-actions.ts:450) és a `saveOblioMatch` (oblio-ellenorzes-actions.ts:151) szimmetrikusan nézzen rá a másik táblára.
- **Előfeltétel:** a két kulcs-levezetést **egy közös implementációra** kell húzni, különben a kereszt-ellenőrzés némán vak.

**Középtávon — döntés kell Endrétől:** vagy (a) a két tábla egyesítése (a `oblio_kiadas_match` legyen a `szallitoi_szamla` egy `forras='mappa'` változata), vagy (b) egy felügyeleti nézet, amely azonos `anaf_uuid`-ot eltérő `kiadas_id`-vel talál a két táblában, és **hangos sávot mutat mindkét felületen**.

---

## 4. P0 — azonnali

### P0-1 · A desktop „Bevezetés új kiadásként" vak a webes párosításra → kettős könyvelés
**Hol:** `apps/desktop/src/components/desktop-oblio-tab.tsx:587` (a gomb: :960-969; a `loadData` csak két táblát olvas: :232-247; az `existing` halmaz: :326-329)
**Miért baj a lelkész munkájában:** A gyülekezet 500 EUR-s számlát kap. A lelkész a weben feltölti, rögzíti a kifizetést, összekapcsolja → „Könyvelve — BCR EUR" + „Kifizetve". Egy hét múlva ugyanezt az ANAF-ZIP-et az asztali programban is beolvassa. A matcher a `!isRon('EUR')` miatt mind a három ágon átugorja (oblio-matcher.ts:324, :385, :444), tehát a sor „nincs párosítva", ott a zöld gomb, és a magyarázat **kifejezetten kezdeményezésre buzdít** (oblio-matcher.ts:581). Rákattint → **kiadas #B keletkezik 500 RON összeggel** (a `brut` a nyers EUR-érték, átváltás nélkül — desktop-oblio-tab.tsx:610). A főkönyvben most **két kiadás** áll ugyanarról a számláról, a következő frissítéskor a matcher a #B-hez auto-párosítja (a #B-n már van CUI, :615), és a Tranzakciók fülön **mindkét sor zöld pipát kap**. Az éves Számadás 500 RON-nal túlkölt. Ugyanez áll jóváírónál (visszajáró pénz könyvelődik kiadásként) és minden RON-os számlánál, ahol a kifizetés 60 napnál későbbi a számla keltétől (oblio-matcher.ts:343) — ami épp a webes úton tipikus, mert az előkitöltés a **mai napot** írja (kifizetetlen-main.tsx:205).
**Mit kell tenni:** (1) fail-closed `szallitoi_szamla` duplikátum-kapu a `handleIntroduceExpense` insertje elé, beszédes magyar üzenettel; (2) az `existing` listába a webes párok; (3) a varázsló utasítsa el a devizás és jóváíró számlát; (4) felügyeleti lekérdezés az ütközésekre.
**Ráfordítás:** **M**

### P0-2 · Az `anaf_uuid` nem azonosító: fájlnév-alapú visszaesés → kettős rögzítés VAGY néma számlavesztés
**Hol:** `apps/web/lib/oblio/ubl-parser.ts:514` (a visszaesés); a védelem egyetlen lába: `2026-08-15-szallitoi-szamlak.sql:85-86`; a lookup: `szamla-actions.ts:213-221`
**Miért baj:** Ha az XML-ben nincs gyökér-szintű `cbc:UUID` (**az RO_CIUS számlákon jellemzően nincs** — ez a normál, nem a kivételes út), a kulcs a fájlnévből jön, és az utolsó visszaesés maga a csupasz alapnév. A projekt saját selftestje ezt **elvárásként rögzíti** (selftest-ubl-parser.mjs:273: `anafUuidFajlnevbol('abc.pdf') === 'abc'`).
- **(A) Kettős rögzítés:** ugyanaz a valós számla két úton érkezik — SPV-ből `SUPPLIER_EFI123_6245906283.xml` (kulcs: `6245906283`), a szállítótól e-mailben `Factura_martie.xml` (kulcs: `Factura_martie`). **Két sor egy tartozásról**, mindkettő a Fizetendő kártyán, mindkettő külön kiadáshoz kapcsolható.
- **(B) Néma vesztés:** két **különböző** szállító `factura.xml`-je azonos kulcsot kap (a `csakFajlnev` eldobja a mappa-utat, zip-kibonto.ts:60-63). Az első bekerül; a második „Már korábban rögzített számlák (nem duplikáltuk)" felirattal jelenik meg (szamla-feldolgozas-eredmeny.tsx:78), és **soha nem rögzül**. A második szállító követelése nyom nélkül eltűnik.
- **Kis-nagybetű-érzékeny** is: `factura.xml` ≠ `Factura.xml` → két sor (F10).
- **A hivatalos íven** „ANAF-azonosító: factura" jelenik meg (szamla/[id]/page.tsx) — fájlnév-töredék hivatalos rovatban.
**Mit kell tenni:** Ha nincs valódi `cbc:UUID`, **ne essünk vissza a csupasz fájlnévre**. A kulcs legyen az identitás — `${szallito_cui}|${szamla_szam}|${kiallitas_datum}` normalizálva —, a fájlnév-futam csak 8+ jegyű szám esetén. Ha egyik sem áll elő: hangos hiba (a :190-es mintára). DB-szintű második vonal: `CREATE UNIQUE INDEX ... (congregation_id, upper(btrim(szallito_cui)), upper(btrim(szamla_szam))) WHERE ... IS NOT NULL`. A `selftest-ubl-parser.mjs:273` **át kell írni**, különben az őr a hibát őrzi.
**Ráfordítás:** **M** (+ egyszeri diagnosztikai SQL a már bent lévő sorokra)

### P0-3 · A kiadás stornója/törlése nem bontja a kapcsolatot és nem vonja vissza a „kifizetve"-t
**Hol:** `apps/web/app/(dashboard)/dokumentumtar/szamla-actions.ts:612` (a zöld jelző forrása, szűrő nélkül); a mentéskori szűrő: `:481-484`; `listSzamlaKiadasKapcsolatok`: `:568-573`; adatlap: `szamla/[id]/page.tsx:40-43`
**Miért baj:** A `deleted`/`stornozott` szűrő **csak a mentés pillanatában** él. A `ON DELETE CASCADE` (SQL:143-144) sosem sül el, mert a kiadás mindig **soft** delete (`penzugy/actions.ts:2886`) illetve storno (`edit-storno-actions.ts:633-634`); a storno-kaszkád explicit csak az `oblio_szamlak`-ig ér el (:673-675). A lelkész elgépeli a kiadást (5000 helyett 500), összekapcsolja → kifizetve=true. Másnap stornózza és rögzíti a helyeset. **Eredmény:** (a) a lista zöld „Könyvelve — Kassza"; (b) a számla kiesik a „Nincs a könyvelésben" szűrőből; (c) **a nyomtatható, kifelé menő adatlap egy stornózott tételt sorol fel „Könyvelési tétel(ek)" cím alatt** (page.tsx:179-211); (d) a számla „Kifizetve"-ként rejtve marad; (e) az **új, helyes kiadás nem kapcsolható**, mert a halott kapcsolat lefedi a teljes összeget. Semmi nem utal arra, hogy előbb bontani kell.
**Mit kell tenni:** **Olvasás:** minden kapcsolat-olvasó szűrjön élő kiadásra — de a kiszűrt sort **ne tüntesse el némán**, hanem piros „a kapcsolt kiadás stornózva — bontsd a kapcsolatot" állapotként mutassa. **Írás:** a `stornoTransaction`/`deleteTransaction` kaszkádoljon a `szallitoi_szamla_kiadas`-ra, és állítsa vissza a `kifizetve`-t; a kaszkád hibája hangos `figyelmeztetes`-ként érjen vissza (az `oblio_szamlak` mintájára, :685-690). Egyszeri SQL a már meglévő halott kapcsolatokra.
**Ráfordítás:** **M**

---

## 5. P1 — sürgős

### 5.1 A két igazságforrás következményei

| # | Találat | Hol | Ráford. |
|---|---|---|---|
| F4 | A „Nincs SPV-ben" piros KPI csak az `oblio_kiadas_match`-ből számol, a Tranzakciók fül a két forrás uniójából → **ugyanarra a 40 kiadásra ellentmondó képernyők**. A megosztott komponens típusa nem is ismeri a hidat (`feltoltottParok` hiányzik). | `OblioEllenorzesTab.tsx:718-722` ⇄ `transactions-tab.tsx:85-87` | S |
| F5 | A webes párosítás-jelző és a `linkSzamlaKiadas` vak az `oblio_kiadas_match`-re → az asztali úton már párosított számla egy **másik** kiadáshoz kapcsolható; mindkét felület zöld. | `szamla-actions.ts:612`, `:450-536` | M |
| F6 | **Az év-záró e-Factura kapu szerkezetileg soha nem tud jelezni**: `oblioXmls.filter(x => !x.kiadas_id)` egy `kiadas_id NOT NULL` táblán — mindig üres, mindig „Mind a N bevezetve". A `szallitoi_szamla`-t a fájl nem is olvassa. Az ígért átfedés-ellenőrzés (`oblioMatchesRes`) soha nem íródott meg. | `finalization-actions.ts:318`, forrás :164-170; `wc2-10-oblio-ellenorzes.sql:43` | M |
| F15 | A két út **két külön implementációból** vezeti le a kulcsot, eltérő eredménnyel; a „azonos szemantika" komment hamis. | `ubl-parser.ts:490` ⇄ `ui-app/.../ubl-parser.ts:310` | S |

### 5.2 Kapcsolás-integritás

| # | Találat | Hol | Ráford. |
|---|---|---|---|
| **F17** | **Nincs kiadás-oldali fedezet-őr**: egy 500 RON-os kifizetéshez korlátlan sok 500 RON-os számla köthető, mindegyik „Könyvelve" + „Kifizetve". 1500 RON tartozás rejtőzik el 500 RON mögött. Az egész repóban egyetlen lekérdezés sem aggregál `kiadas_id` szerint. | `szamla-actions.ts:494`; `SQL:146` | M |
| F18 | A „Könyvelve" jelző **puszta létezés-alapú**: egy 50 RON-os részkapcsolás egy 5000 RON-os számlán is teljes zöldet ad, és kiveszi a „Nincs a könyvelésben" szűrőből. A mező alapértéke egy kattintással kitölthető. | `szamla-egyeztetes-main.tsx:359`; `szamla-kapcsolas-dialog.tsx:136` | M |
| F19 | **Pénznem-vak fedezet-őr**: 100 EUR-s számlát egy 100 RON-os kiadás „teljesen kifizet" (`10000 >= 10000`), a számla eltűnik a kifizetetlen listából. Az asztali matcher ezt explicit tiltja. | `szamla-actions.ts:507`; vö. `oblio-matcher.ts:385` | M |
| F20 | **A jóváíró (CreditNote) kiadáshoz kapcsolható** és kifizetettnek jelölhető — fordított irányú könyvelés. A soron ott a „Kifizetés rögzítése" gomb, holott a szállító tartozik nekünk. A rendszer máshol tudja az előjelet (`kifizetetlen-main.tsx:144`). | `szamla-actions.ts:450`; `kifizetetlen-main.tsx:567` | S |
| F53*(P2)* | Véglegesített év kiadásához is szabadon kapcsolható/bontható — év-kapu, megerősítés és változásnapló nélkül, **hard DELETE**. | `szamla-actions.ts:477`, `:539-559` | M |

### 5.3 Adatminőség — a parser és a rögzítés

| # | Találat | Hol | Ráford. |
|---|---|---|---|
| F11 | **Negatív végösszegű `<Invoice>` (román storno, InvoiceTypeCode=384) pozitív tartozásként rögzül**: az irány csak a gyökér-elemnévből jön, az előjel `Math.abs`-szal elvész, az `InvoiceTypeCode`-ot a parser sehol nem olvassa. A −119 RON-ból +119 RON tartozás lesz, javíthatatlanul (nincs UPDATE grant az `osszeg`-re). | `szamla-actions.ts:294`; `ubl-parser.ts:374-376`, `:433-438` | M |
| F12 | **Az összeg-parszolóban nincs alak-ellenőrzés**: `1,234` → **1.234** (1000× kevesebb, hiba nélkül); `1,234.56` és `1.234,56` → a számla elutasítva; `0x64` → 100; `1e3` → 1000. Ugyanez a testvér-parserben is. Az `osszeg` utólag nem javítható. | `ubl-parser.ts:309`; `ui-app/.../ubl-parser.ts:98-103` | S |
| F13 | **PayableAmount=0.00 (teljes előleg) → 0 Ft-os számla**, amihez egyetlen kiadás sem kapcsolható (`CHECK (osszeg_resz > 0)`), örökre a kifizetetlen listában. A böngészős testvér ugyanarra a fájlra 595-öt ad (`??` vs `||`). | `ubl-parser.ts:436` ⇄ `ui-app/.../ubl-parser.ts:281-283` | S |
| F14 | Kulcs-ütközéskor a duplikátum-ág **tartalmi ellenőrzés nélkül** a MÁSIK számla XML/PDF-jét köti a meglévő sorhoz, és a **tárolt** számlaszámot jelenti → az A számla adatalapja mögött a B szállító hiteles bizonylata áll. | `szamla-actions.ts:251`, `:271-276` | S |

### 5.4 Robusztusság — a lánc elakadásai

| # | Találat | Hol | Ráford. |
|---|---|---|---|
| F16/F33/F78 | **A feltöltő dialógus véglegesen befagy**: `handleUpload` teljes törzse try/catch/finally nélkül; a lezáró `setUploading(null)` / `setFeldolgozasFut(false)` csak a boldog ágon fut, a bezárás `if (isUploading) return`-nel tiltott. A már feltöltött objektum kompenzáció nélkül árván marad. **Ez pontosan az a hibaosztály, amit a lista-betöltőn már javítottak** — de az őr kizárólag a `const load = useCallback` blokkot nézi. A repóban **nincs `vercel.json` és nincs `maxDuration`** a láncban; a mért kiváltó ok a ~100 mp-es proxy-elvágás. | `dokumentumtar-upload-dialog.tsx:119`, `:218`, `:251-256` | S |
| F8 | **Egyetlen sérült vagy 0 bájtos BELSŐ ZIP megsemmisíti az egész köteget**: a rekurzió elutasítása a legkülső catch-ig fut, ami a már kibontott fájlokat eldobja. 40-ből 39 hibátlan számla vész el, angol JSZip-üzenettel. Az XML/PDF-ág ugyanezekre az esetekre csak bejegyzés-szinten áll meg. | `zip-kibonto.ts:132`, `:85-89`; `szamla-actions.ts:135` | S |
| F9/F68 | **ZIP-bomba: a 100 MB-os őr a teljes kicsomagolás UTÁN mér.** Mérve: 2 MB-os ZIP → 3,65 GB csúcs-RSS; a kicsomagolt méret a központi könyvtárból **előre olvasható** lenne (`_data.uncompressedSize`). A `next start` egyetlen Node-folyamat → az OOM **minden gyülekezetet** érint. | `zip-kibonto.ts:141`, `:127-131` | S |
| F31 | **Számlánként 7 szekvenciális Supabase-kör**: 100 számlánál 702 egymás utáni kör, kötegelés nélkül. A dialógus közben zárolva. | `szamla-actions.ts:281` | M |
| F35 | A **414-es darabolás-őr elérhetetlen ágat véd** (≤30 azonosító), miközben a ZIP-feldolgozó `.in('anaf_uuid', …)`-ja **darabolatlan**, akár 250 azonosítóval → 150 számlás éves ZIP-nél 414, az egész köteg feldolgozhatatlan. | `szamla-actions.ts:213-217` vs `:610`; `selftest-…-ux.mjs:88` | S |
| F67 | A ZIP-bejegyzés-számláló **az aláírás-fájlokat és a belső ZIP-eket is beleszámolja** az 500-as őrbe → az ANAF lapos formátumnál ~250, az Oblio Wallet-exportnál ~125 számlánál áll le. A lelkész nem tud SPV-ZIP-et darabolni. | `zip-kibonto.ts:106` | S |

### 5.5 Igazság és teljesség a listákban

| # | Találat | Hol | Ráford. |
|---|---|---|---|
| F21/F30 | **A kifizetetlen helyi lista 200 tételnél némán csonkul**, jelző nélkül — az eredmény-típusban nincs `helyiTobbLehet`, miközben az Oblio-ágnak van sávja. A „Fizetendő" kártya ~13%-kal kevesebbet mutat, a fejléc magabiztosan „200 tétel". | `kifizetetlen-actions.ts:41`, `:96`; `kifizetetlen-types.ts:47-58` | S |
| F22 | **Túlbecsült tartozás**: a részben kapcsolt számla **bruttó** összege szerepel a listában, az összegzésben és a rögzítő-előkitöltésben — 1000 RON-ból 600 már könyvelve, mégis 1000 látszik, és a rögzítő 1000-et tölt elő. | `kifizetetlen-actions.ts:89`, `:122`; `kifizetetlen-main.tsx:211` | M |
| F23 | **A számla iránya a forrásból következik, nem a tartalomból**: a parser kinyeri a `vevoCui`-t „ellenőrzéshez", de a rendszer eldobja → a saját, KIÁLLÍTOTT számla is „fizetendő" szállítói számlává válik, és az Oblio-ág ugyanazt kintlévőségként is hozza → **kétszer számolva**. | `kifizetetlen-actions.ts:115`; `ubl-parser.ts:48-51` | M |
| F32 | A „Nincs a könyvelésben" szűrő **csak a betöltött 30 soron fut**, a lapozó a szűretlen összesből → „Nincs a szűrésnek megfelelő számla" 350 számla és „1 / 12" mellett. A képernyő fő rendeltetése hiúsul meg. | `szamla-egyeztetes-main.tsx:202` | M |
| F39 | A jelölt-lista **fixen a legutóbbi 25 kiadás, kereső nélkül** → visszamenőleges ZIP-feltöltésnél a helyes kiadás elérhetetlen, és a felület azt tanácsolja: „előbb rögzítsd a kifizetést" — **kettős kiadás-rögzítés felé terel**. A repóban él egy tesztelt, használatlan matcher (`oblio-matcher.ts:272`). | `kifizetetlen-actions.ts:294`; `szamla-kapcsolas-dialog.tsx:296-297` | M |
| F55*(P2)* | A kifizetetlen-jelvény az Oblio-kintlévőségeket is számolja, de a célfül (Számlák) csak a feltöltött számlákat mutatja → „3 kifizetetlen" → **üres képernyő**. | `kifizetetlen-belepo.tsx:59`; `szamlak-egyeztetese-tabs.tsx:164` | S |

### 5.6 Biztonság, jogosultság, megfelelőség

| # | Találat | Hol | Ráford. |
|---|---|---|---|
| **F24** | **A pénzügyi irat-táblák profile_roles RLS-lába szerep-szűrő nélküli**: egy `custom` gyülekezeti szerep **üres permissions-szel is** teljes olvasás/írás/**törlés** jogot kap a szállítói számlákra és a dokumentumtárra. A repó ugyanezt a lábat **négy nappal korábban** megszigorította a tagnyilvántartásnál (`AND pr.role IN ('lelkesz','konyvelo')`), és a COMMENT a felelősséget az appra hárította — **az app ezt soha nem vette át** (nulla `permissions.*` a láncban). A CNP védve van, a pénzügyi irat nem. | `szallitoi-szamlak.sql:206` (+ 10 további policy); vö. `2026-08-11-globalis-hozzaferes-szukites.sql:2347` | M |
| **F25** | Ugyanezen policyk profile_roles-lába **nem visel `profiles.status='active'` szűrőt sem** — az első láb (`current_user_congregation_id()`) igen. Egy 'pending'-re állított fiók élő sessionnel megtartja a teljes számla- és irattár-hozzáférést, DELETE-tel együtt (a layout `redirect('/pending')`-el, de **nem jelentkeztet ki**). | `szallitoi-szamlak.sql:208`; `layout.tsx:144` | S |
| F26 | **Scope-divergencia:** a kerületi admin „Belépés a gyülekezetbe" után a Pénzügyet látja, a Dokumentumtárat **némán üresnek** — az app-hatókör három forrásból jöhet, az RLS kettőt ismer. Nincs hibaüzenet: a lista `error: null`-lal 0 sort ad. | `szallitoi-szamlak.sql:214`; `effective-access.ts:423-424, 446-453` | M |
| F27 | **A végleges dokumentum-törlés audit-naplózás és jogosultsági kapu nélkül fut** — a megőrzési kötelezettség alatt álló e-Factura nyom nélkül semmisül meg. A testvér-action-fájl minden párosítást naplóz (`oblio_match_save/remove/bulk_save`), a dokumentumtár **nulla** `logAuditEvent`-et tartalmaz. | `dokumentumtar/actions.ts:419` | S |
| F7/F28 | **A wipe és a gyülekezet-törlés minden dokumentum-metaadatot töröl, de egyetlen fájlt sem a bucketből.** A napló teljes törlést jelent; a fájlok (5 év szállítói számlája, szerződések, kivonatok) a felületről **elérhetetlen és törölhetetlen** módon maradnak. A séma számított az árvákra („a takarítást funkcionálisan akadályozná"), a takarító **soha nem íródott meg**. Ha egy érintett GDPR 17. szerinti törlést kér, a napló és a valóság ellentmond. | `admin/wipe-actions.ts:49`; `dokumentumtar-gyulekezeti-fajlok.sql:289-290` | M |
| F29 | **A `wipe_finance_data` allowlistjéből kimaradt a szállítói számla** (az `oblio_kiadas_match` benne van): a `kiadas` törlése **némán kaszkádol** a kapcsolatokra, az audit alulszámol, és marad 47 `kifizetve=true` fantom-számla NULLA kapcsolattal — amiket a duplikátum-védelem miatt újratölteni sem lehet. | `2026-08-29-wipe-monetar.sql:34` | S |
| F36 | **A 60 napos ANAF-csengő vak a feltöltés-első útra**: a webes feltöltés nem nyúl a `utolso_xml_letoltes_at`-hoz. Csak webet használó gyülekezetnél a csengő **soha nem szól**; átállásnál viszont **hamisan riaszt**, és a lelkész megtanulja figyelmen kívül hagyni. | `szamla-actions.ts:352`; `wc2-10-oblio-ellenorzes.sql:194-201` | S |
| F40 | **A PDF/papír szállítói számla néma sikerrel eltűnik**: nincs kézi rögzítés, a `szallitoi_szamla`-ba az egyetlen út az UBL-XML — miközben a dropzone `accept=".zip,.xml,.pdf"` és a szöveg PDF-et ígér. A kisvállalkozó papírszámlája sehol nem jelenik meg. | `szamla-actions.ts:281`; `szamla-egyeztetes-main.tsx:246` | M |
| F34 | **Az aláírás-őr „desktop mappaolvasó" lába HALOTT webes modult néz**, az IGAZI desktop ingest (Rust) máig a **régi prefix-szűrőt** futtatja (`starts_with("semnatura_")`) → a `..._semnatura_...` nevű ANAF-aláírások **mind a 14** párosítatlan „számlaként" jelennek meg. **Ez pontosan az a tünet, amit az őr javítottnak nyilvánít**, és a `npm run selftest` közben zöld. | `selftest-szamla-zip-alairas.mjs:59`; `src-tauri/src/excel.rs:839`, `:954` | M |

---

## 6. P2 — robusztussági és UX-hiányok

### 6.1 Feltöltés és bemeneti kapuk
- **A dropzone PDF-et ígér, a feldolgozó soha nem nézi meg** → zöld toast, számla nem keletkezik, visszaút nincs (`szamla-egyeztetes-main.tsx:246` vs `upload-dialog.tsx:203-206`).
- **Rossz mappa-választás = néma zsákutca**: átkategorizálás nem létezik, a `kategoria` oszlopra nincs UPDATE grant (`SQL:130-133`).
- **`accept` kiterjesztés-alapú, a validáció MIME-alapú** → a picker felajánl olyat, amit a következő képernyő elutasít (7-Zippel mentett ZIP `file.type`-ja üres).
- **Nincs szerver-oldali tekintély a bucket fölött (F43)**: a gyülekezeti tag a konzolból közvetlenül **törölhet** objektumot (a sor bent marad, a lista hazudik) és a `registerDokumentum` megkerülésével **feltölthet** — láthatatlan, törölhetetlen tartalom halmozódhat. Javítás: `createSignedUploadUrl` + szűkített DELETE-policy.
- **Ál-„defense in depth" (F83)**: mindhárom kapu ugyanazt a kliens-küldte `file.type`-ot nézi, sosem a tartalmat; a `mime_type` utólag javíthatatlan.
- **Árva Storage-objektumok**: a kompenzáció a `remove()` néma üres-lista no-op esetére vak (amit a `purgeDokumentum` explicit kezel, `actions.ts:400-417`); a hivatkozás-mentés bukása kompenzálatlan → **minden újrafuttatás új másolatot hagy** (F50).
- **`registerDokumentum` nem ellenőrzi, hogy az objektum feltöltődött-e**; a `meretBytes` a klienstől jön.

### 6.2 Feldolgozás és parser
- **Fix UTF-8 dekódolás** — ISO-8859-2/CP1250 XML-nél U+FFFD a szállítónévben, javíthatatlanul (nincs UPDATE grant).
- **Pénznem-szemantika széthúz (F48)**: a webes út a `LEI`-t nem normalizálja RON-ra és a hiányzó pénznemet elutasítja; az asztali mindkettőt RON-ként kezeli → „1 000 RON + 500 LEI" összegzés, és a két felület ugyanarról a számláról ellentmond.
- **Dátum-ellenőrzés csak alak-szintű (F49)**: `2026-02-30` a Postgresig jut, 22008-cal **az egész számlát eldobja** egyetlen nem kötelező mező miatt, nyers angol üzenettel.
- **Nincs kriptográfiai aláírás-ellenőrzés és vevő-CUI egyeztetés (F45)**: bármely well-formed `<Invoice>` szállítói számlává válik, az aláírás-XML nem őrződik meg, a nyomtatott ív mégis azt állítja: „a hiteles bizonylat az ANAF e-Factura XML".
- **Nincs jele, hogy egy ZIP-et már feldolgoztak** — az állapot csak újrafeldolgozással deríthető ki.
- **A piros „NEM kerültek be" panel a fájl-csatolási hibákra is illik (F51)**, pedig a sor rögzült → a lelkész újratölt, és „14 duplikátum"-ot kap.
- **A JSZip angol üzenete fordítatlanul jut a lelkészhez (F47)**, és a részeredmény (`kihagyott`) elvész.

### 6.3 Versenyhelyzet és tranzakció
- **A fedezet-őr zár nélküli read-then-write** (F54): két fül egyszerre 1000+1000 RON-t kapcsolhat egy 1000 RON-os számlára. DB-szintű aggregáló CHECK nem lehetséges — **trigger igen, és nincs**.
- **A kifizetve-döntést a KLIENS hozza** a megnyitáskori, elavulható összegből → a teljesen lefedett számla kifizetetlen maradhat.
- **A kapcsolótábla nem ellenőrzi DB-szinten a kiadás gyülekezetét** (F86, F89): a számla-oldalon összetett FK áll, a kiadás-oldalon sima. Idegen-adat szivárgás nincs, de a saját sorra nézve önsértő állapot előállítható, és a 23503 létezés-orákulumot ad.

### 6.4 Kifizetetlen ablak
- **Az Oblio body-szintű `status` ellenőrizetlen (F57)**: HTTP 200 + `{status:401}` → néma üres kintlévőség-lista, hibajelzés nélkül, 60 mp-re cache-elve. A repó másik hívója explicit őrt tesz (`penzugy/oblio-actions.ts:196`).
- **A cache negatív eredményt is tárol, gyülekezet-kulccsal (F59)**: egy felhasználó timeoutja 60 mp-ig **mindenkinek** kiszolgálódik.
- **A `!cfg` ág nem különbözteti meg az „nincs Oblio-fiók"-ot az RLS-megtagadástól (F60)** — scope-divergenciánál némán „nincs beállítva".
- **A lejárat UTC-ből számol (F58)**: hajnali 1–3 között a lejárt-jelzés egy napot csúszik; **év-fordulón az előkitöltött dátum az előző évbe esik**, miközben az `evre` mező az újat mondja.
- **Az Oblio-lista 100 eleme nem determinált (F61)**: nincs `orderBy`/`offset`; épp a legrégebben lejárt kintlévőségek maradhatnak ki, és a UI csak a mennyiségről figyelmeztet.
- **A jelvény némán elhallgatja a levágást (F56)**: az `oblioTobbLehet`-et nem olvassa.

### 6.5 Teljesítmény és UX
- **A számla-kereső nem debounce-ol (F69)**: 9 karakter → 27 DB-kör, és **elavult válasz felülírhatja a frisset** (nincs generációs őr). A testvér-képernyő ugyanebben a modulban helyesen csinálja (`dokumentumtar-main.tsx:169-173`).
- **A párosítás-lekérdezés hibája elrejti az egész számla-listát**, a közvetlenül fölötte álló komment állításával **ellentétben** (`szamla-egyeztetes-main.tsx:107-108` vs `:303-310`).
- **A „Kifizetve" pipa elvesztette a figyelmeztetést (F70)**: a lecserélt képernyőn AdminConfirmDialog magyarázta („Kiadás-kapcsolat NEM készül"), a fő nézetben csupasz, ~20 px-es checkbox — telefonon egy súrolás kifizetettre állítja a számlát.
- **Érintőfelület-regresszió (F73)**: a Számlák nézetben egyetlen `min-h-11` sincs (28–30 px célpontok), miközben a modul többi része explicit 44 px; a `dokumentumtar-main.tsx:644` komment 40 px-et állít, a kód 28-at ad.
- **Elkapatlan Promise-elutasítások (F74)**: örökre pörgő „PDF" gomb, véglegesen beragadó „Kifizetetlen számlák betöltése…", mobilon üres about:blank fülön ragadó felhasználó.
- **Nincs bájt-szintű haladásjelzés és nincs megszakítás (F72)**: 24 MB-os ZIP-nél a csík percekig „0 / 1 fájl kész"-en áll, a „pár másodperc" ígéret mellett.
- **A nyomtatható adatlap átmeneti DB-hibára is néma 404-et ad (F71)** — a DDL utáni 503-ablakban a lelkész azt hiszi, eltűnt a számlája.
- **A `window.open` opener-rel nyit (F44)** a mindig lefutó ágon (a tartalék ágon már van `noopener`).
- **A letöltési link `&`/`#`-et tartalmazó fájlnévnél elrontja a mentett nevet (F84)** — a `file_name` utólag nem javítható.
- **Második, élő kapcsoló felület maradt** (`/dokumentumtar/kifizetetlen`), amit az őr épp a fülekről tiltott ki → a javítások könnyen csak az egyik felületen történnek meg.
- **A desktopra mutató kivezetés link nélküli, `text-slate-400` (~2,5:1 kontraszt, WCAG AA alatt)** — pedig van kész `/offline` letöltő oldal.

### 6.6 Mentés és visszaállítás
- **A megőrzési archívum kimarad a mentésből (F63)**: a bucket egyetlen táblát sem ment, a panel ezt ki is mondja — de a Dokumentumtárban erről semmi nem szól. A törvény által megkövetelt fájl **egyetlen példányban** létezik.
- **A besorolás `ON CONFLICT DO NOTHING` (F64)**: egy már bent lévő `reteg = NULL` sort nem tud javítani, és az **véglegesen blokkolja a gyülekezet visszaállítását** (a preview egyetlen blokkoló táblánál megtagadja az egészet). A repó ezt a hibaosztályt már megfizette és le is írta; a későbbi migráció helyesen `DO UPDATE`-et használ.
- **Az asztali út semmilyen fájlt nem archivál a szerveren (F65)** — a `local_file_relpath` egy meghalt gép mappájára mutat, és a rendszer sehol nem figyelmezteti a lelkészt.
- **A visszaállítás-előnézet mintacímkéje nyers UUID (F66)**: a fehérlista nem ismeri a `file_name` / `szallito_nev` / `szamla_szam` mezőket — „mit veszítek, ha megnyomom?" itt megválaszolhatatlan.

### 6.7 Az őrszemek vaksága
- **A kapcsolás pénzügyi szemantikájára NULLA asszert** (F76, F87): a `linkSzamlaKiadas`, `unlinkSzamlaKiadas`, `setSzamlaKifizetve` egyike sincs megnevezve egyetlen selftestben sem. A P0-k bármelyike bevezethető zöld CI mellett.
- **A Signature-háló őre két független regexet néz a teljes fájlon (F46, F75)** — mérve: a `kihagyott.push` → `hibak.push` csere, a `||` → `&&` csere és a teljes blokk törlése **mind zöld marad**.
- **A „betöltő nem ragadhat be" asszert egész fájlra fut (F77)** — a fájlban két `finally` van; a régi minta zöld őr mellett visszaállítható, és **két testvérfájl ma is azt viseli**.
- **A hatókör (fail-closed `getCongId()`, `.eq('congregation_id')`) egyetlen őrben sem szerepel** (F62): a `congregation` szó előfordulása mindkét őrben **0**.
- **A duplikátum-védelem és az idempotencia lefedetlen (F52)**, sőt a `selftest-ubl-parser.mjs:273` **elvárásként rögzíti a hibás visszaesést** — a helyes javítás pirosra futtatja az őrt.
- **Az egyetlen Oblio-varázsló őr halott kódútra horgonyoz (F42)**; a halott `createKiadasFromXmlAndMatch` mégis **élő `'use server'` végpont**, ami a `kiadas`-ba közvetlenül insertel, megkerülve az iratszám-duplikátum kaput.
- **Az őr a fül-fájlt nézi, a route-ot nem (F79)** — a `KifizetetlenMain` saját útvonalon él és ugyanabba a kapcsolótáblába ír.
- **A Kifizetetlen ablak egyetlen invariánsát sem őrzi selftest (F88).**
- **Az egyetlen valódi viselkedés-mérő őr némán `exit(0)`-zik (F91)**, ha a `typescript` nem oldható fel — a gyökér package.json nem is deklarálja.

---

## 7. P3 — higiénia

1. **Kétszeres lista-újratöltés** a számla-úton (`onUploaded()` a :189-en és a :231-en).
2. **A feldolgozás-eredmény elrejti a sikertelen feltöltések újrapróbálását** — a lábléc gombjai lecserélődnek.
3. **A számla-képernyő nem üríti a függő fájllistát bezáráskor** (a dokumentumtár-oldal igen).
4. **A ZIP-kibontás hibájánál a részeredmény elvész** (`szamla-actions.ts:135` korai visszatérése).
5. **A parser kinyeri a `vevoNev`/`vevoCui`-t, a rendszer eldobja** — a beépített ellenőrzési lehetőség kihasználatlan.
6. **Nincs ÁFA-bontás a szerver-oldali parserben (F85)** — a testvér-parser kinyeri; ráadásul annak doc-kommentje rossz mezőt nevez meg (`LineExtensionAmount` helyett `TaxExclusiveAmount` a kód).
7. **A hibás számla-adatlap nem törölhető, holott a jog megvan** — `GRANT DELETE` + policy létezik, de a kódbázisban egyetlen `.delete()` sincs a `szallitoi_szamla`-n.

---

## 8. Fejlesztési javaslatok (a hibáktól elkülönítve)

| Javaslat | Hatás | Ráford. | Hol |
|---|---|---|---|
| **Párosítási javaslat-motor**: a repóban **már él** egy tiszta, tesztelt, DOM-mentes matcher (CUI + összeg + dátum tűrés, deviza/jóváíró kizárással) — csak a webes út nem használja. Új action `javasoltSzamlaParositasok(ev)` + „Párosítási javaslatok (N)" sáv Elfogadás/Elvetés gombokkal. ⚠️ mély import (`@kartoteka/ui-app/src/finance/oblio/oblio-matcher`), **soha a barrelből**. | **Nagy** — 40 dialógus helyett 1 képernyő | M | `oblio-matcher.ts:272` |
| **CUI-visszaírás a kapcsoláskor**: a mappás út a sikeres párosításkor visszaírja a szállító CUI-ját a kiadásra (`syncCuiToKiadas`), a `linkSzamlaKiadas` soha — így a javaslat-motor a saját tanulási adatát dobja el. | Nagy | S | `oblio-ellenorzes-actions.ts:202-206` |
| **Kiadás-felőli nézet**: „ehhez a kifizetéshez mely számlák tartoznak?" — **az index már megvan** (`szallitoi_szamla_kiadas_kiadas_idx`, SQL:155-157), egyetlen lekérdezés sem használja. Egy lekérdezés, két haszon: UI-adat + a hiányzó kiadás-oldali fedezet-őr. | Nagy | M | `SQL:155-157` |
| **Kézi számla-rögzítés** (PDF/papír): `createSzallitoiSzamlaKezi`, `anaf_uuid = 'kezi:<uuid>'` + „kézi" címke a soron. | Nagy | M | `szamla-actions.ts:281` |
| **Fizetési határidő + megjegyzés kézi pótlása**: **a DB-jog megvan** (`GRANT UPDATE (… fizetesi_hatarido, megjegyzes …)`), felület nincs — a DueDate nélküli számla kiesik a lejárt-jelzésből és a sürgősségi sorrendből. **Migráció nem kell.** | Közepes | S | `SQL:175-177` |
| **Lista-szűrők**: `ev`, `szallitoCui`, `rendezes`, `parositatlan` (szerver-oldalon); az `irany` mező ma **halott kontraktus**. + XLSX-export (a helper már él). | Közepes | M | `szamla-types.ts:81` |
| **Új év-záró pont**: „Lejárt határidejű, kifizetetlen szállítói számla" — a mai év-záró erről semmit nem tud. | Közepes | S | `finalization-actions.ts` |
| **Vevő-CUI ellenőrzés** (`vevo_cui` oszlop + összevetés a gyülekezet CIF-jével) — a parser már kinyeri. | Közepes | S | `ubl-parser.ts:412-430` |
| **ÁFA-bontás** (`netto`, `afa` oszlopok) — a nyomtatott ív ma csak bruttót közöl. | Kicsi | S | `ubl-parser.ts:433` |
| **Dokumentum-archívum letöltése (év)** — amíg a Storage nincs a mentésben. | Nagy | M | `backup/export.ts` |

---

## 9. Javasolt cselekvési sorrend

**0. lépés — élő ellenőrzés SQL-lel (a javítás ELŐTT).**
Lezárja: F24, F25, F26, F60, F64 bizonytalanságát. Kell: az élő `szallitoi_szamla` / `gyulekezeti_dokumentum` / `storage.objects` policy-törzsek; `SELECT tabla, reteg FROM backup_table_policy WHERE reteg IS NULL AND hatokor='gyulekezet'`; `SELECT pr.role, count(*) FROM profile_roles WHERE scope='congregation' AND active AND approval_status='approved' GROUP BY 1`; egy kerületi admin sessionből `SELECT public.current_user_has_global_access(); SELECT public.felettes_szint_hozzaferese('<cong-id>');`. **A migrációs fájl nem bizonyíték.**

**1. lépés — a kettős könyvelés lezárása.**
Lezárja: **F1 (P0)**, F5, F4, F15. Kereszt-kapu mindkét irányban + közös kulcs-levezetés + a KPI uniója.

**2. lépés — az azonosítás megjavítása.**
Lezárja: **F2 (P0)**, F10, F14, F52. Identitás-alapú kulcs + DB-szintű második vonal + a duplikátum-ág azonosság-kapuja + a `selftest-ubl-parser.mjs:273` átírása.

**3. lépés — a kapcsolat integritása.**
Lezárja: **F3 (P0)**, F17, F18, F19, F20, F54, F86. Kiadás-oldali fedezet-őr + storno/törlés kaszkád + kifizetve-visszavonás + pénznem- és jóváíró-kapu + DB-trigger a versenyhelyzetre. **Egy trigger sok találatot zár.**

**4. lépés — a megfelelőségi kapuk.**
Lezárja: F6, F36, F27, F29, F63, F64. Az év-záró forrása a `szallitoi_szamla` legyen; a webes feldolgozás frissítse az ANAF-határidő nyomát; audit-naplózás a lánc állapotváltó actionjeibe; a wipe allowlist bővítése; a besorolás `DO UPDATE`-re; hangos sáv a mentésből kimaradó fájlokról.

**5. lépés — a beragadások és a köteg-robusztusság.**
Lezárja: F16/F33/F78, F8, F9/F68, F31, F35, F67, F74. try/catch/finally mindenhová + a ZIP-ág bejegyzés-szintű hibatűrése + előzetes méret-mérés + kötegelés + darabolás + a számláló javítása.

**6. lépés — az igazság a listákban.**
Lezárja: F21/F30, F22, F23, F32, F55, F56, F57, F59, F61. Csonkítás-jelzők, hátralék-számítás, szerver-oldali szűrés, vevő-ellenőrzés, Oblio body-státusz őr.

**7. lépés — a jogosultsági réteg.**
Lezárja: F24, F25, F26, F43. Az SQL-szigorítás (szerep-szűrő + `status='active'`) **és** az app-oldali `permissions.penzugy.*` kapu — a kettő együtt, a 0. lépés eredménye alapján.

**8. lépés — az őrszemek megjavítása.**
Lezárja: F34, F35, F42, F46, F52, F62, F75, F76, F77, F79, F87, F88, F91. **Minden új asszerthez mutáns**, ami a régi hibás viselkedést játssza vissza — enélkül csak látszat-védelem. Külön kiemelve: a Rust `excel.rs:839` és `:954` token-alapú szűrője.

**9. lépés — UX és fejlesztések.**
A 6. fejezet 6.5-ös csoportja + a 8. fejezet javaslatai, hatás/ráfordítás szerint.

---

## 10. Amit NEM tudtunk ellenőrizni

### ⚠️ 10.1 Az ellenőrzési lánc CSONKA — ezt olvasd el a javítás megkezdése előtt

**Minden találat átment EGY adversariális cáfolat-körön** (külön ágens próbálta megcáfolni a forráskódban, és a megcáfoltak kiestek). A tervezett **MÁSODIK kör — a P0/P1 találatok kereszttüze két további, független lencsével — a munkamenet token-limitje miatt NEM futott le.**

Ez konkrétan azt jelenti: **a P0 és P1 besorolások EGY ellenőrzésen alapulnak, nem hármon.** A bizonyíték-idézetek a forrásból származnak és fájl:sor pontossággal ellenőrizhetők, de a *súlyosság* és a *bukási forgatókönyv teljessége* nem kapta meg a tervezett második és harmadik olvasatot. Ezért **a három P0 és a legsúlyosabb P1-ek (F17, F6, F24, F25, F7/F28) javításának megkezdése előtt érdemes emberi szemmel visszaellenőrizni** a megnevezett sorokat — különösen ott, ahol a javítás sémát vagy RLS-t érint.

### 10.2 Élő rendszer helyett forráskód

- **A migrációs fájl nem bizonyíték az élő törzsre** (a repó saját, dokumentált hibaosztálya). Minden RLS-, policy-, trigger- és `backup_table_policy`-állítás **a fájlokból** származik. Az éles adatbázis állapotát nem láttuk.
- **Nem futott le egyetlen éles lekérdezés sem** — a 0. lépés SQL-jei nélkül az F24, F25, F26, F60, F64 státusza „valószínű, de nem igazolt".
- **A Supabase Storage tényleges tartalmát** (árva objektumok száma, meglévő fájlok) nem tudtuk megnézni.

### 10.3 Külső rendszerek

- **Az Oblio API tényleges alapértelmezett rendezése** (F61) a forrásból nem bizonyítható — csak az bizonyított, hogy a kód nem ad `orderBy`-t. Hogy ez ténylegesen a legsürgősebb kintlévőségeket ejti-e ki, az az Oblio szerverén dől el.
- **Az ANAF SPV ZIP-formátumainak valós eloszlása** (lapos vs. beágyazott, semnatura-elnevezési konvenciók) a repó dokumentációjából és a selftestekből származik, nem éles mintákból.
- **A futtatókörnyezet pontos időkorlátja** (F16, F31): a repóban nincs `vercel.json` és nincs `maxDuration` a láncban; a ~100 mp-es elvágást mérésből ismerjük, de a pontos platform-viselkedést nem tudtuk reprodukálni.

### 10.4 Ami mérve lett (és ami nem)

**Mérve, futtatva:** az `anafUuidFajlnevbol` és az `extractAnafUuidFromFilename` eltérése; a `szamErtek` hat bemenete; a `PayableAmount=0` `??`/`||` divergencia; a negatív `<Invoice>` viselkedése; a `normalizalDatum` négy bemenete; a JSZip hibaüzenetei; a ZIP-bomba csúcs-RSS (3,65 GB); a selftest-mutánsok (A/B/C zölden átment).

**Nem mérve:** a teljes lánc végponttól végpontig, valódi ANAF-ZIP-pel; a versenyhelyzetek (két böngészőfül); a mobil érintőfelület valós eszközön; a 200/500/1000-es plafonok átlépése éles adaton.

### 10.5 Bizonytalan / gyengébb lábakon álló

- **F26 (kerületi admin scope-divergencia)** — a bukási forgatókönyv logikailag következik a policy-lábakból, de élő ellenőrzés nélkül nem igazolt, hogy a kerületi admin ténylegesen 0 sort kap.
- **F60 (`oblio_fiokok` RLS szűkebb)** — ugyanez: a `current_user_can_access_congregation` élő törzse ismeretlen.
- **A `current_user_has_global_access()` országos hatóköre** (esperes/egyházmegyei_admin) — a forrásból következik, de ez **rendszerszintű döntés-kérdés**, nem elszigetelt hiba; ütközik a memóriában rögzített „az esperes nem lát országosan" elvvel. **Endre döntése kell hozzá.**
- **F44 (`noopener`)** — a támadhatóság insider-feltételes (a tartalék ág már véd); a védelem szándéka megvan, csak a mindig lefutó ágról hiányzik.
- **F89/F86 (kapcsolótábla kiadás-oldali FK)** — idegen-adat szivárgás **nem** áll fenn; mély-védelmi hiány, kimutatható kár nélkül.