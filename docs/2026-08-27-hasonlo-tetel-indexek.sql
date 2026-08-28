-- =====================================================================
-- 2026-08-27 — HASONLÓ TÉTEL FIGYELMEZTETÉS: a hiányzó teljesítmény-indexek
--
-- MIÉRT: Endre 8. kérése szerint a rögzítő mentés ELŐTT megnézi, van-e már
-- ugyanolyan összegű, hasonló nevű, ±3 napon belüli BANKI tétel. A lekérdezés:
--
--     congregation_id = ?  AND  datum >= ?  AND  datum < ?
--     AND bankszamla_id IS NOT NULL  AND  belso_mozgas_xkey IS NULL
--     AND deleted = false  AND  stornozott = false
--
-- MÉRT TÉNY (2026-08-27, séma-lekérdezés): az ehhez való index ÉLESBEN NEM
-- LÉTEZIK. A definíciója 2026-05-02 óta megvan a repóban
-- (`migration-docs/sql/2026-05-02-finance-dup-lookup-indexes.sql`), de SOSEM
-- futott le — ez a repó egyik visszatérő hibaosztálya: a migrációs fájl
-- megléte NEM bizonyíték arra, hogy élesben is megtörtént.
--
-- Enélkül minden rögzítés két teljes tábla-átolvasást (seq scan) indít.
-- A gyülekezeti táblák ma még kicsik, tehát ez nem hibát okoz, hanem lassulást,
-- ami évről évre nő.
--
-- BIZTONSÁG: CSAK INDEX. Nincs szerkezet-változtatás, nincs adat-írás,
-- visszafordítható (a DROP parancsok a fájl végén, kikommentelve).
-- `IF NOT EXISTS` — a fájl többször is lefuttatható.
--
-- ⚠️ CONCURRENTLY-t SZÁNDÉKOSAN NEM használunk: a Supabase SQL editor
-- tranzakcióba csomagolhatja a szkriptet, és a CREATE INDEX CONCURRENTLY
-- tranzakción belül hibára fut. A táblák mérete mellett a rövid zárolás
-- vállalható.
-- =====================================================================

-- ── 1) A KÉT INDEX ───────────────────────────────────────────────────
-- A vezető oszlop-pár (congregation_id, datum) fedi a fenti lekérdezést;
-- az `osszeg` és a `bankszamla_id` azért van bent, hogy a banki import
-- duplikáció-szűrője is ugyanezt az indexet tudja használni (közös index,
-- nem kettő). A `WHERE deleted = false` partial szűrő kicsiben tartja.
--
-- (A `deleted` és a `stornozott` oszlop mindkét táblán NOT NULL — ellenőrizve
-- a sémában —, ezért a partial predikátum nem hagy ki NULL-os sorokat.)

CREATE INDEX IF NOT EXISTS idx_befizetes_dup_lookup
  ON public.befizetes (congregation_id, datum, osszeg, bankszamla_id)
  WHERE deleted = false;

CREATE INDEX IF NOT EXISTS idx_kiadas_dup_lookup
  ON public.kiadas (congregation_id, datum, osszeg, bankszamla_id)
  WHERE deleted = false;

-- A tervező csak friss statisztikával tudja használni őket.
ANALYZE public.befizetes;
ANALYZE public.kiadas;

-- ── 2) KAPU — EGYETLEN eredmény-rács ─────────────────────────────────
-- ⚠️ A Supabase SQL editor CSAK AZ UTOLSÓ rácsot mutatja, ezért minden
-- ellenőrzés EGY `UNION ALL`-ban van, a fájl legvégén.
--
-- Amit ellenőrzünk:
--   (A) létrejött-e mind a két index;
--   (B) a definíciójuk tényleg a partial (`WHERE deleted = false`) alak-e —
--       egy korábbi, más definíciójú, azonos nevű index NEM íródna felül az
--       `IF NOT EXISTS` miatt, és ezt némán elhinnénk;
--   (C) mekkora adathalmazra dolgozik a figyelmeztetés (banki eredetű,
--       nem belső mozgás, élő sorok) — ha ez 0, a funkció nem fog riasztani,
--       és azt tudni kell, nem találgatni.

WITH ix AS (
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN ('idx_befizetes_dup_lookup', 'idx_kiadas_dup_lookup')
)
SELECT
  'A) index létrejött'                                   AS ellenorzes,
  'idx_befizetes_dup_lookup'                             AS reszlet,
  CASE WHEN EXISTS (SELECT 1 FROM ix WHERE indexname = 'idx_befizetes_dup_lookup')
       THEN '✅ létezik' ELSE '⛔ HIÁNYZIK' END          AS eredmeny
UNION ALL
SELECT
  'A) index létrejött',
  'idx_kiadas_dup_lookup',
  CASE WHEN EXISTS (SELECT 1 FROM ix WHERE indexname = 'idx_kiadas_dup_lookup')
       THEN '✅ létezik' ELSE '⛔ HIÁNYZIK' END
UNION ALL
SELECT
  'B) partial definíció',
  indexname,
  CASE WHEN indexdef ILIKE '%WHERE (deleted = false)%'
       THEN '✅ partial (deleted = false)'
       ELSE '⚠️ MÁS definíció: ' || indexdef END
FROM ix
UNION ALL
SELECT
  'C) érintett sorok',
  'befizetes — banki, nem belső mozgás, élő',
  COUNT(*)::text
FROM public.befizetes
WHERE bankszamla_id IS NOT NULL
  AND belso_mozgas_xkey IS NULL
  AND deleted = false
  AND stornozott = false
UNION ALL
SELECT
  'C) érintett sorok',
  'kiadas — banki, nem belső mozgás, élő',
  COUNT(*)::text
FROM public.kiadas
WHERE bankszamla_id IS NOT NULL
  AND belso_mozgas_xkey IS NULL
  AND deleted = false
  AND stornozott = false
ORDER BY 1, 2;

-- ── VISSZAVONÁS (ha valamiért mégsem kellene) ────────────────────────
-- DROP INDEX IF EXISTS public.idx_befizetes_dup_lookup;
-- DROP INDEX IF EXISTS public.idx_kiadas_dup_lookup;
