-- KARTOTEKA — szemely.namepattern szemantika tisztázás + apply_id_ifj_prefixes v2
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- HÁTTÉR (a UI bug felfedés alapján):
-- A `szemely.namepattern` mező eredetileg PREFIX-tárolásra szánt (varchar(15)),
-- pl. "id.", "ifj.", "Özv." — a `formatNameWithPrefix` UI helper ezt prefix-ként
-- adja a `csaladnev + k_nev` ELÉ.
--
-- DE az import a XML "Teljes név" oszlopot a namepattern-be tette (csonkolva
-- 15 karakterre). Ezért a UI duplikációt okozott:
--   namepattern = "Özv. Albu Beder"  (csonkolt)
--   csaladnev + k_nev = "Albu Beder Ferenc"
--   → "Özv. Albu Beder Albu Beder Ferenc" 😱
--
-- Javítás:
-- 1. CLEANUP: töröljük (NULL) minden olyan namepattern-t ami NEM PREFIX-szerű
--    (hosszabb 6 karakternél VAGY nem ponttal végződik VAGY szóközt tartalmaz)
-- 2. APPLY_ID_IFJ_PREFIXES v2: csak A PREFIX-et tároljuk (`id.` vagy `ifj.`),
--    NEM a teljes nevet
--
-- Idempotens: a CLEANUP UPDATE többször futható (másodjára 0 rekord); a
-- CREATE OR REPLACE FUNCTION szintén.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. CLEANUP: meglévő invalid namepattern-ek nullázása
-- ────────────────────────────────────────────────────────────────────────────
--
-- "PREFIX-szerű" = max 6 karakter ÉS ponttal végződik ÉS nincs benne szóköz.
-- Példák amelyek MARADNAK (nem nulláz):
--   - "id.", "ifj.", "Dr.", "Gr.", "Br.", "Özv.", "özv."
-- Példák amelyek TÖRLŐDNEK (NULL):
--   - "Özv. Albu Beder" (15 karakter, szóköz, csonkolt teljes név)
--   - "Tamás Gábor" (szóköz)
--   - "Joska" (nincs pont)
--   - "Petőfi Sándor" (szóköz)

UPDATE public.szemely
SET namepattern = NULL
WHERE namepattern IS NOT NULL
  AND (
      length(btrim(namepattern)) > 6
      OR btrim(namepattern) NOT LIKE '%.'
      OR btrim(namepattern) ~ '\s'
  );

-- Mutasd meg, hány maradt PREFIX-szerű rekord
SELECT 'Megmaradt prefix-szerű namepattern-ek' AS info, COUNT(*) AS db
FROM public.szemely
WHERE namepattern IS NOT NULL;

-- Mutasd meg, miket tartottunk meg (sample)
SELECT id, csaladnev, k_nev, namepattern, allapot
FROM public.szemely
WHERE namepattern IS NOT NULL
LIMIT 20;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. apply_id_ifj_prefixes_for_congregation v2 — CSAK A PREFIX
-- ────────────────────────────────────────────────────────────────────────────
--
-- A v1 a TELJES NEVET írta a namepattern-be (substr 15-ig levágva). Ez rossz volt.
-- A v2 csak A PREFIX-et tárolja: `'id.'` vagy `'ifj.'` (3-4 karakter).
-- A UI `formatNameWithPrefix` ezt prefix-ként adja a `csaladnev + k_nev` ELÉ.

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
            -- (Az új CLEANUP után csak prefix-szerű értékek maradnak.)
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

            -- v2: CSAK a prefix kerül a namepattern-be (nem a teljes név)
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
    'v2: csak A PREFIX-et (id./ifj.) tároljuk a namepattern mezőbe (NEM a teljes nevet). A UI formatNameWithPrefix prefix-ként adja a csaladnev+k_nev ELÉ.';

GRANT EXECUTE ON FUNCTION public.apply_id_ifj_prefixes_for_congregation(uuid) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === HASZNÁLAT ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Cseréld ki az UUID-t a saját gyülekezetedre, és futtasd:
-- SELECT * FROM public.apply_id_ifj_prefixes_for_congregation(
--     '<your_congregation_uuid>'::uuid
-- );

-- 2. Ellenőrzés — milyen prefix-eket írtunk be?
-- SELECT id, csaladnev, k_nev, sz_datum, namepattern, allapot
-- FROM public.szemely
-- WHERE namepattern IN ('id.', 'ifj.')
-- ORDER BY csaladnev, k_nev, sz_datum;

-- 3. Sajatnevű apával rendelkezők (azaz akiknek apjaneve = saját_név)
-- SELECT id, csaladnev, k_nev, sz_datum, namepattern, apjaneve
-- FROM public.szemely
-- WHERE public.normalize_name(apjaneve)
--     = public.normalize_name(csaladnev || ' ' || k_nev)
-- ORDER BY csaladnev, k_nev, sz_datum;
