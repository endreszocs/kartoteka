-- ============================================================================
-- F5 (2026-07-17) — Q6: tartozás-számítási mód normalizálása + diagnosztika
--
-- HÁTTÉR (Q6 user-döntés): a tartozas_szamitas_mod KIVEZETVE — a rendszer mindig
-- az „akkori" (a tartozás évének beállításai szerinti) módon számol. A kód már
-- mindenhol 'akkori'-t kényszerít és 'akkori'-t ír; ez az SQL a meglévő
-- 'aktualis' sorokat normalizálja, hogy a DB se mutasson hamis állapotot.
--
-- Futtatás: Supabase SQL editor, blokkonkénti eredmény-visszaküldéssel.
-- ============================================================================

-- 1) ELŐZETES: hány gyülekezet áll 'aktualis'-on?
SELECT id, nev_hu, tartozas_szamitas_mod
FROM public.congregations
WHERE tartozas_szamitas_mod = 'aktualis';

-- 2) NORMALIZÁLÁS
BEGIN;
UPDATE public.congregations
SET tartozas_szamitas_mod = 'akkori'
WHERE tartozas_szamitas_mod = 'aktualis';
COMMIT;

-- 3) ELLENŐRZÉS — 0 sort kell adjon
SELECT count(*) AS maradek_aktualis
FROM public.congregations
WHERE tartozas_szamitas_mod = 'aktualis';

-- ============================================================================
-- DIAGNOSZTIKA (csak olvas) — a szigorított validációk MEGLÉVŐ adatot nem
-- javítanak; ezek mutatják, van-e kézzel javítandó régi érték.
-- ============================================================================

-- 4) Érvénytelen HH-NN értékek (pl. '13-01', '31-12') — ha van találat, kézi
--    javítás kell (a kedvezmény-kezelőben újramentés, vagy célzott UPDATE):
SELECT 'congregations.jarulek_hatarid' AS forras, id::text AS azonosito, jarulek_hatarid AS ertek
FROM public.congregations
WHERE jarulek_hatarid IS NOT NULL
  AND jarulek_hatarid !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
UNION ALL
SELECT 'bealitas.jarulek_hatarid', congregation_id::text || '/' || id, jarulek_hatarid
FROM public.bealitas
WHERE jarulek_hatarid IS NOT NULL
  AND jarulek_hatarid !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
UNION ALL
SELECT 'jarulek_kedvezmeny.kezdet', id::text, kezdet
FROM public.jarulek_kedvezmeny
WHERE kezdet IS NOT NULL AND kezdet !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
UNION ALL
SELECT 'jarulek_kedvezmeny.hatarid', id::text, hatarid
FROM public.jarulek_kedvezmeny
WHERE hatarid IS NOT NULL AND hatarid !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$';

-- 5) Q7-hatásmérés — VEGYES (személy+család) egyházfenntartói befizetések
--    (az importőrök minden párosított sorhoz családot is írnak; az új felosztás
--    a megnevezett tag elvárása FELETTI többletet a családra osztja):
SELECT b.congregation_id, b.fizetettev, count(*) AS vegyes_sorok, sum(b.osszeg) AS osszeg
FROM public.befizetes b
JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
WHERE b.id_szemely IS NOT NULL
  AND b.id_csalad IS NOT NULL
  AND bc.id_szamadasicel LIKE '101.01%'
  AND (b.deleted = false OR b.deleted IS NULL)
  AND (b.stornozott = false OR b.stornozott IS NULL)
GROUP BY b.congregation_id, b.fizetettev
ORDER BY b.congregation_id, b.fizetettev DESC;

-- 6) Q7-hatásmérés — TISZTÁN családi egyházfenntartói befizetések:
SELECT b.congregation_id, b.fizetettev, count(*) AS csaladi_sorok, sum(b.osszeg) AS osszeg
FROM public.befizetes b
JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
WHERE b.id_szemely IS NULL
  AND b.id_csalad IS NOT NULL
  AND bc.id_szamadasicel LIKE '101.01%'
  AND (b.deleted = false OR b.deleted IS NULL)
  AND (b.stornozott = false OR b.stornozott IS NULL)
GROUP BY b.congregation_id, b.fizetettev
ORDER BY b.congregation_id, b.fizetettev DESC;
