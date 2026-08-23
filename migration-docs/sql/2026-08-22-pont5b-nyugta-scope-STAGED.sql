-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ⛔⛔ STAGED — NE FUTTASD! ENDRE DÖNTÉSÉRE ÉS KÜLÖN KÖRRE VÁR ⛔⛔        ║
-- ║ Megyei / kerületi NYUGTA-KIÁLLÍTÁS — oblio_szamlak scope   2026-08-22    ║
-- ║ Fájl: migration-docs/sql/2026-08-22-pont5b-nyugta-scope-STAGED.sql       ║
-- ║ (Az ÉSZREVÉTELEK-TERV-2026-08-22 5. pontja — 5b/2b fázis)                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⛔ EZ A FÁJL SZÁNDÉKOSAN NEM FUTTATHATÓ ÁLLAPOTBAN VAN.
--    Az 1. szakasz egy `RAISE EXCEPTION`-nal KEZDŐDIK, ami feltétel nélkül
--    megállítja a tranzakciót. Ha Endre úgy dönt, hogy a megyei/kerületi
--    nyugta-kiállítás megépül, az AKKORI kör veszi ki ezt a zárat — együtt az
--    RLS-lábakkal és az új RPC-vel, amik NÉLKÜL a séma-módosítás ADATVESZTŐ.
--
-- ⚠️ MIÉRT KÜLÖN KÖR (Endre D4 döntése, 2026-08-22):
--    „Előbb 5a + 2a; a 2b KÜLÖN kör."
--    A KÓD NEM FÜGG ETTŐL A FÁJLTÓL: a 2026-08-22-i szelet gyülekezeti szinten
--    tölti ki a partner CIF-jét (`klienesseg_cui`) — arra SEMMILYEN SQL nem
--    kell, az oszlop 2025 óta létezik. A megyei/kerületi nyugta-kiállítás
--    továbbra sem létezik, és ez a fájl önmagában NEM is hozná létre.
--
-- ════════════════════════════════════════════════════════════════════════════
-- A HÁROM BLOKKOLÓ, AMI MIATT MA FIZIKAILAG NEM MENTHETŐ FELSŐ SZINTŰ NYUGTA
-- ════════════════════════════════════════════════════════════════════════════
--   1. `oblio_szamlak.congregation_id` NOT NULL + FK a `congregations`-re
--      → egy megyei nyugta beszúrása 23502-vel (not-null violation) elhasal.
--   2. A `next_chitanta_full(p_congregation_id, p_szamla_datum)` RPC KIZÁRÓLAG
--      gyülekezet-azonosítóra dolgozik (a nyugtatömb is arra van kötve).
--   3. Az RLS-policy is kizárólag a `congregation_id`-re épül.
--
-- ⛔⛔ A LEGVESZÉLYESEBB CSAPDA — EZÉRT NEM ELÉG A DROP NOT NULL:
--    Ha valaki csak a `DROP NOT NULL`-t futtatja le, a séma „engedékennyé"
--    válik, de a MAI RLS-policy egy NULL `congregation_id`-jű sorra nem
--    „tagad szépen": a `congregation_id = ANY(current_user_congregation_ids())`
--    feltétel NULL-lal NULL-t ad, ami NEM igaz → A SOR LÁTHATATLANNÁ VÁLIK.
--    Vagyis a nyugta beszúródna (hivatalos, sorszámozott okirat!), de SENKI
--    nem látná és nem tudná kinyomtatni — miközben a nyugtatömb sorszáma már
--    elfogyott. Hézag a hézagmentesnek kötelezett számsorban, adóhatóság felé
--    kimutatható. EZÉRT: az RLS-lábaknak UGYANABBAN a migrációban kell
--    elkészülniük, mint a séma-lazításnak.
--
-- ⚠️ TÖRTÉNETI HŰSÉG: a nyugtán a partner CIF-je és címe PILLANATFELVÉTEL —
--    értékként mentve, sosem futásidejű JOIN-nal. Ez a 2026-08-22-i kód-szelet
--    már így csinálja (chitanta-actions.ts), és a felső szintű kiállításnak is
--    így KELL majd. Egy „szebb" JOIN visszamenőleg átírná a már kiadott,
--    aláírt nyugták képét.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIT CSINÁLNA EZ A FÁJL (ha a zárat kivennék) — ÉS MI HIÁNYZIK MÉG BELŐLE
-- ════════════════════════════════════════════════════════════════════════════
--   1/A) diocese_id / district_id oszlop az oblio_szamlak-on (FK-kkal)
--   1/B) `congregation_id` DROP NOT NULL
--   1/C) „pontosan egy scope" CHECK — NOT VALID alakban (nem zárolja a táblát,
--        és NEM bukik el a meglévő ~N ezer soron), majd KÜLÖN VALIDATE lépés
--   1/D) részleges indexek a két új oszlopra
--
--   ⛔ AMI MÉG HIÁNYZIK, ÉS A KÖVETKEZŐ KÖR DOLGA (ezért staged a fájl):
--      · RLS: a meglévő gyülekezeti policy-k MELLÉ megyei + kerületi lábak,
--        a kanonikus, szerep-szűrt hatókör-függvényekkel
--        (current_user_diocese_olvaso_ids / current_user_district_olvaso_ids),
--        MINDEGYIK `COALESCE(…, '{}'::uuid[])`-cel fail-closed.
--      · GRANT USAGE/SELECT ellenőrzés minden hívott függvényre — RLS-policy a
--        HÍVÓ szerepében fut, GRANT nélkül a policy nem tagad, hanem HIBÁZIK
--        (403). (Rögzített hibaosztály.)
--      · ÚJ `next_chitanta_full_scoped(...)` RPC. ⛔ A RÉGI `next_chitanta_full`
--        ÁTÍRÁSA TILOS: az ÉLŐ út, minden gyülekezeti nyugta rajta megy.
--      · Nyugtatömb-kezelés felső szinten (a `tomb_id` ma gyülekezet-kötött).
--      · `backup_table_policy` felülvizsgálat: az oblio_szamlak MA
--        `hatokor='gyulekezet'` szerint mentődik; NULL congregation_id-jű
--        sorok a gyülekezeti mentés-fájlból KIMARADNÁNAK.
--
-- ════════════════════════════════════════════════════════════════════════════



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS               EZ BIZTONSÁGOS, FUTTATHATÓ.   ║
-- ║ EGYETLEN SELECT. Semmit nem módosít. (A döntés-előkészítéshez.)          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '0/A · BLOKKOLÓ 1' AS szakasz,
       'oblio_szamlak.congregation_id — NOT NULL?' AS mit,
       COALESCE((SELECT CASE WHEN c.is_nullable = 'NO'
                             THEN '⛔ NOT NULL — felső szintű nyugta ma FIZIKAILAG nem menthető'
                             ELSE '✅ nullable' END
                 FROM information_schema.columns c
                 WHERE c.table_schema='public' AND c.table_name='oblio_szamlak'
                   AND c.column_name='congregation_id'),
                '⛔ nincs ilyen oszlop / tábla') AS ertek,
       'A DROP NOT NULL ÖNMAGÁBAN VESZÉLYES: RLS-lábak nélkül a NULL-scope-ú sor LÁTHATATLANNÁ válik, miközben a nyugtaszám már elfogyott.' AS teendo

UNION ALL
SELECT 2, '0/A · SCOPE-OSZLOPOK',
       'Van-e már diocese_id / district_id az oblio_szamlak-on?',
       (SELECT COALESCE(string_agg(c.column_name, ', ' ORDER BY c.column_name), 'egyik sincs')
        FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name='oblio_szamlak'
          AND c.column_name IN ('diocese_id','district_id')),
       'Várt (ma): „egyik sincs". Ha valamelyik MÉGIS ott van, valaki félig lefuttatta ezt a kört — ELŐBB jelezd, ne futtass semmit.'

UNION ALL
SELECT 3, '0/A · BLOKKOLÓ 2',
       'A next_chitanta_full RPC paraméterei',
       COALESCE((SELECT pg_get_function_identity_arguments(p.oid)
                 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='next_chitanta_full' LIMIT 1),
                '⛔ nincs ilyen függvény'),
       '⛔ A RÉGI RPC ÁTÍRÁSA TILOS — ez az ÉLŐ út, minden gyülekezeti nyugta rajta megy. A felső szintnek ÚJ, külön nevű RPC kell (next_chitanta_full_scoped).'

UNION ALL
SELECT 4, '0/A · BLOKKOLÓ 3 · RLS',
       'Hány RLS-policy van ma az oblio_szamlak-on?',
       (SELECT count(*)::text || ' policy: '
             || COALESCE(string_agg(pol.polname, ', ' ORDER BY pol.polname), '—')
        FROM pg_policy pol
        WHERE pol.polrelid = to_regclass('public.oblio_szamlak')),
       'Mindegyiket ÁT KELL NÉZNI: amelyik `congregation_id`-re épül, ahhoz megyei + kerületi LÁB kell — ugyanabban a migrációban, mint a séma-lazítás.'

UNION ALL
SELECT 5, '0/A · MÉRET',
       'Hány nyugta/számla sor van ma? (a NOT VALID CHECK indoka)',
       (SELECT count(*)::text || ' sor · ebből chitanta_papir: '
             || count(*) FILTER (WHERE tipus='chitanta_papir')::text
        FROM public.oblio_szamlak),
       'A CHECK-et NOT VALID alakban vesszük fel (nem zárolja a táblát és nem bukik el a meglévő sorokon), a VALIDATE külön, terhelés-mentes időben fut.'

UNION ALL
SELECT 6, '0/A · ⛔ A KULCS-ELLENŐRZÉS',
       'Hány soron NULL a congregation_id? (a VALIDATE előfeltétele)',
       (SELECT count(*)::text || ' sor'
        FROM public.oblio_szamlak
        WHERE congregation_id IS NULL),
       '⛔ Várt: 0 sor. Ha NEM 0, akkor MÁR VANNAK hatókör nélküli — vagyis a mai RLS mellett LÁTHATATLAN — nyugták. Ilyenkor NE menj tovább: előbb ki kell deríteni, honnan jöttek, és melyik szinthez tartoznak.'

UNION ALL
SELECT 7, '0/A · MENTÉS-BESOROLÁS',
       'oblio_szamlak besorolása a backup_table_policy-ban',
       COALESCE((SELECT 'hatokor=' || COALESCE(b.hatokor,'—')
                      || ' · reteg=' || COALESCE(b.reteg::text,'—')
                 FROM public.backup_table_policy b WHERE b.tabla='oblio_szamlak'),
                '⛔ NINCS besorolva'),
       'Ha hatokor=gyulekezet: a NULL congregation_id-jű (felső szintű) nyugták KIMARADNÁNAK a gyülekezeti mentés-fájlból. A besorolást ugyanabban a körben kell rendezni.'

ORDER BY 1;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A MIGRÁCIÓ VÁZLATA        ⛔ ZÁROLVA — NE VEDD KI A ZÁRAT!  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ⛔⛔ FELTÉTEL NÉLKÜLI MEGÁLLÍTÓ ZÁR ⛔⛔
-- Ez a sor SZÁNDÉKOSAN áll itt. Amíg Endre nem döntött, és amíg az RLS-lábak
-- + az új RPC nem készültek el UGYANEBBEN a fájlban, a séma lazítása
-- adatvesztő (láthatatlan, de sorszámot fogyasztó nyugta). Aki kiveszi:
-- előbb olvassa el a fájl fejlécében a „legveszélyesebb csapdát".
DO $$
BEGIN
  RAISE EXCEPTION 'STAGED FÁJL: a megyei/kerületi nyugta-kiállítás KÜLÖN kör (Endre D4 döntése). A séma-lazítás RLS-lábak és új RPC nélkül LÁTHATATLAN, de sorszámot fogyasztó nyugtákat gyártana. Ne futtasd.';
END $$;

-- ── 1/A · Scope-oszlopok (VÁZLAT) ──────────────────────────────────────────
ALTER TABLE public.oblio_szamlak
  ADD COLUMN IF NOT EXISTS diocese_id  uuid REFERENCES public.dioceses(id),
  ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES public.districts(id);

-- ── 1/B · A gyülekezet-azonosító opcionálissá tétele (VÁZLAT) ──────────────
ALTER TABLE public.oblio_szamlak
  ALTER COLUMN congregation_id DROP NOT NULL;

-- ── 1/C · „Pontosan egy scope" őr — NOT VALID, majd KÜLÖN VALIDATE ─────────
-- MIÉRT NOT VALID: a sima ADD CONSTRAINT végigolvassa a TELJES táblát
-- ACCESS EXCLUSIVE zár alatt (élő nyugta-tábla!), és ha egyetlen régi sor sem
-- felel meg, az EGÉSZ migráció visszagördül. NOT VALID-dal az ÚJ és MÓDOSÍTOTT
-- sorokra azonnal érvényes, a meglévő állományt pedig külön, terhelés-mentes
-- időben ellenőrizzük.
ALTER TABLE public.oblio_szamlak
  ADD CONSTRAINT oblio_szamlak_pontosan_egy_scope
  CHECK (num_nonnulls(congregation_id, diocese_id, district_id) = 1) NOT VALID;

-- ── 1/D · Részleges indexek (VÁZLAT) ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_oblio_szamlak_diocese
  ON public.oblio_szamlak(diocese_id)  WHERE diocese_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oblio_szamlak_district
  ON public.oblio_szamlak(district_id) WHERE district_id IS NOT NULL;

-- ⛔ ITT KELLENE JÖNNIE, UGYANEBBEN A TRANZAKCIÓBAN:
--    · GRANT USAGE/SELECT + EXECUTE minden hívott hatókör-függvényre
--    · a megyei és kerületi RLS-lábak (SELECT / INSERT / UPDATE / DELETE)
--    · a next_chitanta_full_scoped RPC + GRANT
--    Enélkül a fenti négy lépés ADATVESZTŐ. Ezért zárt a fájl.

COMMIT;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1b. SZAKASZ — KÜLÖN VALIDATE           ⛔ CSAK a 0/A 6. sor = 0 UTÁN!    ║
-- ║ Külön futtatás, külön tranzakció — nem blokkolja az írásokat.            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ALTER TABLE public.oblio_szamlak
--   VALIDATE CONSTRAINT oblio_szamlak_pontosan_egy_scope;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS (a majdani körhöz)                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- SELECT 1 AS sorszam, '2 · KULCS-ELLENŐRZÉS' AS szakasz,
--        'Maradt-e hatókör nélküli (láthatatlan) nyugta?' AS mit,
--        (SELECT count(*)::text || ' sor'
--         FROM public.oblio_szamlak
--         WHERE num_nonnulls(congregation_id, diocese_id, district_id) <> 1) AS ertek,
--        '⛔ Várt: 0 sor. Bármi más = hivatalos, sorszámozott okirat, amit a felület nem lát.' AS teendo
-- UNION ALL
-- SELECT 2, '2 · CHECK ÁLLAPOTA',
--        'oblio_szamlak_pontosan_egy_scope validált?',
--        COALESCE((SELECT CASE WHEN con.convalidated THEN '✅ VALIDATED' ELSE '⚠️ NOT VALID (a régi sorokra még nem ellenőrzött)' END
--                  FROM pg_constraint con
--                  WHERE con.conrelid = to_regclass('public.oblio_szamlak')
--                    AND con.conname  = 'oblio_szamlak_pontosan_egy_scope'),
--                 '⛔ nincs ilyen CHECK'),
--        'A NOT VALID állapot NEM hiba — csak azt jelenti, hogy a VALIDATE (1b szakasz) még nem futott.'
-- ORDER BY 1;
