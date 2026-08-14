-- ==========================================================================
-- 2026-08-15 — 7. pont A szelet: GYÜLEKEZETI DOKUMENTUMTÁR (fájl-terület)
-- ==========================================================================
-- KONTEXTUS (docs/18-PONT-FELMERES-2026-08-14.md 7. pont + Endre döntése):
--   A gyülekezeti fájl-terület a MEGLÉVŐ tárolón (Supabase Storage) él,
--   GYÜLEKEZET-ID-HEZ kötött útvonalakkal. A korábbi Google Drive-os ötletet
--   ez VÁLTJA. SOHA nem név-slugból képzett útvonal (ismert hibaosztály:
--   átnevezés = néma fájlvesztés — 18-PONT-FELMERES 7. pont, 🔴 sor).
--
--   Jogszabályi háttér (docs/ROMAN-SZABVANYOK-KUTATAS-2026-08-14.md 3.4):
--   az ANAF SPV csak 60 napig őrzi a számlákat, a Legea 82/1991 (2023-as
--   módosítás) viszont minimum 5 év (hosszú élettartamú javaknál 10 év)
--   megőrzést ír elő — a dokumentumtár tehát megőrzési archívum, nem
--   kényelmi funkció.
--
--   1. TÁBLA (`gyulekezeti_dokumentum`): a feltöltött fájlok metaadatai.
--      A sor a feltöltéskori állapotot dokumentálja — a metaadat NEM
--      módosítható (nincs rá UPDATE grant), KIVÉVE a Kuka-mintájú
--      soft-delete oszlopokat (deleted / deleted_at / deleted_by_profile_id
--      — oszlop-szintű UPDATE grant). Végleges törlés = storage-objektum +
--      sor törlése (app-oldali, kétlépcsős: előbb Kuka, aztán végleges).
--   2. STORAGE: 'gyulekezeti-dokumentumok' PRIVÁT bucket (25 MB,
--      dokumentum-típusok), objektum-út:
--        {congregation_id}/{kategoria}/{uuid}-{fájlnév}
--      — az út ELSŐ szegmense a congregation_id (erre szűrnek a
--      storage.objects policy-k), a MÁSODIK a fix kategória-készlet egyike.
--   3. KATEGÓRIÁK (fix készlet, DB CHECK + storage-policy is őrzi):
--        szallitoi-szamlak · bizonylatok · szerzodesek · egyeb
--
-- MIKOR KELL FUTTATNI: a dokumentumtár PR merge ELŐTT, a Supabase SQL
-- Editorban. Amíg nem fut le, az app HANGOS magyar hibával jelzi a hiányt
-- (fail-closed, a friendlyDbError erre a fájlra mutat).
--
-- ADATMIGRÁCIÓ: NINCS — új tábla + új bucket, backfill nem kell.
--
-- IDEMPOTENS: CREATE TABLE IF NOT EXISTS + policy DROP IF EXISTS +
--   bucket ON CONFLICT — biztonságos ismételt futtatás.
--
-- FÜGGŐSÉGEK (már élesben vannak):
--   * public.current_user_congregation_id()  (2026-04-12-phase-0-rls-hardening)
--   * public.current_user_has_global_access() (uo.)
--   * public.profile_roles (2026-04-17-profile-roles-fazis-1) — a
--     scope-divergencia elleni RLS-ág használja (ismert hibaosztály:
--     skalár profiles.congregation_id ⇄ effectiveCongregationId széthúzás)
-- ==========================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. gyulekezeti_dokumentum tábla
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gyulekezeti_dokumentum (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  -- Fix kategória-készlet — a storage-út 2. szegmensével bit-azonos.
  kategoria text NOT NULL,
  file_name text NOT NULL,
  -- Objektum-út a 'gyulekezeti-dokumentumok' privát bucketben:
  -- {congregation_id}/{kategoria}/{uuid}-{fájlnév}. Kötelező (metaadat-only
  -- sor itt NINCS, ellentétben az iktato_csatolmany-nyal).
  storage_path text NOT NULL,
  mime_type text,
  meret_bytes bigint,
  megjegyzes text,
  -- Kuka-mintájú soft-delete: a fájl a bucketben MARAD, amíg a végleges
  -- törlés (app-oldali, megerősítéssel) meg nem történik.
  deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  -- Audit: ki törölt / ki töltött fel. Szándékosan FK nélkül (az
  -- iktato_csatolmany.created_by_profile_id mintájára) — profil-törlés ne
  -- blokkolódjon miatta.
  deleted_by_profile_id uuid,
  created_by_profile_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gyulekezeti_dokumentum_pkey PRIMARY KEY (id),
  CONSTRAINT gyulekezeti_dokumentum_congregation_id_fkey
    FOREIGN KEY (congregation_id) REFERENCES public.congregations(id) ON DELETE CASCADE,
  -- A kategória-készlet DB-szinten is zárt — elgépelt/kitalált kategória
  -- hangosan bukik, nem némán tűnik el a listákból (fail-closed).
  CONSTRAINT gyulekezeti_dokumentum_kategoria_check
    CHECK (kategoria IN ('szallitoi-szamlak', 'bizonylatok', 'szerzodesek', 'egyeb')),
  -- Soft-delete konzisztencia: törölt sorhoz KELL időbélyeg, élőhöz nem lehet.
  CONSTRAINT gyulekezeti_dokumentum_deleted_at_check
    CHECK ((deleted = false AND deleted_at IS NULL) OR (deleted = true AND deleted_at IS NOT NULL))
);

COMMENT ON TABLE public.gyulekezeti_dokumentum IS
  '2026-08-15 (7. pont A): gyülekezeti dokumentumtár metaadat-sorai. A fájl a ''gyulekezeti-dokumentumok'' privát bucketben: {congregation_id}/{kategoria}/{uuid}-{fájlnév}. A sor a feltöltéskori állapotot dokumentálja (metaadat nem módosítható), csak a Kuka-mintájú soft-delete oszlopok írhatók (oszlop-szintű UPDATE grant).';
COMMENT ON COLUMN public.gyulekezeti_dokumentum.kategoria IS
  'Fix készlet: szallitoi-szamlak · bizonylatok · szerzodesek · egyeb — a storage-út 2. szegmensével bit-azonos.';
COMMENT ON COLUMN public.gyulekezeti_dokumentum.storage_path IS
  'Objektum-út a ''gyulekezeti-dokumentumok'' privát bucketben ({congregation_id}/{kategoria}/{uuid}-{fájlnév}). SOHA nem név-slug alapú (átnevezés = néma fájlvesztés hibaosztály).';
COMMENT ON COLUMN public.gyulekezeti_dokumentum.deleted IS
  'true = a Kukában van (a fájl a bucketben marad, visszaállítható). Végleges törlés = storage-objektum + sor törlése az app kétlépcsős folyamatával.';

-- Ugyanaz a storage-objektum csak EGY metaadat-sorhoz tartozhat — dupla
-- regisztráció (elveszett válasz utáni ismételt hívás) esetén az egyik sor
-- törlése a KÖZÖS fájlt is vinné, a másik sor lógó hivatkozás maradna.
CREATE UNIQUE INDEX IF NOT EXISTS gyulekezeti_dokumentum_storage_path_uidx
  ON public.gyulekezeti_dokumentum (storage_path);

-- Lista-lekérdezések: gyülekezet + kategória, csak élő sorok (kategória-kártyák
-- darabszámai + kategória-szűrt lista).
CREATE INDEX IF NOT EXISTS gyulekezeti_dokumentum_cong_kat_elo_idx
  ON public.gyulekezeti_dokumentum (congregation_id, kategoria)
  WHERE deleted = false;

-- Lapozott lista: determinisztikus rendezés (created_at, id) gyülekezetenként
-- — a .range() ablakok determinisztikus ORDER BY nélkül átfedhetnek/kihagyhatnak
-- sorokat (K1 Főkönyv-lapozás tanulsága).
CREATE INDEX IF NOT EXISTS gyulekezeti_dokumentum_cong_created_idx
  ON public.gyulekezeti_dokumentum (congregation_id, created_at, id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. GRANT — RLS önmagában nem elég (42501 permission denied nélküle).
--
--    EXPLICIT REVOKE KELL: a 2026-04-23-as m0 hotfix ALTER DEFAULT
--    PRIVILEGES-e MINDEN új public-táblára automatikusan SELECT, INSERT,
--    UPDATE, DELETE jogot ad az authenticated szerepnek — explicit REVOKE
--    nélkül a nem szánt jogok észrevétlenül öröklődnének.
--
--    * TÁBLA-SZINTŰ UPDATE SZÁNDÉKOSAN NINCS — a metaadat a feltöltéskori
--      állapotot dokumentálja (az iktato_csatolmany elve).
--    * OSZLOP-SZINTŰ UPDATE a 3 soft-delete oszlopra: a Kuka-mintájú
--      törlés/visszaállítás CSAK ezeket írhatja — bármely más oszlop
--      UPDATE-je 42501-gyel bukik (fail-closed).
-- ─────────────────────────────────────────────────────────────────────────

REVOKE ALL ON public.gyulekezeti_dokumentum FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.gyulekezeti_dokumentum TO authenticated;
GRANT UPDATE (deleted, deleted_at, deleted_by_profile_id)
  ON public.gyulekezeti_dokumentum TO authenticated;

-- A storage.objects policy-k a public.profile_roles-ból olvasnak (más séma!)
-- — a GRANT enélkül hiányozhatna (2026-08-14: éles leállás volt ebből a
-- hibaosztályból). Idempotens és ártalmatlan: a profile_roles saját RLS-e
-- változatlanul érvényes, a sor-szintű szűrést az végzi.
GRANT SELECT ON public.profile_roles TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS — az iktato_csatolmany mintájára
--    (congregation_id = current_user_congregation_id() OR profile_roles-tagság
--     OR global access — a profile_roles-ág a skalár profiles.congregation_id
--     ⇄ effectiveCongregationId scope-divergencia ellen véd; e nélkül az
--     érintett felhasználó némán 0 sort kapna)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.gyulekezeti_dokumentum ENABLE ROW LEVEL SECURITY;

-- 3a) olvasás — saját gyülekezet
DROP POLICY IF EXISTS gyulekezeti_dokumentum_select_own ON public.gyulekezeti_dokumentum;
CREATE POLICY gyulekezeti_dokumentum_select_own
  ON public.gyulekezeti_dokumentum
  FOR SELECT
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = gyulekezeti_dokumentum.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- 3b) létrehozás — saját gyülekezet
DROP POLICY IF EXISTS gyulekezeti_dokumentum_insert_own ON public.gyulekezeti_dokumentum;
CREATE POLICY gyulekezeti_dokumentum_insert_own
  ON public.gyulekezeti_dokumentum
  FOR INSERT
  TO authenticated
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = gyulekezeti_dokumentum.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- 3c) módosítás — saját gyülekezet (CSAK a soft-delete oszlopok írhatók,
--     de azt a 2. szakasz oszlop-szintű grantje őrzi, nem a policy)
DROP POLICY IF EXISTS gyulekezeti_dokumentum_update_own ON public.gyulekezeti_dokumentum;
CREATE POLICY gyulekezeti_dokumentum_update_own
  ON public.gyulekezeti_dokumentum
  FOR UPDATE
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = gyulekezeti_dokumentum.congregation_id
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
        AND pr.scope_id = gyulekezeti_dokumentum.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- 3d) törlés — saját gyülekezet (a storage-objektum törlése app-oldali
--     felelősség a sor törlése ELŐTT — lásd purgeDokumentum)
DROP POLICY IF EXISTS gyulekezeti_dokumentum_delete_own ON public.gyulekezeti_dokumentum;
CREATE POLICY gyulekezeti_dokumentum_delete_own
  ON public.gyulekezeti_dokumentum
  FOR DELETE
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = gyulekezeti_dokumentum.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 4. STORAGE — 'gyulekezeti-dokumentumok' PRIVÁT bucket
-- ─────────────────────────────────────────────────────────────────────────
-- Objektum-út: {congregation_id}/{kategoria}/{uuid}-{fájlnév}
-- Az út ELSŐ szegmense a congregation_id — erre szűrnek a policy-k:
-- (storage.foldername(name))[1] a fájlnév nélküli út első eleme.
-- A MIME-lista bit-azonos az app-oldali GYDOK_ALLOWED_MIME_TYPES-szal
-- (apps/web/lib/dokumentumtar/dokumentum-types.ts) — ha itt bővítesz,
-- OTT IS bővíts, különben az app hamarabb utasít el, mint a bucket.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gyulekezeti-dokumentumok',
  'gyulekezeti-dokumentumok',
  false,     -- PRIVÁT: csak policy-n/signed URL-en át olvasható
  26214400,  -- 25 MB — dokumentumtár, nem fotótár; a nagy szkennelt PDF is belefér
  ARRAY[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    -- e-Factura archívum (ROMAN-SZABVANYOK 3.3–3.4): XML + ANAF-aláírásos ZIP
    'application/xml', 'text/xml',
    'application/zip', 'application/x-zip-compressed',
    -- irodai dokumentumok
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'text/plain', 'text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 4a) Feltöltés — csak a saját gyülekezet prefixe alá, ÉS csak az ismert
--     kategória-készlet 2. szegmense alá. A 2. szegmens-kötés nélkül bármely
--     tag a saját prefixe alá tetszőleges (az appból láthatatlan) mappákba
--     tölthetne a server actionök megkerülésével. Mellékhatás: a legfeljebb
--     1 mappaszegmensű (szabálytalan) utakat is elutasítja, mert ilyenkor a
--     [2] elem NULL és az IN hamis.
--     (A 4c DELETE-policy-ra a kategória-kötés SZÁNDÉKOSAN nem kerül rá —
--     az árva objektumok takarítását funkcionálisan akadályozná.)
DROP POLICY IF EXISTS "gyulekezeti_dokumentumok_insert_own" ON storage.objects;
CREATE POLICY "gyulekezeti_dokumentumok_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'gyulekezeti-dokumentumok'
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
    -- Út-integritás: a 2. szegmens a zárt kategória-készlet egyike
    -- (a tábla CHECK-jével bit-azonos lista).
    AND (storage.foldername(name))[2] IN ('szallitoi-szamlak', 'bizonylatok', 'szerzodesek', 'egyeb')
  );

-- 4b) Olvasás — csak a saját gyülekezet prefixe alól
DROP POLICY IF EXISTS "gyulekezeti_dokumentumok_select_own" ON storage.objects;
CREATE POLICY "gyulekezeti_dokumentumok_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'gyulekezeti-dokumentumok'
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

-- 4c) Törlés — csak a saját gyülekezet prefixe alól
DROP POLICY IF EXISTS "gyulekezeti_dokumentumok_delete_own" ON storage.objects;
CREATE POLICY "gyulekezeti_dokumentumok_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'gyulekezeti-dokumentumok'
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

-- PostgREST schema cache reload (az új tábla azonnali láthatóságához)
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
   AND table_name = 'gyulekezeti_dokumentum'
UNION ALL
SELECT
  'constraint: ' || conname AS verify_target,
  '✅ ' || pg_get_constraintdef(oid) AS status
  FROM pg_constraint
 WHERE conrelid = 'public.gyulekezeti_dokumentum'::regclass
UNION ALL
SELECT
  'RLS: gyulekezeti_dokumentum' AS verify_target,
  CASE WHEN relrowsecurity THEN '✅ engedélyezve' ELSE '❌ NINCS ENGEDÉLYEZVE' END AS status
  FROM pg_class
 WHERE oid = 'public.gyulekezeti_dokumentum'::regclass
UNION ALL
SELECT
  'policy (public): ' || policyname AS verify_target,
  '✅ cmd=' || cmd AS status
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename = 'gyulekezeti_dokumentum'
UNION ALL
SELECT
  'grant (tábla): authenticated / ' || privilege_type AS verify_target,
  -- Tábla-szintű UPDATE NEM várt — a soft-delete oszlop-szintű grantet kapott.
  CASE WHEN privilege_type = 'UPDATE'
       THEN '❌ TÁBLA-szintű UPDATE grant NEM várt (oszlop-szintű a helyes)!'
       ELSE '✅' END AS status
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name = 'gyulekezeti_dokumentum'
   AND grantee = 'authenticated'
UNION ALL
SELECT
  'grant (oszlop-UPDATE): authenticated / ' || column_name AS verify_target,
  CASE WHEN column_name IN ('deleted', 'deleted_at', 'deleted_by_profile_id')
       THEN '✅ soft-delete oszlop'
       ELSE '❌ NEM várt oszlop-UPDATE grant!' END AS status
  FROM information_schema.role_column_grants
 WHERE table_schema = 'public'
   AND table_name = 'gyulekezeti_dokumentum'
   AND grantee = 'authenticated'
   AND privilege_type = 'UPDATE'
UNION ALL
SELECT
  'index: ' || indexname AS verify_target,
  CASE WHEN indexname LIKE '%uidx'
       THEN CASE WHEN indexdef ILIKE 'CREATE UNIQUE%'
                 THEN '✅ UNIQUE' ELSE '❌ NEM UNIQUE!' END
       ELSE '✅' END AS status
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname IN (
     'gyulekezeti_dokumentum_storage_path_uidx',
     'gyulekezeti_dokumentum_cong_kat_elo_idx',
     'gyulekezeti_dokumentum_cong_created_idx'
   )
UNION ALL
SELECT
  'bucket: gyulekezeti-dokumentumok' AS verify_target,
  CASE WHEN EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'gyulekezeti-dokumentumok'
      AND public = false
      AND file_size_limit = 26214400
  ) THEN '✅ privát, 25 MB' ELSE '❌ HIÁNYZIK vagy eltérő beállítás' END AS status
UNION ALL
SELECT
  'policy (storage): insert — 2. szegmens kategória-kötés' AS verify_target,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'gyulekezeti_dokumentumok_insert_own'
      AND with_check LIKE '%[2]%'
  ) THEN '✅ a 2. szegmens a kategória-készlethez kötve'
    ELSE '❌ HIÁNYZIK a 2. szegmens-kötés' END AS status
UNION ALL
SELECT
  'policy (storage): ' || policyname AS verify_target,
  '✅ cmd=' || cmd AS status
  FROM pg_policies
 WHERE schemaname = 'storage'
   AND tablename = 'objects'
   AND policyname LIKE 'gyulekezeti_dokumentumok_%'
UNION ALL
SELECT
  'grant: profile_roles / authenticated / SELECT' AS verify_target,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'profile_roles'
      AND grantee = 'authenticated' AND privilege_type = 'SELECT'
  ) THEN '✅ a storage-policy profile_roles-ága működőképes'
    ELSE '❌ HIÁNYZIK — a storage-policy profile_roles-ága 42501-et adna' END AS status
ORDER BY verify_target;
