-- ============================================================================
-- 2026-08-25 — GYÜLEKEZETI EGYSÉGEK (anya–leány–missziói–szórvány)
--
-- MIT CSINÁL (a docs/GYULEKEZETI-EGYSEGEK-TERV-2026-08-25.md szerint):
--   1. congregations: 2 új oszlop — szervezeti_tipus ('anya'|'leany'|'misszioi',
--      default 'anya') + anya_congregation_id (FK, csak leánynál) + őr-trigger
--      (leánynak kötelező anya; anya csak 'anya'/'misszioi' és önálló lehet;
--      leánynak nem lehet saját leánya).
--   2. ÚJ TÁBLA: gyulekezeti_egysegek — az anya kartotékán BELÜLI egységek
--      (leány/szórvány; NULL címke az adat-táblákon = anyaközpont).
--      RLS: saját gyülekezet (skalár + profile_roles-láb) + rendszergazda.
--   3. munkanaplo.egyseg_id + szemely.egyseg_id (nullable FK, ON DELETE SET NULL).
--   4. RPC: gyulekezeti_hierarchia() — SECURITY DEFINER, fail-closed hatókörrel
--      (rendszergazda: minden; megyei szerep: saját megye; kerületi szerep:
--      saját kerület; gyülekezeti user: a saját „családja"). Lelkész-nevekkel
--      és élő létszámmal (élő létszám CSAK rendszergazdának / saját családra —
--      a megyei/kerületi szint a beküldött iratokból kap létszámot, az app-ban).
--   5. Missziói backfill név-minta alapján.
--   6. backup_table_policy besorolás (enélkül a napi mentés HANGOSAN elhasal).
--
-- IDEMPOTENS: többször futtatható. A végén verifikációs SELECT.
-- ELŐFELTÉTEL: 2026-08-11-globalis-hozzaferes-szukites.sql (current_user_* fv-ek),
--              2026-08-11-biztonsagi-mentes.sql (backup_table_policy).
-- ============================================================================

BEGIN;

-- Első futás-e? (A Missziói név-minta backfill CSAK ekkor futhat — újrafuttatás
-- nem írhatja felül az admin által kézzel átsorolt gyülekezeteket.)
CREATE TEMP TABLE _gyul_egysegek_elso_futas ON COMMIT DROP AS
SELECT NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'congregations'
    AND column_name = 'szervezeti_tipus'
) AS elso;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. congregations — hivatalos szervezeti réteg
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS szervezeti_tipus text NOT NULL DEFAULT 'anya';

ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS anya_congregation_id uuid NULL;

DO $$
BEGIN
  -- conname szerint célzunk (a pg_get_constraintdef LIKE-keresés rögzített csapda)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'congregations_szervezeti_tipus_check'
                   AND conrelid = 'public.congregations'::regclass) THEN
    ALTER TABLE public.congregations
      ADD CONSTRAINT congregations_szervezeti_tipus_check
      CHECK (szervezeti_tipus IN ('anya', 'leany', 'misszioi'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'congregations_anya_fk'
                   AND conrelid = 'public.congregations'::regclass) THEN
    -- RESTRICT: anyaegyházközség nem törölhető, amíg leánya van (a SET NULL
    -- itt csapda lenne: árva 'leany' sort hagyna, amit az őr-trigger tilt).
    ALTER TABLE public.congregations
      ADD CONSTRAINT congregations_anya_fk
      FOREIGN KEY (anya_congregation_id)
      REFERENCES public.congregations(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'congregations_anya_nem_onmaga'
                   AND conrelid = 'public.congregations'::regclass) THEN
    ALTER TABLE public.congregations
      ADD CONSTRAINT congregations_anya_nem_onmaga
      CHECK (anya_congregation_id IS NULL OR anya_congregation_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_congregations_anya
  ON public.congregations (anya_congregation_id)
  WHERE anya_congregation_id IS NOT NULL;

-- Őr-trigger: a kapcsolat-konzisztencia (az admin-action is validál, de a
-- DB-szintű őr a végső védelem — fail-closed).
CREATE OR REPLACE FUNCTION public.congregations_szervezet_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.szervezeti_tipus = 'leany' THEN
    IF NEW.anya_congregation_id IS NULL THEN
      RAISE EXCEPTION 'Leányegyházközségnek kötelező anyaegyházközséget megadni (%).', NEW.name;
    END IF;
  ELSE
    IF NEW.anya_congregation_id IS NOT NULL THEN
      RAISE EXCEPTION 'Csak leányegyházközségnek lehet anyaegyházközsége (% típusa: %).', NEW.name, NEW.szervezeti_tipus;
    END IF;
  END IF;

  IF NEW.anya_congregation_id IS NOT NULL THEN
    -- Az anya csak önálló (anya nélküli) 'anya' vagy 'misszioi' lehet.
    PERFORM 1 FROM public.congregations a
     WHERE a.id = NEW.anya_congregation_id
       AND a.szervezeti_tipus IN ('anya', 'misszioi')
       AND a.anya_congregation_id IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Az anyaegyházközség csak önálló ''anya'' vagy ''misszioi'' típusú egyházközség lehet.';
    END IF;
    -- Egyszintűség: akinek leánya van, maga nem lehet leány.
    IF EXISTS (SELECT 1 FROM public.congregations gy
                WHERE gy.anya_congregation_id = NEW.id) THEN
      RAISE EXCEPTION 'Ez az egyházközség maga is anyaegyházközség (kapcsolt leánya van) — előbb a leányokat kell átsorolni.';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_congregations_szervezet_guard ON public.congregations;
CREATE TRIGGER trg_congregations_szervezet_guard
  BEFORE INSERT OR UPDATE OF szervezeti_tipus, anya_congregation_id
  ON public.congregations
  FOR EACH ROW
  EXECUTE FUNCTION public.congregations_szervezet_guard();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. gyulekezeti_egysegek — az anya kartotékán belüli egységek
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gyulekezeti_egysegek (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  nev text NOT NULL,
  tipus text NOT NULL CHECK (tipus IN ('leany', 'szorvany')),
  adrlocality_id integer NULL REFERENCES public.adrlocality(id),
  linked_congregation_id uuid NULL REFERENCES public.congregations(id),
  sorrend integer NOT NULL DEFAULT 0,
  aktiv boolean NOT NULL DEFAULT true,
  megjegyzes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gyulekezeti_egysegek_nev_nem_ures CHECK (btrim(nev) <> ''),
  CONSTRAINT gyulekezeti_egysegek_egyedi UNIQUE (congregation_id, nev),
  -- Az összetett FK-k célja (lásd 3. szakasz): a címke csak a SAJÁT
  -- gyülekezet egységére mutathat.
  CONSTRAINT gyulekezeti_egysegek_id_cong_egyedi UNIQUE (id, congregation_id)
);

-- Ha a tábla egy korábbi futásból már létezik, az id+congregation_id kulcs pótlása:
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'gyulekezeti_egysegek_id_cong_egyedi'
                   AND conrelid = 'public.gyulekezeti_egysegek'::regclass) THEN
    ALTER TABLE public.gyulekezeti_egysegek
      ADD CONSTRAINT gyulekezeti_egysegek_id_cong_egyedi UNIQUE (id, congregation_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gyulekezeti_egysegek_congregation
  ON public.gyulekezeti_egysegek (congregation_id);

CREATE OR REPLACE FUNCTION public.gyulekezeti_egysegek_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_gyulekezeti_egysegek_touch ON public.gyulekezeti_egysegek;
CREATE TRIGGER trg_gyulekezeti_egysegek_touch
  BEFORE UPDATE ON public.gyulekezeti_egysegek
  FOR EACH ROW EXECUTE FUNCTION public.gyulekezeti_egysegek_touch();

ALTER TABLE public.gyulekezeti_egysegek ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gyulekezeti_egysegek TO authenticated;

-- RLS: a szallitoi_szamla-minta (2026-08-15) — skalár + profile_roles-láb +
-- rendszergazda. A megyei/kerületi szintnek NEM kell tábla-szintű olvasás:
-- a hierarchia-nézet a gyulekezeti_hierarchia() RPC-n át kap adatot.
DROP POLICY IF EXISTS gyulekezeti_egysegek_select_own ON public.gyulekezeti_egysegek;
CREATE POLICY gyulekezeti_egysegek_select_own
  ON public.gyulekezeti_egysegek FOR SELECT TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = gyulekezeti_egysegek.congregation_id
        AND pr.active AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

DROP POLICY IF EXISTS gyulekezeti_egysegek_insert_own ON public.gyulekezeti_egysegek;
CREATE POLICY gyulekezeti_egysegek_insert_own
  ON public.gyulekezeti_egysegek FOR INSERT TO authenticated
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = gyulekezeti_egysegek.congregation_id
        AND pr.active AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

DROP POLICY IF EXISTS gyulekezeti_egysegek_update_own ON public.gyulekezeti_egysegek;
CREATE POLICY gyulekezeti_egysegek_update_own
  ON public.gyulekezeti_egysegek FOR UPDATE TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = gyulekezeti_egysegek.congregation_id
        AND pr.active AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  )
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = gyulekezeti_egysegek.congregation_id
        AND pr.active AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

DROP POLICY IF EXISTS gyulekezeti_egysegek_delete_own ON public.gyulekezeti_egysegek;
CREATE POLICY gyulekezeti_egysegek_delete_own
  ON public.gyulekezeti_egysegek FOR DELETE TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = gyulekezeti_egysegek.congregation_id
        AND pr.active AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Címkéző oszlopok: munkanaplo.egyseg_id + szemely.egyseg_id
--    (NULL = anyaközpont; egység törlésekor a címke nullázódik, az adat marad)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.munkanaplo ADD COLUMN IF NOT EXISTS egyseg_id uuid NULL;
ALTER TABLE public.szemely    ADD COLUMN IF NOT EXISTS egyseg_id uuid NULL;

-- ÖSSZETETT FK: (egyseg_id, congregation_id) → gyulekezeti_egysegek(id,
-- congregation_id) — így a címke CSAK a sor saját gyülekezetének egységére
-- mutathat (kereszt-gyülekezeti címke a DB-szinten lehetetlen). Az
-- ON DELETE SET NULL (egyseg_id) oszloplista PostgreSQL 15+ szolgáltatás:
-- egység-törléskor CSAK a címke nullázódik, a congregation_id NEM.
-- (MATCH SIMPLE: NULL egyseg_id mellett az FK nem ellenőriz — ez a szándék.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'munkanaplo_egyseg_fk'
                   AND conrelid = 'public.munkanaplo'::regclass) THEN
    ALTER TABLE public.munkanaplo
      ADD CONSTRAINT munkanaplo_egyseg_fk
      FOREIGN KEY (egyseg_id, congregation_id)
      REFERENCES public.gyulekezeti_egysegek(id, congregation_id)
      ON DELETE SET NULL (egyseg_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'szemely_egyseg_fk'
                   AND conrelid = 'public.szemely'::regclass) THEN
    ALTER TABLE public.szemely
      ADD CONSTRAINT szemely_egyseg_fk
      FOREIGN KEY (egyseg_id, congregation_id)
      REFERENCES public.gyulekezeti_egysegek(id, congregation_id)
      ON DELETE SET NULL (egyseg_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_munkanaplo_egyseg
  ON public.munkanaplo (egyseg_id) WHERE egyseg_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_szemely_egyseg
  ON public.szemely (egyseg_id) WHERE egyseg_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RPC: gyulekezeti_hierarchia() — a szervezeti térkép adatforrása
--    (rendszergazda / megyei / kerületi / gyülekezeti nézet, fail-closed)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.gyulekezeti_hierarchia()
RETURNS TABLE (
  congregation_id uuid,
  name text,
  nev_hu text,
  szervezeti_tipus text,
  anya_congregation_id uuid,
  diocese_id uuid,
  diocese_name text,
  district_id uuid,
  district_name text,
  lelkesz_nevek text,
  sajat boolean,
  letszam_elo integer,
  egysegek jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_global boolean := public.current_user_has_global_access();
  v_own uuid := public.current_user_congregation_id();
  v_megyek uuid[] := public.current_user_diocese_olvaso_ids();
  v_keruletek uuid[] := public.current_user_district_olvaso_ids();
BEGIN
  -- Csak olvasó nézet — az olvasó (…_olvaso_ids) hatókör-függvények
  -- kizárólag SELECT-jellegű felhasználásra valók; itt pontosan az történik.
  RETURN QUERY
  WITH sajat_gyulekezetek AS (
    -- roles-first: profile_roles congregation-sorok + skalár fallback
    SELECT pr.scope_id AS cid
    FROM public.profile_roles pr
    WHERE pr.profile_id = auth.uid()
      AND pr.scope = 'congregation'
      AND pr.active AND pr.approval_status = 'approved'
      AND pr.scope_id IS NOT NULL
    UNION
    SELECT v_own WHERE v_own IS NOT NULL
  ),
  csalad AS (
    -- a saját gyülekezet „családja": önmaga + az anyja + az anya (vagy önmaga)
    -- leányai (egy szint — a modell egyszintű)
    SELECT DISTINCT c2.id
    FROM sajat_gyulekezetek s
    JOIN public.congregations c ON c.id = s.cid
    JOIN public.congregations c2
      ON c2.id = c.id
      OR c2.id = c.anya_congregation_id
      OR c2.anya_congregation_id = c.id
      OR (c.anya_congregation_id IS NOT NULL
          AND c2.anya_congregation_id = c.anya_congregation_id)
  ),
  lathato AS (
    SELECT c.id
    FROM public.congregations c
    LEFT JOIN public.dioceses d ON d.id = c.diocese_id
    WHERE v_global
       OR c.id IN (SELECT csalad.id FROM csalad)
       OR c.diocese_id = ANY (v_megyek)
       OR d.district_id = ANY (v_keruletek)
  )
  SELECT
    c.id,
    c.name::text,
    -- ::text kötelező: a nev_hu/name character varying, a RETURN QUERY pedig
    -- pontos típus-egyezést követel (42804) — a repo többi RPC-je is castol.
    c.nev_hu::text,
    c.szervezeti_tipus,
    c.anya_congregation_id,
    c.diocese_id,
    d.name,
    d.district_id,
    dt.name,
    (SELECT string_agg(DISTINCT p.full_name, ', ' ORDER BY p.full_name)
       FROM public.profile_roles pr
       JOIN public.profiles p ON p.id = pr.profile_id
      WHERE pr.scope = 'congregation' AND pr.scope_id = c.id
        AND pr.role = 'lelkesz'
        AND pr.active AND pr.approval_status = 'approved'
        AND p.deleted_at IS NULL AND p.anonymized_at IS NULL
        AND p.full_name IS NOT NULL),
    (c.id IN (SELECT sajat_gyulekezetek.cid FROM sajat_gyulekezetek)),
    -- Élő létszám: rendszergazda + saját család + KERÜLETI hatókör (precedens:
    -- district_member_counts, 2026-08-11 — a kerület aggregált darabszámot már
    -- ma is kap). A MEGYEI szint itt NULL-t lát: az egyházmegye alapelve
    -- (2026-04-17) szerint csak a beküldött iratokból kap számot (app-oldalon).
    -- A szűrő a lelkészi jelentés I.10 kanonikus aktív-tag szűrője.
    CASE WHEN v_global OR c.id IN (SELECT csalad.id FROM csalad)
              OR d.district_id = ANY (v_keruletek) THEN
      (SELECT count(*)::integer FROM public.szemely sz
        WHERE sz.congregation_id = c.id
          AND sz.isvisible
          AND NOT sz.meghalt
          AND coalesce(sz.member_status, 'aktív')
              NOT IN ('elhunyt', 'elköltözött', 'elkoltozott', 'kitért', 'törölt'))
    ELSE NULL END,
    CASE WHEN v_global OR c.id IN (SELECT csalad.id FROM csalad)
              OR d.district_id = ANY (v_keruletek) THEN
      coalesce((SELECT jsonb_agg(jsonb_build_object(
            'id', e.id, 'nev', e.nev, 'tipus', e.tipus, 'aktiv', e.aktiv,
            'letszam', (SELECT count(*) FROM public.szemely sz2
                         WHERE sz2.congregation_id = c.id
                           AND sz2.egyseg_id = e.id
                           AND sz2.isvisible AND NOT sz2.meghalt
                           AND coalesce(sz2.member_status, 'aktív')
                               NOT IN ('elhunyt', 'elköltözött', 'elkoltozott', 'kitért', 'törölt'))
          ) ORDER BY e.sorrend, e.nev)
          FROM public.gyulekezeti_egysegek e
          WHERE e.congregation_id = c.id AND e.aktiv), '[]'::jsonb)
    ELSE
      coalesce((SELECT jsonb_agg(jsonb_build_object(
            'id', e.id, 'nev', e.nev, 'tipus', e.tipus, 'aktiv', e.aktiv)
          ORDER BY e.sorrend, e.nev)
          FROM public.gyulekezeti_egysegek e
          WHERE e.congregation_id = c.id AND e.aktiv), '[]'::jsonb)
    END
  FROM public.congregations c
  JOIN lathato l ON l.id = c.id
  LEFT JOIN public.dioceses d ON d.id = c.diocese_id
  LEFT JOIN public.districts dt ON dt.id = d.district_id
  ORDER BY dt.name NULLS LAST, d.name NULLS LAST, c.name;
END $$;

REVOKE ALL ON FUNCTION public.gyulekezeti_hierarchia() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gyulekezeti_hierarchia() FROM anon;
GRANT EXECUTE ON FUNCTION public.gyulekezeti_hierarchia() TO authenticated;

COMMENT ON FUNCTION public.gyulekezeti_hierarchia() IS
  '2026-08-25: a szervezeti térkép (anya–leány–egységek) adatforrása. Fail-closed: hatókör nélküli hívónak üres. Élő létszám csak rendszergazdának / saját családra; megye/kerület a beküldött iratokból kap számot (app-oldalon).';

-- ─────────────────────────────────────────────────────────────────────────
-- 4/b. congregations UPDATE — roles-first láb (rögzített hibaosztály-javítás):
--    az eddigi congregations_update policy (current_user_can_edit_congregation)
--    CSAK a skalár profiles.congregation_id-t ismeri, így a profile_roles-szal
--    kötött lelkész mentése némán elakadna. A policyk VAGY-kapcsolatban
--    állnak — ez a kiegészítő policy additív, a meglévőhöz nem nyúlunk.
--    Az app-oldali kapu (canManageCongregation) szereplistája ezzel BETŰRE
--    azonos: role = 'lelkesz'.
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS congregations_update_roles_first ON public.congregations;
CREATE POLICY congregations_update_roles_first
  ON public.congregations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = congregations.id
        AND pr.role = 'lelkesz'
        AND pr.active AND pr.approval_status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = congregations.id
        AND pr.role = 'lelkesz'
        AND pr.active AND pr.approval_status = 'approved'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Missziói backfill — a hivatalos név tartalmazza a „Missziói" szót,
--    ezért ez nem találgatás, hanem a névből következő tény.
--    CSAK ELSŐ FUTÁSKOR: újrafuttatás nem írhatja felül az admin kézi,
--    auditált átsorolásait (az „idempotens" ígéret adat-szinten is álljon).
-- ─────────────────────────────────────────────────────────────────────────

UPDATE public.congregations
   SET szervezeti_tipus = 'misszioi'
 WHERE (SELECT elso FROM _gyul_egysegek_elso_futas)
   AND szervezeti_tipus = 'anya'
   AND (name ILIKE '%misszi%' OR coalesce(nev_hu, '') ILIKE '%misszi%');

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Mentés-besorolás (fail-closed kapu — enélkül a napi mentés elhasal).
--    Réteg 2: a congregations (1) után, a szemely (3) és munkanaplo (7)
--    előtt kell visszaállítani (azok FK-val hivatkoznak rá).
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.backup_table_policy (tabla, hatokor, reteg, visszaallithato, megjegyzes)
VALUES
  ('gyulekezeti_egysegek', 'gyulekezet', 2, true,
   '2026-08-25: gyülekezeti egységek (leány/szórvány az anya kartotékán belül). A szemely.egyseg_id (réteg 3) és a munkanaplo.egyseg_id (réteg 7) FK-val hivatkozik rá → előttük állítandó vissza.')
ON CONFLICT (tabla) DO NOTHING;

COMMIT;

-- PostgREST schema cache reload (az új tábla/oszlopok azonnali láthatóságához)
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFIKÁCIÓ — egyetlen eredmény-halmaz; minden sor ✅ kell legyen.
-- ─────────────────────────────────────────────────────────────────────────

SELECT 'oszlop: congregations.szervezeti_tipus' AS mit_mer,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='congregations'
                           AND column_name='szervezeti_tipus')
            THEN '✅' ELSE '❌ HIÁNYZIK' END AS allapot
UNION ALL
SELECT 'oszlop: congregations.anya_congregation_id',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='congregations'
                           AND column_name='anya_congregation_id')
            THEN '✅' ELSE '❌ HIÁNYZIK' END
UNION ALL
SELECT 'tábla: gyulekezeti_egysegek',
       CASE WHEN to_regclass('public.gyulekezeti_egysegek') IS NOT NULL
            THEN '✅' ELSE '❌ HIÁNYZIK' END
UNION ALL
SELECT 'RLS bekapcsolva: gyulekezeti_egysegek',
       CASE WHEN (SELECT relrowsecurity FROM pg_class
                  WHERE oid = to_regclass('public.gyulekezeti_egysegek'))
            THEN '✅' ELSE '❌ NINCS RLS' END
UNION ALL
SELECT 'RLS-policyk száma: gyulekezeti_egysegek (4 kell)',
       CASE WHEN (SELECT count(*) FROM pg_policy
                  WHERE polrelid = to_regclass('public.gyulekezeti_egysegek')) = 4
            THEN '✅' ELSE '❌ ELTÉR: '
              || (SELECT count(*)::text FROM pg_policy
                  WHERE polrelid = to_regclass('public.gyulekezeti_egysegek')) END
UNION ALL
SELECT 'oszlop: munkanaplo.egyseg_id',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='munkanaplo'
                           AND column_name='egyseg_id')
            THEN '✅' ELSE '❌ HIÁNYZIK' END
UNION ALL
SELECT 'oszlop: szemely.egyseg_id',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='szemely'
                           AND column_name='egyseg_id')
            THEN '✅' ELSE '❌ HIÁNYZIK' END
UNION ALL
SELECT 'RPC: gyulekezeti_hierarchia()',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p
                         JOIN pg_namespace n ON n.oid = p.pronamespace
                         WHERE n.nspname='public' AND p.proname='gyulekezeti_hierarchia')
            THEN '✅' ELSE '❌ HIÁNYZIK' END
UNION ALL
SELECT 'RPC anon-tiltás (fail-closed)',
       CASE WHEN NOT has_function_privilege('anon',
              'public.gyulekezeti_hierarchia()', 'EXECUTE')
            THEN '✅' ELSE '❌ anon futtathatja!' END
UNION ALL
SELECT 'mentés-besorolás: gyulekezeti_egysegek',
       CASE WHEN EXISTS (SELECT 1 FROM public.backup_table_policy
                         WHERE tabla='gyulekezeti_egysegek')
            THEN '✅' ELSE '❌ BESOROLATLAN (a mentés elhasalna!)' END
UNION ALL
SELECT 'őr-trigger: congregations',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                         WHERE tgrelid='public.congregations'::regclass
                           AND tgname='trg_congregations_szervezet_guard')
            THEN '✅' ELSE '❌ HIÁNYZIK' END
UNION ALL
SELECT 'congregations UPDATE roles-first policy',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policy
                         WHERE polrelid='public.congregations'::regclass
                           AND polname='congregations_update_roles_first')
            THEN '✅' ELSE '❌ HIÁNYZIK' END
UNION ALL
SELECT 'összetett FK: szemely.egyseg_id (saját gyülekezet egysége)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                         WHERE conname='szemely_egyseg_fk'
                           AND conrelid='public.szemely'::regclass
                           AND array_length(conkey, 1) = 2)
            THEN '✅' ELSE '❌ HIÁNYZIK/EGYOSZLOPOS' END
UNION ALL
SELECT 'Missziói egyházközségek (backfill után)',
       '✅ ' || (SELECT count(*)::text FROM public.congregations
                 WHERE szervezeti_tipus = 'misszioi');
