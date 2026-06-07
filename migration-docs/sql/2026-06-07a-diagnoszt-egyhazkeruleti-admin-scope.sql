-- =============================================================================
-- DIAGNOSZTIKA: egyházkerületi adminok hatóköre (#2, 2026-06-07)
--
-- A kód-szintű hatókör-korlátozás (Fázis 1-3) a profile_roles district-scope
-- soraiból (scope='district', scope_id = egyházkerület) olvassa ki, MELYIK
-- kerülethez tartozik egy egyházkerületi admin. Ha egy kerületi adminnál NINCS
-- beállítva a scope_id, akkor a hatóköre ÜRES → "semmit nem lát".
--
-- Ez a script CSAK OLVAS (SELECT) — semmit nem módosít. Futtasd le, és nézd meg,
-- van-e olyan kerületi admin, akinél hiányzik a kerület.
-- =============================================================================

-- 1) Minden egyházkerületi admin szerepkör + a hozzá tartozó kerület.
--    Ahol district_scope_id IS NULL ÉS profile_district_id IS NULL → PROBLÉMÁS:
--    a kód nem tudja, melyik kerülethez tartozik → üres hatókör.
SELECT
  p.id                       AS profile_id,
  p.full_name,
  p.email,
  p.role                     AS legacy_role,
  p.district_id              AS profile_district_id,
  d_prof.name                AS profile_district_name,
  pr.id                      AS profile_role_id,
  pr.scope                   AS role_scope,
  pr.scope_id                AS role_scope_id,
  d_role.name                AS role_district_name,
  pr.approval_status,
  pr.active,
  CASE
    WHEN pr.scope = 'district' AND pr.scope_id IS NOT NULL THEN 'OK (district-scope beállítva)'
    WHEN p.district_id IS NOT NULL THEN 'OK (profile.district_id fallback)'
    ELSE '⚠ HIÁNYZIK A KERÜLET — üres hatókör!'
  END                        AS scope_status
FROM public.profiles p
LEFT JOIN public.profile_roles pr
  ON pr.profile_id = p.id
 AND pr.role = 'egyhazkeruleti_admin'
 AND pr.approval_status = 'approved'
 AND pr.active = true
LEFT JOIN public.districts d_role ON d_role.id = pr.scope_id
LEFT JOIN public.districts d_prof ON d_prof.id = p.district_id
WHERE p.role = 'egyhazkeruleti_admin'
   OR pr.id IS NOT NULL
ORDER BY scope_status DESC, p.full_name;

-- 2) Összesítő: hány kerületi adminnak hiányzik a kerülete?
SELECT
  count(*) FILTER (
    WHERE NOT EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = p.id
        AND pr.role = 'egyhazkeruleti_admin'
        AND pr.scope = 'district'
        AND pr.scope_id IS NOT NULL
        AND pr.approval_status = 'approved'
        AND pr.active = true
    )
    AND p.district_id IS NULL
  )                          AS kerulet_nelkuli_adminok,
  count(*)                   AS osszes_keruleti_admin
FROM public.profiles p
WHERE p.role = 'egyhazkeruleti_admin';

-- =============================================================================
-- HA a 2) lekérdezés > 0 "kerulet_nelkuli_adminok"-at mutat, akkor pótolni kell:
-- vagy a profile_roles district-scope sort (scope_id = a helyes egyházkerület),
-- vagy a profiles.district_id mezőt. Ehhez küldök külön, célzott UPDATE-et,
-- amint tudjuk, melyik admin melyik kerülethez tartozik.
-- =============================================================================
