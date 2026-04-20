-- ═══════════════════════════════════════════════════════════════
-- LEGACY CLEANUP — Véglegesítő DROP TABLE fázis (2026-05-15)
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠️  EZ A MIGRÁCIÓ VISSZAVONHATATLAN ⚠️
--
-- Ez a migráció véglegesen törli a 2026-04-15-én archivált táblákat
-- (19 db), amikre 30 napig nem érkezett panasz.
--
-- ELŐFELTÉTELEK (futtatás előtt MIND teljesüljön):
--
--  1. ✅ A `2026-04-15-legacy-cleanup-soft-drop.sql` 30+ napja lefutott
--  2. ✅ NEM érkezett report, hogy bármelyik funkció hiányolja
--     ezeket a táblákat
--  3. ✅ Megnéztük az archivált táblák sorszámát, és vagy üresek,
--     vagy az adatokra már nincs szükség
--  4. ✅ Kézzel futtassuk le ezt a verifikációs query-t a MAI napon:
--
--     SELECT tablename, n_live_tup AS sorszam
--       FROM pg_tables pt
--       JOIN pg_stat_user_tables ps ON ps.relname = pt.tablename
--       WHERE schemaname = 'public' AND tablename LIKE '%_ARCHIVE_2026_04_15'
--       ORDER BY tablename;
--
--  5. ✅ Backup (Supabase PITR point-in-time restore elérhetősége
--     legyen legalább 30 napra visszaforgatható)
--
-- Ha bármelyik feltétel nem teljesül, NE FUTTATSUK LE ezt a migrációt!
--
-- ROLLBACK TERV:
--  - Supabase PITR-rel visszaforgatás (Supabase Dashboard → Database → Backups)
--  - A DROP TABLE-ök ugyanolyan egyszerűen visszafordíthatók, mint
--    egy rendes PITR — a backup alapján a törölt sorok is visszajönnek
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- A. Régi felhasználó tábla
-- ───────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.users_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- B. Régi gyülekezet tábla
-- ───────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.gyulekezetek_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- C. Régi iktatókönyv
-- ───────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.iktatokonyv_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- D. Import staging táblák
-- ───────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.tmp_befizetes_ARCHIVE_2026_04_15;
DROP TABLE IF EXISTS public.tmp_kiadas_ARCHIVE_2026_04_15;
DROP TABLE IF EXISTS public.tmp_csaladosszeg_ARCHIVE_2026_04_15;
DROP TABLE IF EXISTS public.tmp_penztarkonyv_ARCHIVE_2026_04_15;
DROP TABLE IF EXISTS public.tmp_valnevjegy_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- E. DOS-eredetű config táblák
-- ───────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.access_ARCHIVE_2026_04_15;
DROP TABLE IF EXISTS public.param_ARCHIVE_2026_04_15;
DROP TABLE IF EXISTS public.cfgparam_ARCHIVE_2026_04_15;
DROP TABLE IF EXISTS public.cfg_report_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- F. Régi pénzügyi config
-- ───────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.befizetocelcfg_ARCHIVE_2026_04_15;
DROP TABLE IF EXISTS public.befizetesbealitas_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- G. Régi verziómarker
-- ───────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.felmentesx_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- H. DOS korzet-filter
-- ───────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.korzetfilter_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- I. Régi pénztár tábla
-- ───────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.penztar_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- J. Régi könyvelési dátum
-- ───────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.szamadasidatum_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- K. Csoport tagok (orphan)
-- ───────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.csoporttagok_ARCHIVE_2026_04_15;

-- ═══════════════════════════════════════════════════════════════
-- VERIFIKÁCIÓ (futtatás UTÁN):
-- ═══════════════════════════════════════════════════════════════
--
-- Az archivált táblák TÖBBÉ NEM léteznek:
--    SELECT tablename FROM pg_tables
--      WHERE schemaname = 'public' AND tablename LIKE '%_ARCHIVE_2026_04_15';
--    -- 0 sornak kell lennie
--
-- A fő táblák továbbra is működnek:
--    SELECT COUNT(*) FROM public.profiles;
--    SELECT COUNT(*) FROM public.congregations;
--    SELECT COUNT(*) FROM public.iktato;
--    SELECT COUNT(*) FROM public.befizetescel;
--
-- ═══════════════════════════════════════════════════════════════
-- EREDMÉNY:
-- ═══════════════════════════════════════════════════════════════
--
--  - A public schema 19 legacy táblával kevesebb
--  - A Supabase DB storage költség csökken
--  - A schema tisztább, jobban áttekinthető
--  - Nincs további karbantartási kötelezettség ezeken
--
-- ═══════════════════════════════════════════════════════════════
