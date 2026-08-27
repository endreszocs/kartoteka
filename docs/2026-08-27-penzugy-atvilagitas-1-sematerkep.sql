-- ============================================================================
--  KARTOTÉKA — PÉNZÜGY ÁTVILÁGÍTÁS · 1. KÖR: SÉMA-TÉRKÉP
--  2026-08-27
--
--  CÉL: az ÉLES adatbázis tényeit rögzíteni, MIELŐTT bármit állítanánk.
--       A repóban lévő migration-docs/Database_schema.sql dump NEM bizonyíték
--       (ismert hibaosztály: a repó és a produkció némán széthúz).
--
--  TELJESEN READ-ONLY. Nem hoz létre, nem módosít, nem töröl semmit.
--  Csak rendszerkatalógusokat olvas (information_schema, pg_*), amik MINDIG
--  léteznek — ezért ez a fájl nem tud "nincs ilyen tábla" hibára futni.
--
--  HASZNÁLAT: másold be a Supabase SQL editorba, futtasd, és küldd vissza a
--  teljes eredményrácsot. A 2. kör (adat-ellenőrzés) ENNEK az eredményéből
--  épül fel, garantáltan létező oszlopnevekkel — így nem kell tippelni.
--
--  Az egész fájl EGYETLEN utasítás (UNION ALL), mert a Supabase editor több
--  utasítás esetén csak az UTOLSÓ rácsot mutatja.
-- ============================================================================

WITH
-- ── Amit a diagnózis állít, és ami élesben eldöntendő ───────────────────────
kritikus_oszlop(tabla, oszlop, miert) AS (
  VALUES
    -- 1. HIBA: a banki import kiadás-oldala. A kód 'kedvezmenyzett'-et ír.
    ('kiadas',    'kedvezmenyzett',     '1. hiba: a banki import EZT írja — létezik-e?'),
    ('kiadas',    'kedvezmenyezett_cui','1. hiba: hasonló nevű mező (MÁS betűzés) — csapda'),
    ('kiadas',    'atvevo',             '1. hiba: a feltételezett IGAZI partner-oszlop'),
    ('kiadas',    'atvevoid',           '1. hiba: partner-személy FK'),
    ('kiadas',    'nyugta',             '1. hiba: a reference-payload írja'),
    ('kiadas',    'xkey',               '1. hiba: a reference-payload írja'),
    ('kiadas',    'userid',             '1. hiba: NOT NULL-e'),
    ('kiadas',    'id_kiadascel',       'belső mozgás: a kód NULL-t is írhat ide'),
    ('kiadas',    'belso_mozgas_xkey',  '6. pont: a belső mozgás párosító kulcsa'),
    ('kiadas',    'megjegyzes',         '4. pont: megjegyzés-oszlop'),
    ('kiadas',    'osszeg_ron',         'deviza'),
    ('kiadas',    'arfolyam',           'deviza'),
    ('kiadas',    'bankszamla_id',      '5. pont: bank vs készpénz megkülönböztetés'),
    ('kiadas',    'irattipus',          '5. pont: bank vs készpénz megkülönböztetés'),
    ('kiadas',    'deleted',            '8. pont: duplikátum-keresésből kizárandó'),
    ('kiadas',    'stornozott',         '8. pont: duplikátum-keresésből kizárandó'),
    ('kiadas',    'congregation_id',    'hatókör'),
    -- BEFIZETÉS oldal
    ('befizetes', 'forrasa',            '5/8. pont: a befizető NEVE (szabad szöveg)'),
    ('befizetes', 'id_szemely',         '3. pont: személy-hozzárendelés'),
    ('befizetes', 'id_csalad',          '3. pont: család-hozzárendelés'),
    ('befizetes', 'csalad',             '3. pont: NOT NULL flag'),
    ('befizetes', 'fizetettev',         '2/5. pont: év szerinti bontás'),
    ('befizetes', 'belso_mozgas_xkey',  '6. pont: a belső mozgás párosító kulcsa'),
    ('befizetes', 'bankszamla_id',      '5. pont: bank vs készpénz'),
    ('befizetes', 'irattipus',          '5. pont: bank vs készpénz'),
    ('befizetes', 'megjegyzes',         '4. pont'),
    ('befizetes', 'osszeg_ron',         'deviza'),
    ('befizetes', 'deleted',            '8. pont'),
    ('befizetes', 'congregation_id',    'hatókör'),
    -- Kategória-katalógus (5. pont: adomány/szponzor felismerés)
    ('szamadasicel',  'belsotetel',      '6. pont: belső tétel flag — kizárás az összesenből'),
    ('szamadasicel',  'type',            'B/K irány'),
    ('szamadasicel',  'nev',             'magyar név'),
    ('befizetescel',  'id_szamadasicel', '5. pont: kategória → számadási kód'),
    ('befizetescel',  'belsotetel',      '6. pont'),
    ('kiadascel',     'id_szamadasicel', '6. pont'),
    ('kiadascel',     'belsotetel',      '6. pont'),
    -- Bankszámla / nyitó egyenleg (2. pont)
    ('bankszamlak',   'nyito_egyenleg',  '2. pont: hol tárolódik a bank nyitó'),
    ('bankszamlak',   'valuta',          '2. pont: deviza'),
    ('bankszamlak',   'congregation_id', 'hatókör')
),
-- ── Amit meg kell találni, de a nevét NEM tudjuk biztosan ───────────────────
minta(cimke, regex, miert) AS (
  VALUES
    ('nyitó egyenleg',   'nyito',                          '2. pont: hol él a nyitó egyenleg?'),
    ('készpénz/kassza',  'keszpenz|kassza|penztar',        '2. pont: készpénz nyitó'),
    ('belső mozgás',     'belso_?mozgas',                  '6. pont'),
    ('partner/cég',      'partner|cui|cif|firma',          '5. pont: van-e CÉG nyilvántartás?'),
    ('adomány/szponzor', 'adomany|szponzor|donor|sponsor', '5. pont: van-e külön adomány-tábla?'),
    ('import',           'import',                         '1/8. pont: import-naplók'),
    ('év-véglegesítés',  'veglegesit|finaliz|lezar',       '2. pont: az előző év le van-e zárva')
)

-- ###########################################################################
SELECT * FROM (

-- ── 1. SZAKASZ: léteznek-e egyáltalán a fő pénzügyi táblák? ────────────────
SELECT 10 AS sorrend,
       '1. FŐ TÁBLÁK'::text AS szakasz,
       t.table_name::text AS targy,
       (CASE t.table_type::text WHEN 'BASE TABLE' THEN 'TÁBLA' ELSE t.table_type::text END)::text AS eredmeny,
       ((SELECT count(*) FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = t.table_name)::text
        || ' oszlop · RLS: '
        || (CASE WHEN cl.relrowsecurity THEN 'BE' ELSE 'KI' END))::text AS reszletek
  FROM information_schema.tables t
  LEFT JOIN pg_class cl
         ON cl.relname = t.table_name
        AND cl.relnamespace = 'public'::regnamespace
 WHERE t.table_schema = 'public'
   AND t.table_name IN ('kiadas','befizetes','bankszamlak','szamadasicel',
                        'befizetescel','kiadascel','belsomozgas','szemely',
                        'csalad','congregations','diocese_kiadas','diocese_befizetes')

UNION ALL
-- ── 2. SZAKASZ: a kritikus oszlopok — VAN vagy NINCS? ──────────────────────
--     LEFT JOIN, hogy a HIÁNYZÓ oszlopok is látszódjanak. (A CROSS JOIN
--     eltüntetné épp a bukó sorokat — ez nálunk már megégett hibaosztály.)
SELECT 20,
       '2. KRITIKUS OSZLOPOK',
       (k.tabla::text || '.' || k.oszlop::text)::text,
       (CASE WHEN c.column_name IS NULL THEN '### NINCS ###' ELSE 'van' END)::text,
       (COALESCE(c.data_type::text, '—')
        || CASE WHEN c.is_nullable::text = 'NO' THEN ' · NOT NULL' ELSE '' END
        || CASE WHEN c.column_default IS NOT NULL THEN ' · default' ELSE '' END
        || ' | ' || k.miert)::text
  FROM kritikus_oszlop k
  LEFT JOIN information_schema.columns c
         ON c.table_schema = 'public'
        AND c.table_name   = k.tabla
        AND c.column_name  = k.oszlop

UNION ALL
-- ── 3. SZAKASZ: a kiadas TELJES oszloplistája ──────────────────────────────
SELECT 30,
       '3. KIADAS — MINDEN OSZLOP',
       (lpad(c.ordinal_position::text, 3, '0') || '. ' || c.column_name::text)::text,
       c.data_type::text,
       (CASE WHEN c.is_nullable::text = 'NO' THEN 'NOT NULL' ELSE 'nullable' END
        || COALESCE(' · default: ' || left(c.column_default::text, 40), ''))::text
  FROM information_schema.columns c
 WHERE c.table_schema = 'public' AND c.table_name = 'kiadas'

UNION ALL
-- ── 4. SZAKASZ: a befizetes TELJES oszloplistája ───────────────────────────
SELECT 40,
       '4. BEFIZETES — MINDEN OSZLOP',
       (lpad(c.ordinal_position::text, 3, '0') || '. ' || c.column_name::text)::text,
       c.data_type::text,
       (CASE WHEN c.is_nullable::text = 'NO' THEN 'NOT NULL' ELSE 'nullable' END
        || COALESCE(' · default: ' || left(c.column_default::text, 40), ''))::text
  FROM information_schema.columns c
 WHERE c.table_schema = 'public' AND c.table_name = 'befizetes'

UNION ALL
-- ── 5. SZAKASZ: NOT NULL, default NÉLKÜL — ezek buktatják az INSERT-et ─────
SELECT 50,
       '5. KÖTELEZŐ MEZŐK (NOT NULL, default nélkül)',
       (c.table_name::text || '.' || c.column_name::text)::text,
       'KÖTELEZŐEN KITÖLTENDŐ'::text,
       c.data_type::text
  FROM information_schema.columns c
 WHERE c.table_schema = 'public'
   AND c.table_name IN ('kiadas','befizetes')
   AND c.is_nullable::text = 'NO'
   AND c.column_default IS NULL

UNION ALL
-- ── 6. SZAKASZ: indexek — LÉTEZIK-E ÉLESBEN az egyediségi index? ───────────
--     Ez dönti el, duplikálna-e egy ismételt banki import.
SELECT 60,
       '6. INDEXEK (kiadas/befizetes)',
       i.indexname::text,
       (CASE WHEN i.indexdef ILIKE '%UNIQUE%' THEN 'EGYEDI (UNIQUE)' ELSE 'sima' END)::text,
       left(i.indexdef, 200)::text
  FROM pg_indexes i
 WHERE i.schemaname = 'public'
   AND i.tablename IN ('kiadas','befizetes')

UNION ALL
-- ── 7. SZAKASZ: CHECK megszorítások — pl. az irattipus értékkészlete ───────
SELECT 70,
       '7. CHECK MEGSZORÍTÁSOK',
       (rel.relname::text || ' · ' || con.conname::text)::text,
       'CHECK'::text,
       left(pg_get_constraintdef(con.oid), 250)::text
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
 WHERE con.contype = 'c'
   AND rel.relnamespace = 'public'::regnamespace
   AND rel.relname IN ('kiadas','befizetes','bankszamlak','szamadasicel')

UNION ALL
-- ── 8. SZAKASZ: kiterjesztések — a FUZZY névegyezéshez (8. pont) ───────────
SELECT 80,
       '8. KITERJESZTÉSEK (fuzzy kereséshez)',
       v.ext::text,
       (CASE WHEN e.extname IS NULL THEN '### NINCS TELEPÍTVE ###'
             ELSE 'telepítve · v' || e.extversion END)::text,
       v.miert::text
  FROM (VALUES
          ('pg_trgm',      '8. pont: hasonlósági (fuzzy) névkeresés — similarity()'),
          ('unaccent',     '8. pont: ékezet-független névhasonlítás'),
          ('fuzzystrmatch','8. pont: levenshtein() alternatíva')
       ) AS v(ext, miert)
  LEFT JOIN pg_extension e ON e.extname = v.ext

UNION ALL
-- ── 9. SZAKASZ: TÁBLA-KERESÉS névmintára — ne a nevét találgassuk ──────────
SELECT 90,
       '9. TÁBLÁK NÉVMINTA SZERINT',
       (m.cimke || ' → ' || t.table_name::text)::text,
       'megtalált tábla'::text,
       m.miert::text
  FROM minta m
  JOIN information_schema.tables t
    ON t.table_schema = 'public' AND t.table_name ~* m.regex

UNION ALL
-- ── 10. SZAKASZ: OSZLOP-KERESÉS névmintára az EGÉSZ public sémában ─────────
--      Így derül ki, hol él VALÓJÁBAN a nyitó egyenleg, a cég-azonosító stb.
SELECT 100,
       '10. OSZLOPOK NÉVMINTA SZERINT',
       (m.cimke || ' → ' || c.table_name::text || '.' || c.column_name::text)::text,
       c.data_type::text,
       m.miert::text
  FROM minta m
  JOIN information_schema.columns c
    ON c.table_schema = 'public' AND c.column_name ~* m.regex

UNION ALL
-- ── 11. SZAKASZ: pénzügyi FÜGGVÉNYEK / RPC-k ──────────────────────────────
SELECT 110,
       '11. FÜGGVÉNYEK (RPC)',
       p.proname::text,
       pg_get_function_result(p.oid)::text,
       left(pg_get_function_arguments(p.oid), 160)::text
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname ~* 'befizetes|kiadas|penzugy|finance|nyito|belso_?mozgas|adomany|bank'

UNION ALL
-- ── 12. SZAKASZ: nézetek (VIEW) a pénzügy körül ───────────────────────────
SELECT 120,
       '12. NÉZETEK (VIEW)',
       v.table_name::text,
       'VIEW'::text,
       ''::text
  FROM information_schema.views v
 WHERE v.table_schema = 'public'
   AND v.table_name ~* 'befizetes|kiadas|penzugy|finance|nyito|belso_?mozgas|bank|adomany'

) AS osszes
ORDER BY sorrend, targy;
