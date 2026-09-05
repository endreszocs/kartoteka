-- ═══════════════════════════════════════════════════════════════════════════
--  LAPPANG-E VALÓDI SZEMÉLYI SZÁM MÁS OSZLOPOKBAN?
--  2026-09-05 — Futtatja: Endre (Supabase SQL editor)
--
--  MIÉRT: az előző mérés bebizonyította, hogy a `szemely.cnp` oszlopban NULLA
--  valódi (13 jegyű) CNP van — mind a 661 érték rendszer által generált
--  (613 db `EC-2026-…` + 48 db `EC-TSZT-…`, a teszt-gyülekezet seedje).
--
--  DE EZ CSAK ARRA AZ EGY OSZLOPRA IGAZ. Három hely soha nem volt megmérve:
--
--    · `szig`  — személyi igazolvány száma. Létező oszlop, amit MA egyetlen
--                felület sem olvas és nem ír; a legacy tömeges import viszont
--                pontosan ezt kínálta importálható mezőként.
--    · `taj`   — ugyanaz a helyzet.
--    · `megjegyzes` — szabad szöveg. Ide bármit be lehetett írni.
--
--  Ha bármelyikben valódi azonosító lapul, az MA védtelen: nincs maszkolva,
--  nincs naplózva, és a `megjegyzes` benne van a mentésekben és az exportban.
--
--  ⚠️ EZ NEM ADJA KI AZ ÉRTÉKEKET. Csak MEGSZÁMOLJA a gyanús sorokat, és a
--     `megjegyzes`-nél is kizárólag azt nézi, van-e benne 13 összefüggő
--     számjegy. Semmilyen szöveg nem jön vissza.
--
--  ⚠️ CSAK OLVAS.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT '1 · szig — kitöltött sorok' AS kulcs,
       count(*) FILTER (WHERE COALESCE(btrim(szig), '') <> '')::text AS ertek
FROM public.szemely

UNION ALL
SELECT '2 · szig — 13 számjegyet tartalmaz (VALÓDI CNP gyanú)',
       count(*) FILTER (
         WHERE regexp_replace(COALESCE(szig, ''), '[^0-9]', '', 'g') ~ '^[0-9]{13}$'
       )::text
FROM public.szemely

UNION ALL
SELECT '3 · taj — kitöltött sorok',
       count(*) FILTER (WHERE COALESCE(btrim(taj), '') <> '')::text
FROM public.szemely

UNION ALL
SELECT '4 · taj — 13 számjegyet tartalmaz (VALÓDI CNP gyanú)',
       count(*) FILTER (
         WHERE regexp_replace(COALESCE(taj, ''), '[^0-9]', '', 'g') ~ '^[0-9]{13}$'
       )::text
FROM public.szemely

UNION ALL
SELECT '5 · megjegyzes — 13 összefüggő számjegy van benne',
       count(*) FILTER (WHERE COALESCE(megjegyzes, '') ~ '[0-9]{13}')::text
FROM public.szemely

UNION ALL
-- A `szemely_kapcsolat` és az anyakönyvi táblák szabad szöveges mezői is
-- kaphattak azonosítót — ezt is csak megszámoljuk.
SELECT '6 · anyakönyvi megjegyzések 13 számjeggyel (8 tábla)',
       (
         SELECT COALESCE(sum(db), 0)::text FROM (
           SELECT count(*) AS db FROM public.keresztseg   WHERE COALESCE(megjegyzes,'') ~ '[0-9]{13}'
           UNION ALL SELECT count(*) FROM public.konfirmalas WHERE COALESCE(megjegyzes,'') ~ '[0-9]{13}'
           UNION ALL SELECT count(*) FROM public.hazassag    WHERE COALESCE(megjegyzes,'') ~ '[0-9]{13}'
           UNION ALL SELECT count(*) FROM public.temetes     WHERE COALESCE(megjegyzes,'') ~ '[0-9]{13}'
           UNION ALL SELECT count(*) FROM public.bekoltozott WHERE COALESCE(megjegyzes,'') ~ '[0-9]{13}'
           UNION ALL SELECT count(*) FROM public.elkoltozott WHERE COALESCE(megjegyzes,'') ~ '[0-9]{13}'
           UNION ALL SELECT count(*) FROM public.attert      WHERE COALESCE(megjegyzes,'') ~ '[0-9]{13}'
           UNION ALL SELECT count(*) FROM public.kitert      WHERE COALESCE(megjegyzes,'') ~ '[0-9]{13}'
         ) x
       )

UNION ALL
-- Kontroll: mostantól hány hivatalos szám van rögzítve az ÚJ helyen.
SELECT '7 · a hivatalos szemelyi_szam táblában rögzített sorok',
       COALESCE((SELECT count(*)::text FROM public.szemely_szemelyi_szam), 'a tábla még nem létezik')

UNION ALL
-- Kontroll: az audit-napló mostantól ír-e (a 2026-09-05-i javítás után).
SELECT '8 · tagnyilvántartási audit-sorok az elmúlt 7 napban',
       COALESCE((SELECT count(*)::text FROM public.audit_log
                 WHERE target_table = 'szemely'
                   AND created_at > now() - interval '7 days'), '—')

ORDER BY 1;
