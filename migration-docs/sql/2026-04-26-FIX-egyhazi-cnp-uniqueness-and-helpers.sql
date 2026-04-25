-- KARTOTEKA HOTFIX 2 — Egyházi CNP egyediség-garancia + telefon/név normalizálás
-- Dátum: 2026-04-26
-- Futtatja: Endre (Supabase Studio SQL Editor) — a "FIX-import-varchar-and-egyhazi-cnp.sql" UTÁN
--
-- Cél:
--
-- 1. KRITIKUS: a `generate_egyhazi_cnp()` mostani verziója NEM ellenőrzi, hogy a generált
--    érték már létezik-e — statisztikailag a 28^10 ≈ 3*10^14 lehetőségből praktikusan
--    nulla az ütközés, de matematikailag nem. ÚJ verzió: loop-ol max 10x, mindig
--    ellenőrzi `EXISTS (... WHERE cnp = v_candidate)`-tal a teljes szemely táblán.
--    Garantált egyediség.
--
-- 2. ÚJ: `normalize_phone(text)` helper — magyar/román telefonszámokat normalizál
--    `0XXXXXXXXX` formátumra (10 számjegy). Kezeli: `+40 740 123 456`, `0740-123-456`,
--    `0740 123 456`, `0740123456`. Ezzel a cross-congregation match telefonszám
--    egyezésre megbízhatóan működik.
--
-- 3. ÚJ: `unaccent` PG kiterjesztés engedélyezése + `normalize_name(text)` helper —
--    "Tamás Gábor" és "Tamas Gabor" egyezőként kezelve.
--
-- Idempotens: CREATE OR REPLACE FUNCTION + CREATE EXTENSION IF NOT EXISTS

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. unaccent kiterjesztés engedélyezése
-- ────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. normalize_phone — telefonszám normalizálás
-- ────────────────────────────────────────────────────────────────────────────
--
-- Bemeneti formátumok kezelése:
--   "+40 740 123 456"  → "0740123456"
--   "+40-740-123-456"  → "0740123456"
--   "0740 123 456"     → "0740123456"
--   "0740-123-456"     → "0740123456"
--   "0740123456"       → "0740123456"
--   "740123456"        → "0740123456" (ha 9 számjegy, '0' prefix)
--   "0036 30 123 4567" → "0036301234567" (más országkódot megtartja, csak whitespace és kötőjel kivonása)
--
-- NULL bemenet → NULL kimenet

CREATE OR REPLACE FUNCTION public.normalize_phone(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $normalize_phone$
DECLARE
    v_clean text;
BEGIN
    IF input IS NULL OR btrim(input) = '' THEN
        RETURN NULL;
    END IF;

    -- 1. Eltávolítjuk a whitespace, kötőjel, zárójel, perjel karaktereket
    v_clean := regexp_replace(input, '[\s\-\(\)/.]', '', 'g');

    -- 2. +40 országkód → 0 (románia)
    IF v_clean LIKE '+40%' THEN
        v_clean := '0' || substr(v_clean, 4);
    -- 3. 0040 országkód → 0
    ELSIF v_clean LIKE '0040%' THEN
        v_clean := '0' || substr(v_clean, 5);
    -- 4. +36 országkód → 0036 (magyar — megtartjuk az országkódot, csak '+' levágás)
    ELSIF v_clean LIKE '+36%' THEN
        v_clean := '00' || substr(v_clean, 2);
    -- 5. Általános +XX → 00XX
    ELSIF v_clean LIKE '+%' THEN
        v_clean := '00' || substr(v_clean, 2);
    END IF;

    -- 6. Ha 9 számjegy és nem 0-val kezdődik, prefixálunk 0-t (román mobil rövid forma)
    IF v_clean ~ '^[1-9][0-9]{8}$' THEN
        v_clean := '0' || v_clean;
    END IF;

    -- Csak akkor adjuk vissza, ha tényleg számokból áll (legalább 4 számjegy)
    IF v_clean ~ '^[0-9]{4,}$' THEN
        RETURN v_clean;
    ELSE
        RETURN NULL;
    END IF;
END;
$normalize_phone$;

COMMENT ON FUNCTION public.normalize_phone(text) IS
    'Telefonszám normalizálás: +40, 0040, kötőjelek, whitespace eltávolítása. Magyar/román mobil: "0XXXXXXXXX" formátum (10 számjegy).';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. normalize_name — név normalizálás (ékezet-tolerancia, lowercase, trim)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Bemeneti formátumok kezelése:
--   "Tamás Gábor"   → "tamas gabor"
--   "TAMÁS GÁBOR"   → "tamas gabor"
--   "  Tamás Gábor " → "tamas gabor"
--   "Tamás   Gábor"  → "tamas gabor" (több whitespace egy spacere)
--
-- Ékezetes karakterek normálása az `unaccent` extension-rel.

CREATE OR REPLACE FUNCTION public.normalize_name(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $normalize_name$
    SELECT CASE
        WHEN input IS NULL OR btrim(input) = '' THEN NULL
        ELSE lower(btrim(regexp_replace(unaccent(input), '\s+', ' ', 'g')))
    END;
$normalize_name$;

COMMENT ON FUNCTION public.normalize_name(text) IS
    'Név normalizálás: lowercase, ékezet-eltávolítás (unaccent), whitespace-tisztítás. Cross-congregation matchinghez.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. generate_egyhazi_cnp — UNIQUENESS GARANCIA + max 10 próbálkozás
-- ────────────────────────────────────────────────────────────────────────────
--
-- A korábbi verzió csak random értéket adott — ELMÉLETBEN ütközhet egy másik
-- létező CNP-vel. Most LOOP-ol, és minden generálásnál ellenőrzi a `szemely`
-- táblát. Ha 10 próbálkozás után se talál egyedit (statisztikailag soha),
-- EXCEPTION.

CREATE OR REPLACE FUNCTION public.generate_egyhazi_cnp()
RETURNS varchar(20)
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $generate_egyhazi_cnp$
DECLARE
    v_year text := to_char(now(), 'YYYY');
    v_random_part text;
    v_charset text := 'ABCDEFGHJKMNPQRTUVWXYZ234679';
    v_charset_len int := length(v_charset);
    v_i int;
    v_attempts int := 0;
    v_max_attempts int := 10;
    v_candidate text;
BEGIN
    LOOP
        v_random_part := '';
        FOR v_i IN 1..10 LOOP
            v_random_part := v_random_part || substr(
                v_charset,
                (floor(random() * v_charset_len) + 1)::int,
                1
            );
        END LOOP;

        v_candidate := 'EC-' || v_year || '-' || v_random_part;

        -- KRITIKUS: ellenőrizzük a teljes szemely tábla CNP-mezőjét
        -- (cross-congregation szinten globálisan egyedi)
        IF NOT EXISTS (SELECT 1 FROM public.szemely WHERE cnp = v_candidate) THEN
            RETURN v_candidate;
        END IF;

        v_attempts := v_attempts + 1;
        IF v_attempts >= v_max_attempts THEN
            RAISE EXCEPTION
                'Nem sikerült egyedi egyházi CNP-t generálni % próbálkozás után. '
                'Ez statisztikailag majdnem lehetetlen (28^10 = 3*10^14 lehetőség). '
                'Lehet, hogy a random generátorral van probléma, vagy a tábla rendkívül nagy.',
                v_max_attempts;
        END IF;
    END LOOP;
END;
$generate_egyhazi_cnp$;

COMMENT ON FUNCTION public.generate_egyhazi_cnp() IS
    'Egyházi CNP generálás GARANTÁLT EGYEDISÉGGEL — formátum EC-YYYY-XXXXXXXXXX (18 karakter). Max 10 próbálkozás (statisztikailag soha nem éri el). EXISTS check a teljes szemely táblán.';

GRANT EXECUTE ON FUNCTION public.generate_egyhazi_cnp() TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_name(text) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS ===
-- ════════════════════════════════════════════════════════════════════════════

-- 1. unaccent extension aktív?
SELECT extname, extversion FROM pg_extension WHERE extname = 'unaccent';

-- 2. normalize_phone teszt — különböző formátumok
SELECT
    normalize_phone('+40 740 123 456') AS romanian_plus_40,
    normalize_phone('0740-123-456')    AS dashes,
    normalize_phone('0740 123 456')    AS spaces,
    normalize_phone('0740123456')      AS plain,
    normalize_phone('740123456')       AS no_zero_prefix,
    normalize_phone('+36 30 123 4567') AS hungarian_plus_36,
    normalize_phone(NULL)              AS null_input,
    normalize_phone('')                AS empty_input;

-- 3. normalize_name teszt — ékezet-tolerancia
SELECT
    normalize_name('Tamás Gábor')    AS hungarian,
    normalize_name('TAMÁS GÁBOR')    AS uppercase,
    normalize_name('  Tamás   Gábor ') AS extra_spaces,
    normalize_name('Tamas Gabor')    AS no_accents,
    normalize_name(NULL)             AS null_input;

-- 4. generate_egyhazi_cnp teszt — 5 egymás utáni generálás (mind különböző)
SELECT
    public.generate_egyhazi_cnp() AS cnp1,
    public.generate_egyhazi_cnp() AS cnp2,
    public.generate_egyhazi_cnp() AS cnp3,
    public.generate_egyhazi_cnp() AS cnp4,
    public.generate_egyhazi_cnp() AS cnp5;

-- 5. Helper függvények listája
SELECT
    n.nspname AS schema,
    p.proname AS name,
    pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN ('generate_egyhazi_cnp', 'normalize_phone', 'normalize_name')
  AND n.nspname = 'public'
ORDER BY p.proname;
