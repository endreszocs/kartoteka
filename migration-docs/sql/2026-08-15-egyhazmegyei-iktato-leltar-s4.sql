-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EGYHÁZMEGYEI LELTÁR + IKTATÓ — S3/S4 kiegészítő DB-réteg      2026-08-15 ║
-- ║ Fájl: migration-docs/sql/2026-08-15-egyhazmegyei-iktato-leltar-s4.sql    ║
-- ║ (Egyházmegyei szint terv, 2.2 + 2.3 fejezet — az S3/S4 szelet zárása)    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ELŐFELTÉTEL: a 2026-08-15-egyhazmegyei-scope-oszlopok.sql MÁR LEFUTOTT
-- (leltar_tetelek / iktato / iktato_sablonok / iktato_yearly_closures
-- diocese_id oszlopa + RLS diocese-lábak + egyediségi indexek). Az 1. szakasz
-- őrszeme enélkül hangosan leáll.
--
-- MIT CSINÁL (a scope-oszlopok SQL fájl végi FIGYELMEZTETÉSEK blokkjának
-- tételes feloldása):
--   1/A) iktato_csatolmany: diocese_id + a kompozit FK megyei tükre
--        (iktato_id, diocese_id) → iktato(id, diocese_id) — megyei irathoz is
--        felvehető csatolmány; RLS diocese-lábak.
--   1/B) iktato_sequence_pointers: kompozit PK → surrogate id; diocese_id;
--        next_iktato_sequence ÚJRAÍRÁS (részleges-index arbiterrel) +
--        ÚJ next_iktato_sequence_dio RPC (megyénként+évenként saját számsor).
--   1/C) storage-RLS: az 'iktato-csatolmanyok' bucket diocese-prefixű útjai
--        ({diocese_id}/{iktato_id}/…) a megyei írók/olvasók számára.
--   1/D) dioceses.pecset_url + alairas_url — esperesi hivatali pecsét/aláírás
--        PNG (a gyülekezeti 24. pont megyei párja; Legea 489/2006 Art. 15).
--   1/E) MENTÉS: backup_table_policy.globalis_predikatum + backup_scope_where
--        és backup_live_tables bővítése — a scope-oszlopos táblák MEGYEI sorai
--        (congregation_id IS NULL) a GLOBÁLIS mentés-fájlba kerülnek. Eddig
--        EGYIK mentésbe sem estek bele (dokumentált néma hiány) — ez volt az
--        S3 szelet KÖTELEZŐ mentés-feladata.
--
-- TANULSÁGOK, AMIKRE ÉPÜL (memória-hibaosztályok):
--   · „A migration-fájl NEM bizonyíték" → 0. SZAKASZ állapotfelmérés +
--     fail-closed őrszem az 1. szakasz elején.
--   · „RLS-policy a hívó szerepében fut → GRANT nélkül 403" → minden hívott
--     függvényre explicit GRANT, a policy-létrehozás ELŐTT, EGY tranzakcióban.
--   · „Skalár hatókör + if(id) filter = néma teljes szivárgás" → minden új
--     policy-ág COALESCE(..., '{}'::uuid[])-cel fail-closed.
--
-- FUTTATÁSI SORREND (a Supabase Studio csak az utolsó utasítást mutatja!):
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS. Egyetlen SELECT, semmit nem módosít.
--   2.  1. SZAKASZ — A MIGRÁCIÓ. Egyetlen tranzakció (BEGIN … COMMIT).
--   3.  2. SZAKASZ — ELLENŐRZÉS. Egyetlen SELECT — az eredményt küldd vissza.
--
-- IDEMPOTENS: ADD COLUMN IF NOT EXISTS + DO-őrök + DROP POLICY IF EXISTS +
-- CREATE OR REPLACE — akárhányszor újrafuttatható.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ║ EGYETLEN SELECT. Semmit nem módosít.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '0/A · ELŐFELTÉTEL — scope-oszlopok' AS szakasz,
       'A 4 tábla diocese_id oszlopa megvan? (4 = a scope-oszlopok SQL lefutott)' AS mit,
       (SELECT count(*)::text || ' / 4' FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name IN ('leltar_tetelek','iktato','iktato_sablonok','iktato_yearly_closures')
          AND c.column_name = 'diocese_id') AS ertek,
       'Ha nem 4: ELŐBB a 2026-08-15-egyhazmegyei-scope-oszlopok.sql fusson le — az 1. szakasz őrszeme enélkül leáll.' AS teendo

UNION ALL
SELECT 2, '0/A · ELŐFELTÉTEL — kanonikus függvények',
       'current_user_has_global_access + current_user_diocese_ids + current_user_diocese_olvaso_ids',
       (SELECT count(*)::text || ' / 3' FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('current_user_has_global_access',
                            'current_user_diocese_ids',
                            'current_user_diocese_olvaso_ids')),
       'Ha nem 3: előbb a 2026-08-11-globalis-hozzaferes-szukites.sql és a 2026-08-11-szamvevo-megyei-hozzaferes.sql.'

UNION ALL
SELECT 3, '0/B · IKTATO_CSATOLMANY',
       'congregation_id nullable + diocese_id + scope-CHECK állapota',
       COALESCE((
         SELECT 'congregation_id nullable=' || c1.is_nullable
                || COALESCE(' · diocese_id VAN', ' · diocese_id még nincs')
                || CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                                     WHERE conname = 'iktato_csatolmany_pontosan_egy_scope'
                                       AND conrelid = 'public.iktato_csatolmany'::regclass)
                        THEN ' · CHECK él' ELSE ' · CHECK még nincs' END
         FROM information_schema.columns c1
         LEFT JOIN information_schema.columns c2
           ON c2.table_schema='public' AND c2.table_name='iktato_csatolmany' AND c2.column_name='diocese_id'
         WHERE c1.table_schema='public' AND c1.table_name='iktato_csatolmany'
           AND c1.column_name='congregation_id'
       ), '⛔ NINCS iktato_csatolmany tábla — előbb a 2026-07-17-f6-iktato-csomok-csatolmanyok.sql'),
       'Az 1/A szakasz idempotensen pótolja a hiányzókat.'

UNION ALL
SELECT 4, '0/C · SEQUENCE_POINTERS PK',
       'A PK még a régi (congregation_id, year) kompozit?',
       COALESCE((SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%congregation_id%'
                             THEN 'IGEN — az 1/B szakasz surrogate id-re cseréli'
                             ELSE '✅ már surrogate (id) PK' END
                 FROM pg_constraint
                 WHERE conname = 'iktato_sequence_pointers_pkey'
                   AND conrelid = 'public.iktato_sequence_pointers'::regclass),
                'nincs PK?!'),
       'PK-oszlop nem lehet NULL — ezért kell a csere a diocese-sorokhoz.'

UNION ALL
SELECT 5, '0/D · MEGYEI SORSZÁM-RPC',
       'Létezik a next_iktato_sequence_dio(uuid, integer)?',
       CASE WHEN to_regprocedure('public.next_iktato_sequence_dio(uuid, integer)') IS NULL
            THEN 'még nincs — az 1/B hozza létre' ELSE '✅ van' END,
       'A megyei iktatószám-kiosztás atomikus útja.'

UNION ALL
SELECT 6, '0/E · DIOCESES PECSÉT/ALÁÍRÁS',
       'dioceses.pecset_url + alairas_url oszlopok',
       (SELECT count(*)::text || ' / 2' FROM information_schema.columns
        WHERE table_schema='public' AND table_name='dioceses'
          AND column_name IN ('pecset_url','alairas_url')),
       'Az 1/D szakasz pótolja.'

UNION ALL
SELECT 7, '0/F · MENTÉS-OSZLOP',
       'backup_table_policy.globalis_predikatum oszlop',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='backup_table_policy'
                           AND column_name='globalis_predikatum')
            THEN '✅ van' ELSE 'még nincs — az 1/E hozza létre' END,
       'A megyei sorok mentés-útja (globális fájl).'

UNION ALL
SELECT (10 + row_number() OVER (ORDER BY t.tabla))::int, '0/F · MENTÉS-BESOROLÁS',
       t.tabla,
       COALESCE((SELECT 'hatokor=' || p.hatokor FROM public.backup_table_policy p WHERE p.tabla = t.tabla),
                '⚠️ besorolatlan'),
       'Az 1/E a gyulekezet-hatókörű sorokra írja rá a globalis_predikatum-ot.'
FROM (VALUES ('leltar_tetelek'), ('iktato'), ('iktato_sablonok'),
             ('iktato_yearly_closures'), ('iktato_csatolmany'),
             ('iktato_sequence_pointers')) AS t(tabla)

UNION ALL
SELECT 20, '0/G · STORAGE DIOCESE-LÁBAK',
       'Az iktato-csatolmanyok bucket megyei policy-jai (várt futás után: 3)',
       (SELECT count(*)::text || ' / 3' FROM pg_policies
        WHERE schemaname='storage' AND tablename='objects'
          AND policyname IN ('iktato_csatolmanyok_dio_insert',
                             'iktato_csatolmanyok_dio_select',
                             'iktato_csatolmanyok_dio_delete')),
       'Az 1/C szakasz hozza létre.'

UNION ALL
SELECT (30 + row_number() OVER (ORDER BY f.fn))::int, '0/H · FÜGGVÉNY-GRANT',
       'EXECUTE az authenticated-nek: ' || f.fn,
       CASE WHEN to_regprocedure('public.' || f.fn || '()') IS NULL THEN 'nincs függvény'
            WHEN has_function_privilege('authenticated', ('public.' || f.fn || '()')::regprocedure, 'EXECUTE')
            THEN '✅ van' ELSE '⛔ NINCS — az 1. szakasz GRANT-ja pótolja' END,
       'A policy a HÍVÓ szerepében fut — EXECUTE nélkül 42501/403.'
FROM (VALUES ('current_user_has_global_access'), ('current_user_diocese_ids'),
             ('current_user_diocese_olvaso_ids')) AS f(fn)

ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A MIGRÁCIÓ                                 FUTTATÁS: 2.     ║
-- ║ ⚠️ EGYETLEN TRANZAKCIÓ.                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;
SET LOCAL lock_timeout      = '3s';
SET LOCAL statement_timeout = '5min';

-- ── ŐRSZEM: fail-closed előfeltételek ───────────────────────────────────────
DO $orszem$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name IN ('leltar_tetelek','iktato','iktato_sablonok','iktato_yearly_closures')
        AND c.column_name = 'diocese_id') < 4 THEN
    RAISE EXCEPTION '⛔ A scope-oszlopok hiányoznak — ELŐBB a 2026-08-15-egyhazmegyei-scope-oszlopok.sql fusson le.';
  END IF;
  IF to_regprocedure('public.current_user_has_global_access()') IS NULL
     OR to_regprocedure('public.current_user_diocese_ids()') IS NULL
     OR to_regprocedure('public.current_user_diocese_olvaso_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik valamelyik kanonikus hatókör-függvény — előbb a 2026-08-11-es RLS-migrációk fussanak le.';
  END IF;
  IF to_regclass('public.iktato_csatolmany') IS NULL THEN
    RAISE EXCEPTION '⛔ Nincs iktato_csatolmany tábla — előbb a 2026-07-17-f6-iktato-csomok-csatolmanyok.sql fusson le.';
  END IF;
  IF to_regclass('public.iktato_sequence_pointers') IS NULL THEN
    RAISE EXCEPTION '⛔ Nincs iktato_sequence_pointers tábla — előbb a 2026-05-17-iktato-sequence-pointer-rpc.sql fusson le.';
  END IF;
  IF to_regclass('public.dioceses') IS NULL THEN
    RAISE EXCEPTION '⛔ Nincs public.dioceses tábla — nem ez az adatbázis.';
  END IF;
END
$orszem$;

-- GRANT-tanulság: a policy a HÍVÓ szerepében fut — EXECUTE nélkül 42501/403.
-- (Idempotens ismétlés — a scope-oszlopok SQL is kiadta.)
GRANT EXECUTE ON FUNCTION public.current_user_has_global_access()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_diocese_ids()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_diocese_olvaso_ids() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 1/A) iktato_csatolmany — megyei csatolmányok
-- ────────────────────────────────────────────────────────────────────────────
-- A kompozit FK (iktato_id, congregation_id) → iktato(id, congregation_id)
-- MEGYEI iktato-sorra (congregation_id NULL) nem illeszthető: a
-- congregation_id NOT NULL volt, így megyei irathoz csatolmány NEM volt
-- felvehető. A feloldás a scope-oszlopos minta tükre: diocese_id + a
-- (iktato_id, diocese_id) kompozit FK — a denormalizált scope-érték így
-- MINDKÉT ágon a szülő irat valódi scope-ja (MATCH SIMPLE: a NULL-oszlopos
-- ágat a másik FK fedi, a CHECK pedig kizárja a se-ilyen-se-olyan sort).

ALTER TABLE public.iktato_csatolmany ADD COLUMN IF NOT EXISTS diocese_id uuid;

DO $csat$
BEGIN
  -- FK a dioceses-re (a congregation-párral azonos: ON DELETE CASCADE — a
  -- csatolmány metaadat, a FÁJL takarítása app-oldali felelősség).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'iktato_csatolmany_diocese_id_fkey'
      AND conrelid = 'public.iktato_csatolmany'::regclass
  ) THEN
    ALTER TABLE public.iktato_csatolmany
      ADD CONSTRAINT iktato_csatolmany_diocese_id_fkey
      FOREIGN KEY (diocese_id) REFERENCES public.dioceses(id) ON DELETE CASCADE;
  END IF;

  -- congregation_id NULL-ozhatóvá (megyei csatolmánynál üres).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='iktato_csatolmany'
      AND column_name='congregation_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.iktato_csatolmany ALTER COLUMN congregation_id DROP NOT NULL;
  END IF;

  -- Fail-closed scope-őr: PONTOSAN az egyik scope kitöltött.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'iktato_csatolmany_pontosan_egy_scope'
      AND conrelid = 'public.iktato_csatolmany'::regclass
  ) THEN
    ALTER TABLE public.iktato_csatolmany
      ADD CONSTRAINT iktato_csatolmany_pontosan_egy_scope
      CHECK (num_nonnulls(congregation_id, diocese_id) = 1);
  END IF;

  -- Az iktato (id, diocese_id) egyedi párja — a kompozit FK célpontja.
  -- (Az id PK, tehát a pár mindig egyedi; a constraint csak FK-célpontnak kell.)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'iktato_id_diocese_uk'
      AND conrelid = 'public.iktato'::regclass
  ) THEN
    ALTER TABLE public.iktato
      ADD CONSTRAINT iktato_id_diocese_uk UNIQUE (id, diocese_id);
  END IF;

  -- A megyei kompozit FK — a gyülekezeti iktato_csatolmany_iktato_id_fkey tükre.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'iktato_csatolmany_iktato_dio_fkey'
      AND conrelid = 'public.iktato_csatolmany'::regclass
  ) THEN
    ALTER TABLE public.iktato_csatolmany
      ADD CONSTRAINT iktato_csatolmany_iktato_dio_fkey
      FOREIGN KEY (iktato_id, diocese_id)
      REFERENCES public.iktato (id, diocese_id) ON DELETE CASCADE;
  END IF;
END
$csat$;

CREATE INDEX IF NOT EXISTS iktato_csatolmany_diocese_idx
  ON public.iktato_csatolmany (diocese_id) WHERE diocese_id IS NOT NULL;

COMMENT ON COLUMN public.iktato_csatolmany.diocese_id IS
  '2026-08-15 (egyházmegyei szint, S4): a MEGYEI iktató csatolmánya. Pontosan az egyik scope (congregation_id VAGY diocese_id) kitöltött — CHECK őrzi; a kompozit FK (iktato_id, diocese_id) garantálja, hogy a denormalizált érték a szülő irat valódi megyéje.';

-- A MEGLÉVŐ gyülekezeti policy-k őr-burkolása (a scope-oszlopok SQL 1/C
-- mintája): a current_user_has_global_access()-ág miatt a rendszergazda a
-- megyei sorokat a gyülekezeti policy-n át is elérné — az explicit őr
-- szerkezeti garanciává teszi, hogy gyülekezeti policy CSAK gyülekezeti sort fed.
DO $burkolas$
DECLARE
  pol record;
  v_using text;
  v_check text;
  v_sql   text;
BEGIN
  FOR pol IN
    SELECT p.policyname, p.qual, p.with_check
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'iktato_csatolmany'
      AND p.policyname NOT LIKE '%diocese%'
      AND (COALESCE(p.qual,'') || ' ' || COALESCE(p.with_check,''))
          NOT LIKE '%congregation_id IS NOT NULL%'
  LOOP
    v_using := CASE WHEN pol.qual IS NULL THEN NULL
                    ELSE format('(iktato_csatolmany.congregation_id IS NOT NULL AND (%s))', pol.qual) END;
    v_check := CASE WHEN pol.with_check IS NULL THEN NULL
                    ELSE format('(iktato_csatolmany.congregation_id IS NOT NULL AND (%s))', pol.with_check) END;
    v_sql := format('ALTER POLICY %I ON public.iktato_csatolmany', pol.policyname);
    IF v_using IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_using); END IF;
    IF v_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_check); END IF;
    EXECUTE v_sql;
    RAISE NOTICE '✅ őr-burkolva: iktato_csatolmany.%', pol.policyname;
  END LOOP;
END
$burkolas$;

-- ÚJ diocese-láb policy-k — kanonikus, szerep-szűrt függvényekkel; a
-- COALESCE(..., '{}') a fail-closed őr. UPDATE-policy SZÁNDÉKOSAN NINCS
-- (a gyülekezeti ágon sincs — csatolmány-sor nem módosítható).
DROP POLICY IF EXISTS iktato_csatolmany_diocese_select ON public.iktato_csatolmany;
CREATE POLICY iktato_csatolmany_diocese_select
  ON public.iktato_csatolmany FOR SELECT TO authenticated
  USING (
    diocese_id IS NOT NULL
    AND (public.current_user_has_global_access()
         OR diocese_id = ANY (COALESCE((SELECT public.current_user_diocese_olvaso_ids()), '{}'::uuid[])))
  );

DROP POLICY IF EXISTS iktato_csatolmany_diocese_insert ON public.iktato_csatolmany;
CREATE POLICY iktato_csatolmany_diocese_insert
  ON public.iktato_csatolmany FOR INSERT TO authenticated
  WITH CHECK (
    diocese_id IS NOT NULL
    AND (public.current_user_has_global_access()
         OR diocese_id = ANY (COALESCE((SELECT public.current_user_diocese_ids()), '{}'::uuid[])))
  );

DROP POLICY IF EXISTS iktato_csatolmany_diocese_delete ON public.iktato_csatolmany;
CREATE POLICY iktato_csatolmany_diocese_delete
  ON public.iktato_csatolmany FOR DELETE TO authenticated
  USING (
    diocese_id IS NOT NULL
    AND (public.current_user_has_global_access()
         OR diocese_id = ANY (COALESCE((SELECT public.current_user_diocese_ids()), '{}'::uuid[])))
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 1/B) iktato_sequence_pointers — megyei számsor
-- ────────────────────────────────────────────────────────────────────────────
-- A régi PK (congregation_id, year) — PK-oszlop nem lehet NULL, ezért a
-- megyei sorokhoz surrogate id-re cserélünk (az iktato_yearly_closures
-- 2026-08-15-ös mintája). ⚠️ A PK-cserével a next_iktato_sequence RPC
-- ON CONFLICT (congregation_id, year) arbitere megszűnne — ezért az RPC-t
-- UGYANEBBEN a tranzakcióban írjuk újra részleges-index arbiterre.

ALTER TABLE public.iktato_sequence_pointers ADD COLUMN IF NOT EXISTS diocese_id uuid;
ALTER TABLE public.iktato_sequence_pointers
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

DO $ptr$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'iktato_sequence_pointers_diocese_id_fkey'
      AND conrelid = 'public.iktato_sequence_pointers'::regclass
  ) THEN
    ALTER TABLE public.iktato_sequence_pointers
      ADD CONSTRAINT iktato_sequence_pointers_diocese_id_fkey
      FOREIGN KEY (diocese_id) REFERENCES public.dioceses(id) ON DELETE CASCADE;
  END IF;

  -- PK-csere, CSAK ha még a régi kompozit él.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'iktato_sequence_pointers_pkey'
      AND conrelid = 'public.iktato_sequence_pointers'::regclass
      AND pg_get_constraintdef(oid) LIKE '%congregation_id%'
  ) THEN
    ALTER TABLE public.iktato_sequence_pointers DROP CONSTRAINT iktato_sequence_pointers_pkey;
    ALTER TABLE public.iktato_sequence_pointers
      ADD CONSTRAINT iktato_sequence_pointers_pkey PRIMARY KEY (id);
    RAISE NOTICE '✅ iktato_sequence_pointers PK: (congregation_id, year) → (id).';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='iktato_sequence_pointers'
      AND column_name='congregation_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.iktato_sequence_pointers ALTER COLUMN congregation_id DROP NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'iktato_sequence_pointers_pontosan_egy_scope'
      AND conrelid = 'public.iktato_sequence_pointers'::regclass
  ) THEN
    ALTER TABLE public.iktato_sequence_pointers
      ADD CONSTRAINT iktato_sequence_pointers_pontosan_egy_scope
      CHECK (num_nonnulls(congregation_id, diocese_id) = 1);
  END IF;
END
$ptr$;

-- Scope-onként (gyülekezet ill. megye) évente EGY számláló-sor — a régi
-- kompozit PK szemantikájának megőrzése + az ON CONFLICT arbiterek.
CREATE UNIQUE INDEX IF NOT EXISTS iktato_seq_pointers_cong_year_uidx
  ON public.iktato_sequence_pointers (congregation_id, year)
  WHERE congregation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS iktato_seq_pointers_dio_year_uidx
  ON public.iktato_sequence_pointers (diocese_id, year)
  WHERE diocese_id IS NOT NULL;

COMMENT ON COLUMN public.iktato_sequence_pointers.diocese_id IS
  '2026-08-15 (egyházmegyei szint, S4): a MEGYEI iktatókönyv számláló-sora. Pontosan az egyik scope kitöltött — CHECK őrzi; a kiosztást a next_iktato_sequence_dio RPC végzi.';

-- A GYÜLEKEZETI RPC újraírása: az arbiter mostantól a részleges egyediségi
-- index (a PK-csere után a sima (congregation_id, year) következtetés nem
-- találna egyedi indexet, és MINDEN gyülekezeti iktatás elhasalna).
CREATE OR REPLACE FUNCTION public.next_iktato_sequence(
  p_congregation_id uuid,
  p_year integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next integer;
BEGIN
  -- Auth check: a hívó user tagja kell legyen a megcélzott gyülekezetnek
  -- (a 2026-05-17-es eredeti kapu, változatlanul).
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.congregation_id = p_congregation_id
  ) THEN
    RAISE EXCEPTION 'Nincs jogosultság ehhez a gyülekezethez (% / %)',
      auth.uid(), p_congregation_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.iktato_sequence_pointers (congregation_id, year, last_sequence)
  VALUES (p_congregation_id, p_year, 1)
  ON CONFLICT (congregation_id, year) WHERE congregation_id IS NOT NULL DO UPDATE
    SET last_sequence = public.iktato_sequence_pointers.last_sequence + 1,
        updated_at = now()
  RETURNING last_sequence INTO v_next;

  RETURN v_next;
END;
$$;

COMMENT ON FUNCTION public.next_iktato_sequence(uuid, integer) IS
  '2026-08-15 (S4): az arbiter a részleges egyediségi index (iktato_seq_pointers_cong_year_uidx) — a surrogate-PK csere után a kompozit PK már nem él. A kapu és a szemantika a 2026-05-17-es eredetivel azonos.';

-- ÚJ: MEGYEI sorszám-kiosztó — a hívó jogosultságát a SZEREP-SZŰRT
-- current_user_diocese_ids()-hez köti (esperes + egyházmegyei admin; a
-- számvevő NINCS benne — az ellenőr nem iktat).
CREATE OR REPLACE FUNCTION public.next_iktato_sequence_dio(
  p_diocese_id uuid,
  p_year integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next integer;
BEGIN
  IF NOT (public.current_user_has_global_access()
          OR p_diocese_id = ANY (COALESCE(public.current_user_diocese_ids(), '{}'::uuid[]))) THEN
    RAISE EXCEPTION 'Nincs jogosultság ehhez az egyházmegyéhez (% / %)',
      auth.uid(), p_diocese_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.iktato_sequence_pointers (diocese_id, year, last_sequence)
  VALUES (p_diocese_id, p_year, 1)
  ON CONFLICT (diocese_id, year) WHERE diocese_id IS NOT NULL DO UPDATE
    SET last_sequence = public.iktato_sequence_pointers.last_sequence + 1,
        updated_at = now()
  RETURNING last_sequence INTO v_next;

  RETURN v_next;
END;
$$;

COMMENT ON FUNCTION public.next_iktato_sequence_dio(uuid, integer) IS
  '2026-08-15 (egyházmegyei szint, S4): atomic per-(megye, év) iktató-sorszám — a gyülekezeti next_iktato_sequence megyei párja, szerep-szűrt kapuval (current_user_diocese_ids).';

GRANT EXECUTE ON FUNCTION public.next_iktato_sequence_dio(uuid, integer) TO authenticated;

-- Backfill: ha (kézi úton) már keletkeztek megyei iktato-sorok, a számláló
-- álljon a MAX-on (idempotens — GREATEST-tel sosem léptet vissza).
INSERT INTO public.iktato_sequence_pointers (diocese_id, year, last_sequence)
SELECT diocese_id, year, MAX(sequence_number)
FROM public.iktato
WHERE diocese_id IS NOT NULL AND deleted = false
GROUP BY diocese_id, year
ON CONFLICT (diocese_id, year) WHERE diocese_id IS NOT NULL DO UPDATE
  SET last_sequence = GREATEST(
    public.iktato_sequence_pointers.last_sequence,
    EXCLUDED.last_sequence
  );

-- Megyei olvasó-policy a pointer-táblára: az előnézet (GREATEST(pointer, MAX))
-- a megyei felületen is a pointert olvassa. A meglévő gyülekezeti SELECT-policy
-- (profiles.congregation_id) NULL congregation_id-re nem illeszkedik, és nincs
-- global-ága — ezért burkolás nélkül, KÜLÖN lábbal bővítünk.
DROP POLICY IF EXISTS iktato_seq_pointers_diocese_select ON public.iktato_sequence_pointers;
CREATE POLICY iktato_seq_pointers_diocese_select
  ON public.iktato_sequence_pointers FOR SELECT TO authenticated
  USING (
    diocese_id IS NOT NULL
    AND (public.current_user_has_global_access()
         OR diocese_id = ANY (COALESCE((SELECT public.current_user_diocese_olvaso_ids()), '{}'::uuid[])))
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 1/C) STORAGE — az 'iktato-csatolmanyok' bucket megyei prefixe
-- ────────────────────────────────────────────────────────────────────────────
-- Megyei objektum-út: {diocese_id}/{iktato_id}/{uuid}-{fájlnév} — az út ELSŐ
-- szegmense a scope-azonosító, PONTOSAN mint a gyülekezeti ágon. A meglévő
-- (F6-os) policy-k a gyülekezet-azonosítóra szűrnek, tehát a megyei utakat
-- nem fedik — ÚJ, különálló lábak jönnek (permisszív policy-k VAGY-olódnak).

-- Feltöltés — csak megyei ÍRÓ (esperes / egyházmegyei admin), csak a saját
-- megye prefixe alá, és CSAK létező, nem törölt, azonos megyéjű iktato-tétel
-- 2. szegmense alá (a gyülekezeti 7a policy út-integritási elve).
DROP POLICY IF EXISTS "iktato_csatolmanyok_dio_insert" ON storage.objects;
CREATE POLICY "iktato_csatolmanyok_dio_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'iktato-csatolmanyok'
    AND (
      public.current_user_has_global_access()
      OR (storage.foldername(name))[1] IN (
           SELECT id::text FROM unnest(COALESCE((SELECT public.current_user_diocese_ids()), '{}'::uuid[])) AS id
         )
    )
    AND EXISTS (
      SELECT 1
      FROM public.iktato i
      WHERE i.id::text = (storage.foldername(name))[2]
        AND i.diocese_id::text = (storage.foldername(name))[1]
        AND i.deleted = false
    )
  );

-- Olvasás — a megyei OLVASÓK (írók + számvevő).
DROP POLICY IF EXISTS "iktato_csatolmanyok_dio_select" ON storage.objects;
CREATE POLICY "iktato_csatolmanyok_dio_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'iktato-csatolmanyok'
    AND (
      public.current_user_has_global_access()
      OR (storage.foldername(name))[1] IN (
           SELECT id::text FROM unnest(COALESCE((SELECT public.current_user_diocese_olvaso_ids()), '{}'::uuid[])) AS id
         )
    )
    -- Csak megyei prefixű út — a gyülekezeti utakat a meglévô policy-k fedik.
    AND EXISTS (SELECT 1 FROM public.dioceses d WHERE d.id::text = (storage.foldername(name))[1])
  );

-- Törlés — csak megyei írók (az árva-takarítás elve miatt itt sincs
-- 2. szegmens-kötés, a gyülekezeti 7c mintája szerint).
DROP POLICY IF EXISTS "iktato_csatolmanyok_dio_delete" ON storage.objects;
CREATE POLICY "iktato_csatolmanyok_dio_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'iktato-csatolmanyok'
    AND (
      public.current_user_has_global_access()
      OR (storage.foldername(name))[1] IN (
           SELECT id::text FROM unnest(COALESCE((SELECT public.current_user_diocese_ids()), '{}'::uuid[])) AS id
         )
    )
    AND EXISTS (SELECT 1 FROM public.dioceses d WHERE d.id::text = (storage.foldername(name))[1])
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 1/D) dioceses — esperesi hivatali pecsét + aláírás kép
-- ────────────────────────────────────────────────────────────────────────────
-- A gyülekezeti 24. pont (2026-08-15-iktato-pecset-alairas.sql) megyei párja.
-- A kép a 'dioceses-logos' public bucket {diocese_id}/… útján él (a címer
-- bevált mintája) — itt csak az URL-oszlopok kellenek. Az írást a meglévő
-- dioceses-RLS + a requireDioceseAccess app-kapu védi (uploadDioceseIratKep).

ALTER TABLE public.dioceses ADD COLUMN IF NOT EXISTS pecset_url  text;
ALTER TABLE public.dioceses ADD COLUMN IF NOT EXISTS alairas_url text;

COMMENT ON COLUMN public.dioceses.pecset_url IS
  '2026-08-15 (egyházmegyei szint, S4): az esperesi hivatal KEREK PECSÉTJÉNEK képe (PNG/WEBP, átlátszó háttér) — a megyei iktató nyomtatványaira kerül. Legea 489/2006 Art. 15: a pecséten a hivatalos elnevezés kötelező.';
COMMENT ON COLUMN public.dioceses.alairas_url IS
  '2026-08-15 (egyházmegyei szint, S4): az esperes ALÁÍRÁSÁNAK képe (PNG/WEBP, átlátszó háttér) — a megyei iktató nyomtatványaira kerül.';

-- ────────────────────────────────────────────────────────────────────────────
-- 1/E) MENTÉS — a megyei sorok útja a GLOBÁLIS mentés-fájlba
-- ────────────────────────────────────────────────────────────────────────────
-- A scope-oszlopos táblák MEGYEI sorai (congregation_id IS NULL) a
-- gyülekezeti szűrőn (t.congregation_id = $1) kívül esnek — eddig EGYIK
-- mentés-fájlba sem kerültek (a scope-oszlopok SQL 1/E figyelmeztetése).
-- A megoldás a MEGLÉVŐ precedens követése: a diocese_* pénzügyi táblák eleve
-- a 'globalis' fájlban mentődnek — mostantól a scope-oszlopos táblák megyei
-- sorai IS oda kerülnek, a globalis_predikatum szűrővel. Az app-tükör:
-- apps/web/lib/backup/inventory.ts (orderTablesForDump + dioceseFedetlen).

ALTER TABLE public.backup_table_policy
  ADD COLUMN IF NOT EXISTS globalis_predikatum text;

COMMENT ON COLUMN public.backup_table_policy.globalis_predikatum IS
  '2026-08-15 (egyházmegyei szint): ha kitöltött, a gyülekezeti hatókörű tábla EZEN szűrő szerinti sorai (tipikusan a megyei sorok: t.congregation_id IS NULL) a GLOBÁLIS mentés-fájlba IS bekerülnek. A backup_scope_where és az app (lib/backup/inventory.ts) közös forrása.';

UPDATE public.backup_table_policy
SET globalis_predikatum = 't.congregation_id IS NULL',
    megjegyzes = COALESCE(megjegyzes || ' | ', '')
      || '✅ 2026-08-15 S4: a MEGYEI sorok (congregation_id IS NULL) a GLOBÁLIS mentés-fájlba kerülnek (globalis_predikatum).'
WHERE tabla IN ('leltar_tetelek','iktato','iktato_sablonok','iktato_yearly_closures',
                'iktato_csatolmany','iktato_sequence_pointers')
  AND hatokor = 'gyulekezet'
  AND COALESCE(globalis_predikatum, '') = '';

-- A hatókör-szűrő EGYETLEN igazság-forrásának bővítése: globális hatókörben a
-- gyülekezeti tábla is részt vehet, HA van globalis_predikatum-a.
CREATE OR REPLACE FUNCTION public.backup_scope_where(p_tabla text, p_globalis boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE v_p public.backup_table_policy;
BEGIN
  SELECT * INTO v_p FROM public.backup_table_policy WHERE tabla = p_tabla;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BESOROLATLAN TÁBLA: %. Vedd fel a backup_table_policy-be, mielőtt a mentés futna.', p_tabla;
  END IF;
  IF p_globalis THEN
    -- 2026-08-15 (egyházmegyei szint): a scope-oszlopos GYÜLEKEZETI táblák
    -- MEGYEI sorai a globális fájlba mennek — a saját szűrőjükkel. A
    -- `($1 IS NULL)` tag itt is kell: a hívók USING p_congregation_id-vel
    -- futtatják az EXECUTE-ot, és paraméter-hivatkozás nélkül hibát dobnának.
    IF v_p.hatokor = 'gyulekezet'
       AND COALESCE(btrim(v_p.globalis_predikatum), '') <> '' THEN
      RETURN format('($1 IS NULL) AND (%s)', v_p.globalis_predikatum);
    END IF;
    IF v_p.hatokor <> 'globalis' THEN
      RAISE EXCEPTION 'A(z) % tábla NEM globális hatókörű (%).', p_tabla, v_p.hatokor;
    END IF;
    RETURN '($1 IS NULL)';
  END IF;
  IF v_p.hatokor <> 'gyulekezet' THEN
    RAISE EXCEPTION 'A(z) % tábla NEM gyülekezeti hatókörű (%).', p_tabla, v_p.hatokor;
  END IF;
  RETURN COALESCE(v_p.join_predikatum, 't.congregation_id = $1');
END;
$$;

COMMENT ON FUNCTION public.backup_scope_where(text, boolean) IS
  '2026-08-15: a mentés/visszaállítás EGYETLEN hatókör-szűrője. Globális hatókörben a gyülekezeti táblák MEGYEI sorai is részt vehetnek (globalis_predikatum) — az app-tükör a lib/backup/inventory.ts. Besorolatlan táblára HIBÁT dob.';

-- A tábla-leltár RPC bővítése a globalis_predikatum oszloppal. A RETURNS
-- TABLE változása miatt DROP + CREATE — és a GRANT-okat ÚJRA ki kell adni
-- (a DROP elvitte őket), különben a mentés 42501-gyel állna le.
DROP FUNCTION IF EXISTS public.backup_live_tables();

CREATE OR REPLACE FUNCTION public.backup_live_tables()
RETURNS TABLE (
  tabla               text,
  van_congregation_id boolean,
  hatokor             text,
  reteg               smallint,
  visszaallithato     boolean,
  join_predikatum     text,
  globalis_predikatum text,
  identity_always     text[],
  pk_oszlopok         text[],
  oszlopok            text[]
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    t.table_name::text,
    EXISTS (SELECT 1 FROM information_schema.columns c
            WHERE c.table_schema = 'public' AND c.table_name = t.table_name
              AND c.column_name = 'congregation_id'),
    p.hatokor,
    p.reteg,
    COALESCE(p.visszaallithato, false),
    p.join_predikatum,
    p.globalis_predikatum,
    COALESCE((SELECT array_agg(c.column_name::text ORDER BY c.ordinal_position)
              FROM information_schema.columns c
              WHERE c.table_schema = 'public' AND c.table_name = t.table_name
                AND c.is_identity = 'YES' AND c.identity_generation = 'ALWAYS'), '{}'::text[]),
    COALESCE((SELECT array_agg(a.attname::text ORDER BY k.ord)
              FROM pg_constraint con
              JOIN LATERAL unnest(con.conkey) WITH ORDINALITY k(attnum, ord) ON true
              JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
              WHERE con.conrelid = ('public.' || quote_ident(t.table_name))::regclass
                AND con.contype = 'p'), '{}'::text[]),
    COALESCE((SELECT array_agg(c.column_name::text ORDER BY c.ordinal_position)
              FROM information_schema.columns c
              WHERE c.table_schema = 'public' AND c.table_name = t.table_name), '{}'::text[])
  FROM information_schema.tables t
  LEFT JOIN public.backup_table_policy p ON p.tabla = t.table_name
  WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
  ORDER BY 1;
$$;

COMMENT ON FUNCTION public.backup_live_tables() IS
  '2026-08-15: az ÉLŐ tábla-lista a besorolással összefésülve, a globalis_predikatum oszloppal bővítve (megyei sorok mentés-útja). Ha bármely sorban hatokor IS NULL, a mentés HANGOS HIBÁVAL elhasal.';

-- ⚠️ GRANT-ok újra (a DROP FUNCTION elvitte őket) — a mentést KIZÁRÓLAG a
-- service_role hívhatja, mint eddig.
REVOKE ALL ON FUNCTION public.backup_live_tables() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_live_tables() TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT. Az eredményt küldd vissza.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 100 AS sorszam, '2 · CSATOLMÁNY' AS szakasz,
       'diocese_id + nullable congregation_id + scope-CHECK + megyei kompozit FK? (várt: mind ✅)' AS mit,
       (SELECT CASE WHEN c2.column_name IS NOT NULL THEN '✅ diocese_id' ELSE '⛔ nincs diocese_id' END
               || CASE WHEN c1.is_nullable = 'YES' THEN ' · ✅ nullable' ELSE ' · ⛔ NOT NULL maradt' END
        FROM information_schema.columns c1
        LEFT JOIN information_schema.columns c2
          ON c2.table_schema='public' AND c2.table_name='iktato_csatolmany' AND c2.column_name='diocese_id'
        WHERE c1.table_schema='public' AND c1.table_name='iktato_csatolmany'
          AND c1.column_name='congregation_id')
       || CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname='iktato_csatolmany_pontosan_egy_scope')
               THEN ' · ✅ CHECK' ELSE ' · ⛔ nincs CHECK' END
       || CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname='iktato_csatolmany_iktato_dio_fkey')
               THEN ' · ✅ dio-FK' ELSE ' · ⛔ nincs dio-FK' END AS ertek,
       'Az 1/A szakasz eredménye.' AS teendo

UNION ALL
SELECT 101, '2 · CSATOLMÁNY RLS',
       'Megyei lábak (select/insert/delete) + őr nélküli gyülekezeti policy (várt: 3 · 0)',
       (SELECT count(*)::text FROM pg_policies
        WHERE schemaname='public' AND tablename='iktato_csatolmany'
          AND policyname LIKE '%diocese%')
       || ' megyei láb · '
       || (SELECT count(*)::text FROM pg_policies p
           WHERE p.schemaname='public' AND p.tablename='iktato_csatolmany'
             AND p.policyname NOT LIKE '%diocese%'
             AND (COALESCE(p.qual,'') || ' ' || COALESCE(p.with_check,''))
                 NOT LIKE '%congregation_id IS NOT NULL%')
       || ' őr nélküli',
       'Ha nem 3 · 0: az 1/A RLS-része hiányos.'

UNION ALL
SELECT 102, '2 · SZÁMLÁLÓ',
       'PK=id + scope-CHECK + két részleges egyediségi index (várt: PK id · 2 index)',
       COALESCE((SELECT 'PK: ' || pg_get_constraintdef(oid) FROM pg_constraint
                 WHERE conname='iktato_sequence_pointers_pkey'
                   AND conrelid='public.iktato_sequence_pointers'::regclass), 'nincs PK')
       || ' · ' ||
       (SELECT count(*)::text || ' index' FROM pg_indexes
        WHERE schemaname='public' AND tablename='iktato_sequence_pointers'
          AND indexname IN ('iktato_seq_pointers_cong_year_uidx','iktato_seq_pointers_dio_year_uidx')),
       'Ha a PK még kompozit: az 1/B nem futott le.'

UNION ALL
SELECT 103, '2 · RPC-K',
       'next_iktato_sequence (újraírt) + next_iktato_sequence_dio + EXECUTE-grant',
       CASE WHEN to_regprocedure('public.next_iktato_sequence(uuid, integer)') IS NOT NULL
            THEN '✅ cong' ELSE '⛔ nincs cong' END
       || CASE WHEN to_regprocedure('public.next_iktato_sequence_dio(uuid, integer)') IS NOT NULL
               THEN ' · ✅ dio' ELSE ' · ⛔ nincs dio' END
       || CASE WHEN to_regprocedure('public.next_iktato_sequence_dio(uuid, integer)') IS NOT NULL
                AND has_function_privilege('authenticated', 'public.next_iktato_sequence_dio(uuid, integer)'::regprocedure, 'EXECUTE')
               THEN ' · ✅ grant' ELSE ' · ⛔ nincs grant' END,
       '⛔ grant nélkül a megyei iktatás 42501-gyel bukna.'

UNION ALL
SELECT 104, '2 · STORAGE',
       'Az iktato-csatolmanyok bucket megyei policy-jai (várt: 3)',
       (SELECT count(*)::text || ' / 3' FROM pg_policies
        WHERE schemaname='storage' AND tablename='objects'
          AND policyname IN ('iktato_csatolmanyok_dio_insert',
                             'iktato_csatolmanyok_dio_select',
                             'iktato_csatolmanyok_dio_delete')),
       'Ha nem 3: az 1/C szakasz hiányos.'

UNION ALL
SELECT 105, '2 · PECSÉT/ALÁÍRÁS',
       'dioceses.pecset_url + alairas_url (várt: 2)',
       (SELECT count(*)::text || ' / 2' FROM information_schema.columns
        WHERE table_schema='public' AND table_name='dioceses'
          AND column_name IN ('pecset_url','alairas_url')),
       'Az 1/D szakasz eredménye.'

UNION ALL
SELECT 106, '2 · MENTÉS-ÚT',
       'Hány scope-oszlopos tábla kapott globalis_predikatum-ot? (várt: a besoroltak száma, tipikusan 6)',
       (SELECT count(*)::text FROM public.backup_table_policy
        WHERE tabla IN ('leltar_tetelek','iktato','iktato_sablonok','iktato_yearly_closures',
                        'iktato_csatolmany','iktato_sequence_pointers')
          AND COALESCE(btrim(globalis_predikatum), '') <> ''),
       'Ha kevesebb: nézd meg, melyik tábla hiányzik a backup_table_policy-ból (0/F sorai).'

UNION ALL
SELECT 107, '2 · MENTÉS-SZŰRŐ PRÓBA',
       'backup_scope_where(leltar_tetelek, globális) — a megyei sorok szűrője',
       COALESCE((SELECT public.backup_scope_where('leltar_tetelek', true)), 'HIBA'),
       'Várt: ($1 IS NULL) AND (t.congregation_id IS NULL).'

UNION ALL
SELECT 108, '2 · MENTÉS-RPC GRANT',
       'backup_live_tables: CSAK a service_role hívhatja (várt: service ✅ · authenticated ⛔)',
       CASE WHEN has_function_privilege('service_role', 'public.backup_live_tables()'::regprocedure, 'EXECUTE')
            THEN '✅ service' ELSE '⛔ SERVICE-GRANT ELVESZETT — a mentés leállna!' END
       || CASE WHEN has_function_privilege('authenticated', 'public.backup_live_tables()'::regprocedure, 'EXECUTE')
               THEN ' · ⛔ authenticated IS hívhatja' ELSE ' · ✅ authenticated nem' END,
       'A DROP + CREATE után a GRANT-okat az 1/E újra kiadta — ez ellenőrzi.'

ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ FIGYELMEZTETÉSEK A KÖVETKEZŐ SZELETEKNEK (S5 iratok-archívum, S6)        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- 1. document_submissions + esperesi iktatószám (terv 3.3): a
--    `diocese_iktato_id uuid NULL REFERENCES iktato(id)` oszlop az S5 SQL-jének
--    dolga — az iktato-oldali alap (megyei sorok + számsor) EZZEL a fájllal kész.
-- 2. A megyei iratok NYOMTATVÁNYAI a getCongregationHeader diocese-ágából
--    kapják a fejlécet (iktato/szemely-actions.ts) — ha a dioceses törzsadat
--    (cím, CIF) hiányos, a fejléc üres mezőkkel nyomtat; a diocese-setup-wizard
--    kitöltése ajánlott az első megyei nyomtatás előtt.
-- 3. MENTÉS: a megyei sorok mostantól a GLOBÁLIS napi fájlban mentődnek. A
--    VISSZAÁLLÍTÁS globális ága továbbra is runbook (kézi) — a megyei sorok
--    visszatöltése a globális fájlból történik, nem a gyülekezeti fájlokból.
-- 4. Az anyagraktár (materials/material_movements) és az iratcsomó (iratcsomo)
--    SZÁNDÉKOSAN gyülekezeti maradt — megyei igény esetén külön döntés (D9).
