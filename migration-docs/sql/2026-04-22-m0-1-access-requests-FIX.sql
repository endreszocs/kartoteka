-- 2026-04-22 — HOTFIX: check_access_request_rate_limit függvény
--
-- ══════════════════════════════════════════════════════════════════════════
--  KONTEXTUS
--
--  A 2026-04-22-m0-1-access-requests.sql migráció egy részén hibázott:
--    ERROR: 42P01: relation "v_count" does not exist
--
--  A hiba forrása: `LANGUAGE plpgsql` + `DECLARE v_count integer` + `SELECT ... INTO v_count`
--  kombinációt a Supabase Dashboard SQL Editor parser néha nem kezeli jól —
--  az `INTO v_count`-ot táblahivatkozásnak nézi.
--
--  A függvény LOGIKÁJA ugyanaz marad, csak a nyelvet cseréljük: plpgsql → sql.
--  Az SQL-függvény **egyetlen SELECT-expression**, nincs változó, nincs INTO,
--  nincs plpgsql-parser-paradoxon. Ez a PostgreSQL ajánlott mintája egyszerű
--  logikához.
--
--  A migráció többi része (tábla, indexek, RLS policy-k, trigger) **nagy
--  valószínűséggel már lefutott** a hiba előtt — ellenőrzésül a fájl végén
--  SELECT-ek.
--
--  FUTTATÁS:
--   1. Supabase Dashboard → SQL Editor
--   2. Másold be ennek a fájlnak a teljes tartalmát
--   3. Run → kb. 1 másodperc alatt lefut
--   4. Verify: a fájl végén az ellenőrző SELECT a függvényt `true`-val teszteli
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. A hibás függvény eldobása (ha létezik)
-- ─────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.check_access_request_rate_limit(TEXT);

-- ─────────────────────────────────────────────────────────────────────
-- 2. Új SQL-függvény (nem plpgsql!)
-- ─────────────────────────────────────────────────────────────────────
-- Logika: ha nincs ip_hash → engedd át. Ha van → max 3 kérés / 24h.
-- A SELECT boolean értéket ad vissza egyetlen expression-ben.

CREATE OR REPLACE FUNCTION public.check_access_request_rate_limit(p_ip_hash TEXT)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT
    -- Ha nincs ip_hash megadva, engedjük át (pl. Tauri kliens)
    p_ip_hash IS NULL
    OR btrim(p_ip_hash) = ''
    -- Különben: 3-nál kevesebb kérés volt-e az utóbbi 24 órában
    OR (
      SELECT COUNT(*)
      FROM public.access_requests
      WHERE ip_hash = p_ip_hash
        AND created_at > now() - interval '24 hours'
    ) < 3;
$func$;

COMMENT ON FUNCTION public.check_access_request_rate_limit IS
  'Visszaadja, szabad-e újabb access-request-et létrehozni az adott ip_hash-ről (max 3 / 24h). A publikus űrlap hívja az M0.2-től. SQL-függvény (nem plpgsql), hogy a Supabase parser ne akadjon meg.';

-- ─────────────────────────────────────────────────────────────────────
-- 3. Ellenőrzés — a függvény működik-e
-- ─────────────────────────────────────────────────────────────────────

-- Üres ip_hash → true
SELECT public.check_access_request_rate_limit('')        AS ures_ip_hash_test;
SELECT public.check_access_request_rate_limit(NULL)      AS null_ip_hash_test;

-- Random ip_hash (nincs még rekord) → true
SELECT public.check_access_request_rate_limit('teszt-ip-hash-abc123') AS random_ip_test;

-- A tábla állapota (ellenőrzés, hogy minden egyéb lefutott a korábbi migráción)
SELECT
  'access_requests' AS tabla,
  COUNT(*) AS sorok,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending,
  COUNT(*) FILTER (WHERE status = 'approved') AS approved,
  COUNT(*) FILTER (WHERE status = 'rejected') AS rejected
FROM public.access_requests;

-- Policy-k számlálása (3-nek kell lennie)
SELECT COUNT(*) AS policy_count
FROM pg_policies
WHERE tablename = 'access_requests';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- Ha a VERIFY output NEM az elvártat adja:
--   - ures_ip_hash_test, null_ip_hash_test, random_ip_test → true
--   - sorok = 0
--   - policy_count = 3
-- Akkor jelezd Endrének, mielőtt tovább lépünk!
-- ─────────────────────────────────────────────────────────────────────
