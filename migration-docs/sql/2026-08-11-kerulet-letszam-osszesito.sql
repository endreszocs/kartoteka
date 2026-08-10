-- KARTOTEKA — Kerületi taglétszám-összesítő (2026-08-11)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- DÖNTÉS (Endre, 2026-08-11): „lásson a kerületi admin taglétszám-összesítőt".
--
-- HOGYAN — és miért ÍGY:
-- A 2026-08-10-es takarító SQL egy kikommentelt `szemely_district_select`
-- policy-t hagyott itt, amely SOR-SZINTŰ olvasást adott volna a kerületi
-- adminnak a kerülete MINDEN tagjára. Ez többet ad, mint amit a kérés
-- igényel, és szembemegy az app kimondott elvével — a
-- `dashboard-kerulet/page.tsx` fejléc-kommentje szerint „a kerület NEM
-- kérdezhet a befizetes, kiadas, szemely… táblákból".
--
-- Ezért NEM policy készül, hanem egy SZIGORÚAN ÖSSZESÍTŐ, SECURITY DEFINER
-- függvény: csak DARABSZÁMOKAT ad vissza (gyülekezetenként és egyházmegyénként),
-- egyetlen személyes adat nélkül. A tagnyilvántartás sorai továbbra is
-- zárva maradnak a kerületi szint előtt.
--
-- Jogosultság: a hívó vagy rendszergazda/master, vagy az adott KERÜLET
-- egyházkerületi adminja (kétlábú feloldás: profile_roles district-hatókör
-- VAGY a profiles.district_id skalár — az app-modellel azonosan).
--
-- Idempotens: CREATE OR REPLACE.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Segéd: a hívó kerület-azonosítói (a ccm_caller_district_ids mintájára)
-- ────────────────────────────────────────────────────────────────────────────
-- Megjegyzés: a 2026-08-09-es fájl már létrehozta a `ccm_caller_district_ids()`
-- függvényt ugyanezzel a logikával. Itt NEM definiáljuk újra — ha létezik, azt
-- használjuk; ha valamiért hiányozna, a lenti függvény saját, beágyazott
-- feltétellel dolgozik, tehát önállóan is helyes marad.

-- ────────────────────────────────────────────────────────────────────────────
-- 2) district_member_counts — gyülekezetenkénti és megyénkénti LÉTSZÁM
-- ────────────────────────────────────────────────────────────────────────────
-- Visszaadás: soronként EGY gyülekezet (a megyéje nevével), és a hozzá tartozó
-- aktív taglétszám. Személyes adat NEM kerül ki.
--
-- „Aktív tag" definíció — a hivatalos jelentésekkel azonosan:
--   isvisible = true  ÉS  a member_status nem elhunyt/elköltözött/kitért/törölt.
-- (A `member_status` oszlop hiányát toleráljuk: ha nincs ilyen oszlop, a
--  feltétel csak az isvisible-re szűkül — ezért a COALESCE-os megfogalmazás.)

CREATE OR REPLACE FUNCTION public.district_member_counts(
    p_district_id uuid DEFAULT NULL
) RETURNS TABLE(
    district_id uuid,
    district_name text,
    diocese_id uuid,
    diocese_name text,
    congregation_id uuid,
    congregation_name text,
    member_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $district_counts$
DECLARE
    v_is_admin boolean;
    v_districts uuid[];
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Nincs bejelentkezett felhasználó.';
    END IF;

    -- Rendszergazda / master: minden kerület
    SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role = 'admin'
    ) OR EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.role = 'admin' AND pr.scope = 'system'
          AND pr.active = true AND pr.approval_status = 'approved'
    ) INTO v_is_admin;

    -- Egyházkerületi admin: a saját kerülete(i) — kétlábú feloldás
    SELECT COALESCE(array_agg(DISTINCT s.did), '{}'::uuid[])
    INTO v_districts
    FROM (
        SELECT pr.scope_id AS did
        FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.role = 'egyhazkeruleti_admin'
          AND pr.scope = 'district'
          AND pr.active = true
          AND pr.approval_status = 'approved'
          AND pr.scope_id IS NOT NULL
        UNION
        SELECT p.district_id
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'active'
          AND p.role = 'egyhazkeruleti_admin'
          AND p.district_id IS NOT NULL
    ) s;

    IF NOT v_is_admin AND COALESCE(array_length(v_districts, 1), 0) = 0 THEN
        RAISE EXCEPTION 'Nincs jogosultság a kerületi összesítőhöz.';
    END IF;

    RETURN QUERY
    SELECT
        di.id                                        AS district_id,
        di.name::text                                AS district_name,
        d.id                                         AS diocese_id,
        d.name::text                                 AS diocese_name,
        c.id                                         AS congregation_id,
        COALESCE(c.nev_hu, c.name, 'Ismeretlen')::text AS congregation_name,
        COUNT(sz.id)                                 AS member_count
    FROM public.districts di
    JOIN public.dioceses d       ON d.district_id = di.id
    JOIN public.congregations c  ON c.diocese_id = d.id
    LEFT JOIN public.szemely sz
           ON sz.congregation_id = c.id
          AND sz.isvisible = true
          AND COALESCE(sz.member_status, '') NOT IN
              ('elhunyt', 'elkoltozott', 'kitert', 'torolt')
    WHERE (p_district_id IS NULL OR di.id = p_district_id)
      AND (v_is_admin OR di.id = ANY (v_districts))
    GROUP BY di.id, di.name, d.id, d.name, c.id, c.nev_hu, c.name
    ORDER BY d.name, congregation_name;
END;
$district_counts$;

COMMENT ON FUNCTION public.district_member_counts(uuid) IS
    'Kerületi taglétszám-ÖSSZESÍTŐ (gyülekezetenként + megyénként). SECURITY DEFINER, de KIZÁRÓLAG darabszámot ad vissza — a tagnyilvántartás sorai a kerületi szint előtt zárva maradnak. Jogosultság: rendszergazda, vagy az adott kerület egyházkerületi adminja.';

GRANT EXECUTE ON FUNCTION public.district_member_counts(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- E1) Létrejött a függvény? (VÁRT: 1 sor)
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'district_member_counts';

-- E2) NEM készült sor-szintű szemely-policy a kerületnek? (VÁRT: 0 sor)
SELECT policyname
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'szemely'
  AND policyname = 'szemely_district_select';

-- E3) Próba (a saját fiókoddal futtatva a helyes hatókört kell adnia):
-- SELECT diocese_name, congregation_name, member_count
-- FROM public.district_member_counts()
-- ORDER BY diocese_name, congregation_name;

-- E4) Alkalmazás-próba: /dashboard-kerulet → az „Egyházmegyei bontás" alatt
--     megjelenik a taglétszám megyénként és a kerületi összesen.
