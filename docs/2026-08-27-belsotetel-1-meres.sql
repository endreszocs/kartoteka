-- ============================================================================
--  BELSŐ MOZGÁS JELÖLÉS (`szamadasicel.belsotetel`) — 1. LÉPÉS: MÉRÉS
--  2026-08-27 · Endre kérésére
--
--  MIÉRT KÜLÖN MÉRÉS: az átvilágítás kimondta, hogy a javítás NEM blokkoló,
--  DE egy dolgot innen NEM lehet megmérni: a repó `Database_schema.sql`-je
--  CSAK táblákat tartalmaz (0 db CREATE VIEW / FUNCTION / TRIGGER), és ehhez a
--  projekthez nincs Supabase MCP. Elvileg létezhet ÉLŐ nézet, függvény vagy
--  trigger, ami a `belsotetel`-t olvassa, és amit soha nem tettünk a repóba.
--  Ennek a projektnek dokumentált története van a repó ⇄ produkció néma
--  széthúzásáról — ezért mérünk, mielőtt írunk.
--
--  TELJESEN READ-ONLY. Egyetlen eredményrács (a Supabase editor csak az
--  utolsót mutatja).
--
--  ÉRTELMEZÉS:
--    · Ha az 1. szakasz ÜRES  → nincs élő olvasó, a 2. lépés (UPDATE) mehet.
--    · Ha az 1. szakasz ad sort → ÁLLJ MEG, és küldd vissza — átnézzük.
-- ============================================================================

SELECT * FROM (

-- ── 1. SZAKASZ: ÉLŐ OLVASÓK — nézet, függvény, trigger, megszorítás ───────
--    Ez a KAPU. Ha itt bármi megjelenik, az UPDATE-et NEM szabad futtatni.
SELECT 10 AS sorrend,
       '1. ⛔ ÉLŐ OLVASÓ a belsotetel-re'::text AS szakasz,
       ('FÜGGVÉNY: ' || p.proname)::text AS targy,
       'megvizsgálandó'::text AS eredmeny,
       left(regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g'), 220)::text AS reszletek
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND pg_get_functiondef(p.oid) ILIKE '%belsotetel%'

UNION ALL
SELECT 11,
       '1. ⛔ ÉLŐ OLVASÓ a belsotetel-re',
       ('NÉZET: ' || v.table_name::text)::text,
       'megvizsgálandó'::text,
       left(regexp_replace(v.view_definition, '\s+', ' ', 'g'), 220)::text
  FROM information_schema.views v
 WHERE v.table_schema = 'public'
   AND v.view_definition ILIKE '%belsotetel%'

UNION ALL
SELECT 12,
       '1. ⛔ ÉLŐ OLVASÓ a belsotetel-re',
       ('MEGSZORÍTÁS: ' || rel.relname::text || ' · ' || con.conname::text)::text,
       'megvizsgálandó'::text,
       left(pg_get_constraintdef(con.oid), 220)::text
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
 WHERE rel.relnamespace = 'public'::regnamespace
   AND pg_get_constraintdef(con.oid) ILIKE '%belsotetel%'

UNION ALL
SELECT 13,
       '1. ⛔ ÉLŐ OLVASÓ a belsotetel-re',
       ('INDEX: ' || i.indexname::text)::text,
       'megvizsgálandó'::text,
       left(i.indexdef, 220)::text
  FROM pg_indexes i
 WHERE i.schemaname = 'public'
   AND i.indexdef ILIKE '%belsotetel%'

UNION ALL
-- Ha a fenti négy szakasz egyike sem ad sort, ez az egy sor jelzi, hogy mérve van.
SELECT 19,
       '1. KAPU EREDMÉNYE',
       'élő olvasók száma összesen'::text,
       (
         (SELECT count(*) FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace
             AND pg_get_functiondef(p.oid) ILIKE '%belsotetel%')
       + (SELECT count(*) FROM information_schema.views v
           WHERE v.table_schema = 'public' AND v.view_definition ILIKE '%belsotetel%')
       + (SELECT count(*) FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
           WHERE rel.relnamespace = 'public'::regnamespace
             AND pg_get_constraintdef(con.oid) ILIKE '%belsotetel%')
       + (SELECT count(*) FROM pg_indexes i
           WHERE i.schemaname = 'public' AND i.indexdef ILIKE '%belsotetel%')
       )::text,
       'ha 0 → a 2. lépés (UPDATE) biztonságosan futtatható'::text

UNION ALL
-- ── 2. SZAKASZ: a JELENLEGI állapot — mit írnánk felül? ───────────────────
SELECT 20,
       '2. JELENLEGI ÁLLAPOT (szamadasicel)',
       s.id::text,
       ('type=' || COALESCE(s.type, '?')
        || ' · belsotetel=' || COALESCE(s.belsotetel, '### NULL ###')
        || ' · aktiv=' || s.aktiv::text)::text,
       COALESCE(s.nev, '')::text
  FROM public.szamadasicel s
 WHERE s.id IN ('300.01','301.01','301.02','400.01','401.01','401.02','402.02',
                '100','100.01','100.02','100.51','100.52')

UNION ALL
-- ── 3. SZAKASZ: a JUNCTION-táblák jelölése (ezek MÁR ki vannak töltve) ────
--     Ez erősíti meg, hogy a `belsotetel` ÖNMAGÁRA mutat, nem a pár kódjára:
--     a 181-es sor id_szamadasicel = 301.01 ÉS belsotetel = 301.01.
SELECT 30,
       '3. JUNCTION-TÁBLÁK (minta a helyes kitöltésre)',
       (x.tabla || ' #' || x.id::text)::text,
       ('kód=' || x.kod || ' · belsotetel=' || COALESCE(x.bt, 'NULL')
        || ' · aktiv=' || x.aktiv::text)::text,
       x.nev::text
  FROM (
        SELECT 'befizetescel'::text AS tabla, b.id, b.id_szamadasicel::text AS kod,
               b.belsotetel::text AS bt, b.aktiv, b.nev::text AS nev
          FROM public.befizetescel b
         WHERE b.id_szamadasicel IN ('300.01','301.01','301.02','400.01','401.01','401.02','402.02')
        UNION ALL
        SELECT 'kiadascel'::text, k.id, k.id_szamadasicel::text,
               k.belsotetel::text, k.aktiv, k.nev::text
          FROM public.kiadascel k
         WHERE k.id_szamadasicel IN ('300.01','301.01','301.02','400.01','401.01','401.02','402.02')
       ) x

UNION ALL
-- ── 4. SZAKASZ: ⚠️ VESZÉLYES-E a 3xx/4xx előtag-szabály? ─────────────────
--     A jelentések MINDEN 3-mal vagy 4-gyel kezdődő kódot belső mozgásnak
--     tekintenek. Ha van OLYAN VALÓDI bevétel/kiadás kód, ami így kezdődik,
--     az TÉVESEN kiesik a számadásból — ez lenne a legsúlyosabb hiba.
SELECT 40,
       '4. ⚠️ MINDEN 3xx/4xx KÓD A KATALÓGUSBAN',
       s.id::text,
       ('type=' || COALESCE(s.type, '?') || ' · aktiv=' || s.aktiv::text
        || ' · belsotetel=' || COALESCE(s.belsotetel, 'NULL'))::text,
       ('nev: ' || COALESCE(s.nev, '')
        || ' | HASZNÁLAT: ' ||
        (SELECT count(*) FROM public.befizetes b
           JOIN public.befizetescel bc ON bc.id = b.id_befizetescel
          WHERE bc.id_szamadasicel = s.id AND b.deleted = false)::text
        || ' bev + ' ||
        (SELECT count(*) FROM public.kiadas k
           JOIN public.kiadascel kc ON kc.id = k.id_kiadascel
          WHERE kc.id_szamadasicel = s.id AND k.deleted = false)::text
        || ' kiad')::text
  FROM public.szamadasicel s
 WHERE s.id ~ '^[34]'

) AS osszes
ORDER BY sorrend, targy;
