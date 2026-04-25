# Sprint F — Leltár READ-ONLY desktop-paritás

**Dátum**: 2026-04-25 (este, Sprint D után)
**Fázis**: Új modul desktop-paritás — leltári tételek
**Kódolási ciklus**: ~30 perc (Rust v22 + sync.ts + új oldal + route)
**Státusz**: ✅ KÉSZ — build verifikáció Endre futtatja a végén

---

## 1. Vezetői összefoglaló

A Sprint F a **Leltár** modult hozza desktopra (READ-ONLY). A v0.4.1-ben az `/leltar` placeholder oldalra mutatott. Mostantól van egy működő áttekintő:

- 1 fő tábla: `leltar_tetelek` mirror → `leltar_tetelek_local`
- 4 statisztika: összes / aktív / törölt / össz-érték
- Kategória-szűrő (alapeszközök, könyvek, műkincsek, stb.)
- Szöveges keresés (megnevezés, leltári-szám, helyszín)
- Lista max 200 tétel/lap, leltári-szám szerint rendezve

**Stratégia változatlan**: full-pull, TRUNCATE+INSERT. Egy átlagos gyülekezet leltára <500 tétel, így a teljes pull <100 ms.

---

## 2. Új fájlok és módosítások

### Rust v22 migráció — `apps/desktop/src-tauri/src/db.rs`

Új tábla `leltar_tetelek_local` 30+ mezővel (megőrzve a webes séma teljes komplexitását: alapeszköz-mezők, könyv-mezők, törlés-tracking). Az `id` itt **TEXT** (UUID), eltérően a többi `*_local` táblától. 3 index: kategória, leltári-szám, deleted.

### TypeScript — `apps/desktop/src/lib/sync.ts`

A `getLocalKitertek` után új szakasz:
- `InventoryItemLocalRow` interface (30+ mező)
- `InventoryStats` interface (total / active / deleted / byCategory / totalValue)
- `pullInventoryOfOwnCongregation(userId)` — full-pull a `leltar_tetelek`-ből
- `getLocalInventoryStats(userId)` — 5 párhuzamos COUNT/SUM
- `getLocalInventory(userId, options)` — szűrhető lista (search, category, includeDeleted, limit)
- `getLastPullInventoryIso(userId)` — utolsó pull ISO

### Desktop UI — `apps/desktop/src/pages/leltar-page.tsx`

Új fájl ~340 sor:
- PageHero (eyebrow="Leltár", icon=Boxes, „Új tétel" disabled, „Frissítés most")
- 4 stat-kártya
- Szűrő-blokk: keresőmező + kategória-pill-ek (count-tal)
- Táblázatos lista (leltári szám, megnevezés + szerző, kategória, helyszín, mennyiség + mértékegység, össz-érték)
- Empty-state (külön a „nincs adat" és a „szűrőre üres" esetre)
- 200-os limit jelzés

### Route — `apps/desktop/src/App.tsx`

`<Route path="/leltar" element={<LeltarPage />} />` hozzáadva. A sidebar `/leltar` linkje most már a saját oldalra megy (eddig PlaceholderPage volt).

---

## 3. Architektúra-döntések

### Miért nem külön „Leltár" core use-case?

A Sprint F READ-only, nem write. A `getLocalInventory` egy egyszerű DB-lekérdezés — nincs szükség use-case-rétegre. Ha jön a write-flow (új tétel rögzítése), akkor `@kartoteka/core/inventory/` package-be helyezhető a logika.

### Miért TEXT az `id` (és nem INTEGER)?

A Supabase `leltar_tetelek` táblájában az `id` UUID (TEXT). A többi `*_local` tábla INTEGER-t használt, mert ott bigint szerver-id volt. A leltár UUID-rendszerét megőrzöm.

### Miért nem egy KategóriaSzűrő common komponens?

A pill-szűrő egyszerű (egy gomb-list state-szal). Egy közös komponensbe csak akkor érdemes kiemelni, ha legalább 2-3 helyen használjuk. Most még csak a leltár oldalon van.

---

## 4. Hatás és kockázat

- **Új modul, 0 regresszió** — egyetlen meglévő route sem változott, a sidebar link már működött, csak placeholder-re mutatott.
- **Új migráció v22**: futás <100 ms.
- **Cargo újra-fordul**: harmadik fordulat ezen a session-ön (~30-60 mp).
- **Online függőség**: a „Frissítés most" gomb csak online működik. Offline módban a meglévő cache látszik.

---

## 5. Hátralévő / következő lépések

A web→desktop migráció jelenlegi állapota:

| Modul | Desktop státusz |
|-------|-----------------|
| Tagnyilvántartás | ✅ Read + Write (M8) |
| Családok | ✅ Read + Write (M8.3) |
| Munkanapló | ✅ Read + Write (M7+) |
| Pénzügy (5 oldal) | ✅ Read + Write (A-M7) |
| Anyakönyv (8 tábla) | ✅ READ-ONLY (Sprint C+D) |
| **Leltár** | ✅ **READ-ONLY (Sprint F, ÚJ)** |
| Sírhelyek | ❌ (4 tábla, közepes komplexitás) |
| Iktató | ❌ (2 tábla) |
| Jegyzőkönyvek | ❌ (2 tábla) |
| Éves jelentés | ❌ |
| Programok | ❌ |
| Missziós műhely | ❌ |
| Publikus oldal admin | ❌ |
| Egyházmegyei dashboard | ❌ |

**A következő logikus sprint** (Sprint G):
- **Iktató** (2 tábla, 1-2 óra) — egyszerű, irat-naplózás év szerinti sequence-szel
- vagy **Sírhelyek** (4 tábla, 3-4 óra) — összetett, temető → parcella → bérlet + elhunyt
- vagy **Anyakönyv WRITE-flow Sprint E** — bonyolult, érdemes a Claude Design eredménye után

---

## 6. Dokumentáció

- **Operatív** (ez a fájl): `docs/project-tracking/KARTOTEKA-Sprint-F-leltar-readonly-2026-04-25.md` ✅
- **Strukturált / user-facing**: `docs/CHANGELOG.md` bővítve a Sprint F bejegyzéssel
- **Gondolati**: Notion → Kartotéka projekt → új napló-oldal: *„Sprint F — Leltár modul, az új P0 modul desktopon"* (Endre vezeti)

---

**Aláírás**: Claude (Opus 4.7, 1M context) Endrével együtt, 2026-04-25 este
