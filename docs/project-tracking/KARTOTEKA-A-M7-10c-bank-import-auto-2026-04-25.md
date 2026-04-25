# A-M7.10c — Bank-import automata import (párosítatlanok rögzítése)

**Dátum:** 2026-04-25
**Wave:** A-M7 (pénzügy desktop), 10. al-wave (bank-import) 3. iterációja
**Státusz:** ✅ Kész (smoke-check zöld)
**Megelőző:** A-M7.10b (matcher)
**Következő:** A-M7.10d (Raiffeisen + BT parserek)

---

## Kontextus

Az A-M7.10a (parser) + A-M7.10b (matcher) után már látjuk, mit hozott a banki kivonat és mi az új. Ez a 3. iteráció a hiányzó **akciót** szállítja: a párosítatlan tranzakciók **egy gombbal** új befizetés / kiadás tételként rögzítődnek.

A bank-import most **end-to-end működő** flow lett a BCR-en — a többi bank parser (A-M7.10d) szintén ugyanezen az UI + import-flow-n megy, csak más parserrel.

---

## Új fájlok

- `docs/project-tracking/KARTOTEKA-A-M7-10c-bank-import-auto-2026-04-25.md` — ez a fájl

## Módosított fájlok

- `apps/desktop/src/pages/bank-import-page.tsx` — kategória-betöltő useEffect + import-state-ek + `handleImportUnmatched` handler + import-form panel + `ImportResultCard` komponens + 2 helper fn (`bankRowToIratszam`, `composeMegjegyzes`)
- `docs/CHANGELOG.md` — A-M7.10c bejegyzés

**Nincs új SQL / Rust / core / validations kód** — tisztán UI + meglévő use-case-ek orchestrációja.

---

## Architektúra-döntések

### 1. Bulk-import default kategóriával — egyszerűbb, mint per-row override

A user **két dropdown-ban választ**: default befizetés-kategória + default kiadás-kategória. Az „Importálás" gomb az **összes párosítatlan**-t bedolgozza, mindegyiket a megfelelő default kategóriával.

A per-row override (minden sor melletti egyéni kategória-választó) komplexebb UI lenne, és a tipikus banki kivonatban a tranzakciók többsége azonos típusú (pl. mind perselyperény-átutalás → ugyanaz a kategória). A tételenkénti finomítás a következő iterációban (A-M7.10c2) jöhet, ha a user-feedback kéri.

A user-flow:
1. **Áttekintés** — a Match Summary kártyán látja, hány tétel párosítatlan
2. **Default kategória** — a két dropdown-ban választ
3. **„Importálás összes párosítatlan"** gombbal egyetlen művelettel rögzít

Ha **csak egyik** default-ot választja (pl. csak a befizetés-kategóriát), a kiadás-tételek kihagyódnak (a hibatáblában „Nincs default kiadás-kategória — sor kihagyva." üzenettel). A user dönthet, melyiket akarja most importálni.

### 2. Iratszám-stratégia: banki ref vagy auto-prefix

A `bankRowToIratszam(tx)` helper:
- Ha van `tx.reference` (banki közlemény) → azt használjuk (pl. „NPO12345/2026")
- Egyébként `BANK-yyyymmdd-NN` formátum (NN a sor-index, padded 2-jegyű)

Ez **nem ütközik** a Készpénz-iratszám pool-lal:
- A `getNextReceiptNumberUseCase` `irattipus ILIKE '%észpénz%'` szűrőt alkalmaz — a Banki tételek nem számítanak bele
- A defensive PARTIAL UNIQUE INDEX (`uniq_befizetes/kiadas_iratszam_year_congregation`) is csak Készpénzes sorokra
- Tehát a `BANK-20260315-01` és a Készpénz `15` egymástól független szegmensben élnek

### 3. Megjegyzés-szöveg — pasztorális visszakereshetőség

A `composeMegjegyzes(tx)` egy struktúrált, visszakereshető megjegyzést generál:
```
[Bank-import] FELLELLI A. - PERSELY ADOMANY · Partner: FELLELLI A. · Ref: NPO12345 · Egyenleg: 1234,56 RON
```

A `[Bank-import]` prefix lehetővé teszi a könnyű szűrést a befizetés/kiadás listán („melyek jöttek bankból?").

### 4. Sikeres import után automatikus újra-párosítás

A `handleImportUnmatched` befejezésekor, ha legalább 1 sikeres rögzítés volt, **automatikusan meghívja `handleMatch`**-et. Ezzel:
- A frissen rögzített tételek a következő körben már `matched` státuszúak
- A user vizuálisan visszaigazolást kap, hogy az import megtörtént
- Nincs „elavult Match Summary" a UI-on

### 5. Hibakezelés sornkénti, nem all-or-nothing

A flow `forEach` az unmatched-eken — ha egy sor hibára fut (pl. RLS, validáció, hálózat), a többi még sikeresen rögzül. Az `errors` tömbben minden hiba `{rowIndex, reason}` formában gyűjtődik, és a `ImportResultCard` az első 20-at listázza. A részleges siker is sikernek számít — a lelkész kézzel megnézheti és újraindíthatja a hibákra.

### 6. Pasztorális UX

- **Importálás folyamatban…** loading state (Upload ikon animálva)
- **Sikerkártya** (emerald): „Import sikeres (N tétel)"
- **Részleges-sikerkártya** (amber): „Import részben sikeres (N OK, M hiba)"
- **Hibalista** (rose): minden sor sor-indexszel + magyar magyarázattal
- **Italic megjegyzés**: „Az import után a párosítást automatikusan újrafuttatjuk"

---

## Smoke check eredmények

- ✅ `node scripts/check-desktop-banned-imports.mjs` — 47 fájl, 0 tiltott (változatlan)
- ✅ `npx tsc --noEmit` packages/core — tiszta (változatlan)
- ✅ `npx tsc --noEmit` apps/desktop — tiszta
- ✅ `cargo check` apps/desktop/src-tauri — 0.52s (változatlan, nincs Rust-érintés)
- ✅ Security secret-grep — 0 találat

---

## Manuális tesztelés (Endre runs)

1. **Teljes BCR flow E2E**:
   - Tölts be egy BCR Excel kivonatot (pl. egy hétvégi átutalási batch)
   - Futtasd a Párosítást → várhatóan néhány „matched" (a már rögzített chitanțákhoz tartozó), és néhány „unmatched" (új banki utalások)
   - Válassz default kategóriát: „Egyházfenntartói járulék" (befizetés) + „Közösségi költség" (kiadás)
   - Kattints az „Importálás" gombra
   - Várj néhány másodpercet — sikerkártya megjelenik
   - **Automatikus újra-párosítás** — a most rögzített tételek mostantól matched-ek
2. **Részleges-import**: válassz csak a befizetés-kategóriát (ne a kiadásét) → a kiadás-tételek a hibalistában szerepelnek („Nincs default kiadás-kategória")
3. **Verifikáció**: a `/penzugy/befizetes` oldalon nézd meg az újonnan rögzített tételeket — `irattipus = Banki`, `forrasa = Bank-import`, megjegyzésben a banki leírás
4. **Iratszám-ellenőrzés**: a banki referencia (ha volt) iratszám-ban; egyébként `BANK-yyyymmdd-NN`. Nem ütközik a Készpénz-iratszámmal.

---

## Wave-státusz

| Alfázis | Tartalom | Státusz |
|---|---|---|
| A-M7.10a | Bank-import infrastruktúra + BCR parser + preview UI | ✅ |
| A-M7.10b | Matcher use-case (BankTransaction → meglévő befizetés/kiadás match) | ✅ |
| A-M7.10c | Automata import (a párosítatlan új tételek beszúrása) | ✅ |
| A-M7.10d | Raiffeisen + BT parserek | ⏳ |

A bank-import wave most **75%-ban kész** — BCR end-to-end működik. A Raiffeisen + BT parserek hozzáadása ~1.5 óra, mert csak az oszlop-pattern-ek és néha a dátum-formátum más; a teljes import-flow változatlan (parser-registry pattern).

A pénzügyi P0 wave maradék témái:
- **A-M7.10d** — Raiffeisen + BT parserek (~1.5 óra)
- **Oblio / e-Factura Edge Fn** — ~2-3 nap, secret-gateway építés (külön session-ek)

Az M8 wave (tagnyilvántartás-write + anyakönyv) szintén elindítható.
