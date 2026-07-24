-- ─────────────────────────────────────────────────────────────────────────
-- PR-8 (desktop 0.9.5) — csalad/gyerek pull-RPC: kurzor-határ javítás (gt→gte)
--
-- A desktop delta-szinkron kurzora a letöltött sorok max updated_at-ja.
-- A szigorú '>' miatt egy PONT a kurzor-időbélyeggel később láthatóvá váló
-- sor (azonos now()-ú tranzakció, ami a pull után commitol) VÉGLEG kimaradt
-- a delta-pullokból. A '>=' ezt megszünteti — az újra-letöltés olcsó, a
-- lokális upsert idempotens (a 3 táblás pull-helyet a desktop 0.9.5 már
-- kliens-oldalon gte-re váltotta; ez a két RPC a szerver-oldali párja).
--
-- A függvénytörzsek egyebekben BETŰRE azonosak a 2026-04-24-m8-3a-csalad-rpc.sql
-- definícióival (SECURITY DEFINER, search_path, GRANT változatlan).
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION public.get_csaladok_for_congregation(
    target_congregation_id UUID,
    updated_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.csalad
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT DISTINCT c.*
    FROM public.csalad c
    WHERE (
        c.id_ferfi IN (
            SELECT s.id FROM public.szemely s
            WHERE s.congregation_id = target_congregation_id
        )
        OR c.id_no IN (
            SELECT s.id FROM public.szemely s
            WHERE s.congregation_id = target_congregation_id
        )
        OR c.id IN (
            SELECT g.id_csalad FROM public.gyerek g
            WHERE g.id_szemely IN (
                SELECT s.id FROM public.szemely s
                WHERE s.congregation_id = target_congregation_id
            )
        )
    )
    AND (updated_since IS NULL OR c.updated_at >= updated_since)
    ORDER BY c.updated_at ASC;
$$;

COMMENT ON FUNCTION public.get_csaladok_for_congregation(UUID, TIMESTAMPTZ) IS
    'M8.3a desktop pull helper — a célzott gyülekezet családjai. updated_since: >= (gte) a kurzor-határra eső sorok elvesztése ellen (PR-8, 2026-07-24).';

GRANT EXECUTE ON FUNCTION public.get_csaladok_for_congregation(UUID, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_gyerek_for_congregation(
    target_congregation_id UUID,
    updated_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.gyerek
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT g.*
    FROM public.gyerek g
    WHERE g.id_szemely IN (
        SELECT s.id FROM public.szemely s
        WHERE s.congregation_id = target_congregation_id
    )
    AND (updated_since IS NULL OR g.updated_at >= updated_since)
    ORDER BY g.updated_at ASC;
$$;

COMMENT ON FUNCTION public.get_gyerek_for_congregation(UUID, TIMESTAMPTZ) IS
    'M8.3a desktop pull helper — gyerek-junction sorok. updated_since: >= (gte) a kurzor-határra eső sorok elvesztése ellen (PR-8, 2026-07-24).';

GRANT EXECUTE ON FUNCTION public.get_gyerek_for_congregation(UUID, TIMESTAMPTZ) TO authenticated;

COMMIT;

-- Verifikáció: a törzsben '>=' szerepel-e mindkét függvénynél?
SELECT p.proname,
       position('>= updated_since' IN pg_get_functiondef(p.oid)) > 0 AS gte_ok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_csaladok_for_congregation', 'get_gyerek_for_congregation')
ORDER BY p.proname;
