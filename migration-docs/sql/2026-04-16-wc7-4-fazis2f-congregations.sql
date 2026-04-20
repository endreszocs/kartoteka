-- ============================================================================
-- KARTOTEKA WC-7.4 FÁZIS 2f — congregations takarítás + lelkészi jóváhagyási workflow
-- ============================================================================
--
-- Dátum: 2026-04-16
-- Felhasználói döntés: "A konyvelo és egyhazmegyei_szamvevo NEM módosíthat,
-- csak olvashat, de olvasási engedélyt kell kérjen a gyülekezet lelkészétől."
--
-- EBBEN A FÁJLBAN:
--
--   1. profile_congregations bővítés — jóváhagyási workflow mezők + active DEFAULT false
--   2. current_user_can_access_congregation() helper szigorítás (csak approved)
--   3. congregations tábla policy takarítás (SELECT + UPDATE)
--   4. Új current_user_can_edit_congregation(uuid) helper
--   5. Új RLS policy-k a profile_congregations-on:
--      - Lelkész látja a saját gyülekezetéhez tartozó kéréseket
--      - Lelkész jóváhagyhatja/elutasíthatja a saját gyülekezetét érintő kéréseket
--   6. Ellenőrző lekérdezések a végén
--

BEGIN;


-- ============================================================================
-- 1. profile_congregations bővítés — jóváhagyási workflow
-- ============================================================================

ALTER TABLE public.profile_congregations
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approval_reason text,
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

-- CHECK constraint az approval_status-ra (külön, hogy idempotens legyen)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profile_congregations_approval_status_check'
  ) THEN
    ALTER TABLE public.profile_congregations
      ADD CONSTRAINT profile_congregations_approval_status_check CHECK (
        approval_status = ANY (ARRAY['pending','approved','rejected','revoked'])
      );
  END IF;
END$$;

-- FK az approved_by-ra
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profile_congregations_approved_by_fkey'
  ) THEN
    ALTER TABLE public.profile_congregations
      ADD CONSTRAINT profile_congregations_approved_by_fkey
      FOREIGN KEY (approved_by) REFERENCES auth.users(id);
  END IF;
END$$;

-- Új hozzárendelés alapból inaktív
ALTER TABLE public.profile_congregations
  ALTER COLUMN active SET DEFAULT false;

COMMENT ON COLUMN public.profile_congregations.approval_status IS
  $$Jóváhagyási státusz: 'pending' (függőben, lelkészi jóváhagyásra vár), 'approved' (jóváhagyva, a hozzáférés aktív), 'rejected' (elutasítva), 'revoked' (korábban jóváhagyott, most visszavonva).$$;

COMMENT ON COLUMN public.profile_congregations.approval_reason IS
  $$Az admin által megadott magyarázat a hozzárendelésre ("miért kéred a hozzáférést"). A lelkész ezt látja a jóváhagyási döntésnél.$$;

COMMENT ON COLUMN public.profile_congregations.approved_at IS
  $$Az a dátum, amikor a lelkész jóváhagyta a hozzárendelést. NULL, ha még nincs jóváhagyva.$$;

COMMENT ON COLUMN public.profile_congregations.approved_by IS
  $$A jóváhagyó felhasználó (lelkész) auth.uid()-je. NULL, ha még nincs jóváhagyva.$$;

COMMENT ON COLUMN public.profile_congregations.active IS
  $$TRUE, ha a hozzárendelés aktív (jóváhagyva). FALSE alapértelmezetten (pending) vagy revoked/rejected után. A hozzáférés ellenőrzésekor az active=true ÉS approval_status='approved' együttes feltétel szükséges.$$;


-- ============================================================================
-- 2. current_user_can_access_congregation() helper szigorítás
-- ============================================================================
--
-- A many-to-many ágban most már ellenőrizzük, hogy approval_status = 'approved'

CREATE OR REPLACE FUNCTION public.current_user_can_access_congregation(target_cong uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$

  SELECT

    -- 2.1. Globális hozzáférésűek (admin, esperes, egyhazmegyei_admin)
    public.current_user_has_global_access()

    -- 2.2. Saját gyülekezet (lelkesz)
    OR (
      target_cong IS NOT NULL
      AND target_cong = public.current_user_congregation_id()
    )

    -- 2.3. Egyházkerületi admin a kerülete alatt
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.congregations c ON c.id = target_cong
        JOIN public.dioceses d ON d.id = c.diocese_id
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role = 'egyhazkeruleti_admin'
          AND d.district_id = p.district_id
      )
    )

    -- 2.4. Egyházmegyei számvevő a megyéje alatt (DE csak ha a lelkész jóváhagyta!)
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.congregations c ON c.id = target_cong
        JOIN public.profile_congregations pc
             ON pc.profile_id = p.id
            AND pc.congregation_id = target_cong
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role = 'egyhazmegyei_szamvevo'
          AND c.diocese_id = p.diocese_id
          AND pc.active = true
          AND pc.approval_status = 'approved'
      )
    )

    -- 2.5. Könyvelő/számvevő many-to-many hozzárendelés
    --      Fontos: CSAK ha a lelkész jóváhagyta (approval_status = 'approved')
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profile_congregations pc
        JOIN public.profiles p ON p.id = pc.profile_id
        WHERE pc.profile_id = auth.uid()
          AND pc.congregation_id = target_cong
          AND pc.active = true
          AND pc.approval_status = 'approved'
          AND p.status = 'active'
      )
    );

$function$;

COMMENT ON FUNCTION public.current_user_can_access_congregation(uuid) IS
  $$Engedélyez-e hozzáférést a megadott congregation-hoz. Könyvelő és egyházmegyei számvevő CSAK akkor fér hozzá, ha a gyülekezet lelkésze explicit jóváhagyta a hozzárendelést (profile_congregations.approval_status = 'approved' ÉS active = true). A globális szerepkörök (admin, esperes, egyházmegyei admin) és a gyülekezetei admin (egyházkerületi admin, saját lelkész) továbbra is közvetlenül hozzáférnek.$$;


-- ============================================================================
-- 3. Új helper: current_user_can_edit_congregation(uuid)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_can_edit_congregation(target_cong uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$

  SELECT

    -- Globális hozzáférésűek (admin, esperes, egyhazmegyei_admin)
    public.current_user_has_global_access()

    -- Lelkész a saját gyülekezetét
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role = 'lelkesz'
          AND p.congregation_id = target_cong
      )
    )

    -- Egyházkerületi admin a saját kerülete alatti gyülekezeteket
    OR (
      target_cong IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.congregations c ON c.id = target_cong
        JOIN public.dioceses d ON d.id = c.diocese_id
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role = 'egyhazkeruleti_admin'
          AND d.district_id = p.district_id
      )
    );

  -- Konyvelo és szamvevo szerepkörök KIZÁRVA — nem szerkeszthetnek alapadatot.

$function$;

COMMENT ON FUNCTION public.current_user_can_edit_congregation(uuid) IS
  $$IGAZ, ha a jelenlegi user szerkesztheti a megadott gyülekezetet. Engedélyezett: lelkesz (saját), admin/esperes/egyhazmegyei_admin (global), egyhazkeruleti_admin (saját kerület). Explicit TILTVA: konyvelo, egyhazmegyei_szamvevo.$$;


-- ============================================================================
-- 4. congregations policy takarítás
-- ============================================================================

DROP POLICY IF EXISTS "Mindenki lathatja a gyulekezeteket" ON public.congregations;
DROP POLICY IF EXISTS "Mindenki láthatja a gyülekezeteket" ON public.congregations;
DROP POLICY IF EXISTS admin_read_all_congregations ON public.congregations;
DROP POLICY IF EXISTS congregations_read ON public.congregations;
DROP POLICY IF EXISTS congregations_select ON public.congregations;
DROP POLICY IF EXISTS congregations_update ON public.congregations;

-- SELECT mindenki (publikus oldal)
CREATE POLICY congregations_select
  ON public.congregations
  FOR SELECT
  USING (true);

COMMENT ON POLICY congregations_select ON public.congregations IS
  $$A congregations olvasható mindenkinek (authenticated + anon). Szükséges a publikus gyülekezeti oldalakhoz (/gy/[slug]).$$;

-- UPDATE a szerkeszthető szerepkörök számára (lelkesz, admin, kerületi admin + globálisak)
CREATE POLICY congregations_update
  ON public.congregations
  FOR UPDATE
  USING (public.current_user_can_edit_congregation(id))
  WITH CHECK (public.current_user_can_edit_congregation(id));

COMMENT ON POLICY congregations_update ON public.congregations IS
  $$UPDATE jog csak a current_user_can_edit_congregation() helper szerint: lelkesz saját, admin/esperes/egyhazmegyei_admin global, egyhazkeruleti_admin saját kerület. Konyvelo/szamvevo explicit TILTVA.$$;


-- ============================================================================
-- 5. Új RLS policy: lelkészi jóváhagyás a profile_congregations-on
-- ============================================================================

-- 5a. A lelkész látja a SAJÁT gyülekezetét érintő összes kérést (pending is!)
DROP POLICY IF EXISTS profile_congregations_lelkesz_select ON public.profile_congregations;

CREATE POLICY profile_congregations_lelkesz_select
  ON public.profile_congregations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role = 'lelkesz'
        AND p.congregation_id = public.profile_congregations.congregation_id
    )
  );

COMMENT ON POLICY profile_congregations_lelkesz_select ON public.profile_congregations IS
  $$A lelkész látja a SAJÁT gyülekezetét érintő összes kérést (pending, approved, rejected, revoked). Ez adja az alapot a jóváhagyási felülethez.$$;


-- 5b. A lelkész UPDATE-elheti a saját gyülekezetét érintő kéréseket
--     (jóváhagyás: approved, elutasítás: rejected, visszavonás: revoked)
DROP POLICY IF EXISTS profile_congregations_lelkesz_approve ON public.profile_congregations;

CREATE POLICY profile_congregations_lelkesz_approve
  ON public.profile_congregations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role = 'lelkesz'
        AND p.congregation_id = public.profile_congregations.congregation_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role = 'lelkesz'
        AND p.congregation_id = public.profile_congregations.congregation_id
    )
  );

COMMENT ON POLICY profile_congregations_lelkesz_approve ON public.profile_congregations IS
  $$A lelkész UPDATE-elheti a saját gyülekezetét érintő kéréseket: jóváhagyás, elutasítás, visszavonás. Az alkalmazás oldalán kell garantálni, hogy csak a jóváhagyási mezőket (approval_status, approved_at, approved_by, active) írja, nem pl. congregation_id-t vagy role_scope-ot.$$;


COMMIT;


-- ============================================================================
-- ELLENŐRZŐK — a COMMIT UTÁN futnak, egy futtatásban jön az eredmény
-- ============================================================================

-- A) profile_congregations új oszlopai
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profile_congregations'
  AND column_name IN ('approval_status','approval_reason','approved_at','approved_by','active')
ORDER BY column_name;


-- B) profile_congregations új CHECK constraint
SELECT conname, pg_get_constraintdef(oid) AS constraint_def
FROM pg_constraint
WHERE conrelid = 'public.profile_congregations'::regclass
  AND conname LIKE '%approval_status%';


-- C) current_user_can_access_congregation bővítés (ellenőrzés, hogy approval_status benne van)
SELECT pg_get_functiondef('public.current_user_can_access_congregation(uuid)'::regprocedure) AS def;


-- D) Új helper létezik: current_user_can_edit_congregation
SELECT proname, pg_get_function_result(oid) AS returns
FROM pg_proc
WHERE proname = 'current_user_can_edit_congregation';


-- E) congregations policy-k (várva: 2 sor)
SELECT polname,
       CASE polcmd
         WHEN '*' THEN 'ALL' WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
         WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
       END AS cmd,
       pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check_expr
FROM pg_policy
WHERE polrelid = 'public.congregations'::regclass
ORDER BY polname;


-- F) profile_congregations policy-k (várva: 6 sor — 4 meglévő + 2 új lelkészi)
SELECT polname,
       CASE polcmd
         WHEN '*' THEN 'ALL' WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
         WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
       END AS cmd
FROM pg_policy
WHERE polrelid = 'public.profile_congregations'::regclass
ORDER BY polname;
