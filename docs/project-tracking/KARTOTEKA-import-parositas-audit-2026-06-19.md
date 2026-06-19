# Pénzügyi importáló — személy-párosítás audit és fejlesztési terv

## 1. Vezetői összefoglaló

A pénzügyi importáló személy-párosító motorja önmagában jól megtervezett (6-szintű exact-fallback lánc, ékezet-normalizálás, magyar asszonynév-modell, utca/házszám-szűrés, batch-lookup), **de a felhasználó panasza valós és három fő gyökérre vezethető vissza**: (1) a párosítás teljes egészében *pontos* string-kulcs egyezésre épül — a meglévő Jaro-Winkler fuzzy motor nincs bekötve a fő láncba, így minden elgépelés, becenév vagy parsolási eltérés azonnal „nem található" eredményt ad; (2) az **adomány/general-income ág** egylépéses, előnézet és kézi felülbírálás nélküli — a több-jelöltes és nem-talált tételek **némán, `id_szemely = NULL`-lal** importálódnak, a felhasználó nem látja és nem javíthatja a párosítást; (3) az **egyházfenntartás-ágon** sincs szabad-szöveges tag-kereső a „nem található" soroknál, és a round-robin auto-elosztás tartalom-vakon, magabiztosnak látszó találgatást kínál előre-bepipálva.

A legfontosabb három teendő: **(A)** kötelező párosítás-előnézet + szabad-szöveges tag-kereső bevezetése az adomány-ágra és a „nem található" sorokra (a meglévő `searchPersonsForManualPickAction` újrahasznosításával); **(B)** szerver-oldali védőháló, hogy párosítatlan sor ne kerülhessen be némán; **(C)** a fuzzy/becenév-réteg bekötése a lookup-lánc végére *review*-státuszú (nem auto-confirm) találatként.

## 2. Hogyan működik most a párosítás (architektúra)

A három ág (egyházfenntartás / adomány / szerződés) **közös párosító magot** használ, de erősen eltérő körítéssel.

**A közös motor** (`apps/web/lib/import/lookup-resolver.ts`):
- `parseDonorString` (`donor-string-parser.ts`) szétbontja a magyar „Forrása" stringet: cég-szűrés → név/cím szét (` - ` separator) → prefix (Özv./Elv./Dr./id./ifj.) levágás → férjes „né"-token detekció → `csaladnev | husbandFamilyName`, `k_nev`, `szcs_nev` (lánykori), `street`, `houseNumber`, `parseConfidence`.
- `buildAllPersonsLookupMap` egyetlen batch-query-ből 6 indexet épít (`byQuad`/`byTriple`/`byMaiden`/`byKnameFerfi`), mindegyik `normalizeNameForQuad`-dal kulcsolva (NFD ékezet-levágás + lowercase + szóköz-összevonás).
- `lookupPersonByQuadAttempt` 6-szintű, szigorútól lazáig haladó **exact** fallback-lánc: 1) quad (cs|k|dátum|nem) → 2-3) triple → 4/4b) maiden → 5) `k_nev|ferfi` utolsó esély. Több jelöltnél `filterByAddress` (utca+házszám exact) szűr.

**Kritikus közös vonás:** a finance-ágon a `sz_datum` mindig `null`, ezért az 1. (legbiztosabb, dátumos) szint **soha nem fut** — a lánc mindjárt a triple-re esik, ahol az azonos nevűek ambivalenssé válnak. A `jaro-winkler.ts` (`nameSimilarity`) **nincs bekötve** a donor↔tag párosításba (csak az xlsx↔xml cross-source matcher és az Oblio használja).

**Ahol az ágak eltérnek:**

| Jellemző | Egyházfenntartás (`egyhfenntartas-import-actions.ts`) | Adomány / general-income (`general-income-actions.ts`) | Szerződés (bérleti) |
|---|---|---|---|
| Folyamat | parse → preview (`parseAndPreviewEgyhf`) → **MatchStep UI** → `executeEgyhfImport` | upload → mapping → **azonnali** `executeGeneralImport` (nincs preview) | csak **manuális** dialógus (`RentalContractDialog`) |
| Több-jelölt kezelés | `matchMode:'multiple'` + round-robin elosztás + dropdown | **eldobva**, `id_szemely=NULL` | n/a |
| Kézi override | csak `multiple` soroknál (dropdown) | **nincs** | szabad-szöveges kereső |
| Import-előzmény | `executeEgyhfImport` szerepkör-kapu hiányos | rendszergazdai | n/a |
| Szerződés-import | — | — | **NEM LÉTEZIK** (a 104.04/104.05 sima befizetésként megy be, a `berleti_szerzodes` táblát sosem írja) |

A `finance-import-actions.ts` (Hivatalos Kassza) a leginkább kapuzott útvonal (`requireFinanceImportAccess` + `logImportRun` audit), de a UI ott is csak az `ambiguous` eseteket mutatja vizuálisan — a `not-found`/`unparsed` donorok némán `NULL`-ra esnek.

## 3. Megerősített problémák — priorizálva

### P0 — (nincs megerősített P0)

A bejövő audit több P0-jelölést **P1-re finomított**, mert egyik sem okoz visszafordíthatatlan adatvesztést vagy néma téves *pénzügyi* könyvelést — a befizetés mezői (összeg, dátum, iratszám, forrasa) mindig helyesek, csak a személy-FK hibás/üres, ami utólag javítható. A legközelebb a P0-hoz az árva importok némasága és az adomány-ág hiányzó kontrollpontja áll — ezeket P1 felső sávjaként kezeljük.

### P1 — funkció-meghiúsító / adatminőség-romlás

| # | Cím | Hivatkozás | Hiba | Hatás | Javítás | Munka |
|---|---|---|---|---|---|---|
| P1-1 | **Adomány-ág: nincs előnézet/override** | `general-income-wizard.tsx`; `general-income-actions.ts:259-325` | Egylépéses upload→mapping→insert; az `executeGeneralImport` `if ('id' in lookup)` ágon kívül mindent eldob | A `{candidates}` és `null` esetek `id_szemely=NULL`-lal mennek be, nincs review-kontrollpont | Bontsd ketté: új `previewGeneralImport` action (insert nélkül) + preview-lépés a wizardba a `MatchStep` mintájára; `executeGeneralImport` fogadjon `manualSzemelyId`-t + RLS-scope check | közepes |
| P1-2 | **Ambiguous tételek némán elvesznek (adomány)** | `general-income-actions.ts:275,303` | A `{candidates}` kimenet az `else`-be esik → `personNotFound++`, `id_szemely=NULL` | Épp az azonos-nevű magyar eset vész el javíthatatlanul; a `personNotFound` számláló a UI-n meg sem jelenik | Térképezd a candidates-et `matchMode:'multiple'`-re (mint `resolveSzemelyViaMaps`); minimum: add vissza és jelenítsd meg a result-képernyőn | közepes |
| P1-3 | **Not-found sorok árva importja + nincs kézi keresés (egyhf)** | `match-step.tsx:96-97,381`; `egyhfenntartas-wizard.tsx:109-117`; `egyhfenntartas-import-actions.ts:526-583` | A `<select>` csak `multiple`-nél renderelődik; a not-found sorhoz csak Skip van. A nem-skippelt not-found sor `id_szemely=NULL`-lal beszúr | A létező személyhez nem köthető a befizetés a UI-ból; a result CSV „új tag felvétele" felirata duplikált személyre csábít | (a) kliens-filter + **szerver-guard**: ha `finalSzemelyId==null && nem cég` → ne insertálj; (b) köted be a meglévő `searchPersonsForManualPickAction`-t a not-found RowCard-ba; (c) megerősítés-figyelmeztetés | közepes |
| P1-4 | **Lánykori néven nyilvántartott férjes asszony nem párosul** | `donor-string-parser.ts:187-212`; `lookup-resolver.ts` (maiden ág); `egyhfenntartas-import-actions.ts:722` | „Beder Győzőné Elvira"-nál `csaladnev=null`, `szcs_nev=null` → a lookup csak a férj „Beder" nevén keres; a maiden-fallback holt (üres `szcsNorm`), ha a tag lánykori néven van | Férjes asszonyoknál degradált párosítási arány → sok kézi munka (a panasz közvetlen oka) | Spouse-bridge a meglévő 2-kör (resolveLookups:1037) mintájára: resolváld a férjet (`husbandGivenName` a „né"-token lehántásával), és háztartás/cím alapon szűkítsd a feleség-jelölteket; + az 5. szint adjon `multiple`-t not-found helyett | közepes |
| P1-5 | **Dup-check kulcsból hiányzik az `id_szemely`** | `egyhfenntartas-import-actions.ts:556-565`; `Database_schema.sql:124-162` | Tömbös nyugtán két KÜLÖN személy azonos összegű befizetése azonos (cong, év, iratszam, osszeg, cél) kulcsra esik → a 2. duplikátumként kiesik | Néma adatvesztés; a `.maybeSingle()` 2+ történelmi találatnál PGRST116-ot dob | Vedd be az `id_szemely`-t (és `id_csalad`-ot) a dup-kulcsba (a `finalSzemelyId` már a check előtt rendelkezésre áll); `.limit(1).maybeSingle()`; opcionálisan parciális UNIQUE index SQL-fájlként | **kicsi** |

### P2 — minőség / UX-romlás, kézi munka

| # | Cím | Hivatkozás | Hiba | Javítás | Munka |
|---|---|---|---|---|---|
| P2-1 | **Fuzzy match nincs bekötve a fő láncba** | `lookup-resolver.ts:469-609`; `jaro-winkler.ts`; `donor-string-parser.ts` | Mind a 6 szint `Map.get()` exact; nincs becenév-szótár. Elgépelés/becenév → not-found (az ékezet-dimenzió már kezelt, a rés szűkebb: nem-ékezetes elütés, transzpozíció, becenév) | Új 5.5 lépés a Fail elé: `nameSimilarity` ≥0.92 → `{id}`, 0.88–0.92 → `{candidates}` review-ként; becenév-szótár a `knevVariants`-be; `fuzzy-name` matchMode élővé tétele | közepes |
| P2-2 | **`k_nev|ferfi` utolsó-esély ág false-positive** | `lookup-resolver.ts:487-602` | Az 5. ág kulcsában nincs vezetéknév; `filterByAddress` 1-re redukálhat más vezetéknevű taghoz → magabiztos `{id}` (a belső `resolvePersonByQuad` szigorúbb!) | Az 5. ágat ne `resolveCandidates`-szel zárd: csak valódi `length===1` → `{id}`, több jelölt → `{candidates}` (UI dönt); vagy vezetéknév-visszaellenőrzés JW-vel | **kicsi** |
| P2-3 | **Round-robin auto-elosztás tartalom-vak** | `egyhfenntartas-import-actions.ts:678-702`; `egyhfenntartas-wizard.tsx:66-72` | Index szerint rendel jelöltet (nem `forrasa`↔candidate név/cím alapján), és előre bepipálja. Valódi azonos-nevűeknél szimmetrikus felcserélés (reconcile zöld marad) | Cím-alapú hozzárendelés round-robin helyett; ha a `forrasa`-k azonosak → ne találgass, hagyd üresen a dropdownt (kényszerített választás); auditáld `megjegyzes`-be | közepes |
| P2-4 | **`parseConfidence` sehol nem hat a párosításra/UI-ra** | `donor-string-parser.ts:229-238`; `egyhfenntartas-import-actions.ts:712-761`; `match-step.tsx` | A medium/low parse-ú találat is zöld „exact" badge-et kap; hamis biztonságérzet | Vidd át a `parseConfidence`-t a `SzemelyMatchInfo`-ba; gyenge parse-ú exact → `uncertain` fül + „⚠️ Bizonytalan név-felismerés" badge | közepes |
| P2-5 | **Utca-szűrés szóköz/egybeírás-érzékeny** | `lookup-resolver.ts:84-91,487-512` | `'Főút' ≠ 'Fő út'` → feleslegesen `ambiguous` (csak több kézi munka, nem hibás párosítás) | `normalizeStreetForMatch` helper (`/[\s.\-]/g` eltávolítás) mindkét oldalon; opcionális 3. tier fuzzy utca-match JW ≥0.92; házszámot ne lazítsd | **kicsi** |
| P2-6 | **`byKnameFerfi` aszimmetria — hiányzó `|?` variáns** | `lookup-resolver.ts:437-442,595` | A `byTriple`/`byMaiden` épül `|?`-tal, a `byKnameFerfi` nem → `ferfi=null` tag az 5. szinten sosem talál (szűk maradék-eset, mert a Step 3 általában elkapja) | Szimmetrizáld az indexet `|?`-tal; az 5. lépés próbálja a `|?`-ot, ha a flagges kulcs 0 jelöltet adott | **kicsi** |
| P2-7 | **`fuzzy-name` matchMode soha nem áll be** | `egyhfenntartas-import-actions.ts:740-742`; `lookup-resolver.ts:518,593-602` | Az 5. szintű (k_nev-only) találat zöld „exact"-ként a „Biztos egyezés" fülre kerül; ránézés nélkül elfogadva | A resolver adjon `matchLevel`-t; a hívó `kname-only` → `'fuzzy-name'`; a UI a `fuzzy-name`-et az `uncertain`/„ellenőrizd" fülre tegye | közepes |
| P2-8 | **General-import dedup nyers, nem-normalizált `forrasa`-ra épül** | `general-income-actions.ts:284-294` | Apró szöveg-eltérés (dupla szóköz, ékezet-variáns) → `.eq('forrasa', r.nev)` nem talál → dupla könyvelés EGY tagnál; `id_szemely` nem védi (nincs a kulcsban) | Normalizáld a `forrasa`-t a dedup előtt (trim + whitespace-collapse); vedd be az `id_szemely`-t a kulcsba; iratszám-üres esetre fokozott figyelem | **kicsi** |
| P2-9 | **General-import nem hívja a `distributeAmbiguousDonors` adomány-ágát** | `donor-distribution.ts:158-164`; `general-income-actions.ts:264-278` | A létező, kifejezetten adományra kalibrált auto-elosztó (pickBest + clearAddressMismatch) nincs bekötve → több-jelöltes adomány párosítatlan | Építs `DonorResolution`-t a candidates-ből, hívd `distributeAmbiguousDonors`-t (egyhf-raws kizárással), `szemelyId ?? dist.selections[r.nev]`; jelezd az `autoSet` sorokat | közepes |

### P3 — szűk edge-case

| # | Cím | Hivatkozás | Hiba | Javítás | Munka |
|---|---|---|---|---|---|
| P3-1 | **Egytokenes (cím nélküli) donor-név sosem párosul** | `donor-string-parser.ts:217-221`; `lookup-resolver.ts` | „Kovács" → `k_nev`-be kerül, a quad/triple/maiden mind üresben fut, az 5. szint keresztnévre indexel → not-found | Új `byCsaladnev` index (`|flag` + `|?`) + új vezetéknév-only fallback lépés `filterByAddress`-szel; az egytoken `csaladnev`-be | közepes |
| P3-2 | **Kategória-független személy-párosítás** | `lookup-resolver.ts`; `general-income-actions.ts` | Perselypénz/bérleti díj kategóriáknál is fut a lookup, ahol nem kellene | Kategória-alapú párosítás-kapcsoló `celId` szinten a loopban | **kicsi** |

### Szerződés-ág — strukturális hiány (P1-szintű funkcióhiány)

A **„Rendszergazdai importálóban nincs szerződés-import.** A `finance-import-tabs.tsx` csak Kassza + Bevétel-import szekciót kínál; a 104.04/104.05 (bérjövedelem) sorok sima befizetésként mennek be, a `berleti_szerzodes` táblát **sosem** érintik. Az import után nem keletkezik szerződés-objektum, a párosítás kizárólag a futásidejű `rental-calculation.ts` duális (id VAGY `forrasa==berlo_nev`) egyezésén múlik, ami **kétszeresen is számolhat** (`rental-calculation.ts:10-16`). Tisztázandó, hogy szándékos-e (lásd 6. szakasz), majd vagy szerződés-import bevezetése, vagy a duális számítás javítása szükséges.

## 4. Fejlesztési javaslatok (a kutatásból)

**1. Pontozott, küszöbölt párosítás 3 sávval (match / review / no-match).**
*Mit:* a lookup ne bináris (talál / nem talál) legyen, hanem konfidencia-pontszámot adjon vissza. *Miért:* a record-linkage best practice a „clerical review" zóna (pl. JW 0.88–0.92), ahol ember dönt — pont ez hiányzik. *Hogyan:* a meglévő `nameSimilarity` (`jaro-winkler.ts`, 0.85/0.88/0.92 küszöbök, sorrend-független token-match) bekötése az exact-lánc után; ≥0.92 + egyetlen jelölt → auto, 0.88–0.92 → `{candidates}` review. *Forrás:* Fellegi–Sunter record linkage modell, dedupe.io clerical-review minta.

**2. Magyar név-egyezés rétegei.**
*Mit:* (a) becenév-szótár (Pista/Pisti→István, Kati/Katica→Katalin, Bözsi/Erzsi→Erzsébet, Jóska→József, erdélyi szóhasználatra kalibrálva); (b) fonetikus kulcs az elgépelésekhez; (c) az ékezet-normalizálás már kész. *Miért:* a becenév és elütés a fő maradék recall-rés. *Hogyan:* a szótárt kétirányban a `knevVariants`-be generálva (query- ÉS index-oldalon) → a meglévő exact-lánc fogja meg, fuzzy nélkül is. *Forrás:* Soundex/Metaphone-szerű fonetikus blokkolás record-linkage-ban; a magyar névvariáció a meglévő `knevVariants` mintára épül.

**3. Import-UX: manuális felülbírálás, szabad keresés, új személy.**
*Mit:* minden not-found/multiple sorhoz debounce-os, RLS-scoped szabad-szöveges tag-kereső + „új tag létrehozása" gomb. *Miért:* az algoritmus sosem lesz 100%-os; az ember-a-hurokban a record-linkage UX alapköve. *Hogyan:* a **már meglévő** `searchPersonsForManualPickAction` (`lib/import/registry-manual-search-action.ts`) + a `registry-import/unresolved-candidates-list.tsx` `ManualSearchBox` mintájának bekötése a finance-ágakba — nem új kód, hanem újrahasznosítás. *Forrás:* az anyakönyvi import saját, már bevált mintája.

**4. Idempotens, auditált batch import + visszavonás.**
*Mit:* DB-szintű parciális UNIQUE index (`congregation_id, fizetettev, iratszam, osszeg, id_befizetescel, COALESCE(id_szemely,-1)) WHERE deleted=false`) `onConflict ignore`-ral; import-run naplózás minden ágon; egész import-run visszavonása. *Miért:* a párhuzamos/ismételt importok race-mentes idempotenciája és a hibás run visszacsinálhatósága. *Hogyan:* SQL-fájlként a user manuális futtatására (nincs Supabase MCP a Kartotékához); a `logImportRun` mintáját kiterjeszteni az egyhf/general ágra. *Forrás:* idempotens ETL upsert-minta.

**5. Szerződés-import bevezetése.**
*Mit:* a 104.04/104.05 sorokból opcionálisan `berleti_szerzodes` rekord létrehozása/párosítása az import wizardban, valódi `id_szemely` FK-val. *Miért:* jelenleg a szerződés-import nem létezik, a párosítás törékeny string-egyezésen áll. *Hogyan:* item-builder ág + a manuális dialógus tag-keresőjének újrahasznosítása; a duális futásidejű számítás (`rental-calculation.ts`) felülvizsgálata a dupla-számítás ellen. *Forrás:* a séma már kész (`berleti_szerzodes.id_szemely` FK létezik) — csak az író út hiányzik.

## 5. Javasolt ütemterv

**Gyors győzelmek (1-2 nap) — kis munka, magas hatás:**
1. **P1-5** dup-check `id_szemely` + `.limit(1)` (kicsi, néma adatvesztés ellen).
2. **P1-3a / P1-1 minimál szerver-guard**: ha `finalSzemelyId==null && nem cég` → ne insertálj némán (mindkét ágon). Ez azonnal megszünteti az árva importot.
3. **P2-2** `k_nev|ferfi` false-positive: 5. ág többes jelöltnél `{candidates}` (kicsi, téves párosítás ellen).
4. **P2-5** utca-normalizáló helper (kicsi, sok kézi munkát spórol).
5. **P2-6** `byKnameFerfi` `|?` szimmetrizálás (kicsi).
6. **P2-8** general-dedup `forrasa`-normalizálás (kicsi).

**Közepes (kb. 1 hét):**
7. **P1-3b/c** szabad-szöveges tag-kereső bekötése a not-found RowCard-ba (`searchPersonsForManualPickAction` újrahasznosítás) + megerősítés-figyelmeztetés.
8. **P1-2 + P1-1** adomány-ág preview-lépés + ambiguous candidates felszínre hozása.
9. **P2-7 + P2-4** `matchLevel` átvezetés → `fuzzy-name` és `parseConfidence` badge-ek, gyenge találatok az „ellenőrizd" fülre.
10. **P2-3** round-robin cím-alapúvá tétele / nem-konfidens elosztás üresen hagyása.

**Nagyobb (sprint):**
11. **P2-1 + 4.2** fuzzy fallback-réteg + becenév-szótár bekötése a fő láncba (review-státusszal, soha nem auto-confirm).
12. **P1-4** spouse-bridge a lánykori néven nyilvántartott férjes asszonyokra.
13. **P3-1** vezetéknév-only index + fallback.
14. **Szerződés-import** bevezetése (vagy a duális számítás javítása), a 6. szakasz tisztázása után.
15. DB-szintű idempotencia-index + import-run visszavonás.

## 6. Nyitott kérdések / amit a felhasználóval tisztázni kell

1. **Hol jelentkezik a panasz konkrétan** — a Hivatalos Kassza fülön, az egyházfenntartás match-stepen, vagy az adomány (general-income) ágon? Ez dönti el a sorrendet (az adomány-ág a leggyanúsabb, mert ott nincs semmilyen kontrollpont).
2. **A tagnyilvántartásban a `szcs_nev` (lánykori név) mennyire kitöltött?** Ha a legtöbb nőnél üres, a maiden-ág gyakorlatilag halott, és a P1-4 (spouse-bridge) a domináns fix; ha kitöltött, a férjes asszonyok a férj nevén keresendők.
3. **A `szemely.ferfi` mező mennyire kitöltött?** Ha többségében null/'?', a `husbandName → 'F'` kényszerítés tömegesen ronthatja a női párosítást (és a P2-6 `|?` fix fontosabbá válik).
4. **Az éles importokban kerültek-e már rossz emberhez befizetések** (round-robin auto-elosztás miatt)? Ez igazolná a P2-3 súlyosságát.
5. **A `not-found` és feloldatlan `multiple` sorokat tudatosan akarják-e árva (`id_szemely=NULL`) befizetésként importálni**, vagy kötelezően skip/blokk kell? (Jelenleg az árva import a default.)
6. **Kell-e becenév-szótár**, és ha igen, import-időben (kulcs-bővítés) vagy lookup-időben (variáns-generálás) épüljön be? Milyen erdélyi becenév-párokat lát gyakran?
7. **Szándékos-e, hogy a bérleti bevételek importja CSAK befizetést hoz létre, szerződést nem?** Ha igen, hol a visszakapcsolás az importált befizetés és a kézzel rögzített szerződés között a `forrasa==berlo_nev` szöveg-egyezésen túl?
8. **Az „egyéb bevétel" kategóriáknál (perselypénz, bérleti díj) egyáltalán kell-e személy-párosítás**, vagy ezeket kategóriánként ki kellene zárni a lookup-ból (P3-2)?
9. **A séma-dump (`Database_schema.sql`) elavult-e?** A kód aktívan használ `haztartas`/`haztartas_tag`/`legacy_csalad_id` táblákat, amik a dumpból hiányoznak — friss dump kell a család-párosítás (id_csalad) ellenőrzéséhez, és a `befizetescel.congregation_id` szűrés (`lookup-resolver.ts:865`) tisztázásához (üres kategória-térkép kockázata).

---

## 7. Halott kód az importáló párosító-alrendszerében

Külön dead-code sweep (teljes `apps/`+`packages/` hivatkozás-ellenőrzéssel). Besorolás: **biztos-halott** (törölhető), **halott munka** (write-only, egyszerűsítendő), **tisztítandó** (túl-exportált / nem használt import).

### 7.1 Biztosan halott — törölhető

| # | Tétel | Hivatkozás | Bizonyíték |
|---|---|---|---|
| H-1 | Teljes `'fuzzy-name'` lánc (union-érték + `case` + `szemelyFuzzyCount` + badge) | `egyhfenntartas-import-actions.ts:119,158,247,273,338`; `match-step.tsx:131,294,442` | A producer `resolveSzemelyViaMaps` SOHA nem ad `'fuzzy-name'`-et → a `case` sosem fut, a `szemelyFuzzyCount` mindig 0, a „👤 Lazább egyezés" badge sosem renderelődik. **Megjegyzés:** P2-1/P2-7 javaslata szerint érdemes inkább **bekötni** valódi fuzzy-jelöltként, nem törölni. |
| H-2 | `nameMatchLevel()` + `NameMatchLevel` típus | `jaro-winkler.ts:113-118` | Sehol nem importált; a 0.92/0.88 küszöb-logika sosem fut a párosításban. |
| H-3 | Teljes `finance-import/types.ts` modul (`FinanceImportSourceType`, `FinanceWizardStage`, `FinanceWizardMode`) | `components/finance/finance-import/types.ts` | A régi, elvetett 9-lépéses wizard szkeletonja; a tényleges wizard saját lokális `WizardStage`-et használ (`penzugy-import-wizard.tsx:45`). Csak egy Fázis-1 tervdoc hivatkozza. |
| H-4 | `normalizeNameForMatch` re-export | `cross-source-matcher.ts:25` (+ a `:23` import is) | Senki nem importálja innen, a fájl maga sem használja (csak `nameSimilarity`-t hív). |

### 7.2 Halott munka (write-only) — egyszerűsítendő

| # | Tétel | Hivatkozás | Bizonyíték |
|---|---|---|---|
| H-5 | `buildAllPersonsLookupMap` `byName`/`byCnp` feltöltése | `lookup-resolver.ts:393-401` | Mindhárom finance-hívó a `lookupPersonByQuadAttempt`-ot használja, ami SOSEM olvassa ezeket. A `byName`/`byCnp` egyetlen olvasója a `resolvePerson` (anyakönyvi út, a privát `buildPersonLookupMap`-ből). → A `.set(...)` hívások elhagyhatók (a mezőt magát ne töröld). Mellékhatás-tény: a Kassza-import CNP-re eleve nem tud párosítani (a donor-stringben nincs CNP). |

### 7.3 Tisztítandó export / import

| # | Tétel | Hivatkozás | Teendő |
|---|---|---|---|
| H-6 | `altDecimalForm` felesleges `export` | `budget-code-resolver.ts:282` | Modul-priváttá tétel (csak fájlon belül használt). |
| H-7 | Nem használt típus-importok | `finance-import-actions.ts:36` (`type KasszaRowKind`); `egyhfenntartas-import-actions.ts:25,29` (`type XlsxEgyhfRow`/`XmlBevetelekRow`) | Import-takarítás (lint-szint). |

### 7.4 Elavult komment + 1 lehetséges rejtett bug (nem halott kód)

- `finance-import-actions.ts:11` — „az `executeFinanceImport` a Fázis 6-ban kerül implementálásra", pedig már implementálva van ugyanitt (`:710`).
- **Belső-mozgás 300-as kód inkonzisztencia:** a `budget-code-resolver` kommentje említi a `300`-at, de a `splitKasszaRow` belső-kód-felismerője csak `^4\d{2}` és `^301`-et néz — a `300`-at nem. A kanonikus belső-mozgás kódkészlet szerint a `300.01` érvényes belső-mozgás → a classifier valószínűleg hiányos. **Külön kivizsgálandó** (lehet adat-besorolási hiba).

### 7.5 Duplikált logika (nem halott, de a gyengébb fut)

Két auto-elosztó él párhuzamosan:
- **primitív** round-robin `distributeEgyhfCandidates` (`egyhfenntartas-import-actions.ts:678`, `candidates[i]`, cím/név-pontozás nélkül) — ezt használja az **egyházfenntartás-ág** (lásd P2-3);
- **kifinomult** `distributeAmbiguousDonors` (`donor-distribution.ts:115`, score + cím-őr + „1×/év" Hungarian-algoritmus) — ezt csak a Kassza-ág használja, az adomány-ág NEM (lásd P2-9).

A jó implementáció már létezik → az egyházfenntartás- és adomány-ágat erre kell átállítani (egyszerre bug-fix és dedup).

### 7.6 Dead-code összegzés

- **Biztos-halott:** 4 csoport (H-1…H-4) — ebből H-1 inkább *bekötendő*, mint törlendő.
- **Halott munka:** 1 (H-5).
- **Tisztítandó:** 2 (H-6, H-7).
- **Komment/rejtett bug:** H-7.4 (a 300-as kód külön vizsgálandó).
- **Missing-feature:** valódi félkész feature nincs; a `'fuzzy-name'` a régi Levenshtein-megközelítés maradványa.

---

## 8. Szerződés (bérleti) ↔ személy párosítás — diagnózis (2026-06-19)

A felhasználó „szerződések párosítása" panaszára, a választott **„Előbb diagnózis"** alapján.

### 8.1 Hogyan kötődik most szerződés a személyhez
- A `berleti_szerzodes` rekordnak van **`id_szemely` FK**-ja ÉS egy **`berlo_nev` szabad szöveges** mezője.
- **Szerződés-IMPORT NINCS.** A bérjövedelem (104.04/104.05) az importálóban sima befizetésként kerül be; a `berleti_szerzodes` táblát az import **sosem írja**. Szerződést csak kézzel lehet rögzíteni (`RentalContractDialog`).
- A hátralék-számítás (`packages/ui-app/src/finance/rental-calculation.ts`) **futásidőben** köti a befizetéseket a szerződéshez, **duális** párosítással: `befizetes.id_szemely === contract.id_szemely` **VAGY** `befizetes.forrasa (trim/lower) === contract.berlo_nev (trim/lower)`.

### 8.2 Megerősített hiba — dupla-számítás
- Ha egy befizetés **mindkét** feltételnek megfelel (azonos személy ÉS egyező név), a `fizett` összegbe **kétszer** számolódik ([rental-calculation.ts:163-174](packages/ui-app/src/finance/rental-calculation.ts:163)). → a hátralék (`hatralek = elvárt − fizetett`) **alulbecsült** (a bérlő kevésbé tűnik tartozónak, akár 0, pedig tartozik).
- Ez **dokumentált, szándékosan megtartott** Vanilla-JS viselkedés (a fájl 8-16. sori kommentje jelzi), a historikus számok konzisztenciája miatt.
- Hatókör: a **Bérlet/Tartozás nézet** (RentalTab/DebtTab) megjelenített számai — **nem** az import.

### 8.3 Javaslat
- **Helyes logika:** elsődleges az `id_szemely` egyezés; a `berlo_nev` csak **fallback**, ha a befizetésnek nincs `id_szemely`-je (vagy a szerződésnek nincs). Így egy befizetés legfeljebb **egyszer** számít. Konkrétan a `calculateRentalDebts` belső ciklusában a két forrás összeadása helyett: ha a befizetésnek van id_szemely-je → csak az id_szemely-ág számítson; különben a név-ág.
- **FIGYELEM:** ez **megváltoztatja** a megjelenített hátralék-számokat ott, ahol eddig dupla-számítás volt (a hátralék **nőni fog** — pontosabb lesz). Éles váltás előtt érdemes egy **régi vs. új** összevetést mutatni és jóváhagyatni.
- **Külön, terméki kérdés:** kell-e valódi **szerződés-import** (a 104.04/104.05 sorokból `berleti_szerzodes` létrehozása valódi `id_szemely`-vel)? Ez nagyobb funkció; a fenti dupla-szám fix attól függetlenül is hasznos és önállóan szállítható.

---

## 9. Empirikus eredmények — a diagnosztikai SQL-ek lefutása (2026-06-19, user)

A „ne találgass, igazold az adatból" elv mentén; két tervezett fejlesztés ezáltal **elvetésre került** mint felesleges/kockázatos.

- **Asszonynevek (spouse-bridge, P1-4) → ELVETVE.** 183 háztartásbeli nőből **125 (~68%) a férj családnevén** szerepel → a gyakori eset a mostani párosítással már megtalálható (férj-családnév + keresztnév); a maradékot a lánykori-fallback + a fuzzy réteg fedi. A spouse-bridge megépítése kis haszon, felesleges kockázat.
- **Import-duplikátumok (idempotens UNIQUE index) → NEM AJÁNLOTT.** **0 ütközés** mindkét kulcson → az app-szintű, immár személy-tudatos dedup egészséges, az idempotencia gyakorlatilag megvan. Egy DB-szintű UNIQUE index marginális haszonért kockázatot vinne (adomány azonos-kulcs/eltérő-`forrasa`, ill. kézi rögzítés téves blokkolása). Marad az app-szintű védelem.
- **300-as belső-mozgás kód → A JAVÍTÁS IGAZOLT (marad).** A `300.01` (`befizetescel` „Készpénzfelvétel ATM-ből vagy banki számláról a kasszába") **`belsotetel = "300.01"`** — azaz a mérvadó oszlop szerint belső mozgás (Bank→Kassza). A `splitKasszaRow` 30[01]-javítása (commit `eda5237a`) helyes. A prefix-heurisztika (`30[01]` + `4xx`) jelenleg LEFEDI mind az 5 kanonikus belső kódot (300.01/301.01/400.01/401.01/402.02). Opcionális robusztusság: a `belsotetel`-alapú felismerésre váltás (prefix helyett) jövőbeli kódokra is automatikus lenne.

---

## 10. Excel-elemzés — bérjövedelmek a 2025-ös valós könyvelésben (Adatok_2025.xlsx)

A bérlet-fix megalapozásához (user kérésére, adatból):

- **2025 bérjövedelem (104.05 „Területek bérjövedelme"): 23 709 RON** = **15 250 kassza** (5 befizetés) + **8 459 bank A** (1 befizetés). A 104.04 („Épületek bérjövedelme") 2025-ben **0**.
- **Kassza-befizetők — „Név - Cím" formátum** (személy-azonosítható, a donor-parser kezeli): Bitai József - Híd 37 (1000), Csorja Albert - Iskola 203 (3750), Kádár Zoltán - Templom 235 (5250), Csorja József - Vasút 154 (750), Bedő János - Híd 47 (4500).
- **Bank-befizető — nagybetűs név, CÍM NÉLKÜL**: „MARK LASZLO" (8459), banki kivonatból (`Extr`), megjegyzés „Arenda … teren agricol 2025".

**Következtetés a dupla-számításra:** a duális párosítás dupla-számítása csak akkor üt be, ha a `forrasa` **pontosan** egyenlő a szerződés `berlo_nev`-jével ÉS a befizetésnek van a szerződéssel egyező `id_szemely`-je. Mivel a kassza-`forrasa` **címet is tartalmaz** („… - Híd 37"), egy cím nélküli `berlo_nev`-vel **nem fog pontosan egyezni** → a dupla-számítás a gyakorlatban valószínűleg **ritka**. A nagyobb kockázat fordított: a címes `forrasa` a **név-ágat is elronthatja** (alulpárosítás → hátralék túlbecsülve), ha a befizetésnek nincs `id_szemely`-je. A pontos képet a `2026-06-19-diag-berleti-dupla-szamitas.sql` adja a DB- adaton (szerződések `berlo_nev`/`id_szemely` formátuma + a tényleges dupla-/alul-párosítás).

**Empirikus eredmény (2026-06-19):** `szerzodes_db = 0` — **nincs egyetlen bérleti szerződés sem** a rendszerben → a dupla-számítás jelenleg NEM fordulhat elő. A user víziója: az importált könyvelésből a Bérleti fülön látszik majd, ki fizetett (104.04/104.05), és ahhoz lehet szerződést rendelni. A dupla-szám fix akkor lesz aktuális, ha lesznek szerződések.

---

## 11. Egyházfenntartás (101.01) duplikáció-elemzés a 2025-ös valós adaton (Adatok_2025.xlsx)

A user kulcs-aggálya: ne fizessen valaki „2×/3×" míg egy azonos nevű „elmaradottnak" látszik. A 358 db 101.01 sor (47 015 RON) elemzése:

- **Minden befizető „Név - Cím" formátumú** (0 cím nélküli). 127 férjes („…né"), 49 prefixes (Özv./Elv./id./ifj.). 324 egyedi név-kulcs / 358 sor.

**A duplikáció KÉT, eltérő esete:**

1. **Azonos név, ELTÉRŐ cím — 7 eset = két KÜLÖN ember.** Pl. „Beder Győző" (Főút 27 / Főút 144), „Bitai József" (Híd 37 / Híd 36), „Nagy Csaba" (Egészségügy sétány 8/18 / Főút 35), „Joós Albert", „Beder Attila", „Bitai Lázár", „Márk László". → A cím a megkülönböztető; a párosítónak a befizetés címéhez tartozó személyt kell választania. Veszély, ha a tagnyilvántartásban csak az egyik cím szerepel.

2. **RÉSZLETFIZETÉS — az egyházfenntartás NEM „1×/év".** Ugyanaz a személy többször fizet:
   - „Kádár Barna Zsolt" (Vasút 183): **5 tétel** egy nyugtán (85+100+100+130+130 = 545)
   - „Ferenc Csilla Timea" (Sport 21): **4 tétel** egy nyugtán
   - „Beder Árpád" (Főút 85): 2 tétel két külön nyugtán (20, 321)
   → A jelenlegi **`distributeEgyhfCandidates` „1×/év" round-robin HIBÁS**: a több tételt külön emberekhez osztaná → ez maga a user által rettegett mis-assignment. **Javítandó:** azonos „Név - Cím" → EGY személy, a tételek ÖSSZEADÓDNAK (nem szétosztva).

**ÚJ, KRITIKUS dedup-hiba (a P1-5 is érinti):** több azonos line-item egy nyugtán (pl. „Beder Huba" 150/a: 130 + 130, mindkettő nyugta 122; nyugta 122-n Beder Huba+Ottilia+Hubáné Ibolya is 2×130) → a soronkénti dup-check (cong, év, iratszam, összeg, cél, **id_szemely**) a MÁSODIK azonos tételt **duplikátumként eldobja még az ELSŐ importkor is** (mert az 1. beszúrás után a 2.-ra már talál egyezést) → **adatvesztés**. A javítás: a dedup a CSAK importkor-előtti DB-állapothoz hasonlítson (snapshot: meglévő N vs. fájl M → max(0, M−N) beszúrás), ne növekményesen — így a batch-en belüli jogos ismétlődések megmaradnak, de a fájl újra-importja idempotens.

**Tagnyilvántartás-oldal:** a `2026-06-19-diag-azonos-nevu-szemelyek.sql` méri fel, hány azonos-nevű személy van és feloldja-e a cím (A/B/C lekérdezés) — a robusztus párosítás-terv ettől függ.

---

## 12. XML-megerősítés (bevételek 2025.xml) + javítás (2026-06-19)

A `bevételek 2025.xml` „Befizetett év" (col 11) + „Megjegyzés" (col 12) mezője **egyértelműen** megválaszolta a többszörös-fizetés kérdést:

- **A többszörös fizetés = TÖBB ÉVRE szóló HÁTRALÉK, nem egy évi részlet.** Pl. Kádár Barna Zsolt 5 tétele: 2021→85, 2022→100, 2023→100, 2024→130, 2025→130 (megjegyzés „2021 -évre" … egy nyugtán). „Befizetett év" eloszlás: 2021:2, 2022:2, 2023:2, 2024:25, 2025:328, 2026:2.
- **A helyes modell: minden tétel = (személy, BEFIZETETT ÉV, összeg). Egy személy ÉVENTE egyszer fizet.**

**Korrekció a 11. szakasz dedup-aggályához:** a korábbi „adatvesztés" riadó **téves volt**. A dedup-kulcs tartalmazza a `fizetettev`-et ÉS az `iratszam`-ot, így pl. Beder Huba 2024-es és 2025-ös 130 RON-ja **külön kulcs → mindkettő megmarad**. Csak a tényleg azonos (azonos iratszám+év+összeg+személy, pl. Perdi Miklós nyugta 191) esik ki — az valódi duplikátum. → A dedup HELYES, nem kell snapshot-átírás.

**JAVÍTÁS (elvégezve):** a `distributeEgyhfCandidates` **vak round-robin auto-elosztás eltávolítva**. Az arrears-modell miatt a több tétel ugyanannak a személynek a különböző évei → nem szabad emberek közt szétosztani. A genuin bizonytalan (azonos név+cím, pl. **apa-fia** — a user megerősítette, hogy előfordul) eseteket a rendszer **NEM tippeli**, hanem a párosító UI-ban kézi döntésre teszi. Ez közvetlenül megszünteti a „más fizet, más látszik elmaradottnak" hibát. (A `suggestedSzemelyId`/`autoDistributed` holt mezők + UI eltávolítva.)

**Apa-fia (azonos név+cím):** a fizetési adatban nincs megkülönböztető (se szül.dátum, se mindig id./ifj.) → kötelezően kézi. A jövőbeli per-éves review (tartozás-nézet) itt segíthet: ha a tag már fizetett az adott évre, a másik azonos nevűhez javasolja a rendszer.

---

## 13. TELJES per-számadásicél elemzés (Adatok_2025.xlsx, minden kategória)

A user kérésére nem csak az egyházfenntartás, hanem MINDEN számadási cél elemezve. Lapok: Monetar, Kassza, Kasszakonyv, A–F (bank), Hibak, Szamadas, Koltsegvetes. A `Szamadas` lap a kanonikus per-kategória összesítő.

**Kassza/bank oszlopok** (sor4 fejléc): [4]Iratszám · [5]Irattip · [6]Név · **[7]Bev.Összeg / [8]Bev.cél** · **[9]Kiad.Összeg / [10]Kiad.cél** · [11]Megjegyzés · [13]kód.

### Bevételek (1xx) — 2025 tény, személy-köthetőség
| Kód | Cél | db | Összeg | Személy-köthető („Név - Cím") |
|---|---|---|---|---|
| 101.01 | Egyházfenntartói járulék | 358 | 47 015 | **358/358 (100%)** |
| 101.03 | Perselypénz | 7 | 21 444 | kollektív → **NEM** |
| 101.04 | Adományok hívektől | 104 | 19 012 | **69/104 (66%)** — 35 cég/anonim |
| 101.06 | Sírhely | 1 | 600 | igen |
| 102.06 | Legátum | 1 | 50 | igen |
| 103.02 | Pályázat | 2 | 13 000 | NEM (JUDETUL COVASNA intézmény) |
| 103.06 | Iratterjesztés | 1 | 1 193 | igen |
| 103.08 | Számlavisszatérítés | 1 | 1 983 | igen |
| 103.09 | Szponzor / adó 3,5% | 5 | 57 173 | NEM (KIACOM SRL cégek) |
| 104.05 | Területek bérjövedelme | 6 | 23 709 | 5 kassza (Név-Cím) + 1 bank („MARK LASZLO") |

### Kiadások (2xx) — a partner CÉG/intézmény vagy segélyezett
201.01 fizetés (37 404), 201.02 közköltség (37 519), 201.08 irodaszer, 201.09, 201.10, 201.13 **karbantartás (138 125)**, 202.01/202.08 (segély: „Szász Alpár"), 203.x, 205.x. → A partnerek nagyrészt **cégek** (SRL/SA) vagy intézmények; néhány segélyezett magánszemély. **Tag-párosítás NEM kell** — a partner szöveges `forrasa`/`atvevo` mezőbe kerül (opcionális személy-link a segélynél).

### Belső mozgás (3xx/4xx)
300.01 / 301.01 / 400.01 / 401.01 — kassza↔bank átvezetés (≈87 855 RON). A `szamadasicel.belsotetel` jelöli. → **Se bevétel/kiadás, se személy-párosítás.**

### XML (bevételek 2025.xml) lefedettsége
Csak bevétel, de pontos „Befizetett év" + hivatalos iratszámmal: Egyházfenntartás (361/47 145), Perselypénz (7/21 444), Adományok (103/18 882), Bérjövedelmek (5/15 250), Visszatérítés, Iratterjesztés, Sírhely, Harangoztatás (1/130), Legátum.

### Az importáló osztályozási szabálya (ebből)
1. **Kód → kategória**: pontos egyezés a `szamadasicel`/`befizetescel`/`kiadascel` táblával (triviális, ~0 hiba).
2. **Oldal**: [7]Bev>0 → befizetes; [9]Kiad>0 → kiadas; `belsotetel`/300-4xx → belső mozgás (kizárva).
3. **Személy-párosítás CSAK a tag-bevétel kategóriákra** (101.01, 101.04, 104.05, 101.06, 102.06, 103.06, 103.08) — a kollektív (101.03) és cég-bevétel (103.02, 103.09) NEM. Kiadásnál partner-szöveg (opcionális link).
4. **XML-enrich** a bevételekre: Befizetett év + hivatalos iratszám (kereszt-egyeztetés Nyugta⇆Iratszám).