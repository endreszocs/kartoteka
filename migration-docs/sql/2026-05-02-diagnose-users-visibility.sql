-- ============================================================================
-- DIAGNOSZTIKA — Miért nem látszik egy user az admin felületen?
-- ============================================================================
-- 2026-05-02 — Felhasználó panasza: "Az admin oldalon, sem a felhasználóknál
-- sem a szerepköröknél nem jelenik meg a regisztrált és elfogadott új
-- felhasználó!"
--
-- Az admin felületen 3 hely listázza a user-eket:
--
--   1. /admin/felhasznalok "Pending"  → getPendingUsers() — profiles WHERE status='pending'
--   2. /admin/felhasznalok "Active"   → getActiveUsers()  — profiles WHERE status='active'
--   3. /admin/szerepkorok             → listAssignableProfiles() — profiles WHERE status='active'
--
-- Tehát: a user-nek profiles-ban LÉTEZNIE KELL és status='active' (vagy
-- pending). Ha nincs profile-sora vagy más a status, NEM JELENIK MEG.
-- ============================================================================

-- ── 1. AUTH USERS — a Supabase auth-rendszerben kik vannak? ──────────────
SELECT
  u.id,
  u.email,
  u.email_confirmed_at IS NOT NULL AS email_confirmed,
  u.created_at,
  u.last_sign_in_at,
  CASE
    WHEN u.raw_user_meta_data->>'full_name' IS NOT NULL THEN u.raw_user_meta_data->>'full_name'
    WHEN u.raw_user_meta_data->>'name' IS NOT NULL THEN u.raw_user_meta_data->>'name'
    ELSE '(üres)'
  END AS metadata_full_name,
  COALESCE(u.raw_app_meta_data->>'provider', 'email') AS provider
FROM auth.users u
ORDER BY u.created_at DESC;

-- ── 2. PROFILES — kik vannak a profiles táblában? ────────────────────────
SELECT
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.status,
  p.created_at
FROM public.profiles p
ORDER BY p.created_at DESC;

-- ── 3. KÜLÖNBSÉG — mely auth.users-nek NINCS profile-sora? ───────────────
SELECT
  u.id,
  u.email,
  u.created_at,
  COALESCE(u.raw_app_meta_data->>'provider', 'email') AS provider,
  '⚠ NINCS PROFILE — NEM JELENIK MEG az admin felületen!' AS diagnozis
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ORDER BY u.created_at DESC;

-- ── 4. STATUS-ELEMZÉS — milyen státuszokban vannak a profile-ok? ─────────
SELECT
  COALESCE(status, '(NULL)') AS status,
  COUNT(*) AS db,
  CASE COALESCE(status, '(NULL)')
    WHEN 'active' THEN '✅ Látható az "Active" listában + Szerepkörök fülön'
    WHEN 'pending' THEN '🕐 Csak a "Pending" fülön — nem szerepelhet szerepkört'
    WHEN 'approved' THEN '⚠ Régi státusz — fut már a v0.9.37 fix? (UPDATE → active)'
    WHEN 'denied' THEN '❌ Elutasítva — nem jelenik meg'
    WHEN 'rejected' THEN '❌ Elutasítva — nem jelenik meg'
    ELSE '⚠ Ismeretlen — nem jelenik meg!'
  END AS hatas
FROM public.profiles
GROUP BY status
ORDER BY db DESC;

-- ── 5. JAVÍTÁS — pending → active (ha az admin elfogadta de nem aktív) ──
-- HA a 4. blokk azt mutatja, hogy van olyan user akit elfogadtak, de
-- 'pending'-ben maradt (pl. régi flow), AKKOR fut a következő UPDATE.
-- Ne kommenteld ki, csak akkor futtasd, ha tényleg ezt akarod!

-- UPDATE public.profiles
--    SET status = 'active'
--  WHERE status = 'pending'
--    AND id IN (
--      SELECT resulting_user_id FROM public.access_requests
--      WHERE status = 'approved' AND resulting_user_id IS NOT NULL
--    );

-- ── 6. ÖSSZESÍTŐ — kik fognak látszódni az admin felületen? ──────────────
SELECT
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.status,
  CASE p.status
    WHEN 'active' THEN '✅ /admin/felhasznalok (Aktív) + /admin/szerepkorok'
    WHEN 'pending' THEN '🕐 /admin/felhasznalok (Pending) — NEM látszik szerepkörökön'
    ELSE '❌ Sehol nem látszik'
  END AS hol_latszik
FROM public.profiles p
ORDER BY
  CASE p.status WHEN 'active' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
  p.full_name NULLS LAST;

-- ============================================================================
-- KÉSZ. Az 1-5. SELECT eredménye megmondja PONTOSAN miért nem látszik egy user.
-- A 6. blokk az össz-állapot — ezt küldd vissza, és tudni fogom mi a teendő!
-- ============================================================================
