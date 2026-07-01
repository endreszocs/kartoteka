-- ============================================================================
-- 2026-07-01 — BUG 2: egy MÁSODIK email aktiválása + gyülekezethez rendelése
-- ============================================================================
-- HASZNÁLAT: egy adott emailt AKTÍVvá tesz és egy KONKRÉT gyülekezethez köt (skalár + szerep).
--   Előre kitöltve: endre940115@gmail.com → Barátosi (43cff37f-…). Írd át, ha más kell.
--
-- ⚠️ Ez a fiók jelenleg 'rejected' (a regisztrációnál elutasításra került) — EZÉRT nem látott
--    adatot. Ez az SCRIPT felülírja aktívra ÉS a megadott gyülekezethez köti. Csak akkor futtasd,
--    ha tényleg azt akarod, hogy ez az email HOZZÁFÉRJEN a megadott gyülekezet adataihoz.
--
-- Idempotens és biztonságos: konkrét emailt és konkrét gyülekezetet érint, semmi mást.
-- ============================================================================
DO $$
DECLARE
  v_email text := lower('endre940115@gmail.com');                       -- << az aktiválandó email
  v_cong  uuid := '43cff37f-1131-4c79-8082-0e8af61cf40a';               -- << Barátosi (írd át ha más)
  v_uid   uuid;
  v_prev  text;
BEGIN
  SELECT id, status INTO v_uid, v_prev FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
   WHERE lower(u.email) = v_email;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nincs profil ezzel az emaillel: %', v_email;
  END IF;

  UPDATE public.profiles
     SET congregation_id        = v_cong,
         status                 = 'active',
         full_name              = COALESCE(NULLIF(full_name, ''), 'Második e-mail (Endre)'),
         onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
         walkthrough_completed   = true,
         role                   = CASE WHEN role IN ('lelkesz','konyvelo') THEN role ELSE 'lelkesz' END
   WHERE id = v_uid;

  IF NOT EXISTS (SELECT 1 FROM public.profile_roles
                  WHERE profile_id = v_uid AND scope = 'congregation' AND scope_id = v_cong) THEN
    INSERT INTO public.profile_roles (profile_id, scope, scope_id, role, approval_status, active, approved_at)
    VALUES (v_uid, 'congregation', v_cong, 'lelkesz', 'approved', true, now());
  ELSE
    UPDATE public.profile_roles
       SET approval_status = 'approved', active = true, approved_at = COALESCE(approved_at, now())
     WHERE profile_id = v_uid AND scope = 'congregation' AND scope_id = v_cong;
  END IF;

  RAISE NOTICE 'Aktiválva: % (előző status: %) → gyülekezet: %', v_email, v_prev, v_cong;
END $$;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────
SELECT u.email, p.status, p.congregation_id, c.name AS gyulekezet
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
LEFT JOIN public.congregations c ON c.id = p.congregation_id
WHERE lower(u.email) = lower('endre940115@gmail.com');   -- << ugyanaz mint fent
