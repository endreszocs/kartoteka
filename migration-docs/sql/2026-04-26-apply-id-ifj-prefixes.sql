-- KARTOTEKA — id. / ifj. prefix automatikus hozzáadása apa-fia eseteknél
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- Cél:
-- Magyar nyelvi konvenció: ha apa és fia ugyanazon a néven szerepel, az idősebb
-- "id." (idősebb), az ifjabbik "ifj." (ifjabb) prefixet kap a neve elé.
-- Ez a `szemely.namepattern` mezőbe kerül — a UI `formatNameWithPrefix()`
-- helper ezt használja a megjelenítéshez.
--
-- Logika:
-- 1. Csoportosítás: minden (csaladnev, k_nev, ferfi) páros ahol > 1 szemely
-- 2. Csoportonként:
--    a. Legidősebb (sz_datum ASC NULLS LAST, id ASC) → "id." prefix
--    b. Többiek → "ifj." prefix
-- 3. ELLENŐRZÉS: ha a namepattern MÁR VAN, és olyan prefixszel kezdődik mint
--    "id.", "ifj.", "Özv.", "özv.", "Dr.", "dr.", "Gr.", "Br." (regex matched)
--    → NE írjuk felül (Endre kérése: "ha van prefix jó")
--
-- Két függvényt készítünk:
-- - `_format_name_with_prefix(prefix, csaladnev, k_nev)` — helper a name építéséhez
-- - `apply_id_ifj_prefixes_for_congregation(target_congregation_id)` — fő függvény
--
-- Idempotens — bármikor újra futtatható.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. _format_name_with_prefix — helper a teljes név építéséhez
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._format_name_with_prefix(
    p_prefix text,
    p_csaladnev text,
    p_k_nev text
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT btrim(
        COALESCE(p_prefix || ' ', '') ||
        COALESCE(p_csaladnev, '') || ' ' ||
        COALESCE(p_k_nev, '')
    );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. apply_id_ifj_prefixes_for_congregation — fő RPC
-- ────────────────────────────────────────────────────────────────────────────
--
-- Bemenet: target_congregation_id
-- Kimenet:
--   updated_count — hány szemely kapott prefixet (id. vagy ifj.)
--   skipped_existing_prefix — hány szemelynek MÁR VOLT prefixe → kihagyva
--   groups — JSONB lista a csoportokról (debug)

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
    v_new_namepattern text;
    v_updated_count integer := 0;
    v_skipped_count integer := 0;
    v_groups_arr jsonb := '[]'::jsonb;
    v_group_members jsonb;
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

    -- ────────────────────────────────────────────────────────────
    -- Iteráljunk minden duplikált (csaladnev, k_nev, ferfi) csoporton
    -- ────────────────────────────────────────────────────────────
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

        -- Csoport-tagok életkor szerint (legidősebb először)
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
            -- Egy "prefix" itt: 1-4 karakteres szó pontot követve a string elején
            -- Példák: "id.", "ifj.", "Özv.", "Dr.", "Gr.", "Br."
            v_has_existing_prefix := v_existing_namepattern ~* '^[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]{1,4}\.\s+';

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

            -- Új namepattern építés (max 15 karakter — szemely.namepattern varchar(15))
            v_new_namepattern := substr(
                public._format_name_with_prefix(
                    v_prefix,
                    v_szemely.csaladnev,
                    v_szemely.k_nev
                ),
                1, 15
            );

            UPDATE public.szemely
            SET namepattern = v_new_namepattern
            WHERE id = v_szemely.id;

            v_updated_count := v_updated_count + 1;

            v_group_members := v_group_members || jsonb_build_object(
                'id', v_szemely.id,
                'name', v_szemely.csaladnev || ' ' || v_szemely.k_nev,
                'sz_datum', v_szemely.sz_datum,
                'action', 'updated',
                'new_namepattern', v_new_namepattern
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
    'Apa-fia prefix automatikus hozzáadása. Minden duplikált (csaladnev+k_nev+ferfi) csoportban: legidősebb → "id.", többi → "ifj.". HA már van prefix → kihagyva.';

GRANT EXECUTE ON FUNCTION public.apply_id_ifj_prefixes_for_congregation(uuid) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === HASZNÁLAT ÉS ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Próba (DRY-RUN-szerű): csak NÉZZÜK, hány csoport van apa-fia ugyanazon néven
SELECT
    csaladnev,
    k_nev,
    ferfi,
    COUNT(*) AS db,
    array_agg(
        json_build_object(
            'id', id,
            'sz_datum', sz_datum,
            'namepattern', namepattern
        )::text ORDER BY sz_datum ASC NULLS LAST, id ASC
    ) AS members
FROM public.szemely
WHERE isvisible = true
  AND csaladnev IS NOT NULL
  AND k_nev IS NOT NULL
GROUP BY csaladnev, k_nev, ferfi
HAVING COUNT(*) > 1
ORDER BY csaladnev, k_nev;

-- 2. Tényleges futtatás (cseréld ki a target_congregation_id-t a saját UUID-dre)
-- SELECT * FROM public.apply_id_ifj_prefixes_for_congregation(
--     '<your_congregation_uuid>'::uuid
-- );

-- 3. Eredmény: nézd meg a frissített szemely-eket
-- SELECT id, csaladnev, k_nev, sz_datum, namepattern, ferfi
-- FROM public.szemely
-- WHERE namepattern LIKE 'id.%' OR namepattern LIKE 'ifj.%'
-- ORDER BY csaladnev, k_nev, sz_datum;
