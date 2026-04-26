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

---

## 2026-04-26 (késő este) — Hiányzó házastársak diagnosztikája és bulk-MERGE

### Endre észrevétele

> "A családoknál sok helyen nincs házastás pedig kellene legyen! Ellenőrizd!"

A korábbi prefix-cleanup és apa-fia swap után végignézve a Családok tabot, kiderült:
sok család **single-parent rekord** maradt — vagy csak `id_ferfi` van benne, vagy csak
`id_no`. A házaspáros megjelenítés helyett "csak férj" vagy "csak feleség".

### Diagnózis — 3 fő ok

1. **Az import single-parent rekordokat hoz létre.**  
   A `csaladok.xml` minden sora egy családfőt definiál. A
   `import_families_from_existing_persons_batch` RPC mindegyikből egy csalad-rekordot
   gyárt — vagy `id_ferfi`, vagy `id_no` van, de soha nem mindkettő. A párosítás dolga
   az `infer_family_links_for_congregation` RPC.

2. **Az auto-link RPC szűri a `csaladfo = true` szemely-eket.**  
   Viszont a `szemelyek.xml`-ben sok feleség is `Családfő` = "Igen" jelöléssel jött be
   (mert mindkettő XML-rekord így volt). Az `infer_family_links` ezeket NEM tekinti
   párosítható kandidátusnak — eredmény: 0 jelölt egy halom esetben.

3. **Két csalad ugyanazon címen.**  
   A `csaladok.xml` némelyik családnál mindkét házasfél külön sor — így mindkét
   házasfélnek lett egy-egy SAJÁT single-parent csalad-rekord, ugyanazon `(c_utcaid,
   c_szam)`-on. Ezeket MERGE-elni kell egy házaspáros rekorddá.

### Megoldás — két SQL fájl

**`migration-docs/sql/2026-04-26-FIX-missing-spouses-diagnostics.sql`** (csak SELECT):

- Single-parent vs. házaspár statisztika
- NULL `c_utcaid` rekordok száma (azoknál cím-egyezés lehetetlen)
- Strict (`csaladfo = false` szűrővel) és LOOSE (csaladfo szűrő nélkül) jelölt-számolás
- Két-csalad-egy-cím duplikációk listája

**`migration-docs/sql/2026-04-26-FIX-merge-spouses-and-loose-link.sql`** (módosítás):

- **A. MERGE**: minden férj-fő single-parent + feleség-fő single-parent ugyanazon
  címen → összevonás egy házaspáros csalad-ba (gyerekek áthelyezve, feleség-csalad
  törölve, feleség `csaladfo = false`)
- **B. LOOSE LINK**: maradt single-parent csalad-okhoz egyértelmű (1 jelölt)
  cím-egyezésen csatoljuk a házastársat — `csaladfo` szűrő nélkül; ha a jelöltnek volt
  saját single-parent csalad-rekordja, az is törlődik
- **C. csaladfo flag** korrekció: a most-házastárs-szá-vált szemely-eken `false`
- Studio bypass: superuser role-ban auth.uid() NULL is megengedett

### Endre teendői

1. Először futtasd a `2026-04-26-FIX-missing-spouses-diagnostics.sql`-t — látod hány
   családnál hiányzik a házastárs, és hány csatolható egyértelműen
2. Ha a számok rendben vannak, futtasd a `2026-04-26-FIX-merge-spouses-and-loose-link.sql`-t
3. Ellenőrizd a Tagnyilvántartás → Családok tabon: most már sok családnál látszik
   mindkét házasfél
4. Ami nem oldódott meg automatikusan (többes jelölt VAGY hiányzó cím) — az kézi
   rendezés, a Családok tab szerkesztő modaljából.

### Megjegyzés: hosszú távú megoldás

Az import wizard végén az "Auto-link" CTA-nak (`infer_family_links_for_congregation`
RPC dry-run + commit) a teljes flow része kéne legyen. A jelen állapotban a wizard
megjeleníti a "Családszerkezet összeállítása" CTA-t az 5. lépés után, de nem futtatja
automatikusan — Endre saját döntése, hogy hívja-e. A jelen SQL-fixek **adott
adatbázis-állapotra** szolgálnak, az új importok a wizard CTA-val rendezhetők.

---

## 2026-04-26 (még későbbi este) — MERGE v1 elbukott, v2 szigorúbb logikával

### Hiba a v1-ben

A diagnosztika 7-es lekérdezése (két csalad ugyanazon címen) kiderítette: sok
címen TÖBB CSALÁD lakik. Pl. a Főút 144-en 4 férj és 2 nő van single-parent
csalad-rekordként (kollégiumi/bérház), a Templom 235-en 4 Kádár-férfi és 1
Kádár Katalin (többgenerációs ház). A v1 MERGE script naiv módon próbálta
összevonni az ÖSSZES férj × feleség pár cím-egyezést — első körben sikerült,
2. körben az UNIQUE constraint (`csalad_id_no_idx`, mert Deák Ibolya = id_no=898
nem lehet 4 férfi felesége) elbukott:

```
ERROR: 23505: duplicate key value violates unique constraint "csalad_id_no_idx"
DETAIL: Key (id_no)=(898) already exists.
```

A teljes tranzakció ROLLBACK-elt, az adatbázis érintetlen maradt. ✅

### v2 — SZIGORÚBB ALGORITMUS (`2026-04-26-FIX-merge-spouses-and-loose-link-v2.sql`)

Három fázis, mindegyik csak BIZTOS-PÁROKKAL:

**A. STRICT MERGE** — csak akkor, ha (c_utcaid, c_szam)-on PONTOSAN 1 férj-fő
single-parent ÉS PONTOSAN 1 feleség-fő single-parent. Kétoldalú egyértelműség.
Példa BIZTOS pár: 65 Benkő Sándor + 66 Benkő Éva (Parókia 217), 109 Finta
Sándor + 113 Földes Ildikó.

**B. NÉV-PÁROSÍTÁS MERGE** — több családos cím (3+ rekord), de a férj-feleség
párosítás AZONOS családnévvel egyértelmű. A nő `szcs_nev` (lánykori név) is
matchelhet a férj családnevével (pl. férjezve volt Kovácsné, született Nagy
Anna). Példa: 156 Kiss Csaba ↔ 159 Kiss Irma (Főút 33), miközben 155 Kicsi
Gergely is ott van — más családnév, nem zavarja össze.

**C. LOOSE LINK** — single-parent csalad-okhoz cím-egyezésen egyetlen jelölt
(csak `csaladfo = false`!). EXCEPTION-kezelés UNIQUE-violation esetére —
nem omlik el az egész tranzakció.

### Tanulság

1. **MERGE/JOIN logika sose legyen naiv.** Mindig kétoldalú egyértelműséget
   ellenőrizz, mielőtt UPDATE-elsz UNIQUE constraint-tal védett mezőt.
2. **Több család egy címen valós eset** (kollégiumi ház, bérház, többgenerációs
   családi ház). A cím-egyezés ÖNMAGÁBAN nem elég házastárs-azonosításhoz.
3. **A maradék ambivalenciát (pl. Templom 235 / Kádár Katalin ↔ 4 Kádár-férfi)
   manuális rendezés** kéri.

---

## 2026-04-26 (éjszaka) — Studio batch + CTE concurrent execution: a v3–v6 buktatók

### A v3–v6 iteráció buktatói

A v2 ROLLBACK után 4 további iterációt végeztünk, mire működő scriptet kaptunk:

**v3** — TEMP tábla `ON COMMIT DROP`: `relation "_merge_results" does not exist` —
a Studio batch-ekben futtat, a TEMP tábla nem éli túl.

**v4** — perzisztens log-tábla (`_merge_run_log`): a script lefutott, az
adatbázis-állapot változott, DE a 6. SELECT végeredménye azonos volt a
diagnosztikával — Benkő-Benkő (1×1 BIZTOS pár) NEM lett MERGE-elve. Ez azt
jelenti, hogy a 3 DO-blokk SEM hajtódott végre, csak a CREATE TABLE és a SELECT-ek.

**v5** — egyetlen RPC `BEGIN/COMMIT`-ban: MCP-vel ellenőriztem, a
`merge_spouses_bulk` függvény NEM létezett az adatbázisban a futtatás után.
A Studio "Run" gomb csak a kurzor pozíciójában lévő statement-et futtatja
alapértelmezetten — az utolsó SELECT-et, NEM a teljes scriptet. A CREATE OR
REPLACE FUNCTION blokk emiatt nem futott le.

**v6** — PURE data-modifying CTE chain (egyetlen statement, garantáltan fut):
`ERROR: 23505: duplicate key value violates unique constraint "csalad_id_no_idx"
DETAIL: Key (id_no)=(719) already exists`. Ezt egy fontos PostgreSQL-szabály
okozza: a data-modifying CTE-k **concurrent**-ek, nem szekvenciálisak. Az
UPDATE megpróbálja `id_no=719`-et beírni, miközben a DELETE még nem hatott
a snapshot-ban → constraint violation → teljes statement ROLLBACK.

> "The sub-statements in WITH are executed concurrently with each other and
> with the main query. [...] All the statements are executed with the same
> snapshot (see Chapter 13), so they cannot 'see' one another's effects on the
> target tables." — PostgreSQL docs, [WITH Queries / Data-Modifying Statements](https://www.postgresql.org/docs/current/queries-with.html)

### MŰKÖDŐ MEGOLDÁS — v7+v8+v9

3 KÜLÖN script, mindegyikben EGY `DO $$` blokk soros lépésekkel:

```sql
DO $merge_strict$
DECLARE pair_rec record; ...
BEGIN
    FOR pair_rec IN <SELECT> LOOP
        BEGIN
            -- 1. Áthelyezzük a feleség-csalad gyerekeit
            UPDATE gyerek SET id_csalad = ferj_id WHERE id_csalad = no_id;
            -- 2. Töröljük a feleség-csaladot (felszabadítja az id_no=X bejegyzést)
            DELETE FROM csalad WHERE id = no_csalad_id;
            -- 3. Beírjuk a feleséget a férj-csaladba
            UPDATE csalad SET id_no = no_szemely_id WHERE id = ferj_csalad_id;
            -- 4. csaladfo = false
            UPDATE szemely SET csaladfo = false WHERE id = no_szemely_id;
        EXCEPTION WHEN OTHERS THEN
            -- log + skip, NE omlassza a többi pár MERGE-jét
        END;
    END LOOP;
    -- Eredményt egy perzisztens táblába (Studio NOTICE-ot nem mutat)
    INSERT INTO _merge_v7_result (phase, merged, ...) VALUES ('STRICT', ...);
END $merge_strict$;
```

Ez a forma EGYETLEN SQL statement (a DO blokk) — a Studio "Run" garantáltan
végrehajtja. Az eredményt a perzisztens tábla őrzi, hogy NOTICE nélkül is
megnézhető legyen.

### Eredmény

Az SQL-ek lefuttatása után a 201 csalad rekord így oszlott meg:

| metric | előtt | után |
|---|---|---|
| Csak férj | 66 | 63 |
| Csak feleség | 47 | 44 |
| Házaspár | 90 | **93** |
| **Összesen** | 203 | 200 |

3 új házaspár (csökkenés 3-mal a fölösleges duplikátumok törlése miatt):
- **Benkő Sándor + Benkő Éva** (Parókia 217) — STRICT
- **Finta Sándor + Földes Ildikó** (- 0) — STRICT
- **Kiss Csaba + Kiss Irma** (Főút 33) — NAMEMATCH

### Maradék — manuális rendezés szükséges

- **63 valódi single-parent csalad** — özvegy / elvált / egyedülálló (vagy a
  házastárs más címen él).
- **44 többfős cím** — több potenciális házastárs ugyanazon címen (kollégium,
  bérház, többgenerációs ház). Példák:
  - **Templom 235** — Kádár Katalin × {Zoltán, Sándor, Ernő} + Csoma Sándor
  - **Főút 144** — Deák Ibolya, Bogyó Gabriella × {Beder Levente, Bitai Lajos,
    Beder Alpár, Ilyés Zsolt}
  - **Főút 33** — Kicsi Gergely × Kiss Irma (után, mert már csatolva Kiss Csabához)

  → A lelkész manuálisan rendezi a Családok tab szerkesztő modaljából,
  ismerve a tényleges családi viszonyokat.

### Hosszú távú tanulságok

1. **Studio "Run" csak az utolsó (kurzorpozíció) statement-et futtatja**
   alapértelmezetten. Több statement esetén ki kell jelölni az egészet,
   vagy egyetlen statementbe (DO blokk vagy data-modifying CTE) kell csomagolni.
2. **PostgreSQL data-modifying CTE-ek concurrent-ek** ugyanazon snapshot-on.
   UNIQUE constraint-tal védett mezőre nem szabad CTE-chainben UPDATE-elni
   ha egy másik CTE majd DELETE-li a constraint-ütköző sort — ezt soros DO
   blokkban kell csinálni.
3. **Studio NOTICE-okat gyakran nem mutat** — érdemes az eredményt egy
   perzisztens táblába írni és külön SELECT-tel lekérdezni.
4. **MCP a Supabase-hez korlátozott** — az MCP egy MÁSIK projektre van kötve
   (Baratosi Project), nem a Kartoteka-ra. A futtatáshoz Endre kell.
