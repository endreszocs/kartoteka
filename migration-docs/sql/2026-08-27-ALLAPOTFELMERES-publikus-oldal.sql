-- ============================================================================
-- ÁLLAPOTFELMÉRÉS — a publikus gyülekezeti oldal SQL-lánca (2026-08-27)
--
-- CSAK OLVAS. Semmit nem módosít, bármikor futtatható.
--
-- MIÉRT KELL
-- ──────────
-- A 2026-08-27-es migráció előfeltétel-őre megállt:
--   „a public_site_private.public_site_context_v2(text) nem létezik"
-- Ez azt jelenti, hogy az élő adatbázis NEM abban az állapotban van, amit a
-- repó migrációs fájljai sugallnak. (A migration-fájl önmagában sosem
-- bizonyíték arra, hogy élesben le is futott.)
--
-- Az app közben MŰKÖDIK, mert a betöltőnek HÁROM lépcsős tartaléka van:
-- V2 RPC → V1 RPC → KÖZVETLEN `public_sites` táblaolvasás. A projekt saját
-- migrációs naplója (`_RUN_LOG.md`) szerint a 2026-07-17-es és a 2026-07-18-as
-- lánc EGYIKE SEM futott le, tehát valószínűleg a harmadik, „átmeneti" ág
-- szolgálja ki a gyülekezeti oldalakat — némán, évek óta.
--
-- ⚠️ NE FUTTASD EGYBEN! A Supabase SQL editor egy szkriptből CSAK AZ UTOLSÓ
--    lekérdezés rácsát mutatja — ha egyben futtatod, csak az ÍTÉLET-sort
--    látnád. Jelöld ki az 1. blokkot → Run → másold ki az eredményt, aztán a
--    2.-at, és így tovább. A blokkok más-más oszlopalakúak, ezért nem
--    vonhatók össze egyetlen lekérdezésbe.
--
--    Ha csak EGY dolgot futtatsz: a fájl VÉGÉN álló ÍTÉLET-sort.
-- ============================================================================

-- ── 1. Melyik publikus RPC létezik? ────────────────────────────────────────
SELECT
  '1. Publikus RPC-k' AS szakasz,
  fn AS fuggveny,
  CASE WHEN to_regprocedure(fn) IS NOT NULL THEN '✅ VAN' ELSE '❌ NINCS' END AS allapot,
  CASE
    WHEN to_regprocedure(fn) IS NULL THEN NULL
    ELSE obj_description(to_regprocedure(fn)::oid, 'pg_proc')
  END AS marker
FROM (VALUES
  ('public.public_site_context(text)'),
  ('public.public_site_context_v2(text)'),
  ('public_site_private.public_site_context_v2(text)'),
  ('public.public_sitemap_entries()'),
  ('public_site_private.public_sitemap_entries()'),
  ('public.public_site_stats(text)'),
  ('public.public_site_age_distribution(text)'),
  ('public.public_site_tisztsegek(text)'),
  ('public.public_site_events(text)'),
  ('public.public_site_events_v2(text, integer)'),
  ('public.public_site_congregation_is_visible(uuid)')
) AS t(fn)
ORDER BY fn;

-- ── 2. Létezik-e a belső séma? ─────────────────────────────────────────────
SELECT
  '2. public_site_private séma' AS szakasz,
  CASE WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'public_site_private')
       THEN '✅ VAN' ELSE '❌ NINCS' END AS allapot,
  (SELECT count(*) FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public_site_private') AS fuggvenyek_szama;

-- ── 3. A public_sites oszlopai — melyik migráció futott le? ────────────────
SELECT
  '3. public_sites oszlopok' AS szakasz,
  oszlop,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'public_sites'
      AND column_name = oszlop
  ) THEN '✅ VAN' ELSE '❌ NINCS' END AS allapot,
  honnan
FROM (VALUES
  ('crest_image_url',  '2026-04-12 (alaptábla)'),
  ('contact_email',    '2026-04-12 (alaptábla)'),
  ('service_times',    '2026-07-18 ← EZ A GYANÚS'),
  ('show_tisztsegek',  '2026-08-26 (tisztségek kör)'),
  ('show_events',      '2026-08-26 (tisztségek kör)')
) AS t(oszlop, honnan)
ORDER BY oszlop;

-- ── 4. A gyülekezeti adatok, amikre a weboldal visszaesne ──────────────────
--     (Ez mutatja meg, van-e egyáltalán mire visszaesni.)
SELECT
  '4. Gyülekezeti adat vs. weboldal-adat' AS szakasz,
  c.nev_hu AS gyulekezet,
  ps.slug,
  CASE WHEN nullif(btrim(ps.crest_image_url), '') IS NOT NULL THEN 'weboldalon'
       WHEN nullif(btrim(c.cimer_url::text), '') IS NOT NULL THEN 'GYÜLEKEZETI ADATBÓL jönne'
       ELSE '❌ SEHOL' END AS cimer,
  CASE WHEN nullif(btrim(ps.contact_email), '') IS NOT NULL THEN 'weboldalon'
       WHEN nullif(btrim(c.email::text), '') IS NOT NULL THEN 'GYÜLEKEZETI ADATBÓL jönne'
       ELSE '❌ SEHOL' END AS email,
  CASE WHEN nullif(btrim(ps.contact_phone), '') IS NOT NULL THEN 'weboldalon'
       WHEN nullif(btrim(c.telefon::text), '') IS NOT NULL THEN 'GYÜLEKEZETI ADATBÓL jönne'
       ELSE '❌ SEHOL' END AS telefon,
  CASE WHEN nullif(btrim(ps.address), '') IS NOT NULL THEN 'weboldalon'
       WHEN nullif(btrim(c.cim::text), '') IS NOT NULL THEN 'GYÜLEKEZETI ADATBÓL jönne'
       ELSE '❌ SEHOL' END AS cim
FROM public.public_sites ps
JOIN public.congregations c ON c.id = ps.congregation_id
ORDER BY c.nev_hu;

-- ── 5. Nyilvános programok — miért üres a „Következő alkalom"? ─────────────
SELECT
  '5. Nyilvános programok' AS szakasz,
  c.nev_hu AS gyulekezet,
  ps.slug,
  ps.is_published AS oldal_kozzeteve,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='public_sites' AND column_name='show_events'
  ) THEN ps.show_events::text ELSE '(nincs ilyen oszlop)' END AS esemenyek_bekapcsolva,
  count(gp.id) FILTER (WHERE gp.publikus) AS nyilvanos_program,
  count(gp.id) AS osszes_program
FROM public.public_sites ps
JOIN public.congregations c ON c.id = ps.congregation_id
LEFT JOIN public.gyulekezeti_programok gp ON gp.congregation_id = ps.congregation_id
GROUP BY c.nev_hu, ps.slug, ps.is_published, ps.show_events
ORDER BY c.nev_hu;

-- ── 6. Van-e egyáltalán program „vakációs bibliahét" néven? ────────────────
SELECT
  '6. A keresett alkalom' AS szakasz,
  c.nev_hu AS gyulekezet,
  gp.datum,
  gp.datum_vege,
  gp.cim,
  gp.publikus AS nyilvanosnak_jelolve,
  CASE WHEN nullif(btrim(gp.leiras), '') IS NOT NULL THEN 'van leírás' ELSE '—' END AS leiras
FROM public.gyulekezeti_programok gp
JOIN public.congregations c ON c.id = gp.congregation_id
WHERE gp.cim ILIKE '%bibliahét%' OR gp.cim ILIKE '%bibliahet%' OR gp.cim ILIKE '%vakáci%'
ORDER BY gp.datum DESC
LIMIT 20;

-- ── 7. RLS és anon-jogok a public_sites bázistáblán ────────────────────────
SELECT
  '7. public_sites biztonság' AS szakasz,
  CASE WHEN c.relrowsecurity THEN '✅ RLS bekapcsolva' ELSE '⚠️ RLS KIKAPCSOLVA' END AS rls,
  CASE WHEN has_table_privilege('anon', 'public.public_sites', 'SELECT')
       THEN '⚠️ az anon KÖZVETLENÜL olvashatja' ELSE '✅ az anon nem olvashatja közvetlenül' END AS anon_select,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='public_sites') AS policy_db
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'public_sites';


-- ────────────────────────────────────────────────────────────────────────────
-- 8. ÍTÉLET — EGYETLEN SOR. Ez a fájl utolsó utasítása, tehát ez látszik
--    akkor is, ha véletlenül egyben futtattad. Ebből tudjuk, melyik úton
--    szolgáljuk ki ma a publikus gyülekezeti oldalt.
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'ÍTÉLET' AS szakasz,
  CASE
    WHEN to_regprocedure('public_site_private.public_site_context_v2(text)') IS NOT NULL
      THEN 'A ÁLLAPOT — a teljes 2026-07-17+07-18 lánc lefutott; a V2 kontextus-RPC szolgálja ki az appot'
    WHEN to_regprocedure('public.public_site_context(text)') IS NOT NULL
      THEN 'B ÁLLAPOT — csak a 2026-07-17 futott le; a V1 szolgálja ki, a sitemap üres'
    WHEN has_table_privilege('anon', 'public.public_sites', 'SELECT')
      THEN 'C ÁLLAPOT — egyik hardening sem futott; az app KÖZVETLENÜL olvassa a public_sites táblát (ez a várt állapot)'
    ELSE 'D ÁLLAPOT — ⛔ se RPC, se tábla-jog: a publikus oldalnak MOST 404-elnie kellene'
  END AS eredmeny,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='public_sites' AND column_name='service_times'
  ) THEN 'service_times: ✅ van' ELSE 'service_times: ❌ NINCS (ezért nem látszik a „Rendszeres alkalmak" szerkesztő)' END AS menetrend_oszlop,
  CASE WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='public_site_private')
       THEN 'anon séma-USAGE: ' || has_schema_privilege('anon','public_site_private','USAGE')::text
       ELSE 'public_site_private séma: nincs' END AS belso_sema;
