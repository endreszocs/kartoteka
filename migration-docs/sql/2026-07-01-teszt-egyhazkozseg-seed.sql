-- ============================================================================
-- 2026-07-01 — TESZT ORG-HIERARCHIA (CSAK LÉTREHOZÁS) — biztonságos teszt-környezet
-- ============================================================================
-- Ez a fájl CSAK LÉTREHOZ (nem töröl). Nyugodtan futtasd EGYBEN:
--   • BLOCK 1 mindig lefut → létrejön a Teszt Egyházkerület/Egyházmegye/gyülekezet.
--   • BLOCK 2/3 CSAK akkor tesz valamit, ha megadtad egy MÁR REGISZTRÁLT email címét;
--     ha nincs ilyen user, NEM hibázik — csak kihagyja egy üzenettel (NoTICE).
-- A visszabontás KÜLÖN fájlban: 2026-07-01-teszt-egyhazkozseg-teardown.sql
--
-- FIX UUID-k (felismerhető „7e57” = test):
--   Egyházkerület = 7e570000-0000-4000-8000-000000000001
--   Egyházmegye   = 7e570000-0000-4000-8000-000000000002
--   gyülekezet    = 7e570000-0000-4000-8000-000000000003
--
-- Az audit szerint: a kategóriák GLOBÁLISAK (nem kell seed); bealitas és chitanta_tomb
--   NEM kell a készpénzes rögzítéshez; a Kerületi sz. autofill előzmény nélkül 1-ről indul.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCK 1 — Org-hierarchia (idempotens). MINDIG futtatható, nem hibázik.
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


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCK 2 (OPCIONÁLIS) — egy MÁR REGISZTRÁLT email hozzárendelése a teszt gyülekezethez.
-- Ha nincs ilyen user, NEM hibázik — kihagyja. Előbb regisztráld az emailt a normál
-- belépésen, írd be ide, és futtasd újra EZT a blokkot.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_email text := lower('teszt-lelkesz@example.com');                 -- << ÍRD ÁT egy VALÓDI, már regisztrált emailre
  v_cong  uuid := '7e570000-0000-4000-8000-000000000003';
  v_uid   uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_email;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'KIHAGYVA (BLOCK 2): nincs regisztrált user ezzel: %. Regisztráld a belépésen, majd futtasd újra EZT a blokkot.', v_email;
    RETURN;
  END IF;

  UPDATE public.profiles
     SET congregation_id        = v_cong,
         status                 = 'active',
         full_name              = COALESCE(NULLIF(full_name, ''), 'Teszt Lelkész'),
         onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
         walkthrough_completed   = true,
         role                   = CASE WHEN role IN ('lelkesz','konyvelo') THEN role ELSE 'lelkesz' END
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

  RAISE NOTICE 'OK (BLOCK 2): % hozzárendelve a Teszt gyülekezethez.', v_email;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCK 3 (OPCIONÁLIS) — minta készpénzes nyugták (mindkét szám + a nyugtafigyelő próbája).
-- Szükséges: BLOCK 2 lefutott (ugyanaz az email) ÉS van globális befizetescel kategória.
-- Ha bármelyik hiányzik, NEM hibázik — kihagyja.
-- Beszúr: Irat sz. 1..5 (folytonos) + Irat sz. 7 (SZÁNDÉKOS hézag a 6-nál) + tükrözött 115019
--   legacy sor → a JAVÍTOTT figyelő csak a valós „hiányzó: 6"-ot jelzi (nem a ~115000-est).
-- Marker: megjegyzes = '__TESZT_FIXTURE__'.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_email text := lower('teszt-lelkesz@example.com');                 -- << UGYANAZ mint BLOCK 2
  v_cong  uuid := '7e570000-0000-4000-8000-000000000003';
  v_uid   uuid;
  v_cel   integer;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_email;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'KIHAGYVA (BLOCK 3): nincs user (% ) — előbb BLOCK 2.', v_email; RETURN;
  END IF;
  SELECT id INTO v_cel FROM public.befizetescel ORDER BY id LIMIT 1;
  IF v_cel IS NULL THEN
    RAISE NOTICE 'KIHAGYVA (BLOCK 3): üres a globális befizetescel katalógus — seedeld a kategóriákat, majd újra.'; RETURN;
  END IF;

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
    (gen_random_uuid()::text, 'Teszt befizető 7', v_cel, DATE '2025-03-30', 100, '7', '200007', 'Készpénz', false, false, 2025, v_uid, v_cong, '__TESZT_FIXTURE__'),
    (gen_random_uuid()::text, 'Legacy tükör',     v_cel, DATE '2025-01-01', 100, '115019', '115019', 'Készpénz', false, false, 2025, v_uid, v_cong, '__TESZT_FIXTURE__');

  RAISE NOTICE 'OK (BLOCK 3): 7 minta nyugta beszúrva. A javított figyelő várt jelzése: hiányzó Irat sz. = 6.';
END $$;


-- Ellenőrzés (mit hoztunk létre):
SELECT c.id, c.name, d.name AS egyhazmegye, dt.name AS egyhazkerulet,
       (SELECT count(*) FROM public.befizetes b WHERE b.congregation_id = c.id) AS befizetes_db
FROM public.congregations c
LEFT JOIN public.dioceses d  ON d.id = c.diocese_id
LEFT JOIN public.districts dt ON dt.id = d.district_id
WHERE c.id = '7e570000-0000-4000-8000-000000000003';
