-- KARTOTEKA — Nem-református elköltözöttek felmérése
-- Dátum: 2026-04-30i (kilencedik a napon)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- HÁTTÉR (Endre): "Már beanyakönyveztünk egy személyt aki katolikus és
-- elköltözött. Azt is oldjuk meg!"
--
-- Endre szabálya: a más vallású (nem-református) tagokat NEM
-- anyakönyvezzük. Az elkoltozott / temetes / kitert táblákba CSAK
-- református tagok kerülhetnek. (Áttért-be megy az olyan tag aki más
-- felekezetből áttér hozzánk — más a logika.)
--
-- Ez a SQL kimutatja, melyik elköltözött tagok nem-reformátusok.
-- NEM módosít semmit — csak felmér.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Az ELKÖLTÖZÖTT táblában szereplő nem-református tagok
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    e.id AS elkoltozott_id,
    sz.id AS szemely_id,
    sz.csaladnev,
    sz.k_nev,
    sz.vallas,
    sz.member_status,
    e.mikor,
    e.megjegyzes,
    e.hova_congregation_id,
    -- Van-e átjelentkezési notifikáció?
    EXISTS (SELECT 1 FROM public.member_transfer_notifications mtn
            WHERE mtn.elkoltozott_id = e.id) AS van_notifikacio
FROM public.elkoltozott e
JOIN public.szemely sz ON sz.id = e.id_szemely
WHERE TRIM(LOWER(COALESCE(sz.vallas, ''))) <> 'református'
  AND TRIM(LOWER(COALESCE(sz.vallas, ''))) <> ''
ORDER BY sz.vallas, sz.csaladnev, sz.k_nev;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Számlálás vallás szerint
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    'Vallás-megoszlás az elkoltozott táblában' AS info,
    COALESCE(NULLIF(TRIM(sz.vallas), ''), '(üres)') AS vallas,
    COUNT(*) AS db
FROM public.elkoltozott e
JOIN public.szemely sz ON sz.id = e.id_szemely
GROUP BY 2
ORDER BY db DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Plusz: a TEMETÉS és KITÉRT táblákban is van-e nem-református?
-- ════════════════════════════════════════════════════════════════════════════

SELECT 'temetes' AS tabla, COUNT(*) AS nem_ref_db
FROM public.temetes t
JOIN public.szemely sz ON sz.id = t.id_szemely
WHERE TRIM(LOWER(COALESCE(sz.vallas, ''))) <> 'református'
  AND TRIM(LOWER(COALESCE(sz.vallas, ''))) <> ''

UNION ALL

SELECT 'kitert', COUNT(*)
FROM public.kitert k
JOIN public.szemely sz ON sz.id = k.id_szemely
WHERE TRIM(LOWER(COALESCE(sz.vallas, ''))) <> 'református'
  AND TRIM(LOWER(COALESCE(sz.vallas, ''))) <> ''

UNION ALL

SELECT 'bekoltozott', COUNT(*)
FROM public.bekoltozott b
JOIN public.szemely sz ON sz.id = b.id_szemely
WHERE TRIM(LOWER(COALESCE(sz.vallas, ''))) <> 'református'
  AND TRIM(LOWER(COALESCE(sz.vallas, ''))) <> '';

-- ════════════════════════════════════════════════════════════════════════════
-- ÉRTELMEZÉS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Ha a 1. blokk eredménye 1+ sor: van problémás bejegyzés.
-- A következő SQL (cleanup) törli ezeket — DE előtte Endre dönti el,
-- hogy melyiket akarja töröli (mert lehetséges, hogy a vallás mezőt
-- kell javítani inkább, ha a tag valójában református csak rosszul lett
-- rögzítve).
