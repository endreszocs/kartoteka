-- ─────────────────────────────────────────────────────────────────────────
-- PR-8 (desktop 0.9.5) — KÖTELEZŐ migráció a kiadás ELŐTT!
--
-- A desktop kivezette a c_utcaid = -1 dummy-írást (helyette NULL megy).
-- A repo séma-dokumentumai szerint a szemely.c_utcaid és csalad.c_utcaid
-- NOT NULL — ha ez élesben is így van, az utca nélküli offline-mentések
-- 23502-vel pattannának vissza. Ez a migráció (idempotens):
--   1. leveszi a NOT NULL-t mindkét oszlopról (ha még rajta van),
--   2. a -1-es örökség-sorokat NULL-ra takarítja (a -1 a webes cím-láncot
--      törte: adrstreet-join a nem létező -1-es utcára → üres cím),
--   3. verifikál.
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1) NOT NULL levétele (idempotens — ha már nullolható, nem csinál semmit)
ALTER TABLE public.szemely ALTER COLUMN c_utcaid DROP NOT NULL;
ALTER TABLE public.csalad  ALTER COLUMN c_utcaid DROP NOT NULL;

-- 2) Örökség-takarítás: -1 dummy → NULL (a webes cím-megjelenítés javul)
UPDATE public.szemely SET c_utcaid = NULL WHERE c_utcaid = -1;
UPDATE public.csalad  SET c_utcaid = NULL WHERE c_utcaid = -1;

COMMIT;

-- 3) Verifikáció — elvárt: is_nullable = 'YES' mindkét sorban, minusz1 = 0
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('szemely', 'csalad')
  AND column_name = 'c_utcaid'
ORDER BY table_name;

SELECT 'szemely' AS tabla, count(*) AS minusz1_sorok FROM public.szemely WHERE c_utcaid = -1
UNION ALL
SELECT 'csalad', count(*) FROM public.csalad WHERE c_utcaid = -1;
