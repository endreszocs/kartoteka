-- ============================================================================
-- 2026-07-01 — Teszt gyülekezet áthelyezése a SAJÁT (Barátosi) egyházmegye alá
-- ============================================================================
-- MIÉRT: az admin felület a gyülekezet-listát az admin egyházkerülete/egyházmegyéje
--   szerint szűri (getScopedDioceseIds), és a hozzárendelést is scope-hoz köti
--   (assertCongregationInScope). A teszt gyülekezet a „Teszt Egyházmegye/Egyházkerület"
--   alatt volt → nem jelent meg / nem volt hozzárendelhető. Ez a script a teszt gyülekezetet
--   ugyanabba az egyházmegyébe teszi, mint a Barátosi Református Egyházközség (a te fiókod),
--   így megjelenik az admin listában és hozzárendelhető.
--
-- Automatikusan kiolvassa Barátosi diocese_id-ját; nem kell kézzel beírni.
-- A teszt gyülekezet UUID-ja és a Barátosi UUID-ja fixen benne van.
-- ============================================================================

UPDATE public.congregations t
SET diocese_id  = b.diocese_id,
    egyhazmegye = bd.name,
    district    = COALESCE(bdt.name, t.district)
FROM public.congregations b
LEFT JOIN public.dioceses  bd  ON bd.id  = b.diocese_id
LEFT JOIN public.districts bdt ON bdt.id = bd.district_id
WHERE t.id = '7e570000-0000-4000-8000-000000000003'    -- Teszt gyülekezet
  AND b.id = '43cff37f-1131-4c79-8082-0e8af61cf40a';   -- Barátosi Református Egyházközség

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────
-- A "teszt_diocese_id" és a "baratosi_diocese_id" MOST MÁR EGYEZZEN.
SELECT
  t.id            AS teszt_id,
  t.name          AS teszt_nev,
  t.diocese_id    AS teszt_diocese_id,
  d.name          AS teszt_egyhazmegye,
  b.diocese_id    AS baratosi_diocese_id
FROM public.congregations t
CROSS JOIN public.congregations b
LEFT JOIN public.dioceses d ON d.id = t.diocese_id
WHERE t.id = '7e570000-0000-4000-8000-000000000003'
  AND b.id = '43cff37f-1131-4c79-8082-0e8af61cf40a';
