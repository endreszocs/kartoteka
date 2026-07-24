-- ============================================================================
-- PR-1 (tagnyilvántartás, település-P0) — import_family_head_batch HARDENING
-- Dátum: 2026-07-17
-- Terv: docs/project-tracking/KARTOTEKA-tagnyilvantartas-finomhangolas-terv-2026-07-17.md (F3.2)
--
-- MIT JAVÍT:
--   A tag-import eddig úgy hozott létre személyeket, hogy a szemely.c_helysegid
--   (település FK) NULL maradt, ha a wizard helység-map lookupja nem talált
--   (gyökérok: ékezet-normalizálási eltérés a kliens és a normalize_name között —
--   a webes fix ugyanebben a PR-ban van). Ez a migráció VÉDŐHÁLÓ: ha a map-lookup
--   bármiért üres, a c_helysegid az utca feloldott településéből
--   (adrstreet.localityid) pótlódik — az utcát a _resolve_or_create_street
--   ugyanebben a tranzakcióban, a sor Helység-szövegéből oldja fel.
--
--   FONTOS ŐR: a fallback CSAK akkor fut, ha a sorban VOLT Helység-szöveg
--   (v_helyseg_input IS NOT NULL). Helység-oszlop nélküli importnál a
--   _resolve_or_create_street az "első" adrlocality-hoz köthet (ismert latens
--   viselkedés) — ilyenkor NEM találunk ki települést a személynek.
--
-- ELŐFELTÉTEL-ELLENŐRZÉS (futtasd először; a diagnosztika F2 blokkja is fedi):
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname='public' AND p.proname='import_family_head_batch';
--   -- Várt: EGYETLEN sor: (target_congregation_id uuid, rows jsonb,
--   --        p_resolved_locality_map jsonb, p_resolved_street_postalcodes jsonb)
--   -- Ha MÁS a szignatúra, ÁLLJ MEG és jelezd!
-- ============================================================================

CREATE OR REPLACE FUNCTION public.import_family_head_batch(
    target_congregation_id uuid,
    rows jsonb,
    p_resolved_locality_map jsonb DEFAULT NULL,
    p_resolved_street_postalcodes jsonb DEFAULT NULL
) RETURNS TABLE(
    inserted_szemely integer,
    inserted_csalad integer,
    errors jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $import_family_head$
DECLARE
    v_caller_user_id uuid := auth.uid();
    v_is_master boolean := false;
    v_has_delegated boolean := false;
    v_row_data jsonb;
    v_row_idx integer := 0;
    v_new_szemely_id integer;
    v_street_id integer;
    v_cnp_value text;
    v_error_list jsonb := '[]'::jsonb;
    v_szemely_count integer := 0;
    v_csalad_count integer := 0;
    v_create_csalad_flag boolean;
    v_explicit_ferfi text;
    v_inferred_ferfi boolean;
    v_inference_source text;
    v_helyseg_input text;
    v_utca_input text;
    v_resolved_locality_id integer;
    v_resolved_postalcode text;
    v_postalcode_key text;
BEGIN
    -- Jog-ellenőrzés
    IF v_caller_user_id IS NULL THEN
        RAISE EXCEPTION 'Nincs bejelentkezett felhasználó.';
    END IF;

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

    -- Sorok feldolgozása
    FOR v_row_data IN SELECT * FROM jsonb_array_elements(rows) LOOP
        v_row_idx := v_row_idx + 1;
        BEGIN
            -- Kötelező: családnév + keresztnév
            IF NULLIF(btrim(COALESCE(v_row_data->>'csaladnev', '')), '') IS NULL
               OR NULLIF(btrim(COALESCE(v_row_data->>'k_nev', '')), '') IS NULL THEN
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx,
                    'severity', 'error',
                    'message', 'Hiányzó kötelező mező: Családnév vagy Keresztnév'
                );
                CONTINUE;
            END IF;

            -- HELYSÉG-RESOLVÁLÁS
            v_helyseg_input := NULLIF(btrim(COALESCE(v_row_data->>'_helyseg_text', '')), '');
            v_utca_input := NULLIF(btrim(COALESCE(v_row_data->>'_utca_text', '')), '');
            v_resolved_locality_id := NULL;
            v_resolved_postalcode := NULL;

            IF p_resolved_locality_map IS NOT NULL AND v_helyseg_input IS NOT NULL THEN
                v_resolved_locality_id := (
                    p_resolved_locality_map->>(public.normalize_name(v_helyseg_input))
                )::integer;
            END IF;

            -- POSTAKÓD-RESOLVÁLÁS (csak ha helység + utca van)
            IF p_resolved_street_postalcodes IS NOT NULL
               AND v_helyseg_input IS NOT NULL
               AND v_utca_input IS NOT NULL THEN
                -- Kulcs: "helyseg_normalized|utca_normalized"
                v_postalcode_key :=
                    public.normalize_name(v_helyseg_input) || '|' ||
                    public.normalize_name(v_utca_input);
                v_resolved_postalcode := p_resolved_street_postalcodes->>v_postalcode_key;
            END IF;

            -- Utca lookup
            v_street_id := public._resolve_or_create_street(
                v_utca_input,
                v_helyseg_input,
                v_resolved_locality_id,
                v_resolved_postalcode
            );

            IF v_street_id IS NULL THEN
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx,
                    'severity', 'error',
                    'message', 'A rendszerben nincs egyetlen megye sem — utca-lookup lehetetlen'
                );
                CONTINUE;
            END IF;

            -- ═══════════════════════════════════════════════════════════════
            -- 2026-07-17 (PR-1) VÉDŐHÁLÓ: ha a helység-map lookup üres maradt
            -- (bármilyen normalizálási/lefedettségi hibából), a települést az
            -- utca feloldott localityid-jából pótoljuk — a _resolve_or_create_street
            -- az imént, ugyanebből a Helység-szövegből oldotta fel/hozta létre.
            -- CSAK akkor, ha a sorban ténylegesen VOLT Helység-adat.
            -- ═══════════════════════════════════════════════════════════════
            IF v_resolved_locality_id IS NULL AND v_helyseg_input IS NOT NULL THEN
                v_resolved_locality_id := (
                    SELECT localityid FROM public.adrstreet WHERE id = v_street_id
                );
            END IF;

            -- Egyházi CNP
            v_cnp_value := NULLIF(btrim(COALESCE(v_row_data->>'cnp', '')), '');
            IF v_cnp_value IS NULL THEN
                v_cnp_value := public.generate_egyhazi_cnp();
            ELSE
                v_cnp_value := substr(v_cnp_value, 1, 20);
            END IF;

            v_create_csalad_flag := COALESCE((v_row_data->>'create_csalad')::boolean, true);

            -- Smart gender inference
            v_explicit_ferfi := NULLIF(btrim(COALESCE(v_row_data->>'ferfi', '')), '');
            IF v_explicit_ferfi IS NOT NULL THEN
                v_inferred_ferfi := (v_row_data->>'ferfi')::boolean;
                v_inference_source := 'explicit';
            ELSIF NULLIF(btrim(COALESCE(v_row_data->>'ferjk_nev', '')), '') IS NOT NULL THEN
                v_inferred_ferfi := false;
                v_inference_source := 'spouse_field';
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx,
                    'severity', 'info',
                    'message', 'A "Férfi" mező hiányzott, de a "Férje" oszlop ki van töltve — automatikusan nő.',
                    'name', btrim(COALESCE(v_row_data->>'csaladnev', '') || ' ' || COALESCE(v_row_data->>'k_nev', ''))
                );
            ELSE
                v_inferred_ferfi := true;
                v_inference_source := 'defaulted';
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx,
                    'severity', 'warning',
                    'message', 'A "Férfi" mező hiányzott — alapértelmezésben férfiként importálva. Ellenőrizd a tagnyilvántartásban!',
                    'name', btrim(COALESCE(v_row_data->>'csaladnev', '') || ' ' || COALESCE(v_row_data->>'k_nev', ''))
                );
            END IF;

            -- INSERT szemely
            INSERT INTO public.szemely (
                cnp, csaladnev, k_nev, szcs_nev, allapot, namepattern,
                apjaneve, anyjaneve, ferjk_nev,
                csaladfo, ferfi, meghalt,
                sz_datum, foglalkozas, vallas,
                c_utcaid, c_helysegid, c_szam, c_tombhaz, c_szcim,
                telefon, email,
                befizetoev,
                congregation_id, isvisible, type, created
            ) VALUES (
                v_cnp_value,
                substr(btrim(v_row_data->>'csaladnev'), 1, 30),
                substr(btrim(v_row_data->>'k_nev'), 1, 25),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'szcs_nev', '')), ''), 1, 100),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'allapot', '')), ''), 1, 10),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'namepattern', '')), ''), 1, 15),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'apjaneve', '')), ''), 1, 25),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'anyjaneve', '')), ''), 1, 25),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'ferjk_nev', '')), ''), 1, 25),
                COALESCE((v_row_data->>'csaladfo')::boolean, false),
                v_inferred_ferfi,
                COALESCE((v_row_data->>'meghalt')::boolean, false),
                NULLIF(v_row_data->>'sz_datum', '')::date,
                substr(NULLIF(btrim(COALESCE(v_row_data->>'foglalkozas', '')), ''), 1, 25),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'vallas', '')), ''), 1, 25),
                v_street_id,
                v_resolved_locality_id,
                substr(NULLIF(btrim(COALESCE(v_row_data->>'c_szam', '')), ''), 1, 10),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'c_tombhaz', '')), ''), 1, 5),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'c_szcim', '')), ''), 1, 80),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'telefon', '')), ''), 1, 50),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'email', '')), ''), 1, 50),
                COALESCE((v_row_data->>'befizetoev')::integer, EXTRACT(YEAR FROM now())::integer),
                target_congregation_id,
                true,
                'L',
                now()
            )
            RETURNING id INTO v_new_szemely_id;

            v_szemely_count := v_szemely_count + 1;

            -- csalad insert
            IF v_create_csalad_flag THEN
                IF NULLIF(btrim(COALESCE(v_row_data->>'c_szam', '')), '') IS NULL THEN
                    v_error_list := v_error_list || jsonb_build_object(
                        'row', v_row_idx,
                        'severity', 'warning',
                        'message', 'Szemely beszúrva, de a csalad rekord kihagyva (hiányzó házszám)',
                        'name', btrim(COALESCE(v_row_data->>'csaladnev', '') || ' ' || COALESCE(v_row_data->>'k_nev', ''))
                    );
                ELSE
                    INSERT INTO public.csalad (
                        id_ferfi, id_no, c_utcaid, c_szam, c_tombhaz, isaktiv
                    ) VALUES (
                        CASE WHEN v_inferred_ferfi THEN v_new_szemely_id ELSE NULL END,
                        CASE WHEN v_inferred_ferfi THEN NULL ELSE v_new_szemely_id END,
                        v_street_id,
                        substr(btrim(v_row_data->>'c_szam'), 1, 10),
                        substr(NULLIF(btrim(COALESCE(v_row_data->>'c_tombhaz', '')), ''), 1, 5),
                        true
                    );

                    v_csalad_count := v_csalad_count + 1;
                END IF;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            v_error_list := v_error_list || jsonb_build_object(
                'row', v_row_idx,
                'severity', 'error',
                'message', SQLERRM
            );
        END;
    END LOOP;

    inserted_szemely := v_szemely_count;
    inserted_csalad := v_csalad_count;
    errors := v_error_list;
    RETURN NEXT;
END;
$import_family_head$;

COMMENT ON FUNCTION public.import_family_head_batch(uuid, jsonb, jsonb, jsonb) IS
    'Tagnyilvántartás-import RPC. 2026-07-17 (PR-1): c_helysegid-fallback az utca feloldott településéből, ha a helység-map lookup üres (csak ha a sorban volt Helység-adat). 4 paraméter: target_congregation_id, rows, p_resolved_locality_map, p_resolved_street_postalcodes.';

GRANT EXECUTE ON FUNCTION public.import_family_head_batch(uuid, jsonb, jsonb, jsonb) TO authenticated;

-- ============================================================================
-- VERIFIKÁCIÓ (futtasd a migráció után):
-- ============================================================================
-- 1) A fallback benne van-e az éles definícióban:
SELECT position('VÉDŐHÁLÓ' IN pg_get_functiondef('public.import_family_head_batch(uuid, jsonb, jsonb, jsonb)'::regprocedure)) > 0
  AS fallback_telepitve;
-- Várt: true
