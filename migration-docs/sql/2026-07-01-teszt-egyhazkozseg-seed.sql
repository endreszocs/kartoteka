-- ============================================================================
-- 2026-07-01 — TESZT ORG-HIERARCHIA: Teszt Egyházkerület → Egyházmegye → gyülekezet
-- ============================================================================
-- CÉL: biztonságos teszt-környezet, hogy éles adat SÉRÜLÉSE nélkül próbálhassuk a
--   nyugtaszámozást / autofillt / nyugtafigyelőt / második-email hozzáférést.
--
-- FIX UUID-k (felismerhető „7e57” = test előtag) — a teardown ezekre épül:
--   Egyházkerület (district)   = 7e570000-0000-4000-8000-000000000001
--   Egyházmegye   (diocese)    = 7e570000-0000-4000-8000-000000000002
--   gyülekezet    (congregation)= 7e570000-0000-4000-8000-000000000003
--
-- A BLOKKOKAT külön futtasd. BLOCK 1 mindig; BLOCK 2/3 opcionális; a TEARDOWN a végén
--   MINDENT visszabont (a teszt gyülekezet összes adatával együtt).
--
-- Séma-tények: districts (csak name kötelező), dioceses (name; district_id FK, nullable),
--   congregations (name; diocese_id FK, nullable; welcome-varázsló bypass-hoz kell:
--   name/nev_hu + varos/cim + eves_jarulek>0 + jarulek_hatarid MM-DD).
--   A bevétel/kiadás kategóriák GLOBÁLISAK (nem per-congregation) — külön nem kell seed.
--   bealitas és chitanta_tomb NEM kell a készpénzes rögzítéshez.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCK 1 — Org-hierarchia (idempotens, ON CONFLICT (id) DO NOTHING)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.districts (id, name)
VALUES ('7e570000-0000-4000-8000-000000000001', 'Teszt Egyházkerület')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dioceses (id, district_id, name, cim_orszag)
VALUES ('7e570000-0000-4000-8000-000000000002',
        '7e570000-0000-4000-8000-000000000001',
        'Teszt Egyházmegye', 'Románia')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.congregations
  (id, name, nev_hu, district, egyhazmegye, diocese_id, country,
   varos, megye, cim, eves_jarulek, jarulek_hatarid, status)
VALUES
  ('7e570000-0000-4000-8000-000000000003',
   'Teszt gyülekezet', 'Teszt gyülekezet',
   'Teszt Egyházkerület', 'Teszt Egyházmegye',
   '7e570000-0000-4000-8000-000000000002', 'Románia',
   'Tesztváros', 'Teszt megye', 'Teszt utca 1.', 100, '07-01', 'active')
ON CONFLICT (id) DO NOTHING;

-- Ellenőrzés:
SELECT c.id, c.name, c.diocese_id, d.name AS egyhazmegye, dt.name AS egyhazkerulet
FROM public.congregations c
LEFT JOIN public.dioceses d  ON d.id = c.diocese_id
LEFT JOIN public.districts dt ON dt.id = d.district_id
WHERE c.id = '7e570000-0000-4000-8000-000000000003';


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCK 2 (OPCIONÁLIS) — egy MÁR REGISZTRÁLT email hozzárendelése a teszt gyülekezethez
-- Így be tudsz lépni és látod a teszt-adatokat. ELŐBB regisztráld az emailt a normál
-- belépési flow-n (vagy Google-lel), UTÁNA futtasd ezt.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_email text := lower('teszt-lelkesz@example.com');                 -- << ÍRD ÁT
  v_cong  uuid := '7e570000-0000-4000-8000-000000000003';
  v_uid   uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_email;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nincs ilyen auth user: %. Előbb regisztráld a normál belépésen, majd futtasd újra.', v_email;
  END IF;

  UPDATE public.profiles
     SET congregation_id         = v_cong,
         status                  = 'active',
         full_name               = COALESCE(NULLIF(full_name, ''), 'Teszt Lelkész'),
         onboarding_completed_at  = COALESCE(onboarding_completed_at, now()),
         walkthrough_completed    = true,
         role                    = CASE WHEN role IN ('lelkesz','konyvelo') THEN role ELSE 'lelkesz' END
   WHERE id = v_uid;

  IF NOT EXISTS (SELECT 1 FROM public.profile_roles
                  WHERE profile_id = v_uid AND scope = 'congregation' AND scope_id = v_cong) THEN
    INSERT INTO public.profile_roles (profile_id, scope, scope_id, role, approval_status, active, approved_at)
    VALUES (v_uid, 'congregation', v_cong, 'lelkesz', 'approved', true, now());
  ELSE
    UPDATE public.profile_roles
       SET approval_status = 'approved', active = true, approved_at = COALESCE(approved_at, now())
     WHERE profile_id = v_uid AND scope = 'congregation' AND scope_id = v_cong;
  END IF;

  RAISE NOTICE 'Teszt user hozzárendelve: % -> teszt gyülekezet', v_email;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCK 3 (OPCIONÁLIS) — minta készpénzes nyugták (mindkét szám + a nyugtafigyelő próbája)
-- Szükséges: BLOCK 2 lefutott (a userid-hez) ÉS van globális befizetescel kategória.
-- Beszúr: Irat sz. 1,2,3,4,5 (folytonos) + Irat sz. 7 (200007) → SZÁNDÉKOS hézag a 6-nál,
--   + egy tükrözött legacy sor (iratszam=nyugta=115019) → ezt a JAVÍTOTT figyelő KIHAGYJA,
--   tehát NEM keletkezik ~115000-es hamis hézag. A javított figyelő eredménye: „hiányzó: 6”.
-- Marker: megjegyzes = '__TESZT_FIXTURE__' (a teardown ez alapján is takarít).
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_email text := lower('teszt-lelkesz@example.com');                 -- << UGYANAZ mint BLOCK 2
  v_cong  uuid := '7e570000-0000-4000-8000-000000000003';
  v_uid   uuid;
  v_cel   integer;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_email;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nincs ilyen auth user: % (BLOCK 2 kell előbb).', v_email; END IF;

  SELECT id INTO v_cel FROM public.befizetescel ORDER BY id LIMIT 1;
  IF v_cel IS NULL THEN
    RAISE EXCEPTION 'Üres a globális befizetescel katalógus — előbb seedeld (2026-04-17-seed-befizetescel-kiadascel.sql) vagy a UI „Kategóriák létrehozása” gombja.';
  END IF;

  -- idempotens: előbb töröljük a korábbi fixture-sorokat
  DELETE FROM public.befizetes
   WHERE congregation_id = v_cong AND megjegyzes = '__TESZT_FIXTURE__';

  INSERT INTO public.befizetes
    (xkey, forrasa, id_befizetescel, datum, osszeg, nyugta, iratszam, irattipus,
     csalad, deleted, fizetettev, userid, congregation_id, megjegyzes)
  VALUES
    (gen_random_uuid()::text, 'Teszt befizető 1', v_cel, DATE '2025-03-01', 100, '1', '200001', 'Készpénz', false, false, 2025, v_uid, v_cong, '__TESZT_FIXTURE__'),
    (gen_random_uuid()::text, 'Teszt befizető 2', v_cel, DATE '2025-03-05', 100, '2', '200002', 'Készpénz', false, false, 2025, v_uid, v_cong, '__TESZT_FIXTURE__'),
    (gen_random_uuid()::text, 'Teszt befizető 3', v_cel, DATE '2025-03-10', 100, '3', '200003', 'Készpénz', false, false, 2025, v_uid, v_cong, '__TESZT_FIXTURE__'),
    (gen_random_uuid()::text, 'Teszt befizető 4', v_cel, DATE '2025-03-15', 100, '4', '200004', 'Készpénz', false, false, 2025, v_uid, v_cong, '__TESZT_FIXTURE__'),
    (gen_random_uuid()::text, 'Teszt befizető 5', v_cel, DATE '2025-03-20', 100, '5', '200005', 'Készpénz', false, false, 2025, v_uid, v_cong, '__TESZT_FIXTURE__'),
    -- SZÁNDÉKOS hézag: Irat sz. 6 kimarad → a javított figyelő ezt (és csak ezt) jelzi
    (gen_random_uuid()::text, 'Teszt befizető 7', v_cel, DATE '2025-03-30', 100, '7', '200007', 'Készpénz', false, false, 2025, v_uid, v_cong, '__TESZT_FIXTURE__'),
    -- Tükrözött legacy sor (Kerületi=Irat=115019) → a javított figyelő KIHAGYJA (nincs hamis 115k hézag)
    (gen_random_uuid()::text, 'Legacy tükör',     v_cel, DATE '2025-01-01', 100, '115019', '115019', 'Készpénz', false, false, 2025, v_uid, v_cong, '__TESZT_FIXTURE__');

  RAISE NOTICE 'Minta nyugták beszúrva (7 sor). A javított nyugtafigyelő várt jelzése: hiányzó Irat sz. = 6.';
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- TEARDOWN — a teszt gyülekezet ÉS minden hozzá tartozó adat teljes visszabontása.
-- Egyetlen tranzakció (DO block). A séma szerint NINCS ON DELETE CASCADE, ezért
-- minden gyereksort kézzel törlünk, gyerek→szülő sorrendben. A teszt user profilját
-- NEM töröljük, csak leválasztjuk (congregation_id=NULL), hogy az auth user megmaradjon.
-- Ha egy tábla nálad nem létezik (schema drift), kommentezd ki az adott sort.
-- ════════════════════════════════════════════════════════════════════════════
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
  -- G) Presbiteri jegyzőkönyvek (FK nélkül, kézi)
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
  -- A teszt user MEGMARAD, csak leválik a törlendő gyülekezetről (a FK feloldásához):
  UPDATE public.profiles SET congregation_id = NULL WHERE congregation_id = cid;
  -- L) Beállítások, majd maga a gyülekezet
  DELETE FROM public.bealitas                WHERE congregation_id = cid;
  DELETE FROM public.congregations           WHERE id = cid;
  -- M) Egyházmegye + kerület — CSAK ha üresek (nem tartozik hozzájuk más)
  DELETE FROM public.dioceses
    WHERE id = did
      AND NOT EXISTS (SELECT 1 FROM public.congregations c WHERE c.diocese_id = did)
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.diocese_id = did);
  DELETE FROM public.districts
    WHERE id = dtid
      AND NOT EXISTS (SELECT 1 FROM public.dioceses dd WHERE dd.district_id = dtid)
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.district_id = dtid);

  RAISE NOTICE 'Teszt gyülekezet (és a hozzá tartozó adatok) visszabontva.';
END $$;
