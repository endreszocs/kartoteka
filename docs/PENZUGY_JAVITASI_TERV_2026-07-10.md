# Kartotéka — Pénzügy modul javítási terv (webes verzió)

**Dátum:** 2026-07-10 · **Készítette:** feltárás + adversariális verifikáció (Opus) · **Implementálja:** Fable 5
**Hivatalos referencia-modell:** `C:\Users\endre\Documents\APPS\Egyházi APP\Adatkezelő-docs\össz\Adatok_2025.xlsx` (EREK v7.3b)
**Séma:** `migration-docs/Database_schema.sql` · **SQL-ellenőrzések:** `docs/penzugy-ellenorzo-sql.sql` (FUTTATANDÓ)

> **Megbízhatóság-jelölés:** `[KÓD]` = kódolvasással igazolt · `[ADV]` = adversariálisan (több ágens) igazolt · `[SQL]` = a valós adaton, SQL-lel igazolandó, mielőtt a javítás véglegesül.

---

## 0. Architektúra dióhéjban

- Route: `apps/web/app/(dashboard)/penzugy/page.tsx` → `initFinance(year)` (server action, `apps/web/app/(dashboard)/penzugy/actions.ts`) → `FinanceTabs` (`key={selectedYear}`, teljes remount év-váltáskor).
- Shell: `apps/web/components/finance/finance-tabs.tsx` (hero + fülek).
- A Budget/Accounting fülek vékony web-wrapperek; a **valódi UI** a `packages/ui-app/src/finance/{BudgetTab,AccountingTab,reporting,budget-reporting,helpers}.tsx/ts`-ben.
- Egyenleg-számítás: `packages/ui-app/src/finance/helpers.ts` → `calculateBalances`.
- Belső mozgás: `belsomozgas` mester-tábla (manuális web) **vs.** `befizetes`/`kiadas` pár + `belso_mozgas_xkey` (import).

**Hivatalos EREK-modell (Excel):** a számadás/költségvetés első 3 sora a NYITÓ egyenleg (Disponibil din anul precedent = előző évi záró → Casa/készpénz + Banca/bank); a belső mozgás **kinettózódik**, sosem tétel. A belső mozgás irányfüggő kóddal+címkével: `300.01`=„Készpénzfelvétel a(z) X számláról" (bank→kassza), `400.01`=„Készpénzletétel a(z) X számlára" (kassza→bank), X=bankszámla betűjele (A–F).

---

## #1 — A költségvetési év kiválasztása kerüljön szebb, egyértelműbb helyre

**Jelenlegi állapot** `[KÓD]`
- Az év-választó (`apps/web/components/finance/finance-year-selector.tsx`, teljes fájl 1–57) egy apró emerald **pill-chip** natív `<select>`-tel.
- A hero chip-sorában renderelődik (`finance-tabs.tsx:302`), a `flex flex-wrap gap-2` konténerben (`:297`), a gyülekezetnév-chip (`:298–301`) és a „Tartozásszámítás" chip (`:303–306`) + Oblio-chip (`:309`) közé ékelve → vizuálisan **megkülönböztethetetlen a nem-kattintható állapot-chipektől**.
- Év-átfolyás: `?year=` URL-param → `page.tsx:37–43` `selectedYear` → `key={selectedYear}` remount (`page.tsx:140`) → minden fül. Év-váltáskor `router.push(\`${pathname}?year=${y}${hash}\`)` **megőrzi a `#` hash-t** (aktív fül) (`finance-year-selector.tsx:40–45`).

**Gyökérok:** nem funkcionális hiba, hanem UX/affordancia: a vezérlő ugyanolyan pill, mint az info-chipek; nincs címke, nincs lépegetés, nincs kiemelt tipográfia. A hero jobb oldali „vezérlő" zónája (`:319–336`) csak akciógombokat tartalmaz.

**Javítási terv (ajánlott: dedikált, címkézett év-stepper):**
1. `finance-year-selector.tsx` átírása: pill-chip helyett **keretezett vezérlő-blokk** „Költségvetési év" mikro-címkével, `◄ nagy évszám ►` lépegetéssel (disabled a szélső éveknél) + opcionális legördülő a gyors ugráshoz. **Minden** navigáció ugyanazt hívja: `router.push(\`${pathname}?year=${y}${hash}\`)` a `window.location.hash` megőrzésével (a jelenlegi 40–45 logika). A prev/next generált évet a `[2000, realYear+1]` tartományra szorítsd (egyezés `page.tsx:41`-gyel); az alsó határt érdemes az `availableYears` legkisebb eleméhez kötni.
2. `finance-tabs.tsx`: a `<FinanceYearSelector/>` **kivétele a chip-sorból** (`:302`), és **áthelyezése a hero jobb oldali oszlopába** (`:319` div), az akciógombok **fölé** (`flex flex-col items-end gap-3`). A hash-sync effektek (`:173–212`) érintetlenek.

**NE módosítsd:** `page.tsx` validáció, `listFinanceYears`, a megosztott `packages/ui-app/src/finance/FinanceHero.tsx` (azt a **desktop** használja, statikus évvel — `apps/desktop/src/pages/penzugy-page.tsx:118`). A változás **web-only**.

**Kockázat:** a `#` hash megőrzése minden navigációnál kötelező (különben év-váltáskor visszaugrik a dashboard fülre); reszponzív: kis képernyőn nagyobb érintőfelület kell (a jelenlegi `text-xs/py-1.5` helyett). **Effort: kicsi–közepes.**

---

## #2 — Év eleji kezdő egyenlegek auto-kitöltése + előző évi számok szürkén, alternatívaként

**Jelenlegi állapot** `[KÓD]`
- **Nyitó egyenleg:** a `carryoverCash`/`carryoverBank` **már ki van számolva** szerveroldalon (`initFinance`, `actions.ts:946–977`: tárolt nyitó VAGY előző évi tárolt nyitó + előző évi nettó forgalom), és eljut a `page.tsx`-ig (`:151–152`), **de**:
  - a **Költségvetés** fülnek nincs átadva (`finance-tabs.tsx:551` csak `{szamadasiCellek, settings, currentYear}`-t ad át);
  - az **Accounting** fülnek sincs átadva (`finance-tabs.tsx:555–564`; `accounting-tab-v2.tsx:29–32` Omit; `AccountingTabProps`-ban nincs mező);
  - a hivatalos **3 nyitósor** sehol nem renderelődik; a nyomtatott számadásban a carryover „év végi" sorként (`budget-reporting.ts:485–498`) **félrecímkézve** jelenik meg (nyitó ≠ záró).
- **Előző évi referencia:** SEHOL nem jelenik meg előző évi szám. A Költségvetés „Előző" oszlopa (`BudgetTab.tsx:590–628`) csak az **ugyanazon évi előző módosítási kört** mutatja, nem az előző évet. Az `initFinance` az előző évet csak összegszinten tölti (`actions.ts:762–763` — nincs per-szamadasicel bontás).
- **Tárolás** (séma): `bealitas.nyito_keszpenz` / `nyito_bank` (évenként, `bealitas` PK = `(id=év, congregation_id)`); `bankszamla_nyito_egyenleg` tábla (per bankszámla+év, `forrasa` ∈ manual/import/carryover); a `koltsegvetes` táblában van **`osszeg_teny`** oszlop is.

**Hivatalos elvárás:** a számadás ÉS a költségvetés tetején 3 nyitósor (Disponibil din anul precedent = carryoverCash+carryoverBank; Casa=carryoverCash; Banca=carryoverBank), **automatikusan**, nem szerkeszthetően. Minden tételnél az **előző évi szám szürkén** referencia (a hivatalos „Prevederi inițial / Előző költségvetés" oszlop mintája).

**Javítási terv:**
1. **Nyitó props átvezetése:** `BudgetTabProps` + `AccountingTabProps` bővítése `carryoverCash`/`carryoverBank`-kal; `finance-tabs.tsx:551` és `:555–564` átadja (a propok ott már elérhetők); `accounting-tab-v2.tsx` Omit-lista frissítése; `budget-tab.tsx` Pick-típus bővítése.
2. **Nyitósorok renderelése:**
   - Élő: `BudgetTab.tsx` és `AccountingTab.tsx` tetején 3 soros, **nem szerkeszthető, nem mentett** nyitó-egyenleg blokk (Múlt évi pénztármaradvány / Casa / Banca). FONTOS: display-only, NE kerüljön a `budgetData`-ba / `koltsegvetes` táblába (a mentés `DELETE+INSERT` amúgy is kiejtené) → nincs felülírás-/dupla-számolás kockázat.
   - Nyomtatvány: `budget-reporting.ts` `buildSzamadasReport` (`:229`) a bevétel-szekció ELÉ 3 nyitósor; a `buildSzamadasExtraRows` (`:485–498`) **záró-blokk címkéjének helyesbítése** (a carryover a NYITÓ; a valódi év végi záró = nyitó + idei nettó, belső mozgás nélkül — a `calculateBalances` cashBalance/bankBalance adja).
3. **Előző évi szürke referencia (nagyobb, adat-plumbing):** új server action pl. `getPreviousYearActuals(year)` az `actions.ts`-ben, ami `year-1`-re a `befizetes`/`kiadas`-ból, `bevCelMap`/`kiaCelMap` alapján **per-szamadasicel-kód aggregál** (minta: `budget-print-dialog.tsx:63–101 computeActuals`), és `{ actualIncome, actualExpense }`-t ad. Bekötés a Budget/Accounting fülbe új callbackként; UI: `text-slate-400` „Előző évi tény" oszlop/placeholder minden sornál (üres cellánál a placeholder egy kattintással átvehető).

**SQL-gate** `[SQL]`: fut-e a `koltsegvetes.osszeg_teny` (Q12), vannak-e tárolt nyitók (Q9–Q11) → eldönti, hogy az előző évi tény új aggregálásból vagy tárolt mezőből jön.

**Nyitott döntés:** a szürke referencia az előző évi **SZÁMADÁS-TÉNY** legyen, vagy az előző évi **KÖLTSÉGVETÉS** (a hivatalos F-oszlop erre utal), vagy mindkettő? **A feladat a tényt kéri.** **Effort:** nyitósorok = közepes; előző évi referencia = nagy.

---

## #3 — Belső mozgás: hibás megjelenés a számadásban + hibás számolás + rossz címke

> Ez a pont **három külön hibát** takar. A user pontosítása: a helyes címke **irányfüggő** („letétel bankba" / „kivétel készpénzben"), nem a generikus „Belső mozgás — készpénz/banki"; és a **számolás** hibás.

### #3/A — A legacy „Belső mozgás" kategóriák beszivárognak a képernyős számadásba `[KÓD][ADV]`

**Gyökérok:** a belső-mozgás célok kódja `100.01/100.02` („Belső mozgás — készpénz/banki", `type='B'`) és `100.51/100.52` („Belső mozgás (készpénz)/(banki)", `type='K'`, kiadascel id=71/72). A **képernyős** cellaszűrő:
- `AccountingTab.tsx:128–142`: bevétel = `cell.id.startsWith('1') && cell.id !== '100'` — **type-guard nélkül**, és a `100.01/100.02` „1"-gyel kezdődik és ≠ „100" → **bennmarad** és sorként renderelődik (a `ComparisonTable` minden cellát mutat, `:466–521`).
- Tükör-hiba: `BudgetTab.tsx:129,136` — van type-guard, de **hiányzik a kód-prefix** → a `type='B'` 3xx és `type='K'` 4xx/100.5x szivárog.
- A **nyomtatvány már tiszta**: `budget-reporting.ts:410–415` kombinált szűrőt (`c.type==='B' && c.id.startsWith('1') && c.id!=='100'` / `c.type==='K' && c.id.startsWith('2')`) használ.

**Miért „korábban javítottuk, mégis megvan":** a `7edc11aa` (2026-06-06) javítás CSAK a nyomtatványra (`budget-reporting.ts`) került rá; a képernyős `AccountingTab`-ot nem érintette. Ugyanaznap a `94395f12` eltávolította a `budget===0 && actual===0 → return null` sort → az üres legacy sorok újra láthatóvá váltak.

**Javítási terv:**
1. `AccountingTab.tsx:128–142`: a nyomtatvány kombinált szűrőjének tükrözése — bevétel elé `cell.type === 'B' &&`, kiadás elé `cell.type === 'K' &&`. **Robusztus alternatíva:** a `szamadasicel.belsotetel` flag használata (a sémában létező mező!) vagy `!/^(100|[34])/.test(cell.id)` — így jövőbeli félrekódolt belső mozgás sem szivárog.
2. `BudgetTab.tsx:129,136`: a hiányzó kód-prefix guard hozzáadása (`startsWith('1') && !=='100'` / `startsWith('2')`).
3. Verifikáció: a **záró egyenleg NEM változhat** (a `calculateBalances` külön, `belsotetel`-független); csak a `totalActualIncome` és a nyomtatott/képernyős tétel-lista veszti el a 100.xx sorokat.

**SQL-gate** `[SQL]`: Q1/Q2/Q5 — léteznek-e aktív 100.xx cél-ok és valós tételek velük.

### #3/B — A számolás hibás: a webről rögzített belső mozgás nem mozgatja a kassza/bank egyenleget `[KÓD][ADV: 3/3 ágens CONFIRMED, a refutáló sem tudta megcáfolni]`

**Gyökérok (megerősítve):**
- A **webes** belső-mozgás rögzítés (mind a 4 dialógus: combined-entry, income-v3, expense-v2, internal-transfer → `onSaveInternalTransfer` → `actions.ts:2491 saveInternalTransfer`) **KIZÁRÓLAG a `belsomozgas` mester-táblába ír** (`:2510`), befizetes/kiadas sort **NEM** hoz létre. A combined-entry a belső-mozgás sort `pushTransfer`-rel a `transfers[]`-be teszi és `continue`-zik (`CombinedEntryBody.tsx:774–786, 852–855`) — az income/expense batch-be **semmi** nem kerül.
- A megjelenített kassza/bank egyenleget a `calculateBalances` (`helpers.ts:188–235`) számolja, **kizárólag befizetes/kiadas sorokból**; az `initFinance` a `belsomozgas` mestert `internalTransfers` néven **külön tömbként** adja vissza, **merge nélkül** (`actions.ts:1116–1120`). A `calculateBalances` hívása (`finance-tabs.tsx:134–135`) NEM kapja meg az `internalTransfers`-t.
- Az `internalTransfers` a kliensen egyedül a `MonetaryTab`-ba jut, ott is csak FX (valutacsere) szűréshez + „utolsó 4 mozgás" listához.

**Következmény:** egy webről rögzített **„letétel bankba"** után a **kassza NEM csökken és a bank NEM nő** — a mozgás az egyenleg szempontjából **no-op**. A hero, a Kassza-fül záró egyenlege, a Bank-fül és a Monetáris fül `expectedCashBalance` mind hibás. Ezzel szemben az **importált** belső mozgás (`import-transactions.ts:560–720`: befizetes+kiadas pár 300/301/400/401 kóddal + `belso_mozgas_xkey` + helyes `bankszamla_id`) **helyesen** mozgatja az egyenleget. → **Ugyanaz a művelet a rögzítés útjától függően más egyenleget ad (aszimmetria).** A desktop is érintett (`apps/desktop/src/pages/penzugy-page.tsx:230–231` ugyanazt a `calculateBalances`-t hívja).

**Kapcsolódó, szintén igazolt inkonzisztenciák:**
- **Törlési aszimmetria:** a manuálisan rögzített transzferhez a `softDeleteInternalTransferAction` (`belsomozgas-actions.ts:81`) **sehonnan nincs meghívva** → a webes belső mozgás **nem törölhető**. Az importált transzfer törlése (`actions.ts:1622–1638`) az xkey-párt törli, de a `belsomozgas` audit sort nem (orphan).
- **Valutacsere RON-oldal:** a `valutacsere` csak a `belsomozgas`-ba ír; a `calculateBankCurrencyBalance` (`bank-balance.ts:70–76`) növeli a cél deviza-egyenleget, de a RON forrás-bankszámla dashboard-egyenlegét semmi nem csökkenti (nincs kiadas sor).
- **100.xx a totálban:** az `internalCelIds` (`finance-tabs.tsx:122–132`) és a `reporting.ts:774 isInternal` csak `/^[34]/`-re szűr → egy `100.xx` kódú, `xkey` nélküli befizetes/kiadas a `totalIncome/Expense`-be **beszámít** ÉS tételként megjelenik (torzítja a totált).

**Javítási opciók (a fix a data-tól függ — lásd SQL-gate):**
- **(a) Minimális:** a `calculateBalances`-t bővíteni egy `internalTransfers` paraméterrel: `kassza_bank` → kassza−, bank+; `bank_kassza` → kassza+, bank−; `valutacsere`/`bank_bank` NE itt (double-count!). Hívás: `finance-tabs.tsx:135` + desktop `penzugy-page.tsx:230`. **Előny:** kicsi diff, nincs migráció. **Hátrány:** a hivatalos Registru Casa/Banca nyomtatvány **továbbra is hiányos marad** (income/expense-ből épül), és a képernyő/nyomtatvány eltérhet.
- **(b/c) Kanonikus / egységesítés (ajánlott végállapot):** a `saveInternalTransfer` hozzon létre **befizetes/kiadas párt** (letétel: kassza-kiadás `400.01` + bank-bevétel `301.01`; felvétel: bank-kiadás `401.01` + kassza-bevétel `300.01`) közös `belso_mozgas_xkey`-vel, pontosan az import mintájára (`import-transactions.ts:560–720`); a `belsomozgas` mester CSAK `valutacsere`/`bank_bank` célra marad. **Előny:** a `calculateBalances`, az összes nyomtatvány és a carryover **automatikusan** helyes; egyezik a kód dokumentált szándékával (`CombinedEntryBody.tsx:42–47`) és az EREK-modellel. **Hátrány:** a meglévő `belsomozgas` mester kassza_bank/bank_kassza sorokat **migrálni** kell párokká (idempotens backfill, xkey-egyediség), különben a historikus záró egyenlegek elcsúsznak.

> **⚠️ Double-count veszély:** ha bármelyik fix bevezetése után egy mozgás párként ÉS mesterként is létezik, kétszer számít. Az (a) opciónál a `valutacsere`-t explicit ki kell hagyni; a (b/c)-nél a migrációnak dedup-olnia kell (dátum+összeg / xkey), és az import audit-`belsomozgas`-t is kezelni.

> **✅ DÖNTÉS (D4 = üres `belsomozgas` mester alapján): a (b) opció — a `saveInternalTransfer` (`actions.ts:2491`) hozzon létre befizetes/kiadas PÁRT** (letétel: kassza-kiadás `400.01` + bank-bevétel `301.01`; felvétel: bank-kiadás `401.01` + kassza-bevétel `300.01`) **közös `belso_mozgas_xkey`-vel**, pontosan az import kanonikus modellje szerint (`import-transactions.ts:562–702`). **Nincs adat-migráció** a mester-táblához (üres). Előny: a `calculateBalances`, a számadás, a nyomtatványok és a carryover **automatikusan** helyes lesz web-rögzítésnél is; egyetlen reprezentáció (befizetes/kiadas pár) minden úton. A `belsomozgas` mester maradhat CSAK `valutacsere`/`bank_bank` célra (azok deviza/RON-oldala külön kezelendő). Double-count nincs, mert a mester üres és nem lesz balansz-forrás. Ezt **együtt** kell csinálni a #3/D közös-xkey javítással.

### #3/C — Irányfüggő címkézés `[KÓD]`

**Jelenlegi:** a `belsomozgas.megjegyzes` generikus és számla-betű nélküli (`CombinedEntryBody.tsx:776–778`: „Készpénzletétel a bankba" / „Készpénzfelvétel a bankból"), miközben a UI dropdown már irány+számla-nevet mutat (`:438–454`). Az import nyers banki description-t tesz (`import-transactions.ts:609–690`). A legacy cél-nevek: „Belső mozgás — készpénz/banki".

**Hivatalos elvárás:** „**Készpénzletétel a(z) `<bank_neve>` számlára**" (*Depunere numerar din casă*) és „**Készpénzfelvétel a(z) `<bank_neve>` számláról**" (*Ridicare numerar*) — irány + konkrét bankszámla.

**Terv:** a pár/mester megjegyzését a dropdown-logikával (`CombinedEntryBody.tsx:438–454`) azonosan generálni; az import-oldalon normalizált irány+számla címke a belső párokra; a legacy 100.xx kódok **nyugdíjazása** (átkódolás 300/301/400/401-re + `belso_mozgas_xkey`).

**SQL-gate a teljes #3-hoz** `[SQL]`: Q1–Q8 — léteznek-e webes `belsomozgas` mester-rekordok (a #3/B backfill mérete), van-e xkey a 100.xx sorokon, lefutott-e a `2026-06-11e` takarítás. **Ezek döntik el a fix-opció (a) vs (b/c) választását és a migráció méretét.**

**Effort:** #3/A = kicsi (2 szűrő-edit); #3/B = közepes–nagy (opciótól függ); #3/C = kicsi.

### #3/D — A belső mozgás két oldala nincs közös xkey-vel összekötve (`teljes_par = 0`) `[SQL-igazolt: D5/D6] [KÓD]`

**Tény (D5/D6):** 32 belső-mozgás xkey, **0 teljes pár** — minden sornak külön xkey-e van (16 „csak kassza" + 16 „csak bank"). Az összegek egyeznek (a bank-oldali pár létezik, a balansz helyes), de a `belso_mozgas_xkey` **nem linkeli** a két oldalt.

**Gyökérok:** az import aktív-párosítása (`import-transactions.ts:562–702`) elvileg megosztja az xkey-t: `findUnpairedCashCounterpart` (`:208–239`) megkeresi a párosítatlan kassza-oldali sort **azonos oldal+összeg+dátum** alapján, és annak xkey-ét újrahasználja (`:585–601`), a counterpartot pedig kihagyja (`:665`). Ez a gyülekezet adatán **egyszer sem futott le** → valószínűleg a kassza- és bank-oldal **eltérő dátummal** érkezett (a `findUnpairedCashCounterpart` a dátum/összeg egyezésre támaszkodik), vagy a két oldal külön importból/kézi rögzítésből származott, így minden sor a saját `generateBelsoMozgasXkey()` xkey-ét kapta (`:583`).

**Következmény (kód-igazolt):** a `deleteTransaction` (`actions.ts:1622–1638`) a `belso_mozgas_xkey` szerint törli a párt → **külön xkey esetén csak az egyik oldal törlődik → árva sor** (a kassza vagy a bank egyenleg elcsúszik). Emellett a „párosítva" státusz (ÚJ #1) egy törékeny összeg+dátum heurisztikára szorul.

**Javítási terv:**
1. **Párosítási matcher lazítása** a `findUnpairedCashCounterpart`-ban (`import-transactions.ts:208–239`): a dátum-egyezés helyett **dátum-ablak** (pl. ±7 nap, mint a health-matcher `PAIRING_WINDOW_DAYS`), hogy a bank-oldal a néhány nappal korábbi/későbbi kassza-oldalhoz kösse magát (közös xkey).
2. **Backfill/reconcile a meglévő 32 sorra:** egy egyszeri szerver-action/SQL, ami az azonos összegű, ellentétes oldalú (kassza↔bank), közeli dátumú, párosítatlan sorokat egyetlen közös xkey alá vonja (a kisebb oldal xkey-ét a másikra írja). Ezután a `teljes_par` a valós számot mutatja.
3. **Törlés-robusztusság:** amíg nincs közös xkey, a `deleteTransaction` az összeg+dátum-párt is vegye figyelembe (vagy figyelmeztessen árva sorra).

**Kockázat:** a matcher-lazítás téves párosítást adhat azonos összegű, közeli dátumú, de eltérő mozgásoknál — a backfillt előbb **dry-run**-ban listázni (mit kötne össze), csak jóváhagyás után írni. **Effort:** közepes (backfill + import-matcher).

---

## #4 — A beküldő funkció szabályos, helyes működésének ellenőrzése

**Jelenlegi állapot** `[KÓD][ADV]`: az alapfolyamat (`submitDocument` → `document_submissions`) működik, és a jogosultság/scope **szerveroldalon helyes** (`congregation_id` a szerverből, RLS véd). **De 4 valódi hiba:**

1. **Snapshot-duplikáció** `[KÓD]`: a diocese-nak küldött snapshot (`AccountingTab.tsx:200–209 summary`, **kód-kulcs**, leaf-szűrt) és a lokálisan tárolt `bealitas.szamadas_zaro_adatok` (`finalizeAccounting`, `actions.ts:2295–2405`, **INT-kulcs**, szűretlen) **két külön kódúton, eltérő szabállyal** készül → eltérő alak/összeg lehet.
2. **Nem idempotens újra-beküldés** `[KÓD][SQL]`: a `document_submissions` egyedi index a `(congregation_id, year, document_type, modification_number)`-en, ahol a `modification_number` **nullable** és (feltehetően) nincs `NULLS NOT DISTINCT`. Postgresben NULL≠NULL → szamadas/base koltsegvetes (`modification_number=null`) esetén minden újra-beküldés **ÚJ sort szúr be** (duplikátum).
3. **A finalize-zár nem tiltja az új tétel rögzítését** `[KÓD]`: az edit/stornó ellenőrzi az `isYearFinalized`-et (`edit-storno-actions.ts:140,253,335`), de a `saveIncome`/`saveExpense`/`saveIncomeBatch`/`saveExpenseBatch` (`actions.ts:1327,1410,1522,1562`) **NEM** → véglegesített évhez új tétel rögzíthető, a beküldött snapshot csendben elévül.
4. **Nem atomi** `[KÓD]`: a `submitDocument` és a `finalizeAccounting`/`finalizeBudget` két külön, nem tranzakcionális hívás.
   *(+ az egyházmegye a beküldött számadás/költségvetés SZÁMAIT sehol nem jeleníti meg — a beküldött adat gyakorlatilag write-only.)*

**Javítási terv (fázisolható, gyorsnyeremények előre):**
1. **Idempotencia (kicsi, nagy hatás):** `document_submissions_unique` → `NULLS NOT DISTINCT` (Postgres 17.6 → támogatott), VAGY `modification_number NOT NULL DEFAULT 0` + backfill. **Előbb dedup** a meglévő duplikátumokra (SQL Q13/Q15).
2. **Snapshot-egységesítés:** a `finalizeAccounting` ugyanazt a kanonikus számítást használja, mint a diocese-facing snapshot (kód-kulcs + leaf/gyülekezet-szint + belső mozgás kizárás), a hivatalos 3 nyitósor + 113/114/115 záróval kiegészítve → a lokális PDF, a beküldött adat és a fül képe **bit-azonos**.
3. **Create-path zár:** `saveIncome`/`saveExpense`/batch-ek elé `isYearFinalized`-guard (ugyanaz a minta, mint `edit-storno-actions.ts:140`). Egyeztetni, hogy a zár a lelkészi véglegesítéskor vagy az egyházmegyei elfogadáskor lép-e életbe.
4. **Atomicitás:** a lock fusson előbb, a submit utána; ideálisan egy szerveroldali RPC/tranzakció.
5. **(opció) Diocese-megjelenítés + állapotgép:** a snapshot számainak renderelése az egyházmegyei nézetben; az `approveUnlockRequest` a `document_submissions` státuszt is állítsa vissza (verziózott re-finalize).

**SQL-gate** `[SQL]`: Q13 (duplikátumok), Q14/Q16 (snapshot alak), Q15 (index). **Effort:** idempotencia+create-zár = kicsi; snapshot-egységesítés = közepes; atomicitás+diocese-nézet = nagy.

---

## SQL-ellenőrzések (FUTTATANDÓ a valós adaton — `docs/penzugy-ellenorzo-sql.sql`)

| Query | Mit dönt el | Érinti |
|---|---|---|
| Q1–Q2 | Milyen belső-mozgás kódok/cél-ok léteznek, aktívak-e, `belsotetel` flag | #3/A |
| Q3–Q5 | Van-e valós befizetes/kiadas 100.xx kóddal (xkey nélkül) → totál-torzítás + tétel-szivárgás | #3/A, #3/B |
| Q6–Q8 | Hány webes `belsomozgas` mester-rekord van (backfill mérete) + „money conservation" próba | #3/B |
| Q9–Q12 | Nyitó egyenleg táblák léte + `bealitas.nyito_*` + `koltsegvetes.osszeg_teny` | #2 |
| Q13–Q16 | `document_submissions` duplikátumok + index + snapshot-alak | #4 |

**A #3/B fix-opció (a) vs (b/c) választása és a #4 dedup a Q6–Q8 / Q13 eredményein múlik — ezek futtatása kötelező a végleges terv előtt.**

---

## Ajánlott implementációs sorrend (Fable 5)

1. **SQL futtatása** (Q1–Q16) → a data-függő döntések rögzítése.
2. **Gyorsnyeremények:** #1 (év-választó), #3/A (szűrő-fix, 2 sor), #4/1 (idempotencia + dedup), #4/3 (create-zár).
3. **Közepes:** #2 nyitósorok + záró-címke, #3/C címkézés, #4/2 snapshot-egységesítés.
4. **Nagy:** #3/B számolás-egységesítés (a data szerint (a) vagy (b/c) + migráció), #2 előző évi referencia-oszlop, #4/5 diocese-nézet + állapotgép.

**Minden lépés után:** typecheck + lint + test + **build** VALÓDI kilépőkóddal (nem `| tail -1`).

---

# B. RÉSZ — További 11 észrevétel (2026-07-10)

> Kód-térképezve (A–D klaszter workflow + #10/#11 közvetlen olvasás). `[KÓD]` = kódolvasással igazolt.
> **SQL-eredmény (D9 + D10, a felhasználó futtatta) — KORRIGÁLVA:**
> - A belső mozgás MINDKÉT oldala megvan befizetes/kiadas-ként: **15 LETÉTEL** = kassza-kiadás `400.01` (−87 855) + bank-bevétel `301.01` (+87 855, bankszamla_id=1); **1 FELVÉTEL** = kassza-bevétel `300.01` (+200) + bank-kiadás `401.01` (−200). Tehát az **import-úton** rögzített belső mozgások TELJESEN reprezentáltak (kassza− ÉS bank+ is) → az egyenleg **ezekre helyes**. *(Ez helyesbíti a korábbi „15 letétel bank-pár nélkül" állítást, ami egy részleges lekérdezésen alapult.)*
> - **`100.xx` valós tétel: 0** → a #3/A tisztán szűrő-javítás, adat-migráció nélkül.
> - **D10:** 4 bankszámla, ebből 1 **EUR** (`id=2 "BCR - Eurós számla"`) → ÚJ #10 releváns.
> - **D5/D6 — ÚJ, FONTOS: az xkey-párosítás TÖRÖTT.** 32 belső-mozgás xkey, ebből **`teljes_par = 0`** — minden sornak SAJÁT, egyedi xkey-e van (16 „csak kassza", 16 „csak bank"). A két oldal LÉTEZIK (a balansz helyes), **de NINCS közös xkey-vel összekötve**. A „várakozó 88 055 RON" ezért **NEM balansz-hiány**, hanem az xkey-párosítás hiánya (a bank-oldali párok külön xkey alatt vannak). Következmény: (a) az xkey szerinti **törlés csak az egyik oldalt törli → árva sor**; (b) a „párosítva" státusz nem az xkey-ből jön, hanem egy törékeny összeg+dátum heurisztikából; (c) az export stale szöveget mutat. → lásd **ÚJ #1** és az új **#3/D**.
> - **D4 — a `belsomozgas` mester-tábla ÜRES (0 sor).** Tehát **NINCS** webről rögzített belső mozgás, ami kimaradna az egyenlegből → a **#3/B jelenleg 0 adathatású**, a balansz teljesen helyes. A #3/B kód-hiba viszont **latens**: az első webről rögzített belső mozgás (`saveInternalTransfer` → üres mester-tábla) azonnal kimaradna a kassza/bank egyenlegből. **Nincs több nyitott SQL — a #3 adat-oldalról lezárva.**

## Kassza fül + export

### ÚJ #1 — „Párosítva" a fülön, de az export „⏳ Várakozik banki egyeztetésre" `[KÓD] + [SQL-igazolt: a bank-pár LÉTEZIK → az export szövege STALE]`
- **SQL-igazolt (D9):** a 15 letétel bank-oldali párja (`301.01`, 15 db, 87 855 RON, számla 1) **létezik** → a mozgás valójában **párosított**, mégis az export „várakozik banki egyeztetésre"-t ír. Tehát a hiba: **elavult (stale) statikus szöveg** az exportban, nem tényleges párosítatlanság.
- **Jelenlegi:** a Kassza fül **élőben** számolt státuszt mutat (`CashbookTab.tsx:975–983, 1030–1038`; `r.unpaired`), az export viszont a **rögzítéskor beégetett statikus** szöveget (`item-builder.ts:153`) — két igazságforrás, és a beégetett szöveg a banki pár beérkezése után **sem frissül**. Ráadásul a párosító matcher (`internal-movement-health.ts:83–99`) csak **összeg+dátum** alapján párosít (oldal/irány nélkül) → **téves** pozitív/negatív is előfordulhat (a D5/D6 xkey-eredmény igazolja).
- **Fix:** (1) a matcher csak ELLENTÉTES kassza/bank oldalt fogadjon el párnak (`bankszamla_id` NULL vs NOT NULL) — `internal-movement-health.ts:22–29, 83–129` + a `bankszamla_id` átadása `finance-tabs.tsx:279`-nél; (2) az export BM-soroknál az **élő státuszt** írja, ne a nyers `r.megjegyzes`-t — `CashbookTab.tsx:544–559`. **Effort: közepes.**

### ÚJ #2 — Export dátum szerint NÖVEKVŐ (év eleje → vége) `[KÓD]`
- **Jelenlegi:** az export a fül UI-rendezését örökli (alapból DESC, `CashbookTab.tsx:225–226`). A Registru PDF-ek már növekvők (`reporting.ts:304,385,477`).
- **Fix:** a `buildExport` egy növekvő dátum-**másolaton** hívja a `buildFinanceExportAoa`-t — `CashbookTab.tsx:544–559`, `BankTab.tsx:585–599`, `TransactionsTab.tsx:341–355`; vagy központilag a `finance-export.ts:54–73`-ban. **Effort: kicsi.**

### ÚJ #3 — „Kerületi / Irat sz." — a gyülekezeti (saját) szám legyen a FŐ `[KÓD]`
- **Jelenlegi:** `CashbookTab.tsx:956–966` a **kerületi** számot (nagy, pl. 115024) mutatja főként, a **gyülekezetit** (24) al-sorként — fordítva.
- **Fix:** cseréld a render fő/al értékét (`CashbookTab.tsx:956–966`: fő = `r.gyulekezetiSzam || r.iratszam`, al = „Ker. sz.: {iratszam}"); fejléc `:735` → „Irat sz. / Kerületi". **Csak megjelenítés** (adat/sort/export nem változik). **Effort: kicsi.**

## Hiányzó nyugták — Decont de încasări modal

### ÚJ #4 — Nyugtánként több személy/CSALÁD, nyugtánként külön jogcím, opcionális tag, jobb keresés `[KÓD]`
- **A modal:** `apps/web/components/modals/dispozitie-incasare-wizard.tsx` (NEM a DecontTabBody). **Már működik:** több befizető soronként (`:256–260, 455–463`), opcionális tag (nem-tag is adhat, `Payer.id: number|null`, `:279`). **HIÁNYZIK:** soronkénti jogcím (most egy közös `categoryId`, `:226, 323`); **család** (`id_csalad`) a UI-ban.
- **Fix:** `Row`-ba soronkénti `categoryId` + kompakt jogcím-select (`:400–423`, alap = közös); `handleSave` a sor saját kategóriáját vegye (`:308–350`); `Payer`-be `kind:'person'|'family'` + `id_csalad` (a `CombinedEntryBody` család→tagok mintája); a keresőbe családok (`searchFamilies`, `actions.ts:1892–1930`) + jobb személykeresés (`searchMembersForFinance`, `:1808–1824`). **A séma és a `saveIncomeBatch` már kész** (`actions.ts:1522–1560`, soronkénti kategória+tag+család). **Effort: közepes–nagy (csak UI).**

### ÚJ #5 — Zöld háttér az előnézet egyházközség-név során `[KÓD]`
- **Jelenlegi:** `official-documents.ts:331` `.unit-band { background: #e7f3e7 }` (halványzöld) a Decont de încasări sablonban (render `:354`).
- **Fix:** töröld a `background`-ot (vagy `#fff`) a `:331` szabályban; a keret maradhat. **Effort: XS (1 property).**

## Nyugtafigyelő

### ÚJ #6 — Sorszám-folytonosság ellenőrzés ÉVHATÁRON ÁT `[KÓD]`
- **Jelenlegi:** a `computeReceiptHealth` (`actions.ts:163–287`) csak a kiválasztott év adatát látja (a lekérdezés évre szűr, `:759`), és csak az **éven belüli** min–max Irat sz. között keres hézagot (`:234–242`). A gyülekezeti Irat sz. viszont **évhatáron át folytonos** (a kód kommentje is rögzíti, `:230–233`) → a határon átlógó hézag egyik év nézetéből sem látszik.
- **Fix:** horgony = a KÖVETKEZŐ év első (legkisebb Irat sz.) készpénzes nyugtája: plusz next-évi lekérdezés (`~759`), a numberedRows-lánc kiemelése segédfüggvénybe (`:164–196`), a felső korlát feltételes kiterjesztése (`:242`), interpolációs szomszéd (`:245–261`), UI-szöveg (`finance-tabs.tsx:350–351`). **Egyoldalú (csak felső) horgony** a dupla-jelzés/könyvelés ellen. **Effort: közepes.**

## Tranzakciók + kiadási kísérőív

### ÚJ #7 — Kísérőív „Kasszakönyv" → „Registrul-Jurnal" + pixelpontos, scroll-mentes előnézet `[KÓD]`
- **Jelenlegi:** `reporting.ts:590` fixen „Kasszakönyv", de a bizonylat **kp+banki** kiadást is tartalmaz (`TransactionsTab.tsx:370–372` nem szűr oldalra) → félrevezető. Az előnézet nem skálázódik (`kiseroiv-print-dialog.tsx:130–134` fix `h-[78vh]` iframe).
- **Fix:** (a) felirat → „Registrul-Jurnal" (`reporting.ts:590`; a nagy cím marad „Kiadási kísérőív"); (b) az előnézet vegye át a **már működő** fit-to-width skálázást (`FinancePrintDialogBody.tsx:194–263`: ResizeObserver + `transform: scale`) a `kiseroiv-print-dialog.tsx:127–136`-ba → teljes A4-lap, scroll nélkül, konténerre kicsinyítve. A nyomtatott kimenet nem változik. **Effort: közepes.**

### ÚJ #8 — Készpénz/banki jelleg + bankszámla neve a Tranzakciók listában `[KÓD]`
- **Jelenlegi:** a `bankszamla_id` a soron van (`types.ts:331–332, 386–387`; NULL = készpénz), de a `UnifiedRow` nem viszi tovább (`TransactionsTab.tsx:136–153`), és a `bankAccounts` lista **nem prop** (a szülőben elérhető, `finance-tabs.tsx:525` a BankTab-nak átadja).
- **Fix:** `TransactionsTabProps` + `bankAccounts` prop; `UnifiedRow.bankszamlaId`; `Map<id, BankAccount>` név-feloldó; chip/oszlop a renderben (kp = zöld chip, banki = bank-ikon + `bank_neve`) — `TransactionsTab.tsx:72–153, 274–311, 494–538, 573–673`. Prop-átadás 4 hívónál (2 web: `transactions-tab.tsx`, `finance-tabs.tsx:490–499`; 2 desktop — a desktop tranzakció-oldal jelenleg nem is tölti be a bankszámlákat). **Effort: közepes.**

### ÚJ #9 — Bevétel/kiadás átlátható, kétoszlopos (kassza-szerű) elrendezés `[KÓD]`
- **Jelenlegi:** egy közös „Összeg" oszlop +/− előjellel + színnel (`TransactionsTab.tsx:509–511, 629–636`); a Kassza/Bank külön Bevétel/Kiadás oszlopokat használ (`CashbookTab.tsx:766, 775`).
- **Fix:** a Tranzakciók fejléc+sor kétoszlopossá (Bevétel | Kiadás; egy tétel csak a saját oszlopában), colSpan +1 (`TransactionsTab.tsx:494–538, 553, 629–636`), a `CashbookTab` mintája alapján. **Effort: kicsi–közepes.**

## Bank FX + e-Factura

### ÚJ #10 — Deviza-import: MINDIG az ADOTT NAPI árfolyammal RON-ra `[KÓD]`
- **Jelenlegi:** a bank-import `computeOsszegRon` (`import-transactions.ts:391–400`) **egyetlen ÉVES árfolyamot** használ bankszámlánként (`bankszamla_nyito_egyenleg.arfolyam`, betöltés `:366–387`) → `osszeg_ron = |amount| * évesArfolyam`. **Nem** a tranzakció napjának árfolyama. A napi historikus árfolyam-lekérő **MÁR létezik és robusztus:** `bnr-exchange-rate.ts fetchBnrRates(targetDate)` (BNR napi/éves XML + Frankfurter/ECB fallback, ünnep/hétvége kezelés), de az importba **nincs bekötve** (csak az FX-átértékelés dialógus hívja, `actions.ts:2778`).
- **SQL-igazolt (D10):** van valós deviza-számla → `bankszamlak.id=2, "BCR - Eurós számla", valuta=EUR, aktív`. A másik 3 (BCR, Banca Comerciala Romana, Teszt) RON. Tehát a napi árfolyamos átszámítás **élesben számít** az EUR-számlánál.
- **Fix:** a `computeOsszegRon`-ban a `(bankszamla_id, év)` éves kulcs helyett a tranzakció **DÁTUMA** szerinti napi árfolyam: az import-flow gyűjtse az egyedi dátumokat, `fetchBnrRates(datum)`-mal töltsön egy dátum→árfolyam Map-et (deviza-számláknál), és `osszeg_ron = |amount| * napiArfolyam`, `arfolyam = napiArfolyam`. Hibakezelés: ha az adott napra nincs árfolyam, essen vissza az éves/manuális értékre + jelezze a UI-ban. Files: `import-transactions.ts:349–400`, `bnr-exchange-rate.ts`, a bank-import server action + wizard. **Effort: közepes.** RON-számláknál változatlan (`arfolyam=1`).

### ÚJ #11 — e-Factura (Oblio) ellenőrző javítása/fejlesztése — KÜLÖN Fable-terv `[csak jelölés]`
- **Jelenlegi:** kiterjedt Oblio e-Factura ellenőrző rendszer — `packages/ui-app/src/finance/oblio/OblioEllenorzesTab.tsx` (1784 sor); `apps/web/app/(dashboard)/penzugy/oblio-ellenorzes-actions.ts` (649 sor: `listOblioMatchesAndKiadasok`, `saveOblioMatch`, `removeOblioMatch`, `bulkSaveOblioMatches`, `updateKiadasCui`, `recordOblioDownloadNow`, `createKiadasFromXmlAndMatch`, `checkOblioDeadline`); matcher/parser: `apps/web/lib/finance/oblio/*`. Az ANAF e-Factura XML-számlákat párosítja a kiadás-tételekhez.
- **Teendő:** ez **külön, dedikált tervet igényel Fable-től** (a felhasználó most csak jelölni kérte). A jövőbeli terv fedje le: a párosítási pontosságot, a hiányzó/nem-párosított számlák kezelését, a letöltés/határidő-figyelést és a UX-et.

---

## Frissített prioritás (a 11 új ponttal)

- **XS/kicsi, azonnali:** ÚJ #5 (zöld háttér), ÚJ #3 (Irat sz. sorrend), ÚJ #2 (export rendezés), #3/A (szűrő-fix).
- **Kicsi–közepes:** ÚJ #9 (tranzakció kétoszlop), ÚJ #8 (kp/banki jelző), ÚJ #7 (kísérőív felirat+előnézet), #1 (év-választó), #4/1 (idempotencia).
- **Közepes:** ÚJ #1 (párosítás-státusz + matcher), ÚJ #6 (nyugta évhatár), ÚJ #10 (deviza napi árfolyam), ÚJ #4 (Decont rugalmasság), #2 (nyitósorok).
- **Nagy / külön terv:** #3/B (belső mozgás számolás — SQL-függő), #2 előző évi referencia, #4/5 (beküldő diocese-nézet), **ÚJ #11 (e-Factura — külön Fable-terv).**
