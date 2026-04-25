-- ════════════════════════════════════════════════════════════════════════════
--  A-M7.9a — LÉPÉS 2A: AUTO-ÚJRASZÁMOZÁS (a fiatalabb duplikátumok új iratszám)
--  Dátum: 2026-04-25
--  Futtatás: Endre → Supabase SQL Editor (CSAK A LÉPÉS 1 UTÁN, döntés alapján)
--
--  CÉL:
--    A duplikált Készpénzes iratszámok (befizetés + kiadás) közül a legrégibb
--    sor (legkisebb id) megmarad az eredeti iratszámmal. A fiatalabb sorok
--    kapnak egy új, eddig nem használt iratszámot a (gyülekezet × év)-en
--    belüli MAX + 1, +2, … alapján.
--
--  ADATBIZTONSÁG:
--    Egyetlen sor sem tűnik el. Az `osszeg`, `datum`, `id_szemely`, `kategoria`,
--    `megjegyzes` változatlan marad — csak az `iratszam` és `nyugta` kerül új
--    számra. Az `updated_at` frissítve a változás követhetőségéhez.
--
--    A `iratszam_pointers` tábla `next_szam` mezője is automatikusan frissül,
--    hogy a következő foglalás (új vagy meglévő) az új MAX + 1-ről induljon.
--
--  MIKOR HASZNÁLD:
--    A duplikációk valós különálló tételek, csak elgépelt iratszám miatt
--    ütköznek. Pl. két különböző tag, két különböző dátum, csak az iratszám
--    883 mindkettőn. Ilyenkor egy új iratszám-allokálás megőrzi mindkét adatot.
--
--  MIKOR NE HASZNÁLD (helyette LÉPÉS 2B):
--    A duplikációk valójában ugyanazt a tételt rögzítik kétszer (lelkész
--    duplán kattintott a Mentés-re). Ilyenkor inkább soft-delete kell.
--
--  ELLENŐRZÉS A FÁJL VÉGÉN:
--    A SELECT a tranzakció után lefut és megmutatja a maradék duplikátumokat
--    (várt: 0). Ha 0, futhat a LÉPÉS 3 (UNIQUE INDEX).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- BEFIZETÉS — auto-újraszámozás
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
         b.congregation_id,
         b.fizetettev,
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
),
max_szam AS (
  SELECT congregation_id, fizetettev,
         COALESCE(MAX(NULLIF(SUBSTRING(iratszam FROM '[0-9]+'), '')::int), 0) AS max_n
    FROM public.befizetes
   WHERE deleted = false
     AND irattipus ILIKE '%észpénz%'
     AND belso_mozgas_xkey IS NULL
   GROUP BY congregation_id, fizetettev
),
new_numbers AS (
  SELECT r.id,
         (m.max_n + ROW_NUMBER() OVER (
           PARTITION BY r.congregation_id, r.fizetettev
           ORDER BY r.id
         )) AS new_szam
    FROM ranked r
    JOIN max_szam m
      ON m.congregation_id = r.congregation_id
     AND m.fizetettev      = r.fizetettev
   WHERE r.rn > 1   -- a legrégibb (rn=1) megmarad, az újabbakat számozzuk
)
UPDATE public.befizetes b
   SET iratszam   = nn.new_szam::text,
       nyugta     = nn.new_szam::text,
       updated_at = now()
  FROM new_numbers nn
 WHERE b.id = nn.id;

-- ──────────────────────────────────────────────────────────────────────────
-- KIADÁS — auto-újraszámozás
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
         k.congregation_id,
         EXTRACT(YEAR FROM k.datum)::integer AS ev,
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
),
max_szam AS (
  SELECT congregation_id, EXTRACT(YEAR FROM datum)::integer AS ev,
         COALESCE(MAX(NULLIF(SUBSTRING(iratszam FROM '[0-9]+'), '')::int), 0) AS max_n
    FROM public.kiadas
   WHERE deleted = false
     AND irattipus ILIKE '%észpénz%'
     AND belso_mozgas_xkey IS NULL
   GROUP BY congregation_id, EXTRACT(YEAR FROM datum)
),
new_numbers AS (
  SELECT r.id,
         (m.max_n + ROW_NUMBER() OVER (
           PARTITION BY r.congregation_id, r.ev
           ORDER BY r.id
         )) AS new_szam
    FROM ranked r
    JOIN max_szam m
      ON m.congregation_id = r.congregation_id
     AND m.ev              = r.ev
   WHERE r.rn > 1
)
UPDATE public.kiadas k
   SET iratszam   = nn.new_szam::text,
       nyugta     = nn.new_szam::text,
       updated_at = now()
  FROM new_numbers nn
 WHERE k.id = nn.id;

-- ──────────────────────────────────────────────────────────────────────────
-- iratszam_pointers frissítés — a következő foglalás az új MAX + 1-ről induljon
-- ──────────────────────────────────────────────────────────────────────────

-- Befizetés pointer
UPDATE public.iratszam_pointers ip
   SET next_szam  = sub.max_n + 1,
       updated_at = now()
  FROM (
    SELECT congregation_id,
           fizetettev AS ev,
           COALESCE(MAX(NULLIF(SUBSTRING(iratszam FROM '[0-9]+'), '')::int), 0) AS max_n
      FROM public.befizetes
     WHERE deleted = false
       AND irattipus ILIKE '%észpénz%'
       AND belso_mozgas_xkey IS NULL
     GROUP BY congregation_id, fizetettev
  ) AS sub
 WHERE ip.congregation_id = sub.congregation_id
   AND ip.iratszam_tipus  = 'befizetes'
   AND ip.ev              = sub.ev
   AND ip.next_szam       <= sub.max_n;   -- csak ha a pointer alacsonyabb az új MAX-nál

-- Kiadás pointer
UPDATE public.iratszam_pointers ip
   SET next_szam  = sub.max_n + 1,
       updated_at = now()
  FROM (
    SELECT congregation_id,
           EXTRACT(YEAR FROM datum)::integer AS ev,
           COALESCE(MAX(NULLIF(SUBSTRING(iratszam FROM '[0-9]+'), '')::int), 0) AS max_n
      FROM public.kiadas
     WHERE deleted = false
       AND irattipus ILIKE '%észpénz%'
       AND belso_mozgas_xkey IS NULL
     GROUP BY congregation_id, EXTRACT(YEAR FROM datum)
  ) AS sub
 WHERE ip.congregation_id = sub.congregation_id
   AND ip.iratszam_tipus  = 'kiadas'
   AND ip.ev              = sub.ev
   AND ip.next_szam       <= sub.max_n;

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
-- Ha még van duplikátum (pl. túl furcsa eset), térj vissza LÉPÉS 1-re.
