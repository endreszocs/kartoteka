-- ============================================================================
-- KARTOTEKA -- szerkesztheto alkalmak + szuk, RLS-fuggetlen sitemap API
-- Datum: 2026-07-18
-- Allapot: REVIEW-DRAFT -- TILOS MEG LEFUTTATNI JOVAHAGYAS NELKUL
--
-- Kotelezo sorrend:
--   1. 2026-07-17-public-site-read-security.sql
--   2. EZ A FAJL
--   3. web frontend deploy
--
-- Biztonsagi modell:
--   * public_sites.service_times egy max. 12 elemu, szigoruan validalt JSONB;
--   * az UJ V2 context es sitemap emelt olvasoi nem az exponalt public semaban
--     vannak; a public semaban ezekhez csak szuk SECURITY INVOKER wrapper van;
--   * a 2026-07-17-es V1 kompatibilitasi RPC-ket ez a fajl meg nem tavolitja;
--   * anon tovabbra sem kap kozvetlen public_sites/congregations SELECT jogot;
--   * a sitemap csak robots_index=true es tenylegesen publikalt utvonalakat ad.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('kartoteka:schema-migration', 0)
);

DO $preflight$
DECLARE
  v_schema_owner text;
  v_column_type text;
  v_constraint_definition text;
  v_context_v1_oid oid;
  v_validator_oid oid;
  v_context_v2_impl_oid oid;
  v_sitemap_impl_oid oid;
  v_context_v2_api_oid oid;
  v_sitemap_api_oid oid;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION
      'Public-site content preflight: csak postgres SQL Editor szereppel futtathato; current_user=%',
      current_user;
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
      'Public-site content preflight: hianyzik egy kotelezo Supabase vagy alkalmazasi role.';
  END IF;

  IF pg_catalog.to_regclass('public.public_sites') IS NULL
     OR pg_catalog.to_regclass('public.public_posts') IS NULL
     OR pg_catalog.to_regclass('public.public_magazines') IS NULL
     OR pg_catalog.to_regclass('public.public_magazine_issues') IS NULL
     OR pg_catalog.to_regclass('public.congregations') IS NULL
  THEN
    RAISE EXCEPTION
      'Public-site content preflight: hianyzik egy kotelezo publikus tartalomtabla.';
  END IF;

  v_context_v1_oid := pg_catalog.to_regprocedure(
    'public.public_site_context(text)'
  );
  v_validator_oid := pg_catalog.to_regprocedure(
    'public_site_private.public_site_service_times_are_valid(jsonb)'
  );
  v_context_v2_impl_oid := pg_catalog.to_regprocedure(
    'public_site_private.public_site_context_v2(text)'
  );
  v_sitemap_impl_oid := pg_catalog.to_regprocedure(
    'public_site_private.public_sitemap_entries()'
  );
  v_context_v2_api_oid := pg_catalog.to_regprocedure(
    'public.public_site_context_v2(text)'
  );
  v_sitemap_api_oid := pg_catalog.to_regprocedure(
    'public.public_sitemap_entries()'
  );

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('public_site_context_v2', 'public_sitemap_entries')
      AND p.oid IS DISTINCT FROM v_context_v2_api_oid
      AND p.oid IS DISTINCT FROM v_sitemap_api_oid
  ) THEN
    RAISE EXCEPTION
      'Public-site content preflight: ismeretlen public context/sitemap overload van telepitve.';
  END IF;

  -- A dedikalt private sema nem osztozhat mas objektummal. Kulonben az anon
  -- USAGE grant egy korabbi, default-PUBLIC EXECUTE rutint is elerhetove tehetne.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public_site_private'
      AND p.oid IS DISTINCT FROM v_validator_oid
      AND p.oid IS DISTINCT FROM v_context_v2_impl_oid
      AND p.oid IS DISTINCT FROM v_sitemap_impl_oid
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public_site_private'
  ) THEN
    RAISE EXCEPTION
      'Public-site content preflight: a dedikalt public_site_private sema ismeretlen objektumot tartalmaz.';
  END IF;

  IF v_context_v1_oid IS NULL
     OR pg_catalog.obj_description(
       v_context_v1_oid,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_PUBLIC_SITE_CONTEXT_V1'
  THEN
    RAISE EXCEPTION
      'Public-site content preflight: elobb a 2026-07-17 public-site security migraciot futtasd.';
  END IF;

  IF pg_catalog.has_table_privilege(
       'anon', 'public.public_sites', 'SELECT'
     )
     OR pg_catalog.has_any_column_privilege(
       'anon', 'public.public_sites', 'SELECT'
     )
  THEN
    RAISE EXCEPTION
      'Public-site content preflight: az anon public_sites direkt SELECT meg nincs visszavonva.';
  END IF;

  SELECT pg_catalog.pg_get_userbyid(n.nspowner)
    INTO v_schema_owner
  FROM pg_catalog.pg_namespace n
  WHERE n.nspname = 'public_site_private';

  IF v_schema_owner IS NOT NULL AND v_schema_owner <> 'postgres' THEN
    RAISE EXCEPTION
      'Public-site content preflight: a public_site_private sema tulajdonosa nem postgres: %',
      v_schema_owner;
  END IF;

  SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
    INTO v_column_type
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.public_sites'::regclass
    AND a.attname = 'service_times'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_column_type IS NOT NULL AND v_column_type <> 'jsonb' THEN
    RAISE EXCEPTION
      'Public-site content preflight: public_sites.service_times vart tipusa jsonb, tenyleges=%',
      v_column_type;
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(c.oid, true)
    INTO v_constraint_definition
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'public.public_sites'::regclass
    AND c.conname = 'public_sites_service_times_valid';

  IF v_constraint_definition IS NOT NULL
     AND v_constraint_definition NOT LIKE
       '%public_site_private.public_site_service_times_are_valid(service_times)%'
  THEN
    RAISE EXCEPTION
      'Public-site content preflight: ismeretlen service_times constraint van telepitve: %',
      v_constraint_definition;
  END IF;

  IF v_validator_oid IS NOT NULL
     AND pg_catalog.obj_description(
       v_validator_oid,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_PUBLIC_SERVICE_TIMES_VALIDATOR_V1'
  THEN
    RAISE EXCEPTION
      'Public-site content preflight: ismeretlen service_times validator van telepitve.';
  END IF;

  IF v_context_v2_impl_oid IS NOT NULL
     AND pg_catalog.obj_description(
       v_context_v2_impl_oid,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_PUBLIC_SITE_CONTEXT_V2_IMPL'
  THEN
    RAISE EXCEPTION
      'Public-site content preflight: ismeretlen private context V2 van telepitve.';
  END IF;

  IF v_sitemap_impl_oid IS NOT NULL
     AND pg_catalog.obj_description(
       v_sitemap_impl_oid,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_PUBLIC_SITEMAP_IMPL_V1'
  THEN
    RAISE EXCEPTION
      'Public-site content preflight: ismeretlen private sitemap rutin van telepitve.';
  END IF;

  IF v_context_v2_api_oid IS NOT NULL
     AND pg_catalog.obj_description(
       v_context_v2_api_oid,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_PUBLIC_SITE_CONTEXT_V2_API'
  THEN
    RAISE EXCEPTION
      'Public-site content preflight: ismeretlen public context V2 wrapper van telepitve.';
  END IF;

  IF v_sitemap_api_oid IS NOT NULL
     AND pg_catalog.obj_description(
       v_sitemap_api_oid,
       'pg_proc'
     ) IS DISTINCT FROM 'KARTOTEKA_PUBLIC_SITEMAP_API_V1'
  THEN
    RAISE EXCEPTION
      'Public-site content preflight: ismeretlen public sitemap wrapper van telepitve.';
  END IF;
END
$preflight$;

CREATE SCHEMA IF NOT EXISTS public_site_private AUTHORIZATION postgres;
ALTER SCHEMA public_site_private OWNER TO postgres;

REVOKE ALL ON SCHEMA public_site_private
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
    app_pending_user, member_portal_user;

-- PostgreSQLban a schema-local REVOKE nem irja felul a globalis default PUBLIC
-- EXECUTE-ot. Ezert szandekosan globalisan tesszuk fail-closedda a jovobeli,
-- postgres-owned rutinokat; minden uj RPC kulon exact GRANT-et igenyel.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role,
    app_staff_user, app_pending_user, member_portal_user;

-- A CHECK constraint kulon, nem exponalt validatorban marad. SECURITY INVOKER:
-- nem olvas tablat es nem emel jogosultsagot, csak a kapott JSONB-t ellenorzi.
CREATE OR REPLACE FUNCTION
  public_site_private.public_site_service_times_are_valid(p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $service_times_validator$
DECLARE
  v_item jsonb;
  v_ids text[] := ARRAY[]::text[];
  v_id text;
BEGIN
  IF p_value IS NULL
     OR pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'array'
  THEN
    RETURN false;
  END IF;

  IF pg_catalog.jsonb_array_length(p_value) > 12 THEN
    RETURN false;
  END IF;

  FOR v_item IN
    SELECT value
    FROM pg_catalog.jsonb_array_elements(p_value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RETURN false;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_object_keys(v_item) AS object_key(key_name)
      WHERE object_key.key_name NOT IN (
        'id', 'day', 'time', 'title', 'location', 'note'
      )
    ) THEN
      RETURN false;
    END IF;

    IF pg_catalog.jsonb_typeof(v_item -> 'id') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_item -> 'day') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_item -> 'time') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_item -> 'title') IS DISTINCT FROM 'string'
    THEN
      RETURN false;
    END IF;

    v_id := pg_catalog.lower(v_item ->> 'id');
    IF (v_item ->> 'id') IS DISTINCT FROM v_id
       OR v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR v_id = ANY(v_ids)
    THEN
      RETURN false;
    END IF;
    v_ids := pg_catalog.array_append(v_ids, v_id);

    IF (v_item ->> 'day') IS DISTINCT FROM pg_catalog.btrim(v_item ->> 'day')
       OR pg_catalog.char_length(v_item ->> 'day') NOT BETWEEN 2 AND 80
       OR (v_item ->> 'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR (v_item ->> 'title') IS DISTINCT FROM pg_catalog.btrim(v_item ->> 'title')
       OR pg_catalog.char_length(v_item ->> 'title') NOT BETWEEN 2 AND 80
    THEN
      RETURN false;
    END IF;

    IF v_item ? 'location'
       AND v_item -> 'location' <> 'null'::jsonb
       AND (
         pg_catalog.jsonb_typeof(v_item -> 'location') IS DISTINCT FROM 'string'
         OR (v_item ->> 'location') IS DISTINCT FROM
           pg_catalog.btrim(v_item ->> 'location')
         OR pg_catalog.char_length(v_item ->> 'location') > 120
       )
    THEN
      RETURN false;
    END IF;

    IF v_item ? 'note'
       AND v_item -> 'note' <> 'null'::jsonb
       AND (
         pg_catalog.jsonb_typeof(v_item -> 'note') IS DISTINCT FROM 'string'
         OR (v_item ->> 'note') IS DISTINCT FROM
           pg_catalog.btrim(v_item ->> 'note')
         OR pg_catalog.char_length(v_item ->> 'note') > 160
       )
    THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END
$service_times_validator$;

ALTER FUNCTION
  public_site_private.public_site_service_times_are_valid(jsonb)
  OWNER TO postgres;
COMMENT ON FUNCTION
  public_site_private.public_site_service_times_are_valid(jsonb) IS
  'KARTOTEKA_PUBLIC_SERVICE_TIMES_VALIDATOR_V1';

REVOKE ALL ON FUNCTION
  public_site_private.public_site_service_times_are_valid(jsonb)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
    app_pending_user, member_portal_user;
GRANT USAGE ON SCHEMA public_site_private
  TO authenticated, service_role, app_staff_user;
GRANT EXECUTE ON FUNCTION
  public_site_private.public_site_service_times_are_valid(jsonb)
  TO authenticated, service_role, app_staff_user;

ALTER TABLE public.public_sites
  ADD COLUMN IF NOT EXISTS service_times jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.public_sites
  ALTER COLUMN service_times SET DEFAULT '[]'::jsonb;
UPDATE public.public_sites
SET service_times = '[]'::jsonb
WHERE service_times IS NULL;
ALTER TABLE public.public_sites
  ALTER COLUMN service_times SET NOT NULL;

ALTER TABLE public.public_sites
  DROP CONSTRAINT IF EXISTS public_sites_service_times_valid;
ALTER TABLE public.public_sites
  ADD CONSTRAINT public_sites_service_times_valid
  CHECK (
    public_site_private.public_site_service_times_are_valid(service_times)
  ) NOT VALID;
ALTER TABLE public.public_sites
  VALIDATE CONSTRAINT public_sites_service_times_valid;

-- A V2 context megorzi a V1-et az expand/contract atallas idejere.
CREATE OR REPLACE FUNCTION
  public_site_private.public_site_context_v2(p_slug text)
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
  service_times jsonb,
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
AS $public_site_context_v2_impl$
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
    ps.service_times,
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
  WHERE pg_catalog.lower(pg_catalog.btrim(p_slug)) ~
      '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'
    AND ps.slug = pg_catalog.lower(pg_catalog.btrim(p_slug))
    AND ps.is_published = true
    AND c.status = 'active'
    AND c.public_site_enabled = true
  LIMIT 1;
$public_site_context_v2_impl$;

ALTER FUNCTION public_site_private.public_site_context_v2(text)
  OWNER TO postgres;
COMMENT ON FUNCTION public_site_private.public_site_context_v2(text) IS
  'KARTOTEKA_PUBLIC_SITE_CONTEXT_V2_IMPL';

CREATE OR REPLACE FUNCTION public.public_site_context_v2(p_slug text)
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
  service_times jsonb,
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
SECURITY INVOKER
SET search_path = ''
AS $public_site_context_v2_api$
  SELECT *
  FROM public_site_private.public_site_context_v2(p_slug);
$public_site_context_v2_api$;

ALTER FUNCTION public.public_site_context_v2(text) OWNER TO postgres;
COMMENT ON FUNCTION public.public_site_context_v2(text) IS
  'KARTOTEKA_PUBLIC_SITE_CONTEXT_V2_API';

-- A sitemap belso implementacioja csak nyilvanos, SEO-opt-in utvonalakat ad,
-- szemelyes adatot es belso gyulekezeti azonositoit nem.
CREATE OR REPLACE FUNCTION public_site_private.public_sitemap_entries()
RETURNS TABLE (
  site_slug text,
  route_kind text,
  content_slug text,
  last_modified timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $public_sitemap_impl$
  WITH visible_sites AS MATERIALIZED (
    SELECT
      ps.congregation_id,
      ps.slug,
      ps.updated_at
    FROM public.public_sites ps
    JOIN public.congregations c ON c.id = ps.congregation_id
    WHERE ps.is_published = true
      AND ps.robots_index = true
      AND ps.slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'
      AND c.status = 'active'
      AND c.public_site_enabled = true
  )
  SELECT
    vs.slug,
    fixed_route.route_kind,
    NULL::text,
    vs.updated_at
  FROM visible_sites vs
  CROSS JOIN (
    VALUES ('home'::text), ('posts'::text), ('about'::text), ('magazine'::text)
  ) AS fixed_route(route_kind)

  UNION ALL

  SELECT
    vs.slug,
    'post'::text,
    pp.slug,
    COALESCE(pp.updated_at, pp.published_at)
  FROM visible_sites vs
  JOIN public.public_posts pp ON pp.congregation_id = vs.congregation_id
  WHERE pp.status = 'published'
    AND pp.published_at <= pg_catalog.now()
    AND pp.slug ~ '^[a-z0-9][a-z0-9-]{0,127}$'

  UNION ALL

  SELECT
    vs.slug,
    'magazine_issue'::text,
    pmi.issue_number,
    COALESCE(pmi.updated_at, pmi.published_at)
  FROM visible_sites vs
  JOIN LATERAL (
    SELECT pm.id
    FROM public.public_magazines pm
    WHERE pm.congregation_id = vs.congregation_id
    ORDER BY pm.created_at DESC, pm.id DESC
    LIMIT 1
  ) pm ON true
  JOIN public.public_magazine_issues pmi
    ON pmi.magazine_id = pm.id
   AND pmi.congregation_id = vs.congregation_id
  WHERE pmi.is_published = true
    AND pg_catalog.char_length(pg_catalog.btrim(pmi.issue_number)) BETWEEN 1 AND 30;
$public_sitemap_impl$;

ALTER FUNCTION public_site_private.public_sitemap_entries() OWNER TO postgres;
COMMENT ON FUNCTION public_site_private.public_sitemap_entries() IS
  'KARTOTEKA_PUBLIC_SITEMAP_IMPL_V1';

CREATE OR REPLACE FUNCTION public.public_sitemap_entries()
RETURNS TABLE (
  site_slug text,
  route_kind text,
  content_slug text,
  last_modified timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $public_sitemap_api$
  SELECT *
  FROM public_site_private.public_sitemap_entries();
$public_sitemap_api$;

ALTER FUNCTION public.public_sitemap_entries() OWNER TO postgres;
COMMENT ON FUNCTION public.public_sitemap_entries() IS
  'KARTOTEKA_PUBLIC_SITEMAP_API_V1';

-- Default EXECUTE mindig visszavonva; csak a cookie-fuggetlen anon kliens kapja.
REVOKE ALL ON FUNCTION public_site_private.public_site_context_v2(text)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
    app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public_site_private.public_sitemap_entries()
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
    app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.public_site_context_v2(text)
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
    app_pending_user, member_portal_user;
REVOKE ALL ON FUNCTION public.public_sitemap_entries()
  FROM PUBLIC, anon, authenticated, service_role, app_staff_user,
    app_pending_user, member_portal_user;

GRANT USAGE ON SCHEMA public_site_private TO anon;
GRANT EXECUTE ON FUNCTION public_site_private.public_site_context_v2(text)
  TO anon;
GRANT EXECUTE ON FUNCTION public_site_private.public_sitemap_entries()
  TO anon;
GRANT EXECUTE ON FUNCTION public.public_site_context_v2(text) TO anon;
GRANT EXECUTE ON FUNCTION public.public_sitemap_entries() TO anon;

DO $postflight$
DECLARE
  v_column_ok boolean;
  v_constraint_ok boolean;
  v_validator_ok boolean;
  v_private_routines_ok boolean;
  v_public_routines_ok boolean;
BEGIN
  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('public_site_context_v2', 'public_sitemap_entries')
  ) <> 2
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public_site_private'
     ) <> 3
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public_site_private'
     )
  THEN
    RAISE EXCEPTION
      'Public-site content postflight: public/private routine nev vagy overload halmaz drift.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl default_acl
    CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) acl
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
    WHERE default_acl.defaclrole = (
      SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = 'postgres'
    )
      AND default_acl.defaclnamespace = 0
      AND default_acl.defaclobjtype = 'f'
      AND acl.privilege_type = 'EXECUTE'
      AND (
        acl.grantee = 0
        OR grantee.rolname IN (
          'anon', 'authenticated', 'service_role', 'app_staff_user',
          'app_pending_user', 'member_portal_user'
        )
      )
  ) THEN
    RAISE EXCEPTION
      'Public-site content postflight: jovobeli postgres rutin default EXECUTE ACL drift.';
  END IF;

  IF pg_catalog.pg_get_userbyid(
       (
         SELECT n.nspowner
         FROM pg_catalog.pg_namespace n
         WHERE n.nspname = 'public_site_private'
       )
     ) IS DISTINCT FROM 'postgres'
     OR NOT pg_catalog.has_schema_privilege(
       'anon', 'public_site_private', 'USAGE'
     )
     OR NOT pg_catalog.has_schema_privilege(
       'authenticated', 'public_site_private', 'USAGE'
     )
     OR NOT pg_catalog.has_schema_privilege(
       'service_role', 'public_site_private', 'USAGE'
     )
     OR NOT pg_catalog.has_schema_privilege(
       'app_staff_user', 'public_site_private', 'USAGE'
     )
     OR pg_catalog.has_schema_privilege(
       'app_pending_user', 'public_site_private', 'USAGE'
     )
     OR pg_catalog.has_schema_privilege(
       'member_portal_user', 'public_site_private', 'USAGE'
     )
  THEN
    RAISE EXCEPTION
      'Public-site content postflight: public_site_private sema owner/USAGE ACL drift.';
  END IF;

  SELECT
    a.atttypid = 'pg_catalog.jsonb'::regtype
    AND a.attnotnull
    AND pg_catalog.pg_get_expr(d.adbin, d.adrelid) = '''[]''::jsonb'
    INTO v_column_ok
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_attrdef d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.public_sites'::regclass
    AND a.attname = 'service_times'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_column_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Public-site content postflight: service_times tipus/default/not-null drift.';
  END IF;

  SELECT
    c.contype = 'c'
    AND c.convalidated
    AND pg_catalog.pg_get_constraintdef(c.oid, true) LIKE
      '%public_site_private.public_site_service_times_are_valid(service_times)%'
    INTO v_constraint_ok
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'public.public_sites'::regclass
    AND c.conname = 'public_sites_service_times_valid';

  IF v_constraint_ok IS DISTINCT FROM true
     OR EXISTS (
       SELECT 1
       FROM public.public_sites ps
       WHERE NOT public_site_private.public_site_service_times_are_valid(
         ps.service_times
       )
     )
  THEN
    RAISE EXCEPTION
      'Public-site content postflight: service_times constraint vagy adat drift.';
  END IF;

  SELECT
    NOT p.prosecdef
    AND p.provolatile = 'i'
    AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    AND pg_catalog.obj_description(p.oid, 'pg_proc') =
      'KARTOTEKA_PUBLIC_SERVICE_TIMES_VALIDATOR_V1'
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
      WHERE cfg IN ('search_path=', 'search_path=""')
    )
    AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    AND pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
    AND pg_catalog.has_function_privilege('app_staff_user', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('app_pending_user', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('member_portal_user', p.oid, 'EXECUTE')
    INTO v_validator_ok
  FROM pg_catalog.pg_proc p
  WHERE p.oid =
    'public_site_private.public_site_service_times_are_valid(jsonb)'::regprocedure;

  IF v_validator_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Public-site content postflight: service_times validator definicio/ACL drift.';
  END IF;

  IF NOT public_site_private.public_site_service_times_are_valid('[]'::jsonb)
     OR NOT public_site_private.public_site_service_times_are_valid(
       '[{"id":"11111111-1111-4111-8111-111111111111","day":"Vasarnap","time":"10:00","title":"Istentisztelet","location":null,"note":""}]'::jsonb
     )
     OR public_site_private.public_site_service_times_are_valid(
       '[{"id":"11111111-1111-4111-8111-111111111111","day":"Vasarnap","time":"25:00","title":"Istentisztelet"}]'::jsonb
     )
     OR public_site_private.public_site_service_times_are_valid(
       '[{"id":"11111111-1111-4111-8111-111111111111","day":"Vasarnap","time":"10:00","title":"Istentisztelet","unexpected":true}]'::jsonb
     )
     OR public_site_private.public_site_service_times_are_valid(
       '[{"id":"AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA","day":"Vasarnap","time":"10:00","title":"Istentisztelet"}]'::jsonb
     )
     OR public_site_private.public_site_service_times_are_valid(
       '[{"id":"11111111-1111-4111-8111-111111111111","day":" Vasarnap ","time":"10:00","title":"Istentisztelet"}]'::jsonb
     )
  THEN
    RAISE EXCEPTION
      'Public-site content postflight: service_times validator viselkedesi teszt sikertelen.';
  END IF;

  SELECT pg_catalog.bool_and(
    p.prosecdef
    AND p.provolatile = expected.volatility
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
  ) AND pg_catalog.count(*) = 2
    INTO v_private_routines_ok
  FROM (VALUES
    (
      'public_site_private.public_site_context_v2(text)'::regprocedure,
      's'::"char",
      'KARTOTEKA_PUBLIC_SITE_CONTEXT_V2_IMPL'::text
    ),
    (
      'public_site_private.public_sitemap_entries()'::regprocedure,
      's'::"char",
      'KARTOTEKA_PUBLIC_SITEMAP_IMPL_V1'::text
    )
  ) expected(oid, volatility, marker)
  JOIN pg_catalog.pg_proc p ON p.oid = expected.oid;

  IF v_private_routines_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Public-site content postflight: private SECURITY DEFINER rutin drift.';
  END IF;

  SELECT pg_catalog.bool_and(
    NOT p.prosecdef
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
  ) AND pg_catalog.count(*) = 2
    INTO v_public_routines_ok
  FROM (VALUES
    (
      'public.public_site_context_v2(text)'::regprocedure,
      'KARTOTEKA_PUBLIC_SITE_CONTEXT_V2_API'::text
    ),
    (
      'public.public_sitemap_entries()'::regprocedure,
      'KARTOTEKA_PUBLIC_SITEMAP_API_V1'::text
    )
  ) expected(oid, marker)
  JOIN pg_catalog.pg_proc p ON p.oid = expected.oid;

  IF v_public_routines_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Public-site content postflight: public SECURITY INVOKER wrapper/ACL drift.';
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
         AND pol.cmd IN ('ALL', 'SELECT')
         AND pol.roles && ARRAY['public', 'anon']::name[]
     )
  THEN
    RAISE EXCEPTION
      'Public-site content postflight: anon public_sites direkt olvasas ujra megjelent.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.public_sitemap_entries() entry
    WHERE entry.route_kind NOT IN (
      'home', 'posts', 'about', 'magazine', 'post', 'magazine_issue'
    )
      OR entry.site_slug IS NULL
      OR (
        entry.route_kind IN ('post', 'magazine_issue')
        AND entry.content_slug IS NULL
      )
      OR (
        entry.route_kind IN ('home', 'posts', 'about', 'magazine')
        AND entry.content_slug IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION
      'Public-site content postflight: ervenytelen sitemap kimeneti szerzodes.';
  END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Kezi, csak olvaso ellenorzes a futas utan:
-- SELECT * FROM public.public_site_context_v2('<publikalt-slug>');
-- SELECT * FROM public.public_sitemap_entries() ORDER BY site_slug, route_kind;
-- SELECT service_times FROM public.public_sites WHERE slug = '<slug>';
