-- 2026-07-11 — Admin licenc-CRUD: az admin-felületről kibocsátható licenc
--
-- ══════════════════════════════════════════════════════════════════════════
--  FUTTATÁS: Endre → Supabase SQL Editor
--
--  HÁTTÉR (admin-redesign 2. kör): az „Eszközök és napló" oldal Licencek füle
--  mostantól teljes CRUD-ot kínál (kibocsátás, hosszabbítás, szerkesztés,
--  visszavonás/visszaállítás). A `licenses.issued_jwt` oszlop azonban
--  NOT NULL, alapérték nélkül — az admin-kibocsátáskor még NINCS aláírt JWT
--  (azt az M5 desktop-aktiválás tölti majd ki). Emiatt az INSERT 23502-vel
--  bukna.
--
--  Ez a migráció alapértéket ('') ad az issued_jwt oszlopnak, hogy az admin
--  JWT nélkül is létrehozhasson licencet. A desktop offline-ellenőrzés
--  szempontjából a séma-szemantika VÁLTOZATLAN: az üres JWT = „még nem
--  aktivált" licenc, amit az M5 aláír.
--
--  Amíg ez a migráció NEM fut le, a UI akkor is működik: a server action
--  (createLicense) felismeri a 23502-t és üres placeholder-rel újrapróbál.
--  A migráció ezt a fallbacket teszi feleslegessé és tisztává.
--
--  Az RLS-policy-k (admin_manages_licenses INSERT, admin_updates_licenses
--  UPDATE, mindkettő public.is_admin()) MÁR léteznek a
--  2026-04-23-m0-5-devices-licenses-audit.sql-ből — itt csak megerősítjük
--  őket idempotensen.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. issued_jwt alapérték — az admin JWT nélkül is kibocsáthat licencet
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.licenses
  ALTER COLUMN issued_jwt SET DEFAULT '';

COMMENT ON COLUMN public.licenses.issued_jwt IS
  'Offline-olvasható aláírt licenc-JWT. Admin-kibocsátáskor üres (''''), az M5 desktop-aktiválás tölti ki. Üres = még nem aktivált licenc.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. RLS-policy-k megerősítése (idempotens) — admin teljes CRUD
--    (a SELECT/INSERT/UPDATE már létezik; DELETE tiltva marad audit-okból)
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_manages_licenses" ON public.licenses;
CREATE POLICY "admin_manages_licenses"
  ON public.licenses FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_updates_licenses" ON public.licenses;
CREATE POLICY "admin_updates_licenses"
  ON public.licenses FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 3. Ellenőrzés
-- ─────────────────────────────────────────────────────────────────────

SELECT
  column_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'licenses'
  AND column_name = 'issued_jwt';

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'licenses'
ORDER BY policyname;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- Rollback
-- ─────────────────────────────────────────────────────────────────────
-- BEGIN;
-- ALTER TABLE public.licenses ALTER COLUMN issued_jwt DROP DEFAULT;
-- COMMIT;
