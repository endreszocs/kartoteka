-- ─────────────────────────────────────────────────────────────────────────
-- Iktató modul bővítése — EREK 2024-es ügykörjegyzékhez igazítás
-- ─────────────────────────────────────────────────────────────────────────
--
-- Cél: a `iktato` tábla kibővítése a hivatalos 9-rovatos iktatókönyv és az új
-- ügykörjegyzék szerinti besoroláshoz. Forrás: Igazgatótanács 66/2023. számú
-- határozata · 14. Egyházi adminisztráció (2024. január 1-től érvényes).
--
-- Megfelelőség-elemzés a `docs/project-tracking/KARTOTEKA-iktato-EREK-
-- ugykorjegyzek-megfeleloseg-2026-05-28.md` dokumentumban.
--
-- 6 új mező + 1 retention_type:
--   - external_ref_szam: a küldő intézmény saját iktatószáma (pl. "479/2023.")
--   - external_ref_kelt: az irat keltezése a küldő szerint
--   - beerkezes_ideje: amikor a mi hivatalunkba érkezett (≠ kelt)
--   - mellekletek_szama: hány melléklet tartozik az irathoz
--   - valasz_iktatoszam: kereszthivatkozás más iktatószámra ("lásd 36/2023")
--   - ugykor_kod: új ügykörjegyzék pontszáma (pl. "1.", "6/1.", "13/2.")
--   - retention_type: F.Á. (folyamatosan állandó) | É.Á. (évente állandó)
--
-- A meglévő `file_folder` (F.Á./É.Á./A.K.) mezőt MEGHAGYJUK backward-compat
-- miatt. Új iratoknál az `ugykor_kod` az elsődleges, és az `retention_type`
-- automatikusan állítódik a kód alapján.
--
-- 2026-05-28.
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

-- Új mezők hozzáadása
ALTER TABLE public.iktato
  ADD COLUMN IF NOT EXISTS external_ref_szam text,
  ADD COLUMN IF NOT EXISTS external_ref_kelt date,
  ADD COLUMN IF NOT EXISTS beerkezes_ideje date,
  ADD COLUMN IF NOT EXISTS mellekletek_szama integer,
  ADD COLUMN IF NOT EXISTS valasz_iktatoszam text,
  ADD COLUMN IF NOT EXISTS ugykor_kod text,
  ADD COLUMN IF NOT EXISTS retention_type text;

-- CHECK constraint a retention_type-ra (csak F.Á. és É.Á. érték)
-- Nem CHECK constraint NULL-ra is ráhúzódna, ezért inkább NULL-ban hagyjuk
-- ahol nincs megadva, és UI/server-action validál.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'iktato_retention_type_check'
  ) THEN
    ALTER TABLE public.iktato
      ADD CONSTRAINT iktato_retention_type_check
      CHECK (retention_type IS NULL OR retention_type IN ('F.Á.', 'É.Á.'));
  END IF;
END $$;

-- Index a kereshetőséghez: ügykörkód és külső iktatószám
CREATE INDEX IF NOT EXISTS idx_iktato_ugykor_kod
  ON public.iktato (congregation_id, ugykor_kod)
  WHERE deleted = false;

CREATE INDEX IF NOT EXISTS idx_iktato_external_ref
  ON public.iktato (congregation_id, external_ref_szam)
  WHERE deleted = false AND external_ref_szam IS NOT NULL;

-- Komment mezőkhez (PostgreSQL dokumentáció)
COMMENT ON COLUMN public.iktato.external_ref_szam IS
  'A küldő intézmény saját iktatószáma. Pl. "Esperesi 479/2023." — PDF iktatókönyv 2. rovata.';
COMMENT ON COLUMN public.iktato.external_ref_kelt IS
  'A beérkezett irat keltezése a küldő szerint (≠ a mi beérkezésünk dátuma).';
COMMENT ON COLUMN public.iktato.beerkezes_ideje IS
  'Amikor a mi hivatalunkba érkezett az irat. PDF iktatókönyv 3. rovata.';
COMMENT ON COLUMN public.iktato.mellekletek_szama IS
  'A beérkezett irat mellékleteinek száma. PDF iktatókönyv 4. rovata.';
COMMENT ON COLUMN public.iktato.valasz_iktatoszam IS
  'Kereszthivatkozás más iktatószámra (pl. "lásd 36/2023"). PDF iktatókönyv 9. rovata.';
COMMENT ON COLUMN public.iktato.ugykor_kod IS
  'Új ügykörjegyzék (2024-) pontszáma (pl. "1.", "6/1.", "13/2."). PDF iktatókönyv 8. rovata.';
COMMENT ON COLUMN public.iktato.retention_type IS
  'Megőrzési típus: F.Á. (folyamatosan állandó) vagy É.Á. (évente állandó). Az ügykörkód alapján automatikusan állítható.';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- Ellenőrzés (futtatás után):
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='iktato'
--   ORDER BY ordinal_position;
--
-- Várt új oszlopok:
--   external_ref_szam (text), external_ref_kelt (date),
--   beerkezes_ideje (date), mellekletek_szama (integer),
--   valasz_iktatoszam (text), ugykor_kod (text), retention_type (text)
