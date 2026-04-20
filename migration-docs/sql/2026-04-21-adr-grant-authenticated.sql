-- ══════════════════════════════════════════════════════════════════
-- 2026-04-21 — ADR-táblák GRANT SELECT authenticated-nak
-- ──────────────────────────────────────────────────────────────────
-- PROBLÉMA (diagnózis):
--   Az `adr*` táblákra 2026-04-13-kor bekerült RLS + policy (USING(true)),
--   DE a SELECT GRANT nincs explicit kiadva az `authenticated` role-nak.
--   A Postgres 3-rétegű szabálya szerint:
--     1. GRANT — nélküle 42501 vagy csendes üres
--     2. RLS — tartalom-szűrés
--     3. App — üzleti logika
--   A 2. réteg önmagában NEM elegendő, ha az 1. hiányzik.
--
--   TÜNET: a wizardban a megye dropdown üres marad (csak a "— Válaszd ki —"
--   és "— Külföldi cím —" látszik).
--
-- JAVÍTÁS:
--   Explicit GRANT SELECT minden `adr*` táblára az `authenticated` role-nak.
--   (A policy már kezeli a USING(true)-t — így minden auth user olvashatja.)
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- GRANT SELECT — reference adat, minden bejelentkezett user olvashatja
GRANT SELECT ON public.adrcountry TO authenticated;
GRANT SELECT ON public.adrcounty TO authenticated;
GRANT SELECT ON public.adrlocality TO authenticated;
GRANT SELECT ON public.adrstreet TO authenticated;
GRANT SELECT ON public.adrlocality_alias TO authenticated;

-- Az adrlocality_id az egész_szám típusú — FK használat során szükség van
-- a sequence-en lévő USAGE-re is, ha a user később INSERT-elne is. Most csak
-- SELECT, de kiadjuk.
GRANT USAGE ON SEQUENCE public.adrcountry_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.adrcounty_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.adrlocality_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.adrstreet_id_seq TO authenticated;

COMMIT;

-- ══════════════════════════════════════════════════════════════════
-- ELLENŐRZÉSEK
-- ══════════════════════════════════════════════════════════════════

-- [1/3] GRANT SELECT minden adr* táblán az authenticated-nak?
-- Elvárás: 5 sor (mindegyik adr* tábla + alias)
SELECT table_name, privilege_type, grantee
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('adrcountry', 'adrcounty', 'adrlocality', 'adrstreet', 'adrlocality_alias')
  AND privilege_type = 'SELECT'
  AND grantee = 'authenticated'
ORDER BY table_name;

-- [2/3] RLS engedélyezve van mindegyiken?
-- Elvárás: mindegyik relrowsecurity = true
SELECT c.relname, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('adrcountry', 'adrcounty', 'adrlocality', 'adrstreet', 'adrlocality_alias')
ORDER BY c.relname;

-- [3/3] Egy működő authenticated lekérdezés szimuláció — megyék count
-- (most mint postgres futtatod, de a GRANT utána authenticated-nak is OK lesz)
SELECT COUNT(*) AS megye_count FROM public.adrcounty;
-- Elvárás: 42
