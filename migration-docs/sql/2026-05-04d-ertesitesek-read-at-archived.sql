-- =========================================================================
-- 2026-05-04 — ertesitesek: read_at + archived mezők
-- =========================================================================
-- KONTEXTUS:
--   Endre észrevétele (2026-05-04): a notification (értesítés) modalban
--   az olvasás után az üzenet eltűnik a listából — nem lehet többé újra
--   megnézni. Ha a user véletlenül félrekattint, elveszett az üzenet.
--
-- KÉRT VISELKEDÉS:
--   - Az olvasatlan üzenetek élnek, amíg meg nem nyitja a user.
--   - Az olvasott üzenetek 24 óráig még megjelennek a listában (pl. ha
--     valaki visszanéz, hogy mit is olvasott).
--   - Manuális "archív" gomb — a user explicit eltüntetheti az olvasottat.
--   - A 24h után automatikusan eltűnnek a listából (de nem törlődnek a DB-ből).
--
-- ÚJ MEZŐK:
--   - read_at TIMESTAMPTZ — mikor olvasta el (NULL = még nem olvasta)
--   - archived BOOLEAN — true = manuálisan archiválta a user
--   - archived_at TIMESTAMPTZ — mikor archiválta
--
-- TRIGGER:
--   - set_ertesitesek_read_at — automatikusan beállítja a read_at-ot
--     amikor az olvasva false → true átmenet történik.
-- =========================================================================

ALTER TABLE public.ertesitesek
  ADD COLUMN IF NOT EXISTS read_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.ertesitesek.read_at IS
  'Mikor olvasta a user az értesítést. NULL = még nem olvasta. A bell-dropdown 24 órán át mutatja a már olvasott üzeneteket.';
COMMENT ON COLUMN public.ertesitesek.archived IS
  'TRUE = a user manuálisan archiválta. Az archiváltak nem jelennek meg a bell-dropdown-on, de a DB-ben megmaradnak.';
COMMENT ON COLUMN public.ertesitesek.archived_at IS
  'Mikor archiválta a user.';

-- ──────────────────────────────────────────────────────────────────────────
-- Trigger: read_at auto-set
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_ertesitesek_read_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Olvasva false → true: ha read_at NULL, beállítjuk a NOW()-ra
  IF NEW.olvasva = TRUE AND (OLD.olvasva IS DISTINCT FROM TRUE) AND NEW.read_at IS NULL THEN
    NEW.read_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_ertesitesek_read_at() IS
  'Automatikusan beállítja az ertesitesek.read_at mezőt amikor a user olvasottra állítja az üzenetet.';

DROP TRIGGER IF EXISTS trg_ertesitesek_read_at ON public.ertesitesek;
CREATE TRIGGER trg_ertesitesek_read_at
  BEFORE UPDATE ON public.ertesitesek
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ertesitesek_read_at();

-- ──────────────────────────────────────────────────────────────────────────
-- INDEX a gyors query-hez (user_id + archived + read_at szerinti rendezés)
-- ──────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ertesitesek_user_active
  ON public.ertesitesek (user_id, archived, olvasva, read_at DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- Backfill: a már létező olvasott (olvasva=true) üzenetek read_at-jét
-- a created_at-ra állítjuk (best-effort, nincs jobb adatunk)
-- ──────────────────────────────────────────────────────────────────────────

UPDATE public.ertesitesek
   SET read_at = created_at
 WHERE olvasva = TRUE AND read_at IS NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- ELLENŐRZÉS
-- ──────────────────────────────────────────────────────────────────────────

-- 1. Az új mezők léteznek?
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ertesitesek'
  AND column_name IN ('read_at', 'archived', 'archived_at')
ORDER BY column_name;

-- 2. A trigger létezik?
SELECT trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'ertesitesek'
  AND trigger_name = 'trg_ertesitesek_read_at';

-- 3. Hány már olvasott üzenet kapott read_at-ot a backfill során?
SELECT COUNT(*) AS backfilled_count
FROM public.ertesitesek
WHERE olvasva = TRUE AND read_at IS NOT NULL;
