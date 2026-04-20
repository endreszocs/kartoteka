-- ============================================================================
-- KARTOTEKA WC-7.4 FÁZIS 1 — RLS helper függvények bővítése
-- ============================================================================
--
-- Dátum: 2026-04-16
-- Tervdokumentum: docs/project-tracking/KARTOTEKA-penzugy-rls-takaritas-terv-2026-04-16.md
-- Előfeltétel: 2026-04-16-wc7-uj-szerepkorok.sql (LEFUTOTT ✅)
--
-- ÁLLAPOT: VÁZLAT — FELHASZNÁLÓI ELLENŐRZÉSRE
--
-- VÁLTOZTATÁSOK:
--
--   1. current_user_has_global_access() — VÁLTOZATLAN
--      (dokumentálás kedvéért itt szerepel, de nem módosítjuk; a jelenlegi
--       lista — 'admin', 'esperes', 'egyhazmegyei_admin' — túl tág, de
--       ennek szűkítése KÜLÖN KÖRRE marad, mert kockázatos lenne most.)
--
--   2. current_user_congregation_id() — VÁLTOZATLAN
--      (nem módosítjuk)
--
--   3. current_user_can_access_congregation(target_cong) — BŐVÍTÉS
--      Új ágak az 'egyhazkeruleti_admin', 'egyhazmegyei_szamvevo' és
--      a konyvelo/számvevő many-to-many hozzárendelésekhez.
--
--   4. ÚJ FÜGGVÉNY: current_user_can_edit_tva_flags()
--      Csak 'admin' és 'konyvelo' kaphat IGAZ választ.
--
-- FILOZÓFIA:
--   - Minimalista változtatás: csak amit muszáj.
--   - Backward compatible: a meglévő policy-k, amik ezeket a függvényeket
--     használják, TOVÁBBRA IS helyesen fognak működni.
--   - Az új szerepkörök automatikusan integrálódnak minden táblán, ami a
--     current_user_can_access_congregation()-t használja.
--


-- ============================================================================
-- 3. current_user_can_access_congregation(target_cong) — BŐVÍTÉS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_can_access_congregation(target_cong uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$

  SELECT

    -- 3.1. Globális hozzáférésűek (admin, esperes, egyhazmegyei_admin)
    --      MEGJEGYZÉS: az esperes és egyhazmegyei_admin jelenleg globálisnak minősül;
    --      ennek szűkítése külön körre halasztva.
    public.current_user_has_global_access()

    -- 3.2. Saját gyülekezet (lelkesz, de bármilyen user, akinek congregation_id van)
    OR (
      target_cong IS NOT NULL
      AND target_cong = public.current_user_congregation_id()
    )

    -- 3.3. Egyházkerületi admin — a saját kerülete alatti gyülekezetek
    --      (dioceses.district_id = profiles.district_id)
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.congregations c ON c.id = target_cong
        JOIN public.dioceses d ON d.id = c.diocese_id
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role = 'egyhazkeruleti_admin'
          AND d.district_id = p.district_id
      )
    )

    -- 3.4. Egyházmegyei számvevő — a saját megyéje alatti gyülekezetek
    --      (congregations.diocese_id = profiles.diocese_id)
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.congregations c ON c.id = target_cong
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role = 'egyhazmegyei_szamvevo'
          AND c.diocese_id = p.diocese_id
      )
    )

    -- 3.5. Könyvelő vagy számvevő — many-to-many hozzárendelés a profile_congregations-on
    --      (itt is ellenőrizzük az aktív státuszt és az active=true flag-et)
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profile_congregations pc
        JOIN public.profiles p ON p.id = pc.profile_id
        WHERE pc.profile_id = auth.uid()
          AND pc.congregation_id = target_cong
          AND pc.active = true
          AND p.status = 'active'
      )
    );

$function$;


COMMENT ON FUNCTION public.current_user_can_access_congregation(uuid) IS
  $$Engedélyez-e hozzáférést a megadott congregation-hoz a jelenlegi user. Támogatott szerepkörök: admin/esperes/egyhazmegyei_admin (globális), lelkesz (saját congregation_id), egyhazkeruleti_admin (saját kerület alatti gyülekezetek), egyhazmegyei_szamvevo (saját megye), konyvelo/egyhazmegyei_szamvevo (many-to-many profile_congregations-on át).$$;


-- ============================================================================
-- 4. ÚJ FÜGGVÉNY: current_user_can_edit_tva_flags()
-- ============================================================================
--
-- Célja: a szamadasicel tábla tva_plafonba_szamit és tva_mentesseg_hivatkozas
-- oszlopok szerkesztési jogosultsága. Csak admin és konyvelo.
--
-- FIGYELEM: a PostgreSQL RLS nem támogat oszlop-szintű szabályt natívan, ezért
-- a function maga a teljes sorra adja vissza a választ. Az alkalmazás (Server Action)
-- feladata, hogy csak a TVA mezőket engedje módosítani. Ez a függvény csak
-- az RLS oldali gate.

CREATE OR REPLACE FUNCTION public.current_user_can_edit_tva_flags()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role IN ('admin', 'konyvelo')
  );

$function$;


COMMENT ON FUNCTION public.current_user_can_edit_tva_flags() IS
  $$IGAZ, ha a jelenlegi user szerkesztheti a szamadasicel TVA flag mezőit (tva_plafonba_szamit, tva_mentesseg_hivatkozas). Csak admin és konyvelo szerepkör.$$;


-- ============================================================================
-- ELLENŐRZŐ LEKÉRDEZÉSEK (futtatás után)
-- ============================================================================
--
-- 1. A bővített függvény definíciója:
--
--     SELECT pg_get_functiondef('public.current_user_can_access_congregation(uuid)'::regprocedure);
--
-- 2. Az új függvény létezik-e:
--
--     SELECT proname, pg_get_function_result(oid)
--     FROM pg_proc
--     WHERE proname = 'current_user_can_edit_tva_flags';
--
-- 3. Working teszt — mocked auth.uid() nélkül csak annyit tudunk ellenőrizni,
--    hogy a függvények syntax-szinten érvényesek:
--
--     -- Azonnali call (logged-in user kontextusban):
--     SELECT public.current_user_can_access_congregation(NULL);  -- false
--     SELECT public.current_user_can_edit_tva_flags();  -- false/true a user szerint
--
-- ============================================================================
-- VISSZAFORDÍTÁS (ha kell)
-- ============================================================================
--
-- Vissza a régi current_user_can_access_congregation-hez:
--
-- CREATE OR REPLACE FUNCTION public.current_user_can_access_congregation(target_cong uuid)
-- RETURNS boolean
-- LANGUAGE sql
-- STABLE SECURITY DEFINER
-- SET search_path TO 'public'
-- AS $function$
--   SELECT
--     public.current_user_has_global_access()
--     OR (target_cong IS NOT NULL AND target_cong = public.current_user_congregation_id());
-- $function$;
--
-- DROP FUNCTION IF EXISTS public.current_user_can_edit_tva_flags();
