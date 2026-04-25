-- ════════════════════════════════════════════════════════════════════════════
--  A-M7.9a — LÉPÉS 2B: AUTO-SOFT-DELETE (a fiatalabb duplikátumok deleted=true)
--  Dátum: 2026-04-25
--  Futtatás: Endre → Supabase SQL Editor (CSAK A LÉPÉS 1 UTÁN, döntés alapján)
--
--  CÉL:
--    A duplikált Készpénzes iratszámok közül a legrégibb sor (legkisebb id)
--    megmarad élőként. A fiatalabb sorok `deleted = true`-ra állnak, és
--    egy magyarázó megjegyzés kerül beléjük („AUTO-TÖRÖLVE 2026-04-25 …").
--
--  ADATBIZTONSÁG:
--    A sorok NEM tűnnek el a DB-ből, csak a `deleted` flag igaz lesz. A
--    `kuka` (recycle bin) modulban visszaállíthatók, ha mégis kellenek.
--    A pénzügyi áttekintés és a befizetés-lista alapból kiszűri őket.
--
--  MIKOR HASZNÁLD:
--    A duplikációk hibás rögzítések — ugyanaz a tétel kétszer szerepel a
--    DB-ben (lelkész duplán kattintott a Mentés-re, vagy szinkron-konfliktus
--    okozott duplán-küldést). Ilyenkor a fiatalabb fölösleges, törlendő.
--
--  MIKOR NE HASZNÁLD (helyette LÉPÉS 2A):
--    A duplikációk valós különálló tételek (különböző tag, különböző dátum,
--    csak elgépelt iratszám). Ilyenkor inkább újraszámozás kell, hogy mindkét
--    adat megőrződjön.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- BEFIZETÉS — soft-delete a fiatalabb duplikátumokra
-- ──────────────────────────────────────────────────────────────────────────

WITH dup_keys AS (
  SELECT congregation_id, fizetettev, iratszam
    FROM public.befizetes
   WHERE deleted = false
     AND irattipus ILIKE '%észpénz%'
     AND belso_mozgas_xkey IS NULL
   GROUP BY congregation_id, fizetettev, iratszam
  HAVING COUNT(*) > 1
),
ranked AS (
  SELECT b.id,
         b.megjegyzes,
         (SELECT MIN(id)
            FROM public.befizetes b2
           WHERE b2.congregation_id = b.congregation_id
             AND b2.fizetettev      = b.fizetettev
             AND b2.iratszam        = b.iratszam
             AND b2.deleted = false
             AND b2.irattipus ILIKE '%észpénz%'
             AND b2.belso_mozgas_xkey IS NULL
         ) AS keep_id,
         ROW_NUMBER() OVER (
           PARTITION BY b.congregation_id, b.fizetettev, b.iratszam
           ORDER BY b.id ASC
         ) AS rn
    FROM public.befizetes b
    JOIN dup_keys d
      ON d.congregation_id = b.congregation_id
     AND d.fizetettev      = b.fizetettev
     AND d.iratszam        = b.iratszam
   WHERE b.deleted = false
     AND b.irattipus ILIKE '%észpénz%'
     AND b.belso_mozgas_xkey IS NULL
)
UPDATE public.befizetes b
   SET deleted    = true,
       updated_at = now(),
       megjegyzes = COALESCE(b.megjegyzes, '') ||
                    ' [AUTO-TÖRÖLVE 2026-04-25 A-M7.9a: iratszám-duplikátum, ' ||
                    'megmarad #' || r.keep_id || ']'
  FROM ranked r
 WHERE b.id = r.id
   AND r.rn > 1;

-- ──────────────────────────────────────────────────────────────────────────
-- KIADÁS — soft-delete a fiatalabb duplikátumokra
-- ──────────────────────────────────────────────────────────────────────────

WITH dup_keys AS (
  SELECT congregation_id, EXTRACT(YEAR FROM datum)::integer AS ev, iratszam
    FROM public.kiadas
   WHERE deleted = false
     AND irattipus ILIKE '%észpénz%'
     AND belso_mozgas_xkey IS NULL
   GROUP BY congregation_id, EXTRACT(YEAR FROM datum), iratszam
  HAVING COUNT(*) > 1
),
ranked AS (
  SELECT k.id,
         k.megjegyzes,
         (SELECT MIN(id)
            FROM public.kiadas k2
           WHERE k2.congregation_id = k.congregation_id
             AND EXTRACT(YEAR FROM k2.datum) = EXTRACT(YEAR FROM k.datum)
             AND k2.iratszam        = k.iratszam
             AND k2.deleted = false
             AND k2.irattipus ILIKE '%észpénz%'
             AND k2.belso_mozgas_xkey IS NULL
         ) AS keep_id,
         ROW_NUMBER() OVER (
           PARTITION BY k.congregation_id, EXTRACT(YEAR FROM k.datum), k.iratszam
           ORDER BY k.id ASC
         ) AS rn
    FROM public.kiadas k
    JOIN dup_keys d
      ON d.congregation_id           = k.congregation_id
     AND d.ev                        = EXTRACT(YEAR FROM k.datum)::integer
     AND d.iratszam                  = k.iratszam
   WHERE k.deleted = false
     AND k.irattipus ILIKE '%észpénz%'
     AND k.belso_mozgas_xkey IS NULL
)
UPDATE public.kiadas k
   SET deleted    = true,
       updated_at = now(),
       megjegyzes = COALESCE(k.megjegyzes, '') ||
                    ' [AUTO-TÖRÖLVE 2026-04-25 A-M7.9a: iratszám-duplikátum, ' ||
                    'megmarad #' || r.keep_id || ']'
  FROM ranked r
 WHERE k.id = r.id
   AND r.rn > 1;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
--  ELLENŐRZŐ SELECT — a maradék duplikátumok száma
-- ════════════════════════════════════════════════════════════════════════════

SELECT '════ Maradék duplikátumok (várt: mindkét sor 0) ═══════════════════' AS section;

SELECT 'befizetes maradék duplikátumok' AS check_label, COUNT(*) AS db
  FROM (
    SELECT congregation_id, fizetettev, iratszam
      FROM public.befizetes
     WHERE deleted = false
       AND irattipus ILIKE '%észpénz%'
       AND belso_mozgas_xkey IS NULL
     GROUP BY congregation_id, fizetettev, iratszam
    HAVING COUNT(*) > 1
  ) AS d
UNION ALL
SELECT 'kiadas maradék duplikátumok' AS check_label, COUNT(*) AS db
  FROM (
    SELECT congregation_id, EXTRACT(YEAR FROM datum), iratszam
      FROM public.kiadas
     WHERE deleted = false
       AND irattipus ILIKE '%észpénz%'
       AND belso_mozgas_xkey IS NULL
     GROUP BY congregation_id, EXTRACT(YEAR FROM datum), iratszam
    HAVING COUNT(*) > 1
  ) AS d;
-- Ha mindkét sor `db = 0` → futtathatod a LÉPÉS 3-at (UNIQUE INDEX).

SELECT '════ Áttörölt sorok ezen a futtatáson ═════════════════════════════' AS section;

-- Mit törölt ez a futás (a megjegyzés-jelzőből kiolvasható)
SELECT
  'befizetes' AS tabla,
  COUNT(*)     AS soft_deleted_db
FROM public.befizetes
WHERE deleted = true
  AND megjegyzes LIKE '%[AUTO-TÖRÖLVE 2026-04-25 A-M7.9a%'
UNION ALL
SELECT
  'kiadas' AS tabla,
  COUNT(*)  AS soft_deleted_db
FROM public.kiadas
WHERE deleted = true
  AND megjegyzes LIKE '%[AUTO-TÖRÖLVE 2026-04-25 A-M7.9a%';
