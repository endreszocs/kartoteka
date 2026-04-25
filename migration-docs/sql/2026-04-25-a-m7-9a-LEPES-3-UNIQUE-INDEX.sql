-- ════════════════════════════════════════════════════════════════════════════
--  A-M7.9a — LÉPÉS 3: defensive UNIQUE INDEX-ek (race-védelem szerver-szinten)
--  Dátum: 2026-04-25
--  Futtatás: Endre → Supabase SQL Editor (CSAK a LÉPÉS 1 + 2A/2B után, ha
--            a LÉPÉS 1 ÖSSZESÍTŐ-je 0-t ad)
--
--  CÉL:
--    Két PARTIAL UNIQUE INDEX a `befizetes` és `kiadas` táblákon, amelyek
--    biztosítják, hogy egy gyülekezeten belül ugyanarra az évre ugyanazt
--    a Készpénzes iratszámot NE lehessen kétszer rögzíteni — sem véletlen
--    duplikációval (lelkész duplán-mentés), sem cross-kliens race-szel
--    (két desktop egyszerre offline rögzít azonos walletszám-foglalás után).
--
--  ELŐFELTÉTEL:
--    A LÉPÉS 1 (DIAG) szerint a duplikátumok száma 0. Ha még van duplikátum,
--    az index létrehozása hibára fut (23505 unique constraint violation), és
--    az egész tranzakció rollback-el. Ilyenkor: futtasd újra a LÉPÉS 1-et,
--    és nézd meg, mi maradt.
--
--  HATÁS:
--    A `befizetes` és `kiadas` INSERT-ek mostantól 23505 hibát kapnak duplikált
--    iratszám esetén. A core `saveIncomeUseCase` és `saveExpenseUseCase` ezt
--    `duplicateReceipt: true` flag-gel jelzi a UI-nak — pasztorális üzenettel
--    kérdezi a usert, hogy frissítse az iratszámot.
--
--  EGYENESEN A LÉPÉS 3-RA?
--    Csak akkor, ha a LÉPÉS 1 már lefutott és 0-t adott (pl. a duplikációkat
--    kézzel rendezted, vagy soha nem volt duplikáció). Ha bizonytalan vagy,
--    futtasd ÚJRA a LÉPÉS 1-et először.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_befizetes_iratszam_year_congregation
  ON public.befizetes (congregation_id, fizetettev, iratszam)
  WHERE deleted = false
    AND irattipus ILIKE '%észpénz%'
    AND belso_mozgas_xkey IS NULL;

COMMENT ON INDEX public.uniq_befizetes_iratszam_year_congregation IS
  $$A-M7.9a: race-védelem a Készpénzes befizetés-iratszám duplikáció ellen.
    PARTIAL — csak nem-törölt, Készpénzes, nem-belső-mozgás sorokra. A 23505
    most már megbízhatóan jelez a save-flow-nak.$$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_kiadas_iratszam_year_congregation
  ON public.kiadas (congregation_id, (EXTRACT(YEAR FROM datum)::integer), iratszam)
  WHERE deleted = false
    AND irattipus ILIKE '%észpénz%'
    AND belso_mozgas_xkey IS NULL;

COMMENT ON INDEX public.uniq_kiadas_iratszam_year_congregation IS
  $$A-M7.9a: race-védelem a Készpénzes kiadás-iratszám duplikáció ellen.
    PARTIAL — csak nem-törölt, Készpénzes, nem-belső-mozgás sorokra.$$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- ELLENŐRZÉS — a 2 index létrejött
-- ════════════════════════════════════════════════════════════════════════════

SELECT '════ PARTIAL UNIQUE INDEX-ek létrejöttek ══════════════════════════' AS section;

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'uniq_befizetes_iratszam_year_congregation',
    'uniq_kiadas_iratszam_year_congregation'
  )
ORDER BY indexname;
-- Várt: 2 sor

-- ════════════════════════════════════════════════════════════════════════════
--  Az A-M7.9a teljes SQL-stack mostantól komplett:
--    1. iratszam_pointers tábla + 3 RPC + RLS (alap migráció)
--    2. (opcionális) duplikátum-rendezés (LÉPÉS 2A vagy 2B)
--    3. defensive PARTIAL UNIQUE INDEX-ek (ez a fájl)
--
--  A desktop write-offline rendszer ezzel teljesen védett a race-mentes
--  iratszám-foglaláson + szerver-szintű duplikáció-detekción át.
-- ════════════════════════════════════════════════════════════════════════════
