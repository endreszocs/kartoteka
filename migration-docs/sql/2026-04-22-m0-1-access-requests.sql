-- 2026-04-22 — M0.1: access_requests tábla + RLS + audit-trigger
--
-- ══════════════════════════════════════════════════════════════════════════
--  FIGYELEM: Endre futtatja Supabase SQL Editor-ben.
--
--  Ez az M0.1 fázis alapja (lásd KARTOTEKA-tauri-kivitelezesi-terv-2026-04-21.md).
--  A Tauri-migráció előkészítő lépése: hozzáférés-kérelmek nyilvántartása.
--
--  FUTTATÁS:
--   1. Supabase Dashboard → SQL Editor
--   2. Másold be a fájl teljes tartalmát (BEGIN..COMMIT)
--   3. Run → 1-2 másodperc alatt lefut
--   4. Verify: az ellenőrző SELECT-ek a fájl végén
-- ══════════════════════════════════════════════════════════════════════════
--
-- KONTEXTUS
--
-- A szakértői terv szerint a regisztráció ezentúl NEM nyílt, hanem
-- hozzáférés-kérelem-alapú. A publikus oldalon access-request űrlap jelenik
-- meg, admin elfogadja → user létrejön. Ez a tábla tárolja a kérelmeket.
--
-- Az access-request és a profile-létrehozás két különálló folyamat:
--   1. Anon user kitölti az űrlapot → access_requests sor (status='pending')
--   2. Admin átnézi, elfogadja → admin UI-ban "Approve" gomb →
--      a rendszer invite-email-t küld a usernek → Supabase Auth user létrejön →
--      a profiles.status = 'approved'
--
-- Az M0.1-ben CSAK a táblát és az admin UI-t készítjük el.
-- Az M0.2-ben lesz a publikus űrlap és az email-integráció.
-- Az M0.3-ban lesz a profiles.status = 'pending' → 'approved' workflow.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. access_requests tábla
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Kötelező mezők
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  requested_role TEXT NOT NULL CHECK (requested_role IN (
    'lelkesz',
    'esperes',
    'egyhazmegyei_admin',
    'egyhazkeruleti_admin',
    'konyvelo',
    'egyhazmegyei_szamvevo'
  )),

  -- Opcionális mezők
  congregation_slug TEXT,              -- melyik gyülekezethez tartozna
  phone TEXT,                          -- kapcsolattartás
  justification TEXT,                  -- rövid indoklás
  referrer TEXT,                       -- honnan tudta meg (pl. „esperesi körlevél")

  -- Munkafolyamat
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,               -- csak ha status='rejected'
  admin_notes TEXT,                    -- csak admin látja, belső kommunikáció

  -- Meta
  ip_hash TEXT,                        -- SHA-256(ip) — spam-ellenőrzéshez, nem reverzibilis
  user_agent TEXT,                     -- böngésző-azonosító (opcionális)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ha elfogadott → erre a user-re kapcsolódik (a Supabase Auth létrehozás után)
  resulting_user_id UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE public.access_requests IS
  'Hozzáférés-kérelmek nyilvántartása. A publikus oldalon az anonim user kitölti, az admin elfogadja vagy elutasítja. Az M0.1 fázis része a Tauri-migrációhoz.';

COMMENT ON COLUMN public.access_requests.resulting_user_id IS
  'A létrehozott auth.users.id, miután az admin elfogadta a kérelmet és a Supabase Auth user létrejött.';

COMMENT ON COLUMN public.access_requests.ip_hash IS
  'SHA-256 hash az IP-címből (nem az IP maga), spam-detekcióhoz. GDPR-kompatibilis.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. Indexek
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_access_requests_status
  ON public.access_requests(status)
  WHERE status = 'pending';          -- részleges index: a pending kérelmek gyors keresése

CREATE INDEX IF NOT EXISTS idx_access_requests_email
  ON public.access_requests(lower(email));

CREATE INDEX IF NOT EXISTS idx_access_requests_created_at
  ON public.access_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_access_requests_ip_hash
  ON public.access_requests(ip_hash, created_at DESC);   -- rate-limit ellenőrzéshez

-- ─────────────────────────────────────────────────────────────────────
-- 3. updated_at trigger
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_access_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS access_requests_updated_at ON public.access_requests;
CREATE TRIGGER access_requests_updated_at
  BEFORE UPDATE ON public.access_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_access_requests_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 4. RLS policy-k
-- ─────────────────────────────────────────────────────────────────────
-- Védelmi modell:
--   - Anon user INSERT-elhet (a publikus űrlapról), más semmit sem lát
--   - Admin (profiles.role='admin') mindent lát és szerkeszthet
--   - Másik user semmit sem lát (még a saját email-kérelmét sem, tudatosan:
--     a visszaigazolást emailben kapja)

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- INSERT — anon is tud (publikus űrlap)
CREATE POLICY "Anyone can submit an access request"
  ON public.access_requests
  FOR INSERT
  WITH CHECK (true);

-- SELECT — csak admin
CREATE POLICY "Only admin can view access requests"
  ON public.access_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- UPDATE — csak admin
CREATE POLICY "Only admin can update access requests"
  ON public.access_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- DELETE — egyelőre tiltva (audit-megőrzés). Ha későbbi GDPR-kérelem alapján törölni kell,
-- akkor admin-per-eset módon csináljuk (master user + audit-log).

-- ─────────────────────────────────────────────────────────────────────
-- 5. Rate-limiting segédfüggvény (ip_hash alapján)
-- ─────────────────────────────────────────────────────────────────────
-- A publikus űrlap ellenőrzi: 1 IP-ről max 3 kérelem 24 órában
-- (ezt az M0.2-ben a server action hívja)

CREATE OR REPLACE FUNCTION public.check_access_request_rate_limit(p_ip_hash TEXT)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_ip_hash IS NULL OR p_ip_hash = '' THEN
    RETURN true;  -- nem kötelező az ip_hash (pl. Tauri-ból)
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.access_requests
  WHERE ip_hash = p_ip_hash
    AND created_at > now() - interval '24 hours';

  RETURN v_count < 3;
END;
$$;

COMMENT ON FUNCTION public.check_access_request_rate_limit IS
  'Visszaadja, szabad-e újabb access-request-et létrehozni az adott ip_hash-ről (max 3 / 24h). A publikus űrlap hívja az M0.2-től.';

-- ─────────────────────────────────────────────────────────────────────
-- 6. Ellenőrzés — futtatás után Endre látja
-- ─────────────────────────────────────────────────────────────────────

-- Hány sor van a táblában (üresen kezdünk)
SELECT
  'access_requests' AS tabla,
  COUNT(*) AS sorok,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending,
  COUNT(*) FILTER (WHERE status = 'approved') AS approved,
  COUNT(*) FILTER (WHERE status = 'rejected') AS rejected
FROM public.access_requests;

-- Policy-k az access_requests táblán
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  LEFT(qual::text, 60) AS using_condition,
  LEFT(with_check::text, 60) AS check_condition
FROM pg_policies
WHERE tablename = 'access_requests'
ORDER BY cmd, policyname;

-- RLS státusz ellenőrzés
SELECT
  c.relname AS tabla,
  c.relrowsecurity AS rls_on,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
WHERE c.relname = 'access_requests'
  AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Rate-limit függvény tesztelés (üres ip_hash → true)
SELECT public.check_access_request_rate_limit('') AS rate_limit_test;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- ROLLBACK (ha szükséges)
-- ─────────────────────────────────────────────────────────────────────

-- BEGIN;
-- DROP FUNCTION IF EXISTS public.check_access_request_rate_limit(TEXT);
-- DROP TRIGGER IF EXISTS access_requests_updated_at ON public.access_requests;
-- DROP FUNCTION IF EXISTS public.tg_access_requests_updated_at();
-- DROP TABLE IF EXISTS public.access_requests;
-- COMMIT;
