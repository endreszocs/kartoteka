-- =========================================================================
-- 2026-04-18 — befizetescel.nevro szinkron + diagnosztika
-- =========================================================================
-- CÉL:
--   A nyugta „reprezentând (címén)" sor mellett megjelenő román fordítás a
--   `befizetescel.nevro` oszlopból érkezik. Endre visszajelzése szerint több
--   tételnél nem jelenik meg a román szöveg.
--
-- Ennek oka tipikusan:
--   - A `szamadasicel.nevro` üres → a seed COALESCE-szel a magyar `nev`-et
--     tette a `befizetescel.nevro`-ba
--   - Vagy a `befizetescel.nevro` azóta elkopott / másra volt állítva
--
-- Ez a migráció:
--   1. Diagnosztikát fut: mely befizetescel-eknél hiányzik a "valódi" román
--      fordítás (nev = nevro)
--   2. Pótolja a `befizetescel.nevro`-t a `szamadasicel.nevro`-ból, ha az
--      utóbbiban van valódi román érték
--   3. A kimaradó tételeket kilistázza — azokat Endre kézzel frissítheti
--
-- Idempotens — újrafuttatható.
-- =========================================================================

BEGIN;

-- 1) Befizetescel.nevro szinkron a szamadasicel.nevro-ból
--    Csak akkor frissít, ha:
--      - a szamadasicel.nevro létezik ÉS nem egyenlő a magyar névvel
--      - és a befizetescel.nevro jelenlegi értéke vagy üres, vagy a magyar
--        névvel egyenlő (tehát "nem valódi román fordítás")
UPDATE public.befizetescel bc
SET nevro = s.nevro
FROM public.szamadasicel s
WHERE bc.id_szamadasicel = s.id
  AND s.nevro IS NOT NULL
  AND s.nevro <> ''
  AND s.nevro <> COALESCE(s.nev, '')   -- a szamadasicel-ben valódi román van
  AND (
    bc.nevro IS NULL
    OR bc.nevro = ''
    OR bc.nevro = bc.nev                 -- a befizetescel-ben nincs valódi román
  );

-- 2) Kiadascel.nevro szinkron ugyanezen logikával (a nyugtánál nem kell, de
--    kimutatásokban igen)
UPDATE public.kiadascel kc
SET nevro = s.nevro
FROM public.szamadasicel s
WHERE kc.id_szamadasicel = s.id
  AND s.nevro IS NOT NULL
  AND s.nevro <> ''
  AND s.nevro <> COALESCE(s.nev, '')
  AND (
    kc.nevro IS NULL
    OR kc.nevro = ''
    OR kc.nevro = kc.nev
  );

COMMIT;

-- =========================================================================
-- ELLENŐRZÉS — futtatás után megmutatja, mit pótoltunk és mi maradt
-- =========================================================================

-- 1) Mennyi befizetescel van román fordítás nélkül (nev = nevro)?
SELECT
  'Román fordítással rendelkező befizetescel' AS metric,
  COUNT(*) FILTER (WHERE bc.nevro IS NOT NULL AND bc.nevro <> '' AND bc.nevro <> bc.nev) AS db
FROM public.befizetescel bc
UNION ALL
SELECT
  'Román fordítás HIÁNYZIK (nev = nevro)',
  COUNT(*) FILTER (WHERE bc.nevro IS NULL OR bc.nevro = '' OR bc.nevro = bc.nev)
FROM public.befizetescel bc;

-- 2) Részletes lista: mely befizetescel-eknél hiányzik még a román
SELECT
  bc.id_szamadasicel AS szamadasi_kod,
  bc.nev            AS magyar,
  bc.nevro          AS jelenlegi_roman,
  s.nevro           AS szamadasicel_roman
FROM public.befizetescel bc
LEFT JOIN public.szamadasicel s ON s.id = bc.id_szamadasicel
WHERE bc.aktiv = TRUE
  AND (bc.nevro IS NULL OR bc.nevro = '' OR bc.nevro = bc.nev)
ORDER BY bc.id_szamadasicel;

-- 3) Kézi pótlás sablon — ha a fenti listában hiányzó tételre tudsz
--    román szöveget, így frissítsd (példa az „Adományok hívektől, intézményektől"-ra):
--
-- UPDATE public.befizetescel
-- SET nevro = 'Donații de la credincioși și instituții'
-- WHERE nev = 'Adományok hívektől, intézményektől';
--
-- UPDATE public.befizetescel
-- SET nevro = 'Contribuție bisericească'
-- WHERE nev = 'Egyházfenntartói járulék';
