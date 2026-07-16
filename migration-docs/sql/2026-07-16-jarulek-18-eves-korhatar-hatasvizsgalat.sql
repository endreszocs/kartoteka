-- =============================================================================
-- KARTOTÉKA — A 18 ÉVES KORHATÁR BEVEZETÉSÉNEK HATÁSVIZSGÁLATA
-- 2026-07-16
--
-- HÁTTÉR: a rendszer jelenleg MINDEN élő tagra a teljes éves járulékot várja el,
--   életkortól függetlenül (újszülöttre is). A user szerint hivatalosan 18 éves
--   kortól jár. A javítás visszamenőleg is hatna → előbb mérjük fel, mit érint.
--
-- ⚠️ CSAK OLVAS. Nincs INSERT/UPDATE/DELETE/ALTER.
-- Futtatás: Supabase → SQL Editor. Barátosi = 43cff37f-1131-4c79-8082-0e8af61cf40a
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) ★ MEKKORA A TÉTEL? Hány élő tag kiskorú, és mennyi díj tűnne el 2026-ban?
--    (A motor ÉVKÜLÖNBSÉGGEL számol: 2026 - születési év.)
-- ─────────────────────────────────────────────────────────────────────────────
WITH elo_tagok AS (
  SELECT
    s.id,
    s.csaladnev, s.k_nev, s.sz_datum,
    CASE
      WHEN s.sz_datum IS NULL THEN NULL
      WHEN EXTRACT(YEAR FROM s.sz_datum)::int < 1900 THEN NULL
      ELSE 2026 - EXTRACT(YEAR FROM s.sz_datum)::int
    END AS kor_2026
  FROM public.szemely s
  WHERE s.congregation_id = '43cff37f-1131-4c79-8082-0e8af61cf40a'
    AND s.isvisible = true
    AND COALESCE(s.meghalt, false) = false
    -- FIGYELEM: a szemely-nek NINCS `elkoltozott` oszlopa (az kulon tabla) —
    -- a koltozes/kiteres a member_status-ban van kodolva.
    AND COALESCE(s.member_status, '') NOT IN ('elkoltozott', 'elköltözött', 'kitért', 'kitert', 'elhunyt', 'törölt')
)
SELECT
  count(*)                                                   AS elo_tagok_osszesen,
  count(*) FILTER (WHERE kor_2026 IS NOT NULL AND kor_2026 < 18)  AS kiskoru_18_alatt,
  count(*) FILTER (WHERE kor_2026 IS NOT NULL AND kor_2026 >= 18) AS nagykoru,
  count(*) FILTER (WHERE kor_2026 IS NULL)                    AS hianyzo_szuletesi_datum,
  220 * count(*) FILTER (WHERE kor_2026 IS NOT NULL AND kor_2026 < 18)
                                                             AS elvart_jarulek_ami_eltunne_2026_RON
FROM elo_tagok;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2) ⚠️ A HIÁNYZÓ SZÜLETÉSI DÁTUMÚ TAGOK — ezek TELJES díjat fizetnének tovább
--    (szándékosan: a néma alulszámlázás rosszabb, mint a látható túlszámlázás).
--    Érdemes a kartotékban pótolni a dátumot.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT s.id, s.csaladnev, s.k_nev, s.sz_datum, s.foglalkozas, s.member_status
FROM public.szemely s
WHERE s.congregation_id = '43cff37f-1131-4c79-8082-0e8af61cf40a'
  AND s.isvisible = true
  AND COALESCE(s.meghalt, false) = false
  AND COALESCE(s.member_status, '') NOT IN ('elkoltozott', 'elköltözött', 'kitért', 'kitert', 'elhunyt', 'törölt')
  AND (s.sz_datum IS NULL OR EXTRACT(YEAR FROM s.sz_datum)::int < 1900)
ORDER BY s.csaladnev, s.k_nev;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3) ★★ A DÖNTŐ KÉRDÉS: mely évek vannak LEZÁRVA / LEADVA?
--    Ha egy lezárt év kimutatása a tartozásból ÚJRASZÁMOLÓDIK, akkor a javítás
--    után más számot mutatna, mint amit annak idején leadott. Ez könyvelési kérdés.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  b.id                          AS ev,
  b.eves_jarulek,
  b.jarulek_hatarid,
  b.budget_finalized            AS koltsegvetes_lezarva,
  b.accounting_finalized        AS szamadas_lezarva,
  b.leltar_finalized            AS leltar_lezarva,
  b.szamadas_iktatoszam,
  b.szamadas_hatarozat_datum,
  (b.szamadas_zaro_adatok IS NOT NULL AND b.szamadas_zaro_adatok::text <> '{}')
                                AS van_befagyasztott_zaro_adat
FROM public.bealitas b
WHERE b.congregation_id = '43cff37f-1131-4c79-8082-0e8af61cf40a'
ORDER BY b.id DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Évenkénti kiskorú-arány — mennyivel változna VISSZAMENŐLEG az elvárás?
--    (Csak azokra az évekre, amelyekre van bealitas sor.)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  b.id::int                                                          AS ev,
  b.eves_jarulek::numeric                                            AS evi_dij,
  count(*) FILTER (
    WHERE s.sz_datum IS NOT NULL
      AND EXTRACT(YEAR FROM s.sz_datum)::int >= 1900
      AND (b.id::int - EXTRACT(YEAR FROM s.sz_datum)::int) < 18
  )                                                                  AS kiskoru_abban_az_evben,
  (b.eves_jarulek::numeric * count(*) FILTER (
    WHERE s.sz_datum IS NOT NULL
      AND EXTRACT(YEAR FROM s.sz_datum)::int >= 1900
      AND (b.id::int - EXTRACT(YEAR FROM s.sz_datum)::int) < 18
  ))                                                                 AS elvart_valtozas_RON
FROM public.bealitas b
CROSS JOIN public.szemely s
WHERE b.congregation_id = '43cff37f-1131-4c79-8082-0e8af61cf40a'
  AND s.congregation_id = '43cff37f-1131-4c79-8082-0e8af61cf40a'
  AND s.isvisible = true
  AND COALESCE(s.meghalt, false) = false
  AND COALESCE(s.member_status, '') NOT IN ('elkoltozott', 'elköltözött', 'kitért', 'kitert', 'elhunyt', 'törölt')
  AND b.id ~ '^[0-9]{4}$'
GROUP BY b.id, b.eves_jarulek
ORDER BY b.id DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5) A congregation_annual_fees (a „visszamenőleges díjak" panel tábla) vs a
--    bealitas (amit a SZÁMÍTÁS olvas) — mennyire húztak szét?
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  COALESCE(caf.ev::text, b.id)      AS ev,
  caf.eves_jarulek                  AS panelben_lathato_dij,
  b.eves_jarulek                    AS amivel_TENYLEG_szamol,
  CASE
    WHEN caf.ev IS NULL                        THEN 'csak bealitas — a panel nem mutatja'
    WHEN b.id IS NULL                          THEN 'CSAK a panelben — NINCS HATASA!'
    WHEN caf.eves_jarulek <> b.eves_jarulek    THEN 'ELTER — a panel hazudik'
    ELSE 'egyezik'
  END                               AS statusz
FROM public.congregation_annual_fees caf
FULL OUTER JOIN public.bealitas b
  ON b.congregation_id = caf.congregation_id
 AND b.id = caf.ev::text
WHERE COALESCE(caf.congregation_id, b.congregation_id) = '43cff37f-1131-4c79-8082-0e8af61cf40a'
ORDER BY 1 DESC;
