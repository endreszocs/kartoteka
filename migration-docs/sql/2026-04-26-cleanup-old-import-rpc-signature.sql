-- KARTOTEKA cleanup — régi 2-paraméteres import_family_head_batch eltávolítása
-- Dátum: 2026-04-26
-- Futtatja: Endre (opcionális — nem blokkoló, csak takarítás)
--
-- Háttér:
-- A `import_family_head_batch` RPC kétszer szerepel a function-listában:
--   - (uuid, jsonb) — 2-paraméteres, a 2026-04-25 verzió
--   - (uuid, jsonb, jsonb, jsonb) — 4-paraméteres, a 2026-04-26 wizard verzió
--
-- A Postgres ezt overloading-nak hívja — mindkét verzió külön függvény.
-- A wizard mindig a 4-paramétereset hívja, így a 2-paraméteres már soha
-- nem futna — csak ott maradt a függvény-listában.
--
-- Ez a SQL eltávolítja a régi verziót, így a függvény-lista tiszta marad.

BEGIN;

DROP FUNCTION IF EXISTS public.import_family_head_batch(uuid, jsonb);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- Várt: csak EGY sor — a 4-paraméteres verzió
SELECT
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'import_family_head_batch'
  AND n.nspname = 'public';
