-- ============================================================================
-- 2026-06-21 — Járulék-kedvezmény ELLENŐRZŐ lekérdezések (nem módosít semmit)
-- ----------------------------------------------------------------------------
-- Cél: ellenőrizni, hogy a `kezdet` oszlop pótlása + a kedvezmény újramentése
-- után a kedvezmények ténylegesen ott vannak-e a DB-ben, és milyen értékkel —
-- hogy az auto-összeg ÉS a Tartozás-lista a KEDVEZMÉNYES összeget adja-e.
--
-- Háttér: a `public.jarulek_kedvezmeny` táblából korábban HIÁNYZOTT a `kezdet`
-- oszlop. Emiatt minden olvasó SELECT (ami `kezdet`-et is kért) HIBÁZOTT, és a
-- kód némán [] -ra esett → az ÖSSZES mentett kedvezmény (kor/foglalkozás/időszaki)
-- kiesett. A `kezdet` oszlop pótlása (2026-06-05b migráció / manuális ALTER) ezt
-- megoldotta; a kód is ellenállóvá vált a hiányra (commit 535c33fc + ez a csomag).
--
-- HASZNÁLAT: futtasd le egyesével. Ahol szükséges, cseréld ki a
--   '<CONGREGATION_ID>' helyőrzőt a saját gyülekezeted azonosítójára. Ha csak
-- egy gyülekezeted van, a WHERE-sorok kihagyhatók (kommenteld ki őket).
-- ============================================================================

-- 0) Megvan-e a `kezdet` oszlop? (1 sor = igen)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'jarulek_kedvezmeny'
  AND column_name = 'kezdet';

-- 1) A mentett kedvezmény-szabályok (ev, tipus, kezdet, hatarid, kedv_osszeg, ...)
--    Itt látszik, hogy van-e egyáltalán sor, és milyen évre/típusra/összegre szól.
SELECT
  ev,
  tipus,
  aktiv,
  kezdet,
  hatarid,
  kedv_osszeg,
  kor_tol,
  szazalek,
  fix_osszeg,
  jov_leiras,
  sorrend
FROM public.jarulek_kedvezmeny
-- WHERE congregation_id = '<CONGREGATION_ID>'
ORDER BY ev DESC, tipus, sorrend;

-- 2) Az éves járulék-beállítás (bealitas): teljes díj + alapértelmezett
--    kedvezményes díj (jarulek_kedvezmenyes) + a hozzá tartozó határidő.
--    Az `id` itt az ÉV (szövegként). Az auto-összeg ezt a teljes díjat csökkenti
--    a kedvezményekkel, ha a befizetés dátuma a határidőn/időablakon belül van.
SELECT
  id          AS ev,
  eves_jarulek,
  jarulek_kedvezmenyes,
  jarulek_hatarid
FROM public.bealitas
-- WHERE congregation_id = '<CONGREGATION_ID>'
ORDER BY id DESC;

-- ----------------------------------------------------------------------------
-- ÉRTELMEZÉS (mit kell látni ahhoz, hogy a kedvezmény ALKALMAZÓDJON):
--   • A kedvezmény `ev`-je EGYEZZEN a befizetés „melyik évre" évével.
--     (Az auto-összeg az adott évre szóló, aktív kedvezményeket veszi.)
--   • Időszaki (tipus='idoszak'): a befizetés dátuma a [kezdet, hatarid] ablakba
--     essen (HH-NN). Ha `kezdet` NULL → nyitott alsó határ (régi: „határidőig").
--   • Kor (tipus='kor'): a tag életkora az adott évben >= kor_tol.
--   • Foglalkozás (tipus='foglalkozas'): a tag `szemely.foglalkozas` mezője
--     egyezik a jov_leiras kulcsszavak egyikével (ékezet/kisbetű-érzéketlen,
--     TELJES token-egyezés).
--   • A bealitas.jarulek_kedvezmenyes + jarulek_hatarid az „alapértelmezett"
--     korai-fizetési kedvezmény (külön a jarulek_kedvezmeny soroktól).
-- ============================================================================
