# Sprint D — Anyakönyv mozgás-táblák READ-ONLY paritás

**Dátum**: 2026-04-25 (este, Sprint C után)
**Fázis**: Anyakönyvi nyilvántartás 2. iteráció — 4 mozgás-tábla
**Kódolási ciklus**: ~45 perc (Rust v21 + sync.ts kiterjesztés + UI bővítés a meglévő oldalon)
**Státusz**: ✅ KÉSZ — build verifikáció Endre futtatja a végén

---

## 1. Vezetői összefoglaló

A Sprint C 4 fő anyakönyvi táblát (keresztelés, konfirmáció, házasság, temetés) hozott desktopra. A Sprint D **kiegészíti** a 4 mozgás-táblával: **beköltözött, elköltözött, áttért, kitért** — ezzel a teljes 8-táblás anyakönyv READ-ONLY paritáson van.

**Stratégia változatlan**: full-pull, TRUNCATE+INSERT, mert a 4 új tábla mindegyike <100 sor egy átlagos gyülekezetben, és a `revision/updated_at` mezők nem garantáltak. Egy meglévő oldal (anyakonyv-page.tsx) bővült 4 új füllel + 4 mozgás-stat compact összegzővel.

---

## 2. Új fájlok és módosítások

### Rust migráció — `apps/desktop/src-tauri/src/db.rs`

**Új v21 migráció** (a v20 után):

| Tábla | Eltérő mezők (a közös `id`, `congregation_id`, `mikor`, `id_szemely`, `megjegyzes` mellett) |
|-------|-----|
| `bekoltozott_local` | `honnanid` (adrlocality FK), `igazolas` |
| `elkoltozott_local` | `hovaid` (adrlocality FK), `kulfoldre` (boolean→INTEGER 0/1) |
| `attert_local` | `honnanid`, `felekezet` (honnan jött) |
| `kitert_local` | `hovaid`, `felekezet` (hova ment) |

Mind a 4 indexekkel: `congregation_id, mikor DESC`.

### TypeScript — `apps/desktop/src/lib/sync.ts`

**`RegistryStats` interface bővítve** 4 új mezővel a `totals` és `thisYear` alatt (bekoltozott, elkoltozott, attert, kitert).

**`pullRegistryOfOwnCongregation` átdolgozva**: most már 8 párhuzamos Supabase fetch + 8 TRUNCATE + 8 INSERT loop. A return-érték `pulledRows`-a 8 mezős. **Kompatibilis változás** — a meglévő hívók (anyakonyv-page.tsx) semmit nem törnek meg, csak az új mezőket nem nézik.

**`getLocalRegistryStats` átdolgozva**: most már 16 párhuzamos COUNT (8 totál + 8 ez évi). Egy `countAll` és `countYear` belső helper a duplikáció elkerülésére (`dateCol` paraméterrel — keresztelésnél `datum`, temetésnél `tdatum`, mozgásoknál `mikor`).

**4 új interface** a fájl végén, a Sprint D komment-szakasz alatt:
- `BekoltozottLocalRow` — id, congregation_id, mikor, id_szemely, honnanid, igazolas, megjegyzes
- `ElkoltozottLocalRow` — id, congregation_id, mikor, id_szemely, hovaid, kulfoldre (number 0/1), megjegyzes
- `AttertLocalRow` — id, congregation_id, mikor, id_szemely, honnanid, felekezet, megjegyzes
- `KitertLocalRow` — id, congregation_id, mikor, id_szemely, hovaid, felekezet, megjegyzes

**4 új list-helper**: `getLocalBekoltozottek`, `getLocalElkoltozottek`, `getLocalAttertek`, `getLocalKitertek` — ugyanaz a minta mint a Sprint C-é.

### Desktop UI — `apps/desktop/src/pages/anyakonyv-page.tsx`

**Bővítés** (full rewrite, mert sok módosulás):

- `RegistryTab` típus: 4 → 8 érték
- `TAB_LABELS` és `TAB_COLORS`: 4 új (Beköltözöttek/teal, Elköltözöttek/orange, Áttértek/emerald, Kitértek/rose)
- 4 új state-mező + 4 új lista-fetch a `Promise.all`-ban
- **Új compact mozgás-stat panel** (`MovementMini`): csak akkor látszik, ha legalább egy mozgás-rekord van. 4 mini-stat egy `card-raised` panelben, ikon + szám + idén-szám.
- **Fülek 8-elemű layoutja**: mobil 2 oszlop grid, sm+ flex-wrap (max 8 elem)
- **4 új lista-komponens**: `BekoltozottList`, `ElkoltozottList`, `AttertList`, `KitertList` — egyszerű táblázatok dátum + tábla-specifikus oszlopokkal

A 4 fő fő statisztika-kártya (fő rész) változatlan.

---

## 3. Architektúra-döntések

### Miért rewrite a `anyakonyv-page.tsx`-en (és nem 4 patch)?

A 4 új fül 4 új state-tel + 4 új lista-komponenssel + bővített Promise.all-lal **átmegy a fájl >60%-án**. A patchek áttekinthetetlenek lennének. A teljes rewrite tisztább.

### Miért nem külön „mozgás-fülrendszer"?

A webes registry-tabs.tsx mintája: minden 8 fül egy szinten van (egy fülsor). A user szempontjából érthetőbb: „ez mind anyakönyv". A mozgás-stat-rész viszont **kompakt**, hogy ne dominálja a 4 fő stat-kártyát — csak ha van adat, akkor látszik.

### Miért `kulfoldre` INTEGER (0/1) és nem BOOLEAN?

SQLite nem támogat natív BOOLEAN-t — minden boolean INTEGER 0/1. A TS-oldali interface `number`-ként deklarálja, és a `kulfoldre === 1` szöveges összehasonlítás dönti el a megjelenítést („Igen" / „Nem").

---

## 4. Hatás és kockázat

- **Funkcionális változás (user-facing)**: a desktop anyakönyv most **teljes paritás** a webesével — mind a 8 tábla látszik. A „Frissítés most" gomb mostantól 8 táblát pull-ol egy lépésben.
- **Regresszió-kockázat**: alacsony. A `pullRegistryOfOwnCongregation` interfész bővült (új mezők), de a meglévő hívók nem néztek a régi mezők számára `if`-eket — csak forwarded.
- **TS-ellenőrzés**: 4 új típus + 4 új helper, mind exportálva. A `anyakonyv-page.tsx` használja őket.
- **Build-tszt**: Endre futtatja a Sprint A+B+C+D együtt.
- **Cargo újra-fordul**: a `db.rs` változás miatt 30-60 mp inkrementális Rust build (második fordulat ezen a session-ön).

---

## 5. Hátralévő / következő lépések

### Sprint E — Anyakönyv WRITE-flow (5-7 nap, P0)

A 8 tábla READ-only után a logikus folytatás: **új keresztelés / házasság / temetés / mozgás rögzítése**. Ez bonyolult flow:
- Új `*_pending_local` táblák (4-8 db)
- Új core use-case-ek (`saveBaptismUseCase`, stb.)
- Form-dialogok (új keresztelés, házasság, temetés, mozgás rögzítése)
- Okirat-szám generálás lokális kontrollal
- Outbox-sync (auto-push amikor online)
- Konfliktus-feloldás UI

**Javaslat**: a Claude Design eredménye (új design-tokenek, form-dialóg-stílus) után érdemes elkezdeni, hogy a UI design konzisztens legyen az új vizuális rendszerrel.

### Sprint F+ — Új modulok (mintázat-extrapoláció)

A Sprint C+D minta (READ-ONLY) átemelhető a többi modulra:
- **Sírhelyek** (1-2 nap, P1) — 1 tábla, egyszerű
- **Iktató** (2-3 nap, P2) — 1-2 tábla
- **Leltár** (3-4 nap, P0/P1) — 2-3 tábla
- **Jegyzőkönyvek** (4-5 nap, P0/P1) — 2 tábla, hosszú szövegekkel

Logikus sorrend: Sírhelyek → Leltár → Jegyzőkönyvek → Iktató (egyszerűségtől a komplexitásig).

---

## 6. Dokumentáció (3-réteg modell)

- **Operatív** (ez a fájl): `docs/project-tracking/KARTOTEKA-Sprint-D-anyakonyv-mozgas-2026-04-25.md` ✅
- **Strukturált / user-facing**: a meglévő `docs/CHANGELOG.md` `2026-04-25-sprint-a-stabilitas-dashboard` bejegyzése bővítve a 4 mozgás-tábla említésével
- **Gondolati**: Notion → Kartotéka projekt → új napló-oldal: *„Sprint D — A 8-táblás anyakönyv teljes paritáson"* (Endre vezeti)

---

**Aláírás**: Claude (Opus 4.7, 1M context) Endrével együtt, 2026-04-25 este
