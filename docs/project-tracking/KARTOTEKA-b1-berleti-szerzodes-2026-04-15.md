# KARTOTEKA — B1 Bérleti szerződés modul (TELJES)

**Dátum**: 2026-04-15
**Implementációs forrás**: `~/.claude/plans/purrfect-coalescing-quiche.md` — B1 részletes terv
**Vanilla JS forrás**: `migration-docs/source-links/penzugy_tartozasok.js:304-691`
**Projekt log lépések**: 023. (B1.1-B1.6), 024. (B1.7)

---

## Vezetői összefoglaló

A B1 feladat (Bérleti szerződés modul) **TELJESEN KÉSZ** — mind a 7 alfeladat implementálva (B1.1 - B1.7). Első iterációban (B1.1 - B1.6) a CRUD + hátralék-szekció került élesbe, második körben (B1.7) az income-dialog quick-pick is hozzákerült.

### A modul most ezt tudja

- Új bérleti szerződés rögzítése (magánszemély vagy cég bérlő)
- Szerződés szerkesztése és (soft) törlése
- Szerződések listázása szűrőkkel (típus + státusz)
- Bérleti hátralék automatikus számítása a befizetésekből (104.04/104.05 kódok)
- Bérleti hátralék KPI + lista a Tartozások fülön
- Mobile-first reszponzív UI (kártyás bontás mobil nézeten)
- **Income-dialog quick-pick**: a bevétel rögzítő modalból egy kattintással kiválasztható egy aktív szerződés, és a mezők (kategória, összeg, bérlő) automatikusan kitöltődnek

### Verifikáció

- TypeScript: `npx.cmd tsc --noEmit` → 0 hiba ✅
- 4 köztes tsc futtatás (B1.1, B1.2, B1.3, B1.4 után) — mind tiszta
- Manuális UI tesztek: a felhasználó tesztelési körében (lásd `KARTOTEKA-security-test-checklist-2026-04-15.md` B1 szekció)

---

## A felhasználói döntések

A plan mode tervezésekor a következő döntések születtek:

| Kérdés | Döntés | Hatás |
|---|---|---|
| **Hol jelenjen meg a bérleti szerződés?** | Külön "Bérleti szerződések" fül + bérleti hátralék szekció a Tartozások fülön | Tisztább szétválasztás: a CRUD a saját helyén, a hátralék a tartozásokkal együtt |
| **Hogyan választják a bérlő típusát?** | Radio kapcsoló a modal tetején (Magánszemély / Cég) | Csak a releváns mezők látszanak |
| **Quick-pick a bevétel rögzítéshez?** | Igen, DE külön (későbbi) iterációban | Most a normál bevétel rögzítés úton megy a 104.04/104.05 kategóriával |

---

## Felfedezések a felderítés során

### ✅ Már elkészült alapok

- **DB séma `berleti_szerzodes`**: teljes (21 oszlop), `Database_schema.sql:252`
- **RLS policy**: aktív (`migration-docs/sql/2026-04-13-rls-ALL-FIXED.sql`)
- **`rentalContractSchema`**: részben létezett a `lib/validations/finance.ts`-ben (DE hiányos és névkonfliktusokkal)
- **`RENTAL_FREQUENCIES` konstans**: létezett, **DE konfliktusban a DB-vel**

### 🔴 Kritikus probléma: konstans-DB konfliktus

A `RENTAL_FREQUENCIES` konstans 4 értéket vett fel:
```ts
export const RENTAL_FREQUENCIES = ['havi', 'negyedeves', 'feleves', 'eves'] as const
```

Viszont a DB CHECK constraint csak 2-t engedélyez:
```sql
CHECK (fizetesi_ciklus IN ('havi','eves'))
```

Ha valaki az eredeti séma alapján próbált volna `negyedeves` vagy `feleves` szerződést menteni, a Supabase elutasítja. Szerencsére a séma sehol másutt nem volt használatban.

**Javítás**: a konstanst szűkítettem `['havi', 'eves']`-re. A `grep` megerősítette, hogy nincs regressziós kockázat (sehol másutt nem volt használva).

### ⚠️ Sémanév-konfliktusok

A meglévő `rentalContractSchema` mezőnevei eltértek a DB tábla mezőitől:
- `gyakorisag` ← DB-ben `fizetesi_ciklus`
- `veg` ← DB-ben `vege`

Ezeket javítottam, és a sémát teljesen átírtam, hogy minden DB mezőt lefedjen.

---

## Implementált fájlok

### Új fájlok (3)

| Fájl | Tartalom | Sorok |
|---|---|---|
| `lib/finance/rental-calculation.ts` | 4 függvény: `calculateEvesDij`, `calculateAranyosDij`, `calculateRentalDebts`, `summarizeRentalDebts` | ~210 |
| `components/modals/rental-contract-dialog.tsx` | CRUD modal, font-heading cím, amber gradient ikon, ModalField, mobile-first | ~430 |
| `components/finance/rental-tab.tsx` | Szerződés-lista fül, KPI kártyák (3), szűrők, desktop táblázat + mobil kártyás | ~290 |

### Módosított fájlok (6)

| Fájl | Mit |
|---|---|
| `lib/constants/finance.ts` | `RENTAL_FREQUENCIES` szűkítve `['havi', 'eves']`-re; új enumok: `RENTAL_TIPUS`, `RENTAL_BERLO_TIPUS`; label map-ek; `RENTAL_SZAMADASICEL_MAP` (terulet→104.05, epulet→104.04); új interfészek: `RentalContractRow`, `RentalDebtRow` |
| `lib/validations/finance.ts` | `rentalContractSchema` teljes átírása; minden DB mező; 3 refinement (vege >= kezdet, ceg_nev cégnél, berlo_nev személynél) |
| `app/(dashboard)/penzugy/actions.ts` | 4 új action: `getRentalContracts`, `saveRentalContract`, `deleteRentalContract`, `getRentalDebtRows` |
| `components/finance/finance-tabs.tsx` | Új tab a `ColorTabs`-ban (amber); `rentalContracts` és `rentalDebtRows` state; `refreshRentals` action useEffect-en; `refreshData` bővítve; RentalTab tabContent |
| `components/finance/debt-tab-v2.tsx` | Új KPI kártya "Bérleti hátralék" (orange); új szekció a járulék után a hátralékos bérlőkkel; `rentalDebtRows?` opcionális prop |
| `components/modals/income-dialog-v3.tsx` | **B1.7**: quick-pick szekció a single-mode form tetején. Amber-keretes kártya az aktív szerződésekkel. Kiválasztáskor auto-kitölti a kategóriát (104.04/104.05 lookup), az összeget (havi vagy éves díj), és a bérlőt. Ha nincs aktív szerződés, a szekció rejtve. |

---

## Architektúra részletek

### Hátralék-számítás logika

A `calculateRentalDebts` átveszi a Vanilla JS-es `_renderBerletTartozas` viselkedést:

1. **Befizetések szervezése** két index-be:
   - `bySzemely`: `Map<id_szemely, Map<év, összeg>>`
   - `byNev`: `Map<bérlő_nev_lower_trim, Map<év, összeg>>`
2. **Aktív szerződések** (aktiv=true, deleted=false) szűrése
3. **Évenkénti elvárt díj** számítás (részarányos a kezdő/utolsó évben)
4. **Duális párosítás**: az `id_szemely` és a `berlo_nev` alapján is összegez
5. **Hátralék** = `max(0, elvart - fizett)`

### Duális párosítás — fontos megjegyzés

A Vanilla JS-es viselkedés szerint, ha egy befizetés mind az `id_szemely` mind a `berlo_nev` alapján illik a szerződéshez, **kétszer számolódik**. Ez a régi viselkedés szándékos megtartása — a docstringben dokumentálva. Jövőbeli refaktorban érdemes mérlegelni, hogy csak az `id_szemely` legyen elsődleges, a név csak fallback.

### Színkódolás (a felhasználó "fül szín = modal szín" elvét követve)

- **Bérleti szerződések fül**: `amber` (a `ColorTabs` szerint)
- **Rental modal Mentés gomb**: `bg-amber-600 hover:bg-amber-700`
- **Rental modal ikon gradient**: `from-amber-500 to-amber-600` Building2 ikonnal
- **Bérleti hátralék KPI a debt-tab-on**: `orange` (megkülönböztetésért a járulék-amber-től)
- **Hátralékos bérlő-szekció háttér**: `bg-orange-50/60` (subtle)

---

## B1.7 — Income-dialog quick-pick (IMPLEMENTÁLVA)

A 024. lépésben beilltve az `income-dialog-v3.tsx` komplex modaljához egy új szekció a `single` mode form tetején:

**Viselkedés**:
- Ha nincs aktív szerződés → a szekció rejtve
- Ha van → amber-keretes kártya "Bérleti díj rögzítése" címmel + dropdown
- Kiválasztás után:
  - **Kategória** auto-kitöltődik a `104.04` (épület) vagy `104.05` (terület) kódú befizetéscel-re (a `RENTAL_SZAMADASICEL_MAP` + categories lookup alapján)
  - **Összeg**: havi ciklus → havi díj, éves ciklus → éves díj (a user override-olhatja)
  - **Bérlő**: ha van `id_szemely` → auto-kitölti + Badge; ha csak név → a `forrasa` mezőbe kerül
  - A kiválasztás után a quick-pick kártya kompakt nézetre vált X gombbal
- **Clear**: csak a quick-pick kiválasztást nullázza, a form mezőket NEM (a user már lehet, hogy módosított rajtuk)
- Csak `single` módban jelenik meg (a batch/table mód specializált)

**Edge case: nincs befizetéscel**:
- Ha a `befizetescel` táblában nincs `104.04` vagy `104.05` kódú sor, a user warning toast-ot kap: "Nincs 104.05 kódú befizetéskategória beállítva — a kategória mezőt kézzel kell választanod."

### Egyéb halasztott apróságok

- **Bérleti szerződés import (CSV)** — későbbi backlog
- **Bérleti szerződés sablonok** (az Iktató sablonok feladattal együtt — E3)
- **Bérleti szerződés PDF nyomtatás** — későbbi backlog
- **Lejárati emlékeztető** (1 hónappal a vége előtt) — későbbi backlog
- **Bérleti szerződés módosítások történet** (audit log) — G3 audit log feladattal együtt

---

## Kockázatok és nyitott pontok

### Kockázatok

1. **`befizetescel` lookup**: ha a `befizetescel` táblában nincs `id_szamadasicel = '104.04'` vagy `'104.05'` sor, a hátralék 0 marad (a lekérdezés üres befizetéseket ad vissza). Ezt a felhasználói tesztben ellenőrizni kell SQL-lel.

2. **Duális párosítás dupla számolás**: a régi viselkedés szándékos megtartása, de jövőbeli refaktornál mérlegelendő.

3. **Cég bérlő `berlo_nev` mező**: a Vanilla JS-szel konzisztensen a `ceg_nev`-et másoljuk a `berlo_nev` mezőbe is, hogy a név-alapú befizetés-párosítás működjön. Ez nem ortogonális, de a hátralék-számítás logikája ezt feltételezi.

### Nyitott pontok (későbbre)

- B1.7 quick-pick implementáció (1 nap)
- Bérleti szerződés export Excel-be (a Vanilla JS-ben volt)
- Bérleti szerződés PDF nyomtatás
- Lejárati notification a header `notifications` rendszerbe

---

## Roadmap pozíció

A `~/.claude/plans/purrfect-coalescing-quiche.md` szerinti Q2 2026 sorrend:

1. ✅ A1 — MM RLS (kész)
2. ✅ A2 — Hardcoded PIN (kész)
3. ✅ A3 — Path traversal + Support upload MIME (kész)
4. ⏳ F1+F2+F3 — Repo higiénia (.gitignore, README, .env.example) — még nincs
5. ✅ B1 — Bérleti szerződés modul **TELJES (7/7 alfeladat)** — KÉSZ
6. ⏳ B2 — Devizás átértékelés (FX) — 1.5 hét
7. ⏳ B3 — Monetár audit + befejezés
8. ⏳ B4 — Kerületi/egyházmegyei dashboard
9. ⏳ C1 — Éves jelentések modul

---

## Kapcsolódó dokumentumok

- **B1 részletes terv**: `~/.claude/plans/purrfect-coalescing-quiche.md` (B1 szekció)
- **Tesztelési checklist**: `docs/project-tracking/KARTOTEKA-security-test-checklist-2026-04-15.md` (B1 szekció)
- **Projekt log**: `docs/project-tracking/KARTOTEKA-project-log.md` 023. lépés
- **Vanilla JS forrás**: `migration-docs/source-links/penzugy_tartozasok.js:304-691`
- **Phase TODO**: `migration-docs/todo/phase-4-finance.md` 4a alfázis (a tervet itt is dokumentáltuk)

---

**Dokumentum státusza**: VÉGLEGESÍTETT (B1 TELJES — 7/7 alfeladat)
**Felülvizsgálat dátuma**: 2026-04-15
**Következő felülvizsgálat**: manuális tesztek után + B2 (FX) implementációs terv
