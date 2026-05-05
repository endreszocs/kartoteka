-- ============================================================================
-- 2026-05-06 — Egyházfenntartás-import szigorúbb duplikáció-szűrő index
--
-- A meglévő `idx_befizetes_dup_lookup` (congregation_id, datum, osszeg,
-- bankszamla_id) kasszá-soroknál túl sok hamis pozitívot ad, mert a
-- bankszamla_id NULL ott. Az új index 5 mezős kulcsra:
--   (congregation_id, fizetettev, iratszam, osszeg, id_befizetescel)
-- amely az egyházfenntartás-import esetében a tranzakciót egyértelműen
-- azonosítja:
--   - congregation_id  → a gyülekezet, akinek a könyvelésébe importálunk
--   - fizetettev        → melyik évre szól a befizetés
--   - iratszam          → a hivatalos kassza-iratszám (xml.Nyugta vagy xlsx.Iratszam)
--   - osszeg            → ellenőrzés
--   - id_befizetescel   → "101.01" (Egyházfenntartói járulék)
--
-- A `WHERE deleted = false` partial szűrő csökkenti az index méretét.
-- Az index `EXISTS` lookup-ot szolgál ki — minden importálandó tételnél
-- 1 indexes seek-et eredményez.
--
-- BIZTONSÁG: csak index, nincs séma-változás. Visszafordítható.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_befizetes_egyhf_import_lookup
  ON public.befizetes (
    congregation_id,
    fizetettev,
    iratszam,
    osszeg,
    id_befizetescel
  )
  WHERE deleted = false;

COMMENT ON INDEX public.idx_befizetes_egyhf_import_lookup IS
  '2026-05-06: egyházfenntartás-import duplikáció-detektálás — (cong+fizetettev+iratszam+osszeg+cel) ötösre, partial deleted=false';

-- ============================================================================
-- ELLENŐRZÉS
-- ============================================================================

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'befizetes'
  AND indexname = 'idx_befizetes_egyhf_import_lookup';
-- Várt: 1 sor

-- A `befizetescel` táblában létezik-e a 101.01 (Egyházfenntartói járulék)?
SELECT id, nev, id_szamadasicel, aktiv
FROM public.befizetescel
WHERE id_szamadasicel = '101.01';
-- Várt: 1 sor (Egyházfenntartói járulék / Contr. anuală a credincioşilor)
