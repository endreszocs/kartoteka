# Kartotéka — M7: Tagnyilvántartás offline lista (szemely pull-sync)

**Dátum**: 2026-04-23
**Fázis**: M7 (első sok-rekordos domain-tábla sync)
**Státusz**: Kód kész, SQL trigger-migráció futtatandó (Endre Supabase Studio-ban)
**Előző fázis**: [M6 — congregations sync](./KARTOTEKA-M6-congregations-sync-2026-04-23.md)
**Következő fázis**: M7.4 (csalad join) vagy M7.5 (member write)

## Miért ez jön most

Az M6 bebizonyította: a domain-tábla sync minta **átvihető**. Most az első olyan táblára alkalmazzuk, ami **sok sort** tárol (a congregations 1 sor/lelkész, a szemely 500-2000 sor/gyülekezet).

A lelkészi offline-munka **szíve** ez: családot látogatni, tagokat nyilvántartani — a congregations nélkül is el lehet ezt képzelni, de a szemely nélkül a desktop-app **nem veszi át** a webes szerepkört.

## Fázisok

| Fázis | Mit csinált | Státusz |
|-------|-------------|---------|
| **M7.0** | Supabase SQL: trigger + index `szemely`/`csalad`-ra | ✅ SQL kész |
| **M7.1** | Rust v5: `szemely_local` (37 oszlop, 5 index) | ✅ cargo check OK |
| **M7.2** | TS sync: `pullMembersOfOwnCongregation` + olvasók | ✅ tsc OK |
| **M7.3** | UI: „Gyülekezet tagjai" Card + keresés | ✅ tsc OK |
| **M7.4** | `csalad` join (család-nézet) | ⏳ Később |
| **M7.5** | Írás (új tag / módosítás) | ⏳ Később |

## Scope V1

### Bekerült oszlopok (37)

| Csoport | Oszlopok |
|---------|----------|
| **Core identity** | id, cnp, szcs_nev, k_nev, csaladnev, ferjk_nev, allapot |
| **Személyes** | sz_datum, ferfi, csaladfo, meghalt, member_status |
| **Családfa** | apjaneve, anyjaneve, id_apja, id_anyja |
| **Cím** | c_szam, c_tombhaz, c_lepcsohaz, c_ajto, c_emelet, c_szcim |
| **Elérhetőség** | telefon, email |
| **Vallás/identitás** | vallas, foglalkozas, nemzetiseg, voter_eligible |
| **FK-k** | congregation_id, family_id |
| **Egyéb** | type, isvisible, megjegyzes |
| **Sync** | revision, updated_at, synced_at |

### Kihagyva V1-ből

- **`szig`, `taj`** (szig.szám, TAJ-szám) — érzékeny PII, külön megbeszélés után
- **`kep`, `photo_url`** (fotók) — külön fázis (Supabase Storage cache szükséges)
- **`sz_helyid`, `c_utcaid`, `c_helysegid`** (FK-k cím-táblákhoz) — V1-ben a `c_szcim` string elegendő
- **`befizetoev`** — admin-oldali pénzügyi mező, lelkészi app-ban nincs szerepe
- **`created`, `namepattern`** — historikus / megjelenítési finomságok

## Implementáció — háromlépcsős minta

### 1. Supabase SQL migráció (`2026-04-23-m7-0-szemely-csalad-triggers.sql`)

**Fontos megjegyzés**: az `szemely.revision` + `szemely.updated_at` oszlopok **MÁR LÉTEZTEK** a sémában (l. `migration-docs/Database_schema.sql` L2013-2014), ugyanígy a `csalad`-on is (L507-508). **Csak a trigger hiányzott**.

**Mit csinál:**
- `tg_szemely_bump_revision()` + `BEFORE UPDATE trigger szemely_bump_revision`
- `tg_csalad_bump_revision()` + `BEFORE UPDATE trigger csalad_bump_revision` (M7.4-re előkészítve)
- `idx_szemely_updated_at`, `idx_csalad_updated_at` (delta-sync)
- `idx_szemely_congregation_id` (per-gyülekezet pull gyorsítása)
- 6 verifikáló `SELECT` a fájl végén

### 2. Rust v5 migráció (`apps/desktop/src-tauri/src/db.rs`)

**Tábla**: `szemely_local` 37 oszloppal + 5 index.

**Típus-mapping**:
- `integer` → `INTEGER` (szemely.id NEM uuid, hanem szekvenciális szám!)
- `uuid` → `TEXT` (congregation_id, family_id)
- `boolean` → `INTEGER` (0/1)
- `date` → `TEXT` (ISO 'YYYY-MM-DD')
- `timestamp with time zone` → `TEXT` (ISO 8601)

**Index-stratégia**:
- `congregation_id` → per-gyülekezet pull-szűréshez
- `family_id` → M7.4 család-nézetre
- `csaladnev`, `cnp` → UI-keresés gyorsítása
- `updated_at` → delta-sync high-water mark

### 3. TS sync-layer (`apps/desktop/src/lib/sync.ts`)

**Új elemek** (kb. 380 sor):
- `MemberLocalRow` interface — lokális SQLite sor típusa (boolean-ok INTEGER-ként)
- `MemberSupabaseRow` interface — szerver-oldali sor (boolean-ok JS-boolean-ként)
- `MEMBER_SELECT_COLS` konstans (34 oszlop a Supabase select-hez — elég hosszú, hogy az `as unknown as` cast kötelező)
- `LAST_PULL_MEMBERS_KEY_PREFIX` + `memberLastPullKey(cg_id)` — **per-gyülekezet** last_pull (egy user több gyülekezetet is szinkronizálhat a jövőben)
- `pullMembersOfOwnCongregation(userId, mode)`:
  - `mode === 'delta'` → `updated_at > last_pull` szűrővel
  - `mode === 'full'` vagy első futás → `full-initial` mode
  - `no-congregation` visszajelzés, ha a user-nek nincs gyülekezete (super-admin)
  - ON CONFLICT upsert — duplikáció-mentes
- `getLocalMembersOfOwnCongregation(userId, options)` — LIKE-keresés, élő/elhunyt szűrő
- `getLocalMemberCount(userId)` — gyors `COUNT(*)` aktív tagra
- `getLastPullMembersIso(userId)`

### 4. Dashboard UI (`apps/desktop/src/pages/dashboard-page.tsx`)

**Új Card**: "Gyülekezet tagjai — offline lista"

**Helye**: a „Saját gyülekezet" Card után, „Összes profil" Card előtt.

**State** (7 új változó):
- `members: MemberLocalRow[]`
- `memberSearch: string` (reactive input)
- `memberIncludeDeceased: boolean` (checkbox)
- `lastPullMembers: string | null`
- `pullingMembers: boolean`
- `pullMembersError: string | null`
- `pullMembersResult: string | null`

**React useEffect** külön az aktív lista frissítésre (deps: `[user, dbAvailable, memberSearch, memberIncludeDeceased]`) — a LIKE-szűrés SQLite-ban gyors, nem szükséges debounce.

**UI-részek**:
- Pull gombok (Delta / Full) + utolsó pull-idő
- Kereső-box (név + CNP) + "Elhunytakat is" checkbox + tag-szám
- Táblázat 6 oszloppal: Név, CNP, Szül., Telefon, E-mail, Státusz
- **Első 100 sor** jelenik meg + "szűkítsd a keresést" tipp
- Helper: `formatMemberName(m)` — családnév (vagy férjezett) + keresztnév kombinálás

## Verifikáció

### Fordítás
- `npx tsc --noEmit` : 0 hiba
- `cargo check` : OK (`Finished dev profile in 12.64s`)

### Manuális teszt-lépések

1. **Supabase Studio SQL Editor** → futtatás: `2026-04-23-m7-0-szemely-csalad-triggers.sql`
   - Várt: 4a (szemely trigger), 4b (csalad trigger), 4c (2 függvény), 4d (3 index), 4e (per-gyülekezet member-count), 4f (csalad-count)
2. **Desktop**: `npm run desktop:dev` (vagy Ctrl+R a futó ablakban)
   - A v5 migráció auto-fut, új `szemely_local` tábla jön létre
3. **Dashboard** → „Gyülekezet tagjai" Card → **Full Pull** gomb
4. **Várt viselkedés**:
   - Full pull 500-2000 tagot egyszerre letölt (a te gyülekezetedben)
   - Megjelenik az első 100 tag ábécé-sorrendben
   - Keresd ki: pl. saját családnév — LIKE-egyezés
   - Elhunyt-checkbox: a listáknál látszik a különbség
5. **Offline-teszt**: húzd ki a Wi-Fi-t → a kereső továbbra is működik (a SQLite-ban van minden)

## Kockázatok

1. **Nagy sor-szám pull**: ha egy gyülekezetnek 2000+ tagja van, a full pull lassú lehet. Supabase default limit 1000 — ha túl sok, a `.range()` / pagination-ra lesz szükség M7.6-ban.
2. **Supabase `unknown` cast**: a select-string hossza miatt a Supabase type-inference lenyal. `as unknown as MemberSupabaseRow[]` cast kötelező.
3. **LIKE-keresés case-sensitivity**: a SQLite default `LIKE` case-insensitive ASCII-re, de a magyar ékezetekre (ű, ő) nem tökéletes. M7.6-ban lehet SQLite FTS5 (full-text search) + `unicode61` tokenizer.
4. **M7.0 trigger-futtatás nélkül is működik a pull**: a `revision`/`updated_at` oszlopok MEG VANNAK, így a select-er hiba nem történik. De ha valaki a szerveren UPDATE-el egy tagot, a `revision` nem fog növekedni — a jövőbeli konfliktus-detektálás inaktív marad. Ezért is fontos futtatni a trigger-SQL-t.

## Összegzett fájlok

| Fájl | Sorok | Mit változtatott |
|------|-------|------------------|
| `migration-docs/sql/2026-04-23-m7-0-szemely-csalad-triggers.sql` | +140 | ÚJ SQL migráció (trigger + index) |
| `apps/desktop/src-tauri/src/db.rs` | +100 | v5 migráció (szemely_local tábla) |
| `apps/desktop/src/lib/sync.ts` | +380 | MemberLocalRow + pullMembersOfOwnCongregation + 3 olvasó |
| `apps/desktop/src/pages/dashboard-page.tsx` | +200 | új Card + state + handler + formatMemberName helper |
| `docs/CHANGELOG.md` | +65 | M7 bejegyzés a tetejére |
| **Összesen** | **+885 sor** | 5 fájl, +1 új SQL |

## Tanulságok

1. **A `szemely.revision` ELŐRE OTT VOLT a sémában**. Nem tudom, ki készítette elő, de ez egy jel: a rendszer régi fejlesztőinek volt vízjele egy offline-sync irányba. Tiszteletet érdemel az előre-gondolkodás.

2. **37 oszlop kényes**. A `szemely` egyértelműen a legnagyobb tábla, amit eddig lokális szintre hoztunk. A másik oldalon (M7.4, csalad) **13 oszlop** van — az sokkal könnyebb lesz. Érdemes lesz egy helper-függvényt csinálni a jövő táblákhoz (`upsertLocal<Table>(row)`), mert ez a 37-mezős INSERT/ON CONFLICT DO UPDATE SQL kódja nehezen karbantartható.

3. **Keresés SQLite-ban elég gyors ~1000 sorra**. Nem debounce-oltam a search input-ot — minden karakterre újra fut a `getLocalMembersOfOwnCongregation`. SQLite LIKE index nélkül is <10 ms 2000 sorra. Ha 10k+ sorra megy (pl. érsek-gép), akkor FTS5 kelleni fog.

4. **Delta-sync per-gyülekezet kulccsal**. A `sync:members:last_pull:<cg_id>` forma lehetővé teszi, hogy egy user (pl. egyházmegyei adminisztrátor) több gyülekezetre is külön szinkronizáljon. Ez egy **jövőbeli kiterjesztés** lehetőségét hagyja nyitva.

## Következő lépés — M7.4 vagy M7.5?

- **M7.4 — `csalad` join**: a tagokat család-csoportokba rendezi. UX-szempontból: „Családok listája" → családot kiválasztva a tagok megjelennek. Kis tábla, gyors implementáció.
- **M7.5 — Szemely írás**: új tag felvétele, adat módosítás. Nagyobb munka (UI form + validáció + outbox), de a **pénz-ponta**: itt lesz a desktop app először **writer** és nem csak reader.

**Javaslat**: M7.4 először (olcsó, a UI-hoz hozzáad struktúrát), utána M7.5 (drága, de lényeges).
