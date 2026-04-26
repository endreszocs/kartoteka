-- KARTOTEKA HOTFIX — import_families_from_existing_persons_batch
-- duplicate-spouse pre-check
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor) — a 2026-04-26-import-families-from-persons-rpc.sql UTÁN
--
-- Hiba diagnózis:
-- A `csalad` táblán létezik UNIQUE INDEX a `id_ferfi`-re és `id_no`-ra:
--   - csalad_id_ferfi_idx (UNIQUE WHERE id_ferfi IS NOT NULL)
--   - csalad_id_no_idx (UNIQUE WHERE id_no IS NOT NULL)
-- Ez az üzletileg helyes szabály: egy szemely egyszerre csak EGY csalad-ban lehet
-- házastárs (férj VAGY feleség).
--
-- A `csaladok.xml`-ben gyakran szerepel ugyanaz a családfő több sorban (különböző
-- címen, vagy duplikáltan az export miatt). Az import RPC ezt eddig csak a
-- `EXCEPTION WHEN OTHERS` blokkban kapta el "duplicate key" üzenettel.
--
-- Javítás:
-- Az RPC mostantól MIELŐTT az INSERT csalad megtörténne, ELLENŐRZI hogy a tag
-- szerepel-e már egy másik csaladban házastársként:
--   IF EXISTS (... id_ferfi = found_id OR id_no = found_id) THEN warning + skip
--
-- Így a többi sor zavartalanul fut tovább, a duplikátumokat világos warning
-- jelzi a result-stepben.
--
-- Idempotens: CREATE OR REPLACE FUNCTION

BEGIN;

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
    v_already_in_family_count integer := 0;
    v_apjaneve text;
    v_anyjaneve text;
    v_gyerek_szemely record;
    v_existing_csalad_id integer;
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
            -- SZEMÉLY LOOKUP
            -- ────────────────────────────────────────────────────
            v_found_szemely_id := NULL;
            v_found_count := 0;

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
                    'message', 'Nem található ilyen tag a tagnyilvántartásban — család nem jött létre.',
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
            -- ÚJ: PRE-CHECK — szerepel-e már a tag csalad-ban házastársként?
            -- ────────────────────────────────────────────────────
            -- Ha a UNIQUE INDEX-ek miatt az insert úgyis hibára futna, INKÁBB
            -- preventíven SKIP-elünk + warning. Így a többi sor zavartalanul fut.

            SELECT id INTO v_existing_csalad_id
            FROM public.csalad
            WHERE (v_target_ferfi AND id_ferfi = v_found_szemely_id)
               OR (NOT v_target_ferfi AND id_no = v_found_szemely_id)
            LIMIT 1;

            IF v_existing_csalad_id IS NOT NULL THEN
                v_already_in_family_count := v_already_in_family_count + 1;
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx,
                    'severity', 'info',
                    'message', format(
                        'Ez a tag már szerepel a(z) #%s csalad-rekordban (mint %s) — sor kihagyva, nem duplikálunk.',
                        v_existing_csalad_id,
                        CASE WHEN v_target_ferfi THEN 'férj' ELSE 'feleség' END
                    ),
                    'name', btrim(COALESCE(v_row_data->>'csaladnev', '') || ' ' || COALESCE(v_row_data->>'k_nev', ''))
                );
                CONTINUE;
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
            -- CSALAD INSERT
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
            -- AUTO GYEREK-EGYEZÉS (Apja/Anyja alapján)
            -- ────────────────────────────────────────────────────
            v_apjaneve := COALESCE(v_row_data->>'apjaneve', '');
            v_anyjaneve := COALESCE(v_row_data->>'anyjaneve', '');

            FOR v_gyerek_szemely IN
                SELECT s.id, s.csaladnev, s.k_nev
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
                      (v_target_ferfi
                       AND s.apjaneve IS NOT NULL
                       AND public.normalize_name(s.apjaneve) = v_norm_target_name)
                      OR
                      (NOT v_target_ferfi
                       AND s.anyjaneve IS NOT NULL
                       AND (
                           public.normalize_name(s.anyjaneve) = v_norm_target_name
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
    -- Fontos: a `not_found` és `v_already_in_family_count` az error_list-ben jelenik meg
    -- mint warning/info (a UI-on a result-step megfelelően csoportosítja)
    errors := v_error_list;
    RETURN NEXT;
END;
$import_families$;

COMMENT ON FUNCTION public.import_families_from_existing_persons_batch(uuid, jsonb, jsonb, jsonb) IS
    'Wizard "Csak családokká szervezés" mód — meglévő szemely-eket családokká szervezi. Új: pre-check a duplikált házastárs-szerepre (csalad_id_ferfi_idx + csalad_id_no_idx UNIQUE constraint preventív kezelése).';

GRANT EXECUTE ON FUNCTION public.import_families_from_existing_persons_batch(uuid, jsonb, jsonb, jsonb) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'import_families_from_existing_persons_batch'
  AND pronamespace = 'public'::regnamespace;
