-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EGYHÁZMEGYEI SCOPE-OSZLOPOK — leltár + iktató                 2026-08-15 ║
-- ║ Fájl: migration-docs/sql/2026-08-15-egyhazmegyei-scope-oszlopok.sql      ║
-- ║ (Egyházmegyei szint terv, 1.2 + 1.4 fejezet — az S3/S4 szelet DB-alapja) ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- MIT CSINÁL (docs/EGYHAZMEGYEI-SZINT-TERV-2026-08-15.md, 1.2, D1 döntés):
--   Endre kérése szerint az egyházmegye a MEGLÉVŐ leltár- és iktató-modult
--   használja újra, diocese-ID-hez kötve — NEM külön diocese_* másolat-táblák
--   (az a „második felület a régi implementációt őrzi" hibaosztály melegágya
--   lenne). Ezért a meglévő táblák kapnak egy scope-oszlopot:
--
--   leltar_tetelek, iktato, iktato_sablonok, iktato_yearly_closures:
--     + diocese_id uuid NULL REFERENCES dioceses(id)
--     congregation_id: NOT NULL → NULL-ozható
--     + CHECK (num_nonnulls(congregation_id, diocese_id) = 1)  ← fail-closed őr:
--       sor nem létezhet scope nélkül, és nem lehet „mindkét scope-é" sem.
--
--   Az `iktato_csatolmany` és `iratcsomo` SZÁNDÉKOSAN nem változik: a
--   csatolmány az iktato-sor FK-ján át örökli a scope-ot (a diocese-módú
--   csatolmány-kezelés az S4 szelet SQL-jének dolga — lásd a fájl végi
--   FIGYELMEZTETÉSEK blokkot).
--
-- RLS-TERV (1.4 fejezet):
--   · A MEGLÉVŐ gyülekezeti policy-k mindegyike `congregation_id IS NOT NULL`
--     őrt kap (a meglévő gyülekezeti viselkedés így byte-ra változatlan:
--     congregation-sorra ugyanaz a feltétel fut, diocese-sorra pedig EXPLICIT
--     nem illeszkedik — nem csak a NULL-szemantika véletlenén múlik).
--   · ÚJ, KÜLÖNÁLLÓ diocese-láb policy-k jönnek melléjük, KIZÁRÓLAG a
--     kanonikus szerep-szűrt függvényekkel (soha nem kézzel másolt
--     EXISTS-lánc):
--       írás:   current_user_diocese_ids()        (esperes + egyhazmegyei_admin)
--       olvasás: current_user_diocese_olvaso_ids() (írók + egyházmegyei számvevő)
--     App-tükör: apps/web/lib/auth/level-scope.ts (DIOCESE_WRITE_ROLES /
--     DIOCESE_READ_ROLES) — a két réteg nem húzhat szét.
--
-- TANULSÁGOK, AMIKRE ÉPÜL (memória-hibaosztályok):
--   · „A migration-fájl NEM bizonyíték" → 0. SZAKASZ állapotfelmérés + a
--     módosító szakasz fail-closed őrszemmel áll le, ha az élő DB nem a várt.
--   · „RLS-policy a hívó szerepében fut → GRANT nélkül 403" → a hívott
--     függvényekre explicit GRANT EXECUTE MÉG a policy-létrehozás előtt,
--     ugyanabban a tranzakcióban.
--   · „Skalár hatókör + if(id) filter = néma teljes szivárgás" → minden új
--     policy-ág `COALESCE(..., '{}'::uuid[])`-cel fail-closed.
--
-- ÚJ TÁBLA NEM JÖN LÉTRE. A backup_table_policy besorolás (az oszlop neve:
-- tabla!) nem változik, de a megjegyzes-be bekerül a figyelmeztetés: a
-- diocese-sorok (congregation_id IS NULL) a GYÜLEKEZETI mentés-szűrőn kívül
-- esnek — a mentő-worker diocese-ágát az S3 szeletnek kell megépítenie,
-- MIELŐTT éles megyei adat kerül ezekbe a táblákba.
--
-- FUTTATÁSI SORREND (a Supabase Studio csak az utolsó utasítást mutatja!):
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS. Egyetlen SELECT, semmit nem módosít.
--   2.  1. SZAKASZ — A MIGRÁCIÓ. Egyetlen tranzakció (BEGIN … COMMIT).
--   3.  2. SZAKASZ — ELLENŐRZÉS. Egyetlen SELECT — az eredményt küldd vissza.
--
-- IDEMPOTENS: ADD COLUMN IF NOT EXISTS + DO-őrök + DROP POLICY IF EXISTS —
-- akárhányszor újrafuttatható.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ║ EGYETLEN SELECT. Semmit nem módosít.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '0/A · ELŐFELTÉTEL-FÜGGVÉNYEK' AS szakasz,
       'Létezik-e a 3 kanonikus hatókör-függvény?' AS mit,
       (SELECT count(*)::text || ' / 3' FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('current_user_has_global_access',
                            'current_user_diocese_ids',
                            'current_user_diocese_olvaso_ids')) AS ertek,
       'Ha nem 3: ELŐBB a 2026-08-11-globalis-hozzaferes-szukites.sql és a 2026-08-11-szamvevo-megyei-hozzaferes.sql fusson le. Az 1. szakasz őrszeme enélkül hibával leáll.' AS teendo

-- ── 0/B · A négy tábla oszlop-állapota ──────────────────────────────────────
UNION ALL
SELECT (10 + row_number() OVER (ORDER BY t.tabla))::int, '0/B · OSZLOPOK',
       t.tabla,
       COALESCE((
         SELECT 'congregation_id nullable=' || c1.is_nullable ||
                COALESCE(' · diocese_id MÁR LÉTEZIK (' || c2.data_type || ')', ' · diocese_id még nincs')
         FROM information_schema.columns c1
         LEFT JOIN information_schema.columns c2
           ON c2.table_schema = 'public' AND c2.table_name = t.tabla AND c2.column_name = 'diocese_id'
         WHERE c1.table_schema = 'public' AND c1.table_name = t.tabla
           AND c1.column_name = 'congregation_id'
       ), '⛔ NINCS ILYEN TÁBLA / congregation_id oszlop'),
       'Az 1. szakasz idempotensen pótolja a hiányzókat.'
FROM (VALUES ('leltar_tetelek'), ('iktato'), ('iktato_sablonok'),
             ('iktato_yearly_closures')) AS t(tabla)

-- ── 0/C · Hány sor van congregation_id NÉLKÜL? (0-nak KELL lennie futás előtt)
UNION ALL
SELECT 20, '0/C · ADAT-ELLENŐRZÉS',
       'leltar_tetelek sorok congregation_id nélkül (várt: 0 — a NOT NULL még él)',
       (SELECT count(*)::text FROM public.leltar_tetelek WHERE congregation_id IS NULL),
       'Ha nem 0: már futott (részben) a migráció, vagy kézi beavatkozás történt — nézd meg, kié a sor.'
UNION ALL
SELECT 21, '0/C · ADAT-ELLENŐRZÉS',
       'iktato sorok congregation_id nélkül (várt: 0)',
       (SELECT count(*)::text FROM public.iktato WHERE congregation_id IS NULL),
       'ua.'

-- ── 0/D · A meglévő policy-k, amiket az őr-burkolás érint ───────────────────
UNION ALL
SELECT (30 + row_number() OVER (ORDER BY pol.tablename, pol.policyname))::int,
       '0/D · MEGLÉVŐ POLICY-K',
       pol.tablename || ' / ' || pol.policyname || ' (cmd=' || pol.cmd || ')',
       CASE
         WHEN pol.policyname LIKE '%diocese%' THEN 'diocese-láb (e fájl hozza létre / már élt)'
         WHEN (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,''))
              LIKE '%congregation_id IS NOT NULL%'
           THEN '✅ már őrzött (congregation_id IS NOT NULL)'
         ELSE 'őr nélküli — az 1/C szakasz burkolja'
       END,
       'A burkolás a meglévő feltételt VÁLTOZATLANUL megtartja, csak congregation_id IS NOT NULL alá zárja.'
FROM pg_policies pol
WHERE pol.schemaname = 'public'
  AND pol.tablename IN ('leltar_tetelek','iktato','iktato_sablonok','iktato_yearly_closures')

-- ── 0/E · iktato_yearly_closures kulcs-szerkezete ───────────────────────────
UNION ALL
SELECT 60, '0/E · YEARLY_CLOSURES PK',
       'A PK még a régi (congregation_id, year) kompozit?',
       COALESCE((SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%congregation_id%'
                             THEN 'IGEN — az 1/B szakasz surrogate id-re cseréli'
                             ELSE '✅ már surrogate (id) PK' END
                 FROM pg_constraint
                 WHERE conname = 'iktato_yearly_closures_pkey'
                   AND conrelid = 'public.iktato_yearly_closures'::regclass),
                'nincs PK?!'),
       'PK-oszlop nem lehet NULL — ezért kell a csere, mielőtt a congregation_id NULL-ozható lesz.'

-- ── 0/F · Mentés-besorolás (backup_table_policy — az oszlop neve: tabla) ────
UNION ALL
SELECT (70 + row_number() OVER (ORDER BY t.tabla))::int, '0/F · MENTÉS-BESOROLÁS',
       t.tabla,
       COALESCE((SELECT 'hatokor=' || p.hatokor || ' · reteg=' || COALESCE(p.reteg::text,'-')
                 FROM public.backup_table_policy p WHERE p.tabla = t.tabla),
                '⚠️ besorolatlan (a napi mentés hangosan megállna)'),
       'Az 1/E szakasz a megjegyzes-be írja a diocese-sor mentési figyelmeztetést.'
FROM (VALUES ('leltar_tetelek'), ('iktato'), ('iktato_sablonok'),
             ('iktato_yearly_closures')) AS t(tabla)

-- ── 0/G · GRANT-ok: a policy a HÍVÓ szerepében fut ──────────────────────────
UNION ALL
SELECT (80 + row_number() OVER (ORDER BY f.fn))::int, '0/G · FÜGGVÉNY-GRANT',
       'EXECUTE az authenticated-nek: ' || f.fn,
       CASE WHEN to_regprocedure('public.' || f.fn || '()') IS NULL THEN 'nincs függvény'
            WHEN has_function_privilege('authenticated', ('public.' || f.fn || '()')::regprocedure, 'EXECUTE')
            THEN '✅ van' ELSE '⛔ NINCS — az új policy 42501/403-mal állna le' END,
       'Ha ⛔: az 1. szakasz GRANT-ja pótolja (a policy-létrehozás ELŐTT, ugyanabban a tranzakcióban).'
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
  IF to_regprocedure('public.current_user_has_global_access()') IS NULL
     OR to_regprocedure('public.current_user_diocese_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a current_user_has_global_access() / current_user_diocese_ids() — ELŐBB a 2026-08-11-globalis-hozzaferes-szukites.sql fusson le.';
  END IF;
  IF to_regprocedure('public.current_user_diocese_olvaso_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a current_user_diocese_olvaso_ids() — ELŐBB a 2026-08-11-szamvevo-megyei-hozzaferes.sql fusson le (a számvevő olvasása különben elveszne).';
  END IF;
  IF to_regclass('public.dioceses') IS NULL THEN
    RAISE EXCEPTION '⛔ Nincs public.dioceses tábla — nem ez az adatbázis.';
  END IF;
  -- Az írási hatókör-függvény nem tartalmazhat számvevőt (az ellenőr nem ír).
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_user_diocese_ids'
      AND p.prosrc LIKE '%egyhazmegyei_szamvevo%'
  ) THEN
    RAISE EXCEPTION '⛔ A current_user_diocese_ids() törzse EMLÍTI az egyhazmegyei_szamvevo-t — az írási hatókör sérült, előbb tisztázd.';
  END IF;
END
$orszem$;

-- GRANT-tanulság: a policy a HÍVÓ szerepében fut — EXECUTE nélkül 42501/403.
GRANT EXECUTE ON FUNCTION public.current_user_has_global_access()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_diocese_ids()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_diocese_olvaso_ids() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 1/A) Scope-oszlop a három „egyszerű" táblán
--      (leltar_tetelek, iktato, iktato_sablonok — a PK-juk nem érintett)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.leltar_tetelek  ADD COLUMN IF NOT EXISTS diocese_id uuid;
ALTER TABLE public.iktato          ADD COLUMN IF NOT EXISTS diocese_id uuid;
ALTER TABLE public.iktato_sablonok ADD COLUMN IF NOT EXISTS diocese_id uuid;

-- FK-k külön DO-blokkban (részleges korábbi futtatás után is idempotens).
-- Szándékosan NINCS ON DELETE CASCADE: egy egyházmegye törlése leltárral /
-- iktatókönyvvel a hasában HANGOSAN bukjon el, ne vigye némán az iratokat.
DO $fk$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT t.tabla FROM (VALUES ('leltar_tetelek'), ('iktato'), ('iktato_sablonok')) AS t(tabla)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = r.tabla || '_diocese_id_fkey'
        AND conrelid = ('public.' || r.tabla)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (diocese_id) REFERENCES public.dioceses(id)',
        r.tabla, r.tabla || '_diocese_id_fkey');
      RAISE NOTICE '✅ %_diocese_id_fkey létrehozva.', r.tabla;
    END IF;
  END LOOP;
END
$fk$;

-- congregation_id NULL-ozhatóvá tétele (őrzött — csak ha még NOT NULL).
DO $notnull$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name IN ('leltar_tetelek','iktato','iktato_sablonok')
      AND c.column_name = 'congregation_id' AND c.is_nullable = 'NO'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN congregation_id DROP NOT NULL', r.table_name);
    RAISE NOTICE '✅ %.congregation_id mostantól NULL-ozható.', r.table_name;
  END LOOP;
END
$notnull$;

-- A fail-closed scope-őr: PONTOSAN az egyik scope legyen kitöltve.
-- (A meglévő sorokon congregation_id NOT NULL + diocese_id NULL → mind érvényes,
--  a constraint azonnal validálható.)
DO $check$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT t.tabla FROM (VALUES ('leltar_tetelek'), ('iktato'), ('iktato_sablonok')) AS t(tabla)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = r.tabla || '_pontosan_egy_scope'
        AND conrelid = ('public.' || r.tabla)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (num_nonnulls(congregation_id, diocese_id) = 1)',
        r.tabla, r.tabla || '_pontosan_egy_scope');
      RAISE NOTICE '✅ %_pontosan_egy_scope CHECK létrehozva.', r.tabla;
    END IF;
  END LOOP;
END
$check$;

-- Megyei lista-lekérdezések indexei (részleges — a gyülekezeti sorokat nem hizlalja).
CREATE INDEX IF NOT EXISTS leltar_tetelek_diocese_id_idx
  ON public.leltar_tetelek (diocese_id) WHERE diocese_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS iktato_diocese_id_idx
  ON public.iktato (diocese_id, year) WHERE diocese_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS iktato_sablonok_diocese_id_idx
  ON public.iktato_sablonok (diocese_id) WHERE diocese_id IS NOT NULL;

-- Számozás-egyediség a MEGYEI számsorra — a gyülekezeti párok tükörképei:
--   · leltar_tetelek_cong_leltari_szam_key (2026-08-09) tükre;
--   · iktato_unique_active_cong_year_seq  (2026-05-17) tükre.
-- Megyénként KÜLÖN számsor — a meglévő számozási logika scope-kulcsú
-- szűréssel fut majd rajta (S3/S4), NEM új implementáció.
CREATE UNIQUE INDEX IF NOT EXISTS leltar_tetelek_dio_leltari_szam_key
  ON public.leltar_tetelek (diocese_id, leltari_szam)
  WHERE diocese_id IS NOT NULL
    AND leltari_szam IS NOT NULL
    AND COALESCE(is_deleted, false) = false;

CREATE UNIQUE INDEX IF NOT EXISTS iktato_unique_active_dio_year_seq
  ON public.iktato (diocese_id, year, sequence_number)
  WHERE diocese_id IS NOT NULL AND deleted = false;

-- ────────────────────────────────────────────────────────────────────────────
-- 1/B) iktato_yearly_closures — a kompozit PK cseréje surrogate kulcsra
-- ────────────────────────────────────────────────────────────────────────────
-- A régi PK (congregation_id, year) volt — PK-oszlop nem lehet NULL, tehát a
-- congregation_id addig nem NULL-ozható, amíg benne van a PK-ban. A csere:
--   id uuid PK + két RÉSZLEGES egyediségi index (scope-onként év-egyediség).
-- Az app sima insert-tel és .eq()-szűrőkkel dolgozik (iktato/actions.ts:368,
-- :321, :333) — ON CONFLICT-ot nem használ, ezért a részleges indexek nem
-- törik meg.

ALTER TABLE public.iktato_yearly_closures ADD COLUMN IF NOT EXISTS diocese_id uuid;
ALTER TABLE public.iktato_yearly_closures
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

DO $yc$
BEGIN
  -- FK a diocese-re — a gyülekezeti FK ON DELETE CASCADE párjaként.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'iktato_yearly_closures_diocese_id_fkey'
      AND conrelid = 'public.iktato_yearly_closures'::regclass
  ) THEN
    ALTER TABLE public.iktato_yearly_closures
      ADD CONSTRAINT iktato_yearly_closures_diocese_id_fkey
      FOREIGN KEY (diocese_id) REFERENCES public.dioceses(id) ON DELETE CASCADE;
  END IF;

  -- PK-csere, CSAK ha még a régi kompozit él.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'iktato_yearly_closures_pkey'
      AND conrelid = 'public.iktato_yearly_closures'::regclass
      AND pg_get_constraintdef(oid) LIKE '%congregation_id%'
  ) THEN
    ALTER TABLE public.iktato_yearly_closures DROP CONSTRAINT iktato_yearly_closures_pkey;
    ALTER TABLE public.iktato_yearly_closures
      ADD CONSTRAINT iktato_yearly_closures_pkey PRIMARY KEY (id);
    RAISE NOTICE '✅ iktato_yearly_closures PK: (congregation_id, year) → (id).';
  END IF;

  -- congregation_id NULL-ozhatóvá (a PK-ból már kikerült).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'iktato_yearly_closures'
      AND column_name = 'congregation_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.iktato_yearly_closures ALTER COLUMN congregation_id DROP NOT NULL;
  END IF;

  -- Scope-őr CHECK.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'iktato_yearly_closures_pontosan_egy_scope'
      AND conrelid = 'public.iktato_yearly_closures'::regclass
  ) THEN
    ALTER TABLE public.iktato_yearly_closures
      ADD CONSTRAINT iktato_yearly_closures_pontosan_egy_scope
      CHECK (num_nonnulls(congregation_id, diocese_id) = 1);
  END IF;
END
$yc$;

-- Scope-onként (gyülekezet, ill. megye) évente legfeljebb EGY lezárás —
-- a régi kompozit PK szemantikájának megőrzése mindkét scope-ra.
CREATE UNIQUE INDEX IF NOT EXISTS iktato_yearly_closures_cong_year_uidx
  ON public.iktato_yearly_closures (congregation_id, year)
  WHERE congregation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS iktato_yearly_closures_dio_year_uidx
  ON public.iktato_yearly_closures (diocese_id, year)
  WHERE diocese_id IS NOT NULL;

COMMENT ON COLUMN public.iktato_yearly_closures.diocese_id IS
  '2026-08-15 (egyházmegyei szint, 1.2): a MEGYEI iktatókönyv évzárása. Pontosan az egyik scope (congregation_id VAGY diocese_id) kitöltött — CHECK őrzi.';

-- ────────────────────────────────────────────────────────────────────────────
-- 1/C) A MEGLÉVŐ gyülekezeti policy-k őr-burkolása
-- ────────────────────────────────────────────────────────────────────────────
-- MIÉRT: a gyülekezeti policy-k feltételei (congregation_id = skalár, vagy
-- profile_roles.scope_id = congregation_id) NULL congregation_id-re amúgy sem
-- illeszkednek — de ez a NULL-szemantika VÉLETLENE, nem kimondott szabály.
-- A `current_user_has_global_access()`-ágon viszont a rendszergazda a
-- diocese-sorokat is ezen a policy-n át érné el, összemosva a két hatókört.
-- Az EXPLICIT `congregation_id IS NOT NULL` őr szerkezeti garanciává teszi:
-- gyülekezeti policy KIZÁRÓLAG gyülekezeti sort fedhet. A rendszergazda a
-- diocese-sorokat az új diocese-láb globál-ágán éri el (lentebb).
--
-- A burkolás a MEGLÉVŐ, ÉLŐ feltétel-szöveget változatlanul megtartja
-- (pg_policies.qual / with_check) — így a repó⇄produkció esetleges eltérése
-- sem vész el, és nem írunk felül ismeretlen kézi módosítást.

DO $burkolas$
DECLARE
  pol record;
  v_using text;
  v_check text;
  v_sql   text;
BEGIN
  FOR pol IN
    SELECT p.tablename, p.policyname, p.qual, p.with_check
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename IN ('leltar_tetelek','iktato','iktato_sablonok','iktato_yearly_closures')
      AND p.policyname NOT LIKE '%diocese%'   -- a diocese-lábakat nem burkoljuk
      AND (COALESCE(p.qual,'') || ' ' || COALESCE(p.with_check,''))
          NOT LIKE '%congregation_id IS NOT NULL%'  -- idempotencia
  LOOP
    v_using := CASE WHEN pol.qual IS NULL THEN NULL
                    ELSE format('(%I.congregation_id IS NOT NULL AND (%s))', pol.tablename, pol.qual) END;
    v_check := CASE WHEN pol.with_check IS NULL THEN NULL
                    ELSE format('(%I.congregation_id IS NOT NULL AND (%s))', pol.tablename, pol.with_check) END;

    v_sql := format('ALTER POLICY %I ON public.%I', pol.policyname, pol.tablename);
    IF v_using IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_using); END IF;
    IF v_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_check); END IF;
    EXECUTE v_sql;
    RAISE NOTICE '✅ őr-burkolva: %.%', pol.tablename, pol.policyname;
  END LOOP;
END
$burkolas$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1/D) ÚJ diocese-láb policy-k (kanonikus, szerep-szűrt függvényekkel)
-- ────────────────────────────────────────────────────────────────────────────
-- Alak (a 2026-08-15-egyhazmegyei-rls-szerep-szuro.sql kanonikus mintája):
--   FOR ALL  (írók):  diocese_id IS NOT NULL AND (globál-admin VAGY
--                     diocese_id ∈ current_user_diocese_ids())
--   FOR SELECT (olvasók, számvevővel): diocese_id ∈ current_user_diocese_olvaso_ids()
-- A COALESCE(..., '{}') a fail-closed őr: NULL hatókör → ÜRES lista, soha
-- teljes lista (skalár-hatókör hibaosztály).

DO $dioceselab$
DECLARE
  r record;
  v_all text;
BEGIN
  FOR r IN SELECT t.tabla FROM (VALUES
    ('leltar_tetelek'), ('iktato'), ('iktato_sablonok'), ('iktato_yearly_closures')
  ) AS t(tabla)
  LOOP
    v_all := format(
      '%I.diocese_id IS NOT NULL
       AND (public.current_user_has_global_access()
            OR %I.diocese_id = ANY (COALESCE((SELECT public.current_user_diocese_ids()), ''{}''::uuid[])))',
      r.tabla, r.tabla);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_diocese_all', r.tabla);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      r.tabla || '_diocese_all', r.tabla, v_all, v_all);
    EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L',
      r.tabla || '_diocese_all', r.tabla,
      '2026-08-15 (egyházmegyei szint, 1.4): a MEGYEI sorok (diocese_id IS NOT NULL) teljes hozzáférése — rendszergazda + szerep-szűrt megyei írók (current_user_diocese_ids: esperes/egyhazmegyei_admin). A gyülekezeti sorokat a congregation_id IS NOT NULL őrrel burkolt régi policy-k fedik. App-tükör: apps/web/lib/auth/level-scope.ts.');

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabla || '_diocese_olvaso_select', r.tabla);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (%I.diocese_id IS NOT NULL
                AND %I.diocese_id = ANY (COALESCE((SELECT public.current_user_diocese_olvaso_ids()), ''{}''::uuid[])))',
      r.tabla || '_diocese_olvaso_select', r.tabla, r.tabla, r.tabla);
    EXECUTE format('COMMENT ON POLICY %I ON public.%I IS %L',
      r.tabla || '_diocese_olvaso_select', r.tabla,
      '2026-08-15: a MEGYEI sorok OLVASÁSA az olvasói hatókörnek (írók + egyházmegyei számvevő). Csak SELECT — írási úton egyetlen policy sem hívja az olvasó feloldót.');

    RAISE NOTICE '✅ % — diocese-láb (FOR ALL + olvasó FOR SELECT).', r.tabla;
  END LOOP;
END
$dioceselab$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1/E) Mentés-besorolás figyelmeztetés (backup_table_policy.megjegyzes)
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ A négy tábla 'gyulekezet' hatókörű: a napi mentés gyülekezetenként,
-- congregation_id-szűrővel dumpol. A MEGYEI sorok (congregation_id IS NULL)
-- EGYIK gyülekezeti mentésbe sem esnek bele, és a globális mentésbe sem
-- (a tábla nem 'globalis'). Amíg az S3/S4 szelet meg nem építi a worker
-- diocese-ágát, a megyei sorok MENTETLENEK — ezt itt hangosan dokumentáljuk,
-- hogy ne néma hiány legyen.

UPDATE public.backup_table_policy
SET megjegyzes = COALESCE(megjegyzes || ' | ', '')
  || '⚠️ 2026-08-15 scope-oszlop: a táblában MEGYEI sorok is lehetnek (diocese_id IS NOT NULL, congregation_id IS NULL) — ezek a gyülekezeti szűrőn KÍVÜL esnek, a mentő-worker diocese-ága (S3/S4 szelet) fedi majd le. Amíg az nincs kész, megyei éles adat ne kerüljön ide.'
WHERE tabla IN ('leltar_tetelek','iktato','iktato_sablonok','iktato_yearly_closures')
  AND COALESCE(megjegyzes, '') NOT LIKE '%2026-08-15 scope-oszlop%';

COMMIT;

NOTIFY pgrst, 'reload schema';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT. Az eredményt küldd vissza.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 100 AS sorszam, '2 · OSZLOPOK' AS szakasz,
       'Mind a 4 táblán van diocese_id (uuid) ÉS nullable congregation_id? (4 = rendben)' AS mit,
       (SELECT count(*)::text || ' / 4' FROM information_schema.columns c1
        JOIN information_schema.columns c2
          ON c2.table_schema = c1.table_schema AND c2.table_name = c1.table_name
         AND c2.column_name = 'congregation_id' AND c2.is_nullable = 'YES'
        WHERE c1.table_schema = 'public'
          AND c1.table_name IN ('leltar_tetelek','iktato','iktato_sablonok','iktato_yearly_closures')
          AND c1.column_name = 'diocese_id' AND c1.data_type = 'uuid') AS ertek,
       'Ha nem 4: az 1/A vagy 1/B szakasz nem futott végig.' AS teendo

UNION ALL
SELECT 101, '2 · SCOPE-ŐR CHECK',
       'Mind a 4 táblán él a *_pontosan_egy_scope CHECK? (4 = rendben)',
       (SELECT count(*)::text || ' / 4' FROM pg_constraint
        WHERE conname IN ('leltar_tetelek_pontosan_egy_scope','iktato_pontosan_egy_scope',
                          'iktato_sablonok_pontosan_egy_scope','iktato_yearly_closures_pontosan_egy_scope')),
       'A fail-closed scope-őr — enélkül sor létezhetne scope nélkül.'

UNION ALL
SELECT 102, '2 · POLICY-ŐR',
       '⛔ Maradt-e őr NÉLKÜLI gyülekezeti policy a 4 táblán? (0 = rendben)',
       (SELECT count(*)::text FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename IN ('leltar_tetelek','iktato','iktato_sablonok','iktato_yearly_closures')
          AND p.policyname NOT LIKE '%diocese%'
          AND (COALESCE(p.qual,'') || ' ' || COALESCE(p.with_check,''))
              NOT LIKE '%congregation_id IS NOT NULL%'),
       'Ha nem 0: az 1/C burkolás kihagyott egy policy-t — nézd a NOTICE-okat.'

UNION ALL
SELECT 103, '2 · DIOCESE-LÁB',
       'Mind a 4 táblán él a _diocese_all + _diocese_olvaso_select? (8 = rendben)',
       (SELECT count(*)::text || ' / 8' FROM pg_policies
        WHERE schemaname = 'public'
          AND (policyname LIKE '%\_diocese\_all' ESCAPE '\'
               OR policyname LIKE '%\_diocese\_olvaso\_select' ESCAPE '\')
          AND tablename IN ('leltar_tetelek','iktato','iktato_sablonok','iktato_yearly_closures')),
       'Ha nem 8: az 1/D szakasz hiányos.'

UNION ALL
SELECT 104, '2 · A LEGFONTOSABB KAPU',
       'Hív-e ÍRÁSI (nem SELECT) policy olvasó-feloldót a 4 táblán? (0 = rendben)',
       (SELECT count(*)::text FROM pg_policies pol
        WHERE pol.schemaname = 'public' AND pol.cmd <> 'SELECT'
          AND pol.tablename IN ('leltar_tetelek','iktato','iktato_sablonok','iktato_yearly_closures')
          AND (COALESCE(pol.qual,'') || ' ' || COALESCE(pol.with_check,''))
              LIKE '%current_user_diocese_olvaso_ids%'),
       '⛔ Ha nem 0: az ellenőr írhatná, amit ellenőriz.'

UNION ALL
SELECT 105, '2 · YEARLY_CLOSURES',
       'A PK már surrogate (id), és él a két scope-os év-egyediségi index? (várt: PK=id · 2 index)',
       COALESCE((SELECT 'PK: ' || pg_get_constraintdef(oid) FROM pg_constraint
                 WHERE conname = 'iktato_yearly_closures_pkey'
                   AND conrelid = 'public.iktato_yearly_closures'::regclass), 'nincs PK')
       || ' · ' ||
       (SELECT count(*)::text || ' index' FROM pg_indexes
        WHERE schemaname='public' AND tablename='iktato_yearly_closures'
          AND indexname IN ('iktato_yearly_closures_cong_year_uidx','iktato_yearly_closures_dio_year_uidx')),
       'Ha a PK még kompozit: az 1/B nem futott le.'

UNION ALL
SELECT 106, '2 · SZÁMOZÁS-EGYEDISÉG',
       'Él a megyei leltári-szám és iktató-sorszám egyediségi index? (2 = rendben)',
       (SELECT count(*)::text || ' / 2' FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN ('leltar_tetelek_dio_leltari_szam_key','iktato_unique_active_dio_year_seq')),
       'A megyei számsorok DB-szintű ütközés-védelme.'

UNION ALL
SELECT 107, '2 · MENTÉS-FIGYELMEZTETÉS',
       'Bekerült a diocese-sor mentési figyelmeztetés a besorolásba? (a besorolt táblákon)',
       (SELECT count(*)::text || ' tábla jelölve' FROM public.backup_table_policy
        WHERE tabla IN ('leltar_tetelek','iktato','iktato_sablonok','iktato_yearly_closures')
          AND megjegyzes LIKE '%2026-08-15 scope-oszlop%'),
       'Tájékoztató — a worker diocese-ága az S3/S4 szelet dolga.'

ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ FIGYELMEZTETÉSEK A KÖVETKEZŐ SZELETEKNEK (S3 leltár, S4 iktató)          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- 1. MENTÉS: a megyei sorok (congregation_id IS NULL) a gyülekezeti mentésből
--    KIMARADNAK — a mentő-worker (apps/web/lib/backup/*) diocese-ágát az S3
--    szeletnek kell megépítenie, MIELŐTT éles megyei adat keletkezik.
-- 2. iktato_csatolmany: a kompozit FK-ja (iktato_id, congregation_id) →
--    iktato(id, congregation_id) — MEGYEI iktato-sorhoz (congregation_id NULL)
--    így NEM vehető fel csatolmány. Az S4 szeletnek kell feloldania (pl.
--    congregation_id DROP NOT NULL + diocese_id + tükör-kompozit-FK).
-- 3. iktato_sequence_pointers: PK-ja (congregation_id, year), a
--    next_iktato_sequence RPC profiles.congregation_id-hoz köti a hívót —
--    a megyei számsorhoz az S4 szeletben kell diocese-változat.
-- 4. leltar_tetelek.felelos_szemely_id a szemely táblára mutat — megyei
--    tételnél az RLS a más gyülekezeti személyt elrejti; a megyei felület a
--    felelos_neve szövegmezőt használja.
