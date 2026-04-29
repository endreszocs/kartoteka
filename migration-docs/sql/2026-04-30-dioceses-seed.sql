-- KARTOTEKA — Erdélyi Református Egyházkerület + 15 egyházmegye seed
-- Dátum: 2026-04-30
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- HÁTTÉR:
-- A `dioceses` és `districts` táblák léteznek, de eddig nem voltak teljes
-- listával feltöltve. A reformatus.ro/cimtar (2026-04-30 lekérdezés) alapján
-- a 15 erdélyi egyházmegyét seed-eljük.
--
-- FONTOS:
--   - A `congregations` táblát NEM bántjuk — az ott szereplő 1-2 gyülekezet
--     (pl. "Barátosi Református Egyházközség") megmarad. A 495 új gyülekezetet
--     CSAK akkor importáljuk a congregations-be, ha Endre később explicit
--     kéri (külön migráció vagy admin-import).
--   - Az egyházmegyei mezők (esperes_nev, cím, telefon, email) egyelőre
--     ÜRES marad — a reformatus.ro/cimtar public oldalain nem érhetők el.
--     Endre a meglévő papír címtárból később pótolja.
--
-- IDEMPOTENS: a beszúrásokat `WHERE NOT EXISTS` minta védi (a `name` mezőn
-- nincs UNIQUE constraint, ezért az ON CONFLICT (name) nem alkalmazható).

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Districts — Erdélyi Református Egyházkerület
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.districts (id, name, created_at)
SELECT gen_random_uuid(), 'Erdélyi Református Egyházkerület', now()
WHERE NOT EXISTS (
    SELECT 1 FROM public.districts WHERE name = 'Erdélyi Református Egyházkerület'
);

-- (Királyhágómelléki Református Egyházkerület — későbbi seed, külön migráció)

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Dioceses — 15 erdélyi egyházmegye
-- ════════════════════════════════════════════════════════════════════════════
--
-- Az egyházmegyei részletes adatok (esperes_nev, cím, telefon stb.) egyelőre
-- üresek. Az `weboldal` mezőbe a központi oldalt írjuk be alapértelmezésként.

DO $$
DECLARE
    v_district_id uuid;
    v_egyhazkerulet text := 'Erdélyi Református Egyházkerület';
    v_egyhazmegyek text[] := ARRAY[
        'Brassói Református Egyházmegye',
        'Dési Református Egyházmegye',
        'Erdővidéki Református Egyházmegye',
        'Görgényi Református Egyházmegye',
        'Hunyadi Református Egyházmegye',
        'Kalotaszegi Református Egyházmegye',
        'Kézdi-Orbai Református Egyházmegye',
        'Kolozsvári Református Egyházmegye',
        'Küküllői Református Egyházmegye',
        'Maros-Mezőségi Református Egyházmegye',
        'Marosi Református Egyházmegye',
        'Nagyenyedi Református Egyházmegye',
        'Sepsi Református Egyházmegye',
        'Székelyudvarhelyi Református Egyházmegye',
        'Tordai Református Egyházmegye'
    ];
    v_em text;
BEGIN
    -- Lekérjük a district id-t
    SELECT id INTO v_district_id
    FROM public.districts
    WHERE name = v_egyhazkerulet
    LIMIT 1;

    IF v_district_id IS NULL THEN
        RAISE EXCEPTION 'Nem találtuk a districts rekordot: %', v_egyhazkerulet;
    END IF;

    -- Egyházmegyékre INSERT (ha még nincs ugyanezzel a név+district kombóval)
    FOREACH v_em IN ARRAY v_egyhazmegyek LOOP
        INSERT INTO public.dioceses (
            id, district_id, name,
            cim_orszag, weboldal, created_at, updated_at
        )
        SELECT
            gen_random_uuid(), v_district_id, v_em,
            'Románia', 'https://reformatus.ro', now(), now()
        WHERE NOT EXISTS (
            SELECT 1 FROM public.dioceses
            WHERE name = v_em AND district_id = v_district_id
        );
    END LOOP;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Districts ellenőrzés (várt: legalább 1 sor — Erdélyi)
SELECT id, name, created_at
FROM public.districts
WHERE name LIKE '%Református%'
ORDER BY name;

-- 2. Erdélyi egyházmegyék (várt: 15)
SELECT
    d.name AS egyhazmegye,
    dt.name AS egyhazkerulet,
    d.cim_orszag,
    d.weboldal
FROM public.dioceses d
JOIN public.districts dt ON d.district_id = dt.id
WHERE dt.name = 'Erdélyi Református Egyházkerület'
ORDER BY d.name;

-- 3. Statisztika
SELECT
    'Districts' AS tabla, COUNT(*) AS count
FROM public.districts
WHERE name LIKE '%Egyházkerület'
UNION ALL
SELECT 'Erdélyi egyházmegyék', COUNT(*)
FROM public.dioceses d
JOIN public.districts dt ON d.district_id = dt.id
WHERE dt.name = 'Erdélyi Református Egyházkerület';
