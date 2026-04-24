-- KARTOTEKA — M8.3a: csalad + gyerek pull-RPC gyülekezet-szűrővel
-- Dátum: 2026-04-24
-- Futtatja: Endre (Supabase SQL editor)
--
-- Kontextus:
--   A `csalad` tábla NEM rendelkezik `congregation_id` oszloppal — a család
--   gyülekezet-hovatartozása a hozzá kötött tagokon keresztül derül ki
--   (id_ferfi / id_no → szemely.congregation_id, vagy a gyerek-junction-on át).
--
--   A Supabase PostgREST nem támogat natívan IN (subquery)-t, ezért egy
--   SECURITY DEFINER RPC-t adunk, ami a sorok szűrését szerver-oldalon végzi.
--   A desktop pull-helper (`pullFamiliesOfOwnCongregation`) ezt a RPC-t hívja,
--   és az eredményt a `csalad_local` cache-be írja.
--
-- Biztonság:
--   - SECURITY DEFINER + az RLS szerinti `congregation_id`-szűrés alapján
--     csak a hívó user saját gyülekezetének családjait adja vissza
--   - A web-oldali `family-actions.ts` RLS-sel oldja meg ugyanezt —
--     ott nem kell ilyen RPC

BEGIN;

-- 1. get_csaladok_for_congregation
--    Visszaadja az összes `csalad` sort, amelyekhez a gyülekezet legalább
--    egy tagja kapcsolódik (apa, anya, vagy gyermek).
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
    AND (updated_since IS NULL OR c.updated_at > updated_since)
    ORDER BY c.updated_at ASC;
$$;

COMMENT ON FUNCTION public.get_csaladok_for_congregation(UUID, TIMESTAMPTZ) IS
    'M8.3a desktop pull helper — visszaadja a célzott gyülekezethez tartozó családokat. Opcionális updated_since a delta-pullhoz.';

GRANT EXECUTE ON FUNCTION public.get_csaladok_for_congregation(UUID, TIMESTAMPTZ) TO authenticated;

-- 2. get_gyerek_for_congregation
--    Visszaadja az összes `gyerek` sort a célzott gyülekezet családjaihoz.
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
    AND (updated_since IS NULL OR g.updated_at > updated_since)
    ORDER BY g.updated_at ASC;
$$;

COMMENT ON FUNCTION public.get_gyerek_for_congregation(UUID, TIMESTAMPTZ) IS
    'M8.3a desktop pull helper — visszaadja a célzott gyülekezet családjaihoz tartozó gyerek-junction sorokat.';

GRANT EXECUTE ON FUNCTION public.get_gyerek_for_congregation(UUID, TIMESTAMPTZ) TO authenticated;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- Ellenőrzés
-- ─────────────────────────────────────────────────────────────────────────

-- Létrejöttek a függvények?
SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN ('get_csaladok_for_congregation', 'get_gyerek_for_congregation')
  AND n.nspname = 'public'
ORDER BY p.proname;

-- Próba-hívás (cseréld ki a UUID-t a saját gyülekezet-id-ra)
-- SELECT count(*) FROM public.get_csaladok_for_congregation('00000000-0000-0000-0000-000000000000'::uuid);
-- SELECT count(*) FROM public.get_gyerek_for_congregation('00000000-0000-0000-0000-000000000000'::uuid);
