-- ═══════════════════════════════════════════════════════════════
-- LEGACY CLEANUP — Soft-drop fázis (2026-04-15)
-- ═══════════════════════════════════════════════════════════════
--
-- Ez a migráció 19 legacy (DOS-eredetű + régi import staging +
-- elavult config) táblát NEM töröl, hanem ÁTNEVEZ `_ARCHIVE_2026_04_15`
-- postfixszel. Ha 30 napig nem panaszkodik senki, akkor a véglegesítő
-- DROP TABLE migrációt (2026-05-15-legacy-cleanup-drop.sql) lehet futtatni.
--
-- FELDERÍTÉSI ALAP:
--  - `grep -rn ".from('TABLE_NAME')"` → 0 kód-hivatkozás
--  - `grep "REFERENCES public.TABLE_NAME"` → 0 bejövő FK
--  - Minden tábla vagy DOS-eredetű legacy config vagy régi import staging
--
-- Kategóriák:
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- A. Régi felhasználó tábla (DOS-eredetű → auth.users helyettesíti)
-- ───────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.users RENAME TO users_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- B. Régi gyülekezet tábla (magyar név → congregations helyettesíti)
-- ───────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.gyulekezetek RENAME TO gyulekezetek_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- C. Régi iktatókönyv (új: iktato tábla)
-- ───────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.iktatokonyv RENAME TO iktatokonyv_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- D. Import staging táblák (régi Excel/CSV import)
-- ───────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.tmp_befizetes RENAME TO tmp_befizetes_ARCHIVE_2026_04_15;
ALTER TABLE IF EXISTS public.tmp_kiadas RENAME TO tmp_kiadas_ARCHIVE_2026_04_15;
ALTER TABLE IF EXISTS public.tmp_csaladosszeg RENAME TO tmp_csaladosszeg_ARCHIVE_2026_04_15;
ALTER TABLE IF EXISTS public.tmp_penztarkonyv RENAME TO tmp_penztarkonyv_ARCHIVE_2026_04_15;
ALTER TABLE IF EXISTS public.tmp_valnevjegy RENAME TO tmp_valnevjegy_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- E. DOS-eredetű config táblák (új: system_settings + bealitas)
-- ───────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.access RENAME TO access_ARCHIVE_2026_04_15;
ALTER TABLE IF EXISTS public.param RENAME TO param_ARCHIVE_2026_04_15;
ALTER TABLE IF EXISTS public.cfgparam RENAME TO cfgparam_ARCHIVE_2026_04_15;
ALTER TABLE IF EXISTS public.cfg_report RENAME TO cfg_report_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- F. Régi pénzügyi config (új: befizetescel, bealitas)
-- ───────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.befizetocelcfg RENAME TO befizetocelcfg_ARCHIVE_2026_04_15;
ALTER TABLE IF EXISTS public.befizetesbealitas RENAME TO befizetesbealitas_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- G. Régi verziómarker (felmentesx — a felmentes tábla korábbi verziója)
-- ───────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.felmentesx RENAME TO felmentesx_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- H. DOS korzet-filter (új: congregation_id + diocese_id szintű szűrés)
-- ───────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.korzetfilter RENAME TO korzetfilter_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- I. Régi pénztár tábla (új: kassza oszlop a befizetes/kiadas-ban)
-- ───────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.penztar RENAME TO penztar_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- J. Régi könyvelési dátum (DOS monetár)
-- ───────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.szamadasidatum RENAME TO szamadasidatum_ARCHIVE_2026_04_15;

-- ───────────────────────────────────────────────────────────────
-- K. Csoport tagok (orphan — a csoport tábla használatban, de a
--    tagok táblára 0 referencia sem kódban, sem más tábla FK-jában)
-- ───────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.csoporttagok RENAME TO csoporttagok_ARCHIVE_2026_04_15;

-- ═══════════════════════════════════════════════════════════════
-- VERIFIKÁCIÓ (futtatás UTÁN):
-- ═══════════════════════════════════════════════════════════════
--
-- 1. Az átnevezett táblák listája:
--    SELECT tablename FROM pg_tables
--      WHERE schemaname = 'public' AND tablename LIKE '%_ARCHIVE_2026_04_15'
--      ORDER BY tablename;
--    -- 19 sornak kell lennie
--
-- 2. A fő táblák továbbra is léteznek (NEM archiváltak):
--    SELECT tablename FROM pg_tables
--      WHERE schemaname = 'public' AND tablename IN (
--        'auth_users', 'profiles', 'congregations', 'iktato',
--        'befizetes', 'kiadas', 'bealitas', 'system_settings',
--        'befizetescel', 'kiadascel', 'szamadasicel', 'felmentes',
--        'csoport', 'monetar'
--      );
--
-- 3. Sorszámok az archivált táblákban (fontos az auditra):
--    SELECT 'users_ARCHIVE_2026_04_15' AS tabla, COUNT(*) FROM public.users_ARCHIVE_2026_04_15
--    UNION ALL SELECT 'tmp_befizetes', COUNT(*) FROM public.tmp_befizetes_ARCHIVE_2026_04_15
--    UNION ALL SELECT 'tmp_kiadas', COUNT(*) FROM public.tmp_kiadas_ARCHIVE_2026_04_15
--    UNION ALL SELECT 'access', COUNT(*) FROM public.access_ARCHIVE_2026_04_15
--    UNION ALL SELECT 'param', COUNT(*) FROM public.param_ARCHIVE_2026_04_15
--    UNION ALL SELECT 'cfgparam', COUNT(*) FROM public.cfgparam_ARCHIVE_2026_04_15
--    UNION ALL SELECT 'cfg_report', COUNT(*) FROM public.cfg_report_ARCHIVE_2026_04_15
--    UNION ALL SELECT 'iktatokonyv', COUNT(*) FROM public.iktatokonyv_ARCHIVE_2026_04_15
--    UNION ALL SELECT 'gyulekezetek', COUNT(*) FROM public.gyulekezetek_ARCHIVE_2026_04_15
--    UNION ALL SELECT 'penztar', COUNT(*) FROM public.penztar_ARCHIVE_2026_04_15
--    UNION ALL SELECT 'szamadasidatum', COUNT(*) FROM public.szamadasidatum_ARCHIVE_2026_04_15
--    UNION ALL SELECT 'felmentesx', COUNT(*) FROM public.felmentesx_ARCHIVE_2026_04_15;
--
-- ═══════════════════════════════════════════════════════════════
-- KÖVETKEZŐ LÉPÉS:
-- ═══════════════════════════════════════════════════════════════
--
--  - 30 napig figyelünk (2026-05-15-ig), nem panaszkodik-e valamelyik
--    modul a hiányzó táblára
--  - Ha nincs panasz: fut a `2026-05-15-legacy-cleanup-drop.sql` migráció,
--    ami véglegesen DROP TABLE-li az archivált táblákat
--  - Rollback (ha panasz): `ALTER TABLE xyz_ARCHIVE_2026_04_15 RENAME TO xyz;`
--
-- ═══════════════════════════════════════════════════════════════
