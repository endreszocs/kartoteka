-- KARTOTEKA — import_registry_batch movement_elkoltozott ágába hova_congregation_id
-- Dátum: 2026-04-30e (ötödik a napon)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- HÁTTÉR:
-- A 2026-04-30d-transfer-notifications.sql létrehozta a member_transfer_notifications
-- táblát + a trigger-t az elkoltozott-on. A trigger a NEW.hova_congregation_id-t
-- olvassa, hogy generálja-e a notifikációt.
--
-- DE: az import_registry_batch RPC movement_elkoltozott ágában az INSERT még
-- nem tartalmazza a hova_congregation_id mezőt. Ezt most kiegészítjük: ha a
-- v_row jsonb-ben szerepel a 'hova_congregation_id' kulcs, akkor INSERT-eli.
--
-- A többi RPC ág változatlan — ez a fájl csak a movement_elkoltozott ÉS
-- movement_bekoltozott / attert / kitert ágakat módosítja (egységesen, mind
-- a négy mozgásprofilra hozzáadva a hova_congregation_id-t a jövőre).

CREATE OR REPLACE FUNCTION public.import_registry_batch(
    p_target_congregation_id uuid,
    p_profile_key text,
    p_rows jsonb,
    p_default_munkanaploba boolean DEFAULT false
) RETURNS TABLE(inserted_count integer, skipped_count integer, errors jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $import_registry$
DECLARE
    v_caller uuid := auth.uid();
    v_is_master boolean := false;
    v_has_delegated boolean := false;
    v_studio_bypass boolean := false;
    v_row jsonb;
    v_row_idx integer := 0;
    v_inserted integer := 0;
    v_skipped integer := 0;
    v_error_list jsonb := '[]'::jsonb;
    v_baptism_stub jsonb;
    v_baptism_id integer;
    v_egyhazi_value text;
    v_year integer;
BEGIN
    IF v_caller IS NULL THEN
        IF current_user IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') THEN
            v_studio_bypass := true; v_is_master := true;
        ELSE
            RAISE EXCEPTION 'Nincs bejelentkezett felhasználó.';
        END IF;
    END IF;

    IF NOT v_studio_bypass THEN
        v_is_master := EXISTS(SELECT 1 FROM public.profile_roles
            WHERE profile_id = v_caller AND role = 'admin' AND scope = 'system'
              AND active = true AND approval_status = 'approved');
        v_has_delegated := EXISTS(SELECT 1 FROM public.admin_access_requests
            WHERE admin_user_id = v_caller AND congregation_id = p_target_congregation_id
              AND status = 'approved' AND expires_at > now());
        IF NOT v_is_master AND NOT v_has_delegated THEN
            RAISE EXCEPTION 'Nincs jogosultság a(z) % gyülekezethez.', p_target_congregation_id;
        END IF;
    END IF;

    IF p_profile_key NOT IN ('baptism', 'confirmation', 'marriage', 'burial',
        'movement_bekoltozott', 'movement_elkoltozott',
        'movement_attert', 'movement_kitert') THEN
        RAISE EXCEPTION 'Érvénytelen profil-kulcs: %', p_profile_key;
    END IF;

    FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
        v_row_idx := v_row_idx + 1;
        BEGIN
            -- KERESZTELÉS
            IF p_profile_key = 'baptism' THEN
                IF (v_row->>'id_szemely') IS NULL OR NULLIF(v_row->>'datum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely vagy datum');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'datum')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'baptism', v_year);
                END IF;
                INSERT INTO public.keresztseg (
                    id_szemely, datum, lelkeszneve, okirat, egyhazi_szam, keresztszulok,
                    megjegyzes, munkanaploba, helyid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, (v_row->>'datum')::timestamp,
                    NULLIF(v_row->>'lelkeszneve', ''), NULLIF(v_row->>'okirat', ''),
                    v_egyhazi_value, NULLIF(v_row->>'keresztszulok', ''),
                    NULLIF(v_row->>'megjegyzes', ''),
                    COALESCE((v_row->>'munkanaploba')::boolean, p_default_munkanaploba),
                    NULLIF(v_row->>'helyid', '')::integer, p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- KONFIRMÁCIÓ
            ELSIF p_profile_key = 'confirmation' THEN
                IF (v_row->>'id_szemely') IS NULL OR NULLIF(v_row->>'datum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely vagy datum');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_baptism_stub := v_row->'create_baptism_first';
                IF v_baptism_stub IS NOT NULL AND NULLIF(v_baptism_stub->>'datum', '') IS NOT NULL THEN
                    IF NOT EXISTS (SELECT 1 FROM public.keresztseg
                        WHERE id_szemely = (v_row->>'id_szemely')::integer
                          AND datum = (v_baptism_stub->>'datum')::timestamp) THEN
                        v_egyhazi_value := NULLIF(v_baptism_stub->>'egyhazi_szam', '');
                        IF v_egyhazi_value IS NULL THEN
                            v_year := EXTRACT(YEAR FROM (v_baptism_stub->>'datum')::timestamp)::integer;
                            v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'baptism', v_year);
                        END IF;
                        INSERT INTO public.keresztseg (
                            id_szemely, datum, lelkeszneve, helyid, okirat, egyhazi_szam,
                            megjegyzes, munkanaploba, congregation_id
                        ) VALUES (
                            (v_row->>'id_szemely')::integer, (v_baptism_stub->>'datum')::timestamp,
                            NULLIF(v_baptism_stub->>'lelkeszneve', ''),
                            NULLIF(v_baptism_stub->>'helyid', '')::integer,
                            NULLIF(v_baptism_stub->>'okirat', ''),
                            v_egyhazi_value,
                            'Konfirmáció-importtal együtt rögzített keresztelés (' || (v_row->>'datum') || ')',
                            COALESCE((v_baptism_stub->>'munkanaploba')::boolean, p_default_munkanaploba),
                            p_target_congregation_id
                        ) RETURNING id INTO v_baptism_id;
                        v_inserted := v_inserted + 1;
                    END IF;
                END IF;

                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'datum')::date)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'confirmation', v_year);
                END IF;
                INSERT INTO public.konfirmalas (
                    id_szemely, datum, lelkeszneve, keresztelesideje,
                    megjegyzes, helyid, okirat, egyhazi_szam, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, (v_row->>'datum')::date,
                    NULLIF(v_row->>'lelkeszneve', ''), NULLIF(v_row->>'keresztelesideje', '')::date,
                    NULLIF(v_row->>'megjegyzes', ''), NULLIF(v_row->>'helyid', '')::integer,
                    NULLIF(v_row->>'okirat', ''), v_egyhazi_value,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- HÁZASSÁG
            ELSIF p_profile_key = 'marriage' THEN
                IF (v_row->>'id_ferfi') IS NULL OR (v_row->>'id_no') IS NULL OR NULLIF(v_row->>'datum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_ferfi, id_no vagy datum');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'datum')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'marriage', v_year);
                END IF;
                INSERT INTO public.hazassag (
                    id_ferfi, id_no, datum, lelkeszneve, hlevel, egyhazi_szam, tanuk,
                    megjegyzes, munkanaploba, helyid, vegyes, congregation_id
                ) VALUES (
                    (v_row->>'id_ferfi')::integer, (v_row->>'id_no')::integer,
                    (v_row->>'datum')::timestamp, NULLIF(v_row->>'lelkeszneve', ''),
                    NULLIF(v_row->>'hlevel', ''), v_egyhazi_value,
                    NULLIF(v_row->>'tanuk', ''), NULLIF(v_row->>'megjegyzes', ''),
                    COALESCE((v_row->>'munkanaploba')::boolean, p_default_munkanaploba),
                    NULLIF(v_row->>'helyid', '')::integer,
                    COALESCE((v_row->>'vegyes')::boolean, false), p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- TEMETÉS
            ELSIF p_profile_key = 'burial' THEN
                IF (v_row->>'id_szemely') IS NULL OR NULLIF(v_row->>'hdatum', '') IS NULL OR NULLIF(v_row->>'tdatum', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely, hdatum vagy tdatum');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'tdatum')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'burial', v_year);
                END IF;
                INSERT INTO public.temetes (
                    id_szemely, hdatum, hoka, tdatum, lelkeszneve, okirat, egyhazi_szam,
                    megjegyzes, munkanaploba, hhelyid, thelyid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, (v_row->>'hdatum')::timestamp,
                    NULLIF(v_row->>'hoka', ''), (v_row->>'tdatum')::timestamp,
                    NULLIF(v_row->>'lelkeszneve', ''), NULLIF(v_row->>'okirat', ''),
                    v_egyhazi_value, NULLIF(v_row->>'megjegyzes', ''),
                    COALESCE((v_row->>'munkanaploba')::boolean, p_default_munkanaploba),
                    NULLIF(v_row->>'hhelyid', '')::integer,
                    NULLIF(v_row->>'thelyid', '')::integer, p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- BEKÖLTÖZÖTT
            ELSIF p_profile_key = 'movement_bekoltozott' THEN
                IF (v_row->>'id_szemely') IS NULL OR NULLIF(v_row->>'mikor', '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely vagy mikor');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'mikor')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'movement_bekoltozott', v_year);
                END IF;
                INSERT INTO public.bekoltozott (
                    id_szemely, mikor, megjegyzes, igazolas, egyhazi_szam, honnanid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, (v_row->>'mikor')::timestamp,
                    NULLIF(v_row->>'megjegyzes', ''), NULLIF(v_row->>'igazolas', ''),
                    v_egyhazi_value, NULLIF(v_row->>'honnanid', '')::integer,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- ELKÖLTÖZÖTT (2026-04-30 frissítés: hova_congregation_id is INSERT-elve)
            ELSIF p_profile_key = 'movement_elkoltozott' THEN
                IF (v_row->>'id_szemely') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL AND NULLIF(v_row->>'mikor', '') IS NOT NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'mikor')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'movement_elkoltozott', v_year);
                END IF;
                INSERT INTO public.elkoltozott (
                    id_szemely, kulfoldre, mikor, megjegyzes, hovaid, egyhazi_szam,
                    hova_congregation_id, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer,
                    COALESCE((v_row->>'kulfoldre')::boolean, false),
                    NULLIF(v_row->>'mikor', '')::timestamp,
                    NULLIF(v_row->>'megjegyzes', ''),
                    NULLIF(v_row->>'hovaid', '')::integer,
                    v_egyhazi_value,
                    NULLIF(v_row->>'hova_congregation_id', '')::uuid,
                    p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- ÁTTÉRT
            ELSIF p_profile_key = 'movement_attert' THEN
                IF (v_row->>'id_szemely') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL AND NULLIF(v_row->>'mikor', '') IS NOT NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'mikor')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'movement_attert', v_year);
                END IF;
                INSERT INTO public.attert (
                    id_szemely, felekezet, mikor, igazolas, egyhazi_szam, megjegyzes,
                    honnanid, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, NULLIF(v_row->>'felekezet', ''),
                    NULLIF(v_row->>'mikor', '')::timestamp, NULLIF(v_row->>'igazolas', ''),
                    v_egyhazi_value, NULLIF(v_row->>'megjegyzes', ''),
                    NULLIF(v_row->>'honnanid', '')::integer, p_target_congregation_id
                );
                v_inserted := v_inserted + 1;

            -- KITÉRT
            ELSIF p_profile_key = 'movement_kitert' THEN
                IF (v_row->>'id_szemely') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'Hiányzó id_szemely');
                    v_skipped := v_skipped + 1; CONTINUE;
                END IF;
                v_egyhazi_value := NULLIF(v_row->>'egyhazi_szam', '');
                IF v_egyhazi_value IS NULL AND NULLIF(v_row->>'mikor', '') IS NOT NULL THEN
                    v_year := EXTRACT(YEAR FROM (v_row->>'mikor')::timestamp)::integer;
                    v_egyhazi_value := public.generate_egyhazi_anyakonyvi_szam(p_target_congregation_id, 'movement_kitert', v_year);
                END IF;
                INSERT INTO public.kitert (
                    id_szemely, felekezet, mikor, megjegyzes, hovaid, egyhazi_szam, congregation_id
                ) VALUES (
                    (v_row->>'id_szemely')::integer, NULLIF(v_row->>'felekezet', ''),
                    NULLIF(v_row->>'mikor', '')::timestamp, NULLIF(v_row->>'megjegyzes', ''),
                    NULLIF(v_row->>'hovaid', '')::integer,
                    v_egyhazi_value, p_target_congregation_id
                );
                v_inserted := v_inserted + 1;
            END IF;

        EXCEPTION
            WHEN unique_violation THEN
                v_skipped := v_skipped + 1;
                v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'warning', 'message', 'Dupla bejegyzés (UNIQUE) — már létezik');
            WHEN foreign_key_violation THEN
                v_skipped := v_skipped + 1;
                v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', 'FK hiba: ' || SQLERRM);
            WHEN OTHERS THEN
                v_skipped := v_skipped + 1;
                v_error_list := v_error_list || jsonb_build_object('row', v_row_idx, 'severity', 'error', 'message', SQLERRM);
        END;
    END LOOP;

    inserted_count := v_inserted;
    skipped_count := v_skipped;
    errors := v_error_list;
    RETURN NEXT;
END;
$import_registry$;

GRANT EXECUTE ON FUNCTION public.import_registry_batch(uuid, text, jsonb, boolean) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- ELLENŐRZÉS
-- ════════════════════════════════════════════════════════════════════════════
SELECT proname AS function_name, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'import_registry_batch';
