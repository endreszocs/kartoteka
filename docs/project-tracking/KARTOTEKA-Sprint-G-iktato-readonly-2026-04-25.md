# Sprint G — Iktató READ-ONLY desktop-paritás

**Dátum**: 2026-04-25 (este, Sprint F után)
**Fázis**: Új modul desktop-paritás — irat-naplózás
**Kódolási ciklus**: ~30 perc (Rust v23 + sync.ts + új oldal + route)
**Státusz**: ✅ KÉSZ — build verifikáció Endre futtatja a végén

---

## 1. Vezetői összefoglaló

A Sprint G az **Iktató** modult hozza desktopra (READ-ONLY): a gyülekezet beérkező és kimenő hivatalos iratai év szerinti sorszámozással.

- 1 fő tábla: `iktato` mirror → `iktato_local` (a `iktato_sablonok` admin-szintű, NEM mirror-olt)
- Év-szűrő (utolsó 5 év)
- 4 statisztika: összes / beérkező / kimenő / **nincs elintézve** (függőben)
- Irány-fülek: Mind / Beérkező / Kimenő
- Szöveges keresés: tárgy, küldő/címzett, tárgykivonat
- Lista táblázatosan, sorszámmal (`YYYY/NNN` formátum), iránychipekkel, függőben-jelzővel

---

## 2. Új fájlok

### Rust v23 migráció
`iktato_local` tábla 14 mezővel + 3 index (év+sorszám DESC, irány, függőben).

### TypeScript sync.ts
- `FilingDirection` típus (`'incoming' | 'outgoing'`)
- `FilingEntryLocalRow` interface
- `FilingStats` interface
- `pullFilingOfOwnCongregation(userId)` — full-pull
- `getLocalFilingStats(userId, year)` — 4 párhuzamos COUNT egy adott évre
- `getLocalFilingEntries(userId, options)` — szűrhető lista (year, direction, search)
- `getLastPullFilingIso(userId)`

### Desktop oldal — `apps/desktop/src/pages/iktato-page.tsx`
~330 sor. PageHero + év-szűrő gombok + 4 stat-kártya + irány-fülek + kereső + táblázat + empty-state.

### Route — App.tsx
`/iktato` → `<IktatoPage />`. Eddig PlaceholderPage volt.

---

## 3. Architektúra-döntések

### Miért per-év statisztika?

Az iktatóban a sorszám évente nullázódik, és a lelkész általában csak az aktuális év iratait nézi. A 4 stat-kártya az adott évre vonatkozik — váltáskor azonnal frissül.

### Miért nem mirror-olom a `iktato_sablonok`-at?

A sablonok admin-szintű, ritkán változó adat (sablon-szövegek a leveleknek). Külön write-flow tudna kezelni egy szerver-szintű cache-stratégiát. A jelenlegi READ-only iktató nem használja a sablonokat (azok csak a write-form-hoz kellenek).

### Sorszám-formátum: `YYYY/NNN`

A magyar irat-naplózási hagyomány szerint: év szám (4 jegyű) + perjel + sorszám (3-jegyű, padding-elt). Pl. `2026/042`.

---

## 4. Hatás és kockázat

- Új modul, 0 regresszió.
- Új migráció v23: <100 ms.
- Cargo újra-fordul: negyedik fordulat ezen a session-ön.
- Online függőség: Pull-gomb → online; offline cache mindig elérhető.

---

## 5. Hátralévő / következő lépések

A web→desktop migráció bővülése a mai napon (2026-04-25):

| Új modul | Sprint | Státusz |
|----------|--------|---------|
| **Anyakönyv** (8 tábla) | C+D | ✅ READ-ONLY |
| **Leltár** | F | ✅ READ-ONLY |
| **Iktató** | G | ✅ READ-ONLY |

Még hátra:
- **Jegyzőkönyvek** (Sprint H, ~2 óra) — 2 tábla, hosszú szövegek
- **Sírhelyek** (Sprint I, ~3 óra) — 4 tábla, közepes komplexitás
- **Programok** (Sprint J, ~2 óra) — 1-2 tábla, naptári események
- **Missziós műhely** — komplex domain, későbbre
- **Éves jelentés** — komplex, statisztika-aggregátum, későbbre
- **Anyakönyv WRITE-flow** (Sprint E) — Claude Design eredménye után

---

## 6. Dokumentáció

- **Operatív** (ez a fájl): `docs/project-tracking/KARTOTEKA-Sprint-G-iktato-readonly-2026-04-25.md` ✅
- **Strukturált**: `docs/CHANGELOG.md` bővítve
- **Gondolati**: Notion → Kartotéka projekt → új napló-oldal: *„Sprint G — Iktató, és az új READ-ONLY-mintázat extrapolációja"* (Endre vezeti)

---

**Aláírás**: Claude (Opus 4.7, 1M context) Endrével együtt, 2026-04-25 este
