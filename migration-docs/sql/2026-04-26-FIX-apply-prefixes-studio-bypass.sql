-- KARTOTEKA — apply_id_ifj_prefixes_for_congregation Studio-bypass
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- Hiba a v2-ben:
-- A Supabase Studio SQL Editor a `postgres` superuser szerepkörben fut,
-- NEM mint authentikált kliens. Az `auth.uid()` ezért NULL → "Nincs
-- bejelentkezett felhasználó" hiba.
--
-- Javítás:
-- A függvény most superuser bypass-szal is futtatható:
-- - Ha `auth.uid()` NULL ÉS a current_user `postgres` / `supabase_admin` /
--   `service_role` → bypass az auth checket, master_admin = true
-- - Egyébként a régi auth-flow (kliens-rpc-ből hívva)
--
-- Idempotens: CREATE OR REPLACE FUNCTION

BEGIN;

CREATE OR REPLACE FUNCTION public.apply_id_ifj_prefixes_for_congregation(
    target_congregation_id uuid
) RETURNS TABLE(
    updated_count integer,
    skipped_existing_prefix integer,
    groups jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $apply_prefix$
DECLARE
    v_caller_user_id uuid := auth.uid();
    v_is_master boolean := false;
    v_has_delegated boolean := false;
    v_studio_bypass boolean := false;
    v_dup_group record;
    v_szemely record;
    v_idx integer;
    v_prefix text;
    v_existing_namepattern text;
    v_has_existing_prefix boolean;
    v_updated_count integer := 0;
    v_skipped_count integer := 0;
    v_groups_arr jsonb := '[]'::jsonb;
    v_group_members jsonb;
BEGIN
    -- Studio-bypass detection: ha NINCS auth.uid(), de superuser-szerű role-ban
    -- vagyunk, akkor engedjük (csak a Postgres SQL Editor-ből hívható)
    IF v_caller_user_id IS NULL THEN
        IF current_user IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') THEN
            v_studio_bypass := true;
            v_is_master := true;
        ELSE
            RAISE EXCEPTION 'Nincs bejelentkezett felhasználó.';
        END IF;
    END IF;

    -- Ha NEM Studio-bypass, ellenőrizzük a normál jogosultságokat
    IF NOT v_studio_bypass THEN
        v_is_master := EXISTS(
            SELECT 1 FROM public.profile_roles
            WHERE profile_id = v_caller_user_id
              AND role = 'admin' AND scope = 'system'
              AND active = true AND approval_status = 'approved'
        );

        v_has_delegated := EXISTS(
            SELECT 1 FROM public.admin_access_requests
            WHERE admin_user_id = v_caller_user_id
              AND congregation_id = target_congregation_id
              AND status = 'approved' AND expires_at > now()
        );

        IF NOT v_is_master AND NOT v_has_delegated THEN
            RAISE EXCEPTION 'Nincs jogosultság a(z) % gyülekezethez.', target_congregation_id;
        END IF;
    END IF;

    -- Iteráljunk minden duplikált (csaladnev, k_nev, ferfi) csoporton
    FOR v_dup_group IN
        SELECT
            csaladnev,
            k_nev,
            ferfi,
            COUNT(*) AS db
        FROM public.szemely
        WHERE congregation_id = target_congregation_id
          AND isvisible = true
          AND csaladnev IS NOT NULL
          AND k_nev IS NOT NULL
        GROUP BY csaladnev, k_nev, ferfi
        HAVING COUNT(*) > 1
    LOOP
        v_idx := 0;
        v_group_members := '[]'::jsonb;

        FOR v_szemely IN
            SELECT id, sz_datum, namepattern, csaladnev, k_nev
            FROM public.szemely
            WHERE congregation_id = target_congregation_id
              AND isvisible = true
              AND csaladnev = v_dup_group.csaladnev
              AND k_nev = v_dup_group.k_nev
              AND ferfi = v_dup_group.ferfi
            ORDER BY sz_datum ASC NULLS LAST, id ASC
        LOOP
            v_idx := v_idx + 1;

            -- Az első (legidősebb) → "id.", a többi → "ifj."
            IF v_idx = 1 THEN
                v_prefix := 'id.';
            ELSE
                v_prefix := 'ifj.';
            END IF;

            v_existing_namepattern := COALESCE(v_szemely.namepattern, '');

            -- Detektáljuk: van-e MÁR prefix a namepattern-ben?
            v_has_existing_prefix := length(btrim(v_existing_namepattern)) > 0
                AND length(btrim(v_existing_namepattern)) <= 6
                AND btrim(v_existing_namepattern) LIKE '%.';

            IF v_has_existing_prefix THEN
                v_skipped_count := v_skipped_count + 1;
                v_group_members := v_group_members || jsonb_build_object(
                    'id', v_szemely.id,
                    'name', v_szemely.csaladnev || ' ' || v_szemely.k_nev,
                    'sz_datum', v_szemely.sz_datum,
                    'action', 'skipped',
                    'reason', 'már van prefix: ' || v_existing_namepattern
                );
                CONTINUE;
            END IF;

            -- v2: CSAK a prefix kerül a namepattern-be
            UPDATE public.szemely
            SET namepattern = v_prefix
            WHERE id = v_szemely.id;

            v_updated_count := v_updated_count + 1;

            v_group_members := v_group_members || jsonb_build_object(
                'id', v_szemely.id,
                'name', v_szemely.csaladnev || ' ' || v_szemely.k_nev,
                'sz_datum', v_szemely.sz_datum,
                'action', 'updated',
                'prefix', v_prefix
            );
        END LOOP;

        v_groups_arr := v_groups_arr || jsonb_build_object(
            'csaladnev', v_dup_group.csaladnev,
            'k_nev', v_dup_group.k_nev,
            'ferfi', v_dup_group.ferfi,
            'count', v_dup_group.db,
            'members', v_group_members
        );
    END LOOP;

    updated_count := v_updated_count;
    skipped_existing_prefix := v_skipped_count;
    groups := v_groups_arr;
    RETURN NEXT;
END;
$apply_prefix$;

COMMENT ON FUNCTION public.apply_id_ifj_prefixes_for_congregation(uuid) IS
    'v2 + Studio bypass: ha auth.uid() NULL és current_user superuser, engedjük (Studio SQL Editor-ből futtatható).';

GRANT EXECUTE ON FUNCTION public.apply_id_ifj_prefixes_for_congregation(uuid) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === HASZNÁLAT ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Megint próbálkozz a hívással:
-- SELECT * FROM public.apply_id_ifj_prefixes_for_congregation(
--     '<a_te_gyulekezet_uuid>'::uuid
-- );

-- 2. Ha siker — ellenőrzés:
-- SELECT
--     namepattern AS prefix,
--     COUNT(*) AS db,
--     array_agg(csaladnev || ' ' || k_nev ORDER BY sz_datum) FILTER (WHERE namepattern = 'id.') AS idosebbek,
--     array_agg(csaladnev || ' ' || k_nev ORDER BY sz_datum) FILTER (WHERE namepattern = 'ifj.') AS ifjabbak
-- FROM public.szemely
-- WHERE namepattern IN ('id.', 'ifj.')
-- GROUP BY namepattern;
