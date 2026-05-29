-- 2026-05-29 — Iktató Fázis 3: Workflow (évvégi lezárás + másodpéldány-flag)
--
-- Kontextus: A Fázis 1+2 (2026-05-28) bevezette az EREK 2024-es ügykörjegyzéket,
-- a 9 rovatos iktatókönyv-mezőket + az iktatópecsétet. A Fázis 3 lezárja a
-- workflow-t a következőkkel:
--
-- 1. ÉVVÉGI LEZÁRÁS — egy adott évre vonatkozó iktatás tényleges lezárása.
--    Külön táblába kerül (`iktato_yearly_closures`), nem a `iktato` rekordon —
--    a lezárt rekordokat egy JOIN deríti ki. Lezárt évre nem lehet új bejegyzést
--    létrehozni, és a meglévőket sem szerkeszteni.
--
-- 2. MÁSODPÉLDÁNY-FLAG — boolean oszlop az `iktato` rekordon. Jelzi, hogy a
--    bejegyzéshez tartozik-e külön elraktározott másodpéldány (pl. a kimenő
--    irat hivatali archív példánya). UI-checkbox + iktatókönyv-print megjelölés.
--
-- 3. HIVATALI ÚT VALIDÁCIÓ — pure-logic, nem igényel DB-séma módosítást
--    (a `lib/constants/filing-ugykorjegyzek.ts` ügykör-szintű scope-metadatákkal
--    bővül, az `saveFilingEntry` warning-okat ad át).
--
-- Idempotens (ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS), biztonságos
-- ismételt futtatás.

BEGIN;

-- ─── 1. Másodpéldány-flag az iktato táblán ───────────────────────────────
ALTER TABLE public.iktato
  ADD COLUMN IF NOT EXISTS has_duplicate boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.iktato.has_duplicate IS
  '2026-05-29: másodpéldány jelzés. true = az iratnak van külön archivált másodpéldánya (pl. a hivatali aláírt kópia). Megjelenik az iktatókönyv-printeken.';

-- ─── 2. Évvégi lezárások táblája ─────────────────────────────────────────
-- Egy (congregation_id, year) párra max. 1 lezárás. A `closed_at`-tel kapja meg
-- a lezárás időpontját. A `closed_by_profile_id` audit célból tárolja, ki zárta.
CREATE TABLE IF NOT EXISTS public.iktato_yearly_closures (
  congregation_id uuid NOT NULL,
  year integer NOT NULL,
  closed_at timestamp with time zone NOT NULL DEFAULT now(),
  closed_by_profile_id uuid,
  closing_note text,
  total_entries_at_close integer,
  CONSTRAINT iktato_yearly_closures_pkey PRIMARY KEY (congregation_id, year),
  CONSTRAINT iktato_yearly_closures_congregation_id_fkey
    FOREIGN KEY (congregation_id) REFERENCES public.congregations(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.iktato_yearly_closures IS
  '2026-05-29: évvégi iktatókönyv-lezárások. Egy év-gyülekezet páronként 1 sor. A lezárt évre nem lehet új iktatást felvenni, és a meglévőket sem módosítani — a UI ezt a tábla létezésével ellenőrzi.';

-- ─── 3. RLS — gyülekezet-szintű izoláció ─────────────────────────────────
-- A profiles.congregation_id az aktuális gyülekezete a felhasználónak.
-- A profiles.role 'admin' a master/system admin, 'lelkesz' a gyülekezeti lelkész.
-- (A korábbi pr.congregation_id hivatkozás a profile_roles-re hibás volt —
-- a profile_roles-ben scope+scope_id van, nem külön congregation_id.)
ALTER TABLE public.iktato_yearly_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iktato_yearly_closures_select_own
  ON public.iktato_yearly_closures;
CREATE POLICY iktato_yearly_closures_select_own
  ON public.iktato_yearly_closures
  FOR SELECT
  USING (
    congregation_id IN (
      SELECT p.congregation_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS iktato_yearly_closures_insert_own
  ON public.iktato_yearly_closures;
CREATE POLICY iktato_yearly_closures_insert_own
  ON public.iktato_yearly_closures
  FOR INSERT
  WITH CHECK (
    congregation_id IN (
      SELECT p.congregation_id
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('admin', 'lelkesz')
    )
  );

-- DELETE policy NINCS — egy egyszer lezárt év csak service-role (admin/master
-- beavatkozással), pl. god mode-on keresztül vagy kézi DB-műveletekkel
-- bontható fel. A service-role bypass-olja az RLS-t.

GRANT SELECT, INSERT ON public.iktato_yearly_closures TO authenticated;

-- ─── 4. Verifikáció ──────────────────────────────────────────────────────
-- (megj.: az `AS check` nem használható ORDER BY-ban — "check" foglalt szó
-- PostgreSQL-ben. `verify_target` neutral néven szerepel.)
SELECT
  'iktato.has_duplicate' AS verify_target,
  column_name,
  data_type,
  is_nullable,
  column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'iktato'
   AND column_name = 'has_duplicate'
UNION ALL
SELECT
  'iktato_yearly_closures' AS verify_target,
  column_name,
  data_type,
  is_nullable,
  column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'iktato_yearly_closures'
 ORDER BY verify_target, column_name;

COMMIT;
