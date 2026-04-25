# M6.2a — RLS fix a 4 jegyzőkönyv-táblára (P1 blokkoló pótlása)

**Dátum:** 2026-04-21
**Fázis:** M6.2a — az M6.2 audit által feltárt 4 P1 `fail_rls_off` pótlása
**Státusz:** 🟡 SQL átadva, Endre futtatja Supabase Studio-ban

Roadmap: [`KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md`](KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md).

---

## A feltárt lyuk

Az M6.2 teljes RLS audit (lefutott 2026-04-21 Endre által):

| Prioritás | Total | OK | fail_rls_off |
|-----------|------:|---:|-------------:|
| P0        |    38 | 38 | 0            |
| P1        |    26 | 22 | **4**        |
| P2        |     6 |  6 | 0            |
| P3        |     1 |  1 | 0            |

Az M6.2b diagnostic ([`2026-04-21-m6-2b-diagnostic-p1-fail.sql`](../../migration-docs/sql/2026-04-21-m6-2b-diagnostic-p1-fail.sql)) kiadta, melyik 4:

| Modul | Tábla | rls_enabled | policy_count |
|---|---|---|---|
| jegyzokonyvek | `presbiteri_jegyzokonyvek`     | false | 0 |
| jegyzokonyvek | `jegyzokonyv_hatarozatok`      | false | 0 |
| jegyzokonyvek | `jegyzokonyv_napirendi_pontok` | false | 0 |
| jegyzokonyvek | `jegyzokonyv_resztvevok`       | false | 0 |

## Miért volt OFF a 4 tábla

A git-ben visszakövettem — a `migration-docs/sql/2026-04-12-jegyzokonyv-restructure.sql` explicit megjegyzi:

> **BIZTONSÁGI MEGJEGYZÉS:**
> Minden server action a `getEffectiveAccessContext()`-ból kapja a congregation_id-t
> és azzal szűr — így egy gyülekezet nem láthatja a másik adatait.
> **Az RLS nincs bekapcsolva** (ahogy a többi modulnál sem: munkanaplo, iktato, stb.)
> mert az app szintű szűrés biztosítja a hozzáférés-kontrollt.

Ez a **web-only architektúrában korrekt döntés** volt (Server Action mindig server-side fut, kontrollált ctx-szel). A **Tauri migráció ezt felforgatja**: a desktop kliens közvetlen, ctx nélküli Supabase-hívásokkal dolgozik, ezért RLS kötelező.

Az M6.2 audit ezért fundamentálisan a **Tauri desktop scope** szempontjából vizsgált minden táblát — más P1 modulok (`munkanaplo`, `iktato`) már jóval korábban megkapták az RLS-t (M0.4 + későbbi fázisokban), csak a 4 jegyzőkönyv-tábla maradt hátra.

## A megoldás

**Fájl:** [`migration-docs/sql/2026-04-21-m6-2a-rls-fix-jegyzokonyv.sql`](../../migration-docs/sql/2026-04-21-m6-2a-rls-fix-jegyzokonyv.sql)

### Mit csinál

1. **ENABLE ROW LEVEL SECURITY** mind a 4 táblára
2. **Parent tábla** (`presbiteri_jegyzokonyvek`): egysoros `FOR ALL` policy — `current_user_can_access_congregation(congregation_id)` a `SECURITY DEFINER` helper fn-en keresztül. Ez ugyanaz a minta, mint a `befizetes` / `kiadas` / `jarulek_kedvezmeny` policy-i (M0.4 utáni standard, a `2026-04-16-wc7-4-fazis2e-kiadas-befizetes-jarulek.sql` fájlban látható).
3. **3 child tábla** (`jegyzokonyv_hatarozatok`, `jegyzokonyv_napirendi_pontok`, `jegyzokonyv_resztvevok`): a scope a parent `congregation_id`-ján keresztül `EXISTS` subquery-vel. A child táblákban nincs saját `congregation_id` mező, csak `jegyzokonyv_id` FK a parentre.

### Backward-compatible

A meglévő Server Action-ök (`app/(dashboard)/jegyzokonyvek/actions.ts`) továbbra is működnek: a `current_user_can_access_congregation()` helper authenticated user-re a saját gyülekezetre true-t ad vissza, és a global-access role-okra (esperes, egyhazmegyei_admin, egyhazkeruleti_admin, admin) is mindenhol. A `getEffectiveAccessContext()` alapú app-szintű szűrés innentől redundáns, de nem ütközik — a defense-in-depth előnyére válik.

### Rollback

A fájl végén (kommentben) ott van a pontos ROLLBACK SQL-szekvencia. Csak akkor futtatandó, ha valami súlyos hiba derül ki; normál esetben a desktop oldalon a policy-k miatt lesznek a lekérdezések teljesek.

## Verifikáció (3 ellenőrző SELECT a fájl végén)

A fájl a `COMMIT` után **futtatható check-SELECT**-eket tartalmaz (memory: `feedback_sql_ellenorzes_egyben`):

1. **Ellenőrzés 1**: mind a 4 tábla `rls_enabled=true`, `policy_count=1`, `status='✅ OK'`
2. **Ellenőrzés 2**: policy részletek — 4 sor, mind `cmd='ALL'`, `roles={authenticated}`, USING + CHECK feltétel
3. **Ellenőrzés 3**: újra lefut az M6.2 P1 összefoglaló — várt érték: `p1_total=26, ok=26, warn_no_policy=0, fail_rls_off=0, fail_missing=0`

Ha ez teljesül: **az M6.2 audit teljes zöld**, az **M7 pénzügyi wave indulhat**.

## Kapcsolódó fájlok

- [`migration-docs/sql/2026-04-21-m6-2a-rls-fix-jegyzokonyv.sql`](../../migration-docs/sql/2026-04-21-m6-2a-rls-fix-jegyzokonyv.sql) (új)
- [`migration-docs/sql/2026-04-21-m6-2b-diagnostic-p1-fail.sql`](../../migration-docs/sql/2026-04-21-m6-2b-diagnostic-p1-fail.sql) (M6.2b, már lefutott)
- [`migration-docs/sql/2026-04-21-m6-2-rls-audit-full.sql`](../../migration-docs/sql/2026-04-21-m6-2-rls-audit-full.sql) (M6.2, már lefutott)
- [`migration-docs/sql/2026-04-12-jegyzokonyv-restructure.sql`](../../migration-docs/sql/2026-04-12-jegyzokonyv-restructure.sql) (forrás — az a fájl kapcsolta KI korábban)
- [`migration-docs/sql/2026-04-16-wc7-4-fazis2e-kiadas-befizetes-jarulek.sql`](../../migration-docs/sql/2026-04-16-wc7-4-fazis2e-kiadas-befizetes-jarulek.sql) (policy-minta)

## Alapelvi megjegyzés (memóriába is)

A Tauri migráció egy architektúrális alapelvet változtat:

> **Eddig:** „az app szintű szűrés biztosítja a hozzáférés-kontrollt, az RLS opcionális."
> **Mostantól:** „minden desktopra kerülő táblának RLS-védettnek kell lennie, mert a desktop közvetlen, ctx nélküli Supabase-hívásokkal dolgozik."

Ez **bekerül az alapelvi memóriába**, és szabályt jelent minden jövőbeli modul-hullámhoz (M7+): új desktop-integrált tábla = azonnal RLS + `current_user_can_access_congregation()` policy.

## Következő lépések

- Endre lefuttatja az M6.2a-t Supabase Studio-ban, a check-SELECT-ek eredménye visszajön
- Ha mind zöld → **M6 fázis RLS-része lezárva**, folytatás M6.3/M6.4/M6.6/M6.7-tel
- Ha nem zöld → elemezzük a hibát, javító migráció
