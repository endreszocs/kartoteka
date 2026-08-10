-- KARTOTEKA — RLS-állapot ellenőrzés + maradék takarítás (2026-08-10)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- ELŐZMÉNY:
--   ✅ Az `anon` jogai a `profiles` tábláról VISSZAVONVA (a 3b. ellenőrzés
--      szerint már csak authenticated / postgres / service_role /
--      supabase_auth_admin szerepel).
--   ✅ A gyülekezet↔egyházmegye javító SQL lefutott, és a `congregations`
--      táblán ott a védő trigger (`congregations_protect_diocese`).
--
-- ⚠️ AMI MÉG HIÁNYZIK: a Supabase SQL Editor csak az UTOLSÓ lekérdezés
-- eredményét mutatja, ezért a legfontosabb szám még nem érkezett meg:
-- **be van-e kapcsolva az RLS**. Ez a fájl EGYETLEN kérdésre koncentrál,
-- hogy az eredmény ne vesszen el.
--
-- FUTTATÁSI MÓD: szakaszonként (jelöld ki a blokkot, és úgy futtasd).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. SZAKASZ — ⚠️ A LEGFONTOSABB: hol NINCS bekapcsolva az RLS?
-- ════════════════════════════════════════════════════════════════════════════
-- Ha egy táblánál `rls_bekapcsolva = false`, ott a policy-k TÉTLENEK, és
-- kizárólag a tábla-szintű jogok döntenek — vagyis minden bejelentkezett
-- felhasználó (a `profiles` esetében korábban akár anonim látogató is)
-- korlátlanul hozzáfér.
--
-- VÁRT HELYES EREDMÉNY: 0 sor.
-- Ha jönnek sorok — küldd vissza őket, és eldöntjük, melyiknél biztonságos
-- azonnal bekapcsolni (van hozzá helyes policy) és melyiknél kell előbb
-- policy-t írni.

SELECT c.relname AS tabla,
       c.relrowsecurity AS rls_bekapcsolva,
       (SELECT count(*) FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policyk_szama
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
ORDER BY policyk_szama DESC, c.relname;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. SZAKASZ — a gyülekezet↔egyházmegye javítás EREDMÉNYE
-- ════════════════════════════════════════════════════════════════════════════
-- VÁRT: 0 sor. Ami itt megjelenik, ahhoz kézzel kell egyházmegyét rendelni —
-- ezt már az /admin/gyulekezetek oldalon is meg tudod tenni (új gomb).

SELECT c.id, c.name, c.nev_hu, c.egyhazmegye AS szoveges_megye, c.status
FROM public.congregations c
WHERE c.diocese_id IS NULL
ORDER BY c.name;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. SZAKASZ — maradék jog-higiénia (opcionális, de ajánlott)
-- ════════════════════════════════════════════════════════════════════════════
-- A `profiles` táblán az `authenticated` szerepkörnek TRUNCATE joga is van.
-- A TRUNCATE-re az RLS SOHA nem vonatkozik — igaz, a PostgREST nem teszi
-- elérhetővé, tehát ma nem hívható meg a REST API-n át, de nincs rá szükség.
-- (A SELECT/INSERT/UPDATE marad — az alkalmazás ezekkel dolgozik.)

-- 3a. Mely táblákon van az `authenticated`-nek TRUNCATE joga? (tájékoztató)
SELECT table_name
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'authenticated'
  AND privilege_type = 'TRUNCATE'
ORDER BY table_name;

-- 3b. A TRUNCATE (és a felesleges REFERENCES/TRIGGER) visszavonása a
--     profiles tábláról. Futtatható; az alkalmazás egyiket sem használja.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM authenticated;

-- 3c. Ellenőrzés — VÁRT: authenticated → DELETE, INSERT, SELECT, UPDATE
SELECT grantee,
       string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS jogok
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'profiles'
GROUP BY grantee
ORDER BY grantee;
