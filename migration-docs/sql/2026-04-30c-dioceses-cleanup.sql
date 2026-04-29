-- KARTOTEKA — Dioceses takarítás: 3 felesleges egyházmegye törlése
-- Dátum: 2026-04-30c (harmadik a napon)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- ELŐFELTÉTEL: a 2026-04-30b-dioceses-cleanup-diagnostic.sql kimutatta, hogy
-- mind a 3 törlendő egyházmegyére 0 hivatkozás van (0 congregations, 0
-- bankszamlak, 0 chitanta_tombok, 0 diocese_*, 0 profiles).
-- → biztonságos a DELETE remap nélkül.
--
-- TÖRLENDŐ:
--   1. Marosmezőségi (egybeírva, duplikáció)
--      ID: 43fd33cc-9cf5-4c8d-a61b-c7ab1297e299
--      A "Maros-Mezőségi" (kötőjellel, hivatalos) megmarad
--   2. Hunyad-Zarándi (a Hunyadi-vel azonos, nem hivatalos név)
--      ID: 87306ff3-3120-44de-b55b-29fbdbc4befe
--   3. Nagysajói (nem létezik a reformatus.ro/cimtar listán)
--      ID: 478fb30e-36fe-43ae-89ed-119f307b4839
--
-- VÁRT EREDMÉNY: a `dioceses` tábla 18 → 15 sorra csökken.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- DELETE — 3 felesleges egyházmegye
-- ════════════════════════════════════════════════════════════════════════════

DELETE FROM public.dioceses
WHERE id IN (
    '43fd33cc-9cf5-4c8d-a61b-c7ab1297e299',  -- Marosmezőségi (duplikáció)
    '87306ff3-3120-44de-b55b-29fbdbc4befe',  -- Hunyad-Zarándi (Hunyadi-vel azonos)
    '478fb30e-36fe-43ae-89ed-119f307b4839'   -- Nagysajói (nem létezik)
);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. A 3 törlendő ID már nem szerepel
SELECT
    'Törölve' AS status,
    COUNT(*) FILTER (WHERE id = '43fd33cc-9cf5-4c8d-a61b-c7ab1297e299') AS marosmezosegi_old,
    COUNT(*) FILTER (WHERE id = '87306ff3-3120-44de-b55b-29fbdbc4befe') AS hunyad_zarandi,
    COUNT(*) FILTER (WHERE id = '478fb30e-36fe-43ae-89ed-119f307b4839') AS nagysajoi
FROM public.dioceses
WHERE id IN (
    '43fd33cc-9cf5-4c8d-a61b-c7ab1297e299',
    '87306ff3-3120-44de-b55b-29fbdbc4befe',
    '478fb30e-36fe-43ae-89ed-119f307b4839'
);
-- Várt: 0, 0, 0

-- 2. Az Erdélyi Református Egyházkerülethez tartozó egyházmegyék (várt: 15)
SELECT COUNT(*) AS erdelyi_egyhazmegyek
FROM public.dioceses d
JOIN public.districts dt ON d.district_id = dt.id
WHERE dt.name = 'Erdélyi Református Egyházkerület';
-- Várt: 15

-- 3. A 15 hivatalos egyházmegye listája (név szerint rendezve)
SELECT d.name AS egyhazmegye, d.id, d.created_at
FROM public.dioceses d
JOIN public.districts dt ON d.district_id = dt.id
WHERE dt.name = 'Erdélyi Református Egyházkerület'
ORDER BY d.name;
-- Várt: pontosan 15 sor (Brassói, Dési, Erdővidéki, Görgényi, Hunyadi,
--       Kalotaszegi, Kézdi-Orbai, Kolozsvári, Küküllői, Maros-Mezőségi,
--       Marosi, Nagyenyedi, Sepsi, Székelyudvarhelyi, Tordai)
