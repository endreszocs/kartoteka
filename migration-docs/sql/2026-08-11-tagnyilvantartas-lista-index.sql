-- ============================================================================
-- 2026-08-11 — Tagnyilvántartás lista: hiányzó indexek
-- ============================================================================
--
-- ⚠️ EZ A FÁJL 2026-08-11-én ÁTÍRÁSRA KERÜLT — az első változat NEM volt
--    futtatható. Ha korábbi verziót őrzöl, dobd el, ez a helyes.
--
--    MI VOLT A BAJ: az eredeti `CREATE INDEX CONCURRENTLY`-t használt, azzal a
--    tanáccsal, hogy futtasd az utasításokat egyesével. A Supabase SQL Editor
--    azonban MINDEN beküldést tranzakcióba csomagol — akkor is, ha egyetlen
--    sort jelölsz ki —, a CONCURRENTLY pedig tranzakcióban tiltott. Ezért a
--    hiba („CREATE INDEX CONCURRENTLY cannot run inside a transaction block")
--    egyesével futtatva is jött volna. Az egyesével-futtatás tanácsa hibás volt.
--
-- ============================================================================
-- MIÉRT KELLENEK EZEK AZ INDEXEK
-- ============================================================================
-- A /tagnyilvantartas Személyek-listája minden kereséskor és lapozáskor
-- ugyanazt a négy szűrt olvasást futtatja (registry-list-actions.ts):
--   1. szemely       — gyülekezet + látható,           id szerint lapozva
--   2. haztartas_tag — gyülekezet + élő tagság,        id szerint lapozva
--   3. befizetes     — gyülekezet + tárgyév, nem törölt (fizetett-e idén)
--   4. befizetes     — gyülekezet, minden év, nem törölt (fizetett-e valaha)
--
-- Index nélkül a Postgres mind a négyhez végigolvassa a teljes táblát.
-- Ez CSAK GYORSÍT — semmilyen viselkedést nem változtat, és bármikor
-- visszavonható. Ha nem futtatod le, minden ugyanúgy működik, csak lassabban.

-- ============================================================================
-- HOGYAN FUTTASD
-- ============================================================================
-- Három lépés, mindegyik a Supabase SQL Editorban, egyben kijelölve:
--     SZAKASZ 0  → csak olvas; megmutatja, mekkorák a táblák és mi van már
--     SZAKASZ 1  → az indexek létrehozása (ez tart a legtovább)
--     SZAKASZ 2  → ellenőrzés
--
-- ⚠️ AMIT TUDNOD KELL A SZAKASZ 1-RŐL:
--    Hagyományos (nem CONCURRENTLY) indexépítés zárolja a táblát ÍRÁSRA,
--    amíg fut. Ez azt jelenti:
--      · OLVASNI mindenki tud közben — az app nem áll meg,
--      · ÍRNI (új tag, új befizetés, mentés) nem lehet, amíg le nem fut.
--    A SZAKASZ 0 megmondja, hány sorról van szó. Néhány tízezer sornál ez
--    másodpercek kérdése. Mégis: futtasd olyankor, amikor nem dolgozik senki
--    a rendszerben (este, vagy hétköznap kora reggel), és NE akkor, amikor
--    egy desktop-kliens éppen szinkronizál.
--
--    Ha valaki mégis menteni próbál közben, nem veszít adatot — a kérése
--    egyszerűen megvárja az index elkészültét.
--
-- (Ha valaha psql-ből dolgozol, ott a fájl végén megtalálod a CONCURRENTLY-s
--  változatot, amely zárolás nélkül épít. A Studióban az nem járható út.)

-- ============================================================================
-- VISSZAVONÁS (bármikor, veszteség nélkül)
-- ============================================================================
--   DROP INDEX IF EXISTS public.idx_szemely_cong_visible_id;
--   DROP INDEX IF EXISTS public.idx_haztartas_tag_cong_aktiv_id;
--   DROP INDEX IF EXISTS public.idx_befizetes_cong_ev_elo;
--   DROP INDEX IF EXISTS public.idx_befizetes_cong_elo_id;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SZAKASZ 0 — ELŐ-ELLENŐRZÉS (CSAK OLVAS)                                  ║
-- ║ Egyetlen SELECT — a Studio csak az utolsó eredményt mutatja, ezért       ║
-- ║ minden egy lekérdezésbe van fűzve.                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- MIT NÉZZ:
--   · „SORSZÁM: …"  → ekkora táblákról van szó; ebből becsülhető az idő.
--   · „MEGLÉVŐ INDEX: …" → ha valamelyik alábbi indexszel EGYENÉRTÉKŰT látsz,
--     azt a SZAKASZ 1-ből hagyd ki (a felesleges index minden mentést lassít).

SELECT x.sorrend, x.mit_mer, x.ertek
FROM (
  SELECT 1 AS sorrend, 'SORSZÁM: szemely'::text AS mit_mer,
         (SELECT count(*)::text FROM public.szemely) AS ertek
  UNION ALL SELECT 2, 'SORSZÁM: haztartas_tag',
         (SELECT count(*)::text FROM public.haztartas_tag)
  UNION ALL SELECT 3, 'SORSZÁM: befizetes',
         (SELECT count(*)::text FROM public.befizetes)

  UNION ALL SELECT 4, 'MÁR LÉTEZIK: idx_szemely_cong_visible_id',
         (to_regclass('public.idx_szemely_cong_visible_id') IS NOT NULL)::text
  UNION ALL SELECT 5, 'MÁR LÉTEZIK: idx_haztartas_tag_cong_aktiv_id',
         (to_regclass('public.idx_haztartas_tag_cong_aktiv_id') IS NOT NULL)::text
  UNION ALL SELECT 6, 'MÁR LÉTEZIK: idx_befizetes_cong_ev_elo',
         (to_regclass('public.idx_befizetes_cong_ev_elo') IS NOT NULL)::text
  UNION ALL SELECT 7, 'MÁR LÉTEZIK: idx_befizetes_cong_elo_id',
         (to_regclass('public.idx_befizetes_cong_elo_id') IS NOT NULL)::text

  UNION ALL SELECT 8, 'FÉLBESZAKADT (érvénytelen) index a 3 táblán',
         (SELECT count(*)::text FROM pg_index idx
          JOIN pg_class t ON t.oid = idx.indrelid
          WHERE NOT idx.indisvalid
            AND t.relname IN ('szemely','haztartas_tag','befizetes'))

  UNION ALL
  SELECT 9, 'MEGLÉVŐ INDEX: ' || t.relname, i.relname || '  →  ' || pg_get_indexdef(i.oid)
  FROM pg_index idx
  JOIN pg_class i ON i.oid = idx.indexrelid
  JOIN pg_class t ON t.oid = idx.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname IN ('szemely','haztartas_tag','befizetes')
) x
ORDER BY x.sorrend, x.mit_mer, x.ertek;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SZAKASZ 1 — AZ INDEXEK LÉTREHOZÁSA                                       ║
-- ║ Jelöld ki az EGÉSZ szakaszt (a BEGIN-től a COMMIT-ig) és futtasd.        ║
-- ║ Csendes időszakban. Írás-zárolás a futás idejére.                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Idempotens: az `IF NOT EXISTS` miatt kétszer is lefuttatható.
-- Egy tranzakcióban van, tehát VAGY mind a négy elkészül, VAGY egyik sem —
-- félkész állapot nem maradhat utána (ez a CONCURRENTLY-hez képest ELŐNY).
--
-- A `lock_timeout` szándékos: ha 30 másodpercen belül nem kapja meg a
-- zárolást (mert épp ír valaki), inkább HANGOSAN feladja, mintsem hogy
-- percekig blokkolja a rendszert. Ilyenkor várj, és futtasd újra.

BEGIN;
SET LOCAL lock_timeout      = '30s';
SET LOCAL statement_timeout = '10min';

-- 1.1 Személylista: gyülekezet + látható, id szerinti lapozással.
--     Az `isvisible = true` részleges feltétel azért van itt, mert a lista
--     KIZÁRÓLAG látható személyeket olvas — így az index kicsi marad.
CREATE INDEX IF NOT EXISTS idx_szemely_cong_visible_id
  ON public.szemely (congregation_id, id)
  WHERE isvisible = true;

-- 1.2 Háztartási tagságok: gyülekezet + ÉLŐ tagság, id szerinti lapozással.
--     A lezárt (történeti) tagságokat a lista soha nem olvassa.
CREATE INDEX IF NOT EXISTS idx_haztartas_tag_cong_aktiv_id
  ON public.haztartas_tag (congregation_id, id)
  WHERE ervenyes_ig IS NULL;

-- 1.3 Tárgyévi egyházfenntartás: gyülekezet + fizetett év, nem törölt sorok.
--     Ez szolgálja ki a „fizetett-e idén" státuszt és a családi felosztást.
--     MEGJEGYZÉS: az app `deleted = false OR deleted IS NULL` alakban szűr;
--     ez logikailag azonos a `deleted IS NOT TRUE` index-feltétellel, de a
--     tervező nem MINDIG ismeri fel. Ha a SZAKASZ 2 „3.3" próbája nem ezt az
--     indexet választja, a részleges WHERE elhagyható (teljes index a három
--     oszlopon) — a lekérdezés akkor is gyorsul.
CREATE INDEX IF NOT EXISTS idx_befizetes_cong_ev_elo
  ON public.befizetes (congregation_id, fizetettev, id)
  WHERE deleted IS NOT TRUE;

-- 1.4 „Fizetett-e valaha": gyülekezet + id, minden évre. Külön index kell az
--     1.3-tól, mert ez a lekérdezés NEM szűr `fizetettev`-re, tehát az
--     összetett index második oszlopa nem használható vezető feltételként.
CREATE INDEX IF NOT EXISTS idx_befizetes_cong_elo_id
  ON public.befizetes (congregation_id, id)
  WHERE deleted IS NOT TRUE;

-- Az új részleges indexek után a tervező becslései csak ANALYZE-zal lesznek
-- pontosak. Gyors, zárolás nélküli művelet, tranzakcióban is futhat.
ANALYZE public.szemely;
ANALYZE public.haztartas_tag;
ANALYZE public.befizetes;

COMMIT;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SZAKASZ 2 — ELLENŐRZÉS (EGYETLEN SELECT)                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- VÁRT: mind a 4 sor „✅ érvényes", és az 5. sor 0.

SELECT x.sorrend, x.mit_mer, x.ertek, x.vart,
       CASE WHEN x.ertek = x.vart THEN '✅' ELSE '❌' END AS rendben
FROM (
  SELECT 1 AS sorrend, 'idx_szemely_cong_visible_id'::text AS mit_mer,
         COALESCE((SELECT CASE WHEN idx.indisvalid THEN 'érvényes' ELSE 'ÉRVÉNYTELEN' END
                   FROM pg_index idx JOIN pg_class i ON i.oid = idx.indexrelid
                   WHERE i.relname = 'idx_szemely_cong_visible_id'), 'nincs')::text AS ertek,
         'érvényes'::text AS vart
  UNION ALL SELECT 2, 'idx_haztartas_tag_cong_aktiv_id',
         COALESCE((SELECT CASE WHEN idx.indisvalid THEN 'érvényes' ELSE 'ÉRVÉNYTELEN' END
                   FROM pg_index idx JOIN pg_class i ON i.oid = idx.indexrelid
                   WHERE i.relname = 'idx_haztartas_tag_cong_aktiv_id'), 'nincs'), 'érvényes'
  UNION ALL SELECT 3, 'idx_befizetes_cong_ev_elo',
         COALESCE((SELECT CASE WHEN idx.indisvalid THEN 'érvényes' ELSE 'ÉRVÉNYTELEN' END
                   FROM pg_index idx JOIN pg_class i ON i.oid = idx.indexrelid
                   WHERE i.relname = 'idx_befizetes_cong_ev_elo'), 'nincs'), 'érvényes'
  UNION ALL SELECT 4, 'idx_befizetes_cong_elo_id',
         COALESCE((SELECT CASE WHEN idx.indisvalid THEN 'érvényes' ELSE 'ÉRVÉNYTELEN' END
                   FROM pg_index idx JOIN pg_class i ON i.oid = idx.indexrelid
                   WHERE i.relname = 'idx_befizetes_cong_elo_id'), 'nincs'), 'érvényes'
  UNION ALL SELECT 5, 'Félbeszakadt (érvénytelen) index a 3 táblán',
         (SELECT count(*)::text FROM pg_index idx
          JOIN pg_class t ON t.oid = idx.indrelid
          WHERE NOT idx.indisvalid
            AND t.relname IN ('szemely','haztartas_tag','befizetes')), '0'
) x
ORDER BY x.sorrend;


-- ============================================================================
-- FÜGGELÉK — „használja-e a tervező?" próbák (nem kötelező)
-- ============================================================================
-- Cseréld ki a gyülekezet-azonosítót a sajátodra. Elvárt: „Index Scan using …".
--
-- EXPLAIN ANALYZE
-- SELECT id FROM public.szemely
--  WHERE congregation_id = '00000000-0000-0000-0000-000000000000'::uuid
--    AND isvisible = true
--  ORDER BY id LIMIT 1000;
--
-- EXPLAIN ANALYZE
-- SELECT id, id_szemely, id_csalad, datum, fizetettev, osszeg, stornozott
--   FROM public.befizetes
--  WHERE congregation_id = '00000000-0000-0000-0000-000000000000'::uuid
--    AND fizetettev = EXTRACT(YEAR FROM CURRENT_DATE)::int
--    AND deleted IS NOT TRUE
--  ORDER BY id LIMIT 1000;


-- ============================================================================
-- FÜGGELÉK — CONCURRENTLY változat (CSAK psql-ből, NEM a Studióból)
-- ============================================================================
-- Zárolás nélkül épít, de tranzakción kívül kell futnia, amit a Supabase SQL
-- Editor nem tesz lehetővé. psql alapból autocommit módban van, ott működik:
--     psql "$DATABASE_URL" -c "CREATE INDEX CONCURRENTLY IF NOT EXISTS …"
--
-- ⚠️ Ha egy CONCURRENTLY építés megszakad, ÉRVÉNYTELEN index maradhat (a
--    SZAKASZ 2 ötödik sora ezt kimutatja). Ilyenkor:
--        DROP INDEX CONCURRENTLY IF EXISTS public.<név>;
--    és újra. A fenti, tranzakciós változatnál ez nem fordulhat elő.
--
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_szemely_cong_visible_id
--   ON public.szemely (congregation_id, id) WHERE isvisible = true;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_haztartas_tag_cong_aktiv_id
--   ON public.haztartas_tag (congregation_id, id) WHERE ervenyes_ig IS NULL;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_befizetes_cong_ev_elo
--   ON public.befizetes (congregation_id, fizetettev, id) WHERE deleted IS NOT TRUE;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_befizetes_cong_elo_id
--   ON public.befizetes (congregation_id, id) WHERE deleted IS NOT TRUE;
