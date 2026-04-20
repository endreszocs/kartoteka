-- KARTOTEKA WC-7: Új szerepkörök (egyhazkeruleti_admin, konyvelo, egyhazmegyei_szamvevo)
--                + profile_congregations many-to-many tábla
-- Dátum: 2026-04-16
-- Tervdokumentum: docs/project-tracking/KARTOTEKA-penzugy-uj-szerepkorok-es-lokalis-tarolas-2026-04-16.md
-- Felhasználói döntések: docs/project-tracking/KARTOTEKA-penzugy-wc7-zarokerdesek-2026-04-16.md
--
-- ÁLLAPOT: VÁZLAT — FELHASZNÁLÓI ELLENŐRZÉSRE, MÉG NEM FUTTATVA
--
-- Változtatások:
--   1. profiles.role CHECK constraint — 4 helyett 7 érték
--   2. ÚJ tábla: profile_congregations — many-to-many kapcsolat (konyvelo/szamvevo többi gyülekezethez)
--   3. RLS policy-k a profile_congregations-ra
--   4. Kommentek a DB dokumentáció frissítéséhez
--
-- Ami NINCS ebben a fájlban, külön fájlra kerül (a WC-7 későbbi alfeladata):
--   - Meglévő 60+ tábla RLS policy-k frissítése az új szerepkörökre (audit kell előtte)
--   - TypeScript Role type bővítés (külön PR, nem DB migráció)


-- ============================================================================
-- 1. PROFILES.ROLE CHECK CONSTRAINT BEVEZETÉSE
-- ============================================================================
--
-- Indok: eddig egyszerű text mező volt, elméletileg bármilyen string odaírható.
-- Most 7 értékre korlátozzuk, hogy véletlenül ne kerüljön be érvénytelen szerepkör.
-- Meglévő adat ellenőrzés: nézd meg, vannak-e „furcsa" role értékek, mielőtt futtatod!
--
--   SELECT DISTINCT role FROM public.profiles;
--
-- Az eredménynek csak a régi 4 értéket kellene tartalmaznia.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (
    role = ANY (ARRAY[
      'lelkesz'::text,
      'esperes'::text,
      'egyhazmegyei_admin'::text,
      'egyhazkeruleti_admin'::text,
      'admin'::text,
      'konyvelo'::text,
      'egyhazmegyei_szamvevo'::text
    ])
  );

COMMENT ON COLUMN public.profiles.role IS
  $$Szerepkör. Érvényes értékek: lelkesz (gyülekezeti lelkipásztor), esperes (egyházmegyei esperes), egyhazmegyei_admin (egyházmegyei szervezési admin), egyhazkeruleti_admin (egyházkerületi szintű admin — districts.id), admin (rendszergazdai admin, teljes hozzáférés), konyvelo (szakmai pénzügyi review, gyülekezeti szint, many-to-many a profile_congregations-ön), egyhazmegyei_szamvevo (egyházmegyei auditori szerep, csak olvas).$$;


-- ============================================================================
-- 2. PROFILE_CONGREGATIONS MANY-TO-MANY TÁBLA
-- ============================================================================
--
-- Cél: egy konyvelo vagy egyhazmegyei_szamvevo több gyülekezethez rendelhető.
-- A lelkesz/esperes/egyhazmegyei_admin/egyhazkeruleti_admin/admin szerepkörök
-- változatlanul a profiles.congregation_id / diocese_id / district_id mezőn
-- keresztül fejezik ki a hatókörüket (1:1).
--
-- A tábla csak a konyvelo és szamvevo szerepkörökre értelmezett.

CREATE TABLE IF NOT EXISTS public.profile_congregations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  congregation_id uuid NOT NULL,
  role_scope text NOT NULL DEFAULT 'konyvelo',
  assigned_by uuid NOT NULL,
  assigned_at timestamp with time zone DEFAULT now(),
  active boolean DEFAULT true,
  revoked_at timestamp with time zone,
  revoked_by uuid,
  revoked_reason text,
  CONSTRAINT profile_congregations_pkey PRIMARY KEY (id),
  CONSTRAINT profile_congregations_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT profile_congregations_congregation_id_fkey
    FOREIGN KEY (congregation_id) REFERENCES public.congregations(id) ON DELETE CASCADE,
  CONSTRAINT profile_congregations_assigned_by_fkey
    FOREIGN KEY (assigned_by) REFERENCES auth.users(id),
  CONSTRAINT profile_congregations_revoked_by_fkey
    FOREIGN KEY (revoked_by) REFERENCES auth.users(id),
  CONSTRAINT profile_congregations_unique
    UNIQUE (profile_id, congregation_id, role_scope),
  CONSTRAINT profile_congregations_role_scope_check CHECK (
    role_scope = ANY (ARRAY['konyvelo'::text, 'egyhazmegyei_szamvevo'::text])
  )
);

COMMENT ON TABLE public.profile_congregations IS
  'Many-to-many kapcsolat könyvelő/számvevő <-> gyülekezet között. '
  'Az 1:1 szerepkörök (lelkesz, esperes, egyhazmegyei_admin, egyhazkeruleti_admin, admin) '
  'továbbra is a profiles.congregation_id / diocese_id / district_id mezőket használják.';

COMMENT ON COLUMN public.profile_congregations.role_scope IS
  'A kapcsolat jellege: konyvelo (gyülekezet pénzügyi review) vagy '
  'egyhazmegyei_szamvevo (az adott gyülekezetet magába foglaló egyházmegye auditora).';

COMMENT ON COLUMN public.profile_congregations.active IS
  'FALSE, ha a hozzárendelés visszavonva. Történeti adat megmarad, nem töröljük.';


-- Indexek a gyakori lekérdezésekhez
CREATE INDEX IF NOT EXISTS idx_profile_congregations_profile
  ON public.profile_congregations (profile_id) WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_profile_congregations_congregation
  ON public.profile_congregations (congregation_id) WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_profile_congregations_profile_role
  ON public.profile_congregations (profile_id, role_scope) WHERE active = true;


-- ============================================================================
-- 3a. GRANT az authenticated role-nak
-- ============================================================================
-- FONTOS: a Supabase default privilege-ek nem mindig vannak beállítva új táblákra.
-- Explicit GRANT nélkül az authenticated user PostgreSQL permission denied
-- hibát kap (42501), ami a PostgREST-en keresztül 403-ra fordítódik.
-- A valódi hozzáférést a RLS policy-k szűrik (lásd lent).

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_congregations TO authenticated;


-- ============================================================================
-- 3. RLS POLICY-K A profile_congregations TÁBLÁRA
-- ============================================================================

ALTER TABLE public.profile_congregations ENABLE ROW LEVEL SECURITY;


-- 3a. Az érintett felhasználó láthatja a SAJÁT kapcsolatait.
CREATE POLICY profile_congregations_self_select
  ON public.profile_congregations
  FOR SELECT
  USING (profile_id = auth.uid());


-- 3b. Admin (rendszergazda) mindent olvashat és írhat.
CREATE POLICY profile_congregations_admin_all
  ON public.profile_congregations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );


-- 3c. Egyházkerületi admin olvas mindent a saját kerületéhez tartozó gyülekezetekről,
--     és írhat (hozzárendelés, visszavonás).
CREATE POLICY profile_congregations_kerulet_admin_all
  ON public.profile_congregations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.congregations c ON c.id = public.profile_congregations.congregation_id
      JOIN public.dioceses d ON d.id = c.diocese_id
      WHERE p.id = auth.uid()
        AND p.role = 'egyhazkeruleti_admin'
        AND d.district_id = p.district_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.congregations c ON c.id = public.profile_congregations.congregation_id
      JOIN public.dioceses d ON d.id = c.diocese_id
      WHERE p.id = auth.uid()
        AND p.role = 'egyhazkeruleti_admin'
        AND d.district_id = p.district_id
    )
  );


-- 3d. Egyházmegyei admin olvashat + írhat SZÁMVEVŐ hozzárendelést
--     a saját egyházmegyéjéhez tartozó gyülekezetekhez (könyvelőt NEM).
CREATE POLICY profile_congregations_megye_admin_szamvevo
  ON public.profile_congregations
  FOR ALL
  USING (
    role_scope = 'egyhazmegyei_szamvevo'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.congregations c ON c.id = public.profile_congregations.congregation_id
      WHERE p.id = auth.uid()
        AND p.role = 'egyhazmegyei_admin'
        AND c.diocese_id = p.diocese_id
    )
  )
  WITH CHECK (
    role_scope = 'egyhazmegyei_szamvevo'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.congregations c ON c.id = public.profile_congregations.congregation_id
      WHERE p.id = auth.uid()
        AND p.role = 'egyhazmegyei_admin'
        AND c.diocese_id = p.diocese_id
    )
  );


-- ============================================================================
-- ELLENŐRZŐ LEKÉRDEZÉSEK (futtatás után ellenőrizni)
-- ============================================================================
--
-- 1. Az összes szerepkör megjelenik-e a constraint-ben?
--
--     SELECT pg_get_constraintdef(oid)
--     FROM pg_constraint
--     WHERE conname = 'profiles_role_check';
--
-- 2. A profile_congregations tábla létrejött-e?
--
--     SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'profile_congregations';
--
-- 3. RLS bekapcsolva, policy-k léteznek?
--
--     SELECT tablename, rowsecurity FROM pg_tables
--     WHERE tablename = 'profile_congregations';
--
--     SELECT polname, polcmd FROM pg_policy
--     WHERE polrelid = 'public.profile_congregations'::regclass;
--
-- ============================================================================
-- VISSZAFORDÍTÁS (ha kell)
-- ============================================================================
--
-- ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
-- ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (
--   role = ANY (ARRAY['lelkesz','esperes','egyhazmegyei_admin','admin'])
-- );
-- DROP TABLE IF EXISTS public.profile_congregations CASCADE;
