-- ==========================================================================
-- 2026-08-15 — 7. pont B szelet: SZÁLLÍTÓI SZÁMLA ADATALAP + kiadás-kapcsolat
-- ==========================================================================
-- KONTEXTUS (docs/18-PONT-FELMERES-2026-08-14.md 7. pont):
--   * „A kifizetetlen számla fogalomnak nincs adatalapja" → új tábla:
--     public.szallitoi_szamla — a befogadott e-Factura számlák metaadatai
--     (szállító, CUI, számlaszám, dátumok, összeg, pénznem, kifizetve-állapot)
--     + hivatkozás a dokumentumtár-beli XML/PDF fájlra.
--   * „Egy számla csak EGY kiadáshoz köthető — a kért szétosztás
--     strukturálisan lehetetlen" → kapcsolótábla:
--     public.szallitoi_szamla_kiadas — egy számla TÖBB kiadáshoz,
--     összeg-résszel (osszeg_resz).
--
--   A sorokat a webes ZIP/UBL-feldolgozó tölti (apps/web/app/(dashboard)/
--   dokumentumtar/szamla-actions.ts): ZIP feltöltés a dokumentumtárba →
--   kibontás → UBL-kinyerés → szallitoi_szamla sorok. Duplikátum-védelem:
--   UNIQUE (congregation_id, anaf_uuid) — ugyanaz a ZIP kétszer feltöltve
--   NEM duplikál, az app jelzi.
--
-- MIKOR KELL FUTTATNI: a B szelet PR merge ELŐTT, a Supabase SQL Editorban.
--   ELŐFELTÉTEL: a 2026-08-15-dokumentumtar-gyulekezeti-fajlok.sql már
--   lefutott (a gyulekezeti_dokumentum táblára FK mutat innen)!
--   Amíg nem fut le, az app HANGOS magyar hibával jelzi a hiányt
--   (fail-closed, a friendlyDbError erre a fájlra mutat).
--
-- ADATMIGRÁCIÓ: NINCS — két új tábla, backfill nem kell.
--
-- IDEMPOTENS: CREATE TABLE IF NOT EXISTS + policy DROP IF EXISTS +
--   ON CONFLICT — biztonságos ismételt futtatás.
--
-- FÜGGŐSÉGEK (már élesben vannak):
--   * public.gyulekezeti_dokumentum (2026-08-15-dokumentumtar-…)
--   * public.kiadas (id INTEGER!) — a kapcsolótábla erre mutat
--   * public.current_user_congregation_id() + current_user_has_global_access()
--   * public.profile_roles — a scope-divergencia elleni RLS-ág
--   * public.backup_table_policy (2026-08-11-biztonsagi-mentes) — besorolás
--     nélkül a napi mentés HANGOSAN megáll, ezért itt sorolunk be.
-- ==========================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. szallitoi_szamla — a befogadott (bejövő) számla adatalapja
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.szallitoi_szamla (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  -- ANAF SPV egyedi azonosító (UBL cbc:UUID, ennek híján a fájlnévből) —
  -- ez a duplikátum-védelem kulcsa.
  anaf_uuid text NOT NULL,
  -- 'szamla' = UBL Invoice, 'jovairo' = UBL CreditNote. Az összeg MINDKETTŐNÉL
  -- pozitívan tárolt — az előjel-értelmezés a megjelenítés dolga.
  tipus text NOT NULL DEFAULT 'szamla',
  szallito_nev text,
  szallito_cui text,
  szamla_szam text,
  kiallitas_datum date,
  fizetesi_hatarido date,
  -- Bruttó végösszeg (UBL PayableAmount) — enélkül a „kifizetetlen számla"
  -- követésnek nincs értelme, ezért NOT NULL (az app hangos hibával utasítja
  -- el az összeg nélküli XML-t, nem szúr be csonka sort).
  osszeg numeric(14, 2) NOT NULL,
  penznem text NOT NULL DEFAULT 'RON',
  -- Kifizetve-állapot — a Kuka-mintájú kétoszlopos konzisztenciával.
  kifizetve boolean NOT NULL DEFAULT false,
  kifizetve_at timestamptz,
  -- A dokumentumtár-beli fájlok (szallitoi-szamlak kategória). SET NULL:
  -- a dokumentum végleges törlése ne vigye magával a számla-adatalapot —
  -- a metaadat (könyvelési nyom) fájl nélkül is érték.
  xml_dokumentum_id uuid,
  pdf_dokumentum_id uuid,
  megjegyzes text,
  -- Szándékosan FK nélkül (a gyulekezeti_dokumentum mintájára) — profil-törlés
  -- ne blokkolódjon miatta.
  created_by_profile_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT szallitoi_szamla_pkey PRIMARY KEY (id),
  CONSTRAINT szallitoi_szamla_congregation_id_fkey
    FOREIGN KEY (congregation_id) REFERENCES public.congregations(id) ON DELETE CASCADE,
  CONSTRAINT szallitoi_szamla_xml_dokumentum_id_fkey
    FOREIGN KEY (xml_dokumentum_id) REFERENCES public.gyulekezeti_dokumentum(id) ON DELETE SET NULL,
  CONSTRAINT szallitoi_szamla_pdf_dokumentum_id_fkey
    FOREIGN KEY (pdf_dokumentum_id) REFERENCES public.gyulekezeti_dokumentum(id) ON DELETE SET NULL,
  -- Duplikátum-védelem: egy ANAF-azonosító gyülekezetenként EGYSZER.
  CONSTRAINT szallitoi_szamla_cong_anaf_uuid_key UNIQUE (congregation_id, anaf_uuid),
  -- A kapcsolótábla összetett FK-jának célpontja (lásd 2. szakasz) — DB-szinten
  -- garantálja, hogy a kapcsolat gyülekezete = a számla gyülekezete.
  CONSTRAINT szallitoi_szamla_id_cong_key UNIQUE (id, congregation_id),
  CONSTRAINT szallitoi_szamla_tipus_check CHECK (tipus IN ('szamla', 'jovairo')),
  CONSTRAINT szallitoi_szamla_anaf_uuid_check CHECK (length(btrim(anaf_uuid)) > 0),
  CONSTRAINT szallitoi_szamla_osszeg_check CHECK (osszeg >= 0),
  CONSTRAINT szallitoi_szamla_penznem_check CHECK (penznem ~ '^[A-Z]{3}$'),
  -- Kifizetve-konzisztencia: kifizetetthez KELL időbélyeg, kifizetetlenhez nem lehet.
  CONSTRAINT szallitoi_szamla_kifizetve_at_check
    CHECK ((kifizetve = false AND kifizetve_at IS NULL) OR (kifizetve = true AND kifizetve_at IS NOT NULL))
);

COMMENT ON TABLE public.szallitoi_szamla IS
  '2026-08-15 (7. pont B): befogadott (szállítói) e-Factura számlák adatalapja. A ZIP/UBL-feldolgozó tölti (dokumentumtar/szamla-actions.ts); a fájl a dokumentumtárban (gyulekezeti_dokumentum, szallitoi-szamlak kategória). Duplikátum-kulcs: (congregation_id, anaf_uuid).';
COMMENT ON COLUMN public.szallitoi_szamla.anaf_uuid IS
  'ANAF SPV egyedi azonosító — UBL cbc:UUID, ennek híján a fájlnévből (első 8+ jegyű szám-futam). A duplikátum-védelem kulcsa.';
COMMENT ON COLUMN public.szallitoi_szamla.osszeg IS
  'Bruttó végösszeg (UBL PayableAmount / TaxInclusiveAmount). Jóváírónál (tipus=jovairo) IS pozitívan tárolt.';
COMMENT ON COLUMN public.szallitoi_szamla.xml_dokumentum_id IS
  'A hiteles e-Factura XML a dokumentumtárban. NULL lehet: a fájl-mentés hibája után az újrafeldolgozás pótolja (ön-gyógyító), a dokumentum végleges törlése pedig SET NULL-lal oldja.';

-- Kifizetetlen-lista (a leggyakoribb nézet): gyülekezet + állapot + határidő.
CREATE INDEX IF NOT EXISTS szallitoi_szamla_cong_kifizetve_idx
  ON public.szallitoi_szamla (congregation_id, kifizetve, fizetesi_hatarido);

-- Lapozott lista: determinisztikus rendezés (K1 Főkönyv-lapozás tanulsága).
CREATE INDEX IF NOT EXISTS szallitoi_szamla_cong_datum_idx
  ON public.szallitoi_szamla (congregation_id, kiallitas_datum, id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. szallitoi_szamla_kiadas — egy számla TÖBB kiadáshoz, összeg-résszel
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.szallitoi_szamla_kiadas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  szamla_id uuid NOT NULL,
  -- ⚠️ A kiadas.id INTEGER (nem uuid) — az oblio_kiadas_match precedense.
  kiadas_id integer NOT NULL,
  -- Denormalizált gyülekezet-azonosító az RLS-hez (join nélküli policy) —
  -- az összetett FK garantálja, hogy MINDIG a számla gyülekezete.
  congregation_id uuid NOT NULL,
  -- A számla összegéből ehhez a kiadáshoz tartozó rész. Az „összeg-részek
  -- összege ≤ számla-összeg" szabályt az app őrzi hangosan (linkSzamlaKiadas)
  -- — DB-szintű aggregáló CHECK Postgresben nem lehetséges.
  osszeg_resz numeric(14, 2) NOT NULL,
  created_by_profile_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT szallitoi_szamla_kiadas_pkey PRIMARY KEY (id),
  CONSTRAINT szallitoi_szamla_kiadas_congregation_id_fkey
    FOREIGN KEY (congregation_id) REFERENCES public.congregations(id) ON DELETE CASCADE,
  -- Összetett FK: a (szamla_id, congregation_id) páros CSAK létező számla
  -- SAJÁT gyülekezetére mutathat — a kapcsolat nem „csúszhat át" másik
  -- gyülekezet számlájára (fail-closed, DB-szinten).
  CONSTRAINT szallitoi_szamla_kiadas_szamla_fkey
    FOREIGN KEY (szamla_id, congregation_id)
    REFERENCES public.szallitoi_szamla(id, congregation_id) ON DELETE CASCADE,
  CONSTRAINT szallitoi_szamla_kiadas_kiadas_id_fkey
    FOREIGN KEY (kiadas_id) REFERENCES public.kiadas(id) ON DELETE CASCADE,
  -- Egy kiadás egy számlához EGYSZER kapcsolható (a rész-összeg módosítható).
  CONSTRAINT szallitoi_szamla_kiadas_szamla_kiadas_key UNIQUE (szamla_id, kiadas_id),
  CONSTRAINT szallitoi_szamla_kiadas_osszeg_resz_check CHECK (osszeg_resz > 0)
);

COMMENT ON TABLE public.szallitoi_szamla_kiadas IS
  '2026-08-15 (7. pont B): számla ↔ kiadás kapcsolótábla összeg-résszel — egy szállítói számla TÖBB kiadáshoz köthető (a felmérés szerint a szétosztás korábban strukturálisan lehetetlen volt). Az összeg-részek összege ≤ számla-összeg szabályt az app őrzi (linkSzamlaKiadas).';
COMMENT ON COLUMN public.szallitoi_szamla_kiadas.osszeg_resz IS
  'A számla összegéből ehhez a kiadáshoz tartozó rész (> 0). A részek összege nem haladhatja meg a számla összegét — app-oldali hangos őr.';

-- Fordított irányú keresés: „ehhez a kiadáshoz mely számlák tartoznak?"
CREATE INDEX IF NOT EXISTS szallitoi_szamla_kiadas_kiadas_idx
  ON public.szallitoi_szamla_kiadas (congregation_id, kiadas_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. GRANT — RLS önmagában nem elég (42501 nélküle), és az ALTER DEFAULT
--    PRIVILEGES (2026-04-23 m0 hotfix) miatt explicit REVOKE is kell.
--
--    * szallitoi_szamla: tábla-szintű UPDATE NINCS — a parse-olt metaadat a
--      feldolgozáskori állapotot dokumentálja. Oszlop-szintű UPDATE CSAK:
--      kifizetve / kifizetve_at (állapot-váltás), fizetesi_hatarido (az
--      XML-ből gyakran hiányzik — kézzel pótolható), megjegyzes,
--      xml_dokumentum_id / pdf_dokumentum_id (az ön-gyógyító fájl-pótláshoz).
--    * szallitoi_szamla_kiadas: oszlop-szintű UPDATE csak az osszeg_resz-re
--      (a szétosztás finomhangolása) — a kapcsolat maga nem „átírható",
--      törlés + új kapcsolás a helyes út.
-- ─────────────────────────────────────────────────────────────────────────

REVOKE ALL ON public.szallitoi_szamla FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.szallitoi_szamla TO authenticated;
GRANT UPDATE (kifizetve, kifizetve_at, fizetesi_hatarido, megjegyzes,
              xml_dokumentum_id, pdf_dokumentum_id)
  ON public.szallitoi_szamla TO authenticated;

REVOKE ALL ON public.szallitoi_szamla_kiadas FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.szallitoi_szamla_kiadas TO authenticated;
GRANT UPDATE (osszeg_resz) ON public.szallitoi_szamla_kiadas TO authenticated;

-- A policy-k a public.profile_roles-ból olvasnak — a GRANT enélkül
-- hiányozhatna (2026-08-14: éles leállás volt ebből a hibaosztályból).
-- Idempotens és ártalmatlan (a profile_roles saját RLS-e él).
GRANT SELECT ON public.profile_roles TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RLS — a gyulekezeti_dokumentum 3-lábú mintája (skalár +
--    profile_roles-tagság + global access; a profile_roles-ág a skalár
--    profiles.congregation_id ⇄ effectiveCongregationId scope-divergencia
--    ellen véd — e nélkül az érintett felhasználó némán 0 sort kapna)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.szallitoi_szamla ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.szallitoi_szamla_kiadas ENABLE ROW LEVEL SECURITY;

-- 4a) szallitoi_szamla
DROP POLICY IF EXISTS szallitoi_szamla_select_own ON public.szallitoi_szamla;
CREATE POLICY szallitoi_szamla_select_own
  ON public.szallitoi_szamla
  FOR SELECT
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = szallitoi_szamla.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

DROP POLICY IF EXISTS szallitoi_szamla_insert_own ON public.szallitoi_szamla;
CREATE POLICY szallitoi_szamla_insert_own
  ON public.szallitoi_szamla
  FOR INSERT
  TO authenticated
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = szallitoi_szamla.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

DROP POLICY IF EXISTS szallitoi_szamla_update_own ON public.szallitoi_szamla;
CREATE POLICY szallitoi_szamla_update_own
  ON public.szallitoi_szamla
  FOR UPDATE
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = szallitoi_szamla.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  )
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = szallitoi_szamla.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

DROP POLICY IF EXISTS szallitoi_szamla_delete_own ON public.szallitoi_szamla;
CREATE POLICY szallitoi_szamla_delete_own
  ON public.szallitoi_szamla
  FOR DELETE
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = szallitoi_szamla.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- 4b) szallitoi_szamla_kiadas
DROP POLICY IF EXISTS szallitoi_szamla_kiadas_select_own ON public.szallitoi_szamla_kiadas;
CREATE POLICY szallitoi_szamla_kiadas_select_own
  ON public.szallitoi_szamla_kiadas
  FOR SELECT
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = szallitoi_szamla_kiadas.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

DROP POLICY IF EXISTS szallitoi_szamla_kiadas_insert_own ON public.szallitoi_szamla_kiadas;
CREATE POLICY szallitoi_szamla_kiadas_insert_own
  ON public.szallitoi_szamla_kiadas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = szallitoi_szamla_kiadas.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

DROP POLICY IF EXISTS szallitoi_szamla_kiadas_update_own ON public.szallitoi_szamla_kiadas;
CREATE POLICY szallitoi_szamla_kiadas_update_own
  ON public.szallitoi_szamla_kiadas
  FOR UPDATE
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = szallitoi_szamla_kiadas.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  )
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = szallitoi_szamla_kiadas.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

DROP POLICY IF EXISTS szallitoi_szamla_kiadas_delete_own ON public.szallitoi_szamla_kiadas;
CREATE POLICY szallitoi_szamla_kiadas_delete_own
  ON public.szallitoi_szamla_kiadas
  FOR DELETE
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = szallitoi_szamla_kiadas.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Mentés-besorolás (fail-closed kapu — besorolatlan táblánál a napi
--    mentés HANGOSAN megáll). Rétegek a visszaállítási sorrendhez:
--    gyulekezeti_dokumentum (5) → szallitoi_szamla (6, FK a dokumentumra) →
--    szallitoi_szamla_kiadas (7, FK a számlára ÉS a kiadas-ra [réteg 5]).
--
--    ⚠️ A gyulekezeti_dokumentum besorolása az A szelet migrációjából
--    KIMARADT — itt pótoljuk (idempotens, ON CONFLICT DO NOTHING).
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.backup_table_policy (tabla, hatokor, reteg, visszaallithato, megjegyzes)
VALUES
  ('gyulekezeti_dokumentum', 'gyulekezet', 5, true,
   '2026-08-15 (7. pont A, pótlólag besorolva a B szeletben): dokumentumtár-metaadat. ⚠️ A storage_path a Supabase Storage-ra mutat — a FÁJL nincs a mentésben (az iktato_csatolmany v1-precedense).'),
  ('szallitoi_szamla', 'gyulekezet', 6, true,
   '2026-08-15 (7. pont B): szállítói számla adatalap. FK a gyulekezeti_dokumentum-ra (réteg 5) → utána kell visszaállítani.'),
  ('szallitoi_szamla_kiadas', 'gyulekezet', 7, true,
   '2026-08-15 (7. pont B): számla↔kiadás kapcsolótábla. FK a szallitoi_szamla-ra (6) és a kiadas-ra (5) → legvégül állítandó vissza.')
ON CONFLICT (tabla) DO NOTHING;

COMMIT;

-- PostgREST schema cache reload (az új táblák azonnali láthatóságához)
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFIKÁCIÓ — egyetlen eredmény-halmaz (a SQL Editor csak az utolsó
-- SELECT-et mutatja). Minden ✅ kell legyen; ❌ = kézi utánanézés kell.
-- ─────────────────────────────────────────────────────────────────────────

SELECT
  'tábla: ' || t.tabla AS verify_target,
  CASE WHEN to_regclass('public.' || t.tabla) IS NOT NULL
       THEN '✅ létezik' ELSE '❌ HIÁNYZIK' END AS status
  FROM (VALUES ('szallitoi_szamla'), ('szallitoi_szamla_kiadas')) AS t(tabla)
UNION ALL
SELECT
  'RLS: ' || c.relname AS verify_target,
  CASE WHEN c.relrowsecurity THEN '✅ engedélyezve' ELSE '❌ NINCS ENGEDÉLYEZVE' END AS status
  FROM pg_class c
 WHERE c.oid IN ('public.szallitoi_szamla'::regclass, 'public.szallitoi_szamla_kiadas'::regclass)
UNION ALL
SELECT
  'policy: ' || tablename || ' / ' || policyname AS verify_target,
  '✅ cmd=' || cmd AS status
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('szallitoi_szamla', 'szallitoi_szamla_kiadas')
UNION ALL
SELECT
  'constraint: ' || conname AS verify_target,
  '✅ ' || left(pg_get_constraintdef(oid), 90) AS status
  FROM pg_constraint
 WHERE conrelid IN ('public.szallitoi_szamla'::regclass, 'public.szallitoi_szamla_kiadas'::regclass)
   AND contype IN ('u', 'f', 'c')
UNION ALL
SELECT
  'grant (tábla): ' || table_name || ' / authenticated / ' || privilege_type AS verify_target,
  CASE WHEN privilege_type = 'UPDATE'
       THEN '❌ TÁBLA-szintű UPDATE grant NEM várt (oszlop-szintű a helyes)!'
       ELSE '✅' END AS status
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('szallitoi_szamla', 'szallitoi_szamla_kiadas')
   AND grantee = 'authenticated'
UNION ALL
SELECT
  'grant (oszlop-UPDATE): ' || table_name || ' / ' || column_name AS verify_target,
  CASE
    WHEN table_name = 'szallitoi_szamla'
     AND column_name IN ('kifizetve', 'kifizetve_at', 'fizetesi_hatarido', 'megjegyzes',
                         'xml_dokumentum_id', 'pdf_dokumentum_id')
      THEN '✅ várt oszlop'
    WHEN table_name = 'szallitoi_szamla_kiadas' AND column_name = 'osszeg_resz'
      THEN '✅ várt oszlop'
    ELSE '❌ NEM várt oszlop-UPDATE grant!'
  END AS status
  FROM information_schema.role_column_grants
 WHERE table_schema = 'public'
   AND table_name IN ('szallitoi_szamla', 'szallitoi_szamla_kiadas')
   AND grantee = 'authenticated'
   AND privilege_type = 'UPDATE'
UNION ALL
SELECT
  'mentés-besorolás: ' || tabla AS verify_target,
  CASE WHEN hatokor = 'gyulekezet' AND reteg IS NOT NULL
       THEN '✅ gyulekezet / réteg ' || reteg
       ELSE '❌ hiányos besorolás' END AS status
  FROM public.backup_table_policy
 WHERE tabla IN ('gyulekezeti_dokumentum', 'szallitoi_szamla', 'szallitoi_szamla_kiadas')
UNION ALL
SELECT
  'index: ' || indexname AS verify_target,
  '✅' AS status
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname IN (
     'szallitoi_szamla_cong_kifizetve_idx',
     'szallitoi_szamla_cong_datum_idx',
     'szallitoi_szamla_kiadas_kiadas_idx'
   )
ORDER BY verify_target;
