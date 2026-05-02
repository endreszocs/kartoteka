-- ============================================================================
-- RLS HIBA JAVÍTÁS — `public._merge_v7_result` tábla
-- ============================================================================
-- 2026-05-02 — Supabase Advisor: "RLS Disabled in Public" CRITICAL
--
-- HÁTTÉR:
-- A `public._merge_v7_result` táblát a `2026-04-26-FIX-merge-spouses-v7-do-block.sql`
-- migráció hozta létre, hogy egy DO-blokk eredményét (phase / merged / skipped)
-- a Supabase Studio-ban visszaolvasható legyen (mert a NOTICE-okat nem mindig
-- mutatja). Ez egy IDEIGLENES diagnosztikai tábla — már nincs aktív szerepe.
--
-- A tábla mostantól RLS nélkül publikusan elérhető a PostgREST-en keresztül.
-- Habár nem tartalmaz érzékeny adatot (csak migráció-statisztika sorszámokkal),
-- a Supabase Advisor "CRITICAL" szintű figyelmeztetést ad.
--
-- MEGOLDÁS:
-- A tábla **törlése**. Ha a migráció statisztikájára még szükség lenne,
-- a v7-es DO-blokk újra futtatható, ami újra létrehozza.
--
-- Ugyanakkor preventív védelemként minden más `_*` (underscore-prefix)
-- ideiglenes táblát is áttekintünk és RLS-policy nélküli publikus táblákat
-- felderítünk.
-- ============================================================================

-- ── 1. A KONKRÉT TÁBLA TÖRLÉSE ────────────────────────────────────────────

DROP TABLE IF EXISTS public._merge_v7_result;

-- Ellenőrzés:
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = '_merge_v7_result')
    THEN 'HIBA: a tábla még létezik!'
    ELSE 'OK: _merge_v7_result tábla törölve.'
  END AS eredmeny;

-- ── 2. VAN-E TOVÁBBI RLS NÉLKÜLI PUBLIKUS TÁBLA? ──────────────────────────
-- Az alábbi lekérdezés minden olyan public-schema táblát listáz, amelyen
-- nincs engedélyezve a Row-Level Security. A `_*` prefix-szű ideiglenes
-- táblákat különösen ajánlott vagy törölni, vagy RLS-policy-vel védeni.

SELECT
  c.relname AS tabla_neve,
  c.relrowsecurity AS rls_engedelyezve,
  COALESCE(
    (SELECT COUNT(*) FROM pg_policy p WHERE p.polrelid = c.oid),
    0
  ) AS policy_szam,
  CASE
    WHEN c.relname LIKE '\_%' ESCAPE '\' THEN '⚠ Ideiglenes/diagnosztikai (underscore-prefix)'
    WHEN c.relrowsecurity = false THEN '⚠ RLS LETILTVA — ellenőrizd!'
    ELSE 'OK'
  END AS megjegyzes
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
ORDER BY c.relname;

-- ── 3. PUBLIKUS OLDAL JOGOSULTSÁG DIAGNOSZTIKA (5. észrevétel) ─────────────
-- A felhasználó panasza: "A gyülekezeti oldal beállításánál azt írja:
-- Nincs jogosultságod ehhez a művelethez."
--
-- OK: A `current_user_can_access_congregation()` RLS függvény a
-- `profiles.role = 'admin'` alapján engedi a globális hozzáférést.
-- Az APP a `MASTER_ADMIN_EMAIL` env-var-ral is admin-rangra emel egy
-- felhasználót — DE a Supabase ezt nem ismeri. Ha a master-email user
-- profile-jában `role` ≠ `'admin'`, a RLS visszadob 42501-et.

-- 3.1 — Ki a Master admin most? (Egyetlen sor:)
SELECT
  u.id,
  u.email,
  p.role AS profiles_role,
  p.status,
  p.full_name,
  CASE
    WHEN p.role = 'admin' THEN 'OK — globális RLS hozzáférés'
    ELSE '⚠ NEM admin DB-szinten — futtasd a 3.2 blokkot az alábbi user-en'
  END AS diagnozis
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email IN (
  -- Itt az env-var MASTER_ADMIN_EMAIL értéke (cseréld ki a saját email-edre):
  'endreszocs@gmail.com'
)
ORDER BY u.email;

-- 3.2 — FIX: a master admin profile-ját 'admin' role-ra állítjuk
-- (csak akkor futtasd ha a 3.1 ⚠ jelet adott!)
--
--   UPDATE public.profiles
--      SET role = 'admin', status = 'active'
--    WHERE id IN (
--      SELECT u.id FROM auth.users u
--      WHERE u.email = 'endreszocs@gmail.com'
--    );
--
-- A 3.2 commentelve van — szándékosan, hogy ne változtasson semmit
-- a felhasználó tudtán kívül. Ha a 3.1 "⚠"-t mutat, akkor:
--   1) Másold ki a 3.2 UPDATE-et,
--   2) Vedd ki a "--" commenteket,
--   3) Futtasd.
-- A jövőben a publikus oldal beállítások mentés sikeresen lefut.

-- ── 4. EGYÉB AJÁNLÁS ───────────────────────────────────────────────────────
-- Ha a 2. blokk SELECT-je további RLS-mentes publikus táblákat is mutat,
-- vegyük fel a Sprint U.5-be a takarítást. Az `_*`-prefix ideiglenes
-- diagnosztikai táblák biztonságosan törölhetők.

-- ============================================================================
-- KÉSZ. A felhasználó (Szőcs Endre rendszergazda) futtatja a Supabase-en.
-- Az 1. blokk után a Supabase Advisor "RLS Disabled in Public" hibája eltűnik.
-- A 3.1+3.2 a "Nincs jogosultságod" hiba megoldása.
-- ============================================================================
