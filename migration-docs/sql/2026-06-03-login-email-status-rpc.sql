-- ============================================================================
-- 2026-06-03 — login_email_status() RPC
-- ============================================================================
-- CÉL (Endre kérése):
-- A bejelentkezésnél ha valaki olyan email-lel próbálkozik, ami NINCS
-- regisztrálva, a rendszer mondja meg explicit, hogy "nincs regisztrálva" —
-- ne pedig a generikus "érvénytelen email/jelszó"-t.
--
-- HÁTTÉR:
-- A Supabase `signInWithPassword()` biztonsági okból (anti-enumeration) UGYANAZT
-- a "Invalid login credentials" hibát adja mind a nem létező email-re, mind a
-- rossz jelszóra. Ezért az app maga NEM tudja megkülönböztetni a kettőt a
-- kliensből/anon kontextusból.
--
-- MEGOLDÁS:
-- Egy SECURITY DEFINER RPC, ami a `profiles` táblából (ami a `handle_new_user`
-- trigger révén minden auth.users-t tükröz) megnézi, létezik-e az adott email,
-- és ha igen, milyen státusszal. A login server-action CSAK egy sikertelen
-- bejelentkezés UTÁN hívja, hogy pontosítsa a hibaüzenetet.
--
-- ADATVÉDELEM / KOCKÁZAT:
-- Ez egy szándékos email-enumeration végpont — egy támadó lekérdezheti, hogy
-- egy email létezik-e. Endre döntése alapján (belső, zárt egyházi rendszer,
-- alacsony kockázat) ez elfogadható a jobb UX-ért cserébe. A függvény NEM ad
-- vissza nevet/telefont/egyéb PII-t, csak a regisztrációs státuszt.
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.login_email_status(p_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RETURN 'not_registered';
  END IF;

  SELECT status INTO v_status
  FROM public.profiles
  WHERE lower(email) = lower(btrim(p_email))
  LIMIT 1;

  IF v_status IS NULL THEN
    RETURN 'not_registered';
  END IF;

  -- Lehetséges értékek: 'pending' | 'active' | (egyéb státusz)
  RETURN v_status;
END;
$$;

COMMENT ON FUNCTION public.login_email_status(text) IS
  'Visszaadja egy email regisztrációs státuszát (not_registered | pending | active | ...). A login-action hívja sikertelen bejelentkezés után, hogy pontos hibaüzenetet adjon. Szándékos enumeration-végpont, csak státuszt ad vissza (nincs PII). 2026-06-03.';

-- A login-action anon (be nem jelentkezett) kontextusból hívja:
GRANT EXECUTE ON FUNCTION public.login_email_status(text) TO anon, authenticated;

COMMIT;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────
-- Egy biztosan nem létező email → 'not_registered'
SELECT public.login_email_status('nincs-ilyen-email-xyz@example.com') AS varhato_not_registered;

-- Egy létező (pl. a master admin) email → a tényleges státusz (pl. 'active')
-- SELECT public.login_email_status('ide-egy-letezo-email@pelda.hu') AS varhato_statusz;
