-- =========================================================================
-- 2026-07-01 — (DIAGNOSZTIKA) Árva OAuth pending profilok — Bug 1 mellékhatás
-- =========================================================================
-- HÁTTÉR: a `handle_new_user` trigger MINDEN friss auth-userre létrehoz egy
--   `status='pending'` profilt — a Google-lel belépő ISMERETLEN emailekre is.
--   Az app mostantól ezeket kijelentkezteti és „nincs regisztrálva" üzenetet ad
--   (lásd 2026-07-01 fix), de a trigger által létrehozott PENDING profil bent
--   marad a DB-ben, és megjelenhet az admin jóváhagyási listáján.
--
-- EZ A SCRIPT CSAK LISTÁZ (nem töröl). Nézd át a találatokat; a törlést a
--   legvégén, kézzel, kikommentezett blokkból futtathatod, ha biztos vagy benne.
--
-- „Árva" = pending, NINCS egyházmegye, NINCS egyházközség, NINCS access_request a
--   címéhez, és NINCS profile_role — tehát az illető sosem igényelt hozzáférést és
--   nem is haladt a regisztrációval; a profil pusztán a Google-belépés triggeréből van.
-- =========================================================================

SELECT
  p.id,
  u.email,
  p.status,
  p.created_at,
  p.diocese_id,
  p.congregation_id,
  (SELECT count(*) FROM public.access_requests ar WHERE lower(ar.email) = lower(u.email)) AS access_request_db,
  (SELECT count(*) FROM public.profile_roles r WHERE r.profile_id = p.id)                 AS profile_role_db
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.status = 'pending'
  AND p.diocese_id IS NULL
  AND p.congregation_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.access_requests ar WHERE lower(ar.email) = lower(u.email))
  AND NOT EXISTS (SELECT 1 FROM public.profile_roles r WHERE r.profile_id = p.id)
ORDER BY p.created_at DESC;

-- ─────────────────────────────────────────────────────────────────────────
-- OPCIONÁLIS TÖRLÉS — CSAK a fenti lista gondos átnézése után, kézzel.
-- Vedd figyelembe: a profiles.id az auth.users(id)-ra mutat (FK). A profil
-- törlése NEM törli az auth.users sort — ha teljesen el akarod távolítani a
-- fiókot, az auth.users törlése a Supabase Auth admin felületén / API-n át megy.
-- ─────────────────────────────────────────────────────────────────────────
-- DELETE FROM public.profiles p
-- USING auth.users u
-- WHERE p.id = u.id
--   AND p.status = 'pending'
--   AND p.diocese_id IS NULL
--   AND p.congregation_id IS NULL
--   AND NOT EXISTS (SELECT 1 FROM public.access_requests ar WHERE lower(ar.email) = lower(u.email))
--   AND NOT EXISTS (SELECT 1 FROM public.profile_roles r WHERE r.profile_id = p.id)
--   AND lower(u.email) = lower('ide@a-konkret-email.com');  -- <<< célzott törlés egy címre
