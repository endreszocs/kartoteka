-- =========================================================================
-- 2026-07-01 — BUG 2 JAVÍTÁS: a második email lássa az egyházközség adatait
-- =========================================================================
-- ELŐFELTÉTEL: futtasd le előbb a 2026-07-01-bug2-masodik-email-diagnostika.sql-t,
-- és győződj meg róla, hogy a HIBÁS fiók congregation_id-ja NULL/rossz, az adat pedig
-- MEGVAN az egyházközségben.
--
-- MIT CSINÁL (idempotens, biztonságos):
--   1. A HIBÁS (második) fiók `profiles.congregation_id`-ját a MŰKÖDŐ (első) fiók
--      egyházközségére állítja, és a `status`-t `active`-ra.
--   2. Gondoskodik egy JÓVÁHAGYOTT + AKTÍV, congregation-scope `profile_roles` sorról
--      ugyanarra az egyházközségre (az app-réteg profil-választójához).
--   3. Semmit nem töröl, és NEM nyúl a MŰKÖDŐ fiókhoz.
--
-- HASZNÁLAT: töltsd ki a két emailt, majd futtasd az egész blokkot egyben.
-- =========================================================================

DO $$
DECLARE
  v_mukodo_email text := lower('elso@example.com');    -- <<< a MŰKÖDŐ (első) email
  v_hibas_email  text := lower('masodik@example.com'); -- <<< a HIBÁS (második) email
  v_mukodo_id    uuid;
  v_hibas_id     uuid;
  v_cong_id      uuid;
  v_hibas_role   text;
  v_role_for_pr  text;
BEGIN
  -- Fiók-azonosítók
  SELECT id INTO v_mukodo_id FROM auth.users WHERE lower(email) = v_mukodo_email;
  SELECT id INTO v_hibas_id  FROM auth.users WHERE lower(email) = v_hibas_email;

  IF v_mukodo_id IS NULL THEN RAISE EXCEPTION 'Nem található a MŰKÖDŐ email: %', v_mukodo_email; END IF;
  IF v_hibas_id  IS NULL THEN RAISE EXCEPTION 'Nem található a HIBÁS email: %', v_hibas_email;  END IF;

  -- A MŰKÖDŐ fiók egyházközsége = ide kötjük a másodikat
  SELECT congregation_id INTO v_cong_id FROM public.profiles WHERE id = v_mukodo_id;
  IF v_cong_id IS NULL THEN
    RAISE EXCEPTION 'A MŰKÖDŐ fióknak (%) sincs congregation_id-ja — előbb azt kell rendbe tenni.', v_mukodo_email;
  END IF;

  -- A második fiók szerepe (a profile_role-hoz); csak lelkesz/konyvelo értelmes gyülekezeti scope-ban
  SELECT role INTO v_hibas_role FROM public.profiles WHERE id = v_hibas_id;
  v_role_for_pr := CASE WHEN v_hibas_role IN ('lelkesz', 'konyvelo') THEN v_hibas_role ELSE 'lelkesz' END;

  -- 1) A skalár mező + státusz — EZ az, amit az RLS néz
  UPDATE public.profiles
     SET congregation_id = v_cong_id,
         status          = 'active'
   WHERE id = v_hibas_id;

  RAISE NOTICE 'profiles frissítve: % → congregation_id=%, status=active', v_hibas_email, v_cong_id;

  -- 2) Jóváhagyott + aktív congregation-scope profile_role (ha még nincs) — az app profil-választójához
  IF NOT EXISTS (
    SELECT 1 FROM public.profile_roles
     WHERE profile_id = v_hibas_id
       AND scope = 'congregation'
       AND scope_id = v_cong_id
  ) THEN
    INSERT INTO public.profile_roles (profile_id, scope, scope_id, role, approval_status, active, approved_at)
    VALUES (v_hibas_id, 'congregation', v_cong_id, v_role_for_pr, 'approved', true, now());
    RAISE NOTICE 'profile_roles létrehozva: % (%-scope, %)', v_hibas_email, 'congregation', v_role_for_pr;
  ELSE
    -- Ha létezik, de nem jóváhagyott/aktív, hozzuk rendbe
    UPDATE public.profile_roles
       SET approval_status = 'approved', active = true,
           approved_at = COALESCE(approved_at, now())
     WHERE profile_id = v_hibas_id AND scope = 'congregation' AND scope_id = v_cong_id
       AND (approval_status <> 'approved' OR active = false);
    RAISE NOTICE 'profile_roles már létezett: % — jóváhagyott/aktív állapot biztosítva', v_hibas_email;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- ELLENŐRZÉS a javítás után — a HIBÁS fióknak most már congregation_id + active kell
-- ─────────────────────────────────────────────────────────────────────────
SELECT u.email, p.status, p.congregation_id, c.name AS egyhazkozseg
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.congregations c ON c.id = p.congregation_id
WHERE lower(u.email) = lower('masodik@example.com');  -- <<< a HIBÁS (második) email
