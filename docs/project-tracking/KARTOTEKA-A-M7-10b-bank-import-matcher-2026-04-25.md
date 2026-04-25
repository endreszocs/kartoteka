# A-M7.10b — Bank-import matcher (banki tranzakciók párosítása)

**Dátum:** 2026-04-25
**Wave:** A-M7 (pénzügy desktop), 10. al-wave (bank-import) 2. iterációja
**Státusz:** ✅ Kész (smoke-check zöld)
**Megelőző:** A-M7.10a (bank-import infrastruktúra + BCR parser)
**Következő:** A-M7.10c (automata import a párosítatlanokra) + A-M7.10d (Raiffeisen + BT parser)

---

## Kontextus

Az A-M7.10a első iteráció szállította a parser-infrastruktúrát + BCR parsert + preview UI-t. A 2. iteráció (jelen alfázis) az **érdemi user-értéket** hozza meg: a banki tranzakciók párosítását a már rögzített befizetés/kiadás tételekkel.

Cél: a lelkész lássa, hogy **mi az új** a banki kivonatban, és **mit rögzítettünk már** korábban (chitanța vagy banki utalás formájában). A párosítás után az import (A-M7.10c) csak az új tételeket szúrja be — duplikációk nélkül.

---

## Új fájlok

- `packages/core/src/finance/bank-import/matcher.ts` — `matchBankTransactionsUseCase` (~210 sor)
- `docs/project-tracking/KARTOTEKA-A-M7-10b-bank-import-matcher-2026-04-25.md` — ez a fájl

## Módosított fájlok

- `packages/validations/src/finance/bank-import.ts` — új `MatchStatus`, `MatchCandidate`, `BankMatchRow`, `BankMatchResult` zod-sémák
- `packages/core/src/finance/bank-import/index.ts` — `matchBankTransactionsUseCase` re-export
- `packages/core/src/index.ts` — re-export
- `apps/desktop/src/pages/bank-import-page.tsx` — auth + congregationId state + match-state + handler + UI bővítés (gomb, summary kártya, preview-tábla státusz-oszloppal, MatchStatusBadge + MatchSummaryCard + SummaryStat helper komponensek a fájl végén)
- `docs/CHANGELOG.md` — A-M7.10b bejegyzés

---

## Architektúra-döntések

### 1. Heurisztika-prioritás (3 lépcső)

A párosítás **prioritás-sorrendben** próbálkozik, és az első találat lezárja az egyes tranzakciókat:

| Lépcső | Konfidencia | Feltétel | Magyarázat |
|---|---|---|---|
| 1. Pontos | 1.0 | datum + osszeg pontos egyezés | Ideális — a banki tranzakció ugyanaznap könyvelve, ahogy rögzítettük |
| 2. Iratszám | 0.9 | Pontos osszeg + a banki közleményben szerepel a meglévő iratszám | Pl. „IRATSZAM: 887" az átutalási közleményben |
| 3. Toleráns | 0.7 | Pontos osszeg, dátum ±2 nap eltérés | A bank gyakran 1-2 nap késéssel könyvel |

Ha **több jelölt** is talál egy lépcsőn (pl. ugyanazon a napon két különböző befizetés azonos összeggel — ritka, de létezik család-szintű befizetésnél), a status `'multiple'` — a user kézzel dönt.

### 2. Időtartomány-szűrés

A matcher a **tranzakciók min/max dátumától ±buffer napig** szűkített tartományon kéri le a `befizetes` + `kiadas` táblát. Ez:
- Csökkenti a hálózati forgalmat (nem a teljes éves listát)
- Több évet átfogó kivonatot is kezel (pl. december-januári)
- A szerver-listák `limit: 2000` per év — bőven elég a tipikus havi vagy negyedéves bank-export számára

### 3. Online-only

A matcher két `listIncomeUseCase` + két `listExpenseUseCase` hívást igényel (egy évre). Ezek **online-only** use-case-ek (a `befizetes_local` és `kiadas_local` tartalma korlátozott a join-mezők szempontjából). Bank-import jellegéből adódóan online-mód alatt fut — a matcher offline-fallback nem prioritás.

### 4. UI: státusz-oszlop csak match után

A preview-tábla **alapból nem mutat** státusz-oszlopot — csak a parsert futtatás után. Amikor a user a „Párosítás futtatása" gombra kattint, a matchResult betöltődik, és a tábla bővül egy oszloppal a `MatchStatusBadge` komponenssel.

A badge-ben:
- Matched + iratszám (pl. „Megvan #887")
- Multiple + jelölt-szám (hover-tooltipben listázva)
- Unmatched + tooltip-magyarázat

### 5. MatchSummaryCard

A 4 státusz (`matched / multiple / unmatched / duplicate`) darabszáma 4 stat-kártyában — a lelkész egy pillantásra látja a párosítás eredményét. A `duplicate` státusz most még nem használt (placeholder a jövőbeli „már korábbi importból ismert" detekcióhoz).

---

## Smoke check eredmények

- ✅ `node scripts/check-desktop-banned-imports.mjs` — 47 fájl, 0 tiltott (változatlan)
- ✅ `npx tsc --noEmit` packages/core — tiszta
- ✅ `npx tsc --noEmit` apps/desktop — tiszta (1 unused import javítva: `User` import törölve, helyette csak `congregationId` state)
- ✅ `cargo check` apps/desktop/src-tauri — 0.48s

---

## Manuális tesztelés (Endre runs)

1. **BCR parse** (A-M7.10a flow változatlan)
2. **Párosítás futtatása**: a preview-kártya alján új gomb. Kattintásra:
   - „Párosítás folyamatban…" loading state
   - Néhány másodperc után megjelenik a `MatchSummaryCard` 4 stat-kártyával
   - A preview-tábla minden sora mellé bekerül a státusz-badge
3. **Várt eredmények**:
   - **Matched**: az olyan banki sorok, amelyeknek megfelelő befizetés/kiadás már rögzítve van (pl. ugyanazon a napon ugyanaz az összeg)
   - **Unmatched**: új banki sorok (pl. egy átutalás, amit még nem rögzítettünk)
   - **Multiple**: ritka, de pl. ha ugyanaznap két 50 RON Készpénzes befizetés volt rögzítve és a bank is két 50 RON-os tételt tartalmaz
4. **Hover-tooltip**: minden badge-en hover hatására megjelenik a részletes magyarázat (iratszám, magyarázat, dátum-eltérés)
5. **Újra-párosítás**: a gomb most már „Újra-párosítás" — ha a felhasználó közben rögzített manuálisan tételeket, újrafuttathatja

---

## Wave-státusz

| Alfázis | Tartalom | Státusz |
|---|---|---|
| A-M7.10a | Bank-import infrastruktúra + BCR parser + preview UI | ✅ |
| A-M7.10b | Matcher use-case (BankTransaction → meglévő befizetés/kiadás match) | ✅ |
| A-M7.10c | Automata import (a párosítatlan új tételek beszúrása) | ⏳ |
| A-M7.10d | Raiffeisen + BT parserek | ⏳ |

A pénzügyi P0 wave hátralévő témái:
- **Bank-import befejezés** (A-M7.10c/d) — ~2.5 óra, 1 további session
- **Oblio / e-Factura Edge Fn** — ~2-3 nap, secret-gateway építés

Az M8 wave (tagnyilvántartás-write + anyakönyv) párhuzamosan elindítható.
