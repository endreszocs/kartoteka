-- =========================================================================
-- 2026-04-18 — Egyházmegyei modul (FÁZIS 6-10) SQL alaprendszer
-- =========================================================================
-- CÉL (Endre, 2026-04-18):
--   Az egyházmegye egy önálló könyvelői és adminisztratív entitás:
--     - saját CIF / adószám / bankszámla
--     - saját "Egyházmegyénk" adatlap (a „Gyülekezetünk" mintájára)
--     - saját nyugtatömbjei
--     - saját éves költségvetés + számadás
--     - automatikus profilváltás esperes → egyházmegyei dashboard-ra
--
-- Ez a migráció a szükséges sémabővítéseket végzi. A UI / backend a következő
-- lépésekben kerül be:
--     - FÁZIS 6B: "Egyházmegyénk" adatszerkesztő lap
--     - FÁZIS 7:  Egyházmegyei nyugtatömb modul
--     - FÁZIS 8:  Egyházmegyei költségvetés + számadás
--     - FÁZIS 9:  Automatikus profilváltás (backend logika, frontend redirect)
--
-- Idempotens — biztonsággal újrafuttatható.
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) dioceses tábla bővítése: CIF, adószám, cím, bank, elérhetőségek
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.dioceses
  -- Jogi és pénzügyi azonosítók
  ADD COLUMN IF NOT EXISTS cif text,                     -- román adóazonosító (CIF)
  ADD COLUMN IF NOT EXISTS adoszam text,                 -- magyar adószám (ha van)
  ADD COLUMN IF NOT EXISTS cnp_letter text,              -- hivatali főszám, ha van

  -- Cím (két sorban, mert hosszabb is lehet)
  ADD COLUMN IF NOT EXISTS cim_orszag text DEFAULT 'Románia',
  ADD COLUMN IF NOT EXISTS cim_megye text,
  ADD COLUMN IF NOT EXISTS cim_telepules text,
  ADD COLUMN IF NOT EXISTS cim_iranyitoszam text,
  ADD COLUMN IF NOT EXISTS cim_utca text,

  -- Elérhetőségek
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS telefon text,
  ADD COLUMN IF NOT EXISTS weboldal text,

  -- Banki adatok (az egyházmegye saját bankszámlái — bankszámlák a
  -- `bankszamlak` táblában kerülnek rögzítésre, congregation_id helyett a
  -- későbbiekben egy külön scope-referencián; a `bank_fo_iban` tartalmazza
  -- a fő IBAN-t gyors megjelenítéshez)
  ADD COLUMN IF NOT EXISTS bank_nev text,
  ADD COLUMN IF NOT EXISTS bank_fo_iban text,
  ADD COLUMN IF NOT EXISTS bank_fo_iban_valuta text DEFAULT 'RON',

  -- Vezetés (meta)
  ADD COLUMN IF NOT EXISTS esperes_nev text,             -- szemelyes név (ha nincs felhasználói fiók)
  ADD COLUMN IF NOT EXISTS esperes_cim text,             -- "esperes", "esperesi megbízott", stb.
  ADD COLUMN IF NOT EXISTS jegyzo_nev text,              -- egyházmegyei jegyző

  -- Egyéb
  ADD COLUMN IF NOT EXISTS megjegyzes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid;

COMMENT ON COLUMN public.dioceses.cif IS
  'Egyházmegye román adóazonosítója (CIF). A nyugtatömbökön és pénzügyi dokumentumokon is megjelenik.';
COMMENT ON COLUMN public.dioceses.bank_fo_iban IS
  'Fő banki IBAN gyors megjelenítéshez. A teljes bankszámla-lista a bankszamlak táblában van.';
COMMENT ON COLUMN public.dioceses.esperes_nev IS
  'Aktuális esperes/esperesi megbízott neve (megjelenítéshez). NEM kötelező user-fiókhoz kapcsolni.';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_update_timestamp()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_dioceses_updated ON public.dioceses;
CREATE TRIGGER tg_dioceses_updated
  BEFORE UPDATE ON public.dioceses
  FOR EACH ROW EXECUTE FUNCTION public.tg_update_timestamp();

-- ─────────────────────────────────────────────────────────────────────────
-- 2) chitanta_tombok (nyugtatömb) — egyházmegyei scope bővítés
-- ─────────────────────────────────────────────────────────────────────────
-- Jelenleg a nyugtatömbök `congregation_id`-hez kötöttek. Az egyházmegyei
-- nyugtatömböket is hasonlóan kezeljük, de `scope` mezővel különböztetjük:
--   'gyulekezet' (default) — a `congregation_id` kötelező
--   'egyhazmegye'          — a `diocese_id` kötelező
--
-- Így a meglévő gyülekezeti nyugtatömb logika zavartalanul működik, és új
-- sorokkal kiegészíthető egyházmegyeire.

ALTER TABLE public.chitanta_tombok
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'gyulekezet',
  ADD COLUMN IF NOT EXISTS diocese_id uuid REFERENCES public.dioceses(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chitanta_tombok_scope_check' AND conrelid = 'public.chitanta_tombok'::regclass
  ) THEN
    ALTER TABLE public.chitanta_tombok
      ADD CONSTRAINT chitanta_tombok_scope_check
      CHECK (scope IN ('gyulekezet', 'egyhazmegye'));
  END IF;
END$$;

-- Csak az egyiknek szabad lennie: gyulekezet esetén congregation_id,
-- egyhazmegye esetén diocese_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chitanta_tombok_scope_fk_check' AND conrelid = 'public.chitanta_tombok'::regclass
  ) THEN
    ALTER TABLE public.chitanta_tombok
      ADD CONSTRAINT chitanta_tombok_scope_fk_check
      CHECK (
        (scope = 'gyulekezet' AND congregation_id IS NOT NULL AND diocese_id IS NULL)
        OR (scope = 'egyhazmegye' AND diocese_id IS NOT NULL)
      );
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_chitanta_tombok_scope_diocese
  ON public.chitanta_tombok(scope, diocese_id)
  WHERE scope = 'egyhazmegye';

COMMENT ON COLUMN public.chitanta_tombok.scope IS
  'A nyugtatömb hatóköre: gyulekezet (congregation_id) vagy egyhazmegye (diocese_id). Default: gyulekezet (backward compat).';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) profile_preferences — felhasználói UI beállítások (automatikus profilváltás)
-- ─────────────────────────────────────────────────────────────────────────
-- Endre alapelve: ha egy felhasználónak több szerepköre van (pl. gyülekezeti
-- lelkipásztor + esperes), akkor bejelentkezéskor alapértelmezetten a legfőbb
-- (esperes → egyházmegyei dashboard) kerüljön megjelenítésre. Opcionálisan
-- a felhasználó átállíthatja az alapértelmezett dashboardot.

CREATE TABLE IF NOT EXISTS public.profile_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  /** Melyik dashboard nyíljon alapértelmezetten bejelentkezéskor.
   *  Lehetséges értékek:
   *    'auto'       (default) — a legmagasabb szintű aktív szerepkör szerint
   *    'gyulekezet' — a gyülekezeti dashboard (ha van)
   *    'egyhazmegye' — egyházmegyei dashboard (ha esperes)
   *    'egyhazkerulet' — egyházkerületi dashboard (ha egyházkerületi admin)
   *    'admin'       — rendszergazdai felület */
  default_dashboard text NOT NULL DEFAULT 'auto',
  /** A legutóbbi ténylegesen használt profil (profilváltás után ezt nyitja) */
  last_used_scope text,
  last_used_scope_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profile_preferences_default_dashboard_check' AND conrelid = 'public.profile_preferences'::regclass
  ) THEN
    ALTER TABLE public.profile_preferences
      ADD CONSTRAINT profile_preferences_default_dashboard_check
      CHECK (default_dashboard IN ('auto', 'gyulekezet', 'egyhazmegye', 'egyhazkerulet', 'admin'));
  END IF;
END$$;

DROP TRIGGER IF EXISTS tg_profile_preferences_updated ON public.profile_preferences;
CREATE TRIGGER tg_profile_preferences_updated
  BEFORE UPDATE ON public.profile_preferences
  FOR EACH ROW EXECUTE FUNCTION public.tg_update_timestamp();

COMMENT ON TABLE public.profile_preferences IS
  'Felhasználói UI beállítások — alapértelmezett dashboard bejelentkezéskor, utoljára használt profil. A multi-role felhasználók (pl. lelkipásztor + esperes) választhatnak.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4) RLS a profile_preferences táblához
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profile_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_preferences TO authenticated;

DROP POLICY IF EXISTS "profile_preferences_own_all" ON public.profile_preferences;
CREATE POLICY "profile_preferences_own_all" ON public.profile_preferences
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- 5) dioceses RLS — esperes / egyházmegyei admin szerkesztheti a saját
-- ─────────────────────────────────────────────────────────────────────────
-- HIBAKÉPES (2026-04-18 Endre): a korábbi verzió `pr.user_id`-t és nem-létező
-- role-okat ('god_admin', 'rendszergazda', 'master') használt. A valós séma:
--   - profile_roles.profile_id = auth.uid()  (NEM user_id)
--   - profile_roles.role CHECK: 'admin', 'egyhazkeruleti_admin',
--     'egyhazmegyei_admin', 'esperes', 'egyhazmegyei_szamvevo', 'lelkesz',
--     'konyvelo', 'custom' (NINCS 'god_admin'/'rendszergazda'/'master')
--   - profile_roles.scope CHECK: 'system', 'district', 'diocese',
--     'congregation' (NEM 'egyhazmegye'/'egyhazkerulet'/'gyulekezet')
--   - Globális admin ellenőrzés: profiles.role = 'admin' + status='active'
--
-- Az alábbi policy a `profiles.role` és `profile_roles.role/scope` együtt
-- használatát követi, az egész rendszerrel konzisztensen.

GRANT SELECT, UPDATE ON public.dioceses TO authenticated;

DROP POLICY IF EXISTS "dioceses_update_by_esperes" ON public.dioceses;
CREATE POLICY "dioceses_update_by_esperes" ON public.dioceses
  FOR UPDATE
  TO authenticated
  USING (
    -- (1) Globális admin ellenőrzés — a legegyszerűbb admin
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('admin', 'egyhazkeruleti_admin')
    )
    -- (2) profile_roles alapú ellenőrzés
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND (
          -- Rendszer admin (legmagasabb szint)
          (pr.scope = 'system' AND pr.role = 'admin')
          -- Esperes a saját egyházmegyéjét
          OR (pr.scope = 'diocese' AND pr.scope_id = dioceses.id AND pr.role IN ('esperes', 'egyhazmegyei_admin'))
          -- Egyházkerületi admin a saját kerületébe tartozót
          OR (pr.scope = 'district' AND pr.scope_id = dioceses.district_id AND pr.role = 'egyhazkeruleti_admin')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('admin', 'egyhazkeruleti_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.active = true
        AND pr.approval_status = 'approved'
        AND (
          (pr.scope = 'system' AND pr.role = 'admin')
          OR (pr.scope = 'diocese' AND pr.scope_id = dioceses.id AND pr.role IN ('esperes', 'egyhazmegyei_admin'))
          OR (pr.scope = 'district' AND pr.scope_id = dioceses.district_id AND pr.role = 'egyhazkeruleti_admin')
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- ELLENŐRZÉS
-- ─────────────────────────────────────────────────────────────────────────

-- a) Dioceses új oszlopok
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'dioceses'
  AND column_name IN (
    'cif', 'adoszam', 'cim_orszag', 'cim_megye', 'cim_telepules',
    'cim_iranyitoszam', 'cim_utca', 'email', 'telefon', 'weboldal',
    'bank_nev', 'bank_fo_iban', 'esperes_nev', 'esperes_cim', 'jegyzo_nev'
  )
ORDER BY column_name;

-- b) chitanta_tombok új oszlopok
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'chitanta_tombok'
  AND column_name IN ('scope', 'diocese_id')
ORDER BY column_name;

-- c) profile_preferences tábla
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'profile_preferences') AS table_exists,
  (SELECT COUNT(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'profile_preferences') AS policy_count;

-- d) RLS a dioceses-re
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'dioceses'
ORDER BY policyname;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) PostgREST schema cache reload (új tábla: profile_preferences + új oszlopok)
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
