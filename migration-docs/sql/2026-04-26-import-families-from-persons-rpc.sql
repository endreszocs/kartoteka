-- KARTOTEKA — "Csak családokká szervezés" import RPC
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- Cél: a wizard új import-módja — "Csak családokká szervezés meglévő tagokból".
-- A személyek MÁR fent vannak az adatbázisban (előzőleg importálva). A `csaladok.xml`
-- minden sora egy CSALÁDOT definiál — a wizard megtalálja a szemely-t a név + nem
-- alapján és csalad-rekordot hoz létre.
--
-- Bemenet:
--   target_congregation_id — célzott gyülekezet
--   rows JSONB — array, minden elem egy "család" definíció:
--     {
--       "csaladnev": "Tamás",      // a családfő (családnév)
--       "k_nev": "Gábor",          // a családfő (keresztnév)
--       "ferfi": true/false,       // a családfő neme
--       "sz_datum": "1928-03-07",  // opcionális tie-breaker
--       "_utca_text": "Templom",
--       "_helyseg_text": "Barátos",
--       "c_szam": "229",
--       "c_tombhaz": "...",
--       "apjaneve": "...",         // gyerek-egyezéshez
--       "anyjaneve": "...",        // gyerek-egyezéshez
--     }
--   p_resolved_locality_map — wizard helység-egyeztetés (opcionális)
--   p_resolved_street_postalcodes — wizard utca-postakód (opcionális)
--
-- Kimenet:
--   inserted_csalad — hány csalad rekord készült
--   inserted_gyerek — hány gyerek-junction beszúrva (auto-detection)
--   not_found — hány sor nem talált meg szemely-t (warning)
--   errors — JSONB lista (severity, row, message, name)

BEGIN;

-- DROP régi (ha van olyan signature)
DROP FUNCTION IF EXISTS public.import_families_from_existing_persons_batch(uuid, jsonb, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.import_families_from_existing_persons_batch(
    target_congregation_id uuid,
    rows jsonb,
    p_resolved_locality_map jsonb DEFAULT NULL,
    p_resolved_street_postalcodes jsonb DEFAULT NULL
) RETURNS TABLE(
    inserted_csalad integer,
    inserted_gyerek integer,
    not_found integer,
    errors jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $import_families$
DECLARE
    v_caller_user_id uuid := auth.uid();
    v_is_master boolean := false;
    v_has_delegated boolean := false;
    v_row_data jsonb;
    v_row_idx integer := 0;
    v_found_szemely_id integer;
    v_found_count integer;
    v_street_id integer;
    v_new_csalad_id integer;
    v_resolved_locality_id integer;
    v_resolved_postalcode text;
    v_helyseg_input text;
    v_utca_input text;
    v_postalcode_key text;
    v_norm_target_name text;
    v_target_ferfi boolean;
    v_error_list jsonb := '[]'::jsonb;
    v_csalad_count integer := 0;
    v_gyerek_count integer := 0;
    v_not_found_count integer := 0;
    v_apjaneve text;
    v_anyjaneve text;
    v_gyerek_szemely record;
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
            -- Kötelező: csaladnev + k_nev
            IF NULLIF(btrim(COALESCE(v_row_data->>'csaladnev', '')), '') IS NULL
               OR NULLIF(btrim(COALESCE(v_row_data->>'k_nev', '')), '') IS NULL THEN
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx,
                    'severity', 'error',
                    'message', 'Hiányzó kötelező mező: Családnév vagy Keresztnév'
                );
                CONTINUE;
            END IF;

            v_norm_target_name := public.normalize_name(
                COALESCE(v_row_data->>'csaladnev', '') || ' ' || COALESCE(v_row_data->>'k_nev', '')
            );
            v_target_ferfi := COALESCE((v_row_data->>'ferfi')::boolean, true);

            -- ────────────────────────────────────────────────────
            -- SZEMÉLY LOOKUP: csaladnev + k_nev + ferfi
            -- (sz_datum tie-breaker ha többre is matchel)
            -- ────────────────────────────────────────────────────
            v_found_szemely_id := NULL;
            v_found_count := 0;

            -- Először count, majd ha 1 találat → ID, ha több → tie-break
            SELECT COUNT(*) INTO v_found_count
            FROM public.szemely s
            WHERE s.congregation_id = target_congregation_id
              AND s.isvisible = true
              AND s.ferfi = v_target_ferfi
              AND public.normalize_name(
                  COALESCE(s.csaladnev, '') || ' ' || COALESCE(s.k_nev, '')
              ) = v_norm_target_name;

            IF v_found_count = 0 THEN
                v_not_found_count := v_not_found_count + 1;
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx,
                    'severity', 'warning',
                    'message', 'Nem található ilyen tag a tagnyilvántartásban — család nem jött létre. Vedd fel manuálisan vagy importálj új tagokat előbb.',
                    'name', btrim(COALESCE(v_row_data->>'csaladnev', '') || ' ' || COALESCE(v_row_data->>'k_nev', ''))
                );
                CONTINUE;
            ELSIF v_found_count = 1 THEN
                SELECT s.id INTO v_found_szemely_id
                FROM public.szemely s
                WHERE s.congregation_id = target_congregation_id
                  AND s.isvisible = true
                  AND s.ferfi = v_target_ferfi
                  AND public.normalize_name(
                      COALESCE(s.csaladnev, '') || ' ' || COALESCE(s.k_nev, '')
                  ) = v_norm_target_name;
            ELSE
                -- TIE-BREAKER: sz_datum egyezés (ha az XML-ben van)
                IF NULLIF(v_row_data->>'sz_datum', '') IS NOT NULL THEN
                    SELECT s.id INTO v_found_szemely_id
                    FROM public.szemely s
                    WHERE s.congregation_id = target_congregation_id
                      AND s.isvisible = true
                      AND s.ferfi = v_target_ferfi
                      AND public.normalize_name(
                          COALESCE(s.csaladnev, '') || ' ' || COALESCE(s.k_nev, '')
                      ) = v_norm_target_name
                      AND s.sz_datum = (v_row_data->>'sz_datum')::date
                    LIMIT 1;
                END IF;

                -- Ha tie-break sem segített, vegyük az elsőt + warning
                IF v_found_szemely_id IS NULL THEN
                    SELECT s.id INTO v_found_szemely_id
                    FROM public.szemely s
                    WHERE s.congregation_id = target_congregation_id
                      AND s.isvisible = true
                      AND s.ferfi = v_target_ferfi
                      AND public.normalize_name(
                          COALESCE(s.csaladnev, '') || ' ' || COALESCE(s.k_nev, '')
                      ) = v_norm_target_name
                    ORDER BY s.id
                    LIMIT 1;

                    v_error_list := v_error_list || jsonb_build_object(
                        'row', v_row_idx,
                        'severity', 'warning',
                        'message', format(
                            'Több (%s) azonos nevű és nemű tag — az elsőt választottuk. Ellenőrizd kézzel!',
                            v_found_count
                        ),
                        'name', btrim(COALESCE(v_row_data->>'csaladnev', '') || ' ' || COALESCE(v_row_data->>'k_nev', ''))
                    );
                END IF;
            END IF;

            -- ────────────────────────────────────────────────────
            -- HELYSÉG-RESOLVÁLÁS
            -- ────────────────────────────────────────────────────
            v_helyseg_input := NULLIF(btrim(COALESCE(v_row_data->>'_helyseg_text', '')), '');
            v_utca_input := NULLIF(btrim(COALESCE(v_row_data->>'_utca_text', '')), '');
            v_resolved_locality_id := NULL;
            v_resolved_postalcode := NULL;

            IF p_resolved_locality_map IS NOT NULL AND v_helyseg_input IS NOT NULL THEN
                v_resolved_locality_id := (
                    p_resolved_locality_map->>(public.normalize_name(v_helyseg_input))
                )::integer;
            END IF;

            IF p_resolved_street_postalcodes IS NOT NULL
               AND v_helyseg_input IS NOT NULL
               AND v_utca_input IS NOT NULL THEN
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
                    'message', 'Cím-resolválás sikertelen — család nem jött létre.',
                    'name', btrim(COALESCE(v_row_data->>'csaladnev', '') || ' ' || COALESCE(v_row_data->>'k_nev', ''))
                );
                CONTINUE;
            END IF;

            -- Házszám: kötelező a csalad insertnél
            IF NULLIF(btrim(COALESCE(v_row_data->>'c_szam', '')), '') IS NULL THEN
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx,
                    'severity', 'warning',
                    'message', 'Hiányzó házszám — család nem jön létre.',
                    'name', btrim(COALESCE(v_row_data->>'csaladnev', '') || ' ' || COALESCE(v_row_data->>'k_nev', ''))
                );
                CONTINUE;
            END IF;

            -- ────────────────────────────────────────────────────
            -- CSALAD INSERT — szülő szerepkör a ferfi flag alapján
            -- ────────────────────────────────────────────────────
            INSERT INTO public.csalad (
                id_ferfi, id_no, c_utcaid, c_szam, c_tombhaz, isaktiv
            ) VALUES (
                CASE WHEN v_target_ferfi THEN v_found_szemely_id ELSE NULL END,
                CASE WHEN v_target_ferfi THEN NULL ELSE v_found_szemely_id END,
                v_street_id,
                substr(btrim(v_row_data->>'c_szam'), 1, 10),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'c_tombhaz', '')), ''), 1, 5),
                true
            )
            RETURNING id INTO v_new_csalad_id;

            v_csalad_count := v_csalad_count + 1;

            -- ────────────────────────────────────────────────────
            -- AUTOMATIC GYEREK-EGYEZÉS (Apja/Anyja alapján)
            -- ────────────────────────────────────────────────────
            -- Megkeresünk minden ugyanazon (c_utcaid, c_szam)-on lakó szemely-t,
            -- akinek apjaneve VAGY anyjaneve a most beszúrt csaladfő nevével egyezik.
            v_apjaneve := COALESCE(v_row_data->>'apjaneve', '');
            v_anyjaneve := COALESCE(v_row_data->>'anyjaneve', '');

            FOR v_gyerek_szemely IN
                SELECT s.id, s.csaladnev, s.k_nev, s.apjaneve AS gyerek_apjaneve, s.anyjaneve AS gyerek_anyjaneve
                FROM public.szemely s
                WHERE s.congregation_id = target_congregation_id
                  AND s.isvisible = true
                  AND s.id != v_found_szemely_id
                  AND s.c_utcaid = v_street_id
                  AND COALESCE(s.c_szam, '') = COALESCE(btrim(v_row_data->>'c_szam'), '')
                  AND s.csaladfo = false
                  AND NOT EXISTS (
                      SELECT 1 FROM public.gyerek g WHERE g.id_szemely = s.id
                  )
                  AND (
                      -- apa-egyezés (ferfi=true szülő esetén)
                      (v_target_ferfi
                       AND s.apjaneve IS NOT NULL
                       AND public.normalize_name(s.apjaneve) = v_norm_target_name)
                      OR
                      -- anya-egyezés (ferfi=false szülő esetén)
                      (NOT v_target_ferfi
                       AND s.anyjaneve IS NOT NULL
                       AND (
                           public.normalize_name(s.anyjaneve) = v_norm_target_name
                           -- Lánykori név: szcs_nev + k_nev
                           OR public.normalize_name(s.anyjaneve) = public.normalize_name(
                               COALESCE(v_row_data->>'szcs_nev', '') || ' ' || COALESCE(v_row_data->>'k_nev', '')
                           )
                       )
                      )
                  )
            LOOP
                INSERT INTO public.gyerek (id_csalad, id_szemely)
                VALUES (v_new_csalad_id, v_gyerek_szemely.id)
                ON CONFLICT DO NOTHING;
                v_gyerek_count := v_gyerek_count + 1;
            END LOOP;

        EXCEPTION WHEN OTHERS THEN
            v_error_list := v_error_list || jsonb_build_object(
                'row', v_row_idx,
                'severity', 'error',
                'message', SQLERRM
            );
        END;
    END LOOP;

    inserted_csalad := v_csalad_count;
    inserted_gyerek := v_gyerek_count;
    not_found := v_not_found_count;
    errors := v_error_list;
    RETURN NEXT;
END;
$import_families$;

COMMENT ON FUNCTION public.import_families_from_existing_persons_batch(uuid, jsonb, jsonb, jsonb) IS
    'Wizard "Csak családokká szervezés" mód — meglévő szemely-eket családokká szervezi (csaladnev+k_nev+ferfi alapján). Bonus: automatikus gyerek-junction az apjaneve/anyjaneve egyezések alapján ugyanazon címen.';

GRANT EXECUTE ON FUNCTION public.import_families_from_existing_persons_batch(uuid, jsonb, jsonb, jsonb) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
    'import_family_head_batch',
    'import_families_from_existing_persons_batch'
)
  AND n.nspname = 'public'
ORDER BY p.proname;
