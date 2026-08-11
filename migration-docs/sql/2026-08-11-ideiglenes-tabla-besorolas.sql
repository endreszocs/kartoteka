-- ═══════════════════════════════════════════════════════════════════════════
--  AZ UTOLSÓ BESOROLATLAN TÁBLA — a mentés ettől indul el (2026-08-11)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  MI EZ
--  ─────
--  A `2026-08-11-mentes-tabla-besorolas.sql` lefutott, és a 17 táblából 17-et
--  besorolt. EGYETLEN élő tábla maradt besorolatlan:
--
--        public.bealitas_zaro_adatok_mentes_20260811
--
--  Amíg akár EGY besorolatlan élő tábla van, a mentés `assertInventoryClassified()`
--  fail-closed kapuja hangos hibával leállítja a futást, MIELŐTT egyetlen
--  gyülekezethez hozzáérne. Pontosan ezt láttuk: „784-ből 0 igazolt, 0 hibás,
--  0 befejezetlen" — vagyis a ciklus el sem indult.
--
--  A kapu HELYES. Egy mentés, amely némán kihagy egy táblát, rosszabb a
--  semminél: az ember azt hiszi, van másolata, és nincs.
--
--  HONNAN JÖTT EZ A TÁBLA
--  ──────────────────────
--  A `2026-08-11-zaro-pillanatkep-egyesites.sql:241` hozta létre MA REGGEL,
--  a záró-pillanatkép átalakításának visszavonhatóságához (a régi értékek
--  megőrzése). Ideiglenes biztonsági háló, nem alkalmazás-adat.
--
--  MIÉRT `kizart_egyeb` ÉS NEM MENTJÜK
--  ───────────────────────────────────
--  1. Nem gyülekezeti adat: egyetlen gyülekezet kartonjára sem tartozik, és a
--     `congregation_id` oszlopa sincs meg — gyülekezeti mentésbe nem is fér.
--  2. Egy visszaállítás SOHA nem írhatja felül: ez maga a visszavonás forrása.
--     Ha egy visszaállítás átírná, a saját mentőövünket vágnánk el.
--  3. Ideiglenes: amint a záró-pillanatkép átalakítása véglegesnek tekinthető,
--     ez a tábla eldobható — és akkor ez a policy-sor is mehet vele.
--
--  ⚠️  A TANULSÁG, AMIT ÉRDEMES MEGJEGYEZNI
--  ─────────────────────────────────────────
--  MINDEN ezután létrehozott ideiglenes/visszavonó tábla ugyanígy meg fogja
--  állítani a következő éjszakai mentést. A szabály innentől:
--
--        AKI ÚJ TÁBLÁT HOZ LÉTRE, UGYANABBAN A TRANZAKCIÓBAN BESOROLJA.
--
--  Nem azért, mert szép, hanem mert különben a mentés áll le — és arról
--  reggelig senki nem tud.
--
--  BIZTONSÁG
--  ─────────
--  Ez a fájl NEM ír alkalmazás-adatot. Egyetlen sort szúr be egy besorolási
--  táblába. A COMMIT előtti őrszem visszapergeti az egészet, ha utána MÉGIS
--  maradna besorolatlan élő tábla — vagyis vagy teljesen megoldja a problémát,
--  vagy semmit nem változtat.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
--  SZAKASZ 0 — ÁLLAPOTFELMÉRÉS (fail-closed: hiányzó előfeltételnél megállunk)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_policy_van boolean;
  v_rpc_van    boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'backup_table_policy'
  ) INTO v_policy_van;

  IF NOT v_policy_van THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: nincs backup_table_policy tábla. Előbb a 2026-08-11-biztonsagi-mentes.sql fájl kell.';
  END IF;

  SELECT to_regprocedure('public.backup_live_tables()') IS NOT NULL INTO v_rpc_van;
  IF NOT v_rpc_van THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: nincs backup_live_tables() függvény. Előbb a 2026-08-11-biztonsagi-mentes.sql fájl kell.';
  END IF;

  RAISE NOTICE 'SZAKASZ 0 rendben. Besorolatlan élő tábla MOST: %',
    (SELECT count(*) FROM public.backup_live_tables() WHERE hatokor IS NULL);
END $$;


BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
--  1) A BESOROLÁS
-- ─────────────────────────────────────────────────────────────────────────────
-- `reteg` SZÁNDÉKOSAN NULL: ez a tábla nem része a visszatöltési sorrendnek.
-- `visszaallithato = false`: a visszaállítás soha nem írhatja felül (lásd fent).
-- Idempotens: második futásnál a megjegyzés frissül, más nem.
INSERT INTO public.backup_table_policy
  (tabla, hatokor, join_predikatum, reteg, visszaallithato, megjegyzes)
VALUES
  ('bealitas_zaro_adatok_mentes_20260811', 'kizart_egyeb', NULL, NULL, false,
   '2026-08-11: a záró-pillanatkép átalakításának IDEIGLENES visszavonó táblája '
   || '(a 2026-08-11-zaro-pillanatkep-egyesites.sql hozta létre). Nem gyülekezeti adat, '
   || 'nincs congregation_id oszlopa, és egy visszaállítás sem írhatja felül — ez maga a '
   || 'visszavonás forrása. Ha a záró-pillanatkép véglegesnek tekinthető, a tábla és ez a '
   || 'sor EGYÜTT eldobható.')
ON CONFLICT (tabla) DO UPDATE
  SET hatokor         = EXCLUDED.hatokor,
      join_predikatum = EXCLUDED.join_predikatum,
      reteg           = EXCLUDED.reteg,
      visszaallithato = EXCLUDED.visszaallithato,
      megjegyzes      = EXCLUDED.megjegyzes;


-- ─────────────────────────────────────────────────────────────────────────────
--  2) ZÁRÓ ŐRSZEM — a COMMIT ELŐTT
-- ─────────────────────────────────────────────────────────────────────────────
-- Nem azt méri, hogy az INSERT sikerült-e (az triviális), hanem azt, amiért az
-- egészet csináljuk: EL TUD-E INDULNI A MENTÉS. Ha bármi más besorolatlan
-- maradt, ez visszapergeti az egészet, és NÉVVEL megmondja, mi az.
DO $$
DECLARE
  v_maradt integer;
  v_nevek  text;
BEGIN
  SELECT count(*), COALESCE(string_agg(tabla, ', ' ORDER BY tabla), '—')
    INTO v_maradt, v_nevek
    FROM public.backup_live_tables()
   WHERE hatokor IS NULL;

  IF v_maradt > 0 THEN
    RAISE EXCEPTION
      'VISSZAPERGETVE: még % besorolatlan élő tábla maradt (%). A mentés így sem indulna el. '
      'Vedd fel őket is a backup_table_policy-be, majd futtasd újra.',
      v_maradt, v_nevek;
  END IF;

  RAISE NOTICE 'Záró őrszem rendben: 0 besorolatlan élő tábla. A mentés elindulhat.';
END $$;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
--  VISSZAVONÁS (ha valamiért mégsem kell) — ⚠️ ettől a mentés ÚJRA leáll
-- ═══════════════════════════════════════════════════════════════════════════
-- BEGIN;
--   DELETE FROM public.backup_table_policy
--    WHERE tabla = 'bealitas_zaro_adatok_mentes_20260811';
-- COMMIT;
--
-- Vagy — ha a záró-pillanatkép már véglegesnek tekinthető — a tábla és a sor
-- EGYÜTT dobható el, és akkor a mentés is fut tovább:
-- BEGIN;
--   DROP TABLE IF EXISTS public.bealitas_zaro_adatok_mentes_20260811;
--   DELETE FROM public.backup_table_policy
--    WHERE tabla = 'bealitas_zaro_adatok_mentes_20260811';
-- COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS — EGYETLEN SELECT (a Supabase csak az utolsó eredményt mutatja)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT sorrend, mit_mer, ertek, vart,
       CASE WHEN ertek = vart THEN '✅' ELSE '❌' END AS rendben
FROM (
  SELECT 1 AS sorrend,
         'BESOROLATLAN ELO TABLA (ez allitotta meg a mentest)' AS mit_mer,
         (SELECT count(*)::text FROM public.backup_live_tables() WHERE hatokor IS NULL) AS ertek,
         '0' AS vart

  UNION ALL SELECT 2, 'Az ideiglenes tabla besorolasa',
         COALESCE((SELECT hatokor FROM public.backup_table_policy
                    WHERE tabla = 'bealitas_zaro_adatok_mentes_20260811'), '<nincs sor>'),
         'kizart_egyeb'

  UNION ALL SELECT 3, 'Egy visszaallitas NEM irhatja felul',
         COALESCE((SELECT visszaallithato::text FROM public.backup_table_policy
                    WHERE tabla = 'bealitas_zaro_adatok_mentes_20260811'), '<nincs sor>'),
         'false'

  UNION ALL SELECT 4, 'A tabla NEM kerul gyulekezeti mentesbe',
         (SELECT count(*)::text FROM public.backup_live_tables()
           WHERE tabla = 'bealitas_zaro_adatok_mentes_20260811' AND hatokor = 'gyulekezet'),
         '0'

  UNION ALL SELECT 10, 'TAJEKOZTATO — gyulekezeti mentesbe kerulo tablak',
         (SELECT count(*)::text FROM public.backup_live_tables() WHERE hatokor = 'gyulekezet'),
         (SELECT count(*)::text FROM public.backup_live_tables() WHERE hatokor = 'gyulekezet')

  UNION ALL SELECT 11, 'TAJEKOZTATO — globalis mentesbe kerulo tablak',
         (SELECT count(*)::text FROM public.backup_live_tables() WHERE hatokor = 'globalis'),
         (SELECT count(*)::text FROM public.backup_live_tables() WHERE hatokor = 'globalis')

  UNION ALL SELECT 99, '>>> ITELET <<<',
         CASE WHEN (SELECT count(*) FROM public.backup_live_tables() WHERE hatokor IS NULL) = 0
              THEN 'MEHET — az adatbazis oldalan minden elofeltetel teljesul'
              ELSE 'NEM MEHET — meg mindig van besorolatlan tabla'
         END,
         'MEHET — az adatbazis oldalan minden elofeltetel teljesul'
) AS x
ORDER BY sorrend;
