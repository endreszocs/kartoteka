-- ════════════════════════════════════════════════════════════════════════════
--  A-M7.2d1 — reserve_chitanta_numbers() PL/pgSQL RPC (offline szám-wallet)
--  Dátum: 2026-04-24
--  Futtatás: Endre → Supabase SQL Editor
--
--  MIÉRT:
--    Az A-M7.2b-ben a `next_chitanta_number()` RPC concurrency-safe, de csak
--    online működik. Az offline-chitanța kiállításhoz (A-M7.2d2) a kliensnek
--    előre-foglalt sorszámokra van szüksége — a `reserve_chitanta_numbers()`
--    atomikusan N sorszámot oszt ki a szerveren, amiket a kliens-oldali wallet
--    tárol, és offline-módban használ fel.
--
--  MŰKÖDÉS:
--    - Input: p_congregation_id, p_sorozat, p_count (1–100)
--    - Kikeres / létrehoz egy `oblio_fiokok` sort az adott congregation-hoz
--    - Atomikusan `chitanta_kovetkezo_szam += p_count`
--    - Return: int[] — a kiosztott sorszámok (start .. start + count - 1)
--
--  KONZISZTENCIA A KIÁLLÍTÁSSAL:
--    Ugyanazt a `oblio_fiokok.chitanta_kovetkezo_szam` számlálót használja,
--    mint a `next_chitanta_number()` — így a párhuzamos online-issue és a
--    kliens-wallet-foglalás nem ütközik (a szerver egy pointer-t tart, az
--    ütközést a row-lock biztosítja).
--
--  BIZTONSÁG:
--    - SECURITY DEFINER — a user csak a saját congregation-jére tud foglalni
--      (az RPC első sorban ellenőrzi az `current_user_can_access_congregation`-t)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- A meglévő `sync_tracking_touch()` helper fn mintájára — itt egy új, chitanța-
-- specifikus RPC.
CREATE OR REPLACE FUNCTION public.reserve_chitanta_numbers(
  p_congregation_id uuid,
  p_sorozat text,
  p_count integer
) RETURNS integer[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start      integer;
  v_fiok_id    uuid;
  v_sorozat    text := COALESCE(NULLIF(TRIM(p_sorozat), ''), 'CHIT');
  v_result     integer[];
BEGIN
  -- 1) Scope ellenőrzés — csak a user saját/megengedett gyülekezetére
  IF NOT public.current_user_can_access_congregation(p_congregation_id) THEN
    RAISE EXCEPTION 'Nincs jogosultság a congregation_id=%s-hoz', p_congregation_id;
  END IF;

  -- 2) Input-validáció
  IF p_count IS NULL OR p_count <= 0 THEN
    RAISE EXCEPTION 'p_count kötelező, pozitív (kapott: %)', p_count;
  END IF;
  IF p_count > 100 THEN
    RAISE EXCEPTION 'Legfeljebb 100 sorszám foglalható egyszerre (kapott: %)', p_count;
  END IF;

  -- 3) Atomikus kiosztás — row-lock az oblio_fiokok sorra
  SELECT id, COALESCE(chitanta_kovetkezo_szam, 1)
    INTO v_fiok_id, v_start
    FROM public.oblio_fiokok
    WHERE congregation_id = p_congregation_id
    FOR UPDATE;

  IF v_fiok_id IS NULL THEN
    -- Még nincs oblio_fiokok rekord — létrehozunk egy minimálisat, indulás 1-ről
    INSERT INTO public.oblio_fiokok (
      congregation_id,
      chitanta_sorozat_default,
      chitanta_kovetkezo_szam
    )
    VALUES (p_congregation_id, v_sorozat, 1 + p_count)
    RETURNING id INTO v_fiok_id;
    v_start := 1;
  ELSE
    -- Pointer-inkrementálás
    UPDATE public.oblio_fiokok
       SET chitanta_kovetkezo_szam = v_start + p_count
     WHERE id = v_fiok_id;
  END IF;

  -- 4) Sorszámok generálása: v_start, v_start+1, …, v_start+p_count-1
  SELECT array_agg(n ORDER BY n)
    INTO v_result
    FROM generate_series(v_start, v_start + p_count - 1) AS n;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.reserve_chitanta_numbers(uuid, text, integer) IS
  $$A-M7.2d1: atomikus N sorszám előre-foglalása a kliens offline-wallet-jéhez.
    Row-lock az oblio_fiokok rekordra — a párhuzamos online-issue és a
    wallet-foglalás konzisztens. SECURITY DEFINER + current_user_can_access_congregation() check.$$;

-- Engedélyezés: az authenticated role hívhatja (az RLS-scope a fn-ben megy)
REVOKE ALL ON FUNCTION public.reserve_chitanta_numbers(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_chitanta_numbers(uuid, text, integer) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- ELLENŐRZŐ SELECT-EK (futtatható formában)
-- ════════════════════════════════════════════════════════════════════════════

SELECT '════ Ellenőrzés 1: fn regisztrálva + SECURITY DEFINER ═══════════════' AS section;

SELECT
  p.proname                                          AS function_name,
  pg_get_function_result(p.oid)                      AS return_type,
  pg_get_function_arguments(p.oid)                   AS arguments,
  p.prosecdef                                        AS security_definer,
  CASE WHEN p.prosecdef THEN '✅ SECURITY DEFINER' ELSE '⚠ nem DEFINER!' END AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname  = 'reserve_chitanta_numbers';

SELECT '════ Ellenőrzés 2: authenticated role EXECUTE joga ══════════════════' AS section;

SELECT
  r.rolname                                          AS grantee,
  'EXECUTE'                                          AS privilege
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace,
     aclexplode(p.proacl) AS acl
JOIN pg_roles r ON r.oid = acl.grantee
WHERE n.nspname = 'public'
  AND p.proname  = 'reserve_chitanta_numbers'
  AND acl.privilege_type = 'EXECUTE'
  AND r.rolname IN ('authenticated', 'anon', 'service_role');

-- Várt: 1 sor (authenticated)

SELECT '════ Ellenőrzés 3: smoke-test elő-figyelmeztetés ════════════════════' AS section;
-- Smoke-teszt (NE futtasd automatikusan — a pointer tényleg eggyel nagyobb
-- lesz utána). Az auth-context-be beléptetve, a saját congregation-re:
--
--   SELECT public.reserve_chitanta_numbers(
--     '<saját-congregation-uuid>'::uuid,
--     'EREKC24',
--     5
--   );
--
-- Várt: 5 egymás utáni integer (pl. [201, 202, 203, 204, 205]), és az
-- oblio_fiokok.chitanta_kovetkezo_szam 5-tel nagyobb lesz.

-- ════════════════════════════════════════════════════════════════════════════
--  Ha minden zöld:
--    - A kliens (desktop) most már tud offline wallet-et építeni a
--      `ctx.supabase.rpc('reserve_chitanta_numbers', { p_congregation_id, p_sorozat, p_count })` hívással
--    - Az online-issue (`next_chitanta_number`) továbbra is működik — ugyanazt
--      a pointert használja, nem ütközik
-- ════════════════════════════════════════════════════════════════════════════
