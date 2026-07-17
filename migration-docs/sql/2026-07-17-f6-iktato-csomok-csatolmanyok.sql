-- ==========================================================================
-- 2026-07-17 — F6: Iktató iratcsomók + csatolmányok (befotózás) — DB-alap
-- ==========================================================================
-- KONTEXTUS (munkanapló+iktató redesign, F6 fázis):
--   1. IRATCSOMÓ (`iratcsomo`): az iktatott iratok évenkénti fizikai/logikai
--      csomókba (dossziékba) rendezése. Egy iktató-tétel legfeljebb egy
--      csomóhoz tartozhat (`iktato.csomo_id`, NULL = nincs csomóban).
--      A csomó törölhető — ilyenkor a tételek NEM vesznek el, csak a
--      hozzárendelés szűnik meg (FK ON DELETE SET NULL).
--   2. CSATOLMÁNY (`iktato_csatolmany`): az iktató-tételhez befotózott /
--      feltöltött oldalak (kép vagy PDF). A `storage_path` NULL-t is enged:
--      ilyenkor csak metaadat-rögzítés történt (pl. a papír-irat léte
--      dokumentált, de nincs digitalizálva).
--   3. STORAGE: 'iktato-csatolmanyok' PRIVÁT bucket (10 MB,
--      jpeg/png/webp/pdf), objektum-út: {congregation_id}/{iktato_id}/
--      {uuid}-{fájlnév} — az út ELSŐ szegmense a congregation_id, erre
--      szűrnek a storage.objects policy-k.
--
-- MIKOR KELL FUTTATNI: az F6 PR merge ELŐTT, a Supabase SQL Editorban.
--
-- ADATMIGRÁCIÓ: NINCS — új táblák + új (NULL-os) oszlop, backfill nem kell.
--
-- IDEMPOTENS: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS +
--   FK/trigger/policy DROP IF EXISTS vagy DO-blokk + bucket ON CONFLICT —
--   biztonságos ismételt futtatás.
--
-- FÜGGŐSÉGEK (már élesben vannak):
--   * public.current_user_congregation_id()  (2026-04-12-phase-0-rls-hardening)
--   * public.current_user_has_global_access() (uo.)
--   * public.profile_roles (2026-04-17-profile-roles-fazis-1) — a
--     scope-divergencia elleni RLS-ág használja
--   * public.iktato tábla (RLS-e: iktato_access FOR ALL — az új csomo_id
--     oszlopra automatikusan érvényes, ott új policy NEM kell)
-- ==========================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. iratcsomo tábla
-- ─────────────────────────────────────────────────────────────────────────
-- (Az inline UNIQUE/CHECK nélküli, egyszerű definíció; a CREATE TABLE IF NOT
--  EXISTS a teljes definíciót kihagyja, ha a tábla már létezik.)

CREATE TABLE IF NOT EXISTS public.iratcsomo (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  ev integer NOT NULL,
  nev text NOT NULL,
  leiras text,
  -- Lezárt csomóhoz az app nem enged új tételt rendelni (app-oldali védelem)
  lezarva boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iratcsomo_pkey PRIMARY KEY (id),
  CONSTRAINT iratcsomo_congregation_id_fkey
    FOREIGN KEY (congregation_id) REFERENCES public.congregations(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.iratcsomo IS
  '2026-07-17 F6: iktatói iratcsomók (évenkénti dossziék). Az iktató-tételek az iktato.csomo_id-vel hivatkoznak rá; a csomó törlésekor a tételek megmaradnak (csomo_id → NULL). A lezárva flag védelme app-oldali.';
COMMENT ON COLUMN public.iratcsomo.ev IS
  'A csomó éve (az iktatókönyv évfolyamához igazodik).';
COMMENT ON COLUMN public.iratcsomo.lezarva IS
  'true = lezárt csomó — az app nem enged bele új tételt rendezni (app-oldali védelem).';

-- Lista-lekérdezések: gyülekezet + év szerinti szűrés
CREATE INDEX IF NOT EXISTS iratcsomo_congregation_ev_idx
  ON public.iratcsomo (congregation_id, ev);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. iratcsomo updated_at trigger (a lelkeszi_jelentes mintájára,
--    search_path-pin a 2026-05-17-es konvenció szerint)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.iratcsomo_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS iratcsomo_updated_at_trigger ON public.iratcsomo;
CREATE TRIGGER iratcsomo_updated_at_trigger
  BEFORE UPDATE ON public.iratcsomo
  FOR EACH ROW
  EXECUTE FUNCTION public.iratcsomo_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. iktato.csomo_id oszlop + FK
-- ─────────────────────────────────────────────────────────────────────────
-- Az FK külön DO-blokkban, hogy részleges korábbi futtatás után is
-- idempotens legyen (az inline REFERENCES az ADD COLUMN IF NOT EXISTS-szel
-- kimaradna, ha az oszlop már létezik constraint nélkül).

ALTER TABLE public.iktato
  ADD COLUMN IF NOT EXISTS csomo_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'iktato_csomo_id_fkey'
      AND conrelid = 'public.iktato'::regclass
  ) THEN
    ALTER TABLE public.iktato
      ADD CONSTRAINT iktato_csomo_id_fkey
      FOREIGN KEY (csomo_id) REFERENCES public.iratcsomo(id) ON DELETE SET NULL;
    RAISE NOTICE 'iktato_csomo_id_fkey constraint létrehozva.';
  ELSE
    RAISE NOTICE 'iktato_csomo_id_fkey constraint már létezik — kihagyva.';
  END IF;
END $$;

COMMENT ON COLUMN public.iktato.csomo_id IS
  '2026-07-17 F6: a tétel iratcsomója (iratcsomo FK). NULL = nincs csomóba rendezve. A csomó törlésekor NULL-ra áll (ON DELETE SET NULL). RLS: az iktato meglévő policy-jai fedik.';

-- Csomó-nézet: „mely tételek vannak ebben a csomóban?"
CREATE INDEX IF NOT EXISTS iktato_csomo_id_idx
  ON public.iktato (csomo_id)
  WHERE csomo_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. iktato_csatolmany tábla
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.iktato_csatolmany (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  iktato_id uuid NOT NULL,
  -- Denormalizált a gyors RLS-hez/listázáshoz (az iktato sorával egyezik)
  congregation_id uuid NOT NULL,
  -- NULL = csak metaadat-rögzítés (nincs feltöltött fájl a storage-ban)
  storage_path text,
  file_name text NOT NULL,
  mime_type text,
  meret_bytes bigint,
  oldal_sorszam integer NOT NULL DEFAULT 1,
  megjegyzes text,
  -- Audit: ki töltötte fel. Szándékosan FK nélkül (az iktato_yearly_closures
  -- closed_by_profile_id mintájára) — profil-törlés ne blokkolódjon miatta.
  created_by_profile_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iktato_csatolmany_pkey PRIMARY KEY (id),
  CONSTRAINT iktato_csatolmany_iktato_id_fkey
    FOREIGN KEY (iktato_id) REFERENCES public.iktato(id) ON DELETE CASCADE,
  CONSTRAINT iktato_csatolmany_congregation_id_fkey
    FOREIGN KEY (congregation_id) REFERENCES public.congregations(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.iktato_csatolmany IS
  '2026-07-17 F6: iktató-tételhez tartozó csatolmányok (befotózott/feltöltött oldalak). storage_path NULL = csak metaadat-rögzítés. A fájl az ''iktato-csatolmanyok'' privát bucketben: {congregation_id}/{iktato_id}/{uuid}-{fájlnév}.';
COMMENT ON COLUMN public.iktato_csatolmany.storage_path IS
  'Objektum-út az ''iktato-csatolmanyok'' privát bucketben ({congregation_id}/{iktato_id}/{uuid}-{fájlnév}). NULL = csak metaadat-rögzítés, nincs digitalizált fájl.';
COMMENT ON COLUMN public.iktato_csatolmany.oldal_sorszam IS
  'A csatolmány (oldal) sorrendje a tételen belül, 1-től.';
COMMENT ON COLUMN public.iktato_csatolmany.created_by_profile_id IS
  'A feltöltő profilja. Szándékosan FK nélkül — profil-törlés ne blokkolódjon miatta.';

-- Tétel-nézet: „a tétel csatolmányai sorrendben"
CREATE INDEX IF NOT EXISTS iktato_csatolmany_iktato_id_idx
  ON public.iktato_csatolmany (iktato_id, oldal_sorszam);

-- Gyülekezeti szűrés (RLS + admin-listázás)
CREATE INDEX IF NOT EXISTS iktato_csatolmany_congregation_idx
  ON public.iktato_csatolmany (congregation_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. GRANT — RLS önmagában nem elég (42501 permission denied nélküle,
--    vö. 2026-04-17-document-submissions-fix tanulsága).
--
--    EXPLICIT REVOKE KELL: a 2026-04-23-as m0 hotfix
--    (2026-04-23-m0-HOTFIX-grants.sql) óta él egy ALTER DEFAULT PRIVILEGES,
--    amely MINDEN új public-táblára automatikusan SELECT, INSERT, UPDATE,
--    DELETE jogot ad az authenticated szerepnek — az explicit REVOKE nélkül
--    a nem szánt jogok észrevétlenül öröklődnének.
--
--    * iratcsomo: mind a négy művelet engedett (a csomó törölhető).
--    * iktato_csatolmany: UPDATE SZÁNDÉKOSAN NINCS — egy csatolmány-sor
--      nem módosítható, csak törölhető és újra rögzíthető (a metaadat a
--      feltöltéskori állapotot dokumentálja).
-- ─────────────────────────────────────────────────────────────────────────

REVOKE ALL ON public.iratcsomo FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.iratcsomo TO authenticated;

REVOKE ALL ON public.iktato_csatolmany FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.iktato_csatolmany TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RLS — a munkanaplo/iktato/lelkeszi_jelentes mintájára
--    (congregation_id = current_user_congregation_id() OR profile_roles-tagság
--     OR global access — a profile_roles-ág a skalár profiles.congregation_id
--     ⇄ effectiveCongregationId scope-divergencia ellen véd)
--
--    Az iktato.csomo_id-hez NEM kell új policy: az iktato meglévő
--    (iktato_access FOR ALL) policy-ja sor-szinten fedi.
--
--    iktato_csatolmany: UPDATE-policy SZÁNDÉKOSAN NINCS (grant sincs) —
--    az RLS default-deny miatt a hiányzó policy = tiltott UPDATE.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.iratcsomo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iktato_csatolmany ENABLE ROW LEVEL SECURITY;

-- 6a) iratcsomo: olvasás — saját gyülekezet
DROP POLICY IF EXISTS iratcsomo_select_own ON public.iratcsomo;
CREATE POLICY iratcsomo_select_own
  ON public.iratcsomo
  FOR SELECT
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    -- Scope-divergencia védelem (ismert gyökérok-osztály): az app az
    -- effectiveCongregationId-t (profile_roles.scope_id) használja, a skalár
    -- profiles.congregation_id ettől eltérhet — ez az ág nélkül az érintett
    -- felhasználó némán 0 sort kapna/írhatna.
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = iratcsomo.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- 6b) iratcsomo: létrehozás — saját gyülekezet
DROP POLICY IF EXISTS iratcsomo_insert_own ON public.iratcsomo;
CREATE POLICY iratcsomo_insert_own
  ON public.iratcsomo
  FOR INSERT
  TO authenticated
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = iratcsomo.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- 6c) iratcsomo: szerkesztés — saját gyülekezet (átnevezés, leírás, lezárás)
DROP POLICY IF EXISTS iratcsomo_update_own ON public.iratcsomo;
CREATE POLICY iratcsomo_update_own
  ON public.iratcsomo
  FOR UPDATE
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = iratcsomo.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  )
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = iratcsomo.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- 6d) iratcsomo: törlés — saját gyülekezet (a tételek megmaradnak,
--     csomo_id → NULL az FK ON DELETE SET NULL miatt)
DROP POLICY IF EXISTS iratcsomo_delete_own ON public.iratcsomo;
CREATE POLICY iratcsomo_delete_own
  ON public.iratcsomo
  FOR DELETE
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = iratcsomo.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- 6e) iktato_csatolmany: olvasás — saját gyülekezet
DROP POLICY IF EXISTS iktato_csatolmany_select_own ON public.iktato_csatolmany;
CREATE POLICY iktato_csatolmany_select_own
  ON public.iktato_csatolmany
  FOR SELECT
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = iktato_csatolmany.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- 6f) iktato_csatolmany: létrehozás — saját gyülekezet
DROP POLICY IF EXISTS iktato_csatolmany_insert_own ON public.iktato_csatolmany;
CREATE POLICY iktato_csatolmany_insert_own
  ON public.iktato_csatolmany
  FOR INSERT
  TO authenticated
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = iktato_csatolmany.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- 6g) iktato_csatolmany: törlés — saját gyülekezet (a storage-objektum
--     törlése app-oldali felelősség a sor törlése mellé)
DROP POLICY IF EXISTS iktato_csatolmany_delete_own ON public.iktato_csatolmany;
CREATE POLICY iktato_csatolmany_delete_own
  ON public.iktato_csatolmany
  FOR DELETE
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = iktato_csatolmany.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 7. STORAGE — 'iktato-csatolmanyok' PRIVÁT bucket
-- ─────────────────────────────────────────────────────────────────────────
-- Objektum-út: {congregation_id}/{iktato_id}/{uuid}-{fájlnév}
-- Az út ELSŐ szegmense a congregation_id — erre szűrnek a policy-k:
-- (storage.foldername(name))[1] a fájlnév nélküli út első eleme.
-- Olvasás kliensről is engedett (saját gyülekezet), a megjelenítés
-- signed URL-lel történik; a bucket PRIVÁT (public = false).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'iktato-csatolmanyok',
  'iktato-csatolmanyok',
  false,     -- PRIVÁT: csak policy-n/signed URL-en át olvasható
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 7a) Feltöltés — csak a saját gyülekezet prefixe alá
DROP POLICY IF EXISTS "iktato_csatolmanyok_insert_own" ON storage.objects;
CREATE POLICY "iktato_csatolmanyok_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'iktato-csatolmanyok'
    AND (
      (storage.foldername(name))[1] = current_user_congregation_id()::text
      -- Scope-divergencia védelem: profile_roles-tagság a cél-gyülekezetre
      OR EXISTS (
        SELECT 1
        FROM public.profile_roles pr
        WHERE pr.profile_id = (SELECT auth.uid())
          AND pr.scope = 'congregation'
          AND pr.scope_id::text = (storage.foldername(name))[1]
          AND pr.active
          AND pr.approval_status = 'approved'
      )
      OR current_user_has_global_access()
    )
  );

-- 7b) Olvasás — csak a saját gyülekezet prefixe alól
DROP POLICY IF EXISTS "iktato_csatolmanyok_select_own" ON storage.objects;
CREATE POLICY "iktato_csatolmanyok_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'iktato-csatolmanyok'
    AND (
      (storage.foldername(name))[1] = current_user_congregation_id()::text
      OR EXISTS (
        SELECT 1
        FROM public.profile_roles pr
        WHERE pr.profile_id = (SELECT auth.uid())
          AND pr.scope = 'congregation'
          AND pr.scope_id::text = (storage.foldername(name))[1]
          AND pr.active
          AND pr.approval_status = 'approved'
      )
      OR current_user_has_global_access()
    )
  );

-- 7c) Törlés — csak a saját gyülekezet prefixe alól
DROP POLICY IF EXISTS "iktato_csatolmanyok_delete_own" ON storage.objects;
CREATE POLICY "iktato_csatolmanyok_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'iktato-csatolmanyok'
    AND (
      (storage.foldername(name))[1] = current_user_congregation_id()::text
      OR EXISTS (
        SELECT 1
        FROM public.profile_roles pr
        WHERE pr.profile_id = (SELECT auth.uid())
          AND pr.scope = 'congregation'
          AND pr.scope_id::text = (storage.foldername(name))[1]
          AND pr.active
          AND pr.approval_status = 'approved'
      )
      OR current_user_has_global_access()
    )
  );

-- (UPDATE-policy szándékosan nincs a bucketre: feltöltött objektum nem
--  írható felül — törlés + új feltöltés a helyes út.)

COMMIT;

-- PostgREST schema cache reload (az új táblák/oszlop azonnali láthatóságához)
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFIKÁCIÓ — egyetlen eredmény-halmaz (a SQL Editor csak az utolsó
-- SELECT-et mutatja). Minden ✅ kell legyen; ❌ = kézi utánanézés kell.
-- ─────────────────────────────────────────────────────────────────────────

SELECT
  'oszlop: ' || table_name || '.' || column_name AS verify_target,
  data_type || ' / nullable=' || is_nullable
    || COALESCE(' / default=' || column_default, '') AS status
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND (
     table_name IN ('iratcsomo', 'iktato_csatolmany')
     OR (table_name = 'iktato' AND column_name = 'csomo_id')
   )
UNION ALL
SELECT
  'constraint: ' || conname AS verify_target,
  '✅ ' || pg_get_constraintdef(oid) AS status
  FROM pg_constraint
 WHERE conrelid IN (
         'public.iratcsomo'::regclass,
         'public.iktato_csatolmany'::regclass
       )
    OR (conrelid = 'public.iktato'::regclass AND conname = 'iktato_csomo_id_fkey')
UNION ALL
SELECT
  'RLS: ' || relname AS verify_target,
  CASE WHEN relrowsecurity THEN '✅ engedélyezve' ELSE '❌ NINCS ENGEDÉLYEZVE' END AS status
  FROM pg_class
 WHERE oid IN ('public.iratcsomo'::regclass, 'public.iktato_csatolmany'::regclass)
UNION ALL
SELECT
  'policy (public): ' || tablename || ' / ' || policyname AS verify_target,
  '✅ cmd=' || cmd AS status
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('iratcsomo', 'iktato_csatolmany')
UNION ALL
SELECT
  'grant: ' || table_name || ' / authenticated / ' || privilege_type AS verify_target,
  CASE WHEN table_name = 'iktato_csatolmany' AND privilege_type = 'UPDATE'
       THEN '❌ UPDATE grant NEM várt (szándékosan nincs)!'
       ELSE '✅' END AS status
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('iratcsomo', 'iktato_csatolmany')
   AND grantee = 'authenticated'
UNION ALL
SELECT
  'trigger: iratcsomo_updated_at_trigger' AS verify_target,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'iratcsomo_updated_at_trigger'
      AND tgrelid = 'public.iratcsomo'::regclass
  ) THEN '✅ OK' ELSE '❌ HIÁNYZIK' END AS status
UNION ALL
SELECT
  'index: ' || indexname AS verify_target,
  '✅' AS status
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname IN (
     'iratcsomo_congregation_ev_idx',
     'iktato_csomo_id_idx',
     'iktato_csatolmany_iktato_id_idx',
     'iktato_csatolmany_congregation_idx'
   )
UNION ALL
SELECT
  'bucket: iktato-csatolmanyok' AS verify_target,
  CASE WHEN EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'iktato-csatolmanyok'
      AND public = false
      AND file_size_limit = 10485760
  ) THEN '✅ privát, 10 MB' ELSE '❌ HIÁNYZIK vagy eltérő beállítás' END AS status
UNION ALL
SELECT
  'policy (storage): ' || policyname AS verify_target,
  '✅ cmd=' || cmd AS status
  FROM pg_policies
 WHERE schemaname = 'storage'
   AND tablename = 'objects'
   AND policyname LIKE 'iktato_csatolmanyok_%'
ORDER BY verify_target;
