-- ===================================================================
-- Pénzügyi import: a 400.01 (Készpénzletétel) belső mozgás cél-rekordok
-- ellenőrzése + opcionális létrehozása
-- ===================================================================
--
-- 2026-05-03 — felhasználói visszajelzés alapján
--
-- A hivatalos EREK könyvelési Excel "Kassza" füle 15 sort tartalmaz a
-- 400.01 kóddal ("Készpénzletétel a(z) A számlára", "Depunere numerar",
-- "Készpénzfelvétel a(z) A számláról"). Ezek belső mozgások: a kassza
-- és valamelyik bankszámla közötti pénzmozgás.
--
-- Az import-wizard a 400.01-hez **mindkét oldali** cel-rekordot keresi:
--   - befizetescel.id_szamadasicel = '400.01'  (bank-oldali bevétel)
--   - kiadascel.id_szamadasicel = '400.01'    (kassza-oldali kiadás)
--
-- Ha valamelyik hiányzik, a wizard nem tudja importálni a 15 sort
-- (mert a befizetes.id_befizetescel és kiadas.id_kiadascel NOT NULL).
--
-- Ez a script:
--   1. Megmutatja a jelenlegi állapotot
--   2. Ha hiányzik a befizetescel vagy kiadascel a 400.01-hez,
--      opcionálisan létrehozza (a felhasználó dönt: kommentelje ki ha kell)
-- ===================================================================

-- ───────────────────────────────────────────────────────────────────
-- 1. Diagnosztika — mit talál most a rendszer
-- ───────────────────────────────────────────────────────────────────

SELECT 'szamadasicel' AS tabla, id, nev, type, aktiv, szint
FROM public.szamadasicel
WHERE id LIKE '400%'
ORDER BY id;

SELECT 'befizetescel' AS tabla, id, nev, nevro, id_szamadasicel, aktiv, belsotetel
FROM public.befizetescel
WHERE id_szamadasicel LIKE '400%'
ORDER BY id_szamadasicel;

SELECT 'kiadascel' AS tabla, id, nev, nevro, id_szamadasicel, aktiv, belsotetel
FROM public.kiadascel
WHERE id_szamadasicel LIKE '400%'
ORDER BY id_szamadasicel;

-- ───────────────────────────────────────────────────────────────────
-- 2. Opcionális — létrehozás a 400.01-hez ha hiányzik
-- ───────────────────────────────────────────────────────────────────
--
-- Csak akkor futtasd, ha a fenti diagnosztika alapján LÁTOD, hogy
-- a 400.01 szamadasicel létezik, de a befizetescel és/vagy kiadascel
-- hiányzik.
--
-- A KÉT INSERT KÜLÖN VAN, hogy szelektíven futtathasd. Az ON CONFLICT
-- biztonsági háló: nem hoz létre duplikációt.

-- 2.a — befizetescel rekord (bank-oldali bevétel a kassza→bank esetén)
-- INSERT INTO public.befizetescel (
--   nevro,
--   nev,
--   id_szamadasicel,
--   aktiv,
--   belsotetel
-- ) VALUES (
--   'Készpénzletétel',
--   'Készpénzletétel banki számlára',
--   '400.01',
--   true,
--   '400.01'
-- )
-- ON CONFLICT (id_szamadasicel) DO NOTHING;

-- 2.b — kiadascel rekord (kassza-oldali kiadás a kassza→bank esetén)
-- INSERT INTO public.kiadascel (
--   nevro,
--   nev,
--   id_szamadasicel,
--   aktiv,
--   belsotetel
-- ) VALUES (
--   'Készpénzletétel',
--   'Készpénzletétel banki számlára',
--   '400.01',
--   true,
--   '400.01'
-- )
-- ON CONFLICT (id_szamadasicel) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────
-- 3. Ellenőrzés a futtatás után — minden 400-as kódhoz mindkét oldal van-e
-- ───────────────────────────────────────────────────────────────────

SELECT
  sz.id AS kod,
  sz.nev AS szamadasi_cel_nev,
  bef.id AS befizetescel_id,
  bef.nev AS befizetescel_nev,
  kia.id AS kiadascel_id,
  kia.nev AS kiadascel_nev,
  CASE
    WHEN bef.id IS NULL AND kia.id IS NULL THEN '⚠️ Mindkét cel hiányzik'
    WHEN bef.id IS NULL THEN '⚠️ Hiányzik a befizetescel'
    WHEN kia.id IS NULL THEN '⚠️ Hiányzik a kiadascel'
    ELSE '✓ Mindkettő megvan'
  END AS allapot
FROM public.szamadasicel sz
LEFT JOIN public.befizetescel bef ON bef.id_szamadasicel = sz.id
LEFT JOIN public.kiadascel kia ON kia.id_szamadasicel = sz.id
WHERE sz.id LIKE '400%'
  AND sz.aktiv = true
ORDER BY sz.id;
