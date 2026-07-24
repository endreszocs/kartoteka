-- ============================================================================
-- KARTOTEKA -- publikus oldal szuk olvasasi API + poszt policy hardening
-- Datum: 2026-07-17
-- Allapot: REVIEW-DRAFT -- TILOS MEG LEFUTTATNI
--
-- A publikus weboldalnak nincs szuksege kozvetlen congregations-, szemely-,
-- presbiter- vagy haztartas-olvasasra. Ez a migracio:
--   * egy szuk, nem erzekeny public_site_context(text) RPC-n keresztul adja a
--     publikalt oldal megjelenitesi adatait;
--   * csak status='active' + public_site_enabled gyulekezetet tekint lathatonak;
--   * csak engedelyezett aggregalt statisztikakat ad vissza;
--   * a public_sites/public_posts anon policy-ket ugyanehhez a lathatosagi
--     donteshez koti.
--
-- Rollout: a member-portal P0/workflow migraciok UTAN fusson. A P0 szandekosan
-- exact ketfunckios anon allowlistre zarja a live baseline-t; ez a kulon auditalt
-- fajl negy exact signature-rel boviti: context + policy-helper + stats + age.
-- A frontend public loader mindig cookie/session nelkuli anon klienst hasznal;
-- authenticated, pending es member role kozvetlen public-table joga nem kell.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('kartoteka:schema-migration', 0)
);

-- A P0 deny-by-default policy-ja utan ezt a kesobbi, kulon auditalt
-- public API-t telepitjuk. Ismeretlen, mar letezo azonos nevű rutinra nem
-- irunk ra: az mindig kezi security review-t igenyel.
DO $preflight$
DECLARE
  v_missing_columns text[];
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION
      'Public-site preflight: ezt a review-draftot csak postgres SQL Editor szereppel szabad futtatni; current_user=%',
      current_user;
  END IF;

  IF pg_catalog.to_regprocedure(
       'public.current_user_is_active_staff()'
     ) IS NULL
     OR pg_catalog.obj_description(
       'public.current_user_is_active_staff()'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_P0_AUTH_ISOLATION_V1'
  THEN
    RAISE EXCEPTION
      'Public-site preflight: a member-portal P0 cutover exact markere hianyzik.';
  END IF;

  IF pg_catalog.to_regprocedure('public.handle_new_user()') IS NULL
     OR pg_catalog.obj_description(
       'public.handle_new_user()'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_MEMBER_PORTAL_DISPATCHER_V1'
  THEN
    RAISE EXCEPTION
      'Public-site preflight: a member-portal workflow dispatcher exact markere hianyzik.';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN (
      'anon',
      'authenticated',
      'service_role',
      'app_staff_user',
      'app_pending_user',
      'member_portal_user'
    )
  ) <> 6 THEN
    RAISE EXCEPTION
      'Public-site preflight: hianyzik egy kotelezo Supabase vagy izolalt alkalmazasi role.';
  END IF;

  IF pg_catalog.to_regclass('public.public_sites') IS NULL
     OR pg_catalog.to_regclass('public.congregations') IS NULL
     OR pg_catalog.to_regclass('public.public_posts') IS NULL
     OR pg_catalog.to_regclass('public.public_site_themes') IS NULL
     OR pg_catalog.to_regclass('public.public_magazines') IS NULL
     OR pg_catalog.to_regclass('public.public_magazine_issues') IS NULL
  THEN
    RAISE EXCEPTION
      'Public-site preflight: legalabb egy publikus site/theme/post/magazine tabla hianyzik.';
  END IF;

  SELECT pg_catalog.array_agg(
           expected.table_name || '.' || expected.column_name
           ORDER BY expected.table_name, expected.column_name
         )
    INTO v_missing_columns
  FROM (
    VALUES
      ('congregations'::text, 'id'::text),
      ('congregations', 'status'),
      ('congregations', 'public_site_enabled'),
      ('public_sites', 'id'),
      ('public_sites', 'congregation_id'),
      ('public_sites', 'slug'),
      ('public_sites', 'display_name'),
      ('public_sites', 'tagline'),
      ('public_sites', 'hero_image_url'),
      ('public_sites', 'crest_image_url'),
      ('public_sites', 'theme_id'),
      ('public_sites', 'custom_primary_color'),
      ('public_sites', 'custom_accent_color'),
      ('public_sites', 'contact_email'),
      ('public_sites', 'contact_phone'),
      ('public_sites', 'address'),
      ('public_sites', 'about_html'),
      ('public_sites', 'robots_index'),
      ('public_sites', 'is_published'),
      ('public_sites', 'show_member_count'),
      ('public_sites', 'show_presbyter_count'),
      ('public_sites', 'show_family_count'),
      ('public_sites', 'show_age_distribution'),
      ('public_sites', 'override_member_count'),
      ('public_sites', 'override_presbyter_count'),
      ('public_sites', 'override_family_count'),
      ('public_posts', 'congregation_id'),
      ('public_posts', 'id'),
      ('public_posts', 'slug'),
      ('public_posts', 'title'),
      ('public_posts', 'excerpt'),
      ('public_posts', 'cover_image_url'),
      ('public_posts', 'body_html'),
      ('public_posts', 'status'),
      ('public_posts', 'published_at'),
      ('public_site_themes', 'id'),
      ('public_site_themes', 'preset_key'),
      ('public_site_themes', 'display_name'),
      ('public_site_themes', 'description'),
      ('public_site_themes', 'colors'),
      ('public_site_themes', 'typography'),
      ('public_site_themes', 'hero_style'),
      ('public_site_themes', 'border_radius'),
      ('public_site_themes', 'sort_order'),
      ('public_site_themes', 'is_active'),
      ('public_magazines', 'id'),
      ('public_magazines', 'congregation_id'),
      ('public_magazines', 'title'),
      ('public_magazines', 'description'),
      ('public_magazines', 'cover_image_url'),
      ('public_magazines', 'created_at'),
      ('public_magazine_issues', 'id'),
      ('public_magazine_issues', 'magazine_id'),
      ('public_magazine_issues', 'congregation_id'),
      ('public_magazine_issues', 'issue_number'),
      ('public_magazine_issues', 'title'),
      ('public_magazine_issues', 'cover_image_url'),
      ('public_magazine_issues', 'pdf_url'),
      ('public_magazine_issues', 'published_at'),
      ('public_magazine_issues', 'notes'),
      ('public_magazine_issues', 'is_published')
  ) AS expected(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = expected.table_name
      AND a.attname = expected.column_name
      AND a.attnum > 0
      AND NOT a.attisdropped
  );

  IF v_missing_columns IS NOT NULL THEN
    RAISE EXCEPTION
      'Public-site preflight: hianyzik/kiesett oszlop: %',
      v_missing_columns;
  END IF;

  IF pg_catalog.to_regprocedure('public.public_site_context(text)') IS NOT NULL
     AND pg_catalog.obj_description(
       'public.public_site_context(text)'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_PUBLIC_SITE_CONTEXT_V1'
  THEN
    RAISE EXCEPTION
      'Public-site preflight: ismeretlen public_site_context(text) rutin van mar telepitve; kezi security review kell.';
  END IF;

  IF pg_catalog.to_regprocedure('public.public_site_stats(text)') IS NOT NULL
     AND pg_catalog.obj_description(
       'public.public_site_stats(text)'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_PUBLIC_SITE_STATS_V2'
  THEN
    RAISE EXCEPTION
      'Public-site preflight: ismeretlen public_site_stats(text) rutin van mar telepitve; kezi security review kell.';
  END IF;

  IF pg_catalog.to_regprocedure(
       'public.public_site_congregation_is_visible(uuid)'
     ) IS NOT NULL
     AND pg_catalog.obj_description(
       'public.public_site_congregation_is_visible(uuid)'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_PUBLIC_SITE_VISIBILITY_V1'
  THEN
    RAISE EXCEPTION
      'Public-site preflight: ismeretlen public_site_congregation_is_visible(uuid) rutin van mar telepitve; kezi security review kell.';
  END IF;

  IF pg_catalog.to_regprocedure(
       'public.public_site_age_distribution(text)'
     ) IS NOT NULL
     AND pg_catalog.obj_description(
       'public.public_site_age_distribution(text)'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_PUBLIC_SITE_AGE_DISTRIBUTION_V2'
  THEN
    RAISE EXCEPTION
      'Public-site preflight: ismeretlen public_site_age_distribution(text) rutin van mar telepitve; kezi security review kell.';
  END IF;
END
$preflight$;

-- Ez az egyetlen, minimalis public-site kontextus RPC. A csatlakozas a
-- congregations tablaval csak a lathatosagi feltetelhez kell; a gyulekezet
-- belso adataibol semmit nem ad vissza. SECURITY DEFINER szukseges, mert az
-- anon szerepnek nincs kozvetlen congregations-olvasasi joga.
CREATE OR REPLACE FUNCTION public.public_site_context(p_slug text)
RETURNS TABLE (
  id uuid,
  congregation_id uuid,
  slug text,
  display_name text,
  tagline text,
  hero_image_url text,
  crest_image_url text,
  theme_id uuid,
  custom_primary_color text,
  custom_accent_color text,
  contact_email text,
  contact_phone text,
  address text,
  about_html text,
  robots_index boolean,
  show_member_count boolean,
  show_presbyter_count boolean,
  show_family_count boolean,
  show_age_distribution boolean,
  override_member_count integer,
  override_presbyter_count integer,
  override_family_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $public_site_context$
  SELECT
    ps.id,
    ps.congregation_id,
    ps.slug,
    ps.display_name,
    ps.tagline,
    ps.hero_image_url,
    ps.crest_image_url,
    ps.theme_id,
    ps.custom_primary_color,
    ps.custom_accent_color,
    ps.contact_email,
    ps.contact_phone,
    ps.address,
    ps.about_html,
    ps.robots_index,
    ps.show_member_count,
    ps.show_presbyter_count,
    ps.show_family_count,
    ps.show_age_distribution,
    ps.override_member_count,
    ps.override_presbyter_count,
    ps.override_family_count
  FROM public.public_sites ps
  JOIN public.congregations c ON c.id = ps.congregation_id
  WHERE ps.slug = pg_catalog.lower(pg_catalog.btrim(p_slug))
    AND ps.is_published = true
    AND c.status = 'active'
    AND c.public_site_enabled = true
  LIMIT 1;
$public_site_context$;

COMMENT ON FUNCTION public.public_site_context(text) IS
  'KARTOTEKA_PUBLIC_SITE_CONTEXT_V1';

REVOKE ALL ON FUNCTION public.public_site_context(text)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
    app_pending_user, member_portal_user;
GRANT EXECUTE ON FUNCTION public.public_site_context(text) TO anon;

-- RLS-policy helper a publikus gyerek-tablakhoz. Az anon szerepnek emiatt sem
-- public_sites-, sem congregations-tablaolvasas nem kell. A boolean eredmeny
-- legfeljebb azt mondja meg, hogy az adott UUID-hoz van-e amugy is publikus oldal.
CREATE OR REPLACE FUNCTION public.public_site_congregation_is_visible(
  p_congregation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $public_site_visibility$
  SELECT EXISTS (
    SELECT 1
    FROM public.public_sites ps
    JOIN public.congregations c ON c.id = ps.congregation_id
    WHERE ps.congregation_id = p_congregation_id
      AND ps.is_published = true
      AND c.status = 'active'
      AND c.public_site_enabled = true
  );
$public_site_visibility$;

COMMENT ON FUNCTION public.public_site_congregation_is_visible(uuid) IS
  'KARTOTEKA_PUBLIC_SITE_VISIBILITY_V1';

REVOKE ALL ON FUNCTION public.public_site_congregation_is_visible(uuid)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
    app_pending_user, member_portal_user;
GRANT EXECUTE ON FUNCTION public.public_site_congregation_is_visible(uuid)
  TO anon;

CREATE OR REPLACE FUNCTION public.public_site_stats(p_slug text)
RETURNS TABLE (
  member_count bigint,
  presbyter_count bigint,
  family_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN ps.show_member_count THEN
        COALESCE(
          ps.override_member_count::bigint,
          (
            SELECT pg_catalog.count(*)::bigint
            FROM public.szemely s
            WHERE s.congregation_id = ps.congregation_id
              AND s.isvisible = true
              AND s.meghalt = false
              AND COALESCE(s.member_status, '') NOT IN (
                'elhunyt', 'elköltözött', 'elkoltozott',
                'kitért', 'kitert', 'törölt'
              )
          )
        )
      ELSE NULL
    END AS member_count,
    CASE
      WHEN ps.show_presbyter_count THEN
        COALESCE(
          ps.override_presbyter_count::bigint,
          (
            SELECT pg_catalog.count(*)::bigint
            FROM public.presbiter p
            WHERE p.congregation_id = ps.congregation_id
          )
        )
      ELSE NULL
    END AS presbyter_count,
    CASE
      WHEN ps.show_family_count THEN
        COALESCE(
          ps.override_family_count::bigint,
          (
            SELECT pg_catalog.count(*)::bigint
            FROM public.haztartas h
            WHERE h.congregation_id = ps.congregation_id
              AND h.isaktiv = true
              AND h.ervenyes_ig IS NULL
          )
        )
      ELSE NULL
    END AS family_count
  FROM public.public_sites ps
  WHERE ps.slug = pg_catalog.lower(pg_catalog.btrim(p_slug))
    AND ps.is_published = true
    AND EXISTS (
      SELECT 1
      FROM public.congregations c
      WHERE c.id = ps.congregation_id
        AND c.status = 'active'
        AND c.public_site_enabled = true
    )
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.public_site_stats(text) IS
  'KARTOTEKA_PUBLIC_SITE_STATS_V2';

REVOKE ALL ON FUNCTION public.public_site_stats(text)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
    app_pending_user, member_portal_user;
GRANT EXECUTE ON FUNCTION public.public_site_stats(text) TO anon;

-- Az eletkori megoszlas kulon RPC, hogy a mar letezo szamlalo fuggveny
-- visszateresi tipusat ne kelljen megvaltoztatni. K-anonimitasi kuszob:
-- legalabb 25 ervenyes tag es minden nem ures savban legalabb 5 szemely kell.
-- Kis kozossegbol ezert nem ad vissza olyan bontast, amelybol egy tag eletkora
-- konnyen kikovetkeztetheto lenne.
CREATE OR REPLACE FUNCTION public.public_site_age_distribution(p_slug text)
RETURNS TABLE (
  under_18_count bigint,
  age_18_35_count bigint,
  age_36_59_count bigint,
  age_60_plus_count bigint,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH target_site AS (
    SELECT ps.congregation_id
    FROM public.public_sites ps
    WHERE ps.slug = pg_catalog.lower(pg_catalog.btrim(p_slug))
      AND ps.is_published = true
      AND ps.show_age_distribution = true
      AND EXISTS (
        SELECT 1
        FROM public.congregations c
        WHERE c.id = ps.congregation_id
          AND c.status = 'active'
          AND c.public_site_enabled = true
      )
    LIMIT 1
  ),
  eligible_members AS (
    SELECT pg_catalog.date_part(
      'year',
      pg_catalog.age(CURRENT_DATE, s.sz_datum)
    )::integer AS age_years
    FROM public.szemely s
    JOIN target_site ts ON ts.congregation_id = s.congregation_id
    WHERE s.isvisible = true
      AND s.meghalt = false
      AND s.sz_datum IS NOT NULL
      AND s.sz_datum <= current_date
      AND COALESCE(s.member_status, '') NOT IN (
        'elhunyt', 'elköltözött', 'elkoltozott',
        'kitért', 'kitert', 'törölt'
      )
  ),
  buckets AS (
    SELECT
      pg_catalog.count(*) FILTER (WHERE age_years < 18)::bigint AS under_18_count,
      pg_catalog.count(*) FILTER (WHERE age_years BETWEEN 18 AND 35)::bigint AS age_18_35_count,
      pg_catalog.count(*) FILTER (WHERE age_years BETWEEN 36 AND 59)::bigint AS age_36_59_count,
      pg_catalog.count(*) FILTER (WHERE age_years >= 60)::bigint AS age_60_plus_count,
      pg_catalog.count(*)::bigint AS total_count
    FROM eligible_members
  )
  SELECT
    b.under_18_count,
    b.age_18_35_count,
    b.age_36_59_count,
    b.age_60_plus_count,
    b.total_count
  FROM buckets b
  WHERE b.total_count >= 25
    AND (b.under_18_count = 0 OR b.under_18_count >= 5)
    AND (b.age_18_35_count = 0 OR b.age_18_35_count >= 5)
    AND (b.age_36_59_count = 0 OR b.age_36_59_count >= 5)
    AND (b.age_60_plus_count = 0 OR b.age_60_plus_count >= 5);
$$;

COMMENT ON FUNCTION public.public_site_age_distribution(text) IS
  'KARTOTEKA_PUBLIC_SITE_AGE_DISTRIBUTION_V2';

REVOKE ALL ON FUNCTION public.public_site_age_distribution(text)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
    app_pending_user, member_portal_user;
GRANT EXECUTE ON FUNCTION public.public_site_age_distribution(text) TO anon;

-- --------------------------------------------------------------------------
-- Exact anon tabla-ACL + RLS: nincs public_sites direkt olvasas
-- --------------------------------------------------------------------------

-- A regi migraciok teljes tablas SELECT-et adtak. Elobb minden table- es
-- column-level anon SELECT-et levesszunk, majd csak a loader altal hasznalt,
-- eleve publikus tartalomoszlopokat adjuk vissza. Uj jovobeli oszlop igy nem
-- valik automatikusan publikus API-va.
REVOKE SELECT ON TABLE
  public.public_sites,
  public.public_site_themes,
  public.public_posts,
  public.public_magazines,
  public.public_magazine_issues
FROM anon;

DO $revoke_anon_public_content_columns$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname, a.attname
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'public_sites',
        'public_site_themes',
        'public_posts',
        'public_magazines',
        'public_magazine_issues'
      )
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY c.relname, a.attnum
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE SELECT (%I) ON TABLE %I.%I FROM anon',
      r.attname,
      r.nspname,
      r.relname
    );
  END LOOP;
END
$revoke_anon_public_content_columns$;

GRANT SELECT (
  id, preset_key, display_name, description, colors, typography,
  hero_style, border_radius, sort_order, is_active
) ON TABLE public.public_site_themes TO anon;

-- A dashboard tema-valasztoja tovabbra is kozvetlen tablaolvasast hasznal.
-- Az app_staff_user az authenticated role jogait orokli; a kulon permissive
-- policy nelkul a P0 restrictive staff-gate onmagaban egyetlen sort sem engedne.
GRANT SELECT ON TABLE public.public_site_themes TO authenticated;

GRANT SELECT (
  id, congregation_id, slug, title, excerpt, cover_image_url,
  body_html, status, published_at
) ON TABLE public.public_posts TO anon;

GRANT SELECT (
  id, congregation_id, title, description, cover_image_url, created_at
) ON TABLE public.public_magazines TO anon;

GRANT SELECT (
  id, magazine_id, congregation_id, issue_number, title, cover_image_url,
  pdf_url, published_at, notes, is_published
) ON TABLE public.public_magazine_issues TO anon;

-- A teljes public_sites sor csak a context RPC-bol erheto el.
DROP POLICY IF EXISTS public_sites_anon_read ON public.public_sites;

-- Egy publikalt bejegyzes se legyen kozvetlenul olvashato, ha a szulo
-- gyulekezeti weboldal nincs elesitve. A helper SECURITY DEFINER, igy az anon
-- policy nem igenyel public_sites/congregations tabla-ACL-t.
DROP POLICY IF EXISTS public_posts_anon_published ON public.public_posts;
CREATE POLICY public_posts_anon_published
  ON public.public_posts
  FOR SELECT
  TO anon
  USING (
    status = 'published'
    AND published_at IS NOT NULL
    AND published_at <= pg_catalog.now()
    AND public.public_site_congregation_is_visible(congregation_id)
  );

DROP POLICY IF EXISTS public_site_themes_read_all
  ON public.public_site_themes;
DROP POLICY IF EXISTS public_site_themes_public_read
  ON public.public_site_themes;
CREATE POLICY public_site_themes_public_read
  ON public.public_site_themes
  FOR SELECT
  TO anon
  USING (is_active = true);

DROP POLICY IF EXISTS public_site_themes_staff_read
  ON public.public_site_themes;
CREATE POLICY public_site_themes_staff_read
  ON public.public_site_themes
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (SELECT public.current_user_is_active_staff())
  );

DROP POLICY IF EXISTS public_magazines_anon_read
  ON public.public_magazines;
CREATE POLICY public_magazines_anon_read
  ON public.public_magazines
  FOR SELECT
  TO anon
  USING (
    public.public_site_congregation_is_visible(congregation_id)
  );

DROP POLICY IF EXISTS public_magazine_issues_anon_read
  ON public.public_magazine_issues;
CREATE POLICY public_magazine_issues_anon_read
  ON public.public_magazine_issues
  FOR SELECT
  TO anon
  USING (
    is_published = true
    AND public.public_site_congregation_is_visible(congregation_id)
  );

DO $postflight$
DECLARE
  v_context_acl_ok boolean;
  v_public_api_acl_ok boolean;
  v_anon_columns text[];
BEGIN
  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'public_site_context'
  ) <> 1 THEN
    RAISE EXCEPTION
      'Public-site postflight: public_site_context nev/tulterheles drift.';
  END IF;

  SELECT
    p.prosecdef
    AND p.provolatile = 's'
    AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    AND pg_catalog.obj_description(p.oid, 'pg_proc') =
      'KARTOTEKA_PUBLIC_SITE_CONTEXT_V1'
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
      WHERE cfg IN ('search_path=', 'search_path=""')
    )
    AND pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('app_staff_user', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('app_pending_user', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('member_portal_user', p.oid, 'EXECUTE')
    INTO v_context_acl_ok
  FROM pg_catalog.pg_proc p
  WHERE p.oid = 'public.public_site_context(text)'::regprocedure;

  IF v_context_acl_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Public-site postflight: public_site_context definicio/owner/search_path/ACL drift.';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'public_site_context',
        'public_site_congregation_is_visible',
        'public_site_stats',
        'public_site_age_distribution'
      )
  ) <> 4 THEN
    RAISE EXCEPTION
      'Public-site postflight: a negy public API nev/overload halmaza driftelt.';
  END IF;

  SELECT pg_catalog.bool_and(
    p.prosecdef
    AND p.provolatile = 's'
    AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    AND pg_catalog.obj_description(p.oid, 'pg_proc') = expected.marker
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
      WHERE cfg IN ('search_path=', 'search_path=""')
    )
    AND pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('app_staff_user', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('app_pending_user', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('member_portal_user', p.oid, 'EXECUTE')
  ) AND pg_catalog.count(*) = 4
    INTO v_public_api_acl_ok
  FROM (VALUES
    (
      'public.public_site_context(text)'::regprocedure,
      'KARTOTEKA_PUBLIC_SITE_CONTEXT_V1'::text
    ),
    (
      'public.public_site_congregation_is_visible(uuid)'::regprocedure,
      'KARTOTEKA_PUBLIC_SITE_VISIBILITY_V1'::text
    ),
    (
      'public.public_site_stats(text)'::regprocedure,
      'KARTOTEKA_PUBLIC_SITE_STATS_V2'::text
    ),
    (
      'public.public_site_age_distribution(text)'::regprocedure,
      'KARTOTEKA_PUBLIC_SITE_AGE_DISTRIBUTION_V2'::text
    )
  ) expected(oid, marker)
  JOIN pg_catalog.pg_proc p ON p.oid = expected.oid;

  IF v_public_api_acl_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Public-site postflight: a negy exact publikus rutin definicioja/ACL-je driftelt.';
  END IF;

  IF pg_catalog.has_table_privilege(
       'anon', 'public.public_sites', 'SELECT'
     )
     OR pg_catalog.has_any_column_privilege(
       'anon', 'public.public_sites', 'SELECT'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policies pol
       WHERE pol.schemaname = 'public'
         AND pol.tablename = 'public_sites'
         AND 'anon'::name = ANY(pol.roles)
     )
  THEN
    RAISE EXCEPTION
      'Public-site postflight: anon public_sites direkt SELECT/policy maradt.';
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'public.public_site_themes', 'SELECT')
     OR pg_catalog.has_table_privilege('anon', 'public.public_posts', 'SELECT')
     OR pg_catalog.has_table_privilege('anon', 'public.public_magazines', 'SELECT')
     OR pg_catalog.has_table_privilege('anon', 'public.public_magazine_issues', 'SELECT')
  THEN
    RAISE EXCEPTION
      'Public-site postflight: teljes tablas anon SELECT maradt publikus tartalmon.';
  END IF;

  SELECT pg_catalog.array_agg(a.attname ORDER BY a.attname)
    INTO v_anon_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.public_site_themes'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND pg_catalog.has_column_privilege(
      'anon', a.attrelid, a.attnum, 'SELECT'
    );
  IF v_anon_columns IS DISTINCT FROM ARRAY[
    'border_radius', 'colors', 'description', 'display_name', 'hero_style',
    'id', 'is_active', 'preset_key', 'sort_order', 'typography'
  ]::text[] THEN
    RAISE EXCEPTION
      'Public-site postflight: public_site_themes anon oszlop-ACL drift: %',
      v_anon_columns;
  END IF;

  SELECT pg_catalog.array_agg(a.attname ORDER BY a.attname)
    INTO v_anon_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.public_posts'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND pg_catalog.has_column_privilege(
      'anon', a.attrelid, a.attnum, 'SELECT'
    );
  IF v_anon_columns IS DISTINCT FROM ARRAY[
    'body_html', 'congregation_id', 'cover_image_url', 'excerpt', 'id',
    'published_at', 'slug', 'status', 'title'
  ]::text[] THEN
    RAISE EXCEPTION
      'Public-site postflight: public_posts anon oszlop-ACL drift: %',
      v_anon_columns;
  END IF;

  SELECT pg_catalog.array_agg(a.attname ORDER BY a.attname)
    INTO v_anon_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.public_magazines'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND pg_catalog.has_column_privilege(
      'anon', a.attrelid, a.attnum, 'SELECT'
    );
  IF v_anon_columns IS DISTINCT FROM ARRAY[
    'congregation_id', 'cover_image_url', 'created_at', 'description', 'id',
    'title'
  ]::text[] THEN
    RAISE EXCEPTION
      'Public-site postflight: public_magazines anon oszlop-ACL drift: %',
      v_anon_columns;
  END IF;

  SELECT pg_catalog.array_agg(a.attname ORDER BY a.attname)
    INTO v_anon_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.public_magazine_issues'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND pg_catalog.has_column_privilege(
      'anon', a.attrelid, a.attnum, 'SELECT'
    );
  IF v_anon_columns IS DISTINCT FROM ARRAY[
    'congregation_id', 'cover_image_url', 'id', 'is_published',
    'issue_number', 'magazine_id', 'notes', 'pdf_url', 'published_at', 'title'
  ]::text[] THEN
    RAISE EXCEPTION
      'Public-site postflight: public_magazine_issues anon oszlop-ACL drift: %',
      v_anon_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename = 'public_posts'
      AND pol.policyname = 'public_posts_anon_published'
      AND pol.cmd = 'SELECT'
      AND pol.roles = ARRAY['anon']::name[]
      AND COALESCE(pol.qual, '') LIKE '%status%published%'
      AND COALESCE(pol.qual, '') LIKE '%published_at%'
      AND COALESCE(pol.qual, '') LIKE
        '%public_site_congregation_is_visible%'
  ) THEN
    RAISE EXCEPTION
      'Public-site postflight: public_posts published visibility policy drift.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename = 'public_site_themes'
      AND pol.policyname = 'public_site_themes_public_read'
      AND pol.permissive = 'PERMISSIVE'
      AND pol.cmd = 'SELECT'
      AND pol.roles = ARRAY['anon']::name[]
      AND COALESCE(pol.qual, '') LIKE '%is_active%true%'
      AND pol.with_check IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename = 'public_site_themes'
      AND pol.policyname = 'public_site_themes_read_all'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename = 'public_site_themes'
      AND pol.policyname <> 'public_site_themes_public_read'
      AND pol.cmd IN ('ALL', 'SELECT')
      AND pol.roles && ARRAY['public', 'anon']::name[]
  ) THEN
    RAISE EXCEPTION
      'Public-site postflight: public_site_themes anon policy drift.';
  END IF;

  IF NOT pg_catalog.has_table_privilege(
       'authenticated', 'public.public_site_themes', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'app_staff_user', 'public.public_site_themes', 'SELECT'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policies pol
       WHERE pol.schemaname = 'public'
         AND pol.tablename = 'public_site_themes'
         AND pol.policyname = 'public_site_themes_staff_read'
         AND pol.permissive = 'PERMISSIVE'
         AND pol.cmd = 'SELECT'
         AND pol.roles = ARRAY['authenticated']::name[]
         AND COALESCE(pol.qual, '') LIKE '%is_active%true%'
         AND COALESCE(pol.qual, '') LIKE
           '%current_user_is_active_staff%'
         AND pol.with_check IS NULL
     )
  THEN
    RAISE EXCEPTION
      'Public-site postflight: public_site_themes aktiv staff SELECT grant/policy drift.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename = 'public_magazines'
      AND pol.policyname = 'public_magazines_anon_read'
      AND pol.cmd = 'SELECT'
      AND pol.roles = ARRAY['anon']::name[]
      AND COALESCE(pol.qual, '') LIKE
        '%public_site_congregation_is_visible%'
  ) THEN
    RAISE EXCEPTION
      'Public-site postflight: public_magazines anon policy drift.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename = 'public_magazine_issues'
      AND pol.policyname = 'public_magazine_issues_anon_read'
      AND pol.cmd = 'SELECT'
      AND pol.roles = ARRAY['anon']::name[]
      AND COALESCE(pol.qual, '') LIKE '%is_published%true%'
      AND COALESCE(pol.qual, '') LIKE
        '%public_site_congregation_is_visible%'
  ) THEN
    RAISE EXCEPTION
      'Public-site postflight: public_magazine_issues anon policy drift.';
  END IF;
END
$postflight$;

COMMIT;

-- Ellenorzes (csak olvasas):
-- SELECT * FROM public.public_site_context('<publikalt-slug>');
-- SELECT * FROM public.public_site_stats('<publikalt-slug>');
-- SELECT * FROM public.public_site_age_distribution('<publikalt-slug>');
-- SELECT policyname, roles, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'public_posts';
