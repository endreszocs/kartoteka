-- ============================================================================
-- 2026-07-01 — NULLA-KONFIGURÁCIÓS DIAGNOSZTIKA (READ-ONLY)
-- ============================================================================
-- CSAK SELECT. SEMMIT nem kell átírni. Futtasd EGYBEN (az egész fájlt),
-- és másold vissza a TELJES eredménytáblát (section / ord / kulcs / ertek).
--
-- Automatikusan:
--   • A_gyulekezetek       — melyik gyülekezetben mennyi a 2025-ös készpénz-nyugta
--   • B_nyugtaszamozas     — a legtöbb nyugtás gyülekezetre: a Kerületi/Irat sz. KÉT skálája,
--                            és a RÉGI (iratszam||nyugta) vs ÚJ (csak Irat sz.) monitor
--                            MIN..MAX + a ~115000-es HAMIS hézag mérete
--   • C_profilok_hozzaferes— MINDEN fiók: status / congregation_id / RLS_latna_adatot
--                            → a "második email nem lát adatot" (Bug 2) itt magától látszik
--
-- Séma-tények: befizetes.iratszam=Kerületi sz.; befizetes.nyugta=Irat sz.;
--   készpénz=bankszamla_id IS NULL; belső mozgás=belso_mozgas_xkey IS NOT NULL;
--   a nyugtafigyelővel BIT-AZONOS szűrő: datum-év + deleted=false + bankszamla_id IS NULL
--   + belso_mozgas_xkey IS NULL (forrás: penzugy/actions.ts:707 + computeReceiptHealth).
-- ============================================================================
WITH
top_cong AS (   -- a legtöbb 2025-ös készpénz-nyugtát tartalmazó gyülekezet
  SELECT b.congregation_id AS id
  FROM public.befizetes b
  WHERE EXTRACT(YEAR FROM b.datum)::int = 2025
    AND COALESCE(b.deleted,false) = false
    AND b.bankszamla_id IS NULL
    AND b.belso_mozgas_xkey IS NULL
  GROUP BY b.congregation_id
  ORDER BY count(*) DESC NULLS LAST
  LIMIT 1
),
base AS (       -- a nyugtafigyelővel bit-azonos halmaz a kiválasztott gyülekezetre
  SELECT b.datum, b.iratszam, b.nyugta,
    (b.nyugta = b.iratszam) AS tukrozott,
    substring(b.iratszam from '[0-9]+')::numeric AS iratszam_num,
    substring(CASE WHEN btrim(b.iratszam) <> '' THEN b.iratszam ELSE b.nyugta END from '[0-9]+')::numeric AS old_num,
    CASE WHEN btrim(b.nyugta) <> '' AND b.nyugta <> b.iratszam
         THEN substring(b.nyugta from '[0-9]+')::numeric END AS new_num
  FROM public.befizetes b
  WHERE b.congregation_id = (SELECT id FROM top_cong)
    AND EXTRACT(YEAR FROM b.datum)::int = 2025
    AND COALESCE(b.deleted,false) = false
    AND b.bankszamla_id IS NULL
    AND b.belso_mozgas_xkey IS NULL
),
stats AS (
  SELECT count(*) total,
    count(*) FILTER (WHERE tukrozott) tukr,
    count(*) FILTER (WHERE new_num IS NOT NULL) valodi,
    min(iratszam_num) ir_min, max(iratszam_num) ir_max,
    min(old_num) old_min, max(old_num) old_max, count(DISTINCT old_num) old_dist,
    min(new_num) new_min, max(new_num) new_max, count(DISTINCT new_num) new_dist
  FROM base
),
secA AS (
  SELECT 'A_gyulekezetek' AS section,
         row_number() OVER (ORDER BY cnt.db DESC NULLS LAST)::bigint AS ord,
         COALESCE(c.name, c.nev_hu, '(névtelen/■)') AS kulcs,
         ( 'id=' || COALESCE(cnt.id::text,'NULL')
        || ' | keszpenz_2025_db=' || cnt.db::text
        || CASE WHEN cnt.id = (SELECT id FROM top_cong) THEN '  <== EZT ELEMZI a B blokk' ELSE '' END
         ) AS ertek
  FROM (
    SELECT b.congregation_id AS id, count(*) AS db
    FROM public.befizetes b
    WHERE EXTRACT(YEAR FROM b.datum)::int = 2025
      AND COALESCE(b.deleted,false) = false
      AND b.bankszamla_id IS NULL
      AND b.belso_mozgas_xkey IS NULL
    GROUP BY b.congregation_id
  ) cnt
  LEFT JOIN public.congregations c ON c.id = cnt.id
),
secB AS (
  SELECT 'B_nyugtaszamozas' AS section, o::bigint AS ord, kulcs, ertek FROM (
    SELECT 1 o, '01 elemzett_congregation_id'                    kulcs, (SELECT id FROM top_cong)::text ertek FROM stats
    UNION ALL SELECT  2,'02 keszpenzes_sorok_ossz',              total::text  FROM stats
    UNION ALL SELECT  3,'03 tukrozott (nyugta=iratszam)',        tukr::text   FROM stats
    UNION ALL SELECT  4,'04 valodi_kulon_Irat_sz (nyugta<>iratszam)', valodi::text FROM stats
    UNION ALL SELECT  5,'10 Keruleti sz. (iratszam) MIN',        ir_min::text FROM stats
    UNION ALL SELECT  6,'11 Keruleti sz. (iratszam) MAX',        ir_max::text FROM stats
    UNION ALL SELECT  7,'12 Irat sz. (nem-tukrozott nyugta) MIN', new_min::text FROM stats
    UNION ALL SELECT  8,'13 Irat sz. (nem-tukrozott nyugta) MAX', new_max::text FROM stats
    UNION ALL SELECT  9,'20 REGI monitor (iratszam||nyugta) MIN', old_min::text FROM stats
    UNION ALL SELECT 10,'21 REGI monitor (iratszam||nyugta) MAX', old_max::text FROM stats
    UNION ALL SELECT 11,'22 REGI HAMIS_HIANYZO ~ (max-min+1 - db)',
                     (COALESCE(old_max,0)-COALESCE(old_min,0)+1-COALESCE(old_dist,0))::text FROM stats
    UNION ALL SELECT 12,'23 UJ monitor (csak Irat sz.) MIN',     new_min::text FROM stats
    UNION ALL SELECT 13,'24 UJ monitor (csak Irat sz.) MAX',     new_max::text FROM stats
    UNION ALL SELECT 14,'25 UJ VALODI_HIANYZO ~ (max-min+1 - db)',
                     (COALESCE(new_max,0)-COALESCE(new_min,0)+1-COALESCE(new_dist,0))::text FROM stats
  ) x
),
secC AS (
  SELECT 'C_profilok_hozzaferes' AS section,
         row_number() OVER (ORDER BY p.congregation_id NULLS FIRST, u.email)::bigint AS ord,
         COALESCE(u.email, p.email, p.id::text) AS kulcs,
         ( 'status=' || COALESCE(p.status,'∅')
        || ' | role=' || COALESCE(p.role,'∅')
        || ' | congregation_id=' || COALESCE(p.congregation_id::text,'NULL(!)')
        || ' | gyulekezet=' || COALESCE(c.name,'∅')
        || ' | approved_cong_roles=' ||
             (SELECT count(*) FROM public.profile_roles r
               WHERE r.profile_id = p.id AND r.scope='congregation'
                 AND r.approval_status='approved' AND r.active)::text
        || ' | RLS_latna_adatot=' ||
             CASE WHEN p.status='active' AND p.congregation_id IS NOT NULL THEN 'IGEN' ELSE 'NEM' END
         ) AS ertek
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.congregations c ON c.id = p.congregation_id
  WHERE p.deleted_at IS NULL
)
SELECT section, ord, kulcs, ertek
FROM (SELECT * FROM secA UNION ALL SELECT * FROM secB UNION ALL SELECT * FROM secC) q
ORDER BY section, ord;

-- ÉRTELMEZÉS:
--   B blokk: ha a "22 REGI HAMIS_HIANYZO" ~115000, a "25 UJ VALODI_HIANYZO" viszont kicsi,
--            az BIZONYÍTJA a hibát és a javítás helyességét (a régi a Kerületi ~115k számot
--            beszámolta a nyugta-sorozatba). A 10–13 sor a két külön skálát mutatja.
--   C blokk: keresd a sort, ahol 'RLS_latna_adatot=NEM' → az a fiók nem lát adatot.
--            Ha a második emailnél 'congregation_id=NULL(!)' vagy 'status<>active' → ez a Bug 2.
--            A javítás: 2026-07-01-bug2-masodik-email-javitas.sql (állítsd be a két emailt).
