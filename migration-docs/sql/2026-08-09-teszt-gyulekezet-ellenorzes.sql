-- ============================================================================
-- 2026-08-09 — TESZT GYÜLEKEZET ELLENŐRZÉS (csak olvasás, semmit nem módosít)
-- ============================================================================
-- Mi van MOST a Teszt gyülekezetben (7e570000-0000-4000-8000-000000000003)?
-- Sor-darabszámok minden gyülekezet-hatókörű táblára + néhány mintasor.
--
-- FUTTATÁS: Supabase SQL Editor. A szerkesztő mindig csak az UTOLSÓ SELECT
-- eredményét mutatja — ezért futtasd SZAKASZONKÉNT (jelöld ki az adott blokkot,
-- majd Run), vagy egyszerre és görgess a "Results" fülek közt, ha a felület
-- több eredményt is megjelenít.
--
-- Ha valamelyik tábla nálad nem létezik (schema drift), az adott sort
-- kommentezd ki és futtasd újra a blokkot.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. BLOKK — Org-hierarchia: megvan-e a gyülekezet + megye + kerület?
-- ────────────────────────────────────────────────────────────────────────────
SELECT c.id, c.name, c.status, c.eves_jarulek, c.jarulek_hatarid,
       d.name  AS egyhazmegye,
       dt.name AS egyhazkerulet,
       c.adrstreet_id, c.adrlocality_id
FROM public.congregations c
LEFT JOIN public.dioceses  d  ON d.id  = c.diocese_id
LEFT JOIN public.districts dt ON dt.id = d.district_id
WHERE c.id = '7e570000-0000-4000-8000-000000000003';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. BLOKK — Kik férnek hozzá? (profilok + szerep-hozzárendelések)
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'profiles (congregation_id = teszt)' AS mit, count(*)::text AS db,
       string_agg(coalesce(email, full_name, id::text), ', ') AS reszletek
FROM public.profiles
WHERE congregation_id = '7e570000-0000-4000-8000-000000000003'
UNION ALL
SELECT 'profile_roles (scope = teszt gyülekezet)', count(*)::text,
       string_agg(pr.role || ' → ' || coalesce(p.email, pr.profile_id::text), ', ')
FROM public.profile_roles pr
LEFT JOIN public.profiles p ON p.id = pr.profile_id
WHERE pr.scope = 'congregation'
  AND pr.scope_id = '7e570000-0000-4000-8000-000000000003'
UNION ALL
SELECT 'profile_congregations (könyvelő/számvevő)', count(*)::text,
       string_agg(coalesce(p.email, pc.profile_id::text), ', ')
FROM public.profile_congregations pc
LEFT JOIN public.profiles p ON p.id = pc.profile_id
WHERE pc.congregation_id = '7e570000-0000-4000-8000-000000000003';


-- ────────────────────────────────────────────────────────────────────────────
-- 3. BLOKK — SOR-DARABSZÁMOK táblánként (a fő leltár)
--    A csalad/gyerek táblának nincs congregation_id-je → a szülők szemely-én
--    keresztül szűrünk (pontosan úgy, ahogy a teardown is teszi).
-- ────────────────────────────────────────────────────────────────────────────
WITH cid AS (SELECT '7e570000-0000-4000-8000-000000000003'::uuid AS id)
SELECT * FROM (
  -- Személyek + család-modell
  SELECT 10 AS sorrend, 'szemely'                    AS tabla, count(*) AS db FROM public.szemely, cid WHERE congregation_id = cid.id
  UNION ALL SELECT 11, 'szemely (élő, aktív)', count(*) FROM public.szemely, cid
    WHERE congregation_id = cid.id AND meghalt = false AND coalesce(member_status, 'aktív') NOT IN ('elhunyt','elköltözött','elkoltozott','kitért','törölt')
  UNION ALL SELECT 12, 'csalad (szülő a tesztben)', count(*) FROM public.csalad c, cid
    WHERE c.id_ferfi IN (SELECT id FROM public.szemely WHERE congregation_id = cid.id)
       OR c.id_no    IN (SELECT id FROM public.szemely WHERE congregation_id = cid.id)
  UNION ALL SELECT 13, 'gyerek (teszt-személyre mutat)', count(*) FROM public.gyerek g, cid
    WHERE g.id_szemely IN (SELECT id FROM public.szemely WHERE congregation_id = cid.id)
  UNION ALL SELECT 14, 'szemely_kapcsolat', count(*) FROM public.szemely_kapcsolat, cid WHERE congregation_id = cid.id
  UNION ALL SELECT 15, 'haztartas',          count(*) FROM public.haztartas, cid          WHERE congregation_id = cid.id
  UNION ALL SELECT 16, 'haztartas_tag',      count(*) FROM public.haztartas_tag, cid      WHERE congregation_id = cid.id
  UNION ALL SELECT 17, 'cim',                count(*) FROM public.cim, cid                WHERE congregation_id = cid.id
  UNION ALL SELECT 18, 'csoport',            count(*) FROM public.csoport, cid            WHERE congregation_id = cid.id
  UNION ALL SELECT 19, 'presbiter',          count(*) FROM public.presbiter, cid          WHERE congregation_id = cid.id
  UNION ALL SELECT 20, 'felmentes',          count(*) FROM public.felmentes, cid          WHERE congregation_id = cid.id
  UNION ALL SELECT 21, 'csaladlatogatas',    count(*) FROM public.csaladlatogatas, cid    WHERE congregation_id = cid.id
  -- Anyakönyvek + mozgások
  UNION ALL SELECT 30, 'keresztseg',   count(*) FROM public.keresztseg, cid   WHERE congregation_id = cid.id
  UNION ALL SELECT 31, 'konfirmalas',  count(*) FROM public.konfirmalas, cid  WHERE congregation_id = cid.id
  UNION ALL SELECT 32, 'hazassag',     count(*) FROM public.hazassag, cid     WHERE congregation_id = cid.id
  UNION ALL SELECT 33, 'temetes',      count(*) FROM public.temetes, cid      WHERE congregation_id = cid.id
  UNION ALL SELECT 34, 'attert',       count(*) FROM public.attert, cid       WHERE congregation_id = cid.id
  UNION ALL SELECT 35, 'bekoltozott',  count(*) FROM public.bekoltozott, cid  WHERE congregation_id = cid.id
  UNION ALL SELECT 36, 'elkoltozott',  count(*) FROM public.elkoltozott, cid  WHERE congregation_id = cid.id OR hova_congregation_id = cid.id
  UNION ALL SELECT 37, 'kitert',       count(*) FROM public.kitert, cid       WHERE congregation_id = cid.id
  -- Pénzügy
  UNION ALL SELECT 40, 'befizetes',                 count(*) FROM public.befizetes, cid                 WHERE congregation_id = cid.id
  UNION ALL SELECT 41, 'kiadas',                    count(*) FROM public.kiadas, cid                    WHERE congregation_id = cid.id
  UNION ALL SELECT 42, 'belsomozgas',               count(*) FROM public.belsomozgas, cid               WHERE congregation_id = cid.id
  UNION ALL SELECT 43, 'bankszamlak',               count(*) FROM public.bankszamlak, cid               WHERE congregation_id = cid.id
  UNION ALL SELECT 44, 'bankszamla_nyito_egyenleg', count(*) FROM public.bankszamla_nyito_egyenleg, cid WHERE congregation_id = cid.id
  UNION ALL SELECT 45, 'keszpenz_nyito_egyenleg',   count(*) FROM public.keszpenz_nyito_egyenleg, cid   WHERE congregation_id = cid.id
  UNION ALL SELECT 46, 'bealitas (év-sorok)',       count(*) FROM public.bealitas, cid                  WHERE congregation_id = cid.id
  UNION ALL SELECT 47, 'koltsegvetes',              count(*) FROM public.koltsegvetes, cid              WHERE congregation_id = cid.id
  UNION ALL SELECT 48, 'congregation_annual_fees',  count(*) FROM public.congregation_annual_fees, cid  WHERE congregation_id = cid.id
  UNION ALL SELECT 49, 'chitanta_tombok',           count(*) FROM public.chitanta_tombok, cid           WHERE congregation_id = cid.id
  UNION ALL SELECT 50, 'jarulek_kedvezmeny',        count(*) FROM public.jarulek_kedvezmeny, cid        WHERE congregation_id = cid.id
  UNION ALL SELECT 51, 'berleti_szerzodes',         count(*) FROM public.berleti_szerzodes, cid         WHERE congregation_id = cid.id
  UNION ALL SELECT 52, 'transactions (legacy)',     count(*) FROM public.transactions, cid              WHERE congregation_id = cid.id
  UNION ALL SELECT 53, 'kiadasikiseroiv',           count(*) FROM public.kiadasikiseroiv k, cid
    WHERE k.id_kiadas IN (SELECT id FROM public.kiadas WHERE congregation_id = cid.id)
  UNION ALL SELECT 54, 'valuta_atert',              count(*) FROM public.valuta_atert, cid              WHERE congregation_id = cid.id
  UNION ALL SELECT 55, 'materials',                 count(*) FROM public.materials, cid                 WHERE congregation_id = cid.id
  UNION ALL SELECT 56, 'material_movements',        count(*) FROM public.material_movements, cid        WHERE congregation_id = cid.id
  UNION ALL SELECT 57, 'oblio_fiokok',              count(*) FROM public.oblio_fiokok, cid              WHERE congregation_id = cid.id
  UNION ALL SELECT 58, 'oblio_szamlak',             count(*) FROM public.oblio_szamlak, cid             WHERE congregation_id = cid.id
  UNION ALL SELECT 59, 'oblio_kiadas_match',        count(*) FROM public.oblio_kiadas_match, cid        WHERE congregation_id = cid.id
  -- Leltár + iktató + munkanapló + programok
  UNION ALL SELECT 60, 'leltar_tetelek',            count(*) FROM public.leltar_tetelek, cid            WHERE congregation_id = cid.id
  UNION ALL SELECT 61, 'munkanaplo',                count(*) FROM public.munkanaplo, cid                WHERE congregation_id = cid.id
  UNION ALL SELECT 62, 'gyulekezeti_programok',     count(*) FROM public.gyulekezeti_programok, cid     WHERE congregation_id = cid.id
  UNION ALL SELECT 63, 'iktato',                    count(*) FROM public.iktato, cid                    WHERE congregation_id = cid.id
  UNION ALL SELECT 64, 'iktato_sablonok',           count(*) FROM public.iktato_sablonok, cid           WHERE congregation_id = cid.id
  -- Temető
  UNION ALL SELECT 70, 'sirhelytemeto',  count(*) FROM public.sirhelytemeto, cid WHERE congregation_id = cid.id
  UNION ALL SELECT 71, 'sirhely',        count(*) FROM public.sirhely s, cid
    WHERE s.temetoid IN (SELECT id FROM public.sirhelytemeto WHERE congregation_id = cid.id)
  UNION ALL SELECT 72, 'sirhelyberles',  count(*) FROM public.sirhelyberles b, cid
    WHERE b.sirhelyid IN (SELECT s.id FROM public.sirhely s
                          WHERE s.temetoid IN (SELECT id FROM public.sirhelytemeto WHERE congregation_id = cid.id))
  UNION ALL SELECT 73, 'sirhelyelhunyt', count(*) FROM public.sirhelyelhunyt e, cid
    WHERE e.sirhelyid IN (SELECT s.id FROM public.sirhely s
                          WHERE s.temetoid IN (SELECT id FROM public.sirhelytemeto WHERE congregation_id = cid.id))
  -- Jegyzőkönyvek + nyilvános oldal + egyéb
  UNION ALL SELECT 80, 'presbiteri_jegyzokonyvek', count(*) FROM public.presbiteri_jegyzokonyvek, cid WHERE congregation_id = cid.id
  UNION ALL SELECT 81, 'public_sites',             count(*) FROM public.public_sites, cid             WHERE congregation_id = cid.id
  UNION ALL SELECT 82, 'public_posts',             count(*) FROM public.public_posts, cid             WHERE congregation_id = cid.id
  UNION ALL SELECT 83, 'public_magazines',         count(*) FROM public.public_magazines, cid         WHERE congregation_id = cid.id
  UNION ALL SELECT 84, 'import_logs',              count(*) FROM public.import_logs, cid              WHERE congregation_id = cid.id
  UNION ALL SELECT 85, 'annual_reports',           count(*) FROM public.annual_reports, cid           WHERE congregation_id = cid.id
  UNION ALL SELECT 86, 'document_submissions',     count(*) FROM public.document_submissions, cid     WHERE congregation_id = cid.id
  UNION ALL SELECT 87, 'support_messages',         count(*) FROM public.support_messages, cid         WHERE congregation_id = cid.id
  UNION ALL SELECT 88, 'ertesitesek',              count(*) FROM public.ertesitesek, cid              WHERE congregation_id = cid.id
  UNION ALL SELECT 89, 'admin_access_requests',    count(*) FROM public.admin_access_requests, cid    WHERE congregation_id = cid.id
  -- Kereszt-gyülekezeti egyezés-értesítések (mindkét irányban érintett)
  UNION ALL SELECT 90, 'cross_congregation_match_notifications (érintett)', count(*)
    FROM public.cross_congregation_match_notifications, cid
    WHERE triggering_congregation_id = cid.id OR matched_congregation_id = cid.id
) t
ORDER BY sorrend;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. BLOKK — MINTASOROK: az első 15 személy (a klón-gyanú gyors ellenőrzése —
--    ha itt valódi Barátosi neveket látsz, az a +631-es klón adat!)
-- ────────────────────────────────────────────────────────────────────────────
SELECT id, cnp, csaladnev, k_nev, sz_datum, telefon, member_status, meghalt,
       csaladfo, c_szcim, megjegyzes
FROM public.szemely
WHERE congregation_id = '7e570000-0000-4000-8000-000000000003'
ORDER BY id
LIMIT 15;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. BLOKK — Pénzügy évenként: befizetés + kiadás összegek (mi van a könyvben?)
-- ────────────────────────────────────────────────────────────────────────────
SELECT ev, tipus, db, osszesen FROM (
  SELECT extract(year FROM datum)::int AS ev, 'befizetes' AS tipus,
         count(*) AS db, sum(osszeg) AS osszesen
  FROM public.befizetes
  WHERE congregation_id = '7e570000-0000-4000-8000-000000000003' AND deleted = false
  GROUP BY 1
  UNION ALL
  SELECT extract(year FROM datum)::int, 'kiadas', count(*), sum(osszeg)
  FROM public.kiadas
  WHERE congregation_id = '7e570000-0000-4000-8000-000000000003' AND deleted = false
  GROUP BY 1
) t
ORDER BY ev, tipus;


-- ────────────────────────────────────────────────────────────────────────────
-- 6. BLOKK — Év-beállítások (bealitas): melyik évre van sor, mennyi a járulék?
-- ────────────────────────────────────────────────────────────────────────────
SELECT id AS ev, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid, aktiv,
       nyito_keszpenz, nyito_bank, budget_finalized, accounting_finalized
FROM public.bealitas
WHERE congregation_id = '7e570000-0000-4000-8000-000000000003'
ORDER BY id;


-- ────────────────────────────────────────────────────────────────────────────
-- 7. BLOKK — Feloldatlan kereszt-gyülekezeti egyezések (értesítés-spam gyanú)
-- ────────────────────────────────────────────────────────────────────────────
SELECT n.confidence, n.notification_type, n.created_at,
       ts.csaladnev || ' ' || ts.k_nev  AS teszt_szemely,
       ms.csaladnev || ' ' || ms.k_nev  AS masik_szemely,
       mc.name                          AS masik_gyulekezet
FROM public.cross_congregation_match_notifications n
LEFT JOIN public.szemely ts ON ts.id = n.triggering_szemely_id
LEFT JOIN public.szemely ms ON ms.id = n.matched_szemely_id
LEFT JOIN public.congregations mc ON mc.id = n.matched_congregation_id
WHERE (n.triggering_congregation_id = '7e570000-0000-4000-8000-000000000003'
    OR n.matched_congregation_id    = '7e570000-0000-4000-8000-000000000003')
  AND n.resolution IS NULL
ORDER BY n.created_at DESC
LIMIT 30;
