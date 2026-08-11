-- KARTOTEKA — EGYETLEN lekérdezés: mi van MA az egyházmegyei pénzügyből?
--
-- MIÉRT: a kód öt egyházmegyei pénzügyi táblára hivatkozik
-- (`apps/web/lib/auth/finance-scope.ts`), a repóban lévő séma-kivonat viszont
-- csak EGYET tartalmaz. A séma-kivonat BIZONYÍTOTTAN elavult (2026-07-10 óta
-- nem frissült), tehát nem tudni, melyik létezik élesben — és ez dönti el,
-- hogy az egyházmegyei pénzügy kiépítése JAVÍTÁS vagy ÉPÍTÉS.
--
-- CSAK OLVAS. Egyetlen SELECT — a Studio csak az utolsót mutatja, ezért
-- minden egy lekérdezésbe van fűzve.
--
-- HOGYAN OLVASD: a „letezik" oszlop true/false. A sorszám 100-as blokkja a
-- táblák megléte, a 200-as a bennük lévő adat, a 300-as a jogosultság.

SELECT x.sorrend, x.mit_mer, x.ertek
FROM (

  -- ══ 1) LÉTEZIK-E A TÁBLA? ════════════════════════════════════════════════
  SELECT 101 AS sorrend, 'TÁBLA: diocese_bealitas'::text AS mit_mer,
         (to_regclass('public.diocese_bealitas') IS NOT NULL)::text AS ertek
  UNION ALL SELECT 102, 'TÁBLA: diocese_befizetes',
         (to_regclass('public.diocese_befizetes') IS NOT NULL)::text
  UNION ALL SELECT 103, 'TÁBLA: diocese_kiadas',
         (to_regclass('public.diocese_kiadas') IS NOT NULL)::text
  UNION ALL SELECT 104, 'TÁBLA: diocese_koltsegvetes',
         (to_regclass('public.diocese_koltsegvetes') IS NOT NULL)::text
  UNION ALL SELECT 105, 'TÁBLA: diocese_annual_reports',
         (to_regclass('public.diocese_annual_reports') IS NOT NULL)::text

  -- ══ 2) VAN-E BENNE ADAT? (csak a létezőkre) ══════════════════════════════
  -- A `to_jsonb`-trükk helyett dinamikus számlálás nem megy egy SELECT-ben,
  -- ezért óvatosan: csak akkor számol, ha a tábla létezik.
  UNION ALL SELECT 201, 'SOROK: diocese_bealitas',
         COALESCE((SELECT count(*)::text FROM public.diocese_bealitas), '—')
  UNION ALL SELECT 202, 'SOROK: dioceses (hány egyházmegye van)',
         COALESCE((SELECT count(*)::text FROM public.dioceses), '—')
  UNION ALL SELECT 203, 'SOROK: szamadasicel, szint=egyhazmegye',
         COALESCE((SELECT count(*)::text FROM public.szamadasicel
                   WHERE szint = 'egyhazmegye'), '—')
  UNION ALL SELECT 204, 'SOROK: szamadasicel, szint=gyulekezet vagy NULL',
         COALESCE((SELECT count(*)::text FROM public.szamadasicel
                   WHERE szint IS NULL OR szint = 'gyulekezet'), '—')

  -- ══ 3) KÖNYVELT-E VALAKI EGYHÁZMEGYEI KÓDRA? ═════════════════════════════
  -- Ez dönti el, van-e „örökölt" adat azokon a kódokon, amelyekre a
  -- gyülekezet mostantól nem könyvelhet.
  UNION ALL SELECT 301, 'GYÜLEKEZETI befizetés egyházmegyei kódon (örökölt adat?)',
         COALESCE((SELECT count(*)::text
                   FROM public.befizetes b
                   JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
                   JOIN public.szamadasicel sz ON sz.id = bc.id_szamadasicel
                   WHERE sz.szint = 'egyhazmegye'
                     AND COALESCE(b.deleted, false) = false), '—')
  UNION ALL SELECT 302, 'GYÜLEKEZETI kiadás egyházmegyei kódon (örökölt adat?)',
         COALESCE((SELECT count(*)::text
                   FROM public.kiadas k
                   JOIN public.kiadascel kc ON kc.id = k.id_kiadascel
                   JOIN public.szamadasicel sz ON sz.id = kc.id_szamadasicel
                   WHERE sz.szint = 'egyhazmegye'
                     AND COALESCE(k.deleted, false) = false), '—')
  UNION ALL SELECT 303, 'KÖLTSÉGVETÉSI terv egyházmegyei kódon (örökölt adat?)',
         COALESCE((SELECT count(*)::text
                   FROM public.koltsegvetes kv
                   JOIN public.szamadasicel sz ON sz.id = kv.szamadasicelid
                   WHERE sz.szint = 'egyhazmegye'), '—')

  -- ══ 4) KI FÉR HOZZÁ? ═════════════════════════════════════════════════════
  UNION ALL SELECT 401, 'AKTÍV esperes / egyházmegyei admin (fő)',
         COALESCE((SELECT count(*)::text FROM public.profiles
                   WHERE status = 'active'
                     AND role IN ('esperes', 'egyhazmegyei_admin')), '—')
  UNION ALL SELECT 402, 'AKTÍV egyházmegyei számvevő',
         COALESCE((SELECT count(*)::text FROM public.profiles
                   WHERE status = 'active'
                     AND role = 'egyhazmegyei_szamvevo'), '—')

) x
ORDER BY x.sorrend;

-- ════════════════════════════════════════════════════════════════════════════
-- MIT JELENT AZ EREDMÉNY
-- ════════════════════════════════════════════════════════════════════════════
--
-- 101–105: ha a `diocese_befizetes` / `diocese_kiadas` / `diocese_koltsegvetes`
--   FALSE → az egyházmegyei pénzügy alatt NINCS adatréteg; a kód olyan
--   táblákra hivatkozik, amelyek nem léteznek. Ekkor ez ÉPÍTÉS, nem javítás,
--   és a táblák létrehozása az első lépés.
--
-- 301–303: ha NEM 0 → van olyan gyülekezeti tétel, amely egyházmegyei kódon ül.
--   Ez „örökölt" adat (import vagy a szint-jelölés előtti rögzítés). NEM kell
--   törölni: a Számadás-íven a sor létezik, tehát megjelenik. De tudni kell
--   róla, mert a lelkész MOSTANTÓL nem tud ilyet létrehozni.
--
-- 203/204: a kód-készlet megoszlása. A 203-nak 18-nak kell lennie
--   (a 2026-06-11l-felsobb-szint-jeloles.sql szerint).
--
-- Ha bármelyik sor „—" jelet ad, az adott tábla nem létezik.
