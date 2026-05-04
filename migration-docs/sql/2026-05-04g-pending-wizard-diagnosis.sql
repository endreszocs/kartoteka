-- =========================================================================
-- 2026-05-04 — Pending wizard diagnosis (CSAK OLVASÓ)
-- =========================================================================
-- KONTEXTUS:
--   A 2026-05-04f-complete-user-onboarding-rpc.sql ellenőrzéskor 3
--   pending_wizard_count jött vissza — 3 aktív lelkésznek még NULL
--   az onboarding_completed_at-ja.
--
--   Ez nem feltétlen jelent bugot mindegyiknek:
--     - Lehet, hogy MOST regisztrált, és még el sem kezdte a wizardot.
--     - Lehet, hogy elkezdte, de elhagyta valami step-en.
--     - Lehet, hogy végigment, de a silent-fail bug miatt nem mentődött el.
--
--   A wizard_progress tábla current_step mezője árulkodik:
--     - 1-2 → még az elején
--     - 3-4 → félig kész
--     - 5 → végigment (de NULL onboarding_completed_at miatt nem rögzült)
--
--   Az 5-ös current_step-űeket biztonságosan fel-menthetjük.
-- =========================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Részletes lista a pending-wizard user-ekről
-- ──────────────────────────────────────────────────────────────────────────

SELECT
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.created_at AS profile_created,
  p.onboarding_completed_at,
  c.nev_hu AS gyulekezet,
  wp.current_step,
  wp.completed_at AS wizard_completed_at,
  wp.updated_at AS wizard_last_updated,
  CASE
    WHEN wp.completed_at IS NOT NULL THEN '✅ wizard_progress kész — fix kell'
    WHEN wp.current_step = 5 THEN '⚠️ utolsó step-en, valószínűleg silent-fail'
    WHEN wp.current_step >= 3 THEN '⏳ félúton'
    WHEN wp.current_step IS NULL THEN '🆕 még el sem kezdte'
    ELSE '📝 az elején'
  END AS diagnosis
FROM public.profiles p
LEFT JOIN public.congregations c ON c.id = p.congregation_id
LEFT JOIN public.wizard_progress wp ON wp.user_id = p.id
WHERE p.onboarding_completed_at IS NULL
  AND p.status = 'active'
ORDER BY wp.current_step DESC NULLS LAST, p.created_at DESC;


-- ──────────────────────────────────────────────────────────────────────────
-- 2. (OPCIONÁLIS) Felmentés a végigjárt wizard-osokra
-- ──────────────────────────────────────────────────────────────────────────
-- Ha az 1. lekérdezés azt mutatja, hogy egy vagy több user a wizard
-- 5. lépésénél van VAGY a wizard_progress.completed_at NEM null, akkor
-- biztonságos felmenteni a profiles.onboarding_completed_at mezőjüket
-- a tényleges wizard-vég dátumára (vagy a most-ra fallback-kel).
--
-- Vegye le a kommentet, ha kéri:

-- UPDATE public.profiles p
--    SET onboarding_completed_at = COALESCE(wp.completed_at, wp.updated_at, now())
--   FROM public.wizard_progress wp
--  WHERE wp.user_id = p.id
--    AND p.onboarding_completed_at IS NULL
--    AND p.status = 'active'
--    AND (wp.completed_at IS NOT NULL OR wp.current_step = 5)
-- RETURNING p.id, p.email, p.onboarding_completed_at AS new_completed_at;
