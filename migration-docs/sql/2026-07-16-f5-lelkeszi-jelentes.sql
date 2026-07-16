-- ==========================================================================
-- 2026-07-16 — F5: Lelkészi jelentés (éves hivatalos jelentés) — DB-alap
-- ==========================================================================
-- KONTEXTUS (munkanapló+iktató redesign, F5 fázis):
--   Az éves hivatalos lelkészi jelentés (I–X. fejezet: lélekszám, istentisztelet,
--   gyülekezetgondozás, belmisszió, vallásoktatás, szeretetszolgálat, anyagi
--   helyzet, ingatlanok, események, missziói terv) szerkesztéséhez és
--   véglegesítéséhez kell egy tábla:
--
--   * Az AUTO mezők (élő adatból számoltak) NEM kerülnek ide — azokat az app
--     számolja futásidőben; ide csak a KÉZI mezők (`kezi_adatok`), a kézi
--     FELÜLÍRÁSOK (`felulirasok`, prioritás: felulirasok > auto > kezi) és a
--     határozati adatok (`hatarozat`: iktatószámok, aláírók, presbitériumi +
--     közgyűlési tárgyalás) kerülnek.
--   * VÉGLEGESÍTÉSKOR a teljes kiszámolt adat a `snapshot`-ba fagy
--     (bit-azonos a beküldöttel — a számadás kanonikus-snapshot mintájára,
--     vö. document_submissions.snapshot_data).
--   * A véglegesített sor szerkesztés-védelme APP-OLDALI (a `statusz` mező
--     alapján); a feloldás-kérés flow-hoz `unlock_requested` + `unlock_reason`.
--
-- MIKOR KELL FUTTATNI: az F5 PR merge ELŐTT, a Supabase SQL Editorban.
--
-- ADATMIGRÁCIÓ: NINCS — új tábla, backfill nem kell.
--
-- IDEMPOTENS: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS + CREATE,
--   DROP TRIGGER IF EXISTS + CREATE — biztonságos ismételt futtatás.
--
-- FÜGGŐSÉGEK (már élesben vannak):
--   * public.current_user_congregation_id()  (2026-04-12-phase-0-rls-hardening)
--   * public.current_user_has_global_access() (uo.)
-- ==========================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tábla
-- ─────────────────────────────────────────────────────────────────────────
-- (Az inline CHECK + UNIQUE itt idempotencia-biztos: a CREATE TABLE IF NOT
--  EXISTS a teljes definíciót kihagyja, ha a tábla már létezik.)

CREATE TABLE IF NOT EXISTS public.lelkeszi_jelentes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  ev integer NOT NULL,
  -- Kézi mezők (IV/VI/VIII fejezet + minden nem-auto tétel): {mezoId: érték}
  kezi_adatok jsonb NOT NULL DEFAULT '{}',
  -- Auto-mezők kézi felülírásai: {mezoId: érték} — prioritás: felulirasok > auto > kezi
  felulirasok jsonb NOT NULL DEFAULT '{}',
  -- Határozati adatok (HatarozatAdatok): presbiteri/közgyűlési szám+dátum,
  -- egyházközségi+egyházmegyei iktatószám, lelkipásztor, főgondnok
  hatarozat jsonb NOT NULL DEFAULT '{}',
  statusz text NOT NULL DEFAULT 'szerkesztes'
    CONSTRAINT lelkeszi_jelentes_statusz_check
    CHECK (statusz IN ('szerkesztes', 'veglegesitve')),
  veglegesitve_at timestamptz,
  -- Audit: ki véglegesítette. Szándékosan FK nélkül (az iktato_yearly_closures
  -- closed_by_profile_id mintájára) — profil-törlés ne blokkolódjon miatta.
  veglegesito_profile_id uuid,
  -- A véglegesítéskori TELJES adat (auto+kézi+felülírás+határozat, kiszámolva) —
  -- bit-azonos a beküldöttel/nyomtatottal. NULL, amíg statusz='szerkesztes'.
  snapshot jsonb,
  -- Feloldás-kérés flow: a lelkész kérheti a véglegesített jelentés feloldását
  unlock_requested boolean NOT NULL DEFAULT false,
  unlock_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lelkeszi_jelentes_pkey PRIMARY KEY (id),
  CONSTRAINT lelkeszi_jelentes_congregation_ev_unique UNIQUE (congregation_id, ev),
  CONSTRAINT lelkeszi_jelentes_congregation_id_fkey
    FOREIGN KEY (congregation_id) REFERENCES public.congregations(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.lelkeszi_jelentes IS
  '2026-07-16 F5: éves hivatalos lelkészi jelentés (I–X. fejezet). Gyülekezet-év páronként 1 sor. Az auto-mezőket az app élő adatból számolja; itt a kézi mezők, felülírások, határozati adatok és a véglegesítéskori snapshot tárolódnak. A véglegesített sor szerkesztés-védelme app-oldali (statusz mező), a feloldás az unlock_requested/unlock_reason flow-n át megy.';

COMMENT ON COLUMN public.lelkeszi_jelentes.kezi_adatok IS
  'Kézi mezők értékei {mezoId: érték} formában (pl. IV. Belmisszió, VI. Szeretetszolgálat, VIII. Ingatlanok).';
COMMENT ON COLUMN public.lelkeszi_jelentes.felulirasok IS
  'Auto (élő adatból számolt) mezők kézi felülírásai {mezoId: érték}. Prioritás: felulirasok > auto > kezi.';
COMMENT ON COLUMN public.lelkeszi_jelentes.hatarozat IS
  'Határozati adatok: presbiteri+közgyűlési szám/dátum, egyházközségi+egyházmegyei iktatószám, lelkipásztor, főgondnok.';
COMMENT ON COLUMN public.lelkeszi_jelentes.snapshot IS
  'A véglegesítéskori TELJES kiszámolt jelentés-adat (bit-azonos a beküldöttel). NULL szerkesztés alatt.';
COMMENT ON COLUMN public.lelkeszi_jelentes.unlock_requested IS
  'true = a gyülekezet a véglegesített jelentés feloldását kérte (indoklás: unlock_reason).';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. updated_at trigger (az annual_reports mintájára, search_path-pin a
--    2026-05-17-es konvenció szerint)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lelkeszi_jelentes_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lelkeszi_jelentes_updated_at_trigger ON public.lelkeszi_jelentes;
CREATE TRIGGER lelkeszi_jelentes_updated_at_trigger
  BEFORE UPDATE ON public.lelkeszi_jelentes
  FOR EACH ROW
  EXECUTE FUNCTION public.lelkeszi_jelentes_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. GRANT — RLS önmagában nem elég (42501 permission denied nélküle,
--    vö. 2026-04-17-document-submissions-fix tanulsága).
--    DELETE GRANT SZÁNDÉKOSAN NINCS — lásd a 4. pont DELETE-megjegyzését.
-- ─────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON public.lelkeszi_jelentes TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RLS — a munkanaplo/iktato mintájára
--    (congregation_id = current_user_congregation_id() OR global access)
--
--    DELETE-POLICY SZÁNDÉKOSAN NINCS (és DELETE grant sincs): egy egyszer
--    létrehozott jelentés-sor nem törölhető kliensről — a véglegesítés
--    feloldása az unlock_requested flow-n át megy, törlés csak service-role
--    (admin/master beavatkozás) útján lehetséges. Az RLS default-deny miatt
--    a hiányzó policy = tiltott DELETE.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.lelkeszi_jelentes ENABLE ROW LEVEL SECURITY;

-- 4a) Saját gyülekezet: olvasás
DROP POLICY IF EXISTS lelkeszi_jelentes_select_own ON public.lelkeszi_jelentes;
CREATE POLICY lelkeszi_jelentes_select_own
  ON public.lelkeszi_jelentes
  FOR SELECT
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR current_user_has_global_access()
  );

-- 4b) Saját gyülekezet: létrehozás
DROP POLICY IF EXISTS lelkeszi_jelentes_insert_own ON public.lelkeszi_jelentes;
CREATE POLICY lelkeszi_jelentes_insert_own
  ON public.lelkeszi_jelentes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR current_user_has_global_access()
  );

-- 4c) Saját gyülekezet: szerkesztés.
--     FIGYELEM: a véglegesített (statusz='veglegesitve') sor védelme
--     APP-OLDALI — az UPDATE itt szándékosan NEM szűr statusz-ra, mert az
--     unlock-flow-hoz (unlock_requested/unlock_reason kitöltése) a
--     véglegesített soron is kell UPDATE-jog.
DROP POLICY IF EXISTS lelkeszi_jelentes_update_own ON public.lelkeszi_jelentes;
CREATE POLICY lelkeszi_jelentes_update_own
  ON public.lelkeszi_jelentes
  FOR UPDATE
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR current_user_has_global_access()
  )
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR current_user_has_global_access()
  );

-- 4d) Egyházmegyei olvasás: esperes / egyházmegyei admin a saját egyházmegyéje
--     gyülekezeteinek jelentéseit láthatja (az annual_reports esperes-policy
--     mintájára) — a jelentés címzettje az egyházmegye.
DROP POLICY IF EXISTS lelkeszi_jelentes_select_diocese ON public.lelkeszi_jelentes;
CREATE POLICY lelkeszi_jelentes_select_diocese
  ON public.lelkeszi_jelentes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.congregations c ON c.diocese_id = p.diocese_id
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
        AND p.role IN ('esperes', 'egyhazmegyei_admin', 'admin')
        AND c.id = lelkeszi_jelentes.congregation_id
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 5. document_submissions.document_type — ÚJ típus: 'lelkeszi_jelentes'
--
--    ELLENŐRIZVE (2026-07-16, a 2026-04-12 / 2026-04-17 / 2026-07-10
--    migrációk + a Database_schema.sql dump alapján): a document_type
--    SIMA `text NOT NULL` oszlop, NINCS rajta CHECK constraint — ezért
--    bővítő ALTER NEM SZÜKSÉGES, az app szabadon beszúrhat
--    document_type = 'lelkeszi_jelentes' sort.
--
--    Az alábbi DO-blokk defenzív: ha az éles DB-ben időközben mégis
--    született volna CHECK a document_type-on (séma-divergencia), és az nem
--    engedi a 'lelkeszi_jelentes' értéket, hangos WARNING-ot ad, hogy kézzel
--    kell bővíteni — NEM módosít vakon egy ismeretlen definíciójú constraintet.
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_constraint record;
  v_talalat boolean := false;
BEGIN
  FOR v_constraint IN
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.document_submissions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%document_type%'
  LOOP
    v_talalat := true;
    IF v_constraint.def ILIKE '%lelkeszi_jelentes%' THEN
      RAISE NOTICE 'document_submissions CHECK (%) már tartalmazza a ''lelkeszi_jelentes'' értéket — OK.',
        v_constraint.conname;
    ELSE
      RAISE WARNING 'document_submissions: CHECK constraint van a document_type-on (%: %), és NEM engedi a ''lelkeszi_jelentes'' értéket — KÉZI BŐVÍTÉS KELL (DROP CONSTRAINT + ADD CONSTRAINT a teljes értéklistával)!',
        v_constraint.conname, v_constraint.def;
    END IF;
  END LOOP;

  IF NOT v_talalat THEN
    RAISE NOTICE 'document_submissions.document_type: nincs CHECK constraint — a ''lelkeszi_jelentes'' típus bővítés nélkül használható.';
  END IF;
END $$;

-- Dokumentáció a sémában: az ismert document_type értékek listája
COMMENT ON COLUMN public.document_submissions.document_type IS
  'Ismert értékek: szamadas, koltsegvetes, koltsegvetes_modositas, vagyonleltar, valasztok_nevjegyzeke, lelkeszi_jelentes (2026-07-16 F5 óta). Nincs CHECK constraint — az app-oldali típuslista a mérvadó.';

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFIKÁCIÓ — egyetlen eredmény-halmaz (a SQL Editor csak az utolsó
-- SELECT-et mutatja)
-- ─────────────────────────────────────────────────────────────────────────

SELECT
  'oszlop: lelkeszi_jelentes.' || column_name AS verify_target,
  data_type || ' / nullable=' || is_nullable
    || COALESCE(' / default=' || column_default, '') AS status
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'lelkeszi_jelentes'
UNION ALL
SELECT
  'constraint: ' || conname AS verify_target,
  '✅ ' || pg_get_constraintdef(oid) AS status
  FROM pg_constraint
 WHERE conrelid = 'public.lelkeszi_jelentes'::regclass
UNION ALL
SELECT
  'RLS: lelkeszi_jelentes' AS verify_target,
  CASE WHEN relrowsecurity THEN '✅ engedélyezve' ELSE '❌ NINCS ENGEDÉLYEZVE' END AS status
  FROM pg_class
 WHERE oid = 'public.lelkeszi_jelentes'::regclass
UNION ALL
SELECT
  'policy: ' || policyname AS verify_target,
  '✅ cmd=' || cmd AS status
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename = 'lelkeszi_jelentes'
UNION ALL
SELECT
  'grant: authenticated / ' || privilege_type AS verify_target,
  CASE WHEN privilege_type = 'DELETE'
       THEN '❌ DELETE grant NEM várt (szándékosan nincs)!'
       ELSE '✅' END AS status
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name = 'lelkeszi_jelentes'
   AND grantee = 'authenticated'
UNION ALL
SELECT
  'trigger: lelkeszi_jelentes_updated_at_trigger' AS verify_target,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'lelkeszi_jelentes_updated_at_trigger'
      AND tgrelid = 'public.lelkeszi_jelentes'::regclass
  ) THEN '✅ OK' ELSE '❌ HIÁNYZIK' END AS status
UNION ALL
SELECT
  'document_type CHECK a document_submissions-on' AS verify_target,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.document_submissions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%document_type%'
  ) THEN '⚠️ VAN — nézd meg a DO-blokk WARNING/NOTICE üzenetét!'
    ELSE '✅ nincs (várt állapot) — lelkeszi_jelentes szabadon beszúrható' END AS status
ORDER BY verify_target;

COMMIT;
