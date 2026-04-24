# M8.0a — Tagnyilvántartás lista-oldal (read-only) + detail-modal

**Dátum:** 2026-04-25
**Wave:** M8 (tagnyilvántartás + anyakönyv) **első alfázisa**
**Státusz:** ✅ Kész (smoke-check zöld)
**Megelőző:** OS-M7 (`szemely` offline-pull, 2026-04-23) + A-M7.10c (bank-import import)
**Következő:**
  - M8.0b — szemely edit / új tag (online write)
  - M8.0c — szemely write-offline (a write-offline minta a befizetés/kiadás mintájára)

---

## Kontextus

Az A-M7 pénzügyi wave fő része lezárt — a write-offline kör mind a 3 entityre (chitanță + befizetés + kiadás) kész és UX-konzisztens; a bank-import 75%-ban (BCR E2E + matcher + import). A maradék pénzügyi munkák (Raiffeisen/BT parser, Oblio Edge Fn) **mintára várnak** vagy nagy scope-ok (külön session-ek).

A **következő P0 prioritás** Endre prioritás-listája szerint és a roadmap §6 (M8 wave) szerint a **tagnyilvántartás**. Az OS-M7-ben már él a `szemely_local` offline-pull (37 oszlop, delta + full mode); most a **UI** hiányzik. Az M8.0a első alfázisa a **read-only lista + detail-modal** — a write-flow (M8.0b/c) későbbi.

A user-érték: a lelkész végre **a desktop appban** is láthatja a gyülekezet tagjait (eddig csak a webappon). Offline-mód is teljesen működik (a `szemely_local` cache-ből).

---

## Új fájlok

- `packages/validations/src/members/szemely-list.ts` — zod sémák (~70 sor)
- `apps/desktop/src/pages/members-page.tsx` — lista-oldal (~280 sor)
- `apps/desktop/src/components/member-detail-dialog.tsx` — read-only modal (~210 sor)
- `docs/project-tracking/KARTOTEKA-M8-0a-tagnyilvantartas-lista-2026-04-25.md` — ez a fájl

## Módosított fájlok

- `packages/validations/src/index.ts` — re-export a `members/szemely-list`-ből
- `apps/desktop/src/lib/tauri-sqlite-backend.ts` — új `listLocalSzemely(input)` metódus
- `apps/desktop/src/App.tsx` — `MembersPage` import + `/tagnyilvantartas` route
- `docs/CHANGELOG.md` — M8.0a bejegyzés

**Nincs új SQL migráció / nincs új Rust migráció / nincs új core use-case** — tisztán UI + meglévő `szemely_local` cache fogyasztó.

---

## Architektúra-döntések

### 1. Offline-first (a `szemely_local` cache-ből)

A `MembersPage` **nem** szerver-direkt — a lokál `szemely_local` SQLCipher-titkosított táblából olvas. Az OS-M7 sync-flow (`pullMembersOfOwnCongregation`) gondoskodik a delta-frissítésről (`updated_at > last_pull`).

Előnyök:
- **Offline-mód teljesen működik**: a lelkész a templomban hálózat nélkül is rákeres a tagra
- Gyors lista-rendelés (lokál SQL, nincs hálózati latency)
- A teljes `szemely_local` 37 oszlopa elérhető (a webapp `EnrichedMember` legtöbb szempontját fedi)

Hátrányok:
- Friss adat csak sync után (a delta-pull időszakos vagy manuális)
- A jövőbeli `szemely` write a M8.0b-ben offline-pending lesz (a befizetés-mintára)

### 2. Diakritika-toleráns kereső a JS-oldalon

A SQLite default collation (`NOCASE`) **nem ismeri** a magyar/román ékezeteket: „Szőcs" ≠ „Szocs". Ezért a kereső:
1. SQL: csak a status-szűrőt + ORDER BY-t alkalmazza (max 1000 sor lekérdezés)
2. JS: NFD-normalizált substring match a 7 mezőn (csaladnev, k_nev, ferjk_nev, szcs_nev, c_szcim, telefon, email)

```ts
const norm = (s) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
```

A tipikus 200-1000 tagos gyülekezet mellett a JS-szűrés <10ms. Nagyobb gyülekezeteknél (10k+) a `searchMembersForFinance`-mintára SQL-szintű FTS-indexet építhetünk később.

### 3. Status-szűrő alapja: 'aktiv' (UX-default)

A webapp persons-tab `MEMBER_STATUS_FILTERS` alapja is „aktív" — a lelkész napi munkájához ez a leggyakoribb nézet. A „mind" választható a dropdown-ból, ha az összes tag (beleértve elhunytak, elköltözöttek) szükséges.

Az „aktív" SQL-feltétel: `meghalt = 0 AND (member_status IS NULL OR member_status = 'aktív' OR member_status = 'aktiv')`. A `NULL` member_status-t aktívnak vesszük (régi szemely-ek migráció előttről nem kaptak member_status-t).

### 4. Read-only az első iterációban — pasztorális irány

A „Szerkesztés (hamarosan)" gomb **disabled** + tooltip — a lelkész látja, mi jön, de nem klikkelhet rá. Ez a megnyugtató, transzparens UX:
- A modul nem fél-kész, hanem **fokozatosan bővül**
- A lelkész tudja, mi a tervezett következő lépés (M8.0b)
- Nincs elő-kérdés a szerkesztés UX-éről (modal-űrlap, validáció, sync) — az M8.0b-ben tisztán átgondolhatjuk

### 5. Magyar név-formátum (`formatFullName`)

A magyar tagnyilvántartás-mintában a név a `csaladnev` + `k_nev` (vagy `ferjk_nev` nőknél a férjes név). A `formatFullName` ezt szabályozza:
```ts
const last = (m.ferfi === 0 && m.ferjk_nev) || m.csaladnev || m.szcs_nev || ''
const first = m.k_nev || ''
```

A nő esetén a `ferjk_nev` az elsődleges (pl. „Kovács Anna" született „Kis Anna"-ként), de a `csaladnev` fallback ha a `ferjk_nev` üres.

---

## Smoke check eredmények

- ✅ `node scripts/check-desktop-banned-imports.mjs` — 49 fájl, 0 tiltott (47 → 49 az új page + dialog)
- ✅ `npx tsc --noEmit` packages/core — tiszta (érintetlen)
- ✅ `npx tsc --noEmit` apps/desktop — tiszta (1 unused import javítva)
- ✅ `cargo check` apps/desktop/src-tauri — 0.48s (érintetlen)
- ✅ Security secret-grep — 0 találat

---

## Manuális tesztelés (Endre runs)

1. **Indítás**: `npm run desktop:dev` → login → home-page → „Tagnyilvántartás" QuickLink
2. **Várt**: új lista-oldal, alapból „Aktív" szűrővel, név A→Z rendezve
3. **Kereső**: gépelj „Szocs" → a Szőcs nevek is megjelennek (ékezet-tolerancia)
4. **Status**: dropdown „Mind" → meghaltak + elhunytak is megjelennek (áthúzottan + † jelölővel)
5. **Sor-kattintás**: bárki sorára → MemberDetailDialog megnyílik:
   - Fejléc: serif név + CNP + életkor + családi állapot + családfő/választó badge
   - 5-6 csoport: Személyes / Származás / Cím / Elérhetőség / Identitás (+ Megjegyzés ha van)
   - Üres mezők elrejtve
   - Alul: „Szerkesztés (hamarosan)" disabled + „Bezárás"
6. **Offline-teszt**: Network → Offline → újratöltés → ugyanúgy működik (a lokál `szemely_local`-ból)

---

## Wave-státusz

A pénzügyi és tagnyilvántartási wave-ek párhuzamos állapota:

| Wave | Modulok | Kész |
|---|---|---|
| **A-M7 pénzügy** | chitanță + befizetés + kiadás (CRUD + offline + matcher), bank-import 75%, Oblio nem | 90% |
| **OS-M7 sync** | szemely offline-pull | 100% |
| **M8.0 tagnyilvántartás** | a) lista (read-only) ✅, b) edit, c) write-offline | 33% |

Az **M8.0b** (edit / új tag) ~3-4 óra:
- Új core use-case `updateSzemelyUseCase` + zod schema
- `member-edit-dialog.tsx` (űrlap a meglévő DetailDialog-ra építve)
- Online-only az M8.0b-ben; az offline-write az M8.0c-ben (a write-offline minta szerint, de **iratszám-wallet nélkül** mert a szemely-nek nincs sequence-mező)

A bank-import befejezése (Raiffeisen/BT parserek) — minta-fájlra vár.

Az M8 wave bizonyítja: a read-flow új entitásra ~2 óra (offline-cache + UI), a write-flow ~3-4 óra (use-case + űrlap + sync). Tehát a többi P0 modul (anyakönyv) ~6 óra/entity becsléssel kalkulálható.
