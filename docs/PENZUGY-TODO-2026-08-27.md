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

**Őrszemek** (mind negatív asszerttel, a projekt szabálya szerint):
`selftest-bank-import-kiadas.mjs` · `selftest-belso-mozgas-figyelmeztetes.mjs` ·
`selftest-bank-import-befizeto.mjs`

---

## 🔜 Soron következő

### 5. Nyitó egyenleg egységesítése — Endre 2. pontja
**Státusz:** elkezdve, felmérve.
**Amit tudunk** `[ADAT]`:
- Az automatikus áthozatal **létezik és lefutott** (2026-08-27 10:18, `forrasa: 'carryover'`).
- **Négy tároló** verseng, három különböző számmal ugyanarra a számlára:
  `bankszamlak.nyito_egyenleg` = 15 000 · `bankszamla_nyito_egyenleg` (2025) = 107 771,39 ·
  `bealitas.nyito_bank` = 0,00
- Az áthozatal **hiányos**: nincs 2026-os nyitó a 2. (EUR) számlára és a **készpénzre** sem.
- A 2026-os készpénz nyitó helyes értéke **6 463,74** (a `datum` szerinti 2025-ös záró,
  ami karakterre egyezik az Excel `Kassza!H3`-mal).

**Teendő:** a készpénz-ág bekötése az áthozatalba, a devizás számla kezelése, és
**döntés arról, melyik tároló a mérvadó**.
**Latens csapda** `[KÓD]`: a `maxDepth = 8` bázis-ablak **2027-ben** csendben eldobná a
2018-as bázist. Idén még nem sül el, de most olcsóbb javítani.

### 5b. A `belsotetel` NULL-ok kitöltése — Endre kifejezett kérése
**Státusz:** átvilágítás fut (5 ágens), utána SQL.
**Előzmény:** mérés szerint a `szamadasicel.belsotetel` oszlopot **semmi nem olvassa**
`[KÓD]`, ezért technikailag nem szükséges. **Endre kérte** a kitöltést, hogy egyezzen az
Excellel és ne vezessen félre senkit később — ez elfogadott döntés.
⚠️ **Tisztázandó az átvilágításban:** a `belsotetel` **önmagára** mutat-e vagy a **pár**
kódjára. A `befizetescel` adatai önmagára mutatást sugallnak (181 → `id_szamadasicel` 301.01
ÉS `belsotetel` 301.01), de ezt a séma-forrásból meg kell erősíteni — ha a pár kódját
jelölné, a „töltsük ki a saját kóddal" javítás **rossz** lenne.

### 6. Duplikátum-figyelmeztetés kézi rögzítéskor — Endre 8. kérése
**Felmérve, nincs elkezdve.**
- ✅ **Zajmentes lesz**: az álriasztás-próba 548 kassza-bevételen **0 találatot** adott `[ADAT]`.
- ⛔ **Blokkoló csapda**: a kassza↔bank átvezetés két lába **definíció szerint** azonos
  dátumú és összegű — kötelező a `belso_mozgas_xkey IS NULL` szűrő, különben minden
  készpénzletétel álriasztást adna `[KÓD]`.
- A helyes kulcsok: „banki eredetű" = `bankszamla_id IS NOT NULL` (**soha nem** az
  `irattipus` szövege!), összeg = `COALESCE(osszeg_ron, osszeg)`, `excludeId` szerkesztésnél.
- A kapu: `CombinedEntryBody.handleSave()` (web+desktop közös), **de 7+ út megkerüli**
  (Dispoziție, Decont, általános bevétel-import, egyházfenntartás-import, évvégi
  árfolyam-átértékelés) → szerveroldali réteg is kell.
- ✅ `pg_trgm v1.6` + `unaccent v1.1` **telepítve** `[SÉMA]`.
- ❌ `idx_befizetes_dup_lookup` / `idx_kiadas_dup_lookup` **NEM létezik élesben** — a
  migrációs fájl megvan, de sosem futott le `[SÉMA]`. Létre kell hozni.

### 7. „Adományozók és szponzorok" fül — Endre 5. kérése
**Felmérve, nincs elkezdve.**
- A kategóriák megvannak `[ADAT]`: 101.03 Perselypénz, 101.04 Adományok hívektől,
  101.05 Úrasztali, 102.04 Diakóniai, 102.05 Missziós, 102.06 Legátumok,
  103.01 Segélyszervezetektől, **103.09 Szponzortámogatások/3,5%**, 105.01–105.02.
- ⚠️ **Cég-törzs a bevételi oldalon NINCS** `[SÉMA]` — az adományozó cég ma csak szabad
  szöveg (`forrasa`), így az elgépelt nevek nem állnak össze. (Egyetlen szűk kivétel:
  `berleti_szerzodes.ceg_nev` + `ceg_adoszam`, de az a bérlőkre vonatkozik.)
- ⚠️ Az `id_szemely` a legtöbb adomány-kódnál **üres marad** — a `person-scope-config.ts`
  csak néhány kódnál kísérel meg párosítást `[KÓD]`.
- ⚠️ A `DebtTab` több-éves nézete **alvó képesség**, nem működő minta — egyetlen hívó sem
  adja át a `debtRowsByYear` propot `[KÓD]`. Ne másoljuk mintaként.

### 8. Konzol-hibák
- **Recharts `width(-1)`**: rejtett fülben renderelő diagram `[KÓD]` — valós, javítandó.
- **`sw.js no-response`** a `/penzugy#bank`-on: valószínűleg egy 2026-08-24 **előtti**
  service worker vezérelte a fület; a mai kód másképp működik `[NYITOTT]`.
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

**Három állításomat kellett visszavonnom**, és mind a három ugyanabból fakadt:
a lelet **létezését** megmértem, a **hatását** viszont kikövetkeztettem.

1. „Az újraimport duplikálna" → nem duplikál (van alkalmazás-szintű fail-closed védelem).
2. „4 795 lej eltérés az Excellel" → nincs eltérés (a saját számításom keverte a
   `fizetettev` és a `datum` év-fogalmat).
3. „A 65 425 felfújja a Számadást" → nem fújja fel (kód-előtag szerinti kizárás).

**Szabály a következő körre:** a lelet LÉTEZÉSE és a HATÁSA két külön kérdés — a
másodikat is meg kell mérni, mielőtt riasztunk.
