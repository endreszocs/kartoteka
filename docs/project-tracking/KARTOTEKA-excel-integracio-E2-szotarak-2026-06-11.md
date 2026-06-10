# KARTOTÉKA — Excel-integráció · E2 szótárak (kód-egyeztetés, bank-mapping, irattíp)

**Dátum:** 2026-06-11 · **Jelleg:** tisztán elemző KAPU az E3 (write-through) előtt — semmilyen pénzt nem ír.
**Forrás:** a becsomagolt `Adatok_2026.xlsx` (named range-ek + data-validation) + a valós `Adatok_2025.xlsx` (kitöltött kategóriákkal) gépi elemzése.

---

## 1. Költségvetési kód-egyeztetés (a finance-kritikus pont)

### 1.1 Hogyan tárolja az Excel a kódot
- A `Kassza` **I** (Bevétel kód) és **K** (Kiadás kód) oszlopa **legördülő lista** (data-validation `type=list`):
  - `I7:I4000` → `formula1 = bev` named range
  - `K7:K4000` → `formula1 = kiad` named range
- A `bev`/`kiad` range a **Hibak** lapról töltődik dinamikusan (`INDIRECT(Hibak!$Z$122):INDIRECT(Hibak!$Z$123)` ill. `$AZ$…`). A bank-lapoknak SAJÁT per-számla range-jük van: `beva, bevb, … bevt` (bevétel A–T számla) és `kiada … kiadt` (kiadás).
- **Az I/K oszlopba a kód SZÖVEGES NEVE megy** (pl. „Egyházfenntartói járulék"), NEM numerikus kód. Megerősítve a 2025 valós adatból.

### 1.2 Diocese-függő készlet
- A blank 2026 sablonban a fő költségvetési tételek **az egyházmegye nevének beírása után** jelennek meg (Hibak!Z100 megjegyzés). A teljes kategória-készlet az **official EREK chart**, egyházmegyénként betöltve.
- A Kartotéka `szamadasicel` UGYANEZ az official EREK chart (globális katalógus). A `befizetescel.nev` / `kiadascel.nev` = `szamadasicel.nev` (lásd `2026-04-17-seed-befizetescel-kiadascel.sql`).
- **Következtetés:** mindkét oldal ugyanabból a forrásból (EREK) származik → a kód-egyezés strukturálisan adott. A maradék kockázat kizárólag apró string-eltérés (ékezet/szóköz/megfogalmazás).

### 1.3 Belső-mozgás kategóriák — IGAZOLTAN egyeznek
| Excel (Hibak Z/AZ, rows 101–120) | Kartotéka |
|---|---|
| `Készpénzfelvétel a(z) A számláról` … T (bevétel) | belső mozgás: bank→kassza (A…T) |
| `Készpénzletétel a(z) A számlára` … T (kiadás) | belső mozgás: kassza→bank (A…T) |

A 2025 valós Kartotéka-export `K=„Készpénzletétel a(z) A számlára"` / `I=„Készpénzfelvétel a(z) A számláról"` — **byte-azonos** az Excellel. (Seed: `2026-05-03-finance-belso-mozgas-celok.sql`, `2026-06-10-belso-mozgas-kodok-INSTALL.sql`.)

### 1.4 Reprezentatív EREK kategória-készlet (a 2025 valós adatból)
**Bevétel:** Egyházfenntartói járulék · Adományok hívektől, egyházi intézményektől · Perselypénz · Területek bérjövedelme · Legátumok – adományok teológiai hallgatók támogatására · Sírhelyek eladásából, bérleti díjából… · Iratterjesztés – bevétel · Számlavisszatérítések · Készpénzfelvétel a(z) A számláról
**Kiadás:** Karbantartási kiadások · Gyerek és ifjúsági tevékenységek kiadásai · Fogyóanyagok, más anyagok · Irodaszerek, nyomtatványok · Egyháztagok segélyezése · Szolgáltatások költségei · Közköltségek (fűtés, világítás, víz stb.) · Posta, telefon, internet · Épületadó, földadó, biztosítás · Protokoll · Teológiai hallgatók tanulmányi segélye – legátumok · Készpénzletétel a(z) A számlára

### 1.5 Végső spot-check (a write-through ELŐTT)
A `migration-docs/sql/2026-06-11-EXCEL-export-szamadasicel-ellenorzes.sql` exportálja a Kartotéka `szamadasicel.nev` (+ befizetescel/kiadascel) készletét. **Endre futtassa**, és vesse össze egy diocese-konfigurált Excel `bev`/`kiad` listájával — minden eltérő string rendezendő, MIELŐTT az E3 pénzt ír. (A strukturális azonosság miatt 0 vagy néhány apró eltérés várható.)

---

## 2. Bank-mapping (Kartotéka bankszámla ↔ Excel betű-lap) — AUTO

- Minden betű-lap (A, B, C…) egy **bankszámla-könyv**; a **3. sorában a deviza** (2025: A=`RON`, B=`EUR`). Az E0 `excel_list_sheets` + egy új `excel_read_meta` kiolvassa a betű-lapok devizáját és nyitó egyenlegét.
- **Auto-javaslat (Endre döntése):** Kartotéka `bankszamla.valuta` → az azonos devizájú első szabad betű-lap (RON→A, EUR→B…). Ha több azonos-devizájú számla van, a `bankszamla.bank_neve` szerinti sorrend dönt; a lelkész a Beállításokban felülírhatja.
- Tárolás: `excel_bank_map` (bankszamla_id ↔ betű-lap), per-gyülekezet, lokálisan.
- **Készpénz** → mindig a `Kassza` lap (nincs betű).

## 3. Irattíp (F oszlop) szótár — a 2025 valós eloszlás alapján

| Kartotéka kontextus | Excel `F` (Irattíp) |
|---|---|
| Készpénzes befizetés kiállított nyugtával (chitanță) | `Chit.` |
| Banki tétel (bankkivonatról) | `Extr` |
| Átutalási megbízás | `OP` |
| Beszállítói számla | `Fact.` |
| Számla + bon | `Fact.+Bon.` / `Bon fiscal` |
| Dispozíció (plată/încasare) | `Disp. Plata` |
| Decont (elszámolás) | `Decont.` |

A 2025 valós F-eloszlás: Chit. 488 · Bon fiscal 19 · Fact.+Bon. 14 · OP 11 · Fact. 9 · Fact.+Chit. 5 · Disp. Plata 3 · Decont. 2. A desktop a tétel kontextusából (van-e nyugta / banki-e / dispozíció-e) választ; ha nincs egyértelmű, alapértelmezés készpénznél `Chit.`, bankinál `Extr`.

---

## 4. E2 KAPU-döntés
- **Kód-egyezés:** strukturálisan adott (közös EREK-forrás); a belső-mozgás igazoltan egyezik; a fő kategóriák spot-checkje az 1.5 SQL-lel (Endre). → **feltételes GO**: az E3 indulhat, az első éles banki/kategóriás írás előtt az 1.5 spot-check kötelező.
- **Bank-mapping:** auto deviza-alapú (1:1 a betű-lapok devizájával). ✅
- **Irattíp:** a 3. pont szótára. ✅

**Következő: E3** — a write-through (DB → Excel) a fenti szótárakkal, az `excel_outbox`/`excel_row_map` idempotencia-réteggel.

---

## 5. KRITIKUS spot-check eredmény (2026-06-11) — a nevek NEM egyeznek

A Kartotéka kategória-export (54 bevétel + 61 kiadás, kóddal) összevetése az Excel `bev`/`kiad` legördülővel:
- **Az Excel NÉV szerint aggregál** (a Hibak Z/AZ oszlop a pontos név; nincs kód a motorban — csak sorszám).
- **A Kartotéka nevei RÖVIDÍTETTEK + a 2026-os chart** (pl. 101.02 „Bevételek egyházi szolgálatokért" vs Excel „Bevételek **a különböző** egyházi szolgálatokért"; 101.06 „Sírhelyek bevételei" vs „Sírhelyek **eladásából, bérleti díjából…**"; új kódok: 101.07 Kongrua, 201.15–19 CAS/CASS/nettó).
- **A vizsgált 2025-ös Excel a RÉGI chart** → ezért a nagy eltérés.

**Következmény (finance-kritikus):** a Kartotéka nevét NEM szabad közvetlenül az Excel I/K-ba írni — a Számadás nem ismerné fel (Hibak ≠ 0). Kell egy **`szamadasicel.id` (kód) → Excel-pontos-2026-név** mapping, és az E3 az **Excel nevét** írja.

**Endre döntése (2026-06-11):** a becsomagolt **2026-os sablont konfigurálja** (egyházmegye név → `Koltsegvetes!V3`), hogy a 2026-os hivatalos névlista populálódjon; abból építem a kód→név mappinget. A shippelt sablon BLANK marad (a lelkész a saját egyházmegyéjét írja be első használatkor).

**E3 BLOKKOLVA**, amíg a kód→Excel-2026-név mapping el nem készül (a konfigurált 2026 névlistából).
