-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EGYHÁZKERÜLETI S1 — HATÁSKÖR-BIZTONSÁG                        2026-08-15 ║
-- ║ Fájl: migration-docs/sql/2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag  ║
-- ║ (docs/EGYHAZKERULETI-SZINT-INDITO-BRIEF-2026-08-15.md, S1 szelet)        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ ELŐFELTÉTEL: ELŐBB futtasd le a
--    2026-08-15-egyhazkeruleti-S0-allapotfelmeres.sql fájlt, és nézd meg az
--    eredményt. Ez a fájl fail-closed őrszemekkel áll le, ha az élő adatbázis
--    nem a várt állapotban van — de a 0. szakasz eredményéből ELŐRE látod.
--
-- MIT CSINÁL (három, egymástól független javítás):
--
--  (A) ÚJ SZEREP: `egyhazkeruleti_szamvevo` — a 3. szint ELLENŐRE.
--      A `profiles.role` és a `profile_roles.role` CHECK-je ma nem engedi be,
--      tehát az app-oldali szerep KIOSZTHATATLAN lenne (23514-es hibával
--      hasalna el a beszúrás). A CHECK-eket bővítjük.
--      App-tükör: apps/web/lib/auth/roles.ts (KNOWN_ROLES),
--      apps/web/lib/profile-roles/types.ts (ProfileRoleType + ROLE_LABELS).
--
--  (B) `current_user_district_olvaso_ids()` — a KERÜLETI OLVASÓ hatókör.
--      A megyei szint tanulságát tükrözi (2026-08-11, számvevő-kör): az
--      ÍRÁS és az OLVASÁS KÉT KÜLÖN függvény, hogy az ellenőr láthasson
--      anélkül, hogy írhatna. Betűhű párja a
--      `current_user_diocese_olvaso_ids()`-nek.
--        · írás:    current_user_district_ids()         (egyhazkeruleti_admin)
--        · olvasás: current_user_district_olvaso_ids()  (+ egyhazkeruleti_szamvevo)
--      App-tükör: apps/web/lib/auth/level-scope.ts
--      (DISTRICT_WRITE_ROLES / DISTRICT_READ_ROLES) — a két réteg így nem
--      húzhat szét. Ez pontosan az a divergencia, ami a MEGYEI számvevőnél
--      ÜRES KÉPERNYŐT okozott hibaüzenet nélkül.
--
--  (C) ⛔ ÉLŐ SZIVÁRGÁS ZÁRÁSA: a `dioceses` hivatalos adatai (CIF, IBAN,
--      pecsét-URL, aláírás-URL, vezetők nevei) MA BEJELENTKEZÉS NÉLKÜL
--      kiolvashatók, mert az `anon` szerepnek TÁBLA-szintű SELECT joga van,
--      RLS-oldalon pedig USING(true) policy áll. Ugyanez a felállás vár a
--      `districts`-re, amint az S2 szelet megadja neki a hivatalos identitást.
--
--      MIÉRT NEM A POLICY ELDOBÁSA A MEGOLDÁS: az anonim olvasásra SZÜKSÉG
--      VAN. A nyilvános hozzáférés-kérő űrlap (components/public/
--      access-request-form.tsx:92-93) és az OAuth-kiegészítő űrlap
--      (components/auth/oauth-complete-form.tsx:90-91) bejelentkezés ELŐTT
--      tölti a legördülőket. Ha eldobjuk a policy-t, a REGISZTRÁCIÓ ÁLL LE.
--
--      A HELYES ESZKÖZ: OSZLOP-SZINTŰ GRANT. Az `anon` pontosan azokat az
--      oszlopokat kapja meg, amiket a két űrlap ténylegesen kér:
--        · districts → (id, name)
--        · dioceses  → (id, name, district_id)
--      Ez ráadásul FAIL-CLOSED A JÖVŐRE: az S2-ben érkező `cif`, `iban`,
--      `pecset_url`, `alairas_url` oszlopokra az anon NEM kap jogot
--      automatikusan — az oszlop-szintű GRANT nem terjed ki az új oszlopokra.
--
-- MI NINCS BENNE (szándékosan, külön fájlban):
--   · A 11. csapda (`profile_roles_admin_manage` hatókör nélküli USING-ága:
--     a kerületi admin az EGÉSZ ORSZÁG szerepkör-tábláját látja és törölheti).
--     Ez egy FOR ALL policy ÁTÍRÁSA — ha elrontjuk, a kerületi admin elveszti
--     a szerepkör-kezelést, vagyis rendelkezésre-állási kockázat. Előbb az S0
--     0/J-1003 sora mutassa meg az ÉLŐ alakot, és abból írjuk meg.
--     (Az app-réteg ezt MA IS őrzi: assertScopeTargetInScope minden
--     mutációs úton — lib/auth/admin-scope.ts:295.)
--   · A `dioceses` / `districts` hivatalos adatainak szűkítése a
--     BEJELENTKEZETT felhasználók felé. Ma minden bejelentkezett látja minden
--     egyházmegye CIF-jét és IBAN-ját. Ez SZÉLESEBB döntés (érinti a most
--     elkészült megyei felületeket) — az S0 0/B-260 sora megméri, és Endre
--     dönt róla.
--
-- TANULSÁGOK, AMIKRE ÉPÜL (memória-hibaosztályok):
--   · „A migration-fájl NEM bizonyíték" → 0. SZAKASZ + fail-closed őrszem.
--   · „RLS-policy a hívó szerepében fut → GRANT nélkül 403" → az új függvényre
--     explicit GRANT EXECUTE, ugyanabban a tranzakcióban, ahol létrejön.
--   · „Skalár hatókör + if(id) filter = néma szivárgás" → az új függvény
--     `COALESCE(..., '{}'::uuid[])`-cel fail-closed, és skalár-elnyomással.
--
-- ÚJ TÁBLA NEM JÖN LÉTRE → a backup_table_policy besorolást ez a fájl nem
-- érinti (a kulcsoszlop egyébként `tabla`, NEM `table_name` — lásd #172).
--
-- FUTTATÁSI SORREND (a Supabase Studio csak az UTOLSÓ utasítást mutatja!):
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS. Egyetlen SELECT, semmit nem módosít.
--       Jelöld ki CSAK ezt, futtasd, OLVASD EL.
--   2.  1. SZAKASZ — A JAVÍTÁS. Egyetlen tranzakció (BEGIN … COMMIT).
--   3.  2. SZAKASZ — ELLENŐRZÉS. Egyetlen SELECT — az eredményt küldd vissza.
--
-- IDEMPOTENS: minden lépés őrzött; akárhányszor újrafuttatható.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ║ EGYETLEN SELECT. Semmit nem módosít.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '0/A · ELŐFELTÉTEL' AS szakasz,
       'Létezik-e a kanonikus current_user_district_ids()?' AS mit,
       CASE WHEN to_regprocedure('public.current_user_district_ids()') IS NULL
            THEN '⛔ NINCS — az 1. szakasz őrszeme leáll'
            ELSE '✅ létezik' END AS ertek,
       'Ha ⛔: előbb a 2026-08-11-globalis-hozzaferes-szukites.sql fusson le. Az új OLVASÓ függvény a szerep-listáját ehhez igazítja.' AS teendo

UNION ALL
SELECT 2, '0/A · ELŐFELTÉTEL',
       'A minta: létezik-e a current_user_diocese_olvaso_ids()?',
       CASE WHEN to_regprocedure('public.current_user_diocese_olvaso_ids()') IS NULL
            THEN '⚠️ nincs — a megyei számvevő-fájl nem futott le'
            ELSE '✅ létezik (ez a betűhű minta)' END,
       'Nem blokkoló, de ha nincs, akkor a MEGYEI számvevő olvasása sem működik — érdemes együtt rendezni.'

UNION ALL
SELECT 3, '0/A · ELŐFELTÉTEL',
       'Létezik-e MÁR a current_user_district_olvaso_ids()?',
       CASE WHEN to_regprocedure('public.current_user_district_olvaso_ids()') IS NULL
            THEN '— még nincs (ez a fájl hozza létre)'
            ELSE '✅ már van (újrafuttatás: felülírja)' END,
       'Tájékoztató. A CREATE OR REPLACE idempotens.'

-- ── 0/B · A szerep-CHECK-ek mai állapota ────────────────────────────────────
UNION ALL
SELECT 10, '0/B · SZEREP-CHECK',
       'profiles.role CHECK — engedi-e már az egyhazkeruleti_szamvevo-t?',
       COALESCE((SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%egyhazkeruleti_szamvevo%'
                             THEN '✅ igen (újrafuttatás rendben)'
                             ELSE '— még nem (ez a fájl bővíti)' END
                 FROM pg_constraint
                 WHERE conrelid = to_regclass('public.profiles') AND contype = 'c'
                   AND pg_get_constraintdef(oid) LIKE '%role%' LIMIT 1),
                '⚠️ NINCS role CHECK a profiles-on'),
       'Ha nincs CHECK: az 1. szakasz nem hoz létre újat (nem szigorítunk ott, ahol eddig nem volt megszorítás) — csak jelezzük.'

UNION ALL
SELECT 11, '0/B · SZEREP-CHECK',
       'profile_roles.role CHECK — engedi-e már az egyhazkeruleti_szamvevo-t?',
       COALESCE((SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%egyhazkeruleti_szamvevo%'
                             THEN '✅ igen (újrafuttatás rendben)'
                             ELSE '— még nem (ez a fájl bővíti)' END
                 FROM pg_constraint
                 WHERE conrelid = to_regclass('public.profile_roles') AND contype = 'c'
                   -- NÉV szerint: a `LIKE '%role%'` KÉT constraintre illeszkedik
                   -- (a custom_label_check is említi a role oszlopot), és a
                   -- LIMIT 1 ORDER BY nélkül tetszőlegesen választ közülük.
                   AND conname = 'profile_roles_role_check'),
                '⚠️ NINCS role CHECK a profile_roles-on'),
       'Ugyanaz.'

UNION ALL
SELECT 12, '0/B · SZEREP-CHECK',
       'Van-e MA olyan szerep-érték, amit a bővített CHECK sem engedne?',
       COALESCE((SELECT string_agg(DISTINCT r, ', ') FROM (
                   SELECT role AS r FROM public.profile_roles
                   UNION SELECT role FROM public.profiles
                 ) x
                 WHERE r IS NOT NULL AND r NOT IN
                   ('admin','egyhazkeruleti_admin','egyhazkeruleti_szamvevo',
                    'egyhazmegyei_admin','esperes','egyhazmegyei_szamvevo',
                    'lelkesz','konyvelo','custom')),
                '✅ nincs ilyen — a CHECK-csere biztonságos'),
       '⛔ Ha van: a DROP+ADD CHECK ELHASALNA a meglévő soron. ELŐBB javítsd azokat a sorokat, csak utána futtasd az 1. szakaszt.'

-- ── 0/C · Az anon szivárgás mérése (C javítás) ──────────────────────────────
UNION ALL
SELECT 20, '0/C · ANON SZIVÁRGÁS ⛔',
       'Van-e az anon szerepnek TÁBLA-szintű SELECT joga a dioceses-en?',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.role_table_grants
                         WHERE table_schema='public' AND table_name='dioceses'
                           AND grantee='anon' AND privilege_type='SELECT')
            THEN '⛔ IGEN — a CIF, IBAN, pecsét, aláírás BEJELENTKEZÉS NÉLKÜL olvasható'
            ELSE '✅ nincs (vagy már oszlop-szintűre szűkítve)' END,
       'Az 1. szakasz oszlop-szintűre cseréli: anon → dioceses (id, name, district_id). A regisztrációs űrlap pontosan ezt a hármat kéri.'

UNION ALL
SELECT 21, '0/C · ANON SZIVÁRGÁS',
       'Mely OSZLOPOKRA van MA az anon-nak SELECT joga a dioceses-en?',
       COALESCE((SELECT string_agg(column_name, ', ' ORDER BY column_name)
                 FROM information_schema.column_privileges
                 WHERE table_schema='public' AND table_name='dioceses'
                   AND grantee='anon' AND privilege_type='SELECT'),
                '(nincs oszlop-szintű GRANT — a tábla-szintű dönt)'),
       'Tábla-szintű GRANT mellett ez a lista MINDEN oszlopot tartalmaz.'

UNION ALL
SELECT 22, '0/C · ANON SZIVÁRGÁS',
       'Milyen ÉRZÉKENY oszlopa van MA a dioceses-nek?',
       COALESCE((SELECT string_agg(column_name, ', ' ORDER BY column_name)
                 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='dioceses'
                   AND (column_name ~ '(cif|adoszam|iban|bank|pecset|alairas|email|telefon)'
                        OR column_name LIKE 'cim_%')),
                '(egy sem)'),
       'EZEK szivárognak ma anonim olvasónak. Az 1. szakasz után egyik sem lesz elérhető bejelentkezés nélkül.'

UNION ALL
SELECT 23, '0/C · ANON SZIVÁRGÁS',
       'Van-e az anon-nak TÁBLA-szintű SELECT joga a districts-en?',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.role_table_grants
                         WHERE table_schema='public' AND table_name='districts'
                           AND grantee='anon' AND privilege_type='SELECT')
            THEN '⚠️ IGEN — ma még ártalmatlan (nincs érzékeny oszlop), de az S2 után nem az lenne'
            ELSE '✅ nincs (vagy már oszlop-szintűre szűkítve)' END,
       'Az 1. szakasz MOST szűkíti, ELŐRE — így az S2-ben érkező cif/iban/pecsét/aláírás SOHA nem lesz egy pillanatra sem anonim olvasható.'

UNION ALL
SELECT 24, '0/C · ANON SZIVÁRGÁS',
       'Megvan-e az anon RLS SELECT policy? (enélkül a GRANT is hiába)',
       COALESCE((SELECT string_agg(tablename || '.' || policyname, ', ')
                 FROM pg_policies
                 WHERE schemaname='public' AND tablename IN ('districts','dioceses')
                   AND 'anon' = ANY (roles) AND cmd IN ('SELECT','ALL')),
                '⚠️ nincs anon policy — akkor a regisztrációs űrlap MA IS üres legördülőt kap'),
       'Az RLS és a GRANT KÉT külön kapu; mindkettő kell. Ez a fájl a policy-t NEM bántja, csak a GRANT-ot szűkíti.'

ORDER BY sorszam;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A JAVÍTÁS                                  FUTTATÁS: 2.     ║
-- ║ EGYETLEN TRANZAKCIÓ. Ha bármi hibázik, MINDEN visszagördül.              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1/0) ŐRSZEM — fail-closed. Előfeltétel nélkül NEM futunk.
-- ────────────────────────────────────────────────────────────────────────────
DO $orszem$
DECLARE
  v_rossz text;
BEGIN
  IF to_regprocedure('public.current_user_district_ids()') IS NULL THEN
    RAISE EXCEPTION
      'ELŐFELTÉTEL HIÁNYZIK: nincs current_user_district_ids() függvény. Előbb a 2026-08-11-globalis-hozzaferes-szukites.sql fusson le.';
  END IF;

  -- A CHECK-csere elhasalna, ha van olyan meglévő szerep-érték, amit az ÚJ
  -- CHECK sem enged. Ezt ELŐRE, beszédesen jelezzük — nem a constraint
  -- nyers hibaüzenetével.
  -- ⚠️ TÁBLÁNKÉNT KÜLÖN ÉRTÉKLISTA. A `custom` KIZÁRÓLAG a profile_roles-on
  --    érvényes érték — a profiles CHECK-je szándékosan nem ismeri. Egy közös
  --    lista tehát átengedne egy `profiles.role = 'custom'` sort, és utána a
  --    profiles CHECK felvétele nyers 23514-gyel hasalna el: pontosan az,
  --    amit ez az őrszem meg akar előzni.
  SELECT string_agg(DISTINCT r, ', ') INTO v_rossz
  FROM (
    SELECT role AS r FROM public.profile_roles
     WHERE role IS NOT NULL AND role NOT IN
       ('admin','egyhazkeruleti_admin','egyhazkeruleti_szamvevo',
        'egyhazmegyei_admin','esperes','egyhazmegyei_szamvevo',
        'lelkesz','konyvelo','custom')
    UNION
    SELECT role FROM public.profiles
     WHERE role IS NOT NULL AND role NOT IN
       ('admin','egyhazkeruleti_admin','egyhazkeruleti_szamvevo',
        'egyhazmegyei_admin','esperes','egyhazmegyei_szamvevo',
        'lelkesz','konyvelo')
  ) x;

  IF v_rossz IS NOT NULL THEN
    RAISE EXCEPTION
      'ISMERETLEN SZEREP-ÉRTÉK(EK) AZ ÉLŐ ADATBAN: %. A CHECK-csere ezeken elhasalna. Előbb javítsd a sorokat (0. szakasz 12. sora sorolja fel), utána futtasd újra.', v_rossz;
  END IF;
END
$orszem$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/A) ÚJ SZEREP: egyhazkeruleti_szamvevo — a két role CHECK bővítése
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ AZ IDEMPOTENCIA-ŐR A DEFINÍCIÓRA NÉZ, NEM A NÉVRE. A repó máshol
--    `conname`-alapú őrt használ; ha a constraint neve változatlan marad
--    (mint itt), a névre néző őr azt hinné, kész van, és a bővítés NÉMÁN
--    kimaradna. Ez a hibaosztály a megyei körben már egyszer elsült.

DO $role_check$
DECLARE
  r record;
  v_ertekek constant text :=
    '''admin'',''egyhazkeruleti_admin'',''egyhazkeruleti_szamvevo'','
    || '''egyhazmegyei_admin'',''esperes'',''egyhazmegyei_szamvevo'','
    || '''lelkesz'',''konyvelo''';
BEGIN
  -- profiles.role — a 'custom' NEM szerepel (az csak profile_roles-ban él)
  -- ⚠️ 2026-08-15 JAVÍTÁS — A SZŰRŐ OSZLOP-ALAPÚ, NEM SZÖVEG-ALAPÚ.
  --
  -- A korábbi `pg_get_constraintdef(...) LIKE '%role%'` szűrő TÖBBET fogott
  -- meg a kelleténél: a `profile_roles` táblán a
  -- `profile_roles_custom_label_check` DEFINÍCIÓJÁBAN is szerepel a „role" szó
  -- (`role = 'custom' AND custom_label …`), ezért a ciklus AZT IS eldobta, és
  -- a helyére — ugyanazzal a névvel — a szerep-értéklistát tette. A címke-őr
  -- így NÉMÁN megszűnt. (Helyreállítás:
  -- 2026-08-15-egyhazkeruleti-S1-JAVITAS-custom-label-check.sql.)
  --
  -- A `conkey` a constraint által ÉRINTETT OSZLOPOK listája. Csak azt a
  -- CHECK-et cseréljük, ami KIZÁRÓLAG a `role` oszlopra vonatkozik — a
  -- custom_label_check conkey-je kétoszlopos {role, custom_label}, tehát kiesik.
  FOR r IN
    SELECT con.oid, con.conname
    FROM pg_constraint con
    WHERE con.conrelid = to_regclass('public.profiles')
      AND con.contype = 'c'
      AND con.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                              WHERE a.attrelid = to_regclass('public.profiles')
                                AND a.attname = 'role' AND NOT a.attisdropped)]
      AND pg_get_constraintdef(con.oid) NOT LIKE '%egyhazkeruleti_szamvevo%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', r.conname);
    EXECUTE format(
      'ALTER TABLE public.profiles ADD CONSTRAINT %I CHECK (role = ANY (ARRAY[%s]::text[]))',
      r.conname, v_ertekek);
    RAISE NOTICE '✅ profiles.% CHECK bővítve az egyhazkeruleti_szamvevo értékkel.', r.conname;
  END LOOP;

  -- profile_roles.role — itt a 'custom' IS érvényes érték
  -- ⚠️ Ugyanaz az oszlop-alapú szűrő, mint fent — LÁSD az ottani indoklást.
  --    ITT sült el élesben: a profile_roles_custom_label_check is „role"-t
  --    említ a definíciójában, ezért a régi szöveg-alapú szűrő eldobta.
  FOR r IN
    SELECT con.oid, con.conname
    FROM pg_constraint con
    WHERE con.conrelid = to_regclass('public.profile_roles')
      AND con.contype = 'c'
      AND con.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                              WHERE a.attrelid = to_regclass('public.profile_roles')
                                AND a.attname = 'role' AND NOT a.attisdropped)]
      AND pg_get_constraintdef(con.oid) NOT LIKE '%egyhazkeruleti_szamvevo%'
  LOOP
    EXECUTE format('ALTER TABLE public.profile_roles DROP CONSTRAINT %I', r.conname);
    EXECUTE format(
      'ALTER TABLE public.profile_roles ADD CONSTRAINT %I CHECK (role = ANY (ARRAY[%s,''custom'']::text[]))',
      r.conname, v_ertekek);
    RAISE NOTICE '✅ profile_roles.% CHECK bővítve az egyhazkeruleti_szamvevo értékkel.', r.conname;
  END LOOP;
END
$role_check$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/B) current_user_district_olvaso_ids() — a KERÜLETI OLVASÓ hatókör
-- ────────────────────────────────────────────────────────────────────────────
-- BETŰHŰ párja a current_user_district_ids()-nek
-- (2026-08-11-globalis-hozzaferes-szukites.sql:860-907), egyetlen
-- különbséggel: a szerep-lista tartalmazza az `egyhazkeruleti_szamvevo`-t is.
--
-- A HÁROM SZABÁLY, amit az app-oldali resolveDistrictIdsForRoles betűre tükröz
-- (apps/web/lib/auth/level-scope.ts):
--   (a) a hívó profiles.status = 'active' kell legyen;
--   (b) SZEREP-SZŰRT visszaadás a profile_roles district sorokból;
--   (c) SZEREP-FÜGGETLEN skalár-elnyomás: ha van BÁRMILYEN érvényes district
--       sor, a (esetleg elavult) profiles.district_id NEM bővíti a hatókört —
--       különben egy visszavont szerep melletti régi skalár tovább nyitna.
--
-- Üres tömb = nincs hatókör (FAIL-CLOSED).

CREATE OR REPLACE FUNCTION public.current_user_district_olvaso_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $kerulet_olvaso_ids$
  -- v2026-08-15-keruleti-s1
  WITH aktiv_hivo AS (
    SELECT p.id, p.role, p.district_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
  ),
  barmely_keruleti_sor AS (
    SELECT 1
    FROM public.profile_roles pr
    WHERE pr.profile_id = auth.uid()
      AND pr.scope = 'district'
      AND pr.active = true
      AND pr.approval_status = 'approved'
      AND pr.scope_id IS NOT NULL
  ),
  szerep_sorok AS (
    SELECT pr.scope_id AS district_id
    FROM public.profile_roles pr
    WHERE pr.profile_id = auth.uid()
      AND pr.scope = 'district'
      AND pr.role IN ('egyhazkeruleti_admin', 'egyhazkeruleti_szamvevo')
      AND pr.active = true
      AND pr.approval_status = 'approved'
      AND pr.scope_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM aktiv_hivo)
  ),
  skalar_fallback AS (
    SELECT h.district_id
    FROM aktiv_hivo h
    WHERE h.role IN ('egyhazkeruleti_admin', 'egyhazkeruleti_szamvevo')
      AND h.district_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM barmely_keruleti_sor)
  )
  SELECT COALESCE(array_agg(DISTINCT s.district_id), '{}'::uuid[])
  FROM (
    SELECT district_id FROM szerep_sorok
    UNION
    SELECT district_id FROM skalar_fallback
  ) s;
$kerulet_olvaso_ids$;

COMMENT ON FUNCTION public.current_user_district_olvaso_ids() IS
  'A bejelentkezett felhasználó egyházkerületi OLVASÁSI hatóköre (uuid[]): egyhazkeruleti_admin + egyhazkeruleti_szamvevo. Az ÍRÁSI párja a current_user_district_ids() (csak admin). App-tükör: apps/web/lib/auth/level-scope.ts DISTRICT_READ_ROLES. Üres tömb = nincs hatókör (FAIL-CLOSED).';

-- GRANT — a policy a HÍVÓ szerepében fut; enélkül minden erre épülő policy
-- 403-mal ÁLL LE (nem tagad: HIBÁZIK). Ez a projekt bizonyított hibaosztálya.
REVOKE ALL ON FUNCTION public.current_user_district_olvaso_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_district_olvaso_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_district_olvaso_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_district_olvaso_ids() TO service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 1/C) ⛔ ANON SZIVÁRGÁS ZÁRÁSA — oszlop-szintű GRANT
-- ────────────────────────────────────────────────────────────────────────────
-- A regisztrációs űrlapok (bejelentkezés ELŐTT) pontosan ezt kérik:
--   districts → id, name                 (access-request-form.tsx:92,
--   dioceses  → id, name, district_id     oauth-complete-form.tsx:90-91)
-- Minden más oszlop (CIF, IBAN, pecsét, aláírás, cím, e-mail, telefon,
-- vezetők nevei) BEJELENTKEZÉST kíván ezután.
--
-- ⚠️ Az RLS-policy-t SZÁNDÉKOSAN nem bántjuk: az anon SELECT policy marad,
--    különben a legördülők ürülnének ki. A GRANT és az RLS két külön kapu.
--
-- ⚠️ MIÉRT FAIL-CLOSED A JÖVŐRE: az oszlop-szintű GRANT NEM terjed ki a
--    később hozzáadott oszlopokra. Az S2 szeletben érkező districts.cif,
--    .bank_fo_iban, .pecset_url, .alairas_url tehát automatikusan zárt lesz.
--    Ha valaha KELL egy új oszlop az anonnak (pl. a román név a nyilvános
--    űrlapon), azt EXPLICIT GRANT-tal kell megadni — látható döntésként.

DO $anon_grant$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('districts', 'id, name'),
      ('dioceses',  'id, name, district_id')
    ) AS v(tabla, oszlopok)
  LOOP
    -- FAIL-CLOSED: a Supabase Studio a NOTICE-okat NEM jeleníti meg, tehát egy
    -- „csendben kihagytam" ág itt azt jelentené, hogy a szivárgás nyitva marad,
    -- miközben minden sikeresnek látszik. Egy KIZÁRÓLAG szivárgást záró
    -- szakaszban ez fail-open viselkedés lenne.
    IF to_regclass('public.' || t.tabla) IS NULL THEN
      RAISE EXCEPTION
        'FAIL-CLOSED: nincs public.% tábla — az anon-szűkítés NEM futott le rajta.', t.tabla;
    END IF;

    -- 1. a tábla-szintű (MINDEN oszlopra érvényes) SELECT visszavonása
    --
    -- ⚠️ A `FROM PUBLIC` ÁG NEM ELHAGYHATÓ. A `REVOKE … FROM anon` KIZÁRÓLAG
    --    az `anon` szerepnek KÖZVETLENÜL adott jogot vonja vissza. Ha a jog a
    --    PUBLIC ál-szerepen keresztül öröklődik (bármely séma-beállító script
    --    okozhatja), az `anon` TOVÁBBRA IS olvasna mindent — és a szivárgás
    --    NÉMÁN megmaradna, miközben a napló sikert jelentene. A 2. szakasz
    --    ezért `has_column_privilege()`-dzsel ellenőriz, ami MINDEN öröklési
    --    utat feloldva mondja meg az igazságot.
    -- ⚠️ `REVOKE ALL PRIVILEGES`, nem csak a négy DML-jog. A Supabase alapból
    --    GRANT ALL-t ad az anonnak minden public táblára, amiben benne van a
    --    TRUNCATE, a REFERENCES és a TRIGGER is. A TRUNCATE-re az RLS SOHA nem
    --    vonatkozik: aki TRUNCATE-elhet, az a teljes törzsadatot kiürítheti,
    --    bármilyen policy mellett. (A repó ugyanezt a szigorúbb alakot
    --    használja: 2026-08-10-anon-jogok-vizsgalat-es-visszavonas.sql:92.)
    EXECUTE format('REVOKE ALL PRIVILEGES ON public.%I FROM PUBLIC', t.tabla);
    EXECUTE format('REVOKE ALL PRIVILEGES ON public.%I FROM anon', t.tabla);
    -- 2. pontosan a szükséges oszlopok visszaadása
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO anon', t.oszlopok, t.tabla);
    -- 4. a BEJELENTKEZETT olvasás VÁLTOZATLAN marad — a felületek végig a
    --    teljes törzsadatot használják. (A hivatalos adatok szűkítése a
    --    bejelentkezettek felé SZÉLESEBB döntés, lásd a fájl fejlécét.)
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t.tabla);
    EXECUTE format('GRANT SELECT ON public.%I TO service_role', t.tabla);

    RAISE NOTICE '✅ anon → %: már csak (%) olvasható; authenticated/service_role érintetlen.',
                 t.tabla, t.oszlopok;
  END LOOP;
END
$anon_grant$;

COMMENT ON TABLE public.districts IS
  'Egyházkerületek (a rendszer 3. szintje). 2026-08-15: az anon szerep KIZÁRÓLAG az (id, name) oszlopokat olvashatja — a nyilvános regisztrációs űrlap legördülőjéhez. Minden további (hivatalos identitás: CIF, IBAN, pecsét, aláírás) bejelentkezést kíván. Új oszlop hozzáadásakor az anon automatikusan NEM kap rá jogot (oszlop-szintű GRANT) — ez szándékos, fail-closed viselkedés.';

COMMENT ON TABLE public.dioceses IS
  'Egyházmegyék (a rendszer 2. szintje). 2026-08-15: az anon szerep KIZÁRÓLAG az (id, name, district_id) oszlopokat olvashatja — a nyilvános regisztrációs űrlap legördülőjéhez. A hivatalos identitás (CIF, IBAN, pecsét, aláírás, cím, elérhetőségek) 2026-08-15-ig BEJELENTKEZÉS NÉLKÜL is olvasható volt; ez a fájl zárta le.';

COMMIT;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT. Az eredményt küldd vissza.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '2/A · ÚJ SZEREP' AS szakasz,
       'profiles.role CHECK engedi az egyhazkeruleti_szamvevo-t?' AS mit,
       COALESCE((SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%egyhazkeruleti_szamvevo%'
                             THEN '✅ IGEN' ELSE '⛔ NEM' END
                 FROM pg_constraint
                 WHERE conrelid = to_regclass('public.profiles') AND contype='c'
                   AND pg_get_constraintdef(oid) LIKE '%role%' LIMIT 1),
                '(nincs CHECK — nem is kellett bővíteni)') AS ertek,
       'Ha ⛔: a szerep nem osztható ki, az admin felület 23514-es hibát adna.' AS teendo

UNION ALL
SELECT 2, '2/A · ÚJ SZEREP',
       'profile_roles.role CHECK engedi az egyhazkeruleti_szamvevo-t?',
       COALESCE((SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%egyhazkeruleti_szamvevo%'
                             THEN '✅ IGEN' ELSE '⛔ NEM' END
                 FROM pg_constraint
                 WHERE conrelid = to_regclass('public.profile_roles') AND contype='c'
                   -- NÉV szerint — lásd a 0/B-11 sor indoklását.
                   AND conname = 'profile_roles_role_check'),
                '(nincs CHECK)'),
       'Ez a fontosabb: a kerületi számvevő szerepkör-SORA ide kerül.'

UNION ALL
SELECT 3, '2/A · ÚJ SZEREP',
       'A ''custom'' érték MEGMARADT a profile_roles CHECK-jében?',
       COALESCE((SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%custom%'
                             THEN '✅ igen' ELSE '⛔ ELVESZETT — az egyedi szerepkörök megszűnnének!' END
                 FROM pg_constraint
                 WHERE conrelid = to_regclass('public.profile_roles') AND contype='c'
                   -- NÉV szerint — lásd a 0/B-11 sor indoklását.
                   AND conname = 'profile_roles_role_check'),
                '(nincs CHECK)'),
       'Regressziós őr: a CHECK-cserénél a custom NEM eshet ki.'

UNION ALL
SELECT 10, '2/B · OLVASÓ FÜGGVÉNY',
       'Létrejött a current_user_district_olvaso_ids()?',
       CASE WHEN to_regprocedure('public.current_user_district_olvaso_ids()') IS NULL
            THEN '⛔ NEM' ELSE '✅ igen' END,
       '—'

UNION ALL
SELECT 11, '2/B · OLVASÓ FÜGGVÉNY ⛔',
       'GRANT EXECUTE az authenticated-nek?',
       CASE WHEN to_regprocedure('public.current_user_district_olvaso_ids()') IS NULL THEN '— nincs függvény'
            WHEN has_function_privilege('authenticated',
                   'public.current_user_district_olvaso_ids()'::regprocedure, 'EXECUTE')
              THEN '✅ van'
            ELSE '⛔ NINCS — minden erre épülő policy 403-mal ÁLLNA LE' END,
       'Ez a leggyakoribb néma hiba: a policy nem tagad, hanem HIBÁZIK.'

UNION ALL
SELECT 12, '2/B · OLVASÓ FÜGGVÉNY',
       'Az anon NEM futtathatja?',
       CASE WHEN to_regprocedure('public.current_user_district_olvaso_ids()') IS NULL THEN '— nincs függvény'
            WHEN has_function_privilege('anon',
                   'public.current_user_district_olvaso_ids()'::regprocedure, 'EXECUTE')
              THEN '⛔ FUTTATHATJA — vissza kell vonni'
            ELSE '✅ nem' END,
       '—'

UNION ALL
SELECT 13, '2/B · OLVASÓ FÜGGVÉNY',
       'Az ÍRÁSI függvény (current_user_district_ids) ÉRINTETLEN maradt?',
       COALESCE((SELECT CASE WHEN prosrc LIKE '%szamvevo%'
                             THEN '⛔ MEGVÁLTOZOTT — az ellenőr írásjogot kapott!'
                             ELSE '✅ érintetlen' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='current_user_district_ids' LIMIT 1),
                'nincs függvény'),
       'REGRESSZIÓS ŐR: az írás és az olvasás KÉT külön hatókör kell maradjon.'

UNION ALL
SELECT 20, '2/C · ANON SZIVÁRGÁS',
       'anon → districts: mely oszlopok olvashatók?',
       COALESCE((SELECT string_agg(column_name, ', ' ORDER BY column_name)
                 FROM information_schema.column_privileges
                 WHERE table_schema='public' AND table_name='districts'
                   AND grantee='anon' AND privilege_type='SELECT'),
                '(egy sem)'),
       '✅ Az elvárt: id, name — pontosan ennyi kell a regisztrációs legördülőnek.'

UNION ALL
SELECT 21, '2/C · ANON SZIVÁRGÁS',
       'anon → dioceses: mely oszlopok olvashatók?',
       COALESCE((SELECT string_agg(column_name, ', ' ORDER BY column_name)
                 FROM information_schema.column_privileges
                 WHERE table_schema='public' AND table_name='dioceses'
                   AND grantee='anon' AND privilege_type='SELECT'),
                '(egy sem)'),
       '✅ Az elvárt: district_id, id, name. Ha CIF/IBAN/pecsét is szerepel: a szűkítés NEM sikerült.'

UNION ALL
SELECT 22, '2/C · ANON SZIVÁRGÁS ⛔',
       'Maradt-e TÁBLA-szintű anon SELECT bármelyiken?',
       COALESCE((SELECT string_agg(table_name, ', ')
                 FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name IN ('districts','dioceses')
                   AND grantee='anon' AND privilege_type='SELECT'),
                '✅ egyiken sem'),
       'Ha itt nevet látsz: azon a táblán MINDEN oszlop olvasható anonimként.'

-- ⚠️ EZ A DÖNTŐ ELLENŐRZÉS. A fenti két sor a GRANT-KATALÓGUST nézi, ami NEM
--    mutatja a PUBLIC ál-szerepen át ÖRÖKÖLT jogot. A has_column_privilege()
--    viszont MINDEN öröklési utat feloldva válaszol — ez az igazság.
UNION ALL
SELECT (100 + row_number() OVER (ORDER BY p.kell DESC, p.tabla, p.oszlop))::int,
       '2/C · ANON SZIVÁRGÁS — DÖNTŐ PRÓBA ⛔',
       'Olvashatja-e MOST az anon: ' || p.tabla || '.' || p.oszlop || ' ?',
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema='public' AND table_name=p.tabla
                            AND column_name=p.oszlop)
           THEN '— nincs ilyen oszlop (még)'
         WHEN has_column_privilege('anon', ('public.' || p.tabla)::regclass, p.oszlop, 'SELECT')
           THEN CASE WHEN p.kell THEN '✅ IGEN — és ez így helyes (a regisztrációs űrlap kéri)'
                     ELSE '⛔ IGEN — A SZIVÁRGÁS MEGMARADT! Valószínűleg a PUBLIC szerepen át öröklődik.' END
         ELSE CASE WHEN p.kell
                   THEN '⛔ NEM — pedig KELL: a /hozzaferes-kerese legördülője elhasal!'
                   ELSE '✅ NEM — a szivárgás lezárva' END
       END,
       CASE WHEN p.kell
            THEN 'Ez a három oszlop KELL az anonnak (districts: id,name — dioceses: id,name,district_id).'
            ELSE 'Ennek az oszlopnak bejelentkezés NÉLKÜL SOHA nem szabad olvashatónak lennie.' END
FROM (VALUES
        ('districts', 'id',          true),
        ('districts', 'name',        true),
        ('dioceses',  'id',          true),
        ('dioceses',  'name',        true),
        ('dioceses',  'district_id', true),
        -- …és az ÉRZÉKENYEK, amiknek zárva KELL lenniük:
        ('dioceses',  'cif',         false),
        ('dioceses',  'adoszam',     false),
        ('dioceses',  'bank_fo_iban', false),
        ('dioceses',  'pecset_url',  false),
        ('dioceses',  'alairas_url', false),
        ('dioceses',  'cim_utca',    false),
        ('dioceses',  'email',       false),
        ('dioceses',  'telefon',     false)
     ) AS p(tabla, oszlop, kell)
WHERE to_regclass('public.' || p.tabla) IS NOT NULL

-- ⚠️ A TRUNCATE-re az RLS SOHA nem vonatkozik. Aki TRUNCATE-elhet, az a teljes
--    törzsadatot kiürítheti, bármilyen policy mellett — ezért külön ellenőrizzük.
UNION ALL
SELECT (150 + row_number() OVER (ORDER BY t.tabla, t.jog))::int,
       '2/C · ANON ÍRÁSI JOGOK ⛔',
       'Van-e az anonnak ' || t.jog || ' joga a ' || t.tabla || ' táblán?',
       CASE WHEN has_table_privilege('anon', ('public.' || t.tabla)::regclass, t.jog)
            THEN '⛔ IGEN — vissza kell vonni! (' || t.jog || ' az RLS-t megkerüli)'
            ELSE '✅ nem' END,
       'A REVOKE ALL PRIVILEGES-nek ezeket mind el kellett vinnie. Ha bármelyik ⛔, futtasd: REVOKE ALL PRIVILEGES ON public.' || t.tabla || ' FROM PUBLIC, anon; majd a GRANT SELECT (…) sort újra.'
FROM (VALUES
        ('districts', 'INSERT'), ('districts', 'UPDATE'),
        ('districts', 'DELETE'), ('districts', 'TRUNCATE'),
        ('dioceses',  'INSERT'), ('dioceses',  'UPDATE'),
        ('dioceses',  'DELETE'), ('dioceses',  'TRUNCATE')
     ) AS t(tabla, jog)
WHERE to_regclass('public.' || t.tabla) IS NOT NULL

UNION ALL
SELECT 200, '2/C · ANON SZIVÁRGÁS',
       'REGRESSZIÓS ŐR: a BEJELENTKEZETT olvasás megmaradt?',
       CASE WHEN has_table_privilege('authenticated', 'public.districts'::regclass, 'SELECT')
             AND has_table_privilege('authenticated', 'public.dioceses'::regclass, 'SELECT')
            THEN '✅ igen — a belső felületek változatlanul működnek'
            ELSE '⛔ NEM — a PUBLIC-revoke túl sokat vitt el, a belső felületek elhasalnak!' END,
       '⛔ Ha ⛔: azonnal futtasd: GRANT SELECT ON public.districts, public.dioceses TO authenticated;'

UNION ALL
SELECT 23, '2/C · ANON SZIVÁRGÁS',
       'REGRESSZIÓS ŐR: megvan-e még az anon RLS SELECT policy?',
       COALESCE((SELECT string_agg(tablename || '.' || policyname, ', ')
                 FROM pg_policies
                 WHERE schemaname='public' AND tablename IN ('districts','dioceses')
                   AND 'anon' = ANY (roles) AND cmd IN ('SELECT','ALL')),
                '⛔ NINCS — a REGISZTRÁCIÓS ŰRLAP legördülői ÜRESEK lesznek!'),
       '⛔ Ha eltűnt: a /hozzaferes-kerese oldal használhatatlan. Ez a fájl nem nyúlt a policy-khoz — ha mégis hiányzik, más fájl vette el.'

UNION ALL
SELECT 300, '2/D · KÉZI PRÓBA',
       'MOST TESZTELD LE (2 perc)',
       'Nyisd meg INKOGNITÓ ablakban a /hozzaferes-kerese oldalt',
       'Az „Egyházkerület" és „Egyházmegye" legördülőnek MEG KELL TELNIE. Ha üres vagy hibát ír, azonnal szólj — a 2/C-23 sor mutatja az okot.'

ORDER BY sorszam;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ VÉGE.                                                                    ║
-- ║ KÖVETKEZŐ LÉPÉS: az S2 szelet (kerületi identitás) SQL-je — az EBBŐL     ║
-- ║ a fájlból örökölt oszlop-szintű anon GRANT miatt az S2-ben érkező CIF/   ║
-- ║ IBAN/pecsét/aláírás SOHA nem lesz egy pillanatra sem anonim olvasható.   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
