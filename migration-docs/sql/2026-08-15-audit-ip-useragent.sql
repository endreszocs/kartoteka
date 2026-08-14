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
  v_id UUID;
  v_ip INET;
BEGIN
  -- Torz IP-fejléc ne buktassa el a naplózást: hibánál NULL marad.
  BEGIN
    v_ip := NULLIF(trim(p_ip), '')::inet;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  INSERT INTO public.audit_log
    (user_id, device_id, action, target_table, target_id, metadata, ip, user_agent)
  VALUES
    (auth.uid(), p_device_id, p_action, p_target_table, p_target_id, p_metadata,
     v_ip, NULLIF(trim(p_user_agent), ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$func$;

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
