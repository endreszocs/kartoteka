-- KARTOTÉKA új bővítő táblák jogosultságai és RLS policy-k
-- Dátum: 2026-04-09

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.pastor_profiles TO authenticated;
ALTER TABLE public.pastor_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pastor_profiles_select_own ON public.pastor_profiles;
CREATE POLICY pastor_profiles_select_own
  ON public.pastor_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS pastor_profiles_insert_own ON public.pastor_profiles;
CREATE POLICY pastor_profiles_insert_own
  ON public.pastor_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS pastor_profiles_update_own ON public.pastor_profiles;
CREATE POLICY pastor_profiles_update_own
  ON public.pastor_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.congregation_annual_fees TO authenticated;
ALTER TABLE public.congregation_annual_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS congregation_annual_fees_select_scope ON public.congregation_annual_fees;
CREATE POLICY congregation_annual_fees_select_scope
  ON public.congregation_annual_fees
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.congregation_id = public.congregation_annual_fees.congregation_id
          OR p.role IN ('admin', 'egyhazmegyei_admin')
        )
    )
  );

DROP POLICY IF EXISTS congregation_annual_fees_insert_scope ON public.congregation_annual_fees;
CREATE POLICY congregation_annual_fees_insert_scope
  ON public.congregation_annual_fees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.congregation_id = public.congregation_annual_fees.congregation_id
          OR p.role IN ('admin', 'egyhazmegyei_admin')
        )
    )
  );

DROP POLICY IF EXISTS congregation_annual_fees_update_scope ON public.congregation_annual_fees;
CREATE POLICY congregation_annual_fees_update_scope
  ON public.congregation_annual_fees
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.congregation_id = public.congregation_annual_fees.congregation_id
          OR p.role IN ('admin', 'egyhazmegyei_admin')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.congregation_id = public.congregation_annual_fees.congregation_id
          OR p.role IN ('admin', 'egyhazmegyei_admin')
        )
    )
  );

DROP POLICY IF EXISTS congregation_annual_fees_delete_scope ON public.congregation_annual_fees;
CREATE POLICY congregation_annual_fees_delete_scope
  ON public.congregation_annual_fees
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.congregation_id = public.congregation_annual_fees.congregation_id
          OR p.role IN ('admin', 'egyhazmegyei_admin')
        )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarulek_kedvezmeny TO authenticated;
ALTER TABLE public.jarulek_kedvezmeny ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jarulek_kedvezmeny_select_scope ON public.jarulek_kedvezmeny;
CREATE POLICY jarulek_kedvezmeny_select_scope
  ON public.jarulek_kedvezmeny
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.congregation_id = public.jarulek_kedvezmeny.congregation_id
          OR p.role IN ('admin', 'egyhazmegyei_admin')
        )
    )
  );

DROP POLICY IF EXISTS jarulek_kedvezmeny_insert_scope ON public.jarulek_kedvezmeny;
CREATE POLICY jarulek_kedvezmeny_insert_scope
  ON public.jarulek_kedvezmeny
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.congregation_id = public.jarulek_kedvezmeny.congregation_id
          OR p.role IN ('admin', 'egyhazmegyei_admin')
        )
    )
  );

DROP POLICY IF EXISTS jarulek_kedvezmeny_update_scope ON public.jarulek_kedvezmeny;
CREATE POLICY jarulek_kedvezmeny_update_scope
  ON public.jarulek_kedvezmeny
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.congregation_id = public.jarulek_kedvezmeny.congregation_id
          OR p.role IN ('admin', 'egyhazmegyei_admin')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.congregation_id = public.jarulek_kedvezmeny.congregation_id
          OR p.role IN ('admin', 'egyhazmegyei_admin')
        )
    )
  );

DROP POLICY IF EXISTS jarulek_kedvezmeny_delete_scope ON public.jarulek_kedvezmeny;
CREATE POLICY jarulek_kedvezmeny_delete_scope
  ON public.jarulek_kedvezmeny
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.congregation_id = public.jarulek_kedvezmeny.congregation_id
          OR p.role IN ('admin', 'egyhazmegyei_admin')
        )
    )
  );
