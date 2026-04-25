# KARTOTEKA — Tagnyilvántartás Auto-Link + nem-mező biztonsági rendszer

**Dátum**: 2026-04-26
**Státusz**: kód kész, build + lint zöld; SQL Endre futtatja; lelkészi élesteszt hátra
**Téma**: az import wizard 4. lépés (Eredmény) után új 5. lépés — automatikus családszerkezet
összeállítása. Plusz: hiányzó nem-mező biztonsági ellenőrzés.

## Endre kérése

Két kapcsolódó feladat:

1. **Családszerkezet auto-link**: „Hogyan oldod meg a személyek, házastársak és gyerekek
   hozzárendelését a családhoz? automatikus kellene legyen a bevitt információk alapján!"
2. **Hiányzó nem-mező audit**: „Ha hiányzik, hogy férfi vagy nő az importált személy,
   akkor nézd meg hogy erre van-e beépített biztonsági ellenörző rendszer!"

## 1. Auto-link tervezés és Endre döntései

Tervezés után 4 kérdést tettem fel; minden „Ajánlott" opciót elfogadott:

| Kérdés | Válasz |
|---|---|
| Hol fusson le? | Manuálisan, külön CTA gomb (Eredmény-step után) |
| Agresszivitás? | Konzervatív (csak biztos egyezések) |
| Lebegő tagok? | Külön szűrő a tagnyilvántartáson, kézi sorbarendezés |
| Több család egy házban? | Több csaladfo=true → több család (mindegyiknek saját csalad) |

## 2. Algoritmus

### Menet 1 — Cím-alapú házastárs-jelölés

Minden `csalad` rekord, ahol `id_no IS NULL` VAGY `id_ferfi IS NULL`:
- Találd meg a `head` szemely-t (a már beállított id_ferfi vagy id_no)
- Keress ugyanazon `(c_utcaid, c_szam)`-on felnőtt másnemű szemely-t, aki:
  - NEM csaladfo
  - NEM szerepel másik családban (id_ferfi/id_no/gyerek)
  - Felnőtt (≥ 16 éves vagy ismeretlen sz_datum)
- Ha pontosan 1 jelölt → házastársként hozzáadás (UPDATE csalad SET id_no/id_ferfi)

### Menet 2 — Szülő-név alapú gyerek-egyezés

Minden szemely, ahol `csaladfo = false` ÉS nincs családban ÉS van `apjaneve`/`anyjaneve`:
- 2a. Próba: apjaneve egyezés (ferfi=true szülő ugyanazon a címen)
  - LIKE-egyezés a `namepattern`-rel (case-insensitive)
  - VAGY teljes egyezés a `csaladnev + k_nev`-vel
- 2b. Ha nincs apa-egyezés, próba: anyjaneve egyezés (ferfi=false szülő ugyanazon címen)
  - LIKE-egyezés a `namepattern`-rel (a házassági nevet is figyeli)
  - VAGY a `szcs_nev + k_nev` (lánykori név) — ami az „Anyja" mezőben tipikus
- Ha pontosan 1 szülő-jelölt → keressük az ő `csalad`-ját → INSERT INTO `gyerek`

### Menet 3 — Lebegő (floating)

Minden szemely, aki nincs `csalad`-ban (id_ferfi/id_no), nincs `gyerek`-ben → marad „lebegő".
Megjelenik a Preview Review-ban + a tagnyilvántartás új szűrőjében.

### Confidence szintek

| Szint | Mikor | Conservative módban |
|---|---|---|
| `high` | Cím-egyezés + (név-egyezés VAGY egyetlen jelölt másnemű) | ✅ Alkalmazódik |
| `medium` | Csak név-egyezés (más cím) VAGY több jelölt | ❌ Csak Review |
| `low` | Csak fuzzy név (még nincs használva) | ❌ Csak Review |

## 3. Új DB tábla + 4 RPC

`migration-docs/sql/2026-04-26-family-link-inference-rpc.sql`:

- **`family_link_audit` tábla** — minden auto-link batch_id-vel rögzítve, RLS-védett
  (master admin VAGY delegated session ugyanahhoz a gyülekezethez)
- **`_can_manage_family_links(target_congregation_id)`** — DRY jog-check helper
- **`infer_family_links_for_congregation(target_congregation_id, mode, dry_run)`** — fő RPC,
  visszaad JSONB summary + details-szel
- **`revert_family_link_batch(target_batch_id)`** — egy konkrét batch teljes visszafordítása
  (csalad UPDATE-ek + gyerek DELETE + audit reverted_at)
- **`list_family_link_batches(target_congregation_id, limit)`** — admin nézet az utolsó
  N batch-ről (jövőbeli admin-panel támogatás)

## 4. Hiányzó nem-mező biztonsági audit

### Mit találtam

| Réteg | Korábban | Most |
|---|---|---|
| Kézi forma (member-form-dialog) | Zod kötelező — OK | OK marad |
| Import profil (PROFILE_PERSONS) | `required: false` | Marad opcionális |
| `row-transformer.ts` | NULL → null csendben | Marad |
| `import_family_head_batch` RPC | `COALESCE(.., true)` — csendben férfi | **Smart inference + warning** |
| Result-step UI | Minden hiba pirosan, severity nélkül | **3 szint: error/warning/info** |

### Smart inference szabályok az SQL-ben

```sql
IF explicit_ferfi IS NOT NULL THEN
    inferred_ferfi := (row_data->>'ferfi')::boolean;
ELSIF NULLIF(btrim(COALESCE(row_data->>'ferjk_nev', '')), '') IS NOT NULL THEN
    -- Van Férje → biztosan nő
    inferred_ferfi := false;
    -- + 'info' jegyzet az error_list-be
ELSE
    -- Default férfi + 'warning' jegyzet
    inferred_ferfi := true;
    -- error_list += { severity: 'warning', message: '...alapértelmezésben férfiként...' }
END IF;
```

### Result-step megjelenítés

Severity-szerinti bontás 3 színnel:
- 🔴 **Hibás sorok (kihagyva)** — kötelező mezők hiánya, alapból nyitva
- 🟡 **Figyelmeztetések** — beszúrva, ellenőrizendő (pl. nem mező nem volt)
- 🔵 **Tájékoztató jegyek** — automatikus következtetések, csak FYI

A toast üzenet is finomodott: ha vannak warning-ok, `toast.warning(...)` jelenik meg.

## 5. Új UI komponens — FamilyLinkStep

`components/members/tagnyilvantartas-import/family-link-step.tsx` — 4 stage:

- `idle` → `previewing` (auto, beléptkor)
- `previewing` → `review` (preview JSON megérkezett)
- `review` → `applying` (apply gomb)
- `applying` → `done` (eredmény + revert lehetőség)

A wizard `STEPS` tömbje 4 → 5 elem, új `family-link` lépés. A `result-step`-en megjelenik
egy CTA: „Családszerkezet összeállítása" amely átvált rá.

## 6. „Csak család nélküli tagok" szűrő

`lib/constants/members.ts` `MEMBER_STATUS_FILTERS` bővítve egy új `'lebego'` értékkel.
A `persons-tab.tsx` filter-logika:

```ts
if (statusFilter === 'lebego')
    return m.familyId === null && !m.meghalt && !m.elkoltozott
```

Az `EnrichedMember.familyId` már létezett (a `personToFamilyMap`-ből számolódik a
`getMembers` actionben — pontosan a férj/feleség/gyerek-kapcsolatok alapján).

## 7. Verifikáció

- ✅ `npx tsc --noEmit -p apps/web/tsconfig.json` — TypeScript zöld
- ✅ `npx eslint components/members/tagnyilvantartas-import lib/import` — ESLint zöld

### Élesteszt (Endre)

1. SQL futtatás (kettő) Supabase Studio-ban:
   - `migration-docs/sql/2026-04-25-import-wizard-family-head-rpc.sql` (frissítve — smart inference)
   - `migration-docs/sql/2026-04-26-family-link-inference-rpc.sql` (új)
2. Import wizard `csaladok.xml` futtatás → eredmény-step → „Családszerkezet összeállítása" CTA
3. Preview megjelenik:
   - Várhatóan ~200+ csalad most már id_no IS NULL-ral van
   - Cím-egyezés alapján a feleségek hozzárendelődnek
   - Az Apja/Anyja mezővel rendelkező szemely-ek gyerekként
4. Apply → Toast „X házastárs + Y gyerek hozzárendelve"
5. Tagnyilvántartás → Személyek → szűrő „Csak család nélküli tagok" → maradék kézzel
6. Hiányzó nem teszt: szerkessz egy szemely-t és törölje a Férfi mezőt → import → result-step
   warning-szekciója megjelenik

## 8. Nyitott pontok — későbbre

- **Mérsékelt + Agresszív módok**: most csak placeholder (`disabled` button-ok). Ha igény van,
  bővíthető a `mode` paraméter szerint (egy jelölt esetén is medium-confidence apply,
  vagy a legidősebb másnemű automatikus választása).
- **Több generáció egy házban smart elválasztása**: a "több csaladfo → több család" szabály
  most nem hoz létre új csalad-rekordot a meglévő szemely-ek alapján — ezt a következő
  fázisban lehetne (egy új mode: 'derive_families_from_csaladfo').
- **Admin panel batch lista**: a `list_family_link_batches` RPC már létezik, de a UI még nem
  hivatkozza. Az admin „Eszközök, licencek, napló" tabba bekerülhet egy „Auto-link előzmények"
  szekció.

## Hotfix — `42P01: relation "found_id" does not exist` (2026-04-26 délután)

### Hibajelentés

Endre a 2026-04-25 SQL-t (`import-wizard-family-head-rpc.sql`) futtatta a Supabase Studio
SQL Editor-ban (egész fájl egy körben), és a következő hibát kapta:

```
ERROR: 42P01: relation "found_id" does not exist
```

### Diagnózis

A `found_id` egy DECLARE-blokkban deklarált PL/pgSQL **változó** volt a
`_resolve_or_create_locality` és `_resolve_or_create_street` függvényekben.
A `42P01` Postgres error code = "undefined_table".

**A hiba oka**: a `SELECT id INTO found_id FROM ...` szintaxis kétértelmű:
- **PL/pgSQL kontextusban**: assignment a `found_id` változóba
- **Plain SQL kontextusban**: `CREATE TABLE found_id AS SELECT ...` szándék (új tábla)

Amikor a Supabase Studio nagy fájlokat futtat egyetlen körben, néha **elveszti a `$$`
quoting kontextust** a függvény body-ja körül — és a Postgres parser plain SQL-ként látja
az `INTO found_id`-t, mintha új táblát akarna létrehozni.

### Javítás (2-szintű bombabiztosítás)

**1. Explicit dollár-tag** mindkét SQL fájl ÖSSZES függvényének:

| Fájl | Függvény | `$$` → tag |
|---|---|---|
| 2026-04-25 | `_resolve_or_create_locality` | `$resolve_locality$` |
| 2026-04-25 | `_resolve_or_create_street` | `$resolve_street$` |
| 2026-04-25 | `import_family_head_batch` | `$import_family_head$` |
| 2026-04-26 | `_can_manage_family_links` | `$can_manage_family_links$` |
| 2026-04-26 | `infer_family_links_for_congregation` | `$infer_family_links$` |
| 2026-04-26 | `revert_family_link_batch` | `$revert_family_link_batch$` |
| 2026-04-26 | `list_family_link_batches` | `$list_family_link_batches$` |

**2. `:=` assignment a `SELECT INTO` helyett** a helper függvényekben — a `:=` operator
**csak PL/pgSQL-ben létezik**, sose ütközik plain SQL-lel:

```sql
-- ELŐTTE (kétértelmű, parser bug-ra érzékeny)
SELECT id INTO found_id
FROM public.adrlocality
WHERE LOWER(name) = LOWER(cleaned_name)
LIMIT 1;

-- UTÁNA (PL/pgSQL only, sose ütközik plain SQL-lel)
v_found_id := (
    SELECT id FROM public.adrlocality
    WHERE LOWER(name) = LOWER(cleaned_name)
    LIMIT 1
);
```

A `RETURNING ... INTO var` szintaxist meghagytam (PL/pgSQL only, nincs ütközés).

**Bonus**: A smart gender inference nested DECLARE/BEGIN/END blokkját kivettem az
`import_family_head_batch` RPC-ből — a változókat felvittem a fő DECLARE-be (flat
struktúra). Ez kisebb parser-érzékenység + tisztább kód.

### Endre teendői (újra)

1. **A 2026-04-25 SQL-t futtasd újra** — `CREATE OR REPLACE FUNCTION` idempotens
2. **A 2026-04-26 SQL-t futtasd a 25-ös után**
3. Az ellenőrző SELECT-ek a fájlok végén megmutatják, hogy a függvények létrejöttek-e

## Hivatkozások

- Plan fájl: `C:\Users\endre\.claude\plans\szia-folytatjuk-a-kartot-ka-immutable-sketch.md`
- CHANGELOG: `docs/CHANGELOG.md` — `[2026-04-26] — Auto-link családszerkezet + nem-mező biztonsági ellenőrzés`
- Korábbi project log: `KARTOTEKA-tagnyilvantartas-import-wizard-2026-04-25.md`
