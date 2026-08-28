# Pénzügy — teendőlista (2026-08-27-i átvilágítás nyomán)

Ez a lista a `docs/PENZUGY-ATVILAGITAS-2026-08-27.md` diagnosztika **végrehajtási**
párja. Minden tételnél jelölve, hogy **mire támaszkodik** és **mi a státusza**.

Jelölés: `[ADAT]` élő SQL-lel mérve · `[SÉMA]` az éles séma katalógusából ·
`[KÓD]` a forrásból olvasva · `[XLSX]` az Adatok_2025.xlsx képleteiből · `[NYITOTT]` még nem eldöntött

---

## ✅ Kész és commitolva (`fix/banki-import-kiadas-oldal` ág)

| # | Tétel | Commit | Verzió |
|---|---|---|---|
| 1 | A banki import kiadás-oldala: `kedvezmenyzett` → `atvevo`, mind a 3 ágon | `ceea90cc` | 0.9.187 |
| 1b | A halott kétlépcsős fallback kivétele (3 független okból volt vak) | `ceea90cc` | 0.9.187 |
| 1c | A párosítatlan-átvezetés figyelmeztetés **vakfoltja** (csak a már párosított sorokat nézte) | `ceea90cc` | 0.9.187 |
| — | A figyelmeztetés önálló komponensbe + `/dev-proba` mock-renderelés | `6a4ee4b1` | 0.9.187 |
| 2 | A banki import **naplózása** (`import_logs`) — eddig nyomtalan volt | `6f86bcae` | 0.9.187 |
| 4 | **Megjegyzés-oszlop** a banki import varázslóban (mindkét másolatban) | `9165c84c` | 0.9.187 |
| 3 | **Befizető (tag) hozzárendelése** a banki importnál + hatókör-őr | `f09a2ff4` | 0.9.188 |
| — | ⛔ A banki import belső mozgása **kereszt-táblás kategóriát** írt (bevétel-oldalra kiadás-azonosítót) | `87423ec4` | 0.9.189 |
| — | ⛔ A belső mozgás **párja árván maradt** sztornónál és törlésnél (web + desktop) | `8ae0bfdd`, `307faf8d` | 0.9.189 |
| — | Sor-szintű árva-jelzés + a **devizás** belső mozgás lej-értéke | `95b65b1b` | 0.9.189 |
| — | A sztornó/visszavonás **átnyúlhatott egy VÉGLEGESÍTETT évbe** | `d927071d` | 0.9.189 |
| — | **Évhatáron átnyúló pár** (dec. 31. / jan. 1.) + a varázsló félrevezető kategória-mezője | `6a959ce0` | 0.9.190 |
| — | A **jegyzőkönyv-melléklet** 4 hibája + a desktop belső mozgás **KÖNYVELÉSE** | `edf7cd23` | 0.9.190 |
| 8b | Konzol: **Recharts `width(-1)`** — `minWidth 0` + `min-w-0` a flex-szülőkön | `f8df921f` | 0.9.190 |
| 2 | **Készpénz nyitó** automatikus áthozatala — előreírva, ELLENŐRZÉSRE (nem ír magától) | `209b1c08` | 0.9.190 |
| 8 | **Hasonló tétel figyelmeztetés** rögzítéskor (web + desktop, közös mag) | `da80bbf6` | 0.9.191 |
| 5 | **Adományozók és szponzorok fül** (web + desktop, közös mag) | `92ec507b` | 0.9.191 |

**Őrszemek** (mind negatív asszerttel, a projekt szabálya szerint):
`selftest-bank-import-kiadas.mjs` · `selftest-belso-mozgas-figyelmeztetes.mjs` ·
`selftest-bank-import-befizeto.mjs` · `selftest-belso-mozgas-kodpar.mjs` ·
`selftest-belso-mozgas-kaszkad.mjs` · `selftest-hasonlo-tetel.mjs` ·
`selftest-adomanyozok.mjs`

A teljes lánc (`npm run selftest`) **1708 ellenőrzéssel zöld**, a webes build lefut.

---

## 🔜 Soron következő

### 5. Nyitó egyenleg — ami MÉG hátravan (Endre 2. pontja részben kész)

**Kész** (`209b1c08`): a Nyitó egyenlegek felület azoknál az éveknél, ahol nincs
rögzített **készpénz**-nyitó, előírja az előző év zárásából levezetett értéket, és
kimondja, honnan vette. Szándékosan **nem ír a DB-be magától** — a nyitó a hivatalos
számadás kiindulópontja, és az Excelben pontosan az a hibaosztály van meg, hogy a
kézzel írt nyitó elgépelését a beépített önellenőrzés **matematikailag képtelen**
észrevenni (a nyitó tag kiesik a különbségből).

**Hátravan** `[NYITOTT]` — **Endre döntése kell hozzá**:
- **Melyik tároló a mérvadó?** Négy verseng, három különböző számmal ugyanarra a
  számlára `[ADAT]`: `bankszamlak.nyito_egyenleg` = 15 000 ·
  `bankszamla_nyito_egyenleg` (2025) = 107 771,39 · `bealitas.nyito_bank` = 0,00.
  Amíg ez nincs eldöntve, nem szabad egyiket sem „egységesíteni" — a rossz irányba
  való összehúzás számot rontana.
- A **devizás (EUR) számla** nyitójának kezelése.
- **Latens csapda** `[KÓD]`: a `maxDepth = 8` bázis-ablak **2027-ben** csendben eldobná a
  2018-as bázist. Idén még nem sül el, de most olcsóbb javítani.

### 6. Duplikátum-figyelmeztetés — ✅ KÉSZ (`da80bbf6`, 0.9.191)

A rögzítő mentés előtt jelzi, ha ugyanolyan összegű, hasonló nevű, ±3 napon belüli
**banki** tétel már van. Figyelmeztetés, nem tiltás. A döntés magja a
`@kartoteka/core`-ban, a web és a desktop ugyanonnan dolgozik.

**Amit közben MÉRTÜNK és javítottunk** `[SÉMA]`: a `kiadas.datum` típusa
`timestamp`, a `befizetes.datum`-é `date` — egy `datum <= '…'` szűrő a kiadás-táblán
**éjfelet** jelent, tehát a +3. nap délelőtti kiadása némán kimaradt volna az
ablakból. Kizáró felső határ (`< ig+1 nap`) lett belőle.

**Marad nyitva** `[KÓD]`: a figyelmeztetés a **közös rögzítő kapuján** ül, de
**7+ út megkerüli** (Dispoziție, Decont, általános bevétel-import,
egyházfenntartás-import, évvégi árfolyam-átértékelés). Ezekhez szerveroldali réteg
kellene — külön kör, mert mindegyik saját mentési útvonalú.

**Endrének futtatni**: `docs/2026-08-27-hasonlo-tetel-indexek.sql` — a 2026-05-02 óta
a repóban álló, de **élesben sosem lefutott** `idx_*_dup_lookup` indexek. Csak index,
visszafordítható. Ma nem hibát okoz, hanem lassulást, ami évről évre nő.

### 7. „Adományozók és szponzorok" fül — ✅ KÉSZ (`92ec507b`, 0.9.191)

Web **és** desktop, közös összesítő maggal. 10 kategória, a hivatalos
`excel-2026-katalogus.json`-nal **betűre** összevetve (őrszem védi). Készpénz és bank
egyaránt, egy év vagy több év visszamenőleg, kereshető/szűrhető lista, tételes
lenyitás, táblázat-mentés (weben).

**A besorolás mérhető jelekből** áll — nem névtippelésből: „Személy" = van
tagnyilvántartási kapcsolat; „Szervezet" = a számadási kód maga szervezeti forrás
(103.01, 103.09, 105.01, 105.02). A névből fakadó „cég?" külön, halvány jelzés.

**Ismert korlát** `[SÉMA]`, nem hiba: a bevételi oldalon **nincs cégnyilvántartás** —
az adományozó cég ma szabad szöveg (`forrasa`). Az azonos írásmódú alakokat
összevonjuk (az „S.A." és a „SA" is), de két teljesen eltérően begépelt cégnév két
sor marad. Ha ez zavaró lesz, a következő lépés egy **adományozó-törzs** volna.

### 8. Konzol-hibák — ✅ lezárva

- **Recharts `width(-1)`**: ✅ javítva (`f8df921f`) — `minWidth 0` + `min-w-0` a
  flex-szülőkön.
- **`sw.js no-response`** a `/penzugy#bank`-on: valószínűleg egy 2026-08-24 **előtti**
  service worker vezérelte a fület; a mai kód másképp működik `[NYITOTT]`. Ha Endrénél
  a friss verzióban is visszatér, újra elő kell venni.
- `message channel closed`: **böngészőbővítmény**, nem az app — külső zaj.
- `preloaded but not used`: **nem** fölösleges (a `lg:hidden` alatti `<img>` is letöltődik).

---

## ⏸️ Döntésre / külső eseményre vár

### A 7 pár nélküli átvezetés (65 425 RON)
**Endre döntése:** maradjanak érintetlenül, a párjukat a **2026-os készpénzkönyv
betöltésekor** kapják meg.
⚠️ **A betöltés előtt megoldandó:** az Excel az átvezetést **mindkét lábon** rögzíti, a
bank-oldali láb viszont **már bent van** — egy védtelen import **második banki sort**
csinálna. Az importnak fel kell ismernie a meglévő lábat.
**Ami NEM igaz** (visszavont állításom): ez **nem** fújja fel a Számadás bevétel-összesenjét
— a `301.01` kód a `/^[34]/` szabály miatt minden jelentésből kimarad `[KÓD]`.
**Ami igaz:** a kassza-oldali kiadás hiányzik, ezért a **készpénz-egyenleg** lesz túl magas,
amint a készpénzkönyv betöltődik.

### A 2026-os készpénzkönyv betöltése
A 2026-os készpénzforgalom **egyáltalán nincs bevezetve** `[ADAT]`: 2026-01-től 08-ig
minden hónapban `kassza: 0 tétel`. Endre döntése, honnan tölti be (Excel vagy kézi).

---

## 🧭 Munkamódszer-tanulság ebből a körből

**Öt állításomat kellett visszavonnom**, és szinte mind ugyanabból fakadt:
a lelet **létezését** megmértem, a **hatását** viszont kikövetkeztettem.

1. „Az újraimport duplikálna" → nem duplikál (van alkalmazás-szintű fail-closed védelem).
2. „4 795 lej eltérés az Excellel" → nincs eltérés (a saját számításom keverte a
   `fizetettev` és a `datum` év-fogalmat).
3. „A 65 425 felfújja a Számadást" → nem fújja fel (kód-előtag szerinti kizárás).
4. „A `belsotetel` NULL-ok számot rontanak" → nem rontanak (semmi nem olvassa; a
   kitöltés Endre külön, elfogadott kérése volt, nem hibajavítás).
5. A 4. körös ellenőrző SQL-em **hatókör-szűrő nélkül** futott → a TESZT-gyülekezet
   számait jelentettem Endre számaiként (a 4b kör javította).

**Szabály a következő körre:** a lelet LÉTEZÉSE és a HATÁSA két külön kérdés — a
másodikat is meg kell mérni, mielőtt riasztunk. Ugyanígy: minden ellenőrző
lekérdezésnek **hatókör-szűrője** legyen, különben más gyülekezet számát olvassuk.

**Ami ebben a körben ezt igazolta:** két valódi hibát nem a kód olvasása, hanem az
**önellenőrzés írása** hozott elő — a `kiadas.datum` timestamp-je (éjfélre vágott
dátum-ablak) és az „S.A." vs „SA" névszétesés. Mindkettő némán rontott volna.
