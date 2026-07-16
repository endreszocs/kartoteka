-- =============================================================================
-- KARTOTÉKA — FÓKUSZÁLT GYÖKÉROK-DIAGNOSZTIKA
-- 2026-07-16
--
-- Tünet: „A 2025. évi pénzügyi beállítás nem hozható létre automatikusan."
--
-- HIPOTÉZIS (kódból igazolt mechanizmus, DE az Ön adatán még nem mérve):
--   Az app az effectiveCongregationId-vel kérdez (a KIVÁLASZTOTT gyülekezet),
--   az RLS viszont csak a profiles.congregation_id skalárt engedi
--   (VAGY global access = role IN ('admin','esperes','egyhazmegyei_admin')).
--   Az 'egyhazkeruleti_admin' NINCS a listán → kerületi adminként másik
--   gyülekezetet nézve minden lekérdezés ÜRESEN jön vissza.
--
-- ⚠️ CSAK OLVAS. Nincs INSERT/UPDATE/DELETE/ALTER/DROP.
-- Futtatás: Supabase → SQL Editor. Küldje vissza mind a 3 blokk eredményét.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1) ★ A DÖNTŐ KÉRDÉS: mi az Ön profiles.role-ja és congregation_id-ja?
--    Ha a role NEM 'admin'/'esperes'/'egyhazmegyei_admin', akkor az RLS
--    Önt sima lelkésznek látja, hiába admin az app felületén.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  p.id                AS profile_id,
  p.email,
  p.full_name,
  p.role              AS profiles_role,
  p.status,
  p.congregation_id   AS rls_altal_latott_gyulekezet,
  c.name              AS rls_gyulekezet_neve,
  (p.role IN ('admin','esperes','egyhazmegyei_admin'))
                      AS van_globalis_rls_hozzaferese,
  CASE
    WHEN p.role IN ('admin','esperes','egyhazmegyei_admin')
      THEN 'OK — mindent lát, a hipotézis NEM áll'
    ELSE 'GYANÚS — csak a sajat gyulekezetet latja (' || COALESCE(c.name,'NINCS') || ')'
  END                 AS verdikt
FROM public.profiles p
LEFT JOIN public.congregations c ON c.id = p.congregation_id
WHERE p.email = 'endreszocs@gmail.com';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Milyen profile_roles sorai vannak? (az app EZEKBŐL választ scope-ot —
--    ha a scope_id != profiles.congregation_id, ott a széthúzás.)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  pr.scope,
  pr.scope_id,
  pr.role             AS profile_roles_role,
  pr.approval_status,
  pr.granted_at,
  COALESCE(c.name, d.name, dist.name) AS scope_neve,
  (pr.scope = 'congregation' AND pr.scope_id = p.congregation_id)
                      AS egyezik_a_profil_skalarral
FROM public.profile_roles pr
JOIN public.profiles p            ON p.id = pr.profile_id
LEFT JOIN public.congregations c  ON c.id = pr.scope_id
LEFT JOIN public.dioceses d       ON d.id = pr.scope_id
LEFT JOIN public.districts dist   ON dist.id = pr.scope_id
WHERE p.email = 'endreszocs@gmail.com'
ORDER BY pr.granted_at DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3) A KÉT BARÁTOSI duplikátum: melyik az „élő"? (Ez dönti el, melyiket
--    lehet biztonságosan törölni — és hogy egyáltalán szabad-e.)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  c.id,
  c.name,
  c.nev_hu,
  c.eves_jarulek        AS congregations_eves_jarulek,
  c.jarulek_hatarid,
  (SELECT count(*) FROM public.szemely    s WHERE s.congregation_id = c.id) AS szemelyek,
  (SELECT count(*) FROM public.befizetes  b WHERE b.congregation_id = c.id) AS befizetesek,
  (SELECT count(*) FROM public.kiadas     k WHERE k.congregation_id = c.id) AS kiadasok,
  (SELECT count(*) FROM public.bealitas   x WHERE x.congregation_id = c.id) AS bealitas_evek,
  (SELECT string_agg(x.id || '=' || x.eves_jarulek, ', ' ORDER BY x.id)
     FROM public.bealitas x WHERE x.congregation_id = c.id)                 AS evenkenti_jarulek,
  (SELECT count(*) FROM public.profiles   pf WHERE pf.congregation_id = c.id) AS ide_kotott_profilok,
  (SELECT count(*) FROM public.profile_roles pr
     WHERE pr.scope = 'congregation' AND pr.scope_id = c.id)               AS ide_kotott_szerepkorok
FROM public.congregations c
WHERE c.name ILIKE '%arátos%' OR c.name ILIKE '%aratos%'
   OR c.nev_hu ILIKE '%arátos%' OR c.nev_hu ILIKE '%aratos%'
ORDER BY c.name;
