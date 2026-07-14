-- ============================================================================
-- Kereszt-gyülekezeti duplikátum-figyelés — 1. fázis: LELKÉSZ-ELÉRHETŐSÉG
-- 2026-07-14
--
-- A find_potential_cross_congregation_match a másik gyülekezet nevét + CNP-jét
-- adja (semmi személyes tag-adatot). A felhasználó fel akarja venni a kapcsolatot
-- az ottani lelkésszel → ehhez a lelkész HIVATALOS elérhetősége kell (név, email,
-- telefon). Ez NYILVÁNOS, egyházi tisztségviselői adat — NEM tag-adat.
--
-- SECURITY DEFINER, mert a hívó a saját gyülekezetén kívüli gyülekezet/lelkész
-- adatát kéri (az RLS ezt egyébként tiltaná). A visszaadott mezők SZIGORÚAN
-- csak a lelkész + gyülekezet hivatalos elérhetősége — más NEM.
--
-- A lelkész = profiles sor, ahol congregation_id = X ÉS role = 'lelkesz'
-- (lásd apps/web/lib/annual-report/generator.ts:262).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_cross_match_pastor_contacts(
    p_congregation_ids uuid[]
) RETURNS TABLE(
    congregation_id uuid,
    congregation_name text,
    pastor_name text,
    pastor_email text,
    pastor_phone text,
    congregation_email text,
    congregation_phone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $contacts$
    SELECT
        c.id AS congregation_id,
        COALESCE(c.nev_hu, c.name, 'Ismeretlen gyülekezet')::text AS congregation_name,
        p.full_name::text  AS pastor_name,
        p.email::text      AS pastor_email,
        p.phone::text      AS pastor_phone,
        c.email::text      AS congregation_email,
        c.telefon::text    AS congregation_phone
    FROM public.congregations c
    LEFT JOIN LATERAL (
        SELECT pr.full_name, pr.email, pr.phone
        FROM public.profiles pr
        WHERE pr.congregation_id = c.id
          AND pr.role = 'lelkesz'
        ORDER BY pr.full_name NULLS LAST
        LIMIT 1
    ) p ON true
    WHERE c.id = ANY(p_congregation_ids);
$contacts$;

COMMENT ON FUNCTION public.get_cross_match_pastor_contacts(uuid[]) IS
    'Kereszt-gyülekezeti egyezésnél a másik gyülekezet(ek) LELKÉSZÉNEK hivatalos elérhetősége (név, email, telefon) + a gyülekezet hivatalos email/telefon. SECURITY DEFINER — csak tisztségviselői/hivatalos adat, tag-adat NEM.';

GRANT EXECUTE ON FUNCTION public.get_cross_match_pastor_contacts(uuid[]) TO authenticated;
