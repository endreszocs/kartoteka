-- ════════════════════════════════════════════════════════════════════════════
--  M6.2a — RLS fix: 4 jegyzőkönyv-tábla (P1 blokkoló pótlása)
--  Dátum: 2026-04-21
--  Futtatás: Endre → Supabase SQL Editor (teljes fájl betölt + Run)
--
--  ELŐZMÉNY:
--    2026-04-12: a `2026-04-12-jegyzokonyv-restructure.sql` explicit megjegyzi:
--      "Az RLS nincs bekapcsolva (ahogy a többi modulnál sem: munkanaplo, iktato, stb.)
--       mert az app szintű szűrés biztosítja a hozzáférés-kontrollt."
--
--    Ez a megközelítés a WEB-ONLY architektúrában helyes volt (minden Server
--    Action getEffectiveAccessContext() ctx-et kapott).
--
--    TAURI MIGRÁCIÓ (M6+) MIATT MEGVÁLTOZIK:
--    A desktop kliens közvetlen, RLS-védett Supabase-hívásokkal dolgozik —
--    Server Action nélkül. Ha egy táblán nincs RLS, a közvetlen desktop-hívás
--    cross-congregation adatot szivárogtathat. Ezért MINDEN desktopra kerülő
--    tábla RLS-védett kell legyen.
--
--    Az M6.2 auditban ez a 4 jegyzőkönyv-tábla volt az egyetlen P1 szinten
--    fail_rls_off (P0+P2+P3 mind OK). Ez a migráció zárja be az utolsó lyukat
--    az M7 wave indulása előtt.
--
--  HATÁS:
--    - 4 tábla RLS bekapcsolva
--    - Mindegyikre egy egységes FOR ALL policy a congregation-scope szerint
--    - Admin/kerületi admin/esperes/megyei admin override a
--      current_user_can_access_congregation() helper fn-en keresztül
--    - Child táblák (hatarozatok, napirendi, resztvevok) a parent congregation_id-ján
--      keresztül szűrnek (a parent policy-ja tranzitíven érvényes)
--
--  BACKWARD-COMPATIBLE:
--    A meglévő Server Action-ök továbbra is működnek, mert a
--    current_user_can_access_congregation() helper authenticated user-re true-t
--    ad vissza a saját congregation_id-jára, és a global-access role-okra
--    mindenhol. A getEffectiveAccessContext() szerinti szűrés redundáns, de
--    nem ütközik.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) ENABLE ROW LEVEL SECURITY a 4 táblára
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.presbiteri_jegyzokonyvek     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jegyzokonyv_hatarozatok      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jegyzokonyv_napirendi_pontok ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jegyzokonyv_resztvevok       ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) PARENT — presbiteri_jegyzokonyvek: egységes FOR ALL policy
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS presbiteri_jegyzokonyvek_access ON public.presbiteri_jegyzokonyvek;
DROP POLICY IF EXISTS jk_congregation_access          ON public.presbiteri_jegyzokonyvek;

CREATE POLICY presbiteri_jegyzokonyvek_access
  ON public.presbiteri_jegyzokonyvek
  FOR ALL
  TO authenticated
  USING      (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

COMMENT ON POLICY presbiteri_jegyzokonyvek_access ON public.presbiteri_jegyzokonyvek IS
  $$Egységes RLS minden CRUD-ra. A current_user_can_access_congregation() helper
    dönt: saját gyülekezet tag, vagy egyhazmegyei_admin/esperes az egyházmegyére,
    vagy egyhazkeruleti_admin/admin globálisan. M6.2a (2026-04-21).$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) CHILD — jegyzokonyv_hatarozatok: scope a parent congregation_id-jén
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS jegyzokonyv_hatarozatok_access ON public.jegyzokonyv_hatarozatok;
DROP POLICY IF EXISTS jk_hatarozatok_access          ON public.jegyzokonyv_hatarozatok;

CREATE POLICY jegyzokonyv_hatarozatok_access
  ON public.jegyzokonyv_hatarozatok
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.presbiteri_jegyzokonyvek pj
      WHERE pj.id = jegyzokonyv_hatarozatok.jegyzokonyv_id
        AND public.current_user_can_access_congregation(pj.congregation_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.presbiteri_jegyzokonyvek pj
      WHERE pj.id = jegyzokonyv_hatarozatok.jegyzokonyv_id
        AND public.current_user_can_access_congregation(pj.congregation_id)
    )
  );

COMMENT ON POLICY jegyzokonyv_hatarozatok_access ON public.jegyzokonyv_hatarozatok IS
  $$A child tábla scope-ja a parent presbiteri_jegyzokonyvek.congregation_id-ján
    keresztül. current_user_can_access_congregation() helper-rel. M6.2a (2026-04-21).$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) CHILD — jegyzokonyv_napirendi_pontok
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS jegyzokonyv_napirendi_pontok_access ON public.jegyzokonyv_napirendi_pontok;
DROP POLICY IF EXISTS jk_napirendi_access                 ON public.jegyzokonyv_napirendi_pontok;

CREATE POLICY jegyzokonyv_napirendi_pontok_access
  ON public.jegyzokonyv_napirendi_pontok
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.presbiteri_jegyzokonyvek pj
      WHERE pj.id = jegyzokonyv_napirendi_pontok.jegyzokonyv_id
        AND public.current_user_can_access_congregation(pj.congregation_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.presbiteri_jegyzokonyvek pj
      WHERE pj.id = jegyzokonyv_napirendi_pontok.jegyzokonyv_id
        AND public.current_user_can_access_congregation(pj.congregation_id)
    )
  );

COMMENT ON POLICY jegyzokonyv_napirendi_pontok_access ON public.jegyzokonyv_napirendi_pontok IS
  $$A child tábla scope-ja a parent presbiteri_jegyzokonyvek.congregation_id-ján
    keresztül. current_user_can_access_congregation() helper-rel. M6.2a (2026-04-21).$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) CHILD — jegyzokonyv_resztvevok
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS jegyzokonyv_resztvevok_access ON public.jegyzokonyv_resztvevok;
DROP POLICY IF EXISTS jk_resztvevok_access          ON public.jegyzokonyv_resztvevok;

CREATE POLICY jegyzokonyv_resztvevok_access
  ON public.jegyzokonyv_resztvevok
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.presbiteri_jegyzokonyvek pj
      WHERE pj.id = jegyzokonyv_resztvevok.jegyzokonyv_id
        AND public.current_user_can_access_congregation(pj.congregation_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.presbiteri_jegyzokonyvek pj
      WHERE pj.id = jegyzokonyv_resztvevok.jegyzokonyv_id
        AND public.current_user_can_access_congregation(pj.congregation_id)
    )
  );

COMMENT ON POLICY jegyzokonyv_resztvevok_access ON public.jegyzokonyv_resztvevok IS
  $$A child tábla scope-ja a parent presbiteri_jegyzokonyvek.congregation_id-ján
    keresztül. current_user_can_access_congregation() helper-rel. M6.2a (2026-04-21).$$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
--  ROLLBACK (DOWN) — csak ha muszáj visszaállni. NE fusd le, csak ha muszáj.
-- ════════════════════════════════════════════════════════════════════════════
--  BEGIN;
--  DROP POLICY IF EXISTS jegyzokonyv_resztvevok_access       ON public.jegyzokonyv_resztvevok;
--  DROP POLICY IF EXISTS jegyzokonyv_napirendi_pontok_access ON public.jegyzokonyv_napirendi_pontok;
--  DROP POLICY IF EXISTS jegyzokonyv_hatarozatok_access      ON public.jegyzokonyv_hatarozatok;
--  DROP POLICY IF EXISTS presbiteri_jegyzokonyvek_access     ON public.presbiteri_jegyzokonyvek;
--  ALTER TABLE public.jegyzokonyv_resztvevok       DISABLE ROW LEVEL SECURITY;
--  ALTER TABLE public.jegyzokonyv_napirendi_pontok DISABLE ROW LEVEL SECURITY;
--  ALTER TABLE public.jegyzokonyv_hatarozatok      DISABLE ROW LEVEL SECURITY;
--  ALTER TABLE public.presbiteri_jegyzokonyvek     DISABLE ROW LEVEL SECURITY;
--  COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
--  ELLENŐRZŐ SELECT-EK (futtatható — a COMMIT után azonnal lefut)
-- ════════════════════════════════════════════════════════════════════════════

SELECT '════ Ellenőrzés 1: RLS enabled + policy_count a 4 táblán ═════════════' AS section;

SELECT
  c.relname                                                                                 AS table_name,
  c.relrowsecurity                                                                          AS rls_enabled,
  (SELECT COUNT(*) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname)                              AS policy_count,
  CASE
    WHEN NOT c.relrowsecurity THEN '❌ RLS OFF'
    WHEN (SELECT COUNT(*) FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = c.relname) = 0
      THEN '⚠️  RLS ON, 0 policy'
    ELSE '✅ OK'
  END                                                                                       AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'presbiteri_jegyzokonyvek',
    'jegyzokonyv_hatarozatok',
    'jegyzokonyv_napirendi_pontok',
    'jegyzokonyv_resztvevok'
  )
ORDER BY c.relname;

-- Várható: 4 sor, mind rls_enabled=true, policy_count=1, status='✅ OK'

SELECT '════ Ellenőrzés 2: Policy részletek ══════════════════════════════════' AS section;

SELECT
  p.tablename,
  p.policyname,
  p.cmd,
  ARRAY(SELECT UNNEST(p.roles))                                                            AS roles,
  LEFT(p.qual::text, 140)                                                                  AS using_condition,
  LEFT(p.with_check::text, 140)                                                            AS check_condition
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.tablename IN (
    'presbiteri_jegyzokonyvek',
    'jegyzokonyv_hatarozatok',
    'jegyzokonyv_napirendi_pontok',
    'jegyzokonyv_resztvevok'
  )
ORDER BY p.tablename, p.policyname;

-- Várható: 4 sor, mind FOR ALL (cmd='ALL'), roles={authenticated}

SELECT '════ Ellenőrzés 3: A full M6.2 összefoglaló újrafuttatása P1-re ══════' AS section;

WITH p1_tables(table_name) AS (VALUES
  ('jegyzokonyv_hatarozatok'),        ('jegyzokonyv_napirendi_pontok'),
  ('jegyzokonyv_resztvevok'),         ('presbiteri_jegyzokonyvek'),
  ('iktato'),                         ('iktato_sablonok'),
  ('leltar_tetelek'),                 ('materials'),                ('material_movements'),
  ('munkanaplo'),
  ('annual_reports'),                 ('diocese_annual_reports'),
  ('profiles'),                       ('profile_congregations'),    ('profile_preferences'),
  ('profile_roles'),                  ('pastor_profiles'),
  ('congregations'),                  ('dioceses'),                 ('districts'),
  ('bealitas'),
  ('diocese_bealitas'),               ('diocese_befizetes'),        ('diocese_kiadas'),
  ('diocese_koltsegvetes'),
  ('ertesitesek')
)
SELECT
  COUNT(*) AS p1_total,
  COUNT(*) FILTER (
    WHERE c.relrowsecurity = true
      AND (SELECT COUNT(*) FROM pg_policies p
           WHERE p.schemaname = 'public' AND p.tablename = pt.table_name) > 0
  ) AS ok,
  COUNT(*) FILTER (
    WHERE c.relrowsecurity = true
      AND (SELECT COUNT(*) FROM pg_policies p
           WHERE p.schemaname = 'public' AND p.tablename = pt.table_name) = 0
  ) AS warn_no_policy,
  COUNT(*) FILTER (WHERE c.relname IS NOT NULL AND c.relrowsecurity = false) AS fail_rls_off,
  COUNT(*) FILTER (WHERE c.relname IS NULL)                                  AS fail_missing
FROM p1_tables pt
LEFT JOIN pg_class c
  ON c.relname = pt.table_name
 AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- ════════════════════════════════════════════════════════════════════════════
--  VÁRT VÉGEREDMÉNY:
--    Ellenőrzés 1: 4 sor ✅ OK
--    Ellenőrzés 2: 4 sor (presbiteri_jegyzokonyvek_access, jegyzokonyv_hatarozatok_access,
--                         jegyzokonyv_napirendi_pontok_access, jegyzokonyv_resztvevok_access)
--    Ellenőrzés 3: p1_total=26, ok=26, warn_no_policy=0, fail_rls_off=0, fail_missing=0
--  Ha ez teljesül: **M6.2 TELJES ZÖLD** és az M7 pénzügyi wave INDULHAT.
-- ════════════════════════════════════════════════════════════════════════════
