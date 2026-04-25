# A-M7.9d — Pending tételek a pénzügyi áttekintőn

**Dátum:** 2026-04-25
**Wave:** A-M7 (pénzügy desktop)
**Státusz:** ✅ Kész (smoke-check zöld)
**Megelőző:** A-M7.9c (konfliktus-feloldó dialog befizetés + kiadás)
**Következő:** Bank-import (BCR/Raiffeisen/BT CSV) vagy Oblio Edge Fn — külön session

---

## Kontextus

Az A-M7.9a-9c lezárta a pénzügyi write-offline és konfliktus-feloldás kört. Egy **utolsó UX-rés** maradt: a `/penzugy/attekintes` oldal nem mutatta a pending sorokat. Ha a lelkész vasárnap offline rögzít 3 befizetést, és a dashboard-on nézi az áttekintést, semmit sem látott belőlük (mert a `listIncomeUseCase` szerver-listából aggregál, és a pending még csak a `befizetes_pending_local`-ban van).

**Eredmény-kép**: a pending tételek most **külön sárga sávban** jelennek meg az áttekintő tetején — nem keverve a "hivatalos" stat-kártyákkal. Pasztorális szétválasztás:
- Stat-kártyák = "Ez van a szerveren, ez számít a könyvelésnek."
- Pending sáv = "Ez még jönni fog, amint csatlakozol."

A sávon a chipek kattinthatóak — a befizetés vagy kiadás page-re navigálnak, ahol a pending blokk látható és feloldható (A-M7.9c dialog-on át).

---

## Új fájlok

- `docs/project-tracking/KARTOTEKA-A-M7-9d-dashboard-pending-summary-2026-04-25.md` — ez a fájl

## Módosított fájlok

- `apps/desktop/src/pages/penzugy-dashboard-page.tsx` — új `pendingSummary` state + `loadPendingSummary(cid, year)` helper + `useNavigate` import + `PendingSummaryBanner` komponens (~90 sor a fájl végén); a `loadData` minden ágban (online + offline) hívja a `loadPendingSummary`-t
- `docs/CHANGELOG.md` — A-M7.9d bejegyzés

**Nincs SQL / Rust migráció.** A `listLocalPendingBefizetes` és `listLocalPendingKiadas` backend-metódusok már megvoltak az A-M7.9a-9b óta — most egy új fogyasztó (a dashboard).

---

## Architektúra-döntés: külön sáv, nem stat-kártya integráció

A natív választás lett volna a **pending összeget hozzáadni a stat-kártyához**: pl. „Bevétel 12.500 RON (+450 RON pending)". Két ok miatt nem ezt választottuk:

1. **Pasztorális tisztaság**: a lelkész a könyvelési áttekintőt a "hivatalos szerveren lévő" összegnek látja — ez a szám amit a könyvelővel egyeztet. Ha pending tételek belekerülnének, az "imaginárius" összeg válna belőle, ami félreérthető.

2. **Keep simple**: a stat-kártya és a havi bontás + Top kategóriák **egyetlen forrásból** (a szerver-listából) számolnak. Ha pending sorokat is bekevernénk, minden aggregációt duplikálnunk kellene (vagy ki kellett volna terjesztenünk a meglévő helpereket). A külön sáv egyszerűbb és karbantarthatóbb.

A kompromisszum: a **két információ egymás mellé** kerül, a user szeme könnyen összeadja, ha akarja — a chipek a tényleges összeget mutatják (`+450 RON`), nem csak a darabszámot.

### Sávszín-logika

- **Csak pending (nincs ütközés)** → borostyán (`amber-50/60` háttér + `amber-300` border + `amber-900` szöveg)
- **Van ütközés** → rose (a sáv egésze pirosra vált, a chipek belül még mindig zöld/rose-ban a tartalom-tipus szerint, de a piros badge mutatja az ütközés-darabszámot)

Ez összhangban van a `PendingIncomeBlock` / `PendingExpenseBlock` szín-konvenciójával (borostyán = sync-re vár, piros = ütközés).

### Kattintás-routing

- Befizetés-chip → `/penzugy/befizetes` (a Pending blokk a tetején, a conflict-sorok kattinthatók a dialog-hoz)
- Kiadás-chip → `/penzugy/kiadas` (ugyanígy)

Nincs külön `/penzugy/attekintes` -ből nyíló dialog — a meglévő flow elég, és a kattintás-stratégia konzisztens a `SyncStatusIndicator` shell-szintű jelölővel.

### Csendes betöltés

A `loadPendingSummary` **csendes** — ha a Tauri backend-hívás hibára fut (pl. még nem migrálódott v14 SQLCipher-DB), a banner egyszerűen elrejtődik (`setPendingSummary(null)`). Nem zavarja a lelkészt, és a dashboard online-flow-ja zavartalan marad.

A `loadData` mindkét ágában (online-ág `try/catch/finally` után + offline-ág végén) az `await loadPendingSummary(...)` lefut. Mivel `await`, a loading-state addig folyik (a banner már a kész állapot része lesz).

---

## Smoke check eredmények

- ✅ `node scripts/check-desktop-banned-imports.mjs` — 46 fájl, 0 tiltott (változatlan az A-M7.9c után)
- ✅ `npx tsc --noEmit` apps/desktop — tiszta
- ⚠ Cargo nem futtatva (nincs Rust változás)

---

## Manuális tesztelés (Endre runs)

1. **Üres állapot**: `/penzugy/attekintes` — nincs pending → banner nem látszik (változatlan UX).
2. **Pending megjelenés**: a befizetés-oldalon offline rögzítesz 1 tételt → a tárcán látod a pending blokkban → vissza a `/penzugy/attekintes`-re → a tetején borostyán sáv: „1 offline-rögzített tétel szinkronizálásra vár" + chip „1 befizetés · +X RON".
3. **Kattintás**: a chipre kattintva visszanavigál a befizetés-oldalra (ahol a sor kezelhető).
4. **Sync utáni állapot**: hálózat vissza → 30 mp után újra-megnyitva (vagy „Frissítés" gombbal) — a banner eltűnik (a stat-kártyán pedig megjelenik az új tétel a szerverre került összegben).
5. **Ütközés-jelzés**: ha a `Pending blokk`-ban van conflict-sor (manuálisan szimuláld 23505-tel) → a sáv pirosra vált, „1 ütközés feloldásra vár" + a chipben rose-100 badge.

---

## Wave-státusz update

A pénzügyi A-M7.9 al-wave **TELJES** (4 alfázis):

| Alfázis | Tartalom | Státusz |
|---|---|---|
| A-M7.9a | Befizetés write-offline (iratszám-tárca rendszer) | ✅ |
| A-M7.9b | Kiadás write-offline (közös infrastruktúra) | ✅ |
| A-M7.9c | Konfliktus-feloldó dialog (közös, befizetés + kiadás) | ✅ |
| A-M7.9d | Pending tételek a pénzügyi áttekintőn | ✅ |

A pénzügyi desktop most **konzisztensen** kezeli a write-offline-t mind a 3 entityre (chitanță + befizetés + kiadás), van konfliktus-feloldó UX, és az áttekintő látja a pending sorokat is.

**A-M7 wave hátralevő munkái** (külön session-be defer-elve):
- Bank-import (BCR/Raiffeisen/BT CSV) — 3 parser + matcher + UI, ~5 óra
- Oblio / e-Factura Edge Fn — secret-gateway + UI, ~2-3 nap

Az M8 wave (tagnyilvántartás-write + anyakönyv) most már elindítható — a write-offline minta bizonyított és újra-felhasználható.
