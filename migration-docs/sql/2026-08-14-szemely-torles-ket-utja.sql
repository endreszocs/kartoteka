-- ═══════════════════════════════════════════════════════════════════════════
--  SZEMÉLY-TÖRLÉS KÉT ÚTJA — ELŐZETES kapcsolat-ellenőrzés (CSAK OLVASÓ)
--  (2026-08-14, Endre 1. döntése — 1. ütem)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  A DÖNTÉS: a szemely tábla NEM kap deleted oszlopot. Két kivezetési út:
--   (1) ELHUNYT → temetési anyakönyv (ez már ma működik: removeMember
--       'meghalt' ága + saveBurial);
--   (2) HIBÁS FELVITEL → kapcsolat-ellenőrzés: ha SEMMI védett kapcsolat
--       nincs, naplózott végleges törlés; ha van, láthatatlanná tétel.
--
--  ⚠️ MIT AD EZ A FÁJL — ÉS MIT NEM (SZÁNDÉKOS SZŰKÍTÉS, 2026-08-14 este):
--  A bírálói kör kimutatta, hogy a tagnyilvantartas_tag_torles törlő
--  függvénynek a repóban KÉT verziója él (2026-06-10 alap + 2026-07-17
--  tagi-portál kompat, zár-logikával és kötelező markerrel, amire a még
--  függőben lévő portál-lánc preflightja épít), és az ÉLŐ verzió ismeretlen.
--  Ezért ez a fájl a törlő függvényhez NEM NYÚL — kizárólag két új, CSAK
--  OLVASÓ függvényt ad (az előzetes kijelzéshez), amelyek semmilyen lánccal
--  nem ütköznek. A törlő RPC katalógus-alapú v3-ja (+ pillanatkép-napló) a
--  portál-lánccal EGYÜTT, külön körben készül. Az ellenőrzés végén egy
--  tájékoztató sor MEGMONDJA, melyik törlő-verzió él most.
--
--  A felület enélkül a fájl nélkül is működik (fail-soft), ezzel a fájllal
--  pedig a törlés-dialógus a megerősítés ELŐTT kimondja: végleges törlés
--  lesz-e, vagy elrejtés — és pontosan mi védi a személyt.
--
--  ⚠️ FUTTATÁSI SORREND: ez a fájl fusson le ELŐBB, mint a tagi-portál
--  P0-lánc (2026-07-17-member-portal-p0-auth-isolation.sql) — annak az
--  allowlist-preflightja mostantól elvárja a szemely_kapcsolatok létezését,
--  és fordított sorrendben hangosan (kár nélkül) elhasal.
--
--  ⚠️ EGY TRANZAKCIÓ — vagy minden lépés lefut, vagy semmi. Újrafuttatható.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) BELSŐ katalógus-függvény ───────────────────────────────────────────
-- Nem publikus: csak a lenti ellenőrző RPC hívja (a tulajdonos jogán) — és a
-- jövőbeli törlő-v3 fogja. Jogosultság-ellenőrzés SZÁNDÉKOSAN nincs benne —
-- az a hívóké.
CREATE OR REPLACE FUNCTION public.szemely_kapcsolat_lista(p_szemely_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- (kulcs, cimke, tabla, feltetel, mod) — a feltétel $1 = szemely.id,
  -- $2 = szemely.cnp. mod: 'blokkolo' → elrejtés | 'vele' → a törléssel
  -- együtt eltűnik/nullázódik (tájékoztató).
  katalogus text[][] := ARRAY[
    -- BLOKKOLÓ kapcsolatok (bármelyik > 0 → nincs fizikai törlés)
    ARRAY['befizetes_elo',    'Befizetés',                                'befizetes',        'id_szemely = $1 AND deleted IS DISTINCT FROM true', 'blokkolo'],
    ARRAY['befizetes_kuka',   'Befizetés a kukában',                      'befizetes',        'id_szemely = $1 AND deleted = true',                'blokkolo'],
    ARRAY['kiadas_atvevo',    'Kiadás (átvevőként)',                      'kiadas',           'atvevoid = $1',                                     'blokkolo'],
    ARRAY['keresztseg',       'Keresztelési anyakönyv',                   'keresztseg',       'id_szemely = $1',                                   'blokkolo'],
    ARRAY['konfirmalas',      'Konfirmációi anyakönyv',                   'konfirmalas',      'id_szemely = $1',                                   'blokkolo'],
    ARRAY['hazassag',         'Házassági anyakönyv',                      'hazassag',         'id_ferfi = $1 OR id_no = $1',                       'blokkolo'],
    ARRAY['temetes',          'Temetési anyakönyv',                       'temetes',          'id_szemely = $1',                                   'blokkolo'],
    ARRAY['csalad',           'Családi karton (házastársként)',           'csalad',           'id_ferfi = $1 OR id_no = $1',                       'blokkolo'],
    ARRAY['sirhelyberles',    'Sírhelybérlés (bérlőként)',                'sirhelyberles',    'berloid = $1',                                      'blokkolo'],
    ARRAY['sirhelyelhunyt',   'Sírhely-nyilvántartás (elhunytként)',      'sirhelyelhunyt',   'id_szemely = $1',                                   'blokkolo'],
    ARRAY['leltar_felelos',   'Leltári tétel (felelősként)',              'leltar_tetelek',   'felelos_szemely_id = $1',                           'blokkolo'],
    ARRAY['berleti_szerzodes','Bérleti szerződés',                        'berleti_szerzodes','id_szemely = $1',                                   'blokkolo'],
    ARRAY['szulo_lanc',       'Szülőként hivatkozik rá másik személy',    'szemely',          'id <> $1 AND (id_apja = $2 OR id_anyja = $2)',      'blokkolo'],
    ARRAY['portal_link',      'Aktív tagi portál összekötés',             'member_person_links',           'person_id = $1 OR live_person_id = $1','blokkolo'],
    ARRAY['portal_kerelem',   'Tagi portál módosítási kérelem',           'member_person_change_requests', 'person_id = $1',                       'blokkolo'],
    -- VELE TÖRLŐDŐ kapcsolatok (a törlő RPC explicit vagy CASCADE viszi)
    ARRAY['gyerek',           'Gyermek-bejegyzés',                        'gyerek',           'id_szemely = $1',                                   'vele'],
    ARRAY['presbiter',        'Presbiteri tisztség',                      'presbiter',        'id_szemely = $1',                                   'vele'],
    ARRAY['felmentes',        'Járulék-felmentés',                        'felmentes',        'id_szemely = $1',                                   'vele'],
    ARRAY['haztartas_tag',    'Háztartás-tagság',                         'haztartas_tag',    'id_szemely = $1',                                   'vele'],
    ARRAY['szemely_kapcsolat','Rögzített személyi kapcsolat',             'szemely_kapcsolat','id_szemely_1 = $1 OR id_szemely_2 = $1',            'vele'],
    ARRAY['bekoltozott',      'Beköltözési előzmény',                     'bekoltozott',      'id_szemely = $1',                                   'vele'],
    ARRAY['elkoltozott',      'Elköltözési előzmény',                     'elkoltozott',      'id_szemely = $1',                                   'vele'],
    ARRAY['attert',           'Áttérési előzmény',                        'attert',           'id_szemely = $1',                                   'vele'],
    ARRAY['kitert',           'Kitérési előzmény',                        'kitert',           'id_szemely = $1',                                   'vele'],
    ARRAY['transfer_ertesites','Átjelentkezési értesítés',                'member_transfer_notifications', 'szemely_id = $1',                      'vele'],
    ARRAY['validacios_jelzes','Adat-ellenőrzési jelzés',                  'member_validation_errors',      'member_id = $1',                       'vele'],
    -- 2026-08-14 bírálói pótlás: ez a kettő eddig kimaradt — CASCADE ill.
    -- SET NULL, tehát nem blokkolnak, de a teljességi ígéret rájuk is áll.
    ARRAY['gyulkozi_egyezes', 'Gyülekezetközi egyezés-értesítés',         'cross_congregation_match_notifications', 'triggering_szemely_id = $1 OR matched_szemely_id = $1', 'vele'],
    ARRAY['csalad_link_naplo','Család-összekötési napló (a hivatkozás nullázódik)', 'family_link_audit', 'szemely_id = $1',                        'vele']
  ];
  sor         text[];
  v_cnp       text;
  v_darab     bigint;
  v_blokkolo  jsonb := '[]'::jsonb;
  v_vele      jsonb := '[]'::jsonb;
  v_blokk_db  bigint := 0;
  v_vele_db   bigint := 0;
BEGIN
  SELECT NULLIF(trim(cnp), '') INTO v_cnp FROM public.szemely WHERE id = p_szemely_id;

  FOREACH sor SLICE 1 IN ARRAY katalogus LOOP
    -- CNP-lánc: csak akkor értelmezhető, ha a személynek van CNP-je
    IF sor[1] = 'szulo_lanc' AND v_cnp IS NULL THEN
      CONTINUE;
    END IF;
    IF to_regclass('public.' || sor[3]) IS NULL THEN
      CONTINUE; -- a tábla nem létezik → hivatkozás sem lehet
    END IF;
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE ', sor[3]) || sor[4]
        INTO v_darab USING p_szemely_id, v_cnp;
    EXCEPTION WHEN undefined_column THEN
      CONTINUE; -- az oszlop nem létezik → FK sincs → hivatkozás sem lehet
    END;
    IF v_darab > 0 THEN
      IF sor[5] = 'blokkolo' THEN
        v_blokkolo := v_blokkolo || jsonb_build_array(
          jsonb_build_object('kulcs', sor[1], 'cimke', sor[2], 'darab', v_darab));
        v_blokk_db := v_blokk_db + v_darab;
      ELSE
        v_vele := v_vele || jsonb_build_array(
          jsonb_build_object('kulcs', sor[1], 'cimke', sor[2], 'darab', v_darab));
        v_vele_db := v_vele_db + v_darab;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'blokkolo', v_blokkolo, 'blokkolo_db', v_blokk_db,
    'vele_torlodik', v_vele, 'vele_db', v_vele_db);
END;
$$;

-- BELSŐ függvény: senki nem hívhatja közvetlenül (az ellenőrző RPC — és a
-- jövőbeli törlő-v3 — a tulajdonos jogán éri el).
REVOKE ALL ON FUNCTION public.szemely_kapcsolat_lista(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.szemely_kapcsolat_lista(integer) FROM anon;
REVOKE ALL ON FUNCTION public.szemely_kapcsolat_lista(integer) FROM authenticated;

COMMENT ON FUNCTION public.szemely_kapcsolat_lista(integer) IS
  '2026-08-14 (1. döntés): a személy összes ismert hivatkozásának katalógusa '
  '(blokkoló + vele törlődő). BELSŐ — a szemely_kapcsolatok hívja. '
  'Új szemely-FK-nál IDE is fel kell venni!';

-- ─── 2) Publikus, CSAK OLVASÓ ellenőrző RPC ────────────────────────────────
CREATE OR REPLACE FUNCTION public.szemely_kapcsolatok(p_szemely_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cong uuid;
BEGIN
  -- Fail-closed (2026-08-11 hardening): névtelen hívó azonnal kiesik.
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  SELECT congregation_id INTO v_cong FROM public.szemely WHERE id = p_szemely_id;
  IF NOT FOUND OR v_cong IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF NOT public.current_user_can_access_congregation(v_cong) THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  RETURN jsonb_build_object('status', 'ok') || public.szemely_kapcsolat_lista(p_szemely_id);
END;
$$;

REVOKE ALL ON FUNCTION public.szemely_kapcsolatok(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.szemely_kapcsolatok(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.szemely_kapcsolatok(integer) TO authenticated;

COMMENT ON FUNCTION public.szemely_kapcsolatok(integer) IS
  '2026-08-14 (1. döntés): CSAK OLVASÓ kapcsolat-ellenőrzés a törlés-dialógus '
  'ELŐZETES kijelzéséhez. Semmit nem módosít. A tagi-portál P0-lánc '
  'allowlistjében szerepel (2026-07-17-member-portal-p0-auth-isolation.sql).';

COMMIT;

-- ─── ELLENŐRZÉS (csak olvas) ────────────────────────────────────────────────
SELECT sorrend, mit_mer, ertek
FROM (
  SELECT 1 AS sorrend, 'szemely_kapcsolat_lista létezik (belső katalógus)' AS mit_mer,
         CASE WHEN to_regprocedure('public.szemely_kapcsolat_lista(integer)') IS NOT NULL
              THEN '✅' ELSE '❌' END AS ertek
  UNION ALL SELECT 2, 'szemely_kapcsolatok létezik (előzetes ellenőrző RPC)',
         CASE WHEN to_regprocedure('public.szemely_kapcsolatok(integer)') IS NOT NULL
              THEN '✅' ELSE '❌' END
  UNION ALL SELECT 3, 'anon NEM hívhatja az ellenőrző RPC-t',
         CASE WHEN NOT has_function_privilege('anon', 'public.szemely_kapcsolatok(integer)', 'EXECUTE')
              THEN '✅' ELSE '❌' END
  UNION ALL SELECT 4, 'authenticated NEM hívhatja a belső katalógust közvetlenül',
         CASE WHEN NOT has_function_privilege('authenticated', 'public.szemely_kapcsolat_lista(integer)', 'EXECUTE')
              THEN '✅' ELSE '❌' END
  UNION ALL SELECT 5, 'a törlő függvényhez ez a fájl NEM nyúlt (tájékoztató: melyik verzió él)',
         CASE
           WHEN to_regprocedure('public.tagnyilvantartas_tag_torles(integer)') IS NULL
             THEN '⚠️ NINCS törlő függvény — a 2026-06-10-es migráció nem futott le?'
           -- to_regprocedure (és NEM ::regprocedure literál-cast): a cast
           -- parse-időben oldódna fel, és hiányzó függvénynél az EGÉSZ
           -- ellenőrzés elhasalna — pont a jelentendő esetben.
           WHEN COALESCE(obj_description(to_regprocedure('public.tagnyilvantartas_tag_torles(integer)'), 'pg_proc'), '')
                LIKE '%MEMBER_PORTAL_MEMBER_DELETE_COMPAT_V1%'
             THEN 'ℹ️ a 2026-07-17-es tagi-portál KOMPAT verzió él'
           ELSE 'ℹ️ a 2026-06-10-es alap verzió él (a portál-kompat lánc még nem futott le)'
         END
) t ORDER BY sorrend;
