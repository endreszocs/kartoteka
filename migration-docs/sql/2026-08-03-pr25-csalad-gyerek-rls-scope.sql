-- ============================================================================
-- PR-25 (2026-08-03) — DIAGNOSZTIKA + RLS-SCOPE JAVÍTÁS a csalad/gyerek táblán
--
-- HIBA (user-bejelentés): „Az új családi karton létrehozása nem sikerült"
-- a szülő-összekötéskor (Beder Patrik).
--
-- GYÖKÉROK-GYANÚ: a `csalad` és `gyerek` táblák RLS-szabályai a RÉGI, szűk
-- ellenőrzést használják:
--     current_user_congregation_id()      (= profiles.congregation_id SKALÁR)
-- miközben az egész alkalmazás a BŐVÍTETT szabály szerint dolgozik:
--     current_user_can_access_congregation(cong)
--         = globális hozzáférés VAGY saját gyülekezet VAGY
--           EGYHÁZKERÜLETI ADMIN a saját kerülete alatt
-- (Megjegyzés: a profile_roles-alapú profilváltást EGYIK szabály sem ismeri —
--  ha a diagnosztika azt mutatja, hogy a hozzáférés onnan jön, külön kör kell.)
-- Ezért aki egyházkerületi adminként (vagy több profillal, profilváltóval)
-- dolgozik, az OLVASNI tud, de a `csalad`/`gyerek` táblába ÍRNI nem — a
-- családi karton mentése mégis működik, mert az RPC-n (SECURITY DEFINER) megy.
--
-- MIT CSINÁL EZ A FÁJL:
--   1. DIAGNOSZTIKA (csak olvas): kiírja, mit lát a rendszer a bejelentkezett
--      felhasználóról és a konkrét esetről — ez alapján BIZONYOSAN eldönthető,
--      hogy tényleg az RLS volt-e az ok.
--   2. JAVÍTÁS: a két helper függvény a bővített szabályra áll át. A
--      policy-kat NEM kell újraírni — azok ezt a két függvényt hívják.
--
-- ⚠️ CSAK AKKOR FUTTASD, ha a 2026-08-03-pr25-csalad-letrehozas-diagnosztika.sql
--    igazolta, hogy a jogosultsági szabály (RLS) az ok! Ellenkező esetben ez a
--    fájl semmit nem old meg (a hiba oka az adatban van).
--
-- Futtatás: Supabase SQL Editor, az EGÉSZ fájl egyben. Idempotens.
-- MEGJEGYZÉS: a Supabase SQL Editor a service_role nevében fut, ezért az
-- 1/a diagnosztika a TE munkameneted helyett a szolgáltatás-fiókot mutatja —
-- a lényegi adat (profil, szerep, gyülekezet) ettől függetlenül olvasható.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 2. JAVÍTÁS — a két helper a BŐVÍTETT hozzáférés-szabályra áll át.
--    (A policy-k változatlanok: ezeket a függvényeket hívják.)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.csalad_resolves_to_accessible_cong(p_id_ferfi integer, p_id_no integer)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  -- 2026-08-03 (PR-25): a szűk `= current_user_congregation_id()` helyett a
  -- bővített szabály (globális hozzáférés / saját gyülekezet / egyházkerületi
  -- admin a saját kerülete alatt) — ugyanaz, amit az alkalmazás és a
  -- tagnyilvantartas_csalad_mentes RPC is használ.
  SELECT
    -- A globális hozzáférés (admin/esperes) rövidzárja: enélkül a felnőtt
    -- nélküli vagy gyülekezet nélküli árva kartonok senkinek sem látszanának.
    public.current_user_has_global_access()
    OR EXISTS (
    SELECT 1 FROM public.szemely s
    WHERE (
      (p_id_ferfi IS NOT NULL AND s.id = p_id_ferfi)
      OR (p_id_no IS NOT NULL AND s.id = p_id_no)
    )
    AND s.congregation_id IS NOT NULL
    AND public.current_user_can_access_congregation(s.congregation_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.gyerek_resolves_to_accessible_cong(p_id_csalad integer, p_id_szemely integer)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    public.current_user_has_global_access()
    OR EXISTS (
      SELECT 1 FROM public.szemely s
      WHERE s.id = p_id_szemely
        AND s.congregation_id IS NOT NULL
        AND public.current_user_can_access_congregation(s.congregation_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.csalad c
      JOIN public.szemely s2 ON (s2.id = c.id_ferfi OR s2.id = c.id_no)
      WHERE c.id = p_id_csalad
        AND s2.congregation_id IS NOT NULL
        AND public.current_user_can_access_congregation(s2.congregation_id)
    );
$$;

GRANT EXECUTE ON FUNCTION public.csalad_resolves_to_accessible_cong(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gyerek_resolves_to_accessible_cong(integer, integer) TO authenticated;

COMMENT ON FUNCTION public.csalad_resolves_to_accessible_cong(integer, integer) IS
  'RLS-segéd a csalad táblához. 2026-08-03 (PR-25): a bővített current_user_can_access_congregation() szerint dönt (globális / saját gyülekezet / egyházkerületi admin) — a korábbi, szűk profiles.congregation_id-skalár helyett.';
COMMENT ON FUNCTION public.gyerek_resolves_to_accessible_cong(integer, integer) IS
  'RLS-segéd a gyerek táblához. 2026-08-03 (PR-25): a bővített current_user_can_access_congregation() szerint dönt.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ELLENŐRZÉS — a javítás után mindkettőnek `true`-t kell adnia
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  position('current_user_can_access_congregation' IN
    pg_get_functiondef('public.csalad_resolves_to_accessible_cong(integer,integer)'::regprocedure)) > 0
    AS csalad_helper_frissitve,
  position('current_user_can_access_congregation' IN
    pg_get_functiondef('public.gyerek_resolves_to_accessible_cong(integer,integer)'::regprocedure)) > 0
    AS gyerek_helper_frissitve;
