-- =========================================================================
-- 2026-07-01 — (OPCIONÁLIS, ÁTNÉZENDŐ) RLS co-membership: több email egy egyházközséghez
-- =========================================================================
-- ⚠️ EZ EGY RENDSZERSZINTŰ RLS-VÁLTOZÁS — előbb a diagnosztikát + a célzott javítást
--    futtasd (azok megoldják a konkrét második fiókot). Ezt CSAK akkor vezesd be, ha
--    általánosságban szeretnéd, hogy TÖBB email is hozzáférjen ugyanahhoz az
--    egyházközséghez pusztán egy jóváhagyott `profile_roles` alapján — a
--    `profiles.congregation_id` skalár kézi beállítása nélkül. Éles bevezetés előtt
--    teszteld egy staging/branch adatbázison.
--
-- MIÉRT: jelenleg a `current_user_can_access_congregation()` KIZÁRÓLAG a hívó SAJÁT
--   `profiles.congregation_id` skalárját nézi. A skalár egyetlen egyházközséget tud
--   tárolni, és könnyű egy második fiókon üresen hagyni. Az app-réteg viszont a
--   `profile_roles` congregation-scope-ját is használja — ez a változás összhangba
--   hozza az RLS-t az app-réteggel: aki JÓVÁHAGYOTT + AKTÍV congregation-szerepet kapott
--   egy egyházközséghez, az olvashatja/írhatja annak adatait.
--
-- HATÁS: a `current_user_can_access_congregation(uuid)` függvényt bővíti — MINDEN
--   egyházközségi tábla (szemely, befizetes, kiadas, …) ezen keresztül dönt, tehát
--   egyetlen függvénymódosítás az összes policy-t érinti.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.current_user_can_access_congregation(target_cong uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    public.current_user_has_global_access()
    OR (
      target_cong IS NOT NULL
      AND target_cong = public.current_user_congregation_id()
    )
    -- ÚJ: co-membership — jóváhagyott + aktív congregation-scope profile_role ugyanarra
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.profile_roles r ON r.profile_id = p.id
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND r.scope = 'congregation'
          AND r.scope_id = target_cong
          AND r.approval_status = 'approved'
          AND r.active = true
      )
    );
$$;

COMMENT ON FUNCTION public.current_user_can_access_congregation(uuid) IS
  $$Igaz, ha a hívó globális hozzáférésű, VAGY a saját profiles.congregation_id-ja a
    target_cong, VAGY (2026-07-01) van jóváhagyott+aktív congregation-scope profile_role-ja
    a target_cong-ra (co-membership). Minden egyházközségi tábla RLS-e ezen keresztül dönt.$$;

-- ─────────────────────────────────────────────────────────────────────────
-- ELLENŐRZÉS: a függvény frissült?
-- ─────────────────────────────────────────────────────────────────────────
SELECT pg_get_functiondef('public.current_user_can_access_congregation(uuid)'::regprocedure);
