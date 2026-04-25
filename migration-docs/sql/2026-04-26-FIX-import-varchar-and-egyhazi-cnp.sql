-- KARTOTEKA HOTFIX — Tagnyilvántartás-import varchar limitek + egyházi CNP rendszer alapja
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- Cél (3 hibajavítás + 1 új helper):
--
-- 1. PROBLÉMA: az `import_family_head_batch` RPC `IMPORT-<uuid>` placeholder CNP-t generált
--    (43 karakter), de a `szemely.cnp` mező csak `varchar(20)`. → Minden sor megbukott
--    `value too long for type character varying(20)` hibával.
--    JAVÍTÁS: új `generate_egyhazi_cnp()` helper function — formátum `EC-YYYY-XXXXXXXXXX`
--    (18 karakter), garantáltan egyedi, az "egyházi CNP" rendszer alapja (lásd lejjebb).
--
-- 2. PROBLÉMA: az RPC `type='tag'` (3 karakter) értéket adott, de a `szemely.type` mező
--    `varchar(2)`. → Minden sor megbukott volna a CNP probléma után.
--    JAVÍTÁS: `type='L'` (1 karakter, "Lélek" — a meglévő rendszer konvenciója,
--    l. `migration-docs/source-links/member_api.js:1779`).
--
-- 3. PROBLÉMA: minden szöveg-mezőre van `varchar(N)` korlát (namepattern=15, allapot=10,
--    c_szam=10, c_tombhaz=5 stb.), de az XML-import nem védi a hosszt.
--    JAVÍTÁS: minden szöveg-mező `substr(value, 1, max_len)` wrapper-rel kerül beszúrásra
--    az RPC-ben. Egy hosszú érték → csonkolás (nem hiba), és a felhasználó később
--    a tagnyilvántartáson rendezheti.
--
-- 4. ÚJ: `generate_egyhazi_cnp()` helper az "egyházi CNP" rendszer alapja:
--    - Formátum: `EC-YYYY-XXXXXXXXXX` (18 karakter)
--      - `EC` prefix = "Egyházi CNP"
--      - `YYYY` = a regisztrálás éve (mikor került a rendszerbe)
--      - `XXXXXXXXXX` = 10 karakteres random alphanumerikus hash
--    - Ezzel egy személy azonosítható az EREK rendszerben akár több gyülekezetben is
--      (ugyanaz az egyházi CNP több gyülekezeti rekordon → "ez ugyanaz az ember").
--    - Részletes terv külön projekt logban (`KARTOTEKA-egyhazi-cnp-rendszer-2026-04-26.md`).
--
-- Idempotens: CREATE OR REPLACE FUNCTION mindkét függvényre.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. generate_egyhazi_cnp() — egységes egyházi CNP generálás
-- ────────────────────────────────────────────────────────────────────────────
--
-- Formátum: EC-YYYY-XXXXXXXXXX (18 karakter, mindig 20 alatt)
--
-- Karakterek a random részben: alfanumerikus (kis-/nagybetű + szám), kivéve azokat,
-- amelyek könnyen összetéveszthetők (0/O, 1/I/l, 5/S, 8/B). Ez csökkenti az emberi
-- másolási hibát, ha a CNP-t valaha tollal kell leírni vagy diktálni.
--
-- Egyediség: a `szemely.cnp` mezőre létezik egy PARTIAL UNIQUE INDEX
-- `(congregation_id, cnp) WHERE isvisible=true`, tehát a generált értéknek elég
-- egy gyülekezeten belül egyedinek lennie. A 10 karakteres random hash 32^10 ≈
-- 1.1 × 10^15 lehetséges értékből választ — gyülekezetenként 1000 fő esetén
-- 10^-12 ütközés-valószínűség (Birthday paradox alapján). Praktikusan nulla.

CREATE OR REPLACE FUNCTION public.generate_egyhazi_cnp()
RETURNS varchar(20)
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $generate_egyhazi_cnp$
DECLARE
    v_year text := to_char(now(), 'YYYY');
    v_random_part text := '';
    v_charset text := 'ABCDEFGHJKMNPQRTUVWXYZ234679';  -- kihagytuk: 0/O, 1/I/L, 5/S, 8/B
    v_charset_len int := length(v_charset);
    v_i int;
BEGIN
    -- 10 karakteres random hash
    FOR v_i IN 1..10 LOOP
        v_random_part := v_random_part || substr(v_charset, (floor(random() * v_charset_len) + 1)::int, 1);
    END LOOP;

    RETURN 'EC-' || v_year || '-' || v_random_part;
END;
$generate_egyhazi_cnp$;

COMMENT ON FUNCTION public.generate_egyhazi_cnp() IS
    'Egyházi CNP generálás — formátum: EC-YYYY-XXXXXXXXXX (18 karakter). Az EC prefix és az év a rendszer-szintű azonosítást szolgálja, a 10 karakteres random hash garantálja az egyediséget. Az "egyházi CNP" több gyülekezetben is hordozható, ugyanaz az érték = ugyanaz a személy.';

GRANT EXECUTE ON FUNCTION public.generate_egyhazi_cnp() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. import_family_head_batch — TELJES FELÜLÍRÁS varchar védelemmel
-- ────────────────────────────────────────────────────────────────────────────
--
-- Változások a 2026-04-25 verzióhoz képest:
-- - `cnp` placeholder: `IMPORT-<uuid>` → `generate_egyhazi_cnp()` (18 karakter)
-- - `type`: `'tag'` → `'L'` (1 karakter, a meglévő rendszer konvenciója)
-- - `csaladnev`: substr(..., 1, 30)
-- - `k_nev`: substr(..., 1, 25)
-- - `szcs_nev`: substr(..., 1, 100)
-- - `allapot`: substr(..., 1, 10)
-- - `namepattern`: substr(..., 1, 15)
-- - `apjaneve`: substr(..., 1, 25)
-- - `anyjaneve`: substr(..., 1, 25)
-- - `foglalkozas`: substr(..., 1, 25)
-- - `vallas`: substr(..., 1, 25)
-- - `c_szam`: substr(..., 1, 10)
-- - `c_tombhaz`: substr(..., 1, 5)
-- - `c_szcim`: substr(..., 1, 80)
-- - `telefon`: substr(..., 1, 50)
-- - `email`: substr(..., 1, 50)
-- - csalad insertben: c_szam substr(..., 1, 10), c_tombhaz substr(..., 1, 5)

CREATE OR REPLACE FUNCTION public.import_family_head_batch(
    target_congregation_id uuid,
    rows jsonb
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
BEGIN
    -- Jog-ellenőrzés
    IF v_caller_user_id IS NULL THEN
        RAISE EXCEPTION 'Nincs bejelentkezett felhasználó.';
    END IF;

    v_is_master := EXISTS(
        SELECT 1 FROM public.profile_roles
        WHERE profile_id = v_caller_user_id
          AND role = 'admin'
          AND scope = 'system'
          AND active = true
          AND approval_status = 'approved'
    );

    v_has_delegated := EXISTS(
        SELECT 1 FROM public.admin_access_requests
        WHERE admin_user_id = v_caller_user_id
          AND congregation_id = target_congregation_id
          AND status = 'approved'
          AND expires_at > now()
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

            -- Utca lookup
            v_street_id := public._resolve_or_create_street(
                v_row_data->>'_utca_text',
                v_row_data->>'_helyseg_text'
            );

            IF v_street_id IS NULL THEN
                v_error_list := v_error_list || jsonb_build_object(
                    'row', v_row_idx,
                    'severity', 'error',
                    'message', 'A rendszerben nincs egyetlen megye sem — utca-lookup lehetetlen'
                );
                CONTINUE;
            END IF;

            -- CNP: ha van az XML-ben, használjuk azt; egyébként generáljunk egyházi CNP-t
            v_cnp_value := NULLIF(btrim(COALESCE(v_row_data->>'cnp', '')), '');
            IF v_cnp_value IS NULL THEN
                v_cnp_value := public.generate_egyhazi_cnp();
            ELSE
                -- Ha az XML-ben van CNP, levágjuk 20 karakterre (a séma korlátja)
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

            -- INSERT szemely (minden szöveg-mező substr védelemmel)
            INSERT INTO public.szemely (
                cnp, csaladnev, k_nev, szcs_nev, allapot, namepattern,
                apjaneve, anyjaneve, ferjk_nev,
                csaladfo, ferfi, meghalt,
                sz_datum, foglalkozas, vallas,
                c_utcaid, c_szam, c_tombhaz, c_szcim,
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
                substr(NULLIF(btrim(COALESCE(v_row_data->>'c_szam', '')), ''), 1, 10),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'c_tombhaz', '')), ''), 1, 5),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'c_szcim', '')), ''), 1, 80),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'telefon', '')), ''), 1, 50),
                substr(NULLIF(btrim(COALESCE(v_row_data->>'email', '')), ''), 1, 50),
                COALESCE((v_row_data->>'befizetoev')::integer, EXTRACT(YEAR FROM now())::integer),
                target_congregation_id,
                true,
                'L',  -- a "type" mező 2 karakter, a meglévő konvenció: 'L' = Lélek
                now()
            )
            RETURNING id INTO v_new_szemely_id;

            v_szemely_count := v_szemely_count + 1;

            -- Opcionális: csalad insert
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

COMMENT ON FUNCTION public.import_family_head_batch(uuid, jsonb) IS
    'Tagnyilvántartás-import wizard — szemely (családfő) + csalad atomikus dual-insert. Master admin VAGY delegated session jogosult. Minden varchar mezőre substr védelem. Cnp helyett egyházi CNP generálás (EC-YYYY-XXXXXXXXXX, 18 karakter).';

GRANT EXECUTE ON FUNCTION public.import_family_head_batch(uuid, jsonb) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. generate_egyhazi_cnp függvény teszt — adjon vissza 18 karakteres EC-YYYY-XXX-t
SELECT public.generate_egyhazi_cnp() AS sample_egyhazi_cnp,
       length(public.generate_egyhazi_cnp()) AS karakter_szam;

-- 2. 5 darab egymás utáni egyházi CNP — biztosan különbözőek
SELECT public.generate_egyhazi_cnp() AS cnp1,
       public.generate_egyhazi_cnp() AS cnp2,
       public.generate_egyhazi_cnp() AS cnp3,
       public.generate_egyhazi_cnp() AS cnp4,
       public.generate_egyhazi_cnp() AS cnp5;

-- 3. import_family_head_batch függvény még létezik-e (a CREATE OR REPLACE-után)
SELECT
    n.nspname AS schema,
    p.proname AS name,
    pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN ('import_family_head_batch', 'generate_egyhazi_cnp')
  AND n.nspname = 'public'
ORDER BY p.proname;
