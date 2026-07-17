# KARTOTÉKA — Pénzügy finomhangolási terv (2026-07-17)

**Státusz:** TERV — jóváhagyásra vár, kódmódosítás még nem történt.
**Módszertan:** 4 párhuzamos mélyolvasó audit-ágens (kísérőív, nyugta, kedvezmény-írás, kedvezmény-olvasás) + minden találatra külön adverszáriális ellenőrző ágens (összesen 42 ágens-futás), valamint külön felmérés az induló egyenlegekről. Csak a MEGERŐSÍTETT találatok kerültek ide; a cáfoltak a „Elvetett gyanúk" szakaszban.
**Kapcsolódó diagnosztika:** `migration-docs/sql/2026-07-17-penzugy-finomhangolas-diagnosztika.sql` — futtatandó a Supabase SQL-editorban, az eredmény dönti el a nyitott kérdések egy részét.

---

## 0. Vezetői összefoglaló

| # | Terület | Legsúlyosabb lelet | Súly |
|---|---------|--------------------|------|
| 1 | Tartozás-számítás | A befizetés-lekérdezés nem létező oszlopot (`szamadasicel.kod`) ágyaz be → a lekérdezés hibázik, **minden tag befizetése némán elvész, paid=0** (a v0.9.78-as hibaosztály újabb esete) | **P0** |
| 2 | Kedvezmény-beállítások | A Gyülekezet beállításai ablak **két írási célpontja soha nem jut el a számításig**: az „Évenkénti díjak" panel írás-csak táblába ír; a „Teljes éves díj" a `congregations`-be ír, a motor a `bealitas`-ból olvas | **P0** |
| 3 | Nyugta-nyomtatás | Egy globális `@media print` CSS-szabály (Presentation Studio-hoz készült) **minden ablakon belüli nyugta-nyomtatást üres lapra visz** — a funkció valószínűleg sosem működött | **P0** |
| 4 | Kísérőív / PDF | A PDF-mentés a **teljes stíluslap nélkül** raszterizál (html2pdf 0.14 csak a body-t klónozza) → PDF ≠ nyomtatás ≠ előnézet; nyomtatásban az aláírók/oldalszám nem a lap alján | **P1** |
| 5 | Induló egyenlegek | A kész „Nyitó egyenlegek" szerkesztő **elérhetetlen a UI-ból** (nincs ajtó hozzá); desktop 0 nyitóval számol; Registru Banca legacy mezőt olvas | **P0/P1** |

---

## 1. TARTOZÁSOK — számítási hibák (a „rosszul számol" gyökerei)

### F1-1 (P0) Befizetések néma elvesztése: `befizetescel(szamadasicel(kod))`
- **Helyek:** `apps/web/app/(dashboard)/penzugy/actions.ts:1023` (initFinance → Tartozások lista), `:2379` (getExpectedJarulek → Tétel-rögzítő auto-összeg), `apps/desktop/src/lib/finance-entry-lookups.ts:254`.
- **Mechanizmus:** a `szamadasicel` táblának a séma-dump, a fájl saját 2026-04-18-as kommentje („NINCS kod oszlop, az id maga a kód") és a `lib/finance/payment-compat.ts` compat-réteg léte szerint **nincs `kod` oszlopa** → a beágyazott select az egész lekérdezést 400-ra buktatja → `debtPaymentsRes.data=null` → `(… || [])` üres tömb, **hibaellenőrzés nélkül** (a 2379-es helyen és desktopon az error destrukturálással el is dobódik). Következmény: mindenki paid=0, minden megszerzett korai-fizetési kedvezmény eltűnik, minden tag teljes hátralékosnak látszik.
- **Fontos:** v0.9.78 előtt ezt maszkolta a szemely-select hibája (üres lista); a javítás óta válhatott láthatóvá — időben egybevág a mostani panasszal.
- **Megerősítés:** diagnosztika-SQL **D1** (information_schema a `szamadasicel`-re). Memória-szabály szerint SQL-lel igazolandó.
- **Javítás:** mindhárom helyen `befizetescel(id_szamadasicel)` beágyazás + a kód-kiolvasó az `id_szamadasicel`-ből dolgozzon (a tagnyilvántartás már így csinálja); kötelező `error`-logolás mindhárom lekérdezésre (v0.9.78 mintájára).

### F1-2 (P0) „Teljes éves díj" mező hatástalan: `congregations` ⇄ `bealitas` divergencia
- **Helyek:** írás: `apps/web/app/(dashboard)/congregation/actions.ts:208` (updateCongregation → `congregations.eves_jarulek`); olvasás: `penzugy/actions.ts:1008/1249–1266` (motor: kizárólag `bealitas.eves_jarulek`).
- **Mechanizmus:** a `bealitas` év-sort csak a welcome-wizard és az év első pénzügy-megnyitása hozza létre (egyszeri másolat a `congregations`-ből). Év közbeni díjmódosítás a Beállításokban **soha nem ér el a Tartozásokig** — és ugyanez igaz a `jarulek_kedvezmenyes` + `jarulek_hatarid` mezőkre is. A Tartozás-listának congregations-fallbackje sincs.
- **Javítás:** `updateCongregation`-ben ha `evesJarulek` / `jarulekKedvezmenyes` / `jarulekHatarid` változik → szinkron upsert a `bealitas` aktuális évi sorába (a zárt/véglegesített év védelmével). UI-szöveg pontosítása.

### F1-3 (P0) Az „Évenkénti díjak (visszamenőleg)" panel írás-csak táblába ír
- **Helyek:** `annual-fees-manager.tsx:76` → `tartozas-actions.ts:324` (`congregation_annual_fees` upsert); második író: `congregation/actions.ts:601`. A táblát számításhoz **semmi nem olvassa** (egyetlen „olvasója", a `calculateMemberDebt` a `tartozas-actions.ts:58`-ban **halott kód**, sehonnan nem hívott).
- **Javítás (javasolt irány — B):** az AnnualFeesManager a `bealitas` év-sorokat írja/upsertelje (a panel a lelkész felé is a valós, motor által használt értéket mutassa); a `congregation_annual_fees` kivezetése (vagy egyszeri átmigrálás a `bealitas`-ba — diagnosztika-SQL **D4** mutatja az eltéréseket). A halott `calculateMemberDebt` törlése. + `revalidatePath` a save/delete végére (most hiányzik).
- **Alternatíva (A):** a motor olvassa fallbackként a `congregation_annual_fees`-t — NEM javasolt, mert két igazságforrást tartósít.

### F1-4 (P1) Stornózott befizetés beleszámít a „paid"-be
- **Helyek:** `penzugy/actions.ts:1021–1026` és `:2378–2384` (nincs stornó-szűrés, a select a `stornozott`-ot le sem kéri); desktop: a szűrés a `penzugy-tartozasok-page.tsx:76–84` mappingjébe kell (a közös `getLocalBefizetesek`-be NEM — ott a stornó listázása szándékos).
- **Hatás:** stornózott nyugta után a tag „Rendezett"-nek látszik, a valós hátralék láthatatlan.
- **Javítás:** `.or('stornozott.eq.false,stornozott.is.null')` + web/desktop bit-azonosan. Diagnosztika-SQL **D5** méri a tényleges érintettséget.

### F1-5 (P1) Évváltáskor a kedvezményes alapösszeg elveszik (`jarulek_kedvezmenyes: 0` hardcode)
- **Hely:** `penzugy/actions.ts:2502` (createYearlySettings) + a hívók (`page.tsx:93–95`, `yearly-settings-dialog.tsx:25`) sem viszik át.
- **Hatás:** az onboarding utáni MINDEN következő évben a default korai-fizetési kedvezmény némán megszűnik (aki a kedvezményes összeget fizeti, hátralékos marad).
- **Javítás:** a `congregations.jarulek_kedvezmenyes` átvétele az auto-copyban + a YearlySettingsDialog mezője előtöltve.

### F1-6 (P2) Foglalkozás-kedvezmény %-ága még a régi (fordított) szemantikával számol
- **Hely:** `packages/ui-app/src/finance/jarulek-calculation.ts:272–277` — a % ott FIZETENDŐ-ként értelmeződik, nem levonandóként (a v0.9.76 csak a kor+időszak ágat javította). Csak legacy DB-sor érheti el (a mai mentés-utak foglalkozásra csak `fix_osszeg`-et írnak); diagnosztika-SQL **D3** mutatja, van-e ilyen sor.
- **Javítás:** `applyPercentDiscount`-ra cserélni, bit-azonosan a kor-ággal.

### F1-7 (P2) `debtCalcMode='aktualis'` a listákon no-op + képernyők közti inkonzisztencia
- **Helyek:** a motor (`jarulek-calculation.ts:161`) jó, de az initFinance (`:1351–1352`) és a getExpectedJarulek (`:2444`) `currentYear=year`-rel hív → múlt-évi nézetben a mód hatástalan; **egyetlen** hely, ahol él: a tag-adatlap hátralék-bontása (`tagnyilvantartas/actions.ts:341/389–398`) → 'aktualis' módban a tag-kartoték és a Tartozások lista **eltérő összeget mutathat ugyanarra a tag+évre**.
- **Döntés kell (Q6):** (A) valóban bekötni (valós currentYear + a bealitas-selectek bővítése kedvezmény-mezőkkel), vagy (B) a beállítást kivezetni. Javaslat: **B** — az 'akkori' mód az egyetlen könyvelésileg védhető, a rádió + címke megtévesztő.

### F1-8 (P2) Családi jóváírás többszöröződése
- **Hely:** `jarulek-calculation.ts:183–188` — tisztán `id_csalad`-os befizetés a család MINDEN tagjánál teljes összegű paid. Az aktív webes Tétel-rögzítő személyekre bont (helyes), de a wizard család-befizető + desktop család-checkbox tisztán családi tételt ír. Az `isszemelyibefizetes` flag íródik, de senki nem olvassa.
- **Döntés kell (Q7):** mi a szándékolt szemantika? Minimum: dokumentálás a Tartozások fül súgójában; teljes javítás külön körben.

### F1-9 (P2/P3) Beállítás-UI validációk és aknák
- Hónap-nap tartomány-validáció hiánya (`13-01` → következő évre görgetett határidő → egész évben „kedvezményes ár az elvárás"): zod-tartomány a `congregation/actions.ts:74` + welcome + YearlySettingsDialog sémáiban.
- Kor-kedvezmény szerkesztési csapda: a wizard **fix-RON módú** kor-sorát a kezelő „0% kedvezmény"-ként mutatja, mentéskor némán 50% levonássá konvertálja (`fee-discounts-manager.tsx:203/313` + `congregation/actions.ts:858–867`). Javítás: %/fix választó a kezelő kor-űrlapjában + szerver-oldali mapping bővítése + kártya-felirat.
- 0 RON-os időszaki szabály néma no-op, miközben „él" badge-et mutat (`fee-discounts-manager.tsx:61`, motor `:297`) — döntés (Q8): 0 = tiltott (validáció) vagy 0 = ingyenes (motor-módosítás). Javaslat: validáció (kedvOsszeg ≥ 1), az ingyenességre ott a felmentés/fix 0.
- `kor_tol=0` üres inputból (`Number('')=0`) → zod `min(18)` a kor-típusra.
- A „sorrend" mező súgószövege hamis (a motor min-ár elven választ, a sorrendet nem olvassa) → szöveg-igazítás + a motor-selectekbe `ORDER BY sorrend` a determinisztikus címkékért.

### Desktop-paritás (F6 fázisba)
- **(P2)** befizetés-pull `.limit(500)` (`finance-sync.ts:48` + `getLocalBefizetesek:294`): nagy gyülekezetnél pont az év eleji (kedvezményes) tételek esnek ki; ráadásul a limit az ÖSSZES befizetés-típusra értendő → hamarabb betelik; a desktop összesítők is alulszámolnak. Javítás: lapozott pull + lokális LIMIT törlése. Diagnosztika-SQL **D6**.
- **(P2)** dátum-parszolás lokális TZ-ben (`jarulek-calculation.ts:144`): web≠desktop bit-eltérés az ablak-határokon (mindkét irányban). Javítás: `${value}T00:00:00Z`.
- **(P3)** a webről törölt kedvezmény örökre a lokális cache-ben marad (`finance-debt-sync.ts:86` — pull csak upsertel): pull utáni purge a hiányzó id-kre.

---

## 2. NYUGTA-NYOMTATÁS

### F2-1 (P0) Globális print-CSS üres lapot ad minden nyugtára
- **Hely:** `packages/ui/src/kartoteka.css:529–553` — a Presentation Studio-hoz készült feltétel nélküli `@media print { body > *:not(.kartoteka-print-root) { display:none !important } }` blokk, amit a web ÉS a desktop is betölt. A nyugta-sablon `visibility:visible` trükkje az ős `display:none`-ját nem tudja felülírni → **a Kassza-fül kiállít+nyomtat és újranyomtat gombja üres lapot ad** (a kiállítás — DB-rekord + hivatalos sorszám — előbb megtörténik). A CSS 2026-04-21 óta él, a nyugta-print később épült rá — valószínűleg sosem működött.
- **Javítás (két rétegben):**
  1. A kartoteka.css print-blokkjának szűkítése: `body.kt-presentation-print` feltétel mögé (az `@page landscape`-pel együtt), a presentation-studio Nyomtatás gombja `window.print()` előtt felteszi, `afterprint`-nél leveszi az osztályt.
  2. Robusztusság: a ChitantaSilentPrint sablonját `createPortal`-lal a `document.body` alá tenni, hogy semmilyen köztes ős ne üthesse ki (a family-tree-view már dokumentálta ezt a hibaosztályt).
- **Utó-ellenőrzés:** diagnosztika-SQL **D7** (hány sorszám fogyott el üres nyomtatások mellett — tájékoztató).

### F2-2 (P1) Az ELSŐ nyomtatás is „— másolat —" vízjelet kap
- **Hely:** `chitanta-silent-print.tsx:102` (feltétel nélküli `copyWatermark`), miközben a CashbookTab ugyanazt a slotot használja friss kiállításra és újranyomtatásra (`CashbookTab.tsx:339/835/868–870`).
- **Javítás (Q3 döntés szerint):** a silent print helyett mini nyomtatási előnézet, a vízjel alapból BE, kis X-szel kikapcsolható; egyházkerület-függő háttércímer (EREK/KEREK). Részletek: 6. szakasz, „Q3 részletes terv".

### F2-3 (P2) A nyugta „reprezentând" sora nem tartalmazza a fizetett évet
- **Helyek:** `chitanta-actions.ts:135/197–208/259` (web) ÉS `packages/core/src/finance/chitanta/auto-issue-for-befizetes.ts:61/121–122/173` (desktop-út) — a `fizetettev` lekérve, de sosem használt; + `print.ts:86–93` régi-nyugta fallback.
- **Hatás:** a 2024-es elmaradásra 2026-ban fizetett járulék nyugtája nem igazolja, melyik évre szólt.
- **Javítás:** mindhárom helyen a `reprezentand`(+`_ro`) végére a fizetett év (Q4: mindig, vagy csak ha eltér a kiállítás évétől — javaslat: mindig).

### F2-4 (P3) Silent print időzítési verseny (EREK.png vízjel)
- **Hely:** `chitanta-silent-print.tsx:77` — rAF+80ms után print, kép-betöltés-várakozás nélkül (SW-precache enyhíti, de első látogatás/inkognitó érintett). Javítás: `img.decode()` + `document.fonts.ready` várakozás max ~1500ms fallbackkel.

### F2-5 (P2/P3) Árva nyomtatási kód + KETTŐS SZÁMOZÁS a desktopon (ÉLŐ!)
- A `ChitantaPrintCenter`, `ChitantaIssueDialog`, `ChitantaReprintDialog` a weben árva (utóbbi kettő ráadásul hibás print-úttal: `.chitanta-no-print` wrapper ill. transformált dialógusból nyomtatás).
- **DE:** a desktop `chitanta-page.tsx:1039` ÉLESBEN az `issueChitantaUseCase`-t hívja (`next_chitanta_number`, oblio_fiokok-számláló), miközben ugyanazon desktop app Kassza-fül auto-kiállítása a `next_chitanta_full`-t (tömb-alapú) használja → **két, egymásról nem tudó hivatalos számozás fut párhuzamosan a desktopon**. Diagnosztika-SQL **D8** méri az ütközéseket.
- **Javítás:** döntés (Q9): a desktop Nyugta-oldal átállítása a tömb-alapú útra + a webes árvák törlése (javaslat), vagy az árvák felélesztése egységes úton.

---

## 3. KIADÁSI KÍSÉRŐÍV

### F3-1 (KÉRÉS) Jogcím NÉV a szám helyett
- **Hely:** `packages/ui-app/src/finance/reporting.ts:597` — a „Költségv. Tétel" oszlopban ma a kód (pl. `205.01`) áll; a név ma az 5. oszlopban a partner mögé fűzve jelenik meg. Az adatlánc ép (a név elérhető a builderben), tisztán megjelenítési változtatás.
- **Terv (Q1+Q2 döntés szerint):** a „Költségv. Tétel" oszlopba a jogcím MINDKÉT neve kerül (magyar `nev` + román `nevro`, két sorban vagy „ / " elválasztóval; kód-fallback csak ha mindkét név üres), a kód nem jelenik meg; az 5. oszlopból a név-duplikáció kikerül.

### F3-2 (P1) PDF ≠ nyomtatás ≠ előnézet — gyökérok: a PDF-motor elveszíti a teljes stíluslapot
- **Hely:** `apps/web/lib/utils/print-engine-v2.ts:38–82` — a html2pdf.js 0.14.0 `from(iframeDoc.body)` hívása csak a body-részfát klónozza, az iframe `<head>`-beli `<style>` (a wrap() teljes CSS-e) kimarad → a PDF stílus nélkül raszterizálódik (nincs táblázat-keret, rossz betűméret, elveszett oldaltörések). **Ez az ÖSSZES (~15) PDF-mentős nyomtatványt érinti, nem csak a kísérőívet.**
- **Javítás:** a printToPdf a `<style>`-t a klónnal együtt utaztassa (a stíluselem body-ba helyezése a `.from()` előtt), + print-emulációs felülírás (fehér háttér, `padding:0`, `box-shadow:none`, `.page` margó nélkül) az üres 2. oldal ellen; a kísérőív-dialog `margin:[10,10]` → `[0,0]` (print-központ WYSIWYG konvenciója, `kiseroiv-print-dialog.tsx:101`).

### F3-3 (P1) Aláírók + oldalszám a lap aljára
- **Hely:** `reporting.ts:174/192/195/196` — `@media print` a `.page` `min-height`-jét `auto`-ra állítja → nyomtatásban a footer + oldalszám a táblázat alá csúszik felfelé.
- **Javítás:** `.page{display:flex;flex-direction:column}` + `.footer{margin-top:auto}` + printben a lapmagasság megtartása (portrait ~295mm / landscape ~208mm, 1-2mm ráhagyással az átcsordulás ellen); a `.page-num` marad absolute bottom. Így mindhárom kimenetben azonos a lap alja. Több oldalas kísérőívnél az aláíró-blokk az utolsó oldal alján (Q5 — javaslat: utolsó oldal, nem minden oldal).

### F3-4 (P1) Stornózott kiadás a kísérőíven
- **Hely:** `packages/ui-app/src/finance/TransactionsTab.tsx:448/458/472` — csak `!deleted` szűrés; a stornó rákerül az ívre, beleszámít a napi összesenbe, és a csak-stornós nap pg.-sorszámot kap (minden későbbi nap sorszámát eltolva); + a dialog info-panelje (`kiseroiv-print-dialog.tsx:59`) is. Javítás: `!r.stornozott` mindenhol + a panel-összeg `osszeg_ron ?? osszeg` (F3-5). Diagnosztika-SQL **D5**.

### F3-5 (P2/P3) Kisebb kísérőív-javítások
- Dupla `win.print()` lehetőség: `print-engine-v2.ts:119–124` — `printed` zászló a triggerPrint-be.
- Dialog-panel „Összeg": nyers `osszeg` vs nyomtatvány `osszeg_ron` (`kiseroiv-print-dialog.tsx:59/146`).
- Fantom `kedvezmenyzett` mező-olvasások takarítása (reporting.ts:590/846, helpers.ts:66/69, oblio-fájlok) → `atvevo`; a `KiadasRow` típusból kivezetés.

---

## 4. INDULÓ EGYENLEGEK (új funkció — kezdő költségvetési év)

**Helyzet:** a funkció ~90%-ban KÉSZ, csak elérhetetlen. Létezik:
- per-év bank-nyitó tábla (`bankszamla_nyito_egyenleg`, élesben igazoltan), kassza-nyitó tábla (`keszpenz_nyito_egyenleg` — élesbeni léte **D9**-cel igazolandó);
- teljes értékű szerkesztő (`opening-balances-manager.tsx`: évválasztó a legelső évtől, kassza RON + bankonkénti nyitó valutában + árfolyam, forrás-badge, zárt-év lock);
- a webes egyenleg-számítás (initFinance carryover) már olvassa mindkét táblát, „rögzített nyitó VAGY előző évi záró" logikával.

**Hiányok és terv (A opció — minimál-invazív, javasolt):**
1. **Ajtók megnyitása:** a szerkesztő ma csak a `CongregationDialogV2` `advanced-edit` variánsában ül, amit semmi nem példányosít. Terv: (a) a setup-wizard pénzügy/bank paneljébe beemelni (az onboarding kanonikus felülete), (b) átvezető gomb a BankTab „Nyitó egyenleg még nincs rögzítve" kártyájáról és a CashbookTab nyitó-KPI mellől.
2. **„Csak egyszer, induláskor" guard:** zárt év már védett; + felülírás-megerősítés, ha az évre már van rögzített nyitó ÉS van könyvelt forgalom; admin-javítás a meglévő minták szerint. (A szerkesztő már most a legelső évet ajánlja defaultnak.)
3. **Desktop-fix:** `apps/desktop/src/pages/penzugy-page.tsx:258` — az aggregát egyenleg 0 nyitóval indul; a két nyitó-táblából kell számolnia (offline-fallback jelzéssel).
4. **Konszolidáció:** `packages/ui-app/src/finance/reporting.ts:389` (Registru Banca) a legacy `bankszamlak.nyito_egyenleg`-et preferálja → átállítás a per-éves táblára; a halott `bealitas.nyito_keszpenz/nyito_bank` írások kivezetése; a bankszámla-űrlap „Nyitó egyenleg" mezőjének átirányítása a per-éves táblába.
5. **RLS-bővítő SQL:** a két nyitó-táblán az írás-policy ma csak gyülekezeti scope — admin/kerületi-admin írási ág hozzáadása (külön futtatandó SQL).
- Diagnosztika: **D9–D10** (táblák léte, rögzített nyitók, legacy nem-nulla értékek).

---

## 5. FÁZISTERV (ág → PR → changelog → deploy fázisonként)

| Fázis | Tartalom | Fájl-gócok | Előfeltétel |
|-------|----------|-----------|-------------|
| **F0** | Diagnosztika-SQL futtatása (user) | `migration-docs/sql/2026-07-17-...-diagnosztika.sql` | — |
| **F1** | Tartozás-számítás P0/P1: F1-1 (szamadasicel-select + error-log), F1-2 (bealitas-szinkron), F1-3 (éves díjak → bealitas + halott kód törlés), F1-4 (stornó-szűrés), F1-5 (kedvezmenyes-átvitel), F1-6 (foglalkozás-%) | penzugy/actions.ts, congregation/actions.ts, tartozas-actions.ts, jarulek-calculation.ts, annual-fees-manager.tsx | F0 (D1 igazolás) |
| **F2** | Nyugta P0/P1: F2-1 (CSS-scope + portál), F2-2 (vízjel), F2-3 (fizetett év), F2-4 (kép-várakozás) | kartoteka.css, presentation-studio.tsx, chitanta-silent-print.tsx, chitanta-actions.ts, core auto-issue | Q3, Q4 |
| **F3** | Kísérőív: F3-1 (jogcím-név), F3-2 (PDF-stíluslap + margin), F3-3 (footer alulra), F3-4 (stornó), F3-5 (apró) | reporting.ts, print-engine-v2.ts, kiseroiv-print-dialog.tsx, TransactionsTab.tsx | Q1, Q2, Q5 |
| **F4** | Induló egyenlegek: ajtók + guard + desktop + Registru Banca + RLS-SQL | congregation-setup-wizard.tsx, BankTab/CashbookTab, desktop penzugy-page, reporting.ts + 1 SQL | D9 |
| **F5** | Kedvezmény-UI finomítás: F1-9 csomag (validációk, fix-RON kor-mód, sorrend-szöveg, revalidatePath), F1-7 döntés végrehajtása | fee-discounts-manager.tsx, congregation/actions.ts, yearly-settings-dialog.tsx | Q6, Q8 |
| **F6** | Desktop-paritás: 500-limit lapozás, TZ-fix, cache-purge, kettős számozás megszüntetése, webes árvák törlése | finance-sync.ts, finance-debt-sync.ts, jarulek-calculation.ts, desktop chitanta-page | Q9 |

Minden fázis: külön feature-ág `main`-ből → CHANGELOG (lelkész-barát) → PR → merge után következő fázis. Az F1–F3 egymástól független, párhuzamosan is PR-ozható; a sorrend a súlyosságot követi.

---

## 6. DÖNTÉSEK (user-válaszok, 2026-07-17) — mind BEÉPÍTVE a fázistervbe

| # | Kérdés | DÖNTÉS | Fázis |
|---|--------|--------|-------|
| Q1 | Kísérőív jogcím-oszlop | **Mindkét név** (magyar `nev` + román `nevro`) szerepeljen | F3 |
| Q2 | Jogcím-kód a név mellett | **Nem** — a kód nem jelenik meg | F3 |
| Q3 | Nyugta vízjel | **A „— másolat —" vízjel alapból RAJTA van, de egy kis X-szel eltüntethető** a nyomtatás előtt. + A háttér-címer egyházkerület-függő: Erdélyi Ref. Egyházkerület → `EREK.png`, Királyhágómelléki → `KEREK.png` (forrás: `congregations.district`; mindkét asset megvan a web+desktop public-ban) | F2 |
| Q4 | Fizetett év a „reprezentând" sorban | **Mindig** szerepeljen | F2 |
| Q5 | Több oldalas kísérőív aláírói | **Csak az utolsó oldal alján** | F3 |
| Q6 | `debtCalcMode` 'aktualis' | **Kivezetés** (UI-rádió el, minden út 'akkori' szerint, meglévő 'aktualis' sorok normalizálása SQL-lel) | F5 |
| Q7 | Családi befizetés | **Fel kell osztani a család tagjai közt** — „a család egyénekből áll, úgy is kell őket kezelni". Spec: a tisztán családi (`id_csalad`-os, `id_szemely` nélküli) tétel összege a család járulékköteles tagjai közt osztódik szét, determinisztikusan: minden tag a saját elvárt éves összegéig kap jóváírást (idősebb tag előbb), a maradék az utolsó tagra; a lista/összesítők így tagonként valós befizetettséget mutatnak | F5 |
| Q8 | 0 RON-os időszaki kedvezmény | **Tiltás** validációval (kedvOsszeg ≥ 1; a mentesítésre a felmentés / fix 0 való) | F5 |
| Q9 | Desktop Nyugta-oldal számozása | **Igen** — átállítás a tömb-alapú (`next_chitanta_full`) útra + a webes árva komponensek törlése | F6 |
| Q10 | Kísérőív köre | **Forrás-választó kerül a dialógus tetejére**: „Minden kiadás" / „Csak kassza" / bankszámlánként külön. **Minden forrásnak KÜLÖN, év elejétől számolt oldalszámozása van** (kasszás ívek külön sorozat, 1. bankszámla ívei külön sorozat stb.) | F3 |

### Q3 részletes terv (nyugta-nyomtatási UX átalakítás)
A „silent print" (kattintás → azonnal nyomtatási dialógus) helyett **mini nyomtatási előnézet** jelenik meg: a nyugta képe + jobb felül egy „— másolat —" jelvény kis X-szel (kattintásra a vízjel lekerül) + „Nyomtatás" gomb. Ez egyszerre oldja meg: (a) a vízjel-eltüntetést (Q3), (b) az EREK/KEREK címer garantált betöltését print előtt (F2-4 időzítési verseny), és (c) tiszta, `document.body` alá portálozott print-utat ad (F2-1 robusztusság). A címer-választás: `congregations.district` tartalmazza a „Királyhágó" szót → `/KEREK.png`, különben `/EREK.png` (default: EREK).

### Q10 részletes terv (kísérőív forrás-sorozatok)
- A kísérőív-dialógus tetejére választó: `Minden kiadás` (default) | `Kassza` | `<bankszámla neve>` (számlánként).
- Szűrés: kassza = `bankszamla_id IS NULL`; bankszámla = `bankszamla_id = X`; minden = nincs szűrés.
- Az éves `pg.`-számozás (expenseDayPageMap) **forrásonként külön** számolódik az év elejétől: a kiválasztott forrás kiadásos napjai rendezve, 1-től. A nyomtatvány fejlécében megjelenik a forrás megnevezése (pl. „Kassza", „BCR bankszámla"), hogy a sorozatok papíron is megkülönböztethetők legyenek.
- A stornó-szűrés (F3-4) a sorozat-számozásban is érvényesül.

**+ a user 4. észrevétele félbeszakadt („4. Ha…") — pótlásra vár; az új észrevételek külön fázisként épülnek majd be.**

### Diagnosztika-státusz — F0 LEZÁRVA (v2 teljes eredmény, 2026-07-17)

| Blokk | Eredmény | Következmény |
|-------|----------|--------------|
| D01 | A `szamadasicel`-nek **NINCS `kod` oszlopa** (oszlopok: id, nevro, nev, sorszam, …, szint) | **F1-1 P0 VÉGLEGESEN IGAZOLT** — a Tartozások befizetés-lekérdezése hibázott, paid=0 mindenkinél |
| D01b | a `jarulek_kedvezmeny.kezdet` oszlop él | a retry-fallback csak régi sémákhoz kell |
| D02 | „Teszt gyüli" 2026: congregations 220 ⇄ bealitas **100** — élő divergencia; a többi gyülekezetnek még nincs 2026-os bealitas sora | F1-2 igazolva; a javítás után a Beállítások-mentés szinkronizál |
| D03 | Összesen **2 kedvezmény-szabály** él (Teszt gyüli, idoszak 01-01→07-01, 160 RON) — **duplán rögzítve** (2 azonos sor); kor/foglalkozás-szabály NINCS | F1-6-nak nincs élő adat-érintettje; a duplikátum ártalmatlan (min-ár azonos), de takarítható: `DELETE FROM jarulek_kedvezmeny WHERE id='6ce32c31-5638-484a-985b-1510421ac7a7';` |
| D03b | nincs érvénytelen hónap-nap érték | F1-9 validáció megelőző jellegű |
| D04 | **Élő panel⇄motor eltérés**: 2025-re panel=130, motor=220 (Teszt gyüli + Barátosi); 2020–2024 paneldíjak (75/85/85/100/130) SOSEM hatottak (nincs bealitas sor) | F1-3 igazolva. Javítás után teendő: a panelen az érintett éveket ÚJRA KELL MENTENI (a „Régi rögzítés" jelölésű sorokat), 2025-nél eldöntve: 130 vagy 220 a helyes |
| D04b | a `congregation_annual_fees_unique (congregation_id, year)` constraint LÉTEZIK | az upsert nem bukik 42P10-zel |
| D05 | jelenleg NINCS stornózott befizetés/kiadás | F1-4 + F3-4 megelőző jellegű |
| D06 | ⚠️ 2025-re **470 ill. 469 befizetés** gyülekezetenként | a desktop 500-as pull-limitje KÜSZÖBÖN — az F6 lapozott pull sürgős |
| D07/D08 | összesen 1 kiállított nyugta; számozás-ütközés nincs | az F2-1 üres-nyomtatás kára minimális, de a funkció áll |
| D09 | **mindkét nyitó-tábla létezik élesben** (bankszamla + keszpenz) | F4-hez NEM kell migráció, csak UI-bekötés |
| D10 | 2025-ös bank-nyitók rögzítve (manual+import); 2026-ra nincs (fallback számol) | rendben |
| D10b | legacy `bankszamlak.nyito_egyenleg` = BCR **15 000** ≠ 0 | a Registru Banca ma ezt nyomtatja a per-éves érték helyett → F4 konszolidáció igazolva |

---

## 7. Elvetett gyanúk (az ellenőrző kör cáfolta)

- „A PDF-eltérés fő oka a dupla margó/kicsinyítés" — a margin [10,10] valós inkonzisztencia, de a fő ok a stíluslap-vesztés (F3-2).
- „initFinance selectje csonka, azért no-op a debtCalcMode" — a select rendben van; a no-op oka a `currentYear=year` hívási wiring (F1-7).
- „Friss gyülekezetnél a Tartozások nem látja a welcome-díjat" — a penzugy/page.tsx self-heal lefedi; csak elméleti maradék-eset (D2 ellenőrzi).
- „A dual A4 nyugta-layout magassága szűk" — számítással cáfolva (~30mm tartalék).
- Nyugta-adatfeltöltés, betűs összeg, kor-számítás (18 év, évkülönbség), %/RON fő-szemantika (kor+időszak ág), min-ár választás, felmentés-bekötés, v0.9.79 earned/attainable matematika — **átvizsgálva, helyes**.

## 8. Kockázatok

- Az F1-2/F1-3 díj-szinkron visszamenőleges hatású lehet: a bealitas-ba írás előtt a zárt/véglegesített évek védelmét be kell tartani, és a D4-es eltérés-lista alapján a user dönti el, mely évekre migráljunk értéket.
- A kartoteka.css print-blokk szűkítése a Presentation Studio nyomtatását is érinti → F2-ben a prezentáció-nyomtatás kézi ellenőrzése kötelező.
- A printToPdf-javítás az összes nyomtatványt érinti → F3-ban minimum a kísérőív + egy regiszter + egy Decont vizuális összevetése (előnézet vs PDF vs print).
