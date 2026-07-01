-- ============================================================================
-- 2026-07-01 — TESZT ORG-HIERARCHIA TEARDOWN (teljes visszabontás)
-- ============================================================================
-- A teszt gyülekezet (7e57…0003) ÉS minden hozzá tartozó adat törlése, gyerek→szülő
-- sorrendben (a sémában NINCS ON DELETE CASCADE, ezért mindent kézzel). A teszt user(ek)
-- profilja MEGMARAD, csak leválik a gyülekezetről. Az egyházmegye/kerület CSAK akkor
-- törlődik, ha üres. Egyetlen tranzakció — ha hibázik, semmi nem törlődik.
--
-- ⚠️ CSAK a teszt gyülekezetre fut (fix UUID). Ha egy tábla nálad nem létezik (schema
--    drift), kommentezd ki az adott DELETE sort és futtasd újra.
-- ============================================================================
DO $$
DECLARE
  cid  uuid := '7e570000-0000-4000-8000-000000000003';  -- teszt gyülekezet
  did  uuid := '7e570000-0000-4000-8000-000000000002';  -- teszt egyházmegye
  dtid uuid := '7e570000-0000-4000-8000-000000000001';  -- teszt egyházkerület
BEGIN
  -- A) Oblio / e-factura
  DELETE FROM public.oblio_kiadas_match      WHERE congregation_id = cid;
  DELETE FROM public.oblio_szamlak           WHERE congregation_id = cid;
  DELETE FROM public.oblio_fiokok            WHERE congregation_id = cid;
  -- B) Anyagmozgás + valuta
  DELETE FROM public.material_movements      WHERE congregation_id = cid;
  DELETE FROM public.materials               WHERE congregation_id = cid;
  DELETE FROM public.valuta_atert            WHERE congregation_id = cid;
  -- C) Temető-lánc
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
  DELETE FROM public.sirhelytemeto           WHERE congregation_id = cid;
  -- D) Kiadás kísérőív
  DELETE FROM public.kiadasikiseroiv
    WHERE id_kiadas IN (SELECT id FROM public.kiadas WHERE congregation_id = cid);
  -- E) Pénzügyi mag
  DELETE FROM public.befizetes               WHERE congregation_id = cid;
  DELETE FROM public.kiadas                  WHERE congregation_id = cid;
  DELETE FROM public.belsomozgas             WHERE congregation_id = cid;
  DELETE FROM public.bankszamla_nyito_egyenleg WHERE congregation_id = cid;
  DELETE FROM public.bankszamlak             WHERE congregation_id = cid;
  DELETE FROM public.koltsegvetes            WHERE congregation_id = cid;
  DELETE FROM public.congregation_annual_fees WHERE congregation_id = cid;
  DELETE FROM public.transactions            WHERE congregation_id = cid;
  DELETE FROM public.berleti_szerzodes       WHERE congregation_id = cid;
  DELETE FROM public.chitanta_tombok         WHERE congregation_id = cid;
  -- F) Személyhez kötött anyakönyv / család
  DELETE FROM public.gyerek
    WHERE id_csalad IN (SELECT c.id FROM public.csalad c
                        JOIN public.szemely s ON s.id IN (c.id_ferfi, c.id_no)
                        WHERE s.congregation_id = cid);
  DELETE FROM public.felmentes               WHERE congregation_id = cid;
  DELETE FROM public.csaladlatogatas         WHERE congregation_id = cid;
  DELETE FROM public.presbiter               WHERE congregation_id = cid;
  DELETE FROM public.attert                  WHERE congregation_id = cid;
  DELETE FROM public.bekoltozott             WHERE congregation_id = cid;
  DELETE FROM public.elkoltozott             WHERE congregation_id = cid OR hova_congregation_id = cid;
  DELETE FROM public.kitert                  WHERE congregation_id = cid;
  DELETE FROM public.keresztseg              WHERE congregation_id = cid;
  DELETE FROM public.konfirmalas             WHERE congregation_id = cid;
  DELETE FROM public.hazassag                WHERE congregation_id = cid;
  DELETE FROM public.temetes                 WHERE congregation_id = cid;
  DELETE FROM public.leltar_tetelek          WHERE congregation_id = cid;
  DELETE FROM public.csalad
    WHERE id_ferfi IN (SELECT id FROM public.szemely WHERE congregation_id = cid)
       OR id_no    IN (SELECT id FROM public.szemely WHERE congregation_id = cid);
  DELETE FROM public.csoport                 WHERE congregation_id = cid;
  UPDATE public.szemely SET id_apja = NULL, id_anyja = NULL WHERE congregation_id = cid;
  DELETE FROM public.szemely                 WHERE congregation_id = cid;
  -- G) Presbiteri jegyzőkönyvek
  DELETE FROM public.jegyzokonyv_hatarozatok
    WHERE jegyzokonyv_id IN (SELECT id FROM public.presbiteri_jegyzokonyvek WHERE congregation_id = cid);
  DELETE FROM public.jegyzokonyv_napirendi_pontok
    WHERE jegyzokonyv_id IN (SELECT id FROM public.presbiteri_jegyzokonyvek WHERE congregation_id = cid);
  DELETE FROM public.jegyzokonyv_resztvevok
    WHERE jegyzokonyv_id IN (SELECT id FROM public.presbiteri_jegyzokonyvek WHERE congregation_id = cid);
  DELETE FROM public.presbiteri_jegyzokonyvek WHERE congregation_id = cid;
  -- H) Nyilvános oldal
  DELETE FROM public.public_magazine_issues  WHERE congregation_id = cid;
  DELETE FROM public.public_magazines        WHERE congregation_id = cid;
  DELETE FROM public.public_posts            WHERE congregation_id = cid;
  DELETE FROM public.public_sites            WHERE congregation_id = cid;
  -- I) Egyéb per-congregation
  DELETE FROM public.munkanaplo              WHERE congregation_id = cid;
  DELETE FROM public.gyulekezeti_programok   WHERE congregation_id = cid;
  DELETE FROM public.iktato_sablonok         WHERE congregation_id = cid;
  DELETE FROM public.iktato                  WHERE congregation_id = cid;
  DELETE FROM public.import_logs             WHERE congregation_id = cid;
  DELETE FROM public.jarulek_kedvezmeny      WHERE congregation_id = cid;
  DELETE FROM public.support_messages        WHERE congregation_id = cid;
  DELETE FROM public.annual_reports          WHERE congregation_id = cid;
  DELETE FROM public.document_submissions    WHERE congregation_id = cid;
  DELETE FROM public.congregation_subscriptions WHERE congregation_id = cid;
  -- J) Értesítések + admin-kérések
  DELETE FROM public.ertesitesek             WHERE congregation_id = cid
     OR admin_request_id IN (SELECT id FROM public.admin_access_requests WHERE congregation_id = cid);
  DELETE FROM public.admin_access_requests   WHERE congregation_id = cid;
  -- K) Profil-hozzárendelések (a userek MEGMARADNAK, csak leválnak)
  DELETE FROM public.profile_congregations   WHERE congregation_id = cid;
  DELETE FROM public.profile_roles           WHERE scope = 'congregation' AND scope_id = cid;
  UPDATE public.profiles SET congregation_id = NULL WHERE congregation_id = cid;
  -- L) Beállítások, majd maga a gyülekezet
  DELETE FROM public.bealitas                WHERE congregation_id = cid;
  DELETE FROM public.congregations           WHERE id = cid;
  -- M) Egyházmegye + kerület — CSAK ha üresek
  DELETE FROM public.dioceses
    WHERE id = did
      AND NOT EXISTS (SELECT 1 FROM public.congregations c WHERE c.diocese_id = did)
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.diocese_id = did);
  DELETE FROM public.districts
    WHERE id = dtid
      AND NOT EXISTS (SELECT 1 FROM public.dioceses dd WHERE dd.district_id = dtid)
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.district_id = dtid);

  RAISE NOTICE 'Teszt gyülekezet (és minden adata) visszabontva.';
END $$;
