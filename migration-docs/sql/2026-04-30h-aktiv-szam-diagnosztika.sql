-- KARTOTEKA — Tagnyilvántartás aktív szám diagnosztika
-- Dátum: 2026-04-30h (nyolcadik a napon)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- HÁTTÉR (Endre): "Az aktív tag KPI többet számol, mint kellene."
--
-- Ez a SQL kimutatja a Te gyülekezeted tagjainak megoszlását a különböző
-- státusz-mezők szerint. Az alapján láthatod, mi okozza a többletet.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Total ÖSSZES tag (isvisible=true) — ez a getMembers visszahozza
-- ════════════════════════════════════════════════════════════════════════════

SELECT 'Összes látható tag (isvisible=true)' AS kategoria,
       COUNT(*) AS db
FROM public.szemely
WHERE isvisible = true
  AND congregation_id = (
    SELECT congregation_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Megoszlás a status-mezők szerint
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    'Status-megoszlás (isvisible=true tagok)' AS info,
    member_status,
    COUNT(*) FILTER (WHERE meghalt = true) AS meghalt_db,
    COUNT(*) FILTER (WHERE meghalt = false OR meghalt IS NULL) AS nem_meghalt_db,
    COUNT(*) AS osszes
FROM public.szemely
WHERE isvisible = true
  AND congregation_id = (
    SELECT congregation_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
  )
GROUP BY member_status
ORDER BY osszes DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Vallás-megoszlás (csak az aktívnak látszó tagokra)
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    'Vallás-megoszlás (member_status alapján aktív tagok)' AS info,
    COALESCE(NULLIF(TRIM(LOWER(vallas)), ''), '(üres → református)') AS vallas_norm,
    COUNT(*) AS db
FROM public.szemely
WHERE isvisible = true
  AND congregation_id = (
    SELECT congregation_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
  )
  AND meghalt = false
  AND (member_status IS NULL OR member_status NOT IN ('elkoltozott', 'kitért', 'törölt'))
GROUP BY 2
ORDER BY db DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. A KPI logika TÉNYLEGES számai (a frontend számításának reprodukciója)
-- ════════════════════════════════════════════════════════════════════════════

WITH alive AS (
    SELECT *
    FROM public.szemely
    WHERE isvisible = true
      AND congregation_id = (
        SELECT congregation_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
      )
      AND meghalt = false
      AND (member_status IS NULL OR member_status NOT IN ('elkoltozott', 'kitért', 'törölt'))
)
SELECT
    'Frontend KPI logika reprodukció' AS info,
    COUNT(*) AS osszes_alive,
    COUNT(*) FILTER (WHERE
        TRIM(LOWER(COALESCE(vallas, ''))) = ''
        OR TRIM(LOWER(vallas)) = 'református'
    ) AS reformatus_aktiv_kpi,
    COUNT(*) FILTER (WHERE
        TRIM(LOWER(COALESCE(vallas, ''))) <> ''
        AND TRIM(LOWER(vallas)) <> 'református'
    ) AS mas_vallasu_aktiv
FROM alive;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. A "rejtett" többlet — a mit gyaníthatunk, hogy NEM kellene aktívnak látszania
-- ════════════════════════════════════════════════════════════════════════════
--
-- Ezek olyan tagok, amelyek isvisible=true ÉS member_status='aktív' ÉS meghalt=false,
-- DE ESETLEG van valami másnak okuk, hogy ne legyenek aktívak:

-- 5a. Olyan tagok, akik már szerepelnek a temetes vagy elkoltozott táblákban,
--     DE a szemely státuszuk még 'aktív'-on
SELECT 'Temetésen szereplő, de szemely.meghalt=false' AS problem,
       COUNT(*) AS db
FROM public.szemely sz
WHERE sz.isvisible = true
  AND sz.meghalt = false
  AND congregation_id = (
    SELECT congregation_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
  )
  AND EXISTS (SELECT 1 FROM public.temetes t WHERE t.id_szemely = sz.id)

UNION ALL

SELECT 'Elköltözötten szereplő, de szemely.member_status NEM elkoltozott',
       COUNT(*)
FROM public.szemely sz
WHERE sz.isvisible = true
  AND congregation_id = (
    SELECT congregation_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
  )
  AND COALESCE(sz.member_status, 'aktív') NOT IN ('elkoltozott')
  AND EXISTS (SELECT 1 FROM public.elkoltozott e WHERE e.id_szemely = sz.id)

UNION ALL

SELECT 'Kitérten szereplő, de szemely.member_status NEM kitért',
       COUNT(*)
FROM public.szemely sz
WHERE sz.isvisible = true
  AND congregation_id = (
    SELECT congregation_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
  )
  AND COALESCE(sz.member_status, 'aktív') NOT IN ('kitért')
  AND EXISTS (SELECT 1 FROM public.kitert k WHERE k.id_szemely = sz.id);

-- ════════════════════════════════════════════════════════════════════════════
-- ÉRTELMEZÉS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Ha az 5. blokkban van pozitív szám:
--   → A szemely tábla státuszai NEM lettek frissítve a régi import során
--   → Pl. ha valakit eltemettek, de a szemely.meghalt nem lett true → Aktív KPI-ben
--   → Megoldás: backfill SQL-t írni
--
-- Ha az 5. blokkban 0:
--   → A számok pontosak, a többlet máshonnan jön
--   → Pl. a tényleges aktív szám > a Te papír-számításodnál
--     (lehet, hogy korábban nem regisztrált tagok is ott vannak)
