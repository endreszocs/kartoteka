-- KARTOTEKA — ⚠️ SÜRGŐS: az `anon` szerepkör jogosultságainak vizsgálata
--                és visszavonása a `profiles` táblán (2026-08-10)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- ════════════════════════════════════════════════════════════════════════════
-- MI DERÜLT KI
-- ════════════════════════════════════════════════════════════════════════════
-- A 2026-08-10-es takarító SQL 0b. szakasza ezt adta vissza:
--
--     profiles | anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- Vagyis a BEJELENTKEZÉS NÉLKÜLI (anonim) szerepkörnek TELJES tábla-szintű
-- jogosultsága van a `profiles` táblára — beleértve a DELETE-et és a
-- TRUNCATE-et. Ez a jog a publikus Supabase anon-kulccsal érhető el, amely
-- minden böngészőben ott van.
--
-- MENNYIRE VESZÉLYES? Két dolgon múlik:
--
--   1. RLS BE VAN-E KAPCSOLVA a táblán. A policy-k LÉTEZÉSE önmagában NEM
--      jelenti, hogy az RLS aktív — kikapcsolt RLS mellett a policy-k
--      TÉTLENEK, és csak a fenti GRANT dönt. Ilyenkor egy anonim látogató
--      kiolvashatná, átírhatná vagy törölhetné az ÖSSZES felhasználói profilt.
--      → Ezt az 1a. lekérdezés dönti el. Ez a legfontosabb szám ebben a fájlban.
--
--   2. A TRUNCATE-re az RLS SOHA nem vonatkozik (a Postgres kihagyja) — igaz,
--      a PostgREST nem tesz elérhetővé TRUNCATE-et, így ez ma gyakorlatilag
--      nem hívható meg a REST API-n át. Attól még nincs helye a jogok közt.
--
-- MIÉRT NINCS SZÜKSÉG ERRE A JOGRA: a publikus gyülekezeti oldal a lelkész
-- nevét/adatait SECURITY DEFINER RPC-ken keresztül kapja (pl.
-- public_site_context_v2, get_cross_match_pastor_contacts) — azok a függvény
-- TULAJDONOSÁNAK jogaival futnak, tehát az anon tábla-jog felesleges hozzájuk.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. SZAKASZ — HELYZETFELMÉRÉS (csak olvas). FUTTASD ELŐSZÖR, ÉS KÜLDD VISSZA!
-- ════════════════════════════════════════════════════════════════════════════

-- 1a. ⚠️ A LEGFONTOSABB: be van-e kapcsolva az RLS a profiles táblán?
--     Várt HELYES érték: rls_bekapcsolva = true.
--     Ha FALSE → azonnali teendő (lásd a 2b. szakaszt), mert akkor a fenti
--     GRANT korlátlanul érvényesül, és minden profil nyitva áll.
SELECT c.relname            AS tabla,
       c.relrowsecurity     AS rls_bekapcsolva,
       c.relforcerowsecurity AS rls_kikenyszeritve_tulajdonosra
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'profiles';

-- 1b. UGYANEZ MINDEN public táblára — ahol `rls_bekapcsolva = false`, ott a
--     policy-k tétlenek. Küldd vissza a false sorokat!
SELECT c.relname AS tabla, c.relrowsecurity AS rls_bekapcsolva
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relrowsecurity, c.relname;

-- 1c. Az anon szerepkör ÖSSZES tábla-jogosultsága (nem csak a profiles).
--     Néhány JOGOS: access_requests INSERT (publikus hozzáférés-kérő űrlap),
--     nevnap SELECT, a publikus oldal tábláinak SELECT-je. Az ÍRÁSI jogok
--     (INSERT/UPDATE/DELETE/TRUNCATE) gyülekezeti adat-táblákon NEM jogosak.
SELECT table_name,
       string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS jogok
FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND table_schema = 'public'
GROUP BY table_name
ORDER BY
  (string_agg(DISTINCT privilege_type, ',') LIKE '%DELETE%'
   OR string_agg(DISTINCT privilege_type, ',') LIKE '%TRUNCATE%') DESC,
  table_name;

-- 1d. Van-e olyan policy a profiles táblán, amely az anon-ra (public/anon
--     szerepkör) is vonatkozik? Ha VAN, az anon az RLS-en át is bejut.
SELECT policyname, cmd, roles::text, COALESCE(qual, '(nincs USING)') AS using_feltetel
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. SZAKASZ — JAVÍTÁS
-- ════════════════════════════════════════════════════════════════════════════

-- 2a. Az anon jogainak visszavonása a profiles tábláról.
--     Ez akkor is helyes lépés, ha az RLS be van kapcsolva: védelmi rétegnek
--     nem szabad egyetlen kapcsolón múlnia (defense in depth).
--
--     ⚠️ ELLENŐRZÉS ELŐTTE: az 1c. eredményében nézd meg, hogy a `profiles`-on
--     kívül más tábláknál is van-e DELETE/TRUNCATE az anon-nál — azokat is
--     érdemes ugyanígy visszavonni, de előbb küldd vissza a listát.

BEGIN;

REVOKE ALL ON public.profiles FROM anon;

-- Biztos, ami biztos: a jövőbeli táblákra vonatkozó alapértelmezett jogokat is
-- ellenőrizzük (ha valamikor `GRANT ALL ... TO anon` default privilege készült,
-- minden ÚJ tábla is így születne). Ez csak kiírja — nem módosít.
COMMIT;

SELECT defaclrole::regrole AS tulajdonos,
       defaclnamespace::regnamespace AS sema,
       defaclobjtype AS objektum_tipus,
       defaclacl AS alapertelmezett_jogok
FROM pg_default_acl
WHERE array_to_string(defaclacl, ',') LIKE '%anon%';

-- 2b. ⚠️ CSAK AKKOR FUTTASD, HA az 1a. `rls_bekapcsolva = false`-t adott!
--     (Kikapcsolt RLS mellett a policy-k tétlenek — a bekapcsolás azonnal
--     életbe lépteti a meglévő, helyes policy-ket. Ha bizonytalan vagy,
--     előbb küldd vissza az 1a.–1d. eredményét, és együtt döntünk.)
--
-- ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. SZAKASZ — ELLENŐRZÉS a visszavonás után
-- ════════════════════════════════════════════════════════════════════════════

-- 3a. Várt: 0 sor (az anon-nak nincs többé joga a profiles táblán).
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'profiles' AND grantee = 'anon';

-- 3b. Az `authenticated` jogai maradjanak meg (az alkalmazás ezekkel dolgozik).
--     Várt: SELECT, INSERT, UPDATE (a DELETE hiánya rendben van).
SELECT grantee, string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS jogok
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'profiles'
GROUP BY grantee
ORDER BY grantee;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. ALKALMAZÁS-PRÓBA a visszavonás után
-- ════════════════════════════════════════════════════════════════════════════
-- • Bejelentkezés → a saját profil betöltődik, a fejlécben a név/avatar látszik
-- • /hozzaferes-kerese (KIJELENTKEZVE) → az űrlap elküldhető
-- • Publikus gyülekezeti oldal (KIJELENTKEZVE) → a lelkész neve/adatai látszanak
--   (ezek SECURITY DEFINER RPC-ből jönnek, nem a tábla-jogból)
-- • Jelszó-visszaállítás és az első belépés utáni varázsló
