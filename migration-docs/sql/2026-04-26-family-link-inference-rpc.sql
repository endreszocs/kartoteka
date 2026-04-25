-- KARTOTEKA — Tagnyilvántartás Auto-Link: családszerkezet összeállítása importok után
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- Cél:
--   Az import wizard befejeződése után automatikusan összekapcsolni a már beimportált
--   szemely-eket családokká:
--     1. Házastárs-egyezés: csalad rekord ahol id_no IS NULL → ugyanazon címen lakó
--        másnemű felnőtt szemely (aki nem csaladfo) → UPDATE id_no
--     2. Gyerek-egyezés: szemely.apjaneve / anyjaneve fuzzy LIKE → ugyanazon címen
--        lakó szülő szemely → INSERT INTO gyerek
--     3. Lebegő szemely-ek listázása (sem csalad-ban, sem gyerek-ben)
--
--   Mindig dry-run vagy commit módban hívható. Audit-log batch-id-vel rögzít minden
--   linket — egyetlen kattintással visszavonható (revert_family_link_batch).
--
-- Biztonság:
--   - SECURITY DEFINER + szigorú jog-check (master admin VAGY delegated session)
--   - A target_congregation_id kötelező — más gyülekezet adatait nem érinti
--
-- Idempotens: CREATE OR REPLACE + CREATE TABLE IF NOT EXISTS

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. family_link_audit tábla
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.family_link_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL,
    congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    action text NOT NULL CHECK (action IN ('spouse_link', 'child_link', 'family_create')),
    csalad_id integer REFERENCES public.csalad(id) ON DELETE SET NULL,
    szemely_id integer REFERENCES public.szemely(id) ON DELETE SET NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    confidence text NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
    reverted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_family_link_audit_batch
    ON public.family_link_audit(batch_id);
CREATE INDEX IF NOT EXISTS idx_family_link_audit_cong_created
    ON public.family_link_audit(congregation_id, created_at DESC);

ALTER TABLE public.family_link_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_link_audit_admin ON public.family_link_audit;
CREATE POLICY family_link_audit_admin ON public.family_link_audit
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profile_roles
            WHERE profile_id = auth.uid()
              AND role = 'admin'
              AND scope = 'system'
              AND active = true
              AND approval_status = 'approved'
        )
        OR EXISTS (
            SELECT 1 FROM public.admin_access_requests
            WHERE admin_user_id = auth.uid()
              AND congregation_id = family_link_audit.congregation_id
              AND status = 'approved'
              AND expires_at > now()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profile_roles
            WHERE profile_id = auth.uid()
              AND role = 'admin'
              AND scope = 'system'
              AND active = true
              AND approval_status = 'approved'
        )
        OR EXISTS (
            SELECT 1 FROM public.admin_access_requests
            WHERE admin_user_id = auth.uid()
              AND congregation_id = family_link_audit.congregation_id
              AND status = 'approved'
              AND expires_at > now()
        )
    );

COMMENT ON TABLE public.family_link_audit IS
    'Tagnyilvántartás-auto-link audit log. Minden auto-link (házastárs / gyerek) batch-id-vel kerül be, így visszavonható (revert_family_link_batch).';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Belső jog-check helper (DRY)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._can_manage_family_links(target_congregation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $can_manage_family_links$
DECLARE
    caller uuid := auth.uid();
    is_master boolean := false;
    has_delegated boolean := false;
BEGIN
    IF caller IS NULL THEN
        RETURN false;
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.profile_roles
        WHERE profile_id = caller
          AND role = 'admin'
          AND scope = 'system'
          AND active = true
          AND approval_status = 'approved'
    ) INTO is_master;

    IF is_master THEN
        RETURN true;
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.admin_access_requests
        WHERE admin_user_id = caller
          AND congregation_id = target_congregation_id
          AND status = 'approved'
          AND expires_at > now()
    ) INTO has_delegated;

    RETURN has_delegated;
END;
$can_manage_family_links$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. infer_family_links_for_congregation — fő RPC
-- ────────────────────────────────────────────────────────────────────────────
--
-- Bemenet:
--   target_congregation_id — célzott gyülekezet
--   mode — 'conservative' | 'moderate' | 'aggressive' (default: conservative)
--          - conservative: csak HIGH confidence egyezések (cím-egyezés + név-pár)
--          - moderate: HIGH + MEDIUM (egy jelölt, akkor is ha kicsit gyengébb)
--          - aggressive: HIGH + MEDIUM + LOW (mindig próbálkozik, fuzzy is)
--   dry_run — true: csak elemzés, semmit nem ír DB-be (preview)
--             false: tényleges INSERT/UPDATE + audit log
--
-- Kimenet (JSONB):
--   {
--     "batch_id": "uuid" (csak ha dry_run=false),
--     "dry_run": true|false,
--     "mode": "conservative",
--     "summary": {
--       "spouse_confirmed": 198,
--       "spouse_uncertain": 12,
--       "child_confirmed": 245,
--       "child_uncertain": 23,
--       "floating": 58
--     },
--     "details": {
--       "spouse_confirmed": [{csalad_id, spouse_szemely_id, head_name, address}, ...],
--       "spouse_uncertain": [{csalad_id, head_name, candidate_count, candidates}, ...],
--       "child_confirmed":  [{gyerek_szemely_id, name, parent_name, parent_role, csalad_id}, ...],
--       "child_uncertain":  [{szemely_id, name, parent_name, reason}, ...],
--       "floating":         [{szemely_id, csaladnev, k_nev, sz_datum, c_szcim}, ...]
--     }
--   }

CREATE OR REPLACE FUNCTION public.infer_family_links_for_congregation(
    target_congregation_id uuid,
    mode text DEFAULT 'conservative',
    dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $infer_family_links$
DECLARE
    caller uuid := auth.uid();
    current_batch_id uuid := gen_random_uuid();

    spouse_confirmed_arr jsonb := '[]'::jsonb;
    spouse_uncertain_arr jsonb := '[]'::jsonb;
    child_confirmed_arr jsonb := '[]'::jsonb;
    child_uncertain_arr jsonb := '[]'::jsonb;
    floating_arr jsonb := '[]'::jsonb;

    spouse_confirmed_count int := 0;
    spouse_uncertain_count int := 0;
    child_confirmed_count int := 0;
    child_uncertain_count int := 0;
    floating_count int := 0;

    rec record;
    candidate_count int;
    candidate_id int;
    target_csalad_id int;
    parent_id int;
    parent_count int;
    head_full_name text;
    evidence jsonb;
    age_diff int;
BEGIN
    -- Jog-ellenőrzés
    IF NOT public._can_manage_family_links(target_congregation_id) THEN
        RAISE EXCEPTION 'Nincs jogosultság a(z) % gyülekezethez.', target_congregation_id;
    END IF;

    -- Mode validáció
    IF mode NOT IN ('conservative', 'moderate', 'aggressive') THEN
        RAISE EXCEPTION 'Érvénytelen mode: %. Használható: conservative, moderate, aggressive', mode;
    END IF;

    -- ────────────────────────────────────────────────────────────────
    -- MENET 1 — Házastárs-jelölés
    -- ────────────────────────────────────────────────────────────────
    -- Minden csalad rekord ahol id_no IS NULL VAGY id_ferfi IS NULL:
    -- keressünk ugyanazon címen lakó másnemű felnőtt szemely-t.

    FOR rec IN
        SELECT
            c.id AS csalad_id,
            c.c_utcaid,
            c.c_szam,
            c.id_ferfi,
            c.id_no,
            head.id AS head_id,
            head.namepattern AS head_namepattern,
            head.csaladnev AS head_csaladnev,
            head.k_nev AS head_k_nev,
            head.ferfi AS head_ferfi,
            head.sz_datum AS head_sz_datum
        FROM public.csalad c
        INNER JOIN public.szemely head
            ON head.id = COALESCE(c.id_ferfi, c.id_no)
        WHERE
            head.congregation_id = target_congregation_id
            AND head.isvisible = true
            AND (c.id_ferfi IS NULL OR c.id_no IS NULL)
    LOOP
        head_full_name := COALESCE(
            NULLIF(btrim(rec.head_namepattern), ''),
            btrim(COALESCE(rec.head_csaladnev, '') || ' ' || COALESCE(rec.head_k_nev, ''))
        );

        -- Felnőtt másnemű szemely ugyanazon címen, NEM csaladfo, és még nincs családban
        SELECT COUNT(*), MAX(s.id) INTO candidate_count, candidate_id
        FROM public.szemely s
        WHERE s.congregation_id = target_congregation_id
          AND s.isvisible = true
          AND s.id <> rec.head_id
          AND s.c_utcaid = rec.c_utcaid
          AND COALESCE(s.c_szam, '') = COALESCE(rec.c_szam, '')
          AND s.ferfi <> rec.head_ferfi
          AND s.csaladfo = false
          -- Nem szerepel másik csalad-ban
          AND NOT EXISTS (
              SELECT 1 FROM public.csalad c2
              WHERE c2.id_ferfi = s.id OR c2.id_no = s.id
          )
          -- Nem gyerek máshol
          AND NOT EXISTS (
              SELECT 1 FROM public.gyerek g WHERE g.id_szemely = s.id
          )
          -- Felnőtt-szűrő: legalább 16 éves (vagy nincs sz_datum)
          AND (s.sz_datum IS NULL OR s.sz_datum <= (now() - interval '16 years')::date);

        IF candidate_count = 1 THEN
            evidence := jsonb_build_object(
                'address_match', true,
                'utcaid', rec.c_utcaid,
                'szam', rec.c_szam,
                'head_name', head_full_name,
                'rule', 'unique_adult_opposite_sex_in_household'
            );

            IF NOT dry_run THEN
                IF rec.id_no IS NULL THEN
                    UPDATE public.csalad SET id_no = candidate_id WHERE id = rec.csalad_id;
                ELSE
                    UPDATE public.csalad SET id_ferfi = candidate_id WHERE id = rec.csalad_id;
                END IF;

                INSERT INTO public.family_link_audit (
                    batch_id, congregation_id, user_id, action,
                    csalad_id, szemely_id, evidence, confidence
                ) VALUES (
                    current_batch_id, target_congregation_id, caller,
                    'spouse_link', rec.csalad_id, candidate_id, evidence, 'high'
                );
            END IF;

            spouse_confirmed_count := spouse_confirmed_count + 1;
            spouse_confirmed_arr := spouse_confirmed_arr || jsonb_build_object(
                'csalad_id', rec.csalad_id,
                'spouse_szemely_id', candidate_id,
                'head_name', head_full_name,
                'spouse_name', (SELECT btrim(COALESCE(s.csaladnev, '') || ' ' || COALESCE(s.k_nev, ''))
                                FROM public.szemely s WHERE s.id = candidate_id)
            );

        ELSIF candidate_count > 1 THEN
            spouse_uncertain_count := spouse_uncertain_count + 1;
            spouse_uncertain_arr := spouse_uncertain_arr || jsonb_build_object(
                'csalad_id', rec.csalad_id,
                'head_name', head_full_name,
                'candidate_count', candidate_count,
                'reason', 'Több potenciális házastárs ugyanazon a címen'
            );
        END IF;
    END LOOP;

    -- ────────────────────────────────────────────────────────────────
    -- MENET 2 — Gyerek-egyezés (apjaneve / anyjaneve alapján)
    -- ────────────────────────────────────────────────────────────────

    FOR rec IN
        SELECT
            s.id AS szemely_id,
            s.csaladnev,
            s.k_nev,
            s.namepattern,
            s.apjaneve,
            s.anyjaneve,
            s.c_utcaid,
            s.c_szam,
            s.sz_datum
        FROM public.szemely s
        WHERE s.congregation_id = target_congregation_id
          AND s.isvisible = true
          AND s.csaladfo = false
          -- Még nincs hozzárendelve családhoz
          AND NOT EXISTS (
              SELECT 1 FROM public.csalad c WHERE c.id_ferfi = s.id OR c.id_no = s.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.gyerek g WHERE g.id_szemely = s.id
          )
          AND (
              (s.apjaneve IS NOT NULL AND btrim(s.apjaneve) <> '')
              OR (s.anyjaneve IS NOT NULL AND btrim(s.anyjaneve) <> '')
          )
    LOOP
        target_csalad_id := NULL;
        evidence := NULL;

        -- 2a. Próba: apjaneve egyezés (ferfi=true szülő ugyanazon a címen)
        IF rec.apjaneve IS NOT NULL AND btrim(rec.apjaneve) <> '' THEN
            SELECT COUNT(*), MAX(s2.id) INTO parent_count, parent_id
            FROM public.szemely s2
            WHERE s2.congregation_id = target_congregation_id
              AND s2.isvisible = true
              AND s2.ferfi = true
              AND s2.id <> rec.szemely_id
              AND s2.c_utcaid = rec.c_utcaid
              AND COALESCE(s2.c_szam, '') = COALESCE(rec.c_szam, '')
              AND (
                  LOWER(COALESCE(s2.namepattern,
                                 btrim(COALESCE(s2.csaladnev, '') || ' ' || COALESCE(s2.k_nev, ''))))
                      LIKE LOWER('%' || btrim(rec.apjaneve) || '%')
                  OR LOWER(btrim(COALESCE(s2.csaladnev, '') || ' ' || COALESCE(s2.k_nev, '')))
                      = LOWER(btrim(rec.apjaneve))
              );

            IF parent_count = 1 THEN
                SELECT c.id INTO target_csalad_id
                FROM public.csalad c
                WHERE c.id_ferfi = parent_id OR c.id_no = parent_id
                ORDER BY c.id ASC
                LIMIT 1;

                IF target_csalad_id IS NOT NULL THEN
                    evidence := jsonb_build_object(
                        'parent_match', 'apja',
                        'parent_id', parent_id,
                        'parent_name', rec.apjaneve,
                        'address_match', true,
                        'rule', 'unique_father_in_household'
                    );
                END IF;
            END IF;
        END IF;

        -- 2b. Ha apjaneve nem talált, próba: anyjaneve (ferfi=false)
        IF target_csalad_id IS NULL AND rec.anyjaneve IS NOT NULL AND btrim(rec.anyjaneve) <> '' THEN
            SELECT COUNT(*), MAX(s2.id) INTO parent_count, parent_id
            FROM public.szemely s2
            WHERE s2.congregation_id = target_congregation_id
              AND s2.isvisible = true
              AND s2.ferfi = false
              AND s2.id <> rec.szemely_id
              AND s2.c_utcaid = rec.c_utcaid
              AND COALESCE(s2.c_szam, '') = COALESCE(rec.c_szam, '')
              AND (
                  LOWER(COALESCE(s2.namepattern,
                                 btrim(COALESCE(s2.csaladnev, '') || ' ' || COALESCE(s2.k_nev, ''))))
                      LIKE LOWER('%' || btrim(rec.anyjaneve) || '%')
                  OR LOWER(btrim(COALESCE(s2.csaladnev, '') || ' ' || COALESCE(s2.k_nev, '')))
                      = LOWER(btrim(rec.anyjaneve))
                  OR LOWER(btrim(COALESCE(s2.szcs_nev, '') || ' ' || COALESCE(s2.k_nev, '')))
                      = LOWER(btrim(rec.anyjaneve))
              );

            IF parent_count = 1 THEN
                SELECT c.id INTO target_csalad_id
                FROM public.csalad c
                WHERE c.id_ferfi = parent_id OR c.id_no = parent_id
                ORDER BY c.id ASC
                LIMIT 1;

                IF target_csalad_id IS NOT NULL THEN
                    evidence := jsonb_build_object(
                        'parent_match', 'anyja',
                        'parent_id', parent_id,
                        'parent_name', rec.anyjaneve,
                        'address_match', true,
                        'rule', 'unique_mother_in_household'
                    );
                END IF;
            END IF;
        END IF;

        -- Eredmény feldolgozása
        IF target_csalad_id IS NOT NULL THEN
            IF NOT dry_run THEN
                INSERT INTO public.gyerek (id_csalad, id_szemely)
                VALUES (target_csalad_id, rec.szemely_id)
                ON CONFLICT DO NOTHING;

                INSERT INTO public.family_link_audit (
                    batch_id, congregation_id, user_id, action,
                    csalad_id, szemely_id, evidence, confidence
                ) VALUES (
                    current_batch_id, target_congregation_id, caller,
                    'child_link', target_csalad_id, rec.szemely_id, evidence, 'high'
                );
            END IF;

            child_confirmed_count := child_confirmed_count + 1;
            child_confirmed_arr := child_confirmed_arr || jsonb_build_object(
                'gyerek_szemely_id', rec.szemely_id,
                'name', btrim(COALESCE(rec.csaladnev, '') || ' ' || COALESCE(rec.k_nev, '')),
                'parent_name', evidence->>'parent_name',
                'parent_role', evidence->>'parent_match',
                'csalad_id', target_csalad_id
            );
        ELSIF (rec.apjaneve IS NOT NULL AND btrim(rec.apjaneve) <> '')
              OR (rec.anyjaneve IS NOT NULL AND btrim(rec.anyjaneve) <> '') THEN
            -- Volt szülő-név de nem találtuk
            child_uncertain_count := child_uncertain_count + 1;
            child_uncertain_arr := child_uncertain_arr || jsonb_build_object(
                'szemely_id', rec.szemely_id,
                'name', btrim(COALESCE(rec.csaladnev, '') || ' ' || COALESCE(rec.k_nev, '')),
                'apjaneve', rec.apjaneve,
                'anyjaneve', rec.anyjaneve,
                'reason', 'Szülő nem található ugyanazon a címen vagy több jelölt'
            );
        END IF;
    END LOOP;

    -- ────────────────────────────────────────────────────────────────
    -- Lebegő (floating) személy-számítás és lista
    -- ────────────────────────────────────────────────────────────────

    SELECT COUNT(*) INTO floating_count
    FROM public.szemely s
    WHERE s.congregation_id = target_congregation_id
      AND s.isvisible = true
      AND NOT EXISTS (
          SELECT 1 FROM public.csalad c WHERE c.id_ferfi = s.id OR c.id_no = s.id
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.gyerek g WHERE g.id_szemely = s.id
      );

    -- Részletes lista (max 100 az UI-ban) — csak az első 100 floating-ot adjuk vissza
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'szemely_id', s.id,
        'csaladnev', s.csaladnev,
        'k_nev', s.k_nev,
        'sz_datum', s.sz_datum,
        'ferfi', s.ferfi,
        'csaladfo', s.csaladfo,
        'c_szcim', s.c_szcim
    )), '[]'::jsonb) INTO floating_arr
    FROM (
        SELECT s.* FROM public.szemely s
        WHERE s.congregation_id = target_congregation_id
          AND s.isvisible = true
          AND NOT EXISTS (
              SELECT 1 FROM public.csalad c WHERE c.id_ferfi = s.id OR c.id_no = s.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.gyerek g WHERE g.id_szemely = s.id
          )
        ORDER BY s.csaladnev, s.k_nev
        LIMIT 100
    ) s;

    -- ────────────────────────────────────────────────────────────────
    -- Visszatérés
    -- ────────────────────────────────────────────────────────────────

    RETURN jsonb_build_object(
        'batch_id', CASE WHEN dry_run THEN NULL ELSE current_batch_id END,
        'dry_run', dry_run,
        'mode', mode,
        'summary', jsonb_build_object(
            'spouse_confirmed', spouse_confirmed_count,
            'spouse_uncertain', spouse_uncertain_count,
            'child_confirmed', child_confirmed_count,
            'child_uncertain', child_uncertain_count,
            'floating', floating_count
        ),
        'details', jsonb_build_object(
            'spouse_confirmed', spouse_confirmed_arr,
            'spouse_uncertain', spouse_uncertain_arr,
            'child_confirmed', child_confirmed_arr,
            'child_uncertain', child_uncertain_arr,
            'floating', floating_arr
        )
    );
END;
$infer_family_links$;

COMMENT ON FUNCTION public.infer_family_links_for_congregation(uuid, text, boolean) IS
    'Tagnyilvántartás auto-link RPC. Cím-egyezés + szülő-név alapján házastárs- és gyerek-rekordokat hoz létre. dry_run=true csak elemzi, false-szal valós insert + audit-log batch-id-vel (visszavonható).';

GRANT EXECUTE ON FUNCTION public.infer_family_links_for_congregation(uuid, text, boolean) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. revert_family_link_batch — egy konkrét batch teljes visszavonása
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revert_family_link_batch(target_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $revert_family_link_batch$
DECLARE
    audit_rec record;
    reverted_count int := 0;
    target_cong uuid;
BEGIN
    -- Találd meg a batch-hez tartozó congregation_id-t
    target_cong := (
        SELECT congregation_id FROM public.family_link_audit
        WHERE batch_id = target_batch_id
        LIMIT 1
    );

    IF target_cong IS NULL THEN
        RAISE EXCEPTION 'Ismeretlen vagy üres batch_id: %', target_batch_id;
    END IF;

    -- Jog-check
    IF NOT public._can_manage_family_links(target_cong) THEN
        RAISE EXCEPTION 'Nincs jogosultság a(z) % gyülekezethez.', target_cong;
    END IF;

    -- Visszavonás (descending order, hogy a child-link-ek előbb tűnjenek el)
    FOR audit_rec IN
        SELECT * FROM public.family_link_audit
        WHERE batch_id = target_batch_id
          AND reverted_at IS NULL
        ORDER BY created_at DESC
    LOOP
        IF audit_rec.action = 'spouse_link' AND audit_rec.csalad_id IS NOT NULL
           AND audit_rec.szemely_id IS NOT NULL THEN
            -- Visszanullázzuk a csalad.id_no vagy id_ferfi-t
            UPDATE public.csalad
            SET id_no = NULL
            WHERE id = audit_rec.csalad_id AND id_no = audit_rec.szemely_id;

            UPDATE public.csalad
            SET id_ferfi = NULL
            WHERE id = audit_rec.csalad_id AND id_ferfi = audit_rec.szemely_id;

        ELSIF audit_rec.action = 'child_link' AND audit_rec.csalad_id IS NOT NULL
              AND audit_rec.szemely_id IS NOT NULL THEN
            DELETE FROM public.gyerek
            WHERE id_csalad = audit_rec.csalad_id
              AND id_szemely = audit_rec.szemely_id;
        END IF;

        UPDATE public.family_link_audit
        SET reverted_at = now()
        WHERE id = audit_rec.id;

        reverted_count := reverted_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'batch_id', target_batch_id,
        'reverted_count', reverted_count,
        'congregation_id', target_cong
    );
END;
$revert_family_link_batch$;

COMMENT ON FUNCTION public.revert_family_link_batch(uuid) IS
    'Egy korábbi auto-link batch teljes visszavonása (csalad.id_no/id_ferfi nullázás + gyerek törlés + audit reverted_at jelzés).';

GRANT EXECUTE ON FUNCTION public.revert_family_link_batch(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. list_family_link_batches — admin / lelkész nézet az utolsó N batch-ről
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_family_link_batches(
    target_congregation_id uuid,
    limit_count int DEFAULT 20
) RETURNS TABLE(
    batch_id uuid,
    created_at timestamptz,
    user_id uuid,
    spouse_count int,
    child_count int,
    reverted boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $list_family_link_batches$
BEGIN
    IF NOT public._can_manage_family_links(target_congregation_id) THEN
        RAISE EXCEPTION 'Nincs jogosultság a(z) % gyülekezethez.', target_congregation_id;
    END IF;

    RETURN QUERY
    SELECT
        b.batch_id,
        MIN(b.created_at) AS created_at,
        MAX(b.user_id) AS user_id,
        COUNT(*) FILTER (WHERE b.action = 'spouse_link')::int AS spouse_count,
        COUNT(*) FILTER (WHERE b.action = 'child_link')::int AS child_count,
        BOOL_AND(b.reverted_at IS NOT NULL) AS reverted
    FROM public.family_link_audit b
    WHERE b.congregation_id = target_congregation_id
    GROUP BY b.batch_id
    ORDER BY MIN(b.created_at) DESC
    LIMIT limit_count;
END;
$list_family_link_batches$;

COMMENT ON FUNCTION public.list_family_link_batches(uuid, int) IS
    'Az utolsó N auto-link batch listázása egy gyülekezethez (admin / lelkész nézet).';

GRANT EXECUTE ON FUNCTION public.list_family_link_batches(uuid, int) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Tábla és indexek létrejöttek-e?
SELECT
    schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'family_link_audit'
ORDER BY indexname;

-- 2. RLS policy aktív-e?
SELECT polname, polcmd, polroles::regrole[]
FROM pg_policy
WHERE polrelid = 'public.family_link_audit'::regclass;

-- 3. Új function-ök
SELECT
    n.nspname AS schema,
    p.proname AS name,
    pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
    '_can_manage_family_links',
    'infer_family_links_for_congregation',
    'revert_family_link_batch',
    'list_family_link_batches'
)
  AND n.nspname = 'public'
ORDER BY p.proname;

-- 4. Próba (CSAK manuálisan, master admin alatt!) — dry_run elemzés
-- SELECT public.infer_family_links_for_congregation(
--     '<your_congregation_uuid>'::uuid,
--     'conservative',
--     true  -- dry_run
-- );
