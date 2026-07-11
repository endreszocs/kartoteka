-- ==========================================================================
-- 2026-07-11 — F1: Iktató RPC-k (év-újranyitás, pointer-szinkron, master-iktatás)
-- ==========================================================================
-- KONTEXTUS (munkanapló+iktató redesign, F1 fázis):
--
--   1. `is_master_admin()` HELPER — a master/system admin egységes SQL-oldali
--      azonosítása. FONTOS: 'master' NEM létezik role-ként a sémában (lásd a
--      2026-04-24-admin-wipe-congregation-data.sql kommentjét) — a Kartotéka
--      app-oldalon e-mail alapján (MASTER_ADMIN_EMAIL) azonosítja. SQL-ből a
--      bevett minták uniója:
--        a) profiles.role = 'admin'  (a master usernek is ez a profil-role-ja)
--        b) profile_roles: role='admin' + scope='system' + active + approved
--           (az import-wizard RPC-k mintája, 2026-04-25 óta)
--        c) auth.users.email = 'endreszocs@gmail.com' (hardkódolt fallback,
--           az is_caller_admin_for_user_mgmt() precedense, 2026-05-04)
--
--   2. `reopen_iktato_year(cong, év)` — évvégi iktató-lezárás FELOLDÁSA.
--      Az iktato_yearly_closures táblának szándékosan NINCS DELETE policy-ja
--      (2026-05-29-es migráció) — a feloldás kizárólag ezen a SECURITY
--      DEFINER RPC-n keresztül lehetséges, saját gyülekezetre VAGY master
--      adminként. Boolean-t ad vissza: történt-e törlés.
--
--   3. `sync_iktato_sequence_pointer(cong, év)` — a sorszám-pointer
--      hozzáigazítása a tényleges MAX(sequence_number)-hez. GREATEST-tel
--      SOHA nem csökkent (a pointer előre szaladhat törölt iktatás miatt —
--      az szándékos, sorszám nem újrahasznosítható). Diagnosztikai/javító
--      célú: pl. import után, vagy ha a pointer lemaradt.
--
--   4. `next_iktato_sequence(cong, év)` FRISSÍTÉS — a jogosultság-ellenőrzés
--      bővül: a saját gyülekezet MELLETT a master admin (god-mode) is
--      iktathat idegen gyülekezetre. A törzslogika (atomic INSERT ... ON
--      CONFLICT DO UPDATE, row-lock sorosítás) VÁLTOZATLAN a 2026-05-17-es
--      definícióhoz képest.
--
-- MIKOR KELL FUTTATNI: az F1 PR merge ELŐTT, a Supabase SQL Editorban
--   (az app az új RPC-kre támaszkodik — előbb a DB, aztán a deploy).
--
-- IDEMPOTENS: minden függvény CREATE OR REPLACE — biztonságos ismételt
--   futtatás. Táblát/oszlopot nem módosít.
-- ==========================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 0. Helper: master/system admin azonosítása SQL-ből
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    -- a) profiles.role = 'admin' (a master user profil-role-ja is ez)
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
    -- b) system-scope admin szerepkör a profile_roles-ban
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.role = 'admin'
        AND pr.scope = 'system'
        AND pr.active = true
        AND pr.approval_status = 'approved'
    )
    -- c) master admin e-mail fallback (is_caller_admin_for_user_mgmt minta)
    OR EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND lower(u.email) = 'endreszocs@gmail.com'
    );
$$;

COMMENT ON FUNCTION public.is_master_admin() IS
  '2026-07-11 F1: a hívó master/system admin-e. profiles.role=admin VAGY profile_roles(admin+system+active+approved) VAGY a master e-mail. SECURITY DEFINER RPC-k jog-ellenőrzéséhez.';

GRANT EXECUTE ON FUNCTION public.is_master_admin() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. RPC: évvégi lezárás feloldása (újranyitás)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reopen_iktato_year(
  p_congregation_id uuid,
  p_year integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Auth check a next_iktato_sequence mintájára: saját gyülekezet VAGY
  -- master admin.
  IF NOT public.is_master_admin() AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.congregation_id = p_congregation_id
  ) THEN
    RAISE EXCEPTION 'Nincs jogosultság ehhez a gyülekezethez (% / %)',
      auth.uid(), p_congregation_id
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  -- A SECURITY DEFINER (tábla-tulajdonos) átmegy az RLS-en — ez szándékos:
  -- az iktato_yearly_closures-nek nincs DELETE policy-ja, a feloldás
  -- kizárólag ezen az RPC-n keresztül történhet.
  DELETE FROM public.iktato_yearly_closures
  WHERE congregation_id = p_congregation_id
    AND year = p_year;

  RETURN FOUND; -- true = volt lezárás és töröltük; false = nem volt lezárva
END;
$$;

COMMENT ON FUNCTION public.reopen_iktato_year(uuid, integer) IS
  '2026-07-11 F1: évvégi iktató-lezárás feloldása (iktato_yearly_closures sor törlése). Saját gyülekezet vagy master admin. true = törölt, false = nem volt lezárva.';

GRANT EXECUTE ON FUNCTION public.reopen_iktato_year(uuid, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RPC: sorszám-pointer szinkronizálása a tényleges MAX-hoz
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_iktato_sequence_pointer(
  p_congregation_id uuid,
  p_year integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max integer;
  v_result integer;
BEGIN
  -- Ugyanaz a jogosultság-minta, mint a reopen_iktato_year-nél.
  IF NOT public.is_master_admin() AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.congregation_id = p_congregation_id
  ) THEN
    RAISE EXCEPTION 'Nincs jogosultság ehhez a gyülekezethez (% / %)',
      auth.uid(), p_congregation_id
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  -- A tényleges legnagyobb kiadott sorszám (csak aktív, nem törölt sorok).
  SELECT COALESCE(MAX(i.sequence_number), 0)
    INTO v_max
    FROM public.iktato i
   WHERE i.congregation_id = p_congregation_id
     AND i.year = p_year
     AND i.deleted = false;

  -- GREATEST: a pointer SOHA nem csökken — ha előrébb jár (pl. törölt
  -- iktatás miatt), úgy marad, mert a sorszám nem újrahasznosítható.
  INSERT INTO public.iktato_sequence_pointers (congregation_id, year, last_sequence)
  VALUES (p_congregation_id, p_year, v_max)
  ON CONFLICT (congregation_id, year) DO UPDATE
    SET last_sequence = GREATEST(
          public.iktato_sequence_pointers.last_sequence,
          EXCLUDED.last_sequence
        ),
        updated_at = now()
  RETURNING last_sequence INTO v_result;

  RETURN v_result; -- a szinkron utáni pointer-állás
END;
$$;

COMMENT ON FUNCTION public.sync_iktato_sequence_pointer(uuid, integer) IS
  '2026-07-11 F1: az iktató sorszám-pointer igazítása a tényleges MAX(sequence_number)-hez. GREATEST-tel — sosem csökkent. Visszaadja a pointer új állását.';

GRANT EXECUTE ON FUNCTION public.sync_iktato_sequence_pointer(uuid, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. next_iktato_sequence FRISSÍTÉS: master admin is iktathat idegen
--    gyülekezetre. A törzslogika (atomic INSERT ... ON CONFLICT DO UPDATE,
--    row-lock) VÁLTOZATLAN a 2026-05-17-es definícióhoz képest.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.next_iktato_sequence(
  p_congregation_id uuid,
  p_year integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next integer;
BEGIN
  -- Auth check: a hívó user tagja kell legyen a megcélzott gyülekezetnek,
  -- VAGY master/system admin (god-mode — idegen gyülekezetre is iktathat).
  IF NOT public.is_master_admin() AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.congregation_id = p_congregation_id
  ) THEN
    RAISE EXCEPTION 'Nincs jogosultság ehhez a gyülekezethez (% / %)',
      auth.uid(), p_congregation_id
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  -- Atomic INSERT ... ON CONFLICT DO UPDATE — row-szintű lock-kal sorosít.
  INSERT INTO public.iktato_sequence_pointers (congregation_id, year, last_sequence)
  VALUES (p_congregation_id, p_year, 1)
  ON CONFLICT (congregation_id, year) DO UPDATE
    SET last_sequence = public.iktato_sequence_pointers.last_sequence + 1,
        updated_at = now()
  RETURNING last_sequence INTO v_next;

  RETURN v_next;
END;
$$;

COMMENT ON FUNCTION public.next_iktato_sequence(uuid, integer) IS
  '2026-05-17 P3-5 + 2026-07-11 F1: atomic per-(cong, year) iktato sorszám, row-lock sorosítással. F1 óta a master admin idegen gyülekezetre is hívhatja.';

GRANT EXECUTE ON FUNCTION public.next_iktato_sequence(uuid, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFIKÁCIÓ
-- ─────────────────────────────────────────────────────────────────────────

-- Mind a 4 függvény létezik, SECURITY DEFINER, és rögzített search_path-szal:
SELECT
  p.proname AS verify_target,
  CASE WHEN p.prosecdef THEN '✅ SECURITY DEFINER' ELSE '❌ NEM definer' END AS secdef,
  COALESCE(array_to_string(p.proconfig, '; '), '❌ NINCS search_path pin') AS config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'is_master_admin',
    'reopen_iktato_year',
    'sync_iktato_sequence_pointer',
    'next_iktato_sequence'
  )
ORDER BY p.proname;

COMMIT;
