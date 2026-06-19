# Egységes pénzügyi importáló — architektúra és lépésterv

## 1. Ajánlott architektúra (és miért ez)

**Választás: a 2. terv (Egységes "Pénzügyi Évzárás" wizard) gerince + a 3. terv táblázat-központúsága, DE az 1. terv inkrementális, fázisolt bevezetésével.**

Indoklás. A 2. és 3. terv ugyanazt a végállapotot célozza (egy parse, egy classifier, egy lookup, egy dedup-RPC, egy táblázatos review) — ez illeszkedik a user víziójához és megszünteti a mai legfőbb hibaforrást: a **két különböző írási mechanizmust** (az egyhfenntartás közvetlen `befizetes.insert`-tel a `101.01`-re ír, a Kassza-ág az `import_finance_batch` RPC-n, eltérő dedup-kulccsal). Ez a divergencia tényleg a séma-szintű kockázat. A 3. terv UI-ambíciója (TanStack grid, tömeges műveletek, debt-view) helyes irány, de egyben a legnagyobb rizikó is.

A nyerő stratégia ezért **nem egy "big bang" új ág**, hanem: a 2. terv kanonikus pipeline-ját építjük meg **az 1. terv lépéssorrendjében** — vagyis először a meglévő Hivatalos Kassza ágat tesszük teljessé (bank-lapok + XML-overlay + person-scope + szerkeszthető review), majd amikor ez valós fájlon bizonyított, **erre konszolidáljuk** a másik két ágat. Így minden lépés után működő, tesztelhető rendszer van, és nincs hosszú párhuzamos kód-súly.

**Mit hasznosítunk újra (változatlanul):**
- `lib/import/lookup-resolver.ts` → `buildAllPersonsLookupMap` (351), `lookupPersonByQuadAttempt` (526) — a személy-mag, mindhárom ág már ezt hívja.
- `helpers/kassza-row-classifier.ts` → `splitKasszaRow` (73) — már felismeri a `/^4\d{2}/`, `/^30[01]/`, `Transfer conturi` bank-oldali belső-mozgást.
- `egyhfenntartas/helpers/cross-source-matcher.ts` → `matchSources` (119), `evaluatePair` (66) — kategória-agnosztikus, közvetlenül használható minden bevétel-kategóriára.
- `egyhfenntartas/helpers/books-reconciler.ts` → `reconcileWithBooks` (77) — kategória-agnosztikus, csak a cel-id paraméter.
- `shared/manual-tag-search.tsx` — RLS-scoped kézi tag-kereső, már a 2 másik ágban bevált.
- `import_finance_batch` RPC v3 — idempotens dedup, a `FinanceImportItem` (`finance-import-types.ts:164`) már tartalmazza a `fizetettev`/`iratszam`/`nyugta`/`bankszamlaId` mezőket.
- `helpers/donor-string-parser.ts` + `company-detector.ts`, `helpers/donor-distribution.ts`.

**Mit bővítünk:**
- `helpers/kassza-sheet-parser.ts` → `applyKasszaFix`/`reparseKasszaSheet` lapnévre paraméterezve (Kassza + A–F).
- `helpers/budget-code-resolver.ts` → a SELECT bővítése (`iscel`, `type`, `belsotetel`, **és új** `person_scope`), valamint a `congregation_id`-szűrő pótlása.
- `helpers/item-builder.ts` → `fizetettev` az XML-overlay-ből, `iratszam` a hivatalos 5-jegyűből, person-scope gate, valódi bank-oldali income/expense (pending hack helyett).
- `steps/review-step.tsx` → szerkeszthető sorok (inline kategória + `ManualTagSearch`).
- `xml-bevetelek-parser.ts` → kategória-szűrő paraméterezése (`categoryKeyword?: string | null`).

**Mit írunk újra/újat:** `lib/import/person-scope-config.ts` (vagy DB-oszlop), `lib/import/bank-sheet-map.ts`, `helpers/xml-overlay.ts`, egy `overlayXmlReference` action — és FÁZIS 2-ben a `unified/` mappa, ha a konszolidáció megéri.

---

## 2. Hogyan kezeli a teljes könyvelést

**Lapok (Kassza + A–F bank):** egyetlen általánosító réteg a `kassza-sheet-parser.ts`-ben. Új `FINANCE_SHEET_NAMES = ['kassza','a','b','c','d','e','f']`; az `applyKasszaFix` végigiterál rajtuk, mindegyikre a már laptetszőleges `reparseKasszaSheet(sheetName)` fut. A fejléc-detektor (`isKasszaHeaderRow`, `>=3` kulcsszó: Dátum/Iratszám/Bev/Kiad) változatlan — a Kassza és bank-lapok oszlopstruktúrája azonos (sor4 fejléc). A `kasszaRowToRecord` (`finance-import-actions.ts:144`) alias-térképe kiegészül a `[12]Magyarázat(RO)` és `[13]kód` aliasokkal (bank-lapokon ezek hordozzák a magyarázatot és a kódot).

**Osztályozás:** `splitKasszaRow` VÁLTOZATLAN. A bevétel/kiadás/belső-mozgás-be/-ki/skip logika kód-prefix + szövegminta alapon a bank-lapokon is helyesen működik. Minden `ClassifiedKasszaRow` kap egy `sheetName` és `bankszamlaId` mezőt (`finance-import-types.ts` bővítés).

**Bank-számla leképezés:** új `lib/import/bank-sheet-map.ts` → `buildBankSheetMap(supabase, congregationId)` a `migration-docs/Bank és kassza kapcsolati kódok.txt` alapján lapbetű→`bankszamlak.id`. A bank-oldali tételek `bankszamla_id`-vel mennek be (a `befizetes`/`kiadas` táblának van `bankszamla_id` mezője, az RPC v3 dedup-kulcsa is figyeli).

**Belső mozgás kassza↔bank pár:** mivel most EGY importban látjuk mindkét lapot, a `87855 RON` átvezetés párját össze tudjuk kötni **egyetlen `belso_mozgas_xkey`-vel** (összeg + dátum + irányellentét alapján). Ez kiváltja a jelenlegi "pending-bank-deposit/withdrawal" lebegő hacket (`item-builder.ts:106-166`). **FIGYELEM** — ez a legkockázatosabb új rész (lásd duplázódás-rizikó), ezért az MVP-ben a kassza-oldal pending marad, a párosítást külön, jól izolált lépésben vezetjük be.

**Per-kategória személy-scope** (a fenti adatelemzés alapján):
- **Személy-köthető** (`'Név - Cím'` formátum): `101.01` egyházfenntartás, `101.04` adományok hívektől (66% személy — itt a cég-detektor szűr), `104.05` bérjövedelem, `101.06` sírhely, `102.06` legátum, `103.06` iratterjesztés, `103.08` visszatérítés.
- **NEM személy-köthető:** `101.03` perselypénz (kollektív), `103.02` pályázat (intézmény), `103.09` szponzor/3.5% (cégek), összes bank-transzfer és belső-mozgás.
- **Kiadás (2xx):** partnerek cégek/intézmények → `atvevo` szöveg, NINCS tag-lookup. KIVÉTEL: `202.08` segély (Szász Alpár) → **opcionális** `atvevoid` személy-link.

Megvalósítás: deklaratív `person_scope ∈ {'required','optional','none'}`. Két út — **(A) kód-konstans** (`lib/import/person-scope-config.ts`, gyors, MVP) vagy **(B) DB-oszlop** (`szamadasicel.person_scope`, deklaratív, auditálható). Javaslat: MVP-ben **(A)**, mert nincs Kartotéka MCP és nem akarunk a userre SQL-t hárítani az első körben; FÁZIS 2-ben migráljuk DB-be. A `resolveDonors` (`finance-import-actions.ts:502`) csak `person_scope !== 'none'` kódú income-soron futtatja a lookupot → megszűnik a zaj a perselypénzen/szponzoron.

---

## 3. XML-referencia (bevételek 2025.xml) integrálása

**Feltöltés:** a meglévő `welcome-step.tsx` kap egy **opcionális 2. drag-drop mezőt** (XML). Az xlsx önmagában teljes import marad; az XML csak pontosít.

**Parser általánosítása:** `xml-bevetelek-parser.ts` → `parseXmlBevetelek(rows, opts?: { categoryKeyword?: string | null })`. Ha `categoryKeyword == null` → NEM szűr a hard-kódolt `'egyházfenntart'`-ra (`xml-bevetelek-parser.ts:107`), hanem MINDEN bevétel-sort beolvas. A header-validáció (`col0='Forrása'`, `col1='Célja'`) marad.

**Overlay, nem külön ág:** új `helpers/xml-overlay.ts` → `applyXmlOverlay(incomeRows, xmlRows)`. Belül a meglévő `matchSources`-t (`cross-source-matcher.ts`) hívja: `xlsx.iratszam ⇆ xml.nyugta` + összeg (`|Δ| < 0.01`) + Jaro-Winkler név (`≥ 0.88`) → 3 pont = match. **CSAK income-soron** fut (az XML csak bevételt fed; expense/internal érintetlen). Match esetén a `ClassifiedKasszaRow`-ra rákerül:
- `fizetettevOverride = xml.fizetettev` (a Befizetett év, col 11)
- `iratszamHivatalos = xml.iratszam` (5-jegyű hivatalos, col 8)

**Item-build:** `item-builder.ts:197`-ben a mai `fizetettev = datum.slice(0,4)` lecserélődik:
```
fizetettev = row.fizetettevOverride ?? parseInt(datum.slice(0,4))
iratszam   = row.iratszamHivatalos  ?? row.iratszam
```
Ez oldja meg a **Kádár Barna Zsolt 2021–2025** több-éves hátralékot (ma mind hibásan 2025-re könyvelődik).

**Kereszt-egyeztetés státusz:** az overlay visszaad egy `rowIndex → { fizetettev, iratszam, confidence }` térképet + az `only-xml` (xlsx-ben pár nélküli) sorok listáját, amik a review-ban külön badge-dzsel jelennek meg. A valós adaton 357/359 magától stimmel, 0 bizonytalan.

---

## 4. Táblázatos review (a user víziója)

**MVP (a meglévő `review-step.tsx` szerkeszthetővé tétele):** a mai read-only `ItemRow` (`review-step.tsx:994-1026`) szerkeszthető sorrá válik. Oszlopok: **Lap | Dátum | Iratszám (XML-hivatalos badge, ha van) | Kategória (inline combobox) | Forrás/Partner | Személy (inline `ManualTagSearch`) | Befizetett év (input, XML-előtöltve) | Összeg±**.

- **Kategória felülbírálás:** inline combobox a `budgetCodeResolutions`-ból; ismeretlen kód NEM némán kihagyott (`skippedReasons`), hanem piros chip inline választóval.
- **Személy:** a `ManualTagSearch` bekötése MINDEN `person_scope !== 'none'` income-sorra (ma csak ambiguous donornál, és csak az auto-jelöltekből — `review-step.tsx:418-426`). Így resolved/not-found/company donor személye is kézzel állítható.
- **Csoportosítás-kapcsoló:** Kategória / Hónap (`ItemsByMonth` újrahasznosítva) / Lap / Személy szerint.
- **3 review-eset:** (1) `auto-ok` zöld chip; (2) `bizonytalan` (ambiguous donor v. uncertain XML) sárga chip → `ManualTagSearch`; (3) `hiányzó/unknown kód` piros chip → kötelező felhasználói rendezés a `canImport` gate-hez (`review-step.tsx:206-208`).
- **Több-éves támogatás:** az év-eltérés-őr (`review-step.tsx:186-200`) NE blokkoljon — az XML-overlay-zett soroknál (szándékosan más év) kikapcsoljuk, máshol figyelmeztetés marad.

**Fejléc-panelek (validátorok):** `MonetarPanel` (kassza-egyenleg, megvan) + `reconcileWithBooks` panel (már-könyvelt tételek) + **új Szamadas-validátor** (per-kategória import-összeg vs. a Szamadas lap `[6]tény`/`[25]kassza`/`[26+]bankok`). Bármelyik eltérés piros chip az "Importálom" előtt.

**Per-éves tartozás-nézet:** külön, leválasztható szelet (PR-ben az utolsó). A `befizetes.fizetettev` már tárolt → új SQL-view/RPC (`szemely × fizetettev` a `person_scope='required'` kategóriákra, hiányzó évek) köthető a választói névjegyzékhez. Az import idempotenciája miatt a visszamenőleges (több-éves) feltöltés erre épülhet.

---

## 5. Minimális hibapont — hogyan garantáljuk

- **Kategória:** determinisztikus `resolveBudgetCode` (magyar tizedesvessző `,`→`.`, `201.1==201.10` `altDecimalForm` tűrés). Unknown kód kötelező kézi rendezés import ELŐTT (gate). A bank-lapokon ugyanaz a kód-térkép. **Pótlandó:** a `congregation_id`-szűrő (`budget-code-resolver.ts:132` ma `void congregationId`) — több-gyülekezetes adatnál rossz cel-ID rizikó.
- **Személy:** soha vak tipp. A robusztus `lookupPersonByQuadAttempt` (quad/triple/maiden/keresztnév + utca-normalizálás + becenév-szótár + fuzzy) CSAK `person_scope !== 'none'` kódon fut. Ambiguous/not-found/company → `szemelyId = null`, kézi `ManualTagSearch` fallback. A cég-detektor + per-kategória scope együtt szűri a `101.04` 35 cég/anonim donorát.
- **Év:** XML `Befizetett év` overlay (`fizetettevOverride ?? datum-év`), kereszt-egyeztetve (iratszám=nyugta + összeg + Jaro-Winkler ≥0.88). XML-pár hiányában a felhasználó az inline év-mezőben javít.
- **Dedup (idempotens, visszamenőleges):** `import_finance_batch` RPC v3 természetes-kulcsa MÁR tartalmazza a `fizetettev`-et és `bankszamla_id`-t (bevétel: `cong+datum+osszeg+id_befizetescel+iratszam+forrasa+bankszamla_id`). A hivatalos 5-jegyű iratszám stabilizálja a kulcsot → a több-éves visszamenőleges újraimport nem duplikál. **Ellenőrizni kell**, hogy a hivatalos iratszám ténylegesen átmegy a `p_items`-ben.
- **Kereszt-ellenőrzés:** (a) xlsx⇆xml `matchSources`; (b) `reconcileWithBooks` a már-könyvelt befizetésekkel; (c) Szamadas-lap per-kategória összeg-validátor; (d) Monetar kassza-egyenleg. Mind a review fejlécében, élő chip-ként.
- **Bank belső-mozgás duplázódás:** a kassza- és bank-oldal KÖZÖS `belso_mozgas_xkey`-vel megy, a dedup figyeli. Amíg a párosítás nem bizonyított valós fájlon, az MVP-ben pending marad (nem szúrjuk be mindkét oldalt automatikusan).

---

## 6. KONKRÉT LÉPÉSTERV (sorrendezve, fájl-szinten)

### FÁZIS 0 — Előkészítés / scope-konfig (kockázat: alacsony)
1. **ÚJ** `apps/web/lib/import/person-scope-config.ts`: `PERSON_SCOPE: Map<string,'required'|'optional'|'none'>` a 7 linkable kóddal (`101.01`,`101.04`,`104.05`,`101.06`,`102.06`,`103.06`,`103.08` = `optional`/`required`) + `202.08` = `optional` (segély). `shouldResolvePerson(kodNorm): boolean`, `personRequirement(kodNorm)`. *Teszt: unit-teszt a 8 kódra + egy nem-scope kódra.*
2. `helpers/budget-code-resolver.ts`: a 3 SELECT bővítése — `szamadasicel`: `+ iscel, type, belsotetel` (`:74`); a `congregation_id`-szűrő pótlása (`:132`, OR-szűrő a system-szintű/NULL sorokra). *Kockázat: a per-gyülekezeti cel-ek ma system-szintűek — visszafelé kompatibilis OR-szűrő kell.* *Teszt: a meglévő Kassza-import lefuttatása valós fájlon, hogy a cel-ID-k nem változnak.*

### FÁZIS 1 — XML-overlay (a legnagyobb érték, legkisebb rizikó) — **MVP első szelet**
3. `egyhfenntartas/helpers/xml-bevetelek-parser.ts`: `parseXmlBevetelek(rows, opts?: {categoryKeyword?: string|null})` — `null` esetén nincs cél-szűrés (`:107`).
4. **ÚJ** `helpers/xml-overlay.ts`: `applyXmlOverlay(incomeRows, xmlRows)` a `matchSources` hívásával; visszaad `rowIndex → {fizetettev, iratszamHivatalos, confidence}` + `onlyXml[]`.
5. `finance-import-types.ts`: `ClassifiedKasszaRow` bővítése `sheetName?`, `bankszamlaId?`, `fizetettevOverride?`, `iratszamHivatalos?` mezőkkel (a `FinanceImportItem` változatlan).
6. **ÚJ** action `finance-import-actions.ts` → `overlayXmlReference(formData)`: a 2. (XML) fájl parse + overlay, eredmény vissza.
7. `helpers/item-builder.ts`: `fizetettev = row.fizetettevOverride ?? parseInt(datum.slice(0,4))` (`:197`); `iratszam = row.iratszamHivatalos ?? row.iratszam`; `szemelyId` csak `shouldResolvePerson(budget.normalizedKod)` esetén.
8. `finance-import-actions.ts` → `resolveDonors` (`:502`): a donor-kigyűjtés `shouldResolvePerson`-nal szűr. *Teszt: a valós Adatok_2025.xlsx + bevételek 2025.xml — ellenőrizni, hogy Kádár Barna Zsolt 5 tétele 2021–2025-re kerül, és a 357/359 egyezés megvan.*

### FÁZIS 2 — Szerkeszthető review (a user víziójának magja)
9. `steps/welcome-step.tsx`: opcionális 2. XML drag-drop mező.
10. `steps/review-step.tsx`: `ItemRow` szerkeszthetővé tétele — inline kategória-combobox + `ManualTagSearch` minden scope-os income-soron; új oszlopok (kategória-NÉV, Befizetett év); év-eltérés-őr kikapcsolása XML-overlay-zett soroknál; csoportosítás-kapcsoló. *Kockázat: állapotkezelés sok soron — virtualizáció ha lassú.* *Teszt: kézi kattintós review valós fájlon.*
11. `reconcileWithBooks` panel + **ÚJ** Szamadas-validátor bekötése a review fejlécbe.

### FÁZIS 3 — Bank-lapok (A–F)
12. `helpers/kassza-sheet-parser.ts`: `applyKasszaFix` → iterál `FINANCE_SHEET_NAMES` felett; `FINANCE_SHEET_NAMES` + `isFinanceSheetName` export.
13. **ÚJ** `lib/import/bank-sheet-map.ts`: `buildBankSheetMap(supabase, congregationId)`.
14. `finance-import-actions.ts`: `kasszaRowToRecord` `[12]`/`[13]` aliasok; `analyzeKasszaSheet → analyzeFinanceSheet(sheet, sheetName, bankMap)`; a 3 action minden lapot dolgoz fel (Kassza-only helyett). `item-builder` bank-soroknál `bankszamlaId` átadása. *Teszt: bank-lap per-számla összeg vs. Szamadas `[26+]` oszlop.*
15. **(kockázatos, izolált)** belső-mozgás kassza↔bank pár közös `belso_mozgas_xkey`-vel; a pending hack kivezetése. *Teszt: a 87855 RON átvezetés egyszer könyvelődik, dedup újrafuttatáskor.*

### FÁZIS 4 — Konszolidáció + tartozás-nézet (későbbi)
16. Az `egyhfenntartas` és `general` ág átállítása az egységes pipeline-ra; `import_finance_batch` RPC az egyetlen írási út (a közvetlen `befizetes.insert` kivezetése). `finance-import-tabs.tsx` (`:45-60`): az `egyhfenntartas-wizard` bekötése vagy a 3 ág egyesítése.
17. RPC dedup-kulcs ellenőrzése/v4: hivatalos iratszám + `fizetettev` a kulcsban (a kiadás-oldalt is).
18. `person-scope-config.ts` → DB-migráció (`szamadasicel.person_scope`), ha a deklaratív kód-konstans karbantartása már teher.
19. **ÚJ** per-éves tartozás-nézet: SQL-view (`szemely × fizetettev`) + UI a választói névjegyzéken.

**MVP-vágás:** FÁZIS 0 + 1 + 2 → ez már teljes értékű (XML-pontosított, szerkeszthető, per-kategória scope-os Kassza-import), valós fájlon azonnal tesztelhető, és nem nyúl a bank-lapokhoz/RPC-séma-hoz. FÁZIS 3–4 ráépíthető.

---

## 7. Nyitott kérdések

1. **Bank-lap fejléc:** tényleg azonos-e az A–F lapok oszlopstruktúrája a Kassza-lapéval (sor4, `[3]Dátum…[13]kód`)? Egy mintasor mindegyik bank-lapról igazolná.
2. **Bank-számla leképezés:** a `Bank és kassza kapcsolati kódok.txt` tartalmaz-e egyértelmű lapbetű(A–F)→`bankszamlak.id` hozzárendelést, vagy számlaszám-alapú a kötés?
3. **Person-scope tárolás:** kód-konstans (gyors, MVP) vagy DB-oszlop (deklaratív, de SQL a userre)? Javaslat: konstans MVP-re, DB FÁZIS 4-ben.
4. **`101.04` 66%:** a 35 cég/anonim donornál elég-e a cég-detektor, vagy kell egy explicit "nem személy" jelölő a review-ban?
5. **`202.08` segély `atvevoid`:** kérünk-e ténylegesen opcionális személy-linket a kiadás-oldalon, vagy elég az `atvevo` szöveg?
6. **Belső-mozgás pár:** vállaljuk-e már az MVP-ben a kassza↔bank automatikus párosítást (87855 RON duplázódás-rizikó), vagy maradjon pending FÁZIS 3-ig?
7. **Stateless parse:** a mai action-enkénti újraparse-ot mérsékeljük-e szerver-oldali rövid TTL cache-sel, vagy a kliens hordozza a normalizált sorokat (nagyobb payload)? A bank-lapokkal a probléma súlyosbodik.

---

**Releváns fájlok (abszolút utak):**
- `C:\Users\endre\Documents\APPS\Egyházi APP\KARTOTEKA\apps\web\components\finance\finance-import\helpers\budget-code-resolver.ts`
- `...\apps\web\components\finance\finance-import\helpers\item-builder.ts`
- `...\apps\web\components\finance\finance-import\helpers\kassza-sheet-parser.ts`
- `...\apps\web\components\finance\finance-import\helpers\kassza-row-classifier.ts`
- `...\apps\web\components\finance\finance-import\steps\review-step.tsx`
- `...\apps\web\components\finance\finance-import\steps\welcome-step.tsx`
- `...\apps\web\components\finance\finance-import\egyhfenntartas\helpers\xml-bevetelek-parser.ts`
- `...\apps\web\components\finance\finance-import\egyhfenntartas\helpers\cross-source-matcher.ts`
- `...\apps\web\components\finance\finance-import\egyhfenntartas\helpers\books-reconciler.ts`
- `...\apps\web\components\finance\finance-import\shared\manual-tag-search.tsx`
- `...\apps\web\components\finance\finance-import\finance-import-tabs.tsx`
- `...\apps\web\lib\import\lookup-resolver.ts`
- ÚJ: `...\apps\web\lib\import\person-scope-config.ts`, `...\apps\web\lib\import\bank-sheet-map.ts`, `...\apps\web\components\finance\finance-import\helpers\xml-overlay.ts`
- A finance-import-actions.ts a `penzugy` route alatt él (a `finance-import-tabs.tsx`-ből hivatkozva); a `migration-docs\sql\2026-06-09-finance-import-rpc-v3-dedup.sql` az RPC v3 forrása.