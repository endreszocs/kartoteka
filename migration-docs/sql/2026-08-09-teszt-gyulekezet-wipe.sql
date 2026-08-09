-- ============================================================================
-- 2026-08-09 — TESZT GYÜLEKEZET ADAT-KIÜRÍTÉS (wipe) — a gyülekezet MEGMARAD
-- ============================================================================
-- Töröl MINDEN adatot a Teszt gyülekezetből (7e570000-0000-4000-8000-000000000003),
-- de a 2026-07-01-es teardown-nal ELLENTÉTBEN:
--   • a congregations sor MEGMARAD (és a Teszt Egyházmegye/Egyházkerület is),
--   • a profiles / profile_roles / profile_congregations hozzárendelések
--     MEGMARADNAK (a teszt-lelkész be tud lépni, azonnal seedelhető újra),
--   • a congregation_subscriptions és a public_sites konfig-sor is MEGMARAD
--     (adminisztratív beállítás, nem adat — ha mégis törölnéd, lásd a
--     kikommentezett sorokat).
--
-- ÚJ a 2026-07-01-es teardownhoz képest (az azóta bejött táblák):
--   • haztartas_tag / haztartas / cim / szemely_kapcsolat (hibrid család-modell,
--     2026-06-01) — a haztartas és cim ON DELETE RESTRICT-tel mutat a
--     congregations-ra, a klónozott adat pedig futtatta a háztartás-szinkront!
--   • keszpenz_nyito_egyenleg (2026-06-20)
--   • cross_congregation_match_notifications explicit takarítása
--   • gyerek törlése id_szemely szerint IS (a szülő-nélküli csalad esete)
--
-- Egyetlen tranzakció (DO blokk): ha bármelyik DELETE hibázik, SEMMI nem törlődik.
-- Idempotens — üres gyülekezeten is lefut, újrafuttatható.
-- Ha egy tábla nálad nem létezik (schema drift), kommentezd ki az adott sort.
--
-- FUTTATÁSI SORREND a teljes reset-hez:
--   1. (opcionális) 2026-08-09-teszt-gyulekezet-ellenorzes.sql — mi van bent?
--   2. EZ A FÁJL — kiürítés
--   3. 2026-08-09-teszt-gyulekezet-seed.sql — fiktív demo-adatok
-- ============================================================================

DO $$
DECLARE
  cid uuid := '7e570000-0000-4000-8000-000000000003';  -- Teszt gyülekezet
BEGIN
  -- A) Oblio / e-factura (kiadás- és befizetés-hivatkozások miatt legelöl)
  DELETE FROM public.oblio_kiadas_match       WHERE congregation_id = cid;
  DELETE FROM public.oblio_szamlak            WHERE congregation_id = cid;
  DELETE FROM public.oblio_fiokok             WHERE congregation_id = cid;

  -- B) Anyagmozgás + valuta-átértékelés (kiadas/befizetes FK-k)
  DELETE FROM public.material_movements       WHERE congregation_id = cid;
  DELETE FROM public.materials                WHERE congregation_id = cid;
  DELETE FROM public.valuta_atert             WHERE congregation_id = cid;

  -- C) Temető-lánc (körkörös FK: sirhely.aktivberlesid → sirhelyberles)
  UPDATE public.sirhely SET aktivberlesid = NULL
    WHERE temetoid IN (SELECT id FROM public.sirhelytemeto WHERE congregation_id = cid);
  DELETE FROM public.sirhelyelhunyt
    WHERE sirhelyid IN (SELECT id FROM public.sirhely
                        WHERE temetoid IN (SELECT id FROM public.sirhelytemeto WHERE congregation_id = cid));
  DELETE FROM public.sirhelyberles
    WHERE sirhelyid IN (SELECT id FROM public.sirhely
                        WHERE temetoid IN (SELECT id FROM public.sirhelytemeto WHERE congregation_id = cid));
  DELETE FROM public.sirhely
    WHERE temetoid IN (SELECT id FROM public.sirhelytemeto WHERE congregation_id = cid);
  DELETE FROM public.sirhelytemeto            WHERE congregation_id = cid;

  -- D) Kiadási kísérőív (kiadas FK)
  DELETE FROM public.kiadasikiseroiv
    WHERE id_kiadas IN (SELECT id FROM public.kiadas WHERE congregation_id = cid);

  -- E) Pénzügyi mag
  DELETE FROM public.befizetes                WHERE congregation_id = cid;
  DELETE FROM public.kiadas                   WHERE congregation_id = cid;
  DELETE FROM public.belsomozgas              WHERE congregation_id = cid;
  DELETE FROM public.bankszamla_nyito_egyenleg WHERE congregation_id = cid;
  DELETE FROM public.keszpenz_nyito_egyenleg  WHERE congregation_id = cid;   -- ÚJ (2026-06-20-as tábla)
  DELETE FROM public.bankszamlak              WHERE congregation_id = cid;
  DELETE FROM public.koltsegvetes             WHERE congregation_id = cid;
  DELETE FROM public.congregation_annual_fees WHERE congregation_id = cid;
  DELETE FROM public.transactions             WHERE congregation_id = cid;
  DELETE FROM public.berleti_szerzodes        WHERE congregation_id = cid;
  DELETE FROM public.chitanta_tombok          WHERE congregation_id = cid;
  DELETE FROM public.jarulek_kedvezmeny       WHERE congregation_id = cid;

  -- F) Kereszt-gyülekezeti egyezés-értesítések — EXPLICIT takarítás.
  --    (A szemely-FK ON DELETE CASCADE amúgy is vinné a szemely-törléskor,
  --    de így a "matched" oldalon lévő teszt-személyes sorok is biztosan
  --    eltűnnek, és a többi gyülekezet lelkészeinél sem marad szellem-dialógus.)
  DELETE FROM public.cross_congregation_match_notifications
    WHERE triggering_congregation_id = cid
       OR matched_congregation_id    = cid
       OR triggering_szemely_id IN (SELECT id FROM public.szemely WHERE congregation_id = cid)
       OR matched_szemely_id    IN (SELECT id FROM public.szemely WHERE congregation_id = cid);

  -- G) HIBRID CSALÁD-MODELL (2026-06-01 utáni táblák) — a 2026-07-01-es
  --    teardownból HIÁNYZIK! A haztartas/cim RESTRICT-tel mutat a
  --    congregations-ra, és a szemely-törlést is blokkolnák az élő tag-sorok.
  DELETE FROM public.szemely_kapcsolat        WHERE congregation_id = cid;
  DELETE FROM public.haztartas_tag            WHERE congregation_id = cid;
  DELETE FROM public.haztartas                WHERE congregation_id = cid;
  DELETE FROM public.cim                      WHERE congregation_id = cid;

  -- H) Személyhez kötött rekordok + anyakönyvek
  --    gyerek: mindkét úton — a szülők családján keresztül ÉS közvetlenül a
  --    teszt-személyre mutató sorok (szülő-nélküli csalad esete, teardown-gap).
  DELETE FROM public.gyerek
    WHERE id_csalad IN (SELECT c.id FROM public.csalad c
                        JOIN public.szemely s ON s.id IN (c.id_ferfi, c.id_no)
                        WHERE s.congregation_id = cid);
  DELETE FROM public.gyerek
    WHERE id_szemely IN (SELECT id FROM public.szemely WHERE congregation_id = cid);
  DELETE FROM public.felmentes                WHERE congregation_id = cid;
  DELETE FROM public.csaladlatogatas          WHERE congregation_id = cid;
  DELETE FROM public.presbiter                WHERE congregation_id = cid;
  DELETE FROM public.attert                   WHERE congregation_id = cid;
  DELETE FROM public.bekoltozott              WHERE congregation_id = cid;
  -- Review-fix (2026-08-09): CSAK a teszt gyülekezet SAJÁT elköltözési sorai
  -- törlődnek — a `hova_congregation_id = cid` ág MÁS gyülekezetek anyakönyvi
  -- sorait törölte volna (akik a teszt gyülekezetBE költöztek). Azok a sorok
  -- maradnak: a hivatkozott congregation-sor nem törlődik, az FK ép marad.
  DELETE FROM public.elkoltozott              WHERE congregation_id = cid;
  DELETE FROM public.kitert                   WHERE congregation_id = cid;
  DELETE FROM public.keresztseg               WHERE congregation_id = cid;
  DELETE FROM public.konfirmalas              WHERE congregation_id = cid;
  DELETE FROM public.hazassag                 WHERE congregation_id = cid;
  DELETE FROM public.temetes                  WHERE congregation_id = cid;
  DELETE FROM public.leltar_tetelek           WHERE congregation_id = cid;
  DELETE FROM public.csalad
    WHERE id_ferfi IN (SELECT id FROM public.szemely WHERE congregation_id = cid)
       OR id_no    IN (SELECT id FROM public.szemely WHERE congregation_id = cid);
  DELETE FROM public.csoport                  WHERE congregation_id = cid;

  -- Ön-FK feloldása (szemely.id_apja/id_anyja → szemely.cnp), majd a személyek
  UPDATE public.szemely SET id_apja = NULL, id_anyja = NULL WHERE congregation_id = cid;
  DELETE FROM public.szemely                  WHERE congregation_id = cid;

  -- I) Presbiteri jegyzőkönyvek (gyerek-táblákkal)
  DELETE FROM public.jegyzokonyv_hatarozatok
    WHERE jegyzokonyv_id IN (SELECT id FROM public.presbiteri_jegyzokonyvek WHERE congregation_id = cid);
  DELETE FROM public.jegyzokonyv_napirendi_pontok
    WHERE jegyzokonyv_id IN (SELECT id FROM public.presbiteri_jegyzokonyvek WHERE congregation_id = cid);
  DELETE FROM public.jegyzokonyv_resztvevok
    WHERE jegyzokonyv_id IN (SELECT id FROM public.presbiteri_jegyzokonyvek WHERE congregation_id = cid);
  DELETE FROM public.presbiteri_jegyzokonyvek WHERE congregation_id = cid;

  -- J) Nyilvános oldal TARTALMA (a public_sites konfig-sor megmarad)
  DELETE FROM public.public_magazine_issues   WHERE congregation_id = cid;
  DELETE FROM public.public_magazines         WHERE congregation_id = cid;
  DELETE FROM public.public_posts             WHERE congregation_id = cid;
  -- DELETE FROM public.public_sites          WHERE congregation_id = cid;  -- csak ha a konfigot is törölnéd

  -- K) Egyéb per-congregation adat
  DELETE FROM public.munkanaplo               WHERE congregation_id = cid;
  DELETE FROM public.gyulekezeti_programok    WHERE congregation_id = cid;
  -- Igehirdetési terv (2026-08-09-es tábla — csak akkor, ha a migráció már lefutott)
  IF to_regclass('public.igehirdetesi_terv') IS NOT NULL THEN
    EXECUTE format('DELETE FROM public.igehirdetesi_terv WHERE congregation_id = %L', cid);
  END IF;
  DELETE FROM public.iktato_sablonok          WHERE congregation_id = cid;
  DELETE FROM public.iktato                   WHERE congregation_id = cid;
  DELETE FROM public.import_logs              WHERE congregation_id = cid;
  DELETE FROM public.support_messages         WHERE congregation_id = cid;
  DELETE FROM public.annual_reports           WHERE congregation_id = cid;
  DELETE FROM public.document_submissions     WHERE congregation_id = cid;
  -- DELETE FROM public.congregation_subscriptions WHERE congregation_id = cid;  -- admin-beállítás, alapból marad

  -- L) Értesítések + admin-hozzáférési kérések
  DELETE FROM public.ertesitesek              WHERE congregation_id = cid
     OR admin_request_id IN (SELECT id FROM public.admin_access_requests WHERE congregation_id = cid);
  DELETE FROM public.admin_access_requests    WHERE congregation_id = cid;

  -- M) Beállítás év-sorok (a seed újra létrehozza a demo-éveket)
  DELETE FROM public.bealitas                 WHERE congregation_id = cid;

  -- ⛔ SZÁNDÉKOSAN NEM töröljük:
  --   congregations (a Teszt gyülekezet sora), dioceses, districts,
  --   profiles / profile_roles / profile_congregations (hozzáférések),
  --   public_sites, congregation_subscriptions (lásd fent).

  RAISE NOTICE 'Teszt gyülekezet KIÜRÍTVE — a gyülekezet, a megye/kerület és a profil-hozzárendelések megmaradtak.';
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- ELLENŐRZÉS — minden darabszámnak 0-nak kell lennie, a gyülekezetnek léteznie
-- ────────────────────────────────────────────────────────────────────────────
WITH cid AS (SELECT '7e570000-0000-4000-8000-000000000003'::uuid AS id)
SELECT * FROM (
  SELECT 1 AS s, 'congregations (1 kell legyen!)' AS tabla, count(*) AS db FROM public.congregations, cid WHERE public.congregations.id = cid.id
  UNION ALL SELECT 2, 'profiles hozzárendelve (megmarad)', count(*) FROM public.profiles, cid WHERE congregation_id = cid.id
  UNION ALL SELECT 10, 'szemely',            count(*) FROM public.szemely, cid            WHERE congregation_id = cid.id
  UNION ALL SELECT 11, 'csalad (szülős)',    count(*) FROM public.csalad c, cid
    WHERE c.id_ferfi IN (SELECT id FROM public.szemely WHERE congregation_id = cid.id)
       OR c.id_no    IN (SELECT id FROM public.szemely WHERE congregation_id = cid.id)
  UNION ALL SELECT 12, 'haztartas',          count(*) FROM public.haztartas, cid          WHERE congregation_id = cid.id
  UNION ALL SELECT 13, 'haztartas_tag',      count(*) FROM public.haztartas_tag, cid      WHERE congregation_id = cid.id
  UNION ALL SELECT 14, 'cim',                count(*) FROM public.cim, cid                WHERE congregation_id = cid.id
  UNION ALL SELECT 15, 'szemely_kapcsolat',  count(*) FROM public.szemely_kapcsolat, cid  WHERE congregation_id = cid.id
  UNION ALL SELECT 20, 'befizetes',          count(*) FROM public.befizetes, cid          WHERE congregation_id = cid.id
  UNION ALL SELECT 21, 'kiadas',             count(*) FROM public.kiadas, cid             WHERE congregation_id = cid.id
  UNION ALL SELECT 22, 'bankszamlak',        count(*) FROM public.bankszamlak, cid        WHERE congregation_id = cid.id
  UNION ALL SELECT 23, 'bealitas',           count(*) FROM public.bealitas, cid           WHERE congregation_id = cid.id
  UNION ALL SELECT 30, 'leltar_tetelek',     count(*) FROM public.leltar_tetelek, cid     WHERE congregation_id = cid.id
  UNION ALL SELECT 31, 'munkanaplo',         count(*) FROM public.munkanaplo, cid         WHERE congregation_id = cid.id
  UNION ALL SELECT 32, 'iktato',             count(*) FROM public.iktato, cid             WHERE congregation_id = cid.id
  UNION ALL SELECT 40, 'cross-match értesítés', count(*) FROM public.cross_congregation_match_notifications, cid
    WHERE triggering_congregation_id = cid.id OR matched_congregation_id = cid.id
) t
ORDER BY s;
