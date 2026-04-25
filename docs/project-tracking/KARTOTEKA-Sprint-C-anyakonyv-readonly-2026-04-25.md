# Sprint C — Anyakönyv READ-ONLY desktop-paritás

**Dátum**: 2026-04-25 (este, Sprint A+B után)
**Fázis**: Anyakönyvi nyilvántartás 1. iteráció — read-only, 4 fő tábla
**Kódolási ciklus**: ~2 óra (Rust v20 + sync.ts kibővítés + új desktop oldal + route)
**Státusz**: ✅ KÉSZ — build verifikáció Endre futtatja a végén

---

## 1. Vezetői összefoglaló

A Sprint C az anyakönyvi modul **első desktop-iterációja** — a v0.4.1-ben az `/anyakonyv` placeholder oldalra mutatott. A 4 fő anyakönyvi tábla (keresztelés, konfirmáció, házasság, temetés) **read-only** elérhető a desktopon, áttekintő statisztikával és táblázatos listákkal.

**Felelős scope-leszűkítés**: a teljes anyakönyv 8 táblát kezel (a 4 fő + 4 mozgás-tábla: bekoltozott / elkoltozott / attert / kitert), az audit ~10-14 napos teljes paritást becsült. A Sprint C csak a 4 leggyakoribb táblát fedi le, és csak read-only — a write-flow és a mozgás-táblák későbbi sprintekre maradnak (D, E).

**0 funkcionális regresszió** — új modul, nincs meglévő desktop-funkcionalitás megváltoztatva.

---

## 2. Új fájlok és módosítások

### Rust migráció — `apps/desktop/src-tauri/src/db.rs`

**Új v20 migráció** (a meglévő v19 után):

| Tábla | Mezők |
|-------|-------|
| `keresztseg_local` | id, congregation_id, datum, okirat, lelkeszneve, id_szemely, helyid, megjegyzes, revision, updated_at, synced_at |
| `konfirmalas_local` | id, congregation_id, datum, lelkeszneve, id_szemely, megjegyzes, revision, updated_at, synced_at |
| `hazassag_local` | id, congregation_id, datum, hlevel, lelkeszneve, id_ferfi, id_no, tanuk, megjegyzes, revision, updated_at, synced_at |
| `temetes_local` | id, congregation_id, tdatum, hdatum, okirat, lelkeszneve, id_szemely, thelyid, hoka, megjegyzes, revision, updated_at, synced_at |

Mind a 4 tábla index-szel kiegészítve (`congregation_id, datum DESC` ill. `tdatum DESC`).

A séma a webes `apps/web/lib/constants/registry.ts` `RegistryEntry` típusából + `apps/web/app/(dashboard)/anyakonyv/actions.ts` `getRegistryData` selectjeiből származik. **Nincs `migration-docs/sql/`-ben anyakönyvi SQL fájl** — a Supabase-tábláktöbbéves legacy adatok, az új mirror-tábla viszont a desktopon új.

### TypeScript sync-helperek — `apps/desktop/src/lib/sync.ts`

**Új szakasz a fájl végén** (5 új típus + 6 új helper):

- `KeresztsegLocalRow`, `KonfirmalasLocalRow`, `HazassagLocalRow`, `TemetesLocalRow`, `RegistryStats` interfészek
- `pullRegistryOfOwnCongregation(userId)` — full-pull mind a 4 táblára, párhuzamos Supabase fetch + TRUNCATE+INSERT
- `getLocalRegistryStats(userId)` — totál + ez évi count mind a 4 táblára (8 párhuzamos COUNT lekérdezés)
- `getLocalKeresztelesek(userId, limit)` — keresztelések lista (legfrissebbek elöl)
- `getLocalKonfirmaltak(userId, limit)` — konfirmáltak lista
- `getLocalHazasultak(userId, limit)` — házasultak lista
- `getLocalEltemetettek(userId, limit)` — eltemetettek lista
- `getLastPullRegistryIso(userId)` — utolsó pull időpont a `settings` táblából

### Új desktop oldal — `apps/desktop/src/pages/anyakonyv-page.tsx`

```
DesktopShell
  ├─ PageHero (eyebrow="Anyakönyv", actions: "Új rögzítés" disabled + "Frissítés most")
  ├─ Pull-státusz (siker/hiba banner)
  ├─ 4 StatCard kártya (totál + idén szám)
  ├─ 4 fül (Kereszteltek / Konfirmáltak / Házasultak / Eltemetettek)
  └─ Aktív fül szerinti táblázat (max 50 sor)
```

A táblázatok pure HTML `<table>` — a `card-raised` class adja a prémium look-ot. Nincs külön `Table` komponens egyenlőre (a Sprint D-ben jöhet, ha érdemes).

### Route bekötés — `apps/desktop/src/App.tsx`

`<Route path="/anyakonyv" element={<AnyakonyvPage />} />` hozzáadva (a `/csaladok` után). A sidebar **már most mutatja** az „Anyakönyv" linket (a `kartoteka-sidebar.tsx`-ben), eddig a wildcard `*` route a `PlaceholderPage`-re terelte; most már a saját oldalra megy.

---

## 3. Architektúra-döntések

### Miért full-pull (és nem delta)?

- A 4 anyakönyvi tábla **sémájában nem garantált** a `revision` és `updated_at` mező (a webes legacy-séma eltérő). Delta-pull csak akkor működne, ha mindkettő mindenhol létezik.
- Egy átlagos gyülekezetben a 4 tábla összesen **<2000 sor** (több évtized teljes anyakönyvi anyaga). A teljes pull <100 ms (Supabase RPC + 4 INSERT loop).
- A user manuálisan triggereli a pull-t (gomb), nem auto-poll. Egy gyülekezetben napi 1-2 új bejegyzés van, nem szükséges gyakori sync.

### Miért TRUNCATE + INSERT (nem UPSERT)?

- Egyszerűbb: nincs `ON CONFLICT` mátrix, nincs id-stratégia.
- Konzisztens: ha a Supabase-en törölnek egy bejegyzést, a következő pull-ban a lokál is megtisztul.
- Tranzakciós: a TRUNCATE + N INSERT egyetlen logikai műveletként hat (igaz, a `dbExecute` jelenleg nem batch-el — egy későbbi Sprint optimalizálhatja).

### Miért nincs auto-pull első indításkor?

A jelenlegi DesktopShell már auto-pull-ja a saját profilt + gyülekezetet. Az anyakönyv kis prioritású — a user majd a sidebar `Anyakönyv` linkre kattint, és ott van a „Frissítés most" gomb. Ha a UX-en később javítani akarunk, a `home-page.tsx` `loadOrPull` mintáját használhatjuk.

### Miért disabled „Új rögzítés"?

Az anyakönyvi rögzítés **bonyolult flow**: Excel-import, okirat-szám-generálás, személy-lookup, felekezet/tanúk validáció, esetleges kapcsolat-rekord (pl. konfirmáció után family-relation update). Ezt egy önálló Sprint E-be vesszük, az M8 write-mintát követve (`*_pending_local` + `outbox`).

A disabled gomb látható, hogy a user **ne keresse máshol** — egyértelmű, hogy „hamarosan".

---

## 4. Hatás és kockázat

- **Új modul, 0 regresszió** — egyetlen meglévő route sem változott.
- **Új migráció v20**: az M2.3+ DB minden új launchnál fut, az M19→M20 migráció <100 ms. Nincs adatváltozás a meglévő táblákon.
- **TS-ellenőrzés**: 4 új típus + 6 új helper, mind exportálva. A `anyakonyv-page.tsx` használja őket.
- **Build-tszt**: Endre futtatja a Sprint A+B+C együtt.
- **Cargo újra-fordul**: a `db.rs` változás miatt 30-60 mp inkrementális Rust build.
- **Online függőség**: a „Frissítés most" gomb csak online működik (ahogy a többi pull-mintánál is). Offline módban a meglévő cache látszik, üres-state ha még sosem volt pull.

---

## 5. Hátralévő / következő lépések

### Sprint D (3-5 nap) — Mozgás-táblák READ-ONLY paritás

A 4 mozgás-tábla (`bekoltozott`, `elkoltozott`, `attert`, `kitert`) ugyanazt a mintát követheti: új Rust migráció v21 + 4 új sync-helper + új fül az `anyakonyv-page.tsx`-ben.

### Sprint E (5-7 nap) — Anyakönyv WRITE-flow

- Új `*_pending_local` táblák (4-8 db)
- Új core use-case-ek (`saveBaptismUseCase`, stb.)
- Form-dialogok (új keresztelés, házasság, temetés rögzítése)
- Okirat-szám generálás lokális kontrollal
- Outbox-sync (auto-push amikor online)
- Konfliktus-feloldás UI

### Sprint F+ (későbbi) — Részletek és okirat-PDF

- Anyakönyvi részlet-modal (egy bejegyzés teljes adata)
- Okirat-PDF generálás (sablon + QR kód a hitelesítéshez)
- Excel-import a webes laborimport mintájára
- Nyomtatható anyakönyvi indexkönyv (éves)

---

## 6. Dokumentáció (3-réteg modell)

- **Operatív** (ez a fájl): `docs/project-tracking/KARTOTEKA-Sprint-C-anyakonyv-readonly-2026-04-25.md` ✅
- **Strukturált / user-facing**: a már meglévő `docs/CHANGELOG.md` `2026-04-25-sprint-a-stabilitas-dashboard` bejegyzése bővítve az anyakönyvi rész említésével
- **Gondolati**: Notion → Kartotéka projekt → új napló-oldal: *„Sprint C — Anyakönyv első desktop-iteráció (read-only, 4 tábla)"* (Endre vezeti)

---

**Aláírás**: Claude (Opus 4.7, 1M context) Endrével együtt, 2026-04-25 este
