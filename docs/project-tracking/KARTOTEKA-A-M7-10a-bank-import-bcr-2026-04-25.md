# A-M7.10a — Bank-import infrastruktúra + BCR XLSX parser

**Dátum:** 2026-04-25
**Wave:** A-M7 (pénzügy desktop)
**Státusz:** ✅ Kész (smoke-check zöld; első iteráció a 3-iterációs bank-import wave-ben)
**Megelőző:** A-M7.9d (pending tételek a pénzügyi áttekintőn)
**Következő:**
  - A-M7.10b — matcher use-case (tranzakciók → meglévő befizetés/kiadás párosítás)
  - A-M7.10c — automata import (új tételek beszúrása)
  - A-M7.10d — Raiffeisen + BT parserek

---

## Kontextus

Az A-M7.9 al-wave után (write-offline + konfliktus-feloldás teljes) a következő pénzügyi prioritás Endre listáján a **bank-import**. A teljes scope ~5 óra (3 parser + matcher + UI), nem fér egy session-be — ezért szétszedjük 3-4 alfázisra.

Ez az első iteráció (A-M7.10a) **az infrastruktúrát + a BCR parsert + alap UI-t** szállítja. A user a bankjából exportált XLSX-et betöltheti és előnézetben láthatja, mit ismert fel a parser. A párosítás és az import a következő iterációkban jön.

A webapp `apps/web/lib/finance/bank-import/bcr-parser.ts` (~400 sor) **éles és bevizsgált** kód — ezt portáljuk a core-ba minimal módosítással (eltávolítjuk a `'use client'` direktívát, és az xlsx-importot top-level-re tesszük dinamikus helyett).

---

## Új fájlok

- `packages/validations/src/finance/bank-import.ts` — zod sémák + magyar címkék
- `packages/core/src/finance/bank-import/bcr.ts` — BCR XLSX parser (~330 sor, a webapp port)
- `packages/core/src/finance/bank-import/index.ts` — parser registry + `parseBankExport` univerzális belépési pont
- `apps/desktop/src/pages/bank-import-page.tsx` — desktop UI (~300 sor)
- `docs/project-tracking/KARTOTEKA-A-M7-10a-bank-import-bcr-2026-04-25.md` — ez a fájl

## Módosított fájlok

- `packages/core/package.json` — `xlsx@^0.18.5` dependency hozzáadva
- `packages/core/src/index.ts` — re-exports a `bank-import`-ból
- `packages/validations/src/index.ts` — re-export a `finance/bank-import`-ból
- `apps/desktop/src/App.tsx` — `BankImportPage` import + `/penzugy/bank-import` route
- `apps/desktop/src/pages/penzugy-landing-page.tsx` — új kártya „Bank-import (Béta)" + a „Hamarosan" listából a bank-import sor frissítve (most már „Raiffeisen + BT")
- `docs/CHANGELOG.md` — A-M7.10a bejegyzés

---

## Architektúra-döntések

### 1. xlsx a core-ban, nem új @kartoteka/excel package

A migrációs terv §2 említ egy jövőbeli `packages/excel` csomagot (M10). Most a leg-egyszerűbb utat választjuk: az `xlsx` direkt függőség a `@kartoteka/core`-ban. Indok:
- Az `xlsx` ~1 MB bundle — elviselhető
- Egy session-be férés
- Új csomag-szülés ~30 perc overhead
- Jövőbeli M10-ben simán átköltöztethetjük

### 2. Browser `<input type="file">`, nem Tauri dialog

A desktop bank-import page browser-natív file-input-ot használ, **nem** a `@tauri-apps/plugin-dialog`-ot. Indok:
- A Tauri webview natívan támogatja az `<input type="file">`-t
- Nincs új Tauri-dependency
- Ugyanaz a kód web-en is működne (későbbi web-portolás könnyebb)
- A user-experience azonos (system file-picker megnyílik)

### 3. Univerzális `parseBankExport(provider, buffer)` belépési pont

A registry pattern lehetővé teszi, hogy a UI **egyetlen hívással** kezelje a 3 bankot (és a jövőbelieket). Új parser hozzáadása:
1. Új fájl `packages/core/src/finance/bank-import/raiffeisen.ts` (vagy `bt.ts`)
2. Cseréld a placeholder-t a `BANK_PARSERS` map-ben

A UI-t nem kell változtatni — a dropdown automatikusan láttatja a bankot, és a `parseBankExport` átirányít.

### 4. Console-error suppression a "Bad uncompressed size" warningra

A BCR XLSX export specifikus ZIP-formátumot használ, ami az `xlsx` library belső warning-ját kiváltja:
```
Bad uncompressed size: 12345 != 0
```
Ez **nem hiba** (az adat helyesen jön), de a Tauri/Vite dev konzolban error-ként jelenne meg. A webapp-mintával azonos módon temporalisan átdolgozzuk a `console.error`-t a parse idejére, és csak ezt az egy üzenet-mintát nyeljük el.

### 5. Pasztorális UX

A bank-választó dropdown mindhárom bankot mutatja, de a nem-támogatottak mellett `(még nem támogatott)` jelzéssel. Ha mégis kiválasztanád, a placeholder-parser tisztességes magyar üzenettel válaszol:
> "Ez a bank-formátum még nem támogatott. Egyelőre csak a BCR XLSX export működik. Más bankok hozzáadása folyamatban."

A preview tábla utáni borostyán infosáv egyértelműen jelzi a következő lépést:
> "🚧 A következő lépés (A-M7.10b): A tranzakciók párosítása a már rögzített befizetés/kiadás tételekkel..."

A lelkész tudja: **most látja a fájlt**, de még **nem importálta**.

---

## Smoke check eredmények

- ✅ `node scripts/check-desktop-banned-imports.mjs` — 47 fájl, 0 tiltott (46 → 47 a `bank-import-page.tsx`-szel)
- ✅ `npx tsc --noEmit` packages/core — tiszta (xlsx típusok rendben)
- ✅ `npx tsc --noEmit` apps/desktop — tiszta
- ✅ `cargo check` apps/desktop/src-tauri — 0.55s (változatlan, nincs Rust-érintés)
- ✅ Security secret-grep — 0 találat

---

## Manuális tesztelés (Endre runs)

1. **Indítás**: `npm run desktop:dev` → login → `/penzugy` → új „Bank-import (Béta)" kártya az indigo színnel.
2. **BCR teszt**: a kártyára kattintva → bank dropdown alapból „BCR" → válassz egy létező BCR Excel exportot a gépedről → preview megjelenik:
   - Bevétel + kiadás kártya RON-ban
   - Felismert oszlopok lista (`<details>` toggle-ben)
   - Tranzakciók tábla (Sor / Dátum / Leírás / Partner / Összeg) — első 50 sor
3. **Hibakezelés**: tölts be egy nem-BCR Excel-t (pl. egy random `.xlsx`) → a preview hiba-üzenetet ad: „Nem találtunk fejléc sort a fájlban. A BCR Excel exportnak tartalmaznia kell: dátum, leírás, és összeg oszlopokat."
4. **Placeholder bankok**: válts a dropdown-on Raiffeisen-re vagy BT-re → a fájl megpróbálná, de a parser azonnal placeholder hibát ad: „Ez a bank-formátum még nem támogatott..."
5. **Reset**: a fájl-név melletti „Törlés" gomb visszaállítja az állapotot.

---

## Wave-státusz

| Alfázis | Tartalom | Státusz |
|---|---|---|
| A-M7.10a | Bank-import infrastruktúra + BCR parser + preview UI | ✅ |
| A-M7.10b | Matcher use-case (BankTransaction → meglévő befizetés/kiadás match) | ⏳ |
| A-M7.10c | Automata import (a párosítatlan új tételek beszúrása) | ⏳ |
| A-M7.10d | Raiffeisen + BT parserek | ⏳ |

A pénzügyi P0 wave maradék prioritásai (Endre listája szerint):
- **Bank-import folytatás** (A-M7.10b/c/d) — ~3-4 óra, 1-2 további session
- **Oblio / e-Factura Edge Fn** — ~2-3 nap, secret-gateway építés

Az M8 wave (tagnyilvántartás-write + anyakönyv) egyaránt elindítható — a write-offline minta bizonyított.
