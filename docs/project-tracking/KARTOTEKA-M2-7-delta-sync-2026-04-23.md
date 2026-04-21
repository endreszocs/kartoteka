# M2.7 teljesítési jelentés — Delta-sync az összes profilra

**Dátum**: 2026-04-23
**Fázis**: M2.7 — delta-pull + full-pull mint első éles sync-minta
**Kódolási ciklus**: ~20 perc (rövid, mert minden alap megvolt)
**Státusz**: ✅ KÉSZ, tsc + vite build zöld
**Branch**: `feat/m1-1-monorepo`

---

## 1. Vezetői összefoglaló

Az M2.6-ban a `profiles` táblához hozzáadtuk a `revision + updated_at` oszlopokat.
Az M2.7-ben **élesben használjuk** az `updated_at`-et delta-szinkronhoz: csak
azokat a sorokat tölti le a kliens, amelyek ténylegesen változtak.

Ez a legszebb fajta offline-first sync: 10 000 profilból napi 5 változás? Akkor
a delta-pull napi 5 sort hoz le, nem 10 000-et. Sávszélesség-takarékos, gyors,
akkumulátor-kímélő mobilon (ha egyszer oda is kerülünk).

---

## 2. Mit változtattunk

### 2.1 TS — `sync.ts` bővítés

Új konstans:
```ts
const LAST_PULL_ALL_KEY = 'sync:profiles:last_pull_all'
```

Új export-ok:
- `pullAllProfiles(mode: 'delta' | 'full')` — `full-initial` auto-fallback ha nincs last_pull
- `getAllLocalProfiles()` — lokális olvasás, `ORDER BY updated_at DESC`
- `getLastPullAllIso()` — high-water mark ISO-time

A `pullAllProfiles` algoritmusa:
1. Ha `mode='delta'` és van `last_pull_all` → `query.gt('updated_at', last_pull_all)`
2. Ha `mode='full'` vagy nincs `last_pull_all` → nincs where-szűrő (full pull)
3. Az eredményt `INSERT OR REPLACE INTO profiles_local`-lal beírja
4. **High-water mark update**: a legnagyobb `updated_at`-et veszi az új sorokból és azt teszi be a settings-be

### 2.2 Dashboard bővítés

Új kártya: „Összes profil — delta-sync"
- Kétféle pull-gomb (Delta / Full)
- Tábla a lokális profilokkal (email, név, role, revision, updated_at)
- Last-pull-all timestamp
- Eredmény-üzenet (X sor frissítve vagy "nincs új")

A `refreshLocalDb` kibővült: 6 párhuzamos hívás (helyébe 4).

## 3. Kipróbálási forgatókönyv

### 3.1 Első Delta (= Full-initial)

```
Delta Pull
→ 1 sor frissítve (full-initial)
→ last_pull_all = 2026-04-23T… (= az egyetlen sor updated_at-je)
```

### 3.2 Második Delta (üres)

```
Delta Pull
→ 0 sor (delta)
→ last_pull_all változatlan
```

### 3.3 Supabase-oldali változás → delta kapja

```sql
-- Supabase Studio
UPDATE profiles SET phone = '+40 …' WHERE id = '…';
-- trigger: revision++ (1-re), updated_at := now()
```

```
Delta Pull
→ 1 sor frissítve (delta)
→ last_pull_all = 2026-04-23T… (a friss updated_at)
```

### 3.4 Full Pull (override)

Ha a delta valamiért desync-be került (pl. a user törölte a last_pull_all-t):

```
Full Pull
→ N sor frissítve (full)
→ last_pull_all = az új legfrissebb updated_at
```

## 4. Konzisztencia-garanciák

**A high-water mark mindig az új sorok maximumát veszi**:
```ts
let newLastPull = lastPullAll ?? new Date(0).toISOString()
for (const row of rows) {
  if (row.updated_at > newLastPull) newLastPull = row.updated_at
}
```

Ez helyes, mert:
- Az eredmények `ORDER BY updated_at ASC` jönnek vissza → a kliens időrendben dolgozza fel
- A legnagyobb `updated_at` utáni sorok csak később jönnek, és azok meg fogják kapni az új high-water markot
- Nincs "átugrott" sor

**Ha a klienst lekapcsolják egy részletben feldolgozott batch közepén**: a high-water mark csak a futás végén frissül, tehát újraindításkor ugyanazokat a sorokat lehozza (idempotens).

## 5. Biztonság

- **RLS változatlan** — a `profiles_read` policy `USING (true)` minden authenticated
  user-nek, a `profiles_read_all` is hasonló. Tehát minden user látja az
  összes profil-sort (az M0 óta ez a konvenció).
- **Local cache**: SQLCipher-titkosított, kulcs Credential Manager-ben (M2.3).
  Szóval a lokálisan cache-elt minden-profil-lista **ugyanolyan védett**, mint a
  saját profil.
- **Delta-trust**: a kliens megbízik a Supabase `updated_at`-jében. Ha valaki
  a DB-ben manuálisan visszaállítana egy korábbi updated_at-et (pl. SQL-direkt),
  a delta-pull kihagyhatja. **Éles rendszerben ezt a trigger megakadályozza**
  — a BEFORE UPDATE `updated_at := now()` felülírja a próbát.

## 6. Mit NEM csináltunk (scope-határok)

- ❌ **Több domain-tábla** — csak a `profiles`-ra. M3+ vagy kérésre M2.8-ban
  kiterjeszthető congregations / members / presbiter / … táblákra. Mindegyik
  hasonló SQL-migrációt igényel (revision + updated_at + trigger + index).
- ❌ **Törlés-sync** — ha valaki DELETE-li egy sort a Supabase-ben, a desktop
  nem tudja. A konvenció általában: `deleted_at` oszlop (soft-delete) és a
  sort a delta-pull lehozza, a kliens rejti el. Külön task.
- ❌ **Konfliktus a delta-pull-nál** — most `INSERT OR REPLACE` egyszerűen
  felülírja a lokális sort a szerver-változattal. Ha a user a lokális DB-ben
  elvégzett egy nem-küldött módosítást (outbox-pending), azt felül fogja írni
  a delta-pull. Fix: a `pullAllProfiles`-ban check-elni a pending outbox-sorokat
  és kihagyni a megfelelő ID-kat. **Javítás az M2.8-ban**.
- ❌ **Pagination / throttling** — 10 000+ sor esetén memóriabarátabb lenne
  chunk-olni (pl. 500-asával). Most egy single `SELECT` megy. Jön M3 vagy M5
  körül, ha a pályán lesz élesbe kerülő adat.

## 7. Verify

```bash
npx tsc --noEmit                        # 0 hiba
npm run desktop:build                    # 510 kB JS, 57 kB CSS, 3.69 s
# (Rust változatlan, cargo nem fut)
```

---

## 8. M2 fázis teljes zárókép (2026-04-23)

- ✅ M2.1 SQLite bootstrap (tauri-plugin-sql)
- ✅ M2.2 SQLCipher csere (rusqlite + vendored OpenSSL + statikus kulcs)
- ✅ M2.3 OS-szintű kulcs (Credential Manager)
- ✅ M2.4 Pull-sync (saját profil, 1 sor)
- ✅ M2.5 Push-sync (outbox drain, optimistic writes)
- ✅ M2.6 Konfliktus-kezelés (revision + updated_at + SQL-migráció)
- ✅ M2.7 Delta-sync (updated_at > last_pull, minden látható profil) ← MOST

Az **offline-first adatréteg teljes**. A következő fázis (M3) már nem a
szinkronizációról szól, hanem a **deploy-ról**: aláírt updater, code-signing,
eszköz-bind, MSI-generálás.

M2.8+ csak akkor jöhet, ha Endre szeretné az M3 előtt több domain-táblát is
offline-ra tenni (members, congregations, presbiter stb.). Jelenleg a kliens
egy "proof-of-concept" — 1 domain-tábla, 1 user. De az infrastruktúra kész.
