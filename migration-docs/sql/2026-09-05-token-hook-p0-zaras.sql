-- ═══════════════════════════════════════════════════════════════════════════
--  P0: `custom_access_token_hook` — SZŰK, CÉLZOTT ZÁRÁS            (2026-09-05)
--  Fájl: migration-docs/sql/2026-09-05-token-hook-p0-zaras.sql
-- ═══════════════════════════════════════════════════════════════════════════
--
--  MI A BAJ
--  ────────
--  A `public.custom_access_token_hook(jsonb)` (2026-04-23-m0-3-hotfix-hook-v3.sql:31)
--  `SECURITY DEFINER`, tehát MEGKERÜLI az RLS-t — és a HÍVÓ ÁLTAL MEGADOTT
--  azonosítóra dolgozik:
--
--      SELECT status, role, congregation_id
--      FROM public.profiles
--      WHERE id = (event->>'user_id')::uuid
--
--  A visszaadott jsonb tartalmazza a `profile_status`, `profile_role` és
--  `congregation_id` értékeket. A törzsben NINCS semmilyen hívó-ellenőrzés.
--
--  A függvényre az EGYETLEN explicit GRANT a `supabase_auth_admin` (uo. :71) —
--  ez viszont MATERIALIZÁLJA a proacl-t, és a Postgres alapértelmezett
--  `PUBLIC=X` bejegyzése BENNE MARAD. A megfordítást tartalmazó két REVOKE
--  kizárólag a 2026-07-17-es member-portál láncban van
--  (2026-07-17-member-portal-token-hook.sql:360 és
--   2026-07-17-member-portal-p0-auth-isolation.sql:1615), amiről a _RUN_LOG.md
--  szerint az EGÉSZ lánc ÉLESBEN NEM FUTOTT LE.
--
--  KÖVETKEZMÉNY: bejelentkezés nélkül, a böngészőben amúgy is látható anon
--  kulccsal hívható:
--      POST /rest/v1/rpc/custom_access_token_hook
--      {"event": {"user_id": "<barmely-uuid>"}}
--  és visszaadja az adott felhasználó státuszát, szerepkörét és gyülekezetét.
--  Ez felhasználó-felsoroló orákulum, RLS-megkerüléssel.
--
--  MIÉRT KÜLÖN, SZŰK FÁJL
--  ──────────────────────
--  Ez a P0 EGY sorral zárható, és nem szabad megvárnia a séma-szintű
--  jog-higiéniai kört (`ALTER DEFAULT PRIVILEGES` + engedélyezőlista), ami
--  ~89 függvényt érint és külön előkészítést kíván.
--
--  MIÉRT BIZTONSÁGOS
--  ─────────────────
--  A hookot a Supabase Auth a `supabase_auth_admin` szerepből hívja, és annak
--  az EXPLICIT grantját ez a fájl megtartja (sőt újra kiadja). A bejelentkezés
--  tehát változatlanul működik. A `service_role`-t nem érintjük.
--
--  ⚠️ FUTTATÁS UTÁN ELLENŐRIZD, hogy a BEJELENTKEZÉS működik (egy ki-be lépés).
--     Ha a JWT-ből eltűnne a `profile_role` / `congregation_id` claim, az azt
--     jelentené, hogy a hookot mégsem a supabase_auth_admin hívja — akkor a
--     4) szakasz VISSZAÁLLÍTÓ sorát futtasd.
--
--  CSAK JOGOT ÍR. A függvény törzséhez NEM nyúl.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) ELŐTTE-KÉP (a záró rács ezzel veti össze az utána-állapotot)
-- ───────────────────────────────────────────────────────────────────────────
DO $elotte$
DECLARE
  v_acl text;
BEGIN
  SELECT COALESCE(p.proacl::text, '(NULL = orokolt alapertelmezes: PUBLIC=X)')
    INTO v_acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'custom_access_token_hook';

  IF v_acl IS NULL THEN
    RAISE EXCEPTION 'A custom_access_token_hook NEM LETEZIK — ellenorizd, hogy a helyes adatbazishoz csatlakoztal.';
  END IF;

  RAISE NOTICE '1) ELOTTE proacl: %', v_acl;
END;
$elotte$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) A ZÁRÁS
--    Minden túlterhelésre, hogy egy régebbi szignatúra se maradjon nyitva.
-- ───────────────────────────────────────────────────────────────────────────
DO $zaras$
DECLARE
  r     record;
  v_db  int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'custom_access_token_hook'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    -- A Supabase Auth ebbol a szerepbol hivja — ez KELL, hogy maradjon.
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO supabase_auth_admin', r.sig);
    v_db := v_db + 1;
  END LOOP;

  RAISE NOTICE '2) Lezarva % tulterheles.', v_db;
END;
$zaras$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) ŐRSZEM — negatív ÉS pozitív asszert
-- ───────────────────────────────────────────────────────────────────────────
DO $orszem$
DECLARE
  v_nyitott text;
  v_auth_ok boolean;
BEGIN
  -- (a) NEGATÍV: sem anon, sem authenticated, sem PUBLIC nem hívhatja.
  SELECT string_agg(x.szerep, ', ') INTO v_nyitott
  FROM (
    SELECT 'anon' AS szerep
    WHERE EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='custom_access_token_hook'
                    AND has_function_privilege('anon', p.oid, 'EXECUTE'))
    UNION ALL
    SELECT 'authenticated'
    WHERE EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='custom_access_token_hook'
                    AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    UNION ALL
    SELECT 'PUBLIC (orokolt)'
    WHERE EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='custom_access_token_hook'
                    AND (p.proacl IS NULL
                         OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                    WHERE a.grantee = 0 AND a.privilege_type='EXECUTE')))
  ) x;

  IF v_nyitott IS NOT NULL THEN
    RAISE EXCEPTION 'ORSZEM (a): a custom_access_token_hook MEG MINDIG hivhato innen: %', v_nyitott;
  END IF;

  -- (b) POZITÍV: a Supabase Auth szerepe megtartotta a jogot (kulonben a
  --     bejelentkezes JWT-jebol eltunnenek a claim-ek).
  SELECT bool_or(has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE'))
    INTO v_auth_ok
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='custom_access_token_hook';

  IF NOT COALESCE(v_auth_ok, false) THEN
    RAISE EXCEPTION 'ORSZEM (b): a supabase_auth_admin ELVESZTETTE a jogot — a bejelentkezes JWT-claimjei elveszhetnek. A migracio VISSZAGORDUL.';
  END IF;

  RAISE NOTICE '3) ORSZEM: rendben — zarva anon/authenticated/PUBLIC fele, nyitva supabase_auth_admin fele.';
END;
$orszem$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
--  4) VISSZAÁLLÍTÁS (CSAK ha a bejelentkezés elromlana — lásd a fejlécet)
--     Kommentben, szándékosan: ne lehessen véletlenül lefuttatni.
--
--     GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO authenticated;
--
--     ⚠️ Ez visszanyitja a rést. Előbb inkább azt derítsd ki, MELYIK szerep
--        hívja valójában a hookot (Supabase Dashboard → Authentication → Hooks).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
--  ZÁRÓ RÁCS
-- ═══════════════════════════════════════════════════════════════════════════
SELECT * FROM (

SELECT 1 AS sorszam, 'A hook jogosultsagai MOST' AS lepes,
  COALESCE((SELECT p.proacl::text
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='custom_access_token_hook' LIMIT 1),
           'NULL = orokolt PUBLIC=X — EZ HIBA LENNE') AS allapot

UNION ALL
SELECT 2, 'Szerepenkent',
  COALESCE((SELECT string_agg(x.szerep || ' = ' || x.ertek, E'\n' ORDER BY x.szerep)
    FROM (
      SELECT 'anon' AS szerep,
             CASE WHEN has_function_privilege('anon', p.oid,'EXECUTE') THEN 'HIVHATJA (HIBA)' ELSE 'zarva' END AS ertek
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='custom_access_token_hook'
      UNION ALL
      SELECT 'authenticated',
             CASE WHEN has_function_privilege('authenticated', p.oid,'EXECUTE') THEN 'HIVHATJA (HIBA)' ELSE 'zarva' END
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='custom_access_token_hook'
      UNION ALL
      SELECT 'supabase_auth_admin',
             CASE WHEN has_function_privilege('supabase_auth_admin', p.oid,'EXECUTE') THEN 'hivhatja (KELL)' ELSE 'ZARVA (HIBA)' END
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='custom_access_token_hook'
    ) x), 'nem merheto')

UNION ALL
SELECT 3, 'TEENDO FUTTATAS UTAN',
  ('Lepj ki es be a kartoteka.app-on. Ha a bejelentkezes mukodik es a jogosultsagaid '
   || 'valtozatlanok, a zaras rendben van. Ha barmi elromlik, a fajl 4) szakaszaban '
   || 'ott a visszaallito sor (kommentben).')::text

) q ORDER BY sorszam;
