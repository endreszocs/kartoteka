-- ============================================================================
-- 2026-07-01 — TISZTÁZÓ DIAGNOSZTIKA (READ-ONLY) — Bug 3 (nyugtafigyelő) + Bug 2 (hozzáférés)
-- ============================================================================
-- CSAK SELECT-ek — semmit nem ír/módosít. Supabase SQL editorba bemásolható.
-- A SZAKASZOKAT KÜLÖN futtasd (a Supabase editor csak az UTOLSÓ eredményt mutatja).
--
-- Séma-tények (megerősítve a Database_schema.sql-ből, befizetes 123-164):
--   iratszam text NOT NULL = Kerületi sz. (kerülettől kapott, nagy, ~115019)
--   nyugta   text NOT NULL = Irat sz.     (gyülekezet saját sorszáma, 1..N)
--   készpénz = bankszamla_id IS NULL ; belső mozgás = belso_mozgas_xkey IS NOT NULL
--   a NYUGTAFIGYELŐ pontosan ezt a halmazt nézi: congregation_id + datum-év +
--   deleted=false + bankszamla_id IS NULL + belso_mozgas_xkey IS NULL
--   (forrás: penzugy/actions.ts:707 loader + computeReceiptHealth szűrők).
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 0 — MELYIK gyülekezet? (a congregation_id kikeresése + 2025 készpénz-db)
-- Futtasd ELŐSZÖR; a kapott id-t írd be az 1. szakasz params-ába.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  c.id AS congregation_id,
  c.name,
  c.nev_hu,
  (SELECT count(*) FROM public.befizetes b
     WHERE b.congregation_id = c.id
       AND EXTRACT(YEAR FROM b.datum)::int = 2025
       AND COALESCE(b.deleted,false) = false
       AND b.bankszamla_id IS NULL
       AND b.belso_mozgas_xkey IS NULL) AS keszpenz_2025_db
FROM public.congregations c
ORDER BY keszpenz_2025_db DESC, c.name;


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 1 — BUG 3: a Kerületi sz. / Irat sz. két skálája + a RÉGI vs ÚJ
--             nyugtafigyelő-logika (a ~115000 hamis hézag pontos oka).
-- Állítsd be a params-ot (p_congregation_id, p_ev), futtasd, másold vissza a TELJES táblát.
-- Egyetlen eredmény-tábla: grp / o / kulcs / ertek.
-- ════════════════════════════════════════════════════════════════════════════
WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid AS p_congregation_id,  -- << ÍRD ÁT (Szakasz 0-ból)
    2025::int                                    AS p_ev                 -- << ÍRD ÁT ha kell
),
-- A nyugtafigyelővel BIT-AZONOS halmaz:
base AS (
  SELECT
    b.id, b.datum, b.iratszam, b.nyugta, b.irattipus, b.bankszamla_id, b.belso_mozgas_xkey,
    (b.nyugta = b.iratszam) AS tukrozott,
    -- első számjegy-futam (mint az extractNumericDocumentNumber: /(\d+)/):
    substring(b.iratszam from '[0-9]+')::numeric AS iratszam_num,
    substring(b.nyugta   from '[0-9]+')::numeric AS nyugta_num,
    -- RÉGI monitor per-sor szám: iratszam || nyugta  → iratszam ha nem üres, különben nyugta
    substring(CASE WHEN btrim(b.iratszam) <> '' THEN b.iratszam ELSE b.nyugta END from '[0-9]+')::numeric AS old_num,
    -- ÚJ monitor per-sor szám: csak a NEM tükrözött nyugta (Irat sz.)
    CASE WHEN btrim(b.nyugta) <> '' AND b.nyugta <> b.iratszam
         THEN substring(b.nyugta from '[0-9]+')::numeric END AS new_num
  FROM public.befizetes b, params
  WHERE b.congregation_id       = params.p_congregation_id
    AND EXTRACT(YEAR FROM b.datum)::int = params.p_ev
    AND COALESCE(b.deleted,false) = false
    AND b.bankszamla_id IS NULL
    AND b.belso_mozgas_xkey IS NULL
),
stats AS (
  SELECT
    COUNT(*)                                               AS total,
    COUNT(*) FILTER (WHERE iratszam_num IS NOT NULL)       AS iratszam_num_db,
    COUNT(*) FILTER (WHERE nyugta_num   IS NOT NULL)       AS nyugta_num_db,
    COUNT(*) FILTER (WHERE tukrozott)                      AS tukr_db,
    COUNT(*) FILTER (WHERE new_num IS NOT NULL)            AS valodi_nyugta_db,
    MIN(iratszam_num) AS ir_min, MAX(iratszam_num) AS ir_max,
    MIN(old_num) AS old_min, MAX(old_num) AS old_max, COUNT(DISTINCT old_num) AS old_dist,
    MIN(new_num) AS new_min, MAX(new_num) AS new_max, COUNT(DISTINCT new_num) AS new_dist
  FROM base
),
-- (1) DARABSZÁMOK
r1 AS (
  SELECT 1 grp, 1 o, '01 keszpenzes_sorok_ossz'                      kulcs, total::text                 ertek FROM stats
  UNION ALL SELECT 1,2,'02 iratszam_szamjegyes (Keruleti)',          iratszam_num_db::text FROM stats
  UNION ALL SELECT 1,3,'03 nyugta_szamjegyes',                       nyugta_num_db::text  FROM stats
  UNION ALL SELECT 1,4,'04 tukrozott (nyugta=iratszam)',             tukr_db::text        FROM stats
  UNION ALL SELECT 1,5,'05 valodi_kulon_nyugta (Irat sz.)',          valodi_nyugta_db::text FROM stats
),
-- (2) A KÉT SKÁLA KÜLÖN — ez bizonyítja, hogy két külön számsor
r2 AS (
  SELECT 2 grp, 1 o, '10 Keruleti (iratszam) MIN', ir_min::text  ertek FROM stats
  UNION ALL SELECT 2,2,'11 Keruleti (iratszam) MAX', ir_max::text FROM stats
  UNION ALL SELECT 2,3,'12 Irat sz. (nem-tukrozott nyugta) MIN', new_min::text FROM stats
  UNION ALL SELECT 2,4,'13 Irat sz. (nem-tukrozott nyugta) MAX', new_max::text FROM stats
),
-- (3) RÉGI vs ÚJ monitor MIN..MAX + a HAMIS hézag mérete
r3 AS (
  SELECT 3 grp, 1 o, '20 REGI (iratszam||nyugta) MIN', old_min::text ertek FROM stats
  UNION ALL SELECT 3,2,'21 REGI (iratszam||nyugta) MAX', old_max::text FROM stats
  UNION ALL SELECT 3,3,'22 REGI kulonbozo szamok db',   old_dist::text FROM stats
  UNION ALL SELECT 3,4,'23 REGI HAMIS_HIANYZO ~ (max-min+1 - db)',
                  (COALESCE(old_max,0) - COALESCE(old_min,0) + 1 - COALESCE(old_dist,0))::text FROM stats
  UNION ALL SELECT 3,5,'24 UJ (csak Irat sz.) MIN',      new_min::text FROM stats
  UNION ALL SELECT 3,6,'25 UJ (csak Irat sz.) MAX',      new_max::text FROM stats
  UNION ALL SELECT 3,7,'26 UJ kulonbozo szamok db',      new_dist::text FROM stats
  UNION ALL SELECT 3,8,'27 UJ VALODI_HIANYZO ~ (max-min+1 - db)',
                  (COALESCE(new_max,0) - COALESCE(new_min,0) + 1 - COALESCE(new_dist,0))::text FROM stats
),
-- (4) 20 MINTA SOR (nyers értékek)
r4 AS (
  SELECT 4 grp, ROW_NUMBER() OVER (ORDER BY datum, id) o,
         ('minta #' || ROW_NUMBER() OVER (ORDER BY datum, id))::text kulcs,
         ( 'datum='       || COALESCE(datum::text,'∅')
        || ' | iratszam(Ker)=' || COALESCE(iratszam,'∅')
        || ' | nyugta(Irat)='  || COALESCE(nyugta,'∅')
        || ' | irattipus='|| COALESCE(irattipus,'∅')
        || CASE WHEN tukrozott THEN ' | [TUKROZOTT]' ELSE '' END ) ertek
  FROM base ORDER BY datum, id LIMIT 20
)
SELECT grp, o, kulcs, ertek
FROM (SELECT * FROM r1 UNION ALL SELECT * FROM r2 UNION ALL SELECT * FROM r3 UNION ALL SELECT * FROM r4) egyben
ORDER BY grp, o;

-- ÉRTELMEZÉS:
--   Ha a 23-as sor (~115000) sokkal nagyobb, mint a 27-es (kicsi), az BIZONYÍTJA: a régi
--   monitor a Kerületi (~115k) számot beszámolta a nyugta-sorozatba, ezért a gyülekezeti
--   1..N szám ~115000-es "hézagnak" látszott. Az új logika (csak Irat sz.) valós hézagot mér.
--   A 10–13 sor a két külön skálát mutatja (Kerületi ~115k vs Irat sz. 1..N).


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 2 — BUG 2: miért nem lát adatot egy adott email? (RLS-szimuláció)
-- Állítsd be a p_email-t, futtasd KÜLÖN, másold vissza a 3 sort.
-- ════════════════════════════════════════════════════════════════════════════
WITH params AS (
  SELECT 'valaki@example.com'::text AS p_email   -- << ÍRD ÁT
),
u AS (
  SELECT au.id, au.email, au.created_at, au.last_sign_in_at, au.email_confirmed_at,
         au.raw_app_meta_data->>'provider' AS provider
  FROM auth.users au, params WHERE lower(au.email) = lower(params.p_email)
),
p AS (
  SELECT pr.id, pr.status, pr.role, pr.congregation_id, pr.diocese_id, pr.district_id,
         pr.full_name, pr.deleted_at, pr.anonymized_at
  FROM public.profiles pr JOIN u ON u.id = pr.id
)
SELECT 'A_user_es_profil' AS blokk, 1 AS o,
  ( 'auth_user_letezik=' || CASE WHEN EXISTS(SELECT 1 FROM u) THEN 'IGEN' ELSE 'NEM' END
 || ' | user_id='        || COALESCE((SELECT id::text FROM u),'∅')
 || ' | provider='       || COALESCE((SELECT provider FROM u),'∅')
 || ' | email_megerositve=' || COALESCE((SELECT email_confirmed_at::text FROM u),'NEM')
 || ' | last_sign_in='   || COALESCE((SELECT last_sign_in_at::text FROM u),'soha')
 || ' | profil_letezik=' || CASE WHEN EXISTS(SELECT 1 FROM p) THEN 'IGEN' ELSE 'NEM' END
 || ' | status='         || COALESCE((SELECT status FROM p),'∅')
 || ' | role='           || COALESCE((SELECT role FROM p),'∅')
 || ' | congregation_id='|| COALESCE((SELECT congregation_id::text FROM p),'NULL(!)')
 || ' | full_name='      || COALESCE((SELECT full_name FROM p),'∅')
 || ' | deleted_at='     || COALESCE((SELECT deleted_at::text FROM p),'nincs')
  ) AS reszletek
UNION ALL
SELECT 'B_profile_roles' AS blokk, 2 AS o,
  ( 'role='             || COALESCE(rr.role,'∅')
 || ' | scope='         || COALESCE(rr.scope,'∅')
 || ' | scope_id='      || COALESCE(rr.scope_id::text,'∅')
 || ' | approval_status='|| COALESCE(rr.approval_status,'∅')
 || ' | active='        || COALESCE(rr.active::text,'∅')
  ) AS reszletek
FROM public.profile_roles rr JOIN u ON u.id = rr.profile_id
UNION ALL
SELECT 'C_rls_ertekeles' AS blokk, 3 AS o,
  ( 'ervenyes_congregation_scope_db=' ||
      (SELECT COUNT(*) FROM public.profile_roles rr JOIN u ON u.id = rr.profile_id
        WHERE rr.active AND rr.approval_status='approved' AND rr.scope='congregation' AND rr.scope_id IS NOT NULL)::text
 || ' | profile_roles_congregation_id-k=' ||
      COALESCE((SELECT string_agg(DISTINCT rr.scope_id::text, ', ')
                FROM public.profile_roles rr JOIN u ON u.id = rr.profile_id
                WHERE rr.active AND rr.approval_status='approved' AND rr.scope='congregation' AND rr.scope_id IS NOT NULL),'NINCS(!)')
 || ' | profiles.congregation_id=' || COALESCE((SELECT congregation_id::text FROM p),'NULL(!)')
 || ' | RLS_LATNA_ADATOT=' ||
      CASE WHEN (SELECT status FROM p) = 'active' AND (SELECT congregation_id FROM p) IS NOT NULL
           THEN 'IGEN (a sajat congregation_id-jara)' ELSE 'NEM (a skalar NULL vagy nem aktiv)' END
  ) AS reszletek
ORDER BY o;

-- ÉRTELMEZÉS:
--   Az RLS (current_user_congregation_id) KIZÁRÓLAG a profiles.congregation_id skalárt nézi
--   status='active' mellett. Ha a C sorban 'RLS_LATNA_ADATOT=NEM', az a gyökérok → futtasd:
--   2026-07-01-bug2-masodik-email-javitas.sql. A B blokk megmutatja, hogy az app-réteg
--   profile_roles-a esetleg jó, de az RLS azt nem nézi (ezért kell a skalár).
