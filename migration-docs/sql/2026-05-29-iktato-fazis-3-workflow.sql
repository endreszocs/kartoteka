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
-- A lezárások csak ahhoz a gyülekezethez tartoznak, amelynek a felhasználó tagja.
-- A meglévő `congregations`-alapú RLS-helper-eket használjuk.
ALTER TABLE public.iktato_yearly_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view yearly closures of their congregation"
  ON public.iktato_yearly_closures;
CREATE POLICY "Users can view yearly closures of their congregation"
  ON public.iktato_yearly_closures
  FOR SELECT
  USING (
    congregation_id IN (
      SELECT pr.congregation_id
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.congregation_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Users can create yearly closures for their congregation"
  ON public.iktato_yearly_closures;
CREATE POLICY "Users can create yearly closures for their congregation"
  ON public.iktato_yearly_closures
  FOR INSERT
  WITH CHECK (
    congregation_id IN (
      SELECT pr.congregation_id
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.congregation_id IS NOT NULL
        AND pr.role IN ('admin', 'pastor', 'master')
    )
  );

-- DELETE-et szándékosan nem engedünk a lezárásnak — egy egyszer lezárt év
-- csak admin/master beavatkozással bontható fel (god mode / kézi DB-műveletek).

-- ─── 4. Verifikáció ──────────────────────────────────────────────────────
SELECT
  'iktato.has_duplicate' AS check,
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
  'iktato_yearly_closures' AS check,
  column_name,
  data_type,
  is_nullable,
  column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'iktato_yearly_closures'
 ORDER BY check, column_name;

COMMIT;
