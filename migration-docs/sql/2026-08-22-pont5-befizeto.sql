-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ KERÜLETI BEFIZETŐ-FK — district_befizetes.befizeto_diocese_id 2026-08-22 ║
-- ║ Fájl: migration-docs/sql/2026-08-22-pont5-befizeto.sql                   ║
-- ║ (Az ÉSZREVÉTELEK-TERV-2026-08-22 5. pontja — 5a fázis)                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- MIÉRT: a felső szintű „Tétel rögzítése" befizető-keresője mostantól VALÓDI
-- partnereket ajánl. A hierarchia:
--   · az EGYHÁZMEGYÉBE  a GYÜLEKEZETEK  fizetnek → diocese_befizetes.befizeto_congregation_id  ✅ MÁR LÉTEZIK
--   · az EGYHÁZKERÜLETBE az EGYHÁZMEGYÉK fizetnek → district_befizetes.befizeto_diocese_id     ⛔ EZ HIÁNYZIK
--
-- A `district_befizetes` a `diocese_befizetes` betűhű tükre, ezért örökölte a
-- `befizeto_congregation_id` oszlopot — de egy EGYHÁZMEGYE azonosítóját az nem
-- hordozhatja. Egy gyülekezet-FK odaírása a kerületi soron nem hiányos adat
-- lenne, hanem HAMIS. Ezért kap a tábla SAJÁT, szemantikailag helyes oszlopot.
--
-- ⚠️ A KÓD ENÉLKÜL IS MŰKÖDIK (nincs blokkoló): az
--    `insertFelsoSzintIncomeRecord` (apps/web/app/(dashboard)/penzugy/actions.ts)
--    séma-drift ágon esik vissza az oszlop nélküli alakra, ha a PostgREST
--    „column does not exist"-et ad. Ilyenkor a KÖTELEZŐ `forrasa` szabad szöveg
--    hordozza, melyik egyházmegye fizetett — csak a gépi kapcsolat hiányzik.
--    Ez a fájl azt a gépi kapcsolatot teremti meg.
--    (Memória-hibaosztály: „a migration-fájl NEM bizonyíték" — a kód SOHA nem
--    feltételezi, hogy egy SQL lefutott; a fallback ezért van.)
--
-- MIT CSINÁL (egyetlen tranzakcióban):
--   1/A) befizeto_diocese_id uuid NULL REFERENCES dioceses(id) ON DELETE SET NULL
--   1/B) részleges index (csak a kitöltött sorokra)
--   1/C) magyarázó COMMENT az oszlopon + a `forrasa` megjegyzésének frissítése
--        (az ma azt állítja, hogy külön befizeto_diocese_id „TUDATOSAN nincs")
--
-- ⚠️ AMIT NEM CSINÁL — ÉS MIÉRT:
--   · NEM dobja el és NEM írja át a `befizeto_congregation_id` oszlopot. Az a
--     megyei tükör része; egy meglévő oszlop eldobása élő pénzügyi táblán
--     indokolatlan kockázat. A kód a kerületi ágon egyszerűen nem címzi meg.
--   · NEM NYÚL a `diocese_befizetes`-hez — ott a `befizeto_congregation_id`
--     már 2026-04-18 óta létezik (fazis8), csak eddig hardkódolt NULL ment bele.
--     A javítás ott TISZTÁN KÓD-oldali, SQL nélkül.
--   · NEM állít NOT NULL-t. A kerületi bevétel nagy része NEM egyházmegyétől
--     jön (állami támogatás, kamat, bérleti díj) — kötelezővé tenni néma
--     23502-t okozna minden ilyen soron.
--   · ⛔ NEM nyúl az `oblio_szamlak`-hoz. A megyei/kerületi NYUGTA-KIÁLLÍTÁS
--     (5b/2b fázis) Endre D4 döntése szerint KÜLÖN kör:
--     `2026-08-22-pont5b-nyugta-scope-STAGED.sql`.
--
-- ⚠️ ÚJ TÁBLA NEM JÖN LÉTRE → a `backup_table_policy` besorolása NEM változik,
--    tehát a „besorolatlan tábla → a napi mentés MINDEN gyülekezetnél leáll"
--    csapda itt nem tud elsülni.
--
-- FUTTATÁSI SORREND (a Supabase Studio csak az UTOLSÓ utasítás eredményét mutatja!):
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS. Egyetlen SELECT, semmit nem módosít.
--   2.  1. SZAKASZ — A MIGRÁCIÓ. Egyetlen tranzakció (BEGIN … COMMIT).
--   3.  2. SZAKASZ — ELLENŐRZÉS. Egyetlen SELECT — az eredményt küldd vissza.
--
-- IDEMPOTENS: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS + COMMENT
-- — akárhányszor újrafuttatható.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ║ EGYETLEN SELECT. Semmit nem módosít.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '0/A · ELŐFELTÉTEL' AS szakasz,
       'Létezik-e a public.district_befizetes tábla?' AS mit,
       CASE WHEN to_regclass('public.district_befizetes') IS NULL
            THEN '⛔ NINCS'
            ELSE '✅ van' END AS ertek,
       'Ha ⛔: ELŐBB a 2026-08-17-egyhazkeruleti-S5b-penzugy-tablak.sql fusson le. Az 1. szakasz őrszeme enélkül hibával leáll.' AS teendo

UNION ALL
SELECT 2, '0/A · ELŐFELTÉTEL',
       'Létezik-e a public.dioceses tábla (az FK célja)?',
       CASE WHEN to_regclass('public.dioceses') IS NULL THEN '⛔ NINCS' ELSE '✅ van' END,
       'Ha ⛔: az FK nem hozható létre. A dioceses az alap-séma része — ilyenkor rossz adatbázison állsz.'

-- ── 0/B · A CÉL-OSZLOP mai állapota (information_schema — nem dump!) ────────
UNION ALL
SELECT 10, '0/B · CÉL-OSZLOP',
       'district_befizetes.befizeto_diocese_id',
       COALESCE((SELECT 'MÁR LÉTEZIK · típus=' || c.data_type || ' · nullable=' || c.is_nullable
                 FROM information_schema.columns c
                 WHERE c.table_schema = 'public'
                   AND c.table_name   = 'district_befizetes'
                   AND c.column_name  = 'befizeto_diocese_id'),
                'még nincs — az 1/A pótolja'),
       'Ha MÁR LÉTEZIK: a migráció idempotens, nyugodtan újrafuttatható (nem ír felül semmit).'

-- ── 0/C · Az ÖRÖKÖLT oszlop — NEM bántjuk, csak megnézzük ──────────────────
UNION ALL
SELECT 11, '0/C · ÖRÖKÖLT OSZLOP',
       'district_befizetes.befizeto_congregation_id (a megyei tükörből)',
       COALESCE((SELECT 'létezik · nullable=' || c.is_nullable
                 FROM information_schema.columns c
                 WHERE c.table_schema = 'public'
                   AND c.table_name   = 'district_befizetes'
                   AND c.column_name  = 'befizeto_congregation_id'),
                'nincs (a tábla nem a megyei tükör alakja?)'),
       'Ez az oszlop MARAD, érintetlenül. A kerületi kód SZÁNDÉKOSAN nem címzi meg: kerületi soron a gyülekezet-FK HAMIS adat lenne.'

-- ⚠️ A 0. SZAKASZ SZÁNDÉKOSAN NEM OLVAS EGYETLEN PÉNZÜGYI TÁBLÁBÓL SEM.
--    Egy `SELECT … FROM public.district_befizetes` HIÁNYZÓ táblánál nem
--    „üres eredményt" ad, hanem PARSE-hibával eldobja az EGÉSZ 0. szakaszt —
--    vagyis pont az állapotfelmérést veszítenénk el, ami megmondaná, mi a baj.
--    (Ugyanez a tanulság a 2026-08-17-egyhazkeruleti-S5a fájlban.) A sor-számok
--    a 2. szakaszban vannak, ahol az 1/0 őrszem már igazolta a tábla létét.

-- ── 0/D · A megyei párja — a kód-oldali javítás célpontja (SQL nem kell) ────
UNION ALL
SELECT 20, '0/D · MEGYEI PÁRJA',
       'diocese_befizetes.befizeto_congregation_id',
       COALESCE((SELECT 'létezik · nullable=' || c.is_nullable
                 FROM information_schema.columns c
                 WHERE c.table_schema = 'public'
                   AND c.table_name   = 'diocese_befizetes'
                   AND c.column_name  = 'befizeto_congregation_id'),
                '⛔ NINCS — akkor a megyei ág is SQL-t igényel'),
       'Várt: létezik (2026-04-18-egyhazmegyei-penzugy-fazis8.sql). A megyei javítás ezért TISZTÁN kód-oldali: az insert eddig hardkódolt NULL-t írt bele.'

ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A MIGRÁCIÓ                                 FUTTATÁS: 2.     ║
-- ║ EGYETLEN TRANZAKCIÓ. Az őrszem fail-closed módon MEGÁLL, ha az élő DB    ║
-- ║ nem a várt állapotban van.                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ── 1/0 · ŐRSZEM (fail-closed) ─────────────────────────────────────────────
-- „A migration-fájl NEM bizonyíték": nem feltételezzük, hogy az S5b lefutott.
DO $$
BEGIN
  IF to_regclass('public.district_befizetes') IS NULL THEN
    RAISE EXCEPTION 'A public.district_befizetes tábla NEM létezik. Előbb a 2026-08-17-egyhazkeruleti-S5b-penzugy-tablak.sql fusson le.';
  END IF;
  IF to_regclass('public.dioceses') IS NULL THEN
    RAISE EXCEPTION 'A public.dioceses tábla NEM létezik — az FK célja hiányzik. Rossz adatbázison állsz?';
  END IF;
END $$;

-- ── 1/A · A befizető EGYHÁZMEGYE azonosítója ───────────────────────────────
ALTER TABLE public.district_befizetes
  ADD COLUMN IF NOT EXISTS befizeto_diocese_id uuid
    REFERENCES public.dioceses(id) ON DELETE SET NULL;

-- ⚠️ ON DELETE SET NULL, NEM CASCADE: egy egyházmegye törlése SOHA nem
--    törölhet KIADOTT, hivatalos kerületi bevételi sorokat. A kapcsolat
--    elszakad, de az összeg, a dátum, az iratszám és a `forrasa` szabad szöveg
--    (ami a nevet is hordozza) a helyén marad. Ugyanez a minta, mint a megyei
--    befizeto_congregation_id-n (2026-04-18-…-fazis8.sql:125).

-- ── 1/B · Részleges index — csak a kitöltött sorokra ───────────────────────
-- A kerületi bevételek TÖBBSÉGE nem egyházmegyétől jön (állami támogatás,
-- kamat, bérleti díj), ezért a NULL-ok indexelése fölösleges hely és írási
-- költség. A `WHERE … IS NOT NULL` a megyei párja mintája.
CREATE INDEX IF NOT EXISTS idx_district_befizetes_befizeto_diocese
  ON public.district_befizetes(befizeto_diocese_id)
  WHERE befizeto_diocese_id IS NOT NULL;

-- ── 1/C · Magyarázó megjegyzések ───────────────────────────────────────────
COMMENT ON COLUMN public.district_befizetes.befizeto_diocese_id IS
  'MELYIK EGYHÁZMEGYE fizetett be (opcionális). Az egyházkerületbe EGYHÁZMEGYÉK fizetnek — a megyei tükörből örökölt befizeto_congregation_id egy megye azonosítóját NEM hordozhatja, ezért van ez a külön oszlop (2026-08-22, 5. pont / 5a). A felület a scope-tudatos befizető-keresőből (searchIncomePartners) tölti; a szerver a SAJÁT kerületére visszaellenőrzi az azonosítót (fail-closed), a kliens-prop önmagában nem bizonyíték. ON DELETE SET NULL: egy megye törlése nem törölhet kiadott bevételi sort.';

COMMENT ON COLUMN public.district_befizetes.befizeto_congregation_id IS
  'A megyei tükörből ÖRÖKÖLT oszlop — a kerületi ágon SZÁNDÉKOSAN üresen marad. Kerületi soron egy gyülekezet-FK nem hiányos, hanem HAMIS adat lenne (a kerületbe egyházmegyék fizetnek). A „ki fizetett" 2026-08-22 óta a befizeto_diocese_id-ben van; a kötelező forrasa szabad szöveg pedig mindkét esetben hordozza a hivatalos nevet.';

COMMENT ON COLUMN public.district_befizetes.forrasa IS
  'KÖTELEZŐ szabad szöveg: kitől jött a pénz — a hivatalos név (a szerver a feloldott partner nevét írja ide, nem azt, amit a kliens küldött). ⚠️ 2026-08-22: a korábbi megjegyzés azt állította, hogy külön befizeto_diocese_id oszlop „TUDATOSAN nincs" — ez már NEM igaz, az oszlop létrejött. A forrasa attól még KÖTELEZŐ marad: a kerületi bevétel nagy része nem egyházmegyétől jön, és ilyenkor csak ez a mező mondja meg, ki fizetett.';

COMMIT;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT. Az eredményt küldd vissza.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '2 · OSZLOP' AS szakasz,
       'district_befizetes.befizeto_diocese_id létrejött?' AS mit,
       COALESCE((SELECT '✅ ' || c.data_type || ' · nullable=' || c.is_nullable
                 FROM information_schema.columns c
                 WHERE c.table_schema = 'public'
                   AND c.table_name   = 'district_befizetes'
                   AND c.column_name  = 'befizeto_diocese_id'),
                '⛔ NINCS — az 1/A nem futott le') AS ertek,
       'Várt: ✅ uuid · nullable=YES. NOT NULL SZÁNDÉKOSAN nincs — a kerületi bevétel nagy része nem egyházmegyétől jön.' AS teendo

UNION ALL
SELECT 2, '2 · IDEGEN KULCS',
       'Az FK a public.dioceses(id)-re mutat, ON DELETE SET NULL-lal?',
       COALESCE((SELECT pg_get_constraintdef(con.oid)
                 FROM pg_constraint con
                 WHERE con.conrelid = to_regclass('public.district_befizetes')
                   AND con.contype  = 'f'
                   AND con.conkey @> ARRAY[(SELECT a.attnum FROM pg_attribute a
                                            WHERE a.attrelid = to_regclass('public.district_befizetes')
                                              AND a.attname  = 'befizeto_diocese_id')]
                 LIMIT 1),
                '⛔ NINCS FK'),
       'Várt: FOREIGN KEY (befizeto_diocese_id) REFERENCES dioceses(id) ON DELETE SET NULL. ⚠️ A constraintet OSZLOP (conkey) szerint keressük, NEM pg_get_constraintdef LIKE-kal — az a memóriában rögzített csapda (más constraintet találna el).'

UNION ALL
SELECT 3, '2 · INDEX',
       'idx_district_befizetes_befizeto_diocese (részleges) létrejött?',
       COALESCE((SELECT '✅ ' || i.indexdef
                 FROM pg_indexes i
                 WHERE i.schemaname = 'public'
                   AND i.tablename  = 'district_befizetes'
                   AND i.indexname  = 'idx_district_befizetes_befizeto_diocese'),
                '⛔ NINCS'),
       'Várt: ✅ … WHERE (befizeto_diocese_id IS NOT NULL). Ha a WHERE hiányzik, egy korábbi, TELJES index él ezen a néven — az nem hiba, csak nagyobb.'

UNION ALL
SELECT 4, '2 · MEGJEGYZÉS',
       'Van-e magyarázó COMMENT az új oszlopon?',
       COALESCE(left(col_description(to_regclass('public.district_befizetes'),
                     (SELECT a.attnum FROM pg_attribute a
                      WHERE a.attrelid = to_regclass('public.district_befizetes')
                        AND a.attname  = 'befizeto_diocese_id')), 80) || '…',
                '⛔ nincs megjegyzés'),
       'A megjegyzés a KÖVETKEZŐ körnek szól: enélkül valaki azt hihetné, hogy a befizeto_congregation_id a kerületi befizetőt hordozza.'

UNION ALL
SELECT 5, '2 · ÖRÖKÖLT OSZLOP SÉRTETLEN',
       'district_befizetes.befizeto_congregation_id megvan még?',
       COALESCE((SELECT '✅ érintetlen · nullable=' || c.is_nullable
                 FROM information_schema.columns c
                 WHERE c.table_schema = 'public'
                   AND c.table_name   = 'district_befizetes'
                   AND c.column_name  = 'befizeto_congregation_id'),
                'nincs (nem baj, ha eleve nem volt)'),
       'REGRESSZIÓ-ŐR: ez a fájl SEMMILYEN meglévő oszlopot nem dob el és nem szűkít. Ha ez ⛔-ra vált, valami MÁS futott le.'

UNION ALL
SELECT 6, '2 · MEGYEI TÜKÖR SÉRTETLEN',
       'diocese_befizetes.befizeto_congregation_id megvan még?',
       COALESCE((SELECT '✅ érintetlen · nullable=' || c.is_nullable
                 FROM information_schema.columns c
                 WHERE c.table_schema = 'public'
                   AND c.table_name   = 'diocese_befizetes'
                   AND c.column_name  = 'befizeto_congregation_id'),
                '⛔ NINCS'),
       'REGRESSZIÓ-ŐR: a megyei szint élesben fut 2026-08-15 óta, és ez a fájl hozzá sem nyúlt.'

UNION ALL
SELECT 7, '2 · ADAT',
       'Hány kerületi bevételi soron van kitöltve a befizető egyházmegye?',
       (SELECT count(*) FILTER (WHERE befizeto_diocese_id IS NOT NULL)::text
             || ' / ' || count(*)::text || ' sor'
        FROM public.district_befizetes),
       'Közvetlenül a migráció után várhatóan 0 / N — az oszlop az ÚJ rögzítéseknél töltődik. A RÉGI sorokat SZÁNDÉKOSAN nem töltjük vissza a forrasa szövegből: a névre alapozott visszakövetkeztetés hamis kapcsolatot gyárthatna egy hivatalos pénzügyi soron.'

UNION ALL
SELECT 8, '2 · ÖRÖKÖLT OSZLOP · ADAT',
       'Van-e kitöltött befizeto_congregation_id KERÜLETI soron?',
       (SELECT count(*)::text || ' sor'
        FROM public.district_befizetes
        WHERE befizeto_congregation_id IS NOT NULL),
       'Várt: 0 sor. Ha nem 0, valaki gyülekezet-FK-t írt kerületi sorra (HAMIS adat) — jelezd, adat-tisztítás kell, nem séma-módosítás. ⚠️ Ez a lekérdezés SZÁNDÉKOSAN itt van és nem a 0. szakaszban: hiányzó táblánál egy tábla-olvasás PARSE-hibával eldobná az egész állapotfelmérést.'

UNION ALL
SELECT 9, '2 · MENTÉS-BESOROLÁS',
       'Változott-e a district_befizetes mentés-besorolása?',
       COALESCE((SELECT 'hatokor=' || COALESCE(b.hatokor, '—')
                      || ' · reteg=' || COALESCE(b.reteg::text, '—')
                 FROM public.backup_table_policy b
                 WHERE b.tabla = 'district_befizetes'),
                '⛔ NINCS besorolva — a napi mentés MINDEN gyülekezetnél leállhat!'),
       'Új tábla nem jött létre, tehát a besorolásnak VÁLTOZATLANNAL kell lennie. Ha ⛔: az a 2026-08-17-es kör hiánya, nem ezé — de akkor is pótolandó.'

ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ AMI EBBŐL A KÖRBŐL KIMARADT (a következő kör dolga)                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- 1. ⛔ MEGYEI / KERÜLETI NYUGTA-KIÁLLÍTÁS (5b/2b fázis) — Endre D4 döntése
--    szerint KÜLÖN kör. Az `oblio_szamlak.congregation_id` NOT NULL + FK a
--    congregations-re, a `next_chitanta_full` RPC csak congregation_id-re
--    dolgozik, és az RLS is kizárólag arra épül. A staged vázlat:
--    `2026-08-22-pont5b-nyugta-scope-STAGED.sql` — NE FUTTASD, döntésre vár.
-- 2. A GYÜLEKEZETI nyugta partner-CIF-je (5b/2a fázis) SQL NÉLKÜL kész: a
--    `klienesseg_cui` oszlop már létezik, csak eddig senki nem töltötte.
-- 3. A RÉGI (2026-08-22 előtti) megyei és kerületi bevételi sorok befizető-FK-ja
--    ÜRESEN marad. Ha Endre kéri a visszatöltést, az KÜLÖN, KÉZI egyeztetés:
--    a `forrasa` szabad szövegre alapozott automatikus párosítás egy hivatalos
--    pénzügyi soron hamis kapcsolatot gyárthatna.
