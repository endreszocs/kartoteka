-- ============================================================================
-- 2026-07-01 — BUG 2 RÉSZLETEK (READ-ONLY) — melyik fiók melyik gyülekezethez tartozik?
-- ============================================================================
-- A tisztázó diagnosztika kiderítette: több AKTÍV fióknak van JÓVÁHAGYOTT gyülekezeti
-- szerepe (profile_roles), DE a profiles.congregation_id skalár NULL → az RLS nem lát adatot.
-- Ez a lekérdezés MEGMUTATJA, MELYIK gyülekezethez tartozik minden érintett (RLS=NEM) fiók,
-- hogy a javítás előtt ellenőrizni tudd. CSAK SELECT. Futtasd egyben.
-- ============================================================================
SELECT
  u.email,
  p.status,
  p.role,
  p.congregation_id                    AS profil_congregation_id_MOST,
  r.scope_id                           AS szerep_congregation_id,
  rc.name                              AS szerep_gyulekezet,
  r.approval_status,
  r.active,
  r.granted_at
FROM public.profiles p
JOIN auth.users u                 ON u.id = p.id
LEFT JOIN public.profile_roles r  ON r.profile_id = p.id AND r.scope = 'congregation'
LEFT JOIN public.congregations rc ON rc.id = r.scope_id
WHERE p.deleted_at IS NULL
  AND (p.congregation_id IS NULL OR p.status <> 'active')   -- minden „nem lát adatot" fiók
ORDER BY u.email, r.approval_status NULLS LAST, r.granted_at;

-- ÉRTELMEZÉS:
--   • Ha egy AKTÍV fióknak van 'approved' + active='true' sora egy gyülekezetre, de a
--     profil_congregation_id_MOST NULL → ezt a scalar-sync javítás rendbe teszi
--     (2026-07-01-bug2-javitas-scalar-sync.sql).
--   • Ha egy fiók status='pending' és nincs 'approved' szerepe (pl. endre940115) → az még
--     JÓVÁHAGYÁSRA vár; azt az admin felületen kell aktiválni (a felhasználó-kezelésnél),
--     ami mostantól a congregation_id-t is beírja (2026-07-01-admin-activate-user-reassign.sql).
