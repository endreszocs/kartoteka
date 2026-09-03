# KARTOTEKA — az Oblio-lánc átvilágítása

**Dátum**: 2026-09-03
**Módszer**: 198-ágenses workflow (7 térképező + 18 párhuzamos vizsgálati szempont + soronkénti adversariális cáfolat + 3 hiánykritika + szintézis), ~19,2M token, 2225 eszközhívás
**Futás**: `wf_1d8a5dc4-0ca` · **139 megerősített + 25 pótlólagos találat** (9 P0 · 43 P1 · 66 P2 · 21 P3)
**Állapot**: felmérés kész, implementáció nem kezdődött el
**Előzmény**: [KARTOTEKA-oblio-ellenorzes-audit-2026-06-14.md](./KARTOTEKA-oblio-ellenorzes-audit-2026-06-14.md) — a jelentés külön szempontként ellenőrizte, hogy annak megállapításai ma is fennállnak-e

> ⚠️ **AZ ELLENŐRZÉS CSONKA.** Minden találat átment EGY adversariális cáfolat-körön (külön ágens
> próbálta megcáfolni a forráskódban, „bizonytalanság esetén cáfolva" alapértelmezéssel). A tervezett
> MÁSODIK kör — a P0/P1 találatok kereszttüze két további, független lencsével (reprodukálhatóság,
> következmény) — az első futásban a munkamenet token-limitjén elbukott, és az újrafuttatásból
> szándékosan kimaradt. **A P0/P1 besorolások tehát egy ellenőrzésen alapulnak, nem hármon** —
> javítás előtt a legsúlyosabbakat érdemes emberi szemmel visszaellenőrizni.

**Melléklet**: [talalatok.json](./KARTOTEKA-oblio-lanc-audit-2026-09-03-talalatok.json) — mind a 139 találat gépi formában (bizonyíték-idézet, bukási forgatókönyv, javítási javaslat, a cáfoló ágens indoklása).
**Testvér-jelentés**: [a feltöltés-első lánc átvilágítása](./KARTOTEKA-szamla-feltoltes-lanc-audit-2026-09-03.md).

---

## 1. Vezetői összefoglaló

Az Oblio-lánc ma **három, egymástól függetlenül fejlődő ágon** fut, és ez a szétcsúszás a legtöbb súlyos hiba gyökere. A webes mappa-alapú fül (673 sor `oblio-folder.ts` + 1785 sor `OblioEllenorzesTab.tsx`) 2026-08-28 óta **halott kód** — sehonnan nincs importálva —, miközben az őrszemek még mindig ezt őrzik. A ténylegesen használt mappa-út a **desktop Rust-implementáció** (`excel.rs`), amit egyetlen őrszem sem véd, és amiből hiányzik minden 2026-ban a weben elvégzett javítás. A harmadik ág a dokumentumtári feltöltéses út, ami egy **második, teljesen külön UBL-parserrel** és külön táblákkal (`szallitoi_szamla`) dolgozik — vagyis ugyanarra a kérdésre („van-e ehhez a kiadáshoz befogadott számla?") két, egymást nem látó igazság-forrás felel.

**A három legfontosabb kockázat:**

1. **Titok-kezelés (biztonság).** Az Oblio API-titok rejtjelezett értéke a böngészőből olvasható, a `vault_decrypt` pedig tetszőleges kulccsal hívható visszafejtő orákulum — a régi, üres vagy 6 jegyű PIN-kulccsal titkosított sorok azonnal, illetve 10⁶ online próbálkozásból nyílnak. A nyeremény nemcsak az Oblio-kulcs (valódi, ANAF SPV-re felmenő számla állítható ki a gyülekezet nevében), hanem maga a god-mode PIN is. Emellett az e-mail-alapú token-cache miatt egy gyülekezet a másik élő Bearer tokenjével hívhatja az Oblio-t.
2. **Adatvesztés a desktop beolvasásnál.** A `move_into` névütközéskor a bedobott fájlt **véglegesen törli** (nem a Lomtárba), az ANAF tömeges (ZIP-ben-ZIP) exportjából **nulla számlát** olvas be miközben sikert jelez, és a `semnatura_` prefix-szűrő egyszerre engedi át a valódi aláírás-XML-eket (fantom számlák) és törli a lelkész saját `semnatura-*.pdf` fájljait.
3. **Megfelelőségi némaság.** Az ANAF 60 napos SPV-figyelmeztetés **soha nem szólal meg** (a `check_oblio_deadline_for_user()` nem létező `ertesitesek.megjegyzes` oszlopból olvas, és a hibát a hívólánc kétszer elnyeli); a kiállított e-Factura státusza soha nem frissül (a `syncInvoiceStatus`/`markInvoicePaid`/`stornoInvoice` actionöknek nulla hívójuk van); az ÁFA-kulcs két helyen beégetve 19% a 2025-08-01 óta hatályos 21% helyett; és a mappás úton beolvasott hiteles XML kizárólag a lelkész gépén létezik, holott a törvény 5–10 év megőrzést ír elő.

**Javasolt sorrend:** először a biztonsági zárás (élesben futtatandó SQL, kis munka, nagy hatás), utána a desktop adatvesztés megállítása, majd az ÁFA/idempotencia a kimenő számlázásban, végül a párosító-motor helyessége és a felület hazug jelzései. A részletes, lépésekre bontott sorrend a 9. fejezetben.

**Egy dolgot előre kell bocsátani:** a tervezett ellenőrzési lánc CSONKA maradt — lásd a 10. fejezetet. A P0/P1 besorolások **egyetlen** adversariális cáfolat-körön mentek át, nem hármon.

---

## 2. Hogyan működik ma a lánc

### (A) Bejövő (szállítói) e-Factura — HÁROM út

| | Web / File System Access | Web / feltöltés | **Desktop (ÉLES)** |
|---|---|---|---|
| Belépés | `showDirectoryPicker` → Dexie handle | Dokumentumtár feltöltés → Supabase Storage | fix mappa: `Documents/Kartoteka/Oblio/befogadott` |
| Kibontás | `oblio-folder.ts:370-555` (JSZip, böngésző) | `zip-kibonto.ts:76` (szerver, ZIP-bomba-őrökkel) | `excel.rs:814 ingest_zip` (Rust, őrök nélkül) |
| Parse | `packages/ui-app/.../ubl-parser.ts` (DOMParser) | `apps/web/lib/oblio/ubl-parser.ts` (saját tokenizáló) | ugyanaz, mint a web-FSA |
| Cél-tábla | `oblio_kiadas_match` | `szallitoi_szamla` + `szallitoi_szamla_kiadas` | `oblio_kiadas_match` (közvetlen Supabase, audit nélkül) |
| Állapot | **HALOTT KÓD** (nulla import) | ÉLŐ | **ÉLŐ** |

A párosítás motorja mindkét mappás ágon közös: `matchXmlsToKiadas` (`oblio-matcher.ts:272-606`), ötlépcsős waterfall — (1) korábban perzisztált match, (2) CUI+összeg+dátum, (3) név-hasonlóság+összeg+dátum, (4) csak összeg+dátum egyetlen jelöltre, (5) nincs. Az összeg-tolerancia `max(1 RON, brut×0,1%)`, a dátum-ablak irányérzékeny (−5…+60 nap). A `high` konfidenciájú találatokat mindkét hívó **megerősítés nélkül azonnal DB-be írja**, és a következő futáson az 1. lépcső ezeket már „Korábban kézzel megerősített párosítás" felirattal adja vissza — az auto-eredet eltűnik.

### (B) Kimenő e-Factura

Server action → `loadOblioCredentials` (`oblio_fiokok` RLS-en át) → `decryptSecret` (Supabase RPC `vault_decrypt`) → `getOblioToken` (OAuth2 client_credentials, memória-cache) → `oblioFetch` → `createInvoice` → `oblio_szamlak` INSERT. Öt művelet van implementálva (`issueInvoice`, `syncInvoiceStatus`, `markInvoicePaid`, `stornoInvoice`, `listRentalInvoices`), de **csak az elsőnek van hívója**.

### (C) A két igazság-forrás

A webes Tranzakciók fül MINDKETTŐT olvassa (`transactions-tab.tsx:80-88`), a desktop Oblio-fül csak az `oblio_kiadas_match`-et (`desktop-oblio-tab.tsx:232-238`), a desktop Tranzakciók fül **egyiket sem** (`penzugy-page.tsx:908-921`). Ezért adja a desktop „Nincs SPV-ben" piros riasztása rendszeresen a rossz számot.

---

## 3. P0 — azonnali beavatkozás

### P0-1 · Az Oblio API-titok visszafejthető a böngészőből (kliens-hívható orákulum + oszlop-szintű védelem hiánya)

**Hol:** `migration-docs/sql/2026-04-16-wc2-vault-functions.sql:43` · `migration-docs/sql/2026-04-16-wc2-oblio-integracio.sql:218,236` · `apps/web/lib/supabase/secret-vault.ts:85,153-154`

**Mi:** Három tény együtt:
- A `vault_decrypt(encrypted_input, key_input)` `SECURITY DEFINER`, a **kulcsot paraméterben kapja**, és a létrehozó fájlban nulla `GRANT`/`REVOKE` van → PostgreSQL alapértelmezés szerint `PUBLIC EXECUTE`. A 2026-07-17-es keményítés ráadásul kifejezetten a frontend-RPC allowlistre teszi (`2026-07-17-member-portal-p0-auth-isolation.sql:182-183`, GRANT-ciklus :1652-1671).
- `GRANT SELECT … ON public.oblio_fiokok TO authenticated` teljes táblára szól; az RLS **sor**-szintű, oszlop-szintű megszorítás nincs → az `api_secret_encrypted` benne van minden `select('*')`-ban.
- Az olvasó kulcslánc tartalmazza a 6 jegyű god-mode PIN-t és az **ÜRES kulcsot** (`secret-vault.ts:153-154`) — a modul saját docblockja mondja ki, hogy ilyen sorok léteznek.

**Bukási forgatókönyv:** A gyülekezet könyvelője (jogosult szerep, de a titokhoz nem jogosult) a böngésző konzoljából: `supabase.from('oblio_fiokok').select('api_secret_encrypted')` → `supabase.rpc('vault_decrypt', { encrypted_input: ct, key_input: '' })`. Ha a sor a VAULT_ENCRYPTION_KEY beállítása előtt keletkezett, az **első próbálkozásra** megkapja a nyers Oblio API-secretet. Ha nem, 10⁶ online próbálkozás — a nyeremény az Oblio-kulcs ÉS a god-mode PIN. A kulcs birtokában valódi, ANAF SPV-re felmenő e-Facturák állíthatók ki és sztornózhatók a gyülekezet nevében, a KARTOTEKA naplóiban nyom nélkül. Rendszergazdai JWT-vel mindez országosan, minden gyülekezetre.

**Mit kell tenni (mindhárom réteg kell):**
1. `REVOKE EXECUTE ON FUNCTION public.vault_encrypt(text,text), public.vault_decrypt(text,text) FROM PUBLIC, anon, authenticated, app_staff_user, app_pending_user, member_portal_user;` + `GRANT … TO service_role;`, és a két nevet **ki kell venni** a `2026-07-17-…sql:182-183` frontend-allowlistából (különben a következő futás visszaadja).
2. `REVOKE SELECT ON public.oblio_fiokok FROM authenticated;` + oszlop-listás `GRANT SELECT (id, congregation_id, email, cif, sorozat_default, nev_default_service, aktiv, utolso_teszt_at, utolso_teszt_ok, utolso_teszt_hiba, utolso_xml_letoltes_at, chitanta_sorozat_default, chitanta_kovetkezo_szam, created_at, updated_at)`. A repóban minden Oblio-lekérés explicit oszloplistás, tehát nem tör el semmit.
3. `secret-vault.ts` az `access.supabase` helyett a `createAdminClient()`-et kapja (`apps/web/lib/supabase/admin.ts` már létezik); a hatókör-ellenőrzés előbb fut az RLS-kliensen, a visszafejtés utána service-role-lal.
4. Kulcsforgatás: VAULT_ENCRYPTION_KEY beállítása után minden gyülekezet mentse újra a kulcsát, és az Oblio-oldali secreteket **cserélni kell**, mert lehet, hogy már kiszivárgott.

**Élő ellenőrzés (a migrációs fájl nem bizonyíték):**
```sql
SELECT p.oid::regprocedure, pg_catalog.array_to_string(p.proacl,' | ') AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('vault_encrypt','vault_decrypt');

SELECT grantee, privilege_type, column_name FROM information_schema.column_privileges
WHERE table_name='oblio_fiokok' AND column_name='api_secret_encrypted';
```

**Ráfordítás:** S (SQL) + M (service-role átvezetés) · *Ide tartozik még: P2-„vault_decrypt hibásan STABLE" (131), P3-„nincs kulcsrotációs út és kimutatás" (81), P3-„nincs entrópia-minimum az írási kapun" (130).*

---

### P0-2 · Az Oblio token-cache kulcsa csak az e-mail → cross-tenant hívás

**Hol:** `apps/web/lib/finance/oblio/oblio-auth.ts:32-34` (`return \`oblio:${email}\``), :56-58 (cache-találatnál az `apiSecret` **fel sem használódik**)

**Mi:** A cache-kulcsban nincs sem gyülekezet-azonosító, sem a secret lenyomata. A `saveOblioConfig` (`oblio-config-actions.ts:90-102`) semmivel nem köti az e-mailt a gyülekezethez — csak azt nézi, hogy tartalmaz-e `@`-ot, és a secret ≥20 karakter. A `testOblioConnection`-nek ráadásul **nincs szerepkör-kapuja** (`:150-152`), szemben a `saveOblioConfig`-gal (`:81-87`).

**Bukási forgatókönyv:** Az „A" gyülekezet lelkésze kiállít egy számlát → a folyamat memóriájában ~55 percre bemelegszik az `oblio:penzugy@a-gyulekezet.ro` kulcsú token. A „B" gyülekezet lelkésze beírja ugyanezt az e-mailt és 20 tetszőleges karaktert secretnek, majd „Kapcsolat tesztelése". A hívás **A élő tokenjével** fut le; a hibaüzenet kiírja A Oblio-fiókjának ÖSSZES CIF-jét (`oblio-client.ts:216`), ami visszamegy a böngészőbe ÉS beíródik a `oblio_fiokok.utolso_teszt_hiba` oszlopba. Második kör: B beírja A egyik CIF-jét, és az `issueInvoice` valódi, ANAF-ra felmenő számlát állít ki A nevében.

**Mit kell tenni:**
1. Kulcs: `oblio:${congregationId}:${sha256(email + '\0' + apiSecret).slice(0,32)}` — a `congregationId` mind a négy hívónál rendelkezésre áll (`oblio-actions.ts:147`, `oblio-config-actions.ts:158`, `oblio-lookup-actions.ts:116`, `kifizetetlen-actions.ts:372`).
2. `clearTokenCache` prefix-alapon ürítsen.
3. `oblio-client.ts:216` ne visszhangozza az idegen CIF-listát („A megadott CIF nem tartozik ehhez az Oblio-fiókhoz.").
4. `testOblioConnection` kapja meg ugyanazt a szerepkör-kaput, mint a `saveOblioConfig`.
5. A `saveOblioConfig` utasítsa el (vagy legalább naplózza) azt az e-mailt, ami már egy másik gyülekezet sorában szerepel.

**Ráfordítás:** M

---

### P0-3 · A számla-kiállítás nem idempotens és nem atomikus → dupla, jogilag érvényes e-Factura

**Hol:** `apps/web/app/(dashboard)/penzugy/oblio-actions.ts:189` (`createInvoice`), :236 (`if (insErr) return { error: … }`) · `oblio-client.ts:25,40-52` (20 s `AbortSignal.timeout`, a timeout egyszerű hálózati hibává fordul)

**Mi:** A kérésben szándékosan nincs `number` (`oblio-types.ts:114` — automatikus sorszámozás), tehát minden hívás új sorszámot kap. Nincs előellenőrzés (`issueInvoice` egyetlen SELECT-je a szerződésre megy, `:132-137` — az `oblio_szamlak`-ot nem kérdezi), nincs idempotencia-kulcs, és a deklarált `DUPLICATE` hibakódnak (`oblio-errors.ts:17`) **nulla használója** van. A UI hibánál nem záródik be és a gomb újra aktív (`oblio-issue-invoice-dialog.tsx:91-96`).

**Bukási forgatókönyv:** Az Oblio 22 mp alatt állítja ki a számlát és tölti fel az SPV-re, a mi 20 mp-es timeoutunk előbb üt. A lelkész „Kapcsolódási hiba" üzenetet lát, ezért újra megnyomja a gombot → **második, jogilag érvényes e-Factura** ugyanarra a bérleti időszakra, szintén az SPV-n. A KARTOTEKÁBAN csak a második jelenik meg — az elsőről semmi nyom, mert a DB-írás sosem futott le. Ugyanez, ha a `createInvoice` sikerül, de a rákövetkező INSERT bukik (`:236`, pl. `szam: Number(invoiceData.number)` NaN egy nem tisztán numerikus sorszámnál).

**Mit kell tenni:**
1. Előellenőrzés a hívás előtt: van-e már `oblio_szamlak` sor `berleti_szerzodes_id` + `szamla_datum` + `stornozott=false` alapján → beszédes `DUPLICATE` hiba.
2. Szándék-sor a REST-hívás **előtt**, `UNIQUE (congregation_id, berleti_szerzodes_id, szamla_datum, idoszak)` kulccsal.
3. Egyeztetés timeout után: `NETWORK_ERROR` esetén hívd meg a `listInvoices`-t (cif + issuedAfter/Before + client[name]), és ha a számla létrejött, pótold a DB-írást siker helyett hiba helyett.
4. A hibaüzenet MONDJA KI: „A számla LEHET, hogy elkészült — előbb frissítsd a listát, csak akkor próbáld újra." Ha a DB-INSERT bukik sikeres Oblio-hívás után, ez legyen explicit tiltás az újrapróbálkozásra.
5. POST-ra hosszabb timeout (45 s).
6. `handleSubmit` try/catch/finally (különben a dialógus véglegesen befagy — lásd P1-37).

**Ráfordítás:** M

---

### P0-4 · Az ÁFA-kulcs két helyen beégetve 19%, és a bérleti számla jogi hivatkozása önellentmondó

**Hol:** `apps/web/lib/finance/oblio/oblio-invoice-builder.ts:82-93` · `apps/web/app/(dashboard)/penzugy/oblio-actions.ts:203-205`

**Mi:** Két, egymást erősítő megfelelőségi hiba:
- **(a) Kulcs:** `vatPercentage: tvaAlany ? 19 : 0` és `const osszegTva = tvaAlany ? Math.round(osszegNet * 0.19 * 100) / 100 : 0`. A repó teljes grepje csak ezt a két írási pontot adja; a `congregations` táblában nincs ÁFA-kulcs mező. A 2025-08-01-jén hatályba lépett román emelés (19%→21%) óta a 19 hibás. Az Oblio `nomenclature/vat_rates` végpontja (`docs/OBLIO_API_KUTATAS_2026-07-10.md:55`) létezik, de nincs meghívva. Ellenpont: a repó máshol bizonyítottan követi a jogszabályt (`tva-plafon-constants.ts:5`, „OG nr. 22/2025").
- **(b) Jogi hivatkozás:** ugyanez a `tvaAlany` boolean a Menţiuni rovatba az `art. 331 Cod fiscal`-t (fordított adózás!) írja, miközben 19% TVA-t is felszámít. A projekt saját jogi kutatása szerint a bérbeadás az `art. 292 alin. (2) lit. e)` alá esik (`docs/project-tracking/KARTOTEKA-penzugy-jogi-pontositasok-2026-04-16.md:69`) — a mentesség az ÜGYLETHEZ tapad, nem az alany státuszához.
- **(c) Dátumfüggetlenség:** a `congregations.tva_alany_tol` létezik (`Database_schema.sql:735-736`), de az `issueInvoice` csak a boolean flaget kéri le (`:152-157`) — visszamenőleg kiállított számlára is a mai státuszt alkalmazza. *(= a korábbi P1-41.)*

**Bukási forgatókönyv:** ÁFA-alany gyülekezet 1000 RON nettó bérleti számlája: 190 RON TVA kerül rá 210 helyett (évi 240 RON hiányzó ÁFA havi számlázásnál), és a Menţiuni azt írja a bérlő könyvelőjének, hogy neki kell önbevallania — miközben a számlán fel is van tüntetve a TVA. Kettős adózás vagy ÁFA-levonási vita, ANAF-ellenőrzésen kifogásolható számla; ha nem volt opciónyilatkozat, a 190 RON jogosulatlanul felszámított adó. Fordított ág: ha az Oblio a már nem létező kulcs miatt 422-t ad, a bérleti számlázás **teljesen leáll**, és a hibaüzenetből nem derül ki, hogy az ÁFA a baj.

**Mit kell tenni:**
1. Egyetlen, dátumhoz kötött igazság-forrás az ÁFA-kulcsra (`TVA_KULCSOK: [{ tol, szazalek }]` a `tva-plafon-constants.ts` mintájára), amiből a builder ÉS a DB-mentés is olvas; a számla dátuma dönt.
2. A `oblio-actions.ts:204` lokális 0.19-es újraszámítását töröld — a mentendő ÁFA/bruttó az `invoiceData.total`-ból jöjjön (`oblio-types.ts:161`), amit ma a kód eldob.
3. `tvaAlany = Boolean(cong.tva_alany) && (!cong.tva_alany_tol || input.szamlaDatum >= cong.tva_alany_tol)`; ha `tva_alany=true` de `tva_alany_tol` NULL → fail-closed hiba.
4. A TVA-döntés az ÜGYLET típusából + explicit opciónyilatkozat-mezőből szülessen; a `mentions` art. 331 hivatkozását töröld.
5. Őrszem (`selftest-oblio-afa.mjs`) negatív asszerttel: bukjon, ha bárhol újra megjelenik beégetett ÁFA-literál.

**Élő ellenőrzés:** `SELECT id, nev, tva_alany, tva_alany_tol, tva_kod FROM public.congregations WHERE tva_alany = true;`

**Ráfordítás:** M

---

### P0-5 · Deviza (EUR) számla átváltás nélkül, RON-ként könyvelődik

**Hol:** `apps/desktop/src/components/desktop-oblio-tab.tsx:593-611,960-969` · `packages/ui-app/src/finance/oblio/OblioKiadasWizardDialogBody.tsx:169-181` · `apps/web/app/(dashboard)/penzugy/oblio-ellenorzes-actions.ts:566-567`

**Mi:** Árfolyam-kezelés a repóban **nincs**: a `TaxExchangeRate`/`CalculationRate` (EN 16931 BT-6/BT-110) egyetlen kódsorban sem szerepel. A parser helyesen kinyeri a pénznemet, a matcher helyesen **kihagyja** a deviza-számlát az auto-párosításból (`oblio-matcher.ts:324,385,444`) — és éppen ezért az EUR-számla garantáltan párosítatlan marad, tehát garantáltan felkínálódik „bevezetés új kiadásként"-ra. A mentés semmilyen pénznem-kaput nem tartalmaz.

**Bukási forgatókönyv:** 120,00 EUR-os szállítói e-Factura (külföldi szoftver-előfizetés). A sor „Nincs kiadás" marad, a lelkész a zöld „Bevezetés új kiadásként" gombra kattint → a `kiadas` táblába **120,00 RON** kerül a valós ~600 RON helyett, `osszeg_ron`/`arfolyam` üresen; ugyanez a 120-as szám átmegy a hivatalos Excel-várólistára is. Az éves számadás ~480 RON-nal kevesebbet mutat, a kassza/bank egyeztetés nem stimmel, és semmi nem jelzi — a listában a sor helyesen „120,00 EUR"-ként jelent meg. Fordítva: a `linkSzamlaKiadas` fedezet-őre (`szamla-actions.ts:507`) a valós 600 RON-os kiadást elutasítja ehhez a 120-as számlához → zsákutca.

**Mit kell tenni:**
1. **Fail-closed kapu** mindkét varázslóba (desktop `:594`, web `:169`) ÉS **szerveroldalon** a `createKiadasFromXmlAndMatch`-be (a `CreateKiadasFromXmlInput` kapjon `currency` mezőt): nem-RON pénznemnél magyar üzenettel álljon meg.
2. Középtávon: a parser olvassa ki a `cac:TaxExchangeRate/cbc:CalculationRate`-et, és a varázsló ajánlja fel a szerkeszthető RON-összeget, forrás-megjelöléssel.
3. `linkSzamlaKiadas`-ban a fedezet-őr elé pénznem-kapu (`szamla-actions.ts:505`).

**Ráfordítás:** S (kapu) + M (árfolyam)

---

### P0-6 · Desktop beolvasás: névütközéskor a bedobott fájl VÉGLEGESEN törlődik

**Hol:** `apps/desktop/src-tauri/src/excel.rs:785-798` (`move_into` doc-kommentje maga rögzíti) és `:958-971` (`let _ = std::fs::remove_file(path);`)

*(Ez a találat négyszer került elő az átvilágításban — #8, #11, #29, #47 —, itt összevonva.)*

**Mi:** A `move_into` ütközéskor `Ok(false)`-t ad, a hívó viszont a forrást **ettől függetlenül törli**, a törlés hibáját is elnyelve (`let _ =`). Nincs archívum, nincs Lomtár, nincs visszaállítás (a desktopon a webes `reprocessZipsFromArchive` megfelelője sem létezik). Ugyanez a minta a `semnatura_` prefixű fájloknál (`:954-956`), ahol a fájl semmilyen számlálóba nem is kerül. A **webes ágon ezt már 2026-06-14-én kijavították** (`oblio-folder.ts:283-287,299-309` — P0-2: „ha a célnév MÁR létezik, NEM írjuk felül ÉS NEM töröljük a forrást"); a javítás a duplikált logika egyik ágára ment be.

**Bukási forgatókönyv:** A `feldolgozott/` mappában már van egy `factura.xml` (A beszállító). A lelkész e-mailből lement egy MÁSIK szállító `factura.xml` nevű számláját (B, 3.480 RON) és bedobja. „Beolvasás" → `dest.exists()` → `Ok(false)` → `remove_file` → a B számla **nyomtalanul megszűnik a lemezéről**. A toast: „Beolvasás kész — 1 már korábban beolvasva." A számla soha nem jelenik meg, nem állítható vissza, és semmilyen naplóbejegyzés nem marad. Ugyanez javított/újraküldött számlánál (azonos ANAF-fájlnév) — a hibás régi példány marad a rendszerben.

**Mit kell tenni:**
1. A `remove_file` kerüljön BE az `if moved { … }` ágba.
2. Ütközéskor vagy egyedi utótag (`<alap>_(2).<kit>`, a `zip-arhivum` epoch-prefixes mintája már ott van `:886-901`), vagy a forrás maradjon a `befogadott/`-ban + `report.errors` magyar üzenettel.
3. A `let _ =` szűnjön meg — a törlési hiba is `report.errors`-ba.
4. A `skipped` számláló szövege pontosodjon: ma „már korábban beolvasva"-t ír, holott csak a NEVET hasonlítja (bájtméret/hash összevetés kellene az állításhoz).
5. `write_if_absent` ZIP-ág + a desktop „Újra-feldolgozás a zip-arhivumból" parancs pótlása.

**Ráfordítás:** S

---

## 4. P1 — hibás adat vagy elakadó munkafolyamat

### 4.1 Befogadott számla elveszik vagy duplikálódik

| # | Találat | Hol | Bukás | Teendő |
|---|---|---|---|---|
| P1-1 | **ANAF/Oblio tömeges (ZIP-ben-ZIP) export a desktopon 0 számlát ad**, a külső ZIP mégis archiválódik és a toast zölden sikert jelez | `excel.rs:842-847`, `:882`, `:941-948` | 14 belső ZIP → 0 fájl a `feldolgozott/`-ban, a bedobó mappa kiürül, „Beolvasás kész — 1 ZIP archiválva" | Rekurzió `MAX_ZIP_MELYSEG=2`-ig (a `zip-kibonto.ts:122-133` mintájára) + fail-closed: ha nincs XML/PDF, `Err`, ne archiváljon. **S** |
| P1-2 | **Rust aláírás-szűrő prefix-alapú**, nem a közös `SEMNATURA_TOKEN_RE` | `excel.rs:839`, `:954` | (a) `<CÉG>_<SOR>_semnatura_<idx>.xml` **átcsúszik** → fantom sorok a párosítási listában, felfújt KPI; (b) a lelkész `semnatura-presbiteri-2026.pdf` fájlját **véglegesen törli**, számláló nélkül | Token-alapú felismerés Rustban; az aláírás-fájl `alairasok/` almappába, ne törlésre; `deleted_signatures` mező a jelentésbe. **S** |
| P1-3 | **Fallback `anaf_uuid` ütközés**: `cbc:UUID` nélküli számláknál a fájlnév-alap a kulcs → a MÁSODIK, teljesen más számlát „duplikátumként" eldobja, és a UI az ELSŐ számlaszámát írja ki mellé | `szamla-actions.ts:247`, `ubl-parser.ts:490-515`, `szamla-feldolgozas-eredmeny.tsx:78,83` | Két `factura.xml` nevű számla két szállítótól → a 12.900 RON-os B számla sosem kerül be, a hiteles XML fel sem töltődik, a lelkész azt hiszi, kétszer töltötte fel ugyanazt | Az `anaf_uuid` egyezés csak akkor számítson duplikátumnak, ha `szallito_cui` + `szamla_szam` + `osszeg` is egyezik; részleges egyezés → `hibak` tömb. A duplikátum-listában az ÉPPEN feltöltött fájl száma jelenjen meg. **M** |
| P1-4 | **Desktop: parse-hibás XML és UUID-duplikátum némán eltűnik** — nincs számláló, nincs sáv (a web P0-1-ként kezelte ugyanezt) | `desktop-oblio-tab.tsx:294-313` | 40-ből 39 számla látszik, semmi nem utal az elveszettre | `parseHibas` és `dupla` számlálók + borostyán sáv fájlnevekkel. **S** |
| P1-5 | **Desktop: a törzsadat-lekérés hibája néma** — (a) minden számla „Nincs kiadás" → dupla bevezetés; (b) ha CSAK a match-lekérés bukik, a matcher nulláról újraszámol és **néma upsert-tel felülírja a kézi párosításokat** (`match_method` 'manual'→'auto_cui', `matched_by` átíródik, audit nincs) | `desktop-oblio-tab.tsx:248-262`, `:326-330`, `:338-345`, `:371-373` | PostgREST 503-vihar alatt 40 kézi párosítás felülíródik, és a következő indításkor már „Korábban kézzel megerősített"-ként jön vissza — a kár láthatatlan | `matchesLoaded` jelző; a perzisztálás kapuja `if (isOnline && matchesLoaded)`; az upsert `{ error }`-ját ellenőrizni és toast-olni; a lokális tükörre eső ág soha ne perzisztáljon. **M** |
| P1-6 | **A `.in()` szűrő darabolatlan** a szállítói-számla duplikátum-előszűrésben — 400 GUID ≈ 18 kB URL → 414, és az EGÉSZ import elbukik a teljes kibontás után | `szamla-actions.ts:217` (vö. ugyanezen fájl `:606-615`, ahol 80-asával darabol) | Éves ANAF-csomag feltöltése minden alkalommal ugyanígy bukik, az üzenetből nem derül ki, hogy darabolni kellene | 80-as darabolás; közös `chunkedIn` helper (a láncban legalább 3 ilyen hívás van). **S** |
| P1-7 | **Desktop tartalom-elemzés: a jelöltek közt már párosított XML-ek is szerepelnek** → ütközéses átnevezés, amit üres `catch` nyel el; a lista mégis zöld nyilat mutat, a toast „0 párosítva"-t | `desktop-oblio-tab.tsx:683`, `:688-698`, `:861-869` | Két ellentmondó állítás egyszerre; a PDF árva marad, a felhasználó nem tud továbblépni | `enriched.filter(e => !e.pdfPath)`; `alreadyPairedXmlNames` a matchernek; a render a TÉNYLEGES kimenetet mutassa. **S** |

### 4.2 Hibás összeg, hibás típus, hibás partner

| # | Találat | Hol | Bukás | Teendő |
|---|---|---|---|---|
| P1-8 | **`\|\|` vs `??` a bruttó fallbackban** — a böngészős parser a `PayableAmount=0.00`-t elveti és a `TaxInclusiveAmount`-ot veszi; a szerveres `??`-t használ | `packages/ui-app/.../ubl-parser.ts:281-283` vs `apps/web/lib/oblio/ubl-parser.ts:435-437` | Előre kifizetett (avans-elszámoló) számla: a desktop 119-et párosít **high** konfidenciával az előleg-kiadáshoz (kétszeres lefedés), a szerveres ág 0-t ír a `szallitoi_szamla.osszeg`-be, amitől a fedezet-őr **minden** kapcsolást elutasít | `??`-ra cserélni; **jobb**: külön `brut` (BT-112), `fizetendo` (BT-115), `elolegLevonva` (BT-113) mező; a matcher a `fizetendo`-t hasonlítsa, `fizetendo === 0`-nál ne auto-párosítson. Selftest mindkét parserre. **S/M** |
| P1-9 | **CUI ↔ cégjegyzékszám összekeverése**: `PartyTaxScheme` hiányában a `PartyLegalEntity/CompanyID` (pl. `J40/8974/2011`) kerül a `kedvezmenyezett_cui`-ba; a `syncCuiToKiadas` hardkódolva `true` | `packages/ui-app/.../ubl-parser.ts:205-220`, `apps/web/lib/oblio/ubl-parser.ts:399-408`, `OblioManualMatchDialogBody.tsx:161` | A hamis adószám (`normalizeCui` → `4089742011`) beíródik az üres kiadásra, és a következő körben **önmagát erősítve** auto-párosít; két cég összemosódhat | `TaxScheme/ID` szűrés (VAT / NOT_EU_VAT); a BT-30 külön `regNumber` mezőbe; alakfelismerő őr (`/^[A-Z]\d{1,2}\//` → sosem CUI); a `syncCuiToKiadas` legyen jelölőnégyzet. **M** |
| P1-10 | **Jóváíró (CreditNote) e-Factura pozitív kiadásként bevezethető** — a matcher szándékos kihagyása pont a varázslóba tereli, ahol a `documentType` sehol nem látszik | `OblioEllenorzesTab.tsx:1479`, `desktop-oblio-tab.tsx:960`, `oblio-ellenorzes-actions.ts:530` | −50 RON jóváírás helyett +50 RON kiadás → 100 RON eltérés, és felkerül a hivatalos Excel-várólistára is | A varázsló bemenetéből zárd ki; **szerveroldali** őr a `createKiadasFromXmlAndMatch`-ben; „JÓVÁÍRÓ" jelvény a táblában. **S** |
| P1-11 | **Negatív összegű román sztornó** (`<Invoice>` gyökér + `InvoiceTypeCode 384`) pozitív tartozásként rögzül: a típus csak a gyökér-elemből jön, a `Math.abs` elveszi az utolsó jelet | `szamla-actions.ts:294`, `ubl-parser.ts:374-376` | „Kifizetetlen számlák" +119 RON-t mutat −119 helyett → 238 RON téves tartozás; a lelkész kifizeti, amit visszakapna | Olvasd ki az `InvoiceTypeCode`/`CreditNoteTypeCode`-ot (381/384 → jóváíró); ha `vegosszeg < 0` és a típus 'szamla', állítsd jóváíróra a `Math.abs` ELŐTT; a matcher kihagyó kapuja bővüljön `\|\| brut < 0`-val. **M** |

### 4.3 Párosító-motor: téves automatikus párosítás (mind megerősítés nélkül perzisztálódik)

Ezek mind ugyanabba a hibaosztályba tartoznak: **a `high` konfidencia szerződés — a hívó azonnal DB-be írja**, és a következő futáson „Korábban kézzel megerősített"-ként jön vissza (`oblio-matcher.ts:302-308`).

| # | Találat | Hol |
|---|---|---|
| P1-12 | A 2. lépcső kétértelműség-kapuja (`secondBestCost - bestCost < 0.5`) **azonos összegeknél csak 5 napnál közelebbi jelöltekre zár** — futtatva igazolva: 5 nap eltérésnél már `high`. Havi ismétlődő szállítónál (villany, gáz) keresztezett hozzárendelés. | `oblio-matcher.ts:358` |
| P1-13 | A **3. lépcsőben nincs kétértelműség-kapu** — a konfidencia kizárólag a névhasonlóságból jön; N azonos partnernevű kiadás mind 0,9-et kap, a legkisebb költségű `high`-ként nyer. A kiadások >50%-án nincs CUI, tehát ez a FŐ auto-párosítási út. | `oblio-matcher.ts:402-414` |
| P1-14 | A **Jaccard-fallback megkerüli a generikus cégszó-szűrőt** — egyetlen közös töltelékszó (33%) elég; a mohó foglalás elveszi a kiadást a valódi szállítótól, aki utána hazug „a kiadás még nincs rögzítve" üzenetet kap → dupla bevezetés. Futtatva igazolva („TOTAL IMPEX" vs „Total Prod"). | `oblio-matcher.ts:174` |
| P1-15 | A **4. lépcső egyediség-vizsgálata egyirányú** — több azonos összegű XML közül a tömb-sorrendben első viszi el az egyetlen kiadást; a győztest a fájlnév-rendezés dönti el. A 3. és 4. lépcső a DB-ben ráadásul **megkülönböztethetetlen** (azonos `method` címke). | `oblio-matcher.ts:458`, `:473` |
| P1-16 | Az összeg-összevetés a **nyers `k.osszeg`**-gel megy a kanonikus `osszeg_ron ?? osszeg` helyett; a `MinimalKiadas.currency` halott mező. 500 EUR-s kiadás 0,00 eltéréssel illeszkedik egy 500 RON-os számlára. | `oblio-matcher.ts:340,392`, `:26-27` |
| P1-17 | **Sztornózott kiadás bent marad a jelöltek közt** — sem a lekérés, sem a matcher, sem a DB nem szűr `stornozott`-ra, miközben a repó minden más pénzügyi lekérése igen. | `oblio-ellenorzes-actions.ts:100`, `desktop-oblio-tab.tsx:239-246` |

**Teendő (egyben):** dimenziónkénti kétértelműség-vizsgálat (hány jelölt esik az összeg-toleranciába) mindhárom lépcsőben; a 3. lépcső legfeljebb `medium`-ot adjon a javítás megérkezéséig (a `medium` nem perzisztálódik); a Jaccard-ág vagy szűrjön a `GENERIC_NAME_STEMS`-re, vagy ne minősüljön találatnak; kétirányú (globális) hozzárendelés a mohó helyett; `osszegRon` + `stornozott` a `MinimalKiadas`-ba, mindkét hívó töltse ki; a 4. lépcső kapjon saját `method` címkét; az `ExistingMatch` hordozza a tárolt `match_method`/`match_confidence` értéket, hogy az auto-eredet ne tűnjön kézi megerősítésnek. **Ráfordítás: M–L. Kötelező mellé: `scripts/selftest-oblio-matcher.mjs` mutáns-alapú őrszem** — ma ez az EGYETLEN automatán perzisztáló pénzügyi függvény őr nélkül a ~120 selftestes repóban.

### 4.4 Tranzakció-integritás: duplikált kiadás, árva tétel

| # | Találat | Hol | Teendő |
|---|---|---|---|
| P1-18 | **A Bevezetés-varázsló újrafuttatása néma duplikált kiadást hagy**: a `saveOblioMatch` feltétel nélküli upsertje (`merge-duplicates`) átcímzi a párosítást az ÚJ kiadásra, a régi élve marad, és a kompenzáló visszagörgetés emiatt el sem indul. Elveszett válasz (Cloudflare 524) a kliensnek hibának látszik (`PostgrestBuilder.ts:240`). | `oblio-ellenorzes-actions.ts:624`, `:193-197` | Idempotencia-kapu az insert ELŐTT (ha van már match erre az uuid-ra → a meglévő `kiadasId` visszaadása); `allowRepoint` kapcsoló; az audit rögzítse a RÉGI `kiadas_id`-t. **M** |
| P1-19 | **A kompenzáló rollback eredményét senki nem nézi meg**, a hibaüzenet mégis feltétel nélkül „visszavontuk"-at állít és újrapróbálkozásra hív → árva, párosítatlan kiadás marad a könyvelésben, audit-nyom nélkül. | `oblio-ellenorzes-actions.ts:643-651` | `.select('id')` + eltérő üzenet kudarcnál („NE rögzítsd újra: a #NNN tételt keresd meg"); mindkét ág auditáljon; hosszabb távon SECURITY DEFINER RPC egy tranzakcióban (a repó a zárt-év triggernél már így oldotta meg). **M** |
| P1-20 | **A varázsló SOHA nem tudott kiadást létrehozni**: mindkét insert-payload a nem létező `kiadas.kedvezmenyzett` oszlopot írja, a „canonical" fallback ugyanazt a kulcsot küldi újra, ráadásul a NOT NULL `xkey`/`nyugta`/`userid` nélkül. | `oblio-ellenorzes-actions.ts:570`, `:586-593`, `:601` | `kedvezmenyzett` → `atvevo`; a fallback feltétele legyen hibakód-alapú (`isMissingColumnError`, nem minden hiba); **jobb**: a varázsló a közös `saveExpenseUseCase`-t hívja, mint a desktop. Őrszem-asszert a payload kulcsaira. **S** |
| P1-21 | **Desktop bevezetés év-határon**: a kiadás a számla kibocsátási dátumával jön létre, a kiadás-lekérés viszont év-szűrt → a párosítás soha nem következik be, miközben a zöld toast megígéri. A lelkész újra megnyomja → duplikált kiadás. | `desktop-oblio-tab.tsx:597`, `:645-647`, `:239-246` | Fail-closed kapu: eltérő év → „előbb válts át a 2025-ös évre"; a toast ELLENŐRIZZE a párosítást; hosszabb távon a bevezetés írja meg közvetlenül az `oblio_kiadas_match` sort. **S** |
| P1-22 | **Kiadás-sztornó nem bontja el az e-Factura párosítást** — sem a core use-case, sem a webes storno nem kaszkádol; a tükör-use-case (befizetés) viszont igen. A sor „kézi · biztos" zöld jelvénnyel marad a sztornózott kiadáson, az újrarögzített tételhez pedig nincs számla. | `packages/core/src/finance/kiadas/storno.ts:156`, `soft-delete.ts` | Kaszkád a `stornoIncomeUseCase:224-245` mintájára (törlés vagy megjelölés), a hibát hangosan visszaadva; `.eq('stornozott', false)` a jelölt-lekérésekbe; `stornozott` mező a `MinimalKiadas`-ba; mutáns-alapú őrszem. **M** |
| P1-23 | **A befizetés sztornója kaszkádolja a KIMENŐ e-Facturát is** (`tipus` szűrő NÉLKÜL), miközben az ANAF-nál a számla él — a papír-nyugta use-case három helyen szűr `chitanta_papir`-ra, ez egyszer sem. `stornozott_by` sem íródik. A desktop UI „1 chitanța is sztornózva"-t mond. | `edit-storno-actions.ts:671-682`, `packages/core/src/finance/befizetes/storno.ts:227-237` | `.eq('tipus','chitanta_papir')` mindkét ágra; fail-loud figyelmeztetés a kimaradó e-Facturáról; `stornozott_by` a payloadba; a mező- és UI-szöveg átnevezése. Élő felmérés: `WHERE tipus='e_factura' AND stornozott AND stornozott_indok LIKE 'A befizetés stornózva:%'`. **M** |

### 4.5 Kimenő számlázás (Oblio REST)

| # | Találat | Hol | Teendő |
|---|---|---|---|
| P1-24 | **Az e-Factura életciklusa nincs bekötve**: a `syncInvoiceStatus`, `markInvoicePaid`, `stornoInvoice` és `listRentalInvoices` actionöknek **nulla hívójuk** van, cron sincs — a státusz a kiállításkori `nepreluat`-on fagy, miközben a kiállító ablak azt ígéri, hogy „1-24 órán belül frissül". Egy ANAF-elutasítás (`nok`) sehol nem jelenik meg. | `oblio-actions.ts:246,304,367` · `oblio-issue-invoice-dialog.tsx:196-200` · `oblio-status-labels.ts:18-24` | Számla-lista a Bérlet fülre soronkénti „Státusz frissítése"/„Kifizetve"/„Sztornó" gombbal; a `getInvoice` küldje a `withEInvoiceStatus` paramétert; `after()`-alapú kötegelt szinkron a `nepreluat`/`in_prelucrare` sorokra; amíg nincs kész, a UI ne ígérjen automatizmust. Őrszem: exportált Oblio-action hívó nélkül → bukjon. **M–L** |
| P1-25 | **A válasz-boríték `status` mezőjét az `oblioFetch` nem nézi** — a `listInvoices` hívói ezért 200-as HTTP + `{"status":401}` törzsnél `items = []`-t kapnak, `hiba: null` mellett, 60 mp-re cache-elve. A „Kifizetetlen számlák" ablak azt állítja, nincs kintlévőség — pontosan a fájl saját fejlécében (`:13-16`) megtiltott „néma üres lista". | `oblio-client.ts:89` (gyökér) · `kifizetetlen-actions.ts:376` · `oblio-lookup-actions.ts:233` | Központi boríték-ellenőrzés az `oblioFetch`-be (egyszerre védi mind a 7 hívási pontot); a hibás eredményt ne cache-eld 60 mp-re. **S** |
| P1-26 | **A „Törlés" csak jelzőbitet állít**: az `api_secret_encrypted` érintetlen marad, a `clearTokenCache` sem fut, és a `getOblioConfig`/`testOblioConnection` nem szűr `aktiv`-ra → a chip élőnek mutatja a törölt konfigot, és a teszt-gomb valóban hitelesít vele. | `oblio-config-actions.ts:216-219`, `:47-51`, `:155-159` | A titok tényleges megsemmisítése; `clearTokenCache` hívása; `.eq('aktiv', true)` mindkét olvasóra (a másik három hívó már helyesen szűr); audit-napló a törlésről. **S** |
| P1-27 | **A `congregations.e_factura_kotelezett` mezőt egyetlen kódsor sem olvassa** — a comodat kivételével MINDEN jogi típus `tipus:'e_factura'`-ként rögzül, holott a projekt saját jogi elemzése szerint a locatiune/arendare/concesiune ki van véve (OUG 120/2021), és a szerződés-szerkesztő hintje azt ígéri, hogy a jogi típus dönt. | `oblio-actions.ts:213`, `:142` · `2026-04-16-wc1-tva-figyelo-schema.sql:95-96` | A mező tegyék szerkeszthetővé; valódi kapu az `issueInvoice`-ba; nem kötelezett + mentes ügylet → kérdezzen rá (papír chitanță ág már létezik); a döntés kerüljön a `megjegyzes`-be. **M** |

### 4.6 Megfelelőség és megőrzés

| # | Találat | Hol | Teendő |
|---|---|---|---|
| P1-28 | **Az ANAF 60 napos SPV-figyelmeztetés SOHA nem szólal meg.** A `check_oblio_deadline_for_user()` a nem létező `ertesitesek.megjegyzes` oszlopból olvas és abba ír (42703). A függvény a 0–49. napon a korai `RETURN 'ok'` ágon tér vissza — tehát **pontosan akkor és csak akkor bukik, amikor működnie kellene**, és a fejlesztői teszt zöld. A hibát a server action (`minden RPC-hiba → 'no_congregation'`) és a `page.tsx:57 .catch(()=>{})` kétszer elnyeli. | `2026-04-16-wc2-10-oblio-ellenorzes.sql:249,262` · `oblio-ellenorzes-actions.ts:682-685` · `penzugy/page.tsx:57` | Élő állapotfelmérés (SQL lent); a meglévő `hivatkozas` oszlop használata VAGY `ADD COLUMN IF NOT EXISTS megjegyzes text`; fail-loud `status:'error'` ág; `after()` a floating promise helyett; őrszem az RPC oszlophivatkozásaira. **S** |
| P1-29 | **`recordOblioDownloadNow` nulla érintett sornál is sikert jelent** → aki nem állított be Oblio REST-fiókot (a mappás út enélkül is működik), annál az `utolso_xml_letoltes_at` sosem íródik, tehát a visszaszámláló **soha nem indul el**; a UI viszont lokálisan kiírja a dátumot, ami újratöltéskor eltűnik. | `oblio-ellenorzes-actions.ts:440-447` · `OblioEllenorzesTab.tsx:696-699` | `.select()` + zéró-sor őr, cselekvésre bíró hibaüzenettel; a kliens csak visszaigazolt írásra állítson állapotot; megfontolandó a mező áthelyezése Oblio-konfigtól független helyre. **S** |
| P1-30 | **A desktop mappás úton a hiteles XML csak a lelkész gépén létezik** — a rendszer és a napi mentés kizárólag metaadatot őriz (`oblio_kiadas_match`), miközben az ANAF 60 nap után nem adja vissza, a törvény 5–10 évet ír elő. A desktopon nulla Storage-feltöltés van (`szallitoi_szamla` 0 találat). | `desktop-oblio-tab.tsx:353-373` | A `feldolgozott/` új XML-jei (és PDF-jei) töltődjenek fel a MEGLÉVŐ `szallitoi-szamlak` dokumentumtár-kategóriába + `szallitoi_szamla` sor; offline a meglévő outbox-minta. Addig is állandó figyelmeztető sáv. **L** |
| P1-31 | **A véglegesítő wizard Oblio-ellenőrzése szerkezetileg halott**: NOT NULL oszlopra szűr (`!x.kiadas_id`), ráadásul abban a táblában keresi a hiányzókat, amely definíció szerint csak a MÁR párosítottakat tartalmazza. A tervezett átfedés-ellenőrzés (`oblioMatchesRes`) sosem készült el. | `finalization-actions.ts:318`, `:126,171-175` | A populáció a `szallitoi_szamla` + anti-join a `szallitoi_szamla_kiadas`-ra; a halott destrukturálás törlése; a `detail` mondja ki, mit NEM lát az ellenőrzés. **M** |
| P1-32 | **A véglegesítő ellenőrző-lista FAIL-OPEN**: a nyolc lekérés `.error` mezőjét senki nem nézi → egy 503 alatt csupa zöld pipa és `hasBlocker=false`, „Mind a 0 kiadáshoz van kategória". A lelkész ellenőrizetlen évet zár le és küld be. | `finalization-actions.ts:187-210`, `:337` | Fail-closed a szomszéd action mintájára (`oblio-ellenorzes-actions.ts:117-118`); nulla tételnél beszédes szöveg; mutáns-alapú őrszem. **S** |

### 4.7 A felület hazudik / a munkafolyamat elakad

| # | Találat | Hol | Teendő |
|---|---|---|---|
| P1-33 | **A „Nincs a könyvelésben" szűrő csak a betöltött 30-as oldalon szűr**, a darabszám és a lapozó a szűretlen összesent használja → „Nincs a szűrésnek megfelelő számla", miközben a 3. oldalon 12 könyveletlen vár. | `szamla-egyeztetes-main.tsx:96-101,202-205,294,422` | A szűrés menjen a szerverre (`NOT EXISTS` anti-join), az `osszesen` is ehhez tartozzon. **M** |
| P1-34 | **Részleges fedezetnél is zöld „Könyvelve"/„SPV-ben rendben"** — a jelző csak a kapcsolatok LÉTÉT nézi, az `osszeg_resz`-t egyik lekérés sem olvassa, holott a részleges kapcsolás elsőrangú, támogatott eset. Az 5.000 RON-os gyűjtőszámla 350 RON kapcsolása után „elintézett"-nek látszik és kiesik a szűrőből. | `szamla-egyeztetes-main.tsx:359` · `szamla-actions.ts:613-614` · `oblio-ellenorzes-actions.ts:111-114` | Három állapot (teljesen / részben / nincs), fedezet-aránnyal; a szűrő a „nem teljesen fedezett" halmazra. **M** |
| P1-35 | **A bevétel-soros SPV-ikon összeg-szűrője fail-open**: ha egyetlen jelölt sem esik a ±0,5 RON-os ablakba, a `best` marad az első találat → egy 250 RON-os adomány zöld „SPV-n elfogadva" pipát kap a 1.200 RON-os bérleti számlától, és a „+ Számla"/„Nyugta" gomb **eltűnik**. | `oblio-lookup-actions.ts:172-195`, `:252-257` · `oblio-status-icon.tsx:126` | Fail-closed: üres `inRange` → `found:false`; determinisztikus rendezés a `.limit(5)`-höz; konfidencia-megkülönböztetés (exact vs. heuristic), és a gombok maradjanak elérhetők. **S** |
| P1-36 | **Partnernév nélküli befizetésnél (persely) a lookup partner-szűrő nélkül kérdezi az Oblio-t** és az első ±2 napos számlát „megtaláltnak" veszi — ráadásul **át is írja annak `befizetes_id`-ját** erre a sorra (egy OLVASÁSI út ír). | `oblio-lookup-actions.ts:229`, `:261-281` | Üres partnernévnél ne induljon API-lookup; a lookup ne írjon `befizetes_id`-t (vagy csak NULL-ra); a jelöltekből zárd ki a foglaltakat. **S** |
| P1-37 | **Három dialógus véglegesen befagy**, ha a server action promise-a elutasításra fut (nincs try/catch/finally): a feltöltő (X, ESC, háttér, Mégse — mind halott), a számla↔kiadás kapcsoló (fókusz-csapdás modál `busy=true`-ban ragad), és az **e-Factura kiállító** (a gomb örökre „Kiállítás…", hibaüzenet nélkül → a lelkész újranyit és **másodszor is kiállítja**). | `dokumentumtar-upload-dialog.tsx:218` · `szamla-kapcsolas-dialog.tsx:147` · `oblio-issue-invoice-dialog.tsx:83` | try/catch/finally mindhárom helyre; a kiállítónál a `catch` szövege **explicit tiltsa** a vak újrapróbálkozást. A testvér-fájl már rögzíti a tanulságot (`szamla-egyeztetes-main.tsx:93-95`). **S** |
| P1-38 | **A Tranzakciók fül minden bevétel-sorra külön server actiont indít**, amiket a Next.js sorosítva futtat (`node_modules/next/dist/docs/…/07-mutating-data.md:206`). 500 sor ≈ 3000 sorosított hálózati körút (~2,5 perc), és minden más server action mögéjük sorol; Oblio-konfiggal 429-vihar. A lista sem lapozott, sem virtualizált. | `oblio-status-icon.tsx:87` · `TransactionsTab.tsx:782` · `transactions-tab.tsx:101-118` | Egyetlen előtöltő action (`loadOblioMatchedIncomeIds(year)`) a kiadás-oldal MÁR MEGLÉVŐ mintájára; az Oblio REST-lookup kerüljön ki a render-útból (kézi gomb); addig is windowing + korlátozott párhuzamosság. **M** |
| P1-39 | **Heurisztikus („közepes") tartalom-egyezés megerősítés nélkül, fizikailag átnevezi a PDF-et** — web ÉS desktop —, és a következő frissítés már „biztos párnak" látja. Nincs pénznem-ellenőrzés, a kötőjeles dátum sosem parse-olódik, a `TOTAL` minta a „Subtotal"-ba is beleillik. | `pdf-xml-content-matcher.ts:138` · `desktop-oblio-tab.tsx:688-697` · `pdf-content-parser.ts:84,224` | Az átnevezés küszöbe **allow-lista** és csak `'high'`; a substring-ág szigorítása; `parseDate` karakterosztályába a kötőjel; szóhatár a TOTAL-mintába; Y-koordináta szerinti sorképzés; pénznem-kinyerés. **M** |

---

## 5. P2 — robusztussági és UX-hiányok

### 5.1 Belépés / mappa / ZIP

- **Web-FSA ZIP-kibontóban nincsenek méret/darabszám-őrök** (a szerveroldali párjában igen: 500 fájl / 100 MB / 2 mélység) — `oblio-folder.ts:391`. *(P3-besorolású, mert a fül halott — lásd 6. fejezet.)*
- **Mappa-listázás plafon, haladásjelző és megszakítás nélkül**, egy frissítés alatt kétszer bejárva ugyanazt a mappát; a `getFile()` hibája némán kiesik — `oblio-folder.ts:186`.
- **A helyi mappa útvonala a szerkeszthető gyülekezetnévből képzett slugon áll** — átnevezés után az offline Excel-lánc (export/import/watcher) néma módon új, üres mappát nyit; a „kanonikus" `slugifyCongregationName` halott kód, három bemásolt `slugify` él helyette — `fs-handle-store.ts:150`, `slugify.ts:15`.
- **Rust prefix-szűrő elrontja a `single_pair` feltételt** 1-számlás ANAF ZIP-nél → a PDF átnevezetlen marad és árva lesz; a desktop nem importálja a `batchMatchPdfsToXmlsByName`-t — `excel.rs:839`.
- **Félbehagyott ZIP-kibontás után a hiba csak a konzolba kerül**, a toast „ismeretlen fájl"-nak titulálja a bent ragadt saját ZIP-et; a `report.errors` sehol nem jelenik meg — `excel.rs:853`, `desktop-oblio-tab.tsx:421-429`.
- **A szerveroldali kibontó a beágyazott/mappázott bejegyzéseket lapos listába olvasztja** → azonos alapnevű fájloknál a párosítás pozíció szerintivé degenerálódik, és téves PDF csatolódik a `szallitoi_szamla` sorra — `zip-kibonto.ts:212`.
- **Elavult „KARTOTEKA mappa szükséges" kapu** a Tranzakciók fül SPV-ikonján: a cél (Számlák egyeztetése) már feltöltés-alapú, így Firefox/Safari/mobil alatt zsákutca — `transactions-tab.tsx:60`, `TransactionsTab.tsx:803`.
- **A mappa-állapot betöltése védtelen** (Dexie/`queryPermission` try/catch nélkül) → az egész fül néma „betöltés" állapotban ragad — `oblio-folder.ts:120`.

### 5.2 Parse

- **A `parseError`-t egyetlen fogyasztó sem olvassa** → az olvashatatlan XML néma, csupa „—" sorként jelenik meg „Nincs kiadás" jelvénnyel, sőt cache-elődik is; ugyanez a fájl a szerveres ágon hangos magyar hibát adna. A böngészős parsernek ráadásul **semmilyen méret- vagy mélység-plafonja nincs** — `ubl-parser.ts:146`, `OblioEllenorzesTab.tsx:449-473`, `desktop-oblio-tab.tsx:294-304`.
- **A nyomtatott nettó/ÁFA/bruttó három eltérő szemantikájú UBL-mezőből áll** (BT-109/BT-110/BT-115), konzisztencia-ellenőrzés és `currencyID`-tudat nélkül → részleges előlegnél önellentmondó számhármas egy hivatalos kinézetű nyomtatványon — `ubl-parser.ts:280`.
- **A `normalizeFileBaseName` regexe csak az UTOLSÓ kiterjesztést vágja** (`+` a csoportra vonatkozik), szemben a saját JSDoc-jával és a szerveres ikerpárjával; a selftest CSAK a szerveres példányt fedi — `ubl-parser.ts:335`, `selftest-ubl-parser.mjs:30`.
- **`isRon(null) === true`** — a hiányzó pénznemet RON-nak veszi, tehát a deviza-kapu átengedi; a `MinimalKiadas.currency`-t senki nem tölti ki — `oblio-matcher.ts:124`.
- **PDF-parser:** a `TOTAL` minta a „Subtotal"-ba illik (a nettót veszi bruttónak); a kötőjeles DD-MM-YYYY sosem parse-olódik; a saját `parseAmount` a román ezres-pontot tizedespontnak veszi (`"1.500"` → 1,5); a pdfjs dokumentum **sosem kap `destroy()`-t** (worker + PDF-másolat szivárgás minden hívásnál); csak az első 3 oldalt olvassa (közműszámlán a végösszeg lejjebb van); az elbukott `import('pdfjs-dist')` véglegesen beragad a singletonba — `pdf-content-parser.ts:224,84,64,138,146,100`.

### 5.3 Párosítás

- **A perzisztált auto-párosítás „kézi · biztos" címkét kap** — az eredet és a valódi konfidencia elvész, holott a DB tárolja és mindkét hívó le is kéri — `oblio-matcher.ts:305`.
- **Az összeg-tolerancia arányos tagjának nincs felső plafonja** (0,1%): 100.000 RON-nál 100 RON eltérés is „biztos" — `oblio-matcher.ts:212`.
- **Semmi nem védi a kiadás „foglaltságát"**: egy kiadáshoz két e-Factura is menthető (a `(congregation_id, kiadas_id)` index NEM unique), és a matcher mindkettőt zölden mutatja — `oblio-matcher.ts:286`, `2026-04-16-wc2-10-oblio-ellenorzes.sql:101-102`.
- **A megosztott webes fül nyers `timestamp`-et ad a matchernek** (`.slice(0,10)` nélkül) → NaN → Infinity → a 2–4. lépcső némán kiiktatódik. Ma latens (halott fül), de a matcher szerződését sérti — `OblioEllenorzesTab.tsx:538`, `oblio-matcher.ts:199`.
- **A diagnosztikai jelöltlista dátum-ablak nélkül, összeg-elsődlegesen rendez** és a foglaltakat is beengedi a top 5-be → a „Párosít összest" 300+ nap távolságú tételt is rögzíthet — `oblio-matcher.ts:486`, `OblioMatchDiagnosticDialogBody.tsx:106-127`.
- **Nulla önellenőrzés őrzi a matcher küszöbeit** — `oblio-matcher.ts:272`.

### 5.4 Perzisztálás / hatókör / audit

- **Nincs DB-szintű keresztoszlop-integritás az `oblio_kiadas_match`-en**: a policy csak a `congregation_id`-t nézi, a FK az RLS-t megkerüli → tetszőleges idegen `kiadas_id` beszúrható, és a saját felületen „párosítottnak" látszik — `2026-04-16-wc2-10-oblio-ellenorzes.sql:134`.
- **A csengő-értesítéses ANAF-figyelő a profil skalár gyülekezetére néz**, nem az effective hatókörre — profilváltás alatt a rossz gyülekezetet figyeli, és a valódi soha nem kap értesítést — `oblio-ellenorzes-actions.ts:680`, SQL `:187-191`.
- **A `testOblioConnection` az EGYETLEN kapuzatlan Oblio-config action** — a read-only számvevő is kiválthatja a titok visszafejtését, az éles hívást és a nyers hibaszöveg (idegen CIF-lista) DB-be írását — `oblio-config-actions.ts:150`.
- **A desktop 4 `oblio_kiadas_match` írása/törlése audit-napló nélkül megy**, míg a webes megfelelője naplóz — `desktop-oblio-tab.tsx:154,371,506,554`.
- **A `saveOblioMatch` CUI-mellékírása ellenőrizetlen és `congregation_id` szűrő nélküli** (fire-and-forget), miközben a dialógus ígéretet tesz rá — `oblio-ellenorzes-actions.ts:202-207`.
- **Az `updateKiadasCui` halott, exportált szerver-akció** zéró-sor őr nélkül, valótlan audit-bejegyzéssel — `oblio-ellenorzes-actions.ts:382`.
- **A `listOblioMatchesAndKiadasok` négy lekérése lapozatlan** (a match-lekérés ráadásul év-szűrő nélkül) → 1000 fölött néma vágás, ami dupla rögzítéshez vezet; a `select('*')` 6 mező helyett ~30 oszlopot hoz — `oblio-ellenorzes-actions.ts:87`.
- **A `getExpenseCategoriesForOblio` nem szűr `aktiv`-ra, szintre, és nem lapoz** — kivezetett és nem gyülekezeti célok is választhatók, ~927 kategória mellett a plafon közel — `oblio-ellenorzes-actions.ts:472-475`.
- **A hiteles e-Factura XML véglegesen törölhető** a Dokumentumtárból hivatkozás-ellenőrzés nélkül, és a törlés után SEMMILYEN felület nem jelzi a hiányt (az adatlap még ki is írja, hogy „a hiteles bizonylat az XML") — `dokumentumtar/actions.ts:367`.
- **Az ÉLŐ webes szállítói-számla út teljesen audit-napló nélküli** (rögzítés, kifizetve-váltás, kapcsolás, végleges törlés), és a `szallitoi_szamla`-n nincs `updated_by`/`updated_at` — `szamla-actions.ts:422`.
- **A „Könyvelve" jelvény megmarad törölt/sztornózott kiadás után is** — a visszaolvasó lekérdezések nem szűrnek, kaszkád nincs — `szamla-actions.ts:614`.

### 5.5 UI / UX

- **A tömeges párosítás gomb a „Nem valószínű (<40%)" fülön is aktív, megerősítés nélkül**, és a ciklus befagyasztott pillanatképet jár be → két XML ugyanarra a kiadásra — `OblioMatchDiagnosticDialogBody.tsx:106-127`, `:111-121`.
- **Halott „Párosít" gomb**: a láthatóság `candidates.find(c => !c.alreadyMatched)`, a kattintás mindig `candidates[0]` → örök hibatoast — `:352` vs `:254-257`.
- **Visszaállíthatatlan „Mellőzés"**: a visszaállító gomb a `filteredDiag.length > 0` sávon BELÜL van → ha mindent mellőzöl, eltűnik — `OblioEllenorzesTab.tsx:1259`.
- **A wizard reset-effektje inline arrow propokra fűzve** (`[open, onLoadCategories, onToast]`) → bármely szülő-render visszaugrik az 1. számlára és eldobja a kiválasztott kategóriákat; a per-tétel állapot **lépés-indexszel** kulcsolt egy élő listán → rossz kategóriára könyvelés — `OblioKiadasWizardDialogBody.tsx:129,88-93`.
- **Néma számla-eltűnés**: az `uniqueParsedXmls` UUID-nként az elsőt tartja meg, de a duplikátum-figyelmeztetés csak azonos bájtméretnél születik — `OblioEllenorzesTab.tsx:506-512` vs `487-501`.
- **Stale closure** a `previousXmlCount`-nál → minden frissítéskor DB-írás — `:686,710`.
- **28×28 px akciógombok** (a repó saját, kommentben rögzített 40 px-es mobil minimuma alatt), 4 px réssel a piros „Párosítás eltávolítása" mellett — `:1650`.
- **Belső-görgetős tábla `w-full`-lal** (`w-0`/`min-w-full` helyett) `whitespace-nowrap` cellákkal — `:1359-1361`.
- **A „Nincs SPV-ben" piros StatCard nem lefúrható** — a `FilterMode`-ban deklarált `'kiadas-nelkul'` érték halott — `:204,726-730,1324-1329`.
- **A blob-URL effekt inline `onToast`-ra fűzve** a nyomtatási előnézetben → a cleanup visszavonja az élő URL-t → üres iframe nyomtatása (ismerős hibaosztály) — `OblioInvoicePrintDialogBody.tsx:83-111`.
- **A két desktop modál kilóg a dialógus-konvencióból**: nincs `role="dialog"`/`aria-modal`, nincs ESC, nincs fókusz-csapda, és a háttér-kattintás mentés közben is elveti a kitöltött űrlapot (szövegkijelölés-húzás is elég hozzá) — `desktop-oblio-tab.tsx:1166,1060`.
- **Elavult súgószöveg** az SPV-ikonban: nem létező „Oblio ellenőrzés" fülre küld — `oblio-expense-status-icon.tsx:34`.
- **A záró toast a matcher memóriabeli számát írja ki** akkor is, ha a batch mentés nulla sort perzisztált (és a `saved` a szándékra esik vissza) — `oblio-ellenorzes-actions.ts:348`, `OblioEllenorzesTab.tsx:702`.
- **A desktop tartalom-elemzés összesítője nem fedi le az összes árva PDF-et** (olvasási és átnevezési hibák láthatatlanok), mégis 'success' — `desktop-oblio-tab.tsx:702`.

### 5.6 Desktop-paritás

- **Halott „PDF/XML megnyitása" gombok**: az `openPath` a `plugin:opener|open_path` parancsot hívja, amit egyetlen capability sem enged (`opener:default` = csak `open-url`, `reveal-item-in-dir`, `default-urls`) → minden kattintás hibatoast — `desktop-oblio-tab.tsx:481`, `capabilities/default.json:8`.
- **A desktop „Nincs SPV-ben" a HELYI feldolgozott mappából számol** (a web a DB-párosításokból) → üres mappánál az év minden kiadását tévesen riasztja — `desktop-oblio-tab.tsx:718`.
- **Nincs ZIP-bomba-őr a Rust oldalon** (bejegyzés-méret plafon nélküli `read_to_end`) — `excel.rs:801`.
- **Path-traversal rés**: a meghajtó-prefixes bejegyzés-név (`C:szamla.xml`) kiszökik a `feldolgozott/` mappából (a `/`, `\`, `..` őrök nem fogják) — `excel.rs:1062`, `:833`.
- **Az ANAF 60 napos óra a gombnyomás idejére áll** (`new Date()`), bármely bedobott XML/PDF újraindítja, és a desktopon **egyáltalán nincs visszaszámláló-kijelzés** — `desktop-oblio-tab.tsx:415,435`.
- **Nem-UTF8 / BOM-os XML** néma kiesése vagy fantom-sora — `excel.rs:1030-1037`.
- **Örökké várakozó offline párosítás** (a hiba oka sehol nem látszik) és **offline rögzített kiadás nem párosítható** (a `kiadas_pending_local` nem jön be) — `desktop-oblio-tab.tsx:143-179`, `finance-sync.ts:430-442`.
- **Belső-mozgás kódok (300.01/301.01/400.01/401.01/402.02) a számla-bevezető varázslóban** → fél lábú belső mozgás — `penzugy-page.tsx:590-594`.
- **A desktop Tranzakciók fülén nincs számla-jelző** — `penzugy-page.tsx:908-921`.
- **Régi kiadáshoz nem lehet számlát kapcsolni**: a jelöltek fixen az utolsó 25 élő kiadás, keresés nélkül — `kifizetetlen-actions.ts:286-297`.

### 5.7 Teljesítmény

- **Desktop: minden mentés/törlés után a TELJES feldolgozott állomány újraolvasása és újraparse-olása** (sorosan, Tauri IPC-n, cache nélkül) — 50 kézi párosítás = 20.000 fájlolvasás + 20.000 DOMParser-futás — `desktop-oblio-tab.tsx:293`.
- **Az inline `loadOblioMatchedExpenseIds` callback minden renderkor új identitást kap** → minden dialógus-nyitás újra lefuttatja a teljes évi, lapozatlan lekérést — `transactions-tab.tsx:80`.
- **A matcher diagnosztikai ága összeg nélküli XML-nél minden kiadást jelöltnek vesz**, memoizálatlan névnormalizálással (13 `new RegExp` hívásonként) — mérve 400×2000-nél 14,4 s a fő szálon — `oblio-matcher.ts:486`.
- **Az Oblio-lista virtualizáció és `React.memo` nélkül renderel**, és a `feldolgozott/` mappa évekig nő — `OblioEllenorzesTab.tsx:1383`, `desktop-oblio-tab.tsx:921`.
- **Nincs backoff és nincs in-flight dedup** a REST-kliensben (retry csak 401-re) — `oblio-client.ts:54-87`, `oblio-auth.ts:49-100`.

### 5.8 Cache

- **Kijelentkezéskor a második IndexedDB (`kartoteka_oblio_cache`) sehol nem törlődik** — a szállítói számlák fejadatai (szállító, CUI, cím, összeg) a közös gépen maradnak, és az adatvédelmi őrszem CSAK egy DB-nevet mér — `helyi-tarolo-urites.ts:49`, `selftest-adatvedelmi-fedezet.mjs:381-395`.
- **Aszimmetrikus cache-kulcs**: olvasás a fájlnévből, írás a `cbc:UUID`-ből → a gyorstár a többtagú ANAF-neveken **soha nem talál** (mérve), minden frissítés újraparse-ol — `OblioEllenorzesTab.tsx:433` vs `:461`.
- **Nincs parser-verzió a rekordban, nincs TTL, nincs felhasználói cache-ürítés** → egy jövőbeli parser-javítás nem éri el a már gyorstárazott számlákat — `oblio-cache.ts:21,48`.

---

## 6. P3 — higiénia

| Terület | Találat | Hol |
|---|---|---|
| Halott kód | `apps/web/components/finance/oblio-ellenorzes-tab.tsx` (146 sor) + `packages/ui-app/.../OblioEllenorzesTab.tsx` (1785 sor) + `oblio-folder.ts` (673 sor) — nulla import; a `selftest-oblio-evzar.mjs` is halott utat őriz | több |
| Halott kód | `kiadasResults` nézet a matcherben (O(n·m), nulla fogyasztó) | `oblio-matcher.ts:593` |
| Halott kód | `downloadLocalFile`, `listCachedXmls`, `removeCachedXml`, `clearCacheForCongregation` — exportált, sehol nem hívott | `oblio-folder.ts:248`, `oblio-cache.ts:85,102,133` |
| Halott oszlop | `oblio_fiokok.utolso_token` / `utolso_token_expires_at` — sosem írva/olvasva, de csábítás plaintext Bearer tárolásra | `2026-04-16-wc2-oblio-integracio.sql:50-51` |
| Vak őrszem | `selftest-szamla-zip-alairas.mjs:59-62,83` a WEBES olvasót ellenőrzi „desktop mappaolvasó" néven, az `excel.rs` nincs a listában | script |
| Gyenge őrszem | `selftest-oblio-evzar.mjs:66` a véglegesített-ágnál csak szöveg-jelenlétet néz, `return`-t nem; az év forrását sem köti — két mutáns bizonyítottan átcsúszik | script |
| Naplózás | A matcher NODE_ENV-kapu nélkül konzolra írja a teljes párosítási riportot (beszállítók, CUI-k, összegek) — a lánc többi log-ja kapuzva van | `oblio-matcher.ts:526` |
| Naplózás | A 401-ág elnyeli az eredeti hibatörzset (diagnosztikai vakfolt) | `oblio-client.ts:55` |
| Kerekítés | `osszegNet + osszegTva` visszakerekítés nélkül → `1469.1299999999999` a `numeric` oszlopban, és ezt küldi vissza a `markInvoicePaid` | `oblio-actions.ts:203` |
| Séma | Az Oblio→DB szinkron-upsert kihagyja a NOT NULL `osszeg_net`-et, és a hibát haszontalan `try/catch` nyeli el → új sor SOHA nem jön létre | `oblio-lookup-actions.ts:264` |
| Barrelek | `apps/web/lib/finance/oblio/*.ts` a GYÖKÉR `@kartoteka/ui-app` barrelre mutat, és három szerver-action importál belőle → a `'use client'`-csapda klasszikus felállása | `oblio-errors.ts:4`, `oblio-types.ts:6` |
| Dokumentáció | `oblio-mappa-panel.tsx:10-11` és a súgó Oblio-szakasza (`FinanceSugoTab.tsx:1528`) a 2026-08-28 óta nem létező webes mappa-utat tanítja | több |
| Dokumentáció | Ellentmondó JSDoc a web-FSA kibontóban (index-alapú párosítást ír le, a kód fájlnév-mintát használ) és az `ubl-parser.ts:50` kommentben (`LineExtensionAmount` vs. `TaxExclusiveAmount`) | `oblio-folder.ts:357`, `ubl-parser.ts:50` |
| Inkonzisztencia | `match_confidence` alapértéke a két íróban eltér ('medium' vs 'high'); a `bulkSave` a szándékot jelenti mentettként | `oblio-ellenorzes-actions.ts:186,329,348` |
| Év-zár | A `saveOblioMatch` / `removeOblioMatch` / `updateKiadasCui` év-zár kapu nélkül ír (a varázslóban van csak) | `oblio-ellenorzes-actions.ts:151,230,372` |
| Halott prop | `szamlak-egyeztetese-tabs.tsx:59` deklarálja és a `page.tsx:39` átadja a `congregationId`-t, a komponens nem destrukturálja | UI |
| Fájlnév-segédek | A böngészős `normalizeFileBaseName`/`extractAnafUuidFromFilename` regexe eltér a szerveres ikerpártól; az egyetlen selftest csak a szerverest fedi | `ubl-parser.ts:335`, `selftest-ubl-parser.mjs:31` |
| Halott ág | A `stornoInvoice` fail-open ága (rossz végpont: DELETE csak tervezetre; a hibát elnyeli, lokálisan mégis sztornóz) — ma hívó nélkül, tehát latens | `oblio-actions.ts:401` |
| Nyers hibaszöveg | A nem leképezett Oblio HTTP-státuszok nyers törzse csonkítatlanul a felhasználói üzenetbe és a `utolso_teszt_hiba` oszlopba kerül | `oblio-errors.ts:75,94` |
| Számolási hiba | A shared fül „N PDF mind biztosan párosítva" üzenete kivonással számol → egy PDF több XML-hez is beszámítódik, ellentmondva a saját árva-listájának | `OblioEllenorzesTab.tsx:652` |
| Séma | A `resp.json()` védtelen az `oblioFetch`-ben (a token-ág helyesen kezeli) → nyers `SyntaxError`/`TimeoutError` a lelkésznek | `oblio-client.ts:89` |
| e-Factura mező | A builder `client` objektumába csak `cif` és `name` kerül (cím/város/ország soha), a `vatPayer` sincs kitöltve → RO CIUS-elutasítás kockázata | `oblio-invoice-builder.ts:59-68` |

---

## 7. Fejlesztési javaslatok (nem hibák)

Hatás/ráfordítás szerint rangsorolva. Ezek **nem** a lánc hibái, hanem hiányzó képességek.

| # | Javaslat | Hatás | Ráfordítás | Hol kezdeni |
|---|---|---|---|---|
| F1 | **Beszállító (CUI) szerinti tanuló kategória-javaslat.** A `kiadas_kedvezmenyezett_cui_idx` részleges index MÁR létezik (`2026-04-16-wc2-10-…sql:32-34`), mégsem hívja senki. Új action: legutóbbi 3 `id_kiadascel` CUI szerint, gyakorisággal → elő-választás + a lista tetején „Legutóbb: 201.03 Villany (11 számla)". Ma minden számlánál nulláról indul a ~900 elemű lista. | **Nagy** (órákban mérhető időmegtakarítás évente + kevesebb téves kategória) | S–M | `OblioKiadasWizardDialogBody.tsx:113`, `desktop-oblio-tab.tsx:1143` |
| F2 | **A desktop mappás út írja a `szallitoi_szamla` táblát is** (új tábla helyett a meglévőt!) és töltse fel az XML/PDF-et a `szallitoi-szamlak` dokumentumtár-kategóriába. Egy csapásra megoldja a törvényi megőrzést (P1-30), a webes láthatóságot és a két igazság-forrás egyesítését. | **Nagy** | M–L | `desktop-oblio-tab.tsx:353` |
| F3 | **Fizetési határidő (`dueDate`) megjelenítése.** A parser már kiolvassa (`ubl-parser.ts:174`), egyetlen fogyasztója a nyomtatvány. Kell: oszlop a táblába, „Fizetendő (határidő szerint)" szűrő, „Lejáró 7 napon belül: N" StatCard. | **Nagy** (késedelmi kamat elkerülése) | S | `desktop-oblio-tab.tsx:912` |
| F4 | **Kötegelt bevezetés a desktopon.** A kész, lépcsős varázsló (`OblioKiadasWizardDialogBody`, 434 sor, haladásjelzővel) a közös csomagban van, csak a kivezetett fül wrappeli. Mountolni kell, plusz a fizetési mód/bankszámla választót beemelni a body-ba, és a köztes teljes `loadData()`-t elhagyni. | **Nagy** | M | `desktop-oblio-tab.tsx:960` |
| F5 | **Tételsorok (`InvoiceLine`) kiolvasása és megjelenítése** a kategória-döntés pillanatában. Ma a lelkész csak a szállító nevét és az összeget látja („SC MULTISERV SRL" — takarítószer? kazánjavítás? irodaszer?). Max. 20 sor, csak képernyőre. | Közepes | M | `ubl-parser.ts:121` |
| F6 | **Számla-előnézet a döntés pillanatában** (osztott nézet a bevezető/kézi párosító modálban). A teljes olvasó-lánc (`oblioReadBase64` + `base64ToBlob`) már megvan a tartalom-elemzéshez. | Közepes | M | `desktop-oblio-tab.tsx:180` |
| F7 | **Kereső + havi bontás a számla-listában.** Ma három szűrő-chip és egyetlen éves lista; a lelkész havonta zár. A `groupedByMonth` minta a Tranzakciók fülön kész. | Közepes | S–M | `desktop-oblio-tab.tsx:880` |
| F8 | **A „Nincs SPV-ben" kártya legyen lefúrható** — a `'kiadas-nelkul'` FilterMode már deklarálva van, csak halott. Soronként „Számla bekérése" művelet + export. | Közepes | S | `OblioEllenorzesTab.tsx:204`, `desktop-oblio-tab.tsx:806` |
| F9 | **ANAF 60 napos visszaszámláló + letöltési rutin a desktopon.** A `DeadlineCard` kész komponens, csak a kivezetett webes fül rendereli. Mellé „Oblio Wallet megnyitása" gomb + 3 lépéses rutin-csík. | Közepes | S | `OblioEllenorzesFolderCard.tsx:274-330` |
| F10 | **Ismétlődő beszállító hiánya-jelzés**: „az elmúlt 6 hónapból 4-ben jött számla az Electricától — márciusban NINCS". Az adat (`supplier_cui` + `invoice_date`) rendelkezésre áll. | Közepes | M | új elemzés |
| F11 | **Egyeztetési jegyzőkönyv** (nyomtatás + CSV) a számvevő és az egyházmegye számára: párosított párok / párosítatlan számlák / számla nélküli kiadások. Ma csak EGY számla nyomtatványa létezik. | Közepes | M | `oblio-print-builder.ts` |
| F12 | **„Fizetés dátuma" mező a bevezetésnél** — ma automatikusan a kibocsátási dátum lesz a kiadás dátuma, ami hónapfordulón elrontja a kassza/bank egyeztetést. Az év-zár kapu ekkor a fizetési dátum évére vonatkozzon. | Kicsi–közepes | S | `desktop-oblio-tab.tsx:597` |
| F13 | **A súgó Oblio-szakaszának átírása az ÉLŐ desktop-útra** (a Chrome-követelmény és a „Mappa beállítása" lépés törlendő). | Kicsi | S | `FinanceSugoTab.tsx:1513-1550` |

---

## 8. Architekturális megfigyelések

1. **A „közös codebase" ígéret itt nem teljesül.** A shared `OblioEllenorzesTab` (1785 sor) senkit nem szolgál ki, a desktop párhuzamosan fejlődő 1393 soros saját implementációt futtat. A megosztott tiszta függvényeket (`parseUblXml`, `matchXmlsToKiadas`) a desktop importálja, de a **teljes vezérlést** újraírja — így minden javítás pontosan felezve ér célba. Ez a lánc első számú strukturális problémája: a 2026-08-28-i `semnatura`-javítás, a 2026-06-14-i P0-2 adatvesztés-javítás, a duplikátum-figyelmeztetés és a valós mtime mind csak az egyik ágra ment be.

2. **Két UBL-parser, két igazság.** `packages/ui-app/.../ubl-parser.ts` (DOMParser, 340 sor) és `apps/web/lib/oblio/ubl-parser.ts` (saját tokenizáló, 516 sor). Bizonyítottan eltérnek: `||` vs `??` a bruttónál, `gyokerNev` mező megléte, méret- és mélység-plafon megléte, fájlnév-segédek viselkedése, hibakezelés (néma vs. fail-closed). **Javaslat:** a KÖZÖS, DOM-független magot (mezőnevek, összeg-szemantika, CUI-lánc, fájlnév-segédek) egy `@kartoteka/core`-beli modulba emelni; a két parser csak a bemenet-olvasásban különbözzön.

3. **Két igazság-forrás ugyanarra a kérdésre.** `oblio_kiadas_match` (mappás út, desktop-only) és `szallitoi_szamla_kiadas` (feltöltéses út, web-only). A webes Tranzakciók fül mindkettőt olvassa, a desktop egyiket sem teljesen — ezért ad a desktop „Nincs SPV-ben" riasztása rendszeresen hamis számot. Az F2 javaslat ezt szünteti meg.

4. **Monolit `OblioEllenorzesTab`.** 1785 sor, benne egyetlen `handleRefresh` (338 sor), ami scan → kibontás → parse → cache → DB-lekérés → matcher → auto-perzisztálás → mtime-írás láncot futtat, hiányos `useCallback` függőségekkel. Ez a fájl ma halott; **ne javítsuk, hanem döntsük el a sorsát** (törlés vagy újraaktiválás), mert amíg ott áll, minden későbbi javítás ide megy a valóban futó Rust-ág helyett.

5. **Kétrétegű, de nem azonos hatókör.** Az app minden Oblio-lekérésre explicit `.eq('congregation_id', effectiveCongregationId)`-et tesz (fail-closed, a NULL-skalár hibaosztály itt **nem** áll fenn), az RLS viszont a jóval tágabb `current_user_can_access_congregation()`-t engedi. A helyesség feltétele, hogy az app-oldali szűrő SOHA ne maradjon le — az RLS nem fogja megfogni. Két helyen már le is maradt (`saveOblioMatch` CUI-mellékírás, desktop közvetlen írások).

6. **Az őrszemek nem oda néznek, ahol a kód fut.** `selftest-szamla-zip-alairas.mjs` a webes (halott) olvasót ellenőrzi „desktop mappaolvasó" néven; `selftest-oblio-evzar.mjs` egy halott utat őriz, és két mutáns bizonyítottan átcsúszik rajta; a `selftest-ubl-parser.mjs` csak a szerveres parsert tölti be, miközben a másik szolgálja ki a desktopot; a `selftest-adatvedelmi-fedezet.mjs` egyetlen IndexedDB-nevet ismer. **A projekt saját, memóriában rögzített hibaosztálya („őrszem negatív asszert nélkül vak") itt négyszer sült el.**

7. **A `high` konfidencia mint íratlan szerződés.** A matcher `confidence:'high'` kimenetét mindkét hívó megerősítés nélkül DB-be írja, és a következő futáson az 1. lépcső „kézzel megerősített"-ként adja vissza. Ez azt jelenti, hogy **minden `high`-ág fals pozitívja azonnal és visszafordíthatatlanul bebetonozódik**. A matcher küszöbein bármilyen jövőbeli módosítás pénzügyi hatású — és ez az egyetlen automatán perzisztáló pénzügyi függvény, amit nulla önteszt véd.

---

## 9. Javasolt cselekvési sorrend

**0. lépés — élő állapotfelmérés (a migrációs fájl nem bizonyíték).** Futtatandó SQL-csomag, mielőtt bármit javítunk:
```sql
-- (a) vault ACL
SELECT p.oid::regprocedure, pg_catalog.array_to_string(p.proacl,' | ') FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  AND p.proname IN ('vault_encrypt','vault_decrypt');
-- (b) oszlop-jogok a titkon
SELECT grantee, privilege_type, column_name FROM information_schema.column_privileges
WHERE table_name='oblio_fiokok' AND column_name='api_secret_encrypted';
-- (c) hiányzik-e az ertesitesek.megjegyzes?
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='ertesitesek' AND column_name='megjegyzes';
SELECT public.check_oblio_deadline_for_user();
-- (d) létezik-e a match unique constraint (minden upsert erre épül)?
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.oblio_kiadas_match'::regclass;
-- (e) kitettség-mérők
SELECT congregation_id, utolso_teszt_hiba FROM public.oblio_fiokok WHERE utolso_teszt_hiba IS NOT NULL;
SELECT e_factura_status, count(*) FROM public.oblio_szamlak WHERE tipus='e_factura' GROUP BY 1;
SELECT congregation_id, anaf_uuid, count(*) FROM public.szallitoi_szamla
  WHERE anaf_uuid !~ '^[0-9]{8,}$' GROUP BY 1,2 ORDER BY 3 DESC;
SELECT m.id FROM oblio_kiadas_match m JOIN kiadas k ON k.id=m.kiadas_id
  WHERE k.congregation_id <> m.congregation_id;
SELECT id, nev, tva_alany, tva_alany_tol FROM public.congregations WHERE tva_alany = true;
```

**1. Biztonsági zárás (P0-1, P0-2).** REVOKE-ok élesben; service-role kliens a széfhez; oszlop-szintű GRANT; a `2026-07-17-…sql` allowlist tisztítása; token-cache kulcs javítása; CIF-lista kiszedése a hibaüzenetből; `testOblioConnection` szerepkör-kapu. Utána **kulcsforgatás + Oblio-oldali secret-csere**. *(Zárja: P0-1, P0-2, P2-„vault STABLE", P2-„kapuzatlan testOblioConnection", P3-„nyers hibaszöveg", P1-26.)*

**2. Desktop adatvesztés megállítása (P0-6, P1-1, P1-2).** `move_into` ütközés-ág, `remove_file` beemelése az `if moved` ágba, `let _` felszámolása; token-alapú `semnatura`-felismerés Rustban; beágyazott ZIP rekurzió + fail-closed; `report.errors` megjelenítése a felületen; `skipped` szétbontása. **Emellé: az `excel.rs` felvétele a `selftest-szamla-zip-alairas.mjs` fájllistájába, mutáns-alapú negatív asszerttel.** *(Zárja: P0-6, P1-1, P1-2, P2-„félbehagyott kibontás", P2-„Rust ZIP-bomba", P2-„path-traversal", P3-vak őrszem.)*

**3. Kimenő számlázás megfelelősége (P0-3, P0-4).** ÁFA-kulcs egyetlen dátumhoz kötött forrásból; `art. 331` hivatkozás törlése; `tva_alany_tol` figyelembevétele; a bruttó az Oblio válaszából; idempotencia-kapu + szándék-sor + timeout-egyeztetés; `try/catch/finally` a kiállító dialógusban; ÁFA-őrszem. *(Zárja: P0-3, P0-4, P1-37 egy része, P3-kerekítés.)*

**4. Deviza- és típus-kapuk (P0-5, P1-10, P1-11, P1-8).** Fail-closed pénznem-kapu a bevezető varázslókba **és szerveroldalra**; jóváíró kizárása + szerveroldali őr; `InvoiceTypeCode` olvasása és a negatív-összeg szabály; `||` → `??`, majd a `brut`/`fizetendo`/`elolegLevonva` szétválasztása. Selftest mindkét parserre. *(Zárja: P0-5, P1-8, P1-10, P1-11.)*

**5. Az ANAF-óra üzembe helyezése (P1-28, P1-29).** Az `ertesitesek` oszlop rendezése (vagy a meglévő `hivatkozas` használata); fail-loud `status:'error'`; `after()`; `recordOblioDownloadNow` zéró-sor őr; a desktop óra valós mtime-ra állítása és a visszaszámláló kijelzése (F9). *(Zárja: P1-28, P1-29, P2-„desktop óra", részben F9.)*

**6. Tranzakció-integritás (P1-18, P1-19, P1-20, P1-21, P1-22, P1-23).** A varázsló `kedvezmenyzett` hibájának javítása (vagy áttérés a közös `saveExpenseUseCase`-re); idempotencia-kapu; ellenőrzött rollback + audit; a sztornó-kaszkádok mindkét irányban (kiadás → match; befizetés → csak `chitanta_papir`); `stornozott` szűrők; DB-szintű `UNIQUE (congregation_id, kiadas_id)` a duplikátumok kitakarítása után. *(Zárja: P1-18…P1-23, P2-„foglaltság", P2-„keresztoszlop-integritás".)*

**7. Párosító-motor helyessége (P1-12…P1-17) — CSAK őrszemmel együtt.** Először `scripts/selftest-oblio-matcher.mjs` a fenti 6 esetre, mutáns-próbával; utána a küszöbök javítása. Ez a lépés önmagában nem indítható, mert minden változtatás pénzügyi hatású és azonnal perzisztálódik. *(Zárja: P1-12…P1-17, P2-matcher-csoport.)*

**8. A felület hazug jelzései (P1-33…P1-36, P1-39, P1-34).** Fedezet-arány a jelvényekbe; szerveroldali `konyveletlen` szűrő; fail-closed összeg-szűrő a lookupban; a lookup ne írjon; az átnevezés csak `high`-ra; PDF-parser regex-javítások. *(Zárja: P1-33…P1-36, P1-39, P2-UI-csoport egy része.)*

**9. Teljesítmény (P1-38 + P2-teljesítmény).** Előtöltő action a bevétel-sorokra; `useCallback`; lapozás/darabolás mindenhol (`selectAllPaged`); a desktop kötegelt olvasó parancsa és lokális parse-cache; a diagnosztikai ág vágása; `pdfjs` `destroy()`.

**10. Halott kód és dokumentáció rendezése (P3).** A webes mappás fül sorsának eldöntése; az őrszemek célpontjainak javítása; a súgó és a panel-szövegek átírása; a `kartoteka_oblio_cache` felvétele a kijelentkezési törlésbe (+ egyszeri purge-jelölő).

**11. Fejlesztések (F1–F13).** Az F1 (tanuló kategória), F3 (fizetési határidő) és F4 (kötegelt bevezetés) hozza a legnagyobb napi hasznot; az F2 (szallitoi_szamla-szinkron) egyszerre zárja a P1-30-at és egyesíti a két igazság-forrást.

---

## 10. Amit NEM tudtunk ellenőrizni

### ⚠️ Az ellenőrzési lánc CSONKA

**Minden találat átment EGY adversariális cáfolat-körön** (külön ágens próbálta megcáfolni a forráskódban), **de a tervezett MÁSODIK kör — a P0/P1 találatok kereszttüze két további, független lencsével — a munkamenet token-limitje miatt NEM futott le.**

Ez konkrétan azt jelenti:
- A **P0/P1 besorolások egyetlen ellenőrzésen alapulnak, nem hármon.** Egy-egy találat súlyossága felfelé vagy lefelé tévedhet, és nem zárható ki, hogy egy P0 valójában elérhetetlen kódúton fekszik, vagy hogy egy P2 valójában élesben sül el.
- **A javítás megkezdése előtt a legsúlyosabbakat — kiemelten a hat P0-t és a 4.4/4.6 csoport P1-jeit — érdemes emberi szemmel is visszaellenőrizni**, mielőtt élesben SQL-t futtatunk vagy a Rust-ághoz nyúlunk.
- Ez nem a találatok érvénytelensége: minden állítás mögött konkrét, idézett forráskód van, és több esetben Node-dal/rustc-vel futtatott bizonyíték is. De a „két független lencse" biztosítéka hiányzik.

### Amit a forráskódból elvileg sem lehetett ellenőrizni

1. **Az ÉLŐ adatbázis-állapot.** A repó és a produkció bizonyítottan széthúzhat (ez a projekt saját, rögzített hibaosztálya). Nem ellenőriztük: a `vault_encrypt`/`vault_decrypt` tényleges ACL-jét; az `oblio_fiokok` oszlop-szintű jogait; hogy létezik-e élesben az `oblio_kiadas_match_uuid_unique` constraint (ha hiányzik, **MINDEN párosítás-mentés 42P10-zel bukik**, és ezt a desktop némán elnyeli); hogy tényleg hiányzik-e az `ertesitesek.megjegyzes`; hogy hány `oblio_fiokok` sor van még legacy (üres/PIN) kulcson.
2. **A produkciós séma.** A `Database_schema.sql` dump bizonyítottan **nem** rendereli a többoszlopos UNIQUE-okat és a CREATE INDEX-eket, tehát belőle constraint-hiány nem bizonyítható. A `kiadas.kedvezmenyzett` oszlop hiányát három független forrás támasztja alá (dump + projekt-dokumentáció + CHANGELOG-beli élő hibaüzenet), de élő `information_schema` lekérdezés nem futott.
3. **Az Oblio API tényleges viselkedése.** Nem hívtuk az API-t. Feltevés maradt: mikor ad 200-as HTTP-t hibás borítékkal; visszhangozza-e valaha a `client_secret`-et hibaválaszban; elfogadja-e még a 19%-os kulcsot; mit ad a `DELETE /api/docs/invoice` SPV-re felment számlára; létezik-e és hogyan viselkedik a `PUT …/cancel`. A `withEInvoiceStatus` paraméter hiányának hatása szintén csak a saját típus-doksink alapján állítható.
4. **Futásidejű mérés éles adaton.** A teljesítmény-számok (matcher 14,4 s, `kiadasResults` 8 ms, 500-soros Tranzakciók fül ~2,5 perc) **szintetikus, Node-ban újrajátszott** mérések vagy a Next.js dokumentációjából vezetett következtetések — nem éles profilozás.
5. **A valódi ANAF SPV / Oblio Wallet ZIP-formátumok.** A beágyazott ZIP, a `semnatura`-nevezéktan és a PDF-nevezéktan a repó saját fixtúráiból és kommentjeiből ismert. Egy éles, mai SPV-letöltésen érdemes visszamérni — kiemelten a nem-UTF8/BOM-os XML esetet, ami ma némán kiesik.
6. **A desktop capability-viselkedés.** Az `openPath` hiányzó engedélye a `tauri-plugin-opener-2.5.3/permissions/default.toml` olvasásából következik; futó buildben nem próbáltuk ki.
7. **Kliens-oldali böngésző-viselkedés.** A File System Access permission-életciklus, a Dexie-hibák és a mobil érintőfelület-mérések (a 28 px-es gombok, a `w-full` táblázat 375 px-en) nem futó böngészőben lettek ellenőrizve — a repó saját, kommentben rögzített 40 px-es szabványához mértük őket.

### Bizonytalan / további vizsgálatot igényel

- **A `stornoInvoice` fail-open ága** (`oblio-actions.ts:401`) ma hívó nélküli, tehát latens. A besorolása (P3) azon áll, hogy az action nincs bekötve — ha bárki bekötné a P1-24 javítása során, az azonnal P0-vá válik. **A bekötés ELŐTT javítani kell.**
- **A `kartoteka_oblio_cache` maradványainak tényleges tartalma** a már telepített gépeken: nem tudjuk, hány gépen és mennyi szállítói fejadat ül benne 2026-08-15 és 08-28 között.
- **A `PayableAmount=0` és a `cbc:UUID`-hiány gyakorisága** az éles adatban: a 0. lépés (c) és a fallback-uuid felmérő SQL-je adja meg, mekkora a valós kitettség.
- **Az e-Factura státusz-eloszlás** (`nepreluat` sorok aránya és koruk) mutatja meg, hány számla nem ért el ténylegesen az ANAF-hoz — ez a P1-24 prioritását dönti el.

---

*A jelentés a `feat/hibas-sor-cimzes` ágon, a 2026-09-02-i forrásállapot alapján készült. Minden útvonal a repó gyökeréhez képest relatív; a jelentés készítése során egyetlen fájl sem módosult.*