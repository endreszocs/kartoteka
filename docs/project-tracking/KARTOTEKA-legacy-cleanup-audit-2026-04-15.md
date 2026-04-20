# KARTOTEKA — Legacy DB cleanup audit

**Dátum**: 2026-04-15
**Implementációs forrás**: `~/.claude/plans/purrfect-coalescing-quiche.md` — "C. Cleanup feladatok (Legacy táblák)"
**Projekt log lépés**: 036.

---

## Vezetői összefoglaló

A Supabase adatbázis `public` schema 100 táblát tartalmaz. A kód-szintű audit + FK-ellenőrzés kiderítette: **19 tábla teljesen elavult** — DOS-eredetű config, régi import staging, vagy olyan legacy struktúra, amit az új séma helyettesít. Ezek NEM rendelkeznek sem kód-hivatkozással (0 `.from('...')`), sem bejövő FK-val. 

A cleanup **kétfázisú**:
1. **Soft-drop (ma, 2026-04-15)**: átnevezzük `_ARCHIVE_2026_04_15` postfixszel. A tábla és az adatok megmaradnak, de a `public` schema-ban már nem "zavarnak". Rollback: egyetlen RENAME.
2. **DROP TABLE (2026-05-15, 30 nap múlva)**: véglegesen töröljük. Rollback: Supabase PITR.

---

## Módszertan

### 1. Code reference audit

```bash
grep -rn "\.from(['\"]TABLE_NAME['\"]\|FROM TABLE_NAME\|INTO TABLE_NAME\|UPDATE TABLE_NAME" \
  --include="*.ts" --include="*.tsx" --include="*.sql" . \
  | grep -v "Database_schema.sql\|node_modules\|migration-docs/source-links\|.next"
```

Azok a táblák, amikre **0** találat érkezett, az aktív Next.js kódból nincsenek használva.

### 2. FK hivatkozás audit

```bash
grep "REFERENCES public\.TABLE_NAME" migration-docs/Database_schema.sql
```

Azok a táblák, amikre **0** bejövő FK mutat, nem függnek tőlük más táblák.

### 3. Kombinált döntés

Csak az a tábla "safe-to-drop", ahol **mindkét** feltétel teljesül: 0 kód-ref + 0 bejövő FK.

---

## Teljes osztályozás

### 🟢 KEEP — aktívan használt táblák (81 db)

A legfontosabbak (teljes lista a Database_schema.sql-ben):

**Főtáblák**: `szemely`, `csalad`, `congregations`, `dioceses`, `districts`, `profiles`, `iktato`, `befizetes`, `kiadas`, `keresztseg`, `konfirmalas`, `hazassag`, `temetes`, `munkanaplo`, `leltar_tetelek`, `sirhely`, `jegyzokonyv_*`, `public_*`, `mm_*`

**Aktív segédtáblák** (code referenced):
- `attert` (4), `felmentes` (6), `kitert` (2) — anyakönyvi/pénzügyi életciklus-események
- `bekoltozott` (4), `elkoltozott` (3) — be/kiköltözés
- `nom_cimlet` (1) — címletek (monetary)
- `nevnap` (1) — névnapok (dashboard widget)
- `csoport` (4) — gyülekezeti csoportok (presbyter)
- `gyerek` (17) — gyermekek
- `csaladlatogatas` (2) — pásztori látogatás
- `monetar` (3) — monetár
- `szamadasicel` (1 + incoming FKs) — könyvelési célok

**Új MVP-k** (az elmúlt hetekben kerültek be, 0 régi hivatkozás de NEM legacy):
- `annual_reports`, `valuta_atert`, `berleti_szerzodes`, `iktato_sablonok`, `import_logs`

---

### 🔴 SOFT-DROP — legacy táblák (19 db)

| # | Tábla | Kategória | Indok |
|---|---|---|---|
| 1 | `users` | DOS user | `auth.users` + `profiles` helyettesíti |
| 2 | `gyulekezetek` | Régi névtér | `congregations` helyettesíti |
| 3 | `iktatokonyv` | Régi iktató | `iktato` helyettesíti |
| 4 | `tmp_befizetes` | Import staging | Régi mass import |
| 5 | `tmp_kiadas` | Import staging | Régi mass import |
| 6 | `tmp_csaladosszeg` | Import staging | Régi mass import |
| 7 | `tmp_penztarkonyv` | Import staging | Régi mass import |
| 8 | `tmp_valnevjegy` | Import staging | Régi mass import |
| 9 | `access` | DOS config | `system_settings` helyettesíti |
| 10 | `param` | DOS config | `system_settings` + `bealitas` |
| 11 | `cfgparam` | DOS config | `system_settings` + `bealitas` |
| 12 | `cfg_report` | DOS config | Jelentésformátum — ma JSON-ban |
| 13 | `befizetocelcfg` | Régi PF config | `befizetescel` helyettesíti |
| 14 | `befizetesbealitas` | Régi PF config | `bealitas` helyettesíti |
| 15 | `felmentesx` | Verziómarker | `felmentes` a fő tábla |
| 16 | `korzetfilter` | DOS szűrő | Mai RLS (congregation_id + diocese_id) |
| 17 | `penztar` | Régi pénztár | Ma `befizetes.kassza` oszlop |
| 18 | `szamadasidatum` | DOS könyvelés | Mai `befizetes.datum` |
| 19 | `csoporttagok` | Orphan | 0 kód-ref + 0 bejövő FK |

**Összes sorszám**: futtasd a soft-drop után:

```sql
SELECT 'users_ARCHIVE' AS tabla, COUNT(*) FROM public.users_ARCHIVE_2026_04_15
UNION ALL SELECT 'tmp_befizetes', COUNT(*) FROM public.tmp_befizetes_ARCHIVE_2026_04_15
-- stb.
```

---

## Migrációk

### Fázis 1 — Soft-drop (ma)

**Fájl**: `migration-docs/sql/2026-04-15-legacy-cleanup-soft-drop.sql`

**Művelet**: 19 `ALTER TABLE ... RENAME TO ..._ARCHIVE_2026_04_15`

**Hatás**:
- A táblák adatai megmaradnak
- A `public` schema keresőlistáján már nem zavarnak
- Ha egy modul akarja használni őket, hibát kap (mert már nem a régi néven léteznek)
- **30 nap védőidő**: ha bármi hibát jelez, a táblákat egy RENAME-mel vissza lehet hozni

**Rollback**:
```sql
ALTER TABLE public.users_ARCHIVE_2026_04_15 RENAME TO users;
-- stb.
```

### Fázis 2 — DROP TABLE (30 nap múlva, 2026-05-15)

**Fájl**: `migration-docs/sql/2026-05-15-legacy-cleanup-drop.sql`

**Művelet**: 19 `DROP TABLE IF EXISTS ..._ARCHIVE_2026_04_15`

**Hatás**:
- A táblák **véglegesen törlődnek** (adattal együtt)
- A DB storage költség csökken
- A schema tisztább

**Rollback**: csak Supabase PITR (point-in-time restore) — ami elérhető a Supabase ingyenes és fizetős plánban is 7-30 napra.

---

## Kockázatok

1. **A Supabase PITR lefedése**: a Fázis 2 előtt ellenőrizzük, hogy a Supabase projekt PITR beállítása legalább 30 napra visszamegy. Free plán 7 napot ad, Pro plán 30 napot (esetleg extra plugin). Ha a projekt Free-en van, Pro-ra érdemes feliratkozni a DROP előtt, VAGY előtte kézzel `pg_dump`-ot készíteni a 19 táblából.

2. **Ismeretlen eszköz-integrációk**: ha van olyan külső tool (pl. Supabase Edge Function, n8n workflow, Retool dashboard), ami ezekre a táblákra épít, a Next.js kód-grep nem találja meg. **Ajánlás**: a soft-drop után 1 hétig monitoring: Supabase Logs → nincs-e "table not found" hiba.

3. **Késleltetett fejlesztői feedback**: ha valaki egy fejlesztői branchen még használja valamelyik táblát (pl. még nem mergelt admin modul), a cleanup váratlan breaking change lehet. **Ajánlás**: a git branch lista átnézése a soft-drop előtt.

4. **A `csoporttagok` orphan táblája**: ha ennek a táblának van üzleti értéke (pl. korábban egy "csoporttagság" feature-hez tartozott), és a user most hiányolja (pl. tagcsoport-kezelés újra implementálva lesz), az archivált tábla elérhető a soft-drop időszak alatt. A DROP után már nem. **Ajánlás**: ha a csoport funkcionalitás újra él, a soft-drop után azonnal visszahozni `RENAME TO csoporttagok`-ra.

---

## Verifikációs SQL queries

### A soft-drop után (azonnal)

```sql
-- 1. Az archivált táblák listája (pontosan 19 sor)
SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename LIKE '%_ARCHIVE_2026_04_15'
  ORDER BY tablename;

-- 2. Sorszámok ellenőrzése (audit + backup tervezéshez)
SELECT tablename, n_live_tup AS sorszam
  FROM pg_stat_user_tables
  WHERE schemaname = 'public' AND relname LIKE '%_ARCHIVE_2026_04_15'
  ORDER BY n_live_tup DESC;

-- 3. A fő táblák továbbra is működnek
SELECT COUNT(*) FROM public.profiles;
SELECT COUNT(*) FROM public.congregations;
SELECT COUNT(*) FROM public.iktato;
SELECT COUNT(*) FROM public.befizetescel;
SELECT COUNT(*) FROM public.szemely;
```

### A 30 nap során (hetente)

```sql
-- Nincs-e hiba: "table ... does not exist"
SELECT event_message, timestamp
  FROM postgres_logs
  WHERE event_message ILIKE '%_ARCHIVE_2026_04_15%'
     OR event_message ILIKE '%does not exist%'
  ORDER BY timestamp DESC LIMIT 50;
```

(Supabase Studio → Database → Logs-ban is kereshető)

### A DROP TABLE után

```sql
-- Az archivált táblák TÖBBÉ NEM léteznek (0 sor)
SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename LIKE '%_ARCHIVE_2026_04_15';

-- A public schema mérete csökkent
SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = 'public';
-- Várakozás: 100 - 19 = 81 tábla (plusz az új migrációk után keletkezett új táblák)
```

---

## Roadmap hatás

- A cleanup **nem blokkol** új feature-t
- Egyszeri futás, utána nincs folyamatos teher
- Q3 2026 roadmap utolsó, de nem kritikus lépése

---

## Kapcsolódó dokumentumok

- **Soft-drop migráció**: `migration-docs/sql/2026-04-15-legacy-cleanup-soft-drop.sql`
- **DROP migráció**: `migration-docs/sql/2026-05-15-legacy-cleanup-drop.sql`
- **Projekt log**: 036. lépés
- **Roadmap**: a plan fájl "C. Cleanup feladatok (Legacy táblák)" szekciója

---

**Dokumentum státusza**: VÉGLEGESÍTETT (audit + 2 migráció + checklist)
**Felülvizsgálat dátuma**: 2026-04-15
**Következő felülvizsgálat**: 2026-05-15-ig (30 nap során), mielőtt a DROP migráció fut
