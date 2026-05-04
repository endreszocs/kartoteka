-- =========================================================================
-- 2026-05-04 — Teszt gyülekezet létrehozása Kézdi-Orbai egyházmegyében
-- =========================================================================
-- KONTEXTUS:
--   Endre kéri, hogy egy teszt-gyülekezetet hozzunk létre, amelyhez egy
--   email-meghívóval tudja tesztelni a teljes felhasználói flow-t:
--     1. Hozzáférés-kérelem a publikus oldalon
--     2. Admin-jóváhagyás
--     3. Lelkészi szerepkör hozzárendelése a Teszt gyülekezethez
--     4. Wizard-flow végigvitele
--     5. Pénzügyi/anyakönyvi tesztelés
--
-- A teszt-gyülekezet jól megkülönböztethető névvel jön létre, hogy ne
-- keveredjen valós adatokkal.
-- =========================================================================

INSERT INTO public.congregations (
  nev_hu,
  name,
  nev_ro,
  diocese_id
)
VALUES (
  'Teszt Református Egyházközség',
  'Teszt Református Egyházközség',
  'Parohia Reformată Test',
  '0006568d-f35d-45c1-8af4-ce01e137db93'  -- Kézdi-Orbai Református Egyházmegye
)
RETURNING id, nev_hu, diocese_id, created_at;


-- ──────────────────────────────────────────────────────────────────────────
-- ELLENŐRZÉS — most már a gyülekezetlistában
-- ──────────────────────────────────────────────────────────────────────────

SELECT
  c.id,
  c.nev_hu,
  c.diocese_id,
  d.name AS egyhazmegye,
  COUNT(p.id) FILTER (WHERE p.status = 'active') AS aktiv_felhasznalo_szam
FROM public.congregations c
LEFT JOIN public.dioceses d ON d.id = c.diocese_id
LEFT JOIN public.profiles p ON p.congregation_id = c.id
WHERE c.nev_hu = 'Teszt Református Egyházközség'
GROUP BY c.id, c.nev_hu, c.diocese_id, d.name;
