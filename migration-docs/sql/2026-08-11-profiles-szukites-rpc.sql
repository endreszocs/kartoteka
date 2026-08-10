-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTEKA — A `profiles` OLVASÁSI POLICY VÉGLEGES SZŰKÍTÉSE
-- Dátum: 2026-08-11   ·   Futtatja: Endre (Supabase Studio → SQL Editor)
--
-- ELŐZMÉNY (KÖTELEZŐ): 2026-08-10-nyitott-rls-policyk-takaritas.sql
--   Az a fájl cserélte le a `profiles_read` policy `USING (true)` feltételét a
--   `public.profil_lathato_e(...)` SECURITY DEFINER segédfüggvényre, TÍZ ággal.
--   A (10) ág SZÁNDÉKOS, ÁTMENETI TÁGÍTÁS volt: minden AKTÍV tisztségviselői
--   profil (lelkesz / esperes / egyhazmegyei_admin / egyhazkeruleti_admin /
--   admin) ORSZÁGOSAN olvasható maradt bármelyik aktív munkatársnak.
--
-- ────────────────────────────────────────────────────────────────────────────
-- MIT CSINÁL EZ A FÁJL — egy mondatban
-- ────────────────────────────────────────────────────────────────────────────
-- Létrehoz HÁROM szűk, SECURITY DEFINER RPC-t, amelyek a (10) ágra épülő
-- ÖSSZES élő funkciót kiszolgálják (és CSAK a minimálisan szükséges oszlopokat
-- adják vissza), majd újradefiniálja a `profil_lathato_e()` függvényt a
-- (10) ág NÉLKÜL. A `profiles_read` policy maga változatlan marad (ugyanaz a
-- név, ugyanaz a hívás) — csak a segédfüggvény törzse szűkül.
--
-- ⚠️ A SORREND FONTOS: az RPC-k a függvény-szűkítés ELŐTT jönnek létre,
--    egy tranzakcióban. Ha bármi elbukik, a (10) ág a helyén marad.
--
-- ────────────────────────────────────────────────────────────────────────────
-- A MINTA: `get_cross_match_pastor_contacts()`
-- (2026-07-14-kereszt-gyulekezeti-lelkesz-kontakt.sql:18-57)
-- Az ottani indoklás szó szerint érvényes ide is:
--   „A lelkész HIVATALOS elérhetősége (név, email, telefon) NYILVÁNOS, egyházi
--    tisztségviselői adat — NEM tag-adat. SECURITY DEFINER, mert a hívó a saját
--    gyülekezetén kívüli adatot kér. A visszaadott mezők SZIGORÚAN csak a
--    hivatalos elérhetőség — más NEM."
-- Az itteni három RPC ennél is szűkebb: E-MAILT EGYIK SEM ad vissza.
--
-- ────────────────────────────────────────────────────────────────────────────
-- MELYIK RPC MELYIK HÍVÁSI HELYET VÁLTJA KI
-- (a 2026-08-10-es fájl 8. szakaszának „(g) ORSZÁGOS OLVASÓK" listája)
-- ────────────────────────────────────────────────────────────────────────────
--  1) get_congregation_officials(uuid, text[])
--       · apps/web/app/(dashboard)/iktato/atadas-actions.ts
--         (átadás/átjelentkezés → a CÉL gyülekezet lelkészei)
--       · apps/web/lib/notifications/transfer-notifications-actions.ts
--         (átjelentkezés visszaigazolása → a FORRÁS gyülekezet lelkészei)
--       · apps/web/lib/annual-report/generator.ts
--         (éves jelentés → a jelentés gyülekezetének lelkipásztora)
--       · apps/web/app/(dashboard)/penzugy/tva-actions.ts
--         (TVA-plafon riasztás → a gyülekezet saját lelkészei)
--
--  2) get_diocese_officials(uuid, text[])
--       · apps/web/lib/annual-report/generator.ts (az esperes neve)
--       · apps/web/app/(dashboard)/penzugy/tva-actions.ts
--         (a gyülekezet SAJÁT egyházmegyéjének esperese / megyei adminja)
--
--  3) get_profile_display_names(uuid[])
--       · apps/web/app/misszios-muhely/community-actions.ts (ranglisták)
--       · apps/web/app/misszios-muhely/project-actions.ts (projekt-csapat)
--
--  NEM kap RPC-t (mert a hatókörből amúgy is látszik — ellenőrizve 2026-08-11):
--       · apps/web/app/(dashboard)/admin/profile-congregations-actions.ts:306-312
--         (`sendPastorNotification`) — a hívó `createAssignment` KIZÁRÓLAG
--         rendszergazda / egyházkerületi admin, és az `assertCongregationInScope`
--         (lib/auth/admin-scope.ts:147-168) már a hívó KERÜLETÉRE szűkíti a
--         gyülekezetet. Így a (2)/(3) [rendszergazda] vagy a (7) [kerületi]
--         ág fedi. Marad közvetlen lekérdezésnek.
--
-- ────────────────────────────────────────────────────────────────────────────
-- KÉT TUDATOS, DOKUMENTÁLT VISELKEDÉS-VÁLTOZÁS
-- ────────────────────────────────────────────────────────────────────────────
-- (A) TÖBB CÍMZETT (bővülés, sosem szűkülés):
--     Az `get_congregation_officials` a gyülekezet lelkészeit KÉT lábon
--     gyűjti: a `profiles.congregation_id` skalár lábon ÉS a
--     `profile_roles(scope='congregation')` lábon. Az app eddig is próbálta
--     mindkettőt, de a `profile_roles` KERESZT-gyülekezeti olvasása RLS-ből
--     mindig ÜRES volt (2026-04-17-profile-roles-fazis-1.sql:143-236 — nincs
--     olyan policy, amely idegen gyülekezet sorát átengedné). Vagyis a
--     társ-lelkész (co-pastor), akit csak profile_roles köt a gyülekezethez,
--     eddig NÉMÁN kimaradt az átadási/átjelentkezési értesítésekből. Mostantól
--     megkapja. Ez a MEMORY-ban rögzített „skalár ⇄ profile_roles divergencia"
--     hibaosztály javítása.
--
-- (B) A TVA-RIASZTÁS TÖBBÉ NEM MEGY KI AZ ORSZÁG MINDEN ESPERESÉNEK:
--     a mai lekérdezés (penzugy/tva-actions.ts:146-150) így szól:
--         .or('congregation_id.eq.X, and(role.eq.esperes, diocese_id.not.is.null)')
--     — a második tag MINDEN esperest bevesz, akinek van egyházmegyéje,
--     az ORSZÁGBAN. A kód kommentje viszont („a gyülekezet lelkészének és
--     ESPERESÉNEK") egyértelműen a SAJÁT megye esperesét célozza. Az új
--     hívás a gyülekezet saját egyházmegyéjére szűr. Ez SZŰKÍTÉS a
--     címzettlistán — szándékos, mert a mai állapot értesítés-szórás.
--
-- ELVEK (a projekt eddigi migrációival azonosan):
--   · Idempotens: CREATE OR REPLACE / DROP ... IF EXISTS.
--   · Egy tranzakció (BEGIN/COMMIT), a végén `NOTIFY pgrst, 'reload schema'`.
--   · SECURITY DEFINER + `SET search_path = public`
--     (a get_cross_match_pastor_contacts konvenciója).
--   · FAIL-CLOSED: minden RPC ELSŐ feltétele, hogy a hívó bejelentkezett,
--     AKTÍV munkatárs legyen — különben NULLA sor (nem hiba, nem üres név).
--   · Az RPC-k SEMMILYEN e-mailt, telefonszámot, születési dátumot nem adnak
--     vissza. Csak: azonosító, megjelenítendő név, szerepkör, hatókör-azonosító.
--
-- ⚠️ AMIT EZ A FÁJL SZÁNDÉKOSAN NEM CSINÁL
--   · Nem nyúl a `profiles_insert` / `profiles_write` policy-hoz.
--   · Nem nyúl a `profiles_read` policy NEVÉHEZ (a member-portal P0 migráció
--     preflightja a névhalmazt ellenőrzi — 2026-07-17-member-portal-p0-auth-
--     isolation.sql:625-631).
--   · Nem nyúl az (1)–(9) ágakhoz: azok BYTE-HŰEN átmásolva a 2026-08-10-es
--     fájl 951-1156. sorából. Az EGYETLEN különbség a (10) ág hiánya.
-- ════════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ELLENŐRZÉS (CSAK OLVAS)                                     ║
-- ║ Futtasd ELŐSZÖR, külön. Az 1–5. szakaszt csak az eredmény ismeretében!    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 0a. Lefutott-e a 2026-08-10-es előzmény? (A `profil_lathato_e` léteznie kell.)
--     VÁRT: 1 sor, security_definer = true, tulajdonos = postgres.
SELECT p.proname                                   AS fuggveny,
       pg_get_function_identity_arguments(p.oid)   AS argumentumok,
       p.prosecdef                                 AS security_definer,
       pg_get_userbyid(p.proowner)                 AS tulajdonos,
       p.proconfig                                 AS beallitasok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'profil_lathato_e';

-- 0b. Benne van-e MÉG a (10) ág a jelenlegi definícióban?
--     VÁRT: `van_10_ag = true` (ha false, ez a fájl már lefutott — idempotens,
--     újra lefuttatható, de akkor nincs mit szűkíteni).
SELECT (pg_get_functiondef(p.oid) LIKE '%(10) HIVATALOS TISZTSÉGVISELŐI NÉVSOR%')
         AS van_10_ag
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'profil_lathato_e';

-- 0c. A `profiles` jelenlegi policy-képe.
--     VÁRT: profiles_insert / profiles_read / profiles_write — pontosan három.
SELECT policyname, cmd, roles::text,
       COALESCE(qual, '(nincs USING)')       AS using_feltetel,
       COALESCE(with_check, '(nincs CHECK)') AS with_check_feltetel
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

-- 0d. Megvannak-e a hivatkozott segédfüggvények?
--     VÁRT: mind a négy sor.
SELECT x.fn,
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_proc p
              JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = x.fn
            ) THEN '✅ megvan' ELSE '⛔ HIÁNYZIK — NE FUTTASD' END AS allapot
FROM (VALUES
        ('current_user_is_active_staff'),
        ('current_user_has_global_access'),
        ('current_user_congregation_id'),
        ('profil_lathato_e')
     ) AS x(fn);

-- 0e. HATÁS-ELŐNÉZET — hány profil esik ki a (10) ág megszűnésével?
--     A (10) ág az AKTÍV tisztségviselői profilokat engedte országosan.
--     Ez a szám NEM „elveszett" adat: ezeket ezután az RPC-k adják vissza,
--     célzottan. Csak a nagyságrendet mutatja.
SELECT count(*) AS aktiv_tisztsegviseloi_profil_orszagosan
FROM public.profiles
WHERE status = 'active'
  AND deleted_at IS NULL
  AND anonymized_at IS NULL
  AND role IN ('lelkesz', 'esperes', 'egyhazmegyei_admin',
               'egyhazkeruleti_admin', 'admin');

-- 0f. ⚠️ FÜGGETLEN, ELŐZŐLEG IS FENNÁLLÓ TÉTEL (nem ez a fájl okozza, de
--     futtasd le, mert a füst-teszt 6. pontja erre kérdez rá):
--     hány olyan JÓVÁHAGYOTT könyvelő/számvevő hozzárendelés van, ahol a
--     hozzárendelt profil `congregation_id`-ja NEM a gyülekezet? Ezeknek a
--     neve a lelkész „Profilom → Kapcsolatok" oldalán üresen maradhat, mert a
--     `konyvelo` / `egyhazmegyei_szamvevo` szerepkör SEMELYIK ágban nem
--     szerepel (a (10) ág sem tartalmazta). Ha > 0, külön javítás kell.
SELECT count(*) AS gyulekezeten_kivuli_konyvelo_hozzarendeles
FROM public.profile_congregations pc
JOIN public.profiles p ON p.id = pc.profile_id
WHERE pc.approval_status = 'approved'
  AND (p.congregation_id IS NULL OR p.congregation_id <> pc.congregation_id);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1–5. SZAKASZ — A JAVÍTÁS (EGY TRANZAKCIÓ)                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. FAIL-CLOSED ŐRSZEM — az előzmény-migráció nélkül NE csináljunk semmit
-- ────────────────────────────────────────────────────────────────────────────
-- Ha a 2026-08-10-es fájl nem futott le, a `profil_lathato_e` sem létezik,
-- és az alábbi CREATE OR REPLACE egy OLYAN függvényt hozna létre, amelyre
-- egyetlen policy sem hivatkozik — a `profiles_read` maradna `USING (true)`.
-- Ilyenkor a felhasználó azt hinné, hogy szigorított, holott nem.

DO $orszem$
DECLARE
  v_hianyzo text[];
BEGIN
  SELECT array_agg(x.fn ORDER BY x.fn) INTO v_hianyzo
  FROM (VALUES
          ('current_user_is_active_staff'),
          ('current_user_has_global_access'),
          ('current_user_congregation_id'),
          ('profil_lathato_e')
       ) AS x(fn)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = x.fn
  );

  IF v_hianyzo IS NOT NULL THEN
    RAISE EXCEPTION
      'MEGÁLLÍTVA — hiányzó segédfüggvény: %. Előbb a 2026-08-10-nyitott-rls-policyk-takaritas.sql fájlt kell lefuttatni. Küldd vissza a 0d. szakasz eredményét!',
      array_to_string(v_hianyzo, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'profiles_read'
  ) THEN
    RAISE EXCEPTION
      'MEGÁLLÍTVA — a profiles_read policy nem létezik. A szűkítésnek nincs mit szűkítenie; küldd vissza a 0c. szakasz eredményét!';
  END IF;

  -- A profil_lathato_e SECURITY DEFINER tulajdonosának meg KELL kerülnie az
  -- RLS-t, különben a policy végtelen rekurzióba fut (42P17) és MINDEN
  -- bejelentkezés megáll. (Ugyanaz az őrszem, mint 2026-08-10:1168-1192.)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles r ON r.rolname = pg_get_userbyid(p.proowner)
    WHERE n.nspname = 'public'
      AND p.proname = 'profil_lathato_e'
      AND (r.rolbypassrls OR r.rolsuper)
  ) THEN
    RAISE EXCEPTION
      'MEGÁLLÍTVA — a profil_lathato_e tulajdonosa NEM kerüli meg az RLS-t (nincs BYPASSRLS/SUPERUSER). A csere végtelen rekurzióba futna.';
  END IF;

  RAISE NOTICE 'OK — az előfeltételek rendben, a szűkítés biztonságosan elvégezhető.';
END
$orszem$;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. RPC #1 — EGY GYÜLEKEZET HIVATALOS TISZTSÉGVISELŐI
-- ────────────────────────────────────────────────────────────────────────────
-- KIVÁLTJA:
--   · iktato/atadas-actions.ts:289-303
--       .from('profiles').select('id')
--         .eq('congregation_id', celCongregationId)
--         .eq('role','lelkesz').eq('status','active')
--       + a mellette futó profile_roles-lekérdezés (lásd (A) megjegyzés fent)
--   · lib/notifications/transfer-notifications-actions.ts:370-385 (ugyanez a
--       forrás-gyülekezetre)
--   · lib/annual-report/generator.ts:202-205 (a gyülekezet lelkipásztora)
--   · penzugy/tva-actions.ts:146-150 (a gyülekezet saját lelkészei)
--
-- MIÉRT BIZTONSÁGOS ORSZÁGOSAN HÍVHATÓNAK LENNIE:
--   A visszaadott halmaz = egy KONKRÉT, a hívó által megnevezett gyülekezet
--   AKTÍV, HIVATALOS tisztségviselőinek NEVE és szerepköre. Ugyanaz az
--   adatkör, amit a get_cross_match_pastor_contacts() már ma is kiad — sőt
--   szűkebb, mert E-MAILT ÉS TELEFONT NEM ad vissza.
--   Tag-adat (szemely) SEMMILYEN formában nem szerepel benne.
--
-- FAIL-CLOSED: ha a hívó nem bejelentkezett aktív munkatárs → NULLA sor.

CREATE OR REPLACE FUNCTION public.get_congregation_officials(
    p_congregation_id uuid,
    p_roles           text[] DEFAULT ARRAY['lelkesz']::text[]
) RETURNS TABLE(
    user_id         uuid,
    full_name       text,
    role            text,
    congregation_id uuid,
    forras          text   -- 'profiles' | 'profile_roles' (diagnosztika)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $cong_officials$
  WITH ellenorzes AS (
    -- FAIL-CLOSED kapu: egyetlen sor, ha a hívó aktív munkatárs; különben nulla.
    SELECT 1
    WHERE auth.uid() IS NOT NULL
      AND p_congregation_id IS NOT NULL
      AND public.current_user_is_active_staff()
  ),
  skalar AS (
    -- (a) skalár láb: profiles.congregation_id
    SELECT p.id, p.full_name::text, p.role::text, p_congregation_id AS cid,
           'profiles'::text AS forras, 1 AS rang
    FROM public.profiles p
    WHERE EXISTS (SELECT 1 FROM ellenorzes)
      AND p.congregation_id = p_congregation_id
      AND p.role = ANY(p_roles)
      AND p.status         = 'active'
      AND p.deleted_at     IS NULL
      AND p.anonymized_at  IS NULL
  ),
  szerepkor AS (
    -- (b) profile_roles láb: társ-lelkész / kirendelt munkatárs
    --     (a skalár⇄profile_roles divergencia egyik irányban se nyeljen el sort)
    SELECT p.id, p.full_name::text, p.role::text, p_congregation_id AS cid,
           'profile_roles'::text AS forras, 2 AS rang
    FROM public.profile_roles pr
    JOIN public.profiles p ON p.id = pr.profile_id
    WHERE EXISTS (SELECT 1 FROM ellenorzes)
      AND pr.scope           = 'congregation'
      AND pr.scope_id        = p_congregation_id
      AND pr.role            = ANY(p_roles)
      AND pr.active          = true
      AND pr.approval_status = 'approved'
      AND p.status           = 'active'
      AND p.deleted_at       IS NULL
      AND p.anonymized_at    IS NULL
  ),
  egyesitve AS (
    SELECT * FROM skalar
    UNION ALL
    SELECT * FROM szerepkor
  )
  -- DISTINCT ON: egy személy egyszer szerepeljen; a skalár láb (rang=1) nyer,
  -- így a „ki az első lelkész" kérdésre az éves jelentés ugyanazt a választ
  -- kapja, mint ma.
  -- ⚠️ A `rang` a BELSŐ SELECT listájában is szerepel — DISTINCT mellett a
  --    PostgreSQL megköveteli, hogy az ORDER BY minden kifejezése benne
  --    legyen a kiválasztott oszlopok közt. A külső SELECT vetíti le a
  --    RETURNS TABLE öt oszlopára.
  SELECT s.id, s.full_name, s.role, s.cid, s.forras
  FROM (
    SELECT DISTINCT ON (e.id)
           e.id, e.full_name, e.role, e.cid, e.forras, e.rang
    FROM egyesitve e
    ORDER BY e.id, e.rang, e.full_name NULLS LAST
  ) s
  ORDER BY s.rang, s.full_name NULLS LAST;
$cong_officials$;

COMMENT ON FUNCTION public.get_congregation_officials(uuid, text[]) IS
  'Egy MEGADOTT gyülekezet aktív, hivatalos tisztségviselői (alapértelmezésben a lelkészei): azonosító + megjelenítendő név + szerepkör. E-mailt és telefont NEM ad vissza. Két lábon gyűjt: profiles.congregation_id ÉS profile_roles(scope=congregation). SECURITY DEFINER — a kereszt-gyülekezeti átadás/átjelentkezés értesítéseihez, a nyitott profiles_read helyett. Fail-closed: csak bejelentkezett, aktív munkatársnak ad sort.';

GRANT EXECUTE ON FUNCTION public.get_congregation_officials(uuid, text[])
  TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. RPC #2 — EGY EGYHÁZMEGYE HIVATALOS TISZTSÉGVISELŐI
-- ────────────────────────────────────────────────────────────────────────────
-- KIVÁLTJA:
--   · lib/annual-report/generator.ts:202-205 + :269-271
--       (`role.in.(esperes,egyhazmegyei_admin)` ORSZÁGOSAN, majd app-oldalon
--        `p.diocese_id === congregation.diocese_id`-re szűrve → az RPC
--        ugyanezt adja, de már az adatbázisban szűrve)
--   · penzugy/tva-actions.ts:146-150 második `.or(...)` tagja
--       (lásd a fenti (B) megjegyzést: az országos szórás megszűnik)
--
-- Ugyanaz a két-lábas gyűjtés, mint a #1-nél: `profiles.diocese_id` skalár ág
-- + `profile_roles(scope='diocese')` ág.

CREATE OR REPLACE FUNCTION public.get_diocese_officials(
    p_diocese_id uuid,
    p_roles      text[] DEFAULT ARRAY['esperes', 'egyhazmegyei_admin']::text[]
) RETURNS TABLE(
    user_id    uuid,
    full_name  text,
    role       text,
    diocese_id uuid,
    forras     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $dio_officials$
  WITH ellenorzes AS (
    SELECT 1
    WHERE auth.uid() IS NOT NULL
      AND p_diocese_id IS NOT NULL
      AND public.current_user_is_active_staff()
  ),
  skalar AS (
    SELECT p.id, p.full_name::text, p.role::text, p_diocese_id AS did,
           'profiles'::text AS forras, 1 AS rang
    FROM public.profiles p
    WHERE EXISTS (SELECT 1 FROM ellenorzes)
      AND p.diocese_id    = p_diocese_id
      AND p.role          = ANY(p_roles)
      AND p.status        = 'active'
      AND p.deleted_at    IS NULL
      AND p.anonymized_at IS NULL
  ),
  szerepkor AS (
    SELECT p.id, p.full_name::text, p.role::text, p_diocese_id AS did,
           'profile_roles'::text AS forras, 2 AS rang
    FROM public.profile_roles pr
    JOIN public.profiles p ON p.id = pr.profile_id
    WHERE EXISTS (SELECT 1 FROM ellenorzes)
      AND pr.scope           = 'diocese'
      AND pr.scope_id        = p_diocese_id
      AND pr.role            = ANY(p_roles)
      AND pr.active          = true
      AND pr.approval_status = 'approved'
      AND p.status           = 'active'
      AND p.deleted_at       IS NULL
      AND p.anonymized_at    IS NULL
  ),
  egyesitve AS (
    SELECT * FROM skalar
    UNION ALL
    SELECT * FROM szerepkor
  )
  -- (Ugyanaz a kétszintű DISTINCT ON minta, mint a #1-nél — lásd az ottani
  --  megjegyzést az ORDER BY / SELECT-lista követelményről.)
  SELECT s.id, s.full_name, s.role, s.did, s.forras
  FROM (
    SELECT DISTINCT ON (e.id)
           e.id, e.full_name, e.role, e.did, e.forras, e.rang
    FROM egyesitve e
    ORDER BY e.id, e.rang, e.full_name NULLS LAST
  ) s
  ORDER BY s.rang, s.full_name NULLS LAST;
$dio_officials$;

COMMENT ON FUNCTION public.get_diocese_officials(uuid, text[]) IS
  'Egy MEGADOTT egyházmegye aktív, hivatalos tisztségviselői (alapértelmezésben esperes + egyházmegyei admin): azonosító + név + szerepkör. E-mailt/telefont NEM ad vissza. SECURITY DEFINER — az éves jelentés esperes-mezőjéhez és a TVA-plafon riasztás címzettjeihez, a nyitott profiles_read helyett. Fail-closed.';

GRANT EXECUTE ON FUNCTION public.get_diocese_officials(uuid, text[])
  TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. RPC #3 — MEGJELENÍTENDŐ NEVEK EGY AZONOSÍTÓ-LISTÁHOZ (E-MAIL NÉLKÜL)
-- ────────────────────────────────────────────────────────────────────────────
-- KIVÁLTJA (Missziós Műhely — SZÁNDÉKOSAN országos, közösségi funkció):
--   · misszios-muhely/community-actions.ts:436  (Közösség — top-3 ranglista)
--   · misszios-muhely/community-actions.ts:705  (Ranglista — top-10)
--   · misszios-muhely/community-actions.ts:931  (Ranglista — bővebb nézet)
--   · misszios-muhely/project-actions.ts:178    (projekt-csapat névsora)
--   · misszios-muhely/project-actions.ts:308    (felelős neve feladat-mentéskor)
--
-- MIÉRT NEM VESZÉLYES: a hívó CSAK olyan azonosítókra kérdez, amelyeket a
-- Missziós Műhely saját, közösségi tábláiból (mm_felhasznalo_statisztika,
-- mm_szavazatok, mm_otletek) már megkapott — azok szándékosan mindenki
-- számára olvashatók (2026-04-12-missziós-muhely-rls.sql). Az RPC ehhez a
-- listához MEGJELENÍTENDŐ NEVET és gyülekezet-nevet ad, semmi mást.
-- ⚠️ E-MAILT NEM AD VISSZA — ez a legfontosabb különbség a mai
--    `profiles.select('id, full_name, congregation_id')` közvetlen
--    lekérdezéshez képest (az sem kért e-mailt, de a policy megengedte volna).
--
-- Biztonsági korlát: legfeljebb 500 azonosító egy hívásban (a ranglisták
-- 3–50 tételesek; ez pusztán a tömeges-leszedés elleni plafon).

CREATE OR REPLACE FUNCTION public.get_profile_display_names(
    p_profile_ids uuid[]
) RETURNS TABLE(
    user_id            uuid,
    full_name          text,
    congregation_id    uuid,
    congregation_name  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $display_names$
  SELECT
      p.id                                              AS user_id,
      p.full_name::text                                 AS full_name,
      p.congregation_id                                 AS congregation_id,
      COALESCE(c.nev_hu, c.name)::text                  AS congregation_name
  FROM public.profiles p
  LEFT JOIN public.congregations c ON c.id = p.congregation_id
  WHERE auth.uid() IS NOT NULL
    AND public.current_user_is_active_staff()
    AND p_profile_ids IS NOT NULL
    AND array_length(p_profile_ids, 1) IS NOT NULL
    AND array_length(p_profile_ids, 1) <= 500
    AND p.id = ANY(p_profile_ids)
    AND p.deleted_at    IS NULL
    AND p.anonymized_at IS NULL;
$display_names$;

COMMENT ON FUNCTION public.get_profile_display_names(uuid[]) IS
  'Megadott felhasználó-azonosítókhoz a MEGJELENÍTENDŐ név + a gyülekezet neve. E-mailt, telefont, szerepkört, státuszt NEM ad vissza. A Missziós Műhely (közösségi, szándékosan országos) ranglistáihoz és projekt-csapataihoz, a nyitott profiles_read helyett. Fail-closed; legfeljebb 500 azonosító hívásonként.';

GRANT EXECUTE ON FUNCTION public.get_profile_display_names(uuid[])
  TO authenticated;

-- Teljesítmény: a #1/#2 RPC a profile_roles-t hatókör szerint keresi.
-- (A profile_id-index a 2026-08-10-es fájlban már létrejött.)
CREATE INDEX IF NOT EXISTS idx_profile_roles_scope_scope_id
  ON public.profile_roles (scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_profiles_congregation_role
  ON public.profiles (congregation_id, role) WHERE congregation_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. A `profil_lathato_e()` ÚJRADEFINIÁLÁSA — A (10) ÁG NÉLKÜL
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ AZ (1)–(9) ÁG BYTE-HŰEN a 2026-08-10-nyitott-rls-policyk-takaritas.sql
--    951-1156. sorából származik. NE SZERKESZD ŐKET ITT — ha változtatni kell,
--    a két fájlt EGYÜTT kell módosítani, különben a következő futtatás
--    visszaállítja a régi viselkedést.
--
-- AZ EGYETLEN VÁLTOZÁS: a (10) „HIVATALOS TISZTSÉGVISELŐI NÉVSOR" ág eltűnt.
-- Az általa kiszolgált hat funkciót a fenti három RPC vette át.

CREATE OR REPLACE FUNCTION public.profil_lathato_e(
    p_profile_id      uuid,
    p_congregation_id uuid,
    p_diocese_id      uuid,
    p_district_id     uuid,
    p_role            text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $profil_lathato$
  SELECT
    -- (1) SAJÁT profil — mindig.
    p_profile_id = auth.uid()

    -- (2) Mindent látó szerepkörök: admin / esperes / egyhazmegyei_admin
    --     (a pre-P0 definíció szerint — 2026-04-12-phase-0-rls-hardening.sql:53-67).
    OR public.current_user_has_global_access()

    -- (3) Rendszer-szintű admin a profile_roles-ban
    --     (minta: ccm_caller_is_system_admin,
    --      2026-08-09-admin-kereszt-egyeztetes.sql:58-73).
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.scope = 'system' AND pr.role = 'admin'
        AND pr.active = true AND pr.approval_status = 'approved'
    )

    -- (4) AZONOS GYÜLEKEZET (skalár láb)
    OR (
      p_congregation_id IS NOT NULL
      AND p_congregation_id = public.current_user_congregation_id()
    )

    -- (5) AZONOS GYÜLEKEZET (profile_roles láb — co-pastor / könyvelő /
    --     profilváltós hozzárendelés; a skalár⇄profile_roles divergencia
    --     egyik irányban se nyeljen el sort)
    OR (
      p_congregation_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.scope = 'congregation' AND pr.scope_id = p_congregation_id
          AND pr.active = true AND pr.approval_status = 'approved'
      )
    )

    -- (6) EGYHÁZMEGYEI hatókör: a megyei vezető látja a megyéje minden
    --     profilját (a profil saját diocese_id-ja VAGY a gyülekezete megyéje).
    OR EXISTS (
      SELECT 1
      FROM (
        SELECT pr.scope_id AS diocese_id
        FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.scope = 'diocese'
          AND pr.role IN ('esperes', 'egyhazmegyei_admin', 'egyhazmegyei_szamvevo')
          AND pr.active = true AND pr.approval_status = 'approved'
          AND pr.scope_id IS NOT NULL
        UNION
        SELECT p.diocese_id
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('esperes', 'egyhazmegyei_admin', 'egyhazmegyei_szamvevo')
          AND p.diocese_id IS NOT NULL
      ) sajat
      WHERE sajat.diocese_id = p_diocese_id
         OR sajat.diocese_id = (
              SELECT c.diocese_id FROM public.congregations c
              WHERE c.id = p_congregation_id
            )
    )

    -- (7) EGYHÁZKERÜLETI hatókör (egyhazkeruleti_admin — NINCS benne a
    --     current_user_has_global_access()-ben, ezért kötelező külön ág).
    --     Minta: ccm_caller_district_ids(),
    --     2026-08-09-admin-kereszt-egyeztetes.sql:78-102 +
    --     apps/web/lib/auth/admin-scope.ts:39-52.
    OR EXISTS (
      SELECT 1
      FROM (
        SELECT pr.scope_id AS district_id
        FROM public.profile_roles pr
        WHERE pr.profile_id = auth.uid()
          AND pr.scope = 'district' AND pr.role = 'egyhazkeruleti_admin'
          AND pr.active = true AND pr.approval_status = 'approved'
          AND pr.scope_id IS NOT NULL
        UNION
        SELECT p.district_id
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'egyhazkeruleti_admin'
          AND p.district_id IS NOT NULL
      ) sajat
      WHERE sajat.district_id = p_district_id
         OR sajat.district_id = (
              SELECT d.district_id FROM public.dioceses d WHERE d.id = p_diocese_id
            )
         OR sajat.district_id = (
              SELECT d.district_id
              FROM public.congregations c
              JOIN public.dioceses d ON d.id = c.diocese_id
              WHERE c.id = p_congregation_id
            )
    )

    -- (8) MÉG BE NEM SOROLT (frissen regisztrált) profil: se gyülekezet, se
    --     megye, se kerület. Ezt LÁTNIA kell minden olyan adminnak, aki
    --     valamilyen szinten jóváhagyó — különben az admin-felület
    --     „Kérelmek" listája üresen maradna, és az assertUserInScope
    --     (admin-scope.ts:205-249) access_requests-fallbackja sem futna le.
    OR (
      p_congregation_id IS NULL
      AND p_diocese_id  IS NULL
      AND p_district_id IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.status = 'active'
            AND p.role IN ('admin', 'egyhazkeruleti_admin',
                           'egyhazmegyei_admin', 'esperes')
        )
        OR EXISTS (
          SELECT 1 FROM public.profile_roles pr
          WHERE pr.profile_id = auth.uid()
            AND pr.scope IN ('system', 'district', 'diocese')
            AND pr.active = true AND pr.approval_status = 'approved'
        )
      )
    )

    -- (9) „FELFELÉ" OLVASÁS: a gyülekezeti felhasználó látja a SAJÁT
    --     egyházmegyéje / egyházkerülete TISZTSÉGVISELŐINEK profilját.
    --     Ezt a dokumentum- és költségvetés-beküldés értesítése használja
    --     (document-actions.ts:360-366, desktop-budget-tab.tsx:166-171).
    --     Szűk: csak tisztségviselői szerepkörre, és csak a saját megyéjén/
    --     kerületén belül. Hivatalos, egyházi tisztségviselői elérhetőség —
    --     ugyanaz a besorolás, amit a get_cross_match_pastor_contacts()
    --     kommentje rögzít (2026-07-14-…-lelkesz-kontakt.sql:6-13).
    OR (
      p_role IN ('esperes', 'egyhazmegyei_admin', 'egyhazmegyei_szamvevo',
                 'egyhazkeruleti_admin', 'admin')
      AND (
        (
          p_diocese_id IS NOT NULL
          AND p_diocese_id = (
            SELECT c.diocese_id FROM public.congregations c
            WHERE c.id = public.current_user_congregation_id()
          )
        )
        OR (
          p_district_id IS NOT NULL
          AND p_district_id = (
            SELECT d.district_id
            FROM public.congregations c
            JOIN public.dioceses d ON d.id = c.diocese_id
            WHERE c.id = public.current_user_congregation_id()
          )
        )
      )
    );

    -- ── (10) ÁG: TÖRÖLVE (2026-08-11) ────────────────────────────────────────
    -- A 2026-08-10-es fájl (10) ága az ORSZÁG MINDEN aktív tisztségviselői
    -- profilját olvashatóvá tette bármelyik aktív munkatársnak. Az általa
    -- kiszolgált hat hívási hely átkerült SECURITY DEFINER RPC mögé:
    --     get_congregation_officials()  — átadás, átjelentkezés-visszaigazolás,
    --                                     éves jelentés lelkipásztora, TVA
    --     get_diocese_officials()       — éves jelentés esperese, TVA-esperes
    --     get_profile_display_names()   — Missziós Műhely ranglisták/csapatok
    -- A hetedik („társ-lelkész/könyvelő kirendelés értesítése") nem igényelt
    -- RPC-t: a hívó admin/kerületi admin, így a (2)/(3)/(7) ág fedi.
$profil_lathato$;

COMMENT ON FUNCTION public.profil_lathato_e(uuid, uuid, uuid, uuid, text) IS
  'RLS-segéd a profiles SELECT policy-hoz. KILENC ág: saját profil / globális szerep / rendszer-admin (profile_roles) / azonos gyülekezet (skalár + profile_roles) / megyei hatókör / kerületi hatókör / még be nem sorolt profil adminnak / felettes tisztségviselő a saját megyéjében-kerületében. A korábbi (10) „országos tisztségviselői névsor" ág 2026-08-11-én MEGSZŰNT — helyette get_congregation_officials(), get_diocese_officials() és get_profile_display_names() SECURITY DEFINER RPC-k. SECURITY DEFINER — enélkül a profiles-policy végtelen rekurzióba futna.';

-- A policy definíciója VÁLTOZATLAN — a `CREATE OR REPLACE FUNCTION` önmagában
-- hat, mert a policy a függvényt HÍVJA. A biztonság kedvéért mégis
-- újralétrehozzuk: így a `pg_policies.qual` időbélyege is frissül, és a
-- 10a. ellenőrző lekérdezés egyértelmű képet ad.
-- (A név SZÁNDÉKOSAN marad `profiles_read` — lásd a fájl fejlécét.)
DROP POLICY IF EXISTS profiles_read ON public.profiles;
CREATE POLICY profiles_read ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.profil_lathato_e(
      profiles.id,
      profiles.congregation_id,
      profiles.diocese_id,
      profiles.district_id,
      profiles.role
    )
  );

-- ── ZÁRÓ ŐRSZEM: tényleg eltűnt a (10) ág, és tényleg megvan mind a 3 RPC? ──
DO $zaro_orszem$
DECLARE
  v_def   text;
  v_hiany text[];
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'profil_lathato_e';

  IF v_def LIKE '%current_user_is_active_staff()%' THEN
    RAISE EXCEPTION
      'MEGÁLLÍTVA — a profil_lathato_e MÉG MINDIG hivatkozik a current_user_is_active_staff()-re, tehát a (10) ág nem tűnt el. A csere nem érvényesült.';
  END IF;

  SELECT array_agg(x.fn ORDER BY x.fn) INTO v_hiany
  FROM (VALUES
          ('get_congregation_officials'),
          ('get_diocese_officials'),
          ('get_profile_display_names')
       ) AS x(fn)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = x.fn
  );

  IF v_hiany IS NOT NULL THEN
    RAISE EXCEPTION
      'MEGÁLLÍTVA — hiányzó RPC: %. A (10) ág nélkül ezek nélkül az értesítések némán elnémulnának.',
      array_to_string(v_hiany, ', ');
  END IF;

  RAISE NOTICE 'OK — a (10) ág megszűnt, mind a három RPC a helyén van. ✅';
END
$zaro_orszem$;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 6. SZAKASZ — ELLENŐRZÉS A FUTÁS UTÁN                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 6a. ⭐ A FŐ BIZONYÍTÉK: eltűnt-e a (10) ág?
--     VÁRT: van_10_ag = false · hivatkozik_active_staffra = false
--           · van_9_ag = true (a (9) ág megmaradt, tehát nem csonkoltunk túl).
SELECT
  (pg_get_functiondef(p.oid) LIKE '%(10) HIVATALOS TISZTSÉGVISELŐI NÉVSOR%') AS van_10_ag,
  (pg_get_functiondef(p.oid) LIKE '%current_user_is_active_staff%')          AS hivatkozik_active_staffra,
  (pg_get_functiondef(p.oid) LIKE '%(9) „FELFELÉ" OLVASÁS%')                 AS van_9_ag,
  (pg_get_functiondef(p.oid) LIKE '%(10) ÁG: TÖRÖLVE (2026-08-11)%')         AS van_torles_jelolo
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'profil_lathato_e';

-- 6b. Létrejött-e mind a három RPC, helyes beállításokkal?
--     VÁRT: 3 sor · security_definer = true · tulajdonos = postgres
--           · beallitasok = {"search_path=public"}
SELECT p.proname                                 AS fuggveny,
       pg_get_function_identity_arguments(p.oid) AS argumentumok,
       p.prosecdef                               AS security_definer,
       pg_get_userbyid(p.proowner)               AS tulajdonos,
       p.proconfig                               AS beallitasok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_congregation_officials',
                    'get_diocese_officials',
                    'get_profile_display_names')
ORDER BY p.proname;

-- 6c. Megkapta-e az `authenticated` a futtatási jogot? (`anon` NEM kaphat!)
--     VÁRT: pontosan 3 sor, mind `authenticated`.
SELECT r.routine_name AS fuggveny, r.grantee, r.privilege_type
FROM information_schema.routine_privileges r
WHERE r.routine_schema = 'public'
  AND r.routine_name IN ('get_congregation_officials',
                         'get_diocese_officials',
                         'get_profile_display_names')
  AND r.grantee IN ('authenticated', 'anon', 'PUBLIC')
ORDER BY r.routine_name, r.grantee;

-- 6d. A `profiles` policy-képe — változatlanul HÁROM sor.
--     VÁRT: profiles_insert / profiles_read (profil_lathato_e hívással) /
--           profiles_write. A profiles_read qual-jában NEM lehet `true`.
SELECT policyname, cmd, roles::text,
       COALESCE(qual, '(nincs USING)') AS using_feltetel
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

-- 6e. FÜST-PRÓBA SQL-BŐL (opcionális, de sokat elárul).
--     Cseréld ki a <GYÜLEKEZET-UUID>-t egy VALÓS gyülekezet azonosítójára.
--     ⚠️ Studio-ban `postgres`-ként futtatva az auth.uid() NULL → az RPC
--        FAIL-CLOSED módon 0 sort ad. Ez NEM hiba, hanem a helyes viselkedés
--        bizonyítéka. Az igazi próba az appban van (7. szakasz).
-- SELECT * FROM public.get_congregation_officials('<GYÜLEKEZET-UUID>'::uuid);
-- SELECT * FROM public.get_diocese_officials('<EGYHÁZMEGYE-UUID>'::uuid);
-- SELECT * FROM public.get_profile_display_names(ARRAY['<USER-UUID>']::uuid[]);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 7. FÜST-TESZT — ezt AZ APPBAN kell végigkattintani a futás után          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Jelentkezz be EGY GYÜLEKEZETI LELKÉSZ profillal (NEM adminnal!) — ez a
-- lényeg: a (10) ág éppen az ő munkamenetét tágította országosra.
--
--  [ ] 1.  Profil / fejléc → a saját neved, e-mailed, avatárod megjelenik;
--          a profilválasztó (/valassz-profilt) felajánlja a szerepeidet.
--          (Ez az (1) ág — ha ez üres, AZONNAL állítsd vissza, lásd lent.)
--
--  [ ] 2.  Éves jelentés → „Jelentés generálása" → az I. szekcióban a
--          LELKIPÁSZTOR neve és az ESPERES neve kitöltve jelenik meg.
--          ⚠️ Ez a get_congregation_officials + get_diocese_officials próbája.
--          Ha az esperes neve üres: az SQL nem futott le, VAGY a gyülekezet
--          `diocese_id`-ja hiányzik — az utóbbit a 0e. lekérdezés melletti
--          `SELECT id, nev_hu, diocese_id FROM congregations WHERE id = …`
--          mutatja meg.
--
--  [ ] 3.  Iktató → Átadás/átjelentkezés indítása egy MÁSIK gyülekezetbe →
--          a folyamat végén NEM jelenik meg a „nem található aktív
--          lelkész-profil" figyelmeztetés, és a cél gyülekezet lelkésze
--          megkapja az in-app értesítést.
--          (get_congregation_officials próbája a CÉL gyülekezetre.)
--
--  [ ] 4.  A CÉL gyülekezet lelkészeként: Értesítések → átjelentkezési kérelem
--          elfogadása → a KÜLDŐ gyülekezet lelkésze megkapja a válaszlevelet
--          in-app üzenetként.
--          (get_congregation_officials próbája a FORRÁS gyülekezetre.)
--
--  [ ] 5.  Missziós Műhely → Közösség és Ranglista → a más gyülekezetbeli
--          felhasználók NEVE és GYÜLEKEZETE látszik (nem „Ismeretlen").
--          Egy közös projekt megnyitása → a csapattagok neve látszik.
--          (get_profile_display_names próbája.)
--
--  [ ] 6.  ⚠️ Profilom → Kapcsolatok → ha van jóváhagyott könyvelőd/számvevőd,
--          a NEVE látszik-e? Ha ÜRES, az NEM ennek a fájlnak a hibája:
--          a `konyvelo` / `egyhazmegyei_szamvevo` szerepkör a 2026-08-10-es
--          szűkítés ÓTA sem szerepel egyetlen ágban sem (a (10) ág sem
--          tartalmazta). A 0f. lekérdezés megmutatja, érint-e valakit.
--          Ha igen → külön, célzott RPC kell (`get_congregation_assignments`).
--
--  [ ] 7.  Pénzügy → Áttekintés → ha a TVA-plafon PIROS: az értesítés
--          létrejön a saját lelkészeknek és a SAJÁT megye esperesének.
--          ⚠️ VÁRT ELTÉRÉS: más egyházmegyék esperesei többé NEM kapják meg —
--          ez szándékos javítás (lásd a fájl (B) megjegyzését).
--
--  [ ] 8.  Dokumentum-beküldés az egyházmegyének → az esperes/megyei admin
--          megkapja az app-értesítést. (A (9) ág próbája — ehhez nem nyúltunk,
--          csak azt bizonyítja, hogy semmit nem rontottunk el mellette.)
--
-- Utána EGYHÁZKERÜLETI ADMIN profillal:
--  [ ] 9.  /admin → Felhasználók: a saját kerületed felhasználói látszanak,
--          egy felhasználó megnyitható; a Kérelmek lista nem üres.
--          (A (7) és (8) ág próbája.)
--  [ ] 10. /admin → Szerepkör-kiosztás → könyvelő hozzárendelése egy
--          gyülekezethez → a gyülekezet lelkésze megkapja az értesítést.
--          (Ez az a hetedik hívási hely, amely RPC NÉLKÜL, a (7) ágból él.)
--
-- És RENDSZERGAZDA profillal:
--  [ ] 11. /admin → Felhasználók: a TELJES lista látszik (a (2)/(3) ág).
--
-- ── HA VALAMI ÜRESEN MARAD (gyors visszaállítás) ─────────────────────────────
-- A visszaállítás EGY parancs: a (10) ág visszatétele a függvénybe. A
-- legegyszerűbb, ha újra lefuttatod a 2026-08-10-nyitott-rls-policyk-
-- takaritas.sql 8. szakaszának `CREATE OR REPLACE FUNCTION profil_lathato_e`
-- blokkját (az idempotens, a többi szakasz futtatása nélkül is működik),
-- majd:
--   NOTIFY pgrst, 'reload schema';
-- Az RPC-k ettől függetlenül a helyükön maradhatnak — az alkalmazás
-- mindkét állapotban működik (RPC-vel és a régi közvetlen lekérdezéssel is,
-- lásd a „graceful fallback" mintát a TypeScript oldalon).
--
-- ── DEPLOY-SORREND (fontos, de a sorrend NEM kritikus) ───────────────────────
-- Az alkalmazás-kód úgy készült, hogy MINDKÉT sorrend működjön:
--   · ha az app előbb megy ki, az RPC-hívás „nincs ilyen függvény" hibát kap,
--     és automatikusan visszaesik a mai közvetlen lekérdezésre (amit a (10) ág
--     még kiszolgál);
--   · ha az SQL fut előbb, a régi (még futó) app-verzió is működik, mert a
--     (10) ág eltűnése csak a hat felsorolt funkciót érinti, és azok a
--     RÉGI kódban hibát nem dobnak, csak üres listát adnának.
-- AJÁNLOTT MÉGIS: 1) app deploy → 2) ez az SQL → 3) füst-teszt.
-- Így a (10) ág megszűnésének pillanatában már az RPC-s kód fut.
