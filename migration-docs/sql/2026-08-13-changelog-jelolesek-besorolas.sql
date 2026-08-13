-- ═══════════════════════════════════════════════════════════════════════════
--  A `changelog_jelolesek` TÁBLA BESOROLÁSA — ettől indul újra a mentés (2026-08-13)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  MI TÖRTÉNT
--  A 2026-08-12-changelog-jelolesek.sql létrehozta a `public.changelog_jelolesek`
--  táblát (csillagozás + kézi „kiküldöttnek jelölés"), de NEM sorolta be a
--  `backup_table_policy`-ba. Az élő tábla-szám 151 → 152 lett, és a mentés
--  fail-closed kapuja azóta leállítja a futást:
--
--        „A rendszer JELENLEG NEM TUD MENTENI: a tábla-besorolás hiányos."
--
--  ⚠️ A KAPU JÓL MŰKÖDÖTT. Inkább leállt, mint hogy némán kihagyjon egy táblát —
--  pontosan ezért épült így. Egy mentés, ami csendben kihagy adatot, rosszabb a
--  semminél, mert elhiteti, hogy van másolatod.
--
--  ⚠️ ÉS EZ MÁR A MÁSODIK ESET. Az elsőt (a záró-pillanatkép ideiglenes táblája)
--  a 2026-08-11-ideiglenes-tabla-besorolas.sql oldotta meg, és abba a fájlba
--  nagybetűvel bekerült a szabály:
--
--        AKI ÚJ TÁBLÁT HOZ LÉTRE, UGYANABBAN A TRANZAKCIÓBAN BESOROLJA.
--
--  Másnap ugyanez a hiba ismétlődött. A szabály tehát nem elég, ha csak egy
--  kommentben él — ezért a fájl végén szerepel egy ellenőrző lekérdezés, amit
--  MINDEN új táblát létrehozó migráció után le kell futtatni.
--
--  MIÉRT `globalis` ÉS MIÉRT NEM VISSZAÁLLÍTHATÓ
--  A tábla azt őrzi, hogy melyik változásnapló-bejegyzés van megcsillagozva, és
--  melyiket jelölte valaki kézzel kiküldöttnek — KI és MIKOR.
--  · `globalis`: nincs (és nem is lehet) `congregation_id` oszlopa — ez rendszer-
--    szintű szerkesztői állapot, nem gyülekezeti adat.
--  · `visszaallithato = false`: ugyanaz az elv, mint az `audit_log`-nál és a
--    `system_broadcasts`-nál — egy visszaállítás SOHA nem írhatja felül a rendszer
--    saját emlékezetét arról, hogy ki mit jelölt meg és mikor. Ha felülírhatná,
--    egy visszaállítás eltüntethetné annak nyomát, hogy valaki kézzel kiküldöttnek
--    jelölt valamit — épp azt, amit el kellene számoltatni.
--  · `reteg = 0`: a `system_broadcasts` mintája, amelynek ez a testvértáblája.
--
--  BIZTONSÁG
--  Ez a fájl NEM töröl és NEM módosít alkalmazás-adatot. Egyetlen besorolási sort
--  szúr be. A COMMIT előtti őrszem visszapergeti az egészet, ha utána MÉGIS maradna
--  besorolatlan élő tábla — vagyis vagy teljesen megoldja, vagy semmit nem változtat.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
--  SZAKASZ 0 — ÁLLAPOTFELMÉRÉS (fail-closed)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rpc_van    boolean;
  v_tabla_van  boolean;
  v_maradt     integer;
  v_nevek      text;
BEGIN
  SELECT to_regprocedure('public.backup_live_tables()') IS NOT NULL INTO v_rpc_van;
  IF NOT v_rpc_van THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: nincs backup_live_tables() függvény. Előbb a 2026-08-11-biztonsagi-mentes.sql kell.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'changelog_jelolesek'
  ) INTO v_tabla_van;

  IF NOT v_tabla_van THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: nincs changelog_jelolesek tábla. Ez a fájl azt sorolná be. '
      'Futtasd le előbb a 2026-08-12-changelog-jelolesek.sql fájlt, VAGY — ha a mentés '
      'valami MÁS besorolatlan tábla miatt áll — nézd meg alább, melyik az.';
  END IF;

  SELECT count(*), COALESCE(string_agg(tabla, ', ' ORDER BY tabla), '—')
    INTO v_maradt, v_nevek
    FROM public.backup_live_tables()
   WHERE hatokor IS NULL;

  RAISE NOTICE 'SZAKASZ 0 rendben. Besorolatlan élő tábla MOST: % (%)', v_maradt, v_nevek;
END $$;


BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
--  1) A BESOROLÁS
-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotens: második futásnál csak a megjegyzés frissül.
INSERT INTO public.backup_table_policy
  (tabla, hatokor, join_predikatum, reteg, visszaallithato, megjegyzes)
VALUES
  ('changelog_jelolesek', 'globalis', NULL, 0, false,
   '2026-08-13: a változásnapló szerkesztői jelölései (csillag + kézi „kiküldöttnek jelölve", '
   || 'ki és mikor). RENDSZERSZINTŰ: nincs congregation_id oszlopa, a globális mentésbe kerül. '
   || 'visszaallithato=false az audit_log / system_broadcasts mintájára: egy visszaállítás nem '
   || 'írhatja felül a rendszer saját emlékezetét arról, ki mit jelölt meg — épp azt tüntetné el, '
   || 'amit el kellene számoltatni. A táblát a 2026-08-12-changelog-jelolesek.sql hozta létre, '
   || 'és elmulasztotta besorolni: emiatt a napi mentés fail-closed kapuja 2026-08-12/13-án leállt.')
ON CONFLICT (tabla) DO UPDATE
  SET hatokor         = EXCLUDED.hatokor,
      join_predikatum = EXCLUDED.join_predikatum,
      reteg           = EXCLUDED.reteg,
      visszaallithato = EXCLUDED.visszaallithato,
      megjegyzes      = EXCLUDED.megjegyzes;


-- ─────────────────────────────────────────────────────────────────────────────
--  2) ZÁRÓ ŐRSZEM — A COMMIT ELŐTT
-- ─────────────────────────────────────────────────────────────────────────────
-- Nem azt méri, hogy a beszúrás sikerült-e (az triviális), hanem azt, amiért az
-- egészet csináljuk: EL TUD-E INDULNI A MENTÉS. Ha bármi MÁS is besorolatlan
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
--  VISSZAVONÁS — ⚠️ ettől a mentés ÚJRA leáll
-- ═══════════════════════════════════════════════════════════════════════════
-- BEGIN;
--   DELETE FROM public.backup_table_policy WHERE tabla = 'changelog_jelolesek';
-- COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
--  ⭐ EZT A LEKÉRDEZÉST FUTTASD LE MINDEN OLYAN MIGRÁCIÓ UTÁN,
--     AMELYIK ÚJ TÁBLÁT HOZ LÉTRE. Két másodperc, és megelőz egy leállt mentést.
-- ═══════════════════════════════════════════════════════════════════════════
--   SELECT tabla FROM public.backup_live_tables() WHERE hatokor IS NULL;
--   -- Ha ad vissza sort, a mentés MA ÉJJEL nem fog elindulni.


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

  UNION ALL SELECT 2, 'A changelog_jelolesek besorolasa',
         COALESCE((SELECT hatokor FROM public.backup_table_policy
                    WHERE tabla = 'changelog_jelolesek'), '<nincs sor>'),
         'globalis'

  UNION ALL SELECT 3, 'Egy visszaallitas NEM irhatja felul',
         COALESCE((SELECT visszaallithato::text FROM public.backup_table_policy
                    WHERE tabla = 'changelog_jelolesek'), '<nincs sor>'),
         'false'

  UNION ALL SELECT 4, 'NEM kerul gyulekezeti mentesbe (rendszerszintu adat)',
         (SELECT count(*)::text FROM public.backup_live_tables()
           WHERE tabla = 'changelog_jelolesek' AND hatokor = 'gyulekezet'), '0'

  UNION ALL SELECT 10, 'TAJEKOZTATO — elo public tablak',
         (SELECT count(*)::text FROM public.backup_live_tables()),
         (SELECT count(*)::text FROM public.backup_live_tables())

  UNION ALL SELECT 11, 'TAJEKOZTATO — gyulekezeti / globalis mentesbe kerulo tablak',
         ((SELECT count(*) FROM public.backup_live_tables() WHERE hatokor='gyulekezet')::text
          || ' / ' ||
          (SELECT count(*) FROM public.backup_live_tables() WHERE hatokor='globalis')::text),
         ((SELECT count(*) FROM public.backup_live_tables() WHERE hatokor='gyulekezet')::text
          || ' / ' ||
          (SELECT count(*) FROM public.backup_live_tables() WHERE hatokor='globalis')::text)

  UNION ALL SELECT 99, '>>> ITELET <<<',
         CASE WHEN (SELECT count(*) FROM public.backup_live_tables() WHERE hatokor IS NULL) = 0
              THEN 'MEHET — nyomd meg a „Mentes most" gombot'
              ELSE 'NEM MEHET — meg mindig van besorolatlan tabla'
         END,
         'MEHET — nyomd meg a „Mentes most" gombot'
) AS x
ORDER BY sorrend;
