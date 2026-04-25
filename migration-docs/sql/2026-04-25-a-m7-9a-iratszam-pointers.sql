-- ════════════════════════════════════════════════════════════════════════════
--  A-M7.9a — iratszam_pointers + reserve_iratszam() RPC + defensive UNIQUE
--  Dátum: 2026-04-25
--  Futtatás: Endre → Supabase SQL Editor
--
--  CÉL:
--    Befizetés / kiadás Készpénzes iratszámához atomikus, race-mentes
--    sorszám-foglalás. A jelenlegi `getNextReceiptNumberUseCase` regex-MAX+1
--    alapú (lásd packages/core/src/finance/befizetes/next-receipt-number.ts:15)
--    — két lelkész egyidejű mentésekor ugyanazt a számot kaphatják, és a
--    Database_schema.sql szerint NINCS UNIQUE constraint, ami megfogná.
--
--    Ez a migráció behoz:
--      (1) `iratszam_pointers` tábla (per congregation × típus × év)
--      (2) `reserve_iratszam()` RPC — N sorszám atomikus előre-foglalása
--          (offline-wallet feltöltéshez, A-M7.9 desktop)
--      (3) `next_iratszam()` RPC — egyetlen szám atomikus foglalás (online flow)
--      (4) `bootstrap_iratszam_pointer()` helper — első futáskor MAX+1-ből indít
--      (5) Defensive PARTIAL UNIQUE INDEX — race-védelem szerver-szinten
--          (csak Készpénzre, csak nem-törölt + nem-belső-mozgás sorokra)
--
--  KONTEXTUS — séma-drift:
--    Endre jelezte 2026-04-25, hogy a Database_schema.sql elavult lehet. Az
--    UNIQUE INDEX `IF NOT EXISTS`-szel megy, így nem ütközik egy korábbi
--    futtatással. Az ellenőrző SELECT-ek a fájl végén megmutatják a tényleges
--    állapotot.
--
--  FONTOS: a defensive UNIQUE INDEX **csak akkor sikerül**, ha NINCSENEK már
--  duplikált (congregation_id, fizetettev, iratszam) hármasok a `befizetes` /
--  `kiadas` táblában. Ha vannak: a CREATE INDEX hibát dob — ELŐTTE futtasd
--  az „Ellenőrzés 0 — duplikátum-keresés" SELECT-et, és kézzel rendezd a
--  duplikátumokat. NE droppold automatikusan (adatvesztés veszélye)!
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1) iratszam_pointers tábla
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.iratszam_pointers (
  id              uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  iratszam_tipus  text NOT NULL CHECK (iratszam_tipus IN ('befizetes', 'kiadas')),
  ev              integer NOT NULL CHECK (ev BETWEEN 2000 AND 2100),
  next_szam       integer NOT NULL DEFAULT 1 CHECK (next_szam >= 1),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iratszam_pointers_unique UNIQUE (congregation_id, iratszam_tipus, ev)
);

COMMENT ON TABLE public.iratszam_pointers IS
  $$A-M7.9a: per (congregation × típus × év) iratszám-pointer. A reserve_iratszam()
    RPC atomikusan inkrementálja N-nel, majd a kliens-wallet-be mentett számokat
    a desktop offline-módban használja fel.$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2) Bootstrap helper — első hozzáférés a (congregation, típus, év) hármasra
-- ──────────────────────────────────────────────────────────────────────────
--
-- Ha még nincs pointer-sor a (congregation, típus, év)-re, létrehozza, és a
-- next_szam-ot a meglévő befizetes/kiadas tábla MAX(iratszam regex) + 1-ből
-- inicializálja. Idempotens: ha már van sor, semmit sem csinál.

CREATE OR REPLACE FUNCTION public.bootstrap_iratszam_pointer(
  p_congregation_id uuid,
  p_tipus           text,
  p_ev              integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing  integer;
  v_max       integer := 0;
  v_iratszam  text;
BEGIN
  -- Ha már van pointer, csak adja vissza
  SELECT next_szam
    INTO v_existing
    FROM public.iratszam_pointers
   WHERE congregation_id = p_congregation_id
     AND iratszam_tipus  = p_tipus
     AND ev              = p_ev
   FOR UPDATE;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- MAX(iratszam regex) a megfelelő táblából
  IF p_tipus = 'befizetes' THEN
    FOR v_iratszam IN
      SELECT iratszam
        FROM public.befizetes
       WHERE congregation_id = p_congregation_id
         AND fizetettev      = p_ev
         AND deleted         = false
         AND irattipus ILIKE '%észpénz%'
         AND belso_mozgas_xkey IS NULL
    LOOP
      v_max := GREATEST(
        v_max,
        COALESCE(NULLIF(SUBSTRING(v_iratszam FROM '[0-9]+'), '')::integer, 0)
      );
    END LOOP;
  ELSIF p_tipus = 'kiadas' THEN
    FOR v_iratszam IN
      SELECT iratszam
        FROM public.kiadas
       WHERE congregation_id = p_congregation_id
         AND EXTRACT(YEAR FROM datum) = p_ev
         AND deleted         = false
         AND irattipus ILIKE '%észpénz%'
         AND belso_mozgas_xkey IS NULL
    LOOP
      v_max := GREATEST(
        v_max,
        COALESCE(NULLIF(SUBSTRING(v_iratszam FROM '[0-9]+'), '')::integer, 0)
      );
    END LOOP;
  ELSE
    RAISE EXCEPTION 'Ismeretlen iratszam_tipus: %', p_tipus;
  END IF;

  INSERT INTO public.iratszam_pointers (congregation_id, iratszam_tipus, ev, next_szam)
  VALUES (p_congregation_id, p_tipus, p_ev, v_max + 1);

  RETURN v_max + 1;
END;
$$;

COMMENT ON FUNCTION public.bootstrap_iratszam_pointer(uuid, text, integer) IS
  $$A-M7.9a: bootstrap az iratszam_pointers sorhoz a meglévő MAX(iratszam) + 1-ből.
    Idempotens — ha már van pointer, csak visszaadja a next_szam-ot.$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3) reserve_iratszam() RPC — N sorszám atomikus előre-foglalása
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reserve_iratszam(
  p_congregation_id uuid,
  p_tipus           text,
  p_ev              integer,
  p_count           integer
) RETURNS integer[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start    integer;
  v_result   integer[];
BEGIN
  -- 1) Scope-check
  IF NOT public.current_user_can_access_congregation(p_congregation_id) THEN
    RAISE EXCEPTION 'Nincs jogosultság a congregation_id=% -hoz', p_congregation_id;
  END IF;

  -- 2) Input
  IF p_count IS NULL OR p_count <= 0 THEN
    RAISE EXCEPTION 'p_count kötelező, pozitív (kapott: %)', p_count;
  END IF;
  IF p_count > 100 THEN
    RAISE EXCEPTION 'Legfeljebb 100 sorszám foglalható egyszerre (kapott: %)', p_count;
  END IF;
  IF p_tipus NOT IN ('befizetes', 'kiadas') THEN
    RAISE EXCEPTION 'Ismeretlen iratszam_tipus: %', p_tipus;
  END IF;

  -- 3) Ha nincs pointer-sor, bootstrap-oljuk (a bootstrap maga FOR UPDATE-elt)
  v_start := public.bootstrap_iratszam_pointer(p_congregation_id, p_tipus, p_ev);

  -- 4) Atomikus increment (a bootstrap után már létezik a sor)
  UPDATE public.iratszam_pointers
     SET next_szam  = v_start + p_count,
         updated_at = now()
   WHERE congregation_id = p_congregation_id
     AND iratszam_tipus  = p_tipus
     AND ev              = p_ev;

  -- 5) Sorszámok generálása: v_start, v_start+1, …, v_start + p_count - 1
  SELECT array_agg(n ORDER BY n)
    INTO v_result
    FROM generate_series(v_start, v_start + p_count - 1) AS n;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.reserve_iratszam(uuid, text, integer, integer) IS
  $$A-M7.9a: atomikus N iratszám előre-foglalása a kliens offline-wallet-jéhez.
    Per (congregation × típus × év) pointer, FOR UPDATE row-lock. SECURITY DEFINER +
    current_user_can_access_congregation() check.$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4) next_iratszam() RPC — egyetlen szám atomikus foglalás (online-flow)
-- ──────────────────────────────────────────────────────────────────────────
--
-- A `getNextReceiptNumberUseCase` jelenlegi regex-MAX+1 helyett ez az RPC
-- biztosítja a concurrency-safe sorszám-foglalást. A use-case következő
-- iterációja erre vált; addig a desktop wallet-flow csak a `reserve_iratszam`-ot
-- használja.

CREATE OR REPLACE FUNCTION public.next_iratszam(
  p_congregation_id uuid,
  p_tipus           text,
  p_ev              integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_arr integer[];
BEGIN
  v_arr := public.reserve_iratszam(p_congregation_id, p_tipus, p_ev, 1);
  RETURN v_arr[1];
END;
$$;

COMMENT ON FUNCTION public.next_iratszam(uuid, text, integer) IS
  $$A-M7.9a: egyetlen iratszám atomikus foglalás (reserve_iratszam(.., 1) wrapper).$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 5) GRANTS
-- ──────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.bootstrap_iratszam_pointer(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_iratszam(uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_iratszam(uuid, text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.reserve_iratszam(uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_iratszam(uuid, text, integer) TO authenticated;
-- bootstrap-ot direkt nem hívja a kliens; csak a fenti két RPC mögött

-- ──────────────────────────────────────────────────────────────────────────
-- 6) RLS: csak a saját gyülekezet pointerei
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.iratszam_pointers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iratszam_pointers_select ON public.iratszam_pointers;
CREATE POLICY iratszam_pointers_select ON public.iratszam_pointers
  FOR SELECT
  TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

-- INSERT/UPDATE NEM elérhető direktben — csak a SECURITY DEFINER RPC-n át
DROP POLICY IF EXISTS iratszam_pointers_no_direct_write ON public.iratszam_pointers;
CREATE POLICY iratszam_pointers_no_direct_write ON public.iratszam_pointers
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
--  KÜLÖN TRANZAKCIÓ — defensive UNIQUE (lehet hogy duplikátum-tisztítást igényel)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Befizetés Készpénz iratszám-uniqueness PARTIAL INDEX
CREATE UNIQUE INDEX IF NOT EXISTS uniq_befizetes_iratszam_year_congregation
  ON public.befizetes (congregation_id, fizetettev, iratszam)
  WHERE deleted = false
    AND irattipus ILIKE '%észpénz%'
    AND belso_mozgas_xkey IS NULL;

COMMENT ON INDEX public.uniq_befizetes_iratszam_year_congregation IS
  $$A-M7.9a: race-védelem a Készpénzes befizetés-iratszám duplikáció ellen.
    PARTIAL — csak nem-törölt, Készpénzes, nem-belső-mozgás sorokra. A 23505
    most már megbízhatóan jelez a save-flow-nak.$$;

-- Kiadás Készpénz iratszám-uniqueness — DATE→YEAR funkcionális index
-- Megj.: a `kiadas.datum` TIMESTAMP, ezért EXTRACT(YEAR ...)-rel megy.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kiadas_iratszam_year_congregation
  ON public.kiadas (congregation_id, (EXTRACT(YEAR FROM datum)::integer), iratszam)
  WHERE deleted = false
    AND irattipus ILIKE '%észpénz%'
    AND belso_mozgas_xkey IS NULL;

COMMENT ON INDEX public.uniq_kiadas_iratszam_year_congregation IS
  $$A-M7.9a: race-védelem a Készpénzes kiadás-iratszám duplikáció ellen.
    PARTIAL — csak nem-törölt, Készpénzes, nem-belső-mozgás sorokra.$$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- ELLENŐRZŐ SELECT-EK (futtatható formában)
-- ════════════════════════════════════════════════════════════════════════════

SELECT '════ Ellenőrzés 0: duplikátumok keresése (FONTOS — UNIQUE előtt) ════' AS section;

-- Ha ez NEM üres → a UNIQUE INDEX nem hoz létre, ütközés van. Kézi rendezés kell.
SELECT
  'befizetes'                                AS tabla,
  congregation_id,
  fizetettev,
  iratszam,
  COUNT(*)                                   AS db_szam,
  array_agg(id ORDER BY id)                  AS ids
FROM public.befizetes
WHERE deleted = false
  AND irattipus ILIKE '%észpénz%'
  AND belso_mozgas_xkey IS NULL
GROUP BY congregation_id, fizetettev, iratszam
HAVING COUNT(*) > 1
UNION ALL
SELECT
  'kiadas'                                   AS tabla,
  congregation_id,
  EXTRACT(YEAR FROM datum)::integer          AS fizetettev,
  iratszam,
  COUNT(*)                                   AS db_szam,
  array_agg(id ORDER BY id)                  AS ids
FROM public.kiadas
WHERE deleted = false
  AND irattipus ILIKE '%észpénz%'
  AND belso_mozgas_xkey IS NULL
GROUP BY congregation_id, EXTRACT(YEAR FROM datum), iratszam
HAVING COUNT(*) > 1;

-- Várt: 0 sor. Ha vannak, a UNIQUE INDEX külön blokkban (a 2. BEGIN-ben) elbukhatott.

SELECT '════ Ellenőrzés 1: iratszam_pointers tábla létrejött ════════════════' AS section;

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'iratszam_pointers'
ORDER BY ordinal_position;
-- Várt: 6 sor (id, congregation_id, iratszam_tipus, ev, next_szam, updated_at)

SELECT '════ Ellenőrzés 2: RPC-k regisztrálva + SECURITY DEFINER ════════════' AS section;

SELECT
  p.proname                                         AS function_name,
  pg_get_function_arguments(p.oid)                  AS arguments,
  p.prosecdef                                       AS security_definer,
  CASE WHEN p.prosecdef THEN '✅ SECURITY DEFINER' ELSE '⚠ nem DEFINER!' END AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('reserve_iratszam', 'next_iratszam', 'bootstrap_iratszam_pointer')
ORDER BY p.proname;
-- Várt: 3 sor, mind ✅ SECURITY DEFINER

SELECT '════ Ellenőrzés 3: authenticated EXECUTE jog (csak a 2 publikus RPC-re)' AS section;

SELECT
  p.proname                                         AS function_name,
  r.rolname                                         AS grantee,
  acl.privilege_type                                AS privilege
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace,
     aclexplode(p.proacl) AS acl
JOIN pg_roles r ON r.oid = acl.grantee
WHERE n.nspname = 'public'
  AND p.proname IN ('reserve_iratszam', 'next_iratszam', 'bootstrap_iratszam_pointer')
  AND acl.privilege_type = 'EXECUTE'
ORDER BY p.proname, r.rolname;
-- Várt: reserve_iratszam + next_iratszam → authenticated; bootstrap_iratszam_pointer → csak owner

SELECT '════ Ellenőrzés 4: PARTIAL UNIQUE INDEX-ek létrejöttek ══════════════' AS section;

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'uniq_befizetes_iratszam_year_congregation',
    'uniq_kiadas_iratszam_year_congregation'
  )
ORDER BY indexname;
-- Várt: 2 sor

SELECT '════ Ellenőrzés 5: RLS engedélyezve az iratszam_pointers-en ═════════' AS section;

SELECT
  schemaname,
  tablename,
  rowsecurity        AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'iratszam_pointers';
-- Várt: rls_enabled = true

SELECT '════ Ellenőrzés 6: smoke-test (manuális, NE futtasd auto) ═══════════' AS section;
-- Manuálisan, a saját gyülekezet UUID-jával:
--
--   SELECT public.reserve_iratszam(
--     '<saját-congregation-uuid>'::uuid,
--     'befizetes',
--     2026,
--     5
--   );
--   -- Várt: 5 elem array, pl. {1,2,3,4,5} ha üres a 2026-os pool, vagy
--   -- {200,201,202,203,204} ha a meglévő MAX 199 volt.
--
--   SELECT * FROM public.iratszam_pointers
--   WHERE congregation_id = '<saját-congregation-uuid>'::uuid
--     AND iratszam_tipus = 'befizetes'
--     AND ev = 2026;
--   -- Várt: 1 sor, next_szam = az előző + 5
--
--   SELECT public.next_iratszam('<uuid>'::uuid, 'befizetes', 2026);
--   -- Várt: 1 integer, next_szam += 1

-- ════════════════════════════════════════════════════════════════════════════
--  Ha minden zöld:
--    - A desktop A-M7.9a kliens-oldali wallet-feltöltése működik:
--        ctx.supabase.rpc('reserve_iratszam', { p_congregation_id, p_tipus: 'befizetes', p_ev, p_count })
--    - A defensive UNIQUE megfogja a duplikációkat: 23505 a save-flow-ban
--    - A jövőbeli kiadás-write-offline (A-M7.9b) ugyanezt a táblát + RPC-t hívja
--      'kiadas' típussal — nincs új SQL.
-- ════════════════════════════════════════════════════════════════════════════
