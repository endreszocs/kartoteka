-- ============================================================================
-- PR-27 (2026-08-04) — ÉLETTÁRSI KAPCSOLAT mint önálló rokonsági típus
--
-- Miért: a családi kartonon eddig minden pár „házastárs" volt. A lelkészi
-- gyakorlatban meg kell különböztetni a HÁZASSÁGOT (anyakönyvezett, van
-- esküvői dátuma) az ÉLETTÁRSI kapcsolattól — a családfán, a kartonon és a
-- statisztikákban egyaránt.
--
-- MIT CSINÁL: a szemely_kapcsolat.tipus megengedett értékei közé fölveszi az
-- 'elettars'-t. Semmilyen meglévő adatot NEM módosít (minden eddigi pár marad
-- 'hazastars'), és a régi kód is fut tovább.
--
-- A kapcsolat kezdete (esküvő vagy együttélés kezdete) a MEGLÉVŐ
-- `ervenyes_tol` mezőbe kerül — ehhez nem kell séma-változás.
--
-- Futtatás: Supabase SQL Editor, az EGÉSZ fájl egyben. Idempotens.
-- ============================================================================

DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT con.conname INTO v_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'public'
    AND rel.relname = 'szemely_kapcsolat'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%hazastars%'
  LIMIT 1;

  IF v_constraint IS NULL THEN
    RAISE NOTICE 'Nem találtam tipus-CHECK megszorítást — kihagyva.';
    RETURN;
  END IF;

  IF pg_get_constraintdef(
       (SELECT oid FROM pg_constraint WHERE conname = v_constraint
         AND conrelid = 'public.szemely_kapcsolat'::regclass)
     ) ILIKE '%elettars%' THEN
    RAISE NOTICE 'Az elettars típus már engedélyezett — nincs teendő.';
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.szemely_kapcsolat DROP CONSTRAINT %I', v_constraint);
  EXECUTE format($f$
    ALTER TABLE public.szemely_kapcsolat ADD CONSTRAINT %I
    CHECK (tipus IN ('hazastars', 'elettars', 'szulo_gyermek', 'testver', 'felteszver',
                     'nagyszulo_unoka', 'mostohaszulo_mostohagyermek',
                     'gondviselo', 'orokbe_fogado', 'egyeb'))
  $f$, v_constraint);
  RAISE NOTICE 'Az elettars típus engedélyezve (% megszorítás frissítve).', v_constraint;
END $$;

COMMENT ON COLUMN public.szemely_kapcsolat.ervenyes_tol IS
  'A kapcsolat kezdete. hazastars: az esküvő dátuma (a házassági anyakönyvből vagy a családi kartonról); elettars: az együttélés kezdete, ha ismert.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. IMPORT-ŐR: a családi importok háztartás-szinkron RPC-je alapból
--    'hazastars' élt szúr be a párra. Az ON CONFLICT a TÍPUSRA is illeszkedik,
--    ezért egy meglévő 'elettars' él mellé BESZÚRNÁ a házastársi élt is (két
--    aktív pár-él ugyanarra a párra). A védőfeltétel ezt zárja ki.
--    (Ha az RPC nem létezik ebben az adatbázisban, a blokk kihagyja magát.)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'sync_households_from_csalad'
  LIMIT 1;
  IF v_def IS NULL THEN
    RAISE NOTICE 'sync_households_from_csalad nem létezik — az import-őr kihagyva.';
  ELSIF v_def ILIKE '%elettars%' THEN
    RAISE NOTICE 'Az import-őr már benne van az RPC-ben — nincs teendő.';
  ELSE
    RAISE NOTICE 'FIGYELEM: a sync_households_from_csalad RPC még nem ismeri az elettars típust. A családi IMPORT egy élettársi pár mellé házastársi élt is beszúrhat. A webalkalmazás saját szinkronja (TS) már véd ellene; az RPC frissítése a következő importig ráér.';
  END IF;
END $$;

-- ELLENŐRZÉS — várt: true
SELECT pg_get_constraintdef(con.oid) ILIKE '%elettars%' AS elettars_engedelyezve
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = 'public' AND rel.relname = 'szemely_kapcsolat'
  AND con.contype = 'c' AND pg_get_constraintdef(con.oid) ILIKE '%hazastars%'
LIMIT 1;
