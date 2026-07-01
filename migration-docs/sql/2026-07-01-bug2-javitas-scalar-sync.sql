-- ============================================================================
-- 2026-07-01 — BUG 2 JAVÍTÁS (scalar-sync) — a congregation_id feltöltése a saját szerepből
-- ============================================================================
-- MIT CSINÁL: minden AKTÍV fióknál, akinek a profiles.congregation_id NULL, DE PONTOSAN EGY
--   jóváhagyott (approved) + aktív, congregation-scope profile_roles sora van, a skalár mezőt
--   a SAJÁT szerepe scope_id-jából tölti ki. NEM tippel: mindenkit a saját, admin által már
--   jóváhagyott gyülekezetéhez köt. Idempotens és biztonságos.
--
-- Rendbe teszi (a diagnosztika szerint): beketivadar@gmail.com → Zabolai,
--   ferenczi.cs.zoltan@gmail.com → Maksai, oprakoppany98@gmail.com → Kisbaconi.
--
-- JAVÍTVA (2026-07-01): a Postgresben nincs min(uuid), ezért (array_agg(scope_id))[1]-et
--   használunk (a HAVING count(*)=1 miatt pontosan 1 elem van).
--
-- FUTTATÁS: PART A csak MEGMUTATJA, mit változtatna (read-only). Nézd át; ha jó, futtasd PART B-t.
-- ============================================================================

-- ── PART A — SZÁRAZ FUTÁS (mit írna át; semmit nem módosít) ──────────────────
SELECT
  u.email,
  p.congregation_id  AS jelenlegi_NULL,
  r.scope_id         AS uj_congregation_id,
  rc.name            AS uj_gyulekezet
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
JOIN (
  SELECT profile_id, (array_agg(scope_id))[1] AS scope_id
  FROM public.profile_roles
  WHERE scope = 'congregation' AND approval_status = 'approved' AND active AND scope_id IS NOT NULL
  GROUP BY profile_id
  HAVING count(*) = 1            -- csak egyértelmű eset: pontosan 1 jóváhagyott gyülekezet
) r ON r.profile_id = p.id
LEFT JOIN public.congregations rc ON rc.id = r.scope_id
WHERE p.congregation_id IS NULL AND p.status = 'active'
ORDER BY u.email;


-- ── PART B — A JAVÍTÁS (futtasd, ha a PART A előnézet helyes) ────────────────
UPDATE public.profiles p
SET congregation_id = r.scope_id
FROM (
  SELECT profile_id, (array_agg(scope_id))[1] AS scope_id
  FROM public.profile_roles
  WHERE scope = 'congregation' AND approval_status = 'approved' AND active AND scope_id IS NOT NULL
  GROUP BY profile_id
  HAVING count(*) = 1
) r
WHERE p.id = r.profile_id
  AND p.congregation_id IS NULL
  AND p.status = 'active';


-- ── ELLENŐRZÉS a javítás után ───────────────────────────────────────────────
SELECT u.email, p.status, p.congregation_id, c.name AS gyulekezet
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
LEFT JOIN public.congregations c ON c.id = p.congregation_id
WHERE lower(u.email) IN ('beketivadar@gmail.com','ferenczi.cs.zoltan@gmail.com','oprakoppany98@gmail.com')
ORDER BY u.email;
