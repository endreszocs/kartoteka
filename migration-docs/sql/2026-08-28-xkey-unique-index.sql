-- ============================================================================
-- 2026-08-28 · P0-10: xkey UNIQUE indexek (befizetes + kiadas)
-- ============================================================================
-- MIÉRT: a desktop offline push-retry elveszett HTTP-válasznál MÁSODSZOR is
-- beszúrta ugyanazt a tételt — a nem 'Készpénz' irattípusú sorokon semmilyen
-- DB-index nem védett. A kód-oldali xkey-idempotencia-kapu (2026-08-28) az
-- első réteg; ez az index a VÉDELMI MÉLYSÉG: ha bármely jövőbeli út mégis
-- kétszer insertálna azonos xkey-jel, 23505-tel bukik, nem néma duplikátummal.
--
-- ELŐFELTÉTEL (élesben mérve 2026-08-28-án): xkey-duplikátum 0 | 0 —
-- az index veszély nélkül felvehető. A lenti DO-blokk ennek ellenére
-- FAIL-CLOSED: ha időközben mégis keletkezett duplikátum, az indexet
-- KIHAGYJA (nem törik el a futás), és a záró rács jelzi.
--
-- Futtatás: Supabase SQL editor, egyben. Egyetlen eredmény-rács (UNION ALL).
-- ============================================================================

DO $$
DECLARE
  v_bef_dup integer;
  v_kia_dup integer;
BEGIN
  SELECT count(*) INTO v_bef_dup FROM (
    SELECT xkey FROM public.befizetes GROUP BY xkey HAVING count(*) > 1
  ) t;
  SELECT count(*) INTO v_kia_dup FROM (
    SELECT xkey FROM public.kiadas GROUP BY xkey HAVING count(*) > 1
  ) t;

  IF v_bef_dup = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_befizetes_xkey
      ON public.befizetes (xkey);
  END IF;

  IF v_kia_dup = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_kiadas_xkey
      ON public.kiadas (xkey);
  END IF;
END
$$;

-- ── ZÁRÓ ELLENŐRZŐ RÁCS (a Supabase editor csak az utolsót mutatja) ─────────
SELECT * FROM (
  SELECT
    1 AS sorszam,
    'uniq_befizetes_xkey index él' AS kerdes,
    (SELECT CASE WHEN EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'uniq_befizetes_xkey'
     ) THEN 'IGEN' ELSE 'NEM — duplikátum miatt kihagyva, jelezd!' END) AS eredmeny
  UNION ALL
  SELECT
    2,
    'uniq_kiadas_xkey index él',
    (SELECT CASE WHEN EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'uniq_kiadas_xkey'
     ) THEN 'IGEN' ELSE 'NEM — duplikátum miatt kihagyva, jelezd!' END)
  UNION ALL
  SELECT
    3,
    'xkey-duplikátum most (befizetes | kiadas)',
    (SELECT count(*)::text FROM (
       SELECT xkey FROM public.befizetes GROUP BY xkey HAVING count(*) > 1
     ) t)
    || ' | ' ||
    (SELECT count(*)::text FROM (
       SELECT xkey FROM public.kiadas GROUP BY xkey HAVING count(*) > 1
     ) t2)
) x
ORDER BY sorszam;
