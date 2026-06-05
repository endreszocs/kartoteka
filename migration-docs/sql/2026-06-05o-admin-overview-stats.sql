-- 2026-06-05o — Admin áttekintő statisztika gyorsítása
-- ---------------------------------------------------------------------------
-- PROBLÉMA: a getAdminOverview() admin server action eddig N+1 lekérdezést
-- futtatott: egyházmegyénként 2 query + MINDEN gyülekezetre külön tagszám-count
-- (Promise.all). 100+ gyülekezetnél ez ~130 DB round-trip → az admin főoldal
-- nagyon lassan töltött be.
--
-- MEGOLDÁS: egyetlen GROUP BY lekérdezés gyülekezetenkénti aktív tagszámra,
-- amit a server action egy híváskor lekér, majd JS-ben aggregál
-- (egyházmegye-bontás + top10). ~130 round-trip helyett 1.
--
-- BIZTONSÁG: SECURITY INVOKER (alapértelmezett) → a hívó RLS-e érvényesül,
-- tehát NEM szivárog adat: az admin (akinek RLS-e az összes gyülekezet
-- szemely-sorát látja) a teljes bontást kapja; egy átlagos felhasználó csak a
-- sajátját. Csak darabszámot ad vissza (nincs személyes adat).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_overview_member_counts()
RETURNS TABLE (congregation_id uuid, member_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT s.congregation_id, count(*)::bigint AS member_count
  FROM szemely s
  WHERE s.isvisible = true
    AND s.meghalt = false
    AND s.congregation_id IS NOT NULL
  GROUP BY s.congregation_id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_overview_member_counts() TO authenticated, service_role;

-- (Opcionális, de ajánlott) — index a szűrt aggregációhoz, ha még nincs:
-- A részleges index csak az aktív, élő tagokat fedi, gyülekezet szerint.
CREATE INDEX IF NOT EXISTS idx_szemely_active_by_cong
  ON szemely (congregation_id)
  WHERE isvisible = true AND meghalt = false;
