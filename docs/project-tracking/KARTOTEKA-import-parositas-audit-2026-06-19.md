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