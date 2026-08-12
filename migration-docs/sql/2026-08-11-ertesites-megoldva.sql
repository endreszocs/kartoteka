-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTÉKA — ÉRTESÍTÉS-ÉLETCIKLUS: „A BAJ ELMÚLT"
-- Fájl:     migration-docs/sql/2026-08-11-ertesites-megoldva.sql
-- Dátum:    2026-08-11
-- Futtatja: Endre (Supabase Studio → SQL Editor). EGYBEN futtatható, IDEMPOTENS.
-- Igényel:  semmit. Csak oszlopot ad hozzá, adatot NEM módosít és NEM töröl.
--
-- ─── MIT OLD MEG ────────────────────────────────────────────────────────────
-- 2026-08-11-én 21:09-kor harang-üzenet érkezett arról, hogy egy gyülekezet
-- mentése sikertelen. 22:16-kor mind a 784 hatókör mentése elkészült — az
-- üzenet mégis változatlanul ott állt a harangban.
--
-- Ennek oka NEM egy elfelejtett törlés volt, hanem az, hogy az `ertesitesek`
-- táblán az egész kódbázisban KÉT mutató művelet létezett:
--     olvasva = true      (a felhasználó megnyitotta)
--     archived = true     (a felhasználó eltette)
-- Mindkettőt KÉZZEL indítja a címzett. A RENDSZER maga nem tudta azt mondani,
-- hogy „ez a baj azóta elmúlt" — csak panaszkodni tudott.
--
-- Ez a három oszlop adja meg neki ezt a hangot.
--
-- ─── MIÉRT NEM TÖRLÉS ───────────────────────────────────────────────────────
-- A megoldott üzenet MEGMARAD, csak megjelölődik. A lelkésznek látnia kell,
-- hogy a rendszer TUDJA: már rendben van. Egy néma törlés ugyanolyan homályt
-- hagyna maga után, mint a beragadt riasztás — csak az ellenkező irányba.
--
-- ─── A KÓD ENÉLKÜL IS MŰKÖDIK ───────────────────────────────────────────────
-- ⚠️ A `lib/google-drive/alerts.ts` → `feloldErtesitesek()` FAIL-CLOSED: ha
--    ezek az oszlopok még nincsenek meg, az írás elhasal, és a függvény
--    AZONNAL újrapróbálja oszlopok nélkül (`tipus='success'`, „Megoldva —"
--    cím-előtag, záró mondat az üzenetben). A felületen tehát ENÉLKÜL IS
--    látszik, hogy a baj elmúlt. Ez az SQL a szűrhetőséget és a
--    visszakereshetőséget adja hozzá.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── SZAKASZ 0 — ELŐFELTÉTEL (fail-closed) ──────────────────────────────────
DO $szakasz0$
BEGIN
  IF to_regclass('public.ertesitesek') IS NULL THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: nincs public.ertesitesek tábla. Ez nem a Kartotéka éles adatbázisa.';
  END IF;
  RAISE NOTICE 'SZAKASZ 0 rendben — az ertesitesek tábla megvan.';
END
$szakasz0$;

-- ─── SZAKASZ 1 — AZ ÉLETCIKLUS-OSZLOPOK ─────────────────────────────────────
ALTER TABLE public.ertesitesek
  ADD COLUMN IF NOT EXISTS megoldva         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS megoldva_at      timestamptz,
  ADD COLUMN IF NOT EXISTS megoldas_uzenet  text;

COMMENT ON COLUMN public.ertesitesek.megoldva IS
  '2026-08-11: a jelzett baj AZÓTA ELMÚLT. A rendszer állítja be (nem a felhasználó): pl. a mentés-motor sikeres újrafutása után. A sor MEGMARAD — a címzettnek látnia kell, hogy a rendszer tudja: már rendben van.';
COMMENT ON COLUMN public.ertesitesek.megoldas_uzenet IS
  '2026-08-11: EGY magyar mondat arról, MIÉRT nincs már baj (pl. „AZÓTA RENDBEN. A(z) X gyülekezet mentése 22:16-kor elkészült…"). Adatot, nevet a mentés TARTALMÁBÓL, linket, kulcsot SOHA nem tartalmaz.';

-- ─── SZAKASZ 2 — INDEX A HARANG ÉS AZ ÉRTESÍTÉSEK OLDAL SZŰRÉSÉHEZ ──────────
-- A harang és a /notifications oldal is felhasználónként, idő szerint olvas.
-- A `megoldva` a listában szűrő-oszlop, nem kulcs — ezért nem külön indexben,
-- hanem a meglévő olvasási minta részeként hasznos.
CREATE INDEX IF NOT EXISTS ertesitesek_user_created_idx
  ON public.ertesitesek (user_id, created_at DESC);

-- ─── SZAKASZ 3 — ELLENŐRZÉS (ennek 3 sort kell adnia) ───────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ertesitesek'
  AND column_name IN ('megoldva', 'megoldva_at', 'megoldas_uzenet')
ORDER BY column_name;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- UTÓLAGOS TAKARÍTÁS (NEM KÖTELEZŐ, KÉZZEL FUTTATANDÓ)
-- ════════════════════════════════════════════════════════════════════════════
-- A 2026-08-11 előtt keletkezett, beragadt mentés-hiba üzeneteket az
-- alkalmazás magától is feloldja: a mentés-felület megnyitásakor lefut a
-- `feloldMegoldottMentesRiasztasok()` seprés, ami MINDEN nyitott mentés-hiba
-- üzenetet megold, amelyhez a naplóban azóta született igazolt mentés.
--
-- Ha ezt SQL-ből akarod ellenőrizni (csak OLVAS):
--
--   SELECT e.id, e.cim, e.hivatkozas, e.created_at, e.megoldva
--   FROM public.ertesitesek e
--   WHERE e.hivatkozas LIKE '/admin/biztonsagi-mentes?mentes-hiba=%'
--   ORDER BY e.created_at DESC
--   LIMIT 50;
-- ════════════════════════════════════════════════════════════════════════════
