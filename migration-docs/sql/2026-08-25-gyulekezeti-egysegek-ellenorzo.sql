-- ============================================================================
-- 2026-08-25 — Gyülekezeti egységek terv, 0. ütem: ELLENŐRZŐ LEKÉRDEZÉSEK
-- CSAK SELECT — semmit nem módosít. Futtasd a Supabase SQL editorban,
-- és az eredményeket másold vissza a beszélgetésbe.
-- (Munkaszabály: a repó-dump nem bizonyíték — az éles állapotot ellenőrizzük.)
-- ============================================================================

-- 1) A congregations tábla ÉLŐ oszloplistája (ütközik-e a tervezett
--    szervezeti_tipus / anya_congregation_id névvel; mi van már fent).
SELECT ordinal_position, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'congregations'
ORDER BY ordinal_position;

-- 2) Van-e MÁR MOST több gyülekezethez kötött lelkész a profile_roles-ban?
--    (Ha igen: ők a 4. ütem — önállóan kartotékázó leány — jelöltjei.)
SELECT pr.profile_id,
       count(*) AS gyulekezet_szam,
       array_agg(c.name ORDER BY c.name) AS gyulekezetek
FROM profile_roles pr
JOIN congregations c ON c.id = pr.scope_id
WHERE pr.role = 'lelkesz'
  AND pr.scope = 'congregation'
  AND pr.active
  AND pr.approval_status = 'approved'
GROUP BY pr.profile_id
HAVING count(*) > 1;

-- 3) Missziói egyházközségek név-minta szerint (a backfill-javaslat alapja).
--    Két minta, mert az ékezet a name/nev_hu mezőben eltérhet.
SELECT id, name, nev_hu, diocese_id
FROM congregations
WHERE name ILIKE '%isszi%' OR coalesce(nev_hu,'') ILIKE '%isszi%'
ORDER BY name;

-- 4) Oszlopnév-ütközés ellenőrzése: van-e már egyseg_id / gyulekezetresz_id
--    a munkanaplo vagy szemely táblán? (Várt eredmény: 0 sor.)
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('munkanaplo', 'szemely')
  AND column_name IN ('egyseg_id', 'gyulekezetresz_id');

-- 5) Létezik-e már gyulekezeti_egysegek nevű tábla? (Várt eredmény: 0 sor.)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'gyulekezeti_egysegek';

-- 6) Lelkészi jelentések eloszlása évenként (mennyi élő adatot érint a
--    snapshot-bővítés; a bontás visszamenőleg nem kötelező).
SELECT ev,
       count(*) AS jelentesek,
       count(*) FILTER (WHERE statusz = 'veglegesitve') AS veglegesitett
FROM lelkeszi_jelentes
GROUP BY ev
ORDER BY ev;

-- 7) A congregations UPDATE/SELECT policy-k TÉNYLEGES élő szövege
--    (a 2026-08-11-es szűkítés után; a terv 3.1 pontjához).
SELECT polname,
       CASE polcmd WHEN 'r' THEN 'SELECT' WHEN 'w' THEN 'UPDATE'
                   WHEN 'a' THEN 'INSERT' WHEN 'd' THEN 'DELETE' ELSE polcmd::text END AS cmd,
       pg_get_expr(polqual, polrelid)      AS using_kifejezes,
       pg_get_expr(polwithcheck, polrelid) AS with_check_kifejezes
FROM pg_policy
WHERE polrelid = 'public.congregations'::regclass
ORDER BY polname;
