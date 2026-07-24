# KARTOTÉKA — Tagnyilvántartás finomhangolás: átfogó terv (2026-07-17)

**Státusz:** JÓVÁHAGYVA (2026-07-17, D1–D10 döntésekkel — lásd 10. fejezet) — végrehajtás alatt, PR-1-től. Az A2 diagnosztika élesben BIZONYÍTOTTA az F1 P0-t (`column s.elkoltozott does not exist`).
**Módszer:** 10 párhuzamos audit-ágens (read-only) a 8 felhasználói pontra + desktop-paritás + előzmény-dokumentumok. Összesen 125 megállapítás.
**Kapcsolódó diagnosztika:** `migration-docs/sql/2026-07-17-tagnyilvantartas-diagnosztika.sql` — a jelölt lekérdezéseket a user futtatja élesben, az eredmények több tervdöntést véglegesítenek.

---

## 0. Vezetői összefoglaló — a legsúlyosabb találatok

| # | Súly | Mi a baj | Hol |
|---|------|----------|-----|
| 1 | **P0** | A `recompute_voter_eligibility` RPC a nem létező `szemely.elkoltozott` oszlopra hivatkozik → valószínűleg **minden futása hibával elhal**, a választói jogosultság-flag mindenkinél false | `migration-docs/sql/2026-06-10-tagnyilvantartas-fazis5-gdpr-valasztoi.sql:84` |
| 2 | **P0** | A hivatalos nyomtatott választói névjegyzék **kizárólag befizetés-alapon** szűr — konfirmáció, member_status, kézi kizárás (override) nem érvényesül | `voter-print-dialog.tsx:66` |
| 3 | **P0** | Település-hiány gyökéroka: az import-wizard helység-map kulcsa **ékezetes** marad, az RPC **unaccent-tel** keres → magyar településnévnél SOHA nincs találat → `c_helysegid` NULL mindenkinél. Társ-ok: a helység-egyeztetés csak az **első 5 mintasorból** gyűjt. Az adat az utca→locality láncból **helyreállítható**. | `tagnyilvantartas-import-wizard.tsx:454, 399` |
| 4 | **P0** | Család-import: mind a 3 import-út csak a **legacy `csalad`+`gyerek`** táblákba ír, a Családok fül viszont csak a **`haztartas`** modellből olvas → az importált családok **láthatatlanok** | RPC-k + `registry-list-actions.ts:864` |
| 5 | **P0** | A két család-import batch-RPC-n nincs `statement_timeout` felülírás (8s limit) → nagy fájlnál az **egész import visszagörgetődik** | `import_families_from_existing_persons_batch`, `import_family_head_batch` |
| 6 | **P1** | Elköltözés-flow a nem létező `szemely.elkoltozott` oszlopba ír → az UPDATE hibázik, a `member_status='elköltözött'` **sosem áll be** | `tagnyilvantartas/actions.ts:772` |
| 7 | **P1** | xlsx (SheetJS) 0.18.5 — halott npm-csatorna, 2 ismert CVE, soha nem frissül | `apps/web/package.json` |
| 8 | **P1** | A wizard kézi oszlop-átmappolása **sosem jut el a szerverig** — az import az auto-matchre esik vissza | `tagnyilvantartas-import-wizard.tsx:429` |

---

## F0 — Diagnosztika + döntések (előfeltétel)

A user lefuttatja a `2026-07-17-tagnyilvantartas-diagnosztika.sql` szakaszait (A–I), és válaszol a 10. fejezet döntési kérdéseire (D1–D10). A döntő lekérdezések:
- **A1/A2**: bizonyítja-e az élesben az RPC-elhalást (P0-1) és az elköltözés-flow törését (P1-6)
- **C2/C4**: a település-hiány mértéke + hány sor állítható helyre backfill-lel (P0-3)
- **F1**: hány `csalad` rekordnak nincs `haztartas` párja (P0-4 — a láthatatlan családok)

---

## F1 — Választói névjegyzék helyessége (user 1. pont)

### Megállapítások
1. **P0** — RPC fantom-oszlop (`s.elkoltozott IS NOT TRUE`): a `_RUN_LOG` verifikáció csak a függvény LÉTEZÉSÉT nézte, futását nem. Következmény: „Jogosultság frissítése" gomb mindig hibázik, `voter_eligible` mindenkinél false, desktop KPI „—".
2. **P1** — Elköltözés-flow (`actions.ts:772`): `.update({ elkoltozott: true, member_status: 'elköltözött' })` — az egész UPDATE elhasal, a státusz sem áll be → az elköltözött tag „aktív" marad és a névjegyzéken is rajta marad.
3. **P1** — Befizetés-lekérdezés (`voter-actions.ts:56`) divergál a kanonikus Tartozás-logikától: (a) stornózott tételek beszámítanak; (b) családi szintű befizetés (id_szemely NULL, id_csalad kitöltve) senkinek nem íródik jóvá; (c) nincs év-szűrés és lapozás → Supabase 1000-es plafon, 3+ évnyi adatnál MÁR MOST reális néma levágás.
4. **P2** — Életkor évszám-alapú a TS-ben (140. sor), dátum-pontos az SQL-ben → divergens 18+ halmaz.
5. **P2** — „Beküldés egyházmegyének" voterCount = az épp aktív UI-szűrők (keresőmező!) eredménye.
6. **P2** — 4+ különböző „választó"-definíció él egymás mellett (KPI / eligible-flag / áttekintő / nyomtatás / desktop).
7. **P2** — `setVoterOverride` fire-and-forget recompute hibakezelés nélkül.
8. **P3** — Lelkészi jelentés I.11 kézi mező — RPC-javítás után auto-forrássá tehető.

### Terv
- **F1.1** RPC-javító migráció: `s.elkoltozott IS NOT TRUE` → `NOT EXISTS (SELECT 1 FROM elkoltozott e WHERE e.id_szemely = s.id)` + tényleges próbafuttatás a Teszt gyülekezeten. *(S)*
- **F1.2** Elköltözés-flow fix: az `elkoltozott: true` mező törlése az update-ből (a tábla-insert + member_status marad). *(S)*
- **F1.3** Befizetés-lekérdezés kanonizálása: stornó-szűrés + `fizetettev IN (prev, curr)` + családi befizetés jóváírása a Tartozás-oldallal bit-egyező szemantikával (közös helper). *(M)*
- **F1.4** Dátum-pontos kor-helper (közös), az overview `currentVoters` is erre áll át. *(S)*
- **F1.5** Beküldött voterCount kanonikus definícióból + a definíció a snapshotba. *(S)*
- **F1.6** Kanonikus „választó"-definíció egységesítése minden felületen — **D1 döntés után**. *(M)*
- **F1.7** I.11 auto-mezővé tétele (felülírhatóan) — csak F1.1 után. *(S)*

**Érintett fájlok:** `voter-actions.ts`, `tagnyilvantartas/actions.ts`, `voters-tab.tsx`, `lib/members/member-overview.ts`, `lelkeszi-jelentes/types.ts`, új migráció.

---

## F2 — Választói névjegyzék nyomtatása (user 2. pont)

### Megállapítások
1. **P1** — Oldalszám SOHA nem jelenik meg: a lábléc oldalszám-span-je szó szerint **üres**, és egyetlen `.page` div van → a lábléc csak az utolsó oldalon. CSS `counter(page)` Chromiumban element-tartalomban nem működik (bizonyíték: az eszközleltár „0 / 0"-t nyomtat ugyanezzel a mintával).
2. **P1** — Dupla margó: `@page margin 12mm` + `.page padding 12mm` (a print-felülírás a paddingot nem nullázza) → ~24mm margó, „nem A4-re szabott" hatás.
3. **P1** — PDF-út: ~92%-os kicsinyítés + sorok félbevágása laphatáron + a 2. oldaltól nincs táblázat-fejléc.
4. **P2** — Hosszú lista + html2canvas scale:3 → Chromium canvas-limit → csonka/üres PDF kockázat (614 tagos gyülekezetnél reális).
5. **P2** — A nyomtatott lista a jogosultságot (eligible/override) figyelmen kívül hagyja (= F1 P0-2).
6. **P2** — Hiányzó `bealitas.eves_jarulek` évsor → default szűrőkkel 0 fő, magyarázat nélkül.
7. Jó hír: a projektben VAN bizonyítottan működő minta — a **WYSIWYG lapozott séma** (lelkészi jelentés `print.ts` + `official-journal.ts`): `@page margin 0` + lap = `.sheet` div (210×297mm) + laponkénti abszolút oldalszám-div. A kartoteka.css globális print-blokk (pénzügy F2 hibaosztály) itt NEM játszik (izolált dokumentum).

### Terv
- **F2.1** `voter-reporting.ts` átírása a lapozott mintára: determinisztikus sor-chunking `.sheet`-enként, minden lapon ismételt táblázat-fejléc + „Oldal X / Y" lábléc; záró szöveg + aláírások fixen az utolsó lapon. Ez egyszerre javítja a dupla margót, az oldalszám-hiányt, a PDF-törést és a WYSIWYG-egyezést. *(M)*
- **F2.2** `printToPdf`: lapozott bemenetnél margin [0,0] + canvas-limit őr (sheet-enkénti render, ha becsült magasság×scale > ~30 000px). *(M)*
- **F2.3** Jogosultság-metszet a nyomtatásban: default bekapcsolt „Csak választói jogosultak" feltétel (kikapcsolható) — **D2 döntéstől függően**. *(S)*
- **F2.4** Üres-lista magyarázó sáv hiányzó éves beállításnál (YearlySettingsDialog-ra mutatva, a v0.9.75 mintájára). *(S)*
- **F2.5** A chunk/lábléc segédfüggvények közös helyre (`lib/utils/print-pagination.ts`), az eszközleltár „0 / 0" mintája is erre áll át. *(S)*

---

## F3 — Hiányzó település a lakcímben + házhoz irányítás (user 3. pont)

### Megállapítások (a lánc végigvizsgálva: séma → import → megjelenítés → maps)
1. **P0 GYÖKÉROK** — Normalizálás-eltérés: a wizard a helység-map kulcsát `toLowerCase().trim()`-mel képzi (ékezet MARAD), az RPC `normalize_name()`-mel (unaccent) keres → ékezetes településnévnél a lookup mindig üres → `c_helysegid` NULL. Az utca közben feloldódik → **utca+házszám látszik, település nem** — pontosan a jelentett tünet. (A wizard postakód-lépése HELYESEN normalizál — csak a locality-map maradt ki.)
2. **P0 TÁRS-OK** — A helység-egyeztetés csak az első 5 mintasorból gyűjt településneveket (`sampleRows.slice(0,5)`).
3. **P1** — Az RPC-ben nincs fallback: pedig az utca `localityid`-ja ugyanabban a tranzakcióban feloldódik → egy `COALESCE` az egész hibaosztályt hárítaná. **Emiatt az adat helyreállítható backfill-lel.**
4. **P1** — Megjelenítési fallback sincs: `formatAddress`/`joinAddress`/Excel-export/igazolás/BirthdayList mind csak a `c_helysegid`-joint olvassa; a család-lista már bizonyítja, hogy az `adrstreet!c_utcaid(name, adrlocality!localityid(name))` beágyazott join működik.
5. **P1** — Házhoz irányítás: a Google Maps destination település nélkül épül („Templom utca, 12") → a világ bármelyik Templom utcája.
6. **P2** — Latens: `_resolve_or_create_street` NULL-locality esetén az ELSŐ adrlocality-hoz köti az utcát; a generikus batch-import út egyáltalán nem oldja fel az `_utca_text/_helyseg_text` mezőket.

### Terv
- **F3.1** Wizard kulcs-normalizálás javítása: közös `normalizeNameClient` helper (NFD + diakritika-eltávolítás, bit-egyező az SQL `normalize_name`-mel) — a gyökérok-fix. *(S)*
- **F3.2** RPC-hardening migráció: `v_resolved_locality_id := COALESCE(v_resolved_locality_id, (SELECT localityid FROM adrstreet WHERE id = v_street_id))`. *(S)*
- **F3.3** Backfill SQL: `UPDATE szemely SET c_helysegid = adrstreet.localityid WHERE c_helysegid IS NULL AND c_utcaid ismert` — előtte a C4 diagnosztika mondja meg, hány sort érint. *(S)*
- **F3.4** Teljes-sheet helység-scan server action (a registry-importban már van minta: `registry-locality-scan-action.ts`). *(M)*
- **F3.5** Megjelenítési fallback: minden személy-selectben beágyazott utca→locality join + `member.adrlocality?.name ?? member.adrstreet?.adrlocality?.name` koaleszcencia (lista, karton, export, igazolás, születésnap-widget). *(M)*
- **F3.6** Házhoz irányítás query-bővítés: `[település, utca házszám], jud. <megye>, România`. *(S)*
- **F3.7** Generikus batch-út guard: ha a profil `_utca_text/_helyseg_text`-et definiál és a hívó `executeBatchImport`, hangos hiba a néma cím-vesztés helyett. *(S)*

---

## F4 — Automatikus körzetesítés (user 4. pont — ÚJ funkció)

### Jelen állapot
Körzet = `csoport` tábla (`iskorzet=true`); hozzárendelés CSALÁD-szinten (`csalad.id_csoport` + dual-write `haztartas.id_csoport`); presbiter→körzet: `presbiter.id_csoport` (1 presbiter = max 1 körzet a mentési útban). A jelenlegi UI: kézi, családonkénti hozzárendelés kereső nélkül — nagy gyülekezetnél használhatatlan; nincs tömeges művelet, nincs „körzet nélküli családok" jelzés (régi H6 hiány).

### Megállapítások (amit az automatika előtt javítani kell)
- **P2** — `getVisibleDistrictState` a `csoport.congregation_id`-t ignorálja (usage-alapú láthatóság) → üres körzet minden gyülekezetnek látszik; a bulk-generálás ezt felnagyítaná.
- **P2** — `assignFamilyToDistrict` nem ellenőrzi a család gyülekezet-hovatartozását; per-család út nem skálázódik (300 család ≈ 1200+ hívás).
- **P3** — Házszám varchar (`'12/A'`, `'1-3'`) → utca-felosztáshoz best-effort numerikus parse + „kézi besorolás" lista kell.
- **P3** — `getFamilies` nem adja vissza a települést → szórványban két falu azonos nevű utcája egy körzetbe kerülne.

### Terv
- **F4.1** Tervező-motor: `lib/members/auto-district.ts` **pure function** (DB nélkül, unit-tesztelhető, később desktopra emelhető). Bemenet: családok (utca, település, házszám, felnőtt-életkorok, taglétszám) + presbiterek + paraméterek (körzetszám — default: presbiterek száma; mód: utcánként / korosztály; kiegyensúlyozás: családszám/lélekszám; „csak üresek"). Algoritmus: (település, utca) csoportosítás → greedy bin-packing N körzetbe → **túlcsordulásnál utca kettéosztása** házszám-tartományra (páros/páratlan vagy tartomány); korosztály-mód a család legidősebb felnőttje szerint (a hozzárendelés család-szintű marad). Kimenet: DistrictPlan + „besorolatlan" lista okokkal. *(M)*
- **F4.2** Bulk apply: új server action (csoport-batch-insert + körzetenként chunked UPDATE + congregation-guard + 1 összegző audit-event); 500+ családnál SECURITY DEFINER RPC. A `getVisibleDistrictState` congregation_id-szigorítással. *(M)*
- **F4.3** UI: „Automatikus körzetesítés" 3-lépéses wizard a Körzetek fülön (Paraméterek → Előnézet kártyákkal, szerkeszthető nevekkel, presbiter-selecttel → Alkalmazás). Mobilon teljes képernyős dialog, kártya-alapú (nem táblázat). Az előnézetig SEMMI írás. + „X család körzet nélkül" sárga sáv (H6 pótlás). *(L)*
- **F4.4** Bemeneti adat-action: egy körben család + település + presbiter (explicit limit/lapozás, information_schema-ellenőrzött oszlopok). *(S)*
- **F4.5** `csoport.congregation_id` backfill SQL a legacy NULL sorokra. *(S)*
- Adatmodell: **v1-ben NEM kell új tábla** — a terv egyszeri előnézet→jóváhagyás→írás; szabály-perzisztencia (újrafuttatás új családokra) v2.

**Döntések: D3 (részletek a 10. fejezetben).**

---

## F5 — Személyi karton mélyaudit + családi kapcsolatok (user 5. pont)

### Megállapítások (válogatás a 22-ből)
1. **P1** — **Esketés wizard-blokk némán eldobja az adatokat**: a mezők validáltak, de a `saveMember`-ben nulla hivatkozás van rájuk — a záró szöveg közben explicit ígéri a rögzítést. *(member-form-dialog.tsx:589)*
2. **P1** — Családi kartonról nyitott személyi karton MINDIG „Rendezve": `getEnrichedMemberById` hard-kódolja `paymentStatus:'rendezve'` → hátralékos tagnál nincs Hátralék fül. *(family-actions.ts:849)*
3. **P1** — Család-szintű befizetések `limit(30)` → a karton hátralék-bontása túlbecsülhet. *(payment-compat.ts:184)*
4. **P2** — `maybeSingle` a registry-eseményeken: duplikált sor → PGRST116 → néma „Nincs rögzítve" létező adatnál.
5. **P2** — Befizetés-lista rendezetlen összefésülés; „Legutóbbi év" hibás; stornó jelöletlen és beszámít az összegbe.
6. **P2** — Családi háttér címkék heurisztikusak (gyermek kartonján a testvérek „Gyermek"-ként); a `szerep` mező rendelkezésre áll, csak nincs használva.
7. **P2** — Vallás-normalizálás 3-féle → „Reformatus" (ékezet nélkül) tag felületenként hol aktív, hol nem.
8. **P2** — `searchFamilyMember`: szerkesztésnél a házas-szűrő TELJESEN kikapcsol → dupla családtagság lehetséges.
9. **P2** — Karton-mentés (megjegyzés/GDPR) után a lista-state nem frissül — újranyitáskor régi adat.
10. **P2** — Űrlapról hiányzó mezők: leánykori név + tömbház/lépcsőház/emelet/ajtó (a mentés írná, input nincs); `fizeto_status` szerkesztésnél elő-nem-töltött, UPDATE-en ignorált, „nem_fizet" halott opció.
11. **P2** — `family-details-dialog`: hiányzó `.catch` → hiba esetén örök spinner.
12. **P2** — Aktuális évre rendezett tag RÉGI tartozásai elérhetetlenek a kartonon (hasArrears csak az idei státuszból).
13. **P3** — Halott kód: `void Mail`, redundáns dynamic import, console.log-ok (baptism-dialog), elavult ui-app komment, dark-mode `bg-white` hardcode, „choose" képernyő padding.

### Terv
- **F5.1** Esketés-blokk: **D4 döntés** — mentés bekötése a `hazassag` táblába (keresztelés-minta) VAGY a blokk eltávolítása. *(M)*
- **F5.2** `getEnrichedMemberById` valós paymentStatus + a Hátralék fül az `arrearsBreakdown`-ból döntsön (`hasArrears = arrearsBreakdown.length > 0`) — ez a 12. pontot is megoldja. *(M)*
- **F5.3** Registry-események: `maybeSingle` → `order+limit(1)` + hibalog; újraházasodásnál a legutóbbi. *(S)*
- **F5.4** Befizetés-lista: globális rendezés + stornó-jelölés + stornó-mentes összeg + limit-mentes hátralék-lekérdezés. *(M)*
- **F5.5** Családi háttér címkék a tényleges `szerep`-ből + „Testvér" címke + kor szerinti rendezés. *(S)*
- **F5.6** Vallás-normalizálás egyetlen közös helperbe (NFD). *(S)*
- **F5.7** `searchFamilyMember` pontos kizárás + scope-szűrés + limit a szűrés UTÁN. *(S)*
- **F5.8** Karton-mentések visszacsatolása a listába (onMemberPatched vagy dirty-flag + refetch). *(S)*
- **F5.9** family-details-dialog `.catch` + retry UI. *(S)*
- **F5.10** Hiányzó űrlapmezők pótlása + `fizeto_status` rendbetétel. *(M)*
- **F5.11** Takarítás-csomag (halott kód, console.log, dark-tokenek, mobil-padding). *(S)*

---

## F6 — Családok importja (user 6. pont)

### Megállapítások
1. **P0** — **A láthatatlan családok**: mind a 3 import-út (family_head_batch, families_from_existing, infer_family_links) csak `csalad`+`gyerek`-be ír; a Családok fül + minden család-action csak a `haztartas`-ból olvas; a `syncHouseholdFromCsalad`-ot csak a kézi `saveFamily` hívja, DB-trigger nincs, a 2026-06-01 backfill egyszeri volt. → A wizard „N új család" sikert jelez, a fülön semmi nem jelenik meg. **Ez a bejelentett hiba legvalószínűbb oka** (az F1 diagnosztika-szakasz igazolja).
2. **P0** — `statement_timeout`: a 120s-ALTER csak az infer-RPC-re futott le; a két batch-RPC 8s-on maradt → nagy fájlnál teljes rollback.
3. **P1** — Gyerek-automatch cím-kulcs törékenység: pontos `(c_utcaid, c_szam)` egyezés kell; eltérő utca-resolválás vagy házszám-formátum („12" vs „12.") → **némán 0 gyerek**.
4. **P1** — `ferfi` default: hiányzó „Férfi" oszlopnál minden fej férfinak számít; DB-beli `ferfi=NULL` SOSEM egyezik.
5. **P1** — `csaladfo` default false az RPC-ben (a profil-komment true-t állít) → kettős tagság kockázat + torz statisztikák.
6. **P2** — Néma 0-találat ágak (spouse candidate_count=0), túlszámolt `inserted_gyerek` (ON CONFLICT-nál is inkrementál), profilválasztó-csapdák (families_from_existing módban elveszthető a mód; „csalad" fájlnév new_persons módban duplikál), wipe `.or()` URL-limit.

### Terv
- **F6.1** **Import-utáni haztartas-szinkron** (a láthatatlanság megszüntetése): SQL-oldali idempotens, gyülekezet-szűkített `sync_households_from_csalad(congregation_id)` RPC (a fazis1-backfill logikája), a 3 import-út végén hívva + egyszeri catch-up futtatás élesben a már beimportált családokra. *(M)*
- **F6.2** `statement_timeout='120s'` ALTER a két batch-RPC-re (az infer-fix pontos analógja). *(S)*
- **F6.3** `csaladfo=true` a family-heads úton + a gyerek-matcherbe `NOT EXISTS (csalad fej)` kizárás. *(S)*
- **F6.4** Néma 0-találatok felszínre hozása: soronkénti info („0 gyerek egyezett ezen a címen"), `spouse_none` számláló, tényleges-insert-számlálás. *(M)*
- **F6.5** Wizard-védelmek: profilzár families_from_existing módban; fájlnév-figyelmeztetés; auto-link gomb 0 insertednél is. *(S)*
- **F6.6** Cím-kulcs robusztusabbá tétele: c_szam normalizálás mindkét oldalon + utca-NÉV fallback azonos településen belül. *(M)*
- **F6.7** `wipe_family_structure(congregation_id)` RPC a törékeny `.or()` querystring helyett. *(M)*

---

## F7 — Import-motorok időtállósága (user 7. pont)

### Megállapítások
- **P1** — xlsx 0.18.5: az utolsó npm-re publikált SheetJS (2022); CVE-2023-30533 + CVE-2024-22363 javítása csak a cdn.sheetjs.com csatornán érhető el; a `^` caret hamis biztonságérzet — **automatikus frissülés strukturálisan lehetetlen** a jelenlegi forrásból.
- **P1** — A kézi oszlop-átmappolás (ColumnMappingStep) eredménye nem kerül a FormData-ba → a szerver újra auto-matchel → amit a user az előnézetben jóváhagyott, nem az importálódik.
- **P1** — A generikus multi-sheet út a `headerMatch.unmatched`-et sehol nem mutatja → fel-nem-ismert oszlop **némán kimarad** (pontosan a kért „ne törjön el egy idő után" ellentéte).
- **P2** — `normalizeForMatch` NEM ékezet-toleráns (a kommentje azt ígéri) + le van másolva a column-mapping-step-be (drift-forrás); az egyházfenntartás-parser az EGYETLEN fix-oszlopindexes parser; fejléc-detektor 5 példányban; „Kassza" fülre rossz profil-javaslat.
- **P1 (gyanú)** — kategória-lookup (`befizetescel/kiadascel` select `kod`+`congregation_id`-vel) hibát némán elnyel — a budget-code-resolver szerint ezek a táblák system-szintűek; SQL-ellenőrzés kell (G1-G2).
- Pozitívumok: NINCS év-hardcode; az INSERT-oldali séma-drift hangos; a date-utils robusztus; a kassza-column-mapping a jó minta.

### Terv (sorrend fontos!)
- **F7.1** **Golden-file regressziós tesztek ELŐSZÖR**: anonimizált mini-fixture fájlok (EREK Kassza, Adatok 2 évjárat, szemelyek/csaladok/esketesek XML, BCR, CSV) + unit tesztek (fejléc-detektálás, dátum-határesetek, matchHeaders minden profilra, transformSheet). CI-ban fut → a lib-upgrade és minden jövőbeli sablon-változás a CI-t töri, nem az éles importot. **Ez a „ne törjön el idővel" tényleges biztosítéka.** *(M)*
- **F7.2** xlsx migráció a SheetJS CDN 0.20.3-ra pin-elve (apps/web + packages/core), a dátum-regresszió zöldje után. *(M)*
- **F7.3** Kézi mapping tényleges átadása a szervernek (effectiveMapping a FormData-ban; a szerver ezt használja) → preview = import garancia. *(M)*
- **F7.4** „Ismeretlen oszlop" figyelmeztetés: parseAndPreview adja vissza a matched/unmatched listát; a sheet-kártyán „12/14 oszlop felismerve — 2 NEM importálódik" borostyán badge + megerősítés; unmatched az import-logba. *(M)*
- **F7.5** Ékezet-lehántás a normalizeForMatch-ben (NFD) + a duplikátum megszüntetése. *(S)*
- **F7.6** egyhf-parser átállítása a meglévő fejléc-alapú detektorokra (detectKasszaColumns + reparseKasszaSheet). *(M)*
- **F7.7** Kategória-lookup séma-igazítás (G1-G2 eredmény alapján) + hiba a warnings-ba (néma üres map tilos). *(S)*
- **F7.8** Kisebb konzisztencia: profil-javaslat pontozás, .xml accept, közös fejléc-detektor, isLedgerSheetName fejléc-alapú. *(M)*

---

## F8 — Családi háló + családfa (user 8. pont)

### Megállapítások
1. **P1** — Családfa-adatréteg: MINDEN DB-hiba némán elnyelve (`const { data }` — error sehol nem nézve) → hamis „Nincs elegendő adat" üres fa; nincs congregation-szűrés (admin/esperes szerepnél **kereszt-gyülekezeti adatkeveredés**); nincs chunk/lapozás (1000-es néma él-levágás nagy rokonságnál).
2. **P1** — **Unokatestvérek szisztematikusan kimaradnak**: a testvér-bevonó pass iterációs sorrend-hibája miatt a nagybácsik gyermekei sosem kerülnek a fába — pedig az adatból levezethetők.
3. **P1** — Hamis rokonsági címkék: a címke csak generációs szintből számolódik → nagybácsi=„Apa", vő=„Fiú", sógor=„Testvér". Egyházi nyilvántartóban félrevezető.
4. A kiterjesztett rokonság (dédszülő=3, ükszülő=4, szépszülő=5 lépés) **már most levezethető** a szulo_gyermek élekből — csak a mélység-paraméter (default 2) és a címke-tábla korlátozza. A séma 9 kapcsolattípust tud; a `nagyszulo_unoka` explicit éltípust a fa-BFS ignorálja (kettős igazságforrás).
5. **P2** — Galaxis: material-leak (dispose hiányzik), setHighlight duplán dolgozik + mount-kor dupla build, WebGL-hiba néma fekete doboz, mobilon bloom+dpr2 adaptáció nélkül (mobil-first követelmény!).
6. **P2** — Betöltés: haztartas_tag kétszer töltődik le, minden fülváltás teljes újratöltés, nincs cache → sok másodperces betöltés 600+ főnél.
7. Full-bleed layout-lánc feltérképezve: hero = member-tabs-v4:381-411 kártya; kötelező padding = dashboard-shell page-shell; a legkisebb kockázatú út a **fixed overlay immersive mód**.
8. Betöltő: jelenleg szöveg + pöttyök, NINCS logó; kész minta: `components/ui/splash-screen.tsx` (KARTOTEKA_V3 + halo + fázisos animáció).

### Terv
- **F8.1** Családfa-adatréteg javítócsomag: hibapropagálás (dobjon, a dialog már kezeli) + `.eq('congregation_id')` minden lekérdezésre + 100-as chunk + lapozás. *(M)*
- **F8.2** **Kiterjesztett rokonság**: mélység default 2→5 fel / 3 le; oldalági pass fixpontig (→ nagybácsi/nagynéni ÉS unokatestvér); új `lib/family-tree/kinship.ts` — út-alapú címkéző: (2,0)=Nagyszülő, (3,0)=Dédszülő, (4,0)=Ükszülő, (5,0)=Szépszülő, (2,1)=Nagybácsi/Nagynéni, (2,2)=Unokatestvér, affinális ág: Após/Anyós/Meny/Vő/Sógor; `nagyszulo_unoka` explicit élek beolvasztása virtuális 2-lépésként, ahol nincs szülő-lánc; pár-csoportosító layout a family-tree-view-ban (házastársak egymás mellé — enélkül 5 generáció olvashatatlan). *(L)* — **D6 döntés**
- **F8.3** **Teljes képernyős háló**: immersive mód — a fül tartalma `fixed inset-0` overlay (hero, ColorTabs, header, BottomVerse felett), kilépés X + Esc; kereső/szűrő kompakt úszó sávként; mobilon a touch-explore változatlan. — **D5 döntés** a pontos viselkedésről. *(M)*
- **F8.4** **Logós betöltő**: FamilyGraphLoading csere — KARTOTEKA_V3.png + a splash-screen halo/fázis mintája a meglévő csillagtér felett; motion-reduce fallback; újrahasznosítva a FamilyTreeDialog betöltőjéhez. *(S)*
- **F8.5** Galaxis karbantartó-csomag: material-dispose, dupla-build fix, WebGL-hibaállapot + contextlost kezelő, mobil minőség-skálázás (dpr 1.5, bloom felezés, hover-raycast csak finom pointeren). *(M)*
- **F8.6** Betöltés-perf: haztartas_tag egyszeri letöltése, párhuzamos chunk-ok, session-cache a fülváltás ellen. *(M)*

---

## F9 — Desktop-paritás (kereszt-vágó)

A desktop SAJÁT komponenskészletet használ (nem a web tabjait); a 8 témából desktopon csak a tag-lista + családok létezik.

### Azonnal javítandó (a webes munkától függetlenül is hibák)
- **P1** — Picker-kereső a család-dialógusokban a LIMIT UTÁN szűr → 600 fős gyülekezetben egy „Zoltán" keresés 0 találat. *(S)*
- **P1** — Sync-pullok lapozás nélkül → 1000-es sapka + azonos-updated_at határvesztés (import után!). `.range()` loop + (updated_at,id) kurzor. *(M)*
- **P2** — Desktop család-létrehozás `c_utcaid=-1` dummy-t ír az ÉLES DB-be → a webes cím-lánc ezekre üres címet ad. *(S)*
- **P2** — Desktop `voter_eligible` kézi szerkesztése megkerüli a `voter_manual_override` szemantikát → a webes recompute visszaírja. *(M)*

### Paritás-minimumok (D8 döntés szerint)
- Választói névjegyzék desktopon (az adat lokálisan megvan; nyomtatás a `print-html.ts` mintával) — a legértékesebb jelölt. *(L)*
- `csoport_local` tükör + districtName megjelenítés (a sync már viszi az id_csoport-ot). *(S)*
- Galaxis/családi háló: marad **web-only** (korábbi user-döntés).
- Ha a web a strukturált címre áll át (F3): vagy `szemely_local` séma-bővítés, vagy a szerver tartja karban a `c_szcim` szöveg-projekciót (0 desktop-munka) — **D8**.

---

## Ismert nyitott tételek, amelyeket ez a terv NEM duplikál

- **RLS scope-fix (egyhazkeruleti_admin)** — külön kör, több tervdoc follow-upja; itt csak függőségként jelezzük (F8.1 tenant-szűrés részben mitigálja).
- **Kereszt-gyülekezeti 2. fázis** (person_identity_id + összevonás + deduplikált lélekszám) — külön XL kör.
- **getMembers szerveroldali lapozás + revalidatePath-granularizálás** — a 2026-06-10-es audit óta halasztott skálázás-sprint, nem e terv része (de az új kód mindenütt explicit limitekkel készül).
- Már ÉLES vagy tudatosan ELVETETT tételek (spouse-bridge, DB-UNIQUE idempotencia-index, round-robin) nem kerülnek vissza.

---

## 10. Döntések (D1–D10) — RÖGZÍTVE 2026-07-17

- **D1 — ELDÖNTVE:** a járulékfizetés JOGOSULTSÁGI kritérium. A névjegyzékre az kerül, aki (a) 18+, konfirmált, aktív státuszú ÉS (b) az egyházfenntartói járulékot megfizette VAGY érvényes felmentése van — **a felmentett fizetettnek számít**. Az RPC ezzel bővítendő (F1.6).
- **D2 — ELDÖNTVE:** javaslat szerint — lapozott A4-minta, lefűzési margó, „Oldal X / Y" oldalszám; a jogosultság-szűrő alapértelmezetten BEKAPCSOLVA (kikapcsolható).
- **D3 — ELDÖNTVE:** (a) egy körzethez **több presbiter is tartozhat** (a presbiter.id_csoport FK ezt már támogatja — a wizard körzetenként több presbitert enged kiosztani); (b) kiegyensúlyozás: **lélekszám** szerint, de **családot nem szakítunk szét** (a hozzárendelés család-szintű marad); (c) a korosztály-mód KELL a v1-be; (d) a körzet-nevek **személyre szabhatók** (default generált, az előnézetben szerkeszthető); (e) **mindenki elosztásra kerül** — nem maradhat körzet nélküli család/személy; az eredmény minden pontja kézzel felülbírálható marad.
- **D4 — ELDÖNTVE:** az esketés-blokk **kikerül** a tag-űrlapból; az esketés rögzítése kizárólag az Anyakönyv modulban történik.
- **D5 — ELDÖNTVE:** teljes overlay (app-header + BottomVerse is eltűnik), X + Esc kilépéssel; **a sidebar marad látható** a könnyű navigációhoz — az overlay a sidebar melletti területet tölti ki.
- **D6 — ELDÖNTVE:** 5 fel / 3 le mélység + az **affinális rokonok** (após/anyós/meny/vő/sógor) IS kellenek a címkézésbe.
- **D7 — ELDÖNTVE:** javaslat szerint — előbb golden-file teszt-háló, utána xlsx lib-csere.
- **D8 — ELDÖNTVE:** javaslat szerint — a 4 azonnali desktop-hibafix + választói névjegyzék-fül desktopra; cím: szerver-oldali c_szcim-projekció (desktop-séma-bővítés nélkül).
- **D9 — ELLENŐRIZVE (csaladok.xml, 2026-07-17):** **nincs házastárs-oszlop** — a 19 oszlop: Házszám, Utca, Tömbház, Állapot, Családnév, SzCsaládnév, Keresztnév, Foglalkozás, Vallás, Év, Hó, Nap, Életkor, **Férfi**, **Helység**, Telefonszám, E-mail, Apja, Anyja. Spouse-oszlop-alapú kötés tehát nem építhető; a házastárs-kötés útja az auto-inferálás marad. A „Férfi" és „Helység" oszlop LÉTEZIK → az F6 ferfi-default fix és a helység-feloldás kritikus.
- **D10 — ELDÖNTVE:** a PR-1..PR-8 sorrend jóváhagyva.

---

## 11. Ütemezés — javasolt PR-sorrend

| PR | Tartalom | Súly | Megjegyzés |
|----|----------|------|------------|
| **PR-1** | F3 (település-lánc: wizard-fix + RPC-fallback + backfill + megjelenítési fallback + maps) | P0 | Legnagyobb user-fájdalom, kicsi kockázat |
| **PR-2** | F1 + F2 (választói névjegyzék helyesség + nyomtatás) | P0 | Közös terület, egy körben |
| **PR-3** | F6 (család-import: haztartas-szinkron + timeout + védelmek) | P0 | + egyszeri catch-up SQL élesben |
| **PR-4** | F5 (személyi karton csomag) | P1 | Sok kis fix, egy fázisban |
| **PR-5** | F8 (családi háló + családfa + full-bleed + betöltő) | P1 | D5/D6 döntés után |
| **PR-6** | F7 (import-motor: tesztek → xlsx upgrade → mapping/warning) | P1 | D7 sorrenddel |
| **PR-7** | F4 (auto-körzetesítés) | ÚJ | D3 döntések után |
| **PR-8** | F9 (desktop: 4 hiba-fix + paritás-minimumok) | P1/P2 | D8 szerint; desktop külön verziószám |

Minden PR: tiszta feature-ág → CHANGELOG (lelkész-barát magyar) → PR → merge main → auto-deploy; SQL-migrációk fájlként, a user futtatja, `_RUN_LOG.md`-be regisztrálva. Minden UI-elem mobil-first (telefon/tablet/desktop).
