-- ═══════════════════════════════════════════════════════════════════════════
-- WIPE_FINANCE_DATA: a MONETAR ága (P4-36, audit 2026-08-28)
-- Futtatás: Supabase SQL editor, egyben. Idempotens (CREATE OR REPLACE).
--
-- MIÉRT: a `monetar` (címletjegyzék) táblának NINCS congregation_id oszlopa —
-- a tenant-izolációja a `sourceid = '<congregation_id>:<év>'` prefixen áll.
-- A wipe_finance_data allowlist-jében szerepel ugyan, de a „csak ha van
-- congregation_id oszlopa" kapu NÉMÁN átugrotta → a gyülekezeti pénzügy-
-- törlés után a címletjegyzék-sorok bennmaradtak.
--
-- A javítás: a monetar KÜLÖN ágat kap (sourceid-prefix törlés); a többi tábla
-- viselkedése bitre azonos a 2026-06-09-es eredetivel.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.wipe_finance_data(
    target_congregation_id UUID,
    confirm_name TEXT
)
RETURNS TABLE(deleted_table TEXT, rows_deleted BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    caller_id      UUID := auth.uid();
    caller_role    TEXT;
    expected_name  TEXT;
    affected       BIGINT;
    total          BIGINT := 0;
    deleted_list   JSONB := '[]'::jsonb;
    tbl            TEXT;
    has_col        BOOLEAN;

    finance_tables TEXT[] := ARRAY[
        'befizetes',
        'kiadas',
        'belsomozgas',
        'oblio_szamlak',
        'oblio_kiadas_match',
        'chitanta_tombok',
        'monetar',
        'decont',
        'dispozitie'
    ];
BEGIN
    -- 1. Auth
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Bejelentkezés szükséges'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Role — CSAK admin
    SELECT role INTO caller_role FROM public.profiles WHERE id = caller_id;
    IF caller_role IS NULL OR caller_role <> 'admin' THEN
        RAISE EXCEPTION 'Csak fő rendszergazda (admin) végezheti el a pénzügyi adatok törlését'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 3. Gyülekezet-létezés
    SELECT COALESCE(NULLIF(nev_hu, ''), name) INTO expected_name
    FROM public.congregations
    WHERE id = target_congregation_id;

    IF expected_name IS NULL THEN
        RAISE EXCEPTION 'A megadott gyülekezet (%) nem létezik', target_congregation_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- 4. Confirm-név
    IF confirm_name IS NULL OR confirm_name <> expected_name THEN
        RAISE EXCEPTION 'A megerősítő név (%) nem egyezik a gyülekezet nevével (%)',
            COALESCE(confirm_name, '<üres>'), expected_name
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 5. Törlés — allowlist, séma-drift-biztosan
    FOREACH tbl IN ARRAY finance_tables LOOP
        IF to_regclass('public.' || tbl) IS NULL THEN
            CONTINUE;
        END IF;

        -- P4-36 (2026-08-29): a monetar izolációja sourceid-prefixen áll
        -- ('<congregation_id>:<év>'), nincs congregation_id oszlopa — KÜLÖN ág,
        -- különben a „van-e congregation_id" kapu némán átugorja.
        IF tbl = 'monetar' THEN
            EXECUTE 'DELETE FROM public.monetar WHERE sourceid LIKE $1'
                USING target_congregation_id::text || ':%';
            GET DIAGNOSTICS affected = ROW_COUNT;
            total := total + affected;
            deleted_list := deleted_list || jsonb_build_object('table', tbl, 'rows', affected);
            deleted_table := tbl; rows_deleted := affected; RETURN NEXT;
            CONTINUE;
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'congregation_id'
        ) INTO has_col;
        IF NOT has_col THEN
            CONTINUE;
        END IF;

        EXECUTE format('DELETE FROM public.%I WHERE congregation_id = $1', tbl)
            USING target_congregation_id;
        GET DIAGNOSTICS affected = ROW_COUNT;
        total := total + affected;
        deleted_list := deleted_list || jsonb_build_object('table', tbl, 'rows', affected);
        deleted_table := tbl; rows_deleted := affected; RETURN NEXT;
    END LOOP;

    -- 6. Audit
    INSERT INTO public.data_wipe_log (
        congregation_id, congregation_name, initiated_by,
        deleted_tables, total_rows_deleted, scope
    ) VALUES (
        target_congregation_id, expected_name, caller_id,
        deleted_list, total, 'finance'
    );

    RETURN;
END;
$fn$;

COMMENT ON FUNCTION public.wipe_finance_data(UUID, TEXT) IS
    'Admin RPC: egy gyülekezet TRANZAKCIÓS pénzügyi adatait törli (befizetes, kiadas, belsomozgas, oblio_szamlak, chitanta_tombok, monetar [sourceid-prefix!], decont, dispozitie). Megtartja: szemely, csalad, kategóriák, bankszámla-konfig, éves költségvetés. Csak admin, név-megerősítéssel. Audit: data_wipe_log (scope=finance).';

GRANT EXECUTE ON FUNCTION public.wipe_finance_data(UUID, TEXT) TO authenticated;

-- ── ÖNELLENŐRZÉS (egyetlen rács) ────────────────────────────────────────────
SELECT
  'wipe_finance_data monetar-ág' AS ellenorzes,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'wipe_finance_data'
      AND pronamespace = 'public'::regnamespace
      AND prosrc LIKE '%sourceid LIKE%'
  ) THEN '✅ él (sourceid-prefix törlés)' ELSE '❌ HIÁNYZIK' END AS allapot;
