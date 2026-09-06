-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ⛔ EZT A FÁJLT NE FUTTASD ÚJRA — FELÜLÍRT FÜGGVÉNY-TÖRZSET HORDOZ       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Ez a migráció annak idején helyes volt, és a történetet dokumentálja — de
-- azóta biztonsági javítás írta felül az alábbi függvény(ek) törzsét. A
-- `CREATE OR REPLACE` NEM egyirányú: ha ezt a fájlt ma bárki újrafuttatja
-- (új környezet felállításakor, vagy egy másik hibát keresve), NÉMÁN
-- visszaveszi a javítást. Az adatbázis nem tiltakozik, a felület nem
-- változik, és a következő auditig senki nem veszi észre.
--
-- AMI ITT ELAVULT:
--   · handle_new_user()
--     kanonikus törzs: migration-docs/sql/2026-09-04-auth-p0-javitasok-1.sql
--     ha mégis lefut: ⛔ P0: a regisztráló metaadata ÚJRA eldöntené a profiles.role értékét
--
-- Az őrszem, ami ezt a szabályt őrzi: scripts/selftest-sql-kanonikus-torzs.mjs
-- (a „NE FUTTASD" jelölés adja a felmentést — ezért ne töröld ezt a fejlécet).

-- ============================================================================
-- BUG-FIX — auth.users → profiles automatikus szinkronizáció
-- ============================================================================
-- 2026-05-02 — Felhasználó panasza: "Az autentifikált usereknél megjelenik még
-- egy másik személy is, de a rendszer nem mutatja!"
--
-- HÁTTÉR:
-- A v0.9.37 új signUp-flow-ja a `supabase.auth.signUp()`-pal létrehozza az
-- `auth.users` sort — DE a `public.profiles` táblába automatikusan NEM kerül
-- be sor, mert a rendszerben nincs `handle_new_user` trigger.
--
-- KÖVETKEZMÉNY:
-- - A regisztrált user az `auth.users`-ben van (be tudna lépni)
-- - DE a `/admin/felhasznalok` oldalon NEM JELENIK MEG (a UsersTab a
--   `profiles` táblából olvas)
-- - Az admin nem tudja jóváhagyni vagy szerepkört adni neki
--
-- MEGOLDÁS (3 lépéses):
--   1. handle_new_user() trigger — minden új auth.users-re létrehoz egy
--      'pending' státuszú profile-sort
--   2. Backfill: a meglévő auth.users sorok-ra is létrehozzuk a hiányzó
--      profile-okat
--   3. (App-oldali biztosítékot a v0.9.39 deploy hozza)
-- ============================================================================

BEGIN;

-- ── 1. TRIGGER ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Idempotens: ha már van profile-sor, kihagyjuk (pl. a master-admin email
  -- profilját kézzel hoztuk létre a régi flow-ban)
  INSERT INTO public.profiles (id, email, full_name, status, role, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      ''
    ),
    'pending',
    COALESCE(
      NEW.raw_user_meta_data->>'requested_role',
      'lelkesz'
    ),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user IS
  'Auth.users INSERT-kor automatikusan létrehoz egy pending státuszú profile-sort. v0.9.39 (2026-05-02).';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 2. BACKFILL — a meglévő auth.users sorok-ra hiányzó profile-ok ────────

INSERT INTO public.profiles (id, email, full_name, status, role, created_at)
SELECT
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    ''
  ) AS full_name,
  'pending' AS status,
  COALESCE(
    u.raw_user_meta_data->>'requested_role',
    'lelkesz'
  ) AS role,
  COALESCE(u.created_at, now()) AS created_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

COMMIT;

-- ── 3. ELLENŐRZÉS ────────────────────────────────────────────────────────

-- 3.1 — Trigger létezik?
SELECT
  trigger_name,
  event_manipulation,
  event_object_schema || '.' || event_object_table AS table_name,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- 3.2 — Mennyi az auth.users és profiles különbsége?
SELECT
  (SELECT COUNT(*) FROM auth.users) AS auth_users_db,
  (SELECT COUNT(*) FROM public.profiles) AS profiles_db,
  (
    SELECT COUNT(*) FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
  ) AS hianyzo_profile;

-- Várt: hianyzo_profile = 0 (mind szinkronizált)

-- 3.3 — Az új profile-ok listája (status='pending')
SELECT
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.status,
  p.created_at
FROM public.profiles p
WHERE p.status = 'pending'
ORDER BY p.created_at DESC
LIMIT 20;

-- ============================================================================
-- KÉSZ. A felhasználó (Szőcs Endre rendszergazda) futtatja a Supabase-en.
-- A futtatás után:
--   - Minden meglévő auth.users-nek lesz profile-sora (pending státuszban)
--   - Új signUp-ok automatikusan létrehoznak pending profile-t
--   - A /admin/felhasznalok oldalon megjelennek
-- ============================================================================
