-- ═══════════════════════════════════════════════════════════════════════════
--  AUDIT: IP + USER-AGENT TÖLTÉSE (2026-08-15, 8. pont D szelet)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  MIT CSINÁL: a public.log_audit_event() RPC-t kibővíti két opcionális
--  paraméterrel (p_ip, p_user_agent), és az audit_log eddig ÜRESEN maradt
--  ip/user_agent oszlopait tölti. Egy gyanús belépésnél innentől látszik,
--  honnan és milyen eszközről jött.
--
--  MIÉRT DROP + CREATE: a Postgres a más aláírású CREATE OR REPLACE-ből ÚJ
--  túlterhelést csinálna, és a kettő között a PostgREST nem tudna választani
--  (minden hívás "ambiguous function" hibára futna). Ezért a régi, 5
--  paraméteres változatot eldobjuk, és a 7 paraméteressel pótoljuk — a régi
--  hívási forma (5 nevesített paraméter) az alapértékek miatt TOVÁBBRA IS
--  működik, tehát a webes réteg egyetlen percre sem marad napló nélkül.
--
--  BIZTONSÁGOS SORREND: a web már ki van készítve — a 7 paraméteres hívást
--  próbálja, és amíg ez az SQL nem fut le, automatikusan visszaesik a régi
--  formára. Tehát ez az SQL a web-deploy ELŐTT és UTÁN is futtatható.
--
--  A p_ip szövegként érkezik, és hibás értéknél (torz fejléc) NULL-t írunk,
--  nem hibázunk — az audit-írás soha nem buktathat el egy üzleti műveletet.
--
--  ⚠️ EGY TRANZAKCIÓ — újrafuttatható.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.log_audit_event(TEXT, TEXT, UUID, JSONB, UUID);

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action TEXT,
  p_target_table TEXT DEFAULT NULL,
  p_target_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_device_id UUID DEFAULT NULL,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_caller UUID := auth.uid();
  v_recent INTEGER;
  v_id UUID;
  v_ip INET;
BEGIN
  -- ⚠️ A 2026-08-11-es keményítés NÉGY őre KÖTELEZŐEN itt marad. (Az első
  -- változatból kimaradtak, és mivel ez a fájl DROP-olja az 5 paraméteres
  -- függvényt, a keményítés némán elveszett élesben — a
  -- 2026-08-15-HELYREALLITAS-audit-napszak-mfa.sql állította helyre.)
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Nincs bejelentkezett felhasználó — audit-esemény nem naplózható.';
  END IF;
  IF p_action IS NULL OR btrim(p_action) = '' THEN
    RAISE EXCEPTION 'Az audit-esemény action mezője kötelező.';
  END IF;
  IF length(p_action) > 120 THEN
    RAISE EXCEPTION 'Túl hosszú audit action (% karakter, max. 120).', length(p_action);
  END IF;
  IF p_target_table IS NOT NULL AND length(p_target_table) > 120 THEN
    RAISE EXCEPTION 'Túl hosszú audit target_table (% karakter, max. 120).', length(p_target_table);
  END IF;
  IF p_metadata IS NOT NULL AND length(p_metadata::text) > 8192 THEN
    RAISE EXCEPTION 'Túl nagy audit metadata (% bájt, max. 8192).', length(p_metadata::text);
  END IF;
  SELECT COUNT(*) INTO v_recent
  FROM public.audit_log a
  WHERE a.user_id = v_caller AND a.created_at > now() - interval '1 hour';
  IF v_recent >= 2000 THEN
    RAISE WARNING 'Audit-korlát: a(z) % felhasználó az elmúlt órában már % eseményt naplózott — az esemény (%) eldobva.',
      v_caller, v_recent, p_action;
    RETURN NULL;
  END IF;

  -- Torz IP-fejléc ne buktassa el a naplózást: hibánál NULL marad.
  BEGIN
    v_ip := NULLIF(btrim(p_ip), '')::inet;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  INSERT INTO public.audit_log
    (user_id, device_id, action, target_table, target_id, metadata, ip, user_agent)
  VALUES
    (v_caller, p_device_id, p_action, p_target_table, p_target_id, p_metadata,
     v_ip, NULLIF(btrim(p_user_agent), ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$func$;

-- A DROP FUNCTION elviszi a függvényre adott jogokat is — vissza kell adni,
-- különben az alapértelmezett PUBLIC EXECUTE áll vissza (anon is hívhatná).
REVOKE ALL ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.log_audit_event IS
  'Gyors-beszúró függvény. A user_id-t az auth.uid()-ból veszi. 2026-08-15: p_ip + p_user_agent paraméterrel bővítve (a webes réteg a kérés fejléceiből tölti). Visszaadja az új sor ID-ját.';

COMMIT;

-- ─── ELLENŐRZÉS (csak olvas) ────────────────────────────────────────────────
-- Egyetlen 7 paraméteres log_audit_event-nek kell léteznie.
SELECT
  p.proname AS fuggveny,
  pg_get_function_identity_arguments(p.oid) AS parameterek,
  CASE
    WHEN p.pronargs = 7 THEN '✅ 7 paraméteres (ip + user_agent)'
    ELSE '❌ váratlan paraméter-szám: ' || p.pronargs
  END AS allapot
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'log_audit_event';
