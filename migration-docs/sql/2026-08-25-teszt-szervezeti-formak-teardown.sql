-- ============================================================================
-- 2026-08-25 — TESZT SZERVEZETI FORMÁK TELJES VISSZAVONÁSA
-- ============================================================================
-- A 2026-08-25-teszt-szervezeti-formak-seed.sql MINDEN nyomát eltávolítja:
--   • a 3 új teszt-gyülekezet (leány …0004, missziói …0005, társ …0006)
--     tagjai, naplósorai, egységei és maga a gyülekezet-sor,
--   • a Teszt gyülekezet (…0003) 2 demo-egysége, a tag-besorolások és a
--     TESZT-EGYSEG-DEMO jelölésű naplósorok.
-- A Teszt gyülekezet (…0003) EGYÉB adatait NEM bántja (az a 2026-08-09-es
-- seed hatásköre — annak saját wipe-fájlja van).
-- Idempotens: többször futtatható; a végén ellenőrző SELECT.
-- ============================================================================

BEGIN;

-- 1) Demo-naplósorok (mind a 4 gyülekezetből — a jelölés azonosítja őket)
DELETE FROM public.munkanaplo
 WHERE megjegyzes = 'TESZT-EGYSEG-DEMO'
   AND congregation_id IN
     ('7e570000-0000-4000-8000-000000000003',
      '7e570000-0000-4000-8000-000000000004',
      '7e570000-0000-4000-8000-000000000005',
      '7e570000-0000-4000-8000-000000000006');

-- 2) A Teszt gyülekezet tag-besorolásainak visszavonása (a tagok maradnak)
UPDATE public.szemely SET egyseg_id = NULL
 WHERE congregation_id = '7e570000-0000-4000-8000-000000000003'
   AND egyseg_id IS NOT NULL;

-- 3) Az új teszt-gyülekezetek fiktív tagjai
DELETE FROM public.szemely
 WHERE congregation_id IN
     ('7e570000-0000-4000-8000-000000000004',
      '7e570000-0000-4000-8000-000000000005',
      '7e570000-0000-4000-8000-000000000006')
   AND cnp LIKE 'EC-TSZT2-%';

-- 4) Egységek (mind a 4 gyülekezet demo-egységei)
DELETE FROM public.gyulekezeti_egysegek
 WHERE congregation_id IN
     ('7e570000-0000-4000-8000-000000000003',
      '7e570000-0000-4000-8000-000000000004',
      '7e570000-0000-4000-8000-000000000005',
      '7e570000-0000-4000-8000-000000000006');

-- 5) Kereszt-gyülekezeti értesítés-maradványok
DELETE FROM public.cross_congregation_match_notifications
 WHERE triggering_congregation_id IN
     ('7e570000-0000-4000-8000-000000000004',
      '7e570000-0000-4000-8000-000000000005',
      '7e570000-0000-4000-8000-000000000006');

-- 6) A 3 új teszt-gyülekezet sora (a leányt előbb — az anya-FK RESTRICT miatt
--    mindegy is, de a 0003-at nem töröljük, csak a gyerekeit)
DELETE FROM public.congregations
 WHERE id IN
     ('7e570000-0000-4000-8000-000000000004',
      '7e570000-0000-4000-8000-000000000005',
      '7e570000-0000-4000-8000-000000000006');

COMMIT;

-- ELLENŐRZÉS — minden sor 0 kell legyen
SELECT 'maradék teszt-gyülekezet (0004-0006)' AS mit_mer,
       count(*)::text AS darab
  FROM public.congregations
 WHERE id IN ('7e570000-0000-4000-8000-000000000004',
              '7e570000-0000-4000-8000-000000000005',
              '7e570000-0000-4000-8000-000000000006')
UNION ALL
SELECT 'maradék demo-egység', count(*)::text
  FROM public.gyulekezeti_egysegek
 WHERE congregation_id IN ('7e570000-0000-4000-8000-000000000003',
                           '7e570000-0000-4000-8000-000000000004',
                           '7e570000-0000-4000-8000-000000000005',
                           '7e570000-0000-4000-8000-000000000006')
UNION ALL
SELECT 'maradék demo-naplósor', count(*)::text
  FROM public.munkanaplo
 WHERE megjegyzes = 'TESZT-EGYSEG-DEMO'
UNION ALL
SELECT 'maradék EC-TSZT2 tag', count(*)::text
  FROM public.szemely WHERE cnp LIKE 'EC-TSZT2-%'
UNION ALL
SELECT 'besorolt tag a Teszt gyülekezetben', count(*)::text
  FROM public.szemely
 WHERE congregation_id = '7e570000-0000-4000-8000-000000000003'
   AND egyseg_id IS NOT NULL;
