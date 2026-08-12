-- ═══════════════════════════════════════════════════════════════════════════
--  A CÍM-TÖRZS KÉT „TELJES HOZZÁFÉRÉS" SZABÁLYÁNAK ELTÁVOLÍTÁSA (2026-08-12)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  MI DERÜLT KI
--  A 2026-08-12-EGY-LEKERDEZES-adr-policyk.sql élesben ezt mérte:
--
--    adrlocality → „Teljes hozzaferes telepulesek"
--    adrstreet   → „Teljes hozzaferes utcak"
--        parancs = ALL | típus = PERMISSIVE | szerep = public
--        feltétel = (auth.role() = 'authenticated')
--
--  Vagyis: MEGENGEDŐ szabály, MINDEN műveletre (INSERT/UPDATE/DELETE),
--  BÁRKINEK, aki be van jelentkezve.
--
--  ⚠️ EZ EGY KORÁBBI ÁLLÍTÁSOMAT CÁFOLTA. 2026-08-11 reggelén azt írtam, hogy a
--  cím-törzs tényleges kitettsége NULLA volt, mert „az RLS egyedül is tartott".
--  Ezt a repó migrációs fájljaiból állítottam, és TÉVEDTEM. A két zár —
--  a tábla-szintű írási jog (GRANT) és a sorszintű szabály (RLS) — EGYSZERRE
--  volt nyitva. Bármely bejelentkezett felhasználó átírhatta vagy törölhette
--  az országos cím-törzset (~13 800 település + az összes utca).
--
--  A 2026-08-11-ellenorzes-javitasok.sql visszavonta az írási JOGOKAT, tehát
--  MA MÁR ZÁRT (a mérés: 0 írási grant). Ez a fájl a MÁSODIK zárat is rendbe teszi.
--
--  MIÉRT NEM KELL EZ A KÉT SZABÁLY
--  1. Az alkalmazás NEM közvetlenül ír: három SECURITY DEFINER RPC-n keresztül
--     (`app_get_or_create_locality`, `app_get_or_create_street`, `app_set_address_geo`).
--     Azok a tulajdonos jogaival futnak, tehát az RLS-t amúgy is átlépik —
--     ezekre a szabályokra semmi szükségük.
--  2. Az olvasást a külön SELECT-szabályok intézik (`adrlocality_read`,
--     `adrstreet_read`, „Mindenki lathatja az utcakat"), azokhoz NEM nyúlunk —
--     enélkül a cím-legördülők ÜRESEN maradnának az egész alkalmazásban.
--  3. Ma tehetetlenek (nincs írási grant), de ez EGY GRANT-tól függ. Ha valaki
--     egyszer kiad egy `GRANT ALL`-t — vagy egy jövőbeli Supabase-alapértelmezés
--     visszaadja —, ezek AZONNAL élesednek újra. A tehetetlen csapda is csapda.
--
--  BIZTONSÁG
--  Ez a fájl NEM töröl adatot. Két RLS-szabályt távolít el, amelyek ma egyetlen
--  műveletet sem engedélyeznek. A COMMIT előtti őrszem visszapergeti az egészet,
--  ha az OLVASÁS bármelyik táblán megsérülne.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
--  SZAKASZ 0 — ÁLLAPOTFELMÉRÉS (fail-closed)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_iro_grant integer;
  v_olvasas   integer;
BEGIN
  -- Ha valahogy MÉGIS van írási jog, azt előbb a 2026-08-11-ellenorzes-javitasok.sql
  -- kell rendezze — nem akarunk félállapotban dolgozni.
  SELECT count(*) INTO v_iro_grant
    FROM (VALUES ('adrlocality'),('adrstreet')) v(t)
   CROSS JOIN (VALUES ('anon'),('authenticated'),('public')) r(role)
   CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('DELETE')) c(priv)
   WHERE has_table_privilege(r.role, 'public.' || v.t, c.priv);

  IF v_iro_grant > 0 THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: még % írási jog (GRANT) van az adrlocality/adrstreet táblán. '
      'Előbb futtasd le a 2026-08-11-ellenorzes-javitasok.sql fájlt.', v_iro_grant;
  END IF;

  -- Az OLVASÁSNAK meg kell lennie — enélkül a cím-legördülők üresek.
  SELECT count(*) INTO v_olvasas
    FROM (VALUES ('adrlocality'),('adrstreet')) v(t)
   WHERE has_table_privilege('authenticated', 'public.' || v.t, 'SELECT');

  IF v_olvasas <> 2 THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: az authenticated szerepnek nincs meg mindkét SELECT joga (%/2). '
      'Ilyen állapotban nem nyúlok a szabályokhoz.', v_olvasas;
  END IF;

  RAISE NOTICE 'SZAKASZ 0 rendben: 0 írási jog, 2 olvasási jog.';
END $$;


BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
--  1) A KÉT MEGENGEDŐ „TELJES HOZZÁFÉRÉS" SZABÁLY ELTÁVOLÍTÁSA
-- ─────────────────────────────────────────────────────────────────────────────
-- Az idézőjel kötelező: a szabálynevekben szóköz van.
DROP POLICY IF EXISTS "Teljes hozzaferes telepulesek" ON public.adrlocality;
DROP POLICY IF EXISTS "Teljes hozzaferes utcak"       ON public.adrstreet;

-- Nyom a katalógusban, hogy más ne „javítsa vissza".
COMMENT ON TABLE public.adrlocality IS
  '2026-08-12: az országos település-törzs. ÍRNI KIZÁRÓLAG a SECURITY DEFINER '
  'RPC-ken keresztül szabad (app_get_or_create_locality, app_set_address_geo). '
  'A korábbi „Teljes hozzaferes telepulesek" (FOR ALL, PERMISSIVE, authenticated) '
  'szabály ELTÁVOLÍTVA — az írási GRANT-tal együtt bárki átírhatta volna a törzset.';

COMMENT ON TABLE public.adrstreet IS
  '2026-08-12: az országos utca-törzs. ÍRNI KIZÁRÓLAG a SECURITY DEFINER RPC-ken '
  'keresztül szabad (app_get_or_create_street, app_set_address_geo). '
  'A korábbi „Teljes hozzaferes utcak" (FOR ALL, PERMISSIVE, authenticated) '
  'szabály ELTÁVOLÍTVA.';


-- ─────────────────────────────────────────────────────────────────────────────
--  2) ZÁRÓ ŐRSZEM — A COMMIT ELŐTT
-- ─────────────────────────────────────────────────────────────────────────────
-- Két dolgot mér: elfogytak-e a nem-SELECT szabályok, ÉS megmaradt-e az olvasás.
-- A második legalább olyan fontos: egy elrontott olvasás az egész alkalmazásban
-- üres cím-legördülőket adna, némán.
DO $$
DECLARE
  v_maradt   integer;
  v_olvasoak integer;
BEGIN
  SELECT count(*) INTO v_maradt
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('adrlocality','adrstreet')
     AND cmd <> 'SELECT';

  IF v_maradt > 0 THEN
    RAISE EXCEPTION
      'VISSZAPERGETVE: még % nem-SELECT szabály maradt az adrlocality/adrstreet táblán.',
      v_maradt;
  END IF;

  SELECT count(*) INTO v_olvasoak
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('adrlocality','adrstreet')
     AND cmd = 'SELECT';

  IF v_olvasoak < 2 THEN
    RAISE EXCEPTION
      'VISSZAPERGETVE: az olvasási szabályokból csak % maradt (legalább 2 kell, '
      'táblánként egy). Enélkül a cím-legördülők ÜRESEN maradnának.', v_olvasoak;
  END IF;

  RAISE NOTICE 'Záró őrszem rendben: 0 írási szabály, % olvasási szabály.', v_olvasoak;
END $$;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
--  VISSZAVONÁS — ⚠️ EZZEL ÚJRA MEGNYITOD A LYUKAT
-- ═══════════════════════════════════════════════════════════════════════════
-- Csak akkor, ha bebizonyosodik, hogy valamelyik funkció mégis ezekre épült.
-- Ilyenkor a HELYES javítás az, hogy az adott funkció SECURITY DEFINER RPC-t
-- kapjon — NEM az, hogy a törzs mindenki számára írhatóvá váljon.
--
-- BEGIN;
--   CREATE POLICY "Teljes hozzaferes telepulesek" ON public.adrlocality
--     FOR ALL TO public USING (auth.role() = 'authenticated');
--   CREATE POLICY "Teljes hozzaferes utcak" ON public.adrstreet
--     FOR ALL TO public USING (auth.role() = 'authenticated');
-- COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS — EGYETLEN SELECT (a Supabase csak az utolsó eredményt mutatja)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT sorrend, mit_mer, ertek, vart,
       CASE WHEN ertek = vart THEN '✅' ELSE '❌' END AS rendben
FROM (
  SELECT 1 AS sorrend, 'NEM-SELECT szabaly az adrlocality/adrstreet tablan' AS mit_mer,
         (SELECT count(*)::text FROM pg_policies
           WHERE schemaname='public' AND tablename IN ('adrlocality','adrstreet')
             AND cmd <> 'SELECT') AS ertek,
         '0' AS vart

  UNION ALL SELECT 2, 'Az OLVASAS megmaradt (szabaly-szinten, legalabb 2)',
         (SELECT (count(*) >= 2)::text FROM pg_policies
           WHERE schemaname='public' AND tablename IN ('adrlocality','adrstreet')
             AND cmd = 'SELECT'), 'true'

  UNION ALL SELECT 3, 'Az OLVASAS megmaradt (grant-szinten, mind az 5 adr-tablan)',
         (SELECT count(*)::text
            FROM (VALUES ('adrcountry'),('adrcounty'),('adrlocality'),
                         ('adrstreet'),('adrlocality_alias')) v(t)
           WHERE has_table_privilege('authenticated','public.' || v.t,'SELECT')), '5'

  UNION ALL SELECT 4, 'IRASI jog (GRANT) az adrlocality/adrstreet tablan',
         (SELECT count(*)::text
            FROM (VALUES ('adrlocality'),('adrstreet')) v(t)
           CROSS JOIN (VALUES ('anon'),('authenticated'),('public')) r(role)
           CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('DELETE')) c(priv)
           WHERE has_table_privilege(r.role, 'public.' || v.t, c.priv)), '0'

  UNION ALL SELECT 5, 'A 3 guardolt cimtorzs-RPC tovabbra is letezik',
         ((to_regprocedure('public.app_get_or_create_locality(text)') IS NOT NULL)
          AND (to_regprocedure('public.app_get_or_create_street(text,integer)') IS NOT NULL)
          AND (to_regprocedure('public.app_set_address_geo(text,integer,numeric,numeric,text)') IS NOT NULL))::text,
         'true'

  UNION ALL SELECT 99, '>>> ITELET <<<',
         CASE WHEN (SELECT count(*) FROM pg_policies
                     WHERE schemaname='public' AND tablename IN ('adrlocality','adrstreet')
                       AND cmd <> 'SELECT') = 0
              THEN 'ZART — mindket zar a helyen'
              ELSE 'MEG NEM ZART'
         END,
         'ZART — mindket zar a helyen'
) AS x
ORDER BY sorrend;


-- ═══════════════════════════════════════════════════════════════════════════
--  FUTTATÁS UTÁNI PRÓBA (1 perc) — ezt a felületen nézd meg
-- ═══════════════════════════════════════════════════════════════════════════
--  1. Nyiss egy személyi kartont → Elérhetőségek: a település- és utca-legördülő
--     TÖLTŐDIK-E? (Ha üres marad, azonnal szólj — a visszavonó szakasz fent van.)
--  2. Ments egy taghoz ÚJ, eddig nem szereplő települést vagy utcát: létrejön-e?
--     (Ez az RPC-utat próbálja — annak a szabályoktól függetlenül működnie kell.)
--  3. „Cím egyeztetése" → egy pont mentése: sikerül-e?
