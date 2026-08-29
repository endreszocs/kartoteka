-- ═══════════════════════════════════════════════════════════════════════════
-- JÁRULÉK ÉV-DIAGNOSZTIKA (2026-08-29) — CSAK OLVAS, semmit nem módosít
--
-- MIÉRT: a Tétel rögzítő 2026-os évre is 130 lejt ajánl „kedvezménnyel",
-- miközben a 2026-os kedvezményes díj 160. A kód (motor + kliens) év-helyes —
-- a 130 tehát a 2026-os ÉV VALAMELYIK TÁROLÓJÁBÓL jön. A rendszer elsőbbségi
-- sorrendje évre: bealitas(év) → congregation_annual_fees(év) → congregations
-- (globális, MAI); a kedvezmény-szabályok a jarulek_kedvezmeny(ev) sorokból.
--
-- Futtasd egyben — egyetlen rács, soronként egy-egy tároló értékei.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT * FROM (
  SELECT
    1 AS sorrend,
    'A) bealitas (ez az ELSŐ a sorban!)' AS tarolo,
    b.id AS ev,
    'éves díj: ' || COALESCE(b.eves_jarulek::text, 'NULL')
      || ' · kedvezményes: ' || COALESCE(b.jarulek_kedvezmenyes::text, 'NULL')
      || ' · határidő: ' || COALESCE(b.jarulek_hatarid, 'NULL') AS ertekek
  FROM public.bealitas b
  WHERE b.congregation_id = '43cff37f-1131-4c79-8082-0e8af61cf40a'
    AND b.id IN ('2025', '2026')

  UNION ALL
  SELECT
    2,
    'B) congregation_annual_fees (évenkénti tükör)',
    f.year::text,
    'éves díj: ' || COALESCE(f.eves_jarulek::text, 'NULL')
      || ' · határidő: ' || COALESCE(f.jarulek_hatarid, 'NULL')
  FROM public.congregation_annual_fees f
  WHERE f.congregation_id = '43cff37f-1131-4c79-8082-0e8af61cf40a'
    AND f.year IN (2025, 2026)

  UNION ALL
  SELECT
    3,
    'C) congregations (globális, MAI — csak ha az évre nincs semmi)',
    '—',
    'éves díj: ' || COALESCE(c.eves_jarulek::text, 'NULL')
      || ' · kedvezményes: ' || COALESCE(c.jarulek_kedvezmenyes::text, 'NULL')
      || ' · határidő: ' || COALESCE(c.jarulek_hatarid, 'NULL')
  FROM public.congregations c
  WHERE c.id = '43cff37f-1131-4c79-8082-0e8af61cf40a'

  UNION ALL
  SELECT
    4,
    'D) jarulek_kedvezmeny szabályok (' || k.ev || '. év)',
    k.ev::text,
    'típus: ' || COALESCE(k.tipus, '—')
      || ' · aktív: ' || COALESCE(k.aktiv::text, 'NULL')
      || ' · határidő: ' || COALESCE(k.hatarid, '—')
      || ' · kedv. összeg: ' || COALESCE(k.kedv_osszeg::text, '—')
      || ' · fix összeg: ' || COALESCE(k.fix_osszeg::text, '—')
      || ' · százalék: ' || COALESCE(k.szazalek::text, '—')
      || ' · kortól: ' || COALESCE(k.kor_tol::text, '—')
  FROM public.jarulek_kedvezmeny k
  WHERE k.congregation_id = '43cff37f-1131-4c79-8082-0e8af61cf40a'
    AND k.ev IN (2025, 2026)
) x
ORDER BY sorrend, ev;
