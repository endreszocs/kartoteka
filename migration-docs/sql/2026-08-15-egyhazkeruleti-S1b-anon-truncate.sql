-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ⛔ S1b — AZ anon/authenticated TRUNCATE JOGÁNAK VISSZAVONÁSA   2026-08-15 ║
-- ║ Fájl: migration-docs/sql/2026-08-15-egyhazkeruleti-S1b-anon-truncate.sql ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ FUTTASD LE AZ S1 UTÁN. Az S0 állapotfelmérés hozta felszínre.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIT TALÁLTUNK
-- ════════════════════════════════════════════════════════════════════════════
-- Az S0 0/B szakasza (241-250. sor) kiírta, hogy a `districts` táblán:
--
--     anon          → REFERENCES, TRIGGER, TRUNCATE
--     authenticated → SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
--
-- Az S1 fájl (abban a változatában, ami lefutott) csak a SELECT-et és a három
-- DML-jogot vonta vissza — a TRUNCATE-et NEM. Ez azért baj, mert:
--
--   ⛔ A TRUNCATE-re a Row Level Security SOHA NEM VONATKOZIK.
--
-- Vagyis hiába nincs a `districts`-en egyetlen INSERT/UPDATE/DELETE policy sem
-- (az S0 szerint tényleg nincs — 0/B-230: mindössze 2 SELECT policy), a
-- TRUNCATE joggal rendelkező szerep a TELJES TÖRZSADATOT KIÜRÍTHETI, és ezt
-- semmilyen policy nem akadályozza meg. A `districts` kiürítése az egész
-- rendszert megbénítaná: minden egyházmegye `district_id`-je FK-val mutat rá.
--
-- Ugyanez áll a `dioceses` táblára.
--
-- Ez nem elméleti: a repó MAGA rögzítette ezt a hibaosztályt korábban —
-- `2026-08-10-anon-jogok-vizsgalat-es-visszavonas.sql:25-27`: „A TRUNCATE-re
-- az RLS SOHA nem vonatkozik", és ott a javítás alakja `REVOKE ALL`.
--
-- MIT CSINÁL EZ A FÁJL
--   · A `districts` és a `dioceses` táblán VISSZAVONJA az anon és a
--     PUBLIC MINDEN jogát, majd visszaadja pontosan az oszlop-szintű SELECT-et.
--   · A `authenticated` szereptől visszavonja a TRUNCATE, REFERENCES és
--     TRIGGER jogot (a SELECT/INSERT/UPDATE/DELETE marad — azokat az RLS őrzi).
--   · A többi táblát NEM bántja, de a 0. szakasz MEGMÉRI és felsorolja őket,
--     hogy lásd a teljes képet, és eldönthesd, kell-e átfogó takarítás.
--
-- FUTTATÁSI SORREND:
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS (egyetlen SELECT, semmit nem módosít).
--   2.  1. SZAKASZ — A JAVÍTÁS (egyetlen tranzakció).
--   3.  2. SZAKASZ — ELLENŐRZÉS (egyetlen SELECT — küldd vissza).
--
-- IDEMPOTENS: akárhányszor újrafuttatható.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '0/A · A KÉT ÉRINTETT TÁBLA' AS szakasz,
       'Hány veszélyes jog van MA a districts + dioceses táblán?' AS mit,
       (SELECT count(*)::text FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name IN ('districts','dioceses')
          AND grantee IN ('anon','authenticated','PUBLIC')
          AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')) || ' db' AS ertek,
       'Ezeket vonja vissza az 1. szakasz. A TRUNCATE a legveszélyesebb: az RLS SOHA nem vonatkozik rá.' AS teendo

UNION ALL
SELECT (10 + row_number() OVER (ORDER BY g.table_name, g.grantee, g.privilege_type))::int,
       '0/A · A KÉT ÉRINTETT TÁBLA',
       g.table_name || ' → ' || g.grantee || ' : ' || g.privilege_type,
       CASE WHEN g.privilege_type = 'TRUNCATE'
              THEN '⛔ TRUNCATE — a teljes tábla kiüríthető, RLS NEM véd ellene'
            WHEN g.privilege_type IN ('REFERENCES','TRIGGER')
              THEN '⚠️ ' || g.privilege_type || ' — séma-módosító jog, nem kell'
            ELSE '✅ ' || g.privilege_type || ' (marad, az RLS őrzi)' END,
       'Az 1. szakasz a TRUNCATE/REFERENCES/TRIGGER jogokat viszi el; a SELECT (anon: oszlop-szinten) és a bejelentkezett DML marad.'
FROM information_schema.role_table_grants g
WHERE g.table_schema='public' AND g.table_name IN ('districts','dioceses')
  AND g.grantee IN ('anon','authenticated','PUBLIC')

-- 0/B · A TELJES KÉP: hány MÁS táblán van ugyanez? (csak mérés, nem javítjuk)
UNION ALL
SELECT 100, '0/B · A TELJES KÉP ⚠️',
       'Hány public táblán van az anonnak TRUNCATE joga?',
       (SELECT count(DISTINCT table_name)::text FROM information_schema.role_table_grants
        WHERE table_schema='public' AND grantee='anon' AND privilege_type='TRUNCATE') || ' tábla',
       '⚠️ Ez a Supabase alapértelmezett `GRANT ALL` öröksége. NEM ez a kör okozta, és ez a fájl NEM nyúl hozzájuk — de tudnod kell róla. Átfogó takarítás = külön döntés, külön fájl.'

UNION ALL
SELECT 101, '0/B · A TELJES KÉP ⚠️',
       'Hány public táblán van az authenticated-nek TRUNCATE joga?',
       (SELECT count(DISTINCT table_name)::text FROM information_schema.role_table_grants
        WHERE table_schema='public' AND grantee='authenticated' AND privilege_type='TRUNCATE') || ' tábla',
       'Ugyanaz. A bejelentkezett felhasználó TRUNCATE joga is megkerüli az RLS-t.'

UNION ALL
SELECT 102, '0/B · A TELJES KÉP ⚠️',
       'A 10 legfontosabb törzsadat-tábla, ahol az anonnak TRUNCATE joga van',
       COALESCE((SELECT string_agg(t.tabla, ', ' ORDER BY t.tabla)
                 FROM (VALUES ('districts'),('dioceses'),('congregations'),('profiles'),
                              ('profile_roles'),('szemely'),('befizetes'),('kiadas'),
                              ('szamadasicel'),('leltar_tetelek')) AS t(tabla)
                 WHERE EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                               WHERE g.table_schema='public' AND g.table_name = t.tabla
                                 AND g.grantee='anon' AND g.privilege_type='TRUNCATE')),
                '✅ egyiken sem'),
       '⛔ Amelyik itt szerepel, azt bejelentkezés nélkül ki lehetne üríteni. Ez a fájl ebből CSAK a districts + dioceses párost zárja le — a többiről te döntesz.'

ORDER BY sorszam;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A JAVÍTÁS                                  FUTTATÁS: 2.     ║
-- ║ EGYETLEN TRANZAKCIÓ.                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

DO $truncate_zar$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('districts', 'id, name'),
      ('dioceses',  'id, name, district_id')
    ) AS v(tabla, oszlopok)
  LOOP
    IF to_regclass('public.' || t.tabla) IS NULL THEN
      RAISE EXCEPTION 'FAIL-CLOSED: nincs public.% tábla.', t.tabla;
    END IF;

    -- (1) anon és PUBLIC: MINDEN jog el, majd pontosan a szükséges oszlopok vissza.
    --     A REVOKE ALL a TRUNCATE-et, REFERENCES-t és TRIGGER-t is elviszi.
    EXECUTE format('REVOKE ALL PRIVILEGES ON public.%I FROM PUBLIC', t.tabla);
    EXECUTE format('REVOKE ALL PRIVILEGES ON public.%I FROM anon', t.tabla);
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO anon', t.oszlopok, t.tabla);

    -- (2) authenticated: a séma-módosító és tábla-ürítő jogok el.
    --     A SELECT/INSERT/UPDATE/DELETE MARAD — azokat az RLS őrzi soronként.
    --     ⚠️ A TRUNCATE-et az RLS NEM őrzi, ezért annak mennie kell.
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t.tabla);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t.tabla);

    -- (3) service_role: érintetlen marad (a szerver-oldali munka ezen fut).
    EXECUTE format('GRANT ALL PRIVILEGES ON public.%I TO service_role', t.tabla);

    RAISE NOTICE '✅ %: anon → csak (%) olvasás; authenticated → nincs TRUNCATE.',
                 t.tabla, t.oszlopok;
  END LOOP;
END
$truncate_zar$;

COMMIT;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT (1 + row_number() OVER (ORDER BY p.tabla, p.szerep, p.jog))::int AS sorszam,
       '2/A · TRUNCATE-ŐR ⛔' AS szakasz,
       p.szerep || ' → ' || p.tabla || ' : ' || p.jog AS mit,
       CASE WHEN has_table_privilege(p.szerep, ('public.' || p.tabla)::regclass, p.jog)
            THEN '⛔ MÉG MINDIG MEGVAN'
            ELSE '✅ visszavonva' END AS ertek,
       'Mind a nyolcnak ✅-nek kell lennie. A TRUNCATE-re az RLS SOHA nem vonatkozik.' AS teendo
FROM (VALUES
        ('anon','districts','TRUNCATE'), ('anon','districts','REFERENCES'), ('anon','districts','TRIGGER'),
        ('anon','dioceses','TRUNCATE'),
        ('authenticated','districts','TRUNCATE'), ('authenticated','districts','TRIGGER'),
        ('authenticated','dioceses','TRUNCATE'), ('authenticated','dioceses','TRIGGER')
     ) AS p(szerep, tabla, jog)

UNION ALL
SELECT (20 + row_number() OVER (ORDER BY p.tabla, p.oszlop))::int,
       '2/B · REGRESSZIÓS ŐR — ami MARADNIA kell',
       p.szerep || ' → ' || p.tabla || '.' || p.oszlop || ' olvasás',
       CASE WHEN has_column_privilege(p.szerep, ('public.' || p.tabla)::regclass, p.oszlop, 'SELECT')
            THEN '✅ megvan'
            ELSE '⛔ ELVESZETT — a regisztrációs űrlap elhasal!' END,
       'Ezek kellenek a nyilvános /hozzaferes-kerese legördülőihez. Ha bármelyik ⛔, azonnal szólj.'
FROM (VALUES
        ('anon','districts','id'), ('anon','districts','name'),
        ('anon','dioceses','id'), ('anon','dioceses','name'), ('anon','dioceses','district_id')
     ) AS p(szerep, tabla, oszlop)

UNION ALL
SELECT 40, '2/B · REGRESSZIÓS ŐR — ami MARADNIA kell',
       'A bejelentkezett olvasás és a belső írás megmaradt?',
       CASE WHEN has_table_privilege('authenticated','public.districts'::regclass,'SELECT')
             AND has_table_privilege('authenticated','public.dioceses'::regclass,'SELECT')
             AND has_table_privilege('authenticated','public.dioceses'::regclass,'UPDATE')
            THEN '✅ igen (a megyei beállítás-varázsló továbbra is menteni tud)'
            ELSE '⛔ NEM — túl sokat vontunk vissza!' END,
       '⛔ Ha ⛔: GRANT SELECT, INSERT, UPDATE, DELETE ON public.dioceses TO authenticated; és ugyanez a districts-re.'

UNION ALL
SELECT 41, '2/B · REGRESSZIÓS ŐR — ami MARADNIA kell',
       'A service_role érintetlen?',
       CASE WHEN has_table_privilege('service_role','public.districts'::regclass,'SELECT')
             AND has_table_privilege('service_role','public.dioceses'::regclass,'UPDATE')
            THEN '✅ igen' ELSE '⛔ NEM — a szerver-oldali munka elhasal!' END,
       'A mentés, a seed és minden admin-akció ezen fut.'

UNION ALL
SELECT 50, '2/C · KÉZI PRÓBA',
       'MOST TESZTELD LE (2 perc)',
       'Inkognitó ablak → /hozzaferes-kerese',
       'Az „Egyházkerület" és „Egyházmegye" legördülőnek MEG KELL TELNIE. Ez ugyanaz a próba, mint az S1 után — most újra kell futtatni, mert a GRANT-ok megint változtak.'

ORDER BY sorszam;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ VÉGE. A 0/B szakasz megmutatta, hány MÁS táblán él ugyanez a jog —       ║
-- ║ az átfogó takarítás KÜLÖN döntés (és külön fájl).                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
