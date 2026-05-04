-- =========================================================================
-- 2026-05-04 — Béke Tivadar (beketivadar@gmail.com) diagnosis
-- =========================================================================
-- A 4. érintett lelkész: Béke Tivadar. A korábbi pending-wizard listában
-- nem szerepelt — vagy onboarding_completed_at-ja már be van állítva,
-- vagy a status-a NEM 'active'.
--
-- Ez a SQL minden releváns adatát megmutatja, hogy lássuk pontosan,
-- mi a helyzet vele.

SELECT
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.status,
  p.created_at AS profile_created,
  p.onboarding_completed_at,
  p.congregation_id,
  c.nev_hu AS gyulekezet_nev,
  d.name AS egyhazmegye_nev,
  wp.current_step,
  wp.completed_at AS wizard_completed_at,
  wp.updated_at AS wizard_last_updated,
  wp.data AS wizard_data_keys
FROM public.profiles p
LEFT JOIN public.congregations c ON c.id = p.congregation_id
LEFT JOIN public.dioceses d ON d.id = c.diocese_id
LEFT JOIN public.wizard_progress wp ON wp.user_id = p.id
WHERE p.email = 'beketivadar@gmail.com';


-- ──────────────────────────────────────────────────────────────────────────
-- Profile_roles: van-e neki kiosztott szerepe?
-- ──────────────────────────────────────────────────────────────────────────

SELECT
  pr.id,
  pr.scope,
  pr.scope_id,
  pr.role,
  pr.approval_status,
  pr.active,
  pr.granted_at,
  pr.approved_at,
  CASE
    WHEN pr.scope = 'congregation' THEN c.nev_hu
    WHEN pr.scope = 'diocese' THEN d.name
    ELSE NULL
  END AS scope_name
FROM public.profile_roles pr
LEFT JOIN public.profiles p ON p.id = pr.profile_id
LEFT JOIN public.congregations c ON c.id = pr.scope_id AND pr.scope = 'congregation'
LEFT JOIN public.dioceses d ON d.id = pr.scope_id AND pr.scope = 'diocese'
WHERE p.email = 'beketivadar@gmail.com'
ORDER BY pr.granted_at DESC;
