-- ============================================================================
-- BUG-FIX — profiles.status 'approved' → 'active'
-- ============================================================================
-- 2026-05-02 — A felhasználó panasza: a Google-fiókkal NEM tud belépni, pedig
-- az admin már elfogadta a hozzáférés-kérelmét.
--
-- HÁTTÉR:
-- A `approveAccessRequest` server action a `profiles.status`-t **'approved'**-ra
-- állította. DE a webes auth-flow MINDEN ellenőrzése (`callback/route.ts`,
-- `login/actions.ts`, `(setup)/layout.tsx`, `oauth-complete/page.tsx`,
-- `pending/page.tsx`) **`status === 'active'`**-ot követel. Az 'approved' egy
-- KORÁBBI flow-ból maradt szemantika, ami sehol nem konvertálódik tovább.
--
-- KÖVETKEZMÉNY:
-- - Aki access-request-en keresztül elfogadott, NEM tud belépni
-- - Csak a master admin (Szőcs Endre) lép be, mert nála a jogosultság
--   email-alapján is érvényes
--
-- KÓD-OLDAL FIX (v0.9.37):
-- A `access-requests-actions.ts` mostantól 'active'-ra állít.
--
-- DB-OLDAL FIX (ITT):
-- A meglévő 'approved' státuszú profile-okat is átmigráljuk 'active'-ra,
-- különben nem tudnak belépni.
-- ============================================================================

BEGIN;

-- ── 1. ÁLLAPOT ELŐTTE ──────────────────────────────────────────────────

-- Hány profile van 'approved' státusszal? (várt: néhány vagy 0)
SELECT
  status,
  COUNT(*) AS db
FROM public.profiles
GROUP BY status
ORDER BY status;

-- ── 2. ÁTMIGRÁLÁS ─────────────────────────────────────────────────────

UPDATE public.profiles
   SET status = 'active'
 WHERE status = 'approved';

-- ── 3. ÁLLAPOT UTÁNA ──────────────────────────────────────────────────

SELECT
  status,
  COUNT(*) AS db
FROM public.profiles
GROUP BY status
ORDER BY status;

COMMIT;

-- ── 4. ELLENŐRZÉS — kik a most beléptethető user-ek?
SELECT
  p.id,
  u.email,
  p.role,
  p.status,
  p.full_name
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.status = 'active'
ORDER BY u.email;

-- ============================================================================
-- KÉSZ. A felhasználó (Szőcs Endre rendszergazda) futtatja a Supabase-en.
-- A futtatás után az ÖSSZES korábban elfogadott felhasználó tud belépni —
-- akár Google-fiókkal, akár jelszóval.
-- ============================================================================
