-- READ-ONLY — Tagi portál token-hook előtti profilállapot-ellenőrzés
-- A korábbi inventory négy sort adatminimalizálás miatt `<unexpected>` bucketbe
-- tett. Ez a lekérdezés személyazonosító adat nélkül mutatja a tényleges státuszt.

WITH status_groups AS (
  SELECT
    COALESCE(NULLIF(pg_catalog.btrim(p.status), ''), '<missing>') AS actual_status,
    COALESCE(NULLIF(pg_catalog.btrim(p.role), ''), '<missing>') AS profile_role,
    count(*)::bigint AS profile_count,
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM public.profile_roles pr
        WHERE pr.profile_id = p.id
          AND pr.active
          AND pr.approval_status = 'approved'
      )
    )::bigint AS profiles_with_active_approved_assignment
  FROM public.profiles p
  GROUP BY 1, 2
)
SELECT
  actual_status,
  profile_role,
  profile_count,
  profiles_with_active_approved_assignment,
  actual_status IN (
    'active', 'pending', 'approved', 'rejected', 'deleted'
  ) AS accepted_by_token_hook_preflight
FROM status_groups
ORDER BY actual_status, profile_role;

-- A legacy profiles.role/scope és az új, authoritative profile_roles modell
-- eltérése érzékeny régi policyknél túl széles vagy hibás hozzáférést okozhat.
-- A P0 cutover csak akkor folytatható, ha minden active sor `aligned=true`.
WITH active_profiles AS (
  SELECT
    p.id AS profile_id,
    p.role AS legacy_role,
    p.congregation_id,
    p.diocese_id,
    p.district_id
  FROM public.profiles p
  WHERE p.status = 'active'
    AND p.deleted_at IS NULL
    AND p.anonymized_at IS NULL
), alignment AS (
  SELECT
    p.*,
    EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = p.profile_id
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND (
          (
            p.legacy_role = 'admin'
            AND pr.role = 'admin'
            AND pr.scope = 'system'
            AND pr.scope_id IS NULL
          )
          OR (
            p.legacy_role = 'egyhazkeruleti_admin'
            AND pr.role = p.legacy_role
            AND pr.scope = 'district'
            AND pr.scope_id = p.district_id
          )
          OR (
            p.legacy_role IN (
              'egyhazmegyei_admin', 'esperes', 'egyhazmegyei_szamvevo'
            )
            AND pr.role = p.legacy_role
            AND pr.scope = 'diocese'
            AND pr.scope_id = p.diocese_id
          )
          OR (
            p.legacy_role = 'lelkesz'
            AND pr.role = 'lelkesz'
            AND pr.scope = 'congregation'
            AND pr.scope_id = p.congregation_id
          )
          OR (
            p.legacy_role = 'konyvelo'
            AND pr.role = 'konyvelo'
            AND pr.scope = 'congregation'
            AND pr.scope_id = p.congregation_id
          )
        )
    ) AS aligned
  FROM active_profiles p
)
SELECT
  legacy_role,
  count(*)::bigint AS active_profile_count,
  count(*) FILTER (WHERE aligned)::bigint AS aligned_count,
  count(*) FILTER (WHERE NOT aligned)::bigint AS misaligned_count,
  COALESCE(
    pg_catalog.array_agg(profile_id ORDER BY profile_id)
      FILTER (WHERE NOT aligned),
    ARRAY[]::uuid[]
  ) AS misaligned_profile_ids
FROM alignment
GROUP BY legacy_role
ORDER BY legacy_role;
