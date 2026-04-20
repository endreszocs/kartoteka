-- =========================================================================
-- 2026-04-18 — Profile Roles diagnosztika: miért nem látszik a profilváltó?
-- =========================================================================
-- CÉL:
--   Endre jelezte, hogy nem találja a header-ben a profilváltó UI-t.
--   A profilváltó csak akkor jelenik meg, ha a felhasználónak LEGALÁBB 2
--   approved + active sora van a `public.profile_roles` táblában.
--
-- GYANÚ:
--   A rendszer korábbi kódjában a szerepkörök a `profiles.role` mezőben
--   tárolódtak (szöveges enum). A 2026-04-17-i `profile_roles` migráció
--   bevezette a multi-role kezelést, DE a meglévő felhasználóknak nem
--   AUTOMATIKUSAN hozta létre a megfelelő `profile_roles` sorokat.
--
--   Következmény: ha Endrének `profiles.role = 'lelkesz'` (saját gyülekezet)
--   + `profiles.role`-ja esperesi is valamelyik egyházmegyénél, de a
--   `profile_roles` táblában csak 0 vagy 1 sor van → a ProfileSwitcher
--   nem jelenik meg → nem tud profilt váltani.
--
-- EZ AZ SQL:
--   1. Diagnosztika: megmutatja Endre (és minden user) profil+szerep állapotát
--   2. Opcionális javítás: a kommentelt blokk beszúrja a hiányzó szerepköröket
--
-- HASZNÁLAT:
--   - Futtasd le az SQL-t a Supabase SQL Editorban
--   - Az 1-3. lekérdezés CSAK OLVAS — információt ad Endre állapotáról
--   - A 4. lekérdezés kommentben van, csak akkor futtasd, ha tényleg beszúrjuk
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Endre profil állapota (csak olvasás)
-- ─────────────────────────────────────────────────────────────────────────
-- Módosítsd az email-t az alábbi lekérdezésben, ha más user-t vizsgálsz.

SELECT
  p.id AS user_id,
  p.email,
  p.full_name,
  p.role AS profiles_role,
  p.status AS profiles_status,
  p.congregation_id,
  p.diocese_id,
  p.district_id,
  (SELECT name FROM public.congregations WHERE id = p.congregation_id) AS congregation_name,
  (SELECT name FROM public.dioceses WHERE id = p.diocese_id) AS diocese_name,
  (SELECT name FROM public.districts WHERE id = p.district_id) AS district_name
FROM public.profiles p
WHERE p.email = 'endreszocs@gmail.com';


-- ─────────────────────────────────────────────────────────────────────────
-- 2) Endre meglévő profile_roles sorai
-- ─────────────────────────────────────────────────────────────────────────
-- Ha 0 vagy 1 sor jön vissza → a profilváltó nem jelenik meg.
-- Ha 2+ sor jön vissza → a profilváltónak működnie kellene.

SELECT
  pr.id,
  pr.profile_id,
  pr.scope,
  pr.scope_id,
  pr.role,
  pr.custom_label,
  pr.active,
  pr.approval_status,
  pr.granted_at,
  CASE pr.scope
    WHEN 'congregation' THEN (SELECT name FROM public.congregations WHERE id = pr.scope_id)
    WHEN 'diocese' THEN (SELECT name FROM public.dioceses WHERE id = pr.scope_id)
    WHEN 'district' THEN (SELECT name FROM public.districts WHERE id = pr.scope_id)
    ELSE 'Teljes rendszer'
  END AS scope_name
FROM public.profile_roles pr
JOIN public.profiles p ON p.id = pr.profile_id
WHERE p.email = 'endreszocs@gmail.com'
ORDER BY pr.granted_at DESC;


-- ─────────────────────────────────────────────────────────────────────────
-- 3) Aktív szerep count — összegző (ezt olvassa a ProfileSwitcher)
-- ─────────────────────────────────────────────────────────────────────────
-- Ha < 2 → nem jelenik meg a profilváltó
-- Ha >= 2 → megjelenik

SELECT
  p.email,
  p.role AS profiles_role,
  COUNT(pr.id) FILTER (WHERE pr.active AND pr.approval_status = 'approved') AS approved_active_role_count,
  CASE
    WHEN COUNT(pr.id) FILTER (WHERE pr.active AND pr.approval_status = 'approved') >= 2
      THEN 'LÁTSZIK a profilváltó'
    ELSE 'NEM látszik a profilváltó (kevés aktív profile_roles sor)'
  END AS profile_switcher_status
FROM public.profiles p
LEFT JOIN public.profile_roles pr ON pr.profile_id = p.id
WHERE p.email = 'endreszocs@gmail.com'
GROUP BY p.id, p.email, p.role;


-- ─────────────────────────────────────────────────────────────────────────
-- 4) OPCIONÁLIS JAVÍTÁS — hiányzó profile_roles sorok beszúrása
-- ─────────────────────────────────────────────────────────────────────────
-- HA a 3. lekérdezés azt mutatja, hogy < 2 sor van, akkor az alábbi blokk
-- kommentelését oldd fel és futtasd. Ez beszúr egy congregation-scope
-- lelkészi szerepkört + egy diocese-scope esperesi szerepkört (ha van
-- diocese_id a profiles táblán).
--
-- UTÁNA: a 3. lekérdezést futtasd újra — most már >= 2 sort kell adnia,
-- és a profilváltó meg kell jelenjen a header avatar popoveren.
--
-- FIGYELEM: ez CSAK Endre email-jére szűrt. Más felhasználóknál más sor
-- kellhet.

/*
-- A) Lelkészi szerepkör a saját gyülekezeténél (ha még nincs)
INSERT INTO public.profile_roles (
  profile_id, scope, scope_id, role, active, approval_status, granted_by, approved_by
)
SELECT
  p.id,
  'congregation',
  p.congregation_id,
  'lelkesz',
  true,
  'approved',
  p.id,  -- saját magát engedélyezte (meglévő rendszergazdai állapot)
  p.id
FROM public.profiles p
WHERE p.email = 'endreszocs@gmail.com'
  AND p.congregation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_roles pr
    WHERE pr.profile_id = p.id
      AND pr.scope = 'congregation'
      AND pr.scope_id = p.congregation_id
      AND pr.role = 'lelkesz'
  );


-- B) Esperesi szerepkör az egyházmegyénél (ha még nincs)
INSERT INTO public.profile_roles (
  profile_id, scope, scope_id, role, active, approval_status, granted_by, approved_by
)
SELECT
  p.id,
  'diocese',
  p.diocese_id,
  'esperes',
  true,
  'approved',
  p.id,
  p.id
FROM public.profiles p
WHERE p.email = 'endreszocs@gmail.com'
  AND p.diocese_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_roles pr
    WHERE pr.profile_id = p.id
      AND pr.scope = 'diocese'
      AND pr.scope_id = p.diocese_id
      AND pr.role = 'esperes'
  );


-- C) Opcionálisan: kerületi admin szerepkör az egyházkerületnél (csak ha profiles.role = 'egyhazkeruleti_admin')
INSERT INTO public.profile_roles (
  profile_id, scope, scope_id, role, active, approval_status, granted_by, approved_by
)
SELECT
  p.id,
  'district',
  p.district_id,
  'egyhazkeruleti_admin',
  true,
  'approved',
  p.id,
  p.id
FROM public.profiles p
WHERE p.email = 'endreszocs@gmail.com'
  AND p.role = 'egyhazkeruleti_admin'
  AND p.district_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_roles pr
    WHERE pr.profile_id = p.id
      AND pr.scope = 'district'
      AND pr.scope_id = p.district_id
      AND pr.role = 'egyhazkeruleti_admin'
  );


-- D) System admin szerepkör (ha profiles.role = 'admin')
INSERT INTO public.profile_roles (
  profile_id, scope, scope_id, role, active, approval_status, granted_by, approved_by
)
SELECT
  p.id,
  'system',
  NULL,  -- system scope-nál scope_id = NULL
  'admin',
  true,
  'approved',
  p.id,
  p.id
FROM public.profiles p
WHERE p.email = 'endreszocs@gmail.com'
  AND p.role = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_roles pr
    WHERE pr.profile_id = p.id
      AND pr.scope = 'system'
      AND pr.role = 'admin'
  );

-- Futtasd le a 3. lekérdezést újra, hogy lásd, most már elég sor van-e.
SELECT
  p.email,
  COUNT(pr.id) FILTER (WHERE pr.active AND pr.approval_status = 'approved') AS approved_active_role_count,
  CASE
    WHEN COUNT(pr.id) FILTER (WHERE pr.active AND pr.approval_status = 'approved') >= 2
      THEN 'LÁTSZIK a profilváltó'
    ELSE 'NEM látszik a profilváltó'
  END AS profile_switcher_status
FROM public.profiles p
LEFT JOIN public.profile_roles pr ON pr.profile_id = p.id
WHERE p.email = 'endreszocs@gmail.com'
GROUP BY p.id, p.email;
*/


-- ─────────────────────────────────────────────────────────────────────────
-- 5) Globális statisztika: hány felhasználónak van / nincs profile_roles sora?
-- ─────────────────────────────────────────────────────────────────────────
-- Ha a rendszer-szintű migráció elmaradt, ez a lekérdezés megmutatja, hány
-- felhasználó nem fog tudni profilt váltani.

SELECT
  COUNT(*) AS total_users,
  COUNT(*) FILTER (WHERE role_count = 0) AS no_profile_roles,
  COUNT(*) FILTER (WHERE role_count = 1) AS single_profile_role,
  COUNT(*) FILTER (WHERE role_count >= 2) AS multi_profile_roles
FROM (
  SELECT
    p.id,
    COUNT(pr.id) FILTER (WHERE pr.active AND pr.approval_status = 'approved') AS role_count
  FROM public.profiles p
  LEFT JOIN public.profile_roles pr ON pr.profile_id = p.id
  WHERE p.status = 'active'
  GROUP BY p.id
) stats;
